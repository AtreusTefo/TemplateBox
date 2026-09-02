# White T-Shirt on a Hanger, and the Retirement of the Drawn Tee

Date: September 2, 2026
Status: Implemented

## Summary

`tshirt-hanger-white` is the twelfth photographic mockup template, and the first
one that **replaces** an existing product rather than joining the catalog. The
drawn vector `tshirt` -- a flat shape rendered by `drawTshirtBody` on a
1000x1000 canvas, with three colour dots on its card -- is gone. In its place is
a photograph of a blank white tee on a wooden hanger, cut out on transparency,
running the full seven-map fabric pipeline.

No model. That was the point of the request: a plain product shot, the kind a
seller uses for a listing image where the garment is the subject.

## The rail had to be removed from the photograph

The generation prompt asked for a hanger and **no clothing rail**. The image
came back with a chrome rail across the top and down the left side, and it could
not be shipped that way.

### Why no classifier setting could fix it

The fabric classifier is `alpha >= 250 && sat < 14 && luma > 110`. Chrome
defeats it because chrome is neutral and bright -- which is exactly what white
cotton is.

| Surface | Luma p50 | Luma p99 | Luma max | Sat p50 |
| --- | --- | --- | --- | --- |
| Rail post | 116 | 242 | 248 | 1 |
| Rail top bar | 99 | 246 | 249 | 1 |
| **Shirt** | **232** | **244** | **246** | **7** |

The rail's specular highlight is **brighter than the shirt and less saturated
than it**. Raising the luma floor does not separate them, it just trades:

| Luma gate | Rail pixels kept | Shirt pixels lost |
| --- | --- | --- |
| 110 (default) | 27,274 | 0 |
| 150 | 13,632 | 1 |
| 180 | 11,925 | 428 |
| 190 | 11,110 | 1,558 (0.23%) |

Saturation is worse than useless here: a minimum-saturation gate would be
backwards, since the rail measures 1 against the shirt's 7.

### Why the connected-region restriction could not save it either

That fallback drops any classified region not connected to the print zone, and
it is what kept the cap's white tee out of the cap's mask. It fails here for a
physical reason: **the left sleeve hangs in front of the rail post at y
618..647**, so the two are genuinely one region. Measured: **37,873 rail pixels
sat inside the shirt's own connected region**, and with the derive's 6px
dilation the whole 44,310 came in. Every one of them would have turned navy
along with the shirt.

### What was done

The rail was erased from the image, in one pass from the original:

- **Top bar** (y 54..81): removed by cropping the top at y=84. The hanger's hook
  now runs to the frame's top edge, which is how a hanging product is normally
  cropped anyway.
- **Post** (x 36..80): erased on every row.

Erasing the post costs the sleeve's leftmost tip on those 30 overlap rows.
Preserving it was tried first and looked worse -- a rectangular white tab
sticking out into empty space, because the sleeve's own edge above and below the
tab had been hidden behind the rail and went with it. The straight cut follows
the sleeve's silhouette and reads as a normal sleeve tip.

The original file is not in the repository; the shipped base is the cleaned
image. If the rail ever needs to come back, regenerating without one is the
better path than undoing this.

### The clause that DID work

The prompt asked for a **wooden hanger in a warm mid-brown**, and that is what
saved the hanger. It measures saturation 103 and fails the gate outright: **3 of
3,106 probe pixels across the hanger and hook classify, 0.097%**. A white,
chrome or pale-wood hanger would have been the rail problem again, and worse --
the hanger touches the shirt at the shoulders, so nothing downstream could have
separated them.

## The base photograph

1174x1468 after the surgery, cut out on transparency.

```
corner alpha              0, 0, 0, 0
clear (a<16)              979405  (56.8%)
semi                      11990    opaque 732037
classified                717885  (41.65% of image, 98.1% of opaque)
connected regions         500, the largest holding 99.83% of classified pixels
garment luma p1/p50/p99   208 / 232 / 244
blown (luma>=253)         29  (0.004% of garment)
weave (grain) sd          1.92
transparent px with RGB   0
```

Garment luma p1 was **132** with the rail in the mask and is **208** without it,
which is the cleanest single confirmation that the rail is gone.

### The frame is exactly 4:5

1174x1468 is the garment's bounding box plus an 80px margin, with the height
derived from the width. It is the **first base in the catalog whose aspect
matches the catalog card's 600x750**, so its thumbnail is a straight downscale
instead of a crop. Built, not lucky.

## Geometry, on this photograph's own landmarks

Both the scale and the zone placement follow the rules `tshirt-model-white`
already uses, applied here rather than copied across:

| Landmark | Value |
| --- | --- |
| Neckline, lowest point on the centreline | y = 337 |
| Hem | y = 1333 |
| Collar to hem | 996px, read as 28in -> **35.6 px/in** |
| Centreline | x = 570 (row midpoints hold within 2px from chest to hem) |

