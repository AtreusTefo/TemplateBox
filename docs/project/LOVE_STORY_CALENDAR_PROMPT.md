# Coding Agent Brief: The Love Story Calendar

Date: September 14, 2026
Status: Brief. Nothing built yet.
Source folder: `C:\Users\hp\Downloads\VALTemp\VALTemp\`

Build the supplied A4 artwork as the poster editor's EIGHTH layout: a circular
portrait over a cascade of eight photo boxes on the left, and a calendar, a
message and two names down the right.

Read this whole brief before writing anything. The section immediately below
is the one that cannot be got wrong.

---

## 1. Before anything else: what must never leave that folder

**The two JPGs in the folder ROOT are marketplace listing images, and they are
filled.** `VALTemp-03.jpg` and `VALTem-10.jpg` are 5200 x 3900 landscape
composites showing the template beside its empty version, and the filled one
carries **nine photographs of identifiable private individuals** -- a couple in
the circular frame and seven more people across the boxes below. Not the file,
not a crop of it, not a thumbnail derived from it, not a colour sampled from a
face. It is not the template; it is a photograph of somebody's family.

**The message is a real message**, written by one person to another. Seven
lines in two paragraphs, in the right-hand column. It is deliberately not
quoted here, not even to say what to avoid: a brief that reproduces the thing
it forbids has already shipped it into the repository. Open the SVG if you need
to see the shape of it, and write your own placeholder. Do not paraphrase it
closely enough to be recognisable.

**The two names are real people.** The artwork prints a given name, a heart,
and a surname. Neither appears anywhere in the repository -- not in code, not
in a comment, not in a test fixture, not in a commit message. The placeholders
you invent must say nothing about anybody.

**Both supplied fonts are Monotype's and neither may be bundled.**
`Fonts/MTCORSVA.TTF` (Monotype Corsiva) and `Fonts/times.ttf` (Times New Roman)
both carry an explicit licence-agreement clause. This is the same answer the
anniversary, birthday and tribute posters reached, and the OPPOSITE of the
trade counter receipt's Roboto, which turned out to be OFL. Check the font you
are handed, every time.

What you MAY use: the two SVGs in `SVG/`, which are the editable master and
contain no photographs, and the A4 renders in `PNG/` and `JPG/`, which are the
EMPTY template at 2481 x 3508.

---

## 2. This is the fifth poster in a family. Reuse, do not re-derive

Four layouts in `site/js/poster.js` already do most of this. You are adding a
fifth arrangement, not a fifth calendar.

| You need | It already exists |
| --- | --- |
| Month arithmetic | `annivMonth(year, month)`, `annivCell(info, day)` |
| Column and row geometry from a rule | `calGrid(geo, W, H)` |
| Boxes in artwork points onto the page | `scaleBoxes(boxes, page, W, H)` |
| Day letters centred per column | `annivHead()` |
| Greedy word wrap | `hbdWrap()` |
| A heart path with a measured view box | `ANNIV_HEART` |
| The calendar face | `calFont()` / `CAL_FACE` -- Times, not the display face |
| Which slots a layout draws | `slotsFor(layout)` -- extend it, do not bypass it |
| Where a text field landed, for canvas editing | `noteText(c, key, box)` |

**`slotsFor()` is not optional.** `SLOT_COUNT` is the photos array's LENGTH,
and three separate bugs have come from reading it as "slots a visitor can
reach". Add a `LOVE_FIRST` / `LOVE_EXTRA` pair the way the other collages do
and return the real list.

**There is one calendar in this editor and four layouts drawing it.** Do not
write a fifth.

---

## 3. The artwork's calendar is WRONG. Here is the proof

It is labelled SEPTEMBER 2023 and it does not draw September 2023.

Measured from the source's own text origins, the seven columns sit at x 340.34,
374.70, 405.63, 440.54, 473.11, 499.45 and 530.05, and the rows at y 122.16,
144.54, 166.50, 188.46 and 210.42. Against those columns the grid reads:

    row 0      1  2  3  4  5  6          -- 1 under M
    row 1   7  8  9 10 11 12 13
    row 2  14 15 16 17 18 19 20
    row 3  21 22 23 24 25 26 27
    row 4  28 29 30                      -- 30 under T

September 2023 opened on a **Friday** and its 30th was a **Saturday**:

    Su Mo Tu We Th Fr Sa
                    1  2
     3  4  5  6  7  8  9
    ...
    24 25 26 27 28 29 30

So this is a generic Monday-opening month with a real month's name typed over
it -- the same fault the anniversary artwork had, and the opposite of the
birthday calendar's, which was correct. **That is now four artworks and three
different answers. None of it is a rule. The only thing that transfers is that
you check.**

Compute the grid. Derive the columns from the RULE under the day header, which
runs x `342.16` to `550.03` -- seven columns of 29.70 -- exactly as the other
three do. The hand-set positions above are evidence, not geometry: their gaps
are 34.36, 30.93, 34.91, 32.57, 26.34 and 30.60, which is a hand placing
numerals, not a grid.

The marked day is the 30th, drawn as a red heart with the numeral ON it.
Follow the existing layouts: heart first, numeral over it in `onAccent`. The
artwork does the same here, which is a change from the birthday and tribute
sources that hid their marked date under an opaque heart.

---

## 4. Geometry, read off `SVG/VALTemp-01.svg`

Page `595.28 x 841.89`, A4 portrait, the same as every other poster in this
family.

### The photo slots -- nine of them

A circle and eight rectangles. The circle is the portrait; the rest cascade
down the left column.

    ring      ellipse cx 144.32 cy 192.66 rx 113.60 ry 115.15
    portrait  circle  cx 144.36 cy 195.76 r  108.77

    box  x       y       w       h        inner inset
    1    17.89   274.83  131.26  243.96   --
    2   111.49   304.53  134.71  186.68   118.05 316.80 120.78 161.04
    3   153.92   499.16  134.71  178.73   --
    4    17.89   525.19  131.26  152.70   --
    5   388.17   683.35  146.19  137.08   394.09 688.05 133.64 126.37
    6    17.89   694.63  164.98  121.69   --
    7   193.15   694.63  145.68  119.35   --
    8   310.09   706.29   93.42  104.57   314.77 710.87  83.66  94.78

Three of the boxes carry an inner rectangle as well as an outer. That is a
KEYLINE drawn as two rects, not two photo slots -- the outer is the frame, the
inner is the picture. Draw one box with a stroke; do not create sixteen slots.

**The boxes overlap.** Box 2 sits over box 1, box 5 over box 8. Paint them
FORWARDS so a later box lands on an earlier one, and make `slotAt()` search
BACKWARDS, or a click on the visible photograph selects the one hidden beneath
it. The tribute poster learned this; copy the reasoning, not the numbers.

### Type -- and this one is NOT like its siblings

    element              face                        size
    SEPTEMBER 2023       Times New Roman regular     21.94
    S M T W T F S        Times New Roman regular     18.29, tracked
    the dates            Times New Roman regular     18.29
    the message          Times New Roman BOLD ITALIC 21.02
    Happy Anniversary    Times New Roman BOLD        21.02
    the two names        Monotype Corsiva            26.51 / 26

On the other three posters Corsiva carried the display text and Times carried
only the calendar. **Here it is reversed**: Times carries almost everything and
Corsiva appears on the two names alone. Do not copy the sibling's font split;
read this one.

Corsiva cannot ship. `site/js/poster.js` already stands Petit Formal Script in
for it, with a 65/79 size adjustment, and that machinery is there to reuse.
Times needs no webfont at all -- `CAL_FACE` is already the right stack.

### Text positions

    month title      x 357.42  baseline  48.45
    day header       x 345.14  baseline  85.74
    rule above title  320.90 -> 565.52 at y  24.16
    rule under header 342.16 -> 550.03 at y  93.98

    message block 1  x 344.51  first baseline 289.30, leading 25.23, 4 lines
    message block 2  x 344.52  first baseline 395.51, leading 25.23, 3 lines
    Happy Anniversary x 355.72 baseline 521.72
    names row        baseline 583.52, heart between them

The message is TWO paragraphs, not seven loose lines: 30.53 between the last
line of the first and the first line of the second, against a 25.23 leading.
Keep that as a paragraph break rather than flattening it.

### Decoration

- **A tray under the calendar.** A bracket shape that runs beneath the date
  grid and turns up at both ends. It is a path; measure it.
- **Three red palm fronds**: top left, mid left behind the circle, and one at
  the lower right behind box 5.
- **A hanging-heart cluster**, top centre: four vertical strings from the top
  edge at x 175.15, 208.91, 229.91 and 250.42, with hearts both FILLED red and
  OUTLINED, plus scattered sparkle dots.
- **Two diamond dividers**, above and below the names, at y ~540 and ~605. Each
  is three line segments with diamond glyphs between them -- not one rule.

### Colour, and BOTH colourways ship in the source

`VALTemp-01.svg` is the dark one and `VALTemp-02.svg` is the light one. This is
the first artwork in the family to supply both rather than leave the light one
to be derived -- so build `LOVE_THEMES` from the pair, not from a guess.

    page / ink   #231F20 and #FFF, swapped between the two files
    accents      #ED2024 #E93625 #EB202F #E93827 #ED5F52
    pink hearts  #EF5692 #DB2E75 #F387AB

The empty photo boxes invert with the ground: white on the dark colourway,
near-black on the light one. Check the second file rather than assuming, the
way the birthday poster's `boxFill: null` had to be checked.

---

## 5. Traps

- **The message contains a colour emoji as an embedded raster.** The source has
  four small PNGs (57x53 and three about 28x31): a two-heart emoji inside the
  message and glossy hearts elsewhere. Do not embed them. The editor already
  has a native-Unicode emoji picker and a vector heart; use those. An embedded
  raster in a vector export is a different kind of file.
- **24 masks and 22 filters** back the soft glow on the hearts and sparkles.
  None of it needs to ship. The birthday poster replaced 74 embedded PNGs with
  one vector path and a gradient; do the same here.
- **The dates are not one text element each.** Several pairs share a `<text>`
  with `<tspan>` children carrying their own x -- "1" and "8" are one element,
  "2" and "9" another. If you are measuring the source to check yourself,
  resolve the tspans or you will conclude the grid has holes in it.
- **The circle is two shapes,** an ellipse ring and a circle for the picture,
  and they are not concentric: the ring is centred 192.66 and the photo 195.76.
  Clip the photograph to the CIRCLE and draw the ring over it.
- **`p-grid-fields` is the search screen's block.** If this layout needs the
  batch photo input, show `#p-batch-fields`. Widening `#p-grid-fields` is what
  put a dead "Screen Mode" on three posters -- see
  `docs/error-fixes/SEARCH_SCREEN_CONTROLS_LEAKED_ONTO_THE_COLLAGE_POSTERS.md`.
