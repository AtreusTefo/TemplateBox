# Coding-Agent Prompt: the Birthday Tribute Poster

Source artwork: `C:\Users\hp\Downloads\HBD\HBD\`

| File | What it is | Use it for |
| --- | --- | --- |
| `SVG/HA-01.svg` | the editable master, 595.28 x 841.89 (A4 PORTRAIT points) | ALL geometry, and every string |
| `PNG/HA-02.png` | 2481 x 3508 render of the EMPTY template, 4.1678 px/pt | checking your result against |
| `JPG/HA-02.jpg` | the same render, lossy | nothing |
| `PDF/HA.pdf` | print file | nothing |
| `Adobe illustrator/HA.ai` | the working file | nothing; do not try to parse it |
| `Fonts/Monotype Corsiva Regular.ttf` | Monotype, proprietary | read the licence note; do NOT bundle |
| `Fonts/times.ttf` | Times New Roman, Monotype, proprietary | read the licence note; do NOT bundle |
| `HA-04.png` (root) | a MARKETPLACE preview AND a completed example | NOTHING. See the first section. |

The master has **35 real `<text>` elements**, so every string, position, font and
size can be read straight out of it. Do that rather than measuring the PNG.

Read this whole file before you open an editor.

## Before anything else

**1. The root PNG carries about fourteen photographs of an identifiable private
individual, and one of two people embracing.** It is a completed example sitting
next to the marketplace preview, and the poster around it is an intimate message
from one partner to another. Do not copy that file into the repository, do not
crop it, do not derive a catalog thumbnail or a sample from it, do not use any
frame of it as test content, and do not describe its subject anywhere.

It is also the marketplace preview rather than the artwork, so deriving geometry
from it would put a blue format banner in your poster. The artwork is
`PNG/HA-02.png`, the empty template.

**2. The words are one person's message to their partner.** A heading naming
the recipient, three lines about them, and a closing. Replace all of it with
neutral placeholders. Do not reproduce any of those sentences in code, in a
sample, in documentation, or in a commit message. This brief does not quote
them either.

**3. Both supplied fonts are Monotype's and neither may be bundled.** The same
clause as always: "This typeface is the property of Monotype Typography and its
use by you is covered under the terms of a license agreement." `site/` is the
publish directory.

Same answer as the anniversary and birthday calendar posters, opposite of the
trade counter receipt's OFL Roboto. Check the font you are handed, every time.

## This is a SIBLING of a template that already exists

`site/js/poster.js` already has a `birthday` layout, built September 12, 2026
from a different artwork in the same family. Read
`docs/implementation/BIRTHDAY_CALENDAR_POSTER.md` FIRST. Both are A4 portrait on
a `#231f20` ground with a month name top left, a computed calendar under it, a
message block on the left, a cascade of photo boxes filling the right and lower
page, sparkle clusters, hearts, and a line along the foot.

**They are not the same layout and should not be forced into one.** The boxes
differ in count and position, the decoration differs, and the text blocks differ.
Add a SEVENTH layout.

**But almost nothing needs writing twice.** Reuse, do not reimplement:

| Already in `poster.js` | What it does |
| --- | --- |
| `annivMonth()`, `annivCell()` | the calendar arithmetic, with the `Date.UTC` handling that stops a date shifting a day west of Greenwich |
| `slotsFor(layout)` | what makes extra photo slots safe; add yours and the menu, selection clamp, selection ring, Remove photo and framing controls all follow |
| `hbdWrap()` | wraps a visitor's block to a width in the face it will be drawn in |
| `cleanBlock()` | keeps line breaks, collapses runs of spaces -- see the trap below |
| `HBD_SPARK_PATH` | a four-pointed sparkle as one vector path |
| `ANNIV_HEART` | the heart, placed by `drawArt()`/transform |
| `uploadTargets()` | already has ONE branch covering both collage layouts; extend that branch, do not add a third |
| section 13 of `tests/verify-layout.js` | already runs the calendar checks over two layouts; adding a third is a line |

A second copy of a calendar is a second calendar to be wrong. The same is true
of a wrapper, a sparkle and a heart.

## The calendar is CORRECT in this artwork. Verify anyway

It says OCTOBER, opens the 1st under W in five rows of thirty-one days, and
marks the 6th. October 2025 opened on a Wednesday, has thirty-one days, needs
five rows, and its 6th was a Monday. Everything agrees.

That is now three artworks in this family: the anniversary poster's calendar was
WRONG, the birthday calendar poster's was right, and this one is right. **None of
that is a rule.** The only thing that transfers is that you check.

