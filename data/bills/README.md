# College bill dataset and forecast

Keep the source CSV in `data/bills/raw/` unchanged. The Bill History page uses the local working copy at `data/bills/processed/CARBengine_bill_history_extended_2019_2025.csv`.

To rebuild the working copy, run this from the `backend/` folder:

```powershell
.\.venv\Scripts\python.exe extend_bill_dataset.py
```

The generator selects 48 monthly rows from January 2019 through December 2022. It detects sustained same-month consumption drops below 45% of the peer median. In the current file, this flags April 2020 through February 2022. It replaces consumption, demand, and bill amounts for those months with seasonally adjusted estimates, tagging them `row_origin=adjusted`. The raw source file retains the original values unchanged.

The generator then estimates January 2023 through December 2025 from the adjusted continuous history and tags those rows `row_origin=synthetic`. The dashboard displays the full 2019–2025 sequence as one Historical values line so the full series can feed the 12-month SARIMAX forecast. The table marks estimated rows as Adjusted estimate or Historical estimate.

The local API prefers the processed file when it exists and falls back to the raw CSV otherwise. Forecast fitting uses the full adjusted 84-month series. Holdout accuracy uses only untouched source rows tagged `historical`; adjusted and extended estimates do not count as observed outcomes. Model artifacts remain under `backend/models/bills/` and are reused when the dataset fingerprint and model version are unchanged.
