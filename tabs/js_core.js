<script>
// ─── STATE ─────────────────────────────────────────
const state = {
  gym:'none', home_exercise:'none', food:'', skincare:'none', socialized:'none', soda:false, fruit_veg:false,
  calories:1500, protein:100, weight:88,
  uni_study_mins:0, car_courses_mins:0, selfdev_mins:0,
  mood:5, pain:3, pills:false,
  teeth_brushed:0, meditated:false
};
let saveTimer=null, statsData=[], userCharts=[];
let activeDate = null; // null = today

// ─── INIT ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded',async ()=>{
  // Quiet build/version footer (bottom-right corner) — confirms a rebuild actually took effect
  const verEl = document.createElement('div');
  verEl.id = 'buildVersionFooter';
  verEl.style.cssText = 'position:fixed;bottom:6px;right:10px;font-size:9px;color:var(--text4);opacity:.5;font-family:JetBrains Mono,monospace;z-index:9999;pointer-events:none;user-select:none;';
  document.body.appendChild(verEl);
  // Sanity check: confirm the running server has the latest routes
  try {
    const vr = await fetch('/api/version');
    if (!vr.ok) throw new Error('no version endpoint');
    const vd = await vr.json();
    verEl.textContent = vd.version;
    console.log('%c[Elevate] Server version: ' + vd.version, 'color:#3a7a5a;font-weight:bold');
  } catch(e) {
    verEl.textContent = 'version unknown — outdated server';
    verEl.style.color = 'var(--coral)';
    verEl.style.opacity = '.8';
    console.warn('%c[Elevate] ⚠️ Server is running an OUTDATED app.py (no /api/version route found). Sleep/Calendar/Sticky tabs will 404. Replace app.py and FULLY RESTART the Flask server (stop the process, do not just refresh the page).', 'color:#e85d3a;font-weight:bold;font-size:13px;');
  }
  // Load Jalali date from server and display it
  try {
    const jr = await fetch('/api/jalali_today');
    const jd = await jr.json();
    const jMonthsEn = ['Farvardin','Ordibehesht','Khordad','Tir','Mordad','Shahrivar','Mehr','Aban','Azar','Dey','Bahman','Esfand'];
    const greg = new Date(jd.gregorian + 'T12:00:00');
    const engDow = greg.toLocaleDateString('en-US',{weekday:'long'}).toUpperCase();
    document.getElementById('navDate').textContent =
      engDow + ' · ' + jd.day + ' ' + jMonthsEn[jd.month-1] + ' ' + jd.year;
  } catch(e) {
    const d=new Date();
    document.getElementById('navDate').textContent=
      d.toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}).toUpperCase();
  }
  renderDateSwitcher();
  loadToday();
  loadStickyNotes();
});

// ─── DATE SWITCHER ─────────────────────────────────
function toLocalISO(d){ // get YYYY-MM-DD in local time
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

const J_DAYS_SHORT = ['ی','د','س','چ','پ','ج','ش'];
const J_MONTHS_FA = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];

function jalaliLabel(iso) {
  try {
    const j = gregToJalali(iso);
    return j.d + ' ' + J_MONTHS_FA[j.m-1];
  } catch(e) { return iso.slice(5); }
}

async function renderDateSwitcher(){
  // Ensure jalali cache loaded
  if (!F.jalaliToday) { try { const r=await fetch('/api/jalali_today'); F.jalaliToday=await r.json(); } catch(e){} }
  const r = await fetch('/api/history');
  const hist = await r.json();
  const container = document.getElementById('dateSwitcher');
  container.innerHTML = '';
  // i = days ago (0=today, 1=yesterday, 2=two days ago). labels[i] must match i, not loop position.
  const labels = ['Today','Yesterday','2 Days Ago'];
  for(let i=2;i>=0;i--){
    const d = new Date(); d.setDate(d.getDate()-i);
    const iso = toLocalISO(d);
    const hasData = !!hist[iso];
    const isActive = activeDate === null ? i===0 : activeDate===iso;
    const btn = document.createElement('button');
    btn.className = 'date-tab'+(isActive?' active':'');
    const jLabel = jalaliLabel(iso);
    const dotHTML = hasData ? '<span class="date-tab-dot" title="Data logged"></span>' : '';
    btn.innerHTML = `${dotHTML}<span class="date-tab-label">${labels[i]}</span><span class="date-tab-day">${jLabel}</span>`;
    btn.onclick = ()=>switchDate(i===0?null:iso);
    container.appendChild(btn);
  }
}

async function switchDate(iso){
  activeDate = iso;
  renderDateSwitcher();
  // Sync food module date
  F.date = iso || todayISO();
  F._logCache = null;
  if (document.getElementById('food-view').style.display !== 'none') loadFoodEntry();
  // Sync sleep module date
  if (typeof SLEEP !== 'undefined') {
    SLEEP.date = iso || todayISO();
    if (document.getElementById('sleep-view').style.display !== 'none') loadSleepEntry();
  }
  // show/hide editing banner
  const banner = document.getElementById('editingBanner');
  if(iso){
    const d = new Date(iso+'T12:00:00');
    document.getElementById('editingBannerText').textContent =
      'Editing ' + d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
    banner.classList.add('show');
  } else {
    banner.classList.remove('show');
  }
  await loadToday();
}

async function loadToday(){
  const url = activeDate ? `/api/today?date=${activeDate}` : '/api/today';
  const r=await fetch(url);
  const d=await r.json();
  resetForm();
  fillState(d.entry);
  updateScore(d.score);
  renderAdal(d.adalimumab);
  loadStreak();
  updateMetrics();
}

function resetForm(){
  // Reset all state to defaults before loading a different day
  Object.assign(state,{gym:'none',home_exercise:'none',food:'',skincare:'none',socialized:'none',soda:false,fruit_veg:false,
    calories:1500,protein:100,weight:88,uni_study_mins:0,car_courses_mins:0,selfdev_mins:0,mood:5,pain:3,pills:false});
  ['gym-chips','home-exercise-chips','food-chips','skincare-chips','social-chips','soda-chips','fruitveg-chips','teeth-chips'].forEach(id=>{
    const g=document.getElementById(id);
    if(g) g.querySelectorAll('.chip').forEach(b=>b.className='chip');
  });
  [['cal-slider','cal-display',1500],['prot-slider','prot-display',100],['wt-slider','wt-display',88],
   ['uni-slider','uni-display',0],['car-slider','car-display',0],['dev-slider','dev-display',0]].forEach(([s,d,v])=>{
    const sl=document.getElementById(s); const dp=document.getElementById(d);
    if(sl) sl.value=v; if(dp) dp.textContent=v;
  });
  document.getElementById('mood').value=5; document.getElementById('moodVal').textContent=5;
  document.getElementById('pain').value=3; document.getElementById('painVal').textContent=3;
  document.getElementById('pills').checked=false;
  document.getElementById('meditated').checked=false;
  const tc=document.getElementById('teeth-chips');
  if(tc) tc.querySelectorAll('.chip').forEach(b=>b.className='chip');
}


