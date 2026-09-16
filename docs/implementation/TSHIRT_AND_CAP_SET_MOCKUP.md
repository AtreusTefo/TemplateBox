# A T-Shirt and a Cap in One Frame, and the First Two-Zone Garment

Date: September 8, 2026
Status: Implemented

## Summary

`tshirt-cap-clay` is the nineteenth photographic mockup template and the first
carrying **two garments**: a white tee on a dark walnut hanger and a white
baseball cap on a ledge below it, against a terracotta clay wall.

It ships **seven maps, 5.75MB** -- the full apparel set.

Two things make it different from every apparel template before it:

- It is the **first two-zone entry outside the business card pair**, so the
  chest and the cap front are separate print zones with their own layers, and
  the derivation has to be seeded twice.
- It is the first apparel scene with a **baked, opaque backdrop**. Every other
  garment template is a cut-out on transparency with `background: true`. Here
  the wall is part of the photograph, which means it has to be held out of the
  garment mask by its own colour rather than by an alpha channel.

## Why it is shot front-on and not as a flat-lay

The obvious composition for two garments with no model is an overhead flat-lay,
and it cannot work here. A cap resting on a surface presents its crown, its
lining or a side panel to an overhead camera -- never its front panel. The one
surface a cap can be printed on is the only one a flat-lay cannot show.

So the scene is a flat wall with the camera perpendicular and level, both
garments parallel to the sensor. That buys something beyond the cap: both print
zones come out as true axis-aligned rectangles, so both keep `zoneIsRect` and
the **full shading pass**, and neither routes to the perspective warp that
`frame-black-interior` needed.

## The backdrop is doing structural work

The classifier is `alpha >= 250 && sat < 14 && luma > 110` on Rec.601 luma with
absolute `max - min` saturation. On a template with no alpha channel, the only
thing keeping the backdrop out of the garment mask is its colour.

`frame-black-shelf` is the cautionary case: its wall measured saturation **7**,
passed the gate, and 302,034px of it flooded into the print region once a 6px
dilation bridged two pampas fronds. So this prompt asked for a wall that reads
as an obvious colour rather than a neutral. Measured:

| Patch | Saturation p1 / p50 / p99 | Luma p50 |
| --- | --- | --- |
| Wall, upper right | **115** / 120 / 124 | 104 |
| Wall, below the rail | **111** / 120 / 125 | 105 |
| Wall, between the garments | **81** / 119 / 124 | 103 |
| Peg rail | **19** / 49 / 120 | 55 |
| Ledge | **28** / 50 / 95 | 51 |
| Hanger | **24** / 45 / 112 | 49 |

Every surface in the frame fails the gate at its *first* percentile, the wall by
a factor of six. Nothing but the two garments classifies.

## Two zones, two seeds

`restrictToPrintedGarment()` in `tools/mockup-admin.html` keeps only the regions
its seeds land in, and its own comment says what to do here:

> a second zone added by hand to the registry must be added to the derive as a
> second seed.

That is the only substitution made to the tool's algorithm; dilation, blur radii
and every encoding are unmodified.

Classification finds **727,407px in 60 regions**. The landscape is unusually
clean:

| Region | Pixels | What it is |
| --- | --- | --- |
| 1 | 634,802 | the shirt |
| 2 | 92,439 | the cap |
| 3 | **31** | speckle |

The third largest region is 31 pixels, so there is no judgement in the cut. The
two seeds keep **727,280 of 727,407**, dropping 0.017%.

**The dilation does not bridge the two garments, but the margin is thin.** The
shortest path between the shirt's hem and the cap's crown measures **16px**, and
a 6px dilation grows each side by 6, so they close to 4px apart and stay two
regions. That is worth recording because it is the one number in this template
that a re-shoot could easily lose.

Both garments therefore dye together, which is what a matching set should do.

## The two zones

### Shirt: 357x475 at x 252..609, y 486..961

The same rule `tshirt-hanger-white` applies, using this photograph's own
landmarks: collar-to-hem reads as 28in, the print is a real 12x16in area, and
its top sits 3in below the neckline.

The neckline had to be found by **vertical gradient rather than by
classification**. The neck opening shows the garment's own inside, which is the
same white as the front, so a column down the centreline never breaks -- it runs
classified from y=288 to y=1228 with no gap at all. The collar seam is a
gradient feature at **y=397**, and the hem is **y=1229**, so 832px is 28in and
the scale is 29.71 px/in.

Centred on **x=431**, which the body's row midpoints hold to within 4px from the
chest to the hem (432, 432, 432, 431, 428 at y = 800 through 1200).

### Cap: 196x98 at x 816..1012, y 1030..1128

2:1, the ratio of a standard 4.5x2.25in cap embroidery area, at this cap's scale
of 43.6 px/in. It is boxed in on three sides and each bound was measured
separately:

