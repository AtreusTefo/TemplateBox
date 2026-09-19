# A Hoodie and a Bucket Hat, and a Prompt Written From the Catalog's Own Bills

Date: September 19, 2026
Status: Implemented

## Summary

`hoodie-buckethat-clay` is the twentieth photographic mockup template and the
second two-garment set: a white fleece hoodie on a dark hanger with a white
bucket hat on a shelf below it, against a terracotta clay wall.

It ships **seven maps, 5.39MB** -- the full apparel set.

What makes it worth a document is not the template, which is conventional, but
the prompt. It is the first written **from the recorded costs of the templates
it reuses** rather than from a description of a scene, and three of the four
clauses added for that reason can be shown to have paid off.

## The four clauses and what each was worth

| Clause | Written because | Outcome |
| --- | --- | --- |
| Neutral white, no cast | `bucket-hat-white`'s hat ran saturation 12-16, straddling the gate of 14; it bisected the crown and left the print zone 87.9% pure, forcing BOTH thresholds up | **Paid.** This hat's zone reads saturation 2 / 5 / 7 and is 100.0000% pure at the factory gate |
| Seamless crown | A four-panel crown would put a vertical seam down the middle of the zone, which is what makes a rectangle legitimate there at all | **Paid.** No vertical seam anywhere on the crown |
| Generous side margins | `tshirt-cap-clay`'s left sleeve was clipped by the frame for 131 rows | **Paid.** The hoodie clears the left edge by 22px |
| Wide separation | That template's hem-to-crown gap was 16px against a 6px dilation, leaving 4px of margin | **Paid.** 29px here, leaving 17px |
| High hood, low pocket | `hoodie-hanger-white`'s hood hangs low and its pocket sits high, forcing a 10x10in print where 12x16 was wanted | **Did not pay.** See below |

### The one that did not work

The hood did come back high and compact. The pocket did not come back low -- it
sits at y=763, where the existing hanger hoodie's sits at y=868, which is
*higher* in the garment rather than lower. Net clear chest is **401px against
that template's 428px**, so the clause asking for a larger print area produced a
marginally smaller one.

The print is 10x10in either way, so nothing was lost that the catalog had. But
it is worth recording that an image model will honour "hood sits high" and
ignore "pocket sits low" in the same sentence, and that the two are not
independent: a compact hood and a high pocket are the same oversized-crop
silhouette.

## The wall came back the wrong colour

The prompt asked for deep moss green, at `#4A5638`, specifically so the card
would not look like `tshirt-cap-clay`'s. It came back terracotta -- corners read
`159,91,57` and every wall patch is R much greater than G much greater than B.

The template id was renamed from `hoodie-buckethat-moss` to
`hoodie-buckethat-clay` before anything was wired, because an id that describes
a colour the photograph does not have is a permanent wrong label.

Functionally it is not a loss. The stated reason for a dark, saturated wall was
to fail the classifier on two independent axes, and terracotta does exactly
that:

| Patch | Saturation p1 / p50 / p99 | Luma p1 / p50 / p99 |
| --- | --- | --- |
| Wall, upper right | **119** / 124 / 129 | 84 / 96 / 110 |
| Wall, right middle | **118** / 123 / 129 | 83 / 95 / 108 |
| Wall, left edge | **121** / 127 / 131 | 89 / 107 / 123 |
| Peg rail | **16** / 45 / 98 | 14 / 55 / 91 |
| Shelf | **29** / 53 / 88 | 26 / 50 / 82 |

Saturation p1 of 118-121 against a gate of 14, and luma p50 below the floor of
110 on two of the three. The cost is entirely to catalog variety: two of the
twenty templates now share a terracotta wall.

**The hanger is the exception, and it is instructive.** Its patch reads
saturation p1 **2** with luma reaching 176, because of the steel hook. That
passes the classifier outright. It does not matter, because the hook is a 45px
island that the connected-region restriction discards -- which is a reminder
that on this template the classifier is not what keeps the scene clean, the
region restriction is.

## Two zones, two seeds

As on the tee-and-cap set, `restrictToPrintedGarment()` is seeded once per print
zone, which is the substitution its own comment calls for. Nothing else in the
derivation is modified.

| Region | Pixels | What it is |
| --- | --- | --- |
| 1 | 579,160 | the hoodie |
| 2 | 60,631 | the bucket hat |
| 3 | **45** | speckle |

