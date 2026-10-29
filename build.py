from pathlib import Path
from html.parser import HTMLParser
from html import escape,unescape
import re,json,base64
ROOT=Path(__file__).resolve().parent
class Links(HTMLParser):
 def __init__(self): super().__init__(); self.links=[];self.cur=None
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='a' and a.get('href','').startswith('https://'):self.cur=[a['href'],'']
 def handle_data(self,data):
  if self.cur:self.cur[1]+=data
 def handle_endtag(self,tag):
  if tag=='a' and self.cur:self.links.append(self.cur);self.cur=None
files=sorted((ROOT/'course').glob('[0-9][0-9]-*.html'))
def embed_downloads(html):
 def replace_tag(match):
  tag=match.group(0)
  marker=re.search(r'data-download="([^"]+)"',tag)
  if not marker:return tag
  path=(ROOT/marker.group(1)).resolve()
  if not path.is_relative_to(ROOT/'assets') or not path.is_file():
   raise ValueError('Missing or invalid bundled asset: '+marker.group(1))
  mime='application/octet-stream' if path.suffix=='.stl' else 'text/plain;charset=utf-8'
  uri='data:'+mime+';base64,'+base64.b64encode(path.read_bytes()).decode('ascii')
  return re.sub(r'href="[^"]*"','href="'+uri+'"',tag,count=1)
 return re.sub(r'<a\b[^>]*>',replace_tag,html)
def read_chapter(path):
 html=path.read_text()
 for marker,name in (('EXPERIENCED_PATH','experienced-path.html'),('LEARNING_ROADMAP','roadmaps.html'),('ROUND_FIT_DIAGRAM','round-fit-diagram.html')):
  if '<!-- '+marker+' -->' in html:
   html=html.replace('<!-- '+marker+' -->',(ROOT/'content/includes'/name).read_text())
 return embed_downloads(html)
fragments=[read_chapter(f) for f in files]
links={}
for html in fragments:
 p=Links();p.feed(html)
 chapter=unescape(re.search(r'data-title="([^"]+)"',html).group(1))
 for url,title in p.links:
  if url not in links:links[url]={'title':title.strip(),'chapters':[]}
  if chapter not in links[url]['chapters']:links[url]['chapters'].append(chapter)
