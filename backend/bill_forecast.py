from __future__ import annotations

import csv
import hashlib
import math
import os
from collections import Counter
from datetime import date, datetime
from pathlib import Path
from typing import Any

from model_store import load_or_fit_sarimax, read_series_performance, write_series_performance

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "bills" / "raw"
PROCESSED_DIR = ROOT / "data" / "bills" / "processed"
EXTENDED_DATASET = PROCESSED_DIR / "CARBengine_bill_history_extended_2019_2025.csv"
REQUIRED_COLUMNS = {
    "timestamp",
    "billing_month",
    "meter_id",
    "consumption_kwh",
    "max_demand_kva",
    "bill_amount_inr",
    "data_type",
}
MIN_MONTHS = 24
MIN_LIMITED_MONTHS = 8
FORECAST_MONTHS = 12


def _dataset_path() -> Path | None:
    configured = os.getenv("BILLS_DATASET_PATH", "").strip()
    if configured:
        path = Path(configured)
        return path if path.is_absolute() else ROOT / path

    if EXTENDED_DATASET.exists():
        return EXTENDED_DATASET

    default = RAW_DIR / "CARBengine_dataset_2019_2025.csv"
    if default.exists():
        return default

    candidates = sorted(RAW_DIR.glob("*.csv")) if RAW_DIR.exists() else []
    return candidates[0] if len(candidates) == 1 else None


