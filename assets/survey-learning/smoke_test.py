"""Code checks on generated colored patterns; NOT household recognition evidence.

Run: python smoke_test.py
Creates disposable data, trains both models on CPU, checks reload/evaluation,
and rejects common leakage/data-revision mistakes. No files are downloaded.
"""
import argparse
import csv
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

import learn


def rejected(action, message):
    try:
        action()
    except ValueError as error:
        assert message in str(error), str(error)
    else:
        raise AssertionError("Expected rejection: " + message)


def save_manifest(path, rows):
    with path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["path", "session", "split", "label"])
        writer.writeheader()
        writer.writerows(rows)


with tempfile.TemporaryDirectory(prefix="fieldbook-model-smoke-") as temp:
    root = Path(temp)
    rng = np.random.default_rng(481)
    rows = []
    for session, split in (("A", "train"), ("B", "train"), ("E", "validation"), ("G", "test")):
        for label in (0, 1):
            for i in range(8):
                pixels = rng.integers(0, 35, (64, 64, 3), dtype=np.uint8)
                pixels[:, :, label] += 150
                name = f"{session}-{label}-{i}.png"
                Image.fromarray(pixels).save(root / name)
                rows.append({"path": name, "session": session, "split": split, "label": label})
    manifest = root / "manifest.csv"
    save_manifest(manifest, rows)
    validated, fingerprint = learn.read_manifest(manifest)
    assert len(validated) == 64
    hand = learn.metrics(np.array([0, 0, 1, 1]), np.array([.1, .9, .2, .8]))
    assert hand["confusion_matrix_actual_rows_predicted_columns"] == [[1, 1], [1, 1]]
    assert hand["balanced_accuracy"] == .5
    for kind in ("baseline", "cnn"):
        out = root / kind
        if kind == "cnn":
            import torch
            torch.manual_seed(7)
            initial = {key: value.clone() for key, value in learn.make_cnn().state_dict().items()}
        learn.train(argparse.Namespace(manifest=manifest, out=out, kind=kind, seed=7, epochs=3, batch_size=8, device="cpu"))
        if kind == "cnn":
            fitted = torch.load(out / "weights.pt", weights_only=True)
            assert any(not torch.equal(initial[key], fitted[key]) for key in initial), "Weights did not change during training"
        images, labels = learn.arrays([r for r in validated if r["split"] == "test"])
        first = learn.predict_scores(out, images)
        second = learn.predict_scores(out, images)
        assert first.shape == (16,) and np.isfinite(first).all()
        assert ((first >= 0) & (first <= 1)).all()
        assert np.allclose(first, second)
        report = out / "test.json"
        evaluation = argparse.Namespace(manifest=manifest, run=out, split="test", out=report)
        learn.evaluate(evaluation)
        saved = json.loads(report.read_text())
        assert saved["manifest_sha256"] == fingerprint
        assert len(saved["predictions"]) == 16
        assert sum(map(sum, saved["confusion_matrix_actual_rows_predicted_columns"])) == 16
        assert set(saved["by_session"]) == {"G"}
        assert saved["evaluation"]["same_script_as_training"] is True
        assert saved["evaluation"]["script_sha256"]
        assert saved["evaluation"]["model_run_sha256"]
        assert saved["evaluation"]["weights_sha256"]
        rejected(lambda: learn.evaluate(evaluation), "Report already exists")
    inspected = root / "train-inputs.png"
    learn.inspect_images(argparse.Namespace(manifest=manifest, split="train", report=None, out=inspected, limit=12))
    inspection = json.loads(inspected.with_suffix(".json").read_text())
    assert inspection["split"] == "train"
    assert all(item["session"] in {"A", "B"} for item in inspection["items"])
    with Image.open(inspected) as sheet:
        actual = np.asarray(sheet.crop((12, 80, 140, 208)))
    expected = np.rint(learn.image_array(root / inspection["items"][0]["path"]) * 255).astype(np.uint8)
    expected = np.repeat(np.repeat(expected, 2, axis=0), 2, axis=1)
    assert np.array_equal(actual, expected), "Preview differs from actual model input"
    rejected(lambda: learn.inspect_images(argparse.Namespace(manifest=manifest, split="test", report=None, out=root / "premature-test.png", limit=12)), "only after frozen evaluation")
    learn.inspect_images(argparse.Namespace(manifest=manifest, split="test", report=root / "baseline/test.json", out=root / "test-inputs.png", limit=12))
    rejected(lambda: learn.inspect_images(argparse.Namespace(manifest=manifest, split="validation", report=root / "baseline/test.json", out=root / "wrong-split.png", limit=12)), "must match")
    (root / "short-row.csv").write_text("path,session,split,label\nimage.png,A,train\n")
    rejected(lambda: learn.read_manifest(root / "short-row.csv"), "row 2: 'label' is empty")
    (root / "corrupt.png").write_text("not an image")
    save_manifest(root / "corrupt.csv", [{"path": "corrupt.png", "session": "A", "split": "train", "label": 0}])
    rejected(lambda: learn.read_manifest(root / "corrupt.csv"), "row 2: cannot read image 'corrupt.png'")
    bad = [dict(row) for row in rows]
    bad[-1]["session"] = "A"
    save_manifest(root / "mixed.csv", bad)
    rejected(lambda: learn.read_manifest(root / "mixed.csv"), "crosses splits")
    bad = [dict(row) for row in rows]
    bad[-1]["path"] = bad[0]["path"]
    save_manifest(root / "duplicate.csv", bad)
    rejected(lambda: learn.read_manifest(root / "duplicate.csv"), "Duplicate image path")
    revision = [dict(row) for row in rows]
    revision[0]["label"] = 1
    save_manifest(root / "changed.csv", revision)
    rejected(lambda: learn.evaluate(argparse.Namespace(manifest=root / "changed.csv", run=root / "baseline", split="test", out=root / "changed-report.json")), "Dataset changed")
    generator_root = root / "generator"
    for row in rows:
        label_name = "present" if row["label"] else "absent"
        dest = generator_root / row["split"] / row["session"] / label_name / row["path"]
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes((root / row["path"]).read_bytes())
    subprocess.run([sys.executable, str(Path(__file__).with_name("make_manifest.py")), str(generator_root)], check=True, capture_output=True, text=True)
    generated, _ = learn.read_manifest(generator_root / "manifest.csv")
    assert len(generated) == len(rows)
    stress_rows = []
    for label in (0, 1):
        name = f"stress-{label}.png"
        pixels = rng.integers(0, 80, (64, 64, 3), dtype=np.uint8)
        pixels[:, :, label] += 120
        Image.fromarray(pixels).save(root / name)
        stress_rows.append({"path": name, "session": "I", "split": "stress", "label": label})
    save_manifest(root / "stress.csv", stress_rows)
    learn.evaluate(argparse.Namespace(manifest=root / "stress.csv", run=root / "baseline", split="stress", out=root / "stress-report.json"))
    reused = [{"path": row["path"], "session": "Z", "split": "stress", "label": row["label"]} for row in rows[:16]]
    save_manifest(root / "reused.csv", reused)
    rejected(lambda: learn.evaluate(argparse.Namespace(manifest=root / "reused.csv", run=root / "baseline", split="stress", out=root / "reused-report.json")), "reuses original image bytes")
    print("PASS: synthetic baseline/CNN train, reload, metrics, evaluation provenance, exact-input previews, actionable input errors, and leakage/revision guards. No real-world performance tested.")
