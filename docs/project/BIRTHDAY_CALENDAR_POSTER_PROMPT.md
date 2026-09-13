# Coding-Agent Prompt: the Birthday Calendar Poster

Source artwork: `C:\Users\hp\Downloads\Custom HBD Template\Custom HBD Template\`

| File | What it is | Use it for |
| --- | --- | --- |
| `SVG/Custom HBD Template-01.svg` | the editable master, 595.28 x 841.89 (A4 PORTRAIT points) | ALL geometry, and every string |
| `PNG/Custom HBD Template-02.png` | 2481 x 3508 render of the EMPTY template, 4.1678 px/pt | checking your result against |
| `JPG/Custom HBD Template-02.jpg` | the same render, lossy | nothing |
| `PDF/Custom HBD Template.pdf` | print file | nothing |
| `Adobe illustrator/Custom HBD Template.ai` | the working file | nothing; do not try to parse it |
| `Fonts/Monotype Corsiva Regular.ttf` | Monotype, proprietary | read the licence note; do NOT bundle |
| `Fonts/times.ttf` | Times New Roman, Monotype, proprietary | read the licence note; do NOT bundle |
| `Custom HBD-04.png` (root) | a MARKETPLACE preview: two posters side by side under a "PDF SVG AI PNG JPG" banner | NOTHING. See the first section. |

The master has **32 real `<text>` elements**, so every string, position, font and
size can be read straight out of it. Do that rather than measuring the PNG.

Read this whole file before you open an editor.

## Before anything else: three things here must not ship

**1. The root PNG contains photographs of a real, identifiable person.** Its
left-hand poster is a completed example filled with a dozen photographs of one
woman. Do not copy that file into the repository, do not crop it, do not derive
a catalog thumbnail or a sample from it, and do not use any frame of it as test
content. It is also the marketplace preview rather than the artwork -- the same
trap the trade counter receipt's folder had -- so deriving geometry from it
would put a blue banner in your poster as well.

The artwork is `PNG/Custom HBD Template-02.png`, which is the empty template.

**2. The words are a real message from one person to their mother.** The quote
block and the closing line are somebody's own writing about their own parent.
Replace both with neutral placeholders. Do not reproduce either sentence in the
code, in a sample, in the documentation, or in a commit message.

**3. Both supplied fonts are Monotype's, and neither may be bundled.**
`Monotype Corsiva Regular.ttf` and `times.ttf` both carry an explicit clause:
"This typeface is the property of Monotype Typography and its use by you is
covered under the terms of a license agreement." `site/` is the publish
directory, so shipping either is a redistribution this project has no licence
for.

This is the SAME answer as the anniversary calendar poster and the OPPOSITE of
the trade counter receipt, whose Roboto turned out to be SIL OFL 1.1 and was
declined on weight rather than on law. Check the font you are handed, every
time; do not carry the previous conclusion across.

## The calendar is CORRECT in this artwork. Check anyway, and read on

The grid says SEPTEMBER, opens the 1st under M in five rows of thirty days, and
marks the 15th. September 2025 opened on a Monday, has thirty days, needs five
rows, and its 15th was a Monday. Everything agrees.

**That is the opposite of the anniversary calendar poster**, whose artwork
claimed November 2025 opened on a Monday when it opened on a Saturday, and whose
brief told you not to trust the grid. Do not carry either conclusion across. The
rule is that you verify, not that source grids are wrong.

**It still has to be computed rather than copied**, for three reasons that have
nothing to do with whether this one month is right:

- The positions are hand-set. The dates in a single row sit at x 34.02, 78.99,
  119.46, 165.13, 207.75, 242.21 and 282.24 -- gaps of 44.97, 40.47, 45.67,
  42.62, 34.46 and 40.03. There is no pitch there to copy.
- A visitor picking a different month gets a different first weekday, a
  different length and four to six rows.
- Two `<text>` elements hold TWO numbers each: the 1 and the 8 share one element
  through a `tspan` at a different y, as do the 2 and the 9. Reading
  `textContent` gives you "18" and "29".

Derive the grid from the rule under the day header, which runs x `36.4` to
`308.39`: seven columns of `38.857`, centred at `36.4 + 38.857 * (i + 0.5)`. Row
baselines are `151.88`, `180.61`, `209.34`, `238.07` and `266.8` -- a pitch of
`28.73`. Keep the pitch and the first baseline and let the row count follow the
month; decide what a six-row month does to the block below it and say which in
your write-up.

`site/js/poster.js` already has `annivMonth()` and `annivCell()` doing exactly
this arithmetic for the anniversary poster, including the `Date.UTC` handling
that stops a date shifting a day west of Greenwich. **Reuse them.** A second
copy of a calendar is a second calendar to be wrong.

### Two things about the marked day

**The heart COVERS the number rather than sitting behind it.** The `15` is still
in the file, at the same position as every other date; the heart is simply drawn
over it and is opaque and larger. The anniversary poster does the opposite --
heart first, number on top in a colour that contrasts with the heart.

Pick one and say why. They cannot both be right in one editor, and the
anniversary poster's `onAccent` exists precisely because a number drawn in the
page ink disappears on the red.

**There is no year anywhere on the poster.** It says SEPTEMBER and nothing else.
The grid depends on a year the visitor never sees, so a year control that
changes the layout while changing nothing visible is going to read as a bug.
Decide: print the year, or keep the artwork's design and make the control say
what it is for. Either is defensible; silently having a hidden input reshape the
grid is not.

## Where this belongs

`site/js/poster.js`, as a SIXTH layout beside `card`, `split`, `browser`,
`player` and `anniversary`. It is a photo poster.

Two things that make this cheaper than it looks:

- **`slotsFor(layout)` already exists** and is what makes extra photo slots
  safe. Until September 11, 2026 the slot machinery assumed `SLOT_COUNT` was
  also the number of slots a visitor could reach, and the player's eighth slot
  put a phantom "Card 8" in the search screen's menu that deleted the player's
  photograph. Add your twelve slots to `slotsFor()` and the menu, the selection
  clamp, the selection ring, Remove photo and the framing controls all follow.
  See `docs/error-fixes/PHANTOM_CARD_EIGHT_AND_FRAMING_CONTROLS_ON_THE_WRONG_SLOT.md`.
- **The anniversary poster is the near-neighbour in every respect** -- portrait
  A4, a dark ground, a computed calendar, a photo collage, a script face
  standing in for Monotype Corsiva, two colourways, and a control for moving a
  photograph between boxes. Read
  `docs/implementation/ANNIVERSARY_CALENDAR_POSTER.md` before you design
  anything. Where this poster differs, differ deliberately.

Slot 0 should be one of the twelve, so a photograph carries across when a
visitor switches templates -- that is the rule `slotsFor()`'s comment states.

## Geometry, read off the SVG

Page `595.28 x 841.89` points. Ground `#231f20` -- a rich black, not `#000000`,
and the same value the music player and the trade counter receipt use.

