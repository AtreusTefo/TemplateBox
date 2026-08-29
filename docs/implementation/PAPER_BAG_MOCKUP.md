# White Paper Shopping Bag Mockup

Date: August 29, 2026
Status: Implemented

## Summary

`bag-paper-white` is the fourth photographic mockup template and the first that
is not cloth. It runs through the same pipeline the two apparel templates use
because that pipeline never depended on fabric: the classifier gates on
neutrality and brightness, which a white paper bag passes and a kraft one could
not.

Two things came out of it that are not specific to the bag. The factory's
connected-region restriction was computing connectivity on the raw classified
mask, which silently dropped 75% of the bag's rope handles; it now dilates
before flooding and intersects back. And the scratchpad PNG encoder was writing
filter 0 on every row, costing 22.4% on every map it has ever produced.

## The base photograph

Generated with a prompt written against the pipeline's actual gates rather than
against what a bag looks like. The clauses that mattered:

| Clause | The gate behind it |
| --- | --- |
| matte **white**, not kraft | `classify` requires `sat < 14`. Kraft measures around 70 and would classify as nothing at all, failing the derive outright with "No pixels classified as fabric". |
| fully transparent background | A white bag on a white backdrop is not separable by any threshold, and `background: true` needs a clear surround. |
| no hands, no model, no props | The cap photograph's defect: the model's white tee classified as the same surface, 22.5% of the mask. |
| handles clear of the front | The warp zone is four points on one plane; a handle crossing it puts a second surface inside the quad. |
| sharp gusset crease | Front panel and gusset are two planes. The crease is what allows the corners to be placed on the front alone. |
| no blown highlights | `tone` normalises to the surface peak. Pixels pinned at 255 flatten every dye. |
| no cast shadow | A ground shadow is baked into the base and would sit as grey over whatever the Background panel fills. |

### What it measured

2048x3072 RGBA, which is the largest base in the catalog (the cap is 1939x2400,
the shirt 1024x1536).

```
corner alpha              0, 0, 0, 0
clear (a<16)              2390006  (38.0%)
opaque (a>=250)           3791122  (60.3%)
classified as surface     3769045  (99.4% of opaque)
opaque saturation  p50/p90/p99   1 / 3 / 11        (gate is 14)
opaque luma        p1/p50/p99  192 / 223 / 244     (gate is >110)
blown (luma>=253)         4177  (0.11% of surface)
```

Saturation p99 of 11 against a gate of 14 is the number that made this base
usable. 149,186 fully-transparent pixels carried non-black RGB and were zeroed,
the same treatment the shirt's base had.

### Geometry

The front panel is bounded by the only two strong horizontal steps in a
row-mean scan: the rim fold at **y=868** (a +15.3 step in mean luma) and the
base gusset fold at **y=2600** (+3.9). Between them the surface spans
**x 192..1858**, constant to within two pixels over 1700 rows.

There is no interior vertical crease. Column means fall smoothly from 230 at
x=300 to 220 at x=1600 and back to 222 at x=1800, which is the left-hand key
light rather than a gusset edge -- the bag is square enough to the camera that
both gussets are hidden behind it. The whole panel width is therefore one
plane, and the zone is 1150 square centred on it, measured **100.00% surface**:
no alpha, no dark pixels, no saturated pixels.

## displaceStrength is 8, and lower is the correct direction

The prediction going in was wrong and worth recording. Paper creases are sharp,
so the expectation was a high gradient forcing a low strength. The bag measured
a gradient p99 of **9.94**, against the shirt's 41.5 and the cap's 30.3 -- a
filled bag photographed flat under soft light is nearly featureless, and its
creases are soft, not hard.

That does not mean raising the strength. The displacement map is normalised to
its own p99 (`mockup-admin.html`, the `p99` local in `derive`), so gradient
magnitude is divided out before encoding and a nearly flat surface has its
gentle creases stretched across the full encoded range. Strength is therefore
"offset in base pixels at p99", and on a flat surface the same number buys far
more visible warp than it does on a t-shirt.

