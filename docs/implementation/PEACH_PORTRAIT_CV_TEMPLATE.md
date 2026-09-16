# The Peach Portrait CV, and Eight Engine Additions It Needed

Date: September 15, 2026
Status: Complete
Related: `RESUME_TEMPLATE_ENGINE_IMPLEMENTATION.md`, `BOXED_BIODATA_RESUME_TEMPLATE.md`,
`FOURTH_RESUME_DESIGN_GREY_RAIL.md`

## Summary

A supplied design shipped as the `peach-portrait` template: a two-column CV with
a charcoal masthead, a circular portrait straddling it, and blush heading bands
across both columns. It is the seventh resume template.

**It ships design-led, not with the site's unqualified ATS claim**, and that is
a decision rather than an oversight — see below.

Every geometric number is measured off the artwork programmatically. The
faithful build landed within a **mean 2.32pt** of the reference's own
landmarks, and was then **deliberately loosened** because it read as cramped:
the shipped setting is mean 6.47, worst 24.8, and the section below sets out
what that bought and what it cost.

Eight engine additions were required. Each is an optional key, and the five
templates that predate this work produce **byte-identical display lists**.

## ATS position: design-led, deliberately

The site's documented position grants the unqualified ATS claim to a template
that is single column, carries no photograph, and has deterministic extraction
order. This one is two-column **and** photo-led — the circular portrait is its
centrepiece. It fails two of the three by construction, and removing either
would be designing a different sheet rather than building this one. `grey-rail`
set that precedent.

What it does keep is the third, and that is not nothing. The engine emits its
own PDF content stream, so reading order is a decision: the whole sidebar
extracts, then the whole main column, never interleaved line by line across the
gutter. Verified from the generated PDF:

```
ABIGAIL E. DIAZ | APPLICANT
I responsible fast learner and smart working / person, who can easily adapt...
CONTACT
09918092848 | ybbadiaz1616@gmail.com | 136 Bernardo Street... 
PERSONAL INFORMATION
Date of Birth | :  | February 9, 1993
...            (sidebar finishes)
To be avail to enhance my skills...          (main column begins)
EDUCATIONAL ATTAINMENT ...
```

The photograph costs the text stream nothing: the extracted text is identical
with and without one, and a sheet with no photograph carries **0
`/Subtype /Image` objects** at 15.8KB against 2 at 217KB once one is added.

The catalog card and the descriptor both say design-led, and a visitor wanting
maximum parseability should be pointed at the single-column templates.

## Measurements

The supplied raster is 736x1041 and its aspect is 0.7070 against A4's 0.7067,
so it is an uncropped page converting at 595/736 with nothing to correct.

**Sizes come from measured widths through jsPDF's Helvetica metrics, never from
cap heights** — a scan's antialiasing inflates a cap-height estimate by about
two points. Where a string is letter-spaced the size comes from its cap height
and the tracking from the width it has left over; deriving the name's size from
its width alone gives 27.5 where it is really 23 with 2.55 of tracking.

| Element | Measured | Used |
| --- | --- | --- |
| Sidebar | divider at x 254.2 | width 0.4266 of the page |
| Sidebar text | x 12.9 to 248.2 | left 13, right 7 |
| Main text | x 269.2 to 582.1 | left 15.4, right 12.9 |
| Masthead band | y 12.1 to 119.7, full page width | top 12.1, height 108.4 |
| Name | 218.3pt wide, cap 17.8, baseline 55.0 | bold 23 + 2.55 tracking |
| Role | 88.9pt wide, cap 8.9, baseline 88.2 | 11.5 + 3.18 tracking |
| Main band | h 30.7, label baseline 19.4 below its top | above 19.4, below 10.5 |
| Sidebar band | h 30.7, label baseline 21.9 below its top | above 21.9, below 8.9 |
| Band labels | main cap 9.71, sidebar cap 8.90 | 12.5 and 11.5, two roles |
| Lead paragraph | 312.9pt lines, leading 18.6, justified | 15 / 18.6, justify |
| Body | 12.07 from the tagline's width | 12 / 15.3 |
| Portrait | ring apex y 19.4, widest chord 204.5 | cx 131, cy 123, r 102 |
| Divider | x 254.2, y 150.4 to 810.5 | as measured |

