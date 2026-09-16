# The Music Player Poster: Movable Scan Code, Caption, and a Chosen Heart

Date: September 13, 2026
Status: Implemented

## Summary

Three additions to the `player` layout, from a reference showing the same
poster arranged differently: the scan code above the song title rather than
below the buttons, two lines of text under the transport row, and a heart the
visitor colours.

| File | Change |
| --- | --- |
| `js/poster.js` | `playerFlow()`, `codePos`, `caption`, `heartColour`, `cleanColour()` |
| `poster.html` | four controls in the player's field block |

## The page has no slack, and that governs everything

Worth stating first, because every decision below follows from it. Below the
album there are 378.05 points, and the artwork spends every one:

    album bottom            463.84
      -> title baseline      57.28
      -> controls end       182.43
      -> code top            15.67
      -> code bottom        115.20
      -> page                 7.47   = 378.05 exactly

Nothing here is padding that can be borrowed.

## Moving the code is a SWAP, and nothing resizes

Put the code under the album with the same 15.67 gap it has above itself at the
foot, leave the artwork's own 57.28 between it and the song title, and slide
everything from the title down by the difference. The numbers come out exact:
the shift is 130.87, and the controls come to rest at **834.42**, which is
precisely where the code's bottom used to be. The page margin is still 7.47.

So the album keeps its size, the code keeps its size, and every gap is one the
artwork already set. Verified by measuring the drawn pixels rather than the
intent -- a flat block in each slot, scanned for its bounding box, in all four
combinations:

    foot, no caption   album 415.80 x 422.75   code 460.46 x 114.86  at y 719.21
    top,  no caption   album 415.80 x 422.75   code 460.46 x 114.86  at y 479.88

Same album, same code, different y. **An earlier version of this failed that
check** -- it made the code compact whenever it moved up, which is a resize
wearing a swap's clothes, and the measurement caught it where reading the code
had not.

## The caption is the one thing that costs something

Two optional lines under the transport row, at the song title's left edge.
A two-line caption needs about 52 points plus a gap, and there are none spare,
so they come out of the code: `codeCompact`, 192 by 48, keeping the artwork's
4:1 because the box crops what is dropped into it and a code cropped out of
proportion does not scan. That 48 is also what the reference itself draws --
its code band is about a twentieth of the page where ours is an eighth.

The compact size is used in BOTH positions, so switching position with a
caption present still resizes nothing:

    top,  caption      album 415.80 x 422.75   code 191.91 x 47.51  at y 479.88
    foot, caption      album 415.80 x 422.75   code 191.91 x 48.11  at y 775.14

The code is the only element that gives way, because it is the only optional
one whose size carries no information.

## playerFlow(), and why the glyph list had to be split

`playerFlow()` works the whole arrangement out once, in page points, and both
painters read it -- so the shift cannot be applied in one and forgotten in the
other. `albumRect()` and `codeRect()` remain the only way anything reaches
those two boxes, which is why `slotAt()`, `rectForSlot()`, the selection ring,
the framing slider and the upload prompt all followed the code to its new
position without being touched.

`PLAYER_ART.chrome` held the chevron AND the five transport glyphs in one list.
That was fine while nothing moved. It is not fine now: the chevron belongs to
the top of the screen and the glyphs belong to the controls row, so a single
list slides the chevron down the page with the play button. Split into
`chevron` and `transport`, and the parity check samples both -- the glyphs at
their moved position, the chevron at its original one.

## The heart is a choice, not a theme token

`PLAYER_THEMES.accent` was `#55BA5D` and fed exactly one thing, the heart. It
is red now, and `state.heartColour` overrides it.

The override lives in `playerTheme()` rather than in the two colourways, and
that placement is the point: recorded inside them, a visitor's colour would
have to be set twice and would be lost the moment they switched between dark
and light. Layered over whichever theme is showing, it survives -- verified by
setting `#7b2ff7`, switching to light and back, and sampling the heart at each
step. The copy is deliberate too: `Object.assign({}, base, ...)`, because
`PLAYER_THEMES` is shared and a painter writing into it would change the other
colourway as a side effect.

## cleanColour(), and why a colour needed a sanitiser

Not cosmetic hygiene like `cleanLine()`. The value goes into `ctx.fillStyle`
AND into a `fill="..."` attribute in the exported SVG, so an unchecked string
is markup written into a file somebody then opens. Only the two hex forms a
colour input can produce are allowed; anything else returns "" and the caller
falls back to the theme's accent. Lower-cased, so the same colour cannot be
stored two ways and compare unequal.

**Testing it through the control proves nothing**, which is worth recording.
`<input type="color">` coerces every invalid value to `#000000` before any of
our code sees it -- `red`, `url(#evil)` and `#fff" onload="alert(1)` all arrive
as black. The path that matters is localStorage, which has no input element in
front of it. Poisoned directly:

    heartColour: '#fff" onload="alert(1)'   -> falls back to #e93625
    codePos:     '../../evil'                -> falls back to "foot"

Neither reaches the canvas or the export.

## Verified

- All four combinations rendered and compared against the reference.
- Album never resizes; code identical across the swap in both caption states.
- Canvas and SVG agree at twelve shape points within 1/255, sampled at the
  SHIFTED positions for everything below the code and at the unshifted one for
  the chevron.
- The chosen colour reaches both painters and appears once in the export.
- Heart colour survives a dark/light/dark round trip.
- Hostile values via localStorage rejected on the read path.

## Not done

- **The caption is two fixed lines**, not a wrapping block. A long second line
  sets smaller rather than running on, the same call the song title makes.
- **Adding a caption shrinks the code.** It is the honest consequence of a page
  with no slack, and it is visible and reversible, but it is a resize the
  visitor did not directly ask for.
