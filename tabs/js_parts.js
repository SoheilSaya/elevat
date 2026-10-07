// ══════════════════════════════════════════════════════
//  PARTS BIZ  —  js_parts.js
//  Auto-parts resale/accounting module: products, stores,
//  purchases, sales, and live FIFO-costed reports.
//  Depends on jalali.js (renderJalaliPicker, gregToJalali)
//  and the shared helpers/classes in js_core.js + head.html.
// ══════════════════════════════════════════════════════

const PARTS = {products:[],stores:[],car_models:[],brands:[],part_types:[],categories:[],purchases:[],sales:[],capital_transactions:[],
  generic_products:[],price_entries:[],business_expenses:[],business_profile:{name:'',address:'',phone:'',logo:'',footer_note:'',next_invoice_no:1,next_quote_no:1},
  sales_agents:[],customers:[],sale_returns:[],quotations:[],agent_payouts:[],
  pricing_settings:{shipping_cost:0,agent_share_pct:33.33,include_agent_share:true,target_margin_pct:20,round_step:1},
  stock:{},avg_cost:{},by_product:{},by_store:{},agent_summary:{},
  totals:{},expenses_by_category:{},ar_by_customer:{},ap_by_store:{},cash_ledger:[],reconciliations:[],low_stock:[],low_stock_threshold:2};
let partsLoaded = false;
let partsCurrentSub = 'products';
let purchaseCartItems = [];
let saleCartItems = [];
let editingPurchaseId = null;
let editingSaleId = null;
let editingCashTxId = null;
let cashTxType = 'deposit';
let salePaymentStatus = 'paid';
let saleShippingPayer = 'customer';
function setSaleShippingPayer(payer){
  saleShippingPayer = payer;
  document.querySelectorAll('#saleShippingPayerToggle button').forEach(b=>b.classList.toggle('active', b.dataset.payer===payer));
  document.getElementById('saleShippingRatioWrap').style.display = payer==='split' ? 'block' : 'none';
}
let saleCommissionBasis = 'profit';
function setSaleCommissionBasis(basis){
  saleCommissionBasis = basis;
  document.querySelectorAll('#saleCommissionBasisToggle button').forEach(b=>b.classList.toggle('active', b.dataset.basis===basis));
}
function onSaleAgentPick(){
  const agentId = document.getElementById('saleAgentSelect').value;
  const wrap = document.getElementById('saleCommissionWrap');
  if(!agentId){ wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  const a = agentById(agentId);
  document.getElementById('saleCommissionPct').value = (a && a.commission_percent!=null) ? a.commission_percent : '';
  setSaleCommissionBasis((a && a.commission_basis) || 'profit');
}
function setSalePaymentStatus(status){
  salePaymentStatus = status;
  document.querySelectorAll('#salePaymentStatusToggle button').forEach(b=>b.classList.toggle('active', b.dataset.status===status));
  document.getElementById('salePartialAmountWrap').style.display = status==='partial' ? 'block' : 'none';
}
let purchasePaymentStatus = 'paid';
function setPurchasePaymentStatus(status){
  purchasePaymentStatus = status;
  document.querySelectorAll('#purchasePaymentStatusToggle button').forEach(b=>b.classList.toggle('active', b.dataset.status===status));
  document.getElementById('purchasePartialAmountWrap').style.display = status==='partial' ? 'block' : 'none';
}

let genericModalReturnTo = null;   // null | 'priceentry'
let editingPriceEntryId = null;
let editingExpenseId = null;
let compareCartItems = [];         // [{ref_type,ref_id,qty}] built in the Compare & Cart tab
let compareChartInstance = null;
let partsStoreTrendChartInstance = null;
let expenseCategoryChartInstance = null;
let partsMarginChartInstance = null;
const EXPENSE_CATEGORIES = ['تجهیزات','اجاره','بازاریابی','قبوض','نرم‌افزار','بسته‌بندی و ارسال','حمل و نقل','سایر'];
let productModalReturnTo = null; // null | 'purchase' | 'sale'
let brandModalReturnTo = null;   // null | 'product' — where to land a newly-created brand
let partTypeModalReturnTo = null;// null | 'product'
let categoryModalReturnTo = null;// null | 'product'
let carModelTagFilter = '';      // live search filter typed above the car-model tag cloud
let productImageData = null;     // base64 currently staged in the product modal
let storeImageData = null;       // base64 currently staged in the store modal
let agentImageData = null;       // base64 currently staged in the sales-agent modal
let editingAgentId = null;
let purchaseInvoiceImage = null; // null = unchanged, '' = removed, dataURL = newly staged
let purchaseReceiptImage = null; // null = unchanged, '' = removed, dataURL = newly staged
let partImgAutoName = '';        // last value we auto-wrote into pfName, so we know if the user overrode it
let selectedCarModels = [];      // array of car models currently checked in the open product modal
let cropTarget = 'product';      // which modal's photo is currently being cropped: 'product' | 'store'
const IMG_TARGETS = {
  product: {uploadInput:'partImgFileInput', preview:'partImgPreview', hintIcon:'partImgHintIcon', hintText:'partImgHintText', removeBtn:'partImgRemoveBtn'},
  store:   {uploadInput:'storeImgFileInput', preview:'storeImgPreview', hintIcon:'storeImgHintIcon', hintText:'storeImgHintText', removeBtn:'storeImgRemoveBtn'},
  agent:   {uploadInput:'agentImgFileInput', preview:'agentImgPreview', hintIcon:'agentImgHintIcon', hintText:'agentImgHintText', removeBtn:'agentImgRemoveBtn'},
};
const CROP_ASPECT = 1;           // square, like Torob product photos
let cropState = null;            // {img, naturalW, naturalH, scale, minScale, maxScale, offsetX, offsetY, frameW, frameH}
let cropDrag = null;             // {startX, startY, startOffX, startOffY} while dragging, else null
let partsReportRange = 'all';
let partsRevenueChartInstance = null;
let partsStoreChartInstance = null;
let partsBrandChartInstance = null;
let partsCarModelChartInstance = null;
let partsCumulativeChartInstance = null;
let partsUnitsChartInstance = null;
let partsTopUnitsChartInstance = null;
const QTY_PRESET_VALUES = [1,2,3,4,5,7,10,15,20,30,50];

function fmtT(n){
  n = Math.round(Number(n)||0);
  return n.toLocaleString('en-US') + ' K T';
}
function fmtToman(n){
  // Internal values are stored in "K Toman" (thousands) — invoices need the
  // real, full amount written out in Toman, not the dashboard's "K T" shorthand.
  const full = Math.round((Number(n)||0)*1000);
  return full.toLocaleString('en-US') + ' تومان';
}
function fmtNum(n){
  n = Number(n)||0;
  return (Math.round(n*100)/100).toLocaleString('en-US');
}

// ─── INIT / LOAD ───────────────────────────────────
async function initPartsBiz(){
  if(!partsLoaded){
    renderQtyPresets('purchaseQtyPresets','purchaseItemQty');
    renderQtyPresets('saleQtyPresets','saleItemQty');
    const dmHtml = '<option value="">— انتخاب نشده —</option>' + DELIVERY_METHODS.map(m=>`<option value="${m}">${m}</option>`).join('');
    const saleDm = document.getElementById('saleDeliveryMethod'); if(saleDm) saleDm.innerHTML = dmHtml;
    const purDm = document.getElementById('purchaseDeliveryMethod'); if(purDm) purDm.innerHTML = dmHtml;
    const quoteDm = document.getElementById('quoteDeliveryMethod'); if(quoteDm) quoteDm.innerHTML = dmHtml;
    const retReasonSel = document.getElementById('retReason');
    if(retReasonSel) retReasonSel.innerHTML = RETURN_REASONS.map(r=>`<option value="${r}">${r}</option>`).join('');
    const rbDim = document.getElementById('rbDimension');
    if(rbDim){
      rbDim.innerHTML = Object.entries(RB_DIMENSIONS).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('');
      onRbDimensionChange();
    }
    renderJalaliPicker('purchaseOrderDatePicker','purchaseOrderDateHidden',null,()=>{});
    renderJalaliPicker('purchaseReceiptDatePicker','purchaseReceiptDateHidden',null,()=>{});
    renderJalaliPicker('saleDatePicker','saleDateHidden',null,()=>{});
    renderJalaliPicker('cashDatePicker','cashDateHidden',null,()=>{});
    renderJalaliPicker('recDatePicker','recDateHidden',null,()=>{});
    renderJalaliPicker('peDatePicker','peDateHidden',null,()=>{});
    renderJalaliPicker('expDatePicker','expDateHidden',null,()=>{});
    renderJalaliPicker('quoteDatePicker','quoteDateHidden',null,()=>{});
    renderJalaliPicker('quoteValidUntilPicker','quoteValidUntilHidden',null,()=>{});
    renderJalaliPicker('retDatePicker','retDateHidden',null,()=>{});
    // Every dropdown that can realistically grow past a handful of items gets
    // turned into a searchable combobox — see enhanceSearchSelect() below.
    ['partsFilterCarModel','partsFilterBrand','partsFilterPartType','partsFilterCategory',
     'pfPartType','pfBrand','pfCategory','purchaseStoreSelect','purchaseItemProduct','saleItemProduct',
     'peStoreSelect','peProductSelect','peGenericSelect','pfPriceListFilterStore',
     'cpProductSelect','cpGenericSelect','cartProductSelect','cartGenericSelect','expCategorySelect','saleAgentSelect',
     'saleCustomerSelect','quoteCustomerSelect','quoteAgentSelect','quoteItemProduct','retSaleSelect']
      .forEach(id=>enhanceSearchSelect(id));
    partsLoaded = true;
  }
  await fetchParts();
  showPartsSub(partsCurrentSub);
}

// ─── SEARCHABLE SELECT (fixes native <select> RTL rendering too) ──
// Wraps an existing, already-populated <select> with a text-input-driven
// combobox. The original <select> stays in the DOM (visually hidden) as the
// single source of truth, so every existing call site that reads or writes
// `.value`, or listens for a `change` event, keeps working untouched — we
// intercept `.value =` so the visible search box stays in sync automatically.
function enhanceSearchSelect(selectId){
  const select = document.getElementById(selectId);
  if(!select || select._ssEnabled) return;
  select._ssEnabled = true;

  const wrap = document.createElement('div');
  wrap.className = 'ss-wrap';
  select.parentNode.insertBefore(wrap, select);
  wrap.appendChild(select);
  select.classList.add('ss-native');
  select.tabIndex = -1;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'ss-input builder-select';
  input.setAttribute('dir','rtl');
  input.autocomplete = 'off';
  wrap.appendChild(input);

  const dropdown = document.createElement('div');
  dropdown.className = 'ss-dropdown';
  wrap.appendChild(dropdown);

  const nativeDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  function currentLabel(){
    const opt = select.options[select.selectedIndex];
    return opt ? opt.textContent : '';
  }
  function sync(){ input.value = currentLabel(); }
  Object.defineProperty(select, 'value', {
    get(){ return nativeDesc.get.call(select); },
    set(v){ nativeDesc.set.call(select, v); sync(); },
    configurable: true,
  });
  select._ssSync = sync;

  function buildList(filter){
    const f = (filter||'').trim().toLowerCase();
    const items = Array.from(select.options).filter(o=> !f || o.textContent.toLowerCase().includes(f));
    dropdown.innerHTML = items.length
      ? items.map(o=>{
          // Product/store/agent selects tag each <option> with data-img (a
          // thumbnail) and data-icon (fallback emoji) so picking from a long
          // list is visual, not just a wall of text.
          const img = o.dataset.img;
          const icon = o.dataset.icon;
          const thumb = img ? `<img class="ss-thumb" src="${img}">` : (icon ? `<span class="ss-thumb ss-thumb-icon">${icon}</span>` : '');
          return `<div class="ss-option${o.value===select.value?' sel':''}" data-value="${escHtml(o.value)}">${thumb}<span>${escHtml(o.textContent)}</span></div>`;
        }).join('')
      : '<div class="ss-empty">موردی پیدا نشد</div>';
  }
  function closeDropdown(){ dropdown.classList.remove('open'); }
  function pick(v){
    select.value = v; // goes through the defineProperty setter above → syncs input + fires below
    closeDropdown();
    select.dispatchEvent(new Event('change', {bubbles:true}));
  }
  function freshOpen(){
    input.value = '';
    buildList('');
    dropdown.classList.add('open');
  }
  input.addEventListener('mousedown', e=>{
    // If the dropdown is already closed, every click — even on an input that
    // never lost focus (e.g. right after picking a value) — should reopen it
    // with a clean slate, instead of placing a cursor inside the old label.
    if(!dropdown.classList.contains('open')){
      e.preventDefault();
      freshOpen();
      input.focus();
    }
  });
  input.addEventListener('focus', ()=>{ if(!dropdown.classList.contains('open')) freshOpen(); });
  input.addEventListener('input', ()=>{ buildList(input.value); dropdown.classList.add('open'); });
  input.addEventListener('blur', ()=> setTimeout(()=>{ closeDropdown(); sync(); }, 150));
  input.addEventListener('keydown', e=>{
    if(e.key==='Escape'){ closeDropdown(); sync(); input.blur(); }
    else if(e.key==='Enter'){
      e.preventDefault();
      const first = dropdown.querySelector('.ss-option');
      if(first) pick(first.dataset.value);
    }
  });
  dropdown.addEventListener('mousedown', e=>{
    const item = e.target.closest('.ss-option');
    if(item) { e.preventDefault(); pick(item.dataset.value); }
  });
  sync();
}
function ssSync(id){
  const el = document.getElementById(id);
  if(el && el._ssSync) el._ssSync();
}

async function fetchParts(){
  try{
    const r = await fetch('/api/parts');
    const d = await r.json();
    Object.assign(PARTS, d);
    renderPartsAll();
  }catch(e){ console.warn('[Elevate] parts load failed', e); }
}

async function postParts(action, data){
  try{
    const r = await fetch('/api/parts',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(Object.assign({action}, data||{}))});
    const d = await r.json();
    if(!d.ok){ showToast(d.error || 'Something went wrong','error'); return d; }
    Object.assign(PARTS, d);
    renderPartsAll();
    return d;
  }catch(e){ console.warn('[Elevate] parts save failed', e); showToast('Save failed — check connection','error'); return {ok:false}; }
}

function renderPartsAll(){
  renderPartsFilters();
  renderPartsProducts();
  renderCarModelsGrid();
  renderBrandsGrid();
  renderPartTypesGrid();
  renderCategoriesGrid();
  renderStoreGrid();
  renderStoreSelect();
  renderProductSelects();
  renderPurchaseCart();
  renderSaleCart();
  renderPurchaseHistory();
  renderSalesHistory();
  renderPurchaseTabStats();
  renderSaleTabStats();
  renderCashStats();
  renderCashBreakdown();
  renderCashLedger();
  renderMoneyMovements();
  renderFullLedger();
  renderReconciliationHistory();
  renderVariablesTab();
  renderReportBuilder();
  renderPartsHero();
  renderGenericGrid();
  renderAgentGrid();
  renderAgentSelect();
  renderCustomerGrid();
  renderCustomerSelects();
  renderQuotesList();
  renderReturnSaleSelect();
  renderReturnsHistory();
  renderPriceEntryRefSelects();
  renderPriceList();
  renderComparePickers();
  renderCompareCart();
  renderExpenseLedger();
  renderExpenseTabStats();
  renderExpenseCategorySelect();
  if(document.getElementById('partsSub-reports').style.display !== 'none') renderReports();
}

const PARTS_PALETTE = ['var(--coral)','var(--sage)','var(--sky)','var(--amber)','var(--plum)','var(--rose)'];
function hashColor(str){
  if(!str) return PARTS_PALETTE[0];
  let h = 0;
  for(let i=0;i<str.length;i++) h = (h*31 + str.charCodeAt(i)) >>> 0;
  return PARTS_PALETTE[h % PARTS_PALETTE.length];
}

function isWithinDays(iso, days){
  if(!iso) return false;
  const d = new Date(iso+'T12:00:00');
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-days);
  return d >= cutoff;
}
function renderPartsHero(){
  const profit30 = PARTS.sales.filter(s=>isWithinDays(s.date,30)).reduce((s,x)=>s+x.profit,0);
  document.getElementById('heroCashVal').textContent = fmtT(PARTS.totals.cash_balance||0);
  document.getElementById('heroValueVal').textContent = fmtT(PARTS.totals.inventory_value||0);
  document.getElementById('heroBizVal').textContent = fmtT(PARTS.totals.business_value||0);
  document.getElementById('heroProfitVal').textContent = fmtT(profit30);
}

// ─── CASH / CAPITAL LEDGER ──────────────────────────
function setCashTxType(t){
  cashTxType = t;
  document.getElementById('cashTypeDepositBtn').classList.toggle('active', t==='deposit');
  document.getElementById('cashTypeWithdrawBtn').classList.toggle('active', t==='withdrawal');
}
function renderCashStats(){
  const wrap = document.getElementById('cashStats');
  if(!wrap) return;
  const netProfit = (PARTS.totals.business_value||0) - (PARTS.totals.net_capital||0);
  const stats = [
    ['🏦','Cash Balance', fmtT(PARTS.totals.cash_balance||0), 'var(--sky)'],
    ['🏷️','Inventory Value', fmtT(PARTS.totals.inventory_value||0), 'var(--amber)'],
    ['💎','Total Business Value', fmtT(PARTS.totals.business_value||0), 'var(--plum)'],
    ['📈','Net Profit (all time)', fmtT(netProfit), netProfit>=0?'var(--sage)':'var(--coral)'],
  ];
  wrap.innerHTML = stats.map(([icon,label,val,color])=>`
    <div class="parts-kpi-card" style="--kpi-color:${color}">
      <div class="parts-kpi-icon">${icon}</div>
      <div class="parts-kpi-label">${label}</div>
      <div class="parts-kpi-val" style="color:${color}">${val}</div>
    </div>`).join('');
}
// Spells out exactly why Cash Balance is what it is — every sale's revenue
// (which already carries its profit inside it) flows straight into this
// number the moment it's recorded, same as every purchase flows straight out.
function renderCashBreakdown(){
  const wrap = document.getElementById('cashBreakdownRows');
  if(!wrap) return;
  const t = PARTS.totals;
  const rows = [
    ['💰','Capital deposited', t.total_deposits||0, 'pos'],
    ['🏧','Capital withdrawn', -(t.total_withdrawals||0), 'neg'],
    ['💵','Sales revenue (all time)', t.revenue||0, 'pos'],
    ['🧾','Purchase spend (all time)', -(t.purchase_spend||0), 'neg'],
  ];
  wrap.innerHTML = rows.map(([icon,label,amt])=>`
    <div class="cashbrk-row">
      <div class="cashbrk-label">${icon} ${label}</div>
      <div class="cashbrk-amt ${amt>=0?'pos':'neg'}">${amt>=0?'+':'−'}${fmtT(Math.abs(amt))}</div>
    </div>`).join('') + `
    <div class="cashbrk-row total">
      <div class="cashbrk-label">🏦 = Cash Balance</div>
      <div class="cashbrk-amt ${(t.cash_balance||0)>=0?'pos':'neg'}">${fmtT(t.cash_balance||0)}</div>
    </div>`;
}
// A single chronological timeline of every deposit, withdrawal, purchase and
// sale — the full "what happened to my money" picture in one place.
function renderMoneyMovements(){
  const wrap = document.getElementById('moneyMovementsList');
  if(!wrap) return;
  const events = [];
  PARTS.capital_transactions.forEach(t=>{
    events.push({date:t.date, dir: t.type==='deposit'?'in':'out', amount: Number(t.amount)||0,
      label: t.type==='deposit' ? '💰 Capital deposit' : '🏧 Capital withdrawal', sub: t.note||''});
  });
  PARTS.purchases.forEach(p=>{
    const total = p.items.reduce((s,it)=>s+it.qty*it.unit_price,0);
    const store = storeById(p.store_id);
    events.push({date:p.order_date, dir:'out', amount: total,
      label: '🧾 Purchase — '+(store?store.name:'(deleted store)'),
      sub: p.items.length+' item'+(p.items.length===1?'':'s')});
  });
  PARTS.sales.forEach(s=>{
    events.push({date:s.date, dir:'in', amount: s.revenue,
      label: '💵 Sale'+(s.customer_name?' — '+s.customer_name:''),
      sub: 'profit '+fmtT(s.profit)});
  });
  events.sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  wrap.innerHTML = events.length ? events.slice(0,80).map(e=>`
    <div class="money-row ${e.dir}">
      <div class="money-row-main">
        <div class="money-row-label">${escHtml(e.label)}</div>
        <div class="money-row-sub">${jalaliFullLabel(e.date)}${e.sub?' · '+escHtml(e.sub):''}</div>
      </div>
      <div class="money-row-amt">${e.dir==='in'?'+':'−'}${fmtT(e.amount)}</div>
    </div>`).join('') : '<div class="parts-empty"><div class="pe-icon">🏦</div><div class="pe-text">No money movements yet.</div></div>';
}
async function saveCashTx(){
  const amount = parseFloat(document.getElementById('cashTxAmount').value);
  if(!amount || amount<=0){ showToast('Enter an amount','error'); return; }
  const payload = {
    type: cashTxType, amount, date: document.getElementById('cashDateHidden').value,
    note: document.getElementById('cashTxNote').value.trim(),
  };
  if(editingCashTxId){ payload.id = editingCashTxId; await postParts('update_capital_tx', payload); }
  else { await postParts('add_capital_tx', payload); }

  showToast(editingCashTxId ? 'Updated' : (cashTxType==='deposit' ? 'Deposit recorded' : 'Withdrawal recorded'),'success');
  cancelEditCashTx();
  document.getElementById('cashTxAmount').value = '';
  document.getElementById('cashTxNote').value = '';
}
function cancelEditCashTx(){
  editingCashTxId = null;
  const btn = document.querySelector('#partsSub-cash .tx-save-btn');
  if(btn) btn.textContent = 'Save';
}
function editCashTx(id){
  const t = PARTS.capital_transactions.find(x=>x.id===id);
  if(!t) return;
  editingCashTxId = id;
  showPartsSub('cash');
  setCashTxType(t.type);
  document.getElementById('cashTxAmount').value = t.amount;
  document.getElementById('cashTxNote').value = t.note||'';
  renderJalaliPicker('cashDatePicker','cashDateHidden', t.date, ()=>{});
  const btn = document.querySelector('#partsSub-cash .tx-save-btn');
  if(btn) btn.textContent = 'Update';
  showToast('Editing entry — change anything and save','success');
}
function deleteCashTx(id){
  postParts('delete_capital_tx',{id});
  showToast('Entry deleted','success');
  if(editingCashTxId===id) cancelEditCashTx();
}
function renderCashLedger(){
  const list = document.getElementById('cashLedgerList');
  if(!list) return;
  list.innerHTML = '';
  const sorted = [...PARTS.capital_transactions].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  if(!sorted.length){
    list.innerHTML = '<div class="parts-empty"><div class="pe-icon">🏦</div><div class="pe-text">No deposits or withdrawals logged yet.</div></div>';
    return;
  }
  sorted.forEach(t=>{
    const el = document.createElement('div');
    el.className = 'cash-ledger-item';
    const isAdj = t.type==='adjustment';
    const sign = isAdj ? (t.amount>=0?'+':'−') : (t.type==='deposit' ? '+' : '−');
    const icon = isAdj ? '🔧' : (t.type==='deposit' ? '💰' : '🏧');
    const colorClass = isAdj ? (t.amount>=0?'deposit':'withdrawal') : t.type;
    el.innerHTML = `
      <div class="cash-ledger-icon ${colorClass}">${icon}</div>
      <div class="cash-ledger-info">
        <div class="cash-ledger-note">${escHtml(t.note) || (isAdj?'Reconciliation adjustment':(t.type==='deposit' ? 'Deposit' : 'Withdrawal'))}</div>
        <div class="cash-ledger-date">${jalaliFullLabel(t.date)}</div>
      </div>
      <div class="cash-ledger-amount ${colorClass}">${sign} ${fmtT(Math.abs(t.amount))}</div>
      <button class="cash-ledger-edit" onclick="editCashTx('${t.id}')" title="Edit">✎</button>
      <button class="cash-ledger-del" onclick="deleteCashTx('${t.id}')" title="Delete">✕</button>`;
    list.appendChild(el);
  });
}

// ══════════════════════════════════════════════════════
//  VARIABLES PANEL — every constant/cost/percent the user has
//  fed the pricing calculator, global and per-product, in one view
// ══════════════════════════════════════════════════════
function renderVariablesTab(){
  const sumEl = document.getElementById('globalVarsSummary');
  if(sumEl){
    const g = PARTS.pricing_settings;
    const payerLabel = g.shipping_payer==='customer'?'مشتری کامل':(g.shipping_payer==='split'?`نصف‌نصف (مشتری ${Math.round((g.shipping_split_ratio||0.5)*100)}٪)`:'خودم کامل');
    sumEl.innerHTML = `
      <div class="pricing-calc-row"><span>هزینه ارسال پیش‌فرض</span><span class="pricing-calc-price">${fmtT(g.shipping_cost||0)}</span></div>
      <div class="pricing-calc-sub">پرداخت‌کننده: ${payerLabel}</div>
      <div class="pricing-calc-row" style="margin-top:8px;"><span>سهم نماینده از سود</span><span class="pricing-calc-price">${g.include_agent_share?(g.agent_share_pct+'٪'):'غیرفعال'}</span></div>
      <div class="pricing-calc-row" style="margin-top:8px;"><span>مارجین هدف پیش‌فرض</span><span class="pricing-calc-price">${g.target_margin_pct}٪</span></div>
      <div class="pricing-calc-sub">رند کردن قیمت پیشنهادی تا نزدیک‌ترین ${fmtT(g.round_step||1)}</div>`;
  }
  const custom = PARTS.products.filter(p=>p.calc_shipping_payer || p.calc_shipping_cost!=null || p.calc_include_agent_share!=null || p.calc_agent_share_pct!=null || p.calc_target_margin_pct!=null);
  const body = document.querySelector('#productVarsTable tbody');
  if(body) body.innerHTML = custom.length ? custom.map(p=>{
    const shipBits = [];
    if(p.calc_shipping_payer) shipBits.push(p.calc_shipping_payer==='customer'?'مشتری':(p.calc_shipping_payer==='split'?'نصف‌نصف':'خودم'));
    if(p.calc_shipping_cost!=null) shipBits.push(fmtT(p.calc_shipping_cost));
    const agentBits = p.calc_include_agent_share===false ? 'غیرفعال' : (p.calc_agent_share_pct!=null ? p.calc_agent_share_pct+'٪' : (p.calc_include_agent_share===true?'فعال (٪ پیش‌فرض)':'—'));
    return `<tr><td>${escHtml(productLabel(p))}</td><td>${shipBits.length?shipBits.join(' · '):'—'}</td>
      <td>${agentBits}</td><td>${p.calc_target_margin_pct!=null ? p.calc_target_margin_pct+'٪' : '—'}</td>
      <td><button class="icon-btn-sm" onclick="resetProductCalcOverrides('${p.id}')" title="بازگشت به پیش‌فرض">↺</button></td></tr>`;
  }).join('') : `<tr><td colspan="5" class="parts-table-empty">همه‌ی کالاها دارن از تنظیمات سراسری استفاده می‌کنن.</td></tr>`;

  const agentBody = document.querySelector('#agentVarsTable tbody');
  if(agentBody) agentBody.innerHTML = PARTS.sales_agents.length ? PARTS.sales_agents.map(a=>`
    <tr><td>${escHtml(a.name)}</td><td>${a.commission_percent!=null?a.commission_percent+'٪':'—'}</td>
      <td>${a.commission_basis==='revenue'?'درآمد':'سود'}</td></tr>`).join('')
    : `<tr><td colspan="3" class="parts-table-empty">نماینده‌ای تعریف نشده.</td></tr>`;
}
async function resetProductCalcOverrides(pid){
  await postParts('update_product', {id: pid, calc_shipping_payer:'', calc_shipping_cost:'',
    calc_shipping_split_ratio:'', calc_include_agent_share:'', calc_agent_share_pct:'', calc_target_margin_pct:''});
  showToast('برگشت به پیش‌فرض سراسری','success');
}

