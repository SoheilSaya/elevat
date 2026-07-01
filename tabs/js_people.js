// ─── PEOPLE / SOCIAL TRACKER MODULE ───────────────────
// Font: Vazirmatn loaded via @import in HTML

let PPL = {
  people: [],
  relationships: [],
  circles: [],          // [{id, name, color}]
  selectedId: null,
  filterCat: 'all',
  filterCircle: 'all',
  sortBy: 'alert',
  newCat: null,
  photoTarget: null,
  graphShowMe: false,
  mePhoto: '',
};

const PPL_CAT_META = {
  family: { label: 'Family',  emoji: '❤️',  cls: 'cat-family', color: '#e85d3a' },
  friend: { label: 'Friend',  emoji: '🤝',  cls: 'cat-friend', color: '#3a7a5a' },
  online: { label: 'Online',  emoji: '💬',  cls: 'cat-online', color: '#3a7ab5' },
  date:   { label: 'Date',    emoji: '💘',  cls: 'cat-date',   color: '#b53a7a' },
};

const PPL_ACT_META = {
  chat:    { label: 'Chatted',             emoji: '💬', color: 'var(--skyL)',   textColor: 'var(--sky)'  },
  hangout: { label: 'Hung out',            emoji: '🤝', color: 'var(--sageL)', textColor: 'var(--sage)' },
  visited: { label: 'Went to their place', emoji: '🏠', color: 'var(--plumL)', textColor: 'var(--plum)' },
  call:    { label: 'Called',              emoji: '📞', color: 'var(--amberL)', textColor: 'var(--amber)'},
  catchup: { label: 'Catchup',             emoji: '☕', color: 'var(--sageL)', textColor: 'var(--sage)' },
  other:   { label: 'Other',               emoji: '⭐', color: 'var(--cream2)', textColor: 'var(--text2)'},
};

// Relationship type metadata (special modes beyond numeric strength)
// strength field: numeric -3..+3 OR string 'partner'|'ex'|'family_bond'
const PPL_REL_SPECIAL = {
  partner:     { label: '💑 Partner',     color: '#e85d8a', dash: [],          width: 4   },
  ex:          { label: '💔 Ex',          color: '#9B5DE5', dash: [8,4],       width: 2   },
  family_bond: { label: '🧬 Family bond', color: '#F7B731', dash: [16,4,4,4],  width: 3.5 },
  crush:       { label: '💓 Crush',       color: '#FF6B9D', dash: [3,3],       width: 2.5 },
};

const PPL_CIRCLE_COLORS = [
  '#6C63FF','#3a7a5a','#e85d3a','#3a7ab5','#b53a7a','#e8a43a','#3abfb5','#8a3ab5'
];

// ── Helpers ──────────────────────────────────────────

function pplTodayISO() {
  const d = new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

function pplJalaliLabel(isoDate) {
  try {
    if (typeof gregToJalali === 'function') {
      const j = gregToJalali(isoDate);
      const m = ['Farvardin','Ordibehesht','Khordad','Tir','Mordad','Shahrivar','Mehr','Aban','Azar','Dey','Bahman','Esfand'];
      return j.jd+' '+m[j.jm-1]+' '+j.jy;
    }
  } catch(e) {}
  return isoDate;
}

function pplDaysSince(dateStr) {
  if (!dateStr) return null;
  return Math.floor((new Date() - new Date(dateStr)) / 86400000);
}

function pplFormatDays(n) {
  if (n===null||n===undefined) return '—';
  if (n===0) return 'today';
  if (n===1) return 'yesterday';
  return n+'d ago';
}

function pplImpColor(imp) {
  if (imp>0) return '#3a7a5a';
  if (imp<0) return '#e85d3a';
  return '#999';
}

function pplImpLabel(imp) { return (imp>0?'+':'')+imp; }

function pplAvatarBg(cat) {
  return {family:'var(--coralL)',friend:'var(--sageL)',online:'var(--skyL)',date:'var(--roseL)'}[cat]||'var(--cream2)';
}

function pplAvatarHTML_small(p) {
  if (p.photo) return `<img src="${p.photo}" style="width:38px;height:38px;border-radius:50%;object-fit:cover;display:block;"/>`;
  return `<span style="font-size:17px;">${(PPL_CAT_META[p.category]||{emoji:'👤'}).emoji}</span>`;
}

function pplAvatarHTML_large(p) {
  if (p.photo) return `<img src="${p.photo}" style="width:64px;height:64px;border-radius:50%;object-fit:cover;display:block;"/>`;
  return `<span style="font-size:28px;">${(PPL_CAT_META[p.category]||{emoji:'👤'}).emoji}</span>`;
}

function pplAlertLevel(person) {
  const imp=person.importance||0, absImp=Math.abs(imp);
  const thr={5:3,4:7,3:14,2:30,1:60};
  const threshold=imp>0?(thr[absImp]||30):90;
  const dc=pplDaysSince(person.last_chat), dh=pplDaysSince(person.last_hangout);
  const days=Math.min(dc!==null?dc:9999, dh!==null?dh:9999);
  if(days===9999) return 'unknown';
  if(days>=threshold) return 'overdue';
  if(days>=threshold*0.7) return 'soon';
  return 'ok';
}

function pplLastActivity(p) {
  const acts=p.activities||[];
  if(!acts.length) return null;
  return acts.reduce((b,a)=>(!a.date?b:(!b||a.date>b)?a.date:b),null);
}

function pplGetCircle(id) { return PPL.circles.find(c=>c.id===id)||null; }

// ── API ──────────────────────────────────────────────

async function pplLoad() {
  try {
    const r=await fetch('/api/people');
    const data=await r.json();
    if(Array.isArray(data)){ PPL.people=data; PPL.relationships=[]; PPL.circles=[]; PPL.mePhoto=''; }
    else { PPL.people=data.people||[]; PPL.relationships=data.relationships||[]; PPL.circles=data.circles||[]; PPL.mePhoto=data.me_photo||''; }
    pplRenderCircleFilters();
    pplRenderList();
    pplRenderStats();
    if(PPL.selectedId){ const s=PPL.people.find(p=>p.id===PPL.selectedId); if(s) pplShowDetail(PPL.selectedId); }
    // Defer graph build so the rest of the tab paints first — graph is the heavy part
    pplScheduleGraphDraw();
  } catch(e){ console.error('people load',e); }
}

let _pplGraphDrawScheduled=false;
function pplScheduleGraphDraw(){
  if(_pplGraphDrawScheduled) return;
  _pplGraphDrawScheduled=true;
  // Wait for next paint, then build the graph off the critical path
  requestAnimationFrame(()=>{
    setTimeout(()=>{
      _pplGraphDrawScheduled=false;
      pplDrawGraph();
    }, 0);
  });
}

async function addPerson() {
  const name=document.getElementById('pplName').value.trim();
  const cat=PPL.newCat;
  if(!name){showToast('Enter a name','');return;}
  if(!cat){showToast('Pick a category','');return;}
  const importance=parseInt(document.getElementById('pplImportance').value)||0;
  const contact=document.getElementById('pplContact').value.trim();
  await fetch('/api/people',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'add',name,category:cat,importance,contact})});
  document.getElementById('pplName').value='';
  document.getElementById('pplContact').value='';
  document.getElementById('pplImportance').value=0;
  document.getElementById('pplImpDisplay').textContent='0';
  document.querySelectorAll('#pplCatChips .chip').forEach(c=>{c.className='chip';});
  PPL.newCat=null;
  await pplLoad();
  showToast(name+' added ✓','success');
}

async function deletePerson(id) {
  if(!confirm('Remove this person?')) return;
  await fetch('/api/people',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'delete',id})});
  if(PPL.selectedId===id){
    PPL.selectedId=null;
    document.getElementById('personDetail').innerHTML='<div class="person-detail"><div class="ppl-empty"><div class="ppl-empty-icon">👈</div><div class="ppl-empty-msg">Select someone to see details</div></div></div>';
  }
  await pplLoad();
  showToast('Removed','');
}

async function logActivity(personId) {
  const actType=document.getElementById('actType_'+personId)?.value;
  const note=document.getElementById('actNote_'+personId)?.value.trim()||'';
  const dateVal=document.getElementById('actDate_'+personId)?.value||pplTodayISO();
  if(!actType){showToast('Pick an activity type','');return;}
  await fetch('/api/people',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'log_activity',id:personId,activity_type:actType,note,date:dateVal})});
  const ne=document.getElementById('actNote_'+personId), de=document.getElementById('actDate_'+personId);
  if(ne) ne.value=''; if(de) de.value=pplTodayISO();
  await pplLoad();
  showToast((PPL_ACT_META[actType]?.label||'Activity')+' logged ✓','success');
}

async function quickCatchup(personId,event) {
  if(event) event.stopPropagation();
  await fetch('/api/people',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'log_activity',id:personId,activity_type:'catchup',note:'',date:pplTodayISO()})});
  await pplLoad();
  const p=PPL.people.find(x=>x.id===personId);
  showToast('☕ Catchup logged for '+(p?.name||'them')+' ✓','success');
}

async function deleteActivity(personId,actIdx) {
  if(!confirm('Remove this activity?')) return;
  await fetch('/api/people',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'delete_activity',id:personId,activity_index:actIdx})});
  await pplLoad();
}

async function savePersonNotes(personId) {
  const notes=document.getElementById('pdNotes_'+personId)?.value||'';
  await fetch('/api/people',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'update_notes',id:personId,notes})});
  showToast('Notes saved ✓','success');
}

async function removePersonPhoto(personId) {
  await fetch('/api/people',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'update_photo',id:personId,photo:''})});
  const node=PPL_GRAPH.nodes.find(n=>n.id===personId);
  if(node){node.photo='';delete node._img;}
  await pplLoad();
  showToast('Photo removed','');
}

