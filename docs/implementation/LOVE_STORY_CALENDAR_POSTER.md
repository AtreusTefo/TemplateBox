# The Love Story Calendar: the Poster Editor's Eighth Layout

Date: September 14, 2026
Status: Built
Brief: `docs/project/LOVE_STORY_CALENDAR_PROMPT.md`

A circular portrait over a cascade of eight photographs down the left, and a
month, a two-paragraph message, a greeting and two names down the right. Traced
from a supplied A4 portrait artwork whose page is already this editor's page,
so nothing had to be rearranged.

It is the fifth layout in this file to draw a calendar and it does not contain
one. `annivMonth()`, `annivCell()`, `calGrid()`, `annivHead()`, `calFont()`,
`scaleBoxes()`, `hbdWrap()`, `hbdDrawSparkle()`, `sparkleSVG()` and
`ANNIV_HEART` are all reused as they stand.

## The source's calendar is wrong, and that is now three of four

The file is labelled for September 2023 and draws a generic Monday-opening
grid: the 1st under M, the 30th under T, five rows. September 2023 opened on a
**Friday** and its 30th was a **Saturday**. Its thirty date positions are
hand-set to gaps of 34.36, 30.93, 34.91, 32.57, 26.34 and 30.60 -- a hand
placing numerals, not a grid.

So the grid is computed, and the columns come from the rule under the day
header (x `342.16` to `550.03`, seven columns of 29.70) exactly as the other
three do. Four artworks in this family have now produced three different
answers about whether their own calendar is right. None of it is a rule; the
only thing that transfers is that it gets checked.

## The font split is the reverse of its siblings

On the anniversary, birthday and tribute posters Monotype Corsiva carries every
word and Times carries only the grid. Here Times carries the month, the day
letters, the dates, the message and the greeting, and Corsiva appears on the
**two names alone**.

Times needs no webfont: `CAL_FACE` is already the right stack, and `loveFont()`
adds only the bold and the italic this artwork asks for. Corsiva cannot ship --
`Fonts/MTCORSVA.TTF` carries an explicit licence-agreement clause, the same
answer the three siblings reached -- so the names go through the existing Petit
Formal Script stand-in and its 65/79 size adjustment.

That stand-in sets about a fifth wider than Corsiva at matched cap height, and
this artwork gives the pair a 208-point column rather than the width of the
page, so the names overran it on the first render. `loveNamesFit()` fits the
two names and the heart between them as ONE unit: everything in the row scales
together, because the total width is linear in the size and one ratio is
therefore exact. Shrinking only the type would leave a full-size heart between
two names that are no longer full size.

## Nine photographs, and the first of them is not a rectangle

`slotsFor("love")` returns the circle and then the eight boxes in the artwork's
own order. **Slot 0 is the circular portrait**, which is the one place in this
file where the carried-across slot is not a rectangle -- and it is right,
because the portrait is what this artwork leads with. A picture set on the
card, the player or any of the three collages arrives in the circle.

The circle is two shapes and they are not concentric: the ring is centred
192.66 and the picture 195.76. Both are kept. The photograph is clipped to the
CIRCLE, and the ring is a filled ellipse with the picture circle drawn over it
in `circleFill` -- the page colour on the dark colourway, which punches a hole
and leaves a white ring, and the ink on the light one, which does not. See
"The light colourway's portrait is not the dark one inverted" below.

`slotAt()` tests the circle as a circle rather than as its bounding box,
because that box overlaps the top of box 1 and a square test would take clicks
meant for the photograph underneath.

Three of the eight boxes carry an inner rectangle in the source. That is a
KEYLINE drawn as two rects, not two slots: the outer is filled in the PAGE
colour and the inner holds the picture, which is how the artwork separates a
box lying on top of another from the one beneath. `loveInner()` is the one
function that answers "where does the photograph actually go", and the painter,
the hit test, the drag and the SVG all read it.

The boxes overlap -- box 2 over box 1, box 5 over box 8 -- so they are painted
forwards and `slotAt()` walks backwards, the rule the tribute poster's fifteen
already follow.

## One frond, three placements

The source draws thirty-nine leaflets in each of three corners: a hundred and
seventeen paths, fifteen kilobytes. They are the same thirty-nine each time.

Fitted over all thirty-nine leaflet centroids, the second frond is the first
turned -179.20 degrees at 0.9556, and the third is its MIRROR turned -55.01
degrees at 1.1562. Worst-case error 0.12 and 1.00 points respectively, against
fronds 151 and 116 points across.