### One thing that is easy to mis-see

**There is no tinted sidebar.** Sampling both columns returns the identical
`#F9EEEA`; the whole sheet is one pale pink and what separates the columns is a
single hairline rule. The design reads as though the left column is tinted
because the blush *bands* are, and they are wider there relative to the column.
Building it as a tinted rail would have been wrong in a way that is hard to
see and impossible to unsee.

### How close it lands

Two columns of deltas: the faithful build, and what shipped after the main
column was loosened. Only the main column moved.

| Landmark | Faithful | Shipped | Reference |
| --- | --- | --- | --- |
| Name baseline | 0.0 | 0.0 | 55.0 |
| Role baseline | 0.0 | 0.0 | 88.2 |
| Tagline line 1 | 0.0 | 0.0 | 245.1 |
| CONTACT band | +3.2 | +3.2 | 269.3 |
| PERSONAL INFORMATION band | +5.5 | +5.5 | 392.3 |
| CHARACTER REFERENCE band | +9.0 | +9.0 | 539.5 |
| Objective line 1 | 0.0 | 0.0 | 144.0 |
| EDUCATIONAL ATTAINMENT band | +1.7 | +15.7 | 208.7 |
| PROFESSIONAL EXPERIENCE band | +1.5 | +24.8 | 351.0 |

Faithful: **mean 2.32pt, worst 9.0**. Shipped: **mean 6.47, worst 24.8**.

The sidebar residual is identical in both because the sidebar was not touched.
It accumulates across its three sections at about 3pt each, which is the
signature of content-dependent spacing rather than a wrong constant.

## The eight engine additions

All are optional keys, inert on every template that does not name them.

1. **`tracking`** — letter-spacing both painters honour. SVG takes
   `letter-spacing`, jsPDF takes `charSpace` **as a per-call option, never
   `doc.setCharSpace`**, which sets it on the document so one tracked heading
   would letter-space the whole sheet. It also has to be added to `ctx.measure`
   or every downstream measurement is short: a box sized to a tracked label
   would clip it.
2. **`box.full`** — a heading band across the column's box rather than one
   sized to its label.
3. **`banner`** — a filled band with text set inside it, at absolute
   coordinates, bleeding to the page edge. It advances no cursor; both columns
   set their own `firstBaseline` below it.
4. **`vrule`** — the vertical divider.
5. **`photo shape: "circle"`** — a circular crop with a ring. `PHOTO_RATIO`
   stays 4:5 so no painter can stretch a face; the circle is cut *out* of a
   correctly proportioned image rather than the image being squashed into a
   square. jsPDF clips with `saveGraphicsState / circle / clip / discardPath`,
   bracketed by a restore, because a clip left open silently cuts every later
   op on the page down to that circle.
6. **`justify`** on a paragraph and on a `text` block — carried by **per-line
   tracking**, not word spacing. Word spacing would need both painters to
   distribute it identically and they do not: SVG stretches inter-glyph space
   and jsPDF stretches word space, so the two would disagree about where a line
   ends. Tracking is one number both already honour exactly. The last line is
   never justified.
7. **`labelWidth: "auto"`** on a `fields` body — the separator follows the
   label immediately instead of sitting on a fixed column, which is the
   difference between a form-style block whose colons line up and a prose-style
   one reading `Date of Birth: 9 February`.
8. **A template-level `background`** — the page tint, painted under everything
   on every page. A PDF page has no background of its own, so a tinted design
   that does not fill it prints white with tinted bands floating on it.

## Three defects this exposed, all pre-existing

**An untinted sidebar painted solid black.** `paintRail` drew
`colorOf(L.sidebar.background, ...)` unconditionally, and `colorOf(undefined)`
falls through its last line to `#000000`. Every two-column template until now
declared a tint, so the path was never taken and the default was never wrong
out loud. It now paints nothing when no background is declared.

**A contact body could not name its own type role.** `layoutContact` was
hard-wired to `T.sidebarContact`, unlike every other body, so a template using
any other name got `undefined` and threw inside the measurer several frames
from the descriptor that caused it. It now reads `block.type` and defaults to
the old name.

