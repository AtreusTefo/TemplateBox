# Coding Agent Brief: The Heart Collage Music Poster

Date: September 16, 2026
Status: Brief. Nothing built yet.
Source: one reference image, supplied with this brief. There is no artwork
file, no SVG and no font.

Build the supplied design as the poster editor's TENTH layout: a script
greeting over a heart-shaped collage of photographs over a music block.

The music block is NOT new work. The instruction that came with this brief is
explicit: reuse the one already in this project, the "Now Playing, Music
Poster" layout. Section 4 is the whole of what that means and is the longest
section here, because "reuse" has a precise answer and two ways to get it
wrong.

Read the whole brief before writing anything. Section 1 cannot be got wrong.

---

## 1. Before anything else: the reference is somebody's private photograph

It is not an artwork file. It is a photograph of a framed print, **held in
somebody's hand**, and it carries:

- **Fourteen photographs of one identifiable private individual.** Not the
  file, not a crop of it, not a thumbnail derived from it, not a colour sampled
  from a face.
- **A real track**, named on the print and encoded in the scan code beside it.
  The track name, the artist, the code's bars and anything derived from them
  stay out. A scan code is a machine-readable link to a real account's content;
  reproducing one is worse than quoting the title.
- **The room**: a hand, a floor.

None of it may enter this repository -- not in code, not in a comment, not in a
sample, not in a test fixture, not in a catalog card, not in a commit message,
and not in a file name. They are deliberately not quoted here.

**What you MAY take is the layout**: the three blocks, their proportions, the
type roles and the vertical rhythm.

### The Spotify mark is not yours to draw either

The reference's music block carries a Spotify logo and a Spotify code. **Do not
draw either.** The editor already has the right answer and has had it since the
music poster shipped: the code is a box the visitor drops their OWN image into
(`CODE_SLOT`, the `#p-code-fields` upload), so the mark that appears is the one
they brought. Keep that exactly. Do not add a logo path, do not generate a
code, and do not name the service in a label, a hint, a card title or a file
name -- the existing controls say "Scan Code" and that is the wording to match.

---

## 2. Derive a clean design. Do not trace this photograph

This is the second reference in this family that is a photograph of a framed
print rather than an artwork file, and the method it forces is now written
down. **Read `docs/implementation/ANNIVERSARY_DEFINITION_POSTER.md` sections 2
and 3 before you start** -- it is the same problem, it was solved eight days
ago, and it records which kinds of number survive a perspective transform and
which do not.

The short version: the frame is held at an angle, so any LENGTH you read off
this image is a length times an unknown projective transform. What survives is
ratios taken near the centre, symmetries, and coincidences such as two things
sharing an edge.

What I measured, so you do not have to measure it twice. The image is 736 x
920. Treat all of this as a **starting position to check**, not as gospel:

| Thing | Reading |
| --- | --- |
| The print, in the image | x 84 to 684, y 120 to 830 -- 600 wide by 710 tall |
| Its aspect | 0.845 wide-to-tall, against A4's 0.707 |
| The music block's column | x 236 to 534 -- 298 wide, **49.7 per cent of the print width**, and centred on it (its centre is 385 against the print's 384) |
| The greeting | x 253 to 513 -- 43 per cent of the width, centred |

And the vertical rhythm, as a fraction of the print's height measured down from
its top edge:

| Band | Top | Bottom |
| --- | --- | --- |
| The greeting | 3.0% | 14.1% |
| The collage | 17.5% | 62.5% |
| The scan code | 68.2% | 74.4% |
| The track title row | 79.2% | 82.4% |
| The progress bar | 84.5% | 85.5% |
| The time | 86.1% | 87.0% |
| The transport row | 88.3% | 93.9% |
| Foot margin | | 6.1% |

**The aspect is the trap, and it is the same one as last time.** The print is
squarer than A4, and every paper size this editor offers is 1:sqrt(2), so
carrying these proportions straight onto an A4 design space leaves vertical
slack. The last poster in this family spent that slack at the foot in its first
build and rendered as a composition that had slid up the page. Decide where
yours goes deliberately, render it, and write down which.

---

## 3. The three blocks

### The greeting

