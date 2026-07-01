// ══════════════════════════════════════════════════
// ─── SLEEP TRACKER MODULE ─────────────────────────
// ══════════════════════════════════════════════════
let SLEEP = { date: null, entry: {}, history: [], charts: {} };

function calcSleepDuration(bed, wake) {
  if (!bed || !wake) return null;
  const [bh,bm] = bed.split(':').map(Number);
  const [wh,wm] = wake.split(':').map(Number);
  let bedMins = bh*60+bm;
  let wakeMins = wh*60+wm;
  if (bedMins < 12*60) bedMins += 24*60; // after-midnight bedtime counts as next day
  let dur = wakeMins + 24*60 - bedMins;
  if (dur > 24*60) dur -= 24*60;
  return dur;
}
function calcSleepScoreClient(bed, wake) {
  if (!bed || !wake) return 0;
  const [bh,bm] = bed.split(':').map(Number);
  const [wh,wm] = wake.split(':').map(Number);
  let bedMins = bh*60+bm;
  if (bedMins < 12*60) bedMins += 24*60; // after-midnight = next day
  const wakeMins = wh*60+wm;
  // Bed: full 3pts if 23:00–01:00, then -1pt per 30min outside that window
  const bedWindowStart = 23*60, bedWindowEnd = 25*60; // 23:00–01:00 (as 25:00)
  let bedScore;
  if (bedMins >= bedWindowStart && bedMins <= bedWindowEnd) bedScore = 3;
  else {
    const dev = Math.min(Math.abs(bedMins - bedWindowStart), Math.abs(bedMins - bedWindowEnd));
    bedScore = Math.max(0, 3 - dev/30);
  }
  // Wake: full 3pts if 08:00–09:00, then -1pt per 30min outside
  const wakeWindowStart = 8*60, wakeWindowEnd = 9*60;
  let wakeScore;
  if (wakeMins >= wakeWindowStart && wakeMins <= wakeWindowEnd) wakeScore = 3;
  else {
    const dev = Math.min(Math.abs(wakeMins - wakeWindowStart), Math.abs(wakeMins - wakeWindowEnd));
    wakeScore = Math.max(0, 3 - dev/30);
  }
  return Math.round((bedScore + wakeScore) * 100) / 100;
}

async function initSleep() {
  if (!F.jalaliToday) { try { const r=await fetch('/api/jalali_today'); F.jalaliToday=await r.json(); } catch(e){} }
  SLEEP.date = activeDate || todayISO();
  await loadSleepEntry();
}

async function loadSleepEntry() {
  const r = await fetch('/api/sleep/log?date=' + SLEEP.date);
  const d = await r.json();
  SLEEP.entry = d.entry || {};
  renderSleepView();
}

async function saveSleepEntry() {
  const bed = document.getElementById('sleepBedtime').value;
  const wake = document.getElementById('sleepWaketime').value;
  const quality = parseInt(document.getElementById('sleepQuality').value);
  const notes = document.getElementById('sleepNotes').value;
  await fetch('/api/sleep/log', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ date: SLEEP.date, bedtime: bed, waketime: wake, quality, notes })
  });
  showToast('Sleep logged ✓','success');
  await loadSleepEntry();
}

function setSleepBedPreset(val) {
  document.getElementById('sleepBedtime').value = val;
  document.querySelectorAll('.sleep-bed-preset').forEach(b => b.className = b.className.replace(' sel-ink',''));
  const btn = [...document.querySelectorAll('.sleep-bed-preset')].find(b => b.dataset.v === val);
  if (btn) btn.className += ' sel-ink';
  updateSleepPreview();
}
function setSleepWakePreset(val) {
  document.getElementById('sleepWaketime').value = val;
  document.querySelectorAll('.sleep-wake-preset').forEach(b => b.className = b.className.replace(' sel-ink',''));
  const btn = [...document.querySelectorAll('.sleep-wake-preset')].find(b => b.dataset.v === val);
  if (btn) btn.className += ' sel-ink';
  updateSleepPreview();
}

function updateSleepPreview() {
  const bed = document.getElementById('sleepBedtime').value;
  const wake = document.getElementById('sleepWaketime').value;
  const durEl = document.getElementById('sleepDurDisplay');
  const scoreEl = document.getElementById('sleepScoreDisplay');
  if (bed && wake) {
    const dur = calcSleepDuration(bed, wake);
    const h = Math.floor(dur/60), m = dur%60;
    durEl.innerHTML = `<div class="sleep-duration-num">${h}h ${m}m</div><div class="sleep-duration-sub">Time asleep</div>`;
    const score = calcSleepScoreClient(bed, wake);
    const pct = Math.round(score/6*100);
    const color = pct>=80?'var(--sage)':pct>=50?'var(--amber)':'var(--coral)';
    const bg = pct>=80?'var(--sageL)':pct>=50?'var(--amberL)':'var(--coralL)';
    scoreEl.style.background = bg;
    scoreEl.innerHTML = `<div style="font-family:Fraunces,serif;font-size:20px;font-weight:800;color:${color}">${score}/6</div><div style="font-size:11px;color:var(--text3)">Sleep quality score</div>`;
  } else {
    durEl.innerHTML = '<div style="color:var(--text4);font-size:13px;">Set both times</div>';
    scoreEl.innerHTML = '';
    scoreEl.style.background = 'transparent';
  }
}