**A literal run could not lead a line.** `buildRuns` pushed a literal only `if
(out.length)`, which is right for a separator and makes a leading label — `Name:
Marcus Ellery` — impossible to express. Leading literals are now pushed
pending, so an empty field still drops its label with it and never strands a
bare `Name:`. A new `keep` flag opts out of pending for a literal that is a line
in its own right, such as the `Work Responsibilities` caption above each
entry's bullets, which nothing follows to clear the flag.

## Loosened after review, and what that cost

The first build was faithful to the artwork and read as **cramped**: with the
editor's own sample the main column ended at y=629.6 against an 815 boundary,
so a dense block of type sat above 185pt of empty paper.

The fix had to respect one hard asymmetry, measured before anything was
changed:

| | editor sample | reference's own content |
| --- | --- | --- |
| main column slack | 185.4pt | 117.4pt |
| sidebar slack | 156.7pt | **1.6pt** |

**The main column had room; the sidebar had none.** With the reference's three
referees the sidebar finishes 1.6pt short of its boundary, and the sidebar
deliberately does not paginate -- `ensureRoom` returns early for it and
`layout()` reports the overflow instead. Loosening the sidebar would push a
third referee off the foot of the sheet rather than onto a second page.

So the air went into the main column only: leading 17 to 18 on entries, bullets
to a 21pt item gap so a wrapped bullet stays one block while the space between
bullets opens, and the heading gaps from 30/27.5 to 34/29.

**A first pass at 40/33 was reverted.** It bought more air and cost far too
much: it pushed the Professional Experience band 44.8pt below where the artwork
puts it, taking the mean landmark delta from 2.32 to 9.36. The shipped setting
is 34/29 -- worst 24.8, mean 6.47 -- and most of the readability came from the
leading rather than the gaps, which is why the gaps sit close to the
measurement and the leading does not.

This is a deliberate trade of fidelity for legibility, and the numbers are here
so it can be undone knowingly.

## Two defects found while loosening

**The photograph was drawn over the tagline.** The circle was built at r=120,
cy=139.5, reaching y=259.5 -- past the tagline's baseline at 245.1. It came
from measuring the circle by its white pixels, which also match the sheet's own
pale paper below it. Measured honestly from the ring's apex against the
charcoal band (y=19.4) and the widest chord (204.5 across), the circle is
centre (131, 123) radius 102, spanning 21 to 225 and clearing the tagline by
20pt.

**The image box hung off the top of the page.** The bitmap is 4:5 and the
circle is round, so the image is always taller than the circle it fills -- 255pt
against 204. Centring it put its top at y=-4.5. It is now clamped into the band
that still covers the circle intersected with the page, so the crop slides down
instead of hanging off; nothing about what the circle shows changes.

The suite caught the second one. It did not catch it at first, which was a
third defect -- of the tests rather than the template.

## The suite could not see a circular photograph

`imageCircle` is a new op, and section 9 tested for `op === 'image'` alone. So
for the one template that draws a circular portrait, **every photo invariant
silently did not apply** -- including the anti-stretch rule that block exists
for -- while the colour check, which exempts `image`, reported the op as having
no colour at all.

Both now recognise `imageCircle`. Verified against real ops by running the
suite's own filter and formula: the real layout reports 1 image, 0 stretched,
0 unresolved, 0 off-page, and the same code with the aspect deliberately broken
reports **1 stretched** -- so the extended check is not vacuous.

## The side column could overrun in silence

The slack table above says the sidebar finishes 1.6pt short of its boundary
with the reference's own three referees. That is the designed state. It is also
one referee away from a defect that had been latent in the engine since the
first two-column template.

**The side column does not paginate, deliberately.** `ensureRoom` returns early
for it: a rail carrying contact details and personal information that split
across two pages reads as a rendering fault rather than a longer document. The
engine measures the overrun instead and reports it on `ctx.overflow`.

**Nothing read it.** Not the editor, not the exporter. Measured on the shipped
template: a fourth referee puts the sidebar's deepest baseline at 898.6 on an
842pt page, with **eight lines completely off the paper**. `ctx.overflow.sidebar`
was `true` throughout. The preview showed no note, the exported PDF was short
by the same eight lines, and nothing anywhere said so. A visitor would have sent
out a CV missing a referee without knowing.

This was harmless while every two-column template put a handful of lines in the
rail. Peach Portrait puts a contact block, seven personal-information rows and
a referee list there, which is what made a latent defect reachable.

