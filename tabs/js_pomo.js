// ─── POMODORO TIMER ───────────────────────────────
// ══════════════════════════════════════════════════

const POMO = {
  settings: { focus: 25, short: 5, long: 15 },
  mode: 'focus',       // 'focus' | 'short' | 'long'
  running: false,
  secondsLeft: 25 * 60,
  totalSeconds: 25 * 60,
  sessionNum: 1,       // 1–4, resets after long break
  cyclesCompleted: 0,
  interval: null,
  log: [],             // [{type,duration,startedAt}]
  blockDomains: ['youtube.com','t.me','telegram.org','instagram.com','twitter.com','x.com','facebook.com','tiktok.com'],
};

function initFocusView(){
  renderBlockDomains();
  renderPomoLog();
  updatePomoDisplay();
  updateSettingsDisplay();
  checkAdminStatus();
}

// ── Settings ──
function adjustSetting(key, delta){
  if(POMO.running) return;
  const mins = { focus:[5,90], short:[1,30], long:[5,60] };
  const [mn,mx] = mins[key];
  POMO.settings[key] = Math.max(mn, Math.min(mx, POMO.settings[key] + delta));
  updateSettingsDisplay();
  if(POMO.mode === key || (key==='focus'&&POMO.mode==='focus')){
    const modeKey = {focus:'focus',short:'short',long:'long'}[POMO.mode];
    POMO.secondsLeft = POMO.settings[modeKey] * 60;
    POMO.totalSeconds = POMO.secondsLeft;
    updatePomoDisplay();
  }
}
function updateSettingsDisplay(){
  document.getElementById('set-focus').textContent = POMO.settings.focus + ' min';
  document.getElementById('set-short').textContent = POMO.settings.short + ' min';
  document.getElementById('set-long').textContent = POMO.settings.long + ' min';
  ['focus-dec','focus-inc','short-dec','short-inc','long-dec','long-inc'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.disabled = POMO.running;
  });
}

// ── Mode switching (only when not running) ──
function setMode(m){
  if(POMO.running) return;
  POMO.mode = m;
  POMO.secondsLeft = POMO.settings[m] * 60;
  POMO.totalSeconds = POMO.secondsLeft;
  ['focus','short','long'].forEach(x=>{
    document.getElementById('chip-'+x).classList.toggle('active', x===m);
  });
  // ring color
  const ring = document.getElementById('pomoRing');
  ring.setAttribute('stroke', m==='focus'?'url(#pomoGrad)':'url(#breakGrad)');
  updatePomoDisplay();
  document.getElementById('pomoStartBtn').textContent = m==='focus'?'▶ Start Focus':'▶ Start Break';
}

// ── Main toggle ──
function toggleTimer(){
  if(POMO.running) return; // can't stop during focus — only breaks can be skipped
  startTimer();
}

function startTimer(){
  POMO.running = true;
  POMO.interval = setInterval(tick, 1000);
  updatePomoDisplay();
  updateSettingsDisplay();

  const startBtn = document.getElementById('pomoStartBtn');
  startBtn.textContent = POMO.mode==='focus' ? '🔒 Session locked' : '⏳ On break...';
  startBtn.disabled = true;

  // skip only allowed on breaks
  document.getElementById('pomoSkipBtn').disabled = (POMO.mode === 'focus');

  if(POMO.mode === 'focus'){
    showLockOverlay(true);
    notifyBlocker('block');
  }
}

function tick(){
  POMO.secondsLeft--;
  updatePomoDisplay();
  if(POMO.secondsLeft <= 0) phaseComplete();
}

function phaseComplete(){
  clearInterval(POMO.interval);
  POMO.running = false;

  // log it
  const type = POMO.mode;
  const dur = POMO.settings[POMO.mode];
  POMO.log.unshift({ type, duration: dur, time: new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) });
  renderPomoLog();

  playDone();
  showLockOverlay(false);
  notifyBlocker('unblock');

  if(POMO.mode === 'focus'){
    // advance session
    if(POMO.sessionNum >= 4){
      POMO.sessionNum = 1;
      POMO.cyclesCompleted++;
      setMode('long');
      showToast('🎉 4 sessions done! Take a long break.', 'success');
    } else {
      POMO.sessionNum++;
      setMode('short');
      showToast('✅ Focus done! Take a short break.', 'success');
    }
  } else {
    setMode('focus');
    showToast('Break over — ready to focus again!', '');
  }

  document.getElementById('pomoStartBtn').disabled = false;
  document.getElementById('pomoSkipBtn').disabled = true;
  document.getElementById('pomoSessionNum').textContent = POMO.sessionNum;
  document.getElementById('pomoCycles').textContent = POMO.cyclesCompleted;
  updatePomoDisplay();
  updateSettingsDisplay();
}

