# The Trade Counter Receipt

Date: September 11, 2026
Status: Implemented

## Summary

A supplied A4 artwork -- a parts-counter receipt carrying the seller's bank
details on its face -- is the document editor's FIFTH layout, after the plain
receipt, the itemised receipt, the notice and the ruled invoice.

| File | Change |
| --- | --- |
| `js/docs.js` | the `trade-receipt` layout: constants, both painters, the footer band |
| `docs.html` | the account block, the client cell number, the terms, and the gating of shared controls |
| `css/style.css` | the sheet and the catalog miniature |
| `index.html`, `js/admin.js` | the catalog card and its registry entry |

The brief this was built from is `docs/project/AUTO_SPARES_RECEIPT_PROMPT.md`,
and where the build departs from it, the departure is recorded below.

## Nothing of the source business ships

The supplied artwork is a real company's stationery, completed: a bank account
number, a branch and SWIFT code, a personal Gmail address, two mobile numbers, a
street address, a registered name and a trademarked logo. `site/` is the publish
directory, so any of it copied across would be a public URL.

None of it is here. The logo is a visitor upload reusing the ruled invoice's
`LOGO_MAX_EDGE` and `LOGO_URI` gate; every other string is a field; the template
is called "Trade Counter Receipt", which describes the layout rather than
advertising the shop. The terms are newly written, not the source's five -- which
are that company's policy and contain a typo it would have been absurd to
reproduce faithfully.

**The seven account fields ship EMPTY and are deliberately left out of the
sample content.** Every other document type seeds a sample so a first-time
visitor sees the sheet working, and the block renders its labels and its rules
when empty anyway, so nothing is lost. A bank account number is the one field
where a plausible-looking placeholder left uncleared would be worse than a blank
rule.

## Two of the five columns had no heading, and they are not the same kind of gap

The artwork's grid divides at x 45.40, 127.84, 339.95, 422.35, 505.09 and
546.65 points. Only three of the five columns are titled: Quantity,
Descriptions, Amount.

The totals settle what the other two are. Those three boxes span the LAST TWO
columns and are divided at the same x=505.09 the Amount column is divided at,
while the 82.40pt column before Amount does not appear in them at all.

- A column that is not totalled is a **unit price**. It is headed "Price" here.
  The artwork omits the heading; a column a visitor cannot name is a column they
  will not fill.
- A narrow column that carries the division down through the totals is the
  **currency's minor unit**. `tradeAmountParts()` splits the formatted money at
  the decimal point, right-aligning the major unit in the wide cell and the
  minor unit in the narrow one, so figures stack on the decimal the way they
  would if they were written in by hand. That is the whole reason the artwork
  has a fifth column, and dropping it as decoration would have left the totals
  out of line with the grid above them.

A currency with no minor unit returns an empty second part rather than "00", so
JPY puts the whole figure in the wide cell and leaves the narrow one blank.

## One money model, one set of arithmetic

Sub Total, the VAT row and TOTAL all come from the existing `computeTotals()`.
This is a fifth sheet, not a fifth set of arithmetic -- the same rule the ruled
invoice was built on.

Two of that model's rows have nowhere to go on this artwork, and rather than
computing them into a total nothing displays, the **discount and amount-paid
fields are gated away** from this type in `docs.html`.

The middle row's label is the shared `taxLabel` field, so a visitor outside a
VAT regime can type their own. Its DEFAULT had to become per-type: the shared
sample seeds "Sales Tax", which would have had the sample contradict the design
it was sampling. `SAMPLE_BY_TYPE` is a small overlay on `SAMPLE_FIELDS` for
exactly that.

**One reading was left open.** "V.A.T Inclusive" can mean the total already
contains the VAT, in which case TOTAL would equal Sub Total and the middle row
would show the portion within it. The implemented reading is the ordinary one --
Sub Total, plus VAT, equals TOTAL -- because three boxes showing two distinct
numbers reads as a broken form. A trader entering VAT-inclusive prices should
set the rate to zero.

## Points in, millimetres out, once

The artwork is in POINTS on a 595.28 x 841.89 artboard. `docs.js` drives jsPDF
in MILLIMETRES. 595.28pt is exactly 210mm, so the conversion is one constant and
it is applied where the constants are declared, never inside the renderer.

