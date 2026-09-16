# Warped Zones: Selection Chrome and Upload Prompt Drawn in the Wrong Space

Date: September 4, 2026
Status: Fixed

## Issue Title

On a perspective print zone the "Upload your design" panel covered the zone's
bounding box instead of the print surface, and the selection box, its four
resize handles and the rotate handle were painted hundreds of pixels away from
where they could actually be grabbed.

## How they were found

Both came out of building `banner-rollup-angled`, the second warped template.
Neither is that template's fault: both shipped with the perspective work in
`0f2c3f6` and both were reproduced on `card-white-duotone` before anything was
changed.

The static suite was clean throughout -- these are not things it checks.

The first fault was found by comparing the editor's canvas against an
independently composited `base x overlay` reference and finding 16,220 pixels
that disagreed. The second was found while trying to verify the four gestures
by pressing where the handles are drawn, rather than where the earlier
verification computed they should be.

## Fault 1: the upload prompt covered the bounding box, not the surface

### Root cause

`drawLayersInArea()` in `js/mockup.js` draws the empty-state prompt -- a
`#F4F3EF` rounded rectangle with a dashed border -- over `area`, which callers
derive from `zoneBounds(zone)`. For a rectangular zone the bounding box IS the
zone, so this was correct for the first fourteen templates and stayed invisible.

A warped quad is not its bounding box. On the angled banner the quad covers
700,446px of a box that reaches 21px above the vinyl onto the top rail, past
the cassette at the foot, and out over the transparent surround.

The consequences were not cosmetic:

| Where | What happened |
| --- | --- |
| Top rail | painted over with the flat prompt panel |
| Cassette and feet | same, at the foot of the banner |
| Transparent surround | **filled opaque**, so an export of an untouched template carried a solid block |

Measured on the angled banner before the fix: **16,220 pixels that should have
been clear were opaque**, and the clear count came to 800,498 against the
photograph's own 816,718.

On `card-white-duotone` the same fault put 511,428px of prompt panel across
both card quads and the terracotta-and-sage backdrop between them.

### Fix applied

`site/js/mockup.js` -- new `zonePath(context, area, radius, zone)` builds the
quad's path when the zone is warped and the existing rounded rectangle when it
is not, and both the prompt fill and the artwork clip now go through it.
`drawLayersInArea` takes the zone as a fourth argument; the two callers that
have one pass it, and the drawn products' call is unchanged.

The prompt's text is centred on the quad's **centroid** rather than the box's
centre, because on a tilted surface those are different points and the box's
one can sit off the product.

### Verification

| Template | Prompt px outside the print surface, before | after |
| --- | --- | --- |
| `banner-rollup-angled` | 16,220 | **0** |
| `card-white-duotone` | 511,428 spanning both quads and the backdrop | **0** |

The banner's clear-pixel count went from 800,498 to **816,583** against the
photograph's 816,718; the remaining 135 are the dashed border straddling the
quad edge, which is the same half-line-width bleed a rectangular zone has
always had.

Rectangular zones are byte-identical: on `banner-rollup-white` the prompt's
bounding box measures exactly `[205, 128, 819, 1344]` against a declared zone of
x 205..820, y 128..1345, with **zero** pixels outside it. The drawn `mug`, which
passes no zone at all, still draws its rounded 320x300 panel.

## Fault 2: the selection chrome was drawn in sheet space

### Root cause

This is the sharper of the two, because the pointer maths was never wrong.

On a warped zone `renderSheet()` records each layer's hit rect in **sheet
space**, and `toZoneSpace()` carries a pointer back into that space to test it.
That pairing is correct and is what makes a warped quad grabbable at all.

`drawOverlay()` then took the same `layer.rect` and drew it **straight onto the
canvas** -- `rectCorners(layer.rect)` with no mapping. Sheet coordinates painted
as canvas coordinates.

So on the angled banner, with a design at scale 40:

| | Where it was drawn | Where it actually was |
| --- | --- | --- |
| Top-left handle | (165, 435) | **(418, 504)** |
| Bottom-right handle | (384, 929) | **(637, 965)** |

