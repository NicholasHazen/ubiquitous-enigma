# Observation memory: an offline Fieldbook exercise

Python 3.10+; no packages, account, GPU, ROS installation, or robot required.
The script stores evidence and queries it. It never commands a robot.

Place `memory.py`, `observations-demo.jsonl`, and this file in
`home-rover/memory/`. Open PowerShell in `home-rover` and reuse the
Chapter 03 environment; this exercise installs no additional packages.

```powershell
$LearnerPython = ".\.venv\Scripts\python.exe"
& $LearnerPython memory/memory.py import memory/demo.sqlite memory/observations-demo.jsonl
& $LearnerPython memory/memory.py recent memory/demo.sqlite --map-id room-a --map-revision v1 --target-id demo-toy --as-of 2026-10-27T19:20:00Z --max-age-minutes 60 --min-score 0.8
```

On Linux, use `.venv/bin/python` in place of `& $LearnerPython` from the same
project root. The Windows PowerShell commands have not been executed here;
the equivalent Python program and relative paths were checked on Linux.

Expected import: three validated/added observations. The query returns demo-01
as a historical candidate sighting and demo-02 followed by demo-01 as recent
evidence. Demo-03 belongs to another map revision and is excluded. Images,
scores, coordinates, and timestamps in the demo are illustrative; the named
image files do not exist. No household recognition performance is claimed.

The negative observation is retained. It does not prove the toy disappeared:
the viewpoint, visibility, and model may differ. A positive image classifier
does not locate the toy; object_position must remain null. The observer_pose
is the robot base pose at image capture time, expressed in the named map.

For your own data, copy observation-template.json, replace every illustrative
value, and write one complete JSON object per line to your JSONL file. Use a
unique observation_id and a model_id identifying the actual saved artifact.
The target_id identifies the trained concept, not a tracked physical instance.
Keep it stable across model revisions only when the target meaning stays the same.
The query requires a target_id so different presence classifiers are not mixed.
The script accepts only target_present/target_absent labels. Score is the
uncalibrated score for the recorded label, not a guaranteed probability or a
localization confidence. The 0.8 demo query threshold is illustrative; choose
your actual display threshold using validation examples.

For a binary output p(target_present), store label target_present and score p
when p >= your classification threshold. For a target_absent decision, store
score 1-p. Keep the classification threshold and model revision in your run
manifest. For example, `learn.py predict` output
`{"label":"absent","score_present":0.12}` becomes memory fields
`{"label":"target_absent","score":0.88}`. A present decision with
`score_present: 0.92` becomes `target_present` with score 0.92. These are
illustrative conversions, not recognition results.

The query threshold filters only `candidate_sightings`: positive records at or
above that score. `recent_observations` retains all matching map/target/time
evidence, including negatives and low scores. Neither list establishes current
truth or calibrates a model score.

All timestamps need a timezone offset. Synchronize machines before capture;
retain original sensor timestamps and recording clock metadata separately.
For replay, explicitly choose an as-of timestamp from the recording. Do not
compare simulated ROS clock seconds with wall-clock UTC. This exercise assumes
the capture-to-map pose association was already established by the recording
pipeline; it does not implement ROS transforms or image synchronization.

The importer validates the complete file before insertion. Reimporting an
identical observation is harmless. Reusing an ID for different evidence fails
and rolls back additions in that import. Map revisions are kept separate;
rebuilding a map can change its coordinates. Register maps explicitly before
combining their poses. Source image references are stored but never fetched
or executed by this program.

Try:
1. Change --max-age-minutes to 10: neither v1 row is recent enough at 19:20.
2. Query --map-revision v2: only demo-03 is returned.
3. Remove Z from a copied timestamp: import must reject ambiguous time.
4. Give object_position a coordinate: import must reject invented localization.
5. Restore the 60-minute window and set --min-score to 0.99: no candidate
   sightings qualify, but both v1 observations remain in recent_observations.

## Finish with five real records

Keep the synthetic demo separate. The course's spatial-memory milestone needs
five observations from your own images and saved model, not merely a plan for an
adapter. Use `memory/observations-own.jsonl` and `memory/own.sqlite`.

With the camera fixed to the rover and motor outputs inhibited, capture five
images across two marked stationary poses in the current checked map. Measure
and document each pose relative to mapped reference surfaces and a checked
heading, using the Chapter 06 `base_link` origin. Record the capture timestamp
and timezone. Once available, an actual timestamped robot pose from the recording
can replace a manually measured marked pose. Unmeasured placeholder coordinates
must not enter this database.

Run the saved classifier for every image, preserve its mistakes, and convert its
label and score as above. Replace every illustrative field in the template. Add
`pose_source` and `pose_uncertainty_note` provenance fields; the importer preserves
such notes. Use a weight-artifact hash as `model_id`, retaining the model's
`run.json`, source revision and classification threshold beside it.

```powershell
& $LearnerPython learn.py predict runs/cnn-7 memory/images/marked-01.jpg
(Get-FileHash runs/cnn-7/weights.pt -Algorithm SHA256).Hash
& $LearnerPython memory/memory.py import memory/own.sqlite memory/observations-own.jsonl
```

Replace the image path with one of your actual files. Reuse the `recent` command
with `memory/own.sqlite`, your real identifiers, and an as-of time/window that
contains all five captures. Confirm that `recent_observations` returns five
records and manually open every referenced image. Image paths are stored without
being fetched or verified; you own the file and pose check. A model that produces
no qualifying positives can still be reported honestly. Do not alter its labels
to force a candidate sighting.

Keep `object_position` null throughout. The demo is a useful early checkpoint;
the full milestone awaits the real images, measured map poses, import and query.
The program does not supply an automatic ROS image/pose join.

This minimal exercise omits object identity tracking, depth uncertainty,
embedding search, LLM integration, and navigation. Those are later adapters,
not capabilities hidden behind this command.

The included `check_memory.py` runs data-integrity checks against synthetic
fixtures using temporary files. With the full source bundle, run
`& $LearnerPython memory/check_memory.py` from `home-rover` after placing the
check script beside `memory.py`. It verifies record
validation, duplicate handling, target/map/time filtering, negative-evidence
retention, transaction rollback, timezone normalization, and the worked
planar transform. It does not test any robot, camera, or recognition model.
