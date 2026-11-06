from __future__ import annotations

import csv
import hashlib
import json
import math
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

GREEN = "215B43"
MID_GREEN = "2F805E"
INK = "26352D"
MUTED = "6E7D74"
GRID = "DCE5DE"
GOLD = "C58B22"
BLUE = "6485A1"
PALE = "F6F9F7"


def _fonts(size: int = 28) -> tuple[ImageFont.FreeTypeFont, ImageFont.FreeTypeFont]:
    regular = ImageFont.truetype(r"C:\Windows\Fonts\arial.ttf", size)
    bold = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", size)
    return regular, bold


def _measure_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont) -> tuple[int, int]:
    box = draw.textbbox((0, 0), text, font=font)
    return box[2] - box[0], box[3] - box[1]


def _center(draw: ImageDraw.ImageDraw, x: int, y: int, text: str, font, fill: str) -> None:
    width, height = _measure_text(draw, text, font)
    draw.text((x - width / 2, y - height / 2), text, font=font, fill=f"#{fill}")


def _arrow(draw: ImageDraw.ImageDraw, start: tuple[int, int], end: tuple[int, int], color: str, width: int = 6) -> None:
    draw.line([start, end], fill=f"#{color}", width=width)
    angle = math.atan2(end[1] - start[1], end[0] - start[0])
    length = 20
    a = (end[0] - length * math.cos(angle - math.pi / 6), end[1] - length * math.sin(angle - math.pi / 6))
    b = (end[0] - length * math.cos(angle + math.pi / 6), end[1] - length * math.sin(angle + math.pi / 6))
    draw.polygon([end, a, b], fill=f"#{color}")


def _read_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def make_dataset_profile(raw_path: Path, processed_path: Path, output: Path) -> None:
    raw = [row for row in _read_rows(raw_path) if row["meter_id"] == "UNKNOWN_ONLINE_REPORT_SCOPE" and row["data_type"] == "SECONDARY_SOURCE_UNVERIFIED"]
    processed = _read_rows(processed_path)
    raw.sort(key=lambda row: row["billing_month"])
    processed.sort(key=lambda row: row["billing_month"])
    raw_y = {row["billing_month"]: float(row["consumption_kwh"]) / 1_000_000 for row in raw}
    processed_y = {row["billing_month"]: float(row["consumption_kwh"]) / 1_000_000 for row in processed}
    origins = {row["billing_month"]: row["row_origin"] for row in processed}

    width, height = 1450, 850
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    regular, bold = _fonts(27)
    small, small_bold = _fonts(22)
    title_font = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 34)
    draw.text((48, 28), "MONTHLY BILL-SERIES DATA PROFILE", fill=f"#{GREEN}", font=title_font)
    draw.text((50, 80), "Unverified source series · energy values in million kWh per billing month", fill=f"#{MUTED}", font=regular)

    left, top, right, bottom = 120, 158, 1390, 690
    n = 84
    y_min, y_max = 0.0, 5.0
    x = lambda i: left + (right - left) * i / (n - 1)
    y = lambda value: bottom - (value - y_min) / (y_max - y_min) * (bottom - top)

    start_adjusted, end_adjusted = 15, 37
    draw.rectangle((x(start_adjusted), top, x(end_adjusted), bottom), fill="#FFF6E7")
    for tick in (0, 1, 2, 3, 4, 5):
        yy = y(tick)
        draw.line((left, yy, right, yy), fill=f"#{GRID}", width=2)
        label = f"{tick}.0"
        tw, th = _measure_text(draw, label, small)
        draw.text((left - tw - 16, yy - th / 2), label, fill=f"#{MUTED}", font=small)
    draw.line((left, top, left, bottom), fill=f"#{INK}", width=3)
    draw.line((left, bottom, right, bottom), fill=f"#{INK}", width=3)

    for year in range(2019, 2026):
        index = (year - 2019) * 12
        xx = x(index)
        draw.line((xx, bottom, xx, bottom + 10), fill=f"#{INK}", width=2)
        label = str(year)
        tw, _ = _measure_text(draw, label, small)
        draw.text((xx - tw / 2, bottom + 18), label, fill=f"#{MUTED}", font=small)
    draw.text((x(start_adjusted) + 10, top + 8), "23-month adjusted segment", fill="#9A6E1C", font=small_bold)

    points_raw = [(x(i), y(raw_y[f"{2019 + i // 12:04d}-{i % 12 + 1:02d}"])) for i in range(48)]
    draw.line(points_raw, fill="#88958C", width=4)

    for i in range(83):
        month_a = f"{2019 + i // 12:04d}-{i % 12 + 1:02d}"
        month_b = f"{2019 + (i + 1) // 12:04d}-{(i + 1) % 12 + 1:02d}"
        origin = origins[month_b]
        color = MID_GREEN if origin == "historical" else GOLD if origin == "adjusted" else BLUE
        if origin == "synthetic":
            # Short alternating strokes make the extension visibly distinct.
            ax, ay = x(i), y(processed_y[month_a])
            bx, by = x(i + 1), y(processed_y[month_b])
            steps = 16
            for segment in range(0, steps, 2):
                p0 = segment / steps
                p1 = (segment + 1) / steps
                draw.line((ax + (bx - ax) * p0, ay + (by - ay) * p0, ax + (bx - ax) * p1, ay + (by - ay) * p1), fill=f"#{color}", width=5)
        else:
            draw.line((x(i), y(processed_y[month_a]), x(i + 1), y(processed_y[month_b])), fill=f"#{color}", width=5)

    for i, row in enumerate(processed):
        xx, yy = x(i), y(processed_y[row["billing_month"]])
        color = MID_GREEN if row["row_origin"] == "historical" else GOLD if row["row_origin"] == "adjusted" else BLUE
        draw.ellipse((xx - 6, yy - 6, xx + 6, yy + 6), fill=f"#{color}", outline="white", width=2)

    legend_y = 770
    legend = [
        ("#88958C", "Raw selected series (48 months)"),
        (f"#{MID_GREEN}", "Untouched source (25)"),
        (f"#{GOLD}", "Seasonally adjusted (23)"),
        (f"#{BLUE}", "Synthetic extension (36)"),
    ]
    cursor = 56
    for color, label in legend:
        draw.line((cursor, legend_y + 14, cursor + 44, legend_y + 14), fill=color, width=5)
        draw.ellipse((cursor + 17, legend_y + 8, cursor + 29, legend_y + 20), fill=color)
        cursor += 56
        draw.text((cursor, legend_y), label, fill=f"#{INK}", font=small)
        cursor += _measure_text(draw, label, small)[0] + 42
    image.save(output, "PNG", dpi=(300, 300), optimize=True)


