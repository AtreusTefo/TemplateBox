# The Song Poster

Date: September 16, 2026
Status: Done

The poster editor's tenth layout: a script greeting over a heart of fourteen
bordered photo tiles, over a music block. Built from the brief in
`docs/project/HEART_COLLAGE_MUSIC_POSTER_PROMPT.md`.

It is the first layout in `site/js/poster.js` that reuses another layout's
whole BLOCK rather than only its helpers, and section 3 is most of the work.

## 1. What is not here, and will not be

The reference is a photograph of a framed print held in somebody's hand. It
carries fourteen photographs of one identifiable private individual, a real
track named on the print, and a scan code that is a machine-readable link to
that track.

None of it is in this repository. The starting copy is the editor's own: the
greeting is a generic one, and the song title is `DEFAULT_SONG`, which already
said "Song Title" before this layout existed.

**The Spotify mark is not drawn either**, and that needed no decision because
the editor already had the right answer. The code is a box the visitor drops
their own image into -- `CODE_SLOT`, the existing `#p-code-fields` upload --
exactly as the music poster and the anniversary poster already do. No logo
path was added, no code is generated, and no label names a service.

## 2. Measured, because the perspective was undone

**This section replaces what it first said.** The layout was built the ninth
poster's way -- derive proportions, do not trace a skewed photograph -- and
then, asked to match the reference more closely, the perspective was removed
instead and the design was measured properly. The numbers at `TUNE` are
measurements now, not estimates, and the first build's were wrong in ways no
amount of careful eyeballing was going to catch.

### Undoing the projection

The frame's four edges were found by sampling each side at many positions and
fitting a line through the inliers, which needed two corrections worth keeping:

- **The bottom edge is a bright ridge, not a dark dip.** The light falls from
  above, so the top inner bevel shades and the bottom one catches. A detector
  looking for darkness found two sides out of four; one looking for the
  steepest GRADIENT found all four.
- **The left rail is behind a hand**, so it is sampled only above it.

The four corners then give the camera's focal length and the print's true
aspect through the standard closed form for a rectangle under perspective, and
the homography follows. Focal 2456, and the check that it worked is that the
round mark on the scan code comes back ROUND -- an anisotropic error would have
made it an ellipse.

### What the rectified print then said, and what it changed

| Thing | First build | Rectified | Effect |
| --- | --- | --- | --- |
| Collage, as a fraction of the page width | 84 per cent | about 76 | the collage was too big, then over-corrected to 65 before settling |
| Music block, as a fraction of the collage | 0.59 | 0.718 | the music block was too narrow for its collage |
| Gap, collage to music block | 0.10 collage-heights | 0.48 | far too tight; the blocks were crowding each other |
| Title cap height, against the music column | 5.9 per cent | 8.5 | the track title was too small |
| The greeting's hearts | invented offsets | seven hearts at measured places | they floated; they hug the words now |
| The tile border | 4.5 points | 3 | the collage read as a grid rather than a stack |
| The collage's own rows | close | within half a per cent | the lobes, the cleft and the point all sit where the reference puts them |

The collage's own proportions survived unchanged, which is the one piece of
luck in this: 1.284 wide-to-tall against the rectified 1.284.

### What still cannot be matched, and why

- **The print is not A4.** Rectified it is about 0.64 wide-to-tall against A4's
  0.707, so the reference's own vertical rhythm does not fit the page at any
  size that fills it. Scaled to fit the height exactly, the collage comes out
  at 65 per cent of the page width and the poster looks lost in its margins;
  scaled by width it overflows. The gaps are compressed instead -- the greeting
  to the collage, and the collage to the music block -- because a gap is the
  most forgiving thing on a page to lose a few points of, where a block is not.
- **The script face is not the reference's.** Petit Formal Script is what this
  editor has; the reference's face has taller capitals for the same width. The
  greeting is matched on WIDTH, which is what sets its weight on the page, and
  the hearts are then placed in units of the greeting's own cap height so they
  hug the words whatever face draws them.
