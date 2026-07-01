// ══════════════════════════════════════════════════
// ─── JALALI CALENDAR MODULE ───────────────────────
// ══════════════════════════════════════════════════

let CAL = {
  jy: null, jm: null,  // current view month (jalali)
  events: [],           // [{id,title,date_iso,jalali_str,priority,done,type}]
  selectedPri: 1,
  adal: null,           // adalimumab reminder data
  history: {},          // score history keyed by gregorian iso
};

const CAL_MONTHS_FA = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const CAL_DAYS_FA   = ['ش','ی','د','س','چ','پ','ج']; // Sat=0 in Jalali week

// ── Jalali math (verified against jalaali-js reference algorithm) ──
function jDiv(a,b){ return Math.trunc(a/b); }
function jMod(a,b){ return a - Math.trunc(a/b)*b; }
const J_BREAKS = [-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178];
function jalCalInfo(jy) {
  const bl = J_BREAKS.length;
  let gy = jy + 621, leapJ = -14, jp = J_BREAKS[0], jm, jump, n;
  for (let i=1;i<bl;i++){ jm=J_BREAKS[i]; jump=jm-jp; if(jy<jm) break; leapJ+=jDiv(jump,33)*8+jDiv(jMod(jump,33),4); jp=jm; }
  n = jy - jp;
  leapJ += jDiv(n,33)*8 + jDiv(jMod(n,33)+3,4);
  if (jMod(jump,33)===4 && jump-n===4) leapJ += 1;
  const leapG = jDiv(gy,4) - jDiv((jDiv(gy,100)+1)*3,4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump-n < 6) n = n - jump + jDiv(jump+4,33)*33;
  let leap = jMod(jMod(n+1,33)-1,4);
  if (leap===-1) leap=4;
  return {leap, gy, march};
}
function jG2d(gy,gm,gd) {
  let d = jDiv((gy+jDiv(gm-8,6)+100100)*1461,4) + jDiv(153*jMod(gm+9,12)+2,5) + gd - 34840408;
  d = d - jDiv(jDiv(gy+100100+jDiv(gm-8,6),100)*3,4) + 752;
  return d;
}
function jD2g(jdn) {
  let j = 4*jdn + 139361631;
  j = j + jDiv(jDiv(4*jdn+183187720,146097)*3,4)*4 - 3908;
  const i = jDiv(jMod(j,1461),4)*5 + 308;
  const gd = jDiv(jMod(i,153),5) + 1;
  const gm = jMod(jDiv(i,153),12) + 1;
  const gy = jDiv(j,1461) - 100100 + jDiv(8-gm,6);
  return {gy,gm,gd};
}
function jJ2d(jy,jm,jd) {
  const r = jalCalInfo(jy);
  return jG2d(r.gy,3,r.march) + (jm-1)*31 - jDiv(jm,7)*(jm-7) + jd - 1;
}
function jD2j(jdn) {
  const gy = jD2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCalInfo(jy);
  const jdn1f = jG2d(gy,3,r.march);
  let k = jdn - jdn1f, jm, jd;
  if (k>=0) {
    if (k<=185) { jm=1+jDiv(k,31); jd=jMod(k,31)+1; return {jy,jm,jd}; }
    k -= 186;
  } else {
    jy -= 1; k += 179;
    if (r.leap===1) k += 1;
  }
  jm = 7+jDiv(k,30); jd = jMod(k,30)+1;
  return {jy,jm,jd};
}
function jDaysInMonth(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return jalCalInfo(jy).leap === 0 ? 30 : 29;
}
function jToGreg(jy, jm, jd) {
  const g = jD2g(jJ2d(jy,jm,jd));
  return g.gy + '-' + String(g.gm).padStart(2,'0') + '-' + String(g.gd).padStart(2,'0');
}
function calGregToJalali(iso) {
  const [gy,gm,gd] = iso.split('-').map(Number);
  return jD2j(jG2d(gy,gm,gd));
}
function jDowOfFirst(jy, jm) {
  const iso = jToGreg(jy, jm, 1);
  const dow = new Date(iso+'T12:00:00').getDay(); // 0=Sun
  // Jalali week: Sat=0,Sun=1,Mon=2,Tue=3,Wed=4,Thu=5,Fri=6
  return (dow + 1) % 7;
}
function isoToJalaliStr(iso) {
  const j = calGregToJalali(iso);
  return j.jd + ' ' + CAL_MONTHS_FA[j.jm-1] + ' ' + j.jy;
}

