# The Anniversary Definition Poster

Date: September 15, 2026
Status: Done

The poster editor's ninth layout: a three-by-three grid of photographs over a
dictionary entry -- a word, a bracketed pair of initials, a definition and a
closing line. Built from the brief in
`docs/project/CUTE_COUPLE_ANNIVERSARY_PROMPT.md`.

It is the first layout in `site/js/poster.js` with no artwork file behind it,
and that changes almost everything about how it was built. Read section 2
before trusting any number in this document.

## 1. What is not here, and will not be

The reference supplied with the brief is not an artwork file. It is a
photograph of a framed print, held in somebody's hand, in their home. It
carries nine photographs of two identifiable private individuals, their
initials, and a closing line that is a real message from one of them to the
other.

None of it is in this repository. Not the image, not a crop of it, not a
thumbnail, not a colour sampled from a face, not the initials, not a sentence
of the message -- and not in a comment, a sample, a test fixture, a tile, a
file name or a commit message. The starting copy the editor loads was written
for this file: `Love` is a dictionary headword, `A & B` is nobody's initials,
and the definition and closing line are new sentences.

What was taken is the LAYOUT: the grid, the proportions, the type roles and
the vertical rhythm. That is the design, and the design is the deliverable.

## 2. Almost every number here is DERIVED, not measured

Every previous poster in this file was traced. Its geometry came from an SVG
with exact coordinates, and the standing instruction was to read them rather
than eyeball them. **This one is the reverse**, and the reason is measurable:

| What is wrong with the reference | Measured |
| --- | --- |
| Perspective | Row three's three cells are 134, 167 and 179 pixels wide in a 736-pixel image. In the design they are equal. |
| Glass | A specular reflection runs across the top right. |
| Lighting | The left edge is in shadow, the right is blown out. |
| The mount | The mat's inner edge is visible and is not the print's edge. Brightness cannot separate the two: the mat reads 236 at the top of the image and the print's own paper reads 186 lower down, which is the lighting, not the material. |

So any length read off that photograph is a length times an unknown projective
transform. What survives is RATIOS, and only near the centre of the image where
a projective transform moves things least.

### What was measured

These four are evidence, and each is a ratio or a coincidence rather than a
length:

- **The cells are square.** The three rows measure 164, 162 and 168 pixels
  tall against a middle column 167 wide, and the middle column is the one
  perspective distorts least.
- **The gutter is about 2.4 per cent of the width.** The horizontal gutters
  read 15 and 17 pixels in a 736-pixel image.
- **The text block is ranged on the grid.** The word's ink starts at x 124 and
  the first cell's left edge is at x 123.
- **The word and the bracket share a baseline.** Both runs of ink end on pixel
  row 831, and a shared baseline is invariant under the transform in a way a
  distance is not. The bracket's own ink is 15 pixels tall against the word's
  52, which is where a quarter of the size comes from.

### What was derived

Everything else, and it is written out in the comment at `COUPLE` in
`site/js/poster.js` so a later reader can disagree with it:

| Number | Value | Why |
| --- | --- | --- |
| Page | 595.28 x 841.89 | A4 in points, like the four calendar posters. Every paper size this editor offers is 1:sqrt(2), so a design space of any other shape would be stretched to fit one. |
| Side margin | 48.14 | 8.1 per cent of the width, which is where the reference's first cell edge sits. |
| Gutter | 14 | 2.35 per cent of the width. |
| Cell | 157 | What is left: three cells and two gutters fill the width between the margins. |
| Grid top | 110 | See below. |
| Word baseline | 667 | 58 points under the grid, from the reference's 61 pixels scaled by 0.9156 -- the ratio of the two grid widths, 499 points here against 545 pixels there. |
| Definition leading | 21.5 | The reference's 22.3-pixel pitch, same scaling. |
| Closing gap | 32 | Deliberately NOT the reference's. See section 4. |

### The one thing the reference could not supply

