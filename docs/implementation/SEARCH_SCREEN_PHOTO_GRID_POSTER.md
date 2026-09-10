# The Search Screen Poster: Six Photographs in a Results Page

Date: September 10, 2026
Status: Implemented

## Summary

A supplied HTML/CSS artwork -- a phone search-results screen on a near-black
A4 page, with a masonry of six white cards and a row of hearts along the foot --
is now the poster editor's tenth frame style and its third LAYOUT, alongside the
playing card and the diagonal split.

| File | Change |
| --- | --- |
| `js/poster.js` | the `browser` layout: constants, icons, both renderers, six photo slots |
| `poster.html` | the grid's upload, card selector and search text |
| `css/style.css` | the catalog miniature |
| `index.html`, `js/admin.js` | the catalog card and its picker entry |

The visitor uploads up to six photographs in one gesture, moves and resizes each
of them, and types their own words into the search bar.

## What the artwork is, and what was kept

The source is a 595.28 x 841.89 artboard rebuilt in HTML and CSS, with every
offset in its stylesheet a literal coordinate from the original SVG. That made
it unusually cheap to trace: the numbers did not have to be measured off a
picture, they were already written down.

Kept exactly: the page ground, the flask and wordmark, the account circle, the
search pill and its three icons, the tab strip with Images selected and its
underline, the hairline rule, the two-column masonry, and four hearts.

Two things were substituted, both deliberately:

**Roboto became Inter.** The design folder carries Roboto's TTF, but the page
already loads Inter and the two are close relatives on the same neo-grotesque
skeleton. Inter is the wider of the two, which is why the query is MEASURED and
fitted rather than set at the artwork's em and hoped for -- see below. One
visible consequence: the artwork's tab strip cuts "Forums" off after "For", and
this one cuts it after "F", because the five tabs before it are slightly wider.
Both read as a screen wider than the paper, which is what the clip is for.

**The hearts are the card layouts' traced heart**, not this artwork's own,
which is a slightly different trace of the same shape. One heart on the site is
worth more than a third of a millimetre on a 45pt glyph, and it means the pip is
a variable here too -- `suitOf()` drives it, so a spades version of this layout
would cost one entry in `FRAME_STYLES`.

Their INK is the artwork's, though: `#E93625` against the card layouts'
`#BE1E2D`. That is not a discrepancy to reconcile. This red sits on near-black
paper rather than white, and a dark ground needs the lighter red to read as red
at all.

## Points, not fractions

`CARD` and `SPLIT` hold their geometry as fractions of the page. `SCREEN` holds
the artboard's own points, and `screenScale()` converts with one factor per
axis.

That is a deliberate departure and the reason is arithmetic honesty. There are
about forty numbers here against those two's dozen. Written as `x / 595.28`
each, they become forty divisions that a reader has to trust; written as points,
every one of them can be read straight off the source stylesheet and checked in
a second. The conversion is the same multiplication either way -- it happens
once instead of at every constant.

The two factors are kept separate even though the A series is the same
1:root-2 shape throughout to within a rounded millimetre. A single averaged
factor would put the artwork's numbers slightly out on both axes instead of
exactly right on each.

## The icons are the source files, untouched

Five icons -- flask, wordmark, magnifier, microphone, lens -- are stored in
their SOURCE files' own coordinates and viewBoxes, not normalised to a unit box
the way the suit pips are.

```js
lab: { view: [89, 32, 23, 24], parts: [ { fill: "#FFFFFF", d: "M105,37.21l-9,0..." } ] }
```

Nothing was retyped, so there is no transcription to get wrong. Placement is a
transform instead:

```
translate(x, y)  ->  scale(w / viewW, h / viewH)  ->  translate(-viewX, -viewY)
```

`drawArt()` and `artSVG()` build that same chain from the same four numbers.
That is the whole defence against the drift this editor has had before: the
export is a separate renderer, and a second copy of a coordinate is where the
two stop agreeing.

Two details in the source needed a decision rather than a copy. The wordmark
carries the same "l" twice, as a `<rect>` and again as a path 0.16pt wider that
completely contains it -- only the path is here, because the rect was redundant
geometry and not a second glyph. And the flask's outline is `fill:none;
stroke:#fff`, which is why `parts` distinguishes a fill from a stroke at all.

## Six photographs meant one store instead of two variables

The editor held `photo` and `photoB`. Two was the most any layout wanted, and
`photoB` was already the point at which a third variable becomes tempting.

It is one indexed store now:

```js
const photos = new Array(GRID_SLOTS).fill(null);   // GRID_SLOTS = 6
state.views = [ {zoom,x,y} x 6 ]
```

Slot 0 is "the photograph" for every layout that has one, and slot 1 is the
split layout's second half, so the two names that were here map onto the first
two entries and no other layout had to be re-taught. `photoAt()` now returns the
photograph's RECT along with it, because with six boxes on the page "the
photograph under the pointer" and "the box the controls point at" can be
different things for one frame, and a drag measured against the wrong box moves
at the wrong speed.

`normalizeViews()` exists for the array's LENGTH rather than for old data: every
reader indexes it by slot, and a short array hands `undefined` to
`photoMetrics()` as a framing.

## The upload rules, and why there are two of them

One `<input multiple>`, because "choose six photos" is a single gesture in every
phone's picker.

Slots are allocated **synchronously, in the order the files were chosen**,
before any file is decoded. Decoding is asynchronous and a small photograph
finishes ahead of a large one, so allocating on completion would order the
pictures differently every time, by nothing the visitor can see.