A script face, one line, centred, with **small pink hearts scattered around
it** -- roughly six, at two or three different sizes, some filled and some
outlined, clustered to the left of the first word and the right of the last.
They are about 1.3 per cent of the print's width, so they are punctuation
rather than decoration. Sampled through the print's lighting they come back
around rgb(157,105,145) and rgb(169,119,163), which is a soft pink read through
a warm cast -- pick a clean pink rather than reproducing those values.

`SCRIPT_FACE` is the editor's stand-in for a script (Petit Formal Script over
Playfair Display), already loaded and already used by the anniversary, birthday
and love posters. Use it. `SCRIPT_SIZE_ADJUST`, `hbdFont()` and `hbdFit()` go
with it. Do not add a webfont.

The hearts: `HEART_PATH` and the `loveHeart()` / `loveHeartSVG()` pair already
draw a heart at any size in either painter. Use them rather than a third copy.

### The collage

**Fourteen tiles in a heart, mirror-symmetric about a centre column**, each
photograph set inside a **white border with a soft drop shadow** -- they read as
loose prints laid down, not as a grid.

The arrangement, read off the reference: five columns at the top, from the
outside in -- a small tile, a large tile, the taller centre column, a large
tile, a small tile -- each column holding two tiles stacked. Then one small tile
either side below the centre, then two small tiles side by side at the point.
The top profile is what makes it a heart: the two large columns are the lobes
and stand highest, the centre column sits lower between them, and the small
outer columns lower still.

**The editor already has a heart collage and it is NOT this one.**
`ANNIV_COLLAGE` in the anniversary poster is eighteen borderless boxes in a
different arrangement. Reusing those boxes would be reproducing the anniversary
poster's heart with a music block under it. What you SHOULD reuse from it is
everything around the boxes: `scaleBoxes()`, `ANNIV_COLLAGE_BOX` as the pattern
for fitting a collage's own bounding box to a target rectangle, the slot
machinery, and `drawCoverImage()`.

The white border and the shadow are the two things no existing layout draws.
Both have to work in BOTH painters, and the shadow is the harder half -- canvas
has `shadowBlur`/`shadowColor`, SVG needs an `feDropShadow` or a
`feGaussianBlur` chain in a `defs`. Whatever you choose, prove the two agree by
rendering both and differencing them, and set
`color-interpolation-filters="sRGB"` on any SVG filter you write. That last one
is not decoration: it cost 44 levels per channel the last time it was left out,
and the miss is invisible in the preview.

### The music block

Section 4.

---

## 4. The music block: what "reuse the music poster" actually means

The existing `player` layout draws all of it already: a scan code, a track
title, a heart, a progress bar with a knob, a time, and a transport row of five
glyphs. **Reuse the artwork and the state. Do NOT reuse the numbers.**

### Reuse these, unchanged

| Thing | Where |
| --- | --- |
| The five transport glyphs, the play triangle, the heart | `PLAYER_ART` |
| The heart's colour, which the visitor picks | `state.heartColour`, `playerTheme()` |
| The song title, and the two times | `state.song`, `state.elapsed`, `state.total` |
| Where the knob sits | `playedFraction()` |
| The scan code's slot and its upload | `CODE_SLOT`, `#p-code-fields` |
| Shrink a line to fit | `fitLine()` |

### Do NOT reuse these

`PLAYER`'s geometry -- `title`, `track`, `time`, `play`, `code`, `codeGap`,
`albumToTitle` -- is a full-page phone screen on a 597.45 x 841.89 page with a
416-point album at the top. This poster has no album at all and its music block
is a band across the lower third at **half the page width**. Every number in
`PLAYER` is wrong here. Its comment says that page has no slack and that every
number is spent; that is true of a page this layout is not drawing.

### The trap: those paths are in PAGE coordinates

`PLAYER_VIEW` is `[0, 0, 597.45, 841.89]` -- the whole page. Each glyph's `d`
carries its absolute position on the player's page, and `drawArt()` places a
group by scaling that page-sized viewBox. So calling
`drawArt(c, PLAYER_ART.transport, 0, 0, W, H, ink)` on your layout puts the
transport row exactly where the PLAYER puts it, scaled to your page. That is
not where this design wants it.

You need each glyph's own box. I measured them for you, by rasterising the
paths at the player's page size and bounding the ink, so there is no
transcription to get wrong:

| Glyph | x | y | w | h |
| --- | --- | --- | --- | --- |
| transport, the whole group | 92 | 653 | 416 | 34 |
| shuffle (paths 1-3) | 92 | 655 | 34 | 25 |
| previous (path 4) | 183 | 653 | 28 | 30 |
| next (path 5) | 388 | 654 | 28 | 30 |
| repeat (path 6) | 472 | 654 | 36 | 33 |
| playIcon | 289 | 651 | 26 | 30 |
| heart | 470 | 506 | 40 | 37 |
| chevron | 101 | 24 | 17 | 11 |

Two things to notice in that table. **The transport group is six paths and five
glyphs** -- the first three are the shuffle, and a loop that assumes one path
per glyph will draw four. And the group is centred on the play disc: 92 + 416/2
is 300, and `PLAYER.play.cx` is 299.62.

### The trap behind the trap: it is not a uniform scale

The obvious fix is to map the whole transport group's box onto your row with
one translate and one scale. **Measure before you do**, because the reference's
row is not the player's row at a different size. Each glyph as a fraction of
its own row's width:

| Glyph | In the reference | In the player |
| --- | --- | --- |
| shuffle | 6.8% | 8.2% |
| previous | 5.5% | 6.7% |
| play disc | 13.7% | 17.3% |
| next | 5.5% | 6.7% |
| repeat | 6.8% | 8.7% |

Consistently about 0.8. The reference's glyphs are smaller within their row and
the gaps between them correspondingly wider. So place them individually against
this layout's own row -- a helper that draws one `PLAYER_ART` part into an
arbitrary destination rectangle, given its source rectangle from the table
above, is what this needs, and both painters must call the same one.

### The arrangement is one the player already has

In the reference the code sits ABOVE the title and the transport row at the
foot. That is `CODE_POSITIONS.top`, "Above the song title", which the player
already supports and already has a control for. Say so in the write-up rather
than presenting it as new.

### The rest of the music block, measured

All x values in the image's own pixels, against a print running x 84 to 684:

- **The column** is x 236 to 534. The progress bar spans it exactly; everything
  else is set inside it.
- **The code** is x 245 to 513 -- 268 wide, so inset from the column rather than
  filling it. A round logo 45 wide, a 15 gap, then 22 bars across 209.
- **The title** is flush with the column's left edge at 236 and runs to 401. A
  filled heart sits at 505 to 525, near the column's right edge.
- **The transport glyphs** are centred at 248, 315, 385, 455 and 521 -- the play
  disc on the column's centre line.
- **One time, not two.** The reference prints the track length at the right of
  the bar and nothing at the left. The player draws both. Decide which this
  layout does and write down why.
- **No artist line.** The reference has none. `state.artist` exists and is
  shared; decide whether this poster draws it, and if it does not, do not show
  the control for it.

---

## 5. The fields, and the control panel trap that is waiting for you

The new text this layout owns is the greeting, and that is all. Everything else
in the music block is `state.song`, `state.elapsed`, `state.total`,
`state.heartColour` and `state.codePos`, all of which already exist.

**Here is the trap.** Those controls live in `#p-player-fields` in
`site/poster.html`, which `syncDocControls()` gates on
`style.layout === "player"`. Showing that whole block on this layout would also
show **Screen Mode**, which is the PLAYER's colourway select and would do
nothing here -- and this file has already shipped that exact defect once. Its
own comment records it: widening `#p-grid-fields` for the collages "put a dead
Screen Mode on three posters", and a visitor "reached the first Screen Mode
they saw and it did nothing".

So split the block rather than widening it: the music-block fields that both
layouts share in one `#p-*-fields`, the player's own colourway in another. The
heart colour picker is inside `#p-player-fields` too and this layout needs it,
so it moves with the shared half. `#p-code-fields` is already shared -- it is
gated `!player && !anniv` today and needs this layout adding to that list.

Also: this layout takes a BATCH of photographs, so it shows `#p-batch-fields`
and hides `#p-photo-fields`, the same swap the four collages make. Do not widen
`#p-grid-fields`, which is the search screen's block.

Register the greeting with `noteText()` so it is editable on the preview, as
every other layout's fields are.

---

## 6. Slots

Fourteen collage tiles plus the scan code.

