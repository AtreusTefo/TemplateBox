# Framed Print on Linen, and a Derivation That Needed Nothing Bypassed

Date: September 5, 2026
Status: Implemented

## Summary

`frame-wood-linen` is the eighteenth photographic mockup template and the
fourth frame. A dark wood frame with a white mat lies on warm linen cloth, with
a dried botanical stem resting clear of it in the lower left.

It ships **three maps, 3.32MB** -- base, displace and shade.

It is the first template whose maps came out of `tools/mockup-admin.html`'s
algorithm **completely unmodified**, dilation and all. Each of the other three
frames cost something:

| Template | What it cost |
| --- | --- |
| `wood-a4` | none measured -- predates this line of work |
| `frame-black-interior` | shot in perspective, so a trapezoid aperture and a 2,379KB occlusion overlay |
| `frame-black-shelf` | square-on, but pampas fronds cross the frame, so the flood must run **undilated** |
| **`frame-wood-linen`** | **nothing** |

That is not luck. It is the two clauses that went into the prompt because of
what the previous two frames cost.

## The backdrop is why, and it was specified

The catalog's classifier is `alpha >= 250 && sat < 14 && luma > 110` on Rec.601
luma with absolute `max - min` saturation. A pale neutral backdrop passes it.
`frame-black-shelf`'s wall measured saturation **7** and was held out of the
poster's region by the black frame alone -- which then failed, because two
pampas fronds crossed that frame and the standard 6px dilation bridged them,
dragging **302,034px of wall** into the region.

So this prompt asked for linen "noticeably warmer and deeper than the white
mat, not a neutral off-white", and for every prop to sit clear of the frame.
Both held:

| Patch | Saturation p1 / p50 / p99 | Luma p50 |
| --- | --- | --- |
| Linen, top left | **16** / 38 / 55 | 173 |
| Linen, right | **19** / 32 / 46 | 185 |
| Linen, below | **19** / 32 / 47 | 188 |
| **Print area** | 0 / **2** / 4 | 234 |

The linen fails the gate at its *first percentile* on all three patches. It
never classifies at all, so the frame is no longer the only thing standing
between the backdrop and the print surface.

The frame is a good barrier anyway. Its unclassified band measures **22 to 71
pixels** on the four sides with **zero** spots at or under the 12px a 6px
dilation can bridge:

| Side | Barrier width | Spots <= 12px |
| --- | --- | --- |
| Left | 60-62 | 0 |
| Right | 36 | 0 |
| Top | 55-71 | 0 |
| Bottom | 22-36 | 0 |

Run with the tool's real algorithm -- dilation included -- the flood keeps
**528,966px bounded by [255, 281, 854, 1178]**, against a frame interior of
x 249..911, y 245..1179. It does not escape, and only 113 classified pixels
anywhere in the image are dropped.

## Square-on held again

The opening is marked by an **engraved line in the mat** rather than a step
between two whites -- the mat and the print paper differ by about four luma
levels -- so the edges were found by gradient centroid rather than by
thresholding:

| Edge | Position | sd | Slope |
| --- | --- | --- | --- |
| Left | x 309.51 | 0.086 | +0.000245 |
| Right | x 787.91 | 0.259 | -0.001197 |
| Top | y 354.13 | 0.185 | -0.000137 |
| Bottom | y 1106.05 | 0.348 | +0.000912 |

Sub-half-pixel scatter and slopes at the fourth decimal: a real axis-aligned
rectangle, so no overlay, no overhang, and the full shading pass. The zone is
that opening rounded inward, **477x751 at x 310..787, y 355..1106**.

Verified in the editor: artwork covers **99.993%** of the zone -- 358,202
magenta pixels of 358,227 -- with the 406 outside it a sub-pixel antialiased
rim rather than ink on the mat.

## The photograph

1054x1492, and this one is **not 4:5**. Its aspect is 0.7064, which is
1:sqrt(2) to within 0.1% -- an A-series frame, where the last three templates
all came back at 0.8003. The catalog card is 4:5, so the thumbnail is **fit and
padded** (530x750 drawn, 35px of white each side) rather than the straight
downscale the others get. The two roll-up banners are handled the same way.

```
opaque                       every pixel; zero clear, zero partial
print luma p1/p50/p99        229.7 / 234.1 / 238.5   (spread 8.8)
print saturation p50         2
blown (luma >= 253)          0
zone Sobel p50/p99           0.45 / 1.96
global Sobel p99             31.03
```

**A spread of 8.8 luma levels is the flattest print surface in this catalog**,
under the shelf frame's 12 and the duotone cards' 10, with zero blown pixels.

### The zone/global ratio is not a cross-template ranking

This template is what finally showed that, and it is worth stating plainly
because **four successive templates each claimed in writing to be "the flattest
print surface in the catalog"** on the strength of that ratio, and the claim
even inverted itself once -- `banner-rollup-angled`'s registry entry described
its 0.047 as "below the paper bag's 0.041", which is arithmetically backwards.

