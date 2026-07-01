// ─── MONEY / BUDGET MODULE ────────────────────────

const J_MONTHS_EN = ['Farvardin','Ordibehesht','Khordad','Tir','Mordad','Shahrivar','Mehr','Aban','Azar','Dey','Bahman','Esfand'];
let M = { data: null, viewMonth: null, editingDay: null, charts: {}, dayEntries: [], dayIncomeEntries: [] };
let allLoans = [];
let allReceivables = [];

async function loadLoans() {
  const r = await fetch('/api/budget/loans');
  allLoans = await r.json();
}
async function addLoan() {
  const name = document.getElementById('loanName').value.trim();
  const icon = document.getElementById('loanIcon').value.trim() || '🏦';
  const monthly_payment = parseInt(document.getElementById('loanMonthly').value) || 0;
  const pay_day = parseInt(document.getElementById('loanPayDay').value) || 1;
  const start_month = document.getElementById('loanStartMonth').value.trim() || M.viewMonth;
  const end_month = document.getElementById('loanEndMonth').value.trim();
  if (!name || !monthly_payment) { showToast('Enter a name and monthly payment',''); return; }
  if (!end_month) { showToast('Enter an end month',''); return; }
  await fetch('/api/budget/loans', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ action:'add', name, icon, monthly_payment, pay_day, start_month, end_month }) });
  document.getElementById('loanName').value = '';
  document.getElementById('loanIcon').value = '';
  document.getElementById('loanMonthly').value = '';
  document.getElementById('loanPayDay').value = '';
  document.getElementById('loanEndMonth').value = '';
  await loadLoans();
  await loadMonthData();
  showToast('Loan added — shows in fixed expenses each month ✓', 'success');
}
async function deleteLoan(id) {
  if (!confirm('Delete this loan? Removed from all months.')) return;
  await fetch('/api/budget/loans', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ action:'delete', id }) });
  await loadLoans();
  await loadMonthData();
}
function renderLoanList() {
  const el = document.getElementById('loanManagerList');
  if (!el) return;
  if (!allLoans.length) {
    el.innerHTML = '<div style="color:var(--text4);font-size:13px;padding:8px;font-style:italic;">No loans yet</div>';
    return;
  }
  el.innerHTML = allLoans.map(l => {
    const startIdx = monthIndexJs(l.start_month);
    const endIdx   = monthIndexJs(l.end_month);
    const curIdx   = monthIndexJs(M.viewMonth || l.start_month);
    const totalMonths = endIdx - startIdx + 1;
    const paidMonths  = Math.min(Math.max(curIdx - startIdx, 0), totalMonths);
    const pct = totalMonths > 0 ? Math.round(paidMonths / totalMonths * 100) : 0;
    const done = curIdx > endIdx;
    const active = curIdx >= startIdx && curIdx <= endIdx;
    const statusColor = done ? 'var(--sage)' : active ? 'var(--plum)' : 'var(--text3)';
    const statusText  = done ? '✓ Paid off' : active ? `Month ${paidMonths+1} of ${totalMonths}` : `Starts ${l.start_month}`;
    return `
    <div style="background:var(--cream2);border-radius:var(--r2);padding:12px 14px;border:1.5px solid var(--cream3);">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <span style="font-size:18px;line-height:1;">${l.icon}</span>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:700;color:var(--text)">${l.name}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:1px;">${l.start_month} → ${l.end_month} · Day ${l.pay_day||1} each month</div>
        </div>
        <span style="font-family:Fraunces,serif;font-size:14px;font-weight:700;color:var(--plum)">${l.monthly_payment.toLocaleString()} K</span>
        <button onclick="deleteLoan('${l.id}')" style="border:none;background:transparent;cursor:pointer;color:var(--text3);font-size:18px;line-height:1;padding:0 2px;flex-shrink:0;">×</button>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
        <span style="font-size:11px;font-weight:600;color:${statusColor};">${statusText}</span>
        <span style="font-size:11px;color:var(--text3);">${pct}%</span>
      </div>
      <div style="height:5px;background:var(--cream3);border-radius:5px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:${done?'var(--sage)':'var(--plum)'};border-radius:5px;transition:width .3s;"></div>
      </div>
    </div>`;
  }).join('');
}
function monthIndexJs(mk) {
  const [y,m] = mk.split('-').map(Number);
  return y*12 + m;
}

// ── Receivables (money others owe you) ───────────
async function addReceivable() {
  const person = document.getElementById('recPerson').value.trim();
  const amount = parseInt(document.getElementById('recAmount').value) || 0;
  const note   = document.getElementById('recNote').value.trim();
  if (!person || !amount) { showToast('Enter a name and amount',''); return; }
  const r = await fetch('/api/budget/receivables', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ action:'add', person, amount, note }) });
  const d = await r.json();
  allReceivables = d.receivables;
  document.getElementById('recPerson').value = '';
  document.getElementById('recAmount').value = '';
  document.getElementById('recNote').value = '';
  await loadMonthData();
  showToast('Added to receivables ✓', 'success');
}
async function deleteReceivable(id) {
  if (!confirm('Remove this receivable?')) return;
  const r = await fetch('/api/budget/receivables', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ action:'delete', id }) });
  const d = await r.json();
  allReceivables = d.receivables;
  await loadMonthData();
}
async function recordPayment(id) {
  const amount = parseInt(prompt('How much did they pay? (K T)')) || 0;
  if (!amount) return;
  const r = await fetch('/api/budget/receivables', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ action:'record_payment', id, amount }) });
  const d = await r.json();
  allReceivables = d.receivables;
  await loadMonthData();
  showToast('+' + amount.toLocaleString() + ' K ticked as collected ✓', 'success');
}
function renderReceivables() {
  const el = document.getElementById('receivablesList');
  if (!el) return;
  if (!allReceivables.length) {
    el.innerHTML = '<div style="color:var(--text4);font-size:13px;padding:8px;font-style:italic;">No receivables — everyone\'s paid up 🎉</div>';
    return;
  }
  el.innerHTML = allReceivables.map(r => {
    const remaining = r.amount - (r.paid_amount || 0);
    const pct = Math.round((r.paid_amount || 0) / r.amount * 100);
    const done = r.fully_paid;
    return `
    <div style="background:${done?'var(--sageL)':'var(--cream2)'};border-radius:var(--r2);padding:12px 14px;border:1.5px solid ${done?'var(--sage)':'var(--cream3)'};opacity:${done?.7:1};">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
        <span style="font-size:18px">${done?'✅':'👤'}</span>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:700;color:var(--text)">${r.person}</div>
          ${r.note?`<div style="font-size:11px;color:var(--text3);margin-top:1px;">${r.note}</div>`:''}
        </div>
        <div style="text-align:right;">
          <div style="font-family:Fraunces,serif;font-size:15px;font-weight:700;color:${done?'var(--sage)':'var(--ink)'};">${remaining.toLocaleString()} K</div>
          <div style="font-size:10px;color:var(--text3);">of ${r.amount.toLocaleString()} K</div>
        </div>
        ${!done?`<button onclick="recordPayment('${r.id}')" class="m-btn sage" style="padding:6px 10px;font-size:11px;white-space:nowrap;">💰 Paid</button>`:''}
        <button onclick="deleteReceivable('${r.id}')" style="border:none;background:transparent;cursor:pointer;color:var(--text3);font-size:18px;padding:0 2px;flex-shrink:0;">×</button>
      </div>
      ${r.payments && r.payments.length ? `
        <div style="font-size:11px;color:var(--text3);margin-bottom:5px;">${r.payments.map(p=>`+${p.amount.toLocaleString()} K on ${p.date}`).join(' · ')}</div>` : ''}
      <div style="height:4px;background:var(--cream3);border-radius:5px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:${done?'var(--sage)':'var(--sky)'};border-radius:5px;transition:width .3s;"></div>
      </div>
      <div style="font-size:10px;color:var(--text4);margin-top:3px;">Added ${r.date_added} · ${pct}% received</div>
    </div>`;
  }).join('');
}

