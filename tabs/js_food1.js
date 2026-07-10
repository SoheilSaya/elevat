// ══════════════════════════════════════════════════
// ─── FOOD LOG MODULE (v2 — redesigned UI) ─────────
// ══════════════════════════════════════════════════
// NOTE: All API calls, state shape (F.entry / F.ingredients / F.date),
// function names referenced by onclick="" elsewhere, and element IDs
// used by the (external) add-item modal markup are UNCHANGED on purpose.
// Only rendering / markup / styling was reworked.

const MEALS = [
  { id:'breakfast', label:'Breakfast', icon:'🌅' },
  { id:'lunch',     label:'Lunch',     icon:'☀️' },
  { id:'dinner',    label:'Dinner',    icon:'🌙' },
  { id:'snacks',    label:'Snacks',    icon:'🍎' },
];
const UNITS = ['g','kg','ml','L','cup','tbsp','tsp','slice','piece','bowl','plate','portion','handful','count','custom'];

// Soft display targets — matches the values already used throughout this
// module's stats/labels (kept identical, not a logic change).
const CAL_TARGET = 1500;
const PROT_TARGET = 176;

let F = {
  date: null, entry: null, ingredients: [], addingToMeal: null,
  jalaliToday: null, foodCharts: {}, activeTab: 'log', ingrSearch: '', editingIngrId: null
};

// ── Jalali helpers ────────────────────────────────
async function getJalaliToday() {
  if (F.jalaliToday) return F.jalaliToday;
  const r = await fetch('/api/jalali_today');
  F.jalaliToday = await r.json();
  return F.jalaliToday;
}

function gregorianToJalaliStr(gStr) {
  if (!F.jalaliToday) return gStr;
  const today = new Date(F.jalaliToday.gregorian + 'T12:00:00');
  const target = new Date(gStr + 'T12:00:00');
  const diffDays = Math.round((target - today) / 86400000);
  const jy = F.jalaliToday.year, jm = F.jalaliToday.month, jd = F.jalaliToday.day;
  let nd = jd + diffDays;
  let nm = jm, ny = jy;
  const daysInMonth = (m) => m <= 6 ? 31 : m <= 11 ? 30 : 29;
  while (nd > daysInMonth(nm)) { nd -= daysInMonth(nm); nm++; if (nm > 12) { nm = 1; ny++; } }
  while (nd < 1) { nm--; if (nm < 1) { nm = 12; ny--; } nd += daysInMonth(nm); }
  const months = ['Farvardin','Ordibehesht','Khordad','Tir','Mordad','Shahrivar','Mehr','Aban','Azar','Dey','Bahman','Esfand'];
  return { str: `${ny}/${String(nm).padStart(2,'0')}/${String(nd).padStart(2,'0')}`,
           label: `${months[nm-1]} ${nd}`, short: `${months[nm-1].slice(0,3)} ${nd}` };
}

function todayISO() {
  if (F.jalaliToday) return F.jalaliToday.gregorian;
  const d = new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

function formatFoodDate(gStr) {
  const today = todayISO();
  const yesterday = (() => { const d=new Date(today+'T12:00:00'); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); })();
  const j = gregorianToJalaliStr(gStr);
  if (gStr === today) return { main: 'Today', sub: j.label || gStr };
  if (gStr === yesterday) return { main: 'Yesterday', sub: j.label || gStr };
  return { main: j.label || gStr, sub: gStr };
}

// ── Init ──────────────────────────────────────────
async function initFood() {
  injectFoodStyles();
  await getJalaliToday();
  F.date = activeDate || todayISO();
  F._logCache = null;
  await loadIngredients();
  await loadFoodEntry();
}

async function loadIngredients() {
  const r = await fetch('/api/food/ingredients');
  F.ingredients = await r.json();
}

async function loadFoodEntry() {
  const r = await fetch('/api/food/log?date=' + F.date);
  const d = await r.json();
  F.entry = d.entry;
  if (!F.entry.meals || !F.entry.meals.length) {
    F.entry.meals = MEALS.map(m => ({ meal_id: m.id, items: [] }));
  }
  renderFoodView();
}

async function saveFoodEntry() {
  await fetch('/api/food/log', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ date: F.date, ...F.entry })
  });
  F._logCache = null; // invalidate smart-sort cache so next open re-fetches
}

