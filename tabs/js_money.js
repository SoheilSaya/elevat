// ─── MONEY / BUDGET MODULE ────────────────────────

const J_MONTHS_EN = ['Farvardin','Ordibehesht','Khordad','Tir','Mordad','Shahrivar','Mehr','Aban','Azar','Dey','Bahman','Esfand'];
let M = { data: null, viewMonth: null, editingDay: null, charts: {}, dayEntries: [], dayIncomeEntries: [] };
let allLoans = [];
let allReceivables = [];

// ── Notes on records ─────────────────────────────
function escHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function noteHtml(note, size) {
  if (!note) return '';
  return `<div style="margin-top:5px;"><span dir="auto" style="display:inline-block;max-width:100%;font-size:${size||13}px;font-weight:500;color:var(--text);background:rgba(26,21,16,0.07);border-radius:8px;padding:4px 10px;line-height:1.6;word-break:break-word;unicode-bidi:plaintext;">📝 ${escHtml(note)}</span></div>`;
}
// The day-modal markup lives in index.html, so the note fields are injected here
// (once) right above the "tag + amount + Add" row of each section.
function ensureNoteInputs() {
  const defs = [
    { amt:'dayTagAmount',    sel:'dayTagSelect',       list:'dayTagEntries',    id:'dayTagNote',    add:'addDayTagEntry',    ph:'📝 Note (optional) — e.g. water bill, pizza & soda…' },
    { amt:'dayIncomeAmount', sel:'dayIncomeTagSelect', list:'dayIncomeEntries', id:'dayIncomeNote', add:'addDayIncomeEntry', ph:'📝 Note (optional) — e.g. salary from X, sold old phone…' },
  ];
  defs.forEach(def => {
    if (document.getElementById(def.id)) return;
    const amtEl = document.getElementById(def.amt);
    if (!amtEl) return;
    const selEl = document.getElementById(def.sel);
    const listEl = document.getElementById(def.list);
    let row = amtEl.parentElement;
    while (row && selEl && !row.contains(selEl)) row = row.parentElement;
    // never climb up into a container that also holds the entries list / the whole modal
    if (!row || (listEl && row.contains(listEl))) row = amtEl.parentElement;
    const input = document.createElement('input');
    input.type = 'text';
    input.id = def.id;
    input.className = 'm-input';
    input.maxLength = 200;
    input.placeholder = def.ph;
    input.setAttribute('dir', 'auto');
    input.style.cssText = 'width:100%;margin:0 0 8px 0;box-sizing:border-box;';
    input.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); window[def.add](); } });
    row.parentNode.insertBefore(input, row);
    amtEl.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); window[def.add](); } });
  });
}
function editDayEntryNote(kind, idx) {
  const arr = kind === 'income' ? M.dayIncomeEntries : M.dayEntries;
  const e = arr[idx];
  if (!e) return;
  const val = prompt('Note for "' + e.name + '" (' + e.amount.toLocaleString() + ' K):', e.note || '');
  if (val === null) return;
  e.note = val.trim().slice(0, 200);
  if (kind === 'income') renderDayIncomeEntries(); else renderDayEntries();
}

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