- **The reference's tiles overlap and are slightly rotated**, the way prints
  laid on a table are. These abut squarely. Overlapping cards cannot be drawn
  as the single silhouette the shadow depends on (section 5), so this is a
  deliberate simplification and not an oversight.

### One number that is not the reference's

**The scan code box is 4:1, where the reference's visible logo and bars are
nearer 6:1.** The player's own comment says why and the reason holds here: the
box crops what is dropped into it, and a code cropped out of proportion does
not scan. The 6:1 is the ink without the file's white padding, and the padding
is what makes the file 4:1. Verified by uploading a 640x160 code and confirming
the round mark and every bar survive.

That decision costs height -- a 4:1 box is taller than the 5:1 the ink needs --
which is part of why the gaps above and below the music block are tighter here
than in the reference.

## 3. The music block is the music poster's

The brief's instruction was to reuse the "Now Playing" poster rather than draw
a second one. Reused: `PLAYER_ART`'s glyph paths, `state.song`,
`state.elapsed`, `state.total`, `state.heartColour`, `playedFraction()`,
`fitLine()` and `CODE_SLOT`. **Not reused: any of `PLAYER`'s geometry.** That
page is a phone screen with a 416-point album at the top; this is a band across
the lower third at half the width, and every number in `PLAYER` is wrong here.

### The trap: those paths are in PAGE coordinates

`PLAYER_VIEW` is `[0, 0, 597.45, 841.89]` -- the whole page. Each glyph's `d`
carries its absolute position there, so `drawArt()` can only put a group back
where the player had it. `tuneGlyph()` maps ONE glyph's own box onto a
destination centre and width instead.

Those boxes were measured by rasterising the paths at the player's page size
and bounding the ink, rather than retyped:

| Glyph | x | y | w | h |
| --- | --- | --- | --- | --- |
| transport, whole group | 92 | 653 | 416 | 34 |
| shuffle (paths 1-3) | 92 | 655 | 34 | 25 |
| previous (path 4) | 183 | 653 | 28 | 30 |
| next (path 5) | 388 | 654 | 28 | 30 |
| repeat (path 6) | 472 | 654 | 36 | 33 |
| playIcon | 289 | 651 | 26 | 30 |
| heart | 470 | 506 | 40 | 37 |

**The transport group is six paths and five glyphs**: the first three are the
shuffle. A loop that assumes one path per glyph draws four things and a narrow
shuffle, which is what check 16i exists for.

### The trap behind the trap: it is not a uniform scale

Mapping the whole group with one transform would have been the obvious fix and
is wrong. Each glyph as a fraction of its own row's width:

| Glyph | Here | In the player |
| --- | --- | --- |
| shuffle | 6.4% | 8.2% |
| previous | 5.1% | 6.7% |
| play disc | 12.8% | 17.3% |
| next | 5.3% | 6.7% |
| repeat | 7.5% | 8.7% |

Between 0.75 and 0.86 of the player's, and the repeat glyph is the one that
does not follow the others -- which is the argument for placing them one at a
time, at `TUNE_ROW`'s five measured fractions of the music column, rather than
scaling the group by any single factor.

### What the reference arranges that the player already had

The code sits ABOVE the title here and the transport row at the foot, which is
`CODE_POSITIONS.top` -- an arrangement the music poster has had a control for
since it shipped. This layout does not offer that control, because its code
position is fixed by its design; see section 4.

### One time, not two

The reference prints the track length at the right of the bar and nothing at
the left, and this follows it. **The elapsed field is not dead for being
unprinted** -- it is half of what puts the knob on the bar, through the same
`playedFraction()` the player uses -- and the control block says so rather than
leaving somebody to wonder.

## 4. The control split, which is the part that could have gone silently wrong

`#p-player-fields` held the song, the times, the heart colour, the artist, the
colourway and the code position, gated on `layout === "player"`. The one-line
change was to widen that gate.

