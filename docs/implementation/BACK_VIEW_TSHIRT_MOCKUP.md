# Back-View White T-Shirt Mockup

Date: September 2, 2026
Status: Implemented

## Summary

`tshirt-model-white-back` is the tenth photographic mockup template and the
first that is a second **view** of a product already in the catalog rather than
a new product. It runs the full seven-map fabric pipeline and pairs with
`tshirt-model-white`, which has been in the catalog since August 18, 2026.

It ships as its own registry entry and its own catalog card, not as a variant of
the front one. The registry keys templates by `id` and a card's `data-doc` is
what opens the editor on a given template, so a view that has no id of its own
cannot be reached at all.

## The base photograph

2048x3072, cut out on transparency. Twice the linear size of every other garment
base here, which matters in exactly one place: `displaceStrength` is expressed
in base-image pixels.

```
corner alpha              0, 0, 0, 0
clear (a<16)              2520599  (40.1%)
semi                      72300    opaque 3698557
classified                2617493  (41.60% of image, 70.8% of opaque)
connected regions         438, the largest holding 99.88% of classified pixels
garment luma p1/p50/p99   184 / 232 / 247
blown (luma>=253)         202  (0.008% of garment)
weave (grain) sd          2.18
```

### The clause that did the work

**Short hair, cut well above the collar.** A back view puts whatever is on the
model's neck directly inside the print area, and there is no occlusion-mask
support: a ponytail, a bun or a hood would be painted over by the artwork and
disappear. This is the same failure the paper bag's rope handles and a hoodie's
drawstrings would have caused, and like those it had to be kept out of the
photograph rather than worked around afterwards.

The other two clauses carried over from the hoodie unchanged and were confirmed
rather than assumed: dark charcoal jeans (nothing else light in frame, so the
luma gate drops the trousers outright) and neutral studio light (so the
saturation gate can separate skin from fabric).

## The scale claim, and why it is a measurement

The whole entry rests on the two photographs being the same garment at the same
distance. That is a claim, so it was measured before anything was derived from
it, on two independent landmarks:

| Landmark | Front, in this base's coordinates | Back | Difference |
| --- | --- | --- | --- |
| Sleeve tip to sleeve tip | 966 x 2 = 1932 | 1937 | 0.26% |
| Hem | 1418 x 2 = 2836 | 2812 | 24px, 0.35in |

At that agreement the front's 34.8 px/in carries over as **69.6 px/in**, and the
print zone below is the same real 12x16in area the front uses.

The one landmark that does *not* transfer is the neckline. The front's zone is
measured from the bottom of the crew neck's front scoop (y=444, or 888 here);
the back's collar seam is at y=761, **1.8in higher**. Applying the front's own
"3in below the collar" rule to the back's own landmark is what puts the back
print higher in frame than the front print, which is also where a real back
print sits.

## Geometry

**Vertically**, the garment runs from the collar seam at y=761 to the hem at
y=2812 on the centre column band, 2051px or roughly 29.5in.

**Horizontally**, the centreline is **1029**, and it is interpolated rather than
taken from anywhere convenient. The collar and yoke rows average a midpoint of
1024.0 and the hem rows 1038.1 -- the torso leans slightly right as it falls --
and the zone's own mid-height sits 37% of the way between them. Two other
candidates were rejected because they disagree by enough to see: the frame
centre, 1024, and the armhole seams at x=447 and x=1570, whose midpoint is
1008.5.

A first attempt at the centreline by mirror-correlating the fabric mask was
discarded rather than trusted. With a half-width of 420px the whole window is
fabric at every candidate centre, so mask mismatch read 0.00% everywhere -- a
check that cannot fail -- and the luma variant simply walked to the bright edge
of the search range, measuring the lighting gradient rather than symmetry.

**The zone is 835x1114** at x 612..1446, y 970..2083. Verified **100.0000%
fabric, zero impure pixels**, with the factory classifier gates (sat < 14,
luma > 110) unchanged: the hair fails luma, the neck and forearms fail
saturation, and the jeans fail luma outright. The mask stops at y=2815, and a
probe of six columns beside the torso over 500 rows classified **0 of 2160**
pixels.

### The width is bounded by the arms, not the shoulders

From y~1740 down the forearms cut into the visible torso, and the contiguous
fabric run through the centreline narrows to x 549..1511. The 835px zone leaves
**63px clear on the left and 65px on the right** at the narrowest row.

The raw mask suggests 20px on the left, and that number is wrong: it comes from
a single stray pixel at (591, 1467). Closing 1-D non-fabric runs shorter than
8px before measuring is what shows the real margin. Worth remembering as the
mirror image of the bucket hat's lesson -- there the classified mask was too
tight to place a zone against because of edge shadow; here it was one speck
away from understating a healthy margin by a factor of three.

## displaceStrength is 27

Gradient p99 measured **17.34**, against the front's 41.5. Those two numbers are
not directly comparable, and the correction is the whole reason this value is
not simply the front's 16.

A Sobel measures luma change **per pixel**, so a base at twice the linear size
reads half the gradient for the same physical fold. Putting the back in the
front's coordinates gives 17.34 x 2 = **34.7 against 41.5**, a ratio of 0.836 --
a genuinely smoother surface, which is what a back is: no chest folds, and the
shoulder blades are broad and shallow.