It is still computed, because the source's positions are hand-set -- one row
sits at x 24.49, 59.11, 90.27, 125.44, 158.25, 184.78 and 215.6, gaps of 34.62,
31.16, 35.17, 32.81, 26.53 and 30.82 -- and because another month means another
first weekday, another length and four to six rows.

Derive the grid from the rule under the day header, which runs x `26.32` to
`235.72`: seven columns of `29.914`, centred at `26.32 + 29.914 * (i + 0.5)`.
Row baselines are `127.99`, `150.11`, `172.23`, `194.35` and `216.47` -- a pitch
of `22.12`.

**Two more things about the dates.** The marked day's number is still in the
file at its normal position with an opaque heart drawn OVER it, so the artwork's
6th cannot be read. The existing `birthday` layout departs from that and draws
the number ON the heart in a contrasting colour, because a calendar whose one
important square is the only unreadable one is a poster arguing with itself. Do
the same. And there is **no year printed anywhere**, so a year control reshapes
the grid while changing nothing visible; the existing layout's year hint says so
rather than leaving a visitor to find out.

## Geometry, read off the SVG

Page `595.28 x 841.89`. Ground `#231f20`.

| Colour | Where |
| --- | --- |
| `#FFFFFF` | all type, the calendar rule, the photo box strokes |
| `#e93625` | fourteen photo box fills, and the hearts |
| `#ef4136` | ONE photo box fill, lighter than the rest |
| `#ed1c24` | the four strings the hearts hang from |

### Type

| Thing | Font | Size | Position (text origin) |
| --- | --- | --- | --- |
| month name | Monotype Corsiva | 38.43 | 44.12, 69.25 |
| day header `S M T W T F S` | Times New Roman | 18.42, letter-spacing 0.4em | 29.33, 90.88 |
| dates | Times New Roman | 18.42 | computed, see above |
| message block | Monotype Corsiva | 26.44 | 25.15, 357.37; four lines, leading 31.73 |
| foot title | Monotype Corsiva | 49.87 | 112.18, 816.33 |

Calendar rule: x `26.32` to `235.72` at y `99.17`, white, 2pt.

### The fifteen photo boxes

Fill `#e93625` except the fourth, which is `#ef4136`. White stroke, 2pt.

| # | x | y | w | h | | # | x | y | w | h |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 333.59 | 359.38 | 113.00 | 92.78 | | 9 | 338.36 | 274.65 | 113.18 | 87.21 |
| 2 | 446.59 | 403.92 | 103.80 | 228.83 | | 10 | 256.50 | 452.16 | 97.16 | 115.85 |
| 3 | 149.41 | 230.43 | 64.32 | 59.38 | | 11 | 353.66 | 449.40 | 92.94 | 118.60 |
| 4 | 299.34 | 568.00 | 147.26 | 168.78 | | 12 | 446.59 | 630.36 | 80.29 | 73.28 |
| 5 | 213.73 | 227.96 | 63.70 | 90.30 | | 13 | 183.25 | 568.00 | 115.88 | 186.96 |
| 6 | 277.44 | 223.01 | 60.92 | 108.24 | | 14 | 105.30 | 597.98 | 77.46 | 131.56 |
| 7 | 338.36 | 218.89 | 67.11 | 55.77 | | 15 | 24.49 | 584.54 | 79.82 | 89.87 |
| 8 | 446.59 | 310.83 | 75.77 | 93.08 | | | | | | |

**These OVERLAP, which the sibling template's do not.** Measured, four pairs:
boxes 1 and 9 by 108.2 x 2.5pt, 1 and 11 by 92.9 x 2.8pt, 2 and 12 by 80.3 x
2.4pt, and 8 and 9 by 5.0 x 51.0pt. The first three are edge kisses where the
2pt white strokes coincide, which is exactly how the stack of bordered
photographs reads; the fourth is a real overlap.

So **draw order is load-bearing here** and the hit test has to break the tie the
same way the paint does -- walk the boxes backwards, as the existing collage
layouts already do. Do not "tidy" the positions.

### The decoration

- **Four hearts hanging on strings** from the top edge. The strings are 3pt
  `#ed1c24` verticals from y `10.06` down to `108.55`, `68.55`, `137.37` and
  `85.9`, at x `381.63`, `435.48`, `477.64` and `518.46`. A heart hangs at the
  foot of each.
- **Three sparkle clusters**, same shape as the sibling layout's.
- **A heart beside the foot title.**
- **A small heart inline in the message's heading.**

