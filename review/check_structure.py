from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
import collections,json
root=Path(__file__).resolve().parents[1]
class Inspect(HTMLParser):
 def __init__(self):super().__init__();self.ids=[];self.hashes=[];self.external=[];self.labels=[];self.inputs=[];self.chapters=[];self.subresources=[];self.resources=[];self.scripts={};self.script_id=None
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if a.get('id'):self.ids.append(a['id'])
  if 'resource-card' in a.get('class','').split():self.resources.append(a.get('id'))
  if tag=='script' and a.get('id'):self.script_id=a['id'];self.scripts[self.script_id]=''
  if tag=='a':
   if a.get('href','').startswith('#'):self.hashes.append(a['href'][1:])
   if a.get('href','').startswith('https://'):self.external.append(a)
  if tag=='label':self.labels.append(a.get('for'))
  if tag=='input':self.inputs.append(a)
  if tag=='section' and 'chapter' in a.get('class','').split():self.chapters.append(a)
  if tag in ('script','img','link') and (a.get('src','').startswith('http') or a.get('href','').startswith('http')):self.subresources.append(a)
 def handle_data(self,data):
  if self.script_id:self.scripts[self.script_id]+=data
 def handle_endtag(self,tag):
  if tag=='script':self.script_id=None
p=Inspect();p.feed((root/'dist/index.html').read_text())
duplicates=[k for k,v in collections.Counter(p.ids).items() if v>1]
assert not duplicates,duplicates
plan=json.loads((root/'src/session-plan.json').read_text())
session_ids={s['id'] for s in plan['sessions']}
routes={'workbench'}|{'session/'+s for s in session_ids}
assert not [h for h in p.hashes if h not in p.ids and h not in routes], 'Missing internal anchor or session route'
assert len(session_ids)==len(plan['sessions']), 'Duplicate session ID'
assert len(session_ids)==34, 'A session disappeared from the supported learning route'
assert all(s['id'] in p.ids for s in plan['sessions']), 'Missing session source'
assert all(r in session_ids for s in plan['sessions'] for r in s['requires']), 'Unknown dependency'
assert all(s['reference']['href'].lstrip('#') in p.ids for s in plan['sessions']), 'Unknown resource'
milestones={m['id'] for m in plan['milestones']}
assert all(s['milestone'] in milestones for s in plan['sessions']), 'Unknown milestone'
for session in plan['sessions']:
 for field in ('objective','recordExample'):
  assert isinstance(session.get(field),str) and session[field].strip(), f"{session['id']} lacks {field}"
 assert isinstance(session.get('recordPrompts'),list) and session['recordPrompts'], f"{session['id']} lacks recording guidance"
 assert all(isinstance(prompt,str) and prompt.strip() for prompt in session['recordPrompts']), f"{session['id']} has an empty recording prompt"
companions=json.loads((root/'src/learning-companions.json').read_text())
assert set(companions['milestones'])==milestones and len(milestones)==8, 'Learning companions do not cover the whole capability route'
formats=set()
for milestone,material in companions['milestones'].items():
 assert isinstance(material.get('vision'),str) and material['vision'].strip(), f'{milestone} loses the project vision'
 assert isinstance(material.get('items'),list) and material['items'], f'{milestone} has no learning companion'
 for item in material['items']:
  for field in ('format','title','url','creator','focus','why'):
   assert isinstance(item.get(field),str) and item[field].strip(), f'{milestone} companion lacks {field}'
  assert item['format'] in ('Read','Watch','Listen'), f"Unknown companion format {item['format']}"
  formats.add(item['format'])
  parsed=urlparse(item['url'])
  assert parsed.scheme=='https' and parsed.netloc and not parsed.username and not parsed.password, f"Unsafe companion URL {item['url']}"
assert formats=={'Read','Watch','Listen'}, 'The learning shelf needs reading, viewing and listening options'
assert json.loads(p.scripts['session-plan'])==plan, 'Published session guidance is stale'
assert json.loads(p.scripts['learning-companions'])==companions, 'Published learning companions are stale'
visited=set()
def visit(session_id,stack):
 assert session_id not in stack, 'Cyclic session dependency'
 if session_id in visited:return
 session=next(s for s in plan['sessions'] if s['id']==session_id)
 for dep in session['requires']:visit(dep,stack|{session_id})
 visited.add(session_id)
for session_id in session_ids:visit(session_id,set())
assert len(p.chapters)==13,len(p.chapters)
assert all(a.get('target')=='_blank' and {'noopener','noreferrer'} <= set(a.get('rel','').split()) for a in p.external),'External link attributes'
assert not p.subresources,'Unexpected online-only page dependencies'
assert (root/'dist/index.html').read_bytes()==(root/'dist/robotics-fieldbook.html').read_bytes()
assert all(x.get('id') in p.labels or x.get('aria-label') for x in p.inputs),'Unlabeled input'
assert 'learning-roadmap' in p.ids and 'model-neural' in p.ids and 'mapping-record' in p.ids
assert (root/'dist/legacy.html').is_file()
resources=Inspect();resources.feed((root/'course/resources.html').read_text())
assert p.resources==resources.resources and p.resources, 'Published resource library does not match its source'
assert 'resource-inspiration' in p.ids, 'Missing motivational resource shelf'
print(json.dumps({'chapter_sections':len(p.chapters),'sessions':len(session_ids),'learning_milestones':len(milestones),'resources':len(p.resources),'unique_ids':len(p.ids),'external_link_occurrences':len(p.external),'offline_subresources':len(p.subresources),'passed':True}))