function fillState(e){
  if(!e) return;
  const keys=['gym','home_exercise','food','skincare','socialized','fruit_veg'];
  keys.forEach(k=>{if(e[k]!==undefined){state[k]=e[k]; pickByVal(k,e[k]);}});
  if(e.soda!==undefined){state.soda=e.soda; pickByVal('soda',e.soda);}
  const nums={calories:{s:'cal-slider',d:'cal-display',min:500,max:5000},
    protein:{s:'prot-slider',d:'prot-display'},weight:{s:'wt-slider',d:'wt-display'},
    uni_study_mins:{s:'uni-slider',d:'uni-display'},car_courses_mins:{s:'car-slider',d:'car-display'},
    selfdev_mins:{s:'dev-slider',d:'dev-display'}};
  Object.entries(nums).forEach(([k,cfg])=>{
    if(e[k]!=null){
      state[k]=e[k];
      const sl=document.getElementById(cfg.s);
      const dp=document.getElementById(cfg.d);
      if(sl) sl.value=e[k];
      if(dp) dp.textContent=e[k];
    }
  });
  if(e.mood!=null){state.mood=e.mood;document.getElementById('mood').value=e.mood;document.getElementById('moodVal').textContent=e.mood;}
  if(e.pain!=null){state.pain=e.pain;document.getElementById('pain').value=e.pain;document.getElementById('painVal').textContent=e.pain;}
  if(e.pills!=null){state.pills=e.pills;document.getElementById('pills').checked=e.pills;}
  if(e.meditated!=null){state.meditated=e.meditated;document.getElementById('meditated').checked=e.meditated;}
  if(e.teeth_brushed!=null){state.teeth_brushed=e.teeth_brushed;pickByVal('teeth_brushed',e.teeth_brushed);}
}

// ─── CHOICE CHIPS ──────────────────────────────────
const colorMap={sage:'sel-sage',amber:'sel-amber',coral:'sel-coral',sky:'sel-sky',plum:'sel-plum',rose:'sel-rose',ink:'sel-ink'};
const groupId={gym:'gym-chips',home_exercise:'home-exercise-chips',food:'food-chips',skincare:'skincare-chips',socialized:'social-chips',soda:'soda-chips',fruit_veg:'fruitveg-chips',teeth_brushed:'teeth-chips'};

function pick(field,val,btn,color){
  state[field]=val;
  const grp=document.getElementById(groupId[field]);
  if(grp) grp.querySelectorAll('.chip').forEach(b=>b.className='chip');
  if(btn) btn.className='chip '+(colorMap[color]||'sel-ink');
  autoSave();
}

function pickByVal(field,val){
  const grp=document.getElementById(groupId[field]);
  if(!grp) return;
  const colorForVal={
    gym:{none:'ink',skipped:'rose',half:'amber',full:'sage'},
    home_exercise:{none:'ink',half:'sky',full:'sage'},
    food:{homemade:'sage',healthy_out:'sky',junk:'coral'},
    skincare:{none:'coral',half:'amber',full:'sage'},
    socialized:{none:'coral',chat:'amber',irl:'sage'},
    soda:{false:'sage',true:'coral'},
    fruit_veg:{false:'coral',true:'sage'},
    teeth_brushed:{0:'coral',1:'amber',2:'sage'}
  };
  const strVal=String(val);
  const btn=grp.querySelector(`[data-v="${strVal}"]`);
  if(btn){
    const c=colorForVal[field]?.[strVal==='true'?true:strVal==='false'?false:strVal]||'ink';
    grp.querySelectorAll('.chip').forEach(b=>b.className='chip');
    btn.className='chip '+(colorMap[c]||'sel-ink');
  }
}

// ─── SMART INPUTS ──────────────────────────────────
function setSmartVal(field,val,btn){
  state[field]=val;
  const slMap={calories:'cal-slider',protein:'prot-slider',weight:'wt-slider',
    uni_study_mins:'uni-slider',car_courses_mins:'car-slider',selfdev_mins:'dev-slider'};
  const dpMap={calories:'cal-display',protein:'prot-display',weight:'wt-display',
    uni_study_mins:'uni-display',car_courses_mins:'car-display',selfdev_mins:'dev-display'};
  const sl=document.getElementById(slMap[field]);
  const dp=document.getElementById(dpMap[field]);
  if(sl) sl.value=val;
  if(dp) dp.textContent=val;
  // highlight preset
  if(btn){
    btn.closest('.smart-presets').querySelectorAll('.preset').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
  }
  autoSave(); updateMetrics();
}

function syncSlider(field,val){
  state[field]=parseFloat(val);
  const dpMap={calories:'cal-display',protein:'prot-display',weight:'wt-display',
    uni_study_mins:'uni-display',car_courses_mins:'car-display',selfdev_mins:'dev-display'};
  const dp=document.getElementById(dpMap[field]);
  if(dp) dp.textContent=val;
  // deselect presets
  autoSave(); updateMetrics();
}

// ─── METRICS BAR ──────────────────────────────────
function updateMetrics(){
  const cal=state.calories||0, prot=state.protein||0, wt=state.weight||0;
  const study=(state.uni_study_mins||0)+(state.car_courses_mins||0)+(state.selfdev_mins||0);
  document.getElementById('mCal').textContent=cal>0?cal+' kcal':'—';
  document.getElementById('mCalBar').style.width=Math.min(100,cal/3000*100)+'%';
  // Deficit calc — pessimistic: real intake is ~15% higher than reported (underreporting bias)
  // TDEE for ~88kg male: sedentary 2050, light activity 2300, moderate 2550
  // We use the body weight stored in state if available; else 88kg default
  const bodyWt = state.weight || 88;
  const tdee = Math.round(10 * bodyWt + 6.25 * 175 - 5 * 24 + 5) * 1.375; // Mifflin-StJeor × light activity
  // Apply 15% pessimistic upward correction to reported calories
  const adjCal = Math.round(cal * 1.15);
  const defEl = document.getElementById('mDeficit');
  if (defEl && cal > 0) {
    const deficit = Math.round(tdee) - adjCal;
    // 7700 kcal = 1 kg fat, but body is not 100% efficient so use 8000 for pessimistic fat loss estimate
    const gramsLost  = Math.round(deficit / 8.0);
    const gramsGained = Math.round(Math.abs(deficit) / 7.7); // fat gain is more efficient
    if (deficit > 0) {
      const pessLabel = gramsLost < deficit/9 ? '' : '';
      defEl.style.color = 'var(--sage)';
      defEl.textContent = 'Adj. intake ~' + adjCal + ' kcal · deficit ' + deficit + ' kcal → ~' + gramsLost + 'g fat lost (optimistic estimate)';
    } else if (deficit < 0) {
      defEl.style.color = 'var(--coral)';
      defEl.textContent = 'Adj. intake ~' + adjCal + ' kcal · surplus ' + Math.abs(deficit) + ' kcal → ~' + gramsGained + 'g fat gained';
    } else {
      defEl.style.color = 'var(--text3)';
      defEl.textContent = 'Adj. ~' + adjCal + ' kcal — at maintenance';
    }
  } else if (defEl) {
    defEl.textContent = '';
  }
  document.getElementById('mProt').textContent=prot>0?prot+'g':'—';
  document.getElementById('mProtBar').style.width=Math.min(100,prot/220*100)+'%';
  document.getElementById('mWeight').textContent=wt>0?wt+' kg':'—';
  document.getElementById('mWeightBar').style.width=wt>0?Math.min(100,Math.max(0,(wt-70)/50*100))+'%':'0%';
  document.getElementById('mStudy').textContent=study>0?study+' min':'—';
  document.getElementById('mStudyBar').style.width=Math.min(100,study/360*100)+'%';
}

