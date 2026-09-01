from flask import Flask, render_template_string, request, jsonify, send_from_directory
import json, os, ctypes, subprocess, threading, atexit, shutil, time
import urllib.request, urllib.parse
from datetime import datetime, date, timedelta

app = Flask(__name__)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, "habits.json")
SCORE_CONFIG_FILE = os.path.join(BASE_DIR, "score_config.json")
HOSTS_FILE = r"C:\Windows\System32\drivers\etc\hosts"
MARKER_START = "# === ELEVATE BLOCKER START ==="
MARKER_END   = "# === ELEVATE BLOCKER END ==="
_blocker_lock = threading.Lock()

# ── Telegram outage alerts ──────────────────────────
# NOTE: this token lets anyone send/read messages as this bot — treat it like
# a password (don't share this file, don't commit it to a public repo).
TELEGRAM_BOT_TOKEN = "8203003667:AAF0XuyQvRK9uNyWqEHZilzV9VkA2yMi_1E"
TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"
TELEGRAM_CONFIG_FILE = os.path.join(BASE_DIR, "telegram_config.json")
TELEGRAM_LOG_FILE = os.path.join(BASE_DIR, "telegram_alert_log.json")
TELEGRAM_ALERT_THRESHOLDS_MIN = [30, 15, 5]  # minutes before outage start
_telegram_bot_username_cache = {"value": None}

# Pipedream sync: paste the HTTP trigger URL from the "sync receiver" workflow here.
# Whenever this app is online, it pushes the current outage config + chat_id to
# Pipedream, which runs its own cron 24/7 and sends alerts even if this PC is off.
PIPEDREAM_SYNC_URL = "https://YOUR-WORKFLOW-ID.m.pipedream.net"

# ── Backup system ───────────────────────────────────
BACKUP_DIR = os.path.join(BASE_DIR, "backups")
JSON_FILES = ["habits.json","budget.json","calendar.json","food.json","people.json","sleep.json","sticky.json",
    "goals.json",   
    "car.json",
    "score_config.json",
    "outage.json",
    "telegram_config.json",
    "parts.json",
    "focus_stats.json"]
_backup_lock = threading.Lock()
_last_sizes = {}  # filename → last known size

def _backup_slot_path(fname, slot):
    """Return path like backups/people.json.h1 (hourly) .d1 (daily) .w1 (weekly)"""
    return os.path.join(BACKUP_DIR, f"{fname}.{slot}")

def _backup_src_path(fname):
    """Most JSON files live next to app.py. focus_stats.json is the one
    exception — it's stored a directory above (see FOCUS_STATS_FILE) — so
    route it there instead of BASE_DIR."""
    if fname == "focus_stats.json":
        return os.path.join(BASE_DIR, "..", "focus_stats.json")
    return os.path.join(BASE_DIR, fname)

def _rotate_backups():
    """Called periodically. Writes 3-hour, 3-day, 3-week rotating backups and alerts on shrink."""
    os.makedirs(BACKUP_DIR, exist_ok=True)
    now = datetime.now()
    shrunk = []

    for fname in JSON_FILES:
        src = _backup_src_path(fname)
        if not os.path.exists(src):
            continue
        size = os.path.getsize(src)

        # Alert if file got smaller
        prev = _last_sizes.get(fname)
        if prev is not None and size < prev:
            shrunk.append(f"{fname} ({prev}→{size} bytes)")
        _last_sizes[fname] = size

        # Hourly slots (h1=newest, h3=oldest)
        # Shift h2→h3, h1→h2, write h1
        for i in range(3, 1, -1):
            older = _backup_slot_path(fname, f"h{i}")
            newer = _backup_slot_path(fname, f"h{i-1}")
            if os.path.exists(newer):
                shutil.copy2(newer, older)
        shutil.copy2(src, _backup_slot_path(fname, "h1"))

    # Daily backup — run once per day
    day_marker = os.path.join(BACKUP_DIR, ".last_daily")
    if not os.path.exists(day_marker) or \
       datetime.fromtimestamp(os.path.getmtime(day_marker)).date() < now.date():
        for fname in JSON_FILES:
            src = _backup_src_path(fname)
            if not os.path.exists(src): continue
            for i in range(3, 1, -1):
                older = _backup_slot_path(fname, f"d{i}")
                newer = _backup_slot_path(fname, f"d{i-1}")
                if os.path.exists(newer):
                    shutil.copy2(newer, older)
            shutil.copy2(src, _backup_slot_path(fname, "d1"))
        open(day_marker, 'w').close()

    # Weekly backup — run once per week (Monday)
    week_marker = os.path.join(BACKUP_DIR, ".last_weekly")
    do_weekly = False
    if now.weekday() == 0:  # Monday
        if not os.path.exists(week_marker) or \
           (now - datetime.fromtimestamp(os.path.getmtime(week_marker))).days >= 6:
            do_weekly = True
    if do_weekly:
        for fname in JSON_FILES:
            src = _backup_src_path(fname)
            if not os.path.exists(src): continue
            for i in range(3, 1, -1):
                older = _backup_slot_path(fname, f"w{i}")
                newer = _backup_slot_path(fname, f"w{i-1}")
                if os.path.exists(newer):
                    shutil.copy2(newer, older)
            shutil.copy2(src, _backup_slot_path(fname, "w1"))
        open(week_marker, 'w').close()

    return shrunk  # list of filenames that shrank

def _backup_loop():
    while True:
        time.sleep(3600)  # every hour
        _pipedream_sync_async()
        try:
            with _backup_lock:
                shrunk = _rotate_backups()
                if shrunk:
                    # Write a shrink-alert file that the UI polls
                    alert_path = os.path.join(BACKUP_DIR, "shrink_alert.json")
                    existing = []
                    if os.path.exists(alert_path):
                        try: existing = json.load(open(alert_path))
                        except: 
                            pass
                    existing.extend(shrunk)
                    json.dump(existing, open(alert_path, 'w'))
        except Exception as e:
            print("Backup error:", e)

# Run initial backup immediately on startup, then hourly
def _startup_backup():
    try:
        os.makedirs(BACKUP_DIR, exist_ok=True)
        with _backup_lock:
            _rotate_backups()
    except Exception as e:
        print("Startup backup error:", e)

threading.Thread(target=_startup_backup, daemon=True).start()
threading.Thread(target=_backup_loop, daemon=True).start()

# ── Hosts file blocker ──────────────────────────────
def _is_admin():
    try: return ctypes.windll.shell32.IsUserAnAdmin()
    except: return False

def _flush_dns():
    try: subprocess.run(["ipconfig","/flushdns"], capture_output=True, timeout=5)
    except: pass

def _read_hosts():
    with open(HOSTS_FILE,"r",encoding="utf-8",errors="ignore") as f: return f.read()

def _write_hosts(content):
    with open(HOSTS_FILE,"w",encoding="utf-8") as f: f.write(content)

def _clean_hosts():
    with _blocker_lock:
        content = _read_hosts()
        if MARKER_START not in content: return
        lines = content.split("\n")
        out, inside = [], False
        for line in lines:
            if line.strip() == MARKER_START: inside = True
            elif line.strip() == MARKER_END: inside = False
            elif not inside: out.append(line)
        _write_hosts("\n".join(out))

def block_sites(domains):
    if not _is_admin(): return
    with _blocker_lock:
        _clean_hosts()
        content = _read_hosts()
        lines = [MARKER_START]
        for d in domains:
            lines += [f"127.0.0.1\t{d}", f"127.0.0.1\twww.{d}"]
        lines.append(MARKER_END)
        _write_hosts(content.rstrip("\n") + "\n" + "\n".join(lines) + "\n")
    _flush_dns()

def unblock_sites():
    if not _is_admin(): return
    _clean_hosts()
    _flush_dns()

# Always clean up on exit
atexit.register(unblock_sites)


def load_db():
    if not os.path.exists(DB_FILE):
        return {"entries": {}, "adalimumab": {"last_injection": None, "interval_days": 14}}
    with open(DB_FILE, encoding="utf-8") as f:
        return json.load(f)

def save_db(data):
    with open(DB_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=True)

# ── Tweakable scoring weights ────────────────────────
# Every number the score formula uses lives here. Edit via the
# "Scoring" modal in the UI (persisted to score_config.json), or
# just change the defaults below.
SCORE_DEFAULTS = {
    "gym_full": 20, "gym_half": 10, "gym_skipped": -5,
    "home_full": 10, "home_half": 5,
    "food_homemade": 12, "food_healthy_out": 8, "food_junk": 2,
    "cal_target": 1500,
    "cal_over_amount": 150, "cal_over_cost": 1,
    "cal_under_amount": 150, "cal_under_reward": 1,
    "prot_max": 5, "prot_target": 176,
    "weight_logged": 2,
    "german_max": 10, "german_target_mins": 60,
    "car_max": 8, "car_target_mins": 60,
    "uni_max": 12, "uni_target_mins": 120,
    "business_max": 10, "business_target_mins": 60,
    "selfdev_max": 8, "selfdev_target_mins": 60,
    "skincare_full": 6, "skincare_half": 3,
    "pills": 8,
    "mood_max": 6,
    "pain_max": 5,
    "social_irl": 8, "social_chat": 4,
    "soda_free": 4,
    "fruit_veg": 4,
    "teeth_per_brush": 2, "teeth_max": 4,
    "meditation": 4,
    "sleep_max": 6,
}

def load_score_config():
    if not os.path.exists(SCORE_CONFIG_FILE):
        return dict(SCORE_DEFAULTS)
    try:
        with open(SCORE_CONFIG_FILE, encoding="utf-8") as f:
            saved = json.load(f)
        cfg = dict(SCORE_DEFAULTS)
        cfg.update({k: v for k, v in saved.items() if k in SCORE_DEFAULTS})
        return cfg
    except (json.JSONDecodeError, ValueError):
        return dict(SCORE_DEFAULTS)

def save_score_config(cfg):
    with open(SCORE_CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=True)