Its print is 1.22 times as tall as it is wide. A4 is 1.41. Carrying its
proportions across therefore leaves about eighty points of vertical slack with
nowhere obvious to put them.

The first build put the grid at a top margin of 82 and let the slack fall at
the foot. Rendered, the whole composition reads as having slid up the page and
left a hole under it -- 140 points of white below a closing line, on a poster
whose text block is its second subject. The slack is spent on the TOP margin
instead, at 110 against sides of 48. That is a strong head margin and it is
what the page wanted.

The foot then lands between 92 points clear on a two-line definition and 28 on
a five-line one, which is the range `def.maxLines` exists to keep it inside.

## 3. The type is FOUR faces

The design reads as a dictionary entry, so the obvious assumption is one serif
throughout. It is neither that nor a serif over a serif:

| Element | Face | Size |
| --- | --- | --- |
| The word | Playfair Display 700 | 68 |
| The bracket | Inter 600 | 17 |
| The definition | Inter 400 | 15.5 |
| The closing line | Playfair Display 400 | 17 |

The closing line switching BACK to the serif is the row a build would quietly
drop, and it was checked specifically rather than assumed: in the reference
that line's ink density is 3.4 units per pixel of length against 4.0 for the
three lines above it, which is a different face rather than a shorter line.

Both stacks were already loaded by `poster.html`. No webfont was added.

### One ink, and the measurement that settled it

The first build set the bracket and the closing line in a second, lighter
tone, on the reasoning that it gives the block three tonal levels instead of
two. It looked good and it was wrong.

Sampled as the darkest four per cent of each run -- a mean over a glyph is
mostly paper and mostly reports stroke thickness -- the reference says:

| Run | Darkest 4 per cent | Paper beside it |
| --- | --- | --- |
| The word | 22 | 201 |
| The bracket | 9 | 188 |
| Definition line 1 | 38 | 198 |
| Definition line 2 | 34 | 193 |
| The closing line | 43 | 194 |

The bracket is not lighter than the word; it is marginally darker, which is a
bold sans against a serif's hairlines rather than a different ink. The closing
line's 43 against the definition's 34 and 38 is the same effect the other way
round. The two runs sit within 200 pixels of each other on one line, so the
print's uneven lighting cancels between them.

**One ink.** The four roles are told apart by face and size, which is what the
design actually does, and `COUPLE_THEMES` has no `muted` key to tempt the next
person.

## 4. Where this deliberately departs from the reference

Two places, both stated here so that neither reads later as an oversight. A
third -- a second ink -- was tried, measured and withdrawn; see section 3.

- **The gap before the closing line is 32, not 21.** The reference sets the
  closing line at very nearly the definition's own pitch. At equal pitch it
  reads as a fourth line of the definition, which is the one thing the change
  of face exists to prevent. A third more leading is what makes it its own
  line.
- **The head margin is 110.** Section 2 above.

## 5. The greyscale, which is the one new capability

All nine photographs in the reference are black and white, and that is the
design rather than a property of the photographs: one colour snapshot dropped
into this grid breaks it.

Nothing else in this editor converts a photograph. It had to be written twice,
which is this file's standing hazard:

```js
// canvas, inside the save that already holds the cell's clip
if (grey) { c.filter = "grayscale(1)"; }

// SVG
'<filter id="tb-couple-grey" color-interpolation-filters="sRGB">' +
    '<feColorMatrix type="saturate" values="0"/></filter>'
```

**`color-interpolation-filters="sRGB"` is not decoration.** An SVG filter works
in linearRGB unless told otherwise, and the same `saturate(0)` then comes out
visibly darker than the canvas's -- an export that does not match the preview,
invisible until somebody opens the file. With it spelled out, the two painters
land within one level of each other on every cell.

The canvas filter is set INSIDE the `save()` that already holds the clip, so
one `restore()` takes both off together. A filter left standing would grey the
type as well, and on a colourway whose ink and page are both neutral that is
nearly invisible.

### It is a toggle, defaulting on