The zone is **427x570** -- 12x16in -- with its top 3in below the neckline. It
lands at the same fraction of the garment as the model shot's does (0.429 of
collar-to-hem wide, 0.571 tall), so the same artwork reads the same size on both
templates.

Verified **100.0000% fabric, zero impure pixels**, with 86px of clearance on
both sides and 320px (9.0in) of shirt below it.

## displaceStrength is 16, by the zone measure

Using the method the back hoodie introduced -- the offset actually delivered
inside the print, `strength x zone_p99 / global_p99` -- rather than the global
p99 ratio:

| Template | Base width | Global p99 | Zone p50 | Zone p99 | Peak offset in zone |
| --- | --- | --- | --- | --- | --- |
| tee front (model), 16 | 1024 | 32.22 | 2.73 | 21.38 | 10.62px (1.037% of width) |
| tee back (model), 27 | 2048 | 17.34 | 0.84 | 6.83 | 10.64px (0.519%) |
| **tee hanger, 16** | **1174** | **15.06** | **1.39** | **5.59** | **5.97px (0.509%)** |

The back shirt is the right comparison: a smooth, fold-light tee surface, zone
p50 0.84 against this one's 1.39. Matching its 0.519% gives 16.4, and the
straight-bar test agrees -- 10 leaves the bars too clean, and at 26 the test
ring starts to go out of round at its lower left.

## The one map that ships below its floor

**Weave sd 1.92**, and the derive flags anything under 2.0 as too smooth. This
is the flattest weave in the catalog:

| Template | Weave sd |
| --- | --- |
| hoodie front | 4.11 |
| tee front (model) | 3.78 |
| hoodie back | 2.98 |
| tee back (model) | 2.18 |
| **tee hanger** | **1.92** |

A shirt on a hanger is lit flat and has no body under it to break the light up,
so there is less weave to record. The consequence is specific and limited: the
two heather colourways model their undyed fibre faintly here, closer to a plain
marl than on the model shots. The six solid colours do not read this map at all.
It ships as measured rather than being synthesised.

## lightGain is 0.3, measured on this base

A `#12305C` navy fill across the zone, source luma 44:

| Gain | p50 | p95 | Max | Print losing its blue identity |
| --- | --- | --- | --- | --- |
| 1.0 | 74.7 | 174.8 | 255.0 | 13.46% |
| 0.5 | 59.4 | 109.4 | 149.5 | 0.15% |
| **0.3** | **53.2** | **83.3** | **107.3** | **0.00%** |

## What retiring the drawn tee touched

Removing a product is not the same as adding one. Four things had to move:

- **`drawTshirtBody` STAYS.** The drawn hoodie is built by calling it and then
  adding a hood and pocket, so deleting the shape with the product would have
  taken the hoodie's body with it. Only the `PRODUCTS.tshirt` entry is gone.
- **Two defaults pointed at it.** `currentProduct` and `paint()`'s fallback both
  named `"tshirt"`, so an unresolvable stored product would have fallen through
  to a template that no longer exists. Both are `"hoodie"` now -- still a drawn
  product, so the cold-start path does not suddenly wait on seven map downloads.
- **The suite's section 5c drove `tshirt` by name** to assert a drawn product
  exports at 1000x1000 against a photographed one's 1024x1536. It runs on
  `hoodie` now; the check is about drawn-versus-photographed, so any drawn
  product serves, but it has to be one that exists.
- **`.mk-shape.tee` is NOT dead CSS.** `tshirt-mockup-generator.html` still uses
  it, so the rule stays. Checked rather than assumed.

The card count is unchanged at 28: this replaced a card rather than adding one.

## Verification

- Static suite: 54 passed, 0 failed
- Zone 427x570, 100.0000% purity, zero impure pixels
- Connected-region restriction dropped 1px; the mask was already one region
- Hanger and hook stay out of the mask (0.097% of probe pixels)
- No `data-doc="tshirt"` reference remains anywhere in `site/` or `tests/`

## Related files

- `site/js/mockup-templates.js` -- the registry entry
- `site/js/mockup.js` -- the retired `PRODUCTS.tshirt`, the two defaults
- `tests/verify-layout.js` -- section 5c and the background-colour seed
- `site/assets/mockups/apparel/t-shirts/tshirt-hanger-white-*.png` -- seven maps
- `site/assets/thumbnails/product-mockups/apparel/t-shirts/tshirt-hanger-white-thumb*.jpg`
- `site/index.html` -- the card that changed from drawn to photographic
- `docs/implementation/PHOTO_MOCKUP_TEMPLATES_IMPLEMENTATION.md` -- the pipeline
- `docs/implementation/BACK_VIEW_HOODIE_MOCKUP.md` -- where the zone-based
  `displaceStrength` measure was introduced