// ── Storage (localStorage-free: use server /api/calendar) ─
async function loadCalEvents() {
  try {
    const r = await fetch('/api/calendar/events');
    CAL.events = await r.json();
  } catch(e) { CAL.events = []; }
}
async function saveCalEvents() {
  try {
    await fetch('/api/calendar/events', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(CAL.events)
    });
  } catch(e) {}
}

// ── Init ──────────────────────────────────────────
async function initCalendar() {
  // Get current jalali month
  if (!F.jalaliToday) { const r=await fetch('/api/jalali_today'); F.jalaliToday=await r.json(); }
  if (!CAL.jy) { CAL.jy = F.jalaliToday.year; CAL.jm = F.jalaliToday.month; }
  // Load events, history, adal
  await loadCalEvents();
  const hr = await fetch('/api/history');
  CAL.history = await hr.json();
  const jr = await fetch('/api/today');
  const jd = await jr.json();
  CAL.adal = jd.adalimumab;
  renderCalendar();
}

// ── Render ────────────────────────────────────────
function renderCalendar() {
  const app = document.getElementById('calendar-app');
  const today = F.jalaliToday || {year:1403,month:1,day:1};
  const isCurrentMonth = CAL.jy === today.year && CAL.jm === today.month;
  const totalDays = jDaysInMonth(CAL.jy, CAL.jm);
  const firstDow = jDowOfFirst(CAL.jy, CAL.jm); // 0=Sat

  // Build adal injection days for this month
  const adalDays = new Set();
  if (CAL.adal && CAL.adal.next_date) {
    // Show next injection and ±1 cycle
    const interval = CAL.adal.interval_days || 14;
    for (let offset = -2; offset <= 6; offset++) {
      const d = new Date(CAL.adal.next_date + 'T12:00:00');
      d.setDate(d.getDate() + offset * interval);
      const iso = d.toISOString().slice(0,10);
      const j = calGregToJalali(iso);
      if (j.jy === CAL.jy && j.jm === CAL.jm) adalDays.add(j.jd);
    }
  }

  // Upcoming events sorted
  const upcomingEvs = [...CAL.events]
    .filter(e => !e.done)
    .sort((a,b) => a.date_iso.localeCompare(b.date_iso))
    .slice(0,15);

  // Events grouped by jalali day
  const evsByDay = {};
  CAL.events.forEach(ev => {
    try {
      const j = calGregToJalali(ev.date_iso);
      if (j.jy === CAL.jy && j.jm === CAL.jm) {
        if (!evsByDay[j.jd]) evsByDay[j.jd] = [];
        evsByDay[j.jd].push(ev);
      }
    } catch(e) {}
  });

  // Build calendar grid
  let gridHTML = CAL_DAYS_FA.map(d => `<div class="cal-dow">${d}</div>`).join('');
  // Empty padding cells
  for (let i=0; i<firstDow; i++) gridHTML += '<div></div>';
  for (let d=1; d<=totalDays; d++) {
    const iso = jToGreg(CAL.jy, CAL.jm, d);
    const isToday = isCurrentMonth && d === today.day;
    const dayHist = CAL.history[iso];
    const score = dayHist ? dayHist.score : null;
    const isAdal = adalDays.has(d);
    const dayEvs = evsByDay[d] || [];
    const isPast = iso < (F.jalaliToday?.gregorian || '9999');
    let cls = 'cal-day';
    if (isToday) cls += ' today';
    if (isAdal) cls += ' adal-day';
    if (dayEvs.length) cls += ' has-events';
    // Full spectrum background: red(0) -> yellow(50) -> green(100)
    let scoreBg = '';
    if (!isToday && isPast && score !== null) {
      const hue = Math.round(score * 1.2); // 0=red(0deg) 100=green(120deg)
      scoreBg = `background:hsla(${hue},65%,88%,0.9);`;
    }
    const scoreStr = (isPast && score !== null) ? `<div class="cal-day-score">${score}%</div>` : '';
    const evDotsHTML = dayEvs.slice(0,3).map(ev => {
      const priColor = ev.type==='adal' ? '#c44a6a' : ev.priority===1?'#e85d3a':ev.priority===2?'#d4821a':'#3a7a5a';
      return `<div class="cal-event-dot" style="background:${priColor}" title="${ev.title}">${ev.title.slice(0,12)}</div>`;
    }).join('');
    const adalBadge = isAdal ? '<div style="position:absolute;top:4px;right:4px;font-size:10px">💉</div>' : '';
    gridHTML += `<div class="${cls}" style="${scoreBg}" onclick="calDayClick(${d},'${iso}')">
      ${adalBadge}
      <div class="cal-day-num">${d}</div>
      ${scoreStr}
      <div class="cal-events">${evDotsHTML}</div>
    </div>`;
  }

  // Side panel - add event form + event list
  const todayISO2 = F.jalaliToday?.gregorian || new Date().toISOString().slice(0,10);
  const allEvsSorted = [...CAL.events].sort((a,b)=>a.date_iso.localeCompare(b.date_iso));

  app.innerHTML = `
  <div class="cal-wrap">
    <div class="cal-main">
      <div class="cal-header">
        <button class="cal-nav-btn" onclick="calChangeMonth(-1)">‹</button>
        <div class="cal-month-label">${CAL_MONTHS_FA[CAL.jm-1]} ${CAL.jy}</div>
        <button class="cal-nav-btn" onclick="calChangeMonth(1)">›</button>
        <button class="cal-nav-btn" onclick="calGoToday()" title="برو به امروز" style="font-size:12px;width:auto;padding:0 10px;">امروز</button>
      </div>
      <div class="cal-grid">${gridHTML}</div>
      <div class="cal-legend">
        <span><span class="cal-leg-dot" style="background:hsl(120,65%,88%)"></span>Great (≥80%)</span>
        <span><span class="cal-leg-dot" style="background:hsl(60,65%,88%)"></span>OK (50%)</span>
        <span><span class="cal-leg-dot" style="background:hsl(0,65%,88%)"></span>Poor (≤0%)</span>
        <span><span class="cal-leg-dot" style="background:#fce8ee;border:2px solid #c44a6a"></span>💉 Adalimumab</span>
      </div>
    </div>

    <div class="cal-side">
      <!-- Add event -->
      <div class="cal-add-card">
        <div class="cal-add-title">➕ رویداد جدید <span id="calAddDateLabel"></span></div>
        <input type="text" class="modal-input" id="calEvTitle" placeholder="عنوان رویداد / ددلاین..." style="margin-bottom:10px;width:100%;"/>
        <div class="builder-label" style="margin-bottom:6px;">تاریخ (شمسی)</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px;">
          <input type="number" class="modal-input" id="calEvJY" placeholder="سال" value="${CAL.jy}" style="margin:0;text-align:center;"/>
          <input type="number" class="modal-input" id="calEvJM" placeholder="ماه" value="${CAL.jm}" min="1" max="12" style="margin:0;text-align:center;"/>
          <input type="number" class="modal-input" id="calEvJD" placeholder="روز" value="${today.day}" min="1" max="31" style="margin:0;text-align:center;"/>
        </div>
        <div class="builder-label" style="margin-bottom:6px;">اولویت</div>
        <div class="cal-priority">
          <button class="cal-pri-btn p1 ${CAL.selectedPri===1?'sel':''}" onclick="calSetPri(1,this)">🔴 بالا</button>
          <button class="cal-pri-btn p2 ${CAL.selectedPri===2?'sel':''}" onclick="calSetPri(2,this)">🟡 متوسط</button>
          <button class="cal-pri-btn p3 ${CAL.selectedPri===3?'sel':''}" onclick="calSetPri(3,this)">🟢 پایین</button>
        </div>
        <button class="save-btn" onclick="calAddEvent()" style="padding:12px;font-size:14px;margin-top:10px;">ذخیره رویداد</button>
      </div>

      <!-- Upcoming events -->
      <div class="cal-add-card">
        <div class="cal-add-title">📋 رویدادها <span>${CAL.events.length} مورد</span></div>
        <div class="cal-events-list">
          ${allEvsSorted.length ? allEvsSorted.map(ev => {
            const priColor = ev.type==='adal'?'#c44a6a':ev.priority===1?'#e85d3a':ev.priority===2?'#d4821a':'#3a7a5a';
            const j = calGregToJalali(ev.date_iso);
            const jStr = j.jd + ' ' + CAL_MONTHS_FA[j.jm-1];
            const isPast = ev.date_iso < todayISO2;
            return `<div class="cal-ev-item ${ev.done?'done':''}">
              <div style="width:5px;border-radius:3px;background:${priColor};align-self:stretch;flex-shrink:0"></div>
              <div class="cal-ev-cb ${ev.done?'done':''}" onclick="calToggleEv('${ev.id}')">${ev.done?'✓':''}</div>
              <div class="cal-ev-body">
                <div class="cal-ev-title">${ev.type==='adal'?'💉 ':''} ${ev.title}</div>
                <div class="cal-ev-date">${jStr} ${isPast&&!ev.done?'<span style="color:var(--coral)">⚠️ گذشته</span>':''}</div>
              </div>
              ${ev.type!=='adal'?`<button class="cal-ev-del" onclick="calDeleteEv('${ev.id}')">×</button>`:''}
            </div>`;
          }).join('') : '<div style="color:var(--text4);font-size:13px;padding:8px;font-style:italic;">هنوز رویدادی ثبت نشده</div>'}
        </div>
      </div>
    </div>
  </div>`;
}

