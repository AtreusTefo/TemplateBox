# Fabric Displacement for Apparel Mockups

Date: August 18, 2026

## Overview

Photographic apparel mockups now bend the uploaded artwork around the folds of
the garment and shade it with the garment's own light, in a single WebGL pass.
This is the step that separates an apparel mockup from a sticker.

The existing Sandwich Method (base photograph, artwork placed into a
`warpZone`, `multiply` overlay) is already photorealistic for a **rigid** flat
surface -- the `wood-a4` frame, a business card, a box face. It is not
sufficient for fabric. The `multiply` overlay darkens a print where a crease
falls across it but does not *move* it, so the artwork stays geometrically flat
while the shirt underneath does not, and the eye reads it instantly as a decal.

The first template using it is `tshirt-model-white`.

## Files Added

| File | Purpose |
|---|---|
| `site/js/mockup-displace.js` | `window.TB_Displace`: WebGL displacement + shading pass. One draw call, no dependencies, no CDN. |
| `site/assets/mockups/tshirt-model-white-base.png` | Base photograph, 1024x1536 RGBA, garment at alpha 253 with a soft cut-out edge. Transparent-region RGB zeroed (see the audit). |
| `site/assets/mockups/tshirt-model-white-displace.png` | Displacement map. |
| `site/assets/mockups/tshirt-model-white-shade.png` | Shading map, multiplied into the artwork. |
| `site/assets/mockups/tshirt-model-white-light.png` | Specular map, screened onto the artwork. |
| `site/assets/mockups/tshirt-model-white-tone.png` | Diffuse response, multiplied by the dye colour on recolour. |
| `site/assets/mockups/tshirt-model-white-garment.png` | Feathered, hole-filled garment mask confining recolour. |
| `site/assets/mockups/tshirt-model-white-grain.png` | High-pass of the weave, screened back on for heather colourways. |
| `site/assets/thumbnails/product-mockups/apparel/tshirt-model-white-thumb.jpg` | Catalog thumbnail, 600x750, 46KB. |

## Files Modified

- `site/js/mockup.js` - `ensurePhotoAssets()` loads the two new maps; new
  `renderFabricSheet()`; `drawPhoto()` gained the displacement branch and the
  `backing` rule.
- `site/js/mockup-templates.js` - entry contract extended with `displace`,
  `shade`, `displaceStrength` and `backing`; the `tshirt-model-white` entry.
- `site/mockup.html` - `js/mockup-displace.js` include, before `js/mockup.js`.
- `site/index.html` - catalog card. There is no hero template count to update
  any more; the masthead carrying it was removed on August 9, 2026.
- `site/tools/mockup-admin.html` - rebuilt from a coordinate picker into the
  full template factory (see below).

## The Maps

All are the full size of the base photograph and are registered to it
pixel-for-pixel.

**`<id>-displace.png`** - R is the horizontal offset, G the vertical, 128 is
no offset, and the map is neutral grey off-garment. The encoding is
deliberately **Photoshop's Displace convention**, so a greyscale displacement
map exported from a purchased mockup PSD drops in unchanged: such a map has
R == G, which this shader reads as an equal x/y shift -- exactly the diagonal
displacement Photoshop applies.

**`<id>-shade.png`** - greyscale luminance measured against the fabric's
median, where 255 leaves the artwork untouched. Multiplied into the artwork.

**`<id>-light.png`** - everything above that median, screened onto the
artwork so a fold ridge lifts the ink.

**`<id>-tone.png`** - luminance normalised to the garment's peak. Recolour
only. Kept separate from the pair above on purpose; the audit records why.

**`<id>-garment.png`** - alpha mask of the garment, hole-filled and
feathered. Recolour only.

**`<id>-grain.png`** - high-pass of the weave, centred at 128 and black
off-garment. Screened back over a heather colourway as the undyed fibre;
untouched by solid dyes.

### The shading multiplies into the artwork, not over the canvas

This is the one structural departure from the `overlay` / `overlayBlend` path,
and it is load-bearing. A full-canvas `multiply` overlay shades **every pixel
it covers**. On a frame that is harmless, because the overlay's non-transparent
pixels are confined to the print window. On a garment the shading covers the
whole shirt, so wherever the design does not reach, the overlay would darken
the photograph a second time -- the fabric would visibly deepen in a rectangle
around the artwork.

Folding the shading into the same GPU pass that does the displacement means it
only ever touches artwork pixels. Untouched fabric renders exactly as
photographed. `overlayBlend` is unchanged and remains correct for rigid
templates; `tshirt-model-white` declares `overlay: null` and carries no
full-canvas layer at all.