// ══════════════════════════════════════════════════════
//  REPORT BUILDER — pick a dimension + up to two metrics + a chart
//  type, built entirely from data already loaded on the client
// ══════════════════════════════════════════════════════
const RB_DIMENSIONS = {
  time: {label:'⏱️ زمان', metrics:['revenue','profit','cogs','gross_margin_pct','purchase_spend','purchases_count','expenses','units_sold','orders_count','avg_order_value','agent_commission','returns_value','returns_count','tax_collected','shipping_charged','shipping_paid','discount_given','deposits','withdrawals','cash_in','cash_out','cash_balance']},
  product: {label:'📦 محصول', metrics:['revenue','profit','cogs','qty_sold','qty_purchased','margin_pct','markup_pct','avg_cost','purchase_spend','stock','stock_value','sale_price','reorder_point']},
  brand: {label:'🏷️ برند', metrics:['revenue','profit','qty_sold','product_count','stock_value']},
  car_model: {label:'🚗 مدل خودرو', metrics:['revenue','profit','qty_sold','product_count','stock_value']},
  category: {label:'🗂️ دسته‌بندی', metrics:['revenue','profit','qty_sold','product_count','stock_value']},
  part_type: {label:'🔧 نوع قطعه', metrics:['revenue','profit','qty_sold','product_count','stock_value']},
  store: {label:'🏬 تامین‌کننده', metrics:['purchase_spend','purchase_count','items_count','avg_price_paid','payable','shipping_cost','free_shipping_min']},
  agent: {label:'🧑‍💼 نماینده فروش', metrics:['revenue','profit','orders','commission_accrued','commission_paid','commission_payable','commission_pct','avg_commission_per_order']},
  customer: {label:'👥 مشتری', metrics:['revenue','profit','orders','avg_order_value','total_discount_received','returns_value','outstanding']},
  expense_category: {label:'💸 دسته هزینه', metrics:['amount','count','avg_amount']},
  return_reason: {label:'↩️ دلیل مرجوعی', metrics:['count','value']},
  delivery_method: {label:'🚚 روش ارسال', metrics:['count','revenue','shipping_paid']},
  payment_status: {label:'💳 وضعیت پرداخت', metrics:['count','revenue','outstanding']},
};
const RB_METRIC_LABELS = {
  revenue:'درآمد', profit:'سود', cogs:'بهای تمام‌شده', gross_margin_pct:'مارجین ناخالص ٪', purchase_spend:'هزینه خرید', purchases_count:'تعداد خرید',
  expenses:'هزینه‌های جاری', units_sold:'تعداد فروخته‌شده', orders_count:'تعداد سفارش', avg_order_value:'میانگین ارزش سفارش',
  agent_commission:'پورسانت نماینده', returns_value:'ارزش مرجوعی', returns_count:'تعداد مرجوعی', tax_collected:'مالیات جمع‌شده',
  shipping_charged:'ارسال دریافتی از مشتری', shipping_paid:'ارسال پرداختی', discount_given:'تخفیف داده‌شده', deposits:'واریزها',
  withdrawals:'برداشت‌ها', cash_in:'ورودی نقدی', cash_out:'خروجی نقدی', cash_balance:'موجودی نقدی (پایان دوره)',
  qty_sold:'تعداد فروخته‌شده', qty_purchased:'تعداد خریداری‌شده', margin_pct:'مارجین ٪', markup_pct:'مارکاپ ٪', avg_cost:'میانگین قیمت خرید',
  stock:'موجودی فعلی', stock_value:'ارزش موجودی', sale_price:'قیمت فروش فعلی', reorder_point:'نقطه سفارش مجدد', product_count:'تعداد محصول',
  purchase_count:'تعداد خرید', items_count:'تعداد ردیف خرید', avg_price_paid:'میانگین قیمت پرداختی', payable:'بدهی به تامین‌کننده',
  shipping_cost:'هزینه ارسال ثبت‌شده', free_shipping_min:'حداقل ارسال رایگان', orders:'تعداد سفارش', commission_accrued:'پورسانت محاسبه‌شده',
  commission_paid:'پورسانت پرداخت‌شده', commission_payable:'پورسانت باقی‌مانده', commission_pct:'درصد پورسانت فعلی', avg_commission_per_order:'میانگین پورسانت هر سفارش',
  total_discount_received:'جمع تخفیف دریافتی', outstanding:'طلب/مانده باقی‌مانده', amount:'مبلغ', count:'تعداد', avg_amount:'میانگین مبلغ', value:'ارزش',
};
function jalaliBucket(iso, grain){
  if(!iso) return null;
  if(grain==='day') return {key: iso, label: jalaliDateFa(iso)};
  if(grain==='week'){
    const d = new Date(iso+'T12:00:00');
    const dow = d.getDay();                 // 0=Sun..6=Sat
    const sinceSat = (dow+1)%7;              // Persian week starts Saturday
    const start = new Date(d); start.setDate(d.getDate()-sinceSat);
    const wiso = start.toISOString().slice(0,10);
    return {key: wiso, label: 'هفته '+jalaliDateFa(wiso)};
  }
  const j = gregToJalali(iso);
  if(!j) return null;
  return {key: j.y+'/'+String(j.m).padStart(2,'0'), label: j.month_name+' '+j.y};
}
function getReportBuilderData(dimension, metric){
  const rows = {}; // key -> {label, value}
  const touchedDates = [];
  const bump = (key, label, v, iso)=>{ const r = rows[key] || (rows[key]={label, value:0}); r.value += (v||0); if(iso) touchedDates.push(iso); };
  const grain = document.getElementById('rbTimeGroup').value;

  if(dimension==='time'){
    const perSale = {
      revenue:s=>s.revenue, profit:s=>s.profit, cogs:s=>s.cogs,
      units_sold:s=>s.items.reduce((a,it)=>a+it.qty,0), orders_count:()=>1,
      agent_commission:s=>s.agent_commission||0, tax_collected:s=>s.tax_amount||0,
      shipping_charged:s=>s.shipping_charged_to_customer||0, discount_given:s=>(s.discount||0)+s.items.reduce((a,it)=>a+(it.discount||0),0),
      avg_order_value:s=>s.revenue,
    };
    if(perSale[metric]){
      PARTS.sales.forEach(s=>{ const b=jalaliBucket(s.date,grain); if(!b) return; bump(b.key,b.label,perSale[metric](s),s.date); });
      if(metric==='avg_order_value'){
        const counts = {};
        PARTS.sales.forEach(s=>{ const b=jalaliBucket(s.date,grain); if(!b) return; counts[b.key]=(counts[b.key]||0)+1; });
        Object.keys(rows).forEach(k=>{ if(counts[k]) rows[k].value = rows[k].value/counts[k]; });
      }
    } else if(metric==='purchase_spend'){
      PARTS.purchases.forEach(p=>{ const b=jalaliBucket(p.order_date,grain); if(!b) return;
        bump(b.key, b.label, p.items.reduce((a,it)=>a+it.qty*it.unit_price,0), p.order_date); });
    } else if(metric==='purchases_count'){
      PARTS.purchases.forEach(p=>{ const b=jalaliBucket(p.order_date,grain); if(!b) return; bump(b.key,b.label,1,p.order_date); });
    } else if(metric==='expenses'){
      PARTS.business_expenses.forEach(x=>{ const b=jalaliBucket(x.date,grain); if(!b) return; bump(b.key,b.label,x.amount||0,x.date); });
    } else if(metric==='returns_value'){
      PARTS.sale_returns.forEach(r=>{ const b=jalaliBucket(r.date,grain); if(!b) return; bump(b.key,b.label,r.refund_total||0,r.date); });
    } else if(metric==='returns_count'){
      PARTS.sale_returns.forEach(r=>{ const b=jalaliBucket(r.date,grain); if(!b) return; bump(b.key,b.label,1,r.date); });
    } else if(metric==='shipping_paid'){
      PARTS.sales.forEach(s=>{ if(!(s.shipping_cost>0)) return; const b=jalaliBucket(s.date,grain); if(!b) return; bump(b.key,b.label,s.shipping_cost,s.date); });
    } else if(metric==='deposits'){
      PARTS.capital_transactions.filter(t=>t.type==='deposit').forEach(t=>{ const b=jalaliBucket(t.date,grain); if(!b) return; bump(b.key,b.label,t.amount,t.date); });
    } else if(metric==='withdrawals'){
      PARTS.capital_transactions.filter(t=>t.type==='withdrawal').forEach(t=>{ const b=jalaliBucket(t.date,grain); if(!b) return; bump(b.key,b.label,t.amount,t.date); });
    } else if(metric==='cash_in'){
      PARTS.cash_ledger.filter(e=>e.amount>0).forEach(e=>{ const b=jalaliBucket(e.date,grain); if(!b) return; bump(b.key,b.label,e.amount,e.date); });
    } else if(metric==='cash_out'){
      PARTS.cash_ledger.filter(e=>e.amount<0).forEach(e=>{ const b=jalaliBucket(e.date,grain); if(!b) return; bump(b.key,b.label,-e.amount,e.date); });
    } else if(metric==='cash_balance'){
      const sorted = [...PARTS.cash_ledger].sort((a,b)=>(a.date||'').localeCompare(b.date||''));
      sorted.forEach(e=>{ const b=jalaliBucket(e.date,grain); if(!b) return; rows[b.key] = {label:b.label, value:e.running_balance}; touchedDates.push(e.date); });
    } else if(metric==='gross_margin_pct'){
      const rev={}, cogs={};
      PARTS.sales.forEach(s=>{ const b=jalaliBucket(s.date,grain); if(!b) return; rev[b.key]=(rev[b.key]||0)+s.revenue; cogs[b.key]=(cogs[b.key]||0)+s.cogs;
        rows[b.key]={label:b.label,value:0}; touchedDates.push(s.date); });
      Object.keys(rows).forEach(k=> rows[k].value = rev[k]>0 ? (rev[k]-cogs[k])/rev[k]*100 : 0);
    }
    // zero-fill the time series across the whole touched range, if asked
    const fillZero = document.getElementById('rbFillZero') && document.getElementById('rbFillZero').checked;
    if(fillZero && touchedDates.length){
      const minD = touchedDates.reduce((a,b)=>a<b?a:b), maxD = touchedDates.reduce((a,b)=>a>b?a:b);
      let cur = new Date(minD+'T12:00:00'); const end = new Date(maxD+'T12:00:00');
      while(cur <= end){
        const iso = cur.toISOString().slice(0,10);
        const b = jalaliBucket(iso, grain);
        if(b && !(b.key in rows)) rows[b.key] = {label:b.label, value:0};
        cur.setDate(cur.getDate()+1);
      }
    }
  } else if(dimension==='product'){
    Object.entries(PARTS.by_product||{}).forEach(([pid,v])=>{
      const p = productById(pid); if(!p) return;
      const label = productLabel(p);
      const vals = {
        revenue:v.revenue, profit:v.profit, cogs:v.cogs, qty_sold:v.qty_sold, qty_purchased:v.qty_purchased, purchase_spend:v.spend,
        margin_pct: v.revenue>0 ? v.profit/v.revenue*100 : 0,
        markup_pct: (PARTS.avg_cost[pid]||0)>0 ? v.profit/v.qty_sold/(PARTS.avg_cost[pid])*100 : 0,
        avg_cost: PARTS.avg_cost[pid]||0, stock: PARTS.stock[pid]||0, stock_value: (PARTS.stock[pid]||0)*(PARTS.avg_cost[pid]||0),
        sale_price: p.sale_price||0, reorder_point: p.reorder_point||0,
      };
      rows[pid] = {label, value: vals[metric]||0};
    });
  } else if(['brand','car_model','category','part_type'].includes(dimension)){
    const field = dimension;
    const groups = {};
    PARTS.products.forEach(p=>{
      const key = p[field] || '— نامشخص —';
      const v = PARTS.by_product[p.id] || {revenue:0,profit:0,qty_sold:0,spend:0};
      const g = groups[key] || (groups[key]={revenue:0,profit:0,qty_sold:0,product_count:0,stock_value:0});
      g.revenue+=v.revenue; g.profit+=v.profit; g.qty_sold+=v.qty_sold; g.product_count+=1;
      g.stock_value += (PARTS.stock[p.id]||0)*(PARTS.avg_cost[p.id]||0);
    });
    Object.entries(groups).forEach(([key,g])=>{ rows[key]={label:key, value:g[metric]||0}; });
  } else if(dimension==='store'){
    Object.entries(PARTS.by_store||{}).forEach(([sid,v])=>{
      const st = storeById(sid); const label = st ? st.name : '(deleted)';
      const vals = {
        purchase_spend:v.spend, purchase_count:v.purchase_count, items_count:v.items_count,
        avg_price_paid: v.items_count>0 ? v.spend/v.items_count : 0,
        payable:(PARTS.ap_by_store[sid]||{}).outstanding||0,
        shipping_cost: st ? (st.shipping_cost||0) : 0, free_shipping_min: st ? (st.free_shipping_min||0) : 0,
      };
      rows[sid] = {label, value: vals[metric]||0};
    });
  } else if(dimension==='agent'){
    PARTS.sales_agents.forEach(a=>{
      const v = PARTS.agent_summary[a.id] || {revenue:0,profit:0,orders:0,accrued:0,paid:0,payable:0};
      const vals = {
        revenue:v.revenue, profit:v.profit, orders:v.orders, commission_accrued:v.accrued, commission_paid:v.paid,
        commission_payable:v.payable, commission_pct: a.commission_percent||0,
        avg_commission_per_order: v.orders>0 ? v.accrued/v.orders : 0,
      };
      rows[a.id] = {label:a.name, value: vals[metric]||0};
    });
  } else if(dimension==='customer'){
    const byCust = {};
    PARTS.sales.forEach(s=>{
      const key = s.customer_id || s.customer_name || 'بدون نام';
      const label = s.customer_name || 'بدون نام';
      const c = byCust[key] || (byCust[key]={label, revenue:0, profit:0, orders:0, discount:0});
      c.revenue += s.revenue||0; c.profit += s.profit||0; c.orders += 1;
      c.discount += (s.discount||0)+s.items.reduce((a,it)=>a+(it.discount||0),0);
    });
    PARTS.sale_returns.forEach(r=>{
      const sale = PARTS.sales.find(s=>s.id===r.sale_id); if(!sale) return;
      const key = sale.customer_id || sale.customer_name || 'بدون نام';
      const c = byCust[key]; if(c) c.returns_value = (c.returns_value||0) + (r.refund_total||0);
    });
    Object.entries(byCust).forEach(([key,c])=>{
      const vals = {
        revenue:c.revenue, profit:c.profit, orders:c.orders, avg_order_value: c.orders>0?c.revenue/c.orders:0,
        total_discount_received:c.discount, returns_value:c.returns_value||0,
        outstanding:(PARTS.ar_by_customer[c.label]||{}).outstanding||0,
      };
      rows[key] = {label:c.label, value: vals[metric]||0};
    });
  } else if(dimension==='expense_category'){
    Object.entries(PARTS.expenses_by_category||{}).forEach(([cat,v])=>{
      const vals = {amount:v.amount, count:v.count, avg_amount: v.count>0?v.amount/v.count:0};
      rows[cat] = {label:cat, value: vals[metric]||0};
    });
  } else if(dimension==='return_reason'){
    Object.entries(PARTS.returns_by_reason||{}).forEach(([reason,v])=>{
      rows[reason] = {label:reason, value: (metric==='count'?v.count:v.value)||0};
    });
  } else if(dimension==='delivery_method'){
    const groups = {};
    PARTS.sales.filter(s=>s.delivery_method).forEach(s=>{
      const g = groups[s.delivery_method] || (groups[s.delivery_method]={count:0, revenue:0, shipping:0});
      g.count+=1; g.revenue+=s.revenue; g.shipping+=s.shipping_cost||0;
    });
    Object.entries(groups).forEach(([key,g])=>{
      const vals = {count:g.count, revenue:g.revenue, shipping_paid:g.shipping};
      rows[key]={label:key, value:vals[metric]||0};
    });
  } else if(dimension==='payment_status'){
    const labels = {paid:'پرداخت‌شده', partial:'قسمتی', unpaid:'نسیه'};
    const groups = {};
    PARTS.sales.forEach(s=>{
      const st = s.payment_status||'paid';
      const g = groups[st] || (groups[st]={count:0, revenue:0, outstanding:0});
      g.count+=1; g.revenue+=s.invoice_total||0; g.outstanding+=s.amount_outstanding||0;
    });
    Object.entries(groups).forEach(([key,g])=>{
      const vals = {count:g.count, revenue:g.revenue, outstanding:g.outstanding};
      rows[key]={label:labels[key]||key, value:vals[metric]||0};
    });
  }
  return Object.entries(rows).map(([key,r])=>({key, label:r.label, value:r.value})).sort((a,b)=>a.key.localeCompare(b.key));
}
function onRbDimensionChange(){
  const dim = document.getElementById('rbDimension').value;
  const cfg = RB_DIMENSIONS[dim];
  ['rbMetric1'].forEach(id=>{
    const sel = document.getElementById(id);
    sel.innerHTML = cfg.metrics.map(m=>`<option value="${m}">${RB_METRIC_LABELS[m]}</option>`).join('');
  });
  const sel2 = document.getElementById('rbMetric2');
  sel2.innerHTML = '<option value="">— هیچی —</option>' + cfg.metrics.map(m=>`<option value="${m}">${RB_METRIC_LABELS[m]}</option>`).join('');
  document.getElementById('rbTimeGroupWrap').style.display = dim==='time' ? 'block' : 'none';
  renderReportBuilder();
}
let rbChartInstance = null;
function renderReportBuilder(){
  const dim = document.getElementById('rbDimension').value;
  const metric1 = document.getElementById('rbMetric1').value;
  const metric2 = document.getElementById('rbMetric2').value;
  const type = document.getElementById('rbChartType').value;
  const out = document.getElementById('rbOutput');
  if(!dim || !metric1){ out.innerHTML=''; return; }
  const data1 = getReportBuilderData(dim, metric1);
  const data2 = metric2 ? getReportBuilderData(dim, metric2) : null;
  const fmtVal = (v)=> (dim==='time' && (metric1==='units_sold'||metric1==='orders_count')) ? fmtNum(v) : fmtT(v);

  if(type==='number'){
    const total1 = data1.reduce((s,r)=>s+r.value,0);
    out.innerHTML = `<div class="parts-kpi-card" style="--kpi-color:var(--sage);"><div class="parts-kpi-label">${RB_METRIC_LABELS[metric1]} (جمع کل)</div><div class="parts-kpi-val" style="color:var(--sage);">${fmtVal(total1)}</div></div>`;
    return;
  }
  if(type==='table'){
    out.innerHTML = `<table class="parts-table" id="rbTable"><thead><tr><th>${RB_DIMENSIONS[dim].label}</th><th>${RB_METRIC_LABELS[metric1]}</th>${data2?`<th>${RB_METRIC_LABELS[metric2]}</th>`:''}</tr></thead>
      <tbody>${data1.map(r=>{
        const r2 = data2 ? (data2.find(x=>x.key===r.key)||{value:0}) : null;
        return `<tr><td>${escHtml(r.label)}</td><td>${fmtVal(r.value)}</td>${r2?`<td>${fmtVal(r2.value)}</td>`:''}</tr>`;
      }).join('') || `<tr><td colspan="${data2?3:2}" class="parts-table-empty">داده‌ای نیست.</td></tr>`}</tbody></table>`;
    return;
  }
  // chart types need a canvas
  out.innerHTML = `<div class="mchart-wrap" style="height:320px;"><canvas id="rbCanvas"></canvas></div>
    <table class="parts-table" id="rbTable" style="display:none;"><thead><tr><th>${RB_DIMENSIONS[dim].label}</th><th>${RB_METRIC_LABELS[metric1]}</th></tr></thead>
    <tbody>${data1.map(r=>`<tr><td>${escHtml(r.label)}</td><td>${r.value}</td></tr>`).join('')}</tbody></table>`;
  const ctx = document.getElementById('rbCanvas');
  if(rbChartInstance) rbChartInstance.destroy();
  const palette = ['#e85d3a','#3a7a5a','#2a6a9a','#d4821a','#7a3a6a','#c44a6a','#5a9a7a','#f07a5c'];
  if(type==='pie'){
    rbChartInstance = new Chart(ctx, {type:'doughnut', data:{labels:data1.map(r=>r.label),
      datasets:[{data:data1.map(r=>r.value), backgroundColor:data1.map((_,i)=>palette[i%palette.length])}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:11}}}}}});
  } else {
    const datasets = [{label:RB_METRIC_LABELS[metric1], data:data1.map(r=>r.value), borderColor:palette[0], backgroundColor:type==='bar'?palette[0]:palette[0]+'22', tension:0.25}];
    if(data2) datasets.push({label:RB_METRIC_LABELS[metric2], data:data1.map(r=>{const m=data2.find(x=>x.key===r.key); return m?m.value:0;}), borderColor:palette[1], backgroundColor:type==='bar'?palette[1]:palette[1]+'22', tension:0.25, yAxisID: data2?'y1':'y'});
    const scales = {y:{ticks:{font:{size:10}}},x:{ticks:{font:{size:10}}}};
    if(data2) scales.y1 = {position:'right', ticks:{font:{size:10}}, grid:{drawOnChartArea:false}};
    rbChartInstance = new Chart(ctx, {type, data:{labels:data1.map(r=>r.label), datasets},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:11}}}}, scales}});
  }
}

function renderFullLedger(){
  const body = document.querySelector('#fullLedgerTable tbody');
  if(!body) return;
  const sorted = [...(PARTS.cash_ledger||[])].sort((a,b)=>(b.date||'').localeCompare(a.date||'') || 0);
  if(!sorted.length){
    body.innerHTML = `<tr><td colspan="4" class="parts-table-empty">هنوز هیچ رویداد پولی ثبت نشده.</td></tr>`;
    return;
  }
  body.innerHTML = sorted.map(e=>`
    <tr><td>${jalaliFullLabel(e.date)}</td><td>${escHtml(e.description)}</td>
      <td style="font-weight:700;color:${e.amount>=0?'var(--sage)':'var(--coral)'};">${e.amount>=0?'+':''}${fmtT(e.amount)}</td>
      <td>${fmtT(e.running_balance)}</td></tr>`).join('');
}

let reconciliationPreview = null;
function previewReconciliation(){
  const actual = parseFloat(document.getElementById('recActualBalance').value);
  if(isNaN(actual)){ showToast('موجودی واقعی رو وارد کن','error'); return; }
  const system = PARTS.totals.cash_balance || 0;
  const diff = Math.round((actual - system)*100)/100;
  reconciliationPreview = {actual, system, diff};
  const el = document.getElementById('recPreview');
  if(Math.abs(diff) < 0.01){
    el.innerHTML = `<div class="parts-kpi-card" style="--kpi-color:var(--sage);"><div class="parts-kpi-label">نتیجه</div><div class="parts-kpi-val" style="color:var(--sage);">✅ مغایرتی نیست — سیستم و واقعیت یکی‌ان</div></div>
      <button class="tx-save-btn" style="margin-top:10px;" onclick="saveReconciliation(false)">ثبت این بررسی</button>`;
  } else {
    el.innerHTML = `
      <div class="parts-kpi-card" style="--kpi-color:var(--coral);">
        <div class="parts-kpi-label">مغایرت پیدا شد</div>
        <div class="parts-kpi-val" style="color:var(--coral);">${diff>0?'+':''}${fmtT(diff)}</div>
      </div>
      <div style="font-size:12px;color:var(--text3);margin:8px 0;">سیستم می‌گه ${fmtT(system)}، تو گفتی ${fmtT(actual)} — یعنی ${diff>0?'سیستم کمتر از واقعیت حساب کرده':'سیستم بیشتر از واقعیت حساب کرده'}.</div>
      <div style="display:flex;gap:8px;">
        <button class="tx-save-btn" style="margin:0;" onclick="saveReconciliation(true)">✅ ثبت + تعدیل خودکار</button>
        <button class="parts-header-btn" onclick="saveReconciliation(false)">فقط ثبت کن (بدون تعدیل)</button>
      </div>`;
  }
}
async function saveReconciliation(createAdjustment){
  if(!reconciliationPreview){ showToast('اول محاسبه مغایرت رو بزن','error'); return; }
  await postParts('add_reconciliation', {
    date: document.getElementById('recDateHidden').value,
    actual_balance: reconciliationPreview.actual,
    note: document.getElementById('recNote').value.trim(),
    create_adjustment: createAdjustment,
  });
  showToast(createAdjustment ? 'مغایرت‌گیری و تعدیل ثبت شد' : 'مغایرت‌گیری ثبت شد','success');
  reconciliationPreview = null;
  document.getElementById('recActualBalance').value = '';
  document.getElementById('recNote').value = '';
  document.getElementById('recPreview').innerHTML = '';
}
function deleteReconciliation(id){
  if(!confirm('حذف این سابقه مغایرت‌گیری؟ (تعدیلی که ثبت شده حذف نمی‌شه، فقط این سابقه)')) return;
  postParts('delete_reconciliation', {id});
}
function renderReconciliationHistory(){
  const list = document.getElementById('reconciliationHistory');
  if(!list) return;
  const sorted = [...(PARTS.reconciliations||[])].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  if(!sorted.length){
    list.innerHTML = '<div class="parts-empty"><div class="pe-icon">🧮</div><div class="pe-text">هنوز مغایرت‌گیری‌ای ثبت نشده.</div></div>';
    return;
  }
  list.innerHTML = sorted.map(r=>`
    <div class="cash-ledger-item">
      <div class="cash-ledger-icon ${Math.abs(r.difference)<0.01?'deposit':'withdrawal'}">${Math.abs(r.difference)<0.01?'✅':'⚠️'}</div>
      <div class="cash-ledger-info">
        <div class="cash-ledger-note">سیستم: ${fmtT(r.system_balance)} · واقعی: ${fmtT(r.actual_balance)}${r.adjustment_created?' · تعدیل ثبت شد':''}${r.note?' · '+escHtml(r.note):''}</div>
        <div class="cash-ledger-date">${jalaliFullLabel(r.date)}</div>
      </div>
      <div class="cash-ledger-amount ${r.difference>=0?'deposit':'withdrawal'}">${r.difference>=0?'+':''}${fmtT(r.difference)}</div>
      <button class="cash-ledger-del" onclick="deleteReconciliation('${r.id}')" title="Delete">✕</button>
    </div>`).join('');
}

const SUBNAV_GROUPS = {
  catalog: ['carmodels','brands','parttypes','categories','genericitems'],
  parties: ['stores','agents','customers'],
  buying: ['pricelists','compare','purchase'],
  selling: ['quotes','sales','returns'],
  finance: ['expenses','cash','ledger'],
  analysis: ['variables','reportbuilder','reports'],
};
function showPartsSub(name){
  partsCurrentSub = name;
  ['products','carmodels','brands','parttypes','categories','genericitems','stores','agents','customers','pricelists','compare','purchase','quotes','sales','returns','expenses','cash','ledger','variables','reportbuilder','reports'].forEach(s=>{
    document.getElementById('partsSub-'+s).style.display = s===name ? 'block' : 'none';
  });
  document.querySelectorAll('.parts-subtab[data-sub], .subnav-dropdown button[data-sub]').forEach(b=>b.classList.toggle('active', b.dataset.sub===name));
  const ownerGroup = Object.entries(SUBNAV_GROUPS).find(([,items])=>items.includes(name));
  document.querySelectorAll('.parts-subtab.group-btn').forEach(b=>{
    const g = b.closest('.parts-subnav-group').dataset.group;
    b.classList.toggle('has-active', !!ownerGroup && ownerGroup[0]===g);
  });
  if(name==='reports') renderReports();
}
let openSubnavGroup = null;
function toggleSubnavGroup(g, ev){
  if(ev) ev.stopPropagation();
  if(openSubnavGroup === g){ closeAllSubnavGroups(); return; }
  closeAllSubnavGroups();
  openSubnavGroup = g;
  document.getElementById('subnavDropdown-'+g).classList.add('open');
}
function closeAllSubnavGroups(){
  document.querySelectorAll('.subnav-dropdown').forEach(d=>d.classList.remove('open'));
  openSubnavGroup = null;
}
function pickSubnavItem(sub){
  showPartsSub(sub);
  closeAllSubnavGroups();
}
document.addEventListener('click', e=>{
  if(!e.target.closest('.parts-subnav-group')) closeAllSubnavGroups();
});

// Every popup form in this module (and anywhere else the shared .overlay
// pattern is used) closes when you click the dimmed backdrop — same as the
// picture-crop and generic modals already behaved, just made universal so
// no form needs a scroll-to-the-bottom "Cancel" click to dismiss it.
document.addEventListener('click', e=>{
  if(e.target.classList && e.target.classList.contains('overlay') && e.target.classList.contains('open')){
    e.target.classList.remove('open');
  }
});
document.addEventListener('keydown', e=>{
  if(e.key !== 'Escape') return;
  const open = document.querySelector('.overlay.open');
  if(open) open.classList.remove('open');
});

// ─── HELPERS ───────────────────────────────────────
function productById(id){ return PARTS.products.find(p=>p.id===id); }
function storeById(id){ return PARTS.stores.find(s=>s.id===id); }
function genericById(id){ return PARTS.generic_products.find(g=>g.id===id); }
function refLabel(refType, refId){
  if(refType==='generic'){ const g=genericById(refId); return g ? ('🏷️ '+g.name) : '(deleted generic item)'; }
  const p = productById(refId); return p ? ('📦 '+productLabel(p)) : '(deleted product)';
}
function refKey(refType, refId){ return refType+':'+refId; }
const CAR_MODEL_SEP = '|'; // stored inside the single car_model text field so it survives backends that only know that one field
function productCarModels(p){
  // Multi-select car models are packed into the existing car_model string, separated by CAR_MODEL_SEP.
  if(!p || !p.car_model) return [];
  return String(p.car_model).split(CAR_MODEL_SEP).map(s=>s.trim()).filter(Boolean);
}
function productLabel(p){
  if(!p) return '(deleted product)';
  const parts = [p.part_type, productCarModels(p).join('/'), p.brand, p.variant ? '('+p.variant+')' : ''].filter(Boolean);
  return p.name || parts.join(' — ') || 'Unnamed product';
}
function productShortSpec(p){
  return [productCarModels(p).join('/'), p.brand, p.variant].filter(Boolean).join(' · ');
}

function renderQtyPresets(containerId, targetInputId){
  const c = document.getElementById(containerId);
  if(!c) return;
  c.innerHTML = '';
  QTY_PRESET_VALUES.forEach(v=>{
    const b = document.createElement('button');
    b.className = 'preset';
    b.type = 'button';
    b.textContent = v;
    b.onclick = ()=>{ document.getElementById(targetInputId).value = v; };
    c.appendChild(b);
  });
}

// ─── PRODUCTS: filters + grid ──────────────────────
function renderPartsFilters(){
  const fill = (id, values)=>{
    const sel = document.getElementById(id);
    const cur = sel.value;
    sel.innerHTML = '<option value="">' + sel.options[0].textContent + '</option>';
    [...new Set(values.filter(Boolean))].sort().forEach(v=>{
      const o = document.createElement('option'); o.value=v; o.textContent=v; sel.appendChild(o);
    });
    if([...sel.options].some(o=>o.value===cur)) sel.value = cur;
    ssSync(id);
  };
  // Car model / brand / part type / category filters are sourced from their
  // managed lists (their own tabs), plus any legacy free-text values still
  // sitting on old products saved before those tabs existed.
  const managedNames = PARTS.car_models.map(c=>c.name);
  const legacyNames = PARTS.products.flatMap(p=>productCarModels(p));
  fill('partsFilterCarModel', [...managedNames, ...legacyNames]);
  const managedBrandNames = PARTS.brands.map(b=>b.name);
  const legacyBrandNames = PARTS.products.map(p=>p.brand);
  fill('partsFilterBrand', [...managedBrandNames, ...legacyBrandNames]);
  const managedPartTypeNames = PARTS.part_types.map(t=>t.name);
  const legacyPartTypeNames = PARTS.products.map(p=>p.part_type);
  fill('partsFilterPartType', [...managedPartTypeNames, ...legacyPartTypeNames]);
  const managedCatNames = PARTS.categories.map(c=>c.name);
  const legacyCatNames = PARTS.products.map(p=>p.category);
  fill('partsFilterCategory', [...managedCatNames, ...legacyCatNames]);
}