Picked off the test grid at 1:1 rather than by arithmetic, which is the method
`mockup-admin.html` documents:

| Strength | Reads as |
| --- | --- |
| 4 | Straight. Too flat to show the surface at all. |
| **8** | Gentle undulation. Stiff paper. |
| 12 | Lines visibly wander. Cloth, not paper. |
| 18 | Melted. |

As a fraction of base width that is 0.39%, against the shirt's 1.56% and the
cap's 1.03%. Paper is the stiffest of the three surfaces, so the bottom of that
ordering is where it belongs.

`lightGain` stays at 0.3, and here it is comfortable rather than tight. A
`#12305C` navy fill measured p95 luma 66.4 against a source of 44.0 with 0.05%
of pixels losing blue identity; the same test on the shirt at gain 1.0 gave p95
159 and lost a quarter of the print, which is what set 0.3 in the first place.

## No grain map, and that is the material

The weave measured 2.68 luma levels, above the 2.0 floor, so a grain map could
have been derived. It is deliberately absent. `renderGarmentTint` samples
`grain` only when a colourway declares a `heather` fraction, and paper has no
fibre blend -- there are no heather colourways for it to serve. Deriving it
anyway would have shipped roughly 1.5MB that `ensurePhotoAssets` loads and
nothing ever reads. The extras list filters on presence
(`.filter((k) => tpl[k])`), so omitting the key drops the request; the editor
was verified to fetch exactly six maps.

The colourways are `original`, `kraft`, `black`, `navy`, `red`, `forest`.
**Kraft Brown is the colourway that justifies the white base**: a photographed
kraft bag could never have been derived, and dyeing white to `#C29A6B` produces
the same product from a base the pipeline can actually read.

## The connectivity fix, which is not specific to this template

`restrictToPrintedGarment` keeps only the surface connected to the print zone.
It was flooding the raw classified mask, and on this photograph that dropped
most of the handles: twisted paper rope carries 1-3px grooves that fall below
the luma gate, and each groove reads as the end of the region. The flood
climbed **25.2%** of the handle band and stopped.

The failure was invisible until someone picked a colour. Recolour dyed the bag
body and left white handles with a partial gradient where the flood died --
and the first version of the derive script reported "handles kept" because its
check counted everything above the rim fold, a band the 192,000-pixel rim
satisfies on its own. A check that cannot fail is not evidence.

The fix is to compute connectivity on a dilated copy and intersect back, so
thin internal breaks are bridged while genuinely separate regions stay separate.
Measured on both photographs at every radius:

| Radius | Bag handles | Bag panel | Cap zone | Cap: model's tee |
| --- | --- | --- | --- | --- |
| 0 | 25.2% | 100% | 100% | 0.0% |
| 1 | 41.5% | 100% | 100% | 0.0% |
| 2 | 61.9% | 100% | 100% | 0.0% |
| 3 | 87.1% | 100% | 100% | 0.0% |
| 4 | 87.1% | 100% | 100% | 0.0% |
| **6** | **98.9%** | 100% | 100% | **0.0%** |

Radius 6 is the measured minimum that carries a handle, and it does not weaken
the separation the function exists for. The cap's tee -- the whole reason the
restriction was written -- stays fully excluded at every radius, because the gap
across the model's face is orders of magnitude wider than a groove. Raising it
past 6 trades real separation away for nothing.

Two details in the port: the largest-region tie-break counts **original** fabric
pixels rather than dilated ones, since dilation inflates a thin sprawling region
proportionally more than a compact one; and the seed only has to land in the
dilated region, which is exactly the case where a zone centre sits on a groove.

The shipped tool was verified by extracting the function from
`site/tools/mockup-admin.html` itself and running it against all three
photographs, rather than a copy of it:

```
BAG  classified 3769045   dropped    420 (0.01%)   handles 98.9%   panel 100.0%
CAP  classified 1327148   dropped 298943 (22.53%)  cap zone 100%   tee 0.0%
TEE  classified  646814   dropped     73 (0.01%)   print zone 100.0%
```

The cap's shipped maps were derived under the old algorithm and are 563 pixels
different from what the new one would produce. They were not regenerated: the
difference is isolated specks, the tee is excluded either way, and the registry
comment's "299,506px, 22.6%" remains accurate for the assets on disk.

### Feathering on thin structures

98.9% of handle pixels are in the mask, but only 44.6% at full alpha -- the
mask is feathered with a radius-1 double blur, and rope is thin enough that
much of it lands mid-range. The handles therefore tint more lightly than the
body (measured 221,202,181 mid-handle against 180,143,99 on the panel under
kraft). That reads correctly for twisted paper rope catching more light, and no
change was made for it, but it is the reason a thin structure will never dye to
full strength through this mask.

## Weight

The template is 11.3MB across six maps, the heaviest in the catalog:

| Template | Base | All maps |
| --- | --- | --- |
| tshirt-model-white (1024x1536) | 2.0MB | 4.8MB |
| cap-model-white (1939x2400) | 4.3MB | 9.1MB |
| bag-paper-white (2048x3072) | 4.3MB | 11.3MB |

Opening this template downloads all of it. That is a real cost and it is not
addressed here. The two honest options, neither taken: derive the maps at half
resolution (they are sampled as textures with bilinear filtering, so the engine
would not care, but it changes the factory's output convention for every
template), or the object-storage migration the registry's scale note already
describes. The base was kept at native resolution because downscaling would push
the weave below the grain floor and discard real data to solve a problem that
has a better answer.

The scratchpad PNG encoder was writing filter 0 on every row; adding the
standard adaptive per-row filter heuristic cut the base from 5.54MB to 4.30MB,
verified byte-identical on decode. The figures above are all post-fix.

## Registration points

Twenty files, which is what adding a photographic template costs:

- `site/js/mockup-templates.js` -- the registry entry.
- `site/index.html` -- catalog card, mega-menu item, and the catalog-empty
  message's card count (17 to 20; the suite asserts this against the real
  number of `.template-card` elements).
- Sixteen further pages carrying the shared mega-menu.
- `site/mockup.html` -- the editor's own Mockups dropdown, "Print and
  Packaging" column.
- `site/js/admin.js` -- the generated copy of the mega-menu (`MEGA_MENU`) and
  the thumbnail picker's `CATALOG_ITEMS`.

`cap-model-white` was missing from the editor's dropdown entirely -- it had been
added to the sitewide mega-menu and the catalog when the cap shipped, but not to
the editor's own list, so a visitor already inside the editor had no route to it.
Added alongside the bag.

## Verification

- Zone purity 100.00%: no alpha, no dark, no saturated pixels under the print
  area.
- Editor loads the template at 2048x3072 and fetches exactly six maps, all 200,
  confirming `grain` is correctly absent.
- Recolour to Kraft Brown measured in the live canvas: panel 180,143,99, base
  band 174,138,96, handles 221,202,181, outside the mask 0,0,0,0.
- Navy washout across five gains; 0.3 selected.
- Strength sweep rendered at 1:1 through the shader's own maths
  (`mockup-displace.js` lines 63-90 reimplemented in node).
- Factory's `restrictToPrintedGarment` extracted from the shipped file and run
  against all three photographs.
- `node tests/verify-layout.js`: 1172 passed, 0 failed.

## Related

- `docs/implementation/FABRIC_DISPLACEMENT_APPAREL_MOCKUPS.md` -- the seven-map
  pipeline and the factory that derives it.
- `docs/implementation/PHOTO_MOCKUP_TEMPLATES_IMPLEMENTATION.md` -- the registry
  and the workflow for adding a template.
- `docs/implementation/MOCKUP_ASSET_FOLDER_STRUCTURE.md` -- why the assets live
  under `packaging/bags/`.