The shading is sampled at the **undisplaced** position: it belongs to the
garment's surface at that point on screen, not to the piece of artwork that got
pulled into it.

## Deriving the Maps From the Photograph Alone

No AI model is involved, and an earlier plan to use one was wrong.

Monocular depth estimation (Depth Anything V2 via `transformers.js`) was the
first proposal for generating the displacement map. Measuring the photograph
showed it to be the wrong tool: a depth model returns *body* geometry -- the
smooth barrel of the torso -- at roughly 518px input, which discards exactly
the high-frequency fold detail that sells the effect. The folds are already
encoded in the photograph's own luminance at full resolution.

The derivation is therefore plain arithmetic:

1. Classify fabric: `alpha >= 250 && saturation < 14 && luma > 110`. On this
   photograph it separates cleanly -- fabric saturation averages
   3, skin 52, and the jeans fall out on luma.
2. Fill non-fabric with the fabric mean **before** blurring, so the garment's
   silhouette does not leak a huge false gradient into the map.
3. Gaussian-approximate blur (box blur, radius 5, three passes).
4. Sobel gradient of the blurred luminance; scale by the 99th percentile of
   gradient magnitude inside the fabric; encode into R/G around 128.
5. Shading and specular from `luma * 0.6 + smoothed * 0.4`, split around the
   fabric's **median** (see the audit -- normalising to a near-peak reference
   left the whole print uniformly dimmed).
6. Tone map for recolour: the same mix normalised to the 99.5th percentile.

Measured: 646,814 fabric pixels (41.1% of frame), fabric mean luma 223.3,
median 230.5, specular ceiling 249.3. Resulting shade map min 137 / mean
242.5; light map covers 49.5% of the fabric.

This now runs in `tools/mockup-admin.html`. See "The Template Factory".

## No Occlusion Mask Is Needed (for this photograph)

An alpha mask of the printable region is required in general -- arms, hair and
hems occlude the chest on many poses. It is *not* required here. The print zone
was measured at 100% fabric: 0% skin, 0% background, 0% dark. A straight-on
model shot with arms at the sides does not need one, which is what made this a
cheap first template.

## Print Zone Placement

`warpZone` for `tshirt-model-white` is `x 311-729, y 548-1105` (418x557).

Derived from garment anatomy rather than guessed: centreline x=520, neckline
bottom y=444, hem y=1419. 975px from collar to hem reads as 28 inches, giving
34.8 px/inch, so a real 12x16in DTG print area is 418x557 and starts 3 inches
below the collar.

## Drag Still Works

Unlike the perspective-warp path -- which cannot map a pointer back into sheet
space and therefore drops every layer's hit rect -- displacement shifts artwork
by at most `displaceStrength` pixels. `renderFabricSheet()` records hit rects
normally, so drag-to-position and the resize/rotate handles behave exactly as
they do on a vector product.

## Fallback Tiers

`TB_Displace.render()` returns `null` when WebGL is unavailable, and callers
must treat that as "draw the sheet unchanged" rather than as an error -- the
same discipline `drawWarpedDesign()` already follows. A template whose
displacement map fails to load renders flat, which is precisely what every
template did before this existed.

## The `backing` Field

A white sheet behind the artwork reads as the paper behind a matted print and
keeps exports opaque behind a transparent "window" base. A garment must not
have one, or a white rectangle appears on the shirt.

Templates may state it outright; absent that, only `mode: "window"` gets one.
This changes the default for `mode: "surface"`, which previously also drew the
backing unconditionally. No shipping template used `surface` mode, so nothing
regressed.

## Verification (August 18, 2026)

- Full suite: `node tests/verify-layout.js` -- **882 passed, 0 failed**.
- End-to-end through the production upload path, using the `DataTransfer`
  technique established on July 30: a grid PNG was built with `canvas.toBlob`,
  assigned to `#m-design` and a `change` event dispatched, so mime validation,
  `FileReader`, decode and `drawPhoto()` all ran unmodified. Result: layer
  added, canvas sized to the base's native 1024x1536, aria-label "White T-Shirt
  on Model mockup preview", colour field hidden, `toDataURL()` succeeded
  (canvas untainted), error element empty.
- Displacement confirmed active, not merely present: rendering the same grid
  design with and without the pass gave a mean per-channel difference of
  **24.1/255** inside the print zone. A grid is the diagnostic case -- straight
  lines have nowhere to hide, and they visibly waver along real fold structure.
