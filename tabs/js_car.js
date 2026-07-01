// ══════════════════════════════════════════════════════
//  CAR MODULE  —  js_car.js
//  Requires: /api/car  (GET/POST)
//  Data file: car.json
//  Requires jalali.js to be loaded earlier in the bundle
//  for gregToJalali / jalaliToGreg / renderJalaliPicker.
// ══════════════════════════════════════════════════════

const CAR = {
  km: 0,             // current odometer
  services: [],      // service items
  gas: [],           // gas log entries
  notes: '',         // free-text notes
  editServiceId: null,
  _saveTimer: null,
};

// ── Helpers ───────────────────────────────────────────
function carShowToast(msg, type='') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' '+type : '');
  setTimeout(()=>t.className='toast', 2600);
}

function carDebounceSave() {
  clearTimeout(CAR._saveTimer);
  CAR._saveTimer = setTimeout(async () => {
    CAR.notes = document.getElementById('carNotes').value;
    await persistCar();
  }, 800);
}

function toggleSvcInterval() {
  const type = (() => {
    const g = document.getElementById('svcIntervalTypeGroup');
    if (!g) return 'km';
    const a = g.querySelector('.goal-chip-sel.active');
    return a ? a.dataset.val : 'km';
  })();
  document.getElementById('svcIntervalKmRow').style.display = type === 'km' ? '' : 'none';
  document.getElementById('svcFixedKmRow').style.display    = type === 'fixed' ? '' : 'none';
}

// ── API ───────────────────────────────────────────────
async function loadCar() {
  try {
    const r = await fetch('/api/car');
    if (!r.ok) throw new Error('no car api');
    const d = await r.json();
    CAR.km       = d.km       || 0;
    CAR.services = d.services || [];
    CAR.gas      = d.gas      || [];
    CAR.notes    = d.notes    || '';
  } catch(e) {
    console.warn('[Car] API not available. Using local state.', e);
  }

  // Restore notes textarea
  const notesEl = document.getElementById('carNotes');
  if (notesEl) notesEl.value = CAR.notes;

  try { renderCarHero(); } catch(e) { console.error('[Car] renderCarHero failed:', e); }
  try { renderServiceList(); } catch(e) { console.error('[Car] renderServiceList failed:', e); }
  try { renderGasLog(); } catch(e) { console.error('[Car] renderGasLog failed:', e); }
}

async function persistCar() {
  try {
    await fetch('/api/car', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ km: CAR.km, services: CAR.services, gas: CAR.gas, notes: CAR.notes })
    });
  } catch(e) {
    console.warn('[Car] Could not save car data:', e);
  }
}

// ── Odometer ──────────────────────────────────────────
async function updateCarKm() {
  const inp = document.getElementById('carKmInput');
  const val = parseInt(inp.value);
  if (!val || val < 0) { carShowToast('Enter a valid KM reading'); return; }
  if (val < CAR.km && !confirm(`New KM (${val.toLocaleString()}) is less than current (${CAR.km.toLocaleString()}). Continue?`)) return;
  CAR.km = val;
  inp.value = '';
  await persistCar();
  renderCarHero();
  renderServiceList(); // service statuses depend on current km
  carShowToast('Odometer updated ✓', 'success');
}

