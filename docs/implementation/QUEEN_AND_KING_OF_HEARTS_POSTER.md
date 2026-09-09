# Queen and King of Hearts, the First Poster Style That Is a Layout

Date: September 8, 2026
Status: Implemented

## Summary

A playing-card poster: white paper, a ruled photo panel, a `Q` over a heart in
the top-left margin and a mirrored `K` over a heart in the bottom-right. It is
the fifth entry in `FRAME_STYLES` and the fourth card in the Posters and Prints
category.

It ships in two suits now, and the letters are whatever the visitor types --
both later the same week, and both recorded in their own sections at the foot of
this document.

It was built from supplied A4 artwork (`cards 11-01.svg`, `cards 11-02.svg` and
a PDF, 595.3 x 841.9 pt). The artwork itself ships nothing: the geometry was
traced into constants and the pip into a path string, so the repository carries
no new asset for this style.

Five files, no new dependency and no new persisted field:

| File | Change |
| --- | --- |
| `js/poster.js` | the style, the layout renderer, its SVG twin, preset support, and the rank selection |
| `poster.html` | the two rank selects, hidden for the other styles |
| `index.html` | one catalog card, and the catalog-empty count that tracks the card total |
| `css/style.css` | the card's miniature |
| `js/admin.js` | the matching `CATALOG_ITEMS` entry |
| this file | -- |

## It is a layout, not a frame, and that is why it still lives in FRAME_STYLES

The other four styles are a colour pair: `paint()` floods the page with
`frame`, strokes `trim` inside it, lays a white matte, and insets the photo by
a frame width plus a matte width with an 11 per cent caption band at the foot.
None of that describes a playing card. The card has no flood, no matte, no
caption band, and its panel is inset by a fixed fraction rather than by a
frame's thickness.

So the entry carries `layout: "card"` and `paint()` branches on it before it
reads `frame` or `trim`:

```js
hearts: { frame: null, trim: null, label: "Queen and King of Hearts", layout: "card" }
```

It stays in `FRAME_STYLES` regardless, because everything downstream of that
map already does the right thing with a fifth key. `buildSelects()` fills the
frame select from `Object.keys(FRAME_STYLES)`, so the control needs no markup.
`migrate()` validates a saved style against the same map, so a saved
`"hearts"` survives a reload and an unknown value still falls back to `black`.
`persist()` writes `state.frame` and nothing else. **A style that needed its own
persisted field, its own control or its own migration step would have been the
signal to stop and restructure; none of them did.**

## The bottom index is mirrored in y, not rotated

A real playing card rotates its bottom index 180 degrees. This artwork does
not: it applies `matrix(1 0 0 -1)` to both the `K` and its pip, which is a
vertical flip. The difference is invisible on the pip -- a heart is
symmetric about its vertical axis -- and unmissable on the `K`, because a
rotation would also reverse it left to right.

`drawCardIndex()` therefore puts only the y axis through the transform and
mirrors the x positions arithmetically:

```js
c.translate(0, H);
c.scale(1, -1);
```

with the pip's left edge at `W - pip.x * W - pipW` and the letter set
`textAlign = "right"` at `W - rank.x * W`. Reaching for `scale(-1, -1)` and a
single translate is the obvious shortcut and produces a backwards `K`.

## Geometry is fractional, and the mirror is exact where the artwork is not

Every number in `CARD` is a fraction of the page rather than a point value, for
the reason the text elements already are: one set of constants has to land in
the same visual place on A4 and on A0, at preview scale and at export scale.

The artwork's two indices are not exact mirrors of each other. The margin above
the `Q` is 120.4pt; the margin below the `K` is 117.5pt. That reads as hand
placement, so the renderer mirrors exactly and absorbs the 2.9pt difference --
a third of a millimetre on A4.

Measured against the preview canvas (990 x 1400, A3), the panel rules land
centred on the panel edges to the pixel:

| Edge | Expected | Rule ink | Rule width |
| --- | --- | --- | --- |
| left | 123.8 | 121-126 | 6.65px |
| right | 866.1 | 863-868 | 6.65px |
| top | 98.3 | 95-100 | 6.65px |
| bottom | 1303.1 | 1300-1305 | 6.65px |

The rule is stroked **on** the boundary, as the artwork has it, so half of it
falls over the photograph. Insetting it instead leaves a hairline of paper
between rule and photo at export scale.

## One pip path, two renderers

`HEART_PATH` is the artwork's own bezier, normalised to a unit box. The canvas
parses it once into a `Path2D` and fills it under a scale transform; the SVG
export emits the same string verbatim under an equivalent transform.

This is the part most likely to have drifted if it had been written twice.
`exportSVG()` is a genuinely separate renderer -- it exists so type stays
vector -- and it is the path that gets forgotten, because the preview looks
correct either way. Sharing the string means a change to the shape cannot land
in the raster exports and silently miss SVG. The same reasoning put
`drawPhotoPanel()` in front of both layouts: the "Upload a photo to begin"
placeholder is now defined once instead of once per layout.

The PNG, JPG, PDF and PPTX exports all run through `paint()` and needed no
branch of their own.

## Algerian was not shipped

The artwork sets its `Q` and `K` in Algerian. The design folder carries the TTF,
but Algerian is a licensed Monotype face and bundling it into `site/` would be
redistribution this project has no licence for -- `site/` is the publish
directory, so a font placed there is a public URL.

The indices are set in **Playfair Display**, which the page already loads and
which is the closest high-contrast display serif on hand. This is a visible
difference from the source artwork: Algerian is a decorative face with much
heavier stems. It is a deliberate substitution rather than a silent one, and it
is the same principle the `FONTS` list is built on -- the editor does not name a
face the renderer would quietly swap.

## The poster editor reads a preset now

`docs.html` and `mockup.html` have always opened on the variant the visitor
clicked, through `TB.takePreset()`. `poster.html` did not: no poster card
carried a `data-doc`, so the editor always opened on the saved style.

It reads one now, and the new card is the first to send one. The value is only
ever matched against `FRAME_STYLES`, so a tampered `localStorage` entry
resolves to nothing worse than a style that already ships. It outranks the
saved style, because arriving from a card is a fresh and deliberate choice, and
it deliberately leaves the rest of the saved poster alone -- **the photo, the
caption, the paper size and the document name all survive the switch.**

The selection is not persisted until the visitor's first edit, matching how
`docs.html` treats its session document type. Opening the card and reloading
without touching anything returns the previously saved style.

### Why the key is `hearts` and not `cards`

The style key, the `data-doc`, and the `CATALOG_ITEMS` id are necessarily the
same string: `verify-layout.js` keys each homepage card by its `data-doc`, and
`takePreset()` matches against `FRAME_STYLES`. `cards` was the obvious name and
is the wrong one -- in this codebase "card" already means a catalog tile
(`template-card`, `card-link`, `CATALOG_ITEMS`), and `admin.js` is precisely
where that collision would read worst.

## The catalog-empty count is asserted

Adding the card broke a check nothing about this work suggested it would touch:
the empty-search message names the catalog size in prose, and the suite parses
both. It said 33 against 34 cards.

That check is doing its job -- it is the kind of copy that goes stale silently
-- and it is worth knowing it exists before adding a card. `CATALOG_ITEMS` in
`js/admin.js` is the other half of the same discipline: the picker holds a
hardcoded copy of the feed and section 1j asserts the two agree.

## The miniature

The catalog miniature is CSS, like the wood and gold cards beside it, rather
than a rendered thumbnail. The supplied artwork's photograph is an engagement
portrait with no licence attached to it, and the poster's own proposition is
that the visitor supplies the photo.

Its panel uses the same 12.5 / 7 / 75 / 86 per cent inset the renderer does, so
the tile and the poster it opens are the same layout. The indices are absolutely
positioned in the paper margin rather than stacked above and below the panel,
because that is where they sit on the poster, and the foot index is `scaleY(-1)`
over markup ordered letter-then-pip -- the flip is what puts the pip on top,
which is the same trick the renderer plays.