- **Two painters, one poster.** `paint*()` and `*SVG()` drift silently. Compare
  SHAPES by pixel and TEXT by exported coordinates: an SVG rasterised in an
  `<img>` gets no webfonts, so text positions will not match there, and that is
  pre-existing and editor-wide rather than a bug you introduced.

---

## 6. While you are in there

- Catalog card in `site/index.html` and the matching entry in `site/js/admin.js`,
  and update the catalog-empty count (47 to 48). **The card's title must match
  the registry's exactly** -- suite section 1 checks that pair, and it is the
  one defect in this family that no amount of looking would have found.
- Controls in `site/poster.html`, reusing the SHARED calendar block rather than
  adding a fifth month/year/day.
- One colourway select, labelled **Screen Mode** with options **Dark** and
  **Light**, matching the other four. Store whatever keys you like, but the
  visible words are settled.
- Extend section 13 of `tests/verify-layout.js` with this layout: one entry in
  its `LAYOUTS` list with the scan window for where this calendar sits, and a
  `rows` bound if the window cannot reach row 5. Note the marker search is
  bounded by the rule's own measured extent BECAUSE these posters draw red
  elsewhere -- and this one draws three red fronds and a dozen hearts, so that
  bound is doing real work.
- Register the layout's text fields with `noteText()` so they are editable on
  the preview, as the other four are.

