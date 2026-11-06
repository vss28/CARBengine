from __future__ import annotations

import copy
import csv
import hashlib
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from docx import Document
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from docx.text.paragraph import Paragraph
from paper_figures import make_figures

ROOT = Path(r"E:\Projects-GPU\CARBengine.v1-live-monitoring-db")
WORK = ROOT / "_techpaper_work"
REFERENCE = Path(r"C:\Users\vedan\Desktop\pending assignments\EXCS BE -09 NOS TV Tech Paper.docx")
OUTPUT = ROOT / "CARBengine_Technical_Paper_Final_Expanded.docx"
ARCH_IMAGE = WORK / "carbengine_architecture.png"
EXPECTED_REFERENCE_HASH = "8F80A8BCDE1E44D758896BCA02206E584B3371E166A1FCD706202358B0EB64B3"
FONT = "Times New Roman"
GREEN = "215B43"
MID_GREEN = "2F805E"
LIGHT_GREEN = "EAF3EE"
PALE = "F6F9F7"
GRID = "AEBBB4"
INK = "000000"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest().upper()


def make_architecture_image(path: Path) -> None:
    width, height = 1000, 560
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    regular_path = Path(r"C:\Windows\Fonts\arial.ttf")
    bold_path = Path(r"C:\Windows\Fonts\arialbd.ttf")
    regular = ImageFont.truetype(str(regular_path), 27)
    bold = ImageFont.truetype(str(bold_path), 29)
    title_font = ImageFont.truetype(str(bold_path), 25)
    draw.text((30, 18), "CARBENGINE DATA AND SERVICE FLOW", fill=f"#{GREEN}", font=title_font)

    def box(rect, lines, *, fill, outline=GRID, font=regular, text_fill=INK):
        draw.rounded_rectangle(rect, radius=18, fill=f"#{fill}", outline=f"#{outline}", width=3)
        left, top, right, bottom = rect
        line_boxes = [draw.textbbox((0, 0), line, font=font) for line in lines]
        heights = [b[3] - b[1] for b in line_boxes]
        total = sum(heights) + (len(lines) - 1) * 7
        y = top + ((bottom - top) - total) // 2
        for line, bounds, line_height in zip(lines, line_boxes, heights):
            text_width = bounds[2] - bounds[0]
            draw.text((left + (right - left - text_width) / 2, y), line, fill=f"#{text_fill}", font=font)
            y += line_height + 7

    def arrow(start, end, color=MID_GREEN, width_px=5):
        draw.line([start, end], fill=f"#{color}", width=width_px)
        angle = math.atan2(end[1] - start[1], end[0] - start[0])
        length = 15
        left = (end[0] - length * math.cos(angle - math.pi / 6), end[1] - length * math.sin(angle - math.pi / 6))
        right = (end[0] - length * math.cos(angle + math.pi / 6), end[1] - length * math.sin(angle + math.pi / 6))
        draw.polygon([end, left, right], fill=f"#{color}")

    box((28, 66, 316, 158), ["PZEM-004T", "AC energy meter"], fill=LIGHT_GREEN, outline=MID_GREEN, font=bold)
    box((356, 66, 644, 158), ["ESP32", "Wi-Fi controller"], fill="EDF3F8", outline="6987A2", font=bold)
    box((684, 66, 972, 158), ["Existing upload service", "outside this repository"], fill="F7F3E8", outline="B6A36E")
    arrow((316, 112), (356, 112))
    arrow((644, 112), (684, 112))

    box((100, 222, 900, 296), ["Supabase PostgreSQL  |  sensor_readings + Realtime"], fill=LIGHT_GREEN, outline=MID_GREEN, font=bold)
    arrow((828, 158), (828, 190), color="B6A36E")
    draw.line([(828, 190), (500, 190)], fill=f"#{MID_GREEN}", width=5)
    arrow((500, 190), (500, 222))

    box((175, 352, 825, 422), ["CARBengine web dashboard", "React + TypeScript"], fill="EDF3F8", outline="6987A2", font=bold)
    arrow((500, 296), (500, 352))

    box((35, 464, 480, 542), ["FastAPI + River", "5-minute power forecast"], fill="F2EDF7", outline="8A76A1")
    box((520, 464, 965, 542), ["Local CSVs + SARIMAX", "monthly bill forecast"], fill="F7F3E8", outline="B6A36E")
    arrow((260, 464), (360, 422), color="8A76A1")
    arrow((740, 464), (640, 422), color="B6A36E")
    image.save(path, format="PNG", dpi=(300, 300), optimize=True)


def set_run_font(run, size=10, bold=False, italic=False, color=INK, underline=False):
    run.font.name = FONT
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    run.font.underline = underline
    run.font.color.rgb = RGBColor.from_string(color)
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.rFonts
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.insert(0, rfonts)
    for key in ("ascii", "hAnsi", "cs", "eastAsia"):
        rfonts.set(qn(f"w:{key}"), FONT)


def ensure_style(doc, name, *, size, bold=False, italic=False, align=None):
    try:
        style = doc.styles[name]
    except KeyError:
        style = doc.styles.add_style(name, WD_STYLE_TYPE.PARAGRAPH)
    style.font.name = FONT
    style.font.size = Pt(size)
    style.font.bold = bold
    style.font.italic = italic
    rpr = style._element.get_or_add_rPr()
    rfonts = rpr.rFonts
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.insert(0, rfonts)
    for key in ("ascii", "hAnsi", "cs", "eastAsia"):
        rfonts.set(qn(f"w:{key}"), FONT)
    if align is not None:
        style.paragraph_format.alignment = align
    style.paragraph_format.keep_with_next = True
    style.paragraph_format.keep_together = True
    return style


def new_paragraph_before(anchor, doc, *, text="", role="body", bold=False, italic=False, align=None, size=None, color=INK, before=0, after=None, keep=False, indent=0, hanging=0):
    element = OxmlElement("w:p")
    anchor.addprevious(element)
    paragraph = Paragraph(element, doc._body)
    paragraph.style = doc.styles["Normal"]
    if role == "title":
        paragraph.style = doc.styles["Title"]
        align, size, before, after, keep = WD_ALIGN_PARAGRAPH.CENTER, size or 24, 14, 8, True
    elif role == "subtitle":
        align, size, before, after = WD_ALIGN_PARAGRAPH.CENTER, size or 11, 0, 7
    elif role == "author":
        align, size, before, after = WD_ALIGN_PARAGRAPH.CENTER, size or 10.5, 0, 2
    elif role == "h1":
        paragraph.style = doc.styles["Heading 1"]
        align, size, before, after, keep = WD_ALIGN_PARAGRAPH.CENTER, size or 10, 11, 6, True
    elif role == "h2":
        paragraph.style = doc.styles["Heading 2"]
        align, size, before, after, keep = WD_ALIGN_PARAGRAPH.CENTER, size or 10, 8, 4, True
    elif role == "caption":
        align, size, italic, before, after, keep = WD_ALIGN_PARAGRAPH.CENTER, size or 8.5, True, 4, 8, True
    elif role == "table_caption":
        align, size, bold, before, after, keep = WD_ALIGN_PARAGRAPH.CENTER, size or 8.5, True, 5, 3, True
    elif role == "abstract":
        align, size, before, after = WD_ALIGN_PARAGRAPH.JUSTIFY, size or 9, 0, 5
    elif role == "keywords":
        align, size, bold, italic, before, after = WD_ALIGN_PARAGRAPH.JUSTIFY, size or 9, True, True, 5, 8
    else:
        align = WD_ALIGN_PARAGRAPH.JUSTIFY if align is None else align
        size, before, after = size or 9.5, before, 6 if after is None else after
    paragraph.alignment = align
    fmt = paragraph.paragraph_format
    fmt.space_before = Pt(before)
    fmt.space_after = Pt(6 if after is None else after)
    fmt.line_spacing = 1.0
    fmt.keep_together = keep
    fmt.keep_with_next = role in {"title", "subtitle", "h1", "h2", "table_caption"}
    if indent:
        fmt.left_indent = Inches(indent)
    if hanging:
        fmt.first_line_indent = Inches(-hanging)
    if text:
        set_run_font(paragraph.add_run(text), size=size, bold=bold, italic=italic, color=color)
    return paragraph


def add_rich_paragraph(anchor, doc, runs, *, role="body", align=None):
    paragraph = new_paragraph_before(anchor, doc, role=role, align=align)
    for text, style in runs:
        set_run_font(paragraph.add_run(text), **style)
    return paragraph


def add_bold_lead(anchor, doc, lead, text):
    return add_rich_paragraph(anchor, doc, [(lead, {"size": 9.5, "bold": True}), (text, {"size": 9.5})])


def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)
    shd.set(qn("w:val"), "clear")