The artwork's table edges land on 16.02mm and 192.84mm against this page's 16mm
margins, and are squared up to the margins: under a fifth of a millimetre, and
keeping them would have this one sheet disagreeing with every other about where
the page begins. Its 10mm TOP margin is kept, because at 6mm from the others it
is a real part of how the form looks.

Thirteen rows on ONE pitch. The source's own rows are hand-placed -- ten rects of
19.5pt at tops that drift, three rows that are not rects at all, and a first row
of 20.99 -- and copying them would have reproduced a wobble nobody intended.

## Two painters, and the one thing that nearly drifted

The preview is an HTML sheet styled by CSS; the export is jsPDF. They are
separate code paths and they drift silently.

The footer band was drawn in the preview and **not drawn in the PDF at all** in
the first pass -- the exact preview-disagrees-with-export defect the two-painter
discipline exists to prevent, and it survived because nothing about a decorative
shape makes its absence obvious. It is now `TRADE_BAND`: one set of coordinates,
with `tradeBandPath()` generating the SVG `d` for the screen and
`drawTradeBand()` differencing the same points into the relative segments
`doc.lines()` wants.

jsPDF has no gradients, so each sweep prints as its darkest stop. That is a real
difference from the screen and it is the right way round -- a flat band of ink
reproduces predictably where a gradient banding across a cheap printer does not.

## Verified

- The filled sheet matches the supplied artwork in layout, checked by rendering
  it rather than by reasoning about it.
- Arithmetic: three lines at 2 x 349.50, 1 x 88.00 and 4 x 12.25 give 836.00,
  14 per cent gives 117.04, total 953.04.
- The PDF exports one page, 18KB, with font objects and 59 text strings -- real
  selectable text, not a raster.
- PDF coordinates agree with the artwork's own: "TERMS & CONDITIONS" at x 26.1mm
  and y 245.3mm against the source's 73.98pt and 694.52pt; the grid header
  baseline at 117.6mm; "ACCOUNT DETAILS:" at 71.5mm. Nothing off-page.
- 24 curve operators in the PDF stream, so the band's three sweeps drew.
- The empty state prints as a ruled form: every label, every rule, thirteen
  rows, and an account block that keeps its lines.

## Three things found by looking, which no measurement asked about

- **The footer band was a CSS gradient and came out angular.** The artwork's
  sweeps are curves; `linear-gradient` can only give a straight edge, and the
  result read as a rendering fault rather than a design. It is an inline SVG
  now, sharing its coordinates with the PDF.
- **The catalog miniature stacked into the top 43 per cent of its tile** with a
  white void beneath, because the first version used percentage padding and gap
  inside a flex column, where the two resolve against different axes.
- **Then the grid took 68 per cent** once it was allowed to fill, and its rows
  came out as deep empty boxes. A ruled form reads by having many thin rules,
  not a few tall ones. The sections are sized to the artwork's own proportions
  now -- card 17 per cent, account 12, grid and totals 42, terms 11.

## A defect caught in a shared function

`applySampleContent()` ran BEFORE `sessionDocType` was resolved, so a per-type
sample overlay would have read whichever type the variable still held from its
declaration. The preset resolution moved above it. `TB.takePreset()` REMOVES the
key as it reads, so that block has to stay exactly one call, and the comment
there now says so.

Also fixed while building: `state.methods` is an object map keyed by method,
not an array. Reading it with `indexOf` threw, and because the throw happened
part-way through the renderer the sheet simply ENDED after the table -- the
totals, terms and band silently absent. Found by rendering and looking at what
was missing.

## The font: bundling was allowed and was declined anyway

The supplied `Roboto-Regular.ttf` is Roboto Regular 3.009 under the **SIL Open
Font License 1.1** -- Google relicensed Roboto from Apache 2.0 to OFL in 2024.
Unlike the music player poster, which had to refuse Microsoft's and Linotype's
faces, bundling this one is legally permitted with attribution.

It is not bundled. A fifth document layout is not a reason to add 146KB of TTF
to a page that already has a typeface, and one editor rendering in a different
face from the other four is a bug report waiting to happen. This is recorded
because the next person to open that folder will assume the font is off limits
for the reason the last one was, and they will be wrong.

