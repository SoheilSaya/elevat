// ══════════════════════════════════════════════════════
//  GOALS MODULE  —  js_goals.js
//  Requires: /api/goals  (GET/POST)
//  Data file: goals.json
//  Requires jalali.js to be loaded earlier in the bundle
//  for gregToJalali / jalaliToGreg / renderJalaliPicker.
// ══════════════════════════════════════════════════════

const GOALS = {
  data: [],        // all goals
  filter: 'all',   // current filter
  editId: null,    // null = new, string = editing existing
};

// ── Helpers ───────────────────────────────────────────
function goalsShowToast(msg, type='') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' '+type : '');
  setTimeout(()=>t.className='toast', 2600);
}

function selectGoalChip(groupId, btn) {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.querySelectorAll('.goal-chip-sel').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function getSelectedChipVal(groupId) {
  const group = document.getElementById(groupId);
  if (!group) return null;
  const active = group.querySelector('.goal-chip-sel.active');
  return active ? active.dataset.val : null;
}

// ── API calls ─────────────────────────────────────────
async function loadGoals() {
  try {
    const r = await fetch('/api/goals');
    if (!r.ok) throw new Error('no goals api');
    GOALS.data = await r.json();
    renderGoals();
    renderGoalsHero();
  } catch(e) {
    console.warn('[Goals] API not available yet. Using local state.', e);
    renderGoals();
    renderGoalsHero();
  }
}

async function persistGoals() {
  try {
    await fetch('/api/goals', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(GOALS.data)
    });
  } catch(e) {
    console.warn('[Goals] Could not save goals:', e);
  }
}

// ── Progress calculation ─────────────────────────────
// Returns { pct, auto, moneyNote, timeNote }
function goalsCalcProgress(g) {
  const moneyTotal = parseFloat(g.money_amount) || 0;
  const moneySpent = parseFloat(g.money_spent)  || 0;
  const timeTotal  = parseFloat(g.time_amount)  || 0;
  const timeSpent  = parseFloat(g.time_spent)   || 0;

  let pcts = [];
  let notes = [];

  if (moneyTotal > 0 && moneySpent >= 0) {
    const p = Math.min(100, Math.round((moneySpent / moneyTotal) * 100));
    pcts.push(p);
    notes.push(`${moneySpent.toLocaleString()} / ${moneyTotal.toLocaleString()} ${g.money_unit||'KT'}`);
  }
  if (timeTotal > 0 && timeSpent >= 0) {
    const p = Math.min(100, Math.round((timeSpent / timeTotal) * 100));
    pcts.push(p);
    notes.push(`${timeSpent} / ${timeTotal} hrs`);
  }

  if (pcts.length === 0) {
    // No trackable resource — use manual progress
    return { pct: g.progress || 0, auto: false, notes: [] };
  }

  // Average of all tracked dimensions
  const pct = Math.round(pcts.reduce((a,b)=>a+b,0) / pcts.length);
  return { pct, auto: true, notes };
}

