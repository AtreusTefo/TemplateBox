# The Music Player Poster

Date: September 11, 2026
Status: Implemented

## Summary

A supplied artwork -- a phone music-player screen on A4, in a dark colourway and
a light one -- is the poster editor's fourth LAYOUT, after the playing card, the
diagonal split and the search screen.

| File | Change |
| --- | --- |
| `js/poster.js` | the `player` layout: constants, glyphs, both renderers, two slots, two themes |
| `poster.html` | song, artist, the two times, the scan code and the screen mode |
| `css/style.css` | the catalog miniature |
| `index.html`, `js/admin.js` | the catalog card and its picker entry |

The visitor uploads album artwork and a scan code, types four lines, and picks a
dark or light screen. The brief this was built from is
`docs/project/MUSIC_PLAYER_POSTER_PROMPT.md`, and where the build departs from
it, the departure is recorded below.

## The source held both colourways at once

`spotify template.svg` is a `1173.44 x 841.89` artboard carrying BOTH themes
side by side: the light one is the dark one translated by `(+646.77, -6.10)`.
Only the dark theme is traced. The light one is `PLAYER_THEMES`, which holds
every colour and nothing else, so the two cannot drift apart in layout.

Geometry is in the artboard's own POINTS, as `SCREEN` does it -- every number can
be read straight off the source and checked, which forty divisions by `597.45`
cannot.

## The glyphs are the source file, in page coordinates

The five transport marks, the heart and the chevron are path data copied
verbatim and placed by a transform. That is `drawArt()`/`artSVG()`, already
built for the search screen's icons, with one difference worth knowing: those
icons carry their source files' own viewBoxes, and these are ALREADY in page
coordinates. So `PLAYER_VIEW` is the page itself and the placing transform is
just the page scale.

`drawArt()` and `artSVG()` gained an optional theme argument for this. They read
`screenTheme()` when none is passed, so the search screen is untouched.

**One glyph needs `fill-rule: evenodd`.** The repeat mark's class carries it in
the source, and filled nonzero it comes out as a solid blob with the arrow's
counter filled in. Same class of trap as the club pip's winding, and visible the
moment it is drawn. `parts` carries an optional `rule` now, honoured by both
renderers.

## Two slots, and where they live

The album is **slot 0** -- "the photograph" every single-photo layout uses -- so
switching between the card and the player carries the picture across the way it
already does everywhere else. The scan code is `CODE_SLOT`, appended last for
the same reason the account circle was: every index already in use keeps the
number it had.

Both are cover-fitted, draggable and resizable through the existing framing
controls, and both open their picker when clicked on the preview.

**That sentence was not true when it was written.** The framing controls held
slot 0 on every layout but the search screen, so the scan code could be dragged
and never resized, and a poster carrying a code and no album showed no framing
control at all. The search screen's card menu had meanwhile grown a phantom
"Card 8" -- this layout's scan code -- whose Remove button deleted it from the
other editor. Both came from reading `SLOT_COUNT`, the photos array's LENGTH, as
the number of slots a visitor can reach. Fixed by `slotsFor(layout)`; the
reasoning and the measurements are in
`docs/error-fixes/PHANTOM_CARD_EIGHT_AND_FRAMING_CONTROLS_ON_THE_WRONG_SLOT.md`.

It is worth recording HOW it shipped. Every claim under "Verified" below was
checked by measurement and every one of them held -- the clicks open the right
pickers, the export carries both images, the knob follows the times. None of
them exercised the SIZE SLIDER against the code, because the slider was not part
of what the player added. A feature inherited from the existing editor was
assumed to work rather than tried, and an inherited feature is exactly where a
new slot breaks something.

## The knob follows the times

The artwork's knob sits at 25.6 per cent of the track while its own times say
`1:07` of `5:07`, which is 21.8. That is hand placement, and a poster reading
`1:07` of `3:48` with the knob at four fifths is wrong in a way nobody has to
measure.

`playedFraction()` parses `m:ss` and `h:mm:ss`, and returns the artwork's own
figure when either field is not a time or the total is zero -- which it must,
because both fields are deliberately free text. A visitor may well want `--:--`,
and a field that refuses anything but digits would be an editor arguing with a
poster.

Measured with `1:07` of `3:48`: the knob's centre lands at 213.6pt against the
214.2 the arithmetic asks for.

## Three disagreements in the artwork, resolved rather than averaged

