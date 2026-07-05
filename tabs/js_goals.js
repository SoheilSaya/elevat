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

// ── Icon set (SVG, not emoji — emoji glyphs render blank in some environments) ──
const GOAL_ICONS = {
  pin:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 3h6l1 5.5 3 2.2v2.3H5v-2.3l3-2.2z"/></svg>`,
  check:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 12 9 17 20 6"/></svg>`,
  circle:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg>`,
  edit:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
  trash:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>`,
  coin:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 9.3c0-1.3 1.3-2.3 3-2.3s3 .8 3 1.9c0 2.5-6 1.5-6 4 0 1.3 1.3 2.1 3 2.1s3-.9 3-2.2"/></svg>`,
  clock:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>`,
  alert:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17h.01"/></svg>`,
  fire:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21c4-.7 6-3.6 6-7.3 0-1.9-.8-3.5-1.8-4.7.1 1.8-.8 2.7-1.7 2.7.2-2.7-.9-5.4-3.5-7.2.3 2.6-1.4 4.4-3 6.7-1 1.5-1.8 2.8-1.8 5.1 0 3.5 2.6 4.7 5.8 4.7z"/></svg>`,
  gauge:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 15.5a7.5 7.5 0 1 1 15 0"/><path d="M12 15.5l3-4.2"/></svg>`,
  smile:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 14.5S9.5 17 12 17s4-2.5 4-2.5M9 9.5h.01M15 9.5h.01"/></svg>`,
  briefcase:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2.5"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
  sparkle:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M5 12h4M15 12h4M7.5 7.5l1.8 1.8M14.7 14.7l1.8 1.8M16.5 7.5l-1.8 1.8M9.3 14.7l-1.8 1.8"/></svg>`,
  users:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"/><path d="M2.3 20c0-3.2 3-5.3 6.7-5.3s6.7 2.1 6.7 5.3"/><circle cx="17.5" cy="8.3" r="2.5"/><path d="M16 12.8c2.4.5 4 2.3 4 4.7"/></svg>`,
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

  // Daily task input only makes sense when a total hours target exists
  const dailyWrap = document.getElementById('gDailyTaskWrap');
  if (dailyWrap) dailyWrap.style.display = timeTotal > 0 ? 'block' : 'none';

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
  if (goal.status === 'done') return { cls:'done', text:'Achieved' };
  if (!goal.target_date) return null;

  const todayIso = new Date().toISOString().slice(0,10);
  const todayJ   = gregToJalali(todayIso);
  const targetJ  = gregToJalali(goal.target_date);
  if (!todayJ || !targetJ) return null;

  const monthsLeft = (targetJ.y - todayJ.y) * 12 + (targetJ.m - todayJ.m);

  if (monthsLeft < 0) return { cls:'overdue', text:`${Math.abs(monthsLeft)}mo overdue` };
  if (monthsLeft === 0) return { cls:'at-risk', text:`${targetJ.month_name} ${targetJ.y}` };
  if (monthsLeft <= 2) return { cls:'at-risk', text:`${monthsLeft}mo left` };
  return { cls:'on-track', text:`${targetJ.month_name} ${targetJ.y}` };
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

  // Sort: pinned goals first, then manual drag-order (position in GOALS.data)
  filtered = [...filtered].sort((a,b) => {
    const ap = a.pinned ? 0 : 1, bp = b.pinned ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return GOALS.data.indexOf(a) - GOALS.data.indexOf(b);
  });

  const catIconMap = { financial:GOAL_ICONS.coin, professional:GOAL_ICONS.briefcase, looks:GOAL_ICONS.sparkle, social:GOAL_ICONS.users };
  const catCls     = { financial:'cat-financial', professional:'cat-professional', looks:'cat-looks', social:'cat-social' };
  const deadlineIconMap = { done:GOAL_ICONS.check, overdue:GOAL_ICONS.alert, 'at-risk':GOAL_ICONS.clock, 'on-track':GOAL_ICONS.calendar };

  grid.innerHTML = filtered.map((g, i) => {
    const deadline = goalDeadlineStatus(g);

    // Accent color per importance — drives the left spine + progress fill
    const accentMap = { high:'var(--coral)', medium:'var(--amber)', low:'var(--sage)' };
    const accent = accentMap[g.importance] || 'var(--sky)';

    const statusColorMap = { active:'var(--sky)', paused:'var(--amber)', done:'var(--sage)' };
    const statusLabelMap = { active:'Active', paused:'Paused', done:'Done' };
    const diffColorMap   = { hard:'var(--plum)', medium:'var(--sky)', easy:'var(--sage)' };
    const diffIconMap    = { hard:GOAL_ICONS.fire, medium:GOAL_ICONS.gauge, easy:GOAL_ICONS.smile };
    const diffLabelMap   = { hard:'Hard', medium:'Medium', easy:'Easy' };

    const category   = g.category   || 'financial';
    const difficulty = g.difficulty || 'medium';
    const status     = g.status     || 'active';
    const isDone      = status === 'done';

    const prog2 = goalsCalcProgress(g);
    const displayProg = prog2.pct;

    const moneyTotal = g.money_amount ? Number(g.money_amount).toLocaleString() : null;
    const moneySpent = g.money_spent  ? Number(g.money_spent).toLocaleString()  : null;
    const moneyStr = moneyTotal
      ? (moneySpent ? `${moneySpent} / ${moneyTotal} ${g.money_unit||'KT'}` : `${moneyTotal} ${g.money_unit||'KT'}`)
      : null;
    const timeTotal = g.time_amount ? `${g.time_amount} hrs` : null;
    const timeSpent = g.time_spent  ? `${g.time_spent} hrs`  : null;
    const timeStr = timeTotal
      ? (timeSpent ? `${timeSpent} / ${timeTotal}` : timeTotal)
      : null;

    // Daily task tick (only for goals with a total-hours target + a daily hours amount)
    const todayIso = new Date().toISOString().slice(0,10);
    const dailyHours = parseFloat(g.daily_hours) || 0;
    const tickedToday = g.last_tick_date === todayIso;
    const dailyTaskHtml = (parseFloat(g.time_amount) > 0 && dailyHours > 0) ? `
      <div class="goal-daily-task ${tickedToday ? 'done' : ''}">
        <button class="goal-daily-check" onclick="toggleGoalDailyTick('${g.id}')" title="${tickedToday ? "Undo today's log" : "Log today's session"}">${tickedToday ? GOAL_ICONS.check : ''}</button>
        <div class="goal-daily-task-text">
          <div class="goal-daily-task-label">${tickedToday ? "Today's session logged" : "Log today's session"}</div>
          <div class="goal-daily-task-sub">${dailyHours}h/day toward this goal</div>
        </div>
      </div>` : '';

    const deadlineHtml = deadline
      ? `<div class="goal-deadline-pill ${deadline.cls}">${deadlineIconMap[deadline.cls]||''}${deadline.text}</div>`
      : '';

    const notesHtml = g.notes
      ? `<div class="goal-notes" dir="auto">"${g.notes}"</div>`
      : '';

    return `
    <div class="goal-card${g.pinned?' pinned':''}${isDone?' is-done':''}" draggable="true" data-goal-id="${g.id}"
      ondragstart="goalDragStart(event,'${g.id}')" ondragover="goalDragOver(event)"
      ondragleave="goalDragLeave(event)" ondrop="goalDrop(event,'${g.id}')" ondragend="goalDragEnd(event)"
      style="animation-delay:${i*0.05}s;">
      <div class="goal-card-spine" style="background:${accent};"></div>
      <div class="goal-card-inner">
        <div class="goal-card-head">
          <div class="goal-card-badge ${catCls[category]}">${catIconMap[category]}</div>
          <div class="goal-card-headtext">
            <div class="goal-card-title${isDone?' is-done':''}" dir="auto">${g.title || 'Untitled Goal'}</div>
            <div class="goal-card-eyebrow">
              <span class="goal-dot" style="background:${statusColorMap[status]||'var(--sky)'};"></span>${statusLabelMap[status]||status}
              <span class="eyebrow-sep">·</span>
              <span style="color:${diffColorMap[difficulty]||'var(--sky)'};display:inline-flex;align-items:center;gap:3px;">${diffIconMap[difficulty]||''}${diffLabelMap[difficulty]||difficulty}</span>
            </div>
          </div>
          <div class="goal-card-actions">
            <button class="goal-icon-btn pin-btn ${g.pinned?'active':''}" title="${g.pinned?'Unpin':'Pin to top'}"
              onclick="togglePinGoal('${g.id}')">${GOAL_ICONS.pin}</button>
            <button class="goal-icon-btn done-btn ${isDone?'is-done':''}" title="${isDone?'Mark Active':'Mark Done'}"
              onclick="toggleGoalDone('${g.id}')">${isDone?GOAL_ICONS.check:GOAL_ICONS.circle}</button>
            <button class="goal-icon-btn" title="Edit" onclick="openGoalModal('${g.id}')">${GOAL_ICONS.edit}</button>
            <button class="goal-icon-btn" title="Delete" onclick="deleteGoal('${g.id}')">${GOAL_ICONS.trash}</button>
          </div>
        </div>

        <div class="goal-progress-wrap">
          <div class="goal-progress-header">
            <span class="goal-progress-label">Progress${prog2.auto ? ' <span class="goal-progress-auto-badge">Auto</span>' : ''}</span>
            <span class="goal-progress-pct" style="color:${accent};">${displayProg}%</span>
          </div>
          <div class="goal-progress-bar">
            <div class="goal-progress-fill" style="width:${displayProg}%;background:${accent};"></div>
          </div>
          ${prog2.auto && prog2.notes.length ? `<div class="goal-progress-note">${prog2.notes.join(' · ')}</div>` : ''}
        </div>

        <div class="goal-meta-grid">
          <div class="goal-meta-item">
            <div class="goal-meta-icon">${GOAL_ICONS.coin}</div>
            <div>
              <div class="goal-meta-label">Budget</div>
              <div class="goal-meta-val${moneyStr?'':' empty'}">${moneyStr || 'Not tracked'}</div>
            </div>
          </div>
          <div class="goal-meta-item">
            <div class="goal-meta-icon">${GOAL_ICONS.clock}</div>
            <div>
              <div class="goal-meta-label">Time</div>
              <div class="goal-meta-val${timeStr?'':' empty'}">${timeStr || 'Not tracked'}</div>
            </div>
          </div>
        </div>

        ${dailyTaskHtml}
        ${deadlineHtml}
        ${notesHtml}
      </div>
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
    document.getElementById('gDailyHours') && (document.getElementById('gDailyHours').value = g.daily_hours || '');

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
    document.getElementById('gDailyHours') && (document.getElementById('gDailyHours').value = '');
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

  const existingGoal = GOALS.editId ? GOALS.data.find(x=>x.id===GOALS.editId) : null;

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
    daily_hours:  document.getElementById('gDailyHours')?.value || null,
    money_spent:  document.getElementById('gMoneySpent')?.value || null,
    time_spent:   document.getElementById('gTimeSpent')?.value  || null,
    last_tick_date: existingGoal?.last_tick_date || null,
    pinned:       existingGoal?.pinned || false,
    created_at:   existingGoal?.created_at || new Date().toISOString(),
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

// ── Daily task tick (for goals tracking total hours) ──
async function toggleGoalDailyTick(id) {
  const g = GOALS.data.find(x=>x.id===id);
  if (!g) return;
  const daily = parseFloat(g.daily_hours) || 0;
  if (!daily) return;

  const todayIso  = new Date().toISOString().slice(0,10);
  const timeTotal = parseFloat(g.time_amount) || 0;
  let timeSpent   = parseFloat(g.time_spent)  || 0;

  if (g.last_tick_date === todayIso) {
    // Already ticked today — undo it
    timeSpent = Math.max(0, timeSpent - daily);
    g.last_tick_date = null;
  } else {
    timeSpent = timeTotal > 0 ? Math.min(timeTotal, timeSpent + daily) : timeSpent + daily;
    g.last_tick_date = todayIso;
  }
  g.time_spent = timeSpent;

  // Time-based progress is auto-tracked, so recompute it
  const prog = goalsCalcProgress(g);
  if (prog.auto) g.progress = prog.pct;

  await persistGoals();
  renderGoals();
  renderGoalsHero();
  goalsShowToast(g.last_tick_date ? `+${daily}h logged ✓` : 'Tick undone', g.last_tick_date ? 'success' : '');
}

// ── Pin to top ─────────────────────────────────────────
async function togglePinGoal(id) {
  const g = GOALS.data.find(x=>x.id===id);
  if (!g) return;
  g.pinned = !g.pinned;
  if (g.pinned) {
    // Move it to the very front so it lands at the top of the pinned group
    GOALS.data = [g, ...GOALS.data.filter(x=>x.id!==id)];
  }
  await persistGoals();
  renderGoals();
  goalsShowToast(g.pinned ? 'Pinned to top 📌' : 'Unpinned');
}

// ── Manual drag-and-drop reordering ───────────────────
let _draggedGoalId = null;

function goalDragStart(e, id) {
  _draggedGoalId = id;
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.classList.add('dragging');
}

function goalDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
}

function goalDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

async function goalDrop(e, targetId) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (!_draggedGoalId || _draggedGoalId === targetId) return;

  const fromIdx = GOALS.data.findIndex(x=>x.id===_draggedGoalId);
  const toIdx   = GOALS.data.findIndex(x=>x.id===targetId);
  if (fromIdx === -1 || toIdx === -1) { _draggedGoalId = null; return; }

  const targetPinned = GOALS.data[toIdx].pinned || false;
  const [moved] = GOALS.data.splice(fromIdx, 1);
  moved.pinned = targetPinned; // dropping into a pinned/unpinned group updates its pin state to match
  const insertAt = GOALS.data.findIndex(x=>x.id===targetId);
  GOALS.data.splice(insertAt, 0, moved);

  _draggedGoalId = null;
  await persistGoals();
  renderGoals();
}

function goalDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.goal-card.drag-over').forEach(c => c.classList.remove('drag-over'));
}
