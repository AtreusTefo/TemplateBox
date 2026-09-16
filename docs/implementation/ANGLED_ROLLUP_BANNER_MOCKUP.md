# Angled Roll-Up Banner, and Shading a Warped Surface

Date: September 4, 2026
Status: Implemented

## Summary

`banner-rollup-angled` is the sixteenth photographic mockup template, the
second with a perspective print zone, and the first that is **both warped and
shaded**.

It is the same product as `banner-rollup-white`, tilted. That is the whole
point: the flat one is the catalogue tile and the square-on proof, this one is
the listing's second image, where a stand has depth and stands in a room.

It ships **two maps, 1.27MB** -- lighter than the flat sibling's four at 1.5MB.

Building it surfaced two faults in the perspective machinery that had shipped
with the duotone cards the day before. Both are written up separately in
`docs/error-fixes/WARPED_ZONE_CHROME_AND_PROMPT_DRAWN_IN_SHEET_SPACE.md`.

## The problem this template had to solve

A warped quad routes to `drawWarpedDesign()`, which returns **before** the
displacement pass. `displace`, `shade` and `light` are never sampled.

The duotone cards could simply drop them, and their doc says why: a rigid card
lit evenly spreads **10 luma levels** p1 to p99, so there is almost nothing to
model. It also named the escape hatch for a surface where that is not true:

> The path to fixing it, if a warped template ever lands on a surface with real
> shading: warp into the **fabric sheet** rather than straight to the canvas.

This is that surface. The face spreads **42.5 levels** (p1 198.6, p50 225.1,
p99 241.1) -- more than the flat banner's 33 -- because 1.2m of vinyl turned
into the light is the opposite of evenly lit. Dropped, a filled banner would
read as a flat sticker pasted onto a photograph.

But the fabric-sheet change was **not** needed, and that was measured rather
than assumed.

### Displacement is genuinely negligible here

| | Sobel p99 in zone | Global p99 | Zone/global | Delivered at strength 10 |
| --- | --- | --- | --- | --- |
| **banner-rollup-angled** | **0.90** | 19.27 | **0.047** | **0.47px, 0.046% of base width** |
| bag-paper-held (flattest before this) | 1.00 | 24.31 | 0.041 | 0.058% |
| hoodie-model-white | 5.71 | — | 0.200 | 0.195% |

Taut vinyl on a tensioned stand is very flat, and half a pixel of peak offset
is nothing for a displacement map to buy -- so the only thing actually missing
was the shading, and shading has a slot a warped template can still reach.

This paragraph originally called it "the flattest print surface in the
catalog", on the strength of the zone/global column above. That column is a
within-image measure and cannot rank two photographs, since its denominator is
whatever else the photograph contains; see `LINEN_FRAME_MOCKUP.md`. The
conclusion drawn here -- that displacement was not worth having -- rests on the
delivered offset in the last column, which is resolution-corrected and stands.

### The overlay is that slot

`overlay` composites **after** the design and at base size on both render
paths, so it is the one layer a warped zone still gets. `multiply` with a
luminance map does what `shade` would have done.

The catch is stated in the registry's own `shade` documentation:

> a full-canvas multiply shades every pixel it covers, so wherever the design
> does not reach it would darken the photograph a second time.

Here "wherever the design does not reach" is the entire face before a first
upload. The fix is to take the sheen **out of the base** rather than add it
twice:

- **base** -- the face flattened to its own reference white, `(246, 246, 247)`,
  the per-channel maximum inside the quad. Nothing needs brightening, which
  matters because multiply cannot brighten.
- **overlay** -- `base / reference` inside the quad, transparent everywhere else.

The two are algebraic inverses, so an empty template reconstructs the
photograph. Composited through real canvas `multiply`: **max error 1 level,
mean 0.41, and no sample above 2 across 2,218,239 channel samples.**

### Two details that are load-bearing

**The mask is binary and identical in both files, deliberately unfeathered.**
The interior frame's overlay is feathered because it is a punch-out meeting a
base it does not cancel. Here a fractional alpha on one side of an exact
inverse is what would *create* a seam.

**The overlay is transparent outside the quad, never white.** An opaque overlay
pixel over a transparent canvas pixel composites to opaque under source-over --
`ao = as + ab(1 - as)` -- which would have filled the cut-out surround and
destroyed the alpha channel. Verified: **816,718 clear pixels before and after,
all four corners still 0,0,0,0.**

## The photograph

1024x1536, cut out on transparency -- the same frame as the flat sibling, so
the catalog card crops the same way rather than introducing a second aspect for
one product.

```
corner alpha              0, 0, 0, 0
clear (a<16)              816718  (51.93%)
opaque (a>=250)           739413  (47.01%)
partial                   16733   (1.06%)
classified (sat<14)       700032  (44.51%)
face luma p1/p50/p99      198.6 / 225.1 / 241.1
blown (luma>=253)         0
```