Every handle was visible where it could not be grabbed, and grabbable where it
could not be seen. Pressing the drawn box deselected the layer, because the
press landed on empty canvas.

### Why the earlier verification passed

`PERSPECTIVE_ZONES_AND_DUOTONE_CARDS.md` records corner resize and rotate as
verified, and that record is honest -- the gestures do work. It says how they
were tested:

> Each gesture was tested by solving the **forward** homography independently in
> the test and computing where the handle should be on screen, rather than
> asking the editor where it thought its own handles were.

Pressing a computed position exercises `toZoneSpace`, which is correct, and
never looks at `drawOverlay`, which is not. The method that made the test
trustworthy is exactly the method that could not see this. Recorded because the
lesson generalises: **not trusting the code under test is right, but a check
that avoids its output entirely cannot see a fault in its output.**

### Fix applied

`site/js/mockup.js`:

- **`unwarpTransformFor(zone, area)`** -- the same homography solve with source
  and destination swapped, giving sheet space back out to canvas space.
- **`zoneUnwarp[]`**, stored beside `zoneWarp[]` in `drawWarpedDesign` and
  cleared with it in `paint()`. It is solved **only when the inverse solved**,
  so a degenerate quad leaves both directions empty rather than mapping the
  chrome by a transform the pointer maths is not using.
- **`fromZoneSpace(pt, zoneIndex)`** -- the exact inverse of `toZoneSpace`, and
  a no-op returning the point untouched when the zone has no transform, which
  is what keeps every flat template unchanged.
- **`drawOverlay`** maps the four corners, the rotate handle and the rect's
  centre through it. The resize glyph's angle is measured from the mapped
  centre so the arrow still points out of a box perspective has skewed.

A rotated rectangle on a tilted plane projects to a general quad, not to a
rectangle, so drawing the mapped corners as a closed path is the outline's true
shape on screen rather than an approximation of it.

### Verification

The four expected handle positions were computed by solving the forward
homography independently, then the drawn chrome was measured against them:

| Handle | Expected canvas position | Distance to nearest drawn chrome |
| --- | --- | --- |
| Top-left | (418, 504) | **0 px** |
| Top-right | (635, 513) | **0 px** |
| Bottom-right | (637, 965) | **0 px** |
| Bottom-left | (419, 979) | **0 px** |

Then every gesture was driven by pressing **where the chrome is drawn**, which
is what a visitor can actually aim at:

| Gesture | Result |
| --- | --- |
| Press on the tilted face | selected -- chrome 0 -> 16,618 px, scale field 75 -> 110 |
| Press off the product | deselected -- chrome back to 0 |
| Move | 282,372 canvas px changed, against **0** for a drag starting off the quad |
| Corner resize | scale 40 -> 57 |
| Rotate | ink principal angle **-89.88 deg -> -49.16 deg** |

`card-white-duotone`'s chrome now lands on the card it belongs to -- bounding
box [389, 222, 1117, 735] around zone 0's [453, 247, 1042, 650] -- instead of
near the sheet origin.

Flat templates are untouched: on `banner-rollup-white` the chrome still
surrounds the declared zone rect, and `fromZoneSpace` returns early for every
one of them.

## Two things that were tested and were not faults

Recorded because both looked like defects and cost time.

**The face's alpha rises from 253 to 255 under a multiply overlay.** That is
inherent to the compositing formula -- `ao = as + ab(1 - as)` reaches 255 for
any opaque source -- and not something the overlay can avoid. Against a
saturated background it changes the render by at most **2 levels**, mean 0.15.

**Two stray design pixels landed outside the quad** at alpha 1 and alpha 4,
single isolated pixels from the warp's edge filtering. Invisible, and not worth
a clip.

## Related files

- `site/js/mockup.js` -- `zonePath`, `drawLayersInArea`, `unwarpTransformFor`,
  `fromZoneSpace`, `zoneUnwarp`, `drawOverlay`
- `docs/implementation/PERSPECTIVE_ZONES_AND_DUOTONE_CARDS.md` -- the work these
  shipped with, and the verification method that could not see fault 2
- `docs/implementation/ANGLED_ROLLUP_BANNER_MOCKUP.md` -- the template that
  surfaced both
