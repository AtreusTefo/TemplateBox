# Poster Editor: Toolbar, Text Model and Multi-Format Export

Date: August 16, 2026
Surfaces: `site/poster.html`, `site/js/poster.js`
Files changed: `site/poster.html`, `site/js/poster.js`, `site/css/style.css`, `site/js/app.js`,
`tests/verify-layout.js`, and a new `tests/verify-poster-editor.js`

## What Changed

The poster editor was a three-field form -- one photo, one caption string, one frame select --
drawing a fixed 1200 x 1500 canvas and exporting a single PNG. It is now a small design tool: an
editor toolbar with undo/redo and a download panel, a text model with full typographic control, an
emoji picker, named paper sizes, and five export formats.

The change everything else rests on is that **the caption stopped being an `<input>` value read at
draw time and became a list of text elements, each with its own style object**. One model is read
by the canvas renderer and by every export path, rather than each export re-deriving typography
from the DOM. That is what makes "what you see is what downloads" true across five formats instead
of only the one the preview happens to use.

## The Header Is Still `.site-header`, Deliberately

The brief asked for the site header to be replaced with a minimal editor bar. The **element** is
kept and only its **contents** replaced, for two reasons that would each have been a regression:

1. **The fixed ad rail's inset mechanism keys on it.** One `padding-right` on `body` insets
   everything in normal flow, and the header inherits that with no rule of its own
   (`FIXED_FULL_HEIGHT_AD_RAIL.md`). `tests/verify-layout.js` asserts the header's right edge lands
   exactly on the column's left edge on every page including this one, and a scrolled-state check
   dereferences `.site-header` without a null guard -- removing the element would have thrown.
2. **The mega-menu is the only route from an editor to the privacy policy and terms.** The editors
   carry no footer, a gap `PROJECT_STATUS.md` already flags as worth revisiting rather than
   widening. The "More" panel is therefore kept; the wordmark became a home button and the
   Templates/Guides/About links were dropped, since the panel already contains them.

Nothing in the new CSS gives the header a width or margin of its own, per the standing rule that if
one looks necessary the padding is being applied in the wrong place.

## Autosave as an Icon Without Losing the Words

`#save-state` is shared: `markSaved()` in `js/app.js` writes into it for all four editors. Writing
`textContent` on an element that now contains an SVG would delete the icon, so `markSaved()` gained
one indirection -- it writes into a `[data-save-label]` child when one is present and falls back to
`textContent` when it is not. The other three editors are untouched by this and still render prose.

The words are not dropped, only stopped from occupying permanent chrome: they live in a visually
hidden span that assistive technology still reads, and are mirrored into the `title` attribute so
hovering the cloud reveals them. The tick is hidden until a write actually lands, so cloud alone
means "will save" and cloud-plus-tick means "saved" -- the same two states the prose version had.

## Undo/Redo

A linear snapshot stack, capped at 60 entries. Snapshot-based rather than command-based on purpose:
the whole document is a few kilobytes of JSON for a single user in a single tab, and a snapshot
cannot desynchronise from the model the way a hand-written inverse operation can. Typing coalesces
into one entry per burst rather than one per keystroke, or a single sentence would push every
earlier state past the cap. `Ctrl/Cmd+Z` and `Ctrl+Shift+Z` / `Ctrl+Y` are bound, and both buttons
disable at the ends of the stack rather than looking available and doing nothing.

## Paper Sizes and the DPI That Is Actually Delivered

A4 through A0 are offered with their millimetre dimensions and a plain description of the job each
suits. Two consequences are worth recording:

**All ISO A sizes share the same 1:sqrt(2) ratio**, so changing size does not change the preview's
shape -- only the export dimensions. The first version of the new test asserted that the canvas
proportions change between A3 and A0 and failed against correct code, which is how this got
written down rather than rediscovered later.

**A0 at 300 DPI is not renderable.** It computes to 9933 x 14043 pixels, about 139 megapixels and
558 MB of RGBA, which exceeds browser canvas limits well before it exceeds memory. The requested
DPI is honoured until the long edge reaches 8000 px, then the effective DPI is reduced **and
reported**: the panel prints the real pixel dimensions, the DPI actually used, and the words
"reduced from the requested DPI to stay within browser canvas limits". Quietly returning a smaller
file than the label promises would be the same class of defect as copy describing work that does
not occur.

## Per-Format Options, and What Each One Honestly Does

| Format | Options | Notes |
|---|---|---|
| PNG | Scale, transparent background | Lossless, so "quality" cannot mean JPEG compression -- it maps to output scale and the panel says so |
| JPG | Low / Medium / High | Maps to 0.5 / 0.75 / 0.92. No transparency option: JPEG has no alpha and would flatten to black |
| PDF | Digital / Print, compress, colour profile, crop marks and bleed, flatten, document properties, password | See below |
| SVG | none | Vector text over an embedded raster photo |
| PPTX | Resolution only | One full-bleed slide |

Three of these needed a judgement call rather than an implementation:

- **CMYK is a numeric conversion, not a colour-managed separation.** jsPDF has no ICC handling and
  no colour pipeline. The device-CMYK values are genuinely written into the PDF, which some print
  shops require, but it will not match a press proof. The dropdown says "device values, not a
  colour-managed separation" rather than implying accuracy the library cannot deliver.
- **Crop marks and bleed are real**, not cosmetic: the sheet grows by 3 mm on each edge and eight
  trim marks are drawn. This is asserted in the tests.
