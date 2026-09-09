# Build Prompt: Editable Ruled Invoice with Logo Upload

Status: build brief, not yet implemented
Written: September 9, 2026
Intended reader: a Claude Opus 5 coding agent working in the TemplateBox repository

This document is the prompt. Everything below the divider is addressed to the
building agent and can be handed over verbatim. It carries the two decisions
that were already made by the owner (where the template lives, and how closely
it follows the reference artwork) so the agent does not have to re-open them.

---

## Task

Build a new editable invoice template for TemplateBox, matching the reference
artwork described in section 2. It must support a visitor-uploaded logo,
automatic line-item and total calculations, and the three supplied Material
Symbols icons in its contact strip.

Read `CLAUDE.md` at the repository root before writing any code. Everything in
it applies; the sections below only add what is specific to this build. Read
`docs/memory/PROJECT_STATUS.md` for the current state of the tree.

## 1. Where it lives (decided, do not re-open)

Build it as a **seventh document type inside `docs.html` / `js/docs.js`**, not
as a new editor page and not as a style switcher inside the existing invoice.

- Type key: `logo-invoice`
- Layout family: `ruled-invoice` (a third renderer alongside `receipt`,
  `itemized` and `notice`)
- Catalog title: `Editable Invoice with Logo`
- Landing page: `site/editable-invoice-template.html`
- Export file stem: `logo-invoice`

This is the architecture `docs.html` already documents: one form and one state
object drive every document, the type is chosen by the catalog card's
`data-doc` attribute, handed off through the `tb_editor_preset` key, validated
against the editor's own whitelist, and then fixed for the session.
`docs/implementation/DOCS_TYPE_SELECT_REMOVAL.md` explains why there is no
type control inside the editor. **Do not add one.** The visitor reaches this
template by clicking its card or its landing page CTA, exactly like the other
six.

Choosing this over a standalone `invoice.html` means you inherit, at zero cost,
the whole editor shell: the header and mega-menu, the theme pre-paint script,
autosave and the save-cloud indicator, the mobile Edit/Preview tabs, the form
section jump list, the currency table, the sanitization firewall, the print
stylesheet, and every ad placement. **Do not touch `js/ads.js` or any ad
markup in `docs.html`.** The band gates, the body padding reservations and the
rail inset are already correct for this page and a change there is a
site-wide change.

## 2. The reference artwork

A portrait sheet, black on white, no colour, generous margins. Anatomy from
top to bottom:

1. **Masthead.** `INVOICE` set very large, bold, uppercase, tight tracking,
   flush left. On the same optical line, flush right: the business wordmark in
   small caps at body size, and immediately to its right the uploaded logo.
2. **Ruled reference block, left column.** Three stacked label-over-rule
   fields: `Date:`, `No. Invoice :`, `Bill to:`. Each is a small label with a
   long horizontal rule beneath it; the typed value sits on the rule. Under
   the `Bill to:` rule, the client's address runs as italic body text.
3. **Payment block, right column**, starting at roughly the horizontal centre
   and top-aligned with `Bill to:`. A `Payment Method:` label, then the bank
   lines beneath it (`Bank Name: ...`, `Account Number: ...`).
4. **Line-item grid.** Five columns: `Date`, `Item Description`, `Price`,
   `Qty`, `Total`. Every cell has a visible 1px rule on all four sides. The
   header row carries a light warm-grey fill; header labels are centred. Body
   rows are tall enough to write in by hand. Approximate column proportions,
   left to right: 13, 40, 17, 10, 16 (percent of table width).
5. **Closing row.** A large bold `THANK YOU!` flush left, and on the right a
   bordered, grey-filled box containing `Total:` and its amount.
6. **Contact strip, bottom left.** Three lines, each an icon followed by text:
   a handset for the phone number, an envelope for the email address, a globe
   for the website.
7. **Signature rules, bottom right.** Three equal-length horizontal rules
   stacked with even spacing, aligned to the right margin.

**Fidelity rule (decided):** faithful to that structure, type scale, fills and
rules, but the grid populates from real line items. Never fewer than eight body
rows; unused rows stay as empty ruled rows so a half-filled invoice still looks
like the reference. Rows beyond eight append normally.

**Do not reproduce the placeholder brand names from the artwork.** `RIMBERIO`,
`Borcelle Bank` and `reallygreatsite.com` are a stock-template vendor's
placeholders. Use neutral ones of our own in the field placeholders and in any
sample or thumbnail content.

## 3. Data model

Add to `DOC_TYPES` in `js/docs.js`:

```js
"logo-invoice": {
    layout: "ruled-invoice",
    heading: "INVOICE",
    file: "logo-invoice",
    labels: {
        issuerLegend: "Your Business",
        issuerName: "Business Name (shown as the wordmark)",
        recipientLegend: "Bill To",
        recipientName: "Bill to",
        docNumber: "No. Invoice",
        docDate: "Date",
        paid: "Amount Already Paid",
        note: "Closing Line"
    }
}
```

**Reuse these existing bound fields rather than inventing parallel ones:**
`docNumber`, `docDate`, `dueDate`, `recipientName`, `recipientDetails`,
`issuerName` (the wordmark), `currency`, `discount`, `taxLabel`, `taxRate`,
`amountPaid`, `paymentTerms`, `bankDetails`, `note`. `bankDetails` is already a
one-item-per-line textarea and maps exactly onto the artwork's payment block;
`note` is the `THANK YOU!` line, with that as its placeholder.

`issuerDetails` is not used by this layout. Hide its field with the existing
`data-for` mechanism rather than deleting it; the other six types need it.

**New bound fields** (add `data-for="logo-invoice"` fieldsets in `docs.html`):

| Bind name | Control | Limit | Purpose |
| --- | --- | --- | --- |
| `contactPhone` | `input type="tel"` | maxlength 32 | Contact strip, handset icon |
| `contactEmail` | `input type="email"` | maxlength 60 | Contact strip, envelope icon |
| `contactSite` | `input type="text"` | maxlength 60 | Contact strip, globe icon |
| `signerName` | `input type="text"` | maxlength 70 | Optional label under the top signature rule |

**New line-item field:** `date`, a `data-entry-field="date"` text input
(maxlength 16, not `type="date"` — the column takes short hand-written forms
like `12 Aug`). It belongs only to this type, so wrap it in an element carrying
`data-for="logo-invoice"` inside `<template id="tpl-item">`.

**Watch this:** `applyDocType()` sweeps `[data-for]` nodes once, inside the
form. Rows cloned from the template *after* that sweep will not have been
visited, so a row added later would show the Date input on a sales receipt.
Apply the same visibility rule inside `addEntryRow()` at clone time, or re-run
the sweep after every clone. Add a check for it (section 8) — this is the
easiest silent defect in the whole build.

**New non-bound state:** `logo`, holding a PNG data URI, plus `logoRatio`
(natural width divided by height). These are not `[data-bind]` controls, so
`collectState()` must pick them up explicitly. `js/resume.js` has been bitten
three separate times by exactly this class of field being missed by
"Start blank" and by the clear handler — check `clear-doc` clears the logo too.

## 4. Logo upload

Model it on `bindPhotoUpload()` in `js/resume.js:722` and follow the same
rules; do not invent a second pattern.

1. `<input type="file" id="f-logo" accept="image/*">` in a `data-for`
   fieldset, plus a Remove button and a `<p class="upload-hint">` for errors.
2. Parse `file.type` explicitly and terminate on anything that is not an
   image: `if (!/^image\//.test(file.type)) { ... return; }`. This is the
   file-upload rule in `CLAUDE.md`, not a suggestion.
3. `FileReader.readAsDataURL` into an `Image`, then draw to an offscreen
   canvas scaled so the longest edge is at most **320px**, preserving aspect
   ratio. Export with `toDataURL("image/png")` — **PNG, not JPEG**: a logo
   almost always has a transparent background and JPEG would flatten it to
   black.
4. Reset `input.value` on both success and failure, so re-picking the same file
   still fires `change`. That is how a visitor retries after an error.
5. Handle `reader` error and `img` error separately with distinct messages; a
   file that cannot be read and an image that cannot be decoded are different
   failures.
6. **Storage quota.** `TB.storageSet` swallows a quota failure by design. Read
   the record back after writing and, if the logo did not survive, tell the
   visitor plainly that it is on the sheet and will export but was not kept for
   next time. Do not let one oversized logo silently stop every later save of
   their typing — that is the defect `js/resume.js` gave the photograph its own
   storage key to avoid, and the same reasoning applies if you find the encoded
   logo pushing the record over.
7. **Treat the stored URI as untrusted on the way out of storage.** Accept only
   `data:image/png;base64,` or `data:image/jpeg;base64,` followed by base64
   characters. A hostile SVG data URI must produce a sheet and a PDF identical
   to having no logo at all.
8. Render it as an `<img>` element created with `document.createElement` and
   assigned through `.src`. Never `innerHTML`. Bound to a max height of about
   48px on the sheet, `width: auto`, so a wide wordmark logo and a square badge
   both sit correctly beside the business name.

