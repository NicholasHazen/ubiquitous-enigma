"""Offline observation memory for the Robotics Fieldbook; no robot commands.

Python 3.10+; standard library only. See README.md for the data contract.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import json
import math
from pathlib import Path
import sqlite3
import sys


SCHEMA = """
CREATE TABLE IF NOT EXISTS observations (
    observation_id TEXT PRIMARY KEY,
    map_id TEXT NOT NULL,
    map_revision TEXT NOT NULL,
    target_id TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    label TEXT NOT NULL,
    score REAL NOT NULL CHECK(score >= 0 AND score <= 1),
    record_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS observations_map_time
ON observations(map_id, map_revision, captured_at);
"""


def instant(value: str) -> datetime:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None or dt.utcoffset() is None:
        raise ValueError("timestamps must include a UTC offset or Z")
    return dt.astimezone(timezone.utc)


def stamp(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="microseconds")


def number(value: object, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{name} must be a finite number")
    if not math.isfinite(value):
        raise ValueError(f"{name} must be a finite number")
    return float(value)


def validate(record: dict) -> dict:
    if not isinstance(record, dict) or record.get("schema_version") != 1:
        raise ValueError("each record needs schema_version 1")
    for key in ("observation_id", "map_id", "map_revision", "target_id", "captured_at",
                "source_run", "model_id", "image_uri", "label"):
        if not isinstance(record.get(key), str) or not record[key].strip():
            raise ValueError(f"{key} must be a non-empty string")
    if record["label"] not in ("target_present", "target_absent"):
        raise ValueError("label must be target_present or target_absent")
    record = dict(record)
    record["captured_at"] = stamp(instant(record["captured_at"]))
    record["score"] = number(record.get("score"), "score")
    if not 0 <= record["score"] <= 1:
        raise ValueError("score must lie between 0 and 1")
    if record.get("score_kind") != "uncalibrated_model_score":
        raise ValueError("this starter expects score_kind uncalibrated_model_score")
    pose = record.get("observer_pose")
    if not isinstance(pose, dict) or pose.get("frame_id") != "map":
        raise ValueError("observer_pose must declare frame_id map")
    record["observer_pose"] = {"frame_id": "map", **{
        key: number(pose.get(key), key) for key in ("x_m", "y_m", "yaw_rad")
    }}
    if "object_position" not in record or record["object_position"] is not None:
        raise ValueError("image-only observations require object_position: null")
    return record


def import_records(database: Path, source: Path) -> dict:
    records = []
    for line_number, line in enumerate(source.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            records.append(validate(json.loads(line)))
        except (ValueError, TypeError, AttributeError) as error:
            raise ValueError(f"line {line_number}: {error}") from error
    added = 0
    with sqlite3.connect(database) as connection:
        connection.executescript(SCHEMA)
        for record in records:
            encoded = json.dumps(record, sort_keys=True, allow_nan=False)
            prior = connection.execute(
                "SELECT record_json FROM observations WHERE observation_id = ?",
                (record["observation_id"],),
            ).fetchone()
            if prior:
                if prior[0] != encoded:
                    raise ValueError("conflicting observation_id: " + record["observation_id"])
                continue
            connection.execute(
                "INSERT INTO observations VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (record["observation_id"], record["map_id"], record["map_revision"],
                 record["target_id"], record["captured_at"], record["label"], record["score"], encoded),
            )
            added += 1
    return {"validated": len(records), "added": added,
            "unchanged_duplicates": len(records) - added}


def recent(database: Path, map_id: str, map_revision: str, target_id: str, as_of: str,
           minutes: float, min_score: float) -> dict:
    if not database.is_file():
        raise ValueError("database does not exist; import a recording first")
    if not math.isfinite(minutes) or minutes < 0:
        raise ValueError("max-age-minutes must be finite and non-negative")
    if not math.isfinite(min_score) or not 0 <= min_score <= 1:
        raise ValueError("min-score must lie between 0 and 1")
    end = instant(as_of)
    start = end - timedelta(minutes=minutes)
    with sqlite3.connect(database) as connection:
        rows = connection.execute(
            "SELECT record_json FROM observations WHERE map_id = ? "
            "AND map_revision = ? AND target_id = ? AND captured_at >= ? AND captured_at <= ? "
            "ORDER BY captured_at DESC, observation_id ASC",
            (map_id, map_revision, target_id, stamp(start), stamp(end)),
        ).fetchall()
    records = [json.loads(row[0]) for row in rows]
    return {
        "meaning": "Historical candidate sightings; no current object position is established.",
        "as_of": stamp(end),
        "map_id": map_id, "map_revision": map_revision, "target_id": target_id,
        "candidate_sightings": [record for record in records
                                if record["label"] == "target_present"
                                and record["score"] >= min_score],
        "recent_observations": records,
    }


def base_point_to_map(x: float, y: float, yaw: float,
                      forward: float, left: float) -> tuple[float, float]:
    """Transform an already measured base-frame point; not an image pixel."""
    return (x + math.cos(yaw) * forward - math.sin(yaw) * left,
            y + math.sin(yaw) * forward + math.cos(yaw) * left)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    ingest = commands.add_parser("import", help="validate and import JSONL observations")
    ingest.add_argument("database", type=Path)
    ingest.add_argument("source", type=Path)
    query = commands.add_parser("recent", help="show candidate sightings and all recent evidence")
    query.add_argument("database", type=Path)
    query.add_argument("--map-id", required=True)
    query.add_argument("--map-revision", required=True)
    query.add_argument("--target-id", required=True, help="which trained concept to retrieve")
    query.add_argument("--as-of", required=True, help="ISO timestamp including timezone")
    query.add_argument("--max-age-minutes", type=float, default=60)
    query.add_argument("--min-score", type=float, default=0.8)
    args = parser.parse_args()
    try:
        if args.command == "import":
            result = import_records(args.database, args.source)
        else:
            result = recent(args.database, args.map_id, args.map_revision, args.target_id, args.as_of,
                            args.max_age_minutes, args.min_score)
        print(json.dumps(result, indent=2, allow_nan=False))
        return 0
    except (OSError, ValueError, TypeError, sqlite3.Error) as error:
        print("error: " + str(error), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