The front spends 16/1024 = **1.56% of base width**. 1.56% x 0.836 = 1.31%, which
is 26.8px of this base.

Judged on the straight bars of the thumbnail lockup, which is where the eye is
least forgiving:

| Strength | Result |
| --- | --- |
| 16 | Bar edges stay too clean; the print reads as a decal |
| **27** | Edges settle into the knit; the ring stays round |
| 45 | The ring is visibly out of round and a stray speck appears |

At 1.31% it sits between the hoodie's 0.98% and the front's 1.56%.

## lightGain is 0.3, measured here

Not inherited. A #12305C navy fill across the zone, composed through this
template's own shade and light maps:

| Gain | p50 luma | p95 luma | Print that stops reading as blue |
| --- | --- | --- | --- |
| 1.0 | 61.4 | 192.1 | 11.90% |
| 0.5 | 52.7 | 118.1 | 0.00% |
| **0.3** | 49.3 | 88.5 | 0.00% |

Source luma is 44. At gain 1.0 the specular screen lifts the ink to more than
four times the luma it was given.

## The weave is the faintest in the catalog

2.18 luma levels, against the front's 3.78 and the hoodie's 4.11, barely over
the 2.0 floor the derivation warns at. A back has no chest folds to break the
light up, so the two heather colourways model the undyed fibre more faintly here
than on any other garment. That is a real property of the photograph and is
recorded rather than compensated for; faking it with a synthetic noise map would
put weave on the render that is not on the shirt.

## Asset weight

11.5MB across the seven maps, the heaviest template in the catalog -- but not an
outlier, and the extra resolution is not waste. `mockup.js` sizes its canvas to
`assets.base.naturalWidth`, so the export tracks the photograph: this template
exports at 2048x3072 where the front exports at 1024x1536.

| Template | Total |
| --- | --- |
| tshirt-model-white-back | 11,788 KB |
| bag-paper-white | 11,320 KB |
| card-white-walnut | 10,074 KB |
| cap-model-white | 9,062 KB |
| hoodie-model-white | 5,842 KB |
| tshirt-model-white | 4,803 KB |
| bucket-hat-white | 4,177 KB |

The single largest file is the 3.86MB grain map, which is high-frequency noise
and compresses badly. Downscaling the base to 1024x1536 to match the front would
cut the template to roughly 4.9MB; it was not done, because throwing away
resolution the photograph actually has cannot be undone, and a matched front/back
pair is better served by improving the front later than by degrading the back
now.

## Verified live

Served from `npx serve` at the repository root and driven in the browser.

- All seven maps return 200. The canvas sizes itself to 2048x3072.
- The first upload opens at 75%, contain-fit, centred: ink box margins measured
  L101 / R97 and T137 / B140 inside the zone. At 100% the artwork fills the zone
  edge to edge, overflowing by at most 15px where the displacement pushes edge
  pixels outward.
- **Move, scale and rotate all work.** This was checked deliberately rather than
  assumed: the interior framed poster lost scale and rotate outright when its
  zone became a trapezoid, because the perspective warp path returns before the
  shading pass and nulls every hit rect. This zone is a true axis-aligned
  rectangle (`zone[0].y === zone[1].y`, `zone[3].y === zone[2].y`,
  `zone[0].x === zone[3].x`, `zone[1].x === zone[2].x`), so the rect path runs.
  A pointer drag of (+180, +240) moved the ink box by exactly that and clipped
  it against the zone edge; a rotate-handle drag grew the axis-aligned bounding
  box from 510x670 to 770x826.
- All eight colourways appear in the colour popover. Navy confines cleanly:
  garment (23,31,51) at the shoulder, (28,38,61) at the sleeve tip and
  (28,38,62) at the hem, while hair stays (54,43,37), neck skin (217,148,113)
  and both forearms (141,101,83) and (156,106,87). Alpha stays 0 outside the
  cut-out.
- The catalog shows 27 cards, the empty-state message says 27, and both new
  thumbnails load at 600x750.

## Files

| File | Change |
| --- | --- |
| `site/js/mockup-templates.js` | New `tshirt-model-white-back` entry after the front tee |
| `site/index.html` | Catalog card, mega-menu item, card count 26 -> 27 |
| `site/mockup.html` | Apparel menu item |
| `site/js/admin.js` | `MEGA_MENU` mirror and the thumbnail template list |
| `site/assets/mockups/apparel/t-shirts/tshirt-model-white-back-*.png` | Base plus six derived maps |
| `site/assets/thumbnails/product-mockups/apparel/t-shirts/tshirt-model-white-back-thumb*.jpg` | Catalog thumbnails, 600x750 |

## Related

- `docs/implementation/FABRIC_DISPLACEMENT_APPAREL_MOCKUPS.md` -- the pipeline
- `docs/implementation/HOODIE_MOCKUP.md` -- the closest precedent
- `docs/implementation/BUCKET_HAT_MOCKUP.md` -- per-image classifier thresholds,
  which this template did not need
- `docs/implementation/INTERIOR_FRAME_MOCKUP_AND_FILL.md` -- the trapezoid zone
  that cost scale and rotate