## 5. Automatic calculations

Reuse `computeTotals(state)` unchanged — discount before tax, discount capped
at subtotal, tax on the discounted base, balance after any amount paid. Do not
write a second totals function.

Rendering rules specific to this layout:

- **Row total** is `qty * price`, computed, never typed. There is no input for
  it. Render it blank when either factor is zero, so an empty ruled row stays
  empty rather than showing a currency-formatted zero.
- **The Total box** is the artwork's single grey box. It shows the grand total,
  labelled `Total:`. When `amountPaid` is greater than zero it shows the
  balance instead and the label becomes `Balance Due:`.
- **Subtotal, Discount and Tax** render as small stacked rows immediately above
  the box, and **only when non-zero**. A plain invoice with no discount and no
  tax therefore renders exactly the artwork: one box, one number.
- Money formatting goes through the existing `money(value, cur)` and the
  existing `CURRENCIES` table. That table carries two symbols per entry because
  jsPDF's built-in fonts are WinAnsi encoded; use the `pdf` symbol in the PDF
  and the `symbol` on screen, as the other layouts already do.

## 6. The three icons

The supplied files are Material Symbols outlines on a `0 -960 960 960`
viewBox. **That viewBox has a negative Y origin.** Drawing the path data
without accounting for it puts every icon entirely off-canvas, which is the
most likely single bug in this build.

Keep the path data as three constants in `js/docs.js` — one source of truth,
used by both the DOM renderer and the PDF writer. Do not also copy the `.svg`
files into `site/assets/`: two copies of the same geometry is the drift class
this project keeps writing up.

```js
/* Material Symbols outlines, 0 -960 960 960 viewBox (note the negative Y
   origin: a canvas draw needs translate(0, 960) first). One copy, used by
   both the sheet renderer and the PDF writer. */
const ICON_PHONE = "M798-120q-125 0-247-54.5T329-329Q229-429 174.5-551T120-798q0-18 12-30t30-12h162q14 0 25 9.5t13 22.5l26 140q2 16-1 27t-11 19l-97 98q20 37 47.5 71.5T387-386q31 31 65 57.5t72 48.5l94-94q9-9 23.5-13.5T670-390l138 28q14 4 23 14.5t9 23.5v162q0 18-12 30t-30 12ZM241-600l66-66-17-94h-89q5 41 14 81t26 79Zm358 358q39 17 79.5 27t81.5 13v-88l-94-19-67 67ZM241-600Zm358 358Z";
const ICON_MAIL = "M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm320-280L160-640v400h640v-400L480-440Zm0-80 320-200H160l320 200ZM160-640v-80 480-400Z";
const ICON_GLOBE = "M325-111.5q-73-31.5-127.5-86t-86-127.5Q80-398 80-480.5t31.5-155q31.5-72.5 86-127t127.5-86Q398-880 480.5-880t155 31.5q72.5 31.5 127 86t86 127Q880-563 880-480.5T848.5-325q-31.5 73-86 127.5t-127 86Q563-80 480.5-80T325-111.5ZM480-162q26-36 45-75t31-83H404q12 44 31 83t45 75Zm-104-16q-18-33-31.5-68.5T322-320H204q29 50 72.5 87t99.5 55Zm208 0q56-18 99.5-55t72.5-87H638q-9 38-22.5 73.5T584-178ZM170-400h136q-3-20-4.5-39.5T300-480q0-21 1.5-40.5T306-560H170q-5 20-7.5 39.5T160-480q0 21 2.5 40.5T170-400Zm216 0h188q3-20 4.5-39.5T580-480q0-21-1.5-40.5T574-560H386q-3 20-4.5 39.5T380-480q0 21 1.5 40.5T386-400Zm268 0h136q5-20 7.5-39.5T800-480q0-21-2.5-40.5T790-560H654q3 20 4.5 39.5T660-480q0 21-1.5 40.5T654-400Zm-16-240h118q-29-50-72.5-87T584-782q18 33 31.5 68.5T638-640Zm-234 0h152q-12-44-31-83t-45-75q-26 36-45 75t-31 83Zm-200 0h118q9-38 22.5-73.5T376-782q-56 18-99.5 55T204-640Z";
```

**On the sheet:** build each icon with `document.createElementNS` for the
`<svg>` and its `<path>`, set `viewBox` to `0 -960 960 960`, size it at about
`1em`, mark it `aria-hidden="true"` and `focusable="false"`, and let the
adjacent text carry the meaning. Never assemble it as an HTML string.

