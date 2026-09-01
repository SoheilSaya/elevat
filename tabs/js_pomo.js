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
};

function isoDateStr(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
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
  saveSimpleStateLocal();
  updateSimpleDisplay();
  showToast('تایمر ریست شد.', '');
}

function simpleTick(){
  const today = getTodayDateStr();
  if(today !== SIMPLE.dateStr){
    handleDateRollover(today);
  }
  updateSimpleDisplay();
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
  saveSimpleStateLocal();
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
    saveSimpleStateLocal();
    updateSimpleDisplay();
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
    startTimestamp: SIMPLE.startTimestamp
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
    if(SIMPLE.running){
      SIMPLE.interval = setInterval(simpleTick, 1000);
    }
  } else {
    SIMPLE.dateStr = today;
    SIMPLE.elapsedBeforePause = 0;
    SIMPLE.running = false;
    SIMPLE.startTimestamp = null;
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

function renderFocusChart(range){
  SIMPLE.currentRange = range;
  ['range-7','range-30','range-all'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.classList.toggle('active', id === 'range-'+range);
  });

  const data = SIMPLE.statsData || {};
  let days;
  if(range === 'all'){
    days = Object.keys(data).sort();
  } else {
    const n = range === '30' ? 30 : 7;
    days = [];
    for(let i=n-1;i>=0;i--){
      const d = new Date();
      d.setDate(d.getDate()-i);
      days.push(isoDateStr(d));
    }
  }

  const container = document.getElementById('focusChartContainer');
  const summaryEl = document.getElementById('focusChartSummary');
  if(!container) return;

  if(!days.length){
    container.innerHTML = '<div style="color:var(--text4,#b5ae9f);font-size:13px;font-style:italic;padding:12px;text-align:center;">هنوز داده‌ای ثبت نشده.</div>';
    if(summaryEl) summaryEl.textContent = '';
    return;
  }

  const values = days.map(d => data[d] || 0);
  const max = Math.max(1, ...values);
  const dense = days.length > 20;
  const barW = dense ? 6 : 22;
  const gap = dense ? 2 : 8;
  const chartH = 140;
  const width = days.length * (barW+gap) + gap;

  let bars = '';
  days.forEach((d,i)=>{
    const v = values[i];
    const h = v > 0 ? Math.max(3, (v/max) * (chartH-20)) : 1;
    const x = gap + i*(barW+gap);
    const y = chartH - h;
    const label = isoToJalaliLabel(d) + ' — ' + Math.round(v) + ' دقیقه';
    bars += `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="3" fill="url(#focusChartGrad)"><title>${label}</title></rect>`;
  });

  container.innerHTML = `<svg viewBox="0 0 ${width} ${chartH}" width="100%" height="${chartH}" preserveAspectRatio="xMinYMin meet">
    <defs>
      <linearGradient id="focusChartGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#e85d3a"/>
        <stop offset="100%" stop-color="#c44a6a"/>
      </linearGradient>
    </defs>
    ${bars}
  </svg>`;

  const totalMinutes = values.reduce((a,b)=>a+b,0);
  const activeDays = values.filter(v=>v>0).length;
  if(summaryEl){
    summaryEl.textContent = totalMinutes > 0
      ? `مجموع: ${Math.round(totalMinutes)} دقیقه · میانگین روزهای فعال: ${activeDays ? Math.round(totalMinutes/activeDays) : 0} دقیقه`
      : '';
  }
}

// ── Wire simple mode into the existing view-init flow ──
const _origInitFocusView = initFocusView;
initFocusView = function(){
  _origInitFocusView();
  loadSimpleStateLocal();
  updateSimpleDisplay();
  fetchFocusStats('7');
  const savedUIMode = localStorage.getItem('elevateFocusUIMode') || 'simple';
  setFocusUIMode(savedUIMode, true);
};
