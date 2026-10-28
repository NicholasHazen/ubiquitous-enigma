(() => {
  'use strict';
  const chapters = [...document.querySelectorAll('.chapter')];
  const KEY = 'robotics-fieldbook-home-survey-v1';
  let state = {completed: [], notes: {}, last: 'ch-start', theme: 'light', size: 0};
  let storageOK = true;
  try { const saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if(saved && typeof saved === 'object') state = {...state, ...saved}; } catch(e) { storageOK = false; }
  if(!Array.isArray(state.completed)) state.completed = [];
  if(!state.notes || typeof state.notes !== 'object' || Array.isArray(state.notes)) state.notes = {};
  const reopenedMemory = state.checkpointRevision !== 2 && state.completed.includes('ch-memory');
  if(state.checkpointRevision !== 2) state.completed = state.completed.filter(id => id !== 'ch-memory');
  state.checkpointRevision = 2;
  const save = () => { try {localStorage.setItem(KEY, JSON.stringify(state));} catch(e) {storageOK = false;} };
  const safeNote = id => typeof state.notes[id] === 'string' ? state.notes[id] : '';
  const mergeNotes=(old,incoming)=>{const separator='\n\n— Imported note —\n';return [...new Set([...old.split(separator),...incoming.split(separator)].filter(Boolean))].join(separator);};
  const byId = id => chapters.find(c => c.id === id);
  // Keep the last work session when the reader returns to the cover.
  const resumeEligible = c => c && c.id !== 'ch-start' && c.dataset.number !== 'R' && c.dataset.progress !== 'utility';
  let resumeId = resumeEligible(byId(state.resume))
    ? state.resume
    : (resumeEligible(byId(state.last)) ? state.last : null);
  const nav = document.getElementById('chapter-nav');
  const goalChapters = chapters.filter(c => c.dataset.number !== 'R' && !c.dataset.progress);
  let group = '';
  chapters.forEach((c, index) => {
    if(c.dataset.part !== group) { group = c.dataset.part; const label = document.createElement('div'); label.className='nav-group'; label.textContent=group; nav.append(label); }
    const a = document.createElement('a'); a.href='#'+c.id; a.className='chapter-link'; a.dataset.chapter=c.id;
    const number = document.createElement('span');number.className='number';number.textContent=c.dataset.number;
    const title = document.createElement('span');title.textContent=(c.dataset.progress==='optional'?'Optional · ':'')+c.dataset.title;
    const done = document.createElement('span');done.className='done';done.setAttribute('aria-hidden','true');
    a.append(number,title,done);nav.append(a);
    c.querySelectorAll(':scope > h3').forEach(heading=>{if(/^(?:Session\s+|Bench\s+|\d{2}[A-Z]\s*·|\d+\.)/.test(heading.textContent.trim()))heading.classList.add('bench-step-heading');});
    const words=c.textContent.trim().split(/\s+/).length;
    const meta=document.createElement('div');meta.className='reading-meta';meta.innerHTML=c.dataset.number==='R'?'<span>'+c.querySelectorAll('.resource-card').length+' curated resources</span><span>Pick one. Try one thing. Return to your build.</span>':'<span>'+Math.max(2,Math.ceil(words/200))+' min read</span><span>Follow the bench sessions below</span>';
    c.querySelector('.chapter-heading')?.append(meta);
    if(c.dataset.number==='R') return;
    const footer=document.createElement('div');footer.className='chapter-footer';
    const complete=document.createElement('button');complete.type='button';complete.className='finish-button';complete.dataset.complete=c.id;complete.setAttribute('aria-pressed','false');
    complete.addEventListener('click',()=>{state.completed=state.completed.includes(c.id)?state.completed.filter(id=>id!==c.id):[...state.completed,c.id];save();updateProgress();});
    const finishHelp=document.createElement('p');finishHelp.className='finish-help';finishHelp.textContent='Use this after you can show the checkpoint above. Your next step is below.';
    if(c.dataset.progress !== 'utility') footer.append(complete,finishHelp);
    if(c.dataset.progress === 'optional') finishHelp.textContent='Optional research checkpoint. This does not change your core-project progress.';
    const notebook=document.createElement('details');notebook.className='notebook';
    const summary=document.createElement('summary');summary.textContent='Park the project here · leave yourself a restart note';
    const label=document.createElement('label');label.htmlFor='note-'+c.id;label.className='sr-only';label.textContent='Workshop notes for '+c.dataset.title;
    const textarea=document.createElement('textarea');textarea.id='note-'+c.id;textarea.value=safeNote(c.id);textarea.placeholder='Last thing that worked:\nWhat I saw:\nNext time: open this chapter and start at step …';
    const status=document.createElement('span');status.className='note-status';status.setAttribute('role','status');status.textContent=storageOK?'Stored in this browser. Export a backup from chapter 11.':'Browser storage is unavailable. Export notes before closing.';
    let timer;
    textarea.addEventListener('input',()=>{state.notes[c.id]=textarea.value;clearTimeout(timer);timer=setTimeout(()=>{save();status.textContent=storageOK?'Saved in this browser.':'Storage unavailable. Export notes before closing.';},350);});
    notebook.append(summary,label,textarea,status);footer.append(notebook);
    const pagination=document.createElement('div');pagination.className='chapter-pagination';
    const addPageLink=(dest, direction)=>{const link=document.createElement('a');link.href='#'+dest.id;const small=document.createElement('small');small.textContent=direction;const text=document.createElement('span');text.textContent=dest.dataset.title;link.append(small,text);return link;};
    if(index>0)pagination.append(addPageLink(chapters[index-1],'← Previous'));else pagination.append(document.createElement('span'));
    if(index<chapters.length-1){const target=document.getElementById(c.dataset.next)||chapters[index+1];const owner=target.closest('.chapter');const next={id:target.id,dataset:{title:c.dataset.nextLabel||owner.dataset.title}};const link=addPageLink(next,owner.dataset.number==='R'?'Keep nearby →':owner.dataset.progress==='optional'?'Optional research →':owner.dataset.progress==='utility'?'Project notebook →':'Do this next →');link.classList.add('next-chapter');link.setAttribute('aria-label','After '+c.dataset.title+': '+next.dataset.title);pagination.append(link);}
    footer.append(pagination);c.append(footer);
  });
  function updateProgress(){
    const n=goalChapters.filter(c=>state.completed.includes(c.id)).length;
    document.getElementById('progress-text').textContent=n+' / '+goalChapters.length;
    const p=document.getElementById('book-progress');p.max=goalChapters.length;p.value=n;p.setAttribute('aria-label',n+' of '+goalChapters.length+' core checkpoints complete');
    document.querySelectorAll('[data-complete]').forEach(b=>{const done=state.completed.includes(b.dataset.complete);b.setAttribute('aria-pressed',String(done));b.textContent=done?'✓ Bench check complete · undo':(byId(b.dataset.complete)?.dataset.completionLabel||'I passed this bench check');});
    document.querySelectorAll('.chapter-link').forEach(a=>{a.querySelector('.done').textContent=state.completed.includes(a.dataset.chapter)?'✓':'';});
  }
  const mobileQuery = window.matchMedia('(max-width:800px)');
  function setNav(open){document.body.classList.toggle('nav-open',open);document.getElementById('menu-button').setAttribute('aria-expanded',String(open));document.querySelector('.sidebar').inert=mobileQuery.matches&&!open;}
  mobileQuery.addEventListener('change',()=>setNav(false));
  document.getElementById('menu-button').addEventListener('click',()=>setNav(!document.body.classList.contains('nav-open')));
  document.getElementById('mobile-overlay').addEventListener('click',()=>setNav(false));
  function selectChapter(id, scroll=true){
    const chapter=byId(id)||chapters[0];
    const browser=document.getElementById('chapter-browser');if(browser)browser.open=true;
    chapters.forEach(c=>c.hidden=c!==chapter);
    document.querySelectorAll('.chapter-link').forEach(a=>{if(a.dataset.chapter===chapter.id)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    document.getElementById('current-part').textContent=chapter.dataset.part;
    document.title=chapter.dataset.title+' · The Robotics Fieldbook';
    state.last=chapter.id;if(resumeEligible(chapter)){if(resumeId!==chapter.id)state.resumeTarget=null;resumeId=chapter.id;state.resume=chapter.id;}updateResume();save();setNav(false);
    if(scroll) { window.scrollTo({top:0,behavior:'instant'});const heading=chapter.querySelector('h1,h2');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});} }
    window.dispatchEvent(new CustomEvent('fieldbook:chapter',{detail:chapter.id}));
  }
  function hashTarget(){
    try { return document.getElementById(decodeURIComponent(location.hash.slice(1))); }
    catch(e) { return null; }
  }
  function navigateHash(scroll=true){
    if(!location.hash || location.hash==='#workbench' || location.hash.startsWith('#session/')) return;
    const target=hashTarget();
    const chapter=target?.closest('.chapter');
    if(!chapter){
      if(target){
        const current=chapters.find(c=>!c.hidden)||chapters[0];
        selectChapter(current.id,false);target.focus();target.scrollIntoView({behavior:'instant'});
      } else selectChapter('ch-start',scroll);
      return;
    }
    if(target===chapter){selectChapter(chapter.id,scroll);return;}
    // A roadmap can land inside a collapsed workshop on another chapter.
    selectChapter(chapter.id,false);
    if(resumeEligible(chapter)){state.resumeTarget=target.id;updateResume();save();}
    if(!target.hasAttribute('tabindex'))target.tabIndex=-1;
    for(let parent=target;parent&&parent!==chapter;parent=parent.parentElement){
      if(parent.tagName==='DETAILS')parent.open=true;
    }
    requestAnimationFrame(()=>{
      target.scrollIntoView({block:'start',behavior:'instant'});
      const focus=target.matches('h1,h2,h3,h4')?target:(target.querySelector('h1,h2,h3,h4,summary')||target);
      if(!focus.hasAttribute('tabindex'))focus.tabIndex=-1;
      focus.focus({preventScroll:true});
    });
  }
  window.addEventListener('hashchange',()=>navigateHash());
  document.querySelector('.skip-link')?.addEventListener('click',e=>{e.preventDefault();const main=document.getElementById('main');main.focus();main.scrollIntoView({behavior:'instant'});});
  document.addEventListener('click',e=>{
    const a=e.target.closest('a[href^="#"]');if(!a)return;
    if(a.getAttribute('href')===location.hash){e.preventDefault();navigateHash();}
  });
  const resume=document.getElementById('resume-button');
  const sidebarResume=document.getElementById('sidebar-resume');
  const resumeContext=document.createElement('p');resumeContext.id='resume-context';resumeContext.className='resume-context';if(resume)resume.after(resumeContext);
  const pinTarget = id => typeof id === 'string' ? document.querySelector('.bench-session[id="'+CSS.escape(id)+'"]') : null;
  const sessionName = target => target?.matches('.chapter') ? target.dataset.title : target?.querySelector('h3,h2,h4')?.textContent || target?.textContent?.trim().slice(0,100);
  document.querySelectorAll('.bench-session[id]').forEach(session=>{
    const button=document.createElement('button');button.type='button';button.className='session-pin';button.dataset.pin=session.id;
    const status=document.createElement('span');status.className='pin-status';status.setAttribute('role','status');
    button.addEventListener('click',()=>{state.pinnedNext=state.pinnedNext===session.id?null:session.id;save();updateResume();window.dispatchEvent(new Event('fieldbook:pin'));status.textContent=state.pinnedNext===session.id?(storageOK?'Saved in this browser.':'Browser storage is unavailable; keep this session link.'):'Saved session cleared.';});
    const row=document.createElement('div');row.className='session-pin-row';row.append(button,status);const meta=session.querySelector('.session-meta');if(meta)meta.after(row);else session.prepend(row);
  });
  if(reopenedMemory){const notice=document.createElement('p');notice.className='edition-banner';notice.textContent='Chapter 09 now requires five real linked observations to finish the core project. Its completion check has been reopened; your notes are preserved.';document.querySelector('#ch-start .chapter-heading').after(notice);}
  function updateResume(){
    if(!resume)return;
    const previous=byId(resumeId);
    const pinned=pinTarget(state.pinnedNext);
    const remembered=typeof state.resumeTarget==='string'?document.getElementById(state.resumeTarget):null;
    const target=pinned||(remembered?.closest('.chapter')===previous?remembered:previous);
    if(target){const title=sessionName(target);resume.href='#'+target.id;resume.textContent=pinned?'Continue your saved session →':'Pick up where you left off →';resume.setAttribute('aria-label','Continue: '+title);resume.title=title;resumeContext.textContent=(pinned?'Saved next session · ':'Last visited · ')+title;}
    else {resume.href='#ch-first-hour';resume.textContent='Start the first hour →';resume.removeAttribute('title');resume.removeAttribute('aria-label');resumeContext.textContent='One room, one object, one measured interface.';}
    resume.href='#workbench';resume.textContent='Open your workbench →';resume.setAttribute('aria-label','Open your workbench and current session');
    if(sidebarResume){sidebarResume.href='#workbench';sidebarResume.textContent='Return to your workbench →';sidebarResume.title='Your next action, saved evidence and session';}
    document.querySelectorAll('[data-pin]').forEach(button=>{const active=button.dataset.pin===state.pinnedNext;button.setAttribute('aria-pressed',String(active));button.textContent=active?'Saved as next session · clear':'Resume here next time';button.setAttribute('aria-label',(active?'Clear saved next session: ':'Resume here next time: ')+sessionName(pinTarget(button.dataset.pin)));});
  }
  updateResume();
  window.Fieldbook={
    getPinnedSession:()=>pinTarget(state.pinnedNext)?.id||null,
    getLegacySession:()=>pinTarget(state.pinnedNext)?.id||pinTarget(state.resumeTarget)?.id||null,
    getChapterNotes:()=>({...state.notes}),
    setPinnedSession:id=>{if(!pinTarget(id))return;state.pinnedNext=id;save();updateResume();window.dispatchEvent(new Event('fieldbook:pin'));}
  };
  function theme(){const dark=state.theme==='dark';document.documentElement.dataset.theme=dark?'dark':'light';document.getElementById('theme-button').textContent=dark?'Light':'Dark';document.getElementById('theme-button').setAttribute('aria-label',dark?'Use light theme':'Use dark theme');}
  document.getElementById('theme-button').addEventListener('click',()=>{state.theme=state.theme==='dark'?'light':'dark';theme();save();});
  function fontSize(){const size=[18,20,22][state.size]||18;document.documentElement.style.setProperty('--reading',size+'px');document.getElementById('size-button').setAttribute('aria-label','Reading text '+size+' pixels. Increase text size');}
  document.getElementById('size-button').addEventListener('click',()=>{state.size=((Number(state.size)||0)+1)%3;fontSize();save();});
  const dialog=document.getElementById('search-dialog');const input=document.getElementById('search-input');const results=document.getElementById('search-results');
  const searchIndex=chapters.map(c=>({id:c.id,title:c.dataset.title,number:c.dataset.number,text:c.textContent.replace(/\s+/g,' ').trim()}));
  function renderSearch(){
    const q=input.value.trim().toLowerCase();results.replaceChildren();
    if(!q){const li=document.createElement('li');li.className='search-help';li.textContent='Try fit, encoder, dataset, SLAM, navigation, or memory.';results.append(li);document.getElementById('search-count').textContent='';return;}
    const terms=q.split(/\s+/);const found=searchIndex.filter(c=>terms.every(term=>(c.title+' '+c.text).toLowerCase().includes(term)));
    document.getElementById('search-count').textContent=found.length+' chapter'+(found.length===1?'':'s')+' found';
    found.forEach(c=>{const li=document.createElement('li');const a=document.createElement('a');a.href='#'+c.id;const title=document.createElement('strong');title.textContent=c.number+' · '+c.title;const p=document.createElement('p');const match=c.text.toLowerCase().indexOf(terms[0]);const start=Math.max(0,match-65);p.textContent=(start?'…':'')+c.text.slice(start,start+200)+'…';a.append(title,p);a.addEventListener('click',()=>{dialog.close();if(location.hash==='#'+c.id)selectChapter(c.id);});li.append(a);results.append(li);});
    if(!found.length){const li=document.createElement('li');li.className='search-help';li.textContent='No matching chapter. Try a shorter term.';results.append(li);}
  }
  function openSearch(){renderSearch();dialog.showModal();input.focus();}
  document.getElementById('search-button').addEventListener('click',openSearch);document.getElementById('search-close').addEventListener('click',()=>dialog.close());input.addEventListener('input',renderSearch);
  document.addEventListener('keydown',e=>{const typing=e.target.closest('input,textarea,select,[contenteditable]');if(e.key==='/'&&!typing&&!dialog.open){e.preventDefault();openSearch();}if(e.key==='Escape'){if(dialog.open){e.preventDefault();dialog.close();}if(document.body.classList.contains('nav-open')){setNav(false);document.getElementById('menu-button').focus();}}});
  let printDetails=[];
  window.addEventListener('beforeprint',()=>{printDetails=[...document.querySelectorAll('details')].map(el=>[el,el.open]);printDetails.forEach(([el])=>el.open=true);});
  window.addEventListener('afterprint',()=>printDetails.forEach(([el,open])=>el.open=open));
  document.getElementById('print-button').addEventListener('click',()=>window.print());
  const workbench=document.querySelector('[data-workbench="notes"]');
  if(workbench){
    const box=document.createElement('div');box.className='exercise';box.innerHTML='<h3>Your workshop notebook</h3><p>Chapter notes, session evidence, exact next actions and parked ideas stay in this browser. Export a copy to keep a backup or move them to another device. The textbook does not send your notes to a server.</p>';
    const actions=document.createElement('div');actions.className='note-actions';const status=document.createElement('p');status.className='export-status';status.setAttribute('role','status');
    const exp=document.createElement('button');exp.className='secondary-button';exp.textContent='Export notes & progress';exp.type='button';
    exp.addEventListener('click',()=>{const data={format:'robotics-fieldbook-notes',version:2,edition:'home-survey',checkpointRevision:2,nextSession:pinTarget(state.pinnedNext)?.id||null,workbench:window.FieldbookWorkbench?.exportData()||null,exportedAt:new Date().toISOString(),completed:state.completed,notes:state.notes};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='robotics-workshop-notes.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='Export created. Keep this file with your project notes.';});
    const imp=document.createElement('button');imp.className='secondary-button';imp.textContent='Import saved notes';imp.type='button';
    const file=document.createElement('input');file.type='file';file.accept='.json,application/json';file.hidden=true;file.setAttribute('aria-label','Choose saved workshop notes');imp.addEventListener('click',()=>file.click());
    file.addEventListener('change',async()=>{try{const f=file.files[0];if(!f)return;if(f.size>32*1024*1024)throw new Error('This file exceeds the 32 MiB notes-import limit.');const data=JSON.parse(await f.text());if(data.format!=='robotics-fieldbook-notes'||data.version!==2||data.edition!=='home-survey'||!Array.isArray(data.completed)||!data.notes||typeof data.notes!=='object'||Array.isArray(data.notes))throw new Error('Choose a Home Survey edition notes export. Earlier notes remain in the archived edition.');if(data.workbench!=null){if(!window.FieldbookWorkbench)throw new Error('The workbench is not available to import its records.');window.FieldbookWorkbench.importData(data.workbench);}const ids=new Set(chapters.map(c=>c.id));state.completed=[...new Set([...state.completed,...data.completed.filter(id=>ids.has(id)&&(id!=='ch-memory'||data.checkpointRevision===2))])];for(const [id,note]of Object.entries(data.notes)){if(ids.has(id)&&typeof note==='string'&&note.length<100000){const old=safeNote(id);state.notes[id]=mergeNotes(old,note);}}if(!pinTarget(state.pinnedNext)&&pinTarget(data.nextSession)){state.pinnedNext=data.nextSession;window.dispatchEvent(new Event('fieldbook:pin'));}save();updateResume();document.querySelectorAll('.notebook textarea').forEach(t=>t.value=safeNote(t.id.slice(5)));updateProgress();status.textContent=(storageOK?'Imported.':'Imported into this page; browser storage is unavailable. Export before closing.')+' Existing notes were preserved; different imported notes were appended.'+(data.completed.includes('ch-memory')&&data.checkpointRevision!==2?' Chapter 09 needs its updated real-observation check.':'');}catch(e){status.textContent='Could not import: '+e.message;}finally{file.value='';}});
    actions.append(exp,imp,file);box.append(actions,status);workbench.append(box);
  }
  document.querySelectorAll('table').forEach(table=>{if(table.parentElement.classList.contains('table-wrap'))return;const wrap=document.createElement('div');wrap.className='table-wrap';wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Scrollable table');table.before(wrap);wrap.append(table);});
  updateProgress();theme();fontSize();document.documentElement.classList.add('js');navigateHash(false);
})();
