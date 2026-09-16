# Editable Ruled Invoice with Logo Upload

Implemented: September 9, 2026
Document type key: `logo-invoice`
Editor: `site/docs.html` + `site/js/docs.js`
Landing page: `site/editable-invoice-template.html`
Build brief: `docs/project/EDITABLE_INVOICE_TEMPLATE_BUILD_PROMPT.md`

## What was built

A seventh document type for the business document builder: a printed-form
invoice carrying a logo the visitor uploads, a five-column line-item grid with
a per-row date, automatic totals, and an icon contact strip along the foot.

It is modelled on a supplied reference sheet: `INVOICE` set large and flush
left with a wordmark and logo opposite, three label-over-rule reference fields,
a payment block aligned to the third of them, a fully ruled grid, a large
closing line beside a single boxed figure, and three signature rules under the
contact strip.

The placeholder brand names in the reference artwork are a stock-template
vendor's (`RIMBERIO`, `Borcelle Bank`, `reallygreatsite.com`) and are not
reproduced anywhere in the build.

## Why a seventh type rather than a new editor page

`docs.html` already drives six documents from one form and one state object.
Building this as `site/invoice.html` would have duplicated the currency table,
`computeTotals`, the sanitization boundary, the autosave and save-cloud
plumbing, the print stylesheet, the mobile Edit/Preview tabs, the form section
nav, and all four ad placements -- and the ad rules are the most load-bearing
constraint in this repository.

As a document type it inherits every one of those unchanged. **No file under
the ad system was touched**: `js/ads.js` and every ad host in `docs.html` are
byte-identical to before this change, so the band gates, the body-padding
reservations and the rail inset are correct by construction rather than by
re-verification.

The type is chosen the way the other six are: a catalog card writes
`tb_editor_preset`, `takePreset()` reads it once on arrival, it is matched
against `DOC_TYPES`, and it is then fixed for the session. There is no
in-editor switcher; see `docs/implementation/DOCS_TYPE_SELECT_REMOVAL.md`.

## The data model, and what was deliberately not added

Reused unchanged: `docNumber`, `docDate`, `dueDate`, `recipientName`,
`recipientDetails`, `issuerName`, `currency`, `discount`, `taxLabel`,
`taxRate`, `amountPaid`, `paymentTerms`, `bankDetails`, `note`.

Three of those carry a different job on this sheet and needed no new field:

| Reference artwork | Existing field |
| --- | --- |
| The wordmark beside the logo | `issuerName` |
| The `Payment Method:` block | `bankDetails`, already one item per line |
| `THANK YOU!` | `note`, with that as its fallback |

New bound fields: `contactPhone`, `contactEmail`, `contactSite`, `signerName`.
New line-item field: `date`, a free-text column (not `type="date"`) because the
artwork's dates are short hand-written forms like `12 Aug`.

`issuerDetails` is hidden on this type. The sheet shows the business once as a
wordmark and carries its contact details in the footer strip, so an address
block would be a second, contradictory statement of the same thing.

## Automatic calculation

`computeTotals()` is reused exactly as the itemized layout uses it -- discount
before tax, discount capped at the subtotal, tax on the discounted base,
balance after any amount paid. **This is a second sheet, not a second set of
arithmetic.**

What is specific to this layout is what gets shown:

- The row total is `qty * price`. There is no input for it, and it renders
  blank rather than as a formatted zero when either factor is missing, so an
  empty ruled row stays empty.
- The single boxed figure is the grand total, labelled `Total:`. Once an
  amount paid is entered it becomes the balance and the label becomes
  `Balance Due:`.
- Subtotal, discount, tax and the amount paid appear above the box **only when
  one of them is non-zero**. A plain invoice therefore renders exactly the
  reference: one box, one number.

## Logo upload

Modelled on `bindPhotoUpload()` in `js/resume.js`; the same discipline, not a
second pattern.

- `file.type` is parsed explicitly and anything that is not `image/*` is
  rejected before a byte is read.
- `FileReader` to a data URI, decoded into an `Image`, drawn to a canvas
  scaled so the longest edge is at most 320px.
- Exported as **PNG, not JPEG**. A logo almost always carries a transparent
  background and JPEG has no alpha, so the same file would come back with a
  black box around it.
- `input.value` is cleared on every path including success, so re-picking the
  same file still fires `change` -- which is how a visitor retries after an
  error.
- Reader failure and decode failure are reported separately. A file that
  cannot be read and an image that cannot be decoded are different problems.
- **The record is read back after writing.** `TB.storageSet` swallows a quota
  failure by design, so a logo that did not fit is otherwise silent: the
  visitor sees it on the sheet, closes the tab, and it is gone with no
  explanation. It now says so.
