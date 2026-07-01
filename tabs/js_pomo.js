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



