(() => {
  'use strict';
  const host = document.getElementById('workbench-view');
  const source = document.getElementById('session-plan');
  if (!host || !source) return;
  let plan;
  try { plan = JSON.parse(source.textContent); } catch (_) { return; }
  if (!Array.isArray(plan.sessions) || !plan.sessions.length) return;
  const sessions = plan.sessions;
  const lookup = new Map(sessions.map(s => [s.id, s]));
  const core = sessions.filter(s => !s.optional);
  const KEY = 'robotics-fieldbook-workbench-v1';
  const blank = () => ({version: 1, active: null, records: {}, history: [], ideas: [], ideaDraft: {session:null, text:''}});
  let state = blank(), storageOK = true, loadProblem = false, recoveryRaw = null, recoveryBackedUp = true, timer;
  const id = () => typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
  const textLimit = (value, limit) => typeof value === 'string' && value.length <= limit;
  const stamp = value => typeof value === 'string' && value.length < 40 && Number.isFinite(Date.parse(value));
  function validate(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.version !== 1 || !data.records || typeof data.records !== 'object' || Array.isArray(data.records) || !Array.isArray(data.history) || !Array.isArray(data.ideas)) throw new Error('Choose a valid workbench version 1 export.');
    if (data.active !== null && !lookup.has(data.active)) throw new Error('The saved workbench session is not in this edition.');
    const out = blank(); out.active = data.active;
    for (const [key, record] of Object.entries(data.records)) {
      if (!lookup.has(key) || !record || !textLimit(record.evidence, 20000) || !textLimit(record.nextAction, 3000) || !['working', 'complete'].includes(record.status) || !stamp(record.updatedAt) || (record.status === 'complete' && !record.evidence.trim())) throw new Error('A workbench record is invalid. Existing work was kept.');
      out.records[key] = {evidence: record.evidence, nextAction: record.nextAction, status: record.status, updatedAt: record.updatedAt};
    }
    if (data.history.length > 500 || data.ideas.length > 300) throw new Error('This workbench export has too many entries.');
    for (const event of data.history) {
      if (!event || !textLimit(event.id, 160) || !event.id || !lookup.has(event.session) || !textLimit(event.evidence, 20000) || !textLimit(event.nextAction, 3000) || !['working', 'complete'].includes(event.status) || !stamp(event.at)) throw new Error('An evidence-history entry is invalid.');
      out.history.push({id:event.id, session:event.session, evidence:event.evidence, nextAction:event.nextAction, status:event.status, at:event.at});
    }
    for (const idea of data.ideas) {
      if (!idea || !textLimit(idea.id, 160) || !idea.id || !lookup.has(idea.session) || !textLimit(idea.text, 5000) || !idea.text.trim() || !stamp(idea.at) || typeof idea.archived !== 'boolean') throw new Error('A saved idea is invalid.');
      out.ideas.push({id:idea.id, session:idea.session, text:idea.text, at:idea.at, archived:idea.archived});
    }
    if(data.ideaDraft !== undefined){
      const draft=data.ideaDraft;
      if(!draft || !textLimit(draft.text,5000) || (draft.session!==null&&!lookup.has(draft.session)) || (draft.text.trim()&&!draft.session))throw new Error('The saved idea draft is invalid.');
      out.ideaDraft={session:draft.session,text:draft.text};
    }
    return out;
  }
  try {
    recoveryRaw=localStorage.getItem(KEY+'-recovery');loadProblem=!!recoveryRaw;
    const saved=localStorage.getItem(KEY);
    if(saved)try{state=validate(JSON.parse(saved));}catch(_){
      loadProblem=true;recoveryRaw=saved;
      try{localStorage.setItem(KEY+'-recovery',saved);}catch(_){recoveryBackedUp=false;storageOK=false;}
    }
  }catch(_){storageOK=false;}

  function storageMessage() {
    return !storageOK ? 'Browser storage is unavailable. Keep this page open and export your notes before leaving.' : loadProblem ? 'Earlier workbench data could not be read. A recovery copy is available below; existing chapter notes remain separate.' : 'Saved in this browser. Export notes to keep a backup or move devices.';
  }
  function save() {
    clearTimeout(timer);
    if(!recoveryBackedUp){storageOK=false;}else try { localStorage.setItem(KEY, JSON.stringify(state)); storageOK = true; } catch (_) { storageOK = false; }
    document.querySelectorAll('.wb-storage-status').forEach(el => el.textContent = storageMessage());
  }
  const scheduleSave = () => { clearTimeout(timer); timer = setTimeout(save, 250); };
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  const record = s => state.records[s.id] || {evidence:'', nextAction:'', status:'working', updatedAt:new Date().toISOString()};
  const complete = sessionId => state.records[sessionId]?.status === 'complete';
  function supported(sessionId, seen = new Set()) {
    if(!complete(sessionId)||seen.has(sessionId))return false;
    const s=lookup.get(sessionId);if(!s)return false;
    const visited=new Set(seen);visited.add(sessionId);
    return (s.requires||[]).every(key=>supported(key,visited));
  }
  const ready = s => (s.requires || []).every(key=>supported(key));
  const nextReady = () => core.find(s => !supported(s.id) && ready(s)) || core.find(s => !supported(s.id)) || core[core.length - 1];
  const coreFinished = () => core.every(s=>supported(s.id));
  if(!state.active){const legacy=window.Fieldbook?.getLegacySession?.();if(lookup.has(legacy))state.active=legacy;}
  function current() {
    const pinned = window.Fieldbook?.getPinnedSession?.();
    if (lookup.has(pinned) && pinned !== state.active) state.active = pinned;
    return lookup.get(state.active) || nextReady();
  }
  function activate(s) {
    state.active = s.id;
    window.Fieldbook?.setPinnedSession?.(s.id);
    save();
  }
  function node(tag, cls, content) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (content !== undefined) el.textContent = content;
    return el;
  }
  const paragraph = (text, cls) => node('p', cls || '', text);
  function link(label, href, cls) { const el = node('a', cls, label); el.href = href; return el; }
  function button(label, handler, cls) { const el=node('button',cls || 'wb-button',label);el.type='button';el.addEventListener('click',handler);return el; }
  function details(title, contents, cls) { const d=node('details', cls);d.append(node('summary','',title),...contents);return d; }
  const sessionLink = s => '#session/' + s.id;
  function reset(title) {
    host.replaceChildren(); host.hidden = false; document.body.classList.add('workbench-active');
    document.querySelectorAll('.chapter').forEach(chapter => chapter.hidden = true);
    document.querySelectorAll('.chapter-link').forEach(el => el.removeAttribute('aria-current'));
    const index=document.getElementById('chapter-browser');if(index)index.open=false;
    const crumb=document.getElementById('current-part');if(crumb)crumb.textContent='Your workbench';
    document.title=title+' · The Robotics Fieldbook';
    document.body.classList.remove('nav-open');
    document.getElementById('menu-button')?.setAttribute('aria-expanded','false');
    const sidebar=document.querySelector('.sidebar');if(sidebar)sidebar.inert=matchMedia('(max-width:800px)').matches;
  }
  function heading(kicker, title, intro) {
    const h=node('header','wb-heading');h.append(node('span','eyebrow',kicker),node('h1','',title));if(intro)h.append(paragraph(intro));host.append(h);
  }
  function storageNote() {
    const box=node('div');const p=paragraph(storageMessage(),'wb-storage-status');p.setAttribute('role','status');box.append(p);
    if(recoveryRaw)box.append(button('Download unreadable recovery data',()=>{
      const blob=new Blob([recoveryRaw],{type:'application/json'});const url=URL.createObjectURL(blob);const a=link('Download',url);a.download='workbench-recovery.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    },'wb-text-button'));
    return box;
  }
  function labelledList(title, items, cls) {
    const box=node('div',cls||'');box.append(node('h3','',title));const list=node('ul');for(const item of items || [])list.append(node('li','',item));box.append(list);return box;
  }
  function returnContext(s, includeNext = true) {
    const r=record(s);const history=[...state.history].reverse();const trusted=history.find(h=>h.status==='complete') || history.find(h=>h.evidence.trim());
    const box=node('div','wb-return-context');if(!trusted)box.classList.add('wb-empty-evidence');
    if(trusted){box.append(node('span','eyebrow',trusted.status==='complete'?'Last checkpoint you recorded':'Last evidence you saved'),paragraph(trusted.evidence),link(lookup.get(trusted.session).title,sessionLink(lookup.get(trusted.session))));}
    else box.append(paragraph('Your first saved result will appear here. A photo path, a measured value or a short account of what happened is enough to leave a useful trail.'));
    if(includeNext)box.append(node('h3','','Your next action'),paragraph(r.nextAction || s.actions[0]));
    return box;
  }
  function sourceClone(element, prefix) {
    const copy=element.cloneNode(true);
    copy.querySelectorAll('.session-pin-row,.chapter-footer,.chapter-pagination').forEach(n=>n.remove());
    if(copy.classList.contains('bench-session'))copy.classList.remove('bench-session');
    copy.removeAttribute('hidden');
    const mapping=new Map();
    for(const el of [copy,...copy.querySelectorAll('[id]')])if(el.id){const old=el.id;el.id=prefix+old;mapping.set(old,el.id);}
    for(const el of [copy,...copy.querySelectorAll('*')]){
      for(const attr of ['aria-labelledby','aria-describedby','for'])if(el.hasAttribute(attr))el.setAttribute(attr,el.getAttribute(attr).split(/\s+/).map(x=>mapping.get(x)||x).join(' '));
      for(const attr of [...el.attributes]){
        if(attr.value.includes('url(#'))el.setAttribute(attr.name,attr.value.replace(/url\(#([^)]+)\)/g,(all,target)=>mapping.has(target)?'url(#'+mapping.get(target)+')':all));
        if(el.namespaceURI==='http://www.w3.org/2000/svg' && /^(?:href|xlink:href)$/.test(attr.name) && attr.value[0]==='#' && mapping.has(attr.value.slice(1)))el.setAttribute(attr.name,'#'+mapping.get(attr.value.slice(1)));
      }
      if(el.getAttribute('tabindex')==='-1')el.removeAttribute('tabindex');
    }
    return copy;
  }
  function originalInstructions(s) {
    const original=document.getElementById(s.id);if(!original)return paragraph('Open the full lesson to see its instructions.');
    const chapter=original.closest('.chapter');const prep=node('section','wb-source-context');prep.append(node('h2','','Shared setup for this chapter'),paragraph('Review these requirements before the session. Component choices, downloads and shared contracts apply to the instructions below.'));
    const children=[...chapter.children], firstSession=children.findIndex(el=>el.matches('.bench-session'));
    let shared=children.slice(0,firstSession).filter(el=>!el.matches('.chapter-heading,.chapter-footer,.next-action,.edition-banner,.checkpoint'));
    // A coupon needs printer setup, not the later drivetrain shopping decision.
    if(['precision-setup','precision-measure'].includes(s.id)){
      const driveHeading=shared.findIndex(el=>el.matches('h3')&&el.textContent.includes('Choose the reference drivetrain'));
      if(driveHeading>=0)shared=shared.slice(0,driveHeading);
    }
    function addRange(anchorId){
      let el=document.getElementById(anchorId);
      if(!el)return;
      do{if(!shared.includes(el))shared.push(el);el=el.nextElementSibling;}while(el&&!el.matches('h3,.bench-session,.checkpoint,.chapter-footer,.next-action'));
    }
    if(s.id==='mechanics-assembly'){
      const caster=original.previousElementSibling;
      if(caster?.tagName==='P'&&caster.textContent.includes('third contact'))shared.push(caster);
    }
    if(s.id==='capture-driver-check'||s.id==='mapping-record')addRange('recording-contract');
    if(s.id==='memory-real-observations'||s.id==='memory-position')addRange('memory-contract');
    shared.forEach(el=>prep.append(sourceClone(el,'wb-context-'+s.id+'-')));
    const full=node('section','wb-instructions');full.append(node('h2','','Follow the bench instructions'),paragraph('Keep the required checks in order. The complete source instructions are shown here, including their downloads and diagrams.'),sourceClone(original,'wb-source-'+s.id+'-'));
    const fragment=document.createDocumentFragment();if(shared.length)fragment.append(prep);fragment.append(full);
    if(s.id==='capture-driver-check'){
      const mountedHeading=[...chapter.children].find(el=>el.tagName==='H3'&&el.textContent.includes('Move the learning experiment onto the rover'));
      if(mountedHeading){const mounted=node('section','wb-mounted-check');mounted.append(paragraph('After the sensor view works, return to this check when your trained model and mounted camera are ready. It does not block the first stationary sensor check.','wb-small'));let el=mountedHeading;do{mounted.append(sourceClone(el,'wb-mounted-'+s.id+'-'));el=el.nextElementSibling;}while(el&&!el.matches('h3,.bench-session,.checkpoint,.chapter-footer,.next-action'));fragment.append(mounted);}
    }
    return fragment;
  }
  function recovery(s) {
    const wrap=node('section','wb-recovery');wrap.append(node('h2','','A way forward from here'));
    wrap.append(details('I’m stuck',[paragraph(s.diagnostic),paragraph('Save what you observed before changing another variable. An unresolved check is useful evidence; leave its checkpoint open.')]));
    wrap.append(details('Returning after a break',[returnContext(s),paragraph(s.restart)]));
    wrap.append(details('Only ten minutes',[paragraph(s.shortAction),paragraph('Stop after that small result. Leave the full checkpoint open until its finish condition is met.')]));
    const other=s.track==='learn'?'build':'learn';
    const alternate=core.find(x=>x.id!==s.id && x.track===other && !supported(x.id) && ready(x));
    const waiting=[paragraph(alternate?'The next prepared task on the other track is below. Your current session stays saved until you choose to switch.':'There is no unfinished task on the other track with all its prerequisites recorded. Use the small preparation step below, or review the dependency map.'),paragraph(alternate?alternate.why:s.shortAction)];
    waiting.push(alternate?link(alternate.title,sessionLink(alternate),'wb-button'):link('Open the dependency map','#learning-roadmap'));
    wrap.append(details('Waiting for parts',waiting));return wrap;
  }
  function ideaCapture(s) {
    const body=node('div','wb-idea-body');body.append(paragraph('Keep the idea and the session it interrupted together. You can return to this exact task later.'));
    const label=node('label','','Idea to keep');label.htmlFor='wb-new-idea';const input=node('textarea');input.id='wb-new-idea';input.maxLength=5000;input.rows=3;input.placeholder='What would it demonstrate? Which capability could it reuse?';input.value=state.ideaDraft.text;
    const origin=state.ideaDraft.session||s.id;
    if(state.ideaDraft.text&&origin!==s.id)body.append(link('Draft started during '+lookup.get(origin).title,sessionLink(lookup.get(origin))));
    input.addEventListener('input',()=>{state.ideaDraft={session:input.value.trim()?(state.ideaDraft.session||s.id):null,text:input.value};scheduleSave();});
    const status=paragraph('','wb-form-status');status.setAttribute('role','status');
    const saveIdea=button('Save this idea for later',()=>{
      if(!input.value.trim()){status.textContent='Write the idea you want to keep.';input.focus();return;}
      state.ideas.push({id:id(),session:state.ideaDraft.session||s.id,text:input.value.trim(),at:new Date().toISOString(),archived:false});state.ideas=state.ideas.slice(-300);state.ideaDraft={session:null,text:''};save();input.value='';status.textContent=storageOK?'Idea saved with its starting session. Find it on your workbench.':'Idea kept in this open page. Storage is unavailable; export notes before leaving.';
    });body.append(label,input,saveIdea,status);return details('Save an idea without losing your place',[body],'wb-idea-capture');
  }
  function evidenceForm(s) {
    const form=node('form','wb-evidence-form');form.addEventListener('submit',e=>e.preventDefault());form.append(node('h2','','Leave yourself a way back'),paragraph('One artifact or observation and one exact next action are enough. A saved investigation can remain unfinished.'));
    const r=record(s);const evidenceLabel=node('label','','Evidence or artifact path');evidenceLabel.htmlFor='wb-evidence';const evidence=node('textarea');evidence.id='wb-evidence';evidence.rows=3;evidence.maxLength=20000;evidence.value=r.evidence;evidence.placeholder=s.artifact;
    const nextLabel=node('label','','Exact next action');nextLabel.htmlFor='wb-next-action';const next=node('textarea');next.id='wb-next-action';next.rows=2;next.maxLength=3000;next.value=r.nextAction;next.placeholder=s.actions[0];
    const claim=node('label','wb-check');const checkbox=node('input');checkbox.type='checkbox';checkbox.id='wb-finish-checked';claim.htmlFor=checkbox.id;claim.append(checkbox,node('span','','I checked the finish condition above.'));
    const status=paragraph('','wb-form-status');status.setAttribute('role','status');
    function draft(){const previous=record(s);state.records[s.id]={...previous,evidence:evidence.value,nextAction:next.value,updatedAt:new Date().toISOString()};if(previous.status==='complete'&&!evidence.value.trim())state.records[s.id].status='working';scheduleSave();}
    evidence.addEventListener('input',draft);next.addEventListener('input',draft);
    function commit(statusValue) {
      if(!evidence.value.trim()&&(statusValue==='complete'||!next.value.trim())){status.textContent=statusValue==='complete'?'Save one observation or artifact path for this checkpoint.':'Leave an observation or an exact next action before pausing.';(statusValue==='complete'?evidence:next).focus();return false;}
      if(statusValue==='complete'&&!checkbox.checked&&!(record(s).status==='complete'&&supported(s.id))){status.textContent='Check the finish condition before recording this checkpoint.';checkbox.focus();return false;}
      const updatedAt=new Date().toISOString();const rec={evidence:evidence.value.trim(),nextAction:next.value.trim(),status:statusValue,updatedAt};state.records[s.id]=rec;
      state.history.push({id:id(),session:s.id,evidence:rec.evidence,nextAction:rec.nextAction,status:statusValue,at:updatedAt});state.history=state.history.slice(-500);
      save();return true;
    }
    const actions=node('div','wb-actions');actions.append(button('Save and pause',()=>{if(commit(record(s).status==='complete'?'complete':'working')){if(record(s).status==='working')activate(s);location.hash='workbench';}},'wb-button wb-secondary'));
    actions.append(button('Record checkpoint met',()=>{
      if(!commit('complete'))return;
      const nextSession=nextReady();activate(nextSession);status.textContent=!storageOK?'Checkpoint kept in this open page. Export notes before leaving.':coreFinished()?'Your core checkpoints are recorded. Review the project evidence on your workbench.':!supported(s.id)?'This result is recorded. Review earlier checkpoints before treating the dependent capability as ready.':'Checkpoint recorded. Your next prepared session is ready on the workbench.';
      const destination=link(coreFinished()?'Review your core finish':'Continue to '+nextSession.title,coreFinished()?'#workbench':sessionLink(nextSession),'wb-button wb-next-session');const old=form.querySelector('.wb-next-session');if(old)old.replaceWith(destination);else form.append(destination);
    }));
    if(r.status==='complete')actions.append(button('Reopen this checkpoint',()=>{state.records[s.id]={...record(s),status:'working',updatedAt:new Date().toISOString()};activate(s);renderSession(s);},'wb-button wb-secondary'));
    form.append(evidenceLabel,evidence,nextLabel,next,claim,actions,status,storageNote());return form;
  }
  function evidenceTimeline() {
    const entries=[...state.history].reverse().slice(0,12);const box=node('section','wb-timeline');box.append(node('h2','','Your evidence trail'),paragraph('Saved evidence shows what you tried. “Checkpoint met” means you explicitly recorded its finish condition; a working entry keeps that check open.'));
    if(!entries.length){box.append(paragraph('The first result you save will appear here.'));return box;}
    const list=node('ol');for(const entry of entries){const s=lookup.get(entry.session);const item=node('li');item.append(node('span','wb-tag',entry.status==='complete'?'Checkpoint met':entry.evidence.trim()?'Investigation saved':'Pause note saved'),link(s.title,sessionLink(s)),paragraph(entry.evidence));if(entry.nextAction)item.append(paragraph('Next: '+entry.nextAction,'wb-small'));list.append(item);}box.append(list);return box;
  }
  function milestones() {
    const box=node('section','wb-milestones wb-journey-zone');box.setAttribute('aria-label','Your capability journey');box.append(node('h2','','What your rover is gaining'),paragraph('Small recorded checkpoints build these capabilities. Reopening an earlier step keeps dependent results in your evidence trail while those capabilities await review. Your chapter checks remain available in the textbook.'));
    const grid=node('div','wb-milestone-grid');
    for(const [index,m] of (plan.milestones || []).entries()){
      const group=core.filter(s=>s.milestone===m.id);if(!group.length)continue;
      const count=group.filter(s=>supported(s.id)).length;
      const row=node('article');
      const number=node('span','wb-milestone-index',String(index+1).padStart(2,'0'));number.setAttribute('aria-hidden','true');
      const copy=node('div','wb-milestone-copy');copy.append(node('h3','',m.title),paragraph(m.why));
      const progress=node('div','wb-milestone-progress');
      const meter=node('div','wb-capability-meter');meter.setAttribute('aria-hidden','true');
      const fill=node('span');fill.style.width=(100*count/group.length)+'%';meter.append(fill);
      progress.append(paragraph(count+' of '+group.length+' checkpoints recorded','wb-small'),meter);
      row.append(number,copy,progress);
      const list=node('ul');for(const s of group){const item=node('li');item.append(node('span','wb-state',supported(s.id)?'✓ ':complete(s.id)?'Review earlier check · ':ready(s)?'Ready · ':'Later · '),link(s.title,sessionLink(s)));list.append(item);}
      row.append(details('See these small steps',[list]));grid.append(row);
    }
    box.append(grid);return box;
  }
  function ideasList() {
    const box=node('section','wb-saved-ideas');box.append(node('h2','','Ideas kept for later'));const entries=state.ideas.filter(x=>!x.archived);
    if(state.ideaDraft.text){const draft=node('article','wb-idea');draft.append(node('span','wb-tag','Unfinished idea draft'),paragraph(state.ideaDraft.text),link('Continue this draft',sessionLink(lookup.get(state.ideaDraft.session))));box.append(draft);}
    if(!entries.length&&!state.ideaDraft.text)box.append(paragraph('Save an idea from any focused session. Its return point comes with it.'));
    for(const idea of entries){const row=node('article','wb-idea');row.append(paragraph(idea.text),link('Return to '+lookup.get(idea.session).title,sessionLink(lookup.get(idea.session))));row.append(button('Archive idea',()=>{idea.archived=true;save();renderHome();},'wb-text-button'));box.append(row);}
    const archived=state.ideas.filter(x=>x.archived);if(archived.length){const list=node('div');for(const idea of archived){const row=node('div','wb-idea');row.append(paragraph(idea.text),button('Restore idea',()=>{idea.archived=false;save();renderHome();},'wb-text-button'));list.append(row);}box.append(details('Archived ideas ('+archived.length+')',[list]));}return box;
  }
  function renderHome() {
    const s=current();state.active=s.id;reset('Your workbench');host.dataset.view='home';heading('The Robotics Fieldbook · Build + train','Your workbench.','Build a room-survey rover. Keep your next useful action here.');
    const sketch=node('div','wb-room-sketch');sketch.setAttribute('aria-hidden','true');
    sketch.innerHTML='<svg viewBox="0 0 260 150" fill="none" xmlns="http://www.w3.org/2000/svg" focusable="false"><path d="M28 81C17 49 51 32 92 39C119 14 175 18 194 44C233 39 249 79 226 106C201 135 158 131 126 138C81 149 39 127 28 81Z" fill="var(--illustration-lilac,#cbb8f6)" opacity=".38"/><circle cx="177" cy="45" r="31" fill="var(--illustration-gold,#ffd565)"/><g stroke="var(--illustration-ink,#33223d)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M36 62V44H64M224 98V117H205" opacity=".45"/><path d="m44 94 17 8m12-16 17 8m-29 8 12-16m-5 31 17-9" opacity=".18"/><path d="M46 112C58 126 74 131 91 122L116 109" stroke-dasharray="3 6" opacity=".7"/><circle cx="46" cy="112" r="3" fill="var(--illustration-orange,#ff7549)"/><ellipse cx="160" cy="119" rx="57" ry="10" fill="var(--illustration-ink,#33223d)" opacity=".08" stroke="none"/><path d="M115 90C105 87 99 95 99 104C99 114 105 121 112 120L122 116V94Z" fill="var(--illustration-ink,#33223d)"/><ellipse cx="117" cy="105" rx="10" ry="15" fill="var(--illustration-ink,#33223d)"/><ellipse cx="118" cy="105" rx="4" ry="7" fill="var(--illustration-lilac,#cbb8f6)" stroke="none"/><path d="m113 75 48-17 49 25-53 23-44-18Z" fill="var(--illustration-orange,#ff7549)"/><path d="m113 75 44 20 53-22v16l-53 24-44-20Z" fill="var(--illustration-orange,#ff7549)"/><path d="m113 75 48-18 49 16-53 22Z" fill="var(--illustration-gold,#ffd565)"/><path d="M157 95v18m-34-27 21 9"/><path d="M185 94C175 91 168 98 168 109C168 119 175 126 182 123L193 118V99Z" fill="var(--illustration-ink,#33223d)"/><ellipse cx="189" cy="108" rx="10" ry="15" fill="var(--illustration-ink,#33223d)"/><ellipse cx="190" cy="108" rx="4" ry="7" fill="var(--illustration-gold,#ffd565)" stroke="none"/><ellipse cx="157" cy="78" rx="13" ry="6" fill="var(--illustration-lilac,#cbb8f6)"/><path d="M153 76V51h8v25" fill="var(--illustration-orange,#ff7549)"/><path d="m139 32 35-7 18 9v25l-36 9-17-10Z" fill="var(--illustration-orange,#ff7549)"/><path d="m139 32 17 10 36-8M156 42v26"/><path d="m156 42 36-8v25l-36 9Z" fill="var(--illustration-lilac,#cbb8f6)"/><ellipse cx="175" cy="50" rx="8" ry="10" fill="var(--illustration-ink,#33223d)"/><ellipse cx="174" cy="48" rx="3" ry="4" fill="#fff8ee" stroke="none"/><path d="m207 35 7-6m-3 16 10-1M95 37l-3-7m-6 13-7-2" stroke="var(--illustration-orange,#ff7549)" stroke-width="3"/><circle cx="218" cy="63" r="2.5" fill="var(--illustration-ink,#33223d)" stroke="none"/></g></svg>';
    host.querySelector('.wb-heading').append(sketch);
    const active=node('section','wb-active-zone');active.setAttribute('aria-label','Current work');
    const finished=coreFinished();const card=node('section','wb-now');card.append(node('span','eyebrow',finished?'Core path recorded':'Your next working session'),node('h2','',finished?'You have a project to demonstrate.':s.title),paragraph(finished?'Review the fitted assembly, motion and stop evidence, measured map, navigation run, model evaluation and real observations together. Your records remain available below.':s.why,'wb-purpose'));
    if(!finished){const next=paragraph('','wb-home-next');next.append(node('strong','','Next action: '),document.createTextNode(record(s).nextAction||s.actions[0]));card.append(next);}
    const action=node('div','wb-actions');const primary=link(finished?'Review the core finish':'Continue this session',finished?'#core-finish':sessionLink(s),'wb-button');const direction=node('span','wb-continue-glyph');direction.setAttribute('aria-hidden','true');primary.append(direction);action.append(primary,link(finished?'Choose an optional next experiment':'See the project vision',finished?'#ch-horizons':'#ch-start','wb-text-link'));card.append(action,returnContext(s,false));active.append(card);
    if(!finished){
      const facts=node('div','wb-session-facts');facts.append(labelledList('Have nearby',s.needs),labelledList('Finish this step when',[s.finish]));
      active.append(facts,paragraph(s.minutes+' · Active-work estimate; stop at a useful observation.','wb-small wb-session-estimate'),recovery(s));
    }
    const oldNotes=window.Fieldbook?.getChapterNotes?.() || {};const original=document.getElementById(s.id);const chapter=original?.closest('.chapter');if(chapter&&oldNotes[chapter.id])active.append(details('Earlier notes for this chapter',[paragraph(oldNotes[chapter.id],'wb-preserve-lines')]));
    const notebook=node('section','wb-notebook-zone');notebook.setAttribute('aria-label','Project notebook');notebook.append(evidenceTimeline(),ideasList());
    notebook.append(details('Notebook, map and reference shelf',[paragraph('Your notes and ideas stay in this browser. Export a copy before changing browsers or clearing site data.'),link('Export or import notes','#ch-practice'),paragraph(''),link('Dependency map','#learning-roadmap'),paragraph(''),link('Books, videos and references','#ch-resources')],'wb-reference-shelf'));
    host.append(active,milestones(),notebook,storageNote());save();
  }
  function renderSession(s) {
    activate(s);reset(s.title);host.dataset.view='session';host.append(link('← Your workbench','#workbench','wb-back'));
    heading((s.optional?'Optional experiment':'Working session')+' · '+s.minutes,s.title,s.why);
    const card=node('section','wb-session-brief');card.append(labelledList('Have nearby',s.needs));
    const unfinished=(s.requires||[]).filter(x=>!supported(x));if(unfinished.length){const prereq=node('div','wb-prerequisites');prereq.append(node('h3','','Check the earlier steps'),paragraph('These checkpoints have not been recorded here. Review their results before using this session; importing old chapter notes does not certify these new checks.'));const list=node('ul');for(const key of unfinished){const item=node('li');item.append(link(lookup.get(key)?.title||key,sessionLink(lookup.get(key)||{id:key})));list.append(item);}prereq.append(list);card.append(prereq);}
    card.append(node('h2','','Today’s moves'),paragraph('This is the plan for the session. Follow the detailed setup and bench checks below before carrying it out; the summary is not enough to energize hardware.','wb-small'));const actions=node('ol','wb-action-list');for(const action of s.actions)actions.append(node('li','',action));card.append(actions);
    const finish=node('div','wb-finish');finish.append(node('h3','','A useful stopping point'),paragraph(s.finish));card.append(finish);
    if(s.uncertainty)card.append(paragraph((s.kind==='integration'?'Integration work: ':'What this checks: ')+s.uncertainty,'wb-uncertainty-text'));
    host.append(card,recovery(s));
    const related=node('div','wb-related');related.append(link('View the full chapter','#'+document.getElementById(s.id).closest('.chapter').id,'wb-text-link'));
    if(s.reference?.href)related.append(link(s.reference.label,s.reference.href,'wb-text-link'));
    related.append(button('Leave a restart note',()=>{const field=document.getElementById('wb-next-action');field?.scrollIntoView({block:'center',behavior:'instant'});field?.focus({preventScroll:true});},'wb-text-button'));
    related.append(button('Park an idea',()=>{const field=document.getElementById('wb-new-idea');const panel=field?.closest('details');if(panel)panel.open=true;field?.scrollIntoView({block:'center',behavior:'instant'});field?.focus({preventScroll:true});},'wb-text-button'));
    host.append(related);
    host.append(originalInstructions(s),evidenceForm(s),ideaCapture(s));
    const note=window.Fieldbook?.getChapterNotes?.()?.[document.getElementById(s.id).closest('.chapter').id];if(note)host.append(details('Earlier chapter notes',[paragraph(note,'wb-preserve-lines')]));
  }
  function route() {
    const hash=location.hash;
    if(hash && hash!=='#workbench' && !hash.startsWith('#session/'))return false;
    clearTimeout(timer);save();
    let sessionId=null;if(hash.startsWith('#session/'))try{sessionId=decodeURIComponent(hash.slice(9));}catch(_){}
    if(sessionId&&lookup.has(sessionId))renderSession(lookup.get(sessionId));else renderHome();
    window.scrollTo({top:0,behavior:'instant'});const title=host.querySelector('h1');if(title){title.tabIndex=-1;title.focus({preventScroll:true});}return true;
  }
  function exportData() { save(); return JSON.parse(JSON.stringify(state)); }
  function joinText(old, incoming) { if(!incoming || old===incoming || old.includes(incoming))return old;return old?old+'\n\n— Imported note —\n'+incoming:incoming; }
  function importData(data) {
    const incoming=validate(data);
    const hasLocalWork=Object.keys(state.records).length>0 || state.history.length>0 || state.ideas.length>0 || !!state.ideaDraft.text.trim();
    const merged=JSON.parse(JSON.stringify(state));
    for(const [key, entry] of Object.entries(incoming.records)){
      const old=merged.records[key];if(!old){merged.records[key]=entry;continue;}
      const same=old.evidence===entry.evidence&&old.nextAction===entry.nextAction;
      const evidence=joinText(old.evidence,entry.evidence), nextAction=joinText(old.nextAction,entry.nextAction);
      if(evidence.length>20000||nextAction.length>3000)throw new Error('Combined notes exceed the field limit. Existing work is unchanged; keep both exports.');
      merged.records[key]={evidence,nextAction,status:old.status==='complete'||same&&entry.status==='complete'?'complete':'working',updatedAt:old.updatedAt>entry.updatedAt?old.updatedAt:entry.updatedAt};
    }
    for(const entry of incoming.history){const old=merged.history.find(x=>x.id===entry.id);const importedId=entry.id.slice(0,140)+'-imported';if(!old)merged.history.push(entry);else if(JSON.stringify(old)!==JSON.stringify(entry)&&!merged.history.some(x=>x.id===importedId))merged.history.push({...entry,id:importedId});}
    merged.history=merged.history.sort((a,b)=>a.at.localeCompare(b.at)).slice(-500);
    for(const idea of incoming.ideas){const old=merged.ideas.find(x=>x.id===idea.id);const importedId=idea.id.slice(0,140)+'-imported';if(!old)merged.ideas.push(idea);else if(old.text!==idea.text&&!merged.ideas.some(x=>x.id===importedId))merged.ideas.push({...idea,id:importedId});}
    merged.ideas=merged.ideas.slice(-300);
    if(incoming.ideaDraft.text){
      if(!merged.ideaDraft.text)merged.ideaDraft=incoming.ideaDraft;
      else if(merged.ideaDraft.text!==incoming.ideaDraft.text||merged.ideaDraft.session!==incoming.ideaDraft.session){
        const importedDraft={id:'imported-draft-'+incoming.ideaDraft.session,session:incoming.ideaDraft.session,text:incoming.ideaDraft.text,at:new Date().toISOString(),archived:false};
        if(!merged.ideas.some(x=>x.session===importedDraft.session&&x.text===importedDraft.text))merged.ideas.push(importedDraft);
      }
    }
    if(!hasLocalWork&&incoming.active)merged.active=incoming.active;
    state=validate(merged);
    if(!hasLocalWork&&incoming.active)window.Fieldbook?.setPinnedSession?.(incoming.active);
    save();if(!host.hidden)route();
    return {accepted:true,records:Object.keys(incoming.records).length};
  }
  window.FieldbookWorkbench={route,exportData,importData};
  window.addEventListener('hashchange',route);
  document.addEventListener('click',e=>{const a=e.target.closest('a');if(a&&a.getAttribute('href')===location.hash&&(location.hash==='#workbench'||location.hash.startsWith('#session/'))){e.preventDefault();route();}});
  window.addEventListener('fieldbook:chapter',()=>{host.hidden=true;document.body.classList.remove('workbench-active');save();});
  window.addEventListener('fieldbook:pin',()=>{const pinned=window.Fieldbook?.getPinnedSession?.();if(lookup.has(pinned)&&state.active!==pinned){state.active=pinned;save();if(!host.hidden&&location.hash==='#workbench')renderHome();}});
  route();
})();