- **The stored value is untrusted on the way out.** Only
  `data:image/(png|jpeg);base64,...` is accepted, and the ratio must be a
  finite positive number, because the PDF writer is synchronous and cannot
  decode the image to learn the shape. A record missing either drops the logo
  rather than guessing and exporting something distorted.

Verified: a hostile `data:image/svg+xml` value in the record produces an export
of **124,849 bytes, byte-for-byte the size of the same document with no logo**,
and nothing on the sheet.

The logo is not a `[data-bind]` control, so `collectState()`, Clear Form and
"Start blank" all name it explicitly. That is the exact shape of defect
`js/resume.js` has been bitten by three separate times.

## The three icons

Material Symbols outlines, supplied as `call.svg`, `mail.svg` and
`internet.svg`, kept as **path data constants in `js/docs.js` and nowhere
else**. Two consumers need the same geometry -- the sheet draws an inline
`<svg>`, the PDF has to draw a bitmap -- and a file plus a constant would be
two sources of truth for one shape.

**The viewBox is `0 -960 960 960` and the negative Y origin is the whole
trap.** The path occupies `y = -960..0`, so a canvas draw that does not
translate down by the canvas height first puts every icon entirely off the
surface and embeds three blank images. That looks exactly like a missing-asset
bug and is not one. `iconPng()` does `ctx.setTransform(scale, 0, 0, scale, 0,
pixels)` for precisely this reason.

They cannot be text in the PDF: jsPDF's built-in WinAnsi faces have no
handset, envelope or globe glyph. They are the only raster in the export --
every string still goes through `doc.text()`. Measured on a filled invoice with
a logo: 8 image XObjects (four images, each with its alpha channel) and 44
text-showing operators. The standing rule is
`docs/error-fixes/RESUME_PDF_RASTERIZED_TEXT_FIX.md`; nothing here weakens it.

On screen the icons take the sheet's own ink (`#1A1A1A`) rather than
`currentColor`. `.doc-sheet` is forced light even in dark theme, so an icon
inheriting the page foreground would be white on white for every dark-theme
visitor.

## Three things in the CSS worth knowing

**The payment block aligns by grid placement, not by padding.** The three
reference fields are direct children of `.doc-ruled-top` in column 1, and
`.doc-ruled-pay` is `grid-column: 2; grid-row: 3`, which is what puts it level
with Bill To. The alternative was a measured `padding-top`, which would have
to be re-derived every time one of those font sizes moved. Below 48rem **both**
placements are released: `grid-column: 2` against a one-column grid opens an
implicit second track and puts the block back off to the side, half the sheet
wide.

**Both grey fills declare `print-color-adjust: exact`.** The grid header strip
and the Total box are the only fills the design has, and browsers drop
background colours from print output by default. The loss is invisible on
screen, which is what makes it worth a rule rather than a note.

**`.btn[hidden]` was missing site-wide.** `Remove Logo` is hidden with
`element.hidden`, and `.btn`'s author `display: inline-flex` beats the UA
sheet's `[hidden] { display: none }` -- so the button sat on screen with only
the accessibility tree agreeing it was gone. This is the third time the same
trap has been hit here, after `admin.html`'s catalog preview and `mockup.html`'s
two panels, so the fix is the general rule rather than an id-scoped one.

## A guard that was written, tested, and deleted

`addItemRow()` briefly carried an `applyEntryVisibility(row)` call, on the
reasoning that a row cloned after boot has never been seen by `applyDocType`'s
`[data-for]` sweep and would show the Date input on whichever type happened to
be open.

**It was disabled on purpose and the outcome did not change.** `applyDocType`
sweeps `document`, not the form, and it runs from `persistAndRender`, which is
the very next statement on every path that clones a row. Worse, at init the
guard would have run against `DEFAULT_TYPE`, since the preset is resolved
*after* the rows are added -- so where it did anything at all, it did the wrong
thing.

It was removed and replaced with a comment saying why, so it is not written
again. The invariant it was aiming at is still checked, in both directions,
by section 12 -- the check is worth keeping even though this particular
mechanism was not.

## Files changed

