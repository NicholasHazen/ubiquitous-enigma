"""Build a CSV from data/<split>/<session>/<absent|present>/<image>.

Example: python make_manifest.py data
The generated paths are relative to data/manifest.csv. Inspect the CSV before use.
"""
import argparse
import csv
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("data", type=Path)
args = parser.parse_args()
rows = []
for split in ("train", "validation", "test", "stress"):
    for session in sorted((args.data / split).glob("*")):
        if not session.is_dir():
            continue
        for label, name in ((0, "absent"), (1, "present")):
            for image in sorted((session / name).glob("*")):
                if image.is_file() and image.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}:
                    rows.append({"path": image.relative_to(args.data).as_posix(), "session": session.name,
                                 "split": split, "label": label})
if not rows:
    parser.exit(2, "No images found; use data/train/A/absent and data/train/A/present, and matching validation/test sessions.\n")
output = args.data / "manifest.csv"
if output.exists():
    parser.exit(2, "manifest.csv exists; preserve or rename it before generating a new dataset revision.\n")
with output.open("w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["path", "session", "split", "label"])
    writer.writeheader()
    writer.writerows(rows)
print(f"Wrote {len(rows)} image records to {output}. Next: python learn.py check {output}")