// ── Hero render ───────────────────────────────────────
function renderCarHero() {
  const odoEl = document.getElementById('carOdoDisplay');
  const subEl = document.getElementById('carOdoSub');
  if (odoEl) {
    odoEl.innerHTML = CAR.km > 0
      ? CAR.km.toLocaleString() + '<span>KM</span>'
      : '—<span>KM</span>';
  }
  if (subEl) {
    const todayJ = jalaliTodayLocal();
    subEl.textContent = CAR.km > 0 && todayJ
      ? `Last updated: ${todayJ.d} ${todayJ.month_name} ${todayJ.y}`
      : 'Set your current mileage below';
  }

  // Overdue / due soon counts
  let overdue = 0, soon = 0;
  CAR.services.forEach(s => {
    const st = serviceStatus(s);
    if (st === 'due') overdue++;
    else if (st === 'soon') soon++;
  });
  const ovEl  = document.getElementById('carOverdueCount');
  const snEl  = document.getElementById('carDueSoonCount');
  if (ovEl) { ovEl.textContent = overdue; ovEl.style.color = overdue > 0 ? 'var(--coral)' : '#fff'; }
  if (snEl)  snEl.textContent = `${soon} due soon`;

  // Gas totals
  const totalGasSpend  = CAR.gas.reduce((s,e) => s + (parseFloat(e.amount)||0), 0);
  const totalGasLiters = CAR.gas.reduce((s,e) => s + (parseFloat(e.liters)||0), 0);
  const tgEl = document.getElementById('carTotalGas');
  const fEl  = document.getElementById('carTotalGasFills');
  if (tgEl) tgEl.textContent = totalGasSpend > 0 ? totalGasSpend.toLocaleString() + ' K T' : '— K T';
  if (fEl)  fEl.textContent  = `${CAR.gas.length} fill-up${CAR.gas.length!==1?'s':''} logged`;

  // Total maintenance cost (sum of all history entry costs across all services)
  let totalMaintCost = 0, totalServiceEntries = 0;
  CAR.services.forEach(s => {
    (s.history||[]).forEach(h => {
      totalMaintCost += parseFloat(h.cost) || 0;
      totalServiceEntries++;
    });
  });
  const mcEl = document.getElementById('carTotalMaintCost');
  const scEl = document.getElementById('carServiceCount');
  if (mcEl) mcEl.textContent = totalMaintCost > 0 ? totalMaintCost.toLocaleString() + ' K T' : '— K T';
  if (scEl) scEl.textContent = `${CAR.services.length} item${CAR.services.length!==1?'s':''} · ${totalServiceEntries} log${totalServiceEntries!==1?'s':''}`;

  // Last full service: find most recent service log entry across all services
  let lastServiceDate = null, lastServiceKm = null;
  CAR.services.forEach(s => {
    (s.history||[]).forEach(h => {
      if (!lastServiceDate || h.date > lastServiceDate) {
        lastServiceDate = h.date;
        lastServiceKm   = h.km;
      }
    });
  });
  const lsEl  = document.getElementById('carLastService');
  const lskEl = document.getElementById('carLastServiceKm');
  if (lsEl) {
    const j = lastServiceDate ? gregToJalali(lastServiceDate) : null;
    lsEl.textContent = j ? `${j.month_name.slice(0,3)} ${j.y}` : '—';
  }
  if (lskEl) lskEl.textContent = lastServiceKm ? `at ${Number(lastServiceKm).toLocaleString()} KM` : 'at — KM';

  // Gas sidebar stats
  const todayJ2 = jalaliTodayLocal();
  const thisMonthGas = CAR.gas.filter(e => {
    if (!e.date || !todayJ2) return false;
    const j = gregToJalali(e.date);
    return j && j.y === todayJ2.y && j.m === todayJ2.m;
  });
  const thisMonthTotal = thisMonthGas.reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
  const avgFill = CAR.gas.length > 0 ? Math.round(totalGasSpend / CAR.gas.length) : 0;

  // Fuel efficiency: need KM data per fill
  let effStr = '—';
  if (CAR.gas.length >= 2 && totalGasLiters > 0) {
    const sorted = [...CAR.gas].filter(e=>e.odo_km).sort((a,b)=>a.odo_km-b.odo_km);
    if (sorted.length >= 2) {
      const kmRange = sorted[sorted.length-1].odo_km - sorted[0].odo_km;
      if (kmRange > 0) effStr = (totalGasLiters / kmRange * 100).toFixed(1);
    }
  }

  _setIfExists('gasThisMonth',   thisMonthTotal > 0 ? thisMonthTotal.toLocaleString() : '—');
  _setIfExists('gasAvgFill',     avgFill > 0 ? avgFill.toLocaleString() : '—');
  _setIfExists('gasTotalLiters', totalGasLiters > 0 ? totalGasLiters.toFixed(1) : '—');
  _setIfExists('gasEfficiency',  effStr);

  try { renderCostPerKm(); } catch(e) { console.error('[Car] renderCostPerKm failed:', e); }
}