function skipPhase(){
  // Only allowed during breaks
  if(POMO.mode === 'focus') return;
  clearInterval(POMO.interval);
  POMO.running = false;
  POMO.log.unshift({type:'skipped-break',duration:0,time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})});
  renderPomoLog();
  setMode('focus');
  document.getElementById('pomoStartBtn').disabled = false;
  document.getElementById('pomoSkipBtn').disabled = true;
  updateSettingsDisplay();
  showToast('Break skipped — ready when you are.', '');
}

// ── Display ──
function updatePomoDisplay(){
  const m = Math.floor(POMO.secondsLeft / 60);
  const s = POMO.secondsLeft % 60;
  const timeStr = String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  document.getElementById('pomoTime').textContent = timeStr;

  const phaseLabels = {focus:'FOCUS', short:'SHORT BREAK', long:'LONG BREAK'};
  document.getElementById('pomoPhase').textContent = POMO.running ? phaseLabels[POMO.mode] : 'READY';

  // ring progress
  const circ = 2 * Math.PI * 95;
  const pct = POMO.secondsLeft / POMO.totalSeconds;
  document.getElementById('pomoRing').style.strokeDashoffset = circ * (1 - pct);

  // lock overlay
  document.getElementById('lockTime').textContent = timeStr;
  const lockCirc = 2 * Math.PI * 66;
  document.getElementById('lockRing').style.strokeDashoffset = lockCirc * (1 - pct);

  document.getElementById('pomoSessionNum').textContent = POMO.sessionNum;
  document.getElementById('pomoCycles').textContent = POMO.cyclesCompleted;

  // total focus today
  const totalMins = POMO.log.filter(l=>l.type==='focus').reduce((a,b)=>a+b.duration, 0);
  document.getElementById('pomTotalFocus').textContent = totalMins > 0 ? totalMins + ' min focused today' : '';
}

// ── Lock overlay (fullscreen during focus) ──
function showLockOverlay(show){
  const el = document.getElementById('pomoLock');
  el.classList.toggle('show', show);
  document.getElementById('lockPhase').textContent = show ? '🎯 FOCUS SESSION — STAY LOCKED IN' : '';
  document.getElementById('lockMsg').innerHTML = show
    ? 'Distracting sites are blocked.<br><span style="color:var(--text4);font-size:12px;">Timer cannot be stopped. Finish your session!</span>'
    : 'Session complete! Great work.';
}

// ── Log ──
function renderPomoLog(){
  const el = document.getElementById('pomoLogList');
  if(!POMO.log.length){ el.innerHTML='<div style="color:var(--text4);font-size:13px;font-style:italic;padding:8px;">No sessions yet — start your first focus block!</div>'; return; }
  el.innerHTML = POMO.log.slice(0,20).map(l=>{
    const icons = {focus:'🍅',short:'☕',long:'🛋️','skipped-break':'⏭️'};
    const labels = {focus:'Focus session',short:'Short break',long:'Long break','skipped-break':'Break skipped'};
    const bgs = {focus:'var(--coralL)',short:'var(--sageL)',long:'var(--skyL)','skipped-break':'var(--cream2)'};
    return `<div class="pomo-log-item">
      <div class="pomo-log-icon" style="background:${bgs[l.type]}">${icons[l.type]||'⏱'}</div>
      <div class="pomo-log-text">${labels[l.type]||l.type}${l.duration>0?' — '+l.duration+' min':''}</div>
      <div class="pomo-log-time">${l.time}</div>
    </div>`;
  }).join('');
}

// ── Blocker communication ──
async function notifyBlocker(action){
  try {
    const r = await fetch('/api/blocker', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action, domains: POMO.blockDomains })
    });
    const d = await r.json();
    const dot = document.getElementById('blockerDot');
    const status = document.getElementById('blockerStatus');
    if(!d.is_admin){
      dot.className='blocker-dot inactive';
      status.textContent='Not running as admin — relaunch start.bat as Administrator to enable blocking';
      return;
    }
    if(action === 'block'){
      dot.className = 'blocker-dot active';
      status.textContent = '🔒 Blocking ' + POMO.blockDomains.length + ' sites — stay focused!';
    } else {
      dot.className = 'blocker-dot inactive';
      status.textContent = '✅ Sites unblocked — session complete';
    }
  } catch(e){
    document.getElementById('blockerStatus').textContent = 'Blocker error — is app.py running?';
  }
}