let bulkSelectedProducts = new Set();
function toggleBulkSelect(pid){
  if(bulkSelectedProducts.has(pid)) bulkSelectedProducts.delete(pid);
  else bulkSelectedProducts.add(pid);
  renderBulkBar();
}
function selectAllVisibleProducts(){
  document.querySelectorAll('#partsProductGrid .part-card-select').forEach(cb=>{
    const pid = cb.id.replace('psel_','');
    bulkSelectedProducts.add(pid);
    cb.checked = true;
  });
  renderBulkBar();
}
function clearBulkSelection(){
  bulkSelectedProducts.clear();
  document.querySelectorAll('.part-card-select').forEach(cb=>cb.checked=false);
  renderBulkBar();
}
let bulkField = 'sale_price';
function setBulkField(field){
  bulkField = field;
  document.querySelectorAll('#bulkFieldToggle button').forEach(b=>b.classList.toggle('active', b.dataset.field===field));
  document.getElementById('bulkOpsPrice').style.display = field==='sale_price' ? 'block' : 'none';
  document.getElementById('bulkOpsAgent').style.display = field==='agent_share_pct' ? 'block' : 'none';
  renderBulkValueHint();
}
const BULK_HINTS = {
  markup_from_cost: {label:'درصد مارکاپ', hint:'فقط روی کالاهایی اعمال می‌شه که حداقل یه بار خریدیشون؛ بقیه رد می‌شن.', needsValue:true, unit:'٪'},
  set_flat: {label:'مقدار ثابت', hint:'', needsValue:true, unit:''},
  adjust_relative: {label:'درصد تغییر (مثبت = افزایش، منفی = کاهش)', hint:'', needsValue:true, unit:'٪'},
  adjust_flat: {label:'مبلغ تغییر (مثبت = افزایش، منفی = کاهش)', hint:'فقط روی کالاهایی که از قبل قیمت فروش دارن.', needsValue:true, unit:''},
  adjust_points: {label:'واحد درصد تغییر', hint:'', needsValue:true, unit:'امتیاز ٪'},
  disable: {label:'', hint:'سهم نماینده برای کالاهای انتخاب‌شده صفر می‌شه.', needsValue:false, unit:''},
  clear: {label:'', hint:'برمی‌گرده به حالت خالی/پیش‌فرض.', needsValue:false, unit:''},
};
function renderBulkValueHint(){
  const op = bulkField==='sale_price' ? document.getElementById('bulkOpPrice').value : document.getElementById('bulkOpAgent').value;
  const h = BULK_HINTS[op] || {label:'مقدار', hint:'', needsValue:true};
  document.getElementById('bulkValueWrap').style.display = h.needsValue ? 'block' : 'none';
  document.getElementById('bulkValueLabel').textContent = h.label + (h.unit?' ('+h.unit+')':'');
  document.getElementById('bulkValueHint').textContent = h.hint;
}
function openBulkEditModal(){
  if(!bulkSelectedProducts.size){ showToast('اول چندتا کالا انتخاب کن','error'); return; }
  document.getElementById('bulkEditCountLabel').textContent = `روی ${bulkSelectedProducts.size} کالای انتخاب‌شده اعمال می‌شه`;
  setBulkField('sale_price');
  document.getElementById('bulkOpPrice').value = 'markup_from_cost';
  document.getElementById('bulkValue').value = '';
  document.getElementById('bulkPreview').innerHTML = '';
  renderBulkValueHint();
  document.getElementById('bulkEditModalOverlay').classList.add('open');
}
function closeBulkEditModal(){ document.getElementById('bulkEditModalOverlay').classList.remove('open'); }
async function applyBulkEdit(){
  const op = bulkField==='sale_price' ? document.getElementById('bulkOpPrice').value : document.getElementById('bulkOpAgent').value;
  const h = BULK_HINTS[op];
  const value = document.getElementById('bulkValue').value.trim();
  if(h.needsValue && value===''){ showToast('یه مقدار وارد کن','error'); return; }
  const res = await postParts('bulk_update_products', {
    field: bulkField, op, value: value || null, product_ids: [...bulkSelectedProducts],
  });
  if(!res || res.ok===false) return;
  showToast('ویرایش گروهی اعمال شد','success');
  closeBulkEditModal();
  clearBulkSelection();
}
function renderBulkBar(){
  const bar = document.getElementById('bulkBar');
  if(!bar) return;
  const n = bulkSelectedProducts.size;
  bar.style.display = n>0 ? 'flex' : 'none';
  const countEl = document.getElementById('bulkCount');
  if(countEl) countEl.textContent = n;
}
function renderPartsProducts(){
  const grid = document.getElementById('partsProductGrid');
  const q = (document.getElementById('partsSearchInput').value||'').trim().toLowerCase();
  const fCar = document.getElementById('partsFilterCarModel').value;
  const fBrand = document.getElementById('partsFilterBrand').value;
  const fPartType = document.getElementById('partsFilterPartType').value;
  const fCat = document.getElementById('partsFilterCategory').value;

  const clearBtn = document.getElementById('ptClearFiltersBtn');
  if(clearBtn) clearBtn.style.display = (q||fCar||fBrand||fPartType||fCat) ? 'inline-block' : 'none';

  let list = PARTS.products.filter(p=>{
    if(fCar && !productCarModels(p).includes(fCar)) return false;
    if(fBrand && p.brand !== fBrand) return false;
    if(fPartType && p.part_type !== fPartType) return false;
    if(fCat && p.category !== fCat) return false;
    if(q){
      const hay = [p.name,productCarModels(p).join(' '),p.brand,p.part_type,p.variant,p.oem_code,p.notes].join(' ').toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });

  grid.innerHTML = '';
  if(!list.length){
    grid.innerHTML = '<div class="parts-empty"><div class="pe-icon">🔩</div><div class="pe-text">No products yet — click "+ Add Product" to define your first part.</div></div>';
    renderBulkBar();
    return;
  }
  list.forEach(p=>{
    const stock = PARTS.stock[p.id] || 0;
    const cost = PARTS.avg_cost[p.id] || 0;
    const thresh = PARTS.low_stock_threshold;
    const stockClass = stock<=0 ? 'out' : (stock<=thresh ? 'low' : 'ok');
    const stockIcon = stock<=0 ? '✕' : (stock<=thresh ? '⚠' : '●');
    const stockLabel = stock<=0 ? 'Out of stock' : (stock + ' in stock');
    const stripeColor = hashColor(p.category || p.part_type || p.brand);
    const el = document.createElement('div');
    el.className = 'part-card';
    el.innerHTML = `
      <div class="parts-cat-stripe" style="background:${stripeColor}"></div>
      <input type="checkbox" class="part-card-select" id="psel_${p.id}" onclick="event.stopPropagation();toggleBulkSelect('${p.id}')" ${bulkSelectedProducts.has(p.id)?'checked':''}/>
      <div class="part-card-img">${p.image ? `<img src="${p.image}">` : '🔩'}</div>
      <div class="part-card-body">
        <div class="part-card-title">${escHtml(productLabel(p))}</div>
        <div class="part-card-spec">${escHtml(productShortSpec(p)) || '&nbsp;'}</div>
        <div class="part-card-badges">
          ${p.category ? `<span class="part-badge" style="background:${stripeColor}22;color:${stripeColor}">${escHtml(p.category)}</span>` : ''}
          ${p.oem_code ? `<span class="part-badge">${escHtml(p.oem_code)}</span>` : ''}
        </div>
        <div class="part-card-stock ${stockClass}">${stockIcon} ${stockLabel}</div>
        ${stock>0 ? `<div class="part-card-cost">avg cost ${fmtT(cost)}</div>` : ''}
        ${p.sale_price ? `<div class="part-card-cost" style="color:var(--good,#2f9e5b);font-weight:700;">sale price ${fmtT(p.sale_price)}${cost>0 ? ` · margin ${(((p.sale_price-cost)/p.sale_price)*100).toFixed(0)}%` : ''}</div>` : ''}
        ${cost>0 ? renderPricingCalcBlock(p, cost) : ''}
      </div>
      <div class="part-card-actions">
        ${p.torob_link ? `<a href="${escHtml(p.torob_link)}" target="_blank" rel="noopener" style="flex:1;padding:7px;border-radius:8px;border:1.5px solid var(--cream3);background:var(--cream2);font-size:11px;font-weight:600;color:var(--text2);text-align:center;text-decoration:none;">Torob ↗</a>` : ''}
        <button onclick="openProductModal('${p.id}')">✎ Edit</button>
        <button class="del" onclick="deleteProduct('${p.id}')">🗑 Delete</button>
      </div>`;
    grid.appendChild(el);
  });
  renderBulkBar();
}
function effectivePricingSettings(p){
  // Every knob is optional per-product: a null/undefined override falls back
  // to the global default, so most products silently inherit the global
  // assumptions and only the ones you've customized diverge.
  const g = PARTS.pricing_settings;
  return {
    shipping_cost: p.calc_shipping_cost!=null ? p.calc_shipping_cost : g.shipping_cost,
    shipping_payer: p.calc_shipping_payer || g.shipping_payer || 'business',
    shipping_split_ratio: p.calc_shipping_split_ratio!=null ? p.calc_shipping_split_ratio : (g.shipping_split_ratio!=null ? g.shipping_split_ratio : 0.5),
    include_agent_share: p.calc_include_agent_share!=null ? p.calc_include_agent_share : g.include_agent_share,
    agent_share_pct: p.calc_agent_share_pct!=null ? p.calc_agent_share_pct : g.agent_share_pct,
    target_margin_pct: p.calc_target_margin_pct!=null ? p.calc_target_margin_pct : g.target_margin_pct,
    round_step: g.round_step,
    _overridden: {
      shipping: p.calc_shipping_payer!=null || p.calc_shipping_cost!=null,
      agent: p.calc_include_agent_share!=null || p.calc_agent_share_pct!=null,
      margin: p.calc_target_margin_pct!=null,
    },
  };
}
function computeSuggestedPrice(cost, settings){
  const shippingTotal = Number(settings.shipping_cost)||0;
  // Who pays shipping decides how much of it the SELL PRICE actually needs to
  // recover — fully if you eat it, nothing if the customer pays it outright,
  // half-and-half if it's split (same three-way choice as on a real sale).
  const payer = settings.shipping_payer || 'business';
  const ratio = Number(settings.shipping_split_ratio!=null ? settings.shipping_split_ratio : 0.5);
  const shippingToRecover = payer==='customer' ? 0 : (payer==='split' ? shippingTotal*(1-ratio) : shippingTotal);
  const includeAgent = !!settings.include_agent_share;
  const agentPct = Number(settings.agent_share_pct)||0;
  const m = (Number(settings.target_margin_pct)||0)/100;
  const k = includeAgent ? (1 - agentPct/100) : 1;
  const step = Number(settings.round_step)||1;
  if(k - m <= 0.0001){
    return {feasible:false};
  }
  const raw = k*(cost+shippingToRecover)/(k-m);
  const price = Math.ceil(raw/step)*step;   // round UP so the target margin is never undershot
  const grossProfit = price - cost - shippingToRecover;
  const agentCut = includeAgent ? grossProfit*agentPct/100 : 0;
  const netProfit = grossProfit - agentCut;
  const marginPct = price>0 ? netProfit/price*100 : 0;
  const markupPct = cost>0 ? netProfit/cost*100 : 0;
  return {feasible:true, price, grossProfit, agentCut, netProfit, marginPct, markupPct, shippingToRecover, shippingTotal, payer};
}
function renderPricingCalcBlock(p, cost){
  const eff = effectivePricingSettings(p);
  const r = computeSuggestedPrice(cost, eff);
  const customBadge = (eff._overridden.shipping||eff._overridden.agent||eff._overridden.margin)
    ? `<span style="font-size:9px;font-weight:700;color:var(--plum);border:1px solid var(--plum);border-radius:8px;padding:1px 6px;">تنظیم اختصاصی</span>` : '';
  if(!r.feasible){
    return `<div class="pricing-calc-block infeasible">🧮 با این تنظیمات نمی‌شه به مارجین هدف رسید — سهم مکانیک یا مارجین رو کم کن. ${customBadge}</div>`;
  }
  const payerLabel = r.payer==='customer' ? 'مشتری می‌ده' : (r.payer==='split' ? 'نصف‌نصف' : 'خودم می‌دم');
  return `<div class="pricing-calc-block">
    <div class="pricing-calc-row"><span>🧮 قیمت پیشنهادی ${customBadge}</span><span class="pricing-calc-price">${fmtT(r.price)}</span></div>
    <div class="pricing-calc-sub">خرید ${fmtT(cost)}${r.shippingTotal>0?` + ارسال ${fmtT(r.shippingTotal)} (${payerLabel}${r.payer==='split'?'، سهم من '+fmtT(r.shippingToRecover):''})`:''}${eff.include_agent_share?` − سهم مکانیک ${fmtT(r.agentCut)} (${eff.agent_share_pct}%)`:''} = سود خالص شما ${fmtT(r.netProfit)} (${r.marginPct.toFixed(0)}٪ مارجین, ${r.markupPct.toFixed(0)}٪ مارکاپ)</div>
    <button class="parts-header-btn" style="width:100%;margin-top:6px;padding:6px;font-size:11px;" onclick="applySuggestedPrice('${p.id}', ${r.price})">✓ استفاده از این قیمت</button>
  </div>`;
}
async function applySuggestedPrice(pid, price){
  await postParts('update_product', {id: pid, sale_price: price});
  showToast('قیمت فروش تنظیم شد','success');
}
let psShippingPayer = 'business';
function setPsShippingPayer(payer){
  psShippingPayer = payer;
  document.querySelectorAll('#psShippingPayerToggle button').forEach(b=>b.classList.toggle('active', b.dataset.payer===payer));
  document.getElementById('psShippingRatioWrap').style.display = payer==='split' ? 'block' : 'none';
}
function openPricingSettingsModal(){
  const ps = PARTS.pricing_settings;
  document.getElementById('psShippingCost').value = ps.shipping_cost||'';
  setPsShippingPayer(ps.shipping_payer||'business');
  document.getElementById('psShippingRatio').value = ps.shipping_split_ratio!=null ? Math.round(ps.shipping_split_ratio*100) : 50;
  document.getElementById('psAgentSharePct').value = ps.agent_share_pct!=null ? ps.agent_share_pct : '';
  document.getElementById('psIncludeAgent').checked = !!ps.include_agent_share;
  document.getElementById('psTargetMargin').value = ps.target_margin_pct!=null ? ps.target_margin_pct : '';
  document.getElementById('psRoundStep').value = ps.round_step||1;
  document.getElementById('pricingSettingsModalOverlay').classList.add('open');
}
function closePricingSettingsModal(){ document.getElementById('pricingSettingsModalOverlay').classList.remove('open'); }
async function savePricingSettings(){
  await postParts('update_pricing_settings', {
    shipping_cost: document.getElementById('psShippingCost').value.trim() || 0,
    shipping_payer: psShippingPayer,
    shipping_split_ratio: (parseFloat(document.getElementById('psShippingRatio').value) || 50) / 100,
    agent_share_pct: document.getElementById('psAgentSharePct').value.trim() || 0,
    include_agent_share: document.getElementById('psIncludeAgent').checked,
    target_margin_pct: document.getElementById('psTargetMargin').value.trim() || 0,
    round_step: document.getElementById('psRoundStep').value.trim() || 1,
  });
  closePricingSettingsModal();
  showToast('تنظیمات قیمت‌گذاری ذخیره شد','success');
}
function clearPartsFilters(){
  document.getElementById('partsSearchInput').value = '';
  document.getElementById('partsFilterCarModel').value = '';
  document.getElementById('partsFilterBrand').value = '';
  document.getElementById('partsFilterPartType').value = '';
  document.getElementById('partsFilterCategory').value = '';
  renderPartsProducts();
}

function escHtml(s){
  if(s==null) return '';
  return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function deleteProduct(id){
  postParts('delete_product',{id});
  showToast('Product deleted','success');
}

// ─── PRODUCT MODAL ─────────────────────────────────
function togglePfCalcSection(){
  const sec = document.getElementById('pfCalcSection');
  const open = sec.style.display !== 'none';
  sec.style.display = open ? 'none' : 'block';
  document.getElementById('pfCalcToggleArrow').textContent = open ? '▾' : '▴';
}
let pfCalcShippingPayer = '';
function setPfCalcShippingPayer(payer){
  pfCalcShippingPayer = payer;
  document.querySelectorAll('#pfCalcShippingPayerToggle button').forEach(b=>b.classList.toggle('active', b.dataset.payer===payer));
  document.getElementById('pfCalcShippingRatioWrap').style.display = payer==='split' ? 'block' : 'none';
}
let pfCalcAgent = '';
function setPfCalcAgent(v){
  pfCalcAgent = v;
  document.querySelectorAll('#pfCalcAgentToggle button').forEach(b=>b.classList.toggle('active', b.dataset.agent===v));
  document.getElementById('pfCalcAgentPctWrap').style.display = v==='yes' ? 'block' : 'none';
}
function openProductModal(id, returnTo){
  productModalReturnTo = returnTo || null;
  document.getElementById('productModalId').value = id || '';
  document.getElementById('productModalTitle').textContent = id ? 'Edit Product' : 'Add Product';
  productImageData = null;
  const preview = document.getElementById('partImgPreview');
  const removeBtn = document.getElementById('partImgRemoveBtn');
  const hintIcon = document.getElementById('partImgHintIcon');
  const hintText = document.getElementById('partImgHintText');

  if(id){
    const p = productById(id);
    renderPartTypeSelect(p.part_type||'');
    renderBrandSelect(p.brand||'');
    document.getElementById('pfVariant').value = p.variant||'';
    document.getElementById('pfOemCode').value = p.oem_code||'';
    renderCategorySelect(p.category||'');
    document.getElementById('pfTorob').value = p.torob_link||'';
    document.getElementById('pfName').value = p.name||'';
    document.getElementById('pfNotes').value = p.notes||'';
    document.getElementById('pfSalePrice').value = (p.sale_price!=null && p.sale_price!=='') ? p.sale_price : '';
    document.getElementById('pfReorderPoint').value = (p.reorder_point!=null && p.reorder_point!=='') ? p.reorder_point : '';
    document.getElementById('pfCalcShippingCost').value = p.calc_shipping_cost!=null ? p.calc_shipping_cost : '';
    setPfCalcShippingPayer(p.calc_shipping_payer || '');
    document.getElementById('pfCalcShippingRatio').value = p.calc_shipping_split_ratio!=null ? Math.round(p.calc_shipping_split_ratio*100) : 50;
    setPfCalcAgent(p.calc_include_agent_share===true ? 'yes' : (p.calc_include_agent_share===false ? 'no' : ''));
    document.getElementById('pfCalcAgentPct').value = p.calc_agent_share_pct!=null ? p.calc_agent_share_pct : '';
    document.getElementById('pfCalcTargetMargin').value = p.calc_target_margin_pct!=null ? p.calc_target_margin_pct : '';
    const hasCalcOverride = p.calc_shipping_cost!=null || p.calc_shipping_payer || p.calc_include_agent_share!=null || p.calc_agent_share_pct!=null || p.calc_target_margin_pct!=null;
    document.getElementById('pfCalcSection').style.display = hasCalcOverride ? 'block' : 'none';
    document.getElementById('pfCalcToggleArrow').textContent = hasCalcOverride ? '▴' : '▾';
    partImgAutoName = '';
    renderCarModelTags(productCarModels(p));
    if(p.image){
      productImageData = p.image;
      preview.src = p.image; preview.style.display='block';
      hintIcon.style.display='none'; hintText.style.display='none'; removeBtn.style.display='flex';
    } else {
      preview.style.display='none'; hintIcon.style.display='block'; hintText.style.display='block'; removeBtn.style.display='none';
    }
  } else {
    ['pfCarModel','pfVariant','pfOemCode','pfTorob','pfName','pfNotes'].forEach(f=>document.getElementById(f).value='');
    document.getElementById('pfSalePrice').value = '';
    document.getElementById('pfReorderPoint').value = '';
    document.getElementById('pfCalcShippingCost').value = '';
    setPfCalcShippingPayer('');
    document.getElementById('pfCalcShippingRatio').value = 50;
    setPfCalcAgent('');
    document.getElementById('pfCalcAgentPct').value = '';
    document.getElementById('pfCalcTargetMargin').value = '';
    document.getElementById('pfCalcSection').style.display = 'none';
    document.getElementById('pfCalcToggleArrow').textContent = '▾';
    renderPartTypeSelect('');
    renderBrandSelect('');
    renderCategorySelect('');
    preview.style.display='none'; hintIcon.style.display='block'; hintText.style.display='block'; removeBtn.style.display='none';
    partImgAutoName = '';
    renderCarModelTags([]);
  }
  document.getElementById('pfCarModelSearch').value = '';
  filterCarModelTags('');
  document.getElementById('productModalOverlay').classList.add('open');
}

// ─── CAR MODEL PICKER (product modal) ──────────────
// Pure multi-select against the managed list from the "Car Models" tab.
// Adding/renaming/deleting car models happens ONLY in that tab — see
// renderCarModelsGrid / openCarModelModal / saveCarModelModal below.
function renderCarModelTags(selected){
  selectedCarModels = Array.isArray(selected) ? [...new Set(selected.filter(Boolean))] : (selected ? [selected] : []);
  const wrap = document.getElementById('pfCarModelTags');
  if(!wrap) return;
  wrap.innerHTML = '';
  if(!PARTS.car_models.length){
    wrap.innerHTML = '<div style="font-size:12px;color:var(--text4);font-style:italic;">No car models yet — add some in the Car Models tab first.</div>';
    return;
  }
  const f = (carModelTagFilter||'').trim().toLowerCase();
  const visible = PARTS.car_models.filter(cm=>!f || cm.name.toLowerCase().includes(f));
  if(!visible.length){
    wrap.innerHTML = '<div style="font-size:12px;color:var(--text4);font-style:italic;">No car models match your search.</div>';
    return;
  }
  visible.forEach(cm=>{
    const active = selectedCarModels.includes(cm.name);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'preset cm-tag' + (active ? ' active' : '');
    b.textContent = cm.name;
    b.onclick = ()=>toggleCarModel(cm.name);
    wrap.appendChild(b);
  });
  syncCarModelHidden();
}
function filterCarModelTags(v){
  carModelTagFilter = v||'';
  renderCarModelTags(selectedCarModels);
}
function toggleCarModel(m){
  const i = selectedCarModels.indexOf(m);
  if(i===-1) selectedCarModels.push(m); else selectedCarModels.splice(i,1);
  renderCarModelTags(selectedCarModels);
  suggestProductName();
}
function syncCarModelHidden(){
  // pfCarModel keeps a plain-text mirror (CAR_MODEL_SEP-joined) for legacy code paths that read it directly.
  const hidden = document.getElementById('pfCarModel');
  if(hidden) hidden.value = selectedCarModels.join(CAR_MODEL_SEP);
}

// ─── CAR MODELS TAB (add / edit / delete, independent of products) ──
function renderCarModelsGrid(){
  const grid = document.getElementById('partsCarModelGrid');
  if(!grid) return;
  grid.innerHTML = '';
  if(!PARTS.car_models.length){
    grid.innerHTML = '<div class="parts-empty"><div class="pe-icon">🚗</div><div class="pe-text">No car models yet — click "+ Add Car Model" to create your first one.</div></div>';
    return;
  }
  [...PARTS.car_models].sort((a,b)=>a.name.localeCompare(b.name)).forEach(cm=>{
    const usedBy = PARTS.products.filter(p=>productCarModels(p).includes(cm.name)).length;
    const el = document.createElement('div');
    el.className = 'store-card';
    el.innerHTML = `
      <div class="store-card-body">
        <div class="store-card-headrow">
          <div class="store-avatar" style="background:${hashColor(cm.name)}">🚗</div>
          <div class="store-card-name">${escHtml(cm.name)}</div>
        </div>
        <div class="store-card-row"><span class="lbl">🔩</span>${usedBy ? usedBy+' product'+(usedBy===1?'':'s') : 'Not used by any product yet'}</div>
        <div class="store-card-actions">
          <button onclick="openCarModelModal('${cm.id}')">✎ Edit</button>
          <button class="del" onclick="deleteCarModelEntry('${cm.id}')">🗑 Delete</button>
        </div>
      </div>`;
    grid.appendChild(el);
  });
}
function openCarModelModal(id){
  document.getElementById('carModelModalId').value = id||'';
  document.getElementById('carModelModalTitle').textContent = id ? 'Edit Car Model' : 'Add Car Model';
  document.getElementById('cmfName').value = id ? (PARTS.car_models.find(c=>c.id===id)||{}).name||'' : '';
  document.getElementById('carModelModalOverlay').classList.add('open');
}
function closeCarModelModal(){ document.getElementById('carModelModalOverlay').classList.remove('open'); }
async function saveCarModelModal(){
  const id = document.getElementById('carModelModalId').value;
  const name = document.getElementById('cmfName').value.trim();
  if(!name){ showToast('Give the car model a name','error'); return; }
  const dupe = PARTS.car_models.find(c=>c.name.toLowerCase()===name.toLowerCase() && c.id!==id);
  if(dupe){ showToast('That car model already exists','error'); return; }
  if(id){ await postParts('update_car_model', {id, name}); }
  else { await postParts('add_car_model', {name}); }
  closeCarModelModal();
  showToast(id ? 'Car model updated' : 'Car model added','success');
}
function deleteCarModelEntry(id){
  const cm = PARTS.car_models.find(c=>c.id===id);
  if(cm){
    const usedBy = PARTS.products.filter(p=>productCarModels(p).includes(cm.name)).length;
    if(usedBy && !confirm(`${usedBy} product${usedBy===1?'':'s'} still use "${cm.name}". Delete it from the list anyway? Existing products keep the text but it won't be selectable anymore.`)) return;
  }
  postParts('delete_car_model',{id});
  showToast('Car model deleted','success');
}

// ─── BRANDS TAB (add / edit / delete, independent of products) ──
// Structured brand list, same pattern as Car Models — used by the product
// modal's Brand select so a business with many brands per part type keeps
// clean, filterable data instead of free-typed text.
function renderBrandsGrid(){
  const grid = document.getElementById('partsBrandGrid');
  if(!grid) return;
  grid.innerHTML = '';
  if(!PARTS.brands.length){
    grid.innerHTML = '<div class="parts-empty"><div class="pe-icon">🏷️</div><div class="pe-text">No brands yet — click "+ Add Brand" to create your first one.</div></div>';
    return;
  }
  [...PARTS.brands].sort((a,b)=>a.name.localeCompare(b.name)).forEach(b=>{
    const usedBy = PARTS.products.filter(p=>p.brand===b.name).length;
    const el = document.createElement('div');
    el.className = 'store-card';
    el.innerHTML = `
      <div class="store-card-body">
        <div class="store-card-headrow">
          <div class="store-avatar" style="background:${hashColor(b.name)}">🏷️</div>
          <div class="store-card-name">${escHtml(b.name)}</div>
        </div>
        <div class="store-card-row"><span class="lbl">🔩</span>${usedBy ? usedBy+' product'+(usedBy===1?'':'s') : 'Not used by any product yet'}</div>
        <div class="store-card-actions">
          <button onclick="openBrandModal('${b.id}')">✎ Edit</button>
          <button class="del" onclick="deleteBrandEntry('${b.id}')">🗑 Delete</button>
        </div>
      </div>`;
    grid.appendChild(el);
  });
}
function openBrandModal(id, returnTo){
  brandModalReturnTo = returnTo || null;
  document.getElementById('brandModalId').value = id||'';
  document.getElementById('brandModalTitle').textContent = id ? 'Edit Brand' : 'Add Brand';
  document.getElementById('bfName').value = id ? (PARTS.brands.find(b=>b.id===id)||{}).name||'' : '';
  document.getElementById('brandModalOverlay').classList.add('open');
}
function closeBrandModal(){
  document.getElementById('brandModalOverlay').classList.remove('open');
  brandModalReturnTo = null;
}
async function saveBrandModal(){
  const id = document.getElementById('brandModalId').value;
  const name = document.getElementById('bfName').value.trim();
  if(!name){ showToast('Give the brand a name','error'); return; }
  const dupe = PARTS.brands.find(b=>b.name.toLowerCase()===name.toLowerCase() && b.id!==id);
  if(dupe){ showToast('That brand already exists','error'); return; }
  const prevIds = new Set(PARTS.brands.map(b=>b.id));
  const returnTo = brandModalReturnTo;
  if(id){ await postParts('update_brand', {id, name}); }
  else { await postParts('add_brand', {name}); }
  closeBrandModal();
  showToast(id ? 'Brand updated' : 'Brand added','success');
  if(!id && returnTo==='product'){
    const newBrand = PARTS.brands.find(b=>!prevIds.has(b.id));
    if(newBrand){
      renderBrandSelect(newBrand.name);
      suggestProductName();
    }
  }
}
function deleteBrandEntry(id){
  const b = PARTS.brands.find(x=>x.id===id);
  if(b){
    const usedBy = PARTS.products.filter(p=>p.brand===b.name).length;
    if(usedBy && !confirm(`${usedBy} product${usedBy===1?'':'s'} still use "${b.name}". Delete it from the list anyway? Existing products keep the text but it won't be selectable anymore.`)) return;
  }
  postParts('delete_brand',{id});
  showToast('Brand deleted','success');
}
function renderBrandSelect(selected){
  const sel = document.getElementById('pfBrand');
  if(!sel) return;
  const names = PARTS.brands.map(b=>b.name);
  // Keep a legacy brand name selectable even if it isn't in the managed list yet.
  if(selected && !names.includes(selected)) names.unshift(selected);
  sel.innerHTML = '<option value="">— no brand —</option>' +
    names.map(n=>`<option value="${escHtml(n)}">${escHtml(n)}</option>`).join('');
  sel.value = selected || '';
  ssSync('pfBrand');
}

// ─── PART TYPES TAB (add / edit / delete, independent of products) ──
// Same structured-list pattern as Brands / Car Models.
function renderPartTypesGrid(){
  const grid = document.getElementById('partsPartTypeGrid');
  if(!grid) return;
  grid.innerHTML = '';
  if(!PARTS.part_types.length){
    grid.innerHTML = '<div class="parts-empty"><div class="pe-icon">🔧</div><div class="pe-text">No part types yet — click "+ Add Part Type" to create your first one.</div></div>';
    return;
  }
  [...PARTS.part_types].sort((a,b)=>a.name.localeCompare(b.name)).forEach(t=>{
    const usedBy = PARTS.products.filter(p=>p.part_type===t.name).length;
    const el = document.createElement('div');
    el.className = 'store-card';
    el.innerHTML = `
      <div class="store-card-body">
        <div class="store-card-headrow">
          <div class="store-avatar" style="background:${hashColor(t.name)}">🔧</div>
          <div class="store-card-name">${escHtml(t.name)}</div>
        </div>
        <div class="store-card-row"><span class="lbl">🔩</span>${usedBy ? usedBy+' product'+(usedBy===1?'':'s') : 'Not used by any product yet'}</div>
        <div class="store-card-actions">
          <button onclick="openPartTypeModal('${t.id}')">✎ Edit</button>
          <button class="del" onclick="deletePartTypeEntry('${t.id}')">🗑 Delete</button>
        </div>
      </div>`;
    grid.appendChild(el);
  });
}
function openPartTypeModal(id, returnTo){
  partTypeModalReturnTo = returnTo || null;
  document.getElementById('partTypeModalId').value = id||'';
  document.getElementById('partTypeModalTitle').textContent = id ? 'Edit Part Type' : 'Add Part Type';
  document.getElementById('ptfName').value = id ? (PARTS.part_types.find(t=>t.id===id)||{}).name||'' : '';
  document.getElementById('partTypeModalOverlay').classList.add('open');
}
function closePartTypeModal(){
  document.getElementById('partTypeModalOverlay').classList.remove('open');
  partTypeModalReturnTo = null;
}
async function savePartTypeModal(){
  const id = document.getElementById('partTypeModalId').value;
  const name = document.getElementById('ptfName').value.trim();
  if(!name){ showToast('Give the part type a name','error'); return; }
  const dupe = PARTS.part_types.find(t=>t.name.toLowerCase()===name.toLowerCase() && t.id!==id);
  if(dupe){ showToast('That part type already exists','error'); return; }
  const prevIds = new Set(PARTS.part_types.map(t=>t.id));
  const returnTo = partTypeModalReturnTo;
  if(id){ await postParts('update_part_type', {id, name}); }
  else { await postParts('add_part_type', {name}); }
  closePartTypeModal();
  showToast(id ? 'Part type updated' : 'Part type added','success');
  if(!id && returnTo==='product'){
    const newType = PARTS.part_types.find(t=>!prevIds.has(t.id));
    if(newType){
      renderPartTypeSelect(newType.name);
      suggestProductName();
    }
  }
}
function deletePartTypeEntry(id){
  const t = PARTS.part_types.find(x=>x.id===id);
  if(t){
    const usedBy = PARTS.products.filter(p=>p.part_type===t.name).length;
    if(usedBy && !confirm(`${usedBy} product${usedBy===1?'':'s'} still use "${t.name}". Delete it from the list anyway? Existing products keep the text but it won't be selectable anymore.`)) return;
  }
  postParts('delete_part_type',{id});
  showToast('Part type deleted','success');
}
function renderPartTypeSelect(selected){
  const sel = document.getElementById('pfPartType');
  if(!sel) return;
  const names = PARTS.part_types.map(t=>t.name);
  if(selected && !names.includes(selected)) names.unshift(selected);
  sel.innerHTML = '<option value="">— no part type —</option>' +
    names.map(n=>`<option value="${escHtml(n)}">${escHtml(n)}</option>`).join('');
  sel.value = selected || '';
  ssSync('pfPartType');
}

// ─── CATEGORIES TAB (add / edit / delete, independent of products) ──
function renderCategoriesGrid(){
  const grid = document.getElementById('partsCategoryGrid');
  if(!grid) return;
  grid.innerHTML = '';
  if(!PARTS.categories.length){
    grid.innerHTML = '<div class="parts-empty"><div class="pe-icon">🗂️</div><div class="pe-text">No categories yet — click "+ Add Category" to create your first one.</div></div>';
    return;
  }
  [...PARTS.categories].sort((a,b)=>a.name.localeCompare(b.name)).forEach(c=>{
    const usedBy = PARTS.products.filter(p=>p.category===c.name).length;
    const el = document.createElement('div');
    el.className = 'store-card';
    el.innerHTML = `
      <div class="store-card-body">
        <div class="store-card-headrow">
          <div class="store-avatar" style="background:${hashColor(c.name)}">🗂️</div>
          <div class="store-card-name">${escHtml(c.name)}</div>
        </div>
        <div class="store-card-row"><span class="lbl">🔩</span>${usedBy ? usedBy+' product'+(usedBy===1?'':'s') : 'Not used by any product yet'}</div>
        <div class="store-card-actions">
          <button onclick="openCategoryModal('${c.id}')">✎ Edit</button>
          <button class="del" onclick="deleteCategoryEntry('${c.id}')">🗑 Delete</button>
        </div>
      </div>`;
    grid.appendChild(el);
  });
}
function openCategoryModal(id, returnTo){
  categoryModalReturnTo = returnTo || null;
  document.getElementById('categoryModalId').value = id||'';
  document.getElementById('categoryModalTitle').textContent = id ? 'Edit Category' : 'Add Category';
  document.getElementById('ctfName').value = id ? (PARTS.categories.find(c=>c.id===id)||{}).name||'' : '';
  document.getElementById('categoryModalOverlay').classList.add('open');
}
function closeCategoryModal(){
  document.getElementById('categoryModalOverlay').classList.remove('open');
  categoryModalReturnTo = null;
}
async function saveCategoryModal(){
  const id = document.getElementById('categoryModalId').value;
  const name = document.getElementById('ctfName').value.trim();
  if(!name){ showToast('Give the category a name','error'); return; }
  const dupe = PARTS.categories.find(c=>c.name.toLowerCase()===name.toLowerCase() && c.id!==id);
  if(dupe){ showToast('That category already exists','error'); return; }
  const prevIds = new Set(PARTS.categories.map(c=>c.id));
  const returnTo = categoryModalReturnTo;
  if(id){ await postParts('update_category', {id, name}); }
  else { await postParts('add_category', {name}); }
  closeCategoryModal();
  showToast(id ? 'Category updated' : 'Category added','success');
  if(!id && returnTo==='product'){
    const newCat = PARTS.categories.find(c=>!prevIds.has(c.id));
    if(newCat){ renderCategorySelect(newCat.name); }
  }
}
function deleteCategoryEntry(id){
  const c = PARTS.categories.find(x=>x.id===id);
  if(c){
    const usedBy = PARTS.products.filter(p=>p.category===c.name).length;
    if(usedBy && !confirm(`${usedBy} product${usedBy===1?'':'s'} still use "${c.name}". Delete it from the list anyway? Existing products keep the text but it won't be selectable anymore.`)) return;
  }
  postParts('delete_category',{id});
  showToast('Category deleted','success');
}
function renderCategorySelect(selected){
  const sel = document.getElementById('pfCategory');
  if(!sel) return;
  const names = PARTS.categories.map(c=>c.name);
  if(selected && !names.includes(selected)) names.unshift(selected);
  sel.innerHTML = '<option value="">— no category —</option>' +
    names.map(n=>`<option value="${escHtml(n)}">${escHtml(n)}</option>`).join('');
  sel.value = selected || '';
  ssSync('pfCategory');
}
function closeProductModal(){
  document.getElementById('productModalOverlay').classList.remove('open');
  productModalReturnTo = null;
}
function suggestProductName(){
  const nameField = document.getElementById('pfName');
  const suggestion = [document.getElementById('pfPartType').value, selectedCarModels.join('/'),
    document.getElementById('pfBrand').value, document.getElementById('pfVariant').value ? '('+document.getElementById('pfVariant').value+')' : '']
    .filter(Boolean).join(' — ');
  if(nameField.value === '' || nameField.value === partImgAutoName){
    nameField.value = suggestion;
    partImgAutoName = suggestion;
  }
}
function onProductImageSelected(ev){ onPartImageFileSelected(ev, 'product'); }
function onStoreImageSelected(ev){ onPartImageFileSelected(ev, 'store'); }
function onAgentImageSelected(ev){ onPartImageFileSelected(ev, 'agent'); }
function onPartImageFileSelected(ev, target){
  const file = ev.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e=>{
    const img = new Image();
    img.onload = ()=> openImageCrop(img, target);
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ─── IMAGE CROP (pick + reposition, like a profile photo) ──
// Shared by the product modal and the store modal — cropTarget says which one to write the result back to.
function openImageCrop(img, target){
  cropTarget = target || 'product';
  const frame = document.getElementById('cropFrame');
  const frameW = frame.clientWidth || 400;
  const frameH = frameW / CROP_ASPECT;
  const minScale = Math.max(frameW/img.naturalWidth, frameH/img.naturalHeight);
  cropState = {
    img, naturalW: img.naturalWidth, naturalH: img.naturalHeight,
    scale: minScale, minScale, maxScale: minScale*3,
    offsetX: 0, offsetY: 0, frameW, frameH,
  };
  const cropImg = document.getElementById('cropImg');
  cropImg.src = img.src;
  document.getElementById('cropZoomSlider').value = 0;
  renderCrop();

  const overlay = document.getElementById('partImgCropOverlay');
  overlay.classList.add('open');

  frame.onpointerdown = onCropPointerDown;
  frame.onpointermove = onCropPointerMove;
  frame.onpointerup = onCropPointerEnd;
  frame.onpointercancel = onCropPointerEnd;
  frame.onpointerleave = onCropPointerEnd;
}
function renderCrop(){
  if(!cropState) return;
  const {scale, naturalW, naturalH, frameW, frameH} = cropState;
  const dispW = naturalW*scale, dispH = naturalH*scale;
  // clamp offsets so the image always fully covers the frame
  const maxOffX = Math.max(0, (dispW - frameW)/2);
  const maxOffY = Math.max(0, (dispH - frameH)/2);
  cropState.offsetX = Math.min(maxOffX, Math.max(-maxOffX, cropState.offsetX));
  cropState.offsetY = Math.min(maxOffY, Math.max(-maxOffY, cropState.offsetY));
  const left = frameW/2 - dispW/2 + cropState.offsetX;
  const top = frameH/2 - dispH/2 + cropState.offsetY;
  const cropImg = document.getElementById('cropImg');
  cropImg.style.width = dispW+'px';
  cropImg.style.height = dispH+'px';
  cropImg.style.left = left+'px';
  cropImg.style.top = top+'px';
}
function onCropZoomInput(v){
  if(!cropState) return;
  const t = Math.max(0, Math.min(100, Number(v)))/100;
  cropState.scale = cropState.minScale + t*(cropState.maxScale - cropState.minScale);
  renderCrop();
}
function onCropPointerDown(ev){
  if(!cropState) return;
  const frame = document.getElementById('cropFrame');
  frame.classList.add('dragging');
  frame.setPointerCapture(ev.pointerId);
  cropDrag = {startX: ev.clientX, startY: ev.clientY, startOffX: cropState.offsetX, startOffY: cropState.offsetY};
}
function onCropPointerMove(ev){
  if(!cropDrag || !cropState) return;
  cropState.offsetX = cropDrag.startOffX + (ev.clientX - cropDrag.startX);
  cropState.offsetY = cropDrag.startOffY + (ev.clientY - cropDrag.startY);
  renderCrop();
}
function onCropPointerEnd(){
  cropDrag = null;
  const frame = document.getElementById('cropFrame');
  if(frame) frame.classList.remove('dragging');
}
function cancelImageCrop(){
  document.getElementById('partImgCropOverlay').classList.remove('open');
  const t = IMG_TARGETS[cropTarget] || IMG_TARGETS.product;
  document.getElementById(t.uploadInput).value = '';
  cropState = null; cropDrag = null;
}
function confirmImageCrop(){
  if(!cropState) return;
  const {img, scale, offsetX, offsetY, frameW, frameH} = cropState;
  const dispW = img.naturalWidth*scale, dispH = img.naturalHeight*scale;
  const left = frameW/2 - dispW/2 + offsetX;
  const top = frameH/2 - dispH/2 + offsetY;
  const srcX = -left/scale, srcY = -top/scale;
  const srcW = frameW/scale, srcH = frameH/scale;

  const OUT_W = 640, OUT_H = Math.round(OUT_W/CROP_ASPECT);
  const canvas = document.createElement('canvas');
  canvas.width = OUT_W; canvas.height = OUT_H;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, OUT_W, OUT_H);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

  const t = IMG_TARGETS[cropTarget] || IMG_TARGETS.product;
  if(cropTarget==='store') storeImageData = dataUrl;
  else if(cropTarget==='agent') agentImageData = dataUrl;
  else productImageData = dataUrl;
  const preview = document.getElementById(t.preview);
  preview.src = dataUrl; preview.style.display='block';
  document.getElementById(t.hintIcon).style.display='none';
  document.getElementById(t.hintText).style.display='none';
  document.getElementById(t.removeBtn).style.display='flex';

  document.getElementById('partImgCropOverlay').classList.remove('open');
  document.getElementById(t.uploadInput).value = '';
  cropState = null; cropDrag = null;
}
function removeProductImage(){
  productImageData = '';
  document.getElementById('partImgFileInput').value = '';
  document.getElementById('partImgPreview').style.display='none';
  document.getElementById('partImgHintIcon').style.display='block';
  document.getElementById('partImgHintText').style.display='block';
  document.getElementById('partImgRemoveBtn').style.display='none';
}
function removeStoreImage(){
  storeImageData = '';
  document.getElementById('storeImgFileInput').value = '';
  document.getElementById('storeImgPreview').style.display='none';
  document.getElementById('storeImgHintIcon').style.display='block';
  document.getElementById('storeImgHintText').style.display='block';
  document.getElementById('storeImgRemoveBtn').style.display='none';
}
function removeAgentImage(){
  agentImageData = '';
  document.getElementById('agentImgFileInput').value = '';
  document.getElementById('agentImgPreview').style.display='none';
  document.getElementById('agentImgHintIcon').style.display='block';
  document.getElementById('agentImgHintText').style.display='block';
  document.getElementById('agentImgRemoveBtn').style.display='none';
}
async function saveProductModal(){
  const id = document.getElementById('productModalId').value;
  const partType = document.getElementById('pfPartType').value.trim();
  const carModels = selectedCarModels.slice();
  if(!partType && !carModels.length && !document.getElementById('pfName').value.trim()){
    showToast('Give the product at least a name or a part type','error'); return;
  }
  const payload = {
    part_type: partType, car_model: carModels.join(CAR_MODEL_SEP),
    brand: document.getElementById('pfBrand').value.trim(),
    variant: document.getElementById('pfVariant').value.trim(),
    oem_code: document.getElementById('pfOemCode').value.trim(),
    category: document.getElementById('pfCategory').value.trim(),
    torob_link: document.getElementById('pfTorob').value.trim(),
    name: document.getElementById('pfName').value.trim(),
    notes: document.getElementById('pfNotes').value.trim(),
    sale_price: document.getElementById('pfSalePrice').value.trim() || null,
    reorder_point: document.getElementById('pfReorderPoint').value.trim() || null,
    calc_shipping_cost: document.getElementById('pfCalcShippingCost').value.trim() || null,
    calc_shipping_payer: pfCalcShippingPayer || null,
    calc_shipping_split_ratio: (parseFloat(document.getElementById('pfCalcShippingRatio').value) || 50) / 100,
    calc_include_agent_share: pfCalcAgent==='yes' ? true : (pfCalcAgent==='no' ? false : ''),
    calc_agent_share_pct: document.getElementById('pfCalcAgentPct').value.trim() || null,
    calc_target_margin_pct: document.getElementById('pfCalcTargetMargin').value.trim() || null,
  };
  if(productImageData !== null) payload.image = productImageData;

  const prevIds = new Set(PARTS.products.map(p=>p.id));
  let res;
  if(id){ payload.id = id; res = await postParts('update_product', payload); }
  else { res = await postParts('add_product', payload); }
  if(!res || res.ok===false) return;

  closeProductModal();
  showToast(id ? 'Product updated' : 'Product added','success');

  if(!id && productModalReturnTo){
    const newProd = PARTS.products.find(p=>!prevIds.has(p.id));
    if(newProd){
      if(productModalReturnTo==='purchase') document.getElementById('purchaseItemProduct').value = newProd.id;
      if(productModalReturnTo==='sale'){ document.getElementById('saleItemProduct').value = newProd.id; onSaleProductChange(); }
    }
  }
}

// ─── STORES ─────────────────────────────────────────
function renderStoreGrid(){
  const grid = document.getElementById('partsStoreGrid');
  grid.innerHTML = '';
  if(!PARTS.stores.length){
    grid.innerHTML = '<div class="parts-empty"><div class="pe-icon">🏬</div><div class="pe-text">هنوز تامین‌کننده‌ای ثبت نکردی — با «+ افزودن تامین‌کننده» جایی که ازش خرید می‌کنی رو اضافه کن.</div></div>';
    return;
  }
  PARTS.stores.forEach(s=>{
    const spend = (PARTS.by_store[s.id]||{}).spend || 0;
    const avatarColor = hashColor(s.name);
    const initial = (s.name||'?').trim().charAt(0).toUpperCase();
    const el = document.createElement('div');
    el.className = 'store-card';
    el.innerHTML = `
      ${s.image ? `<div class="part-card-img"><img src="${s.image}"></div>` : ''}
      <div class="store-card-body">
        <div class="store-card-headrow">
          <div class="store-avatar" style="background:${avatarColor}">${escHtml(initial)}</div>
          <div class="store-card-name">${escHtml(s.name)}</div>
        </div>
        ${s.address ? `<div class="store-card-row"><span class="lbl">📍</span>${escHtml(s.address)}</div>` : ''}
        ${s.phone ? `<div class="store-card-row"><span class="lbl">📞</span>${escHtml(s.phone)}</div>` : ''}
        ${s.notes ? `<div class="store-card-row"><span class="lbl">📝</span>${escHtml(s.notes)}</div>` : ''}
        <div class="store-card-row"><span class="lbl">💸</span>Total spend: ${fmtT(spend)}</div>
        ${Number(s.shipping_cost)>0 ? `<div class="store-card-row"><span class="lbl">🚚</span>Shipping ${fmtT(s.shipping_cost)}${Number(s.free_shipping_min)>0 ? ` · free over ${fmtT(s.free_shipping_min)}` : ''}</div>` : ''}
        <div class="store-card-links">
          ${s.torob_link ? `<a href="${escHtml(s.torob_link)}" target="_blank" rel="noopener">Torob ↗</a>` : ''}
          ${s.website ? `<a href="${escHtml(s.website)}" target="_blank" rel="noopener">Website ↗</a>` : ''}
        </div>
        <div class="store-card-actions">
          <button onclick="openStoreModal('${s.id}')">✎ Edit</button>
          <button class="del" onclick="deleteStore('${s.id}')">🗑 Delete</button>
        </div>
      </div>`;
    grid.appendChild(el);
  });
}
function renderStoreSelect(){
  const sel = document.getElementById('purchaseStoreSelect');
  const cur = sel.value;
  sel.innerHTML = PARTS.stores.length
    ? PARTS.stores.map(s=>`<option value="${s.id}" data-img="${escHtml(s.image||'')}" data-icon="🏬">${escHtml(s.name)}</option>`).join('')
    : '<option value="">— add a store first —</option>';
  if([...sel.options].some(o=>o.value===cur)) sel.value = cur;
  ssSync('purchaseStoreSelect');
}
function deleteStore(id){
  postParts('delete_store',{id});
  showToast('تامین‌کننده حذف شد','success');
}
function openStoreModal(id){
  document.getElementById('storeModalId').value = id||'';
  document.getElementById('storeModalTitle').textContent = id ? 'ویرایش تامین‌کننده' : 'افزودن تامین‌کننده';
  storeImageData = null;
  const preview = document.getElementById('storeImgPreview');
  const removeBtn = document.getElementById('storeImgRemoveBtn');
  const hintIcon = document.getElementById('storeImgHintIcon');
  const hintText = document.getElementById('storeImgHintText');
  if(id){
    const s = storeById(id);
    document.getElementById('sfName').value = s.name||'';
    document.getElementById('sfAddress').value = s.address||'';
    document.getElementById('sfPhone').value = s.phone||'';
    document.getElementById('sfTorob').value = s.torob_link||'';
    document.getElementById('sfWebsite').value = s.website||'';
    document.getElementById('sfNotes').value = s.notes||'';
    document.getElementById('sfShipping').value = s.shipping_cost || '';
    document.getElementById('sfFreeShipMin').value = s.free_shipping_min || '';
    if(s.image){
      storeImageData = s.image;
      preview.src = s.image; preview.style.display='block';
      hintIcon.style.display='none'; hintText.style.display='none'; removeBtn.style.display='flex';
    } else {
      preview.style.display='none'; hintIcon.style.display='block'; hintText.style.display='block'; removeBtn.style.display='none';
    }
  } else {
    ['sfName','sfAddress','sfPhone','sfTorob','sfWebsite','sfNotes'].forEach(f=>document.getElementById(f).value='');
    document.getElementById('sfShipping').value = '';
    document.getElementById('sfFreeShipMin').value = '';
    preview.style.display='none'; hintIcon.style.display='block'; hintText.style.display='block'; removeBtn.style.display='none';
  }
  document.getElementById('storeModalOverlay').classList.add('open');
}
function closeStoreModal(){ document.getElementById('storeModalOverlay').classList.remove('open'); }
async function saveStoreModal(){
  const id = document.getElementById('storeModalId').value;
  const name = document.getElementById('sfName').value.trim();
  if(!name){ showToast('تامین‌کننده باید اسم داشته باشه','error'); return; }
  const payload = {
    name, address: document.getElementById('sfAddress').value.trim(),
    phone: document.getElementById('sfPhone').value.trim(),
    torob_link: document.getElementById('sfTorob').value.trim(),
    website: document.getElementById('sfWebsite').value.trim(),
    notes: document.getElementById('sfNotes').value.trim(),
    shipping_cost: document.getElementById('sfShipping').value.trim() || 0,
    free_shipping_min: document.getElementById('sfFreeShipMin').value.trim() || 0,
  };
  if(storeImageData !== null) payload.image = storeImageData;
  if(id){ payload.id=id; await postParts('update_store', payload); }
  else { await postParts('add_store', payload); }
  closeStoreModal();
  showToast(id ? 'تامین‌کننده ویرایش شد' : 'تامین‌کننده اضافه شد','success');
}

// ─── SALES AGENTS (people who sold on your behalf — not suppliers) ──
function agentById(id){ return PARTS.sales_agents.find(a=>a.id===id); }
function renderAgentGrid(){
  const grid = document.getElementById('partsAgentGrid');
  if(!grid) return;
  grid.innerHTML = '';
  if(!PARTS.sales_agents.length){
    grid.innerHTML = '<div class="parts-empty"><div class="pe-icon">🧑‍💼</div><div class="pe-text">هنوز نماینده‌ای تعریف نکردی — با «+ افزودن نماینده» کسایی که برات کالا می‌فروشن رو اضافه کن.</div></div>';
    return;
  }
  PARTS.sales_agents.forEach(a=>{
    const st = PARTS.agent_summary[a.id] || {orders:0,revenue:0,profit:0,accrued:0,paid:0,payable:0};
    const el = document.createElement('div');
    el.className = 'store-card';
    el.innerHTML = `
      ${a.image ? `<div class="part-card-img"><img src="${a.image}"></div>` : ''}
      <div class="store-card-body">
        <div class="store-card-headrow">
          <div class="store-avatar" style="background:${hashColor(a.name)}">${escHtml((a.name||'?').trim().charAt(0).toUpperCase())}</div>
          <div class="store-card-name">${escHtml(a.name)}</div>
        </div>
        ${a.address ? `<div class="store-card-row"><span class="lbl">📍</span>${escHtml(a.address)}</div>` : ''}
        ${a.phone ? `<div class="store-card-row"><span class="lbl">📞</span>${escHtml(a.phone)}</div>` : ''}
        ${a.notes ? `<div class="store-card-row"><span class="lbl">📝</span>${escHtml(a.notes)}</div>` : ''}
        <div class="store-card-row"><span class="lbl">🧾</span>${st.orders} فروش · ${fmtT(st.revenue)} درآمد</div>
        ${a.commission_percent!=null ? `<div class="store-card-row"><span class="lbl">🎁</span>پورسانت ${a.commission_percent}% (${a.commission_basis==='profit'?'از سود':'از فروش'})</div>` : ''}
        ${st.payable>0.01 ? `<div class="store-card-row"><span class="lbl">💰</span>پورسانت مانده: ${fmtT(st.payable)} <button class="icon-btn-sm" style="margin-right:6px;" onclick="event.stopPropagation();openAgentPayoutModal('${a.id}')">پرداخت</button></div>` : ''}
        <div class="store-card-actions">
          <button onclick="openAgentModal('${a.id}')">✎ Edit</button>
          <button class="del" onclick="deleteAgent('${a.id}')">🗑 Delete</button>
        </div>
      </div>`;
    grid.appendChild(el);
  });
}
function renderAgentSelect(){
  const html = '<option value="">— بدون نماینده —</option>' +
    PARTS.sales_agents.map(a=>`<option value="${a.id}" data-img="${escHtml(a.image||'')}" data-icon="🧑‍💼">${escHtml(a.name)}${a.phone?' — '+escHtml(a.phone):''}</option>`).join('');
  ['saleAgentSelect','quoteAgentSelect'].forEach(id=>{
    const sel = document.getElementById(id);
    if(!sel) return;
    const cur = sel.value;
    sel.innerHTML = html;
    if([...sel.options].some(o=>o.value===cur)) sel.value = cur;
    ssSync(id);
  });
}
function openAgentPayoutModal(agentId){
  const a = agentById(agentId);
  if(!a) return;
  const st = PARTS.agent_summary[agentId] || {payable:0};
  document.getElementById('apyAgentId').value = agentId;
  document.getElementById('apyAgentName').textContent = a.name + ' — مانده: ' + fmtT(st.payable);
  document.getElementById('apyAmount').value = st.payable>0 ? Math.round(st.payable*100)/100 : '';
  document.getElementById('apyNote').value = '';
  renderJalaliPicker('apyDatePicker','apyDateHidden', null, ()=>{});
  document.getElementById('agentPayoutModalOverlay').classList.add('open');
}
function closeAgentPayoutModal(){ document.getElementById('agentPayoutModalOverlay').classList.remove('open'); }
async function saveAgentPayout(){
  const amount = parseFloat(document.getElementById('apyAmount').value);
  if(!amount || amount<=0){ showToast('مبلغ رو وارد کن','error'); return; }
  const res = await postParts('add_agent_payout', {
    agent_id: document.getElementById('apyAgentId').value, amount,
    date: document.getElementById('apyDateHidden').value, note: document.getElementById('apyNote').value.trim(),
  });
  if(!res || res.ok===false) return;
  closeAgentPayoutModal();
  showToast('پرداخت پورسانت ثبت شد','success');
}
function deleteAgent(id){
  if(!confirm('حذف این نماینده؟ فروش‌هایی که بهش وصل بودن بدون نماینده می‌شن.')) return;
  postParts('delete_sales_agent',{id});
  showToast('نماینده حذف شد','success');
}
function openAgentModal(id){
  editingAgentId = id || null;
  document.getElementById('agentModalTitle').textContent = id ? 'ویرایش نماینده' : 'افزودن نماینده فروش';
  agentImageData = null;
  const preview = document.getElementById('agentImgPreview');
  const removeBtn = document.getElementById('agentImgRemoveBtn');
  const hintIcon = document.getElementById('agentImgHintIcon');
  const hintText = document.getElementById('agentImgHintText');
  const a = id ? agentById(id) : null;
  document.getElementById('agfName').value = a ? a.name||'' : '';
  document.getElementById('agfPhone').value = a ? a.phone||'' : '';
  document.getElementById('agfAddress').value = a ? a.address||'' : '';
  document.getElementById('agfCommission').value = (a && a.commission_percent!=null) ? a.commission_percent : '';
  document.getElementById('agfNotes').value = a ? a.notes||'' : '';
  if(a && a.image){
    agentImageData = a.image;
    preview.src = a.image; preview.style.display='block';
    hintIcon.style.display='none'; hintText.style.display='none'; removeBtn.style.display='flex';
  } else {
    preview.style.display='none'; hintIcon.style.display='block'; hintText.style.display='block'; removeBtn.style.display='none';
  }
  document.getElementById('agentModalOverlay').classList.add('open');
}
function closeAgentModal(){ document.getElementById('agentModalOverlay').classList.remove('open'); }
async function saveAgentModal(){
  const name = document.getElementById('agfName').value.trim();
  if(!name){ showToast('نماینده باید اسم داشته باشه','error'); return; }
  const payload = {
    name, phone: document.getElementById('agfPhone').value.trim(),
    address: document.getElementById('agfAddress').value.trim(),
    commission_percent: document.getElementById('agfCommission').value.trim() || null,
    notes: document.getElementById('agfNotes').value.trim(),
  };
  if(agentImageData !== null) payload.image = agentImageData;
  if(editingAgentId){ payload.id = editingAgentId; await postParts('update_sales_agent', payload); }
  else { await postParts('add_sales_agent', payload); }
  closeAgentModal();
  showToast(editingAgentId ? 'نماینده ویرایش شد' : 'نماینده اضافه شد','success');
}

// ─── CUSTOMERS (باشگاه مشتریان) ──────────────────
let editingCustomerId = null;
function customerById(id){ return PARTS.customers.find(c=>c.id===id); }
function customerStats(cid){
  const sales = PARTS.sales.filter(s=>s.customer_id===cid);
  return {orders: sales.length, revenue: sales.reduce((sum,s)=>sum+(s.revenue||0),0),
          outstanding: sales.reduce((sum,s)=>sum+(s.amount_outstanding||0),0)};
}
function renderCustomerGrid(){
  const grid = document.getElementById('partsCustomerGrid');
  if(!grid) return;
  grid.innerHTML = '';
  if(!PARTS.customers.length){
    grid.innerHTML = '<div class="parts-empty"><div class="pe-icon">👥</div><div class="pe-text">هنوز مشتری‌ای ثبت نکردی.</div></div>';
    return;
  }
  PARTS.customers.forEach(c=>{
    const st = customerStats(c.id);
    const el = document.createElement('div');
    el.className = 'store-card';
    el.innerHTML = `
      <div class="store-card-body">
        <div class="store-card-headrow">
          <div class="store-avatar" style="background:${hashColor(c.name)}">${escHtml((c.name||'?').trim().charAt(0).toUpperCase())}</div>
          <div class="store-card-name">${escHtml(c.name)}</div>
        </div>
        ${c.phone ? `<div class="store-card-row"><span class="lbl">📞</span>${escHtml(c.phone)}</div>` : ''}
        ${c.address ? `<div class="store-card-row"><span class="lbl">📍</span>${escHtml(c.address)}</div>` : ''}
        ${c.notes ? `<div class="store-card-row"><span class="lbl">📝</span>${escHtml(c.notes)}</div>` : ''}
        <div class="store-card-row"><span class="lbl">🧾</span>${st.orders} خرید · ${fmtT(st.revenue)}</div>
        ${st.outstanding>0.01 ? `<div class="store-card-row"><span class="lbl">⚠️</span>بدهکار: ${fmtT(st.outstanding)}</div>` : ''}
        <div class="store-card-actions">
          <button onclick="openCustomerModal('${c.id}')">✎ Edit</button>
          <button class="del" onclick="deleteCustomer('${c.id}')">🗑 Delete</button>
        </div>
      </div>`;
    grid.appendChild(el);
  });
}
function renderCustomerSelects(){
  const html = '<option value="">— بدون مشتری ثابت (مشتری موردی) —</option>' +
    PARTS.customers.map(c=>`<option value="${c.id}">${escHtml(c.name)}${c.phone?' — '+escHtml(c.phone):''}</option>`).join('');
  ['saleCustomerSelect','quoteCustomerSelect'].forEach(id=>{
    const sel = document.getElementById(id);
    if(!sel) return;
    const cur = sel.value;
    sel.innerHTML = html;
    if([...sel.options].some(o=>o.value===cur)) sel.value = cur;
    ssSync(id);
  });
}
function onSaleCustomerPick(){
  const c = customerById(document.getElementById('saleCustomerSelect').value);
  if(!c) return;
  document.getElementById('saleCustomerName').value = c.name||'';
  document.getElementById('saleCustomerPhone').value = c.phone||'';
  document.getElementById('saleCustomerAddress').value = c.address||'';
}
function deleteCustomer(id){
  if(!confirm('حذف این مشتری؟ فروش‌هایی که بهش وصل بودن حذف نمی‌شن، فقط دیگه به این مشتری وصل نیستن.')) return;
  postParts('delete_customer',{id});
  showToast('مشتری حذف شد','success');
}
function openCustomerModal(id){
  editingCustomerId = id || null;
  document.getElementById('customerModalTitle').textContent = id ? 'ویرایش مشتری' : 'افزودن مشتری';
  const c = id ? customerById(id) : null;
  document.getElementById('cufName').value = c ? c.name||'' : '';
  document.getElementById('cufPhone').value = c ? c.phone||'' : '';
  document.getElementById('cufAddress').value = c ? c.address||'' : '';
  document.getElementById('cufNotes').value = c ? c.notes||'' : '';
  document.getElementById('customerModalOverlay').classList.add('open');
}
function closeCustomerModal(){ document.getElementById('customerModalOverlay').classList.remove('open'); }
async function saveCustomerModal(){
  const name = document.getElementById('cufName').value.trim();
  if(!name){ showToast('اسم مشتری رو وارد کن','error'); return; }
  const payload = {name, phone: document.getElementById('cufPhone').value.trim(),
    address: document.getElementById('cufAddress').value.trim(), notes: document.getElementById('cufNotes').value.trim()};
  if(editingCustomerId){ payload.id = editingCustomerId; await postParts('update_customer', payload); }
  else { await postParts('add_customer', payload); }
  closeCustomerModal();
  showToast(editingCustomerId ? 'مشتری ویرایش شد' : 'مشتری اضافه شد','success');
}

// ─── PRODUCT SELECTS (shared by purchase + sale forms) ──
function renderProductSelects(){
  const opts = PARTS.products.length
    ? PARTS.products.map(p=>`<option value="${p.id}" data-img="${escHtml(p.image||'')}" data-icon="📦">${escHtml(productLabel(p))}</option>`).join('')
    : '<option value="">— add a product first —</option>';

  const pSel = document.getElementById('purchaseItemProduct');
  const pCur = pSel.value; pSel.innerHTML = opts;
  if([...pSel.options].some(o=>o.value===pCur)) pSel.value = pCur;
  ssSync('purchaseItemProduct');

  const sSel = document.getElementById('saleItemProduct');
  const sCur = sSel.value;
  sSel.innerHTML = PARTS.products.length
    ? PARTS.products.map(p=>`<option value="${p.id}" data-img="${escHtml(p.image||'')}" data-icon="📦">${escHtml(productLabel(p))} — ${PARTS.stock[p.id]||0} in stock</option>`).join('')
    : '<option value="">— add a product first —</option>';
  if([...sSel.options].some(o=>o.value===sCur)) sSel.value = sCur;
  ssSync('saleItemProduct');
  onSaleProductChange();

  const qSel = document.getElementById('quoteItemProduct');
  if(qSel){
    const qCur = qSel.value; qSel.innerHTML = opts;
    if([...qSel.options].some(o=>o.value===qCur)) qSel.value = qCur;
    ssSync('quoteItemProduct');
  }
}

// ─── QUOTATIONS (پیش‌فاکتور) — never touches stock or the books ──
let quoteCartItems = [];
let editingQuoteId = null;
let quoteShippingPayer = 'customer';
function setQuoteShippingPayer(payer){
  quoteShippingPayer = payer;
  document.querySelectorAll('#quoteShippingPayerToggle button').forEach(b=>b.classList.toggle('active', b.dataset.payer===payer));
}
function onQuoteCustomerPick(){
  const c = customerById(document.getElementById('quoteCustomerSelect').value);
  if(!c) return;
  document.getElementById('quoteCustomerName').value = c.name||'';
  document.getElementById('quoteCustomerPhone').value = c.phone||'';
}
function addQuoteCartItem(){
  const pid = document.getElementById('quoteItemProduct').value;
  const qty = parseFloat(document.getElementById('quoteItemQty').value);
  const price = parseFloat(document.getElementById('quoteItemPrice').value);
  const discount = parseFloat(document.getElementById('quoteItemDiscount').value) || 0;
  if(!pid){ showToast('یه محصول انتخاب کن','error'); return; }
  if(!qty || qty<=0){ showToast('تعداد رو وارد کن','error'); return; }
  if(price==null || isNaN(price) || price<0){ showToast('قیمت رو وارد کن','error'); return; }
  quoteCartItems.push({product_id:pid, qty, unit_price:price, discount});
  document.getElementById('quoteItemQty').value = 1;
  document.getElementById('quoteItemPrice').value = '';
  document.getElementById('quoteItemDiscount').value = '';
  renderQuoteCart();
}
function removeQuoteCartItem(idx){ quoteCartItems.splice(idx,1); renderQuoteCart(); }
function renderQuoteCart(){
  const c = document.getElementById('quoteCart');
  if(!c) return;
  c.innerHTML = '';
  if(!quoteCartItems.length){
    c.innerHTML = '<div class="tx-cart-empty">هنوز کالایی اضافه نشده.</div>';
  } else {
    quoteCartItems.forEach((it,idx)=>{
      const disc = Number(it.discount)||0;
      const lineTotal = it.qty*it.unit_price - disc;
      const el = document.createElement('div');
      el.className = 'tx-cart-item';
      el.innerHTML = `<div class="tx-cart-item-info">
          <div class="tx-cart-item-name">${escHtml(productLabel(productById(it.product_id)))}</div>
          <div class="tx-cart-item-detail">${it.qty} × ${fmtT(it.unit_price)}${disc>0?` − ${fmtT(disc)} تخفیف`:''}</div>
        </div>
        <div class="tx-cart-item-total">${fmtT(lineTotal)}</div>
        <button class="tx-cart-del" onclick="removeQuoteCartItem(${idx})">✕</button>`;
      c.appendChild(el);
    });
  }
  const total = quoteCartItems.reduce((s,it)=>s+it.qty*it.unit_price-(Number(it.discount)||0),0);
  document.getElementById('quoteTotalVal').textContent = fmtT(total);
}
function openQuoteModal(id){
  editingQuoteId = id || null;
  document.getElementById('quoteModalTitle').textContent = id ? 'ویرایش پیش‌فاکتور' : '📝 پیش‌فاکتور جدید';
  renderProductSelects(); renderCustomerSelects(); renderAgentSelect();
  if(id){
    const q = PARTS.quotations.find(x=>x.id===id);
    if(!q) return;
    renderJalaliPicker('quoteDatePicker','quoteDateHidden', q.date, ()=>{});
    renderJalaliPicker('quoteValidUntilPicker','quoteValidUntilHidden', q.valid_until, ()=>{});
    document.getElementById('quoteCustomerSelect').value = q.customer_id||''; ssSync('quoteCustomerSelect');
    document.getElementById('quoteCustomerName').value = q.customer_name||'';
    document.getElementById('quoteCustomerPhone').value = q.customer_phone||'';
    document.getElementById('quoteDiscount').value = q.discount||'';
    document.getElementById('quoteTaxPercent').value = q.tax_percent||'';
    document.getElementById('quoteShippingCost').value = q.shipping_cost||'';
    document.getElementById('quoteDeliveryMethod').value = q.delivery_method||'';
    setQuoteShippingPayer(q.shipping_payer||'customer');
    document.getElementById('quoteAgentSelect').value = q.agent_id||''; ssSync('quoteAgentSelect');
    document.getElementById('quoteShowAgent').checked = !!q.show_agent_on_invoice;
    document.getElementById('quoteNotes').value = q.notes||'';
    quoteCartItems = q.items.map(it=>({...it}));
  } else {
    renderJalaliPicker('quoteDatePicker','quoteDateHidden', null, ()=>{});
    renderJalaliPicker('quoteValidUntilPicker','quoteValidUntilHidden', null, ()=>{});
    document.getElementById('quoteCustomerSelect').value = ''; ssSync('quoteCustomerSelect');
    document.getElementById('quoteCustomerName').value = '';
    document.getElementById('quoteCustomerPhone').value = '';
    document.getElementById('quoteDiscount').value = '';
    document.getElementById('quoteTaxPercent').value = '';
    document.getElementById('quoteShippingCost').value = '';
    document.getElementById('quoteDeliveryMethod').value = '';
    setQuoteShippingPayer('customer');
    document.getElementById('quoteAgentSelect').value = ''; ssSync('quoteAgentSelect');
    document.getElementById('quoteShowAgent').checked = false;
    document.getElementById('quoteNotes').value = '';
    quoteCartItems = [];
  }
  renderQuoteCart();
  document.getElementById('quoteModalOverlay').classList.add('open');
}
function closeQuoteModal(){ document.getElementById('quoteModalOverlay').classList.remove('open'); }
async function saveQuoteModal(){
  if(!quoteCartItems.length){ showToast('حداقل یه کالا اضافه کن','error'); return; }
  const payload = {
    date: document.getElementById('quoteDateHidden').value,
    valid_until: document.getElementById('quoteValidUntilHidden').value || null,
    customer_id: document.getElementById('quoteCustomerSelect').value || null,
    customer_name: document.getElementById('quoteCustomerName').value.trim(),
    customer_phone: document.getElementById('quoteCustomerPhone').value.trim(),
    items: quoteCartItems,
    discount: document.getElementById('quoteDiscount').value.trim() || 0,
    tax_percent: document.getElementById('quoteTaxPercent').value.trim() || 0,
    shipping_cost: document.getElementById('quoteShippingCost').value.trim() || 0,
    shipping_payer: quoteShippingPayer,
    delivery_method: document.getElementById('quoteDeliveryMethod').value,
    agent_id: document.getElementById('quoteAgentSelect').value || null,
    show_agent_on_invoice: document.getElementById('quoteShowAgent').checked,
    notes: document.getElementById('quoteNotes').value.trim(),
  };
  if(editingQuoteId){ payload.id = editingQuoteId; await postParts('update_quotation', payload); }
  else { await postParts('add_quotation', payload); }
  closeQuoteModal();
  showToast(editingQuoteId ? 'پیش‌فاکتور ویرایش شد' : 'پیش‌فاکتور ثبت شد','success');
}
function quoteStatusBadge(q){
  if(q.status==='converted') return '<span class="pay-badge pay-paid">✅ تبدیل به فروش</span>';
  if(q.status==='rejected') return '<span class="pay-badge pay-unpaid">❌ رد شده</span>';
  if(q.valid_until && q.valid_until < jalaliTodayLocal_iso()) return '<span class="pay-badge pay-partial">⌛ منقضی شده</span>';
  return '<span class="pay-badge pay-partial">🕓 باز</span>';
}
function jalaliTodayLocal_iso(){
  const d = new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function renderQuotesList(){
  const list = document.getElementById('quotesList');
  if(!list) return;
  const sorted = [...PARTS.quotations].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  if(!sorted.length){ list.innerHTML = '<div class="parts-empty"><div class="pe-icon">📝</div><div class="pe-text">هنوز پیش‌فاکتوری ثبت نشده.</div></div>'; return; }
  list.innerHTML = '';
  sorted.forEach(q=>{
    const bodyId = 'quoteBody-'+q.id;
    const el = document.createElement('div');
    el.className = 'tx-list-item';
    el.innerHTML = `
      <div class="tx-list-head" onclick="document.getElementById('${bodyId}').classList.toggle('open')">
        <div>
          <div class="tx-list-title">#${q.quote_no} · ${escHtml(q.customer_name||'مشتری بدون نام')} · ${q.items.length} قلم</div>
          <div class="tx-list-sub">${jalaliFullLabel(q.date)}${q.valid_until?' · اعتبار تا '+jalaliFullLabel(q.valid_until):''}</div>
          <div style="margin-top:4px;">${quoteStatusBadge(q)}</div>
        </div>
        <div class="tx-list-amount">${fmtT(q.invoice_total)}</div>
      </div>
      <div class="tx-list-body" id="${bodyId}">
        ${q.items.map(it=>`<div class="tx-list-line"><span>${escHtml(productLabel(productById(it.product_id)))} × ${it.qty}</span><span>${fmtT(it.qty*it.unit_price-(it.discount||0))}</span></div>`).join('')}
        ${q.notes ? `<div class="tx-list-line"><span>📝 ${escHtml(q.notes)}</span><span></span></div>` : ''}
        <div class="tx-list-actions">
          <button onclick="event.stopPropagation();printQuote('${q.id}')">🖨 چاپ</button>
          ${q.status==='open' ? `<button onclick="event.stopPropagation();openQuoteModal('${q.id}')">✎ Edit</button>` : ''}
          ${q.status==='open' ? `<button onclick="event.stopPropagation();convertQuoteToSale('${q.id}')">✅ تبدیل به فروش</button>` : ''}
          ${q.status==='open' ? `<button class="del" onclick="event.stopPropagation();setQuoteRejected('${q.id}')">❌ رد کن</button>` : ''}
          <button class="del" onclick="event.stopPropagation();deleteQuote('${q.id}')">🗑 Delete</button>
        </div>
      </div>`;
    list.appendChild(el);
  });
}
function setQuoteRejected(id){ postParts('set_quotation_status', {id, status:'rejected'}); }
function deleteQuote(id){
  if(!confirm('این پیش‌فاکتور حذف بشه؟')) return;
  postParts('delete_quotation', {id});
}
async function convertQuoteToSale(id){
  const q = PARTS.quotations.find(x=>x.id===id);
  if(!q) return;
  if(!confirm(`این پیش‌فاکتور به یه فروش واقعی (به مبلغ ${fmtT(q.invoice_total)}) تبدیل بشه؟ می‌تونی بعداً وضعیت پرداختش رو عوض کنی.`)) return;
  await postParts('add_sale', {
    date: jalaliTodayLocal_iso(), customer_id: q.customer_id, customer_name: q.customer_name, customer_phone: q.customer_phone,
    items: q.items, discount: q.discount, tax_percent: q.tax_percent, shipping_cost: q.shipping_cost,
    shipping_payer: q.shipping_payer, shipping_split_ratio: q.shipping_split_ratio, delivery_method: q.delivery_method,
    agent_id: q.agent_id, show_agent_on_invoice: q.show_agent_on_invoice, payment_status: 'unpaid',
    notes: q.notes, from_quotation_id: q.id,
  });
  showToast('فروش ثبت شد — حالا می‌تونی وضعیت پرداختش رو عوض کنی','success');
  showPartsSub('sales');
}
function printQuote(id){
  const q = PARTS.quotations.find(x=>x.id===id);
  if(!q) return;
  renderQuoteDocument(q);
  document.getElementById('invoiceModalOverlay').classList.add('open');
}
function renderQuoteDocument(q){
  const bp = PARTS.business_profile || {};
  const theme = bp.invoice_theme === 'minimal' ? 'minimal' : 'classic';
  const itemDiscountTotal = q.items.reduce((s,it)=>s+(Number(it.discount)||0),0);
  const el = document.getElementById('invoicePrintArea');
  el.className = 'inv-theme-'+theme;
  el.innerHTML = `
    <div class="inv-header">
      ${bp.logo ? `<img src="${bp.logo}" class="inv-logo">` : ''}
      <div class="inv-biz-name">${escHtml(bp.name || 'کسب و کار من')}</div>
      <div class="inv-biz-meta">${[bp.address, bp.phone].filter(Boolean).map(escHtml).join(' · ')}</div>
    </div>
    <div class="inv-meta-row">
      <div>پیش‌فاکتور: <b>${faDigits(q.quote_no)}</b></div>
      <div>تاریخ: <b>${jalaliDateFa(q.date)}</b></div>
    </div>
    ${q.valid_until ? `<div class="inv-meta-row" style="border-top:none;"><div>اعتبار تا: <b>${jalaliDateFa(q.valid_until)}</b></div><div></div></div>` : ''}
    ${(q.customer_name||q.customer_phone) ? `<div class="inv-customer"><b>مشتری:</b> ${escHtml(q.customer_name||'-')}${q.customer_phone?' · '+escHtml(q.customer_phone):''}</div>` : ''}
    <table class="inv-table">
      <colgroup><col style="width:8%"><col style="width:34%"><col style="width:10%"><col style="width:16%"><col style="width:14%"><col style="width:18%"></colgroup>
      <thead><tr><th>ردیف</th><th>شرح کالا</th><th>تعداد</th><th>قیمت واحد</th><th>تخفیف</th><th>جمع</th></tr></thead>
      <tbody>${q.items.map((it,i)=>{
        const d = Number(it.discount)||0;
        return `<tr><td>${faDigits(i+1)}</td><td class="inv-td-desc">${escHtml(productLabel(productById(it.product_id)))}</td>
          <td>${faDigits(it.qty)}</td><td>${fmtToman(it.unit_price)}</td>
          <td>${d>0?'− '+fmtToman(d):'—'}</td><td>${fmtToman(it.qty*it.unit_price-d)}</td></tr>`;
      }).join('')}</tbody>
    </table>
    <div class="inv-totals">
      <div class="inv-total-row"><span>جمع کل (بعد از تخفیف هر ردیف)</span><span>${fmtToman(q.subtotal - itemDiscountTotal)}</span></div>
      ${Number(q.discount)>0 ? `<div class="inv-total-row"><span>تخفیف کلی</span><span>− ${fmtToman(q.discount)}</span></div>` : ''}
      ${q.shipping_charged_to_customer>0 ? `<div class="inv-total-row"><span>هزینه ارسال</span><span>+ ${fmtToman(q.shipping_charged_to_customer)}</span></div>` : ''}
      ${Number(q.tax_percent)>0 ? `<div class="inv-total-row"><span>مالیات (${faDigits(q.tax_percent)}%)</span><span>${fmtToman(q.tax_amount)}</span></div>` : ''}
      <div class="inv-total-row inv-grand"><span>جمع قابل پرداخت</span><span>${fmtToman(q.invoice_total)}</span></div>
    </div>
    ${(q.agent_id && q.show_agent_on_invoice && agentById(q.agent_id)) ? `<div class="inv-customer"><b>نماینده فروش:</b> ${escHtml(agentById(q.agent_id).name)}</div>` : ''}
    ${q.notes ? `<div class="inv-note">📝 ${escHtml(q.notes)}</div>` : ''}
    <div class="inv-footer">این یک پیش‌فاکتوره و قیمت‌ها تا ${q.valid_until?jalaliDateFa(q.valid_until):'اطلاع ثانوی'} معتبره.</div>
  `;
}

// ─── SALE RETURNS (مرجوعی) ───────────────────────────
let returnItemsCache = [];  // the picked sale's items, enriched, while the return form is open
function renderReturnSaleSelect(){
  const sel = document.getElementById('retSaleSelect');
  if(!sel) return;
  const cur = sel.value;
  const eligible = PARTS.sales.filter(s=>s.items.some(it=>(it.qty-(it.returned_qty||0))>0.001));
  sel.innerHTML = '<option value="">— یه فروش انتخاب کن —</option>' +
    eligible.map(s=>`<option value="${s.id}">${escHtml(s.customer_name||'مشتری بدون نام')} · ${jalaliFullLabel(s.date)}${s.invoice_no?' · فاکتور #'+s.invoice_no:''} · ${fmtT(s.invoice_total)}</option>`).join('');
  if([...sel.options].some(o=>o.value===cur)) sel.value = cur;
  ssSync('retSaleSelect');
}
function renderReturnItemPicker(){
  const said = document.getElementById('retSaleSelect').value;
  const picker = document.getElementById('returnItemPicker');
  const cashRow = document.getElementById('returnCashRow');
  const restockWrap = document.getElementById('retRestockWrap');
  const noteEl = document.getElementById('retNote');
  const saveBtn = document.getElementById('retSaveBtn');
  if(!said){
    picker.innerHTML = '';
    cashRow.style.display = 'none'; restockWrap.style.display = 'none'; noteEl.style.display = 'none'; saveBtn.style.display = 'none';
    document.getElementById('returnSummary').innerHTML = '';
    return;
  }
  const sale = PARTS.sales.find(s=>s.id===said);
  returnItemsCache = sale.items.map((it,idx)=>({idx, product_id: it.product_id,
    left: Math.max(it.qty - (it.returned_qty||0), 0), eff: it.eff_unit_net||0}));
  picker.innerHTML = `<table class="parts-table"><thead><tr><th>کالا</th><th>فروخته‌شده</th><th>قابل مرجوع</th><th>تعداد مرجوعی</th><th>قیمت هر واحد</th></tr></thead><tbody>
    ${returnItemsCache.map(r=>`<tr>
      <td>${escHtml(productLabel(productById(r.product_id)))}</td>
      <td>${fmtNum(sale.items[r.idx].qty)}</td>
      <td>${fmtNum(r.left)}</td>
      <td><input type="number" class="modal-input" style="width:80px;margin:0;" min="0" max="${r.left}" step="1"
            id="retQty_${r.idx}" ${r.left<=0?'disabled':''} value="0" oninput="computeReturnPreview()"/></td>
      <td><input type="number" class="modal-input" style="width:100px;margin:0;" min="0" max="${r.eff}"
            id="retPrice_${r.idx}" value="${r.eff}" oninput="computeReturnPreview()"/></td>
    </tr>`).join('')}
  </tbody></table>`;
  cashRow.style.display = 'flex'; restockWrap.style.display = 'flex'; noteEl.style.display = 'block';
  renderJalaliPicker('retDatePicker','retDateHidden', sale.date, ()=>{});
  computeReturnPreview();
}
function computeReturnPreview(){
  const said = document.getElementById('retSaleSelect').value;
  const sale = PARTS.sales.find(s=>s.id===said);
  if(!sale) return;
  let refundNet = 0, anyQty = false;
  returnItemsCache.forEach(r=>{
    const qtyEl = document.getElementById('retQty_'+r.idx);
    const priceEl = document.getElementById('retPrice_'+r.idx);
    if(!qtyEl) return;
    let qty = parseFloat(qtyEl.value)||0;
    if(qty > r.left){ qty = r.left; qtyEl.value = qty; }
    let price = parseFloat(priceEl.value)||0;
    if(price > r.eff){ price = r.eff; priceEl.value = price; }
    if(qty>0){ anyQty = true; refundNet += qty*price; }
  });
  const taxPct = Number(sale.tax_percent)||0;
  const refundTotal = refundNet * (1 + taxPct/100);
  document.getElementById('retCashRefunded').value = anyQty ? Math.round(refundTotal*100)/100 : '';
  document.getElementById('retCashRefunded').max = refundTotal;
  document.getElementById('returnSummary').innerHTML = anyQty ? `
    <div class="parts-kpi-card" style="--kpi-color:var(--coral);margin-bottom:10px;">
      <div class="parts-kpi-label">جمع مرجوعی (با مالیات)</div>
      <div class="parts-kpi-val" style="color:var(--coral);">${fmtT(refundTotal)}</div>
    </div>` : '';
  document.getElementById('retSaveBtn').style.display = anyQty ? 'block' : 'none';
}
async function saveSaleReturn(){
  const said = document.getElementById('retSaleSelect').value;
  if(!said){ showToast('یه فروش انتخاب کن','error'); return; }
  const items = [];
  returnItemsCache.forEach(r=>{
    const qty = parseFloat(document.getElementById('retQty_'+r.idx).value)||0;
    if(qty>0) items.push({idx:r.idx, product_id:r.product_id, qty, refund_unit_price: parseFloat(document.getElementById('retPrice_'+r.idx).value)||0});
  });
  if(!items.length){ showToast('حداقل یه ردیف رو مقدار بده','error'); return; }
  const res = await postParts('add_sale_return', {
    sale_id: said, date: document.getElementById('retDateHidden').value, items,
    restock: document.getElementById('retRestock').checked,
    cash_refunded: document.getElementById('retCashRefunded').value,
    note: document.getElementById('retNote').value.trim(),
  });
  if(!res || res.ok===false) return;
  showToast('مرجوعی ثبت شد','success');
  document.getElementById('retSaleSelect').value = ''; ssSync('retSaleSelect');
  renderReturnSaleSelect();
  renderReturnItemPicker();
}
function deleteReturn(id){
  if(!confirm('این مرجوعی حذف بشه؟ (موجودی و مبلغ فروش به حالت قبل برمی‌گرده)')) return;
  postParts('delete_sale_return',{id});
  showToast('مرجوعی حذف شد','success');
}
function renderReturnsHistory(){
  const list = document.getElementById('returnsHistoryList');
  if(!list) return;
  const sorted = [...PARTS.sale_returns].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  if(!sorted.length){ list.innerHTML = '<div class="parts-empty"><div class="pe-icon">↩️</div><div class="pe-text">هنوز مرجوعی‌ای ثبت نشده.</div></div>'; return; }
  list.innerHTML = '';
  sorted.forEach(r=>{
    const sale = PARTS.sales.find(s=>s.id===r.sale_id);
    const bodyId = 'retBody-'+r.id;
    const el = document.createElement('div');
    el.className = 'tx-list-item';
    el.innerHTML = `
      <div class="tx-list-head" onclick="document.getElementById('${bodyId}').classList.toggle('open')">
        <div>
          <div class="tx-list-title">مرجوعی از ${escHtml(sale?sale.customer_name||'مشتری بدون نام':'(فروش حذف‌شده)')}</div>
          <div class="tx-list-sub">${jalaliFullLabel(r.date)}${r.restock?' · 🔄 برگشت به انبار':' · 🚫 بدون برگشت به انبار'}</div>
        </div>
        <div class="tx-list-amount" style="color:var(--coral);">${fmtT(r.refund_total)}</div>
      </div>
      <div class="tx-list-body" id="${bodyId}">
        ${r.items.map(it=>`<div class="tx-list-line"><span>${escHtml(productLabel(productById(it.product_id)))} × ${it.qty}</span><span>${fmtT(it.qty*it.refund_unit_price)}</span></div>`).join('')}
        <div class="tx-list-line"><span>نقد برگردونده‌شده</span><span>${fmtT(r.cash_refunded)}</span></div>
        ${r.note ? `<div class="tx-list-line"><span>📝 ${escHtml(r.note)}</span><span></span></div>` : ''}
        <div class="tx-list-actions"><button class="del" onclick="event.stopPropagation();deleteReturn('${r.id}')">🗑 Delete</button></div>
      </div>`;
    list.appendChild(el);
  });
}

// ─── PURCHASE FORM ──────────────────────────────────
function togglePurchaseSameDay(){
  const same = document.getElementById('purchaseSameDay').checked;
  document.getElementById('purchaseReceiptDateWrap').style.display = same ? 'none' : 'block';
}
function addPurchaseCartItem(){
  const pid = document.getElementById('purchaseItemProduct').value;
  const qty = parseFloat(document.getElementById('purchaseItemQty').value);
  const price = parseFloat(document.getElementById('purchaseItemPrice').value);
  if(!pid){ showToast('Pick a product first','error'); return; }
  if(!qty || qty<=0){ showToast('Enter a quantity','error'); return; }
  if(price==null || isNaN(price) || price<0){ showToast('Enter a unit price','error'); return; }
  purchaseCartItems.push({product_id:pid, qty, unit_price:price});
  document.getElementById('purchaseItemQty').value = 1;
  document.getElementById('purchaseItemPrice').value = '';
  renderPurchaseCart();
}
function removePurchaseCartItem(idx){ purchaseCartItems.splice(idx,1); renderPurchaseCart(); }
function renderPurchaseCart(){
  const c = document.getElementById('purchaseCart');
  c.innerHTML = '';
  if(!purchaseCartItems.length){
    c.innerHTML = '<div class="tx-cart-empty">No items added yet.</div>';
  } else {
    purchaseCartItems.forEach((it,idx)=>{
      const p = productById(it.product_id);
      const el = document.createElement('div');
      el.className = 'tx-cart-item';
      el.innerHTML = `<div class="tx-cart-item-info">
          <div class="tx-cart-item-name">${escHtml(productLabel(p))}</div>
          <div class="tx-cart-item-detail">${it.qty} × ${fmtT(it.unit_price)}</div>
        </div>
        <div class="tx-cart-item-total">${fmtT(it.qty*it.unit_price)}</div>
        <button class="tx-cart-del" onclick="removePurchaseCartItem(${idx})">✕</button>`;
      c.appendChild(el);
    });
  }
  const total = purchaseCartItems.reduce((s,it)=>s+it.qty*it.unit_price,0);
  document.getElementById('purchaseTotalVal').textContent = fmtT(total);
}
async function savePurchase(){
  const storeId = document.getElementById('purchaseStoreSelect').value;
  if(!storeId){ showToast('Pick a store','error'); return; }
  if(!purchaseCartItems.length){ showToast('Add at least one item','error'); return; }
  const sameDay = document.getElementById('purchaseSameDay').checked;
  const orderDate = document.getElementById('purchaseOrderDateHidden').value;
  const receiptDate = sameDay ? orderDate : document.getElementById('purchaseReceiptDateHidden').value;
  const payload = {
    store_id: storeId, order_date: orderDate, receipt_date: receiptDate, same_day: sameDay,
    items: purchaseCartItems, delivery_method: document.getElementById('purchaseDeliveryMethod').value,
    payment_status: purchasePaymentStatus,
    amount_paid: purchasePaymentStatus==='partial' ? (document.getElementById('purchaseAmountPaid').value.trim() || 0) : 0,
    notes: document.getElementById('purchaseNotes').value.trim(),
  };
  if(purchaseInvoiceImage !== null) payload.invoice_image = purchaseInvoiceImage;
  if(purchaseReceiptImage !== null) payload.receipt_image = purchaseReceiptImage;
  if(editingPurchaseId){ payload.id = editingPurchaseId; await postParts('update_purchase', payload); }
  else { await postParts('add_purchase', payload); }

  showToast(editingPurchaseId ? 'Purchase updated' : 'Purchase saved','success');
  closePurchaseModal();
  purchaseCartItems = [];
  renderPurchaseCart();
}
function openPurchaseModal(id){
  editingPurchaseId = id || null;
  document.getElementById('purchaseModalTitle').textContent = id ? 'Edit Purchase' : '🧾 Record a Purchase';
  purchaseInvoiceImage = null; purchaseReceiptImage = null;
  if(id){
    const pur = PARTS.purchases.find(p=>p.id===id);
    if(!pur) return;
    document.getElementById('purchaseStoreSelect').value = pur.store_id;
    renderJalaliPicker('purchaseOrderDatePicker','purchaseOrderDateHidden', pur.order_date, ()=>{});
    const sameDay = !!pur.same_day;
    document.getElementById('purchaseSameDay').checked = sameDay;
    togglePurchaseSameDay();
    renderJalaliPicker('purchaseReceiptDatePicker','purchaseReceiptDateHidden', pur.receipt_date, ()=>{});
    purchaseCartItems = pur.items.map(it=>({...it}));
    document.getElementById('purchaseDeliveryMethod').value = pur.delivery_method||'';
    setPurchasePaymentStatus(pur.payment_status||'paid');
    document.getElementById('purchaseAmountPaid').value = pur.amount_paid||'';
    document.getElementById('purchaseNotes').value = pur.notes||'';
    setPurchaseDocPreview('invoice', pur.invoice_image||'');
    setPurchaseDocPreview('receipt', pur.receipt_image||'');
  } else {
    renderStoreSelect();
    renderJalaliPicker('purchaseOrderDatePicker','purchaseOrderDateHidden', null, ()=>{});
    document.getElementById('purchaseSameDay').checked = true;
    togglePurchaseSameDay();
    purchaseCartItems = [];
    document.getElementById('purchaseDeliveryMethod').value = '';
    setPurchasePaymentStatus('paid');
    document.getElementById('purchaseAmountPaid').value = '';
    document.getElementById('purchaseNotes').value = '';
    setPurchaseDocPreview('invoice', '');
    setPurchaseDocPreview('receipt', '');
  }
  renderPurchaseCart();
  document.getElementById('purchaseModalSaveBtn').textContent = id ? 'Update Purchase' : 'Save Purchase';
  document.getElementById('purchaseModalOverlay').classList.add('open');
}
function closePurchaseModal(){
  document.getElementById('purchaseModalOverlay').classList.remove('open');
  editingPurchaseId = null;
  purchaseInvoiceImage = null; purchaseReceiptImage = null;
}
function deletePurchase(id){
  postParts('delete_purchase',{id});
  showToast('Purchase deleted','success');
  if(editingPurchaseId===id) closePurchaseModal();
}
function setPurchaseDocPreview(kind, src){
  const ids = kind==='invoice'
    ? {preview:'purInvoicePreview', icon:'purInvoiceHintIcon', text:'purInvoiceHintText', btn:'purInvoiceRemoveBtn'}
    : {preview:'purReceiptPreview', icon:'purReceiptHintIcon', text:'purReceiptHintText', btn:'purReceiptRemoveBtn'};
  const preview = document.getElementById(ids.preview);
  if(src){
    preview.src = src; preview.style.display='block';
    document.getElementById(ids.icon).style.display='none';
    document.getElementById(ids.text).style.display='none';
    document.getElementById(ids.btn).style.display='flex';
  } else {
    preview.style.display='none';
    document.getElementById(ids.icon).style.display='block';
    document.getElementById(ids.text).style.display='block';
    document.getElementById(ids.btn).style.display='none';
  }
}
function onPurchaseDocSelected(ev, kind){
  const file = ev.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e=>{
    const img = new Image();
    img.onload = ()=>{
      // Plain downscale + compress — no crop, since invoices/receipts should keep their real shape.
      const MAX = 1400;
      let w = img.naturalWidth, h = img.naturalHeight;
      if(w>MAX || h>MAX){ const s = MAX/Math.max(w,h); w = Math.round(w*s); h = Math.round(h*s); }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      if(kind==='invoice') purchaseInvoiceImage = dataUrl; else purchaseReceiptImage = dataUrl;
      setPurchaseDocPreview(kind, dataUrl);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  ev.target.value = '';
}
function removePurchaseDoc(kind){
  if(kind==='invoice') purchaseInvoiceImage = ''; else purchaseReceiptImage = '';
  setPurchaseDocPreview(kind, '');
}
function openDocViewer(src){
  document.getElementById('docViewerImg').src = src;
  document.getElementById('docViewerOverlay').classList.add('open');
}
function closeDocViewer(){
  document.getElementById('docViewerOverlay').classList.remove('open');
}
function exportTableToCsv(tableId, filename){
  const table = document.getElementById(tableId);
  if(!table) return;
  const rows = [...table.querySelectorAll('tr')];
  const csv = rows.map(tr=>[...tr.querySelectorAll('th,td')]
    .map(cell=>'"'+cell.textContent.replace(/\s+/g,' ').trim().replace(/"/g,'""')+'"')
    .join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function paymentBadgeHtml(status, outstanding){
  if(status==='unpaid') return `<span class="pay-badge pay-unpaid">🔴 نسیه${outstanding>0?' · '+fmtT(outstanding)+' مانده':''}</span>`;
  if(status==='partial') return `<span class="pay-badge pay-partial">🟡 قسمتی${outstanding>0?' · '+fmtT(outstanding)+' مانده':''}</span>`;
  return `<span class="pay-badge pay-paid">✅ پرداخت‌شده</span>`;
}
function renderPurchaseHistory(){
  const list = document.getElementById('purchaseHistoryList');
  list.innerHTML = '';
  const sorted = [...PARTS.purchases].sort((a,b)=>(b.order_date||'').localeCompare(a.order_date||''));
  if(!sorted.length){ list.innerHTML = '<div class="parts-empty"><div class="pe-icon">🧾</div><div class="pe-text">No purchases recorded yet.</div></div>'; return; }
  sorted.forEach(pur=>{
    const store = storeById(pur.store_id);
    const total = pur.items.reduce((s,it)=>s+it.qty*it.unit_price,0);
    const status = pur.payment_status||'paid';
    const paid = status==='paid'?total:(status==='unpaid'?0:Math.min(Number(pur.amount_paid)||0,total));
    const outstanding = total - paid;
    const el = document.createElement('div');
    el.className = 'tx-list-item';
    const bodyId = 'purBody-'+pur.id;
    el.innerHTML = `
      <div class="tx-list-head" onclick="document.getElementById('${bodyId}').classList.toggle('open')">
        <div>
          <div class="tx-list-title">${pur.po_no?'PO#'+pur.po_no+' · ':''}${escHtml(store ? store.name : '(deleted store)')} · ${pur.items.length} item${pur.items.length===1?'':'s'}</div>
          <div class="tx-list-sub">${jalaliFullLabel(pur.order_date)}${!pur.same_day ? ' → received '+jalaliFullLabel(pur.receipt_date) : ''}${pur.delivery_method?' · 🚚 '+escHtml(pur.delivery_method):''}</div>
          <div style="margin-top:4px;">${paymentBadgeHtml(status, outstanding)}</div>
        </div>
        <div class="tx-list-amount">${fmtT(total)}</div>
      </div>
      <div class="tx-list-body" id="${bodyId}">
        ${pur.items.map(it=>`<div class="tx-list-line"><span>${escHtml(productLabel(productById(it.product_id)))} × ${it.qty}</span><span>${fmtT(it.qty*it.unit_price)}</span></div>`).join('')}
        ${pur.notes ? `<div class="tx-list-line"><span>📝 ${escHtml(pur.notes)}</span><span></span></div>` : ''}
        ${(pur.invoice_image || pur.receipt_image) ? `<div class="tx-list-actions" style="margin-top:6px;">
          ${pur.invoice_image ? `<button class="doc-chip" onclick="openDocViewer('${pur.invoice_image}')">🧾 Invoice</button>` : ''}
          ${pur.receipt_image ? `<button class="doc-chip" onclick="openDocViewer('${pur.receipt_image}')">🧾 Receipt</button>` : ''}
        </div>` : ''}
        <div class="tx-list-actions">
          <button onclick="openPurchaseModal('${pur.id}')">✎ Edit</button>
          <button class="del" onclick="deletePurchase('${pur.id}')">🗑 Delete</button>
        </div>
      </div>`;
    list.appendChild(el);
  });
}

// ─── SALE FORM ──────────────────────────────────────
function onSaleProductChange(){
  const pid = document.getElementById('saleItemProduct').value;
  const hint = document.getElementById('saleStockHint');
  if(!pid){ hint.textContent=''; return; }
  const inCart = saleCartItems.filter(it=>it.product_id===pid).reduce((s,it)=>s+it.qty,0);
  const avail = (PARTS.stock[pid]||0) - inCart;
  const cost = PARTS.avg_cost[pid]||0;
  hint.textContent = avail>0
    ? `${avail} available (avg cost ${fmtT(cost)})`
    : `⚠ No tracked stock left for this part — selling anyway will use an estimated cost.`;
  const priceField = document.getElementById('saleItemPrice');
  const p = productById(pid);
  if(p && p.sale_price!=null && !priceField.value){ priceField.value = p.sale_price; }
}
function addSaleCartItem(){
  const pid = document.getElementById('saleItemProduct').value;
  const qty = parseFloat(document.getElementById('saleItemQty').value);
  const price = parseFloat(document.getElementById('saleItemPrice').value);
  const discount = parseFloat(document.getElementById('saleItemDiscount').value) || 0;
  if(!pid){ showToast('Pick a product first','error'); return; }
  if(!qty || qty<=0){ showToast('Enter a quantity','error'); return; }
  if(price==null || isNaN(price) || price<0){ showToast('Enter a sell price','error'); return; }
  const inCart = saleCartItems.filter(it=>it.product_id===pid).reduce((s,it)=>s+it.qty,0);
  const avail = (PARTS.stock[pid]||0) - inCart;
  if(qty > avail){
    showToast(`Only ${avail} tracked in stock — added anyway with an estimated cost`,'error');
  }
  saleCartItems.push({product_id:pid, qty, unit_price:price, discount});
  document.getElementById('saleItemQty').value = 1;
  document.getElementById('saleItemPrice').value = '';
  document.getElementById('saleItemDiscount').value = '';
  renderSaleCart();
  onSaleProductChange();
}
function removeSaleCartItem(idx){ saleCartItems.splice(idx,1); renderSaleCart(); onSaleProductChange(); }
function renderSaleCart(){
  const c = document.getElementById('saleCart');
  c.innerHTML = '';
  if(!saleCartItems.length){
    c.innerHTML = '<div class="tx-cart-empty">No items added yet.</div>';
  } else {
    saleCartItems.forEach((it,idx)=>{
      const p = productById(it.product_id);
      const disc = Number(it.discount)||0;
      const lineTotal = it.qty*it.unit_price - disc;
      const el = document.createElement('div');
      el.className = 'tx-cart-item';
      el.innerHTML = `<div class="tx-cart-item-info">
          <div class="tx-cart-item-name">${escHtml(productLabel(p))}</div>
          <div class="tx-cart-item-detail">${it.qty} × ${fmtT(it.unit_price)}${disc>0?` − ${fmtT(disc)} تخفیف`:''}</div>
        </div>
        <div class="tx-cart-item-total">${fmtT(lineTotal)}</div>
        <button class="tx-cart-del" onclick="removeSaleCartItem(${idx})">✕</button>`;
      c.appendChild(el);
    });
  }
  const total = saleCartItems.reduce((s,it)=>s+it.qty*it.unit_price-(Number(it.discount)||0),0);
  document.getElementById('saleTotalVal').textContent = fmtT(total);
}
async function saveSale(){
  if(!saleCartItems.length){ showToast('Add at least one item','error'); return; }
  const payload = {
    date: document.getElementById('saleDateHidden').value,
    customer_name: document.getElementById('saleCustomerName').value.trim(),
    customer_phone: document.getElementById('saleCustomerPhone').value.trim(),
    customer_address: document.getElementById('saleCustomerAddress').value.trim(),
    discount: document.getElementById('saleDiscount').value.trim() || 0,
    tax_percent: document.getElementById('saleTaxPercent').value.trim() || 0,
    shipping_cost: document.getElementById('saleShippingCost').value.trim() || 0,
    shipping_payer: saleShippingPayer,
    customer_id: document.getElementById('saleCustomerSelect').value || null,
    agent_id: document.getElementById('saleAgentSelect').value || null,
    commission_percent: document.getElementById('saleAgentSelect').value ? document.getElementById('saleCommissionPct').value.trim() : undefined,
    commission_basis: saleCommissionBasis,
    show_agent_on_invoice: document.getElementById('saleShowAgent').checked,
    shipping_split_ratio: (parseFloat(document.getElementById('saleShippingRatio').value) || 50) / 100,
    delivery_method: document.getElementById('saleDeliveryMethod').value,
    payment_status: salePaymentStatus,
    amount_paid: salePaymentStatus==='partial' ? (document.getElementById('saleAmountPaid').value.trim() || 0) : 0,
    notes: document.getElementById('saleNotes').value.trim(),
    items: saleCartItems,
  };
  if(editingSaleId){ payload.id = editingSaleId; await postParts('update_sale', payload); }
  else { await postParts('add_sale', payload); }

  showToast(editingSaleId ? 'Sale updated' : 'Sale saved','success');
  closeSaleModal();
  saleCartItems = [];
  renderSaleCart();
}
function openSaleModal(id){
  editingSaleId = id || null;
  document.getElementById('saleModalTitle').textContent = id ? 'Edit Sale' : '💵 Record a Sale';
  if(id){
    const sale = PARTS.sales.find(s=>s.id===id);
    if(!sale) return;
    renderJalaliPicker('saleDatePicker','saleDateHidden', sale.date, ()=>{});
    document.getElementById('saleCustomerSelect').value = sale.customer_id||'';
    ssSync('saleCustomerSelect');
    document.getElementById('saleCustomerName').value = sale.customer_name||'';
    document.getElementById('saleCustomerPhone').value = sale.customer_phone||'';
    document.getElementById('saleCustomerAddress').value = sale.customer_address||'';
    document.getElementById('saleDiscount').value = sale.discount||'';
    document.getElementById('saleTaxPercent').value = sale.tax_percent||'';
    document.getElementById('saleShippingCost').value = sale.shipping_cost||'';
    setSaleShippingPayer(sale.shipping_payer||'customer');
    document.getElementById('saleAgentSelect').value = sale.agent_id||'';
    ssSync('saleAgentSelect');
    if(sale.agent_id){
      document.getElementById('saleCommissionWrap').style.display = 'block';
      document.getElementById('saleCommissionPct').value = sale.commission_percent!=null ? sale.commission_percent : '';
      setSaleCommissionBasis(sale.commission_basis || 'profit');
    } else {
      document.getElementById('saleCommissionWrap').style.display = 'none';
    }
    document.getElementById('saleShowAgent').checked = !!sale.show_agent_on_invoice;
    document.getElementById('saleShippingRatio').value = sale.shipping_split_ratio!=null ? Math.round(sale.shipping_split_ratio*100) : 50;
    document.getElementById('saleDeliveryMethod').value = sale.delivery_method||'';
    setSalePaymentStatus(sale.payment_status||'paid');
    document.getElementById('saleAmountPaid').value = sale.amount_paid||'';
    document.getElementById('saleNotes').value = sale.notes||'';
    saleCartItems = sale.items.map(it=>({product_id:it.product_id, qty:it.qty, unit_price:it.unit_price, discount:it.discount||0}));
  } else {
    renderJalaliPicker('saleDatePicker','saleDateHidden', null, ()=>{});
    document.getElementById('saleCustomerSelect').value = '';
    ssSync('saleCustomerSelect');
    document.getElementById('saleCustomerName').value = '';
    document.getElementById('saleCustomerPhone').value = '';
    document.getElementById('saleCustomerAddress').value = '';
    document.getElementById('saleDiscount').value = '';
    document.getElementById('saleShippingCost').value = '';
    setSaleShippingPayer('customer');
    document.getElementById('saleAgentSelect').value = '';
    ssSync('saleAgentSelect');
    document.getElementById('saleCommissionWrap').style.display = 'none';
    document.getElementById('saleCommissionPct').value = '';
    setSaleCommissionBasis('profit');
    document.getElementById('saleShowAgent').checked = false;
    document.getElementById('saleShippingRatio').value = 50;
    document.getElementById('saleDeliveryMethod').value = '';
    setSalePaymentStatus('paid');
    document.getElementById('saleAmountPaid').value = '';
    document.getElementById('saleTaxPercent').value = '';
    document.getElementById('saleNotes').value = '';
    saleCartItems = [];
  }
  renderProductSelects();
  renderSaleCart();
  document.getElementById('saleModalSaveBtn').textContent = id ? 'Update Sale' : 'Save Sale';
  document.getElementById('saleModalOverlay').classList.add('open');
}
function closeSaleModal(){
  document.getElementById('saleModalOverlay').classList.remove('open');
  editingSaleId = null;
}
function deleteSale(id){
  postParts('delete_sale',{id});
  showToast('Sale deleted','success');
  if(editingSaleId===id) closeSaleModal();
}
function renderSalesHistory(){
  const list = document.getElementById('salesHistoryList');
  list.innerHTML = '';
  const sorted = [...PARTS.sales].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  if(!sorted.length){ list.innerHTML = '<div class="parts-empty"><div class="pe-icon">💵</div><div class="pe-text">No sales recorded yet.</div></div>'; return; }
  sorted.forEach(sale=>{
    const el = document.createElement('div');
    el.className = 'tx-list-item';
    const bodyId = 'saleBody-'+sale.id;
    const profitClass = sale.profit>=0 ? 'profit-pos' : 'profit-neg';
    const status = sale.payment_status||'paid';
    el.innerHTML = `
      <div class="tx-list-head" onclick="document.getElementById('${bodyId}').classList.toggle('open')">
        <div>
          <div class="tx-list-title">${escHtml(sale.customer_name || 'Walk-in customer')} · ${sale.items.length} item${sale.items.length===1?'':'s'}</div>
          <div class="tx-list-sub">${jalaliFullLabel(sale.date)}${sale.delivery_method?' · 🚚 '+escHtml(sale.delivery_method):''}${sale.agent_id && agentById(sale.agent_id)?' · 🧑‍💼 '+escHtml(agentById(sale.agent_id).name):''}</div>
          <div style="margin-top:4px;">${paymentBadgeHtml(status, sale.amount_outstanding||0)}</div>
        </div>
        <div>
          <div class="tx-list-amount">${fmtT(sale.revenue)}</div>
          <div class="tx-list-amount ${profitClass}" style="font-size:11px;">profit ${fmtT(sale.profit)}</div>
        </div>
      </div>
      <div class="tx-list-body" id="${bodyId}">
        ${sale.items.map(it=>`<div class="tx-list-line"><span>${escHtml(productLabel(productById(it.product_id)))} × ${it.qty}</span><span>${fmtT(it.revenue)} (profit ${fmtT(it.profit)})</span></div>`).join('')}
        ${sale.notes ? `<div class="tx-list-line"><span>📝 ${escHtml(sale.notes)}</span><span></span></div>` : ''}
        <div class="tx-list-actions">
          <button onclick="event.stopPropagation();openInvoicePreview('${sale.id}')">🧾 Invoice</button>
          <button onclick="event.stopPropagation();openSaleModal('${sale.id}')">✎ Edit</button>
          <button class="del" onclick="event.stopPropagation();deleteSale('${sale.id}')">🗑 Delete</button>
        </div>
      </div>`;
    list.appendChild(el);
  });
}

// ─── PURCHASE / SALE TAB SUMMARY STATS ──────────────
function renderPurchaseTabStats(){
  const wrap = document.getElementById('purchaseTabStats');
  if(!wrap) return;
  const spend30 = PARTS.purchases.filter(p=>isWithinDays(p.order_date,30))
    .reduce((s,p)=>s+p.items.reduce((a,it)=>a+it.qty*it.unit_price,0),0);
  const totalSpend = PARTS.totals.purchase_spend || 0;
  const stats = [
    ['🧾','Purchases', PARTS.purchases.length, 'var(--amber)'],
    ['💸','Total Spend', fmtT(totalSpend), 'var(--rose)'],
    ['📆','Spend, 30d', fmtT(spend30), 'var(--sky)'],
  ];
  wrap.innerHTML = stats.map(([icon,label,val,color])=>`
    <div class="parts-kpi-card" style="--kpi-color:${color}">
      <div class="parts-kpi-icon">${icon}</div>
      <div class="parts-kpi-label">${label}</div>
      <div class="parts-kpi-val" style="color:${color}">${val}</div>
    </div>`).join('');
}
function renderSaleTabStats(){
  const wrap = document.getElementById('saleTabStats');
  if(!wrap) return;
  const revenue30 = PARTS.sales.filter(s=>isWithinDays(s.date,30)).reduce((s,x)=>s+x.revenue,0);
  const profit30 = PARTS.sales.filter(s=>isWithinDays(s.date,30)).reduce((s,x)=>s+x.profit,0);
  const stats = [
    ['💵','Sales', PARTS.sales.length, 'var(--sky)'],
    ['💰','Total Revenue', fmtT(PARTS.totals.revenue||0), 'var(--sage)'],
    ['📈','Profit, 30d', fmtT(profit30), profit30>=0?'var(--sage)':'var(--coral)'],
    ['📆','Revenue, 30d', fmtT(revenue30), 'var(--sky)'],
  ];
  wrap.innerHTML = stats.map(([icon,label,val,color])=>`
    <div class="parts-kpi-card" style="--kpi-color:${color}">
      <div class="parts-kpi-icon">${icon}</div>
      <div class="parts-kpi-label">${label}</div>
      <div class="parts-kpi-val" style="color:${color}">${val}</div>
    </div>`).join('');
}

// ─── REPORTS ────────────────────────────────────────
function renderRangeChips(){
  const c = document.getElementById('partsRangeChips');
  const ranges = [['all','All time'],['month','This month'],['30d','Last 30 days']];
  c.innerHTML = ranges.map(([k,label])=>
    `<button class="parts-range-chip ${partsReportRange===k?'active':''}" onclick="setPartsRange('${k}')">${label}</button>`).join('');
}
function setPartsRange(r){ partsReportRange = r; renderReports(); }
function inRange(iso){
  if(!iso) return false;
  if(partsReportRange==='all') return true;
  if(partsReportRange==='30d'){
    const d = new Date(iso+'T12:00:00');
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-30);
    return d >= cutoff;
  }
  if(partsReportRange==='month'){
    const j = gregToJalali(iso);
    const today = jalaliTodayLocal();
    return j && today && j.y===today.y && j.m===today.m;
  }
  return true;
}
function renderReports(){
  renderRangeChips();
  document.getElementById('lowStockThresholdInput').value = PARTS.low_stock_threshold;

  const filteredSales = PARTS.sales.filter(s=>inRange(s.date));
  const filteredPurchases = PARTS.purchases.filter(p=>inRange(p.order_date));

  const revenue = filteredSales.reduce((s,x)=>s+x.revenue,0);
  const cogs = filteredSales.reduce((s,x)=>s+x.cogs,0);
  const profit = revenue - cogs;
  const margin = revenue>0 ? (profit/revenue*100) : 0;
  const purchaseSpend = filteredPurchases.reduce((s,p)=>s+p.items.reduce((a,it)=>a+it.qty*it.unit_price,0),0);

  const kpis = [
    ['💰','Revenue', fmtT(revenue), 'var(--sky)'],
    ['📦','COGS', fmtT(cogs), 'var(--amber)'],
    ['📈','Gross Profit', fmtT(profit), profit>=0?'var(--sage)':'var(--coral)'],
    ['🎯','Margin', margin.toFixed(1)+'%', 'var(--plum)'],
    ['📐','Avg Markup', (cogs>0 ? (profit/cogs*100) : 0).toFixed(1)+'%', 'var(--plum)'],
    ['🧾','Purchase Spend', fmtT(purchaseSpend), 'var(--rose)'],
    ['💸','Business Expenses', fmtT(PARTS.totals.total_expenses||0), 'var(--coral)'],
    ['🏁','Net Profit (after expenses)', fmtT((PARTS.totals.net_profit_after_expenses!=null)?PARTS.totals.net_profit_after_expenses:(profit-(PARTS.totals.total_expenses||0))), ((PARTS.totals.net_profit_after_expenses||0)>=0)?'var(--sage)':'var(--coral)'],
    ['🏷️','Inventory Value', fmtT(PARTS.totals.inventory_value||0), 'var(--sky)'],
    ['🔩','Units In Stock', fmtNum(PARTS.totals.inventory_units||0), 'var(--sage)'],
    ['⚠️','Low Stock Items', PARTS.totals.low_stock_count||0, (PARTS.totals.low_stock_count||0)>0?'var(--coral)':'var(--sage)'],
    ['💵','Sales Count', filteredSales.length, 'var(--sky)'],
    ['🧮','Avg Order Value', fmtT(filteredSales.length ? revenue/filteredSales.length : 0), 'var(--sky)'],
    ['🧾','Purchases Count', filteredPurchases.length, 'var(--amber)'],
    ['🏦','Cash Balance', fmtT(PARTS.totals.cash_balance||0), 'var(--sage)'],
    ['💎','Business Value', fmtT(PARTS.totals.business_value||0), 'var(--plum)'],
    ['📥','Accounts Receivable', fmtT(PARTS.totals.accounts_receivable||0), (PARTS.totals.accounts_receivable||0)>0?'var(--coral)':'var(--sage)'],
    ['📤','Accounts Payable', fmtT(PARTS.totals.accounts_payable||0), (PARTS.totals.accounts_payable||0)>0?'var(--coral)':'var(--sage)'],
    ['🎁','Commission Payable', fmtT(PARTS.totals.agent_commission_payable||0), (PARTS.totals.agent_commission_payable||0)>0?'var(--coral)':'var(--sage)'],
    ['↩️','Returns Value', fmtT(PARTS.totals.returns_value||0), 'var(--coral)'],
  ];
  const kwrap = document.getElementById('partsKpis');
  kwrap.innerHTML = kpis.map(([icon,label,val,color])=>`
    <div class="parts-kpi-card" style="--kpi-color:${color}">
      <div class="parts-kpi-icon">${icon}</div>
      <div class="parts-kpi-label">${label}</div>
      <div class="parts-kpi-val" style="color:${color}">${val}</div>
    </div>`).join('');

  // top products by profit within range
  const byProd = {};
  filteredSales.forEach(sale=>sale.items.forEach(it=>{
    const b = byProd[it.product_id] || (byProd[it.product_id]={qty:0,revenue:0,cogs:0,profit:0});
    b.qty += it.qty; b.revenue += it.revenue; b.cogs += it.cogs; b.profit += it.profit;
  }));
  const topRows = Object.entries(byProd).sort((a,b)=>b[1].profit-a[1].profit).slice(0,10);
  const topBody = document.querySelector('#partsTopProductsTable tbody');
  topBody.innerHTML = topRows.length ? topRows.map(([pid,v])=>`
    <tr><td>${escHtml(productLabel(productById(pid)))}</td><td>${fmtNum(v.qty)}</td>
      <td>${fmtT(v.revenue)}</td><td>${fmtT(v.cogs)}</td>
      <td style="color:${v.profit>=0?'var(--sage)':'var(--coral)'};font-weight:700;">${fmtT(v.profit)}</td></tr>`).join('')
    : `<tr><td colspan="5" class="parts-table-empty">No sales in this range yet.</td></tr>`;

  // low stock (current, not range-filtered)
  const lowBody = document.querySelector('#partsLowStockTable tbody');
  lowBody.innerHTML = PARTS.low_stock.length ? PARTS.low_stock.map(pid=>`
    <tr><td>${escHtml(productLabel(productById(pid)))}</td>
      <td><span class="part-badge low-stock-badge">${PARTS.stock[pid]||0}</span></td>
      <td>${fmtT(PARTS.avg_cost[pid]||0)}</td></tr>`).join('')
    : `<tr><td colspan="3" class="parts-table-empty">Nothing low on stock right now.</td></tr>`;

  // spend by store within range
  const byStore = {};
  filteredPurchases.forEach(pur=>{
    const b = byStore[pur.store_id] || (byStore[pur.store_id]={count:0,spend:0});
    b.count += 1; b.spend += pur.items.reduce((a,it)=>a+it.qty*it.unit_price,0);
  });
  const storeRows = Object.entries(byStore).sort((a,b)=>b[1].spend-a[1].spend);
  const storeBody = document.querySelector('#partsStoreTable tbody');
  storeBody.innerHTML = storeRows.length ? storeRows.map(([sid,v])=>`
    <tr><td>${escHtml(storeById(sid) ? storeById(sid).name : '(deleted store)')}</td><td>${v.count}</td><td>${fmtT(v.spend)}</td></tr>`).join('')
    : `<tr><td colspan="3" class="parts-table-empty">No purchases in this range yet.</td></tr>`;

  renderPartsCharts(filteredSales, filteredPurchases, storeRows, byProd);

  // ── Margin / markup — every product with a sale price set, so profitability
  // per part is visible even outside a specific sales range ──
  const marginRows = PARTS.products
    .filter(p=>p.sale_price!=null && p.sale_price!=='')
    .map(p=>{
      const cost = PARTS.avg_cost[p.id]||0;
      const sp = Number(p.sale_price);
      const margin_pct = sp>0 ? (sp-cost)/sp*100 : 0;
      const markup_pct = cost>0 ? (sp-cost)/cost*100 : (sp>0 ? 100 : 0);
      return {p, cost, sp, margin_pct, markup_pct, stock: PARTS.stock[p.id]||0};
    })
    .sort((a,b)=>b.margin_pct-a.margin_pct);
  const marginBody = document.querySelector('#partsMarginTable tbody');
  if(marginBody) marginBody.innerHTML = marginRows.length ? marginRows.map(r=>`
    <tr><td>${escHtml(productLabel(r.p))}</td><td>${fmtNum(r.stock)}</td><td>${fmtT(r.cost)}</td><td>${fmtT(r.sp)}</td>
      <td style="color:${r.margin_pct>=0?'var(--sage)':'var(--coral)'};font-weight:700;">${r.margin_pct.toFixed(1)}%</td>
      <td>${r.markup_pct.toFixed(1)}%</td></tr>`).join('')
    : `<tr><td colspan="6" class="parts-table-empty">Set a sale price on your products to see margin/markup here.</td></tr>`;

  // ── Supplier price comparison — for every item with ≥1 price-list entry,
  // the cheapest vs priciest quote across suppliers, and the spread ──
  const cmpGroups = {};
  PARTS.price_entries.forEach(e=>{
    const refId = e.ref_type==='generic' ? e.generic_id : e.product_id;
    if(!refId) return;
    const key = refKey(e.ref_type, refId);
    const g = cmpGroups[key] || (cmpGroups[key]={ref_type:e.ref_type, ref_id:refId, byStore:{}});
    const cur = g.byStore[e.store_id];
    if(!cur || (e.date||'') > (cur.date||'')) g.byStore[e.store_id] = e;
  });
  const cmpRows = Object.values(cmpGroups).map(g=>{
    const offers = Object.entries(g.byStore).map(([sid,e])=>({sid, price:e.price}));
    if(!offers.length) return null;
    offers.sort((a,b)=>a.price-b.price);
    const cheapest = offers[0], priciest = offers[offers.length-1];
    const spread = cheapest.price>0 ? ((priciest.price-cheapest.price)/cheapest.price*100) : 0;
    return {label: refLabel(g.ref_type, g.ref_id), count: offers.length,
      cheapestStore: storeById(cheapest.sid), cheapestPrice: cheapest.price,
      priciestStore: storeById(priciest.sid), priciestPrice: priciest.price, spread};
  }).filter(Boolean).sort((a,b)=>b.spread-a.spread);
  const cmpBody = document.querySelector('#partsSupplierCompareTable tbody');
  if(cmpBody) cmpBody.innerHTML = cmpRows.length ? cmpRows.map(r=>`
    <tr><td>${escHtml(r.label)}</td><td>${r.count}</td>
      <td style="color:var(--sage);font-weight:700;">${escHtml(r.cheapestStore?r.cheapestStore.name:'(deleted)')} — ${fmtT(r.cheapestPrice)}</td>
      <td>${r.count>1 ? `${escHtml(r.priciestStore?r.priciestStore.name:'(deleted)')} — ${fmtT(r.priciestPrice)}` : '—'}</td>
      <td>${r.count>1 ? r.spread.toFixed(0)+'%' : '—'}</td></tr>`).join('')
    : `<tr><td colspan="5" class="parts-table-empty">Add supplier price-list entries to compare prices here.</td></tr>`;

  // ── Which supplier is cheapest most often — a quick "who to favor" ranking ──
  const cheapCount = {};
  cmpRows.forEach(r=>{ if(r.cheapestStore){ cheapCount[r.cheapestStore.id] = (cheapCount[r.cheapestStore.id]||0)+1; } });
  const cheapRows = Object.entries(cheapCount).sort((a,b)=>b[1]-a[1]);
  const cheapBody = document.querySelector('#partsCheapestSupplierTable tbody');
  if(cheapBody) cheapBody.innerHTML = cheapRows.length ? cheapRows.map(([sid,n])=>`
    <tr><td>${escHtml(storeById(sid)?storeById(sid).name:'(deleted)')}</td><td>${n} item${n===1?'':'s'}</td></tr>`).join('')
    : `<tr><td colspan="2" class="parts-table-empty">No comparisons yet.</td></tr>`;

  // ── Reorder suggestions — every low-stock product, matched to its cheapest
  // known current supplier price (straight from the price list) ──
  const reorderBody = document.querySelector('#partsReorderTable tbody');
  if(reorderBody){
    const rows = PARTS.low_stock.map(pid=>{
      const key = refKey('product', pid);
      const g = cmpGroups[key];
      let best = null;
      if(g){ Object.entries(g.byStore).forEach(([sid,e])=>{ if(!best||e.price<best.price) best={sid,price:e.price}; }); }
      return {pid, best};
    });
    reorderBody.innerHTML = rows.length ? rows.map(r=>`
      <tr><td>${escHtml(productLabel(productById(r.pid)))}</td>
        <td><span class="part-badge low-stock-badge">${PARTS.stock[r.pid]||0}</span></td>
        <td>${r.best ? escHtml(storeById(r.best.sid)?storeById(r.best.sid).name:'(deleted)')+' — '+fmtT(r.best.price) : 'No price-list data yet'}</td></tr>`).join('')
      : `<tr><td colspan="3" class="parts-table-empty">Nothing low on stock right now.</td></tr>`;
  }

  // ── Non-moving inventory — stock sitting around that has never sold,
  // so you know what to discount, bundle, or stop reordering ──
  const soldProductIds = new Set();
  PARTS.sales.forEach(s=> s.items.forEach(it=> soldProductIds.add(it.product_id)));
  const nonMovingRows = PARTS.products
    .filter(p=> (PARTS.stock[p.id]||0) > 0 && !soldProductIds.has(p.id))
    .map(p=>({p, stock: PARTS.stock[p.id]||0, cost: PARTS.avg_cost[p.id]||0}))
    .map(r=>({...r, value: r.stock*r.cost}))
    .sort((a,b)=>b.value-a.value);
  const nonMovingBody = document.querySelector('#partsNonMovingTable tbody');
  if(nonMovingBody) nonMovingBody.innerHTML = nonMovingRows.length ? nonMovingRows.map(r=>`
    <tr><td>${escHtml(productLabel(r.p))}</td><td>${fmtNum(r.stock)}</td><td>${fmtT(r.cost)}</td><td>${fmtT(r.value)}</td></tr>`).join('')
    : `<tr><td colspan="4" class="parts-table-empty">همه‌ی موجودی‌ات حداقل یه بار فروش رفته 👍</td></tr>`;
  const nonMovingTotalEl = document.getElementById('partsNonMovingTotal');
  if(nonMovingTotalEl) nonMovingTotalEl.textContent = fmtT(nonMovingRows.reduce((s,r)=>s+r.value,0));

  // ── Accounts Receivable — who owes you money ──
  const arRows = Object.entries(PARTS.ar_by_customer||{}).sort((a,b)=>b[1].outstanding-a[1].outstanding);
  const arBody = document.querySelector('#partsARTable tbody');
  if(arBody) arBody.innerHTML = arRows.length ? arRows.map(([cust,v])=>`
    <tr><td>${escHtml(cust)}</td><td>${v.count}</td><td style="color:var(--coral);font-weight:700;">${fmtT(v.outstanding)}</td></tr>`).join('')
    : `<tr><td colspan="3" class="parts-table-empty">همه‌ی فروش‌ها تسویه‌ان — طلبی از کسی نداری 👍</td></tr>`;

  // ── Accounts Payable — who you owe money to ──
  const apRows = Object.entries(PARTS.ap_by_store||{}).sort((a,b)=>b[1].outstanding-a[1].outstanding);
  const apBody = document.querySelector('#partsAPTable tbody');
  if(apBody) apBody.innerHTML = apRows.length ? apRows.map(([sid,v])=>`
    <tr><td>${escHtml(storeById(sid)?storeById(sid).name:'(deleted store)')}</td><td>${v.count}</td><td style="color:var(--coral);font-weight:700;">${fmtT(v.outstanding)}</td></tr>`).join('')
    : `<tr><td colspan="3" class="parts-table-empty">همه‌ی خریدها تسویه‌ان — به کسی بدهکار نیستی 👍</td></tr>`;

  // ── ABC Analysis — classic inventory-management technique: rank products
  // by revenue contribution. "A" items (~80% of revenue) deserve the most
  // attention; "C" items are the long tail ──
  const totalRevenueForAbc = Object.values(PARTS.by_product||{}).reduce((s,v)=>s+(v.revenue||0),0);
  const abcRows = Object.entries(PARTS.by_product||{})
    .filter(([,v])=>v.revenue>0)
    .map(([pid,v])=>({pid, revenue:v.revenue}))
    .sort((a,b)=>b.revenue-a.revenue);
  let running = 0;
  const abcBody = document.querySelector('#partsABCTable tbody');
  if(abcBody) abcBody.innerHTML = abcRows.length ? abcRows.map(r=>{
    running += r.revenue;
    const cumPct = totalRevenueForAbc>0 ? running/totalRevenueForAbc*100 : 0;
    const cls = cumPct<=80 ? 'A' : (cumPct<=95 ? 'B' : 'C');
    const clsColor = cls==='A' ? 'var(--sage)' : (cls==='B' ? 'var(--amber)' : 'var(--text4)');
    return `<tr><td>${escHtml(productLabel(productById(r.pid)))}</td><td>${fmtT(r.revenue)}</td>
      <td>${cumPct.toFixed(1)}%</td><td><span class="part-badge" style="background:${clsColor};color:#fff;font-weight:800;">${cls}</span></td></tr>`;
  }).join('') : `<tr><td colspan="4" class="parts-table-empty">هنوز فروشی ثبت نشده.</td></tr>`;

  // ── Top Customers ──
  const custRevenue = {};
  PARTS.sales.forEach(s=>{
    const cust = s.customer_name || 'بدون نام';
    const b = custRevenue[cust] || (custRevenue[cust]={revenue:0, profit:0, orders:0});
    b.revenue += s.revenue||0; b.profit += s.profit||0; b.orders += 1;
  });
  const custRows = Object.entries(custRevenue).sort((a,b)=>b[1].revenue-a[1].revenue).slice(0,15);
  const custBody = document.querySelector('#partsTopCustomersTable tbody');
  if(custBody) custBody.innerHTML = custRows.length ? custRows.map(([cust,v])=>`
    <tr><td>${escHtml(cust)}</td><td>${v.orders}</td><td>${fmtT(v.revenue)}</td><td>${fmtT(v.profit)}</td></tr>`).join('')
    : `<tr><td colspan="4" class="parts-table-empty">هنوز فروشی ثبت نشده.</td></tr>`;

  // ── Sales by Agent — who brings in the sales, and what commission they've
  // earned (backend-computed: honors each agent's revenue/profit basis and
  // nets out payouts already made) ──
  const agentRows = PARTS.sales_agents.map(a=>({a, summ: PARTS.agent_summary[a.id] || {orders:0,revenue:0,profit:0,accrued:0,paid:0,payable:0}}))
    .filter(r=>r.summ.orders>0 || r.a.commission_percent!=null)
    .sort((x,y)=>y.summ.revenue-x.summ.revenue);
  const agentBody = document.querySelector('#partsAgentTable tbody');
  if(agentBody) agentBody.innerHTML = agentRows.length ? agentRows.map(r=>`
    <tr><td>${escHtml(r.a.name)}</td><td>${r.summ.orders}</td><td>${fmtT(r.summ.revenue)}</td><td>${fmtT(r.summ.profit)}</td>
      <td>${r.a.commission_percent!=null ? r.a.commission_percent+'% ('+(r.a.commission_basis==='profit'?'از سود':'از فروش')+')' : '—'}</td>
      <td style="font-weight:700;color:var(--coral);">${fmtT(r.summ.accrued)}</td>
      <td>${fmtT(r.summ.paid)}</td>
      <td style="font-weight:700;color:${r.summ.payable>0.01?'var(--coral)':'var(--sage)'};">${fmtT(r.summ.payable)}</td></tr>`).join('')
    : `<tr><td colspan="7" class="parts-table-empty">هنوز فروشی به نماینده‌ای وصل نشده.</td></tr>`;

  // ── Returns summary ──
  const retTotalEl = document.getElementById('partsReturnsTotal');
  if(retTotalEl) retTotalEl.textContent = `${PARTS.totals.returns_count||0} مرجوعی · ${fmtT(PARTS.totals.returns_value||0)}`;

  // ── Business expenses by category ──
  const expCatRows = Object.entries(PARTS.expenses_by_category||{}).sort((a,b)=>b[1].amount-a[1].amount);
  const expCatBody = document.querySelector('#partsExpenseCategoryTable tbody');
  if(expCatBody) expCatBody.innerHTML = expCatRows.length ? expCatRows.map(([cat,v])=>`
    <tr><td>${escHtml(cat)}</td><td>${v.count}</td><td>${fmtT(v.amount)}</td></tr>`).join('')
    : `<tr><td colspan="3" class="parts-table-empty">No business expenses recorded yet.</td></tr>`;
  const expChartCanvas = document.getElementById('partsExpenseCategoryChart');
  if(expChartCanvas){
    const palette2 = ['#e85d3a','#3a7a5a','#2a6a9a','#d4821a','#7a3a6a','#c44a6a','#5a9a7a','#f07a5c'];
    if(expenseCategoryChartInstance) expenseCategoryChartInstance.destroy();
    expenseCategoryChartInstance = new Chart(expChartCanvas, {
      type:'doughnut',
      data:{ labels: expCatRows.map(([c])=>c),
        datasets:[{ data: expCatRows.map(([,v])=>v.amount), backgroundColor: expCatRows.map((_,i)=>palette2[i%palette2.length]) }]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:11}}}}}
    });
  }

  // ── Margin distribution chart — top 10 products by margin% ──
  const marginChartCanvas = document.getElementById('partsMarginChart');
  if(marginChartCanvas){
    const topMargin = marginRows.slice(0,10);
    if(partsMarginChartInstance) partsMarginChartInstance.destroy();
    partsMarginChartInstance = new Chart(marginChartCanvas, {
      type:'bar',
      data:{ labels: topMargin.map(r=>productLabel(r.p)),
        datasets:[{ label:'Margin %', data: topMargin.map(r=>r.margin_pct.toFixed(1)), backgroundColor:'#7a3a6a' }]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
        scales:{x:{ticks:{font:{size:10}}},y:{ticks:{font:{size:10}}}}}
    });
  }
}
async function saveLowStockThreshold(){
  const v = parseFloat(document.getElementById('lowStockThresholdInput').value);
  await postParts('set_low_stock_threshold',{value: isNaN(v)?2:v});
}

function renderPartsCharts(filteredSales, filteredPurchases, storeRows, byProd){
  const palette = ['#e85d3a','#3a7a5a','#2a6a9a','#d4821a','#7a3a6a','#c44a6a','#5a9a7a','#f07a5c'];

  // Revenue / purchase spend / profit by Jalali month — the full money-in vs
  // money-out picture, not just sales, so losses show up as clearly as gains.
  const byMonth = {};
  filteredSales.forEach(sale=>{
    const j = gregToJalali(sale.date);
    if(!j) return;
    const key = j.y+'/'+String(j.m).padStart(2,'0');
    const b = byMonth[key] || (byMonth[key]={label:j.month_name+' '+j.y, revenue:0, profit:0, spend:0, units:0});
    b.revenue += sale.revenue; b.profit += sale.profit;
    b.units += sale.items.reduce((s,it)=>s+it.qty, 0);
  });
  filteredPurchases.forEach(pur=>{
    const j = gregToJalali(pur.order_date);
    if(!j) return;
    const key = j.y+'/'+String(j.m).padStart(2,'0');
    const b = byMonth[key] || (byMonth[key]={label:j.month_name ? j.month_name+' '+j.y : key, revenue:0, profit:0, spend:0, units:0});
    b.spend += pur.items.reduce((a,it)=>a+it.qty*it.unit_price,0);
  });
  const monthKeys = Object.keys(byMonth).sort();
  const revCtx = document.getElementById('partsRevenueChart');
  if(partsRevenueChartInstance) partsRevenueChartInstance.destroy();
  partsRevenueChartInstance = new Chart(revCtx, {
    type:'bar',
    data:{ labels: monthKeys.map(k=>byMonth[k].label),
      datasets:[
        {label:'Revenue', data: monthKeys.map(k=>byMonth[k].revenue), backgroundColor:'#2a6a9a'},
        {label:'Purchase Spend', data: monthKeys.map(k=>byMonth[k].spend), backgroundColor:'#d4821a'},
        {label:'Profit', data: monthKeys.map(k=>byMonth[k].profit), backgroundColor:'#3a7a5a'},
      ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:11}}}},
      scales:{y:{ticks:{font:{size:10}}},x:{ticks:{font:{size:10}}}}}
  });

  const storeCtx = document.getElementById('partsStoreChart');
  if(partsStoreChartInstance) partsStoreChartInstance.destroy();
  partsStoreChartInstance = new Chart(storeCtx, {
    type:'doughnut',
    data:{ labels: storeRows.map(([sid])=> storeById(sid)? storeById(sid).name : '(deleted store)'),
      datasets:[{ data: storeRows.map(([,v])=>v.spend), backgroundColor: storeRows.map((_,i)=>palette[i%palette.length]) }]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:11}}}}}
  });

  // Profit by brand — structured brand data, grouped from actual sale items.
  const byBrand = {};
  filteredSales.forEach(sale=>sale.items.forEach(it=>{
    const p = productById(it.product_id);
    const brand = (p && p.brand) ? p.brand : '(no brand)';
    const b = byBrand[brand] || (byBrand[brand]={qty:0,revenue:0,profit:0});
    b.qty += it.qty; b.revenue += it.revenue; b.profit += it.profit;
  }));
  const brandRows = Object.entries(byBrand).sort((a,b)=>b[1].profit-a[1].profit);
  const brandCtx = document.getElementById('partsBrandChart');
  if(partsBrandChartInstance) partsBrandChartInstance.destroy();
  partsBrandChartInstance = new Chart(brandCtx, {
    type:'bar',
    data:{ labels: brandRows.map(([name])=>name),
      datasets:[{ label:'Profit', data: brandRows.map(([,v])=>v.profit),
        backgroundColor: brandRows.map(([,v])=> v.profit>=0 ? '#3a7a5a' : '#c44a3a') }]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{x:{ticks:{font:{size:10}}},y:{ticks:{font:{size:11}}}}}
  });
  const brandBody = document.querySelector('#partsBrandTable tbody');
  brandBody.innerHTML = brandRows.length ? brandRows.map(([name,v])=>`
    <tr><td>${escHtml(name)}</td><td>${fmtNum(v.qty)}</td><td>${fmtT(v.revenue)}</td>
      <td style="color:${v.profit>=0?'var(--sage)':'var(--coral)'};font-weight:700;">${fmtT(v.profit)}</td></tr>`).join('')
    : `<tr><td colspan="4" class="parts-table-empty">No sales in this range yet.</td></tr>`;

  // Units sold by car model — a product can carry several car-model tags, so
  // each tag gets full credit for that line item (a part fitting 3 cars will
  // show up once under each of them).
  const byCarModel = {};
  filteredSales.forEach(sale=>sale.items.forEach(it=>{
    const p = productById(it.product_id);
    const models = p ? productCarModels(p) : [];
    const list = models.length ? models : ['(no car model)'];
    list.forEach(m=>{
      const b = byCarModel[m] || (byCarModel[m]={qty:0,revenue:0});
      b.qty += it.qty; b.revenue += it.revenue;
    });
  }));
  const cmRows = Object.entries(byCarModel).sort((a,b)=>b[1].qty-a[1].qty);
  const cmCtx = document.getElementById('partsCarModelChart');
  if(partsCarModelChartInstance) partsCarModelChartInstance.destroy();
  partsCarModelChartInstance = new Chart(cmCtx, {
    type:'doughnut',
    data:{ labels: cmRows.map(([name])=>name),
      datasets:[{ data: cmRows.map(([,v])=>v.qty), backgroundColor: cmRows.map((_,i)=>palette[i%palette.length]) }]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:11}}}}}
  });
  const cmBody = document.querySelector('#partsCarModelTable tbody');
  cmBody.innerHTML = cmRows.length ? cmRows.map(([name,v])=>`
    <tr><td>${escHtml(name)}</td><td>${fmtNum(v.qty)}</td><td>${fmtT(v.revenue)}</td></tr>`).join('')
    : `<tr><td colspan="3" class="parts-table-empty">No sales in this range yet.</td></tr>`;

  // Cumulative profit — a running total across the months in range, so the
  // overall growth trajectory of the business is visible at a glance.
  let running = 0;
  const cumulativeData = monthKeys.map(k=>{ running += byMonth[k].profit; return running; });
  const cumCtx = document.getElementById('partsCumulativeChart');
  if(partsCumulativeChartInstance) partsCumulativeChartInstance.destroy();
  partsCumulativeChartInstance = new Chart(cumCtx, {
    type:'line',
    data:{ labels: monthKeys.map(k=>byMonth[k].label),
      datasets:[{ label:'Cumulative Profit', data: cumulativeData, borderColor:'#3a7a5a',
        backgroundColor:'rgba(58,122,90,0.12)', fill:true, tension:0.3, pointRadius:3, pointBackgroundColor:'#3a7a5a' }]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{y:{ticks:{font:{size:10}}},x:{ticks:{font:{size:10}}}}}
  });

  // Units sold per month — sales volume as a distinct metric from revenue,
  // since a month can move a lot of cheap parts or a few expensive ones.
  const unitsCtx = document.getElementById('partsUnitsChart');
  if(partsUnitsChartInstance) partsUnitsChartInstance.destroy();
  partsUnitsChartInstance = new Chart(unitsCtx, {
    type:'bar',
    data:{ labels: monthKeys.map(k=>byMonth[k].label),
      datasets:[{ label:'Units Sold', data: monthKeys.map(k=>byMonth[k].units), backgroundColor:'#2a6a9a' }]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{y:{ticks:{font:{size:10}},beginAtZero:true},x:{ticks:{font:{size:10}}}}}
  });

  // Top 5 products by units sold — complements the "Top Products by Profit"
  // table with a volume-based view (highest movers aren't always the most profitable).
  const topUnitsRows = Object.entries(byProd||{}).sort((a,b)=>b[1].qty-a[1].qty).slice(0,5);
  const topUnitsCtx = document.getElementById('partsTopUnitsChart');
  if(partsTopUnitsChartInstance) partsTopUnitsChartInstance.destroy();
  partsTopUnitsChartInstance = new Chart(topUnitsCtx, {
    type:'bar',
    data:{ labels: topUnitsRows.map(([pid])=>productLabel(productById(pid))),
      datasets:[{ label:'Units Sold', data: topUnitsRows.map(([,v])=>v.qty),
        backgroundColor: topUnitsRows.map((_,i)=>palette[i%palette.length]) }]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{x:{ticks:{font:{size:10}},beginAtZero:true},y:{ticks:{font:{size:10}}}}}
  });
}

