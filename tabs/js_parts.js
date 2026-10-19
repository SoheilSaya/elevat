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
  totals:{},expenses_by_category:{},ar_by_customer:{},ap_by_store:{},cash_ledger:[],reconciliations:[],low_stock:[],low_stock_threshold:2,dash_settings:{}};
let partsLoaded = false;
let partsCurrentSub = 'home';
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
  return '\u2066' + n.toLocaleString('en-US') + ' KT\u2069';   // LTR isolate → «4,000 KT»: عدد سمت چپ، KT سمت راستِ عدد؛ یعنی در خواندن فارسی KT «جلوتر» از عدد می‌آید
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
  dshOnPartsRender();
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
  const evs = slApply('money', events);
  wrap.innerHTML = evs.length ? evs.slice(0,80).map(e=>`
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
  const sorted = slApply('cashtx', [...PARTS.capital_transactions].sort((a,b)=>(b.date||'').localeCompare(a.date||'')));
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
function renderBusinessProfileCard(){
  const el = document.getElementById('bpSummary'); if(!el) return;
  const bp = PARTS.business_profile || {}, v = (t,x)=>`<div><small>${t}</small>${x ? escHtml(String(x)) : '<span style="color:var(--text4)">— ثبت نشده —</span>'}</div>`;
  el.innerHTML = `<div class="bp-sum">${bp.logo ? `<img src="${escHtml(bp.logo)}" alt="">` : '<div style="width:72px;height:72px;border-radius:12px;background:var(--cream2);display:flex;align-items:center;justify-content:center;font-size:30px;">🏢</div>'}
    <div class="bp-sum-l">${v('نام کسب‌وکار',bp.name)}${v('تلفن',bp.phone)}${v('آدرس',bp.address)}${v('متن پایین فاکتور',bp.footer_note)}${v('قالب فاکتور',((INV_STYLES.find(x=>x[0]===bp.invoice_theme)||INV_STYLES[0])[1]).replace(/^\S+\s/,'')+' · '+((INV_COLORS.find(x=>x[0]===bp.invoice_color)||INV_COLORS[2])[1]))}${v('شماره‌ی فاکتور بعدی',faDigits(bp.next_invoice_no||1))}${v('شماره‌ی پیش‌فاکتور بعدی',faDigits(bp.next_quote_no||1))}</div></div>`;
}
function renderVariablesTab(){
  renderSettingsHub();
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
  stgRenderProdVars();
  stgRenderAgentVars();
}
const STGV = {q:'', only:false};
function stgVarsBusy(id){ const el=document.getElementById(id); return !!(el && document.activeElement && el.contains(document.activeElement) && document.activeElement.matches('input,select')); }
function stgPvSet(id, patch){ return postParts('update_product', Object.assign({id}, patch)); }
function stgPvCh(pid, fld, el){
  const v = el.value;
  const g = PARTS.pricing_settings || {};
  if(fld==='payer') return stgPvSet(pid, {calc_shipping_payer: v});
  if(fld==='ship') return stgPvSet(pid, {calc_shipping_cost: v});
  if(fld==='margin') return stgPvSet(pid, {calc_target_margin_pct: v});
  if(fld==='agpct') return stgPvSet(pid, {calc_agent_share_pct: v});
  if(fld==='agmode') return stgPvSet(pid, {calc_include_agent_share: v==='on'?true:(v==='off'?false:'')});
}
async function stgAgCh(aid, fld, el){
  const p = {id:aid}; p[fld==='pct'?'commission_percent':'commission_basis'] = el.value;
  const r = await postParts('update_sales_agent', p); if(r && r.ok!==false) showToast('ذخیره شد','success');
}
function stgPvFilter(){ STGV.q = (document.getElementById('stgPvQ')||{}).value||''; STGV.only = !!(document.getElementById('stgPvOnly')||{}).checked; stgRenderProdVars(true); }
function stgRenderProdVars(force){
  const body = document.querySelector('#productVarsTable tbody'); if(!body) return;
  if(!force && stgVarsBusy('productVarsTable')) return;
  const g = PARTS.pricing_settings || {}, q = STGV.q.trim().toLowerCase();
  const isCustom = p=> p.calc_shipping_payer || p.calc_shipping_cost!=null || p.calc_include_agent_share!=null || p.calc_agent_share_pct!=null || p.calc_target_margin_pct!=null;
  let list = (PARTS.products||[]).filter(p=>!STGV.only || isCustom(p));
  if(q) list = list.filter(p=>[p.name,p.brand,p.car_model,p.part_type,p.variant,p.oem_code].join(' ').toLowerCase().includes(q));
  const bar = document.getElementById('stgPvBar');
  if(bar && !bar.dataset.ok){ bar.dataset.ok=1; bar.innerHTML = `<input class="stg-in" id="stgPvQ" placeholder="جستجوی کالا…" oninput="stgPvFilter()" style="max-width:260px;"><label class="stg-chk"><input type="checkbox" id="stgPvOnly" onchange="stgPvFilter()"> فقط کالاهای با تنظیم اختصاصی</label><span class="stg-pv-hint">خانه‌ی خالی = از تنظیمات سراسری استفاده می‌شود (مقدار سراسری داخل خانه کمرنگ دیده می‌شود). با تغییر هر خانه، همان لحظه ذخیره می‌شود.</span>`; }
  const payerG = g.shipping_payer==='customer'?'مشتری':(g.shipping_payer==='split'?'نصف‌نصف':'خودم');
  const sel = (v,opts,fn)=>`<select class="stg-in stg-pv-in" onchange="${fn}">${opts.map(o=>`<option value="${o[0]}"${o[0]===v?' selected':''}>${o[1]}</option>`).join('')}</select>`;
  const num = (v,ph,fn,u)=>`<div class="stg-in-u"><input class="stg-in stg-pv-in" type="number" min="0" step="any" dir="ltr" value="${v==null?'':v}" placeholder="${ph}" onchange="${fn}">${u?`<span>${u}</span>`:''}</div>`;
  body.innerHTML = list.length ? list.slice(0,300).map(p=>{
    const mode = p.calc_include_agent_share===true?'on':(p.calc_include_agent_share===false?'off':'');
    return `<tr class="${isCustom(p)?'stg-pv-custom':''}"><td>${prodCell(p.id)}</td>
      <td>${sel(p.calc_shipping_payer||'',[['','پیش‌فرض ('+payerG+')'],['business','خودم'],['customer','مشتری'],['split','نصف‌نصف']],`stgPvCh('${p.id}','payer',this)`)}</td>
      <td>${num(p.calc_shipping_cost,String(g.shipping_cost||0),`stgPvCh('${p.id}','ship',this)`,'KT')}</td>
      <td><div class="stg-pv-ag">${sel(mode,[['','پیش‌فرض ('+(g.include_agent_share?'فعال':'غیرفعال')+')'],['on','فعال'],['off','غیرفعال']],`stgPvCh('${p.id}','agmode',this)`)}${num(p.calc_agent_share_pct,String(g.agent_share_pct??0),`stgPvCh('${p.id}','agpct',this)`,'٪')}</div></td>
      <td>${num(p.calc_target_margin_pct,String(g.target_margin_pct??0),`stgPvCh('${p.id}','margin',this)`,'٪')}</td>
      <td>${isCustom(p)?`<button class="icon-btn-sm" onclick="resetProductCalcOverrides('${p.id}')" title="بازگشت به پیش‌فرض سراسری">↺</button>`:''}</td></tr>`;
  }).join('') : `<tr><td colspan="6" class="parts-table-empty">${STGV.only?'کالایی با تنظیم اختصاصی نیست.':'کالایی پیدا نشد.'}</td></tr>`;
}
function stgRenderAgentVars(){
  const agentBody = document.querySelector('#agentVarsTable tbody'); if(!agentBody) return;
  if(stgVarsBusy('agentVarsTable')) return;
  agentBody.innerHTML = (PARTS.sales_agents||[]).length ? PARTS.sales_agents.map(a=>`
    <tr><td>${agentCell(a.id)}</td>
      <td><div class="stg-in-u"><input class="stg-in stg-pv-in" type="number" min="0" max="100" step="any" dir="ltr" value="${a.commission_percent==null?'':a.commission_percent}" placeholder="بدون پورسانت" onchange="stgAgCh('${a.id}','pct',this)"><span>٪</span></div></td>
      <td><select class="stg-in stg-pv-in" onchange="stgAgCh('${a.id}','basis',this)"><option value="profit"${a.commission_basis!=='revenue'?' selected':''}>سود</option><option value="revenue"${a.commission_basis==='revenue'?' selected':''}>درآمد</option></select></td></tr>`).join('')
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

  // first invoice of each (known) customer → «مشتری جدید / قدیمی»
  const firstSale = {};
  (PARTS.sales||[]).slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')) || String(a.id).localeCompare(String(b.id))).forEach(s=>{
    const ck = s.customer_id ? 'id:'+s.customer_id : (s.customer_name ? 'n:'+s.customer_name.trim() : ''); if(ck && !firstSale[ck]) firstSale[ck] = s.id; });
  const soldPids = new Set(); (PARTS.sales||[]).forEach(s=>(s.items||[]).forEach(it=>soldPids.add(it.product_id)));
  const bucket = (v, edges)=>{ let i = 0; while(i < edges.length && v >= edges[i]) i++; return 'b'+(i+1); };
  // sale lines
  (PARTS.sales||[]).forEach(s=>{
    const items = s.items||[];
    const custSt = !(s.customer_id || (s.customer_name && s.customer_name.trim())) ? 'anon' : (firstSale[s.customer_id ? 'id:'+s.customer_id : 'n:'+s.customer_name.trim()]===s.id ? 'new' : 'ret');
    const osize = bucket(num(s.invoice_total), [500,2000,5000,10000]);
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
      F.push({k:'sl', date:s.date, sid:s.id, ii:i, pid:it.product_id, cust:custKey,
        d:Object.assign(pd(it.product_id), {
          store:sup(it.product_id), agent:[s.agent_id||''], customer:[custKey], delivery:[s.delivery_method||''],
          pay_status:[s.payment_status||'paid'], sale:[s.id], bundle:[it.bundle_id||''],
          cust_status:[custSt], order_size:[osize], disc_flag:[(num(it.discount)>0||invDisc>0)?'yes':'no'],
          profit_sign:[num(it.profit)<0?'loss':(num(it.profit)>0?'gain':'zero')],
          margin_band:[num(it.revenue)<=0 ? 'm0' : bucket(num(it.profit)/num(it.revenue)*100, [0,10,25,40])],
          tax_flag:[taxPct>0?'yes':'no'], qty_band:[bucket(qty,[2,4,10,25])],
          ship_mode:[pickup?'pickup':(shipPaid>0 ? (['customer','business','split'].includes(s.shipping_payer)?s.shipping_payer:'customer') : 'none')],
          has_return:[retQty>0?'yes':'no'], bundle_role:[it.bundle_id ? (it.bundle_role==='reward'?'reward':'req') : 'none'],
          price_vs_list:[(()=>{ const pp = prodMap[it.product_id]; if(!pp || pp.sale_price===null || pp.sale_price===undefined || pp.sale_price==='') return 'noprice'; const L = num(pp.sale_price); return price < L-1e-9 ? 'below' : (price > L+1e-9 ? 'above' : 'at'); })()],
          discount_band:[bucket(qty*price>0 ? (num(it.discount)+nets[i]*ratio)/(qty*price)*100 : 0, [0.0001,5,10,20])]}),
        v:{
          qty, ret_qty:retQty, net_qty:qty-retQty, gross:qty*price, item_disc:num(it.discount), inv_disc:nets[i]*ratio,
          item_rev:num(it.revenue), revenue:num(it.revenue)+shipEff*share, cogs:num(it.cogs), profit:num(it.profit)+shipEff*share,
          ship_charged:num(s.shipping_charged_to_customer)*share, ship_paid:shipPaid*share, ship_eff:shipEff*share,
          tax:taxNet*share, inv_total:num(s.invoice_total)*share, received:num(s.amount_received)*share,
          outstanding:num(s.amount_outstanding)*share, commission:num(s.agent_commission)*share,
          has_ship: shipPaid>0 ? 1 : 0, pickup: pickup ? 1 : 0, has_agent: s.agent_id ? 1 : 0, has_disc:(num(it.discount)>0||invDisc>0)?1:0,
          has_ret: retQty>0?1:0, unpaid: num(s.amount_outstanding)>0.0001?1:0, is_new: custSt==='new'?1:0, is_ret: custSt==='ret'?1:0, is_anon: custSt==='anon'?1:0, loss: num(it.profit)<0 ? -num(it.profit) : 0, loss_line: num(it.profit)<0?1:0,
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
      F.push({k:'pl', date:p.order_date, pur:p.id, ii:i, pid:it.product_id,
        d:Object.assign(pd(it.product_id), {store:[p.store_id||''], delivery:[p.delivery_method||''], pay_status:[p.payment_status||'paid'], purchase:[p.id], order_size:[bucket(tot,[500,2000,5000,10000])], qty_band:[bucket(num(it.qty),[2,4,10,25])]}),
        v:{qty:num(it.qty), spend:spends[i], paid:paid*share, outstanding:(tot-paid)*share, unpaid:(tot-paid)>0.0001?1:0}});
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
      F.push({k:'rt', date, rid:r.id, sid:s.id, ii:i, pid:it.product_id,
        d:Object.assign(pd(it.product_id), {restock_flag:[r.restock===false?'no':'yes'], refund_kind:[num(r.cash_refunded)>0.0001?'cash':'credit'], customer:[custKey], return_reason:[r.reason||'سایر'], agent:[s.agent_id||''], sale:[s.id], store:sup(it.product_id), delivery:[s.delivery_method||''], pay_status:[s.payment_status||'paid']}),
        v:{qty:num(it.qty), value:nets[i], total:num(r.refund_total)*share, cash:num(r.cash_refunded)*share, restock:r.restock===false?0:num(it.qty)}});
    });
  });
  // expenses / capital / payouts / cash ledger / price entries
  (PARTS.business_expenses||[]).forEach(x=>{ const isTax = x.category===TAX_PAYMENT_CATEGORY;   // VAT settlement is cash out, not an expense
    F.push({k:'ex', eid:x.id, date:x.date, d:{expense_category:[x.category||'سایر']}, v:{amount:isTax?0:num(x.amount), taxpay:isTax?num(x.amount):0, is_tax:isTax?1:0, is_exp:isTax?0:1}}); });
  (PARTS.capital_transactions||[]).forEach(t=>F.push({k:'cap', cid:t.id, date:t.date, d:{}, v:{
    dep:t.type==='deposit'?num(t.amount):0, wd:t.type==='withdrawal'?num(t.amount):0, adj:t.type==='adjustment'?num(t.amount):0}}));
  (PARTS.agent_payouts||[]).forEach(p=>F.push({k:'po', poid:p.id, date:p.date, d:{agent:[p.agent_id||'']}, v:{amount:num(p.amount)}}));
  (PARTS.cash_ledger||[]).forEach(e=>F.push({k:'cl', lid:e.id, date:e.date, d:{cash_type:[e.type||''], cash_dir:[num(e.amount)>=0?'in':'out']}, v:{amt:num(e.amount), in:num(e.amount)>0?num(e.amount):0, out:num(e.amount)<0?-num(e.amount):0}}));
  (PARTS.price_entries||[]).forEach(e=>{
    const hasP = e.ref_type==='product' && e.product_id;
    const gd = e.ref_type==='group' ? Object.assign({product:['gr:'+(e.group_id||'')]}, (()=>{ const path = ptgById(e.group_id) ? ptgPath(e.group_id) : []; return {group:path.length?path:['__none'], group_leaf:[e.group_id||''], group_l1:[path[0]||''], group_l2:[path[1]||''], group_l3:[path[2]||'']}; })()) : null;
    F.push({k:'pe', peid:e.id, date:e.date, d:Object.assign(hasP ? pd(e.product_id) : (gd || {product:['g:'+(e.generic_id||'')]}), {store:[e.store_id||''], price_source:[hasP?'product':(gd?'group':'generic')]}), v:{price:num(e.price)}});
  });
  // static rows (no date)
  const stock = PARTS.stock||{}, avg = PARTS.avg_cost||{};
  const lowSet = new Set(PARTS.low_stock||[]);
  PARTS.products.forEach(p=>{
    const st = num(stock[p.id]), ac = num(avg[p.id]);
    const sv = (PARTS.stock_value && PARTS.stock_value[p.id]!==undefined) ? num(PARTS.stock_value[p.id]) : st*ac;   // exact lot value (the server keeps unrounded cost, so the sum equals «ارزش موجودی»)
    const sp = (p.sale_price===null||p.sale_price===undefined||p.sale_price==='') ? null : num(p.sale_price);
    F.push({k:'pr', date:null, pid:p.id, d:Object.assign(pd(p.id), {store:sup(p.id),
      stock_status:[st<=0?'out':(lowSet.has(p.id)?'low':'ok')], stock_band:[bucket(st,[1,6,21,101])], reorder_state:[(p.reorder_point===null||p.reorder_point===undefined||p.reorder_point==='')?'no':'yes'], list_margin_band:[sp===null||sp<=0 ? 'm0' : bucket((sp-ac)/sp*100,[0,10,25,40])], ever_sold:[soldPids.has(p.id)?'yes':'no'], price_state:[sp===null?'no':'yes']}), v:{
      has_stock:st>0?1:0, no_price:sp===null?1:0, dead:(st>0 && !soldPids.has(p.id))?1:0, dead_value:(st>0 && !soldPids.has(p.id))?sv:0,
      stock:st, value:sv, avg_cost:ac, sale_price:sp, has_price:sp!==null?1:0, potential:sp!==null?st*sp:0,
      pot_profit:sp!==null?st*(sp-ac):0, reorder:(p.reorder_point===null||p.reorder_point===undefined||p.reorder_point==='')?null:num(p.reorder_point),
      low:lowSet.has(p.id)?1:0, out:st<=0?1:0}});
  });
  const ap = PARTS.ap_by_store||{};
  PARTS.stores.forEach(s=>F.push({k:'st', sto:s.id, date:null, d:{store:[s.id], store_debt:[num((ap[s.id]||{}).outstanding)>0.0001?'owed':'clear'], free_ship_state:[num(s.free_shipping_min)>0?'yes':'no']}, v:{ship:num(s.shipping_cost), free_min:num(s.free_shipping_min), payable:num((ap[s.id]||{}).outstanding)}}));
  const ags = PARTS.agent_summary||{};
  PARTS.sales_agents.forEach(a=>F.push({k:'ag', ago:a.id, date:null, d:{agent:[a.id]}, v:{pct:a.commission_percent===null||a.commission_percent===undefined||a.commission_percent===''?null:num(a.commission_percent),
    payable:num((ags[a.id]||{}).payable), accrued:num((ags[a.id]||{}).accrued), paid:num((ags[a.id]||{}).paid)}}));
  const ar = PARTS.ar_by_customer||{};
  PARTS.customers.forEach(c=>F.push({k:'cu', cuid:c.id, date:null, d:{customer:['id:'+c.id], debt_state:[num((ar[c.name]||{}).outstanding)>0.0001?'debtor':'clear']}, v:{outstanding:num((ar[c.name]||{}).outstanding)}}));
  const T = PARTS.totals||{};
  F.forEach(f=>{ if(!f.date) return; const j = isoToJ(f.date);
    f.d.jyear=[String(j.y)]; f.d.jmonth=[String(j.m).padStart(2,'0')]; f.d.season=[String(Math.floor((j.m-1)/3)+1)]; f.d.month_part=[j.d<=10?'1':(j.d<=20?'2':'3')]; f.d.jday=[String(j.d).padStart(2,'0')]; f.d.ym=[j.y+'-'+String(j.m).padStart(2,'0')]; f.d.yseason=[j.y+'-'+(Math.floor((j.m-1)/3)+1)]; });
  F.push({k:'tot', date:null, d:{}, v:{ar:num(T.accounts_receivable), ap:num(T.accounts_payable), biz:num(T.business_value),
    comm_payable:num(T.agent_commission_payable), net_capital:num(T.net_capital), tax_payable:num(T.tax_payable), oversold:num(T.oversold_cost)}});
  F.forEach((f,fi)=>{ f.i = fi; });
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
  jyear:       {label:'🗓️ سال شمسی', kinds:['sl','pl','rt','ex','cap','po','cl','pe']},
  jmonth:      {label:'🌙 ماه سال (فروردین … اسفند، همه‌ی سال‌ها)', kinds:['sl','pl','rt','ex','cap','po','cl','pe'], note:'همه‌ی ماه‌های هم‌نام در سال‌های مختلف با هم جمع می‌شوند (برای دیدنِ فصل‌های پررونق).'},
  season:      {label:'🍂 فصل سال (بهار … زمستان)', kinds:['sl','pl','rt','ex','cap','po','cl','pe']},
  month_part:  {label:'📍 بخش ماه (اول / میانه / آخر ماه)', kinds:['sl','pl','rt','ex','cap','po','cl','pe']},
  cust_status: {label:'🆕 مشتری جدید یا قدیمی', kinds:['sl'], note:'فاکتورِ اولِ هر مشتریِ ثبت‌شده «جدید» و فاکتورهای بعدی‌اش «قدیمی» حساب می‌شود؛ فاکتور بدون مشتری در «مشتری متفرقه» می‌آید.'},
  order_size:  {label:'🧺 اندازه‌ی فاکتور (کم / متوسط / درشت)', kinds:['sl','pl']},
  disc_flag:   {label:'🏷️ با تخفیف / بدون تخفیف', kinds:['sl']},
  profit_sign: {label:'📈 ردیف سودده / زیان‌ده', kinds:['sl']},
  margin_band: {label:'🎚️ بازه‌ی حاشیه سود ردیف', kinds:['sl']},
  tax_flag:    {label:'🧾 فاکتور با مالیات / بدون مالیات', kinds:['sl']},
  jday:        {label:'📅 روز ماه (۱ تا ۳۱، همه‌ی ماه‌ها)', kinds:['sl','pl','rt','ex','cap','po','cl','pe']},
  ym:          {label:'🗓️ سال و ماه (مثلاً مهر ۱۴۰۵)', kinds:['sl','pl','rt','ex','cap','po','cl','pe']},
  yseason:     {label:'🍁 سال و فصل (مثلاً پاییز ۱۴۰۵)', kinds:['sl','pl','rt','ex','cap','po','cl','pe']},
  qty_band:    {label:'🔢 تعداد در هر ردیف (۱ / چندتایی / عمده)', kinds:['sl','pl']},
  ship_mode:   {label:'🚚 نحوه‌ی پرداخت ارسال (مشتری / ما / نصف‌نصف / حضوری)', kinds:['sl']},
  has_return:  {label:'↩️ ردیف دارای مرجوعی یا بدون مرجوعی', kinds:['sl']},
  bundle_role: {label:'🎁 نقش ردیف در باندل (قلم باندل / جایزه / عادی)', kinds:['sl']},
  price_vs_list:{label:'💲 قیمت فروش نسبت به قیمت لیست (زیر / برابر / بالاتر)', kinds:['sl']},
  discount_band:{label:'🏷️ درصد تخفیف ردیف (بدون / کم / زیاد)', kinds:['sl']},
  stock_band:  {label:'📦 بازه‌ی موجودی (۰ / کم / زیاد)', kinds:['pr']},
  list_margin_band:{label:'🎚️ حاشیه سود بالقوه‌ی کالا (قیمت لیست در برابر بها)', kinds:['pr']},
  reorder_state:{label:'🔔 دارای نقطه سفارش یا بدون آن', kinds:['pr']},
  debt_state:  {label:'👥 مشتری بدهکار / تسویه', kinds:['cu']},
  store_debt:  {label:'🏬 تامین‌کننده طلبکار از ما / تسویه', kinds:['st']},
  free_ship_state:{label:'🚚 تامین‌کننده با ارسال رایگان مشروط / بدون', kinds:['st']},
  cash_dir:    {label:'🏦 ورودی یا خروجی صندوق', kinds:['cl']},
  restock_flag:{label:'♻️ مرجوعی برگشته به انبار / نه', kinds:['rt']},
  refund_kind: {label:'💵 مرجوعی با بازگشت وجه نقد / بدون وجه', kinds:['rt']},
  price_source:{label:'🏷️ منبع قیمت لیست (کالا / گروه / کالای کلی)', kinds:['pe']},
  stock_status:{label:'📦 وضعیت موجودی (ناموجود / کم / عادی)', kinds:['pr']},
  ever_sold:   {label:'🕸️ فروخته‌شده / هرگز فروخته‌نشده', kinds:['pr']},
  price_state: {label:'💲 دارای قیمت فروش / بدون قیمت', kinds:['pr']},
};
const RB_FILTER_DIMS = ['jday','ym','yseason','qty_band','ship_mode','has_return','bundle_role','price_vs_list','discount_band','stock_band','list_margin_band','reorder_state','debt_state','store_debt','free_ship_state','cash_dir','restock_flag','refund_kind','price_source','jyear','jmonth','season','month_part','cust_status','order_size','disc_flag','profit_sign','margin_band','tax_flag','stock_status','ever_sold','price_state','bundle','variant','oem','product','brand','car_model','group','group_leaf','store','agent','customer','delivery','pay_status','expense_category','return_reason','weekday','cash_type','sale','purchase'];
const CASH_TYPE_FA = {purchase_payment:'پرداخت به تامین‌کننده', sale_receipt:'دریافت از مشتری', sale_refund:'بازگشت وجه مرجوعی', shipping_paid:'هزینه ارسال', agent_payout:'پرداخت پورسانت', expense:'هزینه', capital_deposit:'واریز سرمایه', capital_withdrawal:'برداشت از سرمایه', capital_adjustment:'تعدیل مغایرت‌گیری'};
const PAY_LABELS = {paid:'پرداخت‌شده', unpaid:'نسیه (پرداخت‌نشده)', partial:'پرداخت جزئی'};

const RB_FIXED = {
  jmonth: FA_MONTHS_RB().map((n,i)=>[String(i+1).padStart(2,'0'), n]),
  season: FA_SEASONS.map((n,i)=>[String(i+1), n]),
  month_part: [['1','اول ماه (۱ تا ۱۰)'],['2','میانه‌ی ماه (۱۱ تا ۲۰)'],['3','آخر ماه (۲۱ تا پایان)']],
  cust_status: [['new','🆕 مشتری جدید (اولین فاکتور)'],['ret','🔁 مشتری قدیمی (فاکتور بعدی)'],['anon','مشتری متفرقه']],
  order_size: [['b1','کمتر از KT ۵۰۰'],['b2','KT ۵۰۰ تا ۲٬۰۰۰'],['b3','KT ۲٬۰۰۰ تا ۵٬۰۰۰'],['b4','KT ۵٬۰۰۰ تا ۱۰٬۰۰۰'],['b5','KT ۱۰٬۰۰۰ و بیشتر']],
  disc_flag: [['yes','با تخفیف'],['no','بدون تخفیف']],
  profit_sign: [['gain','سودده'],['zero','بدون سود و زیان'],['loss','زیان‌ده']],
  margin_band: [['m0','بدون درآمد (رایگان/جایزه)'],['b1','زیان (حاشیه منفی)'],['b2','۰ تا ۱۰٪'],['b3','۱۰ تا ۲۵٪'],['b4','۲۵ تا ۴۰٪'],['b5','بیش از ۴۰٪']],
  tax_flag: [['yes','با مالیات'],['no','بدون مالیات']],
  stock_status: [['out','ناموجود'],['low','کم‌موجودی'],['ok','موجودی عادی']],
  ever_sold: [['yes','فروخته‌شده'],['no','هرگز فروخته‌نشده']],
  price_state: [['yes','دارای قیمت فروش'],['no','بدون قیمت فروش']],
  qty_band: [['b1','۱ عدد'],['b2','۲ تا ۳ عدد'],['b3','۴ تا ۹ عدد'],['b4','۱۰ تا ۲۴ عدد'],['b5','۲۵ عدد و بیشتر (عمده)']],
  ship_mode: [['pickup','تحویل حضوری'],['customer','ارسال به‌حساب مشتری'],['business','ارسال به‌حساب ما (رایگان)'],['split','ارسال نصف‌نصف'],['none','بدون ارسال']],
  has_return: [['yes','دارای مرجوعی'],['no','بدون مرجوعی']],
  bundle_role: [['req','قلم باندل'],['reward','جایزه‌ی باندل'],['none','فروش عادی']],
  price_vs_list: [['below','زیر قیمت لیست'],['at','برابر قیمت لیست'],['above','بالاتر از قیمت لیست'],['noprice','کالا قیمت لیست ندارد']],
  discount_band: [['b1','بدون تخفیف'],['b2','تخفیف کمتر از ۵٪'],['b3','۵ تا ۱۰٪'],['b4','۱۰ تا ۲۰٪'],['b5','۲۰٪ و بیشتر']],
  stock_band: [['b1','موجودی صفر'],['b2','۱ تا ۵ عدد'],['b3','۶ تا ۲۰ عدد'],['b4','۲۱ تا ۱۰۰ عدد'],['b5','بیش از ۱۰۰ عدد']],
  list_margin_band: [['m0','بدون قیمت فروش'],['b1','زیان (قیمت لیست زیر بها)'],['b2','۰ تا ۱۰٪'],['b3','۱۰ تا ۲۵٪'],['b4','۲۵ تا ۴۰٪'],['b5','بیش از ۴۰٪']],
  reorder_state: [['yes','دارای نقطه سفارش'],['no','بدون نقطه سفارش']],
  debt_state: [['debtor','بدهکار'],['clear','تسویه']],
  store_debt: [['owed','ما بدهکاریم'],['clear','تسویه']],
  free_ship_state: [['yes','ارسال رایگان مشروط دارد'],['no','ندارد']],
  cash_dir: [['in','ورودی'],['out','خروجی']],
  restock_flag: [['yes','به انبار برگشته'],['no','به انبار برنگشته']],
  refund_kind: [['cash','با بازگشت وجه نقد'],['credit','بدون وجه (کسر از بدهی)']],
  price_source: [['product','قیمت کالا'],['group','قیمت گروه'],['generic','کالای کلی']],
};
function FA_MONTHS_RB(){ return ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند']; }
const RB_ORDERED = new Set(['jday','ym','yseason','qty_band','discount_band','stock_band','list_margin_band','price_vs_list','ship_mode','jyear','jmonth','season','month_part','order_size','margin_band','cust_status','profit_sign','stock_status']);
function rbDimCmp(dim){ return RB_ORDERED.has(dim) ? ((a,b)=>String(a.key).localeCompare(String(b.key))) : ((a,b)=>a.label.localeCompare(b.label,'fa')); }
function dimKeyLabel(dim, key){
  if(RB_FIXED[dim]){ const h = RB_FIXED[dim].find(x=>x[0]===String(key)); return h ? h[1] : String(key); }
  if(dim==='jyear') return 'سال '+faDigits(key);
  if(dim==='jday') return 'روز '+faDigits(+key)+' ماه';
  if(dim==='ym'){ const [y,m] = String(key).split('-'); return FA_MONTHS_RB()[(+m)-1]+' '+faDigits(y); }
  if(dim==='yseason'){ const [y,q] = String(key).split('-'); return FA_SEASONS[(+q)-1]+' '+faDigits(y); }
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
let RB_TRACE = null;
const rbSum = (rows, f) => { let s = 0; for(const r of rows) s += (r.v[f]||0); if(RB_TRACE) RB_TRACE.push({t:'sum', f, n:rows.length, v:s, rows}); return s; };
const rbDistinct = (rows, f) => { const n = new Set(rows.map(r=>r[f])).size; if(RB_TRACE) RB_TRACE.push({t:'cnt', f, n:rows.length, v:n, rows}); return n; };
const rbDiv = (a, b) => { const v = b ? a/b : 0; if(RB_TRACE) RB_TRACE.push({t:'div', a, b, v}); return v; };
// ردیابی مرحله‌ای برای متغیرهایی که مستقیم از ردیف‌ها شمارش/بیشینه می‌گیرند
const rbTrN = (rows, label, v, kind)=>{ if(RB_TRACE) RB_TRACE.push({t:kind||'note', f:label, n:rows.length, v, rows}); return v; };
const RB_METRICS = {};
function defM(id, group, label, unit, kinds, fn, opt){ RB_METRICS[id] = Object.assign({id, group, label, unit, kinds, fn}, opt||{}); }
const isSL = r=>r.k==='sl', isPL = r=>r.k==='pl', isRT = r=>r.k==='rt', isEX = r=>r.k==='ex';

(function(){
  const G1='💰 فروش', G2='📉 تخفیف و سود', G3='🚚 ارسال و مالیات', G4='📥 خرید', G5='📦 موجودی و انبار', G6='↩️ مرجوعی',
        G7='💸 هزینه‌ها و سرمایه', G8='🏦 صندوق و حساب', G9='🧑‍💼 نمایندگان', G10='👥 مشتریان', G11='🏬 تامین‌کنندگان و لیست قیمت', G12='📊 جمع‌بندی مالی';
  // sales
  defM('sales_count',G1,'تعداد فاکتور فروش','num',['sl'],(r)=>rbDistinct(r,'sid'),{hint:'هر فاکتور یک‌بار شمرده می‌شود'});
  defM('sale_lines',G1,'تعداد ردیف فروش','num',['sl'],(r)=>rbTrN(r,'شمارش ردیف‌های فروش', r.length,'cnt'));
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
  defM('active_customers',G1,'تعداد مشتریان فعال','num',['sl'],(r)=>rbTrN(r,'مشتریان منحصربه‌فرد (کلید مشتری)',new Set(r.map(x=>x.cust)).size,'cnt'));
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
  defM('purchase_lines',G4,'تعداد ردیف خرید','num',['pl'],(r)=>rbTrN(r,'شمارش ردیف‌های خرید', r.length,'cnt'));
  defM('units_purchased',G4,'تعداد خریداری‌شده','num',['pl'],(r)=>rbSum(r,'qty'));
  defM('purchase_spend',G4,'مبلغ خرید','money',['pl'],(r)=>rbSum(r,'spend'));
  defM('avg_buy_price',G4,'میانگین قیمت خرید هر واحد','money',['pl'],(r)=>rbDiv(rbSum(r,'spend'), rbSum(r,'qty')));
  defM('avg_purchase_value',G4,'میانگین مبلغ هر سفارش خرید','money',['pl'],(r)=>rbDiv(rbSum(r,'spend'), rbDistinct(r,'pur')));
  defM('paid_to_suppliers',G4,'پرداخت‌شده به تامین‌کنندگان','money',['pl'],(r)=>rbSum(r,'paid'));
  defM('purchase_outstanding',G4,'بدهی خرید (پرداخت‌نشده)','money',['pl'],(r)=>rbSum(r,'outstanding'));
  defM('purchase_share',G4,'سهم از کل خرید ٪','pct',['pl'],(r,c)=>rbDiv(rbSum(r,'spend'), rbSum((c.base||c.pool).filter(isPL),'spend'))*100);
  // inventory (current state)
  defM('products_count',G5,'تعداد کالا','num',['pr'],(r)=>rbTrN(r,'شمارش کالاها', r.length,'cnt'));
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

  // ── advanced analysis ──
  const GA='🔬 تحلیل پیشرفته (مشتری، موجودی، ریسک)';
  const known = r=>r.filter(x=>!x.v.is_anon && x.cust);
  defM('new_customer_orders',GA,'فاکتورهای مشتریان جدید (اولین خرید)','num',['sl'],(r)=>rbDistinct(r.filter(x=>x.v.is_new),'sid'));
  defM('repeat_orders',GA,'فاکتورهای مشتریان قدیمی (خرید مجدد)','num',['sl'],(r)=>rbDistinct(r.filter(x=>x.v.is_ret),'sid'));
  defM('repeat_rate',GA,'نرخ خرید مجدد ٪ (فاکتور قدیمی ÷ فاکتور دارای مشتری)','pct',['sl'],(r)=>rbDiv(rbDistinct(r.filter(x=>x.v.is_ret),'sid'), rbDistinct(known(r),'sid'))*100);
  defM('new_customers',GA,'تعداد مشتریان جدید','num',['sl'],(r)=>rbTrN(r.filter(x=>x.v.is_new),'مشتریانِ دارای اولین فاکتور',new Set(r.filter(x=>x.v.is_new).map(x=>x.cust)).size,'cnt'));
  defM('orders_per_customer',GA,'میانگین فاکتور هر مشتری','num',['sl'],(r)=>rbDiv(rbDistinct(known(r),'sid'), new Set(known(r).map(x=>x.cust)).size));
  defM('revenue_per_customer',GA,'میانگین درآمد هر مشتری','money',['sl'],(r)=>rbDiv(rbSum(known(r),'revenue'), new Set(known(r).map(x=>x.cust)).size));
  defM('profit_per_customer',GA,'میانگین سود هر مشتری','money',['sl'],(r)=>rbDiv(rbSum(known(r),'profit'), new Set(known(r).map(x=>x.cust)).size));
  defM('collect_pct',GA,'درصد وصول ٪ (دریافتی ÷ مبلغ فاکتورها)','pct',['sl'],(r)=>rbDiv(rbSum(r,'received'), rbSum(r,'inv_total'))*100);
  defM('avg_discount_order',GA,'میانگین تخفیف هر فاکتور','money',['sl'],(r)=>rbDiv(rbSum(r,'item_disc')+rbSum(r,'inv_disc'), rbDistinct(r,'sid')));
  defM('loss_amount',GA,'جمع زیان ردیف‌های زیان‌ده','money',['sl'],(r)=>rbSum(r,'loss'));
  defM('loss_lines',GA,'تعداد ردیف‌های زیان‌ده','num',['sl'],(r)=>rbSum(r,'loss_line'));
  const perOrder = (r,f)=>{ const m = new Map(); r.forEach(x=>m.set(x.sid,(m.get(x.sid)||0)+(x.v[f]||0))); return [...m.values()]; };
  defM('loss_orders',GA,'تعداد فاکتورهای زیان‌ده (سود کل فاکتور منفی)','num',['sl'],(r)=>rbTrN(r,'فاکتورهایی که جمع سود ردیف‌هایشان منفی است', perOrder(r,'profit').filter(v=>v<-1e-9).length,'cnt'));
  defM('max_order',GA,'بزرگ‌ترین فاکتور (مبلغ)','money',['sl'],(r)=>{ const a = perOrder(r,'inv_total'); return rbTrN(r,'بیشترین جمع مبلغ یک فاکتور ('+a.length+' فاکتور)', a.length ? Math.max.apply(null,a) : 0,'max'); });
  defM('min_order',GA,'کوچک‌ترین فاکتور (مبلغ)','money',['sl'],(r)=>{ const a = perOrder(r,'inv_total'); return rbTrN(r,'کمترین جمع مبلغ یک فاکتور ('+a.length+' فاکتور)', a.length ? Math.min.apply(null,a) : 0,'max'); });
  defM('commission_pct',GA,'پورسانت از درآمد ٪','pct',['sl'],(r)=>rbDiv(rbSum(r,'commission'), rbSum(r,'revenue'))*100);
  defM('days_since_last_sale',GA,'روز از آخرین فروش تا پایان بازه','num',['sl'],(r,c)=>{ let mx=''; r.forEach(x=>{ if(x.date && x.date>mx) mx=x.date; }); return mx && c && c.end ? Math.max(0, isoDiff(mx, c.end)) : 0; },{hint:'برای شناسایی کالا/مشتری راکد؛ اگر در بازه فروشی نباشد صفر است'});
  defM('sell_through',GA,'نرخ فروش از موجودی ٪ (فروش ÷ (فروش + موجودی فعلی))','pct',['sl','pr'],(r)=>{ const q = rbSum(r.filter(isSL),'net_qty'), st = rbSum(r.filter(x=>x.k==='pr'),'stock'); return rbDiv(q, q+st)*100; });
  defM('days_of_stock',GA,'پوشش موجودی (روز) = موجودی ÷ فروش روزانه','num',['sl','pr'],(r,c)=>{ const q = rbSum(r.filter(isSL),'net_qty'), st = rbSum(r.filter(x=>x.k==='pr'),'stock'); const perDay = rbDiv(q, (c&&c.days)||1); return perDay>0 ? st/perDay : 0; },{hint:'با نرخ فروش همین بازه؛ اگر فروشی نبوده صفر نشان داده می‌شود'});
  defM('inventory_turnover',GA,'گردش موجودی (بهای فروش ÷ ارزش موجودی فعلی)','num',['sl','pr'],(r)=>rbDiv(rbSum(r.filter(isSL),'cogs'), rbSum(r.filter(x=>x.k==='pr'),'value')));
  defM('gmroi',GA,'بازده سود به موجودی (سود ناخالص ÷ ارزش موجودی)','num',['sl','pr'],(r)=>rbDiv(rbSum(r.filter(isSL),'profit'), rbSum(r.filter(x=>x.k==='pr'),'value')));
  defM('dead_stock_count',GA,'تعداد کالای راکد (موجود ولی هرگز فروخته‌نشده)','num',['pr'],(r)=>rbSum(r,'dead'));
  defM('dead_stock_value',GA,'ارزش موجودی راکد','money',['pr'],(r)=>rbSum(r,'dead_value'));
  defM('return_value_pct',GA,'نرخ مرجوعی ارزشی ٪ (ارزش مرجوعی ÷ فروش ناخالص)','pct',['sl','rt'],(r)=>rbDiv(rbSum(r.filter(isRT),'value'), rbSum(r.filter(isSL),'gross'))*100);
  defM('expense_to_revenue',GA,'هزینه‌ها به درآمد ٪','pct',['sl','ex'],(r)=>rbDiv(rbSum(r.filter(isEX),'amount'), rbSum(r.filter(isSL),'revenue'))*100);
  defM('customers_in_debt',GA,'تعداد مشتریان بدهکار','num',['cu'],(r)=>rbTrN(r,'مشتریانِ دارای مانده‌ی مثبت', r.filter(x=>x.v.outstanding>0.0001).length,'cnt'));
  defM('avg_customer_debt',GA,'میانگین بدهی هر مشتریِ بدهکار','money',['cu'],(r)=>{ const w=r.filter(x=>x.v.outstanding>0.0001); return rbDiv(rbSum(w,'outstanding'), w.length); });
  defM('stores_with_debt',GA,'تعداد تامین‌کنندگانِ طلبکار از ما','num',['st'],(r)=>r.filter(x=>x.v.payable>0.0001).length);
  defM('pe_spread',GA,'اختلاف بیشترین و کمترین قیمت لیست‌شده','money',['pe'],(r)=>r.length ? Math.max.apply(null,r.map(x=>x.v.price))-Math.min.apply(null,r.map(x=>x.v.price)) : 0);
  defM('pe_spread_pct',GA,'اختلاف قیمت ٪ (بیشترین ÷ کمترین − ۱)','pct',['pe'],(r)=>{ if(!r.length) return 0; const mn = Math.min.apply(null,r.map(x=>x.v.price)), mx = Math.max.apply(null,r.map(x=>x.v.price)); return mn>0 ? (mx/mn-1)*100 : 0; });

  // ── sweep 2: more measures ──
  const GS='📐 رفتار فروش و آمار روزانه';
  const perO = (r,f)=>{ const m = new Map(); r.forEach(x=>m.set(x.sid,(m.get(x.sid)||0)+(x.v[f]||0))); return [...m.values()]; };
  const median = a=>{ if(!a.length) return 0; const b = a.slice().sort((x,y)=>x-y), h = b.length>>1; return b.length%2 ? b[h] : (b[h-1]+b[h])/2; };
  defM('median_order',GS,'میانه‌ی مبلغ فاکتورها','money',['sl'],(r)=>rbTrN(r,'میانه‌ی جمع مبلغ فاکتورها', median(perO(r,'inv_total')),'max'),{hint:'نیمی از فاکتورها کمتر و نیمی بیشتر از این مبلغ‌اند'});
  defM('lines_per_order',GS,'میانگین تعداد ردیف در هر فاکتور','num',['sl'],(r)=>rbDiv(r.length, rbDistinct(r,'sid')));
  defM('avg_line_value',GS,'میانگین درآمد هر ردیف','money',['sl'],(r)=>rbDiv(rbSum(r,'revenue'), r.length));
  defM('max_line_revenue',GS,'بیشترین درآمد یک ردیف','money',['sl'],(r)=>r.length ? Math.max.apply(null,r.map(x=>x.v.revenue)) : 0);
  defM('cogs_pct',GS,'بها به درآمد ٪','pct',['sl'],(r)=>rbDiv(rbSum(r,'cogs'), rbSum(r,'revenue'))*100);
  defM('ship_cover_pct',GS,'پوشش هزینه‌ی ارسال ٪ (دریافتی ÷ پرداختی)','pct',['sl'],(r)=>rbDiv(rbSum(r,'ship_charged'), rbSum(r,'ship_paid'))*100);
  defM('returned_orders',GS,'تعداد فاکتورهای دارای مرجوعی','num',['sl'],(r)=>rbDistinct(r.filter(x=>x.v.has_ret),'sid'));
  defM('unpaid_orders',GS,'تعداد فاکتورهای دارای مانده‌ی طلب','num',['sl'],(r)=>rbDistinct(r.filter(x=>x.v.unpaid),'sid'));
  defM('unpaid_orders_pct',GS,'سهم فاکتورهای نسیه ٪','pct',['sl'],(r)=>rbDiv(rbDistinct(r.filter(x=>x.v.unpaid),'sid'), rbDistinct(r,'sid'))*100);
  defM('discounted_orders_pct',GS,'سهم فاکتورهای تخفیف‌دار ٪','pct',['sl'],(r)=>rbDiv(rbDistinct(r.filter(x=>x.v.has_disc),'sid'), rbDistinct(r,'sid'))*100);
  defM('pickup_pct',GS,'سهم فاکتورهای حضوری ٪','pct',['sl'],(r)=>rbDiv(rbDistinct(r.filter(x=>x.v.pickup),'sid'), rbDistinct(r,'sid'))*100);
  defM('agent_orders_pct',GS,'سهم فاکتورهای دارای نماینده ٪','pct',['sl'],(r)=>rbDiv(rbDistinct(r.filter(x=>x.v.has_agent),'sid'), rbDistinct(r,'sid'))*100);
  defM('loss_orders_pct',GS,'سهم فاکتورهای زیان‌ده ٪','pct',['sl'],(r)=>rbDiv(perO(r,'profit').filter(v=>v<-1e-9).length, rbDistinct(r,'sid'))*100);
  defM('distinct_brands_sold',GS,'تعداد برندهای متفاوت فروخته‌شده','num',['sl'],(r)=>{ const s = new Set(); r.forEach(x=>((x.d.brand)||[]).forEach(b=>{ if(b) s.add(b); })); return s.size; });
  defM('distinct_cars_sold',GS,'تعداد مدل‌های خودروی متفاوت فروخته‌شده','num',['sl'],(r)=>{ const s = new Set(); r.forEach(x=>((x.d.car_model)||[]).forEach(b=>{ if(b) s.add(b); })); return s.size; });
  defM('active_days',GS,'تعداد روزهای دارای فروش','num',['sl'],(r)=>rbTrN(r,'تاریخ‌های منحصربه‌فرد', new Set(r.map(x=>x.date)).size,'cnt'));
  defM('revenue_per_day',GS,'میانگین درآمد روزانه (روی کل روزهای بازه)','money',['sl'],(r,c)=>rbDiv(rbSum(r,'revenue'), (c&&c.days)||1));
  defM('profit_per_day',GS,'میانگین سود روزانه (روی کل روزهای بازه)','money',['sl'],(r,c)=>rbDiv(rbSum(r,'profit'), (c&&c.days)||1));
  defM('orders_per_day',GS,'میانگین فاکتور در روز (روی کل روزهای بازه)','num',['sl'],(r,c)=>rbDiv(rbDistinct(r,'sid'), (c&&c.days)||1));
  defM('revenue_per_active_day',GS,'میانگین درآمد در روزهای دارای فروش','money',['sl'],(r)=>rbDiv(rbSum(r,'revenue'), new Set(r.map(x=>x.date)).size));
  const GP='📥 تحلیل خرید';
  defM('purchase_per_day',GP,'میانگین خرید روزانه (روی کل روزهای بازه)','money',['pl'],(r,c)=>rbDiv(rbSum(r,'spend'), (c&&c.days)||1));
  defM('units_per_purchase',GP,'میانگین تعداد کالا در هر سفارش خرید','num',['pl'],(r)=>rbDiv(rbSum(r,'qty'), rbDistinct(r,'pur')));
  defM('lines_per_purchase',GP,'میانگین ردیف در هر سفارش خرید','num',['pl'],(r)=>rbDiv(r.length, rbDistinct(r,'pur')));
  defM('unpaid_purchases',GP,'تعداد سفارش‌های خرید دارای بدهی','num',['pl'],(r)=>rbDistinct(r.filter(x=>x.v.unpaid),'pur'));
  defM('paid_pct',GP,'درصد پرداخت‌شده از خرید ٪','pct',['pl'],(r)=>rbDiv(rbSum(r,'paid'), rbSum(r,'spend'))*100);
  defM('distinct_products_bought',GP,'تعداد کالای متفاوت خریداری‌شده','num',['pl'],(r)=>rbDistinct(r,'pid'));
  defM('distinct_suppliers',GP,'تعداد تامین‌کننده‌ی متفاوت','num',['pl'],(r)=>{ const s = new Set(); r.forEach(x=>((x.d.store)||[]).forEach(b=>{ if(b) s.add(b); })); return s.size; });
  const perP = (r,f)=>{ const m = new Map(); r.forEach(x=>m.set(x.pur,(m.get(x.pur)||0)+(x.v[f]||0))); return [...m.values()]; };
  defM('max_purchase',GP,'بزرگ‌ترین سفارش خرید','money',['pl'],(r)=>{ const a = perP(r,'spend'); return a.length ? Math.max.apply(null,a) : 0; });
  defM('min_purchase',GP,'کوچک‌ترین سفارش خرید','money',['pl'],(r)=>{ const a = perP(r,'spend'); return a.length ? Math.min.apply(null,a) : 0; });
  const GI='📦 تحلیل انبار';
  defM('products_with_stock',GI,'تعداد کالای دارای موجودی','num',['pr'],(r)=>rbSum(r,'has_stock'));
  defM('avg_stock_per_product',GI,'میانگین موجودی هر کالا','num',['pr'],(r)=>rbDiv(rbSum(r,'stock'), r.length));
  defM('max_stock',GI,'بیشترین موجودیِ یک کالا','num',['pr'],(r)=>r.length ? Math.max.apply(null,r.map(x=>x.v.stock)) : 0);
  defM('products_no_price',GI,'تعداد کالای بدون قیمت فروش','num',['pr'],(r)=>rbSum(r,'no_price'));
  defM('price_set_pct',GI,'درصد کالاهای دارای قیمت فروش ٪','pct',['pr'],(r)=>rbDiv(rbSum(r,'has_price'), r.length)*100);
  defM('low_stock_pct',GI,'درصد کالاهای کم‌موجودی ٪','pct',['pr'],(r)=>rbDiv(rbSum(r,'low'), r.length)*100);
  defM('out_of_stock_pct',GI,'درصد کالاهای ناموجود ٪','pct',['pr'],(r)=>rbDiv(rbSum(r,'out'), r.length)*100);
  defM('dead_stock_pct',GI,'سهم موجودی راکد از ارزش موجودی ٪','pct',['pr'],(r)=>rbDiv(rbSum(r,'dead_value'), rbSum(r,'value'))*100);
  defM('stock_value_share',GI,'سهم از کل ارزش موجودی ٪','pct',['pr'],(r,c)=>rbDiv(rbSum(r,'value'), rbSum((c.base||c.pool).filter(x=>x.k==='pr'),'value'))*100);
  const GR='↩️ تحلیل مرجوعی';
  defM('avg_return_value',GR,'میانگین ارزش هر مرجوعی','money',['rt'],(r)=>rbDiv(rbSum(r,'value'), rbDistinct(r,'rid')));
  defM('restock_pct',GR,'درصد مرجوعیِ برگشته به انبار ٪','pct',['rt'],(r)=>rbDiv(rbSum(r,'restock'), rbSum(r,'qty'))*100);
  defM('cash_refund_pct',GR,'درصد بازگشت نقدی از مبلغ مرجوعی ٪','pct',['rt'],(r)=>rbDiv(rbSum(r,'cash'), rbSum(r,'total'))*100);
  const GE='💸 تحلیل هزینه و صندوق';
  defM('largest_expense',GE,'بزرگ‌ترین هزینه','money',['ex'],(r)=>{ const a = r.filter(x=>x.v.is_exp).map(x=>x.v.amount); return a.length ? Math.max.apply(null,a) : 0; });
  defM('expenses_per_day',GE,'میانگین هزینه‌ی روزانه (روی کل روزهای بازه)','money',['ex'],(r,c)=>rbDiv(rbSum(r,'amount'), (c&&c.days)||1));
  defM('expense_share',GE,'سهم از کل هزینه‌ها ٪','pct',['ex'],(r,c)=>rbDiv(rbSum(r,'amount'), rbSum((c.base||c.pool).filter(isEX),'amount'))*100);
  defM('cash_txn_count',GE,'تعداد گردش‌های صندوق','num',['cl'],(r)=>r.length);
  defM('avg_cash_in',GE,'میانگین هر ورودی صندوق','money',['cl'],(r)=>{ const w = r.filter(x=>x.v.in>0); return rbDiv(rbSum(w,'in'), w.length); });
  defM('avg_cash_out',GE,'میانگین هر خروجی صندوق','money',['cl'],(r)=>{ const w = r.filter(x=>x.v.out>0); return rbDiv(rbSum(w,'out'), w.length); });
  defM('largest_outflow',GE,'بزرگ‌ترین خروجی صندوق','money',['cl'],(r)=>r.length ? Math.max.apply(null,r.map(x=>x.v.out)) : 0);
  defM('largest_inflow',GE,'بزرگ‌ترین ورودی صندوق','money',['cl'],(r)=>r.length ? Math.max.apply(null,r.map(x=>x.v.in)) : 0);
  const GN='🧑‍💼 تحلیل نماینده، مشتری و تامین‌کننده';
  defM('commission_per_order',GN,'میانگین پورسانت هر فاکتور','money',['sl'],(r)=>rbDiv(rbSum(r,'commission'), rbDistinct(r.filter(x=>x.v.has_agent),'sid')));
  defM('payout_avg',GN,'میانگین هر پرداخت پورسانت','money',['po'],(r)=>rbDiv(rbSum(r,'amount'), r.length));
  defM('payout_pct',GN,'درصد پرداخت‌شده از پورسانت محاسبه‌شده ٪','pct',['ag'],(r)=>rbDiv(rbSum(r,'paid'), rbSum(r,'accrued'))*100);
  defM('debtors_pct',GN,'درصد مشتریان بدهکار ٪','pct',['cu'],(r)=>rbDiv(r.filter(x=>x.v.outstanding>0.0001).length, r.length)*100);
  defM('max_customer_debt',GN,'بیشترین بدهی یک مشتری','money',['cu'],(r)=>r.length ? Math.max.apply(null,r.map(x=>x.v.outstanding)) : 0);
  defM('avg_store_payable',GN,'میانگین بدهی به هر تامین‌کننده','money',['st'],(r)=>rbDiv(rbSum(r,'payable'), r.length));
  defM('avg_store_ship',GN,'میانگین هزینه ارسال تامین‌کننده‌ها','money',['st'],(r)=>rbDiv(rbSum(r,'ship'), r.length));
  defM('pe_stores',GN,'تعداد تامین‌کننده‌های دارای قیمت لیست','num',['pe'],(r)=>{ const s = new Set(); r.forEach(x=>((x.d.store)||[]).forEach(b=>{ if(b) s.add(b); })); return s.size; });
  defM('pe_items',GN,'تعداد کالا/گروهِ قیمت‌گذاری‌شده','num',['pe'],(r)=>{ const s = new Set(); r.forEach(x=>((x.d.product)||[]).forEach(b=>s.add(b))); return s.size; });
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
  jyear:['revenue','profit'], jmonth:['revenue','profit','sales_count'], season:['revenue','profit','sales_count'], month_part:['sales_count','revenue'], cust_status:['sales_count','revenue','profit'], order_size:['sales_count','revenue','profit'], disc_flag:['sales_count','revenue','profit'], profit_sign:['sale_lines','revenue','profit'], margin_band:['sale_lines','revenue','profit'], tax_flag:['sales_count','revenue','tax_collected'], stock_status:['products_count','stock_units','stock_value'], ever_sold:['products_count','stock_units','stock_value'], price_state:['products_count','stock_units','stock_value'],
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
  const t0 = RB_TRACE ? RB_TRACE.length : 0;
  if(RB_TRACE) RB_TRACE.push({t:'ms', id:m.id, n:r.length});
  let out = 0;
  try{ const v = m.fn(r, ctx); out = isFinite(v) ? v : 0; }catch(e){ console.warn('[rb] metric failed', m.id, e); out = 0; }
  if(RB_TRACE){ if(!RB_TRACE.slice(t0).some(x=>x.t==='sum'||x.t==='cnt'||x.t==='max'||x.t==='note')) RB_TRACE.push({t:'note', f:'ردیف‌های مصرف‌شده در این متغیر ('+m.kinds.map(k=>RB_KIND_FA[k]||k).join('، ')+')', n:r.length, v:out, rows:r}); RB_TRACE.push({t:'me', id:m.id, v:out}); }
  return out;
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
  if(!RB.metrics.length){ out.innerHTML = '<div class="rb-result"><div class="parts-table-empty rb-blank"><div style="font-size:38px;">🧮</div><b>هنوز چیزی برای نمایش انتخاب نشده</b><br>یکی از «شروع سریع»‌های بالا را بزن، یا در مرحله‌ی ۱ حداقل یک متغیر (مثلاً فروش یا سود) انتخاب کن؛ بعد در مرحله‌ی ۲ بگو نتیجه به تفکیک چه چیزی باشد.</div></div>'; return; }
  { const pe = rbExprParse(RB.where.items); if(!pe.ok){ out.innerHTML = '<div class="rb-result"><div class="parts-table-empty rb-blank" style="color:var(--coral);"><div style="font-size:30px;">⚠</div><b>پرانتزهای شرط‌ها درست نیست</b><br>'+escHtml(pe.err)+' در بخش «کدام داده‌ها وارد محاسبه شوند؟» پرانتزها را اصلاح کن.</div></div>'; return; } }
  const res = rbCompute();
  RB_LAST = res;
  rbChartInstance = rbPaint(out, res, {});
  out.insertAdjacentHTML('afterbegin', rbResultToolbar(res));
}

// ── Controls ───────────────────────────────────────
const RB_DIM_GROUPS = [
  ['⏱️ زمان', ['time','weekday','jyear','yseason','ym','jmonth','season','month_part','jday']],
  ['📦 کالا و گروه‌ها', ['product','brand','car_model','group','group_leaf','group_l1','group_l2','group_l3','variant','oem','bundle']],
  ['👥 فروش و مشتری', ['customer','cust_status','agent','sale','order_size','qty_band','disc_flag','discount_band','profit_sign','margin_band','price_vs_list','has_return','tax_flag','ship_mode','delivery','pay_status','bundle_role']],
  ['📥 خرید و تامین‌کننده', ['store','purchase','store_debt','free_ship_state']],
  ['🏬 وضعیت انبار و کالا', ['stock_status','stock_band','ever_sold','price_state','list_margin_band','reorder_state','price_source']],
  ['👤 حساب مشتری‌ها', ['debt_state']],
  ['↩️ مرجوعی، هزینه و صندوق', ['return_reason','restock_flag','refund_kind','expense_category','cash_type','cash_dir']],
  ['🧮 جمع کل', ['all']],
];
const RB_DIM_HELP = {
  time:'نتیجه را در دوره‌های روزانه تا سالانه می‌بینی (تنظیم دوره در کارت «بازه‌ی زمانی»).', weekday:'شنبه تا جمعه؛ برای فهمیدن پرفروش‌ترین روزهای هفته.',
  jyear:'هر سال شمسی یک ردیف.', jmonth:'فروردین تا اسفند، با جمعِ همه‌ی سال‌ها؛ برای فهمیدن ماه‌های پررونق.', season:'بهار تا زمستان با جمعِ همه‌ی سال‌ها.', month_part:'اول، میانه و آخر ماه؛ مثلاً آیا آخر ماه بیشتر می‌فروشی؟',
  cust_status:'فاکتورِ اولِ هر مشتریِ ثبت‌شده «جدید» است و فاکتورهای بعدی «قدیمی».', order_size:'فاکتورها بر اساس مبلغ در پنج دسته: کم تا درشت.', disc_flag:'فاکتورهای با تخفیف در برابر بدون تخفیف.',
  profit_sign:'ردیف‌های سودده، زیان‌ده و بدون سود.', margin_band:'ردیف‌ها بر اساس درصد حاشیه سودشان دسته‌بندی می‌شوند.', tax_flag:'فاکتورهای دارای مالیات در برابر بدون مالیات.',
  stock_status:'کالاها بر اساس ناموجود / کم‌موجودی / عادی.', ever_sold:'کالاهایی که تا حالا حتی یک‌بار فروخته نشده‌اند (موجودی راکد).', price_state:'کالاهایی که قیمت فروش دارند یا هنوز قیمت‌گذاری نشده‌اند.'
};
function rbDimHelp(dim){ const D = RB_DIMS[dim]; if(!D) return ''; return RB_DIM_HELP[dim] || D.note || ''; }
function rbDimOptionsHtml(selected, metricIds, withNone, exclude){
  const one = k=>{
    const v = RB_DIMS[k]; if(!v || (withNone && k==='all') || k===exclude) return '';
    const ok = rbDimOk(k, metricIds);
    return `<option value="${k}"${k===selected?' selected':''}${ok?'':' disabled'}>${v.label}${ok?'':' — با متغیرهای انتخابی سازگار نیست'}</option>`;
  };
  const used = new Set(); let html = '';
  RB_DIM_GROUPS.forEach(([t, ks])=>{ ks.forEach(k=>used.add(k)); const inner = ks.map(one).join(''); if(inner) html += `<optgroup label="${escHtml(t)}">${inner}</optgroup>`; });
  const rest = Object.keys(RB_DIMS).filter(k=>!used.has(k)).map(one).join(''); if(rest) html += `<optgroup label="سایر">${rest}</optgroup>`;
  return (withNone ? `<option value=""${selected?'':' selected'}>— بدون گروه‌بندی دوم —</option>` : '') + html;
}

let RB_MCAT = '';
function rbPickMcat(g){ RB_MCAT = (RB_MCAT===g) ? '' : g; rbRenderMetricPanel(); }
function rbClearMetrics(){ RB.metrics = []; rbWriteControls(); const p = document.getElementById('rbMetricPanel'); if(p && p.style.display!=='none') rbRenderMetricPanel(); rbRender(); }
function rbRenderMetricPanel(){
  const list = document.getElementById('rbMetricList'); if(!list) return;
  const q = (document.getElementById('rbMetricSearch').value||'').trim();
  const ok = new Set(rbMetricsFor(RB.dim, RB.dim2).map(m=>m.id));
  const all = Object.values(RB_METRICS);
  const cats = {}; all.forEach(m=>{ const c = cats[m.group] = cats[m.group] || {n:0, ok:0, sel:0}; c.n++; if(ok.has(m.id)) c.ok++; if(RB.metrics.includes(m.id)) c.sel++; });
  const catEl = document.getElementById('rbMetricCats');
  if(catEl) catEl.innerHTML = `<button type="button" class="rbx-cat${RB_MCAT?'':' on'}" onclick="rbPickMcat('')">همه <small>${fx(all.length)}</small></button>` + Object.entries(cats).map(([g,c])=>`<button type="button" class="rbx-cat${RB_MCAT===g?' on':''}${c.ok?'':' off'}" onclick="rbPickMcat('${rbQ(g)}')">${escHtml(g)} <small>${fx(c.ok)}${c.sel?' · ✓'+fx(c.sel):''}</small></button>`).join('');
  const items = all.filter(m=>(!RB_MCAT || m.group===RB_MCAT) && (!q || m.label.includes(q) || m.group.includes(q) || (m.hint||'').includes(q) || (RB_EN[m.id]||'').toLowerCase().includes(q.toLowerCase())));
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
  if(RB_FIXED[dim]) return RB_FIXED[dim].map(x=>({key:x[0], label:x[1]}));
  const set = new Set();
  rbFacts.forEach(f=>{ const k = rbDimKeys(f, dim); if(k) k.forEach(x=>{ if(dim==='group' && String(x).startsWith('p:')) return; set.add(String(x)); }); });
  if(dim==='group'){ const ord = ptgRowOrder(); return [...set].map(k=>({key:k, label:dimKeyLabel(dim,k)})).sort((a,b)=>(ord.get(a.key) ?? 1e9)-(ord.get(b.key) ?? 1e9)); }
  return [...set].map(k=>({key:k, label:dimKeyLabel(dim,k)})).sort(rbDimCmp(dim));
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
// میانگینِ مجموعه‌ی خالی تعریف‌نشده است (نه صفر): کالای بدون قیمت، «قیمت فروش < ۳۰۰» نیست
function rbCondDefined(mid, rows){
  if(!/^avg_/.test(mid)) return true;
  if(!rows.length) return false;
  if(mid==='avg_list_price') return rows.some(x=>x.v.has_price);
  if(mid==='avg_customer_debt') return rows.some(x=>x.v.outstanding>0.0001);
  return true;
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
const RB_TXT_DIMS = ['product','customer','store','brand','car_model','variant','oem','agent','bundle','group_leaf','expense_category','return_reason','delivery'];
const RB_ROW_FIELDS = {
  qty:['تعداد در ردیف',0], net_qty:['تعداد خالص ردیف فروش (پس از مرجوعی)',0], gross:['فروش ناخالص ردیف',1], item_disc:['تخفیف ردیف',1], item_rev:['درآمد کالای ردیف',1], revenue:['درآمد ردیف',1],
  cogs:['بهای تمام‌شده‌ی ردیف',1], profit:['سود ردیف',1], inv_total:['سهم ردیف از مبلغ فاکتور',1], outstanding:['سهم ردیف از مانده‌ی طلب',1], received:['سهم ردیف از دریافتی',1],
  commission:['پورسانت ردیف',1], spend:['مبلغ ردیف خرید',1], paid:['پرداخت‌شده‌ی ردیف خرید',1], value:['ارزش (ردیف مرجوعی / ارزش موجودی کالا)',1], amount:['مبلغ (هزینه / پرداخت پورسانت)',1],
  amt:['مبلغ گردش صندوق (±)',1], stock:['موجودی کالا',0], sale_price:['قیمت فروش کالا',1], avg_cost:['میانگین بهای کالا',1], price:['قیمت لیست‌شده',1], reorder:['نقطه سفارش کالا',0]
};
function rbNorm(t){ return String(t||'').replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[\u200c\u200f\u200e]/g,' ').replace(/\s+/g,' ').trim().toLowerCase(); }
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
  if(n.t==='txt'){
    if(!RB_TXT_DIMS.includes(n.dim)) return null;
    return {t:'txt', dim:n.dim, op:n.op==='nohas' ? 'nohas' : 'has', text:String(n.text||'').slice(0,80)};
  }
  if(n.t==='dt'){
    const iso = v=>(typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? v : '';
    return {t:'dt', op:n.op==='out' ? 'out' : 'in', from:iso(n.from), to:iso(n.to)};
  }
  if(n.t==='row'){
    if(!RB_ROW_FIELDS[n.field]) return null;
    return {t:'row', field:n.field, op:RB_NUM_OPS[n.op] ? n.op : 'ge', v1:n.v1===undefined||n.v1===null ? '' : String(n.v1), v2:n.v2===undefined||n.v2===null ? '' : String(n.v2)};
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
  group:{label:'گروه کالا (با زیرگروه‌ها)', noun:'گروهی', ex:'مثلاً «گروه‌هایی که سودشان بیش از KT ۵۰۰ است»؛ هر گروه شاملِ همه‌ی زیرگروه‌هایش حساب می‌شود', vars:{
    '💰 فروش':[['units_sold','تعداد فروخته‌شده (خالص)'],['revenue','درآمد فروش'],['profit','سود ناخالص'],['margin_pct','حاشیه سود ٪'],['revenue_share','سهم از کل درآمد ٪'],['distinct_products_sold','تعداد کالای متفاوتِ فروخته‌شده']],
    '📥 خرید':[['units_purchased','تعداد خریداری‌شده'],['purchase_spend','مبلغ خرید']],
    '📦 موجودی':[['products_count','تعداد کالا'],['stock_units','موجودی (تعداد)'],['stock_value','ارزش موجودی']]}},
  brand:{label:'برند', noun:'برندی', ex:'مثلاً «برندهایی که بیش از KT ۱۰۰۰ فروش داشته‌اند»', vars:{
    '💰 فروش':[['units_sold','تعداد فروخته‌شده (خالص)'],['revenue','درآمد فروش'],['profit','سود ناخالص'],['margin_pct','حاشیه سود ٪'],['distinct_products_sold','تعداد کالای متفاوتِ فروخته‌شده']],
    '📥 خرید':[['units_purchased','تعداد خریداری‌شده'],['purchase_spend','مبلغ خرید']],
    '📦 موجودی':[['products_count','تعداد کالا'],['stock_units','موجودی (تعداد)'],['stock_value','ارزش موجودی']]}},
  car_model:{label:'مدل خودرو', noun:'مدلی', ex:'مثلاً «مدل‌هایی که سودشان کمتر از KT ۲۰۰ است»', vars:{
    '💰 فروش':[['units_sold','تعداد فروخته‌شده (خالص)'],['revenue','درآمد فروش'],['profit','سود ناخالص'],['margin_pct','حاشیه سود ٪']],
    '📥 خرید':[['units_purchased','تعداد خریداری‌شده'],['purchase_spend','مبلغ خرید']],
    '📦 موجودی':[['products_count','تعداد کالا'],['stock_units','موجودی (تعداد)'],['stock_value','ارزش موجودی']]}},
  customer:{label:'مشتری', noun:'مشتری‌ای', ex:'مثلاً «مشتری‌هایی که بیش از ۳ فاکتور داشته‌اند» یا «مشتری‌هایی که بیش از KT ۵۰۰ بدهکارند»', vars:{
    '💰 خرید مشتری از ما':[['sales_count','تعداد فاکتور'],['units_sold','تعداد کالای خریده‌شده'],['revenue','درآمد حاصل از او'],['profit','سود حاصل از او'],['avg_order_value','میانگین مبلغ هر فاکتور'],['discount_total','مجموع تخفیف گرفته‌شده']],
    '💳 حساب':[['amount_received','مبلغ پرداخت‌شده'],['amount_outstanding','مانده‌ی بدهی (نسیه)']],
    '↩️ مرجوعی':[['returns_count','تعداد مرجوعی'],['returned_total','مبلغ مرجوعی'],['return_rate','نرخ مرجوعی ٪']]}},
  store:{label:'تامین‌کننده', noun:'تامین‌کننده‌ای', ex:'مثلاً «تامین‌کننده‌هایی که بیش از KT ۲۰۰۰ از آن‌ها خریده‌ام» یا «بدهی‌ام به او > ۰»', vars:{
    '📥 خرید از او':[['purchases_count','تعداد سفارش خرید'],['units_purchased','تعداد خریداری‌شده'],['purchase_spend','مبلغ خرید'],['avg_purchase_value','میانگین مبلغ هر سفارش'],['paid_to_suppliers','پرداخت‌شده به او'],['purchase_outstanding','بدهی (پرداخت‌نشده)']],
    '🏷️ لیست قیمت او':[['pe_count','تعداد قیمت‌های ثبت‌شده'],['pe_avg','میانگین قیمت لیست‌شده'],['pe_min','کمترین قیمت لیست‌شده'],['pe_max','بیشترین قیمت لیست‌شده']]}},
  agent:{label:'نماینده فروش', noun:'نماینده‌ای', ex:'مثلاً «نماینده‌هایی که بیش از ۱۰ فاکتور آورده‌اند»', vars:{
    '💰 فروش او':[['agent_orders','تعداد فاکتورها'],['revenue','درآمد فروش'],['profit','سود ناخالص'],['avg_order_value','میانگین مبلغ هر فاکتور']],
    '🎁 پورسانت':[['commission','پورسانت محاسبه‌شده'],['payouts_total','پورسانت پرداخت‌شده'],['agent_payable','پورسانت باقی‌مانده']]}},
  sale:{label:'فاکتور فروش', noun:'فاکتوری', ex:'مثلاً «فاکتورهایی که مبلغشان بیش از KT ۱۰۰۰ است» یا «فاکتورهایی که سودشان منفی است»', vars:{
    '💰 مبلغ و سود':[['invoice_total','مبلغ فاکتور (با ارسال و مالیات)'],['revenue','درآمد فروش'],['profit','سود ناخالص'],['margin_pct','حاشیه سود ٪']],
    '🛒 اقلام':[['units_sold','تعداد کل کالا'],['distinct_products_sold','تعداد کالای متفاوت']],
    '🏷️ تخفیف و حساب':[['discount_total','مجموع تخفیف'],['discount_pct','درصد تخفیف ٪'],['amount_outstanding','مانده‌ی بدهی (نسیه)'],['ship_paid','ارسال پرداختی']]}},
  bundle:{label:'باندل / جایزه', noun:'باندلی', ex:'مثلاً «باندل‌هایی که بیش از ۵ فاکتور داشته‌اند» یا «باندل‌هایی که تخفیفشان از سودشان بیشتر است»', vars:{
    '🎁 استفاده':[['bundle_orders','تعداد فاکتورها'],['units_sold','تعداد کالای فروخته‌شده'],['bundle_revenue','درآمد ردیف‌ها']],
    '💸 هزینه و سود':[['bundle_discount','تخفیف ثبت‌شده'],['reward_cost','بهای جایزه‌های داده‌شده'],['profit','سود ناخالص']]}},
  purchase:{label:'سفارش خرید', noun:'سفارشی', ex:'مثلاً «سفارش‌هایی که مبلغشان بیش از KT ۵۰۰ است»', vars:{
    '📥 سفارش':[['purchase_spend','مبلغ سفارش'],['units_purchased','تعداد کالا'],['paid_to_suppliers','پرداخت‌شده'],['purchase_outstanding','پرداخت‌نشده']]}},
};
// متغیرهای قیمت و موجودی که به‌طور مشترک برای همه‌ی موجودیت‌های عددی (کالا، برند، مدل خودرو، …) قابل استفاده‌اند
Object.values(RB_NUM_ENT).forEach(E=>{
  const g = E.vars['📦 موجودی']; if(!g) return;
  const have = new Set(g.map(x=>x[0]));
  [['avg_list_price','قیمت فروشِ تعیین‌شده (میانگین)'],['avg_stock_cost','میانگین قیمت خریدِ موجودی'],['potential_sales','ارزش بالقوه‌ی فروشِ موجودی'],['potential_profit','سود بالقوه‌ی موجودی']].forEach(x=>{ if(!have.has(x[0]) && RB_METRICS[x[0]]) g.push(x); });
});

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
  const fxu = x=>(v && v.m.unit==='money') ? '\u2066'+fx(x)+' KT\u2069' : fx(x)+u;
  const num = a===null ? '؟' : fxu(a), num2 = b===null ? '؟' : fxu(b);
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
    groups.forEach((rows, k)=>{ const v = rbEval(m, rows, {pool:rows, base:rows, end:to, days:rbDays(from, to)}); if(rbCondDefined(n.mid, rows) && rbNumPass(v, n.op, a, b)) out.add(k); });
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
  if(n.t==='txt'){
    if(!env.ok(n.dim)){ env.warn.push('شرط متنی روی «'+rbDimLabelPlain(n.dim)+'» با متغیرهای انتخاب‌شده سازگار نیست و نادیده گرفته شد.'); return null; }
    const q = rbNorm(n.text), dim = n.dim, notin = n.op==='nohas', cache = new Map();
    const lab = k=>{ let v = cache.get(k); if(v===undefined){ v = rbNorm(dimKeyLabel(dim, k)); cache.set(k, v); } return v; };
    return f=>{ const ks = rbDimKeys(f, dim); const hit = !!ks && ks.some(k=>lab(String(k)).includes(q)); return notin ? !hit : hit; };
  }
  if(n.t==='dt'){
    const from = n.from, to = n.to, out = n.op==='out';
    return f=>{ if(!f.date) return true; const hit = (!from || f.date>=from) && (!to || f.date<=to); return out ? !hit : hit; };
  }
  if(n.t==='row'){
    const a = rbParseNum(n.v1), b = rbParseNum(n.v2), fld = n.field, op = n.op;
    return f=>{ const x = f.v ? f.v[fld] : undefined; if(x===undefined || x===null) return true; return rbNumPass(x, op, a, b); };
  }
  return null;
}
function rbNodeActive(n){
  if(!n) return false;
  if(n.t==='txt') return rbNorm(n.text).length > 0;
  if(n.t==='dt') return !!(n.from || n.to);
  if(n.t==='row') return rbParseNum(n.v1)!==null && (n.op!=='between' || rbParseNum(n.v2)!==null);
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
  if(n.t==='txt') return rbNorm(n.text) ? `${rbDimLabelPlain(n.dim)} ${n.op==='nohas' ? 'شامل' : 'شامل'} «${n.text}» ${n.op==='nohas' ? 'نباشد' : 'باشد'}` : '';
  if(n.t==='dt') return (n.from || n.to) ? `تاریخ ${n.op==='out' ? 'خارج از' : 'داخل'} بازه‌ی ${n.from ? jShort(n.from) : 'ابتدا'} تا ${n.to ? jShort(n.to) : 'امروز'}` : '';
  if(n.t==='row'){ const a = rbParseNum(n.v1), b = rbParseNum(n.v2), F = RB_ROW_FIELDS[n.field]; if(!F || a===null || (n.op==='between' && b===null)) return ''; return `«${F[0]}» ${RB_OP_SHORT[n.op]} ${F[1] ? ((n.op==='between' ? '\u2066'+fx(a)+' تا '+fx(b)+' KT\u2069' : '\u2066'+fx(a)+' KT\u2069')) : (n.op==='between' ? fx(a)+' تا '+fx(b) : fx(a))}`; }
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
  else k.sort(rbDimCmp(d2));
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
    else res.rows.sort(rbDimCmp(dim));
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
let RB_OPEN = {quick:true, measures:true, group:true, where:true, time:false, view:false};
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
  rbRenderQuick();
  [['rbDimHelp',RB.dim],['rbDim2Help',RB.dim2]].forEach(([id,d])=>{ const e = g(id); if(e) e.textContent = d ? rbDimHelp(d) : ''; });
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
function rbTxtHtml(n, i){
  const dims = RB_TXT_DIMS.map(d=>{ const ok = rbDimOk(d, RB.metrics); return `<option value="${d}"${d===n.dim?' selected':''}${ok||d===n.dim?'':' disabled'}>${escHtml(rbDimLabelPlain(d))}${ok?'':' (ناسازگار)'}</option>`; }).join('');
  return `<div class="rbx-cond txt"><div class="rbx-line"><span class="rbx-tag txt">متن</span>
    ${rbCap('کدام نام؟', `<select class="modal-input" onchange="rbWSet(${i},'dim',this.value)">${dims}</select>`)}
    ${rbCap('حالت', `<select class="modal-input rbx-op" onchange="rbWSet(${i},'op',this.value)"><option value="has"${n.op==='has'?' selected':''}>شامل این متن باشد</option><option value="nohas"${n.op==='nohas'?' selected':''}>شامل این متن نباشد</option></select>`)}
    ${rbCap('متن (بخشی از نام کافی است)', `<input type="text" class="modal-input" dir="auto" placeholder="مثلاً: رله، سمند، بوش…" value="${escHtml(n.text||'')}" onchange="rbWSet(${i},'text',this.value)"/>`, 'rbx-grow')}
  </div><div class="rb-muted" style="font-size:11px;margin-top:4px;">مثلاً «کالا شامل رله باشد» همه‌ی کالاهایی که «رله» در نامشان هست را می‌آورد؛ حروف عربی و فارسی یکی حساب می‌شوند.</div></div>`;
}
function rbDtHtml(n, i){
  const dj = (iso, ph, f)=>pjdpInput('', iso, `placeholder="${ph}" onchange="rbWSet(${i},'${f}',this.value)"`).replace('class="modal-input pjdp-in"','class="modal-input rbx-date"');
  return `<div class="rbx-cond dt"><div class="rbx-line"><span class="rbx-tag dt">تاریخ</span>
    ${rbCap('حالت', `<select class="modal-input rbx-op" onchange="rbWSet(${i},'op',this.value)"><option value="in"${n.op==='in'?' selected':''}>فقط داخل این بازه</option><option value="out"${n.op==='out'?' selected':''}>خارج از این بازه</option></select>`)}
    ${rbCap('از تاریخ', dj(n.from,'ابتدا','from'))}${rbCap('تا تاریخ', dj(n.to,'امروز','to'))}
  </div><div class="rb-muted" style="font-size:11px;margin-top:4px;">برای ترکیبِ چند بازه‌ی جدا (مثلاً «مهر یا فروردین») چند شرط تاریخ بگذار و بینشان «یا» را بزن. ردیف‌های بی‌تاریخ (مثل موجودی) همیشه می‌مانند.</div></div>`;
}
function rbRowHtml(n, i){
  const F = RB_ROW_FIELDS[n.field] || ['',0], between = n.op==='between';
  const fields = Object.entries(RB_ROW_FIELDS).map(([k,v])=>`<option value="${k}"${k===n.field?' selected':''}>${escHtml(v[0])}</option>`).join('');
  return `<div class="rbx-cond row"><div class="rbx-line"><span class="rbx-tag row">ردیف</span>
    ${rbCap('کدام مقدارِ ردیف؟', `<select class="modal-input" onchange="rbWSet(${i},'field',this.value)">${fields}</select>`, 'rbx-grow')}
    ${rbCap('مقایسه', `<select class="modal-input rbx-op" onchange="rbWSet(${i},'op',this.value)">${Object.entries(RB_NUM_OPS).map(([k,t])=>`<option value="${k}"${k===n.op?' selected':''}>${t}</option>`).join('')}</select>`)}
    ${rbCap(between?'از':'با عدد', `<input type="text" class="modal-input rbx-num-in" inputmode="decimal" dir="ltr" value="${escHtml(n.v1)}" onchange="rbWSet(${i},'v1',this.value)"/>`)}
    ${between ? rbCap('تا', `<input type="text" class="modal-input rbx-num-in" inputmode="decimal" dir="ltr" value="${escHtml(n.v2)}" onchange="rbWSet(${i},'v2',this.value)"/>`) : ''}
    ${F[1] ? '<span class="rbx-unit">KT</span>' : ''}
  </div><div class="rb-muted" style="font-size:11px;margin-top:4px;">این شرط روی «هر ردیفِ خام» (نه روی مجموع یک کالا/مشتری) اعمال می‌شود؛ مثلاً «ردیف‌های فروش با سود کمتر از ۰». ردیف‌هایی که این مقدار را ندارند (مثلاً هزینه‌ها برای «تعداد») بدون تغییر می‌مانند.</div></div>`;
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
  if(n.t==='txt') return `${rbDimLabelPlain(n.dim)} ${n.op==='nohas' ? '∌' : '∋'} «${n.text}»`;
  if(n.t==='dt') return `تاریخ ${n.op==='out' ? '∉' : '∈'} [${n.from ? jShort(n.from) : '…'} تا ${n.to ? jShort(n.to) : '…'}]`;
  if(n.t==='row'){ const F = RB_ROW_FIELDS[n.field], sym = {gt:'>', ge:'≥', lt:'<', le:'≤', eq:'=', ne:'≠', between:'∈'}[n.op]||'?'; return `${F?F[0]:'؟'} ${sym} ${n.op==='between' ? '['+n.v1+' تا '+n.v2+']' : n.v1}`; }
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
    return `${lk}<div class="rbx-row"><span class="rbx-badge">${faDigits(i+1)}</span>${rbParBtn(i,'po',n)}<div class="rbx-rowcard">${n.t==='num' ? rbNumHtml(n,i) : (n.t==='txt' ? rbTxtHtml(n,i) : (n.t==='dt' ? rbDtHtml(n,i) : (n.t==='row' ? rbRowHtml(n,i) : rbAttrHtml(n,i))))}</div>${rbParBtn(i,'pc',n)}<button class="rbx-x" type="button" onclick="rbWDel(${i})" title="حذف این شرط">✕</button></div>`;
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
      <button type="button" class="rb-chip rb-chip-add" onclick="rbWAdd('num')">➕ شرط عددی <small>(فروش، قیمت، موجودی…)</small></button>
      <button type="button" class="rb-chip rb-chip-add" onclick="rbWAdd('txt')">➕ شرط متنی <small>(نام شامل…)</small></button>
      <button type="button" class="rb-chip rb-chip-add" onclick="rbWAdd('dt')">➕ شرط تاریخ <small>(بازه‌های جدا)</small></button>
      <button type="button" class="rb-chip rb-chip-add" onclick="rbWAdd('row')">➕ شرط روی مقدار ردیف <small>(تعداد، سود، تخفیف…)</small></button></div>` + rbQuickCondHtml();
  RB_SSIDS.forEach(id=>enhanceSearchSelect(id));
}
function rbWAfter(rerender){ if(rerender) rbRenderWhere(); rbMetaRefresh(); rbRender(); }
function rbWAdd(type){
  if(RB.where.items.length >= 40){ showToast('حداکثر ۴۰ شرط','error'); return; }
  if(type==='txt'){ RB.where.items.push({t:'txt', dim:RB_TXT_DIMS.find(d=>rbDimOk(d, RB.metrics)) || 'product', op:'has', text:'', lk:'and', po:0, pc:0}); }
  else if(type==='dt'){ RB.where.items.push({t:'dt', op:'in', from:'', to:'', lk:'and', po:0, pc:0}); }
  else if(type==='row'){ RB.where.items.push({t:'row', field:'revenue', op:'ge', v1:'', v2:'', lk:'and', po:0, pc:0}); }
  else if(type==='num'){
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
  if(field==='dim'){ n.dim = val; if(n.t==='attr') n.keys = []; else if(n.t==='num' && n.mid && !rbNumVar(val, n.mid)) n.mid = ''; rerender = true; }
  else if(field==='text'){ n.text = String(val).slice(0,80); rerender = true; }
  else if(field==='field'){ n.field = val; rerender = true; }
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
const PARTS_SUBS = ['home','products','stockview','kardex','carmodels','brands','parttypes','categories','genericitems','stores','agents','customers','pricelists','compare','purchase','quotes','sales','returns','expenses','cash','ledger','variables','reportbuilder','reports','calendar','productgroups','bundles'];
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
  if(name==='home') dshRender(true);
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

  list = slApply('products', list);
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
  slApply('carmodels',[...PARTS.car_models].sort((a,b)=>a.name.localeCompare(b.name))).forEach(cm=>{
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
  slApply('brands',[...PARTS.brands].sort((a,b)=>a.name.localeCompare(b.name))).forEach(b=>{
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
  slApply('parttypes',[...PARTS.part_types].sort((a,b)=>a.name.localeCompare(b.name))).forEach(t=>{
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
  slApply('categories',[...PARTS.categories].sort((a,b)=>a.name.localeCompare(b.name))).forEach(c=>{
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
  slApply('stores', PARTS.stores).forEach(s=>{
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
  slApply('agents', PARTS.sales_agents).forEach(a=>{
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
  slApply('customers', PARTS.customers).forEach(c=>{
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
  const sorted = slApply('quotes', [...PARTS.quotations].sort((a,b)=>(b.date||'').localeCompare(a.date||'')));
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
  const sorted = slApply('returns', [...PARTS.sale_returns].sort((a,b)=>(b.date||'').localeCompare(a.date||'')));
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
  const sorted = slApply('purchases', [...PARTS.purchases].sort((a,b)=>(b.order_date||'').localeCompare(a.order_date||'')));
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
  const sorted = slApply('sales', [...PARTS.sales].sort((a,b)=>(b.date||'').localeCompare(a.date||'')));
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
  slApply('generics', PARTS.generic_products).forEach(g=>{
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
  const sorted = slApply('expenses', [...PARTS.business_expenses].sort((a,b)=>(b.date||'').localeCompare(a.date||'')));
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
// ══════════════════════════════════════════════════════════════════
//  فاکتور / پیش‌فاکتور نسخه‌ی ۲ — ۵ ساختار × ۵ رنگ = ۲۵ قالب، چاپ از داخل iframe (فقط یک صفحه)
// ══════════════════════════════════════════════════════════════════
const INV_STYLES = [['classic','📜 کلاسیک'],['modern','🟦 مدرن'],['minimal','◽ مینیمال'],['elegant','✨ زرین'],['bold','🔶 پررنگ']];
const INV_COLORS = [
  ['ocean','آبی اقیانوسی','#1f6feb','#e8f1fe','#0b3d91'],
  ['emerald','سبز زمردی','#12a06a','#e4f6ed','#0a5c3d'],
  ['sunset','مرجانی غروب','#e85d3a','#fdede8','#8f2f14'],
  ['violet','بنفش سلطنتی','#7c4dde','#efe9fc','#46268f'],
  ['graphite','ذغالی','#374151','#eceef2','#111827']
];
let INV = {kind:'sale', id:null, style:'classic', color:'sunset'};
let invSaveT = null;
const invFa = n => faDigits(String(n));
const invMoney = k => invFa((Math.round((Number(k)||0)*1000)).toLocaleString('en-US'));   // KT → تومان کامل
function invItems(items){
  return (items||[]).map((it,i)=>{
    const p = productById(it.product_id) || {};
    const qty = Number(it.qty)||0, unit = Number(it.unit_price)||0, disc = Number(it.discount)||0;
    return {n:i+1, img:p.image||'', code:p.oem_code||'', name:productLabel(p), spec:productShortSpec(p), qty, unit, gross:qty*unit, disc, net:qty*unit-disc};
  });
}
function invData(kind, id){
  const bp = PARTS.business_profile || {};
  const base = {bp, kind};
  if(kind==='quote'){
    const q = PARTS.quotations.find(x=>x.id===id); if(!q) return null;
    const items = invItems(q.items), itemDisc = items.reduce((s,r)=>s+r.disc,0), sub = items.reduce((s,r)=>s+r.net,0);
    const ag = (q.agent_id && q.show_agent_on_invoice) ? agentById(q.agent_id) : null;
    const rows = [['جمع ردیف‌ها', items.reduce((s,r)=>s+r.gross,0)]];
    if(itemDisc>0) rows.push(['تخفیف ردیف‌ها', -itemDisc, 'neg']);
    rows.push(['جمع پس از تخفیف ردیف‌ها', sub, 'sub']);
    if(Number(q.discount)>0) rows.push(['تخفیف کلی', -Number(q.discount), 'neg']);
    if(Number(q.shipping_charged_to_customer)>0) rows.push(['هزینه ارسال', Number(q.shipping_charged_to_customer)]);
    if(Number(q.tax_percent)>0) rows.push(['مالیات ('+invFa(q.tax_percent)+'٪)', Number(q.tax_amount)||0]);
    return Object.assign(base,{title:'پیش‌فاکتور', noLabel:'شماره پیش‌فاکتور', no:q.quote_no, date:q.date, valid:q.valid_until,
      cust:{name:q.customer_name, phone:q.customer_phone, address:q.customer_address}, agent:ag, items, rows, grand:Number(q.invoice_total)||0, grandLabel:'جمع قابل پرداخت',
      delivery:'', notes:q.notes, pay:null, foot:'این یک پیش‌فاکتور است و قیمت‌ها تا '+(q.valid_until?jalaliDateFa(q.valid_until):'اطلاع ثانوی')+' معتبرند.'});
  }
  const s = PARTS.sales.find(x=>x.id===id); if(!s) return null;
  const items = invItems(s.items), itemDisc = items.reduce((r,x)=>r+x.disc,0), sub = items.reduce((r,x)=>r+x.net,0);
  const extra = Number(s.discount)||0, taxPct = Number(s.tax_percent)||0;
  const shC = Number(s.shipping_charged_to_customer), ship = isNaN(shC) ? (Number(s.shipping_cost)||0) : shC;
  const grand = Number(s.invoice_total)||0;
  const ag = (s.agent_id && s.show_agent_on_invoice) ? agentById(s.agent_id) : null;
  const rows = [['جمع ردیف‌ها', items.reduce((r,x)=>r+x.gross,0)]];
  if(itemDisc>0) rows.push(['تخفیف ردیف‌ها', -itemDisc, 'neg']);
  rows.push(['جمع پس از تخفیف ردیف‌ها', sub, 'sub']);
  if(extra>0) rows.push(['تخفیف کلی فاکتور', -extra, 'neg']);
  if(ship>0) rows.push(['هزینه ارسال', ship]);
  if(taxPct>0) rows.push(['مالیات ('+invFa(taxPct)+'٪)', Number(s.tax_amount)||0]);
  let pay = null;
  const st = s.payment_status;
  if(st==='unpaid') pay = {paid:0, due:grand};
  else if(st==='partial'){ const pd = Math.min(Number(s.amount_paid)||0, grand); pay = {paid:pd, due:grand-pd}; }
  const dm = s.delivery_method ? ('روش تحویل: '+s.delivery_method+(isPickupMethod(s.delivery_method)?'':s.shipping_payer==='split'?' (هزینه ارسال بین طرفین تقسیم شده)':(s.shipping_payer==='business'?' (ارسال رایگان)':''))) : '';
  return Object.assign(base,{title:'فاکتور فروش', noLabel:'شماره فاکتور', no:s.invoice_no, date:s.date, valid:'',
    cust:{name:s.customer_name, phone:s.customer_phone, address:s.customer_address}, agent:ag, items, rows, grand, grandLabel:'مبلغ نهایی قابل پرداخت',
    delivery:dm, notes:s.notes, pay, foot:''});
}
function invCss(color){
  const c = INV_COLORS.find(x=>x[0]===color) || INV_COLORS[2];
  return `:root{--c:${c[2]};--t:${c[3]};--d:${c[4]};}
*{box-sizing:border-box;margin:0;padding:0;}
html,body{background:#fff;}
body{font-family:'Vazirmatn',Tahoma,sans-serif;color:#1d2330;font-size:11.5px;line-height:1.65;direction:rtl;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.page{width:794px;margin:0 auto;padding:30px 34px 26px;background:#fff;min-height:1123px;display:flex;flex-direction:column;}
.grow{flex:1;}
img.logo{max-width:92px;max-height:72px;object-fit:contain;display:block;}
.biz-n{font-weight:800;font-size:19px;}
.biz-m{font-size:10.5px;opacity:.85;}
.ttl{font-weight:800;font-size:24px;}
.parties{display:flex;gap:12px;margin:14px 0 12px;}
.party{flex:1;min-width:0;border:1px solid #e3e6ec;border-radius:10px;padding:9px 12px;}
.party h4{font-size:10.5px;font-weight:700;color:var(--c);margin-bottom:3px;letter-spacing:0;}
.party b{font-size:12.5px;display:block;}
.party span{display:block;color:#566074;font-size:10.5px;word-break:break-word;}
table.items{width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:12px;}
table.items th{background:var(--c);color:#fff;font-weight:700;font-size:10.5px;padding:7px 4px;text-align:center;}
table.items td{padding:6px 4px;text-align:center;border-bottom:1px solid #e6e9ef;vertical-align:middle;font-size:11px;word-break:break-word;}
table.items td.nm{text-align:right;}
table.items td.nm small{display:block;color:#7a8498;font-size:9.5px;}
table.items td.num{font-variant-numeric:tabular-nums;white-space:nowrap;}
table.items td.fin{font-weight:800;}
table.items thead{display:table-header-group;}
table.items tr{page-break-inside:avoid;break-inside:avoid;}
.ph{width:38px;height:38px;border-radius:8px;object-fit:cover;border:1px solid #e3e6ec;display:block;margin:0 auto;}
.ph0{width:38px;height:38px;border-radius:8px;background:#f1f3f7;color:#b3bac8;display:flex;align-items:center;justify-content:center;margin:0 auto;font-size:15px;}
.lower{display:flex;gap:14px;align-items:flex-start;}
.notes{flex:1;min-width:0;font-size:10.5px;color:#566074;}
.notes .nb{border:1px dashed #cfd5e0;border-radius:10px;padding:8px 12px;margin-bottom:8px;}
.tot{width:318px;flex:none;}
.tr{display:flex;justify-content:space-between;gap:10px;padding:4px 10px;font-size:11.5px;border-bottom:1px solid #eef0f4;}
.tr.neg b{color:#c0392b;} .tr.sub{font-weight:700;background:#f7f8fa;}
.tr b{font-variant-numeric:tabular-nums;font-weight:700;}
.grand{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;margin-top:6px;background:var(--c);color:#fff;border-radius:10px;font-weight:800;font-size:13.5px;}
.grand b{font-size:16px;}
.pay{display:flex;justify-content:space-between;padding:4px 10px;font-size:11px;}
.pay.due{font-weight:800;color:var(--d);}
.sign{display:flex;gap:14px;margin-top:22px;}
.sign div{flex:1;border-top:1.5px solid #cfd5e0;padding-top:5px;text-align:center;color:#7a8498;font-size:10.5px;height:62px;}
.foot{margin-top:14px;text-align:center;font-size:10.5px;color:#7a8498;border-top:1px solid #e6e9ef;padding-top:8px;}
.meta{display:flex;gap:8px;flex-wrap:wrap;}
.meta div{font-size:11px;} .meta b{font-weight:800;}
/* ── 1 کلاسیک ── */
.s-classic .hd{text-align:center;border-bottom:4px double var(--c);padding-bottom:12px;}
.s-classic .hd .logo{margin:0 auto 6px;} .s-classic .biz-n{color:var(--d);}
.s-classic .ttl{margin-top:8px;font-size:20px;color:var(--c);}
.s-classic .meta{justify-content:space-between;border-bottom:1px solid #e3e6ec;padding:8px 2px;margin-top:2px;}
.s-classic table.items{border:1px solid var(--c);} .s-classic table.items td{border:1px solid #e3e6ec;}
.s-classic .grand{border-radius:4px;}
/* ── 2 مدرن ── */
.s-modern .page{padding-top:0;}
.s-modern .hd{background:linear-gradient(135deg,var(--c),var(--d));color:#fff;margin:0 -34px;padding:22px 34px;display:flex;justify-content:space-between;align-items:center;gap:16px;}
.s-modern .hd .l{display:flex;gap:12px;align-items:center;} .s-modern .hd img.logo{background:#fff;border-radius:10px;padding:5px;}
.s-modern .hd .r{text-align:left;} .s-modern .ttl{font-size:26px;} .s-modern .pill{display:inline-block;background:rgba(255,255,255,.2);border-radius:20px;padding:2px 12px;font-weight:700;margin-top:3px;}
.s-modern .meta{margin-top:14px;} .s-modern .meta div{background:var(--t);border-radius:8px;padding:4px 12px;color:var(--d);}
.s-modern .party{border:none;background:var(--t);} 
.s-modern table.items{border-radius:10px;overflow:hidden;} .s-modern table.items tbody tr:nth-child(even) td{background:#f7f8fb;} .s-modern table.items th:first-child{border-radius:0 10px 0 0;} .s-modern table.items th:last-child{border-radius:10px 0 0 0;}
.s-modern .grand{border-radius:14px;background:linear-gradient(135deg,var(--c),var(--d));}
/* ── 3 مینیمال ── */
.s-minimal .hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1.5px solid #111;padding-bottom:10px;}
.s-minimal .hd .l{display:flex;gap:10px;align-items:center;} .s-minimal .biz-n{font-size:16px;} .s-minimal .ttl{font-size:18px;font-weight:700;color:var(--c);}
.s-minimal .meta{margin-top:10px;gap:22px;} 
.s-minimal .party{border:none;border-bottom:1px solid #111;border-radius:0;padding:6px 0;} .s-minimal .party h4{color:#111;}
.s-minimal table.items th{background:#fff;color:#111;border-bottom:1.5px solid #111;border-top:1.5px solid #111;}
.s-minimal table.items td{border-bottom:1px solid #e3e6ec;}
.s-minimal .grand{background:#fff;color:#111;border:1.5px solid #111;border-radius:0;} .s-minimal .grand b{color:var(--c);}
.s-minimal .tr.sub{background:#fff;}
/* ── 4 زرین (سنتی/تزئینی) ── */
.s-elegant .page{border:2px solid var(--c);outline:1px solid var(--c);outline-offset:-8px;padding:34px 40px 28px;}
.s-elegant .hd{text-align:center;} .s-elegant .hd .logo{margin:0 auto 6px;} .s-elegant .biz-n{color:var(--d);font-size:21px;}
.s-elegant .orn{display:flex;align-items:center;gap:10px;margin:8px 0;color:var(--c);} .s-elegant .orn i{flex:1;height:1px;background:var(--c);} .s-elegant .orn span{font-size:12px;font-weight:800;border:1.5px solid var(--c);border-radius:20px;padding:2px 22px;background:var(--t);color:var(--d);}
.s-elegant .meta{justify-content:center;gap:26px;}
.s-elegant .party{background:var(--t);border:none;border-radius:2px;border-right:4px solid var(--c);}
.s-elegant table.items{border:1px solid var(--c);} .s-elegant table.items th{background:var(--t);color:var(--d);border-bottom:2px solid var(--c);} .s-elegant table.items td{border-bottom:1px dotted var(--c);}
.s-elegant .grand{background:var(--t);color:var(--d);border:1.5px solid var(--c);border-radius:2px;}
.s-elegant .tr.sub{background:var(--t);}
/* ── 5 پررنگ ── */
.s-bold .page{border-right:16px solid var(--c);padding-right:26px;}
.s-bold .hd{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;}
.s-bold .ttl{font-size:36px;color:var(--c);line-height:1.1;} .s-bold .biz-n{font-size:15px;}
.s-bold .hd .l{display:flex;gap:10px;align-items:center;}
.s-bold .meta div{background:var(--d);color:#fff;border-radius:6px;padding:3px 12px;}
.s-bold .party{border:2px solid var(--c);border-radius:6px;} 
.s-bold table.items th{background:var(--d);font-size:11px;} .s-bold table.items td.fin{color:var(--c);}
.s-bold .grand{border-radius:6px;font-size:15px;padding:14px;} .s-bold .grand b{font-size:20px;}
@page{size:A4;margin:0;}
@media print{html,body{background:#fff;} .page{width:auto;min-height:0;height:auto;margin:0;} .s-modern .hd{margin:0 -34px;}}`;
}
function invDocHtml(d, style, color){
  const bp = d.bp, e = escHtml;
  const logo = bp.logo ? `<img class="logo" src="${bp.logo}">` : '';
  const contact = [bp.phone, bp.address].filter(Boolean).map(e).join(' · ');
  const bizBlock = `<div><div class="biz-n">${e(bp.name||'کسب‌وکار من')}</div><div class="biz-m">${contact}</div></div>`;
  const meta = `<div>${d.noLabel}: <b>${invFa(d.no||'—')}</b></div><div>تاریخ: <b>${jalaliDateFa(d.date)}</b></div>${d.valid?`<div>اعتبار تا: <b>${jalaliDateFa(d.valid)}</b></div>`:''}${d.pay!==null&&d.kind==='sale'?`<div>وضعیت: <b>${d.pay.paid>0?'تسویه‌ی ناقص':'پرداخت‌نشده'}</b></div>`:''}${d.kind==='sale'&&d.pay===null?'<div>وضعیت: <b>تسویه‌شده</b></div>':''}`;
  let head;
  if(style==='modern') head = `<div class="hd"><div class="l">${logo}${bizBlock}</div><div class="r"><div class="ttl">${d.title}</div><div class="pill">${d.noLabel}: ${invFa(d.no||'—')}</div></div></div><div class="meta">${meta}</div>`;
  else if(style==='minimal') head = `<div class="hd"><div class="l">${logo}${bizBlock}</div><div class="ttl">${d.title}</div></div><div class="meta">${meta}</div>`;
  else if(style==='elegant') head = `<div class="hd">${logo}<div class="biz-n">${e(bp.name||'کسب‌وکار من')}</div><div class="biz-m">${contact}</div></div><div class="orn"><i></i><span>${d.title}</span><i></i></div><div class="meta">${meta}</div>`;
  else if(style==='bold') head = `<div class="hd"><div><div class="ttl">${d.title}</div><div class="meta" style="margin-top:8px;">${meta}</div></div><div class="l">${bizBlock}${logo}</div></div>`;
  else head = `<div class="hd">${logo}<div class="biz-n">${e(bp.name||'کسب‌وکار من')}</div><div class="biz-m">${contact}</div><div class="ttl">${d.title}</div></div><div class="meta">${meta}</div>`;
  const c = d.cust||{};
  const parties = `<div class="parties">
    <div class="party"><h4>فروشنده</h4><b>${e(bp.name||'کسب‌وکار من')}</b>${bp.phone?`<span>تلفن: ${invFa(e(bp.phone))}</span>`:''}${bp.address?`<span>${e(bp.address)}</span>`:''}</div>
    <div class="party"><h4>خریدار</h4><b>${e(c.name||'مشتری متفرقه')}</b>${c.phone?`<span>تلفن: ${invFa(e(c.phone))}</span>`:''}${c.address?`<span>${e(c.address)}</span>`:''}</div>
    ${d.agent?`<div class="party"><h4>نماینده فروش</h4><b>${e(d.agent.name)}</b>${d.agent.phone?`<span>تلفن: ${invFa(e(d.agent.phone))}</span>`:''}</div>`:''}</div>`;
  const body = d.items.map(r=>`<tr>
    <td>${invFa(r.n)}</td>
    <td>${r.img?`<img class="ph" src="${r.img}">`:'<div class="ph0">🔩</div>'}</td>
    <td class="num">${r.code?e(r.code):'—'}</td>
    <td class="nm">${e(r.name)}${r.spec&&r.spec!==r.name?`<small>${e(r.spec)}</small>`:''}</td>
    <td class="num">${invFa(fmtNum(r.qty))}</td>
    <td class="num">${invMoney(r.unit)}</td>
    <td class="num">${invMoney(r.gross)}</td>
    <td class="num">${r.disc>0?invMoney(r.disc):'—'}</td>
    <td class="num fin">${invMoney(r.net)}</td></tr>`).join('');
  const table = `<table class="items"><colgroup><col style="width:4%"><col style="width:8%"><col style="width:10%"><col style="width:25%"><col style="width:6%"><col style="width:12%"><col style="width:12%"><col style="width:9%"><col style="width:14%"></colgroup>
    <thead><tr><th>ردیف</th><th>تصویر</th><th>کد کالا</th><th>شرح کالا</th><th>تعداد</th><th>مبلغ واحد</th><th>مبلغ کل</th><th>تخفیف</th><th>مبلغ نهایی</th></tr></thead><tbody>${body}</tbody></table>
    <div style="text-align:left;font-size:9.5px;color:#7a8498;margin:-6px 0 10px;">همه‌ی مبالغ به تومان</div>`;
  const tot = d.rows.map(r=>`<div class="tr ${r[2]||''}"><span>${r[0]}</span><b>${r[1]<0?'− ':''}${invMoney(Math.abs(r[1]))}</b></div>`).join('')
    + `<div class="grand"><span>${d.grandLabel}</span><b>${invMoney(d.grand)} تومان</b></div>`
    + (d.pay?`<div class="pay"><span>پرداخت‌شده</span><b>${invMoney(d.pay.paid)}</b></div><div class="pay due"><span>مانده‌ی قابل پرداخت</span><b>${invMoney(d.pay.due)}</b></div>`:'');
  const notes = `${d.delivery?`<div class="nb">🚚 ${e(d.delivery)}</div>`:''}${d.notes?`<div class="nb">📝 ${e(d.notes)}</div>`:''}`;
  const sign = d.kind==='sale' ? '<div class="sign"><div>مهر و امضای فروشنده</div><div>امضای خریدار</div></div>' : '';
  const foot = [d.foot, bp.footer_note].filter(Boolean).map(e).join(' — ');
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${d.title} ${invFa(d.no||'')}</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap');${invCss(color)}</style></head>
<body class="s-${style}"><div class="page">${head}${parties}${table}<div class="lower"><div class="notes">${notes}</div><div class="tot">${tot}</div></div><div class="grow"></div>${sign}${foot?`<div class="foot">${foot}</div>`:''}</div></body></html>`;
}
function invPickers(){
  const sr = document.getElementById('invStyleRow'), cr = document.getElementById('invColorRow'); if(!sr||!cr) return;
  sr.innerHTML = INV_STYLES.map(s=>`<button type="button" class="inv-chip ${s[0]===INV.style?'on':''}" onclick="invPick('style','${s[0]}')">${s[1]}</button>`).join('');
  cr.innerHTML = INV_COLORS.map(c=>`<button type="button" class="inv-dot ${c[0]===INV.color?'on':''}" title="${c[1]}" style="--dc:${c[2]}" onclick="invPick('color','${c[0]}')"><i></i><span>${c[1]}</span></button>`).join('');
}
function invPick(w, v){
  INV[w] = v; invPickers(); invRender();
  clearTimeout(invSaveT);
  invSaveT = setTimeout(()=>postParts('update_business_profile', {invoice_theme:INV.style, invoice_color:INV.color}), 700);
}
function invRender(){
  const d = invData(INV.kind, INV.id); if(!d) return;
  const fr = document.getElementById('invFrame'); if(!fr) return;
  fr.onload = invFit;
  fr.srcdoc = invDocHtml(d, INV.style, INV.color);
}
function invFit(){
  const fr = document.getElementById('invFrame'), st = document.getElementById('invStage'), w = document.getElementById('invWrap');
  if(!fr||!st||!w) return;
  let h = 1123; try{ h = Math.max(1123, fr.contentDocument.documentElement.scrollHeight); }catch(e){}
  const s = Math.min(1, Math.max(0.3, (st.clientWidth-20)/794));
  fr.style.width = '794px'; fr.style.height = h+'px'; fr.style.transform = 'scale('+s+')';
  w.style.width = (794*s)+'px'; w.style.height = (h*s)+'px';
}
window.addEventListener('resize', ()=>{ if(document.getElementById('invoiceModalOverlay')?.classList.contains('open')) invFit(); });
function invOpen(kind, id){
  const bp = PARTS.business_profile || {};
  INV.kind = kind; INV.id = id;
  INV.style = INV_STYLES.some(s=>s[0]===bp.invoice_theme) ? bp.invoice_theme : 'classic';
  INV.color = INV_COLORS.some(c=>c[0]===bp.invoice_color) ? bp.invoice_color : 'sunset';
  invPickers();
  document.getElementById('invoiceModalOverlay').classList.add('open');
  invRender();
}
async function openInvoicePreview(saleId){
  const sale = PARTS.sales.find(s=>s.id===saleId);
  if(!sale) return;
  if(!sale.invoice_no){
    const res = await postParts('generate_invoice', {sale_id: saleId});
    if(!res || res.ok===false) return;
  }
  invOpen('sale', saleId);
}
function printQuote(id){ if(PARTS.quotations.find(x=>x.id===id)) invOpen('quote', id); }
function closeInvoiceModal(){ document.getElementById('invoiceModalOverlay').classList.remove('open'); const f = document.getElementById('invFrame'); if(f){ f.onload = null; f.srcdoc = ''; } }
function printInvoice(){
  const fr = document.getElementById('invFrame'); if(!fr || !fr.contentWindow) return;
  const go = ()=>{ try{ fr.contentWindow.focus(); fr.contentWindow.print(); }catch(e){ showToast('چاپ در این مرورگر باز نشد','error'); } };
  const d = fr.contentDocument;
  const ready = (d && d.fonts && d.fonts.ready) ? Promise.race([d.fonts.ready, new Promise(r=>setTimeout(r,2000))]) : Promise.resolve();
  ready.then(()=>setTimeout(go,100));
}



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
  return '\u2066'+fx(v)+' KT\u2069';
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
    note:'یعنی از هر KT ۱۰۰ فروش، چند KT سود ناخالص مانده. تفاوتش با مارکاپ: مبنای مارجین «قیمت فروش» است.'};
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
  new_customer_orders:'شمارش فاکتورهایی که اولین فاکتورِ مشتری\u200cشان هستند', repeat_orders:'شمارش فاکتورهای مشتریان ثبت\u200cشده که قبلاً هم خرید کرده\u200cاند', repeat_rate:'(فاکتور قدیمی ÷ فاکتورهای دارای مشتری) × ۱۰۰', new_customers:'شمارش مشتریانی که اولین فاکتورشان در این ردیف\u200cهاست', orders_per_customer:'فاکتورهای دارای مشتری ÷ تعداد مشتریان', revenue_per_customer:'درآمد ÷ تعداد مشتریان ثبت\u200cشده', profit_per_customer:'سود ÷ تعداد مشتریان ثبت\u200cشده', collect_pct:'(دریافتی ÷ مبلغ فاکتورها) × ۱۰۰', avg_discount_order:'(تخفیف ردیف + تخفیف کل) ÷ تعداد فاکتور', loss_amount:'جمع قدرمطلق سودِ ردیف\u200cهایی که سودشان منفی است', loss_lines:'شمارش ردیف\u200cهای با سود منفی', loss_orders:'شمارشِ فاکتورهایی که جمع سود ردیف\u200cهایشان منفی است', max_order:'بیشترین جمع مبلغ یک فاکتور', min_order:'کمترین جمع مبلغ یک فاکتور', commission_pct:'(پورسانت ÷ درآمد) × ۱۰۰', days_since_last_sale:'تاریخ پایان بازه − تاریخ آخرین ردیف فروش', sell_through:'فروش خالص ÷ (فروش خالص + موجودی فعلی) × ۱۰۰', days_of_stock:'موجودی فعلی ÷ (فروش خالص ÷ تعداد روز بازه)', inventory_turnover:'بهای تمام\u200cشده\u200cی فروش ÷ ارزش موجودی فعلی', gmroi:'سود ناخالص ÷ ارزش موجودی فعلی', dead_stock_count:'شمارش کالاهای دارای موجودی که در هیچ فاکتوری نیامده\u200cاند', dead_stock_value:'جمع (موجودی × میانگین قیمت خرید) کالاهای راکد', return_value_pct:'(ارزش مرجوعی ÷ فروش ناخالص) × ۱۰۰', expense_to_revenue:'(هزینه\u200cهای جاری ÷ درآمد) × ۱۰۰', customers_in_debt:'شمارش مشتریانی که مانده\u200cشان مثبت است', avg_customer_debt:'جمع مانده\u200cها ÷ تعداد مشتریان بدهکار', stores_with_debt:'شمارش تامین\u200cکنندگانی که بدهی ما به آن\u200cها مثبت است', pe_spread:'بیشترین − کمترین قیمت لیست\u200cشده', pe_spread_pct:'(بیشترین ÷ کمترین − ۱) × ۱۰۰',
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
  ar:'مطالبات', ap:'بدهی‌ها', biz:'ارزش خالص', comm_payable:'پورسانت پرداخت‌نشده', tax_payable:'مالیات پرداخت‌نشده', oversold:'فروش بدون موجودی', net_capital:'خالص سرمایه', is_exp:'تعداد',
  has_ship:'دارای ارسال', pickup:'تحویل حضوری', has_agent:'دارای نماینده', has_disc:'دارای تخفیف', in_bundle:'در باندل', bnd_rev:'درآمد باندل', bnd_disc:'تخفیف باندل', reward_cost:'بهای جایزه',
  is_new:'مشتری جدید', is_ret:'مشتری قدیمی', is_anon:'مشتری متفرقه', loss:'زیان', loss_line:'ردیف زیان‌ده', has_ret:'دارای مرجوعی', unpaid:'دارای مانده', dead:'کالای راکد', dead_value:'ارزش راکد',
  has_stock:'دارای موجودی', no_price:'بدون قیمت', has_price:'دارای قیمت', avg_cost:'میانگین بها', reorder:'نقطه سفارش', out_flag:'ناموجود'};
const RB_FIELD_HOW = {
  qty:'تعداد ثبت‌شده در همین ردیفِ فاکتور/سفارش (قبل از کسر مرجوعی).',
  ret_qty:'جمع تعداد مرجوع‌شده‌ی همین ردیف، از «ثبت مرجوعی»ها.',
  net_qty:'تعداد − مرجوعی.',
  gross:'تعداد × قیمت واحدِ ثبت‌شده در ردیف (قبل از هر تخفیف).',
  item_disc:'تخفیف دستیِ ثبت‌شده روی همین ردیف.',
  inv_disc:'سهم ردیف از «تخفیف کل فاکتور» = (خالص ردیف ÷ جمع خالصِ همه‌ی ردیف‌ها) × تخفیف کل (حداکثر ۱۰۰٪ ردیف).',
  item_rev:'درآمد کالای ردیف پس از تخفیف‌ها و مرجوعی، همان‌طور که هنگام ثبت فروش (و مرجوعی) روی ردیف ذخیره شده.',
  revenue:'درآمد کالای ردیف + سهم ردیف از اثر هزینه‌ی ارسال (سهم = خالص ردیف ÷ جمع خالصِ ردیف‌ها).',
  cogs:'بهای تمام‌شده‌ی ردیف به روش FIFO که هنگام ثبت فروش از خریدهای قبلی برداشته شده (منهای بهای مرجوعیِ برگشته به انبار).',
  profit:'سودِ ثبت‌شده‌ی ردیف (درآمد کالا − بها) + سهم ردیف از اثر هزینه‌ی ارسال.',
  ship_charged:'سهم ردیف از ارسالِ دریافتی از مشتری.', ship_paid:'سهم ردیف از ارسالِ پرداختی به پیک/باربری.', ship_eff:'سهم ردیف از (ارسال دریافتی − ارسال پرداختی).',
  tax:'سهم ردیف از مالیات ارزش‌افزوده‌ی فاکتور، پس از کسر مالیاتِ مرجوعی.', inv_total:'سهم ردیف از «مبلغ نهایی فاکتور».', received:'سهم ردیف از مبلغ دریافت‌شده‌ی فاکتور.', outstanding:'سهم ردیف از مانده‌ی طلب فاکتور.',
  commission:'سهم ردیف از پورسانتِ محاسبه‌شده‌ی فاکتور.', has_ship:'۱ اگر فاکتور هزینه‌ی ارسال پرداختی دارد.', pickup:'۱ اگر روش تحویل «تحویل حضوری» است.', has_agent:'۱ اگر فاکتور نماینده دارد.', has_disc:'۱ اگر ردیف یا فاکتور تخفیف دارد.',
  in_bundle:'۱ اگر ردیف با برچسب باندل/جایزه فروخته شده.', bnd_rev:'درآمد ردیف اگر باندلی است، وگرنه ۰.', bnd_disc:'تخفیف ردیف اگر باندلی است، وگرنه ۰.', reward_cost:'بهای تمام‌شده‌ی ردیف اگر «جایزه» است، وگرنه ۰.',
  is_new:'۱ اگر این فاکتور اولین فاکتورِ آن مشتری (بر اساس تاریخ و شناسه) است.', is_ret:'۱ اگر مشتری قبلاً فاکتور داشته.', is_anon:'۱ اگر فاکتور مشتری ندارد.', loss:'−سود ردیف اگر سود منفی است، وگرنه ۰.', loss_line:'۱ اگر سود ردیف منفی است.',
  has_ret:'۱ اگر بخشی از ردیف مرجوع شده.', unpaid:'۱ اگر فاکتور مانده‌ی طلبِ مثبت دارد.',
  spend:'تعداد × قیمت خرید هر واحد در ردیف سفارش خرید.', paid:'سهم ردیف از پرداخت‌شده‌ی سفارش (کامل=همه، جزئی=مبلغ پرداخت‌شده، نسیه=۰).',
  total:'سهم ردیف از «مبلغ کل مرجوعی» با مالیات.', cash:'سهم ردیف از وجه نقدِ بازگردانده‌شده.', restock:'تعداد ردیف اگر به انبار برگشته، وگرنه ۰.',
  value:'قیمتِ بازگشتی × تعداد (در ردیف مرجوعی) / موجودی × میانگین بهای خرید (در کالا).', amount:'مبلغ ثبت‌شده‌ی هزینه یا پرداخت.', taxpay:'مبلغ تسویه‌ی مالیات (هزینه حساب نمی‌شود).', is_exp:'۱ اگر هزینه‌ی جاری است (نه تسویه‌ی مالیات).',
  dep:'مبلغ واریز سرمایه.', wd:'مبلغ برداشت سرمایه.', adj:'مبلغ تعدیل مغایرت‌گیری.', amt:'مبلغ ± گردش صندوق.', in:'مبلغ مثبت گردش صندوق.', out:'قدرمطلقِ مبلغ منفی گردش صندوق.',
  price:'قیمت ثبت‌شده در لیست قیمت.', stock:'موجودی فعلی کالا (از گردش کالا).', avg_cost:'میانگین بهای خرید موجودیِ فعلی.', sale_price:'قیمت فروش تعیین‌شده برای کالا.', has_price:'۱ اگر کالا قیمت فروش دارد.', no_price:'۱ اگر کالا قیمت فروش ندارد.',
  potential:'موجودی × قیمت فروش.', pot_profit:'موجودی × (قیمت فروش − میانگین بها).', reorder:'نقطه‌ی سفارش مجدد کالا.', low:'۱ اگر موجودی کالا از نقطه‌ی سفارش کمتر یا مساوی است.', out_flag:'۱ اگر موجودی صفر یا منفی است.',
  has_stock:'۱ اگر موجودی مثبت است.', dead:'۱ اگر موجودی مثبت دارد و هرگز در فاکتوری نیامده.', dead_value:'موجودی × میانگین بها برای کالای راکد.',
  ship:'هزینه‌ی ارسال ثبت‌شده‌ی تامین‌کننده.', free_min:'حداقل خرید برای ارسال رایگان.', payable:'مانده‌ی بدهی ما (از حساب‌های پرداختنی).', accrued:'کل پورسانت محاسبه‌شده‌ی نماینده.', pct:'درصد پورسانت پیش‌فرض.',
  ar:'کل مطالبات مشتریان.', ap:'کل بدهی به تامین‌کنندگان.', biz:'ارزش خالص دفتری.', comm_payable:'پورسانت پرداخت‌نشده.', tax_payable:'مالیات پرداخت‌نشده.', oversold:'بهای تخمینی فروش بدون موجودی.', net_capital:'خالص سرمایه‌ی واردشده.'
};
const RB_RAW_FA = {invoice_no:'شماره فاکتور', date:'تاریخ', customer_name:'نام مشتری', payment_status:'وضعیت پرداخت', discount:'تخفیف', shipping_cost:'هزینه ارسال (پرداختی)', shipping_payer:'پرداخت‌کننده‌ی ارسال',
  shipping_charged_to_customer:'ارسال دریافتی از مشتری', tax_percent:'درصد مالیات', tax_amount:'مبلغ مالیات', invoice_total:'مبلغ فاکتور', amount_received:'دریافتی', amount_outstanding:'مانده', delivery_method:'روش تحویل',
  agent_commission:'پورسانت', commission_percent:'درصد پورسانت', revenue:'درآمد', cogs:'بها', profit:'سود', qty:'تعداد', unit_price:'قیمت واحد', returned_qty:'مرجوعی', bundle_id:'باندل', bundle_role:'نقش باندل', notes:'یادداشت',
  order_date:'تاریخ سفارش', po_no:'شماره سفارش', payment_status_p:'وضعیت پرداخت', amount_paid:'پرداخت‌شده', reason:'دلیل', refund_total:'مبلغ کل بازگشتی', cash_refunded:'نقد برگشتی', refund_unit_price:'قیمت بازگشتی واحد', restock:'برگشت به انبار',
  category:'دسته', title:'عنوان', amount:'مبلغ', type:'نوع', price:'قیمت', ref_type:'نوع مرجع'};
const RB_KEY_FA = {sid:'فاکتور فروش', pur:'سفارش خرید', rid:'مرجوعی', pid:'کالا', cust:'مشتری', date:'تاریخ'};
function rbKeyName(f, key){
  if(f==='sid') return dimKeyLabel('sale', key);
  if(f==='pur') return dimKeyLabel('purchase', key);
  if(f==='pid') return dimKeyLabel('product', key);
  if(f==='cust') return key ? dimKeyLabel('customer', key) : 'مشتری متفرقه';
  if(f==='date') return key ? jShort(key) : '—';
  if(f==='rid') return 'مرجوعی '+String(key).slice(-5);
  return String(key);
}
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

const RB_TERM_T = new Set(['sum','cnt','max','note']);
function rbFactDesc(r){
  if(r.k==='sl'||r.k==='pl') return productById(r.pid) ? productLabel(productById(r.pid)) : '—';
  if(r.k==='rt') return 'مرجوعی'+(productById(r.pid) ? ' · '+productLabel(productById(r.pid)) : '');
  if(r.k==='ex') return (r.d.expense_category||[''])[0] || 'سایر';
  if(r.k==='pr') return productById(r.pid) ? productLabel(productById(r.pid)) : '—';
  if(r.k==='st') return dimKeyLabel('store', (r.d.store||[''])[0]);
  if(r.k==='ag') return dimKeyLabel('agent', (r.d.agent||[''])[0]);
  if(r.k==='cu') return dimKeyLabel('customer', (r.d.customer||[''])[0]);
  if(r.k==='cl') return dimKeyLabel('cash_type', (r.d.cash_type||[''])[0]);
  if(r.k==='po') return 'پرداخت پورسانت · '+dimKeyLabel('agent', (r.d.agent||[''])[0]);
  if(r.k==='pe') return dimKeyLabel('product', (r.d.product||[''])[0]);
  return RB_KIND_FA[r.k]||r.k;
}
const RB_MONEY_F = k=>!['qty','ret_qty','net_qty','restock','stock','low','is_exp','pct','has_ship','pickup','has_agent','has_disc','in_bundle','is_new','is_ret','is_anon','loss_line','has_ret','unpaid','dead','has_stock','no_price','has_price','out','reorder'].includes(k);
const rbFv = (k,v)=>(v===null||v===undefined) ? '—' : (RB_MONEY_F(k) ? fx(v)+' KT' : fx(v));
// context of a cell (rows + eval ctx) — shared by every drill-down
function rbCellCtx(a){
  const res = RB_LAST; if(!res) return null;
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
  return {res, m, par, cell, label, shown, f:f||[], ctx};
}
function rbTraceCell(a){
  const c = rbCellCtx(a); if(!c) return null;
  RB_TRACE = []; try{ c.v = rbEval(c.m, c.f, c.ctx); } finally { c.steps = RB_TRACE; RB_TRACE = null; }
  return c;
}
function rbStepsHtmlRows(c, a){
  // human-readable calculation trace; returns table rows for xdef records
  const rows = []; let depth = 0, ti = 0;
  c.steps.forEach(st=>{
    const pad = ' '.repeat(depth);
    if(st.t==='ms'){ if(depth>0 || false){ const mm = RB_METRICS[st.id]; rows.push({cells:[pad+'▸ متغیر «'+(mm?mm.label:st.id)+'»','','']}); } depth++; return; }
    if(st.t==='me'){ depth = Math.max(0, depth-1); if(depth>0){ const mm = RB_METRICS[st.id]; rows.push({cells:[' '.repeat(depth)+'= «'+(mm?mm.label:st.id)+'»','', fx(st.v)+(mm&&mm.unit==='money'?' KT':'')]}); } return; }
    if(RB_TERM_T.has(st.t)){
      const myTi = ti++;
      const lbl = st.t==='sum' ? `جمع «${RB_FIELD_FA[st.f]||st.f}»` : (st.t==='cnt' ? `شمارش «${RB_KEY_FA[st.f]||st.f}»` : st.f);
      rows.push({cells:[pad+lbl, 'روی '+fx(st.n)+' ردیف', (st.t==='sum'&&RB_MONEY_F(st.f)) ? fx(st.v)+' KT' : fx(st.v)], link:{x:'rb_term', a:{mi:a.mi, ri:a.ri, ck:a.ck, ti:myTi}}});
      return;
    }
    if(st.t==='div') rows.push({cells:[pad+'تقسیم: '+fx(st.a)+' ÷ '+fx(st.b), '', fx(st.v)]});
  });
  return rows;
}
function rbScopeFunnel(c){
  const res = c.res, cfg = res.cfg, D = RB_DIMS[cfg.dim], k2 = cfg.dim2 ? new Set(RB_DIMS[cfg.dim2].kinds) : null;
  const kinds = new Set(D.kinds.filter(k=>!k2 || k2.has(k)));
  const need = new Set(c.m.kinds);
  const kf = rbFacts.filter(f=>kinds.has(f.k) && need.has(f.k));
  const env = {warn:[], sets:new Map(), eff:res.eff, ok:d=>rbDimOk(d, cfg.metrics)};
  const pred = rbCompileWhere(cfg.where, env);
  const afterW = pred ? kf.filter(pred) : kf;
  const inR = f=>!f.date || (f.date >= res.eff.from && f.date <= res.eff.to);
  const per = [];
  (cfg.where.items||[]).forEach((n,i)=>{
    if(!rbNodeActive(n)) return;
    const g = rbCompileLeaf(n, {warn:[], sets:env.sets, eff:res.eff, ok:env.ok}); if(!g) return;
    per.push({i, n, pass:kf.filter(g).length});
  });
  return {total:kf.length, afterW:afterW.length, inRange:afterW.filter(inR).length, per};
}
xdef('rb_metric', a=>{
  const m = RB_METRICS[a.mid]; if(!m) return {title:'—', fmt:'T', value:0};
  const fields = rbFieldsOf(m);
  const cnt = {}; (rbFacts||[]).forEach(f=>{ if(m.kinds.includes(f.k)) cnt[f.k] = (cnt[f.k]||0)+1; });
  const srcs = [xSrc('گزارش‌ساز','reportbuilder')];
  if(m.custom){ const cm = (PARTS.custom_metrics||[]).find(x=>x.id===m.id); if(cm) srcs.unshift({label:'✏️ ویرایش این متغیر ساخته‌شده', link:{go:'reportbuilder', fn:'rbCmOpen', arg:cm.id}}); }
  return {title:m.label, term:m.label, latin:RB_EN[m.id]||'', fmt:m.unit==='money'?'T':(m.unit==='pct'?'pct':'num'), scope:'def', noValue:true,
    formula:RB_FT[m.id] || m.hint || '—', note:(m.hint?m.hint+'. ':'')+(m.snap?'این متغیر «وضعیتی» است: مانده‌ی پایان هر دوره را نشان می‌دهد، نه جمع داخل دوره. ':'')+'برای دیدن اعداد سازنده‌ی هر خانه، روی i کنار همان خانه بزن؛ از آنجا می‌توانی تا خودِ تراکنش پایین بروی.',
    vars:[{label:'نوع ردیف‌های مصرف‌شده', val:m.kinds.map(k=>(RB_KIND_FA[k]||k)+' ('+fx(cnt[k]||0)+' ردیف در سامانه)').join('، '), link:null}]
      .concat(fields.map(f=>({label:'فیلد «'+(RB_FIELD_FA[f]||f)+'» ('+f+')', val:RB_FIELD_HOW[f]||'—', link:null}))),
    code:String(m.fn), sources:srcs};
});
xdef('rb_cell', a=>{
  const c = rbTraceCell(a); if(!c) return {title:'—', fmt:'T', value:0};
  const {res, m, label, shown, f} = c, v = c.v;
  const need = new Set(m.kinds), rows = f.filter(x=>need.has(x.k));
  const fields = rbFieldsOf(m).filter(k=>rows.some(r=>r.v && r.v[k]!==undefined));
  const cols = ['تاریخ','نوع','شرح'].concat(fields.map(k=>RB_FIELD_FA[k]||k));
  const show = rows.slice().sort((x,y)=>String(y.date||'').localeCompare(String(x.date||''))).slice(0, 400);
  const sums = {}; fields.forEach(k=>sums[k] = xsum(rows, r=>r.v[k]));
  const fun = rbScopeFunnel(c), cfg = res.cfg;
  const vars = [
    {label:'تفکیک اول: '+rbDimLabelPlain(cfg.dim), val:c.par ? c.par.label : 'جمع کل', link:null}
  ];
  if(cfg.dim2) vars.push({label:'تفکیک دوم: '+rbDimLabelPlain(cfg.dim2), val:(a.ck!==undefined && c.cell) ? c.cell.label : 'همه', link:null});
  vars.push({label:'بازه‌ی گزارش', val:jShort(res.eff.from)+' تا '+jShort(res.eff.to)+(c.ctx && c.ctx.days ? ' ('+fx(c.ctx.days)+' روز)' : ''), link:{go:'reportbuilder', focus:'rbSec_time'}});
  vars.push({label:'① ردیف‌های خام از نوعِ لازم', val:fx(fun.total), link:null});
  vars.push({label:'② پس از اعمال همه‌ی شرط‌ها', val:fx(fun.afterW), link:null});
  vars.push({label:'③ داخل بازه‌ی گزارش', val:fx(fun.inRange), link:null});
  vars.push({label:'④ داخل همین خانه (مصرف‌شده در محاسبه)', val:fx(rows.length), link:null});
  fun.per.forEach(p=>vars.push({label:'شرط '+faDigits(p.i+1)+': '+rbLeafText(p.n), val:fx(p.pass)+' ردیف قبول', link:{x:'rb_cond', a:{i:p.i}}}));
  if(res.cfg.having && res.cfg.having.length) vars.push({label:'شرط روی نتیجه (بعد از محاسبه)', val:rbHavingText(res.cfg), link:null});
  const steps = rbStepsHtmlRows(c, a);
  return {title:m.label, term:label, latin:RB_EN[m.id]||'', fmt:m.unit==='money'?'T':(m.unit==='pct'?'pct':'num'), scope:'cell', value:v,
    formula:RB_FT[m.id]||m.hint||'—',
    steps:steps,
    vars,
    note:'این عدد از '+fx(rows.length)+' ردیفِ سازنده‌اش محاسبه شده. در «مراحل محاسبه» روی هر جمع/شمارش بزن تا ردیف‌هایش را ببینی، و روی هر ردیف تا به خودِ تراکنش (فاکتور، خرید، هزینه…) برسی و همان‌جا ویرایشش کنی. '+(rows.length>400?'در جدول ریز رکوردها فقط ۴۰۰ ردیفِ اخیر نمایش داده می‌شود. ':''),
    records:{cols, rows:show.map(r=>({cells:[r.date?jShort(r.date):'—', RB_KIND_FA[r.k]||r.k, rbFactDesc(r)].concat(fields.map(k=>rbFv(k, r.v[k]))), link:{x:'rb_fact', a:{fi:r.i}}})),
      total:null, sumsRow: fields.length ? ['','','جمع'].concat(fields.map(k=>rbFv(k, sums[k]))) : null, hint:'روی هر ردیف بزن تا ببینی چطور ساخته شده و به تراکنش اصلی برسی.'},
    checks:[{label:'محاسبه‌ی مجدد از ردیف‌ها = عدد جدول', a:v, b:shown, tol:1e-6}],
    code:String(m.fn), sources:[{label:'تعریف این متغیر', link:{x:'rb_metric', a:{mid:m.id}}}, {label:'تنظیمات گزارش‌ساز', link:{go:'reportbuilder'}}]};
});
const TOT_X = {ar:'accounts_receivable', ap:'accounts_payable', comm_payable:'commission_payable', tax_payable:'tax_payable', biz:'equity', net_capital:'net_capital', oversold:'oversold'};
xdef('rb_term', a=>{
  const c = rbTraceCell(a); if(!c) return {title:'—', fmt:'T', value:0};
  const terms = c.steps.filter(st=>RB_TERM_T.has(st.t)), st = terms[a.ti]; if(!st) return {title:'—', fmt:'T', value:0};
  const lbl = st.t==='sum' ? `جمع «${RB_FIELD_FA[st.f]||st.f}»` : (st.t==='cnt' ? `شمارش «${RB_KEY_FA[st.f]||st.f}»` : st.f);
  const back = {title:'← '+c.m.label, link:{x:'rb_cell', a:{mi:a.mi, ri:a.ri, ck:a.ck}}};
  if(st.t==='sum'){
    const f = st.f, rows = st.rows.slice().sort((x,y)=>Math.abs(y.v[f]||0)-Math.abs(x.v[f]||0)), tot = st.v;
    if(TOT_X[f] && rows.length && rows.every(r=>r.k==='tot') && XPL[TOT_X[f]]){
      const d = XPL[TOT_X[f]]();
      return Object.assign({}, d, {scope:'now', note:'این خانه یک «وضعیت لحظه‌ای» است (مانده تا امروز، نه جمع داخل بازه). ریزِ آن در همین صفحه است. '+(d.note||''),
        sources:(d.sources||[]).concat([{label:'بازگشت به محاسبه‌ی «'+c.m.label+'»', link:back.link}])});
    }
    return {title:lbl+' در «'+c.label+'»', term:c.m.label, latin:'', fmt:RB_MONEY_F(f)?'T':'num', scope:'cell', value:tot,
      formula:'جمعِ فیلد «'+(RB_FIELD_FA[f]||f)+'» روی '+fx(st.n)+' ردیف',
      note:'«'+(RB_FIELD_FA[f]||f)+'»: '+(RB_FIELD_HOW[f]||'—')+' — ردیف‌ها از بزرگ‌ترین مشارکت به کوچک‌ترین مرتب شده‌اند؛ روی هر ردیف بزن تا ببینی از کجا آمده.',
      records:{cols:['تاریخ','نوع','شرح',RB_FIELD_FA[f]||f,'سهم از جمع'], rows:rows.slice(0,500).map(r=>({cells:[r.date?jShort(r.date):'—', RB_KIND_FA[r.k]||r.k, rbFactDesc(r), rbFv(f, r.v[f]), tot ? fx((r.v[f]||0)/tot*100)+'٪' : '—'], link:{x:'rb_fact', a:{fi:r.i, fld:f}}})), total:null,
        sumsRow:['','','جمع', rbFv(f, tot), tot ? '۱۰۰٪' : '']},
      checks:[{label:'جمع ردیف‌ها = عدد این مرحله', a:xsum(rows, r=>r.v[f]), b:tot, tol:1e-6}],
      sources:[{label:'بازگشت به محاسبه‌ی «'+c.m.label+'»', link:back.link}]};
  }
  // count / extreme / note → distinct keys
  const groups = new Map(); st.rows.forEach(r=>{ const k = (st.t==='cnt' && r[st.f]!==undefined) ? r[st.f] : r.i; if(!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
  const list = [...groups.entries()];
  const isKey = st.t==='cnt' && st.rows[0] && st.rows[0][st.f]!==undefined;
  return {title:lbl+' در «'+c.label+'»', term:c.m.label, latin:'', fmt:'num', scope:'cell', value:st.v,
    formula:st.f+' — روی '+fx(st.n)+' ردیف',
    note:isKey ? 'هر سطر یکی از موردهای شمارش‌شده است؛ روی آن بزن تا ردیف‌های سازنده‌اش را ببینی.' : 'این مرحله از ردیف‌های زیر محاسبه می‌شود؛ روی هر ردیف بزن تا به تراکنش برسی.',
    records:{cols:isKey?[RB_KEY_FA[st.f]||'مورد','تعداد ردیف','تاریخ']:['تاریخ','نوع','شرح'], rows:(isKey ? list.slice(0,500).map(([k,rs])=>({cells:[rbKeyName(st.f,k), fx(rs.length), rs[0].date?jShort(rs[0].date):'—'], link:{x:'rb_fact', a:{fi:rs[0].i}}}))
        : st.rows.slice(0,500).map(r=>({cells:[r.date?jShort(r.date):'—', RB_KIND_FA[r.k]||r.k, rbFactDesc(r)], link:{x:'rb_fact', a:{fi:r.i}}})))},
    checks:(st.t==='cnt' && isKey) ? [{label:'تعداد موردهای یکتا = عدد این مرحله', a:list.length, b:st.v, tol:1e-6, fmt:'num'}] : [],
    sources:[{label:'بازگشت به محاسبه‌ی «'+c.m.label+'»', link:back.link}]};
});
function rbFactSrcLinks(f){
  const L = [];
  if(f.sid){ L.push({label:'✏️ باز کردن / ویرایش فاکتور فروش', link:xGoSale(f.sid)}); L.push({label:'محاسبه‌ی درآمد کل این فاکتور', link:{x:'sale_revenue', a:{id:f.sid}}}); L.push({label:'محاسبه‌ی بهای این فاکتور', link:{x:'sale_cogs', a:{id:f.sid}}}); L.push({label:'محاسبه‌ی مبلغ فاکتور', link:{x:'sale_invoice_total', a:{id:f.sid}}}); }
  if(f.pur) L.push({label:'✏️ باز کردن / ویرایش سفارش خرید', link:{go:'purchase', fn:'openPurchaseModal', arg:f.pur}});
  if(f.k==='rt') L.push({label:'مرجوعی‌ها', link:{go:'returns'}});
  if(f.k==='ex'&&f.eid) L.push({label:'✏️ ویرایش این هزینه', link:{go:'expenses', fn:'editExpense', arg:f.eid}});
  if(f.cid) L.push({label:'✏️ ویرایش این تراکنش سرمایه', link:{go:'cash', fn:'editCashTx', arg:f.cid}});
  if(f.k==='cl') L.push({label:'دفتر صندوق (ledger)', link:{go:'ledger'}});
  if(f.k==='po') L.push({label:'پرداخت‌های پورسانت', link:{go:'agents'}});
  if(f.k==='tot') [['accounts_receivable','مطالبات از مشتریان'],['accounts_payable','بدهی به تامین‌کنندگان'],['commission_payable','پورسانت پرداخت‌نشده'],['tax_payable','مالیات پرداخت‌نشده'],['equity','حقوق صاحبان سرمایه'],['net_capital','خالص سرمایه'],['oversold','فروش بدون موجودی']].forEach(([id,t])=>L.push({label:'نحوه‌ی محاسبه‌ی «'+t+'»', link:{x:id}}));
  if(f.peid) L.push({label:'✏️ ویرایش این قیمت لیست', link:{go:'pricelists', fn:'editPriceEntry', arg:f.peid}});
  if(f.pid && productById(f.pid)){ L.push({label:'✏️ ویرایش کالا', link:xGoProd(f.pid)}); L.push({label:'گردش کالا (کاردکس)', link:xGoKardex(f.pid)}); }
  if(f.sto) L.push({label:'✏️ ویرایش تامین‌کننده', link:{go:'stores', fn:'openStoreModal', arg:f.sto}});
  if(f.ago) L.push({label:'✏️ ویرایش نماینده', link:{go:'agents', fn:'openAgentModal', arg:f.ago}});
  if(f.cuid) L.push({label:'✏️ ویرایش مشتری', link:{go:'customers', fn:'openCustomerModal', arg:f.cuid}});
  const cs = f.d && f.d.customer && f.d.customer[0]; if(cs && cs.startsWith('id:') && f.k!=='cu') L.push({label:'مشتری این ردیف', link:{go:'customers', fn:'openCustomerModal', arg:cs.slice(3)}});
  const st = f.d && f.d.store && f.d.store[0]; if(st && storeById(st) && f.k!=='st') L.push({label:'تامین‌کننده‌ی این ردیف', link:{go:'stores', fn:'openStoreModal', arg:st}});
  const ag = f.d && f.d.agent && f.d.agent[0]; if(ag && agentById(ag) && f.k!=='ag') L.push({label:'نماینده‌ی این ردیف', link:{go:'agents', fn:'openAgentModal', arg:ag}});
  return L;
}
function rbFactRaw(f){
  let rec = null, extra = null;
  if(f.k==='sl'){ const s = (PARTS.sales||[]).find(x=>x.id===f.sid); if(s){ rec = (s.items||[])[f.ii]; extra = s; } }
  else if(f.k==='pl'){ const p = (PARTS.purchases||[]).find(x=>x.id===f.pur); if(p){ rec = (p.items||[])[f.ii]; extra = p; } }
  else if(f.k==='rt'){ const r = (PARTS.sale_returns||[]).find(x=>x.id===f.rid); if(r){ rec = (r.items||[])[f.ii]; extra = r; } }
  else if(f.k==='ex'){ rec = (PARTS.business_expenses||[]).find(x=>x.id===f.eid); }
  else if(f.k==='cap'){ rec = (PARTS.capital_transactions||[]).find(x=>x.id===f.cid); }
  else if(f.k==='cl'){ rec = (PARTS.cash_ledger||[]).find(x=>x.id===f.lid); }
  else if(f.k==='po'){ rec = (PARTS.agent_payouts||[]).find(x=>x.id===f.poid); }
  else if(f.k==='pe'){ rec = (PARTS.price_entries||[]).find(x=>x.id===f.peid); }
  const fmtRaw = (k,v)=>{ if(v===null||v===undefined||v==='') return '—'; if(typeof v==='number') return fx(v); if(typeof v==='object') return JSON.stringify(v); if(k==='date'||k==='order_date') return jShort(v); return String(v); };
  const out = [];
  const add = (src, pre)=>{ if(!src) return; Object.entries(src).forEach(([k,v])=>{ if(k==='items'||k==='id'||typeof v==='object' && v!==null && !Array.isArray(v)) return; if(Array.isArray(v)) return; if(!RB_RAW_FA[k] && !/^(product_id|store_id|customer_id|agent_id|sale_id|category)$/.test(k)) return; out.push({label:(pre||'')+(RB_RAW_FA[k]||k), val:fmtRaw(k,v)}); }); };
  add(rec, f.k==='sl'||f.k==='pl'||f.k==='rt' ? 'ردیف: ' : ''); add(extra, 'سند: ');
  return out;
}
xdef('rb_fact', a=>{
  const f = (rbFacts||[])[a.fi]; if(!f) return {title:'ردیف پیدا نشد', fmt:'T', value:0, note:'داده‌ها عوض شده؛ گزارش را دوباره اجرا کن.'};
  const vk = Object.keys(f.v||{}).filter(k=>f.v[k]!==undefined);
  const vars = [];
  const fieldRows = vk.map(k=>({cells:[(RB_FIELD_FA[k]||k)+' ('+k+')', rbFv(k, f.v[k]), RB_FIELD_HOW[k]||'—'], link:(f.k==='tot' && TOT_X[k]) ? {x:TOT_X[k]} : null}));
  Object.entries(f.d||{}).forEach(([dim, ks])=>{ if(!Array.isArray(ks) || !RB_DIMS[dim]) return; if(['group_l1','group_l2','group_l3','group_leaf'].includes(dim)) return;
    vars.push({label:'تفکیک «'+rbDimLabelPlain(dim)+'»', val:ks.slice(0,4).map(k=>dimKeyLabel(dim,k)).join('، ')+(ks.length>4?' و '+fx(ks.length-4)+' مورد دیگر':''), link:null}); });
  const raw = rbFactRaw(f);
  raw.forEach(r=>vars.push({label:'📄 '+r.label, val:r.val, link:null}));
  let parts = null, value = 0, formula = '', checks = [];
  let noV = false;
  if(f.k==='sl'){
    const retV = Math.max(f.v.gross - f.v.item_disc - f.v.inv_disc - f.v.item_rev, 0);
    parts = [{label:'مبلغ ناخالص ردیف ('+fx(f.v.qty)+' عدد × قیمت واحد)', val:f.v.gross, fmt:'T'}, {label:'تخفیف خودِ این ردیف', val:f.v.item_disc, fmt:'T', op:'−'},
      {label:'سهم این ردیف از تخفیف کل فاکتور', val:f.v.inv_disc, fmt:'T', op:'−'}, {label:'مرجوعی این ردیف ('+fx(f.v.ret_qty)+' عدد برگشتی، بدون مالیات)', val:retV, fmt:'T', op:'−', hide0:true},
      {label:'سهم ردیف از اثر هزینه‌ی ارسال (دریافتی − پرداختی به پیک)', val:f.v.ship_eff, fmt:'T', op:'+', hide0:true}];
    value = f.v.revenue; formula = 'درآمد ردیف = (مبلغ ناخالص − تخفیف ردیف − سهم از تخفیف کل − مرجوعی) + سهم از اثر ارسال';
    checks = [{label:'درآمد کالای ردیف (ثبت‌شده) = ناخالص − تخفیف‌ها − مرجوعی', a:f.v.gross-f.v.item_disc-f.v.inv_disc-retV, b:f.v.item_rev, tol:0.011, fmt:'T'},
      {label:'سود = درآمد − بهای تمام‌شده (FIFO) روی همین ردیف', a:f.v.profit, b:f.v.revenue-f.v.cogs, tol:0.011, fmt:'T'}];
  }
  else if(f.k==='tot'){
    if(a.fld && f.v[a.fld]!==undefined){ value = f.v[a.fld]; formula = 'مانده‌ی لحظه‌ای «'+(RB_FIELD_FA[a.fld]||a.fld)+'» تا امروز؛ ریزِ ساخت آن پایین‌تر است.'; if(TOT_X[a.fld]) parts = [{label:RB_FIELD_FA[a.fld]||a.fld, ref:TOT_X[a.fld]}]; }
    else { noV = true; formula = 'این ردیف یک «جمع‌بندی وضعیتی» است؛ هر فیلدش یک مانده‌ی لحظه‌ای جدا دارد. روی هر فیلد بزن تا ریزِ ساخت آن باز شود.'; }
  } else if(f.k==='pl'){ value = f.v.spend; formula = 'مبلغ ردیف = تعداد × قیمت خرید واحد'; parts = [{label:'تعداد خریداری‌شده', val:f.v.qty, fmt:'num'}, {label:'قیمت خرید هر واحد', val:f.v.qty ? f.v.spend/f.v.qty : 0, fmt:'T', op:'×'}]; }
  else if(f.k==='rt'){ value = f.v.value; formula = 'ارزش مرجوعی = تعداد برگشتی × قیمت بازگشتی هر واحد'; }
  else if(f.k==='ex'){ value = f.v.amount||f.v.taxpay; formula = 'مبلغ هزینه‌ی ثبت‌شده'; }
  else if(f.k==='pr'){ value = f.v.value; formula = 'ارزش موجودی = موجودی × میانگین بهای خرید'; parts = [{label:'موجودی (تعداد)', val:f.v.stock, fmt:'num'}, {label:'میانگین بها', val:f.v.avg_cost, fmt:'T', op:'×'}]; }
  else if(f.k==='cl'){ value = f.v.amt; formula = 'مبلغ ± گردش صندوق'; }
  else { value = vk.length ? f.v[vk[0]] : 0; formula = 'مقدار ثبت‌شده'; }
  return {title:RB_KIND_FA[f.k]+' — '+rbFactDesc(f), term:f.date ? 'تاریخ '+jLabel(f.date) : 'بدون تاریخ (وضعیت لحظه‌ای)', latin:'Underlying record', fmt:(f.k==='pr'&&false)?'num':'T', scope:'item', value,
    formula, parts, noValue:noV,
    vars, checks, records:{cols:['فیلد','مقدار','نحوه‌ی ساخته‌شدن'], rows:fieldRows, hint:f.k==='tot' ? 'روی هر فیلد بزن تا ریز ساختش (دارایی‌ها، بدهی‌ها و تراکنش‌ها) همین‌جا باز شود' : 'همه‌ی مقدارهای این ردیف که در گزارش‌ساز مصرف می‌شوند'},
    note:'این پایین‌ترین سطح است: خودِ ردیفِ ثبت‌شده. با دکمه‌های «ویرایش» پایین، همان سند را باز و اصلاح کن؛ بعد گزارش را دوباره بزن تا عدد تغییر کند.',
    sources:rbFactSrcLinks(f)};
});
xdef('rb_cond', a=>{
  const n = RB.where.items[a.i]; if(!n) return {title:'شرط پیدا نشد', fmt:'T', value:0};
  const res = RB_LAST, cfgM = RB.metrics;
  const D = RB_DIMS[RB.dim], k2 = RB.dim2 ? new Set(RB_DIMS[RB.dim2].kinds) : null;
  const kinds = new Set(D.kinds.filter(k=>!k2 || k2.has(k)));
  const need = new Set(); cfgM.forEach(id=>{ const m = RB_METRICS[id]; if(m) m.kinds.forEach(k=>need.add(k)); });
  const kf = rbFacts.filter(f=>kinds.has(f.k) && need.has(f.k));
  const eff = res ? res.eff : {from:'', to:isoToday()};
  const env = {warn:[], sets:new Map(), eff, ok:d=>rbDimOk(d, cfgM)};
  const g = rbCompileLeaf(n, env), pass = g ? kf.filter(g) : kf;
  const out = {title:'شرط '+faDigits(a.i+1), term:rbLeafText(n), latin:'Condition', fmt:'num', scope:'def', value:pass.length, noValue:false,
    formula:rbLeafText(n), note:'از '+fx(kf.length)+' ردیف خام، '+fx(pass.length)+' ردیف این شرط را قبول کرد.', vars:[{label:'نوع شرط', val:({attr:'ویژگی',num:'عدد (برای هر موجودیت)',txt:'متنی',dt:'تاریخ',row:'مقدار ردیف'})[n.t]||n.t, link:{go:'reportbuilder', focus:'rbSec_where'}}], sources:[{label:'ویرایش شرط در گزارش‌ساز', link:{go:'reportbuilder', focus:'rbSec_where'}}]};
  if(n.t==='num'){
    const m = RB_METRICS[n.mid], aa = rbParseNum(n.v1), bb = rbParseNum(n.v2);
    const from = n.from || eff.from, to = n.to || eff.to, nd = new Set(m.kinds), groups = new Map();
    rbDimValues(n.dim).forEach(v=>{ if(n.dim==='group' && (v.key==='__none' || String(v.key).startsWith('p:'))) return; groups.set(v.key, []); });
    rbFacts.forEach(f=>{ if(!nd.has(f.k)) return; if(f.date){ if(m.snap ? f.date > to : (f.date < from || f.date > to)) return; } const ks = rbNumKeys(f, n.dim); if(!ks) return; new Set(ks.map(String)).forEach(k=>{ let gg = groups.get(k); if(!gg){ gg = []; groups.set(k, gg); } gg.push(f); }); });
    const rows = []; groups.forEach((fs,k)=>{ const v = rbEval(m, fs, {pool:fs, base:fs, end:to, days:rbDays(from,to)}); rows.push({k, v, ok:rbCondDefined(n.mid, fs) && rbNumPass(v, n.op, aa, bb)}); });
    rows.sort((x,y)=>(y.ok-x.ok) || (y.v-x.v));
    const money = m.unit==='money';
    out.formula = 'برای هر «'+RB_NUM_ENT[n.dim].label+'» مقدارِ «'+m.label+'» حساب می‌شود و فقط آن‌هایی که شرط را قبول کنند می‌مانند.';
    out.vars.push({label:'بازه‌ی سنجش', val:jShort(from)+' تا '+jShort(to), link:null});
    out.records = {cols:[RB_NUM_ENT[n.dim].label, m.label, 'نتیجه'], rows:rows.slice(0,500).map(r=>({cells:[dimKeyLabel(n.dim, r.k), (money?fx(r.v)+' KT':fx(r.v)+(m.unit==='pct'?'٪':'')), r.ok?'✅ قبول':'✖ رد'], link:null})), hint:'مقدارِ هر موجودیت دقیقاً با همان متغیرِ گزارش‌ساز حساب شده.'};
    out.value = rows.filter(r=>r.ok).length; out.note = fx(rows.filter(r=>r.ok).length)+' از '+fx(rows.length)+' «'+RB_NUM_ENT[n.dim].label+'» قبول شد؛ ردیف‌های خامِ آن‌ها ('+fx(pass.length)+') وارد گزارش شد.';
    return out;
  }
  const byKey = new Map(); pass.forEach(f=>{ const ks = n.t==='attr' || n.t==='txt' ? (rbDimKeys(f, n.dim)||[]) : [n.t]; ks.forEach(k=>byKey.set(String(k), (byKey.get(String(k))||0)+1)); });
  if(n.t==='attr' || n.t==='txt'){ out.records = {cols:[rbDimLabelPlain(n.dim),'تعداد ردیفِ قبول‌شده'], rows:[...byKey.entries()].sort((x,y)=>y[1]-x[1]).slice(0,300).map(([k,c])=>({cells:[dimKeyLabel(n.dim,k), fx(c)], link:null}))}; }
  else { out.records = {cols:['تاریخ','نوع','شرح'], rows:pass.slice(0,300).map(r=>({cells:[r.date?jShort(r.date):'—', RB_KIND_FA[r.k]||r.k, rbFactDesc(r)], link:{x:'rb_fact', a:{fi:r.i}}})), hint:'نمونه‌ای از ردیف‌های قبول‌شده — روی هر کدام بزن.'}; }
  out.value = pass.length; return out;
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
function xtxt(c){ return escHtml(c).replace(/(-?[\d,]+(?:\.\d+)?) KT/g, '\u2066$1 KT\u2069'); }
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
let XEXP = [];
const XSCOPE = {range:['📅','بازه: '], now:['⏱️','وضعیت لحظه‌ای'], item:['🧾','یک مورد'], cell:['🧮','یک خانه‌ی گزارش'], def:['📖','تعریف متغیر']};
function xCar(){ return '<span class="xpl-car" aria-hidden="true"></span>'; }
function xExpIdx(link, depth){ XEXP.push({id:link.x, args:link.a||{}, depth}); return XEXP.length-1; }
function xTog(tr, idx, ncols){
  const nx = tr.nextElementSibling;
  if(nx && nx.classList.contains('xpl-sub') && nx.dataset.for===String(idx)){ nx.remove(); tr.classList.remove('open'); return; }
  const e = XEXP[idx]; if(!e) return;
  if(e.depth>=8){ xPush(e.id, e.args); return; }
  const r = xRun(e.id, e.args);
  const sub = document.createElement('tr'); sub.className = 'xpl-sub'; sub.dataset.for = String(idx);
  sub.innerHTML = `<td colspan="${ncols}"><div class="xpl-nest xd${Math.min(e.depth,5)}">${xNestHead(r, idx)}${xInner(r, e.depth+1)}</div></td>`;
  tr.after(sub); tr.classList.add('open');
  if(typeof picScan==='function') picScan(sub);
}
function xFull(idx){ const e = XEXP[idx]; if(e) xPush(e.id, e.args); }
function xNestHead(r, idx){
  const f = r.fmt||'T';
  return `<div class="xpl-nest-h"><span class="xpl-nest-t">${escHtml(r.title||'')}</span>${r.noValue?'':`<span class="xpl-nest-v">${xfmt(f, r.value)}</span>`}<button type="button" class="xpl-full" onclick="event.stopPropagation();xFull(${idx})">⤢ صفحه‌ی کامل</button></div>`;
}
function xLinkAttr(link){ return `onclick="xLink(${(XLINKS.push(link), XLINKS.length-1)})"`; }
function xInner(r, depth){
  const f = r.fmt || 'T';
  let out = '', checks = (r.checks||[]).filter(Boolean);
  const xEmpty = !r.noValue && Number(r.value)===0 && !(r.parts&&r.parts.length) && !(r.records&&r.records.rows&&r.records.rows.length) && !(r.steps&&r.steps.length);
  if(xEmpty) out += `<div class="xpl-sec"><div class="xpl-empty">هیچ تراکنشی از این نوع در بازه ثبت نشده؛ پس مجموعِ آن دقیقاً صفر است — چیزی پنهان نیست.</div></div>`;
  if(r.formula) out += `<div class="xpl-sec"><div class="xpl-sec-t">🧮 فرمول <span class="xpl-hint">(این عدد دقیقاً چطور ساخته می‌شود)</span></div><div class="xpl-formula">${xtxt(r.formula)}</div></div>`;
  // ── اجزا + معادله
  if(r.parts && r.parts.length){
    const resolved = r.parts.map(p=>{
      if(p.ref){ const sub = xRun(p.ref, p.args); return Object.assign({}, p, {val:sub.value, fmt:sub.fmt||'T'}); }
      return Object.assign({fmt:'T'}, p);
    });
    const vals = resolved.map(p=>Number(p.val)||0), composed = xCombine(r, vals);
    const shown = resolved.filter(p=>!(p.hide0 && Math.abs(p.val||0)<0.005));
    const mx = Math.max(1e-9, ...shown.map(p=>Math.abs(Number(p.val)||0)));
    const eq = shown.map((p,i)=>`${i?`<span class="xpl-eq-op">${p.op||'+'}</span>`:''}<span class="xpl-chip"><i>${escHtml(p.label)}</i><b>${xtxt(xfmt(p.fmt,p.val))}</b></span>`).join('')
      + `<span class="xpl-eq-op">=</span><span class="xpl-chip res"><i>نتیجه${r.mult?' (× '+r.mult+')':''}${r.div100?' (÷ ۱۰۰)':''}</i><b>${xtxt(xfmt(f, composed))}</b></span>`;
    const NC = 4;
    const rows = shown.map((p,i)=>{
      const exp = p.ref ? xExpIdx({x:p.ref, a:p.args}, depth) : -1;
      const act = (!p.ref && p.link) ? `<a href="javascript:void(0)" class="xl xpl-go" ${xLinkAttr(p.link)}>مشاهده ↗</a>` : '';
      const pct = Math.round(Math.abs(Number(p.val)||0)/mx*100);
      return `<tr class="${p.ref?'xexp clk':''}" ${p.ref?`onclick="xTog(this,${exp},${NC})"`:''}><td class="xpl-op">${i===0?'':(p.op||'+')}</td>
        <td>${p.ref?xCar():''}${escHtml(p.label)}${act?' '+act:''}<div class="xpl-bar2"><i style="width:${pct}%"></i></div></td><td class="xpl-num">${xtxt(xfmt(p.fmt,p.val))}</td><td class="xpl-w">${p.ref?'<span class="xpl-more">ریزتر ▾</span>':''}</td></tr>`;
    }).join('');
    out += `<div class="xpl-sec"><div class="xpl-sec-t">➕ اجزای این عدد <span class="xpl-hint">(روی هر جزء بزن؛ همین‌جا باز می‌شود و تا خودِ تراکنش ادامه دارد)</span></div>
      <div class="xpl-eq">${eq}</div>
      <table class="xpl-tbl xpl-parts"><tbody>${rows}<tr class="xpl-res"><td class="xpl-op">=</td><td>نتیجه${r.mult?' (× '+r.mult+')':''}${r.div100?' (÷ ۱۰۰)':''}</td><td class="xpl-num">${xtxt(xfmt(f, composed))}</td><td></td></tr></tbody></table></div>`;
    if(!r.noValue) checks.unshift({label:'جمع‌بندیِ اجزای بالا = عدد نمایش‌داده‌شده', a:composed, b:r.value, fmt:f, tol: f==='pct' ? 0.06 : 0.6});
  }
  // ── مراحل
  if(r.steps && r.steps.length){
    const NC = 3;
    out += `<div class="xpl-sec"><div class="xpl-sec-t">📋 مراحل محاسبه <span class="xpl-hint">(روی هر مرحله بزن تا ردیف‌هایش همین‌جا باز شود)</span></div>
      <div class="xpl-scroll"><table class="xpl-tbl xpl-rec"><thead><tr><th>مرحله</th><th>دامنه</th><th>مقدار</th></tr></thead><tbody>${r.steps.map(row=>{
        const ex = row.link && row.link.x; const idx = ex ? xExpIdx(row.link, depth) : -1;
        return `<tr class="${row.link?'clk':''}${ex?' xexp':''}" ${ex?`onclick="xTog(this,${idx},${NC})"`:(row.link?xLinkAttr(row.link):'')}>${row.cells.map((c,ci)=>`<td>${ci===0&&ex?xCar():''}${xtxt(c)}</td>`).join('')}</tr>`; }).join('')}
      <tr class="xpl-res"><td>نتیجه‌ی نهایی</td><td></td><td>${xtxt(xfmt(f, r.value))}</td></tr></tbody></table></div></div>`;
  }
  // ── متغیرها
  if(r.vars && r.vars.length && depth<=1){
    out += `<div class="xpl-sec"><div class="xpl-sec-t">🎚️ متغیرهای مؤثر <span class="xpl-hint">(لینک ← دیدن / تغییر)</span></div><table class="xpl-tbl"><tbody>${r.vars.map(v=>{
      const ex = v.link && v.link.x; const idx = ex ? xExpIdx(v.link, depth) : -1;
      return `<tr class="${ex?'xexp clk':''}" ${ex?`onclick="xTog(this,${idx},3)"`:''}><td>${ex?xCar():''}${escHtml(v.label)}</td><td class="xpl-num">${xtxt(v.val)}</td><td>${v.link && !ex ? xl(v.link,'مشاهده / تغییر ↗') : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
  }
  // ── ریز رکوردها
  if(r.records && r.records.rows){
    const rc = r.records, n = rc.rows.length, NC = rc.cols.length;
    out += `<div class="xpl-sec"><div class="xpl-sec-t">📄 ریز رکوردها (${fx(n)} مورد) ${rc.hint?`<span class="xpl-hint">${escHtml(rc.hint)}</span>`:'<span class="xpl-hint">(روی هر ردیف بزن تا باز شود)</span>'}</div>
      <div class="xpl-scroll"><table class="xpl-tbl xpl-rec"><thead><tr>${rc.cols.map(c=>`<th>${escHtml(c)}</th>`).join('')}</tr></thead><tbody>${
      n ? rc.rows.slice(0,500).map(row=>{
        const ex = row.link && row.link.x; const idx = ex ? xExpIdx(row.link, depth) : -1;
        return `<tr class="${row.link?'clk':''}${ex?' xexp':''}" ${ex?`onclick="xTog(this,${idx},${NC})"`:(row.link?xLinkAttr(row.link):'')}>${row.cells.map((c,ci)=>`<td>${ci===0&&ex?xCar():''}${xtxt(c)}</td>`).join('')}</tr>`; }).join('') : `<tr><td colspan="${NC}" class="parts-table-empty">رکوردی نیست.</td></tr>`}
      ${rc.sumsRow ? `<tr class="xpl-res">${rc.sumsRow.map(c=>`<td>${xtxt(c)}</td>`).join('')}</tr>` : (rc.total!==null && rc.total!==undefined && n ? `<tr class="xpl-res">${rc.cols.map((c,i)=>`<td>${i===0?'جمع':(i===rc.totalCol?xtxt(fx(rc.total)+' KT'):'')}</td>`).join('')}</tr>` : '')}
      </tbody></table></div>${n>500?'<div class="xpl-hint">فقط ۵۰۰ ردیف اول نمایش داده شد.</div>':''}</div>`;
  }
  // ── راستی‌آزمایی
  if(checks.length){
    const bad = checks.some(c=>!xclose(c.a, c.b, c.tol===undefined ? 0.6 : c.tol));
    out += `<div class="xpl-sec"><div class="xpl-sec-t">✅ راستی‌آزمایی <span class="xpl-hint">(عدد از مسیر دومی هم سنجیده می‌شود)</span></div>${checks.map(c=>{
      const ok = xclose(c.a, c.b, c.tol===undefined ? 0.6 : c.tol), ff = c.fmt || f;
      return `<div class="xpl-chk ${ok?'ok':'bad'}"><span>${ok?'✅':'❌'}</span><span>${escHtml(c.label)}</span><span class="xpl-num">${xtxt(xfmt(ff,c.a))} ${ok?'=':'≠'} ${xtxt(xfmt(ff,c.b))}</span></div>`; }).join('')}${bad?'<div class="xpl-warn">⚠️ اختلاف دیده شد. از ریز رکوردها و لینک‌های بالا ریشه‌یابی کن؛ معمولاً یکی از اسناد قدیمی ناقص ثبت شده یا فروش بدون موجودی هست.</div>':''}</div>`;
  }
  if(r.note) out += `<div class="xpl-note">💡 ${xtxt(r.note)}</div>`;
  return out;
}
function xRender(){
  XLINKS = []; XEXP = [];
  const body = document.getElementById('xplBody'), nav = document.getElementById('xplNav'), cur = XST[XST.length-1]; if(!body || !cur) return;
  const r = xRun(cur.id, cur.args), f = r.fmt || 'T';
  cur.t = r.title || cur.id;
  const crumbs = XST.map((c,i)=> i===XST.length-1 ? `<b title="${escHtml(c.t||'')}">${escHtml(c.t||c.id)}</b>` : `<a href="javascript:void(0)" class="xl" title="${escHtml(c.t||'')}" onclick="xCrumb(${i})">${escHtml(c.t||c.id)}</a>`).join('<span class="xpl-sep">‹</span>');
  if(nav) nav.innerHTML = `${XST.length>1?`<button type="button" class="xpl-back" onclick="xBack()">→ بازگشت</button>`:''}<div class="xpl-crumbs">${crumbs}</div>`;
  const sc = XSCOPE[r.scope], scopeBadge = sc ? sc[0]+' '+(r.scope==='range' ? sc[1]+xRangeLabel() : sc[1]) : '';
  const srcHtml = r.sources && r.sources.length ? `<div class="xpl-sec"><div class="xpl-sec-t">🔗 منبع داده <span class="xpl-hint">(برو ببین / ویرایش کن)</span></div><div class="xpl-src">${r.sources.map(s=>xl(s.link, '<span class="xpl-srcchip">'+escHtml(s.label)+' ↗</span>')).join('')}</div></div>` : '';
  body.innerHTML = `
    <div class="xpl-hero"><div class="xpl-hero-main">${scopeBadge?`<span class="xpl-badge">${escHtml(scopeBadge)}</span>`:''}<div class="xpl-title">${escHtml(r.title||'')}</div>
      ${r.term?`<div class="xpl-term"><span class="xpl-term-fa">معادل رایج: ${escHtml(r.term)}</span>${r.latin?`<span class="xpl-term-en" dir="ltr">${escHtml(r.latin)}</span>`:''}</div>`:''}</div>
      ${r.noValue?'':`<div class="xpl-val">${xtxt(xfmt(f, r.value))}${f==='T'?`<div class="xpl-val-sub">= ${fx(Math.round((Number(r.value)||0)*1000))} تومان</div>`:''}</div>`}</div>
    ${r.id==='rb_fact' ? srcHtml : ''}${xInner(r, 0)}
    ${r.code?`<details class="xpl-code"><summary>کد دقیق محاسبه (برای ریشه‌یابی فنی)</summary><pre dir="ltr">${escHtml(r.code)}</pre></details>`:''}
    ${r.id==='rb_fact' ? '' : srcHtml}`;
  body.scrollTop = 0;
  if(typeof picScan==='function') picScan(body);
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
  new_customer_orders:'New-Customer Orders', repeat_orders:'Repeat Orders', repeat_rate:'Repeat Rate %', new_customers:'New Customers', orders_per_customer:'Orders per Customer', revenue_per_customer:'Revenue per Customer', profit_per_customer:'Profit per Customer', collect_pct:'Collection Rate %', avg_discount_order:'Avg. Discount per Order', loss_amount:'Loss Amount', loss_lines:'Loss-making Lines', loss_orders:'Loss-making Orders', max_order:'Largest Order', min_order:'Smallest Order', commission_pct:'Commission % of Revenue', days_since_last_sale:'Days Since Last Sale', sell_through:'Sell-through %', days_of_stock:'Days of Stock Cover', inventory_turnover:'Inventory Turnover', gmroi:'GMROI', dead_stock_count:'Dead Stock (SKUs)', dead_stock_value:'Dead Stock Value', return_value_pct:'Return Rate (value) %', expense_to_revenue:'Expense-to-Revenue %', customers_in_debt:'Customers in Debt', avg_customer_debt:'Avg. Customer Debt', stores_with_debt:'Suppliers Owed', pe_spread:'Price Spread', pe_spread_pct:'Price Spread %',
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


// ══════════ v14 — گزارش‌ساز: شروع سریع، شرط‌های آماده، نوار ابزار نتیجه ══════════
// [گروه, شناسه, آیکون, عنوان, توضیح, تنظیمات]
const RB_QUICK_RAW = [
 ['📈 روند و زمان','sales_month','📈','روند فروش ماهانه','درآمد، سود و تعداد فاکتور در هر ماه امسال',{dim:'time',grain:'month',metrics:['revenue','profit','sales_count'],view:'line',rangeChip:'this_year'}],
 ['📈 روند و زمان','sales_day','📅','فروش روزانه‌ی ۳۰ روز اخیر','درآمد و تعداد فاکتور هر روز',{dim:'time',grain:'day',metrics:['revenue','sales_count'],view:'bar',rangeChip:'last30'}],
 ['📈 روند و زمان','sales_week','🗓️','فروش هفتگی (۹۰ روز اخیر)','درآمد و سود هر هفته',{dim:'time',grain:'week',metrics:['revenue','profit'],view:'bar',rangeChip:'last90'}],
 ['📈 روند و زمان','sales_year','🏛️','فروش سالانه','درآمد و سود هر سال شمسی',{dim:'time',grain:'year',metrics:['revenue','profit','margin_pct'],view:'bar'}],
 ['📈 روند و زمان','cum_revenue','📊','درآمد تجمیعی امسال','هر ماه = جمع خودش + ماه‌های قبل',{dim:'time',grain:'month',cumulative:true,metrics:['revenue','profit'],view:'line',rangeChip:'this_year'}],
 ['📈 روند و زمان','profit_month','💹','سود و حاشیه‌ی ماهانه','درآمد، بها، سود، حاشیه و سود خالص هر ماه',{dim:'time',grain:'month',metrics:['revenue','cogs','profit','margin_pct','net_profit_after_exp'],rangeChip:'this_year'}],
 ['📈 روند و زمان','weekday','📆','روزهای پرفروش هفته','تعداد فاکتور و درآمد هر روز هفته',{dim:'weekday',metrics:['sales_count','revenue'],view:'bar'}],
 ['📈 روند و زمان','seasons','🍂','ماه‌های پررونق سال','درآمد و سود هر ماهِ سال (جمع سال‌ها)',{dim:'jmonth',metrics:['revenue','profit','sales_count'],view:'bar'}],
 ['📈 روند و زمان','yseason','🍁','مقایسه‌ی فصل‌ها','درآمد و سود هر فصلِ هر سال',{dim:'yseason',metrics:['revenue','profit','sales_count'],view:'bar'}],
 ['📈 روند و زمان','month_part','📍','اول، میانه یا آخر ماه؟','فروش در سه بخش ماه',{dim:'month_part',metrics:['sales_count','revenue','profit'],view:'pie'}],
 ['📈 روند و زمان','purchases_month','📥','خرید ماهانه','مبلغ خرید و تعداد سفارش هر ماه',{dim:'time',grain:'month',metrics:['purchase_spend','purchases_count'],view:'bar',rangeChip:'this_year'}],
 ['📈 روند و زمان','returns_month','↩️','مرجوعی ماهانه','تعداد و مبلغ مرجوعی هر ماه',{dim:'time',grain:'month',metrics:['returns_count','returned_total'],view:'bar',rangeChip:'this_year'}],
 ['📈 روند و زمان','expenses_month','💸','هزینه‌ی ماهانه','هزینه‌ها و نسبتشان به درآمد',{dim:'time',grain:'month',metrics:['expenses_total','expense_to_revenue'],rangeChip:'this_year'}],
 ['📈 روند و زمان','cashflow_month','🏦','جریان نقدی ماهانه','ورودی، خروجی و خالص هر ماه',{dim:'time',grain:'month',metrics:['cash_in','cash_out','net_cash_flow'],view:'bar',rangeChip:'this_year'}],
 ['👥 مشتریان','top_customers','👑','بهترین مشتری‌ها','۱۰ مشتریِ پرخرید و سودآور',{dim:'customer',metrics:['sales_count','revenue','profit'],sort:'desc',limit:10}],
 ['👥 مشتریان','debtors','🧾','بدهکارترین مشتری‌ها','مانده‌ی بدهی نسیه‌ی هر مشتری',{dim:'customer',metrics:['customer_outstanding'],sort:'desc'}],
 ['👥 مشتریان','new_vs_ret','🆕','مشتری جدید یا قدیمی؟ (ماهانه)','هر ماه چند فاکتور از جدید و چند تا از قدیمی',{dim:'time',dim2:'cust_status',grain:'month',metrics:['sales_count','revenue'],view:'matrix',rangeChip:'this_year'}],
 ['👥 مشتریان','cust_status','🔁','سهم مشتریان جدید و قدیمی','درآمد و سود هر گروه',{dim:'cust_status',metrics:['sales_count','revenue','profit','new_customers'],view:'pie'}],
 ['👥 مشتریان','repeat_rate','♻️','نرخ خرید مجدد ماهانه','چند درصد فاکتورها از مشتری قدیمی است',{dim:'time',grain:'month',metrics:['repeat_rate','new_customers'],view:'line',rangeChip:'this_year'}],
 ['👥 مشتریان','loyal','💎','مشتریان وفادار (۳ فاکتور یا بیشتر)','درآمد و سود فقط مشتریانِ با حداقل ۳ فاکتور',{dim:'customer',metrics:['sales_count','revenue','profit','orders_per_customer'],sort:'desc',where:[{t:'num',dim:'customer',mid:'sales_count',op:'ge',v1:'3',v2:'',from:'',to:''}]}],
 ['👥 مشتریان','sleeping','😴','مشتریان خوابیده','هر مشتری چند روز از آخرین خریدش گذشته',{dim:'customer',metrics:['days_since_last_sale','revenue'],sort:'desc'}],
 ['👥 مشتریان','order_size','🧺','اندازه‌ی فاکتورها','فاکتورهای کم، متوسط و درشت',{dim:'order_size',metrics:['sales_count','revenue','profit'],view:'pie'}],
 ['👥 مشتریان','cust_collect','💳','وصول مطالبات هر مشتری','درصد وصول و مانده‌ی هر مشتری',{dim:'customer',metrics:['invoice_total','amount_received','collect_pct','amount_outstanding'],sort:'desc'}],
 ['📦 کالا و گروه','top_products','🏆','سودآورترین کالاها','۲۰ کالای برتر بر اساس درآمد',{dim:'product',metrics:['units_sold','revenue','profit','margin_pct'],sort:'desc',limit:20}],
 ['📦 کالا و گروه','worst_margin','📉','کم‌حاشیه‌ترین کالاها','کالاهایی که کمترین درصد سود را دارند',{dim:'product',metrics:['units_sold','revenue','profit','margin_pct'],sort:'asc',limit:20}],
 ['📦 کالا و گروه','groups','🌳','عملکرد گروه‌های کالا','فروش و سود درخت گروه‌ها',{dim:'group',metrics:['units_sold','revenue','profit']}],
 ['📦 کالا و گروه','brands','🏷️','برندها','فروش، سود و ارزش موجودی هر برند',{dim:'brand',metrics:['units_sold','revenue','profit','stock_value'],sort:'desc'}],
 ['📦 کالا و گروه','cars','🚗','مدل‌های خودرو','فروش و سود به تفکیک خودرو',{dim:'car_model',metrics:['units_sold','revenue','profit'],sort:'desc'}],
 ['📦 کالا و گروه','variants','🔖','مشخصه‌ها / مدل‌ها','فروش هر مشخصه (مثلاً ۲ فیش)',{dim:'variant',metrics:['units_sold','revenue','profit'],sort:'desc'}],
 ['📦 کالا و گروه','oem','🔢','کدهای فنی (OEM)','فروش به تفکیک کد فنی',{dim:'oem',metrics:['units_sold','revenue','profit'],sort:'desc'}],
 ['📦 کالا و گروه','loss','🔻','فروش‌های زیان‌ده','کالاهایی که ردیف زیان‌ده داشته‌اند',{dim:'product',metrics:['loss_lines','loss_amount'],sort:'desc',where:[{t:'attr',dim:'profit_sign',op:'in',keys:['loss']}]}],
 ['📦 کالا و گروه','price_vs_list','💲','فروش نسبت به قیمت لیست','فروش زیر/برابر/بالاتر از قیمت لیست',{dim:'price_vs_list',metrics:['sale_lines','revenue','profit','discount_pct'],view:'bar'}],
 ['📦 کالا و گروه','discount_band','🏷️','سطح تخفیف‌ها','ردیف‌ها بر اساس درصد تخفیف',{dim:'discount_band',metrics:['sale_lines','item_discount','revenue','profit'],view:'bar'}],
 ['📦 کالا و گروه','qty_band','🔢','تعداد در ردیف (خرده یا عمده)','درآمد و سود هر دسته',{dim:'qty_band',metrics:['sale_lines','units_sold','revenue','profit'],view:'bar'}],
 ['📦 کالا و گروه','margin_band','🎚️','توزیع حاشیه سود ردیف‌ها','چند ردیف در هر بازه‌ی حاشیه',{dim:'margin_band',metrics:['sale_lines','revenue','profit'],view:'bar'}],
 ['📦 کالا و گروه','profit_sign','📈','سودده، زیان‌ده و بدون سود','سهم هر دسته',{dim:'profit_sign',metrics:['sale_lines','revenue','profit'],view:'pie'}],
 ['📦 کالا و گروه','returns_by_product','🔙','مرجوعی هر کالا','تعداد، ارزش و نرخ مرجوعی',{dim:'product',metrics:['units_sold','returned_units','returned_value','return_rate'],sort:'desc',where:[{t:'num',dim:'product',mid:'returned_units',op:'gt',v1:'0',v2:'',from:'',to:''}]}],
 ['🏬 انبار و موجودی','low_stock','⚠️','ناموجود و کم‌موجودی','کالاهایی که موجودی‌شان تمام یا رو به اتمام است',{dim:'product',metrics:['stock_units','reorder_point_avg'],where:[{t:'attr',dim:'stock_status',op:'in',keys:['out','low']}]}],
 ['🏬 انبار و موجودی','dead_stock','🕸️','موجودی راکد','کالاهای موجود که هرگز فروخته نشده‌اند',{dim:'product',metrics:['stock_units','stock_value'],sort:'desc',where:[{t:'attr',dim:'ever_sold',op:'in',keys:['no']}]}],
 ['🏬 انبار و موجودی','stock_status','📦','وضعیت کلی موجودی','چند کالا ناموجود، کم یا عادی است',{dim:'stock_status',metrics:['products_count','stock_units','stock_value'],view:'pie'}],
 ['🏬 انبار و موجودی','stock_by_group','🌳','ارزش موجودی هر گروه','تعداد، موجودی و ارزش',{dim:'group',metrics:['products_count','stock_units','stock_value','potential_profit']}],
 ['🏬 انبار و موجودی','stock_band','📊','بازه‌ی موجودی کالاها','چند کالا در هر بازه‌ی موجودی',{dim:'stock_band',metrics:['products_count','stock_units','stock_value'],view:'bar'}],
 ['🏬 انبار و موجودی','cover','⏳','پوشش موجودی (چند روز می‌رسد؟)','موجودی تقسیم بر فروش روزانه (۹۰ روز اخیر)',{dim:'product',metrics:['stock_units','units_sold','days_of_stock','sell_through'],sort:'desc',rangeChip:'last90',limit:30}],
 ['🏬 انبار و موجودی','turnover','🔄','گردش موجودی گروه‌ها','گردش و بازده سود به موجودی',{dim:'group',metrics:['inventory_turnover','gmroi','stock_value']}],
 ['🏬 انبار و موجودی','no_price','💲','کالاهای بدون قیمت فروش','کالاهایی که هنوز قیمت‌گذاری نشده‌اند',{dim:'product',metrics:['stock_units','stock_value'],where:[{t:'attr',dim:'price_state',op:'in',keys:['no']}]}],
 ['🏬 انبار و موجودی','list_margin','🎚️','حاشیه سود بالقوه‌ی کالاها','با قیمت لیست فعلی',{dim:'list_margin_band',metrics:['products_count','stock_value','potential_profit'],view:'bar'}],
 ['📥 خرید و تامین‌کننده','suppliers','🏬','خرید از تامین‌کننده‌ها','مبلغ خرید، تعداد سفارش و بدهی',{dim:'store',metrics:['purchase_spend','purchases_count','purchase_outstanding'],sort:'desc'}],
 ['📥 خرید و تامین‌کننده','supplier_debt','🧮','بدهی به تامین‌کننده‌ها','مانده‌ی بدهی هر تامین‌کننده',{dim:'store',metrics:['store_payable'],sort:'desc'}],
 ['📥 خرید و تامین‌کننده','buy_products','📦','خرید به تفکیک کالا','تعداد، مبلغ و میانگین قیمت خرید',{dim:'product',metrics:['units_purchased','purchase_spend','avg_buy_price'],sort:'desc'}],
 ['📥 خرید و تامین‌کننده','buy_matrix','🔲','تامین‌کننده × کالا','مبلغ خرید هر کالا از هر تامین‌کننده',{dim:'store',dim2:'product',metrics:['purchase_spend'],view:'matrix'}],
 ['📥 خرید و تامین‌کننده','purchase_size','🧺','اندازه‌ی سفارش‌های خرید','سفارش‌های کوچک و بزرگ',{dim:'order_size',metrics:['purchases_count','purchase_spend'],view:'bar',}],
 ['📥 خرید و تامین‌کننده','pricelist','🏷️','قیمت‌های لیست‌شده','کمترین، بیشترین و اختلاف قیمت هر کالا',{dim:'product',metrics:['pe_count','pe_min','pe_max','pe_spread_pct'],sort:'desc'}],
 ['📥 خرید و تامین‌کننده','pricelist_store','🏪','لیست قیمت هر تامین‌کننده','تعداد و میانگین قیمت‌های ثبت‌شده',{dim:'store',metrics:['pe_count','pe_avg']}],
 ['📥 خرید و تامین‌کننده','buy_group','🌳','خرید به تفکیک گروه','تعداد و مبلغ خرید هر گروه',{dim:'group',metrics:['units_purchased','purchase_spend']}],
 ['💰 مالی و صندوق','net_profit','💹','سود خالص کل','درآمد، بها، سود ناخالص، هزینه و سود خالص',{dim:'all',metrics:['revenue','cogs','profit','expenses_total','commission','net_profit_after_exp']}],
 ['💰 مالی و صندوق','expenses','💸','هزینه‌ها به تفکیک دسته','هر دسته هزینه چقدر شده',{dim:'expense_category',metrics:['expenses_total','expenses_count','expense_share'],view:'pie',sort:'desc'}],
 ['💰 مالی و صندوق','cash_types','🏦','گردش صندوق به تفکیک نوع','ورودی و خروجی هر نوع',{dim:'cash_type',metrics:['cash_in','cash_out','net_cash_flow']}],
 ['💰 مالی و صندوق','cash_dir','↕️','ورودی در برابر خروجی صندوق','تعداد و مبلغ',{dim:'cash_dir',metrics:['cash_txn_count','cash_in','cash_out'],view:'bar'}],
 ['💰 مالی و صندوق','capital','🏛️','سرمایه‌ی ماهانه','واریز، برداشت و خالص',{dim:'time',grain:'month',metrics:['deposits','withdrawals','net_capital_flow'],rangeChip:'this_year'}],
 ['💰 مالی و صندوق','tax','🧾','مالیات ماهانه','مالیات جمع‌آوری‌شده و پرداخت‌شده',{dim:'time',grain:'month',metrics:['tax_collected','tax_paid'],rangeChip:'this_year'}],
 ['💰 مالی و صندوق','position','⚖️','وضعیت مالی کل','مطالبات، بدهی‌ها، مالیات، سرمایه',{dim:'all',metrics:['tot_ar','tot_ap','tot_tax','tot_comm','tot_biz','tot_capital']}],
 ['💰 مالی و صندوق','payment_status','💳','وضعیت پرداخت فاکتورها','تعداد و مبلغ هر وضعیت',{dim:'pay_status',metrics:['sales_count','invoice_total','amount_received','amount_outstanding']}],
 ['🚚 ارسال و تحویل','delivery','🚚','روش‌های تحویل','تعداد، درآمد و هزینه‌ی ارسال',{dim:'delivery',metrics:['sales_count','revenue','ship_charged','ship_paid']}],
 ['🚚 ارسال و تحویل','ship_mode','📮','چه کسی هزینه‌ی ارسال را داده؟','مشتری، ما، نصف‌نصف یا حضوری',{dim:'ship_mode',metrics:['sales_count','ship_charged','ship_paid','ship_absorbed'],view:'bar'}],
 ['🚚 ارسال و تحویل','ship_cover','🛵','پوشش هزینه‌ی ارسال هر روش','چند درصد هزینه‌ی پیک از مشتری گرفته شد',{dim:'delivery',metrics:['ship_charged','ship_paid','ship_cover_pct']}],
 ['🚚 ارسال و تحویل','pickup_month','🏪','سهم تحویل حضوری ماهانه','درصد فاکتورهای حضوری',{dim:'time',grain:'month',metrics:['pickup_pct','shipped_orders'],view:'line',rangeChip:'this_year'}],
 ['🧑‍💼 نمایندگان','agents','🧑‍💼','عملکرد نماینده‌ها','درآمد، سود و پورسانت',{dim:'agent',metrics:['revenue','profit','commission'],sort:'desc'}],
 ['🧑‍💼 نمایندگان','agent_month','🔲','نماینده × ماه','درآمد هر نماینده در هر ماه',{dim:'agent',dim2:'time',grain:'month',metrics:['revenue'],view:'matrix',rangeChip:'this_year'}],
 ['🧑‍💼 نمایندگان','payouts','💵','پورسانت نماینده‌ها','محاسبه‌شده، پرداخت‌شده و باقی‌مانده',{dim:'agent',metrics:['agent_accrued_total','agent_paid_total','agent_payable','payout_pct']}],
 ['↩️ مرجوعی','returns','↩️','مرجوعی به تفکیک دلیل','تعداد و مبلغ هر دلیل',{dim:'return_reason',metrics:['returns_count','returned_units','returned_total']}],
 ['↩️ مرجوعی','return_cust','👥','مرجوعی هر مشتری','کدام مشتری بیشتر مرجوع می‌کند',{dim:'customer',metrics:['returns_count','returned_total'],sort:'desc',where:[{t:'num',dim:'customer',mid:'returns_count',op:'gt',v1:'0',v2:'',from:'',to:''}]}],
 ['↩️ مرجوعی','return_group','🌳','نرخ مرجوعی ارزشی هر گروه','کدام گروه بیشتر برمی‌گردد',{dim:'group',metrics:['return_value_pct','returned_value']}],
 ['↩️ مرجوعی','refund_kind','💵','مرجوعی با یا بدون بازگشت وجه','نقدی در برابر کسر از بدهی',{dim:'refund_kind',metrics:['returns_count','returned_total','cash_refunded'],view:'bar'}],
 ['🎁 باندل و تخفیف','bundles','🎁','باندل‌ها و جایزه‌ها','درآمد و هزینه‌ی هر باندل',{dim:'bundle',metrics:['bundle_orders','bundle_revenue','profit','reward_cost']}],
 ['🎁 باندل و تخفیف','bundle_role','🎀','نقش ردیف در باندل','قلم باندل، جایزه یا فروش عادی',{dim:'bundle_role',metrics:['sale_lines','revenue','profit','bundle_discount'],view:'bar'}],
 ['🎁 باندل و تخفیف','bundle_month','📈','روند باندل‌ها','سهم باندل از درآمد هر ماه',{dim:'time',grain:'month',metrics:['bundle_orders','bundle_revenue','bundle_share'],rangeChip:'this_year'}],
 ['🎁 باندل و تخفیف','discounts','🏷️','تخفیف داده‌شده','با تخفیف در برابر بدون تخفیف',{dim:'disc_flag',metrics:['sales_count','discount_total','revenue','profit'],view:'bar'}],
 ['🎁 باندل و تخفیف','disc_agent','🧑‍💼','تخفیف هر نماینده','چه کسی بیشتر تخفیف می‌دهد',{dim:'agent',metrics:['discount_total','discount_pct','revenue'],sort:'desc'}],
 ['🎁 باندل و تخفیف','disc_cust','👥','تخفیف هر مشتری','مجموع تخفیف گرفته‌شده',{dim:'customer',metrics:['discount_total','discount_pct','revenue'],sort:'desc'}],
];
const RB_QUICK = RB_QUICK_RAW.map(([g,id,ic,t,d,c])=>({g,id,ic,t,d,c}));
let RB_QK_GROUP = '', RB_QK_Q = '';
function rbQuick(id){
  const q = RB_QUICK.find(x=>x.id===id); if(!q) return;
  RB = Object.assign(rbDefaults(), JSON.parse(JSON.stringify(q.c)), {presetId:'', calMonth:null});
  if(q.c.where) RB.where = {t:'expr', items:q.c.where.map(w=>Object.assign({lk:'and', po:0, pc:0}, w))};
  if(RB.rangeChip && RB.rangeChip!=='all'){ const r = rbRangeFor(RB.rangeChip); RB.from = r.from; RB.to = r.to; }
  RB_OPEN.where = !!q.c.where || RB_OPEN.where; RB_OPEN.quick = false; try{ localStorage.setItem('elevate_rb_open', JSON.stringify(RB_OPEN)); }catch(e){}
  rbWriteControls(); rbRender(); rbJumpResult();
}
function rbJumpResult(){ const o = document.getElementById('rbOutput'); if(o && o.scrollIntoView) o.scrollIntoView({behavior:'smooth', block:'start'}); }
function rbQkSet(g){ RB_QK_GROUP = g; rbRenderQuick(); }
function rbQkFind(v){ RB_QK_Q = v; rbRenderQuick(true); }
function rbRenderQuick(keepFocus){
  const el = document.getElementById('rbQuick'); if(!el) return;
  const groups = [...new Set(RB_QUICK.map(q=>q.g))];
  const nq = rbNorm(RB_QK_Q);
  const list = RB_QUICK.filter(q=>(!RB_QK_GROUP || q.g===RB_QK_GROUP) && (!nq || rbNorm(q.t+' '+q.d+' '+q.g).includes(nq)));
  el.innerHTML = `<div class="rbx-qbar"><label class="rbx-f"><span class="rbx-cap">دسته‌ی گزارش‌های آماده</span><select class="modal-input" onchange="rbQkSet(this.value)"><option value="">همه‌ی دسته‌ها (${fx(RB_QUICK.length)} گزارش)</option>${groups.map(g=>`<option value="${escHtml(g)}"${g===RB_QK_GROUP?' selected':''}>${escHtml(g)} (${fx(RB_QUICK.filter(q=>q.g===g).length)})</option>`).join('')}</select></label>
    <label class="rbx-f rbx-grow"><span class="rbx-cap">جستجو در گزارش‌های آماده</span><input type="text" class="modal-input" id="rbQkFind" dir="auto" placeholder="🔍 مثلاً: موجودی، مشتری، ماهانه…" value="${escHtml(RB_QK_Q)}" oninput="rbQkFind(this.value)"/></label></div>`
    + `<div class="rbx-qgrid">` + (list.map(q=>`<button type="button" class="rbx-qc" onclick="rbQuick('${q.id}')"><span class="rbx-qc-t">${q.ic} ${escHtml(q.t)}</span><span class="rbx-qc-d">${escHtml(q.d)}</span>${RB_QK_GROUP?'':`<span class="rbx-qc-g">${escHtml(q.g)}</span>`}</button>`).join('') || '<div class="rbx-empty">گزارشی با این نام پیدا نشد.</div>') + `</div>`;
  if(keepFocus){ const i = document.getElementById('rbQkFind'); if(i){ i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
}
// ── شرط‌های آماده ──
const rbN = (dim,mid,op,v1,v2)=>({t:'num',dim,mid,op,v1:String(v1),v2:v2===undefined?'':String(v2),from:'',to:''});
const rbA = (dim,keys,op)=>({t:'attr',dim,op:op||'in',keys});
const rbD = chip=>()=>{ const r = rbRangeFor(chip); return {t:'dt',op:'in',from:r.from,to:r.to}; };
const rbR = (field,op,v1,v2)=>({t:'row',field,op,v1:String(v1),v2:v2===undefined?'':String(v2)});
const RB_QCOND_GROUPS = [
 ['💰 فروش و سود',[
  ['loss','🔻 فقط ردیف‌های زیان‌ده',rbA('profit_sign',['loss'])],['gain','🟢 فقط ردیف‌های سودده',rbA('profit_sign',['gain'])],['zero','⚪ بدون سود و زیان',rbA('profit_sign',['zero'])],
  ['mlow','📉 حاشیه سود کمتر از ۱۰٪',rbA('margin_band',['b1','b2'])],['mhigh','📈 حاشیه سود بالای ۴۰٪',rbA('margin_band',['b5'])],['free','🎁 ردیف‌های رایگان (بدون درآمد)',rbA('margin_band',['m0'])],
  ['below','⬇️ فروش زیر قیمت لیست',rbA('price_vs_list',['below'])],['above','⬆️ فروش بالاتر از قیمت لیست',rbA('price_vs_list',['above'])],
  ['disc','🏷️ فقط تخفیف‌دار',rbA('disc_flag',['yes'])],['nodisc','🚫 بدون تخفیف',rbA('disc_flag',['no'])],['bigdisc','💥 تخفیف بیش از ۱۰٪',rbA('discount_band',['b4','b5'])],
  ['hasret','↩️ ردیف‌های دارای مرجوعی',rbA('has_return',['yes'])],['noret','✅ ردیف‌های بدون مرجوعی',rbA('has_return',['no'])],
  ['bigord','🧺 فاکتورهای درشت (بیش از KT ۵٬۰۰۰)',rbA('order_size',['b4','b5'])],['smallord','🧺 فاکتورهای کوچک (زیر KT ۵۰۰)',rbA('order_size',['b1'])],
  ['bulk','📦 فروش عمده (۱۰ عدد و بیشتر)',rbA('qty_band',['b4','b5'])],['single','1️⃣ فروش تکی',rbA('qty_band',['b1'])],
  ['rev1k','💵 ردیف‌های با درآمد ≥ KT ۱٬۰۰۰',rbR('revenue','ge',1000)],['negprofit','🔻 ردیف با سود < ۰',rbR('profit','lt',0)],
 ]],
 ['👥 مشتری و پرداخت',[
  ['newc','🆕 فقط مشتری جدید',rbA('cust_status',['new'])],['retc','🔁 فقط مشتری قدیمی',rbA('cust_status',['ret'])],['anon','🕶️ مشتری متفرقه',rbA('cust_status',['anon'])],
  ['credit','🧾 فقط نسیه / پرداخت جزئی',rbA('pay_status',['unpaid','partial'])],['paid','✅ فقط پرداخت‌شده',rbA('pay_status',['paid'])],['unpaid','⏳ فقط نسیه‌ی کامل',rbA('pay_status',['unpaid'])],
  ['debtor','💳 فقط مشتریان بدهکار',rbA('debt_state',['debtor'])],['clearc','🟢 مشتریان تسویه',rbA('debt_state',['clear'])],
  ['loyal3','💎 مشتریانی با ≥ ۳ فاکتور',rbN('customer','sales_count','ge',3)],['bigbuyer','🐋 مشتریانی با خرید > KT ۱٬۰۰۰',rbN('customer','revenue','gt',1000)],['over500','🔴 مشتریانی با بدهی > KT ۵۰۰',rbN('customer','amount_outstanding','gt',500)],
 ]],
 ['🚚 ارسال، مالیات و باندل',[
  ['pickup','🏪 فقط تحویل حضوری',rbA('ship_mode',['pickup'])],['shipbiz','🚚 ارسال به‌حساب ما',rbA('ship_mode',['business'])],['shipcust','📮 ارسال به‌حساب مشتری',rbA('ship_mode',['customer'])],['shipsplit','➗ ارسال نصف‌نصف',rbA('ship_mode',['split'])],
  ['tax','🧾 فقط فاکتورهای مالیاتی',rbA('tax_flag',['yes'])],['notax','🚫 بدون مالیات',rbA('tax_flag',['no'])],
  ['bundle','🎁 فقط ردیف‌های باندل',rbA('bundle_role',['req','reward'])],['reward','🎀 فقط جایزه‌ها',rbA('bundle_role',['reward'])],['nobundle','▫️ بدون باندل',rbA('bundle_role',['none'])],
  ['agent','🧑‍💼 فقط فروش با نماینده',rbA('agent',[''],'notin')],['noagent','🙋 فروش مستقیم (بدون نماینده)',rbA('agent',[''])],
 ]],
 ['⏱️ زمان',[
  ['wkend','🌴 پنج‌شنبه و جمعه',rbA('weekday',['5','6'])],['wkday','💼 شنبه تا چهارشنبه',rbA('weekday',['0','1','2','3','4'])],
  ['early','📍 اول ماه',rbA('month_part',['1'])],['mid','📍 میانه‌ی ماه',rbA('month_part',['2'])],['late','📍 آخر ماه',rbA('month_part',['3'])],
  ['spring','🌸 بهار',rbA('season',['1'])],['summer','☀️ تابستان',rbA('season',['2'])],['autumn','🍂 پاییز',rbA('season',['3'])],['winter','❄️ زمستان',rbA('season',['4'])],
  ['d_month','📅 فقط این ماه',rbD('this_month')],['d_last','📅 فقط ماه گذشته',rbD('last_month')],['d_30','📅 ۳۰ روز اخیر',rbD('last30')],['d_90','📅 ۹۰ روز اخیر',rbD('last90')],['d_season','📅 این فصل',rbD('this_season')],['d_year','📅 امسال',rbD('this_year')],
 ]],
 ['🏬 انبار و کالا',[
  ['out','⛔ فقط ناموجود',rbA('stock_status',['out'])],['low','⚠️ کم‌موجودی',rbA('stock_status',['low'])],['okst','✅ موجودی عادی',rbA('stock_status',['ok'])],['dead','🕸️ راکد (هرگز فروخته‌نشده)',rbA('ever_sold',['no'])],['sold','💰 کالاهای فروخته‌شده',rbA('ever_sold',['yes'])],
  ['noprice','💲 بدون قیمت فروش',rbA('price_state',['no'])],['noreorder','🔔 بدون نقطه سفارش',rbA('reorder_state',['no'])],['highstock','📦 موجودی بیش از ۱۰۰ عدد',rbA('stock_band',['b5'])],['negmargin','🔻 قیمت لیست زیر بها',rbA('list_margin_band',['b1'])],
  ['slow','🐢 کالاهایی با فروش ≤ ۱ عدد',rbN('product','units_sold','le',1)],['fast','🚀 کالاهایی با فروش ≥ ۱۰ عدد',rbN('product','units_sold','ge',10)],['lowleft','📉 کالاهایی با موجودی ≤ ۲',rbN('product','stock_units','le',2)],
 ]],
 ['📥 خرید، مرجوعی و صندوق',[
  ['owed','🧮 تامین‌کنندگانِ طلبکار از ما',rbA('store_debt',['owed'])],['freeship','🚚 تامین‌کنندگانِ دارای ارسال رایگان مشروط',rbA('free_ship_state',['yes'])],['big_sup','🏬 تامین‌کنندگانی با خرید > KT ۲٬۰۰۰',rbN('store','purchase_spend','gt',2000)],
  ['retcash','💵 مرجوعی با بازگشت وجه',rbA('refund_kind',['cash'])],['restock','♻️ مرجوعیِ برگشته به انبار',rbA('restock_flag',['yes'])],['norestock','🗑️ مرجوعیِ برنگشته به انبار',rbA('restock_flag',['no'])],
  ['cin','⬇️ فقط ورودی صندوق',rbA('cash_dir',['in'])],['cout','⬆️ فقط خروجی صندوق',rbA('cash_dir',['out'])],['pe_group','🌳 قیمت‌های ثبت‌شده برای گروه',rbA('price_source',['group'])],
 ]],
 ['🔤 جستجوی متنی (نمونه)',[
  ['t_relay','🔌 کالاهایی که «رله» در نامشان است',{t:'txt',dim:'product',op:'has',text:'رله'}],['t_sensor','📡 کالاهایی که «سنسور» در نامشان است',{t:'txt',dim:'product',op:'has',text:'سنسور'}],['t_samand','🚗 مدل خودرو شامل «سمند»',{t:'txt',dim:'car_model',op:'has',text:'سمند'}],['t_peugeot','🚗 مدل خودرو شامل «۴۰۵»',{t:'txt',dim:'car_model',op:'has',text:'۴۰۵'}],
 ]],
];
const RB_QCOND = RB_QCOND_GROUPS.flatMap(([g,arr])=>arr.map(([id,t,spec])=>[id,t,spec,g]));
let RB_QC_GROUP = RB_QCOND_GROUPS[0][0];
function rbQcSpec(spec){ return typeof spec==='function' ? spec() : JSON.parse(JSON.stringify(spec)); }
function rbQcOk(spec){
  const x = rbQcSpec(spec);
  if(x.t==='attr') return rbDimOk(x.dim, RB.metrics);
  if(x.t==='num') return rbDimOk(x.dim, RB.metrics) && !!rbNumVar(x.dim, x.mid);
  if(x.t==='txt') return rbDimOk(x.dim, RB.metrics);
  return true;
}
function rbQcPick(g){ RB_QC_GROUP = g; rbRenderWhere(); }
function rbQuickCondHtml(){
  const grp = RB_QCOND_GROUPS.find(x=>x[0]===RB_QC_GROUP) || RB_QCOND_GROUPS[0];
  return `<div class="rbx-qcond"><label class="rbx-f"><span class="rbx-cap">⚡ شرط‌های آماده (یک کلیک) — دسته:</span><select class="modal-input" onchange="rbQcPick(this.value)">${RB_QCOND_GROUPS.map(([g,a])=>`<option value="${escHtml(g)}"${g===grp[0]?' selected':''}>${escHtml(g)} (${fx(a.length)})</option>`).join('')}</select></label>
   <div class="rbx-qcond-l">` + grp[1].map(([id,t,spec])=>{
    const ok = rbQcOk(spec);
    return `<button type="button" class="rb-chip rb-chip-add" ${ok?'':'disabled title="با متغیرهای انتخاب‌شده سازگار نیست"'} onclick="rbQuickCond('${id}')">${t}</button>`;
  }).join('') + `</div></div>`;
}
function rbQuickCond(id){
  const q = RB_QCOND.find(x=>x[0]===id); if(!q) return;
  if(RB.where.items.length >= 40){ showToast('حداکثر ۴۰ شرط','error'); return; }
  RB.where.items.push(Object.assign({lk:'and', po:0, pc:0}, rbQcSpec(q[2])));
  rbWAfter(true);
}
function rbResultToolbar(res){
  const views = rbViewsFor(res.cfg.dim, res.cfg.dim2);
  const seg = views.map(v=>`<button type="button" class="${RB.view===v?'on':''}" onclick="rbSetView('${v}')">${escHtml(RB_VIEWS[v])}</button>`).join('');
  const lim = [5,10,20,0].map(n=>`<button type="button" class="${(RB.limit||0)===n?'on':''}" onclick="rbSetLimit(${n})">${n?fx(n):'همه'}</button>`).join('');
  const srt = [['desc','⬇ بیشترین'],['asc','⬆ کمترین'],['natural','↕ طبیعی']].map(([k,t])=>`<button type="button" class="${RB.sort===k?'on':''}" onclick="rbSetSort('${k}')">${t}</button>`).join('');
  const canTop = res.cfg.dim!=='all' && !(res.cfg.dim==='time');
  return `<div class="rbx-rtool"><div class="rbx-rt-g"><span class="rbx-cap">نمایش</span><span class="rbx-seg rbx-seg-wrap">${seg}</span></div>`
   + (canTop ? `<div class="rbx-rt-g"><span class="rbx-cap">تعداد ردیف</span><span class="rbx-seg">${lim}</span></div><div class="rbx-rt-g"><span class="rbx-cap">ترتیب</span><span class="rbx-seg">${srt}</span></div>` : '')
   + `<div class="rbx-rt-g rbx-rt-find"><input type="text" class="modal-input" id="rbRowFind" placeholder="🔍 جستجو در ردیف‌های نتیجه…" dir="auto" oninput="rbRowFilter(this.value)"/></div></div>`;
}
function rbSetView(v){ RB.view = v; rbWriteControls(); rbRender(); }
function rbSetLimit(n){ RB.limit = n; rbWriteControls(); rbRender(); }
function rbSetSort(k){ RB.sort = k; rbWriteControls(); rbRender(); }
function rbRowFilter(q){
  q = String(q||'').trim().toLowerCase();
  document.querySelectorAll('#rbOutput table tbody tr').forEach(tr=>{ tr.style.display = (!q || tr.textContent.toLowerCase().includes(q)) ? '' : 'none'; });
}

// ══════════════════════════════════════════════════════════════════════════════
//  🏠 داشبورد خانه (Home dashboard) — صفحه‌ی اول بخش قطعات
//  همه‌ی اعداد از «موتور گزارش‌ساز» (rbCompute) می‌آیند؛ پس با گزارش‌ساز، گزارشات و ⓘ دقیقاً یکی‌اند.
//  هر عدد/چارت یک ⓘ دارد که تا خودِ تراکنش قابل ردیابی است (xdef 'dsh_cell' → rb_cell → rb_term → rb_fact).
//  چارت‌ها SVG خالص‌اند (بدون کتابخانه) و با CSS انیمیت می‌شوند؛ همه‌ی نام‌ها پیشوند dsh دارند.
// ══════════════════════════════════════════════════════════════════════════════
const DSH_PERIODS = [['today','امروز','Today'],['7d','۷ روز اخیر','7 days'],['30d','۳۰ روز اخیر','30 days'],['month','این ماه','This month'],['year','امسال','This year'],['all','همه‌ی زمان‌ها','All time']];
const DSH_DONUTS = [['group_leaf','گروه کالا'],['brand','برند'],['delivery','روش ارسال'],['pay_status','وضعیت پرداخت'],['cust_status','مشتری جدید/قدیمی']];
const DSH = {period:'month', donut:'group_leaf', goal:0, goalEdit:false, skipNext:false, uid:0, resizeT:0, lastW:0};
const DSH_COL = ['#e85d3a','#3a7a5a','#2a6a9a','#d4821a','#7a3a6a','#c44a6a','#8a8a7a'];

function dshLoadSettings(){
  const s = PARTS.dash_settings || {};
  if(DSH_PERIODS.some(p=>p[0]===s.period)) DSH.period = s.period;
  if(DSH_DONUTS.some(p=>p[0]===s.donut)) DSH.donut = s.donut;
  DSH.goal = Math.max(0, Number(s.goal)||0);
  try{ picApply(s.icon_style||'3d'); }catch(e){}
}
async function dshSave(patch){
  const cur = Object.assign({}, PARTS.dash_settings||{}, {period:DSH.period, donut:DSH.donut, goal:DSH.goal}, patch||{});
  DSH.skipNext = true;
  const r = await postParts('save_dash_settings', {settings:cur});
  DSH.skipNext = false;
  return r;
}

// ── range helpers ──
function dshRange(p){
  const t = isoToday(), tj = isoToJ(t);
  switch(p){
    case 'today': return {from:t, to:t};
    case '7d': return {from:isoAdd(t,-6), to:t};
    case '30d': return {from:isoAdd(t,-29), to:t};
    case 'month': return {from:jToIso(tj.y,tj.m,1), to:t};
    case 'year': return {from:jToIso(tj.y,1,1), to:t};
    default: return {from:'', to:''};
  }
}
function dshPrevRange(p, r){
  if(p==='all' || !r.from) return null;
  const n = isoDiff(r.from, r.to)+1, fj = isoToJ(r.from);
  if(p==='month'){
    let y = fj.y, m = fj.m-1; if(m<1){ m = 12; y--; }
    const from = jToIso(y,m,1), end = jToIso(y,m,jMonthLen(y,m));
    const to = isoAdd(from, n-1); return {from, to: to>end ? end : to};
  }
  if(p==='year'){ const from = jToIso(fj.y-1,1,1); return {from, to:isoAdd(from, n-1)}; }
  return {from:isoAdd(r.from,-n), to:isoAdd(r.from,-1)};
}
function dshPrevLabel(p){ return ({today:'دیروز','7d':'۷ روز قبلِ آن','30d':'۳۰ روز قبلِ آن',month:'هم‌بازه‌ی ماه قبل',year:'هم‌بازه‌ی سال قبل'})[p] || ''; }
function dshCfg(extra, r){
  return Object.assign({dim:'all', metrics:[], rangeChip:'custom', from:r.from||'', to:r.to||'', hideZero:false, fillZero:true, sort:'natural', limit:0, grain:'day', view:'table'}, extra||{});
}
function dshFirstDate(){
  let m = null; (rbFacts||[]).forEach(f=>{ if(f.date && (f.k==='sl'||f.k==='pl'||f.k==='cl'||f.k==='ex') && (!m || f.date < m)) m = f.date; });
  return m;
}
const dshShortDay = iso => { const j = isoToJ(iso); return faDigits(j.d)+' '+FA_MONTHS[j.m-1]; };
const dshPct = (a, b)=> (b && isFinite(b) && Math.abs(b)>1e-9) ? (a-b)/Math.abs(b)*100 : null;
const dshEsc = escHtml;
function dshFmt(v, f){
  if(f==='T') return fmtT(v);
  if(f==='pct') return '⁦'+fx(v)+'٪⁩';
  return fx(v);
}
function dshShort(v){
  const a = Math.abs(v), s = v<0 ? '-' : '';
  if(a>=1e6) return s+(Math.round(a/1e5)/10)+'M';
  if(a>=1e3) return s+(Math.round(a/100)/10)+'k';
  return s+(Math.round(a*10)/10);
}
function dshNiceMax(v){
  if(!(v>0)) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(v))), n = v/e;
  return (n<=1?1:n<=2?2:n<=2.5?2.5:n<=5?5:10)*e;
}
function dshX(cfg, mi, ri, ck){   // ⓘ button that opens the full trace of one dashboard number
  const a = {cfg, mi, ri}; if(ck!==undefined) a.ck = ck;
  return xBtn('dsh_cell', a, 'xi-mini');
}
function dshSmooth(pts){
  if(!pts.length) return '';
  let d = 'M'+pts[0][0].toFixed(1)+','+pts[0][1].toFixed(1);
  for(let i=0;i<pts.length-1;i++){
    const p0 = pts[i-1]||pts[i], p1 = pts[i], p2 = pts[i+1], p3 = pts[i+2]||p2;
    const lo = Math.min(p1[1],p2[1]), hi = Math.max(p1[1],p2[1]);
    const cl = y=>Math.max(lo, Math.min(hi, y));
    d += ` C${(p1[0]+(p2[0]-p0[0])/6).toFixed(1)},${cl(p1[1]+(p2[1]-p0[1])/6).toFixed(1)} ${(p2[0]-(p3[0]-p1[0])/6).toFixed(1)},${cl(p2[1]-(p3[1]-p1[1])/6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

// ── data layer ──
function dshData(){
  rbEnsureCustomMetrics();
  if(!rbFacts) rbFacts = buildFacts();
  const R = {}; R.period = DSH.period; R.range = dshRange(DSH.period);
  if(DSH.period==='all'){ R.range.from = dshFirstDate() || isoToday(); }   // «to» stays empty = through the last transaction (even a future-dated one)
  R.prevRange = dshPrevRange(DSH.period, R.range);
  const kpiIds = DSH_KPI.map(k=>k.id), snapIds = DSH_SNAP.map(k=>k.id), allIds = kpiIds.concat(snapIds);
  R.cfgCur = dshCfg({metrics:allIds}, R.range);
  R.cur = rbCompute(R.cfgCur, true);
  if(!R.range.to) R.range.to = R.cur.eff.to;
  if(R.prevRange){ R.cfgPrev = dshCfg({metrics:allIds}, R.prevRange); R.prev = rbCompute(R.cfgPrev, true); }
  // time series (trend, sparklines, cash)
  const t = R.range.to; let sf = R.range.from; if(DSH.period!=='all' && isoDiff(sf, t) < 13) sf = isoAdd(t,-13);
  const span = isoDiff(sf, t)+1;
  R.grain = span<=45 ? 'day' : (span<=200 ? 'week' : 'month');
  R.serFrom = sf;
  R.serIds = ['revenue','profit','sales_count','net_profit_after_exp','avg_order_value','margin_pct','cash_balance','cash_in','cash_out','net_cash_flow'];
  R.cfgSer = dshCfg({dim:'time', grain:R.grain, metrics:R.serIds}, {from:sf, to:t});
  R.ser = rbCompute(R.cfgSer, true);
  // donut
  R.cfgDon = dshCfg({dim:DSH.donut, metrics:['revenue','profit'], sort:'desc', hideZero:true}, R.range);
  R.don = rbCompute(R.cfgDon, true);
  // top products / customers / weekday
  R.cfgTop = dshCfg({dim:'product', metrics:['revenue','profit','units_sold'], sort:'desc', limit:6, hideZero:true}, R.range);
  R.top = rbCompute(R.cfgTop, true);
  R.cfgCus = dshCfg({dim:'customer', metrics:['revenue','profit','sales_count'], sort:'desc', limit:5, hideZero:true}, R.range);
  R.cus = rbCompute(R.cfgCus, true);
  R.cfgWd = dshCfg({dim:'weekday', metrics:['revenue','sales_count'], hideZero:false}, R.range);
  R.wd = rbCompute(R.cfgWd, true);
  // stock health (a snapshot of today)
  R.cfgStk = dshCfg({dim:'stock_status', metrics:['products_count','stock_value'], hideZero:false}, {from:'', to:isoToday()});
  R.cfgStk.rangeChip = 'all';
  R.stk = rbCompute(R.cfgStk, true);
  // heatmap: last 26 weeks, aligned to whole weeks (Saturday-first)
  const today = isoToday(), wd = isoWeekdaySat(today);
  R.heatFrom = isoAdd(today, -(wd + 25*7)); R.heatTo = today;
  R.cfgHeat = dshCfg({dim:'time', grain:'day', metrics:['revenue']}, {from:R.heatFrom, to:R.heatTo});
  R.heat = rbCompute(R.cfgHeat, true);
  // hero: last 28 days (previous 14 + current 14)
  R.cfgHero = dshCfg({dim:'time', grain:'day', metrics:['revenue','profit','sales_count']}, {from:isoAdd(isoToday(),-27), to:isoToday()}); R.hero = rbCompute(R.cfgHero, true);
  // today strip, profit waterfall, gauges, customers, agents, suppliers
  const td = isoToday();
  R.cfgToday = dshCfg({metrics:['revenue','profit','sales_count']}, {from:td, to:td}); R.today = rbCompute(R.cfgToday, true);
  R.cfgWf = dshCfg({metrics:['revenue','cogs','profit','expenses_total','commission','net_profit_after_exp']}, R.range); R.wf = rbCompute(R.cfgWf, true);
  R.cfgGa = dshCfg({metrics:['margin_pct','collect_pct','expense_to_revenue','return_value_pct']}, R.range); R.ga = rbCompute(R.cfgGa, true);
  R.cfgCa = dshCfg({metrics:['active_customers','new_customers','repeat_rate','orders_per_customer','new_customer_orders','repeat_orders','revenue_per_customer']}, R.range); R.ca = rbCompute(R.cfgCa, true);
  R.cfgAg = dshCfg({dim:'agent', metrics:['revenue','commission','sales_count'], sort:'desc', limit:5, hideZero:true}, R.range); R.ag = rbCompute(R.cfgAg, true);
  R.cfgSu = dshCfg({dim:'store', metrics:['purchase_spend','purchase_outstanding','purchases_count'], sort:'desc', limit:5, hideZero:true}, R.range); R.su = rbCompute(R.cfgSu, true);
  if(R.prevRange && R.serFrom===R.range.from){ R.cfgSerP = dshCfg({dim:'time', grain:R.grain, metrics:['revenue']}, R.prevRange); R.serP = rbCompute(R.cfgSerP, true); }
  // current-month goal (month-to-date)
  const mr = dshRange('month'); R.monthRange = mr;
  R.cfgMon = dshCfg({metrics:['revenue','profit']}, mr); R.mon = rbCompute(R.cfgMon, true);
  // alerts are "as of today" (all time)
  R.alertIds = ['low_stock_count','out_of_stock_count','products_no_price','dead_stock_count','customers_in_debt','tot_ar','unpaid_orders','unpaid_purchases','tot_ap','tot_oversold'];
  R.cfgAl = dshCfg({metrics:R.alertIds}, {from:'', to:today}); R.cfgAl.rangeChip = 'all';
  R.al = rbCompute(R.cfgAl, true);
  return R;
}
const dshV = (res, id)=>{ const i = res.metrics.findIndex(m=>m.id===id); return i<0 ? 0 : (res.total[i]||0); };
const dshI = (res, id)=>res.metrics.findIndex(m=>m.id===id);

const DSH_KPI = [
  {id:'revenue', ic:'💰', fa:'درآمد فروش', en:'Revenue', f:'T', c:'coral'},
  {id:'profit', ic:'📈', fa:'سود ناخالص', en:'Gross profit', f:'T', c:'sage'},
  {id:'net_profit_after_exp', ic:'🏆', fa:'سود خالص', en:'Net profit', f:'T', c:'plum', sub:'پس از هزینه‌ها و پورسانت'},
  {id:'sales_count', ic:'🧾', fa:'فاکتور فروش', en:'Invoices', f:'num', c:'sky'},
  {id:'avg_order_value', ic:'🛒', fa:'میانگین فاکتور', en:'Avg. order', f:'T', c:'amber'},
  {id:'margin_pct', ic:'🎯', fa:'حاشیه سود', en:'Gross margin', f:'pct', c:'rose', pp:true},
];
const DSH_SNAP = [
  {id:'cash_balance', ic:'💵', fa:'موجودی صندوق', en:'Cash balance', f:'T', c:'sage', go:'cash'},
  {id:'stock_value', ic:'📦', fa:'ارزش موجودی انبار', en:'Inventory value', f:'T', c:'sky', go:'stockview'},
  {id:'tot_ar', ic:'📥', fa:'مطالبات از مشتریان', en:'Receivables', f:'T', c:'amber', go:'customers', neutral:true},
  {id:'tot_ap', ic:'📤', fa:'بدهی به تامین‌کنندگان', en:'Payables', f:'T', c:'coral', go:'purchase', neutral:true},
  {id:'tot_biz', ic:'🏛️', fa:'ارزش خالص کسب‌وکار', en:'Net worth', f:'T', c:'plum', go:'ledger'},
];

// ── small SVG pieces ──
function dshSpark(vals, color){
  const W = 120, H = 38, n = vals.length;
  if(n<2) return `<svg class="dsh-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="${H-4}" x2="${W}" y2="${H-4}" stroke="currentColor" stroke-opacity=".25" stroke-dasharray="3 3"/></svg>`;
  const mx = Math.max(...vals), mn = Math.min(...vals), rg = (mx-mn) || 1;
  const pts = vals.map((v,i)=>[i/(n-1)*W, H-4-((v-mn)/rg)*(H-10)]);
  const line = dshSmooth(pts), id = 'dshsp'+(++DSH.uid);
  return `<svg class="dsh-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true" style="color:var(--${color})">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".30"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
    <path class="dsh-sp-a" d="${line} L${W},${H} L0,${H} Z" fill="url(#${id})"/>
    <path class="dsh-sp-l" d="${line}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" pathLength="1"/></svg>`;
}
function dshDelta(cur, prev, k){
  if(prev===null || prev===undefined) return '';
  if(k.pp){ const d = cur-prev; if(Math.abs(d)<0.005) return `<span class="dsh-delta flat">— بدون تغییر</span>`; return `<span class="dsh-delta ${d>0?'up':'down'}">${d>0?'▲':'▼'} <bdi dir="ltr">${fx(Math.abs(d))}</bdi> امتیاز</span>`; }
  const p = dshPct(cur, prev);
  if(p===null) return cur ? `<span class="dsh-delta up">▲ جدید</span>` : `<span class="dsh-delta flat">—</span>`;
  if(Math.abs(p)<0.05) return `<span class="dsh-delta flat">— بدون تغییر</span>`;
  const up = p>0, cls = k.neutral ? 'flat neu' : (up?'up':'down');
  return `<span class="dsh-delta ${cls}">${up?'▲':'▼'} <bdi dir="ltr">${fx(Math.abs(p))}٪</bdi></span>`;
}

// ── KPI cards ──
function dshKpiCards(R){
  const ser = R.ser, curI = id=>dshI(R.cur,id);
  const sp = id=>{ const i = dshI(ser, id); return i<0 ? [] : ser.rows.map(r=>r.vals[i]); };
  return DSH_KPI.map((k,idx)=>{
    const i = curI(k.id), v = dshV(R.cur, k.id), pv = R.prev ? dshV(R.prev, k.id) : null;
    return `<div class="dsh-kpi" style="--i:${idx};--cc:var(--${k.c})">
      <div class="dsh-kpi-top"><span class="dsh-ic">${k.ic}</span>
        <div class="dsh-kpi-l"><b>${k.fa}</b><span class="dsh-en" dir="ltr">${k.en}</span></div>
        ${dshX(R.cfgCur, i, -1)}</div>
      <div class="dsh-kpi-v"><span class="dsh-cu" data-to="${v}" data-f="${k.f}">${dshFmt(v,k.f)}</span></div>
      <div class="dsh-kpi-b">${dshDelta(v, pv, k)}<span class="dsh-kpi-cmp">${k.sub ? dshEsc(k.sub) : (R.prev ? 'در برابر '+dshPrevLabel(R.period) : '')}</span></div>
      ${dshSpark(sp(k.id), k.c)}
    </div>`;
  }).join('');
}
function dshSnapCards(R){
  const ser = R.ser;
  return DSH_SNAP.map((k,idx)=>{
    const i = dshI(R.cur, k.id), v = dshV(R.cur, k.id), pv = R.prev ? dshV(R.prev, k.id) : null;
    const si = dshI(ser, k.id), sv = si<0 ? [] : ser.rows.map(r=>r.vals[si]);
    return `<div class="dsh-snap" style="--i:${idx};--cc:var(--${k.c})" onclick="showPartsSub('${k.go}')">
      <div class="dsh-snap-ic">${k.ic}</div>
      <div class="dsh-snap-b"><div class="dsh-snap-hd"><span class="dsh-snap-l">${k.fa} <span class="dsh-en" dir="ltr">${k.en}</span></span>${dshX(R.cfgCur, i, -1)}</div>
        <div class="dsh-snap-v"><span class="dsh-cu" data-to="${v}" data-f="${k.f}">${dshFmt(v,k.f)}</span></div>
        <div class="dsh-snap-d">${dshDelta(v, pv, k)}<span class="dsh-kpi-cmp">${R.prev ? 'نسبت به پایان دوره‌ی قبل' : 'تا امروز'}</span></div></div>
      ${sv.length>1 ? dshSpark(sv, k.c) : ''}
    </div>`;
  }).join('');
}

// ── trend chart ──
function dshTrend(R, W){
  const ser = R.ser, ri = dshI(ser,'revenue'), pi = dshI(ser,'profit'), ci = dshI(ser,'sales_count'), rows = ser.rows, n = rows.length;
  if(!n) return '<div class="dsh-empty">داده‌ای برای نمایش نیست</div>';
  const H = 270, L = 46, Rr = 14, T = 16, B = 30, pw = Math.max(120, W-L-Rr), ph = H-T-B;
  const rv = rows.map(r=>r.vals[ri]), pv = rows.map(r=>r.vals[pi]);
  const mx = dshNiceMax(Math.max(1, ...rv, ...pv)), mn = Math.min(0, ...pv), lo = mn<0 ? -dshNiceMax(-mn) : 0, rg = mx-lo;
  const X = i=> L + (n===1 ? pw/2 : i/(n-1)*pw), Y = v=> T + ph - (v-lo)/rg*ph;
  const pr = rv.map((v,i)=>[X(i),Y(v)]), pp = pv.map((v,i)=>[X(i),Y(v)]);
  let grid = ''; for(let g=0; g<=4; g++){ const v = lo + rg*g/4, y = Y(v); grid += `<line x1="${L}" x2="${W-Rr}" y1="${y}" y2="${y}" class="dsh-gl"/><text x="${L-8}" y="${y+3.5}" class="dsh-ax" text-anchor="end">${dshShort(v)}</text>`; }
  const step = Math.max(1, Math.ceil(n/Math.max(2, Math.floor(pw/74)))); let xl = '';
  rows.forEach((r,i)=>{ if(i%step===0){ const lab = R.grain==='day' ? dshShortDay(r.start) : (R.grain==='week' ? dshShortDay(r.start) : r.label); xl += `<text x="${X(i)}" y="${H-9}" class="dsh-ax" text-anchor="middle">${dshEsc(lab)}</text>`; } });
  let prevPath = ''; if(R.serP && R.serP.rows.length>1 && n>1){ const pi2 = dshI(R.serP,'revenue'), m2 = Math.min(n, R.serP.rows.length); const pts = []; for(let q=0;q<m2;q++) pts.push([X(q), Y(Math.min(mx, R.serP.rows[q].vals[pi2]))]); prevPath = `<path d="${dshSmooth(pts)}" class="dsh-line lp" fill="none"/>`; }
  const gid = 'dshtr'+(++DSH.uid), bw = n>1 ? pw/(n-1) : pw;
  let hits = '';
  rows.forEach((r,i)=>{
    const lab = R.grain==='day' ? jLabel(r.start)+' · '+FA_WEEKDAYS[isoWeekdaySat(r.start)] : (R.grain==='week' ? jShort(r.start)+' تا '+jShort(r.end) : r.label);
    const tip = `<b>${dshEsc(lab)}</b><div class="dsh-t-r"><i style="background:var(--coral)"></i>درآمد<span>${fmtT(rv[i])}</span></div><div class="dsh-t-r"><i style="background:var(--sage)"></i>سود ناخالص<span>${fmtT(pv[i])}</span></div><div class="dsh-t-r"><i style="background:var(--sky)"></i>فاکتور<span>${fx(r.vals[ci])}</span></div>`;
    hits += `<g class="dsh-hv" data-tip="${dshEsc(tip)}"><rect x="${X(i)-bw/2}" y="${T}" width="${bw}" height="${ph}" class="dsh-hit" onclick="xOpen('dsh_cell',${dshEsc(JSON.stringify({cfg:R.cfgSer, mi:ri, ri:i}))})"/>
      <line x1="${X(i)}" x2="${X(i)}" y1="${T}" y2="${T+ph}" class="dsh-cross"/><circle cx="${X(i)}" cy="${Y(rv[i])}" r="4.5" class="dsh-dot c1"/><circle cx="${X(i)}" cy="${Y(pv[i])}" r="4.5" class="dsh-dot c2"/></g>`;
  });
  const area = n>1 ? `${dshSmooth(pr)} L${X(n-1)},${Y(Math.max(0,lo))} L${X(0)},${Y(Math.max(0,lo))} Z` : '';
  return `<svg class="dsh-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="روند درآمد و سود">
    <defs><linearGradient id="${gid}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e85d3a" stop-opacity=".34"/><stop offset="1" stop-color="#e85d3a" stop-opacity="0"/></linearGradient>
    <linearGradient id="${gid}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a7a5a" stop-opacity=".22"/><stop offset="1" stop-color="#3a7a5a" stop-opacity="0"/></linearGradient></defs>
    ${grid}${xl}
    ${n>1 ? `<path d="${dshSmooth(pp)} L${X(n-1)},${Y(Math.max(0,lo))} L${X(0)},${Y(Math.max(0,lo))} Z" fill="url(#${gid}b)" class="dsh-fadein" style="animation-delay:.5s"/>` : ''}
    ${n>1 ? `<path d="${area}" fill="url(#${gid}a)" class="dsh-fadein"/>` : ''}
    ${n>1 ? `${prevPath}<path d="${dshSmooth(pp)}" class="dsh-line l2" pathLength="1"/><path d="${dshSmooth(pr)}" class="dsh-line l1" pathLength="1"/>` : `<circle cx="${X(0)}" cy="${Y(rv[0])}" r="6" fill="#e85d3a"/>`}
    ${hits}</svg>`;
}

// ── donut ──
function dshDonut(R){
  const rows = R.don.rows, tot = rows.reduce((s,r)=>s+r.vals[0],0), ri = 0;
  if(!rows.length || tot<=0) return `<div class="dsh-empty">در این بازه فروشی ثبت نشده</div>`;
  const top = rows.slice(0,5), restV = rows.slice(5).reduce((s,r)=>s+r.vals[0],0);
  const items = top.map((r,i)=>({label:r.label, v:r.vals[0], p:r.vals[1], ri:i, c:DSH_COL[i]}));
  if(restV>0) items.push({label:'سایر ('+fx(rows.length-5)+' مورد)', v:restV, ri:-1, c:DSH_COL[6]});
  const S = 188, r0 = 68, sw = 24, C = 2*Math.PI*r0; let acc = 0, segs = '';
  items.forEach((it,i)=>{
    const len = Math.max(0, it.v/tot*C - (items.length>1 ? 3 : 0)), off = -acc/1;
    segs += `<circle cx="${S/2}" cy="${S/2}" r="${r0}" fill="none" stroke="${it.c}" stroke-width="${sw}" class="dsh-seg" style="--len:${len.toFixed(2)};--circ:${C.toFixed(2)};animation-delay:${.15+i*.12}s" stroke-dasharray="${len.toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 ${S/2} ${S/2})" data-tip="${dshEsc('<b>'+it.label+'</b><div class="dsh-t-r">درآمد<span>'+fmtT(it.v)+'</span></div><div class="dsh-t-r">سهم<span>'+fx(it.v/tot*100)+'٪</span></div>')}"/>`;
    acc += it.v/tot*C;
  });
  const leg = items.map(it=>`<div class="dsh-leg"><i style="background:${it.c}"></i><span class="dsh-leg-n">${dshEsc(it.label)}</span><span class="dsh-leg-p">${fx(it.v/tot*100)}٪</span>${it.ri>=0 ? dshX(R.cfgDon, 0, it.ri) : '<span class="dsh-x-ph"></span>'}</div>`).join('');
  return `<div class="dsh-donut"><div class="dsh-donut-c"><svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" class="dsh-donut-svg"><circle cx="${S/2}" cy="${S/2}" r="${r0}" fill="none" stroke="var(--cream2)" stroke-width="${sw}"/>${segs}</svg>
    <div class="dsh-donut-t"><span class="dsh-cu" data-to="${tot}" data-f="T">${fmtT(tot)}</span><small>جمع درآمد</small></div></div><div class="dsh-legs">${leg}</div></div>`;
}

// ── top products (horizontal bars) ──
function dshTop(R){
  const rows = R.top.rows; if(!rows.length) return `<div class="dsh-empty">در این بازه فروشی ثبت نشده</div>`;
  const mx = Math.max(...rows.map(r=>r.vals[0]), 1);
  return `<div class="dsh-bars">`+rows.map((r,i)=>`<div class="dsh-bar" style="--i:${i}">
    <div class="dsh-bar-h"><span class="dsh-rank">${faDigits(i+1)}</span><a class="dsh-bar-n" href="javascript:void(0)" onclick="dshOpen('product','${dshEsc(r.key)}')" title="${dshEsc(r.label)}">${dshEsc(r.label)}</a><b class="dsh-bar-v">${fmtT(r.vals[0])}</b>${dshX(R.cfgTop, 0, i)}</div>
    <div class="dsh-bar-t" data-tip="${dshEsc('<b>'+r.label+'</b><div class="dsh-t-r">درآمد<span>'+fmtT(r.vals[0])+'</span></div><div class="dsh-t-r">سود<span>'+fmtT(r.vals[1])+'</span></div><div class="dsh-t-r">تعداد<span>'+fx(r.vals[2])+'</span></div>')}"><i style="--w:${(r.vals[0]/mx*100).toFixed(1)}%;--cc:${DSH_COL[i%6]}"></i></div>
    <div class="dsh-bar-s">سود <b class="${r.vals[1]<0?'neg':''}">${fmtT(r.vals[1])}</b> · ${fx(r.vals[2])} عدد</div></div>`).join('')+`</div>`;
}

// ── weekday columns ──
function dshWeekday(R){
  const rows = R.wd.rows, vals = rows.map(r=>r.vals[0]), mx = Math.max(...vals, 0), tot = vals.reduce((a,b)=>a+b,0);
  if(!(mx>0)) return `<div class="dsh-empty">در این بازه فروشی ثبت نشده</div>`;
  const best = vals.indexOf(mx);
  return `<div class="dsh-wd">`+rows.map((r,i)=>`<div class="dsh-wd-c${i===best?' best':''}" style="--i:${i}" data-tip="${dshEsc('<b>'+r.label+'</b><div class="dsh-t-r">درآمد<span>'+fmtT(r.vals[0])+'</span></div><div class="dsh-t-r">فاکتور<span>'+fx(r.vals[1])+'</span></div><div class="dsh-t-r">سهم<span>'+fx(tot? r.vals[0]/tot*100:0)+'٪</span></div>')}">
    <span class="dsh-wd-v">${dshShort(r.vals[0])}</span><div class="dsh-wd-bar"><i style="--h:${Math.max(2,r.vals[0]/mx*100).toFixed(1)}%"></i></div><span class="dsh-wd-l">${dshEsc(r.label.replace(/\u200c/g,''))}</span>${dshX(R.cfgWd,0,i)}</div>`).join('')+`</div>`;
}

// ── heatmap ──
function dshHeat(R){
  const rows = R.heat.rows; if(!rows.length) return '';
  const vals = rows.map(r=>r.vals[0]), pos = vals.filter(v=>v>0).sort((a,b)=>a-b);
  const q = p=> pos.length ? pos[Math.min(pos.length-1, Math.floor(p*pos.length))] : 0, th = [q(.25), q(.5), q(.75)];
  const lvl = v=> v<=0 ? 0 : (v<=th[0] ? 1 : v<=th[1] ? 2 : v<=th[2] ? 3 : 4);
  const cells = rows.map((r,i)=>`<i class="dsh-hc l${lvl(r.vals[0])}" style="--i:${i}" onclick="xOpen('dsh_cell',${dshEsc(JSON.stringify({cfg:R.cfgHeat, mi:0, ri:i}))})" data-tip="${dshEsc('<b>'+jLabel(r.start)+' · '+FA_WEEKDAYS[isoWeekdaySat(r.start)]+'</b><div class="dsh-t-r">درآمد<span>'+fmtT(r.vals[0])+'</span></div>')}"></i>`).join('');
  // month labels: the first week-column in which a new Jalali month begins
  const nCols = Math.ceil(rows.length/7); let ml = '', lastM = -1;
  for(let c=0;c<nCols;c++){ const r = rows[c*7]; if(!r) break; const j = isoToJ(r.start); if(j.m!==lastM){ ml += `<span style="grid-column:${c+1}">${FA_MONTHS[j.m-1]}</span>`; lastM = j.m; } }
  const wd = FA_WEEKDAYS.map((n,i)=> i%2===0 ? `<span style="grid-row:${i+1}">${n.replace(/\u200c/g,'').slice(0,3)}</span>` : '').join('');
  const total = vals.reduce((a,b)=>a+b,0), active = vals.filter(v=>v>0).length;
  return `<div class="dsh-heat-w"><div class="dsh-heat-wd">${wd}</div><div class="dsh-heat-main"><div class="dsh-heat-m" style="grid-template-columns:repeat(${nCols},1fr)">${ml}</div>
    <div class="dsh-heat" style="grid-template-columns:repeat(${nCols},1fr)">${cells}</div></div></div>
    <div class="dsh-heat-f"><span>${fx(active)} روز فعال از ${fx(rows.length)} روز · جمع ${fmtT(total)}</span><span class="dsh-heat-lg">کم <i class="dsh-hc l0"></i><i class="dsh-hc l1"></i><i class="dsh-hc l2"></i><i class="dsh-hc l3"></i><i class="dsh-hc l4"></i> زیاد</span></div>`;
}

// ── stock health ring ──
function dshStock(R){
  const rows = R.stk.rows, get = k=>{ const r = rows.find(x=>x.key===k); return r ? r.vals : [0,0]; };
  const parts = [['ok','موجودی عادی','sage'],['low','کم‌موجودی','amber'],['out','ناموجود','coral']].map(([k,l,c])=>({k,l,c,n:get(k)[0],v:get(k)[1],ri:rows.findIndex(x=>x.key===k)}));
  const tot = parts.reduce((s,p)=>s+p.n,0);
  if(!tot) return `<div class="dsh-empty">هنوز کالایی ثبت نشده<br><button class="dsh-link" type="button" onclick="dshGo('products','openProductModal')">+ افزودن اولین محصول</button></div>`;
  const S = 150, r0 = 54, sw = 17, C = 2*Math.PI*r0; let acc = 0, segs = '';
  parts.forEach((p,i)=>{ if(!p.n) return; const len = Math.max(0, p.n/tot*C - (parts.filter(x=>x.n).length>1?3:0));
    segs += `<circle cx="${S/2}" cy="${S/2}" r="${r0}" fill="none" stroke="var(--${p.c})" stroke-width="${sw}" stroke-linecap="butt" class="dsh-seg" style="--len:${len.toFixed(2)};--circ:${C.toFixed(2)};animation-delay:${.2+i*.15}s" stroke-dasharray="${len.toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 ${S/2} ${S/2})" data-tip="${dshEsc('<b>'+p.l+'</b><div class="dsh-t-r">تعداد کالا<span>'+fx(p.n)+'</span></div><div class="dsh-t-r">ارزش<span>'+fmtT(p.v)+'</span></div>')}"/>`;
    acc += p.n/tot*C; });
  const okp = parts[0].n/tot*100;
  return `<div class="dsh-stock"><div class="dsh-donut-c sm"><svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}"><circle cx="${S/2}" cy="${S/2}" r="${r0}" fill="none" stroke="var(--cream2)" stroke-width="${sw}"/>${segs}</svg>
    <div class="dsh-donut-t"><span class="dsh-cu" data-to="${okp}" data-f="pct">${dshFmt(okp,'pct')}</span><small>سالم</small></div></div>
    <div class="dsh-legs">${parts.map(p=>`<div class="dsh-leg"><i style="background:var(--${p.c})"></i><span class="dsh-leg-n">${p.l}</span><span class="dsh-leg-p">${fx(p.n)} کالا</span>${p.ri>=0 ? dshX(R.cfgStk, 0, p.ri) : '<span class="dsh-x-ph"></span>'}</div>`).join('')}
    <button class="dsh-link" type="button" onclick="showPartsSub('stockview')">مشاهده‌ی موجودی کالاها ›</button></div></div>`;
}

// ── cash in/out columns ──
function dshCash(R, W){
  const ser = R.ser, ii = dshI(ser,'cash_in'), oi = dshI(ser,'cash_out'), rows = ser.rows, n = rows.length;
  const ins = rows.map(r=>r.vals[ii]), outs = rows.map(r=>r.vals[oi]);
  const mx = dshNiceMax(Math.max(1, ...ins, ...outs));
  if(Math.max(...ins, ...outs) <= 0) return `<div class="dsh-empty">در این بازه گردش نقدی ثبت نشده</div>`;
  const H = 210, L = 44, Rr = 8, T = 10, B = 26, pw = Math.max(100, W-L-Rr), ph = H-T-B, slot = pw/n, bw = Math.max(2, Math.min(18, slot*0.34));
  const Y = v=>T+ph-(v/mx)*ph; let grid = '', bars = '', xl = '';
  for(let g=0; g<=3; g++){ const v = mx*g/3, y = Y(v); grid += `<line x1="${L}" x2="${W-Rr}" y1="${y}" y2="${y}" class="dsh-gl"/><text x="${L-8}" y="${y+3.5}" class="dsh-ax" text-anchor="end">${dshShort(v)}</text>`; }
  const step = Math.max(1, Math.ceil(n/Math.max(2, Math.floor(pw/74))));
  rows.forEach((r,i)=>{
    const cx = L + slot*i + slot/2, tip = dshEsc('<b>'+(R.grain==='day'?jLabel(r.start):(R.grain==='week'?jShort(r.start)+' تا '+jShort(r.end):r.label))+'</b><div class="dsh-t-r"><i style="background:var(--sage)"></i>ورودی<span>'+fmtT(ins[i])+'</span></div><div class="dsh-t-r"><i style="background:var(--coral)"></i>خروجی<span>'+fmtT(outs[i])+'</span></div><div class="dsh-t-r">خالص<span>'+fmtT(ins[i]-outs[i])+'</span></div>');
    bars += `<g class="dsh-cb" data-tip="${tip}" style="--i:${i}" onclick="xOpen('dsh_cell',${dshEsc(JSON.stringify({cfg:R.cfgSer, mi:ii, ri:i}))})"><rect x="${cx-slot/2}" y="${T}" width="${slot}" height="${ph}" fill="transparent"/>
      <rect class="dsh-colbar" x="${cx-bw-1}" y="${Y(ins[i])}" width="${bw}" height="${Math.max(0,T+ph-Y(ins[i]))}" rx="2.5" fill="var(--sage)" style="transform-origin:0 ${T+ph}px"/>
      <rect class="dsh-colbar" x="${cx+1}" y="${Y(outs[i])}" width="${bw}" height="${Math.max(0,T+ph-Y(outs[i]))}" rx="2.5" fill="var(--coral)" style="transform-origin:0 ${T+ph}px"/></g>`;
    if(i%step===0) xl += `<text x="${cx}" y="${H-8}" class="dsh-ax" text-anchor="middle">${dshEsc(R.grain==='month' ? r.label : dshShortDay(r.start))}</text>`;
  });
  return `<svg class="dsh-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${grid}${xl}${bars}</svg>`;
}

// ── goal ring ──
function dshGoal(R){
  const rv = dshV(R.mon,'revenue'), goal = DSH.goal, mr = R.monthRange, tj = isoToJ(mr.to), len = jMonthLen(tj.y,tj.m), el = tj.d;
  const proj = el>0 ? rv/el*len : 0;
  const mon = FA_MONTHS[tj.m-1]+' '+faDigits(tj.y);
  let body;
  if(!(goal>0) || DSH.goalEdit){
    body = `<div class="dsh-goal-form"><div class="dsh-goal-h">${goal>0?'ویرایش':'تعیین'} هدف فروش ماهانه</div>
      <p>هدفِ درآمد ماه جاری را به KT وارد کن تا پیشرفتش را اینجا ببینی.</p>
      <div class="dsh-goal-row"><input id="dshGoalIn" type="text" inputmode="decimal" dir="ltr" placeholder="مثلاً 50000" value="${goal>0?goal:''}" onkeydown="if(event.key==='Enter')dshGoalSave()"><span>KT</span></div>
      <div class="dsh-goal-btns"><button class="parts-add-btn" type="button" onclick="dshGoalSave()">ذخیره</button>${goal>0?`<button class="parts-header-btn" type="button" onclick="dshGoalEdit(false)">انصراف</button>`:''}</div></div>`;
  } else {
    const p = Math.min(100, rv/goal*100), over = rv>=goal, C = 2*Math.PI*58;
    body = `<div class="dsh-goal"><div class="dsh-goal-ring"><svg width="150" height="150" viewBox="0 0 150 150"><circle cx="75" cy="75" r="58" fill="none" stroke="var(--cream2)" stroke-width="14"/>
      <circle cx="75" cy="75" r="58" fill="none" stroke="${over?'var(--sage)':'var(--coral)'}" stroke-width="14" stroke-linecap="round" class="dsh-seg" style="--len:${(p/100*C).toFixed(2)};--circ:${C.toFixed(2)}" stroke-dasharray="${(p/100*C).toFixed(2)} ${C.toFixed(2)}" transform="rotate(-90 75 75)"/></svg>
      <div class="dsh-donut-t"><span class="dsh-cu" data-to="${rv/goal*100}" data-f="pct">${dshFmt(rv/goal*100,'pct')}</span><small>${over?'هدف محقق شد 🎉':'از هدف'}</small></div></div>
      <div class="dsh-goal-d"><div><small>درآمد ${mon} تا امروز</small><b>${fmtT(rv)}</b></div><div><small>هدف ماه</small><b>${fmtT(goal)}</b></div>
      <div><small>${over?'مازاد':'باقی‌مانده'}</small><b>${fmtT(Math.abs(goal-rv))}</b></div>
      <div><small>پیش‌بینی پایان ماه با روند فعلی</small><b class="${proj>=goal?'ok':'warn'}">${fmtT(proj)}</b></div></div></div>`;
  }
  return body;
}
function dshGoalEdit(on){ DSH.goalEdit = on; dshRender(false); }
async function dshGoalSave(){
  const v = rbParseNum((document.getElementById('dshGoalIn')||{}).value);
  if(v===null || v<0){ showToast('عدد معتبر وارد کن','error'); return; }
  DSH.goal = v; DSH.goalEdit = false; dshRender(false); await dshSave({goal:v}); showToast(v>0 ? 'هدف ماهانه ذخیره شد' : 'هدف ماهانه برداشته شد');
}

// ── alerts ──
function dshAlerts(R){
  const al = R.al, g = id=>dshV(al,id), I = id=>dshI(al,id), X = id=>dshX(R.cfgAl, I(id), -1), out = [];
  const add = (sev, ic, html, go, id)=>out.push({sev, ic, html, go, id});
  if(g('out_of_stock_count')>0) add(2,'🚫',`<b>${fx(g('out_of_stock_count'))}</b> کالا ناموجود است`,'stockview','out_of_stock_count');
  if(g('low_stock_count')>0) add(1,'⚠️',`<b>${fx(g('low_stock_count'))}</b> کالا کم‌موجودی است (نزدیکِ تمام شدن)`,'stockview','low_stock_count');
  if(g('tot_oversold')>0) add(2,'🧮',`فروش بدون موجودی با بهای تخمینی <b>${fmtT(g('tot_oversold'))}</b> — فاکتور خرید ثبت‌نشده دارد`,'stockview','tot_oversold');
  if(g('customers_in_debt')>0) add(1,'📥',`<b>${fx(g('customers_in_debt'))}</b> مشتری جمعاً <b>${fmtT(g('tot_ar'))}</b> بدهکارند`,'customers','customers_in_debt');
  else if(g('unpaid_orders')>0) add(1,'🧾',`<b>${fx(g('unpaid_orders'))}</b> فاکتور تسویه‌نشده دارید`,'sales','unpaid_orders');
  if(g('unpaid_purchases')>0) add(1,'📤',`<b>${fx(g('unpaid_purchases'))}</b> سفارش خرید پرداخت‌نشده؛ بدهی به تامین‌کنندگان <b>${fmtT(g('tot_ap'))}</b>`,'purchase','unpaid_purchases');
  if(g('products_no_price')>0) add(0,'🏷️',`<b>${fx(g('products_no_price'))}</b> کالا قیمت فروش ندارد`,'products','products_no_price');
  if(g('dead_stock_count')>0) add(0,'🕸️',`<b>${fx(g('dead_stock_count'))}</b> کالای راکد (موجود ولی هرگز فروخته‌نشده)`,'stockview','dead_stock_count');
  out.sort((a,b)=>b.sev-a.sev);
  if(!out.length) return `<div class="dsh-ok"><div class="dsh-ok-i">✅</div><b>همه‌چیز مرتب است</b><span>کالای ناموجود، بدهیِ معوق یا هشدار دیگری وجود ندارد.</span></div>`;
  return `<div class="dsh-alerts">`+out.map((a,i)=>`<div class="dsh-al s${a.sev}" style="--i:${i}" onclick="showPartsSub('${a.go}')"><span class="dsh-al-i">${a.ic}</span><span class="dsh-al-t">${a.html}</span><span class="dsh-al-x" onclick="event.stopPropagation()">${X(a.id)}</span><span class="dsh-al-go">›</span></div>`).join('')+`</div>`;
}

// ── activity feed + people ──
function dshAgo(iso){
  const d = isoDiff(iso, isoToday()); if(d<=0) return 'امروز'; if(d===1) return 'دیروز'; if(d<30) return fx(d)+' روز پیش'; if(d<365) return fx(Math.round(d/30))+' ماه پیش'; return fx(Math.round(d/365))+' سال پیش';
}
function dshActivity(){
  const items = [], spendBy = new Map();
  (rbFacts||[]).forEach(f=>{ if(f.k==='pl' && f.pur) spendBy.set(f.pur, (spendBy.get(f.pur)||0) + (f.v.spend||0)); });
  const stName = id=>{ const s = (PARTS.stores||[]).find(x=>x.id===id); return s ? s.name : ''; };
  (PARTS.sales||[]).forEach(s=>items.push({d:s.date, id:s.id, ic:'🧾', c:'sage', t:'فاکتور فروش'+(s.invoice_no?' #'+faDigits(s.invoice_no):''), sub:s.customer_name||'مشتری متفرقه', amt:s.invoice_total, sg:'+', open:['sale',s.id]}));
  (PARTS.purchases||[]).forEach(p=>items.push({d:p.order_date, id:p.id, ic:'📥', c:'sky', t:'خرید'+(p.po_no?' #'+faDigits(p.po_no):''), sub:stName(p.store_id)||'تامین‌کننده', amt:spendBy.get(p.id)||0, sg:'−', open:['purchase',p.id]}));
  (PARTS.business_expenses||[]).forEach(e=>items.push({d:e.date, id:e.id, ic:'💸', c:'coral', t:'هزینه: '+(e.title||e.category||''), sub:e.category||'', amt:e.amount, sg:'−', open:['expense',e.id]}));
  (PARTS.sale_returns||[]).forEach(r=>items.push({d:r.date, id:r.id, ic:'↩️', c:'amber', t:'مرجوعی فروش', sub:r.reason||'', amt:r.refund_total, sg:'−', open:['sales','']}));
  return items.filter(x=>x.d).sort((a,b)=>String(b.d).localeCompare(String(a.d)) || String(b.id).localeCompare(String(a.id))).slice(0,9);
}
function dshActivityHtml(){
  const list = dshActivity(); if(!list.length) return `<div class="dsh-empty">هنوز تراکنشی ثبت نشده</div>`;
  return `<div class="dsh-feed">`+list.map((x,i)=>`<div class="dsh-fe" style="--i:${i};--cc:var(--${x.c})" onclick="dshOpen('${x.open[0]}','${dshEsc(x.open[1])}')"><span class="dsh-fe-i">${x.ic}</span>
    <div class="dsh-fe-b"><b>${dshEsc(x.t)}</b><small>${dshEsc(x.sub)}</small></div><div class="dsh-fe-r"><b class="${x.sg==='+'?'pos':'neg'}">${x.sg==='+'?'+':'−'}${fmtT(x.amt)}</b><small>${jShort(x.d)} · ${dshAgo(x.d)}</small></div></div>`).join('')+`</div>`;
}
function dshPeople(R){
  const rows = R.cus.rows; if(!rows.length) return `<div class="dsh-empty">در این بازه فروشی ثبت نشده</div>`;
  const mx = Math.max(...rows.map(r=>r.vals[0]), 1);
  return `<div class="dsh-people">`+rows.map((r,i)=>`<div class="dsh-pp" style="--i:${i}"><span class="dsh-av" style="background:${DSH_COL[i%6]}">${dshEsc(String(r.label).trim().charAt(0)||'؟')}</span>
    <div class="dsh-pp-b"><div class="dsh-pp-h"><b>${dshEsc(r.label)}</b><span>${fmtT(r.vals[0])}</span></div><div class="dsh-pp-t"><i style="--w:${(r.vals[0]/mx*100).toFixed(1)}%;--cc:${DSH_COL[i%6]}"></i></div><small>${fx(r.vals[2])} فاکتور · سود ${fmtT(r.vals[1])}</small></div>${dshX(R.cfgCus,0,i)}</div>`).join('')+`</div>`;
}

// ── insights ──
function dshInsightList(R){
  const out = [], rv = dshV(R.cur,'revenue'), mg = dshV(R.cur,'margin_pct'), nm = DSH_PERIODS.find(p=>p[0]===R.period)[1];
  if(R.prev){
    const pv = dshV(R.prev,'revenue'), p = dshPct(rv, pv);
    if(p!==null && Math.abs(p)>=0.5) out.push([p>0?'📈':'📉', `درآمد «${nm}» نسبت به ${dshPrevLabel(R.period)} <b>${fx(Math.abs(p))}٪ ${p>0?'بیشتر':'کمتر'}</b> شده (${fmtT(rv)} در برابر ${fmtT(pv)}).`, p>0?'good':'bad']);
    else if(rv>0) out.push(['➖', `درآمد «${nm}» تقریباً با ${dshPrevLabel(R.period)} برابر است.`, '']);
    const pm = dshV(R.prev,'margin_pct'); if(rv>0 && pv>0 && Math.abs(mg-pm)>=0.5) out.push([mg>pm?'🎯':'⚠️', `حاشیه سود ${mg>pm?'بهتر':'ضعیف‌تر'} شده: <b>${fx(mg)}٪</b> (قبل: ${fx(pm)}٪).`, mg>pm?'good':'bad']);
  }
  const wd = R.wd.rows, wv = wd.map(r=>r.vals[0]), wt = wv.reduce((a,b)=>a+b,0);
  if(wt>0){ const b = wv.indexOf(Math.max(...wv)); out.push(['📅', `پرفروش‌ترین روز هفته <b>${dshEsc(wd[b].label)}</b> است (${fx(wv[b]/wt*100)}٪ درآمد).`, '']); }
  if(R.top.rows.length && rv>0){ const t = R.top.rows[0]; out.push(['🏅', `<b>${dshEsc(t.label)}</b> پرفروش‌ترین کالاست: ${fx(t.vals[0]/rv*100)}٪ درآمد و سود ${fmtT(t.vals[1])}.`, '']); }
  const loss = dshV(R.al,'dead_stock_count'); if(loss>0) out.push(['🕸️', `<b>${fx(loss)}</b> کالای موجودِ هرگز-فروخته‌نشده دارید؛ سرمایه‌ی خوابیده.`, 'bad']);
  const ar = dshV(R.al,'tot_ar'); if(ar>0) out.push(['📥', `طلب از مشتریان <b>${fmtT(ar)}</b> است؛ پیگیری وصول کنید.`, 'bad']);
  if(!out.length) out.push(['💡','با ثبت فاکتور و خرید، اینجا تحلیل‌های خودکار برایت ساخته می‌شود.','']);
  return out;
}
function dshInsights(R){
  const out = dshInsightList(R);
  return `<div class="dsh-ins">`+out.slice(0,6).map((x,i)=>`<div class="dsh-in ${x[2]}" style="--i:${i}"><span>${x[0]}</span><p>${x[1]}</p></div>`).join('')+`</div>`;
}

// ── page assembly ──
function dshCard(cls, ic, fa, en, body, tools, xbtn){
  return `<section class="dsh-card ${cls||''}"><header class="dsh-ch"><div class="dsh-ct"><span>${ic}</span><b>${fa}</b><em dir="ltr">${en}</em></div><div class="dsh-tools">${tools||''}${xbtn||''}</div></header>${body}</section>`;
}
function dshGreeting(){
  const h = new Date().getHours(), g = h<5 ? 'شب بخیر' : h<12 ? 'صبح بخیر' : h<17 ? 'ظهر بخیر' : h<20 ? 'عصر بخیر' : 'شب بخیر';
  const ic = h<5 ? '🌙' : h<12 ? '☀️' : h<17 ? '🌤️' : h<20 ? '🌇' : '🌙';
  return {g, ic};
}
// ── profit waterfall (revenue → … → net profit); every column reconciles, any gap is shown as «تعدیل» ──
function dshWaterfall(R){
  const g = id=>dshV(R.wf,id), I = id=>dshI(R.wf,id), rev = g('revenue'), cogs = g('cogs'), gp = g('profit'), ex = g('expenses_total'), cm = g('commission'), net = g('net_profit_after_exp');
  if(!rev && !ex && !net) return `<div class="dsh-empty">در این بازه فروش یا هزینه‌ای ثبت نشده</div>`;
  const cols = [];   // {l, v, kind:'t'|'d'|'s', from, to, id}
  cols.push({l:'درآمد', v:rev, k:'t', a:0, b:rev, id:'revenue'});
  cols.push({l:'بهای کالا', v:-cogs, k:'d', a:rev, b:rev-cogs, id:'cogs'});
  const adj1 = gp - (rev - cogs);
  if(Math.abs(adj1)>0.01) cols.push({l:'تعدیل ارسال و …', v:adj1, k:adj1>=0?'u':'d', a:rev-cogs, b:rev-cogs+adj1, id:null});
  cols.push({l:'سود ناخالص', v:gp, k:'s', a:0, b:gp, id:'profit'});
  cols.push({l:'هزینه‌های جاری', v:-ex, k:'d', a:gp, b:gp-ex, id:'expenses_total'});
  cols.push({l:'پورسانت', v:-cm, k:'d', a:gp-ex, b:gp-ex-cm, id:'commission'});
  const adj2 = net - (gp - ex - cm);
  if(Math.abs(adj2)>0.01) cols.push({l:'تعدیل', v:adj2, k:adj2>=0?'u':'d', a:gp-ex-cm, b:gp-ex-cm+adj2, id:null});
  cols.push({l:'سود خالص', v:net, k:'t2', a:0, b:net, id:'net_profit_after_exp'});
  const all = cols.flatMap(c=>[c.a,c.b]), mx = Math.max(...all, 1), mn = Math.min(...all, 0), rg = (mx-mn)||1;
  return `<div class="dsh-wf" style="--n:${cols.length}">`+cols.map((c,i)=>{
    const lo = Math.min(c.a,c.b), hi = Math.max(c.a,c.b), bot = (lo-mn)/rg*100, h = Math.max(1.2,(hi-lo)/rg*100);
    const cls = c.k==='t'?'tot':(c.k==='t2'?(net>=0?'fin':'neg'):(c.k==='s'?'sub':(c.k==='u'?'up':'dn')));
    const tip = dshEsc('<b>'+c.l+'</b><div class="dsh-t-r">مبلغ<span>'+fmtT(c.v)+'</span></div>'+(rev>0 ? '<div class="dsh-t-r">نسبت به درآمد<span>'+fx(c.v/rev*100)+'٪</span></div>' : ''));
    return `<div class="dsh-wf-c" style="--i:${i}"><div class="dsh-wf-v ${c.v<0?'neg':''}">${c.v<0?'−':''}${dshShort(Math.abs(c.v))}</div>
      <div class="dsh-wf-plot" data-tip="${tip}"><i class="dsh-wf-b ${cls}" style="--b:${bot.toFixed(2)}%;--h:${h.toFixed(2)}%"></i></div>
      <div class="dsh-wf-l"><span>${c.l}</span>${c.id ? dshX(R.cfgWf, I(c.id), -1) : ''}</div></div>`;
  }).join('')+`</div><div class="dsh-wf-f">${rev>0 ? `هر <b>۱۰۰ KT</b> درآمد → <b>${fx(net/rev*100)}</b> KT سود خالص` : ''}</div>`;
}
// ── half-circle gauges ──
function dshGauge(label, en, v, hi, cfg, mi, good){   // good: true = higher is better
  const val = Math.max(0, Math.min(100, v)), ok = good ? (v>=hi[0] ? 'sage' : (v>=hi[1] ? 'amber' : 'coral')) : (v<=hi[0] ? 'sage' : (v<=hi[1] ? 'amber' : 'coral'));
  return `<div class="dsh-gg"><svg viewBox="0 0 120 70" class="dsh-gg-s"><path d="M12,62 A48,48 0 0 1 108,62" pathLength="100" class="dsh-gg-bg"/><path d="M12,62 A48,48 0 0 1 108,62" pathLength="100" class="dsh-gg-fg" style="--v:${val.toFixed(1)};stroke:var(--${ok})"/></svg>
    <div class="dsh-gg-v"><span class="dsh-cu" data-to="${v}" data-f="pct">${dshFmt(v,'pct')}</span></div><div class="dsh-gg-l">${label}${dshX(cfg, mi, -1)}</div><small dir="ltr">${en}</small></div>`;
}
function dshGauges(R){
  const g = id=>dshV(R.ga,id), I = id=>dshI(R.ga,id), has = dshV(R.cur,'sales_count')>0;
  if(!has) return `<div class="dsh-empty">در این بازه فروشی ثبت نشده</div>`;
  return `<div class="dsh-ggs">${dshGauge('حاشیه سود','Gross margin',g('margin_pct'),[25,10],R.cfgGa,I('margin_pct'),true)}${dshGauge('وصول مطالبات','Collection rate',g('collect_pct'),[90,60],R.cfgGa,I('collect_pct'),true)}${dshGauge('هزینه به درآمد','Expense ratio',g('expense_to_revenue'),[15,30],R.cfgGa,I('expense_to_revenue'),false)}${dshGauge('نرخ مرجوعی','Return rate',g('return_value_pct'),[3,8],R.cfgGa,I('return_value_pct'),false)}</div>`;
}
// ── customers analysis ──
function dshCustomers(R){
  const g = id=>dshV(R.ca,id), I = id=>dshI(R.ca,id), no = g('new_customer_orders'), ro = g('repeat_orders'), tot = no+ro;
  if(!(tot>0)) return `<div class="dsh-empty">در این بازه فروشی ثبت نشده</div>`;
  const st = [['👥','مشتری فعال','active_customers','num'],['🆕','مشتری جدید','new_customers','num'],['🔁','نرخ خرید مجدد','repeat_rate','pct'],['🧾','فاکتور به‌ازای مشتری','orders_per_customer','num'],];
  return `<div class="dsh-cstats">${st.map(s=>`<div class="dsh-cs"><span>${s[0]}</span><div><small>${s[1]}</small><b><span class="dsh-cu" data-to="${g(s[2])}" data-f="${s[3]}">${dshFmt(g(s[2]),s[3])}</span></b></div>${dshX(R.cfgCa, I(s[2]), -1)}</div>`).join('')}</div>
    <div class="dsh-split"><div class="dsh-split-h"><span>فاکتور مشتری جدید <b>${fx(no)}</b></span><span>مشتری قدیمی <b>${fx(ro)}</b></span></div>
    <div class="dsh-split-b"><i class="n" style="--w:${(no/tot*100).toFixed(1)}%"></i><i class="r" style="--w:${(ro/tot*100).toFixed(1)}%"></i></div>
    <div class="dsh-split-f">درآمد هر مشتری <b>${fmtT(g('revenue_per_customer'))}</b> ${dshX(R.cfgCa, I('revenue_per_customer'), -1)}</div></div>`;
}
// ── ranked bar list (agents / suppliers) ──
function dshRank(rows, cfg, subFn, color){
  if(!rows.length) return `<div class="dsh-empty">داده‌ای در این بازه نیست</div>`;
  const mx = Math.max(...rows.map(r=>r.vals[0]), 1);
  return `<div class="dsh-bars">`+rows.map((r,i)=>`<div class="dsh-bar" style="--i:${i}"><div class="dsh-bar-h"><span class="dsh-rank">${faDigits(i+1)}</span><span class="dsh-bar-n" title="${dshEsc(r.label)}">${dshEsc(r.label)}</span><b class="dsh-bar-v">${fmtT(r.vals[0])}</b>${dshX(cfg,0,i)}</div>
    <div class="dsh-bar-t"><i style="--w:${(r.vals[0]/mx*100).toFixed(1)}%;--cc:${color||DSH_COL[i%6]}"></i></div><div class="dsh-bar-s">${subFn(r)}</div></div>`).join('')+`</div>`;
}
// ── low-stock list ──
function dshLowStock(R){
  const stock = PARTS.stock||{}, ids = (PARTS.low_stock||[]);
  const list = ids.map(id=>(PARTS.products||[]).find(p=>p.id===id)).filter(Boolean).map(p=>({p, st:Number(stock[p.id])||0})).sort((a,b)=>a.st-b.st).slice(0,6);
  if(!list.length) return `<div class="dsh-ok"><div class="dsh-ok-i">📦</div><b>موجودی همه‌ی کالاها کافی است</b><span>هیچ کالایی زیر نقطه‌ی سفارش نیست.</span></div>`;
  return `<div class="dsh-low">`+list.map((x,i)=>`<div class="dsh-lw" style="--i:${i}"><a class="dsh-lw-n" href="javascript:void(0)" onclick="dshOpen('product','${dshEsc(x.p.id)}')" title="${dshEsc(productLabel(x.p))}">${dshEsc(productLabel(x.p))}</a>
    <span class="dsh-lw-b ${x.st<=0?'out':'low'}">${x.st<=0?'ناموجود':fx(x.st)+' عدد'}</span></div>`).join('')+`</div>
    <div class="dsh-low-f"><button class="dsh-link" type="button" onclick="dshGo('purchase','openPurchaseModal')">+ ثبت خرید برای تامین</button><button class="dsh-link" type="button" onclick="showPartsSub('stockview')">همه ›</button>${dshX(R.cfgAl, dshI(R.al,'low_stock_count'), -1)}</div>`;
}
// ── hero: today strip + rotating insight ticker ──
function dshTodayStrip(R){
  const g = id=>dshV(R.today,id), I = id=>dshI(R.today,id);
  const it = [['💰','درآمد امروز','revenue','T'],['🧾','فاکتور امروز','sales_count','num'],['📈','سود امروز','profit','T']];
  return `<div class="dsh-today"><div class="dsh-today-h"><i></i>امروز <span dir="ltr">Today</span></div><div class="dsh-today-g">`+it.map(x=>`<div><small>${x[0]} ${x[1]}</small><b><span class="dsh-cu" data-to="${g(x[2])}" data-f="${x[3]}">${dshFmt(g(x[2]),x[3])}</span></b>${dshX(R.cfgToday, I(x[2]), -1)}</div>`).join('')+`</div></div>`;
}
function dshTickStart(items){
  clearInterval(DSH.tickT); const el = document.getElementById('dshTickT'); if(!el || items.length<2) return;
  let i = 0;
  DSH.tickT = setInterval(()=>{
    const e = document.getElementById('dshTickT'); if(!e || !e.isConnected){ clearInterval(DSH.tickT); return; }
    e.classList.add('out'); setTimeout(()=>{ i = (i+1)%items.length; e.innerHTML = items[i]; e.classList.remove('out'); }, 350);
  }, 5200);
}


const DSH_THEMES = {sunset:'غروب', ocean:'اقیانوس', forest:'جنگل', graphite:'گرافیت', plum:'بنفشه'};
function dshHeroSpark(R){
  const rows = R.hero.rows, ri = dshI(R.hero,'revenue'), v = rows.map(r=>r.vals[ri]), cur = v.slice(-14), prev = v.slice(0,14);
  const sum = a=>a.reduce((x,y)=>x+y,0), sc = sum(cur), sp = sum(prev), d = dshPct(sc, sp), act = cur.filter(x=>x>0).length;
  const W = 320, H = 96, mx = Math.max(...cur, 1), pts = cur.map((x,i)=>[i/13*W, H-8-(x/mx)*(H-24)]), line = dshSmooth(pts), id = 'dshhs'+(++DSH.uid);
  const bw = W/14, hits = cur.map((x,i)=>{ const r = rows[14+i]; return `<rect x="${(i*bw).toFixed(1)}" y="0" width="${bw.toFixed(1)}" height="${H}" fill="transparent" data-tip="${dshEsc('<b>'+jLabel(r.start)+'</b><div class="dsh-t-r">درآمد<span>'+fmtT(x)+'</span></div>')}"/>`; }).join('');
  return {act, html:`<div class="dsh-hs"><div class="dsh-hs-h"><span>درآمد ۱۴ روز اخیر <em dir="ltr">Last 14 days</em></span>${dshX(R.cfgHero, ri, -1)}</div>
    <div class="dsh-hs-v"><span class="dsh-cu" data-to="${sc}" data-f="T">${fmtT(sc)}</span>${d===null ? '' : `<span class="dsh-hs-d ${d>=0?'up':'down'}">${d>=0?'▲':'▼'} <bdi dir="ltr">${fx(Math.abs(d))}٪</bdi></span>`}</div>
    <svg class="dsh-hs-s" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
      <path d="${line} L${W},${H} L0,${H} Z" fill="url(#${id})" class="dsh-fadein"/><path d="${line}" class="dsh-hs-l" pathLength="1" vector-effect="non-scaling-stroke"/>${hits}</svg></div>`};
}
function dshHero(R, o){
  const {t, bp, gr, todayEn, tickItems} = o, ds = PARTS.dash_settings||{}, theme = DSH_THEMES[ds.theme] ? ds.theme : 'sunset';
  const nm = (ds.user_name||'').trim(), hs = dshHeroSpark(R);
  const mono = (bp.name||'E').trim().charAt(0) || 'E';
  const chips = [['📦', fx((PARTS.products||[]).length)+' محصول','products'],['👥', fx((PARTS.customers||[]).length)+' مشتری','customers'],['🏬', fx((PARTS.stores||[]).length)+' تامین‌کننده','stores'],['🔥','فروش در '+fx(hs.act)+' از ۱۴ روز اخیر','reportbuilder']];
  const tiles = [['🧾','فاکتور فروش','ثبت فروش جدید','sales','openSaleModal','a'],['📥','ثبت خرید','ورود کالا به انبار','purchase','openPurchaseModal',''],['💸','ثبت هزینه','اجاره، حمل، تبلیغات…','expenses','',''],['📦','محصول جدید','افزودن به کاتالوگ','products','openProductModal',''],['🧮','گزارش‌ساز','تحلیل دلخواه','reportbuilder','',''],['⚙️','تنظیمات','پروفایل، قیمت، داشبورد','variables','','']];
  const pts = Array.from({length:9},(_,i)=>`<i class="dsh-pt" style="--x:${(8+i*11)%100}%;--s:${6+(i*5)%9}px;--d:${7+(i*3)%7}s;--dl:-${(i*2.3).toFixed(1)}s"></i>`).join('');
  return `<section class="dsh-hero t-${theme}" onpointermove="dshSpot(event,this)">
    <div class="dsh-blob b1"></div><div class="dsh-blob b2"></div><div class="dsh-blob b3"></div><div class="dsh-hero-grid"></div><div class="dsh-spot"></div><div class="dsh-pts">${pts}</div>
    <div class="dsh-hero-main">
      <div class="dsh-hero-id"><div class="dsh-av-big">${bp.logo ? `<img src="${dshEsc(bp.logo)}" alt="">` : `<span>${dshEsc(mono)}</span>`}</div>
        <div class="dsh-hero-t"><div class="dsh-hello"><span class="dsh-hello-i">${gr.ic}</span><span>${gr.g}${nm?'، <b class="dsh-shim">'+dshEsc(nm)+'</b>':''}</span></div>
          <div class="dsh-bizname">${bp.name ? dshEsc(bp.name) : 'مدیریت یدکی‌فروشی'}</div>
          <div class="dsh-date"><span>📅 ${FA_WEEKDAYS[isoWeekdaySat(t)]} ${jLabel(t)}</span><span dir="ltr">${dshEsc(todayEn)}</span></div>
          <div class="dsh-hchips">${chips.map(c=>`<button type="button" onclick="showPartsSub('${c[2]}')"><span>${c[0]}</span>${c[1]}</button>`).join('')}</div></div></div>
      ${hs.html}
      ${dshTodayStrip(R)}
    </div>
    <div class="dsh-tiles">${tiles.map(x=>`<button type="button" class="dsh-tile ${x[5]}" onclick="dshGo('${x[3]}'${x[4]?`,'${x[4]}'`:''})"><span class="dsh-tile-i">${x[0]}</span><b>${x[1]}</b><small>${x[2]}</small></button>`).join('')}</div>
    <div class="dsh-tick"><span class="dsh-tick-live"></span><span id="dshTickT" class="dsh-tick-t">${tickItems[0]||''}</span></div>
    <svg class="dsh-wave" viewBox="0 0 1200 60" preserveAspectRatio="none" aria-hidden="true"><path d="M0,30 C150,60 350,0 600,30 C850,60 1050,0 1200,30 L1200,60 L0,60 Z"/><path d="M0,40 C200,10 400,60 600,38 C800,16 1000,56 1200,36 L1200,60 L0,60 Z" class="w2"/></svg>
  </section>`;
}
function dshSpot(e, el){
  const r = el.getBoundingClientRect(); el.style.setProperty('--mx', ((e.clientX-r.left)/r.width*100).toFixed(1)+'%'); el.style.setProperty('--my', ((e.clientY-r.top)/r.height*100).toFixed(1)+'%');
}
const DSH_CARDS = [['trend','📊 روند درآمد و سود'],['goal','🎯 هدف فروش ماهانه'],['waterfall','🌊 از درآمد تا سود خالص'],['gauges','🧭 شاخص‌های سلامت'],['donut','🍩 سهم از درآمد'],['top','🏅 پرفروش‌ترین کالاها'],['weekday','📅 فروش در روزهای هفته'],['heat','🔥 تقویم فعالیت'],['stock','🩺 سلامت انبار'],['agents','🧑‍💼 عملکرد نمایندگان'],['suppliers','🏬 تامین‌کنندگان'],['low','⏳ کالاهای در آستانه‌ی اتمام'],['cash','💵 ورودی و خروجی صندوق'],['alerts','🔔 نیاز به توجه'],['people','👥 بهترین مشتری‌ها'],['custan','🧬 تحلیل مشتریان'],['activity','🕒 آخرین فعالیت‌ها'],['insights','💡 تحلیل خودکار']];
function dshHidden(){ return new Set(((PARTS.dash_settings||{}).hidden)||[]); }
function dshK(key, html){ return dshHidden().has(key) ? '' : html; }
function dshRender(animate){
  const root = document.getElementById('dshRoot'); if(!root) return;
  if(!DSH.init){ dshLoadSettings(); DSH.init = true; }
  const t = isoToday(), bp = PARTS.business_profile || {}, gr = dshGreeting();
  const hasData = (PARTS.sales||[]).length || (PARTS.purchases||[]).length || (PARTS.products||[]).length;
  let R;
  try{ R = dshData(); }catch(e){ console.error('[dashboard]', e); root.innerHTML = '<div class="dsh-empty">خطا در محاسبه‌ی داشبورد — '+dshEsc(String(e.message||e))+'</div>'; return; }
  DSH.R = R; DSH.lastW = root.clientWidth;
  const grainFa = ({day:'روزانه', week:'هفتگی', month:'ماهانه'})[R.grain];
  const chips = DSH_PERIODS.map(p=>`<button type="button" class="dsh-chip${p[0]===DSH.period?' on':''}" onclick="dshPeriod('${p[0]}')">${p[1]}</button>`).join('');
  const rangeTxt = R.period==='all' ? 'از اولین تراکنش تا آخرین' : (jLabel(R.range.from)+(R.range.from!==R.range.to ? ' تا '+jLabel(R.range.to) : ''));
  const donutSel = `<select class="dsh-sel" onchange="dshDonutBy(this.value)">${DSH_DONUTS.map(d=>`<option value="${d[0]}"${d[0]===DSH.donut?' selected':''}>${d[1]}</option>`).join('')}</select>`;
  const todayEn = new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  const ins = dshInsightList(R), tickItems = ins.map(x=>x[0]+' '+x[1]);
  const welcome = hasData ? '' : `<div class="dsh-card dsh-welcome"><h3>👋 به ELEVATE خوش آمدی</h3><p>هنوز داده‌ای ثبت نشده. با این سه قدم شروع کن؛ بعد از اولین فاکتور، داشبورد جان می‌گیرد.</p><div class="dsh-steps"><button type="button" onclick="dshGo('stores','openStoreModal')"><b>۱</b>تامین‌کننده بساز</button><button type="button" onclick="dshGo('products','openProductModal')"><b>۲</b>محصول اضافه کن</button><button type="button" onclick="dshGo('purchase','openPurchaseModal')"><b>۳</b>اولین خرید را ثبت کن</button></div></div>`;
  root.innerHTML = `
  <div class="dsh${animate===false?' dsh-still':''}">
    ${dshHero(R, {t, bp, gr, todayEn, tickItems})}
    ${welcome}
    <div class="dsh-toolbar"><div class="dsh-chips">${chips}</div><div class="dsh-range"><span>📆 ${rangeTxt}</span>${R.prevRange ? `<span class="dsh-vs">مقایسه با ${jShort(R.prevRange.from)} تا ${jShort(R.prevRange.to)}</span>` : ''}</div></div>
    <div class="dsh-kpis">${dshKpiCards(R)}</div>
    <div class="dsh-grid g-main">
      ${dshK('trend', dshCard('', '📊','روند درآمد و سود','Revenue & profit trend', `<div class="dsh-leg-inline"><span><i style="background:var(--coral)"></i>درآمد</span><span><i style="background:var(--sage)"></i>سود ناخالص</span>${R.serP?'<span><i class="dash" style="border-color:#b9a99a"></i>درآمد دوره‌ی قبل</span>':''}<span class="dsh-gr">${grainFa}${R.serFrom<R.range.from?' · حداقل ۱۴ روز':''}</span></div><div class="dsh-chart" data-chart="trend">${dshTrend(R, dshChartW('trend'))}</div>`, '', dshX(R.cfgSer, dshI(R.ser,'revenue'), -1)))}
      ${dshK('goal', dshCard('dsh-goalc','🎯','هدف فروش ماهانه','Monthly goal', dshGoal(R), DSH.goal>0 && !DSH.goalEdit ? `<button class="dsh-mini" type="button" onclick="dshGoalEdit(true)">✏️ ویرایش</button>` : '', DSH.goal>0 ? dshX(R.cfgMon, 0, -1) : ''))}
    </div>
    <div class="dsh-grid g-2">
      ${dshK('waterfall', dshCard('', '🌊','از درآمد تا سود خالص','Profit waterfall', dshWaterfall(R), ''))}
      ${dshK('gauges', dshCard('', '🧭','شاخص‌های سلامت','Health gauges', dshGauges(R), ''))}
    </div>
    <div class="dsh-grid g-3">
      ${dshK('donut', dshCard('', '🍩','سهم از درآمد','Revenue share', dshDonut(R), donutSel))}
      ${dshK('top', dshCard('', '🏅','پرفروش‌ترین کالاها','Top products', dshTop(R), ''))}
      ${dshK('weekday', dshCard('', '📅','فروش در روزهای هفته','By weekday', dshWeekday(R), ''))}
    </div>
    <div class="dsh-sec-t">🏦 وضعیت مالی امروز <span dir="ltr">Financial position</span></div>
    <div class="dsh-snaps">${dshSnapCards(R)}</div>
    <div class="dsh-grid g-main">
      ${dshK('heat', dshCard('', '🔥','تقویم فعالیت (۲۶ هفته‌ی اخیر)','Sales heatmap', dshHeat(R), '', dshX(R.cfgHeat, 0, -1)))}
      ${dshK('stock', dshCard('', '🩺','سلامت انبار','Stock health', dshStock(R), ''))}
    </div>
    <div class="dsh-grid g-3">
      ${dshK('agents', dshCard('', '🧑‍💼','عملکرد نمایندگان','Agents', dshRank(R.ag.rows, R.cfgAg, r=>`${fx(r.vals[2])} فاکتور · پورسانت ${fmtT(r.vals[1])}`), ''))}
      ${dshK('suppliers', dshCard('', '🏬','بیشترین خرید از تامین‌کنندگان','Top suppliers', dshRank(R.su.rows, R.cfgSu, r=>`${fx(r.vals[2])} سفارش · بدهی ${fmtT(r.vals[1])}`,'var(--sky)'), ''))}
      ${dshK('low', dshCard('', '⏳','کالاهای در آستانه‌ی اتمام','Running low', dshLowStock(R), ''))}
    </div>
    <div class="dsh-grid g-2">
      ${dshK('cash', dshCard('', '💵','ورودی و خروجی صندوق','Cash in / out', `<div class="dsh-leg-inline"><span><i style="background:var(--sage)"></i>ورودی</span><span><i style="background:var(--coral)"></i>خروجی</span><span class="dsh-gr">${grainFa}</span></div><div class="dsh-chart" data-chart="cash">${dshCash(R, dshChartW('cash'))}</div>`, '', dshX(R.cfgSer, dshI(R.ser,'cash_in'), -1)))}
      ${dshK('alerts', dshCard('', '🔔','نیاز به توجه','Needs attention', dshAlerts(R), ''))}
    </div>
    <div class="dsh-grid g-3">
      ${dshK('people', dshCard('', '👥','بهترین مشتری‌ها','Top customers', dshPeople(R), ''))}
      ${dshK('custan', dshCard('', '🧬','تحلیل مشتریان','Customer insights', dshCustomers(R), ''))}
      ${dshK('activity', dshCard('', '🕒','آخرین فعالیت‌ها','Recent activity', dshActivityHtml(), ''))}
    </div>
    ${dshK('insights', dshCard('', '💡','تحلیل خودکار','Insights', dshInsights(R), ''))}
    <div id="partsDashWidgets" class="dw-wrap dsh-pins"></div>
  </div>`;
  dshAfter(animate!==false);
  dshTickStart(tickItems);
  try{ renderDashboardWidgets(); }catch(e){ console.warn(e); }
}
// width of a chart box, measured from the real layout (first pass estimates it, dshFit() corrects it)
function dshChartW(kind){
  const root = document.getElementById('dshRoot'), w = root ? root.clientWidth : 1000;
  const frac = kind==='trend' ? (w>=900 ? 0.66 : 1) : (w>=900 ? 0.5 : 1);
  return Math.max(260, Math.floor((w-18)*frac) - 38);
}
function dshFit(){
  const R = DSH.R; if(!R) return;
  document.querySelectorAll('#dshRoot .dsh-chart[data-chart]').forEach(el=>{
    const w = Math.floor(el.clientWidth); if(w<200 || Math.abs(w-(+el.dataset.w||0))<3) return;
    el.dataset.w = w; el.innerHTML = el.dataset.chart==='trend' ? dshTrend(R, w) : dshCash(R, w);
  });
}
function dshAfter(animate){
  const root = document.getElementById('dshRoot'); if(!root) return;
  dshFit();
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const els = root.querySelectorAll('.dsh-cu'); const dur = 1000, t0 = performance.now();
  if(!animate || reduce){ return; }
  els.forEach(e=>{ e.textContent = dshFmt(0, e.dataset.f); });
  const ease = x=>1-Math.pow(1-x,3);
  const tick = now=>{
    const p = Math.min(1, (now-t0)/dur);
    els.forEach(e=>{ if(!e.isConnected) return; e.textContent = dshFmt((+e.dataset.to)*ease(p), e.dataset.f); });
    if(p<1) requestAnimationFrame(tick); else els.forEach(e=>{ if(e.isConnected) e.textContent = dshFmt(+e.dataset.to, e.dataset.f); });
  };
  requestAnimationFrame(tick);
}
async function dshPeriod(p){ DSH.period = p; dshRender(true); await dshSave({period:p}); }
async function dshDonutBy(d){ DSH.donut = d; dshRender(false); await dshSave({donut:d}); }
function dshGo(sub, fn){ showPartsSub(sub); if(fn) setTimeout(()=>{ try{ if(typeof window[fn]==='function') window[fn](); }catch(e){ console.warn(e); } }, 80); }
function dshOpen(kind, id){
  const m = {sale:['sales','openSaleModal'], purchase:['purchase','openPurchaseModal'], product:['products','openProductModal'], expense:['expenses','editExpense'], sales:['sales','']}[kind]; if(!m) return;
  showPartsSub(m[0]); if(m[1] && id) setTimeout(()=>{ try{ window[m[1]](id); }catch(e){ console.warn(e); } }, 80);
}
function dshToRb(cfg){
  RB = Object.assign(rbDefaults(), JSON.parse(JSON.stringify(cfg)), {presetId:'', calMonth:null});
  rbWriteControls(); rbRender();
}
function dshOnPartsRender(){
  try{ picApply((PARTS.dash_settings||{}).icon_style||'3d'); appThemeApply((PARTS.dash_settings||{}).app_theme||'classic'); }catch(e){}
  if(DSH.skipNext) return;
  if(partsCurrentSub==='home') dshRender(false);
}

// ── shared tooltip (any element with data-tip) ──
(function(){
  let tip = null;
  const get = ()=>{ if(!tip){ tip = document.createElement('div'); tip.className = 'dsh-tip'; document.body.appendChild(tip); } return tip; };
  const place = (e)=>{
    const t = get(), pad = 14, w = t.offsetWidth, h = t.offsetHeight;
    let x = e.clientX + pad, y = e.clientY + pad;
    if(x + w > window.innerWidth - 8) x = e.clientX - w - pad;
    if(y + h > window.innerHeight - 8) y = e.clientY - h - pad;
    t.style.left = Math.max(8, x)+'px'; t.style.top = Math.max(8, y)+'px';
  };
  document.addEventListener('pointermove', e=>{
    const el = e.target && e.target.closest ? e.target.closest('#dshRoot [data-tip]') : null;
    if(!el){ if(tip) tip.classList.remove('on'); return; }
    const t = get(); if(t.dataset.src !== el.getAttribute('data-tip')){ t.innerHTML = el.getAttribute('data-tip'); t.dataset.src = el.getAttribute('data-tip'); }
    t.classList.add('on'); place(e);
  });
  document.addEventListener('pointerleave', ()=>{ if(tip) tip.classList.remove('on'); }, true);
  window.addEventListener('scroll', ()=>{ if(tip) tip.classList.remove('on'); }, true);
  window.addEventListener('resize', ()=>{
    clearTimeout(DSH.resizeT);
    DSH.resizeT = setTimeout(()=>{ const r = document.getElementById('dshRoot'); if(r && partsCurrentSub==='home' && r.offsetParent && Math.abs(r.clientWidth-DSH.lastW)>24) dshRender(false); }, 250);
  });
})();

// ⓘ for any dashboard number — recomputes the exact same report and delegates to the report-builder trace
xdef('dsh_cell', a=>{
  RB_LAST = rbCompute(a.cfg, true);
  const r = XPL.rb_cell({mi:a.mi||0, ri:a.ri, ck:a.ck});
  const cfg = JSON.parse(JSON.stringify(a.cfg));
  r.sources = [{label:'🧮 باز کردن همین گزارش در گزارش‌ساز (برای ویرایش شرط‌ها و تفکیک)', link:{go:'reportbuilder', fn:'dshToRb', arg:cfg}}].concat(r.sources||[]);
  r.note = 'این عدد روی «داشبورد» نمایش داده می‌شود و با موتور گزارش‌ساز محاسبه شده؛ پس با گزارش‌ساز و گزارشات یکسان است. '+(r.note||'');
  return r;
});

// ── English names + formulas for the sweep-2 report-builder measures (shown in the ⓘ "definition" view) ──
Object.assign(RB_EN, {
  median_order:'Median invoice value', lines_per_order:'Lines per invoice', avg_line_value:'Average line revenue', max_line_revenue:'Largest line revenue',
  cogs_pct:'COGS % of revenue', ship_cover_pct:'Shipping cover %', returned_orders:'Invoices with returns', unpaid_orders:'Invoices with balance due',
  unpaid_orders_pct:'Credit-sale share %', discounted_orders_pct:'Discounted-invoice share %', pickup_pct:'Pick-up share %', agent_orders_pct:'Agent-invoice share %',
  loss_orders_pct:'Loss-making invoice share %', distinct_brands_sold:'Distinct brands sold', distinct_cars_sold:'Distinct car models sold', active_days:'Days with sales',
  revenue_per_day:'Revenue per day', profit_per_day:'Profit per day', orders_per_day:'Invoices per day', revenue_per_active_day:'Revenue per active day',
  purchase_per_day:'Purchases per day', units_per_purchase:'Units per purchase order', lines_per_purchase:'Lines per purchase order', unpaid_purchases:'Purchase orders with debt',
  paid_pct:'Paid % of purchases', distinct_products_bought:'Distinct products bought', distinct_suppliers:'Distinct suppliers', max_purchase:'Largest purchase order', min_purchase:'Smallest purchase order',
  products_with_stock:'Products in stock', avg_stock_per_product:'Average stock per product', max_stock:'Largest single stock', products_no_price:'Products without sale price',
  price_set_pct:'Priced products %', low_stock_pct:'Low-stock products %', out_of_stock_pct:'Out-of-stock products %', dead_stock_pct:'Dead stock % of inventory value',
  stock_value_share:'Share of inventory value %', avg_return_value:'Average return value', restock_pct:'Restocked returns %', cash_refund_pct:'Cash-refund % of returns',
  largest_expense:'Largest expense', expenses_per_day:'Expenses per day', expense_share:'Share of expenses %', cash_txn_count:'Cash transactions',
  avg_cash_in:'Average cash inflow', avg_cash_out:'Average cash outflow', largest_outflow:'Largest cash outflow', largest_inflow:'Largest cash inflow',
  commission_per_order:'Commission per invoice', payout_avg:'Average commission payout', payout_pct:'Paid % of accrued commission', debtors_pct:'Indebted customers %',
  max_customer_debt:'Largest customer debt', avg_store_payable:'Average payable per supplier', avg_store_ship:'Average supplier shipping cost',
  pe_stores:'Suppliers with price list', pe_items:'Priced items / groups'
});
Object.assign(RB_FT, {
  median_order:'میانه‌ی «مبلغ فاکتور» روی فاکتورهای بازه (نیمی کمتر، نیمی بیشتر)', lines_per_order:'تعداد ردیف‌های فروش ÷ تعداد فاکتور', avg_line_value:'جمع درآمد ÷ تعداد ردیف فروش',
  max_line_revenue:'بزرگ‌ترین «درآمد ردیف» در بازه', cogs_pct:'بهای تمام‌شده ÷ درآمد × ۱۰۰', ship_cover_pct:'هزینه‌ی ارسالِ گرفته‌شده از مشتری ÷ هزینه‌ی ارسالِ پرداخت‌شده × ۱۰۰',
  returned_orders:'شمارش فاکتورهایی که حداقل یک ردیفشان مرجوعی دارد', unpaid_orders:'شمارش فاکتورهایی که مانده‌ی دریافت‌نشده دارند', unpaid_orders_pct:'فاکتورهای دارای مانده ÷ همه‌ی فاکتورها × ۱۰۰',
  discounted_orders_pct:'فاکتورهای تخفیف‌دار ÷ همه‌ی فاکتورها × ۱۰۰', pickup_pct:'فاکتورهای حضوری ÷ همه‌ی فاکتورها × ۱۰۰', agent_orders_pct:'فاکتورهای دارای نماینده ÷ همه‌ی فاکتورها × ۱۰۰',
  loss_orders_pct:'فاکتورهای زیان‌ده ÷ همه‌ی فاکتورها × ۱۰۰', distinct_brands_sold:'شمارش برندهای یکتا در ردیف‌های فروش', distinct_cars_sold:'شمارش مدل‌های خودروی یکتا در ردیف‌های فروش',
  active_days:'شمارش روزهای یکتا که حداقل یک فاکتور داشته‌اند', revenue_per_day:'جمع درآمد ÷ تعداد کل روزهای بازه', profit_per_day:'جمع سود ÷ تعداد کل روزهای بازه', orders_per_day:'تعداد فاکتور ÷ تعداد کل روزهای بازه',
  revenue_per_active_day:'جمع درآمد ÷ تعداد روزهای دارای فروش', purchase_per_day:'مبلغ خرید ÷ تعداد کل روزهای بازه', units_per_purchase:'تعداد کالای خریداری‌شده ÷ تعداد سفارش خرید', lines_per_purchase:'تعداد ردیف خرید ÷ تعداد سفارش خرید',
  unpaid_purchases:'شمارش سفارش‌های خریدی که بدهی باقی‌مانده دارند', paid_pct:'پرداخت‌شده به تامین‌کنندگان ÷ مبلغ خرید × ۱۰۰', distinct_products_bought:'شمارش کالاهای یکتا در ردیف‌های خرید', distinct_suppliers:'شمارش تامین‌کنندگان یکتا در خریدها',
  max_purchase:'بزرگ‌ترین مبلغ یک سفارش خرید', min_purchase:'کوچک‌ترین مبلغ یک سفارش خرید', products_with_stock:'شمارش کالاهایی که موجودی > ۰ دارند', avg_stock_per_product:'جمع موجودی ÷ تعداد کالا',
  max_stock:'بیشترین موجودیِ یک کالا', products_no_price:'شمارش کالاهای بدون قیمت فروش', price_set_pct:'کالاهای دارای قیمت ÷ همه‌ی کالاها × ۱۰۰', low_stock_pct:'کالاهای کم‌موجودی ÷ همه‌ی کالاها × ۱۰۰',
  out_of_stock_pct:'کالاهای ناموجود ÷ همه‌ی کالاها × ۱۰۰', dead_stock_pct:'ارزش کالاهای راکد ÷ ارزش کل موجودی × ۱۰۰', stock_value_share:'ارزش موجودی این ردیف ÷ ارزش کل موجودی × ۱۰۰',
  avg_return_value:'ارزش مرجوعی ÷ تعداد مرجوعی‌ها', restock_pct:'تعداد برگشته به انبار ÷ تعداد مرجوعی‌ها × ۱۰۰', cash_refund_pct:'نقد بازگردانده‌شده ÷ ارزش مرجوعی × ۱۰۰',
  largest_expense:'بزرگ‌ترین مبلغ یک هزینه', expenses_per_day:'جمع هزینه ÷ تعداد کل روزهای بازه', expense_share:'هزینه‌ی این ردیف ÷ کل هزینه‌های بازه × ۱۰۰', cash_txn_count:'شمارش ردیف‌های دفتر صندوق',
  avg_cash_in:'جمع ورودی‌ها ÷ تعداد ورودی‌ها', avg_cash_out:'جمع خروجی‌ها ÷ تعداد خروجی‌ها', largest_outflow:'بزرگ‌ترین خروجیِ یک تراکنش', largest_inflow:'بزرگ‌ترین ورودیِ یک تراکنش',
  commission_per_order:'پورسانت ÷ تعداد فاکتور', payout_avg:'جمع پرداخت‌های پورسانت ÷ تعداد پرداخت‌ها', payout_pct:'پرداخت‌شده ÷ پورسانت محاسبه‌شده × ۱۰۰', debtors_pct:'مشتریان بدهکار ÷ همه‌ی مشتریان × ۱۰۰',
  max_customer_debt:'بزرگ‌ترین مانده‌ی بدهی یک مشتری', avg_store_payable:'جمع بدهی‌ها ÷ تعداد تامین‌کننده‌ها', avg_store_ship:'جمع هزینه‌ی ارسال ÷ تعداد تامین‌کننده‌ها',
  pe_stores:'شمارش تامین‌کنندگان یکتا در ردیف‌های قیمت لیست', pe_items:'شمارش کالا/گروه‌های یکتا در ردیف‌های قیمت لیست'
});

// ══════════════════════════════════════════════════════════════════════════════
//  ⚙️ مرکز تنظیمات — همه‌ی تنظیمات کلی یک‌جا و مستقیماً قابل ویرایش (بدون پنجره‌ی جدا)
//  هر کارت دکمه‌ی «ذخیره»‌ی خودش را دارد و روی سرور ذخیره می‌شود. پیشوند stg
// ══════════════════════════════════════════════════════════════════════════════
const STG = {logo:null, payer:null, theme:null, bpTheme:null, bpColor:null};
const stgG = id=>document.getElementById(id);
const stgV = id=>{ const e = stgG(id); return e ? e.value : ''; };
function stgCard(id, ic, fa, en, body, saveFn, extraBtns){
  return `<section class="stg-card" id="stgc_${id}"><div class="stg-ch"><span>${ic}</span><div><b>${fa}</b><small dir="ltr">${en}</small></div></div>${body}
    <div class="stg-foot">${saveFn ? `<button class="parts-add-btn" type="button" style="margin:0;" onclick="${saveFn}()">💾 ذخیره‌ی این بخش</button>` : ''}${extraBtns||''}<span class="stg-st" id="stgst_${id}"></span></div></section>`;
}
function stgField(label, input, hint, wide){ return `<div class="stg-f${wide?' w':''}"><label>${label}</label>${input}${hint?`<small>${hint}</small>`:''}</div>`; }
function stgSeg(id, opts, cur, fn){ return `<div class="stg-seg" id="${id}">${opts.map(o=>`<button type="button" class="${o[0]===cur?'on':''}" onclick="${fn}('${o[0]}')">${o[1]}</button>`).join('')}</div>`; }
function stgMsg(id, t){ const e = stgG('stgst_'+id); if(e){ e.textContent = t; setTimeout(()=>{ if(e.textContent===t) e.textContent = ''; }, 4000); } }
function renderSettingsHub(){
  const host = stgG('stgRoot'); if(!host) return;
  if(host.contains(document.activeElement) && document.activeElement.matches('input,textarea,select')) return;   // never clobber what the user is typing
  const bp = PARTS.business_profile || {}, ps = PARTS.pricing_settings || {}, ds = PARTS.dash_settings || {};
  STG.bpTheme = STG.bpTheme || bp.invoice_theme || 'classic'; STG.bpColor = STG.bpColor || bp.invoice_color || 'sunset'; STG.payer = STG.payer || ps.shipping_payer || 'business'; STG.theme = STG.theme || ds.theme || 'sunset';
  const logo = STG.logo !== null ? STG.logo : (bp.logo||'');
  const hid = new Set(ds.hidden||[]);
  const lowN = (PARTS.low_stock||[]).length;
  const cards = [];
  cards.push(stgCard('bp','🏢','مشخصات کسب‌وکار','Business profile', `
    <div class="stg-row">
      <div class="stg-f w"><label>لوگو</label><div class="stg-logo">${logo ? `<img id="stgLogoPrev" src="${dshEsc(logo)}" alt="">` : `<div class="ph" id="stgLogoPrev">🏢</div>`}
        <label class="parts-header-btn" style="cursor:pointer;margin:0;">📷 انتخاب تصویر<input type="file" accept="image/*" style="display:none" onchange="stgLogo(this)"></label>${logo ? `<button type="button" class="parts-header-btn" onclick="stgLogoClear()">🗑️ حذف لوگو</button>` : ''}</div>
        <small>روی فاکتور، پیش‌فاکتور و بالای داشبورد نمایش داده می‌شود (خودکار کوچک می‌شود).</small></div>
      ${stgField('نام کسب‌وکار','<input class="stg-in" id="stgBpName" value="'+dshEsc(bp.name||'')+'" placeholder="مثلاً یدکی ۶۹">')}
      ${stgField('تلفن','<input class="stg-in" id="stgBpPhone" dir="ltr" value="'+dshEsc(bp.phone||'')+'" placeholder="09…">')}
      ${stgField('آدرس','<textarea class="stg-in" id="stgBpAddr" placeholder="شیراز، …">'+dshEsc(bp.address||'')+'</textarea>', '', true)}
      ${stgField('متن پایین فاکتور','<textarea class="stg-in" id="stgBpFoot" placeholder="مثلاً: ضمانت اصالت کالا">'+dshEsc(bp.footer_note||'')+'</textarea>','', true)}
      ${stgField('قالب فاکتور', stgSeg('stgBpTheme',INV_STYLES.map(x=>[x[0],x[1]]), STG.bpTheme,'stgSetBpTheme'),'',true)}
      ${stgField('رنگ فاکتور', stgSeg('stgBpColor',INV_COLORS.map(x=>[x[0],x[1]]), STG.bpColor,'stgSetBpColor'),'برای دیدن زنده‌ی ۲۵ قالب، یک فاکتور را باز کن و همان‌جا ساختار و رنگ را عوض کن.',true)}
      ${stgField('شماره‌ی فاکتور بعدی','<input class="stg-in" id="stgNextInv" type="number" min="1" dir="ltr" value="'+(bp.next_invoice_no||1)+'">','شماره‌ای که فاکتور بعدی می‌گیرد؛ فقط جلو ببر تا تکراری نشود.')}
      ${stgField('شماره‌ی پیش‌فاکتور بعدی','<input class="stg-in" id="stgNextQuote" type="number" min="1" dir="ltr" value="'+(bp.next_quote_no||1)+'">')}
      ${stgField('شماره‌ی سفارش خرید بعدی','<input class="stg-in" id="stgNextPo" type="number" min="1" dir="ltr" value="'+(bp.next_po_no||1)+'">')}
    </div>`, 'stgSaveBp'));
  cards.push(stgCard('ps','🧮','قیمت‌گذاری و ارسال (پیش‌فرض سراسری)','Pricing defaults', `
    <div class="stg-row">
      ${stgField('هزینه‌ی ارسال پیش‌فرض','<div class="stg-in-u"><input class="stg-in" id="stgPsShip" type="number" min="0" dir="ltr" value="'+(ps.shipping_cost||0)+'"><span>KT</span></div>','برای کالاهایی که هزینه‌ی ارسال اختصاصی ندارند.')}
      ${stgField('گام رند کردن قیمت پیشنهادی','<div class="stg-in-u"><input class="stg-in" id="stgPsRound" type="number" min="0.01" step="any" dir="ltr" value="'+(ps.round_step||1)+'"><span>KT</span></div>','قیمت پیشنهادی تا مضرب بعدی این عدد بالا می‌رود.')}
      ${stgField('پرداخت‌کننده‌ی ارسال', stgSeg('stgPsPayer',[['business','خودم'],['customer','مشتری'],['split','نصف‌نصف']], STG.payer,'stgSetPayer'),'',true)}
      <div class="stg-f" id="stgRatioF" style="${STG.payer==='split'?'':'display:none'}"><label>سهم مشتری از ارسال</label><div class="stg-in-u"><input class="stg-in" id="stgPsRatio" type="number" min="0" max="100" dir="ltr" value="${ps.shipping_split_ratio!=null?Math.round(ps.shipping_split_ratio*100):50}"><span>٪</span></div></div>
      ${stgField('مارجین هدف','<div class="stg-in-u"><input class="stg-in" id="stgPsMargin" type="number" min="0" max="95" step="any" dir="ltr" value="'+(ps.target_margin_pct??20)+'"><span>٪</span></div>','قیمت پیشنهادی بر این اساس محاسبه می‌شود.')}
      ${stgField('سهم نماینده از سود','<div class="stg-in-u"><input class="stg-in" id="stgPsAgent" type="number" min="0" max="100" step="any" dir="ltr" value="'+(ps.agent_share_pct??0)+'"><span>٪</span></div>')}
      <div class="stg-f w"><label class="stg-chk"><input type="checkbox" id="stgPsInc" ${ps.include_agent_share?'checked':''}> سهم نماینده در قیمت پیشنهادی لحاظ شود</label></div>
    </div>`, 'stgSavePs'));
  cards.push(stgCard('st','📦','هشدار موجودی','Stock alerts', `
    <div class="stg-row">${stgField('حد پیش‌فرض کم‌موجودی','<div class="stg-in-u"><input class="stg-in" id="stgLow" type="number" min="0" step="any" dir="ltr" value="'+(PARTS.low_stock_threshold??2)+'"><span>عدد</span></div>','کالایی که موجودی‌اش ≤ این عدد باشد «کم‌موجودی» حساب می‌شود (مگر نقطه‌ی سفارش اختصاصی داشته باشد). اکنون <b>'+fx(lowN)+'</b> کالا در این وضعیت است.',true)}</div>`, 'stgSaveLow'));
  const cnt = [['محصول',(PARTS.products||[]).length],['فروش',(PARTS.sales||[]).length],['خرید',(PARTS.purchases||[]).length],['هزینه',(PARTS.business_expenses||[]).length],['مشتری',(PARTS.customers||[]).length],['تامین‌کننده',(PARTS.stores||[]).length],['نماینده',(PARTS.sales_agents||[]).length],['مرجوعی',(PARTS.sale_returns||[]).length]];
  cards.push(stgCard('dt','💾','داده‌ها و پشتیبان‌گیری','Data & backup', `<div class="stg-cnt">${cnt.map(c=>`<div><b>${fx(c[1])}</b>${c[0]}</div>`).join('')}</div>
    <p style="font-size:12px;color:var(--text3);line-height:1.9;margin:12px 0 0;">همه‌ی اطلاعات روی سرور ذخیره می‌شود. برای اطمینان بیشتر، گهگاه یک نسخه‌ی پشتیبان (JSON) بگیر و جای امنی نگه دار. مبلغ‌ها به <b>KT = کیلو تومان = هزار تومان</b> هستند.</p>`, null,
    `<button type="button" class="parts-add-btn" style="margin:0;" onclick="stgBackup()">⬇️ دانلود نسخه‌ی پشتیبان</button><button type="button" class="parts-header-btn" style="margin:0;" onclick="showPartsSub('reportbuilder')">🧮 گزارش‌ساز</button>`));
  cards.push(stgCard('ds','🏠','داشبورد و ظاهر','Dashboard & look', `
    <div class="stg-row">
      ${stgField('نام برای خوش‌آمدگویی','<input class="stg-in" id="stgDsName" value="'+dshEsc(ds.user_name||'')+'" placeholder="مثلاً سهیل">','در بنر بالای داشبورد: «ظهر بخیر، سهیل».')}
      ${stgField('بازه‌ی پیش‌فرض','<select class="stg-in" id="stgDsPeriod">'+DSH_PERIODS.map(p=>`<option value="${p[0]}"${p[0]===(ds.period||DSH.period)?' selected':''}>${p[1]}</option>`).join('')+'</select>')}
      ${stgField('تفکیک پیش‌فرض نمودار دونات','<select class="stg-in" id="stgDsDonut">'+DSH_DONUTS.map(p=>`<option value="${p[0]}"${p[0]===(ds.donut||DSH.donut)?' selected':''}>${p[1]}</option>`).join('')+'</select>')}
      ${stgField('هدف فروش ماهانه','<div class="stg-in-u"><input class="stg-in" id="stgDsGoal" type="number" min="0" dir="ltr" value="'+(ds.goal||DSH.goal||'')+'" placeholder="۰ = بدون هدف"><span>KT</span></div>')}
      <div class="stg-f w"><label>تم نرم‌افزار <span class="rb-en" dir="ltr">App theme</span></label>${stgThemePicker()}<small>رنگ اصلی و زمینه‌ی کل نرم‌افزار؛ همان لحظه اعمال و ذخیره می‌شود.</small></div>
      <div class="stg-f w"><label>سبک آیکون‌ها <span class="rb-en" dir="ltr">Icon style</span></label>${stgIconPicker()}<small>روی کل بخش قطعات اعمال می‌شود و همان لحظه ذخیره می‌شود.</small></div>
      <div class="stg-f w"><label>رنگ‌بندی بنر داشبورد</label><div class="stg-themes">${Object.entries(DSH_THEMES).map(([k,l])=>`<button type="button" class="stg-th ${k===STG.theme?'on':''}" onclick="stgSetTheme('${k}')"><i class="dsh-hero t-${k}" style="background:var(--hg);padding:0;box-shadow:none;border-radius:10px;height:34px;animation:none;"></i>${l}</button>`).join('')}</div></div>
      <div class="stg-f w"><label>کارت‌هایی که روی داشبورد نمایش داده شوند</label><div class="stg-vis">${DSH_CARDS.map(c=>`<label class="stg-chk"><input type="checkbox" data-dk="${c[0]}" ${hid.has(c[0])?'':'checked'}> ${c[1]}</label>`).join('')}</div></div>
    </div>`, 'stgSaveDs', `<button type="button" class="parts-header-btn" style="margin:0;" onclick="showPartsSub('home')">🏠 دیدن داشبورد</button>`));
  host.innerHTML = `<div class="stg-top"><div><h2>⚙️ تنظیمات کلی <span class="rb-en" dir="ltr" style="font-size:12px;font-weight:500;color:var(--text4);">Settings</span></h2><p>هر بخش را همین‌جا ویرایش کن و «ذخیره» بزن؛ همه‌چیز روی سرور می‌ماند.</p></div>
    <div class="stg-jump"><a onclick="stgGo('bp')">🏢 کسب‌وکار</a><a onclick="stgGo('ps')">🧮 قیمت‌گذاری</a><a onclick="stgGo('st')">📦 موجودی</a><a onclick="stgGo('ds')">🏠 داشبورد</a><a onclick="stgGo('dt')">💾 پشتیبان</a></div></div>
    <div class="stg-grid">${cards.join('')}</div>`;
}

const APP_THEMES=[['classic','مرجانی گرم','Warm coral','#e85d3a','#faf6ee'],['sunset','غروب نارنجی','Sunset','#e8742a','#fdf7f0'],['gold','طلایی','Gold','#c8962a','#fbf8ee'],['coffee','قهوه‌ای','Coffee','#8b5e3c','#f8f3ee'],['rose','رز','Rose','#d4456e','#fdf5f8'],['burgundy','شرابی','Burgundy','#9b2d4a','#fbf3f5'],['plum','بنفشه','Plum','#7b4bb3','#f8f5fc'],['lavender','اطلسی','Lavender','#8e7cc3','#f7f5fc'],['indigo','نیلی','Indigo','#4f5bd5','#f3f4fd'],['ocean','اقیانوس','Ocean','#1f6fb5','#f2f7fc'],['sky','آسمانی','Sky','#3aa0e0','#f1f8fd'],['teal','فیروزه‌ای','Teal','#0f9d9a','#f0f9f9'],['mint','نعنایی','Mint','#2fb085','#f1faf6'],['forest','جنگل','Forest','#2e8556','#f3f9f5'],['olive','زیتونی','Olive','#7a8b2d','#f7f8ee'],['graphite','گرافیت','Graphite','#374151','#f5f5f6'],['night','شب','Night','#e85d3a','#1d1f24'],['night-ocean','شب اقیانوسی','Night ocean','#1f6fb5','#1d1f24'],['night-forest','شب جنگلی','Night forest','#2e8556','#1d1f24'],['night-violet','شب بنفش','Night violet','#7b4bb3','#1d1f24'],['night-gold','شب طلایی','Night gold','#c8962a','#1d1f24'],['night-rose','شب رز','Night rose','#d4456e','#1d1f24'],['night-teal','شب فیروزه‌ای','Night teal','#0f9d9a','#1d1f24']];
function appThemeApply(k){ if(!APP_THEMES.some(t=>t[0]===k)) k='classic'; if(k==='classic') document.documentElement.removeAttribute('data-apptheme'); else document.documentElement.setAttribute('data-apptheme',k); }
function stgThemePicker(){
  const cur=(PARTS.dash_settings||{}).app_theme||'classic';
  return '<div class="stg-apt"><div class="stg-apt-h">روشن</div>'+APP_THEMES.map(t=>(t[0]==='night'?'<div class="stg-apt-h">تیره</div>':'')+`<button type="button" class="stg-at ${t[0]===cur?'on':''}" data-at="${t[0]}" onclick="stgSetAppTheme('${t[0]}')"><span class="stg-at-sw" style="background:${t[4]};border-color:${t[0].startsWith('night')?'#444':'#0001'}"><i style="background:${t[3]}"></i><i style="background:${t[3]};opacity:.45;width:46%"></i><i style="background:${t[0].startsWith('night')?'#555':'#0002'};width:30%"></i></span><b>${t[1]}</b><small dir="ltr">${t[2]}</small></button>`).join('')+'</div>';
}
async function stgSetAppTheme(k){
  appThemeApply(k);
  document.querySelectorAll('.stg-at').forEach(b=>b.classList.toggle('on', b.getAttribute('data-at')===k));
  const r = await dshSave({app_theme:k});
  if(r && r.ok!==false) showToast('تم نرم‌افزار ذخیره شد','success');
}
const STG_ICON_STYLES=[['emoji','حالت اموجی','Emoji','اموجی‌های اصلی سیستم'],['3d','سه‌بعدی','3D','آیکون‌های سه‌بعدی اختصاصی'],['s1','کاشی گرادیان','Gradient tile','سبک ۱ · کاشی رنگی با آیکون سفید'],['s2','حباب پاستلی','Pastel bubble','سبک ۲ · دایره‌ی ملایم با آیکون رنگی'],['s3','دورنگ خطی','Duotone','سبک ۳ · خط رنگی با پرکننده‌ی ملایم'],['s4','نشان توپر','Solid badge','سبک ۴ · دایره‌ی رنگی با آیکون سفید'],['s5','براق','Glossy','سبک ۵ · کاشی براق و برجسته'],['s6','نئون تیره','Neon','سبک ۶ · نئون روی زمینه‌ی تیره'],['s7','استیکر','Sticker','سبک ۷ · برچسب با سایه‌ی سخت'],['s8','حلقه‌ی رنگین‌کمانی','Rainbow ring','سبک ۸ · حلقه‌ی گرادیان'],['s9','شیشه‌ای','Glass','سبک ۹ · شیشه‌ی مات و نیمه‌شفاف'],['s10','نرم برجسته','Soft','سبک ۱۰ · سایه‌ی نرم نئومورفیک'],['s11','توپر درشت','Bold fill','سبک ۱۱ · شکل‌های پر و رنگی'],['s12','نقشه‌ی فنی','Blueprint','سبک ۱۲ · خطوط روشن روی آبی تیره']];
function stgIconPicker(){
  const cur=PIC_MODE, sample=['📦','🧾','💰','📈','👥','🚚','🏷','🎁'];
  return '<div class="stg-icons">'+STG_ICON_STYLES.map(s=>{
    const prev=s[0]==='emoji'?sample.map(e=>'<span class="stg-ie">'+picChar(e)+'</span>').join(''):sample.map(e=>{
      const k=picKey(e), g=PIC_GMAP[k];
      if(s[0]==='3d'||!g||!PIC_G[g]) return PIC3[k]?'<svg class="pic3" viewBox="0 0 64 64" aria-hidden="true">'+PIC3[k]+'</svg>':'';
      return '<svg class="pic pic-'+g+'" viewBox="0 0 24 24" aria-hidden="true">'+PIC_G[g]+'</svg>';
    }).join('');
    return '<button type="button" class="stg-ic '+(s[0]===cur?'on':'')+'" data-ps="'+s[0]+'" onclick="stgSetIcon(\''+s[0]+'\')"><span class="stg-ic-t"><b>'+s[1]+'</b><i dir="ltr">'+s[2]+'</i></span><span class="stg-ic-p" data-nopic="1" data-ps="'+s[0]+'">'+prev+'</span><small>'+s[3]+'</small></button>';
  }).join('')+'</div>';
}
async function stgSetIcon(k){
  picApply(k);
  document.querySelectorAll('.stg-ic').forEach(b=>b.classList.toggle('on', b.getAttribute('data-ps')===k));
  const r = await dshSave({icon_style:k});
  if(r && r.ok!==false) showToast('سبک آیکون‌ها ذخیره شد','success');
}
function stgGo(id){ const e = stgG('stgc_'+id); if(e) e.scrollIntoView({behavior:'smooth', block:'start'}); }
function stgSetBpColor(t){ STG.bpColor = t; document.querySelectorAll('#stgBpColor button').forEach(b=>b.classList.toggle('on', b.getAttribute('onclick').includes("'"+t+"'"))); }
function stgSetBpTheme(t){ STG.bpTheme = t; document.querySelectorAll('#stgBpTheme button').forEach(b=>b.classList.toggle('on', b.getAttribute('onclick').includes("'"+t+"'"))); }
function stgSetPayer(t){ STG.payer = t; document.querySelectorAll('#stgPsPayer button').forEach(b=>b.classList.toggle('on', b.getAttribute('onclick').includes("'"+t+"'"))); const r = stgG('stgRatioF'); if(r) r.style.display = t==='split' ? '' : 'none'; }
function stgSetTheme(t){ STG.theme = t; document.querySelectorAll('.stg-th').forEach(b=>b.classList.toggle('on', b.getAttribute('onclick').includes("'"+t+"'"))); }
function stgLogo(inp){
  const f = inp.files && inp.files[0]; if(!f) return;
  const fr = new FileReader();
  fr.onload = ()=>{ const im = new Image(); im.onload = ()=>{ const k = Math.min(1, 480/Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.max(1,Math.round(im.width*k)); c.height = Math.max(1,Math.round(im.height*k)); c.getContext('2d').drawImage(im,0,0,c.width,c.height); STG.logo = c.toDataURL('image/png'); const p = stgG('stgLogoPrev'); if(p){ const n = document.createElement('img'); n.id = 'stgLogoPrev'; n.src = STG.logo; p.replaceWith(n); } stgMsg('bp','لوگو انتخاب شد؛ «ذخیره» را بزن'); }; im.src = fr.result; };
  fr.readAsDataURL(f);
}
function stgLogoClear(){ STG.logo = ''; const p = stgG('stgLogoPrev'); if(p){ const n = document.createElement('div'); n.className = 'ph'; n.id = 'stgLogoPrev'; n.textContent = '🏢'; p.replaceWith(n); } stgMsg('bp','لوگو حذف می‌شود؛ «ذخیره» را بزن'); }
async function stgSaveBp(){
  const p = {name:stgV('stgBpName'), phone:stgV('stgBpPhone'), address:stgV('stgBpAddr'), footer_note:stgV('stgBpFoot'), invoice_theme:STG.bpTheme, invoice_color:STG.bpColor, next_invoice_no:stgV('stgNextInv'), next_quote_no:stgV('stgNextQuote'), next_po_no:stgV('stgNextPo')};
  if(STG.logo !== null) p.logo = STG.logo;
  const r = await postParts('update_business_profile', p); STG.logo = null; STG.bpTheme = null; STG.bpColor = null;
  if(r && r.ok!==false){ showToast('مشخصات کسب‌وکار ذخیره شد','success'); stgMsg('bp','✅ ذخیره شد'); }
}
async function stgSavePs(){
  const r = await postParts('update_pricing_settings', {shipping_cost:stgV('stgPsShip')||0, round_step:stgV('stgPsRound')||1, shipping_payer:STG.payer, shipping_split_ratio:(parseFloat(stgV('stgPsRatio'))||50)/100,
    target_margin_pct:stgV('stgPsMargin')||0, agent_share_pct:stgV('stgPsAgent')||0, include_agent_share:!!(stgG('stgPsInc')||{}).checked});
  STG.payer = null; if(r && r.ok!==false){ showToast('تنظیمات قیمت‌گذاری ذخیره شد','success'); stgMsg('ps','✅ ذخیره شد'); }
}
async function stgSaveLow(){
  const v = parseFloat(stgV('stgLow')); if(!isFinite(v) || v<0){ showToast('عدد معتبر وارد کن','error'); return; }
  const r = await postParts('set_low_stock_threshold', {value:v}); if(r && r.ok!==false){ showToast('حد کم‌موجودی ذخیره شد','success'); stgMsg('st','✅ ذخیره شد'); }
}
async function stgSaveDs(){
  const goal = rbParseNum(stgV('stgDsGoal')) || 0, hidden = [...document.querySelectorAll('#stgc_ds [data-dk]')].filter(c=>!c.checked).map(c=>c.dataset.dk);
  DSH.period = stgV('stgDsPeriod') || DSH.period; DSH.donut = stgV('stgDsDonut') || DSH.donut; DSH.goal = Math.max(0, goal);
  const r = await dshSave({user_name:stgV('stgDsName').trim(), theme:STG.theme, hidden, goal:DSH.goal, period:DSH.period, donut:DSH.donut});
  STG.theme = null; if(r && r.ok!==false){ showToast('تنظیمات داشبورد ذخیره شد','success'); stgMsg('ds','✅ ذخیره شد'); }
}
function stgBackup(){
  try{
    const blob = new Blob([JSON.stringify(PARTS, null, 1)], {type:'application/json'}), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'elevate-parts-backup-'+isoToday()+'.json'; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 500);
    showToast('نسخه‌ی پشتیبان دانلود شد','success');
  }catch(e){ showToast('دانلود انجام نشد','error'); }
}

/* ══════════════════════════════════════════════════════════════════
   PIC — آیکون‌های سه‌بعدی چندرنگ به‌جای اموجی (پیشوند pic)
   هر اموجی بخش قطعات (استاتیک و داینامیک) یک آیکون SVG اختصاصی دارد.
   ══════════════════════════════════════════════════════════════════ */
/* آیکون‌های خطی/رنگی (برای سبک‌های ۱، ۳، ۶، ۷) */
const PIC_G = {
  box:'<path class="f" d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  doc:'<path class="f" d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  receipt:'<path class="f" d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  gift:'<path class="f" d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7"/><path d="M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z"/>',
  wallet:'<path class="f" d="M20 7H5a2 2 0 0 1 0-4h13v4M3 5v14a2 2 0 0 0 2 2h15v-4"/><path d="M21 12v4h-4a2 2 0 0 1 0-4z"/>',
  banknote:'<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 12h.01M18 12h.01"/>',
  dollar:'<circle cx="12" cy="12" r="10"/><path d="M15 9.5c0-1.4-1.3-2-3-2s-3 .8-3 2 1.3 1.8 3 2.2 3 .9 3 2.3-1.3 2-3 2-3-.6-3-2M12 5.8v1.7M12 16.5v1.7"/>',
  card:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  bank:'<path class="f" d="M3 21h18M5 21V10M9 21V10M15 21V10M19 21V10M2 10l10-7 10 7z"/>',
  store:'<path class="f" d="M3 9l2-5h14l2 5M3 9v11h18V9"/><path d="M3 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3M10 20v-5h4v5"/>',
  building:'<path class="f" d="M4 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17M15 9h4a1 1 0 0 1 1 1v11M2 21h20M8 7h2M8 11h2M8 15h2"/>',
  up:'<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  down:'<path d="M3 7l6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
  bars:'<path d="M3 3v18h18"/><path d="M8 17v-5M13 17V7M18 17v-8"/>',
  pie:'<path d="M21.2 15.9A10 10 0 1 1 8 2.8"/><path class="f" d="M22 12A10 10 0 0 0 12 2v10z"/>',
  tag:'<path class="f" d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><path d="M7.5 7.5h.01"/>',
  download:'<path d="M12 3v12M7 11l5 5 5-5M4 20h16"/>',
  upload:'<path d="M12 17V5M7 9l5-5 5 5M4 20h16"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users:'<circle cx="9" cy="8" r="3.5"/><path d="M2 21a7 7 0 0 1 14 0M16 4.5a3.5 3.5 0 0 1 0 7M22 21a7 7 0 0 0-5-6.7"/>',
  briefcase:'<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M2 13h20"/>',
  branch:'<path d="M6 3v12"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  calc:'<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h.01M16 19h.01"/>',
  truck:'<path class="f" d="M1 6h13v11H1zM14 10h5l3 3v4h-8"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  trash:'<path class="f" d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
  check:'<circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/>',
  xcircle:'<circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>',
  ban:'<circle cx="12" cy="12" r="10"/><path d="M5 5l14 14"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  minus:'<path d="M5 12h14"/>',
  x:'<path d="M18 6L6 18M6 6l12 12"/>',
  alert:'<path class="f" d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  pencil:'<path d="M12 20h9"/><path class="f" d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  calendar:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  search:'<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/>',
  pin:'<path d="M12 17v5"/><path class="f" d="M9 10.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2V17h14v-1.8a2 2 0 0 0-1.1-1.8l-1.8-.9a2 2 0 0 1-1.1-1.8V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
  mappin:'<path class="f" d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  home:'<path class="f" d="M3 11l9-8 9 8M5 10v11h5v-6h4v6h5V10"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path class="f" d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  sliders:'<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  wrench:'<path class="f" d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',
  nut:'<path class="f" d="M12 2l8.7 5v10L12 22l-8.7-5V7z"/><circle cx="12" cy="12" r="3"/>',
  car:'<path class="f" d="M5 17H3v-5l2-5h14l2 5v5h-2M3 12h18M9.5 17h5"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/>',
  save:'<path class="f" d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  link:'<path class="f" d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  bell:'<path class="f" d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',
  phone:'<path class="f" d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  tdown:'<path d="M12 18L4 7h16z" fill="currentColor"/>',
  tup:'<path d="M12 6l8 11H4z" fill="currentColor"/>',
  sparkles:'<path class="f" d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/>',
  share:'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  cart:'<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path class="f" d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
  basket:'<path class="f" d="M5 11l4-7M19 11l-4-7M2 11h20M4 11l2 9h12l2-9M10 15v2M14 15v2"/>',
  bulb:'<path class="f" d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/>',
  scale:'<path d="M12 3v18M5 21h14M3 7h18M6 7l-3 8a4 4 0 0 0 6 0zM18 7l-3 8a4 4 0 0 0 6 0z"/>',
  clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  hourglass:'<path class="f" d="M5 22h14M5 2h14M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4a2 2 0 0 0-.6 1.4V22M7 2v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-4.4a2 2 0 0 0 .6-1.4V2"/>',
  gem:'<path class="f" d="M6 3h12l4 6-10 13L2 9z"/><path d="M2 9h20M12 22L8 9l4-6 4 6z"/>',
  leaf:'<path class="f" d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z"/><path d="M2 21c0-3 1.9-5.5 6-7"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon:'<path class="f" d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  snow:'<path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19"/>',
  waves:'<path d="M2 7c2 0 2-2 5-2s3 2 5 2 3-2 5-2 3 2 5 2M2 13c2 0 2-2 5-2s3 2 5 2 3-2 5-2 3 2 5 2M2 19c2 0 2-2 5-2s3 2 5 2 3-2 5-2 3 2 5 2"/>',
  target:'<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  trophy:'<path class="f" d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.7V17M14 14.7V17M18 2H6v7a6 6 0 0 0 12 0z"/>',
  award:'<circle cx="12" cy="8" r="6"/><path d="M15.5 13.5L17 22l-5-3-5 3 1.5-8.5"/>',
  crown:'<path class="f" d="M2 20h20M3 7l5 5 4-7 4 7 5-5-2 13H5z"/>',
  flame:'<path class="f" d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-4 3-6 1 1 2 2 3 2 0-3-1-5 0-8z"/>',
  zap:'<path class="f" d="M13 2L3 14h9l-1 8 10-12h-9z"/>',
  rocket:'<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1z"/><path class="f" d="M12 15l-3-3a22 22 0 0 1 2-3.9A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2zM9 12H4s.6-3 2-4c1.6-1 5 0 5 0M12 15v5s3-.6 4-2c1-1.6 0-5 0-5"/>',
  utensils:'<path d="M3 2v7a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6a2 2 0 0 0 2 2h3zM21 15v7"/>',
  eye:'<path class="f" d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  flag:'<path class="f" d="M4 22V4M4 4h14l-3 4 3 4H4"/>',
  refresh:'<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>',
  undo:'<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  folder:'<path class="f" d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  printer:'<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  ruler:'<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
  compass:'<circle cx="12" cy="12" r="10"/><path d="M16.2 7.8l-2 6.4-6.4 2 2-6.4z"/>',
  pulse:'<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  mail:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 6L2 7"/>',
  lock:'<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  type:'<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
  square:'<rect x="3" y="3" width="18" height="18" rx="2"/>',
  pause:'<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>',
  hand:'<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 0 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-5.9-2.4L3.4 16a2 2 0 0 1 3.2-2.4L8 15"/>',
  dotR:'<circle cx="12" cy="12" r="6" fill="#ef4444" stroke="none"/>',
  dotY:'<circle cx="12" cy="12" r="6" fill="#f59e0b" stroke="none"/>',
  dotG:'<circle cx="12" cy="12" r="6" fill="#22c55e" stroke="none"/>',
  dotW:'<circle cx="12" cy="12" r="6" fill="#cbd5e1" stroke="none"/>',
  edit:'<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path class="f" d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  arrowL:'<path d="M19 12H5M12 19l-7-7 7-7"/>'
};
const PIC_GMAP = {};
(function(){
  const m=(n,s)=>{ for(const ch of Array.from(s.replace(/\s/g,''))) PIC_GMAP[ch]=n; };
  m('box','📦'); m('doc','📄📃📘📖📒📜'); m('receipt','🧾📋'); m('gift','🎁🎀'); m('wallet','💰');
  m('banknote','💵💸'); m('dollar','💲'); m('card','💳🏧'); m('bank','🏦🏛'); m('store','🏬🏪🕌');
  m('building','🏢🏭'); m('up','📈💹'); m('down','📉'); m('bars','📊'); m('pie','🍩🥧');
  m('tag','🏷🔖'); m('download','📥⬇'); m('upload','📤⬆'); m('user','🧑👤🙋🗣'); m('users','👥');
  m('briefcase','💼'); m('branch','🌳'); m('calc','🧮➗🔢'); m('truck','🚚🛵'); m('trash','🗑');
  m('check','✅👌👍'); m('xcircle','❌'); m('x','✖'); m('ban','🚫⛔'); m('plus','➕'); m('minus','➖');
  m('alert','⚠'); m('pencil','✏'); m('calendar','📅📆🗓'); m('search','🔍🔎'); m('pin','📌');
  m('mappin','📍'); m('home','🏠'); m('gear','⚙'); m('sliders','🎚'); m('wrench','🔧🛠');
  m('nut','🔩'); m('car','🚗'); m('save','💾'); m('link','🔗'); m('bell','🔔'); m('phone','📞');
  m('tdown','🔻'); m('tup','🔺'); m('sparkles','🆕🎉👋'); m('share','🕸'); m('cart','🛒'); m('basket','🧺');
  m('bulb','💡'); m('scale','⚖'); m('clock','⏱🕒🕓'); m('hourglass','⏳'); m('gem','💎🐋');
  m('leaf','🍂🍁🌿🌸🌴'); m('sun','☀🌤🌇'); m('moon','🌙😴'); m('snow','❄'); m('waves','🌊');
  m('target','🎯'); m('trophy','🏆'); m('award','🏅'); m('crown','👑'); m('flame','🔥'); m('zap','⚡💥🔌');
  m('rocket','🚀'); m('utensils','🍽'); m('eye','👁🕶'); m('flag','🏁🎌'); m('refresh','🔄🔁♻');
  m('undo','↩🔙'); m('folder','📂📁🗂'); m('image','🖼📷'); m('printer','🖨'); m('ruler','📐');
  m('compass','🧭'); m('pulse','🩺🧬🔬📡'); m('mail','📮'); m('lock','🔒'); m('type','🔤'); m('square','🔲');
  m('pause','⏸'); m('edit','📝'); m('users','🤝'); m('hourglass','🐢'); m('dotR','🔴'); m('dotY','🟡'); m('dotG','🟢'); m('dotW','⚪');
})();
let PIC_MODE='3d';
const PIC3_DEFS = "<radialGradient id=\"hl\" cx=\".5\" cy=\".5\" r=\".5\"><stop offset=\"0\" stop-color=\"#fff\" stop-opacity=\".9\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0\"/></radialGradient><radialGradient id=\"shd\" cx=\".5\" cy=\".5\" r=\".5\"><stop offset=\"0\" stop-color=\"#000\" stop-opacity=\".30\"/><stop offset=\".6\" stop-color=\"#000\" stop-opacity=\".12\"/><stop offset=\"1\" stop-color=\"#000\" stop-opacity=\"0\"/></radialGradient><linearGradient id=\"white\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\"1\" stop-color=\"#dfe7f7\"/></linearGradient><linearGradient id=\"paperEdge\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#d5dcf0\"/><stop offset=\"1\" stop-color=\"#aab6d8\"/></linearGradient><linearGradient id=\"cbT\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffe2b0\"/><stop offset=\"1\" stop-color=\"#f5b867\"/></linearGradient><linearGradient id=\"cbL\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#eaa245\"/><stop offset=\"1\" stop-color=\"#c2731d\"/></linearGradient><linearGradient id=\"cbR\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f6b85f\"/><stop offset=\"1\" stop-color=\"#d58727\"/></linearGradient><linearGradient id=\"tape\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff7e0\"/><stop offset=\"1\" stop-color=\"#f1d596\"/></linearGradient><linearGradient id=\"tapeL\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f6dfae\"/><stop offset=\"1\" stop-color=\"#d9b36a\"/></linearGradient><linearGradient id=\"rcpt\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\"1\" stop-color=\"#e3eafb\"/></linearGradient><linearGradient id=\"gBadge\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#6ee7a0\"/><stop offset=\"1\" stop-color=\"#16a34a\"/></linearGradient><linearGradient id=\"bBar\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#7aa7ff\"/><stop offset=\"1\" stop-color=\"#3b6ee0\"/></linearGradient><linearGradient id=\"oBar\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffc15a\"/><stop offset=\"1\" stop-color=\"#f07a1a\"/></linearGradient><linearGradient id=\"bag\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffe08a\"/><stop offset=\"0.55\" stop-color=\"#f2b13c\"/><stop offset=\"1\" stop-color=\"#c9791a\"/></linearGradient><linearGradient id=\"rope\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ff8a8a\"/><stop offset=\"1\" stop-color=\"#c92a3a\"/></linearGradient><linearGradient id=\"dollar\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff3c4\"/><stop offset=\"1\" stop-color=\"#f6c34a\"/></linearGradient><linearGradient id=\"gold\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff0a8\"/><stop offset=\"0.5\" stop-color=\"#f7c93a\"/><stop offset=\"1\" stop-color=\"#d99a10\"/></linearGradient><linearGradient id=\"goldSide\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#e8aa1c\"/><stop offset=\"1\" stop-color=\"#a8700a\"/></linearGradient><linearGradient id=\"tb\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#6db2ff\"/><stop offset=\"1\" stop-color=\"#1f63d6\"/></linearGradient><linearGradient id=\"tc\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffc766\"/><stop offset=\"1\" stop-color=\"#ee7616\"/></linearGradient><linearGradient id=\"tw\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#e8f6ff\"/><stop offset=\"1\" stop-color=\"#8cc7f2\"/></linearGradient><linearGradient id=\"wh\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#6b7280\"/><stop offset=\"1\" stop-color=\"#1f2430\"/></linearGradient><linearGradient id=\"hub\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f3f4f6\"/><stop offset=\"1\" stop-color=\"#9ca3af\"/></linearGradient><linearGradient id=\"gb\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ff7b98\"/><stop offset=\"1\" stop-color=\"#d11f4c\"/></linearGradient><linearGradient id=\"gl\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ff9db3\"/><stop offset=\"1\" stop-color=\"#e63a62\"/></linearGradient><linearGradient id=\"rib\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff0a0\"/><stop offset=\"1\" stop-color=\"#f2b020\"/></linearGradient><linearGradient id=\"cg\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#7cf0a4\"/><stop offset=\"1\" stop-color=\"#16a34a\"/></linearGradient><linearGradient id=\"or\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffcf6b\"/><stop offset=\"1\" stop-color=\"#f2711c\"/></linearGradient><linearGradient id=\"rd\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ff7a7a\"/><stop offset=\"1\" stop-color=\"#d12a3a\"/></linearGradient><linearGradient id=\"bl2\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#79b8ff\"/><stop offset=\"1\" stop-color=\"#2a64d9\"/></linearGradient><linearGradient id=\"cbody\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#5d6b82\"/><stop offset=\"1\" stop-color=\"#232b3b\"/></linearGradient><linearGradient id=\"scr\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#d4ffe1\"/><stop offset=\"1\" stop-color=\"#6fe3a1\"/></linearGradient><linearGradient id=\"k\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fdfdff\"/><stop offset=\"1\" stop-color=\"#cdd5e4\"/></linearGradient><linearGradient id=\"ko\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffbf5e\"/><stop offset=\"1\" stop-color=\"#f27a14\"/></linearGradient><linearGradient id=\"kg\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#7cf0a4\"/><stop offset=\"1\" stop-color=\"#14a04a\"/></linearGradient><linearGradient id=\"tg\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ff8fb0\"/><stop offset=\"1\" stop-color=\"#d6204f\"/></linearGradient><linearGradient id=\"gs\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#e9eef7\"/><stop offset=\"1\" stop-color=\"#8d99ae\"/></linearGradient><linearGradient id=\"go\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffc766\"/><stop offset=\"1\" stop-color=\"#e8690f\"/></linearGradient><linearGradient id=\"gHole\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#6b7487\"/><stop offset=\"1\" stop-color=\"#d9e0ee\"/></linearGradient><linearGradient id=\"tg1\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\"><stop offset=\"0\" stop-color=\"#fff3a6\"/><stop offset=\"0.5\" stop-color=\"#f7c52f\"/><stop offset=\"1\" stop-color=\"#d58f0b\"/></linearGradient><linearGradient id=\"base\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#8a5a3a\"/><stop offset=\"1\" stop-color=\"#4a2c18\"/></linearGradient><linearGradient id=\"plaq\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff3a6\"/><stop offset=\"1\" stop-color=\"#e8ab1c\"/></linearGradient><linearGradient id=\"cal\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\"1\" stop-color=\"#e3e9f6\"/></linearGradient><linearGradient id=\"calh\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ff7a7a\"/><stop offset=\"1\" stop-color=\"#d32f3f\"/></linearGradient><linearGradient id=\"ring\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#d6dbe7\"/><stop offset=\"1\" stop-color=\"#7e889c\"/></linearGradient><linearGradient id=\"b1\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\"><stop offset=\"0\" stop-color=\"#7bd0ff\"/><stop offset=\"1\" stop-color=\"#1b7fe0\"/></linearGradient><linearGradient id=\"b2\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\"><stop offset=\"0\" stop-color=\"#ffd166\"/><stop offset=\"1\" stop-color=\"#f07a1a\"/></linearGradient><linearGradient id=\"b3\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\"><stop offset=\"0\" stop-color=\"#7cf0a4\"/><stop offset=\"1\" stop-color=\"#16a34a\"/></linearGradient><linearGradient id=\"roof\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#7fd4ff\"/><stop offset=\"1\" stop-color=\"#1b86d9\"/></linearGradient><linearGradient id=\"col\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\"><stop offset=\"0\" stop-color=\"#fffdf6\"/><stop offset=\"1\" stop-color=\"#e6dcc4\"/></linearGradient><linearGradient id=\"step\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#d2d7e3\"/><stop offset=\"1\" stop-color=\"#9aa3b8\"/></linearGradient><linearGradient id=\"hr\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ff8a7a\"/><stop offset=\"1\" stop-color=\"#d1342f\"/></linearGradient><linearGradient id=\"hw\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff6e2\"/><stop offset=\"1\" stop-color=\"#f0d9a6\"/></linearGradient><linearGradient id=\"hd\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#a86a3a\"/><stop offset=\"1\" stop-color=\"#6b3c1c\"/></linearGradient><linearGradient id=\"hwin\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#bfe6ff\"/><stop offset=\"1\" stop-color=\"#5fb0f0\"/></linearGradient><linearGradient id=\"al\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff08a\"/><stop offset=\"1\" stop-color=\"#f5a60b\"/></linearGradient><linearGradient id=\"lens\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#e4f6ff\"/><stop offset=\"1\" stop-color=\"#7cc4f4\"/></linearGradient><linearGradient id=\"rim\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffd36b\"/><stop offset=\"1\" stop-color=\"#d98a12\"/></linearGradient><linearGradient id=\"hnd\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#9a6a46\"/><stop offset=\"1\" stop-color=\"#5a3820\"/></linearGradient><linearGradient id=\"skin\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffe0bd\"/><stop offset=\"1\" stop-color=\"#f0b27a\"/></linearGradient><linearGradient id=\"sh1\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#7aa7ff\"/><stop offset=\"1\" stop-color=\"#2f56c9\"/></linearGradient><linearGradient id=\"sh2\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#d49bff\"/><stop offset=\"1\" stop-color=\"#8a3fd1\"/></linearGradient><linearGradient id=\"hair\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#5a3a24\"/><stop offset=\"1\" stop-color=\"#2a170c\"/></linearGradient><linearGradient id=\"tr\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\"><stop offset=\"0\" stop-color=\"#9fb0cc\"/><stop offset=\"1\" stop-color=\"#5a6a88\"/></linearGradient><linearGradient id=\"trl\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ff8080\"/><stop offset=\"1\" stop-color=\"#d12a3a\"/></linearGradient><linearGradient id=\"cf\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\"1\" stop-color=\"#dbe5f7\"/></linearGradient><linearGradient id=\"cr\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#7bd0ff\"/><stop offset=\"1\" stop-color=\"#2a64d9\"/></linearGradient><linearGradient id=\"gf4e3c101\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#faf1e0\"/><stop offset=\".5\" stop-color=\"#f4e3c1\"/><stop offset=\"1\" stop-color=\"#ab9f87\"/></linearGradient><linearGradient id=\"ge5484d01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f2a4a6\"/><stop offset=\".5\" stop-color=\"#e5484d\"/><stop offset=\"1\" stop-color=\"#a03236\"/></linearGradient><linearGradient id=\"g9fd4ff01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#cfeaff\"/><stop offset=\".5\" stop-color=\"#9fd4ff\"/><stop offset=\"1\" stop-color=\"#6f94b2\"/></linearGradient><linearGradient id=\"g8a5a3a01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#c4ac9c\"/><stop offset=\".5\" stop-color=\"#8a5a3a\"/><stop offset=\"1\" stop-color=\"#613f29\"/></linearGradient><linearGradient id=\"gffd27a01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffe8bc\"/><stop offset=\".5\" stop-color=\"#ffd27a\"/><stop offset=\"1\" stop-color=\"#b29355\"/></linearGradient><linearGradient id=\"gfff3d601\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff9ea\"/><stop offset=\".5\" stop-color=\"#fff3d6\"/><stop offset=\"1\" stop-color=\"#b2aa96\"/></linearGradient><linearGradient id=\"g2dbd6e01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#96deb6\"/><stop offset=\".5\" stop-color=\"#2dbd6e\"/><stop offset=\"1\" stop-color=\"#20844d\"/></linearGradient><linearGradient id=\"g8fd0ff01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#c7e8ff\"/><stop offset=\".5\" stop-color=\"#8fd0ff\"/><stop offset=\"1\" stop-color=\"#6492b2\"/></linearGradient><linearGradient id=\"gff9f4301\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffcfa1\"/><stop offset=\".5\" stop-color=\"#ff9f43\"/><stop offset=\"1\" stop-color=\"#b26f2f\"/></linearGradient><linearGradient id=\"gfff01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".5\" stop-color=\"#fff\"/><stop offset=\"1\" stop-color=\"#b2b2b2\"/></linearGradient><linearGradient id=\"g7aa2e801\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#bcd0f4\"/><stop offset=\".5\" stop-color=\"#7aa2e8\"/><stop offset=\"1\" stop-color=\"#5571a2\"/></linearGradient><linearGradient id=\"g5b82cf01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#adc0e7\"/><stop offset=\".5\" stop-color=\"#5b82cf\"/><stop offset=\"1\" stop-color=\"#405b91\"/></linearGradient><linearGradient id=\"g3b4a6b01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#9da4b5\"/><stop offset=\".5\" stop-color=\"#3b4a6b\"/><stop offset=\"1\" stop-color=\"#29344b\"/></linearGradient><linearGradient id=\"gc2cad801\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#e0e4ec\"/><stop offset=\".5\" stop-color=\"#c2cad8\"/><stop offset=\"1\" stop-color=\"#888d97\"/></linearGradient><linearGradient id=\"ga8b2c401\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#d4d8e2\"/><stop offset=\".5\" stop-color=\"#a8b2c4\"/><stop offset=\"1\" stop-color=\"#767d89\"/></linearGradient><linearGradient id=\"gd95f3b01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ecaf9d\"/><stop offset=\".5\" stop-color=\"#d95f3b\"/><stop offset=\"1\" stop-color=\"#984229\"/></linearGradient><radialGradient id=\"re9edf5\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#f7f9fc\"/><stop offset=\".45\" stop-color=\"#e9edf5\"/><stop offset=\"1\" stop-color=\"#909398\"/></radialGradient><radialGradient id=\"rf5f7fb\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#fcfcfe\"/><stop offset=\".45\" stop-color=\"#f5f7fb\"/><stop offset=\"1\" stop-color=\"#98999c\"/></radialGradient><linearGradient id=\"g6b748701\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#b5bac3\"/><stop offset=\".5\" stop-color=\"#6b7487\"/><stop offset=\"1\" stop-color=\"#4b515e\"/></linearGradient><linearGradient id=\"gf1e2bd01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f8f0de\"/><stop offset=\".5\" stop-color=\"#f1e2bd\"/><stop offset=\"1\" stop-color=\"#a99e84\"/></linearGradient><linearGradient id=\"ge6d3a301\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f2e9d1\"/><stop offset=\".5\" stop-color=\"#e6d3a3\"/><stop offset=\"1\" stop-color=\"#a19472\"/></linearGradient><linearGradient id=\"gfff6df01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fffaef\"/><stop offset=\".5\" stop-color=\"#fff6df\"/><stop offset=\"1\" stop-color=\"#b2ac9c\"/></linearGradient><linearGradient id=\"gd9c28e01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ece0c6\"/><stop offset=\".5\" stop-color=\"#d9c28e\"/><stop offset=\"1\" stop-color=\"#988863\"/></linearGradient><linearGradient id=\"gc7ac7201\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#e3d6b8\"/><stop offset=\".5\" stop-color=\"#c7ac72\"/><stop offset=\"1\" stop-color=\"#8b7850\"/></linearGradient><radialGradient id=\"re0a526\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#f4e0b3\"/><stop offset=\".45\" stop-color=\"#e0a526\"/><stop offset=\"1\" stop-color=\"#8b6618\"/></radialGradient><linearGradient id=\"gf2e7cf01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f8f3e7\"/><stop offset=\".5\" stop-color=\"#f2e7cf\"/><stop offset=\"1\" stop-color=\"#a9a291\"/></linearGradient><linearGradient id=\"g1fb6a601\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#8fdad2\"/><stop offset=\".5\" stop-color=\"#1fb6a6\"/><stop offset=\"1\" stop-color=\"#167f74\"/></linearGradient><radialGradient id=\"rf4c542\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#fbebbd\"/><stop offset=\".45\" stop-color=\"#f4c542\"/><stop offset=\"1\" stop-color=\"#977a29\"/></radialGradient><linearGradient id=\"gf7efdc01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fbf7ee\"/><stop offset=\".5\" stop-color=\"#f7efdc\"/><stop offset=\"1\" stop-color=\"#ada79a\"/></linearGradient><linearGradient id=\"g3b6ea801\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#9db6d4\"/><stop offset=\".5\" stop-color=\"#3b6ea8\"/><stop offset=\"1\" stop-color=\"#294d76\"/></linearGradient><linearGradient id=\"g7fc1ff01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#bfe0ff\"/><stop offset=\".5\" stop-color=\"#7fc1ff\"/><stop offset=\"1\" stop-color=\"#5987b2\"/></linearGradient><linearGradient id=\"g4ecb7a01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#a6e5bc\"/><stop offset=\".5\" stop-color=\"#4ecb7a\"/><stop offset=\"1\" stop-color=\"#378e55\"/></linearGradient><radialGradient id=\"r2e9e56\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#b6ddc4\"/><stop offset=\".45\" stop-color=\"#2e9e56\"/><stop offset=\"1\" stop-color=\"#1d6235\"/></radialGradient><linearGradient id=\"gffffff01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".5\" stop-color=\"#ffffff\"/><stop offset=\"1\" stop-color=\"#b2b2b2\"/></linearGradient><radialGradient id=\"r2fbf6b\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#b6e9cb\"/><stop offset=\".45\" stop-color=\"#2fbf6b\"/><stop offset=\"1\" stop-color=\"#1d7642\"/></radialGradient><linearGradient id=\"g4f7cff01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#a7beff\"/><stop offset=\".5\" stop-color=\"#4f7cff\"/><stop offset=\"1\" stop-color=\"#3757b2\"/></linearGradient><linearGradient id=\"gffd96a01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffecb4\"/><stop offset=\".5\" stop-color=\"#ffd96a\"/><stop offset=\"1\" stop-color=\"#b2984a\"/></linearGradient><linearGradient id=\"g3b82f601\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#9dc0fa\"/><stop offset=\".5\" stop-color=\"#3b82f6\"/><stop offset=\"1\" stop-color=\"#295bac\"/></linearGradient><linearGradient id=\"gbfe9ff01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#dff4ff\"/><stop offset=\".5\" stop-color=\"#bfe9ff\"/><stop offset=\"1\" stop-color=\"#86a3b2\"/></linearGradient><linearGradient id=\"g1e3a8a01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#8e9cc4\"/><stop offset=\".5\" stop-color=\"#1e3a8a\"/><stop offset=\"1\" stop-color=\"#152961\"/></linearGradient><linearGradient id=\"g5ad4ff01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#aceaff\"/><stop offset=\".5\" stop-color=\"#5ad4ff\"/><stop offset=\"1\" stop-color=\"#3f94b2\"/></linearGradient><linearGradient id=\"g2aa0e001\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#94d0f0\"/><stop offset=\".5\" stop-color=\"#2aa0e0\"/><stop offset=\"1\" stop-color=\"#1d709d\"/></linearGradient><linearGradient id=\"g9be8ff01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#cdf4ff\"/><stop offset=\".5\" stop-color=\"#9be8ff\"/><stop offset=\"1\" stop-color=\"#6ca2b2\"/></linearGradient><linearGradient id=\"gc9f4ff01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#e4faff\"/><stop offset=\".5\" stop-color=\"#c9f4ff\"/><stop offset=\"1\" stop-color=\"#8dabb2\"/></linearGradient><linearGradient id=\"g4cc2f201\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#a6e0f8\"/><stop offset=\".5\" stop-color=\"#4cc2f2\"/><stop offset=\"1\" stop-color=\"#3588a9\"/></linearGradient><linearGradient id=\"gc9d6f501\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#e4eafa\"/><stop offset=\".5\" stop-color=\"#c9d6f5\"/><stop offset=\"1\" stop-color=\"#8d96ac\"/></linearGradient><linearGradient id=\"gcfd8ef01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#e7ecf7\"/><stop offset=\".5\" stop-color=\"#cfd8ef\"/><stop offset=\"1\" stop-color=\"#9197a7\"/></linearGradient><linearGradient id=\"gc58a5201\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#e2c4a8\"/><stop offset=\".5\" stop-color=\"#c58a52\"/><stop offset=\"1\" stop-color=\"#8a6139\"/></linearGradient><linearGradient id=\"gfffdf501\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fffefa\"/><stop offset=\".5\" stop-color=\"#fffdf5\"/><stop offset=\"1\" stop-color=\"#b2b1ac\"/></linearGradient><linearGradient id=\"g8d98ad01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#c6ccd6\"/><stop offset=\".5\" stop-color=\"#8d98ad\"/><stop offset=\"1\" stop-color=\"#636a79\"/></linearGradient><radialGradient id=\"re5e9f2\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#f6f7fa\"/><stop offset=\".45\" stop-color=\"#e5e9f2\"/><stop offset=\"1\" stop-color=\"#8e9096\"/></radialGradient><linearGradient id=\"gfff9d601\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fffcea\"/><stop offset=\".5\" stop-color=\"#fff9d6\"/><stop offset=\"1\" stop-color=\"#b2ae96\"/></linearGradient><linearGradient id=\"g4f8cff01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#a7c6ff\"/><stop offset=\".5\" stop-color=\"#4f8cff\"/><stop offset=\"1\" stop-color=\"#3762b2\"/></linearGradient><linearGradient id=\"gf5d3a101\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fae9d0\"/><stop offset=\".5\" stop-color=\"#f5d3a1\"/><stop offset=\"1\" stop-color=\"#ac9471\"/></linearGradient><linearGradient id=\"g3a2a1a01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#9c948c\"/><stop offset=\".5\" stop-color=\"#3a2a1a\"/><stop offset=\"1\" stop-color=\"#291d12\"/></linearGradient><linearGradient id=\"gff7a7a01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffbcbc\"/><stop offset=\".5\" stop-color=\"#ff7a7a\"/><stop offset=\"1\" stop-color=\"#b25555\"/></linearGradient><linearGradient id=\"gf3b43c01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f9da9e\"/><stop offset=\".5\" stop-color=\"#f3b43c\"/><stop offset=\"1\" stop-color=\"#aa7e2a\"/></linearGradient><linearGradient id=\"gc9841001\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#e4c288\"/><stop offset=\".5\" stop-color=\"#c98410\"/><stop offset=\"1\" stop-color=\"#8d5c0b\"/></linearGradient><linearGradient id=\"gfff8e101\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fffcf0\"/><stop offset=\".5\" stop-color=\"#fff8e1\"/><stop offset=\"1\" stop-color=\"#b2ae9e\"/></linearGradient><linearGradient id=\"g3f7df001\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#9fbef8\"/><stop offset=\".5\" stop-color=\"#3f7df0\"/><stop offset=\"1\" stop-color=\"#2c58a8\"/></linearGradient><linearGradient id=\"g2859c401\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#94ace2\"/><stop offset=\".5\" stop-color=\"#2859c4\"/><stop offset=\"1\" stop-color=\"#1c3e89\"/></linearGradient><linearGradient id=\"gf8f6ee01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fcfaf6\"/><stop offset=\".5\" stop-color=\"#f8f6ee\"/><stop offset=\"1\" stop-color=\"#aeaca7\"/></linearGradient><linearGradient id=\"gbcd5ff01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#deeaff\"/><stop offset=\".5\" stop-color=\"#bcd5ff\"/><stop offset=\"1\" stop-color=\"#8495b2\"/></linearGradient><radialGradient id=\"rffd24c\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#ffefc0\"/><stop offset=\".45\" stop-color=\"#ffd24c\"/><stop offset=\"1\" stop-color=\"#9e822f\"/></radialGradient><linearGradient id=\"gfffdf601\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fffefa\"/><stop offset=\".5\" stop-color=\"#fffdf6\"/><stop offset=\"1\" stop-color=\"#b2b1ac\"/></linearGradient><linearGradient id=\"g2f8cf001\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#97c6f8\"/><stop offset=\".5\" stop-color=\"#2f8cf0\"/><stop offset=\"1\" stop-color=\"#2162a8\"/></linearGradient><linearGradient id=\"ge8cd9401\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4e6ca\"/><stop offset=\".5\" stop-color=\"#e8cd94\"/><stop offset=\"1\" stop-color=\"#a29068\"/></linearGradient><linearGradient id=\"gff5a6e01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffacb6\"/><stop offset=\".5\" stop-color=\"#ff5a6e\"/><stop offset=\"1\" stop-color=\"#b23f4d\"/></linearGradient><radialGradient id=\"rffe27a\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#fff5d0\"/><stop offset=\".45\" stop-color=\"#ffe27a\"/><stop offset=\"1\" stop-color=\"#9e8c4c\"/></radialGradient><linearGradient id=\"gff6a3d01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffb49e\"/><stop offset=\".5\" stop-color=\"#ff6a3d\"/><stop offset=\"1\" stop-color=\"#b24a2b\"/></linearGradient><radialGradient id=\"rff9d3d\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#ffddbb\"/><stop offset=\".45\" stop-color=\"#ff9d3d\"/><stop offset=\"1\" stop-color=\"#9e6126\"/></radialGradient><linearGradient id=\"g6a5af901\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#b4acfc\"/><stop offset=\".5\" stop-color=\"#6a5af9\"/><stop offset=\"1\" stop-color=\"#4a3fae\"/></linearGradient><linearGradient id=\"ga8683a01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#d4b49c\"/><stop offset=\".5\" stop-color=\"#a8683a\"/><stop offset=\"1\" stop-color=\"#764929\"/></linearGradient><linearGradient id=\"gf6e2b801\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#faf0dc\"/><stop offset=\".5\" stop-color=\"#f6e2b8\"/><stop offset=\"1\" stop-color=\"#ac9e81\"/></linearGradient><radialGradient id=\"re5484d\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#f6bfc1\"/><stop offset=\".45\" stop-color=\"#e5484d\"/><stop offset=\"1\" stop-color=\"#8e2d30\"/></radialGradient><radialGradient id=\"r3b82f6\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#bad3fc\"/><stop offset=\".45\" stop-color=\"#3b82f6\"/><stop offset=\"1\" stop-color=\"#255199\"/></radialGradient><radialGradient id=\"r22b45f\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#b2e5c7\"/><stop offset=\".45\" stop-color=\"#22b45f\"/><stop offset=\"1\" stop-color=\"#15703b\"/></radialGradient><radialGradient id=\"rf5b928\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#fce6b4\"/><stop offset=\".45\" stop-color=\"#f5b928\"/><stop offset=\"1\" stop-color=\"#987319\"/></radialGradient><radialGradient id=\"rfff\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".45\" stop-color=\"#fff\"/><stop offset=\"1\" stop-color=\"#9e9e9e\"/></radialGradient><linearGradient id=\"g22b45f01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#90daaf\"/><stop offset=\".5\" stop-color=\"#22b45f\"/><stop offset=\"1\" stop-color=\"#187e42\"/></linearGradient><linearGradient id=\"gf5a62301\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fad291\"/><stop offset=\".5\" stop-color=\"#f5a623\"/><stop offset=\"1\" stop-color=\"#ac7418\"/></linearGradient><linearGradient id=\"gef444401\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f7a2a2\"/><stop offset=\".5\" stop-color=\"#ef4444\"/><stop offset=\"1\" stop-color=\"#a73030\"/></linearGradient><linearGradient id=\"g17324d01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#8b98a6\"/><stop offset=\".5\" stop-color=\"#17324d\"/><stop offset=\"1\" stop-color=\"#102336\"/></linearGradient><linearGradient id=\"g3be08a01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#9df0c4\"/><stop offset=\".5\" stop-color=\"#3be08a\"/><stop offset=\"1\" stop-color=\"#299d61\"/></linearGradient><radialGradient id=\"ref4444\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#f9bebe\"/><stop offset=\".45\" stop-color=\"#ef4444\"/><stop offset=\"1\" stop-color=\"#942a2a\"/></radialGradient><radialGradient id=\"re0262d\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#f4b3b6\"/><stop offset=\".45\" stop-color=\"#e0262d\"/><stop offset=\"1\" stop-color=\"#8b181c\"/></radialGradient><linearGradient id=\"gf5883b01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fac49d\"/><stop offset=\".5\" stop-color=\"#f5883b\"/><stop offset=\"1\" stop-color=\"#ac5f29\"/></linearGradient><linearGradient id=\"g8fb4f501\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#c7dafa\"/><stop offset=\".5\" stop-color=\"#8fb4f5\"/><stop offset=\"1\" stop-color=\"#647eac\"/></linearGradient><linearGradient id=\"g5e8fe801\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#aec7f4\"/><stop offset=\".5\" stop-color=\"#5e8fe8\"/><stop offset=\"1\" stop-color=\"#4264a2\"/></linearGradient><radialGradient id=\"r2fb344\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#b6e4be\"/><stop offset=\".45\" stop-color=\"#2fb344\"/><stop offset=\"1\" stop-color=\"#1d6f2a\"/></radialGradient><linearGradient id=\"g8b5cf601\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#c5aefa\"/><stop offset=\".5\" stop-color=\"#8b5cf6\"/><stop offset=\"1\" stop-color=\"#6140ac\"/></linearGradient><radialGradient id=\"rf59e0b\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#fcddaa\"/><stop offset=\".45\" stop-color=\"#f59e0b\"/><stop offset=\"1\" stop-color=\"#986207\"/></radialGradient><linearGradient id=\"g1f293701\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#8f949b\"/><stop offset=\".5\" stop-color=\"#1f2937\"/><stop offset=\"1\" stop-color=\"#161d26\"/></linearGradient><linearGradient id=\"g4b556301\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#a5aab1\"/><stop offset=\".5\" stop-color=\"#4b5563\"/><stop offset=\"1\" stop-color=\"#343c45\"/></linearGradient><radialGradient id=\"ree3b3b\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#f9baba\"/><stop offset=\".45\" stop-color=\"#ee3b3b\"/><stop offset=\"1\" stop-color=\"#942525\"/></radialGradient><radialGradient id=\"rf7c52b\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#fcebb5\"/><stop offset=\".45\" stop-color=\"#f7c52b\"/><stop offset=\"1\" stop-color=\"#997a1b\"/></radialGradient><radialGradient id=\"r2fc464\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#b6eac9\"/><stop offset=\".45\" stop-color=\"#2fc464\"/><stop offset=\"1\" stop-color=\"#1d7a3e\"/></radialGradient><linearGradient id=\"gee3b3b01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f69d9d\"/><stop offset=\".5\" stop-color=\"#ee3b3b\"/><stop offset=\"1\" stop-color=\"#a72929\"/></linearGradient><linearGradient id=\"gcdd3df01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#e6e9ef\"/><stop offset=\".5\" stop-color=\"#cdd3df\"/><stop offset=\"1\" stop-color=\"#90949c\"/></linearGradient><linearGradient id=\"g8b93a501\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#c5c9d2\"/><stop offset=\".5\" stop-color=\"#8b93a5\"/><stop offset=\"1\" stop-color=\"#616774\"/></linearGradient><radialGradient id=\"rff8a8a\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#ffd6d6\"/><stop offset=\".45\" stop-color=\"#ff8a8a\"/><stop offset=\"1\" stop-color=\"#9e5656\"/></radialGradient><linearGradient id=\"gcfe2ff01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#e7f0ff\"/><stop offset=\".5\" stop-color=\"#cfe2ff\"/><stop offset=\"1\" stop-color=\"#919eb2\"/></linearGradient><linearGradient id=\"gd4ffe201\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#eafff0\"/><stop offset=\".5\" stop-color=\"#d4ffe2\"/><stop offset=\"1\" stop-color=\"#94b29e\"/></linearGradient><linearGradient id=\"gf7b92801\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fbdc94\"/><stop offset=\".5\" stop-color=\"#f7b928\"/><stop offset=\"1\" stop-color=\"#ad821c\"/></linearGradient><radialGradient id=\"rd9890c\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#f2d6aa\"/><stop offset=\".45\" stop-color=\"#d9890c\"/><stop offset=\"1\" stop-color=\"#875507\"/></radialGradient><radialGradient id=\"rf7b928\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#fce6b4\"/><stop offset=\".45\" stop-color=\"#f7b928\"/><stop offset=\"1\" stop-color=\"#997319\"/></radialGradient><linearGradient id=\"g2fc46401\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#97e2b2\"/><stop offset=\".5\" stop-color=\"#2fc464\"/><stop offset=\"1\" stop-color=\"#218946\"/></linearGradient><linearGradient id=\"g37415101\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#9ba0a8\"/><stop offset=\".5\" stop-color=\"#374151\"/><stop offset=\"1\" stop-color=\"#262e39\"/></linearGradient><linearGradient id=\"gf6b21b01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fad88d\"/><stop offset=\".5\" stop-color=\"#f6b21b\"/><stop offset=\"1\" stop-color=\"#ac7d13\"/></linearGradient><radialGradient id=\"r7a4a05\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#d0c0a8\"/><stop offset=\".45\" stop-color=\"#7a4a05\"/><stop offset=\"1\" stop-color=\"#4c2e03\"/></radialGradient><linearGradient id=\"gc2c9d601\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#e0e4ea\"/><stop offset=\".5\" stop-color=\"#c2c9d6\"/><stop offset=\"1\" stop-color=\"#888d96\"/></linearGradient><linearGradient id=\"g2f6fd901\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#97b7ec\"/><stop offset=\".5\" stop-color=\"#2f6fd9\"/><stop offset=\"1\" stop-color=\"#214e98\"/></linearGradient><linearGradient id=\"gf7c52b01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fbe295\"/><stop offset=\".5\" stop-color=\"#f7c52b\"/><stop offset=\"1\" stop-color=\"#ad8a1e\"/></linearGradient><linearGradient id=\"gff8a1f01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffc48f\"/><stop offset=\".5\" stop-color=\"#ff8a1f\"/><stop offset=\"1\" stop-color=\"#b26116\"/></linearGradient><linearGradient id=\"gffd43b01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffea9d\"/><stop offset=\".5\" stop-color=\"#ffd43b\"/><stop offset=\"1\" stop-color=\"#b29429\"/></linearGradient><linearGradient id=\"gff6a1f01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffb48f\"/><stop offset=\".5\" stop-color=\"#ff6a1f\"/><stop offset=\"1\" stop-color=\"#b24a16\"/></linearGradient><linearGradient id=\"gfff4b801\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fffadc\"/><stop offset=\".5\" stop-color=\"#fff4b8\"/><stop offset=\"1\" stop-color=\"#b2ab81\"/></linearGradient><linearGradient id=\"g9aa3b501\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ccd1da\"/><stop offset=\".5\" stop-color=\"#9aa3b5\"/><stop offset=\"1\" stop-color=\"#6c727f\"/></linearGradient><linearGradient id=\"g8a93a801\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#c4c9d4\"/><stop offset=\".5\" stop-color=\"#8a93a8\"/><stop offset=\"1\" stop-color=\"#616776\"/></linearGradient><linearGradient id=\"gff9a1f01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffcc8f\"/><stop offset=\".5\" stop-color=\"#ff9a1f\"/><stop offset=\"1\" stop-color=\"#b26c16\"/></linearGradient><linearGradient id=\"gffe27a01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff0bc\"/><stop offset=\".5\" stop-color=\"#ffe27a\"/><stop offset=\"1\" stop-color=\"#b29e55\"/></linearGradient><linearGradient id=\"g9aa6ba01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ccd2dc\"/><stop offset=\".5\" stop-color=\"#9aa6ba\"/><stop offset=\"1\" stop-color=\"#6c7482\"/></linearGradient><linearGradient id=\"gb9c3d601\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#dce1ea\"/><stop offset=\".5\" stop-color=\"#b9c3d6\"/><stop offset=\"1\" stop-color=\"#828896\"/></linearGradient><linearGradient id=\"gc5cddd01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#e2e6ee\"/><stop offset=\".5\" stop-color=\"#c5cddd\"/><stop offset=\"1\" stop-color=\"#8a909b\"/></linearGradient><radialGradient id=\"r667089\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#c9cdd6\"/><stop offset=\".45\" stop-color=\"#667089\"/><stop offset=\"1\" stop-color=\"#3f4555\"/></radialGradient><linearGradient id=\"g7cf0b001\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#bef8d8\"/><stop offset=\".5\" stop-color=\"#7cf0b0\"/><stop offset=\"1\" stop-color=\"#57a87b\"/></linearGradient><linearGradient id=\"gff9db001\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffced8\"/><stop offset=\".5\" stop-color=\"#ff9db0\"/><stop offset=\"1\" stop-color=\"#b26e7b\"/></linearGradient><linearGradient id=\"g8fe0ff01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#c7f0ff\"/><stop offset=\".5\" stop-color=\"#8fe0ff\"/><stop offset=\"1\" stop-color=\"#649db2\"/></linearGradient><linearGradient id=\"g8fa0bd01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#c7d0de\"/><stop offset=\".5\" stop-color=\"#8fa0bd\"/><stop offset=\"1\" stop-color=\"#647084\"/></linearGradient><radialGradient id=\"raebbd3\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#e3e7f0\"/><stop offset=\".45\" stop-color=\"#aebbd3\"/><stop offset=\"1\" stop-color=\"#6c7483\"/></radialGradient><radialGradient id=\"r4b5563\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#c0c4c8\"/><stop offset=\".45\" stop-color=\"#4b5563\"/><stop offset=\"1\" stop-color=\"#2e353d\"/></radialGradient><linearGradient id=\"gd4efff01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#eaf7ff\"/><stop offset=\".5\" stop-color=\"#d4efff\"/><stop offset=\"1\" stop-color=\"#94a7b2\"/></linearGradient><radialGradient id=\"r2b3342\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#b5b8bd\"/><stop offset=\".45\" stop-color=\"#2b3342\"/><stop offset=\"1\" stop-color=\"#1b2029\"/></radialGradient><radialGradient id=\"rd1d5db\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#eff0f2\"/><stop offset=\".45\" stop-color=\"#d1d5db\"/><stop offset=\"1\" stop-color=\"#828488\"/></radialGradient><linearGradient id=\"gff9a9a01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffcccc\"/><stop offset=\".5\" stop-color=\"#ff9a9a\"/><stop offset=\"1\" stop-color=\"#b26c6c\"/></linearGradient><linearGradient id=\"g14b8a601\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#8adcd2\"/><stop offset=\".5\" stop-color=\"#14b8a6\"/><stop offset=\"1\" stop-color=\"#0e8174\"/></linearGradient><linearGradient id=\"gfbfcff01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fdfeff\"/><stop offset=\".5\" stop-color=\"#fbfcff\"/><stop offset=\"1\" stop-color=\"#b0b0b2\"/></linearGradient><radialGradient id=\"r3be08a\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#baf4d6\"/><stop offset=\".45\" stop-color=\"#3be08a\"/><stop offset=\"1\" stop-color=\"#258b56\"/></radialGradient><linearGradient id=\"g5b657701\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#adb2bb\"/><stop offset=\".5\" stop-color=\"#5b6577\"/><stop offset=\"1\" stop-color=\"#404753\"/></linearGradient><radialGradient id=\"r1e3a8a\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#b0bad6\"/><stop offset=\".45\" stop-color=\"#1e3a8a\"/><stop offset=\"1\" stop-color=\"#132456\"/></radialGradient><linearGradient id=\"gbfe6ff01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#dff2ff\"/><stop offset=\".5\" stop-color=\"#bfe6ff\"/><stop offset=\"1\" stop-color=\"#86a1b2\"/></linearGradient><linearGradient id=\"g34b36a01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#9ad9b4\"/><stop offset=\".5\" stop-color=\"#34b36a\"/><stop offset=\"1\" stop-color=\"#247d4a\"/></linearGradient><linearGradient id=\"g2a9a5801\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#94ccac\"/><stop offset=\".5\" stop-color=\"#2a9a58\"/><stop offset=\"1\" stop-color=\"#1d6c3e\"/></linearGradient><linearGradient id=\"gffd24c01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffe8a6\"/><stop offset=\".5\" stop-color=\"#ffd24c\"/><stop offset=\"1\" stop-color=\"#b29335\"/></linearGradient><linearGradient id=\"gfff6d001\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fffae8\"/><stop offset=\".5\" stop-color=\"#fff6d0\"/><stop offset=\"1\" stop-color=\"#b2ac92\"/></linearGradient><radialGradient id=\"r6b7487\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#cbced5\"/><stop offset=\".45\" stop-color=\"#6b7487\"/><stop offset=\"1\" stop-color=\"#424854\"/></radialGradient><linearGradient id=\"gc9a15a01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#e4d0ac\"/><stop offset=\".5\" stop-color=\"#c9a15a\"/><stop offset=\"1\" stop-color=\"#8d713f\"/></linearGradient><linearGradient id=\"gf5b92801\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fadc94\"/><stop offset=\".5\" stop-color=\"#f5b928\"/><stop offset=\"1\" stop-color=\"#ac821c\"/></linearGradient><radialGradient id=\"r2b3a67\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#b5baca\"/><stop offset=\".45\" stop-color=\"#2b3a67\"/><stop offset=\"1\" stop-color=\"#1b2440\"/></radialGradient><linearGradient id=\"ge6f7ff01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f2fbff\"/><stop offset=\".5\" stop-color=\"#e6f7ff\"/><stop offset=\"1\" stop-color=\"#a1adb2\"/></linearGradient><radialGradient id=\"r14b8a6\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#ade6e0\"/><stop offset=\".45\" stop-color=\"#14b8a6\"/><stop offset=\"1\" stop-color=\"#0c7267\"/></radialGradient><linearGradient id=\"ge5e9f201\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f2f4f8\"/><stop offset=\".5\" stop-color=\"#e5e9f2\"/><stop offset=\"1\" stop-color=\"#a0a3a9\"/></linearGradient><linearGradient id=\"ge8eefc01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4f6fe\"/><stop offset=\".5\" stop-color=\"#e8eefc\"/><stop offset=\"1\" stop-color=\"#a2a7b0\"/></linearGradient><linearGradient id=\"gffcd6b01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffe6b5\"/><stop offset=\".5\" stop-color=\"#ffcd6b\"/><stop offset=\"1\" stop-color=\"#b2904b\"/></linearGradient><linearGradient id=\"gffc94d01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffe4a6\"/><stop offset=\".5\" stop-color=\"#ffc94d\"/><stop offset=\"1\" stop-color=\"#b28d36\"/></linearGradient><linearGradient id=\"gffcd5e01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffe6ae\"/><stop offset=\".5\" stop-color=\"#ffcd5e\"/><stop offset=\"1\" stop-color=\"#b29042\"/></linearGradient><linearGradient id=\"g7a1b1b01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#bc8d8d\"/><stop offset=\".5\" stop-color=\"#7a1b1b\"/><stop offset=\"1\" stop-color=\"#551313\"/></linearGradient><linearGradient id=\"gc42a2a01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#e29494\"/><stop offset=\".5\" stop-color=\"#c42a2a\"/><stop offset=\"1\" stop-color=\"#891d1d\"/></linearGradient><radialGradient id=\"rbfe6ff\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#e9f6ff\"/><stop offset=\".45\" stop-color=\"#bfe6ff\"/><stop offset=\"1\" stop-color=\"#768f9e\"/></radialGradient><radialGradient id=\"r374151\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#b9bcc2\"/><stop offset=\".45\" stop-color=\"#374151\"/><stop offset=\"1\" stop-color=\"#222832\"/></radialGradient><linearGradient id=\"gd9953a01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ecca9c\"/><stop offset=\".5\" stop-color=\"#d9953a\"/><stop offset=\"1\" stop-color=\"#986829\"/></linearGradient><radialGradient id=\"re8edf7\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#f7f9fc\"/><stop offset=\".45\" stop-color=\"#e8edf7\"/><stop offset=\"1\" stop-color=\"#909399\"/></radialGradient><radialGradient id=\"rffffff\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".45\" stop-color=\"#ffffff\"/><stop offset=\"1\" stop-color=\"#9e9e9e\"/></radialGradient><radialGradient id=\"rf1f4fb\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#fafbfe\"/><stop offset=\".45\" stop-color=\"#f1f4fb\"/><stop offset=\"1\" stop-color=\"#95979c\"/></radialGradient><radialGradient id=\"r111827\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#acaeb3\"/><stop offset=\".45\" stop-color=\"#111827\"/><stop offset=\"1\" stop-color=\"#0b0f18\"/></radialGradient><linearGradient id=\"g3b5bdb01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#9daded\"/><stop offset=\".5\" stop-color=\"#3b5bdb\"/><stop offset=\"1\" stop-color=\"#294099\"/></linearGradient><radialGradient id=\"rffcf70\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#ffeecd\"/><stop offset=\".45\" stop-color=\"#ffcf70\"/><stop offset=\"1\" stop-color=\"#9e8045\"/></radialGradient><linearGradient id=\"g5a3a2401\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ac9c92\"/><stop offset=\".5\" stop-color=\"#5a3a24\"/><stop offset=\"1\" stop-color=\"#3f2919\"/></linearGradient><linearGradient id=\"g8a4b1f01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#c4a58f\"/><stop offset=\".5\" stop-color=\"#8a4b1f\"/><stop offset=\"1\" stop-color=\"#613416\"/></linearGradient><radialGradient id=\"r8da2c0\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#d7dee9\"/><stop offset=\".45\" stop-color=\"#8da2c0\"/><stop offset=\"1\" stop-color=\"#576477\"/></radialGradient><linearGradient id=\"g8da2c001\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#c6d0e0\"/><stop offset=\".5\" stop-color=\"#8da2c0\"/><stop offset=\"1\" stop-color=\"#637186\"/></linearGradient><linearGradient id=\"gffcf7001\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffe7b8\"/><stop offset=\".5\" stop-color=\"#ffcf70\"/><stop offset=\"1\" stop-color=\"#b2914e\"/></linearGradient><linearGradient id=\"gd89a1001\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#eccc88\"/><stop offset=\".5\" stop-color=\"#d89a10\"/><stop offset=\"1\" stop-color=\"#976c0b\"/></linearGradient><linearGradient id=\"ge89a1001\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4cc88\"/><stop offset=\".5\" stop-color=\"#e89a10\"/><stop offset=\"1\" stop-color=\"#a26c0b\"/></linearGradient><radialGradient id=\"rff4d8d\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#ffc1d7\"/><stop offset=\".45\" stop-color=\"#ff4d8d\"/><stop offset=\"1\" stop-color=\"#9e3057\"/></radialGradient><linearGradient id=\"gff5d9301\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffaec9\"/><stop offset=\".5\" stop-color=\"#ff5d93\"/><stop offset=\"1\" stop-color=\"#b24167\"/></linearGradient><linearGradient id=\"ge63c7801\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f29ebc\"/><stop offset=\".5\" stop-color=\"#e63c78\"/><stop offset=\"1\" stop-color=\"#a12a54\"/></linearGradient><radialGradient id=\"rff7fae\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#ffd2e3\"/><stop offset=\".45\" stop-color=\"#ff7fae\"/><stop offset=\"1\" stop-color=\"#9e4f6c\"/></radialGradient><linearGradient id=\"g9a6a3a01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ccb49c\"/><stop offset=\".5\" stop-color=\"#9a6a3a\"/><stop offset=\"1\" stop-color=\"#6c4a29\"/></linearGradient><radialGradient id=\"r27a03a\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#b3deba\"/><stop offset=\".45\" stop-color=\"#27a03a\"/><stop offset=\"1\" stop-color=\"#186324\"/></radialGradient><radialGradient id=\"r4cd066\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#c0efc9\"/><stop offset=\".45\" stop-color=\"#4cd066\"/><stop offset=\"1\" stop-color=\"#2f813f\"/></radialGradient><radialGradient id=\"r8bf0a0\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#d6fade\"/><stop offset=\".45\" stop-color=\"#8bf0a0\"/><stop offset=\"1\" stop-color=\"#569563\"/></radialGradient><linearGradient id=\"g3cc65601\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#9ee2aa\"/><stop offset=\".5\" stop-color=\"#3cc656\"/><stop offset=\"1\" stop-color=\"#2a8b3c\"/></linearGradient><linearGradient id=\"g2fb34401\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#97d9a2\"/><stop offset=\".5\" stop-color=\"#2fb344\"/><stop offset=\"1\" stop-color=\"#217d30\"/></linearGradient><linearGradient id=\"ge8761a01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4ba8c\"/><stop offset=\".5\" stop-color=\"#e8761a\"/><stop offset=\"1\" stop-color=\"#a25312\"/></linearGradient><linearGradient id=\"gff8fbb01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffc7dd\"/><stop offset=\".5\" stop-color=\"#ff8fbb\"/><stop offset=\"1\" stop-color=\"#b26483\"/></linearGradient><radialGradient id=\"rfff4b8\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#fffbe6\"/><stop offset=\".45\" stop-color=\"#fff4b8\"/><stop offset=\"1\" stop-color=\"#9e9772\"/></radialGradient><linearGradient id=\"ga8743a01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#d4ba9c\"/><stop offset=\".5\" stop-color=\"#a8743a\"/><stop offset=\"1\" stop-color=\"#765129\"/></linearGradient><radialGradient id=\"r8a5a2b\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#d6c5b5\"/><stop offset=\".45\" stop-color=\"#8a5a2b\"/><stop offset=\"1\" stop-color=\"#56381b\"/></radialGradient><radialGradient id=\"re6f7ff\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#f6fcff\"/><stop offset=\".45\" stop-color=\"#e6f7ff\"/><stop offset=\"1\" stop-color=\"#8f999e\"/></radialGradient><radialGradient id=\"rffcb2b\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#ffedb5\"/><stop offset=\".45\" stop-color=\"#ffcb2b\"/><stop offset=\"1\" stop-color=\"#9e7e1b\"/></radialGradient><radialGradient id=\"reef3fb\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#f9fbfe\"/><stop offset=\".45\" stop-color=\"#eef3fb\"/><stop offset=\"1\" stop-color=\"#94979c\"/></radialGradient><radialGradient id=\"rf8fbff\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#fdfeff\"/><stop offset=\".45\" stop-color=\"#f8fbff\"/><stop offset=\"1\" stop-color=\"#9a9c9e\"/></radialGradient><linearGradient id=\"ge3eaf601\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f1f4fa\"/><stop offset=\".5\" stop-color=\"#e3eaf6\"/><stop offset=\"1\" stop-color=\"#9fa4ac\"/></linearGradient><linearGradient id=\"gff7a3d01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffbc9e\"/><stop offset=\".5\" stop-color=\"#ff7a3d\"/><stop offset=\"1\" stop-color=\"#b2552b\"/></linearGradient><linearGradient id=\"gffcb2b01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffe595\"/><stop offset=\".5\" stop-color=\"#ffcb2b\"/><stop offset=\"1\" stop-color=\"#b28e1e\"/></linearGradient><linearGradient id=\"g3b2a7a01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#9d94bc\"/><stop offset=\".5\" stop-color=\"#3b2a7a\"/><stop offset=\"1\" stop-color=\"#291d55\"/></linearGradient><linearGradient id=\"g2f9bff01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#97cdff\"/><stop offset=\".5\" stop-color=\"#2f9bff\"/><stop offset=\"1\" stop-color=\"#216cb2\"/></linearGradient><linearGradient id=\"g1a7ae001\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#8cbcf0\"/><stop offset=\".5\" stop-color=\"#1a7ae0\"/><stop offset=\"1\" stop-color=\"#12559d\"/></linearGradient><linearGradient id=\"g4db0ff01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#a6d8ff\"/><stop offset=\".5\" stop-color=\"#4db0ff\"/><stop offset=\"1\" stop-color=\"#367bb2\"/></linearGradient><linearGradient id=\"gcfe6ff01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#e7f2ff\"/><stop offset=\".5\" stop-color=\"#cfe6ff\"/><stop offset=\"1\" stop-color=\"#91a1b2\"/></linearGradient><radialGradient id=\"r0b1630\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#aaadb7\"/><stop offset=\".45\" stop-color=\"#0b1630\"/><stop offset=\"1\" stop-color=\"#070e1e\"/></radialGradient><linearGradient id=\"g9ee86a01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#cef4b4\"/><stop offset=\".5\" stop-color=\"#9ee86a\"/><stop offset=\"1\" stop-color=\"#6fa24a\"/></linearGradient><radialGradient id=\"re8a85a\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#f7e1c5\"/><stop offset=\".45\" stop-color=\"#e8a85a\"/><stop offset=\"1\" stop-color=\"#906838\"/></radialGradient><radialGradient id=\"rff7fb0\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#ffd2e3\"/><stop offset=\".45\" stop-color=\"#ff7fb0\"/><stop offset=\"1\" stop-color=\"#9e4f6d\"/></radialGradient><radialGradient id=\"rf6f1e7\" cx=\".35\" cy=\".3\" r=\".8\"><stop offset=\"0\" stop-color=\"#fcfaf7\"/><stop offset=\".45\" stop-color=\"#f6f1e7\"/><stop offset=\"1\" stop-color=\"#99958f\"/></radialGradient><linearGradient id=\"ge8a85a01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4d4ac\"/><stop offset=\".5\" stop-color=\"#e8a85a\"/><stop offset=\"1\" stop-color=\"#a2763f\"/></linearGradient><linearGradient id=\"gf4c27a01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fae0bc\"/><stop offset=\".5\" stop-color=\"#f4c27a\"/><stop offset=\"1\" stop-color=\"#ab8855\"/></linearGradient><linearGradient id=\"gee6a8a01\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f6b4c4\"/><stop offset=\".5\" stop-color=\"#ee6a8a\"/><stop offset=\"1\" stop-color=\"#a74a61\"/></linearGradient><linearGradient id=\"gc9ced801\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#e4e6ec\"/><stop offset=\".5\" stop-color=\"#c9ced8\"/><stop offset=\"1\" stop-color=\"#8d9097\"/></linearGradient>";
const PIC3 = {"📦":"<ellipse cx=\"32\" cy=\"59\" rx=\"24.0\" ry=\"5.120000000000001\" fill=\"url(#shd)\"/><g><polygon points=\"8,20 32,32 32,58 8,46\" fill=\"url(#cbL)\"/><polygon points=\"56,20 32,32 32,58 56,46\" fill=\"url(#cbR)\"/><polygon points=\"32,8 56,20 32,32 8,20\" fill=\"url(#cbT)\"/></g>\n<polygon points=\"41,12.5 47,15.5 23,27.5 17,24.5\" fill=\"url(#tape)\"/><polygon points=\"17,24.5 23,27.5 23,53.5 17,50.5\" fill=\"url(#tapeL)\"/>\n<polygon points=\"38,40 50,34 50,41 38,47\" fill=\"#fff\" opacity=\".92\"/><path d=\"M40 42.4l8-4M40 44.8l5-2.5\" stroke=\"#e5484d\" stroke-width=\"1.3\" stroke-linecap=\"round\"/>\n<path d=\"M8 20L32 8l24 12\" fill=\"none\" stroke=\"#fff\" stroke-opacity=\".55\" stroke-width=\"1.2\" stroke-linejoin=\"round\"/><path d=\"M32 32v26\" stroke=\"#7a4310\" stroke-opacity=\".25\" stroke-width=\"1\"/>","🧾":"<ellipse cx=\"32\" cy=\"60\" rx=\"20.4\" ry=\"4.16\" fill=\"url(#shd)\"/><g><path d=\"M16 6 H48 a4 4 0 0 1 4 4 V56 l-2.57 -4 l-2.57 4 l-2.57 -4 l-2.57 4 l-2.57 -4 l-2.57 4 l-2.57 -4 l-2.57 4 l-2.57 -4 l-2.57 4 l-2.57 -4 l-2.57 4 l-2.57 -4 l-2.57 4 V10 a4 4 0 0 1 4 -4 z\" transform=\"translate(0 0)\" fill=\"url(#rcpt)\" stroke=\"#c7d1ec\" stroke-width=\"1\"/></g>\n<rect x=\"21\" y=\"13\" width=\"14\" height=\"4\" rx=\"2\" fill=\"url(#bBar)\"/><rect x=\"21\" y=\"21\" width=\"22\" height=\"3\" rx=\"1.5\" fill=\"#c9d3ef\"/><rect x=\"21\" y=\"27\" width=\"18\" height=\"3\" rx=\"1.5\" fill=\"#c9d3ef\"/><rect x=\"21\" y=\"33\" width=\"22\" height=\"3\" rx=\"1.5\" fill=\"#c9d3ef\"/>\n<rect x=\"21\" y=\"40\" width=\"12\" height=\"5\" rx=\"2.5\" fill=\"url(#oBar)\"/><rect x=\"36\" y=\"41\" width=\"8\" height=\"3\" rx=\"1.5\" fill=\"#c9d3ef\"/>\n<g><circle cx=\"46\" cy=\"46\" r=\"10\" fill=\"url(#gBadge)\"/></g><circle cx=\"46\" cy=\"46\" r=\"10\" fill=\"none\" stroke=\"#fff\" stroke-opacity=\".7\" stroke-width=\"1.4\"/><path d=\"M41.5 46.2l3.2 3.2 5.6-6.4\" fill=\"none\" stroke=\"#fff\" stroke-width=\"2.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><ellipse cx=\"43\" cy=\"42\" rx=\"5\" ry=\"3\" transform=\"rotate(-30 43 42)\" fill=\"url(#hl)\" opacity=\"0.9\"/>","💰":"<ellipse cx=\"32\" cy=\"59\" rx=\"24.0\" ry=\"5.120000000000001\" fill=\"url(#shd)\"/><g><path d=\"M23 15 C17 27 9 34 10 46 C11 57 22 60 32 60 C42 60 53 57 54 46 C55 34 47 27 41 15 Z\" fill=\"url(#bag)\"/>\n<path d=\"M21 14 C20 6 27 5 32 9 C37 5 44 6 43 14 Z\" fill=\"url(#bag)\"/></g>\n<path d=\"M21 14 C20 6 27 5 32 9 C37 5 44 6 43 14\" fill=\"none\" stroke=\"#a15f10\" stroke-opacity=\".35\" stroke-width=\"1\"/>\n<rect x=\"21.5\" y=\"13\" width=\"21\" height=\"5.5\" rx=\"2.7\" fill=\"url(#rope)\" stroke=\"#fff\" stroke-opacity=\".5\" stroke-width=\".8\"/>\n<circle cx=\"32\" cy=\"40\" r=\"11.5\" fill=\"#fff6d6\" opacity=\".35\"/><text x=\"32\" y=\"46.5\" text-anchor=\"middle\" font-family=\"Arial Black,Arial,sans-serif\" font-weight=\"900\" font-size=\"20\" fill=\"#8a4f0c\" stroke=\"#fff3c4\" stroke-width=\".8\" paint-order=\"stroke\">$</text><ellipse cx=\"21\" cy=\"35\" rx=\"5\" ry=\"11\" transform=\"rotate(22 21 35)\" fill=\"url(#hl)\" opacity=\"0.8\"/>","🚚":"<ellipse cx=\"32\" cy=\"59\" rx=\"30.0\" ry=\"4.4799999999999995\" fill=\"url(#shd)\"/><g><rect x=\"4\" y=\"14\" width=\"35\" height=\"29\" rx=\"4\" fill=\"url(#tb)\"/><path d=\"M39 22 h10 a3 3 0 0 1 2.4 1.2 L58 33 v10 H39 z\" fill=\"url(#tc)\"/></g>\n<rect x=\"4\" y=\"34\" width=\"35\" height=\"4\" fill=\"#fff\" opacity=\".28\"/><path d=\"M44 25.5 h4.6 l5 7 H44 z\" fill=\"url(#tw)\"/><path d=\"M45 25.5 h1.5 l-3 7H44\" fill=\"#fff\" opacity=\".6\"/>\n<rect x=\"9\" y=\"19\" width=\"14\" height=\"8\" rx=\"2\" fill=\"#fff\" opacity=\".9\"/><path d=\"M12 23.5h8\" stroke=\"#2c6fe0\" stroke-width=\"2\" stroke-linecap=\"round\"/>\n<rect x=\"4\" y=\"14\" width=\"35\" height=\"6\" rx=\"3\" fill=\"#fff\" opacity=\".18\"/>\n<circle cx=\"17\" cy=\"46\" r=\"7.6\" fill=\"url(#wh)\"/><circle cx=\"17\" cy=\"46\" r=\"3.2\" fill=\"url(#hub)\"/><circle cx=\"48\" cy=\"46\" r=\"7.6\" fill=\"url(#wh)\"/><circle cx=\"48\" cy=\"46\" r=\"3.2\" fill=\"url(#hub)\"/>\n<rect x=\"55\" y=\"36\" width=\"3.5\" height=\"3\" rx=\"1\" fill=\"#ffe27a\"/>","🎁":"<ellipse cx=\"32\" cy=\"59\" rx=\"24.0\" ry=\"5.120000000000001\" fill=\"url(#shd)\"/><g><rect x=\"10\" y=\"29\" width=\"44\" height=\"28\" rx=\"3\" fill=\"url(#gb)\"/><rect x=\"7\" y=\"21\" width=\"50\" height=\"11\" rx=\"3\" fill=\"url(#gl)\"/></g>\n<rect x=\"28.5\" y=\"21\" width=\"7\" height=\"36\" fill=\"url(#rib)\"/>\n<path d=\"M32 21 C24 20 15 15 18 9 C21 4 30 10 32 21Z\" fill=\"url(#rib)\" stroke=\"#d99512\" stroke-width=\".8\"/><path d=\"M32 21 C40 20 49 15 46 9 C43 4 34 10 32 21Z\" fill=\"url(#rib)\" stroke=\"#d99512\" stroke-width=\".8\"/>\n<path d=\"M30 19 C25 17 21 13 22 11\" fill=\"none\" stroke=\"#fff\" stroke-opacity=\".7\" stroke-width=\"1.4\" stroke-linecap=\"round\"/><circle cx=\"32\" cy=\"21\" r=\"4.2\" fill=\"url(#rib)\" stroke=\"#d99512\" stroke-width=\".8\"/><ellipse cx=\"18\" cy=\"36\" rx=\"4\" ry=\"9\" transform=\"rotate(10 18 36)\" fill=\"url(#hl)\" opacity=\"0.55\"/>","🛒":"<ellipse cx=\"32\" cy=\"60\" rx=\"26.4\" ry=\"4.16\" fill=\"url(#shd)\"/><circle cx=\"26\" cy=\"15\" r=\"7\" fill=\"url(#or)\"/><rect x=\"36\" y=\"7\" width=\"12\" height=\"13\" rx=\"2.5\" fill=\"url(#bl2)\" transform=\"rotate(8 42 13)\"/><path d=\"M33 20 l5 -6 l4 6z\" fill=\"url(#rd)\"/><ellipse cx=\"24\" cy=\"13\" rx=\"2.6\" ry=\"1.5\" fill=\"#fff\" opacity=\".7\" transform=\"rotate(-30 24 13)\"/>\n<path d=\"M4 8 h8 l8 32 h30\" fill=\"none\" stroke=\"#5b6475\" stroke-width=\"3.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>\n<g><path d=\"M14 18 H58 L52.5 38 a3 3 0 0 1-2.9 2.2 H21 a3 3 0 0 1-2.9-2.3 Z\" fill=\"url(#cg)\"/></g>\n<path d=\"M22 22l2.8 14M32 22v14M42 22l-2.8 14M17 28h38\" stroke=\"#fff\" stroke-opacity=\".5\" stroke-width=\"1.3\"/><path d=\"M15 19 h42\" stroke=\"#fff\" stroke-opacity=\".7\" stroke-width=\"2\" stroke-linecap=\"round\"/>\n<circle cx=\"25\" cy=\"49\" r=\"5.2\" fill=\"url(#wh)\"/><circle cx=\"25\" cy=\"49\" r=\"2\" fill=\"url(#hub)\"/><circle cx=\"46\" cy=\"49\" r=\"5.2\" fill=\"url(#wh)\"/><circle cx=\"46\" cy=\"49\" r=\"2\" fill=\"url(#hub)\"/>","🏷":"<ellipse cx=\"32\" cy=\"60\" rx=\"24.0\" ry=\"4.16\" fill=\"url(#shd)\"/><g transform=\"rotate(-8 32 32)\"><path d=\"M9 28 L28 9 a4 4 0 0 1 2.8-1.2 H52 a4 4 0 0 1 4 4 V33.2 a4 4 0 0 1-1.2 2.8 L35.8 55 a4 4 0 0 1-5.7 0 L9 33.700 a4 4 0 0 1 0-5.7z\" fill=\"url(#tg)\"/></g>\n<g transform=\"rotate(-8 32 32)\"><circle cx=\"46\" cy=\"18\" r=\"4.4\" fill=\"#fff\"/><circle cx=\"46\" cy=\"18\" r=\"4.4\" fill=\"none\" stroke=\"#a5122f\" stroke-opacity=\".35\"/><path d=\"M46 18 C52 10 60 6 60 2\" stroke=\"#f3f4f6\" stroke-width=\"1.6\" fill=\"none\" stroke-linecap=\"round\"/>\n<text x=\"31\" y=\"38\" text-anchor=\"middle\" font-family=\"Arial Black,Arial,sans-serif\" font-weight=\"900\" font-size=\"17\" fill=\"#fff\" stroke=\"#b3123a\" stroke-width=\".6\" stroke-opacity=\".5\" transform=\"rotate(-0 31 38)\">%</text></g><ellipse cx=\"24\" cy=\"24\" rx=\"8\" ry=\"3\" transform=\"rotate(-40 24 24)\" fill=\"url(#hl)\" opacity=\"0.7\"/>","⚙":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><g><polygon points=\"52.0,31.0 58.88,33.54 57.81,38.94 50.48,38.65 46.14,45.14 49.21,51.8 44.63,54.86 39.65,49.48 32.0,51.0 29.46,57.88 24.06,56.81 24.35,49.48 17.86,45.14 11.2,48.21 8.14,43.63 13.52,38.65 12.0,31.0 5.12,28.46 6.19,23.06 13.52,23.35 17.86,16.86 14.79,10.2 19.37,7.14 24.35,12.52 32.0,11.0 34.54,4.12 39.94,5.19 39.65,12.52 46.14,16.86 52.8,13.79 55.86,18.37 50.48,23.35\" fill=\"url(#g8fa0bd01)\" stroke=\"#5d687b\" stroke-opacity=\".45\" stroke-width=\".8\" stroke-linejoin=\"round\"/><circle cx=\"32\" cy=\"31\" r=\"14\" fill=\"url(#raebbd3)\" stroke=\"#717a89\" stroke-opacity=\".4\" stroke-width=\".7\"/><circle cx=\"32\" cy=\"31\" r=\"8\" fill=\"url(#r4b5563)\" stroke=\"#313740\" stroke-opacity=\".4\" stroke-width=\".7\"/></g>","🏆":"<ellipse cx=\"32\" cy=\"60\" rx=\"20.4\" ry=\"4.16\" fill=\"url(#shd)\"/><g><path d=\"M19 11 H8 c0 12 4 18 13 19\" fill=\"none\" stroke=\"url(#tg1)\" stroke-width=\"4.2\" stroke-linecap=\"round\"/><path d=\"M45 11 H56 c0 12 -4 18 -13 19\" fill=\"none\" stroke=\"url(#tg1)\" stroke-width=\"4.2\" stroke-linecap=\"round\"/>\n<path d=\"M15 5 H49 V21 a17 17 0 0 1 -34 0 Z\" fill=\"url(#tg1)\"/><rect x=\"28\" y=\"38\" width=\"8\" height=\"10\" fill=\"url(#tg1)\"/><rect x=\"22\" y=\"47\" width=\"20\" height=\"5\" rx=\"2\" fill=\"url(#tg1)\"/><rect x=\"16\" y=\"51\" width=\"32\" height=\"8\" rx=\"2.5\" fill=\"url(#base)\"/></g>\n<rect x=\"26\" y=\"53.5\" width=\"12\" height=\"3.5\" rx=\"1\" fill=\"url(#plaq)\"/><path d=\"M32 10.5l2.8 5.7 6.3.9-4.6 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2-4.6-4.4 6.3-.9z\" fill=\"#fff\" opacity=\".95\"/><ellipse cx=\"23\" cy=\"15\" rx=\"4\" ry=\"9\" transform=\"rotate(12 23 15)\" fill=\"url(#hl)\" opacity=\"0.75\"/>","📅":"<ellipse cx=\"32\" cy=\"60\" rx=\"24.0\" ry=\"4.16\" fill=\"url(#shd)\"/><g><rect x=\"6\" y=\"9\" width=\"52\" height=\"49\" rx=\"8\" fill=\"url(#cal)\"/></g><path d=\"M6 17 a8 8 0 0 1 8-8 h36 a8 8 0 0 1 8 8 v8 H6z\" fill=\"url(#calh)\"/><rect x=\"17\" y=\"3.5\" width=\"5\" height=\"12\" rx=\"2.5\" fill=\"url(#ring)\"/><rect x=\"42\" y=\"3.5\" width=\"5\" height=\"12\" rx=\"2.5\" fill=\"url(#ring)\"/><text x=\"32\" y=\"40.5\" text-anchor=\"middle\" font-family=\"Arial Black,Arial,sans-serif\" font-weight=\"900\" font-size=\"17\" fill=\"#2b3a67\">15</text><circle cx=\"16\" cy=\"49\" r=\"2.1\" fill=\"#3b82f6\"/><circle cx=\"24\" cy=\"49\" r=\"2.1\" fill=\"#f59e0b\"/><circle cx=\"32\" cy=\"49\" r=\"2.1\" fill=\"#22c55e\"/><circle cx=\"40\" cy=\"49\" r=\"2.1\" fill=\"#a855f7\"/><circle cx=\"48\" cy=\"49\" r=\"2.1\" fill=\"#ef4444\"/><circle cx=\"56\" cy=\"49\" r=\"2.1\" fill=\"#3b82f6\"/><circle cx=\"16\" cy=\"54\" r=\"2.1\" fill=\"#ef4444\"/><circle cx=\"24\" cy=\"54\" r=\"2.1\" fill=\"#3b82f6\"/><circle cx=\"32\" cy=\"54\" r=\"2.1\" fill=\"#f59e0b\"/><circle cx=\"40\" cy=\"54\" r=\"2.1\" fill=\"#22c55e\"/><circle cx=\"48\" cy=\"54\" r=\"2.1\" fill=\"#a855f7\"/>","📊":"<ellipse cx=\"32\" cy=\"61\" rx=\"28.799999999999997\" ry=\"4.16\" fill=\"url(#shd)\"/><g><rect x=\"6\" y=\"40\" width=\"12\" height=\"20\" rx=\"2.5\" fill=\"url(#b1)\"/><rect x=\"15\" y=\"42\" width=\"3\" height=\"18\" fill=\"#000\" opacity=\".12\"/><rect x=\"7.5\" y=\"41.5\" width=\"3\" height=\"16\" rx=\"1.5\" fill=\"#fff\" opacity=\".35\"/><rect x=\"22\" y=\"28\" width=\"12\" height=\"32\" rx=\"2.5\" fill=\"url(#b2)\"/><rect x=\"31\" y=\"30\" width=\"3\" height=\"30\" fill=\"#000\" opacity=\".12\"/><rect x=\"23.5\" y=\"29.5\" width=\"3\" height=\"28\" rx=\"1.5\" fill=\"#fff\" opacity=\".35\"/><rect x=\"38\" y=\"16\" width=\"12\" height=\"44\" rx=\"2.5\" fill=\"url(#b3)\"/><rect x=\"47\" y=\"18\" width=\"3\" height=\"42\" fill=\"#000\" opacity=\".12\"/><rect x=\"39.5\" y=\"17.5\" width=\"3\" height=\"40\" rx=\"1.5\" fill=\"#fff\" opacity=\".35\"/></g><path d=\"M8 26 L24 18 L36 24 L54 8\" fill=\"none\" stroke=\"#e5304a\" stroke-width=\"3.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M45 7 h10 v10\" fill=\"none\" stroke=\"#e5304a\" stroke-width=\"3.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>","🏦":"<ellipse cx=\"32\" cy=\"61\" rx=\"28.799999999999997\" ry=\"4.16\" fill=\"url(#shd)\"/><g><rect x=\"6\" y=\"49\" width=\"52\" height=\"5\" rx=\"1.5\" fill=\"url(#step)\"/><rect x=\"3\" y=\"53.5\" width=\"58\" height=\"5\" rx=\"1.5\" fill=\"url(#step)\"/><rect x=\"8\" y=\"23\" width=\"48\" height=\"5\" rx=\"1.5\" fill=\"url(#col)\"/><path d=\"M32 4 L58 21 H6 Z\" fill=\"url(#roof)\"/></g><rect x=\"12.0\" y=\"27\" width=\"7\" height=\"22\" rx=\"1.5\" fill=\"url(#col)\"/><rect x=\"23.4\" y=\"27\" width=\"7\" height=\"22\" rx=\"1.5\" fill=\"url(#col)\"/><rect x=\"34.8\" y=\"27\" width=\"7\" height=\"22\" rx=\"1.5\" fill=\"url(#col)\"/><rect x=\"46.2\" y=\"27\" width=\"7\" height=\"22\" rx=\"1.5\" fill=\"url(#col)\"/><circle cx=\"32\" cy=\"15\" r=\"3.6\" fill=\"#ffe27a\" stroke=\"#d99512\" stroke-width=\".8\"/><path d=\"M12 21 L32 8\" stroke=\"#fff\" stroke-opacity=\".5\" stroke-width=\"1.6\" stroke-linecap=\"round\"/>","🏠":"<ellipse cx=\"32\" cy=\"60\" rx=\"26.4\" ry=\"4.16\" fill=\"url(#shd)\"/><g><rect x=\"46\" y=\"9\" width=\"7\" height=\"14\" rx=\"1\" fill=\"url(#hr)\"/><rect x=\"11\" y=\"28\" width=\"42\" height=\"30\" rx=\"2\" fill=\"url(#hw)\"/><path d=\"M3 31 L32 5 L61 31 Z\" fill=\"url(#hr)\"/></g><path d=\"M7 30.5 L32 8\" stroke=\"#fff\" stroke-opacity=\".5\" stroke-width=\"1.6\" stroke-linecap=\"round\"/><rect x=\"27\" y=\"40\" width=\"11\" height=\"18\" rx=\"2\" fill=\"url(#hd)\"/><circle cx=\"35.5\" cy=\"50\" r=\"1.1\" fill=\"#ffe27a\"/><rect x=\"15\" y=\"36\" width=\"9\" height=\"9\" rx=\"1.5\" fill=\"url(#hwin)\" stroke=\"#fff\" stroke-width=\"1.2\"/><rect x=\"41\" y=\"36\" width=\"9\" height=\"9\" rx=\"1.5\" fill=\"url(#hwin)\" stroke=\"#fff\" stroke-width=\"1.2\"/>","⚠":"<ellipse cx=\"32\" cy=\"60\" rx=\"26.4\" ry=\"4.16\" fill=\"url(#shd)\"/><g><path d=\"M32 5 C34 5 35.800 6 36.800 7.800 L59 49 C61 53 58 58 53 58 H11 C6 58 3 53 5 49 L27.200 7.800 C28.200 6 30 5 32 5Z\" fill=\"url(#al)\" stroke=\"#e08a00\" stroke-width=\"1.5\"/></g><path d=\"M32 20 v19\" stroke=\"#6b3b00\" stroke-width=\"5.4\" stroke-linecap=\"round\"/><circle cx=\"32\" cy=\"48\" r=\"3.2\" fill=\"#6b3b00\"/><ellipse cx=\"24\" cy=\"22\" rx=\"4\" ry=\"10\" transform=\"rotate(28 24 22)\" fill=\"url(#hl)\" opacity=\"0.7\"/>","🔍":"<ellipse cx=\"32\" cy=\"60\" rx=\"24.0\" ry=\"4.16\" fill=\"url(#shd)\"/><g><path d=\"M43 43 L57 57\" stroke=\"url(#hnd)\" stroke-width=\"8\" stroke-linecap=\"round\"/><circle cx=\"26\" cy=\"26\" r=\"19\" fill=\"url(#lens)\" stroke=\"url(#rim)\" stroke-width=\"6\"/></g><circle cx=\"26\" cy=\"26\" r=\"19\" fill=\"none\" stroke=\"#fff\" stroke-opacity=\".5\" stroke-width=\"1\"/><ellipse cx=\"19\" cy=\"18\" rx=\"7\" ry=\"4\" transform=\"rotate(-40 19 18)\" fill=\"url(#hl)\" opacity=\"1\"/><path d=\"M16 32 A11 11 0 0 0 30 38\" stroke=\"#fff\" stroke-opacity=\".7\" stroke-width=\"2\" fill=\"none\" stroke-linecap=\"round\"/>","👥":"<ellipse cx=\"32\" cy=\"60\" rx=\"28.799999999999997\" ry=\"4.16\" fill=\"url(#shd)\"/><g><path d=\"M33 58 v-9 a12 12 0 0 1 12-12 h2 a12 12 0 0 1 12 12 v9z\" fill=\"url(#sh2)\"/><circle cx=\"46\" cy=\"22\" r=\"9\" fill=\"url(#skin)\"/><path d=\"M37 21 a9 9 0 0 1 18 0 c-4 -3 -12 -3 -18 0z\" fill=\"url(#hair)\"/><path d=\"M4 58 v-8 a13 13 0 0 1 13-13 h4 a13 13 0 0 1 13 13 v8z\" fill=\"url(#sh1)\"/><circle cx=\"19\" cy=\"23\" r=\"10\" fill=\"url(#skin)\"/><path d=\"M9 22 a10 10 0 0 1 20 0 c-5 -3.500 -14 -3.500 -20 0z\" fill=\"url(#hair)\"/></g><circle cx=\"15.500\" cy=\"25\" r=\"1.100\" fill=\"#4a2c18\"/><circle cx=\"22.500\" cy=\"25\" r=\"1.100\" fill=\"#4a2c18\"/><path d=\"M16 29 q3 2.500 6 0\" stroke=\"#b5533c\" stroke-width=\"1.300\" fill=\"none\" stroke-linecap=\"round\"/>","🗑":"<ellipse cx=\"32\" cy=\"60\" rx=\"21.599999999999998\" ry=\"4.16\" fill=\"url(#shd)\"/><g><path d=\"M11 20 H53 L49.500 55 a4 4 0 0 1-4 3.500 H18.500 a4 4 0 0 1-4-3.500 Z\" fill=\"url(#tr)\"/><rect x=\"7\" y=\"12\" width=\"50\" height=\"8\" rx=\"4\" fill=\"url(#trl)\"/><rect x=\"24\" y=\"6\" width=\"16\" height=\"7\" rx=\"3\" fill=\"url(#trl)\"/></g><path d=\"M23 28 v22M32 28 v22M41 28 v22\" stroke=\"#fff\" stroke-opacity=\".6\" stroke-width=\"3\" stroke-linecap=\"round\"/>","🏬":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"8\" y=\"18\" width=\"48\" height=\"40\" rx=\"2\" fill=\"url(#gf4e3c101)\" stroke=\"#9f947d\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"9\" y=\"19\" width=\"46\" height=\"16.8\" rx=\"1\" fill=\"#fff\" opacity=\".22\"/><polygon points=\"4,18 10,6 54,6 60,18\" fill=\"url(#ge5484d01)\" stroke=\"#952f32\" stroke-opacity=\".45\" stroke-width=\".8\" stroke-linejoin=\"round\"/><rect x=\"4.0\" y=\"14\" width=\"5.6\" height=\"4\" fill=\"#fff\" opacity=\".85\"/><rect x=\"15.2\" y=\"14\" width=\"5.6\" height=\"4\" fill=\"#fff\" opacity=\".85\"/><rect x=\"26.4\" y=\"14\" width=\"5.6\" height=\"4\" fill=\"#fff\" opacity=\".85\"/><rect x=\"37.6\" y=\"14\" width=\"5.6\" height=\"4\" fill=\"#fff\" opacity=\".85\"/><rect x=\"48.8\" y=\"14\" width=\"5.6\" height=\"4\" fill=\"#fff\" opacity=\".85\"/><rect x=\"12\" y=\"24\" width=\"12\" height=\"10\" rx=\"1.5\" fill=\"url(#g9fd4ff01)\" stroke=\"#678aa6\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"13\" y=\"25\" width=\"10\" height=\"4.2\" rx=\"0.5\" fill=\"#fff\" opacity=\".22\"/><rect x=\"40\" y=\"24\" width=\"12\" height=\"10\" rx=\"1.5\" fill=\"url(#g9fd4ff01)\" stroke=\"#678aa6\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"41\" y=\"25\" width=\"10\" height=\"4.2\" rx=\"0.5\" fill=\"#fff\" opacity=\".22\"/><rect x=\"26\" y=\"36\" width=\"12\" height=\"22\" rx=\"1.5\" fill=\"url(#g8a5a3a01)\" stroke=\"#5a3a26\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"27\" y=\"37\" width=\"10\" height=\"9.2\" rx=\"0.5\" fill=\"#fff\" opacity=\".22\"/><rect x=\"12\" y=\"40\" width=\"12\" height=\"10\" rx=\"1.5\" fill=\"url(#gffd27a01)\" stroke=\"#a6884f\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"13\" y=\"41\" width=\"10\" height=\"4.2\" rx=\"0.5\" fill=\"#fff\" opacity=\".22\"/><rect x=\"40\" y=\"40\" width=\"12\" height=\"10\" rx=\"1.5\" fill=\"url(#gffd27a01)\" stroke=\"#a6884f\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"41\" y=\"41\" width=\"10\" height=\"4.2\" rx=\"0.5\" fill=\"#fff\" opacity=\".22\"/>","🏪":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"6\" y=\"24\" width=\"52\" height=\"34\" rx=\"3\" fill=\"url(#gfff3d601)\" stroke=\"#a69e8b\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"7\" y=\"25\" width=\"50\" height=\"14.3\" rx=\"2\" fill=\"#fff\" opacity=\".22\"/><path d=\"M3 24 L8 10 H56 L61 24 Z\" fill=\"url(#g2dbd6e01)\" stroke=\"#1d7b48\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M3.0 24 L8.0 10 h4 L12.7 24z\" fill=\"#fff\" opacity=\".8\"/><path d=\"M22.3 24 L24.0 10 h4 L32.0 24z\" fill=\"#fff\" opacity=\".8\"/><path d=\"M41.7 24 L40.0 10 h4 L51.4 24z\" fill=\"#fff\" opacity=\".8\"/><rect x=\"10\" y=\"30\" width=\"22\" height=\"16\" rx=\"2\" fill=\"url(#g8fd0ff01)\" stroke=\"#5d87a6\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"11\" y=\"31\" width=\"20\" height=\"6.7\" rx=\"1\" fill=\"#fff\" opacity=\".22\"/><rect x=\"38\" y=\"32\" width=\"14\" height=\"26\" rx=\"2\" fill=\"url(#gff9f4301)\" stroke=\"#a6672c\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"39\" y=\"33\" width=\"12\" height=\"10.9\" rx=\"1\" fill=\"#fff\" opacity=\".22\"/><text x=\"32\" y=\"54\" text-anchor=\"middle\" font-family=\"Arial Black,Arial,sans-serif\" font-weight=\"900\" font-size=\"7\" fill=\"#2dbd6e\">OPEN</text><rect x=\"11\" y=\"50\" width=\"0\" height=\"0\" rx=\"0\" fill=\"url(#gfff01)\" stroke=\"#a6a6a6\" stroke-opacity=\".45\" stroke-width=\".8\"/>","🏢":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"14\" y=\"4\" width=\"30\" height=\"54\" rx=\"2\" fill=\"url(#g7aa2e801)\" stroke=\"#4f6997\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"15\" y=\"5\" width=\"28\" height=\"22.7\" rx=\"1\" fill=\"#fff\" opacity=\".22\"/><rect x=\"40\" y=\"20\" width=\"16\" height=\"38\" rx=\"2\" fill=\"url(#g5b82cf01)\" stroke=\"#3b5487\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"41\" y=\"21\" width=\"14\" height=\"16.0\" rx=\"1\" fill=\"#fff\" opacity=\".22\"/><rect x=\"18\" y=\"9\" width=\"5.5\" height=\"5.5\" rx=\"1\" fill=\"#ffe9a0\"/><rect x=\"27\" y=\"9\" width=\"5.5\" height=\"5.5\" rx=\"1\" fill=\"#cfe3ff\"/><rect x=\"36\" y=\"9\" width=\"5.5\" height=\"5.5\" rx=\"1\" fill=\"#ffe9a0\"/><rect x=\"18\" y=\"18\" width=\"5.5\" height=\"5.5\" rx=\"1\" fill=\"#cfe3ff\"/><rect x=\"27\" y=\"18\" width=\"5.5\" height=\"5.5\" rx=\"1\" fill=\"#ffe9a0\"/><rect x=\"36\" y=\"18\" width=\"5.5\" height=\"5.5\" rx=\"1\" fill=\"#cfe3ff\"/><rect x=\"18\" y=\"27\" width=\"5.5\" height=\"5.5\" rx=\"1\" fill=\"#ffe9a0\"/><rect x=\"27\" y=\"27\" width=\"5.5\" height=\"5.5\" rx=\"1\" fill=\"#cfe3ff\"/><rect x=\"36\" y=\"27\" width=\"5.5\" height=\"5.5\" rx=\"1\" fill=\"#ffe9a0\"/><rect x=\"18\" y=\"36\" width=\"5.5\" height=\"5.5\" rx=\"1\" fill=\"#cfe3ff\"/><rect x=\"27\" y=\"36\" width=\"5.5\" height=\"5.5\" rx=\"1\" fill=\"#ffe9a0\"/><rect x=\"36\" y=\"36\" width=\"5.5\" height=\"5.5\" rx=\"1\" fill=\"#cfe3ff\"/><rect x=\"18\" y=\"45\" width=\"5.5\" height=\"5.5\" rx=\"1\" fill=\"#ffe9a0\"/><rect x=\"27\" y=\"45\" width=\"5.5\" height=\"5.5\" rx=\"1\" fill=\"#cfe3ff\"/><rect x=\"36\" y=\"45\" width=\"5.5\" height=\"5.5\" rx=\"1\" fill=\"#ffe9a0\"/><rect x=\"43.0\" y=\"25\" width=\"4\" height=\"5\" rx=\"1\" fill=\"#e9f2ff\"/><rect x=\"49.5\" y=\"25\" width=\"4\" height=\"5\" rx=\"1\" fill=\"#e9f2ff\"/><rect x=\"43.0\" y=\"34\" width=\"4\" height=\"5\" rx=\"1\" fill=\"#e9f2ff\"/><rect x=\"49.5\" y=\"34\" width=\"4\" height=\"5\" rx=\"1\" fill=\"#e9f2ff\"/><rect x=\"43.0\" y=\"43\" width=\"4\" height=\"5\" rx=\"1\" fill=\"#e9f2ff\"/><rect x=\"49.5\" y=\"43\" width=\"4\" height=\"5\" rx=\"1\" fill=\"#e9f2ff\"/><rect x=\"24\" y=\"50\" width=\"10\" height=\"8\" rx=\"1.5\" fill=\"url(#g3b4a6b01)\" stroke=\"#263046\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"25\" y=\"51\" width=\"8\" height=\"3.4\" rx=\"0.5\" fill=\"#fff\" opacity=\".22\"/>","🏭":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"5\" y=\"28\" width=\"54\" height=\"30\" rx=\"2\" fill=\"url(#gc2cad801)\" stroke=\"#7e838c\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"6\" y=\"29\" width=\"52\" height=\"12.6\" rx=\"1\" fill=\"#fff\" opacity=\".22\"/><polygon points=\"5,28 19,18 19,28\" fill=\"url(#ga8b2c401)\" stroke=\"#6d747f\" stroke-opacity=\".45\" stroke-width=\".8\" stroke-linejoin=\"round\"/><polygon points=\"19,28 33,18 33,28\" fill=\"url(#ga8b2c401)\" stroke=\"#6d747f\" stroke-opacity=\".45\" stroke-width=\".8\" stroke-linejoin=\"round\"/><polygon points=\"33,28 47,18 47,28\" fill=\"url(#ga8b2c401)\" stroke=\"#6d747f\" stroke-opacity=\".45\" stroke-width=\".8\" stroke-linejoin=\"round\"/><rect x=\"44\" y=\"6\" width=\"9\" height=\"24\" rx=\"1.5\" fill=\"url(#gd95f3b01)\" stroke=\"#8d3e26\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"45\" y=\"7\" width=\"7\" height=\"10.1\" rx=\"0.5\" fill=\"#fff\" opacity=\".22\"/><circle cx=\"46\" cy=\"5\" r=\"4\" fill=\"url(#re9edf5)\" stroke=\"#979a9f\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"44.8\" cy=\"3.48\" rx=\"1.8\" ry=\"1.04\" transform=\"rotate(-30 44.8 3.48)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"54\" cy=\"3\" r=\"3\" fill=\"url(#rf5f7fb)\" stroke=\"#9fa1a3\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"53.1\" cy=\"1.8599999999999999\" rx=\"1.35\" ry=\"0.78\" transform=\"rotate(-30 53.1 1.8599999999999999)\" fill=\"url(#hl)\" opacity=\"0.95\"/><rect x=\"10\" y=\"38\" width=\"8\" height=\"8\" rx=\"1.5\" fill=\"#ffe08a\"/><rect x=\"22\" y=\"38\" width=\"8\" height=\"8\" rx=\"1.5\" fill=\"#ffe08a\"/><rect x=\"34\" y=\"38\" width=\"8\" height=\"8\" rx=\"1.5\" fill=\"#ffe08a\"/><rect x=\"46\" y=\"38\" width=\"8\" height=\"8\" rx=\"1.5\" fill=\"#ffe08a\"/><rect x=\"24\" y=\"48\" width=\"14\" height=\"10\" rx=\"1.5\" fill=\"url(#g6b748701)\" stroke=\"#464b58\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"25\" y=\"49\" width=\"12\" height=\"4.2\" rx=\"0.5\" fill=\"#fff\" opacity=\".22\"/>","🏛":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><polygon points=\"32,5 60,20 4,20\" fill=\"url(#gf1e2bd01)\" stroke=\"#9d937b\" stroke-opacity=\".45\" stroke-width=\".8\" stroke-linejoin=\"round\"/><rect x=\"6\" y=\"20\" width=\"52\" height=\"5\" rx=\"1.5\" fill=\"url(#ge6d3a301)\" stroke=\"#96896a\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"7\" y=\"21\" width=\"50\" height=\"2.1\" rx=\"0.5\" fill=\"#fff\" opacity=\".22\"/><rect x=\"10.0\" y=\"26\" width=\"6.5\" height=\"24\" rx=\"2\" fill=\"url(#gfff6df01)\" stroke=\"#a6a091\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"11.0\" y=\"27\" width=\"4.5\" height=\"10.1\" rx=\"1\" fill=\"#fff\" opacity=\".22\"/><rect x=\"20.5\" y=\"26\" width=\"6.5\" height=\"24\" rx=\"2\" fill=\"url(#gfff6df01)\" stroke=\"#a6a091\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"21.5\" y=\"27\" width=\"4.5\" height=\"10.1\" rx=\"1\" fill=\"#fff\" opacity=\".22\"/><rect x=\"31.0\" y=\"26\" width=\"6.5\" height=\"24\" rx=\"2\" fill=\"url(#gfff6df01)\" stroke=\"#a6a091\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"32.0\" y=\"27\" width=\"4.5\" height=\"10.1\" rx=\"1\" fill=\"#fff\" opacity=\".22\"/><rect x=\"41.5\" y=\"26\" width=\"6.5\" height=\"24\" rx=\"2\" fill=\"url(#gfff6df01)\" stroke=\"#a6a091\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"42.5\" y=\"27\" width=\"4.5\" height=\"10.1\" rx=\"1\" fill=\"#fff\" opacity=\".22\"/><rect x=\"52.0\" y=\"26\" width=\"6.5\" height=\"24\" rx=\"2\" fill=\"url(#gfff6df01)\" stroke=\"#a6a091\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"53.0\" y=\"27\" width=\"4.5\" height=\"10.1\" rx=\"1\" fill=\"#fff\" opacity=\".22\"/><rect x=\"4\" y=\"50\" width=\"56\" height=\"5\" rx=\"1.5\" fill=\"url(#gd9c28e01)\" stroke=\"#8d7e5c\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"5\" y=\"51\" width=\"54\" height=\"2.1\" rx=\"0.5\" fill=\"#fff\" opacity=\".22\"/><rect x=\"1\" y=\"55\" width=\"62\" height=\"5\" rx=\"1.5\" fill=\"url(#gc7ac7201)\" stroke=\"#81704a\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"2\" y=\"56\" width=\"60\" height=\"2.1\" rx=\"0.5\" fill=\"#fff\" opacity=\".22\"/><circle cx=\"32\" cy=\"13\" r=\"3.4\" fill=\"url(#re0a526)\" stroke=\"#926b19\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"30.98\" cy=\"11.708\" rx=\"1.53\" ry=\"0.884\" transform=\"rotate(-30 30.98 11.708)\" fill=\"url(#hl)\" opacity=\"0.95\"/>","🕌":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"10\" y=\"34\" width=\"44\" height=\"24\" rx=\"2\" fill=\"url(#gf2e7cf01)\" stroke=\"#9d9687\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"11\" y=\"35\" width=\"42\" height=\"10.1\" rx=\"1\" fill=\"#fff\" opacity=\".22\"/><path d=\"M16 34 C16 14 48 14 48 34Z\" fill=\"url(#g1fb6a601)\" stroke=\"#14766c\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M32 8 v-4\" fill=\"none\" stroke=\"#e8b92a\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"32\" cy=\"4\" r=\"2.5\" fill=\"url(#rf4c542)\" stroke=\"#9f802b\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"31.25\" cy=\"3.05\" rx=\"1.125\" ry=\"0.65\" transform=\"rotate(-30 31.25 3.05)\" fill=\"url(#hl)\" opacity=\"0.95\"/><rect x=\"2\" y=\"16\" width=\"8\" height=\"42\" rx=\"2\" fill=\"url(#gf7efdc01)\" stroke=\"#a19b8f\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"3\" y=\"17\" width=\"6\" height=\"17.6\" rx=\"1\" fill=\"#fff\" opacity=\".22\"/><path d=\"M2 16 L6 5 L10 16Z\" fill=\"url(#g1fb6a601)\" stroke=\"#14766c\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><rect x=\"54\" y=\"16\" width=\"8\" height=\"42\" rx=\"2\" fill=\"url(#gf7efdc01)\" stroke=\"#a19b8f\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"55\" y=\"17\" width=\"6\" height=\"17.6\" rx=\"1\" fill=\"#fff\" opacity=\".22\"/><path d=\"M54 16 L58 5 L62 16Z\" fill=\"url(#g1fb6a601)\" stroke=\"#14766c\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M27 58 V46 a5 5 0 0 1 10 0 V58Z\" fill=\"url(#g3b6ea801)\" stroke=\"#26486d\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><rect x=\"15\" y=\"40\" width=\"6\" height=\"6\" rx=\"1.5\" fill=\"url(#g7fc1ff01)\" stroke=\"#537da6\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"16\" y=\"41\" width=\"4\" height=\"2.5\" rx=\"0.5\" fill=\"#fff\" opacity=\".22\"/><rect x=\"43\" y=\"40\" width=\"6\" height=\"6\" rx=\"1.5\" fill=\"url(#g7fc1ff01)\" stroke=\"#537da6\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"44\" y=\"41\" width=\"4\" height=\"2.5\" rx=\"0.5\" fill=\"#fff\" opacity=\".22\"/>","💵":"<ellipse cx=\"32\" cy=\"52\" rx=\"24\" ry=\"3.2\" fill=\"url(#shd)\"/><g transform=\"rotate(-8 32 32)\"><rect x=\"4\" y=\"16\" width=\"56\" height=\"32\" rx=\"4\" fill=\"url(#g4ecb7a01)\" stroke=\"#33844f\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"5\" y=\"17\" width=\"54\" height=\"13.4\" rx=\"3\" fill=\"#fff\" opacity=\".22\"/><rect x=\"8\" y=\"20\" width=\"48\" height=\"24\" rx=\"2.5\" fill=\"none\" stroke=\"#fff\" stroke-opacity=\".6\" stroke-width=\"1.2\" stroke-dasharray=\"3 2\"/><circle cx=\"32\" cy=\"32\" r=\"8.5\" fill=\"url(#r2e9e56)\" stroke=\"#1e6738\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"29.45\" cy=\"28.77\" rx=\"3.825\" ry=\"2.21\" transform=\"rotate(-30 29.45 28.77)\" fill=\"url(#hl)\" opacity=\"0.95\"/><text x=\"32\" y=\"37\" text-anchor=\"middle\" font-family=\"Arial Black,Arial,sans-serif\" font-weight=\"900\" font-size=\"13\" fill=\"#e8ffe9\">$</text><circle cx=\"13\" cy=\"32\" r=\"3\" fill=\"url(#r2e9e56)\" stroke=\"#1e6738\" stroke-opacity=\".4\" stroke-width=\".7\"/><circle cx=\"51\" cy=\"32\" r=\"3\" fill=\"url(#r2e9e56)\" stroke=\"#1e6738\" stroke-opacity=\".4\" stroke-width=\".7\"/></g>","💸":"<g opacity=\".95\"><path d=\"M12 22 C2 14 2 30 14 34 C6 30 8 40 18 38Z\" fill=\"url(#gffffff01)\" stroke=\"#9da0a6\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M52 22 C62 14 62 30 50 34 C58 30 56 40 46 38Z\" fill=\"url(#gffffff01)\" stroke=\"#9da0a6\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/></g><ellipse cx=\"32\" cy=\"56\" rx=\"20\" ry=\"3\" fill=\"url(#shd)\"/><g transform=\"rotate(-6 32 32)\"><rect x=\"13\" y=\"18\" width=\"38\" height=\"26\" rx=\"4\" fill=\"url(#g4ecb7a01)\" stroke=\"#33844f\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"14\" y=\"19\" width=\"36\" height=\"10.9\" rx=\"3\" fill=\"#fff\" opacity=\".22\"/><circle cx=\"32\" cy=\"31\" r=\"7\" fill=\"url(#r2e9e56)\" stroke=\"#1e6738\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"29.9\" cy=\"28.34\" rx=\"3.15\" ry=\"1.82\" transform=\"rotate(-30 29.9 28.34)\" fill=\"url(#hl)\" opacity=\"0.95\"/><text x=\"32\" y=\"36\" text-anchor=\"middle\" font-family=\"Arial Black,Arial,sans-serif\" font-weight=\"900\" font-size=\"11\" fill=\"#e8ffe9\">$</text></g>","💲":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><circle cx=\"32\" cy=\"31\" r=\"25\" fill=\"url(#r2fbf6b)\" stroke=\"#1f7c46\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"24.5\" cy=\"21.5\" rx=\"11.25\" ry=\"6.5\" transform=\"rotate(-30 24.5 21.5)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"32\" cy=\"31\" r=\"20\" fill=\"none\" stroke=\"#fff\" stroke-opacity=\".5\" stroke-width=\"1.4\"/><text x=\"32\" y=\"43\" text-anchor=\"middle\" font-family=\"Arial Black,Arial,sans-serif\" font-weight=\"900\" font-size=\"32\" fill=\"#ffffff\" stroke=\"#157a3d\" stroke-width=\".8\" paint-order=\"stroke\">$</text>","💳":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><g transform=\"rotate(-8 32 32)\"><rect x=\"4\" y=\"14\" width=\"56\" height=\"36\" rx=\"5\" fill=\"url(#g4f7cff01)\" stroke=\"#3351a6\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"5\" y=\"15\" width=\"54\" height=\"15.1\" rx=\"4\" fill=\"#fff\" opacity=\".22\"/><rect x=\"4\" y=\"21\" width=\"56\" height=\"8\" fill=\"#1a2447\"/><rect x=\"10\" y=\"36\" width=\"12\" height=\"9\" rx=\"2\" fill=\"url(#gffd96a01)\" stroke=\"#a68d45\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"11\" y=\"37\" width=\"10\" height=\"3.8\" rx=\"1\" fill=\"#fff\" opacity=\".22\"/><rect x=\"28\" y=\"38\" width=\"22\" height=\"3\" rx=\"1.5\" fill=\"#fff\" opacity=\".8\"/><rect x=\"28\" y=\"43\" width=\"14\" height=\"3\" rx=\"1.5\" fill=\"#fff\" opacity=\".6\"/></g>","🏧":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"10\" y=\"4\" width=\"44\" height=\"54\" rx=\"5\" fill=\"url(#g3b82f601)\" stroke=\"#2654a0\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"11\" y=\"5\" width=\"42\" height=\"22.7\" rx=\"4\" fill=\"#fff\" opacity=\".22\"/><rect x=\"15\" y=\"9\" width=\"34\" height=\"20\" rx=\"3\" fill=\"url(#gbfe9ff01)\" stroke=\"#7c97a6\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"16\" y=\"10\" width=\"32\" height=\"8.4\" rx=\"2\" fill=\"#fff\" opacity=\".22\"/><text x=\"32\" y=\"24\" text-anchor=\"middle\" font-family=\"Arial Black,Arial,sans-serif\" font-weight=\"900\" font-size=\"12\" fill=\"#1d4ed8\">ATM</text><rect x=\"15\" y=\"34\" width=\"34\" height=\"8\" rx=\"2\" fill=\"url(#g1e3a8a01)\" stroke=\"#14265a\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"16\" y=\"35\" width=\"32\" height=\"3.4\" rx=\"1\" fill=\"#fff\" opacity=\".22\"/><rect x=\"19\" y=\"37\" width=\"26\" height=\"2.4\" fill=\"#0b1630\"/><rect x=\"16.0\" y=\"46.0\" width=\"6.5\" height=\"3.6\" rx=\"1\" fill=\"#e5e7eb\"/><rect x=\"24.4\" y=\"46.0\" width=\"6.5\" height=\"3.6\" rx=\"1\" fill=\"#e5e7eb\"/><rect x=\"32.8\" y=\"46.0\" width=\"6.5\" height=\"3.6\" rx=\"1\" fill=\"#e5e7eb\"/><rect x=\"41.2\" y=\"46.0\" width=\"6.5\" height=\"3.6\" rx=\"1\" fill=\"#e5e7eb\"/><rect x=\"16.0\" y=\"51.2\" width=\"6.5\" height=\"3.6\" rx=\"1\" fill=\"#e5e7eb\"/><rect x=\"24.4\" y=\"51.2\" width=\"6.5\" height=\"3.6\" rx=\"1\" fill=\"#e5e7eb\"/><rect x=\"32.8\" y=\"51.2\" width=\"6.5\" height=\"3.6\" rx=\"1\" fill=\"#e5e7eb\"/><rect x=\"41.2\" y=\"51.2\" width=\"6.5\" height=\"3.6\" rx=\"1\" fill=\"#e5e7eb\"/>","💎":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><polygon points=\"14,10 50,10 60,24 4,24\" fill=\"url(#g5ad4ff01)\" stroke=\"#3a8aa6\" stroke-opacity=\".45\" stroke-width=\".8\" stroke-linejoin=\"round\"/><polygon points=\"4,24 60,24 32,58\" fill=\"url(#g2aa0e001)\" stroke=\"#1b6892\" stroke-opacity=\".45\" stroke-width=\".8\" stroke-linejoin=\"round\"/><polygon points=\"14,10 24,24 32,10\" fill=\"url(#g9be8ff01)\" stroke=\"#6597a6\" stroke-opacity=\".45\" stroke-width=\".8\" stroke-linejoin=\"round\"/><polygon points=\"32,10 40,24 50,10\" fill=\"url(#g9be8ff01)\" stroke=\"#6597a6\" stroke-opacity=\".45\" stroke-width=\".8\" stroke-linejoin=\"round\"/><polygon points=\"24,24 32,10 40,24\" fill=\"url(#gc9f4ff01)\" stroke=\"#839fa6\" stroke-opacity=\".45\" stroke-width=\".8\" stroke-linejoin=\"round\"/><polygon points=\"24,24 40,24 32,58\" fill=\"url(#g4cc2f201)\" stroke=\"#317e9d\" stroke-opacity=\".45\" stroke-width=\".8\" stroke-linejoin=\"round\"/><ellipse cx=\"20\" cy=\"15\" rx=\"6\" ry=\"2\" transform=\"rotate(-10 20 15)\" fill=\"url(#hl)\" opacity=\"0.9\"/>","📄":"<ellipse cx=\"32\" cy=\"60\" rx=\"16\" ry=\"2.6\" fill=\"url(#shd)\"/><path d=\"M14 4 H38 L52 18 V56 a3 3 0 0 1-3 3 H14 a3 3 0 0 1-3-3 V7 a3 3 0 0 1 3-3Z\" fill=\"url(#gffffff01)\" stroke=\"#9fa1a6\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M38 4 V15 a3 3 0 0 0 3 3 H52Z\" fill=\"url(#gc9d6f501)\" stroke=\"#838b9f\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><rect x=\"17\" y=\"26\" width=\"28\" height=\"3\" rx=\"1.5\" fill=\"#b4c3e8\"/><rect x=\"17\" y=\"33\" width=\"20\" height=\"3\" rx=\"1.5\" fill=\"#b4c3e8\"/><rect x=\"17\" y=\"40\" width=\"28\" height=\"3\" rx=\"1.5\" fill=\"#b4c3e8\"/><rect x=\"17\" y=\"47\" width=\"20\" height=\"3\" rx=\"1.5\" fill=\"#b4c3e8\"/><rect x=\"17\" y=\"22\" width=\"10\" height=\"3\" rx=\"1.5\" fill=\"#6d8cf0\"/>","📃":"<ellipse cx=\"32\" cy=\"60\" rx=\"16\" ry=\"2.6\" fill=\"url(#shd)\"/><path d=\"M16 4 H48 a3 3 0 0 1 3 3 V45 C51 52 54 56 58 58 H16 a3 3 0 0 1-3-3 V7 a3 3 0 0 1 3-3Z\" fill=\"url(#gffffff01)\" stroke=\"#a6a6a6\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M51 45 C51 53 58 55 58 58 H44 a7 7 0 0 0 7-13Z\" fill=\"url(#gcfd8ef01)\" stroke=\"#878c9b\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><rect x=\"19\" y=\"12\" width=\"20\" height=\"3\" rx=\"1.5\" fill=\"#b4c3e8\"/><rect x=\"19\" y=\"19\" width=\"26\" height=\"3\" rx=\"1.5\" fill=\"#b4c3e8\"/><rect x=\"19\" y=\"26\" width=\"20\" height=\"3\" rx=\"1.5\" fill=\"#b4c3e8\"/><rect x=\"19\" y=\"33\" width=\"26\" height=\"3\" rx=\"1.5\" fill=\"#b4c3e8\"/><rect x=\"19\" y=\"40\" width=\"20\" height=\"3\" rx=\"1.5\" fill=\"#b4c3e8\"/>","📋":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"10\" y=\"8\" width=\"44\" height=\"50\" rx=\"5\" fill=\"url(#gc58a5201)\" stroke=\"#805a35\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"11\" y=\"9\" width=\"42\" height=\"21.0\" rx=\"4\" fill=\"#fff\" opacity=\".22\"/><rect x=\"15\" y=\"14\" width=\"34\" height=\"40\" rx=\"2.5\" fill=\"url(#gfffdf501)\" stroke=\"#a6a49f\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"22\" y=\"3\" width=\"20\" height=\"9\" rx=\"3.5\" fill=\"url(#g8d98ad01)\" stroke=\"#5c6370\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"23\" y=\"4\" width=\"18\" height=\"3.8\" rx=\"2.5\" fill=\"#fff\" opacity=\".22\"/><circle cx=\"32\" cy=\"6\" r=\"2\" fill=\"url(#re5e9f2)\" stroke=\"#95979d\" stroke-opacity=\".4\" stroke-width=\".7\"/><path d=\"M20 24 l2.5 2.5 l4.5-5\" stroke=\"#22b45f\" stroke-width=\"2.4\" fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><rect x=\"31\" y=\"22\" width=\"14\" height=\"3.5\" rx=\"1.7\" fill=\"#c9d3ec\"/><path d=\"M20 34 l2.5 2.5 l4.5-5\" stroke=\"#22b45f\" stroke-width=\"2.4\" fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><rect x=\"31\" y=\"32\" width=\"14\" height=\"3.5\" rx=\"1.7\" fill=\"#c9d3ec\"/><path d=\"M20 44 l2.5 2.5 l4.5-5\" stroke=\"#22b45f\" stroke-width=\"2.4\" fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><rect x=\"31\" y=\"42\" width=\"14\" height=\"3.5\" rx=\"1.7\" fill=\"#c9d3ec\"/>","📝":"<ellipse cx=\"32\" cy=\"60\" rx=\"17\" ry=\"2.6\" fill=\"url(#shd)\"/><rect x=\"10\" y=\"6\" width=\"38\" height=\"52\" rx=\"4\" fill=\"url(#gfff9d601)\" stroke=\"#a6a28b\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"11\" y=\"7\" width=\"36\" height=\"21.8\" rx=\"3\" fill=\"#fff\" opacity=\".22\"/><rect x=\"16\" y=\"16\" width=\"26\" height=\"2.6\" rx=\"1.3\" fill=\"#cdb85a\" opacity=\".7\"/><rect x=\"16\" y=\"24\" width=\"26\" height=\"2.6\" rx=\"1.3\" fill=\"#cdb85a\" opacity=\".7\"/><rect x=\"16\" y=\"32\" width=\"26\" height=\"2.6\" rx=\"1.3\" fill=\"#cdb85a\" opacity=\".7\"/><rect x=\"16\" y=\"40\" width=\"26\" height=\"2.6\" rx=\"1.3\" fill=\"#cdb85a\" opacity=\".7\"/><rect x=\"10\" y=\"6\" width=\"38\" height=\"8\" rx=\"3\" fill=\"url(#gff9f4301)\" stroke=\"#a6672c\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"11\" y=\"7\" width=\"36\" height=\"3.4\" rx=\"2\" fill=\"#fff\" opacity=\".22\"/><g transform=\"rotate(38 46 34)\"><rect x=\"42\" y=\"10\" width=\"7\" height=\"36\" rx=\"2\" fill=\"url(#g4f8cff01)\" stroke=\"#335ba6\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"43\" y=\"11\" width=\"5\" height=\"15.1\" rx=\"1\" fill=\"#fff\" opacity=\".22\"/><path d=\"M42 46 L49 46 L45.5 55Z\" fill=\"url(#gf5d3a101)\" stroke=\"#9f8969\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M44.5 51.5 L46.5 51.5 L45.5 55Z\" fill=\"url(#g3a2a1a01)\" stroke=\"#261b11\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><rect x=\"42\" y=\"10\" width=\"7\" height=\"6\" rx=\"2\" fill=\"url(#gff7a7a01)\" stroke=\"#a64f4f\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"43\" y=\"11\" width=\"5\" height=\"2.5\" rx=\"1\" fill=\"#fff\" opacity=\".22\"/></g>","📒":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"12\" y=\"4\" width=\"40\" height=\"54\" rx=\"4\" fill=\"url(#gf3b43c01)\" stroke=\"#9e7527\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"13\" y=\"5\" width=\"38\" height=\"22.7\" rx=\"3\" fill=\"#fff\" opacity=\".22\"/><rect x=\"12\" y=\"4\" width=\"7\" height=\"54\" rx=\"3\" fill=\"url(#gc9841001)\" stroke=\"#83560a\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"13\" y=\"5\" width=\"5\" height=\"22.7\" rx=\"2\" fill=\"#fff\" opacity=\".22\"/><rect x=\"23\" y=\"12\" width=\"24\" height=\"14\" rx=\"2\" fill=\"url(#gfff8e101)\" stroke=\"#a6a192\" stroke-opacity=\".45\" stroke-width=\".8\"/><text x=\"35\" y=\"23\" text-anchor=\"middle\" font-family=\"Arial Black,Arial,sans-serif\" font-weight=\"900\" font-size=\"10\" fill=\"#a8680a\">KT</text><rect x=\"23\" y=\"31\" width=\"24\" height=\"2.6\" rx=\"1.3\" fill=\"#fff\" opacity=\".6\"/><rect x=\"23\" y=\"38\" width=\"24\" height=\"2.6\" rx=\"1.3\" fill=\"#fff\" opacity=\".6\"/><rect x=\"23\" y=\"45\" width=\"24\" height=\"2.6\" rx=\"1.3\" fill=\"#fff\" opacity=\".6\"/>","📘":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"10\" y=\"4\" width=\"42\" height=\"54\" rx=\"4\" fill=\"url(#g3f7df001)\" stroke=\"#29519c\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"11\" y=\"5\" width=\"40\" height=\"22.7\" rx=\"3\" fill=\"#fff\" opacity=\".22\"/><rect x=\"10\" y=\"4\" width=\"7\" height=\"54\" rx=\"3\" fill=\"url(#g2859c401)\" stroke=\"#1a3a7f\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"11\" y=\"5\" width=\"5\" height=\"22.7\" rx=\"2\" fill=\"#fff\" opacity=\".22\"/><rect x=\"52\" y=\"8\" width=\"4\" height=\"46\" rx=\"1.5\" fill=\"url(#gf8f6ee01)\" stroke=\"#a1a09b\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"22\" y=\"12\" width=\"24\" height=\"16\" rx=\"3\" fill=\"url(#gbcd5ff01)\" stroke=\"#7a8aa6\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"24\" y=\"36\" width=\"20\" height=\"3\" rx=\"1.5\" fill=\"#fff\" opacity=\".75\"/><rect x=\"24\" y=\"42\" width=\"14\" height=\"3\" rx=\"1.5\" fill=\"#fff\" opacity=\".55\"/><circle cx=\"34\" cy=\"20\" r=\"4.5\" fill=\"url(#rffd24c)\" stroke=\"#a68831\" stroke-opacity=\".4\" stroke-width=\".7\"/>","📖":"<ellipse cx=\"32\" cy=\"58\" rx=\"26\" ry=\"3\" fill=\"url(#shd)\"/><path d=\"M32 14 C24 8 12 8 4 11 V50 C12 47 24 47 32 53Z\" fill=\"url(#gffffff01)\" stroke=\"#a6a298\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M32 14 C40 8 52 8 60 11 V50 C52 47 40 47 32 53Z\" fill=\"url(#gfffdf601)\" stroke=\"#9e998c\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M9 19.0 C16 17.0 24 18.0 28 21.0\" stroke=\"#b9a77a\" stroke-width=\"1.6\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M9 25.5 C16 23.5 24 24.5 28 27.5\" stroke=\"#b9a77a\" stroke-width=\"1.6\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M9 32.0 C16 30.0 24 31.0 28 34.0\" stroke=\"#b9a77a\" stroke-width=\"1.6\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M9 38.5 C16 36.5 24 37.5 28 40.5\" stroke=\"#b9a77a\" stroke-width=\"1.6\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M55 19.0 C48 17.0 40 18.0 36 21.0\" stroke=\"#b9a77a\" stroke-width=\"1.6\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M55 25.5 C48 23.5 40 24.5 36 27.5\" stroke=\"#b9a77a\" stroke-width=\"1.6\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M55 32.0 C48 30.0 40 31.0 36 34.0\" stroke=\"#b9a77a\" stroke-width=\"1.6\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M55 38.5 C48 36.5 40 37.5 36 40.5\" stroke=\"#b9a77a\" stroke-width=\"1.6\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M2 50 C12 46 24 46 32 53 C40 46 52 46 62 50 V54 C52 50 40 50 32 57 C24 50 12 50 2 54Z\" fill=\"url(#g2f8cf001)\" stroke=\"#1f5b9c\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/>","📜":"<ellipse cx=\"32\" cy=\"60\" rx=\"20\" ry=\"2.6\" fill=\"url(#shd)\"/><path d=\"M16 8 H52 V50 a8 8 0 0 1-8 8 H14 a8 8 0 0 0 8-8 V16 a8 8 0 0 0-6-8Z\" fill=\"url(#gfff3d601)\" stroke=\"#a39984\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M16 8 a8 8 0 0 0 0 16 h4 V16 a8 8 0 0 0-4-8Z\" fill=\"url(#ge8cd9401)\" stroke=\"#978560\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><rect x=\"26\" y=\"16\" width=\"22\" height=\"2.8\" rx=\"1.4\" fill=\"#c9a766\"/><rect x=\"26\" y=\"23\" width=\"16\" height=\"2.8\" rx=\"1.4\" fill=\"#c9a766\"/><rect x=\"26\" y=\"30\" width=\"22\" height=\"2.8\" rx=\"1.4\" fill=\"#c9a766\"/><rect x=\"26\" y=\"37\" width=\"16\" height=\"2.8\" rx=\"1.4\" fill=\"#c9a766\"/><rect x=\"26\" y=\"44\" width=\"22\" height=\"2.8\" rx=\"1.4\" fill=\"#c9a766\"/><path d=\"M14 58 a8 8 0 0 1 0-16 h6 v8 a8 8 0 0 1-6 8Z\" fill=\"url(#ge8cd9401)\" stroke=\"#978560\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/>","🔖":"<ellipse cx=\"32\" cy=\"60\" rx=\"14\" ry=\"2.4\" fill=\"url(#shd)\"/><path d=\"M16 4 H48 V60 L32 47 L16 60Z\" fill=\"url(#gff5a6e01)\" stroke=\"#a63a48\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M16 4 H26 V52 L16 60Z\" fill=\"#fff\" opacity=\".16\"/><circle cx=\"32\" cy=\"18\" r=\"4.5\" fill=\"url(#rffe27a)\" stroke=\"#a6934f\" stroke-opacity=\".4\" stroke-width=\".7\"/>","🆕":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M32 2 l6 7 9-2 1 9 9 3-5 8 5 8-9 3-1 9-9-2-6 7-6-7-9 2-1-9-9-3 5-8-5-8 9-3 1-9 9 2z\" fill=\"url(#gff6a3d01)\" stroke=\"#a64528\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><circle cx=\"32\" cy=\"32\" r=\"19\" fill=\"url(#rff9d3d)\" stroke=\"#a66628\" stroke-opacity=\".4\" stroke-width=\".7\"/><text x=\"32\" y=\"38\" text-anchor=\"middle\" font-family=\"Arial Black,Arial,sans-serif\" font-weight=\"900\" font-size=\"15\" fill=\"#fff\" stroke=\"#b8340e\" stroke-width=\".8\" paint-order=\"stroke\">NEW</text>","🔢":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"4\" y=\"8\" width=\"56\" height=\"46\" rx=\"6\" fill=\"url(#g6a5af901)\" stroke=\"#453aa2\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"5\" y=\"9\" width=\"54\" height=\"19.3\" rx=\"5\" fill=\"#fff\" opacity=\".22\"/><text x=\"18\" y=\"30\" text-anchor=\"middle\" font-family=\"Arial Black,Arial,sans-serif\" font-weight=\"900\" font-size=\"17\" fill=\"#fff\">1</text><text x=\"32\" y=\"30\" text-anchor=\"middle\" font-family=\"Arial Black,Arial,sans-serif\" font-weight=\"900\" font-size=\"17\" fill=\"#ffe27a\">2</text><text x=\"46\" y=\"30\" text-anchor=\"middle\" font-family=\"Arial Black,Arial,sans-serif\" font-weight=\"900\" font-size=\"17\" fill=\"#7cf0b0\">3</text><text x=\"25\" y=\"47\" text-anchor=\"middle\" font-family=\"Arial Black,Arial,sans-serif\" font-weight=\"900\" font-size=\"15\" fill=\"#ff9db0\">4</text><text x=\"39\" y=\"47\" text-anchor=\"middle\" font-family=\"Arial Black,Arial,sans-serif\" font-weight=\"900\" font-size=\"15\" fill=\"#8fe0ff\">5</text>","🧮":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"4\" y=\"8\" width=\"56\" height=\"48\" rx=\"4\" fill=\"url(#ga8683a01)\" stroke=\"#6d4426\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"5\" y=\"9\" width=\"54\" height=\"20.2\" rx=\"3\" fill=\"#fff\" opacity=\".22\"/><rect x=\"7\" y=\"11\" width=\"50\" height=\"42\" rx=\"2\" fill=\"url(#gf6e2b801)\" stroke=\"#a09378\" stroke-opacity=\".45\" stroke-width=\".8\"/><path d=\"M8 19 H56\" fill=\"none\" stroke=\"#7a4a22\" stroke-width=\"1.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M8 30 H56\" fill=\"none\" stroke=\"#7a4a22\" stroke-width=\"1.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M8 41 H56\" fill=\"none\" stroke=\"#7a4a22\" stroke-width=\"1.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M8 52 H56\" fill=\"none\" stroke=\"#7a4a22\" stroke-width=\"1.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"26.0\" cy=\"19\" r=\"4.2\" fill=\"url(#re5484d)\" stroke=\"#952f32\" stroke-opacity=\".4\" stroke-width=\".7\"/><circle cx=\"33.2\" cy=\"19\" r=\"4.2\" fill=\"url(#re5484d)\" stroke=\"#952f32\" stroke-opacity=\".4\" stroke-width=\".7\"/><circle cx=\"40.4\" cy=\"19\" r=\"4.2\" fill=\"url(#re5484d)\" stroke=\"#952f32\" stroke-opacity=\".4\" stroke-width=\".7\"/><circle cx=\"12.0\" cy=\"30\" r=\"4.2\" fill=\"url(#r3b82f6)\" stroke=\"#2654a0\" stroke-opacity=\".4\" stroke-width=\".7\"/><circle cx=\"19.2\" cy=\"30\" r=\"4.2\" fill=\"url(#r3b82f6)\" stroke=\"#2654a0\" stroke-opacity=\".4\" stroke-width=\".7\"/><circle cx=\"26.4\" cy=\"30\" r=\"4.2\" fill=\"url(#r3b82f6)\" stroke=\"#2654a0\" stroke-opacity=\".4\" stroke-width=\".7\"/><circle cx=\"26.0\" cy=\"41\" r=\"4.2\" fill=\"url(#r22b45f)\" stroke=\"#16753e\" stroke-opacity=\".4\" stroke-width=\".7\"/><circle cx=\"33.2\" cy=\"41\" r=\"4.2\" fill=\"url(#r22b45f)\" stroke=\"#16753e\" stroke-opacity=\".4\" stroke-width=\".7\"/><circle cx=\"40.4\" cy=\"41\" r=\"4.2\" fill=\"url(#r22b45f)\" stroke=\"#16753e\" stroke-opacity=\".4\" stroke-width=\".7\"/><circle cx=\"12.0\" cy=\"52\" r=\"4.2\" fill=\"url(#rf5b928)\" stroke=\"#9f781a\" stroke-opacity=\".4\" stroke-width=\".7\"/><circle cx=\"19.2\" cy=\"52\" r=\"4.2\" fill=\"url(#rf5b928)\" stroke=\"#9f781a\" stroke-opacity=\".4\" stroke-width=\".7\"/><circle cx=\"26.4\" cy=\"52\" r=\"4.2\" fill=\"url(#rf5b928)\" stroke=\"#9f781a\" stroke-opacity=\".4\" stroke-width=\".7\"/>","➗":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"4\" y=\"4\" width=\"56\" height=\"56\" rx=\"12\" fill=\"url(#g3b82f601)\" stroke=\"#2654a0\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"5\" y=\"5\" width=\"54\" height=\"23.5\" rx=\"11\" fill=\"#fff\" opacity=\".22\"/><rect x=\"14\" y=\"29\" width=\"36\" height=\"6\" rx=\"3\" fill=\"#fff\"/><circle cx=\"32\" cy=\"17\" r=\"4.4\" fill=\"url(#rfff)\" stroke=\"#a6a6a6\" stroke-opacity=\".4\" stroke-width=\".7\"/><circle cx=\"32\" cy=\"47\" r=\"4.4\" fill=\"url(#rfff)\" stroke=\"#a6a6a6\" stroke-opacity=\".4\" stroke-width=\".7\"/>","➕":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"4\" y=\"4\" width=\"56\" height=\"56\" rx=\"12\" fill=\"url(#g22b45f01)\" stroke=\"#16753e\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"5\" y=\"5\" width=\"54\" height=\"23.5\" rx=\"11\" fill=\"#fff\" opacity=\".22\"/><rect x=\"13\" y=\"29\" width=\"38\" height=\"6.4\" rx=\"3.2\" fill=\"#fff\"/><rect x=\"28.8\" y=\"13\" width=\"6.4\" height=\"38\" rx=\"3.2\" fill=\"#fff\"/>","➖":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"4\" y=\"4\" width=\"56\" height=\"56\" rx=\"12\" fill=\"url(#gf5a62301)\" stroke=\"#9f6c17\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"5\" y=\"5\" width=\"54\" height=\"23.5\" rx=\"11\" fill=\"#fff\" opacity=\".22\"/><rect x=\"13\" y=\"29\" width=\"38\" height=\"6.4\" rx=\"3.2\" fill=\"#fff\"/>","✖":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"4\" y=\"4\" width=\"56\" height=\"56\" rx=\"12\" fill=\"url(#gef444401)\" stroke=\"#9b2c2c\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"5\" y=\"5\" width=\"54\" height=\"23.5\" rx=\"11\" fill=\"#fff\" opacity=\".22\"/><path d=\"M18 18 L46 46 M46 18 L18 46\" fill=\"none\" stroke=\"#fff\" stroke-width=\"6.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>","📈":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"4\" y=\"6\" width=\"56\" height=\"50\" rx=\"6\" fill=\"url(#gffffff01)\" stroke=\"#a6a6a6\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"5\" y=\"7\" width=\"54\" height=\"21.0\" rx=\"5\" fill=\"#fff\" opacity=\".22\"/><path d=\"M8 16 H56\" stroke=\"#dfe6f5\" stroke-width=\"1\"/><path d=\"M8 26 H56\" stroke=\"#dfe6f5\" stroke-width=\"1\"/><path d=\"M8 36 H56\" stroke=\"#dfe6f5\" stroke-width=\"1\"/><path d=\"M8 46 H56\" stroke=\"#dfe6f5\" stroke-width=\"1\"/><path d=\"M10 46 L24 32 L34 40 L52 16\" fill=\"none\" stroke=\"#22b45f\" stroke-width=\"5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M44 14 L56 12 L54 24Z\" fill=\"url(#g22b45f01)\" stroke=\"#16753e\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><circle cx=\"24\" cy=\"32\" r=\"3.4\" fill=\"url(#rfff)\" stroke=\"#a6a6a6\" stroke-opacity=\".4\" stroke-width=\".7\"/><circle cx=\"34\" cy=\"40\" r=\"3.4\" fill=\"url(#rfff)\" stroke=\"#a6a6a6\" stroke-opacity=\".4\" stroke-width=\".7\"/>","📉":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"4\" y=\"6\" width=\"56\" height=\"50\" rx=\"6\" fill=\"url(#gffffff01)\" stroke=\"#a6a6a6\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"5\" y=\"7\" width=\"54\" height=\"21.0\" rx=\"5\" fill=\"#fff\" opacity=\".22\"/><path d=\"M8 16 H56\" stroke=\"#dfe6f5\" stroke-width=\"1\"/><path d=\"M8 26 H56\" stroke=\"#dfe6f5\" stroke-width=\"1\"/><path d=\"M8 36 H56\" stroke=\"#dfe6f5\" stroke-width=\"1\"/><path d=\"M8 46 H56\" stroke=\"#dfe6f5\" stroke-width=\"1\"/><path d=\"M10 16 L24 30 L34 22 L52 46\" fill=\"none\" stroke=\"#ef4444\" stroke-width=\"5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M44 48 L56 50 L54 38Z\" fill=\"url(#gef444401)\" stroke=\"#9b2c2c\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><circle cx=\"24\" cy=\"30\" r=\"3.4\" fill=\"url(#rfff)\" stroke=\"#a6a6a6\" stroke-opacity=\".4\" stroke-width=\".7\"/><circle cx=\"34\" cy=\"22\" r=\"3.4\" fill=\"url(#rfff)\" stroke=\"#a6a6a6\" stroke-opacity=\".4\" stroke-width=\".7\"/>","💹":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"4\" y=\"6\" width=\"56\" height=\"50\" rx=\"6\" fill=\"url(#g17324d01)\" stroke=\"#0f2032\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"5\" y=\"7\" width=\"54\" height=\"21.0\" rx=\"5\" fill=\"#fff\" opacity=\".22\"/><path d=\"M10 44 L22 32 L32 38 L50 16\" fill=\"none\" stroke=\"#3be08a\" stroke-width=\"4.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M42 14 L54 12 L52 24Z\" fill=\"url(#g3be08a01)\" stroke=\"#26925a\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><rect x=\"10\" y=\"40\" width=\"5\" height=\"6\" rx=\"1.5\" fill=\"#2a7a53\"/><rect x=\"19\" y=\"36\" width=\"5\" height=\"10\" rx=\"1.5\" fill=\"#2a7a53\"/><rect x=\"28\" y=\"32\" width=\"5\" height=\"14\" rx=\"1.5\" fill=\"#2a7a53\"/><rect x=\"37\" y=\"28\" width=\"5\" height=\"18\" rx=\"1.5\" fill=\"#2a7a53\"/><rect x=\"46\" y=\"24\" width=\"5\" height=\"22\" rx=\"1.5\" fill=\"#2a7a53\"/><text x=\"50\" y=\"50\" text-anchor=\"middle\" font-family=\"Arial Black,Arial,sans-serif\" font-weight=\"900\" font-size=\"11\" fill=\"#ffe27a\">¥</text>","✅":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"4\" y=\"4\" width=\"56\" height=\"56\" rx=\"13\" fill=\"url(#g22b45f01)\" stroke=\"#16753e\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"5\" y=\"5\" width=\"54\" height=\"23.5\" rx=\"12\" fill=\"#fff\" opacity=\".22\"/><path d=\"M16 33 L28 45 L49 20\" fill=\"none\" stroke=\"#fff\" stroke-width=\"8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>","❌":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><circle cx=\"32\" cy=\"31\" r=\"26\" fill=\"url(#ref4444)\" stroke=\"#9b2c2c\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"24.2\" cy=\"21.119999999999997\" rx=\"11.700000000000001\" ry=\"6.76\" transform=\"rotate(-30 24.2 21.119999999999997)\" fill=\"url(#hl)\" opacity=\"0.95\"/><path d=\"M21 20 L43 42 M43 20 L21 42\" fill=\"none\" stroke=\"#fff\" stroke-width=\"6.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>","🚫":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><circle cx=\"32\" cy=\"31\" r=\"26\" fill=\"url(#ref4444)\" stroke=\"#9b2c2c\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"24.2\" cy=\"21.119999999999997\" rx=\"11.700000000000001\" ry=\"6.76\" transform=\"rotate(-30 24.2 21.119999999999997)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"32\" cy=\"31\" r=\"18\" fill=\"url(#rfff)\" stroke=\"#a6a6a6\" stroke-opacity=\".4\" stroke-width=\".7\"/><circle cx=\"32\" cy=\"31\" r=\"18\" fill=\"none\" stroke=\"#ef4444\" stroke-width=\"5\"/><path d=\"M20 43 L44 19\" fill=\"none\" stroke=\"#ef4444\" stroke-width=\"5.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>","⛔":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><circle cx=\"32\" cy=\"31\" r=\"26\" fill=\"url(#re0262d)\" stroke=\"#92191d\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"24.2\" cy=\"21.119999999999997\" rx=\"11.700000000000001\" ry=\"6.76\" transform=\"rotate(-30 24.2 21.119999999999997)\" fill=\"url(#hl)\" opacity=\"0.95\"/><rect x=\"13\" y=\"26\" width=\"38\" height=\"10\" rx=\"5\" fill=\"#fff\"/>","⬇":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"4\" y=\"4\" width=\"56\" height=\"56\" rx=\"13\" fill=\"url(#g3b82f601)\" stroke=\"#2654a0\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"5\" y=\"5\" width=\"54\" height=\"23.5\" rx=\"12\" fill=\"#fff\" opacity=\".22\"/><path d=\"M26 14 H38 V30 H46 L32 48 L18 30 H26Z\" fill=\"url(#gffffff01)\" stroke=\"#a6a6a6\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/>","⬆":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"4\" y=\"4\" width=\"56\" height=\"56\" rx=\"13\" fill=\"url(#gf5883b01)\" stroke=\"#9f5826\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"5\" y=\"5\" width=\"54\" height=\"23.5\" rx=\"12\" fill=\"#fff\" opacity=\".22\"/><path d=\"M26 48 H38 V32 H46 L32 14 L18 32 H26Z\" fill=\"url(#gffffff01)\" stroke=\"#a6a6a6\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/>","📥":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M6 36 L14 22 H50 L58 36 V52 a4 4 0 0 1-4 4 H10 a4 4 0 0 1-4-4Z\" fill=\"url(#g8fb4f501)\" stroke=\"#5d759f\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M6 36 H22 a3 3 0 0 1 3 3 a7 7 0 0 0 14 0 a3 3 0 0 1 3-3 H58 V52 a4 4 0 0 1-4 4 H10 a4 4 0 0 1-4-4Z\" fill=\"url(#g5e8fe801)\" stroke=\"#3d5d97\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M27 4 H37 V16 H44 L32 29 L20 16 H27Z\" fill=\"url(#g22b45f01)\" stroke=\"#16753e\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/>","📤":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M6 38 L14 24 H50 L58 38 V54 a4 4 0 0 1-4 4 H10 a4 4 0 0 1-4-4Z\" fill=\"url(#g8fb4f501)\" stroke=\"#5d759f\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M6 38 H22 a3 3 0 0 1 3 3 a7 7 0 0 0 14 0 a3 3 0 0 1 3-3 H58 V54 a4 4 0 0 1-4 4 H10 a4 4 0 0 1-4-4Z\" fill=\"url(#g5e8fe801)\" stroke=\"#3d5d97\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M27 30 H37 V18 H44 L32 4 L20 18 H27Z\" fill=\"url(#gf5883b01)\" stroke=\"#9f5826\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/>","🔄":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><circle cx=\"32\" cy=\"31\" r=\"26\" fill=\"url(#r3b82f6)\" stroke=\"#2654a0\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"24.2\" cy=\"21.119999999999997\" rx=\"11.700000000000001\" ry=\"6.76\" transform=\"rotate(-30 24.2 21.119999999999997)\" fill=\"url(#hl)\" opacity=\"0.95\"/><path d=\"M20 31 a12 12 0 0 1 21-8\" fill=\"none\" stroke=\"#fff\" stroke-width=\"5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M43 14 L44 28 L31 24Z\" fill=\"url(#gfff01)\" stroke=\"#a6a6a6\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M44 31 a12 12 0 0 1-21 8\" fill=\"none\" stroke=\"#fff\" stroke-width=\"5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M21 48 L20 34 L33 38Z\" fill=\"url(#gfff01)\" stroke=\"#a6a6a6\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/>","🔁":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"4\" y=\"10\" width=\"56\" height=\"44\" rx=\"12\" fill=\"url(#g22b45f01)\" stroke=\"#16753e\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"5\" y=\"11\" width=\"54\" height=\"18.5\" rx=\"11\" fill=\"#fff\" opacity=\".22\"/><path d=\"M16 28 V26 a6 6 0 0 1 6-6 H44\" fill=\"none\" stroke=\"#fff\" stroke-width=\"5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M42 12 L54 20 L42 28Z\" fill=\"url(#gfff01)\" stroke=\"#a6a6a6\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M48 36 V38 a6 6 0 0 1-6 6 H20\" fill=\"none\" stroke=\"#fff\" stroke-width=\"5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M22 36 L10 44 L22 52Z\" fill=\"url(#gfff01)\" stroke=\"#a6a6a6\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/>","♻":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><circle cx=\"32\" cy=\"31\" r=\"26\" fill=\"url(#r2fb344)\" stroke=\"#1f742c\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"24.2\" cy=\"21.119999999999997\" rx=\"11.700000000000001\" ry=\"6.76\" transform=\"rotate(-30 24.2 21.119999999999997)\" fill=\"url(#hl)\" opacity=\"0.95\"/><path d=\"M32 14 L40 28 M45 36 L36 46 H26 M24 40 L18 30 L24 22\" fill=\"none\" stroke=\"#fff\" stroke-width=\"5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M38 24 L48 30 L36 34Z\" fill=\"url(#gfff01)\" stroke=\"#a6a6a6\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M30 52 L20 46 L30 40Z\" fill=\"url(#gfff01)\" stroke=\"#a6a6a6\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M14 24 L26 18 L24 30Z\" fill=\"url(#gfff01)\" stroke=\"#a6a6a6\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/>","🔙":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"4\" y=\"4\" width=\"56\" height=\"56\" rx=\"13\" fill=\"url(#g8b5cf601)\" stroke=\"#5a3ca0\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"5\" y=\"5\" width=\"54\" height=\"23.5\" rx=\"12\" fill=\"#fff\" opacity=\".22\"/><path d=\"M30 14 L10 30 L30 46 V36 H50 V24 H30Z\" fill=\"url(#gffffff01)\" stroke=\"#a6a6a6\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><text x=\"32\" y=\"58\" text-anchor=\"middle\" font-family=\"Arial Black,Arial,sans-serif\" font-weight=\"900\" font-size=\"7\" fill=\"#fff\">BACK</text>","⏸":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><circle cx=\"32\" cy=\"31\" r=\"26\" fill=\"url(#rf59e0b)\" stroke=\"#9f6707\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"24.2\" cy=\"21.119999999999997\" rx=\"11.700000000000001\" ry=\"6.76\" transform=\"rotate(-30 24.2 21.119999999999997)\" fill=\"url(#hl)\" opacity=\"0.95\"/><rect x=\"20\" y=\"18\" width=\"8\" height=\"26\" rx=\"2.5\" fill=\"#fff\"/><rect x=\"36\" y=\"18\" width=\"8\" height=\"26\" rx=\"2.5\" fill=\"#fff\"/>","🔲":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"6\" y=\"6\" width=\"52\" height=\"52\" rx=\"10\" fill=\"url(#g1f293701)\" stroke=\"#141b24\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"7\" y=\"7\" width=\"50\" height=\"21.8\" rx=\"9\" fill=\"#fff\" opacity=\".22\"/><rect x=\"15\" y=\"15\" width=\"34\" height=\"34\" rx=\"5\" fill=\"url(#g4b556301)\" stroke=\"#313740\" stroke-opacity=\".45\" stroke-width=\".8\"/>","⚪":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><circle cx=\"32\" cy=\"31\" r=\"25\" fill=\"url(#re5e9f2)\" stroke=\"#95979d\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"24.5\" cy=\"21.5\" rx=\"11.25\" ry=\"6.5\" transform=\"rotate(-30 24.5 21.5)\" fill=\"url(#hl)\" opacity=\"0.95\"/>","🔴":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><circle cx=\"32\" cy=\"31\" r=\"25\" fill=\"url(#ree3b3b)\" stroke=\"#9b2626\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"24.5\" cy=\"21.5\" rx=\"11.25\" ry=\"6.5\" transform=\"rotate(-30 24.5 21.5)\" fill=\"url(#hl)\" opacity=\"0.95\"/>","🟡":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><circle cx=\"32\" cy=\"31\" r=\"25\" fill=\"url(#rf7c52b)\" stroke=\"#a1801c\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"24.5\" cy=\"21.5\" rx=\"11.25\" ry=\"6.5\" transform=\"rotate(-30 24.5 21.5)\" fill=\"url(#hl)\" opacity=\"0.95\"/>","🟢":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><circle cx=\"32\" cy=\"31\" r=\"25\" fill=\"url(#r2fc464)\" stroke=\"#1f7f41\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"24.5\" cy=\"21.5\" rx=\"11.25\" ry=\"6.5\" transform=\"rotate(-30 24.5 21.5)\" fill=\"url(#hl)\" opacity=\"0.95\"/>","🔻":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><polygon points=\"6,12 58,12 32,54\" fill=\"url(#gee3b3b01)\" stroke=\"#9b2626\" stroke-opacity=\".45\" stroke-width=\".8\" stroke-linejoin=\"round\"/><polygon points=\"12,15 52,15 32,47\" fill=\"#fff\" opacity=\".16\"/>","🔺":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><polygon points=\"32,8 58,52 6,52\" fill=\"url(#gee3b3b01)\" stroke=\"#9b2626\" stroke-opacity=\".45\" stroke-width=\".8\" stroke-linejoin=\"round\"/><polygon points=\"32,14 49,44 15,44\" fill=\"#fff\" opacity=\".16\"/>","📌":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><circle cx=\"32\" cy=\"24\" r=\"15\" fill=\"url(#ree3b3b)\" stroke=\"#9b2626\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"27.5\" cy=\"18.3\" rx=\"6.75\" ry=\"3.9000000000000004\" transform=\"rotate(-30 27.5 18.3)\" fill=\"url(#hl)\" opacity=\"0.95\"/><path d=\"M27 36 H37 L34 46 H30Z\" fill=\"url(#gcdd3df01)\" stroke=\"#858991\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M31 44 H33 L32 60Z\" fill=\"url(#g8b93a501)\" stroke=\"#5a606b\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><circle cx=\"32\" cy=\"24\" r=\"6\" fill=\"url(#rff8a8a)\" stroke=\"#a65a5a\" stroke-opacity=\".4\" stroke-width=\".7\"/>","📍":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M32 4 C19 4 11 13 11 24 C11 38 26 48 32 60 C38 48 53 38 53 24 C53 13 45 4 32 4Z\" fill=\"url(#gee3b3b01)\" stroke=\"#9b2626\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><circle cx=\"32\" cy=\"24\" r=\"9\" fill=\"url(#rfff)\" stroke=\"#a6a6a6\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"22\" cy=\"14\" rx=\"5\" ry=\"8\" transform=\"rotate(20 22 14)\" fill=\"url(#hl)\" opacity=\"0.7\"/>","🔗":"<g transform=\"rotate(-40 32 32)\"><ellipse cx=\"32\" cy=\"60\" rx=\"16\" ry=\"3\" fill=\"url(#shd)\"/><rect x=\"4\" y=\"22\" width=\"32\" height=\"20\" rx=\"10\" fill=\"url(#g3b82f601)\" stroke=\"#2654a0\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"5\" y=\"23\" width=\"30\" height=\"8.4\" rx=\"9\" fill=\"#fff\" opacity=\".22\"/><rect x=\"26\" y=\"22\" width=\"32\" height=\"20\" rx=\"10\" fill=\"url(#g22b45f01)\" stroke=\"#16753e\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"27\" y=\"23\" width=\"30\" height=\"8.4\" rx=\"9\" fill=\"#fff\" opacity=\".22\"/><rect x=\"12\" y=\"28\" width=\"20\" height=\"8\" rx=\"4\" fill=\"url(#gcfe2ff01)\" stroke=\"#8793a6\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"32\" y=\"28\" width=\"20\" height=\"8\" rx=\"4\" fill=\"url(#gd4ffe201)\" stroke=\"#8aa693\" stroke-opacity=\".45\" stroke-width=\".8\"/></g>","🔔":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M32 5 C20 5 16 15 16 28 C16 38 10 40 8 46 H56 C54 40 48 38 48 28 C48 15 44 5 32 5Z\" fill=\"url(#gf7b92801)\" stroke=\"#a1781a\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><circle cx=\"32\" cy=\"53\" r=\"6.5\" fill=\"url(#rd9890c)\" stroke=\"#8d5908\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"30.05\" cy=\"50.53\" rx=\"2.9250000000000003\" ry=\"1.69\" transform=\"rotate(-30 30.05 50.53)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"32\" cy=\"6\" r=\"3.4\" fill=\"url(#rf7b928)\" stroke=\"#a1781a\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"24\" cy=\"20\" rx=\"4\" ry=\"10\" transform=\"rotate(12 24 20)\" fill=\"url(#hl)\" opacity=\"0.7\"/>","📞":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><g transform=\"rotate(-20 32 32)\"><path d=\"M6 22 C6 14 22 10 32 10 C42 10 58 14 58 22 V28 a4 4 0 0 1-4 4 H48 a4 4 0 0 1-4-4 V24 C38 22 26 22 20 24 V28 a4 4 0 0 1-4 4 H10 a4 4 0 0 1-4-4Z\" fill=\"url(#g2fc46401)\" stroke=\"#1f7f41\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/></g><rect x=\"22\" y=\"40\" width=\"20\" height=\"18\" rx=\"4\" fill=\"url(#g37415101)\" stroke=\"#242a35\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"23\" y=\"41\" width=\"18\" height=\"7.6\" rx=\"3\" fill=\"#fff\" opacity=\".22\"/><circle cx=\"26\" cy=\"45\" r=\"1.5\" fill=\"#d1d5db\"/><circle cx=\"32\" cy=\"45\" r=\"1.5\" fill=\"#d1d5db\"/><circle cx=\"38\" cy=\"45\" r=\"1.5\" fill=\"#d1d5db\"/><circle cx=\"26\" cy=\"50\" r=\"1.5\" fill=\"#d1d5db\"/><circle cx=\"32\" cy=\"50\" r=\"1.5\" fill=\"#d1d5db\"/><circle cx=\"38\" cy=\"50\" r=\"1.5\" fill=\"#d1d5db\"/><circle cx=\"26\" cy=\"55\" r=\"1.5\" fill=\"#d1d5db\"/><circle cx=\"32\" cy=\"55\" r=\"1.5\" fill=\"#d1d5db\"/><circle cx=\"38\" cy=\"55\" r=\"1.5\" fill=\"#d1d5db\"/>","🔒":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M20 28 V20 a12 12 0 0 1 24 0 V28\" fill=\"none\" stroke=\"#aab3c5\" stroke-width=\"6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><rect x=\"10\" y=\"26\" width=\"44\" height=\"32\" rx=\"7\" fill=\"url(#gf6b21b01)\" stroke=\"#a07412\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"11\" y=\"27\" width=\"42\" height=\"13.4\" rx=\"6\" fill=\"#fff\" opacity=\".22\"/><circle cx=\"32\" cy=\"40\" r=\"5\" fill=\"url(#r7a4a05)\" stroke=\"#4f3003\" stroke-opacity=\".4\" stroke-width=\".7\"/><rect x=\"30\" y=\"42\" width=\"4\" height=\"9\" rx=\"2\" fill=\"#7a4a05\"/>","🔌":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"18\" y=\"4\" width=\"6\" height=\"16\" rx=\"2\" fill=\"url(#gc2c9d601)\" stroke=\"#7e838b\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"40\" y=\"4\" width=\"6\" height=\"16\" rx=\"2\" fill=\"url(#gc2c9d601)\" stroke=\"#7e838b\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"10\" y=\"18\" width=\"44\" height=\"26\" rx=\"8\" fill=\"url(#g3b82f601)\" stroke=\"#2654a0\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"11\" y=\"19\" width=\"42\" height=\"10.9\" rx=\"7\" fill=\"#fff\" opacity=\".22\"/><path d=\"M22 44 H42 V50 a6 6 0 0 1-6 6 H28 a6 6 0 0 1-6-6Z\" fill=\"url(#g2f6fd901)\" stroke=\"#1f488d\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M32 56 V62\" fill=\"none\" stroke=\"#4b5563\" stroke-width=\"5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>","⚡":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M38 2 L10 36 H28 L22 62 L54 24 H34Z\" fill=\"url(#gf7c52b01)\" stroke=\"#a1801c\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M38 8 L18 34 H30\" stroke=\"#fff\" stroke-opacity=\".6\" stroke-width=\"2\" fill=\"none\" stroke-linecap=\"round\"/>","💥":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M32 2 L38 16 L52 8 L46 24 L62 28 L46 36 L56 52 L40 46 L34 62 L28 46 L12 56 L20 38 L2 34 L20 26 L10 10 L26 18Z\" fill=\"url(#gff8a1f01)\" stroke=\"#a65a14\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M32 16 L36 26 L46 22 L40 32 L50 38 L38 38 L32 50 L28 38 L16 42 L24 32 L16 24 L28 26Z\" fill=\"url(#gffd43b01)\" stroke=\"#a68a26\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/>","🔥":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M32 2 C34 14 50 20 50 38 C50 52 42 60 32 60 C22 60 14 52 14 38 C14 28 20 24 22 14 C26 18 28 22 28 26 C32 20 34 12 32 2Z\" fill=\"url(#gff6a1f01)\" stroke=\"#a64514\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M32 30 C34 38 42 40 42 48 C42 54 38 58 32 58 C26 58 22 54 22 48 C22 42 28 40 32 30Z\" fill=\"url(#gffd43b01)\" stroke=\"#a68a26\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M32 44 C34 48 37 49 37 53 C37 56 35 58 32 58 C29 58 27 56 27 53 C27 49 30 48 32 44Z\" fill=\"url(#gfff4b801)\" stroke=\"#a69f78\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/>","🎯":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><circle cx=\"32\" cy=\"31\" r=\"26\" fill=\"url(#ree3b3b)\" stroke=\"#9b2626\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"24.2\" cy=\"21.119999999999997\" rx=\"11.700000000000001\" ry=\"6.76\" transform=\"rotate(-30 24.2 21.119999999999997)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"32\" cy=\"31\" r=\"19\" fill=\"url(#rfff)\" stroke=\"#a6a6a6\" stroke-opacity=\".4\" stroke-width=\".7\"/><circle cx=\"32\" cy=\"31\" r=\"13\" fill=\"url(#ree3b3b)\" stroke=\"#9b2626\" stroke-opacity=\".4\" stroke-width=\".7\"/><circle cx=\"32\" cy=\"31\" r=\"7\" fill=\"url(#rfff)\" stroke=\"#a6a6a6\" stroke-opacity=\".4\" stroke-width=\".7\"/><circle cx=\"32\" cy=\"31\" r=\"3.4\" fill=\"url(#ree3b3b)\" stroke=\"#9b2626\" stroke-opacity=\".4\" stroke-width=\".7\"/><path d=\"M32 31 L56 6\" fill=\"none\" stroke=\"#8a5a2b\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M52 2 L62 4 L58 14 L54 10 L50 8Z\" fill=\"url(#g3b82f601)\" stroke=\"#2654a0\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/>","🏁":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"8\" y=\"4\" width=\"5\" height=\"56\" rx=\"2.5\" fill=\"url(#g9aa3b501)\" stroke=\"#646a76\" stroke-opacity=\".45\" stroke-width=\".8\"/><path d=\"M13 8 H56 V36 H13Z\" fill=\"url(#gffffff01)\" stroke=\"#a6a6a6\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><rect x=\"13.0\" y=\"8\" width=\"10.75\" height=\"7\" fill=\"#1f2937\"/><rect x=\"34.5\" y=\"8\" width=\"10.75\" height=\"7\" fill=\"#1f2937\"/><rect x=\"23.8\" y=\"15\" width=\"10.75\" height=\"7\" fill=\"#1f2937\"/><rect x=\"45.2\" y=\"15\" width=\"10.75\" height=\"7\" fill=\"#1f2937\"/><rect x=\"13.0\" y=\"22\" width=\"10.75\" height=\"7\" fill=\"#1f2937\"/><rect x=\"34.5\" y=\"22\" width=\"10.75\" height=\"7\" fill=\"#1f2937\"/><rect x=\"23.8\" y=\"29\" width=\"10.75\" height=\"7\" fill=\"#1f2937\"/><rect x=\"45.2\" y=\"29\" width=\"10.75\" height=\"7\" fill=\"#1f2937\"/>","🎌":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M8 6 L52 58\" fill=\"none\" stroke=\"#a46b3a\" stroke-width=\"3.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M56 6 L12 58\" fill=\"none\" stroke=\"#a46b3a\" stroke-width=\"3.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M10 6 H36 V24 H10Z\" fill=\"url(#gee3b3b01)\" stroke=\"#9b2626\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><circle cx=\"23\" cy=\"15\" r=\"5\" fill=\"url(#rfff)\" stroke=\"#a6a6a6\" stroke-opacity=\".4\" stroke-width=\".7\"/><path d=\"M28 6 H54 V24 H28Z\" fill=\"url(#g3b82f601)\" stroke=\"#2654a0\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><rect x=\"34\" y=\"12\" width=\"14\" height=\"3\" fill=\"#fff\"/><rect x=\"34\" y=\"17\" width=\"14\" height=\"3\" fill=\"#fff\"/>","🚀":"<ellipse cx=\"32\" cy=\"60\" rx=\"14\" ry=\"2.5\" fill=\"url(#shd)\"/><path d=\"M32 2 C44 10 48 28 44 44 H20 C16 28 20 10 32 2Z\" fill=\"url(#gffffff01)\" stroke=\"#9d9fa3\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><circle cx=\"32\" cy=\"24\" r=\"7.5\" fill=\"url(#r3b82f6)\" stroke=\"#2654a0\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"29.75\" cy=\"21.15\" rx=\"3.375\" ry=\"1.9500000000000002\" transform=\"rotate(-30 29.75 21.15)\" fill=\"url(#hl)\" opacity=\"0.95\"/><path d=\"M20 34 L8 46 L8 54 L22 46Z\" fill=\"url(#gee3b3b01)\" stroke=\"#9b2626\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M44 34 L56 46 L56 54 L42 46Z\" fill=\"url(#gee3b3b01)\" stroke=\"#9b2626\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M24 44 H40 L36 52 H28Z\" fill=\"url(#g8a93a801)\" stroke=\"#5a606d\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M32 62 C26 56 28 52 32 50 C36 52 38 56 32 62Z\" fill=\"url(#gff9a1f01)\" stroke=\"#a66414\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M32 58 C29 55 30 53 32 52 C34 53 35 55 32 58Z\" fill=\"url(#gffe27a01)\" stroke=\"#a6934f\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/>","🔧":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><g transform=\"rotate(45 32 32)\"><rect x=\"27\" y=\"24\" width=\"10\" height=\"38\" rx=\"5\" fill=\"url(#g9aa6ba01)\" stroke=\"#646c79\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"28\" y=\"25\" width=\"8\" height=\"16.0\" rx=\"4\" fill=\"#fff\" opacity=\".22\"/><path d=\"M18 2 H27 V16 a5 5 0 0 0 10 0 V2 H46 V20 a14 14 0 0 1-28 0Z\" fill=\"url(#gb9c3d601)\" stroke=\"#787f8b\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/></g>","🛠":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><g transform=\"rotate(45 32 32)\"><rect x=\"28\" y=\"20\" width=\"8\" height=\"42\" rx=\"4\" fill=\"url(#ge5484d01)\" stroke=\"#952f32\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"29\" y=\"21\" width=\"6\" height=\"17.6\" rx=\"3\" fill=\"#fff\" opacity=\".22\"/><path d=\"M20 2 H44 V16 a12 12 0 0 1-24 0Z\" fill=\"url(#g9aa6ba01)\" stroke=\"#646c79\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/></g><g transform=\"rotate(-45 32 32)\"><rect x=\"28\" y=\"4\" width=\"8\" height=\"56\" rx=\"4\" fill=\"url(#gf5a62301)\" stroke=\"#9f6c17\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"29\" y=\"5\" width=\"6\" height=\"23.5\" rx=\"3\" fill=\"#fff\" opacity=\".22\"/><rect x=\"24\" y=\"2\" width=\"16\" height=\"12\" rx=\"3\" fill=\"url(#g8a93a801)\" stroke=\"#5a606d\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"25\" y=\"3\" width=\"14\" height=\"5.0\" rx=\"2\" fill=\"#fff\" opacity=\".22\"/></g>","🔩":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M32 4 L50 14 V34 L32 44 L14 34 V14Z\" fill=\"url(#gc5cddd01)\" stroke=\"#808590\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><circle cx=\"32\" cy=\"24\" r=\"8\" fill=\"url(#r667089)\" stroke=\"#424959\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"29.6\" cy=\"20.96\" rx=\"3.6\" ry=\"2.08\" transform=\"rotate(-30 29.6 20.96)\" fill=\"url(#hl)\" opacity=\"0.95\"/><rect x=\"26\" y=\"40\" width=\"12\" height=\"22\" rx=\"3\" fill=\"url(#g8a93a801)\" stroke=\"#5a606d\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"27\" y=\"41\" width=\"10\" height=\"9.2\" rx=\"2\" fill=\"#fff\" opacity=\".22\"/><path d=\"M26 46 H38\" fill=\"none\" stroke=\"#5b6577\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M26 51 H38\" fill=\"none\" stroke=\"#5b6577\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M26 56 H38\" fill=\"none\" stroke=\"#5b6577\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>","🎚":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"4\" y=\"6\" width=\"56\" height=\"52\" rx=\"9\" fill=\"url(#g8b5cf601)\" stroke=\"#5a3ca0\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"5\" y=\"7\" width=\"54\" height=\"21.8\" rx=\"8\" fill=\"#fff\" opacity=\".22\"/><rect x=\"14\" y=\"14\" width=\"4.5\" height=\"36\" rx=\"2.2\" fill=\"#3c2a7a\"/><rect x=\"28\" y=\"14\" width=\"4.5\" height=\"36\" rx=\"2.2\" fill=\"#3c2a7a\"/><rect x=\"42\" y=\"14\" width=\"4.5\" height=\"36\" rx=\"2.2\" fill=\"#3c2a7a\"/><rect x=\"56\" y=\"14\" width=\"4.5\" height=\"36\" rx=\"2.2\" fill=\"#3c2a7a\"/><rect x=\"10\" y=\"22\" width=\"12\" height=\"8\" rx=\"3\" fill=\"url(#gffe27a01)\" stroke=\"#a6934f\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"11\" y=\"23\" width=\"10\" height=\"3.4\" rx=\"2\" fill=\"#fff\" opacity=\".22\"/><rect x=\"24\" y=\"34\" width=\"12\" height=\"8\" rx=\"3\" fill=\"url(#g7cf0b001)\" stroke=\"#519c72\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"25\" y=\"35\" width=\"10\" height=\"3.4\" rx=\"2\" fill=\"#fff\" opacity=\".22\"/><rect x=\"38\" y=\"18\" width=\"12\" height=\"8\" rx=\"3\" fill=\"url(#gff9db001)\" stroke=\"#a66672\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"39\" y=\"19\" width=\"10\" height=\"3.4\" rx=\"2\" fill=\"#fff\" opacity=\".22\"/><rect x=\"52\" y=\"30\" width=\"6\" height=\"8\" rx=\"2\" fill=\"url(#g8fe0ff01)\" stroke=\"#5d92a6\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"53\" y=\"31\" width=\"4\" height=\"3.4\" rx=\"1\" fill=\"#fff\" opacity=\".22\"/>","🚗":"<ellipse cx=\"32\" cy=\"58\" rx=\"26\" ry=\"3\" fill=\"url(#shd)\"/><path d=\"M4 40 C4 34 8 32 12 30 L18 20 C20 17 23 16 26 16 H40 C43 16 46 17 48 20 L54 30 C58 32 60 34 60 40 V46 H4Z\" fill=\"url(#gee3b3b01)\" stroke=\"#9b2626\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M20 22 H30 V30 H15Z\" fill=\"url(#gd4efff01)\" stroke=\"#7c96a6\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M34 22 H44 L50 30 H34Z\" fill=\"url(#gd4efff01)\" stroke=\"#7c96a6\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><circle cx=\"16\" cy=\"46\" r=\"7.5\" fill=\"url(#r2b3342)\" stroke=\"#1c212b\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"13.75\" cy=\"43.15\" rx=\"3.375\" ry=\"1.9500000000000002\" transform=\"rotate(-30 13.75 43.15)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"16\" cy=\"46\" r=\"3.2\" fill=\"url(#rd1d5db)\" stroke=\"#888a8e\" stroke-opacity=\".4\" stroke-width=\".7\"/><circle cx=\"48\" cy=\"46\" r=\"7.5\" fill=\"url(#r2b3342)\" stroke=\"#1c212b\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"45.75\" cy=\"43.15\" rx=\"3.375\" ry=\"1.9500000000000002\" transform=\"rotate(-30 45.75 43.15)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"48\" cy=\"46\" r=\"3.2\" fill=\"url(#rd1d5db)\" stroke=\"#888a8e\" stroke-opacity=\".4\" stroke-width=\".7\"/><rect x=\"54\" y=\"34\" width=\"6\" height=\"5\" rx=\"2\" fill=\"url(#gffe27a01)\" stroke=\"#a6934f\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"4\" y=\"34\" width=\"5\" height=\"5\" rx=\"2\" fill=\"url(#gff9a9a01)\" stroke=\"#a66464\" stroke-opacity=\".45\" stroke-width=\".8\"/>","🛵":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><circle cx=\"14\" cy=\"48\" r=\"9\" fill=\"url(#r2b3342)\" stroke=\"#1c212b\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"11.3\" cy=\"44.58\" rx=\"4.05\" ry=\"2.34\" transform=\"rotate(-30 11.3 44.58)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"14\" cy=\"48\" r=\"3.6\" fill=\"url(#rd1d5db)\" stroke=\"#888a8e\" stroke-opacity=\".4\" stroke-width=\".7\"/><circle cx=\"50\" cy=\"48\" r=\"9\" fill=\"url(#r2b3342)\" stroke=\"#1c212b\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"47.3\" cy=\"44.58\" rx=\"4.05\" ry=\"2.34\" transform=\"rotate(-30 47.3 44.58)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"50\" cy=\"48\" r=\"3.6\" fill=\"url(#rd1d5db)\" stroke=\"#888a8e\" stroke-opacity=\".4\" stroke-width=\".7\"/><path d=\"M10 44 C10 34 20 32 28 32 L44 32 L50 14 H44 V10 H56 L48 40 L50 46 H30 L26 40 H14 L12 44Z\" fill=\"url(#g14b8a601)\" stroke=\"#0d786c\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><rect x=\"26\" y=\"22\" width=\"16\" height=\"10\" rx=\"4\" fill=\"url(#gf5a62301)\" stroke=\"#9f6c17\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"27\" y=\"23\" width=\"14\" height=\"4.2\" rx=\"3\" fill=\"#fff\" opacity=\".22\"/><path d=\"M44 12 H56\" fill=\"none\" stroke=\"#374151\" stroke-width=\"3.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"54\" cy=\"12\" r=\"3\" fill=\"url(#rffe27a)\" stroke=\"#a6934f\" stroke-opacity=\".4\" stroke-width=\".7\"/>","🖨":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"16\" y=\"4\" width=\"32\" height=\"18\" rx=\"2.5\" fill=\"url(#gfbfcff01)\" stroke=\"#a3a4a6\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"17\" y=\"5\" width=\"30\" height=\"7.6\" rx=\"1.5\" fill=\"#fff\" opacity=\".22\"/><rect x=\"4\" y=\"20\" width=\"56\" height=\"28\" rx=\"7\" fill=\"url(#g8a93a801)\" stroke=\"#5a606d\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"5\" y=\"21\" width=\"54\" height=\"11.8\" rx=\"6\" fill=\"#fff\" opacity=\".22\"/><rect x=\"10\" y=\"40\" width=\"44\" height=\"18\" rx=\"2.5\" fill=\"url(#gffffff01)\" stroke=\"#a6a6a6\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"11\" y=\"41\" width=\"42\" height=\"7.6\" rx=\"1.5\" fill=\"#fff\" opacity=\".22\"/><rect x=\"14\" y=\"46\" width=\"20\" height=\"2.6\" rx=\"1.3\" fill=\"#b4c3e8\"/><rect x=\"14\" y=\"51\" width=\"28\" height=\"2.6\" rx=\"1.3\" fill=\"#b4c3e8\"/><circle cx=\"50\" cy=\"30\" r=\"3\" fill=\"url(#r3be08a)\" stroke=\"#26925a\" stroke-opacity=\".4\" stroke-width=\".7\"/><rect x=\"10\" y=\"27\" width=\"24\" height=\"4\" rx=\"2\" fill=\"url(#g5b657701)\" stroke=\"#3b424d\" stroke-opacity=\".45\" stroke-width=\".8\"/>","📷":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"4\" y=\"16\" width=\"56\" height=\"40\" rx=\"8\" fill=\"url(#g4b556301)\" stroke=\"#313740\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"5\" y=\"17\" width=\"54\" height=\"16.8\" rx=\"7\" fill=\"#fff\" opacity=\".22\"/><rect x=\"20\" y=\"10\" width=\"24\" height=\"10\" rx=\"3\" fill=\"url(#g37415101)\" stroke=\"#242a35\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"21\" y=\"11\" width=\"22\" height=\"4.2\" rx=\"2\" fill=\"#fff\" opacity=\".22\"/><circle cx=\"32\" cy=\"36\" r=\"14\" fill=\"url(#re5e9f2)\" stroke=\"#95979d\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"27.8\" cy=\"30.68\" rx=\"6.3\" ry=\"3.64\" transform=\"rotate(-30 27.8 30.68)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"32\" cy=\"36\" r=\"10\" fill=\"url(#r1e3a8a)\" stroke=\"#14265a\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"29.0\" cy=\"32.2\" rx=\"4.5\" ry=\"2.6\" transform=\"rotate(-30 29.0 32.2)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"32\" cy=\"36\" r=\"5\" fill=\"url(#r3b82f6)\" stroke=\"#2654a0\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"28\" cy=\"31\" rx=\"3\" ry=\"2\" transform=\"rotate(-30 28 31)\" fill=\"url(#hl)\" opacity=\"0.9\"/><circle cx=\"52\" cy=\"26\" r=\"3\" fill=\"url(#rffd24c)\" stroke=\"#a68831\" stroke-opacity=\".4\" stroke-width=\".7\"/><rect x=\"8\" y=\"22\" width=\"12\" height=\"5\" rx=\"2\" fill=\"url(#gf5883b01)\" stroke=\"#9f5826\" stroke-opacity=\".45\" stroke-width=\".8\"/>","🖼":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"4\" y=\"6\" width=\"56\" height=\"48\" rx=\"5\" fill=\"url(#ga8683a01)\" stroke=\"#6d4426\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"5\" y=\"7\" width=\"54\" height=\"20.2\" rx=\"4\" fill=\"#fff\" opacity=\".22\"/><rect x=\"9\" y=\"11\" width=\"46\" height=\"38\" rx=\"2\" fill=\"url(#gbfe6ff01)\" stroke=\"#7c96a6\" stroke-opacity=\".45\" stroke-width=\".8\"/><path d=\"M9 49 L24 28 L34 40 L42 32 L55 49Z\" fill=\"url(#g34b36a01)\" stroke=\"#227445\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><circle cx=\"44\" cy=\"21\" r=\"5.5\" fill=\"url(#rffd24c)\" stroke=\"#a68831\" stroke-opacity=\".4\" stroke-width=\".7\"/><path d=\"M9 49 L24 28 L32 38 L18 49Z\" fill=\"url(#g2a9a5801)\" stroke=\"#1b6439\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/>","📐":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M8 6 L56 56 H8Z\" fill=\"url(#gffd24c01)\" stroke=\"#a68831\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M18 28 L36 46 H18Z\" fill=\"url(#gfff6d001)\" stroke=\"#a6a087\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M8 16 h5\" fill=\"none\" stroke=\"#a66e0a\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M8 24 h5\" fill=\"none\" stroke=\"#a66e0a\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M8 32 h5\" fill=\"none\" stroke=\"#a66e0a\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M8 40 h5\" fill=\"none\" stroke=\"#a66e0a\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M8 48 h5\" fill=\"none\" stroke=\"#a66e0a\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M18 56 v-5\" fill=\"none\" stroke=\"#a66e0a\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M26 56 v-5\" fill=\"none\" stroke=\"#a66e0a\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M34 56 v-5\" fill=\"none\" stroke=\"#a66e0a\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M42 56 v-5\" fill=\"none\" stroke=\"#a66e0a\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M50 56 v-5\" fill=\"none\" stroke=\"#a66e0a\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>","🔤":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"4\" y=\"8\" width=\"56\" height=\"48\" rx=\"9\" fill=\"url(#g3b82f601)\" stroke=\"#2654a0\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"5\" y=\"9\" width=\"54\" height=\"20.2\" rx=\"8\" fill=\"#fff\" opacity=\".22\"/><text x=\"20\" y=\"40\" text-anchor=\"middle\" font-family=\"Arial Black,Arial,sans-serif\" font-weight=\"900\" font-size=\"24\" fill=\"#fff\">a</text><text x=\"35\" y=\"40\" text-anchor=\"middle\" font-family=\"Arial Black,Arial,sans-serif\" font-weight=\"900\" font-size=\"24\" fill=\"#ffe27a\">b</text><text x=\"49\" y=\"40\" text-anchor=\"middle\" font-family=\"Arial Black,Arial,sans-serif\" font-weight=\"900\" font-size=\"20\" fill=\"#7cf0b0\">c</text>","💡":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M32 2 C18 2 10 12 10 24 C10 34 18 38 20 46 H44 C46 38 54 34 54 24 C54 12 46 2 32 2Z\" fill=\"url(#gffd43b01)\" stroke=\"#a68a26\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><rect x=\"20\" y=\"46\" width=\"24\" height=\"6\" rx=\"3\" fill=\"url(#ga8b2c401)\" stroke=\"#6d747f\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"21\" y=\"47\" width=\"22\" height=\"2.5\" rx=\"2\" fill=\"#fff\" opacity=\".22\"/><rect x=\"22\" y=\"52\" width=\"20\" height=\"5\" rx=\"2.5\" fill=\"url(#g8a93a801)\" stroke=\"#5a606d\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"23\" y=\"53\" width=\"18\" height=\"2.1\" rx=\"1.5\" fill=\"#fff\" opacity=\".22\"/><circle cx=\"32\" cy=\"60\" r=\"3\" fill=\"url(#r6b7487)\" stroke=\"#464b58\" stroke-opacity=\".4\" stroke-width=\".7\"/><path d=\"M26 34 L32 24 L38 34\" fill=\"none\" stroke=\"#f59e0b\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><ellipse cx=\"22\" cy=\"16\" rx=\"5\" ry=\"9\" transform=\"rotate(20 22 16)\" fill=\"url(#hl)\" opacity=\"0.85\"/>","⚖":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"28\" y=\"6\" width=\"8\" height=\"48\" rx=\"4\" fill=\"url(#gc9a15a01)\" stroke=\"#83693a\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"29\" y=\"7\" width=\"6\" height=\"20.2\" rx=\"3\" fill=\"#fff\" opacity=\".22\"/><rect x=\"14\" y=\"52\" width=\"36\" height=\"8\" rx=\"4\" fill=\"url(#ga8683a01)\" stroke=\"#6d4426\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"15\" y=\"53\" width=\"34\" height=\"3.4\" rx=\"3\" fill=\"#fff\" opacity=\".22\"/><path d=\"M8 16 H56\" fill=\"none\" stroke=\"#d9ae5a\" stroke-width=\"3.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M10 16 L2 36 M10 16 L18 36 M54 16 L46 36 M54 16 L62 36\" fill=\"none\" stroke=\"#9aa6ba\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M0 36 H20 a10 10 0 0 1-20 0Z\" fill=\"url(#gf5b92801)\" stroke=\"#9f781a\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M44 36 H64 a10 10 0 0 1-20 0Z\" fill=\"url(#gf5b92801)\" stroke=\"#9f781a\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><circle cx=\"32\" cy=\"8\" r=\"4.5\" fill=\"url(#rf5b928)\" stroke=\"#9f781a\" stroke-opacity=\".4\" stroke-width=\".7\"/>","⏱":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"26\" y=\"2\" width=\"12\" height=\"7\" rx=\"2\" fill=\"url(#g8a93a801)\" stroke=\"#5a606d\" stroke-opacity=\".45\" stroke-width=\".8\"/><circle cx=\"32\" cy=\"36\" r=\"25\" fill=\"url(#r3b82f6)\" stroke=\"#2654a0\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"24.5\" cy=\"26.5\" rx=\"11.25\" ry=\"6.5\" transform=\"rotate(-30 24.5 26.5)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"32\" cy=\"36\" r=\"20\" fill=\"url(#rfff)\" stroke=\"#a6a6a6\" stroke-opacity=\".4\" stroke-width=\".7\"/><line x1=\"32\" y1=\"19\" x2=\"32\" y2=\"24\" stroke=\"#8a97b5\" stroke-width=\"2\" transform=\"rotate(0 32 36)\" stroke-linecap=\"round\"/><line x1=\"32\" y1=\"19\" x2=\"32\" y2=\"22\" stroke=\"#8a97b5\" stroke-width=\"2\" transform=\"rotate(30 32 36)\" stroke-linecap=\"round\"/><line x1=\"32\" y1=\"19\" x2=\"32\" y2=\"22\" stroke=\"#8a97b5\" stroke-width=\"2\" transform=\"rotate(60 32 36)\" stroke-linecap=\"round\"/><line x1=\"32\" y1=\"19\" x2=\"32\" y2=\"24\" stroke=\"#8a97b5\" stroke-width=\"2\" transform=\"rotate(90 32 36)\" stroke-linecap=\"round\"/><line x1=\"32\" y1=\"19\" x2=\"32\" y2=\"22\" stroke=\"#8a97b5\" stroke-width=\"2\" transform=\"rotate(120 32 36)\" stroke-linecap=\"round\"/><line x1=\"32\" y1=\"19\" x2=\"32\" y2=\"22\" stroke=\"#8a97b5\" stroke-width=\"2\" transform=\"rotate(150 32 36)\" stroke-linecap=\"round\"/><line x1=\"32\" y1=\"19\" x2=\"32\" y2=\"24\" stroke=\"#8a97b5\" stroke-width=\"2\" transform=\"rotate(180 32 36)\" stroke-linecap=\"round\"/><line x1=\"32\" y1=\"19\" x2=\"32\" y2=\"22\" stroke=\"#8a97b5\" stroke-width=\"2\" transform=\"rotate(210 32 36)\" stroke-linecap=\"round\"/><line x1=\"32\" y1=\"19\" x2=\"32\" y2=\"22\" stroke=\"#8a97b5\" stroke-width=\"2\" transform=\"rotate(240 32 36)\" stroke-linecap=\"round\"/><line x1=\"32\" y1=\"19\" x2=\"32\" y2=\"24\" stroke=\"#8a97b5\" stroke-width=\"2\" transform=\"rotate(270 32 36)\" stroke-linecap=\"round\"/><line x1=\"32\" y1=\"19\" x2=\"32\" y2=\"22\" stroke=\"#8a97b5\" stroke-width=\"2\" transform=\"rotate(300 32 36)\" stroke-linecap=\"round\"/><line x1=\"32\" y1=\"19\" x2=\"32\" y2=\"22\" stroke=\"#8a97b5\" stroke-width=\"2\" transform=\"rotate(330 32 36)\" stroke-linecap=\"round\"/><path d=\"M32 36 L42 28\" fill=\"none\" stroke=\"#ee3b3b\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"32\" cy=\"36\" r=\"3\" fill=\"url(#r2b3a67)\" stroke=\"#1c2643\" stroke-opacity=\".4\" stroke-width=\".7\"/><path d=\"M50 12 L54 8\" fill=\"none\" stroke=\"#8a93a8\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>","⏳":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"10\" y=\"2\" width=\"44\" height=\"7\" rx=\"3.5\" fill=\"url(#ga8683a01)\" stroke=\"#6d4426\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"10\" y=\"55\" width=\"44\" height=\"7\" rx=\"3.5\" fill=\"url(#ga8683a01)\" stroke=\"#6d4426\" stroke-opacity=\".45\" stroke-width=\".8\"/><path d=\"M14 9 H50 C50 24 38 28 38 32 C38 36 50 40 50 55 H14 C14 40 26 36 26 32 C26 28 14 24 14 9Z\" fill=\"url(#ge6f7ff01)\" stroke=\"#8b9da6\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M20 11 H44 C42 20 36 24 32 28 C28 24 22 20 20 11Z\" fill=\"url(#gf5b92801)\" stroke=\"#9f781a\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M18 54 C20 44 26 40 32 38 C38 40 44 44 46 54Z\" fill=\"url(#gf5b92801)\" stroke=\"#9f781a\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/>","🕒":"<ellipse cx=\"32\" cy=\"61\" rx=\"20\" ry=\"2.8\" fill=\"url(#shd)\"/><circle cx=\"32\" cy=\"32\" r=\"27\" fill=\"url(#r3b82f6)\" stroke=\"#2654a0\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"23.9\" cy=\"21.740000000000002\" rx=\"12.15\" ry=\"7.0200000000000005\" transform=\"rotate(-30 23.9 21.740000000000002)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"32\" cy=\"32\" r=\"22\" fill=\"url(#rfff)\" stroke=\"#a6a6a6\" stroke-opacity=\".4\" stroke-width=\".7\"/><line x1=\"32\" y1=\"12\" x2=\"32\" y2=\"16.5\" stroke=\"#8a97b5\" stroke-width=\"2.4\" stroke-linecap=\"round\" transform=\"rotate(0 32 32)\"/><line x1=\"32\" y1=\"12\" x2=\"32\" y2=\"15\" stroke=\"#8a97b5\" stroke-width=\"1.6\" stroke-linecap=\"round\" transform=\"rotate(30 32 32)\"/><line x1=\"32\" y1=\"12\" x2=\"32\" y2=\"15\" stroke=\"#8a97b5\" stroke-width=\"1.6\" stroke-linecap=\"round\" transform=\"rotate(60 32 32)\"/><line x1=\"32\" y1=\"12\" x2=\"32\" y2=\"16.5\" stroke=\"#8a97b5\" stroke-width=\"2.4\" stroke-linecap=\"round\" transform=\"rotate(90 32 32)\"/><line x1=\"32\" y1=\"12\" x2=\"32\" y2=\"15\" stroke=\"#8a97b5\" stroke-width=\"1.6\" stroke-linecap=\"round\" transform=\"rotate(120 32 32)\"/><line x1=\"32\" y1=\"12\" x2=\"32\" y2=\"15\" stroke=\"#8a97b5\" stroke-width=\"1.6\" stroke-linecap=\"round\" transform=\"rotate(150 32 32)\"/><line x1=\"32\" y1=\"12\" x2=\"32\" y2=\"16.5\" stroke=\"#8a97b5\" stroke-width=\"2.4\" stroke-linecap=\"round\" transform=\"rotate(180 32 32)\"/><line x1=\"32\" y1=\"12\" x2=\"32\" y2=\"15\" stroke=\"#8a97b5\" stroke-width=\"1.6\" stroke-linecap=\"round\" transform=\"rotate(210 32 32)\"/><line x1=\"32\" y1=\"12\" x2=\"32\" y2=\"15\" stroke=\"#8a97b5\" stroke-width=\"1.6\" stroke-linecap=\"round\" transform=\"rotate(240 32 32)\"/><line x1=\"32\" y1=\"12\" x2=\"32\" y2=\"16.5\" stroke=\"#8a97b5\" stroke-width=\"2.4\" stroke-linecap=\"round\" transform=\"rotate(270 32 32)\"/><line x1=\"32\" y1=\"12\" x2=\"32\" y2=\"15\" stroke=\"#8a97b5\" stroke-width=\"1.6\" stroke-linecap=\"round\" transform=\"rotate(300 32 32)\"/><line x1=\"32\" y1=\"12\" x2=\"32\" y2=\"15\" stroke=\"#8a97b5\" stroke-width=\"1.6\" stroke-linecap=\"round\" transform=\"rotate(330 32 32)\"/><path d=\"M32 32 V19\" fill=\"none\" stroke=\"#2b3a67\" stroke-width=\"3.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M32 32 L43 32\" fill=\"none\" stroke=\"#ee3b3b\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"32\" cy=\"32\" r=\"3\" fill=\"url(#r2b3a67)\" stroke=\"#1c2643\" stroke-opacity=\".4\" stroke-width=\".7\"/>","🕓":"<ellipse cx=\"32\" cy=\"61\" rx=\"20\" ry=\"2.8\" fill=\"url(#shd)\"/><circle cx=\"32\" cy=\"32\" r=\"27\" fill=\"url(#r14b8a6)\" stroke=\"#0d786c\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"23.9\" cy=\"21.740000000000002\" rx=\"12.15\" ry=\"7.0200000000000005\" transform=\"rotate(-30 23.9 21.740000000000002)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"32\" cy=\"32\" r=\"22\" fill=\"url(#rfff)\" stroke=\"#a6a6a6\" stroke-opacity=\".4\" stroke-width=\".7\"/><line x1=\"32\" y1=\"12\" x2=\"32\" y2=\"16.5\" stroke=\"#8a97b5\" stroke-width=\"2.4\" stroke-linecap=\"round\" transform=\"rotate(0 32 32)\"/><line x1=\"32\" y1=\"12\" x2=\"32\" y2=\"15\" stroke=\"#8a97b5\" stroke-width=\"1.6\" stroke-linecap=\"round\" transform=\"rotate(30 32 32)\"/><line x1=\"32\" y1=\"12\" x2=\"32\" y2=\"15\" stroke=\"#8a97b5\" stroke-width=\"1.6\" stroke-linecap=\"round\" transform=\"rotate(60 32 32)\"/><line x1=\"32\" y1=\"12\" x2=\"32\" y2=\"16.5\" stroke=\"#8a97b5\" stroke-width=\"2.4\" stroke-linecap=\"round\" transform=\"rotate(90 32 32)\"/><line x1=\"32\" y1=\"12\" x2=\"32\" y2=\"15\" stroke=\"#8a97b5\" stroke-width=\"1.6\" stroke-linecap=\"round\" transform=\"rotate(120 32 32)\"/><line x1=\"32\" y1=\"12\" x2=\"32\" y2=\"15\" stroke=\"#8a97b5\" stroke-width=\"1.6\" stroke-linecap=\"round\" transform=\"rotate(150 32 32)\"/><line x1=\"32\" y1=\"12\" x2=\"32\" y2=\"16.5\" stroke=\"#8a97b5\" stroke-width=\"2.4\" stroke-linecap=\"round\" transform=\"rotate(180 32 32)\"/><line x1=\"32\" y1=\"12\" x2=\"32\" y2=\"15\" stroke=\"#8a97b5\" stroke-width=\"1.6\" stroke-linecap=\"round\" transform=\"rotate(210 32 32)\"/><line x1=\"32\" y1=\"12\" x2=\"32\" y2=\"15\" stroke=\"#8a97b5\" stroke-width=\"1.6\" stroke-linecap=\"round\" transform=\"rotate(240 32 32)\"/><line x1=\"32\" y1=\"12\" x2=\"32\" y2=\"16.5\" stroke=\"#8a97b5\" stroke-width=\"2.4\" stroke-linecap=\"round\" transform=\"rotate(270 32 32)\"/><line x1=\"32\" y1=\"12\" x2=\"32\" y2=\"15\" stroke=\"#8a97b5\" stroke-width=\"1.6\" stroke-linecap=\"round\" transform=\"rotate(300 32 32)\"/><line x1=\"32\" y1=\"12\" x2=\"32\" y2=\"15\" stroke=\"#8a97b5\" stroke-width=\"1.6\" stroke-linecap=\"round\" transform=\"rotate(330 32 32)\"/><path d=\"M32 32 V19\" fill=\"none\" stroke=\"#2b3a67\" stroke-width=\"3.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M32 32 L40 44\" fill=\"none\" stroke=\"#ee3b3b\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"32\" cy=\"32\" r=\"3\" fill=\"url(#r2b3a67)\" stroke=\"#1c2643\" stroke-opacity=\".4\" stroke-width=\".7\"/>","🧭":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><circle cx=\"32\" cy=\"31\" r=\"27\" fill=\"url(#rf5b928)\" stroke=\"#9f781a\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"23.9\" cy=\"20.740000000000002\" rx=\"12.15\" ry=\"7.0200000000000005\" transform=\"rotate(-30 23.9 20.740000000000002)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"32\" cy=\"31\" r=\"21\" fill=\"url(#rfff)\" stroke=\"#a6a6a6\" stroke-opacity=\".4\" stroke-width=\".7\"/><path d=\"M32 12 L38 31 H26Z\" fill=\"url(#gee3b3b01)\" stroke=\"#9b2626\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M32 50 L26 31 H38Z\" fill=\"url(#g3b82f601)\" stroke=\"#2654a0\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><circle cx=\"32\" cy=\"31\" r=\"3\" fill=\"url(#r2b3a67)\" stroke=\"#1c2643\" stroke-opacity=\".4\" stroke-width=\".7\"/><text x=\"32\" y=\"10\" text-anchor=\"middle\" font-family=\"Arial Black,Arial,sans-serif\" font-weight=\"900\" font-size=\"6\" fill=\"#7a4a05\">N</text>","🔬":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"10\" y=\"52\" width=\"44\" height=\"8\" rx=\"3\" fill=\"url(#g4b556301)\" stroke=\"#313740\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"11\" y=\"53\" width=\"42\" height=\"3.4\" rx=\"2\" fill=\"#fff\" opacity=\".22\"/><g transform=\"rotate(-25 32 30)\"><rect x=\"26\" y=\"6\" width=\"12\" height=\"30\" rx=\"3\" fill=\"url(#ge5e9f201)\" stroke=\"#95979d\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"27\" y=\"7\" width=\"10\" height=\"12.6\" rx=\"2\" fill=\"#fff\" opacity=\".22\"/><rect x=\"28\" y=\"2\" width=\"8\" height=\"6\" rx=\"2\" fill=\"url(#g8a93a801)\" stroke=\"#5a606d\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"29\" y=\"36\" width=\"6\" height=\"8\" rx=\"1\" fill=\"url(#g8a93a801)\" stroke=\"#5a606d\" stroke-opacity=\".45\" stroke-width=\".8\"/></g><path d=\"M42 54 C56 54 56 30 38 28\" fill=\"none\" stroke=\"#3b82f6\" stroke-width=\"5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><rect x=\"14\" y=\"44\" width=\"22\" height=\"5\" rx=\"2\" fill=\"url(#g8a93a801)\" stroke=\"#5a606d\" stroke-opacity=\".45\" stroke-width=\".8\"/>","🩺":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M14 6 V24 a12 12 0 0 0 24 0 V6\" fill=\"none\" stroke=\"#6b7487\" stroke-width=\"3.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M26 36 V44 a10 10 0 0 0 20 0 V38\" fill=\"none\" stroke=\"#6b7487\" stroke-width=\"3.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"14\" cy=\"6\" r=\"3.6\" fill=\"url(#re5e9f2)\" stroke=\"#95979d\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"12.92\" cy=\"4.632\" rx=\"1.62\" ry=\"0.936\" transform=\"rotate(-30 12.92 4.632)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"38\" cy=\"6\" r=\"3.6\" fill=\"url(#re5e9f2)\" stroke=\"#95979d\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"36.92\" cy=\"4.632\" rx=\"1.62\" ry=\"0.936\" transform=\"rotate(-30 36.92 4.632)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"46\" cy=\"36\" r=\"6.5\" fill=\"url(#r2fc464)\" stroke=\"#1f7f41\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"44.05\" cy=\"33.53\" rx=\"2.9250000000000003\" ry=\"1.69\" transform=\"rotate(-30 44.05 33.53)\" fill=\"url(#hl)\" opacity=\"0.95\"/>","🧬":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M18 4 C18 20 46 24 46 36 C46 48 18 50 18 60\" fill=\"none\" stroke=\"#3b82f6\" stroke-width=\"5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M46 4 C46 20 18 24 18 36 C18 48 46 50 46 60\" fill=\"none\" stroke=\"#ee3b3b\" stroke-width=\"5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M24 12 H40\" fill=\"none\" stroke=\"#f5b928\" stroke-width=\"3.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M26 21 H38\" fill=\"none\" stroke=\"#f5b928\" stroke-width=\"3.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M24 30 H40\" fill=\"none\" stroke=\"#f5b928\" stroke-width=\"3.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M26 39 H38\" fill=\"none\" stroke=\"#f5b928\" stroke-width=\"3.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M24 48 H40\" fill=\"none\" stroke=\"#f5b928\" stroke-width=\"3.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>","📡":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"26\" y=\"40\" width=\"12\" height=\"6\" rx=\"2\" fill=\"url(#g8a93a801)\" stroke=\"#5a606d\" stroke-opacity=\".45\" stroke-width=\".8\"/><g transform=\"rotate(-30 32 30)\"><path d=\"M10 12 C10 34 40 34 52 12Z\" fill=\"url(#ge5e9f201)\" stroke=\"#95979d\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/></g><path d=\"M32 24 L44 10\" fill=\"none\" stroke=\"#6b7487\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"46\" cy=\"8\" r=\"4.5\" fill=\"url(#ree3b3b)\" stroke=\"#9b2626\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"44.65\" cy=\"6.29\" rx=\"2.025\" ry=\"1.17\" transform=\"rotate(-30 44.65 6.29)\" fill=\"url(#hl)\" opacity=\"0.95\"/><rect x=\"22\" y=\"48\" width=\"20\" height=\"8\" rx=\"3\" fill=\"url(#g4b556301)\" stroke=\"#313740\" stroke-opacity=\".45\" stroke-width=\".8\"/><path d=\"M48 26 a12 12 0 0 1 6 12\" fill=\"none\" stroke=\"#3be08a\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M52 20 a18 18 0 0 1 8 20\" fill=\"none\" stroke=\"#3be08a\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>","💾":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"6\" y=\"6\" width=\"52\" height=\"52\" rx=\"6\" fill=\"url(#g3b82f601)\" stroke=\"#2654a0\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"7\" y=\"7\" width=\"50\" height=\"21.8\" rx=\"5\" fill=\"#fff\" opacity=\".22\"/><rect x=\"16\" y=\"6\" width=\"30\" height=\"18\" rx=\"2\" fill=\"url(#ge8eefc01)\" stroke=\"#979ba4\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"36\" y=\"9\" width=\"6\" height=\"12\" rx=\"1.5\" fill=\"url(#g3b82f601)\" stroke=\"#2654a0\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"14\" y=\"34\" width=\"36\" height=\"24\" rx=\"3\" fill=\"url(#gfbfcff01)\" stroke=\"#a3a4a6\" stroke-opacity=\".45\" stroke-width=\".8\"/><path d=\"M20 42 H44 M20 48 H38\" fill=\"none\" stroke=\"#b4c3e8\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>","🗂":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"6\" y=\"18\" width=\"52\" height=\"40\" rx=\"5\" fill=\"url(#gf5a62301)\" stroke=\"#9f6c17\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"7\" y=\"19\" width=\"50\" height=\"16.8\" rx=\"4\" fill=\"#fff\" opacity=\".22\"/><rect x=\"10\" y=\"8\" width=\"18\" height=\"12\" rx=\"3\" fill=\"url(#g3b82f601)\" stroke=\"#2654a0\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"11\" y=\"9\" width=\"16\" height=\"5.0\" rx=\"2\" fill=\"#fff\" opacity=\".22\"/><rect x=\"30\" y=\"12\" width=\"18\" height=\"10\" rx=\"3\" fill=\"url(#g22b45f01)\" stroke=\"#16753e\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"31\" y=\"13\" width=\"16\" height=\"4.2\" rx=\"2\" fill=\"#fff\" opacity=\".22\"/><rect x=\"8\" y=\"22\" width=\"48\" height=\"34\" rx=\"4\" fill=\"url(#gffcd6b01)\" stroke=\"#a68546\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"9\" y=\"23\" width=\"46\" height=\"14.3\" rx=\"3\" fill=\"#fff\" opacity=\".22\"/><path d=\"M16 32 H48\" fill=\"none\" stroke=\"#c27a0e\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M16 40 H48\" fill=\"none\" stroke=\"#c27a0e\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M16 48 H48\" fill=\"none\" stroke=\"#c27a0e\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>","📂":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M4 12 a4 4 0 0 1 4-4 H22 L28 14 H52 a4 4 0 0 1 4 4 V50 H4Z\" fill=\"url(#gc9841001)\" stroke=\"#83560a\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M12 22 H62 L54 56 H4Z\" fill=\"url(#gffc94d01)\" stroke=\"#a68332\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M13 24 H58\" stroke=\"#fff\" stroke-opacity=\".5\" stroke-width=\"1.6\"/>","📁":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M4 12 a4 4 0 0 1 4-4 H22 L28 14 H54 a4 4 0 0 1 4 4 V52 a4 4 0 0 1-4 4 H8 a4 4 0 0 1-4-4Z\" fill=\"url(#gf5a62301)\" stroke=\"#9f6c17\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M4 22 H58 V52 a4 4 0 0 1-4 4 H8 a4 4 0 0 1-4-4Z\" fill=\"url(#gffcd5e01)\" stroke=\"#a6853d\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/>","📮":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"26\" y=\"36\" width=\"12\" height=\"24\" rx=\"2\" fill=\"url(#g6b748701)\" stroke=\"#464b58\" stroke-opacity=\".45\" stroke-width=\".8\"/><path d=\"M12 36 V20 C12 8 20 4 32 4 C44 4 52 8 52 20 V36Z\" fill=\"url(#gee3b3b01)\" stroke=\"#9b2626\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><rect x=\"18\" y=\"22\" width=\"28\" height=\"6\" rx=\"3\" fill=\"url(#g7a1b1b01)\" stroke=\"#4f1212\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"24\" y=\"10\" width=\"16\" height=\"8\" rx=\"2\" fill=\"url(#gfbfcff01)\" stroke=\"#a3a4a6\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"12\" y=\"36\" width=\"40\" height=\"6\" rx=\"2\" fill=\"url(#gc42a2a01)\" stroke=\"#7f1b1b\" stroke-opacity=\".45\" stroke-width=\".8\"/>","🔎":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M40 40 L58 58\" fill=\"none\" stroke=\"#7a4a22\" stroke-width=\"8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"26\" cy=\"26\" r=\"19\" fill=\"url(#rbfe6ff)\" stroke=\"#7c96a6\" stroke-opacity=\".4\" stroke-width=\".7\"/><circle cx=\"26\" cy=\"26\" r=\"19\" fill=\"none\" stroke=\"#f5b928\" stroke-width=\"6\"/><ellipse cx=\"19\" cy=\"18\" rx=\"7\" ry=\"4\" transform=\"rotate(-40 19 18)\" fill=\"url(#hl)\" opacity=\"1\"/>","🕸":"<ellipse cx=\"32\" cy=\"60\" rx=\"0\" ry=\"0\" fill=\"url(#shd)\"/><path d=\"M32 32 L59.0 32.0\" fill=\"none\" stroke=\"#aab3c5\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M32 32 L51.1 51.1\" fill=\"none\" stroke=\"#aab3c5\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M32 32 L32.0 59.0\" fill=\"none\" stroke=\"#aab3c5\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M32 32 L12.9 51.1\" fill=\"none\" stroke=\"#aab3c5\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M32 32 L5.0 32.0\" fill=\"none\" stroke=\"#aab3c5\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M32 32 L12.9 12.9\" fill=\"none\" stroke=\"#aab3c5\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M32 32 L32.0 5.0\" fill=\"none\" stroke=\"#aab3c5\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M32 32 L51.1 12.9\" fill=\"none\" stroke=\"#aab3c5\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><polygon points=\"41.0,32.0 38.4,38.4 32.0,41.0 25.6,38.4 23.0,32.0 25.6,25.6 32.0,23.0 38.4,25.6\" fill=\"none\" stroke=\"#c9d1e0\" stroke-width=\"1.8\"/><polygon points=\"49.0,32.0 44.0,44.0 32.0,49.0 20.0,44.0 15.0,32.0 20.0,20.0 32.0,15.0 44.0,20.0\" fill=\"none\" stroke=\"#c9d1e0\" stroke-width=\"1.8\"/><polygon points=\"57.0,32.0 49.7,49.7 32.0,57.0 14.3,49.7 7.0,32.0 14.3,14.3 32.0,7.0 49.7,14.3\" fill=\"none\" stroke=\"#c9d1e0\" stroke-width=\"1.8\"/><circle cx=\"46\" cy=\"44\" r=\"5\" fill=\"url(#r374151)\" stroke=\"#242a35\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"44.5\" cy=\"42.1\" rx=\"2.25\" ry=\"1.3\" transform=\"rotate(-30 44.5 42.1)\" fill=\"url(#hl)\" opacity=\"0.95\"/><path d=\"M44 40 L38 34 M48 40 L52 34 M42 46 L36 50 M50 47 L56 52\" fill=\"none\" stroke=\"#374151\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>","🧺":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M8 26 H56 L50 56 a4 4 0 0 1-4 3 H18 a4 4 0 0 1-4-3Z\" fill=\"url(#gd9953a01)\" stroke=\"#8d6126\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M14 28 L16 58\" fill=\"none\" stroke=\"#a8661a\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M23 28 L24 58\" fill=\"none\" stroke=\"#a8661a\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M32 28 L32 58\" fill=\"none\" stroke=\"#a8661a\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M41 28 L40 58\" fill=\"none\" stroke=\"#a8661a\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M50 28 L48 58\" fill=\"none\" stroke=\"#a8661a\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M8 38 H56 M10 48 H54\" fill=\"none\" stroke=\"#a8661a\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M18 26 C18 6 46 6 46 26\" fill=\"none\" stroke=\"#a8661a\" stroke-width=\"4.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"24\" cy=\"24\" r=\"6\" fill=\"url(#ree3b3b)\" stroke=\"#9b2626\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"22.2\" cy=\"21.72\" rx=\"2.7\" ry=\"1.56\" transform=\"rotate(-30 22.2 21.72)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"34\" cy=\"22\" r=\"6\" fill=\"url(#rf5b928)\" stroke=\"#9f781a\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"32.2\" cy=\"19.72\" rx=\"2.7\" ry=\"1.56\" transform=\"rotate(-30 32.2 19.72)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"43\" cy=\"25\" r=\"5\" fill=\"url(#r2fc464)\" stroke=\"#1f7f41\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"41.5\" cy=\"23.1\" rx=\"2.25\" ry=\"1.3\" transform=\"rotate(-30 41.5 23.1)\" fill=\"url(#hl)\" opacity=\"0.95\"/>","🍽":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><circle cx=\"32\" cy=\"32\" r=\"26\" fill=\"url(#re8edf7)\" stroke=\"#979aa1\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"24.2\" cy=\"22.119999999999997\" rx=\"11.700000000000001\" ry=\"6.76\" transform=\"rotate(-30 24.2 22.119999999999997)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"32\" cy=\"32\" r=\"18\" fill=\"url(#rffffff)\" stroke=\"#a6a6a6\" stroke-opacity=\".4\" stroke-width=\".7\"/><circle cx=\"32\" cy=\"32\" r=\"10\" fill=\"url(#rf1f4fb)\" stroke=\"#9d9fa3\" stroke-opacity=\".4\" stroke-width=\".7\"/><path d=\"M4 8 V24 M8 8 V24 M12 8 V24 M8 24 V58\" fill=\"none\" stroke=\"#9aa6ba\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M56 8 C50 14 50 26 56 28 V58\" fill=\"none\" stroke=\"#9aa6ba\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>","👁":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M2 32 C12 14 52 14 62 32 C52 50 12 50 2 32Z\" fill=\"url(#gffffff01)\" stroke=\"#a6a6a6\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><circle cx=\"32\" cy=\"32\" r=\"12\" fill=\"url(#r3b82f6)\" stroke=\"#2654a0\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"28.4\" cy=\"27.439999999999998\" rx=\"5.4\" ry=\"3.12\" transform=\"rotate(-30 28.4 27.439999999999998)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"32\" cy=\"32\" r=\"6\" fill=\"url(#r111827)\" stroke=\"#0b1019\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"28\" cy=\"28\" rx=\"3\" ry=\"2\" transform=\"rotate(-30 28 28)\" fill=\"url(#hl)\" opacity=\"1\"/>","🕶":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M4 20 H60 V30 C60 42 50 46 44 46 C36 46 34 38 32 34 C30 38 28 46 20 46 C14 46 4 42 4 30Z\" fill=\"url(#g1f293701)\" stroke=\"#141b24\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M10 24 L24 24 L14 36Z\" fill=\"#fff\" opacity=\".25\"/><path d=\"M38 24 L52 24 L42 36Z\" fill=\"#fff\" opacity=\".25\"/>","🧑‍💼":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M8 60 C8 44 18 38 32 38 C46 38 56 44 56 60Z\" fill=\"url(#g3b5bdb01)\" stroke=\"#263b8e\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M26 38 L32 52 L38 38Z\" fill=\"url(#gffffff01)\" stroke=\"#a6a6a6\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M30 42 L34 42 L35 54 L32 58 L29 54Z\" fill=\"url(#gee3b3b01)\" stroke=\"#9b2626\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><circle cx=\"32\" cy=\"22\" r=\"15\" fill=\"url(#rffcf70)\" stroke=\"#a68749\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"27.5\" cy=\"16.3\" rx=\"6.75\" ry=\"3.9000000000000004\" transform=\"rotate(-30 27.5 16.3)\" fill=\"url(#hl)\" opacity=\"0.95\"/><ellipse cx=\"26.75\" cy=\"21.25\" rx=\"1.3499999999999999\" ry=\"2.1\" fill=\"#5a3a12\"/><ellipse cx=\"37.25\" cy=\"21.25\" rx=\"1.3499999999999999\" ry=\"2.1\" fill=\"#5a3a12\"/><path d=\"M26.75 26.5 q5.25 4.8 10.5 0\" stroke=\"#7a3b12\" stroke-width=\"1.5\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M17 22 C17 6 47 6 47 22 C42 14 22 14 17 22Z\" fill=\"url(#g5a3a2401)\" stroke=\"#3a2617\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/>","🧑":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M8 60 C8 44 18 38 32 38 C46 38 56 44 56 60Z\" fill=\"url(#g14b8a601)\" stroke=\"#0d786c\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><circle cx=\"32\" cy=\"22\" r=\"15\" fill=\"url(#rffcf70)\" stroke=\"#a68749\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"27.5\" cy=\"16.3\" rx=\"6.75\" ry=\"3.9000000000000004\" transform=\"rotate(-30 27.5 16.3)\" fill=\"url(#hl)\" opacity=\"0.95\"/><ellipse cx=\"26.75\" cy=\"21.25\" rx=\"1.3499999999999999\" ry=\"2.1\" fill=\"#5a3a12\"/><ellipse cx=\"37.25\" cy=\"21.25\" rx=\"1.3499999999999999\" ry=\"2.1\" fill=\"#5a3a12\"/><path d=\"M26.75 26.5 q5.25 4.8 10.5 0\" stroke=\"#7a3b12\" stroke-width=\"1.5\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M17 22 C17 6 47 6 47 22 C42 14 22 14 17 22Z\" fill=\"url(#g8a4b1f01)\" stroke=\"#5a3114\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/>","👤":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><circle cx=\"32\" cy=\"22\" r=\"14\" fill=\"url(#r8da2c0)\" stroke=\"#5c697d\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"27.8\" cy=\"16.68\" rx=\"6.3\" ry=\"3.64\" transform=\"rotate(-30 27.8 16.68)\" fill=\"url(#hl)\" opacity=\"0.95\"/><path d=\"M8 60 C8 42 20 36 32 36 C44 36 56 42 56 60Z\" fill=\"url(#g8da2c001)\" stroke=\"#5c697d\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/>","🗣":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><circle cx=\"24\" cy=\"34\" r=\"18\" fill=\"url(#rffcf70)\" stroke=\"#a68749\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"18.6\" cy=\"27.16\" rx=\"8.1\" ry=\"4.68\" transform=\"rotate(-30 18.6 27.16)\" fill=\"url(#hl)\" opacity=\"0.95\"/><ellipse cx=\"17.7\" cy=\"33.1\" rx=\"1.6199999999999999\" ry=\"2.5200000000000005\" fill=\"#5a3a12\"/><ellipse cx=\"30.3\" cy=\"33.1\" rx=\"1.6199999999999999\" ry=\"2.5200000000000005\" fill=\"#5a3a12\"/><path d=\"M17.7 39.4 q6.3 5.76 12.6 0\" stroke=\"#7a3b12\" stroke-width=\"1.8\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M46 22 C52 26 52 38 46 42\" fill=\"none\" stroke=\"#3b82f6\" stroke-width=\"3.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M52 14 C62 22 62 42 52 50\" fill=\"none\" stroke=\"#3b82f6\" stroke-width=\"3.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M8 34 C8 14 40 14 40 34 C32 24 16 24 8 34Z\" fill=\"url(#g5a3a2401)\" stroke=\"#3a2617\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/>","🙋":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M10 60 C10 46 20 40 32 40 C44 40 54 46 54 60Z\" fill=\"url(#gf5883b01)\" stroke=\"#9f5826\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><circle cx=\"30\" cy=\"28\" r=\"13\" fill=\"url(#rffcf70)\" stroke=\"#a68749\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"26.1\" cy=\"23.06\" rx=\"5.8500000000000005\" ry=\"3.38\" transform=\"rotate(-30 26.1 23.06)\" fill=\"url(#hl)\" opacity=\"0.95\"/><ellipse cx=\"25.45\" cy=\"27.35\" rx=\"1.17\" ry=\"1.8200000000000003\" fill=\"#5a3a12\"/><ellipse cx=\"34.55\" cy=\"27.35\" rx=\"1.17\" ry=\"1.8200000000000003\" fill=\"#5a3a12\"/><path d=\"M25.45 31.9 q4.55 4.16 9.1 0\" stroke=\"#7a3b12\" stroke-width=\"1.3\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M17 28 C17 14 43 14 43 28 C38 22 22 22 17 28Z\" fill=\"url(#g5a3a2401)\" stroke=\"#3a2617\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><rect x=\"46\" y=\"2\" width=\"8\" height=\"24\" rx=\"4\" fill=\"url(#gffcf7001)\" stroke=\"#a68749\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"47\" y=\"3\" width=\"6\" height=\"10.1\" rx=\"3\" fill=\"#fff\" opacity=\".22\"/><rect x=\"50\" y=\"6\" width=\"7\" height=\"18\" rx=\"3.5\" fill=\"url(#gffcf7001)\" stroke=\"#a68749\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"51\" y=\"7\" width=\"5\" height=\"7.6\" rx=\"2.5\" fill=\"#fff\" opacity=\".22\"/>","👋":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><g transform=\"rotate(20 32 36)\"><rect x=\"20\" y=\"24\" width=\"26\" height=\"32\" rx=\"9\" fill=\"url(#gffcf7001)\" stroke=\"#a68749\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"21\" y=\"25\" width=\"24\" height=\"13.4\" rx=\"8\" fill=\"#fff\" opacity=\".22\"/><rect x=\"20\" y=\"6\" width=\"6\" height=\"26\" rx=\"3\" fill=\"url(#gffcf7001)\" stroke=\"#a68749\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"21\" y=\"7\" width=\"4\" height=\"10.9\" rx=\"2\" fill=\"#fff\" opacity=\".22\"/><rect x=\"27\" y=\"2\" width=\"6\" height=\"30\" rx=\"3\" fill=\"url(#gffcf7001)\" stroke=\"#a68749\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"28\" y=\"3\" width=\"4\" height=\"12.6\" rx=\"2\" fill=\"#fff\" opacity=\".22\"/><rect x=\"34\" y=\"4\" width=\"6\" height=\"28\" rx=\"3\" fill=\"url(#gffcf7001)\" stroke=\"#a68749\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"35\" y=\"5\" width=\"4\" height=\"11.8\" rx=\"2\" fill=\"#fff\" opacity=\".22\"/><rect x=\"41\" y=\"10\" width=\"6\" height=\"24\" rx=\"3\" fill=\"url(#gffcf7001)\" stroke=\"#a68749\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"42\" y=\"11\" width=\"4\" height=\"10.1\" rx=\"2\" fill=\"#fff\" opacity=\".22\"/><rect x=\"8\" y=\"34\" width=\"16\" height=\"8\" rx=\"4\" fill=\"url(#gffcf7001)\" stroke=\"#a68749\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"9\" y=\"35\" width=\"14\" height=\"3.4\" rx=\"3\" fill=\"#fff\" opacity=\".22\"/><rect x=\"18\" y=\"52\" width=\"22\" height=\"10\" rx=\"3\" fill=\"url(#g3b82f601)\" stroke=\"#2654a0\" stroke-opacity=\".45\" stroke-width=\".8\"/></g><path d=\"M54 10 C58 14 58 22 54 26\" fill=\"none\" stroke=\"#f5a623\" stroke-width=\"2.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M8 14 C4 18 4 26 8 30\" fill=\"none\" stroke=\"#f5a623\" stroke-width=\"2.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>","👍":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"4\" y=\"28\" width=\"14\" height=\"30\" rx=\"3\" fill=\"url(#g3b82f601)\" stroke=\"#2654a0\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"5\" y=\"29\" width=\"12\" height=\"12.6\" rx=\"2\" fill=\"#fff\" opacity=\".22\"/><path d=\"M20 30 L32 6 C38 6 40 12 38 20 H54 C58 20 60 24 58 28 L56 50 C55 56 52 58 46 58 H20Z\" fill=\"url(#gffcf7001)\" stroke=\"#a68749\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/>","👌":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"6\" y=\"38\" width=\"12\" height=\"22\" rx=\"3\" fill=\"url(#g3b82f601)\" stroke=\"#2654a0\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"14\" y=\"30\" width=\"34\" height=\"28\" rx=\"10\" fill=\"url(#gffcf7001)\" stroke=\"#a68749\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"15\" y=\"31\" width=\"32\" height=\"11.8\" rx=\"9\" fill=\"#fff\" opacity=\".22\"/><circle cx=\"32\" cy=\"20\" r=\"13\" fill=\"url(#rffcf70)\" stroke=\"#a68749\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"28.1\" cy=\"15.059999999999999\" rx=\"5.8500000000000005\" ry=\"3.38\" transform=\"rotate(-30 28.1 15.059999999999999)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"32\" cy=\"20\" r=\"6.5\" fill=\"#fff6e0\" stroke=\"#d99a2b\" stroke-width=\"1.2\"/><rect x=\"40\" y=\"12\" width=\"6\" height=\"26\" rx=\"3\" fill=\"url(#gffcf7001)\" stroke=\"#a68749\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"41\" y=\"13\" width=\"4\" height=\"10.9\" rx=\"2\" fill=\"#fff\" opacity=\".22\"/><rect x=\"46\" y=\"18\" width=\"6\" height=\"24\" rx=\"3\" fill=\"url(#gffcf7001)\" stroke=\"#a68749\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"47\" y=\"19\" width=\"4\" height=\"10.1\" rx=\"2\" fill=\"#fff\" opacity=\".22\"/><rect x=\"52\" y=\"26\" width=\"5\" height=\"18\" rx=\"2.5\" fill=\"url(#gffcf7001)\" stroke=\"#a68749\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"53\" y=\"27\" width=\"3\" height=\"7.6\" rx=\"1.5\" fill=\"#fff\" opacity=\".22\"/>","🤝":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><g transform=\"rotate(-10 32 32)\"><rect x=\"2\" y=\"24\" width=\"26\" height=\"18\" rx=\"6\" fill=\"url(#g3b5bdb01)\" stroke=\"#263b8e\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"36\" y=\"24\" width=\"26\" height=\"18\" rx=\"6\" fill=\"url(#g14b8a601)\" stroke=\"#0d786c\" stroke-opacity=\".45\" stroke-width=\".8\"/></g><path d=\"M12 32 L24 26 L36 24 L50 30 L44 44 L30 46 L18 42Z\" fill=\"url(#gffcf7001)\" stroke=\"#a68749\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M26 36 L28 44\" fill=\"none\" stroke=\"#d99a2b\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M32 36 L34 44\" fill=\"none\" stroke=\"#d99a2b\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M38 36 L40 44\" fill=\"none\" stroke=\"#d99a2b\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M44 36 L46 44\" fill=\"none\" stroke=\"#d99a2b\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>","😴":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><circle cx=\"30\" cy=\"36\" r=\"24\" fill=\"url(#rffcf70)\" stroke=\"#a68749\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"22.8\" cy=\"26.88\" rx=\"10.8\" ry=\"6.24\" transform=\"rotate(-30 22.8 26.88)\" fill=\"url(#hl)\" opacity=\"0.95\"/><path d=\"M16 34 q6 5 12 0 M36 34 q6 5 12 0\" fill=\"none\" stroke=\"#5a3a12\" stroke-width=\"2.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><ellipse cx=\"30\" cy=\"48\" rx=\"4\" ry=\"3\" fill=\"#7a3b12\"/><text x=\"48\" y=\"14\" text-anchor=\"middle\" font-family=\"Arial Black,Arial,sans-serif\" font-weight=\"900\" font-size=\"14\" fill=\"#4f8cff\">Z</text><text x=\"56\" y=\"8\" text-anchor=\"middle\" font-family=\"Arial Black,Arial,sans-serif\" font-weight=\"900\" font-size=\"9\" fill=\"#8fb4ff\">z</text>","👑":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M4 20 L18 30 L32 8 L46 30 L60 20 L54 54 H10Z\" fill=\"url(#gf7c52b01)\" stroke=\"#a1801c\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><rect x=\"10\" y=\"50\" width=\"44\" height=\"9\" rx=\"3\" fill=\"url(#gd89a1001)\" stroke=\"#8c640a\" stroke-opacity=\".45\" stroke-width=\".8\"/><circle cx=\"32\" cy=\"10\" r=\"4\" fill=\"url(#ree3b3b)\" stroke=\"#9b2626\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"30.8\" cy=\"8.48\" rx=\"1.8\" ry=\"1.04\" transform=\"rotate(-30 30.8 8.48)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"5\" cy=\"19\" r=\"3.6\" fill=\"url(#r3b82f6)\" stroke=\"#2654a0\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"3.92\" cy=\"17.632\" rx=\"1.62\" ry=\"0.936\" transform=\"rotate(-30 3.92 17.632)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"59\" cy=\"19\" r=\"3.6\" fill=\"url(#r3b82f6)\" stroke=\"#2654a0\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"57.92\" cy=\"17.632\" rx=\"1.62\" ry=\"0.936\" transform=\"rotate(-30 57.92 17.632)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"32\" cy=\"40\" r=\"6\" fill=\"url(#ree3b3b)\" stroke=\"#9b2626\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"30.2\" cy=\"37.72\" rx=\"2.7\" ry=\"1.56\" transform=\"rotate(-30 30.2 37.72)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"18\" cy=\"44\" r=\"3.6\" fill=\"url(#r2fc464)\" stroke=\"#1f7f41\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"16.92\" cy=\"42.632\" rx=\"1.62\" ry=\"0.936\" transform=\"rotate(-30 16.92 42.632)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"46\" cy=\"44\" r=\"3.6\" fill=\"url(#r2fc464)\" stroke=\"#1f7f41\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"44.92\" cy=\"42.632\" rx=\"1.62\" ry=\"0.936\" transform=\"rotate(-30 44.92 42.632)\" fill=\"url(#hl)\" opacity=\"0.95\"/>","🏅":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M14 2 H30 L36 22 H22Z\" fill=\"url(#g3b82f601)\" stroke=\"#2654a0\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M50 2 H34 L28 22 H42Z\" fill=\"url(#gee3b3b01)\" stroke=\"#9b2626\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><circle cx=\"32\" cy=\"40\" r=\"20\" fill=\"url(#rf7c52b)\" stroke=\"#a1801c\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"26.0\" cy=\"32.4\" rx=\"9.0\" ry=\"5.2\" transform=\"rotate(-30 26.0 32.4)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"32\" cy=\"40\" r=\"14\" fill=\"url(#rffe27a)\" stroke=\"#a6934f\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"27.8\" cy=\"34.68\" rx=\"6.3\" ry=\"3.64\" transform=\"rotate(-30 27.8 34.68)\" fill=\"url(#hl)\" opacity=\"0.95\"/><path d=\"M32 29 l3.4 7 7.6 1-5.5 5.4 1.3 7.6-6.8-3.6-6.8 3.6 1.3-7.600-5.500-5.400 7.600-1z\" fill=\"url(#ge89a1001)\" stroke=\"#97640a\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/>","🎉":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M6 58 L18 22 L42 46Z\" fill=\"url(#gf5a62301)\" stroke=\"#9f6c17\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M6 58 L18 22 L26 30Z\" fill=\"url(#gee3b3b01)\" stroke=\"#9b2626\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M30 16 C30 8 38 8 38 14\" fill=\"none\" stroke=\"#3b82f6\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M44 28 C52 26 54 34 48 36\" fill=\"none\" stroke=\"#22b45f\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"44\" cy=\"10\" r=\"3\" fill=\"url(#rff4d8d)\" stroke=\"#a6325c\" stroke-opacity=\".4\" stroke-width=\".7\"/><circle cx=\"56\" cy=\"22\" r=\"2.6\" fill=\"url(#r3b82f6)\" stroke=\"#2654a0\" stroke-opacity=\".4\" stroke-width=\".7\"/><circle cx=\"24\" cy=\"10\" r=\"2.6\" fill=\"url(#r22b45f)\" stroke=\"#16753e\" stroke-opacity=\".4\" stroke-width=\".7\"/><rect x=\"50\" y=\"42\" width=\"6\" height=\"3\" rx=\"1\" fill=\"#ee3b3b\" transform=\"rotate(30 53 43)\"/><rect x=\"36\" y=\"8\" width=\"6\" height=\"3\" rx=\"1\" fill=\"#f7c52b\" transform=\"rotate(-30 39 9)\"/><circle cx=\"58\" cy=\"34\" r=\"2.2\" fill=\"url(#rf7c52b)\" stroke=\"#a1801c\" stroke-opacity=\".4\" stroke-width=\".7\"/>","🎀":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M32 30 C20 10 4 14 6 30 C8 44 22 40 32 30Z\" fill=\"url(#gff5d9301)\" stroke=\"#a63c60\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M32 30 C44 10 60 14 58 30 C56 44 42 40 32 30Z\" fill=\"url(#gff5d9301)\" stroke=\"#a63c60\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M28 34 L16 58 L26 54 L30 60 L34 40Z\" fill=\"url(#ge63c7801)\" stroke=\"#96274e\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M36 34 L48 58 L38 54 L34 60 L30 40Z\" fill=\"url(#ge63c7801)\" stroke=\"#96274e\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><circle cx=\"32\" cy=\"31\" r=\"7\" fill=\"url(#rff7fae)\" stroke=\"#a65371\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"29.9\" cy=\"28.34\" rx=\"3.15\" ry=\"1.82\" transform=\"rotate(-30 29.9 28.34)\" fill=\"url(#hl)\" opacity=\"0.95\"/>","🌳":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"27\" y=\"38\" width=\"10\" height=\"22\" rx=\"3\" fill=\"url(#g9a6a3a01)\" stroke=\"#644526\" stroke-opacity=\".45\" stroke-width=\".8\"/><circle cx=\"32\" cy=\"22\" r=\"19\" fill=\"url(#r2fb344)\" stroke=\"#1f742c\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"26.3\" cy=\"14.780000000000001\" rx=\"8.55\" ry=\"4.94\" transform=\"rotate(-30 26.3 14.780000000000001)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"18\" cy=\"34\" r=\"13\" fill=\"url(#r27a03a)\" stroke=\"#196826\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"14.1\" cy=\"29.06\" rx=\"5.8500000000000005\" ry=\"3.38\" transform=\"rotate(-30 14.1 29.06)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"46\" cy=\"34\" r=\"13\" fill=\"url(#r27a03a)\" stroke=\"#196826\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"42.1\" cy=\"29.06\" rx=\"5.8500000000000005\" ry=\"3.38\" transform=\"rotate(-30 42.1 29.06)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"32\" cy=\"16\" r=\"12\" fill=\"url(#r4cd066)\" stroke=\"#318742\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"28.4\" cy=\"11.44\" rx=\"5.4\" ry=\"3.12\" transform=\"rotate(-30 28.4 11.44)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"24\" cy=\"26\" r=\"4\" fill=\"url(#r8bf0a0)\" stroke=\"#5a9c68\" stroke-opacity=\".4\" stroke-width=\".7\"/>","🌿":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M32 60 C32 40 32 24 32 8\" fill=\"none\" stroke=\"#2a8a3a\" stroke-width=\"3.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M32 50 C16 46 10 40 8 34 C22 34 30 40 32 50Z\" fill=\"url(#g3cc65601)\" stroke=\"#278138\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M32 39 C15 35 10 29 8 23 C22 23 30 29 32 39Z\" fill=\"url(#g3cc65601)\" stroke=\"#278138\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M32 28 C14 24 10 18 8 12 C22 12 30 18 32 28Z\" fill=\"url(#g3cc65601)\" stroke=\"#278138\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M32 44 C48 40 54 34 56 28 C42 28 34 34 32 44Z\" fill=\"url(#g2fb34401)\" stroke=\"#1f742c\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M32 33 C49 29 54 23 56 17 C42 17 34 23 32 33Z\" fill=\"url(#g2fb34401)\" stroke=\"#1f742c\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M32 22 C50 18 54 12 56 6 C42 6 34 12 32 22Z\" fill=\"url(#g2fb34401)\" stroke=\"#1f742c\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/>","🍂":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><g transform=\"rotate(25 32 32)\"><path d=\"M32 4 C50 14 56 34 44 48 C40 52 36 54 32 58 C28 54 24 52 20 48 C8 34 14 14 32 4Z\" fill=\"url(#ge8761a01)\" stroke=\"#974d11\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/></g><path d=\"M32 58 L32 24\" fill=\"none\" stroke=\"#a54a0a\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M32 44 L42 34 M32 36 L22 28\" fill=\"none\" stroke=\"#a54a0a\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M14 46 C10 52 14 58 20 56 C20 50 18 48 14 46Z\" fill=\"url(#gf5b92801)\" stroke=\"#9f781a\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/>","🍁":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M32 2 L38 16 L48 10 L46 26 L60 22 L50 34 L56 42 L40 42 L38 50 L34 48 V60 H30 V48 L26 50 L24 42 H8 L14 34 L4 22 L18 26 L16 10 L26 16Z\" fill=\"url(#gee3b3b01)\" stroke=\"#9b2626\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/>","🌸":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><g transform=\"rotate(0 32 30)\"><path d=\"M32 30 C22 24 22 6 32 6 C42 6 42 24 32 30Z\" fill=\"url(#gff8fbb01)\" stroke=\"#a65d7a\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/></g><g transform=\"rotate(72 32 30)\"><path d=\"M32 30 C22 24 22 6 32 6 C42 6 42 24 32 30Z\" fill=\"url(#gff8fbb01)\" stroke=\"#a65d7a\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/></g><g transform=\"rotate(144 32 30)\"><path d=\"M32 30 C22 24 22 6 32 6 C42 6 42 24 32 30Z\" fill=\"url(#gff8fbb01)\" stroke=\"#a65d7a\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/></g><g transform=\"rotate(216 32 30)\"><path d=\"M32 30 C22 24 22 6 32 6 C42 6 42 24 32 30Z\" fill=\"url(#gff8fbb01)\" stroke=\"#a65d7a\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/></g><g transform=\"rotate(288 32 30)\"><path d=\"M32 30 C22 24 22 6 32 6 C42 6 42 24 32 30Z\" fill=\"url(#gff8fbb01)\" stroke=\"#a65d7a\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/></g><circle cx=\"32\" cy=\"30\" r=\"6\" fill=\"url(#rffd24c)\" stroke=\"#a68831\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"30.2\" cy=\"27.72\" rx=\"2.7\" ry=\"1.56\" transform=\"rotate(-30 30.2 27.72)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"30\" cy=\"28\" r=\"2\" fill=\"url(#rfff4b8)\" stroke=\"#a69f78\" stroke-opacity=\".4\" stroke-width=\".7\"/>","🌴":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M29 60 C30 44 34 30 36 18 L40 18 C38 32 36 46 36 60Z\" fill=\"url(#ga8743a01)\" stroke=\"#6d4b26\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><g transform=\"rotate(0 38 16)\"><path d=\"M38 16 C44 6 56 6 62 14 C54 12 46 14 38 16Z\" fill=\"url(#g2fb34401)\" stroke=\"#1f742c\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/></g><g transform=\"rotate(60 38 16)\"><path d=\"M38 16 C44 6 56 6 62 14 C54 12 46 14 38 16Z\" fill=\"url(#g2fb34401)\" stroke=\"#1f742c\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/></g><g transform=\"rotate(120 38 16)\"><path d=\"M38 16 C44 6 56 6 62 14 C54 12 46 14 38 16Z\" fill=\"url(#g2fb34401)\" stroke=\"#1f742c\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/></g><g transform=\"rotate(180 38 16)\"><path d=\"M38 16 C44 6 56 6 62 14 C54 12 46 14 38 16Z\" fill=\"url(#g2fb34401)\" stroke=\"#1f742c\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/></g><g transform=\"rotate(240 38 16)\"><path d=\"M38 16 C44 6 56 6 62 14 C54 12 46 14 38 16Z\" fill=\"url(#g2fb34401)\" stroke=\"#1f742c\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/></g><g transform=\"rotate(300 38 16)\"><path d=\"M38 16 C44 6 56 6 62 14 C54 12 46 14 38 16Z\" fill=\"url(#g2fb34401)\" stroke=\"#1f742c\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/></g><circle cx=\"35\" cy=\"20\" r=\"4\" fill=\"url(#r8a5a2b)\" stroke=\"#5a3a1c\" stroke-opacity=\".4\" stroke-width=\".7\"/><circle cx=\"42\" cy=\"21\" r=\"4\" fill=\"url(#r8a5a2b)\" stroke=\"#5a3a1c\" stroke-opacity=\".4\" stroke-width=\".7\"/>","❄":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M32 31 L58.0 31.0\" fill=\"none\" stroke=\"#4dc3ff\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M32 31 L45.0 53.5\" fill=\"none\" stroke=\"#4dc3ff\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M32 31 L19.0 53.5\" fill=\"none\" stroke=\"#4dc3ff\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M32 31 L6.0 31.0\" fill=\"none\" stroke=\"#4dc3ff\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M32 31 L19.0 8.5\" fill=\"none\" stroke=\"#4dc3ff\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M32 31 L45.0 8.5\" fill=\"none\" stroke=\"#4dc3ff\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M48.0 31.0 l3.2 5.0 M48.0 31.0 l3.2 -5.0\" fill=\"none\" stroke=\"#4dc3ff\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M40.0 44.9 l-2.8 5.3 M40.0 44.9 l6.0 0.3\" fill=\"none\" stroke=\"#4dc3ff\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M24.0 44.9 l-6.0 0.3 M24.0 44.9 l2.8 5.3\" fill=\"none\" stroke=\"#4dc3ff\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M16.0 31.0 l-3.2 -5.0 M16.0 31.0 l-3.2 5.0\" fill=\"none\" stroke=\"#4dc3ff\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M24.0 17.1 l2.8 -5.3 M24.0 17.1 l-6.0 -0.3\" fill=\"none\" stroke=\"#4dc3ff\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M40.0 17.1 l6.0 -0.3 M40.0 17.1 l-2.8 -5.3\" fill=\"none\" stroke=\"#4dc3ff\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"32\" cy=\"31\" r=\"5\" fill=\"url(#re6f7ff)\" stroke=\"#96a1a6\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"30.5\" cy=\"29.1\" rx=\"2.25\" ry=\"1.3\" transform=\"rotate(-30 30.5 29.1)\" fill=\"url(#hl)\" opacity=\"0.95\"/>","☀":"<ellipse cx=\"32\" cy=\"60\" rx=\"0\" ry=\"0\" fill=\"url(#shd)\"/><line x1=\"32\" y1=\"3\" x2=\"32\" y2=\"12\" stroke=\"#ffb020\" stroke-width=\"4.5\" stroke-linecap=\"round\" transform=\"rotate(0 32 32)\"/><line x1=\"32\" y1=\"3\" x2=\"32\" y2=\"12\" stroke=\"#ffb020\" stroke-width=\"4.5\" stroke-linecap=\"round\" transform=\"rotate(45 32 32)\"/><line x1=\"32\" y1=\"3\" x2=\"32\" y2=\"12\" stroke=\"#ffb020\" stroke-width=\"4.5\" stroke-linecap=\"round\" transform=\"rotate(90 32 32)\"/><line x1=\"32\" y1=\"3\" x2=\"32\" y2=\"12\" stroke=\"#ffb020\" stroke-width=\"4.5\" stroke-linecap=\"round\" transform=\"rotate(135 32 32)\"/><line x1=\"32\" y1=\"3\" x2=\"32\" y2=\"12\" stroke=\"#ffb020\" stroke-width=\"4.5\" stroke-linecap=\"round\" transform=\"rotate(180 32 32)\"/><line x1=\"32\" y1=\"3\" x2=\"32\" y2=\"12\" stroke=\"#ffb020\" stroke-width=\"4.5\" stroke-linecap=\"round\" transform=\"rotate(225 32 32)\"/><line x1=\"32\" y1=\"3\" x2=\"32\" y2=\"12\" stroke=\"#ffb020\" stroke-width=\"4.5\" stroke-linecap=\"round\" transform=\"rotate(270 32 32)\"/><line x1=\"32\" y1=\"3\" x2=\"32\" y2=\"12\" stroke=\"#ffb020\" stroke-width=\"4.5\" stroke-linecap=\"round\" transform=\"rotate(315 32 32)\"/><circle cx=\"32\" cy=\"32\" r=\"17\" fill=\"url(#rffcb2b)\" stroke=\"#a6841c\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"26.9\" cy=\"25.54\" rx=\"7.65\" ry=\"4.42\" transform=\"rotate(-30 26.9 25.54)\" fill=\"url(#hl)\" opacity=\"0.95\"/><ellipse cx=\"26\" cy=\"26\" rx=\"6\" ry=\"3\" transform=\"rotate(-30 26 26)\" fill=\"url(#hl)\" opacity=\"0.9\"/>","🌤":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><circle cx=\"24\" cy=\"24\" r=\"14\" fill=\"url(#rffcb2b)\" stroke=\"#a6841c\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"19.8\" cy=\"18.68\" rx=\"6.3\" ry=\"3.64\" transform=\"rotate(-30 19.8 18.68)\" fill=\"url(#hl)\" opacity=\"0.95\"/><line x1=\"24\" y1=\"2\" x2=\"24\" y2=\"7\" stroke=\"#ffb020\" stroke-width=\"3.5\" stroke-linecap=\"round\" transform=\"rotate(0 24 24)\"/><line x1=\"24\" y1=\"2\" x2=\"24\" y2=\"7\" stroke=\"#ffb020\" stroke-width=\"3.5\" stroke-linecap=\"round\" transform=\"rotate(45 24 24)\"/><line x1=\"24\" y1=\"2\" x2=\"24\" y2=\"7\" stroke=\"#ffb020\" stroke-width=\"3.5\" stroke-linecap=\"round\" transform=\"rotate(90 24 24)\"/><line x1=\"24\" y1=\"2\" x2=\"24\" y2=\"7\" stroke=\"#ffb020\" stroke-width=\"3.5\" stroke-linecap=\"round\" transform=\"rotate(135 24 24)\"/><line x1=\"24\" y1=\"2\" x2=\"24\" y2=\"7\" stroke=\"#ffb020\" stroke-width=\"3.5\" stroke-linecap=\"round\" transform=\"rotate(180 24 24)\"/><line x1=\"24\" y1=\"2\" x2=\"24\" y2=\"7\" stroke=\"#ffb020\" stroke-width=\"3.5\" stroke-linecap=\"round\" transform=\"rotate(225 24 24)\"/><line x1=\"24\" y1=\"2\" x2=\"24\" y2=\"7\" stroke=\"#ffb020\" stroke-width=\"3.5\" stroke-linecap=\"round\" transform=\"rotate(270 24 24)\"/><line x1=\"24\" y1=\"2\" x2=\"24\" y2=\"7\" stroke=\"#ffb020\" stroke-width=\"3.5\" stroke-linecap=\"round\" transform=\"rotate(315 24 24)\"/><circle cx=\"24\" cy=\"24\" r=\"12\" fill=\"url(#rffcb2b)\" stroke=\"#a6841c\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"20.4\" cy=\"19.439999999999998\" rx=\"5.4\" ry=\"3.12\" transform=\"rotate(-30 20.4 19.439999999999998)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"30\" cy=\"44\" r=\"12\" fill=\"url(#reef3fb)\" stroke=\"#9b9ea3\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"26.4\" cy=\"39.44\" rx=\"5.4\" ry=\"3.12\" transform=\"rotate(-30 26.4 39.44)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"44\" cy=\"40\" r=\"14\" fill=\"url(#rf8fbff)\" stroke=\"#a1a3a6\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"39.8\" cy=\"34.68\" rx=\"6.3\" ry=\"3.64\" transform=\"rotate(-30 39.8 34.68)\" fill=\"url(#hl)\" opacity=\"0.95\"/><rect x=\"18\" y=\"44\" width=\"40\" height=\"14\" rx=\"7\" fill=\"url(#ge3eaf601)\" stroke=\"#9498a0\" stroke-opacity=\".45\" stroke-width=\".8\"/><circle cx=\"40\" cy=\"38\" r=\"10\" fill=\"url(#rffffff)\" stroke=\"#a6a6a6\" stroke-opacity=\".4\" stroke-width=\".7\"/>","🌇":"<ellipse cx=\"32\" cy=\"60\" rx=\"0\" ry=\"0\" fill=\"url(#shd)\"/><rect x=\"4\" y=\"8\" width=\"56\" height=\"48\" rx=\"6\" fill=\"url(#g6a5af901)\" stroke=\"#453aa2\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"5\" y=\"9\" width=\"54\" height=\"20.2\" rx=\"5\" fill=\"#fff\" opacity=\".22\"/><path d=\"M4 38 H60 V56 H4Z\" fill=\"url(#gff7a3d01)\" stroke=\"#a64f28\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M16 38 a16 16 0 0 1 32 0Z\" fill=\"url(#gffcb2b01)\" stroke=\"#a6841c\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M10 44 H54 M14 50 H50\" fill=\"none\" stroke=\"#fff\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><rect x=\"8\" y=\"26\" width=\"8\" height=\"12\" rx=\"1\" fill=\"url(#g3b2a7a01)\" stroke=\"#261b4f\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"46\" y=\"22\" width=\"10\" height=\"16\" rx=\"1\" fill=\"url(#g3b2a7a01)\" stroke=\"#261b4f\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"18\" y=\"30\" width=\"6\" height=\"8\" rx=\"1\" fill=\"url(#g3b2a7a01)\" stroke=\"#261b4f\" stroke-opacity=\".45\" stroke-width=\".8\"/>","🌙":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M44 6 C22 6 10 24 16 42 C22 58 44 62 56 50 C38 52 28 36 34 22 C37 14 41 9 44 6Z\" fill=\"url(#gffd43b01)\" stroke=\"#a68a26\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><circle cx=\"44\" cy=\"18\" r=\"3\" fill=\"url(#rffffff)\" stroke=\"#a6a6a6\" stroke-opacity=\".4\" stroke-width=\".7\"/><circle cx=\"54\" cy=\"30\" r=\"2\" fill=\"url(#rffffff)\" stroke=\"#a6a6a6\" stroke-opacity=\".4\" stroke-width=\".7\"/>","🌊":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M2 36 C8 20 24 16 34 24 C42 30 40 38 32 38 C26 38 24 32 30 30 C20 26 12 38 14 56 H2Z\" fill=\"url(#g2f9bff01)\" stroke=\"#1f65a6\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M2 44 C14 36 26 44 36 40 C46 36 54 40 62 36 V58 H2Z\" fill=\"url(#g1a7ae001)\" stroke=\"#114f92\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M2 52 C14 46 26 54 36 50 C46 46 54 50 62 46 V60 H2Z\" fill=\"url(#g4db0ff01)\" stroke=\"#3272a6\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/>","🐋":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M2 34 C2 18 18 10 34 10 C50 10 62 20 62 34 C62 48 50 54 38 54 C24 54 2 54 2 34Z\" fill=\"url(#g3b82f601)\" stroke=\"#2654a0\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M44 12 C50 2 58 2 62 6 C58 10 54 14 50 18Z\" fill=\"url(#g2f6fd901)\" stroke=\"#1f488d\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M14 40 C22 52 40 52 52 44 C46 50 24 56 14 40Z\" fill=\"url(#gcfe6ff01)\" stroke=\"#8796a6\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><circle cx=\"18\" cy=\"28\" r=\"2.6\" fill=\"url(#r0b1630)\" stroke=\"#070e1f\" stroke-opacity=\".4\" stroke-width=\".7\"/><path d=\"M20 6 C18 0 24 0 22 6 M24 6 C26 0 30 0 28 6\" fill=\"none\" stroke=\"#8fd0ff\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M26 46 L32 58 L38 50Z\" fill=\"url(#g2f6fd901)\" stroke=\"#1f488d\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/>","🐢":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M8 44 C8 22 24 14 36 16 C50 18 58 30 56 44Z\" fill=\"url(#g2fb34401)\" stroke=\"#1f742c\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><polygon points=\"18,22 25,18 32,22 32,29 25,33 18,29\" fill=\"#1f8a34\" opacity=\".7\"/><polygon points=\"32,22 39,18 46,22 46,29 39,33 32,29\" fill=\"#1f8a34\" opacity=\".7\"/><polygon points=\"25,32 32,28 39,32 39,39 32,43 25,39\" fill=\"#1f8a34\" opacity=\".7\"/><polygon points=\"39,32 46,28 53,32 53,39 46,43 39,39\" fill=\"#1f8a34\" opacity=\".7\"/><rect x=\"48\" y=\"28\" width=\"14\" height=\"14\" rx=\"7\" fill=\"url(#g9ee86a01)\" stroke=\"#679745\" stroke-opacity=\".45\" stroke-width=\".8\"/><circle cx=\"57\" cy=\"33\" r=\"1.8\" fill=\"url(#r111827)\" stroke=\"#0b1019\" stroke-opacity=\".4\" stroke-width=\".7\"/><rect x=\"14\" y=\"44\" width=\"8\" height=\"12\" rx=\"4\" fill=\"url(#g9ee86a01)\" stroke=\"#679745\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"40\" y=\"44\" width=\"8\" height=\"12\" rx=\"4\" fill=\"url(#g9ee86a01)\" stroke=\"#679745\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"4\" y=\"44\" width=\"6\" height=\"6\" rx=\"3\" fill=\"url(#g9ee86a01)\" stroke=\"#679745\" stroke-opacity=\".45\" stroke-width=\".8\"/>","🍩":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><circle cx=\"32\" cy=\"32\" r=\"27\" fill=\"url(#re8a85a)\" stroke=\"#976d3a\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"23.9\" cy=\"21.740000000000002\" rx=\"12.15\" ry=\"7.0200000000000005\" transform=\"rotate(-30 23.9 21.740000000000002)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"32\" cy=\"32\" r=\"24\" fill=\"url(#rff7fb0)\" stroke=\"#a65372\" stroke-opacity=\".4\" stroke-width=\".7\"/><ellipse cx=\"24.8\" cy=\"22.88\" rx=\"10.8\" ry=\"6.24\" transform=\"rotate(-30 24.8 22.88)\" fill=\"url(#hl)\" opacity=\"0.95\"/><circle cx=\"32\" cy=\"32\" r=\"8\" fill=\"url(#rf6f1e7)\" stroke=\"#a09d96\" stroke-opacity=\".4\" stroke-width=\".7\"/><circle cx=\"32\" cy=\"32\" r=\"8\" fill=\"none\" stroke=\"#c98a3a\" stroke-width=\"1.2\"/><rect x=\"16\" y=\"22\" width=\"5\" height=\"2.2\" rx=\"1\" fill=\"#fff\" transform=\"rotate(30 16 22)\"/><rect x=\"44\" y=\"20\" width=\"5\" height=\"2.2\" rx=\"1\" fill=\"#ffe27a\" transform=\"rotate(-40 44 20)\"/><rect x=\"48\" y=\"36\" width=\"5\" height=\"2.2\" rx=\"1\" fill=\"#7cf0b0\" transform=\"rotate(70 48 36)\"/><rect x=\"30\" y=\"50\" width=\"5\" height=\"2.2\" rx=\"1\" fill=\"#8fe0ff\" transform=\"rotate(10 30 50)\"/><rect x=\"16\" y=\"40\" width=\"5\" height=\"2.2\" rx=\"1\" fill=\"#fff\" transform=\"rotate(-30 16 40)\"/><rect x=\"38\" y=\"14\" width=\"5\" height=\"2.2\" rx=\"1\" fill=\"#8fe0ff\" transform=\"rotate(80 38 14)\"/>","🥧":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><path d=\"M4 34 H60 C60 48 48 56 32 56 C16 56 4 48 4 34Z\" fill=\"url(#ge8a85a01)\" stroke=\"#976d3a\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M4 34 C4 18 18 8 32 8 C46 8 60 18 60 34Z\" fill=\"url(#gf4c27a01)\" stroke=\"#9f7e4f\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M32 8 V34 M18 14 L26 34 M46 14 L38 34\" fill=\"none\" stroke=\"#c98a3a\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"32\" cy=\"4\" r=\"0\" fill=\"url(#rfff)\" stroke=\"#a6a6a6\" stroke-opacity=\".4\" stroke-width=\".7\"/>","💼":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"22\" y=\"6\" width=\"20\" height=\"12\" rx=\"4\" fill=\"url(#g8a5a3a01)\" stroke=\"#5a3a26\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"27\" y=\"10\" width=\"10\" height=\"5\" rx=\"2\" fill=\"#2b1a0e\" opacity=\".55\"/><rect x=\"4\" y=\"16\" width=\"56\" height=\"40\" rx=\"6\" fill=\"url(#ga8683a01)\" stroke=\"#6d4426\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"5\" y=\"17\" width=\"54\" height=\"16.8\" rx=\"5\" fill=\"#fff\" opacity=\".22\"/><rect x=\"4\" y=\"30\" width=\"56\" height=\"3\" fill=\"#5a3410\" opacity=\".5\"/><rect x=\"27\" y=\"28\" width=\"10\" height=\"10\" rx=\"2.5\" fill=\"url(#gf7c52b01)\" stroke=\"#a1801c\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"28\" y=\"29\" width=\"8\" height=\"4.2\" rx=\"1.5\" fill=\"#fff\" opacity=\".22\"/>","📆":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"6\" y=\"10\" width=\"52\" height=\"48\" rx=\"6\" fill=\"url(#gfbfcff01)\" stroke=\"#a3a4a6\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"7\" y=\"11\" width=\"50\" height=\"20.2\" rx=\"5\" fill=\"#fff\" opacity=\".22\"/><path d=\"M6 16 a6 6 0 0 1 6-6 H52 a6 6 0 0 1 6 6 V26 H6Z\" fill=\"url(#g3b82f601)\" stroke=\"#2654a0\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><text x=\"32\" y=\"52\" text-anchor=\"middle\" font-family=\"Arial Black,Arial,sans-serif\" font-weight=\"900\" font-size=\"20\" fill=\"#e5484d\">15</text><circle cx=\"18\" cy=\"8\" r=\"3\" fill=\"#8a93a8\"/><circle cx=\"46\" cy=\"8\" r=\"3\" fill=\"#8a93a8\"/>","🗓":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"6\" y=\"10\" width=\"52\" height=\"48\" rx=\"6\" fill=\"url(#gfbfcff01)\" stroke=\"#a3a4a6\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"7\" y=\"11\" width=\"50\" height=\"20.2\" rx=\"5\" fill=\"#fff\" opacity=\".22\"/><rect x=\"6\" y=\"10\" width=\"52\" height=\"12\" rx=\"5\" fill=\"url(#g22b45f01)\" stroke=\"#16753e\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"7\" y=\"11\" width=\"50\" height=\"5.0\" rx=\"4\" fill=\"#fff\" opacity=\".22\"/><rect x=\"12\" y=\"4\" width=\"4\" height=\"12\" rx=\"2\" fill=\"#6b7487\"/><rect x=\"22\" y=\"4\" width=\"4\" height=\"12\" rx=\"2\" fill=\"#6b7487\"/><rect x=\"32\" y=\"4\" width=\"4\" height=\"12\" rx=\"2\" fill=\"#6b7487\"/><rect x=\"42\" y=\"4\" width=\"4\" height=\"12\" rx=\"2\" fill=\"#6b7487\"/><rect x=\"52\" y=\"4\" width=\"4\" height=\"12\" rx=\"2\" fill=\"#6b7487\"/><rect x=\"12\" y=\"30\" width=\"6\" height=\"6\" rx=\"1.5\" fill=\"#c9d3ec\"/><rect x=\"22\" y=\"30\" width=\"6\" height=\"6\" rx=\"1.5\" fill=\"#ffb37a\"/><rect x=\"32\" y=\"30\" width=\"6\" height=\"6\" rx=\"1.5\" fill=\"#9fd4ff\"/><rect x=\"42\" y=\"30\" width=\"6\" height=\"6\" rx=\"1.5\" fill=\"#c9d3ec\"/><rect x=\"52\" y=\"30\" width=\"6\" height=\"6\" rx=\"1.5\" fill=\"#ffb37a\"/><rect x=\"12\" y=\"40\" width=\"6\" height=\"6\" rx=\"1.5\" fill=\"#ffb37a\"/><rect x=\"22\" y=\"40\" width=\"6\" height=\"6\" rx=\"1.5\" fill=\"#9fd4ff\"/><rect x=\"32\" y=\"40\" width=\"6\" height=\"6\" rx=\"1.5\" fill=\"#c9d3ec\"/><rect x=\"42\" y=\"40\" width=\"6\" height=\"6\" rx=\"1.5\" fill=\"#ffb37a\"/><rect x=\"52\" y=\"40\" width=\"6\" height=\"6\" rx=\"1.5\" fill=\"#9fd4ff\"/><rect x=\"12\" y=\"50\" width=\"6\" height=\"6\" rx=\"1.5\" fill=\"#9fd4ff\"/><rect x=\"22\" y=\"50\" width=\"6\" height=\"6\" rx=\"1.5\" fill=\"#c9d3ec\"/><rect x=\"32\" y=\"50\" width=\"6\" height=\"6\" rx=\"1.5\" fill=\"#ffb37a\"/><rect x=\"42\" y=\"50\" width=\"6\" height=\"6\" rx=\"1.5\" fill=\"#9fd4ff\"/><rect x=\"52\" y=\"50\" width=\"6\" height=\"6\" rx=\"1.5\" fill=\"#c9d3ec\"/>","↩":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"4\" y=\"4\" width=\"56\" height=\"56\" rx=\"13\" fill=\"url(#gf5883b01)\" stroke=\"#9f5826\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"5\" y=\"5\" width=\"54\" height=\"23.5\" rx=\"12\" fill=\"#fff\" opacity=\".22\"/><path d=\"M44 44 H26 a12 12 0 0 1 0-24 H46\" fill=\"none\" stroke=\"#fff\" stroke-width=\"6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M24 10 L8 20 L24 30Z\" fill=\"url(#gfff01)\" stroke=\"#a6a6a6\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/>","↪":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><rect x=\"4\" y=\"4\" width=\"56\" height=\"56\" rx=\"13\" fill=\"url(#g3b82f601)\" stroke=\"#2654a0\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"5\" y=\"5\" width=\"54\" height=\"23.5\" rx=\"12\" fill=\"#fff\" opacity=\".22\"/><path d=\"M20 44 H38 a12 12 0 0 0 0-24 H18\" fill=\"none\" stroke=\"#fff\" stroke-width=\"6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M40 10 L56 20 L40 30Z\" fill=\"url(#gfff01)\" stroke=\"#a6a6a6\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/>","✏":"<ellipse cx=\"32\" cy=\"59\" rx=\"20\" ry=\"3.4\" fill=\"url(#shd)\"/><g transform=\"rotate(40 32 32)\"><rect x=\"26\" y=\"4\" width=\"12\" height=\"40\" rx=\"2\" fill=\"url(#gf5b92801)\" stroke=\"#9f781a\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"27\" y=\"5\" width=\"10\" height=\"16.8\" rx=\"1\" fill=\"#fff\" opacity=\".22\"/><rect x=\"26\" y=\"4\" width=\"12\" height=\"8\" rx=\"3\" fill=\"url(#gee6a8a01)\" stroke=\"#9b455a\" stroke-opacity=\".45\" stroke-width=\".8\"/><rect x=\"26\" y=\"10\" width=\"12\" height=\"4\" rx=\"0\" fill=\"url(#gc9ced801)\" stroke=\"#83868c\" stroke-opacity=\".45\" stroke-width=\".8\"/><path d=\"M26 44 H38 L32 58Z\" fill=\"url(#gf5d3a101)\" stroke=\"#9f8969\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/><path d=\"M29.300 52 H34.700 L32 58Z\" fill=\"url(#g3a2a1a01)\" stroke=\"#261b11\" stroke-opacity=\".45\" stroke-width=\"0.8\" stroke-linejoin=\"round\"/></g>"};
const PIC_RX = /(?:[\u{1F000}-\u{1FFFF}]|[\u2600-\u27BF\u2B00-\u2BFF\u23E9-\u23FF\u21A9\u21AA])\uFE0F?(?:\u200D(?:[\u{1F000}-\u{1FFFF}]|[\u2600-\u27BF\u2640\u2642])\uFE0F?)*/gu;
const PIC_ROOTS = '#parts-view,.parts-modals';
function picKey(ch){ const k=ch.replace(/\uFE0F/g,''); if(PIC3[k]) return k; if(k.indexOf('\u200D')>0){ const f=k.split('\u200D')[0]; if(PIC3[f]) return f; } return k; }
function picOk(k){ return !!(PIC3[k]||PIC_GMAP[k]); }
function picGlyph(k){ const g=PIC_GMAP[k]; return (PIC_MODE!=='3d' && g && PIC_G[g]) ? g : (PIC3[k] ? null : (g&&PIC_G[g]?g:null)); }
function picChar(k){ const cp=k.codePointAt(0); return (cp>=0x2190&&cp<0x1F000)?k+'\uFE0F':k; }
function picSvg(k){
  const s=document.createElementNS('http://www.w3.org/2000/svg','svg'), g=picGlyph(k);
  s.setAttribute('aria-hidden','true'); s.setAttribute('data-e',k);
  if(g){ s.setAttribute('viewBox','0 0 24 24'); s.setAttribute('class','pic pic-'+g); s.innerHTML=PIC_G[g]; }
  else { s.setAttribute('viewBox','0 0 64 64'); s.setAttribute('class','pic3'); s.innerHTML=PIC3[k]; }
  return s;
}
function picHtml(ch){ const k=picKey(ch); if(PIC_MODE==='emoji'||!picOk(k)) return ch; const g=picGlyph(k);
  return g?'<svg class="pic pic-'+g+'" data-e="'+k+'" viewBox="0 0 24 24" aria-hidden="true">'+PIC_G[g]+'</svg>':'<svg class="pic3" data-e="'+k+'" viewBox="0 0 64 64" aria-hidden="true">'+PIC3[k]+'</svg>'; }
function picStrip(str){ if(PIC_MODE==='emoji') return String(str); return String(str).replace(PIC_RX,m=>picOk(picKey(m))?'':m).replace(/^\s+|\s+$/g,'').replace(/\s{2,}/g,' '); }
const PIC_SKIP = {SCRIPT:1,STYLE:1,TEXTAREA:1,OPTION:1,TITLE:1,NOSCRIPT:1};
function picText(tn){
  if(PIC_MODE==='emoji') return;
  const v=tn.nodeValue; if(!v || v.length>20000) return;
  PIC_RX.lastIndex=0; if(!PIC_RX.test(v)) return;
  const p=tn.parentNode; if(!p) return;
  if(p.closest && p.closest('[data-nopic]')) return;
  if(p.nodeType===1){
    if(PIC_SKIP[p.nodeName]){ if(p.nodeName==='OPTION'||p.nodeName==='TITLE'){ const nv=picStrip(v); if(nv!==v) tn.nodeValue=nv; } return; }
    if(p.namespaceURI==='http://www.w3.org/2000/svg' && p.nodeName!=='svg'){ const nv=v.replace(PIC_RX,m=>picOk(picKey(m))?'':m).replace(/^\s+/,''); if(nv!==v) tn.nodeValue=nv; return; }
  }
  PIC_RX.lastIndex=0;
  const frag=document.createDocumentFragment(); let last=0, any=false, mm;
  while((mm=PIC_RX.exec(v))){
    const k=picKey(mm[0]); if(!picOk(k)) continue;
    if(mm.index>last) frag.appendChild(document.createTextNode(v.slice(last,mm.index)));
    frag.appendChild(picSvg(k)); last=mm.index+mm[0].length; any=true;
  }
  if(!any) return;
  if(last<v.length) frag.appendChild(document.createTextNode(v.slice(last)));
  p.replaceChild(frag,tn);
}
const PIC_ATTRS=['title','placeholder','data-tip','aria-label','alt'];
function picScan(root){
  if(!root || PIC_MODE==='emoji') return;
  if(root.nodeType===3){ picText(root); return; }
  if(root.nodeType!==1) return;
  const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);
  const texts=[], els=[root]; let n;
  while((n=w.nextNode())){ if(n.nodeType===3){ PIC_RX.lastIndex=0; if(PIC_RX.test(n.nodeValue)) texts.push(n); } else if(!(n.classList&&n.classList.contains('pic3'))) els.push(n); }
  texts.forEach(picText);
  els.forEach(e=>{ for(const a of PIC_ATTRS){ if(e.hasAttribute && e.hasAttribute(a)){ const v=e.getAttribute(a); PIC_RX.lastIndex=0; if(PIC_RX.test(v)){ const nv=picStrip(v); if(nv!==v) e.setAttribute(a,nv); } } } });
}
function picInRoot(n){ const e=n.nodeType===1?n:n.parentElement; return !!(e && e.closest && e.closest(PIC_ROOTS)); }
let PIC_BUSY=false;
const picObs=new MutationObserver(muts=>{
  if(PIC_BUSY||PIC_MODE==='emoji') return; PIC_BUSY=true;
  try{
    for(const mu of muts){
      if(mu.type==='childList'){
        mu.addedNodes.forEach(n=>{
          if(n.nodeType===3){ if(picInRoot(n)) picText(n); }
          else if(n.nodeType===1){
            if(n.classList && n.classList.contains('pic3')) return;
            if(picInRoot(n)) picScan(n);
            else if(n.querySelector){ n.querySelectorAll(PIC_ROOTS).forEach(picScan); }
          }
        });
      } else if(mu.type==='characterData'){ if(picInRoot(mu.target)) picText(mu.target); }
    }
  } finally { PIC_BUSY=false; }
});
function picStart(){
  document.documentElement.setAttribute('data-pics',PIC_MODE);
  if(!document.getElementById('pic3Defs')){
    const d=document.createElement('div'); d.id='pic3Defs'; d.setAttribute('aria-hidden','true'); d.style.cssText='position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;';
    d.innerHTML='<svg width="0" height="0" focusable="false"><defs>'+PIC3_DEFS+'</defs></svg>'; document.body.insertBefore(d,document.body.firstChild);
  }
  document.querySelectorAll(PIC_ROOTS).forEach(picScan);
  picObs.observe(document.body,{childList:true,subtree:true,characterData:true});
}
if(document.body) picStart(); else document.addEventListener('DOMContentLoaded',picStart);

/* تغییر سبک آیکون‌ها: emoji | 3d | s1 | s3 | s6 | s7 */
(function(){ try{ if(PIC3['✏']) PIC3['✎']=PIC3['✏']; PIC_GMAP['✎']=PIC_GMAP['✏']||'pencil'; }catch(e){} })();
const PIC_MODES=['emoji','3d','s1','s2','s3','s4','s5','s6','s7','s8','s9','s10','s11','s12'];
function picApply(mode){
  if(!PIC_MODES.includes(mode)) mode='3d';
  const prev=PIC_MODE; PIC_MODE=mode;
  document.documentElement.setAttribute('data-pics',mode);
  if(prev===mode) return;
  PIC_BUSY=true;
  try{
    document.querySelectorAll('svg[data-e]').forEach(s=>{
      if(s.closest('[data-nopic]')) return;
      const k=s.getAttribute('data-e');
      if(mode==='emoji') s.replaceWith(document.createTextNode(picChar(k)));
      else s.replaceWith(picSvg(k));
    });
    if(prev==='emoji') document.querySelectorAll(PIC_ROOTS).forEach(picScan);
  } finally { PIC_BUSY=false; }
}
/* پیام‌های toast بدون اموجی */
(function(){
  try{
    if(typeof window.showToast==='function' && !window.showToast.__pic){
      const orig=window.showToast;
      const w=function(m,t){ return orig.call(this, typeof m==='string'?picStrip(m):m, t); };
      w.__pic=1; window.showToast=w;
    }
  }catch(e){}
})();

/* ══════════════════════════════════════════════════════════════════
   SL — لیست و جدول هوشمند (پیشوند sl)
   • همه‌ی جدول‌های بخش قطعات: کلیک روی سرستون = مرتب‌سازی (صعودی ← نزولی ← حالت اول)،
     قیف کنار سرستون = فیلتر ستون (متن، بازه‌ی عددی/تاریخ، تیک‌زدن مقدارها)، جستجوی کلی بالای جدول.
   • همه‌ی لیست‌های کارتی (کالا، فروش، خرید، …): نوار «مرتب‌سازی و فیلتر» با همین امکانات.
   ══════════════════════════════════════════════════════════════════ */
const SL_COLL = (()=>{ try{ return new Intl.Collator('fa',{numeric:true,sensitivity:'base'}); }catch(e){ return {compare:(a,b)=>String(a).localeCompare(String(b))}; } })();
const SL_STRIP = /[⁦-⁩‎‏‪-‮‌]/g;
function slFaDigits(s){ return String(s).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)); }
function slClean(s){ return slFaDigits(String(s==null?'':s).replace(SL_STRIP,'')).replace(/\s+/g,' ').trim(); }
// متن یک خانه ← {s: متن، n: عدد یا null، d: true اگر تاریخ}
function slParse(txt){
  const s = slClean(txt);
  if(!s) return {s:'',n:null,d:false};
  let m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?!\d)/);
  if(m) return {s, n:(+m[1])*10000+(+m[2])*100+(+m[3]), d:true};
  const t = s.replace(/[−–—]/g,'-').replace(/٫/g,'.');
  m = t.match(/^([+\-]?)\s*(\d[\d,٬]*(?:\.\d+)?)/);
  if(m){
    const rest = t.slice(m[0].length);
    if(!/\d/.test(rest) && rest.length<=14){ const n = parseFloat(m[2].replace(/[,٬]/g,'')); if(isFinite(n)) return {s, n:(m[1]==='-'?-n:n), d:false}; }
  }
  return {s,n:null,d:false};
}
function slFmtN(n){ if(n==null||!isFinite(n)) return ''; return Math.abs(n)>=1e15 ? String(n) : (Math.round(n*100)/100).toLocaleString('en-US'); }
function slEsc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function slDateN(iso){ try{ const j=isoToJ(iso); return j.y*10000+j.m*100+j.d; }catch(e){ return null; } }
function slDateLabel(n){ if(n==null) return ''; const y=Math.floor(n/10000), m=Math.floor(n/100)%100, d=n%100; return y+'/'+String(m).padStart(2,'0')+'/'+String(d).padStart(2,'0'); }
function slParseDateIn(s){ const p = slParse(s); return p.d ? p.n : null; }

/* ── منطق مشترک فیلتر (روی مقدار {s,n}) ── */
function slActive(cur){ return !!(cur && ((cur.txt&&cur.txt.trim()) || cur.min!=null || cur.max!=null || (cur.vals && cur.vals.size>=0 && cur.vals instanceof Set))); }
function slPassCol(cur, v){
  if(!cur) return true;
  if(cur.txt && cur.txt.trim() && !slClean(v.s).toLowerCase().includes(slClean(cur.txt).toLowerCase())) return false;
  if(cur.min!=null || cur.max!=null){
    if(v.n==null) return false;
    if(cur.min!=null && v.n<cur.min) return false;
    if(cur.max!=null && v.n>cur.max) return false;
  }
  if(cur.vals instanceof Set && !cur.vals.has(v.s)) return false;
  return true;
}
function slCmp(a, b, dir){   // مقدارهای خالی همیشه آخر
  const ea = (a.n==null && !a.s), eb = (b.n==null && !b.s);
  if(ea && eb) return 0; if(ea) return 1; if(eb) return -1;
  let r;
  if(a.n!=null && b.n!=null) r = a.n-b.n; else if(a.n!=null) r = -1; else if(b.n!=null) r = 1; else r = SL_COLL.compare(a.s,b.s);
  return r*dir;
}

/* ══ پنجره‌ی فیلتر ستون (مشترک بین جدول و لیست) ══ */
let SLP = null;   // {el, spec}
function slPopClose(){ if(SLP){ SLP.el.remove(); SLP=null; document.removeEventListener('mousedown',slPopOut,true); document.removeEventListener('keydown',slPopKey,true); } }
function slPopOut(e){ if(SLP && !SLP.el.contains(e.target) && !(e.target.closest && e.target.closest('.sl-fb'))) slPopClose(); }
function slPopKey(e){ if(e.key==='Escape') slPopClose(); }
/* spec: {title, kind:'text'|'num'|'date', vals:[{s,c}], cur, sortDir, onSort(dir|null), onApply(cur|null), anchor} */
function slPopOpen(spec){
  slPopClose();
  const cur = spec.cur ? {txt:spec.cur.txt||'', min:spec.cur.min==null?null:spec.cur.min, max:spec.cur.max==null?null:spec.cur.max, vals:(spec.cur.vals instanceof Set)?new Set(spec.cur.vals):null} : {txt:'',min:null,max:null,vals:null};
  const el = document.createElement('div'); el.className='sl-pop'; el.setAttribute('data-nopic','1'); el.setAttribute('dir','rtl');
  const isN = spec.kind==='num', isD = spec.kind==='date';
  const showVals = spec.vals && spec.vals.length>0 && spec.vals.length<=60;
  const inpV = (n)=> n==null ? '' : (isD ? slDateLabel(n) : String(n));
  el.innerHTML = `
    <div class="sl-pop-h"><b>${slEsc(spec.title||'')}</b><button type="button" class="sl-x" aria-label="بستن">✕</button></div>
    <div class="sl-pop-sort">
      <button type="button" data-d="asc" class="${spec.sortDir==='asc'?'on':''}">${isN||isD?'کم ← زیاد':'الف ← ی'}</button>
      <button type="button" data-d="desc" class="${spec.sortDir==='desc'?'on':''}">${isN||isD?'زیاد ← کم':'ی ← الف'}</button>
    </div>
    ${isN||isD ? `<div class="sl-pop-rng"><label>از<input class="sl-in" dir="ltr" data-r="min" placeholder="${isD?'1405/01/01':'کمینه'}" value="${inpV(cur.min)}"></label><label>تا<input class="sl-in" dir="ltr" data-r="max" placeholder="${isD?'1405/12/29':'بیشینه'}" value="${inpV(cur.max)}"></label></div>
      ${isD?'<div class="sl-pop-pre"></div>':''}` : ''}
    <input class="sl-in sl-pop-txt" data-r="txt" placeholder="${isN||isD?'یا متنِ شامل…':'شامل این متن…'}" value="${slEsc(cur.txt)}">
    ${showVals ? `<div class="sl-pop-vh"><span>مقدارها</span><a data-a="all">همه</a><a data-a="none">هیچ</a></div><div class="sl-pop-vals">${spec.vals.map((v,i)=>`<label class="sl-pv"><input type="checkbox" data-i="${i}" ${(!cur.vals||cur.vals.has(v.s))?'checked':''}><span>${slEsc(v.s||'(خالی)')}</span><em>${v.c}</em></label>`).join('')}</div>` : ''}
    <div class="sl-pop-f"><button type="button" class="sl-btn ghost" data-a="clear">پاک کردن فیلتر</button><button type="button" class="sl-btn" data-a="ok">اعمال</button></div>`;
  document.body.appendChild(el);
  if(isD){
    const pre = el.querySelector('.sl-pop-pre'); const t = isoToday(), j = isoToJ(t);
    const add = (lab, a, b)=>{ const x=document.createElement('button'); x.type='button'; x.textContent=lab; x.onclick=()=>{ el.querySelector('[data-r=min]').value=slDateLabel(a); el.querySelector('[data-r=max]').value=slDateLabel(b); }; pre.appendChild(x); };
    const addDays = (iso,k)=>{ const d=new Date(iso+'T00:00:00'); d.setDate(d.getDate()+k); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
    add('امروز', slDateN(t), slDateN(t)); add('۷ روز اخیر', slDateN(addDays(t,-6)), slDateN(t)); add('۳۰ روز اخیر', slDateN(addDays(t,-29)), slDateN(t));
    add('این ماه', slDateN(jalaliStartOfMonth(t)), slDateN(jalaliEndOfMonth(t))); add('امسال', j.y*10000+101, j.y*10000+1231);
  }
  const place = ()=>{
    const r = spec.anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    let x = r.left + r.width/2 - w/2, y = r.bottom + 6;
    x = Math.max(8, Math.min(x, innerWidth - w - 8)); if(y + h > innerHeight - 8) y = Math.max(8, r.top - h - 6);
    el.style.left = x+'px'; el.style.top = y+'px';
  };
  place();
  SLP = {el, spec};
  const collect = ()=>{
    const o = {txt:el.querySelector('[data-r=txt]').value.trim(), min:null, max:null, vals:null};
    if(isN||isD){
      const rd = (k)=>{ const s=el.querySelector('[data-r='+k+']').value; if(!s.trim()) return null; if(isD) return slParseDateIn(s); const n=parseFloat(slFaDigits(s).replace(/[,٬\s]/g,'')); return isFinite(n)?n:null; };
      o.min = rd('min'); o.max = rd('max');
    }
    if(showVals){
      const boxes=[...el.querySelectorAll('.sl-pop-vals input')], on=boxes.filter(b=>b.checked);
      if(on.length!==boxes.length) o.vals = new Set(on.map(b=>spec.vals[+b.dataset.i].s));
    }
    return o;
  };
  const apply = ()=>{ const o = collect(); spec.onApply(slActive(o)?o:null); slPopClose(); };
  el.querySelector('.sl-x').onclick = slPopClose;
  el.querySelectorAll('.sl-pop-sort button').forEach(b=>b.onclick=()=>{ spec.onSort(spec.sortDir===b.dataset.d?null:b.dataset.d); slPopClose(); });
  el.querySelector('[data-a=ok]').onclick = apply;
  el.querySelector('[data-a=clear]').onclick = ()=>{ spec.onApply(null); slPopClose(); };
  el.querySelectorAll('.sl-in').forEach(i=>i.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); apply(); } }));
  el.querySelectorAll('.sl-pop-vh a').forEach(a=>a.onclick=()=>{ el.querySelectorAll('.sl-pop-vals input').forEach(b=>b.checked=a.dataset.a==='all'); });
  document.addEventListener('mousedown',slPopOut,true); document.addEventListener('keydown',slPopKey,true);
  const f = el.querySelector('.sl-in'); if(f) setTimeout(()=>{ try{ f.focus({preventScroll:true}); }catch(e){} },0);
}
const SL_FUNNEL = '<svg class="sl-fi" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3h12l-4.6 5.4V13l-2.8-1.6V8.4z" fill="currentColor"/></svg>';

/* ══════════════════════════════════════════════════════════════════
   ۱) جدول‌ها — به‌صورت خودکار روی همه‌ی <table> های بخش قطعات
   ══════════════════════════════════════════════════════════════════ */
const SLT = {};            // وضعیت هر جدول (با کلید پایدار) ← {sort:{c,d}, flt:{c:cur}, q}
let SLT_BUSY = false;
const SLT_PIN = /^(جمع|مجموع|کل\b|نتیجه|total|sum)/i;
function slTKey(t){
  if(t.dataset.slk) return t.dataset.slk;
  let k = t.id;
  if(!k){
    const anc = t.parentElement && t.parentElement.closest('[id]');
    const sibs = anc ? [...anc.querySelectorAll('table')] : [];
    k = (anc?anc.id:'doc') + '#' + Math.max(0, sibs.indexOf(t));
  }
  const heads = [...t.querySelectorAll('thead th')].map(h=>slClean(h.textContent)).join('|');
  k += '::' + heads; t.dataset.slk = k; return k;
}
function slTInfo(t){
  const thead = t.tHead; if(!thead || !thead.rows.length) return null;
  const hr = thead.rows[thead.rows.length-1], ths = [...hr.cells];
  if(!ths.length || ths.some(h=>h.colSpan>1)) return null;
  const bodies = t.tBodies; if(bodies.length!==1) return null;
  return {thead, ths, body:bodies[0], n:ths.length};
}
// ردیف‌ها را به «گروه» تبدیل می‌کند: ردیف اصلی + ردیف‌های جزئیاتِ پشتِ آن
function slTGroups(info){
  const groups = [], pinned = [], lead = []; let last = null;
  [...info.body.rows].forEach(tr=>{
    if(!tr.hasAttribute('data-slo')) tr.setAttribute('data-slo', String(++SLT_SEQ));
    const cells = tr.cells, isMain = cells.length===info.n && ![...cells].some(c=>c.colSpan>1) && !tr.classList.contains('xpl-sub');
    const first = cells[0] ? slClean(cells[0].textContent) : '';
    const pin = isMain && (/(^|[ -])(tot|sum|foot|grand)/i.test(tr.className) || SLT_PIN.test(first));
    if(pin){ pinned.push({main:tr, rows:[tr]}); last = pinned[pinned.length-1]; return; }
    if(isMain){ last = {main:tr, rows:[tr]}; groups.push(last); }
    else if(last) last.rows.push(tr);
    else lead.push(tr);
  });
  return {groups, pinned, lead};
}
let SLT_SEQ = 0;
function slTCell(tr, c){ const td = tr.cells[c]; if(!td) return {s:'',n:null,d:false}; if(td.hasAttribute('data-sv')) return slParse(td.getAttribute('data-sv')); return slParse(td.textContent); }
function slTApply(t){
  const info = slTInfo(t); if(!info) return;
  const key = slTKey(t), st = SLT[key] || (SLT[key] = {sort:null, flt:{}, q:''});
  const {groups, pinned, lead} = slTGroups(info);
  if(!groups.length) { slTSync(t, info, st, 0, 0); return; }
  const vals = groups.map(g=>info.ths.map((_,c)=>slTCell(g.main,c)));
  // تشخیص نوع ستون
  const types = info.ths.map((_,c)=>{
    let num=0, dt=0, tot=0; vals.forEach(v=>{ if(v[c].s){ tot++; if(v[c].n!=null){ num++; if(v[c].d) dt++; } } });
    return tot && num/tot>=0.6 ? (dt/Math.max(num,1)>=0.6 ? 'date' : 'num') : 'text';
  });
  t._slTypes = types;
  const q = slClean(st.q||'').toLowerCase();
  const keep = groups.map((g,i)=>{
    for(const c in st.flt){ if(!slPassCol(st.flt[c], vals[i][+c])) return false; }
    if(q){ const txt = slClean(g.rows.map(r=>r.textContent).join(' ')).toLowerCase(); if(!txt.includes(q)) return false; }
    return true;
  });
  let order = groups.map((g,i)=>i);
  order.sort((a,b)=>(+groups[a].main.getAttribute('data-slo'))-(+groups[b].main.getAttribute('data-slo')));
  if(st.sort && st.sort.c < info.n){ const dir = st.sort.d==='desc'?-1:1, c = st.sort.c; order.sort((a,b)=>slCmp(vals[a][c], vals[b][c], dir) || ((+groups[a].main.getAttribute('data-slo'))-(+groups[b].main.getAttribute('data-slo')))); }
  SLT_BUSY = true;
  try{
    const frag = document.createDocumentFragment();
    lead.forEach(r=>frag.appendChild(r));
    order.forEach(i=>groups[i].rows.forEach(r=>{ r.classList.toggle('sl-hide', !keep[i]); frag.appendChild(r); }));
    pinned.forEach(g=>g.rows.forEach(r=>frag.appendChild(r)));
    info.body.appendChild(frag);
  } finally { setTimeout(()=>{ SLT_BUSY=false; },0); }
  slTSync(t, info, st, keep.filter(Boolean).length, groups.length);
}
function slTSync(t, info, st, shown, total){
  info.ths.forEach((th,c)=>{
    const s = st.sort && st.sort.c===c ? st.sort.d : '';
    th.setAttribute('data-sl', s); th.classList.toggle('sl-flt', !!(st.flt[c]));
    th.setAttribute('aria-sort', s==='asc'?'ascending':(s==='desc'?'descending':'none'));
  });
  const bar = t._slBar;
  if(bar){
    const active = !!(st.q || Object.keys(st.flt).length);
    bar.style.display = (total>=5 || active) ? '' : 'none';
    const cnt = bar.querySelector('.sl-count'); if(cnt) cnt.textContent = (active ? shown+' از '+total : total)+' ردیف';
    const clr = bar.querySelector('.sl-clear'); if(clr) clr.style.display = active ? '' : 'none';
    const inp = bar.querySelector('.sl-q'); if(inp && document.activeElement!==inp) inp.value = st.q||'';
  }
  // پیام «نتیجه‌ای نیست»
  let nr = t.tBodies[0].querySelector('tr.sl-nores');
  if(total && shown===0){ if(!nr){ nr = document.createElement('tr'); nr.className='sl-nores'; nr.innerHTML='<td colspan="'+info.n+'">هیچ ردیفی با این فیلتر پیدا نشد.</td>'; SLT_BUSY=true; t.tBodies[0].appendChild(nr); setTimeout(()=>{SLT_BUSY=false;},0); } }
  else if(nr){ SLT_BUSY=true; nr.remove(); setTimeout(()=>{SLT_BUSY=false;},0); }
}
function slTSort(t, c){
  const key = slTKey(t), st = SLT[key] || (SLT[key]={sort:null,flt:{},q:''});
  const cur = st.sort && st.sort.c===c ? st.sort.d : null;
  st.sort = cur===null ? {c,d:'asc'} : (cur==='asc' ? {c,d:'desc'} : null);
  slTApply(t);
}
function slTOpenFilter(t, c, anchor){
  const info = slTInfo(t); if(!info) return;
  const key = slTKey(t), st = SLT[key] || (SLT[key]={sort:null,flt:{},q:''});
  const g = slTGroups(info).groups, counts = new Map();
  g.forEach(x=>{ const v = slTCell(x.main,c); const s = v.s.length>80 ? v.s.slice(0,80) : v.s; counts.set(s,(counts.get(s)||0)+1); });
  let vals = [...counts.entries()].map(([s,c2])=>({s,c:c2}));
  vals.sort((a,b)=>SL_COLL.compare(a.s,b.s));
  const kind = (t._slTypes||[])[c] || 'text';
  slPopOpen({title: slClean(info.ths[c].textContent) || ('ستون '+(c+1)), kind, vals: vals.length<=60 ? vals : null, cur: st.flt[c], anchor,
    sortDir: st.sort && st.sort.c===c ? st.sort.d : null,
    onSort: d=>{ st.sort = d ? {c,d} : null; slTApply(t); },
    onApply: cur=>{ if(cur) st.flt[c]=cur; else delete st.flt[c]; slTApply(t); }});
}
function slTInit(t){
  if(!t || t.nodeName!=='TABLE') return;
  if(t.closest('[data-nosl]') || t.classList.contains('sl-skip') || t.closest('.sl-pop')) return;
  const info = slTInfo(t); if(!info) return;
  if(!info.body.rows.length) return;
  if(t.dataset.slOk==='1'){ return; }
  t.dataset.slOk = '1'; t.classList.add('sl-tbl');
  info.ths.forEach((th,c)=>{
    const label = slClean(th.textContent);
    if(!label || th.hasAttribute('data-nosort')) return;
    th.classList.add('sl-th'); th.tabIndex = 0; th.title = 'مرتب‌سازی: یک‌بار کلیک ← صعودی، دوباره ← نزولی، سومین‌بار ← حالت اول';
    if(!th.querySelector('.sl-fb')){
      const fb = document.createElement('span'); fb.className='sl-fb'; fb.title='فیلتر این ستون'; fb.innerHTML = SL_FUNNEL; fb.setAttribute('data-nopic','1');
      fb.addEventListener('click',e=>{ e.stopPropagation(); e.preventDefault(); slTOpenFilter(t, c, fb); });
      th.appendChild(fb);
    }
    th.addEventListener('click',e=>{ if(e.target.closest('.sl-fb')) return; if(e.target.closest('button,a,input,select,label') && !e.target.closest('.sl-th > .sl-arr')) { if(!e.target.classList.contains('sl-arr')) return; } slTSort(t, c); });
    th.addEventListener('keydown',e=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); slTSort(t,c); } });
  });
  // نوار جستجو (فقط جدول‌های بیرون از پنجره‌ی توضیح ⓘ)
  if(!t.closest('.xpl-modal')){
    const host = t.parentElement && (t.parentElement.classList.contains('parts-table-wrap') || t.parentElement.classList.contains('xpl-scroll') || t.parentElement.classList.contains('rb-tbl-wrap') || /wrap|scroll/i.test(t.parentElement.className)) ? t.parentElement : t;
    const bar = document.createElement('div'); bar.className='sl-tb sl-tb-t'; bar.setAttribute('data-nopic','1');
    bar.innerHTML = '<div class="sl-search"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10.6 10.6L14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><input class="sl-q" placeholder="جستجو در این جدول…"></div><span class="sl-count"></span><button type="button" class="sl-clear" style="display:none">✕ پاک کردن فیلترها</button><button type="button" class="sl-csv" title="دانلود ردیف‌های نمایان به‌صورت CSV (قابل‌باز شدن در اکسل)">دانلود CSV</button>';
    host.parentNode.insertBefore(bar, host); t._slBar = bar;
    bar.querySelector('.sl-csv').addEventListener('click',()=>slTCsv(t));
    let tm = null;
    bar.querySelector('.sl-q').addEventListener('input',e=>{ clearTimeout(tm); const v=e.target.value; tm=setTimeout(()=>{ const st=SLT[slTKey(t)]||(SLT[slTKey(t)]={sort:null,flt:{},q:''}); st.q=v; slTApply(t); },140); });
    bar.querySelector('.sl-clear').addEventListener('click',()=>{ const st=SLT[slTKey(t)]; if(st){ st.q=''; st.flt={}; } slTApply(t); });
  }
  // وقتی ردیف‌ها دوباره ساخته شدند (رندر مجدد)، وضعیت قبلی را اعمال کن
  const mo = new MutationObserver(()=>{ if(SLT_BUSY) return; clearTimeout(t._slT); t._slT = setTimeout(()=>{ if(t.isConnected) slTApply(t); },30); });
  mo.observe(info.body,{childList:true});
  t._slMo = mo;
  slTApply(t);
}
function slTScan(root){
  if(!root || root.nodeType!==1) return;
  if(root.nodeName==='TABLE') slTInit(root);
  if(root.querySelectorAll) root.querySelectorAll('table').forEach(slTInit);
}
const SL_ROOTS = '#parts-view,.parts-modals';
const slObs = new MutationObserver(muts=>{
  if(SLT_BUSY) return;
  for(const m of muts){ m.addedNodes.forEach(n=>{ if(n.nodeType===1 && !(n.classList && (n.classList.contains('sl-tb')||n.classList.contains('sl-pop')))){ const inRoot = n.closest && n.closest(SL_ROOTS); if(inRoot){ slTScan(n); const tt = n.closest('table'); if(tt && tt!==n) slTInit(tt); } else if(n.querySelectorAll) n.querySelectorAll(SL_ROOTS).forEach(slTScan); } }); }
});
function slStart(){ document.querySelectorAll(SL_ROOTS).forEach(slTScan); slObs.observe(document.body,{childList:true,subtree:true}); }
if(document.body) slStart(); else document.addEventListener('DOMContentLoaded',slStart);

/* ══════════════════════════════════════════════════════════════════
   ۲) لیست‌های کارتی — فیلد به فیلد روی داده‌ی اصلی (نه متن صفحه)
   ══════════════════════════════════════════════════════════════════ */
const SL = {};
function slSt(k){ return SL[k] || (SL[k] = {q:'', sort:null, flt:{}}); }
const slPayLbl = s => ({paid:'تسویه‌شده', unpaid:'تسویه‌نشده', partial:'بخشی پرداخت‌شده'})[s||'paid'] || s;
const SL_DEFS = {
  products:{host:'partsProductGrid', render:'renderPartsProducts', noSearch:true, fields:[
    {id:'name',label:'نام',t:'text',get:p=>p.name},{id:'brand',label:'برند',t:'text',get:p=>p.brand||''},
    {id:'car',label:'خودرو',t:'text',get:p=>productCarModels(p).join('، ')},{id:'pt',label:'نوع قطعه',t:'text',get:p=>p.part_type||''},
    {id:'stock',label:'موجودی',t:'num',get:p=>PARTS.stock[p.id]||0},{id:'cost',label:'میانگین قیمت خرید',t:'num',get:p=>PARTS.avg_cost[p.id]||0},
    {id:'price',label:'قیمت فروش',t:'num',get:p=>(p.sale_price===''||p.sale_price==null)?null:Number(p.sale_price)},
    {id:'mg',label:'حاشیه‌ی سود ٪',t:'num',get:p=>{ const sp=Number(p.sale_price), c=PARTS.avg_cost[p.id]||0; return sp>0 ? Math.round((sp-c)/sp*1000)/10 : null; }},
    {id:'dt',label:'تاریخ ثبت',t:'date',get:p=>(p.created_at||'').slice(0,10)}]},
  sales:{host:'salesHistoryList', render:'renderSalesHistory', fields:[
    {id:'date',label:'تاریخ',t:'date',get:s=>s.date},{id:'cust',label:'مشتری',t:'text',get:s=>s.customer_name||'مشتری متفرقه'},
    {id:'rev',label:'درآمد',t:'num',get:s=>s.revenue},{id:'profit',label:'سود',t:'num',get:s=>s.profit},{id:'n',label:'تعداد قلم',t:'num',get:s=>s.items.length},
    {id:'st',label:'وضعیت پرداخت',t:'text',get:s=>slPayLbl(s.payment_status)},{id:'out',label:'مانده',t:'num',get:s=>s.amount_outstanding||0},
    {id:'dl',label:'روش تحویل',t:'text',get:s=>s.delivery_method||''},{id:'ag',label:'نماینده',t:'text',get:s=>{ const a=s.agent_id&&agentById(s.agent_id); return a?a.name:''; }},
    {id:'no',label:'شماره‌ی فاکتور',t:'num',get:s=>s.invoice_no==null?null:Number(s.invoice_no)}],
    text:s=>[s.customer_name,s.notes,s.delivery_method,s.items.map(i=>i.product_name||i.name||'').join(' ')].join(' ')},
  purchases:{host:'purchaseHistoryList', render:'renderPurchaseHistory', fields:[
    {id:'date',label:'تاریخ',t:'date',get:p=>p.order_date},{id:'st',label:'تامین‌کننده',t:'text',get:p=>{ const s=storeById(p.store_id); return s?s.name:'(حذف‌شده)'; }},
    {id:'tot',label:'جمع',t:'num',get:p=>p.items.reduce((s,it)=>s+it.qty*it.unit_price,0)},{id:'n',label:'تعداد قلم',t:'num',get:p=>p.items.length},
    {id:'pay',label:'وضعیت پرداخت',t:'text',get:p=>slPayLbl(p.payment_status)},{id:'po',label:'شماره‌ی سفارش',t:'num',get:p=>p.po_no==null?null:Number(p.po_no)}],
    text:p=>[p.notes,(storeById(p.store_id)||{}).name].join(' ')},
  returns:{host:'returnsHistoryList', render:'renderReturnsHistory', fields:[
    {id:'date',label:'تاریخ',t:'date',get:r=>r.date},{id:'cust',label:'مشتری',t:'text',get:r=>{ const s=PARTS.sales.find(x=>x.id===r.sale_id); return s?(s.customer_name||'مشتری متفرقه'):'(فروش حذف‌شده)'; }},
    {id:'amt',label:'مبلغ مرجوعی',t:'num',get:r=>r.refund_total},{id:'rs',label:'دلیل',t:'text',get:r=>r.reason||''},{id:'rst',label:'ورود به انبار',t:'text',get:r=>r.restock?'وارد انبار':'بدون ورود'}],
    text:r=>[r.reason,r.note].join(' ')},
  quotes:{host:'quotesList', render:'renderQuotesList', fields:[
    {id:'date',label:'تاریخ',t:'date',get:q=>q.date},{id:'cust',label:'مشتری',t:'text',get:q=>q.customer_name||'مشتری متفرقه'},{id:'n',label:'تعداد قلم',t:'num',get:q=>q.items.length},
    {id:'vu',label:'اعتبار تا',t:'date',get:q=>q.valid_until||''},{id:'no',label:'شماره',t:'num',get:q=>q.quote_no==null?null:Number(q.quote_no)},
    {id:'stt',label:'وضعیت',t:'text',get:q=>q.status==='converted'?'تبدیل به فروش':(q.status==='rejected'?'رد شده':((q.valid_until&&q.valid_until<isoToday())?'منقضی شده':'باز'))}]},
  cashtx:{host:'cashLedgerList', render:'renderCashLedger', fields:[
    {id:'date',label:'تاریخ',t:'date',get:t=>t.date},{id:'ty',label:'نوع',t:'text',get:t=>t.type==='deposit'?'واریز':(t.type==='withdrawal'?'برداشت':'تعدیل')},
    {id:'amt',label:'مبلغ',t:'num',get:t=>Number(t.amount)||0},{id:'nt',label:'یادداشت',t:'text',get:t=>t.note||''}], text:t=>t.note||''},
  money:{host:'moneyMovementsList', render:'renderMoneyMovements', fields:[
    {id:'date',label:'تاریخ',t:'date',get:e=>e.date},{id:'dir',label:'جهت',t:'text',get:e=>e.dir==='in'?'ورودی':'خروجی'},
    {id:'amt',label:'مبلغ',t:'num',get:e=>e.amount},{id:'lb',label:'شرح',t:'text',get:e=>e.label}], text:e=>e.label+' '+(e.sub||'')},
  expenses:{host:'expenseLedger', render:'renderExpenseLedger', fields:[
    {id:'date',label:'تاریخ',t:'date',get:x=>x.date},{id:'ti',label:'عنوان',t:'text',get:x=>x.title},{id:'cat',label:'دسته',t:'text',get:x=>x.category||''},{id:'amt',label:'مبلغ',t:'num',get:x=>Number(x.amount)||0}],
    text:x=>[x.title,x.category,x.notes].join(' ')},
  stores:{host:'partsStoreGrid', render:'renderStoreGrid', fields:[
    {id:'name',label:'نام',t:'text',get:s=>s.name},{id:'sp',label:'جمع خرید',t:'num',get:s=>(PARTS.by_store[s.id]||{}).spend||0},{id:'pc',label:'تعداد خرید',t:'num',get:s=>(PARTS.by_store[s.id]||{}).purchase_count||0},
    {id:'ship',label:'هزینه‌ی ارسال',t:'num',get:s=>Number(s.shipping_cost)||0},{id:'fs',label:'حداقل ارسال رایگان',t:'num',get:s=>s.free_shipping_min===''||s.free_shipping_min==null?null:Number(s.free_shipping_min)}],
    text:s=>[s.name,s.phone,s.address,s.notes].join(' ')},
  agents:{host:'partsAgentGrid', render:'renderAgentGrid', fields:[
    {id:'name',label:'نام',t:'text',get:a=>a.name},{id:'or',label:'تعداد فروش',t:'num',get:a=>(PARTS.agent_summary[a.id]||{}).orders||0},{id:'rev',label:'درآمد',t:'num',get:a=>(PARTS.agent_summary[a.id]||{}).revenue||0},
    {id:'pr',label:'سود',t:'num',get:a=>(PARTS.agent_summary[a.id]||{}).profit||0},{id:'py',label:'پورسانت پرداختنی',t:'num',get:a=>(PARTS.agent_summary[a.id]||{}).payable||0},
    {id:'pc',label:'درصد پورسانت',t:'num',get:a=>a.commission_percent==null?null:Number(a.commission_percent)}], text:a=>[a.name,a.phone,a.address,a.notes].join(' ')},
  customers:{host:'partsCustomerGrid', render:'renderCustomerGrid', fields:[
    {id:'name',label:'نام',t:'text',get:c=>c.name},{id:'or',label:'تعداد فروش',t:'num',get:c=>customerStats(c.id).orders},{id:'rev',label:'جمع خرید',t:'num',get:c=>customerStats(c.id).revenue},
    {id:'out',label:'مانده',t:'num',get:c=>customerStats(c.id).outstanding}], text:c=>[c.name,c.phone,c.address,c.notes].join(' ')},
  carmodels:{host:'partsCarModelGrid', render:'renderCarModelsGrid', fields:[{id:'name',label:'نام',t:'text',get:x=>x.name},{id:'u',label:'تعداد کالا',t:'num',get:x=>PARTS.products.filter(p=>productCarModels(p).includes(x.name)).length}]},
  brands:{host:'partsBrandGrid', render:'renderBrandsGrid', fields:[{id:'name',label:'نام',t:'text',get:x=>x.name},{id:'u',label:'تعداد کالا',t:'num',get:x=>PARTS.products.filter(p=>p.brand===x.name).length}]},
  parttypes:{host:'partsPartTypeGrid', render:'renderPartTypesGrid', fields:[{id:'name',label:'نام',t:'text',get:x=>x.name},{id:'u',label:'تعداد کالا',t:'num',get:x=>PARTS.products.filter(p=>p.part_type===x.name).length}]},
  categories:{host:'partsCategoryGrid', render:'renderCategoriesGrid', fields:[{id:'name',label:'نام',t:'text',get:x=>x.name},{id:'u',label:'تعداد کالا',t:'num',get:x=>PARTS.products.filter(p=>p.category===x.name).length}]},
  generics:{host:'partsGenericGrid', render:'renderGenericGrid', fields:[{id:'name',label:'نام',t:'text',get:g=>g.name},{id:'u',label:'تعداد قیمت ثبت‌شده',t:'num',get:g=>PARTS.price_entries.filter(e=>e.ref_type==='generic'&&e.generic_id===g.id).length}]}
};
function slVal(f, x){
  let r; try{ r = f.get(x); }catch(e){ r = null; }
  if(f.t==='num') return {s: r==null?'':slFmtN(r), n: r==null||!isFinite(r)?null:Number(r), d:false};
  if(f.t==='date'){ const n = r ? slDateN(r) : null; return {s: n?slDateLabel(n):'', n, d:true}; }
  return {s: slClean(r), n:null, d:false};
}
function slBar(k, total){
  const d = SL_DEFS[k], host = document.getElementById(d.host); if(!host) return null;
  let bar = document.getElementById('slbar_'+k);
  if(bar && bar.nextElementSibling!==host && bar.parentNode===host.parentNode){ /* فاصله‌ی بین نوار و لیست: مشکلی نیست */ }
  if(!bar){
    bar = document.createElement('div'); bar.id = 'slbar_'+k; bar.className='sl-tb sl-tb-l'; bar.setAttribute('data-nopic','1');
    bar.innerHTML = (d.noSearch?'':'<div class="sl-search"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10.6 10.6L14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><input class="sl-q" placeholder="جستجو…"></div>')
      + '<div class="sl-sorts"><span class="sl-lbl">مرتب‌سازی:</span>' + d.fields.map(f=>`<button type="button" class="sl-pill" data-f="${f.id}"><span class="sl-pl">${slEsc(f.label)}</span><i class="sl-arr"></i><span class="sl-fb" data-f="${f.id}" title="فیلتر «${slEsc(f.label)}»">${SL_FUNNEL}</span></button>`).join('') + '</div><span class="sl-count"></span><button type="button" class="sl-clear" style="display:none">✕ پاک کردن فیلترها</button><button type="button" class="sl-csv" title="دانلود موردهای نمایان به‌صورت CSV (قابل‌باز شدن در اکسل)">دانلود CSV</button>';
    host.parentNode.insertBefore(bar, host);
    let tm=null;
    const q = bar.querySelector('.sl-q'); if(q) q.addEventListener('input',e=>{ clearTimeout(tm); const v=e.target.value; tm=setTimeout(()=>{ slSt(k).q=v; slRe(k); },140); });
    bar.querySelector('.sl-clear').addEventListener('click',()=>{ const st=slSt(k); st.q=''; st.flt={}; if(q) q.value=''; slRe(k); });
    bar.querySelector('.sl-csv').addEventListener('click',()=>slLCsv(k));
    bar.addEventListener('click',e=>{
      const fb = e.target.closest('.sl-fb'), pill = e.target.closest('.sl-pill'); if(!pill) return;
      const f = d.fields.find(x=>x.id===pill.dataset.f); if(!f) return;
      if(fb){ e.stopPropagation(); slLOpenFilter(k, f, fb); return; }
      const st = slSt(k), cur = st.sort && st.sort.f===f.id ? st.sort.d : null;
      st.sort = cur===null ? {f:f.id,d:'asc'} : (cur==='asc' ? {f:f.id,d:'desc'} : null); slRe(k);
    });
  }
  bar.style.display = total ? '' : 'none';
  return bar;
}
function slRe(k){ const fn = window[SL_DEFS[k].render]; if(typeof fn==='function') fn(); }
let SL_SRC = {}, SL_OUT = {};
function slLOpenFilter(k, f, anchor){
  const d = SL_DEFS[k], st = slSt(k), src = SL_SRC[k] || [], counts = new Map();
  src.forEach(x=>{ const v = slVal(f,x); const s = v.s.length>80?v.s.slice(0,80):v.s; counts.set(s,(counts.get(s)||0)+1); });
  const vals = [...counts.entries()].map(([s,c])=>({s,c})).sort((a,b)=>SL_COLL.compare(a.s,b.s));
  slPopOpen({title:f.label, kind:f.t, vals: f.t==='text' && vals.length<=60 ? vals : (f.t==='text'?null:null), cur: st.flt[f.id], anchor,
    sortDir: st.sort && st.sort.f===f.id ? st.sort.d : null,
    onSort: dir=>{ st.sort = dir ? {f:f.id,d:dir} : null; slRe(k); },
    onApply: cur=>{ if(cur) st.flt[f.id]=cur; else delete st.flt[f.id]; slRe(k); }});
}
/* در هر رندر: لیست اصلی را بده، لیست فیلتر+مرتب‌شده را بگیر */
function slApply(k, arr){
  const d = SL_DEFS[k]; if(!d) return arr;
  SL_SRC[k] = arr;
  const st = slSt(k), bar = slBar(k, arr.length);
  const q = slClean(st.q||'').toLowerCase();
  const vals = new Map();
  const fl = Object.keys(st.flt).map(id=>d.fields.find(f=>f.id===id)).filter(Boolean);
  let out = arr.filter(x=>{
    for(const f of fl){ if(!slPassCol(st.flt[f.id], slVal(f,x))) return false; }
    if(q){
      const hay = slClean((d.text ? d.text(x) : '') + ' ' + d.fields.map(f=>slVal(f,x).s).join(' ')).toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
  if(st.sort){
    const f = d.fields.find(x=>x.id===st.sort.f);
    if(f){ const dir = st.sort.d==='desc'?-1:1, keyed = out.map((x,i)=>({x,i,v:slVal(f,x)}));
      keyed.sort((a,b)=>slCmp(a.v,b.v,dir) || (a.i-b.i)); out = keyed.map(o=>o.x); }
  }
  SL_OUT[k] = out;
  if(bar){
    const active = !!(st.q || fl.length);
    bar.querySelectorAll('.sl-pill').forEach(p=>{
      const on = st.sort && st.sort.f===p.dataset.f; p.classList.toggle('on', !!on); p.setAttribute('data-d', on?st.sort.d:'');
      p.classList.toggle('flt', !!st.flt[p.dataset.f]);
    });
    bar.querySelector('.sl-count').textContent = (active ? out.length+' از '+arr.length : arr.length)+' مورد';
    bar.querySelector('.sl-clear').style.display = active ? '' : 'none';
    const h = document.getElementById(d.host); if(h) h.classList.toggle('sl-nores', arr.length>0 && out.length===0);
  }
  return out;
}

function slCsv(head, rows, name){
  const q = v=>{ v = v==null?'':String(v); return /[",\n\r]/.test(v) ? '"'+v.replace(/"/g,'""')+'"' : v; };
  const text = '\uFEFF' + [head].concat(rows).map(r=>r.map(q).join(',')).join('\r\n');
  try{
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));
    a.download = (name||'export').replace(/[^\w\u0600-\u06FF-]+/g,'_')+'-'+isoToday()+'.csv'; document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },500); showToast('فایل CSV دانلود شد','success');
  }catch(e){ showToast('دانلود انجام نشد','error'); }
}
function slTCsv(t){
  const info = slTInfo(t); if(!info) return;
  const head = info.ths.map(h=>slClean(h.textContent)), idx = head.map((h,i)=>i).filter(i=>head[i]);
  const rows = [...info.body.rows].filter(r=>!r.classList.contains('sl-hide') && !r.classList.contains('sl-nores') && r.cells.length===info.n && !r.classList.contains('xpl-sub')).map(r=>idx.map(i=>slClean(r.cells[i].textContent)));
  slCsv(idx.map(i=>head[i]), rows, (t.id||'table'));
}
function slLCsv(k){
  const d = SL_DEFS[k], out = SL_OUT[k] || [];
  slCsv(d.fields.map(f=>f.label), out.map(x=>d.fields.map(f=>{ let v; try{ v=f.get(x); }catch(e){ v=''; } return f.t==='date' ? (v||'') : (v==null?'':v); })), k);
}