// ─── SCORE ─────────────────────────────────────────
function updateScore(s){
  document.getElementById('ringPct').textContent=s+'%';
  const circ=2*Math.PI*52;
  document.getElementById('ringFg').style.strokeDashoffset=circ-(s/100)*circ;
  const e=s>=90?'🔥':s>=75?'⚡':s>=60?'✅':s>=40?'📈':'🌱';
  const m=s>=90?'Legendary!':s>=75?'Crushing it!':s>=60?'Solid day':s>=40?'Getting there':'Start logging!';
  document.getElementById('scoreEmoji').textContent=e;
  document.getElementById('scoreMsg').textContent=m;
}

// ─── ADALIMUMAB ────────────────────────────────────
function renderAdal(a){
  document.getElementById('adalMsg').textContent=a.message;
  const badge=document.getElementById('adalBadge');
  badge.className='adal-badge '+(a.status||'unknown');
  if(a.status==='overdue'||a.status==='today') badge.textContent='🚨';
  else if(a.status==='soon') badge.textContent='⏰';
  else badge.textContent='💉';
  if(a.next_date) {
    // Convert to Jalali
    try {
      const jn = gregToJalali(a.next_date);
      const jMonthsEn2 = ['Farvardin','Ordibehesht','Khordad','Tir','Mordad','Shahrivar','Mehr','Aban','Azar','Dey','Bahman','Esfand'];
      document.getElementById('adalNextDate').textContent = 'Next: ' + jn.d + ' ' + jMonthsEn2[jn.m-1] + ' ' + jn.y;
    } catch(e) {
      document.getElementById('adalNextDate').textContent = 'Next: ' + a.next_date;
    }
  }
  // progress bar
  if(a.days_until!=null){
    const interval=14, pct=Math.max(0,Math.min(100,((interval-a.days_until)/interval)*100));
    document.getElementById('adalBar').style.width=pct+'%';
    if(a.status==='overdue'||a.status==='today') document.getElementById('adalBar').style.background='linear-gradient(90deg,var(--coral2),var(--coral))';
  }
}

function openAdal(){ document.getElementById('adalOverlay').classList.add('open'); }
function closeAdal(){ document.getElementById('adalOverlay').classList.remove('open'); }
async function saveAdal(){
  const last=document.getElementById('adalDate').value;
  const interval=parseInt(document.getElementById('adalInterval').value)||14;
  if(!last){showToast('Please select a date','error');return;}
  const r=await fetch('/api/adalimumab',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({last_injection:last,interval_days:interval})});
  const d=await r.json();
  renderAdal(d.reminder); closeAdal(); showToast('💉 Reminder updated!','success');
}

// ─── STREAK ────────────────────────────────────────
async function loadStreak(){
  const r=await fetch('/api/history');
  const h=await r.json();
  const c=document.getElementById('streakDots');
  c.innerHTML='';
  const today=new Date();
  for(let i=29;i>=0;i--){
    const d=new Date(today); d.setDate(d.getDate()-i);
    const k=d.toISOString().slice(0,10);
    const e=h[k];
    const dot=document.createElement('div');
    dot.className='sdot';
    if(e){dot.classList.add(e.socialized==='irl'||e.socialized==='chat'?'hit':'miss');}
    dot.title=k; c.appendChild(dot);
  }
}

// ─── SAVE ──────────────────────────────────────────
function autoSave(){
  clearTimeout(saveTimer);
  saveTimer=setTimeout(saveAll,1400);
}

async function saveAll(){
  const payload={
    _date: activeDate || toLocalISO(new Date()),
    gym:state.gym, home_exercise:state.home_exercise, food:state.food, skincare:state.skincare, socialized:state.socialized,
    soda:state.soda, fruit_veg:state.fruit_veg,
    calories:state.calories||0, protein:state.protein||0, weight:state.weight||null,
    uni_study_mins:state.uni_study_mins||0, car_courses_mins:state.car_courses_mins||0,
    selfdev_mins:state.selfdev_mins||0,
    pain:parseInt(document.getElementById('pain').value),
    mood:parseInt(document.getElementById('mood').value),
    pills:document.getElementById('pills').checked,
    meditated:document.getElementById('meditated').checked,
    teeth_brushed:state.teeth_brushed||0,
  };
  const r=await fetch('/api/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const d=await r.json();
  updateScore(d.score);
  const label = activeDate ? '✏️ Past day saved!' : 'Saved';
  showToast(label+' — Score: '+d.score+'%','success');
  updateMetrics();
  renderDateSwitcher(); // refresh dots
}

// ─── TOAST ─────────────────────────────────────────
function showToast(msg,type=''){
  const t=document.getElementById('toast');
  t.textContent=msg; t.className='toast '+(type||'');
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2400);
}

// ─── VIEW SWITCHING ────────────────────────────────
function showView(v){
  ['today','focus','food','money','sleep','calendar','people','goals','car','stats','history'].forEach(x=>{
    document.getElementById(x+'-view').style.display=x===v?'block':'none';
  });
  document.querySelectorAll('.nav-tab').forEach((b,i)=>b.classList.toggle('active',['today','focus','food','money','sleep','calendar','people','goals','car','stats','history'][i]===v));
  if(v==='sleep') initSleep();
  if(v==='calendar') initCalendar();
  if(v==='stats') loadStats();
  if(v==='history') loadHistory();
  if(v==='focus') initFocusView();
  if(v==='money') initMoney();
  if(v==='food') initFood();
  if(v==='people') initPeople();
  if(v==='goals') loadGoals();
  if(v==='car') loadCar();
}

// ─── HISTORY ───────────────────────────────────────
let allHist={}, histFilter='all';
async function loadHistory(){
  try {
    const r=await fetch('/api/full_history');
    allHist=await r.json();
  } catch(e) {
    // fallback to old endpoint
    const r=await fetch('/api/history');
    allHist=await r.json();
  }
  renderHistory();
}

