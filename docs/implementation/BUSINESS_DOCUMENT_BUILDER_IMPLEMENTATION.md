# Business Document Builder Implementation

Added: July 21, 2026

## Scope

A fourth editor, `docs.html`, covering six editable business documents from a single form and a single state object:

| Key | Document | Layout family |
|---|---|---|
| `rent-receipt` | Rent Receipt | receipt |
| `payment-receipt` | Cash Payment Receipt | receipt |
| `business-receipt` | Itemized Business Receipt | itemized |
| `sales-receipt` | Sales and Cash Receipt Form | itemized |
| `invoice` | Professional Invoice | itemized |
| `warning-notice` | Employee Warning Notice | notice |

Each document is exposed as its own catalog card under a new `Business Docs` category filter, so the catalog advertises six templates while the codebase carries one editor.

## Files Added

| File | Role |
|---|---|
| `docs.html` | Editor shell: document-type select, shared form, live preview pane, export actions, line-item `<template>` |
| `js/docs.js` | All editor logic: state binding, document switching, totals, amount-in-words, preview renderers, jsPDF writers |
| `docs/implementation/BUSINESS_DOCUMENT_BUILDER_IMPLEMENTATION.md` | This document |

## Files Modified

| File | Change |
|---|---|
| `index.html` | Six `data-category="documents"` cards, a `Business Docs` filter pill, updated title/description/H1/JSON-LD to include receipts and invoices |
| `js/app.js` | `docs: "docs.html"` added to `EDITOR_ROUTES`; new `PRESET_KEY` hand-off written by `initCatalog` and consumed by the new `TB.takePreset()` |
| `loading.html` | `docs: "docs.html"` added to the inline dependency-free route whitelist (must stay in sync with `EDITOR_ROUTES`) |
| `css/style.css` | `.doc-sheet` component with three layout modifiers, `.mock-doc.paper` catalog mocks, document-builder form controls, print stylesheet, `min-width: 0` on the shared editor panes |
| `privacy.html` | Explicit mention that receipt, invoice and disciplinary-record content is compiled locally |
| `sitemap.xml` | `docs.html` at priority 0.8 |

## Architecture

### One form, six documents

Every field lives in one `<form id="docs-form">`. Fieldsets and individual `.field` blocks carry a `data-for` attribute listing the document keys they belong to; `applyDocType()` toggles `hidden` on each on every state change. Elements carrying `data-label="<key>"` are re-worded from the selected document's `labels` map, so the same input reads `Received From (Tenant)` on a rent receipt, `Billed To (Customer)` on a business receipt, and `Employee Name` on a warning notice.

Hidden fields are still collected into state. That is deliberate: switching document types back and forth never loses typed data, and renderers read only the keys their layout uses.

### Layout dispatch

`DOC_TYPES[key].layout` selects one of three renderers and one of three PDF writers:

- `receipt` — masthead, centered ruled title, label/value rows, a boxed amount, spelled-out amount, payment-method checkbox row, signature line.
- `itemized` — title-left/reference-right header, two party columns, line-item table, payment-method column beside a totals column, optional invoice terms and bank details, dual signature block.
- `notice` — boxed title, two-column employee field grid, warning-level and violation checkbox grids, ruled narrative sections, dual signature block.

### Blank printable forms

The `Blank printable form` checkbox (`state.blankForm`) makes empty optional fields render as ruled lines rather than being omitted, and keeps empty line-item rows in the table. Narrative sections on the warning notice fall back to a fixed count of ruled writing lines. This is what makes the "Printable Sales and Cash Receipt Form" card meaningfully different from the filled-in variants without a second code path.

### Automatic calculations

- **Totals:** `computeTotals()` applies discount before tax, caps the discount at the subtotal and the tax rate at 100 percent, and derives `Balance Due` from the amount already paid. `num()` rejects `NaN`, `Infinity` and negative values, so a pasted or tampered field can never invert a total.
- **Amount in words:** receipts commonly require the figure spelled out as a tamper check. `amountToWords()` converts the numeric amount using the selected currency's major and minor unit names ("Eight hundred fifty dollars only"; "One thousand two hundred thirty-four dollars and fifty-six cents only"). It is generated, never typed, and mirrored under the amount input as a live hint.
- **Dates:** `formatDate()` reformats a native `YYYY-MM-DD` date input by string parsing, deliberately avoiding `new Date()`, which would shift the day across timezone boundaries for users west of UTC.

### Currency handling and the PDF font constraint

`CURRENCIES` carries two symbols per entry. `symbol` is used on screen; `pdf` is used in the export because jsPDF's built-in fonts are WinAnsi-encoded and cannot render the rupee, naira or cedi glyphs, which would print as blank boxes. Those three fall back to an ASCII prefix (`Rs.`, `NGN `, `GHS `) in the PDF only. Dollar, euro, pound and yen are all inside cp1252 and print as-is. JPY additionally sets `decimals: 0`.

### Catalog variant hand-off