def compute_score(entry, cfg=None):
    if cfg is None: cfg = load_score_config()
    score = 0
    # Gym: skipped (supposed to go, didn't) is a penalty
    gym=entry.get("gym","none")
    if gym=="full": score+=cfg["gym_full"]
    elif gym=="half": score+=cfg["gym_half"]
    elif gym=="none": score+=0      # planned rest, neutral
    elif gym=="skipped": score+=cfg["gym_skipped"]
    # Home exercise (no penalty for none — it's a bonus)
    home=entry.get("home_exercise","none")
    if home=="full": score+=cfg["home_full"]
    elif home=="half": score+=cfg["home_half"]
    # Food
    food=entry.get("food","")
    if food=="homemade": score+=cfg["food_homemade"]
    elif food=="healthy_out": score+=cfg["food_healthy_out"]
    elif food=="junk": score+=cfg["food_junk"]
    # Calories: every cal_over_amount over target costs cal_over_cost;
    # every cal_under_amount under target rewards cal_under_reward. No caps.
    cal=entry.get("calories",0) or 0; prot=entry.get("protein",0) or 0
    if cal>0:
        if cal>cfg["cal_target"]:
            score -= ((cal-cfg["cal_target"])/cfg["cal_over_amount"])*cfg["cal_over_cost"]
        elif cal<cfg["cal_target"]:
            score += ((cfg["cal_target"]-cal)/cfg["cal_under_amount"])*cfg["cal_under_reward"]
    if prot>0: score+=min(cfg["prot_max"],(prot/cfg["prot_target"])*cfg["prot_max"])
    # Weight logged
    if entry.get("weight"): score+=cfg["weight_logged"]
    # Study: german, car, uni, business, selfdev
    score+=min(cfg["german_max"],((entry.get("german_mins",0) or 0)/cfg["german_target_mins"])*cfg["german_max"])
    score+=min(cfg["car_max"],((entry.get("car_courses_mins",0) or 0)/cfg["car_target_mins"])*cfg["car_max"])
    score+=min(cfg["uni_max"],((entry.get("uni_study_mins",0) or 0)/cfg["uni_target_mins"])*cfg["uni_max"])
    score+=min(cfg["business_max"],((entry.get("business_mins",0) or 0)/cfg["business_target_mins"])*cfg["business_max"])
    score+=min(cfg["selfdev_max"],((entry.get("selfdev_mins",0) or 0)/cfg["selfdev_target_mins"])*cfg["selfdev_max"])
    # Skincare
    sk=entry.get("skincare","none")
    if sk=="full": score+=cfg["skincare_full"]
    elif sk=="half": score+=cfg["skincare_half"]
    # Pills
    if entry.get("pills"): score+=cfg["pills"]
    # Mood, Pain (inverse) — only score if actually logged, no phantom mid-scale credit
    mood=entry.get("mood",None)
    if mood is not None: score+=(mood/10)*cfg["mood_max"]
    pain=entry.get("pain",None)
    if pain is not None: score+=((10-pain)/10)*cfg["pain_max"]
    # Social
    soc=entry.get("socialized","none")
    if soc=="irl": score+=cfg["social_irl"]
    elif soc=="chat": score+=cfg["social_chat"]
    # No soda — only credited if the day was actually logged (explicit false), not just untouched
    if "soda" in entry and not entry.get("soda"): score+=cfg["soda_free"]
    # Fruit/veg
    if entry.get("fruit_veg",False): score+=cfg["fruit_veg"]
    # Teeth
    teeth=entry.get("teeth_brushed",0) or 0
    score+=min(cfg["teeth_max"],teeth*cfg["teeth_per_brush"])
    # Meditation
    if entry.get("meditated"): score+=cfg["meditation"]
    # Sleep score - reward sleeping before 00:30 and waking 06:00-09:30
    sleep_score_pts = entry.get("sleep_score",None)
    if sleep_score_pts is not None: score+=min(cfg["sleep_max"],max(0,sleep_score_pts))
    return round(score)

def adal_reminder(db):
    adal=db.get("adalimumab",{}); last=adal.get("last_injection"); interval=adal.get("interval_days",14)
    if not last: return {"status":"unknown","message":"No date set","days_until":None,"next_date":None}
    nd=datetime.strptime(last,"%Y-%m-%d").date()+timedelta(days=interval); today=date.today(); du=(nd-today).days
    if du<0: return {"status":"overdue","message":f"Overdue by {abs(du)} days!","days_until":du,"next_date":str(nd)}
    if du==0: return {"status":"today","message":"Due TODAY!","days_until":0,"next_date":str(nd)}
    if du<=2: return {"status":"soon","message":f"In {du} day(s)","days_until":du,"next_date":str(nd)}
    return {"status":"ok","message":f"In {du} days","days_until":du,"next_date":str(nd)}

API_VERSION = "2026-07-16-v8-outage-predictor"

@app.route("/api/version")
def get_version():
    return jsonify({"version": API_VERSION})

@app.route("/api/score_config", methods=["GET","POST"])
def score_config_api():
    if request.method == "GET":
        return jsonify(load_score_config())
    data = request.json or {}
    if data.get("action") == "reset":
        cfg = dict(SCORE_DEFAULTS)
    else:
        cfg = load_score_config()
        for k, v in data.items():
            if k not in SCORE_DEFAULTS: continue
            try: cfg[k] = float(v)
            except (TypeError, ValueError): continue
            if cfg[k] == int(cfg[k]): cfg[k] = int(cfg[k])
    save_score_config(cfg)
    return jsonify({"ok":True,"config":cfg})

@app.route("/")
def index():
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "index.html"), encoding="utf-8") as f:
        content = f.read()
    from flask import Response
    return Response(content, mimetype="text/html; charset=utf-8")

@app.route("/api/today")
def get_today():
    db=load_db()
    requested = request.args.get("date")
    today=str(date.today())
    # Allow editing today or up to 2 days back, nothing else
    if requested:
        try:
            rd = datetime.strptime(requested, "%Y-%m-%d").date()
            delta = (date.today() - rd).days
            if 0 <= delta <= 2:
                today = requested
        except: pass
    entry=db["entries"].get(today,{})
    return jsonify({"entry":entry,"date":today,"adalimumab":adal_reminder(db),"score":compute_score(entry)})

@app.route("/api/save",methods=["POST"])
def save_entry():
    db=load_db()
    data=request.json
    # Accept a date field in the payload, validate it's within 2 days
    target_date = data.pop("_date", str(date.today()))
    try:
        rd = datetime.strptime(target_date, "%Y-%m-%d").date()
        delta = (date.today() - rd).days
        if not (0 <= delta <= 2):
            target_date = str(date.today())
    except:
        target_date = str(date.today())
    entry=db["entries"].get(target_date,{})
    entry.update(data); db["entries"][target_date]=entry; save_db(db)
    return jsonify({"ok":True,"score":compute_score(entry)})

@app.route("/api/adalimumab",methods=["POST"])
def set_adal():
    db=load_db(); data=request.json
    if "last_injection" in data: db["adalimumab"]["last_injection"]=data["last_injection"]
    if "interval_days" in data: db["adalimumab"]["interval_days"]=data["interval_days"]
    save_db(db)
    return jsonify({"ok":True,"reminder":adal_reminder(db)})

@app.route("/api/stats")
def get_stats():
    db=load_db(); days=sorted(db["entries"].keys())[-90:]
    cfg=load_score_config()
    result=[]
    for d in days:
        e=db["entries"][d]
        result.append({"date":d,"score":compute_score(e,cfg),"gym":e.get("gym","none"),"food":e.get("food",""),
            "calories":e.get("calories",0) or 0,"protein":e.get("protein",0) or 0,"weight":e.get("weight",None),
            "german_mins":e.get("german_mins",0) or 0,"car_courses_mins":e.get("car_courses_mins",0) or 0,
            "uni_study_mins":e.get("uni_study_mins",0) or 0,"business_mins":e.get("business_mins",0) or 0,
            "selfdev_mins":e.get("selfdev_mins",0) or 0,"skincare":e.get("skincare","none"),
            "pills":1 if e.get("pills") else 0,"mood":e.get("mood",None),"pain":e.get("pain",None),
            "socialized":e.get("socialized","none"),"soda":1 if e.get("soda") else 0,
            "sleep_score":e.get("sleep_score",None),"teeth_brushed":e.get("teeth_brushed",0) or 0,
            "meditated":1 if e.get("meditated") else 0})
    return jsonify(result)

@app.route("/api/history")
def get_history():
    db=load_db(); cfg=load_score_config()
    return jsonify({d:{**e,"score":compute_score(e,cfg)} for d,e in db["entries"].items()})


@app.route("/api/full_history")
def get_full_history():
    """Merge habits, sleep, food, budget, calendar into one dict keyed by gregorian date."""
    import jdatetime as jdt

    habits_db = load_db()
    sleep_db  = load_sleep()
    food_db   = load_food()
    budget_db = load_budget()
    cal_events = load_calendar()

    # Build calendar events index by gregorian date
    cal_by_date = {}
    for ev in cal_events:
        d = ev.get("date_iso","")
        if d:
            cal_by_date.setdefault(d, []).append({
                "title": ev.get("title",""),
                "done":  ev.get("done", False),
                "priority": ev.get("priority", 3),
                "type": ev.get("type","user"),
            })

    # Build budget index: gregorian_date -> {total, tags}
    budget_by_gdate = {}
    for mk, month in budget_db.get("months", {}).items():
        try:
            jy2, jm2 = int(mk.split("-")[0]), int(mk.split("-")[1])
        except:
            continue
        for day_str, val in month.get("daily_spending", {}).items():
            try:
                jd2 = int(day_str)
                g = jdt.date(jy2, jm2, jd2).togregorian()
                giso = str(g)
                total = val["total"] if isinstance(val, dict) else val
                tags  = val.get("tags", []) if isinstance(val, dict) else []
                income_total = val.get("income_total", 0) if isinstance(val, dict) else 0
                income = val.get("income", []) if isinstance(val, dict) else []
                fixed_payments = val.get("fixed_payments", []) if isinstance(val, dict) else []
                budget_by_gdate[giso] = {"total": total, "tags": tags,
                                          "income_total": income_total, "income": income,
                                          "fixed_payments": fixed_payments,
                                          "month_key": mk, "jalali_day": jd2}
            except:
                continue

    # Build sleep index
    sleep_by_date = {}
    for d, e in sleep_db.get("entries", {}).items():
        sleep_by_date[d] = {
            "bedtime":     e.get("bedtime",""),
            "waketime":    e.get("waketime",""),
            "quality":     e.get("quality", 0),
            "sleep_score": e.get("sleep_score", 0),
            "notes":       e.get("notes",""),
        }

    # Build food index
    food_by_date = {}
    for d, e in food_db.get("log", {}).items():
        total_items = sum(len(m.get("items",[])) for m in e.get("meals",[]))
        food_by_date[d] = {
            "calories":    e.get("calories", 0),
            "protein":     e.get("protein", 0),
            "total_items": total_items,
            "meals":       e.get("meals", []),
            "notes":       e.get("notes",""),
        }

    # Collect all dates across all sources
    all_dates = set(habits_db["entries"].keys()) | set(sleep_by_date.keys()) |                 set(food_by_date.keys()) | set(budget_by_gdate.keys()) | set(cal_by_date.keys())

    score_cfg = load_score_config()
    result = {}
    for d in all_dates:
        e = habits_db["entries"].get(d, {})
        result[d] = {
            # habits
            "score":            compute_score(e, score_cfg),
            "gym":              e.get("gym","none"),
            "food_type":        e.get("food",""),
            "skincare":         e.get("skincare","none"),
            "socialized":       e.get("socialized","none"),
            "soda":             1 if e.get("soda") else 0,
            "calories":         e.get("calories",0) or 0,
            "protein":          e.get("protein",0) or 0,
            "weight":           e.get("weight",None),
            "german_mins":      e.get("german_mins",0) or 0,
            "uni_study_mins":   e.get("uni_study_mins",0) or 0,
            "business_mins":    e.get("business_mins",0) or 0,
            "car_courses_mins": e.get("car_courses_mins",0) or 0,
            "selfdev_mins":     e.get("selfdev_mins",0) or 0,
            "pills":            1 if e.get("pills") else 0,
            "mood":             e.get("mood",None),
            "pain":             e.get("pain",None),
            "teeth_brushed":    e.get("teeth_brushed",0) or 0,
            "meditated":        1 if e.get("meditated") else 0,
            "sleep_score":      e.get("sleep_score",None),
            # sleep
            "sleep":            sleep_by_date.get(d, None),
            # food detail
            "food_log":         food_by_date.get(d, None),
            # budget
            "budget":           budget_by_gdate.get(d, None),
            # calendar
            "events":           cal_by_date.get(d, []),
        }

    return jsonify(result)