- **The two time baselines are 612.6 and 615.31.** They read as one row, so both
  are drawn on the first and the 2.7pt is discarded.
- **The left edge is 91.04, 92.2 and 93.97** for the album box, the progress
  track and the title. Those are KEPT. They are what the artwork looks like, the
  differences are under a millimetre on A4, and squaring them up would be
  redrawing somebody's poster rather than tracing it.
- **The page ground.** The SVG says `#231F20` and the designer's own exported PNG
  samples `#000000` at the same point. The SVG wins: it is the editable master
  and that value is what was typed. Invisible on screen, a rich black against a
  flat one in print.

## What was not shipped

**Neither supplied font.** `SansSerifCollection.ttf` is Microsoft's and
`helvetica-world-bold.ttf` is Linotype's; `site/` is the publish directory, so
bundling either is a redistribution this project has no licence for -- the same
call the card layout made about Algerian. The type is Inter, and `fitLine()`
measures each line and sets it down if it would reach the heart, because Inter
is not metrically identical to Helvetica and the heart cannot move.

**No music-service artwork at all, and no brand in the catalog title.** The scan
code reaches the poster only inside the visitor's own uploaded image, which is
their asset. The card is called "Now Playing, Music Poster", the way the search
screen's is called "Search Screen, Six Photos" rather than naming Google.

**Nothing is fetched.** A scan code's bars encode a track identifier: there is no
path to trace and nothing to compute from a song title. The obvious shortcut is
the service's own scannables endpoint, and it fails three ways here, each
sufficient -- it breaks the promise printed on every editor that nothing leaves
the device; it adds a third-party runtime dependency against Critical Rule 1;
and a cross-origin image TAINTS the canvas, so `toDataURL()` throws and every
raster export dies. It is an upload, and the hint says where to save the image
from.

## Where this departs from its own brief

The brief said a printable placeholder was defensible for the empty slots,
because this layout has one photo and one code and an export missing either is
unfinished. Built, that turned out wrong on both counts.

The **album's** empty state is the ARTWORK'S -- a white panel on the dark theme,
an outlined one on the light -- and it is a finished-looking design in the
source, so printing "upload a photo" over it would be the editor's furniture on
somebody's wall. The **code's** empty state is nothing at all, because a poster
without a scan code is an ordinary thing to want, which is the argument the
search screen's empty cards are built on.

Both carry preview-only prompts instead, in `drawPlayerChrome()`, which
`render()` calls and `paint()` does not.

One detail in that function is the whole reason it is worth reading: **the
album's prompt is drawn in the PAGE colour, not the ink.** On the dark theme
that panel is white, so ink-on-panel would be white on white. Getting this
backwards is how a prompt ends up correctly positioned and completely invisible,
which this editor did once already -- see the resume prompt in
`UPLOAD_PROMPTS_ARE_CONTROLS.md`.

## Verified

- Both themes render and match the supplied artwork side by side.
- The SVG export matches the canvas at seven sample points -- page, album,
  heart, play disc, play triangle, dimmed track, code -- worst difference 1/255,
  which is the embedded image's JPEG round trip.
- The exported file carries both images, the typed title, and NO preview prompt.
- Clicking the album opens the photo picker and clicking the code box opens the
  code picker; the page and the transport row do neither, and the cursor says
  which is which.
- The knob follows the two time fields, and falls back when they are not times.

## Two things the catalog tile got wrong first

Both were invisible to measurement and obvious on sight, which is becoming the
pattern worth recording.

- The play disc was an **ellipse**. `border-radius: 50%` on a box that is not
  square is not a circle, and the flex row gave it a width and a height that
  differed. It carries `aspect-ratio: 1` now.
- The scan-code strip was **left out**, on the reasoning that it would be grit at
  130px. It is 13.7 per cent of the tile's height, so leaving it out took a
  third of the tile with it and the result looked unfinished rather than
  minimal. Added -- and then its bars, at `flex: 1`, came out a tenth of the
  strip wide apiece and read as a row of pills rather than a code. They are thin
  with air between them now.

## Not done

- **The progress knob cannot be dragged on the preview.** It follows the times,
  which is where the intent actually lives.
- **The five transport marks are fixed.** Pause instead of play, or a filled
  shuffle, would each be a second glyph for a detail nobody reading the poster
  will register.
- **No third colourway.** `PLAYER_THEMES` would take one entry.
