// ══════════════════════════════════════════════════════
//  PARTS BIZ  —  js_parts.js
//  Auto-parts resale/accounting module: products, stores,
//  purchases, sales, and live FIFO-costed reports.
//  Depends on jalali.js (renderJalaliPicker, gregToJalali)
//  and the shared helpers/classes in js_core.js + head.html.
// ══════════════════════════════════════════════════════

const PARTS = {products:[],stores:[],car_models:[],brands:[],purchases:[],sales:[],capital_transactions:[],stock:{},avg_cost:{},by_product:{},by_store:{},
  totals:{},low_stock:[],low_stock_threshold:2};
let partsLoaded = false;
let partsCurrentSub = 'products';
let purchaseCartItems = [];
let saleCartItems = [];
let editingPurchaseId = null;
let editingSaleId = null;
let editingCashTxId = null;
let cashTxType = 'deposit';
let productModalReturnTo = null; // null | 'purchase' | 'sale'
let brandModalReturnTo = null;   // null | 'product' — where to land a newly-created brand
let productImageData = null;     // base64 currently staged in the product modal
let storeImageData = null;       // base64 currently staged in the store modal
let purchaseInvoiceImage = null; // null = unchanged, '' = removed, dataURL = newly staged
let purchaseReceiptImage = null; // null = unchanged, '' = removed, dataURL = newly staged
let partImgAutoName = '';        // last value we auto-wrote into pfName, so we know if the user overrode it
let selectedCarModels = [];      // array of car models currently checked in the open product modal
let cropTarget = 'product';      // which modal's photo is currently being cropped: 'product' | 'store'
const IMG_TARGETS = {
  product: {uploadInput:'partImgFileInput', preview:'partImgPreview', hintIcon:'partImgHintIcon', hintText:'partImgHintText', removeBtn:'partImgRemoveBtn'},
  store:   {uploadInput:'storeImgFileInput', preview:'storeImgPreview', hintIcon:'storeImgHintIcon', hintText:'storeImgHintText', removeBtn:'storeImgRemoveBtn'},
};
const CROP_ASPECT = 1;           // square, like Torob product photos
let cropState = null;            // {img, naturalW, naturalH, scale, minScale, maxScale, offsetX, offsetY, frameW, frameH}
let cropDrag = null;             // {startX, startY, startOffX, startOffY} while dragging, else null
let partsReportRange = 'all';
let partsRevenueChartInstance = null;
let partsStoreChartInstance = null;
let partsBrandChartInstance = null;
let partsCarModelChartInstance = null;
const QTY_PRESET_VALUES = [1,2,3,4,5,7,10,15,20,30,50];

function fmtT(n){
  n = Math.round(Number(n)||0);
  return n.toLocaleString('en-US') + ' K T';
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
    renderJalaliPicker('purchaseOrderDatePicker','purchaseOrderDateHidden',null,()=>{});
    renderJalaliPicker('purchaseReceiptDatePicker','purchaseReceiptDateHidden',null,()=>{});
    renderJalaliPicker('saleDatePicker','saleDateHidden',null,()=>{});
    renderJalaliPicker('cashDatePicker','cashDateHidden',null,()=>{});
    partsLoaded = true;
  }
  await fetchParts();
  showPartsSub(partsCurrentSub);
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
  renderCashLedger();
  renderPartsHero();
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
    const sign = t.type==='deposit' ? '+' : '−';
    el.innerHTML = `
      <div class="cash-ledger-icon ${t.type}">${t.type==='deposit' ? '💰' : '🏧'}</div>
      <div class="cash-ledger-info">
        <div class="cash-ledger-note">${escHtml(t.note) || (t.type==='deposit' ? 'Deposit' : 'Withdrawal')}</div>
        <div class="cash-ledger-date">${jalaliFullLabel(t.date)}</div>
      </div>
      <div class="cash-ledger-amount ${t.type}">${sign} ${fmtT(t.amount)}</div>
      <button class="cash-ledger-edit" onclick="editCashTx('${t.id}')" title="Edit">✎</button>
      <button class="cash-ledger-del" onclick="deleteCashTx('${t.id}')" title="Delete">✕</button>`;
    list.appendChild(el);
  });
}

// ─── SUB-NAV ───────────────────────────────────────
function showPartsSub(name){
  partsCurrentSub = name;
  ['products','carmodels','brands','stores','purchase','sales','cash','reports'].forEach(s=>{
    document.getElementById('partsSub-'+s).style.display = s===name ? 'block' : 'none';
  });
  document.querySelectorAll('.parts-subtab').forEach(b=>b.classList.toggle('active', b.dataset.sub===name));
  if(name==='reports') renderReports();
}