**Colour:** fill from the sheet's own ink token, not `currentColor` inherited
from the page. `.doc-sheet` is forced light even in dark theme (see
`site/css/style.css:257`), so an icon inheriting the page's foreground would
come out white on white for a dark-theme visitor.

**In the PDF:** jsPDF's built-in faces have no handset, envelope or globe
glyph, so these cannot be text. Draw each path with `Path2D` into an offscreen
canvas at 4x the target size, `ctx.translate(0, 960)` (or an equivalent
transform) to correct the viewBox origin, fill in the ink colour, then place it
with `doc.addImage(canvas.toDataURL("image/png"), "PNG", x, y, w, h)`. The
icons being raster is fine and is not a rasterized-text problem: **every
string in the document must still go through `doc.text()`** so the export stays
selectable and machine-readable. `docs/error-fixes/RESUME_PDF_RASTERIZED_TEXT_FIX.md`
is the standing rule; do not reach for `html2pdf.js` or `html2canvas`.

## 7. Files to change

Nothing here is optional. Several of these are cross-checked against each other
by `tests/verify-layout.js`, and drift between them is the failure mode this
list exists to prevent.

**The editor**

- `site/docs.html` — new `data-for="logo-invoice"` fieldsets (logo upload,
  contact strip, signer), the Date input inside `<template id="tpl-item">`,
  and `logo-invoice` added to every existing `data-for` list that should
  include it (currency, line items, totals, payment instructions, payment
  method, closing note). Update the `SoftwareApplication` JSON-LD
  `featureList` string, which currently says "Six document types", and the
  `description`. Update the three inline comments that say "six documents" or
  "six catalog cards".
- `site/js/docs.js` — the `DOC_TYPES` entry, the icon constants, the
  `ruled-invoice` branch in the render dispatcher, `renderRuledInvoice()`, the
  `writeRuledInvoice()` branch in `buildPdf()`, logo upload and storage,
  `collectState()` picking up the logo, the clear handler clearing it, and the
  file-header comment that says "Covers six documents".
- `site/css/style.css` — new `.doc-ruled-*` classes. Follow the existing
  `.doc-*` naming and put them beside the other document-sheet rules near line
  5253. Add them to the narrow-viewport block near 7772 and to the `@media
  print` block near 7863. **The grey fills need
  `-webkit-print-color-adjust: exact; print-color-adjust: exact;`** or the
  header strip and the Total box come out white when printed, which is a
  visible regression against the artwork and is silent on screen.

**The funnel**

- `site/index.html` — a new `<article class="template-card"
  data-category="documents">`. Use a CSS document miniature in the
  `.card-preview` in the same style as the neighbouring document cards (the
  `.mk-*` classes), not a photograph; that keeps you out of the
  image-exists-on-disk check and matches the category. The card link must be
  `<a class="card-link" href="docs.html" data-target="docs"
  data-doc="logo-invoice">Editable Invoice with Logo</a>` — the `href` points
  at the editor deliberately so crawlers see a real link, while the click
  handler routes humans through the interstitial. Also update the
  `catalog-empty` message: it says "see all 36" and the suite asserts that
  number against the real card count.
- `site/js/admin.js` — a matching `CATALOG_ITEMS` entry
  `{ id: "logo-invoice", title: "Editable Invoice with Logo",
  category: "documents", doc: "logo-invoice" }`. Title, category and `doc`
  must match the card exactly; the suite compares them.
- `site/js/app.js` — a `DOC_LABELS` entry so the homepage continue strip says
  "Editable Invoice with Logo" rather than the generic "Business Document".
- `site/editable-invoice-template.html` — new landing page. Copy the shape of
  `site/free-invoice-template.html`: title, description, canonical, the full
  Open Graph and Twitter Card pairs, `FAQPage` and `BreadcrumbList` JSON-LD,
  the Clarity snippet, the theme pre-paint script, the font links, the
  `.nav-more` mega-menu panel, **no footer** (there are none anywhere since
  August 13, 2026), a `.content-rail` aside with three
  `[data-ad-rail-slot]` children, and CTAs pointing at
  `docs.html` with `data-target="docs" data-doc="logo-invoice"`. Target the
  intent the existing invoice page does not: an editable invoice with your own
  logo on it.
- `site/sitemap.xml` — the new landing page.

`site/search.html` and `js/search.js` need no change: the search page imports
the real card nodes from `index.html` rather than keeping a second list.

**Social card**