**It would have put a dead Screen Mode on this poster**, plus an artist line it
does not print and a code-position select that changes nothing here. This file
has shipped that exact defect once: its own comment records that widening
`#p-grid-fields` for the collages put a dead Screen Mode on three posters, and
that "a visitor reached the first Screen Mode they saw and it did nothing".

So the block is split three ways:

| Block | Holds | Shown for |
| --- | --- | --- |
| `#p-music-fields` | song title, both times, heart colour | the music poster and the song poster |
| `#p-player-fields` | artist, Screen Mode, scan code position, the two caption lines | the music poster |
| `#p-tune-fields` | greeting, Screen Mode | the song poster |

`#p-code-fields` was already shared and gained one more layout in its gate.

The heart colour moved into the shared block deliberately: it is one heart
colour for one visitor, not one per layout, and `tuneHeartColour()` reads
`state.heartColour` directly rather than through `playerTheme()`, which would
have dragged the player's colourway along with it.

Checks 16c to 16f assert both halves of this -- that the song poster reaches
everything it needs and NOTHING that belongs to the other poster, and that the
music poster lost nothing in the split.

## 5. Two things this layout draws that nothing else did

### The bordered tile, and its shadow

Each tile is a card in the theme's `card` colour with the photograph inset by
a 3-point border.

**Three, not four and a half**, and the number is measured rather than chosen:
the tiles abut, so two borders are the entire gap between one photograph and
the next, and the reference's gap measures 11 pixels across an 835-pixel
collage. That is 1.3 per cent, which is 6 points on this collage and therefore
3 a side. At 4.5 the collage read as a grid of separated tiles where the
reference reads as a stack of prints -- the same shape of error as getting the
tile positions right and the gutters wrong. The tiles ABUT rather than standing apart: laid with a gap
they read as fourteen pictures on a wall, and touching they read as a stack of
prints, which is what the reference is.

**That decision is what makes the shadow subtle.** A filter on an SVG group
shadows the group's composite, so fourteen abutting cards cast ONE silhouette.
Filling them one at a time on the canvas drops each card's shadow onto the card
beside it and stripes the collage. The two painters would have disagreed in a
way that is obvious side by side and invisible in either one alone.

So the canvas builds all fourteen rectangles into a single path and fills it
once. A non-zero fill of abutting rectangles IS that silhouette.

**And then check 16k failed, in the other direction.** The canvas seam came
back a clean 255 and the EXPORT came back 245: a group of abutting `<rect>`s is
not the same shape as their union, because each rect antialiases at the shared
edge, so the composite's alpha dips along every seam and the drop shadow draws
a faint line down each one. Ten levels -- invisible in the export alone and
plain against the preview.

The SVG emits one `<path>` of fourteen rectangles now, which has no internal
edges to antialias and is exactly the shape the canvas fills. Measured after:
the seam column reads 220, 223, 255, 255 in both painters, identical.

Worth keeping as the general lesson: "make both painters draw the same thing"
is not satisfied by both drawing the same RECTANGLES. The canvas's one fill and
the SVG's fourteen rects were the same picture until a filter was put over
them, and then they were not.

The other half of the same problem: `stdDeviation` in the SVG filter is **half**
the canvas `shadowBlur`, because canvas spreads a shadow over roughly twice the
Gaussian deviation. The same number in both would put a shadow in the export at
twice the softness of the one in the preview. And
`color-interpolation-filters="sRGB"` is spelled out for the reason the ninth
layout spells it out.

### The hearts hang off the greeting, not off the page

`TUNE_HEARTS` gives each of the seven a side and an offset measured outwards
from the greeting's own extent, so they travel with a longer or shorter word
instead of being run into by it.

Their positions and sizes are the reference's, taken off the rectified print
and expressed in units of the greeting's cap height rather than in points.
That matters because the two faces disagree: the reference's script has taller
capitals for the same width, so hearts placed at its absolute offsets floated
above this one's words. In cap units they sit where they sit in the reference,
straddling the capitals' tops, whatever face draws the greeting.

## 6. A defect this build surfaced in four existing posters

