from __future__ import annotations

import csv
import math
from collections import defaultdict
from datetime import date
from pathlib import Path
from statistics import median
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SOURCE_FILE = ROOT / "data" / "bills" / "raw" / "CARBengine_dataset_2019_2025.csv"
OUTPUT_FILE = ROOT / "data" / "bills" / "processed" / "CARBengine_bill_history_extended_2019_2025.csv"
BASE_METER = "UNKNOWN_ONLINE_REPORT_SCOPE"
BASE_DATA_TYPE = "SECONDARY_SOURCE_UNVERIFIED"
HISTORY_COLUMNS = [
    "timestamp",
    "billing_month",
    "meter_id",
    "consumption_kwh",
    "max_demand_kva",
    "bill_amount_inr",
    "data_type",
    "row_origin",
]
EXTENSION_MONTHS = 36
LOW_SEGMENT_RATIO = 0.45
MIN_LOW_SEGMENT_MONTHS = 6
TARGET_FIELDS = ("consumption_kwh", "max_demand_kva", "bill_amount_inr")


def _next_month(month: date) -> date:
    return date(month.year + (month.month == 12), 1 if month.month == 12 else month.month + 1, 1)


def _month_index(month: date) -> int:
    return month.year * 12 + month.month - 1


def _sustained_low_months(rows: list[dict[str, str]]) -> set[str]:
    """Find long runs of unusually low consumption versus the same-month peers."""
    by_calendar_month: dict[int, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        month = date.fromisoformat(f"{row['billing_month']}-01")
        by_calendar_month[month.month].append(row)

    candidates: set[str] = set()
    for row in rows:
        month = date.fromisoformat(f"{row['billing_month']}-01")
        peers = [
            float(peer["consumption_kwh"])
            for peer in by_calendar_month[month.month]
            if peer is not row
        ]
        if peers and float(row["consumption_kwh"]) < median(peers) * LOW_SEGMENT_RATIO:
            candidates.add(row["billing_month"])

    ordered = sorted(candidates)
    sustained: set[str] = set()
    run: list[str] = []
    for billing_month in ordered:
        month = date.fromisoformat(f"{billing_month}-01")
        if run:
            previous = date.fromisoformat(f"{run[-1]}-01")
            if _month_index(month) != _month_index(previous) + 1:
                if len(run) >= MIN_LOW_SEGMENT_MONTHS:
                    sustained.update(run)
                run = []
        run.append(billing_month)
    if len(run) >= MIN_LOW_SEGMENT_MONTHS:
        sustained.update(run)
    return sustained


def _seasonal_replacements(
    rows: list[dict[str, str]],
    adjusted_months: set[str],
    field: str,
) -> dict[str, float]:
    """Estimate flagged rows from clean annual levels and same-month seasonality."""
    clean_by_year: dict[int, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        if row["billing_month"] in adjusted_months:
            continue
        month = date.fromisoformat(f"{row['billing_month']}-01")
        clean_by_year[month.year].append(row)

    reference_years = {
        year: year_rows
        for year, year_rows in clean_by_year.items()
        if len(year_rows) >= 8
    }
    if len(reference_years) < 2:
        raise ValueError("At least two mostly complete reference years are required to replace the low segment.")

    annual_means = {
        year: sum(float(row[field]) for row in year_rows) / len(year_rows)
        for year, year_rows in reference_years.items()
    }
    factors_by_month: dict[int, list[float]] = defaultdict(list)
    for year, year_rows in reference_years.items():
        for row in year_rows:
            month = date.fromisoformat(f"{row['billing_month']}-01")
            factors_by_month[month.month].append(float(row[field]) / annual_means[year])

    seasonal = {month: sum(factors) / len(factors) for month, factors in factors_by_month.items()}
    seasonal_average = sum(seasonal.values()) / len(seasonal)
    seasonal = {month: factor / seasonal_average for month, factor in seasonal.items()}

    first_year, last_year = min(annual_means), max(annual_means)
    start_mean, end_mean = annual_means[first_year], annual_means[last_year]
    start_index = _month_index(date(first_year, 1, 1))
    end_index = _month_index(date(last_year, 12, 1))
    span = max(1, end_index - start_index)

    estimates: dict[str, float] = {}
    for billing_month in adjusted_months:
        month = date.fromisoformat(f"{billing_month}-01")
        if month.month not in seasonal:
            raise ValueError(f"No clean seasonal reference exists for {billing_month}.")
        progress = (_month_index(month) - start_index) / span
        baseline = start_mean + (end_mean - start_mean) * progress
        estimates[billing_month] = round(max(0.0, baseline * seasonal[month.month]), 2)
    return estimates


def _adjust_sustained_low_segment(rows: list[dict[str, str]]) -> tuple[list[dict[str, str]], set[str]]:
    adjusted_months = _sustained_low_months(rows)
    if not adjusted_months:
        return [{**row, "row_origin": "historical"} for row in rows], set()

    replacements = {
        field: _seasonal_replacements(rows, adjusted_months, field)
        for field in TARGET_FIELDS
    }
    adjusted_rows: list[dict[str, str]] = []
    for source_row in rows:
        row = {**source_row}
        billing_month = row["billing_month"]
        if billing_month in adjusted_months:
            for field in TARGET_FIELDS:
                row[field] = str(replacements[field][billing_month])
            row["row_origin"] = "adjusted"
        else:
            row["row_origin"] = "historical"
        adjusted_rows.append(row)
    return adjusted_rows, adjusted_months


def _trend_seasonal_extension(rows: list[dict[str, str]], field: str) -> list[float]:
    annual_values: dict[int, list[float]] = defaultdict(list)
    month_factors: dict[int, list[float]] = defaultdict(list)
    for row in rows:
        month = date.fromisoformat(f"{row['billing_month']}-01")
        value = float(row[field])
        annual_values[month.year].append(value)

    annual_means = {year: sum(values) / len(values) for year, values in annual_values.items()}
    for row in rows:
        month = date.fromisoformat(f"{row['billing_month']}-01")
        annual_mean = annual_means[month.year]
        month_factors[month.month].append(float(row[field]) / annual_mean if annual_mean else 1.0)

    seasonal = {month: sum(values) / len(values) for month, values in month_factors.items()}
    seasonal_average = sum(seasonal.values()) / len(seasonal)
    seasonal = {month: factor / seasonal_average for month, factor in seasonal.items()}

    years = sorted(annual_means)
    x_mean = sum(years) / len(years)
    y_mean = sum(annual_means[year] for year in years) / len(years)
    denominator = sum((year - x_mean) ** 2 for year in years)
    slope = sum((year - x_mean) * (annual_means[year] - y_mean) for year in years) / denominator
    last_year = years[-1]
    last_mean = annual_means[last_year]
    lower_mean, upper_mean = last_mean * 0.75, last_mean * 1.25

    result: list[float] = []
    month = _next_month(date(last_year, 12, 1))
    for _ in range(EXTENSION_MONTHS):
        projected_mean = last_mean + slope * (month.year - last_year)
        projected_mean = min(upper_mean, max(lower_mean, projected_mean))
        value = projected_mean * seasonal[month.month]
        if not math.isfinite(value):
            raise ValueError(f"Could not generate a finite value for {field} in {month:%Y-%m}.")
        result.append(round(max(0.0, value), 2))
        month = _next_month(month)
    return result


def build_extended_dataset() -> tuple[Path, int]:
    if not SOURCE_FILE.is_file():
        raise FileNotFoundError(f"Source CSV not found: {SOURCE_FILE}")
    with SOURCE_FILE.open("r", newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        source_rows = [
            row for row in reader
            if (row.get("meter_id") or "").strip() == BASE_METER
            and (row.get("data_type") or "").strip() == BASE_DATA_TYPE
        ]

    source_rows.sort(key=lambda row: row["billing_month"])
    if len(source_rows) != 48:
        raise ValueError(f"Expected 48 consecutive historical months for {BASE_METER}; found {len(source_rows)} rows.")

    months = [date.fromisoformat(f"{row['billing_month']}-01") for row in source_rows]
    cursor = months[0]
    for month in months:
        if month != cursor:
            raise ValueError("The base history contains a missing or duplicate billing month.")
        cursor = _next_month(cursor)

    historical_rows, adjusted_months = _adjust_sustained_low_segment(source_rows)
    future_demand = _trend_seasonal_extension(historical_rows, "max_demand_kva")
    future_consumption = _trend_seasonal_extension(historical_rows, "consumption_kwh")
    future_bill = _trend_seasonal_extension(historical_rows, "bill_amount_inr")

    generated_rows: list[dict[str, Any]] = []
    month = _next_month(months[-1])
    for index in range(EXTENSION_MONTHS):
        generated_rows.append({
            "timestamp": f"{month.isoformat()}T00:00:00",
            "billing_month": month.strftime("%Y-%m"),
            "meter_id": BASE_METER,
            "consumption_kwh": future_consumption[index],
            "max_demand_kva": future_demand[index],
            "bill_amount_inr": future_bill[index],
            "data_type": BASE_DATA_TYPE,
            "row_origin": "synthetic",
        })
        month = _next_month(month)

    all_rows = historical_rows + generated_rows
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_FILE.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=HISTORY_COLUMNS)
        writer.writeheader()
        writer.writerows(all_rows)

    return OUTPUT_FILE, len(all_rows)


if __name__ == "__main__":
    output, row_count = build_extended_dataset()
    with output.open("r", newline="", encoding="utf-8-sig") as handle:
        adjusted_count = sum(1 for row in csv.DictReader(handle) if row["row_origin"] == "adjusted")
    print(f"Wrote {row_count} monthly rows to {output}")
    print(f"Adjusted estimate rows: {adjusted_count}")
    print("History series: 2019-01 through 2025-12, including estimates through 2025-12")