They are sized in rem against a roughly 292px card, the width the masonry column
settles at on a laptop. Nothing in the stylesheet is container-query based, so
every miniature has this property; the alternative was introducing container
queries for one decorative tile.

## The prompt that reproduces the artwork

Recorded here for the same reason every mockup document records its prompt: so
the artwork has a written source rather than only a file someone was sent once.

**It will not reproduce the geometry.** No image model places a rule at 12.515
per cent of the page width on request, and none of them has Algerian. The
renderer in `js/poster.js` already produces this layout exactly, from the
measured table below -- the prompt is for producing a reference render, a
thumbnail, or a variation, not for producing the template itself. Where the two
disagree, the table wins.

### Prompt A -- the card frame with an empty panel (`cards 11-01.svg`)

```
A minimalist print-ready poster on pure white paper, A4 portrait,
2481 x 3508 pixels at 300 DPI.

One large solid black rectangle sits centred on the page: 75% of the page
width and 86% of the page height, with equal 12.5% margins to left and
right and a 7% margin top and bottom. It is outlined with a thin crisp
black rule about 1.4mm thick, drawn directly on its edge.

In the white margin at the top left, clear of the rectangle, a large black
capital letter Q in a heavy decorative display serif -- Algerian style:
high contrast, bracketed slab serifs, an engraved western look -- about
14% of the page width tall. Directly beneath the Q, a solid crimson red
heart, hex #BE1E2D, about 9% of the page width across.

In the margin at the bottom right the same pair appears MIRRORED
VERTICALLY: the heart sits above a capital K, both flipped upside down
about the horizontal axis but NOT reversed left to right, the way a
playing card's opposite index reads.

Flat vector artwork. No gradients, no drop shadows, no texture, no paper
grain, no rounded card corners, no extra suit pips, no border ornament,
no other text, letters or numbers anywhere on the page.
```

### Prompt B -- the finished poster (`cards 11-02.svg`)

Prompt A with the rectangle's fill clause replaced by:

```
The rectangle is filled edge to edge with a warm candid portrait of a
young couple embracing outdoors: soft golden late-afternoon light,
dappled bokeh foliage behind them, shallow depth of field, natural
skin tones, both laughing towards the camera, framed from the waist up
and cropped to fill the rectangle completely with no white gap inside
the rule.
```

### Prompt C -- for a coding agent rebuilding the template

A different kind of prompt for a different kind of machine. Prompts A and B
describe a picture to a picture-maker; this one describes a build to something
that writes code. It exists for three jobs: rebuilding this design in another
project, producing variations that stay consistent with it, and handing the work
to another developer or agent without them having to re-derive the numbers.

Most of its value is the trap list. The geometry can be read off the artwork by
anyone; the seven rules below are what this build actually cost, and every one
of them produces something that looks nearly right when got wrong.

Only the "Where it goes" section is repository-specific -- swap it when porting.