def _parse_month(value: str, timestamp: str) -> date | None:
    try:
        month = datetime.strptime(value.strip(), "%Y-%m").date().replace(day=1)
        parsed_timestamp = datetime.fromisoformat(timestamp.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    timestamp_month = parsed_timestamp.date().replace(day=1)
    return month if month == timestamp_month else None


def _number(value: str | None, *, optional: bool = False) -> float | None:
    text = (value or "").strip()
    if optional and not text:
        return None
    try:
        result = float(text)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def _is_verified(data_type: str) -> bool:
    normalized = data_type.strip().upper()
    return "VERIFIED" in normalized and "UNVERIFIED" not in normalized and "SYNTHETIC" not in normalized


def _source_quality(data_type: str) -> str:
    if _is_verified(data_type):
        return "verified"
    if "SYNTHETIC" in data_type.upper():
        return "synthetic"
    return "unverified"


def _next_month(month: date) -> date:
    return date(month.year + (month.month == 12), 1 if month.month == 12 else month.month + 1, 1)


def _month_span(months: list[date]) -> tuple[int, list[str]]:
    if not months:
        return 0, []
    present = set(months)
    cursor = months[0]
    missing: list[str] = []
    count = 0
    while cursor <= months[-1]:
        count += 1
        if cursor not in present:
            missing.append(cursor.strftime("%Y-%m"))
        cursor = _next_month(cursor)
    return count, missing


def _fit_forecast(
    values: list[float],
    steps: int,
    exog: list[float] | None = None,
    future_exog: list[float] | None = None,
    seasonal: bool = True,
    cache_key: str | None = None,
    fingerprint: str | None = None,
    cache_details: dict[str, Any] | None = None,
    cache_records: list[dict[str, Any]] | None = None,
) -> tuple[list[float], list[float], list[float]]:
    from statsmodels.tsa.statespace.sarimax import SARIMAX

    def fit_model() -> Any:
        history_exog = [[value] for value in exog] if exog is not None else None
        model = SARIMAX(
            values,
            exog=history_exog,
            order=(1, 1, 1),
            # A seasonal difference captures the annual cycle while keeping the
            # parameter count small enough for the short monthly histories here.
            seasonal_order=(0, 1, 0, 12) if seasonal else (0, 0, 0, 0),
            enforce_stationarity=False,
            enforce_invertibility=False,
        )
        return model.fit(disp=False, maxiter=100)

    if cache_key and fingerprint:
        fitted, manifest, cache_hit = load_or_fit_sarimax(
            cache_key=cache_key,
            fingerprint=fingerprint,
            fit=fit_model,
            details=cache_details or {},
        )
        if cache_records is not None:
            cache_records.append({**manifest, "cacheHit": cache_hit})
    else:
        fitted = fit_model()
    next_exog = [[value] for value in future_exog] if future_exog is not None else None
    prediction = fitted.get_forecast(steps=steps, exog=next_exog)
    means = [max(0.0, float(value)) for value in prediction.predicted_mean]
    intervals = prediction.conf_int(alpha=0.05)
    lows = [max(0.0, float(row[0])) for row in intervals]
    highs = [max(0.0, float(row[1])) for row in intervals]
    if not all(math.isfinite(value) for value in [*means, *lows, *highs]):
        raise ValueError("SARIMAX produced non-finite forecasts")
    return means, lows, highs


def _score(actual: list[float], predicted: list[float]) -> dict[str, Any]:
    errors = [prediction - observed for observed, prediction in zip(actual, predicted)]
    if not errors:
        return {"samples": 0, "mae": None, "rmse": None, "mapePercent": None}
    nonzero = [(observed, prediction) for observed, prediction in zip(actual, predicted) if observed != 0]
    return {
        "samples": len(errors),
        "mae": sum(abs(error) for error in errors) / len(errors),
        "rmse": math.sqrt(sum(error * error for error in errors) / len(errors)),
        "mapePercent": (
            sum(abs(prediction - observed) / abs(observed) * 100 for observed, prediction in nonzero) / len(nonzero)
            if nonzero else None
        ),
    }


def _compute_holdout_performance(rows: list[dict[str, Any]], seasonal: bool) -> dict[str, Any]:
    # Score only untouched source history. Adjusted and extended estimates are
    # part of the forecasting series, but cannot be treated as observed outcomes.
    observed_rows = sorted(
        (row for row in rows if row.get("rowOrigin") == "historical"),
        key=lambda row: row["billingMonth"],
    )
    holdout_count = min(12, max(3, len(observed_rows) // 5))
    training_observed = observed_rows[:-holdout_count]
    holdout_rows = observed_rows[-holdout_count:]
    if len(training_observed) < MIN_LIMITED_MONTHS:
        return {"status": "unavailable", "reason": "Not enough rows for a separate holdout period."}

    from statsmodels.tsa.statespace.sarimax import SARIMAX

    observed_by_month = {row["billingMonth"]: row for row in observed_rows}
    all_by_month = {row["billingMonth"]: row for row in rows}
    current_month = min(all_by_month)
    first_holdout_month = holdout_rows[0]["billingMonth"]
    calendar_months: list[str] = []
    while current_month < first_holdout_month:
        calendar_months.append(current_month)
        year, month = (int(part) for part in current_month.split("-"))
        current_month = f"{year + (month == 12):04d}-{1 if month == 12 else month + 1:02d}"

    historical_training_rows = [observed_by_month[month] for month in calendar_months if month in observed_by_month]
    backtest_seasonal = seasonal and len(historical_training_rows) >= MIN_MONTHS

    metrics: dict[str, Any] = {}
    actuals_by_target: dict[str, list[float]] = {}
    predictions_by_target: dict[str, list[float]] = {}
    for target, field in (("consumptionKwh", "consumptionKwh"), ("billAmountInr", "billAmountInr")):
        training_values = [
            float(observed_by_month[month][field]) if month in observed_by_month else math.nan
            for month in calendar_months
        ]
        actual = [float(row[field]) for row in holdout_rows]
        try:
            fitted = SARIMAX(
                training_values,
                order=(1, 1, 1),
                seasonal_order=(0, 1, 0, 12) if backtest_seasonal else (0, 0, 0, 0),
                enforce_stationarity=False,
                enforce_invertibility=False,
            ).fit(disp=False, maxiter=100)
            predicted = [
                max(0.0, float(value))
                for value in fitted.get_forecast(steps=holdout_count).predicted_mean
            ]
            metrics[target] = _score(actual, predicted)
            actuals_by_target[target] = actual
            predictions_by_target[target] = predicted
        except Exception as error:
            metrics[target] = {"samples": 0, "mae": None, "rmse": None, "mapePercent": None, "error": type(error).__name__}

    return {
        "status": "ready" if any(item.get("samples", 0) for item in metrics.values()) else "unavailable",
        "evaluation": "chronological holdout on untouched source rows",
        "trainingRows": len(historical_training_rows),
        "holdoutMonths": holdout_count,
        "seasonalFit": backtest_seasonal,
        "months": [row["billingMonth"] for row in holdout_rows],
        "metrics": metrics,
        "actuals": actuals_by_target,
        "predictions": predictions_by_target,
    }


def forecast_bill_dataset(series_id: str | None = None) -> dict[str, Any]:
    path = _dataset_path()
    base: dict[str, Any] = {
        "model": "SARIMAX monthly batch forecast",
        "minimumMonths": MIN_MONTHS,
        "minimumLimitedMonths": MIN_LIMITED_MONTHS,
        "horizonMonths": FORECAST_MONTHS,
        "datasetFile": path.name if path else None,
        "sourceCounts": {},
        "availableSeries": [],
        "selectedSeriesId": series_id,
        "meterId": None,
        "dataType": None,
        "sourceQuality": None,
        "productionReady": False,
        "validatedRows": 0,
        "rejectedRows": 0,
        "verifiedRows": 0,
        "pdfRowsPendingVerification": 0,
        "unverifiedRowsTrainedSeparately": 0,
        "syntheticRowsTrainedSeparately": 0,
        "trainingRows": 0,
        "modelStorage": "models/bills",
        "modelCache": [],
        "performance": None,
        "actuals": [],
        "forecasts": [],
        "coverage": {"start": None, "end": None, "months": 0, "missingMonths": []},
        "message": "",
    }
    if path is None or not path.exists():
        return {
            **base,
            "status": "dataset_missing",
            "message": "Add one CSV file to data/bills/raw, or set BILLS_DATASET_PATH to its location.",
        }

    try:
        with path.open("r", newline="", encoding="utf-8-sig") as handle:
            reader = csv.DictReader(handle)
            missing_columns = sorted(REQUIRED_COLUMNS - set(reader.fieldnames or []))
            if missing_columns:
                return {
                    **base,
                    "status": "invalid_dataset",
                    "message": f"Missing required columns: {', '.join(missing_columns)}.",
                }
            raw_rows = list(reader)
    except (OSError, UnicodeError):
        return {**base, "status": "invalid_dataset", "message": "The configured dataset file could not be read."}
    fingerprint = hashlib.sha256(path.read_bytes()).hexdigest()

    valid_rows: list[dict[str, Any]] = []
    rejected = 0
    seen: set[tuple[str, date, str]] = set()
    source_counts: Counter[str] = Counter()
    for row in raw_rows:
        source = (row.get("data_type") or "").strip()
        source_counts[source or "(blank)"] += 1
        meter = (row.get("meter_id") or "").strip()
        month = _parse_month(row.get("billing_month") or "", row.get("timestamp") or "")
        consumption = _number(row.get("consumption_kwh"))
        demand = _number(row.get("max_demand_kva"), optional=True)
        amount = _number(row.get("bill_amount_inr"))
        if not source or not meter or month is None or consumption is None or amount is None or consumption < 0 or amount < 0:
            rejected += 1
            continue
        key = (meter, month, source)
        if key in seen:
            rejected += 1
            continue
        seen.add(key)
        valid_rows.append({
            "timestamp": row.get("timestamp", "").strip(),
            "billingMonth": month.strftime("%Y-%m"),
            "monthDate": month,
            "meterId": meter,
            "consumptionKwh": consumption,
            "maxDemandKva": demand if demand is None or demand >= 0 else None,
            "billAmountInr": amount,
            "dataType": source,
            "rowOrigin": (row.get("row_origin") or "historical").strip().lower(),
        })

    verified = [row for row in valid_rows if _is_verified(row["dataType"])]
    pdf_pending = [row for row in valid_rows if "PDF" in row["dataType"].upper() and not _is_verified(row["dataType"])]
    unverified = [row for row in valid_rows if _source_quality(row["dataType"]) == "unverified"]
    synthetic = [row for row in valid_rows if _source_quality(row["dataType"]) == "synthetic"]

    grouped: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for row in valid_rows:
        grouped.setdefault((row["meterId"], row["dataType"]), []).append(row)
    series_rows: dict[str, list[dict[str, Any]]] = {}
    series_summaries: list[dict[str, Any]] = []
    for (meter, data_type), rows in grouped.items():
        ordered = sorted(rows, key=lambda row: row["monthDate"])
        key = f"{data_type}::{meter}"
        series_rows[key] = ordered
        months = [row["monthDate"] for row in ordered]
        span, gaps = _month_span(months)
        series_summaries.append({
            "seriesId": key,
            "meterId": meter,
            "dataType": data_type,
            "sourceQuality": _source_quality(data_type),
            "rows": len(ordered),
            "start": months[0].strftime("%Y-%m") if months else None,
            "end": months[-1].strftime("%Y-%m") if months else None,
            "calendarMonths": span,
            "missingMonths": gaps,
            "forecastReady": len(ordered) >= MIN_LIMITED_MONTHS and not gaps,
            "seasonalReady": len(ordered) >= MIN_MONTHS and not gaps,
        })
    series_summaries.sort(key=lambda item: (-item["rows"], item["sourceQuality"], item["meterId"]))
    selected = series_id if series_id in series_rows else (series_summaries[0]["seriesId"] if series_summaries else None)

    base.update({
        "selectedSeriesId": selected,
        "availableSeries": series_summaries,
        "validatedRows": len(valid_rows),
        "rejectedRows": rejected,
        "verifiedRows": len(verified),
        "pdfRowsPendingVerification": len(pdf_pending),
        "unverifiedRowsTrainedSeparately": len(unverified),
        "syntheticRowsTrainedSeparately": len(synthetic),
        "sourceCounts": dict(source_counts),
    })

    selected_rows = series_rows.get(selected, []) if selected else []
    selected_summary = next((item for item in series_summaries if item["seriesId"] == selected), None)
    if not selected_rows or not selected_summary:
        return {**base, "status": "dataset_missing", "message": "No valid bill records are available in the selected dataset."}

    months = [row["monthDate"] for row in selected_rows]
    span, missing_months = _month_span(months)
    base.update({
        "meterId": selected_summary["meterId"],
        "dataType": selected_summary["dataType"],
        "sourceQuality": selected_summary["sourceQuality"],
        "trainingRows": len(selected_rows),
        "coverage": {
            "start": months[0].strftime("%Y-%m"),
            "end": months[-1].strftime("%Y-%m"),
            "months": span,
            "missingMonths": missing_months,
        },
        "actuals": [
            {key: value for key, value in row.items() if key not in {"monthDate", "timestamp"}}
            for row in selected_rows
        ],
    })

    if missing_months or span < MIN_LIMITED_MONTHS:
        gap_note = f" Missing months: {', '.join(missing_months[:6])}{'…' if len(missing_months) > 6 else ''}." if missing_months else ""
        return {
            **base,
            "status": "insufficient_history",
            "message": f"This {selected_summary['sourceQuality']} series has {len(selected_rows)} monthly rows across {span} calendar months. SARIMAX needs at least {MIN_LIMITED_MONTHS} consecutive months for a limited forecast.{gap_note}",
        }

    seasonal_model = span >= MIN_MONTHS
    targets = {
        "consumptionKwh": [float(row["consumptionKwh"]) for row in selected_rows],
        "billAmountInr": [float(row["billAmountInr"]) for row in selected_rows],
    }
    demand_values = [row["maxDemandKva"] for row in selected_rows]
    model_cache: list[dict[str, Any]] = []
    demand_forecast: list[float] | None = None
    if all(value is not None for value in demand_values):
        try:
            demand_forecast, _, _ = _fit_forecast(
                [float(value) for value in demand_values], FORECAST_MONTHS, seasonal=seasonal_model,
                cache_key=f"{selected}:maxDemandKva", fingerprint=fingerprint,
                cache_details={"seriesId": selected, "target": "maxDemandKva", "trainingRows": len(selected_rows), "seasonal": seasonal_model},
                cache_records=model_cache,
            )
        except Exception:
            demand_forecast = None

    results: dict[str, tuple[list[float], list[float], list[float]]] = {}
    try:
        for target, values in targets.items():
            results[target] = _fit_forecast(
                values,
                FORECAST_MONTHS,
                exog=[float(value) for value in demand_values] if demand_forecast else None,
                future_exog=demand_forecast,
                seasonal=seasonal_model,
                cache_key=f"{selected}:{target}",
                fingerprint=fingerprint,
                cache_details={"seriesId": selected, "target": target, "trainingRows": len(selected_rows), "seasonal": seasonal_model, "demandPredictor": demand_forecast is not None},
                cache_records=model_cache,
            )
    except Exception as error:
        return {
            **base,
            "status": "model_error",
            "message": f"SARIMAX could not fit this series ({type(error).__name__}). Check the source rows and retry.",
        }

    cursor = _next_month(months[-1])
    forecasts: list[dict[str, Any]] = []
    for index in range(FORECAST_MONTHS):
        point: dict[str, Any] = {"billingMonth": cursor.strftime("%Y-%m")}
        for target, (means, lows, highs) in results.items():
            point[target] = means[index]
            point[f"{target}Lower"] = lows[index]
            point[f"{target}Upper"] = highs[index]
        point["maxDemandKva"] = demand_forecast[index] if demand_forecast else None
        forecasts.append(point)
        cursor = _next_month(cursor)

    quality = selected_summary["sourceQuality"]
    performance = read_series_performance(selected, fingerprint)
    if performance is None:
        performance = _compute_holdout_performance(selected_rows, seasonal_model)
        write_series_performance(selected, fingerprint, performance)
    return {
        **base,
        "status": "ready" if seasonal_model else "limited_history",
        "forecasts": forecasts,
        "usesMaxDemandPredictor": demand_forecast is not None,
        "seasonalModel": seasonal_model,
        "modelCache": model_cache,
        "performance": performance,
        "productionReady": quality == "verified" and seasonal_model,
        "message": f"SARIMAX fitted on {len(selected_rows)} monthly rows for meter {base['meterId']} from data_type={base['dataType']}. This forecast uses {quality} source data and {'annual seasonality' if seasonal_model else 'a limited-history, nonseasonal fit'}.",
    }
