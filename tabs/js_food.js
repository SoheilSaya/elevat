// ══════════════════════════════════════════════════

// ══════════════════════════════════════════════════
// ══════════════════════════════════════════════════
// ─── FOOD LOG MODULE ──────────────────────────────
// ══════════════════════════════════════════════════

const MEALS = [
  { id:'breakfast', label:'Breakfast', icon:'🌅' },
  { id:'lunch',     label:'Lunch',     icon:'☀️' },
  { id:'dinner',    label:'Dinner',    icon:'🌙' },
  { id:'snacks',    label:'Snacks',    icon:'🍎' },
];
const UNITS = ['g','kg','ml','L','cup','tbsp','tsp','slice','piece','bowl','plate','portion','handful','count','custom'];

let F = {
  date: null, entry: null, ingredients: [], addingToMeal: null,
  jalaliToday: null, foodCharts: {}, activeTab: 'log'
};

// ── Jalali helpers ────────────────────────────────
async function getJalaliToday() {
  if (F.jalaliToday) return F.jalaliToday;
  const r = await fetch('/api/jalali_today');
  F.jalaliToday = await r.json();
  return F.jalaliToday;
}

function gregorianToJalaliStr(gStr) {
  // Quick client-side Gregorian->Jalali using known offset
  // We fetch from server when needed; for display we use the server's jalali_today as anchor
  if (!F.jalaliToday) return gStr;
  const today = new Date(F.jalaliToday.gregorian + 'T12:00:00');
  const target = new Date(gStr + 'T12:00:00');
  const diffDays = Math.round((target - today) / 86400000);
  const jy = F.jalaliToday.year, jm = F.jalaliToday.month, jd = F.jalaliToday.day;
  // Simple offset from today
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

// ── Render main ───────────────────────────────────
function renderFoodView() {
  const app = document.getElementById('food-app');
  const dl = formatFoodDate(F.date);
  const totalCal = F.entry.calories || 0;
  const totalProt = F.entry.protein || 0;
  const totalItems = (F.entry.meals||[]).reduce((s,m) => s+(m.items||[]).length, 0);

  app.innerHTML = `
  <!-- Date bar -->
  <div class="food-date-bar">
    <button class="food-date-btn" onclick="changeFoodDate(-1)">‹</button>
    <div style="flex:1;text-align:center">
      <div class="food-date-label">${dl.main}</div>
      <div class="food-date-sub">${dl.sub} · ${totalItems} item${totalItems!==1?'s':''} logged</div>
    </div>
    <button class="food-date-btn" onclick="changeFoodDate(1)">›</button>
  </div>

  <!-- Tab bar -->
  <div style="display:flex;gap:6px;background:var(--cream2);border-radius:50px;padding:5px;border:1.5px solid var(--warm);margin-bottom:22px;width:fit-content;">
    <button class="food-tab-btn nav-tab ${F.activeTab==='log'?'active':''}" data-tab="log" onclick="foodTab('log')" style="border-radius:50px;font-size:13px;padding:8px 20px;">📋 Food Log</button>
    <button class="food-tab-btn nav-tab ${F.activeTab==='stats'?'active':''}" data-tab="stats" onclick="foodTab('stats')" style="border-radius:50px;font-size:13px;padding:8px 20px;">📊 Stats & History</button>
  </div>

  <div id="food-log-panel" style="display:${F.activeTab==='log'?'block':'none'}">
    <div class="food-grid">
      <div>
        <!-- Macros -->
        <div class="food-macros-card">
          <div class="mcard-title" style="margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
            Nutrition Summary
            <span class="macro-sync-badge">↔ syncs with Today tab</span>
          </div>
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
        <div class="claude-prompt-card">
          <div class="claude-prompt-title">🤖 Claude Calorie Estimator</div>
          <div class="claude-prompt-sub">Copy this prompt into Claude to get calorie estimates, then enter the numbers above.</div>
          <div class="claude-prompt-box" id="claudePromptBox">${buildClaudePrompt()}</div>
          <button class="claude-copy-btn" onclick="copyClaudePrompt()">📋 Copy Prompt to Clipboard</button>
        </div>

        <!-- Ingredient library -->
        <div class="mcard">
          <div class="mcard-title">Ingredient Library <span>${F.ingredients.length} saved</span></div>
          <div class="ingr-grid" id="ingrGrid">${renderIngrGrid()}</div>
          <div style="border-top:1.5px solid var(--cream2);padding-top:14px;display:flex;flex-direction:column;gap:8px;">
            <div style="display:grid;grid-template-columns:1fr 56px;gap:8px;">
              <input type="text" class="m-input" id="newIngrName" placeholder="Name (e.g. Chicken breast)" style="width:100%;"/>
              <input type="text" class="m-input" id="newIngrIcon" placeholder="🍗" style="text-align:center;font-size:16px;width:100%;"/>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 80px;gap:8px;">
              <select class="builder-select" id="newIngrUnit" onchange="toggleCustomUnit(this)">${UNITS.map(u=>'<option value="'+u+'">'+u+'</option>').join('')}</select>
              <select class="builder-select" id="newIngrCategory">
                <option value="protein">Protein</option><option value="carb">Carbs</option>
                <option value="fat">Fat</option><option value="veg">Vegetable</option>
                <option value="fruit">Fruit</option><option value="dairy">Dairy</option>
                <option value="drink">Drink</option><option value="other">Other</option>
              </select>
              <button class="m-btn sage" onclick="addIngredient()" style="white-space:nowrap;">+ Add</button>
            </div>
            <input type="text" class="m-input" id="newIngrCustomUnit" placeholder='Describe unit e.g. "10 inch pizza", "پرس چلوکباب"' style="display:none;width:100%;"/>
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

// ── Meal blocks ───────────────────────────────────
function renderMealBlock(mealDef) {
  const mealData = (F.entry.meals||[]).find(m => m.meal_id === mealDef.id) || { meal_id: mealDef.id, items: [] };
  const items = mealData.items || [];
  return `
  <div class="meal-block">
    <div class="meal-header">
      <div class="meal-title">${mealDef.icon} ${mealDef.label}</div>
      <button class="meal-add-btn" onclick="openFoodItemModal('${mealDef.id}')">+ Add item</button>
    </div>
    <div class="meal-items">
      ${items.length ? items.map((item,i) => `
        <div class="meal-item">
          <div class="meal-item-icon">${item.icon||'🍽️'}</div>
          <div class="meal-item-info">
            <div class="meal-item-name">${item.name}</div>
            ${item.note ? '<div class="meal-item-detail">'+item.note+'</div>' : ''}
          </div>
          <div class="meal-item-qty">${item.qty} ${item.unit}</div>
          <button class="meal-item-del" onclick="removeMealItem('${mealDef.id}',${i})">×</button>
        </div>`).join('') : '<div class="meal-empty">Nothing added yet</div>'}
    </div>
  </div>`;
}

function renderIngrGrid() {
  if (!F.ingredients.length) return '<div style="grid-column:1/-1;color:var(--text4);font-size:13px;padding:8px;font-style:italic;">No ingredients yet — add some below</div>';
  return F.ingredients.map(i => `
    <div class="ingr-card" onclick="quickAddIngredient('${i.id}')">
      <div class="ingr-card-icon">${i.icon}</div>
      <div class="ingr-card-info">
        <div class="ingr-card-name">${i.name}</div>
        <div class="ingr-card-unit">${i.unit} · ${i.category}</div>
      </div>
      <button class="ingr-card-del" onclick="event.stopPropagation();deleteIngredient('${i.id}')" title="Delete">×</button>
    </div>`).join('');
}

// ── Stats & History ───────────────────────────────
let foodHistChart = {}, foodStatsLoaded = false;

async function loadFoodStats() {
  const r = await fetch('/api/food/stats');
  const data = await r.json();
  renderFoodStats(data);
}

function renderFoodStats(data) {
  const el = document.getElementById('foodStatsContent');
  if (!el) return;

  const cals = data.daily_calories || [];
  const prots = data.daily_protein || [];
  const ingrs = data.ingredients || [];

  // Summary cards
  const avgCal = cals.length ? Math.round(cals.filter(d=>d.val>0).reduce((s,d)=>s+d.val,0) / (cals.filter(d=>d.val>0).length||1)) : 0;
  const avgProt = prots.length ? Math.round(prots.filter(d=>d.val>0).reduce((s,d)=>s+d.val,0) / (prots.filter(d=>d.val>0).length||1)) : 0;
  const totalIngr = ingrs.reduce((s,i)=>s+i.count,0);
  const topFood = ingrs[0] ? ingrs[0].icon + ' ' + ingrs[0].name : '—';

  Object.values(foodHistChart).forEach(c=>{try{c.destroy();}catch(e){}});
  foodHistChart = {};

  el.innerHTML = `
  <!-- Summary row -->
  <div class="money-indicators" style="margin-bottom:20px;">
    <div class="mindic">
      <div class="mindic-label">Avg Calories</div>
      <div class="mindic-val" style="color:var(--amber)">${avgCal > 0 ? avgCal : '—'}</div>
      <div class="mindic-sub">kcal/day (logged days)</div>
      <div class="mindic-trend" style="color:${avgCal>=2000&&avgCal<=2800?'var(--sage)':'var(--amber)'}">${avgCal>=2000&&avgCal<=2800?'✓ On target':'Adjust intake'}</div>
    </div>
    <div class="mindic">
      <div class="mindic-label">Avg Protein</div>
      <div class="mindic-val" style="color:var(--sage)">${avgProt > 0 ? avgProt+'g' : '—'}</div>
      <div class="mindic-sub">per logged day</div>
      <div class="mindic-trend" style="color:${avgProt>=160?'var(--sage)':avgProt>=120?'var(--amber)':'var(--coral)'}">${avgProt>=160?'✓ Great':'Aim for 176g'}</div>
    </div>
    <div class="mindic">
      <div class="mindic-label">Days Logged</div>
      <div class="mindic-val" style="color:var(--sky)">${data.total_days}</div>
      <div class="mindic-sub">total food entries</div>
      <div class="mindic-trend" style="color:var(--text3)">${totalIngr} total servings</div>
    </div>
    <div class="mindic">
      <div class="mindic-label">Most Eaten</div>
      <div class="mindic-val" style="font-size:18px;">${topFood}</div>
      <div class="mindic-sub">${ingrs[0] ? ingrs[0].count+' times logged' : 'No data yet'}</div>
      <div class="mindic-trend" style="color:var(--text3)">${ingrs[0] ? ingrs[0].total_qty+' '+ingrs[0].unit+' total' : ''}</div>
    </div>
  </div>

  <!-- Charts row -->
  <div class="money-charts" style="margin-bottom:20px;">
    <div class="mchart-card">
      <div class="mchart-title">Daily Calories (last 30 days)</div>
      <div class="mchart-sub">kcal · red dashes = 2400 target</div>
      <div class="mchart-wrap" style="height:200px"><canvas id="fCalChart"></canvas></div>
    </div>
    <div class="mchart-card">
      <div class="mchart-title">Daily Protein (last 30 days)</div>
      <div class="mchart-sub">grams · red dashes = 176g target</div>
      <div class="mchart-wrap" style="height:200px"><canvas id="fProtChart"></canvas></div>
    </div>
    ${ingrs.length ? `
    <div class="mchart-card">
      <div class="mchart-title">Most Eaten Ingredients</div>
      <div class="mchart-sub">By number of servings logged</div>
      <div class="mchart-wrap" style="height:200px"><canvas id="fIngrChart"></canvas></div>
    </div>
    <div class="mchart-card">
      <div class="mchart-title">Category Breakdown</div>
      <div class="mchart-sub">By ingredient category</div>
      <div class="mchart-wrap" style="height:200px"><canvas id="fCatChart"></canvas></div>
    </div>` : ''}
  </div>

  <!-- Ingredient table -->
  ${ingrs.length ? `
  <div class="mcard" style="margin-bottom:20px;">
    <div class="mcard-title">Ingredient Stats <span>${ingrs.length} tracked</span></div>
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
  if (data.full_log && data.full_log.length) el.innerHTML += buildFullHistory(data.full_log);
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
      {label:'Calories',data:calVals,backgroundColor:'rgba(212,130,26,.65)',borderRadius:3},
      {label:'Target',data:calLabels.map(()=>1500),type:'line',borderColor:'var(--coral)',borderDash:[4,3],borderWidth:1.5,pointRadius:0,fill:false}
    ]}, options:{...base,plugins:{legend:{display:true,labels:{color:'#6b5c48',boxWidth:10,font:{size:11}}}}}});

    const protLabels = prots.map(d=>d.jalali||d.date);
    const protVals = prots.map(d=>d.val);
    const c2 = document.getElementById('fProtChart');
    if (c2) foodHistChart.prot = new Chart(c2, { type:'bar', data:{ labels:protLabels, datasets:[
      {label:'Protein',data:protVals,backgroundColor:'rgba(58,122,90,.65)',borderRadius:3},
      {label:'Target',data:protLabels.map(()=>176),type:'line',borderColor:'var(--coral)',borderDash:[4,3],borderWidth:1.5,pointRadius:0,fill:false}
    ]}, options:{...base,plugins:{legend:{display:true,labels:{color:'#6b5c48',boxWidth:10,font:{size:11}}}}}});

    const top10 = ingrs.slice(0,10);
    const c3 = document.getElementById('fIngrChart');
    if (c3 && top10.length) foodHistChart.ingr = new Chart(c3, { type:'bar',
      data:{ labels:top10.map(i=>i.icon+' '+i.name), datasets:[{label:'Servings',data:top10.map(i=>i.count),
        backgroundColor:'rgba(108,99,255,.65)',borderRadius:3}]},
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
      options:{responsive:true,maintainAspectRatio:false,cutout:'60%',
        plugins:{legend:{position:'bottom',labels:{color:'#6b5c48',font:{size:11},padding:8,boxWidth:10}}}} });
  }, 80);
}

// ── Ingredient CRUD ───────────────────────────────
function toggleCustomUnit(sel) {
  const ci = document.getElementById('newIngrCustomUnit');
  if (ci) ci.style.display = sel.value === 'custom' ? 'block' : 'none';
}

async function addIngredient() {
  const name = document.getElementById('newIngrName').value.trim();
  const icon = document.getElementById('newIngrIcon').value.trim() || '🍽️';
  const unitSel = document.getElementById('newIngrUnit').value;
  const customUnitVal = document.getElementById('newIngrCustomUnit')?.value.trim() || '';
  const unit = unitSel === 'custom' ? (customUnitVal || 'عدد') : unitSel;
  const category = document.getElementById('newIngrCategory').value;
  if (!name) { showToast('Enter ingredient name',''); return; }
  const r = await fetch('/api/food/ingredients', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ action:'add', name, icon, unit, category }) });
  const d = await r.json();
  F.ingredients = d.ingredients;
  document.getElementById('newIngrName').value = '';
  document.getElementById('newIngrIcon').value = '';
  const ci = document.getElementById('newIngrCustomUnit');
  if (ci) { ci.value = ''; ci.style.display = 'none'; }
  document.getElementById('newIngrUnit').value = 'g';
  renderFoodView();
  showToast('Ingredient saved ✓','success');
}

async function deleteIngredient(id) {
  const r = await fetch('/api/food/ingredients', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ action:'delete', id }) });
  const d = await r.json();
  F.ingredients = d.ingredients;
  renderFoodView();
}

// ── Add item modal ────────────────────────────────
// Build sorted ingredient options: frequently used for this meal slot first
function buildSortedOptions(mealId) {
  // Count how many times each ingredient appeared in this meal slot across all logged days
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
      // Build a log map from full_log
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
  let mealEntry = F.entry.meals.find(m => m.meal_id === F.addingToMeal);
  if (!mealEntry) { mealEntry = { meal_id: F.addingToMeal, items: [] }; F.entry.meals.push(mealEntry); }
  mealEntry.items.push({ ingredient_id: ingr.id, name: ingr.name, icon: ingr.icon, unit: displayUnit, qty, note });
  closeFoodItemModal();
  await saveFoodEntry();
  renderFoodView();
  showToast('Added ✓','success');
}

async function removeMealItem(mealId, idx) {
  const mealEntry = F.entry.meals.find(m => m.meal_id === mealId);
  if (mealEntry) mealEntry.items.splice(idx, 1);
  await saveFoodEntry();
  renderFoodView();
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
  // Build dual-calendar date string
  const gDate = F.date; // e.g. 2026-06-19
  const dt = new Date(gDate + 'T12:00:00');
  const engMonths = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const engDateStr = dt.getDate() + ' ' + engMonths[dt.getMonth()] + ' ' + dt.getFullYear();
  // gregorianToJalaliStr returns {str:"1405/03/29", label:"Khordad 29", short:"Kho 29"}
  // F.jalaliToday has {year, month, day, month_name, str, gregorian}
  let jalDateStr = '';
  if (gDate === todayISO() && F.jalaliToday) {
    jalDateStr = F.jalaliToday.day + ' ' + F.jalaliToday.month_name + ' ' + F.jalaliToday.year;
  } else {
    const jConv = gregorianToJalaliStr(gDate);
    if (jConv && jConv.str) {
      // str is "1405/03/29" — parse it
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