// ══ MONEY ANALYZER — history, stats & "where did my money go" ══════════
const AN_DOW = ['Sat','Sun','Mon','Tue','Wed','Thu','Fri'];
const AN_DOW_FULL = ['Saturday','Sunday','Monday','Tuesday','Wednesday','Thursday','Friday'];
const AN_STOP = new Set(['و','در','به','از','با','برای','که','این','آن','را','یه','یک','تا','هم','رو','the','a','an','of','for','and','to','in','on','at','with','from','my','is']);
const AN_SPLIT = /[\s,.;:!?()\[\]{}"'«»،؛؟\-_\/\\+&*=#@|]+/;
const AN_DEFAULT = { range:'month', type:'all', tag:'all', q:'', min:'', max:'', sort:'date_desc', group:'day' };
let A = { f:{...AN_DEFAULT}, cache:{}, charts:{}, limit:200, seq:0, rows:[], words:[], timer:null, uid:{}, edit:null };

function anFmt(n) { return Math.round(n || 0).toLocaleString(); }
function anShiftMonth(mk, delta) {
  const [y, m] = mk.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return Math.floor(idx / 12) + '-' + String(idx % 12 + 1).padStart(2, '0');
}
function anRangeMonths() {
  const cur = M.viewMonth, r = A.f.range;
  if (r === '3m') return [0,1,2].map(i => anShiftMonth(cur, -i));
  if (r === '6m') return [0,1,2,3,4,5].map(i => anShiftMonth(cur, -i));
  if (r === 'all') return [...new Set([...(M.data.available_months || []), cur])];
  return [cur];
}
async function anEnsureMonths(mks) {
  const missing = mks.filter(mk => !A.cache[mk]);
  await Promise.all(missing.map(async mk => {
    try { const r = await fetch('/api/budget/month?month=' + mk); A.cache[mk] = await r.json(); } catch (e) {}
  }));
}

// every expense / income / paid-fixed item of the given months as one flat list
function anFlatten(mks) {
  const rows = [];
  mks.forEach(mk => {
    const d = A.cache[mk];
    if (!d || !d.month) return;
    const first = d.first_dow || 0;
    Object.entries(d.month.daily_spending || {}).forEach(([ds, v]) => {
      const day = parseInt(ds);
      const base = { mk, jy: d.jy, jm: d.jm, day, dow: (first + day - 1) % 7, key: d.jy * 10000 + d.jm * 100 + day };
      if (v && typeof v === 'object') {
        (v.tags || []).forEach((t, i) => rows.push({ ...base, idx:i, uid:mk + '|' + day + '|expense|' + i, type:'expense', tag_id:t.tag_id, name:t.name, icon:t.icon, color:t.color, amount:+t.amount || 0, note:t.note || '' }));
        (v.income || []).forEach((t, i) => rows.push({ ...base, idx:i, uid:mk + '|' + day + '|income|' + i, type:'income', tag_id:t.tag_id, name:t.name, icon:t.icon, color:t.color, amount:+t.amount || 0, note:t.note || '' }));
        (v.fixed_payments || []).forEach(t => rows.push({ ...base, type:'settled', tag_id:'__settled__', name:t.name, icon:t.icon, color:'#6c63ff', amount:+t.amount || 0, note:'', kind:t.kind }));
      } else if (v > 0) {
        rows.push({ ...base, idx:0, uid:mk + '|' + day + '|expense|0', type:'expense', tag_id:'__legacy__', name:'Other', icon:'💰', color:'#a8967c', amount:v, note:'' });
      }
    });
  });
  return rows;
}
function anFilter(rows) {
  const f = A.f, q = f.q.trim().toLowerCase();
  const mn = f.min === '' ? null : +f.min, mx = f.max === '' ? null : +f.max;
  return rows.filter(r =>
    (f.type === 'all' || r.type === f.type) &&
    (f.tag === 'all' || r.tag_id === f.tag || (f.tag === '__legacy__' && r.tag_id === '__untagged__')) &&
    (mn === null || r.amount >= mn) && (mx === null || r.amount <= mx) &&
    (!q || ((r.note || '') + ' ' + (r.name || '')).toLowerCase().includes(q)));
}
function anStats(rows) {
  const exp = rows.filter(r => r.type === 'expense');
  const inc = rows.filter(r => r.type === 'income');
  const settled = rows.filter(r => r.type === 'settled');
  const sum = a => a.reduce((s, r) => s + r.amount, 0);
  const byTag = {}, byIncTag = {}, byDay = {}, byDow = [0,0,0,0,0,0,0], byMonth = {};
  const bump = (map, r) => {
    const o = map[r.tag_id || r.name] || (map[r.tag_id || r.name] = { id:r.tag_id, name:r.name, icon:r.icon, color:r.color, total:0, count:0 });
    o.total += r.amount; o.count++;
  };
  exp.forEach(r => {
    bump(byTag, r);
    const d = byDay[r.key] || (byDay[r.key] = { key:r.key, jm:r.jm, day:r.day, dow:r.dow, total:0 });
    d.total += r.amount;
    byDow[r.dow] += r.amount;
    (byMonth[r.mk] = byMonth[r.mk] || { exp:0, inc:0 }).exp += r.amount;
  });
  inc.forEach(r => { bump(byIncTag, r); (byMonth[r.mk] = byMonth[r.mk] || { exp:0, inc:0 }).inc += r.amount; });
  const byTotal = (a, b) => b.total - a.total;
  return {
    exp, inc, settled,
    expTotal: sum(exp), incTotal: sum(inc), settledTotal: sum(settled),
    tags: Object.values(byTag).sort(byTotal), incTags: Object.values(byIncTag).sort(byTotal),
    byTag, days: Object.values(byDay).sort(byTotal), byDay, byDow, byMonth,
    biggest: exp.reduce((m, r) => (!m || r.amount > m.amount) ? r : m, null),
    withNote: exp.filter(r => r.note).length,
  };
}
function anWords(rows) {
  const map = {};
  rows.filter(r => r.note && r.type !== 'settled').forEach(r => {
    const seen = new Set();
    r.note.toLowerCase().split(AN_SPLIT).forEach(w => {
      if (w.length < 2 || /^[\d٠-٩۰-۹.,]+$/.test(w) || AN_STOP.has(w) || seen.has(w)) return;
      seen.add(w);
      const o = map[w] || (map[w] = { w, count:0, exp:0, inc:0 });
      o.count++;
      if (r.type === 'expense') o.exp += r.amount; else o.inc += r.amount;
    });
  });
  return Object.values(map).sort((a, b) => (b.exp + b.inc) - (a.exp + a.inc) || b.count - a.count).slice(0, 16);
}

// ── HTML pieces ───────────────────────────────────
function anSection(title, sub) {
  return `<div style="margin:22px 0 10px;"><div style="font-size:12px;font-weight:800;color:var(--text);text-transform:uppercase;letter-spacing:.07em;">${title}</div>${sub ? `<div style="font-size:11px;color:var(--text3);margin-top:2px;">${sub}</div>` : ''}</div>`;
}
function anTile(label, val, sub, color) {
  return `<div style="background:var(--cream2);border:1.5px solid var(--cream3);border-radius:var(--r2);padding:12px 14px;">
    <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;">${label}</div>
    <div style="font-family:Fraunces,serif;font-size:21px;font-weight:800;color:${color || 'var(--ink)'};line-height:1.1;">${val}</div>
    ${sub ? `<div style="font-size:11px;color:var(--text3);margin-top:5px;line-height:1.4;">${sub}</div>` : ''}</div>`;
}
function anRow(r, showDate, dLabel) {
  const inc = r.type === 'income', st = r.type === 'settled';
  const amtColor = inc ? 'var(--sage)' : st ? 'var(--plum)' : 'var(--ink)';
  return `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:${inc ? 'var(--sageL)' : 'var(--cream2)'};border-radius:var(--r2);border:1.5px solid ${st ? 'var(--plum)' : 'var(--cream3)'};">
    <span style="font-size:17px;line-height:1.3;">${r.icon}</span>
    <div style="flex:1;min-width:0;">
      <div style="font-size:13.5px;font-weight:700;color:var(--text);">${escHtml(r.name)}</div>
      ${noteHtml(r.note)}
    </div>
    ${showDate ? `<span style="font-size:11px;color:var(--text3);white-space:nowrap;padding-top:3px;">${dLabel(r)}</span>` : ''}
    <span style="font-family:Fraunces,serif;font-size:14px;font-weight:700;color:${amtColor};white-space:nowrap;">${inc ? '+' : ''}${anFmt(r.amount)} K</span>
    <span style="font-size:10px;padding:2px 7px;border-radius:50px;background:${inc ? 'var(--sage)' : st ? 'var(--plum)' : 'var(--text3)'};color:#fff;font-weight:700;margin-top:2px;">${st ? 'paid ' + (r.kind || '') : r.type}</span>
    ${r.uid ? `<span style="display:flex;gap:0;flex-shrink:0;"><button onclick="anEdit('${r.uid}')" title="Edit note / amount / category / day" style="border:none;background:transparent;cursor:pointer;font-size:15px;padding:0 5px;line-height:1.5;">✏️</button><button onclick="anDelete('${r.uid}')" title="Delete this record" style="border:none;background:transparent;cursor:pointer;font-size:15px;padding:0 5px;line-height:1.5;">🗑️</button></span>` : ''}
  </div>`;
}
function anTagBars(list, total, isIncome, prevByTag) {
  return `<div style="display:flex;flex-direction:column;gap:6px;">` + list.map(t => {
    const pct = total > 0 ? t.total / total * 100 : 0;
    const active = A.f.tag === t.id;
    let delta = '';
    if (prevByTag) {
      const p = prevByTag[t.id || t.name];
      if (p && p.total > 0) {
        const d = t.total - p.total, dp = Math.round(d / p.total * 100);
        if (dp !== 0) delta = `<span style="font-size:11px;font-weight:700;color:${(d > 0) !== isIncome ? 'var(--coral)' : 'var(--sage)'};">${d > 0 ? '▲' : '▼'} ${Math.abs(dp)}% vs last month</span>`;
      } else delta = `<span style="font-size:11px;font-weight:700;color:var(--text3);">new this month</span>`;
    }
    return `<div onclick="anSet('tag','${t.id}')" title="Click to filter by this" style="cursor:pointer;padding:9px 12px;border-radius:var(--r2);border:1.5px solid ${active ? 'var(--ink)' : 'var(--cream3)'};background:${isIncome ? 'var(--sageL)' : 'var(--cream2)'};">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
        <span style="font-size:16px;">${t.icon}</span>
        <span style="flex:1;font-size:13px;font-weight:700;color:var(--text);">${escHtml(t.name)}</span>
        <span style="font-family:Fraunces,serif;font-size:14px;font-weight:700;color:${isIncome ? 'var(--sage)' : 'var(--ink)'};">${isIncome ? '+' : ''}${anFmt(t.total)} K</span>
        <span style="font-size:12px;font-weight:700;color:var(--text3);min-width:40px;text-align:right;">${Math.round(pct)}%</span>
      </div>
      <div style="height:6px;background:var(--cream3);border-radius:6px;overflow:hidden;"><div style="height:100%;width:${Math.max(2, pct)}%;background:${t.color};border-radius:6px;"></div></div>
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:5px;font-size:11px;color:var(--text3);">
        <span>${t.count} entr${t.count === 1 ? 'y' : 'ies'} · avg ${anFmt(t.total / t.count)} K each</span>${delta}
      </div>
    </div>`;
  }).join('') + `</div>`;
}
function anRangeChips() {
  const chips = [['month','This month'],['3m','Last 3 months'],['6m','Last 6 months'],['all','All time']];
  return chips.map(([k, label]) => {
    const on = A.f.range === k;
    return `<button onclick="anSetRange('${k}')" style="padding:7px 14px;border-radius:50px;border:1.5px solid ${on ? 'var(--ink)' : 'var(--cream3)'};background:${on ? 'var(--ink)' : 'var(--cream2)'};color:${on ? '#fff' : 'var(--text)'};font-size:12px;font-weight:700;cursor:pointer;">${label}</button>`;
  }).join('');
}
function anControlsHtml() {
  const f = A.f, sel = (a, b) => a === b ? ' selected' : '';
  const tagOpts = allTags.map(t => `<option value="${t.id}"${sel(t.id, f.tag)}>${t.icon} ${escHtml(t.name)}${t.type === 'income' ? ' (income)' : ''}</option>`).join('');
  const st = 'font-size:12px;';
  return `
  <div id="anRangeRow" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">${anRangeChips()}</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;align-items:center;">
    <input type="text" id="anQ" class="m-input" dir="auto" value="${escHtml(f.q)}" oninput="anSetDeb('q',this.value)" placeholder="🔍 Search notes or tag names…" style="flex:3;min-width:200px;margin:0;font-size:13px;"/>
    <select class="builder-select" id="anType" onchange="anSet('type',this.value)" style="${st}flex:1;min-width:120px;">
      <option value="all"${sel('all', f.type)}>All types</option><option value="expense"${sel('expense', f.type)}>Expenses</option>
      <option value="income"${sel('income', f.type)}>Income</option><option value="settled"${sel('settled', f.type)}>Paid loans/fixed</option>
    </select>
    <select class="builder-select" id="anTag" onchange="anSet('tag',this.value)" style="${st}flex:2;min-width:140px;">
      <option value="all"${sel('all', f.tag)}>All tags</option>${tagOpts}<option value="__legacy__"${sel('__legacy__', f.tag)}>💰 Other (old entries)</option>
    </select>
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px;align-items:center;">
    <input type="number" id="anMin" class="m-input" value="${escHtml(f.min)}" oninput="anSetDeb('min',this.value)" placeholder="Min (K T)" style="width:110px;margin:0;${st}"/>
    <input type="number" id="anMax" class="m-input" value="${escHtml(f.max)}" oninput="anSetDeb('max',this.value)" placeholder="Max (K T)" style="width:110px;margin:0;${st}"/>
    <select class="builder-select" id="anSort" onchange="anSet('sort',this.value)" style="${st}flex:1;min-width:130px;">
      <option value="date_desc"${sel('date_desc', f.sort)}>Newest first</option><option value="date_asc"${sel('date_asc', f.sort)}>Oldest first</option>
      <option value="amount_desc"${sel('amount_desc', f.sort)}>Biggest amount</option><option value="amount_asc"${sel('amount_asc', f.sort)}>Smallest amount</option>
    </select>
    <select class="builder-select" id="anGroup" onchange="anSet('group',this.value)" style="${st}flex:1;min-width:130px;">
      <option value="day"${sel('day', f.group)}>Group by day</option><option value="tag"${sel('tag', f.group)}>Group by tag</option>
      <option value="month"${sel('month', f.group)}>Group by month</option><option value="none"${sel('none', f.group)}>No grouping</option>
    </select>
    <button class="m-btn" onclick="anReset()" style="padding:8px 12px;font-size:12px;">Reset filters</button>
    <button class="m-btn sage" onclick="anExportCsv()" style="padding:8px 12px;font-size:12px;">⬇ Export CSV</button>
  </div>`;
}

// Pure builder: returns the results HTML + data for the charts
function anBuild(all, rows, mks, prevByTag) {
  const st = anStats(rows);
  const multiYear = new Set(rows.map(r => r.jy)).size > 1;
  const dLabel = r => J_MONTHS_EN[r.jm - 1] + ' ' + r.day + (multiYear ? ' ' + r.jy : '');
  const f = A.f;

  // ── insights in plain words
  const ins = [];
  if (st.tags.length) { const t = st.tags[0]; ins.push(`Biggest drain: <b>${t.icon} ${escHtml(t.name)}</b> — ${anFmt(t.total)} K (${Math.round(t.total / st.expTotal * 100)}% of expenses, ${t.count} entries).`); }
  if (st.biggest) { const b = st.biggest; ins.push(`Biggest single expense: <b>${anFmt(b.amount)} K</b> on ${escHtml(b.name)}${b.note ? ' — “' + escHtml(b.note) + '”' : ''} (${dLabel(b)}).`); }
  if (st.days.length) { const d = st.days[0]; ins.push(`Most expensive day: <b>${J_MONTHS_EN[d.jm - 1]} ${d.day}</b> (${AN_DOW_FULL[d.dow]}) — ${anFmt(d.total)} K.`); }
  if (st.expTotal > 0) { const mx = Math.max(...st.byDow), i = st.byDow.indexOf(mx); ins.push(`You spend the most on <b>${AN_DOW_FULL[i]}s</b> — ${anFmt(mx)} K in total.`); }
  if (st.incTotal > 0 && st.expTotal > 0) ins.push(`You spent <b>${Math.round(st.expTotal / st.incTotal * 100)}%</b> of the income logged in this period.`);
  if (st.exp.length) { const p = Math.round(st.withNote / st.exp.length * 100); ins.push(`<b>${st.withNote}</b> of ${st.exp.length} expenses have a note (${p}%)${p < 60 ? ' — the more notes you add, the better this page explains itself' : ''}.`); }

  const net = st.incTotal - st.expTotal;
  const activeDays = st.days.length;
  const words = anWords(rows);
  const sortFn = {
    date_desc: (a, b) => b.key - a.key, date_asc: (a, b) => a.key - b.key,
    amount_desc: (a, b) => b.amount - a.amount, amount_asc: (a, b) => a.amount - b.amount,
  }[f.sort] || ((a, b) => b.key - a.key);
  const sorted = rows.slice().sort(sortFn);
  const shown = sorted.slice(0, A.limit);

  // ── grouping of the transaction list
  const g = f.group, groups = [], idx = {};
  shown.forEach(r => {
    let k, label;
    if (g === 'day') { k = r.key; label = AN_DOW[r.dow] + ' · ' + dLabel(r); }
    else if (g === 'tag') { k = r.type + '|' + (r.tag_id || r.name); label = r.icon + ' ' + escHtml(r.name) + (r.type === 'income' ? ' (income)' : r.type === 'settled' ? ' (paid)' : ''); }
    else if (g === 'month') { k = r.mk; label = J_MONTHS_EN[r.jm - 1] + ' ' + r.jy; }
    else { k = 'all'; label = ''; }
    if (!(k in idx)) { idx[k] = groups.length; groups.push({ label, rows: [], exp: 0, inc: 0 }); }
    const o = groups[idx[k]]; o.rows.push(r);
    if (r.type === 'expense') o.exp += r.amount; else if (r.type === 'income') o.inc += r.amount;
  });
  if (g === 'tag') groups.sort((a, b) => (b.exp + b.inc) - (a.exp + a.inc));
  const listHtml = groups.map(o => (o.label ? `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 4px;margin-top:12px;font-size:12px;font-weight:800;color:var(--text);border-bottom:1.5px solid var(--cream3);">
      <span>${o.label} <span style="font-weight:600;color:var(--text3);">· ${o.rows.length}</span></span>
      <span style="font-weight:700;">${o.exp ? `<span style="color:var(--coral)">−${anFmt(o.exp)} K</span>` : ''} ${o.inc ? `<span style="color:var(--sage)">+${anFmt(o.inc)} K</span>` : ''}</span>
    </div>` : '') + `<div style="display:flex;flex-direction:column;gap:6px;margin-top:6px;">${o.rows.map(r => anRow(r, g !== 'day', dLabel)).join('')}</div>`).join('');
  const rest = sorted.length - shown.length;

  const top = st.exp.slice().sort((a, b) => b.amount - a.amount).slice(0, 10);
  const mksAsc = mks.slice().sort();
  const multiMonth = mks.length > 1;

  const html = `
    ${ins.length ? `<div style="background:var(--cream2);border:1.5px solid var(--cream3);border-radius:var(--r2);padding:14px 16px;">
      <div style="font-size:12px;font-weight:800;color:var(--text);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px;">💡 What happened to your money</div>
      <ul style="margin:0;padding:0 0 0 18px;display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--text);line-height:1.55;">${ins.map(x => `<li>${x}</li>`).join('')}</ul></div>` : ''}

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:14px;">
      ${anTile('Spent', '−' + anFmt(st.expTotal) + ' K', st.exp.length + ' expenses', 'var(--coral)')}
      ${anTile('Earned', '+' + anFmt(st.incTotal) + ' K', st.inc.length + ' income entries', 'var(--sage)')}
      ${anTile('Net', (net >= 0 ? '+' : '−') + anFmt(Math.abs(net)) + ' K', net >= 0 ? 'you came out ahead' : 'you spent more than you earned', net >= 0 ? 'var(--sage)' : 'var(--coral)')}
      ${anTile('Avg expense', st.exp.length ? anFmt(st.expTotal / st.exp.length) + ' K' : '—', 'per entry')}
      ${anTile('Avg per active day', activeDays ? anFmt(st.expTotal / activeDays) + ' K' : '—', activeDays + ' day' + (activeDays === 1 ? '' : 's') + ' with spending')}
      ${anTile('Biggest expense', st.biggest ? anFmt(st.biggest.amount) + ' K' : '—', st.biggest ? escHtml(st.biggest.name) : '')}
      ${st.settledTotal > 0 ? anTile('Loans/fixed paid', anFmt(st.settledTotal) + ' K', 'bank only, not in "Spent"', 'var(--plum)') : ''}
    </div>

    ${anSection(multiMonth ? 'Month by month' : 'Day by day', multiMonth ? 'Expenses vs income each month' : 'Expenses vs income each day of this month')}
    <div class="money-charts">
      <div class="mchart-card"><div class="mchart-title">${multiMonth ? 'Income vs Expenses' : 'Daily Income vs Expenses'}</div><div class="mchart-wrap"><canvas id="anTrendChart"></canvas></div></div>
      <div class="mchart-card"><div class="mchart-title">Spending by weekday</div><div class="mchart-sub">Which days of the week cost you the most</div><div class="mchart-wrap"><canvas id="anDowChart"></canvas></div></div>
    </div>

    ${st.tags.length ? anSection('Where the money went', 'Expenses by tag — click one to filter everything below') + anTagBars(st.tags, st.expTotal, false, prevByTag) : ''}
    ${st.incTags.length ? anSection('Where the money came from', 'Income by source') + anTagBars(st.incTags, st.incTotal, true, null) : ''}

    ${words.length ? anSection('Words in your notes', 'Entries whose note contains the word — click one to search it') +
      `<div style="display:flex;flex-wrap:wrap;gap:8px;">${words.map((w, i) => `<button onclick="anPickWord(${i})" dir="auto" style="cursor:pointer;border:1.5px solid var(--cream3);background:var(--cream2);border-radius:50px;padding:6px 12px;font-size:13px;color:var(--text);"><b>${escHtml(w.w)}</b> <span style="color:var(--text3);font-size:11px;">×${w.count} · ${anFmt(w.exp + w.inc)} K</span></button>`).join('')}</div>` : ''}

    ${top.length ? anSection('Top 10 biggest expenses') + `<div style="display:flex;flex-direction:column;gap:6px;">${top.map(r => anRow(r, true, dLabel)).join('')}</div>` : ''}

    ${anSection('All transactions', sorted.length + ' matching' + (rest > 0 ? ' · showing first ' + shown.length : ''))}
    ${listHtml}
    ${rest > 0 ? `<div style="text-align:center;margin-top:12px;"><button class="m-btn" onclick="anMore()" style="padding:9px 18px;">Show ${Math.min(200, rest)} more (${rest} left)</button></div>` : ''}`;

  // chart data
  let trend;
  if (multiMonth) {
    trend = { labels: mksAsc.map(mk => { const [y, m] = mk.split('-').map(Number); return J_MONTHS_EN[m - 1] + ' ' + y; }),
              exp: mksAsc.map(mk => (st.byMonth[mk] || {}).exp || 0), inc: mksAsc.map(mk => (st.byMonth[mk] || {}).inc || 0) };
  } else {
    const d = A.cache[mks[0]] || {}, n = d.today_day || d.total_days || 31, days = Array.from({ length: n }, (_, i) => i + 1);
    const incByDay = {};
    st.inc.forEach(r => { incByDay[r.day] = (incByDay[r.day] || 0) + r.amount; });
    trend = { labels: days, exp: days.map(x => (st.byDay[(d.jy || 0) * 10000 + (d.jm || 0) * 100 + x] || {}).total || 0), inc: days.map(x => incByDay[x] || 0) };
  }
  return { html, rows: sorted, words, charts: { trend, dow: st.byDow } };
}
function anDrawCharts(spec) {
  Object.values(A.charts).forEach(c => { try { c.destroy(); } catch (e) {} });
  A.charts = {};
  if (!spec || typeof Chart === 'undefined') return;
  const gc = 'rgba(26,21,16,0.05)', tc = '#a8967c';
  const scales = { x:{ grid:{ color:gc }, ticks:{ color:tc, maxTicksLimit:14 } }, y:{ grid:{ color:gc }, ticks:{ color:tc } } };
  const legend = { display:true, labels:{ color:'#6b5c48', boxWidth:10, font:{ size:11 } } };
  const c1 = document.getElementById('anTrendChart');
  if (c1) A.charts.trend = new Chart(c1, { type:'bar', data:{ labels:spec.trend.labels, datasets:[
    { label:'Expenses', data:spec.trend.exp, backgroundColor:'rgba(232,93,58,.7)', borderRadius:4 },
    { label:'Income', data:spec.trend.inc, backgroundColor:'rgba(58,122,90,.7)', borderRadius:4 } ] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend }, scales } });
  const c2 = document.getElementById('anDowChart');
  if (c2) A.charts.dow = new Chart(c2, { type:'bar', data:{ labels:AN_DOW, datasets:[
    { label:'Spent (K T)', data:spec.dow, backgroundColor:'rgba(212,130,26,.7)', borderRadius:4 } ] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales } });
}