// ── Actions ───────────────────────────────────────
function calChangeMonth(delta) {
  CAL.jm += delta;
  if (CAL.jm > 12) { CAL.jm = 1; CAL.jy++; }
  if (CAL.jm < 1)  { CAL.jm = 12; CAL.jy--; }
  renderCalendar();
}
function calGoToday() {
  if (F.jalaliToday) { CAL.jy = F.jalaliToday.year; CAL.jm = F.jalaliToday.month; }
  renderCalendar();
}
function calSetPri(p, btn) {
  CAL.selectedPri = p;
  document.querySelectorAll('.cal-pri-btn').forEach(b=>b.classList.remove('sel'));
  btn.classList.add('sel');
}
function calDayClick(jd, iso) {
  // Pre-fill the date inputs
  document.getElementById('calEvJD').value = jd;
  const j = calGregToJalali(iso);
  document.getElementById('calEvJY').value = j.jy;
  document.getElementById('calEvJM').value = j.jm;
  document.getElementById('calEvTitle').focus();
}
async function calAddEvent() {
  const title = document.getElementById('calEvTitle').value.trim();
  const jy = parseInt(document.getElementById('calEvJY').value);
  const jm = parseInt(document.getElementById('calEvJM').value);
  const jd = parseInt(document.getElementById('calEvJD').value);
  if (!title) { showToast('عنوان رویداد را وارد کنید',''); return; }
  if (!jy||!jm||!jd||jm<1||jm>12||jd<1||jd>31) { showToast('تاریخ نامعتبر',''); return; }
  const iso = jToGreg(jy, jm, jd);
  CAL.events.push({
    id: 'ev_'+Date.now(),
    title, date_iso: iso, priority: CAL.selectedPri, done: false, type:'user'
  });
  await saveCalEvents();
  document.getElementById('calEvTitle').value = '';
  renderCalendar();
  showToast('رویداد ذخیره شد ✓','success');
}
async function calToggleEv(id) {
  const ev = CAL.events.find(e=>e.id===id);
  if (ev) ev.done = !ev.done;
  await saveCalEvents();
  renderCalendar();
}
async function calDeleteEv(id) {
  CAL.events = CAL.events.filter(e=>e.id!==id);
  await saveCalEvents();
  renderCalendar();
}