def make_provenance_plot(output: Path) -> None:
    width, height = 1450, 720
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    regular, bold = _fonts(25)
    small, small_bold = _fonts(25)
    title_font = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 34)
    draw.text((48, 30), "BILL DATA PROVENANCE COUNTS", fill=f"#{GREEN}", font=title_font)
    draw.text((50, 82), "Raw records and the selected processed modeling series are different populations", fill=f"#{MUTED}", font=regular)

    x0, max_width, bar_h = 275, 1010, 110
    rows = [
        ("Raw CSV", 95, [(48, MID_GREEN, "48 unverified"), (11, GOLD, "11 PDF"), (36, BLUE, "36 synthetic demo")]),
        ("Processed file", 84, [(25, MID_GREEN, "25 untouched"), (23, GOLD, "23 adjusted"), (36, BLUE, "36 synthetic")]),
    ]
    for row_i, (label, total, groups) in enumerate(rows):
        y0 = 220 + row_i * 210
        draw.text((52, y0 + 34), label, fill=f"#{INK}", font=bold)
        cursor = x0
        remaining = max_width
        for index, (count, color, segment_label) in enumerate(groups):
            segment_width = round(max_width * count / total) if index < len(groups) - 1 else remaining
            segment_width = min(segment_width, remaining)
            rect = (cursor, y0, cursor + segment_width, y0 + bar_h)
            draw.rectangle(rect, fill=f"#{color}", outline="white", width=4)
            tw, th = _measure_text(draw, segment_label, small_bold)
            draw.text((cursor + (segment_width - tw) / 2, y0 + (bar_h - th) / 2), segment_label, fill="white", font=small_bold)
            cursor += segment_width
            remaining -= segment_width
        draw.text((x0 + max_width + 22, y0 + 36), f"n = {total}", fill=f"#{MUTED}", font=small)

    legend_y = 650
    legend = [(MID_GREEN, "Source / untouched"), (GOLD, "Pending or adjusted"), (BLUE, "Synthetic rows")]
    cursor = 315
    for color, label in legend:
        draw.rounded_rectangle((cursor, legend_y, cursor + 34, legend_y + 27), radius=4, fill=f"#{color}")
        draw.text((cursor + 46, legend_y - 1), label, fill=f"#{INK}", font=small)
        cursor += _measure_text(draw, label, small)[0] + 112
    draw.text((50, 560), "Raw CSV includes 11 PDF-labeled rows pending verification; the processed file selects one unverified source series.", fill=f"#{MUTED}", font=small)
    draw.text((50, 595), "Counts refer to separate artifacts and must not be read as one combined time series.", fill=f"#{MUTED}", font=small)
    image.save(output, "PNG", dpi=(300, 300), optimize=True)