// ── Edit / delete any past record ────────────────
async function anFetchMonth(mk) {
  const r = await fetch('/api/budget/month?month=' + mk);
  return r.json();
}
// a day's entries as editable arrays (old numeric-only days become one "Other" entry)
function anDayBucket(d, day) {
  const raw = ((d.month || {}).daily_spending || {})[String(day)];
  if (raw && typeof raw === 'object') return { tags: (raw.tags || []).map(t => ({ ...t })), income: (raw.income || []).map(t => ({ ...t })) };
  if (typeof raw === 'number' && raw > 0) return { tags: [{ tag_id:'__untagged__', name:'Other', icon:'💰', color:'#a8967c', amount:raw }], income: [] };
  return { tags: [], income: [] };
}
async function anSaveDay(mk, day, b) {
  const total = b.tags.reduce((s, e) => s + (+e.amount || 0), 0);
  const incomeTotal = b.income.reduce((s, e) => s + (+e.amount || 0), 0);
  await fetch('/api/budget/daily', { method:'POST', headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ month_key: mk, day, total, tags: b.tags, income_total: incomeTotal, income: b.income }) });
}
// re-read the record from the server and make sure it is still the one the user clicked
async function anLocate(r) {
  const d = await anFetchMonth(r.mk);
  const src = anDayBucket(d, r.day);
  const list = r.type === 'income' ? src.income : src.tags;
  const entry = list[r.idx];
  // old numeric-only days are shown as "__legacy__" but get converted to "__untagged__" when opened
  const sameTag = entry && (entry.tag_id === r.tag_id || (r.tag_id === '__legacy__' && entry.tag_id === '__untagged__'));
  if (!entry || !sameTag || (+entry.amount || 0) !== r.amount) return null;
  return { d, src, list, entry };
}
async function anAfterChange(msg) {
  A.cache = {};
  await loadMonthData();
  showToast(msg, 'success');
}
function anDateText(r) { return J_MONTHS_EN[r.jm - 1] + ' ' + r.day + ' ' + r.jy; }