`uploadTargets()` answers two different questions and so has two rules. Files
fill every EMPTY card in reading order first, which is what makes one gesture
work. Once there are none left they fall back to the SELECTED card and the ones
after it, wrapping -- which is what makes a seventh upload replace something
visible instead of being silently dropped. Silently dropped is the failure a
visitor cannot tell from a broken control.

`readImage()` is now the one mime gate on the page. The check that is a security
control rather than a convenience existed in one copy when there was one input;
a second and then a sixth photograph is exactly how it ends up in three.

## What is NOT drawn into the export

Every other layout prints its "Upload a photo to begin" panel, and rightly: one
empty photo panel means an unfinished poster, and saying so is a service.

Six cards are different. Four photographs and two clean white cards is a
composition somebody may well want, so an empty card here is left as the
artwork's plain white. The slot numbers and the selected-card outline live in
`drawGridChrome()`, which `render()` calls and `paint()` does not -- and `paint()`
is what every export renders through.

Verified by emptying card 6 and exporting: no `<text>6</text>` and no `8A6A3B`
in the file, with the card white.

## The query is fitted, not clipped

The source's input stops 115.2pt short of the pill's right edge, which puts the
text's limit at x=394.5 against a microphone starting at 412.5.

Anything wider is set DOWN to fit rather than clipped, on the same argument the
rank letters are built on: a name that vanishes halfway through, with nothing on
screen to say why, reads as a broken editor.

Measured, on the live renderer:

| Query | Characters | Ink ends at |
| --- | --- | --- |
| `Us, always` | 10 | 241.7 |
| `Boago & Tumelo` (the artwork's own) | 14 | 292.2 |
| `Our whole ridiculous life together` | 34 | 393.8 |
| forty capital Ws | 40 | 393.8 |

The widest input the field accepts stops 18.7pt short of the microphone. This is
the lesson from the card layout's Q applied before it could bite: there, the
artwork's em was carried over unchanged into a wider substituted face and put
the letters into the photograph.

The default query is `Us, always` and deliberately not a pair of names. The
artwork's own query is its designer's subject; inventing a couple to replace
them would ship somebody's poster as the default. The field's hint is where the
suggestion belongs.

## Two ways in, because the preview is not always on screen

Clicking a card selects it AND starts the drag, the way a text element has
always behaved. Clicking the search bar focuses the query field -- the same loop
`cardIndexAt()` closes for the corner letters, and `focusField()` is now shared
by both, because the awkward part is the same: below 48rem the form and the
preview are separate tabs, so focusing a field in the hidden one does nothing
visible.

The Selected Card menu is the other way in, and it says which cards are already
taken (`Card 3 (empty)`), because on a phone the menu is the only place that
answer can be while the form is open.

The size slider is shared with the other layouts and re-labels itself to name
the selected card. One slider serving six cards silently would give a visitor
who selected card 4 a control labelled for a photograph they are not looking at.

## Removing a photograph writes no history entry

Neither does an upload. Photographs have never been in the undo stack -- they
are not in `state` at all, because a phone photo as a data URL exhausts the
storage quota on its own -- so a commit here would push an entry that restores
the FRAMING of a photograph undo cannot bring back. An undo that visibly does
nothing is worse than one that is not offered.

## The catalog card leaves the corner letters alone

Every other poster card carries its pairing along with its style, because the
card is named after it: clicking "King and Queen of Spades" should give you a K
and a Q.

This one declares no `ranks`, and the hand-off now applies a pairing only when
the style HAS one. Taking the fallback would have quietly rewritten the letters
on a card poster the visitor still had open, from a card that shows no letters
at all. Verified: corner letters set to M and J survive arrival from this card,
and are still reset to K and Q by the spades card.

## Verified

- Six files chosen at once land in cards 1 to 6 in the order they were chosen:
  sampled at each card centre, all six correct.
- The size slider drives the selected card and only that card: card 4 at 300,
  card 1 still at 100.
- A drag moves the photograph **1:1 with the pointer** -- 40 x 30 canvas pixels
  moved the marker exactly 40 x 30, and dragging back returned it exactly.
  A drag started over card 1 selected card 1 and left card 4 untouched.
- The SVG export matches the canvas at eleven sample points -- ground, avatar,
  pill, all six cards, a pip, the wordmark's ground -- worst difference 1/255,
  which is the embedded photographs' JPEG round trip. Card 4 was carrying a
  200 per cent off-centre framing at the time, and it exported in the same
  place.
- The exported file carries 5 `<image>` for 5 filled cards, 7 `<text>` (the
  query and six tabs), 6 clip paths, no slot number and no selection colour.
- The other three layouts still render after the photo-store refactor: plain
  frame, card panel, and the split layout's two halves.
- The rendered poster against the source artwork side by side: same composition,
  same proportions, same colours.

## Not done

- **The account circle is not a photo slot.** It is white, as the artwork has
  it. A seventh upload target for a 39pt circle was not worth the control.
- **The active tab is fixed on Images**, which is the tab a page of photographs
  would be on. Making it selectable is a menu for a detail nobody looking at the
  poster will read.
- **No spades, clubs or diamonds version.** The pip is already a variable; the
  cost is one entry in `FRAME_STYLES` if it is ever wanted.
- The tab strip cuts one glyph earlier than the artwork's, because Inter is
  wider than Roboto. Fitting the strip to land on the artwork's exact cut would
  be over-fitting one detail of a substituted face.