// ══════════════════════════════════════════════════════
//  GENERIC ITEMS  —  loose comparison labels ("رله کولر پراید")
//  that stand in for a product when you want to compare prices
//  across brands/suppliers without pinning to one exact part.
// ══════════════════════════════════════════════════════
function renderGenericGrid(){
  const grid = document.getElementById('partsGenericGrid');
  if(!grid) return;
  grid.innerHTML = '';
  if(!PARTS.generic_products.length){
    grid.innerHTML = '<div class="parts-empty"><div class="pe-icon">🏷️</div><div class="pe-text">No generic items yet — add one when you want to compare suppliers without pinning to one exact product (e.g. "رله کولر پراید").</div></div>';
    return;
  }
  PARTS.generic_products.forEach(g=>{
    const usedIn = PARTS.price_entries.filter(e=>e.ref_type==='generic' && e.generic_id===g.id).length;
    const el = document.createElement('div');
    el.className = 'store-card';
    el.innerHTML = `
      <div class="store-card-body">
        <div class="store-card-headrow">
          <div class="store-avatar" style="background:${hashColor(g.name)}">🏷️</div>
          <div class="store-card-name">${escHtml(g.name)}</div>
        </div>
        ${g.notes ? `<div class="store-card-row"><span class="lbl">📝</span>${escHtml(g.notes)}</div>` : ''}
        <div class="store-card-row"><span class="lbl">📋</span>${usedIn} price-list entr${usedIn===1?'y':'ies'}</div>
        <div class="store-card-actions">
          <button onclick="openGenericModal('${g.id}')">✎ Edit</button>
          <button class="del" onclick="deleteGenericEntry('${g.id}')">🗑 Delete</button>
        </div>
      </div>`;
    grid.appendChild(el);
  });
}
function openGenericModal(id, returnTo){
  genericModalReturnTo = returnTo || null;
  document.getElementById('genericModalId').value = id || '';
  document.getElementById('genericModalTitle').textContent = id ? 'Edit Generic Item' : 'Add Generic Item';
  if(id){
    const g = genericById(id);
    document.getElementById('gfName').value = g ? g.name||'' : '';
    document.getElementById('gfNotes').value = g ? g.notes||'' : '';
  } else {
    document.getElementById('gfName').value = '';
    document.getElementById('gfNotes').value = '';
  }
  document.getElementById('genericModalOverlay').classList.add('open');
}
function closeGenericModal(){
  document.getElementById('genericModalOverlay').classList.remove('open');
  genericModalReturnTo = null;
}
async function saveGenericModal(){
  const id = document.getElementById('genericModalId').value;
  const name = document.getElementById('gfName').value.trim();
  if(!name){ showToast('Give it a name','error'); return; }
  const payload = { name, notes: document.getElementById('gfNotes').value.trim() };
  const prevIds = new Set(PARTS.generic_products.map(g=>g.id));
  let res;
  if(id){ payload.id = id; res = await postParts('update_generic_product', payload); }
  else { res = await postParts('add_generic_product', payload); }
  if(!res || res.ok===false) return;
  showToast(id ? 'Generic item updated' : 'Generic item added','success');
  const returnTo = genericModalReturnTo;
  closeGenericModal();
  if(returnTo==='priceentry'){
    const newId = id || (PARTS.generic_products.find(g=>!prevIds.has(g.id))||{}).id;
    if(newId){
      renderItemSelectPair('peProductSelect','peGenericSelect');
      setItemPair('peProductSelect','peGenericSelect','generic', newId);
    }
  }
}
function deleteGenericEntry(id){
  if(!confirm('Delete this generic item? Its price-list entries will be removed too.')) return;
  postParts('delete_generic_product', {id});
  showToast('Generic item deleted','success');
}