```
TASK
Add a "Queen and King of Hearts" playing-card layout to the poster editor,
from the supplied A4 artwork (595.3 x 841.9 pt). A visitor uploads one
photograph; the poster renders it inside a ruled panel, with a Q above a
heart in the top-left margin and a mirrored K above a heart in the
bottom-right. It must render identically in the on-screen preview and in
every export format the editor offers.

WHERE IT GOES
site/js/poster.js is the editor. FRAME_STYLES is the style registry.
paint(c, W, H, opts) is the single renderer every raster export runs
through. exportSVG() is a second, independent renderer for vector output.
The frame <select> is built from Object.keys(FRAME_STYLES) and migrate()
validates a saved style against that same map, so a new key needs no new
control, no new persisted field and no migration step. Do not add any.

THE DESIGN, EXACTLY
Store every number as a fraction of the page, never in points: one set of
constants has to serve A4 through A0, at preview scale and export scale.

  panel  x 74.5/595.3   y 59.1/841.9    w 446.3/595.3  h 724.5/841.9
  rule   4/595.3 of the page width
  pip    x 11/595.3     y 120.4/841.9   w 55.6/595.3   h 50.9/841.9
  rank   x 10.99/595.3  baseline 94.55/841.9   em size 83.6676/595.3

  paper #FFFFFF   ink #000000   pip #BE1E2D

The pip is the artwork's own bezier, normalised to a unit box:

  M0.5,0.1611C0.4478,0.0668 0.3615,0.002 0.259,0.002C0.1133,0.002 0,0.1238
  0,0.2849C0,0.5953 0.1547,0.6425 0.5,1C0.8453,0.6405 1,0.5934 1,0.2829C1,
  0.1238 0.8885,0 0.741,0C0.6385,0 0.5522,0.0668 0.5,0.1611Z

SEVEN THINGS THAT ARE EASY TO GET WRONG

1. The bottom-right index is mirrored in Y ONLY. The artwork applies
   matrix(1 0 0 -1) to both the K and its pip. A 180-degree rotation --
   the obvious shortcut, and what a real playing card does -- also
   reverses the K left to right. Put only the y axis through the
   transform (translate(0, H) then scale(1, -1)) and mirror the x
   positions arithmetically. Right-align the flipped letter so it hugs
   the mirrored margin.

2. ONE path string, both renderers. Parse it into a Path2D for the
   canvas and emit the same string under an equivalent transform in the
   SVG export. Writing the shape twice is how vector output silently
   drifts: it is a separate renderer, and the preview looks correct
   either way, so nothing tells you.

3. Stroke the rule ON the panel boundary, so half of it falls over the
   photograph. Insetting it leaves a hairline of paper between rule and
   photo at export scale.

4. This is a layout, not a colour pair. The existing styles are
   {frame, trim} floods with a matte and a caption band; this one
   replaces the whole page composition. Give the entry a `layout` field
   and branch on it BEFORE reading frame or trim. Keep it in the same
   registry anyway -- that is what buys point 1 of "where it goes".

5. Do not ship the artwork's typeface. It is Algerian, a licensed
   Monotype face. The design folder carries the TTF, but the publish
   directory is served verbatim, so a font placed there is a public URL
   and a redistribution. Set the ranks in a display serif the page
   already loads, and record the substitution in a comment so the next
   reader knows it was a decision.

6. A transparent export KEEPS the indices. That toggle exists to drop
   the background; the letters and pips are artwork. Skip only the paper
   fill and the placeholder.

7. Extract the photo-or-placeholder block into one function both
   layouts call, rather than copying it. Note that the existing code
   centres the placeholder text on W/2, which happens to equal
   x + w/2 only because the old panel is centred -- write x + w/2.

ALSO WIRE UP
- One catalog card, carrying data-doc set to the style key, so the card
  opens the editor on this style.
- Preset support in the editor: read TB.takePreset(), match it against
  FRAME_STYLES only, let it outrank the saved style, and leave the rest
  of the saved poster alone -- photo, caption, paper size and document
  name all survive the switch. This editor is the only one that does not
  read a preset yet.
- The matching entry in CATALOG_ITEMS in js/admin.js. The suite asserts
  the picker and the homepage agree, keyed on data-doc.
- The catalog-empty message names the card total in prose. It is
  asserted. Update it.
- Name the key so it does not collide with existing vocabulary: "card"
  already means a catalog tile here, so the style key is `hearts`.
- Two selects for the corner ranks, persisted and validated like the
  frame. Offer A, J, Q and K only: every glyph must be ONE character,
  because "10" at this em size overruns the margin into the panel. The
  corners are independent, so two queens is a reachable pairing. Hide
  the pair for the other styles rather than showing them inert, and
  write state back to them on undo and redo -- whatever syncs the text
  toolbar probably returns early when no text is selected, so it is not
  the place for document-level controls.

CONSTRAINTS
- Entirely client-side. No server code, no new runtime dependency.
- Never innerHTML for user data.
- The catalog miniature must scale with its tile rather than assume a
  card width: inside the two-column band alone the tile runs from about
  136px to about 360px.

DONE WHEN
- Sampling the preview canvas shows all four panel rules centred on the
  panel edges, and the pip filling #BE1E2D.
- The bottom-right index reads pip-above-K, with the K upside down and
  NOT reversed left to right.
- The SVG export parses clean and contains the white ground, the photo
  at panel geometry, a fill="none" rule rect, two index groups (the
  second under a scale(1 -1) transform) and any caption as live <text>.
- The other four styles render identically to before the change.
- Clicking the catalog card routes through loading.html and opens the
  editor on this style.
- node tests/verify-layout.js passes.
```