function filterHist(f,btn){
  histFilter=f;
  document.querySelectorAll('.hist-filter-chip').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderHistory();
}

const DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function renderHistory(){
  const list=document.getElementById('histList');
  list.innerHTML='';
  let days=Object.keys(allHist).sort().reverse();
  const today=new Date();
  if(histFilter==='week'){const w=new Date(today);w.setDate(w.getDate()-7);days=days.filter(d=>d>=w.toISOString().slice(0,10));}
  else if(histFilter==='month'){const m=new Date(today);m.setDate(m.getDate()-30);days=days.filter(d=>d>=m.toISOString().slice(0,10));}
  else if(histFilter==='good') days=days.filter(d=>allHist[d].score>=75);
  else if(histFilter==='bad') days=days.filter(d=>allHist[d].score<40);
  else if(histFilter==='gym') days=days.filter(d=>allHist[d].gym==='full'||allHist[d].gym==='half');
  else if(histFilter==='social') days=days.filter(d=>allHist[d].socialized==='irl'||allHist[d].socialized==='chat');
  else if(histFilter==='spent') days=days.filter(d=>allHist[d].budget!=null);
  else if(histFilter==='events') days=days.filter(d=>allHist[d].events&&allHist[d].events.length>0);
  else if(histFilter==='sleep') days=days.filter(d=>allHist[d].sleep&&allHist[d].sleep.bedtime);
  if(!days.length){list.innerHTML='<div style="padding:40px;text-align:center;color:var(--text3);font-family:Fraunces,serif;font-size:16px">No entries for this filter ✦</div>';return;}
  days.forEach(d=>{
    const e=allHist[d]; const sc=e.score||0;
    const dt=new Date(d+'T12:00:00');
    const color=sc>=75?'var(--sage)':sc>=50?'var(--amber)':sc>=25?'var(--coral2)':'var(--coral)';
    const bg=sc>=75?'var(--sageL)':sc>=50?'var(--amberL)':sc>=25?'var(--coralL)':'var(--coralL)';
    const pills=buildHistPills(e);
    const el=document.createElement('div');
    el.className='hist-entry';
    el.innerHTML=`
      <div class="hist-entry-header" onclick="toggleHist(this)">
        <div class="hist-date-col">
          <div class="hist-date">${MONTHS[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}</div>
          <div class="hist-dow">${DOW[dt.getDay()]} · ${jalaliLabel(d)}</div>
        </div>
        <div class="hist-score-badge" style="background:${bg}">
          <div class="hist-score-num" style="color:${color}">${sc}</div>
          <div class="hist-score-pct" style="color:${color}">score</div>
        </div>
        <div class="hist-pills-row">${pills}</div>
        <div class="hist-expand">▾</div>
      </div>
      <div class="hist-body">
        ${buildDetailGrid(e)}
      </div>`;
    list.appendChild(el);
  });
}

function toggleHist(header){
  const body=header.nextElementSibling;
  const arrow=header.querySelector('.hist-expand');
  body.classList.toggle('open');
  arrow.classList.toggle('open');
}

function buildHistPills(e){
  const pills=[];
  const gym=e.gym||'none';
  if(gym==='full') pills.push('<span class="hist-pill" style="background:var(--sageL);color:var(--sage)">🏋️ Full gym</span>');
  else if(gym==='half') pills.push('<span class="hist-pill" style="background:var(--amberL);color:var(--amber)">⚡ Half gym</span>');
  else if(gym==='skipped') pills.push('<span class="hist-pill" style="background:var(--coralL);color:var(--coral)">❌ Skipped</span>');
  const home=e.home_exercise||'none';
  if(home==='full') pills.push('<span class="hist-pill" style="background:var(--skyL);color:var(--sky)">🏠 Home full</span>');
  else if(home==='half') pills.push('<span class="hist-pill" style="background:var(--skyL);color:var(--sky)">🌿 Home light</span>');
  else pills.push('<span class="hist-pill" style="background:var(--cream2);color:var(--text3)">😴 Rest</span>');
  const food=e.food||'';
  if(food==='homemade') pills.push('<span class="hist-pill" style="background:var(--sageL);color:var(--sage)">🥗 Homemade</span>');
  else if(food==='healthy_out') pills.push('<span class="hist-pill" style="background:var(--skyL);color:var(--sky)">🥙 Healthy</span>');
  else if(food==='junk') pills.push('<span class="hist-pill" style="background:var(--coralL);color:var(--coral)">🍔 Junk</span>');
  const soc=e.socialized||'none';
  if(soc==='irl') pills.push('<span class="hist-pill" style="background:var(--sageL);color:var(--sage)">🎉 IRL</span>');
  else if(soc==='chat') pills.push('<span class="hist-pill" style="background:var(--amberL);color:var(--amber)">💬 Chat</span>');
  if(e.pills) pills.push('<span class="hist-pill" style="background:var(--skyL);color:var(--sky)">💊 Pills ✓</span>');
  if(e.soda) pills.push('<span class="hist-pill" style="background:var(--coralL);color:var(--coral)">🥤 Soda</span>');
  const sk=e.skincare||'none';
  if(sk==='full') pills.push('<span class="hist-pill" style="background:var(--roseL);color:var(--rose)">✨ Skincare</span>');
  if(e.meditated) pills.push('<span class="hist-pill" style="background:var(--plumL);color:var(--plum)">🧘 Meditated</span>');
  const teeth=e.teeth_brushed||0;
  if(teeth>=2) pills.push('<span class="hist-pill" style="background:var(--skyL);color:var(--sky)">🪥 Teeth ✓</span>');
  if(e.sleep_score!=null && e.sleep_score>0) pills.push('<span class="hist-pill" style="background:var(--sageL);color:var(--sage)">😴 Sleep '+e.sleep_score+'/6</span>');
  if(e.sleep&&e.sleep.bedtime) pills.push('<span class="hist-pill" style="background:var(--plumL);color:var(--plum)">🌙 '+e.sleep.bedtime+' → '+e.sleep.waketime+'</span>');
  if(e.budget!=null) pills.push('<span class="hist-pill" style="background:var(--amberL);color:var(--amber)">💸 '+e.budget.total.toLocaleString()+' T</span>');
  if(e.events&&e.events.length) pills.push('<span class="hist-pill" style="background:var(--skyL);color:var(--sky)">📅 '+e.events.length+' event'+(e.events.length>1?'s':'')+'</span>');
  return pills.join('');
}