// ══════════════════════════════════════════════════════
//  SUPPLIER PRICE LISTS  —  one price from one supplier, for
//  one item (real product or generic label), on one date.
// ══════════════════════════════════════════════════════
function productOptionsHtml(){
  return PARTS.products.length
    ? '<option value="">— انتخاب کن —</option>' + PARTS.products.map(p=>`<option value="${p.id}" data-img="${escHtml(p.image||'')}" data-icon="📦">${escHtml(productLabel(p))}</option>`).join('')
    : '<option value="">— هنوز محصولی تعریف نشده —</option>';
}
function genericOptionsHtml(){
  return PARTS.generic_products.length
    ? '<option value="">— انتخاب کن —</option>' + PARTS.generic_products.map(g=>`<option value="${g.id}">${escHtml(g.name)}</option>`).join('')
    : '<option value="">— هنوز کالای کلی‌ای نساختی —</option>';
}
// Every "pick an item" spot in Price Lists / Compare / Cart is actually a PAIR
// of selects — one for defined products, one for generic items — kept mutually
// exclusive in JS so only one of the two can hold a value at a time.
function renderItemSelectPair(prodId, genId){
  const psel = document.getElementById(prodId), gsel = document.getElementById(genId);
  if(psel){ const cur=psel.value; psel.innerHTML = productOptionsHtml(); if([...psel.options].some(o=>o.value===cur)) psel.value=cur; ssSync(prodId); }
  if(gsel){ const cur=gsel.value; gsel.innerHTML = genericOptionsHtml(); if([...gsel.options].some(o=>o.value===cur)) gsel.value=cur; ssSync(genId); }
}
function bindExclusivePair(prodId, genId){
  const psel = document.getElementById(prodId), gsel = document.getElementById(genId);
  if(!psel || !gsel || psel._exclusiveBound) return;
  psel._exclusiveBound = true;
  psel.addEventListener('change', ()=>{ if(psel.value){ gsel.value=''; ssSync(genId); } });
  gsel.addEventListener('change', ()=>{ if(gsel.value){ psel.value=''; ssSync(prodId); } });
}
function readItemPair(prodId, genId){
  const p = document.getElementById(prodId).value;
  if(p) return {ref_type:'product', ref_id:p};
  const g = document.getElementById(genId).value;
  if(g) return {ref_type:'generic', ref_id:g};
  return null;
}
function setItemPair(prodId, genId, refType, refId){
  document.getElementById(prodId).value = refType==='product' ? refId : '';
  document.getElementById(genId).value = refType==='generic' ? refId : '';
  ssSync(prodId); ssSync(genId);
}
function clearItemPair(prodId, genId){
  document.getElementById(prodId).value = '';
  document.getElementById(genId).value = '';
  ssSync(prodId); ssSync(genId);
}