### What was added

`ctx.overflow` carried two booleans. It now also carries how far past, and
whether the overrun is past the column's own boundary or past the paper:

| key | meaning |
| --- | --- |
| `main` / `sidebar` | past that column's declared `bottom` |
| `mainBy` / `sidebarBy` | by how many points |
| `sidebarOffPage` | past the sheet itself, so lines are not on the paper at all |

`js/resume.js` reads it after every paint and puts a note on the mat above the
sheet. Two messages, because the two cases differ: past the boundary the last
lines are crowding the foot of the page, past the paper they are not on it.

**It is editor chrome, added after the paint, exactly like the page labels.**
That is the whole reason it cannot reach the download: the preview and the PDF
come from one display list, so anything the engine drew would be exported into
the file. Confirmed by filter -- 0 ops in the display list carry the notice's
text. A browser print takes the DOM rather than the display list, so the print
stylesheet hides it too.

`renderPreview()` calls `replaceChildren()` first, so the note is rebuilt every
keystroke and clears itself the moment the column fits again.

### Proved by breaking it

Per this project's rule that a check which has never failed is not evidence,
the new suite section was run against a deliberately disabled
`warnSideOverflow`:

| | `ctx.overflow.sidebar` | notices on the page |
| --- | --- | --- |
| warning disabled | `true` | **0** -- the check fails |
| warning restored | `true` | 1, naming the side column |
| referees removed again | `false` | 0 |

**The first cap was nearly vacuous.** Filling only each added referee's name
took 7 of an allowed 8 additions to overrun the column -- one short entry away
from never reaching the boundary at all, which would have turned every
assertion under it into a silence that reads as a pass. Referees are filled
whole now, the cap is 12, and the overrun arrives in 2.

`grey-rail` and `photo-rail` do not put referees in their rails and never
overrun; they are skipped, and a global check that at least one template was
actually driven past its boundary is what keeps that from hiding a regression.

### A gap it exposed in section 9

The suite reads the editor's sample out of the live form rather than restating
it, so that a form which stopped producing content cannot make the checks
vacuously true. But it harvested referee rows by a fixed key list, and
`refAddress` and `score` were never added to it. Section 9's own
"no column overflows its own boundary" check had therefore been running against
a document lighter than the form actually produces. Both keys are in the list
now.

## Loosened again, and the defect that was making it look cramped

Reported a second time as still cramped, after the first loosening pass
recorded above. Measuring the sheet found two separate things, and only one of
them was spacing.

### A composed line did not wrap, so it ran into the other column

`layoutRuns` sets several runs on one baseline with the pen advancing between
them, which is how a PDF draws mixed weights -- a single text call cannot
change font mid-string. It did not wrap. A composed line wider than its column
did not break, it simply kept going, and on a two-column sheet it kept going
ACROSS THE GUTTER and drew over the main column.

The referee block composes `"Address: "` with the visitor's own field, so an
ordinary street address did exactly that: measured at **21.3pt past the
sidebar's text measure and 13.9pt past the divider**, printed on top of the
Professional Experience entries. Every anchor was still on the page, so
nothing in the suite objected.

Wrapping a run group is not the same problem as wrapping a paragraph, which is
why `ctx.wrap` could not be reused: the first line starts at whatever x the
preceding runs left the pen at, so how much fits depends on the runs before
it, and each run may be a different size. The measure is consumed left to
right, word by word, with the pen carrying over between runs. A word that does
not fit even from the column's left edge is drawn overlong rather than broken,
which is what the paragraph wrapper already does -- hyphenating an email
address at an arbitrary point is worse than one wide line.

It advances the cursor by one line height per break, and callers depend on
that: they add the next line's `gapBefore` to wherever this left the cursor,
so a wrapped value pushes what follows down instead of being drawn under it.

**This was never peach-portrait's bug alone** -- it was in the engine, and any
template composing a label with a field could hit it. The other six do not,
because none of them puts a long free-text field into a composed line.

### The spacing pass

With wrapping fixed, the sheet was measured rather than eyeballed. The editor's
sample left **151.1pt of the main column and 141.4pt of the sidebar unused**:
the page was a third empty at the foot while the type inside it was set at
1.24 to 1.275 of its size. That combination is what reads as cramped.