function renderTransactions() {
  const el = document.getElementById('txList');
  const sumEl = document.getElementById('txSummaryRow');
  if (!el || !M.data) return;
  const spending = M.data.month.daily_spending || {};
  const typeF = document.getElementById('txTypeFilter')?.value || 'all';
  const tagF  = document.getElementById('txTagFilter')?.value || 'all';
  const sort  = document.getElementById('txSort')?.value || 'date_desc';

  // Flatten all entries into a tx list
  let rows = [];
  Object.entries(spending).forEach(([day, v]) => {
    const d = parseInt(day);
    if (typeof v === 'object') {
      (v.tags || []).forEach(t => rows.push({ day: d, type:'expense', tag_id: t.tag_id, name: t.name, icon: t.icon, color: t.color, amount: t.amount }));
      (v.income || []).forEach(t => rows.push({ day: d, type:'income', tag_id: t.tag_id, name: t.name, icon: t.icon, color: t.color, amount: t.amount }));
      (v.fixed_payments || []).forEach(t => rows.push({ day: d, type:'settled', tag_id: '__settled__', name: t.name, icon: t.icon, color: '#6c63ff', amount: t.amount, kind: t.kind }));
    } else if (v > 0) {
      rows.push({ day: d, type:'expense', tag_id:'__legacy__', name:'Other', icon:'💰', color:'#a8967c', amount: v });
    }
  });

  // Filter
  if (typeF !== 'all') rows = rows.filter(r => r.type === typeF);
  if (tagF !== 'all') rows = rows.filter(r => r.tag_id === tagF);

  // Sort
  if (sort === 'date_desc') rows.sort((a,b) => b.day - a.day);
  else if (sort === 'date_asc') rows.sort((a,b) => a.day - b.day);
  else if (sort === 'amount_desc') rows.sort((a,b) => b.amount - a.amount);
  else rows.sort((a,b) => a.amount - b.amount);

  if (!rows.length) {
    el.innerHTML = '<div style="color:var(--text4);font-size:13px;padding:12px;text-align:center;font-style:italic;">No transactions match your filters</div>';
    if (sumEl) sumEl.textContent = '';
    return;
  }

  const jmName = J_MONTHS_EN ? J_MONTHS_EN[M.data.jm - 1] : '';
  el.innerHTML = rows.map(r => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:${r.type==='income'?'var(--sageL)':'var(--cream2)'};border-radius:var(--r2);border:1.5px solid ${r.type==='settled'?'var(--plum)':'var(--cream3)'};${r.type==='settled'?'opacity:.85;':''}">
      <span style="font-size:15px">${r.icon}</span>
      <span style="flex:1;font-size:13px;font-weight:600;color:var(--text)">${r.name}</span>
      <span style="font-size:11px;color:var(--text3);min-width:60px;text-align:center;">${jmName} ${r.day}</span>
      <span style="font-family:Fraunces,serif;font-size:14px;font-weight:700;color:${r.type==='income'?'var(--sage)':'var(--ink)'}">${r.type==='income'?'+':''}${r.amount.toLocaleString()} K</span>
      <span style="font-size:10px;padding:2px 7px;border-radius:50px;background:${r.type==='income'?'var(--sage)':r.type==='settled'?'var(--plum)':'var(--text3)'};color:#fff;font-weight:700;">${r.type==='settled'?'paid '+(r.kind||''):r.type}</span>
    </div>`).join('');

  const totalExp = rows.filter(r=>r.type==='expense').reduce((s,r)=>s+r.amount,0);
  const totalInc = rows.filter(r=>r.type==='income').reduce((s,r)=>s+r.amount,0);
  const totalSettled = rows.filter(r=>r.type==='settled').reduce((s,r)=>s+r.amount,0);
  if (sumEl) sumEl.innerHTML = `${rows.length} entries · <span style="color:var(--ink)">−${totalExp.toLocaleString()} K</span>${totalInc>0?' · <span style="color:var(--sage)">+'+totalInc.toLocaleString()+' K</span>':''}${totalSettled>0?' · <span style="color:var(--plum)">'+totalSettled.toLocaleString()+' K paid loans/fixed (bank only)</span>':''}`;
}

// All amounts in K Tomans (1 unit = 1,000 T). No rounding, exact figures with commas.
function toman(n) {
  if (n == null || n === '') return '—';
  const sign = n < 0 ? '-' : '';
  return sign + Math.abs(n).toLocaleString() + ' K';
}
function tomanFull(n) {
  if (n == null) return '—';
  const sign = n < 0 ? '-' : '';
  return sign + Math.abs(n).toLocaleString() + ',000 T';
}

// ── Tags ──────────────────────────────────────────
let allTags = [];
let editingTagId = null;
function expenseTags() { return allTags.filter(t => (t.type || 'expense') === 'expense'); }
function incomeTags()  { return allTags.filter(t => t.type === 'income'); }

async function loadTags() {
  const r = await fetch('/api/budget/tags');
  allTags = await r.json();
}
async function addTag(type) {
  const prefix = type === 'income' ? 'income' : 'tag';
  const name = document.getElementById(prefix + 'Name').value.trim();
  const icon = document.getElementById(prefix + 'Icon').value.trim() || (type === 'income' ? '💰' : '🏷️');
  const color = document.getElementById(prefix + 'Color').value;
  if (!name) return;
  await fetch('/api/budget/tags', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ action:'add', name, icon, color, type: type || 'expense' }) });
  document.getElementById(prefix + 'Name').value = '';
  document.getElementById(prefix + 'Icon').value = '';
  await loadTags();
  renderTagManager();
  rebuildTagSelect();
  showToast((type === 'income' ? 'Income source' : 'Tag') + ' added ✓', 'success');
}
async function deleteTag(id) {
  if (!confirm('Delete this tag? Existing entries will keep their name/icon but it will no longer be selectable.')) return;
  await fetch('/api/budget/tags', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ action:'delete', id }) });
  await loadTags();
  renderTagManager();
  rebuildTagSelect();
}
function openTagEdit(id) {
  const tag = allTags.find(t => t.id === id);
  if (!tag) return;
  editingTagId = id;
  document.getElementById('tagEditTitle').textContent = (tag.type === 'income' ? '✏️ Edit Income Source' : '✏️ Edit Expense Tag');
  document.getElementById('tagEditName').value = tag.name;
  document.getElementById('tagEditIcon').value = tag.icon;
  document.getElementById('tagEditColor').value = tag.color;
  document.getElementById('tagEditOverlay').classList.add('open');
}
function closeTagEdit() {
  document.getElementById('tagEditOverlay').classList.remove('open');
  editingTagId = null;
}
async function saveTagEdit() {
  if (!editingTagId) return;
  const name = document.getElementById('tagEditName').value.trim();
  const icon = document.getElementById('tagEditIcon').value.trim() || '🏷️';
  const color = document.getElementById('tagEditColor').value;
  if (!name) { showToast('Enter a name',''); return; }
  await fetch('/api/budget/tags', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ action:'edit', id: editingTagId, name, icon, color }) });
  closeTagEdit();
  await loadTags();
  renderTagManager();
  rebuildTagSelect();
  showToast('Tag updated ✓', 'success');
}
function renderTagList(tags, emptyMsg) {
  if (!tags.length) return `<div style="color:var(--text4);font-size:13px;padding:8px;font-style:italic;">${emptyMsg}</div>`;
  return tags.map(t => `
    <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--cream2);border-radius:var(--r2);border:1.5px solid var(--cream3);">
      <span style="font-size:18px">${t.icon}</span>
      <span style="flex:1;font-size:13px;font-weight:600">${t.name}</span>
      <span style="width:18px;height:18px;border-radius:50%;background:${t.color};flex-shrink:0;border:2px solid rgba(0,0,0,0.1)"></span>
      <button onclick="openTagEdit('${t.id}')" style="border:none;background:transparent;cursor:pointer;color:var(--text3);font-size:14px;padding:0 2px;" title="Edit">✏️</button>
      <button onclick="deleteTag('${t.id}')" style="border:none;background:transparent;cursor:pointer;color:var(--text3);font-size:16px;padding:0 2px;" title="Delete">×</button>
    </div>`).join('');
}
function renderTagManager() {
  const el = document.getElementById('tagManagerList');
  if (el) el.innerHTML = renderTagList(expenseTags(), 'No expense tags yet — create some below');
  const elI = document.getElementById('incomeTagManagerList');
  if (elI) elI.innerHTML = renderTagList(incomeTags(), 'No income sources yet — create some below');
}
function rebuildTagSelect() {
  const sel = document.getElementById('dayTagSelect');
  if (sel) {
    const et = expenseTags();
    sel.innerHTML = et.length
      ? et.map(t => `<option value="${t.id}">${t.icon} ${t.name}</option>`).join('')
      : '<option value="">No tags — create them in the Tags section</option>';
  }
  const iSel = document.getElementById('dayIncomeTagSelect');
  if (iSel) {
    const it = incomeTags();
    iSel.innerHTML = it.length
      ? it.map(t => `<option value="${t.id}">${t.icon} ${t.name}</option>`).join('')
      : '<option value="">No income sources — create them in the Tags section</option>';
  }
}

// ── Day modal ─────────────────────────────────────
function openDayModal(day) {
  M.editingDay = day;
  const d = M.data;
  const spending = d.month.daily_spending || {};
  const existing = spending[String(day)];
  const monthName = J_MONTHS_EN[d.jm - 1];
  document.getElementById('dayModalTitle').textContent = monthName + ' ' + day;
  // Load existing entries
  if (existing && typeof existing === 'object' && existing.tags) {
    M.dayEntries = existing.tags.map(t => ({...t}));
    M.dayIncomeEntries = (existing.income || []).map(t => ({...t}));
  } else if (existing && typeof existing === 'number') {
    // Legacy format — show as untagged
    M.dayEntries = [{ tag_id: '__untagged__', name: 'Other', icon: '💰', color: '#a8967c', amount: existing }];
    M.dayIncomeEntries = [];
  } else {
    M.dayEntries = [];
    M.dayIncomeEntries = [];
  }
  rebuildTagSelect();
  renderDayEntries();
  renderDayIncomeEntries();
  updateDayTotal(d.daily_limit);
  document.getElementById('daySpendOverlay').classList.add('open');
}
function closeDayModal() {
  document.getElementById('daySpendOverlay').classList.remove('open');
  M.editingDay = null; M.dayEntries = []; M.dayIncomeEntries = [];
}
function addDayTagEntry() {
  const sel = document.getElementById('dayTagSelect');
  const amtInput = document.getElementById('dayTagAmount');
  const amount = parseInt(amtInput.value) || 0;
  if (!sel.value || !amount) { showToast('Pick a tag and enter amount',''); return; }
  const tag = allTags.find(t => t.id === sel.value);
  if (!tag) return;
  // If tag already in list, add to it
  const existing = M.dayEntries.find(e => e.tag_id === tag.id);
  if (existing) { existing.amount += amount; }
  else { M.dayEntries.push({ tag_id: tag.id, name: tag.name, icon: tag.icon, color: tag.color, amount }); }
  amtInput.value = '';
  document.querySelectorAll('#dayAmtPresets .preset').forEach(b => b.classList.remove('active'));
  renderDayEntries();
  updateDayTotal(M.data.daily_limit);
}
function removeDayEntry(idx) {
  M.dayEntries.splice(idx, 1);
  renderDayEntries();
  updateDayTotal(M.data.daily_limit);
}
function addDayIncomeEntry() {
  const sel = document.getElementById('dayIncomeTagSelect');
  const amtInput = document.getElementById('dayIncomeAmount');
  const amount = parseInt(amtInput.value) || 0;
  if (!sel.value || !amount) { showToast('Pick a source and enter amount',''); return; }
  const tag = allTags.find(t => t.id === sel.value);
  if (!tag) return;
  const existing = M.dayIncomeEntries.find(e => e.tag_id === tag.id);
  if (existing) { existing.amount += amount; }
  else { M.dayIncomeEntries.push({ tag_id: tag.id, name: tag.name, icon: tag.icon, color: tag.color, amount }); }
  amtInput.value = '';
  document.querySelectorAll('#dayIncomeAmtPresets .preset').forEach(b => b.classList.remove('active'));
  renderDayIncomeEntries();
  updateDayTotal(M.data.daily_limit);
}
function removeDayIncomeEntry(idx) {
  M.dayIncomeEntries.splice(idx, 1);
  renderDayIncomeEntries();
  updateDayTotal(M.data.daily_limit);
}
function renderDayEntries() {
  const el = document.getElementById('dayTagEntries');
  if (!M.dayEntries.length) {
    el.innerHTML = '<div style="color:var(--text4);font-size:13px;padding:6px 0;font-style:italic;">No entries yet — add categories below</div>';
    return;
  }
  el.innerHTML = M.dayEntries.map((e, i) => `
    <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--cream2);border-radius:var(--r2);border:1.5px solid var(--cream3);">
      <span style="font-size:16px">${e.icon}</span>
      <span style="flex:1;font-size:13px;font-weight:600;color:var(--text)">${e.name}</span>
      <span style="font-family:Fraunces,serif;font-size:15px;font-weight:700;color:var(--ink)">${e.amount.toLocaleString()} K</span>
      <button onclick="removeDayEntry(${i})" style="border:none;background:transparent;cursor:pointer;color:var(--text3);font-size:16px;padding:0 2px;">×</button>
    </div>`).join('');
}
function renderDayIncomeEntries() {
  const el = document.getElementById('dayIncomeEntries');
  if (!el) return;
  if (!M.dayIncomeEntries.length) {
    el.innerHTML = '<div style="color:var(--text4);font-size:13px;padding:6px 0;font-style:italic;">No income logged yet — add sources below</div>';
    return;
  }
  el.innerHTML = M.dayIncomeEntries.map((e, i) => `
    <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--sageL);border-radius:var(--r2);border:1.5px solid var(--cream3);">
      <span style="font-size:16px">${e.icon}</span>
      <span style="flex:1;font-size:13px;font-weight:600;color:var(--text)">${e.name}</span>
      <span style="font-family:Fraunces,serif;font-size:15px;font-weight:700;color:var(--sage)">+${e.amount.toLocaleString()} K</span>
      <button onclick="removeDayIncomeEntry(${i})" style="border:none;background:transparent;cursor:pointer;color:var(--text3);font-size:16px;padding:0 2px;">×</button>
    </div>`).join('');
}
function updateDayTotal(limit) {
  const total = M.dayEntries.reduce((s, e) => s + e.amount, 0);
  const incomeTotal = M.dayIncomeEntries.reduce((s, e) => s + e.amount, 0);
  document.getElementById('dayRunningTotal').textContent = total.toLocaleString() + ' K T';
  const incomeEl = document.getElementById('dayRunningIncomeTotal');
  if (incomeEl) incomeEl.textContent = incomeTotal.toLocaleString() + ' K T';
  const vl = document.getElementById('dayVsLimit');
  if (limit > 0) {
    vl.style.display = 'block';
    const over = total > limit;
    vl.style.background = over ? 'var(--coralL)' : 'var(--sageL)';
    vl.style.color = over ? 'var(--coral)' : 'var(--sage)';
    vl.textContent = 'Daily limit: ' + limit.toLocaleString() + ' K T — ' + (over ? '⚠️ Over by ' + (total - limit).toLocaleString() + ' K' : '✓ Within limit');
  } else { vl.style.display = 'none'; }
}
function setTagPreset(val) {
  document.getElementById('dayTagAmount').value = val;
  document.querySelectorAll('#dayAmtPresets .preset').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
}
function setIncomePreset(val) {
  document.getElementById('dayIncomeAmount').value = val;
  document.querySelectorAll('#dayIncomeAmtPresets .preset').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
}
async function saveDaySpend() {
  const total = M.dayEntries.reduce((s, e) => s + e.amount, 0);
  const incomeTotal = M.dayIncomeEntries.reduce((s, e) => s + e.amount, 0);
  await fetch('/api/budget/daily', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ month_key: M.viewMonth, day: M.editingDay, total, tags: M.dayEntries,
      income_total: incomeTotal, income: M.dayIncomeEntries }) });
  closeDayModal();
  await loadMonthData();
  showToast('Day saved ✓', 'success');
}

// ── Month data ────────────────────────────────────
async function initMoney() {
  await loadTags();
  await loadLoans();
  if (!M.viewMonth) {
    const r = await fetch('/api/budget/month');
    const d = await r.json();
    M.viewMonth = d.month_key;
    allTags = d.tags || [];
  }
  await loadMonthData();
}
async function loadMonthData() {
  const r = await fetch('/api/budget/month?month=' + M.viewMonth);
  M.data = await r.json();
  allTags = M.data.tags || allTags;
  allLoans = M.data.loans || allLoans;
  allReceivables = M.data.receivables || allReceivables;
  renderMoney();
}
async function changeMonth(delta) {
  const [jy, jm] = M.viewMonth.split('-').map(Number);
  let ny = jy, nm = jm + delta;
  if (nm > 12) { nm = 1; ny++; }
  if (nm < 1)  { nm = 12; ny--; }
  M.viewMonth = ny + '-' + String(nm).padStart(2,'0');
  await loadMonthData();
}
async function setBudget() {
  const val = parseInt(document.getElementById('budgetInput').value) || 0;
  await fetch('/api/budget/set', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ month_key: M.viewMonth, budget: val }) });
  await loadMonthData();
  showToast('Budget saved ✓', 'success');
}
async function addFixed() {
  const name = document.getElementById('fixedName').value.trim();
  const amount = parseInt(document.getElementById('fixedAmount').value) || 0;
  if (!name || !amount) { showToast('Enter a name and amount',''); return; }
  await fetch('/api/budget/fixed', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ month_key: M.viewMonth, action:'add', name, amount }) });
  document.getElementById('fixedName').value = '';
  document.getElementById('fixedAmount').value = '';
  await loadMonthData();
}
async function toggleFixed(id, mk) {
  await fetch('/api/budget/fixed', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ month_key: mk, action:'toggle', id }) });
  await loadMonthData();
}
async function deleteFixed(id, mk) {
  await fetch('/api/budget/fixed', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ month_key: mk, action:'delete', id }) });
  await loadMonthData();
}
async function postponeFixed(id, mk) {
  await fetch('/api/budget/fixed', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ month_key: mk, action:'postpone', id }) });
  await loadMonthData();
  showToast('Moved to next month ✓', 'success');
}

// ── Render ────────────────────────────────────────
function renderMoney() {
  const d = M.data;
  const app = document.getElementById('money-app');
  const monthName = J_MONTHS_EN[d.jm - 1];
  const spent_pct  = d.budget > 0 ? Math.min(100, (d.daily_spent + d.fixed_total) / d.budget * 100) : 0;
  const fixed_pct  = d.budget > 0 ? Math.min(100, d.fixed_total / d.budget * 100) : 0;
  const daily_pct  = d.budget > 0 ? Math.min(100, d.daily_spent / d.budget * 100) : 0;
  const over       = d.remaining < 0;
  const rColor     = over ? 'var(--coral)' : d.remaining < d.budget * 0.2 ? 'var(--amber)' : 'var(--sage)';
  const spending   = d.month.daily_spending || {};
  const daysWithData = Object.keys(spending).filter(k => {
    const v = spending[k]; return (typeof v === 'object' ? v.total : v) > 0;
  }).length;
  const avgDaily = daysWithData > 0 ? d.daily_spent / daysWithData : 0;
  const projTotal  = d.fixed_total + avgDaily * d.total_days;
  const projOver   = projTotal > d.budget && d.budget > 0;
  const incomeTotal = d.daily_income || 0;

  // Build tag totals for this month (expenses + income separately) + flat tx list
  const tagTotals = {};
  const incomeTagTotals = {};
  let txCount = 0;
  Object.values(spending).forEach(v => {
    const tags = typeof v === 'object' ? (v.tags || []) : [];
    tags.forEach(t => { tagTotals[t.name] = (tagTotals[t.name] || { amount: 0, color: t.color, icon: t.icon }); tagTotals[t.name].amount += t.amount; txCount++; });
    const incTags = typeof v === 'object' ? (v.income || []) : [];
    incTags.forEach(t => { incomeTagTotals[t.name] = (incomeTagTotals[t.name] || { amount: 0, color: t.color, icon: t.icon }); incomeTagTotals[t.name].amount += t.amount; txCount++; });
  });

  Object.values(M.charts).forEach(c => { try { c.destroy(); } catch(e){} });
  M.charts = {};

  app.innerHTML = `

  <!-- ═══ BALANCE ═══ -->
  <div class="mcard" style="margin-bottom:20px;">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">

      <div style="background:var(--cream2);border-radius:var(--r2);padding:16px 18px;border:1.5px solid var(--cream3);">
        <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px;">🏦 Bank Balance</div>
        <div style="font-family:Fraunces,serif;font-size:30px;font-weight:800;color:var(--ink);line-height:1;">${(d.bank_balance||0).toLocaleString()}<span style="font-size:13px;font-weight:600;color:var(--text3);"> K T</span></div>
        <div style="font-size:11px;color:var(--text4);margin-top:6px;">Budget + income − loans/fixed you've <b>ticked</b> − daily spending + owed money you've <b>collected</b></div>
      </div>

      <div style="background:${(d.actual_balance||0)>=0?'var(--sageL)':'var(--coralL)'};border-radius:var(--r2);padding:16px 18px;border:2px solid ${(d.actual_balance||0)>=0?'var(--sage)':'var(--coral)'};">
        <div style="font-size:10px;font-weight:700;color:${(d.actual_balance||0)>=0?'var(--sage)':'var(--coral)'};text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px;">📊 Actual Balance</div>
        <div style="font-family:Fraunces,serif;font-size:30px;font-weight:800;color:${(d.actual_balance||0)>=0?'var(--sage)':'var(--coral)'};line-height:1;">${(d.actual_balance||0).toLocaleString()}<span style="font-size:13px;font-weight:600;opacity:.7;"> K T</span></div>
        <div style="font-size:11px;color:var(--text4);margin-top:6px;">Budget + income − <b>all</b> loans/fixed (ticked or not) − daily spending + <b>all</b> owed money (collected or not)</div>
      </div>

    </div>

    <div style="font-size:12px;color:var(--text3);padding:10px 14px;background:var(--cream2);border-radius:var(--r2);display:flex;flex-wrap:wrap;gap:8px;align-items:center;line-height:2.2;">
      <span>Budget <b style="color:var(--ink)">${(d.budget||0).toLocaleString()} K</b></span>
      <span style="opacity:.4">+</span>
      <span>Income <b style="color:var(--sage)">${(d.daily_income||0).toLocaleString()} K</b></span>
      <span style="opacity:.4">−</span>
      <span>Loans/fixed (all) <b style="color:var(--plum)">${(d.fixed_total||0).toLocaleString()} K</b></span>
      <span style="opacity:.4">−</span>
      <span>Daily spent <b style="color:var(--coral)">${(d.daily_spent||0).toLocaleString()} K</b></span>
      <span style="opacity:.4">+</span>
      <span>Owed to you (all) <b style="color:var(--sky)">${(d.total_receivables||0).toLocaleString()} K</b></span>
      <span style="opacity:.4">=</span>
      <b style="color:${(d.actual_balance||0)>=0?'var(--sage)':'var(--coral)'};">Actual ${(d.actual_balance||0).toLocaleString()} K</b>
    </div>
    <div style="font-size:11px;color:var(--text4);padding:8px 14px 0;">💡 Tick a loan/fixed expense once it's actually paid — its amount moves out of Bank Balance, Actual Balance doesn't change. Same when owed money gets collected. To correct either number, adjust your <b>Monthly Budget</b> below.</div>
  </div>

  <div class="money-indicators">
    <div class="mindic">
      <div class="mindic-label">Remaining Budget</div>
      <div class="mindic-val" style="color:${rColor}">${Math.abs(d.remaining).toLocaleString()} K</div>
      <div class="mindic-sub">${over ? '⚠️ Over budget' : 'Tomans remaining'}</div>
      <div class="mindic-trend" style="color:${rColor}">${over ? '↑ Overspent' : '↓ On track'}</div>
    </div>
    <div class="mindic">
      <div class="mindic-label">Daily Limit</div>
      <div class="mindic-val" style="color:var(--sage)">${d.daily_limit > 0 ? d.daily_limit.toLocaleString() + ' K' : '—'}</div>
      <div class="mindic-sub">${d.days_left} days left</div>
      <div class="mindic-trend" style="color:var(--text3)">per day</div>
    </div>
    <div class="mindic">
      <div class="mindic-label">Avg Daily Spend</div>
      <div class="mindic-val" style="color:var(--amber)">${avgDaily > 0 ? Math.round(avgDaily).toLocaleString() + ' K' : '—'}</div>
      <div class="mindic-sub">${daysWithData} days logged</div>
      <div class="mindic-trend" style="color:${avgDaily > d.daily_limit && d.daily_limit > 0 ? 'var(--coral)' : 'var(--sage)'}">${avgDaily > d.daily_limit && d.daily_limit > 0 ? '⚠️ Above limit' : daysWithData > 0 ? '✓ Within limit' : 'No data yet'}</div>
    </div>
    <div class="mindic">
      <div class="mindic-label">Month Forecast</div>
      <div class="mindic-val" style="color:${projOver ? 'var(--coral)' : 'var(--sage)'}">${daysWithData > 0 ? Math.round(projTotal).toLocaleString() + ' K' : '—'}</div>
      <div class="mindic-sub">Budget: ${d.budget.toLocaleString()} K</div>
      <div class="mindic-trend" style="color:${projOver ? 'var(--coral)' : 'var(--sage)'}">${daysWithData > 0 ? (projOver ? '⚠️ Likely overspend' : '✓ Looking good') : 'Log days to forecast'}</div>
    </div>
    <div class="mindic">
      <div class="mindic-label">Income This Month</div>
      <div class="mindic-val" style="color:var(--sage)">${incomeTotal > 0 ? incomeTotal.toLocaleString() + ' K' : '—'}</div>
      <div class="mindic-sub">Added to remaining budget</div>
      <div class="mindic-trend" style="color:var(--sage)">${incomeTotal > 0 ? '💰 Logged' : 'No income yet'}</div>
    </div>
  </div>

  <div class="money-grid">
    <div class="money-left">
      <div class="mcard">
        <div class="month-nav">
          <button class="month-btn" onclick="changeMonth(-1)">‹</button>
          <div class="month-label">${monthName} ${d.jy}</div>
          <button class="month-btn" onclick="changeMonth(1)">›</button>
        </div>
        <div class="month-sub">${d.total_days} days · Day ${d.today_day || '—'}${d.is_current ? ' (today)' : ''}</div>
        <div class="budget-hero">
          <div class="budget-amount">${d.budget.toLocaleString()}</div>
          <div class="budget-unit">Monthly budget (K Tomans)</div>
        </div>
        <div class="budget-input-row">
          <input type="number" class="m-input" id="budgetInput" placeholder="Enter budget in K Tomans" value="${d.budget || ''}"/>
          <button class="m-btn" onclick="setBudget()">Save</button>
        </div>
      </div>

      <div class="mcard">
        <div class="mcard-title">Budget Breakdown <span>${Math.round(spent_pct)}% used</span></div>
        <div class="stat-rows">
          <div class="stat-row"><div class="stat-row-label">🔒 Fixed</div><div class="stat-row-val" style="color:var(--coral)">${d.fixed_total.toLocaleString()} K</div></div>
          <div class="stat-bar-wrap"><div class="stat-bar-fill" style="width:${fixed_pct}%;background:var(--coral)"></div></div>
          <div class="stat-row"><div class="stat-row-label">🛒 Daily spent</div><div class="stat-row-val" style="color:var(--amber)">${d.daily_spent.toLocaleString()} K</div></div>
          <div class="stat-bar-wrap"><div class="stat-bar-fill" style="width:${daily_pct}%;background:var(--amber)"></div></div>
          <div class="stat-row" style="background:${over?'var(--coralL)':'var(--sageL)'}">
            <div class="stat-row-label">${over?'⚠️':'✅'} Remaining</div>
            <div class="stat-row-val" style="color:${rColor}">${Math.abs(d.remaining).toLocaleString()} K ${over?'(over)':''}</div>
          </div>
          <div class="stat-bar-wrap"><div class="stat-bar-fill" style="width:${Math.max(0,100-spent_pct)}%;background:${rColor}"></div></div>
        </div>
      </div>

      <div class="mcard daily-limit-card">
        <div class="mcard-title">Suggested Daily Limit</div>
        <div class="daily-limit-num">${d.daily_limit > 0 ? d.daily_limit.toLocaleString() : '—'}</div>
        <div class="daily-limit-unit">K Tomans per day</div>
        <div class="daily-limit-sub">${d.days_left} days left · ${Math.max(0,d.remaining).toLocaleString()} K remaining</div>
      </div>

      <div class="mcard">
        <div class="mcard-title">Fixed Expenses <span>${d.month.fixed_expenses?.length||0} items · ${d.fixed_total.toLocaleString()} K</span></div>
        <div class="fixed-list" id="fixedList">${renderFixedList(d.month.fixed_expenses||[], d.month_key)}</div>
        <div class="fixed-add-row">
          <div class="fixed-add-inputs">
            <input type="text" class="m-input" id="fixedName" placeholder="e.g. Doctor, Oil change, Rent..."/>
            <input type="number" class="m-input" id="fixedAmount" placeholder="Amount (K T)"/>
          </div>
          <button class="m-btn sage" onclick="addFixed()" style="width:100%;padding:11px;">+ Add Fixed Expense</button>
        </div>
      </div>

      <div class="mcard">
        <div class="mcard-title">Loans <span>${allLoans.length} active · injected into fixed expenses</span></div>
        <div id="loanManagerList" style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;"></div>
        <div style="border-top:1.5px solid var(--cream2);padding-top:14px;display:flex;flex-direction:column;gap:10px;">
          <div style="display:grid;grid-template-columns:1fr 44px;gap:8px;">
            <input type="text" class="m-input" id="loanName" placeholder="Loan name (e.g. Car, Bank, Maskan)"/>
            <input type="text" class="m-input" id="loanIcon" placeholder="🏦" style="text-align:center;font-size:18px;padding:0;"/>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div>
              <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">Monthly Payment (K T)</div>
              <input type="number" class="m-input" id="loanMonthly" placeholder="e.g. 2000" style="width:100%;margin:0;"/>
            </div>
            <div>
              <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">Payment Day of Month</div>
              <input type="number" class="m-input" id="loanPayDay" placeholder="e.g. 15" min="1" max="31" style="width:100%;margin:0;"/>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div>
              <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">Start Month (YYYY-MM)</div>
              <input type="text" class="m-input" id="loanStartMonth" value="${d.month_key}" style="width:100%;margin:0;"/>
            </div>
            <div>
              <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">End Month (YYYY-MM)</div>
              <input type="text" class="m-input" id="loanEndMonth" placeholder="e.g. 1406-03" style="width:100%;margin:0;"/>
            </div>
          </div>
          <button class="m-btn sage" onclick="addLoan()" style="width:100%;padding:11px;">+ Add Loan</button>
        </div>
      </div>

      <!-- RECEIVABLES -->
      <div class="mcard">
        <div class="mcard-title">💸 Owed To You <span style="font-size:11px;color:var(--text3)">${allReceivables.filter(r=>!r.fully_paid).length} outstanding · ${(d.pending_receivables||0).toLocaleString()} K</span></div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:10px;padding:8px 10px;background:var(--skyL);border-radius:var(--r2);">💡 Money other people owe you. The full amount counts toward Actual Balance the moment you add it. Once you tick a payment as collected, that amount also starts counting toward Bank Balance.</div>
        <div id="receivablesList" style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;max-height:320px;overflow-y:auto;"></div>
        <div style="border-top:1.5px solid var(--cream2);padding-top:12px;display:flex;flex-direction:column;gap:8px;">
          <input type="text" class="m-input" id="recPerson" placeholder="Person's name" style="width:100%;margin:0;"/>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <input type="number" class="m-input" id="recAmount" placeholder="Amount (K T)" style="margin:0;"/>
            <input type="text" class="m-input" id="recNote" placeholder="Note / reason (optional)" style="margin:0;"/>
          </div>
          <button class="m-btn" onclick="addReceivable()" style="width:100%;padding:11px;">+ Add Owed Money</button>
        </div>
      </div>

      <div class="mcard">
        <div class="mcard-title">Expense Tags <span style="font-size:11px;color:var(--text3)">${expenseTags().length} tags</span></div>
        <div id="tagManagerList" style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;max-height:200px;overflow-y:auto;"></div>
        <div style="padding-top:12px;border-top:1.5px solid var(--cream2);">
          <div style="display:flex;flex-direction:column;gap:8px;">
            <input type="text" class="m-input" id="tagName" placeholder="Tag name (e.g. Groceries, Gas, Eating out)" style="width:100%;"/>
            <div style="display:flex;gap:8px;align-items:center;">
              <input type="text" class="m-input" id="tagIcon" placeholder="🏷️" style="width:64px;text-align:center;font-size:18px;flex-shrink:0;"/>
              <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text3);font-weight:600;white-space:nowrap;flex-shrink:0;">
                Color
                <input type="color" id="tagColor" value="#3a7a5a" style="width:36px;height:32px;border-radius:8px;border:1.5px solid var(--cream3);cursor:pointer;padding:2px;background:var(--cream2);flex-shrink:0;"/>
              </label>
              <button class="m-btn sage" onclick="addTag('expense')" style="flex:1;padding:9px 12px;white-space:nowrap;">+ Add Tag</button>
            </div>
          </div>
        </div>
      </div>

      <div class="mcard">
        <div class="mcard-title">Income Sources <span style="font-size:11px;color:var(--text3)">${incomeTags().length} sources</span></div>
        <div id="incomeTagManagerList" style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;max-height:200px;overflow-y:auto;"></div>
        <div style="padding-top:12px;border-top:1.5px solid var(--cream2);">
          <div style="display:flex;flex-direction:column;gap:8px;">
            <input type="text" class="m-input" id="incomeName" placeholder="Source name (e.g. Salary, Freelance, Gift)" style="width:100%;"/>
            <div style="display:flex;gap:8px;align-items:center;">
              <input type="text" class="m-input" id="incomeIcon" placeholder="💰" style="width:64px;text-align:center;font-size:18px;flex-shrink:0;"/>
              <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text3);font-weight:600;white-space:nowrap;flex-shrink:0;">
                Color
                <input type="color" id="incomeColor" value="#3a7a5a" style="width:36px;height:32px;border-radius:8px;border:1.5px solid var(--cream3);cursor:pointer;padding:2px;background:var(--cream2);flex-shrink:0;"/>
              </label>
              <button class="m-btn sage" onclick="addTag('income')" style="flex:1;padding:9px 12px;white-space:nowrap;">+ Add Source</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="money-right">
      <div class="mcard">
        <div class="mcard-title">Daily Spending Calendar <span style="color:var(--sage)">Click any day to log</span></div>
        ${renderDayGrid(d)}
      </div>

      ${Object.keys(tagTotals).length > 0 ? `
      <div class="mcard">
        <div class="mcard-title">Spending by Category <span>this month</span></div>
        <div style="display:flex;flex-direction:column;gap:7px;">
          ${Object.entries(tagTotals).sort((a,b)=>b[1].amount-a[1].amount).map(([name,t]) => `
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:15px">${t.icon}</span>
              <div style="flex:1">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                  <span style="font-size:12px;font-weight:600;color:var(--text)">${name}</span>
                  <span style="font-family:Fraunces,serif;font-size:13px;font-weight:700;color:var(--ink)">${t.amount.toLocaleString()} K</span>
                </div>
                <div style="height:5px;background:var(--cream3);border-radius:5px;overflow:hidden;">
                  <div style="height:100%;width:${Math.min(100,t.amount/d.daily_spent*100)}%;background:${t.color};border-radius:5px;"></div>
                </div>
              </div>
            </div>`).join('')}
        </div>
      </div>` : ''}

      ${Object.keys(incomeTagTotals).length > 0 ? `
      <div class="mcard">
        <div class="mcard-title">Income by Source <span>this month</span></div>
        <div style="display:flex;flex-direction:column;gap:7px;">
          ${Object.entries(incomeTagTotals).sort((a,b)=>b[1].amount-a[1].amount).map(([name,t]) => `
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:15px">${t.icon}</span>
              <div style="flex:1">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                  <span style="font-size:12px;font-weight:600;color:var(--text)">${name}</span>
                  <span style="font-family:Fraunces,serif;font-size:13px;font-weight:700;color:var(--sage)">+${t.amount.toLocaleString()} K</span>
                </div>
                <div style="height:5px;background:var(--cream3);border-radius:5px;overflow:hidden;">
                  <div style="height:100%;width:${Math.min(100,t.amount/incomeTotal*100)}%;background:${t.color};border-radius:5px;"></div>
                </div>
              </div>
            </div>`).join('')}
        </div>
      </div>` : ''}

      <div class="money-charts">
        <div class="mchart-card">
          <div class="mchart-title">Daily Spending</div>
          <div class="mchart-sub">Green = within limit · Red = over</div>
          <div class="mchart-wrap"><canvas id="mDailyChart"></canvas></div>
        </div>
        <div class="mchart-card">
          <div class="mchart-title">Budget Split</div>
          <div class="mchart-sub">Fixed · Daily · Remaining</div>
          <div class="mchart-wrap"><canvas id="mPieChart"></canvas></div>
        </div>
        ${Object.keys(tagTotals).length > 0 ? `
        <div class="mchart-card">
          <div class="mchart-title">Category Breakdown</div>
          <div class="mchart-sub">Total spending per tag this month</div>
          <div class="mchart-wrap"><canvas id="mTagChart"></canvas></div>
        </div>` : ''}
        <div class="mchart-card" style="${Object.keys(tagTotals).length > 0 ? '' : 'grid-column:1/-1'}">
          <div class="mchart-title">Limit vs Actual</div>
          <div class="mchart-sub">Day by day comparison</div>
          <div class="mchart-wrap"><canvas id="mCompareChart"></canvas></div>
        </div>
      </div>

      <div class="mcard" style="grid-column:1/-1">
        <div class="mcard-title">Transactions Explorer <span>${txCount} entries this month</span></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center;">
          <select class="builder-select" id="txTypeFilter" onchange="renderTransactions()" style="font-size:12px;flex:1;min-width:120px;">
            <option value="all">All types</option>
            <option value="expense">Expenses only</option>
            <option value="income">Income only</option>
            <option value="settled">Paid loans/fixed</option>
          </select>
          <select class="builder-select" id="txTagFilter" onchange="renderTransactions()" style="font-size:12px;flex:2;min-width:140px;">
            <option value="all">All tags</option>
            ${allTags.map(t=>`<option value="${t.id}">${t.icon} ${t.name}</option>`).join('')}
          </select>
          <select class="builder-select" id="txSort" onchange="renderTransactions()" style="font-size:12px;flex:1;min-width:120px;">
            <option value="date_desc">Date ↓</option>
            <option value="date_asc">Date ↑</option>
            <option value="amount_desc">Amount ↓</option>
            <option value="amount_asc">Amount ↑</option>
          </select>
        </div>
        <div id="txList" style="display:flex;flex-direction:column;gap:5px;max-height:400px;overflow-y:auto;"></div>
        <div id="txSummaryRow" style="margin-top:10px;font-size:12px;color:var(--text3);text-align:right;"></div>
      </div>

    </div>
  </div>`;

  renderTagManager();
  renderLoanList();
  renderReceivables();
  renderTransactions();

  setTimeout(() => {
    const gc = 'rgba(26,21,16,0.05)', tc = '#a8967c';
    const days = Array.from({length: d.today_day || d.total_days}, (_, i) => i + 1);
    const amounts = days.map(day => {
      const v = spending[String(day)];
      return v ? (typeof v === 'object' ? v.total : v) : 0;
    });
    const limitArr = days.map(() => d.daily_limit);
    const baseOpts = { responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{ x:{ grid:{color:gc}, ticks:{color:tc,maxTicksLimit:12} }, y:{ grid:{color:gc}, ticks:{color:tc} } }};

    const c1 = document.getElementById('mDailyChart');
    if (c1) M.charts.daily = new Chart(c1, { type:'bar', data:{ labels:days, datasets:[
      { label:'Spent', data:amounts, backgroundColor:amounts.map(a=>a>d.daily_limit&&d.daily_limit>0?'rgba(232,93,58,.75)':'rgba(58,122,90,.65)'), borderRadius:4 },
      { label:'Limit', data:limitArr, type:'line', borderColor:'var(--coral)', borderDash:[4,3], borderWidth:1.5, pointRadius:0, fill:false },
    ]}, options: Object.assign({}, baseOpts, {plugins:{legend:{display:true,labels:{color:'#6b5c48',boxWidth:10,font:{size:11}}}}})});

    const c2 = document.getElementById('mPieChart');
    if (c2) M.charts.pie = new Chart(c2, { type:'doughnut', data:{
      labels:['Fixed','Daily','Remaining'],
      datasets:[{data:[d.fixed_total,d.daily_spent,Math.max(0,d.remaining)],
        backgroundColor:['rgba(232,93,58,.8)','rgba(212,130,26,.8)','rgba(58,122,90,.8)'],borderWidth:0,hoverOffset:6}]},
      options:{responsive:true,maintainAspectRatio:false,cutout:'62%',
        plugins:{legend:{position:'bottom',labels:{color:'#6b5c48',font:{size:11},padding:10,boxWidth:10}}}}});

    const tagNames = Object.keys(tagTotals);
    if (tagNames.length) {
      const c3 = document.getElementById('mTagChart');
      if (c3) M.charts.tag = new Chart(c3, { type:'doughnut', data:{
        labels: tagNames.map(n => tagTotals[n].icon + ' ' + n),
        datasets:[{data: tagNames.map(n=>tagTotals[n].amount),
          backgroundColor: tagNames.map(n=>tagTotals[n].color+'cc'),borderWidth:0,hoverOffset:6}]},
        options:{responsive:true,maintainAspectRatio:false,cutout:'58%',
          plugins:{legend:{position:'bottom',labels:{color:'#6b5c48',font:{size:11},padding:8,boxWidth:10}}}}});
    }

    const c4 = document.getElementById('mCompareChart');
    if (c4) M.charts.compare = new Chart(c4, { type:'bar', data:{ labels:days, datasets:[
      { label:'Actual', data:amounts, backgroundColor:'rgba(42,106,154,.6)', borderRadius:3 },
      { label:'Limit', data:limitArr, type:'line', borderColor:'var(--coral)', borderWidth:1.5, pointRadius:0, fill:false, borderDash:[4,3] }
    ]}, options: Object.assign({}, baseOpts, {plugins:{legend:{display:true,labels:{color:'#6b5c48',boxWidth:10,font:{size:11}}}}})});

  }, 80);
}

function renderFixedList(items, mk) {
  if (!items.length) return '<div style="color:var(--text4);font-size:13px;padding:12px;text-align:center;font-style:italic;">No fixed expenses yet</div>';
  return items.map(e => e.is_loan ? `
    <div class="fixed-item ${e.checked?'checked':''}" style="opacity:.95;">
      <div class="fixed-cb ${e.checked?'checked':''}" onclick="toggleFixed('${e.id}','${mk}')" title="${e.checked?'Mark as unpaid':'Mark as paid — moves money out of Bank Balance'}" style="${e.checked?'':'background:var(--plumL);color:var(--plum);border-color:var(--plum);'}">${e.checked?'✓':'🏦'}</div>
      <div class="fixed-name">${e.name}<span style="font-size:10px;background:var(--plumL);color:var(--plum);padding:2px 6px;border-radius:50px;margin-left:6px;font-weight:700;">loan</span></div>
      <div class="fixed-amount">${e.amount.toLocaleString()} K</div>
      <button class="fixed-postpone" title="Manage in Loans section" onclick="showToast('Edit this in the Loans section below ↓','')" style="opacity:.4;cursor:default;">→</button>
      <button class="fixed-del" onclick="showToast('Delete the loan in the Loans section to remove this','')" style="opacity:.4;cursor:default;">×</button>
    </div>` : `
    <div class="fixed-item ${e.checked?'checked':''}">
      <div class="fixed-cb ${e.checked?'checked':''}" onclick="toggleFixed('${e.id}','${mk}')" title="${e.checked?'Mark as unpaid':'Mark as paid — moves money out of Bank Balance'}">${e.checked?'✓':''}</div>
      <div class="fixed-name">${e.name}${e.postponed_from?'<span style="font-size:10px;background:var(--amberL);color:var(--amber);padding:2px 6px;border-radius:50px;margin-left:6px;font-weight:700;">↩ postponed</span>':''}</div>
      <div class="fixed-amount">${e.amount.toLocaleString()} K</div>
      <button class="fixed-postpone" title="Move to next month" onclick="postponeFixed('${e.id}','${mk}')">→</button>
      <button class="fixed-del" onclick="deleteFixed('${e.id}','${mk}')">×</button>
    </div>`).join('');
}

function renderDayGrid(d) {
  const spending = d.month.daily_spending || {};
  const firstDow = d.first_dow;
  const dows = ['Sat','Sun','Mon','Tue','Wed','Thu','Fri'];
  // Collect loan payment days active this month
  const loanDays = {};
  allLoans.forEach(l => {
    const s = monthIndexJs(l.start_month), e = monthIndexJs(l.end_month), c = monthIndexJs(d.month_key || M.viewMonth);
    if (c >= s && c <= e) {
      const day = l.pay_day || 1;
      if (!loanDays[day]) loanDays[day] = [];
      loanDays[day].push(l);
    }
  });
  let html = '<div class="days-grid">';
  dows.forEach(w => { html += '<div class="dow-header">' + w + '</div>'; });
  for (let i = 0; i < firstDow; i++) html += '<div class="day-cell empty-pad"></div>';
  for (let day = 1; day <= d.total_days; day++) {
    const isFuture = d.is_current ? day > d.today_day : false;
    const isToday  = d.is_current && day === d.today_day;
    const raw = spending[String(day)];
    const amt = raw ? (typeof raw === 'object' ? raw.total : raw) : 0;
    const inc = raw && typeof raw === 'object' ? (raw.income_total || 0) : 0;
    const settledList = raw && typeof raw === 'object' ? (raw.fixed_payments || []) : [];
    const hasData = amt > 0 || inc > 0 || settledList.length > 0;
    const loans = loanDays[day] || [];
    const cls = 'day-cell'+(isToday?' today':'')+(hasData?' has-data':'')+(isFuture?' future':'');
    const click = isFuture ? '' : 'openDayModal('+day+')';
    const loanDot = loans.length ? `<div style="display:flex;gap:2px;justify-content:center;flex-wrap:wrap;margin-top:2px;">${loans.map(l=>`<span title="${l.name} · ${l.monthly_payment.toLocaleString()} K" style="font-size:9px;background:var(--plumL);color:var(--plum);border-radius:50px;padding:1px 4px;font-weight:700;line-height:1.4;">${l.icon}</span>`).join('')}</div>` : '';
    const settledDot = settledList.length ? `<div title="${settledList.map(s=>s.name+' paid').join(' · ')}" style="font-size:9px;color:var(--plum);margin-top:2px;font-weight:700;">🔒 ${settledList.length}</div>` : '';
    html += '<div class="'+cls+'" onclick="'+click+'"><div class="day-num">'+day+'</div>'
      + (amt>0?'<div class="day-spend">'+amt.toLocaleString()+' K</div>':'')
      + (inc>0?'<div class="day-spend" style="color:var(--sage)">+'+inc.toLocaleString()+' K</div>':'')
      + loanDot
      + settledDot
      + '</div>';
  }
  return html + '</div>';
}



function toggleFoodHistDay(el) {
  const body = el.nextElementSibling;
  if (body) body.style.display = body.style.display === 'none' ? 'block' : 'none';
}

function buildFullHistory(fullLog) {
  const MEAL_DEFS = {
    breakfast: { label:'Breakfast', icon:'🌅' },
    lunch:     { label:'Lunch',     icon:'☀️' },
    dinner:    { label:'Dinner',    icon:'🌙' },
    snacks:    { label:'Snacks',    icon:'🍎' }
  };

  const rows = fullLog.map(d => {
    // Build meal detail rows
    const mealHTML = (d.meals || []).map(meal => {
      const items = meal.items || [];
      if (!items.length) return '';
      const mDef = MEAL_DEFS[meal.meal_id] || { label: meal.meal_id, icon: '🍽️' };
      const itemRows = items.map(item =>
        '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:#fff;' +
        'border-radius:8px;border:1px solid var(--cream3);margin-bottom:3px;">' +
        '<span style="font-size:15px">' + item.icon + '</span>' +
        '<span style="font-size:12px;font-weight:600;flex:1;color:var(--text)">' + item.name + '</span>' +
        '<span style="font-size:11px;color:var(--text3);font-family:JetBrains Mono,monospace">' + item.qty + ' ' + item.unit + '</span>' +
        (item.note ? '<span style="font-size:10px;color:var(--text4);font-style:italic;margin-left:4px">' + item.note + '</span>' : '') +
        '</div>'
      ).join('');
      return '<div style="margin-top:10px;">' +
        '<div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;' +
        'letter-spacing:.07em;margin-bottom:5px;">' + mDef.icon + ' ' + mDef.label + '</div>' +
        itemRows + '</div>';
    }).join('');

    const hasMeals = mealHTML.length > 0;
    const macroSection =
      '<div style="display:flex;gap:12px;align-items:center;">' +
      (d.calories ? '<span style="font-size:13px;font-weight:700;color:var(--amber)">' + d.calories + ' kcal</span>' : '') +
      (d.protein  ? '<span style="font-size:13px;font-weight:700;color:var(--sage)">' + d.protein + 'g prot</span>' : '') +
      (hasMeals   ? '<span style="color:var(--text4);font-size:13px;margin-left:2px">&#9662;</span>' : '') +
      '</div>';

    const notesHTML = d.notes ?
      '<div style="margin-top:8px;font-size:12px;color:var(--text3);font-style:italic;' +
      'padding:6px 8px;background:var(--cream2);border-radius:6px;">📝 ' + d.notes + '</div>' : '';

    return '<div style="background:#fff;border-radius:var(--r2);border:1.5px solid var(--cream3);overflow:hidden;margin-bottom:4px;">' +
      '<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;' +
      (hasMeals ? 'cursor:pointer;" onclick="toggleFoodHistDay(this)"' : '"') + '>' +
      '<div style="font-family:Fraunces,serif;font-size:15px;font-weight:700;color:var(--ink);flex:1">' +
        (d.jalali_label || d.date) + '</div>' +
      macroSection +
      '</div>' +
      (hasMeals ?
        '<div style="padding:0 14px 12px;border-top:1.5px solid var(--cream2);display:none;">' +
        mealHTML + notesHTML + '</div>' : '') +
      '</div>';
  }).join('');

  return '<div class="mcard">' +
    '<div class="mcard-title">Full History <span>' + fullLog.length + ' days</span></div>' +
    '<div style="display:flex;flex-direction:column;max-height:600px;overflow-y:auto;">' +
    rows + '</div></div>';
}