// Check admin status on load
async function checkAdminStatus(){
  try {
    const r = await fetch('/api/status');
    const d = await r.json();
    const dot = document.getElementById('blockerDot');
    const status = document.getElementById('blockerStatus');
    if(d.is_admin){
      dot.className='blocker-dot active';
      status.textContent='✅ Running as admin — site blocking ready';
    } else {
      dot.className='blocker-dot inactive';
      status.textContent='⚠️ Not admin — double-click start.bat to enable site blocking';
    }
  } catch(e){}
}

// ── Sound ──
function playDone(){
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = POMO.mode==='focus' ? [523, 659, 784] : [784, 659, 523];
    notes.forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0, ctx.currentTime + i*0.18);
      g.gain.linearRampToValueAtTime(0.25, ctx.currentTime + i*0.18 + 0.05);
      g.gain.linearRampToValueAtTime(0, ctx.currentTime + i*0.18 + 0.35);
      o.start(ctx.currentTime + i*0.18);
      o.stop(ctx.currentTime + i*0.18 + 0.4);
    });
  } catch(e){}
}

// ── Block domains UI ──
function renderBlockDomains(){
  const el = document.getElementById('blockDomains');
  el.innerHTML = POMO.blockDomains.map((d,i) => `
    <div class="block-domain">
      ${d}
      <span class="x" onclick="removeBlockDomain(${i})">×</span>
    </div>`).join('');
}

function addBlockDomain(){
  const inp = document.getElementById('blockInput');
  const val = inp.value.trim().toLowerCase().replace(/^https?:\/\//,'').replace(/\/.*/,'');
  if(!val) return;
  if(!POMO.blockDomains.includes(val)) POMO.blockDomains.push(val);
  inp.value = '';
  renderBlockDomains();
}

function removeBlockDomain(i){
  POMO.blockDomains.splice(i, 1);
  renderBlockDomains();
}





// ─── SIMPLE MODE (plain work timer: no pomodoro phases, no blocking) ───
// Elapsed-time stopwatch. Start when you sit down, pause when you get up
// or get distracted, resume when you're back. "End Day" saves today's
// accumulated minutes to focus_stats.json (one directory above the app)
// and refreshes the history chart.
// ════════════════════════════════════════════════════════════════════

const SIMPLE = {
  dateStr: null,
  elapsedBeforePause: 0,   // seconds accumulated before the current run
  running: false,
  startTimestamp: null,    // Date.now() when current run started/resumed
  interval: null,
  savedTodayMinutes: 0,    // already saved to backend for today (from prior End Day presses)
  statsData: {},           // {'YYYY-MM-DD': minutes}
  currentRange: '7',
  chartType: 'bar',        // 'bar' | 'line' | 'heat'
  flags: [],               // [{seconds, label, time}] — markers along today's elapsed timer
};

function isoDateStr(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function getYesterdayDateStr(){
  const t = getTodayDateStr();
  const d = new Date(t + 'T12:00:00'); // noon avoids any DST/timezone edge cases
  d.setDate(d.getDate() - 1);
  return isoDateStr(d);
}

let manualAddDay = 'today';
let manualOp = 'add';
function setManualDay(day){
  manualAddDay = day;
  const tBtn = document.getElementById('mday-today');
  const yBtn = document.getElementById('mday-yesterday');
  if(tBtn) tBtn.classList.toggle('active', day === 'today');
  if(yBtn) yBtn.classList.toggle('active', day === 'yesterday');
}
function setManualOp(op){
  manualOp = op;
  const aBtn = document.getElementById('mop-add');
  const sBtn = document.getElementById('mop-sub');
  if(aBtn) aBtn.classList.toggle('active', op === 'add');
  if(sBtn) sBtn.classList.toggle('active', op === 'sub');
}

async function addManualTime(minutes){
  const day = manualAddDay === 'yesterday' ? getYesterdayDateStr() : getTodayDateStr();
  const dayLabel = manualAddDay === 'yesterday' ? 'دیروز' : 'امروز';
  const signedMinutes = manualOp === 'sub' ? -minutes : minutes;
  try{
    const r = await fetch('/api/focus-stats', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({date: day, minutes: signedMinutes})
    });
    const j = await r.json();
    if(j.ok){
      const verb = manualOp === 'sub' ? 'کم شد از' : 'اضافه شد به';
      showToast('' + minutes + ' دقیقه ' + verb + ' ' + dayLabel, 'success');
      fetchFocusStats(SIMPLE.currentRange);
    } else {
      showToast('❌ ثبت نشد', 'error');
    }
  }catch(e){
    showToast('❌ خطا در ارتباط با سرور', 'error');
  }
}

function getTodayDateStr(){
  // Work-day cutoff: before 6:00 AM still counts as "yesterday". This way
  // staying up past midnight and ending the day at, say, 1am still logs
  // that time under the day you were actually working, not the next one.
  const d = new Date();
  if(d.getHours() < 6){
    d.setDate(d.getDate() - 1);
  }
  return isoDateStr(d);
}

function getCurrentElapsedSeconds(){
  return SIMPLE.elapsedBeforePause + (SIMPLE.running ? (Date.now() - SIMPLE.startTimestamp)/1000 : 0);
}

function formatHMS(totalSeconds){
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s/3600);
  const m = Math.floor((s%3600)/60);
  const sec = s%60;
  if(h>0) return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');
  return String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');
}