| Colour | Where |
| --- | --- |
| `#FFFFFF` | all type, the rule, the photo fills |
| `#e93625` | the two hearts, and the photo boxes' stroke |
| `#c190b7` | three garland hearts |
| `#a4b1c3` | two garland hearts |
| `#fdf5a2`, `#fef59c` | the sparkles, two yellows |

### Type

| Thing | Font | Size | Position (text origin) |
| --- | --- | --- | --- |
| month name | Monotype Corsiva | 42.52 | 53.1, 63.28 |
| day header `S M T W T F S` | Times New Roman | 23.93, letter-spacing 0.4em | 40.3, 103.67 |
| dates | Times New Roman | 23.93 | computed, see above |
| quote | Monotype Corsiva | 30.63 | 34.02, 321.97; six lines, leading 36.76 |
| closing line | Monotype Corsiva | 29 | 34.02, 757.05; two lines, leading 34.8 |

Rule under the day header: x `36.4` to `308.39` at y `114.44`, white, 2pt.

### The twelve photo boxes

White fill, `#e93625` stroke at 1pt. In the source's own order:

| # | x | y | w | h | | # | x | y | w | h |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 326.20 | 163.36 | 121.16 | 98.48 | | 7 | 161.54 | 557.00 | 100.41 | 140.71 |
| 2 | 454.71 | 208.49 | 71.02 | 125.93 | | 8 | 365.09 | 575.69 | 77.66 | 112.40 |
| 3 | 464.21 | 341.76 | 103.55 | 119.64 | | 9 | 266.70 | 567.52 | 93.63 | 149.99 |
| 4 | 468.96 | 471.05 | 77.05 | 107.47 | | 10 | 292.39 | 477.27 | 72.71 | 85.76 |
| 5 | 322.36 | 360.52 | 131.42 | 110.53 | | 11 | 369.02 | 476.56 | 89.51 | 95.29 |
| 6 | 56.37 | 520.15 | 100.41 | 142.55 | | 12 | 334.16 | 266.33 | 110.66 | 90.40 |