A visitor who wants their colour photographs can have them: the grid is what
this design is, not the absence of hue. `state.coupleGrey` is read through
`coupleGrey()` rather than tested directly, because `undefined` -- from a
record saved before this existed -- has to mean ON.

## 6. The fields, and whose brackets they are

Four new state keys: `coupleWord`, `coupleBracket`, `coupleDef`,
`coupleClosing`. All four are registered with `noteText()`, so all four are
editable on the preview as well as in the panel.

**The square brackets belong to the template.** A visitor types the initials
and the layout draws `[` and `]` around them. Somebody who types their own
anyway would otherwise get two sets, so `coupleBracketText()` takes off one
matching pair -- one, and only a matching one, because a field holding a single
bracket is a bracket somebody wanted.

That has a consequence for the canvas editor, and it is handled rather than
inherited: the editable region for that field covers the INITIALS, not the
brackets. A region over the whole drawn run would put the caret on characters
the field does not contain.

An empty bracket field draws no bracket at all, rather than an empty pair.

### The control limits are the sanitisers' limits

`LIVE_FIELDS` says it in the file: every canvas-editable field can be typed in
two places, and the stricter rule has to win in both or the poster changes
depending on where it was typed. The first build declared `maxlength` 24, 24,
260 and 80 on the four controls against `cleanLine`'s 40 and `cleanBlock`'s
220 -- so the panel refused characters the canvas editor would have accepted,
and accepted characters the sanitiser then cut mid-word. Found by rendering a
definition longer than either limit and watching it stop at "anywhere at a".

They are 40, 40, 220 and 40 now, which is `cleanLine` and `cleanBlock`
exactly, and the same pair the love poster's two fields already use.

## 7. What was reused rather than re-derived

Almost all of it. The layout is 300 lines because the editor already had:

| Needed | Already existed |
| --- | --- |
| Boxes onto the page | the same `fx`/`fy` scaling every layout uses |
| Which slots a layout draws | `slotsFor()` -- extended, not bypassed |
| Hit testing and framing | `slotAt()`, `rectForSlot()`, `photoAt()` |
| Filling a batch in order | `uploadTargets()`, one branch widened |
| Per-photo zoom and pan | `state.views[slot]`, `drawCoverImage()` |
| Word wrap | `hbdWrap()` |
| Canvas-editable fields | `noteText()`, `LIVE_FIELDS` |
| A colourway select | the pattern the other five follow |

Two things are this layout's own, and both are about it being a GRID rather
than an artwork's hand-set rectangles:

- **The cells are computed, not listed.** Every other collage in this file
  lists its boxes because no arithmetic would reproduce what its designer set
  by hand. Nine literal rectangles here would be nine chances to mistype a
  number the arithmetic cannot get wrong.
- **The hit test runs forwards.** The other collages search backwards because
  their boxes overlap and the answer has to be the one painted last. Nothing
  here overlaps, so there is exactly one answer.

`COUPLE_EXTRA` and `COUPLE_FIRST` follow the rule the other four collages set:
cell 0 IS slot 0 -- "the photograph" every single-photo layout uses -- so a
picture set on the card, the player or any of the collages arrives in the top
left cell, where the eye starts reading. The other eight take fresh indices
rather than sharing another layout's, because a slot is a place in ONE design.

## 8. Testing

`node tests/verify-layout.js`: **1632 passed, 1 failed.** The one failure is
section 4, the working-tree-versus-HEAD comparison, and all eight of its
differences are the homepage's feed and main getting taller by the height of
one card. That is the section doing its job on uncommitted work and it clears
on commit.

**Section 15 is new**, and what it asserts is the pair of things this layout
can fail at that nothing else in the suite would see.

- **The greyscale, as numbers.** Nine flat, saturated photographs are loaded,
  the canvas and the SVG export are both sampled at the nine cell centres, and
  each sample is required to be neutral in both and to agree between them
  within one level. Nine different hues must produce at least seven different
  greys, so the check cannot pass against a flat fill. The canvas's `filter` is
  read after the paint to prove it did not leak onto the type. The export is
  required to declare exactly one filter, in sRGB, with a saturate matrix of
  zero, and to reference it from all nine groups. Then the treatment is turned
  OFF and the whole thing is required to come back in colour, in both painters
  and with no filter declared -- a toggle that only moves the preview is the
  other half of the same defect.