def _metrics_payload(processed_path: Path, model_dir: Path) -> tuple[list[str], dict, dict, dict]:
    fingerprint = hashlib.sha256(processed_path.read_bytes()).hexdigest()
    performance = None
    for path in sorted(model_dir.glob("*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if payload.get("fingerprint") == fingerprint and payload.get("performance"):
            performance = payload["performance"]
            break
    if not performance or performance.get("status") != "ready":
        raise RuntimeError("A matching cached bill-series holdout is required to draw the evaluation figure.")
    months = performance["months"]
    actuals = performance["actuals"]
    predictions = performance["predictions"]
    rows = _read_rows(processed_path)
    training = [row for row in rows if row["row_origin"] == "historical" and row["billing_month"] < months[0]]
    if len(training) < 1:
        raise RuntimeError("No untouched training observation precedes the cached holdout.")
    persistence = {
        "consumptionKwh": [float(training[-1]["consumption_kwh"])] * len(months),
        "billAmountInr": [float(training[-1]["bill_amount_inr"])] * len(months),
    }
    return months, actuals, predictions, persistence


def make_holdout_plot(processed_path: Path, model_dir: Path, output: Path) -> None:
    months, actuals, predictions, persistence = _metrics_payload(processed_path, model_dir)
    width, height = 1450, 1010
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    regular, bold = _fonts(25)
    small, small_bold = _fonts(20)
    title_font = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 34)
    draw.text((48, 24), "CHRONOLOGICAL HOLDOUT: ACTUAL VS FORECAST", fill=f"#{GREEN}", font=title_font)
    draw.text((50, 70), "Five untouched source months · nonseasonal limited-history backtest", fill=f"#{MUTED}", font=regular)

    panels = [
        ("consumptionKwh", "Monthly consumption (million kWh)", 1_000_000, 205, 465, 590),
        ("billAmountInr", "Monthly bill amount (₹ million)", 1_000_000, 610, 870, 30_500_000),
    ]
    for key, title, divisor, y_top, y_bottom, _max_unused in panels:
        left, right = 150, 1385
        panel_top, panel_bottom = y_top, y_bottom
        draw.text((left, panel_top - 46), title, fill=f"#{INK}", font=bold)
        all_values = [float(v) / divisor for v in actuals[key] + predictions[key] + persistence[key]]
        low = min(all_values)
        high = max(all_values)
        margin = max((high - low) * 0.16, 0.08)
        low -= margin
        high += margin
        x = lambda i: left + (right - left) * i / (len(months) - 1)
        y = lambda value: panel_bottom - (value - low) / (high - low) * (panel_bottom - panel_top)
        for tick in range(4):
            val = low + (high - low) * tick / 3
            yy = y(val)
            draw.line((left, yy, right, yy), fill=f"#{GRID}", width=2)
            label = f"{val:.1f}"
            tw, th = _measure_text(draw, label, small)
            draw.text((left - tw - 14, yy - th / 2), label, fill=f"#{MUTED}", font=small)
        draw.line((left, panel_top, left, panel_bottom), fill=f"#{INK}", width=3)
        draw.line((left, panel_bottom, right, panel_bottom), fill=f"#{INK}", width=3)
        series = [
            (actuals[key], MID_GREEN, False, 10),
            (predictions[key], GOLD, True, 9),
            (persistence[key], BLUE, True, 8),
        ]
        for values, color, dashed, radius in series:
            points = [(x(i), y(float(value) / divisor)) for i, value in enumerate(values)]
            for i in range(len(points) - 1):
                a, b = points[i], points[i + 1]
                if dashed:
                    steps = 20
                    for seg in range(0, steps, 2):
                        u0, u1 = seg / steps, (seg + 1) / steps
                        draw.line((a[0] + (b[0] - a[0]) * u0, a[1] + (b[1] - a[1]) * u0, a[0] + (b[0] - a[0]) * u1, a[1] + (b[1] - a[1]) * u1), fill=f"#{color}", width=5)
                else:
                    draw.line((a, b), fill=f"#{color}", width=5)
            for px, py in points:
                draw.ellipse((px - radius, py - radius, px + radius, py + radius), fill=f"#{color}", outline="white", width=2)
        for i, month in enumerate(months):
            label = datetime.strptime(month, "%Y-%m").strftime("%b %y")
            tw, _ = _measure_text(draw, label, small)
            draw.text((x(i) - tw / 2, panel_bottom + 13), label, fill=f"#{MUTED}", font=small)

    legend_y = 930
    cursor = 280
    for color, label, dashed in [(MID_GREEN, "Observed", False), (GOLD, "SARIMAX", True), (BLUE, "Persistence baseline", True)]:
        for i in range(0, 42, 4 if dashed else 42):
            draw.line((cursor + i, legend_y + 13, min(cursor + i + 18, cursor + 42), legend_y + 13), fill=f"#{color}", width=5)
        draw.text((cursor + 52, legend_y), label, fill=f"#{INK}", font=small)
        cursor += _measure_text(draw, label, small)[0] + 112
    draw.text((50, 982), "Baseline repeats the last untouched pre-holdout value (July 2022).", fill=f"#{MUTED}", font=small)
    image.save(output, "PNG", dpi=(300, 300), optimize=True)


def make_river_flow(output: Path) -> None:
    width, height = 1450, 850
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    regular, bold = _fonts(27)
    small, small_bold = _fonts(22)
    title_font = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 34)
    draw.text((48, 28), "RIVER ONLINE FORECAST: PREQUENTIAL LEARNING LOOP", fill=f"#{GREEN}", font=title_font)
    draw.text((50, 82), "One-device stream · one-minute origin cadence · five-minute power horizon", fill=f"#{MUTED}", font=regular)

    boxes = [
        ((40, 185, 350, 430), "Eligible PZEM sample", "V, I, P, Hz, PF\nplus recent changes\nand local-time terms", "EAF3EE", MID_GREEN),
        ((390, 185, 680, 430), "Feature vector", "11 numeric inputs\nΔpower, Δvoltage\nsin/cos day and week", "EDF3F8", BLUE),
        ((750, 185, 1050, 430), "Online model", "StandardScaler\nLinearRegression\nSGD lr 0.01 · L2 0.0001", "F2EDF7", "8A76A1"),
        ((1120, 185, 1410, 430), "Five-minute output", "Predicted power (W)\nplus status and\nvalidated MAE (W)", "F7F3E8", GOLD),
    ]
    for rect, heading, body, fill, outline in boxes:
        draw.rounded_rectangle(rect, radius=20, fill=f"#{fill}", outline=f"#{outline}", width=4)
        left, top, right, bottom = rect
        _center(draw, (left + right) // 2, top + 48, heading, bold, INK)
        for line_i, line in enumerate(body.splitlines()):
            _center(draw, (left + right) // 2, top + 112 + line_i * 42, line, regular, MUTED)
    for start, end in [((350, 305), (390, 305)), ((680, 305), (750, 305)), ((1050, 305), (1120, 305))]:
        _arrow(draw, start, end, MID_GREEN)

    draw.rounded_rectangle((265, 530, 1185, 675), radius=18, fill="#FBFDFB", outline=f"#{GRID}", width=3)
    _center(draw, 725, 572, "Target arrives at origin + 5 min", bold, INK)
    _center(draw, 725, 627, "Within +2 min: score forecast MAE, then learn from the paired target", regular, MUTED)
    _arrow(draw, (1265, 430), (1265, 485), GOLD)
    draw.line((1265, 485, 725, 485), fill=f"#{GOLD}", width=6)
    _arrow(draw, (725, 485), (725, 530), GOLD)
    draw.line((265, 602, 130, 602), fill=f"#{GOLD}", width=6)
    draw.line((130, 602, 130, 480), fill=f"#{GOLD}", width=6)
    _arrow(draw, (130, 480), (180, 430), GOLD)

    draw.rounded_rectangle((320, 735, 1130, 805), radius=15, fill="#FFF8EB", outline="#E7D5AD", width=2)
    _center(draw, 725, 770, "Forecast is withheld until 12 target pairs have trained the model", small_bold, "8C6A25")
    image.save(output, "PNG", dpi=(300, 300), optimize=True)


def make_figures(work: Path, root: Path) -> dict[str, Path]:
    raw = root / "data" / "bills" / "raw" / "CARBengine_dataset_2019_2025.csv"
    processed = root / "data" / "bills" / "processed" / "CARBengine_bill_history_extended_2019_2025.csv"
    model_dir = root / "backend" / "models" / "bills"
    outputs = {
        "dataset": work / "bill_dataset_profile.png",
        "provenance": work / "bill_data_provenance.png",
        "holdout": work / "bill_holdout_comparison.png",
        "river": work / "river_online_learning.png",
    }
    if not raw.is_file() or not processed.is_file():
        raise FileNotFoundError("The inspected raw and processed bill datasets are required to produce the paper figures.")
    make_dataset_profile(raw, processed, outputs["dataset"])
    make_provenance_plot(outputs["provenance"])
    make_holdout_plot(processed, model_dir, outputs["holdout"])
    make_river_flow(outputs["river"])
    return outputs
