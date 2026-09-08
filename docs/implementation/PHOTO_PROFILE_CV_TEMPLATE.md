# Photo Profile CV: The First Template That Draws the Visitor

Date: September 8, 2026 (revised the same day -- see "Six Defects Found By Review" at the foot)

Status: Shipped and verified. The resume editor offers five templates, and one
of them puts the visitor's own photograph on the sheet.

## The Problem This Closes

Every resume template this project has shipped renders text and drawn vector
primitives and nothing else. That was never a stated constraint -- it was a
capability gap. The engine's display list had five operations (`rect`,
`roundrect`, `circle`, `poly`, `line`, plus text) and no way to place a bitmap,
so a photo CV could not be described as registry data no matter how the
descriptor was written.

A photograph is also the single most-requested thing a CV template can have
that this editor could not do. Outside the United States and the United
Kingdom, a headshot on a CV is the norm rather than the exception.

## What Was Done

| File | Change |
|---|---|
| `site/js/resume-engine.js` | `photo` and `bar` block kinds, an `image` display-list operation in both painters, `PHOTO_RATIO` exported, `contact` usable as a section body |
| `site/js/resume-templates.js` | The `photo-rail` descriptor |
| `site/resume.html` | The profile-photo control, and `photo-rail` added to five existing `data-templates` gates |
| `site/js/resume.js` | Upload, centre-crop, re-encode, its own storage key, hydration |
| `site/css/style.css` | `.photo-chip` in the form, `.mock-doc.photo` for the catalog miniature |
| `site/index.html` | The Photo Profile CV card |
| `site/js/admin.js` | The matching `CATALOG_ITEMS` entry |

No new form field carries text. The descriptor reads `email`, `phone`,
`location`, `skills`, `languages`, `accomplishments` and the four repeating
lists, all of which the editor already collected, so switching to this design
from any other shows the whole document immediately with only the photograph
left to add.

## Five Things Worth Knowing

### The crop happens once, at upload, and that is not a convenience

The obvious design is to store the photograph as uploaded and crop it at draw
time, so a template could ask for any shape. It does not work, and the reason
is the engine's central rule.

SVG can crop an image to a box -- `preserveAspectRatio="xMidYMid slice"`, or a
nested viewport. jsPDF's `addImage` cannot: it has no source rectangle and
stretches whatever it is given to the width and height it is told. Cropping at
draw time therefore means the preview crops and the PDF stretches. That is
precisely the preview-disagrees-with-the-export defect the one-layout-two-
painters architecture exists to make impossible, and it is the same defect
class as the two renderers `js/resume.js` used to carry.

So `js/resume.js` centre-crops every upload to one fixed ratio before it is
stored, and the engine's photo block takes a WIDTH only and derives its height
from `TBResume.PHOTO_RATIO`. A descriptor cannot name both, so a stretched face
is not a bug that has to be avoided -- it is unrepresentable.

4:5 is the ratio, which is also what `js/admin-image.js` reshapes catalog
thumbnails to. One number, exported from the engine and imported by the editor,
because a second copy of it is a stretched face waiting to happen.

### No photograph draws no placeholder

A `photo` block with no photograph draws nothing at all and the panel starts at
the next block, which is the convention every other block in the engine already
follows for an empty field.

A placeholder was considered and rejected. A grey box with initials in it reads
as a deliberate design in the live preview and as an embarrassment in an
exported PDF, and there is no way to draw one in the preview alone: the engine
lays out once and paints the same display list to both mediums, so anything the
preview shows, the export contains. The place to tell somebody a photograph is
missing is the form, which says so, and not the document.

### The photograph has its own storage key, and the reason is a silent failure

`TB.storageSet` swallows a quota failure by design -- editing has to keep
working in a private window or against a full quota. That is right, and it is
also why a photograph cannot live in the document record.