function renderPriceEntryRefSelects(){
  renderItemSelectPair('peProductSelect','peGenericSelect');
  bindExclusivePair('peProductSelect','peGenericSelect');
  const storeSel = document.getElementById('peStoreSelect');
  if(storeSel){
    const cur = storeSel.value;
    storeSel.innerHTML = PARTS.stores.length
      ? PARTS.stores.map(s=>`<option value="${s.id}" data-img="${escHtml(s.image||'')}" data-icon="🏬">${escHtml(s.name)}</option>`).join('')
      : '<option value="">— add a store first —</option>';
    if(cur) storeSel.value = cur;
  }
  const filterSel = document.getElementById('pfPriceListFilterStore');
  if(filterSel){
    const cur = filterSel.value;
    filterSel.innerHTML = '<option value="">همه تامین‌کننده‌ها (All suppliers)</option>' +
      PARTS.stores.map(s=>`<option value="${s.id}" data-img="${escHtml(s.image||'')}" data-icon="🏬">${escHtml(s.name)}</option>`).join('');
    if(cur) filterSel.value = cur;
  }
}
function openNewGenericFromPriceEntry(){ openGenericModal(null, 'priceentry'); }
async function savePriceEntry(){
  const storeId = document.getElementById('peStoreSelect').value;
  const price = parseFloat(document.getElementById('pePrice').value);
  const dateVal = document.getElementById('peDateHidden').value;
  const item = readItemPair('peProductSelect','peGenericSelect');
  if(!storeId){ showToast('Pick a supplier','error'); return; }
  if(!item){ showToast('یه محصول یا کالای کلی انتخاب کن','error'); return; }
  if(!price || price<=0){ showToast('Enter a price','error'); return; }
  const payload = {
    store_id: storeId, ref_type: item.ref_type,
    product_id: item.ref_type==='product' ? item.ref_id : null,
    generic_id: item.ref_type==='generic' ? item.ref_id : null,
    price, date: dateVal, notes: document.getElementById('peNotes').value.trim(),
  };
  if(editingPriceEntryId){ payload.id = editingPriceEntryId; await postParts('update_price_entry', payload); }
  else { await postParts('add_price_entry', payload); }
  showToast(editingPriceEntryId ? 'Price entry updated' : 'Price entry added','success');
  cancelEditPriceEntry();
}
function editPriceEntry(id){
  const e = PARTS.price_entries.find(x=>x.id===id);
  if(!e) return;
  editingPriceEntryId = id;
  document.getElementById('peStoreSelect').value = e.store_id||'';
  setItemPair('peProductSelect','peGenericSelect', e.ref_type, e.ref_type==='product'?e.product_id:e.generic_id);
  document.getElementById('pePrice').value = e.price;
  renderJalaliPicker('peDatePicker','peDateHidden', e.date, ()=>{});
  document.getElementById('peNotes').value = e.notes||'';
  document.getElementById('peSaveBtn').textContent = 'Update Price Entry';
  document.getElementById('peCancelBtn').style.display = 'inline-block';
  document.getElementById('partsSub-pricelists').scrollIntoView({behavior:'smooth', block:'start'});
}
function cancelEditPriceEntry(){
  editingPriceEntryId = null;
  document.getElementById('peStoreSelect').value = '';
  clearItemPair('peProductSelect','peGenericSelect');
  document.getElementById('pePrice').value = '';
  renderJalaliPicker('peDatePicker','peDateHidden', null, ()=>{});
  document.getElementById('peNotes').value = '';
  document.getElementById('peSaveBtn').textContent = 'Add Price Entry';
  document.getElementById('peCancelBtn').style.display = 'none';
}
function deletePriceEntry(id){
  if(!confirm('Delete this price-list entry?')) return;
  postParts('delete_price_entry', {id});
  showToast('Price entry deleted','success');
  if(editingPriceEntryId===id) cancelEditPriceEntry();
}
function renderPriceList(){
  const wrap = document.getElementById('priceListContent');
  if(!wrap) return;
  const filterStore = document.getElementById('pfPriceListFilterStore') ? document.getElementById('pfPriceListFilterStore').value : '';
  let entries = [...PARTS.price_entries].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  if(filterStore) entries = entries.filter(e=>e.store_id===filterStore);
  renderStoreTrend(filterStore);
  if(!entries.length){
    wrap.innerHTML = '<div class="parts-empty"><div class="pe-icon">📋</div><div class="pe-text">هنوز هیچ قیمتی ثبت نکردی — قیمتی که یه تامین‌کننده بهت گفته رو با تاریخش این‌جا ثبت کن.</div></div>';
    return;
  }
  const groups = {};
  entries.forEach(e=>{
    const sid = e.store_id;
    (groups[sid] = groups[sid] || []).push(e);
  });
  wrap.innerHTML = Object.entries(groups).map(([sid, list])=>`
    <div class="parts-table-wrap">
      <div class="parts-table-title">🏬 ${escHtml(storeById(sid) ? storeById(sid).name : '(deleted store)')}</div>
      <table class="parts-table"><thead><tr><th>Item</th><th>Price</th><th>Date</th><th>Notes</th><th></th></tr></thead>
      <tbody>
        ${list.map(e=>`<tr>
          <td>${escHtml(refLabel(e.ref_type, e.ref_type==='generic'?e.generic_id:e.product_id))}</td>
          <td>${fmtT(e.price)}</td>
          <td>${jalaliFullLabel(e.date)}</td>
          <td>${escHtml(e.notes||'')}</td>
          <td style="white-space:nowrap;">
            <button class="icon-btn-sm" onclick="editPriceEntry('${e.id}')">✎</button>
            <button class="icon-btn-sm del" onclick="deletePriceEntry('${e.id}')">🗑</button>
          </td>
        </tr>`).join('')}
      </tbody></table>
    </div>`).join('');
}

