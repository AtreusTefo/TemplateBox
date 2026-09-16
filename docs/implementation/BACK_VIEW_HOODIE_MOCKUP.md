# Back-View White Hoodie Mockup

Date: September 2, 2026
Status: Implemented

## Summary

`hoodie-model-white-back` is the eleventh photographic mockup template and the
second view-pair in the catalog, after `tshirt-model-white-back` earlier the
same day. It runs the full seven-map fabric pipeline and pairs with
`hoodie-model-white`, in the catalog since August 31, 2026.

Like the shirt pair it ships as its own registry entry and its own catalog card.
The registry keys templates by `id` and a card's `data-doc` is what opens the
editor on one, so a view without an id of its own cannot be reached.

Two things make this harder than the shirt's back, and both are recorded below:
the hood occupies the top of the print area, and the two hoodie photographs are
**not** at the same scale, so nothing could be carried across the way the
shirt's 69.6 px/in was.

## The base photograph

1024x1536, cut out on transparency, the same size as the front hoodie.

```
corner alpha              0, 0, 0, 0
clear (a<16)              517313  (32.9%)
semi                      18411    opaque 1037140
classified                835431  (53.12% of image, 80.6% of opaque)
connected regions         264, the largest holding 99.95% of classified pixels
garment luma p1/p50/p99   177 / 233 / 245
blown (luma>=253)         0  (0.000% of garment)
weave (grain) sd          2.98
```

The file arrived looking like it had a dark vignette backdrop with a white halo
around the model. It does not. Those pixels are fully transparent and merely
retain RGB: **449,932 transparent pixels carried non-black colour**, luma 0 to
235. They are invisible in a browser, and the derive step zeroes them -- which
is also what took the base from 3.99MB to 1.49MB. Worth knowing, because the
first look at such a file suggests it has to be re-cut and it does not:
`corner alpha 0, 0, 0, 0` plus a 32.9% clear count settles that in one
measurement.

Note also that no pixel in this image is alpha 255. The opaque body sits at
alpha 250-254, which the `a >= 250` gate catches and an `a === 255` gate would
have missed entirely.

### The hood is the whole problem

Worn up, a hood hides the print area and the head with it. Worn down but
bunched, its lower edge is ragged and unplaceable. The prompt asked for it
**down, flat, unbunched, with a clean lower edge, and not past the shoulder
blades**, because that edge is what bounds the print zone from above, and it can
only bound it if it is measurable.

It is. The row-mean profile over the central columns falls into a trough at
**y=560 (203.8)** and recovers to the body's steady 234-236 by **y=600**. That
trough is the hood's cast shadow; clear back begins at y=590.

This is the same kind of landmark the front hoodie's kangaroo pocket gave --
there a +16.24 row-mean step at y=895 that the zone had to stop above. On the
back the constraint sits at the other end: no pocket, so the bottom is free, and
the hood takes from the top instead.

### The other constraints, confirmed rather than assumed

| Band | Classified | Luma p50 | Sat p50 |
| --- | --- | --- | --- |
| hood / upper back | 100.0% | 236 | 10 |
| mid back | 100.0% | 232 | 10 |
| **jeans** | **0.0%** | **44** | 3 |

Hands and forearms: **0 of 589 probe pixels** classify. The mask stops at
y=1369 with nothing below it. The default `sat < 14 / luma > 110` gates are
unchanged -- hair fails luma, skin fails saturation, jeans fail luma.

## The scale is an estimate, and says so

The shirt pair could reuse the front's px/in because the two photographs
measured 0.26% apart on sleeve span. **The hoodie pair cannot.** The back model
is photographed noticeably smaller, and three rulers disagree about how much.

| Ruler | Compares | Says |
| --- | --- | --- |
| Torso run at five matched offsets above the waistband seam | back hoodie to front hoodie | 0.870 (spread 0.865-0.876) -> **31.8 px/in** |
| Waistband rib height (76px against 91px) | back hoodie to front hoodie | 0.835 -> 30.5 px/in |
| Widest skull row (270px against 532px) | back hoodie to back shirt | 1:1.974 -> 35.3 px/in |

The first two are hoodie to hoodie, use different axes -- one horizontal, one
vertical -- and agree to 4%. That agreement is the corroboration, since a
vertically stretched photograph would have split them. The third crosses two
unrelated photographs and two different people and inherits a second
calibration, so it is the outlier rather than the tiebreak.

**31.8 px/in** is used. The honest consequence: an 11% band on the scale means a
12x16in print could defensibly be up to 424x565 rather than the 382x509
shipped. What the chosen figure buys is that the back's print stays proportional
to the front's -- 432 x 0.870 = 376, against the 382 used -- which is what a
matched pair needs.