function setFocusUIMode(mode, skipSave){
  document.getElementById('simple-mode-content').style.display = mode === 'simple' ? '' : 'none';
  document.getElementById('pomo-mode-content').style.display = mode === 'pomo' ? '' : 'none';
  document.getElementById('fmode-simple').classList.toggle('active', mode==='simple');
  document.getElementById('fmode-pomo').classList.toggle('active', mode==='pomo');
  if(mode === 'pomo' && SIMPLE.running) pauseSimpleTimer();
  if(!skipSave) localStorage.setItem('elevateFocusUIMode', mode);
}

function toggleSimpleTimer(){
  if(SIMPLE.running) pauseSimpleTimer();
  else resumeSimpleTimer();
}

// ── Flags: mark "from here to here" along today's timer, tag later if wanted ──
const FLAG_CATEGORIES = [
  {value:'german',   label:'🇩🇪 German'},
  {value:'uni',       label:'📚 University Study'},
  {value:'business',  label:'💻 Personal Site/Business'},
  {value:'car',        label:'🚗 Car Courses'},
  {value:'selfdev',   label:'🌱 Self Development'}
];

function addFlag(){
  SIMPLE.flags.push({
    seconds: getCurrentElapsedSeconds(),
    category: '',
    time: new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})
  });
  saveSimpleStateLocal();
  renderSimpleFlags();
}

function setFlagCategory(i, value){
  if(!SIMPLE.flags[i]) return;
  SIMPLE.flags[i].category = value;
  saveSimpleStateLocal();
  renderSimpleFlags();
}

function removeSimpleFlag(i){
  SIMPLE.flags.splice(i, 1);
  saveSimpleStateLocal();
  renderSimpleFlags();
}

function flagCategoryOptionsHTML(selected){
  let html = `<option value=""${selected?'':' selected'}>— دسته —</option>`;
  FLAG_CATEGORIES.forEach(c=>{
    html += `<option value="${c.value}"${selected===c.value?' selected':''}>${c.label}</option>`;
  });
  return html;
}

function renderSimpleFlags(){
  const card = document.getElementById('simpleFlagsCard');
  const list = document.getElementById('simpleFlagsList');
  if(!card || !list) return;

  const currentElapsed = getCurrentElapsedSeconds();

  if(!SIMPLE.flags.length && currentElapsed < 1){
    card.style.display = 'none';
    return;
  }
  card.style.display = '';

  let html = '';
  let prevSeconds = 0;
  SIMPLE.flags.forEach((f, i) => {
    const dur = Math.max(0, f.seconds - prevSeconds);
    html += `<div class="flag-item">
      <span class="flag-item-range">${formatHMS(prevSeconds)}–${formatHMS(f.seconds)} (${formatHMS(dur)})</span>
      <select class="flag-cat-select" onchange="setFlagCategory(${i},this.value)">${flagCategoryOptionsHTML(f.category)}</select>
      <button class="flag-item-del" onclick="removeSimpleFlag(${i})" title="حذف">×</button>
    </div>`;
    prevSeconds = f.seconds;
  });

  // Ongoing segment since the last flag (or since start, if no flags yet)
  const remaining = currentElapsed - prevSeconds;
  if(remaining > 0.5){
    html += `<div class="flag-item" style="opacity:.55;">
      <span class="flag-item-range">${formatHMS(prevSeconds)}–${formatHMS(currentElapsed)} (${formatHMS(remaining)})</span>
      <span class="flag-item-label">در حال انجام...</span>
      <span style="width:24px;"></span>
    </div>`;
  }

  list.innerHTML = html;
}