So one frond ships and `LOVE_FRONDS` holds three matrices in the artwork's own
coordinates, with the page scale applied outside them in both painters. A third
of the data, and -- the part that matters -- one shape to be wrong rather than
three.

## The cradle moves with the last row

A white bracket runs beneath the date grid and turns up at both ends. In the
artwork it sits at a fixed y under a five-row month.

It is anchored to the LAST ROW here instead: `loveTrayRect(rows, W, H)` puts
its top 15.09 points above that row's baseline, which reproduces the artwork
exactly for a five-row month and pushes the bracket down for a six-row one.
Left at a fixed y, a six-row month would set its final week inside the
bracket -- the same class of fault as a layout tuned to the common case and
broken by August.

## Every stroke width is in the artwork's points

The first version wrote outline widths as `Math.max(1, fx)` -- one device
pixel, the idiom the rest of this file uses. Comparing the two painters caught
it: the canvas paints at about 1.66 page units per artwork point and the SVG
export at about 0.50, so the clamp fires on one and not the other, and the same
heart came out with a 1.7-unit outline on screen and a 3.3-unit one in the
export.

The outlined hearts, the divider segments, the diamond outlines, the two rules
and the hanging strings all carry the source's own width now, multiplied by the
page scale with no clamp. The clamp was protecting against a sub-pixel stroke
on a small raster, and this page is never rastered below 1.66 units per point.

## The message is two paragraphs, not seven lines

The source sets it as two `<text>` blocks 30.53 apart against a 25.23 leading.
That is a paragraph gap. A blank line in the field is a paragraph here and
carries the wider gap; `loveLines()` wraps each paragraph and marks where one
begins, and `loveBaselines()` turns that into baselines.

The artwork puts a colour emoji at the end of the first paragraph, as an
embedded raster. It is two vector hearts here, following the end of that
paragraph's last line and clamped to the column, so a longer or shorter message
carries them rather than colliding with them.

## What was left out of the source, and why

- **Twenty-two luminosity masks and twenty-two filters**, about a third of the
  file, all of them the glow around the small sparkles. `HBD_SPARK`'s radial
  gradient is the same light at no weight -- the answer the birthday poster
  already reached for its seventy-four embedded PNGs.
- **Four embedded PNGs.** Decoded, they are black-and-white luminance masks
  rather than artwork: three shape the sparkle glow and one the heart between
  the names. Reading them was worth doing -- they had looked like twenty-two
  small coloured hearts from their placements alone, and they are not.
- **Both supplied fonts**, for licence.
- **The photographs, the message and the names** in the source folder. Nothing
  from them is in this repository.

## Four things the first build got wrong, found by laying the two renders side by side

Reported as: the fronds do not look like the reference, especially the one on
the right of the circle. They did not, and the cause was not the frond.

Everything below was found by rendering the poster at the artwork's own page
size and measuring the same feature in both images, in the artwork's own
points. Reading the code back would not have found any of them.

### The paint order, which is most of what that frond looks like

The source's hundred and seventeen leaflet paths are the FIRST paths in the
file: all three fronds are drawn, then the ring, then the circle, then the
boxes. Ours drew one frond first and the other two AFTER the portrait, so the
frond beside the circle lay across the white ring and over the photograph
instead of tucking behind them.

Nearly half of that frond is behind the circle -- it starts at x 199 where the
circle reaches 253 -- so the order is not a detail of it, it is most of its
silhouette. Measured, the visible red ink:

| Frond | Reference | Ours, before | Ours, after |
| --- | --- | --- | --- |
| Top left | 10.80, 58.80, 88.06 x 127.92 | 11.42, 59.53, 85.98 x 126.28 | 10.86, 59.07, 86.88 x 127.64 |
| By the circle | 206.58, 168.47, 81.34 x 135.84 | (spilled over the ring) | 206.35, 168.72, 81.11 x 135.45 |
| Lower right | 318.63, 624.46, 159.32 x 81.60 | 319.89, 626.61, 157.54 x 78.78 | 319.02, 625.99, 158.83 x 79.78 |

### Box 6 is drawn twice at two different widths

The source gives it an unfilled rectangle 164.98 across and a white-filled one
166.33 across. The fill is what shows. Taking the other left that box 1.4
points narrow, and it is the only one of the eight where the two disagree --
which is exactly why it survived a build that checked the other seven.

### The divider diamonds are not square

