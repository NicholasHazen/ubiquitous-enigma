# Train one useful visual distinction

This starter asks whether **one particular object is visible in the whole image**.
It does not return a bounding box, object coordinates, obstacle clearance, or a
motor command. Pick one distinctive toy and keep its identity fixed for the first
experiment. The model may initially fail; the deliverable is a reproducible
comparison and an explanation of observed errors.

## 1. Prepare Python 3.12 on Windows 11

Extract the starter files directly into the `home-rover` project created in
Chapter 01, beside its existing `data/` directory. Reuse the session A images
already there. Open PowerShell in `home-rover` and run:

```powershell
py -3.12 -m venv .venv
$LearnerPython = ".\.venv\Scripts\python.exe"
& $LearnerPython -m pip install -r requirements.txt
& $LearnerPython -m pip install torch==2.7.1 --index-url https://download.pytorch.org/whl/cpu
& $LearnerPython -c "import torch; print(torch.__version__); print(torch.rand(2, 3))"
& $LearnerPython smoke_test.py
```

Python 3.12 must already be installed. These commands avoid changing PowerShell's
execution policy because no activation script is required. In a new terminal,
set `$LearnerPython` again. Linux equivalent: create `.venv` with
`python3.12 -m venv .venv`, then use `.venv/bin/python` wherever the commands show
`& $LearnerPython`.

The fixed CPU recipe was executed with Linux x86-64, Python 3.12.14,
PyTorch 2.7.1+cpu, NumPy 2.3.5, Pillow 12.3.0, and scikit-learn 1.8.0.
Windows installation and the user's hardware have not been executed here.
The smoke test generates disposable colored patterns. Its passing result checks
code paths, not recognition of toys or generalization to a house.

The network is small enough to start on CPU. After the complete experiment works,
use the official PyTorch installation documentation to create a separate CUDA
environment appropriate for the RTX 4090 and its installed NVIDIA driver. Check
`torch.cuda.is_available()` before adding `--device cuda` to training. GPU and CPU
results can differ; record both environments. The GB10 is a separate platform:
do not copy an x86-64 environment or assume its wheels match. Its supported
framework environment needs separate verification.

## 2. Collect sessions with both labels

Create folders in this form:

```text
data/
  train/
    A/absent/     A/present/
    B/absent/     B/present/
    C/absent/     C/present/
    D/absent/     D/present/
  validation/
    E/absent/     E/present/
    F/absent/     F/present/
  test/
    G/absent/     G/present/
    H/absent/     H/present/
```

Each line above denotes two directories, not one literal directory name. Put
JPEG, PNG, or WebP images into the corresponding directories. Convert HEIC photos
to JPEG before using them. Keep original captures elsewhere as the source record.

A session is one capture occasion with a declared camera, lighting, and scene
setup. Change the setup independently between sessions. Within every session,
capture both object-present and object-absent examples across varied viewpoints
and positions. Avoid tying the positive class to one background, one hand, or one
camera angle. Keep neighboring video frames in the same session. Renaming files
or restarting a recording does not make nearly identical observations independent.

An initial target is ten present and ten absent images in each of eight sessions,
160 images total. This is a manageable first collection, not evidence that the
dataset is sufficient for useful household recognition. A phone can supply the
first images before the rover camera arrives; later camera changes are a new
distribution to evaluate. Use scenes where the object remains recognizable after
the experiment resizes the whole image to 64 x 64 pixels.

Choose the session assignment before training. Reserve G and H for final testing;
do not use their errors to select preprocessing, thresholds, or architectures.
An optional later stress set uses new session IDs and intentionally new conditions.

## 3. Build and check the manifest

```powershell
& $LearnerPython make_manifest.py data
& $LearnerPython learn.py check data/manifest.csv
```

The CSV columns are `path,session,split,label`. Paths are relative to its own
directory; label 0 means absent and 1 means present. `manifest-template.csv`
illustrates the schema and refers to example files you must supply. The generator
refuses to overwrite an existing manifest. Preserve the current dataset before
creating a new revision.

Checks reject duplicate paths, identical file bytes, sessions crossing splits,
missing labels, and unreadable images. A malformed CSV or unreadable image names
the offending row/file and a repair. These checks cannot detect every
near-duplicate or tell whether a human label is correct.

Inspect the actual model-sized inputs before fitting:

```powershell
& $LearnerPython learn.py inspect data/manifest.csv --out reports/train-inputs.png
```

Open `reports/train-inputs.png`. The default shows only training images, resized
through the same EXIF/RGB/64x64 pipeline used by the model, then enlarged 2x with
nearest-neighbor pixels for viewing. It does not enhance detail the model lacks.
Can you still identify the target? Do the two labels share backgrounds and
viewpoints? A numbered JSON sidecar retains full image paths. At most twelve
images are shown by default; use `--limit 24` to inspect more. This is an input
inspection, not a feature-attribution or attention visualization.

## 4. Fit a baseline, then a small neural network

```powershell
& $LearnerPython learn.py train data/manifest.csv --kind baseline --out runs/baseline
& $LearnerPython learn.py train data/manifest.csv --kind cnn --out runs/cnn-7 --seed 7 --epochs 30
```

The baseline averages each 4 x 4 block of the 64 x 64 RGB image into a 16 x 16
grid, fits a scaler on training examples only, then fits balanced logistic
regression. This is already model training. The CNN learns filters from scratch:
three convolution/ReLU pairs, global average pooling, and two output logits.
It uses fixed pixel scaling, Adam at 0.001, batch size 16, at most 30 epochs, and
early stopping after five epochs without improved validation loss. The best
validation-loss checkpoint is saved. No external weights are downloaded.