function resumeSimpleTimer(){
  SIMPLE.running = true;
  SIMPLE.startTimestamp = Date.now();
  SIMPLE.interval = setInterval(simpleTick, 1000);
  saveSimpleStateLocal();
  updateSimpleDisplay();
}

function pauseSimpleTimer(){
  if(SIMPLE.running){
    SIMPLE.elapsedBeforePause += (Date.now() - SIMPLE.startTimestamp)/1000;
  }
  SIMPLE.running = false;
  clearInterval(SIMPLE.interval);
  SIMPLE.interval = null;
  saveSimpleStateLocal();
  updateSimpleDisplay();
}

function resetSimpleTimer(){
  clearInterval(SIMPLE.interval);
  SIMPLE.interval = null;
  SIMPLE.running = false;
  SIMPLE.elapsedBeforePause = 0;
  SIMPLE.startTimestamp = null;
  SIMPLE.flags = [];
  saveSimpleStateLocal();
  updateSimpleDisplay();
  renderSimpleFlags();
  showToast('تایمر ریست شد.', '');
}

function simpleTick(){
  const today = getTodayDateStr();
  if(today !== SIMPLE.dateStr){
    handleDateRollover(today);
  }
  updateSimpleDisplay();
  renderSimpleFlags();
  saveSimpleStateLocal();
}

// If the timer is left running across midnight, auto-finalize the
// previous day's minutes so nothing is lost.
function handleDateRollover(newDateStr){
  const wasRunning = SIMPLE.running;
  if(wasRunning){
    SIMPLE.elapsedBeforePause += (Date.now() - SIMPLE.startTimestamp)/1000;
  }
  const prevDate = SIMPLE.dateStr;
  const prevSeconds = SIMPLE.elapsedBeforePause;
  if(prevSeconds > 0){
    saveFocusMinutes(prevDate, +(prevSeconds/60).toFixed(2)).then(()=>fetchFocusStats(SIMPLE.currentRange));
  }
  SIMPLE.dateStr = newDateStr;
  SIMPLE.elapsedBeforePause = 0;
  SIMPLE.startTimestamp = wasRunning ? Date.now() : null;
  SIMPLE.flags = [];
  saveSimpleStateLocal();
  renderSimpleFlags();
}

async function endDaySimple(){
  if(SIMPLE.running) pauseSimpleTimer();
  const seconds = SIMPLE.elapsedBeforePause;
  if(seconds < 1){
    showToast('هنوز زمانی ثبت نشده.', '');
    return;
  }
  const minutes = +(seconds/60).toFixed(2);
  const ok = await saveFocusMinutes(SIMPLE.dateStr, minutes);
  if(ok){
    showToast('🏁 ثبت شد: ' + Math.round(minutes) + ' دقیقه از امروز', 'success');
    SIMPLE.elapsedBeforePause = 0;
    SIMPLE.startTimestamp = null;
    SIMPLE.flags = [];
    saveSimpleStateLocal();
    updateSimpleDisplay();
    renderSimpleFlags();
    fetchFocusStats(SIMPLE.currentRange);
  } else {
    showToast('اتصال به سرور برقرار نشد — آیا app.py در حال اجراست؟', '');
  }
}

async function saveFocusMinutes(date, minutes){
  try{
    const r = await fetch('/api/focus-stats', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ date, minutes })
    });
    const d = await r.json();
    return !!d.ok;
  } catch(e){
    return false;
  }
}

function saveSimpleStateLocal(){
  localStorage.setItem('elevateSimpleTimer', JSON.stringify({
    dateStr: SIMPLE.dateStr,
    elapsedBeforePause: SIMPLE.elapsedBeforePause,
    running: SIMPLE.running,
    startTimestamp: SIMPLE.startTimestamp,
    flags: SIMPLE.flags
  }));
}