- Sampled artwork colour survives the shading: yellow `#F5C542` (245,197,66)
  rendered (233,187,63), i.e. shaded not washed out.
- Off-garment pixels untouched: the photograph's transparent corner still reads
  (0,0,0) with the design in place.
- Catalog card resolves, thumbnail loads at 600x750.

## The Template Factory

`site/tools/mockup-admin.html` was the coordinate picker; it is now the whole
pipeline. Adding an apparel template is a single pass through one page, with
no scratch script and no image editor:

1. **Load the base photograph.** Pixels are read once at natural size and
   every derivation works from that buffer.
2. **Suggest chest print zone.** Finds the garment centreline (median fabric
   span centre across the middle band, so sleeves and hem do not skew it),
   then the collar and hem on that centreline, and lays out a real 12x16in
   DTG area starting 3in below the collar. It then shrinks the zone toward
   the centre until it is >=99.9% fabric, so a zone is never proposed across
   a sleeve seam or a bare arm. Corners can still be clicked by hand.
3. **Analyse and generate maps.** The classification thresholds (alpha,
   saturation, luma) and blur radius are exposed, and a **fabric mask preview**
   is rendered beside the two maps -- green must cover the garment and nothing
   else. This is the check that makes the thresholds safe to expose: a bad
   classification is visible rather than silently baked into the maps.
4. **Tune `displaceStrength`** against a test grid, live. The preview loads
   `../js/mockup-displace.js` -- **the same shader the editor ships** -- so
   what is tuned here is what visitors get, and the two cannot drift.
5. **Generate the thumbnail.** 4:5 crop centred on the print area, flattened
   onto white, JPEG-encoded by the browser, with the byte size reported and
   flagged when it exceeds the 100KB catalog guideline.
6. **Download and paste.** Every filename is derived from the template id, so
   the id and its assets cannot drift apart. The emitted entry switches shape
   on the fabric checkbox: fabric templates get `displace`/`shade`/
   `displaceStrength`/`backing: null` and `overlay: null`, rigid ones keep
   `overlay`/`overlayBlend`.

### Verified against the hand-built template (August 18, 2026)

The tool was driven against the same photograph the first template was built
from, through its own file input and buttons.

| | by hand (node) | admin tool |
|---|---|---|
| Suggested zone | 418x557 at 311,548 | **418x558 at 310,549** |
| Centreline / collar / hem | 520 / 444 / 1419 | **519 / 444 / 1420** |
| px per inch | 34.8 | **34.9** |
| Fabric pixels | 646,814 (41.1%) | **646,787 (41.1%)** |
| Fabric mean luma | 223.3 | **223.3** |
| Reference white | 247.2 | **247.2** |
| Gradient p99 | 32.22 | **32.19** |
| Shade min/max/mean | 127 / 255 / 230.5 | **127 / 255 / 230.5** |

Derivation took 1.05s on the 1024x1536 base.

The generated maps were captured through the tool's own download path (by
intercepting the object URL `save()` creates) and compared pixel-by-pixel
against the shipped assets: mean absolute difference **0.14/255** on the
displacement map and **0.004/255** on the shading map, with 0.04% and 0.004%
of samples differing by more than 1. Those differences sit on
fabric-classification boundaries, where the browser's colour-managed PNG
decode disagrees marginally with node's raw sample read and a pixel flips
between neutral grey and a real gradient value. Immaterial to the render.

Thumbnail output: 600x750, 36KB -- byte-for-byte the same size the browser
encoder produced for the shipped asset.

## Audit and Rework (August 18, 2026)

A defect pass over the first template and the factory, benchmarked against
what Placeit and Mockey produce.

### Measurement method

A solid `#D8232A` (R=216) fill sized to the whole print zone. A flat fill is
the only design where every rendered pixel has a known ground truth, so any
deviation is the pipeline's doing. Red is detected by **hue** (`R > G*1.6 &&
R > B*1.6`), never by brightness -- an early attempt thresholded on `R > 150`
and silently measured the shading instead of the geometry, reporting a
non-existent 184px placement error.

### What was NOT wrong

- **No displacement bleed outside the print zone.** The shader samples
  `sheet(uv + offset)`, so artwork could in principle appear outside the
  clip. Measured: 0 pixels between 1 and 16px beyond the zone. The 1,446
  "stray" pixels an early pass reported were the editor's own selection
  chrome (`#B5352E` = 181,53,46, which satisfies any naive red test) plus the
  model's lips.
