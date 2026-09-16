# White Hoodie on a Hanger, and the End of the Drawn Apparel

Date: September 3, 2026
Status: Implemented

## Summary

`hoodie-hanger-white` is the thirteenth photographic mockup template and the
second that **replaces** an existing product rather than joining the catalog.
The drawn vector `hoodie` -- a flat shape rendered by `drawHoodieBody` on a
1000x1000 canvas, with three colour dots on its card -- is gone, one day after
the drawn tee went the same way.

No model: the garment hangs on a slim black hanger against a warm plaster wall.

It is also the first template here whose scene is a **photographed background**
rather than a cut-out, and that turns out to be the interesting part.

## A warm wall behind a white garment, and why it works

Every previous garment template was cut out on transparency, so nothing
competed with the fabric. Here the wall fills 52% of the frame and is light,
smooth and neutral-ish -- the exact profile of the thing the classifier is
looking for. It cannot be separated by brightness:

| Surface | Luma p1 | p50 | p99 | Sat p1 | p50 | p99 |
| --- | --- | --- | --- | --- | --- | --- |
| Wall | 145 | 201 | 224 | **14** | 20 | 30 |
| Garment | 161 | 229 | 251 | 1 | 3 | **13** |

The luma ranges overlap outright: the garment's own shadows go down to 161,
well inside the wall's range. **Saturation separates them completely**, and the
factory gate of 14 lands exactly in the one-level gap between the garment's p99
of 13 and the wall's p1 of 14. No per-image tuning was needed -- but the gate
has no margin either, and the sweep says so:

| Saturation gate | Garment px kept | Wall px wrongly kept |
| --- | --- | --- |
| 12 | 740,785 | 162 |
| 13 | 747,318 | 288 |
| **14 (factory)** | **754,768** | **1,116** |
| 15 | 765,704 | 5,506 |
| 16 | 786,735 | 20,464 |

Raising the **luma** gate is not an alternative: from 110 to 190 it removes only
175 wall pixels while costing 40,123 garment pixels, because it takes the
garment's shadows before it takes the wall.

The 1,116 leaked pixels do not survive into the shipped mask. They are isolated
speckle rather than a bridge, so the connected-region restriction drops them:
the final garment mask is **756,327 pixels in one piece** plus nineteen
fragments totalling about 120 pixels, and only **66 pixels of it fall outside
the garment's bounding box** -- 0.0087%. The largest stray cluster is 24 pixels
on the hanger's hook. Recolouring tints those 24 pixels of a black hook, which
is not visible at any scale.

### The clauses that made the wall survivable

- **Slim black hanger on a small dark hook.** Black fails the luma gate
  outright rather than depending on saturation. The hanger touches the
  shoulders, so if it had classified, nothing downstream could have separated
  it -- the same trap the chrome rail set on the hanger tee.
- **Near-white fabric, not cream.** A true cream sits on the saturation gate.
  The garment measures p50 3.
- **Nothing else in frame.** One light neutral surface is a classifier problem;
  two is an unsolvable one.
- **No rail.** Asked for emphatically after the tee's generation added one
  anyway and it had to be cut out of the image by hand. This time there is
  none.

## The base photograph

1122x1402, opaque scene.

```
corner alpha              255, 255, 255, 255
clear (a<16)              0  (0.0%)
classified                756215  (48.07% of image)
connected regions         1953, the largest holding 99.56% of classified pixels
garment luma p1/p50/p99   161 / 229 / 251
blown (luma>=253)         1908  (0.252% of garment)
weave (grain) sd          4.28
```

1122x1402 is **0.8003 -- 4:5 to within 0.03%** -- so the catalog card is a
straight downscale with no crop.

Two numbers stand out against the rest of the catalog, and both come from the
same cause. **Weave 4.28 is the highest here**, past the front hoodie's 4.11:
directional daylight across brushed fleece records more nap than a flat studio
key does, and the heather colourways read better on this template than on any
other. **Blown pixels at 0.252% are also the highest** (the back shirt is
0.008%, the back hoodie 0.000%), which is the same directional light on the lit
side. Both are the trade the scene bought.

## Geometry

Both bounding features were found as vertical-roughness spikes on the centre
band, against a body reading 1.5 to 3.0:

| Landmark | y | Roughness |
| --- | --- | --- |
| Hood's V, bottom | 440 | 16.64 |
| **Kangaroo pocket, top seam** | **868** | **11.78** |
| Waistband rib, top | 1160 | 16.47 / 23.64 |
| Hem | 1248 | 11.36 |

The zone is **335x335** -- a 10x10in chest print at 33.5 px/in, centred on
x=566, leaving 60px above and 48px below. Verified **100.0000% fabric, zero
impure pixels**, with 94px of side clearance.

**10in, not the model hoodie's 12in**, and that is the garment rather than the
scale. This hood is oversized and hangs low, and the pocket sits high, leaving
428px of clear chest where a 12in print at this scale would need more.

