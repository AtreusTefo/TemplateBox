# The Serif Timeline CV, and a Header That Sets Its Own Height

Built September 19, 2026, from a supplied raster reference. Eighth resume
template, third two-column one, and the first with an education timeline.

## Summary

A CV in one serif family on a grey sheet. A full-width header carries a
rectangular photograph on the left and the name in large capitals on the
right, over four icon-led detail rows. A rule closes the header and both
columns start level beneath it: a narrow left column with CONTACTS and
EXPERIENCE, a wide right one with CHARACTERISTICS, EDUCATION and SKILLS. Every
section heading is capitals over a rule. EDUCATION is a timeline, a vertical
line with a filled dot on each entry.

## The reference is not A4, and the scale comes off its HEIGHT

Measured, not assumed: the raster is **736 x 1104**, aspect 0.6667 -- a clean
2:3, which is a screen export ratio rather than a paper one. A4 is 0.7067.

Two ways to put it on A4, and the choice is not a matter of taste:

| | scale by width | scale by height |
| --- | --- | --- |
| factor | 0.80842 | **0.76268** |
| raster maps to | 595 x 892.5pt | 561.3 x 842pt |
| deepest ink (y=1066) | 861.8pt, **19.8pt off the page** | 813.0pt, 29pt foot margin |
| body type | 13.10pt | 12.36pt |
| text block | 530.3pt, 32.3pt margins | 500.3pt, 47.3pt margins |
| cost | 50.5pt out of the vertical rhythm | wider side margins |

Scaling by width overruns the page and then demands that 50.5pt be taken back
out of the leading and the section gaps -- compressing the design against
itself by six percent, so every gap-to-type ratio in the artwork changes.
Scaling by height costs nothing at all: both axes take the same factor, every
internal proportion survives exactly, and the difference goes to the side
margins, where 47.3pt is 16.7mm and an ordinary A4 margin.

**A differently-proportioned design has to give somewhere. Giving it to the
margins is the only option that does not distort the artwork.** The vertical
rhythm here is the reference's own, unscaled relative to the type.

The export is also **shifted 6px left of centre**: its rules measure 656px wide
on a 736px sheet, which is exactly what symmetric 40px margins give, but they
run x=34..689 rather than 40..695. Corrected here rather than reproduced, so
the sheet is symmetric.

## Measurements

Sizes are derived from measured WIDTHS through jsPDF's **Times** metrics --
times, not helvetica, because this is a serif design and the two faces have
different widths per em, so a size taken through the wrong one breaks lines in
the wrong places.

Ten independent strings put the body between 12.27 and 13.09pt, mean 12.49;
the template sets **12.5**. Five headings gave 14.75 to 15.79 at width-scale,
mean 15.19, which is **14.3** here. The name comes from CALIPA AMINODEN, the
longer and so more reliable of its two lines: **32**.

**The reference's face is not Times and has a taller cap for its width.** Its
caps imply 16.1pt for the headings and 39pt for the name where its widths imply
14.33 and 32. Width wins, because width is what decides where a line breaks,
and a name set to match the cap would be a fifth too wide for the column it has
to fit.

| landmark | raster px | points |
| --- | --- | --- |
| text block | x 34..689 | 47.34..547.66 |
| left column text | x 34..203 | 47.34..176.24 |
| divider | x 244 | 207.50 |
| right column text | x 277..689 | 232.67..547.66 |
| photograph | x 39..250, y 62..370 | 51.15..212.84, 47.29..282.19 |
| header closing rule | y 402 | 306.60 |
| first section heading | y 448 | 341.68 |
| timeline dots | y 671.5 / 746 / 820 | 512.14 / 568.96 / 625.40 |

### Two things the grid does not do

**The heading rules are not the column width.** The left column's rules stop at
176.24pt, but the reference runs its email to 201.4pt -- 24pt past them, hard
against the divider. So the text measure is the gutter and the rule is
deliberately shorter than it. Taking the rules for the measure, which the first
version did, broke a 24-character address mid-word. The sidebar's right inset
is 5, and `sideHeading` carries `rule.length: 0.8335` to draw the short rule.

**The section gaps in the reference are inconsistent.** Measured 47.67pt
between CHARACTERISTICS and EDUCATION, 23.65pt between EDUCATION and SKILLS,
72.83pt in the left column. One normalized value of **36** is used instead: it
is half the right column's measured total, so that column's overall depth is
unchanged, and it removes a spread that is placement by eye rather than design.
The cross-column coincidence this loses -- the reference aligns EXPERIENCE with
the first education entry at 517.86 and 518.62 -- is not reproducible while
each column flows independently, and is recorded here rather than faked.

## The header sets its own height: `crossRule`

A two-column sheet with a full-width header has a problem no existing block
solved. The header's height depends on its content -- an address that wraps to
a third line makes it taller -- but a column's `firstBaseline` is a fixed
number in the descriptor. Fix the baselines and a grown header overruns them;
set them for the worst case and the common one carries dead space.

`crossRule` takes the DEEPEST cursor of any column, draws its rule below that,
and starts every column level beneath it. The header is then ordinary flowing
blocks and the columns follow wherever it ended, in either direction.

Two details are load-bearing:

- **It clears `started` on every column.** The first section under the rule must
  draw at the cursor with no heading gap, exactly as it would at
  `firstBaseline`. Without this the columns began level and then silently
  stopped doing so **as soon as a photograph was uploaded** -- the filled photo
  path marks its column started and the empty slot does not, so the sidebar
  gained a 36pt gap the main column already had. Caught by measurement, not by
  eye: CONTACTS at 324.2 against CHARACTERISTICS at 360.2.
