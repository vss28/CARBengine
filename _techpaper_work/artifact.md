# Template distillation contract

## Reference and evidence
- Reference: `C:\Users\vedan\Desktop\pending assignments\EXCS BE -09 NOS TV Tech Paper.docx`
- SHA-256: `8F80A8BCDE1E44D758896BCA02206E584B3371E166A1FCD706202358B0EB64B3`
- Page count: 13, rendered by the installed Microsoft Word engine to `_techpaper_work/reference.pdf`; all 13 pages were rasterized from that PDF at 144 dpi and visually inspected (`_techpaper_work/reference-render/page-01.png` through `page-13.png`).
- Structural evidence: `_techpaper_work/template-style-evidence.json`; section audit reported 3 portrait sections, 8.50 x 11.00 in, 1.00 in margins.
- The reference remained unchanged at the recorded SHA-256 after rendering.

## Page system
- US Letter portrait, 8.50 x 11.00 in, all margins 1.00 in, header/footer distance 0.50 in.
- Three sections: Section 1 starts a new page and is single column; Section 2 starts continuous with two columns separated by 0.50 in; Section 3 starts continuous with two columns separated by 0.50 in.
- No visible header or footer, page number, running title, or odd/even-page treatment.
- Content is compact, paper-like, and flows in two columns after the title/author block. Preserve this three-section layout and column system.

## Typography and hierarchy
- Typeface is Times New Roman throughout.
- Main title is approximately 24 pt, centered, with generous top whitespace. The sample underlines the title; omit the underline in the new paper to follow the document skill's title rule while retaining the centered serif title treatment.
- Author affiliations are approximately 11 pt, centered, arranged across two columns.
- Body and headings are approximately 10 pt. Body paragraphs are justified with a modest after-space. Main Roman-numeral headings are centered, regular weight, and set off with whitespace. Lettered subsection headings are centered and italic. Numbered subheads use bold lead-ins. Figure captions are centered italic; table captions are centered uppercase.
- The reference uses direct formatting rather than built-in Title/Heading paragraph styles. Do not import a generic style system; use the existing paragraph and run formatting patterns.

## Tables, figures, and components
- One 7-row by 5-column comparison table uses a thin light-gray grid and bold header/row labels. The source table is an editable slot and may be replaced by hardware/software or data-structure tables that fit the same paper style.
- One inline PNG system diagram (`word/media/image1.png`, 768 x 432 px) appears in the technical-body columns with a centered italic caption. Replace its content with a CARBengine data-flow diagram while preserving the image relationship and visual slot.
- The source has one image, one table, 441 body paragraphs, no text header/footer, and no content controls. There are 13 package parts; preserve the base package and retained styles, numbering, section geometry, relationships, and other untouched parts where practical.
- The sample contains unrelated NOSTV subject matter and personal author data. Rewrite all body text and remove all sample identities; retain only its paper structure and visual system.

## Content flow and editable slots
1. Full-width centered title in Section 1.
2. Two-column author/institution metadata in Section 2; keep fill-in lines for student names, roll numbers, project guide, department/program, institute, location, and academic year.
3. Abstract and keywords, then numbered technical-paper sections in Section 3. Use the same Roman numeral/letter subsection ladder and two-column flow.
4. System architecture figure slot and caption, then hardware, EasyEDA PCB, software, data flow, forecasts, tab-by-tab functionality, calculations, prototype evaluation, limitations, conclusion, and references.
5. Three intentionally blank image slots: (a) circuit diagram, (b) EasyEDA PCB layout/top view, and (c) EasyEDA 3D board view. Use clear captions and restrained insertion boxes so the student can replace them with supplied images.

## Package preservation and fidelity gates
- Editable: title/author text, abstract/keywords, body paragraphs, source figure image bytes/caption, source comparison table content, and in-body figure slots.
- Preserve: section/page geometry, continuous section breaks, core Word package, typography and spacing patterns, existing theme/style definitions, and unmodified package relationships. Do not retain unrelated prose, names, email addresses, or the source comparison content.
- Final check: render final DOCX through Word to PDF, rasterize every page, inspect each PNG at 100%, and iterate for readable two-column flow, clean table/figure breaks, no clipping/overlap, and intentional image placeholders. Confirm the retained reference hash is unchanged.