// ── SUPPLIER PRICE TREND — pick a supplier in the filter above and see
// whether their prices, on average, have been climbing or dropping ──
function renderStoreTrend(storeId){
  const panel = document.getElementById('storeTrendPanel');
  if(!panel) return;
  if(!storeId){ panel.innerHTML = ''; return; }
  const entries = PARTS.price_entries.filter(e=>e.store_id===storeId);
  const groups = {};
  entries.forEach(e=>{
    const refId = e.ref_type==='generic' ? e.generic_id : e.product_id;
    const key = refKey(e.ref_type, refId);
    (groups[key] = groups[key] || {ref_type:e.ref_type, ref_id:refId, list:[]}).list.push(e);
  });
  const rows = []; let sumChange = 0, countChange = 0;
  Object.values(groups).forEach(g=>{
    const sorted = g.list.slice().sort((a,b)=>(a.date||'').localeCompare(b.date||''));
    const first = sorted[0], last = sorted[sorted.length-1];
    let change = null;
    if(sorted.length>=2 && first.price>0){
      change = (last.price-first.price)/first.price*100;
      sumChange += change; countChange++;
    }
    rows.push({label: refLabel(g.ref_type, g.ref_id), first, last, change, n: sorted.length});
  });
  if(!rows.length){ panel.innerHTML = ''; return; }
  const storeName = escHtml(storeById(storeId) ? storeById(storeId).name : '');
  const avgChange = countChange ? sumChange/countChange : null;
  const trendColor = avgChange==null ? 'var(--text3)' : (avgChange>0 ? 'var(--coral)' : (avgChange<0 ? 'var(--sage)' : 'var(--text3)'));
  const trendArrow = avgChange==null ? '—' : (avgChange>0 ? '🔺' : (avgChange<0 ? '🔻' : '➖'));
  panel.innerHTML = `
    <div class="parts-table-wrap" style="margin-bottom:16px;">
      <div class="parts-table-title">📈 روند قیمت ${storeName}
        ${avgChange!=null ? `<span style="float:left;font-weight:800;color:${trendColor};">${trendArrow} میانگین تغییر: ${avgChange>0?'+':''}${avgChange.toFixed(1)}%</span>` : ''}
      </div>
      <table class="parts-table"><thead><tr><th>کالا</th><th>اولین قیمت ثبت‌شده</th><th>آخرین قیمت</th><th>تغییر</th></tr></thead>
      <tbody>${rows.map(r=>`<tr>
        <td>${escHtml(r.label)}</td>
        <td>${fmtT(r.first.price)} <span style="color:var(--text4);font-size:11px;">(${jalaliFullLabel(r.first.date)})</span></td>
        <td>${fmtT(r.last.price)} <span style="color:var(--text4);font-size:11px;">(${jalaliFullLabel(r.last.date)})</span></td>
        <td style="font-weight:700;color:${r.change==null?'var(--text4)':(r.change>0?'var(--coral)':(r.change<0?'var(--sage)':'var(--text3)'))};">
          ${r.change==null ? 'فقط ۱ قیمت' : (r.change>0?'🔺 +':(r.change<0?'🔻 ':'➖ '))+(r.change==null?'':r.change.toFixed(1)+'%')}
        </td></tr>`).join('')}
      </tbody></table>
    </div>
    <div class="mchart-wrap" style="height:200px;margin-bottom:20px;"><canvas id="storeTrendChart"></canvas></div>`;

  const multiRow = rows.filter(r=>r.n>=2);
  const chartEl = document.getElementById('storeTrendChart');
  if(chartEl && multiRow.length){
    const palette = ['#e85d3a','#3a7a5a','#2a6a9a','#d4821a','#7a3a6a','#c44a6a'];
    const allDates = [...new Set(entries.map(e=>e.date))].sort();
    const datasets = Object.values(groups).filter(g=>g.list.length>=2).map((g,i)=>{
      const sorted = g.list.slice().sort((a,b)=>(a.date||'').localeCompare(b.date||''));
      const base = sorted[0].price || 1;
      return {
        label: refLabel(g.ref_type, g.ref_id),
        data: allDates.map(d=>{ const e = sorted.find(x=>x.date===d); return e ? Math.round(e.price/base*100) : null; }),
        borderColor: palette[i%palette.length], backgroundColor: palette[i%palette.length]+'22',
        spanGaps: true, tension:0.25, pointRadius:3,
      };
    });
    if(partsStoreTrendChartInstance) partsStoreTrendChartInstance.destroy();
    partsStoreTrendChartInstance = new Chart(chartEl, {
      type:'line',
      data:{ labels: allDates.map(d=>jalaliFullLabel(d)), datasets },
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:11}}},
          tooltip:{callbacks:{label:(ctx)=>`${ctx.dataset.label}: ${ctx.parsed.y}% of first price`}}},
        scales:{y:{ticks:{font:{size:10}},title:{display:true,text:'Index (first price = 100)',font:{size:10}}},x:{ticks:{font:{size:10}}}}}
    });
  } else if(chartEl){
    chartEl.style.display = 'none';
  }
}