### The geometry, as fractions of the page

This is the table the renderer is built from, and the one to hand a person or a
tool that must match the artwork rather than evoke it.

| Element | x | y | width | height |
| --- | --- | --- | --- | --- |
| Photo panel | 12.515% | 7.020% | 74.971% | 86.055% |
| Panel rule | on the panel edge | -- | 0.672% of width | -- |
| Rank letter | 1.846% (left edge) | 11.230% (baseline) | 14.052% of width (em size) | -- |
| Suit pip | 1.848% | 14.300% | 9.340% | 6.046% |

Bottom-right index: mirror both in y, and mirror x arithmetically so the letter
is not reversed. Ink `#000000`, pip `#BE1E2D`, paper `#FFFFFF`.

On A4 that is a panel 157.4 x 255.6mm at 26.3, 20.9mm, a 1.41mm rule, a rank
set at 83.67pt, and a pip 19.6 x 18.0mm.

## Verified

- 133 static checks and the full four-section suite pass.
- Panel rules measured on the preview canvas: the table above.
- Pip fill sampled at `#BE1E2D`; the bottom-right index confirmed pip-above-K.
- SVG export driven through the real download path (blob intercepted at
  `URL.createObjectURL`): parses without error, and contains the white ground,
  the embedded photo at panel geometry, the `fill="none"` rule rect, two index
  groups (the second under `translate(0 420) scale(1 -1)`) and the caption as
  live `<text>`.
- Preset hand-off driven by a real click: the card routes to
  `loading.html?target=poster`, stores `"hearts"`, and the editor opens on the
  card layout with a saved `gold` poster otherwise intact.

## The ranks became selectable (September 8, 2026)

Shipped in the same day as the layout, on request. The artwork specifies a queen
and a king; the product should not, because a couple wanting two queens or two
kings had no way to say so.

Two fields, `rankHead` and `rankFoot`, persisted alongside the frame. They began
as four-item selects and became free text the next day (below); what follows
holds for both.

**The controls are hidden for the other four styles**, not shown inert. Only the
card layout has corner indices, and a control that is always visible but usually
does nothing reads as broken -- the same argument the text toolbar is built on.
`syncDocControls()` toggles the wrapper from the selected style's `layout`.

**The corners are independent**, so every pairing is reachable, including A and
A. Nothing enforces the artwork's Q-then-K.

**An older saved poster reopens as the pairing its style advertises.** Records
written before this change carry no rank fields at all, which is exactly the
case the fallback exists for -- so the migration step is the validator itself,
and there is no version bump. Only `undefined` takes the fallback: an empty
string is a corner the visitor deliberately cleared, and putting a letter back
over it would be the editor arguing with them.

### It fixed a staleness bug that was already there

Undo and redo rewrite state wholesale, and nothing wrote the result back to the
document-level controls: undoing a frame change repainted the canvas correctly
and left the Frame Style select showing the style that had just been undone.
`syncControls()` next to it looks like where that belongs, but it serves the
text toolbar and returns early when no text element is selected.

The rank selects would have inherited the same fault, so the fix is
`syncDocControls()` -- frame, paper size, document name and both ranks, plus the
card fields' visibility -- called from `undo()`, `redo()`, the frame change
handler and once at startup. The three manual assignments that used to sit in
the init tail are now that one call.