reference='<section class="chapter resource-library" id="ch-reference" data-title="Resources" data-part="Keep nearby" data-number="R">'
reference+=(ROOT/'course/resources.html').read_text()
reference+='''<details id="chapter-source-links"><summary>All chapter sources — the complete link index</summary><p>These are the sources linked beside the experiments in Chapters 00–11. Use this index when you want to find one again. Research demonstrations show possible directions; they do not promise the same result from beginner hardware.</p><div class="table-wrap"><table><thead><tr><th>Resource</th><th>Used in</th></tr></thead><tbody>'''
for url,item in links.items():reference+='<tr><td><a href="'+escape(url,quote=True)+'" target="_blank" rel="noopener noreferrer">'+escape(item['title'])+'</a></td><td>'+escape('; '.join(item['chapters']))+'</td></tr>'
reference+='</tbody></table></div></details><details id="resource-vocabulary"><summary>A small working vocabulary</summary><dl>'
glossary=[('Supervised learning','Fitting model parameters from examples that include both inputs and a desired prediction target.'),('Feature and target','Features are the inputs available when making a prediction. The target is the value the model is trained to predict; later measurements cannot be smuggled into current inputs.'),('Loss','A numeric measure of prediction error used to fit model parameters. Its scale, units, and weighting affect what the fit prioritizes.'),('Training, validation, and test','Training data fits parameters and preprocessing. Validation data guides model choices. A reserved test set evaluates the frozen choice; using it to guide revisions makes it part of development.'),('Gradient','The local sensitivity of a loss to model parameters. An optimizer uses this information to choose parameter updates.'),('Training and inference','Training adjusts fitted parameters using data. Inference applies the fitted model to new inputs; it does not automatically continue learning.'),('Data leakage','Information that should be unavailable during fitting or prediction influences the model or its evaluation, producing misleadingly optimistic results.'),('Clearance','Intentional space between mating parts. A pocket with clearance on both sides adds twice the per-side clearance to the part width.'),('Tolerance','The permitted variation in a dimension. It describes an acceptance range, not a universal printer capability.'),('Dimensional accuracy','In this workshop, how closely a printed feature matches its intended dimension. A fine layer height or precise-looking display does not establish it.'),('Repeatability','How closely repeated measurements or prints agree under the same stated conditions. Consistent results can still have a consistent error.'),('Diametral and radial clearance','For centered circular parts, diametral clearance is hole diameter minus shaft diameter; radial clearance is half that difference.'),('Fit coupon','A small test piece used to check a critical fit before printing the full part.'),('Actuator','A component that turns a command and an energy supply into physical action, such as a motor.'),('Backlash','Free motion caused by clearance in a mechanism. The output can lag when you reverse direction.'),('Closed-loop control','A controller uses measurements of what happened to adjust what it commands next.'),('Command','A requested value. It is not evidence that the mechanism reached that value.'),('Degree of freedom','One independent coordinate needed to describe a mechanism’s configuration.'),('Duty cycle','The fraction of a PWM cycle spent in the active state. Its relationship to motor motion depends on the driver, motor, load, and supply.'),('Encoder','A sensor that measures rotation or displacement; wheel rotation can differ from ground travel when the wheel slips.'),('Gait','A coordinated pattern of movement that can produce locomotion when the body interacts appropriately with its surroundings.'),('Ground / common reference','The electrical reference shared by communicating circuits. It does not mean every positive supply rail should be connected together.'),('Kinematics','The geometry of motion. It relates configurations, velocities, and positions without describing the forces that cause them.'),('Dynamics','The relationship between forces, torques, mass, and the resulting motion.'),('Observation','Information available to a controller or policy. It may be incomplete or noisy.'),('Open-loop control','Commands are generated without correction from measurements of the resulting behavior.'),('Policy','A rule that selects actions from observations and, in our later experiments, a requested motion.'),('Reward','A training signal expressing what behavior is preferred. An imperfect reward can favor unwanted behavior.'),('System identification','Using measurements to estimate how a physical system behaves and to improve its model.'),('Domain randomization','Varying plausible simulated conditions during training to reduce dependence on one exact simulated world.'),('Torque','The turning effect of a force about an axis. For a perpendicular force, its magnitude is force multiplied by the lever arm.'),('Watchdog / command timeout','A local check that changes to a defined stopping behavior when fresh commands stop arriving.')]
for term,definition in glossary:reference+='<dt><strong>'+escape(term)+'</strong></dt><dd>'+escape(definition)+'</dd>'
reference+='</dl></details><p class="callout">Before a hardware build, match every supply voltage, current rating, signal level, and pin assignment to its actual datasheet. Before running a software tutorial, match its instructions to the version you install.</p><p><a href="#learning-roadmap">Return to your learning path →</a></p></section>'
fragments.append(reference)
css='\n'.join((ROOT/'src'/name).read_text() for name in ('style.css','resources.css','survey.css','workbench.css','polish.css'))
font_css=''
font_licenses=[]
for family,stem,weights in [('Manrope','manrope','400 800'),('Source Serif 4','source-serif-4','400 700')]:
 font=(ROOT/'assets/fonts'/f'{stem}-latin.woff2').read_bytes()
 font_css+='@font-face{font-family:'+repr(family)+';font-style:normal;font-weight:'+weights+';font-display:swap;src:url(data:font/woff2;base64,'+base64.b64encode(font).decode('ascii')+") format('woff2');}\n"
 font_licenses.append(family+'\n'+(ROOT/'assets/fonts'/f'{stem}-OFL.txt').read_text())
