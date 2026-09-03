# Perspective Print Zones, and the Duotone Business Cards

Date: September 3, 2026
Status: Implemented

## Summary

`card-white-duotone` is the fifteenth photographic mockup template and the
first whose print surfaces are **not axis-aligned rectangles**. Two stacks of
business cards lie at different angles on a terracotta-and-sage diagonal, and
each card's face is a quadrilateral in perspective.

Getting there needed a change to `js/mockup.js`, because until today a
non-rectangular zone cost direct manipulation outright.

## The limitation, and why it was not fundamental

A warped zone is drawn by rendering the layers into an offscreen sheet and
warping that sheet onto the quad on the GPU. That pass is one-way. The file
said so itself:

> Direct manipulation is not offered on warped quads: mapping a pointer back
> into sheet space needs the inverse of the perspective transform, which the
> GPU pass above does not hand back. Layers keep no hit rect, so nothing on the
> canvas is grabbable and the sidebar controls are the only way to place
> artwork here.

The framed poster lost move, scale and rotate to exactly this and had to be
reverted to a rectangle, which is what forced the occlusion overlay it now
ships (see `MOCKUP_PRINT_ZONES_OVERHANGING_THEIR_SURFACE.md`).

But nothing about it was fundamental. The forward map is a **homography** fixed
by four corner correspondences, so the inverse is one too, and recovering it is
eight unknowns from eight equations.

## What changed

Four edits, all confined to the warp path. Rectangular zones never touch any of
it: `zoneWarp` stays empty for them and `toZoneSpace` returns the point
unchanged.

**1. `solveHomography(src, dst)`** — Gaussian elimination with partial
pivoting on the 8x8 system. A degenerate quad (three corners collinear, or two
coincident) returns null, which puts the zone back on the old behaviour rather
than producing nonsense coordinates.

**2. `toZoneSpace(pt, zoneIndex)`** — carries a canvas point into the zone's
own sheet space, or returns it untouched for a flat zone. The GPU pass composes
two steps, stretching the sheet to the full canvas and then warping that
rectangle onto the quad, so the inverse composes them the other way round; both
are folded into one matrix so the per-pointer cost is a single homography.

**3. `renderSheet` records hit rects now** (it passed `false` before). The
rectangles it writes are in **sheet space**, which is exactly what
`toZoneSpace` maps a pointer back into. Before the inverse existed there was
nothing to compare them against, so they were discarded.

This is the one edit that could have reached the other fourteen templates, so
it was checked rather than assumed: **`renderSheet` has exactly one caller**,
inside `drawWarpedDesign`. Rectangular templates never reach it.

**4. `hitTest` and the drag pipeline map per zone.** Each layer is compared in
its own zone's space, because a template may mix flat and warped surfaces and a
rectangle recorded in sheet space means nothing in canvas space. A drag records
`drag.zone` at pointerdown and every subsequent move is measured in that same
space -- mixing the two would send a drag off at an angle.

### The one approximation, stated

The handle hit tolerance is **not** rescaled into sheet space. It is exact for
a rectangle, and for a warp it is off by the quad's own foreshortening -- about
15% on these cards, which is invisible on a handle radius. A template with a
hard-angled quad would want the local Jacobian there instead. The comment in
the code says so at the point where it matters.

## Verified by driving the editor

Each gesture was tested by solving the **forward** homography independently in
the test and computing where the handle should be on screen, rather than asking
the editor where it thought its own handles were.

| Gesture | Result |
| --- | --- |
| Press on the card face | grabbed (this returned nothing before) |
| Move | ink box tracked the drag |
| Corner resize | grabbed; scale 40 -> 120 |
| Rotate handle | grabbed; ink principal angle 12.9 deg -> 67.4 deg |

Also: the design lands on its own quad and nowhere else -- 154,641px inside the
upper card against **0 on the lower one**, with 230px on the quad's antialiased
edge.

Two of those tests failed first and were wrong rather than the feature. The
corner press missed because a `designScale: "cover"` layer's corners sit
*outside* the sheet; the rotate press missed because earlier drags had left a
non-zero offset the arithmetic assumed away. Both are recorded because a test
that fails for its own reasons looks exactly like a feature that does not work.

## What a warped zone still does not get

`drawWarpedDesign` returns **before** the shading pass, so `displace`, `shade`
and `light` are never sampled. They are therefore **not declared** on this
template -- they would ship as dead weight -- and `grain` goes with them, since
it is only read when a colourway declares `heather` and a card palette has
none.

**Three maps instead of seven: 2.0MB instead of about 5MB.**

That omission is affordable on this photograph and would not be on every one.
The card faces measure a spread of just **10 luma levels** p1 to p99, against
32 and 16 on the two zones of `card-white-walnut`, because a rigid card lit
evenly has almost nothing to model.

The path to fixing it, if a warped template ever lands on a surface with real
shading: warp into the **fabric sheet** rather than straight to the canvas. The
maps are registered to the base photograph, so the existing shader pass would
then run over the warped design unchanged.

## The photograph

1122x1402, opaque scene, 0.8003 -- 4:5 to within 0.03%.

The dual tone is what makes it readable, and it was specified before the image
existed. A neutral half would have been masked *instead of* the cards:

| Surface | Luma p1/p50/p99 | Sat p1/p50/p99 |
| --- | --- | --- |
| Terracotta | 101 / 109 / 117 | 128 / 135 / 139 |
| Sage | 48 / 81 / 91 | 16 / 19 / 21 |
| **Cards** | **118 / 236 / 241** | **0 / 1 / 12** |

One half fails saturation, the other fails luma. The cards pass both.

### The corners

Found by fitting a line to each of the four edges from the face's boundary
pixels and intersecting adjacent pairs -- **not** by taking extreme points, which
are single antialiased pixels and are not the corners of a quad in perspective.
The faces were separated from the stacks' cut edges at luma > 200: the edges sit
around 140 and the faces at 236.

Both quads come out **1.78:1** against a business card's 1.75. That 1.8% is the
foreshortening, and it is the check that the corners are the real ones.

### The recolour mask is both stacks

Everywhere else this pipeline keeps only the region connected to the print zone,
which here would have kept one card and left the other white. The **two largest
regions** are kept instead: 188,561px and 169,777px, where the third largest is
93px of speckle -- so there is no judgement in the cut.

## Related files

- `site/js/mockup.js` -- `solveHomography`, `toZoneSpace`, the warp path, `hitTest`, the drag pipeline
- `site/js/mockup-templates.js` -- the registry entry
- `site/assets/mockups/print/business-cards/card-white-duotone/` -- three maps
- `docs/error-fixes/MOCKUP_PRINT_ZONES_OVERHANGING_THEIR_SURFACE.md` -- the framed poster's overlay, which exists because of the limitation this removes
- `docs/implementation/TWO_ZONE_BUSINESS_CARD_MOCKUP.md` -- the walnut card pair
