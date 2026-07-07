# Resume PDF Export Produces Rasterized, Non-Selectable Text

Date: July 7, 2026
Status: Fixed and verified (manual highlight-copy-paste test passed in a browser on July 7, 2026)

## Issue Title

Resume PDF exported via html2pdf.js contains flattened image text that cannot be selected, copied, or parsed by Applicant Tracking Systems (ATS).

## Root Cause

The original specification mandated html2pdf.js for PDF compilation with a quality gate requiring native vector text output. These two requirements are mutually incompatible by design of the library:

1. html2pdf.js is a convenience wrapper that pipes the target DOM node through html2canvas.
2. html2canvas paints the node onto an HTML5 canvas, producing a bitmap.
3. The bitmap is inserted into the PDF as a single JPEG/PNG image per page.

The resulting PDF therefore contains zero text objects. Text cannot be highlighted or copied in a reader, and ATS machine scanning receives an image with no parseable content, failing the verification checklist item that requires copy-paste of text from the exported document.

## Fix Applied

The compilation engine was replaced with the jsPDF native text API, which writes true vector glyphs directly into the PDF content stream.

Files changed:

- `resume.html`
  - The CDN script tag for `html2pdf.bundle.min.js` (0.10.1) was replaced with `jspdf.umd.min.js` (2.5.1) from cdnjs.
  - The export hint text under the Download PDF button was updated to state that output is selectable vector text.
- `js/resume.js`
  - The `download-pdf` click handler no longer calls `html2pdf().from(sheet).save()`.
  - A new `buildPdf(state)` function composes the document programmatically from the sanitized localStorage state using `doc.text()`, `doc.splitTextToSize()` for word wrapping, and cursor-tracked automatic page breaks.
  - The layout mirrors the live preview: accent-colored name and section headings (Times bold, echoing the serif display font), Helvetica body text, contact line, Summary, Work Experience, Education, and bulleted Skills.
  - The user-selected accent color is converted from hex to RGB and applied to headings and rule lines via `setTextColor` and `setDrawColor`.
- Instruction files (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.github/copilot-instructions.md`) and `PRD.md`
  - The Compilation Engines directive was updated to mandate jsPDF native text output instead of html2pdf.js, referencing this document.

Note on typography: jsPDF standard fonts are limited to Helvetica, Times, and Courier. Times bold substitutes for Playfair Display in the PDF. Embedding the actual webfont would require shipping TTF payloads and offers no ATS benefit.

## Testing Steps

1. Open `resume.html` through a local static server (VS Code Live Server or `python -m http.server`).
2. Fill in name, title, contact fields, summary, at least one experience entry, one education entry, and several comma-separated skills.
3. Select a non-default accent swatch and click Download PDF.
4. Open the exported PDF in a reader, highlight a block of text, copy it, and paste it into a plain-text editor. The pasted content must match the typed input exactly.
5. Confirm section headings and the name render in the selected accent color and that long descriptions wrap and paginate without clipping.

An automated equivalent of step 4 was run at fix time: the same layout routine was executed under Node.js with the jspdf npm package and the output stream was inspected to confirm the presence of native PDF text operators rather than embedded page images.

## Troubleshooting

- Download button reports the engine is still loading: the cdnjs script tag is `defer`red; confirm network access to cdnjs.cloudflare.com and that no content blocker strips the script.
- Exported text pastes with wrong characters: input contained glyphs outside WinAnsi encoding (for example emoji or CJK). jsPDF standard fonts cover Latin-1; extended scripts require embedding a Unicode TTF font.
- Accent color missing in the PDF: verify the swatch value is a six-digit hex string; `applyAccent` in `js/resume.js` falls back to charcoal for malformed values.

## Related Files

- `resume.html`
- `js/resume.js`
- `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.github/copilot-instructions.md`
- `PRD.md`
- `docs/error-fixes/RESUME_PDF_RASTERIZED_TEXT_FIX.md` (this document)