Six cards route to the same `docs.html`, so `?target=` alone cannot say which document to open. `initCatalog()` in `js/app.js` writes the clicked card's `data-doc` value to `localStorage` under `tb_editor_preset`; `TB.takePreset()` reads and clears it. The value is never used as a route — `docs.js` matches it against `DOC_TYPES` and falls back to the visitor's saved document, so an edited localStorage entry can only ever resolve to a document the editor already ships. Clearing on read means a later direct visit to `docs.html` opens the visitor's own work rather than re-applying a stale card choice.

### Security

Identical posture to the resume builder: every string is scrubbed through `TB.sanitize` at the localStorage write boundary and reaches the DOM exclusively through `textContent` via `createElement`. No `innerHTML` anywhere. Verified by injecting `<img src=x onerror=alert(1)>` into the employee-name field: zero `img`/`script` nodes appear inside the sheet and the payload renders as literal text.

### PDF compilation

`buildPdf()` uses the jsPDF native text API only, per the project-wide mandate in `CLAUDE.md` (see `docs/error-fixes/RESUME_PDF_RASTERIZED_TEXT_FIX.md`). It hand-rolls its own primitives rather than pulling in the jspdf-autotable plugin: `pdfFieldLine()` (label plus ruled value line), `pdfChecks()` (vector `rect` boxes with an `X` glyph), `writeItemTable()` (column layout with right-aligned numerics and wrapped descriptions), `writeTotals()`, `writeParty()` (side-by-side columns drawn from a shared baseline) and `pdfSignatures()`. All of them respect a shared `y` cursor with `ensureRoom()` page breaking.

### Printing

A `Print` action calls `window.print()` against a `@media print` block that hides the site shell, the form pane and the export buttons, leaving the sheet alone on the page. The print block also un-scrolls `.doc-table-wrap` and force-shows `.preview-pane`, because A4 paper width can fall under the 48rem breakpoint where the mobile tab rule would otherwise hide the sheet being printed. The PDF export remains the higher-fidelity path; Print exists because "printable form" is the literal use case for the blank-form variants.

## Notable Fix Found During Verification

At a 320px viewport the invoice's four-column line-item table pushed the whole page into horizontal scroll (51px, worsening to 68px once a `min-width` was placed on the table). Root cause: `.editor-pane` / `.preview-pane` are CSS grid children, which default to `min-width: auto` and therefore refuse to shrink below their content's minimum width — the pane grew past its own grid track and dragged the document with it. Fixed with `min-width: 0` on both panes plus an `overflow-x: auto` wrapper (`.doc-table-wrap`) around the table, so the irreducible element scrolls locally instead of the page scrolling globally. This mirrors the existing containment approach on `.ad-slot`. The change also benefits `resume.html`, `poster.html` and `mockup.html`; all three were re-verified at 1400px and 320px with zero overflow and no console errors.

## Verification Performed (July 21, 2026, Playwright headless Chromium)

- Catalog: six Business Docs cards present; the category pill filters to exactly those six.
- Launch flow: clicking the Invoice card navigates to `loading.html?target=docs` and writes `tb_editor_preset = "invoice"`; the editor opens on the invoice and clears the key.
- Field visibility: invoice-only and itemized-only fieldsets confirmed hidden on a rent receipt; labels confirmed re-worded per type.
- Arithmetic: three line items (1x1200, 2x450, 3x35.50) with a 25 discount and 10 percent tax produced subtotal 2,206.50, tax 218.15, grand total 2,399.65, and balance due 2,199.65 after a 200 payment.
- Amount in words: 1234.56 rendered as "One thousand two hundred thirty-four dollars and fifty-six cents only".
- Currency: NGN rendered the naira glyph on screen; JPY rendered a zero-decimal total.
- XSS probe: zero injected nodes, payload rendered as text.
- Persistence: full reload restored document type, text fields, and checkbox states.
- PDF export for all six types: single page each, `%PDF-1.3` header, 32 to 58 real `Tj` text operators, zero `/Subtype /Image` objects (the `/Image` substring that appears is jsPDF's boilerplate `/ProcSet` declaration, not an embedded raster), no text drawn outside page bounds, correct per-type filenames.
- Responsive: zero horizontal page overflow at 320px for all three layouts; table scrolls inside its own container.
- Zero console or page errors throughout.

## Still Open

- Real-device pass on a touchscreen, and a check of the browser print dialog output (verified only as CSS rules, not as a rendered print job).
- The closing-note field is shared across document types, so a note typed on a receipt carries over to a warning notice until edited. This is correct state behavior but reads oddly the first time; consider per-type placeholder defaults if it proves confusing.

## Adding a Seventh Document

1. Add a key to `DOC_TYPES` in `js/docs.js` with `layout`, `heading`, `file` and a `labels` map.
2. Add the matching `<option>` to `#f-doctype` in `docs.html`.
3. Add the document key to the `data-for` lists of any fieldsets it needs.
4. If it needs a new shape, add a renderer to `RENDERERS` and a writer to `WRITERS`; otherwise reuse an existing layout.
5. Add a catalog card in `index.html` with `data-target="docs"` and `data-doc="<key>"`.

No changes to `js/app.js`, `loading.html` or `sitemap.xml` are needed for additional documents — only for an entirely new editor page.