function changeFoodDate(delta) {
  const d = new Date(F.date + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  const nd = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const diff = (new Date(todayISO()) - new Date(nd)) / 86400000;
  if (diff < 0 || diff > 2) { showToast('Only today or up to 2 days back',''); return; }
  F.date = nd;
  activeDate = (nd === todayISO()) ? null : nd;
  F._logCache = null;
  renderDateSwitcher();
  const banner = document.getElementById('editingBanner');
  if (activeDate) {
    const dd = new Date(activeDate+'T12:00:00');
    document.getElementById('editingBannerText').textContent =
      'Editing ' + dd.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
    banner.classList.add('show');
  } else {
    banner.classList.remove('show');
  }
  loadFoodEntry();
}

// ── Tab switching ─────────────────────────────────
function foodTab(tab) {
  F.activeTab = tab;
  document.querySelectorAll('.food-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('food-log-panel').style.display = tab === 'log' ? 'block' : 'none';
  document.getElementById('food-stats-panel').style.display = tab === 'stats' ? 'block' : 'none';
  if (tab === 'stats') loadFoodStats();
}

// ── Injected styles (once) ────────────────────────
function injectFoodStyles() {
  if (document.getElementById('food-v2-styles')) return;
  const s = document.createElement('style');
  s.id = 'food-v2-styles';
  s.textContent = `
    #food-app{ --f-ok:var(--sage,#3a7a5a); --f-warn:var(--amber,#d4821a); --f-bad:var(--coral,#e85d3a);
      --f-track:var(--cream2,#efe6d8); --f-card:var(--cream1,#fffaf2); }
    .food-hero{ display:grid; grid-template-columns:auto 1fr; gap:22px; align-items:center;
      background:linear-gradient(135deg,var(--f-card),var(--cream2,#efe6d8)); border:1.5px solid var(--warm,#e4d6bf);
      border-radius:20px; padding:20px 22px; margin-bottom:18px; box-shadow:0 2px 10px rgba(60,40,10,.05); }
    .food-rings{ display:flex; gap:16px; }
    .food-ring{ width:84px;height:84px;border-radius:50%; position:relative; display:flex; align-items:center; justify-content:center;
      background:conic-gradient(var(--ring-color,var(--f-ok)) var(--ring-pct,0%), var(--f-track) 0); transition:background 0.4s ease; }
    .food-ring::before{ content:''; position:absolute; inset:7px; background:var(--f-card); border-radius:50%; box-shadow:inset 0 1px 3px rgba(0,0,0,.05); }
    .food-ring-inner{ position:relative; z-index:1; text-align:center; line-height:1.1; }
    .food-ring-val{ font-family:'Fraunces',serif; font-weight:700; font-size:16px; color:var(--text2,#3a2f22); }
    .food-ring-lbl{ font-size:9.5px; color:var(--text4,#a8967c); text-transform:uppercase; letter-spacing:.05em; }
    .food-hero-right{ display:flex; flex-direction:column; gap:8px; min-width:0; }
    .food-hero-title{ font-family:'Fraunces',serif; font-size:16px; font-weight:600; color:var(--text2,#3a2f22); }
    .food-hero-sub{ font-size:12px; color:var(--text3,#8a7a63); }
    .food-meal-dots{ display:flex; gap:8px; margin-top:2px; flex-wrap:wrap; }
    .food-meal-dot{ display:flex; align-items:center; gap:5px; font-size:11px; padding:4px 9px; border-radius:20px;
      background:var(--cream2,#efe6d8); color:var(--text4,#a8967c); border:1px solid transparent; transition:all .2s; }
    .food-meal-dot.filled{ background:rgba(58,122,90,.12); color:var(--f-ok); border-color:rgba(58,122,90,.25); font-weight:600; }

    .food-date-bar-v2{ display:flex; align-items:center; gap:12px; margin-bottom:16px; }
    .food-date-btn-v2{ width:34px; height:34px; border-radius:50%; border:1.5px solid var(--warm,#e4d6bf); background:var(--f-card);
      color:var(--text2,#3a2f22); font-size:16px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .15s; }
    .food-date-btn-v2:hover{ background:var(--cream2,#efe6d8); transform:scale(1.06); }
    .food-date-center-v2{ flex:1; text-align:center; }
    .food-date-label-v2{ font-family:'Fraunces',serif; font-weight:700; font-size:17px; color:var(--text2,#3a2f22); }
    .food-date-sub-v2{ font-size:11.5px; color:var(--text3,#8a7a63); margin-top:1px; }

    .food-tabbar-v2{ display:inline-flex; gap:4px; background:var(--cream2,#efe6d8); border-radius:50px; padding:4px;
      border:1.5px solid var(--warm,#e4d6bf); margin-bottom:20px; }
    .food-tabbar-v2 .food-tab-btn{ border:none; background:transparent; border-radius:50px; font-size:13px; font-weight:600;
      padding:9px 20px; cursor:pointer; color:var(--text3,#8a7a63); transition:all .18s; }
    .food-tabbar-v2 .food-tab-btn.active{ background:var(--f-card); color:var(--text2,#3a2f22); box-shadow:0 1px 4px rgba(0,0,0,.08); }

    .fm-card{ background:var(--f-card); border:1.5px solid var(--warm,#e4d6bf); border-radius:18px; padding:18px 20px; margin-bottom:16px;
      box-shadow:0 1px 6px rgba(60,40,10,.04); }
    .fm-card-title{ font-family:'Fraunces',serif; font-weight:600; font-size:15px; color:var(--text2,#3a2f22);
      display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-bottom:14px; }
    .fm-card-title span{ font-size:11.5px; font-weight:500; color:var(--text4,#a8967c); }

    .meal-card-v2{ background:var(--f-card); border:1.5px solid var(--warm,#e4d6bf); border-radius:18px; padding:16px 18px; margin-bottom:14px;
      box-shadow:0 1px 6px rgba(60,40,10,.04); border-left:4px solid var(--meal-accent,var(--f-ok)); transition:box-shadow .2s; }
    .meal-card-v2:hover{ box-shadow:0 3px 12px rgba(60,40,10,.08); }
    .meal-card-head-v2{ display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
    .meal-card-title-v2{ display:flex; align-items:center; gap:9px; font-family:'Fraunces',serif; font-weight:600; font-size:14.5px; color:var(--text2,#3a2f22); }
    .meal-icon-bubble{ width:30px;height:30px;border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:15px;
      background:color-mix(in srgb, var(--meal-accent,var(--f-ok)) 16%, transparent); }
    .meal-add-btn-v2{ border:1.5px solid var(--meal-accent,var(--f-ok)); color:var(--meal-accent,var(--f-ok)); background:transparent;
      border-radius:50px; font-size:12px; font-weight:600; padding:6px 13px; cursor:pointer; transition:all .15s; }
    .meal-add-btn-v2:hover{ background:var(--meal-accent,var(--f-ok)); color:#fff; }
    .meal-item-row-v2{ display:flex; align-items:center; gap:11px; padding:9px 6px; border-radius:10px; transition:background .15s; }
    .meal-item-row-v2:hover{ background:var(--cream2,#efe6d8); }
    .meal-item-row-v2 + .meal-item-row-v2{ border-top:1px dashed var(--cream3,#e4d6bf); }
    .meal-item-icon-v2{ width:32px;height:32px;border-radius:9px; background:var(--cream2,#efe6d8); display:flex; align-items:center; justify-content:center; font-size:15px; flex-shrink:0; }
    .meal-item-body-v2{ flex:1; min-width:0; }
    .meal-item-name-v2{ font-size:13.5px; font-weight:600; color:var(--text2,#3a2f22); }
    .meal-item-detail-v2{ font-size:11px; color:var(--text4,#a8967c); margin-top:1px; }
    .meal-item-macros-v2{ font-size:11px; color:var(--text3,#8a7a63); font-family:'JetBrains Mono',monospace; white-space:nowrap; text-align:right; }
    .meal-item-del-v2{ width:22px;height:22px; border-radius:50%; border:none; background:transparent; color:var(--text4,#a8967c);
      font-size:16px; cursor:pointer; opacity:0; transition:all .15s; flex-shrink:0; }
    .meal-item-row-v2:hover .meal-item-del-v2{ opacity:1; }
    .meal-item-del-v2:hover{ background:var(--f-bad); color:#fff; }
    .meal-empty-v2{ text-align:center; padding:16px 8px; color:var(--text4,#a8967c); font-size:12.5px; font-style:italic; border:1.5px dashed var(--cream3,#e4d6bf); border-radius:12px; }

    .ingr-search-v2{ width:100%; padding:9px 13px; border-radius:10px; border:1.5px solid var(--cream3,#e4d6bf); background:var(--cream2,#efe6d8);
      font-size:13px; margin-bottom:12px; box-sizing:border-box; }
    .ingr-grid-v2{ display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:10px; margin-bottom:14px; max-height:340px; overflow-y:auto; padding-right:2px; }
    .ingr-tile-v2{ background:var(--cream2,#efe6d8); border:1.5px solid transparent; border-radius:13px; padding:11px; cursor:pointer;
      transition:all .15s; position:relative; }
    .ingr-tile-v2:hover{ border-color:var(--f-ok); transform:translateY(-2px); box-shadow:0 3px 10px rgba(60,40,10,.08); }
    .ingr-tile-icon-v2{ font-size:19px; margin-bottom:4px; }
    .ingr-tile-name-v2{ font-size:12.5px; font-weight:600; color:var(--text2,#3a2f22); line-height:1.2; }
    .ingr-tile-meta-v2{ font-size:10px; color:var(--text4,#a8967c); margin-top:3px; }
    .ingr-tile-badges-v2{ display:flex; gap:4px; margin-top:6px; flex-wrap:wrap; }
    .ingr-badge-v2{ font-size:9.5px; font-weight:700; padding:2px 6px; border-radius:6px; font-family:'JetBrains Mono',monospace; }
    .ingr-badge-cal{ background:rgba(212,130,26,.15); color:var(--f-warn); }
    .ingr-badge-prot{ background:rgba(58,122,90,.15); color:var(--f-ok); }
    .ingr-tile-del-v2{ position:absolute; top:6px; right:6px; width:18px;height:18px; border-radius:50%; border:none; background:rgba(0,0,0,.06);
      color:var(--text4,#a8967c); font-size:12px; line-height:1; cursor:pointer; opacity:0; transition:opacity .15s; }
    .ingr-tile-v2:hover .ingr-tile-del-v2{ opacity:1; }
    .ingr-tile-del-v2:hover{ background:var(--f-bad); color:#fff; }

    .stat-tiles-v2{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin-bottom:20px; }
    .stat-tile-v2{ background:var(--f-card); border:1.5px solid var(--warm,#e4d6bf); border-radius:16px; padding:15px 16px;
      box-shadow:0 1px 6px rgba(60,40,10,.04); }
    .stat-tile-icon-v2{ width:32px;height:32px;border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:15px; margin-bottom:8px; }
    .stat-tile-label-v2{ font-size:10.5px; text-transform:uppercase; letter-spacing:.05em; color:var(--text4,#a8967c); font-weight:700; }
    .stat-tile-val-v2{ font-family:'Fraunces',serif; font-size:22px; font-weight:700; margin:3px 0 2px; }
    .stat-tile-sub-v2{ font-size:11px; color:var(--text4,#a8967c); }
    .stat-tile-trend-v2{ font-size:11px; font-weight:700; margin-top:6px; display:inline-block; padding:2px 8px; border-radius:20px; }

    .fchart-card-v2{ background:var(--f-card); border:1.5px solid var(--warm,#e4d6bf); border-radius:16px; padding:16px 18px;
      box-shadow:0 1px 6px rgba(60,40,10,.04); }
    .fchart-title-v2{ font-family:'Fraunces',serif; font-weight:600; font-size:13.5px; color:var(--text2,#3a2f22); display:flex; align-items:center; gap:6px; }
    .fchart-sub-v2{ font-size:11px; color:var(--text4,#a8967c); margin:2px 0 10px; }

    .claude-prompt-card-v2{ background:linear-gradient(135deg,#2a2440,#1c1830); border-radius:16px; padding:18px 20px; margin-bottom:16px; color:#e8e3f5; }
    .claude-prompt-title-v2{ font-family:'Fraunces',serif; font-weight:600; font-size:14.5px; display:flex; align-items:center; gap:7px; }
    .claude-prompt-sub-v2{ font-size:11.5px; opacity:.7; margin:4px 0 10px; }
    .claude-prompt-box-v2{ background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1); border-radius:10px; padding:12px 14px;
      font-family:'JetBrains Mono',monospace; font-size:11.5px; line-height:1.6; white-space:pre-wrap; max-height:180px; overflow-y:auto; margin-bottom:10px; }
    .claude-copy-btn-v2{ background:#8b7fd6; border:none; color:#fff; font-weight:600; font-size:12.5px; padding:9px 16px; border-radius:9px; cursor:pointer; transition:all .15s; }
    .claude-copy-btn-v2:hover{ background:#a094e8; }

    /* full-width stacked charts */
    .fcharts-col-v2{ display:flex; flex-direction:column; gap:14px; margin-bottom:20px; }
    .fcharts-col-v2 .fchart-card-v2{ width:100%; box-sizing:border-box; }

    /* meal balance bars (no canvas) */
    .meal-bal-row-v2{ display:flex; align-items:center; gap:10px; margin-bottom:10px; }
    .meal-bal-label-v2{ width:96px; font-size:12.5px; font-weight:600; color:var(--text2,#3a2f22); flex-shrink:0; }
    .meal-bal-track-v2{ flex:1; height:10px; border-radius:6px; background:var(--cream2,#efe6d8); overflow:hidden; }
    .meal-bal-fill-v2{ height:100%; border-radius:6px; }
    .meal-bal-pct-v2{ width:46px; text-align:right; font-size:12px; font-family:'JetBrains Mono',monospace; color:var(--text3,#8a7a63); flex-shrink:0; }

    /* ingredient edit mode */
    .ingr-form-editing-v2{ border:1.5px solid var(--sky,#2a6a9a); background:rgba(42,106,154,.06); border-radius:12px; padding:10px 12px; margin-bottom:8px;
      display:flex; align-items:center; justify-content:space-between; font-size:12.5px; color:var(--sky,#2a6a9a); font-weight:600; }
    .ingr-form-cancel-v2{ background:transparent; border:1.5px solid var(--sky,#2a6a9a); color:var(--sky,#2a6a9a); border-radius:20px;
      font-size:11.5px; font-weight:600; padding:4px 11px; cursor:pointer; }
    .ingr-tile-edit-v2{ position:absolute; top:6px; right:28px; width:18px;height:18px; border-radius:50%; border:none; background:rgba(0,0,0,.06);
      color:var(--text4,#a8967c); font-size:10.5px; line-height:1; cursor:pointer; opacity:0; transition:opacity .15s; display:flex;align-items:center;justify-content:center; }
    .ingr-tile-v2:hover .ingr-tile-edit-v2{ opacity:1; }
    .ingr-tile-edit-v2:hover{ background:var(--sky,#2a6a9a); color:#fff; }

    /* full history */
    .fhist-list-v2{ max-height:520px; overflow-y:auto; padding-right:2px; }
    .fhist-row-v2{ display:flex; align-items:center; gap:14px; padding:11px 12px; border-radius:12px; cursor:pointer; transition:background .15s; }
    .fhist-row-v2:hover{ background:var(--cream2,#efe6d8); }
    .fhist-row-v2 + .fhist-row-v2{ border-top:1px solid var(--cream2,#efe6d8); }
    .fhist-date-v2{ width:120px; flex-shrink:0; }
    .fhist-date-main-v2{ font-size:13px; font-weight:700; color:var(--text2,#3a2f22); }
    .fhist-date-sub-v2{ font-size:10.5px; color:var(--text4,#a8967c); }
    .fhist-metrics-v2{ display:flex; gap:16px; flex:1; flex-wrap:wrap; }
    .fhist-metric-v2{ font-size:12px; color:var(--text3,#8a7a63); font-family:'JetBrains Mono',monospace; }
    .fhist-chevron-v2{ color:var(--text4,#a8967c); font-size:13px; transition:transform .18s; flex-shrink:0; }
    .fhist-row-v2.open .fhist-chevron-v2{ transform:rotate(90deg); }
    .fhist-details-v2{ display:none; padding:4px 12px 14px 146px; font-size:12.5px; color:var(--text3,#8a7a63); }
    .fhist-row-v2.open + .fhist-details-v2{ display:block; }
    .fhist-meal-line-v2{ margin-bottom:4px; }
    .fhist-meal-line-v2 b{ color:var(--text2,#3a2f22); }
  `;
  document.head.appendChild(s);
}

// ── Helpers for hero ──────────────────────────────
function ringColor(pct) {
  if (pct >= 85 && pct <= 115) return 'var(--f-ok)';
  if (pct > 130 || pct < 50) return 'var(--f-bad)';
  return 'var(--f-warn)';
}

// ── Render main ───────────────────────────────────
function renderFoodView() {
  injectFoodStyles();
  const app = document.getElementById('food-app');
  const dl = formatFoodDate(F.date);
  const totalCal = F.entry.calories || 0;
  const totalProt = F.entry.protein || 0;
  const totalItems = (F.entry.meals||[]).reduce((s,m) => s+(m.items||[]).length, 0);

  const calPct = Math.min(100, Math.round((totalCal / CAL_TARGET) * 100)) || 0;
  const protPct = Math.min(100, Math.round((totalProt / PROT_TARGET) * 100)) || 0;
  const calColor = ringColor(Math.round((totalCal / CAL_TARGET) * 100) || 0);
  const protColor = ringColor(Math.round((totalProt / PROT_TARGET) * 100) || 0);

  const mealFillStatus = MEALS.map(m => {
    const md = (F.entry.meals||[]).find(x => x.meal_id === m.id);
    return { ...m, filled: !!(md && md.items && md.items.length) };
  });

  const editIngr = F.editingIngrId ? F.ingredients.find(i => i.id === F.editingIngrId) : null;
  const STANDARD_UNITS = UNITS.filter(u => u !== 'custom');
  const editIngrIsCustomUnit = !!(editIngr && !STANDARD_UNITS.includes(editIngr.unit));

  app.innerHTML = `
  <!-- Date bar -->
  <div class="food-date-bar-v2">
    <button class="food-date-btn-v2" onclick="changeFoodDate(-1)">‹</button>
    <div class="food-date-center-v2">
      <div class="food-date-label-v2">${dl.main}</div>
      <div class="food-date-sub-v2">${dl.sub} · ${totalItems} item${totalItems!==1?'s':''} logged</div>
    </div>
    <button class="food-date-btn-v2" onclick="changeFoodDate(1)">›</button>
  </div>

  <!-- Tab bar -->
  <div class="food-tabbar-v2">
    <button class="food-tab-btn ${F.activeTab==='log'?'active':''}" data-tab="log" onclick="foodTab('log')">📋 Food Log</button>
    <button class="food-tab-btn ${F.activeTab==='stats'?'active':''}" data-tab="stats" onclick="foodTab('stats')">📊 Stats & History</button>
  </div>

  <div id="food-log-panel" style="display:${F.activeTab==='log'?'block':'none'}">

    <!-- Hero: today's rings -->
    <div class="food-hero">
      <div class="food-rings">
        <div class="food-ring" style="--ring-pct:${calPct}%;--ring-color:${calColor}">
          <div class="food-ring-inner"><div class="food-ring-val">${totalCal}</div><div class="food-ring-lbl">kcal</div></div>
        </div>
        <div class="food-ring" style="--ring-pct:${protPct}%;--ring-color:${protColor}">
          <div class="food-ring-inner"><div class="food-ring-val">${totalProt}g</div><div class="food-ring-lbl">protein</div></div>
        </div>
      </div>
      <div class="food-hero-right">
        <div class="food-hero-title">Today's Nutrition</div>
        <div class="food-hero-sub">${CAL_TARGET} kcal · ${PROT_TARGET}g protein target</div>
        <div class="food-meal-dots">
          ${mealFillStatus.map(m => `<div class="food-meal-dot ${m.filled?'filled':''}">${m.icon} ${m.label}${m.filled?' ✓':''}</div>`).join('')}
        </div>
      </div>
    </div>

    <div class="food-grid">
      <div>
        <!-- Macros -->
        <div class="fm-card">
          <div class="fm-card-title">🔢 Nutrition Summary <span>↔ syncs with Today tab</span></div>
          <div class="macro-row">
            <div class="macro-label">Calories</div>
            <input type="number" class="macro-input" id="fCalories" value="${totalCal||''}" placeholder="0" oninput="updateMacros()"/>
            <div class="macro-unit">kcal</div>
          </div>
          <div class="macro-row">
            <div class="macro-label">Protein</div>
            <input type="number" class="macro-input" id="fProtein" value="${totalProt||''}" placeholder="0" oninput="updateMacros()"/>
            <div class="macro-unit">g</div>
          </div>
          <div style="margin-top:12px;">
            <div class="builder-label" style="margin-bottom:6px;">Notes / Description</div>
            <textarea class="food-notes" id="fNotes" placeholder="How did you feel? Anything notable...">${F.entry.notes||''}</textarea>
          </div>
          <button class="save-btn" onclick="saveMacros()" style="margin-top:12px;padding:12px;font-size:14px;">Save Nutrition Data</button>
        </div>

        <!-- Claude prompt -->
        <div class="claude-prompt-card-v2">
          <div class="claude-prompt-title-v2">🤖 Claude Calorie Estimator</div>
          <div class="claude-prompt-sub-v2">Copy this prompt into Claude to get calorie estimates, then enter the numbers above.</div>
          <div class="claude-prompt-box-v2" id="claudePromptBox">${buildClaudePrompt()}</div>
          <button class="claude-copy-btn-v2" onclick="copyClaudePrompt()">📋 Copy Prompt to Clipboard</button>
        </div>

        <!-- Ingredient library -->
        <div class="fm-card">
          <div class="fm-card-title">🧺 Ingredient Library <span>${F.ingredients.length} saved</span></div>
          <input type="text" class="ingr-search-v2" id="ingrSearchInput" placeholder="🔎 Search ingredients..." value="${F.ingrSearch||''}" oninput="filterIngredients(this.value)"/>
          <div class="ingr-grid-v2" id="ingrGrid">${renderIngrGrid()}</div>
          <div style="border-top:1.5px solid var(--cream2);padding-top:14px;display:flex;flex-direction:column;gap:8px;" id="ingrFormWrap">
            ${editIngr ? `<div class="ingr-form-editing-v2">✎ Editing "${editIngr.name}" <button class="ingr-form-cancel-v2" onclick="cancelEditIngredient()">Cancel</button></div>` : ''}
            <div style="display:grid;grid-template-columns:1fr 56px;gap:8px;">
              <input type="text" class="m-input" id="newIngrName" placeholder="Name (e.g. Chicken breast)" style="width:100%;" value="${editIngr?editIngr.name:''}"/>
              <input type="text" class="m-input" id="newIngrIcon" placeholder="🍗" style="text-align:center;font-size:16px;width:100%;" value="${editIngr?editIngr.icon:''}"/>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 80px;gap:8px;">
              <select class="builder-select" id="newIngrUnit" onchange="toggleCustomUnit(this)">${UNITS.map(u=>'<option value="'+u+'"'+((u==='custom'?editIngrIsCustomUnit:(editIngr&&editIngr.unit===u))?' selected':'')+'>'+u+'</option>').join('')}</select>
              <select class="builder-select" id="newIngrCategory">
                ${['protein','carb','fat','veg','fruit','dairy','drink','other'].map(c=>`<option value="${c}"${editIngr&&editIngr.category===c?' selected':''}>${c.charAt(0).toUpperCase()+c.slice(1)}</option>`).join('')}
              </select>
              <button class="m-btn sage" id="ingrSubmitBtn" onclick="submitIngredientForm()" style="white-space:nowrap;">${editIngr?'💾 Save':'+ Add'}</button>
            </div>
            <input type="text" class="m-input" id="newIngrCustomUnit" placeholder='Describe unit e.g. "10 inch pizza", "پرس چلوکباب"' style="display:${editIngrIsCustomUnit?'block':'none'};width:100%;" value="${editIngrIsCustomUnit?editIngr.unit:''}"/>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <input type="number" class="m-input" id="newIngrCalories" placeholder="kcal per unit" step="0.1" min="0" style="width:100%;" value="${editIngr?(Math.round((editIngr.calories||0)/1.1*10)/10)||'':''}"/>
              <input type="number" class="m-input" id="newIngrProtein" placeholder="Protein g per unit" step="0.1" min="0" style="width:100%;" value="${editIngr?(editIngr.protein||''):''}"/>
            </div>
            <div style="font-size:11px;color:var(--text4);font-style:italic;">Calories get +10% bumped automatically on save, to keep estimates cautious</div>
          </div>
        </div>
      </div>

      <!-- Meal blocks -->
      <div>
        ${MEALS.map(m => renderMealBlock(m)).join('')}
      </div>
    </div>
  </div>

  <div id="food-stats-panel" style="display:${F.activeTab==='stats'?'block':'none'}">
    <div id="foodStatsContent"><div style="text-align:center;padding:40px;color:var(--text3);font-style:italic;">Loading stats...</div></div>
  </div>`;

  if (F.activeTab === 'stats') loadFoodStats();
}

// ── Ingredient search (client-side, non-destructive) ──
function filterIngredients(term) {
  F.ingrSearch = term;
  const grid = document.getElementById('ingrGrid');
  if (grid) grid.innerHTML = renderIngrGrid();
}

// ── Meal blocks ───────────────────────────────────
const MEAL_ACCENTS = { breakfast:'var(--f-warn)', lunch:'var(--sky,#2a6a9a)', dinner:'var(--plum,#7a3a6a)', snacks:'var(--f-ok)' };

function renderMealBlock(mealDef) {
  const mealData = (F.entry.meals||[]).find(m => m.meal_id === mealDef.id) || { meal_id: mealDef.id, items: [] };
  const items = mealData.items || [];
  const accent = MEAL_ACCENTS[mealDef.id] || 'var(--f-ok)';
  return `
  <div class="meal-card-v2" style="--meal-accent:${accent}">
    <div class="meal-card-head-v2">
      <div class="meal-card-title-v2"><div class="meal-icon-bubble">${mealDef.icon}</div>${mealDef.label}</div>
      <button class="meal-add-btn-v2" onclick="openFoodItemModal('${mealDef.id}')">+ Add item</button>
    </div>
    <div class="meal-items">
      ${items.length ? items.map((item,i) => `
        <div class="meal-item-row-v2">
          <div class="meal-item-icon-v2">${item.icon||'🍽️'}</div>
          <div class="meal-item-body-v2">
            <div class="meal-item-name-v2">${item.name}</div>
            ${item.note ? '<div class="meal-item-detail-v2">'+item.note+'</div>' : ''}
          </div>
          <div class="meal-item-macros-v2">${item.qty} ${item.unit}${item.calories?'<br>'+item.calories+' kcal':''}${item.protein?' · '+item.protein+'g P':''}</div>
          <button class="meal-item-del-v2" onclick="removeMealItem('${mealDef.id}',${i})">×</button>
        </div>`).join('') : '<div class="meal-empty-v2">Nothing added yet</div>'}
    </div>
  </div>`;
}

function renderIngrGrid() {
  const term = (F.ingrSearch||'').trim().toLowerCase();
  const list = term ? F.ingredients.filter(i => i.name.toLowerCase().includes(term)) : F.ingredients;
  if (!F.ingredients.length) return '<div style="grid-column:1/-1;color:var(--text4);font-size:13px;padding:8px;font-style:italic;">No ingredients yet — add some below</div>';
  if (!list.length) return '<div style="grid-column:1/-1;color:var(--text4);font-size:13px;padding:8px;font-style:italic;">No matches for "'+term+'"</div>';
  return list.map(i => `
    <div class="ingr-tile-v2" onclick="quickAddIngredient('${i.id}')">
      <button class="ingr-tile-del-v2" onclick="event.stopPropagation();deleteIngredient('${i.id}')" title="Delete">×</button>
      <button class="ingr-tile-edit-v2" onclick="event.stopPropagation();startEditIngredient('${i.id}')" title="Edit">✎</button>
      <div class="ingr-tile-icon-v2">${i.icon}</div>
      <div class="ingr-tile-name-v2">${i.name}</div>
      <div class="ingr-tile-meta-v2">${i.unit} · ${i.category}</div>
      ${(i.calories||i.protein) ? `<div class="ingr-tile-badges-v2">
        ${i.calories ? '<span class="ingr-badge-v2 ingr-badge-cal">'+i.calories+'kcal</span>' : ''}
        ${i.protein ? '<span class="ingr-badge-v2 ingr-badge-prot">'+i.protein+'g P</span>' : ''}
      </div>` : ''}
    </div>`).join('');
}

// ── Stats & History ───────────────────────────────
let foodHistChart = {}, foodStatsLoaded = false;

async function loadFoodStats() {
  const r = await fetch('/api/food/stats');
  const data = await r.json();
  renderFoodStats(data);
}

// Extra, more interesting stats derived purely from what /api/food/stats
// already returns — no new endpoints needed.
function computeExtraFoodStats(data) {
  const cals = data.daily_calories || [];
  const prots = data.daily_protein || [];
  const fullLog = data.full_log || [];

  // Current streak: consecutive most-recent days with something logged.
  // (cals is assumed chronological ascending, like the chart x-axis.)
  let streak = 0;
  for (let i = cals.length - 1; i >= 0; i--) { if (cals[i].val > 0) streak++; else break; }

  // Protein target hit-rate
  const loggedProt = prots.filter(d => d.val > 0);
  const hitDays = loggedProt.filter(d => d.val >= PROT_TARGET).length;
  const hitRate = loggedProt.length ? Math.round((hitDays / loggedProt.length) * 100) : 0;

  // Weekday vs weekend average calories
  let wd = [], we = [];
  cals.forEach(d => {
    if (d.val > 0 && d.date) {
      const day = new Date(d.date + 'T12:00:00').getDay();
      (day === 0 || day === 6 ? we : wd).push(d.val);
    }
  });
  const avgWd = wd.length ? Math.round(wd.reduce((a,b)=>a+b,0)/wd.length) : 0;
  const avgWe = we.length ? Math.round(we.reduce((a,b)=>a+b,0)/we.length) : 0;

  // This week vs previous week (last 7 logged days vs the 7 before that)
  const loggedCal = cals.filter(d => d.val > 0);
  const last7 = loggedCal.slice(-7);
  const prev7 = loggedCal.slice(-14, -7);
  const avgLast7 = last7.length ? Math.round(last7.reduce((a,b)=>a+b.val,0)/last7.length) : 0;
  const avgPrev7 = prev7.length ? Math.round(prev7.reduce((a,b)=>a+b.val,0)/prev7.length) : 0;
  const trendDelta = avgPrev7 ? Math.round(((avgLast7 - avgPrev7) / avgPrev7) * 100) : 0;

  // Calorie contribution by meal slot (from the full log)
  const mealCals = { breakfast:0, lunch:0, dinner:0, snacks:0 };
  fullLog.forEach(entry => {
    (entry.meals || []).forEach(m => {
      const sum = (m.items || []).reduce((s,it) => s + (it.calories||0), 0);
      if (mealCals[m.meal_id] !== undefined) mealCals[m.meal_id] += sum;
    });
  });
  const mealCalTotal = Object.values(mealCals).reduce((a,b)=>a+b,0) || 1;

  return { streak, hitRate, avgWd, avgWe, avgLast7, avgPrev7, trendDelta, mealCals, mealCalTotal };
}

function renderFoodStats(data) {
  const el = document.getElementById('foodStatsContent');
  if (!el) return;

  const cals = data.daily_calories || [];
  const prots = data.daily_protein || [];
  const ingrs = data.ingredients || [];

  const avgCal = cals.length ? Math.round(cals.filter(d=>d.val>0).reduce((s,d)=>s+d.val,0) / (cals.filter(d=>d.val>0).length||1)) : 0;
  const avgProt = prots.length ? Math.round(prots.filter(d=>d.val>0).reduce((s,d)=>s+d.val,0) / (prots.filter(d=>d.val>0).length||1)) : 0;
  const totalIngr = ingrs.reduce((s,i)=>s+i.count,0);
  const topFood = ingrs[0] ? ingrs[0].icon + ' ' + ingrs[0].name : '—';
  const xs = computeExtraFoodStats(data);

  Object.values(foodHistChart).forEach(c=>{try{c.destroy();}catch(e){}});
  foodHistChart = {};

  const calOk = avgCal>=2000&&avgCal<=2800;
  const protOk = avgProt>=160;
  const trendUp = xs.trendDelta > 0;
  const trendFlat = xs.trendDelta === 0;
  const mealLabels = { breakfast:'🌅 Breakfast', lunch:'☀️ Lunch', dinner:'🌙 Dinner', snacks:'🍎 Snacks' };
  const mealColors = { breakfast:'var(--f-warn)', lunch:'var(--sky,#2a6a9a)', dinner:'var(--plum,#7a3a6a)', snacks:'var(--f-ok)' };

  el.innerHTML = `
  <!-- Summary row -->
  <div class="stat-tiles-v2">
    <div class="stat-tile-v2">
      <div class="stat-tile-icon-v2" style="background:rgba(212,130,26,.15);">🔥</div>
      <div class="stat-tile-label-v2">Avg Calories</div>
      <div class="stat-tile-val-v2" style="color:var(--f-warn)">${avgCal > 0 ? avgCal : '—'}</div>
      <div class="stat-tile-sub-v2">kcal/day (logged days)</div>
      <div class="stat-tile-trend-v2" style="background:${calOk?'rgba(58,122,90,.15)':'rgba(212,130,26,.15)'};color:${calOk?'var(--f-ok)':'var(--f-warn)'}">${calOk?'✓ On target':'Adjust intake'}</div>
    </div>
    <div class="stat-tile-v2">
      <div class="stat-tile-icon-v2" style="background:rgba(58,122,90,.15);">💪</div>
      <div class="stat-tile-label-v2">Avg Protein</div>
      <div class="stat-tile-val-v2" style="color:var(--f-ok)">${avgProt > 0 ? avgProt+'g' : '—'}</div>
      <div class="stat-tile-sub-v2">per logged day</div>
      <div class="stat-tile-trend-v2" style="background:${protOk?'rgba(58,122,90,.15)':'rgba(232,93,58,.15)'};color:${protOk?'var(--f-ok)':'var(--f-bad)'}">${protOk?'✓ Great':'Aim for 176g'}</div>
    </div>
    <div class="stat-tile-v2">
      <div class="stat-tile-icon-v2" style="background:rgba(42,106,154,.15);">📅</div>
      <div class="stat-tile-label-v2">Days Logged</div>
      <div class="stat-tile-val-v2" style="color:var(--sky,#2a6a9a)">${data.total_days}</div>
      <div class="stat-tile-sub-v2">total food entries</div>
      <div class="stat-tile-trend-v2" style="background:var(--cream2);color:var(--text3)">${totalIngr} total servings</div>
    </div>
    <div class="stat-tile-v2">
      <div class="stat-tile-icon-v2" style="background:rgba(122,58,106,.15);">⭐</div>
      <div class="stat-tile-label-v2">Most Eaten</div>
      <div class="stat-tile-val-v2" style="font-size:18px;">${topFood}</div>
      <div class="stat-tile-sub-v2">${ingrs[0] ? ingrs[0].count+' times logged' : 'No data yet'}</div>
      <div class="stat-tile-trend-v2" style="background:var(--cream2);color:var(--text3)">${ingrs[0] ? ingrs[0].total_qty+' '+ingrs[0].unit+' total' : ''}</div>
    </div>
  </div>

  <!-- Extra stats row -->
  <div class="stat-tiles-v2">
    <div class="stat-tile-v2">
      <div class="stat-tile-icon-v2" style="background:rgba(212,130,26,.15);">🔥</div>
      <div class="stat-tile-label-v2">Current Streak</div>
      <div class="stat-tile-val-v2" style="color:var(--f-warn)">${xs.streak} ${xs.streak===1?'day':'days'}</div>
      <div class="stat-tile-sub-v2">consecutive days logged</div>
    </div>
    <div class="stat-tile-v2">
      <div class="stat-tile-icon-v2" style="background:rgba(58,122,90,.15);">🎯</div>
      <div class="stat-tile-label-v2">Protein Consistency</div>
      <div class="stat-tile-val-v2" style="color:var(--f-ok)">${xs.hitRate}%</div>
      <div class="stat-tile-sub-v2">of logged days hit ${PROT_TARGET}g</div>
    </div>
    <div class="stat-tile-v2">
      <div class="stat-tile-icon-v2" style="background:${trendFlat?'rgba(168,150,124,.15)':trendUp?'rgba(232,93,58,.15)':'rgba(58,122,90,.15)'};">${trendFlat?'➡️':trendUp?'📈':'📉'}</div>
      <div class="stat-tile-label-v2">Weekly Trend</div>
      <div class="stat-tile-val-v2" style="color:${trendFlat?'var(--text3)':trendUp?'var(--f-bad)':'var(--f-ok)'}">${xs.avgPrev7?(trendUp?'+':'')+xs.trendDelta+'%':'—'}</div>
      <div class="stat-tile-sub-v2">this week (${xs.avgLast7||'—'}) vs last (${xs.avgPrev7||'—'})</div>
    </div>
    <div class="stat-tile-v2">
      <div class="stat-tile-icon-v2" style="background:rgba(42,106,154,.15);">🗓️</div>
      <div class="stat-tile-label-v2">Weekday vs Weekend</div>
      <div class="stat-tile-val-v2" style="font-size:18px;color:var(--sky,#2a6a9a)">${xs.avgWd||'—'} <span style="color:var(--text4);font-size:12px;font-weight:400;">/</span> ${xs.avgWe||'—'}</div>
      <div class="stat-tile-sub-v2">avg kcal, weekday / weekend</div>
    </div>
  </div>

  <!-- Charts — full width, stacked -->
  <div class="fcharts-col-v2">
    <div class="fchart-card-v2">
      <div class="fchart-title-v2">🔥 Daily Calories</div>
      <div class="fchart-sub-v2">Last 30 days · red dashes = ${CAL_TARGET} kcal target</div>
      <div class="mchart-wrap" style="height:240px"><canvas id="fCalChart"></canvas></div>
    </div>
    <div class="fchart-card-v2">
      <div class="fchart-title-v2">💪 Daily Protein</div>
      <div class="fchart-sub-v2">Last 30 days · red dashes = ${PROT_TARGET}g target</div>
      <div class="mchart-wrap" style="height:240px"><canvas id="fProtChart"></canvas></div>
    </div>
    <div class="fchart-card-v2">
      <div class="fchart-title-v2">🍽️ Meal Balance</div>
      <div class="fchart-sub-v2">Share of total logged calories, by meal slot</div>
      ${['breakfast','lunch','dinner','snacks'].map(id => {
        const v = xs.mealCals[id]||0, pct = Math.round((v/xs.mealCalTotal)*100);
        return `<div class="meal-bal-row-v2">
          <div class="meal-bal-label-v2">${mealLabels[id]}</div>
          <div class="meal-bal-track-v2"><div class="meal-bal-fill-v2" style="width:${pct}%;background:${mealColors[id]}"></div></div>
          <div class="meal-bal-pct-v2">${pct}%</div>
        </div>`;
      }).join('')}
    </div>
    ${ingrs.length ? `
    <div class="fchart-card-v2">
      <div class="fchart-title-v2">🍽️ Most Eaten Ingredients</div>
      <div class="fchart-sub-v2">By number of servings logged</div>
      <div class="mchart-wrap" style="height:${Math.max(200, ingrs.length>10?260:200)}px"><canvas id="fIngrChart"></canvas></div>
    </div>
    <div class="fchart-card-v2">
      <div class="fchart-title-v2">🥗 Category Breakdown</div>
      <div class="fchart-sub-v2">By ingredient category</div>
      <div class="mchart-wrap" style="height:260px"><canvas id="fCatChart"></canvas></div>
    </div>` : ''}
  </div>

  <!-- Ingredient table -->
  ${ingrs.length ? `
  <div class="fm-card" style="margin-bottom:20px;">
    <div class="fm-card-title">📋 Ingredient Stats <span>${ingrs.length} tracked</span></div>
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="border-bottom:2px solid var(--cream3);">
            <th style="text-align:left;padding:8px 12px;color:var(--text3);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.06em;">Ingredient</th>
            <th style="text-align:right;padding:8px 12px;color:var(--text3);font-weight:600;font-size:11px;text-transform:uppercase;">Servings</th>
            <th style="text-align:right;padding:8px 12px;color:var(--text3);font-weight:600;font-size:11px;text-transform:uppercase;">Total Qty</th>
            <th style="text-align:right;padding:8px 12px;color:var(--text3);font-weight:600;font-size:11px;text-transform:uppercase;">Days</th>
          </tr>
        </thead>
        <tbody>
          ${ingrs.map((i,idx) => `
          <tr style="border-bottom:1px solid var(--cream2);${idx%2===0?'background:var(--cream2);':''}">
            <td style="padding:9px 12px;font-weight:600;">${i.icon} ${i.name}</td>
            <td style="padding:9px 12px;text-align:right;font-family:'JetBrains Mono',monospace;">${i.count}×</td>
            <td style="padding:9px 12px;text-align:right;font-family:'JetBrains Mono',monospace;">${i.total_qty} ${i.unit}</td>
            <td style="padding:9px 12px;text-align:right;font-family:'JetBrains Mono',monospace;">${i.days_count}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>` : '<div style="text-align:center;padding:40px;color:var(--text3);font-family:Fraunces,serif;font-size:15px;">Log some food to see stats ✦</div>'}

  <!-- History log -->
  `;
  if (data.full_log && data.full_log.length) el.innerHTML += renderFoodFullHistory(data.full_log);

  // Draw charts
  setTimeout(() => {
    const gc='rgba(26,21,16,0.05)', tc='#a8967c';
    const base = { responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{x:{grid:{color:gc},ticks:{color:tc,maxTicksLimit:10}},y:{grid:{color:gc},ticks:{color:tc}}} };

    const calLabels = cals.map(d=>d.jalali||d.date);
    const calVals = cals.map(d=>d.val);
    const c1 = document.getElementById('fCalChart');
    if (c1) foodHistChart.cal = new Chart(c1, { type:'bar', data:{ labels:calLabels, datasets:[
      {label:'Calories',data:calVals,backgroundColor:'rgba(212,130,26,.65)',borderRadius:4,maxBarThickness:26},
      {label:'Target',data:calLabels.map(()=>CAL_TARGET),type:'line',borderColor:'var(--coral)',borderDash:[4,3],borderWidth:1.5,pointRadius:0,fill:false}
    ]}, options:{...base,plugins:{legend:{display:true,labels:{color:'#6b5c48',boxWidth:10,font:{size:11}}}}}});

    const protLabels = prots.map(d=>d.jalali||d.date);
    const protVals = prots.map(d=>d.val);
    const c2 = document.getElementById('fProtChart');
    if (c2) foodHistChart.prot = new Chart(c2, { type:'bar', data:{ labels:protLabels, datasets:[
      {label:'Protein',data:protVals,backgroundColor:'rgba(58,122,90,.65)',borderRadius:4,maxBarThickness:26},
      {label:'Target',data:protLabels.map(()=>PROT_TARGET),type:'line',borderColor:'var(--coral)',borderDash:[4,3],borderWidth:1.5,pointRadius:0,fill:false}
    ]}, options:{...base,plugins:{legend:{display:true,labels:{color:'#6b5c48',boxWidth:10,font:{size:11}}}}}});

    const top10 = ingrs.slice(0,10);
    const c3 = document.getElementById('fIngrChart');
    if (c3 && top10.length) foodHistChart.ingr = new Chart(c3, { type:'bar',
      data:{ labels:top10.map(i=>i.icon+' '+i.name), datasets:[{label:'Servings',data:top10.map(i=>i.count),
        backgroundColor:'rgba(108,99,255,.65)',borderRadius:4}]},
      options:{...base,indexAxis:'y',plugins:{legend:{display:false}}} });

    // Category pie
    const cats = {};
    ingrs.forEach(i => { cats[i.category]=(cats[i.category]||0)+i.count; });
    const catNames = Object.keys(cats);
    const catColors = ['#e85d3a','#3a7a5a','#d4821a','#2a6a9a','#7a3a6a','#c44a6a','#5a9a7a','#22d3ee'];
    const c4 = document.getElementById('fCatChart');
    if (c4 && catNames.length) foodHistChart.cat = new Chart(c4, { type:'doughnut',
      data:{ labels:catNames, datasets:[{data:catNames.map(k=>cats[k]),
        backgroundColor:catColors.slice(0,catNames.length),borderWidth:0,hoverOffset:6}]},
      options:{responsive:true,maintainAspectRatio:false,cutout:'62%',
        plugins:{legend:{position:'bottom',labels:{color:'#6b5c48',font:{size:11},padding:8,boxWidth:10}}}} });
  }, 80);
}

// Self-contained "Full History" list. This used to call an external
// buildFullHistory() helper that isn't defined anywhere in this file
// (likely a shared component from another tab) — that mismatch is what
// was causing the broken/overlapping rows. This version owns its own
// markup + CSS so it can't collide with another tab's styles.
function renderFoodFullHistory(fullLog) {
  const mealIcon = { breakfast:'🌅', lunch:'☀️', dinner:'🌙', snacks:'🍎' };
  const mealLabel = { breakfast:'Breakfast', lunch:'Lunch', dinner:'Dinner', snacks:'Snacks' };
  const sorted = [...fullLog].sort((a,b) => (b.date||'').localeCompare(a.date||''));

  const rows = sorted.map((entry, idx) => {
    const j = gregorianToJalaliStr(entry.date);
    const itemCount = (entry.meals||[]).reduce((s,m)=>s+(m.items||[]).length,0);
    const cal = entry.calories || 0;
    const prot = entry.protein || 0;
    const mealsWithItems = (entry.meals||[]).filter(m => (m.items||[]).length);
    const detailsHtml = mealsWithItems.length ? mealsWithItems.map(m => `
      <div class="fhist-meal-line-v2"><b>${mealIcon[m.meal_id]||''} ${mealLabel[m.meal_id]||m.meal_id}:</b>
        ${(m.items||[]).map(it => it.qty+' '+it.unit+' '+it.name).join(', ')}
      </div>`).join('') : '<div class="fhist-meal-line-v2" style="font-style:italic;">No items logged this day</div>';

    return `
      <div class="fhist-row-v2" onclick="toggleHistRow(this)">
        <div class="fhist-date-v2">
          <div class="fhist-date-main-v2">${j.label || entry.date}</div>
          <div class="fhist-date-sub-v2">${entry.date}</div>
        </div>
        <div class="fhist-metrics-v2">
          <div class="fhist-metric-v2">🔥 ${cal} kcal</div>
          <div class="fhist-metric-v2">💪 ${prot}g protein</div>
          <div class="fhist-metric-v2">🍽️ ${itemCount} item${itemCount!==1?'s':''}</div>
        </div>
        <div class="fhist-chevron-v2">▸</div>
      </div>
      <div class="fhist-details-v2">${detailsHtml}${entry.notes ? '<div class="fhist-meal-line-v2" style="margin-top:6px;"><b>Notes:</b> '+entry.notes+'</div>' : ''}</div>`;
  }).join('');

  return `
  <div class="fm-card">
    <div class="fm-card-title">🗂️ Full History <span>${sorted.length} days</span></div>
    <div class="fhist-list-v2">${rows || '<div style="padding:20px;text-align:center;color:var(--text4);font-style:italic;">No history yet</div>'}</div>
  </div>`;
}

function toggleHistRow(rowEl) {
  document.querySelectorAll('.fhist-row-v2.open').forEach(r => { if (r !== rowEl) r.classList.remove('open'); });
  rowEl.classList.toggle('open');
}

// ── Ingredient CRUD ───────────────────────────────
function toggleCustomUnit(sel) {
  const ci = document.getElementById('newIngrCustomUnit');
  if (ci) ci.style.display = sel.value === 'custom' ? 'block' : 'none';
}

// Reads the ingredient form fields (shared by add + edit)
function readIngredientForm() {
  const name = document.getElementById('newIngrName').value.trim();
  const icon = document.getElementById('newIngrIcon').value.trim() || '🍽️';
  const unitSel = document.getElementById('newIngrUnit').value;
  const customUnitVal = document.getElementById('newIngrCustomUnit')?.value.trim() || '';
  const unit = unitSel === 'custom' ? (customUnitVal || 'عدد') : unitSel;
  const category = document.getElementById('newIngrCategory').value;
  const rawCal = parseFloat(document.getElementById('newIngrCalories').value) || 0;
  const protein = parseFloat(document.getElementById('newIngrProtein').value) || 0;
  const calories = Math.round(rawCal * 1.1 * 10) / 10; // +10% caution buffer on calories only
  return { name, icon, unit, category, calories, protein };
}

function clearIngredientForm() {
  document.getElementById('newIngrName').value = '';
  document.getElementById('newIngrIcon').value = '';
  document.getElementById('newIngrCalories').value = '';
  document.getElementById('newIngrProtein').value = '';
  const ci = document.getElementById('newIngrCustomUnit');
  if (ci) { ci.value = ''; ci.style.display = 'none'; }
  document.getElementById('newIngrUnit').value = 'g';
}

// Entry point for the form's submit button — routes to add or edit
async function submitIngredientForm() {
  if (F.editingIngrId) await updateIngredient(F.editingIngrId);
  else await addIngredient();
}

function startEditIngredient(id) {
  F.editingIngrId = id;
  renderFoodView();
  const card = document.getElementById('ingrFormWrap');
  if (card) card.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

function cancelEditIngredient() {
  F.editingIngrId = null;
  renderFoodView();
}

async function addIngredient() {
  const { name, icon, unit, category, calories, protein } = readIngredientForm();
  if (!name) { showToast('Enter ingredient name',''); return; }
  const r = await fetch('/api/food/ingredients', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ action:'add', name, icon, unit, category, calories, protein }) });
  const d = await r.json();
  F.ingredients = d.ingredients;
  clearIngredientForm();
  renderFoodView();
  showToast('Ingredient saved ✓','success');
}

// NOTE: requires the backend /api/food/ingredients route to handle an
// { action:'edit', id, ... } case (update-in-place by id), the same way
// it already handles 'add' and 'delete'. If that case isn't implemented
// yet, this call will silently no-op or error depending on your route —
// happy to wire up the Flask side if you share that route.
async function updateIngredient(id) {
  const { name, icon, unit, category, calories, protein } = readIngredientForm();
  if (!name) { showToast('Enter ingredient name',''); return; }
  const r = await fetch('/api/food/ingredients', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ action:'edit', id, name, icon, unit, category, calories, protein }) });
  const d = await r.json();
  F.ingredients = d.ingredients;
  F.editingIngrId = null;
  clearIngredientForm();
  renderFoodView();
  showToast('Ingredient updated ✓','success');
}

async function deleteIngredient(id) {
  const r = await fetch('/api/food/ingredients', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ action:'delete', id }) });
  const d = await r.json();
  F.ingredients = d.ingredients;
  if (F.editingIngrId === id) F.editingIngrId = null;
  renderFoodView();
}

// ── Add item modal ────────────────────────────────
function buildSortedOptions(mealId) {
  const freq = {};
  const log = F._logCache || {};
  Object.values(log).forEach(entry => {
    (entry.meals || []).forEach(meal => {
      if (meal.meal_id !== mealId) return;
      (meal.items || []).forEach(item => {
        const key = item.ingredient_id || item.name;
        freq[key] = (freq[key] || 0) + 1;
      });
    });
  });
  const sorted = [...F.ingredients].sort((a, b) => {
    const fa = freq[a.id] || 0, fb = freq[b.id] || 0;
    if (fb !== fa) return fb - fa;
    return a.name.localeCompare(b.name);
  });
  const frequent = sorted.filter(i => (freq[i.id] || 0) > 0);
  const rest = sorted.filter(i => (freq[i.id] || 0) === 0);
  if (!sorted.length) return '<option value="">No ingredients — add them first</option>';
  let html = '';
  if (frequent.length) {
    html += '<optgroup label="⭐ Often used here">' +
      frequent.map(i => '<option value="'+i.id+'">'+i.icon+' '+i.name+' ('+i.unit+')'+(freq[i.id]>1?' ×'+freq[i.id]:'')+' </option>').join('') +
      '</optgroup>';
  }
  html += (frequent.length ? '<optgroup label="— All ingredients —">' : '') +
    rest.map(i => '<option value="'+i.id+'">'+i.icon+' '+i.name+' ('+i.unit+')</option>').join('') +
    (frequent.length ? '</optgroup>' : '');
  return html;
}

function quickAddIngredient(ingrId) {
  const titleEl = document.getElementById('foodItemTitle');
  titleEl.innerHTML = 'Add to: <select id="quickMealSel" style="font-size:14px;border:1.5px solid var(--cream3);border-radius:8px;padding:4px 10px;background:var(--cream2);">' +
    MEALS.map(m => '<option value="'+m.id+'">'+m.icon+' '+m.label+'</option>').join('') + '</select>';
  F.addingToMeal = 'breakfast';
  document.getElementById('quickMealSel').onchange = function(){ F.addingToMeal = this.value; };
  const sel = document.getElementById('foodIngredientSelect');
  sel.innerHTML = F.ingredients.map(i => '<option value="'+i.id+'"'+(i.id===ingrId?' selected':'')+'>'+i.icon+' '+i.name+' ('+i.unit+')</option>').join('');
  sel.onchange = updateFoodModalUnit;
  updateFoodModalUnit();
  buildQtyPresets();
  document.getElementById('foodQtyInput').value = '';
  document.getElementById('foodItemNote').value = '';
  const cr = document.getElementById('foodCustomUnitRow');
  if (cr) cr.style.display = 'none';
  const ci = document.getElementById('foodCustomUnitInput');
  if (ci) ci.value = '';
  document.getElementById('foodItemOverlay').classList.add('open');
}

function updateFoodModalUnit() {
  const sel = document.getElementById('foodIngredientSelect');
  const ingr = F.ingredients.find(i => i.id === sel.value);
  const unit = ingr ? ingr.unit : '';
  const isCustom = unit === 'custom';
  document.getElementById('foodQtyUnit').textContent = isCustom ? '×' : unit;
  const cr = document.getElementById('foodCustomUnitRow');
  if (cr) cr.style.display = isCustom ? 'block' : 'none';
  buildQtyPresets();
}

function buildQtyPresets() {
  const sel = document.getElementById('foodIngredientSelect');
  const ingr = F.ingredients.find(i => i.id === sel.value);
  const unit = ingr ? ingr.unit : 'g';
  let presets = [];
  if (['g','ml'].includes(unit)) presets = [25,50,100,150,200,250,300,400,500];
  else if (['kg','L'].includes(unit)) presets = [0.25,0.5,0.75,1,1.5,2];
  else if (unit==='cup') presets = [0.25,0.5,0.75,1,1.5,2];
  else if (['slice','piece','bowl','plate','portion'].includes(unit)) presets = [1,2,3,4,5];
  else if (['tbsp','tsp'].includes(unit)) presets = [1,2,3,4,5,6];
  else presets = [1,2,3,4,5,10];
  document.getElementById('qtyPresets').innerHTML = presets.map(p =>
    '<button class="preset" onclick="setQtyPreset('+p+',this)">'+p+'</button>').join('');
}

function setQtyPreset(val, btn) {
  document.getElementById('foodQtyInput').value = val;
  document.querySelectorAll('#qtyPresets .preset').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function closeFoodItemModal() {
  document.getElementById('foodItemOverlay').classList.remove('open');
  const cr = document.getElementById('foodCustomUnitRow');
  if (cr) cr.style.display = 'none';
  const ci = document.getElementById('foodCustomUnitInput');
  if (ci) ci.value = '';
  F.addingToMeal = null;
}

async function openFoodItemModal(mealId) {
  F.addingToMeal = mealId;
  const meal = MEALS.find(m => m.id === mealId);
  document.getElementById('foodItemTitle').textContent = 'Add to ' + meal.label;
  document.getElementById('foodQtyInput').value = '';
  document.getElementById('foodItemNote').value = '';
  const cr = document.getElementById('foodCustomUnitRow');
  if (cr) cr.style.display = 'none';
  const ci = document.getElementById('foodCustomUnitInput');
  if (ci) ci.value = '';
  document.getElementById('foodItemOverlay').classList.add('open');
  // Load full log cache for smart sorting (only fetch once per session)
  if (!F._logCache) {
    try {
      const r = await fetch('/api/food/stats');
      const d = await r.json();
      F._logCache = {};
      (d.full_log || []).forEach(entry => { F._logCache[entry.date] = entry; });
    } catch(e) { F._logCache = {}; }
  }
  const sel = document.getElementById('foodIngredientSelect');
  sel.innerHTML = buildSortedOptions(mealId);
  sel.onchange = updateFoodModalUnit;
  updateFoodModalUnit();
  buildQtyPresets();
}

async function confirmFoodItem() {
  const sel = document.getElementById('foodIngredientSelect');
  const qty = parseFloat(document.getElementById('foodQtyInput').value);
  const note = document.getElementById('foodItemNote').value.trim();
  if (!sel.value || !qty) { showToast('Pick ingredient and quantity',''); return; }
  const ingr = F.ingredients.find(i => i.id === sel.value);
  if (!ingr) return;
  const isCustom = ingr.unit === 'custom';
  const customDesc = isCustom ? (document.getElementById('foodCustomUnitInput')?.value.trim() || '') : '';
  const displayUnit = isCustom ? (customDesc || 'عدد') : ingr.unit;
  const itemCal = Math.round((ingr.calories||0) * qty);
  const itemProt = Math.round((ingr.protein||0) * qty * 10) / 10;
  let mealEntry = F.entry.meals.find(m => m.meal_id === F.addingToMeal);
  if (!mealEntry) { mealEntry = { meal_id: F.addingToMeal, items: [] }; F.entry.meals.push(mealEntry); }
  mealEntry.items.push({ ingredient_id: ingr.id, name: ingr.name, icon: ingr.icon, unit: displayUnit, qty, note, calories: itemCal, protein: itemProt });
  recalcMacrosFromItems();
  closeFoodItemModal();
  await saveFoodEntry();
  renderFoodView();
  showToast('Added ✓ +'+itemCal+' kcal · +'+itemProt+'g protein','success');
}

async function removeMealItem(mealId, idx) {
  const mealEntry = F.entry.meals.find(m => m.meal_id === mealId);
  if (mealEntry) mealEntry.items.splice(idx, 1);
  recalcMacrosFromItems();
  await saveFoodEntry();
  renderFoodView();
}

// Sum calories/protein across all logged items for the day and set as the day's totals
function recalcMacrosFromItems() {
  let cal = 0, prot = 0;
  (F.entry.meals||[]).forEach(m => (m.items||[]).forEach(it => {
    cal += it.calories || 0;
    prot += it.protein || 0;
  }));
  F.entry.calories = Math.round(cal);
  F.entry.protein = Math.round(prot * 10) / 10;
}

// ── Macros ────────────────────────────────────────
function updateMacros() {
  F.entry.calories = parseInt(document.getElementById('fCalories').value) || 0;
  F.entry.protein  = parseInt(document.getElementById('fProtein').value)  || 0;
  const box = document.getElementById('claudePromptBox');
  if (box) box.textContent = buildClaudePrompt();
}

async function saveMacros() {
  F.entry.calories = parseInt(document.getElementById('fCalories').value) || 0;
  F.entry.protein  = parseInt(document.getElementById('fProtein').value)  || 0;
  F.entry.notes    = document.getElementById('fNotes').value;
  await saveFoodEntry();
  showToast('Saved & synced to Today tab ✓','success');
}

// ── Claude prompt ─────────────────────────────────
function buildClaudePrompt() {
  if (!F.entry || !F.entry.meals) return 'Log some food first to generate a prompt.';
  let hasAny = false;
  let mealLines = [];
  MEALS.forEach(mDef => {
    const mealData = (F.entry.meals||[]).find(m => m.meal_id === mDef.id);
    const items = mealData ? (mealData.items||[]) : [];
    if (items.length) {
      hasAny = true;
      mealLines.push(mDef.label + ':');
      items.forEach(item => {
        mealLines.push('  - ' + item.qty + ' ' + item.unit + ' of ' + item.name + (item.note?' ('+item.note+')':''));
      });
    }
  });
  if (!hasAny) return 'Log some food items first to generate a prompt.';
  const gDate = F.date;
  const dt = new Date(gDate + 'T12:00:00');
  const engMonths = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const engDateStr = dt.getDate() + ' ' + engMonths[dt.getMonth()] + ' ' + dt.getFullYear();
  let jalDateStr = '';
  if (gDate === todayISO() && F.jalaliToday) {
    jalDateStr = F.jalaliToday.day + ' ' + F.jalaliToday.month_name + ' ' + F.jalaliToday.year;
  } else {
    const jConv = gregorianToJalaliStr(gDate);
    if (jConv && jConv.str) {
      const parts = jConv.str.split('/');
      const jalMonths = ['Farvardin','Ordibehesht','Khordad','Tir','Mordad','Shahrivar','Mehr','Aban','Azar','Dey','Bahman','Esfand'];
      jalDateStr = parseInt(parts[2]) + ' ' + jalMonths[parseInt(parts[1])-1] + ' ' + parts[0];
    }
  }
  const dateLabel = jalDateStr ? (jalDateStr + ' / ' + engDateStr) : engDateStr;
  const mealText = mealLines.join('\n');
  const notesText = F.entry.notes ? ('\n\nAdditional notes: ' + F.entry.notes) : '';
  return 'Estimate the nutritional composition of the following meals for dietary analysis and meal planning purposes. Include calories, protein, carbohydrates, fats, fiber, and notable nutritional observations. Use typical restaurant serving sizes where exact portions are unknown.\n\nDate: ' + dateLabel + '\n\n' + mealText + notesText;
}

async function copyClaudePrompt() {
  const text = buildClaudePrompt();
  try {
    await navigator.clipboard.writeText(text);
    showToast('Prompt copied — paste into Claude ✓','success');
  } catch(e) {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    showToast('Copied ✓','success');
  }
}