Training reads only train and validation image arrays for fitting and selection.
Dataset integrity checks hash all listed files to freeze the data revision. Model
training never uses the test labels to optimize weights or choose a checkpoint.

Inspect each `validation.json`; for the CNN also inspect `history.csv`. Compare
balanced accuracy, both class recalls, and the actual-row/predicted-column
confusion matrix. An always-absent rule has balanced accuracy 0.5 when both classes
are present, even when its ordinary accuracy looks high. Precision is `null` when
the model never predicts present. No reported score is a guarantee of real-world
reliability; model output scores are uncalibrated.

Every run records the data fingerprint, script hash, versions, seed, preprocessing,
and session assignment in `run.json`. It verifies that a reload reproduces saved
model predictions. Run directories must be new so earlier evidence is preserved.

Produce detailed validation reports and visual error sheets:

```powershell
& $LearnerPython learn.py evaluate data/manifest.csv runs/baseline --split validation --out runs/baseline/validation-details.json
& $LearnerPython learn.py inspect data/manifest.csv --split validation --report runs/baseline/validation-details.json --out reports/baseline-validation.png
& $LearnerPython learn.py evaluate data/manifest.csv runs/cnn-7 --split validation --out runs/cnn-7/validation-details.json
& $LearnerPython learn.py inspect data/manifest.csv --split validation --report runs/cnn-7/validation-details.json --out reports/cnn-validation.png
```

The PNGs show mistakes first, then examples near the 0.5 decision threshold.
Each card shows the human label, prediction, and score for **present**. Compare
the two models on the same images using the full paths in the JSON sidecars.
An image of a failed prediction is evidence for investigation, not an explanation
of why the network failed. Existing reports and sheets are preserved; choose a
new output name if a new review is necessary.

To investigate seed sensitivity, predeclare seeds 7, 19, and 43; train all three in
separate directories and report all three validation outcomes. Use validation for
decisions. A seed is a record of an experimental condition, not a quality knob to
turn until the graph looks good.

## 5. Freeze and evaluate

Before opening the test reports, record which models, preprocessing, and threshold
you intend to compare. The supplied threshold stays 0.5. Then run:

```powershell
& $LearnerPython learn.py evaluate data/manifest.csv runs/baseline --out runs/baseline/test.json
& $LearnerPython learn.py evaluate data/manifest.csv runs/cnn-7 --out runs/cnn-7/test.json
& $LearnerPython learn.py predict runs/cnn-7 data/test/G/present/G_001.jpg
```

Replace the last path with a file that actually exists. Reports include individual
predictions and per-session metrics. Keep all planned comparison results. Once
test errors influence a redesign, those sessions become development data; reserve
fresh sessions for the next final evaluation. A separate output filename does not
turn repeated test-guided tuning into a fresh evaluation.

After the fixed test evaluation, its saved report can drive a test inspection:

```powershell
& $LearnerPython learn.py inspect data/manifest.csv --split test --report runs/cnn-7/test.json --out reports/cnn-test.png
```

Test/stress inspection requires an evaluation report matching that exact split
and dataset revision. Training input previews never include these images by
default. Evaluation reports also record the evaluator's script hash, package
versions, and hashes of the model configuration and weights. If
`same_script_as_training` is false, review the change before treating the result
as the same experiment; a documentation-only edit and a preprocessing change have
different consequences. The field is provenance, not an automatic compatibility
certificate.

For new camera/lighting conditions, collect a separate `shift/` directory with
`stress/I/absent`, `stress/I/present`, and additional new sessions, then run:

```powershell
& $LearnerPython make_manifest.py shift
& $LearnerPython learn.py evaluate shift/manifest.csv runs/cnn-7 --split stress --out runs/cnn-7/stress.json
```

Keep these stress results separate from the original test results. The code rejects
reuse of original session IDs for stress evaluation; you still own the honesty of
the capture procedure.

## If something goes wrong

- Both labels are not present: complete both folders within the named session.
- A capture session crosses splits: restore its assignment; don't relabel its ID
  merely to silence the check.
- Validation looks implausibly perfect: check near-duplicates, background cues,
  and accidental camera/label associations before celebrating the model.
- The CNN loses to the baseline: keep the baseline result, inspect wrong images,
  and check whether the resized object is visible. More layers are not the default
  fix for weak data.
- Training improves while validation worsens: inspect the saved best epoch and
  collect varied training scenes; do not pull test examples into training silently.
- Changed-dataset rejection: preserve the old dataset or train a new run with a
  clearly named revision.

Use agents to explain tensor shapes, audit split logic, and write a narrow data
inspection tool. Personally choose the target, label examples, inspect errors,
and explain why the evaluation supports the next decision.

## Primary references

- https://docs.pytorch.org/tutorials/beginner/basics/intro.html
- https://docs.pytorch.org/tutorials/beginner/basics/optimization_tutorial.html
- https://docs.pytorch.org/tutorials/beginner/basics/saveloadrun_tutorial.html
- https://pytorch.org/get-started/previous-versions/
- https://pytorch.org/get-started/locally/
- https://scikit-learn.org/stable/common_pitfalls.html
- https://scikit-learn.org/stable/modules/cross_validation.html
- https://scikit-learn.org/stable/modules/generated/sklearn.metrics.balanced_accuracy_score.html
