# Paper Shopping Bag in Hand, and the Last Drawn Product

Date: September 3, 2026
Status: Implemented

## Summary

`bag-paper-held` is the fourteenth photographic mockup template and the third
that **replaces** a drawn one. The drawn vector `box` -- a flat brown rectangle
with a fold line and three colour dots -- is gone, and with it the last of the
three drawn products the catalog started with. Only `mug` remains.

It is not a duplicate of `bag-paper-white`, which has been in the catalog since
August 2026. That one is a studio cut-out on transparency, square-on, no model,
and it is the catalogue tile. This is a lifestyle shot with a scene behind it,
which is what a listing's second image wants. They differ in the property the
renderer cares most about: one declares `background: true` and this one cannot.

## The backdrop colour was the whole design decision

The reference image supplied with the request used a **neutral grey studio
sweep**, which is the obvious choice for a product shot and would have been
unrecoverable here.

The classifier is `alpha >= 250 && sat < gate && luma > 110`. A grey backdrop
has saturation near 0 and luma around 190: it passes both gates outright. The
bag touches the backdrop along its entire silhouette, so the connected-region
restriction -- which saves the cap from its own white tee, and drops the wall
speckle on the hanger hoodie -- cannot separate two things that are joined.
And there is no third property to appeal to.

So the requirement went into the generation prompt rather than being discovered
afterwards: a backdrop in a **definite colour**, explicitly not grey, white,
off-white or beige. What came back was terracotta, and the measurement is not
close:

| Surface | Luma p1/p50/p99 | Sat p1/p50/p99 |
| --- | --- | --- |
| Terracotta wall | 104 / 113 / 120 | **116 / 119 / 123** |
| Black trousers | 11 / 61 / 74 | 1 / 87 / 96 |
| **Bag** | **230 / 237 / 242** | **4 / 7 / 10** |

The wall fails *both* gates -- saturation an order of magnitude above, and luma
mostly below 110 as well. The trousers fail luma at p99 74. The hand fails
saturation at 76.

Compare the hanger hoodie, whose warm plaster wall separated by a single
saturation level (garment p99 13, wall p1 14). This one is not a margin so much
as a different universe, and it is the difference between a clause guessed at
and a clause specified.

## The saturation gate is 22, not 14, and it is for the gusset

At the factory gate of 14 the mask is the bag's **front panel only**. The side
gusset sits in shadow, picking up a warm bounce off the wall, and measures luma
180-241 at saturation 4-21 -- its p99 of 21 is one level short of the gate.

The consequence would have been visible: recolour tints what the mask covers, so
a navy bag would have kept a white side panel.

Raising the gate to 22 takes the gusset in, and the sweep says it takes nothing
else. Counting everything outside the bag's own area, at **every gate from 14 to
40, exactly 4 pixels** fall elsewhere:

| Gate | Px in the bag's area | Px genuinely elsewhere |
| --- | --- | --- |
| 14 | 504,428 | 4 |
| 20 | 520,053 | 4 |
| **22** | **525,701** | **4** |
| 30 | 526,384 | 4 |
| 40 | 526,597 | 4 |

The whole 21,000-pixel difference is gusset. Verified in the browser: the gusset
recolours with the face, and the wall, trousers, hand and rope are all
byte-identical across Navy and Kraft Brown.

## The base photograph

1122x1402, opaque scene, which is 0.8003 -- 4:5 to within 0.03% -- so the
catalog card is a straight downscale with no crop.

```
corner alpha              255, 255, 255, 255
clear (a<16)              0  (0.0%)
classified (sat<22)       525705  (33.4% of image)
connected regions         19, the largest holding 99.99% of classified pixels
bag luma p1/p50/p99       230 / 237 / 242
blown (luma>=253)         464  (0.092%)
grain sd                  3.22
```

Derive-time probes, all four zero:

| Surface | Classified |
| --- | --- |
| Terracotta wall | 0 of 50,706 (0.000%) |
| Black trousers | 0 of 45,236 (0.000%) |
| Hand and forearm | 0 of 12,876 (0.000%) |
| Rope handles | 0 of 14,651 (0.000%) |

The black rope was asked for deliberately. The studio bag above has white rope,
which classifies as bag and needed a dilate-flood-intersect fix at radius 6 to
survive the connected-region restriction at all -- its 1-3px twist grooves broke
4-connectivity and 75% of the handles were being dropped. Black rope fails the
luma gate, stays out of the mask, and correctly does not dye with the bag.

## Geometry

The front panel was separated from the gusset at **luma > 215**: the gusset sits
in shadow at 180-199 while the face runs 230-242. That gives a face of x
263..874 and y 484..1243, the top bound being where the rope handles stop
notching into the top edge.