css=font_css+css
session_plan=json.loads((ROOT/'src/session-plan.json').read_text())
plan_json=json.dumps(session_plan,ensure_ascii=False).replace('<','\\u003c')
learning_companions=json.loads((ROOT/'src/learning-companions.json').read_text())
companions_json=json.dumps(learning_companions,ensure_ascii=False).replace('<','\\u003c')
js=(ROOT/'src/app.js').read_text()+'\n'+(ROOT/'src/workbench.js').read_text()
header='''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="A maker textbook for building a room-survey rover while training your first models. Practical CAD, X1 Carbon printing, measured mapping, navigation, and spatial memory."><meta name="theme-color" content="#275f4d"><title>The Robotics Fieldbook — A robot that knows a room</title><style>'''+css+'''</style></head><body>
<a class="skip-link" href="#main">Skip to the textbook</a><aside class="sidebar" aria-label="Textbook navigation"><a class="brand" href="#workbench"><span class="brand-mark" aria-hidden="true">R<span style="font-size:12px">/</span></span><span><strong>The Robotics<br>Fieldbook</strong><small>Build · Measure · Learn</small></span></a><button id="search-button" class="search-button" type="button"><span>Search the textbook</span><kbd>/</kbd></button><a class="roadmap-shortcut workbench-shortcut" href="#workbench">Your workbench <svg class="nav-arrow" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10M8 3l5 5-5 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg></a><a class="roadmap-shortcut" href="#experienced-path">Project vision &amp; route <svg class="nav-arrow" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10M8 3l5 5-5 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg></a><a class="roadmap-shortcut" href="#learning-roadmap">Learning paths &amp; roadmaps <svg class="nav-arrow" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10M8 3l5 5-5 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg></a><a class="roadmap-shortcut" href="#ch-resources">Resources · books &amp; videos <svg class="nav-arrow" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10M8 3l5 5-5 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg></a><details class="chapter-browser" id="chapter-browser"><summary>Browse the textbook</summary><nav id="chapter-nav" aria-label="Chapters"></nav></details><div class="sidebar-footer"><a class="sidebar-resume" id="sidebar-resume" href="#ch-first-hour">Start the first hour →</a><details class="chapter-progress"><summary>Chapter checkmarks</summary><div class="progress-line"><span>Core checkpoints</span><span id="progress-text">0 / 10</span></div><progress id="book-progress" value="0" max="10" aria-label="Chapter progress"></progress></details><small>Saved in this browser. Pick up at your next bench check.</small></div></aside>
<button class="mobile-overlay" id="mobile-overlay" aria-label="Close chapter menu" tabindex="-1"></button><div class="main-wrap"><header class="toolbar"><div class="toolbar-left"><button class="tool-button mobile-menu" id="menu-button" aria-label="Open chapter menu" aria-expanded="false" aria-controls="chapter-nav" type="button">☰</button><span class="edition">HOME SURVEY / 06.4</span><span class="edition" aria-hidden="true">—</span><span id="current-part" class="crumb-label">Start here</span></div><div class="toolbar-actions"><button id="size-button" class="tool-button" type="button" aria-label="Increase reading text size">Aa</button><button id="theme-button" class="tool-button" type="button">Dark</button><button id="print-button" class="tool-button print-button" type="button">Print book</button><a class="tool-button download-link" href="./robotics-fieldbook.html" download="robotics-fieldbook.html">Download HTML ↓</a></div></header>
<noscript><div class="no-js-note">All chapters are available below. Enable JavaScript for navigation, search, interactive labs, and local notes.</div></noscript><main id="main" class="reading" tabindex="-1">'''
footer='''</main><footer class="book-end">THE ROBOTICS FIELDBOOK · HOME SURVEY EDITION · BUILD + TRAIN · OCTOBER 2026<br>Make one change. Observe what happens.</footer></div><dialog id="search-dialog" class="search-dialog" aria-label="Search the textbook"><div class="search-top"><label for="search-input" class="sr-only">Search terms</label><input id="search-input" type="search" placeholder="What are you working on?" autocomplete="off"><button type="button" id="search-close" aria-label="Close search">×</button></div><p class="search-count" id="search-count" aria-live="polite"></p><ul class="search-results" id="search-results"></ul></dialog><script>'''+js.replace('</script','<\\/script')+'''</script></body></html>'''
workbench='<section id="workbench-view" hidden aria-label="Your workbench"></section><script type="application/json" id="session-plan">'+plan_json+'</script><script type="application/json" id="learning-companions">'+companions_json+'</script>'
license_notice='<pre id="font-licenses" hidden>'+escape('\n\n'.join(font_licenses))+'</pre>'
output=header+workbench+'\n'.join(fragments)+license_notice+footer
(ROOT/'dist').mkdir(exist_ok=True)
for name in ('index.html','robotics-fieldbook.html'):(ROOT/'dist'/name).write_text(output)
(ROOT/'dist/legacy.html').write_bytes((ROOT/'archive/fieldbook-04.html').read_bytes())
print(json.dumps({'chapters':len(files),'reference_links':len(links),'bytes':len(output.encode()),'output':str(ROOT/'dist/index.html')}))
