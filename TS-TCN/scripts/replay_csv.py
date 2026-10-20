"""Replay a CSV through the TS-TCN service and score it against the labels.

The detector on its own, with no fusion engine and no other models: every row
is POSTed to /api/v1/classify in file order, and the answers are compared with
the isFraud column.

    python scripts/replay_csv.py                        # against localhost:8003
    python scripts/replay_csv.py --api <deployed-url>   # against the cloud
    python scripts/replay_csv.py --csv other.csv --limit 2000

Order is the whole point. The detector holds the last 32 transactions it has
seen and classifies the newest against them, so a shuffled file measures a
different model than the one that was trained -- the window stops being a
window. Rows are sent exactly as they appear; do not sort or sample the file.

The first 31 calls answer 503 (the window is not full yet). Those rows are
counted as warm-up and excluded from the metrics, which is also what Stage 3
did when it skipped the first 32 rows of the stream.
"""
import argparse
import csv
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CSV = ROOT / "data/demo/tstcn_replay_6000.csv"
THRESHOLD = 0.4545          # Stage 6 Best-F1 point; see outputs/stage6_evaluation
WINDOW = 32

FIELDS = ("nameOrig", "step", "type", "amount",
          "oldbalanceOrg", "newbalanceOrig", "oldbalanceDest", "newbalanceDest")


def post(url: str, payload: dict, timeout: float):
    body = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=body, method="POST",
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, None
    except Exception as e:                                    # noqa: BLE001
        return 0, str(e)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="http://127.0.0.1:8003")
    ap.add_argument("--csv", default=str(DEFAULT_CSV))
    ap.add_argument("--limit", type=int, default=0, help="stop after N rows")
    ap.add_argument("--threshold", type=float, default=THRESHOLD)
    ap.add_argument("--timeout", type=float, default=60.0)
    args = ap.parse_args()

    path = Path(args.csv)
    if not path.exists():
        print(f"No such file: {path}")
        return 1

    rows = list(csv.DictReader(path.open(encoding="utf-8")))
    if args.limit:
        rows = rows[:args.limit]
    print(f"{len(rows)} rows from {path.name}")
    print(f"POSTing to {args.api}/api/v1/classify in file order\n")

    url = f"{args.api}/api/v1/classify"
    tp = fp = fn = tn = warming = failed = 0
    latencies, started = [], time.perf_counter()

    for i, row in enumerate(rows, 1):
        payload = {k: row[k] for k in FIELDS}
        payload["step"] = int(float(payload["step"]))
        for k in ("amount", "oldbalanceOrg", "newbalanceOrig",
                  "oldbalanceDest", "newbalanceDest"):
            payload[k] = float(payload[k])

        t0 = time.perf_counter()
        status, data = post(url, payload, args.timeout)
        latencies.append((time.perf_counter() - t0) * 1000)

        if status == 503:
            warming += 1
        elif status == 200 and isinstance(data, dict):
            flagged = data["temporal_risk_score"] >= args.threshold
            fraud = int(float(row["isFraud"])) == 1
            if flagged and fraud:      tp += 1
            elif flagged:              fp += 1
            elif fraud:                fn += 1
            else:                      tn += 1
        else:
            failed += 1
            if failed <= 3:
                print(f"  row {i}: HTTP {status} {data if isinstance(data, str) else ''}")

        if i % 500 == 0:
            print(f"  {i}/{len(rows)}  scored={tp+fp+fn+tn}  warming={warming}"
                  f"  failed={failed}")

    elapsed = time.perf_counter() - started
    scored = tp + fp + fn + tn
    print(f"\n--- replay finished in {elapsed:.0f}s ---")
    print(f"  warm-up rows (503) : {warming}   (expected {WINDOW - 1} on a cold service)")
    if failed:
        print(f"  failed rows        : {failed}")
    if not scored:
        print("  nothing was scored - is the service reachable?")
        return 1

    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    lat = sorted(latencies)

    print(f"  scored             : {scored}   frauds {tp + fn}")
    print(f"\n  threshold {args.threshold}")
    print(f"    TP {tp:>5}   FP {fp:>5}   FN {fn:>5}   TN {tn:>6}")
    print(f"    precision {precision:.4f}")
    print(f"    recall    {recall:.4f}")
    print(f"    F1        {f1:.4f}")
    print(f"\n  latency per call: median {lat[len(lat)//2]:.0f} ms   "
          f"p95 {lat[int(len(lat)*0.95)]:.0f} ms")
    return 0


if __name__ == "__main__":
    sys.exit(main())