- `site/tools/og-image.html` and `tools/make-og-cards.js` need a card for the
  new landing page, then run `node tools/make-og-cards.js` from the repository
  root. **Regenerate and commit the whole set, never one card.** Output is
  deterministic given the tool plus the browser, so if a card you did not touch
  moves, the browser has been updated and all of them belong in the same
  commit. The suite checks that `og:image` and `twitter:image` agree, that the
  file exists, and that any declared dimensions match the PNG's own IHDR.

**Documentation**

- `docs/implementation/EDITABLE_INVOICE_TEMPLATE.md` — the write-up. Root
  cause style is not needed here, but record the decisions and their costs:
  why a seventh type rather than a new editor, why the icons are path
  constants rather than files, why the logo is PNG, and the eight-row floor.
- `docs/memory/PROJECT_STATUS.md` — a new dated entry at the top, in the
  existing voice.
- `CLAUDE.md` and its copies (`AGENTS.md`, `GEMINI.md`) — only if a rule
  actually changed. Adding a document type does not change one. Do not rewrite
  the ad sections.

## 8. Verification

Run `node tests/verify-layout.js` from the repository root before declaring
this done. A full run is nearer six minutes than four now. **Background it and
wait for the completion notification; do not poll it with a shell loop.** A
polling loop without a sleep pegs a core, and the suite drives a real browser
with a 20-second per-navigation budget — the loop can cause the timeout it is
waiting to observe. If a wait is genuinely unavoidable, match both outcomes
(`passed,` and `Error:`), because a navigation timeout exits with a stack and
never prints a summary.

`--quick` runs the static checks alone in under a second; use it while
iterating on the catalog, admin and sitemap wiring.

**New checks to add.** Nothing runs the suite automatically, and an assertion
that has never failed is not evidence — **break each of these on purpose first
and confirm it catches the break.** Note that the repository's files are CRLF;
a mutation that silently matches nothing is indistinguishable from a check that
passed.

1. Opening `docs.html` through the `tb_editor_preset` hand-off with
   `logo-invoice` renders the ruled layout, not the itemized one.
2. The grid renders at least eight body rows on an invoice with one line item,
   and every row has its borders.
3. A typed `qty` and `price` produce the correct row total, and the Total box
   holds the correct grand total. Assert the computed value, not merely that a
   number appeared.
4. With an amount paid entered, the box shows the balance and its label
   changes.
5. A line-item row added *after* load shows the Date input on `logo-invoice`
   and does not show it on `sales-receipt`. This is the cloned-row visibility
   trap from section 3.
6. An uploaded logo appears on the sheet, and the exported PDF contains an
   image XObject while still containing text-positioning operators. Judge the
   export by its bytes, not by the Blob's `type`, which is only whatever the
   code that built it claimed.
7. A hostile `data:image/svg+xml` value in the stored record produces an export
   byte-identical in size to one with no logo.
8. All three icons render on the sheet.
9. `clear-doc` clears the logo along with the text.

Sections already covering `docs.html` — ad band counts, rail inset, header
edge, export filename, launch flow — must still pass untouched. If one of them
starts failing, the cause is something you changed on the page, not the check.

Then check by hand what the suite does not cover:

- The sheet against the reference artwork at 1920, 1366 and 320 pixels wide.
- Print preview: rules present, grey fills present, no ad in the output.
- Dark theme: the sheet stays a white sheet and the icons stay dark.
- A logo with a transparent background, a very wide logo, and a very tall one.

## 9. Prohibitions

- No server-side code of any kind. Everything runs on the client.
- No `innerHTML` for anything derived from visitor input. `textContent`,
  `createElement`, `createElementNS`, `importNode`.
- No new CDN dependency. jsPDF 2.5.1 is already loaded by `docs.html` with an
  SRI hash; that is the entire third-party surface and it stays that way. This
  editor has already lost PDF export silently for weeks to a wrong SRI hash.
- No `html2pdf.js` or `html2canvas`.
- No document-type or template switcher inside the editor.
- No footer. No emoji in any file, comment or commit message.
- Nothing that is not a served asset goes inside `site/`. The publish directory
  is served verbatim, so a working file placed there is a public URL.

## 10. Definition of done

The card is on the homepage, its landing page ranks-ready and in the sitemap,
clicking either routes through the interstitial into `docs.html` with the ruled
invoice layout loaded. A visitor can upload a logo, type line items, and watch
the totals compute. The PDF matches the sheet and its text is still text. The
full suite passes with the new checks in it, each one mutation-proven. The
write-up is in `docs/implementation/` and `PROJECT_STATUS.md` has a dated
entry.
