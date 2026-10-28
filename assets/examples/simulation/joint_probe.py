"""Fieldbook joint experiment. Writes CSV and SVG; never connects to hardware."""
import argparse
import csv
import math
from pathlib import Path
import xml.etree.ElementTree as ET

import mujoco

HERE = Path(__file__).resolve().parent
TARGET = 0.4  # radians, about 23 degrees
SPEED_WEIGHT_S = 0.03  # preference, not a measured physical constant


def run_trial(ramp_s=0.0, mass_kg=0.10, target_rad=TARGET):
    if not (0 <= ramp_s <= 1 and 0.02 <= mass_kg <= 0.5 and 0 < target_rad <= 0.5):
        raise ValueError("Use ramp 0..1 s, mass 0.02..0.5 kg, and target above 0 through 0.5 rad")
    xml = ET.parse(HERE / "joint.xml")
    xml.find(".//geom[@name='link_shape']").set("mass", str(mass_kg))
    model = mujoco.MjModel.from_xml_string(ET.tostring(xml.getroot(), encoding="unicode"))
    data = mujoco.MjData(model)  # a fresh, stationary joint for every trial
    rows = []
    command = 0.0
    for step in range(1000):  # 2 simulated seconds; physics at 500 Hz
        desired = target_rad if data.time >= 0.2 - 1e-9 else 0.0
        if step % 10 == 0:  # update command at 50 Hz
            fraction = 1.0 if ramp_s == 0 else max(0.0, min(1.0, (data.time - 0.2) / ramp_s))
            command = desired * fraction
        data.ctrl[0] = command
        mujoco.mj_step(model, data)
        rows.append((float(data.time), desired, command,
                     float(data.qpos[0]), float(data.qvel[0])))
    rms_error = math.sqrt(sum((r[1] - r[3]) ** 2 for r in rows) / len(rows))
    peak_speed = max(abs(r[4]) for r in rows)
    # A teaching objective: angle error plus a preference for lower peak speed.
    cost = rms_error + SPEED_WEIGHT_S * peak_speed
    return {"cost": cost, "rms_error_rad": rms_error,
            "peak_speed_rad_s": peak_speed, "final_rad": rows[-1][3]}, rows


def save_trace(stem, rows):
    stem = Path(stem)
    with stem.with_suffix(".csv").open("w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["time_s", "desired_rad", "command_rad", "position_rad", "speed_rad_s"])
        writer.writerows(rows)
    lines = []
    for column, color in ((1, "#a65b35"), (2, "#8b7c25"), (3, "#205e4a")):
        points = " ".join(f"{60+r[0]*310:.2f},{260-r[column]*400:.2f}" for r in rows[::5])
        lines.append(f'<polyline points="{points}" fill="none" stroke="{color}" stroke-width="2"/>')
    svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 740 320" role="img">'
    svg += '<title>Joint response: desired, commanded, and measured angle</title>'
    svg += '<rect width="740" height="320" fill="#faf7ed"/>'
    svg += '<path d="M60 40V260H680" stroke="#555" fill="none"/>'
    svg += '<g font-family="sans-serif" font-size="13" fill="#333">'
    svg += '<text x="60" y="24">Joint angle / radians</text><text x="43" y="264">0</text>'
    svg += '<text x="30" y="104">0.4</text><text x="60" y="282">0 s</text><text x="660" y="282">2 s</text>'
    svg += '<text x="75" y="307" fill="#a65b35">Desired</text><text x="170" y="307" fill="#8b7c25">Command</text>'
    svg += '<text x="280" y="307" fill="#205e4a">Measured in simulation</text></g>'
    svg += "".join(lines) + "</svg>"
    stem.with_suffix(".svg").write_text(svg, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ramp", type=float, default=0.0, help="command rise time in seconds")
    parser.add_argument("--mass", type=float, default=0.10, help="simulated link mass in kg")
    parser.add_argument("--target-deg", type=float, default=math.degrees(TARGET), help="requested angle change in degrees")
    parser.add_argument("--out", default="baseline", help="output filename stem")
    args = parser.parse_args()
    metrics, rows = run_trial(args.ramp, args.mass, math.radians(args.target_deg))
    save_trace(args.out, rows)
    print(f"MuJoCo {mujoco.__version__}; ramp={args.ramp:.3f}s; mass={args.mass:.3f}kg")
    for name, value in metrics.items():
        print(f"{name}: {value:.6f}")
    print(f"Wrote {args.out}.csv and {args.out}.svg")


if __name__ == "__main__":
    main()