**Zero blown pixels**, matching the flat sibling -- the only two bases in the
catalog with none.

The prompt's dark-hardware clause was carried over and it is still
load-bearing: brushed aluminium sits near saturation 5 and luma 150-200, passes
both classifier gates, and is physically joined to the face. Anthracite fails
the luma gate.

## The geometry

Corners found by fitting a line to each of the four edges and intersecting
adjacent pairs -- never by taking extreme points, which are single antialiased
pixels and not the corners of a quad in perspective.

| Edge | Residual sd |
| --- | --- |
| Left | 0.43 px |
| Right | 0.32 px |
| Top | 0.31 px |
| Bottom | 0.30 px |

Sub-half-pixel residuals are the check that the vinyl is genuinely **planar and
unrippled**, which is what a homography requires and what the prompt asked for
in those words. A curled face cannot be fitted by four corners and would bow the
artwork off its own edges.

```
warpZone   TL (240,  65)   TR (783, 138)
           BL (241, 1429)  BR (789, 1342)
```

Foreshortening is **0.883** -- the far edge 1204.5px against the near edge's
1364.2 -- inside the 80-88% the prompt asked for. Enough tilt to read as depth,
little enough that the handle-tolerance approximation in `hitTest`, which is
not rescaled into sheet space, stays close.

Purity **99.9338%**: 464 impure pixels of 700,446, every one of them partial
alpha at the vinyl's antialiased rim and **zero fully clear**. The zone sits
flush with the face, which is what a bleed-to-edge banner wants and what the
flat sibling's own bottom-edge fix was about.

### The aspect cannot be recovered, and is not quoted

The duotone cards check their corners by recovering the rectangle's aspect from
the homography and comparing it against a real business card -- 1.78:1 against
1.75.

**That check is unavailable here** and it would have been easy to fake. The left
and right edges come out vertical: their intersection sits 128,728px above the
frame, so the vertical vanishing point is at infinity and only the horizontal
direction has a finite one. Standard rectangle rectification needs two finite
vanishing points. Solved anyway, it returns an imaginary focal length.

What can be said is weaker and is labelled as such: the mean of opposite edges
gives 550.9 x 1284.4, or **1:2.33**, against a standard 850x2000mm roll-up's
1:2.35. The flat sibling's zone is 1:2.00 and its own doc concedes that is
wide, so the tilted photograph is the truer of the pair.

### The shadow line at the foot is content, not a boundary

About 8px above the bottom edge there is a dark line where the vinyl enters the
cassette slot -- luma 40 to 100 against a face at 225. The first boundary scan
found it as a break and put the bottom edge there.

The zone deliberately spans it. It is a shadow on the vinyl, not the end of the
vinyl, and the overlay multiplies it back over the artwork, so a filled banner
still sits **in** its cassette instead of floating above it. Truncating the zone
would have lost the shadow and gained nothing.

## Two maps, not four

| Template | Maps | Total |
| --- | --- | --- |
| banner-rollup-white | 4 | 1.5MB |
| **banner-rollup-angled** | **2** | **1.27MB** |
| card-white-duotone | 3 | 2.0MB |
| bag-paper-held | 7 | 3.2MB |

No `garment` or `tone`: blank vinyl has no colour variant worth offering and a
design covers the whole face, so there are no colourways for them to serve.
Declaring no `garmentColors` is what turns the colour field off, matching the
flat sibling. No `grain`: no fibre blend to model.

`background: true`, because the scene is a cut-out and there is genuinely
nothing behind it -- all four corners alpha 0.

## Verification

- Static suite: 131 passed, 0 failed
- Zone purity 99.9338%, zero clear pixels inside the quad
- Empty template reconstructs the photograph: max 1 level, mean 0.41, none over 2
- Cut-out survives the multiply overlay: 816,718 clear before and after
- Design lands on its own quad: 612,766px inside, 755 on the antialiased edge,
  and **2 pixels beyond it at alpha 1 and 4**
- All four gestures driven by pressing where the chrome is drawn: select, move
  (282,372px changed against 0 for a drag off the quad), corner resize
  (40 -> 57), rotate (-89.88 deg -> -49.16 deg)

## Related files

- `site/js/mockup-templates.js` -- the registry entry
- `site/assets/mockups/print/signage/banner-rollup-angled/` -- two maps
- `site/assets/thumbnails/product-mockups/print/signage/banner-rollup-angled/`
- `docs/error-fixes/WARPED_ZONE_CHROME_AND_PROMPT_DRAWN_IN_SHEET_SPACE.md` --
  the two faults this template surfaced
- `docs/implementation/ROLLUP_BANNER_MOCKUP.md` -- the flat sibling it is
  calibrated against
- `docs/implementation/PERSPECTIVE_ZONES_AND_DUOTONE_CARDS.md` -- the warp path