@app.route("/api/full_stats")
def get_full_stats():
    """Flat array of all trackable metrics per day, for charting."""
    import jdatetime as jdt

    habits_db  = load_db()
    sleep_db   = load_sleep()
    food_db    = load_food()
    budget_db  = load_budget()

    # budget by gregorian date
    budget_by_gdate = {}
    for mk, month in budget_db.get("months", {}).items():
        try:
            jy2, jm2 = int(mk.split("-")[0]), int(mk.split("-")[1])
        except:
            continue
        for day_str, val in month.get("daily_spending", {}).items():
            try:
                jd2 = int(day_str)
                g = jdt.date(jy2, jm2, jd2).togregorian()
                total = val["total"] if isinstance(val, dict) else val
                budget_by_gdate[str(g)] = total
            except:
                continue

    # sleep
    sleep_by_date = {}
    for d, e in sleep_db.get("entries", {}).items():
        try:
            bh, bm = map(int, e.get("bedtime","0:0").split(":"))
            wh, wm = map(int, e.get("waketime","0:0").split(":"))
            bed_mins  = bh*60+bm
            wake_mins = wh*60+wm
            if bed_mins < 12*60: bed_mins += 24*60
            dur = wake_mins + 24*60 - bed_mins
            if dur > 24*60: dur -= 24*60
        except:
            dur = 0
        sleep_by_date[d] = {
            "sleep_duration_mins": dur if dur > 0 else None,
            "sleep_score":         e.get("sleep_score", None),
            "sleep_quality":       e.get("quality", None),
        }

    # food
    food_by_date = {d: {"food_calories": e.get("calories",0), "food_protein": e.get("protein",0)}
                    for d, e in food_db.get("log", {}).items()}

    # all dates from habits (primary source for charts)
    all_dates = sorted(set(habits_db["entries"].keys()) |
                       set(sleep_by_date.keys()) |
                       set(food_by_date.keys()) |
                       set(budget_by_gdate.keys()))[-180:]

    score_cfg = load_score_config()
    result = []
    for d in all_dates:
        e  = habits_db["entries"].get(d, {})
        sl = sleep_by_date.get(d, {})
        fo = food_by_date.get(d, {})
        result.append({
            "date":                d,
            "score":               compute_score(e, score_cfg),
            "gym":                 e.get("gym","none"),
            "food_type":           e.get("food",""),
            "skincare":            e.get("skincare","none"),
            "socialized":          e.get("socialized","none"),
            "soda":                1 if e.get("soda") else 0,
            "calories":            e.get("calories",0) or fo.get("food_calories",0) or 0,
            "protein":             e.get("protein",0) or fo.get("food_protein",0) or 0,
            "weight":              e.get("weight",None),
            "german_mins":         e.get("german_mins",0) or 0,
            "uni_study_mins":      e.get("uni_study_mins",0) or 0,
            "business_mins":       e.get("business_mins",0) or 0,
            "car_courses_mins":    e.get("car_courses_mins",0) or 0,
            "selfdev_mins":        e.get("selfdev_mins",0) or 0,
            "pills":               1 if e.get("pills") else 0,
            "mood":                e.get("mood",None),
            "pain":                e.get("pain",None),
            "teeth_brushed":       e.get("teeth_brushed",0) or 0,
            "meditated":           1 if e.get("meditated") else 0,
            "sleep_score":         sl.get("sleep_score", e.get("sleep_score", None)),
            "sleep_duration_mins": sl.get("sleep_duration_mins", None),
            "sleep_quality":       sl.get("sleep_quality", None),
            "money_spent":         budget_by_gdate.get(d, None),
        })
    return jsonify(result)

@app.route("/api/blocker", methods=["POST"])
def blocker_signal():
    data = request.json
    action = data.get("action")
    domains = data.get("domains", [])
    if action == "block" and domains:
        threading.Thread(target=block_sites, args=(domains,), daemon=True).start()
    elif action == "unblock":
        threading.Thread(target=unblock_sites, daemon=True).start()
    is_admin = _is_admin()
    return jsonify({"ok": True, "is_admin": is_admin})

@app.route("/api/status")
def status():
    return jsonify({"is_admin": _is_admin()})

# ── Simple-mode focus timer: daily productive-minutes log ──
# Stored one directory above BASE_DIR (i.e. next to the Elevate folder itself).
FOCUS_STATS_FILE = os.path.join(BASE_DIR, "..", "focus_stats.json")

def _load_focus_stats():
    if not os.path.exists(FOCUS_STATS_FILE):
        return {}
    try:
        with open(FOCUS_STATS_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, ValueError):
        return {}

def _save_focus_stats(data):
    with open(FOCUS_STATS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

@app.route("/api/focus-stats", methods=["GET"])
def get_focus_stats():
    return jsonify(_load_focus_stats())

@app.route("/api/focus-stats", methods=["POST"])
def post_focus_stats():
    body = request.json or {}
    day = body.get("date")
    minutes = body.get("minutes", 0)
    if not day:
        return jsonify({"ok": False, "error": "date required"}), 400
    try:
        minutes = float(minutes)
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "invalid minutes"}), 400
    data = _load_focus_stats()
    # Adds to whatever's already logged for that date, so multiple
    # "End Day" presses in the same day accumulate instead of overwriting.
    data[day] = round(data.get(day, 0) + minutes, 2)
    _save_focus_stats(data)
    return jsonify({"ok": True, "data": data})

# ══════════════════════════════════════
# BUDGET / EXPENSES API
# ══════════════════════════════════════
import jdatetime as jdt

BUDGET_FILE = os.path.join(BASE_DIR, "budget.json")

def load_budget():
    if not os.path.exists(BUDGET_FILE):
        return {"months": {}, "tags": [], "loans": [], "receivables": []}
    try:
        with open(BUDGET_FILE, encoding="utf-8") as f:
            data = json.load(f)
        if "tags" not in data: data["tags"] = []
        if "loans" not in data: data["loans"] = []
        if "receivables" not in data: data["receivables"] = []
        return data
    except (json.JSONDecodeError, ValueError):
        import shutil
        shutil.copy(BUDGET_FILE, BUDGET_FILE + ".bak")
        return {"months": {}, "tags": [], "loans": [], "receivables": []}

def save_budget(data):
    with open(BUDGET_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=True)

# ── Bank Balance & Actual Balance are both fully computed from this month's
# numbers — no manual entry, no carry-over ledger. Same ingredients, two filters:
#   Actual Balance = budget + income − ALL fixed/loans − daily spending + ALL owed money
#   Bank Balance    = budget + income − TICKED fixed/loans − daily spending + TICKED owed money
# Ticking a fixed expense/loan only moves its amount out of Bank Balance (since it's
# already counted in Actual Balance the moment it's created) — Actual Balance doesn't move.
# Same idea for owed money: ticking a payment moves it into Bank Balance without changing
# Actual Balance, since the full amount was already counted there.

def jalali_today():
    t = jdt.date.today()
    return t.year, t.month, t.day

def jalali_days_in_month(jy, jm):
    if jm <= 6: return 31
    if jm <= 11: return 30
    return 30 if jdt.date(jy, 12, 1).isleap() else 29

def jalali_first_dow(jy, jm):
    # jdatetime.weekday() already returns Jalali weekday: Sat=0,Sun=1,Mon=2,Tue=3,Wed=4,Thu=5,Fri=6
    return jdt.date(jy, jm, 1).weekday()

def month_key(jy, jm):
    return f"{jy}-{jm:02d}"

def month_index(mk):
    jy, jm = mk.split("-")
    return int(jy) * 12 + int(jm)

def loan_payment_for_month(loan, mk):
    """Return payment amount if this loan is active in mk, else None."""
    start_idx = month_index(loan["start_month"])
    end_idx   = month_index(loan.get("end_month", loan["start_month"]))
    cur_idx   = month_index(mk)
    if cur_idx < start_idx or cur_idx > end_idx:
        return None
    n = cur_idx - start_idx + 1
    total_months = end_idx - start_idx + 1
    return (n, total_months, loan.get("monthly_payment", 0))

# ── Helpers for recording a paid fixed-expense/loan into that day's history ──
# These are PURELY for visibility (so you can see "what happened today" in the
# calendar / transactions list). The amount here is NEVER added to a day's
# "total" (that field only holds ad-hoc tag spending and feeds daily_spent),
# so checking a fixed expense/loan never gets double-deducted from the budget —
# it only moves money out of bank_balance, same as before.
def _day_bucket(month, day):
    ds = month.setdefault("daily_spending", {})
    key = str(day)
    raw = ds.get(key)
    if isinstance(raw, dict):
        raw.setdefault("total", 0)
        raw.setdefault("tags", [])
        raw.setdefault("income_total", 0)
        raw.setdefault("income", [])
        raw.setdefault("fixed_payments", [])
        return raw
    bucket = {"total": raw or 0, "tags": [], "income_total": 0, "income": [], "fixed_payments": []}
    ds[key] = bucket
    return bucket

def _add_fixed_payment(db, mk, day, item_id, name, icon, amount, kind):
    bucket = _day_bucket(db["months"][mk], day)
    bucket["fixed_payments"] = [p for p in bucket["fixed_payments"] if p["id"] != item_id]
    bucket["fixed_payments"].append({"id": item_id, "name": name, "icon": icon, "amount": amount, "kind": kind})

def _remove_fixed_payment(db, mk, item_id):
    for v in db["months"][mk].get("daily_spending", {}).values():
        if isinstance(v, dict) and v.get("fixed_payments"):
            v["fixed_payments"] = [p for p in v["fixed_payments"] if p["id"] != item_id]

@app.route("/api/budget/month", methods=["GET"])
def get_budget_month():
    jy, jm, jd = jalali_today()
    mk = request.args.get("month", month_key(jy, jm))
    db = load_budget()
    month = db["months"].get(mk, {"budget":0,"fixed_expenses":[],"daily_spending":{},"month_key":mk})
    jy2, jm2 = int(mk.split("-")[0]), int(mk.split("-")[1])
    total_days = jalali_days_in_month(jy2, jm2)
    first_dow = jalali_first_dow(jy2, jm2)
    is_current = (jy2 == jy and jm2 == jm)
    today_day = jd if is_current else 0
    days_left = max(0, total_days - today_day + 1) if is_current else 0
    fixed_items = month.get("fixed_expenses", []) or []
    fixed_total = sum(e["amount"] for e in fixed_items)
    # Unpaid portion only (used for the real-money Actual Balance projection below)
    unpaid_fixed_total = sum(e["amount"] for e in fixed_items if not e.get("checked"))
    # Auto-inject active loan payments as virtual (read-only, but checkable) fixed expenses for this month
    loan_items = []
    month_loan_payments = month.get("loan_payments", {})
    for loan in db.get("loans", []):
        info = loan_payment_for_month(loan, mk)
        if info:
            n, num_payments, amount = info
            lp = month_loan_payments.get(loan["id"], {})
            checked = bool(lp.get("checked", False))
            loan_items.append({
                "id": "loan_" + loan["id"], "loan_id": loan["id"],
                "name": f"{loan.get('icon','🏦')} {loan['name']} (loan {n}/{num_payments})",
                "amount": amount, "checked": checked, "is_loan": True
            })
    fixed_total += sum(li["amount"] for li in loan_items)
    unpaid_fixed_total += sum(li["amount"] for li in loan_items if not li["checked"])
    month_with_loans = dict(month)
    month_with_loans["fixed_expenses"] = (month.get("fixed_expenses", []) or []) + loan_items
    # daily_spending values can be int (old format) or dict {total, tags, income_total, income}
    daily_spent = sum(
        v["total"] if isinstance(v, dict) else v
        for v in month.get("daily_spending", {}).values()
    )
    daily_income = sum(
        v.get("income_total", 0) if isinstance(v, dict) else 0
        for v in month.get("daily_spending", {}).values()
    )
    # ── Monthly Budget area (your discretionary spending plan for THIS month only) ──
 
    receivables = db.get("receivables", [])
    collected_receivables = sum(r.get("paid_amount", 0) for r in receivables)
    total_receivables = sum(r.get("amount", 0) for r in receivables)
    pending_receivables = max(0, total_receivables - collected_receivables)
    ticked_fixed_total = fixed_total - unpaid_fixed_total  # the checked-only portion

    # ── Monthly Budget area (your discretionary spending plan for THIS month only) ──
    budget_val = month.get("budget", 0)
    actual_balance = budget_val + daily_income - fixed_total - daily_spent + total_receivables
    bank_balance = budget_val + daily_income - ticked_fixed_total - daily_spent + collected_receivables

    # ── Monthly Budget area ── Remaining/Daily Limit ARE Actual Balance, not a
    # separate calculation — owed money counts here too since it's coming for sure.
    remaining = actual_balance
    daily_limit = remaining / days_left if days_left > 0 else 0


    return jsonify({
        "month": month_with_loans, "month_key": mk,
        "jy": jy2, "jm": jm2,
        "today_day": today_day,
        "total_days": total_days,
        "first_dow": first_dow,
        "days_left": days_left,
        "fixed_total": fixed_total,
        "unpaid_fixed_total": unpaid_fixed_total,
        "ticked_fixed_total": ticked_fixed_total,
        "daily_spent": daily_spent,
        "daily_income": daily_income,
        "remaining": remaining,
        "daily_limit": daily_limit,
        "budget": budget_val,
        "is_current": is_current,
        "tags": db.get("tags", []),
        "loans": db.get("loans", []),
        "receivables": receivables,
        "bank_balance": bank_balance,
        "pending_receivables": pending_receivables,
        "collected_receivables": collected_receivables,
        "total_receivables": total_receivables,
        "actual_balance": actual_balance,
        "available_months": sorted(db["months"].keys(), reverse=True)
    })