function anEdit(uid) {
  const r = A.uid[uid];
  if (!r) return;
  A.edit = r;
  const opts = (r.type === 'income' ? incomeTags() : expenseTags());
  const hasCur = opts.some(t => t.id === r.tag_id);
  const catOpts = (hasCur ? '' : `<option value="${escHtml(r.tag_id)}" selected>${r.icon} ${escHtml(r.name)} (current)</option>`) +
    opts.map(t => `<option value="${t.id}"${t.id === r.tag_id ? ' selected' : ''}>${t.icon} ${escHtml(t.name)}</option>`).join('');
  const totalDays = (A.cache[r.mk] || {}).total_days || 31;
  const lbl = 'font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin:12px 0 4px;';
  let ov = document.getElementById('anEditOverlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'anEditOverlay';
    ov.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(26,21,16,.5);z-index:10001;display:flex;align-items:center;justify-content:center;padding:16px;';
    ov.addEventListener('mousedown', ev => { if (ev.target === ov) anEditClose(); });
    document.body.appendChild(ov);
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape') anEditClose(); });
  }
  ov.innerHTML = `
    <div style="background:var(--cream,#fff);border-radius:var(--r2,14px);padding:20px 22px;width:100%;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,.35);max-height:92vh;overflow-y:auto;">
      <div style="font-family:Fraunces,serif;font-size:18px;font-weight:800;color:var(--ink);">✏️ Edit ${r.type === 'income' ? 'income' : 'expense'}</div>
      <div style="font-size:12px;color:var(--text3);margin-top:3px;">${anDateText(r)}</div>
      <div style="${lbl}">${r.type === 'income' ? 'Source' : 'Category'}</div>
      <select id="anEdCat" class="builder-select" style="width:100%;font-size:13px;">${catOpts}</select>
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:10px;">
        <div><div style="${lbl}">Amount (K T)</div><input type="number" id="anEdAmt" class="m-input" value="${r.amount}" style="width:100%;margin:0;box-sizing:border-box;"/></div>
        <div><div style="${lbl}">Day of month</div><input type="number" id="anEdDay" class="m-input" min="1" max="${totalDays}" value="${r.day}" style="width:100%;margin:0;box-sizing:border-box;"/></div>
      </div>
      <div style="${lbl}">Note</div>
      <textarea id="anEdNote" class="m-input" dir="auto" maxlength="200" rows="3" placeholder="What was this for?" style="width:100%;margin:0;box-sizing:border-box;resize:vertical;font-family:inherit;">${escHtml(r.note)}</textarea>
      <div style="display:flex;gap:8px;margin-top:18px;">
        <button class="m-btn sage" onclick="anEditSave()" style="flex:2;padding:11px;">Save</button>
        <button class="m-btn" onclick="anEditClose()" style="flex:1;padding:11px;">Cancel</button>
        <button class="m-btn" onclick="anDeleteCurrent()" title="Delete this record" style="padding:11px 14px;color:var(--coral);">🗑️</button>
      </div>
    </div>`;
  ov.style.display = 'flex';
  const n = document.getElementById('anEdNote'); if (n && n.focus) n.focus();
}
function anEditClose() {
  const ov = document.getElementById('anEditOverlay');
  if (ov) ov.style.display = 'none';
  A.edit = null;
}
async function anEditSave() {
  const r = A.edit;
  if (!r) return;
  const amount = parseInt(document.getElementById('anEdAmt').value) || 0;
  const newDay = parseInt(document.getElementById('anEdDay').value) || 0;
  const note = (document.getElementById('anEdNote').value || '').trim().slice(0, 200);
  const catId = document.getElementById('anEdCat').value;
  const totalDays = (A.cache[r.mk] || {}).total_days || 31;
  if (!amount) { showToast('Enter an amount', ''); return; }
  if (newDay < 1 || newDay > totalDays) { showToast('Day must be between 1 and ' + totalDays, ''); return; }
  const loc = await anLocate(r);
  if (!loc) { anEditClose(); await anAfterChange('That record changed in the meantime — list refreshed'); return; }
  const updated = { ...loc.entry, amount, note };
  const tag = allTags.find(t => t.id === catId);
  if (tag) { updated.tag_id = tag.id; updated.name = tag.name; updated.icon = tag.icon; updated.color = tag.color; }
  const key = r.type === 'income' ? 'income' : 'tags';
  if (newDay === r.day) {
    loc.list[r.idx] = updated;
    await anSaveDay(r.mk, r.day, loc.src);
  } else {
    loc.list.splice(r.idx, 1);
    await anSaveDay(r.mk, r.day, loc.src);
    const dst = anDayBucket(loc.d, newDay);
    dst[key].push(updated);
    await anSaveDay(r.mk, newDay, dst);
  }
  anEditClose();
  await anAfterChange('Record updated ✓');
}
async function anDelete(uid) {
  const r = A.uid[uid];
  if (!r) return;
  const what = '"' + r.name + '" — ' + anFmt(r.amount) + ' K' + (r.note ? ' (' + r.note + ')' : '') + ' on ' + anDateText(r);
  if (!confirm('Delete this record?\n\n' + what)) return;
  const loc = await anLocate(r);
  if (!loc) { await anAfterChange('That record changed in the meantime — list refreshed'); return; }
  loc.list.splice(r.idx, 1);
  await anSaveDay(r.mk, r.day, loc.src);
  anEditClose();
  await anAfterChange('Record deleted ✓');
}
function anDeleteCurrent() { if (A.edit) anDelete(A.edit.uid); }

