"""Meaningful data-integrity checks; all fixtures are synthetic."""
import copy
import json
import math
from pathlib import Path
import tempfile
from memory import base_point_to_map, import_records, recent, validate


def expect_failure(function, *args):
    try:
        function(*args)
    except ValueError:
        return
    raise AssertionError("invalid input was accepted")


source = Path(__file__).with_name("observations-demo.jsonl")
records = [json.loads(line) for line in source.read_text().splitlines()]
with tempfile.TemporaryDirectory() as temporary:
    folder = Path(temporary)
    db = folder / "memory.sqlite"
    assert import_records(db, source)["added"] == 3
    assert import_records(db, source)["unchanged_duplicates"] == 3
    result = recent(db, "room-a", "v1", "demo-toy", "2026-10-27T19:20:00Z", 60, 0.8)
    assert [r["observation_id"] for r in result["candidate_sightings"]] == ["demo-01"]
    assert [r["observation_id"] for r in result["recent_observations"]] == ["demo-02", "demo-01"]
    assert not recent(db, "room-a", "v1", "demo-toy", "2026-10-27T19:20:00Z", 10, 0.8)["recent_observations"]
    assert len(recent(db, "room-a", "v2", "demo-toy", "2026-10-27T19:20:00Z", 60, 0.8)["candidate_sightings"]) == 1
    assert not recent(db, "room-a", "v1", "demo-toy", "2026-10-27T18:59:00Z", 60, 0.8)["recent_observations"]
    assert not recent(db, "room-a", "v1", "different-target", "2026-10-27T19:20:00Z", 60, 0.8)["recent_observations"]
    for mutate in (
        lambda r: r.update(captured_at="2026-10-27T19:00:00"),
        lambda r: r.update(object_position={"x_m": 1}),
        lambda r: r.update(score=float("nan")),
        lambda r: r.update(score=1.1),
        lambda r: r["observer_pose"].update(x_m=float("inf")),
    ):
        invalid = copy.deepcopy(records[0])
        mutate(invalid)
        expect_failure(validate, invalid)
    fresh = copy.deepcopy(records[0]); fresh["observation_id"] = "must-roll-back"
    conflict = copy.deepcopy(records[0]); conflict["score"] = 0.1
    bad_file = folder / "conflict.jsonl"
    bad_file.write_text(json.dumps(fresh) + "\n" + json.dumps(conflict) + "\n")
    expect_failure(import_records, db, bad_file)
    after = recent(db, "room-a", "v1", "demo-toy", "2026-10-27T19:20:00Z", 60, 0.0)
    assert len(after["recent_observations"]) == 2, "failed import changed evidence"
    equivalent = copy.deepcopy(records[0])
    equivalent["captured_at"] = "2026-10-27T12:00:00-07:00"
    assert validate(equivalent)["captured_at"] == validate(records[0])["captured_at"]
    x, y = base_point_to_map(2, 1, math.pi / 2, 1, 0.2)
    assert math.isclose(x, 1.8) and math.isclose(y, 2.0)
print("PASS: import, duplicate handling, map/time filters, evidence retention, invalid data, rollback, timezone normalization, and transform.")