@app.route("/api/budget/set", methods=["POST"])
def set_budget():
    db = load_budget(); data = request.json; mk = data.get("month_key")
    if not mk: return jsonify({"ok": False})
    if mk not in db["months"]:
        db["months"][mk] = {"budget":0,"fixed_expenses":[],"daily_spending":{},"month_key":mk}
    db["months"][mk]["budget"] = data.get("budget", 0)
    save_budget(db); return jsonify({"ok": True})

@app.route("/api/budget/fixed", methods=["POST"])
def manage_fixed():
    db = load_budget(); data = request.json; mk = data["month_key"]
    if mk not in db["months"]:
        db["months"][mk] = {"budget":0,"fixed_expenses":[],"daily_spending":{},"month_key":mk}
    action = data["action"]
    if action == "add":
        db["months"][mk]["fixed_expenses"].append({
            "id": str(int(datetime.now().timestamp()*1000)),
            "name": data["name"], "amount": data["amount"], "checked": False
        })
    elif action == "toggle":
        eid = data["id"]
        jy, jm, jd = jalali_today()
        pay_day = jd if mk == month_key(jy, jm) else 1
        if eid.startswith("loan_"):
            # Virtual loan payment — tracked per-month in loan_payments, not in fixed_expenses
            loan_id = eid[len("loan_"):]
            loan = next((l for l in db.get("loans", []) if l["id"] == loan_id), None)
            if loan:
                db["months"][mk].setdefault("loan_payments", {})
                lp = db["months"][mk]["loan_payments"].setdefault(
                    loan_id, {"checked": False, "checked_date": None, "amount": 0})
                lp["checked"] = not lp["checked"]
                info = loan_payment_for_month(loan, mk)
                amount = info[2] if info else loan.get("monthly_payment", 0)
                lp["amount"] = amount  # keep this in sync with the loan's current terms
                # Ticking it just flips it from "unticked" to "ticked" — Bank Balance
                # picks that up automatically next time it's computed; Actual Balance
                # doesn't move, since this amount was already counted there.
                if lp["checked"]:
                    lp["checked_date"] = str(date.today())
                    _add_fixed_payment(db, mk, pay_day, eid, f"{loan.get('icon','🏦')} {loan['name']}",
                                        loan.get("icon", "🏦"), amount, "loan")
                else:
                    lp["checked_date"] = None
                    _remove_fixed_payment(db, mk, eid)
        else:
            for e in db["months"][mk]["fixed_expenses"]:
                if e["id"] == eid:
                    e["checked"] = not e["checked"]
                    # Same idea as loans: ticking just flips the flag — Bank Balance
                    # picks it up automatically, Actual Balance doesn't move.
                    if e["checked"]:
                        e["checked_date"] = str(date.today())
                        _add_fixed_payment(db, mk, pay_day, e["id"], e["name"], "🔒", e["amount"], "fixed")
                    else:
                        e["checked_date"] = None
                        _remove_fixed_payment(db, mk, e["id"])
    elif action == "delete":
        db["months"][mk]["fixed_expenses"] = [
            e for e in db["months"][mk]["fixed_expenses"] if e["id"] != data["id"]
        ]
        _remove_fixed_payment(db, mk, data["id"])
    elif action == "postpone":
        exp = next((e for e in db["months"][mk]["fixed_expenses"] if e["id"] == data["id"]), None)
        if exp:
            jy2, jm2 = int(mk.split("-")[0]), int(mk.split("-")[1])
            nm = (jm2 % 12) + 1
            ny = jy2 + (1 if jm2 == 12 else 0)
            next_mk = f"{ny}-{nm:02d}"
            if next_mk not in db["months"]:
                db["months"][next_mk] = {"budget":0,"fixed_expenses":[],"daily_spending":{},"month_key":next_mk}
            db["months"][next_mk]["fixed_expenses"].append({
                **exp,
                "id": str(int(datetime.now().timestamp()*1000)),
                "checked": False, "postponed_from": mk
            })
            db["months"][mk]["fixed_expenses"] = [
                e for e in db["months"][mk]["fixed_expenses"] if e["id"] != data["id"]
            ]
    save_budget(db); return jsonify({"ok": True})

@app.route("/api/budget/daily", methods=["POST"])
def set_daily_spending():
    db = load_budget(); data = request.json; mk = data["month_key"]
    if mk not in db["months"]:
        db["months"][mk] = {"budget":0,"fixed_expenses":[],"daily_spending":{},"month_key":mk}
    day = str(data["day"])
    # Format: {total, tags: [...expense entries], income_total, income: [...income entries],
    #          fixed_payments: [...checked fixed/loan items for this day, NOT part of total]}
    # Preserve any fixed_payments already recorded for this day (e.g. from checking
    # off a loan/fixed expense) — this endpoint only owns the ad-hoc tags/income.
    existing = db["months"][mk]["daily_spending"].get(day)
    existing_fixed_payments = existing.get("fixed_payments", []) if isinstance(existing, dict) else []
    db["months"][mk]["daily_spending"][day] = {
        "total": data["total"],
        "tags": data.get("tags", []),
        "income_total": data.get("income_total", 0),
        "income": data.get("income", []),
        "fixed_payments": existing_fixed_payments
    }
    save_budget(db); return jsonify({"ok": True})

@app.route("/api/budget/tags", methods=["GET","POST"])
def manage_tags():
    db = load_budget()
    if "tags" not in db: db["tags"] = []
    # Migrate legacy tags (no type) to 'expense'
    changed = False
    for t in db["tags"]:
        if "type" not in t:
            t["type"] = "expense"
            changed = True
    if changed: save_budget(db)
    if request.method == "GET":
        return jsonify(db["tags"])
    data = request.json; action = data["action"]
    if action == "add":
        db["tags"].append({
            "id": str(int(datetime.now().timestamp()*1000)),
            "name": data["name"],
            "color": data.get("color", "#6c63ff"),
            "icon": data.get("icon", "🏷️"),
            "type": data.get("type", "expense")
        })
    elif action == "delete":
        db["tags"] = [t for t in db["tags"] if t["id"] != data["id"]]
    elif action == "edit":
        for t in db["tags"]:
            if t["id"] == data["id"]:
                t["name"] = data.get("name", t["name"])
                t["color"] = data.get("color", t["color"])
                t["icon"] = data.get("icon", t["icon"])
                t["type"] = data.get("type", t.get("type", "expense"))
    save_budget(db); return jsonify({"ok": True, "tags": db["tags"]})

@app.route("/api/budget/loans", methods=["GET","POST"])
def manage_loans():
    db = load_budget()
    if "loans" not in db: db["loans"] = []
    if request.method == "GET":
        return jsonify(db["loans"])
    data = request.json; action = data["action"]
    if action == "add":
        db["loans"].append({
            "id": str(int(datetime.now().timestamp()*1000)),
            "name": data["name"],
            "icon": data.get("icon", "🏦"),
            "monthly_payment": data.get("monthly_payment", 0),
            "pay_day": data.get("pay_day", 1),
            "start_month": data["start_month"],
            "end_month": data["end_month"],
            "notes": data.get("notes", "")
        })
    elif action == "delete":
        db["loans"] = [l for l in db["loans"] if l["id"] != data["id"]]
    elif action == "edit":
        for l in db["loans"]:
            if l["id"] == data["id"]:
                for k in ("name","icon","total_amount","monthly_payment","num_payments","start_month","notes"):
                    if k in data: l[k] = data[k]
    save_budget(db); return jsonify({"ok": True, "loans": db["loans"]})

@app.route("/api/budget/receivables", methods=["GET","POST"])
def manage_receivables():
    db = load_budget()
    if "receivables" not in db: db["receivables"] = []
    if request.method == "GET":
        return jsonify(db["receivables"])
    data = request.json; action = data["action"]
    if action == "add":
        db["receivables"].append({
            "id": str(int(datetime.now().timestamp()*1000)),
            "person": data["person"],
            "amount": data["amount"],
            "note": data.get("note", ""),
            "date_added": str(date.today()),
            "paid_amount": 0,
            "payments": [],
            "fully_paid": False
        })
    elif action == "delete":
        db["receivables"] = [r for r in db["receivables"] if r["id"] != data["id"]]
    elif action == "record_payment":
        # Record a partial or full payment. This is the "tick" for owed money —
        # it moves the amount from "outstanding" into "collected", which is what
        # shifts it from Actual Balance's pool into Bank Balance's pool.
        for r in db["receivables"]:
            if r["id"] == data["id"]:
                amount = data["amount"]
                r["payments"].append({"amount": amount, "date": str(date.today()), "note": data.get("note","")})
                r["paid_amount"] = r.get("paid_amount", 0) + amount
                r["fully_paid"] = r["paid_amount"] >= r["amount"]
    save_budget(db)
    return jsonify({"ok": True, "receivables": db["receivables"]})


# ══════════════════════════════════════
# FOOD LOG API
# ══════════════════════════════════════

FOOD_FILE = os.path.join(BASE_DIR, "food.json")

def load_food():
    if not os.path.exists(FOOD_FILE):
        return {"ingredients": [], "log": {}}
    try:
        with open(FOOD_FILE, encoding="utf-8") as f:
            d = json.load(f)
        if "ingredients" not in d: d["ingredients"] = []
        if "log" not in d: d["log"] = {}
        return d
    except (json.JSONDecodeError, ValueError):
        import shutil
        shutil.copy(FOOD_FILE, FOOD_FILE + ".bak")
        return {"ingredients": [], "log": {}}

def save_food(data):
    with open(FOOD_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=True)

@app.route("/api/food/ingredients", methods=["GET", "POST"])
def food_ingredients():
    db = load_food()
    if request.method == "GET":
        return jsonify(db["ingredients"])
    data = request.json
    action = data.get("action")
    if action == "add":
        db["ingredients"].append({
        "id": str(int(datetime.now().timestamp()*1000)),
        "name": data["name"],
        "unit": data.get("unit", "g"),
        "icon": data.get("icon", "🍽️"),
        "category": data.get("category", "other"),
        "calories": data.get("calories", 0),
        "protein": data.get("protein", 0)
    })
    elif action == "delete":
        db["ingredients"] = [i for i in db["ingredients"] if i["id"] != data["id"]]
    elif action == "edit":
        for i in db["ingredients"]:
            if i["id"] == data["id"]:
                i.update({k: data[k] for k in ["name","unit","icon","category","calories","protein"] if k in data})
    save_food(db)
    return jsonify({"ok": True, "ingredients": db["ingredients"]})

