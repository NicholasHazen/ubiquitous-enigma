"""One-object image classification for the Robotics Fieldbook.

This experiment labels whole images. It neither locates objects nor controls motors.
Run `python learn.py --help`. Python 3.12; CPU is the default.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import importlib.metadata
import json
import platform
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

LABELS = {0: "absent", 1: "present"}
SIZE = 64


def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2, allow_nan=False) + "\n")


def read_manifest(filename, require_core=True):
    filename = Path(filename).resolve()
    with filename.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        if not {"path", "session", "split", "label"} <= set(reader.fieldnames or []):
            raise ValueError("CSV needs path,session,split,label columns")
        if len(reader.fieldnames) != len(set(reader.fieldnames)):
            raise ValueError("CSV column names must be unique; check the header row")
        rows = list(reader)
    if not rows:
        raise ValueError("Manifest is empty")
    sessions, paths, contents = {}, set(), {}
    digest = hashlib.sha256()
    for row_number, row in enumerate(rows, start=2):
        if None in row:
            raise ValueError(f"Manifest row {row_number} has extra values; check its commas and CSV quoting")
        for key in ("path", "session", "split", "label"):
            if row[key] is None or not row[key].strip():
                raise ValueError(f"Manifest row {row_number}: '{key}' is empty; fill all four required columns")
            row[key] = row[key].strip()
        if not row["session"]:
            raise ValueError("Every image needs a capture-session ID")
        if row["split"] not in {"train", "validation", "test", "stress"}:
            raise ValueError("split must be train, validation, test, or stress")
        if row["label"] not in {"0", "1"}:
            raise ValueError("label must be 0=absent or 1=present")
        row["label"] = int(row["label"])
        if sessions.setdefault(row["session"], row["split"]) != row["split"]:
            raise ValueError("Capture session crosses splits: " + row["session"])
        relative = Path(row["path"])
        path = (filename.parent / relative).resolve()
        if relative.is_absolute() or not path.is_relative_to(filename.parent):
            raise ValueError("Image paths must stay inside the manifest directory")
        if path in paths:
            raise ValueError("Duplicate image path: " + row["path"])
        paths.add(path)
        try:
            raw_hash = hashlib.sha256(path.read_bytes()).hexdigest()
            with Image.open(path) as image:
                image.verify()
            with Image.open(path) as image:
                image.load()
        except (OSError, ValueError) as error:
            raise ValueError(
                f"Manifest row {row_number}: cannot read image '{row['path']}'. "
                "Check the path and export a valid JPEG, PNG, or WebP image. "
                f"Details: {error}"
            ) from error
        if raw_hash in contents:
            raise ValueError("Duplicate image bytes: " + row["path"] + " and " + contents[raw_hash])
        contents[raw_hash] = row["path"]
        row["sha256"] = raw_hash
        digest.update(json.dumps([row["path"], row["session"], row["split"], row["label"], raw_hash]).encode())
        row["absolute"] = path
    for session in sessions:
        if {r["label"] for r in rows if r["session"] == session} != {0, 1}:
            raise ValueError("Each capture session needs both labels: " + session)
    if require_core:
        for split in ("train", "validation", "test"):
            members = [r for r in rows if r["split"] == split]
            if {r["label"] for r in members} != {0, 1}:
                raise ValueError(split + " must contain both labels")
    return rows, digest.hexdigest()


def image_array(path, size=SIZE):
    with Image.open(path) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        image = image.resize((size, size), Image.Resampling.BILINEAR)
        return np.asarray(image, dtype=np.float32) / 255.0


def arrays(rows):
    return np.stack([image_array(r["absolute"]) for r in rows]), np.array([r["label"] for r in rows])


def features(images):
    # Fixed 4x4 average pooling: 64x64 RGB -> 16x16 RGB -> 768 features.
    return images.reshape(-1, 16, 4, 16, 4, 3).mean(axis=(2, 4)).reshape(-1, 768)


def metrics(labels, probabilities):
    predicted = (np.asarray(probabilities) >= 0.5).astype(int)
    matrix = np.zeros((2, 2), dtype=int)
    for actual, prediction in zip(labels, predicted):
        matrix[int(actual), int(prediction)] += 1
    recalls = [float(matrix[i, i] / matrix[i].sum()) if matrix[i].sum() else None for i in range(2)]
    precision = float(matrix[1, 1] / matrix[:, 1].sum()) if matrix[:, 1].sum() else None
    return {
        "examples": len(labels), "threshold": 0.5,
        "confusion_matrix_actual_rows_predicted_columns": matrix.tolist(),
        "label_order": ["absent", "present"],
        "recall_absent": recalls[0], "recall_present": recalls[1],
        "precision_present": precision,
        "balanced_accuracy": float(np.mean(recalls)) if None not in recalls else None,
        "accuracy": float((predicted == labels).mean()),
        "score_note": "Scores are uncalibrated; they are not guaranteed probabilities of correctness.",
    }


def make_cnn():
    import torch.nn as nn
    return nn.Sequential(
        nn.Conv2d(3, 16, 3, stride=2, padding=1), nn.ReLU(),
        nn.Conv2d(16, 32, 3, stride=2, padding=1), nn.ReLU(),
        nn.Conv2d(32, 32, 3, stride=2, padding=1), nn.ReLU(),
        nn.AdaptiveAvgPool2d(1), nn.Flatten(), nn.Linear(32, 2),
    )


def cnn_scores(model, images, device):
    import torch
    model.eval()
    with torch.inference_mode():
        x = torch.from_numpy(images.transpose(0, 3, 1, 2).copy()).to(device)
        return model(x).softmax(1)[:, 1].cpu().numpy()


def train(args):
    rows, fingerprint = read_manifest(args.manifest)
    if args.epochs < 1 or args.epochs > 200 or args.batch_size < 1:
        raise ValueError("Use 1..200 epochs and a positive batch size")
    output = Path(args.out)
    if output.exists() and any(output.iterdir()):
        raise ValueError("Run directory is not empty; choose a new --out")
    output.mkdir(parents=True, exist_ok=True)
    train_rows = [r for r in rows if r["split"] == "train"]
    val_rows = [r for r in rows if r["split"] == "validation"]
    x, y = arrays(train_rows)
    vx, vy = arrays(val_rows)
    versions = {name: importlib.metadata.version(name) for name in ("numpy", "Pillow", "scikit-learn")}
    config = {
        "kind": args.kind, "seed": args.seed, "image_size": SIZE, "threshold": 0.5,
        "manifest_sha256": fingerprint, "script_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "python": platform.python_version(), "versions": versions, "labels": LABELS,
        "sessions": {split: sorted({r["session"] for r in rows if r["split"] == split}) for split in ("train", "validation", "test")},
        "source_image_sha256": [r["sha256"] for r in rows],
        "preprocessing": "EXIF transpose, RGB, bilinear resize to 64x64, divide by 255; no test-fitted preprocessing",
    }
    if args.kind == "baseline":
        from sklearn.linear_model import LogisticRegression
        from sklearn.preprocessing import StandardScaler
        scaler = StandardScaler().fit(features(x))
        classifier = LogisticRegression(C=1.0, class_weight="balanced", max_iter=1000, random_state=args.seed)
        classifier.fit(scaler.transform(features(x)), y)
        probability = classifier.predict_proba(scaler.transform(features(vx)))[:, 1]
        np.savez(output / "weights.npz", mean=scaler.mean_, scale=scaler.scale_, coefficient=classifier.coef_, intercept=classifier.intercept_)
        config.update({"C": 1.0, "max_iter": 1000, "training_only_scaler": True})
    else:
        import torch
        import torch.nn.functional as F
        versions["torch"] = str(torch.__version__)
        torch.manual_seed(args.seed)
        np.random.seed(args.seed)
        torch.set_num_threads(min(4, torch.get_num_threads()))
        if args.device == "cuda" and not torch.cuda.is_available():
            raise ValueError("CUDA was requested but is unavailable; verify the installation or use --device cpu")
        device = torch.device(args.device)
        model = make_cnn().to(device)
        optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
        tensor_x = torch.from_numpy(x.transpose(0, 3, 1, 2).copy())
        tensor_y = torch.from_numpy(y).long()
        val_x = torch.from_numpy(vx.transpose(0, 3, 1, 2).copy()).to(device)
        val_y = torch.from_numpy(vy).long().to(device)
        # Only training counts determine class weights.
        weights = torch.tensor(len(y) / (2 * np.bincount(y, minlength=2)), dtype=torch.float32, device=device)
        generator = torch.Generator().manual_seed(args.seed)
        best_loss, best_state, stale, history = float("inf"), None, 0, []
        for epoch in range(1, args.epochs + 1):
            model.train()
            permutation = torch.randperm(len(y), generator=generator)
            total = 0.0
            for indices in permutation.split(args.batch_size):
                bx, by = tensor_x[indices].to(device), tensor_y[indices].to(device)
                optimizer.zero_grad()
                loss = F.cross_entropy(model(bx), by, weight=weights)
                loss.backward()
                optimizer.step()
                total += loss.item() * len(indices)
            model.eval()
            with torch.inference_mode():
                logits = model(val_x)
                val_loss = F.cross_entropy(logits, val_y).item()
                probability = logits.softmax(1)[:, 1].cpu().numpy()
            if not np.isfinite(total) or not np.isfinite(val_loss):
                raise ValueError("Non-finite loss; inspect inputs and training settings")
            history.append({"epoch": epoch, "train_loss": total / len(y), "validation_loss": val_loss,
                            "validation_balanced_accuracy": metrics(vy, probability)["balanced_accuracy"]})
            if val_loss < best_loss - 1e-6:
                best_loss, stale = val_loss, 0
                best_state = {key: value.detach().cpu().clone() for key, value in model.state_dict().items()}
                config["best_epoch"] = epoch
            else:
                stale += 1
            if stale >= 5:
                break
        torch.save(best_state, output / "weights.pt")
        model.load_state_dict(best_state)
        probability = cnn_scores(model, vx, device)
        config.update({"device": args.device, "epochs_requested": args.epochs, "epochs_run": len(history),
                       "batch_size": args.batch_size, "learning_rate": 0.001, "patience": 5,
                       "selection": "lowest validation cross-entropy; no test metrics during training"})
        with (output / "history.csv").open("w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=list(history[0]))
            writer.writeheader()
            writer.writerows(history)
    write_json(output / "run.json", config)
    report = metrics(vy, probability)
    write_json(output / "validation.json", report)
    reloaded = predict_scores(output, vx)
    if not np.allclose(reloaded, probability, atol=1e-5, rtol=1e-5):
        raise RuntimeError("Saved-model reload prediction mismatch")
    print(json.dumps({"run": str(output), "validation": report, "reload_check": "passed"}, indent=2))


def predict_scores(folder, images):
    folder = Path(folder)
    config = json.loads((folder / "run.json").read_text())
    if config["image_size"] != SIZE:
        raise ValueError("Unsupported image preprocessing version")
    if config["kind"] == "baseline":
        with np.load(folder / "weights.npz", allow_pickle=False) as saved:
            z = (features(images) - saved["mean"]) / saved["scale"]
            logits = (z @ saved["coefficient"].T + saved["intercept"]).ravel()
            return 1.0 / (1.0 + np.exp(-np.clip(logits, -80, 80)))
    if config["kind"] != "cnn":
        raise ValueError("Unknown saved model kind")
    import torch
    torch.set_num_threads(min(4, torch.get_num_threads()))
    model = make_cnn()
    model.load_state_dict(torch.load(folder / "weights.pt", map_location="cpu", weights_only=True))
    return cnn_scores(model, images, torch.device("cpu"))


def evaluate(args):
    output = Path(args.out)
    if output.exists():
        raise ValueError("Report already exists; preserve it and freeze a new evaluation deliberately")
    rows, fingerprint = read_manifest(args.manifest, require_core=args.split != "stress")
    config = json.loads((Path(args.run) / "run.json").read_text())
    if args.split != "stress" and config["manifest_sha256"] != fingerprint:
        raise ValueError("Dataset changed since training; restore it or train a new recorded run")
    selected = [r for r in rows if r["split"] == args.split]
    if not selected or {r["label"] for r in selected} != {0, 1}:
        raise ValueError("Evaluation split must contain both labels")
    if args.split == "stress":
        old_sessions = {s for group in config["sessions"].values() for s in group}
        if any(r["session"] in old_sessions for r in selected):
            raise ValueError("Stress evaluation needs new capture-session IDs")
        if any(r["sha256"] in set(config["source_image_sha256"]) for r in selected):
            raise ValueError("Stress evaluation reuses original image bytes")
    x, y = arrays(selected)
    probability = predict_scores(args.run, x)
    report = metrics(y, probability)
    evaluator_hash = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    weights_file = Path(args.run) / ("weights.npz" if config["kind"] == "baseline" else "weights.pt")
    evaluation_versions = {name: importlib.metadata.version(name) for name in ("numpy", "Pillow", "scikit-learn")}
    if config["kind"] == "cnn":
        evaluation_versions["torch"] = importlib.metadata.version("torch")
    report.update({"split": args.split, "manifest_sha256": fingerprint, "model_run": str(args.run),
                  "evaluation": {"script_sha256": evaluator_hash,
                                 "same_script_as_training": evaluator_hash == config["script_sha256"],
                                 "python": platform.python_version(), "versions": evaluation_versions,
                                 "model_run_sha256": hashlib.sha256((Path(args.run) / "run.json").read_bytes()).hexdigest(),
                                 "weights_sha256": hashlib.sha256(weights_file.read_bytes()).hexdigest()},
                  "by_session": {}, "predictions": []})
    for session in sorted({r["session"] for r in selected}):
        mask = np.array([r["session"] == session for r in selected])
        report["by_session"][session] = metrics(y[mask], probability[mask])
    for row, score in zip(selected, probability):
        report["predictions"].append({"path": row["path"], "session": row["session"], "actual": row["label"], "score_present": float(score), "predicted": int(score >= 0.5)})
    output.parent.mkdir(parents=True, exist_ok=True)
    write_json(output, report)
    print(json.dumps({"report": str(output), **{k: v for k, v in report.items() if k not in {"predictions", "by_session"}}}, indent=2))


def inspect_images(args):
    """Render the exact resized inputs; never expose test images by default."""
    if not 1 <= args.limit <= 24:
        raise ValueError("Use an inspection limit from 1 to 24")
    if args.split in {"test", "stress"} and not args.report:
        raise ValueError("Inspect test/stress images only after frozen evaluation: supply its saved --report")
    output = Path(args.out)
    metadata_path = output.with_suffix(".json")
    if output.suffix.lower() != ".png":
        raise ValueError("Inspection output must end in .png")
    if output.exists() or metadata_path.exists():
        raise ValueError("Inspection output already exists; choose a new --out to preserve it")
    rows, fingerprint = read_manifest(args.manifest, require_core=False)
    selected = [row for row in rows if row["split"] == args.split]
    if not selected:
        raise ValueError("No images in the selected inspection split")
    predictions = {}
    if args.report:
        report = json.loads(Path(args.report).read_text())
        if report.get("split") != args.split or report.get("manifest_sha256") != fingerprint:
            raise ValueError("Inspection report must match this manifest revision and selected split")
        entries = report.get("predictions")
        if not isinstance(entries, list) or any(not isinstance(p, dict) or not isinstance(p.get("path"), str) for p in entries):
            raise ValueError("Inspection needs an evaluate report with per-image predictions")
        predictions = {p["path"]: p for p in entries}
        if len(predictions) != len(entries):
            raise ValueError("Inspection report repeats an image path")
        for row in selected:
            prediction = predictions.get(row["path"])
            if not prediction or prediction.get("actual") != row["label"]:
                raise ValueError("Inspection report is missing or disagrees with image: " + row["path"])
            score = prediction.get("score_present")
            if prediction.get("predicted") not in (0, 1) or not isinstance(score, (int, float)) or not np.isfinite(score):
                raise ValueError("Inspection report has an invalid prediction for: " + row["path"])
            if not 0 <= prediction["score_present"] <= 1:
                raise ValueError("Inspection report score is outside 0..1: " + row["path"])
        # Mistakes first, then examples nearest the fixed decision threshold.
        selected.sort(key=lambda row: (
            predictions[row["path"]]["predicted"] == row["label"],
            abs(predictions[row["path"]]["score_present"] - 0.5), row["path"]))
    selected = selected[:args.limit]
    columns, cell_width, cell_height, header = 4, 218, 216, 80
    columns = min(columns, max(2, len(selected)))
    sheet = Image.new("RGB", (columns * cell_width, header + ((len(selected) + columns - 1) // columns) * cell_height), "#f7f5ef")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=14)
    draw.text((12, 10), f"MODEL INPUTS / {args.split} / {len(selected)} shown", fill="#202c2b", font=font)
    draw.text((12, 32), "64 x 64 input, enlarged 2x without smoothing", fill="#202c2b", font=font)
    draw.text((12, 53), "Mistakes first; scores are uncalibrated" if predictions else "Actual labels; no model predictions", fill="#202c2b", font=font)
    items = []
    for index, row in enumerate(selected):
        left = (index % columns) * cell_width + 12
        top = header + (index // columns) * cell_height
        pixels = np.rint(image_array(row["absolute"]) * 255).astype(np.uint8)
        thumb = Image.fromarray(pixels).resize((128, 128), Image.Resampling.NEAREST)
        sheet.paste(thumb, (left, top))
        draw.text((left, top + 132), f"{index + 1}. {Path(row['path']).name[:24]}", fill="#202c2b", font=font)
        draw.text((left, top + 150), f"Actual: {LABELS[row['label']]} / {row['session'][:12]}", fill="#202c2b", font=font)
        item = {"index": index + 1, "path": row["path"], "session": row["session"], "actual": row["label"]}
        if predictions:
            prediction = predictions[row["path"]]
            color = "#a13d23" if prediction["predicted"] != row["label"] else "#275f4d"
            draw.text((left, top + 168), f"Pred: {LABELS[prediction['predicted']]}", fill=color, font=font)
            draw.text((left, top + 186), f"Score(present): {prediction['score_present']:.3f}", fill=color, font=font)
            item.update({"predicted": prediction["predicted"], "score_present": prediction["score_present"]})
        items.append(item)
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output)
    write_json(metadata_path, {"split": args.split, "manifest_sha256": fingerprint,
                              "source_report": str(args.report) if args.report else None,
                              "input_size": SIZE, "display_scale": 2, "items": items})
    print(json.dumps({"inspection": str(output), "image_index": str(metadata_path), "shown": len(items)}, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    subs = parser.add_subparsers(dest="command", required=True)
    check = subs.add_parser("check", help="Validate images, labels, duplicates, and session splits")
    check.add_argument("manifest")
    fit = subs.add_parser("train", help="Fit using train; choose checkpoints using validation")
    fit.add_argument("manifest")
    fit.add_argument("--kind", choices=["baseline", "cnn"], required=True)
    fit.add_argument("--out", required=True)
    fit.add_argument("--seed", type=int, default=7)
    fit.add_argument("--epochs", type=int, default=30)
    fit.add_argument("--batch-size", type=int, default=16)
    fit.add_argument("--device", choices=["cpu", "cuda"], default="cpu")
    score = subs.add_parser("evaluate", help="Evaluate a frozen run; outputs include per-session errors")
    score.add_argument("manifest")
    score.add_argument("run")
    score.add_argument("--split", choices=["validation", "test", "stress"], default="test")
    score.add_argument("--out", required=True)
    predict = subs.add_parser("predict", help="Score a single image using saved weights")
    predict.add_argument("run")
    predict.add_argument("image")
    inspect = subs.add_parser("inspect", help="Show model-sized inputs; optionally display saved evaluation predictions")
    inspect.add_argument("manifest")
    inspect.add_argument("--split", choices=["train", "validation", "test", "stress"], default="train")
    inspect.add_argument("--report", help="Saved evaluate report for this same dataset and split")
    inspect.add_argument("--out", required=True, help="New local PNG filename; a JSON image index is also saved")
    inspect.add_argument("--limit", type=int, default=12)
    args = parser.parse_args()
    try:
        if args.command == "check":
            rows, digest = read_manifest(args.manifest)
            summary = {split: {"images": sum(r["split"] == split for r in rows), "sessions": sorted({r["session"] for r in rows if r["split"] == split})} for split in ("train", "validation", "test", "stress")}
            print(json.dumps({"manifest_sha256": digest, "splits": summary, "check": "passed"}, indent=2))
        elif args.command == "train":
            train(args)
        elif args.command == "evaluate":
            evaluate(args)
        elif args.command == "inspect":
            inspect_images(args)
        else:
            p = float(predict_scores(args.run, image_array(args.image)[None])[0])
            print(json.dumps({"label": LABELS[int(p >= 0.5)], "score_present": p, "threshold": 0.5, "score_is_calibrated": False}))
    except (ValueError, OSError, ImportError) as error:
        parser.exit(2, "Experiment stopped: " + str(error) + "\n")


if __name__ == "__main__":
    main()