## The landing page

`trade-counter-receipt-template.html`, built afterwards from
`rent-receipt-template.html`'s structure. An audit first established that this
was the ONLY template without one: every other document type already has a
landing page, and the poster, resume and mockup editors have a generic page
each.

**It deliberately does not target "receipt template".** Four receipt landing
pages already compete for that, and `SEO_AUDIT.md` already records one URL
competing for six intents as a known problem here. This one targets what the
sheet actually does differently -- bank details printed on the receipt -- in its
title, description and lede, and two of its five body sections cover ground none
of the others do: why the amount column is split in two, and why returns terms
belong on the receipt rather than on a wall behind the till.

Adding it touched more than the page itself:

| Thing | Why |
| --- | --- |
| `assets/og-trade-receipt.png` | a social card; without one every share renders as a bare link |
| `tools/og-image.html` | the preset that generates it |
| 21 files, `js/admin.js` included | the mega-menu lists every landing page |
| `sitemap.xml` | 21 URLs |
| two sibling pages | incoming links, so it is reachable other than through the menu |

**The OG set did not drift.** `tools/make-og-cards.js` regenerates all twelve
cards together, and its own documentation warns that a browser update silently
rewrites the lot. `git status` afterwards showed only the new file: the other
eleven were byte-identical. Chrome 153.0.8010.36 produced them.

**The mega-menu has a second copy** in `js/admin.js`, which builds the same
panel into exported blog posts. Both were compared entry by entry after the
edit: 39 links in identical order.

One correction worth recording. The first pass SWAPPED a link out of each
sibling page's related list to keep it at three items, which quietly removed two
internal links that were already there. Nobody asked for that. Both were
restored and the lists are four items now.

## A second pass on the visuals, against the artwork

Asked to bring the sheet closer to the supplied render, the GEOMETRY turned out
to need nothing: the header card, the account block, the grid, the totals and
the terms rule already land on the artwork's own points. What differed was
content and one piece of decoration.

- **The terms open with a line introducing the clauses**, which the artwork has
  and this did not, and the clauses are set in CAPITALS as the artwork sets
  them. Both are defaults in wording of our own; the source's five sentences are
  that company's policy and are still not copied.
- **The footer band is taller** (27mm against 21) and its sweeps rise further to
  the right, which is the shape the artwork actually has.
- **The sample stops seeding a closing note.** The artwork has nothing between
  its terms and the band, and a seeded "Thank you for your business" landed
  exactly there. The FIELD stays -- a footer message is a reasonable thing to
  want -- only the sample no longer fills it.

**One deliberate departure remains.** The artwork's third column has no heading;
this one says "Price". A column a visitor cannot name is a column they will not
fill, and that reasoning has not changed. It is one word and it is easy to
remove if fidelity matters more.

**The pass introduced a two-painter defect and it was caught by measuring the
export rather than by looking at it.** Adding the intro line pushed the fifth
clause past the PDF writer's cutoff, so the sheet showed five clauses and the
PDF printed four -- the painters disagreeing about CONTENT rather than about
geometry, which is a kind this file had not produced before. The cutoff is 284mm
now and not the band's top edge at 270, because the band is a sweep: it rises
left to right, and these clauses sit at x=26-31 where its ink does not begin
until about 287.

## Coverage, stated exactly

Section 1 walks the whole `site/` tree, so the new page picked up five static
checks and passes all five: 138 to 143 on `--quick`.

Section 4's layout measurements run against a HARDCODED page list in
`tests/verify-layout.js`, and the new page is not on it. Its rendered layout is
therefore never measured at any width. That is a deliberate omission rather than
an oversight -- the page is structurally identical to
`rent-receipt-template.html`, which IS on the list, and a second near-copy would
add minutes of runtime for little new signal -- but it means a layout regression
unique to this page would not be caught.

## Not done

- **No suite section.** Section 12 covers the ruled invoice's sheet, arithmetic
  and logo. The equivalent for this sheet is not written, so nothing automated
  guards the receipt itself.
- **The band's gradients do not print as gradients**, by choice -- see above.