function loadSimpleStateLocal(){
  const today = getTodayDateStr();
  let saved = null;
  try{ saved = JSON.parse(localStorage.getItem('elevateSimpleTimer')); }catch(e){}
  if(saved && saved.dateStr === today){
    SIMPLE.dateStr = saved.dateStr;
    SIMPLE.elapsedBeforePause = saved.elapsedBeforePause || 0;
    SIMPLE.running = !!saved.running;
    SIMPLE.startTimestamp = saved.startTimestamp || null;
    SIMPLE.flags = Array.isArray(saved.flags) ? saved.flags : [];
    if(SIMPLE.running){
      SIMPLE.interval = setInterval(simpleTick, 1000);
    }
  } else {
    SIMPLE.dateStr = today;
    SIMPLE.elapsedBeforePause = 0;
    SIMPLE.running = false;
    SIMPLE.startTimestamp = null;
    SIMPLE.flags = [];
  }
}

function updateSimpleDisplay(){
  const elapsed = getCurrentElapsedSeconds();
  const timeEl = document.getElementById('simpleTime');
  const btn = document.getElementById('simpleToggleBtn');
  const statusEl = document.getElementById('simpleStatus');
  const totalEl = document.getElementById('simpleTodayTotal');
  if(!timeEl || !btn || !statusEl || !totalEl) return;

  timeEl.textContent = formatHMS(elapsed);

  if(SIMPLE.running){
    btn.textContent = '⏸ پاز (حواسم پرت شد)';
    btn.className = 'simple-btn simple-btn-pause';
    statusEl.textContent = '🟢 در حال کار...';
  } else if(elapsed > 0){
    btn.textContent = '▶ ادامه';
    btn.className = 'simple-btn simple-btn-start';
    statusEl.textContent = '⏸ متوقف';
  } else {
    btn.textContent = '▶ شروع کار';
    btn.className = 'simple-btn simple-btn-start';
    statusEl.textContent = 'آماده';
  }

  const todayTotal = (SIMPLE.savedTodayMinutes || 0) + elapsed/60;
  totalEl.textContent = todayTotal > 0.5 ? 'امروز: ' + Math.round(todayTotal) + ' دقیقه' : '';
}

// ── Stats / chart ──
async function fetchFocusStats(range){
  try{
    const r = await fetch('/api/focus-stats');
    const d = await r.json();
    SIMPLE.statsData = d && typeof d === 'object' ? d : {};
  } catch(e){
    SIMPLE.statsData = {};
  }
  SIMPLE.savedTodayMinutes = SIMPLE.statsData[getTodayDateStr()] || 0;
  updateSimpleDisplay();
  renderFocusChart(range || SIMPLE.currentRange || '7');
}

// Jalali conversion for chart labels — reuses gregToJalali()/JALALI_MONTHS
// already defined in jalali.js. Do NOT redeclare them here.
function isoToJalaliLabel(iso){
  const j = gregToJalali(iso);
  return j ? (j.d + ' ' + j.month_name) : iso;
}

function formatMinutesShort(mins){
  mins = Math.round(mins);
  if(mins < 60) return mins + 'm';
  const h = Math.floor(mins/60), m = mins%60;
  return m ? `${h}h${m}m` : `${h}h`;
}

function computeCurrentStreak(){
  const data = SIMPLE.statsData || {};
  let streak = 0;
  const d = new Date();
  for(let i=0;i<3650;i++){
    const iso = isoDateStr(d);
    if((data[iso]||0) > 0){ streak++; d.setDate(d.getDate()-1); }
    else break;
  }
  return streak;
}

function setChartType(type){
  SIMPLE.chartType = type;
  ['bar','line','heat'].forEach(t=>{
    const el = document.getElementById('ctype-'+t);
    if(el) el.classList.toggle('active', t === type);
  });
  renderFocusChart(SIMPLE.currentRange);
}

let focusChartInstance = null;