function renderSleepView() {
  const app = document.getElementById('sleep-app');
  const e = SLEEP.entry;
  const dl = formatFoodDate(SLEEP.date);

  const bedPresets = ['21:00','22:00','22:30','23:00','23:30','00:00','00:30','01:00','01:30','02:00'];
  const wakePresets = ['05:30','06:00','06:30','07:00','07:30','08:00','08:30','09:00','09:30','10:00'];
  const curBed = e.bedtime || '23:00';
  const curWake = e.waketime || '08:00';

  const bedChips = bedPresets.map(t =>
    `<button class="chip sleep-bed-preset${curBed===t?' sel-ink':''}" data-v="${t}" onclick="setSleepBedPreset('${t}')" style="padding:6px 11px;font-size:12px;font-family:'JetBrains Mono',monospace;">${t}</button>`
  ).join('');
  const wakeChips = wakePresets.map(t =>
    `<button class="chip sleep-wake-preset${curWake===t?' sel-ink':''}" data-v="${t}" onclick="setSleepWakePreset('${t}')" style="padding:6px 11px;font-size:12px;font-family:'JetBrains Mono',monospace;">${t}</button>`
  ).join('');

  app.innerHTML = `
  <div class="sleep-grid">
    <div>
      <div class="sleep-log-card">
        <div class="mcard-title">😴 Log Sleep</div>

        <div class="sleep-time-row">
          <div>
            <div class="sleep-time-label">🌙 Bedtime</div>
            <input type="time" class="sleep-time-input" id="sleepBedtime" value="${curBed}" oninput="updateSleepPreview();document.querySelectorAll('.sleep-bed-preset').forEach(b=>{b.className=b.className.replace(' sel-ink','');if(b.dataset.v===this.value)b.className+=' sel-ink';})"/>
          </div>
          <div>
            <div class="sleep-time-label">☀️ Wake time</div>
            <input type="time" class="sleep-time-input" id="sleepWaketime" value="${curWake}" oninput="updateSleepPreview();document.querySelectorAll('.sleep-wake-preset').forEach(b=>{b.className=b.className.replace(' sel-ink','');if(b.dataset.v===this.value)b.className+=' sel-ink';})"/>
          </div>
        </div>

        <div class="fgroup" style="margin-bottom:12px;">
          <div class="flabel" style="margin-bottom:6px;">🌙 Quick Bedtime</div>
          <div class="chips" style="flex-wrap:wrap;gap:5px;">${bedChips}</div>
        </div>
        <div class="fgroup" style="margin-bottom:14px;">
          <div class="flabel" style="margin-bottom:6px;">☀️ Quick Wake Time</div>
          <div class="chips" style="flex-wrap:wrap;gap:5px;">${wakeChips}</div>
        </div>

        <div id="sleepDurDisplay" class="sleep-duration-display"></div>
        <div id="sleepScoreDisplay" class="sleep-score-display"></div>
        <div class="sleep-quality-row">
          <div class="flabel">Sleep quality <span id="sleepQualVal" style="color:var(--sky);font-size:16px">${e.quality||5}</span>/10</div>
          <div class="mood-row">
            <span style="font-size:16px">😩</span>
            <input type="range" class="mood-slider mood" id="sleepQuality" min="1" max="10" value="${e.quality||5}"
              oninput="document.getElementById('sleepQualVal').textContent=this.value"/>
            <span style="font-size:16px">😴</span>
          </div>
        </div>
        <div class="builder-label" style="margin-bottom:6px;">Notes</div>
        <textarea class="food-notes" id="sleepNotes" placeholder="Woke up at night, dreams, etc...">${e.notes||''}</textarea>
        <button class="save-btn" onclick="saveSleepEntry()" style="margin-top:14px;padding:12px;font-size:14px;">Save Sleep Log</button>
      </div>
    </div>

    <div>
      <div id="sleepStatsArea"><div style="text-align:center;padding:40px;color:var(--text3);font-style:italic;">Loading stats...</div></div>
    </div>
  </div>`;

  updateSleepPreview();
  loadSleepStats();
}

async function loadSleepStats() {
  const r = await fetch('/api/sleep/stats');
  const data = await r.json();
  renderSleepStats(data);
}

