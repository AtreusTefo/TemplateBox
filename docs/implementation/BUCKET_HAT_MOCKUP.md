# White Bucket Hat Mockup

Date: September 2, 2026
Status: Implemented

## Summary

`bucket-hat-white` is the ninth photographic mockup template and the second
hat. It is the first template whose **classifier thresholds are tuned per
image** rather than left at the factory defaults, and the reason is worth
recording: the defaults were wrong here in both directions at once.

## The base photograph

1122x1402, aspect exactly 0.800, cut out on transparency.

```
corner alpha              0, 0, 0, 0
clear (a<16)              534288  (34.0%)
classified (defaults)     406916, 97.47% in one region
hat luma p1/p50/p99       174 / 230 / 245
blown (luma>=253)         7  (0.002%)
weave (grain) sd          5.33
```

Seven blown pixels, and a weave second only to the cap's 5.86. The framing
clause worked: cropping below the mouth kept all clothing out, and skin is
excluded by saturation -- face 0.5% classified, neck 0.0%, at sat p50 71 and 65.

## The thresholds are tuned, and both are raised

`classify` gates on `sat < 14 && luma > 110`. Both are tunable in the factory
(`th-sat`, `th-luma`), and this is the first base that needed either moved.

**The saturation gate bisected the hat.** This white hat carries a slight
colour cast: its own saturation runs 12 to 16, with p50/p75/p90/p95/p99 of
12/13/14/14/16 inside the print zone. At a gate of 14 the crown came out
**87.9% classified**, with 8,328 holes scattered through the print area -- and
every single failure was saturation, with alpha at 100% and luma p1 at 199.
Those holes are not harmless: `garment` is hole-filled, but `shade`, `tone` and
`light` are derived from the raw mask, so a speckled mask means a speckled
print.

**Raising saturation alone let the forehead in.** At `sat < 20` the zone reached
100% but 5,930 face pixels entered the mask, and the connected-region
restriction could not drop them. This is NOT the cap's problem: there the
model's white tee was a *separate* region, which is exactly what the
restriction removes. Here the brim rests on the forehead, so the skin is
genuinely connected to the hat and no amount of flooding separates them.

**Luma is what separates them.** The hat's luma p1 is 174; the face's p50 is
131. Measured after the restriction:

| Gates (sat / luma) | Face in mask | Brim kept | Zone purity |
| --- | --- | --- | --- |
| 14 / 110 (defaults) | 0.251% (750) | 89.51% | 87.92% |
| 18 / 165 | 0.119% (354) | 99.51% | 99.93% |
| **20 / 165** | **0.119% (355)** | **99.54%** | **100.0000%** |
| 20 / 170 | 0.080% (240) | 99.36% | 100.0000% |
| 20 / 175 | 0.058% (173) | 98.90% | 100.0000% |

`20 / 165` is strictly better than the defaults on every axis at once -- it
admits *less* forehead than 14/110 did while capturing the whole crown. Pushing
luma to 175 trims the face further but starts costing brim coverage, and the
brim is the product.

**Re-deriving this template with the factory defaults will silently produce a
speckled mask.** The thresholds are recorded in the registry entry for that
reason.

## Geometry

The brim seam is the strongest horizontal step in the crown's central columns,
**+4.96 at y=491**, and it bounds the print area below. The crown's centreline
is **x 565**, constant to within 3px from y=120 to y=500.

The zone is **470x260** at x 330..799, y 200..459 -- verified 100.0000% surface
with zero impure pixels, stopping 32px above the seam.

It shipped at 320x190 first, about 11.7 x 6.9cm at this hat's scale, which is
what a real embroidered bucket hat front measures. That was doubled in area at
the owner's request and now covers roughly **17 x 9.5cm** -- a full front-panel
graphic rather than a badge. The size is a product decision, not a technical
one, and the technical limit is further out still.

**What bounds it is curvature, not purity.** Purity holds at 100.0000% out to
550x280. The displacement map is the surface gradient, so its magnitude reports
where the cylinder rolls out of view:

