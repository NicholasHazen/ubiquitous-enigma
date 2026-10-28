"""Check the offline edition contains byte-exact downloads and complete code."""
from pathlib import Path
from html.parser import HTMLParser
from html import unescape
import base64,re,json
root=Path(__file__).resolve().parents[1]
class Downloads(HTMLParser):
 def __init__(self):super().__init__();self.assets=[]
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='a' and a.get('data-download'):self.assets.append(a)
p=Downloads();p.feed((root/'dist/index.html').read_text())
for a in p.assets:
 path=root/a['data-download']
 assert path.is_file(),path
 assert a['href'].startswith('data:') and ';base64,' in a['href'],path
 assert base64.b64decode(a['href'].split(';base64,',1)[1])==path.read_bytes(),path
 assert a.get('download') and Path(a['download']).name==a['download'],(path,a.get('download'))
examples=[('03-code.html','rover/rover.ino'),('06-vision.html','camera_rover.py'),('07-joint.html','joint/joint.ino'),('08-gait.html','crawler/crawler.ino'),('09-simulation.html','simulation/joint.xml'),('09-simulation.html','simulation/joint_probe.py'),('10-learning.html','simulation/search_ramp.py')]
for chapter,asset in examples:
 raw=(root/'content'/chapter).read_text()
 blocks=[unescape(s).strip() for s in re.findall(r'<pre><code[^>]*>([\s\S]*?)</code></pre>',raw)]
 source=(root/'assets/examples'/asset).read_text().strip()
 assert source in blocks, f'Inline source mismatch: {asset}'
print(json.dumps({'embedded_download_links':len(p.assets),'unique_files':len(set(a['data-download'] for a in p.assets)),'inline_source_matches':len(examples),'passed':True}))
