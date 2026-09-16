# Coding-Agent Prompt: the Anniversary Calendar Poster

Source artwork: `C:\Users\hp\Downloads\Happy Anniversary Template\Happy Anniversary Template\`

| File | What it is | Use it for |
| --- | --- | --- |
| `SVG/Anniversary Template-01.svg` | the editable master, 841.89 x 595.28 (A4 LANDSCAPE points) | ALL geometry, and every string |
| `PNG/Anniversary Template-01.png` | 3509 x 2482 render, 4.1678 px/pt | checking your result against |
| `PDF/Anniversary Template.pdf` | print file | nothing |
| `JPG/Anniversary Template-01.jpg` | the same render, lossy | nothing |
| `Adobe illustrator/Anniversary Template.ai` | the working file | nothing; do not try to parse it |
| `Fonts/Monotype Corsiva Regular.ttf` | Monotype, proprietary | read the licence note; do NOT bundle |
| `Fonts/times.ttf` | Times New Roman, Monotype, proprietary | read the licence note; do NOT bundle |
| `spcode-<id>.png` | a real Spotify scan code for a real track, the id in its filename | NOTHING. See the first section. |
| `HA Template-01.png` | a second render at the folder root | nothing |

Unlike the trade counter receipt's master, **this SVG has real `<text>` elements**
-- 33 of them -- so every string, position, font and size can be read straight
out of it. Do that rather than measuring the PNG.

Read this whole file before you open an editor.

## Before anything else: two things in this artwork must not ship

**1. The Spotify branding.** The block at the top right is Spotify's own
scannable-code export: their logo mark baked into a 640 x 160 PNG, encoding one
specific track, whose id is the filename. The SVG references it as an external
`<image>` pointing at a path on the designer's own machine.

That id is deliberately not repeated in this brief. It identifies a real
recording, and a document whose own definition of done forbids the id appearing
in the repository should not be the thing that puts it there.

`site/` is the Netlify publish directory, so anything you put there is a public
URL. Do not copy that PNG into the repository, do not trace the logo, and do not
name Spotify in the template title, the catalog card, the file name or a commit
message.

The poster editor already has the right answer to this, built for the music
player poster in September 2026: the code reaches the page ONLY inside an image
the visitor uploads, which is their own asset. Read `CODE_SLOT` and the note
headed "Nothing is fetched" in `docs/implementation/MUSIC_PLAYER_POSTER.md`
before you design anything here -- it also explains why fetching a code from the
service's endpoint is not an option (it breaks the promise printed on every
editor, it adds a third-party runtime against Critical Rule 1, and a
cross-origin image TAINTS the canvas so every raster export throws).

**2. Two real people's names.** The two names across the top are a real couple's,
and the tagline says how long they have been together. They are in the artwork
and in the SVG's text elements; they are not repeated here. Replace both with
neutral placeholders. The template is a "Anniversary Calendar Poster" or similar -- it
describes the layout, it does not commemorate somebody's marriage.

## The artwork's calendar is WRONG, and that decides the whole design

The grid is labelled NOVEMBER 2025 and shows the 1st in the second column, under
M, in a five-row grid ending with 30 in the third column.

**1 November 2025 was a Saturday.** The real month starts in the LAST column,
needs SIX rows, and ends with 30 alone on the sixth. The 29th, which the artwork
marks with a heart, was a Saturday and not a Monday.

The designer laid out a generic 30-day month beginning on a Monday and typed a
real month's name over it. Every x and y in that grid is hand-set to fit that
fiction, and the numbers are not even on a uniform pitch -- single digits sit
further right than double digits because each was nudged to look centred.

So:

- **Do not copy the thirty date positions.** Compute the grid.
- **Do not copy the five-row shape.** A month needs four to six rows depending
  on its length and its first weekday, and the layout has to survive all three.
- The artwork is the visual reference for TYPE, COLOUR and PLACEMENT OF THE
  BLOCK. It is not a reference for what goes in it.

This is the entire engineering content of the template. A visitor picks a month,
a year and a day; the poster draws that month correctly and marks that day.

### Computing it

- Weeks start on **Sunday**: the header reads `S M T W T F S`.
- Derive the first weekday and the month length **without parsing a date
  string**. `new Date("2025-11-01")` is UTC midnight and renders as the previous
  day west of Greenwich. `site/js/docs.js`'s `formatDate()` already carries a
  comment about exactly this trap; use `new Date(Date.UTC(y, m, 1)).getUTCDay()`
  and `new Date(Date.UTC(y, m + 1, 0)).getUTCDate()`, or arithmetic.
- Column centres come from the rule beneath the header, which runs x `505.02` to
  `808.52`: seven columns of `43.36pt`, centred at `505.02 + 43.36 * (i + 0.5)`.
  **Centre each number in its column** -- that is what the designer was doing by
  hand, badly.
- Row baselines: the artwork's five are `352.77`, `384.82`, `416.89`, `448.94`,
  `481.01`, a pitch of `32.06`. Keep the pitch and the first baseline; let the
  row count follow the month. Decide what a six-row month does -- either it
  runs 32.06 past the fifth row, or the pitch compresses to fit a fixed block --
  and say which in your write-up. Whichever you choose, check February in a
  non-leap year starting on Sunday (four rows) and a 31-day month starting on
  Saturday (six rows), because those are the extremes.
- The marked day is the second red heart, drawn BEHIND the number. The number
  stays white and legible on it in the artwork; make sure yours does too.

## Where this belongs

`site/js/poster.js`, as a new LAYOUT beside `card`, `split`, `browser` and
`player`. It is a photo poster, not a document.

Two things about that file you need to know before you start.

**It has just been made safe for this.** Until September 11, 2026 the slot
machinery assumed `SLOT_COUNT` was also the number of slots a visitor could
reach, and adding the player's eighth slot put a phantom "Card 8" in the search
screen's menu that deleted the player's photograph. `slotsFor(layout)` is the
fix: it lists the slots a layout actually draws, and the menu, the selection
clamp, the selection ring, Remove photo and the framing controls all read it.
**Add your slots to `slotsFor()` and the rest follows.** See
`docs/error-fixes/PHANTOM_CARD_EIGHT_AND_FRAMING_CONTROLS_ON_THE_WRONG_SLOT.md`.

**It has never drawn a landscape page.** Every entry in `PAPER` is portrait
(`A4: { w: 210, h: 297 }`, and so on up to A0), and this artwork is A4
landscape. The jsPDF export already handles it -- the line that builds the
export options computes `orientation: p.w > p.h ? "l" : "p"` -- so the export
path is ready and the PAPER table and the preview are not. Decide whether the
layout forces landscape or the visitor chooses an orientation, and be aware that
`previewSize()` and every layout that assumes a tall canvas are what you are
touching. This is the largest piece of risk in the job; do it first and prove it
with an existing layout before you draw anything new.

## Geometry, read off the SVG

Page `841.89 x 595.28` points. Colours: ground `#050606`, hearts `#e93625`,
everything else `#FFFFFF`.