| Feature | Position | How it was found |
| --- | --- | --- |
| Eyelets | y 996, x 858 and 990 | dark cores at luma 55 and 58 |
| Front centre seam | x 924, y 948..995 | row-minimum trace, dip 12-21 luma |
| Brim seam | y 1162 | luma step, 228.5 against 240 |
| Front panel seams | x 775 and x 1051 | row-profile dips at three heights |

The zone clears the eyelets and the seam by 34px above and the brim seam by 34px
below. It is centred on **x=914** -- the midpoint of the two panel seams, which
agrees with the silhouette's own midpoint (912 to 915 across the zone's height).

The button at the crown's apex sits at x=924, and so does the centre seam where
it is visible, but neither is the front panel's centre lower down: the apex
projects from behind the front panel, so its x drifts. The panel seams are the
better evidence and they are what the zone follows.

### Both verified

**100.0000% fabric, zero impure pixels, zero blown pixels** in each zone.

## The photograph

1122x1402, aspect **0.8003** -- 4:5 to within 0.03%, so the catalog thumbnail is
a straight downscale to 600x750 with **zero padding**, unlike the A-series
frames and the roll-up banners.

```
opaque                       every pixel; zero clear, zero partial
shirt zone luma p1/p50/p99   225.3 / 238.5 / 246.2   (spread 20.8)
cap zone luma p1/p50/p99     204.1 / 237.9 / 246.9   (spread 42.8)
blown (luma >= 253)          0 in both zones
shirt zone Sobel p50/p99     0.91 / 3.31
cap zone Sobel p50/p99       1.10 / 4.81
global Sobel p50/p99         1.50 / 19.51
fabric mean / median luma    236.0 / 238.3
specular ceiling (99.5th)    252.9
```

The cap's spread of 42.8 levels is the reason `shade` is not optional here. A
crown is a curved surface with real falloff across it -- comparable to the
angled banner's 42.5 -- and artwork pasted flat across it would erase the
curvature outright. The shirt's 20.8 is close to `bag-paper-white`'s 20.0.

### One flaw in the photograph, recorded rather than hidden

**The shirt's left sleeve runs off the left edge of the frame.** It touches
x=0 on 131 consecutive rows, y 568 to 698, with zero pixels of wall beside it
at y=600 and three at y=700. Everywhere above and below there is real margin
(90px at y=400, 142px at y=800).

It is a framing flaw in the generated image, not a pipeline problem, and it
costs nothing measurable: the shirt zone starts at x=252, so the print area is
nowhere near it; the sleeve is part of the shirt region either way, so the mask
and recolour are unaffected; and the catalog thumbnail is a straight downscale,
so it reads as an editorial crop rather than damage. It is listed here because
a re-shoot of this scene should widen the frame on the left, and because
someone measuring the region box will see it start at x=0 and should know why.

## Seven maps

`displace`, `shade`, `light`, `garment`, `tone` and `grain`, plus the base.

**Weave sd measured 3.56 luma levels**, comfortably over the derive's 2.0 floor
and second in the catalog only to the front model shirt's 3.78. Worth noting
against `tshirt-hanger-white`, shot the same way at 1.92 and the one map in the
catalog that ships below its own quality floor: a hanging shirt is lit flat with
no body under it to break the light up. This one has a cap in the frame carrying
brushed twill, and both garments hold their fibre. The heather colourways have
real structure to screen back.

### The light map had the strongest case yet, and this time it was kept

Specular headroom is **14.7 luma levels -- the highest measured in this
catalog**, above the held bag's 11.8 (kept) and the linen frame's 10.0
(dropped). Headroom alone does not decide it; the linen frame established that.
So the structure test ran:

| Zone | shade local sd | light local sd | light at zone edge | light in interior |
| --- | --- | --- | --- | --- |
| Shirt | 0.746 | 14.211 | 27.4 | **31.4** |
| Cap | 1.833 | 19.378 | 45.6 | **37.5** |
| *linen frame, dropped* | *0.29* | *12.945* | *27.8* | *27.7* |

This is the distinction the linen frame's map failed. There, `light` agreed with
itself to one part in three hundred between the edge band and the interior --
spatially uniform high-frequency content, which is noise. Here the two bands
differ by 13% on the shirt and 19% on the cap, in opposite directions, which is
structure: the shirt's interior catches more light than its edges, and the cap's
crown does the reverse as it turns away. The amplification is also far lower --
19x and 10.6x the shade map's local sd, against the linen's 45x.

`lightGain` is **0.3**, the apparel default, set by the usual measurement. A
`#12305C` navy fill against a source luma of 44 reaches p95 luma 133.4 in the
shirt zone and 149.1 in the cap's at gain 1.0; at 0.3 those fall to **70.8 and
75.6**. Nothing loses its blue identity at either gain, but 1.0 lifts the ink far
past what the fabric justifies.