- **`minY` is a floor.** A photograph is absolute and advances no cursor, so a
  sheet whose header fields are all blank levels at the name alone and would
  draw this line straight across the portrait. The floor is 262, just below the
  picture.

The divider hangs from the cursor rather than from an absolute y, for the same
reason: once the rule moves with its content, a fixed `y1` pokes above it the
moment an address wraps.

## What the photograph costs

`PHOTO_RATIO` is fixed at 4:5 site-wide precisely so no painter can stretch a
face. The reference's frame is **0.688** -- taller than 4:5.

The template keeps the reference's WIDTH and takes 4:5's height, so the picture
ends at 249.4pt rather than the reference's 282.2, 33pt higher. The
alternatives were changing `PHOTO_RATIO`, which is forbidden and would reach
every other template, or letterboxing, which puts grey bars inside a portrait.
Verified drawn at exactly 0.8000.

## Engine additions

Every one is an optional key; a template that does not set it lays out exactly
as before.

| addition | what it does |
| --- | --- |
| `crossRule` | a rule spanning both columns that levels them beneath it |
| `vrule.fromCursor` | a divider measured from the cursor, not the page top |
| `timeline` on entries | a rule down the entries with a dot per entry, driven from the list |
| `indent` on entries | lays the entries into a narrowed column |
| `marker` on entries | one mark per ENTRY at the column's edge |
| `label` on a contact row | a label line above the value, icon on the label's baseline |
| glyphs | person, calendar, flag |

Three notes worth keeping:

**The timeline is driven from the entry list**, so a fourth education row grows
the rule and gains a dot with nothing in the descriptor changing. It is grouped
by page, so a list that paginates gets one rule per page rather than one
stretched between them, and a single entry draws a dot and no rule.

**The entry marker is emitted WITH its entry.** The first version collected the
marks and drew them after the loop, which put both bullets in a clump at the
end of the sidebar's content stream -- an extractor saw the whole section and
then two loose bullets. They carry no information, which is exactly why they
must not be the thing that breaks a contiguous record.

**The new glyphs are shapes, not strokes.** The bust's shoulders are the upper
half of an ellipse rather than a circle or a trapezoid, because at 12pt a
circle gives a bubble and straight sides give a road sign. The calendar's
header band is what stops it reading as a picture frame. The flag is a pennant:
the reference draws a rectangular banner with a wavy fly edge, and at this size
the wave reads as a smudge.

## ATS position: design-led, deliberately

Two-column AND photo-led, so it fails two of the three conditions the site's
unqualified claim requires, by construction. `grey-rail` and `peach-portrait`
set the precedent.

It keeps the third. Blocks are declared sidebar-first, and the measured content
stream is **three runs, never interleaved**: the header (6 lines, full width and
belonging to neither column), then the whole sidebar (15), then the whole main
column (25). Each experience entry reads as bullet, role, employer, place; each
education entry as stage, school, dates. The timeline costs nothing -- a rule
and three dots are vector marks an extractor does not see.

## Two defects this exposed, both pre-existing

**peach-portrait was missing from the address and city gates.** Its contact
block has composed `address` with `city` since it shipped, but
`data-templates` listed only `grey-rail boxed-biodata`. A gate controls
visibility and never collection, so the sheet always drew the sample's address
correctly -- what a visitor on that template could not do was SEE the inputs to
change it. `resume.html` already carried a comment calling this "the fault this
file has shipped twice already"; it has now shipped three times, and the
comment says so.

**`education[].field` had no input at all.** grey-rail has composed it into its
education head since August 2026, so that template drew "MBA, 2012 - 2014"
where it was written to draw "MBA, Operations Management, 2012 - 2014". It is
collected now.

**It is deliberately left EMPTY in the sample**, because filling it would change
grey-rail's output and break the byte-identical proof below. A visitor who
fills it gets the reference's four-line education entry; the sample shows three.

## Verification

- **The seven existing templates are byte-identical.** Display lists captured,
  engine and registry reverted to HEAD with `git stash`, recaptured: same op
  count, same page count, same hash for all seven. The CONTROL that makes this
  mean anything is that `serif-timeline` was absent from the reverted registry,
  so the comparison really ran against HEAD.

| template | ops | pages | hash |
| --- | --- | --- | --- |
| peach-portrait | 88 | 1 | 4b719c90 |
| boxed-biodata | 110 | 2 | 7f19db63 |
| classic | 60 | 1 | fd2196b5 |
| grey-rail | 91 | 1 | 5dffda0c |
| ruled-serif | 85 | 2 | 4bc5391a |
| photo-rail | 96 | 1 | 3ff98cae |
| label-rail | 72 | 1 | ee53c87d |

- **One page**, with and without a photograph, and no column overflows.
- **Extraction order** is three uninterleaved runs, dumped above.
- **The PDF's text is still text**: 17,656 bytes, 46 text-positioning
  operators, 1 image.
- **The photograph draws at 0.8000**, the ratio `PHOTO_RATIO` fixes.

## Files changed

| File | Change |
| --- | --- |
| `site/js/resume-engine.js` | `crossRule`, `vrule.fromCursor`, entries `timeline`/`indent`/`marker`, contact row `label`, three glyphs |
| `site/js/resume-templates.js` | the `serif-timeline` descriptor |
| `site/resume.html` | `age`, `characteristics`, education `field`; peach-portrait added to the address and city gates |
| `site/js/resume.js` | the new fields in `DEFAULT_STATE` and the sample |
| `site/index.html` | catalog card, count 54 to 55 |
| `site/js/admin.js` | `CATALOG_ITEMS` entry |
| `site/css/style.css` | `.mock-doc.timeline` miniature |
| `tests/verify-layout.js` | `field` added to the education harvest keys |