A photograph is the only thing this editor stores that can plausibly approach
the 5MB origin budget. In the same record, one oversized upload would make
every subsequent save of the record fail, silently, from that moment on: the
visitor keeps typing and nothing is kept, with nothing said. Two keys means the
worst a photograph can do is fail to save ITSELF, and `storePhoto()` reads the
value back after writing it so even that is reported rather than swallowed.

`tb_resume_v1` therefore never contains a photograph. `collectState()` attaches
one for the renderer; `persistAndRender()` strips it from the copy it writes.

### The stored data URI is treated as untrusted input

`state.photo` reaches the engine from `localStorage`, which anything else
running on the origin can write. An SVG data URI carries markup; a remote URL
would make the sheet fetch something; `javascript:` is a URL too.

`photoUrl()` in the engine accepts a base64 PNG or JPEG and nothing else, and
anything failing that test draws no photograph -- exactly as if none had been
uploaded. `js/resume.js` applies the same test on the way OUT of storage, so a
bad value never reaches the form or the state object either.

Verified: a document whose `photo` is `data:image/svg+xml;base64,...` exports a
PDF byte-for-byte the same size as one with no photograph at all.

### The size of the stored copy is a deliberate number, not a default

480px wide at JPEG quality 0.82. That is roughly 17KB for a photograph, against
680KB for the same image as a PNG and several megabytes for a phone camera
original.

480px across the descriptor's 167pt (2.32in) box is about 207dpi in the export,
which is more than a CV printed on an office laser needs and enough that the
photograph does not soften on screen at any zoom a reader will use. The
downscale runs in halving steps rather than one jump, for the reason
`scaleTo()` in `js/admin-image.js` gives: a one-shot `drawImage` from 4000px to
480px samples a fraction of the pixels it discards, and the aliasing shows on
hair and on the edge of a collar.

## The Design

A 211.2pt panel (0.355 of the page) down the LEFT edge, pale rather than
filled with the accent, carrying the photograph, contact rows, skills,
education and languages. The main column carries the name, the professional
title, a four-segment colour bar, and the summary, experience, projects,
certifications and references.

The panel is on the left because the photograph is the reason to choose this
design and the left edge is where the eye lands. It is pale because three
things are read against it -- the accent icon discs, the accent headings and
the photograph -- and tinting the panel with the accent as well would collapse
that contrast at three of the five swatches.

The accent is live. The icon discs, every heading and rule, the first bar
segment and the block behind the photograph all resolve to `accent`, so the
swatch row recolours the sheet's identity rather than one rule. The panel tint
and the name's near-black are fixed.

### The colour bar is a block, not a rule with a list of colours

`rule` draws a stroked line. The bar is a run of filled rectangles. Giving
`rule` a second, mutually exclusive drawing mode would make every existing rule
in every descriptor read as though it might be one, so `bar` is its own block.

Its segments overlap by 0.4pt rather than sharing an edge. Two rectangles that
merely meet leave a hairline of white wherever the device pixel grid falls
between the two coordinates -- visible in the PDF at any zoom. The seam is
closed by overlapping rather than by rounding the coordinates, which cannot be
done without changing the bar's total width.

### `contact` became usable as a section body

The reference artwork sets a CONTACT heading over the icon rows. `contact` was
a block in its own right, and a block cannot have a heading -- only a section
can, and a section needs a body.

Rather than teach the `contact` block to draw its own heading (a second copy of
the heading assembly, rules included), a section body may now be
`{ kind: "contact", ... }` and `layoutBody` delegates to the same
`layoutContact` the block form calls. The two forms cannot draw differently
because they are the same function. `sectionHasContent` answers for it too, so
a document with no contact details loses the heading along with the rows
instead of standing a CONTACT over nothing.

### Certifications and Awards are one section

The reference sets them as two. They are one here, reading the
`accomplishments` field the editor already collects, because splitting them
would mean a new form field whose only purpose is to decide which of two
identical lists a line appears under.

## What Was Measured