function _setIfExists(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── Service status ────────────────────────────────────
function serviceStatus(svc) {
  if (!svc.next_km) return 'unknown';
  const remaining = svc.next_km - CAR.km;
  if (remaining <= 0) return 'due';
  if (remaining <= (svc.warn_km || 1000)) return 'soon';
  return 'ok';
}

function serviceProgress(svc) {
  if (!svc.last_km || !svc.next_km) return 0;
  const total = svc.next_km - svc.last_km;
  if (total <= 0) return 100;
  const done  = CAR.km - svc.last_km;
  return Math.min(100, Math.max(0, Math.round((done/total)*100)));
}

// ── Render service list ───────────────────────────────
function renderServiceList() {
  const list = document.getElementById('serviceList');
  if (!list) return;

  if (CAR.services.length === 0) {
    list.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--text3);font-size:14px;font-style:italic;">
      No services tracked yet. Add one above!
    </div>`;
    return;
  }

  // Sort: due first, then soon, then ok, then unknown
  const order = {due:0, soon:1, ok:2, unknown:3};
  const sorted = [...CAR.services].sort((a,b)=>(order[serviceStatus(a)]||3)-(order[serviceStatus(b)]||3));

  list.innerHTML = sorted.map((s, i) => {
    const st = serviceStatus(s);
    const prog = serviceProgress(s);
    const remaining = s.next_km ? s.next_km - CAR.km : null;
    const nextKmFmt = s.next_km ? Number(s.next_km).toLocaleString() : '—';
    const lastKmFmt = s.last_km ? Number(s.last_km).toLocaleString() : '—';

    // Total spent on this service item across history
    const totalCost = (s.history||[]).reduce((sum,h) => sum + (parseFloat(h.cost)||0), 0);
    const lastCost = s.history && s.history.length > 0
      ? parseFloat(s.history[s.history.length-1].cost) || null
      : null;

    const statusBadgeMap = {
      ok:      'OK ✓',
      soon:    remaining !== null ? `${remaining.toLocaleString()} KM left` : 'Due Soon',
      due:     remaining !== null ? `${Math.abs(remaining).toLocaleString()} KM overdue` : 'Overdue!',
      unknown: 'Not set',
    };
    const progressColorMap = { ok:'var(--sage)', soon:'var(--amber)', due:'var(--coral)', unknown:'var(--cream3)' };

    // History entries (last 3) — now Jalali dates + cost
    const hist = (s.history || []).slice(-3).reverse();
    const histHtml = hist.length > 0
      ? `<div class="service-history">${hist.map((h,hi) => {
          const j = gregToJalali(h.date);
          const dateLabel = j ? `${j.d} ${j.month_name.slice(0,3)} ${j.y}` : (h.date||'');
          const costLabel = h.cost ? ` · 💰 ${Number(h.cost).toLocaleString()} K T` : '';
          return `
          <div class="service-hist-item">
            <span class="service-hist-km">📍 ${Number(h.km).toLocaleString()} KM</span>
            <span>${dateLabel}${costLabel}${h.note ? ' — '+h.note : ''}</span>
            <button class="service-hist-del" onclick="deleteServiceHistory('${s.id}',${(s.history||[]).length-1-hi})" title="Remove entry">✕</button>
          </div>`;
        }).join('')}</div>`
      : '';

    return `
    <div class="service-card" style="animation-delay:${i*0.06}s;">
      <div class="service-card-status-bar ${st}"></div>
      <div class="service-card-inner">
        <div class="service-card-top">
          <div class="service-card-left">
            <div class="service-icon" style="background:${{ok:'var(--sageL)',soon:'var(--amberL)',due:'var(--coralL)',unknown:'var(--cream2)'}[st]||'var(--cream2)'};">
              ${s.icon || '🔧'}
            </div>
            <div class="service-name">${s.name || 'Service'}</div>
            <div class="service-desc">${s.category || ''} ${s.notes ? '· '+s.notes : ''}</div>
          </div>
          <div class="service-status-badge ${st}">${statusBadgeMap[st]||'—'}</div>
        </div>

        <div class="service-km-grid">
          <div class="service-km-box">
            <div class="service-km-label">Last Done</div>
            <div class="service-km-val">${lastKmFmt} KM</div>
          </div>
          <div class="service-km-box">
            <div class="service-km-label">Next Due</div>
            <div class="service-km-val ${st==='due'?'highlight':st==='ok'?'ok-text':''}">${nextKmFmt} KM</div>
          </div>
          <div class="service-km-box">
            <div class="service-km-label">Remaining</div>
            <div class="service-km-val ${remaining!==null&&remaining<=0?'highlight':''}">${
              remaining !== null ? (remaining <= 0 ? '−'+Math.abs(remaining).toLocaleString() : remaining.toLocaleString()) : '—'} KM</div>
          </div>
          <div class="service-km-box">
            <div class="service-km-label">Total Spent</div>
            <div class="service-km-val" style="color:var(--amber);">${totalCost > 0 ? totalCost.toLocaleString()+' K T' : '—'}</div>
          </div>
        </div>

        <div class="service-progress-wrap">
          <div class="service-progress-header">
            <span class="service-progress-label">Interval used</span>
            <span class="service-progress-pct">${prog}%</span>
          </div>
          <div class="service-progress-bar">
            <div class="service-progress-fill" style="width:${prog}%;background:${progressColorMap[st]};"></div>
          </div>
        </div>

        ${histHtml}

        <div class="service-card-actions">
          <button class="service-action-btn" onclick="openEditServiceModal('${s.id}')">✏️ Edit</button>
          <button class="service-action-btn" onclick="deleteService('${s.id}')">🗑️ Delete</button>
          <button class="service-action-btn primary" onclick="openServiceLogModal('${s.id}')">✅ Done Now</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── Render gas log ────────────────────────────────────
function renderGasLog() {
  const list = document.getElementById('gasLogList');
  if (!list) return;

  const sorted = [...CAR.gas].sort((a,b) => (b.date||'').localeCompare(a.date||''));
  const recent = sorted.slice(0, 10);

  if (recent.length === 0) {
    list.innerHTML = '<div class="gas-empty">No fill-ups logged yet.</div>';
    return;
  }

  list.innerHTML = recent.map((e, i) => {
    const j = gregToJalali(e.date);
    const dateStr = j ? `${j.d} ${j.month_name.slice(0,3)}` : '—';
    return `
    <div class="gas-entry">
      <div class="gas-icon">⛽</div>
      <div class="gas-info">
        <div class="gas-date">${dateStr}${e.odo_km ? ' · '+Number(e.odo_km).toLocaleString()+' KM' : ''}</div>
        <div class="gas-km">${e.note || 'Fill-up'}</div>
      </div>
      <div>
        <div class="gas-amount">${Number(e.amount||0).toLocaleString()} K T</div>
        ${e.liters ? `<div class="gas-liters">${e.liters} L</div>` : ''}
      </div>
      <button class="service-hist-del" onclick="deleteGasEntry(${i})" title="Remove">✕</button>
    </div>`;
  }).join('');

  try { renderCostPerKm(); } catch(e) { console.error('[Car] renderCostPerKm failed:', e); }
}

// ── Service modal ─────────────────────────────────────
function openServiceModal() {
  CAR.editServiceId = null;
  document.getElementById('serviceModalTitle').textContent = '🔧 Add Service Item';
  _clearServiceForm();
  document.getElementById('serviceModalOverlay').classList.add('open');
}

function openEditServiceModal(id) {
  const s = CAR.services.find(x=>x.id===id);
  if (!s) return;
  CAR.editServiceId = id;
  document.getElementById('serviceModalTitle').textContent = '✏️ Edit Service';
  document.getElementById('svcName').value       = s.name || '';
  document.getElementById('svcIcon').value       = s.icon || '';
  document.getElementById('svcCategory').value   = s.category || 'engine';
  document.getElementById('svcNotes').value      = s.notes || '';
  document.getElementById('svcLastKm').value     = s.last_km || '';
  document.getElementById('svcCost').value       = s.last_cost || '';
  document.getElementById('svcWarnKm').value     = s.warn_km || 1000;

  renderJalaliPicker('svcLastDatePicker', 'svcLastDate', s.last_date || null);

  const isFixed = !!s.fixed_next_km;
  if (isFixed) {
    _setChipActiveLocal('svcIntervalTypeGroup', 'fixed');
    document.getElementById('svcFixedKm').value    = s.next_km || '';
    document.getElementById('svcIntervalKm').value = '';
  } else {
    _setChipActiveLocal('svcIntervalTypeGroup', 'km');
    document.getElementById('svcIntervalKm').value = s.interval_km || '';
    document.getElementById('svcFixedKm').value    = '';
  }
  toggleSvcInterval();
  document.getElementById('serviceModalOverlay').classList.add('open');
}

function closeServiceModal() {
  document.getElementById('serviceModalOverlay').classList.remove('open');
  CAR.editServiceId = null;
}

function _clearServiceForm() {
  ['svcName','svcIcon','svcNotes','svcLastKm','svcCost','svcIntervalKm','svcFixedKm'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderJalaliPicker('svcLastDatePicker', 'svcLastDate', null);
  document.getElementById('svcCategory').value   = 'engine';
  document.getElementById('svcWarnKm').value     = '1000';
  _setChipActiveLocal('svcIntervalTypeGroup', 'km');
  toggleSvcInterval();
}

function _setChipActiveLocal(groupId, val) {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.querySelectorAll('.goal-chip-sel').forEach(b => {
    b.classList.toggle('active', b.dataset.val === val);
  });
}

async function saveServiceItem() {
  const name = document.getElementById('svcName').value.trim();
  if (!name) { carShowToast('Enter a service name'); return; }

  const intervalType = (() => {
    const g = document.getElementById('svcIntervalTypeGroup');
    const a = g ? g.querySelector('.goal-chip-sel.active') : null;
    return a ? a.dataset.val : 'km';
  })();

  const lastKm = parseInt(document.getElementById('svcLastKm').value) || null;
  const cost   = parseFloat(document.getElementById('svcCost').value) || null;
  let intervalKm = parseInt(document.getElementById('svcIntervalKm').value) || null;
  let fixedNextKm = intervalType === 'fixed' ? parseInt(document.getElementById('svcFixedKm').value) || null : null;
  let nextKm = null;

  if (intervalType === 'km' && lastKm && intervalKm) {
    nextKm = lastKm + intervalKm;
  } else if (intervalType === 'fixed' && fixedNextKm) {
    nextKm = fixedNextKm;
  }

  const lastDateIso = document.getElementById('svcLastDate').value || null;
  const existingHistory = CAR.editServiceId
    ? (CAR.services.find(x=>x.id===CAR.editServiceId)||{}).history || []
    : [];

  // Upsert a history entry for the "last done" km/date/cost, for both new
  // and edited services — otherwise cost entered here never counts toward
  // Total Spent, which sums history[].cost only.
  let history = [...existingHistory];
  if (lastKm && lastDateIso) {
    const matchIdx = history.findIndex(h => h.km === lastKm && h.date === lastDateIso);
    if (matchIdx !== -1) {
      history[matchIdx] = { ...history[matchIdx], cost };
    } else {
      history.push({ km: lastKm, date: lastDateIso, cost, note: history.length ? '' : 'Initial entry' });
    }
  }

  const svc = {
    id:           CAR.editServiceId || String(Date.now()),
    name,
    icon:         document.getElementById('svcIcon').value || '🔧',
    category:     document.getElementById('svcCategory').value || 'other',
    notes:        document.getElementById('svcNotes').value.trim(),
    last_km:      lastKm,
    last_date:    lastDateIso,
    last_cost:    cost,
    interval_km:  intervalType === 'km' ? intervalKm : null,
    fixed_next_km: fixedNextKm !== null,
    next_km:      nextKm,
    warn_km:      parseInt(document.getElementById('svcWarnKm').value) || 1000,
    history,
  };

  if (CAR.editServiceId) {
    const idx = CAR.services.findIndex(x=>x.id===CAR.editServiceId);
    if (idx !== -1) CAR.services[idx] = svc; else CAR.services.push(svc);
  } else {
    CAR.services.push(svc);
  }

  closeServiceModal();
  await persistCar();
  renderServiceList();
  renderCarHero();
  carShowToast(CAR.editServiceId ? 'Service updated ✓' : 'Service added ✓', 'success');
}

async function deleteService(id) {
  if (!confirm('Delete this service? History will be lost.')) return;
  CAR.services = CAR.services.filter(x=>x.id!==id);
  await persistCar();
  renderServiceList();
  renderCarHero();
  carShowToast('Service removed');
}

// ── Service "mark done" ───────────────────────────────
function openServiceLogModal(id) {
  const s = CAR.services.find(x=>x.id===id);
  if (!s) return;
  document.getElementById('svcLogId').value   = id;
  document.getElementById('svcLogKm').value   = CAR.km || '';
  document.getElementById('svcLogCost').value = '';
  document.getElementById('svcLogNote').value = '';
  renderJalaliPicker('svcLogDatePicker', 'svcLogDate', null);
  document.getElementById('serviceLogModalOverlay').classList.add('open');
}

async function confirmServiceDone() {
  const id   = document.getElementById('svcLogId').value;
  const km   = parseInt(document.getElementById('svcLogKm').value);
  const cost = parseFloat(document.getElementById('svcLogCost').value) || null;
  const date = document.getElementById('svcLogDate').value;
  const note = document.getElementById('svcLogNote').value.trim();
  if (!km) { carShowToast('Enter the odometer reading'); return; }

  const s = CAR.services.find(x=>x.id===id);
  if (!s) return;

  // Append to history
  s.history = s.history || [];
  s.history.push({ km, date, cost, note });

  // Update last_km/date/cost and recalc next_km
  s.last_km   = km;
  s.last_date = date;
  s.last_cost = cost;
  if (!s.fixed_next_km && s.interval_km) {
    s.next_km = km + s.interval_km;
  }
  // Update global KM if higher
  if (km > CAR.km) { CAR.km = km; }

  document.getElementById('serviceLogModalOverlay').classList.remove('open');
  await persistCar();
  renderServiceList();
  renderCarHero();
  carShowToast('✅ Service logged!', 'success');
}

async function deleteServiceHistory(serviceId, histIndex) {
  const s = CAR.services.find(x=>x.id===serviceId);
  if (!s || !s.history) return;
  s.history.splice(histIndex, 1);
  // Re-derive last_km/date/cost from remaining history
  if (s.history.length > 0) {
    const last = [...s.history].sort((a,b)=>a.km-b.km).pop();
    s.last_km   = last.km;
    s.last_date = last.date;
    s.last_cost = last.cost;
    if (!s.fixed_next_km && s.interval_km) s.next_km = s.last_km + s.interval_km;
  }
  await persistCar();
  renderServiceList();
  renderCarHero();
}

// ── Cost per KM ───────────────────────────────────────
let _cpkData = null; // cached for breakdown panel

function calcCostPerKm() {
  // ── Gas: pair consecutive fills by odometer ──
  const gasSorted = [...CAR.gas]
    .filter(e => e.odo_km && e.amount)
    .sort((a, b) => a.odo_km - b.odo_km);

  let totalGasKm = 0;
  let totalGasCostTracked = 0; // only cost of fuel actually consumed (excludes last fill still in tank)
  let totalLitersTracked = 0;  // only liters actually consumed
  const monthly = {};
  const gasBreakdown = []; // per-segment for breakdown panel

  // Segment i-1 → i was driven on fuel bought at fill i-1.
  // The last fill-up (gasSorted[last]) is still in the tank — exclude its cost/liters.
  for (let i = 1; i < gasSorted.length; i++) {
    const kmDiff = gasSorted[i].odo_km - gasSorted[i - 1].odo_km;
    if (kmDiff > 0 && kmDiff < 3000) {
      // Cost and liters belong to the fill at i-1 (that's what got burned driving to i)
      const cost    = parseFloat(gasSorted[i - 1].amount) || 0;
      const liters  = parseFloat(gasSorted[i - 1].liters) || 0;
      totalGasKm           += kmDiff;
      totalGasCostTracked  += cost;
      totalLitersTracked   += liters;
      gasBreakdown.push({ from: gasSorted[i-1].odo_km, to: gasSorted[i].odo_km, km: kmDiff, cost, liters, date: gasSorted[i].date });
      const monthKey = (gasSorted[i].date || '').slice(0, 7);
      if (monthKey) {
        if (!monthly[monthKey]) monthly[monthKey] = { gasCost: 0, km: 0 };
        monthly[monthKey].gasCost += cost;
        monthly[monthKey].km += kmDiff;
      }
    }
  }

  // ── Maintenance: amortize each cost over its SERVICE INTERVAL ──
  // e.g. oil change 2,400 KT with 7,000 km interval → 2400/7000 = 0.34 T/km
  // NOT divided by total tracked km (that was wrong)
  let totalMaintCpk = 0;
  let totalMaintCost = 0;
  const maintBreakdown = [];

  CAR.services.forEach(s => {
    const hist = (s.history || []).slice().sort((a, b) => a.km - b.km);
    hist.forEach((h, idx) => {
      const cost = parseFloat(h.cost) || 0;
      totalMaintCost += cost;
      if (!cost) return;

      // For each history entry, the interval is either:
      //   • distance to the *next* history entry (if there is one) — actual measured interval
      //   • or the service's defined interval_km (for the most recent entry)
      //   • or next_km - h.km as fallback
      let intervalKm = null;
      if (idx < hist.length - 1) {
        intervalKm = hist[idx + 1].km - h.km; // actual interval from records
      } else {
        intervalKm = s.interval_km
          || (s.next_km && h.km ? s.next_km - h.km : null);
      }

      const cpk = intervalKm && intervalKm > 0 ? cost / intervalKm : null;
      if (cpk !== null) totalMaintCpk += cpk;
      maintBreakdown.push({ name: s.name, icon: s.icon || '🔧', cost, intervalKm, cpk, km: h.km, date: h.date });
    });
  });

  const totalGasCostAll = CAR.gas.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  // For T/km and L/100km: only use cost/liters of fuel that was actually consumed (paired segments).
  // The last fill-up is still sitting in the tank — including it would overstate both metrics.
  const effectiveKm = totalGasKm > 0 ? totalGasKm : CAR.km || 0;
  const usingFallback = totalGasKm === 0 && effectiveKm > 0;

  const gasCpk   = effectiveKm > 0 && totalGasCostTracked > 0 ? totalGasCostTracked / effectiveKm : null;
  const maintCpk = totalMaintCpk > 0 ? totalMaintCpk : null;
  const totalCpk = (gasCpk !== null || maintCpk !== null) ? (gasCpk || 0) + (maintCpk || 0) : null;

  const monthlyArr = Object.entries(monthly)
    .filter(([, v]) => v.km > 0)
    .map(([k, v]) => ({ key: k, cpk: v.gasCost / v.km, cost: v.gasCost, km: v.km }))
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-12);

  const totalLiters = CAR.gas.reduce((s, e) => s + (parseFloat(e.liters) || 0), 0);
  const fuelL100km = effectiveKm > 0 && totalLitersTracked > 0 ? (totalLitersTracked / effectiveKm * 100) : null;

  _cpkData = { gasCpk, maintCpk, totalCpk, totalGasKm: effectiveKm, totalGasCost: totalGasCostAll,
               totalGasCostTracked, totalLiters, totalLitersTracked, monthlyArr, fuelL100km, usingFallback, gasBreakdown, maintBreakdown };
  return _cpkData;
}

function showCpkBreakdown(type) {
  const panel = document.getElementById('cpkBreakdownPanel');
  if (!panel || !_cpkData) return;
  // Toggle off if same card clicked again
  if (panel.dataset.open === type) { panel.style.display = 'none'; panel.dataset.open = ''; return; }
  panel.dataset.open = type;

  const d = _cpkData;
  const fmt = v => v != null ? v.toFixed(2) : '—';
  const fmtN = v => v != null ? Number(v).toLocaleString() : '—';
  let html = '';

  if (type === 'total') {
    html = `<div class="cpk-bd-title">⚡ How Total Cost/km is calculated</div>
    <div class="cpk-bd-formula">Gas T/km + Maint T/km = Total</div>
    <div class="cpk-bd-row"><span>⛽ Gas cost/km</span><span class="cpk-bd-val">${fmt(d.gasCpk)} T/km</span></div>
    <div class="cpk-bd-row"><span>🔧 Maint cost/km (amortized)</span><span class="cpk-bd-val">${fmt(d.maintCpk)} T/km</span></div>
    <div class="cpk-bd-row cpk-bd-total"><span>= Total</span><span class="cpk-bd-val">${fmt(d.totalCpk)} T/km</span></div>`;
  }

  else if (type === 'gas') {
    html = `<div class="cpk-bd-title">⛽ Gas Cost/km breakdown</div>
    <div class="cpk-bd-formula">Consumed gas spend ÷ tracked km = T/km</div>
    <div class="cpk-bd-row"><span>Gas cost for tracked km</span><span class="cpk-bd-val">${fmtN(d.totalGasCostTracked)} K T</span></div>
    ${d.totalGasCost > d.totalGasCostTracked ? `<div class="cpk-bd-note">⛽ ${fmtN(d.totalGasCost - d.totalGasCostTracked)} K T from last fill-up excluded — fuel still in tank, 0 km driven on it yet.</div>` : ''}
    <div class="cpk-bd-row"><span>÷ Tracked km</span><span class="cpk-bd-val">${fmtN(d.totalGasKm)} km</span></div>
    <div class="cpk-bd-row cpk-bd-total"><span>= Gas T/km</span><span class="cpk-bd-val">${fmt(d.gasCpk)} T/km</span></div>`;
    if (d.gasBreakdown.length) {
      html += `<div class="cpk-bd-sub-title">Fill-up segments used:</div>`;
      html += d.gasBreakdown.map(g => {
        const j = gregToJalali(g.date);
        const label = j ? `${j.d} ${j.month_name.slice(0,3)} ${j.y}` : g.date;
        return `<div class="cpk-bd-row sm">
          <span>${fmtN(g.from)}→${fmtN(g.to)} km &nbsp;(${fmtN(g.km)} km)</span>
          <span class="cpk-bd-val">${fmtN(g.cost)} K T &nbsp;·&nbsp; ${(g.cost/g.km).toFixed(2)} T/km</span>
        </div>`;
      }).join('');
    } else {
      html += `<div class="cpk-bd-note">⚠️ No paired fill-ups yet — using full odometer as denominator (rough estimate)</div>`;
    }
  }

  else if (type === 'maint') {
    html = `<div class="cpk-bd-title">🔧 Maint Cost/km — amortized over service intervals</div>
    <div class="cpk-bd-formula">Each service: cost ÷ interval_km → add them all up</div>
    <div class="cpk-bd-formula" style="color:var(--coral);font-size:11px;">NOT divided by tracked km — each service pays its own way over its own lifespan</div>`;
    if (d.maintBreakdown.length) {
      html += d.maintBreakdown.map(m => {
        const j = m.date ? gregToJalali(m.date) : null;
        const dateLabel = j ? `${j.d} ${j.month_name.slice(0,3)} ${j.y}` : (m.date || '—');
        if (m.cpk !== null) {
          return `<div class="cpk-bd-row">
            <span>${m.icon} ${m.name} <span style="color:var(--text3);font-size:11px;">${fmtN(m.km)} km · ${dateLabel}</span></span>
            <span class="cpk-bd-val">${fmtN(m.cost)} K T ÷ ${fmtN(m.intervalKm)} km = <b>${m.cpk.toFixed(2)}</b> T/km</span>
          </div>`;
        } else {
          return `<div class="cpk-bd-row" style="opacity:.55;">
            <span>${m.icon} ${m.name} <span style="color:var(--text3);font-size:11px;">${fmtN(m.km)} km · ${dateLabel}</span></span>
            <span class="cpk-bd-val">${fmtN(m.cost)} K T · no interval set — skipped</span>
          </div>`;
        }
      }).join('');
      html += `<div class="cpk-bd-row cpk-bd-total"><span>= Total maint T/km</span><span class="cpk-bd-val">${fmt(d.maintCpk)} T/km</span></div>`;
    } else {
      html += `<div class="cpk-bd-note">No service cost history yet. Log service costs to see this.</div>`;
    }
  }

  else if (type === 'dist') {
    html = `<div class="cpk-bd-title">📍 How KM Tracked is determined</div>`;
    if (d.usingFallback) {
      html += `<div class="cpk-bd-note">⚠️ Fallback mode: your fill-ups all have the same odometer reading so no km range can be paired. Using current odometer (${fmtN(d.totalGasKm)} km) as denominator instead — rough estimate.</div>
      <div class="cpk-bd-formula">For accurate data: log each fill-up with the odometer reading AT THAT FILL.</div>`;
    } else {
      html += `<div class="cpk-bd-formula">Sum of km between consecutive fill-ups with odo readings</div>`;
      html += d.gasBreakdown.map(g =>
        `<div class="cpk-bd-row sm"><span>${fmtN(g.from)} → ${fmtN(g.to)} km</span><span class="cpk-bd-val">+${fmtN(g.km)} km</span></div>`
      ).join('');
      html += `<div class="cpk-bd-row cpk-bd-total"><span>= Total tracked</span><span class="cpk-bd-val">${fmtN(d.totalGasKm)} km</span></div>`;
    }
  }

  else if (type === 'fuel') {
    html = `<div class="cpk-bd-title">🧪 Fuel Consumption calculation</div>
    <div class="cpk-bd-formula">Consumed liters ÷ tracked km × 100 = L/100km</div>
    <div class="cpk-bd-row"><span>Liters consumed (paired segments)</span><span class="cpk-bd-val">${(d.totalLitersTracked||0) > 0 ? d.totalLitersTracked.toFixed(1) : '—'} L</span></div>
    ${d.totalLiters > (d.totalLitersTracked||0) ? `<div class="cpk-bd-note">⛽ ${(d.totalLiters-(d.totalLitersTracked||0)).toFixed(1)} L from last fill-up excluded — still in tank, no distance driven on it yet.</div>` : ''}
    <div class="cpk-bd-row"><span>÷ Tracked km</span><span class="cpk-bd-val">${fmtN(d.totalGasKm)} km</span></div>
    <div class="cpk-bd-row"><span>× 100</span><span class="cpk-bd-val"></span></div>
    <div class="cpk-bd-row cpk-bd-total"><span>= Consumption</span><span class="cpk-bd-val">${d.fuelL100km !== null ? d.fuelL100km.toFixed(1) : '—'} L/100km</span></div>
    ${(d.totalLitersTracked||0) === 0 ? '<div class="cpk-bd-note">Add liters to your fill-up entries to calculate this.</div>' : ''}`;
  }

  panel.innerHTML = html;
  panel.style.display = 'block';
}

function renderCostPerKm() {
  const el = document.getElementById('carCpkSection');
  if (!el) return;

  const { gasCpk, maintCpk, totalCpk, totalGasKm, totalGasCost, totalMaintCost, monthlyArr, fuelL100km, usingFallback } = calcCostPerKm();

  const fmtCpk = v => v !== null ? v.toFixed(2) : '—';

  // ── SVG bar chart ──
  let chartHtml = '<div class="cpk-no-data">Log at least 2 fill-ups with odometer readings to see the trend.</div>';

  if (monthlyArr.length >= 2) {
    const W = 560, H = 140;
    const PAD = { top: 14, bottom: 38, left: 44, right: 12 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const maxCpk = Math.max(...monthlyArr.map(m => m.cpk)) * 1.2 || 1;
    const avgCpk = monthlyArr.reduce((s, m) => s + m.cpk, 0) / monthlyArr.length;
    const n = monthlyArr.length;
    const slotW = plotW / n;
    const barW = Math.max(6, slotW * 0.55);

    // Y axis ticks
    const yTicks = 3;
    let yTicksHtml = '';
    for (let t = 0; t <= yTicks; t++) {
      const val = maxCpk * t / yTicks;
      const y = PAD.top + plotH - plotH * t / yTicks;
      yTicksHtml += `
        <line x1="${PAD.left - 4}" y1="${y}" x2="${PAD.left + plotW}" y2="${y}" stroke="rgba(0,0,0,.07)" stroke-width="1"/>
        <text x="${PAD.left - 7}" y="${y + 4}" text-anchor="end" font-size="9" fill="#999">${val.toFixed(1)}</text>`;
    }

    // Bars + labels
    let barsHtml = '';
    monthlyArr.forEach((m, i) => {
      const barH = plotH * (m.cpk / maxCpk);
      const x = PAD.left + slotW * i + (slotW - barW) / 2;
      const y = PAD.top + plotH - barH;
      // Color: green if below avg, amber if 10–30% above, red if >30% above
      const ratio = m.cpk / avgCpk;
      const fill = ratio > 1.3 ? 'var(--coral)' : ratio > 1.1 ? 'var(--amber)' : 'var(--sage)';
      // Jalali month label
      const j = gregToJalali(m.key + '-15');
      const label = j ? `${j.m}/${j.y % 100}` : m.key.slice(5);
      barsHtml += `
        <rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="3" fill="${fill}" opacity="0.85"/>
        <text x="${x + barW / 2}" y="${PAD.top + plotH + 14}" text-anchor="middle" font-size="9" fill="#888">${label}</text>
        <title>${m.key}: ${m.cpk.toFixed(2)} T/km · ${m.km.toLocaleString()} km</title>`;
    });

    // Average line
    const avgY = PAD.top + plotH - plotH * (avgCpk / maxCpk);
    const avgLineHtml = `
      <line x1="${PAD.left}" y1="${avgY}" x2="${PAD.left + plotW}" y2="${avgY}"
        stroke="var(--coral)" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.7"/>
      <text x="${PAD.left + plotW + 2}" y="${avgY + 4}" font-size="9" fill="var(--coral)">avg</text>`;

    // Y axis label
    const yLabelHtml = `<text x="10" y="${PAD.top + plotH / 2}" text-anchor="middle"
      font-size="9" fill="#aaa" transform="rotate(-90,10,${PAD.top + plotH / 2})">T/km</text>`;

    chartHtml = `
      <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="overflow:visible;">
        ${yLabelHtml}
        ${yTicksHtml}
        ${barsHtml}
        ${avgLineHtml}
        <line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + plotH}" stroke="#ddd" stroke-width="1"/>
        <line x1="${PAD.left}" y1="${PAD.top + plotH}" x2="${PAD.left + plotW}" y2="${PAD.top + plotH}" stroke="#ddd" stroke-width="1"/>
      </svg>`;
  }

  el.innerHTML = `
  <div class="cpk-section">
    <div class="cpk-header">
      <div class="cpk-title">💸 Cost per Kilometre</div>
      <div class="cpk-subtitle">${usingFallback ? '⚠️ estimated from odometer — log fills with different odo readings for accurate data' : 'based on ' + (totalGasKm > 0 ? totalGasKm.toLocaleString() + ' km of tracked driving' : 'logged fill-ups & service history')}</div>
    </div>
    <div class="cpk-stats-row">
      <div class="cpk-stat total" onclick="showCpkBreakdown('total')" title="Click for breakdown">
        <div class="cpk-stat-label">⚡ Total Cost / KM</div>
        <div class="cpk-stat-val">${fmtCpk(totalCpk)}</div>
        <div class="cpk-stat-unit">Tomans per km</div>
      </div>
      <div class="cpk-stat gas" onclick="showCpkBreakdown('gas')" title="Click for breakdown">
        <div class="cpk-stat-label">⛽ Gas Cost / KM</div>
        <div class="cpk-stat-val">${fmtCpk(gasCpk)}</div>
        <div class="cpk-stat-unit">${totalGasCost > 0 ? totalGasCost.toLocaleString() + ' K T total gas' : 'log fill-ups to calculate'}</div>
      </div>
      <div class="cpk-stat maint" onclick="showCpkBreakdown('maint')" title="Click for breakdown">
        <div class="cpk-stat-label">🔧 Maint Cost / KM</div>
        <div class="cpk-stat-val">${fmtCpk(maintCpk)}</div>
        <div class="cpk-stat-unit">${totalMaintCost > 0 ? totalMaintCost.toLocaleString() + ' K T total maint' : 'log service costs'}</div>
      </div>
      <div class="cpk-stat dist" onclick="showCpkBreakdown('dist')" title="Click for breakdown">
        <div class="cpk-stat-label">📍 KM Tracked</div>
        <div class="cpk-stat-val">${totalGasKm > 0 ? totalGasKm.toLocaleString() : '—'}</div>
        <div class="cpk-stat-unit">km of paired fill-up data</div>
      </div>
      <div class="cpk-stat fuel" onclick="showCpkBreakdown('fuel')" title="Click for breakdown">
        <div class="cpk-stat-label">🧪 Fuel Consumption</div>
        <div class="cpk-stat-val">${fuelL100km !== null ? fuelL100km.toFixed(1) : '—'}</div>
        <div class="cpk-stat-unit">${fuelL100km !== null ? 'L / 100 km' : 'add liters to fill-ups'}</div>
      </div>
    </div>
    <div id="cpkBreakdownPanel" class="cpk-breakdown-panel" style="display:none;" data-open=""></div>
    <div class="cpk-chart-wrap">
      <div class="cpk-chart-label">Monthly Gas Cost / KM Trend</div>
      ${chartHtml}
    </div>
  </div>`;
}

// ── Gas log modal ─────────────────────────────────────
function openGasModal() {
  renderJalaliPicker('gasDatePicker', 'gasDate', null);
  document.getElementById('gasOdoKm').value   = CAR.km || '';
  document.getElementById('gasAmount').value  = '';
  document.getElementById('gasLiters').value  = '';
  document.getElementById('gasNote').value    = '';
  document.getElementById('gasModalOverlay').classList.add('open');
}

function closeGasModal() {
  document.getElementById('gasModalOverlay').classList.remove('open');
}

async function saveGasEntry() {
  const amount = parseFloat(document.getElementById('gasAmount').value);
  if (!amount || amount <= 0) { carShowToast('Enter the amount paid'); return; }

  const entry = {
    date:   document.getElementById('gasDate').value,
    odo_km: parseInt(document.getElementById('gasOdoKm').value) || null,
    amount,
    liters: parseFloat(document.getElementById('gasLiters').value) || null,
    note:   document.getElementById('gasNote').value.trim(),
  };

  CAR.gas.push(entry);

  // Update odometer if newer
  if (entry.odo_km && entry.odo_km > CAR.km) CAR.km = entry.odo_km;

  closeGasModal();
  await persistCar();
  renderGasLog();
  renderCarHero();
  carShowToast('⛽ Fill-up logged!', 'success');
}

async function deleteGasEntry(index) {
  if (!confirm('Remove this fill-up?')) return;
  // index is in sorted order (recent first), map back
  const sorted = [...CAR.gas].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const entry  = sorted[index];
  const realIdx = CAR.gas.indexOf(entry);
  if (realIdx !== -1) CAR.gas.splice(realIdx, 1);
  await persistCar();
  renderGasLog();
  renderCarHero();
  carShowToast('Entry removed');
}