The zone is **486x486** at x 328..813, y 620..1105 -- 80% of the panel's width,
matching the studio bag's proportion, centred, clearing 62px left, 64px right,
128px top and 138px bottom. Verified **100.0000% on the panel, zero impure
pixels**.

The panel leans: its right edge runs 874 at the top and 894 at the bottom. A
rectangle inscribed in it has to take the narrower top, and at this size that
costs nothing, because the margins are what absorb it. That is why no occlusion
overlay is needed here and one was on the framed poster, where the zone had been
pushed out to the aperture's edge.

## displaceStrength is 16, and it lands on the studio bag's own number

By the zone measure rather than by copying: global p99 24.31, zone p99 1.00, so
16 delivers 0.66px of peak offset -- **0.058% of base width against that
template's 0.060%**. Same product, same stiff paper, same bend.

| Template | Zone p50 | Zone p99 | Zone/global | Delivered |
| --- | --- | --- | --- | --- |
| **bag-paper-held, 16** | **0.33** | **1.00** | **0.041** | **0.058%** |
| bag-paper-white, 8 | 0.52 | 1.63 | 0.060 | 0.060% |
| bucket-hat-white, 6 | 0.79 | 2.65 | — | 0.097% |
| hoodie-model-white, 10 | 0.58 | 5.71 | 0.200 | 0.195% |

This is the flattest print surface in the catalog by some way, and the lowest
zone/global ratio: the bag's creased edges and its gusset carry essentially all
the gradient while the front panel is glass-flat. The offsets here are
sub-pixel, which is what a smooth paper face lit evenly should be.

## The light map was nearly dropped, and the render kept it

Specular headroom is **5.5 luma levels** (median 236.6 against a 241.1
ceiling) -- the lowest of any template that ships this map, and close enough to
the framed poster's 3.4, where it was omitted as mostly sensor noise, that it
had to be tested rather than assumed.

The first measurement argued for dropping it. Inside the print zone, the
fraction of local variation that survives a 5x5 blur is **0.23**, against 0.08
for the studio bag and 0.11 for both hanger templates -- twice as noisy as any
peer.

The render argued the other way, and won. Dropping the map changes a `#12305C`
navy fill by a **mean of 11.8 levels and up to 71**; on a near-white fill it
changes 0.65. Screen acts hardest on dark ink, and roughly three quarters of
that eleven levels is structure rather than noise. A map worth that much on dark
artwork earns its place even carrying some noise.

Recorded because the noise figure alone would have justified omitting it, and
that would have been wrong.

`lightGain` is 0.3: a navy fill loses 10.38% of its blue identity at gain 1.0
and 0.00% at 0.3.

## What retiring the drawn box touched

Least of the three retirements, because the earlier two had already moved
everything off it:

- **`drawBoxBody` deleted**, 38 lines.
- **`.mk-shape.box` and its lid pseudo-element deleted** from the stylesheet.
  index.html's card was the only user and it is a photo card now. `.mk-shape.tee`
  stays (`tshirt-mockup-generator.html` uses it) and so do the three `.mug`
  rules.
- **Nothing had to move.** `mug` was already the editor's default and fallback
  and already the drawn product the suite's section 5c drives.

**`mug` is now the only drawn product**, and it is load-bearing: the editor's
fallback has to paint immediately, and a photographic template cannot until
seven maps have downloaded. Retiring it too would mean finding another answer
for that first.

Card count unchanged at 28.

## Verification

- Static suite: 55 passed, 0 failed
- Zone 486x486, 100.0000% purity, zero impure pixels
- Wall, trousers, hand and rope all 0.000% classified
- First upload at 0.747 of zone width, margins 61/62/61/62, no escape
- Wall, trousers, hand and rope byte-identical across Navy and Kraft Brown; the
  gusset recolours with the face; "As photographed" round-trips exactly
- Background panel correctly hidden (opaque scene)

## Related files

- `site/js/mockup-templates.js` -- the registry entry
- `site/js/mockup.js` -- the deleted `drawBoxBody` and `PRODUCTS.box`
- `site/css/style.css` -- the deleted `.mk-shape.box` rules
- `site/assets/mockups/packaging/bags/bag-paper-held/` -- seven maps
- `site/assets/thumbnails/product-mockups/packaging/bags/bag-paper-held/`
- `docs/implementation/PAPER_BAG_MOCKUP.md` -- the studio bag this is calibrated against
- `docs/implementation/HANGER_HOODIE_MOCKUP.md` -- the other scene-backed template