### The heart collage: eighteen photo slots

| # | x | y | w | h | | # | x | y | w | h |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 151.99 | 213.01 | 188.46 | 221.15 | | 10 | 344.96 | 177.59 | 121.70 | 101.83 |
| 2 | 25.29 | 177.59 | 121.70 | 101.83 | | 11 | 344.96 | 127.18 | 60.85 | 47.23 |
| 3 | 86.15 | 127.18 | 60.85 | 47.23 | | 12 | 409.44 | 143.98 | 33.15 | 30.43 |
| 4 | 49.36 | 143.98 | 33.15 | 30.43 | | 13 | 270.34 | 159.76 | 69.62 | 47.20 |
| 5 | 151.99 | 159.76 | 69.62 | 47.20 | | 14 | 425.26 | 283.20 | 34.75 | 34.75 |
| 6 | 31.94 | 283.20 | 34.75 | 34.75 | | 15 | 344.96 | 283.20 | 76.91 | 76.91 |
| 7 | 70.09 | 283.20 | 76.91 | 76.91 | | 16 | 343.99 | 363.82 | 46.92 | 46.92 |
| 8 | 101.04 | 363.82 | 46.92 | 46.92 | | 17 | 284.47 | 437.65 | 35.68 | 34.80 |
| 9 | 173.23 | 437.65 | 35.68 | 34.80 | | 18 | 212.49 | 437.65 | 68.37 | 57.00 |

**Eight of those rects carry a `transform="translate(a b) rotate(-180)"` and it
is a NO-OP.** Rotating an axis-aligned rect 180 degrees about the right point
maps it onto itself; measured, every one lands back within 0.01pt of its own
`x`/`y`. The designer mirrored the left side to build the right and the
transform is the leftover. Use the `x`/`y`/`w`/`h` as they stand and ignore the
transforms entirely. Applying them will double-transform the right-hand half of
the heart; skipping those rects as "already mirrored" will lose it.

The two halves mirror about `x = 245.98`, which is a useful check on your
transcription: slot 2's right edge and slot 10's left edge are equidistant from
it. Slots 1 and 18 straddle the axis and are a fraction off-centre, which is
hand placement and should be kept.

### Everything else

| Thing | Font | Size | Position (text origin) |
| --- | --- | --- | --- |
| first name | Monotype Corsiva | 66 | 216.74, 79.69 |
| second name | Monotype Corsiva | 66 | 534.41, 79.69 |
| tagline | Monotype Corsiva | 56.15 | 49.31, 566.15 |
| month and year | Times New Roman | 32.04 | 527.3, 244.51 |
| day header | Times New Roman | 26.7, letter-spacing 0.4em | 509.37, 298.97 |
| dates | Times New Roman | 26.7 | computed, see above |

| Thing | Box |
| --- | --- |
| rule under the day header | x 505.02 to 808.52 at y 311, white, 2pt |
| scan code image | x 492.63, y 130.39, 326.4 x 81.6 (a 640 x 160 source at scale 0.51, so 4:1) |