function pplTriggerPhoto(personId){PPL.photoTarget=personId;document.getElementById('pplPhotoInput').click();}
function pplTriggerMePhoto(){document.getElementById('pplMePhotoInput').click();}

function pplHandleMePhoto(event) {
  const file=event.target.files[0];
  if(!file) return;
  const reader=new FileReader();
  reader.onload=async(e)=>{
    await fetch('/api/people',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'update_me_photo',photo:e.target.result})});
    event.target.value='';
    PPL.mePhoto=e.target.result;
    // invalidate cached image on ME node
    const meNode=PPL_GRAPH.nodes.find(n=>n.isMe);
    if(meNode){meNode.photo=PPL.mePhoto;delete meNode._img;}
    showToast('ME photo updated ✓','success');
  };
  reader.readAsDataURL(file);
}

async function removeMePhoto() {
  await fetch('/api/people',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'update_me_photo',photo:''})});
  PPL.mePhoto='';
  const meNode=PPL_GRAPH.nodes.find(n=>n.isMe);
  if(meNode){meNode.photo='';delete meNode._img;}
  showToast('ME photo removed','');
}

function pplHandlePhoto(event) {
  const file=event.target.files[0];
  if(!file||!PPL.photoTarget) return;
  const reader=new FileReader();
  reader.onload=async(e)=>{
    await fetch('/api/people',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'update_photo',id:PPL.photoTarget,photo:e.target.result})});
    event.target.value='';
    await pplLoad();
    showToast('Photo updated ✓','success');
  };
  reader.readAsDataURL(file);
}

// ── Circles ──────────────────────────────────────────

async function pplAddCircle() {
  const nameEl=document.getElementById('circleNameInput');
  const name=(nameEl?.value||'').trim();
  if(!name){showToast('Enter a circle name','');return;}
  if(!PPL.circles) PPL.circles=[];
  const id='c'+Date.now();
  const color=PPL_CIRCLE_COLORS[PPL.circles.length%PPL_CIRCLE_COLORS.length];
  PPL.circles.push({id,name,color});
  if(nameEl) nameEl.value='';
  await pplSaveCircles();
  pplRenderCircleFilters();
  pplRenderList();
  pplRenderStats();
  showToast('Circle "'+name+'" added ✓','success');
}

async function pplDeleteCircle(id) {
  PPL.circles=PPL.circles.filter(c=>c.id!==id);
  // remove from people
  PPL.people.forEach(p=>{if(p.circles&&p.circles.includes(id)) p.circles=p.circles.filter(x=>x!==id);});
  await pplSaveCircles();
  await pplSavePeopleCircles();
  pplRenderCircleFilters();
  pplRenderList();
  pplRenderStats();
  pplDrawGraph();
  showToast('Circle removed','');
}

async function pplSaveCircles() {
  await fetch('/api/people',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'save_circles',circles:PPL.circles})});
}

async function pplSavePeopleCircles() {
  // save updated circle memberships for all people
  await fetch('/api/people',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'save_people_circles',people_circles:PPL.people.map(p=>({id:p.id,circles:p.circles||[]}))})});
}

async function pplTogglePersonCircle(personId, circleId) {
  const p=PPL.people.find(x=>x.id===personId);
  if(!p) return;
  if(!p.circles) p.circles=[];
  if(p.circles.includes(circleId)) p.circles=p.circles.filter(x=>x!==circleId);
  else p.circles.push(circleId);
  await pplSavePeopleCircles();
  // re-render circle checkboxes in detail without full reload
  const el=document.getElementById('personCircles_'+personId);
  if(el) el.innerHTML=pplCircleChecksHTML(personId);
  pplDrawGraph();
}

function pplCircleChecksHTML(personId) {
  const p=PPL.people.find(x=>x.id===personId);
  if(!p) return '';
  const pCircles=p.circles||[];
  return PPL.circles.map(c=>`
    <label style="display:flex;align-items:center;gap:7px;cursor:pointer;padding:6px 10px;border-radius:var(--r2);border:1.5px solid ${pCircles.includes(c.id)?c.color:'var(--cream3)'};background:${pCircles.includes(c.id)?c.color+'22':'var(--cream2)'};transition:all .15s;">
      <input type="checkbox" ${pCircles.includes(c.id)?'checked':''} onchange="pplTogglePersonCircle('${personId}','${c.id}')" style="accent-color:${c.color};"/>
      <span style="width:8px;height:8px;border-radius:50%;background:${c.color};display:inline-block;"></span>
      <span style="font-size:12px;font-weight:600;color:var(--text);">${c.name}</span>
    </label>`).join('');
}

function pplFilterCircle(cid, btn) {
  PPL.filterCircle=cid;
  document.querySelectorAll('.ppl-circle-filter').forEach(b=>b.classList.remove('sel'));
  btn.classList.add('sel');
  pplRenderList();
  pplRenderStats();
  pplDrawGraph();
}

function pplRenderCircleFilters() {
  const el=document.getElementById('pplCircleFilters');
  if(!el) return;
  el.innerHTML=`<button class="ppl-circle-filter${PPL.filterCircle==='all'?' sel':''}" data-cid="all"
    onclick="pplFilterCircle('all',this)" style="${PPL.filterCircle==='all'?'background:var(--ink);color:#fff;border-color:var(--ink);':''}">All circles</button>`+
  PPL.circles.map(c=>`<button class="ppl-circle-filter${PPL.filterCircle===c.id?' sel':''}" data-cid="${c.id}"
    onclick="pplFilterCircle('${c.id}',this)"
    style="border-color:${c.color};${PPL.filterCircle===c.id?'background:'+c.color+';color:#fff;':'color:'+c.color+';'}">
    <span style="width:7px;height:7px;border-radius:50%;background:${c.color};display:inline-block;margin-right:4px;${PPL.filterCircle===c.id?'background:#fff;':''}"></span>${c.name}
    <span onclick="event.stopPropagation();pplDeleteCircle('${c.id}')" style="margin-left:4px;opacity:0.6;font-size:11px;cursor:pointer;" title="Delete circle">×</span>
  </button>`).join('');

  // also update circle management list
  // Rebuild per-circle graph visibility toggles
  const gvt=document.getElementById('graphCircleVisibility');
  if(gvt){
    gvt.innerHTML=PPL.circles.map(c=>`
      <button class="graph-ctrl-btn" id="gv_${c.id}" onclick="pplToggleCircleVisibility('${c.id}',this)"
        style="border-color:${c.color};color:${c.color};font-size:10px;padding:3px 9px;">
        <span style="width:7px;height:7px;border-radius:50%;background:${c.color};display:inline-block;margin-right:3px;"></span>${c.name}
      </button>`).join('');
  }

  const mgmt=document.getElementById('circlesMgmtList');
  if(mgmt){
    mgmt.innerHTML=PPL.circles.length===0
      ?'<div style="font-size:12px;color:var(--text4);font-style:italic;">No circles yet</div>'
      :PPL.circles.map(c=>`<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:var(--r2);border:1.5px solid ${c.color}22;background:${c.color}11;margin-bottom:6px;">
          <span style="width:10px;height:10px;border-radius:50%;background:${c.color};"></span>
          <span style="flex:1;font-size:12px;font-weight:600;">${c.name}</span>
          <span style="font-size:10px;color:var(--text4);">${PPL.people.filter(p=>(p.circles||[]).includes(c.id)).length} members</span>
          <button class="rel-del" onclick="pplDeleteCircle('${c.id}')">×</button>
        </div>`).join('');
  }
}

// ── Relationships ─────────────────────────────────────

function pplRenderRelList(personId) {
  const rels=(PPL.relationships||[]).filter(r=>r.from===personId||r.to===personId);
  if(!rels.length) return '<div style="font-size:12px;color:var(--text4);font-style:italic;padding:4px 0;">No relationships defined yet.</div>';
  return rels.map(r=>{
    const otherId=r.from===personId?r.to:r.from;
    const other=PPL.people.find(p=>p.id===otherId);
    const otherName=other?other.name:'Unknown';
    const s=r.strength;
    const isSpecial=typeof s==='string';
    let badge='',badgeCls='pos';
    if(isSpecial){
      const sm=PPL_REL_SPECIAL[s]||{};
      badge=sm.label||s;
      badgeCls='special';
    } else {
      const isPos=s>0;
      const posL=['','Sometimes hang out','Good friends','Close friends'];
      const negL=['','Dislike','Tension','Absolute hatred'];
      badge=(s>0?'+':'')+s+' '+(isPos?posL[Math.abs(s)]:negL[Math.abs(s)]);
      badgeCls=isPos?'pos':'neg';
    }
    const dirLabel=r.direction==='both'?'↔ mutual':(r.from===personId?'→ one-way':'← toward them');
    const realIdx=PPL.relationships.indexOf(r);
    return `<div class="rel-item">
      <div class="rel-name">${otherName}</div>
      <span class="rel-badge ${badgeCls}">${badge}</span>
      <span class="rel-direction">${dirLabel}</span>
      <button class="rel-del" onclick="deleteRelationship(${realIdx})">×</button>
    </div>`;
  }).join('');
}

async function addRelationship(fromId) {
  const toId=document.getElementById('relTarget_'+fromId)?.value;
  const strengthRaw=document.getElementById('relStrength_'+fromId)?.value;
  const direction=document.getElementById('relDir_'+fromId)?.value||'both';
  if(!toId){showToast('Select a person','');return;}
  const strength=isNaN(strengthRaw)?strengthRaw:parseInt(strengthRaw);
  if(!PPL.relationships) PPL.relationships=[];
  PPL.relationships=PPL.relationships.filter(r=>!(
    (r.from===fromId&&r.to===toId)||(r.from===toId&&r.to===fromId)
  ));
  PPL.relationships.push({from:fromId,to:toId,strength,direction});
  await pplSaveRelationships();
  const el=document.getElementById('relList_'+fromId);
  if(el) el.innerHTML=pplRenderRelList(fromId);
  pplDrawGraph();
  showToast('Relationship saved ✓','success');
}