Every glyph on the two dividers is a RECT under a 45-degree rotate, so it spans
its own side times root two. The rects are not square, and reading the height
from the width left the centre diamond 1.3 points short: 18.04 across where it
should be 18.04 by 19.33. Two of the ten glyphs are written as polygons rather
than rects and are square at 14.53, where they had been lumped in with the
12.06 rects.

The row is also hand-placed and leans about 1.7 points across its own width,
and every glyph now carries its own y. Only the UPPER divider is stored: the
lower is it reflected about y 573.145 and shifted 0.46 across, which is proved
rather than assumed -- every element's two y values sum to 1146.29 within a
hundredth, and 573.145 is the heart between the names.

### The light colourway's portrait is not the dark one inverted

`VALTemp-02.svg` fills the WHOLE ellipse with the ink and puts a two-point
white keyline on the picture circle, so an empty portrait there is a solid dark
disc with a hairline inside its edge -- matching its ink-filled boxes. Ours had
inverted the dark colourway instead, giving a white disc inside a heavy black
band, which the reference has nothing like.

`circleFill` and `circleLine` are theme tokens now rather than roles, because
this is the one place in the layout where the two colourways are not each
other's inverse. The keyline is drawn last, over the photograph, because on
that colourway it is the only thing separating the picture from the ring.

### After the fixes

Every feature measured against the reference render, in the artwork's points,
as `x, y, w, h`:

| Feature | Reference | Ours | Largest delta |
| --- | --- | --- | --- |
| Ring | 30.7, 76.1, 229.1 x 195.6 | 30.9, 76.7, 228.7 x 194.9 | 0.7 |
| Box 1 | 18.0, 265.0, 96.7 x 253.7 | 18.0, 265.1, 96.7 x 253.2 | 0.5 |
| Box 2, mounted | 105.1, 298.1, 144.7 x 201.6 | 104.9, 298.1, 144.9 x 201.6 | 0.2 |
| Box 3 | 154.0, 499.2, 134.4 x 178.6 | 154.1, 499.4, 134.1 x 178.2 | 0.4 |
| Box 4 | 18.0, 525.1, 131.0 x 152.6 | 18.0, 525.2, 130.7 x 152.4 | 0.3 |
| Box 5, mounted | 382.0, 688.1, 145.4 x 126.0 | 382.1, 688.1, 145.3 x 125.9 | 0.1 |
| Box 6 | 18.0, 694.5, 166.0 x 121.4 | 18.0, 694.6, 166.0 x 121.5 | 0.1 |
| Box 7 | 193.1, 694.5, 151.6 x 119.3 | 193.1, 694.6, 151.7 x 119.2 | 0.1 |
| Box 8, mounted | 305.9, 702.0, 99.8 x 111.8 | 306.1, 702.0, 99.4 x 111.7 | 0.4 |
| Rule above the title | 320.8, 23.3, 244.5 x 10.6 | 321.1, 23.1, 244.0 x 10.5 | 0.5 |
| Rule under the header | 342.1, 93.1, 207.5 x 1.7 | 342.1, 93.0, 207.7 x 1.7 | 0.2 |
| Cradle | 326.1, 195.4, 239.2 x 84.5 | 326.1, 195.5, 239.3 x 84.2 | 0.3 |
| Hanging cluster, white | 150.0, 25.9, 109.9 x 81.8 | 150.0, 26.1, 109.6 x 81.5 | 0.3 |
| Hanging cluster, red | 178.3, 20.9, 68.1 x 80.9 | 178.5, 21.0, 67.9 x 80.5 | 0.4 |
| Upper divider | 349.8, 530.9, 191.7 x 19.7 | 349.9, 530.9, 191.4 x 19.3 | 0.4 |
| Lower divider | 350.3, 595.7, 191.7 x 19.7 | 350.6, 595.8, 191.1 x 19.3 | 0.6 |

Nothing is more than 0.7 points out, and the residuals are all in the same
direction: the reference is a 2481-pixel render and ours a 990-pixel one, so
our edge pixels fall below the threshold that counts as ink.

**The light colourway's reference sits 2.74 points to the right of the dark
one's.** `VALTemp-02.svg` uses a different artboard origin. That is a
difference between the two source files, not between the two colourways, and
the poster deliberately does not reproduce it: a colourway changes colour and
must not move the artwork.

## Both colourways came from the source

`VALTemp-01.svg` is the dark one and `VALTemp-02.svg` the light one -- the
first artwork in this family to supply both rather than leave the light one to
be derived, so `LOVE_THEMES` is read off the pair.

