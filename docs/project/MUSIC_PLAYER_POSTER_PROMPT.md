# Coding-Agent Prompt: the Music Player Poster

Date: September 11, 2026
Status: Brief, not yet built

This is a prompt to hand to a Claude Code agent working in this repository. It
is written to be pasted whole. Everything below the rule is the prompt; the
notes above it are for whoever is handing it over.

**What it is.** A supplied artwork folder (`spotify template.svg` plus renders,
fonts and two code images) draws a phone music-player screen on an A4 page, in a
dark colourway and a light one. The artwork is precise: the SVG carries every
coordinate, so this is a trace rather than a measurement exercise.

**Why the prompt is long.** Most of it is traps. The geometry is the easy part
and the agent can read it out of the SVG; what it cannot read out of the SVG is
which fonts may not ship, why the scannable code cannot be drawn, or which
discrepancies in the artwork are the designer's hand rather than an intent.

---

## The task

Add a music-player poster to the poster editor in `site/js/poster.js`, traced
from the artwork in the folder you will be given. It is a fourth LAYOUT
alongside `card`, `split` and `browser` — not a frame style — so `paint()`
branches on `layout` before it reads `frame` or `trim`, exactly as the other
three do.

Read `docs/implementation/SEARCH_SCREEN_PHOTO_GRID_POSTER.md` first. That layout
is the closest sibling: same shape of problem, same two-colourway structure, and
its decisions are the ones to follow unless you have a reason not to.

## What the visitor edits

| Field | Default | Notes |
| --- | --- | --- |
| Album artwork | empty | one photograph, cover-fitted into a rounded box |
| Song title | `Song Title` | one line |
| Artist name | `Artist Name` | one line |
| Elapsed time | `1:07` | free text, not a parsed duration |
| Total time | `5:07` | free text |
| Scannable code | empty | an uploaded image, see below |
| Colourway | dark | dark or light |

The photograph must be movable and resizable like every other photo on this
page — reuse `photoAt()`, `photoMetrics()` and the framing controls. It is one
more slot in the existing `photos` array, not a new store.

## Geometry, from the SVG's black theme

The artboard is `0 0 1173.44 841.89` and holds BOTH colourways side by side. Use
the black theme, whose page box is `597.45 x 841.89` at the origin. The white
theme is the same drawing translated by `(+646.77, -6.10)`; do not trace it
twice.

Hold these as the artboard's own POINTS and convert with one factor per axis, as
`SCREEN` does — not as page fractions. The reasoning is in the search-screen
document and applies unchanged here.

| Element | Geometry |
| --- | --- |
| page | `597.45 x 841.89` |
| chevron, top left | polyline `100.37,24.63 -> 109.36,35.29 -> 117.99,24.63`, stroke 3, round cap |
| three dots, top right | r `2.07` at `(493.96, 22.42)`, `(493.96, 29.72)`, `(493.96, 37.02)` |
| album artwork | `x 91.04, y 40.85, w 416.15, h 422.99, rx 13.53` |
| song title | baseline `(93.97, 521.12)`, 32px bold |
| artist name | baseline `(93.96, 549.97)`, 21px regular |
| heart | green, bounding box roughly `x 470 -> 510.1, y 506.3 -> 543` |
| progress track | `(92.2, 589.14) -> (507.52, 589.14)`, stroke 5, round cap, 74% opacity |
| progress played | same line to `x 198.63`, full opacity |
| knob | r `9.72` at `(198.63, 589.14)` |
| elapsed time | baseline `(92.2, 612.6)`, 19.75px, horizontally scaled `0.87` |
| total time | baseline `(472.31, 615.31)`, 19.75px, horizontally scaled `0.87` |
| shuffle | roughly `x 92 -> 127, y 654 -> 684` |
| previous | roughly `x 183 -> 210, y 653 -> 682` |
| play | circle r `35.88` at `(299.62, 667.67)`; triangle `M289.63,651.3 v29.39 l26,-14.7 z` |
| next | roughly `x 388 -> 416, y 654 -> 684` |
| repeat | roughly `x 471 -> 508, y 653 -> 684` |
| scannable code | `640 x 160` image at `(68.6, 719.22)` scaled `0.72` -> `460.8 x 115.2` |

Take the five transport glyphs, the heart and the chevron as PATH DATA copied
verbatim from the SVG, placed by a transform. Do not retype coordinates and do
not redraw the glyphs by eye. `drawArt()`/`artSVG()` in `poster.js` already do
exactly this for the search screen's five icons — reuse that mechanism rather
than writing a second one.

## The two colourways

Geometry is shared; only ink changes. Follow `SCREEN_THEMES`: one object holding
every colour and nothing else, so the two cannot drift apart in layout.

| Role | Dark | Light |
| --- | --- | --- |
| page | see the note below | `#FFFFFF` |
| ink (glyphs, text, knob, played track) | `#FFFFFF` | `#231F20` |
| album slot when empty | filled `#FFFFFF` | outlined `#231F20`, stroke 3 |
| remaining track | ink at 74% | ink at 74% |
| heart | `#55BA5D` | `#55BA5D` |
| play triangle | page colour | page colour |

The heart is the one colour that does NOT flip. It is the accent in both.

## Nine traps