function drawFocusChartJS(days, values, type){
  const canvasWrap = document.getElementById('focusChartCanvasWrap');
  const heatWrap = document.getElementById('focusHeatmapWrap');
  if(canvasWrap){
    canvasWrap.style.display = '';
    if(!document.getElementById('focusChartCanvas')){
      canvasWrap.innerHTML = '<canvas id="focusChartCanvas"></canvas>';
    }
  }
  if(heatWrap) heatWrap.style.display = 'none';

  const canvas = document.getElementById('focusChartCanvas');
  if(!canvas) return;
  if(focusChartInstance){ focusChartInstance.destroy(); focusChartInstance = null; }

  const labels = days.map(d => isoToJalaliLabel(d));
  const gridColor = 'rgba(26,21,16,0.05)';
  const tickColor = '#a8967c';
  const dense = days.length > 20;

  const dataset = type === 'line'
    ? {
        label: 'دقیقه فوکوس',
        data: values,
        borderColor: '#c44a6a',
        backgroundColor: 'rgba(232,93,58,0.18)',
        borderWidth: 2.5,
        pointRadius: dense ? 0 : 3,
        pointHoverRadius: 6,
        pointBackgroundColor: '#c44a6a',
        tension: 0.3,
        fill: true,
      }
    : {
        label: 'دقیقه فوکوس',
        data: values,
        backgroundColor: '#e85d3acc',
        hoverBackgroundColor: '#c44a6a',
        borderRadius: 4,
        maxBarThickness: 26,
      };

  focusChartInstance = new Chart(canvas.getContext('2d'), {
    type: type === 'line' ? 'line' : 'bar',
    data: { labels, datasets: [dataset] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 350 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => Math.round(ctx.parsed.y) + ' دقیقه',
          }
        }
      },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: tickColor, maxTicksLimit: dense ? 8 : 14, autoSkip: true } },
        y: { grid: { color: gridColor }, ticks: { color: tickColor }, beginAtZero: true }
      }
    }
  });
}

function showHeatmapInfo(iso, value){
  const el = document.getElementById('focusHeatmapInfo');
  if(!el) return;
  const dt = new Date(iso + 'T12:00:00');
  el.textContent = `${DOW[dt.getDay()]} · ${isoToJalaliLabel(iso)} — ${value > 0 ? formatMinutesShort(value) : 'بدون فوکوس'}`;
}