**The script face had never loaded.** `SCRIPT_FACE` is the editor's stand-in
for Monotype Corsiva, chosen and written up on the grounds that the previous
stand-in, Playfair Display, "is not close" -- and it never reached the page.

`document.fonts.ready` resolves when every PENDING font load has finished, and
a webfont that no DOM element uses is never pending. `SCRIPT_FACE` is used by
the canvas alone. Nothing requested it, so it never loaded, so the canvas fell
back -- to Playfair Display, the very face it was chosen to replace.

Measured rather than inferred: `document.fonts.check('16px "Petit Formal
Script"')` returned **false** on a loaded page, and an explicit
`document.fonts.load()` for the same family returned **true**. The anniversary,
birthday, tribute and love posters have all been drawing their script text in
the fallback since they shipped.

The fix is one request, and two things about it are deliberate:

- **It runs on `load`, not at script time.** `poster.html` fetches the webfont
  stylesheet with `media="print"` and flips it in its own `onload`, so at IIFE
  time the `@font-face` rule may not exist yet and asking for the family finds
  nothing to ask for. Tried at script time first; it failed exactly that way.
- **It repaints on success only.** A face that will not load must leave the
  poster drawing in the fallback, which is what it did before.

This is wider than the layout that found it, and it is here rather than in a
separate change because the greeting cannot render as designed without it.
Check 16b guards it, and guards it by MEASURING -- the greeting's width in the
script against its width in the fallback, because `check()` answers about the
font set and not about what the canvas would draw.

## 6b. Three faults reported after the first build

All three were real, and two of them were the same fault.

**Clicking the scan code on the preview did nothing.** `openUploadFor()` maps a
slot to the file input that fills it, and it had no branch for this layout, so
it fell through to `p-image` -- the single Photo Upload, which this layout
HIDES. Clicking a hidden input does nothing at all. The same fall-through broke
a click on any empty TILE, which was not reported but was equally broken: both
now route to `p-image-code` and `p-image-grid` respectively.

That is worth naming as a class. `openUploadFor()` is a per-layout lookup with
a default, and the default is another layout's control rather than nothing --
so a layout that forgets to register fails silently instead of loudly.

**There was no way to remove the scan code.** `#p-code-fields` had an upload
and nothing else, and the only route back to an empty code box was clearing the
browser's storage. It has a Remove button now, disabled when there is nothing
to remove, and it serves all three layouts that carry a code because
`#p-code-fields` is shared.

**Replacing an image with the SAME file silently did nothing.**
`bindPhotoInput()` cleared `input.value` on failure but not on success, and a
file input only fires `change` when the selection changes -- so re-picking the
file you have just corrected and re-exported did nothing the second time. It is
cleared on success too now. This one was not specific to this layout: it
affected every upload in the editor.

Driven rather than asserted: a click on the code opens `p-image-code`, a click
on an empty tile opens `p-image-grid`, the code box goes from the empty tone to
ink on upload, back to the empty tone on Remove, and to ink again when the same
file is picked a second time.

## 7. Slots

Fourteen tiles plus the scan code. `TUNE_EXTRA` and `TUNE_FIRST` follow the
rule the other five collages set: tile 0 is the left lobe's crown and IS slot
0, so a photograph carries across from the card, the player and every other
collage; the remaining thirteen take fresh indices rather than sharing the
anniversary heart's eighteen. Both are hearts and they are not the same heart.

The hit test runs FORWARDS, because nothing overlaps. It tests the CARD rather
than the photograph, so a click on a tile's white border still finds its tile,
while `rectForSlot()` returns the INNER rectangle, because that is what a drag
measures against. The two answers differ by the border and both are wanted.

## 8. Testing

`node tests/verify-layout.js`: **1644 passed, 1 failed.** The one failure is
section 4, the working-tree-versus-HEAD comparison, whose differences are the
homepage's feed and main growing by the height of one card. It clears on
commit.