With the editor's own sample content, at the default navy accent:

| | Value |
|---|---|
| Pages | 1 |
| Main column overflow | none |
| Panel column overflow | none |
| Display-list operations | 105 with a photograph, 103 without |
| Unresolved colour roles | 0 |
| Drawn photo aspect | 0.8 |
| Stored bitmap aspect | 0.8 |
| `TBResume.PHOTO_RATIO` | 0.8 |
| Photo box | 167 x 208.75pt at (22, 32) |
| Panel | 211.22pt, `#EEF1F6` |
| Bar segments | 80.34pt wide on a 79.94pt stride |

Exported PDF, same document:

| | Value |
|---|---|
| With a photograph | 36,273 bytes, one `/Subtype /Image` with `DCTDecode` |
| Without | 18,263 bytes, no image |
| With a hostile SVG data URI | 18,263 bytes -- identical to no photograph |
| Text-positioning operators | 81 |

The last row is the one that matters for ATS parsing: embedding a bitmap did
not turn any text into pixels. Every string is still written with `doc.text()`,
as `docs/error-fixes/RESUME_PDF_RASTERIZED_TEXT_FIX.md` requires.

All four pre-existing templates were re-laid out with a photograph present, with
one absent, and against a wholly empty document. None throws, none draws an
image, none reports overflow, and none produces an operation carrying an
unresolved colour role.

## Two Traps Hit On The Way

**The chip's `display: flex` beat `[hidden]`.** The form's photo thumbnail sat
visible with a broken image before any upload: an author `display` beats the UA
stylesheet's `[hidden] { display: none }`, so `.photo-chip[hidden]` has to opt
back out by hand. `.layer-actions` and `.mockup-tray` fell into the same trap
and carry the same note.

**An empty `src` is not an absent one.** Setting `img.src = ""` resolves against
the document, so the browser re-requests `resume.html`, fails to decode it as an
image and paints the alt text. The attribute is removed instead.

**The miniature's panel is a literal hex.** The paper-surface block at the top
of `style.css` re-declares the LIGHT palette inside `.mock-doc` for exactly
eight variables, and `--color-surface` is not one of them. Using it would have
painted a dark panel onto white paper in dark mode -- which is the defect that
block exists to prevent.

## Related Files

- `site/js/resume-engine.js` -- `photoUrl`, `PHOTO_RATIO`, the `photo` and `bar`
  branches of `layoutBlock`, the `image` arm of `svgNode` and `pdfOp`
- `site/js/resume-templates.js` -- the `photo-rail` descriptor
- `site/js/resume.js` -- `PHOTO_KEY`, `cropToRatio`, `storePhoto`, `setPhoto`,
  `bindPhotoUpload`
- `site/resume.html` -- `#f-photo` and the `.photo-chip` block
- `docs/implementation/RESUME_TEMPLATE_ENGINE_IMPLEMENTATION.md` -- the engine
  contract this extends
- `docs/implementation/FOURTH_RESUME_DESIGN_GREY_RAIL.md` -- the previous
  template, and the catalog-card parity rules a fifth one has to satisfy

## Six Defects Found By Review, and the Check That Should Have Caught One

Revised: September 8, 2026, after the template above had already been written
and the suite reported it clean at 1369/1. Every one of these was found by
reading the code rather than by running it, which is the point worth recording:
**the suite has no per-template checks at all.** It verifies ad bands, insets,
launch routing, catalog parity and export filenames. Nothing in it renders a
resume template and looks at the result, so none of the six below could have
failed it.

### 1. The default accent was not on the swatch row (high)

`defaultAccent: "#1B2A4A"`, and the swatch row carries `#1F4E79`. The invariant
is written on the row itself, in an HTML comment, and says exactly what happens:
`applyAccent()` marks a swatch active by matching its hex EXACTLY, so an off-row
default opens the editor with nothing selected and, the moment the visitor tries
another colour, **the template's own accent is unreachable forever**.