// ─── HELPERS ───────────────────────────────────────
function productById(id){ return PARTS.products.find(p=>p.id===id); }
function storeById(id){ return PARTS.stores.find(s=>s.id===id); }
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
  };
  // Car model filter is sourced from the managed list (Car Models tab), plus any
  // legacy values still sitting on old products that were saved before that tab existed.
  const managedNames = PARTS.car_models.map(c=>c.name);
  const legacyNames = PARTS.products.flatMap(p=>productCarModels(p));
  fill('partsFilterCarModel', [...managedNames, ...legacyNames]);
  const managedBrandNames = PARTS.brands.map(b=>b.name);
  const legacyBrandNames = PARTS.products.map(p=>p.brand);
  fill('partsFilterBrand', [...managedBrandNames, ...legacyBrandNames]);
  fill('partsFilterCategory', PARTS.products.map(p=>p.category));
  const dl = document.getElementById('pfCategoryList');
  if(dl){
    dl.innerHTML = '';
    [...new Set(PARTS.products.map(p=>p.category).filter(Boolean))].sort().forEach(c=>{
      const o = document.createElement('option'); o.value=c; dl.appendChild(o);
    });
  }
}

function renderPartsProducts(){
  const grid = document.getElementById('partsProductGrid');
  const q = (document.getElementById('partsSearchInput').value||'').trim().toLowerCase();
  const fCar = document.getElementById('partsFilterCarModel').value;
  const fBrand = document.getElementById('partsFilterBrand').value;
  const fCat = document.getElementById('partsFilterCategory').value;

  let list = PARTS.products.filter(p=>{
    if(fCar && !productCarModels(p).includes(fCar)) return false;
    if(fBrand && p.brand !== fBrand) return false;
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
      </div>
      <div class="part-card-actions">
        ${p.torob_link ? `<a href="${escHtml(p.torob_link)}" target="_blank" rel="noopener" style="flex:1;padding:7px;border-radius:8px;border:1.5px solid var(--cream3);background:var(--cream2);font-size:11px;font-weight:600;color:var(--text2);text-align:center;text-decoration:none;">Torob ↗</a>` : ''}
        <button onclick="openProductModal('${p.id}')">✎ Edit</button>
        <button class="del" onclick="deleteProduct('${p.id}')">🗑 Delete</button>
      </div>`;
    grid.appendChild(el);
  });
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
    document.getElementById('pfPartType').value = p.part_type||'';
    renderBrandSelect(p.brand||'');
    document.getElementById('pfVariant').value = p.variant||'';
    document.getElementById('pfOemCode').value = p.oem_code||'';
    document.getElementById('pfCategory').value = p.category||'';
    document.getElementById('pfTorob').value = p.torob_link||'';
    document.getElementById('pfName').value = p.name||'';
    document.getElementById('pfNotes').value = p.notes||'';
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
    ['pfPartType','pfCarModel','pfVariant','pfOemCode','pfCategory','pfTorob','pfName','pfNotes'].forEach(f=>document.getElementById(f).value='');
    renderBrandSelect('');
    preview.style.display='none'; hintIcon.style.display='block'; hintText.style.display='block'; removeBtn.style.display='none';
    partImgAutoName = '';
    renderCarModelTags([]);
  }
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
  PARTS.car_models.forEach(cm=>{
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
  if(cropTarget==='store') storeImageData = dataUrl; else productImageData = dataUrl;
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
    grid.innerHTML = '<div class="parts-empty"><div class="pe-icon">🏬</div><div class="pe-text">No stores yet — click "+ Add Store" to add where you buy parts from.</div></div>';
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
    ? PARTS.stores.map(s=>`<option value="${s.id}">${escHtml(s.name)}</option>`).join('')
    : '<option value="">— add a store first —</option>';
  if([...sel.options].some(o=>o.value===cur)) sel.value = cur;
}
function deleteStore(id){
  postParts('delete_store',{id});
  showToast('Store deleted','success');
}
function openStoreModal(id){
  document.getElementById('storeModalId').value = id||'';
  document.getElementById('storeModalTitle').textContent = id ? 'Edit Store' : 'Add Store';
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
    if(s.image){
      storeImageData = s.image;
      preview.src = s.image; preview.style.display='block';
      hintIcon.style.display='none'; hintText.style.display='none'; removeBtn.style.display='flex';
    } else {
      preview.style.display='none'; hintIcon.style.display='block'; hintText.style.display='block'; removeBtn.style.display='none';
    }
  } else {
    ['sfName','sfAddress','sfPhone','sfTorob','sfWebsite','sfNotes'].forEach(f=>document.getElementById(f).value='');
    preview.style.display='none'; hintIcon.style.display='block'; hintText.style.display='block'; removeBtn.style.display='none';
  }
  document.getElementById('storeModalOverlay').classList.add('open');
}
function closeStoreModal(){ document.getElementById('storeModalOverlay').classList.remove('open'); }
async function saveStoreModal(){
  const id = document.getElementById('storeModalId').value;
  const name = document.getElementById('sfName').value.trim();
  if(!name){ showToast('Store needs a name','error'); return; }
  const payload = {
    name, address: document.getElementById('sfAddress').value.trim(),
    phone: document.getElementById('sfPhone').value.trim(),
    torob_link: document.getElementById('sfTorob').value.trim(),
    website: document.getElementById('sfWebsite').value.trim(),
    notes: document.getElementById('sfNotes').value.trim(),
  };
  if(storeImageData !== null) payload.image = storeImageData;
  if(id){ payload.id=id; await postParts('update_store', payload); }
  else { await postParts('add_store', payload); }
  closeStoreModal();
  showToast(id ? 'Store updated' : 'Store added','success');
}

// ─── PRODUCT SELECTS (shared by purchase + sale forms) ──
function renderProductSelects(){
  const opts = PARTS.products.length
    ? PARTS.products.map(p=>`<option value="${p.id}">${escHtml(productLabel(p))}</option>`).join('')
    : '<option value="">— add a product first —</option>';

  const pSel = document.getElementById('purchaseItemProduct');
  const pCur = pSel.value; pSel.innerHTML = opts;
  if([...pSel.options].some(o=>o.value===pCur)) pSel.value = pCur;

  const sSel = document.getElementById('saleItemProduct');
  const sCur = sSel.value;
  sSel.innerHTML = PARTS.products.length
    ? PARTS.products.map(p=>`<option value="${p.id}">${escHtml(productLabel(p))} — ${PARTS.stock[p.id]||0} in stock</option>`).join('')
    : '<option value="">— add a product first —</option>';
  if([...sSel.options].some(o=>o.value===sCur)) sSel.value = sCur;
  onSaleProductChange();
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
    items: purchaseCartItems, notes: document.getElementById('purchaseNotes').value.trim(),
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
    document.getElementById('purchaseNotes').value = pur.notes||'';
    setPurchaseDocPreview('invoice', pur.invoice_image||'');
    setPurchaseDocPreview('receipt', pur.receipt_image||'');
  } else {
    renderStoreSelect();
    renderJalaliPicker('purchaseOrderDatePicker','purchaseOrderDateHidden', null, ()=>{});
    document.getElementById('purchaseSameDay').checked = true;
    togglePurchaseSameDay();
    purchaseCartItems = [];
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
function renderPurchaseHistory(){
  const list = document.getElementById('purchaseHistoryList');
  list.innerHTML = '';
  const sorted = [...PARTS.purchases].sort((a,b)=>(b.order_date||'').localeCompare(a.order_date||''));
  if(!sorted.length){ list.innerHTML = '<div class="parts-empty"><div class="pe-icon">🧾</div><div class="pe-text">No purchases recorded yet.</div></div>'; return; }
  sorted.forEach(pur=>{
    const store = storeById(pur.store_id);
    const total = pur.items.reduce((s,it)=>s+it.qty*it.unit_price,0);
    const el = document.createElement('div');
    el.className = 'tx-list-item';
    const bodyId = 'purBody-'+pur.id;
    el.innerHTML = `
      <div class="tx-list-head" onclick="document.getElementById('${bodyId}').classList.toggle('open')">
        <div>
          <div class="tx-list-title">${escHtml(store ? store.name : '(deleted store)')} · ${pur.items.length} item${pur.items.length===1?'':'s'}</div>
          <div class="tx-list-sub">${jalaliFullLabel(pur.order_date)}${!pur.same_day ? ' → received '+jalaliFullLabel(pur.receipt_date) : ''}</div>
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
}
function addSaleCartItem(){
  const pid = document.getElementById('saleItemProduct').value;
  const qty = parseFloat(document.getElementById('saleItemQty').value);
  const price = parseFloat(document.getElementById('saleItemPrice').value);
  if(!pid){ showToast('Pick a product first','error'); return; }
  if(!qty || qty<=0){ showToast('Enter a quantity','error'); return; }
  if(price==null || isNaN(price) || price<0){ showToast('Enter a sell price','error'); return; }
  const inCart = saleCartItems.filter(it=>it.product_id===pid).reduce((s,it)=>s+it.qty,0);
  const avail = (PARTS.stock[pid]||0) - inCart;
  if(qty > avail){
    showToast(`Only ${avail} tracked in stock — added anyway with an estimated cost`,'error');
  }
  saleCartItems.push({product_id:pid, qty, unit_price:price});
  document.getElementById('saleItemQty').value = 1;
  document.getElementById('saleItemPrice').value = '';
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
      const el = document.createElement('div');
      el.className = 'tx-cart-item';
      el.innerHTML = `<div class="tx-cart-item-info">
          <div class="tx-cart-item-name">${escHtml(productLabel(p))}</div>
          <div class="tx-cart-item-detail">${it.qty} × ${fmtT(it.unit_price)}</div>
        </div>
        <div class="tx-cart-item-total">${fmtT(it.qty*it.unit_price)}</div>
        <button class="tx-cart-del" onclick="removeSaleCartItem(${idx})">✕</button>`;
      c.appendChild(el);
    });
  }
  const total = saleCartItems.reduce((s,it)=>s+it.qty*it.unit_price,0);
  document.getElementById('saleTotalVal').textContent = fmtT(total);
}
async function saveSale(){
  if(!saleCartItems.length){ showToast('Add at least one item','error'); return; }
  const payload = {
    date: document.getElementById('saleDateHidden').value,
    customer_name: document.getElementById('saleCustomerName').value.trim(),
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
    document.getElementById('saleCustomerName').value = sale.customer_name||'';
    document.getElementById('saleNotes').value = sale.notes||'';
    saleCartItems = sale.items.map(it=>({product_id:it.product_id, qty:it.qty, unit_price:it.unit_price}));
  } else {
    renderJalaliPicker('saleDatePicker','saleDateHidden', null, ()=>{});
    document.getElementById('saleCustomerName').value = '';
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
    el.innerHTML = `
      <div class="tx-list-head" onclick="document.getElementById('${bodyId}').classList.toggle('open')">
        <div>
          <div class="tx-list-title">${escHtml(sale.customer_name || 'Walk-in customer')} · ${sale.items.length} item${sale.items.length===1?'':'s'}</div>
          <div class="tx-list-sub">${jalaliFullLabel(sale.date)}</div>
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
          <button onclick="openSaleModal('${sale.id}')">✎ Edit</button>
          <button class="del" onclick="deleteSale('${sale.id}')">🗑 Delete</button>
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
    ['🧾','Purchase Spend', fmtT(purchaseSpend), 'var(--rose)'],
    ['🏷️','Inventory Value', fmtT(PARTS.totals.inventory_value||0), 'var(--sky)'],
    ['🔩','Units In Stock', fmtNum(PARTS.totals.inventory_units||0), 'var(--sage)'],
    ['⚠️','Low Stock Items', PARTS.totals.low_stock_count||0, (PARTS.totals.low_stock_count||0)>0?'var(--coral)':'var(--sage)'],
    ['💵','Sales Count', filteredSales.length, 'var(--sky)'],
    ['🧾','Purchases Count', filteredPurchases.length, 'var(--amber)'],
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

  renderPartsCharts(filteredSales, filteredPurchases, storeRows);
}
async function saveLowStockThreshold(){
  const v = parseFloat(document.getElementById('lowStockThresholdInput').value);
  await postParts('set_low_stock_threshold',{value: isNaN(v)?2:v});
}

function renderPartsCharts(filteredSales, filteredPurchases, storeRows){
  const palette = ['#e85d3a','#3a7a5a','#2a6a9a','#d4821a','#7a3a6a','#c44a6a','#5a9a7a','#f07a5c'];

  // Revenue / purchase spend / profit by Jalali month — the full money-in vs
  // money-out picture, not just sales, so losses show up as clearly as gains.
  const byMonth = {};
  filteredSales.forEach(sale=>{
    const j = gregToJalali(sale.date);
    if(!j) return;
    const key = j.y+'/'+String(j.m).padStart(2,'0');
    const b = byMonth[key] || (byMonth[key]={label:j.month_name+' '+j.y, revenue:0, profit:0, spend:0});
    b.revenue += sale.revenue; b.profit += sale.profit;
  });
  filteredPurchases.forEach(pur=>{
    const j = gregToJalali(pur.order_date);
    if(!j) return;
    const key = j.y+'/'+String(j.m).padStart(2,'0');
    const b = byMonth[key] || (byMonth[key]={label:j.month_name ? j.month_name+' '+j.y : key, revenue:0, profit:0, spend:0});
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
}