// Called from modal inputs to show live auto-progress preview
function goalsUpdateProgressMode() {
  const moneyTotal = parseFloat(document.getElementById('gMoney')?.value) || 0;
  const moneySpent = parseFloat(document.getElementById('gMoneySpent')?.value) || 0;
  const timeTotal  = parseFloat(document.getElementById('gTime')?.value) || 0;
  const timeSpent  = parseFloat(document.getElementById('gTimeSpent')?.value) || 0;
  const moneyUnit  = document.getElementById('gMoneyUnit')?.value || 'KT';

  // Sync unit label next to spent
  const unitLbl = document.getElementById('gMoneySpentUnit');
  if (unitLbl) unitLbl.textContent = moneyUnit;

  const hasTracking = (moneyTotal > 0) || (timeTotal > 0);
  const autoWrap    = document.getElementById('gAutoProgressWrap');
  const manualWrap  = document.getElementById('gManualProgressWrap');
  if (!autoWrap || !manualWrap) return;

  if (hasTracking) {
    autoWrap.style.display  = 'block';
    manualWrap.style.display= 'none';

    let pcts = [], noteLines = [];
    if (moneyTotal > 0) {
      const p = Math.min(100, Math.round((moneySpent / moneyTotal) * 100));
      pcts.push(p);
      noteLines.push(`💰 ${moneySpent.toLocaleString()} / ${moneyTotal.toLocaleString()} ${moneyUnit} = ${p}%`);
    }
    if (timeTotal > 0) {
      const p = Math.min(100, Math.round((timeSpent / timeTotal) * 100));
      pcts.push(p);
      noteLines.push(`⏱️ ${timeSpent} / ${timeTotal} hrs = ${p}%`);
    }
    const avg = pcts.length ? Math.round(pcts.reduce((a,b)=>a+b,0)/pcts.length) : 0;

    const pctEl  = document.getElementById('gAutoProgressPct');
    const barEl  = document.getElementById('gAutoProgressBar');
    const noteEl = document.getElementById('gAutoProgressNote');
    if (pctEl)  pctEl.textContent  = avg + '%';
    if (barEl)  barEl.style.width  = avg + '%';
    if (noteEl) noteEl.innerHTML   = noteLines.join('<br>');
  } else {
    autoWrap.style.display  = 'none';
    manualWrap.style.display= 'block';
  }
}