That is the dead-control defect this project has hit before -- it is why
`colorOf` resolves a palette entry that names `accent`, and why the green and
the graphite were added to the row for the two templates that need them.

Fixed by using the row's own `#1F4E79`. Adding an eighth swatch was the other
option and was rejected: `#1B2A4A` and `#1F4E79` are both navy, so it would have
put two nearly identical blues side by side to serve one template.

**New static check 1m** enforces it now, because a comment asking people to
remember is not a check. It parses the swatch row out of `resume.html` and every
`id`/`defaultAccent` pair out of the registry, and asserts each declared accent
is on the row. A template declaring no accent is skipped, which is what Classic
does on purpose. Mutation-proven three ways: restoring `#1B2A4A` fails naming
`photo-rail`; deleting the green swatch fails naming `ruled-serif`; renaming the
swatch class trips a second assertion that the row was parsed at all, so the
check cannot quietly become vacuous.

### 2. "Start blank" left the photograph behind (high)

The sample notice's Start blank handler clears every `[data-bind]` control, then
the experience, education, language, project and reference lists by hand --
each with a comment explaining that rows are not `[data-bind]` controls so the
sweep does not reach them. It had been written twice already.

A photograph is the same shape of thing a third time, and it was missed: Start
blank produced an empty resume with the visitor's face still on it, and left the
photograph in storage so it survived the reload too. It now calls `setPhoto("")`,
which is the one path that clears the sheet, the thumbnail and the key together.

### 3. Without a photograph the panel started 54pt too high (medium)

The first version had the photo block read the CURSOR as its box top, which
forced the column's `firstBaseline` to be a box top as well -- 32. With no
photograph uploaded, the first thing in the panel is the CONTACT heading, and it
landed on that same 32 as a text BASELINE: hard against the paper edge, and 54pt
above the name in the main column.

The block is positioned absolutely by its own `top` now and does not read the
cursor at all. `firstBaseline` is an ordinary baseline again, and deliberately
86 -- the main column's -- so a document with no photograph sets CONTACT level
with the name. Measured after the change: CONTACT at 86, name at 86.

**The with-photo case did not move**: photo box still (22, 32) at 167x208.75,
CONTACT still at 284.75, one page, no overflow. The fix is confined to the case
that was wrong, which is the property that made it the right fix.

### 4. An orphan photograph was restored onto sample content (medium)

Separate keys are what protects the document (defect class in the section above),
but they also let one outlive the other. `init()` restored the photograph
unconditionally, so clearing the document record alone -- and nothing stops that
-- put somebody's face on the first-run SAMPLE content.

The photograph belongs to a document, so it is restored only when a saved
document exists, and an orphan is cleared rather than left waiting for the next
load. Nothing can be lost by the gate: uploading writes the document record too,
so a photograph with no record is an orphan by definition.

### 5. The security guard existed in two copies (medium)

The engine's `photoUrl()` and the editor's `validPhoto()` carried the same regex,
written out twice. Both were correct on the day they were written, which is
exactly how a security rule drifts -- the copies stop agreeing the day one is
widened and nothing says so.

The engine exports `isPhotoUrl` now and the editor calls it. With no engine there
is nothing to draw and nothing to protect, so an absent library rejects rather
than falling back to a second copy.

### 6. A failed save left the previous photograph behind (low)

`storePhoto()` reads back after writing, so a quota failure is reported -- but
`setItem` throwing leaves the PREVIOUS value under the key, which would come
back on the next load. The message said the photograph would not be kept; the
old one would have been.

The key is cleared on failure, so the message is true. A small value replacing a
large one is also the write most likely to succeed against a full quota.
Verified by stubbing `setItem` to refuse anything over 500 bytes: the message
appears, the new photograph is on the sheet and will export exactly as promised,
and the stale one is gone.

### Also removed

A dead `offsetX` parameter on the photo block that no descriptor used.
