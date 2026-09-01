# Roll-Up Banner Mockup

Date: August 31, 2026
Status: Implemented

## Summary

`banner-rollup-white` is the sixth photographic mockup template and the first
to ship **four maps instead of seven**. The whole template is 1.5MB against the
paper bag's 11.3MB and the business card's 10.1MB, which is the first time the
weight of this catalog has gone down rather than up.

It also exposed a bug in the thumbnail generator that had been latent through
three previous templates.

## The base photograph

1024x1536, cut out on transparency. The generated file looks white-backed in a
preview, which is only the viewer compositing onto white -- the alpha channel is
real:

```
corner alpha              0, 0, 0, 0
clear (a<16)              758573  (48.2%)
opaque (a>=250)           799508  (50.8%)
classified                751222  (47.76% of image)
face luma p1/p50/p99      215 / 237 / 248
blown (luma>=253)         0
```

**Zero blown pixels** anywhere inside the print zone -- the only base in the
catalog with none. The paper bag had 0.11% and the business card 0.41%.

### The dark hardware is what makes this work

The prompt specified an anthracite base cassette and pole rather than the more
common brushed aluminium, and that clause is load-bearing rather than
cosmetic. Aluminium measures roughly 5 saturation and 150-200 luma, which
passes both classifier gates while being physically joined to the banner face.
It would have been pulled into the classified surface and dragged the median
luma and the specular ceiling that `shade` and `light` normalise against,
distorting the shading across the entire face.

Anthracite fails the luma gate. Measured:

| Band | Opaque px | Classified | Luma p50 |
| --- | --- | --- | --- |
| top rail | 18957 | 37.0% | 68 |
| base cassette | 50978 | 33.5% | 56 |
| feet | 2499 | 0.3% | 58 |

The non-zero percentages in the first two rows are the banner face bleeding
into those horizontal strips, not the hardware classifying. The decisive number
is that the face region holds **99.83%** of every classified pixel in the image
(749,921 of 751,222), with the remaining 91 connected regions all under 1000px
and dropped by the restriction.

### Geometry

Face measured x 205..819, y 128..1346. Inset 6 -- still **100.0000% pure with
zero impure pixels**, and clear of the edge feather. The zone is 603x1207,
roughly 1:2, a little wider than a standard 850x2000mm roll-up but that is what
the photograph is.

The restriction dropped only 72 pixels.

## Four maps, not seven

Blank banner vinyl has no colour variant worth offering, and a design covers
the entire face, so there is nothing for a `garment` mask or a `tone` map to
serve; `grain` has no fibre blend to model, as with the paper bag and the
business card. Declaring no `garmentColors` is what turns the colour field off,
verified in the browser.

| Template | Maps | Total |
| --- | --- | --- |
| tshirt-model-white | 7 | 4.8MB |
| cap-model-white | 7 | 9.1MB |
| bag-paper-white | 6 | 11.3MB |
| card-white-walnut | 6 | 10.1MB |
| **banner-rollup-white** | **4** | **1.5MB** |

Part of that is the smaller base, but three fewer maps is the larger share.

## displaceStrength is 10

Gradient p99 measured 7.63, between the business card's 4.54 and the paper
bag's 10.32 -- right for tensioned vinyl, which is flatter than paper but not
rigid. Picked off the test grid at 1:1: 3 is essentially straight, 6 barely
registers, 10 reads as tension waves in vinyl, and 16 wanders like loose cloth.

## lightGain stayed 0.3, but it was checked rather than copied

This face has the narrowest headroom in the catalog: median 237 against a
248.9 specular ceiling, so 11.9 luma levels get normalised across the full
0-255 range. That pushed a `#12305C` navy fill's p95 luma to 81.6, against the
business card's 59.3 and the paper bag's 66.4 -- close enough to the washout
that forced 0.3 in the first place to be worth measuring rather than assuming.

Blue identity, measured directly as the fraction of pixels where `b - r < 30`:

| Gain | p95 luma | Losing blue identity |
| --- | --- | --- |
| 0.15 | 62.4 | 0.00% |
| 0.20 | 68.5 | 0.00% |
| 0.25 | 74.7 | 0.00% |
| 0.30 | 80.8 | 0.00% |
| 0.40 | 93.0 | 0.00% |

Zero at every gain. The lift is uniform brightening, not a hue wash -- which is
what a specular highlight on vinyl should be -- so the shared value stands. The
p95 number alone would have argued for lowering it; the identity measurement is
what showed that would have been a change made on a proxy.

## The thumbnail bug this exposed

The generated thumbnail rendered a gold accent ring as mint green. The shipped
render path was innocent: sampling the shader maths at that position returned
191,137,74, the intended gold.

The fault was in the scratchpad thumbnail script's `put`. The banner zone is
603 wide, so `Z.w / 2` is **301.5**, and `Z.x + cx` is 512.5. That makes
`(y * W + x) * 4` an *integer* byte offset -- 446.5 * 4 is 1786 -- misaligned by
two bytes. A colour written there lands as blue, then alpha, then red on the
NEXT pixel. Gold (192,138,74) became blue=192, alpha=138, and a stray red on
its neighbour: mint green with a broken alpha.

Two things kept it hidden through three earlier templates:

- **White survives the misalignment.** 255,255,255 written two bytes off is
  still white. The banner's white ring looked perfect; only the asymmetric gold
  one showed the fault.
- **The earlier templates used integer centres.** The business card's zones are
  1340 wide and the paper bag's 1150, both even, so `w / 2` was an integer
  there. Verified after the fact: the business card thumbnail's gold bar decodes
  to 195,139,62, correct.

Fixed by flooring inside `put` rather than at the call sites, so no caller can
produce a misaligned write. The ring now decodes to 218,153,69.

Worth recording that the JPEG encoder was suspected first and cleared by
instrumenting it for out-of-range Huffman symbols (zero found), and that the
decisive test was reading the published file back through a real decoder in the
browser rather than trusting the buffer that produced it.

## Registration

Twenty files: the registry, the catalog card and card count in `index.html`,
sixteen further pages carrying the shared mega-menu, the editor's own Mockups
dropdown in `mockup.html`, and both places in `site/js/admin.js`. The taxonomy
note in the registry doc block and the factory's category hint gained
`print/signage`.

## Verification

- Zone purity 100.0000%, zero impure pixels, zero blown pixels.
- Editor loads at 1024x1536 and fetches exactly four maps, all 200 -- no
  `garment`, `tone` or `grain` requested.
- Colour field hidden (no `garmentColors`); Background panel VISIBLE, unlike
  the business card, since this base is a cut-out. A `#1F6F5C` fill measured
  31,111,92 behind the stand and between the feet, with the face unchanged at
  244,243,239.
- Zone switch correctly hidden, confirming the multi-zone UI added for the
  business card stays inert on a single-zone template.
- Thumbnail ring re-read through a real decoder: 218,153,69.

## Related

- `docs/implementation/TWO_ZONE_BUSINESS_CARD_MOCKUP.md` -- multi-zone support,
  which this template deliberately does not use.
- `docs/implementation/PAPER_BAG_MOCKUP.md` -- the dilation fix in the
  connected-region restriction.
- `docs/implementation/MOCKUP_ASSET_FOLDER_STRUCTURE.md` -- why the assets live
  under `print/signage/`.