---

## 7. Definition of done

- The poster matches the artwork in layout, checked by RENDERING it, not by
  reading the code back.
- The calendar is correct for the month chosen, verified against at least three
  months including a six-row one and a February.
- Nine photographs upload, frame and export; a batch fills them in the
  artwork's own order; the circle crops to a circle.
- Both colourways render, and the empty photo boxes are legible in each.
- Both painters draw the same poster, compared as described above.
- Nothing from the source folder is anywhere in the repository: no photograph,
  no sentence of the message, no name, no font, no embedded raster -- including
  in comments, samples, test fixtures and commit messages.
- `node tests/verify-layout.js` passes. Section 4 fails while your work is
  uncommitted -- that is the working-tree-versus-HEAD comparison and it clears
  on commit; check its differences are confined to the pages listing the
  catalog.
- A write-up in `docs/implementation/`, and an index entry in
  `docs/DOCUMENTATION_INDEX.md` under the right section.

---

## 8. Do not

- Do not put this in `docs.js`. It is a poster.
- Do not write a second calendar, wrapper, heart or sparkle.
- Do not embed the masks, the filters or the emoji rasters.
- Do not bundle either supplied font.
- Do not copy the root JPGs, the photographs in them, the message, or the names.
- Do not add a server call, a font CDN, or any third-party runtime.
- Do not use `innerHTML` for any visitor string.
- Do not put working files inside `site/`.
- Do not use emojis anywhere -- code, comments, documentation or commit
  messages.