async function deleteRelationship(idx) {
  PPL.relationships.splice(idx,1);
  await pplSaveRelationships();
  if(PPL.selectedId){
    const el=document.getElementById('relList_'+PPL.selectedId);
    if(el) el.innerHTML=pplRenderRelList(PPL.selectedId);
  }
  pplDrawGraph();
  showToast('Relationship removed','');
}

async function pplSaveRelationships() {
  await fetch('/api/people',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'save_relationships',relationships:PPL.relationships})});
}

// ── UI ────────────────────────────────────────────────

function pplPickCat(cat,btn) {
  PPL.newCat=cat;
  document.querySelectorAll('#pplCatChips .chip').forEach(c=>{c.className='chip';});
  btn.className='chip sel-'+({family:'coral',friend:'sage',online:'sky',date:'rose'}[cat]||'ink');
}

function pplFilterCat(cat,btn) {
  PPL.filterCat=cat;
  document.querySelectorAll('.ppl-cat').forEach(c=>c.classList.remove('sel'));
  btn.classList.add('sel');
  pplRenderList(); pplRenderStats();
}

function pplSortBy(sortKey) {
  PPL.sortBy=sortKey;
  document.querySelectorAll('.ppl-sort-btn').forEach(b=>b.classList.remove('sel'));
  const btn=document.querySelector(`.ppl-sort-btn[data-sort="${sortKey}"]`);
  if(btn) btn.classList.add('sel');
  pplRenderList();
}

// ── Render list ───────────────────────────────────────

function pplFilteredPeople() {
  let people=PPL.people;
  if(PPL.filterCat!=='all') people=people.filter(p=>p.category===PPL.filterCat);
  if(PPL.filterCircle!=='all') people=people.filter(p=>(p.circles||[]).includes(PPL.filterCircle));
  return people;
}

function pplRenderList() {
  const el=document.getElementById('personList');
  if(!el) return;
  let people=pplFilteredPeople();
  const alertOrder={overdue:0,soon:1,unknown:2,ok:3};
  if(PPL.sortBy==='alert') people=[...people].sort((a,b)=>{const ao=alertOrder[pplAlertLevel(a)]??2,bo=alertOrder[pplAlertLevel(b)]??2;return ao!==bo?ao-bo:(b.importance||0)-(a.importance||0);});
  else if(PPL.sortBy==='closeness') people=[...people].sort((a,b)=>(b.importance||0)-(a.importance||0));
  else if(PPL.sortBy==='name') people=[...people].sort((a,b)=>a.name.localeCompare(b.name));
  else if(PPL.sortBy==='last_activity') people=[...people].sort((a,b)=>(pplLastActivity(b)||'').localeCompare(pplLastActivity(a)||''));
  else if(PPL.sortBy==='added') people=[...people].sort((a,b)=>(b.id||'').localeCompare(a.id||''));

  if(!people.length){
    el.innerHTML='<div class="ppl-empty"><div class="ppl-empty-icon">👤</div><div class="ppl-empty-msg">'+(PPL.filterCat==='all'&&PPL.filterCircle==='all'?'Add someone below':'No one matches this filter')+'</div></div>';
    return;
  }

  el.innerHTML=people.map(p=>{
    const alert=pplAlertLevel(p);
    const imp=p.importance||0;
    const impColor=pplImpColor(imp);
    const active=PPL.selectedId===p.id?' active':'';
    const alertDot=alert==='ok'?'<div class="pcard-alert ok"></div>':alert==='soon'?'<div class="pcard-alert soon"></div>':alert==='overdue'?'<div class="pcard-alert"></div>':'';
    const circlesDots=(p.circles||[]).map(cid=>{const c=pplGetCircle(cid);return c?`<span style="width:6px;height:6px;border-radius:50%;background:${c.color};display:inline-block;margin-right:2px;" title="${c.name}"></span>`:''}).join('');
    return `<div class="person-card${active}" onclick="pplShowDetail('${p.id}')">
      ${alertDot}
      <div class="pcard-top">
        <div class="pcard-avatar" style="background:${p.photo?'transparent':pplAvatarBg(p.category)}">${pplAvatarHTML_small(p)}</div>
        <div class="pcard-info">
          <div class="pcard-name">${p.name}</div>
          <div class="pcard-meta">Chat: ${pplFormatDays(pplDaysSince(p.last_chat))} · Out: ${pplFormatDays(pplDaysSince(p.last_hangout))}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-top:2px;">
            <span style="font-size:10px;font-weight:700;color:${impColor};">${pplImpLabel(imp)}/±5</span>
            <span>${circlesDots}</span>
          </div>
        </div>
      </div>
      <button class="pcard-catchup" onclick="quickCatchup('${p.id}',event)">☕ Catchup</button>
    </div>`;
  }).join('');
}

// ── Render detail ─────────────────────────────────────