- **No placement error.** Left/right edge insets measured 48.9 and 53.4px --
  symmetric, i.e. correctly centred. The asymmetry seen first (184 vs 86) was
  a 35% design size and an offset persisted in `tb_mockup_v1` from earlier
  testing, not a rendering fault.

### Defects found and fixed

**1. `mediump` shader precision drifted the ink.** A source R of 216 rendered
at 222, roughly 3%, visible as a colour shift across a large flat fill. Now
`highp` where `GL_FRAGMENT_PRECISION_HIGH` is defined, `mediump` otherwise.

**2. An absent shade map still sampled its texture unit.** The old shader read
`mix(vec3(1.0), texture2D(u_shade, v_uv).rgb, u_hasShade)`, and `mix()`
evaluates every argument -- so a template with no shading map performed an
incomplete-texture read that returns black and warns, even though the result
was discarded. Both optional maps are now branched, not mixed.

**3. Highlights were thrown away entirely, and the whole print was dimmed.**
This was the significant one. The reference white was the **97th percentile**
of fabric luma, which by construction leaves 97% of the garment reading as
"in shadow": the measured median multiplier was 0.935, so a print came out
uniformly dulled rather than modelled, and multiply cannot brighten, so a
fold ridge catching the light did nothing at all.

Shading and specular are now split around the fabric's **median**. The
multiply layer is neutral at the median and only darkens the genuinely
shadowed half; everything above the median becomes a separate **screen**
layer, normalised to the 99.5th percentile so one blown pixel cannot flatten
the range. This is what Placeit and Mockey both do -- model light as well as
shadow -- and it is the difference between a print that sits on the fabric
and one that is lit by the same light.

Measured on the print area, same design before and after:

| | 97th-pct reference | median split |
|---|---|---|
| Mean ink R (source 216) | 200.4 (dimmed 7.2%) | **213.8** (neutral) |
| Pixels brighter than source | 0.1% | **39.7%** |
| Pixels darker than source | 99.8% | 56.9% |
| Contrast (standard deviation) | 10.56 | **12.98** (+23%) |
| Lit fabric | 2.8% | **49.5%** |

**4. The base photograph carried junk RGB.** 540,712 fully transparent pixels
held non-black colour from the generator's cutout -- including pure red. Every
consumer currently tests alpha first, so nothing was visibly wrong, but it is
a landmine for any future premultiply, blur or filter step that reads RGB
without checking alpha. The channel is now zeroed under full transparency.

**5. Factory: stale maps after a threshold change.** Editing any threshold
after a derive left the previous run's maps on screen and behind the download
buttons, silently disagreeing with the statistics printed beside them. The
tool now flags the mismatch and asks for a re-run.

**6. Factory: the suggested zone was never clamped to the image.** A garment
close to the frame edge could produce a rectangle partly outside the base,
which is meaningless as a print area. Now clamped.

### New outputs

The factory emits two further maps: `<id>-light.png` (the screen layer) and
`<id>-garment.png` (a fabric alpha mask). A **specular gain** slider tunes the
highlight live, and its value lands in the registry as `lightGain`.

`garment` is generated and shipped but **no renderer reads it yet**, so
`js/mockup.js` deliberately does not fetch it -- an asset nothing consumes is
pure cost. It is the foundation for recolour (below) and the fetch should be
added in the same change that uses it.

### Garment recolour (implemented August 18, 2026)

Placeit's and Mockey's headline apparel feature. A recoloured shirt is the
shading already derived, tinted -- no per-colour assets and no new
photography. Declaring both `garment` and `garmentColors` turns the colour
field on; the existing swatch machinery, the hex field, the RGB inputs, the
picker and the EyeDropper all work unchanged, so a visitor is not limited to
the palette.

**Recolour uses its own map, and that is the point.** The obvious approach --
reuse the `shade`/`light` pair the print pass uses -- is wrong, and measurably
so: navy came out **(140,146,159)**, a pale blue-grey. On a WHITE garment the
"specular" map is mostly bright *diffuse*, not surface reflection, so
screening it over a dye lifts the colour toward white. A dye does not work
that way; it scales the diffuse response and can only darken.

So recolour multiplies a dedicated **`tone`** map -- luminance normalised to
the garment's own 99.5th percentile -- and screens nothing:

| colourway | target | peak | hem | deep fold |
|---|---|---|---|---|
| Navy | 31,42,68 | 30,40,65 | 27,37,60 | 23,31,51 |
| Black | 26,26,26 | 25,25,25 | 23,23,23 | 19,19,19 |
| Red | 181,53,46 | 174,51,44 | 159,47,40 | 136,40,34 |
| Sand | 216,199,169 | 208,191,162 | 190,175,148 | 162,149,127 |

