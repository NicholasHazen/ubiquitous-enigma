"""Package the local book and its starter files; no network or publishing."""
from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
import shutil,json,argparse
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output',type=Path,default=ROOT/'out',help='Destination directory (default: out/)')
OUT=parser.parse_args().output.resolve()
OUT.mkdir(parents=True,exist_ok=True)
book=ROOT/'dist/robotics-fieldbook.html'
for name in ('robotics-fieldbook.html','robotics-fieldbook-maker-edition.html','robotics-fieldbook-x1-carbon.html'):
    shutil.copyfile(book,OUT/name)
source=OUT/'robotics-fieldbook-x1-source.zip'
with ZipFile(source,'w',ZIP_DEFLATED) as z:
    for folder in ('course','content','archive','src','assets','tools','review','dist','.github'):
        for p in sorted((ROOT/folder).rglob('*')):
            if p.is_file() and '__pycache__' not in p.parts and p.suffix!='.pyc':
                z.write(p,Path('robotics-fieldbook')/p.relative_to(ROOT))
    for name in ('README.md','build.py','package.json','package-lock.json','.gitignore','.gitattributes'):z.write(ROOT/name,Path('robotics-fieldbook')/name)
for name in ('robotics-fieldbook-maker-source.zip','robotics-fieldbook-source.zip'):
    shutil.copyfile(source,OUT/name)
starter=OUT/'robotics-maker-starter-files.zip'
with ZipFile(starter,'w',ZIP_DEFLATED) as z:
    for p in sorted((ROOT/'assets').rglob('*')):
        if p.is_file() and '__pycache__' not in p.parts and p.suffix!='.pyc':z.write(p,p.relative_to(ROOT/'assets'))
    z.writestr('START-HERE.txt', 'Robotics Fieldbook — Home Survey edition\n\nStart with Chapter 01: one room, one object, first image session.\nChapter 02: fit coupons and X1C printing; old rover-deck.stl is for the archived build only.\nChapter 03: survey-learning/survey-learning.zip contains runnable training code. Extract its files into home-rover beside data/.\nChapter 04: survey-hardware/ contains component and drive worksheets.\nChapter 07: survey-templates/run-manifest.yaml records acquisition provenance.\nChapter 09: survey-memory/ contains the offline observation-memory exercise.\n\nThe examples/ directory and most original prints/ files support the archived edition.\nUse the HTML textbook for exact dependencies, commands, frame conventions and acceptance checks.\nNo complete new rover CAD assembly, validated ROS driver integration, physical performance, or household recognition result is claimed.\n')
for p in (source,starter):
    with ZipFile(p) as z:
        assert z.testzip() is None
        assert all('.openai' not in n and '__pycache__' not in n for n in z.namelist())
print(json.dumps({str(p):p.stat().st_size for p in (OUT/'robotics-fieldbook-x1-carbon.html',source,starter)},indent=2))