// ══════════════════════════════════════════════════════
//  PRICE COMPARISON + SHOPPING-CART OPTIMIZER
//  Same spirit as the Torob Shopper set-cover solver: for a
//  small number of candidate suppliers, brute-force which
//  subset to actually buy from ("open") beats a pure per-item
//  cheapest pick once shipping fees are counted. Falls back to
//  a greedy pick when there are too many suppliers to enumerate.
// ══════════════════════════════════════════════════════
function renderComparePickers(){
  renderItemSelectPair('cpProductSelect','cpGenericSelect');
  bindExclusivePair('cpProductSelect','cpGenericSelect');
  renderItemSelectPair('cartProductSelect','cartGenericSelect');
  bindExclusivePair('cartProductSelect','cartGenericSelect');
}
function runPriceComparison(){
  const item = readItemPair('cpProductSelect','cpGenericSelect');
  const out = document.getElementById('compareResult');
  const chartEl = document.getElementById('comparePriceChart');
  if(!item){ out.innerHTML = ''; if(chartEl) chartEl.style.display='none'; return; }
  const entries = PARTS.price_entries.filter(e=>e.ref_type===item.ref_type &&
    (item.ref_type==='product' ? e.product_id===item.ref_id : e.generic_id===item.ref_id));
  if(!entries.length){
    out.innerHTML = '<div class="parts-empty"><div class="pe-icon">⚖️</div><div class="pe-text">هنوز هیچ قیمتی برای این کالا ثبت نشده — اول یه چند تا قیمت توی «لیست قیمت» اضافه کن.</div></div>';
    if(chartEl) chartEl.style.display='none';
    return;
  }
  const byStore = {};
  entries.forEach(e=>{ const cur=byStore[e.store_id]; if(!cur || (e.date||'')>(cur.date||'')) byStore[e.store_id]=e; });
  const rows = Object.entries(byStore).map(([sid,e])=>({sid, e})).sort((a,b)=>a.e.price-b.e.price);
  const cheapest = rows[0];
  out.innerHTML = `<table class="parts-table"><thead><tr><th>تامین‌کننده</th><th>آخرین قیمت</th><th>تاریخ</th></tr></thead><tbody>
    ${rows.map(r=>`<tr class="${r.sid===cheapest.sid?'cheapest-row':''}">
      <td>${r.sid===cheapest.sid?'🏆 ':''}${escHtml(storeById(r.sid)?storeById(r.sid).name:'(deleted)')}</td>
      <td>${fmtT(r.e.price)}</td><td>${jalaliFullLabel(r.e.date)}</td></tr>`).join('')}
    </tbody></table>`;

  if(chartEl){
    if(rows.length>1){
      chartEl.style.display = 'block';
      const palette = ['#e85d3a','#3a7a5a','#2a6a9a','#d4821a','#7a3a6a','#c44a6a'];
      const storeIds = [...new Set(entries.map(e=>e.store_id))];
      const allDates = [...new Set(entries.map(e=>e.date))].sort();
      const datasets = storeIds.map((sid,i)=>({
        label: storeById(sid)?storeById(sid).name:'(deleted)',
        data: allDates.map(d=>{ const e = entries.find(x=>x.store_id===sid && x.date===d); return e ? e.price : null; }),
        borderColor: palette[i%palette.length], backgroundColor: palette[i%palette.length]+'22',
        spanGaps: true, tension:0.25, pointRadius:3,
      }));
      if(compareChartInstance) compareChartInstance.destroy();
      compareChartInstance = new Chart(chartEl, {
        type:'line',
        data:{ labels: allDates.map(d=>jalaliFullLabel(d)), datasets },
        options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:11}}}},
          scales:{y:{ticks:{font:{size:10}}},x:{ticks:{font:{size:10}}}}}
      });
    } else {
      chartEl.style.display = 'none';
    }
  }
}

function addCompareCartItem(){
  const item = readItemPair('cartProductSelect','cartGenericSelect');
  const qty = parseFloat(document.getElementById('cpCartQty').value) || 1;
  if(!item){ showToast('یه کالا انتخاب کن','error'); return; }
  const existing = compareCartItems.find(it=>it.ref_type===item.ref_type && it.ref_id===item.ref_id);
  if(existing) existing.qty += qty;
  else compareCartItems.push({ref_type:item.ref_type, ref_id:item.ref_id, qty});
  renderCompareCart();
  showToast('به سبد اضافه شد','success');
}
function removeCompareCartItem(idx){ compareCartItems.splice(idx,1); renderCompareCart(); }
function renderCompareCart(){
  const c = document.getElementById('compareCart');
  if(!c) return;
  c.innerHTML = '';
  if(!compareCartItems.length){
    c.innerHTML = '<div class="tx-cart-empty">Cart is empty — add the items you need to buy.</div>';
  } else {
    compareCartItems.forEach((it,idx)=>{
      const el = document.createElement('div');
      el.className = 'tx-cart-item';
      el.innerHTML = `<div class="tx-cart-item-info">
          <div class="tx-cart-item-name">${escHtml(refLabel(it.ref_type, it.ref_id))}</div>
          <div class="tx-cart-item-detail">qty ${it.qty}</div>
        </div>
        <button class="tx-cart-del" onclick="removeCompareCartItem(${idx})">✕</button>`;
      c.appendChild(el);
    });
  }
  document.getElementById('cartOptimizeResult').innerHTML = '';
}
function optimizeCompareCart(){
  const resultEl = document.getElementById('cartOptimizeResult');
  if(!compareCartItems.length){ showToast('Add at least one item to the cart','error'); return; }

  const itemStores = compareCartItems.map(it=>{
    const entries = PARTS.price_entries.filter(e=>e.ref_type===it.ref_type &&
      (it.ref_type==='product' ? e.product_id===it.ref_id : e.generic_id===it.ref_id));
    const byStore = {};
    entries.forEach(e=>{ const cur=byStore[e.store_id]; if(!cur || (e.date||'')>(cur.date||'')) byStore[e.store_id]=e; });
    return {...it, offers: byStore};
  });
  const missing = itemStores.filter(it=>!Object.keys(it.offers).length);
  const allStoreIds = [...new Set(itemStores.flatMap(it=>Object.keys(it.offers)))];
  if(!allStoreIds.length){
    resultEl.innerHTML = '<div class="parts-empty"><div class="pe-icon">🛒</div><div class="pe-text">None of these items have price-list entries yet.</div></div>';
    return;
  }

  function planForOpenSet(openSet){
    let total = 0; const byStore = {}; let feasible = true;
    itemStores.forEach(it=>{
      let best=null;
      openSet.forEach(sid=>{ const e=it.offers[sid]; if(e && (!best || e.price<best.price)) best={sid,price:e.price}; });
      if(!best){ feasible=false; return; }
      const line = best.price*it.qty;
      total += line;
      const b = byStore[best.sid] || (byStore[best.sid]={spend:0, items:[]});
      b.spend += line; b.items.push({...it, price:best.price, line});
    });
    if(!feasible) return null;
    Object.entries(byStore).forEach(([sid,b])=>{
      const store = storeById(sid);
      const ship = store ? (Number(store.shipping_cost)||0) : 0;
      const freeMin = store ? (Number(store.free_shipping_min)||0) : 0;
      b.shipping = (ship>0 && (!freeMin || b.spend<freeMin)) ? ship : 0;
      total += b.shipping;
    });
    return {total, byStore};
  }

  let best = null;
  if(allStoreIds.length <= 14){
    const n = allStoreIds.length;
    for(let mask=1; mask<(1<<n); mask++){
      const openSet = allStoreIds.filter((_,i)=>mask&(1<<i));
      const plan = planForOpenSet(openSet);
      if(plan && (!best || plan.total<best.total)) best = plan;
    }
  } else {
    // Too many suppliers to brute-force — greedy: open every store that's
    // cheapest for at least one item (mirrors the Torob Shopper fallback).
    const openSet = new Set();
    itemStores.forEach(it=>{
      let cheapest=null;
      Object.entries(it.offers).forEach(([sid,e])=>{ if(!cheapest||e.price<cheapest.price) cheapest={sid,price:e.price}; });
      if(cheapest) openSet.add(cheapest.sid);
    });
    best = planForOpenSet([...openSet]);
  }

  if(!best){
    resultEl.innerHTML = '<div class="parts-empty"><div class="pe-icon">🛒</div><div class="pe-text">Some items have no price-list data — add a quote for each before optimizing.</div></div>';
    return;
  }
  // naive baseline: cheapest supplier per item, ignoring shipping consolidation
  const naiveTotal = itemStores.reduce((sum,it)=>{
    let cheapest=null;
    Object.entries(it.offers).forEach(([sid,e])=>{ if(!cheapest||e.price<cheapest.price) cheapest={sid,price:e.price}; });
    return sum + (cheapest ? cheapest.price*it.qty : 0);
  }, 0);
  const savings = naiveTotal - best.total;

  const storeCards = Object.entries(best.byStore).map(([sid,b])=>`
    <div class="parts-table-wrap">
      <div class="parts-table-title">🏬 ${escHtml(storeById(sid)?storeById(sid).name:'(deleted)')}
        ${b.shipping>0 ? `<span style="float:left;font-weight:600;color:var(--coral);">+ shipping ${fmtT(b.shipping)}</span>` : `<span style="float:left;font-weight:600;color:var(--sage);">🚚 free shipping</span>`}</div>
      <table class="parts-table"><thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Line</th></tr></thead>
      <tbody>${b.items.map(it=>`<tr><td>${escHtml(refLabel(it.ref_type,it.ref_id))}</td><td>${it.qty}</td><td>${fmtT(it.price)}</td><td>${fmtT(it.line)}</td></tr>`).join('')}</tbody></table>
    </div>`).join('');

  resultEl.innerHTML = `
    ${missing.length ? `<div class="parts-empty" style="margin-bottom:10px;"><div class="pe-text">⚠️ No price data for: ${missing.map(it=>escHtml(refLabel(it.ref_type,it.ref_id))).join('، ')} — left out of this plan.</div></div>` : ''}
    ${storeCards}
    <div class="parts-kpi-card" style="--kpi-color:var(--sage);margin-top:10px;">
      <div class="parts-kpi-label">Suggested Plan Total (with shipping)</div>
      <div class="parts-kpi-val" style="color:var(--sage);">${fmtT(best.total)}</div>
    </div>
    ${savings>0 ? `<div class="parts-kpi-card" style="--kpi-color:var(--plum);margin-top:6px;">
      <div class="parts-kpi-label">Saved vs. buying each item from its own cheapest supplier separately</div>
      <div class="parts-kpi-val" style="color:var(--plum);">${fmtT(savings)}</div>
    </div>` : ''}`;
}

// ══════════════════════════════════════════════════════
//  BUSINESS EXPENSES  —  overhead that isn't inventory (a POS
//  machine, rent, ads). Real cash out, never touches stock/COGS.
// ══════════════════════════════════════════════════════
function renderExpenseCategorySelect(){
  const sel = document.getElementById('expCategorySelect');
  if(!sel || sel.options.length) return;
  sel.innerHTML = EXPENSE_CATEGORIES.map(c=>`<option value="${c}">${c}</option>`).join('');
}
async function saveExpense(){
  renderExpenseCategorySelect();
  const amount = parseFloat(document.getElementById('expAmount').value);
  const title = document.getElementById('expTitle').value.trim();
  if(!title){ showToast('Give the expense a short title','error'); return; }
  if(!amount || amount<=0){ showToast('Enter an amount','error'); return; }
  const payload = {
    date: document.getElementById('expDateHidden').value,
    category: document.getElementById('expCategorySelect').value,
    title, amount,
    notes: document.getElementById('expNotes').value.trim(),
  };
  if(editingExpenseId){ payload.id = editingExpenseId; await postParts('update_expense', payload); }
  else { await postParts('add_expense', payload); }
  showToast(editingExpenseId ? 'Expense updated' : 'Expense recorded','success');
  cancelEditExpense();
}
function editExpense(id){
  const x = PARTS.business_expenses.find(e=>e.id===id);
  if(!x) return;
  editingExpenseId = id;
  renderJalaliPicker('expDatePicker','expDateHidden', x.date, ()=>{});
  document.getElementById('expCategorySelect').value = x.category||'سایر';
  document.getElementById('expTitle').value = x.title||'';
  document.getElementById('expAmount').value = x.amount||'';
  document.getElementById('expNotes').value = x.notes||'';
  document.getElementById('expSaveBtn').textContent = 'Update Expense';
  document.getElementById('expCancelBtn').style.display = 'inline-block';
}
function cancelEditExpense(){
  editingExpenseId = null;
  renderJalaliPicker('expDatePicker','expDateHidden', null, ()=>{});
  document.getElementById('expTitle').value = '';
  document.getElementById('expAmount').value = '';
  document.getElementById('expNotes').value = '';
  document.getElementById('expSaveBtn').textContent = 'Add Expense';
  document.getElementById('expCancelBtn').style.display = 'none';
}
function deleteExpense(id){
  if(!confirm('Delete this expense?')) return;
  postParts('delete_expense', {id});
  showToast('Expense deleted','success');
  if(editingExpenseId===id) cancelEditExpense();
}
function renderExpenseLedger(){
  const list = document.getElementById('expenseLedger');
  if(!list) return;
  const sorted = [...PARTS.business_expenses].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  if(!sorted.length){
    list.innerHTML = '<div class="parts-empty"><div class="pe-icon">💸</div><div class="pe-text">No business expenses yet — things like a POS device, rent, or ads (not inventory) go here.</div></div>';
    return;
  }
  list.innerHTML = sorted.map(x=>`
    <div class="cash-ledger-item">
      <div class="cash-ledger-icon">💸</div>
      <div class="cash-ledger-info">
        <div class="cash-ledger-title">${escHtml(x.title)} <span class="part-badge">${escHtml(x.category)}</span></div>
        <div class="cash-ledger-sub">${jalaliFullLabel(x.date)}${x.notes?' · '+escHtml(x.notes):''}</div>
      </div>
      <div class="cash-ledger-amount" style="color:var(--coral);">−${fmtT(x.amount)}</div>
      <div style="display:flex;gap:4px;">
        <button class="icon-btn-sm" onclick="editExpense('${x.id}')">✎</button>
        <button class="icon-btn-sm del" onclick="deleteExpense('${x.id}')">🗑</button>
      </div>
    </div>`).join('');
}
function renderExpenseTabStats(){
  const el = document.getElementById('expenseTabTotal');
  if(!el) return;
  el.textContent = fmtT(PARTS.totals.total_expenses||0);
}

// ══════════════════════════════════════════════════════
//  INVOICES  —  a formal, numbered document generated from a
//  sale, plus the one-time business profile it's printed with.
// ══════════════════════════════════════════════════════
const FA_MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const FA_DIGITS = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
function faDigits(n){ return String(n).replace(/[0-9]/g, d=>FA_DIGITS[+d]); }
function jalaliDateFa(iso){
  // Guarantees a real Persian date on the invoice (day + Persian month name +
  // year) — built entirely from our own FA_MONTHS table, never from
  // gregToJalali's month_name (which turned out to be the Latin transliteration
  // like "Shahrivar", not the Persian word).
  if(!iso) return '';
  try{
    const j = gregToJalali(iso);
    if(!j || !j.m) return iso;
    return `${faDigits(j.d)} ${FA_MONTHS[j.m-1]} ${faDigits(j.y)}`;
  }catch(e){ return iso; }
}
const DELIVERY_METHODS = ['پیک موتوری','اسنپ / تپسی باکس','پست', 'باربری', 'تحویل حضوری', 'سایر'];
const RETURN_REASONS = ['کالای معیوب','ارسال اشتباه','انصراف مشتری','کیفیت پایین','اندازه/مدل نامناسب','سایر'];

function openBusinessProfileModal(){
  const bp = PARTS.business_profile || {};
  document.getElementById('bpName').value = bp.name||'';
  document.getElementById('bpAddress').value = bp.address||'';
  document.getElementById('bpPhone').value = bp.phone||'';
  document.getElementById('bpFooter').value = bp.footer_note||'';
  const preview = document.getElementById('bpLogoPreview');
  if(bp.logo){ preview.src = bp.logo; preview.style.display='block'; } else { preview.style.display='none'; }
  businessLogoData = null;
  setBpTheme(bp.invoice_theme || 'classic');
  document.getElementById('businessProfileModalOverlay').classList.add('open');
}
function closeBusinessProfileModal(){ document.getElementById('businessProfileModalOverlay').classList.remove('open'); }
let businessLogoData = null;
let bpSelectedTheme = 'classic';
function setBpTheme(t){
  bpSelectedTheme = t;
  document.getElementById('bpThemeClassicBtn').classList.toggle('active', t==='classic');
  document.getElementById('bpThemeMinimalBtn').classList.toggle('active', t==='minimal');
}
function onBusinessLogoSelected(input){
  const file = input.files && input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e=>{
    businessLogoData = e.target.result;
    const preview = document.getElementById('bpLogoPreview');
    preview.src = businessLogoData; preview.style.display='block';
  };
  reader.readAsDataURL(file);
}
async function saveBusinessProfile(){
  const payload = {
    name: document.getElementById('bpName').value.trim(),
    address: document.getElementById('bpAddress').value.trim(),
    phone: document.getElementById('bpPhone').value.trim(),
    footer_note: document.getElementById('bpFooter').value.trim(),
    invoice_theme: bpSelectedTheme,
  };
  if(businessLogoData !== null) payload.logo = businessLogoData;
  await postParts('update_business_profile', payload);
  showToast('Business info saved','success');
  closeBusinessProfileModal();
}
async function openInvoicePreview(saleId){
  const sale = PARTS.sales.find(s=>s.id===saleId);
  if(!sale) return;
  if(!sale.invoice_no){
    const res = await postParts('generate_invoice', {sale_id: saleId});
    if(!res || res.ok===false) return;
  }
  const fresh = PARTS.sales.find(s=>s.id===saleId);
  renderInvoice(fresh);
  document.getElementById('invoiceModalOverlay').classList.add('open');
}
function closeInvoiceModal(){ document.getElementById('invoiceModalOverlay').classList.remove('open'); }
function renderInvoice(sale){
  const bp = PARTS.business_profile || {};
  const theme = bp.invoice_theme === 'minimal' ? 'minimal' : 'classic';
  const itemDiscountTotal = sale.items.reduce((s,it)=>s+(Number(it.discount)||0), 0);
  const extraDiscount = Number(sale.discount)||0;
  const taxPct = Number(sale.tax_percent)||0;
  const shippingCharged = Number(sale.shipping_charged_to_customer);
  const shipping = isNaN(shippingCharged) ? (Number(sale.shipping_cost)||0) : shippingCharged;
  // Use the backend-computed figures (same numbers already baked into profit/AR)
  // so the printed invoice can never drift from what the books actually show.
  const taxAmount = Number(sale.tax_amount)||0;
  const grandTotal = Number(sale.invoice_total)||0;
  const subtotal = sale.items.reduce((s,it)=>s+it.qty*it.unit_price-(Number(it.discount)||0), 0);
  const el = document.getElementById('invoicePrintArea');
  el.className = 'inv-theme-'+theme;
  el.innerHTML = `
    <div class="inv-header">
      ${bp.logo ? `<img src="${bp.logo}" class="inv-logo">` : ''}
      <div class="inv-biz-name">${escHtml(bp.name || 'کسب و کار من')}</div>
      <div class="inv-biz-meta">${[bp.address, bp.phone].filter(Boolean).map(escHtml).join(' · ')}</div>
    </div>
    <div class="inv-meta-row">
      <div>شماره فاکتور: <b>${faDigits(sale.invoice_no)}</b></div>
      <div>تاریخ: <b>${jalaliDateFa(sale.date)}</b></div>
    </div>
    ${(sale.customer_name||sale.customer_phone||sale.customer_address) ? `<div class="inv-customer">
      <b>مشتری:</b> ${escHtml(sale.customer_name||'-')}${sale.customer_phone?' · '+escHtml(sale.customer_phone):''}${sale.customer_address?' · '+escHtml(sale.customer_address):''}
    </div>` : ''}
    ${(sale.agent_id && sale.show_agent_on_invoice && agentById(sale.agent_id)) ? `<div class="inv-customer">
      <b>نماینده فروش:</b> ${escHtml(agentById(sale.agent_id).name)}${agentById(sale.agent_id).phone?' · '+escHtml(agentById(sale.agent_id).phone):''}
    </div>` : ''}
    <table class="inv-table">
      <colgroup><col style="width:8%"><col style="width:34%"><col style="width:10%"><col style="width:16%"><col style="width:14%"><col style="width:18%"></colgroup>
      <thead><tr><th>ردیف</th><th>شرح کالا</th><th>تعداد</th><th>قیمت واحد</th><th>تخفیف</th><th>جمع</th></tr></thead>
      <tbody>${sale.items.map((it,i)=>{
        const lineDiscount = Number(it.discount)||0;
        const lineTotal = it.qty*it.unit_price - lineDiscount;
        return `<tr>
        <td>${faDigits(i+1)}</td><td class="inv-td-desc">${escHtml(productLabel(productById(it.product_id)))}</td>
        <td>${faDigits(it.qty)}</td><td>${fmtToman(it.unit_price)}</td>
        <td>${lineDiscount>0 ? '− '+fmtToman(lineDiscount) : '—'}</td><td>${fmtToman(lineTotal)}</td></tr>`;
      }).join('')}</tbody>
    </table>
    <div class="inv-totals">
      <div class="inv-total-row"><span>جمع کل (بعد از تخفیف هر ردیف)</span><span>${fmtToman(subtotal)}</span></div>
      ${itemDiscountTotal>0 ? `<div class="inv-total-row"><span>جمع تخفیف ردیف‌ها</span><span>− ${fmtToman(itemDiscountTotal)}</span></div>` : ''}
      ${extraDiscount>0 ? `<div class="inv-total-row"><span>تخفیف کلی فاکتور</span><span>− ${fmtToman(extraDiscount)}</span></div>` : ''}
      ${shipping>0 ? `<div class="inv-total-row"><span>هزینه ارسال</span><span>+ ${fmtToman(shipping)}</span></div>` : ''}
      ${taxPct>0 ? `<div class="inv-total-row"><span>مالیات (${faDigits(taxPct)}%)</span><span>${fmtToman(taxAmount)}</span></div>` : ''}
      <div class="inv-total-row inv-grand"><span>مبلغ نهایی قابل پرداخت</span><span>${fmtToman(grandTotal)}</span></div>
    </div>
    ${sale.delivery_method ? `<div class="inv-delivery">🚚 روش ارسال: ${escHtml(sale.delivery_method)}${sale.shipping_payer==='split'?' (هزینه ارسال بین طرفین تقسیم شده)':(sale.shipping_payer==='business'?' (هزینه ارسال رایگان)':'')}</div>` : ''}
    ${sale.notes ? `<div class="inv-note">📝 ${escHtml(sale.notes)}</div>` : ''}
    ${bp.footer_note ? `<div class="inv-footer">${escHtml(bp.footer_note)}</div>` : ''}
  `;
}
function printInvoice(){ window.print(); }
