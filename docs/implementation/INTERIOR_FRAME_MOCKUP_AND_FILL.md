# Interior Framed Poster, and designScale

Date: September 1, 2026
Status: Implemented

## Summary

`frame-black-interior` is the eighth photographic mockup template and the first
set in a styled room rather than shot against nothing. Adding it exposed two
things that were wrong across the templates already shipped, and both are fixed
here:

- Uploaded artwork opened at 75% and could not be made to fill a poster or a
  card without dragging. `designScale` fixes that.
- Every print zone had been derived from the classified mask, which sits inside
  the real product edge wherever a surface meets something dark. That showed as
  a rim of bare paper once artwork filled.

## The template

1122x1402, aspect exactly 0.800, so the thumbnail is a straight downscale.
Opaque scene, `mode: "surface"`, no Background panel -- the room IS the product.

**Three maps, not seven, and no `light`.** No colourway, so no
garment/tone/grain. `light` is omitted because this poster's specular headroom
is 3.4 luma levels (median 243.3 against a 246.7 ceiling), which the map then
normalises across the full 0-255 range -- so it encodes noise, not surface.
Screened onto a flat #808080 fill it measured sd 9.35 and a p1-p99 spread of 34
at the 0.3 every other template uses, against a baseline sd of 0.44 with no map
at all. Confirmed in the live engine after removal: sd 0.41, spread 1.

**The restriction is load-bearing by design here**, not as a safety net. The
whitewashed floor, cream candles and skirting all pass the classifier -- 2634
regions -- and 30.56% of classified pixels are dropped. What keeps the poster
separable is the wide black frame: the nearest other classified pixel is 272px
away at mid-height, far beyond the 6px dilation. A thin frame would have let
the mask swallow the room.

`displaceStrength` is 2. The whole gradient lives at the rebate: inside the
opening the displacement magnitude measures p50 1.4 and p99 3.2 out of 127,
while the outer 60px band saturates. The interior renders identically at every
strength from 2 to 14, so 2 is chosen for the edge alone.

## designScale

A new registry key. Omitted means 0.75, which is right where artwork is printed
ON a product -- a chest graphic filling its print area edge to edge does not
read as a t-shirt. `"cover"` fills the zone whatever the artwork's aspect,
which is what a poster, a banner and a business card all want.

It only sets the STARTING scale. The fit underneath stays contain and Design
Size scales back down, so nothing an uploader supplied is lost. Applied to
`wood-a4`, `frame-black-interior`, `banner-rollup-white` and
`card-white-walnut`; the four apparel templates keep 0.75.

**The first upload is counted per SURFACE, not per mockup.** On the two-card
template the first design dropped on the back card is layer two overall, so
counting globally gave it `EXTRA_SCALE` and a stagger offset: it arrived at
0.350 and off-centre instead of filling, which is the opposite of what the
surface switch promises. Now 1.627, matching the front.

## The zones were all measured from the wrong thing

Every zone had been derived from the classified mask. The classifier gates on
`luma > 110`, and wherever a light surface meets something dark the shadow at
that boundary dips under it -- so the mask stops short of the real edge:

| Zone | True surface | Was | Short by |
| --- | --- | --- | --- |
| Frame opening | x 276..845, y 270..1067 | 286..836, 278..1059 | 4-9px |
| Banner face | x 205..819, y 128..1346 | 211..813, 134..1340 | 6px |
| Card A | x 525..1871, y 575..1400 | 529..1868, 578..1397 | 3-4px |
| Card B | x 525..1871, y 1563..2390 | 529..1868, 1567..2386 | 3-4px |

Invisible while artwork sat at 75%. Visible as a bright rim the moment it
filled.

The true edge is found by walking raw luma OUTWARD from the surface's centre.
Walking inward from the image border instead reads whatever prop it meets
first -- on the interior frame that returned left 201 and right 948, which are
the wall and the gold stems, not the frame.

**Whether a zone may overshoot depends on what surrounds it.** The frame's
surround is its own black border, so lapping onto it reads as a print sitting
flush. The banner's surround is transparent and the card's is walnut, so a zone
a pixel wide of either would paint artwork into empty space or onto the desk.
Those two sit exactly ON the edge; the frame's spans the full extent.

## The trapezoid that was tried and taken back out

The interior frame leans back, so its opening is really a trapezoid: top and
bottom perfectly horizontal at y=270 and y=1067, but the sides slant, 563px
wide at the top against 578px at the bottom. A rectangle cannot fit that -- it
either bares paper at the bottom or laps the frame at the top.

The exact quad was tried. It fits perfectly and was reverted, because a
non-rectangular zone routes to the perspective warp, which returns before the
shading pass AND leaves every layer without a hit rect. No hit rect means no
selection chrome at all: no drag, no resize grip, no rotate handle. **Rotation
exists only as a canvas drag** -- there is no sidebar control for it -- so the
warp path does not degrade rotation, it removes it. Scale survives because the
sidebar has a slider, which is what made the loss easy to understate.

The zone is now the smallest rectangle containing the trapezoid. Artwork laps
8-9px onto the black frame at the top, tapering to nothing at the bottom, which
is far less visible than bare white against black.

The general lesson: the warp path costs more than its own comment suggests, and
is only worth taking where direct manipulation genuinely does not matter.

## One limitation left, on the banner

The banner keeps a 4-6px strip of bare vinyl on its RIGHT edge only; left, top
and bottom measure 0. Displacement samples outward there -- the light runs from
upper-left, so the shading gradient pushes that way -- lands past the design's
clip on the sheet, and the shader discards it.

This is inherent to displacement at any zone boundary and cannot be fixed by
moving the zone: extending it further would paint artwork into the transparent
space beside the banner. Halving `displaceStrength` from 10 to about 5 would
halve the strip, at the cost of the fold realism that value was tuned for. Left
as it is, and recorded here rather than silently accepted.

## Verification

- Frame: fills for portrait, square and landscape uploads; selection chrome
  present (10,094 chrome pixels), shading active, no white paper at five
  heights down both edges.
- Banner: 0px fringe on left, top and bottom; 4-6px on the right, measured
  per row.
- Card: both surfaces fill independently (1.631 and 1.627), all eight edge
  probes artwork, wood between untouched.
- `node tests/verify-layout.js`: 1252 passed, 1 failed -- the failure is
  section 4 reporting `index` taller than HEAD, which is this commit's own
  catalog card and resolves once it lands.

## Related

- `docs/implementation/ROLLUP_BANNER_MOCKUP.md`
- `docs/implementation/TWO_ZONE_BUSINESS_CARD_MOCKUP.md`
- `docs/error-fixes/MOCKUP_EDITOR_AUDIT_AUGUST_2026.md`

## Update: September 2, 2026 -- the overhang is masked now

Widening the zone to kill the white gutter left the other half of the trade in
place: 6,341 pixels of artwork sat on the frame's black border, worst at the top
(8px left, 7px right, tapering to 2px and 1px at the bottom) because the aperture
is a trapezoid and the zone has to stay a rectangle. The template now declares an
`overlay` -- the base with the aperture punched out -- so the frame is redrawn over
the artwork. Both faults are gone and the zone is unchanged. Full measurements:
`docs/error-fixes/MOCKUP_PRINT_ZONES_OVERHANGING_THEIR_SURFACE.md`.
