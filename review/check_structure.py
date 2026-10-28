from html.parser import HTMLParser
from pathlib import Path
import collections,re,json
root=Path(__file__).resolve().parents[1]
class Inspect(HTMLParser):
 def __init__(self):super().__init__();self.ids=[];self.hashes=[];self.external=[];self.labels=[];self.inputs=[];self.chapters=[];self.subresources=[]
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if a.get('id'):self.ids.append(a['id'])
  if tag=='a':
   if a.get('href','').startswith('#'):self.hashes.append(a['href'][1:])
   if a.get('href','').startswith('https://'):self.external.append(a)
  if tag=='label':self.labels.append(a.get('for'))
  if tag=='input':self.inputs.append(a)
  if tag=='section' and 'chapter' in a.get('class','').split():self.chapters.append(a)
  if tag in ('script','img','link') and (a.get('src','').startswith('http') or a.get('href','').startswith('http')):self.subresources.append(a)
p=Inspect();p.feed((root/'dist/index.html').read_text())
duplicates=[k for k,v in collections.Counter(p.ids).items() if v>1]
assert not duplicates,duplicates
plan=json.loads((root/'src/session-plan.json').read_text())
session_ids={s['id'] for s in plan['sessions']}
routes={'workbench'}|{'session/'+s for s in session_ids}
assert not [h for h in p.hashes if h not in p.ids and h not in routes], 'Missing internal anchor or session route'
assert len(session_ids)==len(plan['sessions']), 'Duplicate session ID'
assert all(s['id'] in p.ids for s in plan['sessions']), 'Missing session source'
assert all(r in session_ids for s in plan['sessions'] for r in s['requires']), 'Unknown dependency'
assert all(s['reference']['href'].lstrip('#') in p.ids for s in plan['sessions']), 'Unknown resource'
milestones={m['id'] for m in plan['milestones']}
assert all(s['milestone'] in milestones for s in plan['sessions']), 'Unknown milestone'
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
assert len(re.findall(r'class="resource-card"',(root/'dist/index.html').read_text()))==33
print(json.dumps({'chapter_sections':len(p.chapters),'unique_ids':len(p.ids),'external_link_occurrences':len(p.external),'offline_subresources':len(p.subresources),'passed':True}))