- **Ligatures are labelled "Kerning and ligatures".** Canvas 2D exposes no OpenType feature switch;
  `fontKerning` is the real, observable lever, so the control is named for what it does. The
  alternative was a toggle that changes nothing, which this project treats as a defect.

**SVG** embeds the photo as a base64 `<image>` and writes each text element as a real `<text>`
node, so the type stays vector even though the photograph cannot. **PPTX** is written by a
store-only ZIP writer built into `poster.js` (a CRC32 table and two record layouts, about 60
lines) rather than by vendoring a general ZIP library for one use. A store-only archive is a fully
valid ZIP that PowerPoint opens normally; the cost is file size, which for a one-slide deck holding
one JPEG is dominated by the image either way.

**PDF text stays selectable.** The artwork is placed as an image because it contains a photograph,
but every text element is then drawn again over it with the jsPDF native `doc.text()` API, so the
output carries real text operators. This is the standing rule from
`RESUME_PDF_RASTERIZED_TEXT_FIX.md` and is now asserted rather than assumed. The "Flatten PDF"
checkbox is the deliberate opt-out and is tested to suppress the text layer.

## Persistence and Backward Compatibility

The storage key `tb_poster_v1` is deliberately **not** bumped. Bumping it would silently discard
the saved work of every visitor mid-poster at deploy time; instead `migrate()` reads a v1 record
(`{caption, frame}`) and promotes its single caption into the new element list.

A top-level `caption` key is still written on every save, because `summarizeSaved()` in `js/app.js`
reads exactly that for the homepage's continue-where-you-left-off strip. Dropping it would not fail
anything loudly -- the strip would just quietly stop describing poster work, which is the class of
silent regression this project has been bitten by before. This is asserted in the new test.

Text is sanitised through `TB.sanitize` before storage and reaches the DOM only via `textContent`
or canvas `fillText`, never `innerHTML`. The emoji picker builds its buttons with `textContent` for
the same reason, and uses native Unicode glyphs rather than an image CDN, which would be a network
dependency inside an editor whose proposition is that nothing leaves the device.

## Verification

- `node tests/verify-layout.js --no-baseline` -- 881 checks, passes. Every layout contract holds:
  the rail inset on poster.html, band exclusivity, print output, and the selector-agreement check
  that every hook `js/poster.js` queries exists in the served markup (this one matters a great
  deal here, since the rebuild introduced roughly forty new element ids).
- **New: `node tests/verify-poster-editor.js`** -- 31 behavioural checks. The layout suite measures
  geometry and is deliberately blind to whether a control does anything; an undo button that never
  enables, a panel showing PDF options for a PNG, or an export that throws inside a `try/catch` and
  silently produces nothing are all invisible to it. This drives the real controls over CDP and
  asserts on the model and on the blobs the export paths actually produce. **Mutation-tested**:
  disabling the undo button's listener makes it fail with two named checks, and restoring it makes
  it pass.
- The PDF branch is asserted against a **recording stub** with the jsPDF API surface, run
  unconditionally so the result is identical with and without network. This tests the project's
  export logic -- image plus text layer, flatten, crop marks, bleed geometry, encryption options --
  not jsPDF itself. Whether the real CDN library loads is printed as a note and never asserted, so
  the suite does not fail on a machine that is offline.

## Two Fixes Made to the Test Harness Along the Way

- **A flaky assertion was corrected.** "homepage scrolled: column still full height, header still
  inset" failed about one run in three with `headerTop` at fractional values like -1.9. It waited
  two animation frames after a `scrollTo`, which catches the homepage's hide-on-scroll header
  mid-transition. It now polls until the header stops moving. It was also asserting
  `headerTop === 0`, which contradicts the hide-on-scroll behaviour added on August 14, 2026 and
  only passed at all because an instant `scrollTo` does not reliably trigger the hide; that check
  is about the horizontal inset, so the vertical position is now allowed anywhere between 0 and
  minus the header's own height. Verified stable across four consecutive runs, and mutation-tested
  to confirm it still catches a header that escapes the column.
- **The server process leak was fixed.** `startServer()` spawns with `shell: true`, so the child is
  the shell and `npx` spawns `serve` beneath it; `proc.kill()` reaped only the shell and left a
  live server holding the port. The next run then either talked to a stale server from an older
  working tree or timed out against it, surfacing as "navigation did not settle within 20s" on an
  unrelated page -- which reads like a site bug and is not one. Both test files now kill the whole
  process tree. Confirmed: zero `serve` processes survive a run of either suite.

## Known Limitations

- **The PDF text layer approximates the canvas typography rather than matching it exactly.** jsPDF
  ships a fixed set of standard PDF fonts, so the nine-face dropdown maps onto times/helvetica/
  courier. A poster set in Playfair Display gets Times in the PDF text layer. The visual appearance
  is still correct because the artwork image underneath carries the real face; it is the selectable
  text layer that is approximated. Embedding the real fonts would need them shipped as base64 VFS
  files, which is a meaningful payload decision rather than an oversight.
- **PPTX is a single full-bleed image slide.** The text is not editable in PowerPoint. Emitting
  native DrawingML text boxes is possible with the same ZIP writer and would be the natural next
  step if anyone wants to edit the poster after export.
- **Real Adsterra creatives and real jsPDF are not exercised locally**, for the same reason in both
  cases: the hosts are unreachable from the test environment.