// ── STICKY NOTES ──────────────────────────────────
let stickyNotes = [];
async function loadStickyNotes() {
  try {
    const r = await fetch('/api/sticky');
    const d = await r.json();
    stickyNotes = d.notes || [];
  } catch(e) { stickyNotes = []; }
  renderStickyNotes();
}
function renderStickyNotes() {
  const el = document.getElementById('stickyList');
  if (!el) return;
  if (!stickyNotes.length) {
    el.innerHTML = '<div style="font-size:12px;color:#a08030;font-style:italic;">Nothing pinned yet...</div>';
    return;
  }
  el.innerHTML = stickyNotes.map((n,i) => `
    <div style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;background:rgba(255,255,255,0.6);border:1px solid #e8d080;border-radius:50px;white-space:nowrap;">
      <span style="font-size:12px;font-weight:600;color:#5a4000;">${n}</span>
      <button onclick="removeStickyNote(${i})" style="border:none;background:transparent;cursor:pointer;color:#c09020;font-size:13px;font-weight:700;padding:0;line-height:1;">×</button>
    </div>`).join('');
}
async function addStickyNote() {
  const inp = document.getElementById('stickyInput');
  const val = inp.value.trim();
  if (!val) return;
  if (stickyNotes.length >= 10) { showToast('Max 10 notes!',''); return; }
  stickyNotes.push(val);
  inp.value = '';
  renderStickyNotes();
  await saveStickyNotes();
}
async function removeStickyNote(i) {
  stickyNotes.splice(i,1);
  renderStickyNotes();
  await saveStickyNotes();
}
async function saveStickyNotes() {
  try {
    // Preserve userCharts when saving sticky notes
    const savedCharts = typeof userCharts !== 'undefined' ? userCharts.map(c=>({type:c.type,xField:c.xField,yFields:c.yFields,title:c.title})) : [];
    await fetch('/api/sticky', {method:'POST',headers:{'Content-Type':'application/json'},
      body: JSON.stringify({notes: stickyNotes, userCharts: savedCharts})});
  } catch(e) {}
}


function toggleScoreBreakdown(){
  document.getElementById('scoreBreakdownOverlay').classList.toggle('open');
}