@app.route("/api/food/log", methods=["GET", "POST"])
def food_log():
    db = load_food()
    if request.method == "GET":
        date_str = request.args.get("date", str(date.today()))
        return jsonify({"date": date_str, "entry": db["log"].get(date_str, {"meals": [], "calories": 0, "protein": 0, "notes": ""})})
    data = request.json
    date_str = data.get("date", str(date.today()))
    # Validate date within 2 days
    try:
        rd = datetime.strptime(date_str, "%Y-%m-%d").date()
        if abs((date.today() - rd).days) > 2:
            date_str = str(date.today())
    except: date_str = str(date.today())
    db["log"][date_str] = {
        "meals": data.get("meals", []),
        "calories": data.get("calories", 0),
        "protein": data.get("protein", 0),
        "notes": data.get("notes", "")
    }
    save_food(db)
    # Sync calories+protein back to habits
    habits_db = load_db()
    if date_str not in habits_db["entries"]:
        habits_db["entries"][date_str] = {}
    if data.get("calories"): habits_db["entries"][date_str]["calories"] = data["calories"]
    if data.get("protein"):  habits_db["entries"][date_str]["protein"]  = data["protein"]
    save_db(habits_db)
    return jsonify({"ok": True})

def jalali_from_gregorian(date_str):
    """Convert YYYY-MM-DD gregorian string to Jalali dict."""
    try:
        g = datetime.strptime(date_str, "%Y-%m-%d").date()
        j = jdt.date.fromgregorian(date=g)
        return {"y": j.year, "m": j.month, "d": j.day,
                "month_name": ['Farvardin','Ordibehesht','Khordad','Tir','Mordad','Shahrivar',
                               'Mehr','Aban','Azar','Dey','Bahman','Esfand'][j.month-1],
                "str": f"{j.year}/{j.month:02d}/{j.day:02d}"}
    except:
        return {"str": date_str}

@app.route("/api/jalali_today")
def get_jalali_today():
    jy, jm, jd = jalali_today()
    months = ['Farvardin','Ordibehesht','Khordad','Tir','Mordad','Shahrivar',
              'Mehr','Aban','Azar','Dey','Bahman','Esfand']
    return jsonify({"year": jy, "month": jm, "day": jd,
                    "month_name": months[jm-1],
                    "str": f"{jy}/{jm:02d}/{jd:02d}",
                    "gregorian": str(date.today())})

@app.route("/api/food/stats")
def food_stats():
    db = load_food()
    log = db.get("log", {})
    # Build per-ingredient stats
    ingr_map = {i["id"]: i for i in db.get("ingredients", [])}
    ingr_totals = {}  # {ingr_id: {name, icon, unit, total_qty, days, entries}}
    daily_calories = []
    daily_protein = []
    for date_str in sorted(log.keys())[-60:]:
        entry = log[date_str]
        j = jalali_from_gregorian(date_str)
        daily_calories.append({"date": date_str, "jalali": j.get("str",""), "val": entry.get("calories",0)})
        daily_protein.append({"date": date_str, "jalali": j.get("str",""), "val": entry.get("protein",0)})
        for meal in entry.get("meals", []):
            for item in meal.get("items", []):
                iid = item.get("ingredient_id","")
                if iid not in ingr_totals:
                    ingr_totals[iid] = {"name": item["name"], "icon": item.get("icon","🍽️"),
                                         "unit": item.get("unit","g"), "total_qty": 0, "days": set(), "count": 0}
                ingr_totals[iid]["total_qty"] += item.get("qty", 0)
                ingr_totals[iid]["days"].add(date_str)
                ingr_totals[iid]["count"] += 1
    # Convert sets to lists for JSON
    ingr_list = [{"id": k, **{kk: (list(v) if isinstance(v, set) else v) for kk, v in val.items()},
                  "days_count": len(val["days"])}
                 for k, val in ingr_totals.items()]
    ingr_list.sort(key=lambda x: x["count"], reverse=True)
    # Include full log entries for history display
    full_log = []
    for date_str in sorted(log.keys(), reverse=True)[:60]:
        entry = log[date_str]
        j = jalali_from_gregorian(date_str)
        full_log.append({
            "date": date_str,
            "jalali": j.get("str",""),
            "jalali_label": j.get("label",""),
            "calories": entry.get("calories",0),
            "protein": entry.get("protein",0),
            "notes": entry.get("notes",""),
            "meals": entry.get("meals",[])
        })
    return jsonify({"daily_calories": daily_calories, "daily_protein": daily_protein,
                    "ingredients": ingr_list, "total_days": len(log),
                    "full_log": full_log})





# ══════════════════════════════════════════════════
# CALENDAR EVENTS API
# ══════════════════════════════════════════════════
CALENDAR_FILE = os.path.join(BASE_DIR, "calendar.json")

def load_calendar():
    if not os.path.exists(CALENDAR_FILE):
        return []
    try:
        with open(CALENDAR_FILE, encoding="utf-8") as f:
            return json.load(f)
    except:
        return []

