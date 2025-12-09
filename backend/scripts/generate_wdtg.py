"""Generate a Working Distance–Time Graph (WDTG) for the KTV–PSA corridor.

This script reads the infra CSVs already present in `backend/app/data` and
produces:
1) `outputs/master_charts/wdtg.png` – a matplotlib distance–time plot.
2) `outputs/master_charts/station_distances.csv` – ordered stations with
   cumulative km used for the Y‑axis.

Usage (from repo root):
    python -m backend.scripts.generate_wdtg \
        --schedule backend/app/data/train_schedule.csv \
        --station backend/app/data/station.csv \
        --out-dir backend/outputs/master_charts
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Dict, List, Tuple

import matplotlib.pyplot as plt
import pandas as pd

DATA_DIR = Path(__file__).resolve().parents[1] / "app" / "data"
DEFAULT_SCHEDULE = DATA_DIR / "train_schedule.csv"
DEFAULT_STATION = DATA_DIR / "station.csv"
DEFAULT_OUT_DIR = Path(__file__).resolve().parents[2] / "outputs" / "master_charts"


def load_station_names(station_path: Path) -> Dict[str, str]:
    """Return station code -> human-readable name."""
    station_df = pd.read_csv(station_path, dtype=str)
    return dict(
        zip(
            station_df["MAVSTTNCODE"].str.strip(),
            station_df["MAVSTTNNAME"].str.title(),
        )
    )


def pick_reference_train(schedule: pd.DataFrame, direction: str) -> Tuple[str, pd.DataFrame]:
    """Pick the longest coverage train for a direction to derive base ordering."""
    dir_df = schedule[schedule["DIRECTION"] == direction]
    if dir_df.empty:
        raise ValueError(f"No schedule rows found for direction={direction}")

    coverage = dir_df.groupby("TRAINID")["ROUTE_SEQ_NO"].max()
    train_id = coverage.idxmax()
    train_df = dir_df[dir_df["TRAINID"] == train_id].sort_values("ROUTE_SEQ_NO")
    return train_id, train_df


def build_station_distances(schedule: pd.DataFrame) -> pd.DataFrame:
    """Infer ordered stations and cumulative km from the longest DN train path."""
    _, ref = pick_reference_train(schedule, direction="DN")
    ordered = ref[["STTN_CODE", "CUM_DISTANCE"]].drop_duplicates("STTN_CODE")
    ordered = ordered.rename(columns={"STTN_CODE": "station_code", "CUM_DISTANCE": "km"})
    ordered["km"] = ordered["km"].astype(float).round(3)
    ordered.reset_index(drop=True, inplace=True)
    return ordered


def prepare_schedule(schedule_path: Path) -> pd.DataFrame:
    """Load schedule and normalize time columns into seconds and timedeltas."""
    df = pd.read_csv(schedule_path)

    # Prefer planned timings; fall back to PTT when ARRIVAL/DEPARTURE are 0.
    for col, fallback in (("ARRIVAL", "PTTARVL"), ("DEPARTURE", "PTTDPRT")):
        df[col] = df[col].where(df[col].notna() & (df[col] != 0), df.get(fallback))

    df["ARRIVAL_SEC"] = df["ARRIVAL"].astype(float)
    df["DEPARTURE_SEC"] = df["DEPARTURE"].astype(float)
    df["ARRIVAL_TS"] = pd.to_timedelta(df["ARRIVAL_SEC"], unit="s")
    df["DEPARTURE_TS"] = pd.to_timedelta(df["DEPARTURE_SEC"], unit="s")
    return df


def build_segments(schedule: pd.DataFrame, km_map: Dict[str, float]) -> List[Dict]:
    """Create plot-ready segments for each train between consecutive stations."""
    segments: List[Dict] = []
    for train_id, g in schedule.groupby("TRAINID"):
        g = g.sort_values("ROUTE_SEQ_NO")
        for idx in range(len(g) - 1):
            row_a = g.iloc[idx]
            row_b = g.iloc[idx + 1]
            if row_a["STTN_CODE"] not in km_map or row_b["STTN_CODE"] not in km_map:
                continue

            segments.append(
                {
                    "train_id": train_id,
                    "direction": row_a["DIRECTION"],
                    "x": [
                        row_a["DEPARTURE_TS"].total_seconds() / 3600.0,
                        row_b["ARRIVAL_TS"].total_seconds() / 3600.0,
                    ],
                    "y": [km_map[row_a["STTN_CODE"]], km_map[row_b["STTN_CODE"]]],
                }
            )
    return segments


def plot_wdtg(
    segments: List[Dict],
    station_order: pd.DataFrame,
    station_names: Dict[str, str],
    out_path: Path,
) -> None:
    """Render a distance–time chart and save to disk."""
    fig, ax = plt.subplots(figsize=(14, 8))
    colors = {"UP": "#1f77b4", "DN": "#d62728"}
    labels_seen = set()

    for seg in segments:
        label = seg["direction"]
        show_label = label not in labels_seen
        ax.plot(
            seg["x"],
            seg["y"],
            color=colors.get(seg["direction"], "#555"),
            linewidth=1.3,
            alpha=0.8,
            label=label if show_label else None,
        )
        labels_seen.add(label)

    ax.set_xlabel("Time (hours)")
    ax.set_ylabel("Distance (km from KTV)")
    ax.set_title("KTV – PSA Working Distance–Time Graph")

    # Station ticks on Y-axis.
    ax.set_yticks(station_order["km"])
    ax.set_yticklabels(
        [
            f"{code} ({station_names.get(code, code)})"
            for code in station_order["station_code"]
        ]
    )
    ax.grid(True, which="both", linestyle="--", linewidth=0.5, alpha=0.6)
    ax.legend()
    fig.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=200)
    plt.close(fig)


def main(args: argparse.Namespace) -> None:
    schedule = prepare_schedule(Path(args.schedule))
    station_names = load_station_names(Path(args.station))

    station_order = build_station_distances(schedule)
    km_map = dict(zip(station_order["station_code"], station_order["km"]))

    segments = build_segments(schedule, km_map)
    out_dir = Path(args.out_dir)
    plot_wdtg(segments, station_order, station_names, out_dir / "wdtg.png")

    station_order.to_csv(out_dir / "station_distances.csv", index=False)
    print(f"Wrote plot to {out_dir/'wdtg.png'}")
    print(f"Wrote station distances to {out_dir/'station_distances.csv'}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate KTV–PSA WDTG")
    parser.add_argument(
        "--schedule",
        default=str(DEFAULT_SCHEDULE),
        help="Path to train_schedule.csv",
    )
    parser.add_argument(
        "--station",
        default=str(DEFAULT_STATION),
        help="Path to station.csv (for names)",
    )
    parser.add_argument(
        "--out-dir",
        default=str(DEFAULT_OUT_DIR),
        help="Directory for outputs (PNG + CSV)",
    )
    main(parser.parse_args())