| x | 240-760 | 800 | 840 | 880 |
| --- | --- | --- | --- | --- |
| displacement magnitude | 3-11 | 14.1 | **24.3** | 16.9 |

The spike at x=840 is the crown turning away. The right edge sits at 799, just
short of it, and the left mirrors it about the centreline. Going to 510 or
550 wide stays pure but reaches into the turn, where artwork foreshortens hard
against the near-flat middle -- purity would report nothing wrong.

The seamless front panel the prompt asked for is what makes an axis-aligned
rectangle legitimate at all: a four-panel crown would have run a vertical seam
straight down the middle of this zone, putting the artwork on two planes with a
hard line between them.

## displaceStrength is 6

Gradient p99 measured **14.23**, about half the hoodie's 28.5 and the cap's
30.3 -- a crown stretched over a head is a smooth cylinder with very little
folding. Matching the hoodie's physical bend works out at
10 x (14.23 / 28.5) x (1122 / 1024) = 5.5, and the grid agrees: at 10 the ruled
lines already read as a loose hat rather than a taut one.

| Template | Base width | Strength | % of width | Gradient p99 |
| --- | --- | --- | --- | --- |
| tshirt-model-white | 1024 | 16 | 1.56% | 41.5 |
| cap-model-white | 1939 | 20 | 1.03% | 30.3 |
| hoodie-model-white | 1024 | 10 | 0.98% | 28.5 |
| **bucket-hat-white** | **1122** | **6** | **0.53%** | **14.2** |
| bag-paper-white | 2048 | 8 | 0.39% | 10.3 |

`lightGain` stays 0.3: at gain 1.0 a `#12305C` navy fill loses 3.49% of its
blue identity, at 0.3 it loses 0.00%.

## Weight

4.2MB across seven maps -- the lightest fabric template in the catalog, under
the shirt's 4.8MB and well under the cap's 9.1MB.

## Verification

- Zone 470x260, 100.0000% pure, zero impure pixels, 32px clear of the brim
  seam. Verified live: all four inside edges carry artwork at 100% design size
  and all four outside probes read bare hat.
- Editor loads at 1122x1402 and fetches all seven maps, all 200, including
  `grain`.
- Eight colourway chips with "As photographed" active; Background panel visible
  (cut-out base); zone switch correctly hidden.
- Recolour measured on the live canvas, sampling the crown OUTSIDE the print
  zone (inside it reads the `#F4F3EF` upload placeholder, which is how the
  first measurement looked like a failure):

  | Colourway | Crown left | Crown right | Brim | Forehead |
  | --- | --- | --- | --- | --- |
  | As photographed | 234,233,243 | 192,187,199 | 233,231,242 | 137,81,67 |
  | Black | 25,25,25 | 20,20,20 | 25,25,25 | 137,81,67 |
  | Navy | 30,40,65 | 24,32,52 | 29,40,64 | 137,81,67 |
  | Heather Grey | 181,180,177 | 152,151,148 | 181,180,176 | 137,81,67 |
  | Heather Navy | 76,84,102 | 63,70,84 | 76,84,102 | 137,81,67 |

  The hat dyes fully and the skin does not move at all. "As photographed"
  restores exactly.
- `node tests/verify-layout.js`: 1256 passed, 1 failed. The failure is section 4
  reporting two `index` measurements differing by 0.1px, which is this commit's
  own catalog card and resolves once it lands. Twenty-six cards happen to
  rebalance the grid almost exactly, so the usual few-hundred-pixel shift does
  not appear.

## Related

- `docs/implementation/HOODIE_MOCKUP.md` -- the other model-worn garment, and
  the white-clothing hazard this template's framing avoids outright.
- `docs/implementation/PAPER_BAG_MOCKUP.md` -- the dilation in the
  connected-region restriction, which cannot help where skin touches the brim.
- `docs/error-fixes/MOCKUP_EDITOR_AUDIT_AUGUST_2026.md` -- the colourway fix
  that makes this template's heather usable.
