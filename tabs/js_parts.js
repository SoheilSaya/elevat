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
// «تحویل حضوری» means nobody ships anything — so shipping cost / payer UI disappear and the cost is forced to 0.
const isPickupMethod = v => v === PICKUP;
function onSaleDeliveryChange(){
  const pick = isPickupMethod(document.getElementById('saleDeliveryMethod').value);
  document.getElementById('saleShippingBlock').style.display = pick ? 'none' : '';
  document.getElementById('salePickupNote').style.display = pick ? 'block' : 'none';
  if(pick){
    document.getElementById('saleShippingCost').value = '';
    document.getElementById('saleShippingRatio').value = 50;
    setSaleShippingPayer('customer');
  }
  if(typeof renderSaleCart === 'function') renderSaleCart();
}
function onQuoteDeliveryChange(){
  const pick = isPickupMethod(document.getElementById('quoteDeliveryMethod').value);
  document.getElementById('quoteShippingBlock').style.display = pick ? 'none' : '';
  document.getElementById('quotePickupNote').style.display = pick ? 'block' : 'none';
  if(pick){
    document.getElementById('quoteShippingCost').value = '';
    setQuoteShippingPayer('customer');
  }
}
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
const TAX_PAYMENT_CATEGORY = 'پرداخت مالیات (تسویه)'; // must match app.py — settles VAT owed, never counted as an expense
const EXPENSE_CATEGORIES = ['تجهیزات','اجاره','بازاریابی','قبوض','نرم‌افزار','بسته‌بندی و ارسال','حمل و نقل','سایر', TAX_PAYMENT_CATEGORY];
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
  return '\u2067' + n.toLocaleString('en-US') + ' KT\u2069';   // RTL isolate: عدد اول، بعد KT (در خواندن فارسی KT «جلوی» عدد می‌آید)
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
    rbInit();
    initSubnavBehaviour();
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
    ['partsFilterCarModel','partsFilterBrand','partsFilterPartType','partsFilterCategory','partsFilterGroup','invFilterGroup',
     'pfPartType','pfBrand','pfCategory','purchaseStoreSelect','purchaseItemProduct','saleItemProduct',
     'peStoreSelect','peProductSelect','peGenericSelect','pfPriceListFilterStore',
     'cpProductSelect','cpGenericSelect','cartProductSelect','cartGenericSelect','expCategorySelect','saleAgentSelect',
     'saleCustomerSelect','quoteCustomerSelect','quoteAgentSelect','quoteItemProduct','retSaleSelect',
     'invFilterBrand','invFilterCar','invFilterPartType','invFilterCategory']
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

// ── Entity thumbnails — wherever a product / supplier / agent shows up in a
// list, table or dropdown, its photo goes with it so similar-looking names are easy to tell apart.
function thumbHtml(src, icon){
  return src ? `<img class="tbl-thumb" src="${escHtml(src)}" alt="" loading="lazy">` : `<span class="tbl-thumb tbl-thumb-icon">${icon||'📦'}</span>`;
}
function withThumb(th, inner){ return `<span class="with-thumb">${th}<span class="with-thumb-txt">${inner}</span></span>`; }
function prodThumb(pid){ const p = productById(pid); return thumbHtml(p && p.image, '📦'); }
function storeThumb(sid){ const s = storeById(sid); return thumbHtml(s && s.image, '🏬'); }
function agentThumb(aid){ const a = agentById(aid); return thumbHtml(a && a.image, '🧑‍💼'); }
function prodCell(pid){ const p = productById(pid); return withThumb(prodThumb(pid), escHtml(p ? productLabel(p) : '(کالای حذف‌شده)')); }
function storeCell(sid){ const s = storeById(sid); return withThumb(storeThumb(sid), escHtml(s ? s.name : '(فروشگاه حذف‌شده)')); }
function agentCell(aid){ const a = agentById(aid); return withThumb(agentThumb(aid), escHtml(a ? a.name : '(نماینده حذف‌شده)')); }
function entityOptions(dim){
  if(dim==='product') return PARTS.products.map(p=>({v:p.id, t:productLabel(p), i:p.image||'', c:'📦'}));
  if(dim==='store') return PARTS.stores.map(p=>({v:p.id, t:p.name, i:p.image||'', c:'🏬'}));
  if(dim==='agent') return PARTS.sales_agents.map(p=>({v:p.id, t:p.name, i:p.image||'', c:'🧑‍💼'}));
  return null;
}
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
  function sync(){
    input.value = currentLabel();
    const o = select.options[select.selectedIndex];
    let t = wrap.querySelector('.ss-selthumb');
    const img = o && o.dataset ? o.dataset.img : '', icon = o && o.dataset ? o.dataset.icon : '';
    if(o && o.value && (img || icon)){
      if(!t){ t = document.createElement('span'); t.className = 'ss-selthumb'; wrap.appendChild(t); }
      t.innerHTML = img ? `<img src="${escHtml(img)}" alt="">` : icon;
      wrap.classList.add('has-selthumb');
    } else { if(t) t.remove(); wrap.classList.remove('has-selthumb'); }
  }
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
    if(!d.ok){ showToast(d.error || 'مشکلی پیش آمد','error'); return d; }
    Object.assign(PARTS, d);
    renderPartsAll();
    return d;
  }catch(e){ console.warn('[Elevate] parts save failed', e); showToast('ذخیره نشد — اتصال را بررسی کن','error'); return {ok:false}; }
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
  renderPCalendar();
  renderProductGroups();
  bndRenderAll();
  bndMigrateOnce();
  renderInventory();
  renderKardex();
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
    ['🏦','موجودی صندوق', fmtT(PARTS.totals.cash_balance||0), 'var(--sky)', 'cash_balance'],
    ['🏷️','ارزش موجودی انبار', fmtT(PARTS.totals.inventory_value||0), 'var(--amber)', 'inventory_value'],
    ['💎','حقوق صاحبان سرمایه (ارزش خالص دفتری)', fmtT(PARTS.totals.business_value||0), 'var(--plum)', 'equity'],
    ['📈','سود خالص (از ابتدا)', fmtT(netProfit), netProfit>=0?'var(--sage)':'var(--coral)', 'net_profit_alltime'],
  ];
  wrap.innerHTML = stats.map(([icon,label,val,color,xid,xa])=>kpiCardHtml(icon,label,val,color,xid,xa)).join('');
}
// Spells out exactly why Cash Balance is what it is — every sale's revenue
// (which already carries its profit inside it) flows straight into this
// number the moment it's recorded, same as every purchase flows straight out.
function renderCashBreakdown(){
  const wrap = document.getElementById('cashBreakdownRows');
  if(!wrap) return;
  const t = PARTS.totals;
  const adj = (t.net_capital||0) - (t.total_deposits||0) + (t.total_withdrawals||0);
  const rows = [
    ['💰','سرمایه واریزشده', t.total_deposits||0, 'dep'],
    ['🏧','سرمایه برداشت‌شده', -(t.total_withdrawals||0), 'wd'],
    ['🔧','تعدیل‌های مغایرت‌گیری', adj, 'adj'],
    ['💵','دریافتی واقعی از مشتریان', t.total_received_from_customers||0, 'recv'],
    ['↩️','مبلغ نقدی بازگردانده‌شده بابت مرجوعی', -(t.total_cash_refunds||0), 'refund'],
    ['🧾','پرداخت‌شده به تامین‌کنندگان', -(t.total_paid_to_suppliers||0), 'supp'],
    ['💸','هزینه‌های جاری', -(t.total_expenses||0), 'exp'],
    ['🏛️','پرداخت مالیات به سازمان امور مالیاتی', -(t.total_tax_payments||0), 'tax'],
    ['🚚','هزینه ارسال پرداخت‌شده', -(t.total_shipping_paid||0), 'ship'],
    ['🎁','پورسانت پرداخت‌شده به نمایندگان', -(t.total_agent_payouts||0), 'pay'],
  ].filter(r=>Math.abs(r[2])>0.004);
  wrap.innerHTML = rows.map(([icon,label,amt,key])=>`
    <div class="cashbrk-row">
      <div class="cashbrk-label">${icon} ${biLabel(label)} ${xBtn('cash_part',{key},'xi-mini')}</div>
      <div class="cashbrk-amt ${amt>=0?'pos':'neg'}">${amt>=0?'+':'−'}${fmtT(Math.abs(amt))}</div>
    </div>`).join('') + `
    <div class="cashbrk-row total">
      <div class="cashbrk-label">🏦 = موجودی صندوق ${xBtn('cash_balance',{},'xi-mini')}</div>
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
      label: t.type==='deposit' ? '💰 واریز سرمایه' : '🏧 برداشت سرمایه', sub: t.note||''});
  });
  PARTS.purchases.forEach(p=>{
    const total = p.items.reduce((s,it)=>s+it.qty*it.unit_price,0);
    const store = storeById(p.store_id);
    events.push({date:p.order_date, dir:'out', amount: total,
      label: '🧾 خرید — '+(store?store.name:'(فروشگاه حذف‌شده)'),
      sub: p.items.length+' قلم کالا'});
  });
  PARTS.sales.forEach(s=>{
    events.push({date:s.date, dir:'in', amount: s.revenue,
      label: '💵 فروش'+(s.customer_name?' — '+s.customer_name:''),
      sub: 'سود '+fmtT(s.profit)});
  });
  events.sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  wrap.innerHTML = events.length ? events.slice(0,80).map(e=>`
    <div class="money-row ${e.dir}">
      <div class="money-row-main">
        <div class="money-row-label">${escHtml(e.label)}</div>
        <div class="money-row-sub">${jalaliFullLabel(e.date)}${e.sub?' · '+escHtml(e.sub):''}</div>
      </div>
      <div class="money-row-amt">${e.dir==='in'?'+':'−'}${fmtT(e.amount)}</div>
    </div>`).join('') : '<div class="parts-empty"><div class="pe-icon">🏦</div><div class="pe-text">هنوز هیچ جابه‌جایی پولی ثبت نشده.</div></div>';
}
async function saveCashTx(){
  const amount = parseFloat(document.getElementById('cashTxAmount').value);
  if(!amount || amount<=0){ showToast('مبلغ را وارد کن','error'); return; }
  const payload = {
    type: cashTxType, amount, date: document.getElementById('cashDateHidden').value,
    note: document.getElementById('cashTxNote').value.trim(),
  };
  if(editingCashTxId){ payload.id = editingCashTxId; await postParts('update_capital_tx', payload); }
  else { await postParts('add_capital_tx', payload); }

  showToast(editingCashTxId ? 'ویرایش شد' : (cashTxType==='deposit' ? 'واریز ثبت شد' : 'برداشت ثبت شد'),'success');
  cancelEditCashTx();
  document.getElementById('cashTxAmount').value = '';
  document.getElementById('cashTxNote').value = '';
}
function cancelEditCashTx(){
  editingCashTxId = null;
  const btn = document.querySelector('#partsSub-cash .tx-save-btn');
  if(btn) btn.textContent = 'ذخیره';
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
  if(btn) btn.textContent = 'ویرایش';
  showToast('در حال ویرایش — هر چیزی را عوض کن و ذخیره بزن','success');
}
function deleteCashTx(id){
  postParts('delete_capital_tx',{id});
  showToast('مورد حذف شد','success');
  if(editingCashTxId===id) cancelEditCashTx();
}
function renderCashLedger(){
  const list = document.getElementById('cashLedgerList');
  if(!list) return;
  list.innerHTML = '';
  const sorted = [...PARTS.capital_transactions].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  if(!sorted.length){
    list.innerHTML = '<div class="parts-empty"><div class="pe-icon">🏦</div><div class="pe-text">هنوز واریز یا برداشتی ثبت نشده.</div></div>';
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
        <div class="cash-ledger-note">${escHtml(t.note) || (isAdj?'تعدیل مغایرت‌گیری':(t.type==='deposit' ? 'واریز' : 'برداشت'))}</div>
        <div class="cash-ledger-date">${jalaliFullLabel(t.date)}</div>
      </div>
      <div class="cash-ledger-amount ${colorClass}">${sign} ${fmtT(Math.abs(t.amount))}</div>
      <button class="cash-ledger-edit" onclick="editCashTx('${t.id}')" title="ویرایش">✎</button>
      <button class="cash-ledger-del" onclick="deleteCashTx('${t.id}')" title="حذف">✕</button>`;
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
    return `<tr><td>${prodCell(p.id)}</td><td>${shipBits.length?shipBits.join(' · '):'—'}</td>
      <td>${agentBits}</td><td>${p.calc_target_margin_pct!=null ? p.calc_target_margin_pct+'٪' : '—'}</td>
      <td><button class="icon-btn-sm" onclick="resetProductCalcOverrides('${p.id}')" title="بازگشت به پیش‌فرض">↺</button></td></tr>`;
  }).join('') : `<tr><td colspan="5" class="parts-table-empty">همه‌ی کالاها دارن از تنظیمات سراسری استفاده می‌کنن.</td></tr>`;

  const agentBody = document.querySelector('#agentVarsTable tbody');
  if(agentBody) agentBody.innerHTML = PARTS.sales_agents.length ? PARTS.sales_agents.map(a=>`
    <tr><td>${agentCell(a.id)}</td><td>${a.commission_percent!=null?a.commission_percent+'٪':'—'}</td>
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
// ══════════════════════════════════════════════════════
//  REPORT BUILDER ENGINE («گزارش‌ساز»)
//  Every number in the module is exposed as a "metric"; the data is flattened
//  into small "fact rows" (one per sale line, purchase line, expense, …) that are
//  grouped by a chosen dimension (time, product, brand, …) and fed to the metric.
// ══════════════════════════════════════════════════════
const PICKUP = 'تحویل حضوری';
const FA_WEEKDAYS = ['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنج‌شنبه','جمعه']; // Saturday-first
const FA_SEASONS = ['بهار','تابستان','پاییز','زمستان'];
const NO_VALUE = '—';

// ── Jalali ⇄ Gregorian (self-contained arithmetic; verified: 2026-10-10 = 1405/07/18) ──
function pjG2J(gy, gm, gd){
  const gdm = [0,31,59,90,120,151,181,212,243,273,304,334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 355666 + 365*gy + Math.floor((gy2+3)/4) - Math.floor((gy2+99)/100) + Math.floor((gy2+399)/400) + gd + gdm[gm-1];
  let jy = -1595 + 33*Math.floor(days/12053); days %= 12053;
  jy += 4*Math.floor(days/1461); days %= 1461;
  if(days > 365){ jy += Math.floor((days-1)/365); days = (days-1) % 365; }
  const jm = days < 186 ? 1 + Math.floor(days/31) : 7 + Math.floor((days-186)/30);
  const jd = 1 + (days < 186 ? days % 31 : (days-186) % 30);
  return [jy, jm, jd];
}
function pjJ2G(jy, jm, jd){
  jy += 1595;
  let days = -355668 + 365*jy + Math.floor(jy/33)*8 + Math.floor((jy%33+3)/4) + jd + (jm < 7 ? (jm-1)*31 : (jm-7)*30 + 186);
  let gy = 400*Math.floor(days/146097); days %= 146097;
  if(days > 36524){ days--; gy += 100*Math.floor(days/36524); days %= 36524; if(days >= 365) days++; }
  gy += 4*Math.floor(days/1461); days %= 1461;
  if(days > 365){ gy += Math.floor((days-1)/365); days = (days-1) % 365; }
  let gd = days + 1;
  const sal = [0,31,((gy%4===0 && gy%100!==0) || gy%400===0) ? 29 : 28,31,30,31,30,31,31,30,31,30,31];
  let gm = 0;
  while(gm < 13 && gd > sal[gm]){ gd -= sal[gm]; gm++; }
  return [gy, gm, gd];
}
const pad2 = n => String(n).padStart(2,'0');
function isoFromParts(y,m,d){ return y+'-'+pad2(m)+'-'+pad2(d); }
function isoToJ(iso){ const p = iso.split('-').map(Number); const j = pjG2J(p[0],p[1],p[2]); return {y:j[0], m:j[1], d:j[2]}; }
function jToIso(y,m,d){ const g = pjJ2G(y,m,d); return isoFromParts(g[0],g[1],g[2]); }
function jMonthLen(y, m){
  if(m <= 6) return 31;
  if(m <= 11) return 30;
  const back = pjG2J.apply(null, pjJ2G(y,12,30));
  return (back[0]===y && back[1]===12 && back[2]===30) ? 30 : 29;
}
function isoAdd(iso, n){
  const p = iso.split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1]-1, p[2]+n));
  return d.getUTCFullYear()+'-'+pad2(d.getUTCMonth()+1)+'-'+pad2(d.getUTCDate());
}
function isoDiff(a, b){ // days from a to b
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pb[0],pb[1]-1,pb[2]) - Date.UTC(pa[0],pa[1]-1,pa[2]))/86400000);
}
function isoWeekdaySat(iso){ // 0 = Saturday … 6 = Friday
  const p = iso.split('-').map(Number);
  return (new Date(Date.UTC(p[0],p[1]-1,p[2])).getUTCDay() + 1) % 7;
}
function isoToday(){ const d = new Date(); return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); }
function jLabel(iso){ if(!iso) return NO_VALUE; const j = isoToJ(iso); return faDigits(j.d)+' '+FA_MONTHS[j.m-1]+' '+faDigits(j.y); }
function jShort(iso){ if(!iso) return NO_VALUE; const j = isoToJ(iso); return j.y+'/'+pad2(j.m)+'/'+pad2(j.d); }
function normDigits(s){
  return String(s||'').replace(/[۰-۹]/g, d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[٫٬]/g,'');
}
// accepts 1405/07/18, 1405-7-18 (Jalali) or 2026-10-10 (Gregorian); '' → ''; invalid → null
function parseDateInput(s){
  s = normDigits(s).trim();
  if(!s) return '';
  const m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if(!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if(mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  if(y < 1700){
    if(d > jMonthLen(y, mo)) return null;
    return jToIso(y, mo, d);
  }
  const dt = new Date(Date.UTC(y, mo-1, d));
  if(dt.getUTCMonth() !== mo-1) return null;
  return isoFromParts(y, mo, d);
}
function jalaliStartOfMonth(iso){ const j = isoToJ(iso); return jToIso(j.y, j.m, 1); }
function jalaliEndOfMonth(iso){ const j = isoToJ(iso); return jToIso(j.y, j.m, jMonthLen(j.y, j.m)); }

// ── Fact rows ────────────────────────────────────────
function productDims(p){
  const cars = productCarModels(p);
  return {
    brand: [p && p.brand ? p.brand : ''],
    car_model: cars.length ? cars : [''],
    category: [p && p.category ? p.category : ''],
    part_type: [p && p.part_type ? p.part_type : ''],
    ...ptgDims(p),
    variant: [p && p.variant ? p.variant : ''],
    oem: [p && p.oem_code ? p.oem_code : ''],
  };
}
function ptgDims(p){
  const gid = p && p.group_id && ptgById(p.group_id) ? p.group_id : '', path = gid ? ptgPath(gid) : [];
  return {group: (path.length ? path : ['__none']).concat(p ? ['p:'+p.id] : []), group_leaf:[gid], group_l1:[path[0]||''], group_l2:[path[1]||''], group_l3:[path[2]||'']};
}
function buildFacts(){
  const F = [];
  const prodMap = {}; PARTS.products.forEach(p=>prodMap[p.id] = p);
  const pd = pid => { const p = prodMap[pid]; return Object.assign({product:[pid||'']}, productDims(p)); };
  const supOf = {};   // product → suppliers it was ever bought from
  (PARTS.purchases||[]).forEach(p=>(p.items||[]).forEach(it=>{ (supOf[it.product_id] = supOf[it.product_id] || new Set()).add(p.store_id||''); }));
  const sup = pid => supOf[pid] && supOf[pid].size ? [...supOf[pid]] : [''];
  const num = v => Number(v)||0;

  // sale lines
  (PARTS.sales||[]).forEach(s=>{
    const items = s.items||[];
    const nets = items.map(it=>Math.max(num(it.qty)*num(it.unit_price) - num(it.discount), 0));
    const sub = nets.reduce((a,b)=>a+b,0);
    const invDisc = num(s.discount);
    const ratio = sub > 0 ? Math.min(invDisc/sub, 1) : 0;
    const shipPaid = num(s.shipping_cost);
    const shipEff = num(s.shipping_net_profit_effect);
    const custKey = s.customer_id ? 'id:'+s.customer_id : (s.customer_name ? 'n:'+s.customer_name.trim() : '');
    const pickup = (s.delivery_method||'') === PICKUP;
    const taxPct = num(s.tax_percent);
    const taxNet = num(s.tax_amount) - (taxPct > 0 ? num(s.returned_value_total)*taxPct/(100+taxPct) : 0);   // VAT net of returns
    items.forEach((it, i)=>{
      const share = sub > 0 ? nets[i]/sub : 1/Math.max(items.length,1);
      const qty = num(it.qty), price = num(it.unit_price);
      const retQty = num(it.returned_qty);
      F.push({k:'sl', date:s.date, sid:s.id, pid:it.product_id, cust:custKey,
        d:Object.assign(pd(it.product_id), {
          store:sup(it.product_id), agent:[s.agent_id||''], customer:[custKey], delivery:[s.delivery_method||''],
          pay_status:[s.payment_status||'paid'], sale:[s.id], bundle:[it.bundle_id||'']}),
        v:{
          qty, ret_qty:retQty, net_qty:qty-retQty, gross:qty*price, item_disc:num(it.discount), inv_disc:nets[i]*ratio,
          item_rev:num(it.revenue), revenue:num(it.revenue)+shipEff*share, cogs:num(it.cogs), profit:num(it.profit)+shipEff*share,
          ship_charged:num(s.shipping_charged_to_customer)*share, ship_paid:shipPaid*share, ship_eff:shipEff*share,
          tax:taxNet*share, inv_total:num(s.invoice_total)*share, received:num(s.amount_received)*share,
          outstanding:num(s.amount_outstanding)*share, commission:num(s.agent_commission)*share,
          has_ship: shipPaid>0 ? 1 : 0, pickup: pickup ? 1 : 0, has_agent: s.agent_id ? 1 : 0, has_disc:(num(it.discount)>0||invDisc>0)?1:0,
          in_bundle: it.bundle_id ? 1 : 0, bnd_rev: it.bundle_id ? num(it.revenue) : 0, bnd_disc: it.bundle_id ? num(it.discount) : 0, reward_cost: (it.bundle_id && it.bundle_role==='reward') ? num(it.cogs) : 0,
        }});
    });
  });
  // purchase lines
  (PARTS.purchases||[]).forEach(p=>{
    const items = p.items||[];
    const spends = items.map(it=>num(it.qty)*num(it.unit_price));
    const tot = spends.reduce((a,b)=>a+b,0);
    let paid = 0;
    if(p.payment_status==='unpaid') paid = 0; else if(p.payment_status==='partial') paid = Math.min(num(p.amount_paid), tot); else paid = tot;
    items.forEach((it,i)=>{
      const share = tot > 0 ? spends[i]/tot : 1/Math.max(items.length,1);
      F.push({k:'pl', date:p.order_date, pur:p.id, pid:it.product_id,
        d:Object.assign(pd(it.product_id), {store:[p.store_id||''], delivery:[p.delivery_method||''], pay_status:[p.payment_status||'paid'], purchase:[p.id]}),
        v:{qty:num(it.qty), spend:spends[i], paid:paid*share, outstanding:(tot-paid)*share}});
    });
  });
  // returns
  const saleById = {}; (PARTS.sales||[]).forEach(s=>saleById[s.id]=s);
  (PARTS.sale_returns||[]).forEach(r=>{
    const s = saleById[r.sale_id]; if(!s) return;
    const items = r.items||[];
    const nets = items.map(it=>num(it.qty)*num(it.refund_unit_price));
    const tot = nets.reduce((a,b)=>a+b,0);
    const custKey = s.customer_id ? 'id:'+s.customer_id : (s.customer_name ? 'n:'+s.customer_name.trim() : '');
    const date = (r.date && r.date > (s.date||'')) ? r.date : s.date;
    items.forEach((it,i)=>{
      const share = tot > 0 ? nets[i]/tot : 1/Math.max(items.length,1);
      F.push({k:'rt', date, rid:r.id, sid:s.id, pid:it.product_id,
        d:Object.assign(pd(it.product_id), {customer:[custKey], return_reason:[r.reason||'سایر'], agent:[s.agent_id||''], sale:[s.id], store:sup(it.product_id), delivery:[s.delivery_method||''], pay_status:[s.payment_status||'paid']}),
        v:{qty:num(it.qty), value:nets[i], total:num(r.refund_total)*share, cash:num(r.cash_refunded)*share, restock:r.restock===false?0:num(it.qty)}});
    });
  });
  // expenses / capital / payouts / cash ledger / price entries
  (PARTS.business_expenses||[]).forEach(x=>{ const isTax = x.category===TAX_PAYMENT_CATEGORY;   // VAT settlement is cash out, not an expense
    F.push({k:'ex', date:x.date, d:{expense_category:[x.category||'سایر']}, v:{amount:isTax?0:num(x.amount), taxpay:isTax?num(x.amount):0, is_tax:isTax?1:0, is_exp:isTax?0:1}}); });
  (PARTS.capital_transactions||[]).forEach(t=>F.push({k:'cap', date:t.date, d:{}, v:{
    dep:t.type==='deposit'?num(t.amount):0, wd:t.type==='withdrawal'?num(t.amount):0, adj:t.type==='adjustment'?num(t.amount):0}}));
  (PARTS.agent_payouts||[]).forEach(p=>F.push({k:'po', date:p.date, d:{agent:[p.agent_id||'']}, v:{amount:num(p.amount)}}));
  (PARTS.cash_ledger||[]).forEach(e=>F.push({k:'cl', date:e.date, d:{cash_type:[e.type||'']}, v:{amt:num(e.amount), in:num(e.amount)>0?num(e.amount):0, out:num(e.amount)<0?-num(e.amount):0}}));
  (PARTS.price_entries||[]).forEach(e=>{
    const hasP = e.ref_type==='product' && e.product_id;
    const gd = e.ref_type==='group' ? Object.assign({product:['gr:'+(e.group_id||'')]}, (()=>{ const path = ptgById(e.group_id) ? ptgPath(e.group_id) : []; return {group:path.length?path:['__none'], group_leaf:[e.group_id||''], group_l1:[path[0]||''], group_l2:[path[1]||''], group_l3:[path[2]||'']}; })()) : null;
    F.push({k:'pe', date:e.date, d:Object.assign(hasP ? pd(e.product_id) : (gd || {product:['g:'+(e.generic_id||'')]}), {store:[e.store_id||'']}), v:{price:num(e.price)}});
  });
  // static rows (no date)
  const stock = PARTS.stock||{}, avg = PARTS.avg_cost||{};
  const lowSet = new Set(PARTS.low_stock||[]);
  PARTS.products.forEach(p=>{
    const st = num(stock[p.id]), ac = num(avg[p.id]);
    const sp = (p.sale_price===null||p.sale_price===undefined||p.sale_price==='') ? null : num(p.sale_price);
    F.push({k:'pr', date:null, pid:p.id, d:Object.assign(pd(p.id), {store:sup(p.id)}), v:{
      stock:st, value:st*ac, avg_cost:ac, sale_price:sp, has_price:sp!==null?1:0, potential:sp!==null?st*sp:0,
      pot_profit:sp!==null?st*(sp-ac):0, reorder:(p.reorder_point===null||p.reorder_point===undefined||p.reorder_point==='')?null:num(p.reorder_point),
      low:lowSet.has(p.id)?1:0, out:st<=0?1:0}});
  });
  const ap = PARTS.ap_by_store||{};
  PARTS.stores.forEach(s=>F.push({k:'st', date:null, d:{store:[s.id]}, v:{ship:num(s.shipping_cost), free_min:num(s.free_shipping_min), payable:num((ap[s.id]||{}).outstanding)}}));
  const ags = PARTS.agent_summary||{};
  PARTS.sales_agents.forEach(a=>F.push({k:'ag', date:null, d:{agent:[a.id]}, v:{pct:a.commission_percent===null||a.commission_percent===undefined||a.commission_percent===''?null:num(a.commission_percent),
    payable:num((ags[a.id]||{}).payable), accrued:num((ags[a.id]||{}).accrued), paid:num((ags[a.id]||{}).paid)}}));
  const ar = PARTS.ar_by_customer||{};
  PARTS.customers.forEach(c=>F.push({k:'cu', date:null, d:{customer:['id:'+c.id]}, v:{outstanding:num((ar[c.name]||{}).outstanding)}}));
  const T = PARTS.totals||{};
  F.push({k:'tot', date:null, d:{}, v:{ar:num(T.accounts_receivable), ap:num(T.accounts_payable), biz:num(T.business_value),
    comm_payable:num(T.agent_commission_payable), net_capital:num(T.net_capital), tax_payable:num(T.tax_payable), oversold:num(T.oversold_cost)}});
  return F;
}

// ── Dimensions ──────────────────────────────────────
const RB_DIMS = {
  time:        {label:'⏱️ زمان', kinds:['sl','pl','rt','ex','cap','po','cl','pe']},
  weekday:     {label:'📆 روز هفته', kinds:['sl','pl','rt','ex','cap','po','cl','pe']},
  all:         {label:'🧮 جمع کل (بدون تفکیک)', kinds:['sl','pl','rt','ex','cap','po','cl','pe','pr','st','ag','cu','tot']},
  product:     {label:'📦 کالا', kinds:['sl','pl','rt','pe','pr']},
  brand:       {label:'🏷️ برند', kinds:['sl','pl','rt','pe','pr']},
  car_model:   {label:'🚗 مدل خودرو', kinds:['sl','pl','rt','pe','pr'], note:'کالایی که برای چند خودرو ثبت شده، در هر مدل جداگانه شمرده می‌شود؛ پس جمع ردیف‌ها ممکن است از «جمع کل» بیشتر باشد.'},
  group:       {label:'🌳 گروه کالا (درختی، با زیرگروه و خودِ کالا)', kinds:['sl','pl','rt','pe','pr'], note:'در نمای درختی هر کالا در همه‌ی گروه‌های بالاترش هم شمرده می‌شود (گروه مادر = جمع زیرگروه‌ها)؛ پس جمع ردیف‌های هم‌سطح با «جمع کل» برابر است ولی جمع همه‌ی ردیف‌ها نه.'},
  variant:     {label:'🔖 مشخصه / مدل کالا (مثلاً ۲ فیش)', kinds:['sl','pl','rt','pe','pr']},
  oem:         {label:'🔢 کد فنی (OEM)', kinds:['sl','pl','rt','pe','pr']},
  bundle:      {label:'🎁 باندل / جایزه‌ی خرید', kinds:['sl'], note:'ردیف‌هایی که با یک باندل (یا به‌عنوان جایزه‌ی آن) فروخته شده‌اند به نام باندل می‌آیند؛ بقیه «بدون باندل».'},
  group_leaf:  {label:'🌿 گروهِ مستقیم کالا (دقیق‌ترین)', kinds:['sl','pl','rt','pe','pr']},
  group_l1:    {label:'🌳 گروه سطح ۱ (کلی‌ترین)', kinds:['sl','pl','rt','pe','pr']},
  group_l2:    {label:'🌳 گروه سطح ۲', kinds:['sl','pl','rt','pe','pr']},
  group_l3:    {label:'🌳 گروه سطح ۳', kinds:['sl','pl','rt','pe','pr']},
  store:       {label:'🏬 تامین‌کننده / فروشگاه', kinds:['pl','pe','st','sl','rt','pr'], note:'تامین‌کننده‌ی هر کالا از روی خریدهای ثبت‌شده‌اش تعیین می‌شود. کالایی که از چند تامین‌کننده خریده شده در هر کدام جداگانه شمرده می‌شود (پس جمع ردیف‌ها ممکن است از «جمع کل» بیشتر باشد) و کالای بدون خرید در «بدون تامین‌کننده» می‌آید.'},
  agent:       {label:'🧑‍💼 نماینده فروش', kinds:['sl','po','ag','rt']},
  customer:    {label:'👥 مشتری', kinds:['sl','rt','cu']},
  delivery:    {label:'🚚 روش تحویل / ارسال', kinds:['sl','pl','rt']},
  pay_status:  {label:'💳 وضعیت پرداخت', kinds:['sl','pl','rt']},
  expense_category:{label:'💸 دسته هزینه', kinds:['ex']},
  return_reason:{label:'↩️ دلیل مرجوعی', kinds:['rt']},
  sale:        {label:'🧾 فاکتور فروش', kinds:['sl','rt']},
  purchase:    {label:'📥 سفارش خرید', kinds:['pl']},
  cash_type:   {label:'🏦 نوع گردش صندوق', kinds:['cl']},
};
const RB_FILTER_DIMS = ['bundle','variant','oem','product','brand','car_model','group','group_leaf','store','agent','customer','delivery','pay_status','expense_category','return_reason','weekday','cash_type','sale','purchase'];
const CASH_TYPE_FA = {purchase_payment:'پرداخت به تامین‌کننده', sale_receipt:'دریافت از مشتری', sale_refund:'بازگشت وجه مرجوعی', shipping_paid:'هزینه ارسال', agent_payout:'پرداخت پورسانت', expense:'هزینه', capital_deposit:'واریز سرمایه', capital_withdrawal:'برداشت از سرمایه', capital_adjustment:'تعدیل مغایرت‌گیری'};
const PAY_LABELS = {paid:'پرداخت‌شده', unpaid:'نسیه (پرداخت‌نشده)', partial:'پرداخت جزئی'};
function dimKeyLabel(dim, key){
  switch(dim){
    case 'product': { if(String(key).startsWith('gr:')){ const gid = String(key).slice(3); return ptgById(gid) ? '🌳 '+ptgLabel(gid)+' (قیمت گروه)' : '(گروه حذف‌شده)'; }
      if(String(key).startsWith('g:')){ const g = genericById(String(key).slice(2)); return g ? g.name+' (کالای کلی)' : '(کالای کلی حذف‌شده)'; }
      const p = productById(key); return p ? productLabel(p) : '(کالای حذف‌شده)'; }
    case 'group': { if(key==='__none') return '(بدون گروه)'; if(String(key).startsWith('p:')){ const p = productById(String(key).slice(2)); return p ? productLabel(p) : '(کالای حذف‌شده)'; } return ptgById(key) ? ptgLabel(key) : '(گروه حذف‌شده)'; }
    case 'variant': return key || '(بدون مشخصه)';
    case 'oem': return key || '(بدون کد فنی)';
    case 'bundle': { if(!key) return '(بدون باندل)'; const b = bndById(key); return b ? '🎁 '+b.name : '(باندل حذف‌شده)'; }
    case 'group_leaf': return key && ptgById(key) ? ptgLabel(key) : '(بدون گروه)';
    case 'group_l1': case 'group_l2': case 'group_l3': return key && ptgById(key) ? ptgById(key).name : '(در این سطح گروهی ندارد)';
    case 'brand': return key || '(بدون برند)';
    case 'car_model': return key || '(بدون مدل خودرو)';
    case 'category': return key || '(بدون دسته‌بندی)';
    case 'part_type': return key || '(بدون نوع قطعه)';
    case 'cash_type': return CASH_TYPE_FA[key] || key || 'سایر';
    case 'store': { if(!key) return '(بدون تامین‌کننده)'; const s = storeById(key); return s ? s.name : '(فروشگاه حذف‌شده)'; }
    case 'agent': { if(!key) return '(بدون نماینده)'; const a = agentById(key); return a ? a.name : '(نماینده حذف‌شده)'; }
    case 'customer': { if(!key) return '(مشتری متفرقه)'; if(key.startsWith('id:')){ const c = customerById(key.slice(3)); return c ? c.name : '(مشتری حذف‌شده)'; } return key.slice(2); }
    case 'delivery': return key || '(ثبت نشده)';
    case 'pay_status': return PAY_LABELS[key] || key;
    case 'expense_category': return key || 'سایر';
    case 'return_reason': return key || 'سایر';
    case 'sale': { const s = (PARTS.sales||[]).find(x=>x.id===key); return s ? ((s.invoice_no?'فاکتور #'+s.invoice_no+' · ':'')+(s.customer_name||'مشتری متفرقه')+' · '+jShort(s.date)) : '(فروش حذف‌شده)'; }
    case 'purchase': { const p = (PARTS.purchases||[]).find(x=>x.id===key); if(!p) return '(خرید حذف‌شده)'; const st = storeById(p.store_id); return 'سفارش'+(p.po_no?' #'+p.po_no:'')+' · '+(st?st.name:'—')+' · '+jShort(p.order_date); }
    case 'weekday': return FA_WEEKDAYS[+key] || key;
    case 'all': return 'جمع کل';
  }
  return String(key);
}

// ── Metric registry ─────────────────────────────────
// unit: money (KT) | num | pct ;  kinds: fact kinds the metric needs
// snap: "state at a moment" — evaluated on everything up to the period's end (not only inside the range)
const rbSum = (rows, f) => { let s = 0; for(const r of rows) s += (r.v[f]||0); return s; };
const rbDistinct = (rows, f) => new Set(rows.map(r=>r[f])).size;
const rbDiv = (a, b) => b ? a/b : 0;
const RB_METRICS = {};
function defM(id, group, label, unit, kinds, fn, opt){ RB_METRICS[id] = Object.assign({id, group, label, unit, kinds, fn}, opt||{}); }
const isSL = r=>r.k==='sl', isPL = r=>r.k==='pl', isRT = r=>r.k==='rt', isEX = r=>r.k==='ex';

(function(){
  const G1='💰 فروش', G2='📉 تخفیف و سود', G3='🚚 ارسال و مالیات', G4='📥 خرید', G5='📦 موجودی و انبار', G6='↩️ مرجوعی',
        G7='💸 هزینه‌ها و سرمایه', G8='🏦 صندوق و حساب', G9='🧑‍💼 نمایندگان', G10='👥 مشتریان', G11='🏬 تامین‌کنندگان و لیست قیمت', G12='📊 جمع‌بندی مالی';
  // sales
  defM('sales_count',G1,'تعداد فاکتور فروش','num',['sl'],(r)=>rbDistinct(r,'sid'),{hint:'هر فاکتور یک‌بار شمرده می‌شود'});
  defM('sale_lines',G1,'تعداد ردیف فروش','num',['sl'],(r)=>r.length);
  defM('units_sold',G1,'تعداد فروخته‌شده (خالص، پس از کسر مرجوعی)','num',['sl'],(r)=>rbSum(r,'net_qty'));
  defM('units_sold_gross',G1,'تعداد فروخته‌شده (قبل از کسر مرجوعی)','num',['sl'],(r)=>rbSum(r,'qty'));
  defM('gross_sales',G1,'فروش ناخالص (قبل از تخفیف)','money',['sl'],(r)=>rbSum(r,'gross'));
  defM('net_goods_sales',G1,'فروش خالص کالا (پس از تخفیف و مرجوعی، بدون ارسال)','money',['sl'],(r)=>rbSum(r,'item_rev'));
  defM('revenue',G1,'درآمد فروش (مطابق داشبورد)','money',['sl'],(r)=>rbSum(r,'revenue'),{hint:'فروش خالص کالا + اثر هزینه ارسال'});
  defM('invoice_total',G1,'جمع مبلغ فاکتورها (با ارسال و مالیات)','money',['sl'],(r)=>rbSum(r,'inv_total'));
  defM('amount_received',G1,'مبلغ دریافت‌شده از مشتریان','money',['sl'],(r)=>rbSum(r,'received'));
  defM('amount_outstanding',G1,'مطالبات باقی‌مانده (نسیه)','money',['sl'],(r)=>rbSum(r,'outstanding'));
  defM('avg_order_value',G1,'میانگین مبلغ هر فاکتور','money',['sl'],(r)=>rbDiv(rbSum(r,'inv_total'), rbDistinct(r,'sid')));
  defM('avg_units_per_order',G1,'میانگین تعداد کالا در هر فاکتور','num',['sl'],(r)=>rbDiv(rbSum(r,'qty'), rbDistinct(r,'sid')));
  defM('avg_sell_price',G1,'میانگین قیمت فروش هر واحد (پس از تخفیف)','money',['sl'],(r)=>rbDiv(rbSum(r,'gross')-rbSum(r,'item_disc')-rbSum(r,'inv_disc'), rbSum(r,'qty')));
  defM('active_customers',G1,'تعداد مشتریان فعال','num',['sl'],(r)=>new Set(r.map(x=>x.cust)).size);
  defM('distinct_products_sold',G1,'تعداد کالای متفاوت فروخته‌شده','num',['sl'],(r)=>rbDistinct(r,'pid'));
  defM('revenue_share',G1,'سهم از کل درآمد ٪','pct',['sl'],(r,c)=>rbDiv(rbSum(r,'revenue'), rbSum((c.base||c.pool).filter(isSL),'revenue'))*100,{hint:'نسبت به جمع همه ردیف‌های این گزارش'});
  // bundles & rewards
  const GB='🎁 باندل و جایزه خرید';
  defM('bundle_orders',GB,'تعداد فاکتورهای دارای باندل/جایزه','num',['sl'],(r)=>rbDistinct(r.filter(x=>x.v.in_bundle),'sid'));
  defM('bundle_revenue',GB,'درآمد ردیف‌های باندل و جایزه','money',['sl'],(r)=>rbSum(r,'bnd_rev'));
  defM('bundle_discount',GB,'تخفیف ثبت‌شده روی ردیف‌های باندل و جایزه','money',['sl'],(r)=>rbSum(r,'bnd_disc'),{hint:'شامل تخفیف باندل و بهای جایزه‌های رایگان؛ اگر ردیفی تخفیف دستی هم داشت، آن هم جمع می‌شود'});
  defM('reward_cost',GB,'بهای تمام‌شده‌ی جایزه‌های داده‌شده','money',['sl'],(r)=>rbSum(r,'reward_cost'));
  defM('bundle_share',GB,'سهم ردیف‌های باندل از درآمد ٪','pct',['sl'],(r)=>rbDiv(rbSum(r,'bnd_rev'), rbSum(r,'revenue'))*100);
  // discounts & profit
  defM('cogs',G2,'بهای تمام‌شده کالای فروش‌رفته','money',['sl'],(r)=>rbSum(r,'cogs'));
  defM('profit',G2,'سود ناخالص','money',['sl'],(r)=>rbSum(r,'profit'));
  defM('margin_pct',G2,'حاشیه سود ناخالص ٪ (سود ناخالص ÷ درآمد) — مارجین','pct',['sl'],(r)=>rbDiv(rbSum(r,'profit'), rbSum(r,'revenue'))*100);
  defM('markup_pct',G2,'درصد سود به بهای تمام‌شده ٪ — مارکاپ','pct',['sl'],(r)=>rbDiv(rbSum(r,'profit'), rbSum(r,'cogs'))*100);
  defM('profit_per_order',G2,'میانگین سود هر فاکتور','money',['sl'],(r)=>rbDiv(rbSum(r,'profit'), rbDistinct(r,'sid')));
  defM('profit_per_unit',G2,'میانگین سود هر واحد فروخته‌شده','money',['sl'],(r)=>rbDiv(rbSum(r,'profit'), rbSum(r,'net_qty')));
  defM('profit_share',G2,'سهم از کل سود ٪','pct',['sl'],(r,c)=>rbDiv(rbSum(r,'profit'), rbSum((c.base||c.pool).filter(isSL),'profit'))*100);
  defM('item_discount',G2,'تخفیف ردیف‌ها','money',['sl'],(r)=>rbSum(r,'item_disc'));
  defM('invoice_discount',G2,'تخفیف کل فاکتورها','money',['sl'],(r)=>rbSum(r,'inv_disc'));
  defM('discount_total',G2,'مجموع تخفیف داده‌شده','money',['sl'],(r)=>rbSum(r,'item_disc')+rbSum(r,'inv_disc'));
  defM('discount_pct',G2,'درصد تخفیف از فروش ناخالص','pct',['sl'],(r)=>rbDiv(rbSum(r,'item_disc')+rbSum(r,'inv_disc'), rbSum(r,'gross'))*100);
  defM('discounted_orders',G2,'تعداد فاکتورهای تخفیف‌دار','num',['sl'],(r)=>rbDistinct(r.filter(x=>x.v.has_disc),'sid'));
  defM('commission',G2,'پورسانت نمایندگان (محاسبه‌شده)','money',['sl'],(r)=>rbSum(r,'commission'));
  // shipping & tax
  defM('ship_charged',G3,'ارسال دریافتی از مشتری','money',['sl'],(r)=>rbSum(r,'ship_charged'));
  defM('ship_paid',G3,'ارسال پرداختی به پیک/باربری','money',['sl'],(r)=>rbSum(r,'ship_paid'));
  defM('ship_absorbed',G3,'ارسال به‌عهده‌ی کسب‌وکار (ضرر ارسال)','money',['sl'],(r)=>-rbSum(r,'ship_eff'));
  defM('shipped_orders',G3,'تعداد فاکتورهای دارای ارسال','num',['sl'],(r)=>rbDistinct(r.filter(x=>x.v.has_ship),'sid'));
  defM('pickup_orders',G3,'تعداد فاکتورهای تحویل حضوری','num',['sl'],(r)=>rbDistinct(r.filter(x=>x.v.pickup),'sid'));
  defM('avg_ship_cost',G3,'میانگین هزینه ارسال هر فاکتورِ دارای ارسال','money',['sl'],(r)=>rbDiv(rbSum(r,'ship_paid'), rbDistinct(r.filter(x=>x.v.has_ship),'sid')));
  defM('tax_collected',G3,'مالیات جمع‌آوری‌شده','money',['sl'],(r)=>rbSum(r,'tax'));
  // purchases
  defM('purchases_count',G4,'تعداد سفارش خرید','num',['pl'],(r)=>rbDistinct(r,'pur'));
  defM('purchase_lines',G4,'تعداد ردیف خرید','num',['pl'],(r)=>r.length);
  defM('units_purchased',G4,'تعداد خریداری‌شده','num',['pl'],(r)=>rbSum(r,'qty'));
  defM('purchase_spend',G4,'مبلغ خرید','money',['pl'],(r)=>rbSum(r,'spend'));
  defM('avg_buy_price',G4,'میانگین قیمت خرید هر واحد','money',['pl'],(r)=>rbDiv(rbSum(r,'spend'), rbSum(r,'qty')));
  defM('avg_purchase_value',G4,'میانگین مبلغ هر سفارش خرید','money',['pl'],(r)=>rbDiv(rbSum(r,'spend'), rbDistinct(r,'pur')));
  defM('paid_to_suppliers',G4,'پرداخت‌شده به تامین‌کنندگان','money',['pl'],(r)=>rbSum(r,'paid'));
  defM('purchase_outstanding',G4,'بدهی خرید (پرداخت‌نشده)','money',['pl'],(r)=>rbSum(r,'outstanding'));
  defM('purchase_share',G4,'سهم از کل خرید ٪','pct',['pl'],(r,c)=>rbDiv(rbSum(r,'spend'), rbSum((c.base||c.pool).filter(isPL),'spend'))*100);
  // inventory (current state)
  defM('products_count',G5,'تعداد کالا','num',['pr'],(r)=>r.length);
  defM('stock_units',G5,'موجودی فعلی (تعداد)','num',['pr'],(r)=>rbSum(r,'stock'));
  defM('stock_value',G5,'ارزش موجودی (به قیمت خرید)','money',['pr'],(r)=>rbSum(r,'value'));
  defM('avg_stock_cost',G5,'میانگین قیمت خرید موجودی','money',['pr'],(r)=>rbDiv(rbSum(r,'value'), rbSum(r,'stock')));
  defM('avg_list_price',G5,'میانگین قیمت فروش تعیین‌شده','money',['pr'],(r)=>{ const w=r.filter(x=>x.v.has_price); return rbDiv(rbSum(w,'sale_price'), w.length); });
  defM('potential_sales',G5,'ارزش بالقوه فروش موجودی','money',['pr'],(r)=>rbSum(r,'potential'));
  defM('potential_profit',G5,'سود بالقوه موجودی','money',['pr'],(r)=>rbSum(r,'pot_profit'));
  defM('potential_margin',G5,'حاشیه سود بالقوه‌ی موجودی ٪','pct',['pr'],(r)=>rbDiv(rbSum(r,'pot_profit'), rbSum(r,'potential'))*100);
  defM('low_stock_count',G5,'تعداد کالای کم‌موجودی','num',['pr'],(r)=>rbSum(r,'low'));
  defM('out_of_stock_count',G5,'تعداد کالای ناموجود','num',['pr'],(r)=>rbSum(r,'out'));
  defM('reorder_point_avg',G5,'میانگین نقطه سفارش مجدد','num',['pr'],(r)=>{ const w=r.filter(x=>x.v.reorder!==null); return rbDiv(rbSum(w,'reorder'), w.length); });
  defM('stock_in',G5,'ورودی به انبار (خرید + مرجوعیِ واردشده به انبار)','num',['pl','rt'],(r)=>rbSum(r.filter(isPL),'qty')+rbSum(r.filter(isRT),'restock'));
  defM('stock_out',G5,'خروجی از انبار (فروش)','num',['sl'],(r)=>rbSum(r,'qty'));
  defM('stock_change',G5,'تغییر خالص موجودی (ورودی − خروجی)','num',['pl','sl','rt'],(r)=>rbSum(r.filter(isPL),'qty')+rbSum(r.filter(isRT),'restock')-rbSum(r.filter(isSL),'qty'));
  defM('stock_at_end',G5,'موجودی انبار در پایان دوره (تعداد)','num',['pl','sl','rt'],(r)=>rbSum(r.filter(isPL),'qty')+rbSum(r.filter(isRT),'restock')-rbSum(r.filter(isSL),'qty'),{snap:true,hint:'وضعیت موجودی در پایان هر دوره، از ابتدای ثبت‌ها'});
  // returns
  defM('returns_count',G6,'تعداد مرجوعی','num',['rt'],(r)=>rbDistinct(r,'rid'));
  defM('returned_units',G6,'تعداد کالای مرجوعی','num',['rt'],(r)=>rbSum(r,'qty'));
  defM('returned_value',G6,'ارزش مرجوعی (بدون مالیات)','money',['rt'],(r)=>rbSum(r,'value'));
  defM('returned_total',G6,'مبلغ کل مرجوعی (با مالیات)','money',['rt'],(r)=>rbSum(r,'total'));
  defM('cash_refunded',G6,'مبلغ نقدی بازگردانده‌شده','money',['rt'],(r)=>rbSum(r,'cash'));
  defM('restocked_units',G6,'مرجوعیِ واردشده به انبار (تعداد)','num',['rt'],(r)=>rbSum(r,'restock'));
  defM('return_rate',G6,'نرخ مرجوعی ٪ (تعداد مرجوعی ÷ تعداد فروش)','pct',['sl','rt'],(r)=>rbDiv(rbSum(r.filter(isRT),'qty'), rbSum(r.filter(isSL),'qty'))*100);
  // expenses & capital
  defM('expenses_total',G7,'هزینه‌های جاری','money',['ex'],(r)=>rbSum(r,'amount'));
  defM('expenses_count',G7,'تعداد هزینه‌ها','num',['ex'],(r)=>rbSum(r,'is_exp'));
  defM('tax_paid',G7,'مالیات پرداخت‌شده به دارایی (تسویه)','money',['ex'],(r)=>rbSum(r,'taxpay'),{hint:'هزینه حساب نمی‌شود؛ بدهی مالیاتی را کم می‌کند'});
  defM('expenses_avg',G7,'میانگین هر هزینه','money',['ex'],(r)=>rbDiv(rbSum(r,'amount'), rbSum(r,'is_exp')));
  defM('deposits',G7,'واریز سرمایه','money',['cap'],(r)=>rbSum(r,'dep'));
  defM('withdrawals',G7,'برداشت از سرمایه','money',['cap'],(r)=>rbSum(r,'wd'));
  defM('adjustments',G7,'تعدیل مغایرت‌گیری','money',['cap'],(r)=>rbSum(r,'adj'));
  defM('net_capital_flow',G7,'خالص سرمایه (واریز − برداشت + تعدیل)','money',['cap'],(r)=>rbSum(r,'dep')-rbSum(r,'wd')+rbSum(r,'adj'));
  // cash
  defM('cash_in',G8,'ورودی نقدی (همه‌ی دریافت‌ها و واریزها)','money',['cl'],(r)=>rbSum(r,'in'));
  defM('cash_out',G8,'خروجی نقدی (همه‌ی پرداخت‌ها)','money',['cl'],(r)=>rbSum(r,'out'));
  defM('net_cash_flow',G8,'جریان خالص نقدی','money',['cl'],(r)=>rbSum(r,'amt'));
  defM('cash_balance',G8,'موجودی صندوق در پایان دوره','money',['cl'],(r)=>rbSum(r,'amt'),{snap:true,hint:'مانده‌ی حساب در پایان هر دوره'});
  defM('net_profit_after_exp',G8,'سود خالص (پس از هزینه‌ها و پورسانت)','money',['sl','ex'],(r)=>rbSum(r.filter(isSL),'profit')-rbSum(r.filter(isEX),'amount')-rbSum(r.filter(isSL),'commission'));
  // agents
  defM('payouts_total',G9,'پورسانت پرداخت‌شده به نمایندگان','money',['po'],(r)=>rbSum(r,'amount'));
  defM('payouts_count',G9,'تعداد پرداخت پورسانت','num',['po'],(r)=>r.length);
  defM('agents_count',G9,'تعداد نمایندگان','num',['ag'],(r)=>r.length);
  defM('agent_pct',G9,'درصد پورسانت پیش‌فرض نماینده','pct',['ag'],(r)=>{ const w=r.filter(x=>x.v.pct!==null); return rbDiv(rbSum(w,'pct'), w.length); });
  defM('agent_accrued_total',G9,'کل پورسانت محاسبه‌شده (از ابتدا)','money',['ag'],(r)=>rbSum(r,'accrued'));
  defM('agent_paid_total',G9,'کل پورسانت پرداخت‌شده (از ابتدا)','money',['ag'],(r)=>rbSum(r,'paid'));
  defM('agent_payable',G9,'پورسانت باقی‌مانده برای پرداخت','money',['ag'],(r)=>rbSum(r,'payable'));
  defM('agent_orders',G9,'تعداد فاکتورهای ثبت‌شده با نماینده','num',['sl'],(r)=>rbDistinct(r.filter(x=>x.v.has_agent),'sid'));
  // customers
  defM('customers_count',G10,'تعداد مشتریان ثبت‌شده','num',['cu'],(r)=>r.length);
  defM('customer_outstanding',G10,'بدهی مشتریان (مانده)','money',['cu'],(r)=>rbSum(r,'outstanding'));
  // stores & price lists
  defM('stores_count',G11,'تعداد تامین‌کنندگان','num',['st'],(r)=>r.length);
  defM('store_payable',G11,'بدهی به تامین‌کننده','money',['st'],(r)=>rbSum(r,'payable'));
  defM('store_ship_cost',G11,'هزینه ارسال ثبت‌شده‌ی تامین‌کننده','money',['st'],(r)=>rbSum(r,'ship'));
  defM('store_free_min',G11,'حداقل خرید برای ارسال رایگان','money',['st'],(r)=>rbSum(r,'free_min'));
  defM('pe_count',G11,'تعداد قیمت‌های ثبت‌شده در لیست قیمت','num',['pe'],(r)=>r.length);
  defM('pe_avg',G11,'میانگین قیمت لیست‌شده','money',['pe'],(r)=>rbDiv(rbSum(r,'price'), r.length));
  defM('pe_min',G11,'کمترین قیمت لیست‌شده','money',['pe'],(r)=>r.length ? Math.min.apply(null, r.map(x=>x.v.price)) : 0);
  defM('pe_max',G11,'بیشترین قیمت لیست‌شده','money',['pe'],(r)=>r.length ? Math.max.apply(null, r.map(x=>x.v.price)) : 0);
  defM('pe_last',G11,'آخرین قیمت لیست‌شده','money',['pe'],(r)=>{ if(!r.length) return 0; let b = r[0]; for(const x of r) if((x.date||'') >= (b.date||'')) b = x; return b.v.price; });
  // overall (all-time snapshot)
  defM('tot_ar',G12,'کل مطالبات از مشتریان (تا امروز)','money',['tot'],(r)=>rbSum(r,'ar'));
  defM('tot_ap',G12,'کل بدهی به تامین‌کنندگان (تا امروز)','money',['tot'],(r)=>rbSum(r,'ap'));
  defM('tot_comm',G12,'کل پورسانت پرداخت‌نشده (تا امروز)','money',['tot'],(r)=>rbSum(r,'comm_payable'));
  defM('tot_tax',G12,'مالیات بر ارزش افزوده‌ی پرداخت‌نشده (تا امروز)','money',['tot'],(r)=>rbSum(r,'tax_payable'));
  defM('tot_oversold',G12,'بهای تخمینی فروش بدون موجودی (تا امروز)','money',['tot'],(r)=>rbSum(r,'oversold'),{hint:'اگر صفر نیست، فاکتور خرید ثبت‌نشده داری'});
  defM('tot_biz',G12,'حقوق صاحبان سرمایه (ارزش خالص دفتری) (تا امروز)','money',['tot'],(r)=>rbSum(r,'biz'));
  defM('tot_capital',G12,'خالص سرمایه‌ی واردشده (تا امروز)','money',['tot'],(r)=>rbSum(r,'net_capital'));
})();

function rbFmt(unit, v){
  if(v===null || v===undefined || !isFinite(v)) return NO_VALUE;
  if(unit==='money') return fmtT(v);
  if(unit==='pct') return fmtNum(v)+'٪';
  return fmtNum(v);
}

// ── State ───────────────────────────────────────────
let RB = rbDefaults();
let rbFacts = null, rbReady = false, rbChartInstance = null;
const RB_LS_KEY = 'elevate_rb_last_v2';
const RB_DEFAULT_METRICS = {
  time:['revenue','profit'], weekday:['sales_count','revenue'], all:['revenue','profit','net_profit_after_exp'],
  product:['units_sold','revenue','profit','stock_units'], brand:['units_sold','revenue','profit','stock_value'],
  bundle:['bundle_orders','bundle_revenue','profit'], variant:['units_sold','revenue','profit'], oem:['units_sold','revenue','profit'],
  car_model:['units_sold','revenue','profit'], part_type:['units_sold','revenue','profit'], category:['units_sold','revenue','profit'],
  store:['purchase_spend','purchases_count'], agent:['revenue','profit','commission'], customer:['sales_count','revenue','profit'],
  delivery:['sales_count','revenue'], pay_status:['sales_count','invoice_total'], expense_category:['expenses_total','expenses_count'],
  return_reason:['returns_count','returned_total'], sale:['revenue','profit'], purchase:['purchase_spend'],
};
const RB_VIEWS = {
  table:'📋 جدول', matrix:'🔲 جدول متقاطع (سطر × ستون)', bar:'📊 نمودار میله‌ای', line:'📈 نمودار خطی', pie:'🥧 نمودار دایره‌ای (متغیر اول)', number:'🔢 عدد کل', calendar:'🗓️ تقویمی (روزانه)'
};
function rbSave(){ try{ const c = Object.assign({}, RB); localStorage.setItem(RB_LS_KEY, JSON.stringify(c)); }catch(e){} }
function rbLoadLast(){
  try{
    const raw = localStorage.getItem(RB_LS_KEY);
    if(raw){ const c = JSON.parse(raw); if(c && RB_DIMS[c.dim]) RB = Object.assign(rbDefaults(), c); }
  }catch(e){}
}

// ── Date ranges ─────────────────────────────────────
function rbRangeFor(chip){
  const t = isoToday(), tj = isoToJ(t);
  switch(chip){
    case 'this_month': return {from:jToIso(tj.y,tj.m,1), to:jToIso(tj.y,tj.m,jMonthLen(tj.y,tj.m))};
    case 'last_month': { let y = tj.y, m = tj.m-1; if(m<1){ m = 12; y--; } return {from:jToIso(y,m,1), to:jToIso(y,m,jMonthLen(y,m))}; }
    case 'last30': return {from:isoAdd(t,-29), to:t};
    case 'last90': return {from:isoAdd(t,-89), to:t};
    case 'this_season': { const q = Math.floor((tj.m-1)/3); const sm = q*3+1, em = q*3+3; return {from:jToIso(tj.y,sm,1), to:jToIso(tj.y,em,jMonthLen(tj.y,em))}; }
    case 'this_year': return {from:jToIso(tj.y,1,1), to:jToIso(tj.y,12,jMonthLen(tj.y,12))};
    default: return {from:'', to:''};
  }
}
const RB_RANGE_CHIPS = [['all','همه‌ی زمان‌ها'],['this_month','این ماه'],['last_month','ماه گذشته'],['last30','۳۰ روز اخیر'],['last90','۹۰ روز اخیر'],['this_season','این فصل'],['this_year','امسال']];
function rbRenderRangeChips(){
  const el = document.getElementById('rbRangeChips'); if(!el) return;
  el.innerHTML = RB_RANGE_CHIPS.map(([id,l])=>`<button type="button" class="parts-range-chip${RB.rangeChip===id?' active':''}" onclick="rbPickRange('${id}')">${l}</button>`).join('');
}
function rbPickRange(id){
  const r = rbRangeFor(id);
  RB.rangeChip = id; RB.from = r.from; RB.to = r.to;
  rbWriteControls(); rbRender();
}
function rbOnDateInput(){
  const f = document.getElementById('rbFrom'), t = document.getElementById('rbTo');
  const pf = parseDateInput(f.value), pt = parseDateInput(t.value);
  if(pf===null || pt===null){
    showToast('تاریخ را مثل ۱۴۰۵/۰۷/۰۱ وارد کن','error');
    f.value = RB.from ? jShort(RB.from) : ''; t.value = RB.to ? jShort(RB.to) : '';
    return;
  }
  if(pf && pt && pf > pt){ showToast('تاریخ شروع باید قبل از تاریخ پایان باشد','error'); f.value = RB.from ? jShort(RB.from) : ''; t.value = RB.to ? jShort(RB.to) : ''; return; }
  RB.from = pf; RB.to = pt; RB.rangeChip = (!pf && !pt) ? 'all' : 'custom';
  rbWriteControls(); rbRender();
}

// ── Periods (time dimension) ────────────────────────
const RB_MAX_PERIODS = 1200;
function rbBuildPeriods(grain, from, to, cfg){
  cfg = cfg || RB;
  const out = []; let truncated = false;
  const push = (key, label, start, end)=>{ if(out.length >= RB_MAX_PERIODS){ truncated = true; return false; } out.push({key, label, start, end}); return true; };
  if(grain==='day'){
    for(let d=from; d<=to; d=isoAdd(d,1)) if(!push(d, jLabel(d)+' ('+FA_WEEKDAYS[isoWeekdaySat(d)]+')', d, d)) break;
  } else if(grain==='week'){
    let s = isoAdd(from, -isoWeekdaySat(from));
    for(; s<=to; s=isoAdd(s,7)){ const e = isoAdd(s,6); if(!push(s, jShort(s)+' تا '+jShort(e), s, e)) break; }
  } else if(grain==='month' || grain==='quarter' || grain==='year'){
    let j = isoToJ(from);
    let y = j.y, m = grain==='month' ? j.m : (grain==='quarter' ? Math.floor((j.m-1)/3)*3+1 : 1);
    const step = grain==='month' ? 1 : (grain==='quarter' ? 3 : 12);
    for(;;){
      const s = jToIso(y,m,1);
      if(s > to) break;
      const em = m + step - 1;
      const e = jToIso(y, em, jMonthLen(y, em));
      const label = grain==='month' ? FA_MONTHS[m-1]+' '+y : (grain==='quarter' ? FA_SEASONS[(m-1)/3]+' '+y : 'سال '+y);
      if(!push(s, label, s, e)) break;
      m += step; if(m > 12){ m = 1; y++; }
    }
  } else if(grain==='ndays'){
    const n = cfg.ndays;
    for(let s=from; s<=to; s=isoAdd(s,n)){ const e = isoAdd(s,n-1); if(!push(s, jShort(s)+' تا '+jShort(e), s, e)) break; }
  } else if(grain==='custom'){
    let list = (PARTS.report_ranges||[]);
    if(cfg.customIds.length) list = list.filter(r=>cfg.customIds.includes(r.id));
    list.slice().sort((a,b)=>a.from.localeCompare(b.from)).forEach(r=>push(r.id, r.name+' ('+jShort(r.from)+' تا '+jShort(r.to)+')', r.from, r.to));
  }
  return {periods:out, truncated};
}

// ── Compute ─────────────────────────────────────────
function rbDimKeys(f, dim){ const a = f.d[dim]; return Array.isArray(a) ? a : null; }
function rbEval(m, rows, ctx){
  const need = new Set(m.kinds);
  const r = rows.filter(x=>need.has(x.k));
  try{ const v = m.fn(r, ctx); return isFinite(v) ? v : 0; }catch(e){ console.warn('[rb] metric failed', m.id, e); return 0; }
}

// ── Rendering ───────────────────────────────────────
const RB_PALETTE = ['#e85d3a','#3a7a5a','#2a6a9a','#d4821a','#7a3a6a','#c44a6a','#5a9a7a','#f07a5c','#6b7a8f','#9a8a2a'];
function rbDimLabelPlain(dim){ return RB_DIMS[dim].label.replace(/^[^؀-ۿ\w]+\s*/,''); }
function rbTitle(res){
  const names = res.metrics.map(m=>m.label).join('، ');
  return `${names} — به تفکیک ${rbDimLabelPlain(res.dim)}`;
}
function rbPeriodNote(res){
  const e = res.eff;
  return `بازه‌ی گزارش: ${jLabel(e.from)} تا ${jLabel(e.to)}` + (res.cfg.cumulative && res.dim==='time' ? ' · حالت تجمیعی فعال است' : '');
}

// ── Calendar view ───────────────────────────────────
function rbRenderCalendar(res){
  const host = document.getElementById('rbCalHost'); if(!host) return;
  const byDate = {}; res.rows.forEach(r=>byDate[r.start] = r);
  const first = isoToJ(res.eff.from), last = isoToJ(res.eff.to);
  const months = [];
  for(let y=first.y, m=first.m; y<last.y || (y===last.y && m<=last.m); ){ months.push({y,m}); m++; if(m>12){ m=1; y++; } if(months.length>240) break; }
  let cur = RB.calMonth && months.some(x=>x.y===RB.calMonth.y && x.m===RB.calMonth.m) ? RB.calMonth : months[months.length-1];
  if(!cur) cur = months[0];
  RB.calMonth = cur;
  const mi = months.findIndex(x=>x.y===cur.y && x.m===cur.m);
  const L = jMonthLen(cur.y, cur.m);
  const startIso = jToIso(cur.y, cur.m, 1), endIso = jToIso(cur.y, cur.m, L);
  const metrics = res.metrics, cum = !!res.cfg.cumulative;
  const w0 = isoWeekdaySat(startIso);
  // intensity scale from the first metric across this month
  let maxAbs = 0;
  for(let d=1; d<=L; d++){ const r = byDate[jToIso(cur.y,cur.m,d)]; if(r) maxAbs = Math.max(maxAbs, Math.abs(r.vals[0])); }
  const today = isoToday();
  const cell = (d)=>{
    const iso = jToIso(cur.y, cur.m, d), r = byDate[iso];
    const g = iso.split('-');
    const inRng = iso >= res.eff.from && iso <= res.eff.to;
    if(!r || !inRng) return `<div class="rb-cal-day outside"><div class="rb-cal-dnum"><b>${faDigits(d)}</b><span>${+g[1]}/${+g[2]}</span></div></div>`;
    const v0 = r.vals[0];
    const inten = maxAbs > 0 ? Math.min(Math.abs(v0)/maxAbs, 1) : 0;
    const vals = metrics.slice(0,4).map((m,i)=>`<div class="rb-cal-val${Math.abs(r.vals[i])<1e-9?' zero':''}">${rbFmt(m.unit, r.vals[i]).replace(/[\u2066\u2067\u2069]| KT/g,'')}${metrics.length>1?`<small>${escHtml(rbShortLabel(m.label))}</small>`:''}</div>`).join('');
    return `<div class="rb-cal-day${v0<0?' neg':''}${iso===today?' today':''}" style="--i:${inten.toFixed(3)}" title="${escHtml(jLabel(iso))}"><div class="rb-cal-dnum"><b>${faDigits(d)}</b><span>${+g[1]}/${+g[2]}</span></div>${vals}</div>`;
  };
  let grid = FA_WEEKDAYS.map(n=>`<div class="rb-cal-head">${n}</div>`).join('') + `<div class="rb-cal-head">جمع هفته</div>`;
  let d = 1 - w0;
  while(d <= L){
    let wkStart = null, wkEnd = null;
    for(let c=0; c<7; c++, d++){
      if(d < 1 || d > L){ grid += `<div class="rb-cal-day empty"></div>`; continue; }
      const iso = jToIso(cur.y, cur.m, d);
      if(!wkStart) wkStart = iso; wkEnd = iso;
      grid += cell(d);
    }
    if(wkStart){
      const a = wkStart < res.eff.from ? res.eff.from : wkStart, b = wkEnd > res.eff.to ? res.eff.to : wkEnd;
      let txt = '<b>—</b>';
      if(a <= b){
        const vals = res.rangeVals(a, b, cum);
        txt = metrics.slice(0,4).map((m,i)=>`<div class="rb-cal-val">${rbFmt(m.unit, vals[i]).replace(/[\u2066\u2067\u2069]| KT/g,'')}${metrics.length>1?`<small>${escHtml(rbShortLabel(m.label))}</small>`:''}</div>`).join('');
      }
      grid += `<div class="rb-cal-week"><b>${cum?'تا پایان هفته':'هفته'}</b>${txt}</div>`;
    } else grid += `<div class="rb-cal-week"></div>`;
  }
  const a = startIso < res.eff.from ? res.eff.from : startIso, b = endIso > res.eff.to ? res.eff.to : endIso;
  const mv = a <= b ? res.rangeVals(a, b, cum) : metrics.map(()=>0);
  const kp = `<div class="rb-kpis">${metrics.map((m,i)=>`<div class="parts-kpi-card" style="--kpi-color:${RB_PALETTE[i%RB_PALETTE.length]};"><div class="parts-kpi-label">${escHtml(m.label)} — ${cum?'تا پایان '+FA_MONTHS[cur.m-1]:'جمع '+FA_MONTHS[cur.m-1]}</div><div class="parts-kpi-val" style="color:${RB_PALETTE[i%RB_PALETTE.length]};">${rbFmt(m.unit, mv[i])}</div></div>`).join('')}</div>`;
  const monthOpts = months.map(x=>`<option value="${x.y}-${x.m}"${x.y===cur.y&&x.m===cur.m?' selected':''}>${FA_MONTHS[x.m-1]} ${x.y}</option>`).join('');
  host.innerHTML = `<div class="rb-cal-nav">
      <button class="parts-header-btn" type="button" onclick="rbCalGo(1)" ${mi>=months.length-1?'disabled':''}>◀ ماه بعد</button>
      <div class="rb-cal-title">${FA_MONTHS[cur.m-1]} ${cur.y} <select class="modal-input" style="width:auto;margin:0 8px;display:inline-block;" onchange="rbCalPick(this.value)">${monthOpts}</select></div>
      <button class="parts-header-btn" type="button" onclick="rbCalGo(-1)" ${mi<=0?'disabled':''}>ماه قبل ▶</button>
    </div>${kp}<div class="rb-cal-wrap"><div class="rb-cal">${grid}</div></div>
    <div class="rb-note" style="margin-top:10px;">${metrics.length>4?'در تقویم فقط ۴ متغیر اول نمایش داده می‌شود؛ بقیه در «جدول» هستند. ':''}شدت رنگ هر روز بر اساس متغیر اول است${cum?'؛ مقدار هر روز، جمع از ابتدای بازه تا همان روز است':''}.</div>`;
}
function rbShortLabel(l){ l = l.split(' (')[0]; return l.length>20 ? l.slice(0,19)+'…' : l; }
function rbCalGo(delta){
  if(!RB.calMonth) return;
  let {y,m} = RB.calMonth; m += delta; if(m>12){ m=1; y++; } if(m<1){ m=12; y--; }
  RB.calMonth = {y,m}; rbRender();
}
function rbCalPick(v){ const p = v.split('-').map(Number); RB.calMonth = {y:p[0], m:p[1]}; rbRender(); }

// ── Controls ────────────────────────────────────────

// metrics picker
function rbRenderMetricChips(){
  const el = document.getElementById('rbMetricChips'); if(!el) return;
  el.innerHTML = RB.metrics.map(id=>`<span class="rb-chip">${escHtml(RB_METRICS[id].label)}<button type="button" onclick="rbToggleMetric('${id}')" title="حذف">✕</button></span>`).join('')
    || '<span class="rb-muted">هنوز متغیری انتخاب نشده</span>';
}
function rbToggleMetricPanel(){
  const p = document.getElementById('rbMetricPanel');
  const show = p.style.display === 'none';
  p.style.display = show ? 'block' : 'none';
  if(show){ rbRenderMetricPanel(); document.getElementById('rbMetricSearch').focus(); }
}

// filters

// custom ranges
function rbRenderCustomPick(){
  const el = document.getElementById('rbCustomPick'); if(!el) return;
  const list = PARTS.report_ranges||[];
  el.innerHTML = list.map(r=>{ const on = RB.customIds.includes(r.id); return `<button type="button" class="rb-chip${on?'':' off'}" onclick="rbToggleCustom('${r.id}')">${escHtml(r.name)}</button>`; }).join('')
    + (list.length ? `<span class="rb-muted" style="align-self:center;">${RB.customIds.length?'':'(هیچ‌کدام انتخاب نشده = همه‌ی بازه‌ها)'}</span>` : '');
}
function rbToggleCustom(id){
  const i = RB.customIds.indexOf(id);
  if(i>=0) RB.customIds.splice(i,1); else RB.customIds.push(id);
  rbRenderCustomPick(); rbRender();
}
function openRbRangesModal(){ rbRenderRangesList(); document.getElementById('rbrName').value=''; document.getElementById('rbrFrom').value=''; document.getElementById('rbrTo').value=''; document.getElementById('rbRangesModalOverlay').classList.add('open'); }
function closeRbRangesModal(){ document.getElementById('rbRangesModalOverlay').classList.remove('open'); }
function rbRenderRangesList(){
  const el = document.getElementById('rbRangesList'); if(!el) return;
  const list = (PARTS.report_ranges||[]).slice().sort((a,b)=>a.from.localeCompare(b.from));
  el.innerHTML = list.map(r=>`<div class="cash-ledger-item"><div class="cash-ledger-info"><div class="cash-ledger-note"><b>${escHtml(r.name)}</b></div><div class="cash-ledger-date">${jLabel(r.from)} تا ${jLabel(r.to)}</div></div><button class="cash-ledger-del" type="button" onclick="rbDeleteRange('${r.id}')" title="حذف">✕</button></div>`).join('')
    || '<div class="parts-table-empty" style="padding:10px;">هنوز بازه‌ای تعریف نشده.</div>';
}
async function rbAddRange(){
  const name = document.getElementById('rbrName').value.trim();
  const from = parseDateInput(document.getElementById('rbrFrom').value), to = parseDateInput(document.getElementById('rbrTo').value);
  if(!name){ showToast('برای بازه یک نام بنویس','error'); return; }
  if(!from || !to){ showToast('تاریخ شروع و پایان را درست وارد کن (مثل ۱۴۰۵/۰۷/۰۱)','error'); return; }
  if(from > to){ showToast('تاریخ شروع باید قبل از تاریخ پایان باشد','error'); return; }
  const ranges = (PARTS.report_ranges||[]).concat([{id:'r'+Date.now(), name, from, to}]);
  const d = await postParts('save_report_ranges', {ranges});
  if(d && d.ok !== false){ showToast('بازه ذخیره شد'); rbRenderRangesList(); document.getElementById('rbrName').value=''; document.getElementById('rbrFrom').value=''; document.getElementById('rbrTo').value=''; rbWriteControls(); }
}
async function rbDeleteRange(id){
  if(!confirm('این بازه حذف شود؟')) return;
  RB.customIds = RB.customIds.filter(x=>x!==id);
  const d = await postParts('save_report_ranges', {ranges:(PARTS.report_ranges||[]).filter(r=>r.id!==id)});
  if(d && d.ok !== false){ rbRenderRangesList(); rbWriteControls(); rbRender(); }
}

// presets
function rbRenderPresetSelect(){
  const sel = document.getElementById('rbPresetSelect'); if(!sel) return;
  const list = PARTS.report_presets||[];
  sel.innerHTML = '<option value="">📂 گزارش‌های ذخیره‌شده…</option>' + list.map(p=>`<option value="${escHtml(p.id)}">${escHtml(p.name)}</option>`).join('');
  sel.value = list.some(p=>p.id===RB.presetId) ? RB.presetId : '';
  document.getElementById('rbDeletePresetBtn').style.display = sel.value ? '' : 'none';
}
function rbConfigSnapshot(){ const c = JSON.parse(JSON.stringify(RB)); delete c.calMonth; delete c.presetId; return c; }
function rbLoadPreset(id){
  const p = (PARTS.report_presets||[]).find(x=>x.id===id);
  if(!p){ RB.presetId = ''; rbRenderPresetSelect(); return; }
  RB = Object.assign(rbDefaults(), JSON.parse(JSON.stringify(p.config)), {presetId:id, calMonth:null});
  if(RB.rangeChip && !['custom','all'].includes(RB.rangeChip)){ const r = rbRangeFor(RB.rangeChip); RB.from = r.from; RB.to = r.to; }
  rbWriteControls(); rbRender();
}
function rbClosePresetModal(){ document.getElementById('rbPresetModalOverlay').classList.remove('open'); }
function rbOpenPresetModal(pin){
  const cur = (PARTS.report_presets||[]).find(p=>p.id===RB.presetId);
  let name = cur ? cur.name : '';
  if(!name && pin===true){ try{ const r = rbCompute(); name = r.metrics.map(m=>m.label.split(' (')[0]).slice(0,2).join(' و ') + ' به تفکیک ' + rbDimLabelPlain(r.dim) + (r.cfg.dim2 ? ' ‹ '+rbDimLabelPlain(r.cfg.dim2) : ''); }catch(e){} }
  document.getElementById('rbPresetName').value = name;
  const chk = document.getElementById('rbPresetPin');
  const pinned = cur && (PARTS.dashboard_widgets||[]).some(w=>w.preset_id===cur.id);
  chk.checked = pin===true || !!pinned; chk.disabled = !!pinned;
  document.getElementById('rbPresetPinNote').textContent = pinned ? '(این گزارش همین الان روی داشبورد هست)' : '';
  document.getElementById('rbPresetModalOverlay').classList.add('open');
  setTimeout(()=>document.getElementById('rbPresetName').focus(), 50);
}
async function rbSavePreset(){
  const name = document.getElementById('rbPresetName').value.trim();
  if(!name){ showToast('برای گزارش یک نام بنویس','error'); return; }
  const wantPin = document.getElementById('rbPresetPin').checked;
  rbReadControls(); rbSanitize();
  const list = (PARTS.report_presets||[]).slice();
  let ex = list.find(p=>p.name===name);
  if(!ex && RB.presetId){ const cur = list.find(p=>p.id===RB.presetId); if(cur && cur.name===name) ex = cur; }
  let id;
  if(ex){ ex.config = rbConfigSnapshot(); id = ex.id; }
  else { id = 'p'+Date.now(); list.push({id, name, config:rbConfigSnapshot()}); }
  const d = await postParts('save_report_presets', {presets:list});
  if(!(d && d.ok !== false)) return;
  RB.presetId = id;
  let msg = 'گزارش ذخیره شد';
  if(wantPin && !(PARTS.dashboard_widgets||[]).some(w=>w.preset_id===id)){
    const d2 = await dwSave(dwList().concat([{id:'w'+Date.now(), preset_id:id, title:'', size:'m'}]));
    if(d2 && d2.ok !== false) msg = 'ذخیره شد و روی داشبورد گزارشات سنجاق شد 📌';
  }
  rbClosePresetModal(); rbRenderPresetSelect(); showToast(msg);
}
async function rbDeletePreset(){
  const p = (PARTS.report_presets||[]).find(x=>x.id===RB.presetId); if(!p) return;
  if(!confirm('گزارش «'+p.name+'» حذف شود؟')) return;
  const d = await postParts('save_report_presets', {presets:(PARTS.report_presets||[]).filter(x=>x.id!==p.id)});
  if(d && d.ok !== false){ RB.presetId = ''; rbRenderPresetSelect(); showToast('گزارش حذف شد'); }
}
function rbReset(){ RB = rbDefaults(); rbWriteControls(); rbRender(); }


// ══════════════════════════════════════════════════════════════════
//  گزارش‌ساز نسخه‌ی ۳ — متغیر × (شرط‌ها) × (گروه‌بندی تا دو سطح) × شرط روی نتیجه
// ══════════════════════════════════════════════════════════════════
function rbViewsFor(dim, dim2){
  if(dim2) return ['table','matrix','bar','line','pie','number'];
  return dim==='time' ? ['table','bar','line','calendar','number','pie'] : (dim==='all' ? ['table','number'] : ['table','bar','line','pie','number']);
}
function rbMetricsFor(dim, dim2){
  const k1 = new Set(RB_DIMS[dim].kinds), k2 = (dim2 && RB_DIMS[dim2]) ? new Set(RB_DIMS[dim2].kinds) : null;
  return Object.values(RB_METRICS).filter(m=>m.kinds.every(k=>k1.has(k) && (!k2 || k2.has(k))));
}
// is this grouping/condition dimension usable with ALL the chosen metrics?
function rbDimOk(dim, metricIds){
  const D = RB_DIMS[dim]; if(!D) return false;
  return (metricIds||[]).every(id=>{ const m = RB_METRICS[id]; return m && m.kinds.every(k=>D.kinds.includes(k)); });
}
// split a set of facts by a second dimension → child rows
function rbAttachChildren(res, cfg){
  const d2 = cfg.dim2; if(!d2) return;
  res.rows.forEach(r=>{ r.children = rbPolishKids(rbSplit(r._f||[], r._s||[], d2, cfg, res, res.eff.to), d2, cfg, res); });
  // matrix columns: union of child keys, ordered by overall size (or time)
  const colTot = rbPolishKids(rbSplit(res._tf||[], res._ts||[], d2, cfg, res, res.eff.to), d2, cfg, res);
  const used = new Set(); res.rows.forEach(r=>r.children.forEach(k=>used.add(k.key)));
  res.cols = colTot.filter(c=>used.has(c.key));
  res._colTot = {}; res.cols.forEach(c=>res._colTot[c.key] = c);
}

// ── labels with photos ──
function rbKeyCell(dim, key, label){
  const k = String(key);
  if(dim==='product' && !k.startsWith('g:') && productById(k)) return prodCell(k);
  if(dim==='group' && k.startsWith('p:') && productById(k.slice(2))) return prodCell(k.slice(2));
  if(dim==='store' && storeById(k)) return storeCell(k);
  if(dim==='agent' && k && agentById(k)) return agentCell(k);
  return escHtml(label);
}
function rbLabelCell(dim, r){ return rbKeyCell(dim, r.key, r.label); }

// ── Table (flat or nested) ──
function rbValCell(res, m, i, v, ri, ck, opts, bold){
  const t = rbFmt(m.unit, v), x = (opts && opts.widget) ? '' : ' '+xBtn('rb_cell', ck===undefined ? {mi:i, ri} : {mi:i, ri, ck}, 'xi-mini');
  return `<td>${bold?'<b>'+t+'</b>':t}${x}</td>`;
}
const RB_ATTR_DIMS = ['group_leaf','brand','car_model','store','agent','customer','product','delivery','pay_status','expense_category','return_reason'];
function rbAttrColsOk(c){ return !!c.dim && !['time','all','weekday','group'].includes(c.dim) && !c.dim2; }
function rbCleanAttrCols(c){
  if(!rbAttrColsOk(c)) return [];
  return (c.attrCols||[]).filter((d,i,a)=>RB_ATTR_DIMS.includes(d) && d!==c.dim && RB_DIMS[d] && a.indexOf(d)===i).slice(0, 6);
}
// row key → attribute keys seen together with it in the raw facts (ordered by frequency)
function rbAttrIndex(rowDim, attrDim){
  if(!rbFacts) rbFacts = buildFacts();
  rbFacts._ai = rbFacts._ai || {};
  const ck = rowDim+'|'+attrDim; if(rbFacts._ai[ck]) return rbFacts._ai[ck];
  const idx = new Map();
  rbFacts.forEach(f=>{
    const rk = rbDimKeys(f, rowDim), ak = rbDimKeys(f, attrDim); if(!rk || !ak) return;
    rk.forEach(r=>{ const rr = String(r); let m = idx.get(rr); if(!m){ m = new Map(); idx.set(rr, m); } ak.forEach(a=>{ const aa = String(a); if(aa==='' || aa==='__none') return; m.set(aa, (m.get(aa)||0)+1); }); });
  });
  const out = new Map(); idx.forEach((m,k)=>out.set(k, [...m.entries()].sort((a,b)=>b[1]-a[1]).map(x=>x[0])));
  rbFacts._ai[ck] = out; return out;
}
function rbAttrCell(rowDim, key, attrDim, opts){
  const list = rbAttrIndex(rowDim, attrDim).get(String(key)) || [];
  if(!list.length) return '<td class="rb-attr"><span class="rb-muted">—</span></td>';
  const max = (opts && opts.widget) ? 2 : 3;
  const chips = list.slice(0, max).map(k=>`<span class="rb-attr-chip">${rbKeyCell(attrDim, k, dimKeyLabel(attrDim, k))}</span>`).join('');
  return `<td class="rb-attr">${chips}${list.length>max ? `<span class="rb-attr-more" title="${escHtml(list.slice(max).map(k=>dimKeyLabel(attrDim,k)).join('، '))}">+${fx(list.length-max)}</span>` : ''}</td>`;
}
function rbTableHtml(res, hidden, opts){
  opts = opts || {};
  const nested = !!res.cfg.dim2;
  const ac = nested ? [] : (res.cfg.attrCols||[]);
  const head = `<th>${escHtml(rbDimLabelPlain(res.dim))}${nested?' ‹ '+escHtml(rbDimLabelPlain(res.cfg.dim2)):''}</th>` + ac.map(d=>`<th class="rb-attr-h">${escHtml(rbDimLabelPlain(d))}</th>`).join('') + res.metrics.map(m=>`<th>${opts.widget ? escHtml(m.label) : rbMetricHead(m)}</th>`).join('');
  const maxRows = opts.maxRows || 0;
  const rows = maxRows ? res.rows.slice(0, maxRows) : res.rows;
  let body = '';
  const tree = res.dim==='group' && res.cfg.sort==='natural' && !nested, hasKid = new Set(res.rows.map(r=>r.parent));
  rows.forEach((r,ri)=>{
    const trAttr = tree ? ` data-k="${escHtml(r.key)}" data-anc="${escHtml(ptgAncestorKeys(r.key).join(' '))}"` : '';
    const lab = tree ? `<td class="pg-cell" style="padding-inline-start:${(r.depth-1)*20+8}px">${hasKid.has(r.key) ? '<button class="pg-tg" type="button" onclick="ptgRowToggle(this)">▾</button>' : '<span class="pg-tg"></span>'}${r.isProd ? rbKeyCell('group', r.key, r.label) : '📁 <b>'+escHtml(r.key==='__none' ? '(بدون گروه)' : ((ptgById(r.key)||{}).name || r.label))+'</b>'}</td>` : `<td>${rbLabelCell(res.dim, r)}</td>`;
    body += `<tr class="${nested?'rb-parent':''}${tree?(' pg-'+(r.isProd?'p':'g')+' d'+r.depth):''}"${trAttr}>${lab}${ac.map(d=>rbAttrCell(res.dim, r.key, d, opts)).join('')}${r.vals.map((v,i)=>rbValCell(res, res.metrics[i], i, v, ri, undefined, opts, nested)).join('')}</tr>`;
    if(nested) (r.children||[]).forEach(k=>{
      body += `<tr class="rb-child"><td><span class="rb-indent">↳</span> ${rbKeyCell(res.cfg.dim2, k.key, k.label)}</td>${k.vals.map((v,i)=>rbValCell(res, res.metrics[i], i, v, ri, k.key, opts, false)).join('')}</tr>`;
    });
  });
  if(!body) body = `<tr><td colspan="${res.metrics.length+1+ac.length}" class="parts-table-empty">داده‌ای در این بازه نیست.</td></tr>`;
  if(maxRows && res.rows.length > maxRows) body += `<tr><td colspan="${res.metrics.length+1+ac.length}" class="parts-table-empty">… و ${fx(res.rows.length-maxRows)} ردیف دیگر (برای دیدن همه، گزارش را در گزارش‌ساز باز کن)</td></tr>`;
  const foot = (res.dim==='all' || !res.rows.length) ? '' : `<tfoot><tr><td><b>${res.cfg.cumulative && res.dim==='time' ? 'مقدار نهایی (پایان بازه)' : 'جمع کل'}</b></td>${ac.map(()=>'<td></td>').join('')}${res.total.map((v,i)=>rbValCell(res, res.metrics[i], i, v, -1, undefined, opts, true)).join('')}</tr></tfoot>`;
  const bar = (tree && !opts.widget) ? '<div class="pg-bar"><button type="button" class="parts-header-btn" onclick="ptgCollapseAll(true)">▸ بستن همه‌ی گروه‌ها</button><button type="button" class="parts-header-btn" onclick="ptgCollapseAll(false)">▾ باز کردن همه</button></div>' : '';
  return `${bar}<div class="inv-scroll"><table class="parts-table rb-table${nested?' rb-nested':''}"${opts.widget?'':' id="rbTable"'}${hidden?' style="display:none;"':''}><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table></div>`;
}
// ── Matrix / cross-tab (first metric × two dimensions) ──
function rbMatrixHtml(res, opts){
  opts = opts || {};
  const m = res.metrics[0], d2 = res.cfg.dim2, cols = res.cols || [];
  if(!d2 || !cols.length) return '<div class="parts-table-empty">داده‌ای برای جدول متقاطع نیست.</div>';
  const x = (ri, ck)=> opts.widget ? '' : ' '+xBtn('rb_cell', {mi:0, ri, ck}, 'xi-mini');
  const head = `<th>${escHtml(rbDimLabelPlain(res.dim))} ╲ ${escHtml(rbDimLabelPlain(d2))}</th>` + cols.map(c=>`<th>${rbKeyCell(d2, c.key, c.label)}</th>`).join('') + '<th>جمع</th>';
  const maxRows = opts.maxRows || 0, rows = maxRows ? res.rows.slice(0, maxRows) : res.rows;
  const body = rows.map((r,ri)=>`<tr><td>${rbLabelCell(res.dim, r)}</td>${cols.map(c=>{ const k = (r.children||[]).find(z=>z.key===c.key); return `<td>${k ? rbFmt(m.unit, k.vals[0])+x(ri, c.key) : '—'}</td>`; }).join('')}<td><b>${rbFmt(m.unit, r.vals[0])}</b>${x(ri, undefined).replace('{"mi":0,"ri":'+ri+'}','{"mi":0,"ri":'+ri+'}')}</td></tr>`).join('');
  const foot = `<tfoot><tr><td><b>جمع کل</b></td>${cols.map(c=>`<td><b>${rbFmt(m.unit, c.vals[0])}</b>${opts.widget?'':' '+xBtn('rb_cell',{mi:0, ri:-1, ck:c.key},'xi-mini')}</td>`).join('')}<td><b>${rbFmt(m.unit, res.total[0])}</b></td></tr></tfoot>`;
  return `<div class="rb-note" style="margin:4px 0;">جدول متقاطع برای متغیر: <b>${escHtml(m.label)}</b>${res.metrics.length>1?' (فقط متغیر اول)':''}</div><div class="inv-scroll"><table class="parts-table rb-table" ${opts.widget?'':'id="rbTable"'}><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table></div>`;
}
function rbKpiHtml(res, opts){
  opts = opts || {};
  return `<div class="rb-kpis">${res.metrics.map((m,i)=>`<div class="parts-kpi-card" style="--kpi-color:${RB_PALETTE[i%RB_PALETTE.length]};"><div class="parts-kpi-label">${opts.widget ? escHtml(m.label) : rbMetricHead(m)}</div><div class="parts-kpi-val" style="color:${RB_PALETTE[i%RB_PALETTE.length]};">${rbFmt(m.unit, res.total[i])}</div>${opts.widget?'':xBtn('rb_cell',{mi:i,ri:-1},'xi-corner')}</div>`).join('')}</div>`;
}
// ── Charts (single level: one series per metric; two levels: one series per second-dimension value) ──
function rbChart(canvas, res, view){
  if(typeof Chart === 'undefined') return null;
  const common = {responsive:true, maintainAspectRatio:false};
  const labels = res.rows.map(r=>r.label), d2 = res.cfg.dim2;
  const clean = v=>String(v).replace(/[\u2066\u2067\u2069]| KT/g,'');
  if(view==='pie'){
    const m = res.metrics[0], idx = res.rows.map((r,i)=>i).filter(i=>res.rows[i].vals[0] > 0);
    if(!idx.length) return null;
    return new Chart(canvas, {type:'doughnut', data:{labels:idx.map(i=>labels[i]), datasets:[{data:idx.map(i=>res.rows[i].vals[0]), backgroundColor:idx.map((_,j)=>RB_PALETTE[j%RB_PALETTE.length])}]},
      options:Object.assign({}, common, {plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:11}}}, tooltip:{callbacks:{label:c=>' '+c.label+': '+clean(rbFmt(m.unit, c.parsed))}}}})});
  }
  const type = view==='bar' ? 'bar' : 'line', m0 = res.metrics[0];
  let datasets;
  if(d2 && res.cols && res.cols.length){
    datasets = res.cols.slice(0,12).map((c,j)=>({label:c.label, data:res.rows.map(r=>{ const k = (r.children||[]).find(z=>z.key===c.key); return k ? k.vals[0] : 0; }),
      borderColor:RB_PALETTE[j%RB_PALETTE.length], backgroundColor: view==='bar' ? RB_PALETTE[j%RB_PALETTE.length] : RB_PALETTE[j%RB_PALETTE.length]+'22', tension:0.25, fill:false, _unit:m0.unit}));
  } else {
    const baseUnit = m0.unit;
    datasets = res.metrics.map((m,i)=>({label:m.label, data:res.rows.map(r=>r.vals[i]), borderColor:RB_PALETTE[i%RB_PALETTE.length],
      backgroundColor: view==='bar' ? RB_PALETTE[i%RB_PALETTE.length] : RB_PALETTE[i%RB_PALETTE.length]+'22', tension:0.25, fill:false, yAxisID: m.unit===baseUnit ? 'y' : 'y1', _unit:m.unit}));
  }
  const baseUnit = m0.unit;
  const scales = {x:{ticks:{font:{size:10}, maxRotation:60}}, y:{ticks:{font:{size:10}, callback:v=>clean(rbFmt(baseUnit, v))}}};
  const other = res.metrics.find(m=>m.unit!==baseUnit);
  if(!d2 && other) scales.y1 = {position:'right', grid:{drawOnChartArea:false}, ticks:{font:{size:10}, callback:v=>clean(rbFmt(other.unit, v))}};
  return new Chart(canvas, {type, data:{labels, datasets}, options:Object.assign({}, common, {scales, plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:11}}},
    tooltip:{callbacks:{label:c=>' '+c.dataset.label+': '+clean(rbFmt(c.dataset._unit, c.parsed.y))}}}})});
}
// ── paint a computed result into a container (builder and dashboard widgets share this) ──
function rbPaint(out, res, opts){
  opts = opts || {};
  const view = (opts.view || res.cfg.view);
  const warnHtml = opts.widget ? '' : res.warn.map(w=>`<div class="rb-warn">⚠️ ${escHtml(w)}</div>`).join('');
  const head = opts.widget ? '' : `<div class="rb-result-title">${escHtml(rbTitle(res))}</div><div class="rb-note">${escHtml(rbPeriodNote(res))}</div>${rbCondSummary(res)}${warnHtml}`;
  const wrap = h=>`<div class="${opts.widget?'':'rb-result'}">${head}${h}</div>`;
  const tOpts = {widget:!!opts.widget, maxRows:opts.maxRows||0};
  if(view==='number') { out.innerHTML = wrap(rbKpiHtml(res, tOpts) + (opts.widget ? '' : rbTableHtml(res, true, tOpts))); return null; }
  if(view==='table'){ out.innerHTML = wrap(rbTableHtml(res, false, tOpts)); return null; }
  if(view==='matrix'){ out.innerHTML = wrap(rbMatrixHtml(res, tOpts)); return null; }
  if(view==='calendar' && res.dim==='time' && !opts.widget){
    out.innerHTML = wrap(`<div id="rbCalHost"></div>${rbTableHtml(res, true, tOpts)}`); rbRenderCalendar(res); return null;
  }
  if(view==='calendar') { out.innerHTML = wrap(rbTableHtml(res, false, tOpts)); return null; }
  if(!res.rows.length){ out.innerHTML = wrap('<div class="parts-table-empty">داده‌ای در این بازه نیست.</div>'); return null; }
  out.innerHTML = wrap(`<div class="mchart-wrap" style="height:${opts.widget?230:340}px;"><canvas></canvas></div>${opts.widget ? '' : rbTableHtml(res, true, tOpts)}`);
  const cv = out.querySelector('canvas');
  if(typeof Chart === 'undefined'){ out.querySelector('.mchart-wrap').innerHTML = '<div class="parts-table-empty">کتابخانه‌ی نمودار بارگذاری نشده؛ از نمای جدول استفاده کن.</div>'; return null; }
  const inst = rbChart(cv, res, view);
  if(!inst) out.querySelector('.mchart-wrap').innerHTML = '<div class="parts-table-empty">مقدار مثبتی برای نمایش دایره‌ای نیست.</div>';
  return inst;
}
function rbRender(){
  const out = document.getElementById('rbOutput'); if(!out) return;
  rbMetaRefresh();
  rbSanitize();
  if(rbChartInstance){ rbChartInstance.destroy(); rbChartInstance = null; }
  if(!RB.metrics.length){ out.innerHTML = '<div class="rb-result"><div class="parts-table-empty rb-blank"><div style="font-size:34px;">🧮</div><b>گزارش خالی است</b><br>از بخش «چه چیزی را ببینم؟» حداقل یک متغیر انتخاب کن (مثلاً فروش یا سود)، بعد در «به تفکیکِ…» بگو نتیجه بر چه اساسی تقسیم شود.</div></div>'; return; }
  { const pe = rbExprParse(RB.where.items); if(!pe.ok){ out.innerHTML = '<div class="rb-result"><div class="parts-table-empty rb-blank" style="color:var(--coral);"><div style="font-size:30px;">⚠</div><b>پرانتزهای شرط‌ها درست نیست</b><br>'+escHtml(pe.err)+' در بخش «کدام داده‌ها وارد محاسبه شوند؟» پرانتزها را اصلاح کن.</div></div>'; return; } }
  const res = rbCompute();
  RB_LAST = res;
  rbChartInstance = rbPaint(out, res, {});
}

// ── Controls ───────────────────────────────────────
function rbDimOptionsHtml(selected, metricIds, withNone, exclude){
  const opts = Object.entries(RB_DIMS).filter(([k])=>!(withNone && k==='all') && k!==exclude).map(([k,v])=>{
    const ok = rbDimOk(k, metricIds);
    return `<option value="${k}"${k===selected?' selected':''}${ok?'':' disabled'}>${v.label}${ok?'':' — با متغیرهای انتخابی سازگار نیست'}</option>`;
  }).join('');
  return (withNone ? `<option value=""${selected?'':' selected'}>— بدون گروه‌بندی دوم —</option>` : '') + opts;
}

function rbRenderMetricPanel(){
  const list = document.getElementById('rbMetricList'); if(!list) return;
  const q = (document.getElementById('rbMetricSearch').value||'').trim();
  const ok = new Set(rbMetricsFor(RB.dim, RB.dim2).map(m=>m.id));
  const items = Object.values(RB_METRICS).filter(m=>!q || m.label.includes(q) || m.group.includes(q) || (m.hint||'').includes(q) || (RB_EN[m.id]||'').toLowerCase().includes(q.toLowerCase()));
  const groups = {}; items.forEach(m=>(groups[m.group] = groups[m.group]||[]).push(m));
  list.innerHTML = Object.entries(groups).map(([g,arr])=>`<div class="rb-metric-group">${g}</div>` + arr.map(m=>{
    const can = ok.has(m.id);
    return `<label class="rb-metric-item${can?'':' off'}" ${can?'':'title="با گروه‌بندی فعلی سازگار نیست"'}><input type="checkbox" ${RB.metrics.includes(m.id)?'checked':''} ${can?'':'disabled'} onchange="rbToggleMetric('${m.id}')"/><span>${escHtml(m.label)}${RB_EN[m.id]?` <span class="kpi-en" dir="ltr" style="display:inline;">${escHtml(RB_EN[m.id])}</span>`:''}${m.snap?' <span class="rb-muted">(وضعیتی)</span>':''}${m.hint?` <span class="rb-muted">— ${escHtml(m.hint)}</span>`:''}${can?'':' <span class="rb-muted">(ناسازگار با گروه‌بندی فعلی)</span>'}</span></label>`;
  }).join('')).join('') || '<div class="parts-table-empty">متغیری با این نام پیدا نشد.</div>';
}
function rbToggleMetric(id){
  const i = RB.metrics.indexOf(id);
  if(i >= 0) RB.metrics.splice(i,1); else RB.metrics.push(id);
  rbSanitize();
  rbWriteControls();
  const p = document.getElementById('rbMetricPanel');
  if(p && p.style.display !== 'none') rbRenderMetricPanel();
  rbRender();
}

// ── Conditions («شرط‌ها») ──
function rbDimValues(dim){
  if(!rbFacts) rbFacts = buildFacts();
  if(dim==='weekday') return FA_WEEKDAYS.map((n,i)=>({key:String(i), label:n}));
  const set = new Set();
  rbFacts.forEach(f=>{ const k = rbDimKeys(f, dim); if(k) k.forEach(x=>{ if(dim==='group' && String(x).startsWith('p:')) return; set.add(String(x)); }); });
  if(dim==='group'){ const ord = ptgRowOrder(); return [...set].map(k=>({key:k, label:dimKeyLabel(dim,k)})).sort((a,b)=>(ord.get(a.key) ?? 1e9)-(ord.get(b.key) ?? 1e9)); }
  return [...set].map(k=>({key:k, label:dimKeyLabel(dim,k)})).sort((a,b)=>a.label.localeCompare(b.label,'fa'));
}

// conditions on the result («شرط روی نتیجه»)


// ── Compute ─────────────────────────────────────────


// ══════════════════════════════════════════════════════════════════
//  📌 ویجت‌های داشبورد — گزارش‌های ذخیره‌شده‌ی گزارش‌ساز که روی داشبورد گزارشات سنجاق شده‌اند.
//  روی سرور ذخیره می‌شوند (PARTS.dashboard_widgets)؛ هر ویجت به یک «گزارش ذخیره‌شده» اشاره می‌کند،
//  پس با ویرایش آن گزارش، ویجت هم به‌روز می‌شود و داده‌هایش همیشه زنده است.
// ══════════════════════════════════════════════════════════════════
let DW_CHARTS = {};
const DW_SIZES = {s:'کوچک', m:'متوسط', l:'تمام‌عرض'};
function dwList(){ return (PARTS.dashboard_widgets||[]).filter(w=>(PARTS.report_presets||[]).some(p=>p.id===w.preset_id)); }
function renderDashboardWidgets(){
  const host = document.getElementById('partsDashWidgets'); if(!host) return;
  Object.values(DW_CHARTS).forEach(c=>{ try{ c.destroy(); }catch(e){} }); DW_CHARTS = {};
  const list = dwList();
  const head = `<div class="dw-head"><div class="dw-title">📌 گزارش‌های سنجاق‌شده <span class="rb-en" dir="ltr">Pinned reports</span></div>
    <button class="parts-header-btn" type="button" onclick="showPartsSub('reportbuilder')">➕ ساخت گزارش جدید</button></div>`;
  if(!list.length){
    host.innerHTML = head + `<div class="dw-empty">هنوز گزارشی به داشبورد سنجاق نکرده‌ای.<br>در «گزارش‌ساز» یک گزارش بساز و دکمه‌ی <b>📌 افزودن به داشبورد گزارشات</b> را بزن؛ همین‌جا با عکس کالاها، تامین‌کننده‌ها و نمایندگان نشان داده می‌شود.</div>`;
    return;
  }
  host.innerHTML = head + `<div class="dw-grid">${list.map((w,i)=>{
    const p = (PARTS.report_presets||[]).find(x=>x.id===w.preset_id);
    return `<div class="dw-card dw-${w.size||'m'}" id="dw_${escHtml(w.id)}">
      <div class="dw-card-h"><div class="dw-card-t">${escHtml(w.title || p.name)}<div class="dw-card-sub" id="dw_sub_${escHtml(w.id)}"></div></div>
        <div class="dw-tools">
          <button type="button" title="جابه‌جایی به قبل" onclick="dwMove('${escHtml(w.id)}',-1)" ${i===0?'disabled style="opacity:.3"':''}>▶</button>
          <button type="button" title="جابه‌جایی به بعد" onclick="dwMove('${escHtml(w.id)}',1)" ${i===list.length-1?'disabled style="opacity:.3"':''}>◀</button>
          <button type="button" title="اندازه: ${DW_SIZES[w.size||'m']} (کلیک = تغییر)" onclick="dwSize('${escHtml(w.id)}')">⤢</button>
          <button type="button" title="تغییر عنوان" onclick="dwRename('${escHtml(w.id)}')">✎</button>
          <button type="button" title="باز کردن در گزارش‌ساز" onclick="dwOpen('${escHtml(w.id)}')">↗</button>
          <button type="button" class="del" title="حذف از داشبورد" onclick="dwRemove('${escHtml(w.id)}')">✕</button>
        </div></div>
      <div class="dw-body" id="dw_body_${escHtml(w.id)}"></div></div>`;
  }).join('')}</div>`;
  list.forEach(w=>{
    const p = (PARTS.report_presets||[]).find(x=>x.id===w.preset_id), body = document.getElementById('dw_body_'+w.id);
    if(!p || !body) return;
    try{
      const res = rbCompute(p.config, true);
      const sub = document.getElementById('dw_sub_'+w.id);
      if(sub) sub.textContent = res.metrics.map(m=>m.label).join('، ') + ' — به تفکیک ' + rbDimLabelPlain(res.dim) + (res.cfg.dim2 ? ' ‹ '+rbDimLabelPlain(res.cfg.dim2) : '');
      const inst = rbPaint(body, res, {widget:true, maxRows:w.size==='s'?5:8});
      if(inst) DW_CHARTS[w.id] = inst;
      const cs = rbCondSummary(res); if(cs) body.insertAdjacentHTML('afterbegin', cs);
    }catch(e){ console.warn('[dw]', e); body.innerHTML = '<div class="parts-table-empty">نمایش این گزارش با خطا روبه‌رو شد؛ آن را در گزارش‌ساز باز کن.</div>'; }
  });
}
async function dwSave(widgets){ return postParts('save_dashboard_widgets', {widgets}); }
function dwFind(id){ return (PARTS.dashboard_widgets||[]).find(w=>w.id===id); }
async function dwMove(id, dir){
  const list = dwList(), i = list.findIndex(w=>w.id===id), j = i+dir; if(i<0 || j<0 || j>=list.length) return;
  const t = list[i]; list[i] = list[j]; list[j] = t; await dwSave(list);
}
async function dwSize(id){
  const list = dwList().map(w=>Object.assign({}, w)), w = list.find(x=>x.id===id); if(!w) return;
  w.size = ({s:'m', m:'l', l:'s'})[w.size||'m']; await dwSave(list);
}
async function dwRename(id){
  const list = dwList().map(w=>Object.assign({}, w)), w = list.find(x=>x.id===id); if(!w) return;
  const p = (PARTS.report_presets||[]).find(x=>x.id===w.preset_id);
  const t = prompt('عنوان این کارت (خالی = نام گزارش ذخیره‌شده):', w.title || (p?p.name:'')); if(t===null) return;
  w.title = t.trim() === (p?p.name:'') ? '' : t.trim(); await dwSave(list);
}
async function dwRemove(id){
  const w = dwFind(id); if(!w) return;
  const p = (PARTS.report_presets||[]).find(x=>x.id===w.preset_id);
  if(!confirm('«'+((w.title)||(p?p.name:'گزارش'))+'» از داشبورد برداشته شود؟ (خودِ گزارش ذخیره‌شده در گزارش‌ساز می‌ماند)')) return;
  const d = await dwSave(dwList().filter(x=>x.id!==id)); if(d && d.ok!==false) showToast('از داشبورد برداشته شد');
}
function dwOpen(id){
  const w = dwFind(id); if(!w) return;
  showPartsSub('reportbuilder'); setTimeout(()=>rbLoadPreset(w.preset_id), 30);
}
// «📌 افزودن به داشبورد»: گزارش فعلی را (با یک نام) ذخیره می‌کند و ویجتش را می‌سازد
function rbPinToDashboard(){ rbReadControls(); rbSanitize(); if(!RB.metrics.length){ showToast('اول یک متغیر انتخاب کن','error'); return; } rbOpenPresetModal(true); }


// ══════════════════════════════════════════════════════════════════
//  گزارش‌ساز نسخه‌ی ۴
//  شرط‌ها = درخت: گروه (همه = اشتراک ∩ / هرکدام = اجتماع ∪) ← شرط ویژگی | شرط عددی | گروه تو در تو
//  شرط عددی: «کالایی/تامین‌کننده‌ای/… که [متغیر] [بیشتر/کمتر/بین…] [عدد] — اختیاری: فقط در بازه‌ی تاریخ ...»
//  شرط روی نتیجه: روی هر متغیری (حتی اگر در جدول نباشد)
//  متغیرهای ساخته‌شده توسط کاربر: A ÷ B ، A × B ، A − B ، A + B ، یا «در هر روز/هفته/ماه/سال»
// ══════════════════════════════════════════════════════════════════
const RB_NUM_OPS = {gt:'بیشتر از (>)', ge:'حداقل (≥)', lt:'کمتر از (<)', le:'حداکثر (≤)', eq:'برابر با (=)', ne:'نابرابر با (≠)', between:'بین (حداقل تا حداکثر)'};
const RB_OP_SHORT = {gt:'بیشتر از', ge:'حداقل', lt:'کمتر از', le:'حداکثر', eq:'برابر با', ne:'نابرابر با', between:'بین'};
const RB_HAVING_OPS = RB_NUM_OPS;
const RB_PER = {day:{label:'روز', days:1}, week:{label:'هفته', days:7}, month:{label:'ماه (۳۰ روز)', days:30}, year:{label:'سال (۳۶۵ روز)', days:365}};
const RB_CM_OPS = {div:'÷ تقسیم بر', mul:'× ضرب در', sub:'− منهای', add:'+ به‌علاوه'};
const RB_CM_SYM = {div:'÷', mul:'×', sub:'−', add:'+'};

function rbDefaults(){
  return {dim:'all', dim2:'', view:'table', metrics:[], attrCols:[], grain:'month', ndays:10, customIds:[], cumulative:false,
    fillZero:true, from:'', to:'', rangeChip:'all', where:{t:'expr', items:[]}, having:[], havingMode:'all', shareBase:'all',
    sort:'natural', limit:0, hideZero:true, calMonth:null, presetId:''};
}
function rbParseNum(s){
  if(s===null || s===undefined) return null;
  const t = String(s).replace(/[٠-٩]/g, d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[,٬\s]/g,'').replace(/٫/g,'.').trim();
  if(t==='' || !/^-?\d*\.?\d+$/.test(t)) return null;
  const v = parseFloat(t); return isFinite(v) ? v : null;
}
function rbNumPass(v, op, a, b){
  switch(op){
    case 'gt': return v > a; case 'ge': return v >= a-1e-9; case 'lt': return v < a; case 'le': return v <= a+1e-9;
    case 'eq': return Math.abs(v-a) < 1e-9; case 'ne': return Math.abs(v-a) >= 1e-9;
    case 'between': { const lo = Math.min(a,b), hi = Math.max(a,b); return v >= lo-1e-9 && v <= hi+1e-9; }
  }
  return true;
}
function rbDays(a, b){ if(!a || !b) return 1; const d = isoDiff(a, b); return isFinite(d) ? Math.max(1, d+1) : 1; }
function rbMkCtx(eff, pool, base, end, start){
  const s = (start && start > eff.from) ? start : eff.from, e = (end && end < eff.to) ? end : eff.to;
  return {pool, base: base || pool, end, days: rbDays(s, e)};
}

// ── sanitising a config (old v2/v3 shapes are migrated here) ──
function rbCleanNode(n, depth){
  if(!n || typeof n!=='object') return null;
  if(n.t==='grp'){
    if(depth > 2) return null;
    return {t:'grp', mode:n.mode==='any' ? 'any' : 'all', items:(n.items||[]).map(x=>rbCleanNode(x, depth+1)).filter(Boolean)};
  }
  if(n.t==='num'){
    if(!RB_NUM_ENT[n.dim]) return null;
    const mid = rbNumVar(n.dim, n.mid) ? n.mid : '';
    const iso = v=>(typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? v : '';
    return {t:'num', dim:n.dim, mid, op:RB_NUM_OPS[n.op] ? n.op : 'ge', v1:n.v1===undefined||n.v1===null ? '' : String(n.v1), v2:n.v2===undefined||n.v2===null ? '' : String(n.v2), from:iso(n.from), to:iso(n.to)};
  }
  // attribute condition (also the old flat-filter shape {dim,key} / {dim,keys})
  if(!RB_FILTER_DIMS.includes(n.dim)) return null;
  const keys = Array.isArray(n.keys) ? n.keys.map(String) : ((n.key!==undefined && n.key!==null && n.key!=='__none') ? [String(n.key)] : []);
  return {t:'attr', dim:n.dim, op:n.op==='notin' ? 'notin' : 'in', keys:[...new Set(keys)]};
}
function rbSanitizeCfg(c){
  rbEnsureCustomMetrics();
  if(!RB_DIMS[c.dim]) c.dim = 'all';
  if(c.dim2 && (!RB_DIMS[c.dim2] || c.dim2===c.dim || c.dim2==='all')) c.dim2 = '';
  if(c.dim==='all' && c.dim2){ c.dim = c.dim2; c.dim2 = ''; }
  const avail = new Set(rbMetricsFor(c.dim, c.dim2).map(m=>m.id));
  c.metrics = (c.metrics||[]).filter((m,i,a)=>avail.has(m) && a.indexOf(m)===i);
  if(!rbViewsFor(c.dim, c.dim2).includes(c.view)) c.view = 'table';
  c.where = rbCleanWhere(c.where, c.filters);
  delete c.filters;
  c.attrCols = rbCleanAttrCols(c);
  const okHaving = new Set(rbMetricsFor(c.dim, c.dim2).map(m=>m.id));
  c.having = (c.having||[]).filter(h=>h && (h.mid==='' || okHaving.has(h.mid)) && RB_NUM_OPS[h.op]).map(h=>({mid:h.mid, op:h.op, v1:String(h.v1!==undefined ? h.v1 : (h.val!==undefined ? h.val : '')), v2:String(h.v2===undefined ? '' : h.v2)}));
  c.havingMode = c.havingMode==='any' ? 'any' : 'all';
  c.shareBase = c.shareBase==='filtered' ? 'filtered' : 'all';
  c.ndays = Math.max(1, Math.min(365, parseInt(c.ndays,10) || 10));
  c.limit = parseInt(c.limit,10) || 0;
  c.customIds = Array.isArray(c.customIds) ? c.customIds : [];
  if(c.dim!=='time' || c.dim2) c.cumulative = false;
  return c;
}
function rbSanitize(){ rbSanitizeCfg(RB); }


// ── شرط عددی: هر موجودیت فقط متغیرهای منطقیِ خودش را دارد ──
// [شناسه‌ی متغیر, عبارتِ فارسیِ «همان موجودیت»]؛ تیتر = گروه نمایشی
const RB_NUM_ENT = {
  product:{label:'کالا', noun:'کالایی', ex:'مثلاً «کالاهایی که بیش از ۱۰ عدد فروخته‌اند» یا «کالاهایی که موجودی‌شان ≤ ۲ است»', vars:{
    '💰 فروش':[['units_sold','تعداد فروخته‌شده (خالص)'],['revenue','درآمد فروش'],['profit','سود ناخالص'],['margin_pct','حاشیه سود ٪'],['sales_count','در چند فاکتور فروش رفته'],['avg_sell_price','میانگین قیمت فروش هر واحد'],['discount_total','مجموع تخفیف داده‌شده'],['returned_units','تعداد مرجوعی'],['return_rate','نرخ مرجوعی ٪']],
    '📥 خرید':[['units_purchased','تعداد خریداری‌شده'],['purchase_spend','مبلغ خرید'],['avg_buy_price','میانگین قیمت خرید'],['purchases_count','در چند سفارش خرید آمده']],
    '📦 موجودی':[['stock_units','موجودی فعلی (تعداد)'],['stock_value','ارزش موجودی'],['potential_profit','سود بالقوه‌ی موجودی']],
    '🏷️ لیست قیمت':[['pe_last','آخرین قیمت لیست‌شده'],['pe_min','کمترین قیمت لیست‌شده'],['pe_count','تعداد قیمت‌های ثبت‌شده']]}},
  group:{label:'گروه کالا (با زیرگروه‌ها)', noun:'گروهی', ex:'مثلاً «گروه‌هایی که سودشان بیش از ۵۰۰ KT است»؛ هر گروه شاملِ همه‌ی زیرگروه‌هایش حساب می‌شود', vars:{
    '💰 فروش':[['units_sold','تعداد فروخته‌شده (خالص)'],['revenue','درآمد فروش'],['profit','سود ناخالص'],['margin_pct','حاشیه سود ٪'],['revenue_share','سهم از کل درآمد ٪'],['distinct_products_sold','تعداد کالای متفاوتِ فروخته‌شده']],
    '📥 خرید':[['units_purchased','تعداد خریداری‌شده'],['purchase_spend','مبلغ خرید']],
    '📦 موجودی':[['products_count','تعداد کالا'],['stock_units','موجودی (تعداد)'],['stock_value','ارزش موجودی']]}},
  brand:{label:'برند', noun:'برندی', ex:'مثلاً «برندهایی که بیش از ۱۰۰۰ KT فروش داشته‌اند»', vars:{
    '💰 فروش':[['units_sold','تعداد فروخته‌شده (خالص)'],['revenue','درآمد فروش'],['profit','سود ناخالص'],['margin_pct','حاشیه سود ٪'],['distinct_products_sold','تعداد کالای متفاوتِ فروخته‌شده']],
    '📥 خرید':[['units_purchased','تعداد خریداری‌شده'],['purchase_spend','مبلغ خرید']],
    '📦 موجودی':[['products_count','تعداد کالا'],['stock_units','موجودی (تعداد)'],['stock_value','ارزش موجودی']]}},
  car_model:{label:'مدل خودرو', noun:'مدلی', ex:'مثلاً «مدل‌هایی که سودشان کمتر از ۲۰۰ KT است»', vars:{
    '💰 فروش':[['units_sold','تعداد فروخته‌شده (خالص)'],['revenue','درآمد فروش'],['profit','سود ناخالص'],['margin_pct','حاشیه سود ٪']],
    '📥 خرید':[['units_purchased','تعداد خریداری‌شده'],['purchase_spend','مبلغ خرید']],
    '📦 موجودی':[['products_count','تعداد کالا'],['stock_units','موجودی (تعداد)'],['stock_value','ارزش موجودی']]}},
  customer:{label:'مشتری', noun:'مشتری‌ای', ex:'مثلاً «مشتری‌هایی که بیش از ۳ فاکتور داشته‌اند» یا «مشتری‌هایی که بیش از ۵۰۰ KT بدهکارند»', vars:{
    '💰 خرید مشتری از ما':[['sales_count','تعداد فاکتور'],['units_sold','تعداد کالای خریده‌شده'],['revenue','درآمد حاصل از او'],['profit','سود حاصل از او'],['avg_order_value','میانگین مبلغ هر فاکتور'],['discount_total','مجموع تخفیف گرفته‌شده']],
    '💳 حساب':[['amount_received','مبلغ پرداخت‌شده'],['amount_outstanding','مانده‌ی بدهی (نسیه)']],
    '↩️ مرجوعی':[['returns_count','تعداد مرجوعی'],['returned_total','مبلغ مرجوعی'],['return_rate','نرخ مرجوعی ٪']]}},
  store:{label:'تامین‌کننده', noun:'تامین‌کننده‌ای', ex:'مثلاً «تامین‌کننده‌هایی که بیش از ۲۰۰۰ KT از آن‌ها خریده‌ام» یا «بدهی‌ام به او > ۰»', vars:{
    '📥 خرید از او':[['purchases_count','تعداد سفارش خرید'],['units_purchased','تعداد خریداری‌شده'],['purchase_spend','مبلغ خرید'],['avg_purchase_value','میانگین مبلغ هر سفارش'],['paid_to_suppliers','پرداخت‌شده به او'],['purchase_outstanding','بدهی (پرداخت‌نشده)']],
    '🏷️ لیست قیمت او':[['pe_count','تعداد قیمت‌های ثبت‌شده'],['pe_avg','میانگین قیمت لیست‌شده'],['pe_min','کمترین قیمت لیست‌شده'],['pe_max','بیشترین قیمت لیست‌شده']]}},
  agent:{label:'نماینده فروش', noun:'نماینده‌ای', ex:'مثلاً «نماینده‌هایی که بیش از ۱۰ فاکتور آورده‌اند»', vars:{
    '💰 فروش او':[['agent_orders','تعداد فاکتورها'],['revenue','درآمد فروش'],['profit','سود ناخالص'],['avg_order_value','میانگین مبلغ هر فاکتور']],
    '🎁 پورسانت':[['commission','پورسانت محاسبه‌شده'],['payouts_total','پورسانت پرداخت‌شده'],['agent_payable','پورسانت باقی‌مانده']]}},
  sale:{label:'فاکتور فروش', noun:'فاکتوری', ex:'مثلاً «فاکتورهایی که مبلغشان بیش از ۱۰۰۰ KT است» یا «فاکتورهایی که سودشان منفی است»', vars:{
    '💰 مبلغ و سود':[['invoice_total','مبلغ فاکتور (با ارسال و مالیات)'],['revenue','درآمد فروش'],['profit','سود ناخالص'],['margin_pct','حاشیه سود ٪']],
    '🛒 اقلام':[['units_sold','تعداد کل کالا'],['distinct_products_sold','تعداد کالای متفاوت']],
    '🏷️ تخفیف و حساب':[['discount_total','مجموع تخفیف'],['discount_pct','درصد تخفیف ٪'],['amount_outstanding','مانده‌ی بدهی (نسیه)'],['ship_paid','ارسال پرداختی']]}},
  bundle:{label:'باندل / جایزه', noun:'باندلی', ex:'مثلاً «باندل‌هایی که بیش از ۵ فاکتور داشته‌اند» یا «باندل‌هایی که تخفیفشان از سودشان بیشتر است»', vars:{
    '🎁 استفاده':[['bundle_orders','تعداد فاکتورها'],['units_sold','تعداد کالای فروخته‌شده'],['bundle_revenue','درآمد ردیف‌ها']],
    '💸 هزینه و سود':[['bundle_discount','تخفیف ثبت‌شده'],['reward_cost','بهای جایزه‌های داده‌شده'],['profit','سود ناخالص']]}},
  purchase:{label:'سفارش خرید', noun:'سفارشی', ex:'مثلاً «سفارش‌هایی که مبلغشان بیش از ۵۰۰ KT است»', vars:{
    '📥 سفارش':[['purchase_spend','مبلغ سفارش'],['units_purchased','تعداد کالا'],['paid_to_suppliers','پرداخت‌شده'],['purchase_outstanding','پرداخت‌نشده']]}},
};
const RB_NUM_DIMS = Object.keys(RB_NUM_ENT);
// metrics that are really valid for an entity (also compatible with the engine's fact kinds)
function rbNumVars(dim){
  const E = RB_NUM_ENT[dim]; if(!E) return [];
  const out = [];
  Object.entries(E.vars).forEach(([g, arr])=>arr.forEach(([id, phrase])=>{ if(RB_METRICS[id] && rbDimOk(dim,[id])) out.push({id, group:g, phrase, m:RB_METRICS[id]}); }));
  return out;
}
const rbNumVar = (dim, mid)=>rbNumVars(dim).find(v=>v.id===mid);
// «group» in a numeric test means real group nodes only (not single products / the "ungrouped" bucket)
function rbNumKeys(f, dim){
  const ks = rbDimKeys(f, dim); if(!ks) return ks;
  return dim==='group' ? ks.filter(k=>k!=='__none' && !String(k).startsWith('p:')) : ks;
}
function rbNumSentence(n){
  const E = RB_NUM_ENT[n.dim], v = rbNumVar(n.dim, n.mid);
  if(!E) return '';
  const a = rbParseNum(n.v1), b = rbParseNum(n.v2), u = v ? (v.m.unit==='money' ? ' KT' : (v.m.unit==='pct' ? '٪' : '')) : '';
  const cond = {gt:'بیشتر از', ge:'حداقل', lt:'کمتر از', le:'حداکثر', eq:'دقیقاً برابر', ne:'مخالف', between:'بین'}[n.op];
  const num = a===null ? '؟' : fx(a)+u, num2 = b===null ? '؟' : fx(b)+u;
  const val = n.op==='between' ? `${num} و ${num2}` : num;
  const win = (n.from || n.to) ? ` (در بازه‌ی ${n.from ? jShort(n.from) : 'ابتدا'} تا ${n.to ? jShort(n.to) : 'امروز'})` : ' (در بازه‌ی گزارش)';
  return `هر <b>${escHtml(E.label)}</b> که «<b>${v ? escHtml(v.phrase) : '…'}</b>»اش <b>${cond} ${val}</b> باشد${win}`;
}

// ── the condition tree ──
function rbEntitySet(n, env){
  if(env.sets.has(n)) return env.sets.get(n);
  let out = null;
  const m = RB_METRICS[n.mid], a = rbParseNum(n.v1), b = rbParseNum(n.v2);
  if(m && a!==null && (n.op!=='between' || b!==null)){
    const from = n.from || env.eff.from, to = n.to || env.eff.to, need = new Set(m.kinds);
    const groups = new Map();
    rbDimValues(n.dim).forEach(v=>{ if(n.dim==='group' && (v.key==='__none' || String(v.key).startsWith('p:'))) return; groups.set(v.key, []); });
    rbFacts.forEach(f=>{
      if(!need.has(f.k)) return;
      if(f.date){ if(m.snap ? f.date > to : (f.date < from || f.date > to)) return; }
      const ks = rbNumKeys(f, n.dim); if(!ks) return;
      new Set(ks.map(String)).forEach(k=>{ let g = groups.get(k); if(!g){ g = []; groups.set(k, g); } g.push(f); });
    });
    out = new Set();
    groups.forEach((rows, k)=>{ const v = rbEval(m, rows, {pool:rows, base:rows, end:to, days:rbDays(from, to)}); if(rbNumPass(v, n.op, a, b)) out.add(k); });
  }
  env.sets.set(n, out); return out;
}
function rbCompileLeaf(n, env){
  if(n.t==='attr'){
    if(!n.keys.length) return null;
    if(!env.ok(n.dim)){ env.warn.push('شرط «'+rbDimLabelPlain(n.dim)+'» با متغیرهای انتخاب‌شده سازگار نیست و نادیده گرفته شد.'); return null; }
    const set = new Set(n.keys.map(String)), notin = n.op==='notin', dim = n.dim;
    return f=>{
      let hit;
      if(dim==='weekday') hit = !!f.date && set.has(String(isoWeekdaySat(f.date)));
      else { const ks = rbDimKeys(f, dim); if(!ks) return notin; hit = ks.some(k=>set.has(String(k))); }
      return notin ? !hit : hit;
    };
  }
  if(n.t==='num'){
    if(!env.ok(n.dim)){ env.warn.push('شرط عددی روی «'+rbDimLabelPlain(n.dim)+'» با متغیرهای انتخاب‌شده سازگار نیست و نادیده گرفته شد.'); return null; }
    const set = rbEntitySet(n, env); if(!set) return null;
    return f=>{ const ks = rbNumKeys(f, n.dim); return !!ks && ks.some(k=>set.has(String(k))); };
  }
  return null;
}
function rbNodeActive(n){
  if(!n) return false;
  if(n.t==='attr') return n.keys.length > 0;
  if(n.t==='num') return !!RB_METRICS[n.mid] && rbParseNum(n.v1)!==null && (n.op!=='between' || rbParseNum(n.v2)!==null);
  return false;
}

// ── the flat condition list: items[i] = {t:'attr'|'num', …, lk:'and'|'or' (joins it to the previous item), po:'(' count, pc:')' count}
//    precedence without parentheses: «و» binds tighter than «یا» ──
function rbExprParse(items){
  const toks = [];
  (items||[]).forEach((it,i)=>{
    if(i > 0) toks.push({t: it.lk==='or' ? 'or' : 'and'});
    for(let k=0;k<(it.po||0);k++) toks.push({t:'('});
    toks.push({t:'leaf', it, i});
    for(let k=0;k<(it.pc||0);k++) toks.push({t:')'});
  });
  if(!toks.length) return {ok:true, err:'', tree:null};
  let p = 0, err = '';
  const peek = ()=>toks[p];
  const mk = (op, a, b)=>{
    if(!a) return b; if(!b) return a;
    const kids = []; [a,b].forEach(x=>{ if(x.t===op && !x.par) kids.push(...x.kids); else kids.push(x); });
    return {t:op, kids};
  };
  function pExpr(){ let a = pTerm(); while(peek() && peek().t==='or'){ p++; a = mk('or', a, pTerm()); } return a; }
  function pTerm(){ let a = pFac(); while(peek() && peek().t==='and'){ p++; a = mk('and', a, pFac()); } return a; }
  function pFac(){
    const t = peek();
    if(!t){ if(!err) err = 'پرانتز باز بسته نشده است.'; return null; }
    if(t.t==='('){ p++; const e = pExpr(); if(peek() && peek().t===')') p++; else if(!err) err = 'یک پرانتز باز «(» بسته نشده است.'; if(e && e.kids) e.par = true; return e; }
    if(t.t==='leaf'){ p++; return {t:'leaf', it:t.it, i:t.i}; }
    if(!err) err = 'ترتیب پرانتزها درست نیست.';
    p++; return null;
  }
  const tree = pExpr();
  if(!err && p < toks.length) err = 'یک پرانتز بسته «)» بیش از حد است.';
  return {ok:!err, err, tree};
}
function rbPrune(t){
  if(!t) return null;
  if(t.t==='leaf') return rbNodeActive(t.it) ? t : null;
  const kids = t.kids.map(rbPrune).filter(Boolean);
  if(!kids.length) return null; if(kids.length===1) return kids[0];
  return {t:t.t, kids};
}
function rbTreeText(t, numbered, parent){
  if(!t) return '';
  if(t.t==='leaf') return numbered ? faDigits(t.i+1) : rbLeafText(t.it);
  const s = t.kids.map(k=>rbTreeText(k, numbered, t.t)).join(t.t==='or' ? ' یا ' : ' و ');
  return (parent && parent!==t.t) ? '('+s+')' : s;
}
function rbWhereTree(w){ const r = rbExprParse(w && w.items); return {ok:r.ok, err:r.err, tree:r.ok ? rbPrune(r.tree) : null}; }
function rbCompileTree(t, env){
  if(!t) return null;
  if(t.t==='leaf') return rbCompileLeaf(t.it, env);
  const fs = t.kids.map(k=>rbCompileTree(k, env)).filter(Boolean);
  if(!fs.length) return null; if(fs.length===1) return fs[0];
  return t.t==='or' ? (f=>fs.some(g=>g(f))) : (f=>fs.every(g=>g(f)));
}
function rbCompileWhere(w, env){
  const r = rbWhereTree(w);
  if(!r.ok){ env.warn.push('⚠ پرانتزهای شرط‌ها درست نیست ('+r.err+') و هیچ شرطی اعمال نشد.'); return null; }
  return rbCompileTree(r.tree, env);
}
function rbNodeCount(w){ return ((w && w.items) || []).filter(rbNodeActive).length; }
function rbWhereText(w){ const r = rbWhereTree(w); return r.ok ? rbTreeText(r.tree, false, null) : ''; }
function rbLeafText(n){
  if(n.t==='attr'){
    if(!n.keys.length) return '';
    const names = n.keys.slice(0,4).map(k=>dimKeyLabel(n.dim, k)).join('، ') + (n.keys.length>4 ? ' و '+fx(n.keys.length-4)+' مورد دیگر' : '');
    return `${rbDimLabelPlain(n.dim)} ${n.op==='notin' ? 'نباشد' : 'باشد'}: ${names}`;
  }
  if(n.t==='num'){
    const m = RB_METRICS[n.mid], a = rbParseNum(n.v1), b = rbParseNum(n.v2);
    if(!m || a===null || (n.op==='between' && b===null)) return '';
    const val = n.op==='between' ? `${fx(a)} تا ${fx(b)}` : fx(a);
    const win = (n.from || n.to) ? ` (در بازه‌ی ${n.from ? jShort(n.from) : 'ابتدا'} تا ${n.to ? jShort(n.to) : 'امروز'})` : '';
    const nv = rbNumVar(n.dim, n.mid); return `${RB_NUM_ENT[n.dim] ? RB_NUM_ENT[n.dim].label : rbDimLabelPlain(n.dim)} با «${nv ? nv.phrase : m.label}» ${RB_OP_SHORT[n.op]} ${val}${win}`;
  }
  return '';
}
// clean a stored where (new flat shape, update_5 group tree, or legacy flat filters) → flat shape
function rbCleanLeafItem(n){
  const c = rbCleanNode(n, 0); if(!c || c.t==='grp') return null;
  c.lk = n.lk==='or' ? 'or' : 'and';
  c.po = Math.max(0, Math.min(3, parseInt(n.po,10)||0)); c.pc = Math.max(0, Math.min(3, parseInt(n.pc,10)||0));
  return c;
}
function rbTreeToItems(g){
  const out = [], lk = g.mode==='any' ? 'or' : 'and';
  (g.items||[]).forEach(ch=>{
    let sub;
    if(ch.t==='grp'){ sub = rbTreeToItems(ch); if(sub.length > 1){ sub[0].po++; sub[sub.length-1].pc++; } }
    else { const c = rbCleanLeafItem(ch); sub = c ? [c] : []; }
    if(!sub.length) return;
    if(out.length) sub[0].lk = lk;
    out.push(...sub);
  });
  return out;
}
function rbCleanWhere(w, legacyFilters){
  let items = [];
  if(w && w.t==='grp'){ items = rbTreeToItems(rbCleanNode(w, 0) || {items:[]}); }
  else if(w && Array.isArray(w.items)) items = w.items.map(rbCleanLeafItem).filter(Boolean);
  if(legacyFilters && legacyFilters.length) legacyFilters.forEach(f=>{ const c = rbCleanLeafItem(f); if(c){ c.lk = 'and'; c.po = c.pc = 0; items.push(c); } });
  return {t:'expr', items:items.slice(0, 40)};
}

function rbHavingText(c){
  const parts = (c.having||[]).map(h=>{ const m = RB_METRICS[h.mid], a = rbParseNum(h.v1), b = rbParseNum(h.v2); if(!m || a===null || (h.op==='between' && b===null)) return ''; return `«${m.label}» ${RB_OP_SHORT[h.op]} ${h.op==='between' ? fx(a)+' تا '+fx(b) : fx(a)}`; }).filter(Boolean);
  return parts.join(c.havingMode==='any' ? ' یا ' : ' و ');
}
function rbRowVal(r, mid, metrics){
  const i = metrics.findIndex(m=>m.id===mid); if(i >= 0) return r.vals[i];
  const m = RB_METRICS[mid]; if(!m) return 0;
  return rbEval(m, m.snap ? (r._s||[]) : (r._f||[]), r._ctx || {pool:r._f||[], end:isoToday(), days:1});
}
function rbHavingPassRow(r, metrics, cfg){
  const items = (cfg.having||[]).map(h=>({h, a:rbParseNum(h.v1), b:rbParseNum(h.v2)})).filter(x=>x.a!==null && (x.h.op!=='between' || x.b!==null) && RB_METRICS[x.h.mid]);
  if(!items.length) return true;
  const test = x=>rbNumPass(rbRowVal(r, x.h.mid, metrics), x.h.op, x.a, x.b);
  return cfg.havingMode==='any' ? items.some(test) : items.every(test);
}

// split a set of facts by a second dimension → child rows
function rbSplit(F, S, d2, cfg, res, end){
  const eff = res.eff, metrics = res.metrics, kids = [];
  const mk = (rows, snap, ctx)=>metrics.map(m=>rbEval(m, m.snap ? snap : rows, ctx));
  if(d2==='time'){
    rbBuildPeriods(cfg.grain, eff.from, eff.to, cfg).periods.forEach(p=>{
      const win = F.filter(f=>f.date && f.date>=p.start && f.date<=p.end), snap = S.filter(f=>!f.date || f.date<=p.end);
      const ctx = rbMkCtx(eff, res._tf, res._base, p.end, p.start);
      kids.push({key:p.key, label:p.label, start:p.start, vals:mk(win, snap, ctx), _f:win, _s:snap, _ctx:ctx, empty:!win.length});
    });
  } else {
    const groups = new Map();
    F.forEach(f=>{
      let keys;
      if(d2==='weekday'){ if(!f.date) return; keys = [String(isoWeekdaySat(f.date))]; }
      else { keys = rbDimKeys(f, d2); if(!keys) return; keys = [...new Set(keys.map(String))]; }
      keys.forEach(k=>{ if(!groups.has(k)) groups.set(k, []); groups.get(k).push(f); });
    });
    const ctx = rbMkCtx(eff, res._tf, res._base, end, eff.from);
    groups.forEach((rows, key)=>{
      const snap = S.filter(f=>{
        if(d2==='weekday') return !f.date || String(isoWeekdaySat(f.date))===key;
        const ks = rbDimKeys(f, d2); return ks && ks.map(String).includes(key);
      });
      kids.push({key, label:dimKeyLabel(d2, key), vals:mk(rows, snap, ctx), _f:rows, _s:snap, _ctx:ctx, empty:!rows.length});
    });
  }
  return kids;
}
function rbPolishKids(kids, d2, cfg, res){
  let k = kids;
  const nz = r=>r.vals.some(v=>Math.abs(v)>1e-9);
  if(cfg.hideZero || (d2==='time' && !cfg.fillZero)) k = k.filter(nz);
  if(cfg.having && cfg.having.length) k = k.filter(r=>rbHavingPassRow(r, res.metrics, cfg));
  if(d2==='time') k.sort((a,b)=>String(a.start).localeCompare(String(b.start)));
  else if(cfg.sort==='desc' && res.metrics[0]) k.sort((a,b)=>b.vals[0]-a.vals[0]);
  else if(cfg.sort==='asc' && res.metrics[0]) k.sort((a,b)=>a.vals[0]-b.vals[0]);
  else if(d2==='weekday') k.sort((a,b)=>(+a.key)-(+b.key));
  else k.sort((a,b)=>a.label.localeCompare(b.label,'fa'));
  return k;
}

// ── custom (user-defined) metrics ──
let RB_CM_SIG = null;
function rbEnsureCustomMetrics(){
  const sig = JSON.stringify(PARTS.custom_metrics||[]);
  if(sig !== RB_CM_SIG) rbRegisterCustomMetrics();
}
function rbCmFormula(cm){
  const A = RB_METRICS[cm.a], B = cm.b_type==='metric' ? RB_METRICS[cm.b] : null;
  const an = A ? A.label : '؟';
  if(cm.b_type==='per') return `${an} ÷ تعداد ${RB_PER[cm.per] ? RB_PER[cm.per].label.replace(/ \(.*\)/,'') : '؟'}‌های بازه‌ی همان ردیف` + (cm.as_pct ? ' × ۱۰۰' : '');
  const bn = cm.b_type==='const' ? fx(cm.const) : (B ? B.label : '؟');
  return `${an} ${RB_CM_SYM[cm.op]||'÷'} ${bn}` + (cm.as_pct ? ' × ۱۰۰' : '');
}
function rbRegisterCustomMetrics(){
  RB_CM_SIG = JSON.stringify(PARTS.custom_metrics||[]);
  Object.keys(RB_METRICS).filter(k=>k.startsWith('c_')).forEach(k=>{ delete RB_METRICS[k]; delete RB_FT[k]; delete RB_EN[k]; });
  (PARTS.custom_metrics||[]).forEach(cm=>{
    const A = RB_METRICS[cm.a]; if(!A || A.custom) return;
    let B = null;
    if(cm.b_type==='metric'){ B = RB_METRICS[cm.b]; if(!B || B.custom || !!B.snap!==!!A.snap) return; }
    const kinds = [...new Set(A.kinds.concat(B ? B.kinds : []))];
    const per = cm.b_type==='per' ? RB_PER[cm.per] : null, k = cm.b_type==='const' ? parseFloat(cm.const) : null, op = cm.op || 'div';
    if(cm.b_type==='const' && !isFinite(k)) return;
    if(cm.b_type==='per' && !per) return;
    const fn = (r, c)=>{
      const a = rbEval(A, r, c);
      let b; if(B) b = rbEval(B, r, c); else if(per) b = ((c && c.days) || 1) / per.days; else b = k;
      let v = op==='mul' ? a*b : (op==='sub' ? a-b : (op==='add' ? a+b : (b ? a/b : 0)));
      if(cm.b_type==='per') v = b ? a/b : 0;
      return cm.as_pct ? v*100 : v;
    };
    let unit = cm.unit && cm.unit!=='auto' ? cm.unit : (cm.as_pct ? 'pct' : A.unit);
    if((!cm.unit || cm.unit==='auto') && !cm.as_pct && B && (op==='div') && A.unit===B.unit) unit = 'num';
    if((!cm.unit || cm.unit==='auto') && !cm.as_pct && B && op==='mul') unit = 'num';
    const fields = [...new Set(rbFieldsOf(A).concat(B ? rbFieldsOf(B) : []))];
    RB_METRICS[cm.id] = {id:cm.id, group:'🧮 متغیرهای ساخته‌شده توسط من', label:cm.name, unit, kinds, fn, snap:!!A.snap, custom:true, fields, hint:rbCmFormula(cm)};
    RB_FT[cm.id] = rbCmFormula(cm) + ' — محاسبه روی همان ردیف‌های سازنده‌ی هر خانه';
    RB_EN[cm.id] = 'Custom measure';
  });
}

// ── compute ──
function rbCompute(overrides, full){
  rbEnsureCustomMetrics();
  if(!rbFacts) rbFacts = buildFacts();
  const cfg = rbSanitizeCfg(Object.assign({}, full ? rbDefaults() : RB, overrides||{}));
  if(cfg.rangeChip && cfg.rangeChip!=='custom' && cfg.rangeChip!=='all'){ const rr = rbRangeFor(cfg.rangeChip); cfg.from = rr.from; cfg.to = rr.to; }
  const dim = cfg.dim, D = RB_DIMS[dim];
  const k2 = cfg.dim2 ? new Set(RB_DIMS[cfg.dim2].kinds) : null;
  const kinds = new Set(D.kinds.filter(k=>!k2 || k2.has(k)));
  const metrics = cfg.metrics.map(id=>RB_METRICS[id]).filter(Boolean);
  const warn = [];
  const kf = rbFacts.filter(f=>kinds.has(f.k));
  let minD = null, maxD = null;
  const needK = new Set(); metrics.forEach(m=>m.kinds.forEach(k=>needK.add(k)));
  kf.forEach(f=>{ if(!f.date || !needK.has(f.k)) return; if(!minD || f.date < minD) minD = f.date; if(!maxD || f.date > maxD) maxD = f.date; });   // the range comes from ALL data, so conditions never shift it
  const today = isoToday();
  const eff = {from: cfg.from || minD || today, to: cfg.to || (maxD && maxD > today ? maxD : today)};
  if(eff.from > eff.to) eff.to = eff.from;
  const env = {warn, sets:new Map(), eff, ok:d=>rbDimOk(d, cfg.metrics)};
  const pred = rbCompileWhere(cfg.where, env);
  const allF = pred ? kf.filter(pred) : kf;
  const inR = f=>!f.date || (f.date >= eff.from && f.date <= eff.to);
  const inRange = allF.filter(inR);
  let base = cfg.shareBase==='filtered' ? null : kf.filter(inR);      // denominator of «سهم ٪»
  const ctxOf = (end, pool, start)=>rbMkCtx(eff, pool, base, end, start);
  const evalAll = (rowsNon, rowsSnap, ctx)=>metrics.map(m=>rbEval(m, m.snap ? rowsSnap : rowsNon, ctx));
  const res = {dim, metrics, rows:[], total:[], eff, warn, cfg};
  let pool = inRange;
  const snapPool = allF.filter(f=>!f.date || f.date <= eff.to);
  res.rangeVals = (a, b, cumulative)=>{
    const lo = cumulative ? eff.from : a;
    const rows = inRange.filter(f=>f.date && f.date >= lo && f.date <= b);
    const snap = allF.filter(f=>!f.date || f.date <= b);
    return evalAll(rows, snap, ctxOf(b, pool, lo));
  };

  if(dim==='time'){
    let grain = cfg.grain;
    if(cfg.view==='calendar') grain = 'day';
    const bp = rbBuildPeriods(grain, eff.from, eff.to, cfg);
    if(bp.truncated) warn.push('تعداد دوره‌ها خیلی زیاد بود؛ فقط ۱٬۲۰۰ دوره‌ی اول نمایش داده شد. بازه یا تفکیک زمانی را بزرگ‌تر کن.');
    if(grain==='custom' && !bp.periods.length) warn.push('هنوز بازه‌ی سفارشی تعریف نکرده‌ای. با دکمه‌ی «تعریف و مدیریت بازه‌ها» بازه بساز.');
    const cum = !!cfg.cumulative;
    if(grain==='custom'){
      const inAny = f=>bp.periods.some(p=>f.date >= p.start && f.date <= p.end);
      pool = pool.filter(f=>f.date && inAny(f));
      if(base) base = base.filter(f=>f.date && inAny(f));
    }
    bp.periods.forEach(p=>{
      const win = inRange.filter(f=>f.date && f.date >= p.start && f.date <= p.end);
      const rowsNon = cum ? inRange.filter(f=>f.date && f.date >= eff.from && f.date <= p.end) : win;
      const rowsSnap = allF.filter(f=>!f.date || f.date <= p.end);
      const ctx = ctxOf(p.end, pool, cum ? eff.from : p.start);
      res.rows.push({key:p.key, label:p.label, start:p.start, end:p.end, empty: win.length===0, _f:rowsNon, _s:rowsSnap, _ctx:ctx, vals: evalAll(rowsNon, rowsSnap, ctx)});
    });
    res._base = base || pool;
    if(cum){
      res.total = res.rows.length ? res.rows[res.rows.length-1].vals.slice() : metrics.map(()=>0);
      if(res.rows.length){ const lr = res.rows[res.rows.length-1]; res._tf = lr._f; res._ts = lr._s; }
    } else {
      res.total = evalAll(pool, snapPool, ctxOf(eff.to, pool, eff.from)); res._tf = pool; res._ts = snapPool;
    }
    if(!cfg.fillZero && cfg.view!=='calendar') res.rows = res.rows.filter(r=>!r.empty);
    if(cum && metrics.some(m=>m.snap)) warn.push('متغیرهای «وضعیتی» (مثل موجودی صندوق یا موجودی انبار) ذاتاً مانده‌ی پایان دوره‌اند و تجمیعی‌شدن روی آن‌ها اثری ندارد.');
    if(cum && metrics.some(m=>m.unit==='pct')) warn.push('در حالت تجمیعی، درصدها از روی مجموع تجمیعی دوباره محاسبه می‌شوند.');
  } else if(dim==='all'){
    res._base = base || pool;
    const ctx = ctxOf(eff.to, pool, eff.from);
    res.rows.push({key:'all', label:'جمع کل', vals:evalAll(pool, snapPool, ctx), _f:pool, _s:snapPool, _ctx:ctx});
    res.total = res.rows[0].vals.slice(); res._tf = pool; res._ts = snapPool;
  } else {
    res._base = base || pool;
    const groups = new Map();
    const add = (key, f)=>{ let g = groups.get(key); if(!g){ g = []; groups.set(key, g); } g.push(f); };
    inRange.forEach(f=>{
      if(dim==='weekday'){ if(f.date) add(String(isoWeekdaySat(f.date)), f); return; }
      const keys = rbDimKeys(f, dim); if(!keys) return;
      new Set(keys.map(String)).forEach(k=>add(k, f));
    });
    if(dim==='weekday') for(let i=0;i<7;i++) if(!groups.has(String(i))) groups.set(String(i), []);
    const ctx = ctxOf(eff.to, pool, eff.from);
    groups.forEach((rows, key)=>{
      const snapRows = snapPool.filter(f=>{
        if(dim==='weekday') return !f.date || String(isoWeekdaySat(f.date))===key;
        const ks = rbDimKeys(f, dim); return ks && ks.map(String).includes(key);
      });
      res.rows.push({key, label:dimKeyLabel(dim, key), vals:evalAll(rows, snapRows, ctx), empty:rows.length===0, _f:rows, _s:snapRows, _ctx:ctx});
    });
    res.total = evalAll(pool, snapPool, ctx); res._tf = pool; res._ts = snapPool;
    if(cfg.hideZero) res.rows = res.rows.filter(r=>r.vals.some(v=>Math.abs(v) > 1e-9));
    if(D.note) warn.push(D.note);
    if(dim==='weekday') res.rows.sort((a,b)=>(+a.key)-(+b.key));
    else if(dim==='group'){ const ord = ptgRowOrder(); res.rows.sort((a,b)=>(ord.get(a.key) ?? 1e9)-(ord.get(b.key) ?? 1e9)); res.rows.forEach(r=>Object.assign(r, ptgRowMeta(r.key))); }
    else res.rows.sort((a,b)=>a.label.localeCompare(b.label,'fa'));
  }
  if(cfg.having.length && dim!=='all') res.rows = res.rows.filter(r=>rbHavingPassRow(r, metrics, cfg));
  const first = metrics[0];
  if(cfg.sort!=='natural' && first && !(dim==='time' && cfg.view==='calendar')){
    res.rows.sort((a,b)=> cfg.sort==='desc' ? b.vals[0]-a.vals[0] : a.vals[0]-b.vals[0]);
  }
  if(cfg.limit > 0 && res.rows.length > cfg.limit && !(dim==='time' && cfg.view==='calendar')) res.rows = res.rows.slice(0, cfg.limit);
  if(cfg.dim2){
    rbAttachChildren(res, cfg);
    if(cfg.having.length) warn.push('شرط روی نتیجه، هم روی ردیف‌های سطح اول و هم روی ردیف‌های سطح دوم اعمال شده؛ پس جمع زیرمجموعه‌ها ممکن است با ردیف بالاییشان نخواند.');
    if(RB_DIMS[cfg.dim2].note) warn.push(RB_DIMS[cfg.dim2].note);
  }
  if(rbNodeCount(cfg.where) && cfg.shareBase==='all' && metrics.some(m=>/_share$/.test(m.id)))
    warn.push('«سهم ٪» نسبت به کل همان بازه (بدون شرط‌ها) حساب شده. اگر سهم را نسبت به نتیجه‌ی فیلترشده می‌خواهی، در بخش «نمایش» گزینه‌ی «سهم نسبت به» را عوض کن.');
  return res;
}
function rbCondSummary(res){
  const c = res.cfg, w = rbWhereText(c.where), h = rbHavingText(c), parts = [];
  if(w) parts.push('<b>شرط‌ها:</b> '+escHtml(w));
  if(h) parts.push('<b>روی نتیجه:</b> '+escHtml(h));
  return parts.length ? `<div class="rb-cond-sum">🔎 ${parts.join(' ‖ ')}</div>` : '';
}

// ══════════ UI: accordion sections, sentence, condition tree, having, custom metrics ══════════
let RB_OPEN = {measures:true, group:true, where:true, time:false, view:false};
try{ const o = JSON.parse(localStorage.getItem('elevate_rb_open')||'null'); if(o && typeof o==='object') Object.assign(RB_OPEN, o); }catch(e){}
let RB_SSIDS = [];
function rbToggleSec(id){ RB_OPEN[id] = !RB_OPEN[id]; try{ localStorage.setItem('elevate_rb_open', JSON.stringify(RB_OPEN)); }catch(e){} rbApplySecs(); }
function rbApplySecs(){ Object.keys(RB_OPEN).forEach(id=>{ const el = document.getElementById('rbSec_'+id); if(el) el.classList.toggle('closed', !RB_OPEN[id]); }); }
function rbRangeLabel(){
  if(RB.rangeChip && RB.rangeChip!=='custom'){ const f = RB_RANGE_CHIPS.find(x=>x[0]===RB.rangeChip); if(f) return f[1]; }
  if(RB.from || RB.to) return (RB.from ? jShort(RB.from) : 'ابتدا')+' تا '+(RB.to ? jShort(RB.to) : 'امروز');
  return 'همه‌ی زمان‌ها';
}
function rbGrainLabel(){ return ({day:'روزانه', week:'هفتگی', month:'ماهانه', quarter:'فصلی', year:'سالانه', ndays:'هر '+RB.ndays+' روز', custom:'بازه‌های سفارشی'})[RB.grain] || ''; }
function rbMetaRefresh(){
  const g = id=>document.getElementById(id); if(!g('rbSentence')) return;
  const names = RB.metrics.map(id=>RB_METRICS[id] ? RB_METRICS[id].label.split(' (')[0] : '').filter(Boolean);
  const dims = rbDimLabelPlain(RB.dim) + (RB.dim2 ? ' ‹ '+rbDimLabelPlain(RB.dim2) : '');
  const w = rbWhereText(RB.where), h = rbHavingText(RB);
  const hasTime = RB.dim==='time' || RB.dim2==='time';
  g('rbSentence').innerHTML = `<b>${escHtml(names.join('، ') || '—')}</b> را ${RB.dim==='all' ? '<b>به‌صورت جمع کل</b>' : 'به تفکیکِ <b>'+escHtml(dims)+'</b>'}${hasTime ? ' ('+escHtml(rbGrainLabel())+')' : ''} نشان بده`
    + (RB.attrCols && RB.attrCols.length && rbAttrColsOk(RB) ? ` و کنار هر ردیف <b>${escHtml(RB.attrCols.map(rbDimLabelPlain).join('، '))}</b>` : '')
    + (w ? `، <span class="rbx-s-w">فقط برای: <b>${escHtml(w)}</b></span>` : '')
    + (h ? `، <span class="rbx-s-h">و فقط ردیف‌هایی که ${escHtml(h)}</span>` : '')
    + `؛ <span class="rbx-s-t">بازه: <b>${escHtml(rbRangeLabel())}</b></span>.`;
  const set = (id, t)=>{ const e = g(id); if(e) e.textContent = t; };
  set('rbSum_measures', fx(RB.metrics.length)+' متغیر');
  set('rbSum_group', dims);
  const nc = rbNodeCount(RB.where), nh = (RB.having||[]).filter(x=>rbParseNum(x.v1)!==null).length;
  set('rbSum_where', (nc||nh) ? [nc ? fx(nc)+' شرط' : '', nh ? fx(nh)+' شرط روی نتیجه' : ''].filter(Boolean).join(' + ') : 'بدون شرط');
  set('rbSum_time', rbRangeLabel() + (hasTime ? ' · '+rbGrainLabel() : ''));
  set('rbSum_view', (RB_VIEWS[RB.view]||'').replace(/^[^؀-ۿ\w]+\s*/,'').split(' (')[0]);
}
function rbMetricOptionsHtml(list, sel, firstIds){
  const groups = {};
  const put = (g, m)=>{ (groups[g] = groups[g] || []).push(m); };
  (firstIds||[]).forEach(id=>{ if(RB_METRICS[id]) put('★ متغیرهای همین گزارش', RB_METRICS[id]); });
  list.forEach(m=>{ if(!(firstIds||[]).includes(m.id)) put(m.group, m); });
  return Object.entries(groups).map(([g, arr])=>`<optgroup label="${escHtml(g)}">${arr.map(m=>`<option value="${escHtml(m.id)}"${m.id===sel?' selected':''}>${escHtml(m.label)}</option>`).join('')}</optgroup>`).join('');
}

// ── controls ──
function rbReadControls(){
  const g = id=>document.getElementById(id);
  if(!g('rbDimension')) return;
  RB.dim = g('rbDimension').value || RB.dim;
  RB.dim2 = g('rbDimension2').value || '';
  RB.view = g('rbView').value || RB.view;
  RB.grain = g('rbGrain').value;
  RB.ndays = parseInt(g('rbNDays').value,10) || RB.ndays;
  RB.cumulative = g('rbCumulative').checked;
  RB.fillZero = g('rbFillZero').checked;
  RB.sort = g('rbSort').value;
  RB.limit = parseInt(g('rbLimit').value,10) || 0;
  RB.hideZero = g('rbHideZero').checked;
  RB.shareBase = g('rbShareBase').value === 'filtered' ? 'filtered' : 'all';
}
function rbWriteControls(){
  const g = id=>document.getElementById(id);
  if(!g('rbDimension')) return;
  rbSanitize();
  g('rbDimension').innerHTML = rbDimOptionsHtml(RB.dim, RB.metrics, false, RB.dim2);
  g('rbDimension').value = RB.dim;
  g('rbDimension2').innerHTML = rbDimOptionsHtml(RB.dim2, RB.metrics, true, RB.dim);
  g('rbDimension2').value = RB.dim2 || '';
  g('rbView').innerHTML = rbViewsFor(RB.dim, RB.dim2).map(v=>`<option value="${v}">${RB_VIEWS[v]}</option>`).join('');
  g('rbView').value = RB.view;
  g('rbGrain').value = RB.grain;
  g('rbNDays').value = RB.ndays;
  g('rbCumulative').checked = !!RB.cumulative;
  g('rbFillZero').checked = !!RB.fillZero;
  g('rbSort').value = RB.sort;
  g('rbLimit').value = String(RB.limit);
  g('rbHideZero').checked = !!RB.hideZero;
  g('rbShareBase').value = RB.shareBase;
  g('rbFrom').value = RB.from ? jShort(RB.from) : '';
  g('rbTo').value = RB.to ? jShort(RB.to) : '';
  const hasTime = RB.dim==='time' || RB.dim2==='time';
  g('rbTimeBox').style.display = hasTime ? 'block' : 'none';
  g('rbCumulativeWrap').style.display = (RB.dim==='time' && !RB.dim2) ? '' : 'none';
  g('rbNDaysWrap').style.display = (hasTime && RB.grain==='ndays') ? 'block' : 'none';
  g('rbCustomWrap').style.display = (hasTime && RB.grain==='custom') ? 'block' : 'none';
  g('rbCustomPick').style.display = (hasTime && RB.grain==='custom' && (PARTS.report_ranges||[]).length) ? 'flex' : 'none';
  g('rbHideZeroWrap').style.visibility = (RB.dim==='all') ? 'hidden' : 'visible';
  rbRenderRangeChips();
  rbRenderMetricChips();
  rbRenderWhere();
  rbRenderHaving();
  rbRenderAttrCols();
  rbRenderCustomPick();
  rbRenderPresetSelect();
  rbApplySecs();
  rbMetaRefresh();
}
function rbRenderAttrCols(){
  const box = document.getElementById('rbAttrColsBox'); if(!box) return;
  const ok = rbAttrColsOk(RB);
  box.style.display = ok ? '' : 'none';
  if(!ok) return;
  const chips = document.getElementById('rbAttrColChips'), sel = document.getElementById('rbAttrColAdd');
  chips.innerHTML = RB.attrCols.map(d=>`<span class="rb-chip"><span>${escHtml(rbDimLabelPlain(d))}</span><button type="button" onclick="rbAttrColDel('${d}')" title="حذف ستون">✕</button></span>`).join('') || '<span class="rb-muted">هنوز ستونی اضافه نکرده‌ای.</span>';
  sel.innerHTML = '<option value="">➕ افزودن ستون توصیفی…</option>' + RB_ATTR_DIMS.filter(d=>d!==RB.dim && !RB.attrCols.includes(d)).map(d=>`<option value="${d}">${escHtml(rbDimLabelPlain(d))}</option>`).join('');
}
function rbAttrColAdd(d){ if(!d) return; if(!RB.attrCols.includes(d)) RB.attrCols.push(d); rbWriteControls(); rbRender(); }
function rbAttrColDel(d){ RB.attrCols = RB.attrCols.filter(x=>x!==d); rbWriteControls(); rbRender(); }
function rbOnDimChange(){ rbReadControls(); rbSanitize(); RB.calMonth = null; rbWriteControls(); rbRender(); }
function rbOnViewChange(){ rbReadControls(); rbWriteControls(); rbRender(); }
function rbOnGrainChange(){ rbReadControls(); rbWriteControls(); rbRender(); }
function rbOnShareChange(){ rbReadControls(); rbMetaRefresh(); rbRender(); }

const rbSid = i=>'rbFk_'+i;
const rbQ = s=>String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
function rbChipThumb(dim, key){
  if(dim==='product' && productById(key)) return prodThumb(key);
  if(dim==='store' && storeById(key)) return storeThumb(key);
  if(dim==='agent' && key && agentById(key)) return agentThumb(key);
  return '';
}
function rbAttrDimsHtml(sel){
  return RB_FILTER_DIMS.map(d=>{ const ok = rbDimOk(d, RB.metrics); return `<option value="${d}"${d===sel?' selected':''}${ok||d===sel?'':' disabled'}>${escHtml(rbDimLabelPlain(d))}${ok?'':' (ناسازگار با متغیرها)'}</option>`; }).join('');
}
function rbCap(t, inner, cls){ return `<label class="rbx-f ${cls||''}"><span class="rbx-cap">${t}</span>${inner}</label>`; }
function rbAttrHtml(n, i){
  const vals = rbDimValues(n.dim), ent = entityOptions(n.dim);
  const chips = n.keys.map(k=>`<span class="rb-chip rb-chip-ent">${rbChipThumb(n.dim,k)}<span>${escHtml(dimKeyLabel(n.dim,k))}</span><button type="button" onclick="rbWKeyDel(${i},'${rbQ(escHtml(k))}')" title="حذف">✕</button></span>`).join('');
  const opts = vals.filter(v=>!n.keys.includes(v.key)).map(v=>{ const e = ent ? ent.find(z=>String(z.v)===v.key) : null; return `<option value="${escHtml(v.key)}"${ent?` data-img="${escHtml((e&&e.i)||'')}" data-icon="${ent[0]?ent[0].c:''}"`:''}>${escHtml(v.label)}</option>`; }).join('');
  RB_SSIDS.push(rbSid(i));
  return `<div class="rbx-cond attr">
    <div class="rbx-line">
      <span class="rbx-tag">ویژگی</span>
      ${rbCap('کدام ویژگی؟', `<select class="modal-input" onchange="rbWSet(${i},'dim',this.value)">${rbAttrDimsHtml(n.dim)}</select>`)}
      ${rbCap('حالت', `<select class="modal-input rbx-op" onchange="rbWSet(${i},'op',this.value)"><option value="in"${n.op==='in'?' selected':''}>فقط این‌ها باشد</option><option value="notin"${n.op==='notin'?' selected':''}>این‌ها نباشد</option></select>`)}
      ${rbCap('مقدارها', `<select class="modal-input" id="${rbSid(i)}" onchange="rbWKeyAdd(${i},this.value)"><option value="">➕ افزودن ${escHtml(rbDimLabelPlain(n.dim))}…</option>${opts}</select>`, 'rbx-grow')}
    </div>
    ${n.keys.length ? `<div class="rbx-chips">${chips}<button class="rb-link" type="button" onclick="rbWSet(${i},'keys',[])">پاک کردن همه</button></div>` : ''}
  </div>`;
}
function rbNumHtml(n, i){
  const E = RB_NUM_ENT[n.dim] || RB_NUM_ENT.product;
  const entOpts = RB_NUM_DIMS.map(d=>`<option value="${d}"${d===n.dim?' selected':''}>${escHtml(RB_NUM_ENT[d].label)}</option>`).join('');
  const vars = rbNumVars(n.dim), groups = {};
  vars.forEach(v=>(groups[v.group] = groups[v.group] || []).push(v));
  const varOpts = Object.entries(groups).map(([g, arr])=>`<optgroup label="${escHtml(g)}">${arr.map(v=>`<option value="${v.id}"${v.id===n.mid?' selected':''}>${escHtml(v.phrase)}</option>`).join('')}</optgroup>`).join('');
  const v = rbNumVar(n.dim, n.mid), unit = v ? (v.m.unit==='money' ? 'KT' : (v.m.unit==='pct' ? '٪' : '')) : '';
  const between = n.op==='between';
  const dj = (iso, ph, f)=>pjdpInput('', iso, `placeholder="${ph}" onchange="rbWSet(${i},'${f}',this.value)"`).replace('class="modal-input pjdp-in"','class="modal-input rbx-date"');
  return `<div class="rbx-cond num">
    <div class="rbx-line">
      <span class="rbx-tag num">عدد</span>
      ${rbCap('چه چیزی را بسنجم؟', `<select class="modal-input" onchange="rbWSet(${i},'dim',this.value)">${entOpts}</select>`)}
      ${rbCap('کدام عدد از آن؟', `<select class="modal-input" onchange="rbWSet(${i},'mid',this.value)"><option value="">— انتخاب کن —</option>${varOpts}</select>`, 'rbx-grow')}
      ${rbCap('مقایسه', `<select class="modal-input rbx-op" onchange="rbWSet(${i},'op',this.value)">${Object.entries(RB_NUM_OPS).map(([k,t])=>`<option value="${k}"${k===n.op?' selected':''}>${t}</option>`).join('')}</select>`)}
      ${rbCap(between?'از':'با عدد', `<input type="text" class="modal-input rbx-num-in" inputmode="decimal" dir="ltr" placeholder="${between?'حداقل':'عدد'}" value="${escHtml(n.v1)}" onchange="rbWSet(${i},'v1',this.value)"/>`)}
      ${between ? rbCap('تا', `<input type="text" class="modal-input rbx-num-in" inputmode="decimal" dir="ltr" placeholder="حداکثر" value="${escHtml(n.v2)}" onchange="rbWSet(${i},'v2',this.value)"/>`) : ''}
      ${unit ? `<span class="rbx-unit">${unit}</span>` : ''}
    </div>
    <div class="rbx-numsent">🗣 ${rbNumSentence(n)}</div>
    <div class="rb-muted" style="font-size:11px;margin-top:2px;">${escHtml(E.ex)}</div>
    <div class="rbx-sub-line">⏱ بازه‌ی سنجش:
      ${dj(n.from, 'از تاریخ', 'from')}
      تا ${dj(n.to, 'تا تاریخ', 'to')}
      <span class="rb-muted">اگر خالی بگذاری، همان بازه‌ی کل گزارش.</span>
    </div>
  </div>`;
}
function rbLeafShort(n){
  if(n.t==='attr'){
    const names = n.keys.slice(0,2).map(k=>dimKeyLabel(n.dim,k)).join('، ') + (n.keys.length>2 ? ' +'+faDigits(n.keys.length-2) : '');
    return `${rbDimLabelPlain(n.dim)} ${n.op==='notin' ? '≠' : '='} ${names||'؟'}`;
  }
  const m = RB_METRICS[n.mid], sym = {gt:'>', ge:'≥', lt:'<', le:'≤', eq:'=', ne:'≠', between:'∈'}[n.op]||'?';
  const val = n.op==='between' ? `[${n.v1} تا ${n.v2}]` : n.v1;
  const nv = rbNumVar(n.dim, n.mid); return `هر ${RB_NUM_ENT[n.dim] ? RB_NUM_ENT[n.dim].label : rbDimLabelPlain(n.dim)}: ${nv ? nv.phrase : '؟'} ${sym} ${val||'؟'}`;
}
// the condition as a discrete-math expression: «شرط ۱ AND (شرط ۲ OR شرط ۳)»
function rbMathHtml(t, mode, parent){
  if(!t) return '';
  if(t.t==='leaf'){
    return mode==='sk' ? `<span class="rbx-sk">C<sub>${t.i+1}</sub></span>` : `<span class="rbx-lf"><b>شرط ${faDigits(t.i+1)}</b> ${escHtml(rbLeafShort(t.it))}</span>`;
  }
  const s = t.kids.map(k=>rbMathHtml(k, mode, t.t)).join(` <b class="op">${t.t==='or' ? 'OR' : 'AND'}</b> `);
  return (parent && parent!==t.t) ? `<span class="pr">(</span>${s}<span class="pr">)</span>` : s;
}
function rbParBtn(i, k, n){
  const open = k==='po', cnt = n[k]||0;
  return `<button type="button" class="rbx-par ${open?'o':'c'}${cnt?' on':''}" onclick="rbWPar(${i},'${k}')" title="${open?'باز کردن پرانتز «(»':'بستن پرانتز «)»'} — هر کلیک یکی اضافه می‌کند و بعد از ۳ به صفر برمی‌گردد"><span dir="ltr">${(open?'(':')').repeat(Math.max(1,cnt))}</span></button>`;
}
function rbRenderWhere(){
  const el = document.getElementById('rbWhere'); if(!el) return;
  RB_SSIDS = [];
  const items = RB.where.items;
  const rows = items.map((n,i)=>{
    const lk = i===0 ? '' : `<div class="rbx-lkrow"><span class="rbx-seg"><button type="button" class="${n.lk!=='or'?'on':''}" onclick="rbWLk(${i},'and')" title="اشتراک: هر دو شرط باید برقرار باشند">و <small>AND</small></button><button type="button" class="${n.lk==='or'?'on':''}" onclick="rbWLk(${i},'or')" title="اجتماع: کافی است یکی برقرار باشد">یا <small>OR</small></button></span></div>`;
    return `${lk}<div class="rbx-row"><span class="rbx-badge">${faDigits(i+1)}</span>${rbParBtn(i,'po',n)}<div class="rbx-rowcard">${n.t==='num' ? rbNumHtml(n,i) : rbAttrHtml(n,i)}</div>${rbParBtn(i,'pc',n)}<button class="rbx-x" type="button" onclick="rbWDel(${i})" title="حذف این شرط">✕</button></div>`;
  }).join('');
  const r = rbExprParse(items);
  let read = '';
  if(items.length){
    if(!r.ok) read = `<div class="rbx-read err">⚠ ${escHtml(r.err)} — تعداد «(» و «)» باید برابر و درست‌چیده باشد، وگرنه هیچ شرطی اعمال نمی‌شود.</div>`;
    else {
      const t = rbPrune(r.tree);
      const hint = items.length>2 && !items.some(x=>x.po||x.pc) && items.some((x,i)=>i&&x.lk==='or') && items.some((x,i)=>i&&x.lk!=='or');
      const bad = items.map((n,i)=>[n,i]).filter(([n])=>!rbNodeActive(n));
      read = `<div class="rbx-read"><b>شرط نهایی (عبارت منطقی):</b>
        ${t ? `<div class="rbx-math">${rbMathHtml(t,'sk',null)}</div><div class="rbx-math">${rbMathHtml(t,'full',null)}</div>` : '<div class="rb-muted">— هنوز شرط کاملی نیست</div>'}
        ${hint ? '<div class="rb-muted" style="margin-top:4px;">بدون پرانتز، «AND» قبل از «OR» حساب می‌شود (مثل ریاضی: ضرب قبل از جمع).</div>' : ''}
        ${bad.length ? `<div class="rb-muted" style="margin-top:4px;">ناقص و نادیده گرفته‌شده: ${bad.map(([n,i])=>'شرط '+faDigits(i+1)).join('، ')}</div>` : ''}
        <ul class="rbx-legend">${items.map((n,i)=>rbNodeActive(n) ? `<li><b>${faDigits(i+1)}.</b> ${escHtml(rbLeafText(n))}</li>` : '').join('')}</ul></div>`;
    }
  }
  el.innerHTML = (rows || '<div class="rbx-empty">هنوز شرطی نگذاشته‌ای — همه‌ی داده‌ها وارد محاسبه می‌شوند.</div>') + read + `<div class="rbx-addbar">
      <button type="button" class="rb-chip rb-chip-add" onclick="rbWAdd('attr')">➕ شرط ویژگی <small>(برند، تامین‌کننده، خودرو، کالا…)</small></button>
      <button type="button" class="rb-chip rb-chip-add" onclick="rbWAdd('num')">➕ شرط عددی <small>(فروش، قیمت، موجودی…)</small></button></div>`;
  RB_SSIDS.forEach(id=>enhanceSearchSelect(id));
}
function rbWAfter(rerender){ if(rerender) rbRenderWhere(); rbMetaRefresh(); rbRender(); }
function rbWAdd(type){
  if(RB.where.items.length >= 40){ showToast('حداکثر ۴۰ شرط','error'); return; }
  if(type==='num'){
    const dim = 'product';
    RB.where.items.push({t:'num', dim, mid:'', op:'ge', v1:'', v2:'', from:'', to:'', lk:'and', po:0, pc:0});
  } else {
    const dim = ['product','store','agent','brand','car_model','category','part_type','customer'].find(d=>rbDimOk(d, RB.metrics)) || RB_FILTER_DIMS.find(d=>rbDimOk(d, RB.metrics)) || 'brand';
    RB.where.items.push({t:'attr', dim, op:'in', keys:[], lk:'and', po:0, pc:0});
  }
  rbWAfter(true);
}
function rbWDel(i){
  const its = RB.where.items, d = its[i]; if(!d) return;
  const net = (d.po||0) - (d.pc||0);
  its.splice(i, 1);
  if(net > 0 && its[i]) its[i].po = Math.min(3, (its[i].po||0) + net);
  if(net < 0 && its[i-1]) its[i-1].pc = Math.min(3, (its[i-1].pc||0) - net);
  rbWAfter(true);
}
function rbWLk(i, v){ const n = RB.where.items[i]; if(!n) return; n.lk = v==='or' ? 'or' : 'and'; rbWAfter(true); }
function rbWPar(i, k){ const n = RB.where.items[i]; if(!n) return; n[k] = ((n[k]||0) + 1) % 4; rbWAfter(true); }
function rbWSet(i, field, val){
  const n = RB.where.items[i]; if(!n) return;
  let rerender = false;
  if(field==='dim'){ n.dim = val; if(n.t==='attr') n.keys = []; else if(n.mid && !rbNumVar(val, n.mid)) n.mid = ''; rerender = true; }
  else if(field==='from' || field==='to'){
    const iso = parseDateInput(val);
    if(iso===null){ showToast('تاریخ نامعتبر','error'); rbRenderWhere(); return; }
    n[field] = iso || '';
    if(n.from && n.to && n.from > n.to){ showToast('تاریخ شروع باید قبل از پایان باشد','error'); n[field] = ''; }
    rerender = true;
  }
  else if(field==='v1' || field==='v2'){ n[field] = String(val).trim(); if(n[field] && rbParseNum(n[field])===null){ showToast('یک عدد معتبر وارد کن','error'); n[field] = ''; } rerender = true; }
  else { n[field] = val; rerender = (field==='op' || field==='mid' || field==='keys'); }
  rbWAfter(rerender);
}
function rbWKeyAdd(i, key){ const n = RB.where.items[i]; if(!n || !key) return; if(!n.keys.includes(key)) n.keys.push(key); rbWAfter(true); }
function rbWKeyDel(i, key){ const n = RB.where.items[i]; if(!n) return; n.keys = n.keys.filter(k=>k!==key); rbWAfter(true); }

// conditions on the result («شرط روی نتیجه»)
function rbRenderHaving(){
  const el = document.getElementById('rbHaving'); if(!el) return;
  const okList = rbMetricsFor(RB.dim, RB.dim2);
  const seg = RB.having.length > 1 ? `<div class="rbx-grp-h">ردیفی نمایش داده شود که <span class="rbx-seg"><button type="button" class="${RB.havingMode==='all'?'on':''}" onclick="rbHavingMode('all')">همه‌ی این‌ها <small>(و)</small></button><button type="button" class="${RB.havingMode==='any'?'on':''}" onclick="rbHavingMode('any')">هرکدام <small>(یا)</small></button></span></div>` : '';
  el.innerHTML = seg + RB.having.map((h,i)=>{
    const m = RB_METRICS[h.mid], unit = m ? (m.unit==='money' ? 'KT' : (m.unit==='pct' ? '٪' : '')) : '', between = h.op==='between';
    return `<div class="rbx-cond res"><div class="rbx-line">
      <span class="rbx-tag res">نتیجه</span>
      <select class="modal-input rbx-grow" onchange="rbHavingSet(${i},'mid',this.value)"><option value="">— متغیرِ نتیجه را انتخاب کن —</option>${rbMetricOptionsHtml(okList, h.mid, RB.metrics)}</select>
      <select class="modal-input rbx-op" onchange="rbHavingSet(${i},'op',this.value)">${Object.entries(RB_NUM_OPS).map(([k,v])=>`<option value="${k}"${k===h.op?' selected':''}>${v}</option>`).join('')}</select>
      <input type="text" class="modal-input rbx-num-in" inputmode="decimal" dir="ltr" placeholder="${between?'حداقل':'عدد'}" value="${escHtml(h.v1)}" onchange="rbHavingSet(${i},'v1',this.value)"/>
      ${between ? `<span class="rbx-mid">تا</span><input type="text" class="modal-input rbx-num-in" inputmode="decimal" dir="ltr" placeholder="حداکثر" value="${escHtml(h.v2)}" onchange="rbHavingSet(${i},'v2',this.value)"/>` : ''}
      ${unit ? `<span class="rbx-unit">${unit}</span>` : ''}
      <button class="rbx-x" type="button" onclick="rbHavingDel(${i})" title="حذف">✕</button></div></div>`;
  }).join('') + `<div class="rbx-addbar"><button type="button" class="rb-chip rb-chip-add" onclick="rbHavingAdd()" ${okList.length?'':'disabled'}>➕ شرط روی نتیجه <small>(روی هر متغیری، حتی اگر در جدول نباشد)</small></button></div>`;
}
function rbHavingAdd(){ RB.having.push({mid:'', op:'gt', v1:'', v2:''}); rbRenderHaving(); rbMetaRefresh(); }
function rbHavingMode(m){ RB.havingMode = m; rbRenderHaving(); rbMetaRefresh(); rbRender(); }
function rbHavingSet(i, k, v){
  const h = RB.having[i]; if(!h) return;
  if(k==='v1' || k==='v2'){ v = String(v).trim(); if(v && rbParseNum(v)===null){ showToast('یک عدد معتبر وارد کن','error'); v = ''; } }
  h[k] = v;
  if(k==='op' || k==='mid') rbRenderHaving();
  rbMetaRefresh(); rbRender();
}
function rbHavingDel(i){ RB.having.splice(i,1); rbRenderHaving(); rbMetaRefresh(); rbRender(); }

// ── custom metrics: modal ──
let RB_CM_EDIT = null;
function rbCmBaseList(){ return Object.values(RB_METRICS).filter(m=>!m.custom); }
function rbCmOpen(id){
  RB_CM_EDIT = id || null;
  const cm = id ? (PARTS.custom_metrics||[]).find(x=>x.id===id) : null;
  const g = i=>document.getElementById(i);
  g('rbCmName').value = cm ? cm.name : '';
  g('rbCmA').innerHTML = rbMetricOptionsHtml(rbCmBaseList(), cm ? cm.a : 'revenue');
  g('rbCmOp').innerHTML = Object.entries(RB_CM_OPS).map(([k,v])=>`<option value="${k}"${cm && cm.op===k?' selected':''}>${v}</option>`).join('');
  g('rbCmBType').value = cm ? cm.b_type : 'per';
  g('rbCmConst').value = cm && cm.b_type==='const' ? cm.const : '';
  g('rbCmPer').innerHTML = Object.entries(RB_PER).map(([k,v])=>`<option value="${k}"${cm && cm.per===k?' selected':(!cm&&k==='day'?' selected':'')}>${v.label}</option>`).join('');
  g('rbCmUnit').value = cm ? (cm.unit||'auto') : 'auto';
  g('rbCmPct').checked = !!(cm && cm.as_pct);
  rbCmChange(cm ? cm.b : null);
  rbCmRenderList();
  g('rbCmModalOverlay').classList.add('open');
}
function rbCmClose(){ document.getElementById('rbCmModalOverlay').classList.remove('open'); }
function rbCmChange(selB){
  const g = i=>document.getElementById(i), bt = g('rbCmBType').value, aId = g('rbCmA').value, A = RB_METRICS[aId];
  g('rbCmBMetricWrap').style.display = bt==='metric' ? '' : 'none';
  g('rbCmConstWrap').style.display = bt==='const' ? '' : 'none';
  g('rbCmPerWrap').style.display = bt==='per' ? '' : 'none';
  g('rbCmOpWrap').style.display = bt==='per' ? 'none' : '';
  const prev = selB || g('rbCmB').value;
  g('rbCmB').innerHTML = rbMetricOptionsHtml(rbCmBaseList().filter(m=>A && !!m.snap===!!A.snap), prev && RB_METRICS[prev] ? prev : '');
  const cur = (PARTS.custom_metrics||[]).find(x=>x.id===RB_CM_EDIT);
  rbCmPreview();
}
function rbCmDraft(){
  const g = i=>document.getElementById(i), bt = g('rbCmBType').value;
  const cm = {id:RB_CM_EDIT || 'c_'+Date.now(), name:g('rbCmName').value.trim(), a:g('rbCmA').value, op:g('rbCmOp').value, b_type:bt,
    b: bt==='metric' ? g('rbCmB').value : '', const: bt==='const' ? g('rbCmConst').value.trim() : '', per: bt==='per' ? g('rbCmPer').value : '',
    unit:g('rbCmUnit').value, as_pct:g('rbCmPct').checked};
  if(bt==='per') cm.op = 'div';
  return cm;
}
function rbCmPreview(){
  const el = document.getElementById('rbCmPreview'); if(!el) return;
  const cm = rbCmDraft();
  let txt = rbCmFormula(cm);
  try{
    if(cm.b_type==='const' && rbParseNum(cm.const)===null){ el.innerHTML = `<b>فرمول:</b> ${escHtml(txt)}<br><span class="rb-muted">یک عدد ثابت معتبر وارد کن.</span>`; return; }
    const keep = PARTS.custom_metrics; const tmp = Object.assign({}, cm, {id:'c_preview', name:cm.name||'پیش‌نمایش', const:rbParseNum(cm.const)});
    PARTS.custom_metrics = (keep||[]).filter(x=>x.id!==tmp.id).concat([tmp]); rbRegisterCustomMetrics();
    const r = rbCompute({dim:'all', metrics:['c_preview'], where:{t:'expr', items:[]}, having:[], rangeChip:'all', from:'', to:''}, true);
    PARTS.custom_metrics = keep; rbRegisterCustomMetrics();
    const m = r.metrics[0];
    el.innerHTML = `<b>فرمول:</b> ${escHtml(txt)}<br><b>مقدار روی کل داده‌ها (برای آزمایش):</b> ${m ? rbFmt(m.unit, r.total[0]) : '—'}`;
  }catch(e){ el.textContent = txt; }
}
async function rbCmSave(){
  const cm = rbCmDraft();
  if(!cm.name){ showToast('برای متغیر یک نام بنویس','error'); return; }
  if(cm.b_type==='const'){ const v = rbParseNum(cm.const); if(v===null){ showToast('عدد ثابت را درست وارد کن','error'); return; } cm.const = String(v); }
  if(cm.b_type==='metric' && !cm.b){ showToast('متغیر دوم را انتخاب کن','error'); return; }
  const list = (PARTS.custom_metrics||[]).filter(x=>x.id!==cm.id).concat([cm]);
  const d = await postParts('save_custom_metrics', {metrics:list});
  if(d && d.ok!==false){ showToast('متغیر ذخیره شد'); RB_CM_EDIT = null; rbCmClose(); rbWriteControls(); }
}
async function rbCmDelete(id){
  const cm = (PARTS.custom_metrics||[]).find(x=>x.id===id); if(!cm) return;
  if(!confirm('متغیر «'+cm.name+'» حذف شود؟ از گزارش‌های ذخیره‌شده هم برداشته می‌شود.')) return;
  const d = await postParts('save_custom_metrics', {metrics:(PARTS.custom_metrics||[]).filter(x=>x.id!==id)});
  if(d && d.ok!==false){ showToast('حذف شد'); rbCmRenderList(); rbWriteControls(); rbRender(); }
}
function rbCmRenderList(){
  const el = document.getElementById('rbCmList'); if(!el) return;
  const list = PARTS.custom_metrics||[];
  el.innerHTML = list.length ? list.map(cm=>`<div class="cash-ledger-item"><div class="cash-ledger-info"><div class="cash-ledger-note"><b>${escHtml(cm.name)}</b></div><div class="cash-ledger-date">${escHtml(rbCmFormula(cm))}</div></div>
    <button class="cash-ledger-del" style="color:var(--sky)" type="button" onclick="rbCmOpen('${escHtml(cm.id)}')" title="ویرایش">✎</button>
    <button class="cash-ledger-del" type="button" onclick="rbCmDelete('${escHtml(cm.id)}')" title="حذف">✕</button></div>`).join('')
    : '<div class="parts-table-empty" style="padding:10px;">هنوز متغیری نساخته‌ای.</div>';
}

// ── Entry points ────────────────────────────────────
function rbInit(){
  const dim = document.getElementById('rbDimension'); if(!dim || rbReady) return;
  dim.innerHTML = Object.entries(RB_DIMS).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('');
  rbReady = true;
  rbWriteControls();
}
// called by renderPartsAll() after every data refresh
function renderReportBuilder(){
  rbFacts = null; rbEnsureCustomMetrics();
  if(!rbReady) return;
  const sec = document.getElementById('partsSub-reportbuilder');
  if(!sec || sec.style.display === 'none') return;
  rbWriteControls(); rbRender();
}
function rbEnter(){ rbInit(); rbFacts = null; rbWriteControls(); rbRender(); }


// ══════════════════════════════════════════════════════
//  INVENTORY («انبار») + STOCK CARD («گردش کالا / کاردکس»)
// ══════════════════════════════════════════════════════
let invStatus = 'all';
const INV_STAGNANT_DAYS = 60;
const INV_STATUS_LABELS = {all:'همه', in:'موجود', low:'کم‌موجودی', out:'ناموجود', stagnant:'راکد (بدون فروش ۶۰ روز)'};

function invBuildRows(){
  const today = isoToday(), win = isoAdd(today, -29), stagCut = isoAdd(today, -INV_STAGNANT_DAYS);
  const lastBuy = {}, lastSell = {}, sold30 = {}, lastBuyPrice = {};
  (PARTS.purchases||[]).forEach(p=>(p.items||[]).forEach(it=>{
    const d = p.order_date || '';
    if(!lastBuy[it.product_id] || d >= lastBuy[it.product_id]){ lastBuy[it.product_id] = d; lastBuyPrice[it.product_id] = Number(it.unit_price)||0; }
  }));
  (PARTS.sales||[]).forEach(s=>(s.items||[]).forEach(it=>{
    const d = s.date || '';
    if(!lastSell[it.product_id] || d > lastSell[it.product_id]) lastSell[it.product_id] = d;
    if(d >= win && d <= today) sold30[it.product_id] = (sold30[it.product_id]||0) + (Number(it.qty)||0) - (Number(it.returned_qty)||0);
  }));
  const lowSet = new Set(PARTS.low_stock||[]);
  return PARTS.products.map(p=>{
    const stock = Number((PARTS.stock||{})[p.id])||0;
    let cost = Number((PARTS.avg_cost||{})[p.id])||0;
    if(!cost) cost = lastBuyPrice[p.id] || 0;
    const price = (p.sale_price===null||p.sale_price===undefined||p.sale_price==='') ? null : Number(p.sale_price);
    const s30 = sold30[p.id]||0;
    const out = stock <= 0;
    const low = !out && lowSet.has(p.id);
    const stagnant = !out && (!lastSell[p.id] || lastSell[p.id] < stagCut);
    return {p, stock, cost, value: stock*((PARTS.avg_cost||{})[p.id]||0), price,
      margin: (price && cost) ? (price-cost)/price*100 : null, potential: price!==null ? stock*price : 0,
      lastBuy: lastBuy[p.id]||'', lastSell: lastSell[p.id]||'', s30, cover: s30>0 ? stock/(s30/30) : null,
      status: out ? 'out' : (low ? 'low' : (stagnant ? 'stagnant' : 'in')), out, low, stagnant};
  });
}
function invFillFilters(){
  const fill = (id, values)=>{
    const sel = document.getElementById(id); if(!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">' + (sel.dataset.first || (sel.dataset.first = sel.options[0].textContent)) + '</option>';
    [...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fa')).forEach(v=>{ const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
    if([...sel.options].some(o=>o.value===cur)) sel.value = cur;
    ssSync(id);
  };
  fill('invFilterBrand', [...PARTS.brands.map(b=>b.name), ...PARTS.products.map(p=>p.brand)]);
  fill('invFilterCar', [...PARTS.car_models.map(c=>c.name), ...PARTS.products.flatMap(p=>productCarModels(p))]);
  fill('invFilterPartType', [...PARTS.part_types.map(t=>t.name), ...PARTS.products.map(p=>p.part_type)]);
  fill('invFilterCategory', [...PARTS.categories.map(c=>c.name), ...PARTS.products.map(p=>p.category)]);
  bndFillGroupSel('invFilterGroup');
}
function setInvStatus(s){ invStatus = s; renderInventory(); }
function clearInventoryFilters(){
  document.getElementById('invSearch').value = '';
  ['invFilterBrand','invFilterCar','invFilterPartType','invFilterCategory'].forEach(id=>{ document.getElementById(id).value = ''; ssSync(id); });
  document.getElementById('invFilterGroup').value = '';
  invStatus = 'all';
  renderInventory();
}
function invStatusPill(r){
  const m = {out:['out','ناموجود'], low:['low','کم‌موجودی'], stagnant:['stagnant','راکد'], in:['ok','موجود']}[r.status];
  return `<span class="stock-pill ${m[0]}">${m[1]}</span>`;
}
function renderInventory(){
  const tbody = document.querySelector('#invTable tbody'); if(!tbody) return;
  invFillFilters();
  const all = invBuildRows();
  // KPIs always describe the whole warehouse, not the filtered view
  const sum = (arr,f)=>arr.reduce((s,x)=>s+f(x),0);
  document.getElementById('invKpis').innerHTML = [
    ['تعداد کالا', fmtNum(all.length), 'var(--sky)'],
    ['جمع موجودی (عدد)', fmtNum(sum(all,r=>r.stock)), 'var(--sage)', 'inv_units'],
    ['ارزش موجودی (قیمت خرید)', fmtT(sum(all,r=>r.value)), 'var(--amber)', 'inventory_value'],
    ['ارزش بالقوه فروش', fmtT(sum(all,r=>r.potential)), 'var(--coral)', 'inv_potential_sales'],
    ['سود بالقوه', fmtT(sum(all,r=>r.potential)-sum(all,r=>r.price!==null?r.value:0)), 'var(--plum)', 'inv_potential_profit'],
    ['کم‌موجودی', fmtNum(all.filter(r=>r.low).length), 'var(--amber)'],
    ['ناموجود', fmtNum(all.filter(r=>r.out).length), 'var(--coral)'],
    ['راکد', fmtNum(all.filter(r=>r.stagnant).length), 'var(--plum)'],
  ].map(([l,v,c,xid])=>kpiCardHtml('',l,v,c,xid)).join('') + oversoldWarnHtml();
  document.getElementById('invStatusChips').innerHTML = Object.entries(INV_STATUS_LABELS).map(([k,l])=>{
    const n = k==='all' ? all.length : all.filter(r=>r.status===k).length;
    return `<button type="button" class="parts-range-chip${invStatus===k?' active':''}" onclick="setInvStatus('${k}')">${l} (${n})</button>`;
  }).join('');

  const q = (document.getElementById('invSearch').value||'').trim().toLowerCase();
  const fb = document.getElementById('invFilterBrand').value, fc = document.getElementById('invFilterCar').value,
        ft = document.getElementById('invFilterPartType').value, fg = document.getElementById('invFilterCategory').value, fgr = document.getElementById('invFilterGroup').value;
  document.getElementById('invClearBtn').style.display = (q||fb||fc||ft||fg||fgr||invStatus!=='all') ? '' : 'none';
  let rows = all.filter(r=>{
    const p = r.p;
    if(invStatus!=='all' && r.status!==invStatus) return false;
    if(fb && p.brand!==fb) return false;
    if(fc && !productCarModels(p).includes(fc)) return false;
    if(ft && p.part_type!==ft) return false;
    if(fg && p.category!==fg) return false;
    if(fgr && !(p.group_id && ptgDesc(fgr).includes(p.group_id))) return false;
    if(q){
      const hay = [p.name, p.brand, productCarModels(p).join(' '), p.group_id&&ptgById(p.group_id)?ptgLabel(p.group_id):'', p.oem_code, p.variant, p.notes].join(' ').toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
  const sort = document.getElementById('invSort').value;
  const nm = r=>productLabel(r.p);
  const cmp = {
    name:(a,b)=>nm(a).localeCompare(nm(b),'fa'), stock_asc:(a,b)=>a.stock-b.stock, stock_desc:(a,b)=>b.stock-a.stock,
    value_desc:(a,b)=>b.value-a.value, potential_desc:(a,b)=>b.potential-a.potential,
    cover_asc:(a,b)=>(a.cover===null?1e9:a.cover)-(b.cover===null?1e9:b.cover),
    last_sale_old:(a,b)=>(a.lastSell||'0000').localeCompare(b.lastSell||'0000'),
  }[sort] || (()=>0);
  rows.sort(cmp);
  const dash = '—';
  tbody.innerHTML = rows.map(r=>{
    const p = r.p;
    return `<tr>
      <td>${withThumb(prodThumb(p.id), '<b>'+escHtml(productLabel(p))+'</b>'+(p.oem_code?`<div class="rb-muted">${escHtml(p.oem_code)}</div>`:''))}</td>
      <td>${escHtml(p.brand||dash)}</td><td>${escHtml(productCarModels(p).join(' / ')||dash)}</td><td>${escHtml(p.category||dash)}</td>
      <td><b>${fmtNum(r.stock)}</b></td><td>${p.reorder_point!==null&&p.reorder_point!==undefined&&p.reorder_point!==''?fmtNum(p.reorder_point):fmtNum(PARTS.low_stock_threshold)+' <span class="rb-muted">(پیش‌فرض)</span>'}</td>
      <td>${invStatusPill(r)}</td>
      <td>${r.cost?fmtT(r.cost)+' '+xBtn('avg_cost',{pid:p.id},'xi-mini'):dash}</td><td>${fmtT(r.value)}</td><td>${r.price!==null?fmtT(r.price):dash}</td>
      <td>${r.margin!==null?fmtNum(r.margin)+'٪ '+xBtn('margin_item',{pid:p.id},'xi-mini'):dash}</td><td>${r.price!==null?fmtT(r.potential):dash}</td>
      <td>${r.lastBuy?jShort(r.lastBuy):dash}</td><td>${r.lastSell?jShort(r.lastSell):dash}</td>
      <td>${fmtNum(r.s30)}</td><td>${r.cover!==null?fmtNum(r.cover):dash}</td>
      <td style="white-space:nowrap;"><button class="parts-header-btn" type="button" onclick="openKardexFor('${p.id}')">🧾 گردش</button> <button class="parts-header-btn" type="button" onclick="openProductModal('${p.id}')">ویرایش</button></td>
    </tr>`;
  }).join('') || `<tr><td colspan="17" class="parts-table-empty">${all.length?'کالایی با این فیلترها پیدا نشد.':'هنوز کالایی ثبت نشده.'}</td></tr>`;
  const tf = document.querySelector('#invTable tfoot');
  tf.innerHTML = rows.length ? `<tr><td><b>جمع (${rows.length} کالا)</b></td><td></td><td></td><td></td><td><b>${fmtNum(sum(rows,r=>r.stock))}</b></td><td></td><td></td><td></td>
    <td><b>${fmtT(sum(rows,r=>r.value))}</b></td><td></td><td></td><td><b>${fmtT(sum(rows,r=>r.potential))}</b></td><td></td><td></td><td><b>${fmtNum(sum(rows,r=>r.s30))}</b></td><td></td><td></td></tr>` : '';
}

// ── Stock card ──────────────────────────────────────
function openKardexFor(pid){
  const sel = document.getElementById('kdProduct');
  renderKardex();
  sel.value = pid; ssSync('kdProduct');
  showPartsSub('kardex');
}
function kardexEvents(pid){
  const ev = [];
  let seq = 0;
  (PARTS.purchases||[]).forEach(p=>(p.items||[]).forEach(it=>{
    if(pid && it.product_id!==pid) return;
    const st = storeById(p.store_id);
    ev.push({date:p.order_date||'', ord:0, seq:seq++, type:'purchase', pid:it.product_id, who:(st?st.name:'(فروشگاه حذف‌شده)')+(p.po_no?' · سفارش #'+p.po_no:''),
      in:Number(it.qty)||0, out:0, price:Number(it.unit_price)||0, amount:(Number(it.qty)||0)*(Number(it.unit_price)||0)});
  }));
  const saleById = {};
  (PARTS.sales||[]).forEach(s=>{ saleById[s.id] = s; (s.items||[]).forEach(it=>{
    if(pid && it.product_id!==pid) return;
    ev.push({date:s.date||'', ord:1, seq:seq++, type:'sale', pid:it.product_id, who:(s.customer_name||'مشتری متفرقه')+(s.invoice_no?' · فاکتور #'+s.invoice_no:''),
      in:0, out:Number(it.qty)||0, price:Number(it.unit_price)||0, amount:Math.max((Number(it.qty)||0)*(Number(it.unit_price)||0)-(Number(it.discount)||0),0)});
  }); });
  (PARTS.sale_returns||[]).forEach(r=>{
    const s = saleById[r.sale_id]; if(!s) return;
    const date = (r.date && r.date > (s.date||'')) ? r.date : (s.date||'');
    (r.items||[]).forEach(it=>{
      if(pid && it.product_id!==pid) return;
      const restock = r.restock !== false;
      ev.push({date, ord:2, seq:seq++, type:'return', pid:it.product_id, who:(s.customer_name||'مشتری متفرقه')+' · '+(r.reason||'مرجوعی')+(restock?'':' (بدون ورود به انبار)'),
        in:restock?(Number(it.qty)||0):0, out:0, noStock:!restock, qty:Number(it.qty)||0, price:Number(it.refund_unit_price)||0, amount:(Number(it.qty)||0)*(Number(it.refund_unit_price)||0)});
    });
  });
  ev.sort((a,b)=>a.date.localeCompare(b.date) || a.ord-b.ord || a.seq-b.seq);
  return ev;
}
const KD_TYPE_LABEL = {purchase:'🟢 خرید', sale:'🔴 فروش', return:'🟡 مرجوعی'};
function renderKardex(){
  const sel = document.getElementById('kdProduct'); if(!sel) return;
  const cur = sel.value;
  const opts = PARTS.products.slice().sort((a,b)=>productLabel(a).localeCompare(productLabel(b),'fa'));
  sel.innerHTML = '<option value="">همه‌ی کالاها</option>' + opts.map(p=>`<option value="${p.id}" data-img="${escHtml(p.image||'')}" data-icon="📦">${escHtml(productLabel(p))}</option>`).join('');
  if(opts.some(p=>p.id===cur)) sel.value = cur;
  if(!sel._ssEnabled) enhanceSearchSelect('kdProduct');
  ssSync('kdProduct');
  const pid = sel.value, type = document.getElementById('kdType').value;
  const ev = kardexEvents(pid);
  let bal = 0, tin = 0, tout = 0;
  const withBal = ev.map(e=>{ bal += e.in - e.out; tin += e.in; tout += e.out; return Object.assign({}, e, {bal}); });
  const shown = withBal.filter(e=>!type || e.type===type);
  const sys = pid ? (Number((PARTS.stock||{})[pid])||0) : null;
  const kpis = [['جمع ورودی', fmtNum(tin), 'var(--sage)'], ['جمع خروجی', fmtNum(tout), 'var(--coral)']];
  if(pid){
    kpis.push(['موجودی طبق گردش', fmtNum(bal), 'var(--sky)'], ['موجودی ثبت‌شده در انبار', fmtNum(sys), 'var(--amber)']);
  } else kpis.push(['تعداد رویداد', fmtNum(ev.length), 'var(--sky)']);
  document.getElementById('kdKpis').innerHTML = kpis.map(([l,v,c])=>`<div class="parts-kpi-card" style="--kpi-color:${c};"><div class="parts-kpi-label">${l}</div><div class="parts-kpi-val" style="color:${c};">${v}</div></div>`).join('')
    + (pid && Math.abs(bal-sys) > 1e-6 ? `<div class="rb-warn" style="grid-column:1/-1;">⚠️ موجودی طبق گردش با موجودی انبار فرق دارد؛ معمولاً یعنی فروشی بیشتر از موجودی ثبت شده (قبل از ثبت خرید) است.</div>` : '');
  const prodName = id=>{ const p = productById(id); return p ? productLabel(p) : '(کالای حذف‌شده)'; };
  document.querySelector('#kdTable tbody').innerHTML = shown.map(e=>`<tr>
    <td>${e.date?jShort(e.date):'—'}</td><td>${KD_TYPE_LABEL[e.type]}</td><td>${prodCell(e.pid)}</td><td>${escHtml(e.who)}</td>
    <td class="kd-in">${e.in?fmtNum(e.in):(e.noStock?'<span class="rb-muted">'+fmtNum(e.qty)+' (بدون ورود)</span>':'')}</td><td class="kd-out">${e.out?fmtNum(e.out):''}</td>
    <td>${pid?`<b style="${e.bal<0?'color:var(--coral)':''}">${fmtNum(e.bal)}</b>`:'—'}</td><td>${fmtT(e.price)}</td><td>${fmtT(e.amount)}</td></tr>`).join('')
    || `<tr><td colspan="9" class="parts-table-empty">رویدادی ثبت نشده.</td></tr>`;
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
      <button class="cash-ledger-del" onclick="deleteReconciliation('${r.id}')" title="حذف">✕</button>
    </div>`).join('');
}

const SUBNAV_GROUPS = {
  inventory: ['stockview','kardex'],
  catalog: ['carmodels','brands','parttypes','categories','productgroups','genericitems'],
  parties: ['stores','agents','customers'],
  buying: ['pricelists','compare','purchase'],
  selling: ['quotes','sales','bundles','returns'],
  finance: ['expenses','cash','ledger'],
  analysis: ['variables','reportbuilder','reports'],
};
const PARTS_SUBS = ['products','stockview','kardex','carmodels','brands','parttypes','categories','genericitems','stores','agents','customers','pricelists','compare','purchase','quotes','sales','returns','expenses','cash','ledger','variables','reportbuilder','reports','calendar','productgroups','bundles'];
function showPartsSub(name){
  partsCurrentSub = name;
  PARTS_SUBS.forEach(sub=>{
    const el = document.getElementById('partsSub-'+sub);
    if(el) el.style.display = sub===name ? 'block' : 'none';
  });
  document.querySelectorAll('.parts-subtab[data-sub], .subnav-dropdown button[data-sub]').forEach(b=>b.classList.toggle('active', b.dataset.sub===name));
  const ownerGroup = Object.entries(SUBNAV_GROUPS).find(([,items])=>items.includes(name));
  document.querySelectorAll('.parts-subtab.group-btn').forEach(b=>{
    const g = b.closest('.parts-subnav-group').dataset.group;
    b.classList.toggle('has-active', !!ownerGroup && ownerGroup[0]===g);
  });
  if(name==='reports') renderReports();
  if(name==='stockview') renderInventory();
  if(name==='kardex') renderKardex();
  if(name==='reportbuilder') rbEnter();
  if(name==='calendar') pcalEnter();
  if(name==='productgroups') ptgEnter();
  if(name==='bundles') bndEnter();
}

// ── Sub-navigation dropdowns ────────────────────────
// On devices with a real pointer the menus are HOVER-ONLY (pure CSS): clicking
// a group heading does nothing, and only the menu under the pointer is open.
// On touch screens (no hover) a tap toggles the one menu, and closes the others.
const subnavIsTouch = ()=>window.matchMedia && window.matchMedia('(hover: none)').matches;
function closeAllSubnavGroups(){
  document.querySelectorAll('.subnav-dropdown.open').forEach(d=>d.classList.remove('open'));
}
function toggleSubnavGroup(g, ev){
  if(ev) ev.stopPropagation();
  if(!subnavIsTouch()) return;            // mouse: click has no effect at all
  const dd = document.getElementById('subnavDropdown-'+g);
  if(!dd) return;
  const wasOpen = dd.classList.contains('open');
  closeAllSubnavGroups();
  if(!wasOpen) dd.classList.add('open');
}
function pickSubnavItem(sub){
  showPartsSub(sub);
  closeAllSubnavGroups();
  // keep the menu closed until the pointer leaves it, even though it is still hovered / focused
  const nav = document.getElementById('partsSubnav');
  if(nav){
    const grp = nav.querySelector('.parts-subnav-group:hover') || nav.querySelector('.parts-subnav-group:focus-within');
    if(grp) grp.classList.add('just-picked');
    if(document.activeElement && nav.contains(document.activeElement)) document.activeElement.blur();
  }
}
let subnavBound = false;
function initSubnavBehaviour(){
  if(subnavBound) return;
  const nav = document.getElementById('partsSubnav');
  if(!nav) return;
  subnavBound = true;
  nav.querySelectorAll('.parts-subnav-group').forEach(grp=>{
    grp.addEventListener('mouseleave', ()=>grp.classList.remove('just-picked'));
  });
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
  if(refType==='group') return ptgById(refId) ? ('🌳 '+ptgLabel(refId)) : '(گروه حذف‌شده)';
  if(refType==='generic'){ const g=genericById(refId); return g ? ('🏷️ '+g.name) : '(کالای کلی حذف‌شده)'; }
  const p = productById(refId); return p ? ('📦 '+productLabel(p)) : '(کالای حذف‌شده)';
}
function refKey(refType, refId){ return refType+':'+refId; }
const peRefId = e=>e.ref_type==='generic' ? e.generic_id : (e.ref_type==='group' ? e.group_id : e.product_id);
const peSource = e=>e.ref_type+':'+peRefId(e);
function priceEntriesFor(refType, refId){
  if(refType==='group'){
    const gs = new Set(ptgDesc(refId)), pids = new Set(PARTS.products.filter(p=>gs.has(p.group_id)).map(p=>p.id));
    return PARTS.price_entries.filter(e=>(e.ref_type==='group' && gs.has(e.group_id)) || (e.ref_type==='product' && pids.has(e.product_id)));
  }
  return PARTS.price_entries.filter(e=>e.ref_type===refType && peRefId(e)===refId);
}
// supplier → their cheapest CURRENT quote (for a group: cheapest among each product's latest quote)
function priceOffersFor(refType, refId){
  const latest = {};
  priceEntriesFor(refType, refId).forEach(e=>{ const k = e.store_id+'|'+peSource(e); const c = latest[k]; if(!c || (e.date||'')>(c.date||'')) latest[k] = e; });
  const byStore = {};
  Object.values(latest).forEach(e=>{ const c = byStore[e.store_id]; if(!c || e.price<c.price) byStore[e.store_id] = e; });
  return byStore;
}
const peSourceLabel = e=>e.ref_type==='product' ? (productById(e.product_id) ? productLabel(productById(e.product_id)) : '(کالای حذف‌شده)') : refLabel(e.ref_type, peRefId(e));
const CAR_MODEL_SEP = '|'; // stored inside the single car_model text field so it survives backends that only know that one field
function productCarModels(p){
  // Multi-select car models are packed into the existing car_model string, separated by CAR_MODEL_SEP.
  if(!p || !p.car_model) return [];
  return String(p.car_model).split(CAR_MODEL_SEP).map(s=>s.trim()).filter(Boolean);
}
function productLabel(p){
  if(!p) return '(کالای حذف‌شده)';
  const parts = [p.part_type, productCarModels(p).join('/'), p.brand, p.variant ? '('+p.variant+')' : ''].filter(Boolean);
  return p.name || parts.join(' — ') || 'کالای بدون نام';
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
  bndFillGroupSel('partsFilterGroup');
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
  const fGroup = document.getElementById('partsFilterGroup').value;

  const clearBtn = document.getElementById('ptClearFiltersBtn');
  if(clearBtn) clearBtn.style.display = (q||fCar||fBrand||fPartType||fCat||fGroup) ? 'inline-block' : 'none';

  let list = PARTS.products.filter(p=>{
    if(fCar && !productCarModels(p).includes(fCar)) return false;
    if(fBrand && p.brand !== fBrand) return false;
    if(fPartType && p.part_type !== fPartType) return false;
    if(fCat && p.category !== fCat) return false;
    if(fGroup && !(p.group_id && ptgDesc(fGroup).includes(p.group_id))) return false;
    if(q){
      const hay = [p.name,productCarModels(p).join(' '),p.brand,p.group_id&&ptgById(p.group_id)?ptgLabel(p.group_id):'',p.variant,p.oem_code,p.notes].join(' ').toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });

  const bndCoAll = bndCo(bndBaskets());
  grid.innerHTML = '';
  if(!list.length){
    grid.innerHTML = '<div class="parts-empty"><div class="pe-icon">🔩</div><div class="pe-text">هنوز کالایی تعریف نکردی — با «+ افزودن کالا» اولین قطعه‌ات رو بساز.</div></div>';
    renderBulkBar();
    return;
  }
  list.forEach(p=>{
    const stock = PARTS.stock[p.id] || 0;
    const cost = PARTS.avg_cost[p.id] || 0;
    const thresh = PARTS.low_stock_threshold;
    const stockClass = stock<=0 ? 'out' : (stock<=thresh ? 'low' : 'ok');
    const stockIcon = stock<=0 ? '✕' : (stock<=thresh ? '⚠' : '●');
    const stockLabel = stock<=0 ? 'ناموجود' : (stock + ' عدد موجود');
    const stripeColor = hashColor((p.group_id && ptgPath(p.group_id)[0]) || p.brand);
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
          ${p.group_id && ptgById(p.group_id) ? `<span class="part-badge" style="background:${stripeColor}22;color:${stripeColor}" title="${escHtml(ptgLabel(p.group_id))}">🌳 ${escHtml(ptgLabel(p.group_id))}</span>` : ''}
          ${p.oem_code ? `<span class="part-badge">${escHtml(p.oem_code)}</span>` : ''}
        </div>
        <div class="part-card-stock ${stockClass}">${stockIcon} ${stockLabel}</div>
        ${stock>0 ? `<div class="part-card-cost">میانگین قیمت خرید ${fmtT(cost)}</div>` : ''}
        ${p.sale_price ? `<div class="part-card-cost" style="color:var(--good,#2f9e5b);font-weight:700;">قیمت فروش ${fmtT(p.sale_price)}${cost>0 ? ` · مارجین ${(((p.sale_price-cost)/p.sale_price)*100).toFixed(0)}%` : ''}</div>` : ''}
        ${cost>0 ? renderPricingCalcBlock(p, cost) : ''}
        ${bndCardBlock(p.id, bndCoAll)}
      </div>
      <div class="part-card-actions">
        ${p.torob_link ? `<a href="${escHtml(p.torob_link)}" target="_blank" rel="noopener" style="flex:1;padding:7px;border-radius:8px;border:1.5px solid var(--cream3);background:var(--cream2);font-size:11px;font-weight:600;color:var(--text2);text-align:center;text-decoration:none;">ترب ↗</a>` : ''}
        <button onclick="openProductModal('${p.id}')">✎ ویرایش</button>
        <button class="del" onclick="deleteProduct('${p.id}')">🗑 حذف</button>
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
    <div class="pricing-calc-row"><span>🧮 قیمت پیشنهادی ${customBadge}</span><span class="pricing-calc-price">${fmtT(r.price)} ${xBtn('suggested_price',{pid:p.id, cost},'xi-mini')}</span></div>
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
  document.getElementById('partsFilterGroup').value = '';
  renderPartsProducts();
}

function escHtml(s){
  if(s==null) return '';
  return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function deleteProduct(id){
  postParts('delete_product',{id});
  showToast('کالا حذف شد','success');
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
  document.getElementById('productModalTitle').textContent = id ? 'ویرایش کالا' : 'افزودن کالا';
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
    pfGroupRender(p.group_id||'');
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
    pfGroupRender('');
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
    wrap.innerHTML = '<div style="font-size:12px;color:var(--text4);font-style:italic;">هنوز مدل خودرویی تعریف نشده — اول از بخش «مدل‌های خودرو» اضافه کن.</div>';
    return;
  }
  const f = (carModelTagFilter||'').trim().toLowerCase();
  const visible = PARTS.car_models.filter(cm=>!f || cm.name.toLowerCase().includes(f));
  if(!visible.length){
    wrap.innerHTML = '<div style="font-size:12px;color:var(--text4);font-style:italic;">مدل خودرویی با این جستجو پیدا نشد.</div>';
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
    grid.innerHTML = '<div class="parts-empty"><div class="pe-icon">🚗</div><div class="pe-text">هنوز مدل خودرویی تعریف نکردی — با «+ افزودن مدل خودرو» اولین مدل رو بساز.</div></div>';
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
        <div class="store-card-row"><span class="lbl">🔩</span>${usedBy ? usedBy+' کالا' : 'هنوز هیچ کالایی از این استفاده نکرده'}</div>
        <div class="store-card-actions">
          <button onclick="openCarModelModal('${cm.id}')">✎ ویرایش</button>
          <button class="del" onclick="deleteCarModelEntry('${cm.id}')">🗑 حذف</button>
        </div>
      </div>`;
    grid.appendChild(el);
  });
}
function openCarModelModal(id){
  document.getElementById('carModelModalId').value = id||'';
  document.getElementById('carModelModalTitle').textContent = id ? 'ویرایش مدل خودرو' : 'افزودن مدل خودرو';
  document.getElementById('cmfName').value = id ? (PARTS.car_models.find(c=>c.id===id)||{}).name||'' : '';
  document.getElementById('carModelModalOverlay').classList.add('open');
}
function closeCarModelModal(){ document.getElementById('carModelModalOverlay').classList.remove('open'); }
async function saveCarModelModal(){
  const id = document.getElementById('carModelModalId').value;
  const name = document.getElementById('cmfName').value.trim();
  if(!name){ showToast('برای مدل خودرو یک نام بنویس','error'); return; }
  const dupe = PARTS.car_models.find(c=>c.name.toLowerCase()===name.toLowerCase() && c.id!==id);
  if(dupe){ showToast('این مدل خودرو قبلاً ثبت شده','error'); return; }
  if(id){ await postParts('update_car_model', {id, name}); }
  else { await postParts('add_car_model', {name}); }
  closeCarModelModal();
  showToast(id ? 'مدل خودرو ویرایش شد' : 'مدل خودرو اضافه شد','success');
}
function deleteCarModelEntry(id){
  const cm = PARTS.car_models.find(c=>c.id===id);
  if(cm){
    const usedBy = PARTS.products.filter(p=>productCarModels(p).includes(cm.name)).length;
    if(usedBy && !confirm(`${usedBy} کالا هنوز از «${cm.name}» استفاده می‌کنند. با این حال از لیست حذف شود؟ کالاهای موجود همان نوشته را نگه می‌دارند اما دیگر قابل انتخاب نخواهد بود.`)) return;
  }
  postParts('delete_car_model',{id});
  showToast('مدل خودرو حذف شد','success');
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
    grid.innerHTML = '<div class="parts-empty"><div class="pe-icon">🏷️</div><div class="pe-text">هنوز برندی تعریف نکردی — با «+ افزودن برند» اولین برند رو بساز.</div></div>';
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
        <div class="store-card-row"><span class="lbl">🔩</span>${usedBy ? usedBy+' کالا' : 'هنوز هیچ کالایی از این استفاده نکرده'}</div>
        <div class="store-card-actions">
          <button onclick="openBrandModal('${b.id}')">✎ ویرایش</button>
          <button class="del" onclick="deleteBrandEntry('${b.id}')">🗑 حذف</button>
        </div>
      </div>`;
    grid.appendChild(el);
  });
}
function openBrandModal(id, returnTo){
  brandModalReturnTo = returnTo || null;
  document.getElementById('brandModalId').value = id||'';
  document.getElementById('brandModalTitle').textContent = id ? 'ویرایش برند' : 'افزودن برند';
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
  if(!name){ showToast('برای برند یک نام بنویس','error'); return; }
  const dupe = PARTS.brands.find(b=>b.name.toLowerCase()===name.toLowerCase() && b.id!==id);
  if(dupe){ showToast('این برند قبلاً ثبت شده','error'); return; }
  const prevIds = new Set(PARTS.brands.map(b=>b.id));
  const returnTo = brandModalReturnTo;
  if(id){ await postParts('update_brand', {id, name}); }
  else { await postParts('add_brand', {name}); }
  closeBrandModal();
  showToast(id ? 'برند ویرایش شد' : 'برند اضافه شد','success');
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
    if(usedBy && !confirm(`${usedBy} کالا هنوز از «${b.name}» استفاده می‌کنند. با این حال از لیست حذف شود؟ کالاهای موجود همان نوشته را نگه می‌دارند اما دیگر قابل انتخاب نخواهد بود.`)) return;
  }
  postParts('delete_brand',{id});
  showToast('برند حذف شد','success');
}
function renderBrandSelect(selected){
  const sel = document.getElementById('pfBrand');
  if(!sel) return;
  const names = PARTS.brands.map(b=>b.name);
  // Keep a legacy brand name selectable even if it isn't in the managed list yet.
  if(selected && !names.includes(selected)) names.unshift(selected);
  sel.innerHTML = '<option value="">— بدون برند —</option>' +
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
    grid.innerHTML = '<div class="parts-empty"><div class="pe-icon">🔧</div><div class="pe-text">هنوز نوع قطعه‌ای تعریف نکردی — با «+ افزودن نوع قطعه» اولین مورد رو بساز.</div></div>';
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
        <div class="store-card-row"><span class="lbl">🔩</span>${usedBy ? usedBy+' کالا' : 'هنوز هیچ کالایی از این استفاده نکرده'}</div>
        <div class="store-card-actions">
          <button onclick="openPartTypeModal('${t.id}')">✎ ویرایش</button>
          <button class="del" onclick="deletePartTypeEntry('${t.id}')">🗑 حذف</button>
        </div>
      </div>`;
    grid.appendChild(el);
  });
}
function openPartTypeModal(id, returnTo){
  partTypeModalReturnTo = returnTo || null;
  document.getElementById('partTypeModalId').value = id||'';
  document.getElementById('partTypeModalTitle').textContent = id ? 'ویرایش نوع قطعه' : 'افزودن نوع قطعه';
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
  if(!name){ showToast('برای نوع قطعه یک نام بنویس','error'); return; }
  const dupe = PARTS.part_types.find(t=>t.name.toLowerCase()===name.toLowerCase() && t.id!==id);
  if(dupe){ showToast('این نوع قطعه قبلاً ثبت شده','error'); return; }
  const prevIds = new Set(PARTS.part_types.map(t=>t.id));
  const returnTo = partTypeModalReturnTo;
  if(id){ await postParts('update_part_type', {id, name}); }
  else { await postParts('add_part_type', {name}); }
  closePartTypeModal();
  showToast(id ? 'نوع قطعه ویرایش شد' : 'نوع قطعه اضافه شد','success');
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
    if(usedBy && !confirm(`${usedBy} کالا هنوز از «${t.name}» استفاده می‌کنند. با این حال از لیست حذف شود؟ کالاهای موجود همان نوشته را نگه می‌دارند اما دیگر قابل انتخاب نخواهد بود.`)) return;
  }
  postParts('delete_part_type',{id});
  showToast('نوع قطعه حذف شد','success');
}
function renderPartTypeSelect(selected){
  const sel = document.getElementById('pfPartType');
  if(!sel) return;
  const names = PARTS.part_types.map(t=>t.name);
  if(selected && !names.includes(selected)) names.unshift(selected);
  sel.innerHTML = '<option value="">— بدون نوع قطعه —</option>' +
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
    grid.innerHTML = '<div class="parts-empty"><div class="pe-icon">🗂️</div><div class="pe-text">هنوز دسته‌بندی‌ای تعریف نکردی — با «+ افزودن دسته‌بندی» اولین دسته رو بساز.</div></div>';
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
        <div class="store-card-row"><span class="lbl">🔩</span>${usedBy ? usedBy+' کالا' : 'هنوز هیچ کالایی از این استفاده نکرده'}</div>
        <div class="store-card-actions">
          <button onclick="openCategoryModal('${c.id}')">✎ ویرایش</button>
          <button class="del" onclick="deleteCategoryEntry('${c.id}')">🗑 حذف</button>
        </div>
      </div>`;
    grid.appendChild(el);
  });
}
function openCategoryModal(id, returnTo){
  categoryModalReturnTo = returnTo || null;
  document.getElementById('categoryModalId').value = id||'';
  document.getElementById('categoryModalTitle').textContent = id ? 'ویرایش دسته‌بندی' : 'افزودن دسته‌بندی';
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
  if(!name){ showToast('برای دسته‌بندی یک نام بنویس','error'); return; }
  const dupe = PARTS.categories.find(c=>c.name.toLowerCase()===name.toLowerCase() && c.id!==id);
  if(dupe){ showToast('این دسته‌بندی قبلاً ثبت شده','error'); return; }
  const prevIds = new Set(PARTS.categories.map(c=>c.id));
  const returnTo = categoryModalReturnTo;
  if(id){ await postParts('update_category', {id, name}); }
  else { await postParts('add_category', {name}); }
  closeCategoryModal();
  showToast(id ? 'دسته‌بندی ویرایش شد' : 'دسته‌بندی اضافه شد','success');
  if(!id && returnTo==='product'){
    const newCat = PARTS.categories.find(c=>!prevIds.has(c.id));
    if(newCat){ renderCategorySelect(newCat.name); }
  }
}
function deleteCategoryEntry(id){
  const c = PARTS.categories.find(x=>x.id===id);
  if(c){
    const usedBy = PARTS.products.filter(p=>p.category===c.name).length;
    if(usedBy && !confirm(`${usedBy} کالا هنوز از «${c.name}» استفاده می‌کنند. با این حال از لیست حذف شود؟ کالاهای موجود همان نوشته را نگه می‌دارند اما دیگر قابل انتخاب نخواهد بود.`)) return;
  }
  postParts('delete_category',{id});
  showToast('دسته‌بندی حذف شد','success');
}
function renderCategorySelect(selected){
  const sel = document.getElementById('pfCategory');
  if(!sel) return;
  const names = PARTS.categories.map(c=>c.name);
  if(selected && !names.includes(selected)) names.unshift(selected);
  sel.innerHTML = '<option value="">— بدون دسته‌بندی —</option>' +
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
    showToast('برای کالا حداقل یک نام یا نوع قطعه بنویس','error'); return;
  }
  const payload = {
    part_type: partType, car_model: carModels.join(CAR_MODEL_SEP),
    brand: document.getElementById('pfBrand').value.trim(),
    variant: document.getElementById('pfVariant').value.trim(),
    oem_code: document.getElementById('pfOemCode').value.trim(),
    category: document.getElementById('pfCategory').value.trim(),
    group_id: document.getElementById('pfGroup').value || '',
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
  showToast(id ? 'کالا ویرایش شد' : 'کالا اضافه شد','success');

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
        <div class="store-card-row"><span class="lbl">💸</span>جمع خرید: ${fmtT(spend)}</div>
        ${Number(s.shipping_cost)>0 ? `<div class="store-card-row"><span class="lbl">🚚</span>هزینه ارسال ${fmtT(s.shipping_cost)}${Number(s.free_shipping_min)>0 ? ` · رایگان بالای ${fmtT(s.free_shipping_min)}` : ''}</div>` : ''}
        <div class="store-card-links">
          ${s.torob_link ? `<a href="${escHtml(s.torob_link)}" target="_blank" rel="noopener">ترب ↗</a>` : ''}
          ${s.website ? `<a href="${escHtml(s.website)}" target="_blank" rel="noopener">وب‌سایت ↗</a>` : ''}
        </div>
        <div class="store-card-actions">
          <button onclick="openStoreModal('${s.id}')">✎ ویرایش</button>
          <button class="del" onclick="deleteStore('${s.id}')">🗑 حذف</button>
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
    : '<option value="">— اول یک فروشگاه اضافه کن —</option>';
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
          <button onclick="openAgentModal('${a.id}')">✎ ویرایش</button>
          <button class="del" onclick="deleteAgent('${a.id}')">🗑 حذف</button>
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
          <button onclick="openCustomerModal('${c.id}')">✎ ویرایش</button>
          <button class="del" onclick="deleteCustomer('${c.id}')">🗑 حذف</button>
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
    : '<option value="">— اول یک کالا اضافه کن —</option>';

  const pSel = document.getElementById('purchaseItemProduct');
  const pCur = pSel.value; pSel.innerHTML = opts;
  if([...pSel.options].some(o=>o.value===pCur)) pSel.value = pCur;
  ssSync('purchaseItemProduct');

  const sSel = document.getElementById('saleItemProduct');
  const sCur = sSel.value;
  sSel.innerHTML = PARTS.products.length
    ? PARTS.products.map(p=>`<option value="${p.id}" data-img="${escHtml(p.image||'')}" data-icon="📦">${escHtml(productLabel(p))} — ${PARTS.stock[p.id]||0} عدد موجود</option>`).join('')
    : '<option value="">— اول یک کالا اضافه کن —</option>';
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
          <div class="tx-cart-item-name">${prodCell(it.product_id)}</div>
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
  onQuoteDeliveryChange();
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
    shipping_cost: isPickupMethod(document.getElementById('quoteDeliveryMethod').value) ? 0 : (document.getElementById('quoteShippingCost').value.trim() || 0),
    shipping_payer: isPickupMethod(document.getElementById('quoteDeliveryMethod').value) ? 'customer' : quoteShippingPayer,
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
          <div class="tx-list-title">#${q.quote_no} · ${escHtml(q.customer_name||'مشتری متفرقه')} · ${q.items.length} قلم</div>
          <div class="tx-list-sub">${jalaliFullLabel(q.date)}${q.valid_until?' · اعتبار تا '+jalaliFullLabel(q.valid_until):''}</div>
          <div style="margin-top:4px;">${quoteStatusBadge(q)}</div>
        </div>
        <div class="tx-list-amount">${fmtT(q.invoice_total)}</div>
      </div>
      <div class="tx-list-body" id="${bodyId}">
        ${q.items.map(it=>`<div class="tx-list-line"><span>${prodCell(it.product_id)} × ${it.qty}${bndLineTag(it)}</span><span>${fmtT(it.qty*it.unit_price-(it.discount||0))}</span></div>`).join('')}
        ${q.notes ? `<div class="tx-list-line"><span>📝 ${escHtml(q.notes)}</span><span></span></div>` : ''}
        <div class="tx-list-actions">
          <button onclick="event.stopPropagation();printQuote('${q.id}')">🖨 چاپ</button>
          ${q.status==='open' ? `<button onclick="event.stopPropagation();openQuoteModal('${q.id}')">✎ ویرایش</button>` : ''}
          ${q.status==='open' ? `<button onclick="event.stopPropagation();convertQuoteToSale('${q.id}')">✅ تبدیل به فروش</button>` : ''}
          ${q.status==='open' ? `<button class="del" onclick="event.stopPropagation();setQuoteRejected('${q.id}')">❌ رد کن</button>` : ''}
          <button class="del" onclick="event.stopPropagation();deleteQuote('${q.id}')">🗑 حذف</button>
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
    eligible.map(s=>{ const fp = productById((s.items[0]||{}).product_id); return `<option value="${s.id}" data-img="${escHtml((fp&&fp.image)||'')}" data-icon="🧾">${escHtml(s.customer_name||'مشتری متفرقه')} · ${jalaliFullLabel(s.date)}${s.invoice_no?' · فاکتور #'+s.invoice_no:''} · ${fmtT(s.invoice_total)}</option>`; }).join('');
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
      <td>${prodCell(r.product_id)}</td>
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
          <div class="tx-list-title">مرجوعی از ${escHtml(sale?sale.customer_name||'مشتری متفرقه':'(فروش حذف‌شده)')}</div>
          <div class="tx-list-sub">${jalaliFullLabel(r.date)}${r.restock?' · 🔄 واردشده به انبار':' · 🚫 بدون ورود به انبار'}</div>
        </div>
        <div class="tx-list-amount" style="color:var(--coral);">${fmtT(r.refund_total)}</div>
      </div>
      <div class="tx-list-body" id="${bodyId}">
        ${r.items.map(it=>`<div class="tx-list-line"><span>${prodCell(it.product_id)} × ${it.qty}</span><span>${fmtT(it.qty*it.refund_unit_price)}</span></div>`).join('')}
        <div class="tx-list-line"><span>نقد برگردونده‌شده</span><span>${fmtT(r.cash_refunded)}</span></div>
        ${r.note ? `<div class="tx-list-line"><span>📝 ${escHtml(r.note)}</span><span></span></div>` : ''}
        <div class="tx-list-actions"><button class="del" onclick="event.stopPropagation();deleteReturn('${r.id}')">🗑 حذف</button></div>
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
  if(!pid){ showToast('اول یک کالا انتخاب کن','error'); return; }
  if(!qty || qty<=0){ showToast('تعداد را وارد کن','error'); return; }
  if(price==null || isNaN(price) || price<0){ showToast('قیمت واحد را وارد کن','error'); return; }
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
    c.innerHTML = '<div class="tx-cart-empty">هنوز کالایی اضافه نشده.</div>';
  } else {
    purchaseCartItems.forEach((it,idx)=>{
      const p = productById(it.product_id);
      const el = document.createElement('div');
      el.className = 'tx-cart-item';
      el.innerHTML = `<div class="tx-cart-item-info">
          <div class="tx-cart-item-name">${prodCell(it.product_id)}${bndLineTag(it)}</div>
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
  if(!storeId){ showToast('یک فروشگاه انتخاب کن','error'); return; }
  if(!purchaseCartItems.length){ showToast('حداقل یک کالا اضافه کن','error'); return; }
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

  showToast(editingPurchaseId ? 'خرید ویرایش شد' : 'خرید ثبت شد','success');
  closePurchaseModal();
  purchaseCartItems = [];
  renderPurchaseCart();
}
function openPurchaseModal(id){
  editingPurchaseId = id || null;
  document.getElementById('purchaseModalTitle').textContent = id ? 'ویرایش خرید' : '🧾 ثبت خرید';
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
  document.getElementById('purchaseModalSaveBtn').textContent = id ? 'ویرایش خرید' : 'ثبت خرید';
  document.getElementById('purchaseModalOverlay').classList.add('open');
}
function closePurchaseModal(){
  document.getElementById('purchaseModalOverlay').classList.remove('open');
  editingPurchaseId = null;
  purchaseInvoiceImage = null; purchaseReceiptImage = null;
}
function deletePurchase(id){
  postParts('delete_purchase',{id});
  showToast('خرید حذف شد','success');
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
  if(!sorted.length){ list.innerHTML = '<div class="parts-empty"><div class="pe-icon">🧾</div><div class="pe-text">هنوز خریدی ثبت نشده.</div></div>'; return; }
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
          <div class="tx-list-title">${pur.po_no?'سفارش #'+pur.po_no+' · ':''}${escHtml(store ? store.name : '(فروشگاه حذف‌شده)')} · ${pur.items.length} قلم</div>
          <div class="tx-list-sub">${jalaliFullLabel(pur.order_date)}${!pur.same_day ? ' ← تحویل '+jalaliFullLabel(pur.receipt_date) : ''}${pur.delivery_method?' · 🚚 '+escHtml(pur.delivery_method):''}</div>
          <div style="margin-top:4px;">${paymentBadgeHtml(status, outstanding)}</div>
        </div>
        <div class="tx-list-amount">${fmtT(total)}</div>
      </div>
      <div class="tx-list-body" id="${bodyId}">
        ${pur.items.map(it=>`<div class="tx-list-line"><span>${prodCell(it.product_id)} × ${it.qty}</span><span>${fmtT(it.qty*it.unit_price)}</span></div>`).join('')}
        ${pur.notes ? `<div class="tx-list-line"><span>📝 ${escHtml(pur.notes)}</span><span></span></div>` : ''}
        ${(pur.invoice_image || pur.receipt_image) ? `<div class="tx-list-actions" style="margin-top:6px;">
          ${pur.invoice_image ? `<button class="doc-chip" onclick="openDocViewer('${pur.invoice_image}')">🧾 فاکتور</button>` : ''}
          ${pur.receipt_image ? `<button class="doc-chip" onclick="openDocViewer('${pur.receipt_image}')">🧾 رسید</button>` : ''}
        </div>` : ''}
        <div class="tx-list-actions">
          <button onclick="openPurchaseModal('${pur.id}')">✎ ویرایش</button>
          <button class="del" onclick="deletePurchase('${pur.id}')">🗑 حذف</button>
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
    ? `${avail} عدد موجود (میانگین قیمت خرید ${fmtT(cost)})`
    : `⚠ موجودی ثبت‌شده‌ای برای این کالا نمانده — اگر بفروشی، قیمت تمام‌شده تخمینی حساب می‌شود.`;
  const priceField = document.getElementById('saleItemPrice');
  const p = productById(pid);
  if(p && p.sale_price!=null && !priceField.value){ priceField.value = p.sale_price; }
}
function addSaleCartItem(){
  const pid = document.getElementById('saleItemProduct').value;
  const qty = parseFloat(document.getElementById('saleItemQty').value);
  const price = parseFloat(document.getElementById('saleItemPrice').value);
  const discount = parseFloat(document.getElementById('saleItemDiscount').value) || 0;
  if(!pid){ showToast('اول یک کالا انتخاب کن','error'); return; }
  if(!qty || qty<=0){ showToast('تعداد را وارد کن','error'); return; }
  if(price==null || isNaN(price) || price<0){ showToast('قیمت فروش را وارد کن','error'); return; }
  const inCart = saleCartItems.filter(it=>it.product_id===pid).reduce((s,it)=>s+it.qty,0);
  const avail = (PARTS.stock[pid]||0) - inCart;
  if(qty > avail){
    showToast(`فقط ${avail} عدد موجودی ثبت شده — با قیمت تمام‌شده‌ی تخمینی اضافه شد`,'error');
  }
  saleCartItems.push({product_id:pid, qty, unit_price:price, discount});
  document.getElementById('saleItemQty').value = 1;
  document.getElementById('saleItemPrice').value = '';
  document.getElementById('saleItemDiscount').value = '';
  renderSaleCart();
  onSaleProductChange();
}
function removeSaleCartItem(idx){ bndRemoveLine(idx); renderSaleCart(); onSaleProductChange(); }
function renderSaleCart(){
  const c = document.getElementById('saleCart');
  c.innerHTML = '';
  if(!saleCartItems.length){
    c.innerHTML = '<div class="tx-cart-empty">هنوز کالایی اضافه نشده.</div>';
  } else {
    saleCartItems.forEach((it,idx)=>{
      const p = productById(it.product_id);
      const disc = Number(it.discount)||0;
      const lineTotal = it.qty*it.unit_price - disc;
      const el = document.createElement('div');
      el.className = 'tx-cart-item';
      el.innerHTML = `<div class="tx-cart-item-info">
          <div class="tx-cart-item-name">${prodCell(p.id)}</div>
          <div class="tx-cart-item-detail">${it.qty} × ${fmtT(it.unit_price)}${disc>0?` − ${fmtT(disc)} تخفیف`:''}</div>
        </div>
        <div class="tx-cart-item-total">${fmtT(lineTotal)}</div>
        <button class="tx-cart-del" onclick="removeSaleCartItem(${idx})">✕</button>`;
      c.appendChild(el);
    });
  }
  const total = saleCartItems.reduce((s,it)=>s+it.qty*it.unit_price-(Number(it.discount)||0),0);
  document.getElementById('saleTotalVal').textContent = fmtT(total);
  bndSaleRender();
}
async function saveSale(){
  if(!saleCartItems.length){ showToast('حداقل یک کالا اضافه کن','error'); return; }
  const payload = {
    date: document.getElementById('saleDateHidden').value,
    customer_name: document.getElementById('saleCustomerName').value.trim(),
    customer_phone: document.getElementById('saleCustomerPhone').value.trim(),
    customer_address: document.getElementById('saleCustomerAddress').value.trim(),
    discount: document.getElementById('saleDiscount').value.trim() || 0,
    tax_percent: document.getElementById('saleTaxPercent').value.trim() || 0,
    shipping_cost: isPickupMethod(document.getElementById('saleDeliveryMethod').value) ? 0 : (document.getElementById('saleShippingCost').value.trim() || 0),
    shipping_payer: isPickupMethod(document.getElementById('saleDeliveryMethod').value) ? 'customer' : saleShippingPayer,
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

  showToast(editingSaleId ? 'فروش ویرایش شد' : 'فروش ثبت شد','success');
  closeSaleModal();
  saleCartItems = [];
  renderSaleCart();
}
function openSaleModal(id){
  editingSaleId = id || null;
  BND.dismiss.clear();
  document.getElementById('saleModalTitle').textContent = id ? 'ویرایش فروش' : '💵 ثبت فروش';
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
    saleCartItems = sale.items.map(it=>Object.assign({product_id:it.product_id, qty:it.qty, unit_price:it.unit_price, discount:it.discount||0}, it.bundle_id ? {bundle_id:it.bundle_id, bundle_role:it.bundle_role||'req', bundle_inst:it.bundle_inst||1} : {}));
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
  onSaleDeliveryChange();
  document.getElementById('saleModalSaveBtn').textContent = id ? 'ویرایش فروش' : 'ثبت فروش';
  document.getElementById('saleModalOverlay').classList.add('open');
}
function closeSaleModal(){
  document.getElementById('saleModalOverlay').classList.remove('open');
  editingSaleId = null;
}
function deleteSale(id){
  postParts('delete_sale',{id});
  showToast('فروش حذف شد','success');
  if(editingSaleId===id) closeSaleModal();
}
function renderSalesHistory(){
  const list = document.getElementById('salesHistoryList');
  list.innerHTML = '';
  const sorted = [...PARTS.sales].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  if(!sorted.length){ list.innerHTML = '<div class="parts-empty"><div class="pe-icon">💵</div><div class="pe-text">هنوز فروشی ثبت نشده.</div></div>'; return; }
  sorted.forEach(sale=>{
    const el = document.createElement('div');
    el.className = 'tx-list-item';
    const bodyId = 'saleBody-'+sale.id;
    const profitClass = sale.profit>=0 ? 'profit-pos' : 'profit-neg';
    const status = sale.payment_status||'paid';
    el.innerHTML = `
      <div class="tx-list-head" onclick="document.getElementById('${bodyId}').classList.toggle('open')">
        <div>
          <div class="tx-list-title">${escHtml(sale.customer_name || 'مشتری متفرقه')} · ${sale.items.length} قلم</div>
          <div class="tx-list-sub">${jalaliFullLabel(sale.date)}${sale.delivery_method?' · 🚚 '+escHtml(sale.delivery_method):''}${sale.agent_id && agentById(sale.agent_id)?' · 🧑‍💼 '+escHtml(agentById(sale.agent_id).name):''}</div>
          <div style="margin-top:4px;">${paymentBadgeHtml(status, sale.amount_outstanding||0)}</div>
        </div>
        <div>
          <div class="tx-list-amount">${fmtT(sale.revenue)} ${xBtn('sale_revenue',{id:sale.id},'xi-mini')}</div>
          <div class="tx-list-amount ${profitClass}" style="font-size:11px;">سود ${fmtT(sale.profit)} ${xBtn('sale_profit',{id:sale.id},'xi-mini')}</div>
        </div>
      </div>
      <div class="tx-list-body" id="${bodyId}">
        ${sale.items.map(it=>`<div class="tx-list-line"><span>${prodCell(it.product_id)} × ${it.qty}</span><span>${fmtT(it.revenue)} (سود ${fmtT(it.profit)})</span></div>`).join('')}
        ${sale.notes ? `<div class="tx-list-line"><span>📝 ${escHtml(sale.notes)}</span><span></span></div>` : ''}
        <div class="tx-list-actions">
          <button onclick="event.stopPropagation();openInvoicePreview('${sale.id}')">🧾 فاکتور</button>
          <button onclick="event.stopPropagation();openSaleModal('${sale.id}')">✎ ویرایش</button>
          <button class="del" onclick="event.stopPropagation();deleteSale('${sale.id}')">🗑 حذف</button>
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
    ['🧾','تعداد خریدها', PARTS.purchases.length, 'var(--amber)'],
    ['💸','جمع هزینه خرید', fmtT(totalSpend), 'var(--rose)'],
    ['📆','خرید ۳۰ روز اخیر', fmtT(spend30), 'var(--sky)'],
  ];
  wrap.innerHTML = stats.map(([icon,label,val,color,xid,xa])=>kpiCardHtml(icon,label,val,color,xid,xa)).join('');
}
function renderSaleTabStats(){
  const wrap = document.getElementById('saleTabStats');
  if(!wrap) return;
  const revenue30 = PARTS.sales.filter(s=>isWithinDays(s.date,30)).reduce((s,x)=>s+x.revenue,0);
  const profit30 = PARTS.sales.filter(s=>isWithinDays(s.date,30)).reduce((s,x)=>s+x.profit,0);
  const stats = [
    ['💵','تعداد فروش‌ها', PARTS.sales.length, 'var(--sky)'],
    ['💰','جمع درآمد', fmtT(PARTS.totals.revenue||0), 'var(--sage)'],
    ['📈','سود ۳۰ روز اخیر', fmtT(profit30), profit30>=0?'var(--sage)':'var(--coral)'],
    ['📆','درآمد ۳۰ روز اخیر', fmtT(revenue30), 'var(--sky)'],
  ];
  wrap.innerHTML = stats.map(([icon,label,val,color,xid,xa])=>kpiCardHtml(icon,label,val,color,xid,xa)).join('');
}

// ─── REPORTS ────────────────────────────────────────
function renderRangeChips(){
  const c = document.getElementById('partsRangeChips');
  const ranges = [['all','همه‌ی زمان‌ها'],['month','این ماه'],['30d','۳۰ روز اخیر']];
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
  try{ bndRenderReportBlock(); }catch(e){ console.warn('bnd',e); }
  document.getElementById('lowStockThresholdInput').value = PARTS.low_stock_threshold;

  const filteredSales = PARTS.sales.filter(s=>inRange(s.date));
  const filteredPurchases = PARTS.purchases.filter(p=>inRange(p.order_date));

  const revenue = filteredSales.reduce((s,x)=>s+x.revenue,0);
  const cogs = filteredSales.reduce((s,x)=>s+x.cogs,0);
  const profit = revenue - cogs;
  const margin = revenue>0 ? (profit/revenue*100) : 0;
  const purchaseSpend = filteredPurchases.reduce((s,p)=>s+p.items.reduce((a,it)=>a+it.qty*it.unit_price,0),0);

  const T = PARTS.totals;
  const expensesRange = (PARTS.business_expenses||[]).filter(x=>inRange(x.date) && x.category!==TAX_PAYMENT_CATEGORY).reduce((a,x)=>a+(Number(x.amount)||0),0);
  const commissionRange = filteredSales.reduce((a,x)=>a+(Number(x.agent_commission)||0),0);
  const returnsRange = filteredSales.reduce((a,x)=>a+(Number(x.returned_value_total)||0),0);
  const netProfitRange = profit - expensesRange - commissionRange;
  const posNeg = (v)=>v>=0 ? 'var(--sage)' : 'var(--coral)';
  const warnNZ = (v)=>v>0 ? 'var(--coral)' : 'var(--sage)';
  // Part 1 follows the chosen date range; part 2 is the position "as of now" (a balance sheet has no range).
  const kpis = [
    ['💰','درآمد فروش (فروش خالص)', fmtT(revenue), 'var(--sky)', 'revenue'],
    ['📦','بهای تمام‌شده کالای فروش‌رفته', fmtT(cogs), 'var(--amber)', 'cogs'],
    ['📈','سود ناخالص', fmtT(profit), posNeg(profit), 'gross_profit'],
    ['🎯','حاشیه سود ناخالص (مارجین)', margin.toFixed(1)+'٪', 'var(--plum)', 'margin_pct'],
    ['📐','درصد سود نسبت به بها (مارکاپ)', (cogs>0 ? (profit/cogs*100) : 0).toFixed(1)+'٪', 'var(--plum)', 'markup_pct'],
    ['🧾','خرید کالا در این بازه', fmtT(purchaseSpend), 'var(--rose)', 'purchase_spend'],
    ['💸','هزینه‌های عملیاتی (جاری)', fmtT(expensesRange), 'var(--coral)', 'expenses_op'],
    ['🎁','پورسانت فروش (هزینه‌ی تعلق‌گرفته)', fmtT(commissionRange), 'var(--coral)', 'commission_range'],
    ['🏁','سود خالص (پس از هزینه‌ها و پورسانت)', fmtT(netProfitRange), posNeg(netProfitRange), 'net_profit_range'],
    ['💵','تعداد فاکتور فروش', filteredSales.length, 'var(--sky)', 'invoice_count'],
    ['🧮','میانگین درآمد هر فاکتور', fmtT(filteredSales.length ? revenue/filteredSales.length : 0), 'var(--sky)', 'avg_invoice'],
    ['🧾','تعداد سفارش خرید', filteredPurchases.length, 'var(--amber)'],
    ['↩️','مرجوعی (با مالیات)', fmtT(returnsRange), 'var(--coral)', 'returns_range'],
    // ── position as of now ──
    ['🏦','موجودی نقد (صندوق) — لحظه‌ای', fmtT(T.cash_balance||0), 'var(--sage)', 'cash_balance'],
    ['🏷️','ارزش موجودی کالا — لحظه‌ای', fmtT(T.inventory_value||0), 'var(--sky)', 'inventory_value'],
    ['🔩','تعداد کالای موجود در انبار — لحظه‌ای', fmtNum(T.inventory_units||0), 'var(--sage)', 'inv_units'],
    ['⚠️','تعداد کالای زیر نقطه سفارش — لحظه‌ای', T.low_stock_count||0, warnNZ(T.low_stock_count||0), 'low_stock_count'],
    ['📥','حساب‌های دریافتنی (مطالبات) — لحظه‌ای', fmtT(T.accounts_receivable||0), warnNZ(T.accounts_receivable||0), 'accounts_receivable'],
    ['📤','حساب‌های پرداختنی (بدهی‌ها) — لحظه‌ای', fmtT(T.accounts_payable||0), warnNZ(T.accounts_payable||0), 'accounts_payable'],
    ['🎁','پورسانت پرداخت‌نشده — لحظه‌ای', fmtT(T.agent_commission_payable||0), warnNZ(T.agent_commission_payable||0), 'commission_payable'],
    ['🏛️','مالیات بر ارزش افزوده‌ی پرداخت‌نشده — لحظه‌ای', fmtT(T.tax_payable||0), warnNZ(T.tax_payable||0), 'tax_payable'],
    ['💎','حقوق صاحبان سرمایه (ارزش خالص دفتری) — لحظه‌ای', fmtT(T.business_value||0), 'var(--plum)', 'equity'],
  ];
  renderDashboardWidgets();
  const kwrap = document.getElementById('partsKpis');
  kwrap.innerHTML = oversoldWarnHtml() + kpis.map(([icon,label,val,color,xid,xa])=>kpiCardHtml(icon,label,val,color,xid,xa)).join('');

  // top products by profit within range
  const byProd = {};
  filteredSales.forEach(sale=>sale.items.forEach(it=>{
    const b = byProd[it.product_id] || (byProd[it.product_id]={qty:0,revenue:0,cogs:0,profit:0});
    b.qty += it.qty; b.revenue += it.revenue; b.cogs += it.cogs; b.profit += it.profit;
  }));
  const topRows = Object.entries(byProd).sort((a,b)=>b[1].profit-a[1].profit).slice(0,10);
  const topBody = document.querySelector('#partsTopProductsTable tbody');
  topBody.innerHTML = topRows.length ? topRows.map(([pid,v])=>`
    <tr><td>${prodCell(pid)}</td><td>${fmtNum(v.qty)}</td>
      <td>${fmtT(v.revenue)}</td><td>${fmtT(v.cogs)}</td>
      <td style="color:${v.profit>=0?'var(--sage)':'var(--coral)'};font-weight:700;">${fmtT(v.profit)}</td></tr>`).join('')
    : `<tr><td colspan="5" class="parts-table-empty">در این بازه فروشی ثبت نشده.</td></tr>`;

  // low stock (current, not range-filtered)
  const lowBody = document.querySelector('#partsLowStockTable tbody');
  lowBody.innerHTML = PARTS.low_stock.length ? PARTS.low_stock.map(pid=>`
    <tr><td>${prodCell(pid)}</td>
      <td><span class="part-badge low-stock-badge">${PARTS.stock[pid]||0}</span></td>
      <td>${fmtT(PARTS.avg_cost[pid]||0)}</td></tr>`).join('')
    : `<tr><td colspan="3" class="parts-table-empty">فعلاً کالای کم‌موجودی نداری.</td></tr>`;

  // spend by store within range
  const byStore = {};
  filteredPurchases.forEach(pur=>{
    const b = byStore[pur.store_id] || (byStore[pur.store_id]={count:0,spend:0});
    b.count += 1; b.spend += pur.items.reduce((a,it)=>a+it.qty*it.unit_price,0);
  });
  const storeRows = Object.entries(byStore).sort((a,b)=>b[1].spend-a[1].spend);
  const storeBody = document.querySelector('#partsStoreTable tbody');
  storeBody.innerHTML = storeRows.length ? storeRows.map(([sid,v])=>`
    <tr><td>${storeCell(sid)}</td><td>${v.count}</td><td>${fmtT(v.spend)}</td></tr>`).join('')
    : `<tr><td colspan="3" class="parts-table-empty">در این بازه خریدی ثبت نشده.</td></tr>`;

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
    <tr><td>${prodCell(r.p.id)}</td><td>${fmtNum(r.stock)}</td><td>${fmtT(r.cost)} ${xBtn('avg_cost',{pid:r.p.id},'xi-mini')}</td><td>${fmtT(r.sp)}</td>
      <td style="color:${r.margin_pct>=0?'var(--sage)':'var(--coral)'};font-weight:700;">${r.margin_pct.toFixed(1)}% ${xBtn('margin_item',{pid:r.p.id},'xi-mini')}</td>
      <td>${r.markup_pct.toFixed(1)}% ${xBtn('markup_item',{pid:r.p.id},'xi-mini')}</td></tr>`).join('')
    : `<tr><td colspan="6" class="parts-table-empty">برای دیدن مارجین و مارکاپ، روی کالاها قیمت فروش بگذار.</td></tr>`;

  // ── Supplier price comparison — for every item with ≥1 price-list entry,
  // the cheapest vs priciest quote across suppliers, and the spread ──
  const cmpGroups = {};
  PARTS.price_entries.forEach(e=>{
    const refId = peRefId(e);
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
      <td style="color:var(--sage);font-weight:700;">${r.cheapestStore?storeCell(r.cheapestStore.id):'(حذف‌شده)'} — ${fmtT(r.cheapestPrice)}</td>
      <td>${r.count>1 ? `${escHtml(r.priciestStore?r.priciestStore.name:'(حذف‌شده)')} — ${fmtT(r.priciestPrice)}` : '—'}</td>
      <td>${r.count>1 ? r.spread.toFixed(0)+'%' : '—'}</td></tr>`).join('')
    : `<tr><td colspan="5" class="parts-table-empty">برای مقایسه‌ی قیمت، در «لیست قیمت تامین‌کنندگان» قیمت ثبت کن.</td></tr>`;

  // ── Which supplier is cheapest most often — a quick "who to favor" ranking ──
  const cheapCount = {};
  cmpRows.forEach(r=>{ if(r.cheapestStore){ cheapCount[r.cheapestStore.id] = (cheapCount[r.cheapestStore.id]||0)+1; } });
  const cheapRows = Object.entries(cheapCount).sort((a,b)=>b[1]-a[1]);
  const cheapBody = document.querySelector('#partsCheapestSupplierTable tbody');
  if(cheapBody) cheapBody.innerHTML = cheapRows.length ? cheapRows.map(([sid,n])=>`
    <tr><td>${storeCell(sid)}</td><td>${n} کالا</td></tr>`).join('')
    : `<tr><td colspan="2" class="parts-table-empty">هنوز مقایسه‌ای نیست.</td></tr>`;

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
      <tr><td>${prodCell(r.pid)}</td>
        <td><span class="part-badge low-stock-badge">${PARTS.stock[r.pid]||0}</span></td>
        <td>${r.best ? storeCell(r.best.sid)+' — '+fmtT(r.best.price) : 'هنوز قیمتی ثبت نشده'}</td></tr>`).join('')
      : `<tr><td colspan="3" class="parts-table-empty">فعلاً کالای کم‌موجودی نداری.</td></tr>`;
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
    <tr><td>${prodCell(r.p.id)}</td><td>${fmtNum(r.stock)}</td><td>${fmtT(r.cost)}</td><td>${fmtT(r.value)}</td></tr>`).join('')
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
    <tr><td>${storeCell(sid)}</td><td>${v.count}</td><td style="color:var(--coral);font-weight:700;">${fmtT(v.outstanding)}</td></tr>`).join('')
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
    return `<tr><td>${prodCell(r.pid)}</td><td>${fmtT(r.revenue)}</td>
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
    <tr><td>${agentCell(r.a.id)}</td><td>${r.summ.orders}</td><td>${fmtT(r.summ.revenue)}</td><td>${fmtT(r.summ.profit)}</td>
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
    : `<tr><td colspan="3" class="parts-table-empty">هنوز هزینه‌ای ثبت نشده.</td></tr>`;
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
        datasets:[{ label:'مارجین ٪', data: topMargin.map(r=>r.margin_pct.toFixed(1)), backgroundColor:'#7a3a6a' }]},
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
    const b = byMonth[key] || (byMonth[key]={label:FA_MONTHS[j.m-1]+' '+j.y, revenue:0, profit:0, spend:0, units:0});
    b.revenue += sale.revenue; b.profit += sale.profit;
    b.units += sale.items.reduce((s,it)=>s+it.qty, 0);
  });
  filteredPurchases.forEach(pur=>{
    const j = gregToJalali(pur.order_date);
    if(!j) return;
    const key = j.y+'/'+String(j.m).padStart(2,'0');
    const b = byMonth[key] || (byMonth[key]={label:FA_MONTHS[j.m-1]+' '+j.y, revenue:0, profit:0, spend:0, units:0});
    b.spend += pur.items.reduce((a,it)=>a+it.qty*it.unit_price,0);
  });
  const monthKeys = Object.keys(byMonth).sort();
  const revCtx = document.getElementById('partsRevenueChart');
  if(partsRevenueChartInstance) partsRevenueChartInstance.destroy();
  partsRevenueChartInstance = new Chart(revCtx, {
    type:'bar',
    data:{ labels: monthKeys.map(k=>byMonth[k].label),
      datasets:[
        {label:'درآمد', data: monthKeys.map(k=>byMonth[k].revenue), backgroundColor:'#2a6a9a'},
        {label:'هزینه خرید', data: monthKeys.map(k=>byMonth[k].spend), backgroundColor:'#d4821a'},
        {label:'سود', data: monthKeys.map(k=>byMonth[k].profit), backgroundColor:'#3a7a5a'},
      ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:11}}}},
      scales:{y:{ticks:{font:{size:10}}},x:{ticks:{font:{size:10}}}}}
  });

  const storeCtx = document.getElementById('partsStoreChart');
  if(partsStoreChartInstance) partsStoreChartInstance.destroy();
  partsStoreChartInstance = new Chart(storeCtx, {
    type:'doughnut',
    data:{ labels: storeRows.map(([sid])=> storeById(sid)? storeById(sid).name : '(فروشگاه حذف‌شده)'),
      datasets:[{ data: storeRows.map(([,v])=>v.spend), backgroundColor: storeRows.map((_,i)=>palette[i%palette.length]) }]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:11}}}}}
  });

  // Profit by brand — structured brand data, grouped from actual sale items.
  const byBrand = {};
  filteredSales.forEach(sale=>sale.items.forEach(it=>{
    const p = productById(it.product_id);
    const brand = (p && p.brand) ? p.brand : '(بدون برند)';
    const b = byBrand[brand] || (byBrand[brand]={qty:0,revenue:0,profit:0});
    b.qty += it.qty; b.revenue += it.revenue; b.profit += it.profit;
  }));
  const brandRows = Object.entries(byBrand).sort((a,b)=>b[1].profit-a[1].profit);
  const brandCtx = document.getElementById('partsBrandChart');
  if(partsBrandChartInstance) partsBrandChartInstance.destroy();
  partsBrandChartInstance = new Chart(brandCtx, {
    type:'bar',
    data:{ labels: brandRows.map(([name])=>name),
      datasets:[{ label:'سود', data: brandRows.map(([,v])=>v.profit),
        backgroundColor: brandRows.map(([,v])=> v.profit>=0 ? '#3a7a5a' : '#c44a3a') }]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{x:{ticks:{font:{size:10}}},y:{ticks:{font:{size:11}}}}}
  });
  const brandBody = document.querySelector('#partsBrandTable tbody');
  brandBody.innerHTML = brandRows.length ? brandRows.map(([name,v])=>`
    <tr><td>${escHtml(name)}</td><td>${fmtNum(v.qty)}</td><td>${fmtT(v.revenue)}</td>
      <td style="color:${v.profit>=0?'var(--sage)':'var(--coral)'};font-weight:700;">${fmtT(v.profit)}</td></tr>`).join('')
    : `<tr><td colspan="4" class="parts-table-empty">در این بازه فروشی ثبت نشده.</td></tr>`;

  // Units sold by car model — a product can carry several car-model tags, so
  // each tag gets full credit for that line item (a part fitting 3 cars will
  // show up once under each of them).
  const byCarModel = {};
  filteredSales.forEach(sale=>sale.items.forEach(it=>{
    const p = productById(it.product_id);
    const models = p ? productCarModels(p) : [];
    const list = models.length ? models : ['(بدون مدل خودرو)'];
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
    : `<tr><td colspan="3" class="parts-table-empty">در این بازه فروشی ثبت نشده.</td></tr>`;

  // Cumulative profit — a running total across the months in range, so the
  // overall growth trajectory of the business is visible at a glance.
  let running = 0;
  const cumulativeData = monthKeys.map(k=>{ running += byMonth[k].profit; return running; });
  const cumCtx = document.getElementById('partsCumulativeChart');
  if(partsCumulativeChartInstance) partsCumulativeChartInstance.destroy();
  partsCumulativeChartInstance = new Chart(cumCtx, {
    type:'line',
    data:{ labels: monthKeys.map(k=>byMonth[k].label),
      datasets:[{ label:'سود تجمعی', data: cumulativeData, borderColor:'#3a7a5a',
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
      datasets:[{ label:'تعداد فروخته‌شده', data: monthKeys.map(k=>byMonth[k].units), backgroundColor:'#2a6a9a' }]},
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
      datasets:[{ label:'تعداد فروخته‌شده', data: topUnitsRows.map(([,v])=>v.qty),
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
    grid.innerHTML = '<div class="parts-empty"><div class="pe-icon">🏷️</div><div class="pe-text">هنوز کالای کلی‌ای نساخته‌ای — وقتی می‌خوای قیمت تامین‌کننده‌ها رو بدون اتصال به یک کالای مشخص مقایسه کنی یکی بساز (مثلاً «رله کولر پراید»).</div></div>';
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
          <button onclick="openGenericModal('${g.id}')">✎ ویرایش</button>
          <button class="del" onclick="deleteGenericEntry('${g.id}')">🗑 حذف</button>
        </div>
      </div>`;
    grid.appendChild(el);
  });
}
function openGenericModal(id, returnTo){
  genericModalReturnTo = returnTo || null;
  document.getElementById('genericModalId').value = id || '';
  document.getElementById('genericModalTitle').textContent = id ? 'ویرایش کالای کلی' : 'افزودن کالای کلی';
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
  if(!name){ showToast('یک نام بنویس','error'); return; }
  const payload = { name, notes: document.getElementById('gfNotes').value.trim() };
  const prevIds = new Set(PARTS.generic_products.map(g=>g.id));
  let res;
  if(id){ payload.id = id; res = await postParts('update_generic_product', payload); }
  else { res = await postParts('add_generic_product', payload); }
  if(!res || res.ok===false) return;
  showToast(id ? 'کالای کلی ویرایش شد' : 'کالای کلی اضافه شد','success');
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
  if(!confirm('این کالای کلی حذف شود؟ قیمت‌های ثبت‌شده‌ی آن هم پاک می‌شود.')) return;
  postParts('delete_generic_product', {id});
  showToast('کالای کلی حذف شد','success');
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
  return ptgList().length
    ? '<option value="">— انتخاب کن —</option>' + ptgFlat().map(r=>`<option value="${r.id}">${'\u00a0\u00a0'.repeat(r.depth-1)}${r.depth>1?'↳ ':''}${escHtml(r.node.name)} (${faDigits(ptgSubtreeProducts(r.id).length)} کالا)</option>`).join('')
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
  if(g) return {ref_type:'group', ref_id:g};
  return null;
}
function setItemPair(prodId, genId, refType, refId){
  document.getElementById(prodId).value = refType==='product' ? refId : '';
  document.getElementById(genId).value = (refType==='group'||refType==='generic') ? refId : '';
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
      : '<option value="">— اول یک فروشگاه اضافه کن —</option>';
    if(cur) storeSel.value = cur;
  }
  const filterSel = document.getElementById('pfPriceListFilterStore');
  if(filterSel){
    const cur = filterSel.value;
    filterSel.innerHTML = '<option value="">همه‌ی تامین‌کننده‌ها</option>' +
      PARTS.stores.map(s=>`<option value="${s.id}" data-img="${escHtml(s.image||'')}" data-icon="🏬">${escHtml(s.name)}</option>`).join('');
    if(cur) filterSel.value = cur;
  }
}
function openNewGenericFromPriceEntry(){ pickSubnavItem('productgroups'); showToast('گروه جدید را در درخت بساز، بعد برگرد','success'); }
async function savePriceEntry(){
  const storeId = document.getElementById('peStoreSelect').value;
  const price = parseFloat(document.getElementById('pePrice').value);
  const dateVal = document.getElementById('peDateHidden').value;
  const item = readItemPair('peProductSelect','peGenericSelect');
  if(!storeId){ showToast('یک تامین‌کننده انتخاب کن','error'); return; }
  if(!item){ showToast('یه کالا یا گروه کالا انتخاب کن','error'); return; }
  if(!price || price<=0){ showToast('قیمت را وارد کن','error'); return; }
  const payload = {
    store_id: storeId, ref_type: item.ref_type,
    product_id: item.ref_type==='product' ? item.ref_id : null,
    generic_id: item.ref_type==='generic' ? item.ref_id : null,
    group_id: item.ref_type==='group' ? item.ref_id : null,
    price, date: dateVal, notes: document.getElementById('peNotes').value.trim(),
  };
  if(editingPriceEntryId){ payload.id = editingPriceEntryId; await postParts('update_price_entry', payload); }
  else { await postParts('add_price_entry', payload); }
  showToast(editingPriceEntryId ? 'قیمت ویرایش شد' : 'قیمت ثبت شد','success');
  cancelEditPriceEntry();
}
function editPriceEntry(id){
  const e = PARTS.price_entries.find(x=>x.id===id);
  if(!e) return;
  editingPriceEntryId = id;
  document.getElementById('peStoreSelect').value = e.store_id||'';
  setItemPair('peProductSelect','peGenericSelect', e.ref_type, peRefId(e));
  document.getElementById('pePrice').value = e.price;
  renderJalaliPicker('peDatePicker','peDateHidden', e.date, ()=>{});
  document.getElementById('peNotes').value = e.notes||'';
  document.getElementById('peSaveBtn').textContent = 'ویرایش قیمت';
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
  document.getElementById('peSaveBtn').textContent = 'ثبت قیمت';
  document.getElementById('peCancelBtn').style.display = 'none';
}
function deletePriceEntry(id){
  if(!confirm('این قیمت از لیست حذف شود؟')) return;
  postParts('delete_price_entry', {id});
  showToast('قیمت حذف شد','success');
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
      <div class="parts-table-title">${storeCell(sid)}</div>
      <table class="parts-table"><thead><tr><th>کالا</th><th>قیمت</th><th>تاریخ</th><th>یادداشت</th><th></th></tr></thead>
      <tbody>
        ${list.map(e=>`<tr>
          <td>${e.ref_type==='product' ? prodCell(e.product_id) : escHtml(refLabel(e.ref_type, peRefId(e)))}</td>
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
    const refId = peRefId(e);
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
          tooltip:{callbacks:{label:(ctx)=>`${ctx.dataset.label}: ${ctx.parsed.y}% نسبت به اولین قیمت`}}},
        scales:{y:{ticks:{font:{size:10}},title:{display:true,text:'شاخص (اولین قیمت = ۱۰۰)',font:{size:10}}},x:{ticks:{font:{size:10}}}}}
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
  const entries = priceEntriesFor(item.ref_type, item.ref_id);
  const isGroup = item.ref_type==='group';
  if(!entries.length){
    out.innerHTML = '<div class="parts-empty"><div class="pe-icon">⚖️</div><div class="pe-text">هنوز هیچ قیمتی برای این کالا ثبت نشده — اول یه چند تا قیمت توی «لیست قیمت» اضافه کن.</div></div>';
    if(chartEl) chartEl.style.display='none';
    return;
  }
  const byStore = priceOffersFor(item.ref_type, item.ref_id);
  const rows = Object.entries(byStore).map(([sid,e])=>({sid, e})).sort((a,b)=>a.e.price-b.e.price);
  const cheapest = rows[0];
  out.innerHTML = `<table class="parts-table"><thead><tr><th>تامین‌کننده</th>${isGroup?'<th>ارزان‌ترین کالای این گروه</th>':''}<th>${isGroup?'قیمت':'آخرین قیمت'}</th><th>تاریخ</th></tr></thead><tbody>
    ${rows.map(r=>`<tr class="${r.sid===cheapest.sid?'cheapest-row':''}">
      <td>${r.sid===cheapest.sid?'🏆 ':''}${storeCell(r.sid)}</td>
      ${isGroup?`<td>${r.e.ref_type==='product'?prodCell(r.e.product_id):escHtml(refLabel(r.e.ref_type, peRefId(r.e)))}</td>`:''}
      <td>${fmtT(r.e.price)}</td><td>${jalaliFullLabel(r.e.date)}</td></tr>`).join('')}
    </tbody></table>`;

  if(chartEl){
    if(rows.length>1){
      chartEl.style.display = 'block';
      const palette = ['#e85d3a','#3a7a5a','#2a6a9a','#d4821a','#7a3a6a','#c44a6a'];
      const lineKeys = [...new Set(entries.map(e=>e.store_id+'|'+(isGroup?peSource(e):'')))];
      const allDates = [...new Set(entries.map(e=>e.date))].sort();
      const datasets = lineKeys.map((lk,i)=>({
        label: (storeById(lk.split('|')[0])?storeById(lk.split('|')[0]).name:'(حذف‌شده)') + (isGroup ? ' · '+peSourceLabel(entries.find(x=>x.store_id+'|'+peSource(x)===lk)) : ''),
        data: allDates.map(d=>{ const e = entries.find(x=>x.store_id+'|'+(isGroup?peSource(x):'')===lk && x.date===d); return e ? e.price : null; }),
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
    c.innerHTML = '<div class="tx-cart-empty">سبد خالی است — کالاهایی که می‌خواهی بخری را اضافه کن.</div>';
  } else {
    compareCartItems.forEach((it,idx)=>{
      const el = document.createElement('div');
      el.className = 'tx-cart-item';
      el.innerHTML = `<div class="tx-cart-item-info">
          <div class="tx-cart-item-name">${it.ref_type==='product' ? prodCell(it.ref_id) : escHtml(refLabel(it.ref_type, it.ref_id))}</div>
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
  if(!compareCartItems.length){ showToast('حداقل یک کالا به سبد اضافه کن','error'); return; }

  const itemStores = compareCartItems.map(it=>{
    return {...it, offers: priceOffersFor(it.ref_type, it.ref_id)};
  });
  const missing = itemStores.filter(it=>!Object.keys(it.offers).length);
  const allStoreIds = [...new Set(itemStores.flatMap(it=>Object.keys(it.offers)))];
  if(!allStoreIds.length){
    resultEl.innerHTML = '<div class="parts-empty"><div class="pe-icon">🛒</div><div class="pe-text">برای هیچ‌کدام از این کالاها هنوز قیمتی در لیست قیمت ثبت نشده.</div></div>';
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
    resultEl.innerHTML = '<div class="parts-empty"><div class="pe-icon">🛒</div><div class="pe-text">برای بعضی کالاها قیمتی ثبت نشده — اول برای هرکدام قیمت ثبت کن.</div></div>';
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
      <div class="parts-table-title">🏬 ${escHtml(storeById(sid)?storeById(sid).name:'(حذف‌شده)')}
        ${b.shipping>0 ? `<span style="float:left;font-weight:600;color:var(--coral);">+ هزینه ارسال ${fmtT(b.shipping)}</span>` : `<span style="float:left;font-weight:600;color:var(--sage);">🚚 ارسال رایگان</span>`}</div>
      <table class="parts-table"><thead><tr><th>کالا</th><th>تعداد</th><th>قیمت واحد</th><th>جمع ردیف</th></tr></thead>
      <tbody>${b.items.map(it=>`<tr><td>${escHtml(refLabel(it.ref_type,it.ref_id))}</td><td>${it.qty}</td><td>${fmtT(it.price)}</td><td>${fmtT(it.line)}</td></tr>`).join('')}</tbody></table>
    </div>`).join('');

  resultEl.innerHTML = `
    ${missing.length ? `<div class="parts-empty" style="margin-bottom:10px;"><div class="pe-text">⚠️ قیمتی ثبت نشده برای: ${missing.map(it=>escHtml(refLabel(it.ref_type,it.ref_id))).join('، ')} — در این برنامه لحاظ نشد.</div></div>` : ''}
    ${storeCards}
    <div class="parts-kpi-card" style="--kpi-color:var(--sage);margin-top:10px;">
      <div class="parts-kpi-label">جمع کل برنامه‌ی پیشنهادی (با هزینه ارسال)</div>
      <div class="parts-kpi-val" style="color:var(--sage);">${fmtT(best.total)}</div>
    </div>
    ${savings>0 ? `<div class="parts-kpi-card" style="--kpi-color:var(--plum);margin-top:6px;">
      <div class="parts-kpi-label">صرفه‌جویی نسبت به خرید جداگانه‌ی هر کالا از ارزان‌ترین تامین‌کننده‌اش</div>
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
  if(!title){ showToast('برای هزینه یک عنوان کوتاه بنویس','error'); return; }
  if(!amount || amount<=0){ showToast('مبلغ را وارد کن','error'); return; }
  const payload = {
    date: document.getElementById('expDateHidden').value,
    category: document.getElementById('expCategorySelect').value,
    title, amount,
    notes: document.getElementById('expNotes').value.trim(),
  };
  if(editingExpenseId){ payload.id = editingExpenseId; await postParts('update_expense', payload); }
  else { await postParts('add_expense', payload); }
  showToast(editingExpenseId ? 'هزینه ویرایش شد' : 'هزینه ثبت شد','success');
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
  document.getElementById('expSaveBtn').textContent = 'ویرایش هزینه';
  document.getElementById('expCancelBtn').style.display = 'inline-block';
}
function cancelEditExpense(){
  editingExpenseId = null;
  renderJalaliPicker('expDatePicker','expDateHidden', null, ()=>{});
  document.getElementById('expTitle').value = '';
  document.getElementById('expAmount').value = '';
  document.getElementById('expNotes').value = '';
  document.getElementById('expSaveBtn').textContent = 'ثبت هزینه';
  document.getElementById('expCancelBtn').style.display = 'none';
}
function deleteExpense(id){
  if(!confirm('این هزینه حذف شود؟')) return;
  postParts('delete_expense', {id});
  showToast('هزینه حذف شد','success');
  if(editingExpenseId===id) cancelEditExpense();
}
function renderExpenseLedger(){
  const list = document.getElementById('expenseLedger');
  if(!list) return;
  const sorted = [...PARTS.business_expenses].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  if(!sorted.length){
    list.innerHTML = '<div class="parts-empty"><div class="pe-icon">💸</div><div class="pe-text">هنوز هزینه‌ای ثبت نشده — چیزهایی مثل دستگاه کارت‌خوان، اجاره یا تبلیغات (غیر از خرید کالا) این‌جا ثبت می‌شوند.</div></div>';
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
// A sale that outruns every recorded purchase is costed at an *estimated* average — flag it loudly.
function oversoldWarnHtml(){
  const T = PARTS.totals||{};
  if(!(T.oversold_units>0)) return '';
  return `<div class="rb-warn" style="grid-column:1/-1;">⚠️ برای ${fmtNum(T.oversold_product_count)} کالا، ${fmtNum(T.oversold_units)} عدد بیشتر از موجودی ثبت‌شده فروخته شده؛ بهای تمام‌شده‌ی آن (${fmtT(T.oversold_cost)}) فقط تخمینی است و سود فعلی دقیق نیست. فاکتور خرید این کالاها را ثبت کن تا حساب‌ها اصلاح شود.</div>`;
}
function renderExpenseTabStats(){
  const el = document.getElementById('expenseTabTotal');
  if(!el) return;
  const tp = PARTS.totals.total_tax_payments||0;
  el.textContent = fmtT(PARTS.totals.total_expenses||0) + (tp>0 ? ' (+ تسویه مالیات '+fmtT(tp)+')' : '');
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
  showToast('اطلاعات کسب‌وکار ذخیره شد','success');
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
    ${sale.delivery_method ? `<div class="inv-delivery">🚚 روش تحویل: ${escHtml(sale.delivery_method)}${isPickupMethod(sale.delivery_method)?'':sale.shipping_payer==='split'?' (هزینه ارسال بین طرفین تقسیم شده)':(sale.shipping_payer==='business'?' (هزینه ارسال رایگان)':'')}</div>` : ''}
    ${sale.notes ? `<div class="inv-note">📝 ${escHtml(sale.notes)}</div>` : ''}
    ${bp.footer_note ? `<div class="inv-footer">${escHtml(bp.footer_note)}</div>` : ''}
  `;
}
function printInvoice(){ window.print(); }


// ══════════════════════════════════════════════════════════════════
//  «نحوه محاسبه» — دکمه‌ی i کنار هر عدد
//  هر عدد در برنامه یک «تعریف» دارد: فرمول، اجزا (که خودشان لینک‌اند و
//  تعریف خودشان را دارند)، متغیرهای مؤثر (لینک به جایی که می‌شود دیدشان/عوض‌شان کرد)،
//  ریز رکوردهای سازنده‌ی عدد و چند «راستی‌آزمایی» که عدد را از مسیر دومی دوباره می‌سنجند.
// ══════════════════════════════════════════════════════════════════
const XPL = {};
function xdef(id, fn){ XPL[id] = fn; }
let XST = [], XLINKS = [], RB_LAST = null;

function xBtn(id, args, cls){
  return `<button type="button" class="xi-btn${cls?' '+cls:''}" title="نحوه‌ی محاسبه این عدد" aria-label="نحوه محاسبه" onclick="event.stopPropagation();xOpen('${id}',${escHtml(JSON.stringify(args||{}))})"><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6.6" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="4.9" r=".95" fill="currentColor"/><rect x="7.2" y="7" width="1.6" height="4.6" rx=".8" fill="currentColor"/></svg></button>`;
}
const fx = v => (Math.round((Number(v)||0)*100)/100).toLocaleString('en-US');
function xfmt(f, v){
  if(v===null || v===undefined || !isFinite(v)) return '—';
  if(f==='pct') return fx(v)+'٪';
  if(f==='num') return fx(v);
  if(f==='int') return Math.round(v).toLocaleString('en-US');
  return '\u2067'+fx(v)+' KT\u2069';
}
const xsum = (arr, f) => arr.reduce((a,x)=>a+(Number(typeof f==='function' ? f(x) : x[f])||0), 0);
const xclose = (a,b,tol) => Math.abs((Number(a)||0)-(Number(b)||0)) <= (tol===undefined ? 0.011 : tol);
function xRangeLabel(){ return partsReportRange==='all' ? 'همه‌ی زمان‌ها' : (partsReportRange==='30d' ? '۳۰ روز اخیر' : 'این ماه'); }
const xSalesR = () => PARTS.sales.filter(s=>inRange(s.date));
const xPurR = () => PARTS.purchases.filter(p=>inRange(p.order_date));
const xExpR = () => (PARTS.business_expenses||[]).filter(x=>inRange(x.date) && x.category!==TAX_PAYMENT_CATEGORY);
const xInvNo = s => s.invoice_no ? '#'+s.invoice_no : '—';
const xGoSale = id => ({go:'sales', fn:'openSaleModal', arg:id});
const xGoProd = id => ({go:'products', fn:'openProductModal', arg:id});
const xGoKardex = id => ({go:'kardex', fn:'openKardexFor', arg:id});
const xSrc = (label, go) => ({label, link:{go}});
function xSaleRow(s, valueFn, xid){
  return {cells:[jShort(s.date), xInvNo(s), s.customer_name||'مشتری متفرقه', fx(valueFn(s))+' KT'], link:{x:xid, a:{id:s.id}}};
}

// ───────────── بازه‌ای (سود و زیان) ─────────────
xdef('revenue', ()=>{
  const R = xSalesR(), v = xsum(R,'revenue');
  return {title:'درآمد فروش', term:'فروش خالص', latin:'Net Sales / Revenue', fmt:'T', scope:'range', value:v,
    formula:'جمع «درآمد» همه‌ی فاکتورهای فروشِ این بازه',
    note:'درآمد هر فاکتور = فروش کالا پس از تخفیف − مرجوعی + اثر هزینه‌ی ارسال. مالیات ارزش‌افزوده جزو درآمد نیست (بدهی است، نه درآمد).',
    records:{cols:['تاریخ','فاکتور','مشتری','درآمد'], rows:R.map(s=>xSaleRow(s, x=>x.revenue, 'sale_revenue')), total:v, totalCol:3, hint:'روی هر ردیف بزن تا بدانی درآمد همان فاکتور چطور حساب شده.'},
    checks:[partsReportRange==='all' ? {label:'جمع کل در سامانه (totals.revenue)', a:v, b:PARTS.totals.revenue} : null],
    sources:[xSrc('فاکتورهای فروش','sales')]};
});
xdef('cogs', ()=>{
  const R = xSalesR(), v = xsum(R,'cogs');
  return {title:'بهای تمام‌شده‌ی کالای فروش‌رفته', term:'بهای تمام‌شده‌ی کالای فروش‌رفته (ب.ت.ک.ف)', latin:'COGS', fmt:'T', scope:'range', value:v,
    formula:'جمع «بهای تمام‌شده» همه‌ی فاکتورهای فروش در این بازه',
    note:'بهای هر کالا به روش «اولین ورودی، اولین خروجی» (FIFO) از قدیمی‌ترین خریدِ باقی‌مانده برداشته می‌شود. بهای کالای مرجوع‌شده که به انبار برگشته از این عدد کم می‌شود.',
    records:{cols:['تاریخ','فاکتور','مشتری','بهای تمام‌شده'], rows:R.map(s=>xSaleRow(s, x=>x.cogs, 'sale_cogs')), total:v, totalCol:3},
    checks:[partsReportRange==='all' ? {label:'جمع کل در سامانه (totals.cogs)', a:v, b:PARTS.totals.cogs} : null],
    sources:[xSrc('خریدها (منبع بهای FIFO)','purchase'), xSrc('گردش کالا (کاردکس)','kardex')]};
});
xdef('gross_profit', ()=>{
  const v = xsum(xSalesR(),'revenue') - xsum(xSalesR(),'cogs');
  return {title:'سود ناخالص', term:'سود ناخالص (سود ناویژه)', latin:'Gross Profit', fmt:'T', scope:'range', value:v,
    formula:'درآمد فروش − بهای تمام‌شده‌ی کالای فروش‌رفته',
    parts:[{label:'درآمد فروش', ref:'revenue'}, {label:'بهای تمام‌شده‌ی کالای فروش‌رفته', ref:'cogs', op:'−'}],
    note:'هنوز هزینه‌های جاری و پورسانت از آن کم نشده است.',
    checks:[partsReportRange==='all' ? {label:'سود ناخالص در سامانه (totals.profit)', a:v, b:PARTS.totals.profit} : null]};
});
xdef('margin_pct', ()=>{
  const rev = xsum(xSalesR(),'revenue'), gp = rev - xsum(xSalesR(),'cogs');
  return {title:'حاشیه‌ی سود ناخالص', term:'درصد سود ناخالص (حاشیه‌ی سود)', latin:'Gross Margin', fmt:'pct', scope:'range', value: rev>0 ? gp/rev*100 : 0,
    formula:'(سود ناخالص ÷ درآمد فروش) × ۱۰۰',
    parts:[{label:'سود ناخالص', ref:'gross_profit'}, {label:'درآمد فروش', ref:'revenue', op:'÷'}], mult:100,
    note:'یعنی از هر ۱۰۰ KT فروش، چند KT سود ناخالص مانده. تفاوتش با مارکاپ: مبنای مارجین «قیمت فروش» است.'};
});
xdef('markup_pct', ()=>{
  const cg = xsum(xSalesR(),'cogs'), gp = xsum(xSalesR(),'revenue') - cg;
  return {title:'درصد سود نسبت به بها', term:'درصد سود به قیمت تمام‌شده (مارکاپ)', latin:'Markup', fmt:'pct', scope:'range', value: cg>0 ? gp/cg*100 : 0,
    formula:'(سود ناخالص ÷ بهای تمام‌شده) × ۱۰۰',
    parts:[{label:'سود ناخالص', ref:'gross_profit'}, {label:'بهای تمام‌شده‌ی کالای فروش‌رفته', ref:'cogs', op:'÷'}], mult:100,
    note:'مبنای مارکاپ «قیمت تمام‌شده» است؛ برای همین همیشه از مارجین بزرگ‌تر یا برابر است.'};
});
xdef('purchase_spend', ()=>{
  const R = xPurR(), tot = p=>xsum(p.items, it=>it.qty*it.unit_price), v = xsum(R, tot);
  return {title:'خرید کالا در این بازه', term:'خرید (مبلغ سفارش‌های خرید)', latin:'Purchases', fmt:'T', scope:'range', value:v,
    formula:'جمع (تعداد × قیمت خرید هر واحد) همه‌ی اقلام سفارش‌های خرید این بازه',
    note:'خرید «هزینه» نیست؛ موجودی کالا می‌شود و فقط هنگام فروش به بهای تمام‌شده تبدیل می‌شود.',
    records:{cols:['تاریخ','سفارش','تامین‌کننده','مبلغ'], rows:R.map(p=>({cells:[jShort(p.order_date), p.po_no?'#'+p.po_no:'—', (storeById(p.store_id)||{}).name||'—', fx(tot(p))+' KT'], link:{go:'purchase', fn:'openPurchaseModal', arg:p.id}})), total:v, totalCol:3},
    sources:[xSrc('ثبت خرید','purchase')]};
});
xdef('expenses_op', ()=>{
  const R = xExpR(), v = xsum(R,'amount');
  return {title:'هزینه‌های عملیاتی (جاری)', term:'هزینه‌های عملیاتی (اداری و فروش)', latin:'Operating Expenses', fmt:'T', scope:'range', value:v,
    formula:'جمع مبلغ همه‌ی هزینه‌های ثبت‌شده در این بازه، به‌جز «'+TAX_PAYMENT_CATEGORY+'»',
    note:'پرداخت مالیات (تسویه) هزینه نیست؛ بدهی مالیاتی را کم می‌کند و فقط از موجودی صندوق خارج می‌شود. پورسانت هم جدا حساب می‌شود.',
    records:{cols:['تاریخ','دسته','عنوان','مبلغ'], rows:R.map(x=>({cells:[jShort(x.date), x.category||'سایر', x.title||'—', fx(x.amount)+' KT'], link:{go:'expenses'}})), total:v, totalCol:3},
    sources:[xSrc('هزینه‌های جاری','expenses')]};
});
xdef('commission_range', ()=>{
  const R = xSalesR().filter(s=>(Number(s.agent_commission)||0)>0), v = xsum(R,'agent_commission');
  return {title:'پورسانت فروش', term:'پورسانت / کمیسیون فروش', latin:'Sales Commission', fmt:'T', scope:'range', value:v,
    formula:'جمع پورسانت محاسبه‌شده‌ی فاکتورهای این بازه',
    note:'پورسانت در لحظه‌ی فروش «هزینه» ثبت می‌شود؛ پرداخت نقدی آن بعداً فقط پول را از صندوق خارج می‌کند (دوبار حساب نمی‌شود).',
    records:{cols:['تاریخ','فاکتور','مشتری','پورسانت'], rows:R.map(s=>xSaleRow(s, x=>x.agent_commission, 'sale_commission')), total:v, totalCol:3}};
});
xdef('net_profit_range', ()=>{
  const gp = xsum(xSalesR(),'revenue') - xsum(xSalesR(),'cogs'), v = gp - xsum(xExpR(),'amount') - xsum(xSalesR(),'agent_commission');
  return {title:'سود خالص', term:'سود خالص عملیاتی (پیش از مالیات بر درآمد)', latin:'Net Profit', fmt:'T', scope:'range', value:v,
    formula:'سود ناخالص − هزینه‌های عملیاتی − پورسانت',
    parts:[{label:'سود ناخالص', ref:'gross_profit'}, {label:'هزینه‌های عملیاتی', ref:'expenses_op', op:'−'}, {label:'پورسانت فروش', ref:'commission_range', op:'−'}],
    note:'مالیات بر عملکرد شرکت (مالیات بر درآمد) در این برنامه محاسبه نمی‌شود.',
    checks:[partsReportRange==='all' ? {label:'سود خالص در سامانه (totals.net_profit_after_expenses)', a:v, b:PARTS.totals.net_profit_after_expenses} : null]};
});
xdef('invoice_count', ()=>{
  const R = xSalesR();
  return {title:'تعداد فاکتور فروش', term:'تعداد فاکتورهای فروش', latin:'Invoices', fmt:'int', scope:'range', value:R.length,
    formula:'شمارش فاکتورهای فروشِ تاریخ‌دار در این بازه',
    records:{cols:['تاریخ','فاکتور','مشتری','مبلغ فاکتور'], rows:R.map(s=>xSaleRow(s, x=>x.invoice_total, 'sale_invoice_total'))}};
});
xdef('avg_invoice', ()=>{
  const R = xSalesR(), rev = xsum(R,'revenue');
  return {title:'میانگین درآمد هر فاکتور', term:'میانگین فروش هر فاکتور', latin:'Average Order Value', fmt:'T', scope:'range', value:R.length ? rev/R.length : 0,
    formula:'درآمد فروش ÷ تعداد فاکتور', parts:[{label:'درآمد فروش', ref:'revenue'}, {label:'تعداد فاکتور', ref:'invoice_count', op:'÷'}]};
});
xdef('returns_range', ()=>{
  const R = xSalesR().filter(s=>(Number(s.returned_value_total)||0)>0), v = xsum(R,'returned_value_total');
  return {title:'مرجوعی (با مالیات)', term:'برگشت از فروش (مرجوعی)', latin:'Sales Returns', fmt:'T', scope:'range', value:v,
    formula:'جمع «مبلغ مرجوعی با مالیات» فاکتورهای این بازه',
    note:'مرجوعی از درآمد کم شده و بهای کالای برگشتی به انبار برمی‌گردد؛ پس سود ناخالص دوباره‌شماری نمی‌شود.',
    records:{cols:['تاریخ','فاکتور','مشتری','مرجوعی'], rows:R.map(s=>xSaleRow(s, x=>x.returned_value_total, 'sale_invoice_total')), total:v, totalCol:3},
    sources:[xSrc('ثبت مرجوعی','returns')]};
});

// ───────────── یک فاکتور فروش ─────────────
function xSale(a){ return PARTS.sales.find(s=>s.id===a.id); }
xdef('sale_revenue', a=>{
  const s = xSale(a); if(!s) return {title:'فاکتور حذف شده', fmt:'T', value:0};
  const items = s.items||[], lines = xsum(items, it=>Math.max((Number(it.qty)||0)*(Number(it.unit_price)||0)-(Number(it.discount)||0),0));
  const disc = Number(s.discount)||0, ship = Number(s.shipping_net_profit_effect)||0;
  const tp = Number(s.tax_percent)||0, retNet = tp>0 ? (Number(s.returned_value_total)||0)*100/(100+tp) : (Number(s.returned_value_total)||0);
  const netRev = Math.max(lines-disc,0);
  return {title:'درآمد فاکتور '+xInvNo(s), term:'فروش خالص این فاکتور', latin:'Net Sales (per invoice)', fmt:'T', scope:'item', value:s.revenue,
    formula:'(جمع اقلام پس از تخفیف ردیف − تخفیف کل فاکتور) + اثر هزینه‌ی ارسال − مرجوعی (بدون مالیات)',
    parts:[{label:'جمع اقلام (تعداد × قیمت − تخفیف ردیف)', val:lines, fmt:'T'}, {label:'تخفیف کل فاکتور', val:disc, fmt:'T', op:'−', link:xGoSale(s.id)},
      {label:'اثر هزینه‌ی ارسال (دریافتی از مشتری − پرداختی به پیک)', ref:'sale_ship', args:{id:s.id}, op:'+'},
      {label:'مرجوعی بدون مالیات', val:retNet, fmt:'T', op:'−', link:{go:'returns'}}],
    vars:[{label:'درصد مالیات این فاکتور', val:tp+'٪', link:xGoSale(s.id)}, {label:'روش تحویل', val:s.delivery_method||'—', link:xGoSale(s.id)}],
    note:'مالیات ارزش‌افزوده در درآمد نمی‌آید. تفاوت «جمع اقلام − تخفیف» تا مبلغ فاکتور همان ارسال و مالیات است.',
    records:{cols:['کالا','تعداد','قیمت واحد','تخفیف ردیف','درآمد ردیف (پس از مرجوعی و تخفیف کل)'], rows:items.map(it=>({cells:[(productById(it.product_id)?productLabel(productById(it.product_id)):'—'), fx(it.qty), fx(it.unit_price)+' KT', fx(it.discount||0)+' KT', fx(it.revenue)+' KT'], link:xGoProd(it.product_id)}))},
    checks:[{label:'درآمد فاکتور (از اجزا) = درآمد ثبت‌شده در سامانه', a:netRev+ship-retNet, b:s.revenue}],
    sources:[{label:'ویرایش / مشاهده‌ی این فاکتور', link:xGoSale(s.id)}]};
});
xdef('sale_ship', a=>{
  const s = xSale(a); if(!s) return {title:'—', fmt:'T', value:0};
  const ch = Number(s.shipping_charged_to_customer)||0, pd = Number(s.shipping_cost)||0;
  return {title:'اثر هزینه‌ی ارسال بر سود', term:'خالص هزینه‌ی ارسال', latin:'Net Shipping Effect', fmt:'T', scope:'item', value:ch-pd,
    formula:'ارسال دریافتی از مشتری − ارسال پرداختی به پیک',
    parts:[{label:'ارسال دریافتی از مشتری', val:ch, fmt:'T', link:xGoSale(s.id)}, {label:'ارسال پرداختی به پیک/باربری', val:pd, fmt:'T', op:'−', link:xGoSale(s.id)}],
    vars:[{label:'پرداخت‌کننده‌ی ارسال', val:({customer:'مشتری',business:'کسب‌وکار',split:'نصف‌نصف'})[s.shipping_payer]||s.shipping_payer||'—', link:xGoSale(s.id)}],
    note:'پیک همیشه کل هزینه را می‌گیرد؛ هرچه از مشتری نگرفته باشی، از سودت کم می‌شود. در «تحویل حضوری» هر دو صفرند.'};
});
xdef('sale_cogs', a=>{
  const s = xSale(a); if(!s) return {title:'—', fmt:'T', value:0};
  const items = s.items||[];
  return {title:'بهای تمام‌شده‌ی فاکتور '+xInvNo(s), term:'بهای تمام‌شده‌ی کالای فروش‌رفته', latin:'COGS (per invoice)', fmt:'T', scope:'item', value:s.cogs,
    formula:'جمع بهای FIFO اقلام فاکتور − بهای اقلام مرجوعی که به انبار برگشته',
    note:'بهای هر واحد از قدیمی‌ترین خرید باقی‌مانده کسر می‌شود؛ برای دیدن همین دسته‌های خرید، روی ردیف بزن تا «گردش کالا»ی آن کالا باز شود.',
    records:{cols:['کالا','تعداد','مرجوعی','بهای تمام‌شده‌ی ردیف','بها برای هر واحد'], rows:items.map(it=>({cells:[(productById(it.product_id)?productLabel(productById(it.product_id)):'—'), fx(it.qty), fx(it.returned_qty||0), fx(it.cogs)+' KT', fx((Number(it.qty)-(Number(it.returned_qty)||0))>0 ? it.cogs/(Number(it.qty)-(Number(it.returned_qty)||0)) : 0)+' KT'], link:xGoKardex(it.product_id)})), total:xsum(items,'cogs'), totalCol:3},
    checks:[{label:'جمع بهای ردیف‌ها = بهای فاکتور', a:xsum(items,'cogs'), b:s.cogs}],
    sources:[{label:'گردش کالا (کاردکس)', link:{go:'kardex'}}]};
});
xdef('sale_profit', a=>{
  const s = xSale(a); if(!s) return {title:'—', fmt:'T', value:0};
  return {title:'سود فاکتور '+xInvNo(s), term:'سود ناخالص فاکتور', latin:'Gross Profit (per invoice)', fmt:'T', scope:'item', value:s.profit,
    formula:'درآمد فاکتور − بهای تمام‌شده‌ی فاکتور',
    parts:[{label:'درآمد فاکتور', ref:'sale_revenue', args:{id:s.id}}, {label:'بهای تمام‌شده‌ی فاکتور', ref:'sale_cogs', args:{id:s.id}, op:'−'}]};
});
xdef('sale_commission', a=>{
  const s = xSale(a); if(!s) return {title:'—', fmt:'T', value:0};
  const ag = agentById(s.agent_id), basis = s.commission_basis || (ag&&ag.commission_basis) || 'profit', pct = Number(s.commission_percent)||0;
  const base = Math.max(basis==='profit' ? s.profit : s.revenue, 0);
  return {title:'پورسانت فاکتور '+xInvNo(s), term:'پورسانت / کمیسیون', latin:'Commission', fmt:'T', scope:'item', value:s.agent_commission,
    formula:'مبنای محاسبه ('+(basis==='profit'?'سود':'درآمد')+' فاکتور) × درصد پورسانت',
    parts:[{label:'مبنا: '+(basis==='profit'?'سود ناخالص فاکتور':'درآمد فاکتور'), ref: basis==='profit'?'sale_profit':'sale_revenue', args:{id:s.id}}, {label:'درصد پورسانت (ثبت‌شده روی همین فاکتور)', val:pct, fmt:'pct', op:'×', link:xGoSale(s.id)}], div100:true,
    vars:[{label:'نماینده', val:ag?ag.name:'—', link:ag?{go:'agents', fn:'openAgentModal', arg:ag.id}:null}, {label:'مبنای پورسانت', val:basis==='profit'?'سود':'درآمد', link:xGoSale(s.id)}],
    note:'درصد در لحظه‌ی فروش روی فاکتور ثبت می‌شود؛ عوض کردن درصد نماینده بعداً فاکتورهای قبلی را تغییر نمی‌دهد.',
    checks:[{label:'مبنا × درصد = پورسانت ثبت‌شده', a:base*pct/100, b:s.agent_commission}]};
});
xdef('sale_invoice_total', a=>{
  const s = xSale(a); if(!s) return {title:'—', fmt:'T', value:0};
  const lines = xsum(s.items||[], it=>Math.max((Number(it.qty)||0)*(Number(it.unit_price)||0)-(Number(it.discount)||0),0)), net = Math.max(lines-(Number(s.discount)||0),0);
  return {title:'مبلغ فاکتور '+xInvNo(s), term:'جمع فاکتور (قابل پرداخت)', latin:'Invoice Total', fmt:'T', scope:'item', value:s.invoice_total,
    formula:'(اقلام − تخفیف‌ها) + ارسال دریافتی از مشتری + مالیات ارزش‌افزوده',
    parts:[{label:'اقلام پس از تخفیف‌ها', val:net, fmt:'T', link:xGoSale(s.id)}, {label:'ارسال دریافتی از مشتری', val:s.shipping_charged_to_customer, fmt:'T', op:'+', link:xGoSale(s.id)}, {label:'مالیات ارزش‌افزوده', val:s.tax_amount, fmt:'T', op:'+', link:xGoSale(s.id)}],
    vars:[{label:'درصد مالیات', val:(Number(s.tax_percent)||0)+'٪', link:xGoSale(s.id)}],
    note:'مالیات = اقلام پس از تخفیف × درصد مالیات. مرجوعی پس از این محاسبه کسر می‌شود (به «مطالبات» نگاه کن).',
    checks:[{label:'جمع اجزا = مبلغ فاکتور', a:net+(Number(s.shipping_charged_to_customer)||0)+(Number(s.tax_amount)||0), b:s.invoice_total}]};
});
xdef('sale_outstanding', a=>{
  const s = xSale(a); if(!s) return {title:'—', fmt:'T', value:0};
  const v = Math.max((Number(s.net_invoice_total)||0)-((Number(s.amount_received)||0)-(Number(s.cash_refunded)||0)),0);
  return {title:'مانده‌ی طلب فاکتور '+xInvNo(s), term:'مانده‌ی حساب مشتری (مطالبات)', latin:'Receivable (per invoice)', fmt:'T', scope:'item', value:s.amount_outstanding,
    formula:'(مبلغ فاکتور − مرجوعی) − (دریافتی از مشتری − مبلغ نقدیِ برگردانده‌شده)، و نه کمتر از صفر',
    parts:[{label:'مبلغ فاکتور', ref:'sale_invoice_total', args:{id:s.id}}, {label:'مرجوعی (با مالیات)', val:s.returned_value_total, fmt:'T', op:'−', link:{go:'returns'}},
      {label:'دریافتی از مشتری', val:s.amount_received, fmt:'T', op:'−', link:xGoSale(s.id)}, {label:'نقد برگردانده‌شده به مشتری', val:s.cash_refunded, fmt:'T', op:'+', link:{go:'returns'}}],
    vars:[{label:'وضعیت پرداخت', val:PAY_LABELS[s.payment_status||'paid']||s.payment_status, link:xGoSale(s.id)}],
    checks:[{label:'محاسبه‌ی مجدد = مانده‌ی ثبت‌شده', a:v, b:s.amount_outstanding}]};
});

// ───────────── وضعیت لحظه‌ای ─────────────
const CASH_KEYS = {
  dep:   {label:'سرمایه واریزشده', types:['capital_deposit'], total:t=>t.total_deposits, sign:1, src:'cash'},
  wd:    {label:'سرمایه برداشت‌شده', types:['capital_withdrawal'], total:t=>t.total_withdrawals, sign:-1, src:'cash'},
  adj:   {label:'تعدیل‌های مغایرت‌گیری', types:['capital_adjustment'], total:t=>(t.net_capital||0)-(t.total_deposits||0)+(t.total_withdrawals||0), sign:1, src:'cash'},
  recv:  {label:'دریافتی واقعی از مشتریان', types:['sale_receipt'], total:t=>t.total_received_from_customers, sign:1, src:'sales'},
  refund:{label:'نقد بازگردانده‌شده بابت مرجوعی', types:['sale_refund'], total:t=>t.total_cash_refunds, sign:-1, src:'returns'},
  supp:  {label:'پرداخت‌شده به تامین‌کنندگان', types:['purchase_payment'], total:t=>t.total_paid_to_suppliers, sign:-1, src:'purchase'},
  exp:   {label:'هزینه‌های جاری', types:['expense'], total:t=>t.total_expenses, sign:-1, src:'expenses', taxMode:'op'},
  tax:   {label:'پرداخت مالیات به سازمان امور مالیاتی', types:['expense'], total:t=>t.total_tax_payments, sign:-1, src:'expenses', taxMode:'tax'},
  ship:  {label:'هزینه ارسال پرداخت‌شده', types:['shipping_paid'], total:t=>t.total_shipping_paid, sign:-1, src:'sales'},
  pay:   {label:'پورسانت پرداخت‌شده به نمایندگان', types:['agent_payout'], total:t=>t.total_agent_payouts, sign:-1, src:'agents'},
};
function xLedgerOf(k){
  const c = CASH_KEYS[k], exps = {}; (PARTS.business_expenses||[]).forEach(x=>exps[x.id]=x);
  return (PARTS.cash_ledger||[]).filter(e=>{
    if(!c.types.includes(e.type)) return false;
    if(c.taxMode){ const isTax = (exps[e.ref_id]||{}).category===TAX_PAYMENT_CATEGORY; return c.taxMode==='tax' ? isTax : !isTax; }
    return true;
  });
}
xdef('cash_part', a=>{
  const c = CASH_KEYS[a.key], T = PARTS.totals, L = xLedgerOf(a.key), fromLedger = a.key==='adj' ? xsum(L, e=>e.amount) : xsum(L, e=>Math.abs(e.amount)), v = c.total(T)||0;
  return {title:c.label, term:c.label, fmt:'T', scope:'now', value:v,
    formula:'جمع مبلغ همه‌ی رویدادهای «'+c.label+'» در دفتر گردش حساب',
    note: a.key==='tax' ? 'این‌ها از بدهی مالیات ارزش‌افزوده کم می‌شوند، نه از سود.' : (a.key==='pay' ? 'هزینه‌ی پورسانت قبلاً در لحظه‌ی فروش ثبت شده؛ این پرداخت فقط جابه‌جایی پول است.' : (a.key==='recv'||a.key==='supp' ? 'فاکتور نسیه تا وقتی پرداخت نشده، صندوق را تغییر نمی‌دهد.' : '')),
    records:{cols:['تاریخ','شرح','مبلغ'], rows:L.map(e=>({cells:[jShort(e.date), e.description||'—', fx(a.key==='adj' ? e.amount : Math.abs(e.amount))+' KT'], link:{go:'ledger'}})), total:fromLedger, totalCol:2},
    checks:[{label:'جمع رویدادهای دفتر = رقم سامانه', a:fromLedger, b:v}],
    sources:[xSrc('گردش حساب (دفتر کل صندوق)','ledger'), xSrc('منبع ثبت','' + c.src)]};
});
xdef('cash_balance', ()=>{
  const T = PARTS.totals, keys = Object.keys(CASH_KEYS), led = PARTS.cash_ledger||[], last = led.length ? led[led.length-1].running_balance : 0;
  const parts = keys.map((k,i)=>({label:CASH_KEYS[k].label, ref:'cash_part', args:{key:k}, op:CASH_KEYS[k].sign>0?'+':'−', signed:CASH_KEYS[k].sign, hide0:true}));
  return {title:'موجودی صندوق', term:'موجودی نقد (صندوق و بانک)', latin:'Cash Balance', fmt:'T', scope:'now', value:T.cash_balance||0,
    formula:'سرمایه‌ی واریزی − برداشت ± تعدیل + دریافتی از مشتریان − نقد برگشتی بابت مرجوعی − پرداختی به تامین‌کنندگان − هزینه‌ها − مالیات پرداختی − ارسال − پورسانت پرداختی',
    parts, note:'فاکتور نسیه و خرید نسیه تا وقتی پرداخت نشده‌اند در این عدد نیستند؛ جایشان «مطالبات» و «بدهی‌هاست».',
    checks:[{label:'آخرین مانده‌ی دفتر گردش حساب (running balance)', a:last, b:T.cash_balance}],
    sources:[xSrc('تفکیک صندوق','cash'), xSrc('گردش حساب','ledger')]};
});
xdef('inventory_value', ()=>{
  const T = PARTS.totals, rows = PARTS.products.map(p=>({p, st:Number((PARTS.stock||{})[p.id])||0, ac:Number((PARTS.avg_cost||{})[p.id])||0})).filter(r=>r.st>0.0001);
  const v = xsum(rows, r=>r.st*r.ac), units = xsum(rows,'st');
  return {title:'ارزش موجودی کالا', term:'ارزش موجودی کالا (به بهای تمام‌شده)', latin:'Inventory Value', fmt:'T', scope:'now', value:T.inventory_value||0,
    formula:'جمع (موجودی هر کالا × میانگین بهای باقی‌مانده‌ی آن) برای همه‌ی کالاها',
    note:'برخلاف قیمت فروش، به بهای خرید (FIFO) ارزش‌گذاری می‌شود؛ یعنی سود احتمالی را شامل نیست.',
    records:{cols:['کالا','موجودی','میانگین بها','ارزش'], rows:rows.map(r=>({cells:[productLabel(r.p), fx(r.st), fx(r.ac)+' KT', fx(r.st*r.ac)+' KT'], link:{x:'avg_cost', a:{pid:r.p.id}}})), total:v, totalCol:3},
    checks:[{label:'جمع ردیف‌ها = ارزش موجودی سامانه (با تحمل گردکردن میانگین‌ها)', a:v, b:T.inventory_value, tol:0.6+0.005*units}],
    sources:[xSrc('موجودی کالاها','stockview'), xSrc('گردش کالا','kardex')]};
});
xdef('avg_cost', a=>{
  const p = productById(a.pid), st = Number((PARTS.stock||{})[a.pid])||0, ac = Number((PARTS.avg_cost||{})[a.pid])||0;
  const buys = []; (PARTS.purchases||[]).forEach(pu=>(pu.items||[]).forEach(it=>{ if(it.product_id===a.pid) buys.push({d:pu.order_date, q:Number(it.qty)||0, pr:Number(it.unit_price)||0, id:pu.id}); }));
  buys.sort((x,y)=>(x.d||'').localeCompare(y.d||''));
  return {title:'بهای واحد '+(p?productLabel(p):''), term:'میانگین بهای تمام‌شده‌ی موجودی', latin:'Average Unit Cost (FIFO remaining)', fmt:'T', scope:'now', value:ac,
    formula:'ارزش دسته‌های خرید باقی‌مانده (FIFO) ÷ تعداد باقی‌مانده',
    note:'کالای فروخته‌شده از قدیمی‌ترین دسته کم می‌شود؛ برای همین بهای باقی‌مانده با آخرین قیمت خرید فرق می‌کند. موجودی فعلی: '+fx(st)+' عدد.',
    records:{cols:['تاریخ خرید','تعداد خریداری‌شده','قیمت خرید هر واحد'], rows:buys.map(b=>({cells:[jShort(b.d), fx(b.q), fx(b.pr)+' KT'], link:{go:'purchase', fn:'openPurchaseModal', arg:b.id}}))},
    sources:[{label:'گردش کالا (کاردکس) این کالا', link:xGoKardex(a.pid)}, {label:'ویرایش کالا', link:xGoProd(a.pid)}]};
});
xdef('accounts_receivable', ()=>{
  const R = PARTS.sales.filter(s=>(Number(s.amount_outstanding)||0)>0.005), v = xsum(R,'amount_outstanding');
  return {title:'حساب‌های دریافتنی (مطالبات)', term:'حساب‌های دریافتنی تجاری (طلب از مشتریان)', latin:'Accounts Receivable (AR)', fmt:'T', scope:'now', value:PARTS.totals.accounts_receivable||0,
    formula:'جمع «مانده‌ی طلب» همه‌ی فاکتورهای فروشِ تسویه‌نشده',
    records:{cols:['تاریخ','فاکتور','مشتری','مانده'], rows:R.map(s=>xSaleRow(s, x=>x.amount_outstanding, 'sale_outstanding')), total:v, totalCol:3},
    checks:[{label:'جمع فاکتورها = مطالبات سامانه', a:v, b:PARTS.totals.accounts_receivable}, {label:'جمع به تفکیک مشتری = مطالبات سامانه', a:xsum(Object.values(PARTS.ar_by_customer||{}),'outstanding'), b:PARTS.totals.accounts_receivable}],
    sources:[xSrc('فاکتورهای فروش','sales')]};
});
xdef('accounts_payable', ()=>{
  const ap = PARTS.ap_by_store||{}, ids = Object.keys(ap).filter(k=>(ap[k].outstanding||0)>0.005), v = xsum(ids, k=>ap[k].outstanding);
  return {title:'حساب‌های پرداختنی (بدهی‌ها)', term:'حساب‌های پرداختنی تجاری (بدهی به تامین‌کنندگان)', latin:'Accounts Payable (AP)', fmt:'T', scope:'now', value:PARTS.totals.accounts_payable||0,
    formula:'جمع (مبلغ سفارش خرید − پرداخت‌شده) برای همه‌ی خریدهای تسویه‌نشده',
    records:{cols:['تامین‌کننده','تعداد سفارش باز','مانده'], rows:ids.map(k=>({cells:[(storeById(k)||{}).name||'—', ap[k].count, fx(ap[k].outstanding)+' KT'], link:{go:'purchase'}})), total:v, totalCol:2},
    checks:[{label:'جمع تامین‌کنندگان = بدهی سامانه', a:v, b:PARTS.totals.accounts_payable}],
    sources:[xSrc('خریدها','purchase')]};
});
xdef('commission_accrued', ()=>{
  const v = xsum(PARTS.sales,'agent_commission');
  return {title:'کل پورسانت محاسبه‌شده', term:'پورسانت تعلق‌گرفته (از ابتدا)', latin:'Commission Accrued', fmt:'T', scope:'now', value:v, formula:'جمع پورسانت همه‌ی فاکتورهای فروش',
    records:{cols:['تاریخ','فاکتور','مشتری','پورسانت'], rows:PARTS.sales.filter(s=>s.agent_commission>0).map(s=>xSaleRow(s, x=>x.agent_commission, 'sale_commission')), total:v, totalCol:3},
    checks:[{label:'رقم سامانه (totals.total_agent_commission)', a:v, b:PARTS.totals.total_agent_commission}]};
});
xdef('commission_payable', ()=>{
  const T = PARTS.totals;
  return {title:'پورسانت پرداخت‌نشده', term:'ذخیره / بدهی پورسانت', latin:'Commission Payable', fmt:'T', scope:'now', value:T.agent_commission_payable||0,
    formula:'کل پورسانت محاسبه‌شده − کل پورسانت پرداخت‌شده',
    parts:[{label:'کل پورسانت محاسبه‌شده', ref:'commission_accrued'}, {label:'پورسانت پرداخت‌شده', ref:'cash_part', args:{key:'pay'}, op:'−'}],
    sources:[xSrc('نمایندگان','agents')]};
});
xdef('tax_collected', ()=>{
  const v = PARTS.totals.total_tax_collected||0, R = PARTS.sales.filter(s=>(Number(s.tax_amount)||0)>0);
  return {title:'مالیات ارزش‌افزوده‌ی دریافتی (خالص از مرجوعی)', term:'مالیات بر ارزش افزوده‌ی فروش (مالیات خروجی)', latin:'Output VAT', fmt:'T', scope:'now', value:v,
    formula:'جمع مالیات فاکتورها − مالیات بخش مرجوعی',
    records:{cols:['تاریخ','فاکتور','مشتری','مالیات فاکتور'], rows:R.map(s=>xSaleRow(s, x=>x.tax_amount, 'sale_invoice_total')), total:xsum(R,'tax_amount'), totalCol:3},
    note:'مالیات را از مشتری گرفته‌ای ولی مال دولت است؛ بنابراین بدهی محسوب می‌شود.'};
});
xdef('tax_payable', ()=>{
  const T = PARTS.totals;
  return {title:'مالیات بر ارزش افزوده‌ی پرداخت‌نشده', term:'مالیات پرداختنی (بدهی مالیاتی)', latin:'VAT Payable', fmt:'T', scope:'now', value:T.tax_payable||0,
    formula:'مالیات دریافتی از مشتریان − مالیاتِ پرداخت‌شده به سازمان امور مالیاتی',
    parts:[{label:'مالیات دریافتی (خالص از مرجوعی)', ref:'tax_collected'}, {label:'مالیات پرداخت‌شده', ref:'cash_part', args:{key:'tax'}, op:'−'}],
    note:'برای تسویه، هزینه‌ای با دسته‌ی «'+TAX_PAYMENT_CATEGORY+'» ثبت کن.',
    sources:[xSrc('ثبت پرداخت مالیات (هزینه‌ها)','expenses')]};
});
xdef('equity', ()=>{
  const T = PARTS.totals;
  return {title:'ارزش خالص دفتری', term:'حقوق صاحبان سرمایه (ارزش ویژه)', latin:'Owner\'s Equity / Net Book Value', fmt:'T', scope:'now', value:T.business_value||0,
    formula:'دارایی‌ها (صندوق + موجودی کالا + مطالبات) − بدهی‌ها (حساب‌های پرداختنی + پورسانت پرداخت‌نشده + مالیات پرداخت‌نشده)',
    parts:[{label:'موجودی صندوق', ref:'cash_balance'}, {label:'ارزش موجودی کالا', ref:'inventory_value', op:'+'}, {label:'حساب‌های دریافتنی', ref:'accounts_receivable', op:'+'},
      {label:'حساب‌های پرداختنی', ref:'accounts_payable', op:'−'}, {label:'پورسانت پرداخت‌نشده', ref:'commission_payable', op:'−'}, {label:'مالیات پرداخت‌نشده', ref:'tax_payable', op:'−'}],
    note:'اگر همه‌ی دارایی‌ها را بفروشی و همه‌ی بدهی‌ها را بدهی، این مقدار برایت می‌ماند (به قیمت تمام‌شده).',
    checks:[{label:'سرمایه‌ی خالص + سود خالص + بهای تخمینی فروش بدون موجودی = ارزش خالص', a:(T.net_capital||0)+(T.net_profit_after_expenses||0)+(T.oversold_cost||0), b:T.business_value}],
    sources:[xSrc('صندوق و سرمایه','cash')]};
});
xdef('net_capital', ()=>{
  const T = PARTS.totals;
  return {title:'خالص سرمایه‌ی واردشده', term:'سرمایه‌ی آورده‌ی صاحبان (خالص)', latin:'Net Capital Contributed', fmt:'T', scope:'now', value:T.net_capital||0,
    formula:'واریز − برداشت ± تعدیل مغایرت‌گیری',
    parts:[{label:'سرمایه واریزشده', ref:'cash_part', args:{key:'dep'}}, {label:'سرمایه برداشت‌شده', ref:'cash_part', args:{key:'wd'}, op:'−'}, {label:'تعدیل‌ها', ref:'cash_part', args:{key:'adj'}, op:'+'}]};
});
xdef('net_profit_alltime', ()=>{
  const T = PARTS.totals, v = (T.business_value||0)-(T.net_capital||0);
  return {title:'سود خالص (از ابتدا)', term:'سود انباشته‌ی دوره‌های گذشته تا امروز', latin:'Retained Earnings (cumulative)', fmt:'T', scope:'now', value:v,
    formula:'ارزش خالص دفتری − خالص سرمایه‌ی واردشده (روش ترازنامه‌ای)',
    parts:[{label:'ارزش خالص دفتری', ref:'equity'}, {label:'خالص سرمایه‌ی واردشده', ref:'net_capital', op:'−'}],
    note:'سود را از دو راه می‌شود حساب کرد: ترازنامه‌ای (همین‌جا) و صورت سود و زیان (درآمد − بها − هزینه‌ها − پورسانت). این دو باید برابر باشند؛ اگر نبودند اختلافشان معمولاً «فروش بدون موجودی» است.',
    checks:[{label:'سود از روش صورت سود و زیان + بهای تخمینی فروش بدون موجودی', a:(T.net_profit_after_expenses||0)+(T.oversold_cost||0), b:v}]};
});
xdef('oversold', ()=>{
  const T = PARTS.totals;
  return {title:'فروش بدون موجودی', term:'فروش بیش از موجودی ثبت‌شده', latin:'Oversold (negative stock) estimate', fmt:'T', scope:'now', value:T.oversold_cost||0,
    formula:'برای واحدهایی که بیش از خریدهای ثبت‌شده فروخته شده‌اند، بهای تخمینی = تعداد × میانگین بهای همان کالا',
    note:'اگر صفر نیست یعنی فاکتور خریدی ثبت نکرده‌ای. سود این فروش‌ها تخمینی است؛ فاکتور خرید را ثبت کن تا دقیق شود.',
    sources:[xSrc('خریدها','purchase')]};
});
xdef('inv_potential_sales', ()=>{
  const rows = invBuildRows().filter(r=>r.price!==null && r.stock>0), v = xsum(rows, r=>r.stock*r.price);
  return {title:'ارزش بالقوه‌ی فروش', term:'ارزش فروش موجودی (به قیمت فروش)', latin:'Potential Sales Value', fmt:'T', scope:'now', value:v,
    formula:'جمع (موجودی × قیمت فروش تعیین‌شده) برای کالاهایی که قیمت فروش دارند',
    records:{cols:['کالا','موجودی','قیمت فروش','ارزش'], rows:rows.map(r=>({cells:[productLabel(r.p), fx(r.stock), fx(r.price)+' KT', fx(r.stock*r.price)+' KT'], link:xGoProd(r.p.id)})), total:v, totalCol:3},
    sources:[xSrc('ویرایش قیمت فروش کالاها','products')]};
});
xdef('inv_potential_profit', ()=>{
  const rows = invBuildRows().filter(r=>r.price!==null && r.stock>0), sales = xsum(rows, r=>r.stock*r.price), cost = xsum(rows, r=>r.value);
  return {title:'سود بالقوه', term:'سود ناخالص قابل‌انتظار از موجودی', latin:'Potential Gross Profit', fmt:'T', scope:'now', value:sales-cost,
    formula:'ارزش بالقوه‌ی فروش − ارزش (بهای خرید) همان کالاها',
    parts:[{label:'ارزش بالقوه‌ی فروش', ref:'inv_potential_sales'}, {label:'بهای خرید همان کالاها', val:cost, fmt:'T', op:'−'}],
    note:'فقط کالاهایی حساب می‌شوند که قیمت فروش دارند؛ برای همین بهای همه‌ی انبار نیست.'};
});
xdef('inv_units', ()=>{
  const rows = PARTS.products.filter(p=>(Number((PARTS.stock||{})[p.id])||0)>0), v = xsum(rows, p=>(PARTS.stock||{})[p.id]);
  return {title:'جمع موجودی (عدد)', term:'تعداد کل موجودی انبار', latin:'Units on Hand', fmt:'num', scope:'now', value:v,
    formula:'جمع موجودی همه‌ی کالاها = ورودی‌ها (خرید + مرجوعیِ واردشده) − خروجی‌ها (فروش)',
    records:{cols:['کالا','موجودی'], rows:rows.map(p=>({cells:[productLabel(p), fx((PARTS.stock||{})[p.id])], link:xGoKardex(p.id)})), total:v, totalCol:1},
    checks:[{label:'رقم سامانه (totals.inventory_units)', a:v, b:PARTS.totals.inventory_units, tol:0.01}]};
});
xdef('low_stock_count', ()=>{
  const ids = PARTS.low_stock||[];
  return {title:'کالاهای زیر نقطه‌ی سفارش', term:'کالاهای رسیده به نقطه‌ی سفارش مجدد', latin:'Reorder Point', fmt:'int', scope:'now', value:ids.length,
    formula:'کالاهایی که موجودی ≤ نقطه‌ی سفارش خودشان هستند (اگر برایشان تعیین نشده، آستانه‌ی پیش‌فرض)',
    vars:[{label:'آستانه‌ی پیش‌فرض هشدار', val:fx(PARTS.low_stock_threshold)+' عدد', link:{go:'reports', focus:'lowStockThresholdInput'}}],
    records:{cols:['کالا','موجودی','نقطه‌ی سفارش'], rows:ids.map(id=>{ const p = productById(id)||{}; return {cells:[productLabel(p), fx((PARTS.stock||{})[id]||0), (p.reorder_point!==null&&p.reorder_point!==undefined&&p.reorder_point!=='') ? fx(p.reorder_point) : fx(PARTS.low_stock_threshold)+' (پیش‌فرض)'], link:xGoProd(id)}; })}};
});
xdef('hero_profit30', ()=>{
  const R = PARTS.sales.filter(s=>isWithinDays(s.date,30)), v = xsum(R,'profit');
  return {title:'سود ناخالص ۳۰ روز اخیر', term:'سود ناخالص ۳۰ روز اخیر', latin:'Gross Profit (30d)', fmt:'T', scope:'now', value:v, formula:'جمع «سود» فاکتورهای ۳۰ روز اخیر',
    records:{cols:['تاریخ','فاکتور','مشتری','سود'], rows:R.map(s=>xSaleRow(s, x=>x.profit, 'sale_profit')), total:v, totalCol:3}};
});

// ───────────── قیمت و حاشیه‌ی یک کالا ─────────────
xdef('margin_item', a=>{
  const p = productById(a.pid)||{}, sp = Number(p.sale_price)||0, cost = Number((PARTS.avg_cost||{})[a.pid])||0;
  return {title:'مارجین '+productLabel(p), term:'حاشیه‌ی سود (مارجین)', latin:'Margin', fmt:'pct', scope:'item', value:sp>0 ? (sp-cost)/sp*100 : 0,
    formula:'((قیمت فروش − بهای تمام‌شده) ÷ قیمت فروش) × ۱۰۰',
    parts:[{label:'قیمت فروش − بهای تمام‌شده', val:sp-cost, fmt:'T'}, {label:'قیمت فروش', val:sp, fmt:'T', op:'÷', link:xGoProd(a.pid)}], mult:100,
    vars:[{label:'قیمت فروش (قابل تغییر)', val:fx(sp)+' KT', link:xGoProd(a.pid)}],
    sources:[{label:'بهای تمام‌شده‌ی این کالا', link:{x:'avg_cost', a:{pid:a.pid}}}]};
});
xdef('markup_item', a=>{
  const p = productById(a.pid)||{}, sp = Number(p.sale_price)||0, cost = Number((PARTS.avg_cost||{})[a.pid])||0;
  return {title:'مارکاپ '+productLabel(p), term:'درصد سود به قیمت تمام‌شده (مارکاپ)', latin:'Markup', fmt:'pct', scope:'item', value:cost>0 ? (sp-cost)/cost*100 : (sp>0?100:0),
    formula:'((قیمت فروش − بهای تمام‌شده) ÷ بهای تمام‌شده) × ۱۰۰',
    parts:[{label:'قیمت فروش − بهای تمام‌شده', val:sp-cost, fmt:'T'}, {label:'بهای تمام‌شده (میانگین FIFO)', ref:'avg_cost', args:{pid:a.pid}, op:'÷'}], mult:100,
    vars:[{label:'قیمت فروش (قابل تغییر)', val:fx(sp)+' KT', link:xGoProd(a.pid)}]};
});
xdef('suggested_price', a=>{
  const p = productById(a.pid)||{}, cost = Number(a.cost)||Number((PARTS.avg_cost||{})[a.pid])||0, eff = effectivePricingSettings(p), r = computeSuggestedPrice(cost, eff);
  if(!r.feasible) return {title:'قیمت پیشنهادی', fmt:'T', value:0, note:'با این تنظیمات نمی‌شود به مارجین هدف رسید.', vars:[{label:'تنظیمات قیمت‌گذاری', val:'—', link:{fn:'openPricingSettingsModal'}}]};
  const k = eff.include_agent_share ? 1-(Number(eff.agent_share_pct)||0)/100 : 1, m = (Number(eff.target_margin_pct)||0)/100;
  return {title:'قیمت پیشنهادی '+productLabel(p), term:'قیمت فروش پیشنهادی بر پایه‌ی مارجین هدف', latin:'Target-Margin Price', fmt:'T', scope:'item', value:r.price,
    formula:'قیمت = ضریب × (بها + ارسال قابل‌بازیافت) ÷ (ضریب − مارجین هدف)، رو‌به‌بالا رند می‌شود',
    parts:[{label:'ضریب (۱ − سهم نماینده)', val:k, fmt:'num'}, {label:'بها + ارسال قابل‌بازیافت', val:cost+r.shippingToRecover, fmt:'T', op:'×'}, {label:'ضریب − مارجین هدف', val:k-m, fmt:'num', op:'÷'}, {label:'تفاوت رند کردن به بالا (تا مضرب '+fx(eff.round_step)+')', val:r.price-k*(cost+r.shippingToRecover)/(k-m), fmt:'T', op:'+'}],
    vars:[{label:'مارجین هدف', val:eff.target_margin_pct+'٪', link:{fn:'openPricingSettingsModal'}}, {label:'سهم نماینده از سود', val:eff.include_agent_share?eff.agent_share_pct+'٪':'غیرفعال', link:{fn:'openPricingSettingsModal'}},
      {label:'هزینه‌ی ارسال / پرداخت‌کننده', val:fx(eff.shipping_cost)+' KT · '+eff.shipping_payer, link:{fn:'openPricingSettingsModal'}}, {label:'گام رند کردن', val:fx(eff.round_step)+' KT', link:{fn:'openPricingSettingsModal'}}],
    note:'مقدار خام '+fx(k*(cost+r.shippingToRecover)/(k-m))+' KT بود و به بالا تا مضرب '+fx(eff.round_step)+' رند شد تا مارجین هدف کم نیاید. سود پس از سهم نماینده = '+fx(r.netProfit)+' KT (مارجین واقعی '+fx(r.marginPct)+'٪).'};
});

// ───────────── گزارش‌ساز ─────────────
const RB_FT = {
  bundle_orders:'شمارش فاکتورهایی که حداقل یک ردیفِ باندل یا جایزه دارند', bundle_revenue:'جمع درآمد ردیف‌هایی که با برچسب باندل/جایزه فروخته شده‌اند', bundle_discount:'جمع تخفیف ثبت‌شده روی ردیف‌های دارای برچسب باندل/جایزه (تخفیف باندل + بهای جایزه‌های رایگان)', reward_cost:'جمع بهای تمام‌شده‌ی ردیف‌های «جایزه»', bundle_share:'(درآمد ردیف‌های باندل ÷ درآمد کل) × ۱۰۰',
  sales_count:'شمارش شماره‌ی منحصربه‌فردِ فاکتورها', sale_lines:'شمارش ردیف‌های فروش', units_sold:'جمع (تعداد − مرجوعی) ردیف‌ها', units_sold_gross:'جمع تعداد ردیف‌ها بدون کسر مرجوعی',
  gross_sales:'جمع (تعداد × قیمت) ردیف‌ها', net_goods_sales:'جمع درآمد ردیف‌ها (پس از تخفیف و مرجوعی، بدون ارسال)', revenue:'جمع (درآمد کالا + سهم ردیف از اثر ارسال)',
  invoice_total:'جمع مبلغ فاکتورها (سهم هر ردیف)', amount_received:'جمع دریافتی از مشتریان (سهم ردیف)', amount_outstanding:'جمع مانده‌ی طلب (سهم ردیف)',
  avg_order_value:'جمع مبلغ فاکتورها ÷ تعداد فاکتور', avg_units_per_order:'جمع تعداد ÷ تعداد فاکتور', avg_sell_price:'(فروش ناخالص − تخفیف ردیف − تخفیف کل) ÷ تعداد',
  active_customers:'شمارش مشتریان منحصربه‌فرد', distinct_products_sold:'شمارش کالاهای منحصربه‌فرد', revenue_share:'(درآمد این سطر ÷ جمع درآمد همه‌ی سطرها) × ۱۰۰',
  cogs:'جمع بهای تمام‌شده‌ی ردیف‌ها', profit:'جمع (درآمد ردیف − بها + سهم ارسال)', margin_pct:'(سود ÷ درآمد) × ۱۰۰', markup_pct:'(سود ÷ بهای تمام‌شده) × ۱۰۰',
  profit_per_order:'جمع سود ÷ تعداد فاکتور', profit_per_unit:'جمع سود ÷ تعداد خالص فروخته‌شده', profit_share:'(سود این سطر ÷ جمع سود همه‌ی سطرها) × ۱۰۰',
  item_discount:'جمع تخفیف ردیف‌ها', invoice_discount:'جمع سهم ردیف از تخفیف کل فاکتور', discount_total:'تخفیف ردیف + تخفیف کل', discount_pct:'(جمع تخفیف ÷ فروش ناخالص) × ۱۰۰',
  discounted_orders:'شمارش فاکتورهای دارای تخفیف', commission:'جمع پورسانت (سهم ردیف)', ship_charged:'جمع ارسال دریافتی از مشتری', ship_paid:'جمع ارسال پرداختی به پیک', ship_absorbed:'−جمع اثر ارسال بر سود',
  shipped_orders:'شمارش فاکتورهای دارای ارسال', pickup_orders:'شمارش فاکتورهای تحویل حضوری', avg_ship_cost:'جمع ارسال پرداختی ÷ تعداد فاکتورهای دارای ارسال', tax_collected:'جمع مالیات خالص از مرجوعی',
  purchases_count:'شمارش سفارش‌های خرید', purchase_lines:'شمارش ردیف‌های خرید', units_purchased:'جمع تعداد خریداری‌شده', purchase_spend:'جمع (تعداد × قیمت خرید)', avg_buy_price:'جمع مبلغ خرید ÷ جمع تعداد',
  avg_purchase_value:'جمع مبلغ خرید ÷ تعداد سفارش', paid_to_suppliers:'جمع پرداخت‌شده (سهم ردیف)', purchase_outstanding:'جمع پرداخت‌نشده (سهم ردیف)', purchase_share:'(خرید این سطر ÷ کل خرید) × ۱۰۰',
  products_count:'شمارش کالاها', stock_units:'جمع موجودی فعلی', stock_value:'جمع (موجودی × میانگین بهای باقی‌مانده)', avg_stock_cost:'ارزش موجودی ÷ تعداد موجودی',
  avg_list_price:'میانگین قیمت فروش کالاهایی که قیمت دارند', potential_sales:'جمع (موجودی × قیمت فروش)', potential_profit:'جمع (موجودی × (قیمت فروش − بها))', potential_margin:'(سود بالقوه ÷ ارزش بالقوه) × ۱۰۰',
  low_stock_count:'شمارش کالاهای زیر نقطه‌ی سفارش', out_of_stock_count:'شمارش کالاهای با موجودی ≤ ۰', reorder_point_avg:'میانگین نقطه‌ی سفارش تعریف‌شده',
  stock_in:'جمع تعداد خرید + مرجوعیِ واردشده به انبار', stock_out:'جمع تعداد فروش', stock_change:'ورودی − خروجی', stock_at_end:'(خرید + مرجوعی واردشده − فروش) از ابتدا تا پایان دوره',
  returns_count:'شمارش شماره‌ی منحصربه‌فردِ مرجوعی‌ها', returned_units:'جمع تعداد مرجوعی', returned_value:'جمع ارزش مرجوعی بدون مالیات', returned_total:'جمع مبلغ مرجوعی با مالیات', cash_refunded:'جمع نقد بازگردانده‌شده',
  restocked_units:'جمع تعداد واردشده به انبار', return_rate:'(تعداد مرجوعی ÷ تعداد فروش) × ۱۰۰',
  expenses_total:'جمع هزینه‌ها (بدون پرداخت مالیات)', expenses_count:'شمارش هزینه‌ها', tax_paid:'جمع پرداخت‌های دسته‌ی «'+'پرداخت مالیات (تسویه)'+'»', expenses_avg:'جمع هزینه‌ها ÷ تعداد',
  deposits:'جمع واریزها', withdrawals:'جمع برداشت‌ها', adjustments:'جمع تعدیل‌ها', net_capital_flow:'واریز − برداشت + تعدیل',
  cash_in:'جمع رویدادهای مثبت دفتر صندوق', cash_out:'جمع رویدادهای منفی دفتر صندوق (قدر مطلق)', net_cash_flow:'ورودی − خروجی', cash_balance:'جمع همه‌ی رویدادهای دفتر صندوق تا پایان دوره',
  net_profit_after_exp:'سود ناخالص − هزینه‌ها − پورسانت', payouts_total:'جمع پرداخت‌های پورسانت', payouts_count:'شمارش پرداخت‌ها', agents_count:'شمارش نمایندگان', agent_pct:'میانگین درصد پورسانت',
  agent_accrued_total:'جمع پورسانت محاسبه‌شده', agent_paid_total:'جمع پورسانت پرداخت‌شده', agent_payable:'محاسبه‌شده − پرداخت‌شده', agent_orders:'شمارش فاکتورهای دارای نماینده',
  customers_count:'شمارش مشتریان', customer_outstanding:'جمع مانده‌ی طلب از مشتری', stores_count:'شمارش تامین‌کنندگان', store_payable:'جمع بدهی به تامین‌کننده', store_ship_cost:'جمع هزینه‌ی ارسال ثبت‌شده',
  store_free_min:'جمع حداقل خرید ارسال رایگان', pe_count:'شمارش قیمت‌های ثبت‌شده', pe_avg:'میانگین قیمت‌های لیست', pe_min:'کمینه‌ی قیمت لیست', pe_max:'بیشینه‌ی قیمت لیست', pe_last:'قیمت آخرین تاریخ ثبت',
  tot_ar:'حساب‌های دریافتنی (مطالبات) تا امروز', tot_ap:'حساب‌های پرداختنی تا امروز', tot_comm:'پورسانت پرداخت‌نشده تا امروز', tot_tax:'مالیات پرداخت‌نشده تا امروز',
  tot_oversold:'بهای تخمینی فروش بدون موجودی', tot_biz:'ارزش خالص دفتری (حقوق صاحبان سرمایه)', tot_capital:'خالص سرمایه‌ی واردشده',
};
const RB_FIELD_FA = {qty:'تعداد', ret_qty:'مرجوعی', net_qty:'تعداد خالص', gross:'فروش ناخالص', item_disc:'تخفیف ردیف', inv_disc:'سهم از تخفیف کل', item_rev:'درآمد کالا', revenue:'درآمد', cogs:'بها', profit:'سود',
  ship_charged:'ارسال دریافتی', ship_paid:'ارسال پرداختی', ship_eff:'اثر ارسال', tax:'مالیات', inv_total:'مبلغ فاکتور', received:'دریافتی', outstanding:'مانده', commission:'پورسانت', spend:'مبلغ', paid:'پرداخت‌شده',
  value:'ارزش', total:'مبلغ کل', cash:'نقد برگشتی', restock:'ورود به انبار', amount:'مبلغ', taxpay:'پرداخت مالیات', dep:'واریز', wd:'برداشت', adj:'تعدیل', amt:'مبلغ', in:'ورودی', out:'خروجی', price:'قیمت',
  stock:'موجودی', sale_price:'قیمت فروش', potential:'ارزش بالقوه', pot_profit:'سود بالقوه', low:'کم‌موجودی', ship:'ارسال', free_min:'حداقل ارسال رایگان', payable:'بدهی', accrued:'محاسبه‌شده', pct:'درصد',
  ar:'مطالبات', ap:'بدهی‌ها', biz:'ارزش خالص', comm_payable:'پورسانت پرداخت‌نشده', tax_payable:'مالیات پرداخت‌نشده', oversold:'فروش بدون موجودی', net_capital:'خالص سرمایه', is_exp:'تعداد'};
const RB_KIND_FA = {sl:'ردیف فروش', pl:'ردیف خرید', rt:'مرجوعی', ex:'هزینه', cap:'سرمایه', po:'پرداخت پورسانت', cl:'گردش صندوق', pe:'قیمت لیست', pr:'کالا', st:'تامین‌کننده', ag:'نماینده', cu:'مشتری', tot:'جمع‌بندی'};
function rbFieldsOf(m){
  if(m.fields) return m.fields;
  const src = String(m.fn), out = new Set(); let g; const re = /'([a-z_]+)'/g;
  while((g = re.exec(src))) if(RB_FIELD_FA[g[1]]) out.add(g[1]);
  return [...out];
}
function rbFactLink(f){
  if(f.k==='sl') return xGoSale(f.sid);
  if(f.k==='pl') return {go:'purchase', fn:'openPurchaseModal', arg:f.pur};
  if(f.k==='rt') return {go:'returns'};
  if(f.k==='ex') return {go:'expenses'};
  if(f.k==='cap'||f.k==='cl') return {go:'ledger'};
  if(f.k==='po') return {go:'agents'};
  if(f.k==='pr') return xGoKardex(f.pid);
  return null;
}
xdef('rb_metric', a=>{
  const m = RB_METRICS[a.mid]; if(!m) return {title:'—', fmt:'T', value:0};
  const fields = rbFieldsOf(m);
  return {title:m.label, term:m.label, latin:RB_EN[m.id]||'', fmt:m.unit==='money'?'T':(m.unit==='pct'?'pct':'num'), scope:'def', noValue:true,
    formula:RB_FT[m.id] || m.hint || '—', note:(m.hint?m.hint+'. ':'')+(m.snap?'این متغیر «وضعیتی» است: مانده‌ی پایان هر دوره را نشان می‌دهد، نه جمع داخل دوره. ':'')+'برای دیدن اعداد سازنده‌ی هر خانه، روی i کنار همان خانه بزن.',
    vars:fields.map(f=>({label:'فیلد «'+RB_FIELD_FA[f]+'» ('+f+')', val:'از ریز رکوردها', link:null})),
    code:String(m.fn), sources:[xSrc('گزارش‌ساز','reportbuilder')]};
});
xdef('rb_cell', a=>{
  const res = RB_LAST; if(!res) return {title:'—', fmt:'T', value:0};
  const m = res.metrics[a.mi], par = a.ri<0 ? null : res.rows[a.ri];
  let cell = par, label = a.ri<0 ? 'جمع کل' : (par?par.label:'—'), shown = a.ri<0 ? res.total[a.mi] : (par?par.vals[a.mi]:0);
  if(a.ck!==undefined){
    cell = a.ri<0 ? (res._colTot||{})[a.ck] : (par && (par.children||[]).find(z=>z.key===a.ck));
    label = (a.ri<0 ? 'جمع کل' : par.label) + ' ‹ ' + (cell ? cell.label : a.ck);
    shown = cell ? cell.vals[a.mi] : 0;
  }
  const endCtx = rbMkCtx(res.eff, res._tf, res._base, res.eff.to, res.eff.from);
  let f, ctx;
  if(cell){ f = m.snap ? cell._s : cell._f; ctx = Object.assign({}, endCtx, cell._ctx||{}); }
  else { f = m.snap ? res._ts : res._tf; ctx = endCtx; }
  const need = new Set(m.kinds), rows = (f||[]).filter(x=>need.has(x.k)), v = rbEval(m, f||[], ctx);
  const fields = rbFieldsOf(m).filter(k=>rows.some(r=>r.v && r.v[k]!==undefined));
  const cols = ['تاریخ','نوع','شرح'].concat(fields.map(k=>RB_FIELD_FA[k]));
  const show = rows.slice(0, 400);
  const desc = r => r.k==='sl'||r.k==='pl' ? ((productById(r.pid)?productLabel(productById(r.pid)):'—')) : (r.k==='rt' ? 'مرجوعی' : (r.k==='ex' ? (r.d.expense_category||[''])[0] : ((r.d&&r.d.store)?((storeById(r.d.store[0])||{}).name||''):'')));
  const sums = {}; fields.forEach(k=>sums[k] = xsum(rows, r=>r.v[k]));
  const isMoney = k=>!['qty','ret_qty','net_qty','restock','stock','low','is_exp','pct'].includes(k);
  return {title:m.label, term:label, latin:RB_EN[m.id]||'', fmt:m.unit==='money'?'T':(m.unit==='pct'?'pct':'num'), scope:'cell', value:v,
    formula:RB_FT[m.id]||m.hint||'—',
    note:'این عدد از '+rows.length+' ردیفِ سازنده‌اش محاسبه شده (ردیف‌های پایین). '+(rows.length>400?'فقط ۴۰۰ ردیف اول نمایش داده می‌شود. ':'')+(m.unit==='pct'||/÷|share|avg|میانگین/.test(m.label+RB_FT[m.id])?'چون نسبت/میانگین است، جمع ستون‌ها را در فرمول بالا جایگذاری کن.':''),
    records:{cols, rows:show.map(r=>({cells:[r.date?jShort(r.date):'—', RB_KIND_FA[r.k]||r.k, desc(r)].concat(fields.map(k=>isMoney(k)?fx(r.v[k])+' KT':fx(r.v[k]))), link:rbFactLink(r)})),
      total:null, sumsRow: fields.length ? ['','','جمع'].concat(fields.map(k=>isMoney(k)?fx(sums[k])+' KT':fx(sums[k]))) : null},
    checks:[{label:'محاسبه‌ی مجدد از ردیف‌ها = عدد جدول', a:v, b:shown, tol:1e-6}],
    code:String(m.fn), sources:[{label:'تعریف این متغیر', link:{x:'rb_metric', a:{mid:m.id}}}]};
});

// ───────────── موتور نمایش ─────────────
function xRun(id, args){
  const fn = XPL[id];
  if(!fn) return {title:'(تعریف ندارد)', fmt:'T', value:0, note:'برای این عدد هنوز تعریفی ثبت نشده.'};
  try{ const r = fn(args||{}); r.id = id; r.args = args||{}; return r; }
  catch(e){ console.warn('[xpl]', id, e); return {title:'خطا در محاسبه', fmt:'T', value:0, note:'محاسبه‌ی این مورد با خطا روبه‌رو شد: '+e.message, id, args:args||{}}; }
}
function xOpen(id, args){ XST = [{id, args:args||{}}]; xRender(); document.getElementById('xplOverlay').classList.add('open'); }
function xPush(id, args){ XST.push({id, args:args||{}}); xRender(); }
function xBack(){ if(XST.length>1){ XST.pop(); xRender(); } }
function xCrumb(i){ XST = XST.slice(0, i+1); xRender(); }
function xClose(){ document.getElementById('xplOverlay').classList.remove('open'); XST = []; }
function xLink(i){
  const l = XLINKS[i]; if(!l) return;
  if(l.x){ xPush(l.x, l.a); return; }
  xClose();
  if(l.go) showPartsSub(l.go);
  setTimeout(()=>{
    if(l.fn && typeof window[l.fn]==='function'){ try{ window[l.fn](l.arg); }catch(e){ console.warn(e); } }
    if(l.focus){ const el = document.getElementById(l.focus); if(el){ el.scrollIntoView({block:'center'}); el.focus(); } }
  }, 80);
}
function xtxt(c){ return escHtml(c).replace(/(-?[\d,]+(?:\.\d+)?) KT/g, '\u2067$1 KT\u2069'); }
function xl(link, html){
  if(!link) return html;
  XLINKS.push(link);
  return `<a href="javascript:void(0)" class="xl" onclick="xLink(${XLINKS.length-1})">${html}</a>`;
}
function xCombine(r, vals){
  let acc = vals[0];
  for(let i=1;i<vals.length;i++){
    const op = (r.parts[i].op)||'+', v = vals[i];
    acc = op==='+' ? acc+v : (op==='−' ? acc-v : (op==='×' ? acc*v : (v ? acc/v : 0)));
  }
  if(r.mult) acc *= r.mult;
  if(r.div100) acc /= 100;
  return acc;
}
function xRender(){
  XLINKS = [];
  const body = document.getElementById('xplBody'), cur = XST[XST.length-1]; if(!body || !cur) return;
  const r = xRun(cur.id, cur.args), f = r.fmt || 'T';
  // parts
  let partsHtml = '', checks = (r.checks||[]).filter(Boolean);
  if(r.parts && r.parts.length){
    const resolved = r.parts.map(p=>{
      if(p.ref){ const sub = xRun(p.ref, p.args); return Object.assign({}, p, {val:sub.value, fmt:sub.fmt||'T'}); }
      return Object.assign({fmt:'T'}, p);
    });
    const vals = resolved.map(p=>Number(p.val)||0), composed = xCombine(r, vals);
    const shown = resolved.filter(p=>!(p.hide0 && Math.abs(p.val||0)<0.005));
    partsHtml = `<div class="xpl-sec"><div class="xpl-sec-t">جایگذاری اعداد <span class="xpl-hint">(روی هر جزء بزن تا همان را هم مو‌به‌مو ببینی)</span></div>
      <table class="xpl-tbl"><tbody>${shown.map((p,i)=>`<tr><td class="xpl-op">${i===0?'':(p.op||'+')}</td><td>${p.ref ? xl({x:p.ref, a:p.args}, escHtml(p.label)) : (p.link ? xl(p.link, escHtml(p.label)) : escHtml(p.label))}</td>
        <td class="xpl-num">${p.ref ? xl({x:p.ref, a:p.args}, xfmt(p.fmt,p.val)) : xfmt(p.fmt,p.val)}</td></tr>`).join('')}
        <tr class="xpl-res"><td class="xpl-op">=</td><td>نتیجه${r.mult?' (× '+r.mult+')':''}${r.div100?' (÷ ۱۰۰)':''}</td><td class="xpl-num">${xfmt(f, composed)}</td></tr></tbody></table></div>`;
    if(!r.noValue) checks.unshift({label:'جمع‌بندیِ اجزای بالا = عدد نمایش‌داده‌شده', a:composed, b:r.value, fmt:f, tol: f==='pct' ? 0.06 : 0.6});
  }
  const chkHtml = checks.length ? `<div class="xpl-sec"><div class="xpl-sec-t">راستی‌آزمایی <span class="xpl-hint">(عدد از مسیر دومی هم سنجیده می‌شود)</span></div>${checks.map(c=>{
    const ok = xclose(c.a, c.b, c.tol===undefined ? 0.6 : c.tol), ff = c.fmt || f;
    return `<div class="xpl-chk ${ok?'ok':'bad'}"><span>${ok?'✅':'❌'}</span><span>${escHtml(c.label)}</span><span class="xpl-num">${xfmt(ff,c.a)} ${ok?'=':'≠'} ${xfmt(ff,c.b)}</span></div>`;
  }).join('')}${checks.some(c=>!xclose(c.a,c.b,c.tol===undefined?0.6:c.tol))?'<div class="xpl-warn">⚠️ اختلاف دیده شد. از ریز رکوردها و لینک‌های بالا ریشه‌یابی کن؛ معمولاً یکی از اسناد قدیمی ناقص ثبت شده یا فروش بدون موجودی هست.</div>':''}</div>` : '';
  const recHtml = r.records && r.records.rows ? (()=>{
    const rc = r.records, n = rc.rows.length;
    return `<div class="xpl-sec"><div class="xpl-sec-t">ریز رکوردها (${fx(n)} مورد) ${rc.hint?`<span class="xpl-hint">${escHtml(rc.hint)}</span>`:'<span class="xpl-hint">(روی هر ردیف بزن تا باز شود)</span>'}</div>
      <div class="xpl-scroll"><table class="xpl-tbl xpl-rec"><thead><tr>${rc.cols.map(c=>`<th>${escHtml(c)}</th>`).join('')}</tr></thead><tbody>${
      n ? rc.rows.slice(0,500).map(row=>`<tr class="${row.link?'clk':''}" ${row.link?`onclick="xLink(${(XLINKS.push(row.link), XLINKS.length-1)})"`:''}>${row.cells.map(c=>`<td>${xtxt(c)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${rc.cols.length}" class="parts-table-empty">رکوردی نیست.</td></tr>`}
      ${rc.sumsRow ? `<tr class="xpl-res">${rc.sumsRow.map(c=>`<td>${xtxt(c)}</td>`).join('')}</tr>` : (rc.total!==null && rc.total!==undefined && n ? `<tr class="xpl-res">${rc.cols.map((c,i)=>`<td>${i===0?'جمع':(i===rc.totalCol?xtxt(fx(rc.total)+' KT'):'')}</td>`).join('')}</tr>` : '')}
      </tbody></table></div>${n>500?'<div class="xpl-hint">فقط ۵۰۰ ردیف اول نمایش داده شد.</div>':''}</div>`;
  })() : '';
  const varHtml = r.vars && r.vars.length ? `<div class="xpl-sec"><div class="xpl-sec-t">متغیرهای مؤثر <span class="xpl-hint">(لینک → دیدن / تغییر)</span></div><table class="xpl-tbl"><tbody>${r.vars.map(v=>`<tr><td>${escHtml(v.label)}</td><td class="xpl-num">${xtxt(v.val)}</td><td>${v.link ? xl(v.link,'مشاهده / تغییر ↗') : ''}</td></tr>`).join('')}</tbody></table></div>` : '';
  const srcHtml = r.sources && r.sources.length ? `<div class="xpl-sec"><div class="xpl-sec-t">منبع داده</div><div class="xpl-src">${r.sources.map(s=>xl(s.link, escHtml(s.label)+' ↗')).join(' · ')}</div></div>` : '';
  const crumbs = XST.map((c,i)=>{ const t = xRun(c.id, c.args).title||c.id; return i===XST.length-1 ? `<b>${escHtml(t)}</b>` : `<a href="javascript:void(0)" class="xl" onclick="xCrumb(${i})">${escHtml(t)}</a>`; }).join(' ‹ ');
  const scopeBadge = ({range:'بازه: '+xRangeLabel(), now:'وضعیت لحظه‌ای', item:'یک مورد', cell:'یک خانه‌ی گزارش', def:'تعریف متغیر'})[r.scope] || '';
  body.innerHTML = `
    <div class="xpl-crumbs">${XST.length>1?`<button type="button" class="xpl-back" onclick="xBack()">→ بازگشت</button>`:''}${crumbs}</div>
    <div class="xpl-head"><div><div class="xpl-title">${escHtml(r.title||'')}</div>
      ${r.term?`<div class="xpl-term"><span class="xpl-term-fa">معادل رایج: ${escHtml(r.term)}</span>${r.latin?`<span class="xpl-term-en" dir="ltr">${escHtml(r.latin)}</span>`:''}</div>`:''}
      ${scopeBadge?`<span class="xpl-badge">${escHtml(scopeBadge)}</span>`:''}</div>
      ${r.noValue?'':`<div class="xpl-val">${xfmt(f, r.value)}${f==='T'?`<div class="xpl-val-sub">= ${fx(Math.round((Number(r.value)||0)*1000))} تومان</div>`:''}</div>`}</div>
    ${r.formula?`<div class="xpl-sec"><div class="xpl-sec-t">فرمول</div><div class="xpl-formula">${escHtml(r.formula)}</div></div>`:''}
    ${partsHtml}${varHtml}${recHtml}${chkHtml}
    ${r.note?`<div class="xpl-note">💡 ${xtxt(r.note)}</div>`:''}
    ${r.code?`<details class="xpl-code"><summary>کد دقیق محاسبه (برای ریشه‌یابی فنی)</summary><pre dir="ltr">${escHtml(r.code)}</pre></details>`:''}
    ${srcHtml}`;
  body.scrollTop = 0;
}
document.addEventListener('keydown', e=>{ if(e.key==='Escape' && document.getElementById('xplOverlay') && document.getElementById('xplOverlay').classList.contains('open')) xClose(); });


// ══════════════════════════════════════════════════════════════════
//  دوزبانه: زیر هر عنوان مالی/آماری، معادل انگلیسی رایجش با فونت ریز می‌آید.
// ══════════════════════════════════════════════════════════════════
const BI_TERMS = [
  ['نقدی بازگردانده','Cash Refunds'],
  ['حاشیه سود ناخالص','Gross Margin'], ['درصد سود نسبت به بها','Markup'], ['سود ناخالص','Gross Profit'], ['سود خالص (از ابتدا)','Cumulative Net Profit'], ['سود خالص','Net Profit'],
  ['درآمد فروش','Net Sales'], ['بهای تمام‌شده کالای فروش‌رفته','COGS'], ['خرید کالا','Purchases'], ['هزینه‌های عملیاتی','Operating Expenses'], ['پورسانت پرداخت‌نشده','Commission Payable'],
  ['پورسانت فروش','Sales Commission'], ['تعداد فاکتور','Invoices'], ['میانگین درآمد هر فاکتور','Avg. Order Value'], ['تعداد سفارش خرید','Purchase Orders'], ['مرجوعی','Sales Returns'],
  ['موجودی نقد','Cash Balance'], ['موجودی صندوق','Cash Balance'], ['ارزش موجودی کالا','Inventory Value'], ['ارزش موجودی انبار','Inventory Value'], ['ارزش موجودی (قیمت خرید)','Inventory Value (at cost)'],
  ['تعداد کالای موجود','Units on Hand'], ['زیر نقطه سفارش','Below Reorder Point'], ['حساب‌های دریافتنی','Accounts Receivable'], ['حساب‌های پرداختنی','Accounts Payable'],
  ['مالیات بر ارزش افزوده','VAT Payable'], ['حقوق صاحبان سرمایه','Owner\'s Equity'], ['ارزش خالص دفتری','Net Book Value'], ['ارزش بالقوه فروش','Potential Sales Value'], ['سود بالقوه','Potential Profit'],
  ['تعداد کالا','SKU Count'], ['جمع موجودی','Units on Hand'], ['کم‌موجودی','Low Stock'], ['ناموجود','Out of Stock'], ['راکد','Slow-moving'],
  ['جمع ورودی','Total In'], ['جمع خروجی','Total Out'], ['موجودی طبق گردش','Stock per Ledger'], ['موجودی ثبت‌شده در انبار','Recorded Stock'],
  ['سرمایه واریزشده','Capital Contributed'], ['سرمایه برداشت‌شده','Owner Drawings'], ['تعدیل','Adjustments'], ['دریافتی واقعی از مشتریان','Cash Received'], ['پرداخت‌شده به تامین‌کنندگان','Paid to Suppliers'],
  ['هزینه‌های جاری','Operating Expenses'], ['پرداخت مالیات','Tax Paid'], ['هزینه ارسال پرداخت‌شده','Shipping Paid'], ['پورسانت پرداخت‌شده','Commissions Paid'],
  ['تعداد خریدها','Purchase Count'], ['جمع هزینه خرید','Total Purchases'], ['خرید ۳۰ روز اخیر','Purchases (30d)'], ['سود ۳۰ روز اخیر','Gross Profit (30d)'], ['درآمد ۳۰ روز اخیر','Revenue (30d)'],
];
function biEn(label){
  const l = String(label||'');
  for(const [fa,en] of BI_TERMS) if(l.includes(fa)) return en;
  return '';
}
function biLabel(label){
  const en = biEn(label);
  return escHtmlKeep(label) + (en ? `<span class="kpi-en" dir="ltr">${en}</span>` : '');
}
function escHtmlKeep(s){ return String(s); }   // labels here are our own static strings
function kpiCardHtml(icon, label, val, color, xid, xargs){
  return `<div class="parts-kpi-card" style="--kpi-color:${color}">
      ${xid ? xBtn(xid, xargs, 'xi-corner') : ''}
      ${icon ? `<div class="parts-kpi-icon">${icon}</div>` : ''}
      <div class="parts-kpi-label">${biLabel(label)}</div>
      <div class="parts-kpi-val" style="color:${color}">${val}</div>
    </div>`;
}
const RB_EN = {
  bundle_orders:'Bundle Invoices', bundle_revenue:'Bundle Revenue', bundle_discount:'Bundle Discounts', reward_cost:'Reward Cost', bundle_share:'Bundle Revenue Share %',
  sales_count:'Invoices', sale_lines:'Sale Lines', units_sold:'Units Sold (net)', units_sold_gross:'Units Sold (gross)', gross_sales:'Gross Sales', net_goods_sales:'Net Goods Sales', revenue:'Net Sales / Revenue',
  invoice_total:'Invoiced Amount', amount_received:'Cash Received', amount_outstanding:'Accounts Receivable', avg_order_value:'Avg. Order Value', avg_units_per_order:'Units per Order', avg_sell_price:'Avg. Selling Price',
  active_customers:'Active Customers', distinct_products_sold:'Distinct SKUs Sold', revenue_share:'Revenue Share %', cogs:'COGS', profit:'Gross Profit', margin_pct:'Gross Margin %', markup_pct:'Markup %',
  profit_per_order:'Profit per Order', profit_per_unit:'Profit per Unit', profit_share:'Profit Share %', item_discount:'Line Discounts', invoice_discount:'Invoice Discounts', discount_total:'Total Discounts',
  discount_pct:'Discount Rate %', discounted_orders:'Discounted Orders', commission:'Sales Commission', ship_charged:'Shipping Charged', ship_paid:'Shipping Paid', ship_absorbed:'Shipping Absorbed',
  shipped_orders:'Shipped Orders', pickup_orders:'Pickup Orders', avg_ship_cost:'Avg. Shipping Cost', tax_collected:'Output VAT',
  purchases_count:'Purchase Orders', purchase_lines:'Purchase Lines', units_purchased:'Units Purchased', purchase_spend:'Purchases', avg_buy_price:'Avg. Purchase Price', avg_purchase_value:'Avg. PO Value',
  paid_to_suppliers:'Paid to Suppliers', purchase_outstanding:'Accounts Payable', purchase_share:'Purchase Share %',
  products_count:'SKU Count', stock_units:'Units on Hand', stock_value:'Inventory Value', avg_stock_cost:'Avg. Unit Cost', avg_list_price:'Avg. List Price', potential_sales:'Potential Sales Value',
  potential_profit:'Potential Profit', potential_margin:'Potential Margin %', low_stock_count:'Low-stock SKUs', out_of_stock_count:'Out-of-stock SKUs', reorder_point_avg:'Avg. Reorder Point',
  stock_in:'Stock In', stock_out:'Stock Out', stock_change:'Net Stock Change', stock_at_end:'Closing Stock',
  returns_count:'Returns (count)', returned_units:'Returned Units', returned_value:'Returns (ex-VAT)', returned_total:'Returns (incl. VAT)', cash_refunded:'Cash Refunded', restocked_units:'Restocked Units', return_rate:'Return Rate %',
  expenses_total:'Operating Expenses', expenses_count:'Expense Count', tax_paid:'VAT Settlement Paid', expenses_avg:'Avg. Expense', deposits:'Capital Contributed', withdrawals:'Owner Drawings', adjustments:'Adjustments', net_capital_flow:'Net Capital',
  cash_in:'Cash In', cash_out:'Cash Out', net_cash_flow:'Net Cash Flow', cash_balance:'Closing Cash Balance', net_profit_after_exp:'Net Profit',
  payouts_total:'Commissions Paid', payouts_count:'Payout Count', agents_count:'Agents', agent_pct:'Avg. Commission %', agent_accrued_total:'Commission Accrued', agent_paid_total:'Commission Paid', agent_payable:'Commission Payable', agent_orders:'Agent Orders',
  customers_count:'Customers', customer_outstanding:'Customer Balance Due', stores_count:'Suppliers', store_payable:'Payable to Supplier', store_ship_cost:'Supplier Shipping Cost', store_free_min:'Free-shipping Threshold',
  pe_count:'Price Quotes', pe_avg:'Avg. Quoted Price', pe_min:'Min. Quoted Price', pe_max:'Max. Quoted Price', pe_last:'Latest Quoted Price',
  tot_ar:'Accounts Receivable', tot_ap:'Accounts Payable', tot_comm:'Commission Payable', tot_tax:'VAT Payable', tot_oversold:'Oversold (est. cost)', tot_biz:'Owner\'s Equity', tot_capital:'Net Capital',
};
function rbMetricHead(m){
  return `<span class="rb-th-main">${escHtml(m.label)}</span>${RB_EN[m.id] ? `<span class="kpi-en" dir="ltr">${escHtml(RB_EN[m.id])}</span>` : ''}${xBtn('rb_metric', {mid:m.id}, 'xi-mini')}`;
}

// ══════════════════════════════════════════════════════════════════
//  خروجی PDF — صفحه‌ی چاپی تمیز، فونت وزیرمتن؛ در پنجره‌ی چاپ «Save as PDF» را بزن.
// ══════════════════════════════════════════════════════════════════
function pdfClean(html){
  return String(html)
    .replace(/<button[^>]*class="[^"]*xi-btn[^"]*"[^>]*>[\s\S]*?<\/button>/g, '')
    .replace(/<button[\s\S]*?<\/button>/g, '')
    .replace(/<input[^>]*>/g, '')
    .replace(/<select[\s\S]*?<\/select>/g, '')
    .replace(/ onclick="[^"]*"/g, '');
}
function pdfFromNode(node){
  if(!node) return '';
  const c = node.cloneNode(true);
  const srcCanvases = node.querySelectorAll('canvas'), dstCanvases = c.querySelectorAll('canvas');
  srcCanvases.forEach((cv,i)=>{ try{ const img = document.createElement('img'); img.src = cv.toDataURL('image/png'); img.className = 'pdf-chart'; dstCanvases[i].replaceWith(img); }catch(e){ dstCanvases[i].remove(); } });
  c.querySelectorAll('[style*="display:none"], [style*="display: none"]').forEach(x=>x.remove());
  return pdfClean(c.innerHTML);
}
function partsPdf(title, subtitle, bodyHtml){
  const bp = PARTS.business_profile || {};
  const doc = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${escHtml(title)}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap');
@page{size:A4;margin:14mm 12mm;}
*{box-sizing:border-box;}
body{font-family:'Vazirmatn',Tahoma,sans-serif;color:#222;font-size:11.5px;line-height:1.7;margin:0;}
.pdf-head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #e85d3a;padding-bottom:8px;margin-bottom:14px;}
.pdf-head h1{font-size:19px;margin:0 0 2px;} .pdf-head .sub{color:#666;font-size:11px;}
.pdf-biz{text-align:left;font-size:11px;color:#444;} .pdf-biz b{font-size:13px;display:block;}
table{width:100%;border-collapse:collapse;margin:8px 0 14px;page-break-inside:auto;} tr{page-break-inside:avoid;}
th,td{border:1px solid #ddd;padding:5px 7px;text-align:right;vertical-align:middle;} th{background:#f4efe4;font-weight:700;font-size:11px;}
tfoot td,.cashbrk-row.total{font-weight:800;background:#faf6ee;}
.parts-kpis,.rb-kpis,.inv-kpis,#kdKpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px;}
.parts-kpi-card{border:1px solid #ddd;border-radius:8px;padding:8px 10px;page-break-inside:avoid;}
.parts-kpi-icon{display:none;} .parts-kpi-label{font-size:10.5px;color:#555;font-weight:600;} .parts-kpi-val{font-size:15px;font-weight:800;margin-top:3px;}
.kpi-en{display:block;font-size:9px;font-weight:400;color:#999;text-align:left;direction:ltr;}
.tbl-thumb{width:28px;height:28px;border-radius:6px;object-fit:cover;border:1px solid #ddd;vertical-align:middle;} .tbl-thumb-icon{display:inline-flex;align-items:center;justify-content:center;}
.with-thumb{display:inline-flex;align-items:center;gap:6px;}
.pdf-chart{max-width:100%;height:auto;margin:6px 0;}
.cashbrk-row{display:flex;justify-content:space-between;border-bottom:1px solid #eee;padding:5px 2px;} .neg{color:#c0392b;} .pos{color:#2e7d57;}
.rb-result-title,.parts-table-title{font-weight:800;font-size:13px;margin:10px 0 4px;} .rb-note{color:#666;font-size:10.5px;margin-bottom:6px;}
.rb-warn{background:#fbeed8;border:1px solid #e9c98f;border-radius:6px;padding:5px 8px;margin:4px 0;font-size:10.5px;}
.inv-scroll{overflow:visible;} .parts-table-empty{color:#888;text-align:center;}
.pdf-foot{margin-top:16px;border-top:1px solid #ddd;padding-top:6px;color:#888;font-size:10px;display:flex;justify-content:space-between;}
</style></head><body>
<div class="pdf-head"><div><h1>${escHtml(title)}</h1><div class="sub">${escHtml(subtitle||'')}</div></div>
<div class="pdf-biz"><b>${escHtml(bp.name||'کسب‌وکار من')}</b>تاریخ گزارش: ${jLabel(isoToday())}<br>مبالغ به KT (کیلو تومان = هزار تومان)</div></div>
${bodyHtml}
<div class="pdf-foot"><span>تهیه‌شده از سامانه‌ی ELEVATE</span><span>${jLabel(isoToday())}</span></div>
</body></html>`;
  let fr = document.getElementById('pdfFrame');
  if(fr) fr.remove();
  fr = document.createElement('iframe'); fr.id = 'pdfFrame';
  fr.style.cssText = 'position:fixed;left:-9999px;top:0;width:900px;height:1200px;border:0;visibility:hidden;';
  document.body.appendChild(fr);
  const d = fr.contentWindow.document; d.open(); d.write(doc); d.close();
  const go = ()=>{ try{ fr.contentWindow.focus(); fr.contentWindow.print(); }catch(e){ showToast('چاپ/PDF در این مرورگر باز نشد','error'); } };
  const imgs = [...d.images].filter(i=>!i.complete);
  const ready = (d.fonts && d.fonts.ready) ? Promise.race([d.fonts.ready, new Promise(r=>setTimeout(r,2500))]) : Promise.resolve();
  Promise.all([ready].concat(imgs.map(i=>new Promise(r=>{ i.onload = i.onerror = r; })))).then(()=>setTimeout(go, 150));
  return fr;
}
const pdfNote = ()=>'برای ذخیره: در پنجره‌ی چاپ مقصد را «Save as PDF» بگذار.';
function pdfSection(title, node){ const h = pdfFromNode(node); return h ? `<div class="parts-table-title">${escHtml(title)}</div>${h}` : ''; }
function pdfReports(){
  const g = id=>document.getElementById(id);
  const tbl = (id)=>{ const t = g(id); return t ? `<table>${pdfClean(t.innerHTML)}</table>` : ''; };
  const body = `<div class="parts-kpis">${pdfFromNode(g('partsKpis'))}</div>
    <div class="parts-table-title">🏆 پرفروش‌ترین کالاها (بر اساس سود)</div>${tbl('partsTopProductsTable')}
    <div class="parts-table-title">⚠️ کالاهای کم‌موجودی</div>${tbl('partsLowStockTable')}
    <div class="parts-table-title">🏬 خرید به تفکیک تامین‌کننده</div>${tbl('partsStoreTable')}
    <div class="parts-table-title">🎯 مارجین و مارکاپ کالاها</div>${tbl('partsMarginTable')}`;
  partsPdf('گزارش مالی و آماری', 'بازه: '+xRangeLabel(), body); showToast(pdfNote());
}
function pdfReportBuilder(){
  const out = document.getElementById('rbOutput');
  if(!out || !out.innerText.trim()){ showToast('اول یک گزارش بساز','error'); return; }
  const clone = out.cloneNode(true);
  const srcC = out.querySelectorAll('canvas'), dstC = clone.querySelectorAll('canvas');
  srcC.forEach((cv,i)=>{ try{ const img = document.createElement('img'); img.src = cv.toDataURL('image/png'); img.className='pdf-chart'; dstC[i].replaceWith(img); }catch(e){} });
  const tb = clone.querySelector('#rbTable'); if(tb){ tb.style.display = ''; tb.removeAttribute('style'); }
  clone.querySelectorAll('.rb-cal-grid, #rbCalHost').forEach(()=>{});
  partsPdf('گزارش سفارشی', document.querySelector('#rbOutput .rb-result-title') ? document.querySelector('#rbOutput .rb-result-title').textContent : '', pdfClean(clone.innerHTML)); showToast(pdfNote());
}
function pdfInventory(){
  const g = id=>document.getElementById(id);
  const t = g('invTable');
  partsPdf('موجودی انبار', 'وضعیت لحظه‌ای کالاها', `<div class="parts-kpis">${pdfFromNode(g('invKpis'))}</div><table>${t ? pdfClean(t.innerHTML) : ''}</table>`); showToast(pdfNote());
}
function pdfKardex(){
  const g = id=>document.getElementById(id), sel = g('kdProduct'), p = sel && sel.value ? productById(sel.value) : null;
  partsPdf('کاردکس (گردش کالا)', p ? productLabel(p) : 'همه‌ی کالاها', `<div class="parts-kpis">${pdfFromNode(g('kdKpis'))}</div><table>${pdfClean(g('kdTable').innerHTML)}</table>`); showToast(pdfNote());
}
function pdfCash(){
  const g = id=>document.getElementById(id);
  partsPdf('صندوق و سرمایه', 'وضعیت لحظه‌ای', `<div class="parts-kpis">${pdfFromNode(g('cashStats'))}</div><div class="parts-table-title">تفکیک صندوق (چرا موجودی صندوق این عدد است؟)</div>${pdfFromNode(g('cashBreakdownRows'))}`); showToast(pdfNote());
}
function pdfLedger(){
  const t = document.getElementById('fullLedgerTable');
  partsPdf('گردش حساب', 'همه‌ی رویدادهای مالی با مانده‌ی پس از هر رویداد', `<table>${t ? pdfClean(t.innerHTML) : ''}</table>`); showToast(pdfNote());
}


// ══════════════════════════════════════════════════════
//  JALALI POPUP DATE PICKER — every input with [data-pjdp] opens it
//  value is written as yyyy/mm/dd (Jalali) and a bubbling 'change' event is dispatched
// ══════════════════════════════════════════════════════
const PJDP = {el:null, input:null, y:0, m:1};
function pjdpClose(){ if(PJDP.el){ PJDP.el.remove(); PJDP.el = null; } PJDP.input = null; }
function pjdpOpen(input){
  pjdpClose();
  PJDP.input = input;
  const cur = parseDateInput(input.value);
  const base = cur || isoToday(), j = isoToJ(base);
  PJDP.y = j.y; PJDP.m = j.m;
  const el = document.createElement('div');
  el.className = 'pjdp'; el.dir = 'rtl';
  el.addEventListener('mousedown', e=>e.stopPropagation());
  el.addEventListener('click', e=>e.stopPropagation());
  document.body.appendChild(el);
  PJDP.el = el;
  pjdpPaint(); pjdpPlace();
}
function pjdpPlace(){
  const el = PJDP.el, inp = PJDP.input; if(!el || !inp) return;
  const r = inp.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
  let left = r.right - w; if(left < 8) left = 8; if(left + w > innerWidth - 8) left = Math.max(8, innerWidth - w - 8);
  let top = r.bottom + 6; if(top + h > innerHeight - 8 && r.top - h - 6 > 8) top = r.top - h - 6;
  if(top + h > innerHeight - 8) top = Math.max(8, innerHeight - h - 8);
  el.style.left = left+'px'; el.style.top = top+'px';
}
function pjdpPaint(){
  const el = PJDP.el; if(!el) return;
  const sel = parseDateInput(PJDP.input.value) || '', today = isoToday();
  const first = jToIso(PJDP.y, PJDP.m, 1), off = isoWeekdaySat(first), len = jMonthLen(PJDP.y, PJDP.m);
  const tj = isoToJ(today);
  let yrs = ''; for(let y = Math.min(tj.y, PJDP.y) - 12; y <= Math.max(tj.y, PJDP.y) + 6; y++) yrs += `<option value="${y}"${y===PJDP.y?' selected':''}>${faDigits(y)}</option>`;
  let cells = '';
  for(let i=0;i<off;i++) cells += '<span class="pjdp-c off"></span>';
  for(let d=1; d<=len; d++){
    const iso = jToIso(PJDP.y, PJDP.m, d), wd = (off + d - 1) % 7;
    cells += `<button type="button" class="pjdp-c${iso===sel?' sel':''}${iso===today?' today':''}${wd===6?' fri':''}" onclick="pjdpPick('${iso}')">${faDigits(d)}</button>`;
  }
  el.innerHTML = `<div class="pjdp-h">
      <button type="button" class="pjdp-nav" onclick="pjdpNav(-1)" title="ماه قبل"><span dir="ltr">›</span></button>
      <select class="pjdp-sel" onchange="pjdpSet(this.value, null)">${FA_MONTHS.map((n,i)=>`<option value="${i+1}"${i+1===PJDP.m?' selected':''}>${n}</option>`).join('')}</select>
      <select class="pjdp-sel" onchange="pjdpSet(null, this.value)">${yrs}</select>
      <button type="button" class="pjdp-nav" onclick="pjdpNav(1)" title="ماه بعد"><span dir="ltr">‹</span></button></div>
    <div class="pjdp-w">${FA_WEEKDAYS.map(n=>`<span>${n.replace('‌','').slice(0,1)}</span>`).join('')}</div>
    <div class="pjdp-g">${cells}</div>
    <div class="pjdp-f"><button type="button" onclick="pjdpPick('${today}')">امروز</button><button type="button" onclick="pjdpPick('')">پاک کردن</button><button type="button" onclick="pjdpClose()">بستن</button></div>`;
}
function pjdpNav(d){ let m = PJDP.m + d, y = PJDP.y; if(m > 12){ m = 1; y++; } if(m < 1){ m = 12; y--; } PJDP.m = m; PJDP.y = y; pjdpPaint(); }
function pjdpSet(m, y){ if(m) PJDP.m = +m; if(y) PJDP.y = +y; pjdpPaint(); }
function pjdpPick(iso){
  const inp = PJDP.input; if(!inp){ pjdpClose(); return; }
  inp.value = iso ? jShort(iso) : '';
  pjdpClose();
  inp.dispatchEvent(new Event('change', {bubbles:true}));
}
document.addEventListener('mousedown', e=>{
  const t = e.target && e.target.closest ? e.target.closest('[data-pjdp]') : null;
  if(t){ e.preventDefault(); pjdpOpen(t); return; }
  if(PJDP.el && !PJDP.el.contains(e.target)) pjdpClose();
});
document.addEventListener('keydown', e=>{
  if(PJDP.el && e.key==='Escape'){ pjdpClose(); e.stopPropagation(); return; }
  const t = e.target && e.target.closest ? e.target.closest('[data-pjdp]') : null;
  if(t && (e.key==='Enter' || e.key===' ')){ e.preventDefault(); pjdpOpen(t); }
});
window.addEventListener('resize', ()=>{ if(PJDP.el) pjdpPlace(); });
// date input markup used by every generated field
function pjdpInput(id, iso, attrs){
  return `<input type="text" readonly data-pjdp class="modal-input pjdp-in" dir="ltr" ${id?`id="${id}"`:''} value="${iso ? escHtml(jShort(iso)) : ''}" ${attrs||''}/>`;
}

// ══════════════════════════════════════════════════════
//  PCALENDAR («تقویم») — Jalali, month / week / agenda, purchases · sales · returns · expenses … + my own events
// ══════════════════════════════════════════════════════
const PCAL_TYPES = {
  holiday:{l:'تعطیلی رسمی', c:'holiday', i:'🎌'}, custom:{l:'رویداد من', c:'plum', i:'📌'},
  sale:{l:'فروش', c:'sage', i:'💵'}, purchase:{l:'خرید', c:'sky', i:'🛒'}, receipt:{l:'دریافت کالا', c:'sky2', i:'📦'},
  return:{l:'مرجوعی', c:'coral', i:'↩️'}, expense:{l:'هزینه', c:'amber', i:'🧾'}, capital:{l:'سرمایه', c:'plum2', i:'🏦'},
  payout:{l:'تسویه نماینده', c:'rose', i:'🤝'}, quote:{l:'پیش‌فاکتور', c:'ink', i:'📄'},
};
const PCAL_GO = {sale:'sales', purchase:'purchase', receipt:'purchase', return:'returns', expense:'expenses', capital:'cash', payout:'ledger', quote:'quotes'};
const PCAL_COLORS = ['sage','sky','coral','amber','plum','rose','ink'];
const PCAL_ICONS = ['📌','🎯','🚚','🤝','📞','💰','🛠️','🎉','⚠️','📦','🏷️','🕌'];
const PCAL_HOLIDAYS = {'1-1':'نوروز (روز اول)','1-2':'نوروز (روز دوم)','1-3':'نوروز (روز سوم)','1-4':'نوروز (روز چهارم)','1-12':'روز جمهوری اسلامی','1-13':'سیزده‌به‌در','3-14':'رحلت امام خمینی','3-15':'قیام ۱۵ خرداد','11-22':'پیروزی انقلاب اسلامی','12-29':'ملی شدن صنعت نفت'};
const PCAL_SEASONS = [['بهار','🌸','spring'],['تابستان','☀️','summer'],['پاییز','🍂','autumn'],['زمستان','❄️','winter']];
let PCAL = {cur:null, view:'month', sel:null, hidden:{}};
try{ const u = JSON.parse(localStorage.getItem('elevate_cal_ui')||'null'); if(u){ if(['month','week','agenda'].includes(u.view)) PCAL.view = u.view; if(u.hidden && typeof u.hidden==='object') PCAL.hidden = u.hidden; } }catch(e){}
function pcalSaveUi(){ try{ localStorage.setItem('elevate_cal_ui', JSON.stringify({view:PCAL.view, hidden:PCAL.hidden})); }catch(e){} }
let PCAL_IDX = null;

function pcalPhoto(src, icon){ return thumbHtml(src, icon); }
function pcalBuild(){
  const idx = new Map(), N = v=>Number(v)||0;
  const put = (date, e)=>{ if(!date) return; e.date = date; if(!idx.has(date)) idx.set(date, []); idx.get(date).push(e); };
  const pth = pids=>[...new Set(pids.filter(Boolean))].slice(0,4).map(prodThumb);
  const p1 = its=>{ const ids = [...new Set((its||[]).map(i=>i.product_id).filter(Boolean))]; if(!ids.length) return ''; const p = productById(ids[0]); const n = p ? (p.name || productLabel(p)) : ''; return n + (ids.length>1 ? ' +'+faDigits(ids.length-1) : ''); };
  const pnames = its=>{ const ns = [...new Set((its||[]).map(it=>{ const p = productById(it.product_id); return p ? productLabel(p) : ''; }).filter(Boolean))]; return ns.slice(0,2).join('، ') + (ns.length>2 ? ' و '+fx(ns.length-2)+' کالای دیگر' : ''); };
  (PARTS.sales||[]).forEach(s=>{
    const its = s.items||[], pids = its.map(i=>i.product_id);
    const cust = (s.customer_id && customerById(s.customer_id) && customerById(s.customer_id).name) || s.customer_name || 'مشتری بدون نام';
    const profit = its.reduce((a,i)=>a+N(i.profit),0) + N(s.shipping_net_profit_effect);
    put(s.date, {type:'sale', id:s.id, short:'فروش '+(p1(its)||cust), title:'فروش به '+cust, sub:pnames(its), amt:N(s.invoice_total), extra:'سود: '+fmtT(profit), pids, ths:pth(pids)});
  });
  (PARTS.purchases||[]).forEach(p=>{
    const its = p.items||[], pids = its.map(i=>i.product_id), st = storeById(p.store_id);
    const amt = its.reduce((a,i)=>a+N(i.qty)*N(i.unit_price),0);
    put(p.order_date, {type:'purchase', id:p.id, short:'خرید از '+(st ? st.name : 'تامین‌کننده'), title:'خرید از '+(st ? st.name : 'تامین‌کننده'), sub:pnames(its), amt, pids, ths:[st ? storeThumb(p.store_id) : ''].filter(Boolean).concat(pth(pids).slice(0,2))});
    if(p.receipt_date && p.receipt_date !== p.order_date) put(p.receipt_date, {type:'receipt', id:p.id, short:'رسید '+(st ? st.name : 'کالا'), title:'رسیدن کالا از '+(st ? st.name : 'تامین‌کننده'), sub:pnames(its), amt:0, pids, ths:pth(pids)});
  });
  const saleById = {}; (PARTS.sales||[]).forEach(s=>saleById[s.id] = s);
  (PARTS.sale_returns||[]).forEach(r=>{
    const s = saleById[r.sale_id]; if(!s) return;
    const its = r.items||[], pids = its.map(i=>i.product_id);
    const date = (r.date && r.date > (s.date||'')) ? r.date : s.date;
    put(date, {type:'return', id:r.id, short:'مرجوعی '+(p1(its)||(r.reason||'')), title:'مرجوعی'+(r.reason ? ' — '+r.reason : ''), sub:pnames(its), amt:N(r.refund_total), pids, ths:pth(pids)});
  });
  (PARTS.business_expenses||[]).forEach(x=>{
    const tax = x.category===TAX_PAYMENT_CATEGORY;
    put(x.date, {type:'expense', id:x.id, short:(tax ? 'تسویه مالیات' : (x.category||'هزینه')), title:(tax ? 'تسویه مالیات' : 'هزینه — '+(x.category||'سایر')), sub:x.note||x.description||'', amt:N(x.amount), isTax:tax, ths:[]});
  });
  (PARTS.capital_transactions||[]).forEach(t=>{
    put(t.date, {type:'capital', id:t.id, title:({deposit:'واریز سرمایه', withdrawal:'برداشت سرمایه', adjustment:'تعدیل سرمایه'})[t.type]||'سرمایه', sub:t.note||'', amt:N(t.amount), ths:[]});
  });
  (PARTS.agent_payouts||[]).forEach(p=>{
    const a = agentById(p.agent_id);
    put(p.date, {type:'payout', id:p.id, short:'تسویه '+(a ? a.name : 'نماینده'), title:'تسویه با '+(a ? a.name : 'نماینده'), sub:p.note||'', amt:N(p.amount), ths:a ? [agentThumb(p.agent_id)] : []});
  });
  (PARTS.quotations||[]).forEach(q=>{
    const its = q.items||[], pids = its.map(i=>i.product_id);
    const nm = q.customer_name || ((q.customer_id && customerById(q.customer_id)) ? customerById(q.customer_id).name : '');
    put(q.date, {type:'quote', id:q.id, short:'پیش‌فاکتور '+(p1(its)||nm), title:'پیش‌فاکتور'+(nm ? ' برای '+nm : ''), sub:pnames(its), amt:N(q.invoice_total), pids, ths:pth(pids)});
    if(q.valid_until) put(q.valid_until, {type:'quote', id:q.id, title:'پایان اعتبار پیش‌فاکتور'+(nm ? ' '+nm : ''), sub:'', amt:0, pids, ths:pth(pids)});
  });
  (PARTS.calendar_events||[]).forEach(e=>{
    const last = e.end && e.end > e.date ? e.end : e.date;
    for(let d = e.date, n = 0; d <= last && n < 62; d = isoAdd(d, 1), n++)
      put(d, {type:'custom', id:e.id, title:e.title, sub:e.note||'', amt:0, color:e.color, ic:e.icon, done:!!e.done, span:(last!==e.date ? (n===0 ? 'شروع' : (d===last ? 'پایان' : 'ادامه')) : ''), ths:[]});
  });
  return idx;
}
function pcalEventsOn(iso){
  if(!PCAL_IDX) PCAL_IDX = pcalBuild();
  const out = (PCAL_IDX.get(iso)||[]).slice();
  const j = isoToJ(iso), h = PCAL_HOLIDAYS[j.m+'-'+j.d];
  if(h) out.unshift({type:'holiday', id:'h'+iso, date:iso, title:h, sub:'', amt:0, ths:[]});
  return out;
}
const pcalColor = e=>e.color || PCAL_TYPES[e.type].c;
const pcalIcon = e=>e.ic || PCAL_TYPES[e.type].i;
const pcalVisible = e=>!PCAL.hidden[e.type];

function pcalThumbs(e, n){
  const t = (e.ths||[]).slice(0, n||3);
  return t.length ? t.join('') : thumbHtml('', pcalIcon(e));
}
function pcalPillOf(list, type, iso){
  const L = PCAL_TYPES[type];
  if(list.length===1){
    const e = list[0];
    return `<button type="button" class="pcal-pill pcal-c-${pcalColor(e)}${e.done?' done':''}" onclick="event.stopPropagation();pcalOpenDay('${iso}')" title="${escHtml(e.title)}"><span class="pcal-pth">${pcalThumbs(e,1)}</span><span class="pcal-pt">${escHtml(e.short||e.title)}</span></button>`;
  }
  const sum = list.reduce((a,e)=>a+(e.isTax ? 0 : e.amt),0), ths = list.flatMap(e=>e.ths||[]).slice(0,3);
  return `<button type="button" class="pcal-pill grp pcal-c-${L.c}" onclick="event.stopPropagation();pcalOpenDay('${iso}')"><span class="pcal-pth stack">${ths.length ? ths.join('') : thumbHtml('', L.i)}</span><span class="pcal-pt"><b>${faDigits(list.length)}</b> ${L.l}${sum ? ' · <span class="pcal-amt">'+fmtT(sum)+'</span>' : ''}</span></button>`;
}
function pcalPills(evs, iso, max){
  const vis = evs.filter(pcalVisible), by = {};
  vis.forEach(e=>(by[e.type] = by[e.type]||[]).push(e));
  const pills = [];
  Object.keys(PCAL_TYPES).forEach(t=>{
    const list = by[t]; if(!list) return;
    if(t==='custom' || t==='holiday') list.forEach(e=>pills.push(pcalPillOf([e], t, iso)));
    else pills.push(pcalPillOf(list, t, iso));
  });
  const shown = pills.slice(0, max);
  return shown.join('') + (pills.length>max ? `<button type="button" class="pcal-more" onclick="event.stopPropagation();pcalOpenDay('${iso}')">+${faDigits(pills.length-max)} مورد دیگر</button>` : '');
}
function pcalCard(e){
  const L = PCAL_TYPES[e.type], c = pcalColor(e);
  let act = '';
  if(e.type==='custom') act = `<button type="button" onclick="pcalEvToggleDone('${e.id}')" title="${e.done?'برگرداندن':'انجام شد'}">${e.done?'↺':'✓'}</button><button type="button" onclick="pcalEvOpen('${e.id}')" title="ویرایش">✎</button><button type="button" onclick="pcalEvDelete('${e.id}')" title="حذف">🗑</button>`;
  else if(PCAL_GO[e.type]) act = `<button type="button" onclick="pcalGo('${e.type}')" title="باز کردن بخش ${L.l}">↗</button>`;
  return `<div class="pcal-card pcal-c-${c}${e.done?' done':''}">
    <div class="pcal-cths">${pcalThumbs(e,3)}</div>
    <div class="pcal-ctx"><div class="pcal-ctt">${escHtml(e.title)}${e.span ? ` <span class="pcal-span">${e.span}</span>` : ''}</div>
      <div class="pcal-cts"><span class="pcal-type">${L.i} ${L.l}</span>${e.sub ? ' · '+escHtml(e.sub) : ''}${e.extra ? ' · '+escHtml(e.extra) : ''}</div></div>
    <div class="pcal-ca">${e.amt ? fmtT(e.amt) : ''}</div>
    <div class="pcal-act">${act}</div></div>`;
}
function pcalGo(type){ const s = PCAL_GO[type]; if(s) pickSubnavItem(s); }

function pcalFocus(){ if(!PCAL.cur) PCAL.cur = isoToday(); return PCAL.cur; }
function pcalMonthKey(){ const j = isoToJ(pcalFocus()); return {y:j.y, m:j.m}; }
function pcalShift(n){
  const j = isoToJ(pcalFocus());
  if(PCAL.view==='week'){ PCAL.cur = isoAdd(PCAL.cur, 7*n); }
  else { let m = j.m+n, y = j.y; while(m>12){ m-=12; y++; } while(m<1){ m+=12; y--; } PCAL.cur = jToIso(y, m, 1); }
  renderPCalendar();
}
function pcalToday(){ PCAL.cur = isoToday(); PCAL.sel = PCAL.cur; renderPCalendar(); }
function pcalSetMonth(m, y){ const j = isoToJ(pcalFocus()); PCAL.cur = jToIso(+y||j.y, +m||j.m, 1); renderPCalendar(); }
function pcalSetView(v){ PCAL.view = v; if(v==='week' && PCAL.sel) PCAL.cur = PCAL.sel; pcalSaveUi(); renderPCalendar(); }
function pcalToggleType(t){ PCAL.hidden[t] = !PCAL.hidden[t]; if(!PCAL.hidden[t]) delete PCAL.hidden[t]; pcalSaveUi(); renderPCalendar(); }
function pcalOpenDay(iso){ PCAL.sel = iso; renderPCalendar(); const p = document.getElementById('pcalPanel'); if(p && innerWidth < 900) p.scrollIntoView({behavior:'smooth', block:'nearest'}); }

function pcalMonthEvents(y, m){
  const out = [], L = jMonthLen(y, m);
  for(let d=1; d<=L; d++){ const iso = jToIso(y,m,d); pcalEventsOn(iso).forEach(e=>out.push(e)); }
  return out;
}
function pcalKpis(evs){
  const by = t=>evs.filter(e=>e.type===t);
  const sum = l=>l.reduce((a,e)=>a+(e.isTax ? 0 : e.amt),0);
  const items = [
    ['sale','💵','فروش',by('sale')], ['purchase','🛒','خرید',by('purchase')], ['return','↩️','مرجوعی',by('return')], ['expense','🧾','هزینه',by('expense').filter(e=>!e.isTax)]
  ];
  return items.map(([t,i,l,list])=>`<div class="pcal-kpi pcal-c-${PCAL_TYPES[t].c}"><div class="pcal-kl">${i} ${l}</div><div class="pcal-kv">${faDigits(list.length)} <small>مورد</small></div><div class="pcal-ks">${fmtT(sum(list))}</div></div>`).join('')
    + `<div class="pcal-kpi pcal-c-plum"><div class="pcal-kl">📌 رویدادهای من</div><div class="pcal-kv">${faDigits(evs.filter(e=>e.type==='custom' && !e.span || e.type==='custom' && e.span==='شروع').length)} <small>مورد</small></div><div class="pcal-ks">${faDigits(evs.filter(e=>e.type==='holiday').length)} تعطیلی رسمی</div></div>`;
}
function pcalBanner(y, m, evs){
  const s = PCAL_SEASONS[Math.floor((m-1)/3)];
  const pids = []; evs.forEach(e=>{ (e.pids||[]).forEach(p=>{ if(p && !pids.includes(p) && productById(p) && productById(p).image) pids.push(p); }); });
  const ths = pids.slice(0,7).map(p=>`<span class="pcal-bph"><img src="${escHtml(productById(p).image)}" alt="" loading="lazy"></span>`).join('');
  return `<div class="pcal-banner ${s[2]}"><div class="pcal-bi">${s[1]}</div><div class="pcal-bt"><div class="pcal-bm">${FA_MONTHS[m-1]} ${faDigits(y)}</div><div class="pcal-bs">${s[0]} · ${(()=>{ const a = jToIso(y,m,1), b = jToIso(y,m,jMonthLen(y,m)); const g = x=>{ const p = x.split('-'); return ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+p[1]]+' '+p[0]; }; return g(a)===g(b) ? g(a) : g(a)+' – '+g(b); })()}</div></div><div class="pcal-bphs">${ths}</div></div>`;
}
function pcalMonthGrid(y, m){
  const first = jToIso(y,m,1), off = isoWeekdaySat(first), L = jMonthLen(y,m), today = isoToday();
  let cells = '';
  for(let i=0;i<off;i++) cells += '<div class="pcal-day off"></div>';
  for(let d=1; d<=L; d++){
    const iso = jToIso(y,m,d), wd = (off+d-1)%7, evs = pcalEventsOn(iso);
    cells += `<div class="pcal-day${wd===6?' fri':''}${iso===today?' today':''}${iso===PCAL.sel?' sel':''}${evs.some(e=>e.type==='holiday')?' hol':''}" onclick="pcalOpenDay('${iso}')">
      <div class="pcal-dh"><span class="pcal-dn">${faDigits(d)}</span><button type="button" class="pcal-add" onclick="event.stopPropagation();pcalEvOpen(null,'${iso}')" title="رویداد جدید در این روز">＋</button></div>
      <div class="pcal-dp">${pcalPills(evs, iso, 3)}</div></div>`;
  }
  const tail = (7 - (off+L)%7)%7; for(let i=0;i<tail;i++) cells += '<div class="pcal-day off"></div>';
  return `<div class="pcal-wk">${FA_WEEKDAYS.map((n,i)=>`<span class="${i===6?'fri':''}">${n}</span>`).join('')}</div><div class="pcal-grid">${cells}</div>`;
}
function pcalWeekGrid(){
  const f = pcalFocus(), start = isoAdd(f, -isoWeekdaySat(f)), today = isoToday();
  let cols = '';
  for(let i=0;i<7;i++){
    const iso = isoAdd(start, i), j = isoToJ(iso), evs = pcalEventsOn(iso).filter(pcalVisible);
    cols += `<div class="pcal-wcol${i===6?' fri':''}${iso===today?' today':''}${iso===PCAL.sel?' sel':''}"><div class="pcal-wh" onclick="pcalOpenDay('${iso}')"><span>${FA_WEEKDAYS[i]}</span><b>${faDigits(j.d)}</b><small>${FA_MONTHS[j.m-1]}</small><button type="button" class="pcal-add on" onclick="event.stopPropagation();pcalEvOpen(null,'${iso}')">＋</button></div>${evs.map(pcalCard).join('') || '<div class="pcal-none">—</div>'}</div>`;
  }
  return `<div class="pcal-wgrid">${cols}</div>`;
}
function pcalAgenda(y, m){
  const L = jMonthLen(y,m), today = isoToday(); let out = '';
  for(let d=1; d<=L; d++){
    const iso = jToIso(y,m,d), evs = pcalEventsOn(iso).filter(pcalVisible); if(!evs.length) continue;
    out += `<div class="pcal-ag${iso===today?' today':''}"><div class="pcal-agd"><b>${faDigits(d)}</b><span>${FA_WEEKDAYS[isoWeekdaySat(iso)]}</span></div><div class="pcal-agl">${evs.map(pcalCard).join('')}</div></div>`;
  }
  return out || '<div class="parts-table-empty">در این ماه رویدادی نیست.</div>';
}
function pcalPanel(){
  const iso = PCAL.sel; if(!iso) return `<div class="pcal-pe"><div style="font-size:30px;">🗓️</div>روی یک روز کلیک کن تا همه‌ی رویدادهایش را ببینی.</div>`;
  const j = isoToJ(iso), evs = pcalEventsOn(iso).filter(pcalVisible);
  const tot = t=>evs.filter(e=>e.type===t).reduce((a,e)=>a+e.amt,0);
  return `<div class="pcal-ph"><div><div class="pcal-pdn">${FA_WEEKDAYS[isoWeekdaySat(iso)]} ${faDigits(j.d)} ${FA_MONTHS[j.m-1]} ${faDigits(j.y)}</div><div class="pcal-pdg" dir="ltr">${iso}</div></div><button type="button" class="parts-add-btn sage" style="margin:0;padding:7px 14px;" onclick="pcalEvOpen(null,'${iso}')">＋ رویداد</button></div>
    ${evs.length ? `<div class="pcal-psum">${tot('sale') ? `<span class="pcal-c-sage">فروش ${fmtT(tot('sale'))}</span>` : ''}${tot('purchase') ? `<span class="pcal-c-sky">خرید ${fmtT(tot('purchase'))}</span>` : ''}${tot('return') ? `<span class="pcal-c-coral">مرجوعی ${fmtT(tot('return'))}</span>` : ''}</div>` : ''}
    <div class="pcal-plist">${evs.map(pcalCard).join('') || '<div class="pcal-none" style="padding:20px 0;">رویدادی در این روز نیست.</div>'}</div>`;
}
function renderPCalendar(){
  PCAL_IDX = null;
  const host = document.getElementById('pcalHost'); if(!host) return;
  const sec = document.getElementById('partsSub-calendar'); if(!sec || sec.style.display==='none') return;
  const {y, m} = pcalMonthKey(), ev = pcalMonthEvents(y, m);
  const counts = {}; ev.forEach(e=>{ counts[e.type] = (counts[e.type]||0)+1; });
  const yrs = []; const ty = isoToJ(isoToday()).y; for(let k=Math.min(ty,y)-3; k<=Math.max(ty,y)+3; k++) yrs.push(k);
  const week = PCAL.view==='week';
  let title = `${FA_MONTHS[m-1]} ${faDigits(y)}`;
  if(week){ const f = pcalFocus(), a = isoAdd(f, -isoWeekdaySat(f)), b = isoAdd(a, 6), ja = isoToJ(a), jb = isoToJ(b); title = `${faDigits(ja.d)} ${FA_MONTHS[ja.m-1]} تا ${faDigits(jb.d)} ${FA_MONTHS[jb.m-1]} ${faDigits(jb.y)}`; }
  const chips = Object.entries(PCAL_TYPES).filter(([t])=>t!=='holiday').map(([t,L])=>`<button type="button" class="pcal-chip pcal-c-${L.c}${PCAL.hidden[t]?' off':''}" onclick="pcalToggleType('${t}')">${L.i} ${L.l}${counts[t] ? ` <b>${faDigits(counts[t])}</b>` : ''}</button>`).join('');
  host.innerHTML = `${pcalBanner(y, m, ev)}
    <div class="pcal-kpis">${pcalKpis(ev)}</div>
    <div class="pcal-bar">
      <div class="pcal-nav"><button type="button" onclick="pcalShift(-1)" title="قبلی"><span dir="ltr">›</span></button><button type="button" class="pcal-tdy" onclick="pcalToday()">امروز</button><button type="button" onclick="pcalShift(1)" title="بعدی"><span dir="ltr">‹</span></button></div>
      <div class="pcal-title">${title}</div>
      <select class="modal-input pcal-sel" onchange="pcalSetMonth(this.value,null)">${FA_MONTHS.map((n,i)=>`<option value="${i+1}"${i+1===m?' selected':''}>${n}</option>`).join('')}</select>
      <select class="modal-input pcal-sel" onchange="pcalSetMonth(null,this.value)">${yrs.map(k=>`<option value="${k}"${k===y?' selected':''}>${faDigits(k)}</option>`).join('')}</select>
      <div class="rbx-seg pcal-views">${[['month','ماه'],['week','هفته'],['agenda','فهرست']].map(([v,l])=>`<button type="button" class="${PCAL.view===v?'on':''}" onclick="pcalSetView('${v}')">${l}</button>`).join('')}</div>
      <button type="button" class="parts-add-btn" style="margin:0;" onclick="pcalEvOpen(null,'${PCAL.sel||isoToday()}')">＋ رویداد جدید</button>
    </div>
    <div class="pcal-chips">${chips}</div>
    <div class="pcal-layout"><div class="pcal-main">${PCAL.view==='month' ? pcalMonthGrid(y,m) : (week ? pcalWeekGrid() : pcalAgenda(y,m))}</div><aside class="pcal-side" id="pcalPanel">${pcalPanel()}</aside></div>
    <div class="pcal-foot">تعطیلات ثابت شمسی نمایش داده می‌شود؛ مناسبت‌های قمری (عید فطر، محرم و…) هر سال تغییر می‌کند و خودکار نیست — با «＋ رویداد» دستی ثبت کن. فقط تاریخ ثبت می‌شود، نه ساعت.</div>`;
}
function pcalEnter(){ if(!PCAL.cur) PCAL.cur = isoToday(); if(!PCAL.sel) PCAL.sel = isoToday(); renderPCalendar(); }

// ── custom events ──
let PCAL_EDIT = null, PCAL_PICK = {color:'plum', icon:'📌'};
function pcalEvOpen(id, date){
  const e = id ? (PARTS.calendar_events||[]).find(x=>x.id===id) : null;
  PCAL_EDIT = e ? e.id : null;
  const g = i=>document.getElementById(i);
  g('pcalEvTitle').value = e ? e.title : '';
  g('pcalEvDate').value = jShort(e ? e.date : (date || isoToday()));
  g('pcalEvEnd').value = e && e.end ? jShort(e.end) : '';
  g('pcalEvNote').value = e ? (e.note||'') : '';
  g('pcalEvDone').checked = !!(e && e.done);
  PCAL_PICK = {color:e ? e.color : 'plum', icon:e ? e.icon : '📌'};
  pcalEvPaintPick();
  g('pcalEvDel').style.display = e ? '' : 'none';
  g('pcalEvHead').textContent = e ? '✎ ویرایش رویداد' : '📌 رویداد جدید';
  g('pcalEvOverlay').classList.add('open');
  setTimeout(()=>g('pcalEvTitle').focus(), 50);
}
function pcalEvClose(){ document.getElementById('pcalEvOverlay').classList.remove('open'); }
function pcalEvPaintPick(){
  document.getElementById('pcalEvColors').innerHTML = PCAL_COLORS.map(c=>`<button type="button" class="pcal-sw pcal-c-${c}${PCAL_PICK.color===c?' on':''}" onclick="PCAL_PICK.color='${c}';pcalEvPaintPick()" aria-label="${c}"></button>`).join('');
  document.getElementById('pcalEvIcons').innerHTML = PCAL_ICONS.map(i=>`<button type="button" class="pcal-ic${PCAL_PICK.icon===i?' on':''}" onclick="PCAL_PICK.icon='${i}';pcalEvPaintPick()">${i}</button>`).join('');
}
async function pcalEvSave(){
  const g = i=>document.getElementById(i);
  const title = g('pcalEvTitle').value.trim(), date = parseDateInput(g('pcalEvDate').value), end = parseDateInput(g('pcalEvEnd').value);
  if(!title){ showToast('برای رویداد یک عنوان بنویس','error'); return; }
  if(!date){ showToast('تاریخ رویداد را انتخاب کن','error'); return; }
  if(end && end < date){ showToast('پایان نباید قبل از شروع باشد','error'); return; }
  const ev = {id:PCAL_EDIT || 'ev_'+Date.now(), title, date, end:end||'', note:g('pcalEvNote').value.trim(), color:PCAL_PICK.color, icon:PCAL_PICK.icon, done:g('pcalEvDone').checked};
  const list = (PARTS.calendar_events||[]).filter(x=>x.id!==ev.id).concat([ev]);
  const d = await postParts('save_calendar_events', {events:list});
  if(d && d.ok!==false){ showToast('رویداد ذخیره شد'); pcalEvClose(); PCAL.sel = date; PCAL.cur = date; renderPCalendar(); }
}
async function pcalEvDelete(id){
  id = id || PCAL_EDIT; if(!id) return;
  if(!confirm('این رویداد حذف شود؟')) return;
  const d = await postParts('save_calendar_events', {events:(PARTS.calendar_events||[]).filter(x=>x.id!==id)});
  if(d && d.ok!==false){ showToast('حذف شد'); pcalEvClose(); renderPCalendar(); }
}
async function pcalEvToggleDone(id){
  const list = (PARTS.calendar_events||[]).map(x=>x.id===id ? Object.assign({}, x, {done:!x.done}) : x);
  await postParts('save_calendar_events', {events:list}); renderPCalendar();
}

// ══════════════════════════════════════════════════════
//  PRODUCT GROUP TREE («گروه‌بندی کالاها») — لوازم برقی › قطعات دینام › آفتامات دینام › (خودِ کالا)
//  Brand / car model are NOT part of the tree; they stay product attributes you can still filter by.
// ══════════════════════════════════════════════════════
const PTG_MAX_DEPTH = 8;
function ptgList(){ return PARTS.product_groups || []; }
function ptgById(id){ return ptgList().find(g=>g.id===id); }
function ptgSorted(list){ return list.slice().sort((a,b)=>a.name.localeCompare(b.name,'fa')); }
function ptgKids(pid){ return ptgSorted(ptgList().filter(g=>(g.parent||'')===(pid||''))); }
function ptgPath(id){ const out = []; let g = ptgById(id), n = 0; while(g && n++ < 12){ out.unshift(g.id); g = g.parent ? ptgById(g.parent) : null; } return out; }
function ptgLabel(id, sep){ return ptgPath(id).map(x=>ptgById(x).name).join(sep || ' › '); }
function ptgDepth(id){ return ptgPath(id).length; }
function ptgDesc(id){ const out = [id]; ptgKids(id).forEach(k=>out.push(...ptgDesc(k.id))); return out; }
function ptgProductsIn(id){ return PARTS.products.filter(p=>p.group_id===id); }
function ptgSubtreeProducts(id){ const s = new Set(ptgDesc(id)); return PARTS.products.filter(p=>p.group_id && s.has(p.group_id)); }
function ptgUngrouped(){ return PARTS.products.filter(p=>!p.group_id || !ptgById(p.group_id)); }
function ptgThumb(id){
  const p = ptgSubtreeProducts(id).find(x=>x.image);
  return p ? thumbHtml(p.image, '📁') : thumbHtml('', '📁');
}
function ptgProdName(p){ return p.name || productLabel(p); }
// depth-first order of the whole tree (used by the report's tree view and the pickers)
function ptgFlat(){
  const out = [];
  const walk = (pid, depth)=>ptgKids(pid).forEach(g=>{ out.push({id:g.id, depth, node:g}); walk(g.id, depth+1); });
  walk('', 1); return out;
}
// tree order index for report rows: group nodes, then their direct products, '__none' (ungrouped) last
function ptgRowOrder(){
  const idx = new Map(); let n = 0;
  const prods = id=>ptgSorted(ptgProductsIn(id).map(p=>({id:p.id, name:ptgProdName(p)}))).forEach(p=>idx.set('p:'+p.id, n++));
  const walk = pid=>ptgKids(pid).forEach(g=>{ idx.set(g.id, n++); walk(g.id); prods(g.id); });
  walk('');
  idx.set('__none', n++);
  ptgSorted(ptgUngrouped().map(p=>({id:p.id, name:ptgProdName(p)}))).forEach(p=>idx.set('p:'+p.id, n++));
  return idx;
}
function ptgRowMeta(key){
  if(key==='__none') return {depth:1, parent:'', isProd:false};
  if(String(key).startsWith('p:')){
    const p = productById(String(key).slice(2)), gid = p && p.group_id && ptgById(p.group_id) ? p.group_id : '';
    return {depth:(gid ? ptgDepth(gid) : 1)+1, parent:gid || '__none', isProd:true};
  }
  const g = ptgById(key); return {depth:g ? ptgDepth(key) : 1, parent:g ? (g.parent||'') : '', isProd:false};
}
function ptgAncestorKeys(key){
  const out = []; let m = ptgRowMeta(key), n = 0;
  while(m.parent && n++ < 12){ out.unshift(m.parent); m = ptgRowMeta(m.parent); }
  return out;
}

// ── management tab ──
let PTG = {sel:null, open:{}, q:''};
function renderProductGroups(){
  const host = document.getElementById('ptgHost'); if(!host) return;
  const sec = document.getElementById('partsSub-productgroups'); if(!sec || sec.style.display==='none') return;
  const flat = ptgFlat();
  const q = PTG.q.trim();
  const match = id=>!q || ptgLabel(id).includes(q) || ptgProductsIn(id).some(p=>ptgProdName(p).includes(q));
  const visible = flat.filter(r=>{
    if(q) return match(r.id) || ptgDesc(r.id).some(match);
    let par = r.node.parent; while(par){ if(PTG.open[par]===false) return false; par = (ptgById(par)||{}).parent; } return true;
  });
  const rows = visible.map(r=>{
    const g = r.node, kids = ptgKids(g.id).length, cnt = ptgSubtreeProducts(g.id).length, direct = ptgProductsIn(g.id).length;
    const open = PTG.open[g.id] !== false;
    return `<div class="ptg-row${PTG.sel===g.id?' sel':''}" style="padding-inline-start:${(r.depth-1)*22+6}px" onclick="ptgSelect('${g.id}')">
      ${kids ? `<button type="button" class="ptg-tg" onclick="event.stopPropagation();ptgToggle('${g.id}')">${open?'▾':'▸'}</button>` : '<span class="ptg-tg dot">•</span>'}
      <span class="ptg-th">${ptgThumb(g.id)}</span>
      <span class="ptg-nm">${escHtml(g.name)}</span>
      <span class="ptg-ct" title="کالاهای این گروه و زیرگروه‌ها">${faDigits(cnt)} کالا${kids ? ' · '+faDigits(kids)+' زیرگروه' : ''}${cnt!==direct && direct ? ' · '+faDigits(direct)+' مستقیم' : ''}</span>
      <span class="ptg-act"><button type="button" onclick="event.stopPropagation();ptgNodeOpen(null,'${g.id}')" title="زیرگروه جدید">➕</button><button type="button" onclick="event.stopPropagation();ptgNodeOpen('${g.id}')" title="ویرایش / انتقال">✎</button><button type="button" onclick="event.stopPropagation();ptgDelete('${g.id}')" title="حذف">🗑</button></span></div>`;
  }).join('');
  const un = ptgUngrouped().length;
  host.innerHTML = `<div class="ptg-top">
      <div><div class="ptg-title">🌳 گروه‌بندی کالاها <span class="rbx-en" dir="ltr">Product tree</span></div>
      <div class="ptg-lead">گروه‌ها را درختی بساز (هر عمقی)، و هر کالا را در دقیق‌ترین گروهش بگذار. برند و مدل خودرو جزو درخت نیستند؛ ویژگی خودِ کالا هستند و در گزارش‌ساز جدا فیلتر می‌شوند.</div></div>
      <div class="ptg-tools"><input type="text" class="modal-input" id="ptgSearch" placeholder="🔍 جستجوی گروه یا کالا…" dir="auto" value="${escHtml(PTG.q)}" oninput="PTG.q=this.value;ptgSearchRender()"/>
        <button class="parts-header-btn" type="button" onclick="ptgExpandAll(true)">باز کردن همه</button><button class="parts-header-btn" type="button" onclick="ptgExpandAll(false)">بستن همه</button>
        <button class="parts-add-btn sage" type="button" style="margin:0;" onclick="ptgNodeOpen(null,'')">➕ گروه اصلی</button></div></div>
    <div class="ptg-layout"><div class="ptg-tree" id="ptgTree">${rows || '<div class="parts-empty" style="margin:10px;"><div class="pe-icon">🌳</div><div class="pe-text">هنوز گروهی نساخته‌ای. با «➕ گروه اصلی» شروع کن؛ مثلاً «لوازم برقی خودرو» و بعد زیرگروه‌هایش را از همان‌جا اضافه کن (می‌توانی چند زیرگروه را یکجا و حتی تو‌در‌تو تایپ کنی).</div></div>'}
      <div class="ptg-row un${PTG.sel==='__none'?' sel':''}" onclick="ptgSelect('__none')"><span class="ptg-tg dot">•</span><span class="ptg-th">${thumbHtml('', '📦')}</span><span class="ptg-nm">بدون گروه</span><span class="ptg-ct">${faDigits(un)} کالا</span></div></div>
      <aside class="ptg-side" id="ptgSide">${ptgSideHtml()}</aside></div>`;
}
function ptgSearchRender(){ const pos = document.getElementById('ptgSearch').selectionStart; renderProductGroups(); const e = document.getElementById('ptgSearch'); if(e){ e.focus(); try{ e.setSelectionRange(pos,pos); }catch(x){} } }
function ptgSideHtml(){
  const id = PTG.sel;
  if(!id) return `<div class="pcal-pe"><div style="font-size:30px;">🌳</div>روی یک گروه کلیک کن تا کالاهایش را ببینی و مدیریت کنی.</div>`;
  const isNone = id==='__none', g = isNone ? null : ptgById(id);
  if(!isNone && !g) return '';
  const prods = isNone ? ptgUngrouped() : ptgProductsIn(id), sub = isNone ? [] : ptgSubtreeProducts(id);
  const crumbs = isNone ? 'بدون گروه' : ptgPath(id).map(x=>`<a onclick="ptgSelect('${x}')">${escHtml(ptgById(x).name)}</a>`).join(' › ');
  const list = prods.map(p=>`<div class="ptg-prod">${withThumb(prodThumb(p.id), escHtml(ptgProdName(p)))}<span class="rb-muted">${escHtml([p.brand, p.car_model && productCarModels(p).join('، ')].filter(Boolean).join(' · '))}</span>${isNone ? `<button type="button" onclick="ptgAssignOne('${p.id}')" title="انتساب به گروه">📂</button>` : `<button type="button" onclick="ptgAssignSet([['${p.id}','']])" title="خروج از این گروه">✕</button>`}</div>`).join('');
  return `<div class="ptg-sh"><div class="ptg-crumb">${crumbs}</div>
    ${isNone ? '' : `<div class="ptg-kp"><span><b>${faDigits(prods.length)}</b> کالای مستقیم</span><span><b>${faDigits(sub.length)}</b> کالا در کل زیرشاخه</span><span><b>${faDigits(ptgKids(id).length)}</b> زیرگروه</span></div>`}
    ${isNone ? '' : `<div class="ptg-btns"><button class="parts-header-btn" type="button" onclick="ptgNodeOpen(null,'${id}')">➕ زیرگروه</button><button class="parts-header-btn" type="button" onclick="ptgAssignOpen('${id}')">📦 افزودن کالا به این گروه</button><button class="parts-header-btn" type="button" onclick="ptgNodeOpen('${id}')">✎ ویرایش / انتقال</button></div>`}</div>
    <div class="ptg-plist">${list || '<div class="pcal-none" style="padding:18px 0;">'+(isNone ? 'همه‌ی کالاها گروه دارند 👌' : 'کالای مستقیمی در این گروه نیست.')+'</div>'}</div>`;
}
function ptgSelect(id){ PTG.sel = id; renderProductGroups(); }
function ptgToggle(id){ PTG.open[id] = PTG.open[id]===false ? true : false; renderProductGroups(); }
function ptgExpandAll(v){ ptgList().forEach(g=>PTG.open[g.id] = v); renderProductGroups(); }
function ptgEnter(){ renderProductGroups(); }
const ptgNewId = ()=>'pg_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
async function ptgSave(groups, assign){
  const d = await postParts('save_product_groups', {groups, assign:assign||{}});
  return d && d.ok!==false;
}

// node modal: create (one or many, nested with leading «-») / edit / move
let PTG_EDIT = null;
function ptgParentOptions(sel, excludeId){
  const bad = new Set(excludeId ? ptgDesc(excludeId) : []);
  return `<option value="">— گروه اصلی (ریشه) —</option>` + ptgFlat().filter(r=>!bad.has(r.id) && r.depth < PTG_MAX_DEPTH).map(r=>`<option value="${r.id}"${r.id===sel?' selected':''}>${'  '.repeat(r.depth-1)}${escHtml(ptgLabel(r.id))}</option>`).join('');
}
function ptgNodeOpen(id, parent){
  PTG_EDIT = id || null;
  const g = id ? ptgById(id) : null, g$ = x=>document.getElementById(x);
  g$('ptgNodeHead').textContent = g ? '✎ ویرایش / انتقال گروه' : '🌿 گروه جدید';
  g$('ptgNodeName').value = g ? g.name : '';
  g$('ptgNodeParent').innerHTML = ptgParentOptions(g ? g.parent : (parent||''), id);
  g$('ptgNodeMultiWrap').style.display = g ? 'none' : '';
  g$('ptgNodeMulti').value = '';
  g$('ptgNodeOverlay').classList.add('open');
  setTimeout(()=>g$('ptgNodeName').focus(), 50);
}
function ptgNodeClose(){ document.getElementById('ptgNodeOverlay').classList.remove('open'); }
async function ptgNodeSave(){
  const g$ = x=>document.getElementById(x);
  const name = g$('ptgNodeName').value.trim(), parent = g$('ptgNodeParent').value;
  const multi = g$('ptgNodeMulti').value.split('\n').map(x=>x.replace(/\s+$/,'')).filter(x=>x.trim());
  let list = ptgList().map(g=>Object.assign({}, g));
  if(PTG_EDIT){
    if(!name){ showToast('نام گروه را بنویس','error'); return; }
    const g = list.find(x=>x.id===PTG_EDIT); g.name = name; g.parent = parent;
    if(ptgDesc(PTG_EDIT).includes(parent)){ showToast('گروه را نمی‌توان زیر خودش یا زیرشاخه‌اش برد','error'); return; }
  } else {
    if(!name && !multi.length){ showToast('نام گروه را بنویس','error'); return; }
    let sel = null;
    const base = ptgDepth(parent || '') || 0;
    if(name){ sel = ptgNewId(); list.push({id:sel, name, parent, image:''}); }
    // nested lines: each leading «-» = one level deeper than the group above it (relative to the chosen parent / the new group)
    const top = name ? sel : parent, stack = [top];
    multi.forEach(line=>{
      const m = line.match(/^\s*(-*)\s*(.+)$/); const lvl = m[1].length; const nm = m[2].trim(); if(!nm) return;
      while(stack.length > lvl+1) stack.pop();
      while(stack.length < lvl+1) stack.push(stack[stack.length-1]);
      const id = ptgNewId(); list.push({id, name:nm, parent:stack[lvl]||'', image:''}); stack[lvl+1] = id; stack.length = lvl+2;
    });
    if(sel) PTG.sel = sel;
  }
  if(list.length > 800){ showToast('حداکثر ۸۰۰ گروه','error'); return; }
  if(await ptgSave(list)){ showToast('گروه‌ها ذخیره شد'); ptgNodeClose(); renderProductGroups(); }
}
async function ptgDelete(id){
  const g = ptgById(id); if(!g) return;
  const kids = ptgKids(id).length, prods = ptgProductsIn(id);
  if(!confirm(`گروه «${g.name}» حذف شود؟\n${kids ? faDigits(kids)+' زیرگروه به سطح بالاتر منتقل می‌شود و ' : ''}${faDigits(prods.length)} کالا به گروه بالاتر (یا «بدون گروه») می‌رود. کالاها حذف نمی‌شوند.`)) return;
  const list = ptgList().filter(x=>x.id!==id).map(x=>x.parent===id ? Object.assign({}, x, {parent:g.parent||''}) : Object.assign({}, x));
  const assign = {}; prods.forEach(p=>assign[p.id] = g.parent || '');
  if(await ptgSave(list, assign)){ showToast('حذف شد'); if(PTG.sel===id) PTG.sel = g.parent || null; renderProductGroups(); }
}
async function ptgAssignSet(pairs){
  const assign = {}; pairs.forEach(([p,g])=>assign[p] = g);
  if(await ptgSave(ptgList(), assign)){ renderProductGroups(); }
}
// assign products to a group (checklist modal)
let PTG_ASSIGN = {gid:'', sel:new Set()};
function ptgAssignOne(pid){ PTG_ASSIGN = {gid:'', sel:new Set([pid])}; ptgAssignOpen(PTG.sel && PTG.sel!=='__none' ? PTG.sel : '', true); }
function ptgAssignOpen(gid, keep){
  if(!keep) PTG_ASSIGN = {gid, sel:new Set()};
  PTG_ASSIGN.gid = gid;
  const g$ = x=>document.getElementById(x);
  g$('ptgAsTarget').innerHTML = `<option value="">— انتخاب گروه —</option>` + ptgFlat().map(r=>`<option value="${r.id}"${r.id===gid?' selected':''}>${'  '.repeat(r.depth-1)}${escHtml(ptgLabel(r.id))}</option>`).join('');
  g$('ptgAsSearch').value = '';
  ptgAssignRender();
  g$('ptgAssignOverlay').classList.add('open');
}
function ptgAssignClose(){ document.getElementById('ptgAssignOverlay').classList.remove('open'); }
function ptgAssignRender(){
  const q = document.getElementById('ptgAsSearch').value.trim();
  const list = PARTS.products.filter(p=>!q || (ptgProdName(p)+' '+(p.brand||'')+' '+(p.car_model||'')).includes(q));
  document.getElementById('ptgAsList').innerHTML = list.map(p=>`<label class="ptg-asrow"><input type="checkbox" ${PTG_ASSIGN.sel.has(p.id)?'checked':''} onchange="ptgAsToggle('${p.id}',this.checked)"/>${withThumb(prodThumb(p.id), escHtml(ptgProdName(p)))}<span class="rb-muted">${p.group_id && ptgById(p.group_id) ? escHtml(ptgLabel(p.group_id)) : 'بدون گروه'}</span></label>`).join('') || '<div class="pcal-none">کالایی پیدا نشد.</div>';
  document.getElementById('ptgAsCount').textContent = faDigits(PTG_ASSIGN.sel.size)+' کالا انتخاب شده';
}
function ptgAsToggle(id, on){ if(on) PTG_ASSIGN.sel.add(id); else PTG_ASSIGN.sel.delete(id); document.getElementById('ptgAsCount').textContent = faDigits(PTG_ASSIGN.sel.size)+' کالا انتخاب شده'; }
async function ptgAssignApply(){
  const gid = document.getElementById('ptgAsTarget').value;
  if(!gid){ showToast('گروه مقصد را انتخاب کن','error'); return; }
  if(!PTG_ASSIGN.sel.size){ showToast('حداقل یک کالا انتخاب کن','error'); return; }
  const pairs = [...PTG_ASSIGN.sel].map(p=>[p, gid]);
  await ptgAssignSet(pairs); showToast('کالاها به گروه منتقل شد'); ptgAssignClose();
}

// product modal: cascading pickers → #pfGroup holds the deepest chosen group
function pfGroupRender(gid){
  const hid = document.getElementById('pfGroup'), box = document.getElementById('pfGroupBox'); if(!hid || !box) return;
  gid = gid && ptgById(gid) ? gid : '';
  hid.value = gid;
  const path = ptgPath(gid); let html = '', parent = '';
  for(let lvl=0; lvl<=path.length; lvl++){
    const kids = ptgKids(parent);
    if(!kids.length) break;
    html += `<select class="builder-select" style="width:100%;margin:0 0 6px;" onchange="pfGroupPick(${lvl},this.value)"><option value="">${lvl===0 ? '— بدون گروه —' : '— همین سطح (بدون زیرگروه) —'}</option>${kids.map(k=>`<option value="${k.id}"${path[lvl]===k.id?' selected':''}>${escHtml(k.name)}</option>`).join('')}</select>`;
    parent = path[lvl] || ''; if(!parent) break;
  }
  box.innerHTML = html || '<div class="rb-muted">هنوز گروهی تعریف نشده — از «تعاریف پایه › گروه‌بندی کالاها» بساز.</div>';
  const lab = document.getElementById('pfGroupPath'); if(lab) lab.textContent = gid ? ptgLabel(gid) : '';
}
function pfGroupPick(lvl, id){
  const path = ptgPath(document.getElementById('pfGroup').value).slice(0, lvl);
  pfGroupRender(id || path[path.length-1] || '');
}

function ptgApplyCollapse(tb){ const closed = new Set([...tb.querySelectorAll('tr.pg-col')].map(t=>t.dataset.k)); tb.querySelectorAll('tr[data-anc]').forEach(r=>{ const anc = (r.dataset.anc||'').split(' ').filter(Boolean); r.style.display = anc.some(a=>closed.has(a)) ? 'none' : ''; }); }
function ptgRowToggle(btn){ const tr = btn.closest('tr'); const col = tr.classList.toggle('pg-col'); btn.textContent = col ? '▸' : '▾'; ptgApplyCollapse(tr.closest('table')); }
function ptgCollapseAll(v){ const tb = document.getElementById('rbTable'); if(!tb) return; tb.querySelectorAll('tr[data-k]').forEach(tr=>{ const b = tr.querySelector('button.pg-tg'); if(b){ tr.classList.toggle('pg-col', v); b.textContent = v ? '▸' : '▾'; } }); ptgApplyCollapse(tb); }


// ═══════════════════════════════════════════════════════════
// باندل کالا + جایزه خرید + تحلیل هم‌فروشی  (prefix: bnd / BND)
// ═══════════════════════════════════════════════════════════
const BND = {focus:'', minc:2, dismiss:new Set(), edit:null};
const bndList = ()=>PARTS.bundles||[];
const bndById = id=>bndList().find(b=>b.id===id);
const bndR2 = x=>Math.round((Number(x)||0)*100)/100;
const bndPrice = pid=>{ const p = productById(pid); return p && p.sale_price!=null ? (Number(p.sale_price)||0) : 0; };
const bndCostOf = pid=>Number((PARTS.avg_cost||{})[pid])||0;
const bndNum = n=>faDigits(String(Math.round((Number(n)||0)*100)/100));
const bndPN = pid=>{ const p = productById(pid); return p ? productLabel(p) : '(کالای حذف‌شده)'; };

// ── math of one bundle at current list prices ──
function bndEval(b){
  let reg=0, cost=0;
  const req = (b.items||[]).map(r=>{ const pr=bndPrice(r.product_id), line=pr*r.qty, c=bndCostOf(r.product_id)*r.qty; reg+=line; cost+=c; return {...r, price:pr, line, cost:c}; });
  const disc = reg*(b.discount_pct||0)/100, total = reg-disc;
  let rwPay=0, rwCost=0, rwFull=0;
  const rws = (b.rewards||[]).map(r=>{ const pr=bndPrice(r.product_id), full=pr*r.qty, d=full*(r.discount_pct||0)/100, pay=full-d, c=bndCostOf(r.product_id)*r.qty; rwPay+=pay; rwCost+=c; rwFull+=full; return {...r, price:pr, full, disc:d, pay, cost:c}; });
  const profit = total-cost, allRev = total+rwPay, allCost = cost+rwCost, allProfit = allRev-allCost;
  return {req, reg, disc, total, cost, profit, margin: total>0?profit/total*100:0,
    rws, rwPay, rwCost, rwFull, allRev, allCost, allProfit, allMargin: allRev>0?allProfit/allRev*100:0};
}

// ── usage of a bundle in recorded sales ──
function bndUsage(bid){
  const inst = new Set(); let rev=0, disc=0, units=0, rwLines=0;
  (PARTS.sales||[]).forEach(s=>(s.items||[]).forEach(it=>{
    if(it.bundle_id!==bid) return;
    inst.add(s.id+'#'+(it.bundle_inst||1)); rev += Number(it.revenue)||0; disc += Number(it.discount)||0; units += Number(it.qty)||0;
    if(it.bundle_role==='reward') rwLines++;
  }));
  return {count:inst.size, rev, disc, units, rwLines};
}

// ═════ SALE FORM ═════
function bndCartInst(){            // [{bid,inst}] in order of appearance
  const seen = new Set(), out = [];
  saleCartItems.forEach(it=>{ if(it.bundle_id && it.bundle_role!=='reward'){ const k=it.bundle_id+'#'+(it.bundle_inst||1); if(!seen.has(k)){ seen.add(k); out.push({bid:it.bundle_id, inst:it.bundle_inst||1}); } } });
  return out;
}
const bndHave = pid=>saleCartItems.filter(it=>!it.bundle_id && it.product_id===pid).reduce((s,it)=>s+(Number(it.qty)||0),0);
function bndAvailable(b){ let k=Infinity; (b.items||[]).forEach(r=>{ k = Math.min(k, Math.floor(bndHave(r.product_id)/r.qty+1e-9)); }); return k===Infinity?0:k; }
function bndMissing(b){ return (b.items||[]).map(r=>({product_id:r.product_id, need:Math.max(0, r.qty-bndHave(r.product_id)), have:bndHave(r.product_id)})); }
function bndApply(bid){
  const b = bndById(bid); if(!b || bndAvailable(b)<1) return;
  const inst = saleCartItems.filter(it=>it.bundle_id===bid).reduce((m,it)=>Math.max(m,it.bundle_inst||1),0)+1;
  const fresh = [];
  (b.items||[]).forEach(r=>{
    let need = r.qty;
    saleCartItems.filter(it=>!it.bundle_id && it.product_id===r.product_id).forEach(line=>{
      if(need<=1e-9) return;
      const take = Math.min(need, line.qty), frac = take/line.qty, man = bndR2((Number(line.discount)||0)*frac);
      fresh.push({product_id:r.product_id, qty:take, unit_price:line.unit_price, discount:bndR2(man + take*line.unit_price*(b.discount_pct||0)/100), _man:man, bundle_id:bid, bundle_role:'req', bundle_inst:inst});
      line.qty = bndR2(line.qty-take); line.discount = bndR2((Number(line.discount)||0)-man); need -= take;
    });
  });
  saleCartItems = saleCartItems.filter(it=>it.bundle_id || it.qty>1e-9).concat(fresh);
  renderSaleCart();
  showToast(`باندل «${b.name}» اعمال شد`,'success');
}
function bndAddWhole(bid){
  const b = bndById(bid); if(!b) return;
  let noPrice = false;
  (b.items||[]).forEach(r=>{ const pr = bndPrice(r.product_id); if(!pr) noPrice = true; saleCartItems.push({product_id:r.product_id, qty:r.qty, unit_price:pr, discount:0}); });
  if(noPrice) showToast('برای بعضی کالاهای باندل قیمت فروش تعریف نشده؛ قیمت را در سبد اصلاح کن','error');
  bndApply(bid);
}
function bndCompleteMissing(bid){
  const b = bndById(bid); if(!b) return;
  bndMissing(b).forEach(m=>{ if(m.need>0) saleCartItems.push({product_id:m.product_id, qty:m.need, unit_price:bndPrice(m.product_id), discount:0}); });
  renderSaleCart();
}
function bndUntag(bid, inst, dropRewards){
  saleCartItems.forEach(it=>{ if(it.bundle_id===bid && (it.bundle_inst||1)===inst && it.bundle_role!=='reward'){ it.discount = bndR2(it._man||0); delete it._man; delete it.bundle_id; delete it.bundle_role; delete it.bundle_inst; } });
  if(dropRewards !== false) saleCartItems = saleCartItems.filter(it=>!(it.bundle_id===bid && (it.bundle_inst||1)===inst && it.bundle_role==='reward'));
}
function bndRevert(bid, inst){ bndUntag(bid, inst); BND.dismiss.add(bid); renderSaleCart(); showToast('به قیمت عادی برگشت','success'); }
const bndRewardGiven = (bid,inst,pid)=>saleCartItems.filter(it=>it.bundle_id===bid && (it.bundle_inst||1)===inst && it.bundle_role==='reward' && it.product_id===pid).reduce((s,it)=>s+(Number(it.qty)||0),0);
function bndAddReward(bid, inst, idx){
  const b = bndById(bid), r = b && (b.rewards||[])[idx]; if(!r) return;
  const pr = bndPrice(r.product_id);
  saleCartItems.push({product_id:r.product_id, qty:r.qty, unit_price:pr, discount:bndR2(r.qty*pr*(r.discount_pct||0)/100), bundle_id:bid, bundle_role:'reward', bundle_inst:inst});
  renderSaleCart();
}
function bndRemoveLine(idx){
  const it = saleCartItems[idx]; if(!it) return;
  if(it.bundle_id && it.bundle_role!=='reward') bndUntag(it.bundle_id, it.bundle_inst||1);
  const j = saleCartItems.indexOf(it); if(j>=0) saleCartItems.splice(j,1);
}
function bndLineTag(it){
  if(!it.bundle_id) return '';
  const b = bndById(it.bundle_id), nm = b ? b.name : 'باندل حذف‌شده';
  return `<span class="bnd-tag ${it.bundle_role==='reward'?'rw':''}">${it.bundle_role==='reward'?'🎁 جایزه':'📦 باندل'} · ${escHtml(nm)}</span>`;
}
function bndSaleRender(){
  const host = document.getElementById('bndSalePanel'); if(!host) return;
  const act = bndList().filter(b=>b.active!==false);
  if(!act.length){ host.innerHTML=''; return; }
  const parts = [];
  // applied instances
  bndCartInst().forEach(({bid,inst})=>{
    const b = bndById(bid);
    const lines = saleCartItems.filter(it=>it.bundle_id===bid && (it.bundle_inst||1)===inst && it.bundle_role!=='reward');
    const saved = lines.reduce((s,it)=>s+(Number(it.discount)||0)-(Number(it._man)||0),0);
    const rw = b ? (b.rewards||[]).map((r,i)=>{
      const given = bndRewardGiven(bid,inst,r.product_id)>=r.qty-1e-9, pr = bndPrice(r.product_id);
      return `<div class="bnd-rw-row"><span>🎁 ${bndNum(r.qty)} × ${escHtml(bndPN(r.product_id))} <b>${r.discount_pct>=100?'رایگان':bndNum(r.discount_pct)+'٪ تخفیف'}</b> <span class="rb-muted">(قیمت عادی ${fmtT(pr*r.qty)})</span></span>
        ${given ? '<span class="bnd-ok">✓ اضافه شد</span>' : `<button type="button" class="bnd-mini" onclick="bndAddReward('${bid}',${inst},${i})">+ افزودن جایزه</button>`}</div>`;
    }).join('') : '';
    parts.push(`<div class="bnd-ap"><div class="bnd-ap-head"><span>📦 باندل «${escHtml(b?b.name:'حذف‌شده')}»${inst>1?' · نوبت '+faDigits(inst):''} اعمال شده${saved>0?` — مشتری <b>${fmtT(saved)}</b> تخفیف می‌گیرد`:''}</span>
      <button type="button" class="bnd-mini ghost" onclick="bndRevert('${bid}',${inst})">↩ بدون باندل (قیمت عادی)</button></div>${rw}</div>`);
  });
  // suggestions
  act.forEach(b=>{
    if(BND.dismiss.has(b.id)) return;
    const k = bndAvailable(b), ev = bndEval(b);
    if(k>=1){
      parts.push(`<div class="bnd-sg"><div>💡 این فاکتور شرایط باندل «<b>${escHtml(b.name)}</b>» را دارد${(b.discount_pct||0)>0?` — ${bndNum(b.discount_pct)}٪ تخفیف روی مجموعِ قیمتِ اقلام`:''}${(b.rewards||[]).length?' + جایزه‌ی خرید':''}.</div>
        <div class="bnd-sg-b"><button type="button" class="bnd-mini" onclick="bndApply('${b.id}')">اعمال باندل</button><button type="button" class="bnd-mini ghost" onclick="BND.dismiss.add('${b.id}');bndSaleRender()">نه، قیمت عادی</button></div></div>`);
    } else {
      const miss = bndMissing(b), some = miss.some(m=>m.have>0);
      if(some){
        parts.push(`<div class="bnd-sg soft"><div>📦 برای باندل «<b>${escHtml(b.name)}</b>» این‌ها کم است: ${miss.filter(m=>m.need>0).map(m=>`${bndNum(m.need)} × ${escHtml(bndPN(m.product_id))}`).join('، ')}. اگر مشتری نمی‌خواهد، همین سبد با قیمت عادی حساب می‌شود.</div>
          <div class="bnd-sg-b"><button type="button" class="bnd-mini" onclick="bndCompleteMissing('${b.id}')">+ تکمیل سبد</button><button type="button" class="bnd-mini ghost" onclick="BND.dismiss.add('${b.id}');bndSaleRender()">نادیده بگیر</button></div></div>`);
      }
    }
  });
  const opts = act.map(b=>`<option value="${b.id}">${escHtml(b.name)} — ${fmtT(bndEval(b).total)}</option>`).join('');
  host.innerHTML = `<div class="bnd-panel"><div class="bnd-panel-h">🎁 باندل و جایزه خرید</div>
    <div class="bnd-pick"><select class="builder-select" id="bndPickSel">${opts}</select><button type="button" class="bnd-mini" onclick="bndAddWhole(document.getElementById('bndPickSel').value)">+ افزودن باندل کامل</button></div>${parts.join('')}</div>`;
}

// ═════ MANAGEMENT TAB ═════
function bndEnter(){ bndRenderAll(); }
function bndRenderAll(){ try{ renderBundles(); }catch(e){ console.warn('bnd',e); } try{ bndRenderReportBlock(); }catch(e){ console.warn('bnd',e); } }
async function bndSaveAll(list){ const d = await postParts('save_bundles', {bundles:list}); return d && d.ok!==false; }
const bndNewId = ()=>'bn_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);

function bndItemsHtml(rows, rw){
  return rows.map(r=>`<span class="bnd-it">${prodCell(r.product_id)}<b>× ${bndNum(r.qty)}</b>${rw?`<em>${r.discount_pct>=100?'رایگان':bndNum(r.discount_pct)+'٪'}</em>`:''}</span>`).join('');
}
function renderBundles(){
  const host = document.getElementById('bndHost'); if(!host) return;
  const sec = document.getElementById('partsSub-bundles'); if(!sec || sec.style.display==='none') return;
  const list = bndList();
  const usage = {}; list.forEach(b=>usage[b.id]=bndUsage(b.id));
  const totUse = list.reduce((s,b)=>s+usage[b.id].count,0), totDisc = list.reduce((s,b)=>s+usage[b.id].disc,0), totRev = list.reduce((s,b)=>s+usage[b.id].rev,0);
  const cards = list.map(b=>{
    const e = bndEval(b), u = usage[b.id], noPrice = b.items.some(r=>!bndPrice(r.product_id));
    const bad = e.margin<0 || (e.rws.length && e.allMargin<0);
    return `<div class="bnd-card${b.active===false?' off':''}">
      <div class="bnd-card-h"><div class="bnd-nm">📦 ${escHtml(b.name)} ${b.active===false?'<span class="bnd-badge off">غیرفعال</span>':'<span class="bnd-badge">فعال</span>'}</div>
        <div class="bnd-act"><button type="button" onclick="bndEdit('${b.id}')">✎</button><button type="button" onclick="bndToggle('${b.id}')" title="فعال/غیرفعال">${b.active===false?'▶':'⏸'}</button><button type="button" onclick="bndDelete('${b.id}')">🗑</button></div></div>
      <div class="bnd-sec">باید بخرد:</div><div class="bnd-its">${bndItemsHtml(b.items)}</div>
      ${b.rewards.length?`<div class="bnd-sec">جایزه‌ی خرید (اختیاری):</div><div class="bnd-its">${bndItemsHtml(b.rewards,true)}</div>`:''}
      ${b.note?`<div class="rb-muted" style="margin-top:4px;">📝 ${escHtml(b.note)}</div>`:''}
      <div class="bnd-nums">
        <div><span>جمع قیمت عادی</span><b>${fmtT(e.reg)}</b></div>
        <div><span>تخفیف ${bndNum(b.discount_pct)}٪</span><b>− ${fmtT(e.disc)}</b></div>
        <div class="hl"><span>قیمت باندل</span><b>${fmtT(e.total)}</b></div>
        <div class="${e.profit>=0?'pos':'neg'}"><span>سود باندل (بر پایه‌ی میانگین قیمت خرید)</span><b>${fmtT(e.profit)} · ${e.margin.toFixed(1)}٪</b></div>
        ${e.rws.length?`<div class="${e.allProfit>=0?'pos':'neg'}"><span>سود اگر جایزه‌ها را هم بگیرد</span><b>${fmtT(e.allProfit)} · ${e.allMargin.toFixed(1)}٪</b></div>`:''}
      </div>
      ${noPrice?'<div class="bnd-warn">⚠ برای بعضی کالاها «قیمت فروش» تعریف نشده؛ اعداد ناقص است.</div>':''}
      ${bad?'<div class="bnd-warn">⚠ با این تخفیف/جایزه، فروشِ باندل زیانده است.</div>':''}
      <div class="bnd-use">${u.count?`فروخته‌شده: <b>${faDigits(u.count)}</b> بار · درآمد ردیف‌های باندل ${fmtT(u.rev)} · تخفیف ثبت‌شده ${fmtT(u.disc)}`:'هنوز در فاکتوری استفاده نشده.'}</div>
    </div>`;
  }).join('');
  host.innerHTML = `<div class="ptg-top"><div><div class="ptg-title">🎁 باندل و جایزه خرید <span class="rbx-en" dir="ltr">Bundles &amp; Rewards</span></div>
      <div class="ptg-lead">یک بسته از چند کالا (با تعداد) و یک درصد تخفیف روی جمعشان تعریف کن. می‌توانی «جایزه‌ی خرید» هم بگذاری: کالاهای اضافه با تخفیف دلخواه (۱۰۰٪ = اشانتیون رایگان). مشتری مجبور به باندل نیست؛ در فاکتور فروش، اگر باندل را نخواهد همان سبد با قیمت عادی حساب می‌شود.</div></div>
      <div class="ptg-tools"><button class="parts-header-btn" type="button" onclick="bndEdit()">➕ باندل جدید</button></div></div>
    <div class="parts-kpis" style="margin-bottom:12px;">${[['🎁','باندل‌های تعریف‌شده', faDigits(list.length)+' ('+faDigits(list.filter(b=>b.active!==false).length)+' فعال)','var(--sky)'],['🧾','دفعات فروش با باندل', faDigits(totUse),'var(--sage)'],['💰','درآمد ردیف‌های باندل', fmtT(totRev),'var(--plum)'],['🏷️','تخفیف ثبت‌شده روی ردیف‌های باندل', fmtT(totDisc),'var(--coral)']].map(x=>kpiCardHtml(x[0],x[1],x[2],x[3])).join('')}</div>
    ${list.length?`<div class="bnd-grid">${cards}</div>`:'<div class="parts-empty"><div class="pe-icon">🎁</div><div class="pe-text">هنوز باندلی نساخته‌ای — با «➕ باندل جدید» شروع کن، یا از بخش «کدام کالاها را باندل کنم؟» پایین، از روی فروش‌های واقعی پیشنهاد بگیر.</div></div>'}
    <div class="bnd-h2">🔗 کدام کالاها را باندل کنم؟ <span class="rbx-en" dir="ltr">Co-purchase analysis</span></div>
    ${bndAnalysisHtml('t', null)}`;
}
function bndToggle(id){ bndSaveAll(bndList().map(b=>b.id===id?{...b,active:b.active===false}:b)); }
function bndDelete(id){ const b = bndById(id); if(!b || !confirm(`باندل «${b.name}» حذف شود؟ فاکتورهای قبلی دست‌نخورده می‌مانند.`)) return; bndSaveAll(bndList().filter(x=>x.id!==id)); }

// ── editor modal ──
function bndEdit(id, seedPids){
  const b = id ? bndById(id) : null;
  BND.edit = b ? JSON.parse(JSON.stringify(b)) : {id:'', name:'', active:true, items:(seedPids||[]).map(pid=>({product_id:pid, qty:1})), discount_pct:0, rewards:[], note:''};
  if(!BND.edit.items.length) BND.edit.items.push({product_id:'', qty:1});
  document.getElementById('bndEdHead').textContent = b ? '✎ ویرایش باندل' : '🎁 باندل جدید';
  document.getElementById('bndEdName').value = BND.edit.name;
  document.getElementById('bndEdNote').value = BND.edit.note||'';
  document.getElementById('bndEdPct').value = BND.edit.discount_pct||'';
  document.getElementById('bndEdActive').checked = BND.edit.active!==false;
  bndEdRows();
  document.getElementById('bndEdOverlay').classList.add('open');
}
function bndEdClose(){ document.getElementById('bndEdOverlay').classList.remove('open'); BND.edit = null; }
function bndEdSel(kind, i, pid){
  return `<select class="builder-select" onchange="BND.edit.${kind}[${i}].product_id=this.value;bndEdPreview()"><option value="">— کالا —</option>${PARTS.products.map(p=>`<option value="${p.id}"${p.id===pid?' selected':''}>${escHtml(productLabel(p))}</option>`).join('')}</select>`;
}
function bndEdRows(){
  const E = BND.edit;
  document.getElementById('bndEdItems').innerHTML = E.items.map((r,i)=>`<div class="bnd-ed-row">${bndEdSel('items',i,r.product_id)}
    <input type="number" class="modal-input" min="0" step="1" value="${r.qty}" title="تعداد" oninput="BND.edit.items[${i}].qty=parseFloat(this.value)||0;bndEdPreview()"/>
    <button type="button" class="bnd-x" onclick="BND.edit.items.splice(${i},1);bndEdRows()">✕</button></div>`).join('');
  document.getElementById('bndEdRewards').innerHTML = E.rewards.map((r,i)=>`<div class="bnd-ed-row rw">${bndEdSel('rewards',i,r.product_id)}
    <input type="number" class="modal-input" min="0" step="1" value="${r.qty}" title="تعداد" oninput="BND.edit.rewards[${i}].qty=parseFloat(this.value)||0;bndEdPreview()"/>
    <input type="number" class="modal-input" min="0" max="100" value="${r.discount_pct}" title="درصد تخفیف" oninput="BND.edit.rewards[${i}].discount_pct=Math.min(100,Math.max(0,parseFloat(this.value)||0));bndEdPreview()"/><span class="bnd-pc">٪</span>
    <button type="button" class="bnd-x" onclick="BND.edit.rewards.splice(${i},1);bndEdRows()">✕</button></div>`).join('') || '<div class="rb-muted">بدون جایزه. (اختیاری)</div>';
  bndEdPreview();
}
function bndEdCollect(){
  const E = BND.edit;
  E.name = document.getElementById('bndEdName').value.trim();
  E.note = document.getElementById('bndEdNote').value.trim();
  E.discount_pct = Math.min(100, Math.max(0, parseFloat(document.getElementById('bndEdPct').value)||0));
  E.active = document.getElementById('bndEdActive').checked;
  return E;
}
function bndEdPreview(){
  const E = bndEdCollect(), box = document.getElementById('bndEdPrev');
  const clean = {...E, items:E.items.filter(r=>r.product_id&&r.qty>0), rewards:E.rewards.filter(r=>r.product_id&&r.qty>0)};
  const e = bndEval(clean);
  box.innerHTML = `<div class="bnd-nums"><div><span>جمع قیمت عادی</span><b>${fmtT(e.reg)}</b></div><div><span>تخفیف ${bndNum(E.discount_pct)}٪</span><b>− ${fmtT(e.disc)}</b></div><div class="hl"><span>قیمت باندل</span><b>${fmtT(e.total)}</b></div>
    <div class="${e.profit>=0?'pos':'neg'}"><span>سود (میانگین قیمت خرید)</span><b>${fmtT(e.profit)} · ${e.margin.toFixed(1)}٪</b></div>
    ${clean.rewards.length?`<div class="${e.allProfit>=0?'pos':'neg'}"><span>سود با جایزه‌ها</span><b>${fmtT(e.allProfit)} · ${e.allMargin.toFixed(1)}٪</b></div>`:''}</div>`;
}
async function bndEdSave(){
  const E = bndEdCollect();
  const items = E.items.filter(r=>r.product_id && r.qty>0), rewards = E.rewards.filter(r=>r.product_id && r.qty>0);
  if(!E.name){ showToast('برای باندل یک نام بنویس','error'); return; }
  if(!items.length){ showToast('حداقل یک کالای لازم برای باندل انتخاب کن','error'); return; }
  const merge = arr=>{ const m = {}; arr.forEach(r=>{ if(m[r.product_id]) m[r.product_id].qty += r.qty; else m[r.product_id] = {...r}; }); return Object.values(m); };
  const obj = {...E, id:E.id||bndNewId(), items:merge(items), rewards:merge(rewards)};
  const list = bndList().some(b=>b.id===obj.id) ? bndList().map(b=>b.id===obj.id?obj:b) : bndList().concat([obj]);
  if(await bndSaveAll(list)){ bndEdClose(); showToast('باندل ذخیره شد','success'); }
}

// ═════ CO-PURCHASE ANALYSIS ═════
function bndBaskets(rangeFn){
  return (PARTS.sales||[]).filter(s=>!rangeFn || rangeFn(s.date)).map(s=>{
    const m = {}; (s.items||[]).forEach(it=>{ if(it.product_id && Number(it.qty)>0) m[it.product_id] = (m[it.product_id]||0)+Number(it.qty); });
    return {sid:s.id, items:m};
  }).filter(b=>Object.keys(b.items).length);
}
function bndCo(baskets){
  const cnt = {}, pair = {}, trip = {};
  baskets.forEach(b=>{
    const ids = Object.keys(b.items).sort();
    ids.forEach(a=>cnt[a]=(cnt[a]||0)+1);
    const L = Math.min(ids.length, 40);
    for(let i=0;i<L;i++) for(let j=i+1;j<L;j++){ const k = ids[i]+'|'+ids[j]; pair[k]=(pair[k]||0)+1; }
    if(ids.length<=12) for(let i=0;i<ids.length;i++) for(let j=i+1;j<ids.length;j++) for(let l=j+1;l<ids.length;l++){ const k = ids[i]+'|'+ids[j]+'|'+ids[l]; trip[k]=(trip[k]||0)+1; }
  });
  return {N:baskets.length, cnt, pair, trip, baskets};
}
function bndCompanions(co, pid){
  const out = [];
  Object.keys(co.pair).forEach(k=>{
    const [a,b] = k.split('|'); if(a!==pid && b!==pid) return;
    const o = a===pid?b:a, c = co.pair[k];
    let q = 0; co.baskets.forEach(bk=>{ if(bk.items[pid] && bk.items[o]) q += bk.items[o]; });
    out.push({pid:o, c, conf:c/co.cnt[pid]*100, rconf:c/co.cnt[o]*100, lift:c*co.N/(co.cnt[pid]*co.cnt[o]), avgq:q/c});
  });
  return out.sort((x,y)=>y.c-x.c || y.lift-x.lift);
}
function bndDefined(pids){ const k = [...pids].sort().join('|'); return bndList().find(b=>[...new Set(b.items.map(r=>r.product_id))].sort().join('|')===k); }
const bndLiftTxt = l=>l>=1.5?`<b class="pos">${l.toFixed(1)}× (قوی)</b>`:(l>=1?`${l.toFixed(1)}× (کمی بیشتر از شانس)`:`<span class="neg">${l.toFixed(1)}× (ضعیف)</span>`);
function bndSetFocus(v){ BND.focus = v||''; bndRenderAll(); }
function bndSetMin(v){ BND.minc = Math.max(1, parseInt(v)||1); bndRenderAll(); }
function bndGoProduct(pid){ BND.focus = pid; pickSubnavItem('bundles'); bndRenderAll(); }
function bndSeed(str){ bndEdit(null, str.split('|')); }
function bndAnalysisHtml(scope, rangeFn){
  const bs = bndBaskets(rangeFn), co = bndCo(bs), N = co.N;
  const known = Object.keys(co.cnt).filter(pid=>productById(pid));
  const sel = `<select class="builder-select" style="min-width:250px;max-width:340px;" onchange="bndSetFocus(this.value)"><option value="">🔎 انتخاب کالا برای دیدن همراه‌ها…</option>${known.sort((a,b)=>co.cnt[b]-co.cnt[a]).map(pid=>`<option value="${pid}"${pid===BND.focus?' selected':''}>${escHtml(bndPN(pid))} (${faDigits(co.cnt[pid])} فاکتور)</option>`).join('')}</select>`;
  const minSel = `<span class="rb-muted">حداقل دفعات با‌هم‌فروشی</span> <input type="number" class="modal-input" style="width:70px;margin:0;" min="1" value="${BND.minc}" onchange="bndSetMin(this.value)"/>`;
  let focusHtml = '';
  if(BND.focus && co.cnt[BND.focus]){
    const comps = bndCompanions(co, BND.focus);
    const trips = Object.keys(co.trip).filter(k=>k.split('|').includes(BND.focus) && co.trip[k]>=Math.max(2,BND.minc)).sort((a,b)=>co.trip[b]-co.trip[a]).slice(0,8);
    const mine = bndList().filter(b=>b.items.some(r=>r.product_id===BND.focus)||b.rewards.some(r=>r.product_id===BND.focus));
    focusHtml = `<div class="bnd-focus"><div class="bnd-focus-h">${prodCell(BND.focus)} <span class="rb-muted">— در ${faDigits(co.cnt[BND.focus])} فاکتور از ${faDigits(N)} فاکتور آمده (${(co.cnt[BND.focus]/N*100).toFixed(0)}٪)</span></div>
      ${comps.length?`<div class="rb-tablewrap"><table class="rb-table bnd-tbl"><thead><tr><th>کالای همراه</th><th>با هم</th><th title="از فاکتورهای این کالا، چند درصد این همراه را هم داشته‌اند">احتمال همراهی</th><th title="از فاکتورهای همراه، چند درصد این کالا را هم داشته‌اند">برعکس</th><th>لیفت</th><th>میانگین تعداد همراه</th><th></th></tr></thead><tbody>${comps.map(c=>`<tr><td>${prodCell(c.pid)}</td><td><b>${faDigits(c.c)}</b> بار</td><td>${c.conf.toFixed(0)}٪</td><td>${c.rconf.toFixed(0)}٪</td><td>${bndLiftTxt(c.lift)}</td><td>${bndNum(c.avgq)}</td><td>${(()=>{ const d = bndDefined([BND.focus,c.pid]); return d?`<span class="bnd-badge">باندل: ${escHtml(d.name)}</span>`:`<button type="button" class="bnd-mini" onclick="bndSeed('${[BND.focus,c.pid].sort().join('|')}')">🎁 ساخت باندل</button>`; })()}</td></tr>`).join('')}</tbody></table></div>`:'<div class="rb-muted">این کالا هنوز هیچ‌وقت همراه کالای دیگری فروخته نشده.</div>'}
      ${trips.length?`<div class="bnd-sec" style="margin-top:8px;">ترکیب‌های ۳تایی شامل این کالا:</div>${trips.map(k=>`<div class="bnd-trow"><span class="bnd-its">${k.split('|').map(pid=>`<span class="bnd-it">${prodCell(pid)}</span>`).join('')}</span><b>${faDigits(co.trip[k])} بار</b><button type="button" class="bnd-mini" onclick="bndSeed('${k}')">🎁 ساخت باندل</button></div>`).join('')}`:''}
      <div class="bnd-sec" style="margin-top:8px;">باندل‌های تعریف‌شده‌ی این کالا:</div>${mine.length?mine.map(b=>`<span class="bnd-badge">${escHtml(b.name)}</span>`).join(' '):'<span class="rb-muted">هنوز در هیچ باندلی نیست.</span>'}</div>`;
  }
  const pairs = Object.keys(co.pair).filter(k=>co.pair[k]>=BND.minc).sort((a,b)=>co.pair[b]-co.pair[a]).slice(0,15);
  const trips3 = Object.keys(co.trip).filter(k=>co.trip[k]>=Math.max(2,BND.minc)).sort((a,b)=>co.trip[b]-co.trip[a]).slice(0,10);
  const rowOf = k=>{
    const ids = k.split('|'), c = ids.length===2?co.pair[k]:co.trip[k];
    const lift = ids.length===2 ? c*N/(co.cnt[ids[0]]*co.cnt[ids[1]]) : null;
    const d = bndDefined(ids);
    return `<tr><td><span class="bnd-its">${ids.map(pid=>`<span class="bnd-it">${prodCell(pid)}</span>`).join('')}</span></td><td><b>${faDigits(c)}</b></td><td>${(c/N*100).toFixed(1)}٪</td><td>${lift==null?'—':bndLiftTxt(lift)}</td><td>${d?`<span class="bnd-badge">باندل: ${escHtml(d.name)}</span>`:`<button type="button" class="bnd-mini" onclick="bndSeed('${k}')">🎁 ساخت باندل</button>`}</td></tr>`;
  };
  const gl = (title, keys)=>keys.length?`<div class="bnd-sec" style="margin-top:10px;">${title}</div><div class="rb-tablewrap"><table class="rb-table bnd-tbl"><thead><tr><th>ترکیب</th><th>تعداد فاکتورِ مشترک</th><th title="سهم از کل فاکتورها">پشتیبانی</th><th title="نسبت به اتفاقی بودن">لیفت</th><th></th></tr></thead><tbody>${keys.map(rowOf).join('')}</tbody></table></div>`:'';
  return `<div class="bnd-an" data-scope="${scope}">
    <div class="bnd-an-tools">${sel}${minSel}</div>
    <div class="rb-muted" style="margin:4px 0 8px;">بر پایه‌ی ${faDigits(N)} فاکتورِ ثبت‌شده${rangeFn?' در بازه‌ی انتخاب‌شده':''} (کالاهای یک فاکتور «با هم» حساب می‌شوند؛ مرجوعی لحاظ نمی‌شود).</div>
    ${focusHtml}
    ${N? gl('🔗 پرتکرارترین جفت‌ها', pairs)+gl('🔗🔗 پرتکرارترین ترکیب‌های ۳تایی', trips3) : '<div class="rb-muted">هنوز فروشی ثبت نشده.</div>'}
    ${N && !pairs.length ? `<div class="rb-muted">جفتی با حداقل ${faDigits(BND.minc)} بار هم‌فروشی پیدا نشد؛ عدد «حداقل دفعات» را کمتر کن.</div>`:''}
    <details class="rbx-guide" style="margin-top:10px;"><summary>ℹ️ این اعداد چطور حساب می‌شوند؟</summary><div style="line-height:2;font-size:12px;">
      <b>با هم</b>: تعداد فاکتورهایی که هر دو (یا هر سه) کالا در آن‌ها بوده.<br>
      <b>پشتیبانی</b> = تعداد فاکتور مشترک ÷ کل فاکتورها.<br>
      <b>احتمال همراهی (A→B)</b> = فاکتورهای دارای A و B ÷ فاکتورهای دارای A. مثلاً اگر موتور فن در ۱۰ فاکتور بوده و ۷ تا پروانه هم داشته، ۷۰٪.<br>
      <b>لیفت</b> = (فاکتور مشترک × کل فاکتورها) ÷ (فاکتورهای A × فاکتورهای B). بالای ۱ یعنی این دو کالا بیشتر از حالت اتفاقی با هم می‌آیند؛ هرچه بزرگ‌تر، رابطه‌ی خریدشان قوی‌تر (کاندیدای خوبِ باندل). زیر ۱ یعنی ربطی به هم ندارند.<br>
      کالاهای پرفروش ممکن است فقط به‌خاطر فراوانی، زیاد با هم بیایند؛ برای همین لیفت را کنار تعداد نگاه کن.</div></details></div>`;
}
function bndRenderReportBlock(){
  const host = document.getElementById('bndReportBlock'); if(!host) return;
  host.innerHTML = `<div class="bnd-rep"><div class="bnd-h2" style="margin-top:0;">🔗 هم‌فروشی کالاها — معمولاً با چه کالایی فروش می‌رود؟</div>${bndAnalysisHtml('r', d=>inRange(d))}</div>`;
}

// ═════ PRODUCT CARD ═════
function bndCardBlock(pid, co){
  const comps = co ? bndCompanions(co, pid).filter(c=>c.c>=1).slice(0,3) : [];
  const mine = bndList().filter(b=>b.items.some(r=>r.product_id===pid)||b.rewards.some(r=>r.product_id===pid));
  if(!comps.length && !mine.length) return '';
  return `<div class="bnd-pcard" onclick="event.stopPropagation()">
    ${comps.length?`<div class="bnd-pc-l">🔗 معمولاً با: ${comps.map(c=>`<a class="bnd-chip" onclick="bndGoProduct('${pid}')" title="${faDigits(c.c)} فاکتور مشترک · احتمال ${c.conf.toFixed(0)}٪">${escHtml(bndPN(c.pid))} <i>${faDigits(c.c)}</i></a>`).join(' ')}</div>`:''}
    ${mine.length?`<div class="bnd-pc-l">🎁 باندل: ${mine.map(b=>`<a class="bnd-chip bd${b.active===false?' off':''}" onclick="pickSubnavItem('bundles')">${escHtml(b.name)}${b.rewards.some(r=>r.product_id===pid)&&!b.items.some(r=>r.product_id===pid)?' (جایزه)':''}</a>`).join(' ')}</div>`:''}</div>`;
}

// «دسته‌بندی» و «نوع قطعه» حالا بخشی از درخت گروه‌بندی‌اند؛ یک‌بار خودکار منتقل می‌شوند
let bndMigrating = false;
function bndMigrateOnce(){
  if(bndMigrating || !PARTS.products || (PARTS.legacy_groups_migrated && PARTS.legacy_generics_migrated)) return;
  bndMigrating = true;
  const step = PARTS.legacy_groups_migrated ? 'migrate_legacy_generics' : 'migrate_legacy_groups';
  postParts(step, {}).then(d=>{ if(d && d.ok!==false && PARTS.legacy_groups_migrated && !PARTS.legacy_generics_migrated){ bndMigrating = false; bndMigrateOnce(); return; } if(d && d.ok!==false) showToast('دسته‌بندی‌ها، انواع قطعه و کالاهای کلی به درخت گروه‌بندی منتقل شد','success'); });
}

function bndFillGroupSel(id){
  const sel = document.getElementById(id); if(!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">همه گروه‌ها</option>' + ptgFlat().map(r=>`<option value="${r.id}">${'\u00a0\u00a0'.repeat(r.depth-1)}${r.depth>1?'↳ ':''}${escHtml(r.node.name)} (${faDigits(ptgSubtreeProducts(r.id).length)})</option>`).join('');
  if([...sel.options].some(o=>o.value===cur)) sel.value = cur;
  ssSync(id);
}