| | before | after |
| --- | --- | --- |
| main column slack | 151.1pt | 77.5pt |
| sidebar slack (sample) | 141.4pt | 114.0pt |
| pages | 1 | 1 |

The main column took most of it, because it has the room and it paginates:
lead leading 18.6 to 21.5, bullet leading 16.5 to 18 and item gap 21 to 23,
heading gaps 34/29 to 40/33, and every within-entry gap opened by 2 to 3pt.

The sidebar took less, and the reason is a hard constraint rather than
restraint.

### Why the sidebar could not have as much

The side column does not paginate, so its capacity is fixed: roughly 570pt
between the portrait and the foot. Against that it carries a tagline, a
contact block, seven personal-information rows and a referee list at five
labelled lines each.

Measured capacity, with the loosening above:

| referees | sidebar slack |
| --- | --- |
| 1 (the shipped sample) | 114.0pt |
| 2, long addresses | 13.5pt |
| 3, long addresses | **-87.0pt** |

**The reference artwork has three referees and this template cannot hold
three.** That is not a regression introduced here -- it was already true, and
before the wrap fix it was *concealed*, because the overrunning lines were
being drawn outside the column instead of counted. Fixing the wrap is what
turned a hidden 13.7pt overrun into an honest 59.6pt one at the old spacing.

So the referee block was left at the artwork's own density -- its 15.3pt line
gaps and 24pt entry gap are untouched -- and the air went to everything else:
section separation, the personal-information rows, the contact rows and the
tagline. Loosening the referee block as well was measured and rejected: at
17.5pt gaps even **two** referees overflowed, which turns a Character
Reference list into a single-referee block.

Three referees now produce the side-column notice rather than silent loss,
which is what that notice was built for.

## The suite could not see text leaving its column

Section 9 asked whether an anchor was on the paper. It never asked whether a
line stayed inside the column it belongs to, and those are different
questions: the address that ran across the gutter was comfortably on the page
the whole time.

The new check measures each text op's real width through the same Helvetica
metrics the engine measures with, resolves which column the anchor sits in
from `ctx.cols` -- **the engine's own boxes, not the descriptor**, because a
sidebar can be on either side and inferring it gets `grey-rail` backwards --
and fails on anything whose right edge passes its column.

Proved by disabling the wrap and re-running: `peach-portrait` reports 1 line
21.3pt outside its column, every other template reports 0. With the wrap
restored, all seven report 0.

## Verification

- **Preview and PDF agree**: 1 page each, with and without a photograph.
- **Extraction order** reads as coherent blocks, dumped above.
- **The five templates predating this work are byte-identical**, captured,
  reverted to HEAD with `git stash`, recaptured. `boxed-biodata` differs, and
  that is the uncommitted retune from the previous task being stashed along
  with this work, not a regression — its own landmark check still lands at the
  identical worst delta of 7.2pt.
- **Determinism**: with `tb_resume_template` poisoned to `ruled-serif`, all
  seven resume cards open their own template.
- **The side column's overrun is reported**, and the check was proved by
  disabling the fix first: see the table above.
- **No text is drawn outside its column** in any of the seven templates, and
  that check was proved by disabling the wrap first.
- Static checks: 148 passed, 0 failed.

## Files changed

| File | Change |
| --- | --- |
| `site/js/resume-engine.js` | tracking, `box.full`, `banner`, `vrule`, circular photo in both painters, justify, `labelWidth: "auto"`, page background; three pre-existing defects fixed |
| `site/js/resume-templates.js` | the `peach-portrait` descriptor |
| `site/resume.html` | tagline, the six personal-information fields, a referee address |
| `site/js/resume.js` | the new fields in `DEFAULT_STATE` and the sample; `refAddress` collected; `warnSideOverflow` reads `ctx.overflow` after every paint |
| `site/index.html` | catalog card, count 50 to 51 |
| `site/js/admin.js` | `CATALOG_ITEMS` entry |
| `site/css/style.css` | `.mock-doc.portrait` miniature; `.sheet-warning`, hidden in print |
| `site/js/resume-engine.js` (2) | `ctx.overflow` gained `mainBy`, `sidebarBy`, `sidebarOffPage` |
| `tests/verify-layout.js` | section 9b, the overrun notice; `refAddress` and `score` harvested in section 9 |