function drawFocusHeatmap(days, values){
  const canvasWrap = document.getElementById('focusChartCanvasWrap');
  const heatWrap = document.getElementById('focusHeatmapWrap');
  if(canvasWrap) canvasWrap.style.display = 'none';
  if(heatWrap) heatWrap.style.display = '';
  if(focusChartInstance){ focusChartInstance.destroy(); focusChartInstance = null; }

  const grid = document.getElementById('focusHeatmapGrid');
  const info = document.getElementById('focusHeatmapInfo');
  if(!grid) return;

  const cell = 15, gap = 3;
  const first = new Date(days[0] + 'T12:00:00');
  const startOffset = first.getDay();
  const padded = [];
  for(let i=0;i<startOffset;i++) padded.push(null);
  days.forEach((d,i)=> padded.push({date:d, value: values[i]}));
  while(padded.length % 7 !== 0) padded.push(null);

  const weeks = padded.length/7;
  const max = Math.max(1, ...values);
  const width = weeks*(cell+gap)+gap;
  const height = 7*(cell+gap)+gap;

  function colorFor(v){
    if(v<=0) return '#f0ece4';
    const ratio = Math.min(1, v/max);
    const l = 88 - ratio*48;
    return `hsl(9,65%,${l}%)`;
  }

  let cells = '';
  for(let w=0; w<weeks; w++){
    for(let dow=0; dow<7; dow++){
      const item = padded[w*7+dow];
      const x = gap + w*(cell+gap);
      const y = gap + dow*(cell+gap);
      if(!item){
        cells += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="transparent"/>`;
      } else {
        cells += `<rect class="heatmap-cell" x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="${colorFor(item.value)}" onclick="showHeatmapInfo('${item.date}',${item.value})"/>`;
      }
    }
  }

  grid.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${Math.min(170,height)}" preserveAspectRatio="xMinYMin meet">${cells}</svg>`;

  // default info: most recent day with data, or the last day in range
  if(info){
    let lastIdx = days.length - 1;
    for(let i=days.length-1;i>=0;i--){ if(values[i]>0){ lastIdx = i; break; } }
    showHeatmapInfo(days[lastIdx], values[lastIdx]);
  }
}

function renderFocusStatsGrid(days, values){
  const grid = document.getElementById('focusStatsGrid');
  if(!grid) return;
  const total = values.reduce((a,b)=>a+b,0);
  const activeDays = values.filter(v=>v>0).length;
  const avgActive = activeDays ? total/activeDays : 0;
  const avgAll = days.length ? total/days.length : 0;
  let bestIdx = 0;
  values.forEach((v,i)=>{ if(v > values[bestIdx]) bestIdx = i; });
  const bestVal = values[bestIdx] || 0;
  const bestDate = bestVal > 0 ? isoToJalaliLabel(days[bestIdx]) : '—';
  const streak = computeCurrentStreak();

  grid.innerHTML = `
    <div class="fstat-box"><div class="fstat-val">${formatMinutesShort(total)}</div><div class="fstat-lbl">مجموع</div></div>
    <div class="fstat-box"><div class="fstat-val">${formatMinutesShort(avgAll)}</div><div class="fstat-lbl">میانگین کل روزها</div></div>
    <div class="fstat-box"><div class="fstat-val">${formatMinutesShort(avgActive)}</div><div class="fstat-lbl">میانگین روزهای فعال</div></div>
    <div class="fstat-box"><div class="fstat-val">${activeDays}/${days.length}</div><div class="fstat-lbl">روزهای فعال</div></div>
    <div class="fstat-box"><div class="fstat-val">${formatMinutesShort(bestVal)}</div><div class="fstat-lbl">بهترین روز (${bestDate})</div></div>
    <div class="fstat-box"><div class="fstat-val">${streak} 🔥</div><div class="fstat-lbl">استریک فعلی</div></div>
  `;
}

function renderFocusDayList(days, values){
  const el = document.getElementById('focusDayList');
  if(!el) return;
  const max = Math.max(1, ...values);
  let html = '';
  for(let i=days.length-1; i>=0; i--){
    const v = values[i];
    const dt = new Date(days[i] + 'T12:00:00');
    const pct = Math.round((v/max)*100);
    html += `<div class="fday-row">
      <span class="fday-date">${DOW[dt.getDay()]} · ${isoToJalaliLabel(days[i])}</span>
      <span class="fday-bar-track"><span class="fday-bar-fill" style="width:${v>0?Math.max(3,pct):0}%"></span></span>
      <span class="fday-min">${v>0?formatMinutesShort(v):'—'}</span>
    </div>`;
  }
  el.innerHTML = html;
}

function renderFocusChart(range){
  SIMPLE.currentRange = range;
  ['range-7','range-30','range-90','range-all'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.classList.toggle('active', id === 'range-'+range);
  });

  const data = SIMPLE.statsData || {};
  let days;
  if(range === 'all'){
    days = Object.keys(data).sort();
    if(!days.length) days = [getTodayDateStr()];
  } else {
    const n = range === '90' ? 90 : (range === '30' ? 30 : 7);
    days = [];
    for(let i=n-1;i>=0;i--){
      const d = new Date();
      d.setDate(d.getDate()-i);
      days.push(isoDateStr(d));
    }
  }

  const container = document.getElementById('focusChartContainer');
  const statsGrid = document.getElementById('focusStatsGrid');
  const dayListEl = document.getElementById('focusDayList');
  if(!container) return;

  const values = days.map(d => data[d] || 0);

  if(!values.some(v => v > 0)){
    if(focusChartInstance){ focusChartInstance.destroy(); focusChartInstance = null; }
    const canvasWrap = document.getElementById('focusChartCanvasWrap');
    const heatWrap = document.getElementById('focusHeatmapWrap');
    if(canvasWrap){ canvasWrap.style.display = ''; canvasWrap.innerHTML = '<div style="color:var(--text4,#b5ae9f);font-size:13px;font-style:italic;padding:12px;text-align:center;">هنوز داده‌ای ثبت نشده.</div>'; }
    if(heatWrap) heatWrap.style.display = 'none';
    if(statsGrid) statsGrid.innerHTML = '';
    if(dayListEl) dayListEl.innerHTML = '';
    return;
  }

  const type = SIMPLE.chartType || 'bar';
  if(type === 'heat') drawFocusHeatmap(days, values);
  else drawFocusChartJS(days, values, type);

  renderFocusStatsGrid(days, values);
  renderFocusDayList(days, values);
}

// ── Wire simple mode into the existing view-init flow ──
const _origInitFocusView = initFocusView;
initFocusView = function(){
  _origInitFocusView();
  loadSimpleStateLocal();
  updateSimpleDisplay();
  renderSimpleFlags();
  fetchFocusStats('7');
  const savedUIMode = localStorage.getItem('elevateFocusUIMode') || 'simple';
  setFocusUIMode(savedUIMode, true);
};