def save_calendar(data):
    with open(CALENDAR_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

@app.route("/api/calendar/events", methods=["GET", "POST"])
def calendar_events():
    if request.method == "GET":
        return jsonify(load_calendar())
    data = request.json
    save_calendar(data)
    return jsonify({"ok": True})


# ══════════════════════════════════════════════════
# SLEEP TRACKER API
# ══════════════════════════════════════════════════
SLEEP_FILE = os.path.join(BASE_DIR, "sleep.json")

def load_sleep():
    if not os.path.exists(SLEEP_FILE):
        return {"entries": {}}
    try:
        with open(SLEEP_FILE, encoding="utf-8") as f:
            return json.load(f)
    except:
        return {"entries": {}}

def save_sleep(data):
    with open(SLEEP_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=True)

def calc_sleep_score(bedtime_str, waketime_str):
    """Score 0-6. Bed window 23:00-01:00 = full 3pts, wake window 08:00-09:00 = full 3pts. -1pt per 30min outside window."""
    try:
        bh, bm = map(int, bedtime_str.split(':'))
        wh, wm = map(int, waketime_str.split(':'))
        bed_mins = bh * 60 + bm
        if bed_mins < 12*60: bed_mins += 24*60
        wake_mins = wh * 60 + wm
        # Bed window: 23:00 (1380) to 01:00 (1500)
        bed_win_s, bed_win_e = 23*60, 25*60
        if bed_win_s <= bed_mins <= bed_win_e:
            bed_score = 3.0
        else:
            dev = min(abs(bed_mins - bed_win_s), abs(bed_mins - bed_win_e))
            bed_score = max(0, 3 - dev / 30)
        # Wake window: 08:00 (480) to 09:00 (540)
        wake_win_s, wake_win_e = 8*60, 9*60
        if wake_win_s <= wake_mins <= wake_win_e:
            wake_score = 3.0
        else:
            dev = min(abs(wake_mins - wake_win_s), abs(wake_mins - wake_win_e))
            wake_score = max(0, 3 - dev / 30)
        return round(min(6.0, bed_score + wake_score), 2)
    except:
        return 0

@app.route("/api/sleep/log", methods=["GET","POST"])
def sleep_log():
    db = load_sleep()
    if request.method == "GET":
        date_str = request.args.get("date", str(date.today()))
        return jsonify({"date": date_str, "entry": db["entries"].get(date_str, {})})
    data = request.json
    date_str = data.get("date", str(date.today()))
    try:
        rd = datetime.strptime(date_str, "%Y-%m-%d").date()
        if abs((date.today()-rd).days) > 7: date_str = str(date.today())
    except: date_str = str(date.today())
    entry = {"bedtime": data.get("bedtime",""), "waketime": data.get("waketime",""),
             "quality": data.get("quality",5), "notes": data.get("notes","")}
    # Compute sleep score and sync to habits
    if entry["bedtime"] and entry["waketime"]:
        ss = calc_sleep_score(entry["bedtime"], entry["waketime"])
        entry["sleep_score"] = ss
        habits = load_db()
        if date_str not in habits["entries"]: habits["entries"][date_str] = {}
        habits["entries"][date_str]["sleep_score"] = ss
        save_db(habits)
    db["entries"][date_str] = entry
    save_sleep(db)
    return jsonify({"ok": True, "entry": entry})

@app.route("/api/sleep/stats")
def sleep_stats():
    db = load_sleep()
    entries = db.get("entries",{})
    result = []
    for date_str in sorted(entries.keys())[-60:]:
        e = entries[date_str]
        j = jalali_from_gregorian(date_str)
        result.append({"date": date_str, "jalali": j.get("str",""), "jalali_label": j.get("month_name","")+" "+str(j.get("d","")),
                       "bedtime": e.get("bedtime",""), "waketime": e.get("waketime",""),
                       "quality": e.get("quality",0), "sleep_score": e.get("sleep_score",0), "notes": e.get("notes","")})
    return jsonify(result)


# ══════════════════════════════════════════════════
# STICKY NOTES API
# ══════════════════════════════════════════════════
STICKY_FILE = os.path.join(BASE_DIR, "sticky.json")

@app.route("/api/sticky", methods=["GET","POST"])
def sticky_notes():
    if request.method == "GET":
        if not os.path.exists(STICKY_FILE):
            return jsonify({"notes": []})
        try:
            with open(STICKY_FILE, encoding="utf-8") as f:
                return jsonify(json.load(f))
        except:
            return jsonify({"notes": []})
    data = request.json
    with open(STICKY_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return jsonify({"ok": True})

# ══════════════════════════════════════
# POWER OUTAGE PREDICTOR
# Iran's rolling blackout schedule shifts forward by `duration_min` each
# day within a fixed daily "active window" (e.g. 09:00-21:00), wrapping
# back to the start of the window once it runs past the end.
# Each location (home/work) keeps a "reference" anchor: the last known
# actual start date+time. Every future day is predicted by shifting that
# anchor forward. Saving new settings (or a "today is different" override)
# always re-anchors to today, so predictions always follow the latest edit.
# ══════════════════════════════════════

OUTAGE_FILE = os.path.join(BASE_DIR, "outage.json")

def _outage_default():
    return {"active_start": "09:00", "active_end": "21:00",
            "duration_min": 120, "ref_date": str(date.today()), "ref_start": "09:00"}

def load_outage():
    if not os.path.exists(OUTAGE_FILE):
        return {"home": _outage_default(), "work": _outage_default()}
    try:
        with open(OUTAGE_FILE, encoding="utf-8") as f:
            d = json.load(f)
        for loc in ("home", "work"):
            if loc not in d:
                d[loc] = _outage_default()
        return d
    except (json.JSONDecodeError, ValueError):
        return {"home": _outage_default(), "work": _outage_default()}

def save_outage(data):
    with open(OUTAGE_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def _hm_to_min(s):
    h, m = s.split(":")
    return int(h) * 60 + int(m)

def _min_to_hm(x):
    x = int(round(x)) % 1440
    return f"{x//60:02d}:{x%60:02d}"

def _predict_outage(cfg, for_date):
    """Predict the outage start/end for `for_date` (a date obj) from a reference anchor."""
    ref_d = datetime.strptime(cfg["ref_date"], "%Y-%m-%d").date()
    days_diff = (for_date - ref_d).days
    a_start = _hm_to_min(cfg["active_start"])
    a_end = _hm_to_min(cfg["active_end"])
    span = max(a_end - a_start, 1)
    dur = max(int(cfg["duration_min"]), 1)
    ref_start = _hm_to_min(cfg["ref_start"])
    pos0 = (ref_start - a_start) % span
    pos = (pos0 + days_diff * dur) % span
    start_min = a_start + pos
    return {"start": _min_to_hm(start_min), "end": _min_to_hm(start_min + dur)}

@app.route("/api/outage", methods=["GET", "POST"])
def outage():
    data = load_outage()

    # Which day this request concerns: the day the user is currently viewing
    # in the app (via the date switcher), defaulting to real "today" if
    # unset/bad. This is used both to anchor edits and to predict the response.
    qdate_str = request.args.get("date")
    if qdate_str:
        try:
            qdate = datetime.strptime(qdate_str, "%Y-%m-%d").date()
        except ValueError:
            qdate = date.today()
    else:
        qdate = date.today()

    if request.method == "POST":
        body = request.json or {}
        loc = body.get("location")
        if loc not in ("home", "work"):
            return jsonify({"error": "invalid location"}), 400
        cfg = data[loc]
        active_start = body.get("active_start") or cfg["active_start"]
        active_end = body.get("active_end") or cfg["active_end"]
        try:
            duration_min = int(body.get("duration_min") or cfg["duration_min"])
        except (TypeError, ValueError):
            duration_min = cfg["duration_min"]
        override = body.get("today_start")
        if override:
            new_start = override
        else:
            # Re-anchor to the VIEWED day's predicted start under the OLD
            # settings, so changing active hours / duration doesn't silently
            # jump the schedule for that day.
            new_start = _predict_outage(cfg, qdate)["start"]
        data[loc] = {
            "active_start": active_start,
            "active_end": active_end,
            "duration_min": duration_min,
            "ref_date": str(qdate),
            "ref_start": new_start
        }
        save_outage(data)
        _pipedream_sync_async()

    result = {}
    for loc in ("home", "work"):
        w = _predict_outage(data[loc], qdate)
        result[loc] = {
            **data[loc],
            "today_start": w["start"],
            "today_end": w["end"],
            "query_date": str(qdate),
            "is_today": qdate == date.today(),
        }
    return jsonify(result)

# ══════════════════════════════════════
# TELEGRAM OUTAGE ALERTS
# ══════════════════════════════════════
# Sends "power going out in N minutes" reminders via a Telegram bot, since
# the desktop browser alerts only work while the app tab is open. Runs on a
# background thread independent of any page being open, and simply retries
# every tick until it succeeds or the outage has already started -- this is
# what covers "VPN might be off at that exact moment": there's no way to make
# Telegram itself hold and deliver a message later, so instead we keep trying
# every 30s using whatever the CURRENT predicted schedule is (so edits to the
# schedule are picked up automatically, no separate re-scheduling needed).

def _telegram_load_config():
    if not os.path.exists(TELEGRAM_CONFIG_FILE):
        return {"chat_id": None}
    try:
        with open(TELEGRAM_CONFIG_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, ValueError, OSError):
        return {"chat_id": None}

def _telegram_save_config(cfg):
    with open(TELEGRAM_CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)

def _telegram_load_log():
    if not os.path.exists(TELEGRAM_LOG_FILE):
        return {}
    try:
        with open(TELEGRAM_LOG_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, ValueError, OSError):
        return {}

def _telegram_save_log(log):
    with open(TELEGRAM_LOG_FILE, "w", encoding="utf-8") as f:
        json.dump(log, f, indent=2, ensure_ascii=False)

def _telegram_api_call(method, params=None, timeout=8):
    url = f"{TELEGRAM_API}/{method}"
    data = urllib.parse.urlencode(params or {}).encode()
    req = urllib.request.Request(url, data=data)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())

def telegram_send(text):
    cfg = _telegram_load_config()
    chat_id = cfg.get("chat_id")
    if not chat_id:
        return False, "no chat_id configured"
    try:
        result = _telegram_api_call("sendMessage", {"chat_id": chat_id, "text": text})
        if result.get("ok"):
            return True, None
        return False, result.get("description", "unknown error")
    except Exception as e:
        return False, str(e)

def _pipedream_sync():
    """Push current outage config + chat_id to Pipedream so its own cron can
    keep sending alerts even while this machine is off. Best-effort: failures
    (no internet, URL not set yet) are swallowed, next sync point retries."""
    if "YOUR-WORKFLOW-ID" in PIPEDREAM_SYNC_URL:
        return
    try:
        payload = json.dumps({
            "outage": load_outage(),
            "chat_id": _telegram_load_config().get("chat_id"),
        }).encode()
        req = urllib.request.Request(
            PIPEDREAM_SYNC_URL, data=payload,
            headers={"Content-Type": "application/json"},
        )
        urllib.request.urlopen(req, timeout=8)
    except Exception as e:
        print("Pipedream sync error:", e)

def _pipedream_sync_async():
    threading.Thread(target=_pipedream_sync, daemon=True).start()

# Sync once on startup so Pipedream has a fresh copy as soon as we're online
threading.Thread(target=_pipedream_sync, daemon=True).start()

def _telegram_bot_username():
    if _telegram_bot_username_cache["value"]:
        return _telegram_bot_username_cache["value"]
    try:
        result = _telegram_api_call("getMe", {}, timeout=5)
        if result.get("ok"):
            uname = result["result"].get("username")
            _telegram_bot_username_cache["value"] = uname
            return uname
    except Exception:
        pass
    return None

@app.route("/api/telegram/status")
def telegram_status():
    cfg = _telegram_load_config()
    return jsonify({"connected": bool(cfg.get("chat_id")), "bot_username": _telegram_bot_username()})

@app.route("/api/telegram/setup", methods=["POST"])
def telegram_setup():
    """User must have already messaged the bot at least once; we grab the
    chat_id off the most recent update Telegram has queued for us."""
    try:
        result = _telegram_api_call("getUpdates", {"limit": 5, "offset": -5}, timeout=8)
    except Exception as e:
        return jsonify({"ok": False, "error": "Couldn't reach Telegram: " + str(e)}), 502
    if not result.get("ok"):
        return jsonify({"ok": False, "error": result.get("description", "Telegram API error")}), 502
    updates = result.get("result", [])
    if not updates:
        return jsonify({"ok": False, "error": "No messages from you yet — open Telegram, message the bot, then click again."}), 404
    last = updates[-1]
    msg = last.get("message") or last.get("channel_post")
    if not msg:
        return jsonify({"ok": False, "error": "No usable message found — try sending the bot a plain text message."}), 404
    chat_id = msg["chat"]["id"]
    cfg = _telegram_load_config()
    cfg["chat_id"] = chat_id
    _telegram_save_config(cfg)
    _pipedream_sync_async()
    telegram_send("✅ Elevate is connected. You'll get power-outage reminders here 30/15/5 minutes before.")
    return jsonify({"ok": True, "chat_id": chat_id})

@app.route("/api/telegram/test", methods=["POST"])
def telegram_test():
    ok, err = telegram_send("🔔 Test alert from Elevate — if you see this, alerts are working.")
    return jsonify({"ok": ok, "error": err})

def _telegram_alert_tick():
    cfg = _telegram_load_config()
    if not cfg.get("chat_id"):
        return
    outage_data = load_outage()
    now = datetime.now()
    today = now.date()
    log = _telegram_load_log()

    # keep the log file small
    cutoff = str(today - timedelta(days=7))
    log = {k: v for k, v in log.items() if k.split("|")[0] >= cutoff}

    dirty = False
    loc_labels = {"home": "🏠 Home", "work": "🏢 Work"}
    for loc in ("home", "work"):
        cfg_loc = outage_data.get(loc)
        if not cfg_loc:
            continue
        w = _predict_outage(cfg_loc, today)
        start_dt = datetime.combine(today, datetime.strptime(w["start"], "%H:%M").time())
        for threshold in TELEGRAM_ALERT_THRESHOLDS_MIN:
            target_dt = start_dt - timedelta(minutes=threshold)
            key = f"{today}|{loc}|{threshold}|{w['start']}"
            if log.get(key) in ("sent", "expired"):
                continue
            if now < target_dt:
                continue  # not due yet
            if now >= start_dt:
                log[key] = "expired"  # missed the whole window, don't send a stale "in N min"
                dirty = True
                continue
            text = f"{loc_labels[loc]} power going out in ~{threshold} min (at {w['start']})."
            text += " Shut down your PC and unplug sensitive devices now." if threshold <= 5 else " Start wrapping up."
            ok, _err = telegram_send(text)
            if ok:
                log[key] = "sent"
                dirty = True
            # if it failed (e.g. VPN off), leave it unmarked -- next tick retries automatically
    if dirty:
        _telegram_save_log(log)

def _telegram_alert_loop():
    while True:
        try:
            _telegram_alert_tick()
        except Exception as e:
            print("Telegram alert error:", e)
        time.sleep(30)

threading.Thread(target=_telegram_alert_loop, daemon=True).start()

# ══════════════════════════════════════
# PEOPLE / SOCIAL TRACKER API
# ══════════════════════════════════════

PEOPLE_FILE = os.path.join(BASE_DIR, "people.json")

def load_people():
    if not os.path.exists(PEOPLE_FILE):
        return {"people": [], "relationships": [], "circles": []}
    try:
        with open(PEOPLE_FILE, encoding="utf-8") as f:
            d = json.load(f)
        if "people" not in d:
            d["people"] = []
        if "relationships" not in d:
            d["relationships"] = []
        if "circles" not in d:
            d["circles"] = []
        if "me_photo" not in d:
            d["me_photo"] = ""
        return d
    except (json.JSONDecodeError, ValueError):
        return {"people": [], "relationships": [], "circles": []}

def save_people(data):
    with open(PEOPLE_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=True)

def _last_of_type(activities, *types):
    matching = [a for a in activities if a.get("type") in types]
    if not matching:
        return None
    return sorted(matching, key=lambda a: a.get("date", ""), reverse=True)[0]["date"]

@app.route("/api/people", methods=["GET", "POST"])
def manage_people():
    db = load_people()
    if request.method == "GET":
        CHAT_TYPES    = {"chat", "call", "catchup"}
        HANGOUT_TYPES = {"hangout", "visited"}
        for p in db["people"]:
            acts = p.get("activities", [])
            p["last_chat"]    = _last_of_type(acts, *CHAT_TYPES)
            p["last_hangout"] = _last_of_type(acts, *HANGOUT_TYPES)
        return jsonify({
            "people":        db["people"],
            "relationships": db.get("relationships", []),
            "circles":       db.get("circles", []),
            "me_photo":      db.get("me_photo", ""),
        })

    data   = request.json
    action = data.get("action")

    if action == "add":
        db["people"].append({
            "id":         str(int(datetime.now().timestamp() * 1000)),
            "name":       data["name"],
            "category":   data.get("category", "friend"),
            "importance": data.get("importance", 0),
            "contact":    data.get("contact", ""),
            "notes":      "",
            "photo":      "",
            "circles":    [],
            "activities": [],
        })
    elif action == "update_person":
            for p in db["people"]:
                if p["id"] == data["id"]:
                    p["name"]       = data.get("name", p.get("name", ""))
                    p["category"]   = data.get("category", p.get("category", "friend"))
                    p["importance"] = data.get("importance", p.get("importance", 0))
                    p["contact"]    = data.get("contact", p.get("contact", ""))
                    break

    elif action == "delete":
        pid = data["id"]
        db["people"] = [p for p in db["people"] if p["id"] != pid]
        db["relationships"] = [r for r in db.get("relationships", [])
                                if r.get("from") != pid and r.get("to") != pid]

    elif action == "save_relationships":
        db["relationships"] = data.get("relationships", [])

    elif action == "save_circles":
        db["circles"] = data.get("circles", [])

    elif action == "save_people_circles":
        circle_map = {x["id"]: x.get("circles", []) for x in data.get("people_circles", [])}
        for p in db["people"]:
            if p["id"] in circle_map:
                p["circles"] = circle_map[p["id"]]

    elif action == "log_activity":
        for p in db["people"]:
            if p["id"] == data["id"]:
                p.setdefault("activities", []).append({
                    "type": data.get("activity_type", "chat"),
                    "note": data.get("note", ""),
                    "date": data.get("date", str(date.today())),
                })
                break

    elif action == "delete_activity":
        for p in db["people"]:
            if p["id"] == data["id"]:
                idx = data.get("activity_index")
                if idx is not None and 0 <= idx < len(p.get("activities", [])):
                    p["activities"].pop(idx)
                break

    elif action == "update_notes":
        for p in db["people"]:
            if p["id"] == data["id"]:
                p["notes"] = data.get("notes", "")
                break

    elif action == "update_me_photo":
        db["me_photo"] = data.get("photo", "")

    elif action == "update_photo":
        for p in db["people"]:
            if p["id"] == data["id"]:
                p["photo"] = data.get("photo", "")
                break




    save_people(db)
    return jsonify({"ok": True})

@app.route("/api/backup", methods=["GET", "POST"])
def backup_api():
    if request.method == "GET":
        # List available backups + check for shrink alerts
        slots = []
        for fname in JSON_FILES:
            for kind, label in [("h","Hourly"),("d","Daily"),("w","Weekly")]:
                for i in range(1,4):
                    slot = f"{kind}{i}"
                    path = _backup_slot_path(fname, slot)
                    if os.path.exists(path):
                        slots.append({"file":fname,"slot":slot,"label":f"{label} {i}",
                            "size":os.path.getsize(path),
                            "mtime":datetime.fromtimestamp(os.path.getmtime(path)).isoformat()})
        alert_path = os.path.join(BACKUP_DIR, "shrink_alert.json")
        alerts = []
        if os.path.exists(alert_path):
            try: alerts = json.load(open(alert_path))
            except: pass
        return jsonify({"slots":slots, "alerts":alerts})
    else:
        data = request.json or {}
        action = data.get("action")
        if action == "restore":
            fname = data.get("file")
            slot = data.get("slot")
            if fname not in JSON_FILES: return jsonify({"ok":False,"error":"invalid file"})
            src = _backup_slot_path(fname, slot)
            if not os.path.exists(src): return jsonify({"ok":False,"error":"backup not found"})
            dest = os.path.join(BASE_DIR, fname)
            shutil.copy2(dest, dest+".pre_restore")
            shutil.copy2(src, dest)
            return jsonify({"ok":True})
        elif action == "dismiss_alerts":
            alert_path = os.path.join(BACKUP_DIR, "shrink_alert.json")
            if os.path.exists(alert_path): os.remove(alert_path)
            return jsonify({"ok":True})
        elif action == "force_backup":
            with _backup_lock:
                _rotate_backups()
            return jsonify({"ok":True})
        return jsonify({"ok":False,"error":"unknown action"})



# ══════════════════════════════════════════════════════
#  app_additions.py
#
#  ADD THESE ROUTES TO app.py — paste them before the
#  final `if __name__ == "__main__":` block.
#
#  Also add "goals.json" and "car.json" to the JSON_FILES
#  list near the top of app.py so they get backed up:
#
#  JSON_FILES = ["habits.json","budget.json","calendar.json",
#                "food.json","people.json","sleep.json",
#                "sticky.json","goals.json","car.json"]
# ══════════════════════════════════════════════════════

GOALS_FILE = os.path.join(BASE_DIR, "goals.json")
CAR_FILE   = os.path.join(BASE_DIR, "car.json")

# ─────────────────────────────────────────────────────
# GOALS API
# ─────────────────────────────────────────────────────

def load_goals():
    if not os.path.exists(GOALS_FILE):
        return []
    try:
        with open(GOALS_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, ValueError):
        return []

def save_goals(data):
    with open(GOALS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

@app.route("/api/goals", methods=["GET", "POST"])
def goals_api():
    if request.method == "GET":
        return jsonify(load_goals())
    data = request.json
    if not isinstance(data, list):
        return jsonify({"ok": False, "error": "expected a list"}), 400
    save_goals(data)
    return jsonify({"ok": True})


# ─────────────────────────────────────────────────────
# CAR API
# ─────────────────────────────────────────────────────

def load_car():
    if not os.path.exists(CAR_FILE):
        return {"km": 0, "services": [], "gas": [], "notes": ""}
    try:
        with open(CAR_FILE, encoding="utf-8") as f:
            d = json.load(f)
        d.setdefault("km", 0)
        d.setdefault("services", [])
        d.setdefault("gas", [])
        d.setdefault("notes", "")
        return d
    except (json.JSONDecodeError, ValueError):
        return {"km": 0, "services": [], "gas": [], "notes": ""}

def save_car(data):
    with open(CAR_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

@app.route("/api/car", methods=["GET", "POST"])
def car_api():
    if request.method == "GET":
        return jsonify(load_car())
    data = request.json
    if not isinstance(data, dict):
        return jsonify({"ok": False, "error": "expected a dict"}), 400
    existing = load_car()
    # Only update known keys to protect data
    for key in ("km", "services", "gas", "notes"):
        if key in data:
            existing[key] = data[key]
    save_car(existing)
    return jsonify({"ok": True})


# ══════════════════════════════════════════════════════
#  app_parts_backend.py
#
#  ADD THESE ROUTES TO app.py — paste them before the
#  final `if __name__ == "__main__":` block (right after
#  the CAR API section works fine).
#
#  Also add "parts.json" to the JSON_FILES list near the
#  top of app.py so it gets picked up by the existing
#  hourly/daily/weekly backup system:
#
#  JSON_FILES = ["habits.json", ..., "car.json", "parts.json"]
# ══════════════════════════════════════════════════════

PARTS_FILE = os.path.join(BASE_DIR, "parts.json")

def _parts_defaults():
    return {"products": [], "stores": [], "car_models": [], "purchases": [], "sales": [], "capital_transactions": [],
            "low_stock_threshold": 2, "unit_migrated_v1": True}

def load_parts():
    if not os.path.exists(PARTS_FILE):
        return _parts_defaults()
    try:
        with open(PARTS_FILE, encoding="utf-8") as f:
            d = json.load(f)
        d.setdefault("products", [])
        d.setdefault("stores", [])
        d.setdefault("car_models", [])
        d.setdefault("purchases", [])
        d.setdefault("sales", [])
        d.setdefault("capital_transactions", [])
        d.setdefault("low_stock_threshold", 2)

        # ── One-time migration: money in this file used to be stored in
        # full Tomans; everywhere else in the app (Money tab, Car tab)
        # uses "K T" (thousand Tomans) as the unit, so Parts now matches.
        # Guarded by a flag so this only ever runs once per file.
        if not d.get("unit_migrated_v1"):
            for pur in d["purchases"]:
                for it in pur.get("items", []):
                    if "unit_price" in it and it["unit_price"] is not None:
                        it["unit_price"] = it["unit_price"] / 1000
            for sale in d["sales"]:
                for it in sale.get("items", []):
                    if "unit_price" in it and it["unit_price"] is not None:
                        it["unit_price"] = it["unit_price"] / 1000
            for tx in d["capital_transactions"]:
                if "amount" in tx and tx["amount"] is not None:
                    tx["amount"] = tx["amount"] / 1000
            d["unit_migrated_v1"] = True
            save_parts(d)
        return d
    except (json.JSONDecodeError, ValueError):
        return _parts_defaults()

def save_parts(data):
    with open(PARTS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def _new_id():
    return str(int(datetime.now().timestamp() * 1000000))

# ── FIFO cost-basis engine ───────────────────────────
# Nothing about cost/COGS/profit is stored — it's always recomputed
# live from products+stores+purchases+sales. That means editing or
# deleting an old purchase/sale can never leave stale numbers behind.
def compute_parts_analytics(data):
    products = {p["id"]: p for p in data["products"]}
    stores   = {s["id"]: s for s in data["stores"]}

    events = []
    for pur in data["purchases"]:
        for idx, it in enumerate(pur.get("items", [])):
            events.append({
                "date": pur.get("order_date") or "0000-00-00", "type": "purchase",
                "pid": it.get("product_id"), "qty": float(it.get("qty") or 0),
                "price": float(it.get("unit_price") or 0),
            })
    for sale in data["sales"]:
        for idx, it in enumerate(sale.get("items", [])):
            events.append({
                "date": sale.get("date") or "0000-00-00", "type": "sale",
                "pid": it.get("product_id"), "qty": float(it.get("qty") or 0),
                "price": float(it.get("unit_price") or 0),
                "sale_id": sale["id"], "idx": idx,
            })
    # Stable sort: purchases were appended before sales, so on a date
    # tie stock arrives before it's sold that same day.
    events.sort(key=lambda e: e["date"])

    lots = {}          # product_id -> [[remaining_qty, unit_cost], ...]  oldest first
    sale_cogs = {}      # (sale_id, idx) -> cost

    # precompute overall avg purchase price per product, used only as a
    # fallback if a sale outruns every tracked lot (oversold / no purchase logged yet)
    total_qty, total_cost = {}, {}
    for pur in data["purchases"]:
        for it in pur.get("items", []):
            pid = it.get("product_id")
            total_qty[pid] = total_qty.get(pid, 0) + float(it.get("qty") or 0)
            total_cost[pid] = total_cost.get(pid, 0) + float(it.get("qty") or 0) * float(it.get("unit_price") or 0)

    for e in events:
        pid = e["pid"]
        if pid not in lots:
            lots[pid] = []
        if e["type"] == "purchase":
            if e["qty"] > 0:
                lots[pid].append([e["qty"], e["price"]])
        else:
            remaining = e["qty"]
            cost = 0.0
            queue = lots[pid]
            while remaining > 1e-9 and queue:
                lot = queue[0]
                take = min(lot[0], remaining)
                cost += take * lot[1]
                lot[0] -= take
                remaining -= take
                if lot[0] <= 1e-9:
                    queue.pop(0)
            if remaining > 1e-9:
                tq = total_qty.get(pid, 0)
                avg = (total_cost.get(pid, 0) / tq) if tq > 0 else 0
                cost += remaining * avg
            sale_cogs[(e["sale_id"], e["idx"])] = cost

    stock, avg_cost_remaining = {}, {}
    for pid, queue in lots.items():
        tq = sum(l[0] for l in queue)
        tc = sum(l[0] * l[1] for l in queue)
        stock[pid] = round(tq, 3)
        avg_cost_remaining[pid] = round(tc / tq, 2) if tq > 0 else 0
    for p in data["products"]:
        stock.setdefault(p["id"], 0)
        avg_cost_remaining.setdefault(p["id"], 0)

    # Annotate sales with cogs/profit per item (revenue always = qty*unit_price)
    sales_out = []
    total_revenue = total_cogs = total_purchase_spend = 0.0
    by_product = {}   # pid -> {qty_sold, revenue, cogs, profit, qty_purchased, spend}
    by_store = {}      # store_id -> {spend, purchases}

    for pur in data["purchases"]:
        sid = pur.get("store_id")
        by_store.setdefault(sid, {"spend": 0.0, "purchase_count": 0, "items_count": 0})
        by_store[sid]["purchase_count"] += 1
        for it in pur.get("items", []):
            pid = it.get("product_id")
            qty = float(it.get("qty") or 0); price = float(it.get("unit_price") or 0)
            spend = qty * price
            total_purchase_spend += spend
            by_store[sid]["spend"] += spend
            by_store[sid]["items_count"] += 1
            bp = by_product.setdefault(pid, {"qty_sold": 0, "revenue": 0.0, "cogs": 0.0, "profit": 0.0, "qty_purchased": 0, "spend": 0.0})
            bp["qty_purchased"] += qty
            bp["spend"] += spend

    for sale in data["sales"]:
        s = dict(sale)
        items_out = []
        sale_revenue = sale_cogs_total = 0.0
        for idx, it in enumerate(sale.get("items", [])):
            pid = it.get("product_id")
            qty = float(it.get("qty") or 0); price = float(it.get("unit_price") or 0)
            revenue = qty * price
            cogs = sale_cogs.get((sale["id"], idx), 0.0)
            profit = revenue - cogs
            items_out.append({**it, "revenue": round(revenue, 2), "cogs": round(cogs, 2), "profit": round(profit, 2)})
            sale_revenue += revenue
            sale_cogs_total += cogs
            bp = by_product.setdefault(pid, {"qty_sold": 0, "revenue": 0.0, "cogs": 0.0, "profit": 0.0, "qty_purchased": 0, "spend": 0.0})
            bp["qty_sold"] += qty
            bp["revenue"] += revenue
            bp["cogs"] += cogs
            bp["profit"] += profit
        s["items"] = items_out
        s["revenue"] = round(sale_revenue, 2)
        s["cogs"] = round(sale_cogs_total, 2)
        s["profit"] = round(sale_revenue - sale_cogs_total, 2)
        sales_out.append(s)
        total_revenue += sale_revenue
        total_cogs += sale_cogs_total

    low_stock_threshold = data.get("low_stock_threshold", 2)
    low_stock = [pid for pid, q in stock.items() if pid in products and q <= low_stock_threshold]

    inventory_value = sum(stock[pid] * avg_cost_remaining[pid] for pid in stock)

    # ── Cash / capital ledger ────────────────────────
    # Cash balance is fully derived, never stored: what the owner put in,
    # minus what they took out, minus every purchase, plus every sale.
    total_deposits = sum(float(t.get("amount") or 0) for t in data.get("capital_transactions", []) if t.get("type") == "deposit")
    total_withdrawals = sum(float(t.get("amount") or 0) for t in data.get("capital_transactions", []) if t.get("type") == "withdrawal")
    cash_balance = total_deposits - total_withdrawals - total_purchase_spend + total_revenue
    business_value = cash_balance + inventory_value
    net_capital = total_deposits - total_withdrawals

    return {
        "sales": sales_out,
        "stock": stock,
        "avg_cost": avg_cost_remaining,
        "by_product": {pid: {**v, "qty_sold": round(v["qty_sold"], 3), "revenue": round(v["revenue"], 2),
                              "cogs": round(v["cogs"], 2), "profit": round(v["profit"], 2),
                              "qty_purchased": round(v["qty_purchased"], 3), "spend": round(v["spend"], 2)}
                       for pid, v in by_product.items()},
        "by_store": {sid: {**v, "spend": round(v["spend"], 2)} for sid, v in by_store.items()},
        "totals": {
            "revenue": round(total_revenue, 2),
            "cogs": round(total_cogs, 2),
            "profit": round(total_revenue - total_cogs, 2),
            "purchase_spend": round(total_purchase_spend, 2),
            "inventory_value": round(inventory_value, 2),
            "inventory_units": round(sum(stock.values()), 3),
            "product_count": len(products),
            "low_stock_count": len(low_stock),
            "total_deposits": round(total_deposits, 2),
            "total_withdrawals": round(total_withdrawals, 2),
            "net_capital": round(net_capital, 2),
            "cash_balance": round(cash_balance, 2),
            "business_value": round(business_value, 2),
        },
        "low_stock": low_stock,
        "low_stock_threshold": low_stock_threshold,
    }

@app.route("/api/parts", methods=["GET", "POST"])
def parts_api():
    data = load_parts()

    if request.method == "GET":
        analytics = compute_parts_analytics(data)
        return jsonify({
            "products": data["products"],
            "stores": data["stores"],
            "car_models": data["car_models"],
            "purchases": data["purchases"],
            "sales": analytics["sales"],
            "capital_transactions": data["capital_transactions"],
            "stock": analytics["stock"],
            "avg_cost": analytics["avg_cost"],
            "by_product": analytics["by_product"],
            "by_store": analytics["by_store"],
            "totals": analytics["totals"],
            "low_stock": analytics["low_stock"],
            "low_stock_threshold": analytics["low_stock_threshold"],
        })

    body = request.json or {}
    action = body.get("action")

    # ── PRODUCTS ─────────────────────────────────────
    if action == "add_product":
        data["products"].append({
            "id": _new_id(),
            "name": body.get("name", "").strip(),
            "car_model": body.get("car_model", "").strip(),
            "part_type": body.get("part_type", "").strip(),
            "brand": body.get("brand", "").strip(),
            "variant": body.get("variant", "").strip(),
            "oem_code": body.get("oem_code", "").strip(),
            "category": body.get("category", "").strip(),
            "notes": body.get("notes", "").strip(),
            "torob_link": body.get("torob_link", "").strip(),
            "image": body.get("image", ""),
            "created_at": str(date.today()),
        })
    elif action == "update_product":
        for p in data["products"]:
            if p["id"] == body.get("id"):
                for k in ["name", "car_model", "part_type", "brand", "variant", "oem_code", "category", "notes", "torob_link"]:
                    if k in body:
                        p[k] = (body.get(k) or "").strip()
                if "image" in body:
                    p["image"] = body.get("image", "")
                break
    elif action == "delete_product":
        pid = body.get("id")
        data["products"] = [p for p in data["products"] if p["id"] != pid]

    # ── STORES ───────────────────────────────────────
    elif action == "add_store":
        data["stores"].append({
            "id": _new_id(),
            "name": body.get("name", "").strip(),
            "address": body.get("address", "").strip(),
            "phone": body.get("phone", "").strip(),
            "torob_link": body.get("torob_link", "").strip(),
            "website": body.get("website", "").strip(),
            "notes": body.get("notes", "").strip(),
            "image": body.get("image", ""),
            "created_at": str(date.today()),
        })
    elif action == "update_store":
        for s in data["stores"]:
            if s["id"] == body.get("id"):
                for k in ["name", "address", "phone", "torob_link", "website", "notes"]:
                    if k in body:
                        s[k] = (body.get(k) or "").strip()
                if "image" in body:
                    s["image"] = body.get("image", "")
                break
    elif action == "delete_store":
        sid = body.get("id")
        data["stores"] = [s for s in data["stores"] if s["id"] != sid]

    # ── CAR MODELS (managed list, used by the product multi-select) ──
    elif action == "add_car_model":
        data["car_models"].append({
            "id": _new_id(),
            "name": body.get("name", "").strip(),
            "created_at": str(date.today()),
        })
    elif action == "update_car_model":
        for cm in data["car_models"]:
            if cm["id"] == body.get("id"):
                if "name" in body:
                    cm["name"] = (body.get("name") or "").strip()
                break
    elif action == "delete_car_model":
        cmid = body.get("id")
        data["car_models"] = [cm for cm in data["car_models"] if cm["id"] != cmid]

    # ── PURCHASES (one store visit, many line items) ──
    elif action == "add_purchase":
        items = [{"product_id": it.get("product_id"), "qty": float(it.get("qty") or 0),
                   "unit_price": float(it.get("unit_price") or 0)} for it in body.get("items", [])]
        data["purchases"].append({
            "id": _new_id(),
            "store_id": body.get("store_id"),
            "order_date": body.get("order_date"),
            "receipt_date": body.get("receipt_date") or body.get("order_date"),
            "same_day": bool(body.get("same_day", True)),
            "items": items,
            "notes": body.get("notes", "").strip(),
            "created_at": str(date.today()),
        })
    elif action == "update_purchase":
        for pur in data["purchases"]:
            if pur["id"] == body.get("id"):
                if "store_id" in body: pur["store_id"] = body.get("store_id")
                if "order_date" in body: pur["order_date"] = body.get("order_date")
                if "receipt_date" in body: pur["receipt_date"] = body.get("receipt_date")
                if "same_day" in body: pur["same_day"] = bool(body.get("same_day"))
                if "notes" in body: pur["notes"] = (body.get("notes") or "").strip()
                if "items" in body:
                    pur["items"] = [{"product_id": it.get("product_id"), "qty": float(it.get("qty") or 0),
                                       "unit_price": float(it.get("unit_price") or 0)} for it in body.get("items", [])]
                break
    elif action == "delete_purchase":
        pid = body.get("id")
        data["purchases"] = [p for p in data["purchases"] if p["id"] != pid]

    # ── SALES (one customer/visit, many line items) ──
    elif action == "add_sale":
        items = [{"product_id": it.get("product_id"), "qty": float(it.get("qty") or 0),
                   "unit_price": float(it.get("unit_price") or 0)} for it in body.get("items", [])]
        data["sales"].append({
            "id": _new_id(),
            "date": body.get("date"),
            "customer_name": body.get("customer_name", "").strip(),
            "notes": body.get("notes", "").strip(),
            "items": items,
            "created_at": str(date.today()),
        })
    elif action == "update_sale":
        for sale in data["sales"]:
            if sale["id"] == body.get("id"):
                if "date" in body: sale["date"] = body.get("date")
                if "customer_name" in body: sale["customer_name"] = (body.get("customer_name") or "").strip()
                if "notes" in body: sale["notes"] = (body.get("notes") or "").strip()
                if "items" in body:
                    sale["items"] = [{"product_id": it.get("product_id"), "qty": float(it.get("qty") or 0),
                                        "unit_price": float(it.get("unit_price") or 0)} for it in body.get("items", [])]
                break
    elif action == "delete_sale":
        sid = body.get("id")
        data["sales"] = [s for s in data["sales"] if s["id"] != sid]

    elif action == "set_low_stock_threshold":
        try:
            data["low_stock_threshold"] = float(body.get("value", 2))
        except (TypeError, ValueError):
            pass

    # ── CASH / CAPITAL LEDGER (deposits & withdrawals) ─
    elif action == "add_capital_tx":
        tx_type = body.get("type")
        if tx_type not in ("deposit", "withdrawal"):
            return jsonify({"ok": False, "error": "type must be deposit or withdrawal"}), 400
        data["capital_transactions"].append({
            "id": _new_id(),
            "type": tx_type,
            "amount": float(body.get("amount") or 0),
            "date": body.get("date"),
            "note": body.get("note", "").strip(),
            "created_at": str(date.today()),
        })
    elif action == "update_capital_tx":
        for t in data["capital_transactions"]:
            if t["id"] == body.get("id"):
                if "type" in body and body.get("type") in ("deposit", "withdrawal"): t["type"] = body.get("type")
                if "amount" in body: t["amount"] = float(body.get("amount") or 0)
                if "date" in body: t["date"] = body.get("date")
                if "note" in body: t["note"] = (body.get("note") or "").strip()
                break
    elif action == "delete_capital_tx":
        tid = body.get("id")
        data["capital_transactions"] = [t for t in data["capital_transactions"] if t["id"] != tid]

    else:
        return jsonify({"ok": False, "error": "unknown action"}), 400

    save_parts(data)
    analytics = compute_parts_analytics(data)
    return jsonify({
        "ok": True,
        "products": data["products"],
        "stores": data["stores"],
        "car_models": data["car_models"],
        "purchases": data["purchases"],
        "sales": analytics["sales"],
        "capital_transactions": data["capital_transactions"],
        "stock": analytics["stock"],
        "avg_cost": analytics["avg_cost"],
        "by_product": analytics["by_product"],
        "by_store": analytics["by_store"],
        "totals": analytics["totals"],
        "low_stock": analytics["low_stock"],
        "low_stock_threshold": analytics["low_stock_threshold"],
    })


if __name__=="__main__":
    import webbrowser, threading
    threading.Timer(1.2, lambda: webbrowser.open("http://localhost:5050")).start()
    app.run(debug=False, port=5050)





