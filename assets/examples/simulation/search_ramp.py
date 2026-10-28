"""Search command rise times; evaluate the chosen setting on unseen link masses."""
import csv
import json
import random
from joint_probe import run_trial, save_trace

SEED = 7
TRAIN_MASS_KG = 0.10
HELD_OUT_MASSES_KG = (0.08, 0.12)  # decided before searching


def main():
    rng = random.Random(SEED)
    candidates = [0.0] + [rng.uniform(0.02, 0.60) for _ in range(24)]
    results = []
    for ramp in candidates:
        metrics, _ = run_trial(ramp, TRAIN_MASS_KG)
        results.append({"ramp_s": ramp, **metrics})
    best = min(results, key=lambda item: item["cost"])
    with open("search-results.csv", "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(results[0]))
        writer.writeheader()
        writer.writerows(results)
    evaluations = []
    for mass in HELD_OUT_MASSES_KG:
        baseline, _ = run_trial(0.0, mass)
        chosen, _ = run_trial(best["ramp_s"], mass)
        evaluations.append({"mass_kg": mass, "baseline": baseline, "chosen": chosen})
        print(f"Held-out {mass:.2f}kg: baseline {baseline['cost']:.6f}; chosen {chosen['cost']:.6f}")
    _, rows = run_trial(best["ramp_s"], TRAIN_MASS_KG)
    save_trace("chosen", rows)
    with open("search-summary.json", "w") as f:
        json.dump({"seed": SEED, "train_mass_kg": TRAIN_MASS_KG,
                   "baseline": results[0], "chosen": best,
                   "held_out": evaluations}, f, indent=2)
    print(f"Baseline cost: {results[0]['cost']:.6f}")
    print(f"Chosen ramp: {best['ramp_s']:.6f}s; cost: {best['cost']:.6f}")
    print("Wrote search-results.csv, search-summary.json, chosen.csv, chosen.svg")


if __name__ == "__main__":
    main()