function pplShowDetail(id) {
  PPL.selectedId=id;
  document.querySelectorAll('.person-card').forEach(c=>{
    c.classList.remove('active');
    if(c.getAttribute('onclick')?.includes(`'${id}'`)) c.classList.add('active');
  });

  const p=PPL.people.find(x=>x.id===id);
  if(!p) return;

  const meta=PPL_CAT_META[p.category]||{emoji:'👤',label:'Person',cls:'cat-friend'};
  const acts=p.activities||[];
  const alert=pplAlertLevel(p);
  const imp=p.importance||0;
  const impColor=pplImpColor(imp);
  const actOpts=Object.entries(PPL_ACT_META).map(([k,v])=>`<option value="${k}">${v.emoji} ${v.label}</option>`).join('');
  const todayStr=pplTodayISO();
  const alertColors={overdue:'var(--coral)',soon:'var(--amber)',ok:'var(--sage)',unknown:'var(--text3)'};
  const alertLabels={overdue:'Overdue — reach out!',soon:'Reach out soon',ok:'All good',unknown:'Never logged'};

  const logHTML=acts.length===0
    ?'<div style="color:var(--text4);font-size:13px;padding:8px;font-style:italic;">No activities logged yet</div>'
    :[...acts].reverse().map((a,ri)=>{
        const realIdx=acts.length-1-ri;
        const am=PPL_ACT_META[a.type]||PPL_ACT_META.other;
        return `<div class="act-item">
          <div class="act-icon" style="background:${am.color}">${am.emoji}</div>
          <div class="act-body">
            <div class="act-type" style="color:${am.textColor}">${am.label}</div>
            ${a.note?`<div class="act-note">${a.note}</div>`:''}
            <div class="act-date">${a.date?pplJalaliLabel(a.date):''}</div>
          </div>
          <button class="act-del" onclick="deleteActivity('${id}',${realIdx})">×</button>
        </div>`;
      }).join('');

  const actCounts={};
  acts.forEach(a=>{actCounts[a.type]=(actCounts[a.type]||0)+1;});
  const maxAct=Math.max(1,...Object.values(actCounts));
  const miniChart=Object.entries(PPL_ACT_META).map(([k,v])=>{
    const cnt=actCounts[k]||0;
    return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;">
      <span style="width:14px;text-align:center;font-size:12px;">${v.emoji}</span>
      <div style="flex:1;height:8px;background:var(--cream3);border-radius:4px;overflow:hidden;">
        <div style="width:${Math.round((cnt/maxAct)*100)}%;height:100%;background:${v.textColor};border-radius:4px;"></div>
      </div>
      <span style="font-size:10px;color:var(--text3);min-width:14px;text-align:right;">${cnt}</span>
    </div>`;}).join('');

  const circlesSection=PPL.circles.length===0?'':`
    <div style="margin-bottom:20px;padding-top:18px;border-top:1.5px solid var(--cream2);">
      <div class="flabel" style="margin-bottom:10px;">Circles</div>
      <div id="personCircles_${id}" style="display:flex;flex-direction:column;gap:6px;">${pplCircleChecksHTML(id)}</div>
    </div>`;

  const photoRemoveBtn=p.photo?`<button class="m-btn" onclick="removePersonPhoto('${id}')" style="font-size:10px;padding:3px 8px;color:var(--coral);border-color:var(--coral);margin-top:4px;width:100%;">✕ Remove photo</button>`:'';

  document.getElementById('personDetail').innerHTML=`
  <div class="person-detail">
    <div class="pd-header">
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0;">
        <div class="pd-avatar-wrap" onclick="pplTriggerPhoto('${id}')" title="Change photo">
          <div class="pd-avatar" style="background:${p.photo?'transparent':pplAvatarBg(p.category)}">${pplAvatarHTML_large(p)}</div>
          <div class="pd-avatar-edit">✎</div>
        </div>
        ${photoRemoveBtn}
      </div>
      <div class="pd-info">
        <div class="pd-name">${p.name}</div>
        <span class="pd-cat-badge ${meta.cls}">${meta.label}</span>
        ${p.contact?`<div class="pd-id">${p.contact}</div>`:''}
        <div style="margin-top:6px;font-size:13px;font-weight:700;color:${impColor};">${pplImpLabel(imp)}/±5 closeness</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
        <div style="font-size:11px;font-weight:700;color:${alertColors[alert]||'var(--text3)'};">${alertLabels[alert]||''}</div>
        <button class="pd-action-btn" onclick="deletePerson('${id}')" style="color:var(--coral);border-color:var(--coral);font-size:12px;">Remove</button>
      </div>
    </div>

    <button class="catchup-btn" onclick="quickCatchup('${id}',event)">☕ Quick catchup — today, ${pplJalaliLabel(todayStr)}</button>

    <div class="pd-stats">
      <div class="pd-stat"><div class="pd-stat-val">${pplFormatDays(pplDaysSince(p.last_chat))}</div><div class="pd-stat-lbl">Last chat</div></div>
      <div class="pd-stat"><div class="pd-stat-val">${pplFormatDays(pplDaysSince(p.last_hangout))}</div><div class="pd-stat-lbl">Last hangout</div></div>
      <div class="pd-stat"><div class="pd-stat-val">${acts.length}</div><div class="pd-stat-lbl">Total logs</div></div>
    </div>

    ${acts.length>0?`<div style="margin-bottom:20px;"><div class="flabel" style="margin-bottom:10px;">Activity breakdown</div>${miniChart}</div>`:''}

    <div style="margin-bottom:20px;">
      <div class="flabel" style="margin-bottom:10px;">Log an activity</div>
      <div class="log-act-row">
        <select class="m-input" id="actType_${id}" style="font-size:13px;">${actOpts}</select>
        <input class="m-input" id="actDate_${id}" type="date" value="${todayStr}" style="font-size:13px;"/>
        <button class="m-btn sage" onclick="logActivity('${id}')">Log</button>
      </div>
      <input class="m-input" id="actNote_${id}" placeholder="Note… (optional)" style="width:100%;margin-top:8px;font-size:13px;" onkeydown="if(event.key==='Enter')logActivity('${id}')"/>
    </div>

    <div style="margin-bottom:20px;">
      <div class="flabel" style="margin-bottom:10px;">Activity history</div>
      <div class="act-log">${logHTML}</div>
    </div>

    <div style="margin-bottom:20px;">
      <div class="flabel" style="margin-bottom:8px;">Notes about ${p.name}</div>
      <textarea class="pd-notes" id="pdNotes_${id}" placeholder="Anything you want to remember…">${p.notes||''}</textarea>
      <button class="m-btn sage" onclick="savePersonNotes('${id}')" style="margin-top:8px;width:100%;">Save notes</button>
    </div>

    ${circlesSection}

    <div class="rel-section">
      <div class="flabel" style="margin-bottom:10px;">Relationships with others</div>
      <div class="rel-list" id="relList_${id}">${pplRenderRelList(id)}</div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:8px;margin-top:4px;">Add / update a relationship:</div>
      <div style="display:grid;grid-template-columns:1fr auto auto auto;gap:7px;align-items:end;flex-wrap:wrap;">
        <select class="m-input" id="relTarget_${id}" style="font-size:12px;">
          <option value="">— Person —</option>
          ${PPL.people.filter(x=>x.id!==id).map(x=>`<option value="${x.id}">${x.name}</option>`).join('')}
        </select>
        <select class="m-input" id="relStrength_${id}" style="font-size:12px;min-width:110px;">
          <option value="1">+1 Acquaint</option>
          <option value="2">+2 Friends</option>
          <option value="3">+3 Close</option>
          <option value="-1">−1 Dislike</option>
          <option value="-2">−2 Tension</option>
          <option value="-3">−3 Hatred</option>
          <option value="partner">💑 Partner</option>
          <option value="ex">💔 Ex</option>
          <option value="family_bond">🧬 Family bond</option>
          <option value="crush">💓 Crush (one-way)</option>
        </select>
        <select class="m-input" id="relDir_${id}" style="font-size:12px;min-width:100px;">
          <option value="both">↔ Both ways</option>
          <option value="one">→ One-way</option>
        </select>
        <button class="m-btn sage" onclick="addRelationship('${id}')">Add</button>
      </div>
    </div>
  </div>`;
}

// ── Stats panel ───────────────────────────────────────

function pplRenderStats() {
  const el=document.getElementById('pplStatsPanel');
  if(!el) return;
  const allPeople=PPL.people;
  const people=pplFilteredPeople();
  if(!allPeople.length){
    el.innerHTML='<div class="ppl-empty" style="padding:30px;"><div class="ppl-empty-icon" style="font-size:32px;">📊</div><div class="ppl-empty-msg">Add people to see stats</div></div>';
    return;
  }

  const total=people.length;
  const bycat={};
  Object.keys(PPL_CAT_META).forEach(k=>bycat[k]=0);
  people.forEach(p=>{if(bycat[p.category]!==undefined) bycat[p.category]++;});

  const posClose=people.filter(p=>(p.importance||0)>0).length;
  const overdue=people.filter(p=>pplAlertLevel(p)==='overdue');
  const totalActs=people.reduce((s,p)=>s+(p.activities||[]).length,0);

  const actTypeCounts={};
  people.forEach(p=>(p.activities||[]).forEach(a=>{actTypeCounts[a.type]=(actTypeCounts[a.type]||0)+1;}));
  const maxActType=Math.max(1,...Object.values(actTypeCounts));

  const today=new Date(); today.setHours(0,0,0,0);
  const actsLast30=[];
  for(let i=29;i>=0;i--){
    const d=new Date(today); d.setDate(d.getDate()-i);
    const iso=d.toISOString().slice(0,10);
    let cnt=0;
    people.forEach(p=>(p.activities||[]).forEach(a=>{if(a.date===iso) cnt++;}));
    actsLast30.push({date:iso,count:cnt});
  }
  const maxDay=Math.max(1,...actsLast30.map(x=>x.count));
  const sortedByClose=[...people].sort((a,b)=>(b.importance||0)-(a.importance||0));

  // By circle breakdown
  const circleHTML=PPL.circles.length===0?'':`
    <div class="ppl-stat-card" style="margin-bottom:16px;">
      <div class="flabel" style="margin-bottom:12px;">By circle</div>
      ${PPL.circles.map(c=>{
        const cnt=people.filter(p=>(p.circles||[]).includes(c.id)).length;
        const pct=total?Math.round((cnt/total)*100):0;
        return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;">
          <span style="width:8px;height:8px;border-radius:50%;background:${c.color};flex-shrink:0;"></span>
          <span style="width:80px;font-size:11px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${c.name}</span>
          <div style="flex:1;height:10px;background:var(--cream3);border-radius:5px;overflow:hidden;">
            <div style="width:${pct}%;height:100%;background:${c.color};border-radius:5px;"></div>
          </div>
          <span style="font-size:11px;color:var(--text2);min-width:20px;text-align:right;">${cnt}</span>
        </div>`;}).join('')}
    </div>`;

  const catBarHTML=Object.entries(PPL_CAT_META).map(([k,v])=>{
    const cnt=bycat[k]||0;
    const pct=total?Math.round((cnt/total)*100):0;
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;">
      <span style="width:60px;font-size:11px;color:var(--text3);">${v.emoji} ${v.label}</span>
      <div style="flex:1;height:10px;background:var(--cream3);border-radius:5px;overflow:hidden;">
        <div style="width:${pct}%;height:100%;background:${v.color};border-radius:5px;"></div>
      </div>
      <span style="font-size:11px;color:var(--text2);min-width:24px;text-align:right;">${cnt}</span>
    </div>`;}).join('');

  const actTypeBarHTML=Object.entries(PPL_ACT_META).map(([k,v])=>{
    const cnt=actTypeCounts[k]||0;
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;">
      <span style="width:16px;text-align:center;font-size:13px;">${v.emoji}</span>
      <span style="width:72px;font-size:11px;color:var(--text3);">${v.label}</span>
      <div style="flex:1;height:10px;background:var(--cream3);border-radius:5px;overflow:hidden;">
        <div style="width:${Math.round((cnt/maxActType)*100)}%;height:100%;background:${v.textColor};border-radius:5px;"></div>
      </div>
      <span style="font-size:11px;color:var(--text2);min-width:24px;text-align:right;">${cnt}</span>
    </div>`;}).join('');

  const sparkHTML=actsLast30.map(d=>{
    const h=Math.max(2,Math.round((d.count/maxDay)*44));
    const isToday=d.date===pplTodayISO();
    return `<div title="${d.date}: ${d.count}" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:48px;">
      <div style="width:100%;max-width:10px;height:${h}px;background:${isToday?'var(--coral)':'var(--sage)'};border-radius:2px;opacity:${d.count?1:0.2};"></div>
    </div>`;}).join('');

  const leaderHTML=sortedByClose.slice(0,8).map(p=>{
    const imp=p.importance||0, impColor=pplImpColor(imp);
    const lastAct=pplLastActivity(p);
    const meta=PPL_CAT_META[p.category]||{emoji:'👤'};
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:var(--r2);border:1.5px solid var(--cream3);background:var(--cream2);margin-bottom:6px;cursor:pointer;" onclick="pplShowDetail('${p.id}')">
      <div style="width:30px;height:30px;border-radius:50%;background:${pplAvatarBg(p.category)};display:flex;align-items:center;justify-content:center;font-size:13px;overflow:hidden;flex-shrink:0;">
        ${p.photo?`<img src="${p.photo}" style="width:30px;height:30px;border-radius:50%;object-fit:cover;"/>`:meta.emoji}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name}</div>
        <div style="font-size:10px;color:var(--text4);">Last: ${lastAct?pplFormatDays(pplDaysSince(lastAct)):'—'}</div>
      </div>
      <div style="font-size:13px;font-weight:700;color:${impColor};">${pplImpLabel(imp)}</div>
    </div>`;}).join('');

  const overdueHTML=overdue.length===0
    ?'<div style="font-size:12px;color:var(--sage);font-style:italic;">Everyone is up to date 🎉</div>'
    :overdue.map(p=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="font-size:13px;">${(PPL_CAT_META[p.category]||{emoji:'👤'}).emoji}</span>
        <span style="flex:1;font-size:12px;font-weight:600;">${p.name}</span>
        <button class="m-btn sage" style="font-size:10px;padding:2px 7px;" onclick="quickCatchup('${p.id}',event)">☕</button>
      </div>`).join('');

  el.innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px;">
      <div class="pd-stat"><div class="pd-stat-val">${total}</div><div class="pd-stat-lbl">People</div></div>
      <div class="pd-stat"><div class="pd-stat-val">${totalActs}</div><div class="pd-stat-lbl">Activities</div></div>
      <div class="pd-stat"><div class="pd-stat-val" style="color:#3a7a5a;">+${posClose}</div><div class="pd-stat-lbl">Close ones</div></div>
      <div class="pd-stat"><div class="pd-stat-val" style="color:var(--coral);">${overdue.length}</div><div class="pd-stat-lbl">Overdue</div></div>
    </div>

    ${circleHTML}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
      <div class="ppl-stat-card"><div class="flabel" style="margin-bottom:12px;">By category</div>${catBarHTML}</div>
      <div class="ppl-stat-card"><div class="flabel" style="margin-bottom:10px;">⚠️ Overdue</div>${overdueHTML}</div>
    </div>

    <div class="ppl-stat-card" style="margin-bottom:16px;">
      <div class="flabel" style="margin-bottom:10px;">Activity — last 30 days</div>
      <div style="display:flex;align-items:flex-end;gap:2px;height:48px;">${sparkHTML}</div>
      <div style="display:flex;justify-content:space-between;margin-top:4px;">
        <span style="font-size:10px;color:var(--text4);">30 days ago</span>
        <span style="font-size:10px;color:var(--text4);">Today</span>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div class="ppl-stat-card"><div class="flabel" style="margin-bottom:12px;">Activity types</div>${actTypeBarHTML}</div>
      <div class="ppl-stat-card"><div class="flabel" style="margin-bottom:10px;">Closeness ranking</div>${leaderHTML}</div>
    </div>`;
}

// ── Force-directed Graph ──────────────────────────────

const PPL_GRAPH = {
  nodes:[], edges:[], circleHulls:[],
  dragging:null, pan:{x:0,y:0}, zoom:1,
  canvas:null, ctx:null, animId:null, tick:0,
  physicsOn:true,
  showCircles:true,
  _meImgSrc:'',
  // circle dragging
  draggingCircle:null,
  _circleDragStart:null,
  // multi-select
  selection:new Set(), selRect:null, selStart:null,
};

// Category colors for ME→person edges (matches pplGraphRender catColor map)
const PPL_CAT_EDGE = {
  family: '#FF6B6B',
  friend: '#4ECDC4',
  online: '#45B7D1',
  date:   '#FF9FF3',
};

function pplDrawGraph() {
  const container=document.getElementById('pplGraphCanvas');
  if(!container) return;
  const people=PPL.people||[];
  if(!people.length){
    container.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text4);font-size:14px;font-style:italic;">Add people to see the graph</div>';
    return;
  }

  if(!PPL_GRAPH.canvas||!container.contains(PPL_GRAPH.canvas)){
    container.innerHTML='';
    const canvas=document.createElement('canvas');
    canvas.style.cssText='width:100%;height:100%;display:block;';
    container.appendChild(canvas);
    PPL_GRAPH.canvas=canvas;
    PPL_GRAPH.ctx=canvas.getContext('2d');
    pplGraphSetupEvents(canvas);
  }

  const prevPos={};
  PPL_GRAPH.nodes.forEach(n=>{prevPos[n.id]={x:n.x,y:n.y,vx:n.vx,vy:n.vy,_img:n._img,photo:n.photo};});

  // Build nodes — include "ME" node if toggled
  const allNodes=[];
  if(PPL.graphShowMe){
    const mePrev=prevPos['__me__'];
    allNodes.push({id:'__me__',name:'Me',isMe:true,category:null,importance:0,
      photo:PPL.mePhoto||null, circles:[],
      x:mePrev?mePrev.x:0, y:mePrev?mePrev.y:0, vx:0,vy:0,
      _img:(mePrev&&mePrev._img&&PPL_GRAPH._meImgSrc===PPL.mePhoto)?mePrev._img:null});
  }
  people.forEach(p=>{
    const prev=prevPos[p.id];
    const angle=Math.random()*Math.PI*2, r=80+Math.random()*120;
    // If photo changed since last build, drop the cached image
    const photoChanged=prev&&prev.photo!==p.photo;
    allNodes.push({id:p.id,name:p.name,isMe:false,photo:p.photo||null,
      category:p.category,importance:p.importance||0,circles:p.circles||[],
      x:prev?prev.x:Math.cos(angle)*r, y:prev?prev.y:Math.sin(angle)*r,
      vx:prev?prev.vx:0, vy:prev?prev.vy:0,
      _img:(prev&&!photoChanged)?prev._img:null});
  });
  PPL_GRAPH.nodes=allNodes;

  // Build edges — person-to-person + ME edges if toggled
  const edges=[];
  (PPL.relationships||[]).forEach(r=>{
    edges.push({from:r.from,to:r.to,strength:r.strength,direction:r.direction,special:typeof r.strength==='string'});
  });
  if(PPL.graphShowMe){
    people.forEach(p=>{
      const imp=p.importance||0;
      if(imp!==0) edges.push({from:'__me__',to:p.id,strength:imp,direction:'both',
        special:false,isMyRel:true,category:p.category});
    });
  }
  PPL_GRAPH.edges=edges;

  // Auto-fit camera to frame the graph the first time it's built (no saved pan/zoom yet)
  if(!PPL_GRAPH._everFitted){
    requestAnimationFrame(()=>{ pplGraphFitView(); PPL_GRAPH._everFitted=true; });
  }

  if(PPL_GRAPH.animId) cancelAnimationFrame(PPL_GRAPH.animId);
  PPL_GRAPH.tick=0;
  function loop(){
    pplGraphSizeCanvas();
    if(PPL_GRAPH.physicsOn){pplGraphSimStep();PPL_GRAPH.tick++;}
    pplGraphRender();
    PPL_GRAPH.animId=requestAnimationFrame(loop);
  }
  loop();
}

// Frame the camera (pan + zoom) around the current node bounding box, with padding.
function pplGraphFitView(){
  const c=PPL_GRAPH.canvas;
  if(!c||!PPL_GRAPH.nodes.length) return;
  pplGraphSizeCanvas();
  const W=c.width, H=c.height;
  if(!W||!H) return;

  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  PPL_GRAPH.nodes.forEach(n=>{
    const R=pplNodeRadius(n)+40; // pad for labels/hulls
    minX=Math.min(minX,n.x-R); maxX=Math.max(maxX,n.x+R);
    minY=Math.min(minY,n.y-R); maxY=Math.max(maxY,n.y+R);
  });
  if(!isFinite(minX)) return;

  const boxW=Math.max(60,maxX-minX), boxH=Math.max(60,maxY-minY);
  const cx=(minX+maxX)/2, cy=(minY+maxY)/2;

  const zoomX=W/boxW, zoomY=H/boxH;
  const zoom=Math.max(0.25,Math.min(2.5, Math.min(zoomX,zoomY)*0.88)); // 0.88 = breathing room

  PPL_GRAPH.zoom=zoom;
  PPL_GRAPH.pan={x:-cx*zoom, y:-cy*zoom};
}

function pplGraphSizeCanvas(){
  const c=PPL_GRAPH.canvas; if(!c) return;
  const r=c.getBoundingClientRect();
  if(c.width!==Math.round(r.width)||c.height!==Math.round(r.height)){c.width=Math.round(r.width);c.height=Math.round(r.height);}
}

// Compute circle hull geometry (center + radii) for containment math
function pplCircleHullGeom(circleId){
  const members=PPL_GRAPH.nodes.filter(n=>n.circles&&n.circles.includes(circleId)&&!n.isMe);
  if(members.length===0) return null;
  const cx=members.reduce((s,n)=>s+n.x,0)/members.length;
  const cy=members.reduce((s,n)=>s+n.y,0)/members.length;
  const pad=56;
  const pts=members.map(n=>({dx:n.x-cx,dy:n.y-cy}));
  const rx=Math.max(pad,...pts.map(p=>Math.abs(p.dx)+pad));
  const ry=Math.max(pad,...pts.map(p=>Math.abs(p.dy)+pad));
  return {cx,cy,rx,ry};
}

function pplGraphSimStep(){
  const nodes=PPL_GRAPH.nodes, edges=PPL_GRAPH.edges;
  const cooling=Math.max(0.12, 1-PPL_GRAPH.tick/1200);
  const damping=0.5;

  // ── 1. Node-node repulsion (local only, no gravity) ──
  for(let i=0;i<nodes.length;i++){
    for(let j=i+1;j<nodes.length;j++){
      const a=nodes[i], b=nodes[j];
      const dx=b.x-a.x, dy=b.y-a.y;
      const dist=Math.sqrt(dx*dx+dy*dy)||0.01;
      const minD=(pplNodeRadius(a)+pplNodeRadius(b))+10;
      if(dist>=minD*4) continue;
      const repForce=dist<minD ? 11000/(dist*dist) : 600/(dist*dist);
      const fx=(dx/dist)*repForce, fy=(dy/dist)*repForce;
      a.vx-=fx; a.vy-=fy; b.vx+=fx; b.vy+=fy;
    }
  }

  // ── 2. Edge springs ──
  edges.forEach(e=>{
    const src=nodes.find(n=>n.id===e.from), tgt=nodes.find(n=>n.id===e.to);
    if(!src||!tgt) return;
    const dx=tgt.x-src.x, dy=tgt.y-src.y;
    const dist=Math.sqrt(dx*dx+dy*dy)||1;
    const targetLen=e.isMyRel?190:140;
    if(dist<6) return;
    const force=(dist-targetLen)*0.038;
    const fx=(dx/dist)*force, fy=(dy/dist)*force;
    src.vx+=fx; src.vy+=fy; tgt.vx-=fx; tgt.vy-=fy;
  });

  // ── 3. Integrate positions (no gravity) ──
  nodes.forEach(n=>{
    if(PPL_GRAPH.dragging===n.id) return;
    if(PPL_GRAPH.draggingCircle && n.circles && n.circles.includes(PPL_GRAPH.draggingCircle)) return;
    if(PPL_GRAPH.selDragOffsets && PPL_GRAPH.selDragOffsets[n.id]) return;
    n.vx*=damping; n.vy*=damping;
    n.x+=n.vx*cooling; n.y+=n.vy*cooling;
  });

  // ── 4. HARD positional clamp — run AFTER integration ──
  // This is the wall. It is not a force. It teleports nodes that crossed the boundary.
  if(PPL_GRAPH.showCircles){
    PPL.circles.forEach(circle=>{
      if(circle._hidden) return;
      const members=nodes.filter(n=>!n.isMe && n.circles && n.circles.includes(circle.id));
      const nonMembers=nodes.filter(n=>!n.isMe && !(n.circles && n.circles.includes(circle.id)));
      if(!members.length) return;

      // Compute stable hull from members only
      const mcx=members.reduce((s,n)=>s+n.x,0)/members.length;
      const mcy=members.reduce((s,n)=>s+n.y,0)/members.length;
      const pad=66;
      const rx=members.length===1 ? pad : Math.max(pad,...members.map(n=>Math.abs(n.x-mcx)+pad));
      const ry=members.length===1 ? pad : Math.max(pad,...members.map(n=>Math.abs(n.y-mcy)+pad));

      function ellClamp(n, mustBeInside){
        const ndx=n.x-mcx, ndy=n.y-mcy;
        const ellVal=Math.sqrt((ndx/rx)**2+(ndy/ry)**2)||0.001;
        if(mustBeInside && ellVal>0.92){
          // clamp inside: project onto 0.92 of ellipse surface
          const scale=0.92/ellVal;
          n.x=mcx+ndx*scale; n.y=mcy+ndy*scale;
          // kill outward velocity
          const gx=ndx/(rx*rx), gy=ndy/(ry*ry);
          const gl=Math.sqrt(gx*gx+gy*gy)||0.001;
          const outx=gx/gl, outy=gy/gl;
          const vout=n.vx*outx+n.vy*outy;
          if(vout>0){n.vx-=outx*vout; n.vy-=outy*vout;}
        } else if(!mustBeInside && ellVal<1.08){
          // clamp outside: project onto 1.08 of ellipse surface
          const scale=1.08/ellVal;
          n.x=mcx+ndx*scale; n.y=mcy+ndy*scale;
          // kill inward velocity
          const gx=ndx/(rx*rx), gy=ndy/(ry*ry);
          const gl=Math.sqrt(gx*gx+gy*gy)||0.001;
          const outx=gx/gl, outy=gy/gl;
          const vin=-(n.vx*outx+n.vy*outy);
          if(vin>0){n.vx+=outx*vin; n.vy+=outy*vin;}
        }
      }

      members.forEach(n=>{
        // Skip if being manually dragged — let user position it but clamp on release
        if(PPL_GRAPH.dragging===n.id) return;
        ellClamp(n, true);
      });
      nonMembers.forEach(n=>{
        if(PPL_GRAPH.dragging===n.id){
          // User is dragging this non-member — if they try to drag it inside, push it back out
          ellClamp(n, false);
        } else {
          ellClamp(n, false);
        }
      });
    });
  }
}


function pplNodeRadius(n){
  if(n.isMe) return 34;
  const imp=Math.abs(n.importance||0);
  return 18 + imp*1.6; // 18..26 based on |importance|
}

function pplGraphRender(){
  const canvas=PPL_GRAPH.canvas, ctx=PPL_GRAPH.ctx;
  if(!canvas||!ctx) return;
  const W=canvas.width, H=canvas.height;
  ctx.clearRect(0,0,W,H);
  ctx.save();
  ctx.translate(W/2+PPL_GRAPH.pan.x, H/2+PPL_GRAPH.pan.y);
  ctx.scale(PPL_GRAPH.zoom, PPL_GRAPH.zoom);

  // Draw selection rect
  if(PPL_GRAPH.selRect){
    const sr=PPL_GRAPH.selRect;
    ctx.save();
    ctx.strokeStyle='#6C63FF';ctx.lineWidth=1;ctx.setLineDash([4,3]);
    ctx.fillStyle='rgba(108,99,255,0.06)';
    ctx.beginPath();ctx.rect(sr.x,sr.y,sr.w,sr.h);ctx.fill();ctx.stroke();
    ctx.setLineDash([]);ctx.restore();
  }

  // Draw circle hulls (draggable)
  if(PPL_GRAPH.showCircles){
    PPL.circles.forEach(circle=>{
      if(circle._hidden) return;
      const members=PPL_GRAPH.nodes.filter(n=>n.circles&&n.circles.includes(circle.id)&&!n.isMe);
      if(members.length<1) return;
      const mcx=members.reduce((s,n)=>s+n.x,0)/members.length;
      const mcy=members.reduce((s,n)=>s+n.y,0)/members.length;
      const pad=62;
      const rx=members.length===1?pad:Math.max(pad,...members.map(n=>Math.abs(n.x-mcx)+pad));
      const ry=members.length===1?pad:Math.max(pad,...members.map(n=>Math.abs(n.y-mcy)+pad));
      ctx.save();
      ctx.globalAlpha=0.09;ctx.fillStyle=circle.color;
      ctx.beginPath();
      if(members.length===1) ctx.arc(members[0].x,members[0].y,pad,0,Math.PI*2);
      else ctx.ellipse(mcx,mcy,rx,ry,0,0,Math.PI*2);
      ctx.fill();
      ctx.globalAlpha=0.45;ctx.strokeStyle=circle.color;ctx.lineWidth=2;ctx.setLineDash([6,3]);
      ctx.beginPath();
      if(members.length===1) ctx.arc(members[0].x,members[0].y,pad,0,Math.PI*2);
      else ctx.ellipse(mcx,mcy,rx,ry,0,0,Math.PI*2);
      ctx.stroke();ctx.setLineDash([]);
      // label
      const topY=members.length===1?members[0].y-pad:mcy-ry;
      ctx.globalAlpha=0.9;ctx.font=`700 11px 'Vazirmatn',sans-serif`;
      ctx.textAlign='center';ctx.fillStyle=circle.color;
      ctx.fillText(circle.name, mcx, topY-8);
      ctx.restore();
    });
  }

  function isNodeHidden(id){
    if(!PPL_GRAPH.showCircles) return false;
    const n=PPL_GRAPH.nodes.find(x=>x.id===id);
    if(!n||n.isMe) return false;
    return (n.circles||[]).some(cid=>{const c=PPL.circles.find(x=>x.id===cid);return c&&c._hidden;});
  }

  // Draw edges
  PPL_GRAPH.edges.forEach(e=>{
    const src=PPL_GRAPH.nodes.find(n=>n.id===e.from), tgt=PPL_GRAPH.nodes.find(n=>n.id===e.to);
    if(!src||!tgt) return;
    if(isNodeHidden(e.from)||isNodeHidden(e.to)) return;
    const dx=tgt.x-src.x, dy=tgt.y-src.y, len=Math.sqrt(dx*dx+dy*dy)||1;
    const nx=-dy/len, ny=dx/len;

    if(e.special || typeof e.strength==='string'){
      const sm=PPL_REL_SPECIAL[e.strength]||{color:'#999',dash:[],width:2};
      // crush is always one-way
      const isCrush=e.strength==='crush';
      ctx.save();
      ctx.beginPath();ctx.moveTo(src.x,src.y);ctx.lineTo(tgt.x,tgt.y);
      ctx.strokeStyle=sm.color;ctx.lineWidth=sm.width;
      ctx.setLineDash(sm.dash);ctx.globalAlpha=0.85;ctx.stroke();
      ctx.setLineDash([]);ctx.restore();
      // arrow for one-way or crush
      if(e.direction==='one'||isCrush){
        _drawArrow(ctx,src,tgt,dx,dy,len,nx,ny,sm.color);
      }
    } else if(e.isMyRel){
      const catColor={family:'#FF6B6B',friend:'#4ECDC4',online:'#45B7D1',date:'#FF9FF3'}[e.category]||'#888';
      const absS=Math.abs(e.strength);
      ctx.save();
      ctx.beginPath();ctx.moveTo(src.x,src.y);ctx.lineTo(tgt.x,tgt.y);
      ctx.strokeStyle=catColor;ctx.lineWidth=1+absS*0.7;ctx.setLineDash([5,4]);
      ctx.globalAlpha=0.5+absS*0.09;ctx.stroke();ctx.setLineDash([]);ctx.restore();
      if(e.direction==='one') _drawArrow(ctx,src,tgt,dx,dy,len,nx,ny,catColor);
    } else {
      const s=e.strength, isPos=s>0, absS=Math.abs(s);
      const color=isPos?'#3a7a5a':'#e87a3a'; // green for pos, orange-red for neg
      for(let li=0;li<absS;li++){
        const offset=absS===1?0:(li-(absS-1)/2)*6;
        ctx.beginPath();
        ctx.moveTo(src.x+nx*offset,src.y+ny*offset);
        ctx.lineTo(tgt.x+nx*offset,tgt.y+ny*offset);
        ctx.strokeStyle=color; ctx.lineWidth=2;
        ctx.setLineDash([]); // always solid lines
        ctx.globalAlpha=0.65; ctx.stroke(); ctx.globalAlpha=1; ctx.setLineDash([]);
      }
      if(e.direction==='one') _drawArrow(ctx,src,tgt,dx,dy,len,nx,ny,color);
    }
  });

  // Draw nodes
  PPL_GRAPH.nodes.forEach(n=>{
    // Skip nodes whose circle is hidden
    if(!n.isMe && PPL_GRAPH.showCircles){
      const hidden=(n.circles||[]).some(cid=>{
        const c=PPL.circles.find(x=>x.id===cid);
        return c&&c._hidden;
      });
      if(hidden) return;
    }
    const R=pplNodeRadius(n);
    const imp=n.importance||0;
    const isSel=PPL_GRAPH.selection.has(n.id);
    // border color: ME=purple, pos=green, neg=coral, zero=gray
    const borderColor=n.isMe?'#6C63FF':(imp>0?'#26C485':imp<0?'#FF6B6B':'#bbb');
    const borderW=n.isMe?4:2+Math.abs(imp)*0.5;
    const bgMap={family:'#FFF0ED',friend:'#E8F8F2',online:'#E8F3FB',date:'#FFF0F8'};
    const bg=n.isMe?'#2d2459':bgMap[n.category]||'#f4f2ee';

    // Selection glow
    if(isSel){
      ctx.save();ctx.shadowColor='#6C63FF';ctx.shadowBlur=14;
      ctx.beginPath();ctx.arc(n.x,n.y,R+3,0,Math.PI*2);
      ctx.fillStyle='rgba(108,99,255,0.2)';ctx.fill();ctx.restore();
    }

    // ME glow
    if(n.isMe){
      ctx.save();ctx.shadowColor='#6C63FF';ctx.shadowBlur=22;
      ctx.beginPath();ctx.arc(n.x,n.y,R+4,0,Math.PI*2);
      ctx.fillStyle='rgba(108,99,255,0.13)';ctx.fill();ctx.restore();
    }

    ctx.save();
    ctx.beginPath();ctx.arc(n.x,n.y,R,0,Math.PI*2);ctx.clip();
    if(n.isMe){
      if(n.photo){
        if(!n._img||PPL_GRAPH._meImgSrc!==n.photo){
          const img=new Image();img.src=n.photo;
          img.onload=()=>{n._img=img;PPL_GRAPH._meImgSrc=n.photo;};
          ctx.fillStyle='#2d2459';ctx.fill();
          ctx.fillStyle='#fff';ctx.font=`bold ${R*0.5}px 'Vazirmatn',sans-serif`;
          ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('ME',n.x,n.y);
        } else {ctx.drawImage(n._img,n.x-R,n.y-R,R*2,R*2);}
      } else {
        ctx.fillStyle='#2d2459';ctx.fill();
        ctx.fillStyle='#fff';ctx.font=`bold ${R*0.5}px 'Vazirmatn',sans-serif`;
        ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('ME',n.x,n.y);
      }
    } else if(n.photo){
      if(!n._img){
        const img=new Image();img.src=n.photo;img.onload=()=>{n._img=img;};
        ctx.fillStyle=bg;ctx.fill();
      } else {ctx.drawImage(n._img,n.x-R,n.y-R,R*2,R*2);}
    } else {
      ctx.fillStyle=bg;ctx.fill();
      ctx.fillStyle='#555';ctx.font=`bold ${R*0.65}px 'Vazirmatn',sans-serif`;
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(n.name.charAt(0).toUpperCase(),n.x,n.y);
    }
    ctx.restore();

    ctx.beginPath();ctx.arc(n.x,n.y,R,0,Math.PI*2);
    ctx.strokeStyle=borderColor;ctx.lineWidth=borderW;ctx.stroke();

    ctx.font=`${n.isMe?'700':'600'} ${n.isMe?12:10}px 'Vazirmatn',sans-serif`;
    ctx.textAlign='center';ctx.textBaseline='top';
    ctx.fillStyle=n.isMe?'#6C63FF':'#666';
    ctx.fillText(n.isMe?'You':n.name.split(' ')[0],n.x,n.y+R+4);
  });

  ctx.restore();
}

function _drawArrow(ctx,src,tgt,dx,dy,len,nx,ny,color){
  // Unit vector along edge
  const ux=dx/len, uy=dy/len;
  // Skip src/tgt node circles
  const R_src=pplNodeRadius(src), R_tgt=pplNodeRadius(tgt);
  const start=R_src+6, end=len-R_tgt-6;
  if(end<=start+10) return; // too short
  const usable=end-start;
  // Draw 3 chevron arrows evenly spaced along usable length
  const count=Math.max(1, Math.min(3, Math.floor(usable/28)));
  const spacing=usable/(count+1);
  const hw=8, hl=12; // half-width, head-length
  ctx.save();
  ctx.fillStyle=color; ctx.globalAlpha=0.92;
  for(let i=1;i<=count;i++){
    const d=start+spacing*i; // distance from src along edge
    const px=src.x+ux*d, py=src.y+uy*d;
    // tip of chevron points toward tgt
    const tx=px+ux*hl, ty=py+uy*hl;
    // two base corners, perpendicular
    const lx=px-nx*hw, ly=py-ny*hw; // left wing (nx = perp)
    const rx=px+nx*hw, ry=py+ny*hw; // right wing
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(lx, ly);
    ctx.lineTo(rx, ry);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha=1;
  ctx.restore();
}
function pplCircleAt(wx, wy){
  // Check if world point is inside a circle hull (for dragging)
  for(const circle of PPL.circles){
    if(circle._hidden) continue;
    const members=PPL_GRAPH.nodes.filter(n=>n.circles&&n.circles.includes(circle.id)&&!n.isMe);
    if(!members.length) continue;
    const mcx=members.reduce((s,n)=>s+n.x,0)/members.length;
    const mcy=members.reduce((s,n)=>s+n.y,0)/members.length;
    const pad=62;
    const rx=members.length===1?pad:Math.max(pad,...members.map(n=>Math.abs(n.x-mcx)+pad));
    const ry=members.length===1?pad:Math.max(pad,...members.map(n=>Math.abs(n.y-mcy)+pad));
    const ndx=wx-mcx, ndy=wy-mcy;
    if(Math.sqrt((ndx/rx)**2+(ndy/ry)**2)<1.0) return {circle, mcx, mcy};
  }
  return null;
}

function pplGraphSetupEvents(canvas){
  let isPanning=false, panStart={x:0,y:0}, panOrigin={x:0,y:0};
  let isSelecting=false, selStart={x:0,y:0};

  function nodeAt(cx,cy){
    const W=canvas.width,H=canvas.height;
    const wx=(cx-W/2-PPL_GRAPH.pan.x)/PPL_GRAPH.zoom;
    const wy=(cy-H/2-PPL_GRAPH.pan.y)/PPL_GRAPH.zoom;
    return PPL_GRAPH.nodes.find(n=>{
      const R=pplNodeRadius(n);
      return Math.sqrt((n.x-wx)**2+(n.y-wy)**2)<R+4;
    })||null;
  }
  function xy(e){const r=canvas.getBoundingClientRect(),t=e.touches?e.touches[0]:e;return{x:t.clientX-r.left,y:t.clientY-r.top};}
  function worldXY(cx,cy){const W=canvas.width,H=canvas.height;return{x:(cx-W/2-PPL_GRAPH.pan.x)/PPL_GRAPH.zoom,y:(cy-H/2-PPL_GRAPH.pan.y)/PPL_GRAPH.zoom};}

  canvas.addEventListener('mousedown',e=>{
    const {x,y}=xy(e);
    const w=worldXY(x,y);
    const node=nodeAt(x,y);

    if(node){
      // Ctrl+click: toggle selection
      if(e.ctrlKey||e.metaKey){
        if(PPL_GRAPH.selection.has(node.id)) PPL_GRAPH.selection.delete(node.id);
        else PPL_GRAPH.selection.add(node.id);
        return;
      }
      // Click on already-selected node: drag the whole selection
      if(PPL_GRAPH.selection.has(node.id) && PPL_GRAPH.selection.size>1){
        PPL_GRAPH.dragging=node.id;
        // store drag offsets for all selected nodes relative to clicked node
        PPL_GRAPH.selDragRef={x:w.x,y:w.y};
        PPL_GRAPH.selDragOffsets={};
        PPL_GRAPH.nodes.forEach(n=>{
          if(PPL_GRAPH.selection.has(n.id))
            PPL_GRAPH.selDragOffsets[n.id]={dx:n.x-w.x,dy:n.y-w.y};
        });
        canvas.classList.add('grabbing');
        return;
      }
      // Normal single-node drag
      PPL_GRAPH.selection.clear();
      PPL_GRAPH.dragging=node.id;
      canvas.classList.add('grabbing');
      return;
    }

    // Check circle drag (background of hull)
    if(PPL_GRAPH.showCircles){
      const hit=pplCircleAt(w.x,w.y);
      if(hit && !e.ctrlKey){
        PPL_GRAPH.draggingCircle=hit.circle.id;
        // _circleDragStart already set by capture-phase handler above
        canvas.classList.add('grabbing');
        return;
      }
    }

    // Start selection rect or pan
    if(e.ctrlKey||e.metaKey){
      isSelecting=true;
      selStart=w;
      PPL_GRAPH.selRect={x:w.x,y:w.y,w:0,h:0};
    } else {
      PPL_GRAPH.selection.clear();
      PPL_GRAPH.selRect=null;
      isPanning=true;
      panStart={x,y};panOrigin={x:PPL_GRAPH.pan.x,y:PPL_GRAPH.pan.y};
    }
    canvas.classList.add('grabbing');
  });

  canvas.addEventListener('mousemove',e=>{
    const {x,y}=xy(e);
    const w=worldXY(x,y);

    if(PPL_GRAPH.dragging){
      if(PPL_GRAPH.selDragOffsets&&PPL_GRAPH.selection.size>1){
        // Move all selected nodes together
        PPL_GRAPH.nodes.forEach(n=>{
          if(PPL_GRAPH.selDragOffsets[n.id]){
            n.x=w.x+PPL_GRAPH.selDragOffsets[n.id].dx;
            n.y=w.y+PPL_GRAPH.selDragOffsets[n.id].dy;
            n.vx=0;n.vy=0;
          }
        });
      } else {
        const node=PPL_GRAPH.nodes.find(n=>n.id===PPL_GRAPH.dragging);
        if(node){node.x=w.x;node.y=w.y;node.vx=0;node.vy=0;}
      }
    } else if(PPL_GRAPH.draggingCircle){
      const ds=PPL_GRAPH._circleDragStart;
      if(ds){
        const ddx=w.x-ds.mx, ddy=w.y-ds.my;
        // Move member nodes directly — hull is always derived from node positions
        PPL_GRAPH.nodes.forEach(n=>{
          if(n.circles&&n.circles.includes(PPL_GRAPH.draggingCircle)&&!n.isMe){
            const base=ds.members[n.id];
            if(base){n.x=base.x+ddx;n.y=base.y+ddy;n.vx=0;n.vy=0;}
          }
        });
      }
    } else if(isSelecting){
      PPL_GRAPH.selRect={x:Math.min(selStart.x,w.x),y:Math.min(selStart.y,w.y),
        w:Math.abs(w.x-selStart.x),h:Math.abs(w.y-selStart.y)};
    } else if(isPanning){
      PPL_GRAPH.pan.x=panOrigin.x+(x-panStart.x);
      PPL_GRAPH.pan.y=panOrigin.y+(y-panStart.y);
    }
  });

  window.addEventListener('mouseup',()=>{
    if(isSelecting && PPL_GRAPH.selRect){
      const r=PPL_GRAPH.selRect;
      PPL_GRAPH.nodes.forEach(n=>{
        if(n.x>=r.x&&n.x<=r.x+r.w&&n.y>=r.y&&n.y<=r.y+r.h)
          PPL_GRAPH.selection.add(n.id);
      });
      PPL_GRAPH.selRect=null;
    }
    if(PPL_GRAPH.dragging) PPL_GRAPH.selDragOffsets=null;
    PPL_GRAPH.dragging=null;
    PPL_GRAPH.draggingCircle=null;
    PPL_GRAPH._circleDragStart=null;
    isPanning=false; isSelecting=false;
    canvas.classList.remove('grabbing');
  });

  canvas.addEventListener('mousedown',e=>{
    // Capture member start positions for circle drag (capture phase = before main handler)
    if(PPL_GRAPH.showCircles){
      const {x,y}=xy(e);
      const w=worldXY(x,y);
      const hit=pplCircleAt(w.x,w.y);
      if(hit){
        const memberNodes=PPL_GRAPH.nodes.filter(n=>n.circles&&n.circles.includes(hit.circle.id)&&!n.isMe);
        const memberMap={};
        memberNodes.forEach(n=>{memberMap[n.id]={x:n.x,y:n.y};});
        PPL_GRAPH._circleDragStart={mx:w.x,my:w.y,members:memberMap};
      }
    }
  },true);

  canvas.addEventListener('wheel',e=>{e.preventDefault();PPL_GRAPH.zoom=Math.max(0.2,Math.min(4,PPL_GRAPH.zoom*(e.deltaY>0?0.9:1.1)));},{passive:false});
  canvas.addEventListener('dblclick',e=>{const {x,y}=xy(e),node=nodeAt(x,y);if(node&&node.isMe)pplTriggerMePhoto();});
  canvas.addEventListener('touchstart',e=>{if(e.touches.length===1){const {x,y}=xy(e),node=nodeAt(x,y);if(node)PPL_GRAPH.dragging=node.id;else{isPanning=true;panStart={x,y};panOrigin={x:PPL_GRAPH.pan.x,y:PPL_GRAPH.pan.y};}}});
  canvas.addEventListener('touchmove',e=>{e.preventDefault();if(e.touches.length===1){const {x,y}=xy(e);if(PPL_GRAPH.dragging){const w=worldXY(x,y);const node=PPL_GRAPH.nodes.find(n=>n.id===PPL_GRAPH.dragging);if(node){node.x=w.x;node.y=w.y;node.vx=0;node.vy=0;}}else if(isPanning){PPL_GRAPH.pan.x=panOrigin.x+(x-panStart.x);PPL_GRAPH.pan.y=panOrigin.y+(y-panStart.y);}}},{passive:false});
  canvas.addEventListener('touchend',()=>{PPL_GRAPH.dragging=null;isPanning=false;});
}

function pplGraphReset(){
  // Scatter nodes randomly, re-enable physics
  PPL_GRAPH.nodes.forEach(n=>{
    if(n.isMe){n.x=0;n.y=0;}
    else{const a=Math.random()*Math.PI*2,r=60+Math.random()*120;n.x=Math.cos(a)*r;n.y=Math.sin(a)*r;}
    n.vx=0;n.vy=0;
  });
  PPL_GRAPH.tick=0;
  if(!PPL_GRAPH.physicsOn){PPL_GRAPH.physicsOn=true;pplUpdatePhysicsBtn();}
  pplGraphFitView();
}

function pplGraphRelax(){
  // Smart layout: pre-position nodes into circle/category clusters, then let physics resolve
  const nodes=PPL_GRAPH.nodes;
  const N=nodes.length;
  if(!N) return;

  // Build cluster groups
  const clusters={}; // key → [nodeIds]
  if(PPL_GRAPH.showCircles && PPL.circles.length){
    // Group by first circle membership
    const unassigned=[];
    nodes.forEach(n=>{
      if(n.isMe){return;}
      const firstCircle=(n.circles||[]).find(cid=>PPL.circles.some(c=>c.id===cid));
      if(firstCircle)(clusters[firstCircle]=clusters[firstCircle]||[]).push(n);
      else unassigned.push(n);
    });
    if(unassigned.length) clusters['__none__']=unassigned;
  } else {
    nodes.forEach(n=>{
      if(n.isMe) return;
      const k=n.category||'other';
      (clusters[k]=clusters[k]||[]).push(n);
    });
  }

  const clusterKeys=Object.keys(clusters);
  const numClusters=clusterKeys.length;
  const spreadR=Math.max(250, numClusters*130);

  // Arrange cluster centers in a circle
  clusterKeys.forEach((key,ci)=>{
    const angle=(ci/numClusters)*Math.PI*2 - Math.PI/2;
    const cx=Math.cos(angle)*spreadR;
    const cy=Math.sin(angle)*spreadR;
    const members=clusters[key];
    // Arrange members in a tight sub-circle around cluster center
    members.forEach((n,mi)=>{
      const a=(mi/members.length)*Math.PI*2;
      const r=Math.max(60, members.length*28);
      n.x=cx+Math.cos(a)*r;
      n.y=cy+Math.sin(a)*r;
      n.vx=0;n.vy=0;
    });
  });

  // ME stays center
  const me=nodes.find(n=>n.isMe);
  if(me){me.x=0;me.y=0;me.vx=0;me.vy=0;}

  // Reset tick and re-enable physics for a clean settle
  PPL_GRAPH.tick=0;
  if(!PPL_GRAPH.physicsOn){PPL_GRAPH.physicsOn=true;pplUpdatePhysicsBtn();}
  pplGraphFitView();
}

function pplToggleCircleVisibility(circleId, btn){
  const circle=PPL.circles.find(c=>c.id===circleId);
  if(!circle) return;
  circle._hidden=!circle._hidden;
  if(btn){
    btn.style.opacity=circle._hidden?'0.35':'1';
    btn.title=circle._hidden?'Show circle':'Hide circle';
  }
}

function pplToggleCircles(){
  PPL_GRAPH.showCircles=!PPL_GRAPH.showCircles;
  const btn=document.getElementById('graphCirclesToggle');
  if(btn){
    btn.style.background=PPL_GRAPH.showCircles?'var(--sky)':'';
    btn.style.color=PPL_GRAPH.showCircles?'#fff':'';
    btn.style.borderColor=PPL_GRAPH.showCircles?'var(--sky)':'';
  }
}

function pplToggleGraphFullscreen(){
  const wrap=document.getElementById('pplGraphWrap');
  const btn=document.getElementById('graphFsBtn');
  if(!wrap) return;
  const goingFullscreen=!wrap.classList.contains('fullscreen');
  wrap.classList.toggle('fullscreen');
  if(btn) btn.textContent=goingFullscreen?'✕ Exit Fullscreen':'⛶ Fullscreen';
  // Resize canvas to fill new available space, then re-frame the graph
  requestAnimationFrame(()=>{
    pplGraphSizeCanvas();
    pplGraphFitView();
  });
}

// Allow Escape key to exit graph fullscreen
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    const wrap=document.getElementById('pplGraphWrap');
    if(wrap&&wrap.classList.contains('fullscreen')) pplToggleGraphFullscreen();
  }
});

function pplUpdatePhysicsBtn(){
  const btn=document.getElementById('graphPhysicsToggle');
  if(!btn) return;
  const on=PPL_GRAPH.physicsOn;
  btn.textContent=on?'⏸ Physics':'▶ Physics';
  btn.style.background=on?'var(--sage)':'';
  btn.style.color=on?'#fff':'';
  btn.style.borderColor=on?'var(--sage)':'';
}

function pplTogglePhysics(){
  PPL_GRAPH.physicsOn=!PPL_GRAPH.physicsOn;
  if(PPL_GRAPH.physicsOn){
    // zero out velocities so it doesn't explode from accumulated forces
    PPL_GRAPH.nodes.forEach(n=>{n.vx=0;n.vy=0;});
  }
  pplUpdatePhysicsBtn();
}

function pplToggleMe(){
  PPL.graphShowMe=!PPL.graphShowMe;
  const btn=document.getElementById('graphMeToggle');
  if(btn){btn.style.background=PPL.graphShowMe?'#6C63FF':'';btn.style.color=PPL.graphShowMe?'#fff':'';btn.style.borderColor=PPL.graphShowMe?'#6C63FF':'';}
  pplDrawGraph();
}

// ── Backup alert poller ──────────────────────────────
async function pplCheckBackupAlerts(){
  try{
    const r=await fetch('/api/backup');
    const d=await r.json();
    if(d.alerts&&d.alerts.length){
      const msg='⚠️ DB SHRINK ALERT: '+d.alerts.join(', ')+' — check your data!';
      showToast(msg,'');
      await fetch('/api/backup',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'dismiss_alerts'})});
    }
  }catch(e){}
}

// ── Init ──────────────────────────────────────────────

function initPeople(){
  pplLoad();
  // Check for shrink alerts on load and every 10 min
  pplCheckBackupAlerts();
  setInterval(pplCheckBackupAlerts, 600000);
}