- **The four faces, as markup.** The export's text elements are read for their
  family and weight in drawing order: a heavy serif, a bold sans on the word's
  own baseline and under half its size in square brackets, a sans definition,
  and a closing line that is a serif again. That last check is the one worth
  having: a build that set the closing line in the sans would look almost
  right.

**Broken on purpose**, because a check that has never failed is not evidence.
Deleting `color-interpolation-filters="sRGB"` -- one attribute, and the change
most likely to be made by somebody tidying -- made the two painters differ by
**44 levels per channel**, and 15c and 15f failed and nothing else moved. That
is the size of the drift this check exists to catch, and it is completely
invisible on screen: the preview is unchanged and only the exported file is
wrong.

Driven by hand as well, and three of these found something:

| Driven | Result |
| --- | --- |
| Nine photographs as one batch | filled 1 to 9 in reading order |
| Both colourways, empty and full | both legible empty; the empty tone reads on each |
| Canvas against SVG, pixel by pixel | the grid band differs only along cell edges; the only interior differences were on two rows BELOW the grid, which are the word's ascenders, where an SVG rasterised in an `<img>` gets no webfonts |
| The word `Incontrovertibly` with a bracket | the pair fits the column exactly, the bracket still on the baseline |
| A bracket field typed as `[R & J]` | one pair drawn, not two |
| An empty bracket field | no bracket at all, rather than an empty pair |
| A five-line definition | the closing line follows it down to a 28-point foot |
| A definition longer than either limit | **found the `maxlength` defect above** |
| The reference's own ink, sampled | **found the second-ink mistake above** |
| The composition, rendered rather than reasoned about | **found the eighty points of slack in the wrong place** |

## 9. Files

- `site/js/poster.js` -- the `couple` entry in `FRAME_STYLES`; `COUPLE`,
  `COUPLE_THEMES`, `COUPLE_GREY_FILTER` and the five default strings;
  `coupleCells()`, `coupleSlot()`, `coupleTextLeft()`, `coupleTextWidth()`,
  `coupleSerif()`, `coupleSans()`, `coupleSvgFont()`, `coupleBracketText()`,
  `coupleGrey()`, `coupleDefLines()`, `coupleFlow()`, `coupleWordFit()`,
  `coupleFitLine()`; `paintCouple()` and `coupleSVG()`; and the extensions to
  `slotsFor()`, `slotName()`, `slotAt()`, `rectForSlot()`, `uploadTargets()`,
  `LIVE_FIELDS`, `snapshot()`, `restore()`, `persist()`, `migrate()` and
  `syncDocControls()`
- `site/poster.html` -- `#p-couple-fields`
- `site/index.html` -- the catalog card, and the empty-search count
- `site/js/admin.js` -- the catalog entry
- `site/css/style.css` -- the `.mock-doc.poster.couple` tile
- `tests/verify-layout.js` -- section 15

## A third colourway: Black (September 16, 2026)

Screen Mode offers a pure `#000000` ground beside this poster's own near-black.
The near-black remains the default; the option exists because the two are
indistinguishable on a screen and are not the same thing on paper, and which
one is wanted depends on where the poster is going -- a true black is
off-pixels on an OLED phone, and a near-black lays down ink in all channels in
print where `#000000` usually converts to K-only and comes out flatter.

Derived by `trueBlack()` in `site/js/poster.js` rather than written out, so a
change to the dark colourway cannot leave its twin behind. The same option is
on the music poster, the birthday calendar, the birthday tribute and the love
story calendar; it is deliberately NOT on the anniversary calendar, whose
ground is already `#050606` and would offer two indistinguishable choices. Full
reasoning: `docs/implementation/MUSIC_PLAYER_POSTER.md`, "The page ground".