**They do not overlap, and the gaps between them are hand-set** -- measured,
3.8 to 9.6 points, never the same twice. The cascade reads as a cascade BECAUSE
the spacing is irregular; squaring it onto a grid would turn a scatter into a
table. Keep the numbers.

### The decoration

- **A garland of five hearts** across the top right, three `#c190b7` and two
  `#a4b1c3`, strung on a white line with small tick marks at each end.
- **Five sparkle clusters**, each a large four-pointed star with two or three
  smaller ones around it, centred near `(476, 186)`, `(550, 295)`,
  `(254, 524)`, `(490, 630)` and `(64, 697)`.
- **Two red hearts**: one over the marked date, one closing the last line of the
  message. Their path data starts `M90.52,217.39` and `M536.72,793.31`.

The hearts and the sparkle bodies are VECTOR paths -- 55 of them across the two
yellows -- and can be copied verbatim and placed by transform, which is what
`drawArt()` and `artSVG()` in `poster.js` already do.

**The glows are not.** The file carries 95 `<mask>` elements backed by 74
embedded base64 PNGs, about 40KB decoded and 44 per cent of the SVG's weight,
and all they do is soften the ends of the sparkle bars. Do NOT embed them.
Draw the sparkle as a vector four-pointed star; if you want the softness, a
radial gradient costs nothing and travels through both painters. A decorative
glow is not worth 40KB in a publish directory, and a raster mask will not
survive the SVG export path anyway.

## Traps

1. **The root PNG is the marketplace preview AND contains a real person's
   photographs.** See the first section.
2. **The quote's last line fakes its centring with nineteen literal spaces**
   and `xml:space="preserve"`. Reading `textContent` gives you a line with a
   long run of leading whitespace; rendering it reproduces an indent that was
   only ever correct in Monotype Corsiva at 30.63px. The quote is a
   visitor-typed block that has to WRAP, so centre it in the renderer and throw
   the spaces away. This project has been bitten by `xml:space` before -- see
   the `setAttributeNS` note in `RESUME_TEMPLATE_ENGINE_IMPLEMENTATION.md`.
3. **The marked day's number is hidden under the heart**, not drawn on it. See
   above; this contradicts the anniversary poster and one of them has to give.
4. **No year is printed.** See above.
5. **Two date elements hold two numbers each.** See above.
6. **The date positions are hand-set** and so are the gaps between the photo
   boxes. Compute the first, keep the second.
7. **The month name is the only thing naming the month**, and it is set in the
   script face at 42.52px. A visitor whose month is "SEPTEMBER" gets a line
   that fits; "DECEMBER" is shorter and "FEBRUARY" longer. Measure and set it
   down rather than letting it run into the garland.
8. **Twelve slots plus a quote plus a closing line is a lot of localStorage.**
   Photographs are NOT in `state` in `poster.js` and are deliberately not in the
   undo stack; check how the existing slots persist before assuming twelve
   behave the same.
9. **The suite will not tell you this looks right.** Render it and LOOK at it,
   empty and full, at a four-row month and a six-row month. Every defect found
   in this editor in the last week was invisible to measurement and obvious on
   sight: a footer band drawn straight where the artwork curved, a catalog tile
   stacked into the top 43 per cent of its frame, a prompt drawn in white on a
   white panel, a marked date drawn in the page ink so it vanished on red.

## While you are in there

- Add a catalog card in `site/index.html` and the matching entry in
  `site/js/admin.js`, and update the catalog-empty count.
- Add the controls to `site/poster.html`.
- **Section 13 of `tests/verify-layout.js` already checks a computed calendar**
  -- where the marked day lands, over six months chosen for their edges,
  calibrating its own row pitch off the poster. If you reuse `annivMonth()` and
  `annivCell()`, extending that section to this layout is cheap and is the one
  piece of this template most worth a check.
- A landing page is optional. `anniversary-calendar-poster.html` is the pattern
  if you want one.

## Definition of done

- The poster matches the artwork in layout, checked by rendering it.
- The calendar is correct for the month chosen, verified against at least three
  months including a six-row one and a February.
- The marked day lands on the right square in all of them.
- Twelve photographs upload, frame and export.
- Both the canvas and the SVG export draw the same poster. `exportSVG()` is a
  separate renderer in this file and it drifts silently -- but note that text
  positions will NOT match when the SVG is rasterised in an `<img>`, because an
  SVG loaded as an image gets no webfonts. That is pre-existing and editor-wide;
  compare SHAPES by pixel and text by exported coordinates.
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
- Do not write a second calendar. Reuse the anniversary poster's.
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