The rule that makes the light colourway work is that **the empty photo box is
the INK and the mount behind it is the PAGE**, in both files. Invert the ground
and white boxes would vanish; the source's own answer is to fill them
near-black. Verified by sampling the canvas on both:

| | page | empty box | mount | circle | ring |
| --- | --- | --- | --- | --- | --- |
| Dark | `#231f20` | `#ffffff` | `#231f20` | `#231f20` | `#ffffff` |
| Light | `#ffffff` | `#231f20` | `#ffffff` | `#ffffff` | `#231f20` |

The sparkles invert too: white with near-white tips on the dark ground, gold
with cream tips on the light one, because a white star on white paper is
nothing.

## The names moved out of the anniversary poster's field block

`#p-anniv-fields` held the two name inputs together with the tagline, the photo
swap and that poster's colourway select. This layout wants the names and none
of the rest.

Widening that block's gate is exactly what put a dead "Screen Mode" on three
posters (`docs/error-fixes/SEARCH_SCREEN_CONTROLS_LEAKED_ONTO_THE_COLLAGE_POSTERS.md`),
so the names have their own block, `#p-names-fields`, with its own gate. The
batch photo input is reached through `#p-batch-fields`, which already exists
for the same reason.

## Testing

`node tests/verify-layout.js`: **1557 passed, 1 failed** -- section 4 alone,
which compares the working tree against `git archive HEAD` and fails while the
work is uncommitted. Its six differing measurements are all `index` main and
feed heights, which is the new catalog card and nothing else.

### The calendar

Section 13 carries a fourth layout now. The six cases are the section's own and
are derived in Node from the same calendar every other program uses:

| Month | Marked | Column | Row |
| --- | --- | --- | --- |
| November 2025 (opens Saturday, 30 days) | 29 | 6 | 4 |
| February 2026 (opens Sunday) | 14 | 6 | 1 |
| August 2026 (31 days, opens Saturday) | 1 | 6 | 0 |
| February 2024 (leap) | 29 | 4 | 4 |
| February 2027 | 29 | nothing marked | |
| September 2026 (30 days) | 31 | nothing marked | |

**The check needed one new option to work here, and the reason is this
poster's cradle.** Section 13 finds the calendar by taking the longest
unbroken horizontal run of ink in a band, on the stated grounds that no shape
in any of these posters' bands is wider than its own rule. That is false here:
the cradle is 239 points across against a 208-point rule, and a short month
brings it up into the window. `ruleTop`/`ruleBottom` bound the search for the
rule alone to the dozen points it occupies; the marker still gets the wide
window, which it needs to reach row 4.

Broken on purpose to confirm the check works: shifting the marked day one
column right failed all four of the cases that have a marker, on this layout
only.

### The two painters

The SVG export was rasterised and compared with the canvas pixel by pixel.
Every shape matches: the eight boxes, the three fronds, the ring, the cradle,
the nine hearts, the twenty-two sparkles, the two dividers and their diamonds
all fall below the threshold. The Times type -- the month, the day letters, the
dates, the message and the greeting -- matches to within a pixel of ink extent.

What still differs is the two names, and that is the known editor-wide
limitation: an SVG rasterised in an `<img>` gets no webfonts, so the Petit
Formal Script stand-in falls back and the glyphs land elsewhere. It predates
this layout and is not a defect in it.

### Photographs

Nine generated images through the batch input landed in the artwork's own
order: the circle first, then the eight boxes 1 to 8. The circle crops to a
circle (a sample inside its bounding box but outside the circle is still the
page). Box 2 paints over box 1 and box 5 over box 8, each with its mount
between them.

### Typing on the preview

All four fields -- the message, the greeting and the two names -- open the
ghost editor on a double-click and write through to their panel controls.

## Files

- `site/js/poster.js` -- `LOVE`, `LOVE_BOXES`, `LOVE_THEMES`, `LOVE_HEARTS`,
  `LOVE_SPARKS`, `LOVE_DIVIDER`, `LOVE_FROND`, `LOVE_FRONDS`, `LOVE_TRAY`,
  `paintLove()`, `loveSVG()`, and the slot, control and persistence wiring
- `site/poster.html` -- `#p-love-fields`, and `#p-names-fields` split out of
  `#p-anniv-fields`
- `site/index.html` -- the catalog card, and the card count 47 to 48
- `site/js/admin.js` -- the registry entry, whose title matches the card's
- `site/css/style.css` -- `.mock-doc.poster.love`
- `tests/verify-layout.js` -- section 13's fourth layout and its rule window