// ── Filter ────────────────────────────────────────────
function setGoalFilter(f, btn) {
  GOALS.filter = f;
  document.querySelectorAll('#goalsFilters .gf-chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderGoals();
}

// ── Render cards ──────────────────────────────────────
function goalDeadlineStatus(goal) {
  if (goal.status === 'done') return { cls:'done', text:'✅ Achieved' };
  if (!goal.target_date) return null;

  const todayIso = new Date().toISOString().slice(0,10);
  const todayJ   = gregToJalali(todayIso);
  const targetJ  = gregToJalali(goal.target_date);
  if (!todayJ || !targetJ) return null;

  const monthsLeft = (targetJ.y - todayJ.y) * 12 + (targetJ.m - todayJ.m);

  if (monthsLeft < 0) return { cls:'overdue', text:`⚠️ ${Math.abs(monthsLeft)}mo overdue` };
  if (monthsLeft === 0) return { cls:'at-risk', text:`⏳ ${targetJ.month_name} ${targetJ.y}` };
  if (monthsLeft <= 2) return { cls:'at-risk', text:`⏳ ${monthsLeft}mo left` };
  return { cls:'on-track', text:`📅 ${targetJ.month_name} ${targetJ.y}` };
}

function renderGoals() {
  const grid = document.getElementById('goalsGrid');
  if (!grid) return;

  let filtered = GOALS.data;
  if (GOALS.filter === 'active')  filtered = filtered.filter(g => g.status === 'active');
  else if (GOALS.filter === 'done') filtered = filtered.filter(g => g.status === 'done');
  else if (GOALS.filter === 'paused') filtered = filtered.filter(g => g.status === 'paused');
  else if (GOALS.filter === 'high')   filtered = filtered.filter(g => g.importance === 'high');
  else if (['financial','professional','looks','social'].includes(GOALS.filter)) {
    filtered = filtered.filter(g => g.category === GOALS.filter);
  }

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="goals-empty">
      <span class="goals-empty-icon">🎯</span>
      <div class="goals-empty-title">${GOALS.filter === 'all' ? 'No goals yet' : 'Nothing here'}</div>
      <div class="goals-empty-sub">${GOALS.filter === 'all'
        ? 'Add your first goal and start chasing it.'
        : 'Try a different filter or add a new goal.'}</div>
    </div>`;
    return;
  }

  // Sort: active high importance first, then by progress descending
  const importanceOrder = {high:0, medium:1, low:2};
  const statusOrder = {active:0, paused:1, done:2};
  filtered = [...filtered].sort((a,b) => {
    if (a.status !== b.status) return (statusOrder[a.status]||0) - (statusOrder[b.status]||0);
    if (a.importance !== b.importance) return (importanceOrder[a.importance]||1) - (importanceOrder[b.importance]||1);
    return (b.progress||0) - (a.progress||0);
  });

  const catEmoji = { financial:'💰', professional:'💼', looks:'✨', social:'🤝' };
  const catCls   = { financial:'cat-financial', professional:'cat-professional', looks:'cat-looks', social:'cat-social' };

  grid.innerHTML = filtered.map((g, i) => {
    const prog = g.progress || 0; // kept for compat; display uses goalsCalcProgress
    const deadline = goalDeadlineStatus(g);

    // Accent color per importance
    const accentMap = { high:'var(--coral)', medium:'var(--amber)', low:'var(--sage)' };
    const accent = accentMap[g.importance] || 'var(--sky)';

    // Tags
    const impTagCls  = {high:'importance-high', medium:'importance-med', low:'importance-low'};
    const diffTagCls = {hard:'diff-hard', medium:'diff-medium', easy:'diff-easy'};
    const statTagCls = {done:'status-done', active:'status-active', paused:'status-paused'};
    const impEmoji   = {high:'🔴', medium:'🟡', low:'🟢'};
    const diffEmoji  = {hard:'🔥', medium:'💪', easy:'😌'};

    const progColorMap = {high:'var(--coral)',medium:'var(--amber)',low:'var(--sage)'};

    const prog2 = goalsCalcProgress(g);
    const displayProg = prog2.pct;

    const moneyTotal = g.money_amount ? Number(g.money_amount).toLocaleString() : null;
    const moneySpent = g.money_spent  ? Number(g.money_spent).toLocaleString()  : null;
    const moneyStr = moneyTotal
      ? (moneySpent ? `${moneySpent} / ${moneyTotal} ${g.money_unit||'KT'}` : `${moneyTotal} ${g.money_unit||'KT'}`)
      : '—';
    const timeTotal = g.time_amount ? `${g.time_amount} hrs` : null;
    const timeSpent = g.time_spent  ? `${g.time_spent} hrs`  : null;
    const timeStr = timeTotal
      ? (timeSpent ? `${timeSpent} / ${timeTotal}` : timeTotal)
      : '—';

    const deadlineHtml = deadline
      ? `<div class="goal-deadline-pill ${deadline.cls}">${deadline.text}</div>`
      : '';

    const notesHtml = g.notes
      ? `<div class="goal-notes">"${g.notes}"</div>`
      : '';

    const doneChecked = g.status === 'done' ? '✅' : '⬜';
    const category = g.category || 'financial';

    return `
    <div class="goal-card" style="animation-delay:${i*0.05}s;">
      <div class="goal-card-accent" style="background:${accent};"></div>
      <div class="goal-card-top">
        <div class="goal-card-title">${g.title || 'Untitled Goal'}</div>
        <div class="goal-card-actions">
          <button class="goal-icon-btn done-btn" title="${g.status==='done'?'Mark Active':'Mark Done'}"
            onclick="toggleGoalDone('${g.id}')">${doneChecked}</button>
          <button class="goal-icon-btn" title="Edit" onclick="openGoalModal('${g.id}')">✏️</button>
          <button class="goal-icon-btn" title="Delete" onclick="deleteGoal('${g.id}')">🗑️</button>
        </div>
      </div>

      <div class="goal-tags">
        <span class="goal-tag ${catCls[category]}">${catEmoji[category]} ${category}</span>
        <span class="goal-tag ${impTagCls[g.importance]||''}">${impEmoji[g.importance]||''} ${g.importance||'medium'}</span>
        <span class="goal-tag ${diffTagCls[g.difficulty]||''}">${diffEmoji[g.difficulty]||''} ${g.difficulty||'medium'}</span>
        <span class="goal-tag ${statTagCls[g.status]||''}">${g.status||'active'}</span>
      </div>

      <div class="goal-progress-wrap">
        <div class="goal-progress-header">
          <span class="goal-progress-label">Progress${prog2.auto ? ' <span style="font-size:9px;color:var(--sage);font-weight:700;text-transform:uppercase;letter-spacing:.05em;">auto</span>' : ''}</span>
          <span class="goal-progress-pct">${displayProg}%</span>
        </div>
        <div class="goal-progress-bar">
          <div class="goal-progress-fill" style="width:${displayProg}%;background:${progColorMap[g.importance]||'var(--sky)'};"></div>
        </div>
        ${prog2.auto && prog2.notes.length ? `<div style="font-size:10px;color:var(--text3);margin-top:3px;">${prog2.notes.join(' · ')}</div>` : ''}
      </div>

      <div class="goal-meta-grid">
        <div class="goal-meta-item">
          <div class="goal-meta-label">💰 Budget</div>
          <div class="goal-meta-val">${moneyStr}</div>
        </div>
        <div class="goal-meta-item">
          <div class="goal-meta-label">⏱️ Time</div>
          <div class="goal-meta-val">${timeStr}</div>
        </div>
      </div>

      ${deadlineHtml}
      ${notesHtml}
    </div>`;
  }).join('');
}

function renderGoalsHero() {
  const total  = GOALS.data.length;
  const done   = GOALS.data.filter(g=>g.status==='done').length;
  const active = GOALS.data.filter(g=>g.status==='active').length;
  const pct    = total > 0 ? Math.round((done/total)*100) : 0;

  // Sum money in MT (million tomans for readability)
  let budgetTotal = 0;
  GOALS.data.forEach(g => {
    const amt = parseFloat(g.money_amount) || 0;
    if (g.money_unit === 'MT') budgetTotal += amt;
    else if (g.money_unit === 'KT') budgetTotal += amt / 1000;
    else if (g.money_unit === 'USD') budgetTotal += amt / 10; // rough
    else if (g.money_unit === 'EUR') budgetTotal += amt / 10;
  });

  const el = id => document.getElementById(id);
  if (el('gStatTotal'))   el('gStatTotal').textContent   = total;
  if (el('gStatDone'))    el('gStatDone').textContent     = done;
  if (el('gStatDonePct')) el('gStatDonePct').textContent  = `${pct}% completion`;
  if (el('gStatActive'))  el('gStatActive').textContent   = active;
  if (el('gStatBudget'))  el('gStatBudget').textContent   = budgetTotal > 0 ? budgetTotal.toFixed(1) : '—';
}

// ── Modal open/close ──────────────────────────────────
function openGoalModal(id) {
  GOALS.editId = id || null;
  const overlay = document.getElementById('goalModalOverlay');
  const titleEl = document.getElementById('goalModalTitle');

  if (id) {
    const g = GOALS.data.find(x=>x.id===id);
    if (!g) return;
    titleEl.textContent = '✏️ Edit Goal';
    document.getElementById('gTitle').value       = g.title || '';
    document.getElementById('gNotes').value       = g.notes || '';
    document.getElementById('gProgress').value    = g.progress || 0;
    document.getElementById('gProgressVal').textContent = (g.progress||0)+'%';
    document.getElementById('gMoney').value       = g.money_amount || '';
    document.getElementById('gMoneyUnit').value   = g.money_unit || 'KT';
    document.getElementById('gTime').value        = g.time_amount || '';

    renderJalaliPicker('gTargetDatePicker', 'gTargetDateIso', g.target_date || null);

    document.getElementById('gMoneySpent') && (document.getElementById('gMoneySpent').value = g.money_spent || '');
    document.getElementById('gTimeSpent')  && (document.getElementById('gTimeSpent').value  = g.time_spent  || '');
    // sync unit label and show correct mode
    goalsUpdateProgressMode();

    // Restore chip selections
    _setChipActive('gImportanceGroup', g.importance || 'medium');
    _setChipActive('gDiffGroup',       g.difficulty || 'medium');
    _setChipActive('gStatusGroup',     g.status     || 'active');
    _setChipActive('gCategoryGroup',   g.category   || 'financial');
  } else {
    titleEl.textContent = '🎯 New Goal';
    document.getElementById('gTitle').value = '';
    document.getElementById('gNotes').value = '';
    document.getElementById('gProgress').value = 0;
    document.getElementById('gProgressVal').textContent = '0%';
    document.getElementById('gMoney').value = '';
    document.getElementById('gMoneyUnit').value = 'KT';
    document.getElementById('gMoneySpent') && (document.getElementById('gMoneySpent').value = '');
    document.getElementById('gTime').value = '';
    document.getElementById('gTimeSpent')  && (document.getElementById('gTimeSpent').value  = '');
    goalsUpdateProgressMode();

    renderJalaliPicker('gTargetDatePicker', 'gTargetDateIso', null);

    _setChipActive('gImportanceGroup', 'medium');
    _setChipActive('gDiffGroup',       'medium');
    _setChipActive('gStatusGroup',     'active');
    _setChipActive('gCategoryGroup',   'financial');
  }

  overlay.classList.add('open');
}

function closeGoalModal() {
  document.getElementById('goalModalOverlay').classList.remove('open');
  GOALS.editId = null;
}

function _setChipActive(groupId, val) {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.querySelectorAll('.goal-chip-sel').forEach(b => {
    b.classList.toggle('active', b.dataset.val === val);
  });
}

// ── Save goal ─────────────────────────────────────────
async function saveGoal() {
  const title = document.getElementById('gTitle').value.trim();
  if (!title) { goalsShowToast('Please enter a goal title', ''); return; }

  const goal = {
    id:           GOALS.editId || String(Date.now()),
    title,
    notes:        document.getElementById('gNotes').value.trim(),
    category:     getSelectedChipVal('gCategoryGroup') || 'financial',
    importance:   getSelectedChipVal('gImportanceGroup') || 'medium',
    difficulty:   getSelectedChipVal('gDiffGroup') || 'medium',
    status:       getSelectedChipVal('gStatusGroup') || 'active',
    target_date:  document.getElementById('gTargetDateIso').value || null,
    progress:     0, // will be overwritten below
    money_amount: document.getElementById('gMoney').value || null,
    money_unit:   document.getElementById('gMoneyUnit').value,
    time_amount:  document.getElementById('gTime').value || null,
    time_unit:    'hrs total',
    money_spent:  document.getElementById('gMoneySpent')?.value || null,
    time_spent:   document.getElementById('gTimeSpent')?.value  || null,
    created_at:   GOALS.editId
      ? (GOALS.data.find(x=>x.id===GOALS.editId)||{}).created_at || new Date().toISOString()
      : new Date().toISOString(),
  };

  // Compute final progress
  const computedProg = goalsCalcProgress(goal);
  goal.progress = computedProg.auto
    ? computedProg.pct
    : (parseInt(document.getElementById('gProgress').value) || 0);

  if (GOALS.editId) {
    const idx = GOALS.data.findIndex(x=>x.id===GOALS.editId);
    if (idx !== -1) GOALS.data[idx] = goal; else GOALS.data.push(goal);
  } else {
    GOALS.data.push(goal);
  }

  closeGoalModal();
  await persistGoals();
  renderGoals();
  renderGoalsHero();
  goalsShowToast(GOALS.editId ? 'Goal updated ✓' : 'Goal added ✓', 'success');
}

// ── Toggle done ───────────────────────────────────────
async function toggleGoalDone(id) {
  const g = GOALS.data.find(x=>x.id===id);
  if (!g) return;
  if (g.status === 'done') {
    g.status = 'active';
    if (g.progress === 100) g.progress = 90;
  } else {
    g.status = 'done';
    g.progress = 100;
  }
  await persistGoals();
  renderGoals();
  renderGoalsHero();
  goalsShowToast(g.status === 'done' ? '🎉 Goal achieved!' : 'Moved back to active', g.status==='done'?'success':'');
}

// ── Delete ────────────────────────────────────────────
async function deleteGoal(id) {
  if (!confirm('Delete this goal? This cannot be undone.')) return;
  GOALS.data = GOALS.data.filter(x=>x.id!==id);
  await persistGoals();
  renderGoals();
  renderGoalsHero();
  goalsShowToast('Goal deleted');
}
