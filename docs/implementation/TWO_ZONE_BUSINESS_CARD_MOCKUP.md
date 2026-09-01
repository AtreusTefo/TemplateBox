# Two-Zone Business Card Mockup

Date: August 30, 2026
Status: Implemented

## Summary

`card-white-walnut` is the fifth photographic mockup template and the first to
break two assumptions the engine had held since photographic templates existed:
that a template has exactly one printable surface, and that its base is a
cut-out on transparency.

It is two blank white business cards on dark walnut, and each card takes its
own independent design. That required multi-zone support in the editor -- a
per-layer surface assignment, a Front/Back switch, and a rendering path that
covers every surface in one shading pass.

## The base photograph

2400x3000, opaque, aspect exactly 0.800 -- the first base that already matches
the catalog card's 4:5, so its thumbnail is a straight downscale with no crop
and no letterboxing.

The prompt was written against the classifier rather than against what a
business card looks like, because with an opaque scene there is no alpha to
separate product from background and `sat < 14 && luma > 110` is the only
discriminator left. The measurements:

```
opaque (a>=250)           7200000  (100.0%)
classified                2224659  (30.90% of image)
connected regions         2                       <- the two cards, nothing else
card  luma p1/p50/p99   236 / 241 / 245     sat p50/p99   2 / 4
wood  luma p1/p50/p99     9 /  34 /  72     sat p50/p99  26 / 53
```

Card and wood are 164 luma levels apart and the wood fails the saturation gate
by a factor of two, so the separation needs no help. **A light background would
have made this base unusable**: white marble measures roughly 5 saturation and
238 luma, which classifies as card and takes the whole frame with it.

### Geometry

Both cards are axis-aligned rectangles with identical left and right edges
(x 526..1871), 1346 wide, separated by **163px of bare wood**:

| Card | Modal rect | Size |
| --- | --- | --- |
| A (front) | x 526..1871, y 575..1400 | 1346x826 |
| B (back) | x 526..1871, y 1564..2390 | 1346x827 |

Inset by 3 and trimmed to a common height, both zones are **1340x820 and
identical to the pixel**, so a design renders at the same scale on either card.
Both measured **100.0000% purity, zero impure pixels**.

Both cards had to be axis-aligned because `zoneIsRect` tests exact horizontal
and vertical edges, and `paintDesign` checks the warp path FIRST and returns --
so a single tilted card would have cost BOTH cards their displacement and
lighting, not just itself.

### Blown pixels are all at the edges

0.413% of card pixels sit at or above luma 253, which is four times the paper
bag's rate. They are **100% within 40px of a zone edge** -- the specular rim on
the card's cut edge, not hotspots on the face. `hi` is the 99.5th percentile,
so a fraction of a percent at the border cannot pin it, and no regeneration was
needed.

## Multi-zone support

### Registry

A template declares `warpZones` (an array of quads) and `zoneLabels`. `warpZone`
remains and is `warpZones[0]`: every path that predates this reads it, and the
validator requires it. `zonesOf(tpl)` returns `tpl.warpZones || [tpl.warpZone]`,
so single-zone templates never branch.

An invalid extra zone rejects the whole template rather than silently printing
on one card and not the other.

### Layers belong to a surface

Each layer carries `zone`. `addLayer` stamps it with the surface being edited;
`persist` writes it; restore clamps it through `numberIn(row.zone, 0,
MAX_ZONES - 1, 0)`. Every layer saved before this existed has no `zone` and
reads as 0, so old state restores unchanged.

`layerZone()` re-clamps against the LIVE template's zone count on every read.
That matters because the product and the layers are restored separately -- a
layer saved on card 2 of the business card template must not point at a
non-existent second surface after switching to a t-shirt.

### One shading pass, not two

`renderFabricSheet` builds a canvas-sized sheet and now loops the surfaces,
clipping to each and painting only that surface's layers. The displacement,
shading and specular maps already cover the whole photograph and the shader
discards where the sheet is empty, so **two cards still cost one GPU pass**.

`paintLayers` gained a `zoneIndex`. When it is absent -- the vector products and
the flattened export sheet -- behaviour is exactly as before. When present, a
layer on another surface is skipped INCLUDING its hit rectangle, because the
caller loops the surfaces and each pass must leave the others' rectangles
alone rather than nulling them.

Hit-testing needed no other change: each surface records its layers' rectangles
in canvas coordinates, so a click lands on the right layer wherever it is.

`drawLayersInArea` treats emptiness per surface, so a design on the front does
not suppress the "Upload your design" prompt on the back -- without that, an
undesigned second card reads as part of the photograph.

### The Front/Back switch

A `.zone-switch` above the layer list, built in JS and hidden entirely below two
surfaces, so every other template is byte-identical to having no switch. It
moves the EDITING focus, not what renders: both cards always paint their own
designs. It decides which surface an upload lands on and which surface's layers
the list shows.

Switching surfaces clears the selection, because the selected layer lives on the
surface being left and would otherwise point the size and rotation controls at a
row the list no longer shows. Selecting a layer by clicking the canvas follows
it to its surface, so the list, the controls and the selection always agree.

## The connectivity change this forced