**`slotsFor()` is not optional.** `SLOT_COUNT` is the photos array's LENGTH,
and three separate bugs in this file have come from reading it as "slots a
visitor can reach". Add a `FIRST` / `EXTRA` pair the way the other five
collages do; `COUPLE_EXTRA` / `COUPLE_FIRST` is the most recent and the one to
copy.

**Tile 0 is slot 0**, so a photograph carries across from the card, the player
and the other collages. The other thirteen take fresh indices rather than
sharing another layout's -- a slot is a place in ONE design, and a visitor who
arranged eighteen photographs into the anniversary heart should not find
fourteen of them redistributed through this one.

The scan code reuses `CODE_SLOT`, because it is the same kind of thing the
player and the anniversary poster already put there.

`uploadTargets()` has one branch listing the collage layouts by name; add this
one to it rather than writing a second allocator.

---

## 7. While you are in there

- A catalog card in `site/index.html`, the matching entry in `site/js/admin.js`,
  and the `catalog-empty` count corrected. **The count is a moving target** --
  it reads 52 today and more than one session works on this repository. Count
  the cards yourself with `grep -c 'class="template-card"' site/index.html`.
- **The card's title must match the registry's exactly.** Suite section 1
  checks that pair, and it is the one defect in this family that no amount of
  looking would have found.
- A `.mock-doc` tile in `site/css/style.css`. What identifies this design at
  thumbnail size is the heart of tiles over a row of code bars -- lead with
  those. **Pick a fresh `mk-` prefix**: `mk-an-`, `mk-col-`, `mk-cp-`,
  `mk-hbd-`, `mk-inv-`, `mk-lb-`, `mk-li-`, `mk-lv-`, `mk-tb-` and `mk-tr-` are
  taken. A generic name in a file this size is a collision waiting to happen --
  a tile's bullets were once called `dot` beside an existing `.dot`, and a
  function was once called `renderNotice` in a file that already had one. Both
  failed silently.
- Controls in `site/poster.html`, in their own `#p-*-fields` block, plus the
  split described in section 5.
- The suite has 15 sections; yours would be 16. Section 10 opens a poster export
  and looks inside it, and section 15 is the closest model for what a new
  layout's check should look like -- it reads the SVG export as markup and
  samples both painters as numbers. Extend the suite if this layout can fail in
  a way nothing currently catches; the tile borders and the drop shadow are the
  obvious candidates, being new drawing in two painters.

---

## 8. Definition of done

- The poster matches the reference in layout and rhythm, checked by RENDERING
  it and comparing, not by reading the code back.
- Fourteen photographs upload, frame and export; a batch fills them in order;
  each one can be zoomed and panned in its tile; the scan code fills separately.
- The tile borders and shadows look the same in the preview, the PNG and the
  SVG.
- The transport row, the play disc, the heart, the bar and the time land where
  this design puts them and not where the player's page does.
- Both colourways render, and an empty collage is legible in each.
- The greeting wraps or shrinks sensibly and is editable on the preview.
- No dead control on any layout: check the music poster still shows exactly
  what it showed before, and that this one shows nothing that does nothing.
- `node tests/verify-layout.js` passes. Section 4 fails while your work is
  uncommitted -- that is the working-tree-versus-HEAD comparison and it clears
  on commit; check its differences are confined to the pages listing the
  catalog.
- Nothing from the reference is anywhere in the repository: no photograph, no
  track name, no artist, no scan code, no service mark -- including in comments,
  samples, test fixtures, tile content and commit messages.
- A write-up in `docs/implementation/`, and an index entry in
  `docs/DOCUMENTATION_INDEX.md`. Record which numbers were derived and which
  were measured, because for this design most of them are derived.

---

## 9. Do not

- Do not trace the photograph. It is projectively distorted and you will build
  a trapezoid.
- Do not present derived numbers as measured ones.
- Do not copy `PLAYER`'s geometry. Reuse its ART and its STATE.
- Do not draw a Spotify logo, generate a scan code, or name the service.
- Do not write a second collage, wrapper, photo-framing model, heart path or
  script-font helper.
- Do not widen `#p-player-fields` or `#p-grid-fields` to reach a control.
- Do not copy the reference image, the photographs in it, the track, or the
  code.
- Do not add a webfont, a server call, or any third-party runtime.
- Do not use `innerHTML` for any visitor string.
- Do not put working files inside `site/`.
- Do not use emojis anywhere -- code, comments, documentation or commit
  messages.