The two hearts are `<path>` elements in the source, in page coordinates. Copy
the path data verbatim and place it by transform -- `drawArt()` and `PLAYER_ART`
in `poster.js` already do exactly this for the music player's glyphs, including
the optional `rule` for fill winding. Read that before writing a second copy.

## The fonts: both are proprietary, and this is NOT the receipt's answer

`Monotype Corsiva Regular.ttf` and `times.ttf` are both Monotype's, and both
carry an explicit clause: "This typeface is the property of Monotype Typography
and its use by you is covered under the terms of a license agreement."

**Do not bundle either.** `site/` is the publish directory and shipping them
would be a redistribution this project has no licence for -- the same call the
card layout made about Algerian and the music player made about Helvetica World.

Note this is the OPPOSITE of the trade counter receipt, where the supplied
Roboto turned out to be SIL OFL 1.1 and bundling was permitted (and declined on
weight instead). Do not carry that conclusion across; check the font you are
handed, every time.

Use the project's own faces. `poster.js` already loads a serif and a sans; a
script face for the names is the one real loss, and a visitor will accept a
different script far more readily than a poster that fails to render. Measure
every fixed-width line and set it down to fit rather than trusting the source's
sizes -- `fitLine()` in `poster.js` is the shape of the answer.

## What the visitor edits

- **Two names**, and the tagline (the artwork's names a number of years; ship
  something neutral and let them type over it)
- **Month, year and the marked day** -- three controls, and everything about the
  grid follows from them
- **Eighteen photographs**, through the existing grid upload: `uploadTargets()`
  already fills empty slots in order from one gesture, which is the only way
  eighteen slots is usable. Extend it rather than writing a second allocator.
- **A scan code image**, uploaded, with a hint saying where to save one from
- Every slot draggable and resizable through the existing framing controls

## Traps

1. **The calendar is wrong in the source.** See above. This is the one that
   decides whether the template is worth having.
2. **Eight rects carry no-op transforms.** See above.
3. **Two `<text>` elements hold two numbers each.** The source has 33 text
   elements for 30 dates plus the labels, because "1" and "8" share one element
   (with a `tspan` at a different y), as do "2" and "9". Reading `textContent`
   gives you "18" and "29". You are computing the grid anyway, so this matters
   only if you try to verify against the source's own numbers -- which you
   should, and carefully.
4. **Landscape.** No existing layout is. See above.
5. **Eighteen slots is a lot of localStorage.** Photographs are NOT in `state`
   in `poster.js` and are deliberately not in the undo stack; check how the
   existing slots persist before assuming eighteen behave the same, and measure
   what a full poster costs before shipping it.
6. **The framing controls hold ONE slot at a time.** With eighteen, the card
   menu that the search screen uses becomes the only usable way to select one,
   and `slotName()` will need names that mean something. "Card 14" tells a
   visitor nothing about which box in a heart they are pointing at.
7. **Nothing is fetched, ever.** No Spotify endpoint, no font CDN, no server.
   Critical Rule 1.
8. **The suite will not tell you this looks right.** Render it and LOOK at it,
   empty and full, at a four-row month and a six-row month. The last several
   defects in this project were invisible to measurement and obvious on sight:
   a footer band drawn as straight gradients where the artwork curved, a catalog
   tile stacked into the top 43 per cent of its frame, a prompt drawn in white
   on a white panel.

## While you are in there

- Add a catalog card in `site/index.html` and the matching entry in
  `site/js/admin.js`, and update the catalog-empty count.
- Add the controls to `site/poster.html`.
- A landing page is a separate decision. Ten exist; the poster editor currently
  shares one generic `poster-maker.html`, and a per-design page would be a new
  pattern for that editor rather than a copy of an existing one.

## Definition of done

- The poster matches the artwork in layout, checked by rendering it.
- The calendar is CORRECT for the month chosen, verified against at least three
  months including a six-row one and a February.
- The marked day lands on the right square in all of them.
- Both the canvas and the SVG export draw the same poster -- `exportSVG()` is a
  separate renderer in this file and it drifts silently; sample the two at the
  same points.
- Eighteen photographs upload, frame and export.
- No Spotify asset, logo, track id, or either supplied font is anywhere in the
  repository, including comments and commit messages.
- `node tests/verify-layout.js` passes. Section 4 fails while your work is
  uncommitted -- that is the working-tree-versus-HEAD comparison and it clears
  on commit; check its differences are confined to the pages listing the catalog.
- A write-up in `docs/implementation/`, and an index entry in
  `docs/DOCUMENTATION_INDEX.md` under the right section.

## Do not

- Do not put this in `docs.js`. It is a poster.
- Do not copy the artwork's date positions or its row count.
- Do not bundle either supplied font.
- Do not copy the supplied scan code into the repository.
- Do not add a server call, a font CDN, or any third-party runtime.
- Do not use `innerHTML` for any visitor string.
- Do not put working files inside `site/`.
- Do not use emojis anywhere -- code, comments, documentation or commit
  messages.
- End commit messages with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