The restriction that keeps only surface connected to the print zone seeded from
ONE zone centre. With 163px of bare wood between the cards, that keeps the
seeded card and discards the other -- and a discarded card renders its design
with no shading and stays undyed on recolour. Dilation cannot rescue it: radius
6 bridges a rope groove, not a deliberate gap.

Measured against the shipped tool with a single seed, which is what its picker
supplies:

```
CARD  classified 2224659   dropped 1113032 (50.03%)
      card A (seeded)   100.0%
      card B (not)        0.0%
```

The derive seeds from **both** zone centres, and both cards come through at
100%. `restrictToPrintedGarment` in `site/tools/mockup-admin.html` now takes a
list of seeds rather than one, so the tool cannot silently produce a
half-masked template; its picker still supplies a single zone, and a second
zone added to the registry by hand must be added to the derive as a second seed.

Re-verified against all four photographs by extracting the function from the
shipped file:

```
BAG   dropped    420 (0.01%)   handles 98.9%   panel 100.0%
CAP   dropped 298943 (22.53%)  cap zone 100%   tee 0.0%
TEE   dropped     73 (0.01%)   print zone 100.0%
CARD  dropped 1113032 (50.03%) card A 100%     card B 0.0%   (one seed)
```

The three existing templates are unchanged to the pixel.

## displaceStrength is 4, the lowest in the catalog

Gradient p99 measured **4.54**, against the bag's 10.32, the cap's 30.3 and the
shirt's 41.5. A printed card lying flat on a desk is as close to a plane as this
catalog gets, so the map is normalising something very near paper noise.

Off the test grid at 1:1: 7 already reads as a buckled card, 12 ripples
outright, and 2 is indistinguishable from a flat digital paste. 4 keeps a trace
of surface without implying the card is warped.

| Template | Base width | Strength | % of width |
| --- | --- | --- | --- |
| tshirt-model-white | 1024 | 16 | 1.56% |
| cap-model-white | 1939 | 20 | 1.03% |
| bag-paper-white | 2048 | 8 | 0.39% |
| **card-white-walnut** | **2400** | **4** | **0.17%** |

`lightGain` stays 0.3: a `#12305C` navy fill measured p95 luma 59.3 against a
source of 44.0, comfortably clear of the washout that set the value originally.

No `grain` map, for the same reason the paper bag has none -- it exists to
screen undyed fibre over a heather blend and card stock has no blend.

## No Background panel

The base is an opaque scene, so the template declares no `background` flag and
the Background colour panel correctly never appears: the walnut is the product,
not a backdrop with something behind it to fill. Verified in the browser --
`#m-bg-field` is hidden.

Card stock recolour is separate and is offered: white, ivory, kraft, navy,
black.

## PNG encoder: RGB when opaque

This is the first base that needs no alpha channel, and the scratchpad encoder
was writing colour type 6 unconditionally -- three quarters of a byte per pixel
wasted before compression. It now writes colour type 2 when every pixel is
opaque, which applies to every derived map except `garment` as well.

It also picks the smaller of adaptive per-row filtering and filter 0. Adaptive
filtering wins on smooth gradient maps and LOSES on photographic noise: on this
walnut scene it came out 13.2% larger, because per-row minimum-sum picks badly
when every row is high-frequency. Both are deflated and the smaller kept.

Base went 7.70MB (adaptive RGBA) to 6.90MB, against the generator's own 6.80MB.
Round-trip verified byte-identical.

## Verification

- Both zones 100.0000% purity, zero impure pixels.
- Both zones 100% retained after the two-seed restriction; nothing dropped.
- Editor loads at 2400x3000, fetches six maps, no `grain`, no console errors.
- Zone switch renders Front/Back; Background field hidden.
- Two different designs driven through the real upload path (mime validation
  included): the Back list showed 0 rows before its own upload, state persisted
  `zone: 0` and `zone: 1`, and the canvas measured crimson 192,57,43 on card A
  against the yellow disc on card B, with the wood between untouched.
- `node tests/verify-layout.js`: 1240 passed, 1 failed.

The one failure is section 4, "ads blocked: layout identical to the last
commit", which compares the working tree against `git archive HEAD`. Four of its
five differing measurements are `index` main and feed heights at 880 and 768 --
the added catalog card making the feed taller, which is expected content growth
and resolves on commit.

The fifth, a resume preview pane ~17px shorter, **is not caused by this work and
reproduces with zero changes**: stashing every tracked change so both sides are
byte-identical still fails it, and the two values SWAP between runs (770.8 vs
788, then 788 vs 770.8). Same files, different measurement depending on which
server rendered first. The resume preview is text-heavy and the pages load
Google Fonts through a `media="print"` onload swap, so a webfont race is the
likely cause. Logged separately; a check that fails at HEAD cannot gate anything.

## Related

- `docs/implementation/PAPER_BAG_MOCKUP.md` -- the dilation fix this builds on.
- `docs/implementation/FABRIC_DISPLACEMENT_APPAREL_MOCKUPS.md` -- the map
  pipeline.
- `docs/implementation/MOCKUP_ASSET_FOLDER_STRUCTURE.md` -- why the assets live
  under `print/business-cards/`.