function buildDetailGrid(e){
  const items=[
    {label:'Calories',val:(e.calories||0)+' kcal',bar:Math.min(100,(e.calories||0)/4000*100),color:'var(--amber)'},
    {label:'Protein',val:(e.protein||0)+'g',bar:Math.min(100,(e.protein||0)/220*100),color:'var(--sage2)'},
    {label:'Weight',val:e.weight?e.weight+' kg':'Not logged',bar:e.weight?Math.min(100,(e.weight-70)/50*100):0,color:'var(--sky)'},
    {label:'Mood',val:(e.mood||'—')+'/10',bar:e.mood?(e.mood/10*100):0,color:'var(--sage)'},
    {label:'Pain',val:(e.pain||'—')+'/10',bar:e.pain?(e.pain/10*100):0,color:'var(--rose)'},
    {label:'Uni Study',val:fmtTime(e.uni_study_mins),bar:Math.min(100,(e.uni_study_mins||0)/240*100),color:'var(--plum)'},
    {label:'Car Courses',val:fmtTime(e.car_courses_mins),bar:Math.min(100,(e.car_courses_mins||0)/120*100),color:'var(--amber)'},
    {label:'Self Dev',val:fmtTime(e.selfdev_mins),bar:Math.min(100,(e.selfdev_mins||0)/120*100),color:'var(--sky)'},
    {label:'Skincare',val:({full:'Full routine ✓',half:'Half done',none:'Skipped'}[e.skincare||'none']),bar:({full:100,half:50,none:0}[e.skincare||'none']),color:'var(--rose)'},
    {label:'Gym',val:({full:'Full session 🔥',half:'Half session ⚡',none:'Rest day 😴',skipped:'Skipped ❌'}[e.gym||'none']),bar:({full:100,half:50,none:0,skipped:0}[e.gym||'none']),color:'var(--sage)'},
    {label:'Home Exercise',val:({full:'Full session 💪',half:'Light / Short 🌿',none:'None 😐'}[e.home_exercise||'none']),bar:({full:100,half:50,none:0}[e.home_exercise||'none']),color:'var(--sky)'},
    {label:'Food',val:({homemade:'Homemade 🥗',healthy_out:'Healthy out 🥙',junk:'Junk food 🍔','':'Not logged'}[e.food||'']),bar:({homemade:100,healthy_out:70,junk:20,'':0}[e.food||'']),color:'var(--amber)'},
    {label:'Social',val:({irl:'Met IRL 🎉',chat:'Chatted 💬',none:'Solo day 🏠'}[e.socialized||'none']),bar:({irl:100,chat:50,none:0}[e.socialized||'none']),color:'var(--sage)'},
    {label:'Pills',val:e.pills?'Taken ✓':'Missed',bar:e.pills?100:0,color:'var(--sky)'},
    {label:'Soda',val:e.soda?'Had soda 🥤':'No soda 💧',bar:e.soda?100:0,color:'var(--coral)'},
    {label:'Meditation',val:e.meditated?'Meditated 🧘':'Skipped',bar:e.meditated?100:0,color:'var(--plum)'},
    {label:'Teeth Brushed',val:(e.teeth_brushed||0)+'× today',bar:Math.min(100,(e.teeth_brushed||0)/2*100),color:'var(--sky)'},
    {label:'Sleep Score',val:e.sleep_score!=null?e.sleep_score+'/6':'Not logged',bar:e.sleep_score!=null?Math.round(e.sleep_score/6*100):0,color:'var(--sky)'},
  ];

  // Sleep section
  let sleepSection = '';
  if(e.sleep && e.sleep.bedtime) {
    const sl = e.sleep;
    const bh=parseInt(sl.bedtime.split(':')[0]),bm=parseInt(sl.bedtime.split(':')[1]);
    const wh=parseInt(sl.waketime.split(':')[0]),wm=parseInt(sl.waketime.split(':')[1]);
    let bedMins=bh*60+bm; if(bedMins<12*60) bedMins+=24*60;
    const wakeMins=wh*60+wm;
    let dur=wakeMins+24*60-bedMins; if(dur>24*60) dur-=24*60;
    const dh=Math.floor(dur/60),dm=dur%60;
    sleepSection = `<div class="hist-section-title" style="grid-column:1/-1;margin-top:12px;padding-top:12px;border-top:1px solid var(--warm2);font-size:11px;font-weight:700;color:var(--text3);letter-spacing:.08em;text-transform:uppercase;">😴 Sleep</div>
      <div class="hist-detail-item"><div class="hist-detail-label">Bedtime</div><div class="hist-detail-val">${sl.bedtime}</div><div class="hist-detail-bar"><div class="hist-detail-bar-fill" style="width:60%;background:var(--plum)"></div></div></div>
      <div class="hist-detail-item"><div class="hist-detail-label">Wake time</div><div class="hist-detail-val">${sl.waketime}</div><div class="hist-detail-bar"><div class="hist-detail-bar-fill" style="width:70%;background:var(--amber)"></div></div></div>
      <div class="hist-detail-item"><div class="hist-detail-label">Duration</div><div class="hist-detail-val">${dh}h ${dm}m</div><div class="hist-detail-bar"><div class="hist-detail-bar-fill" style="width:${Math.min(100,dur/480*100)}%;background:var(--sky)"></div></div></div>
      <div class="hist-detail-item"><div class="hist-detail-label">Quality</div><div class="hist-detail-val">${sl.quality||'—'}/10</div><div class="hist-detail-bar"><div class="hist-detail-bar-fill" style="width:${(sl.quality||0)*10}%;background:var(--sage)"></div></div></div>
      ${sl.notes?`<div class="hist-detail-item" style="grid-column:1/-1"><div class="hist-detail-label">Notes</div><div class="hist-detail-val" style="font-size:12px;white-space:normal">${sl.notes}</div><div class="hist-detail-bar"></div></div>`:''}`;
  }

  // Budget section
  let budgetSection = '';
  if(e.budget) {
    const b = e.budget;
    const tagList = (b.tags||[]).map(t=>`<span style="display:inline-block;background:${t.color||'#ccc'}22;color:${t.color||'#888'};border-radius:20px;padding:2px 8px;font-size:11px;margin:2px;">${t.icon||'🏷️'} ${t.name}: ${t.amount.toLocaleString()}</span>`).join('');
    budgetSection = `<div class="hist-section-title" style="grid-column:1/-1;margin-top:12px;padding-top:12px;border-top:1px solid var(--warm2);font-size:11px;font-weight:700;color:var(--text3);letter-spacing:.08em;text-transform:uppercase;">💸 Money</div>
      <div class="hist-detail-item" style="grid-column:1/-1"><div class="hist-detail-label">Spent Today</div><div class="hist-detail-val">${b.total.toLocaleString()} T</div><div class="hist-detail-bar"><div class="hist-detail-bar-fill" style="width:60%;background:var(--amber)"></div></div></div>
      ${tagList?`<div style="grid-column:1/-1;padding:4px 0 4px 0;display:flex;flex-wrap:wrap;gap:4px">${tagList}</div>`:''}`;
  }

  // Events section
  let eventsSection = '';
  if(e.events && e.events.length) {
    const evHtml = e.events.map(ev=>{
      const done = ev.done;
      const pColor = ev.priority<=1?'var(--coral)':ev.priority===2?'var(--amber)':'var(--text3)';
      return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--cream2);">
        <span style="font-size:14px">${done?'✅':'⬜'}</span>
        <span style="flex:1;font-size:13px;color:var(--text1);${done?'text-decoration:line-through;opacity:.5':''}">${ev.title}</span>
        <span style="font-size:10px;color:${pColor};font-weight:700">P${ev.priority||3}</span>
      </div>`;
    }).join('');
    eventsSection = `<div class="hist-section-title" style="grid-column:1/-1;margin-top:12px;padding-top:12px;border-top:1px solid var(--warm2);font-size:11px;font-weight:700;color:var(--text3);letter-spacing:.08em;text-transform:uppercase;">📅 Events</div>
      <div style="grid-column:1/-1">${evHtml}</div>`;
  }

  return `<div class="hist-detail-grid-inner">${items.map(i=>`
    <div class="hist-detail-item">
      <div class="hist-detail-label">${i.label}</div>
      <div class="hist-detail-val">${i.val}</div>
      <div class="hist-detail-bar"><div class="hist-detail-bar-fill" style="width:${i.bar}%;background:${i.color}"></div></div>
    </div>`).join('')}</div>${sleepSection}${budgetSection}${eventsSection}`;
}

function fmtTime(mins){
  if(!mins) return '0 min';
  if(mins<60) return mins+' min';
  const h=Math.floor(mins/60),m=mins%60;
  return h+'h'+(m>0?' '+m+'m':'');
}

// ─── STATS / CHARTS ────────────────────────────────
let chartInstances={};

async function loadStats(){
  let r;
  try { r=await fetch('/api/full_stats'); } catch(e) { r=await fetch('/api/stats'); }
  statsData=await r.json();
  renderInsights();
  renderMetricPicker();
  if(userCharts.length===0){
    // Try to restore saved custom charts
    const saved=await loadUserCharts();
    if(saved&&saved.length){
      document.getElementById('chartsGrid').innerHTML='';
      userCharts=[];chartInstances={};
      saved.forEach(c=>{const id='chart_'+Math.random().toString(36).slice(2);userCharts.push({...c,id});renderChart({...c,id});});
    } else {
      addPresetCharts();
    }
  } else rebuildAllCharts();
}

function renderInsights(){
  if(!statsData.length) return;
  const avg=arr=>arr.filter(v=>v!=null&&v>0).reduce((a,b)=>a+b,0)/(arr.filter(v=>v!=null&&v>0).length||1);
  const scores=statsData.map(d=>d.score);
  const avgScore=Math.round(avg(scores));
  const best=Math.max(...scores);
  const gymFull=statsData.filter(d=>d.gym==='full').length;
  const gymPct=Math.round(gymFull/statsData.length*100);
  const avgWeight=Math.round(avg(statsData.map(d=>d.weight))*10)/10;
  const sodaDays=statsData.filter(d=>d.soda).length;
  const pilDays=statsData.filter(d=>d.pills).length;
  const socialDays=statsData.filter(d=>d.socialized==='irl'||d.socialized==='chat').length;
  const avgMood=Math.round(avg(statsData.map(d=>d.mood))*10)/10;
  const fvFull=statsData.filter(d=>d.fruit_veg).length;
  const fvPct=Math.round(fvFull/statsData.length*100);
  const ins=[
    {label:'Avg Score',val:avgScore+'%',sub:'Last '+statsData.length+' days',trend:avgScore>=60?'↑ On track':'↓ Room to grow',tcolor:avgScore>=60?'var(--sage)':'var(--coral)'},
    {label:'Best Day',val:best+'%',sub:'Personal record',trend:'🏆 Keep chasing it',tcolor:'var(--amber)'},
    {label:'Gym Rate',val:gymPct+'%',sub:gymFull+' full sessions',trend:gymPct>=50?'🔥 Consistent':'Keep showing up',tcolor:gymPct>=50?'var(--sage)':'var(--text3)'},
    {label:'Avg Weight',val:avgWeight||'—',sub:'kg, trend tracked',trend:avgWeight>0?'📉 vs 88kg start':'No data yet',tcolor:'var(--sky)'},
    {label:'Avg Mood',val:avgMood||'—',sub:'out of 10',trend:avgMood>=6?'😄 Feeling good':'Work on wellbeing',tcolor:avgMood>=6?'var(--sage)':'var(--amber)'},
    {label:'Social Days',val:socialDays,sub:'out of '+statsData.length,trend:socialDays/statsData.length>=.5?'🤝 Social butterfly':'Get out more!',tcolor:socialDays/statsData.length>=.5?'var(--sage)':'var(--coral)'},
    {label:'Soda-Free',val:(statsData.length-sodaDays),sub:'days without soda',trend:'💧 Keep it up',tcolor:'var(--sage)'},
    {label:'Pills on Time',val:pilDays,sub:'out of '+statsData.length+' days',trend:pilDays/statsData.length>=.8?'✓ Consistent':'Don\'t miss doses',tcolor:pilDays/statsData.length>=.8?'var(--sage)':'var(--coral)'},
    {label:'Fruits/Veggies',val:fvPct+'%',sub:fvFull+' plenty days',trend:fvPct>=50?'🍎 Eating well':'Eat more produce',tcolor:fvPct>=50?'var(--sage)':'var(--coral)'},
  ];
  document.getElementById('insightsRow').innerHTML=ins.map(i=>`
    <div class="insight-card">
      <div class="insight-label">${i.label}</div>
      <div class="insight-val">${i.val}</div>
      <div class="insight-sub">${i.sub}</div>
      <div class="insight-trend" style="color:${i.tcolor}">${i.trend}</div>
    </div>`).join('');
}

// Chart builder
const METRICS={
  // ── Core score ──
  score:{label:'Score %',fn:d=>d.score,color:'#e85d3a',group:'General'},
  // ── Body & mood ──
  mood:{label:'Mood',fn:d=>d.mood,color:'#3a7a5a',group:'Body & Mind'},
  pain:{label:'Pain',fn:d=>d.pain,color:'#c44a6a',group:'Body & Mind'},
  weight:{label:'Weight (kg)',fn:d=>d.weight,color:'#7a3a6a',group:'Body & Mind'},
  // ── Food & nutrition ──
  calories:{label:'Calories',fn:d=>d.calories,color:'#d4821a',group:'Food'},
  protein:{label:'Protein (g)',fn:d=>d.protein,color:'#2a6a9a',group:'Food'},
  // ── Study ──
  uni_study_mins:{label:'Uni Study (min)',fn:d=>d.uni_study_mins,color:'#7a3a6a',group:'Study'},
  car_courses_mins:{label:'Car Courses (min)',fn:d=>d.car_courses_mins,color:'#d4821a',group:'Study'},
  selfdev_mins:{label:'Self Dev (min)',fn:d=>d.selfdev_mins,color:'#2a6a9a',group:'Study'},
  // ── Habits ──
  pills:{label:'Pills',fn:d=>d.pills,color:'#2a6a9a',group:'Habits'},
  soda:{label:'Soda',fn:d=>d.soda,color:'#e85d3a',group:'Habits'},
  meditated:{label:'Meditated',fn:d=>d.meditated?1:0,color:'#5a9a7a',group:'Habits'},
  teeth_brushed:{label:'Teeth Brushed',fn:d=>d.teeth_brushed||0,color:'#2a6a9a',group:'Habits'},
  skincare:{label:'Skincare',fn:d=>({full:100,half:50,none:0}[d.skincare]??null),color:'#c44a6a',group:'Habits'},
  fruit_veg:{label:'Fruits/Veggies',fn:d=>d.fruit_veg?100:0,color:'#3a7a5a',group:'Food'},
  home_exercise:{label:'Home Exercise',fn:d=>({full:100,some:50,none:0}[d.home_exercise]??null),color:'#5a9a7a',group:'Habits'},
  // ── Sleep ──
  sleep_score:{label:'Sleep Score',fn:d=>d.sleep_score!=null?d.sleep_score:null,color:'#7a3a6a',group:'Sleep'},
  sleep_duration:{label:'Sleep Duration (min)',fn:d=>d.sleep_duration_mins||null,color:'#5a5a9a',group:'Sleep'},
  sleep_quality:{label:'Sleep Quality',fn:d=>d.sleep_quality||null,color:'#9a5a7a',group:'Sleep'},
  // ── Money ──
  money_spent:{label:'Money Spent (T)',fn:d=>d.money_spent!=null?d.money_spent:null,color:'#a07830',group:'Money'},
};
const COLORS=['#e85d3a','#3a7a5a','#d4821a','#2a6a9a','#7a3a6a','#c44a6a','#5a9a7a','#f07a5c'];

function renderMetricPicker(){
  const grid = document.getElementById('bYGrid');
  if(!grid) return;
  // Group metrics by .group
  const groups = {};
  Object.entries(METRICS).forEach(([k,m])=>{
    const g = m.group||'Other';
    if(!groups[g]) groups[g]=[];
    groups[g].push({key:k,...m});
  });
  grid.innerHTML = Object.entries(groups).map(([g,items])=>`
    <div class="b-y-group">
      <div class="b-y-group-label">${g}</div>
      ${items.map(m=>`
        <label class="b-y-check-label">
          <input type="checkbox" class="b-y-check" value="${m.key}">
          <span class="b-y-swatch" style="background:${m.color}"></span>
          ${m.label}
        </label>`).join('')}
    </div>`).join('');
  initBuilderPreview();
}

let builderPreviewChart=null;
let builderPreviewInitDone=false, builderYGridListenerBound=false;
function initBuilderPreview(){
  const typeEl=document.getElementById('b-type');
  const xEl=document.getElementById('b-x');
  const titleEl=document.getElementById('b-title');
  if(!typeEl||!xEl) return;
  if(!builderPreviewInitDone){
    typeEl.addEventListener('change',updateBuilderPreview);
    xEl.addEventListener('change',updateBuilderPreview);
    if(titleEl) titleEl.addEventListener('input',updateBuilderPreview);
    builderPreviewInitDone=true;
  }
  const yGrid=document.getElementById('bYGrid');
  if(yGrid && !builderYGridListenerBound){
    yGrid.addEventListener('change',e=>{
      if(e.target.classList.contains('b-y-check')) updateBuilderPreview();
    });
    builderYGridListenerBound=true;
  }
  updateBuilderPreview();
}

function updateBuilderPreview(){
  const wrap=document.getElementById('builderPreviewWrap');
  const canvas=document.getElementById('builderPreviewCanvas');
  if(!wrap||!canvas) return;
  const type=document.getElementById('b-type').value;
  const xField=document.getElementById('b-x').value;
  const yOpts=Array.from(document.querySelectorAll('.b-y-check:checked')).map(cb=>cb.value);
  const title=document.getElementById('b-title').value||(yOpts.length?yOpts.map(y=>METRICS[y]?.label||y).join(' + '):'Pick a metric to preview');

  if(builderPreviewChart){ builderPreviewChart.destroy(); builderPreviewChart=null; }

  if(!yOpts.length || !statsData.length){
    wrap.innerHTML=`<canvas id="builderPreviewCanvas"></canvas>
      <div class="builder-preview-empty">${!statsData.length?'No data logged yet':'Pick at least one metric to preview'}</div>`;
    return;
  }
  wrap.innerHTML='<canvas id="builderPreviewCanvas"></canvas>';
  builderPreviewChart=renderChart({id:'__builderPreview',type,xField,yFields:yOpts,title},true,true);
}

function addChart(){
  const type=document.getElementById('b-type').value;
  const xField=document.getElementById('b-x').value;
  const yOpts=Array.from(document.querySelectorAll('.b-y-check:checked')).map(cb=>cb.value);
  const title=document.getElementById('b-title').value||yOpts.map(y=>METRICS[y]?.label||y).join(' + ');
  if(!yOpts.length){showToast('Pick at least one metric','error');return;}
  const id='chart_'+Date.now();
  userCharts.push({id,type,xField,yFields:yOpts,title});
  renderChart({id,type,xField,yFields:yOpts,title});
  document.getElementById('b-title').value='';
  // uncheck all
  document.querySelectorAll('.b-y-check').forEach(cb=>cb.checked=false);
  saveUserCharts();
}

async function saveUserCharts(){
  // Save only custom (non-preset) charts — or all if user has customised
  try {
    await fetch('/api/sticky',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({notes:stickyNotes, userCharts:userCharts.map(c=>({type:c.type,xField:c.xField,yFields:c.yFields,title:c.title}))})});
  } catch(e){}
}

async function loadUserCharts(){
  try {
    const r=await fetch('/api/sticky');
    const d=await r.json();
    return d.userCharts||null;
  } catch(e){ return null; }
}

function addPresetCharts(){
  document.getElementById('chartsGrid').innerHTML='';
  userCharts=[];
  chartInstances={};
  const presets=[
    {type:'line',xField:'date',yFields:['score'],title:'Daily Score Trend'},
    {type:'line',xField:'date',yFields:['mood','pain'],title:'Mood vs Pain Over Time'},
    {type:'line',xField:'date',yFields:['calories','protein'],title:'Calories & Protein'},
    {type:'line',xField:'date',yFields:['weight'],title:'Weight Trend'},
    {type:'bar',xField:'date',yFields:['uni_study_mins','car_courses_mins','selfdev_mins'],title:'Study Time Breakdown'},
    {type:'scatter',xField:'date',yFields:['mood','score'],title:'Mood vs Score (Correlation)'},
    {type:'doughnut',xField:'gym',yFields:['score'],title:'Gym Attendance Split'},
    {type:'doughnut',xField:'food',yFields:['score'],title:'Food Choices Split'},
    {type:'doughnut',xField:'socialized',yFields:['score'],title:'Social Activity Split'},
    {type:'bar',xField:'date',yFields:['soda','pills'],title:'Soda & Pills (daily)'},
  ];
  presets.forEach(p=>{const id='chart_'+Math.random().toString(36).slice(2);userCharts.push({...p,id});renderChart({...p,id});});
  saveUserCharts();
}

function rebuildAllCharts(){
  userCharts.forEach(cfg=>renderChart(cfg,true));
}

function renderChart(cfg,skipGrid=false,isPreview=false){
  try{
    return renderChartInner(cfg,skipGrid,isPreview);
  }catch(e){
    console.error('Chart render failed for',cfg,e);
  }
}

function renderChartInner(cfg,skipGrid=false,isPreview=false){
  let ctx;
  if(isPreview){
    ctx=document.getElementById('builderPreviewCanvas').getContext('2d');
  } else {
    const grid=document.getElementById('chartsGrid');
    // remove empty state
    const emptyEl=grid.querySelector('.chart-empty');
    if(emptyEl) emptyEl.remove();

    const wrap=document.createElement('div');
    wrap.className='chart-card'+(cfg.yFields.length>2||cfg.type==='doughnut'?'':' ');
    wrap.id='wrap_'+cfg.id;
    wrap.innerHTML=`
      <div class="chart-card-head">
        <div><div class="chart-card-title">${cfg.title}</div><div class="chart-card-sub">${cfg.yFields.map(y=>METRICS[y]?.label||y).join(' · ')}</div></div>
        <button class="chart-del" onclick="delChart('${cfg.id}')">✕</button>
      </div>
      <div class="chart-wrap${cfg.type==='doughnut'?'':''}" id="cw_${cfg.id}">
        <canvas id="cv_${cfg.id}"></canvas>
      </div>`;
    if(!skipGrid) grid.appendChild(wrap);

    // destroy old
    if(chartInstances[cfg.id]) chartInstances[cfg.id].destroy();
    ctx=document.getElementById('cv_'+cfg.id).getContext('2d');
  }

  const setInstance=(chart)=>{ if(isPreview) return chart; chartInstances[cfg.id]=chart; return chart; };
  const gridColor='rgba(26,21,16,0.05)'; const tickColor='#a8967c';
  const baseOpts={responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#6b5c48',font:{size:11},boxWidth:10}}},scales:{x:{grid:{color:gridColor},ticks:{color:tickColor,maxTicksLimit:12}},y:{grid:{color:gridColor},ticks:{color:tickColor}}}};

  if(cfg.type==='doughnut'){
    // aggregate by xField
    const groups={};
    statsData.forEach(d=>{
      const key=d[cfg.xField]||'unknown';
      if(!groups[key]) groups[key]=0;
      groups[key]++;
    });
    const labels=Object.keys(groups);
    const data=labels.map(k=>groups[k]);
    const bgColors=labels.map((_,i)=>COLORS[i%COLORS.length]);
    return setInstance(new Chart(ctx,{type:'doughnut',data:{labels,datasets:[{data,backgroundColor:bgColors,borderWidth:0,hoverOffset:8}]},
      options:{responsive:true,maintainAspectRatio:false,cutout:'65%',plugins:{legend:{position:'bottom',labels:{color:'#6b5c48',font:{size:12},padding:14,boxWidth:10}}}}}));
  }

  if(cfg.type==='scatter' && cfg.yFields.length>=2){
    const xM=METRICS[cfg.yFields[0]]; const yM=METRICS[cfg.yFields[1]];
    const points=statsData.filter(d=>xM.fn(d)!=null&&yM.fn(d)!=null).map(d=>({x:xM.fn(d),y:yM.fn(d)}));
    return setInstance(new Chart(ctx,{type:'scatter',data:{datasets:[{label:xM.label+' vs '+yM.label,data:points,backgroundColor:'rgba(232,93,58,.6)',borderColor:'var(--coral)',pointRadius:5,pointHoverRadius:8}]},
      options:{...baseOpts,scales:{x:{...baseOpts.scales.x,title:{display:true,text:xM.label,color:tickColor}},y:{...baseOpts.scales.y,title:{display:true,text:yM.label,color:tickColor}}}}}));
  }

  if(cfg.xField==='date'){
    const jMonthsShort=['Far','Ord','Kho','Tir','Mor','Sha','Meh','Aba','Aza','Dey','Bah','Esf'];
    const labels=statsData.map(d=>{
      const j=gregToJalali(d.date);
      return j.d+' '+jMonthsShort[j.m-1];
    });
    const datasets=cfg.yFields.map((y,i)=>({
      label:METRICS[y]?.label||y, data:statsData.map(d=>METRICS[y]?.fn(d)),
      borderColor:COLORS[i%COLORS.length],
      backgroundColor:cfg.type==='bar'?COLORS[i%COLORS.length]+'cc':'transparent',
      fill:false,tension:0.3,borderWidth:2,pointRadius:3,spanGaps:true,
    }));
    return setInstance(new Chart(ctx,{type:cfg.type,data:{labels,datasets},options:baseOpts}));
  }

  // group by categorical field
  const groups={};
  statsData.forEach(d=>{
    const key=d[cfg.xField]||'unknown';
    if(!groups[key]) groups[key]={count:0,sums:{}};
    groups[key].count++;
    cfg.yFields.forEach(y=>{const v=METRICS[y]?.fn(d);if(v!=null){groups[key].sums[y]=(groups[key].sums[y]||0)+v;}});
  });
  const labels=Object.keys(groups);
  const chartType=(cfg.type==='line'||cfg.type==='bar')?cfg.type:'bar';
  const datasets=cfg.yFields.map((y,i)=>({
    label:METRICS[y]?.label||y,
    data:labels.map(k=>groups[k].count>0?Math.round(groups[k].sums[y]/groups[k].count*10)/10:0),
    backgroundColor:COLORS[i%COLORS.length]+'cc',borderColor:COLORS[i%COLORS.length],
    borderWidth:chartType==='line'?2:0,fill:false,tension:0.3,
  }));
  return setInstance(new Chart(ctx,{type:chartType,data:{labels,datasets},options:{...baseOpts,plugins:{legend:{labels:{color:'#6b5c48',font:{size:11},boxWidth:10}}}}}));
}

function delChart(id){
  if(chartInstances[id]) chartInstances[id].destroy();
  delete chartInstances[id];
  const w=document.getElementById('wrap_'+id);
  if(w) w.remove();
  userCharts=userCharts.filter(c=>c.id!==id);
  if(!userCharts.length) document.getElementById('chartsGrid').innerHTML='<div class="chart-empty" style="grid-column:1/-1;background:#fff;border-radius:var(--r);border:1.5px dashed var(--warm);font-family:Fraunces,serif;font-size:15px;">Add a chart above ✦</div>';
  saveUserCharts();
}

// ══════════════════════════════════════════════════