## Geometry

The centreline is **512**, and three independent spans agree on it to within
2.4px: hood rows 510.7, mid back 513.1, waist rows 512.8. That is a much
better-behaved photograph than the back shirt, where the collar and the hem
disagreed by 14px and the value had to be interpolated between them.

The lower bound is the body/waistband seam at **y=1292**, found as a spike in
vertical roughness: mean `|L(y) - L(y-3)|` over the central columns reaches
**27.83** there against a body reading 1.3 to 2.9. The ribbing below it does not
show on that measure, because hoodie ribs are vertical lines and register as
horizontal oscillation, not vertical.

The zone is **382x509**: a real 12x16in back print, taller than the front's
12x12 square because the back has no pocket eating its lower half. Its top sits
2in below the hood's lower edge and its bottom stops 124px (3.9in) above the
waistband seam.

Verified **100.0000% fabric, zero impure pixels**, with 65px clear on the left
and 73px on the right at the narrowest row. Unlike the back shirt, purity and
margins read identically before and after closing 1-D specks, so no stray pixel
is misreporting the clearance here.

## displaceStrength is 9, measured on the zone rather than the garment

This is the first value in the registry set by measuring the print zone instead
of the whole garment, and the change is worth recording because it applies to
every future template.

The rule until now was to scale the previous template's strength by the ratio of
global gradient p99. That gives `10 x 22.32/28.51 = 8`. But the global figure
counts the hood roll and the sleeve seams, and the print never touches either. A
garment that is lumpy somewhere the artwork does not go gets its print
under-bent.

What the eye actually sees is the offset delivered inside the zone, which is
`strength x zone_p99 / global_p99`.

| Template | Global p99 | Zone p50 | Zone p99 | Zone/global | Peak offset in zone |
| --- | --- | --- | --- | --- | --- |
| tee front, 16 | 32.22 | 2.73 | 21.38 | 0.664 | 10.62px (1.037% of width) |
| tee back, 27 | 17.34 | 0.84 | 6.83 | 0.394 | 10.64px (0.519%) |
| hoodie front, 10 | 28.51 | 0.58 | 5.71 | 0.200 | 2.00px (0.195%) |
| **hoodie back, 9** | 22.32 | 0.60 | 4.82 | 0.216 | **1.94px (0.169%)** |

The two hoodie zones are equally flat surfaces -- p50 0.58 against 0.60, p99
5.71 against 4.82 -- so the pair should bend a print equally, and 9 matches the
front's delivered offset to 3%.

The old method's answer was 8, one unit away, so nothing already shipped is
called into question by the change. But the zone figure is the one that
describes the print, and it is what should be used next time.

The table also settles a question the shirt pair raised. The back shirt at 27
delivers the same absolute offset as the front at 16 but half the fractional
one. That is correct rather than a shortfall: its zone is genuinely smoother
(p50 0.84 against 2.73) because a back has no chest folds, and a flatter surface
should bend a print less.

## lightGain is 0.3, measured on this base

A `#12305C` navy fill across the zone, source luma 44:

| Gain | p50 | p95 | Max | Print losing its blue identity |
| --- | --- | --- | --- | --- |
| 1.0 | 77.1 | 174.8 | 255.0 | 11.99% |
| 0.5 | 60.6 | 109.4 | 149.5 | 0.02% |
| **0.3** | **54.0** | **83.3** | **107.3** | **0.00%** |

## Verification

- Static suite: 54 passed, 0 failed
- Zone 382x509, 100.0000% purity, zero impure pixels
- Connected-region restriction dropped 7px; the mask was already one region
- Seven maps served 200; canvas sized to the base at 1024x1536
- Move, scale and rotate all working. Checked deliberately, because a
  non-rectangular zone routes to the perspective warp, which returns before the
  shading pass and nulls every hit rect -- that is how the interior frame lost
  scale and rotate. This zone is axis-aligned.

## Related files

- `site/js/mockup-templates.js` -- the registry entry
- `site/assets/mockups/apparel/hoodies/hoodie-model-white-back-*.png` -- seven maps
- `site/assets/thumbnails/product-mockups/apparel/hoodies/hoodie-model-white-back-thumb*.jpg`
- `site/index.html` -- catalog card, mega-menu item, card count
- `site/mockup.html`, `site/js/admin.js` -- the two menu mirrors and the admin thumbnail list
- `docs/implementation/HOODIE_MOCKUP.md` -- the front of this pair
- `docs/implementation/BACK_VIEW_TSHIRT_MOCKUP.md` -- the first view-pair