// ── Orchestration ─────────────────────────────────
async function anRender() {
  const out = document.getElementById('anResults');
  if (!out || !M.data) return;
  const seq = ++A.seq;
  A.cache[M.viewMonth] = M.data;
  const mks = anRangeMonths();
  const prevMk = anShiftMonth(M.viewMonth, -1);
  const need = A.f.range === 'month' ? [...mks, prevMk] : mks;
  if (need.some(mk => !A.cache[mk])) out.innerHTML = '<div style="padding:18px;text-align:center;color:var(--text3);font-size:13px;">Loading…</div>';
  await anEnsureMonths(need);
  if (seq !== A.seq || !document.getElementById('anResults')) return;
  const all = anFlatten(mks);
  A.uid = {};
  all.forEach(r => { if (r.uid) A.uid[r.uid] = r; });
  const rows = anFilter(all);
  const cnt = document.getElementById('anCount');
  if (cnt) cnt.textContent = rows.length + ' of ' + all.length + ' entries';
  if (!rows.length) {
    A.rows = []; anDrawCharts(null);
    out.innerHTML = `<div style="color:var(--text4);font-size:13px;padding:18px;text-align:center;font-style:italic;">${all.length ? 'Nothing matches these filters' : 'No transactions in this period yet'}</div>`;
    return;
  }
  let prevByTag = null;
  if (A.f.range === 'month' && A.cache[prevMk]) prevByTag = anStats(anFlatten([prevMk])).byTag;
  const res = anBuild(all, rows, mks, prevByTag);
  A.rows = res.rows; A.words = res.words;
  out.innerHTML = res.html;
  anDrawCharts(res.charts);
}
function renderTransactions() { anRender(); }
function anSyncControls() {
  const f = A.f, set = (id, v) => { const el = document.getElementById(id); if (el && el.value !== String(v)) el.value = v; };
  set('anQ', f.q); set('anType', f.type); set('anTag', f.tag); set('anMin', f.min); set('anMax', f.max); set('anSort', f.sort); set('anGroup', f.group);
}
function anSet(key, val) { A.f[key] = val; A.limit = 200; anSyncControls(); anRender(); }
function anSetDeb(key, val) { A.f[key] = val; A.limit = 200; clearTimeout(A.timer); A.timer = setTimeout(anRender, 220); }
function anSetRange(r) {
  A.f.range = r; A.limit = 200; A.cache = {};
  const row = document.getElementById('anRangeRow'); if (row) row.innerHTML = anRangeChips();
  anRender();
}
function anReset() { A.f = { ...AN_DEFAULT, range: A.f.range }; A.limit = 200; anSyncControls(); anRender(); }
function anMore() { A.limit += 200; anRender(); }
function anPickWord(i) { const w = A.words[i]; if (w) anSet('q', w.w); }
function anExportCsv() {
  if (!A.rows.length) { showToast('Nothing to export', ''); return; }
  const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const pad = n => String(n).padStart(2, '0');
  const lines = ['Date (Jalali),Type,Category,Amount (K T),Note'].concat(A.rows.map(r =>
    [r.jy + '/' + pad(r.jm) + '/' + pad(r.day), r.type, r.name, r.type === 'income' ? r.amount : -r.amount, r.note].map(esc).join(',')));
  const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'money-' + A.f.range + '-' + (M.viewMonth || 'export') + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
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
  ensureNoteInputs();
  ['dayTagNote','dayIncomeNote'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
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
  // Every record stays separate so each one keeps its own note
  const noteEl = document.getElementById('dayTagNote');
  const note = noteEl ? noteEl.value.trim() : '';
  M.dayEntries.push({ tag_id: tag.id, name: tag.name, icon: tag.icon, color: tag.color, amount, note });
  if (noteEl) noteEl.value = '';
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
  const noteEl = document.getElementById('dayIncomeNote');
  const note = noteEl ? noteEl.value.trim() : '';
  M.dayIncomeEntries.push({ tag_id: tag.id, name: tag.name, icon: tag.icon, color: tag.color, amount, note });
  if (noteEl) noteEl.value = '';
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
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;color:var(--text)">${e.name}</div>
        ${noteHtml(e.note)}
      </div>
      <span style="font-family:Fraunces,serif;font-size:15px;font-weight:700;color:var(--ink)">${e.amount.toLocaleString()} K</span>
      <button onclick="editDayEntryNote('expense',${i})" title="Edit note" style="border:none;background:transparent;cursor:pointer;color:var(--text3);font-size:13px;padding:0 2px;">✏️</button>
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
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;color:var(--text)">${e.name}</div>
        ${noteHtml(e.note)}
      </div>
      <span style="font-family:Fraunces,serif;font-size:15px;font-weight:700;color:var(--sage)">+${e.amount.toLocaleString()} K</span>
      <button onclick="editDayEntryNote('income',${i})" title="Edit note" style="border:none;background:transparent;cursor:pointer;color:var(--text3);font-size:13px;padding:0 2px;">✏️</button>
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
        <div class="mcard-title">📊 Money Analyzer <span id="anCount"></span></div>
        ${anControlsHtml()}
        <div id="anResults"></div>
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
    const noteLines = raw && typeof raw === 'object'
      ? [...(raw.tags||[]).map(t => ['−', t]), ...(raw.income||[]).map(t => ['+', t])]
          .map(([sg, t]) => sg + t.amount.toLocaleString() + ' K ' + t.name + (t.note ? ' — ' + t.note : ''))
      : [];
    const cellTitle = noteLines.length ? ' title="' + escHtml(noteLines.join('\n')) + '"' : '';
    html += '<div class="'+cls+'"'+cellTitle+' onclick="'+click+'"><div class="day-num">'+day+'</div>'
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