Every colour lands on its target where the garment is evenly lit and darkens
only where it genuinely folds. Skin, hair, jeans and background measured
**byte-identical across all five colourways** -- the feathered mask confines
the tint completely.

Two defects were found and fixed while building it:

- **A first-time visitor met a black shirt.** `currentColor` defaults to
  `"black"` at module level, which is sensible for a *drawn* garment but on a
  photographic template tinted the shirt before the visitor asked for
  anything -- and contradicted the catalog card they had just clicked. A
  photographic template now opens on its `original` entry unless a colour was
  genuinely restored for that same product.
- **The mask had hard edges and interior holes.** A binary mask composited
  over an antialiased photograph leaves a 1px seam of the original colour all
  round the garment, and 205 pixels of deep fold fell under the luma
  threshold and would have punched visible holes through a recoloured shirt.
  The mask is now hole-filled by flooding the background inward from the
  border, then feathered.

The canvas `aria-label` names the colourway (`"... in Navy mockup preview"`).
With the template picker gone it is the only thing naming the mockup, so
without this a screen-reader user would get no feedback that choosing a
colour did anything.

### Heather and marl colourways (August 18, 2026)

A heather is dyed fibre interleaved with fibre that missed the dye, so it
needs two things a solid dye does not: the **mean lift** toward natural cotton
and the **fibre speckle**. `tone` can only multiply, so it can darken a dye but
can never produce a fibre lighter than it -- which is why a heather rendered as
a flat dye before this.

- The mean is exact arithmetic on the hex: mix the dye toward natural cotton
  (`#F2F0EC`, not pure white -- mixing toward `#FFFFFF` gives a heather that
  reads as faded rather than blended) by the colourway's `heather` fraction.
- The speckle is the photograph's **own weave**, screened back on: a tight
  high-pass (radius 2) of the fabric luma, centred at 128. The radius is
  deliberately much tighter than the displacement blur -- a wide one would
  pull fold shading into the grain, and folds already live in `tone`, so
  doubling them reads as dirt rather than fibre.

The `hex` stays the **full-strength dye**; the renderer does the mixing.
Writing the already-faded colour into the registry instead would give the
right average and no fibre at all.

Measured on bare fabric clear of the print zone, in 9x9 windows so that fold
gradients largely cancel and what is left is fibre-scale:

| colourway | mean luma | fibre SD | sampled RGB |
|---|---|---|---|
| Navy (solid) | 37.0 | 0.368 | 27,37,59 |
| Heather Navy | 78.9 | **2.536** | 72,79,96 |
| Heather Grey | 170.3 | **4.013** | 170,169,166 |
| Black (solid) | 23.0 | 0.321 | 23,23,23 |

Heather Navy carries 6.9x the fibre variation of the same dye rendered solid,
and Heather Grey 12.5x that of solid black. The speckle amplitude lands at
roughly the photograph's own weave (high-pass sd 4.04 luma levels), because
that is literally where it comes from.

**The heather fraction is a property of the blend, not a constant.** Grey and
navy were first given the same 0.42 and navy came out **(117,121,133)** -- a
pale blue-grey with no navy left in it. A grey heather really is mostly undyed
fibre; a navy one is not. Grey sits at 0.55, navy at 0.20.

The factory reports `weave (grain) sd` and warns below roughly 2 luma levels,
where a photograph is too smooth for a heather colourway to read as fibre at
all.

## Open Items

- **No occlusion-mask support.** Fine for straight-on poses; required before
  any pose where an arm or hair crosses the print zone.
- **Multi-zone templates** (packaging boxes, front/back) remain unbuilt: one
  template is still one print area.
- **`overlays[]`** -- the registry still takes a single `overlay`. A layer
  carrying both shadow and glare cannot be composited with one operation and
  must be split, which the current shape cannot express.
- **Source photograph resolution.** 1024x1536 gives a 418x557 print area. That
  is 1.86x the first attempt but still well short of `wood-a4`'s 2000x2000.

## Related Files

- `site/js/mockup-displace.js`
- `site/js/mockup.js` (`drawPhoto()`, `renderFabricSheet()`, `ensurePhotoAssets()`)
- `site/js/mockup-templates.js`
- `docs/implementation/PHOTO_MOCKUP_TEMPLATES_IMPLEMENTATION.md`
- `docs/error-fixes/PHOTO_MOCKUP_OVERLAY_WASHES_OUT_DESIGN.md`
