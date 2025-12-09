# Working Distance–Time Graph (KTV–PSA)

Generate a distance–time (train) graph from the provided infra and schedule CSVs.

## Run
From repo root:
```
python -m backend.scripts.generate_wdtg \
  --schedule backend/app/data/train_schedule.csv \
  --station backend/app/data/station.csv \
  --out-dir backend/outputs/master_charts
```

## Inputs
- `backend/app/data/train_schedule.csv`: timings and cumulative km (used for ordering).
- `backend/app/data/station.csv`: station names/codes for labeling.

## Outputs
- `backend/outputs/master_charts/wdtg.png`: distance–time chart.
- `backend/outputs/master_charts/station_distances.csv`: ordered stations with cumulative km.

