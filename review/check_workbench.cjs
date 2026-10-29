'use strict';
// Behavioral checks for the session-first interface. Real hardware and human
// re-entry time remain outside this browser test's claims.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
const artifacts=path.join(root,'test-results');fs.mkdirSync(artifacts,{recursive:true});
const url=process.env.FIELDBOOK_TEST_URL || pathToFileURL(path.join(root,'dist/index.html')).href;
const checks=[],errors=[];
const KEY='robotics-fieldbook-workbench-v1';
const LEGACY='robotics-fieldbook-home-survey-v1';
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
const normalize=s=>s.replace(/\s+/g,' ').trim();
async function go(page,hash='workbench'){
 await page.goto(url+(hash?'#'+hash:''));
 await page.waitForFunction(()=>!!window.FieldbookWorkbench);
 if(!hash||hash==='workbench'||hash.startsWith('session/')){
  await page.locator('#workbench-view').waitFor({state:'visible'});
  let sessionId=null;if(hash.startsWith('session/'))try{sessionId=decodeURIComponent(hash.slice(8));}catch(_){}
  const exists=sessionId&&await page.locator('#session-plan').evaluate((e,id)=>JSON.parse(e.textContent).sessions.some(s=>s.id===id),sessionId);
  if(exists)await page.locator('#wb-source-'+sessionId+'-'+sessionId).waitFor({state:'visible'});
  else await page.locator('#workbench-view .wb-now').waitFor({state:'visible'});
 }else await page.waitForFunction(id=>!document.getElementById(id)?.closest('.chapter')?.hidden,hash);
}
async function snapshot(page){return page.evaluate(()=>window.FieldbookWorkbench.exportData());}
async function openPause(page){
 if(!await page.locator('#wb-next-action').isVisible())await page.getByRole('button',{name:'Pause this session',exact:true}).click();
}
async function exportNotes(page){
 await go(page,'ch-practice');
 const [d]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Export notes & progress',exact:true}).click()]);
 return JSON.parse(fs.readFileSync(await d.path(),'utf8'));
}
async function importNotes(page,data){
 await go(page,'ch-practice');
 await page.locator('.export-status').evaluate(e=>e.textContent='');
 await page.locator('[data-workbench="notes"] input[type=file]').setInputFiles({name:'test-notes.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
 await page.waitForFunction(()=>/Imported\.|Could not import:/.test(document.querySelector('.export-status').textContent));
 return page.locator('.export-status').textContent();
}
async function domIntegrity(page){
 const problems=await page.evaluate(()=>{
  const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);
  const duplicate=ids.filter((id,i)=>ids.indexOf(id)!==i);
  const aria=[];
  for(const e of document.querySelectorAll('#workbench-view [aria-labelledby],#workbench-view [aria-describedby]')){
   for(const attr of ['aria-labelledby','aria-describedby']) for(const id of (e.getAttribute(attr)||'').split(/\s+/).filter(Boolean)) if(!document.getElementById(id))aria.push(id);
  }
  const svg=[];
  for(const e of document.querySelectorAll('#workbench-view svg *')) for(const a of e.attributes){
   for(const m of a.value.matchAll(/url\(#([^)]*)\)/g))if(!document.getElementById(m[1]))svg.push(m[1]);
  }
  return {duplicate,aria,svg};
 });
 assert.deepEqual(problems,{duplicate:[],aria:[],svg:[]});
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  const page=await context.newPage();page.setDefaultTimeout(10000);
  page.on('pageerror',e=>errors.push(e.message));
  await go(page,'');
  const plan=await page.locator('#session-plan').evaluate(e=>JSON.parse(e.textContent));
  const companions=await page.locator('#learning-companions').evaluate(e=>JSON.parse(e.textContent));
  await check('First arrival has one next session and no competing chapter view',async()=>{
   assert.equal(await page.locator('.chapter:not([hidden])').count(),0);
   assert.ok((await page.locator('#workbench-view').textContent()).includes(plan.sessions[0].title));
   assert.ok(await page.locator('#workbench-view a[href="#session/'+plan.sessions[0].id+'"]').count()>0);
   assert.ok((await page.locator('#workbench-view').textContent()).includes(plan.sessions[0].why));
  });
  await page.screenshot({animations:'disabled',path:path.join(artifacts,'workbench-home-desktop.png')});
  await check('Help and the project goal stay available on home, every chapter and focused sessions',async()=>{
   const chapters=await page.locator('.chapter').evaluateAll(es=>es.map(e=>e.id));
   assert.equal(chapters.length,13);
   const chapterBySession=await page.evaluate(ids=>Object.fromEntries(ids.map(id=>[id,document.getElementById(id).closest('.chapter').id])),plan.sessions.map(s=>s.id));
   for(const route of ['workbench',...chapters,'session/first-hour','session/drive-power']){
    await go(page,route);const beforeURL=page.url();const before=await snapshot(page);
    const active=plan.sessions.find(s=>s.id===before.active)||plan.sessions[0];
    const expected=route.startsWith('session/')?plan.sessions.find(s=>s.id===route.slice(8)):
     chapters.includes(route)?plan.sessions.find(s=>s.id===active.id&&chapterBySession[s.id]===route)||plan.sessions.find(s=>chapterBySession[s.id]===route)||active:active;
    assert.equal(await page.locator('#help-button').count(),1);assert.equal(await page.locator('#help-button').isVisible(),true,route+' hides help');
    assert.equal(await page.locator('#help-button').getAttribute('aria-haspopup'),'dialog');
    assert.equal(await page.locator('#project-compass').isVisible(),true,route+' hides the goal');
    assert.equal(await page.locator('#project-compass').evaluate(e=>!!e.closest('.chapter,#workbench-view')),false);
    assert.ok((await page.locator('#project-compass .project-capability').textContent()).includes(plan.milestones.find(m=>m.id===expected.milestone).title),route+' has stale capability');
    assert.equal(await page.locator('#workbench-view .wb-recovery').count(),0,'Recovery interrupts the main task');
    await page.locator('#help-button').click();
    assert.equal(await page.locator('dialog#fieldbook-help').evaluate(e=>e.open),true);
    assert.equal(await page.getByRole('dialog',{name:'Help for your build',exact:true}).count(),1,'Help needs an accessible name');
    assert.equal(await page.locator('#help-button').getAttribute('aria-expanded'),'true');
    assert.ok((await page.locator('#help-session-context').textContent()).includes(expected.title),route+' help has stale session context');
    assert.equal(await page.locator('#fieldbook-help .wb-recovery').count(),1);
    const material=companions.milestones[expected.milestone];
    const learningLinks=await page.locator('#fieldbook-help .companion-link').evaluateAll(es=>es.map(e=>({href:e.href,target:e.target,rel:e.rel})));
    assert.deepEqual(learningLinks.map(a=>a.href),material.items.map(item=>new URL(item.url).href),route+' loses companion choices');
    for(const a of learningLinks){assert.ok(a.href.startsWith('https://'));assert.equal(a.target,'_blank');assert.ok(a.rel.split(/\s+/).includes('noopener'));}
    assert.ok(normalize(await page.locator('#fieldbook-help').textContent()).includes(normalize(material.vision)));
    await page.keyboard.press('Shift+Tab');
    const focus=await page.evaluate(()=>({inside:document.getElementById('fieldbook-help').contains(document.activeElement),element:document.activeElement.tagName+'#'+document.activeElement.id}));
    // Native modal traversal may visit browser chrome, reported as BODY, but
    // must not reach a control in the underlying page.
    assert.ok(focus.inside||focus.element==='BODY#',route+' focus reached the underlying page: '+focus.element);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.getElementById('fieldbook-help').contains(document.activeElement)),true,route+' keyboard focus did not return to help');
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>!document.getElementById('fieldbook-help').open&&document.getElementById('help-button').getAttribute('aria-expanded')==='false');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'help-button');
    assert.equal(await page.locator('#help-button').getAttribute('aria-expanded'),'false');
    assert.equal(page.url(),beforeURL,'Help changed the return route');
    assert.deepEqual(await snapshot(page),before,'Help changed saved progress');
   }
  });
  await check('Every focused session gives one ordered task, explicit records and blank evidence',async()=>{
   for(const s of plan.sessions){
    await go(page,'session/'+s.id);
    const text=normalize(await page.locator('#workbench-view').textContent());
    for(const phrase of [s.title,s.finish,s.objective,companions.milestones[s.milestone].vision])assert.ok(text.includes(normalize(phrase)),s.id+' misses '+phrase);
    assert.ok(normalize(await page.locator('.wb-objective').textContent()).includes(normalize(s.objective)));
    assert.deepEqual(await page.locator('.wb-record-prompts li').allTextContents(),s.recordPrompts,s.id+' loses recording guidance');
    assert.equal(await page.locator('#wb-evidence').inputValue(),'','Examples must not be saved as learner evidence');
    assert.equal(await page.locator('#wb-evidence').getAttribute('placeholder'),s.recordExample);
    assert.equal(await page.locator('#wb-finish-checked').isChecked(),false);
    assert.equal(await page.locator('#wb-next-action').isVisible(),false,'An empty pause note interrupts '+s.id);
    assert.equal(await page.locator('.wb-action-list').count(),0,'A summary duplicates the detailed steps');
    assert.equal(await page.locator('.wb-instructions').count(),1);
    assert.equal(await page.locator('.wb-instructions').evaluate(e=>!!(e.compareDocumentPosition(document.querySelector('.wb-evidence-form'))&Node.DOCUMENT_POSITION_FOLLOWING)),true,s.id+' asks for results before instructions');
    assert.equal(normalize(await page.locator('#workbench-view h1').textContent()),normalize(s.title));
    // Heading, timing and objective already appear in the focus introduction.
    // Every authored instruction, diagram label, bench check and template must remain.
    const fullSource=await page.locator('#'+s.id).evaluate(e=>{const c=e.cloneNode(true);c.querySelector(':scope > h3,:scope > h2,:scope > h4')?.remove();c.querySelectorAll('.session-pin-row,.session-objective,.session-meta,.authored-session-objective').forEach(x=>x.remove());return c.textContent;});
    assert.equal(normalize(await page.locator('#wb-source-'+s.id+'-'+s.id).textContent()),normalize(fullSource),s.id+' drops source instructions');
    const links=await page.locator('.wb-learning .companion-link').evaluateAll(es=>es.map(e=>({href:e.href,target:e.target,rel:e.rel})));
    assert.ok(links.length>0,s.id+' has no learning companion');
    for(const a of links){assert.ok(a.href.startsWith('https://'));assert.equal(a.target,'_blank');assert.ok(a.rel.split(/\s+/).includes('noopener'));}
    assert.equal(await page.locator('.wb-evidence-form').evaluate(e=>!!(e.compareDocumentPosition(document.querySelector('.wb-learning'))&Node.DOCUMENT_POSITION_FOLLOWING)),true,'Optional inspiration interrupts the task');
    await domIntegrity(page);
   }
   assert.deepEqual((await snapshot(page)).records,{},'Reading guidance created learner evidence');
  });
  await check('Opening contextual help preserves an unfinished measurement, pause note and finish choice',async()=>{
   const c=await browser.newContext();const p=await c.newPage();await go(p,'session/first-hour');
   const evidence='Draft: A–B is 3.72 m; repeat the measurement before deciding.';
   const next='Return to the photographed A and B endpoints and measure again.';
   await p.locator('#wb-evidence').fill(evidence);await openPause(p);await p.locator('#wb-next-action').fill(next);await p.locator('#wb-finish-checked').check();
   const before=await snapshot(p);const beforeURL=p.url();await p.locator('#help-button').click();
   await p.locator('#fieldbook-help summary').filter({hasText:'I’m stuck'}).click();await p.keyboard.press('Escape');
   assert.equal(p.url(),beforeURL);assert.equal(await p.locator('#wb-evidence').inputValue(),evidence);assert.equal(await p.locator('#wb-next-action').inputValue(),next);
   assert.equal(await p.locator('#wb-finish-checked').isChecked(),true);assert.deepEqual(await snapshot(p),before);
   await p.reload();await p.locator('#wb-evidence').waitFor({state:'visible'});
   assert.equal(await p.locator('#wb-evidence').inputValue(),evidence);assert.equal(await p.locator('#wb-next-action').isVisible(),true);assert.equal(await p.locator('#wb-next-action').inputValue(),next);
   assert.equal((await snapshot(p)).records['first-hour'].status,'working');assert.deepEqual((await snapshot(p)).history,[]);await c.close();
  });
  await check('Focused setup retains supplied downloads and essential shared contracts',async()=>{
   await go(page,'session/model-setup');
   const zip=page.locator('#workbench-view a[data-download="assets/survey-learning/survey-learning.zip"]');
   assert.ok(await zip.count()>0);
   const [d]=await Promise.all([page.waitForEvent('download'),zip.first().click()]);
   assert.deepEqual(fs.readFileSync(await d.path()),fs.readFileSync(root+'/assets/survey-learning/survey-learning.zip'));
   for(const [id,phrases] of [
    ['drive-power',['RoboClaw','4885','fuse']],
    ['capture-driver-check',['/scan','/tf_static','/rgb/camera_info']],
    ['mapping-record',['map → odom','/scan']],
    ['navigation-localize',['Stop SLAM','AMCL']],
    ['memory-evidence',['What runs now','illustrative']],
    ['memory-real-observations',['score_present','0.9','capture']]
   ]){
    await go(page,'session/'+id);const txt=await page.locator('#workbench-view').textContent();
    for(const phrase of phrases)assert.ok(txt.includes(phrase),id+' missing context '+phrase);
   }
   assert.ok(await page.locator('#workbench-view a[data-download="assets/survey-memory/observation-template.json"]').count()>0);
  });
  await check('Session shortcuts reach restart and idea fields without changing the return route',async()=>{
   await go(page,'session/drive-interface');const before=page.url();
   await page.getByRole('button',{name:'Pause this session',exact:true}).click();
   assert.equal(await page.evaluate(()=>document.activeElement.id),'wb-next-action');assert.equal(page.url(),before);
   await page.getByRole('button',{name:'Park an idea',exact:true}).click();
   assert.equal(await page.evaluate(()=>document.activeElement.id),'wb-new-idea');assert.equal(await page.locator('#wb-new-idea').isVisible(),true);assert.equal(page.url(),before);
  });
  await check('A short visit can save only a restart action without claiming an experiment passed',async()=>{
   const c=await browser.newContext();const p=await c.newPage();await go(p,'session/first-hour');
   await openPause(p);
   await p.locator('#wb-next-action').fill('Tomorrow: choose the room and photograph its boundaries.');
   await p.getByRole('button',{name:'Save and pause',exact:true}).click();await p.waitForURL('**#workbench');await p.locator('#workbench-view .wb-now').waitFor({state:'visible'});
   const state=await snapshot(p);assert.equal(state.records['first-hour'].evidence,'');assert.equal(state.records['first-hour'].status,'working');
   assert.ok((await p.locator('#workbench-view').textContent()).includes('Tomorrow: choose the room'));
   assert.ok(!state.history.some(e=>e.status==='complete'));await c.close();
  });
  await check('An unfinished observation and exact next action survive immediate departure',async()=>{
   await go(page,'session/first-hour');
   await page.locator('#wb-evidence').fill('Measured room span: 3.72 m; endpoints photographed. One shorter span remains.');
   await openPause(page);
   await page.locator('#wb-next-action').fill('Open notes/room-reference.md and measure the doorway-to-cabinet span.');
   await go(page,'ch-resources');await page.reload();await go(page,'workbench');
   const home=await page.locator('#workbench-view').textContent();
   assert.ok(home.includes('doorway-to-cabinet'));
   const state=await snapshot(page);assert.equal(state.active,'first-hour');assert.equal(state.records['first-hour'].status,'working');
   await go(page,'session/first-hour');await page.getByRole('button',{name:'Save and pause',exact:true}).click();
   await page.waitForURL('**#workbench');await page.locator('#workbench-view .wb-now').waitFor({state:'visible'});
   const saved=await snapshot(page);assert.equal(saved.records['first-hour'].status,'working');assert.ok(saved.history.some(e=>e.session==='first-hour'&&e.status==='working'));
  });
  await check('Only an explicit finish assertion records a completed checkpoint',async()=>{
   await go(page,'session/first-hour');
   await page.getByRole('button',{name:'Record checkpoint met',exact:true}).click();
   assert.equal((await snapshot(page)).records['first-hour'].status,'working');
   await page.locator('#wb-evidence').fill('Three room distances and endpoints are recorded; target toy selected.');
   await page.locator('#wb-finish-checked').check();
   await page.getByRole('button',{name:'Record checkpoint met',exact:true}).click();
   const state=await snapshot(page);assert.equal(state.records['first-hour'].status,'complete');assert.ok(state.history.some(e=>e.session==='first-hour'&&e.status==='complete'));
   const legacy=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),LEGACY);
   assert.ok(!legacy.completed.includes('ch-first-hour'),'session completion must not silently certify entire chapter');
  });
  await check('Ideas retain their originating session and user text stays inert',async()=>{
   await go(page,'session/capture-session-a');
   await page.getByText('Save an idea without losing your place',{exact:true}).click();
   await page.locator('#wb-new-idea').fill('<img src=x onerror="window.BAD_IDEA=true"> Try a laundry-basket observer later.');
   await page.getByRole('button',{name:'Save this idea for later',exact:true}).click();
   await go(page,'ch-resources');await go(page,'workbench');await page.reload();
   const state=await snapshot(page);assert.equal(state.active,'capture-session-a');assert.equal(state.ideas.at(-1).session,'capture-session-a');
   assert.ok((await page.locator('.wb-saved-ideas').textContent()).includes('<img src=x'));
   assert.equal(await page.locator('.wb-saved-ideas img').count(),0);assert.equal(await page.evaluate(()=>window.BAD_IDEA),undefined);
   assert.ok(await page.locator('.wb-saved-ideas a[href="#session/capture-session-a"]').count()>0);
  });
  await check('An unfinished idea draft survives navigation and export with its original task',async()=>{
   await go(page,'session/precision-measure');
   await page.getByText('Save an idea without losing your place',{exact:true}).click();
   await page.locator('#wb-new-idea').fill('Draft: compare a softer bumper after the first map.');
   await go(page,'ch-resources');await go(page,'workbench');await page.reload();
   const state=await snapshot(page);assert.equal(state.ideaDraft.session,'precision-measure');assert.ok(state.ideaDraft.text.startsWith('Draft:'));
   assert.ok((await page.locator('.wb-saved-ideas').textContent()).includes('Unfinished idea draft'));
   const exported=await exportNotes(page);assert.deepEqual(exported.workbench.ideaDraft,state.ideaDraft);
   await go(page,'session/model-data');await page.getByText('Save an idea without losing your place',{exact:true}).click();
   assert.ok((await page.locator('#wb-new-idea').inputValue()).startsWith('Draft:'));
   await page.getByRole('button',{name:'Save this idea for later',exact:true}).click();
   assert.equal((await snapshot(page)).ideas.at(-1).session,'precision-measure');
  });
  await check('Recovery stays local and waiting suggestions respect recorded prerequisites',async()=>{
   const now=new Date().toISOString();
   const target=plan.sessions.find(s=>s.id==='mechanics-layout');
   const candidate=plan.sessions.find(s=>s.track==='learn');
   const fixture={version:1,active:target.id,records:{},history:[],ideas:[]};
   for(const s of plan.sessions.filter(s=>!s.optional&&s.id!==target.id&&s.id!==candidate.id))fixture.records[s.id]={evidence:'Fixture: prerequisite was checked.',nextAction:'',status:'complete',updatedAt:now};
   await page.evaluate(x=>window.FieldbookWorkbench.importData(x),fixture);
   await go(page,'session/'+target.id);
   await page.locator('#help-button').click();
   for(const title of ['I’m stuck','Returning after a break','Only ten minutes']){
    const box=page.locator('.wb-recovery details').filter({has:page.locator('summary',{hasText:title})});
    await box.locator('summary').click();assert.ok((await box.textContent()).length>title.length+30);
   }
   const waiting=page.locator('.wb-recovery details').filter({has:page.locator('summary',{hasText:'Waiting for parts'})});
   await waiting.locator('summary').click();
   const routes=await waiting.locator('a[href^="#session/"]').evaluateAll(es=>es.map(e=>e.getAttribute('href').slice(9)));
   const state=await snapshot(page);assert.equal(state.active,target.id);
   for(const sessionId of routes){const chosen=plan.sessions.find(s=>s.id===sessionId);assert.ok(chosen.requires.every(dep=>state.records[dep]?.status==='complete'));assert.notEqual(chosen.track,target.track);}
   await page.keyboard.press('Escape');
  });
  await check('Legacy notes and pins migrate without overriding a later deliberate session',async()=>{
   const c=await browser.newContext();const p=await c.newPage();await go(p,'ch-start');
   await p.evaluate(({KEY,LEGACY})=>{localStorage.removeItem(KEY);localStorage.setItem(LEGACY,JSON.stringify({checkpointRevision:2,completed:['ch-first-hour'],notes:{'ch-mechanics':'Keep the measured M3 coupon.'},pinnedNext:'precision-measure',last:'ch-start'}));},{KEY,LEGACY});
   await p.reload();await go(p,'workbench');assert.equal((await snapshot(p)).active,'precision-measure');
   await go(p,'session/model-setup');await go(p,'ch-resources');await go(p,'workbench');await p.reload();
   assert.equal((await snapshot(p)).active,'model-setup');
   const old=await p.evaluate(key=>JSON.parse(localStorage.getItem(key)),LEGACY);assert.equal(old.notes['ch-mechanics'],'Keep the measured M3 coupon.');assert.ok(old.completed.includes('ch-first-hour'));
   await c.close();
  });
  await check('Export and import retain continuation, evidence, ideas and chapter notes idempotently',async()=>{
   await go(page,'session/capture-session-a');
   const exported=await exportNotes(page);assert.equal(exported.workbench.active,'capture-session-a');assert.ok(exported.workbench.ideas.length>0);
   const c=await browser.newContext({acceptDownloads:true});const p=await c.newPage();
   await go(p,'workbench');const msg=await importNotes(p,exported);assert.ok(msg.startsWith('Imported.'));
   await go(p,'workbench');const before=await snapshot(p);
   assert.equal(before.active,exported.workbench.active);
   assert.deepEqual(before.records,exported.workbench.records);assert.deepEqual(before.ideas,exported.workbench.ideas);
   await importNotes(p,exported);const again=await snapshot(p);assert.deepEqual(again,before);
   const invalid=JSON.parse(JSON.stringify(exported));invalid.workbench.records['missing-session']={evidence:'x',nextAction:'',status:'complete',updatedAt:new Date().toISOString()};invalid.notes['ch-start']='THIS MUST NOT BE IMPORTED';
   const legacyBefore=await p.evaluate(key=>JSON.parse(localStorage.getItem(key)),LEGACY);
   assert.ok((await importNotes(p,invalid)).startsWith('Could not import:'));
   assert.deepEqual(await snapshot(p),before);
   assert.deepEqual((await p.evaluate(key=>JSON.parse(localStorage.getItem(key)),LEGACY)).notes,legacyBefore.notes);
   await c.close();
  });
  await check('A valid export larger than two megabytes imports without dropping evidence',async()=>{
   const c=await browser.newContext();const p=await c.newPage();await go(p,'ch-practice');
   const data={format:'robotics-fieldbook-notes',version:2,edition:'home-survey',checkpointRevision:2,completed:[],notes:{},workbench:{version:1,active:'first-hour',records:{},history:[],ideas:[]}};
   for(let i=0;i<240;i++)data.workbench.history.push({id:'large-'+i,session:'first-hour',evidence:'Evidence '+i+': '+'.'.repeat(9000),nextAction:'',status:'working',at:'2026-10-28T01:00:00.000Z'});
   assert.ok(Buffer.byteLength(JSON.stringify(data))>2000000);
   assert.ok((await importNotes(p,data)).startsWith('Imported.'));
   const imported=await snapshot(p);assert.equal(imported.history.length,240);assert.equal(imported.history.at(-1).evidence,data.workbench.history.at(-1).evidence);
   await c.close();
  });
  await check('Storage failure is visible while export retains the current unsaved work',async()=>{
   const c=await browser.newContext({acceptDownloads:true});const p=await c.newPage();
   await p.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('Test storage full','QuotaExceededError');};});
   await go(p,'session/first-hour');
   await p.locator('#wb-evidence').fill('Storage-failure fixture: measured one span.');
   await openPause(p);
   await p.locator('#wb-next-action').fill('Keep this page open and export the measurements.');
   await p.getByRole('button',{name:'Save and pause',exact:true}).click();await p.waitForURL('**#workbench');await p.locator('#workbench-view .wb-now').waitFor({state:'visible'});
   assert.ok((await p.locator('.wb-storage-status').first().textContent()).includes('unavailable'));
   const exported=await exportNotes(p);assert.ok(exported.workbench.records['first-hour'].evidence.includes('Storage-failure fixture'));
   await c.close();
  });
  await check('All core checkpoints produce a stable finish without requiring optional work',async()=>{
   const c=await browser.newContext();const p=await c.newPage();await go(p,'ch-practice');
   const all={version:1,active:null,records:{},history:[],ideas:[]};
   for(const s of plan.sessions.filter(s=>!s.optional))all.records[s.id]={evidence:'Fixture: recorded finish condition.',nextAction:'',status:'complete',updatedAt:new Date().toISOString()};
   await p.evaluate(data=>window.FieldbookWorkbench.importData(data),all);await go(p,'workbench');
   assert.ok(/core.*(?:complete|recorded)|finish line|core project/i.test(await p.locator('#workbench-view').textContent()));
   assert.equal(await p.getByRole('link',{name:'Continue this session',exact:true}).count(),0);
   await p.reload();assert.equal(await p.getByRole('link',{name:'Continue this session',exact:true}).count(),0);
   await c.close();
  });
  await check('Reopening a prerequisite preserves evidence and flags dependent checkpoints for review',async()=>{
   const c=await browser.newContext();const p=await c.newPage();await go(p,'ch-practice');
   const fixture={version:1,active:'first-hour',records:{},history:[],ideas:[]};
   for(const s of plan.sessions.filter(s=>!s.optional))fixture.records[s.id]={evidence:'Fixture: finish recorded for '+s.id,nextAction:'',status:'complete',updatedAt:new Date().toISOString()};
   await p.evaluate(data=>window.FieldbookWorkbench.importData(data),fixture);
   await go(p,'session/first-hour');await p.getByRole('button',{name:'Reopen this checkpoint',exact:true}).click();
   const state=await snapshot(p);assert.equal(state.records['first-hour'].status,'working');assert.equal(state.records['capture-session-a'].status,'complete');
   assert.ok(state.records['capture-session-a'].evidence.includes('finish recorded'));
   await go(p,'workbench');assert.ok((await p.locator('.wb-milestones').textContent()).includes('Review earlier check'));
   await p.locator('#help-button').click();
   const waiting=p.locator('.wb-recovery details').filter({has:p.locator('summary',{hasText:'Waiting for parts'})});await waiting.locator('summary').click();
   assert.equal(await waiting.locator('a[href^="#session/"]').count(),0);
   await c.close();
  });
  await check('Unreadable local work is preserved for recovery rather than silently discarded',async()=>{
   const c=await browser.newContext({acceptDownloads:true});const p=await c.newPage();
   const broken='{ "version": 1, "records": this was interrupted';
   await p.addInitScript(({KEY,broken})=>localStorage.setItem(KEY,broken),{KEY,broken});await go(p,'workbench');
   assert.ok((await p.locator('.wb-storage-status').first().textContent()).includes('could not be read'));
   const [d]=await Promise.all([p.waitForEvent('download'),p.getByRole('button',{name:'Download unreadable recovery data',exact:true}).first().click()]);
   assert.equal(fs.readFileSync(await d.path(),'utf8'),broken);
   await c.close();
  });
  await check('Browser history and invalid session links retain a usable reading view',async()=>{
   await go(page,'session/precision-measure');await go(page,'ch-resources');
   await page.goBack();await page.locator('#workbench-view').waitFor({state:'visible'});
   assert.ok((await page.locator('#workbench-view h1').textContent()).includes(plan.sessions.find(s=>s.id==='precision-measure').title));
   for(const bad of ['session/not-a-real-session','session/%E0%A4%A']){
    await go(page,bad);assert.equal(await page.locator('.chapter:not([hidden])').count(),0);assert.ok(await page.locator('#workbench-view h1').textContent());
   }
  });
  await check('Focused views remain usable across four widths and print the book once',async()=>{
   for(const width of [1440,768,390,320]){
    await page.setViewportSize({width,height:1000});
    for(const route of ['workbench','session/first-hour','session/drive-power','session/model-setup','session/memory-real-observations']){
     await go(page,route);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),route+' overflow at '+width);
     assert.equal(await page.locator('#help-button').isVisible(),true,route+' hides help at '+width);assert.equal(await page.locator('#project-compass').isVisible(),true,route+' hides vision at '+width);
    }
   }
   await page.setViewportSize({width:390,height:844});await go(page,'session/first-hour');
   await page.screenshot({animations:'disabled',path:path.join(artifacts,'workbench-session-mobile.png')});
   await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));await page.emulateMedia({media:'print'});
   assert.equal(await page.locator('#workbench-view').evaluate(e=>getComputedStyle(e).display),'none');
   assert.equal(await page.locator('.chapter').evaluateAll(es=>es.filter(e=>getComputedStyle(e).display==='none').length),0);
   await page.emulateMedia({media:'screen'});await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
  });
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(artifacts,'workbench-browser-results.json'),JSON.stringify({checks,errors,passed:true},null,2));
  await context.close();
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