def set_cell_margins(cell, top=65, start=65, bottom=65, end=65):
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for margin, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{margin}"))
        if node is None:
            node = OxmlElement(f"w:{margin}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_table_borders(table):
    tbl_pr = table._tbl.tblPr
    borders = tbl_pr.first_child_found_in("w:tblBorders")
    if borders is None:
        borders = OxmlElement("w:tblBorders")
        tbl_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        element = borders.find(qn(f"w:{edge}"))
        if element is None:
            element = OxmlElement(f"w:{edge}")
            borders.append(element)
        element.set(qn("w:val"), "single")
        element.set(qn("w:sz"), "4")
        element.set(qn("w:space"), "0")
        element.set(qn("w:color"), GRID)


def style_table(table, widths, *, font_size=8.0, header=True):
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    total_width = sum(widths)
    tbl_pr = table._tbl.tblPr
    tbl_w = tbl_pr.find(qn("w:tblW"))
    if tbl_w is None:
        tbl_w = OxmlElement("w:tblW")
        tbl_pr.append(tbl_w)
    tbl_w.set(qn("w:w"), str(round(total_width * 1440)))
    tbl_w.set(qn("w:type"), "dxa")
    set_table_borders(table)
    for column, width in zip(table.columns, widths):
        column.width = Inches(width)
    for row_index, row in enumerate(table.rows):
        tr_pr = row._tr.get_or_add_trPr()
        if header and row_index == 0:
            repeat = OxmlElement("w:tblHeader")
            repeat.set(qn("w:val"), "true")
            tr_pr.append(repeat)
        tr_pr.append(OxmlElement("w:cantSplit"))
        for column_index, cell in enumerate(row.cells):
            cell.width = Inches(widths[column_index])
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            set_cell_margins(cell)
            for paragraph in cell.paragraphs:
                paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT
                paragraph.paragraph_format.space_before = Pt(0)
                paragraph.paragraph_format.space_after = Pt(0)
                paragraph.paragraph_format.line_spacing = 1.0
                for run in paragraph.runs:
                    set_run_font(run, size=font_size, bold=(header and row_index == 0), color=INK)


def add_table_before(anchor, doc, rows, widths, *, font_size=8.0):
    table = doc.add_table(rows=len(rows), cols=len(widths))
    if anchor.tag != qn("w:sectPr"):
        anchor.addprevious(table._tbl)
    for row_index, values in enumerate(rows):
        for column_index, value in enumerate(values):
            cell = table.cell(row_index, column_index)
            cell.text = value
            for run in cell.paragraphs[0].runs:
                set_run_font(run, size=font_size, bold=(row_index == 0 or column_index == 0), color=INK)
    style_table(table, widths, font_size=font_size)
    return table


def add_box_placeholder(anchor, doc, text, caption, *, height_inches=1.25):
    table = doc.add_table(rows=2, cols=1)
    if anchor.tag != qn("w:sectPr"):
        anchor.addprevious(table._tbl)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    table.columns[0].width = Inches(3.05)
    set_table_borders(table)
    for row in table.rows:
        row._tr.get_or_add_trPr().append(OxmlElement("w:cantSplit"))
        cell = row.cells[0]
        cell.width = Inches(3.05)
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        set_cell_margins(cell, top=80, start=80, bottom=80, end=80)
    table.rows[0].height = Inches(height_inches)
    table.rows[0].height_rule = 2
    table.rows[1].height = Inches(0.36)
    table.rows[1].height_rule = 2
    set_cell_shading(table.cell(0, 0), PALE)
    for cell, value, italic, color, size in (
        (table.cell(0, 0), text, True, "6B7C73", 9),
        (table.cell(1, 0), caption, True, INK, 8),
    ):
        paragraph = cell.paragraphs[0]
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        paragraph.paragraph_format.space_before = Pt(0)
        paragraph.paragraph_format.space_after = Pt(0)
        paragraph.paragraph_format.line_spacing = 1.0
        set_run_font(paragraph.add_run(value), size=size, italic=italic, color=color)
    return table


def add_inline_figure(anchor, doc, path: Path, description: str, *, width=3.05):
    paragraph = doc.add_paragraph()
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    paragraph.paragraph_format.space_before = Pt(2)
    paragraph.paragraph_format.space_after = Pt(0)
    paragraph.paragraph_format.keep_with_next = True
    shape = paragraph.add_run().add_picture(str(path), width=Inches(width))
    shape._inline.docPr.set("descr", description)
    anchor.addprevious(paragraph._p)
    return paragraph


if not REFERENCE.exists() or sha256(REFERENCE) != EXPECTED_REFERENCE_HASH:
    raise RuntimeError("The retained reference DOCX no longer matches its distilled SHA-256.")
WORK.mkdir(parents=True, exist_ok=True)
make_architecture_image(ARCH_IMAGE)
FIGURES = make_figures(WORK, ROOT)
doc = Document(str(REFERENCE))

section_break_paragraphs = [p for p in doc.paragraphs if p._p.pPr is not None and p._p.pPr.sectPr is not None]
if len(section_break_paragraphs) != 2 or len(doc.inline_shapes) != 1:
    raise RuntimeError("The template structure changed; re-distill before authoring.")
break_one = copy.deepcopy(section_break_paragraphs[0]._p)
break_two = copy.deepcopy(section_break_paragraphs[1]._p)
source_image_paragraph = next(p for p in doc.paragraphs if p._p.xpath(".//w:drawing"))
blip = source_image_paragraph._p.xpath(".//a:blip")
if not blip:
    raise RuntimeError("The architecture figure relationship was not found.")
image_part = doc.part.related_parts[blip[0].get(qn("r:embed"))]
image_part._blob = ARCH_IMAGE.read_bytes()

body = doc._element.body
body_sect = body.sectPr
for child in list(body):
    if child is not body_sect:
        body.remove(child)
body.insert(body.index(body_sect), break_one)
body.insert(body.index(body_sect), break_two)

normal = ensure_style(doc, "Normal", size=9.5)
ensure_style(doc, "Title", size=24, align=WD_ALIGN_PARAGRAPH.CENTER)
ensure_style(doc, "Heading 1", size=10, align=WD_ALIGN_PARAGRAPH.CENTER)
ensure_style(doc, "Heading 2", size=10, italic=True, align=WD_ALIGN_PARAGRAPH.CENTER)
doc.styles["Heading 1"].paragraph_format.space_before = Pt(11)
doc.styles["Heading 1"].paragraph_format.space_after = Pt(6)
doc.styles["Heading 2"].paragraph_format.space_before = Pt(8)
doc.styles["Heading 2"].paragraph_format.space_after = Pt(4)

new_paragraph_before(break_one, doc, text="CARBengine Campus Energy Monitoring", role="title", size=24)
new_paragraph_before(break_one, doc, text="An IoT Platform for Energy and Carbon Analytics", role="subtitle", size=11, italic=True, color="000000")
new_paragraph_before(break_one, doc, text="Technical Architecture Dataset Forecast Models and Evaluation", role="subtitle", size=9, italic=True, color="000000")

for line in [
    "Student Name(s): __________________________________",
    "Roll Number(s): ____________________________________",
    "Department / Program: _____________________________",
    "Project Team / Division: ___________________________",
]:
    new_paragraph_before(break_two, doc, text=line, role="author")
column_break = new_paragraph_before(break_two, doc, role="author")
column_break.add_run().add_break(WD_BREAK.COLUMN)
for line in [
    "Project Guide: _____________________________________",
    "Institute: _________________________________________",
    "Location: __________________________________________",
    "Academic Year: _____________________________________",
]:
    new_paragraph_before(break_two, doc, text=line, role="author")

body_anchor = body_sect
abstract = (
    "CARBengine is an Internet of Things (IoT) campus-energy monitoring prototype integrating an ESP32/PZEM-004T acquisition path, Supabase PostgreSQL, a React/TypeScript dashboard, and a Python forecasting service. This paper documents the system architecture, the implemented functions of eleven dashboard tabs, the student-designed EasyEDA printed-circuit-board (PCB) work, the data model, and the analytical assumptions. The forecasting layer keeps two horizons separate: a River online linear-regression pipeline estimates five-minute sensor power, while seasonal ARIMA with exogenous regressors (SARIMAX) models monthly bill consumption and amount. The available bill input contains 95 raw rows across three provenance classes; the processed modeling file contains one 84-month, source-unverified series comprising 25 untouched rows, 23 adjusted estimates, and 36 synthetic extension rows. A stored chronological backtest on five untouched months reports consumption and bill-amount MAPE of 19.48% and 12.77%, respectively; a repeated-last-value baseline scores 17.78% and 15.07%. These results are exploratory because the holdout is small and the source series is unverified. Live sensor readings are accessed from a private Supabase project and were not available as a local evaluation dataset. The paper therefore separates measured records, algorithmic estimates, and illustrative planning features, and specifies the additional hardware and field validation required before operational use."
)
add_rich_paragraph(body_anchor, doc, [("Abstract - ", {"size": 9, "bold": True}), (abstract, {"size": 9, "bold": True})], role="abstract")
add_rich_paragraph(body_anchor, doc, [("Keywords - ", {"size": 9, "bold": True, "italic": True}), ("IoT energy monitoring, ESP32, PZEM-004T, Supabase Realtime, carbon accounting, online learning, SARIMAX, EasyEDA PCB", {"size": 9, "bold": True, "italic": True})], role="keywords")

new_paragraph_before(body_anchor, doc, text="I. INTRODUCTION", role="h1")
new_paragraph_before(body_anchor, doc, text="Campus energy management depends on measurements at different time scales. Electrical meters provide near-real-time voltage, current, active power, cumulative energy, frequency, and power factor, whereas utility statements aggregate consumption and cost by billing period. A useful campus information system must preserve the distinction between these signals while providing a common view of current conditions, historical patterns, forecasts, and emissions estimates. It must also identify data gaps and uncertainty; an attractive dashboard alone does not establish measurement accuracy or forecast validity.")
new_paragraph_before(body_anchor, doc, text="CARBengine is an engineering prototype built around a PZEM-004T meter, an ESP32-based controller, and an existing data-ingestion path. The repository contains a React single-page application, Supabase reads and subscriptions, role-aware administration, sustainability interfaces, and a FastAPI service. The ESP32 firmware, upload endpoint, live Supabase dataset, and final electrical design are maintained outside the repository. The paper describes these boundaries explicitly so that application behavior is not confused with hardware functions that have not been independently verified.")
new_paragraph_before(body_anchor, doc, text="The work has five objectives: (1) present electrical readings with timestamps and data-freshness state; (2) make short-range trends, energy deltas, and carbon estimates interpretable; (3) provide a streaming sensor-power forecast and an independently fitted monthly bill forecast; (4) organize campus costs, travel, audit records, goals, and access roles in one application; and (5) define a reproducible route from prototype behavior to field validation. The River model addresses a five-minute horizon from sensor telemetry. The SARIMAX workflow addresses monthly bill series and has distinct input validation, source selection, and chronological scoring.")
new_paragraph_before(body_anchor, doc, text="The principal contributions are an integrated telemetry-to-dashboard architecture; a documented online-learning loop with delayed target matching; a monthly bill-forecast pipeline with explicit data-origin labels and a small chronological holdout; and a tab-level account of where the application uses statistical models versus deterministic calculations or planning scenarios. The student team has also designed a custom PCB in EasyEDA. Final circuit images, board renderings, component values, pin mapping, and fabrication/test information are left as insertion fields because those physical design records were not supplied with the software repository.")
new_paragraph_before(body_anchor, doc, text="The remainder of this paper follows the structure of the supplied technical-paper reference: Roman-numbered major sections, lettered subsections, numbered tables and figures, and bracketed references. Section II establishes the technical background. Sections III–VI describe architecture, data preparation, models, software, and each dashboard tab. Section VII defines calculations, Section VIII reports implementation and backtest evidence, and Section IX discusses limitations and future work. Section X concludes the paper, followed by references.")

new_paragraph_before(body_anchor, doc, text="II. TECHNICAL BACKGROUND AND RELATED WORK", role="h1")
new_paragraph_before(body_anchor, doc, text="A. Networked energy monitoring", role="h2")
new_paragraph_before(body_anchor, doc, text="An IoT monitoring pipeline links a measurement device, a controller, a network transport, a data store, and a user interface. In this project, the PZEM-004T provides the electrical quantities consumed by the application, while an ESP32-based node is the configured device endpoint. The specific ESP32 module, meter version, current-sensing range, supply design, and firmware protocol must be recorded from the assembled hardware before the paper is submitted. The ESP32 family provides wireless and peripheral interfaces suitable for networked embedded applications [1].")
new_paragraph_before(body_anchor, doc, text="A responsive dashboard can subscribe to database changes instead of refreshing the entire page after each measurement. Supabase Realtime supports Postgres change subscriptions; CARBengine listens for filtered INSERT events on the sensor table and keeps a periodic fetch as a fallback [2]. This prototype uses the simpler Postgres Changes path; a larger deployment should evaluate the current Broadcast option and its authorization model as connection volume grows [2]. Database authorization remains a separate concern: the project includes Supabase Auth, role/module checks, and row-level security policies so that access is enforced at the data layer as well as in navigation [3].")
new_paragraph_before(body_anchor, doc, text="B. Two forecasting horizons", role="h2")
new_paragraph_before(body_anchor, doc, text="Streaming online learning is appropriate when observations arrive continuously and a model is updated incrementally. River provides online estimators and metrics for processing one sample at a time [6]. CARBengine uses a scaled online linear-regression pipeline for the five-minute PZEM power forecast. Monthly billing history has a different sampling interval and source structure, so it is modeled separately with SARIMAX, a seasonal state-space time-series model [7], [11]. The Box–Jenkins model-building framework emphasizes identification, estimation, forecasting and diagnostic checking; this implementation fixes a small order from project configuration and relies on chronological holdout scores, so additional residual diagnostics remain future work. Combining sensor and bill records into one series would mix units, timestamps and data-generation processes.")
new_paragraph_before(body_anchor, doc, text="C. Campus carbon accounting", role="h2")
new_paragraph_before(body_anchor, doc, text="A dashboard can estimate indirect emissions by multiplying an energy quantity by an emission factor, but that result is not a direct measurement of greenhouse gases. A location-based purchased-electricity estimate generally uses a grid-average factor defined for a region and reporting period; a market-based method may depend on qualifying contractual instruments. CARBengine currently uses one configurable default factor and does not gather electricity-supplier contracts, certificates, factor geography or reporting-year metadata. It therefore presents operational estimates, not a Scope 2 inventory. The factor, energy boundary, meter reset behavior and source data quality determine the result. Institutional reporting should replace prototype defaults with approved, traceable factors and retain supporting source documents [12].")
new_paragraph_before(body_anchor, doc, text="D. Evidence levels in decision-support software", role="h2")
new_paragraph_before(body_anchor, doc, text="An engineering dashboard can combine measurements, deterministic transformations, forecasts, and user-entered scenarios. These outputs have different evidential status. A timestamped PZEM reading is a sensor record subject to calibration and upload integrity; a carbon value is derived by multiplying energy by a selected factor; a SARIMAX line is a model estimate with a forecast interval; and a reduction-goal projection can be a scenario supplied by the user or embedded in the interface. CARBengine exposes all four types of outputs, so this paper names their method and data provenance separately. In particular, the Campus Anomaly Monitor currently applies connectivity and display thresholds but does not fit an anomaly-detection model. The Carbon Reduction Goals page calculates planning scenarios but does not estimate causal savings. This distinction is necessary for a technically defensible interpretation of the product.")

new_paragraph_before(body_anchor, doc, text="III. SYSTEM ARCHITECTURE AND METHODOLOGY", role="h1")
new_paragraph_before(body_anchor, doc, text="A. Overall architecture", role="h2")
new_paragraph_before(body_anchor, doc, text="The data path begins at the PZEM-004T meter and ESP32 node. An existing upload service, which is maintained outside this repository, writes readings to public.sensor_readings in Supabase PostgreSQL. The web client retrieves the latest and historical rows for the configured device and subscribes to matching inserts. A separately deployed FastAPI service provides the River sensor forecast and the SARIMAX bill forecast. The bill workflow reads local CSV data during development; it is not derived from PZEM readings.")
image_clone = copy.deepcopy(source_image_paragraph._p)
for docpr in image_clone.xpath(".//wp:docPr"):
    docpr.set("name", "CARBengine System Data Flow")
    docpr.set("descr", "PZEM-004T and ESP32 readings flow through an existing uploader to Supabase and the CARBengine dashboard; separate FastAPI services provide sensor and bill forecasts.")
body_anchor.addprevious(image_clone)
image_paragraph = Paragraph(image_clone, doc._body)
image_paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
image_paragraph.paragraph_format.space_before = Pt(3)
image_paragraph.paragraph_format.space_after = Pt(0)
image_paragraph.paragraph_format.keep_with_next = True
new_paragraph_before(body_anchor, doc, text="Fig. 1. CARBengine telemetry and forecasting data flow.", role="caption")

new_paragraph_before(body_anchor, doc, text="B. Hardware and EasyEDA PCB", role="h2")
new_paragraph_before(body_anchor, doc, text="The known hardware elements are the PZEM-004T AC energy-meter module, an ESP32 Wi-Fi controller, and a custom PCB layout designed by the student team in EasyEDA [10]. The software configuration identifies the monitored endpoint as ELEC-01. Exact board variant, PZEM revision and range, terminal wiring, interface pins, regulated supply, protection devices, enclosure, and calibration reference must be copied from the final build and circuit drawing. No pin map or electrical rating is inferred in this paper.")
new_paragraph_before(body_anchor, doc, text="TABLE I. HARDWARE ELEMENTS AND BUILD RECORD", role="table_caption")
add_table_before(body_anchor, doc, [
    ["Element", "Function", "Project record"],
    ["PZEM-004T", "Measures voltage, current, power, energy, frequency, and power factor.", "Meter version and current range to confirm."],
    ["ESP32 board", "Reads the meter and provides the configured networked device endpoint.", "Exact module and firmware details to add."],
    ["EasyEDA PCB", "Student-designed board layout for the hardware assembly.", "Design created; fabrication and test status to add."],
    ["Upload path", "Transfers readings to Supabase before dashboard consumption.", "Firmware and upload service are outside this repository."],
], [0.78, 1.28, 0.99], font_size=7.7)
new_paragraph_before(body_anchor, doc, text="Fig. 2. Insert the final circuit diagram and wiring view in the space below.", role="table_caption")
add_box_placeholder(body_anchor, doc, "Insert final circuit diagram here", "Circuit diagram and interface wiring", height_inches=1.35)
new_paragraph_before(body_anchor, doc, text="The circuit image should identify the meter, ESP32 board, power rails, interface connection, protection components, connectors, and the monitored load path. Populate the exact values and pin names from the final schematic.")
new_paragraph_before(body_anchor, doc, text="The PCB section records a student-created EasyEDA layout, but the project material reviewed for this paper does not establish a fabrication or electrical-test status. When inserting the board images, retain the EasyEDA project revision and include legible callouts for the board dimensions, connector designations, component references, copper-layer count, and the interface between the PZEM module and controller. A final release review should compare the board against the circuit diagram and bill of materials, check design-rule results, and document continuity and low-voltage power checks before any mains-connected bench test [10].")
new_paragraph_before(body_anchor, doc, text="Fig. 3. Insert the EasyEDA PCB layout and 3D board image.", role="table_caption")
pcb_table = doc.add_table(rows=2, cols=2)
if body_anchor.tag != qn("w:sectPr"):
    body_anchor.addprevious(pcb_table._tbl)
pcb_table.alignment = WD_TABLE_ALIGNMENT.CENTER
pcb_table.autofit = False
set_table_borders(pcb_table)
for idx, width in enumerate([1.5, 1.5]):
    pcb_table.columns[idx].width = Inches(width)
for cell, label in zip(pcb_table.rows[0].cells, ["Insert PCB top-view image", "Insert EasyEDA 3D board render"]):
    cell.width = Inches(1.5)
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    set_cell_margins(cell, top=80, start=60, bottom=80, end=60)
    set_cell_shading(cell, PALE)
    pbox = cell.paragraphs[0]
    pbox.alignment = WD_ALIGN_PARAGRAPH.CENTER
    pbox.paragraph_format.space_before = Pt(0)
    pbox.paragraph_format.space_after = Pt(0)
    pbox.paragraph_format.line_spacing = 1.0
    set_run_font(pbox.add_run(label), size=8, italic=True, color="6B7C73")
for cell, label in zip(pcb_table.rows[1].cells, ["(a) PCB layout", "(b) 3D board view"]):
    cell.width = Inches(1.5)
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    pcap = cell.paragraphs[0]
    pcap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    pcap.paragraph_format.space_before = Pt(1)
    pcap.paragraph_format.space_after = Pt(1)
    set_run_font(pcap.add_run(label), size=8, italic=True, color=INK)
for row in pcb_table.rows:
    row._tr.get_or_add_trPr().append(OxmlElement("w:cantSplit"))
    for cell in row.cells:
        set_cell_margins(cell, top=55, start=55, bottom=55, end=55)
pcb_table.rows[0].height = Inches(1.05)
pcb_table.rows[0].height_rule = 2
pcb_table.rows[1].height = Inches(0.32)
pcb_table.rows[1].height_rule = 2

new_paragraph_before(body_anchor, doc, text="C. Sensor data contract and live update path", role="h2")
new_paragraph_before(body_anchor, doc, text="The frontend and forecast service use the existing public.sensor_readings table. Each record is selected by device_id and ordered by recorded_at. Numeric sensor values may arrive as strings or numbers and are normalized before calculations. The UI formats timestamps in India Standard Time (Asia/Kolkata).")
new_paragraph_before(body_anchor, doc, text="TABLE II. SENSOR READING FIELDS", role="table_caption")
add_table_before(body_anchor, doc, [
    ["Field", "Unit", "Meaning"],
    ["device_id", "text", "Identifier for the configured meter endpoint."],
    ["recorded_at", "timestamp", "Time of the measurement record."],
    ["voltage_v", "V", "RMS voltage value provided by the meter."],
    ["current_a", "A", "Measured current."],
    ["power_w", "W", "Instantaneous active power."],
    ["energy_kwh", "kWh", "Cumulative meter energy counter."],
    ["frequency_hz", "Hz", "Grid frequency."],
    ["power_factor", "unitless", "Power-factor value."],
], [0.75, 0.55, 1.75], font_size=7.7)
new_paragraph_before(body_anchor, doc, text="The dashboard combines a filtered Supabase Realtime INSERT subscription with a five-second query for the latest record. The subscription provides the normal event-driven update; polling helps recover the latest state if a change event is missed. A freshness classifier marks readings as fresh for up to 15 seconds, delayed from 15 to 60 seconds, and offline after 60 seconds. When the last record is stale, live values are not presented as current readings.")

new_paragraph_before(body_anchor, doc, text="D. Separate analysis services", role="h2")
new_paragraph_before(body_anchor, doc, text="CARBengine uses independent model services because the inputs have different physical meaning and cadence. The River service consumes voltage, current, power, frequency, and power-factor readings and predicts a near-term power value in watts. The SARIMAX service consumes monthly records keyed by meter and source classification and predicts billing-period consumption, demand, and amount. The live forecast is updated prequentially as target readings arrive; the bill models are batch-fitted and cached against a dataset fingerprint. The distinction avoids training a single time-series model on a mixture of one-minute electrical observations and monthly invoice data [6], [7].")

new_paragraph_before(body_anchor, doc, text="IV. BILLING DATASET PROFILE AND PREPARATION", role="h1")
new_paragraph_before(body_anchor, doc, text="A. Available data and provenance", role="h2")
new_paragraph_before(body_anchor, doc, text="The repository includes two local bill CSV files and a remote sensor-table contract. The raw bill file contains 95 rows with seven source fields and spans January 2019 through December 2025. Its rows are deliberately tagged as 48 secondary-source/unverified records, 11 rows labeled ACTUAL_FROM_USER_PDF, and 36 synthetic demonstration rows. The processed file preferred by the API contains 84 consecutive months for a single series, UNKNOWN_ONLINE_REPORT_SCOPE / SECONDARY_SOURCE_UNVERIFIED. Of these, 25 remain untouched source rows, 23 are replaced seasonal estimates, and 36 are a generated extension. The raw file's PDF label is not treated as verification by the API: the source-quality function requires an explicit VERIFIED label and classifies these PDF rows as pending verification. No live sensor readings are stored in either CSV; the sensor table is remote and no row-level telemetry export was present in the files reviewed.")
new_paragraph_before(body_anchor, doc, text="TABLE III. BILLING AND TELEMETRY DATA INVENTORY", role="table_caption")
add_table_before(body_anchor, doc, [
    ["Dataset", "Coverage and size", "Provenance and use"],
    ["Live sensor_readings", "Remote Supabase table; local sample count unavailable.", "One row per upload with electrical measurements; used by Live, Analytics, Device and River API."],
    ["Raw bill CSV", "95 records; 2019-01 to 2025-12; seven columns.", "48 unverified, 11 PDF-labeled and 36 synthetic-demo rows; three distinct meter/source identifiers."],
    ["Processed model CSV", "84 consecutive monthly rows; 2019-01 to 2025-12; eight columns.", "One unverified series: 25 untouched, 23 adjusted and 36 synthetic rows; current bill model input."],
], [0.72, 1.12, 1.21], font_size=7.2)
new_paragraph_before(body_anchor, doc, text="The monthly schema records timestamp, billing_month, meter_id, consumption_kwh, max_demand_kva, bill_amount_inr, data_type, and, in the processed file, row_origin. Consumption and amount are required numeric values; maximum demand may be absent. The loader checks that timestamp and billing month refer to the same calendar month, rejects malformed or negative required quantities, and removes duplicate meter/month/source keys. Each meter_id/data_type pair is kept as its own series. A series must have at least eight consecutive months for a limited-history forecast and at least 24 consecutive months for the annual seasonal model. These structural checks do not establish that an invoice or source classification is authentic.")

new_paragraph_before(body_anchor, doc, text="B. Processing and lineage of the selected series", role="h2")
new_paragraph_before(body_anchor, doc, text="When the processed file exists, the forecast API selects it ahead of the raw file. Its generator selects 48 consecutive months from January 2019 to December 2022 for the unverified base series and preserves the original CSV unchanged. For each calendar month, the script compares a record with other years' same-month consumption values. Values below 45% of the peer median become candidate anomalies; only a contiguous run of at least six candidate months is treated as a sustained low segment. In the current processed file, the rule flags April 2020 through February 2022, a span of 23 months. This is a deterministic data-cleaning rule, not a finding that the original bills are incorrect.")
new_paragraph_before(body_anchor, doc, text="For the flagged segment, the generator estimates consumption, maximum demand, and bill amount separately. It uses annual means from mostly complete clean years, derives normalized calendar-month factors, and interpolates the annual level between the first and last reference years. The estimates replace the original values only in the processed working copy and receive row_origin=adjusted. The extension then estimates January 2023 through December 2025 from annual trend and month-of-year factors. The projected annual mean is constrained to within 25% of the last historical annual mean, and generated rows receive row_origin=synthetic. These operations provide a continuous series for exploratory forecasting; neither adjusted nor synthetic values are independent observations.")
new_paragraph_before(body_anchor, doc, text="TABLE IV. PROCESSING RULES AND OUTPUT COUNTS", role="table_caption")
add_table_before(body_anchor, doc, [
    ["Stage", "Rule applied", "Current result"],
    ["Selection", "meter_id=UNKNOWN_ONLINE_REPORT_SCOPE and data_type=SECONDARY_SOURCE_UNVERIFIED; require 48 consecutive source months.", "48 rows, Jan. 2019–Dec. 2022."],
    ["Low-segment flag", "Same-month peer ratio below 0.45; at least six consecutive candidate months.", "Apr. 2020–Feb. 2022; 23 rows."],
    ["Adjustment", "Seasonal month factors multiplied by a linearly interpolated annual level.", "25 unchanged source rows + 23 adjusted estimates."],
    ["Extension", "Annual trend plus monthly seasonality; annual mean clipped to ±25% of final source-year mean.", "36 synthetic rows, Jan. 2023–Dec. 2025."],
], [0.65, 1.54, 0.86], font_size=7.0)
new_paragraph_before(body_anchor, doc, text="The API fits its current 84-row series from the processed file. Consequently the user-interface source counts for this run describe one unverified series, not the three provenance groups in the raw CSV. The raw PDF-labeled records and the synthetic demonstration meter are excluded from this processed file. If the processed file is removed and the API falls back to the raw CSV, rows are regrouped by meter and data_type and remain separate; the PDF-labeled group is pending verification and the demonstration series is exploratory. This file-selection behavior is a material deployment and interpretation detail.")
add_inline_figure(body_anchor, doc, FIGURES["dataset"], "Line chart of the raw and processed unverified monthly bill series, including historical, adjusted and synthetic intervals.")
new_paragraph_before(body_anchor, doc, text="Fig. 4. Monthly energy in the selected unverified billing series. The 2020–2022 adjusted interval and 2023–2025 synthetic extension are visually distinguished from untouched values.", role="caption")
add_inline_figure(body_anchor, doc, FIGURES["provenance"], "Stacked bars compare the 95 raw bill records across unverified, PDF-labeled and synthetic-demo rows with the 84 processed rows split into untouched, adjusted and synthetic origins.")
new_paragraph_before(body_anchor, doc, text="Fig. 5. Provenance composition of the raw input and processed forecast series.", role="caption")
add_bold_lead(body_anchor, doc, "Selected-series range. ", "Across the 84 processed rows, monthly consumption ranges from 1,479,960 to 4,688,760 kWh, with a median of 3,339,600 kWh. Maximum demand ranges from 4,200 to 9,468.45 kVA, with an 8,012.64 kVA median. Bill amount ranges from ₹8,056,050 to ₹34,413,114, with a ₹20,858,181.27 median. These summaries mix untouched, adjusted and synthetic records; they describe the modeling file and are not independently verified campus statistics.")
new_paragraph_before(body_anchor, doc, text="Figure 4 makes the transformation visible: the raw selected source falls below one million kWh in much of the April 2020–February 2022 segment, while the processed file substitutes seasonal estimates of roughly two to four million kWh. The processed file is therefore a materially transformed series rather than a direct copy of the raw observations. Reproducible reporting should retain both files, record the generator version and parameters, and identify the exact artifact used for each forecast.")

new_paragraph_before(body_anchor, doc, text="C. Reproducibility and deployment boundary", role="h2")
new_paragraph_before(body_anchor, doc, text="The processed file is local and is ignored by version control. The current dataset fingerprint is a095561fbbd804d3 (first 16 hexadecimal characters of SHA-256); stored model metadata identifies model version sarimax-v1 and statsmodels 0.15.0. The service invalidates cached fits when the source fingerprint or software/model version changes. A hosted API cannot read a developer's local ignored folder unless the deployment explicitly includes the file. Before deployment or academic replication, the team should preserve the original source separately, publish a cleaned non-sensitive dataset with provenance notes, configure BILLS_DATASET_PATH or migrate records to a protected database table, and state which exact file produced each model output.")

new_paragraph_before(body_anchor, doc, text="V. FORECAST MODEL DESIGN", role="h1")
new_paragraph_before(body_anchor, doc, text="A. Five-minute online sensor-power model", role="h2")
new_paragraph_before(body_anchor, doc, text="The live prediction service is an online, one-device, prequential learner implemented with River. It composes StandardScaler and LinearRegression, using stochastic gradient descent with learning rate 0.01 and L2 regularization 0.0001. Standardization is updated incrementally as observations arrive, while the linear regression receives one labeled example at a time. The target is active power approximately five minutes after a forecast origin. Forecast origins are created no more frequently than once per minute when valid readings are available. The service stores pending forecasts with their originating feature vectors so that a later target is paired with the correct earlier input.")
new_paragraph_before(body_anchor, doc, text="For an origin at time t, the learner predicts ŷₜ₊₅ = bₜ + wₜᵀxₜ, where xₜ contains the eleven electrical, change and cyclic-time features listed in Table V. For local minute-of-day d and minute-of-week m, the time features use sine/cosine pairs sin(2πd/1440), cos(2πd/1440), sin(2πm/10080), and cos(2πm/10080). These encodings make midnight and week boundaries continuous in feature space. The prediction is clamped at zero because negative active power is not meaningful for this project's intended load-monitoring view; this design does not support bidirectional generation accounting.", align=WD_ALIGN_PARAGRAPH.JUSTIFY)
new_paragraph_before(body_anchor, doc, text="TABLE V. RIVER MODEL INPUT FEATURES", role="table_caption")
add_table_before(body_anchor, doc, [
    ["Feature group", "Inputs", "Purpose"],
    ["Electrical state", "power_w, current_a, voltage_v, frequency_hz, power_factor", "Describe the present operating point."],
    ["Short-term change", "power_delta_w, voltage_delta_v", "Capture recent movement when the preceding row is within two minutes."],
    ["Daily phase", "day_sin, day_cos", "Encode local time of day without a discontinuity at midnight."],
    ["Weekly phase", "week_sin, week_cos", "Encode day-of-week/time-of-week cyclically in Asia/Kolkata."],
], [0.83, 1.32, 0.90], font_size=7.1)
new_paragraph_before(body_anchor, doc, text="A reading is eligible for model learning when its timestamp parses, power is non-negative, and voltage is between 80 and 300 V. Duplicate fingerprints and out-of-order timestamps are ignored. For lag features, the previous valid power and voltage are used only when the gap is at most two minutes; otherwise the current values form the neutral change baseline. A forecast is scored and learned when a target arrives at or after its five-minute due time and no more than two minutes late. The mean absolute error (MAE) is updated on the stored forecast before the model learns from that target, avoiding use of the target to produce the prediction being scored. Unmatched pending forecasts expire. The service waits for 12 trained target pairs before returning a ready power value; before that it reports warming, and it reports stale when the latest accepted reading is over 60 seconds old [6].")
add_inline_figure(body_anchor, doc, FIGURES["river"], "River online forecasting workflow from eligible meter reading through feature scaling, five-minute prediction, delayed target scoring and online model update.")
new_paragraph_before(body_anchor, doc, text="Fig. 6. Prequential learning loop for the River sensor-power forecast.", role="caption")
new_paragraph_before(body_anchor, doc, text="On service startup, the model can bootstrap from up to 20,000 rows from a 14-day window, then persists per-device model state locally and loads only records newer than its cursor after restart. The deployment is designed for one API worker per device configuration because the model state and pending targets are held in process memory and local files. A multi-worker or horizontally scaled deployment would require shared state or explicit partitioning by device. The live sensor dataset is not packaged with the repository, so this paper does not report a sensor forecast score, a learned coefficient set, or a field accuracy claim.")

new_paragraph_before(body_anchor, doc, text="B. Monthly SARIMAX bill model", role="h2")
new_paragraph_before(body_anchor, doc, text="The bill forecaster groups validated rows by meter_id and data_type and fits separate monthly models for consumption and bill amount. It also forecasts maximum demand when all values are available; that demand forecast is supplied as an exogenous predictor to the consumption and bill-amount models. The current selected input is the 84-month unverified series described in Section IV. Since its monthly calendar is complete and the input span exceeds 24 months, the production forecast uses a seasonal model. A distinct holdout fit may use a non-seasonal version when fewer than 24 untouched training observations remain.")
new_paragraph_before(body_anchor, doc, text="The implementation specifies SARIMAX order (1,1,1) and, for seasonal histories, seasonal order (0,1,0,12). In compact regression-with-SARIMA-errors notation, yₜ = βᵀxₜ + uₜ and φ₁(B)(1−B)(1−B¹²)uₜ = θ₁(B)εₜ; B is the lag operator, yₜ is a monthly target, and xₜ is the forecast maximum demand when available. The exogenous term is omitted when demand is incomplete. The seasonal difference compares a month with the corresponding month one year earlier. The implementation uses a fixed model order rather than automated order search and does not include tariff, weather, occupancy, calendar or building-operations covariates. The service fits by maximum likelihood with stationarity and invertibility constraints disabled, permits up to 100 optimizer iterations, floors negative forecast means and interval endpoints at zero, and returns twelve months of forecasts with nominal 95% model-based intervals [7], [11].")
new_paragraph_before(body_anchor, doc, text="TABLE VI. SARIMAX CONFIGURATION AND OUTPUTS", role="table_caption")
add_table_before(body_anchor, doc, [
    ["Item", "Implementation in CARBengine"],
    ["Sampling interval", "One monthly observation per billing month; each meter/source group remains separate."],
    ["Core order", "ARIMA (1,1,1): first difference, AR(1), MA(1)."],
    ["Seasonal order", "(0,1,0,12) for complete series with at least 24 months; otherwise (0,0,0,0)."],
    ["Targets", "Consumption (kWh), bill amount (INR), and maximum demand (kVA)."],
    ["Exogenous input", "Forecast maximum demand for consumption and amount models when demand is complete."],
    ["Horizon and intervals", "12 months; nominal 95% confidence intervals from model prediction results."],
    ["Cache", "Local result/model files keyed by series, target and dataset fingerprint; versioned by sarimax-v1 and statsmodels."],
], [0.98, 2.07], font_size=7.2)
new_paragraph_before(body_anchor, doc, text="These intervals reflect uncertainty under the fitted statistical model and its input assumptions. They do not include all structural uncertainty from billing corrections, future tariff changes, altered campus occupancy, weather, or newly installed equipment. Although the API keeps meter and source series separate, the current processed input's entire 84-month training history includes adjusted estimates and synthetic extension rows. The forecast should therefore be described as an exploratory projection from a mixed-origin unverified history, not a verified college-bill forecast. The service reports productionReady=false unless the selected source is explicitly verified and seasonal data are available.")

new_paragraph_before(body_anchor, doc, text="VI. SOFTWARE IMPLEMENTATION AND DASHBOARD TAB ANALYSIS", role="h1")
new_paragraph_before(body_anchor, doc, text="A. Software stack", role="h2")
new_paragraph_before(body_anchor, doc, text="The application is a browser-based single-page interface. React 19 and TypeScript implement the client, while Vite 7 bundles the production application. The Supabase JavaScript client handles authentication, filtered PostgreSQL reads, and Realtime subscriptions. Recharts renders sensor and bill-series plots, and Lucide React supplies interface icons. The Python service uses FastAPI for REST endpoints, River for streaming sensor learning, and statsmodels 0.15.0 for batch monthly SARIMAX. Leaflet, OpenStreetMap tiles, and OSRM support the commute view. Vercel configuration is provided for the static client; the Python service and local bill dataset require separate deployment planning [4], [5], [8], [9].")
new_paragraph_before(body_anchor, doc, text="TABLE VII. SOFTWARE COMPONENTS AND IMPLEMENTATION ROLE", role="table_caption")
add_table_before(body_anchor, doc, [
    ["Component", "Role in CARBengine", "Implementation"],
    ["React 19 / TypeScript", "Dashboard views, state, calculations and access-aware navigation.", "Browser single-page client."],
    ["Vite 7", "Development server, bundling and static output.", "Vercel-compatible client build."],
    ["Supabase JS / PostgreSQL", "Authentication, database reads, access policies and Realtime.", "Consumes the existing project/table."],
    ["FastAPI", "Forecast and protected account-administration endpoints.", "Python API deployed separately."],
    ["River 0.26.1", "Incremental five-minute PZEM power prediction.", "StandardScaler + linear regression."],
    ["statsmodels 0.15.0", "Monthly consumption, demand and amount forecast.", "SARIMAX; local result cache."],
    ["Recharts / Lucide React", "Charts, tooltips and UI iconography.", "Client visualization components."],
    ["Leaflet / OSM / OSRM", "Commute route geometry and mode comparison.", "External route service plus fallback estimate."],
], [0.78, 0.98, 1.29], font_size=7.4)

new_paragraph_before(body_anchor, doc, text="B. Analytical method by dashboard tab", role="h2")
new_paragraph_before(body_anchor, doc, text="The application contains statistical models in two areas: a streaming River forecast in the sensor workflow and a monthly SARIMAX forecast in the bill workflow. The other tabs use database queries, thresholds, arithmetic, map routing, access-control rules, or illustrative scenario data. TABLE VIII makes this difference explicit before the functional details that follow.")
new_paragraph_before(body_anchor, doc, text="TABLE VIII. TAB-LEVEL INPUTS, METHODS AND OUTPUTS", role="table_caption")
add_table_before(body_anchor, doc, [
    ["Tab", "Main method", "Output and status"],
    ["Live Monitoring", "Latest-row query + Realtime + 5 s poll; freshness rule.", "Live electrical values and River forecast; no local readings are substituted."],
    ["Energy & Carbon Analytics", "Time filters, meter delta/trapezoid integration, EF multiplication.", "Historical trends, calculated CO2e and River estimate."],
    ["Bill History & Forecast", "Monthly source validation + SARIMAX per meter/source.", "Actual/estimated history, 12-month forecasts and intervals."],
    ["Cost & Green Tax", "Period energy multiplied by two configured per-kWh values.", "Illustrative cost and green-tax allocation."],
    ["Campus Anomaly Monitor", "Power-color bands + connectivity thresholds.", "One mapped sensor; consumption baseline not assessed."],
    ["Carbon Reduction Goals", "Baseline/target arithmetic and scenario levers.", "Planning projection; no learned or measured savings model."],
    ["Campus Sustainability Audit", "Quantity × configured category factor; localStorage.", "User-entered records and CSV export; no independent approval."],
    ["Know Your Carbon", "OSRM route distance × mode factor × trips/days.", "Illustrative commute emissions and mode comparison."],
    ["Device", "Reading-age state and sensor-row query.", "Fresh/delayed/offline status and recent telemetry."],
    ["User Management", "Supabase profile query/update + protected admin API.", "Role/department management and guarded deletion."],
    ["Tab Permissions", "Role-module matrix + SQL RLS/API checks.", "Configurable page access; admin retains full access."],
], [0.80, 1.0, 1.25], font_size=7.0)

add_bold_lead(body_anchor, doc, "1) Live Monitoring. ", "The landing view retrieves the newest row for the configured device identifier (ELEC-01 by default), orders by recorded_at, and refreshes through a filtered PostgreSQL INSERT subscription with a five-second latest-row query as a recovery path. Six electrical quantities are presented with units and context: voltage (V), current (A), active power (W), cumulative energy (kWh), frequency (Hz), and power factor. A rotating metric panel adds carbon-today, selected-period, cumulative-footprint, emission-rate, approximate five-second emission, and grid-factor summaries. Readings up to 15 seconds old are shown as connected; older readings become delayed and values over 60 seconds are offline. If no fresh row exists, the page zeros the live cards rather than presenting stale telemetry as current.")
add_bold_lead(body_anchor, doc, "2) Energy and Carbon Analytics. ", "This page combines date/time filters, historical power and carbon charts, period energy and emission totals, a forecast card, and a searchable sensor-history table. Sensor queries are paginated in 1,000-row batches up to a 20,000-row request ceiling. The page prefers a valid cumulative meter delta between the first and last readings in the selected period; if that is unavailable, it may integrate adjacent power samples, rejecting intervals over five minutes. The configurable grid factor converts kWh to CO2e. The short-horizon model value comes from the River API and is kept separate from the historical series so a predicted point cannot be mistaken for a measurement. The trend is limited by remote-row access, selected interval, time-zone conversion, and the history cap.")
add_bold_lead(body_anchor, doc, "3) Bill History and Forecast. ", "The billing panel loads a selected meter/source series from the Python service, allows the user to compare monthly consumption with bill amount, displays actual-or-estimated history and forecast intervals, and exposes source readiness, row origin, and backtest diagnostics. The API's preferred file in the current workspace is the 84-month processed series, not the complete raw 95-row file; the selected series is unverified and mixes untouched, adjusted, and synthetic values. Accordingly the chart is useful for demonstrating the interface and forecast workflow, while not supporting a claim of verified institutional billing performance. The service fits up to 12 future monthly points and provides 95% model-based intervals; absent, gapped, or insufficient data produce a not-ready status instead of a fabricated forecast.")
add_bold_lead(body_anchor, doc, "4) Cost and Green Tax. ", "The cost view filters a period and derives kWh from meter delta or valid power integration, then multiplies that energy by ₹11.80/kWh for an electricity-cost estimate and ₹12.85/kWh for the configured green-tax allocation. Hourly charts reuse the same calculation after converting integrated carbon back to energy. A displayed 10% reduction scenario scales the estimated period cost and allocation arithmetically. The page does not read an institution's bill, tariff schedule, tax assessment, demand charge, time-of-use rate, or surcharge. The term green tax is an interface label for an illustrative allocation; the figure is not an assessed tax or an amount payable to a utility.")
add_bold_lead(body_anchor, doc, "5) Campus Anomaly Monitor. ", "The campus page maps the configured sensor to a Floor 1 classroom location on the supplied architectural plan. It summarizes total live power, current health, today's cumulative-meter delta, the last sample and connectivity alerts. The color scale uses display bands of 0–300 W, 301–1,000 W and above 1,000 W. These bands describe current intensity only; no statistical baseline or anomaly classifier is implemented. The page explicitly reports high consumption as Not assessed while expected-use baselines are pending. Ground Floor is a placeholder awaiting a verified drawing, and rooms without sensors are not estimated. This is therefore a sensor-location and connectivity monitor, not an implemented building-wide anomaly-detection system.")
add_bold_lead(body_anchor, doc, "6) Carbon Reduction Goals. ", "This planning page accepts a monthly or annual interval, a reduction percentage, and a user-entered or initialized baseline. It computes the target cap and pacing indicators and lets the user toggle campus reduction levers to display scenario savings, estimated tariff savings, and a projected path against the target. The chart includes illustrative example/projected points in the source and does not calculate a regression forecast from measured campus energy. The baseline initialization can use meter energy and the configured grid factor, but a complete verified campus baseline and a time-stamped record of actual implemented projects are absent. Results should be presented as what-if estimates until meter coverage, comparison periods, and intervention evidence are established.")
add_bold_lead(body_anchor, doc, "7) Campus Sustainability Audit. ", "The audit interface organizes electricity, water, waste and recycling-credit entries. It multiplies user-entered quantities by category-specific configured factors, retains cost and invoice metadata, supports filtering/search and exports a CSV for review. Entries are persisted in the current browser's localStorage, not in a shared server-side audit database. Selecting a document records the file name and size; the underlying file bytes are not uploaded. The interface sets a verified status on submission, but no independent reviewer approval or source-document check is performed. Thus the record is a locally maintained prototype ledger and should not be represented as an institutionally audited inventory. Production work needs authenticated document storage, reviewer identity, status transitions and change history.")
add_bold_lead(body_anchor, doc, "8) Know Your Carbon. ", "The commute tool accepts a start and destination, displays a map through Leaflet/OpenStreetMap and requests a road route from OSRM. If routing is unavailable, the interface falls back to an estimated route distance. It compares transport modes by multiplying route distance by an embedded mode factor, then scales one-way emissions to a month or academic year using two trips per day and 220 days. Prototype factors include 0.170 kg CO2e/km for a solo petrol car, 0.035 for city bus, 0.025 for metro/local rail, and zero for walking/cycling. These factors and the travel calendar are assumptions; they should be replaced with locally approved, sourced values before an official campus footprint is calculated [8], [9].")
add_bold_lead(body_anchor, doc, "9) Device. ", "The device page presents the configured endpoint ID, the last timestamp, voltage-related context such as frequency and power factor, recent sensor rows, and the connection state. It applies the same upload-age logic: connected through 15 seconds, delayed through 60 seconds, then offline. Refresh controls re-query the remote table, while the page reports whether the Supabase Realtime channel has connected. This view is intended for technician diagnosis of data availability and recency; it does not inspect ESP32 firmware logs, Wi-Fi RSSI, internal temperature, power-supply voltage, or meter calibration because those values are not in the application schema.")
add_bold_lead(body_anchor, doc, "10) User Management. ", "The administrator-only panel queries active user profiles and supports email/account-ID search, department filtering, and role/department changes. Account removal is sent to a protected FastAPI endpoint that validates the caller's bearer session and active administrator profile before using a server-side Supabase secret. Client and server checks reject self-deletion and protect the last active administrator. The browser does not receive the service-role secret. Profile search and updates still rely on the Supabase SQL setup and correctly configured row-level policies; the application UI alone is not the security boundary.")
add_bold_lead(body_anchor, doc, "11) Tab Permissions. ", "The permissions matrix configures which modules student, faculty, and technician roles can open, with administrator access retained across all modules. The default SQL seed grants students live, analytics, goals and travel; faculty live, analytics, cost, bill forecast, anomaly, goals, audit and travel; technicians live, device, anomaly and audit. Administrators can change these defaults in the interface. Page visibility is supplemented by database row-level security and authorization checks in forecast/admin endpoints. This layered design is intended to prevent a hidden navigation link from being mistaken for data authorization. The setup still requires the schema, policies and first administrator profile to be installed in Supabase [3].")

new_paragraph_before(body_anchor, doc, text="C. Authentication and access model", role="h2")
new_paragraph_before(body_anchor, doc, text="Supabase Auth maintains the browser session. Active profiles receive one of four roles: admin, student, faculty, or technician. Dashboard modules and role-module permissions determine which pages non-admin users can access. The SQL setup applies row-level security to user profiles, module settings, role permissions, sensor readings, and device records. Forecast endpoints validate the bearer session and module access; the account-deletion endpoint separately validates an active administrator before using a server-side secret. The secret key is not part of the frontend configuration. The supplied SQL setup must be applied and the first administrator profile created before these policies are active.")
new_paragraph_before(body_anchor, doc, text="TABLE IX. DEFAULT ROLE-TO-MODULE ACCESS", role="table_caption")
add_table_before(body_anchor, doc, [
    ["Role", "Default module access", "Administrative scope"],
    ["Student", "Live; analytics; goals; travel.", "No user or device administration."],
    ["Faculty", "Live; analytics; cost; bill forecast; anomaly; goals; audit; travel.", "No account deletion or role administration by default."],
    ["Technician", "Live; device; anomaly; audit.", "Operational views; no user administration."],
    ["Admin", "All modules.", "Manage users, permissions and protected operations."],
], [0.62, 1.48, 0.95], font_size=7.0)
new_paragraph_before(body_anchor, doc, text="The matrix records the supplied SQL seed and application defaults. Role names or visible tabs do not replace server-side authorization: project policies, API checks, active-profile status and the installed database schema determine actual access. The first administrator profile must be established through the documented setup procedure before the matrix can be managed through the interface.")

new_paragraph_before(body_anchor, doc, text="VII. CALCULATIONS AND ASSUMPTIONS", role="h1")
new_paragraph_before(body_anchor, doc, text="A. Energy and carbon estimates", role="h2")
new_paragraph_before(body_anchor, doc, text="For a valid cumulative meter series, period electricity use is the final reading minus the first reading within the selected interval. A decreasing counter may indicate a reset or rollover; the application does not turn that boundary into a negative energy total. If a meter delta cannot be formed, some analytics pages integrate consecutive active-power samples using the trapezoidal rule:")
new_paragraph_before(body_anchor, doc, text="E_interval (kWh) = [(P_i + P_(i+1)) / 2] × Δt_hours / 1000", align=WD_ALIGN_PARAGRAPH.CENTER, size=9.5, italic=True, before=2, after=4)
new_paragraph_before(body_anchor, doc, text="Power is stored in watts and converted to kilowatts through division by 1,000. Intervals longer than five minutes are omitted so a long communication gap is not treated as continuous consumption. The software may calculate the carbon-equivalent quantity as:")
new_paragraph_before(body_anchor, doc, text="CO₂e (kg) = E (kWh) × EF_grid (kg CO₂e/kWh)", align=WD_ALIGN_PARAGRAPH.CENTER, size=9.5, italic=True, before=2, after=4)
new_paragraph_before(body_anchor, doc, text="The default electricity factor is 0.82 kg CO₂e/kWh and may be overridden by frontend configuration. Instantaneous emission rate equals power in kilowatts multiplied by the same factor and is expressed as kg CO₂e/h. A period estimate is the sum of accepted intervals multiplied by the factor. These are indirect emissions estimates, not direct gas measurements or an audited institutional inventory. Factor scope, geography, publication year and source must accompany any formal report.")
new_paragraph_before(body_anchor, doc, text="B. Cost, sustainability, and travel", role="h2")
new_paragraph_before(body_anchor, doc, text="The electricity-cost estimate is energy multiplied by ₹11.80/kWh. The page's green-tax allocation uses ₹12.85/kWh; it is an illustrative rate and is not an assessed campus charge. A displayed 10% reduction scenario scales the estimate arithmetically. The audit tab applies configured quantity factors to user-entered electricity, water, waste and recycling records. The repository defaults are 0.82 kg CO₂e/kWh, 0.38 kg CO₂e/kL, 1.85 kg CO₂e/kg for landfill waste, and −0.80 kg CO₂e/kg for a recycling credit. Their source, geographical boundary and publication period are not documented in the project. Tiered tariffs, demand charges, time-of-use prices, tax rules, and institution-specific billing adjustments are not modeled.")
new_paragraph_before(body_anchor, doc, text="For commute estimates, one-way emissions are route distance multiplied by a mode-specific factor; the displayed academic-year value scales to two one-way trips per day and 220 days. Embedded prototype values include 0.170 kg CO₂e/km for a solo petrol car, 0.035 for city bus, 0.025 for metro/local rail, and zero for walking or cycling. The annual trip count is a user-facing scenario assumption rather than observed travel behavior. Any campus report should document route source, mode occupancy, factor units, date and geographic applicability.")
new_paragraph_before(body_anchor, doc, text="TABLE X. APPLICATION CONSTANTS AND INTERPRETATION", role="table_caption")
add_table_before(body_anchor, doc, [
    ["Quantity", "Prototype value or rule", "Interpretation"],
    ["Grid factor", "0.82 kg CO₂e/kWh", "Configurable estimate; source validation required."],
    ["Electricity rate", "₹11.80/kWh", "Cost estimate; not a utility bill calculation."],
    ["Green-tax allocation", "₹12.85/kWh", "Illustrative UI rate; not an assessed tax."],
    ["Water / landfill / recycling", "0.38 kg CO₂e/kL; 1.85 kg CO₂e/kg; −0.80 kg CO₂e/kg", "Audit defaults without recorded provenance."],
    ["Commute factors", "Car 0.170; bus 0.035; rail 0.025; walk/cycle 0 kg CO₂e/km", "Prototype mode factors; local validation required."],
    ["Academic-year travel", "2 one-way trips/day × 220 days", "Scenario calendar, not measured attendance."],
    ["Freshness thresholds", "≤15 s fresh; 15–60 s delayed; >60 s offline", "Dashboard status derived from latest timestamp."],
], [0.93, 1.12, 1.0], font_size=6.8)
new_paragraph_before(body_anchor, doc, text="C. Forecast interpretation", role="h2")
new_paragraph_before(body_anchor, doc, text="The short-horizon sensor estimate is power at a point approximately five minutes ahead. Its five-minute energy projection is predicted power in kilowatts multiplied by 5/60 h; projected CO₂e then follows from the selected grid factor. It is a model output and should not be appended to the measured historical series. The monthly bill forecast predicts consumption, amount and, when complete, maximum demand on a separate billing series. A nominal 95% model interval does not include every structural change in occupancy, tariff, billing policy or equipment.")

new_paragraph_before(body_anchor, doc, text="VIII. IMPLEMENTATION STATUS AND EVALUATION", role="h1")
new_paragraph_before(body_anchor, doc, text="A. Implemented functions and evidence boundary", role="h2")
new_paragraph_before(body_anchor, doc, text="The repository contains the browser dashboard, Supabase authentication and sensor-read components, filtered Realtime subscriptions, the River forecast API, the bill SARIMAX service, role/module administration, campus sustainability pages, and static-host configuration. Deployment expects an existing Supabase project and sensor_readings schema. The ESP32 firmware and sensor upload endpoint are outside this software repository. The project files contain a cached chronological bill-series backtest, but no local live sensor history, calibrated meter comparison, hardware latency benchmark, or user study. River forecast accuracy, measurement accuracy, update latency, and measured energy savings therefore remain unquantified.")
new_paragraph_before(body_anchor, doc, text="B. Monthly bill forecast backtest", role="h2")
new_paragraph_before(body_anchor, doc, text="The cached backtest uses five chronologically later untouched rows, August through December 2022, and 20 preceding rows labelled historical for training. The sequence is below the 24 untouched-observation threshold for a seasonal fit, so the evaluated configuration is nonseasonal. Scoring is performed independently for monthly consumption and bill amount. As a transparent reference, the persistence baseline repeats the last untouched pre-holdout value from July 2022 for all five forecast months. Both model and baseline are scored on the same five actuals using mean absolute error (MAE), root mean squared error (RMSE), and mean absolute percentage error (MAPE). The baseline was computed for this paper and is not currently exposed as a dashboard metric.")
new_paragraph_before(body_anchor, doc, text="For n scored months, the metrics are MAE = (1/n)Σ|yᵢ − ŷᵢ|, RMSE = √[(1/n)Σ(yᵢ − ŷᵢ)²], and MAPE = (100/n)Σ|((yᵢ − ŷᵢ)/yᵢ)|. Consumption errors are in kWh and amount errors are in rupees; the percentage error is dimensionless. Each holdout actual is nonzero. Values in Table XI are rounded for display, and no interval-coverage statistic is reported.", align=WD_ALIGN_PARAGRAPH.CENTER, size=9.2, italic=True, before=2, after=5)
new_paragraph_before(body_anchor, doc, text="TABLE XI. FIVE-MONTH CHRONOLOGICAL HOLDOUT RESULTS", role="table_caption")
add_table_before(body_anchor, doc, [
    ["Target", "Metric", "SARIMAX", "Persistence"],
    ["Consumption (kWh)", "MAE", "719,783.4", "647,760.0"],
    ["Consumption (kWh)", "RMSE", "823,867.0", "720,617.5"],
    ["Consumption (kWh)", "MAPE", "19.48%", "17.78%"],
    ["Bill amount (₹)", "MAE", "3,025,396.4", "3,637,136.6"],
    ["Bill amount (₹)", "RMSE", "4,565,618.5", "5,196,109.5"],
    ["Bill amount (₹)", "MAPE", "12.77%", "15.07%"],
], [1.0, 0.46, 0.79, 0.80], font_size=7.1)
add_inline_figure(body_anchor, doc, FIGURES["holdout"], "Five monthly actual observations compared with SARIMAX and a repeated July 2022 persistence baseline for energy and bill amount.")
new_paragraph_before(body_anchor, doc, text="Fig. 7. Monthly backtest values and the same-holdout persistence baseline.", role="caption")
new_paragraph_before(body_anchor, doc, text="On this small sample, the persistence baseline has lower consumption error: its MAPE is 17.78% versus 19.48% for SARIMAX, and its MAE and RMSE are also lower. For bill amount, SARIMAX has the lower MAPE (12.77% versus 15.07%) and lower MAE/RMSE. The amount result may partly reflect the relation between consumption and tariff structure; it does not establish general forecast superiority. Only five observations are scored, the underlying source is unverified, and the processed training file contains adjusted and synthetic rows. A broader evaluation must use additional verified billing periods, more than one rolling origin, independent meter/source groups, and interval coverage.")
new_paragraph_before(body_anchor, doc, text="C. Field validation plan", role="h2")
new_paragraph_before(body_anchor, doc, text="The available repository does not include an experimental record for sensor accuracy, end-to-end latency, data continuity, River holdout performance, usability, or intervention savings. The following protocol identifies the evidence to collect before presenting these as measured outcomes.")
new_paragraph_before(body_anchor, doc, text="TABLE XII. PROPOSED FIELD AND MODEL VALIDATION", role="table_caption")
add_table_before(body_anchor, doc, [
    ["Measure", "Method", "Report"],
    ["Meter accuracy", "Compare PZEM values with a traceable reference meter over several known loads.", "Reference instrument, load points, error by quantity."],
    ["Update latency", "Record source timestamp and browser receipt time over a defined run.", "Sample count, median, 95th percentile, missing events."],
    ["Data continuity", "Compare uploaded records with acquisition intervals and connection logs.", "Coverage, gaps, duplicates, delayed readings."],
    ["Sensor forecast", "Chronological holdout; compare River output with persistence baseline.", "MAE/RMSE in W, horizon, holdout dates, sample count."],
    ["Bill forecast", "Hold out later observed months per verified meter/source series.", "MAE/RMSE/MAPE for kWh and amount; forecast interval coverage."],
    ["Access control", "Exercise allowed and denied roles against UI, API, and RLS policies.", "Role matrix and observed allow/deny outcomes."],
], [0.78, 1.35, 0.92], font_size=7.1)
new_paragraph_before(body_anchor, doc, text="Every experiment should record the hardware and PCB revision, installation point, reference instrument and calibration date, sampling interval, firmware/service version, dates, network conditions, data-quality exclusions, model version, forecast horizon, and test count. Sensor evaluation should pair readings with a traceable reference across known resistive and representative campus loads. Bill validation should use verified rows only, preserve billing boundaries, exclude adjusted and synthetic values from the target, and evaluate several rolling chronological origins. Results should include the persistence baseline and forecast-interval coverage.")
new_paragraph_before(body_anchor, doc, text="D. Discussion", role="h2")
new_paragraph_before(body_anchor, doc, text="The software combines functions that operate at different evidence levels. Live values depend on the sensor, uploader, clock and database; energy and carbon charts apply deterministic transformations; forecasts depend on a fitted model and a source series; and goals and travel screens include user-selected scenarios. The explicit module boundaries are useful for a campus prototype because they show where a decision is based on direct telemetry and where it depends on assumptions. The main implementation gap is not a missing chart: it is the absence of a verified, multi-period campus dataset and a calibrated end-to-end hardware record.")
new_paragraph_before(body_anchor, doc, text="The bill holdout also illustrates why model comparisons need a transparent baseline. SARIMAX improves the reported amount errors over persistence on the five-month window, while persistence performs better for consumption. These target-specific results do not support one overall accuracy label. The selected file's adjusted and synthetic history may help the interface demonstrate a continuous seasonal workflow, but those rows do not add independent evidence. The next evaluation should report rolling-origin distributions and interval coverage by meter, not only a single average score. The project should also test whether a demand exogenous variable improves results against an otherwise identical model without that input.")
new_paragraph_before(body_anchor, doc, text="For deployment, a single configured device and a local file-based bill service are manageable during development but constrain scaling and reproducibility. A production campus installation would need a documented device registry, authenticated ingestion, a shared durable history, timestamp and unit validation, coordinated model state, monitored service health, and controlled releases of tariff and emissions factors. These changes would strengthen the system's evidence chain without changing the dashboard's user-facing organization.")

new_paragraph_before(body_anchor, doc, text="IX. LIMITATIONS AND FUTURE WORK", role="h1")
new_paragraph_before(body_anchor, doc, text="The software repository is configured around one selected sensor device. It does not contain the ESP32 firmware, device uploader, live Supabase readings, circuit diagram, final bill of materials, assembled-board photographs, or a calibrated field dataset. Consequently, power-meter accuracy, AC-side isolation, enclosure, wiring, firmware timing, upload authentication and device-side failure handling cannot be assessed from the available files. The three hardware placeholders are intended for the final circuit and EasyEDA board images; the student team should also add exact revision, component values, pin map and fabrication/test status.")
new_paragraph_before(body_anchor, doc, text="The raw bill file contains 95 rows split across three provenance groups, whereas the preferred modeling input contains 84 consecutive months from one source-unverified series. In that processed series, only 25 rows are untouched; 23 are adjusted estimates and 36 are synthetic extensions. The API fits the complete mixed-origin series, while its stored scoring window uses five untouched later months. This is not an independent utility-bill verification, and the short window is not enough to establish seasonal or cross-site performance. A production pipeline should preserve original documents, reconcile meter identity and billing periods, mark each transformation, and build rolling tests from verified records only.")
new_paragraph_before(body_anchor, doc, text="The River service pairs delayed targets with forecasts and persists state locally for a device. Its behavior depends on a single-worker or otherwise coordinated deployment because in-memory online updates and local model files are not a distributed state store. No sensor time series was present in the reviewed local project, so no River accuracy number is reported. Multi-device deployment should isolate model state per authenticated device, handle duplicate/out-of-order readings, and record model/data versions with each score.")
new_paragraph_before(body_anchor, doc, text="The campus map has one configured marker and no expected-use baseline. Its power bands describe displayed load, not statistical anomalies. Goal charts include scenario data rather than a complete verified institutional baseline. Audit records remain in browser localStorage, attached files are not uploaded, and a client-side verified status is not independent approval. These modules are workflow prototypes; operational reporting needs durable, reviewable records and explicit evidence for each claim.")
new_paragraph_before(body_anchor, doc, text="Carbon, water, waste, travel and tariff assumptions need documented provenance, units and version dates. The commute route service can fail and return a fallback distance. The energy analytics path is subject to remote row permissions and a 20,000-row history ceiling. Authentication and row-level security depend on correct Supabase installation; the source repository includes a setup script but cannot prove the deployment configuration. Further work should implement device-authenticated ingestion, multiple sensor locations, approved and versioned factors, an expected-use anomaly baseline, persistent audit-document storage, and reproducible model monitoring. The EasyEDA layout should be checked against the final schematic, bill of materials, board-rule review and bench tests before fabrication or mains connection.")

new_paragraph_before(body_anchor, doc, text="X. CONCLUSION", role="h1")
new_paragraph_before(body_anchor, doc, text="CARBengine is a multi-layer campus-energy prototype that connects PZEM-004T measurements and an ESP32 endpoint to Supabase, a React dashboard and Python forecasting services. Its eleven tabs span live telemetry, historical energy and carbon views, monthly bills, costs, campus monitoring, reduction planning, audit workflows, travel estimates, device status and role administration. The student-designed EasyEDA PCB adds a custom hardware-integration contribution, with circuit and board images reserved for insertion in this paper.")
new_paragraph_before(body_anchor, doc, text="The implementation keeps a five-minute online sensor-power model separate from monthly bill forecasting and distinguishes measurements from calculated emissions, model predictions and user-defined scenarios. The available five-month bill backtest shows mixed results against a simple persistence baseline and uses a source-unverified series, so it is preliminary evidence rather than proof of operational forecasting quality. Completing the circuit/build record, verifying the bill data, comparing the meter against a reference, and measuring the system in a real campus deployment are the next steps toward a reliable engineering evaluation.")

new_paragraph_before(body_anchor, doc, text="REFERENCES", role="h1")
references = [
    "[1] Espressif Systems, 'ESP32 Series Datasheet,' Technical Documentation, https://documentation.espressif.com/esp32_datasheet_en.html. Accessed 22 Oct. 2026.",
    "[2] Supabase, 'Subscribing to Database Changes,' Supabase Documentation, https://supabase.com/docs/guides/realtime/subscribing-to-database-changes. Accessed 22 Oct. 2026.",
    "[3] Supabase, 'Row Level Security,' Supabase Documentation, https://supabase.com/docs/guides/database/postgres/row-level-security. Accessed 22 Oct. 2026.",
    "[4] React Team, 'Quick Start,' React Documentation, https://react.dev/learn. Accessed 22 Oct. 2026.",
    "[5] FastAPI, 'Tutorial - User Guide,' https://fastapi.tiangolo.com/tutorial/. Accessed 22 Oct. 2026.",
    "[6] J. Montiel, M. Halford, S. M. Mastelini, G. Bolmier, R. Sourty, R. Vaysse, A. Zouitine, H. M. Gomes, J. Read, T. Abdessalem, and A. Bifet, 'River: machine learning for streaming data in Python,' Journal of Machine Learning Research, vol. 22, no. 1, pp. 1-8, 2021. https://www.jmlr.org/papers/volume22/20-1380/20-1380.pdf.",
    "[7] statsmodels developers, 'SARIMAX,' statsmodels Documentation, https://www.statsmodels.org/stable/generated/statsmodels.tsa.statespace.sarimax.SARIMAX.html. Accessed 22 Oct. 2026.",
    "[8] Open Source Routing Machine Project, 'OSRM HTTP Server API Documentation,' https://project-osrm.org/docs/v26.6.1/http. Accessed 22 Oct. 2026.",
    "[9] Leaflet, 'Leaflet 1.9.4 API Reference,' https://leafletjs.com/reference. Accessed 22 Oct. 2026.",
    "[10] EasyEDA, 'PCB Layout,' EasyEDA Std User Guide, https://docs.easyeda.com/en/Introduction/PCB-Layout/. Accessed 22 Oct. 2026.",
    "[11] G. E. P. Box, G. M. Jenkins, G. C. Reinsel, and G. M. Ljung, Time Series Analysis: Forecasting and Control, 5th ed. Hoboken, NJ, USA: Wiley, 2015. https://www.wiley.com/en-in/time-series-analysis-forecasting-and-control-5th-edition-p-9781118674918.",
    "[12] Greenhouse Gas Protocol, Scope 2 Guidance: An Amendment to the GHG Protocol Corporate Standard. Washington, DC, USA: World Resources Institute and World Business Council for Sustainable Development, 2015. https://ghgprotocol.org/sites/default/files/GHG%20Protocol%20Scope%202%20Guidance.pdf.",
]
for item in references:
    p = new_paragraph_before(body_anchor, doc, text=item, role="body", size=8.4, after=4)
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.left_indent = Inches(0.16)
    p.paragraph_format.first_line_indent = Inches(-0.16)
    p.paragraph_format.keep_together = True

props = doc.core_properties
props.title = "CARBengine IoT Based Energy Monitoring and Carbon Analytics"
props.subject = "Final year engineering project technical paper"
props.author = ""
props.last_modified_by = ""
props.keywords = "CARBengine, IoT, ESP32, PZEM-004T, energy monitoring, carbon analytics, EasyEDA"
doc.save(str(OUTPUT))

check = Document(str(OUTPUT))
all_text = "\n".join(p.text for p in check.paragraphs)
all_text += "\n" + "\n".join(cell.text for table in check.tables for row in table.rows for cell in row.cells)
if "NOSTV" in all_text or "Prabodh Bodele" in all_text or "Atharva Jadhav" in all_text:
    raise RuntimeError("Sample-template content or author identities remain in the new paper.")
if len(check.sections) != 3 or len(check.inline_shapes) != 5 or len(check.tables) != 14:
    raise RuntimeError(f"Unexpected final structure: sections={len(check.sections)}, images={len(check.inline_shapes)}, tables={len(check.tables)}")
for required in ("VII. CALCULATIONS AND ASSUMPTIONS", "VIII. IMPLEMENTATION STATUS AND EVALUATION", "IX. LIMITATIONS AND FUTURE WORK", "X. CONCLUSION", "TABLE XII. PROPOSED FIELD AND MODEL VALIDATION"):
    if required not in all_text:
        raise RuntimeError(f"Missing required paper section or caption: {required}")
if sha256(REFERENCE) != EXPECTED_REFERENCE_HASH:
    raise RuntimeError("The source template changed during paper creation.")
print(f"Created {OUTPUT}")
print(f"Sections={len(check.sections)}; inline figures={len(check.inline_shapes)}; tables={len(check.tables)}; bytes={OUTPUT.stat().st_size}")
print(f"Reference SHA-256 unchanged: {sha256(REFERENCE)}")