One intermediate run also failed `index @1600: exactly 1 ad band mounts` with
"got 0 -- rail=false leaderboard=false anchor=false", and it is recorded here
rather than dropped. It did not reproduce on the next run, and it cannot have
been caused by this work: between the green run and it, the only files that
changed were `js/poster.js`, restored byte-identical to what the green run had
used, and one message string in the suite. `index.html`, `js/ads.js` and
`style.css` were untouched. A band mounts only once the external script has
actually filled a placement, so "none mounted" is that script not serving --
which is the same class of external flakiness the nav-timeout entry in
`docs/memory/PROJECT_STATUS.md` already records for this section.

Section 16 is new. It asserts the two things this layout can fail at that
nothing else in the suite would see, and it measures both from PIXELS rather
than trusting the code:

- **The transport row.** Five glyph runs found by scanning the row's band, at
  this design's own centres within 4 points, with the leftmost at least 16
  points wide, and the export agreeing with the canvas within 2. A row placed
  by `drawArt()` would land at the player's coordinates and still render and
  still export.
- **The shadow.** A seam between two abutting cards, and a point below the
  lowest tiles where nothing but shadow can be, sampled in both painters and
  required to agree. **This one failed on its first run and was right to** --
  see section 5. It was written expecting the canvas to be the one that
  striped, and it caught the export instead, which is the argument for
  checking a thing rather than reasoning about it.
- **The control split**, both halves, plus the script face by measurement.

Driven by hand as well:

| Driven | Result |
| --- | --- |
| Fourteen photographs as one batch | filled 1 to 14 in reading order |
| A 640x160 scan code | the round mark and all bars survive the 4:1 box |
| Both colourways, empty and full | white cards read on both grounds |
| Canvas against SVG across the collage | 400 interior pixels differ at a worst of 17, which is the photo scaler rounding; everything else is tile-edge antialiasing |
| The shadow samples | identical in both painters, after 16k caught the seam |
| The control split, from the page | song, times, heart and code reachable; artist, Screen Mode and code position not |
| The greeting | **found the script face had never loaded, on any poster** |
| The first render | found the tiles too far apart and the time colliding with the repeat glyph |

### Broken on purpose

Two changes, both of them things somebody might plausibly make:

| Break | Caught by | Reported |
| --- | --- | --- |
| The script-face request deleted | 16b | `check: false` -- the face was never requested |
| `TUNE_GLYPHS.shuffle.parts` cut from three paths to one | 16i, and 16h | "leftmost glyph is 7.8 points wide, expected about 20" -- and the row's first centre moved 6.4 points, because a third of the shuffle's ink is missing |

Nothing else in section 16 moved, so both breaks are localised to the checks
written for them. The second one is worth noting: reducing the shuffle failed
16h as well, which is the row-position check earning its keep on a defect it
was not written for.

## 9. Files

- `site/js/poster.js` -- the `tune` entry in `FRAME_STYLES`; `TUNE`,
  `TUNE_TILES`, `TUNE_HEARTS`, `TUNE_GLYPHS`, `TUNE_ROW`, `TUNE_THEMES`;
  `tuneTheme()`, `tuneHeartColour()`, `tuneRects()`, `tuneInner()`,
  `tuneSlot()`, `tuneMusic()`, `tuneCodeRect()`, `tuneGlyph()`,
  `tuneGlyphSVG()`, `tuneRowAt()`, `tuneParts()`, `tuneDrawHeart()`;
  `paintTune()` and `tuneSVG()`; `loadScriptFace()`; and the extensions to
  `slotsFor()`, `slotName()`, `slotAt()`, `rectForSlot()`, `uploadTargets()`,
  `LIVE_FIELDS`, `snapshot()`, `restore()`, `persist()`, `migrate()` and
  `syncDocControls()`
- `site/poster.html` -- `#p-music-fields` split out of `#p-player-fields`, and
  `#p-tune-fields`
- `site/index.html` -- the catalog card, and the empty-search count
- `site/js/admin.js` -- the catalog entry
- `site/css/style.css` -- the `.mock-doc.poster.tune` tile
- `tests/verify-layout.js` -- section 16
