'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
const artifacts=path.join(root,'test-results');fs.mkdirSync(artifacts,{recursive:true});
const url=process.env.FIELDBOOK_TEST_URL || pathToFileURL(path.join(root,'dist/index.html')).href;
const checks=[],errors=[];
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
 const page=await context.newPage();page.setDefaultTimeout(8000);
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto(url);await page.waitForSelector('.chapter-link',{state:'attached'});
 await page.evaluate(()=>{localStorage.clear();localStorage.setItem('robotics-fieldbook-v1',JSON.stringify({completed:['ch-start'],notes:{'ch-start':'Earlier edition note'},last:'ch-start'}));});await page.reload();
 await check('New course initializes without inheriting old completion',async()=>{
   assert.equal(await page.locator('.chapter').count(),13);assert.equal(await page.locator('.chapter-link').count(),13);assert.equal(await page.locator('.resource-card').count(),33);assert.equal(await page.locator('#progress-text').textContent(),'0 / 10');
   assert.equal(await page.locator('.chapter:not([hidden])').count(),0);assert.equal(await page.locator('#workbench-view').isVisible(),true);
 });
 await page.screenshot({animations:'disabled',path:artifacts+'/survey-cover-desktop.png'});
 const ids=await page.locator('.chapter').evaluateAll(els=>els.map(x=>x.id));
 await check('Every chapter navigates at desktop and mobile widths',async()=>{
   for(const width of [1440,768,390,320]){
     await page.setViewportSize({width,height:1000});
     for(const id of ids){
       await page.evaluate(id=>{location.hash=id},id);await page.waitForFunction(id=>document.querySelector('.chapter:not([hidden])')?.id===id,id);
       const size=await page.evaluate(()=>({width:innerWidth,doc:document.documentElement.scrollWidth}));assert.ok(size.doc<=size.width+1,`${id} overflows ${width}: ${size.doc}`);
     }
   }
 });
 await check('Model-to-assembly and assembly-to-drive next links follow the actual route',async()=>{
   assert.equal(await page.locator('#ch-models .next-chapter').getAttribute('href'),'#mechanics-layout');
   assert.equal(await page.locator('#ch-mechanics .next-chapter').getAttribute('href'),'#ch-drive');
   await page.goto(url+'#ch-models');await page.locator('#ch-models .next-chapter').click();await page.waitForFunction(()=>document.querySelector('.chapter:not([hidden])')?.id==='ch-mechanics');
 });
 await check('Deep links reveal roadmap, training, recording and resources',async()=>{
   for(const target of ['learning-roadmap','experienced-path','model-neural','mapping-record','ch-resources']){
     await page.goto(url+'#'+target);await page.waitForFunction(t=>!!document.getElementById(t)?.getClientRects().length,target);
   }
 });
 await page.setViewportSize({width:1440,height:1000});await page.goto(url+'#learning-roadmap');await page.locator('#learning-roadmap h3').waitFor({state:'visible'});await page.locator('#learning-roadmap').scrollIntoViewIfNeeded();await page.waitForTimeout(250);await page.screenshot({animations:'disabled',path:artifacts+'/survey-roadmap-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.goto(url+'#model-neural');await page.locator('#model-neural h3').waitFor({state:'visible'});await page.waitForTimeout(250);await page.screenshot({animations:'disabled',path:artifacts+'/survey-model-mobile.png'});
 await check('Menu opens and closes accessibly on mobile',async()=>{
   await page.locator('#menu-button').click();assert.equal(await page.locator('#menu-button').getAttribute('aria-expanded'),'true');
   await page.locator('.chapter-link[data-chapter="ch-first-hour"]').click();await page.waitForFunction(()=>document.getElementById('menu-button').getAttribute('aria-expanded')==='false');assert.equal(await page.locator('#menu-button').getAttribute('aria-expanded'),'false');assert.equal(await page.locator('.sidebar').evaluate(x=>x.inert),true);
 });
 await check('Notes and progress survive reload',async()=>{
   await page.locator('#ch-first-hour .notebook summary').click();await page.locator('#note-ch-first-hour').fill('Next: print coupon, then collect B.');await page.waitForTimeout(450);await page.locator('[data-complete="ch-first-hour"]').click();await page.reload();
   assert.equal(await page.locator('#note-ch-first-hour').inputValue(),'Next: print coupon, then collect B.');assert.equal(await page.locator('#progress-text').textContent(),'1 / 10');
 });
 await check('Search finds the rebuilt subject',async()=>{
   await page.setViewportSize({width:1440,height:1000});await page.locator('#search-button').click();await page.locator('#search-input').fill('occupancy');assert.ok(await page.locator('.search-results a').count()>0);await page.locator('#search-close').click();
 });
 await check('Saved exact session survives resources, notebook and reload',async()=>{
   await page.goto(url+'#model-baseline');await page.locator('[data-pin="model-baseline"]').click();assert.equal(await page.locator('[data-pin="model-baseline"]').getAttribute('aria-pressed'),'true');
   await page.goto(url+'#ch-resources');await page.goto(url+'#ch-practice');await page.reload();
   assert.equal(await page.locator('#sidebar-resume').getAttribute('href'),'#workbench');
   await page.locator('#sidebar-resume').click();await page.locator('#workbench-view').waitFor({state:'visible'});assert.ok(await page.locator('#workbench-view a[href="#session/model-baseline"]').count()>0);
   await page.goto(url+'#ch-start');assert.equal(await page.locator('#resume-button').getAttribute('href'),'#workbench');
 });
 await check('Optional research and notebook do not expand core progress',async()=>{
   const before=await page.locator('#progress-text').textContent();await page.goto(url+'#ch-horizons');await page.locator('[data-complete="ch-horizons"]').click();assert.equal(await page.locator('#progress-text').textContent(),before);assert.equal(await page.locator('[data-complete="ch-practice"]').count(),0);assert.equal(await page.locator('#book-progress').getAttribute('max'),'10');
   assert.ok((await page.locator('#ch-memory .next-chapter').textContent()).includes('Optional research'));
 });
 await check('Notes export and import preserve this edition',async()=>{
   await page.goto(url+'#ch-practice');const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Export notes & progress'}).click()]);
   const data=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(data.version,2);assert.equal(data.edition,'home-survey');assert.equal(data.nextSession,'model-baseline');assert.equal(data.checkpointRevision,2);assert.equal(data.notes['ch-first-hour'],'Next: print coupon, then collect B.');
   const input=page.locator('[data-workbench] input[type=file]');await input.setInputFiles({name:'notes.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await page.waitForFunction(()=>document.querySelector('.export-status').textContent.startsWith('Imported.'));
   await input.setInputFiles({name:'old.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'robotics-fieldbook-notes',version:1,completed:['ch-start'],notes:{}}))});await page.waitForFunction(()=>document.querySelector('.export-status').textContent.includes('Home Survey edition'));
 });
 await check('Embedded starter download is the packaged ZIP',async()=>{
   await page.goto(url+'#ch-models');const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#ch-models a[data-download]').click()]);assert.equal(download.suggestedFilename(),'survey-learning.zip');assert.deepEqual(fs.readFileSync(await download.path()),fs.readFileSync(root+'/assets/survey-learning/survey-learning.zip'));
 });
 await check('Theme, larger text and print preserve content',async()=>{
   await page.locator('#theme-button').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');await page.locator('#size-button').click();assert.equal(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--reading')),'20px');
   await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));await page.emulateMedia({media:'print'});assert.equal(await page.locator('.chapter').evaluateAll(els=>els.filter(x=>getComputedStyle(x).display==='none').length),0);await page.emulateMedia({media:'screen'});await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
 });
 await check('Archived edition retains its own prior progress and notes',async()=>{
   const archived=await context.newPage();await archived.goto(new URL('legacy.html',url).href);await archived.waitForSelector('.chapter-link');assert.equal(await archived.locator('#note-ch-start').inputValue(),'Earlier edition note');assert.equal(await archived.locator('#progress-text').textContent(),'1 / 12');assert.equal(await archived.locator('.lab').count(),3);await archived.close();
 });
 await check('Revised memory checkpoint preserves notes and reopens only its older completion',async()=>{
   const migrationContext=await browser.newContext();const migration=await migrationContext.newPage();await migration.goto(url);await migration.evaluate(()=>localStorage.setItem('robotics-fieldbook-home-survey-v1',JSON.stringify({completed:['ch-first-hour','ch-memory'],notes:{'ch-memory':'Keep my old evidence notes'},last:'ch-start'})));await migration.reload();
   assert.equal(await migration.locator('#note-ch-memory').inputValue(),'Keep my old evidence notes');assert.equal(await migration.locator('[data-complete="ch-memory"]').getAttribute('aria-pressed'),'false');assert.equal(await migration.locator('[data-complete="ch-first-hour"]').getAttribute('aria-pressed'),'true');assert.ok((await migration.locator('#ch-start .edition-banner').textContent()).includes('reopened'));
   await migrationContext.close();
 });
 assert.deepEqual(errors,[]);console.log('PASS no browser errors');
 fs.writeFileSync(artifacts+'/survey-browser-results.json',JSON.stringify({checks,errors,passed:true},null,2));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