Here the ratio is 0.063 against the shelf frame's 0.031, which would say this
surface is half as flat. It is not: the zone's absolute Sobel p99 is 1.96
against 1.76. The denominators differ, because soft linen folds give a far
gentler global p99 (31.03) than a room full of hard edges (57.26). A ratio
whose denominator is "whatever else happens to be in the photograph" cannot
rank two photographs.

Absolute Sobel does not rank them either, and for a reason the catalog already
knew: a Sobel measures luma change **per pixel**, so a 2048-wide base reads
half the gradient of a 1024-wide one for the same physical feature.

What does compare is the zone's **luma spread**, p1 to p99 -- a contrast
measure rather than a derivative, so it is free of both problems. Measured the
same way for every template (Rec.601, inside the true quad, opaque pixels
only):

| Template | Zone luma spread |
| --- | --- |
| `frame-wood-linen` | **8.8** |
| `card-white-duotone` | 10.0 |
| `bag-paper-held` | 10.5 |
| `frame-black-shelf` | 10.8 |
| `bag-paper-white` | 20.0 |
| `banner-rollup-white` | 30.4 |

**Two templates cannot be measured this way at all**, and that is the other
half of the finding:

- `banner-rollup-angled` reads a spread of **0**, because its base was
  deliberately flattened to its reference white -- the sheen lives in its
  multiply overlay. Its base says nothing about the photograph's flatness.
- `frame-black-interior` reads **205.1**, because its zone deliberately
  overhangs onto the black frame and includes border pixels at luma 41.

So the honest statement is the narrow one: of the templates where the zone
shows the print surface, **this is the flattest at 8.8**. The superlatives in
the four entries above have been corrected to say what they actually measured.

## Three maps, and the light map that had the best case yet

`displace` ships to open the gate, as on both sibling frames: `shade` is applied
*inside* the displacement pass, so a template with no displace map gets no
shading at all. Inside the zone the map measures p50 3.61 out of 127, so at
`displaceStrength: 2` the interior moves 0.06px. Verified there is no gap at
the mat's edge, which is the risk that carries: artwork extents run 310..786
against a zone of 310..786.

**`light` was derived, measured and dropped -- and this was the strongest case
of the three frames**, which is why it was tested rather than waved away.

Specular headroom is **10.0 luma levels**, against the shelf frame's 4.7 and
the interior frame's 3.4, so the map amplifies noise by 25x rather than 54x.
Dropping it changes a navy fill by a mean of **6.65 levels**, and the held
bag's light map was *kept* on a comparable 11.8.

The structure test is what settles it:

| Map | Local sd | Mean at zone edge | Mean in interior |
| --- | --- | --- | --- |
| `shade` | **0.29** | 251.9 | 254.6 |
| `light` | **12.945** | 27.8 | **27.7** |

`light` agrees with itself to one part in three hundred between the zone's edge
band and its interior, with 45x the local variation of `shade`. It is spatially
uniform high-frequency content -- noise -- which is what a flat matte print
behind a mat should produce, because there is no specular structure to model.
On a flat `#808080` fill the map takes sd from 1.02 to 5.39 and the p1-p99
spread from 2 to 19.9, all of it invented.

The lesson worth keeping: **headroom alone does not decide this.** Twice the
headroom of either sibling still produced a map with no structure in it.

### What `shade` does here

Reproduces the mat's bevel shadow on the artwork. Measured on a `#FF00AA` fill
in the editor, mean red in the 6px band along each edge:

| Side | Mean red | |
| --- | --- | --- |
| **Left** | **247.98** | shadowed |
| **Top** | **247.83** | shadowed |
| Right | 254.64 | not |
| Bottom | 254.45 | not |

Left and top only, which is correct for light arriving from the upper right --
the same signature the shelf frame shows at 248.14 against 254.75. Edge band
251.3 against 254.62 in the interior.

Worth recording: a first spot-check of four single pixels showed almost no
shading and looked like a failure. It was not -- the bevel's depth varies along
each edge, and one pixel per side is not a measurement. The band means are.

## Verification

- Static suite: 131 passed, 0 failed
- Zone 477x751, artwork coverage 99.993%, no gap at the mat's edge
- Empty-state prompt confined to the zone: 351,737px inside, **0 outside**
- Colour field and Background panel both correctly hidden
- Catalog 31 cards, 18 mockups, mega-menu count matching, search hint at 31
- Standard derivation verified to keep the frame's interior with dilation ON

## Related files

- `site/js/mockup-templates.js` -- the registry entry
- `site/assets/mockups/print/posters-and-frames/frame-wood-linen/` -- three maps
- `site/assets/thumbnails/product-mockups/print/posters-and-frames/frame-wood-linen/`
- `docs/implementation/SHELF_FRAME_MOCKUP_AND_THE_LAST_DRAWN_PRODUCT.md` -- the
  frond bridge and the undilated flood this template did not need
- `docs/error-fixes/MOCKUP_PRINT_ZONES_OVERHANGING_THEIR_SURFACE.md` -- the
  trapezoid problem being square-on avoids
- `docs/implementation/HELD_PAPER_BAG_MOCKUP.md` -- the light map that survived
  this argument, and why this one does not