### The scale is an estimate with an 11% band

| Ruler | This base | Model hoodie | Says |
| --- | --- | --- | --- |
| Waistband rib height | 88px | 91px | 35.3 px/in |
| Pocket seam to hem | 380px | 443px | 31.3 px/in |

**33.5 px/in** is used, between them. A third comparison was discarded rather
than averaged in: neckline-to-anything disagrees by 39%, because an oversized
hood's V is simply not the same landmark as a worn hoodie's collar. Averaging a
measurement of a different thing would have looked like more evidence and been
less.

## displaceStrength is 12, deliberately between the two clusters

Measured by the zone method: global p99 24.92, zone p99 7.38, so 12 delivers
**3.55px of peak offset inside the print, 0.317% of base width**.

| Template | Zone p50 | Zone p99 | Delivered |
| --- | --- | --- | --- |
| hoodie front, 10 | 0.58 | 5.71 | 0.195% |
| hoodie back, 9 | 0.60 | 4.82 | 0.189% |
| **hoodie hanger, 12** | **0.99** | **7.38** | **0.317%** |
| tee back, 27 | 0.84 | 6.83 | 0.506% |
| tee hanger, 16 | 1.39 | 5.59 | 0.504% |

Both of the catalog's arguments apply to this template and neither wins. It is
fleece, which is heavier and stiffer than jersey and should bend a print less --
that is what puts the two model hoodies at 0.19%. But its print surface is
measurably more structured than either of theirs, zone p50 0.99 against 0.58 and
0.60, because a garment hanging free drapes more than one stretched over a body.
Splitting them is the honest answer, and the grid agrees: at 8 the bars are too
clean for fabric this textured, and at 18 the ring flattens at its lower left.

## lightGain is 0.3

This base is the least sensitive of any garment here -- a `#12305C` navy fill
loses only **1.43%** of its blue identity even at gain 1.0, against 11.99% on the
back hoodie -- because the light map's headroom is 22.9 against a high median.
0.3 costs nothing (0.00% lost, p95 70.4 against a source of 44) and keeps the
whole apparel set on one number.

## No `background` key, and that is the point

The scene is opaque: all four corners read alpha 255 and not one pixel of the
image is clear. There is nothing behind the photograph for a colour to show
through, so the Background panel stays off. Eligibility is declared rather than
detected precisely so this cannot be got wrong.

That is the trade a scene buys: one good wall instead of any colour the visitor
likes. It was named before the photograph was generated, not discovered
afterwards.

## What retiring the drawn hoodie touched

More than the tee's retirement, because the tee's had moved things *onto* the
hoodie:

- **`drawHoodieBody` and `drawTshirtBody` are both deleted**, 76 lines. The
  tee's outline had outlived its own product by exactly one day: it survived the
  drawn tee's retirement only because the drawn hoodie drew itself on top of it,
  so retiring the hoodie is what finally made it dead code.
- **`currentProduct` and `paint()`'s fallback are `"mug"`.** They were `"hoodie"`
  -- moved there yesterday so cold start stayed on a drawn product, since a
  fallback has to paint immediately and a photographic template cannot until
  seven maps have downloaded.
- **The suite's section 5c drives `mug`**, for the same reason it drove `hoodie`
  yesterday and `tshirt` before that: it asserts drawn-versus-photographed canvas
  sizes, so any drawn product serves, but it has to be one that exists.
- **`.mk-shape.hoodie` is deleted from the stylesheet**, along with its hood and
  pocket pseudo-elements. It was half of a shared rule with `.mk-shape.tee`;
  `.tee` stays, because `tshirt-mockup-generator.html` still uses that shape.
  Checked rather than assumed.

**No drawn apparel remains.** `mug` and `box` are the drawn products left.

The card count is unchanged at 28: this replaced a card rather than adding one.

## Verification

- Static suite: 54 passed, 0 failed
- Zone 335x335, 100.0000% purity, zero impure pixels
- Wall and hanger stay out of the shipped mask (66 stray px, 0.0087%)
- No `data-doc="hoodie"` reference remains anywhere in `site/` or `tests/`

## Related files

- `site/js/mockup-templates.js` -- the registry entry
- `site/js/mockup.js` -- the deleted draw functions, `PRODUCTS`, the two defaults
- `site/css/style.css` -- the deleted `.mk-shape.hoodie` rules
- `tests/verify-layout.js` -- section 5c and the background-colour seed
- `site/assets/mockups/apparel/hoodies/hoodie-hanger-white-*.png` -- seven maps
- `site/assets/thumbnails/product-mockups/apparel/hoodies/hoodie-hanger-white-thumb*.jpg`
- `docs/implementation/HANGER_TSHIRT_MOCKUP.md` -- the tee's retirement, one day earlier
- `docs/implementation/HOODIE_MOCKUP.md` -- the model hoodie this is calibrated against