### displaceStrength is 8

Two independent derivations, using the formula `bucket-hat-white` introduced --
reference strength scaled by gradient ratio and base width:

| Reference | Its strength | Its gradient p99 | Its width | Gives |
| --- | --- | --- | --- | --- |
| `cap-model-white` | 20 | 22.1 | 1939 | **9.03** |
| `bucket-hat-white` | 6 | 14.23 | 1122 | **7.27** |

This template's derived gradient p99 is 17.24 and its base is 1122 wide. 8 sits
between the two, and at 0.71% of base width it lands between the bucket hat's
0.53% and the hoodie's 0.98% -- right for a pressed hanging tee and a stiff
buckram cap front.

The grid test agrees and, unusually, does not bound it. Measured as the mean
standard deviation of a ruled grid line's horizontal position through the zone:

| Strength | 0 | 4 | 8 | 12 | 20 |
| --- | --- | --- | --- | --- | --- |
| Shirt | 0.12 | 0.37 | **0.43** | 0.54 | 0.78 |
| Cap | 0.10 | 0.09 | **0.24** | 0.16 | 0.38 |

Nothing melts even at 20 -- this surface is simply flat, and the wobble stays
sub-pixel throughout. Where the grid test bounded the card at 7 and the bucket
hat at 10, here it does not disagree with either derivation, so the physical
argument decides rather than the diagnostic.

One measurement caveat worth recording: at strengths 16 and 26 the same test
reported a line range of 200 and 169 pixels. That is not distortion, it is the
line matcher merging the diagnostic circle into a grid line and reading a
spurious centre -- the mean sd for those runs (8.59) is inconsistent with the
neighbouring strengths, which is how it was caught.

## Verification

- Full suite: see the run recorded with this change
- Canvas 1122x1402, zone tabs render as "T-Shirt" and "Cap"
- Colour field visible; Background panel correctly `hidden` (no `background`)
- All seven maps and both thumbnails return 200
- Artwork coverage, shirt zone: **99.383%** (168,528 of 169,575), ink extents
  252..608 x 486..960 against a zone of 252..608 x 486..960 -- **no gap on any
  edge**. The only ink outside is a single 1px column at x=251, a sub-pixel
  antialiased rim.
- Artwork coverage, cap zone: **97.631%** (18,753 of 19,208), ink extents
  816..1011 x 1030..1127 against a zone of 816..1011 x 1030..1127 -- again no
  gap on any edge. The smaller figure is the perimeter-to-area ratio of a
  196x98 zone, not a defect: 455px over a 588px perimeter is 0.77px.
- Empty-state prompt fills both zones exactly (169,575 and 19,208 px, both
  equal to the zone area)
- Recolour dyes **both** garments and nothing else: at Navy the shirt sleeve
  reads 29,39,63 and the cap brim 28,38,62, while the wall stays 165,83,46 and
  the ledge 80,40,22
- Catalog 33 cards, 19 mockups, registry and `CATALOG_ITEMS` both at 19,
  mega-menu present on 18 pages at one occurrence each, search hint at 33

### A note on "prompt confined to the zone"

`LINEN_FRAME_MOCKUP.md` records "Empty-state prompt confined to the zone:
351,737px inside, **0 outside**". That is true of the prompt's *fill*, and it is
how the number was taken -- but it is easy to read as "nothing is painted
outside the print area", which is not the case.

Diffing the rendered canvas against the raw base, rather than counting fill
pixels, shows a **2px band of prompt chrome outside the zone** on this template:
1,444px at distance 1 and 1,450px at distance 2, never further, at a strong
colour difference (p50 132). `frame-wood-linen` was then measured the same way
and shows exactly the same thing -- 1,570 and 1,570. This is the editor's zone
stroke, centred on the zone path so half of it falls outside, and it is shared
by every template rather than introduced here. It disappears the moment a design
is added.

Recorded rather than fixed: changing it would move the chrome on all nineteen
templates, which is not this change's business.

## Related files

- `site/js/mockup-templates.js` -- the registry entry
- `site/assets/mockups/apparel/sets/tshirt-cap-clay/` -- seven maps
- `site/assets/thumbnails/product-mockups/apparel/sets/tshirt-cap-clay/`
- `docs/implementation/TWO_ZONE_BUSINESS_CARD_MOCKUP.md` -- the two-zone
  mechanism this reuses, and the only prior template needing two seeds
- `docs/implementation/SHELF_FRAME_MOCKUP_AND_THE_LAST_DRAWN_PRODUCT.md` -- the
  wall that classified, and what it cost
- `docs/implementation/LINEN_FRAME_MOCKUP.md` -- the light-map structure test,
  and the zone luma spread measure
- `docs/implementation/HELD_PAPER_BAG_MOCKUP.md` -- the other light map that
  survived this argument