function renderSleepStats(data) {
  const el = document.getElementById('sleepStatsArea');
  if (!el) return;
  const valid = data.filter(d => d.bedtime && d.waketime);
  const avgScore = valid.length ? Math.round(valid.reduce((s,d)=>s+(d.sleep_score||0),0)/valid.length*100)/100 : 0;
  const avgDur = valid.length ? valid.reduce((s,d)=>s+calcSleepDuration(d.bedtime,d.waketime),0)/valid.length : 0;
  const onTimeNights = valid.filter(d => {
    const [bh,bm]=d.bedtime.split(':').map(Number);
    let bm2=bh*60+bm; if(bm2<12*60) bm2+=24*60;
    return bm2 <= 24*60+30; // bed by 00:30
  }).length;

  Object.values(SLEEP.charts).forEach(c=>{try{c.destroy();}catch(e){}});
  SLEEP.charts = {};

  el.innerHTML = `
  <div class="sleep-indicators">
    <div class="mindic">
      <div class="mindic-label">Avg Sleep Score</div>
      <div class="mindic-val" style="color:${avgScore>=4?'var(--sage)':'var(--amber)'}">${avgScore}/6</div>
      <div class="mindic-sub">last ${valid.length} nights</div>
    </div>
    <div class="mindic">
      <div class="mindic-label">Avg Duration</div>
      <div class="mindic-val" style="color:var(--sky)">${avgDur>0?Math.floor(avgDur/60)+'h '+Math.round(avgDur%60)+'m':'—'}</div>
      <div class="mindic-sub">per night</div>
    </div>
    <div class="mindic">
      <div class="mindic-label">On-time Nights</div>
      <div class="mindic-val" style="color:var(--sage)">${onTimeNights}/${valid.length}</div>
      <div class="mindic-sub">bed by 01:00</div>
    </div>
    <div class="mindic">
      <div class="mindic-label">Best Streak</div>
      <div class="mindic-val" style="color:var(--plum)">${calcSleepStreak(valid)}</div>
      <div class="mindic-sub">nights score ≥ 4</div>
    </div>
  </div>

  <div class="mcard" style="margin-bottom:16px;">
    <div class="mcard-title">Sleep Score Trend <span>last 30 nights</span></div>
    <div class="mchart-wrap" style="height:200px"><canvas id="sleepScoreChart"></canvas></div>
  </div>

  <div class="mcard" style="margin-bottom:16px;">
    <div class="mcard-title">Sleep Duration <span>hours per night</span></div>
    <div class="mchart-wrap" style="height:200px"><canvas id="sleepDurChart"></canvas></div>
  </div>

  <div class="mcard" style="margin-bottom:16px;">
    <div class="mcard-title">Bedtime vs Wake Time <span>last 30 nights</span></div>
    <div class="mchart-wrap" style="height:200px"><canvas id="sleepTimesChart"></canvas></div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px;">
    <div class="mcard">
      <div class="mcard-title">Self-rated Quality <span>avg per day</span></div>
      <div class="mchart-wrap" style="height:180px"><canvas id="sleepQualChart"></canvas></div>
    </div>
    <div class="mcard">
      <div class="mcard-title">By Day of Week <span>avg score</span></div>
      <div class="mchart-wrap" style="height:180px"><canvas id="sleepDowChart"></canvas></div>
    </div>
  </div>

  <div class="mcard">
    <div class="mcard-title">Sleep Debt <span>vs 8h target, cumulative</span></div>
    <div class="mchart-wrap" style="height:180px"><canvas id="sleepDebtChart"></canvas></div>
  </div>`;

  setTimeout(() => {
    const recent = valid.slice(-30);
    const labels = recent.map(d => d.jalali_label || d.date.slice(5));
    const gc='rgba(26,21,16,0.05)', tc='#a8967c';
    const baseOpts = {responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{x:{grid:{color:gc},ticks:{color:tc,maxTicksLimit:10}},y:{grid:{color:gc},ticks:{color:tc}}}};

    // 1. Score trend
    const c1 = document.getElementById('sleepScoreChart');
    if (c1) SLEEP.charts.score = new Chart(c1, { type:'bar', data:{ labels, datasets:[{
      label:'Sleep Score', data: recent.map(d=>d.sleep_score||0),
      backgroundColor: recent.map(d=>(d.sleep_score||0)>=4?'rgba(58,122,90,.65)':(d.sleep_score||0)>=2?'rgba(212,130,26,.65)':'rgba(232,93,58,.65)'),
      borderRadius:4
    }]}, options: Object.assign({},baseOpts,{scales:Object.assign({},baseOpts.scales,{y:{grid:{color:gc},ticks:{color:tc},max:6,min:0}})})});

    // 2. Duration trend
    const durData = recent.map(d=>{ const m=calcSleepDuration(d.bedtime,d.waketime); return m?Math.round(m/60*100)/100:null; });
    const c2 = document.getElementById('sleepDurChart');
    if (c2) SLEEP.charts.dur = new Chart(c2, { type:'line', data:{ labels, datasets:[
      { label:'Duration (h)', data: durData, borderColor:'#2a6a9a', backgroundColor:'rgba(42,106,154,.1)', fill:true, tension:.3, pointRadius:3, spanGaps:true },
      { label:'8h target', data: recent.map(()=>8), borderColor:'rgba(232,93,58,.5)', borderDash:[5,4], borderWidth:1.5, pointRadius:0 }
    ]}, options: Object.assign({},baseOpts,{plugins:{legend:{display:true,labels:{color:'#6b5c48',boxWidth:10,font:{size:11}}}}})});

    // 3. Bedtime vs wake time
    const bedMinsArr = recent.map(d=>{ const [h,m]=d.bedtime.split(':').map(Number); let v=h*60+m; if(v<12*60)v+=24*60; return Math.round((v-24*60)/60*100)/100; });
    const wakeMinsArr = recent.map(d=>{ const [h,m]=d.waketime.split(':').map(Number); return Math.round((h*60+m)/60*100)/100; });
    const c3 = document.getElementById('sleepTimesChart');
    if (c3) SLEEP.charts.times = new Chart(c3, { type:'line', data:{ labels, datasets:[
      { label:'Bedtime (hrs past midnight)', data:bedMinsArr, borderColor:'#7a3a6a', backgroundColor:'transparent', tension:.3, pointRadius:3 },
      { label:'Wake time (hrs)', data:wakeMinsArr, borderColor:'#2a6a9a', backgroundColor:'transparent', tension:.3, pointRadius:3 }
    ]}, options: Object.assign({},baseOpts,{plugins:{legend:{display:true,labels:{color:'#6b5c48',boxWidth:10,font:{size:11}}}}})});

    // 4. Self-rated quality
    const qualData = recent.map(d=>d.quality||null);
    const c4 = document.getElementById('sleepQualChart');
    if (c4) SLEEP.charts.qual = new Chart(c4, { type:'bar', data:{ labels, datasets:[{
      data: qualData, backgroundColor:'rgba(122,58,106,.55)', borderRadius:3, spanGaps:true
    }]}, options: Object.assign({},baseOpts,{scales:Object.assign({},baseOpts.scales,{y:{grid:{color:gc},ticks:{color:tc},max:10,min:0}})})});

    // 5. Day-of-week avg score
    const dowLabels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const dowTotals = Array(7).fill(0), dowCounts = Array(7).fill(0);
    valid.forEach(d=>{ const dow=new Date(d.date).getDay(); dowTotals[dow]+=(d.sleep_score||0); dowCounts[dow]++; });
    const dowAvgs = dowTotals.map((t,i)=>dowCounts[i]>0?Math.round(t/dowCounts[i]*100)/100:null);
    const c5 = document.getElementById('sleepDowChart');
    if (c5) SLEEP.charts.dow = new Chart(c5, { type:'bar', data:{ labels:dowLabels, datasets:[{
      data: dowAvgs, backgroundColor:'rgba(58,122,90,.6)', borderRadius:4
    }]}, options: Object.assign({},baseOpts,{scales:Object.assign({},baseOpts.scales,{y:{grid:{color:gc},ticks:{color:tc},max:6,min:0}})})});

    // 6. Cumulative sleep debt vs 8h target
    const target = 8*60;
    let debt = 0;
    const debtData = recent.map(d=>{ const dur=calcSleepDuration(d.bedtime,d.waketime)||0; debt+=dur-target; return Math.round(debt/60*100)/100; });
    const c6 = document.getElementById('sleepDebtChart');
    if (c6) SLEEP.charts.debt = new Chart(c6, { type:'line', data:{ labels, datasets:[{
      data: debtData,
      borderColor: debtData[debtData.length-1]>=0?'rgba(58,122,90,.8)':'rgba(232,93,58,.8)',
      backgroundColor: debtData[debtData.length-1]>=0?'rgba(58,122,90,.1)':'rgba(232,93,58,.1)',
      fill:true, tension:.3, pointRadius:2
    },{
      data: recent.map(()=>0), borderColor:'rgba(0,0,0,.15)', borderDash:[4,3], borderWidth:1, pointRadius:0
    }]}, options: Object.assign({},baseOpts,{plugins:{legend:{display:false}},
      scales:{x:{grid:{color:gc},ticks:{color:tc,maxTicksLimit:10}},y:{grid:{color:gc},ticks:{color:tc,callback:v=>v+'h'}}}})});
  }, 80);
}

function calcSleepStreak(valid) {
  let best=0, cur=0;
  valid.forEach(d=>{ if((d.sleep_score||0)>=4){cur++;best=Math.max(best,cur);}else cur=0; });
  return best + ' nights';
}