| File | Change |
| --- | --- |
| `site/js/docs.js` | `DOC_TYPES` entry, icon constants, `renderRuledInvoice`, `writeRuledInvoice`, `iconPng`, logo upload and storage, `date` in `collectItems`, logo in `collectState`/Clear Form/Start blank |
| `site/docs.html` | Logo and Contact Strip fieldsets, the Date input in `tpl-item`, `logo-invoice` added to six `data-for` lists, `issuerDetails` scoped away from it, schema and comment counts |
| `site/css/style.css` | `.doc-ruled-*` sheet rules, the 48rem stacking block, the `.mock-doc.invoiced` card miniature, `.btn[hidden]` |
| `site/index.html` | The catalog card, and the catalog-empty count 36 to 37 |
| `site/js/admin.js` | `CATALOG_ITEMS` entry, `MEGA_MENU` link |
| `site/js/app.js` | `DOC_LABELS` entry, so the continue strip names it |
| `site/editable-invoice-template.html` | New landing page |
| `site/sitemap.xml` | The new page |
| `site/tools/og-image.html` | An eleventh card preset |
| `site/assets/og-editable-invoice.png` | Generated |
| 18 pages + `site/blog/*.html` | The new landing page in the mega menu |
| `tests/verify-layout.js` | Section 12 |

`site/search.html` and `js/search.js` needed no change: the search page imports
the real card nodes from `index.html` rather than keeping a second list.
`poster.html` and `mockup.html` were correctly skipped by the mega-menu pass --
they carry an editor-specific panel with no site-wide link columns.

## Open Graph card

`node tools/make-og-cards.js` regenerated all eleven. Worth recording for
provenance: it ran on **Chrome 152.0.7977.77**, where the committed set was
drawn on 152.0.7977.66, and **the other ten came back byte-identical**. The
generator is deterministic across at least that patch range, which the previous
write-up could not yet say.

## Verification

`node tests/verify-layout.js`, section 12, fifteen assertions. The arithmetic
ones state the expected figure rather than merely that a number appeared: a
totals bug produces a perfectly well-formed currency string, so "the box is not
empty" is an assertion that cannot fail on the fault it exists to catch.

Measured on a controlled document (one line item, 3 at 12.50):

| Assertion | Expected |
| --- | --- |
| Row total | `$37.50` |
| Plain invoice box | `Total: $37.50`, zero rows above it |
| With 10% tax and 10.00 paid | `Balance Due: $31.25` |
| Breakdown | `Subtotal $37.50`, `Tax (10%) $3.75`, `Amount Already Paid -$10.00` |

Also asserted: the preset opens the ruled layout; at least eight body rows with
one item entered; an unfilled row is still ruled; three icons on the correct
viewBox in the sheet's ink; a row added after load carries the Date input **and
a `sales-receipt` row does not**; an uploaded 200x100 PNG reaches the sheet and
stores its ratio; the export gains image XObjects without losing text
operators; a hostile SVG data URI exports at the no-logo byte count; Clear Form
takes the logo with it.

### Mutation testing

Every assertion above was broken on purpose. Six mutations were applied
together in one run and five were caught immediately:

| Mutation | Check that fired |
| --- | --- |
| `RULED_MIN_ROWS` 8 to 4 | the eight-row floor (`4 row(s) drawn`) |
| Deleted `fill` from `.doc-ruled-icon` | the icon ink (`rgb(0, 0, 0)`) |
| `tpl-item` date field scoped to `invoice` | the Date input on a cloned row |
| Dropped the `LOGO_URI` guard | the hostile SVG (a logo on the sheet, a 0-byte export) |
| Clear Form calling `persistAndRender` instead of `setLogo("", 0)` | the logo surviving a clear |

**The sixth proved nothing, and how it failed is the part worth carrying.**
The mutation changed a row total from `qty * price` to `qty + price` and the
suite stayed green. The line is byte-identical in `renderItemized` and
`renderRuledInvoice`, and the script replaced the first occurrence -- so a
mutation that applied cleanly, reported success, and left the function under
test untouched. This is one step past the trap already recorded in
`PROJECT_STATUS.md` ("a mutation that does not apply is indistinguishable from
a check that passed"): here it *did* apply, to the wrong place. Re-run anchored
on the ruled invoice's own comment, the check failed as it should:
`row total reads "$15.50" against an expected $37.50`.

The arithmetic check also caught a real error on its first run, in the test
rather than the code: the expected tax was written as `$4.13`, having been
taxed off the post-tax total instead of the subtotal. `computeTotals` was
right. That is the case for asserting the figure -- the wrong value was a
perfectly well-formed currency string.

Suite result on the finished tree: **1486 passed, 1 failed.** The single
failure is section 4, HEAD parity, reporting this change's own delta -- 30
measurements, all of them `index.html` height increases at fifteen widths, with
x, y and width identical, which is the 37th catalog card making the feed one
row taller. It clears on commit; `PROJECT_STATUS.md` records the same pattern
for the 32nd card.

Checked by hand, not by the suite: the sheet against the reference artwork at
1440px and 320px, no page-level horizontal scroll at 320px (the grid scrolls
inside its own wrapper), the dark-theme sheet staying a white sheet, and the
card miniature reading distinctly from the Professional Invoice card beside it.