The two seeds keep **639,832 of 640,031**, dropping 0.031%. The shortest path
between hem and crown is **29px**, so a 6px dilation closes them to 17px apart
and they stay two regions.

## The two zones

### Hoodie: 298x298 at x 277..575, y 414..712

A 10x10in chest print at roughly 29.8 px/in -- the same size
`hoodie-hanger-white` settled on, for the same reason. Bounded above by the
hood's V at **y=362** and below by the kangaroo pocket's top seam at **y=763**,
both found as vertical-roughness ridges (20.15 and 9.87 against a body reading
1.5 to 3.0), the method that template introduced.

401px of clear chest, so the print sits centred with 52px above and 51px below.
A 12x12in print would need 358px and leave 21px, which is not breathing room.

Centred on **x=426**, which the body's own run midpoints hold to within 2px
below the sleeves. The body run has to be taken as the row run *containing* the
centreline, not the row extent: above y=900 the sleeves are attached and the
extent is the whole garment.

The scale carries an 11% band, as it did there: the waistband rib (79px, 2.5in)
says 31.6 px/in and pocket-seam-to-hem (339px, 12.14in) says 27.9.

### Bucket hat: 144x82 at x 870..1014, y 1062..1144

About **12.0 x 6.9cm** at this hat's scale, which is what a real bucket-hat
embroidery measures. It is deliberately NOT the doubled 17 x 9.5cm
`bucket-hat-white` carries: that hat filled its frame, this one shares the frame
with a hoodie and its crown is only 232px wide.

Bounded above by the front edge of the crown's top disc at **y=1045** and below
by the crown-to-brim seam at **y=1176**, leaving 12px and 13px of clearance.
Centred on **x=942**, the crown's own midpoint.

Width is bounded by curvature rather than purity, exactly as on the sibling:
gradient magnitude inside the zone peaks at **4.9** against the silhouette
edge's 29.4.

**The camera sits about 7.7 degrees above the hat's horizontal.** The top disc
projects a 28px minor axis on a 210px diameter, and `arcsin(28/210)` is 7.66.
The prompt asked for a level lens and did not get one. It does not matter: a
vertical surface seen from 7.7 degrees foreshortens by `cos(7.7) = 0.991`, under
one percent, so an axis-aligned rectangle is still honest. This is worth the
arithmetic rather than the eye, because the visible ellipse looks like a much
larger tilt than it is.

### Both verified

**100.0000% fabric, zero impure pixels, zero blown pixels** in each zone, at the
factory gate and at the bucket hat's tuned 20/165 alike.

## The photograph

1122x1402, aspect **0.8003** -- 4:5 to within 0.03%, straight thumbnail
downscale to 600x750 with zero padding.

```
opaque                       every pixel; zero clear, zero partial
hoodie zone luma p1/p50/p99  227.5 / 242.2 / 250.6   (spread 23.2)
hat zone luma p1/p50/p99     204.9 / 234.2 / 247.2   (spread 42.2)
fabric mean / median luma    237.7 / 241.0
specular ceiling (99.5th)    254.0
derived gradient p99         24.72
```

### The one real defect: 1.673% blown

**10,703 of 639,832 garment pixels are at luma 253 or above** -- 6.6 times
`hoodie-hanger-white`'s 0.252%, which that entry already flagged as the bill for
directional daylight across brushed fleece. Same lighting, same bill, six times
larger.

It is concentrated on the left-lit rims, in 1,153 blobs; the largest is 2,660px
running down the torso's left edge at x 173..201, y 358..915.

Three things bound how much it costs:

- **Zero blown pixels fall in either print zone.** Nearest approach is 6px below
  the hoodie zone and 11px above the hat's.
- Under recolour the clipped rims do not become bright artifacts. Measured on a
  Navy fill, the blown strip renders at luma p99 **41.7** against the body's
  41.6 -- it loses its highlight rather than gaining one, because `tone`
  saturates at `hiRef` and the dye simply renders at full value there.
- The same lighting is why the weave map is the catalog's best (below).

It is still a defect, and a re-shoot of this scene should carry a stop less key
light or more fill from the left.

## Seven maps

**Weave sd 4.50 -- the highest in the catalog**, past `hoodie-hanger-white`'s
4.28, which held the record and was explained the same way. Both heather
colourways have more fibre to screen back here than anywhere else.

### The light map, kept on structure

Specular headroom is 13.0. The structure test, which the linen frame
established as the thing that actually decides:

| Zone | shade local sd | light local sd | light at zone edge | light in interior |
| --- | --- | --- | --- | --- |
| Hoodie | 0.769 | 20.243 | 29.5 | **52.4** |
| Hat | 1.166 | 12.800 | 24.2 | **12.6** |
| *linen frame, dropped* | *0.29* | *12.945* | *27.8* | *27.7* |

A 78% difference between edge and interior on the hoodie and 92% on the hat, in
opposite directions -- the hoodie's interior catches more light than its edges,
the hat's crown does the reverse as it turns away. The linen frame's map agreed
with itself to one part in three hundred, which is what noise looks like.

`lightGain` is **0.3**, the apparel default, and this base pays the most for it
of any in the catalog: a `#12305C` navy fill lifts by a mean of **12.2** levels
in the hoodie zone, against the held bag's 11.8 and the tee-and-cap set's 7.17.
Nothing loses its blue identity (0.00%, p95 luma 83.8 against a source of 44).
At gain 1.0 it would -- 1.05% lost and p95 176.4.

### displaceStrength is 12, and the grid did not decide it

`hoodie-hanger-white` ships 12 on a base of the same 1122 width whose global
gradient p99 is 24.92 against this one's 24.72. Scaled by the formula
`bucket-hat-white` introduced, that gives **11.90**. The bucket hat itself, at
strength 6 and gradient p99 14.23, would argue 10.42 -- but this frame is 90%
hoodie by classified area, so the hoodie reference decides.

**The grid test permits 12 rather than selecting it**, which is a departure
worth recording: on the business card it bounded the value at 7 and on the
bucket hat at 10. Ruled-line wobble inside the chest zone, measured as the mean
standard deviation of a line's horizontal position:

| Strength | 0 | 6 | 9 | 12 | 16 | 22 |
| --- | --- | --- | --- | --- | --- | --- |
| Hoodie zone | 0 | 0.281 | 0.377 | **0.383** | 0.415 | 0.547 |

Monotonic, sub-pixel throughout, melting nowhere.

**The hat zone cannot be measured this way at all.** At 132x70 it gives the line
matcher about 26 rows, and it reported a wobble of 1.947 at strength **zero**,
where the true value is 0 by definition. That reading is how the unreliability
was caught, and it is the same failure mode the tee-and-cap set hit when its
diagnostic circle merged into a grid line.

## Verification

- Canvas 1122x1402; zone tabs render as "Hoodie" and "Bucket Hat"
- Colour field visible; Background panel correctly `hidden` (no `background`)
- Artwork coverage, hoodie zone: **99.761%** (88,592 of 88,804), ink extents
  277..574 x 414..711 against a zone of 277..574 x 414..711 -- no gap on any edge
- Artwork coverage, hat zone: **97.934%** (11,564 of 11,808), ink extents
  870..1013 x 1062..1143 against the same -- no gap on any edge
- Recolour dyes **both** garments and nothing else: at Navy the hoodie body
  reads 30,41,66 and the hat crown 30,41,66, while the wall stays 160,75,36,
  the shelf 95,40,17 and the hanger 57,42,36
- Catalog 54 cards, 20 mockups, registry and `CATALOG_ITEMS` both at 20,
  mega-menu on 21 pages at one occurrence each, search hint at 54

### A measurement trap worth keeping

The first coverage pass reported the hoodie zone at **91.87%** and looked like a
real gap. It was the detector: a magenta fill screened by the light map at gain
0.3 lifts the GREEN channel to about 76 where the map peaks, and the test
required green below 45. Re-run on hue -- red and blue both clearly above green,
which also rejects the terracotta wall, since that is R greater than G greater
than B -- the same render measures 99.761%.

This is the second time a coverage detector has produced a false failure on
these scenes; the first matched dark wood as magenta. **A fill colour is not a
safe probe once `light` is in the pipeline.**

## Related files

- `site/js/mockup-templates.js` -- the registry entry
- `site/assets/mockups/apparel/sets/hoodie-buckethat-clay/` -- seven maps
- `site/assets/thumbnails/product-mockups/apparel/sets/hoodie-buckethat-clay/`
- `docs/implementation/TSHIRT_AND_CAP_SET_MOCKUP.md` -- the first two-garment
  set, the two-seed derive, and the clipped sleeve this one avoided
- `docs/implementation/HANGER_HOODIE_MOCKUP.md` -- the hood and pocket bounds,
  the roughness-ridge method, and the blown-pixel bill this base pays six times
- `docs/implementation/LINEN_FRAME_MOCKUP.md` -- the light-map structure test
