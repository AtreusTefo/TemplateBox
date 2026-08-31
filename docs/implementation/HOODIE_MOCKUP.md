# White Hoodie Mockup

Date: August 31, 2026
Status: Implemented

## Summary

`hoodie-model-white` is the seventh photographic mockup template and the second
garment on a model. It runs the full seven-map fabric pipeline, and it is the
first template built **after** the colourway chips landed -- so its heather
fractions and its grain map are reachable from the editor on day one, which was
not true of the shirt or the cap.

## The base photograph

1024x1536, cut out on transparency. The two hoodie-specific hazards were kept
out of the photograph rather than worked around afterwards.

```
corner alpha              0, 0, 0, 0
clear (a<16)              250987  (16.0%)
classified                1070520  (68.06% of image, 81.9% of opaque)
connected regions         290, the largest holding 99.96% of classified pixels
garment luma p1/p50/p99   159 / 236 / 247
blown (luma>=253)         62  (0.006% of garment)
weave (grain) sd          4.11
```

### The two clauses that did the work

**No drawstrings.** Cords hang straight down the chest, through the print area,
and there is no occlusion-mask support -- a design would paint over them and
they would vanish under the artwork. This is the same failure the paper bag's
handles would have caused across its front panel. Hood down with no cords is the
only clean answer.

**Dark charcoal trousers, and nothing else light in frame.** The cap photograph
put the model in a white tee, which classified as the same fabric and took 22.5%
of the mask. The connected-region restriction fixed that case, but it works by
dropping regions NOT connected to the print zone -- white joggers touching the
hem would be connected, and the fix could not have saved it. Measured:

| Band | Classified | Luma p50 | Sat p50 |
| --- | --- | --- | --- |
| chin/neck (skin) | 3.6% | 136 | 73 |
| chest | 99.9% | 239 | 8 |
| pocket | 100.0% | 235 | 8 |
| **jeans** | **0.0%** | **39** | 4 |

Skin is excluded by saturation, the trousers by luma. 99.96% of every classified
pixel is in one region.

### Geometry

The kangaroo pocket's top seam is the strongest horizontal step in the whole
photograph: **+16.24** in the central columns at y=895, with a tight cluster
from y=885 to y=896. The print zone has to stop above it.

The torso centreline is **520.5**, taken from the sleeve seams at x=223 and
x=818 (shading valleys of depth 11.0 and 11.8) rather than from the frame -- the
sleeves run off both edges of the image, so the frame centre would have been a
guess. The chest is clear garment from y~280.

The zone is **432px square**: 12in at this garment's scale (neckline y=280 to
hem y=1338 is 1058px over roughly 29in, about 36.5 px/in), starting 3in below
the neckline. A hoodie's print is shorter than a shirt's because the pocket
takes the lower half. Verified **100.0000% surface, zero impure pixels**, with
64px of clearance above the pocket seam.

## displaceStrength is 10

Gradient p99 measured **28.51** against the shirt's 41.5 on an identically sized
base -- fleece drapes in broader, softer folds than jersey, which is what was
expected this time and what the numbers showed.

Matching the shirt's *physical* bend would be 16 x (28.51 / 41.5) = 11, and
heavy fleece should bend a print less than jersey rather than more, so at or
below that. The grid agrees: 14 gives the print more character than the fabric
earns and 20 wanders. At 0.98% of base width it sits just under the cap's 1.03%
and well under the shirt's 1.56%.

| Template | Base width | Strength | % of width | Gradient p99 |
| --- | --- | --- | --- | --- |
| tshirt-model-white | 1024 | 16 | 1.56% | 41.5 |
| cap-model-white | 1939 | 20 | 1.03% | 30.3 |
| **hoodie-model-white** | **1024** | **10** | **0.98%** | **28.5** |
| bag-paper-white | 2048 | 8 | 0.39% | 10.3 |
| card-white-walnut | 2400 | 4 | 0.17% | 4.5 |

## lightGain, where the check finally bit

0.3, as everywhere -- but on this garment the measurement matters rather than
merely passing. Blue identity for a `#12305C` navy fill:

| Gain | p95 luma | Losing blue identity |
| --- | --- | --- |
| 0.15 | 64.5 | 0.00% |
| 0.20 | 71.6 | 0.00% |
| 0.30 | 84.9 | 0.00% |
| 0.50 | 112.4 | 0.00% |
| **1.00** | **180.4** | **6.47%** |

At 1.0 this garment genuinely fails, which is the same washout that set 0.3 on
the shirt in the first place. Every other template measured 0.00% at every gain
tested; this is the first since the shirt where the ceiling is real rather than
theoretical.

## The grain map is used from day one

Fleece has the second-highest weave in the catalog -- **4.11** luma levels
against the shirt's 3.78 and the cap's 5.86 -- so heather reads well.

That matters more here than it would have a week ago. Until the colourway chips
landed (see `docs/error-fixes/MOCKUP_EDITOR_AUDIT_AUGUST_2026.md`), heather was
unreachable from the editor and the shirt's and cap's grain maps were shipped
and never sampled. This template's heather colourways were verified working
before it was registered.

Measured live on fabric outside the print zone:

| Colourway | Shoulder | Sleeve | Pocket |
| --- | --- | --- | --- |
| As photographed | 231,233,239 | 240,240,247 | 234,235,242 |
| Black | 24,24,24 | 25,25,25 | 25,25,25 |
| Navy | 29,39,63 | 30,41,66 | 29,40,65 |
| Heather Grey | 181,180,176 | 185,184,179 | 182,181,176 |
| Heather Navy | 76,85,102 | 78,86,105 | 76,84,103 |
| Forest Green | 43,70,56 | 45,73,58 | 44,71,57 |

Heather Navy at 76,85,102 against solid Navy's 29,39,63 is the fibre mix doing
its job, and "As photographed" restores exactly.

## Weight

5.86MB across seven maps, in line with the shirt's 4.8MB and well under the
paper bag's 11.3MB. Full resolution was kept because downscaling would push the
weave toward the 2.0 grain floor, and here the grain map is genuinely used.

## Verification

- Zone 432x432, 100.0000% purity, zero impure pixels, 64px clear of the pocket
  seam. The restriction dropped nothing.
- Editor loads at 1024x1536 and fetches all seven maps, all 200, including
  `grain`.
- Eight colourway chips render with "As photographed" active; zone switch
  correctly hidden (single zone); Background panel visible (cut-out base).
- Recolour confined correctly: the model's skin and the dark jeans are untouched
  at every colourway.
- `node tests/verify-layout.js`: **1249 passed, 0 failed**.

Section 4 passed without a commit this time, which is worth explaining because
the roll-up banner's card did fail it. At 320px the catalog grid is two columns,
not one. The banner took the count from 22 to 23 and pushed the grid from 11
rows to 12, changing `main` and `.home-main` heights; the hoodie takes it from
23 to 24, which fills the existing last row and leaves the row count at 12. No
measured box changes, so there is nothing for the check to report. Confirmed by
removing the card from the live DOM at 320px and re-measuring: `main`,
`.home-main` and the grid were all identical to the tenth of a pixel.

## Related

- `docs/error-fixes/MOCKUP_EDITOR_AUDIT_AUGUST_2026.md` -- the colourway fix that
  makes this template's heather usable.
- `docs/implementation/FABRIC_DISPLACEMENT_APPAREL_MOCKUPS.md` -- the seven-map
  pipeline.
- `docs/implementation/PAPER_BAG_MOCKUP.md` -- the dilation in the
  connected-region restriction.
