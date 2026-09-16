# Shipping grey-rail: Four Resume Designs, and Four Cards That Mean Something

Date: August 30, 2026

Status: Shipped and verified. The resume editor offers four templates, and each
of the four catalog cards under Resumes now launches its own design.

## The Problem This Closes

The Resumes category carried four cards with four distinct miniatures. Three of
them -- Executive Resume, Modern Professional CV, Minimalist ATS Resume --
carried **no `data-doc` at all**, so they launched the editor with no preset and
rendered whatever template was last used.

Three cards, three promises, one document. And after Ruled Serif shipped it got
worse rather than better: the output was no longer merely identical, it was
non-deterministic. A visitor who tried Ruled Serif and then clicked "Executive
Resume" stayed on Ruled Serif.

This was always true. Having only one design is what kept it invisible.

## What Was Done

`grey-rail` was built and verified on August 2 and had sat unshipped ever since,
reachable only from `tools/resume-template-preview.html`. The single thing
keeping it internal was that it reads four fields the editor form did not
collect. The form collects them now, so it ships.

| File | Change |
|---|---|
| `site/resume.html` | Four fields, gated `data-templates="grey-rail"`; a graphite swatch |
| `site/js/resume.js` | The four fields in `DEFAULT_STATE` and `SAMPLE_STATE` |
| `site/js/resume-templates.js` | `catalog: true`, card-matching title, accent palette |
| `site/js/resume-engine.js` | `colorOf` resolves a palette entry that names `accent` |
| `site/index.html` | Modern Professional CV repointed and its miniature rebuilt |
| `site/css/style.css` | `.mock-doc.railed` two-column miniature, graphite accent |
| `site/js/admin.js` | `CATALOG_ITEMS` id and doc for the repointed card |

The four fields are `address`, `city`, `postcode` and `phoneAlt`, which the
template's sidebar contact block sets across three icon rows. They are hidden
for the three single-column templates, which compose one joined contact line
from `location` and `phone` instead, and are still collected while hidden like
every other conditional field.

## Three Things Worth Knowing

### A palette entry may now name `accent`

grey-rail's palette was five literal hex values, which meant **the accent swatch
row did nothing on it** -- the dead-control defect this project has hit before
and which Ruled Serif was deliberately built to avoid.

Its rail and its display ink are one colour, so both roles now resolve to
`accent`, with `defaultAccent: "#4A4A4A"` keeping the artwork's own grey. That
needed a small engine change: `colorOf` returned the palette's value verbatim,
so an entry of `"accent"` reached the painters as the literal string, which is
not a colour any medium understands. It resolves one level of indirection now,
before the accent test. Verified: zero display-list operations carry `accent` as
a colour, and the rail paints `#4A4A4A`.

The alternative -- naming `accent` at all sixteen use sites -- would have worked
and cost the roles their names. A rail that is called `railBg` in the descriptor
is easier to reason about than one called `accent` in nine places.

### Every `defaultAccent` must be a swatch on the row

`applyAccent()` marks a swatch active by matching its hex exactly. grey-rail's
`#4A4A4A` was not on the row, so the editor opened with **nothing selected** and
the colour unreachable once changed. A graphite swatch was added beside the
charcoal one.

This is now an invariant with two templates depending on it, and it is written
above the swatch row in `resume.html` rather than left to be rediscovered.
Every swatch must also stay dark enough to carry the rail's white sidebar text
-- that is a constraint on any future swatch, not a coincidence of the current
six.

### It reads a field the form still does not collect

`education[].field` is in the descriptor and has no input. That is safe rather
than an oversight: `buildRuns` drops an empty field along with the separator
that would dangle after it, so the head reads "MBA, 2012 - 2014" rather than
"MBA, , 2012 - 2014". Anyone wanting the field of study types it into the
degree, which is what the sample content has always done. Verified on the
rendered sheet.

## The Card

"Modern Professional CV" was repointed at `grey-rail` rather than a fifth card
being added, because adding one would have left the original three still
promising designs they do not deliver. The template's `title` is the card's
name, so the picker button and the card agree, as they do for Ruled Serif.

Its miniature was rebuilt: the old one depicted a navy single-column sheet,
which is not what the card produces. `.mock-doc.railed` is a two-column
miniature whose rail is **37.65% of the width** -- the descriptor's own sidebar
fraction, 224 of 595 -- and full-bleed to the right edge, because a rail inset
from the edges reads as a panel rather than as the edge of the sheet. Measured
at 0.376 with the rail flush right.

`CATALOG_ITEMS` moved from `modern-professional-cv` to `grey-rail` to match: the
suite keys each card by `data-doc || slug(title)`, so giving the card a preset
changes its id. Nothing else keys on the old one -- the resume cards use CSS
miniatures, not thumbnail files.

## ATS Position

This is the site's **only two-column resume**, and that is a real trade: parsers
handle a single column more reliably. It ships as design-led, with the other
three retaining the unqualified ATS claim. Two mitigations are genuine and both
hold: there is no photograph, and because the engine controls `doc.text()` call
order, extraction order is deterministic rather than interleaved. Verified on
the export: 33 text operators, zero image XObjects.

## Verification

| Check | Result |
|---|---|
| Renders under the current engine | 1 page, no main or sidebar overflow |
| Rail geometry | x=370.98, w=224.02, matching the descriptor's 224/595 |
| Palette indirection | 0 display-list ops carry `accent` as a colour |
| Swatch row live | graphite active on load; rail follows the chosen swatch |
| Fields toggle | address shown; title and Languages hidden |
| Empty `education[].field` | head reads "MBA, 2012 - 2014", no dangling comma |
| PDF export | 9,915 bytes, 33 `Tj` operators, 0 image XObjects |
| Catalog cross-check | passes (card, `CATALOG_ITEMS`, count agree) |
| Card miniature | rail 0.376 of width, flush right, no page overflow |

## Found While Doing This: poster.html's jsPDF Was Blocked

Unrelated to the above and fixed alongside it, because it is one line and a live
breakage.

`site/poster.html` declared
`sha512-yBpuTHfsMK8bcvfF6zAsIO4Nmls5rncLnPGgHb1FnnQyzhomsanid1QzjZvZgeC2spPTdDaKlUJIMSPNMh3wxw==`
for jsPDF. The file's real SHA-512, computed from the bytes cdnjs actually
serves, is
`sha512-qZvrmS2ekKPF2mSznTQsxqPgnpkI4DNTlrdUmTzrDgektczlKNRRhy5X5AAOnx5S09ydFYWWNSfcEqDTTHgtNA==`.
They do not match, so **every browser blocked the script**, and
`exportPDF()` in `js/poster.js` guards on `window.jspdf` and told the visitor
*"The PDF engine did not load. Check your connection and try again."* -- blaming
their network for a bad hash. PDF export on the poster editor had been dead
since commit `cc7acff`.

The other four pages that load jsPDF all declare the correct **SHA-384**, so
poster.html was given that same value rather than a corrected SHA-512: all five
now carry one identical string, which is what stops this drifting again.
Verified in a clean tab -- zero integrity errors and `window.jspdf` present.

Worth noting how it surfaced: it appeared as console noise while verifying an
unrelated template, and the computed hash in the error message matched the real
file, which is what made it obvious the fault was in the page rather than in the
CDN.