## A second suit, and letters the visitor types (September 9, 2026)

Built by handing Prompt C back to a coding agent, which is the first time that
prompt has been used for what it was written for.

### Spades costs a path, an ink and a pairing

`SUITS` is the new indirection: a pip path plus the ink it is filled with.
`FRAME_STYLES.spades` names one, `FRAME_STYLES.hearts` names the other, and
`drawCardIndex()` and `cardIndexSVG()` take the suit as an argument instead of
reaching for a constant. No second renderer, which is the return on having made
the first style a layout rather than a special case.

The spade has no artwork to trace, so it is drawn to the heart's own
proportions -- same unit box, apex on the centre line, lobes at full width, stem
flaring to the baseline -- and drawn **point up**. Point-up is what makes it free
at the other corner: the flipped index turns the whole group over, so the
bottom-right spade inverts exactly as the heart does and nothing in the mirror
needs to know which suit it is drawing.

Its default pairing is K then Q, because that is the order its catalog card
advertises. The preset hand-off carries the pairing along with the style now, so
clicking "King and Queen of Spades" gives a K and a Q rather than the queen and
king left over from the other card. **Only the catalog does this**: picking the
same style from the Frame Style control leaves the letters alone, because that
is an edit in progress rather than a request for the template as advertised.

### The letters are free text, and that is why they are measured

The four ranks are suggestions in a `datalist` behind two text inputs. A visitor
who wants their initials, or a 10, types them.

That removes the reason numerals were excluded and replaces it with arithmetic.
The cap is `RANK_MAX_W`, and it is expressed against the pip rather than as a
number -- **nothing in the corner reaches further right than the pip does** --
so the two can only move together.

### The correction that went with it

The first cut of this carried the artwork's 83.6676pt em straight over to the
substituted face, and that put the letters into the photograph. Measured on the
artwork's page, in points:

| | Right edge | Gap to the panel at 74.5 |
| --- | --- | --- |
| Pip (the artwork's own) | 66.6 | **7.9** |
| Playfair `A` at 83.67pt | 66.8 | 7.7 |
| Playfair `K` at 83.67pt | 70.7 | 3.8 |
| Playfair `Q` at 83.67pt | **77.3** | **-2.8, inside the panel** |

Playfair Display is about 18 per cent wider than Algerian at the same em, so
carrying the number over unchanged was never going to hold. It was recorded here
as "the artwork's own Q already overhangs, which is a choice and not a defect" --
that was wrong, and reported as letters clashing with the photograph.

The artwork puts its rank's right edge ON the pip's, so the substituted face is
set at the em that does the same: **70.1pt**. Every suggestion then clears the
panel by at least the pip's own margin, and the cap catches anything typed that
would not. Verified by pixel-sampling the panel interior for A, J, Q, K, M, 10,
88, WW and QQ: zero intruding pixels each, and no glyph reaching past the pip.

The lesson is narrow and worth keeping: a substituted typeface inherits the
artwork's POSITION but not its metrics, and an em size is a metric.

The SVG export measures through the live canvas context, because there is
nothing in an SVG string to measure with and the fitted size has to be the same
number the canvas used -- otherwise a wide rank would collide in one export
format and not the other.

Free text also means the value now goes through `TB.sanitize()` on the way to
localStorage and `TB.desanitize()` on the way back, like every other string the
visitor supplies.

### Clicking the letter on the poster

The corner indices are hit-tested, and clicking one focuses its field with the
text selected, so the next keystroke replaces it. On a phone, where the form and
the preview are separate tabs, it switches to the form first.

Not an in-canvas text editor: that means a caret, a selection model and IME
handling for two characters of content. This closes the same loop -- the corner
is where the visitor is looking, so that is where the way in should be.

## Not done

- **Two suits, not four.** Clubs and diamonds are a path and an ink each now.
- The style is not offered on `poster-maker.html`, which still describes the
  frame styles only.
- The rank is one font size for both corners; a visitor wanting a small "10"
  against a large "K" has no way to ask.