**The hearts here are GLOSSY, and that part is vector.** The file carries 29
linear gradients and one radial building the highlight, the shadow and the rim
on each hanging heart -- reproducible, unlike the sibling artwork's raster
glows. Decide how far to take it: a flat heart in `#e93625` is what the rest of
this editor draws and costs one path, a gradient-filled one is closer to the
source and costs a few more. Say which you chose and why.

**The sparkle glows are still raster** -- 60 embedded base64 PNGs behind 76
masks, about 31KB, and all they do is soften the bar ends. The existing layout
already replaced that with one vector path. Do the same; do not embed them.

## Traps

1. **The root PNG.** See the first section.
2. **The heading's spaces do TWO jobs.** Its first line is stored as
   `xml:space="preserve"` with seven leading spaces, then a letter, then five
   more spaces, then the rest. Those five are not spacing -- they are a HOLE the
   inline heart sits in, punched by hand in Monotype Corsiva at 26.44px. Keep
   them and you get a ragged gap in a different face; strip them and the heart
   lands on a letter. Draw the heading as text, then heart, then text, with the
   heart placed from the MEASURED width of the first run. `cleanBlock()` already
   collapses runs of spaces, which is the right behaviour and is why the heading
   cannot be one string.
3. **Reading `textContent` is unsafe.** Several date elements are split across
   `tspan`s -- "11" is stored as two of them -- so the DOM text of one element is
   not one number.
4. **The message ends with an unmatched closing quotation mark.** There is no
   opening one. Do not reproduce the typo; it is not a design.
5. **No year is printed.** See above.
6. **The boxes overlap.** See above.
7. **One box is a different red.** `#ef4136` against the other fourteen's
   `#e93625`. It is a deliberate accent in the artwork, sitting under the
   largest picture. Decide whether a visitor's photograph makes that invisible
   anyway -- it does, once filled -- and whether it is worth keeping for the
   empty state. Say which.
8. **The suite will not tell you this looks right.** Render it and LOOK at it,
   empty and full, at a four-row month and a six-row month. Every defect found
   in this editor recently was invisible to measurement and obvious on sight:
   a painter that threw and silently lost the page below it, eleven of twelve
   photographs going nowhere, a catalog tile showing a different template's
   artwork, a marked date drawn in the page ink so it vanished on red.

## While you are in there

- Add a catalog card in `site/index.html` and the matching entry in
  `site/js/admin.js`, and update the catalog-empty count. **The card's title
  must match the registry's** -- section 1 checks that pair, and it is the one
  defect in the sibling template that no amount of looking would have found.
- Add the controls to `site/poster.html`, and reuse the SHARED calendar block
  rather than adding a third month/year/day.
- Extend section 13 of `tests/verify-layout.js` with this layout: one entry in
  its `LAYOUTS` list, with the scan window for where this calendar sits.
  Note the check bounds its marker search to the calendar rule's own extent
  BECAUSE these posters draw red elsewhere -- and this one draws fourteen red
  boxes, so that bound is doing real work.

## Definition of done

- The poster matches the artwork in layout, checked by rendering it.
- The calendar is correct for the month chosen, verified against at least three
  months including a six-row one and a February.
- Fifteen photographs upload, frame and export, and a batch fills them in the
  artwork's own order.
- Both painters draw the same poster. Compare SHAPES by pixel and TEXT by
  exported coordinates: an SVG rasterised in an `<img>` gets no webfonts, so
  text positions will not match there. That is pre-existing and editor-wide.
- No photograph, sentence, or font from the source folder is anywhere in the
  repository, including comments, samples, test fixtures and commit messages.
- `node tests/verify-layout.js` passes. Section 4 fails while your work is
  uncommitted -- that is the working-tree-versus-HEAD comparison and it clears
  on commit; check its differences are confined to the pages listing the
  catalog.
- A write-up in `docs/implementation/`, and an index entry in
  `docs/DOCUMENTATION_INDEX.md` under the right section.

## Do not

- Do not put this in `docs.js`. It is a poster.
- Do not write a second calendar, wrapper, sparkle or heart.
- Do not embed the sparkle masks.
- Do not bundle either supplied font.
- Do not copy the root PNG, the photographs in it, or the message text.
- Do not add a server call, a font CDN, or any third-party runtime.
- Do not use `innerHTML` for any visitor string.
- Do not put working files inside `site/`.
- Do not use emojis anywhere -- code, comments, documentation or commit
  messages.
- End commit messages with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