**1. Neither font may ship.** The folder carries `SansSerifCollection.ttf`
(Microsoft) and `helvetica-world-bold.ttf` (Linotype). Both are licensed faces
and `site/` is the publish directory, so bundling either is a redistribution
this project has no licence for. Set the type in Inter, which the page already
loads, and record the substitution in the implementation document the way the
card layout records Algerian. Check the fitted width afterwards: Inter is not
metrically identical to Helvetica, and the title has a heart to its right that
it must not reach.

**2. The scannable code cannot be drawn, only uploaded.** Those bars encode a
track identifier. There is no path data to trace and no way to compute them from
a song title. Spotify serves them from `scannables.scdn.co/uri/plain/png/...`,
and fetching that is wrong here for three separate reasons, each sufficient: it
breaks the promise printed on every editor that nothing leaves the device; it
adds a runtime dependency on a third-party host, against Critical Rule 1; and
drawing a cross-origin image into the canvas TAINTS it, so `toDataURL()` throws
and every raster export dies. Make it an upload, with hint text telling the
visitor where to save the image from. Both code variants in the folder are
`640 x 160`, one white-on-black and one black-on-white, which is why the slot
takes an image rather than a colour.

**3. Ship no Spotify artwork, and keep the brand out of the catalog title.** The
logo reaches the poster only inside the visitor's own uploaded code image, which
is their asset and not this repository's. Name the catalog card for what it is —
"Now Playing Poster", or similar — the way the search-screen card is called
"Search Screen, Six Photos" rather than naming Google. This is the same call
made once already and it should be made the same way.

**4. The album slot is not square.** `416.15 x 422.99` is a ratio of `0.9838`.
An album cover is square, so a square upload stretched to fill would be visibly
wrong on a face. Cover-fit and clip, as every other photo slot here does.

**5. The SVG export is a separate renderer and it drifts.** Everything you add
to `paint()` must be added to `exportSVG()` in the same change, reading the same
constants through the same helpers. Verify by rendering the exported file back
to a canvas and sampling it against the preview — the search-screen work did
this at ten points and found the method worth the effort.

**6. The artwork disagrees with itself in three places, and all three are hand
placement rather than intent.** Decide, write the decision down, and do not
silently average them.

- The two time baselines are `612.6` and `615.31` — 2.7pt apart on a row that
  reads as one line.
- The left edge is `91.04` for the album box, `92.2` for the progress track and
  `93.97` for the title: three margins within 3pt.
- The progress knob sits at 25.6% of the track while the times say `1:07` of
  `5:07`, which is 21.8%.

The card layout hit exactly this and its document records the resolution: it
draws the bottom index as a true mirror of the top one and states that the
artwork's 2.9pt difference reads as hand placement. Do the same here.

**7. Derive the knob from the times, and say so.** The recommendation for trap 6
is to compute the played fraction from the two time fields rather than expose a
separate control — a poster reading `1:07` of `3:48` with the knob at 80% looks
broken, and the artwork's own mismatch is not a feature worth preserving. Parse
`m:ss` leniently and fall back to the artwork's 25.6% when either field is not a
time, because both fields are free text by design.

**8. The page ground is genuinely ambiguous.** The SVG says `#231F20`; the
designer's own exported PNG samples `#000000` at the same point. Use `#231F20`,
because the SVG is the editable master and that value is what the designer
typed — but record the discrepancy. On screen the difference is invisible; in
print it is a rich black against a flat one.

**9. Decide what an empty poster exports.** The other layouts differ on purpose:
the card and plain frames print "Upload a photo to begin", and the search
screen's empty cards print as plain artwork because four photographs in six
cards is a composition. This layout has ONE photo slot and one code slot, and an
export missing either is an unfinished poster rather than a choice — so a
placeholder that prints is defensible here. Whatever you choose, put preview-only
chrome in `drawGridChrome()` or its equivalent, never in `paint()`.

## While you are in there

The upload placeholder on every editor is now a control: clicking the words
opens the file picker. See `docs/implementation/UPLOAD_PROMPTS_ARE_CONTROLS.md`.
Both new slots here should do the same, hit-testing the shape that is actually
drawn rather than its bounding box.

If you add any input positioned over the preview, its COMPUTED font size must
not fall below 16px or iOS zooms the page when it is focused. The search
screen's inline search bar solves this with a transform; copy that rather than
rediscovering it.

## Definition of done

- The layout renders in both colourways, and switching between them changes no
  geometry.
- The photograph and the code image both upload through the one mime gate that
  already exists, drag to reposition, and resize.
- Every export format produces the poster: PNG, JPG, PDF, SVG and PPTX.
- The SVG export matches the canvas at sampled points in BOTH colourways.
- A catalog card exists, `CATALOG_ITEMS` in `js/admin.js` agrees with it, and
  the catalog-empty count in `index.html` is updated — the suite checks all
  three.
- `node tests/verify-layout.js` passes. Section 4 will report your new catalog
  card until you commit; that is expected and clears on commit.
- An implementation document exists in `docs/implementation/`, and
  `docs/DOCUMENTATION_INDEX.md` points at it.

## Do not

- Do not bundle either supplied font.
- Do not fetch the scannable code at runtime.
- Do not put any file from the artwork folder inside `site/` unless it is an
  asset the served site actually needs; the publish directory is served verbatim.
- Do not add a second photo store. There is one `photos` array and it is indexed.
- Do not trust a screenshot-free verification. Render it and look at it. The
  most recent mistake on this codebase measured a poster's colours correctly,
  passed the whole suite, and was obviously wrong the moment a human saw it.
