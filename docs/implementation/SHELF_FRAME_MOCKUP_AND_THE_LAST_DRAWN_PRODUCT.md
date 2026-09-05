# Framed Poster over a Shelf, and the End of the Drawn Products

Date: September 5, 2026
Status: Implemented

## Summary

`frame-black-shelf` is the seventeenth photographic mockup template and the
fourth that **replaces** a drawn one. With it the drawn `mug` is gone, and
that makes it the last of its kind: **there are no vector products left in the
catalog.** `PRODUCTS` is an empty object that the registry fills.

A black frame hangs square-on over a light oak console, against a pale wall,
with a pampas vase to the left and books and a small green vase to the right.

It ships **three maps, 2.47MB** -- base, displace and shade, the same set
the interior frame shipped before its occlusion overlay.

## Not a duplicate of the interior frame

`frame-black-interior` LEANS on a floor against dark green brick. This one
HANGS on a pale wall. The pair is the same trade as the two paper bags and the
two banners: one moody, one bright.

But the difference that matters is not the styling.

## Square-on was the whole specification, and it held

The interior frame is photographed in slight perspective, so its aperture is a
**trapezoid** -- 279..843 across the top, widening to 273..849 at the bottom --
while a print zone must stay an axis-aligned rectangle or it routes to the
perspective warp. A rectangle inscribed in a trapezoid must either fall short
at the wide end or overhang at the narrow one, and that template chose to
overhang: **6,341 pixels of artwork on the black border**, fixed later by a
2,379KB occlusion overlay that roughly doubled its weight
(`MOCKUP_PRINT_ZONES_OVERHANGING_THEIR_SURFACE.md`).

So this frame was specified square-on, repetitively and in those words. It came
back square-on. The frame's outer edges sit at a constant x=204 and x=919, y=62
and y=1059 in every profile taken, and the mat's opening fits as:

| Edge | Position | sd | Slope |
| --- | --- | --- | --- |
| Left | x 279.59 | 0.088 | -0.000129 |
| Right | x 860.36 | 0.339 | -0.000062 |
| Top | y 143.72 | 0.161 | +0.000330 |
| Bottom | y 996.54 | 0.462 | -0.000013 |

Sub-half-pixel scatter, slopes at the fourth decimal. A real rectangle, which
buys **no overlay, no overhang, and the full shading pass** -- the three things
the interior frame had to trade away.

The print zone is that opening rounded inward: **580x852 at x 280..860,
y 144..996**. Verified in the editor at 99.998% coverage -- 494,151 magenta
pixels of a 494,160px zone, with the 2,285 outside it forming a sub-pixel
antialiased rim rather than ink on the mat.

## The photograph

1122x1402, which is 0.8003 -- 4:5 to within 0.03% -- so the catalog card is a
straight downscale with no crop. Fully opaque: zero clear pixels, zero partial,
so **no `background` key**; the room is the scene.

```
print area luma p1/p50/p99   238.2 / 246.5 / 250.2   (spread 12)
print area saturation p50    2
blown (luma >= 253)          206  (0.041%)
zone Sobel p50/p99           0.29 / 1.76
global Sobel p99             57.26
zone / global                0.031
```

**0.031 is the flattest print surface measured in this catalog**, against the
angled banner's 0.047 and the held bag's 0.041. A matted print behind a rigid
frame is as flat as a print surface gets.

## The classifier was bypassed, and why that was right

The catalog's standard derivation classifies the product surface
(`alpha >= 250 && sat < 14 && luma > 110`, Rec.601) and then keeps only the
region connected to the print zone, flood-filled on a mask **dilated by 6px**.

Here that fails. Two pampas fronds cross the frame's left edge around y=545,
and a third leak sits at the top-left corner. The dilation bridges them, the
wall joins the poster's region, and the flood returns 978,940px of which
**302,034 are outside the frame entirely**. Every downstream statistic -- the
Sobel p99, the shade reference median -- would then be computed over a room.

The frame itself is not the weak point: its unclassified band measures **18 to
51 pixels on all four sides**, never within reach of a 12px bridge. The
dilation is what crosses it, jumping diagonally along a frond whose classified
pixels sit a few rows apart.

The substitution is in the **connectivity step only**. Classification, the box
blur, the Sobel/p99 encoding and the median-split shading are all the tool's,
unchanged; the flood is simply run **undilated**. That is safe here for a
reason specific to this template: the region is one solid sheet of white with
no grooves to bridge, unlike the rope handles that put the dilation there in
the first place. The result is the region the classifier was meant to find --
**676,866px, bounding box [224, 81, 918, 1058]**, exactly the frame's interior.

Recorded because the first attempt did something else and was worse: deriving
over the print rectangle alone. That normalises the Sobel by the zone's own
p99, so the mat's bevel -- the strongest gradient in the region -- saturates
**at the zone's border**, where displacement can pull artwork off the edge.

## Three maps, and the gate that decides it

`displace` and `shade`. No `light`, and no others.

**`displace` exists mainly to open the gate.** `paintDesign` only enters the
displacement pass when `assets.displace` is present, and `shade` is applied
*inside* that pass -- so **without a displace map the shading never runs at
all**. The interior frame ships one for the same reason and says so. Nothing
here needs displacing: inside the zone the map measures p50 3.16 out of 127, so
at `displaceStrength: 2` the interior moves 0.05px.

The concern that had to be tested was the opposite one -- that displacement at
the *edge* would pull artwork inward and expose a gap, since
`renderFabricSheet` clips each layer to its zone. It does not: measured in the
editor, the artwork's row extents are 280..860 against a zone of 280..859, with
9 pixels of a 494,160px zone unfilled.

**`light` was derived, measured, and dropped.** Specular headroom is 4.7 luma
levels, which the map normalises across the full 0-255 range, so one level of
sensor noise becomes 54. Two measurements settle it:

| | shade only | with light at gain 0.3 |
| --- | --- | --- |
| Flat #808080 fill, sd | 1.46 | **9.35** |
| Flat #808080 fill, p1-p99 spread | 4 | **37.9** |

The interior frame measured **sd 9.35** on a headroom of 3.4 and dropped it for
this reason; the same number arrived here independently.

The structural test is what makes it conclusive rather than a judgement call,
because the held bag's light map survived a very similar argument and was kept:

| Map | Local sd | Mean at zone edge | Mean in interior |
| --- | --- | --- | --- |
| `shade` | **0.238** | 249.0 | 254.1 |
| `light` | **17.578** | 39.3 | **39.4** |

`light` has no spatial structure at all -- edge and interior agree to one part
in four hundred -- with a local sd of 17.6. `shade` is smooth and carries a
coherent 5-level edge-to-interior difference. One is a surface; the other is
amplified noise.

### What `shade` actually does here

It reproduces the mat's bevel shadow **on the artwork**, which is what makes
the print sit behind the mat instead of on top of it. Measured on a `#FF00AA`
fill in the editor:

| Sample | Result |
| --- | --- |
| Centre | 255, 0, 170 -- untouched |
| Near left edge | **248**, 0, 165 |
| Near top edge | **252**, 0, 168 |
| Near right edge | 255, 0, 170 |
| Near bottom edge | 255, 0, 170 |

Left and top only, which is correct for light arriving from the upper right.
Mean red across the 6px edge band is 248.14 against 254.75 in the interior.

## The last drawn product

`mug` was the only entry in `PRODUCTS`, and two things pointed at it: the
module's `currentProduct` and `paint()`'s fallback. The comment standing over
it claimed the mug had to stay because "the editor's fallback has to paint
immediately, and a photographic template cannot until seven maps have
downloaded."

**That was only half true.** `drawPhoto` has always had a loading state, and it
paints on the first frame. What a cold start actually loses is a finished
product for the fraction of a second before the base image arrives; it now
shows the same "Loading mockup template..." panel that a template switch has
always shown. Verified: with storage cleared and no preset, the editor opens on
the first registry entry at 2000x2000 with no crash and no blank canvas.

Both pointers now read a `DEFAULT_PRODUCT` constant:

```js
const DEFAULT_PRODUCT = PRODUCTS["tshirt-model-white"]
    ? "tshirt-model-white"
    : Object.keys(PRODUCTS)[0] || "";
```

Both halves are deliberate, and the first attempt had only the second.

The **backstop** is there because a bare literal is what dangled at every
retirement -- this line has read `tshirt`, then `hoodie`, then `mug`.

The **name** is there because `Object.keys(PRODUCTS)[0]` alone resolves to
`wood-a4`, a leaning frame with no colourways, and that turned out to be a
visibly worse default: the editor's colour controls vanish for anyone arriving
without a preset, which section 4 caught as **252px of missing form pane on
`mockup.html` at every width**. `tshirt-model-white` is the archetypal
print-on-demand product, declares `garment` and `garmentColors`, and is
`background: true` -- so the default view offers the same full set of controls
the drawn mug's did. Of the seventeen templates, eight are both
background-eligible and recolourable; this is the flagship among them.

`paint()` also gained a guard for `PRODUCTS` being empty, which now means "the
registry script failed to load" rather than being impossible.

What went with it:

- **`drawMugBody` deleted**, and with it the last `drawBase`.
- **The drawn branch in `paint()` deleted** -- canvas resize to CANVAS_W x
  CANVAS_H, `config.drawBase`, `drawLayersInArea` over a fixed `printArea`.
  Unreachable once `PRODUCTS` holds only registry entries, every one of which
  is `type: "photo"`.
- **`.mk-shape.mug`, its handle pseudo-element and its `.mk-art` inset**
  deleted from the stylesheet. `.mk-shape.tee` is the last shape standing, and
  only because `tshirt-mockup-generator.html` still draws it.
- **`CANVAS_W`/`CANVAS_H` stay**, and the comment over them was rewritten to
  say why: the loading placeholder sizes the canvas to them, and the upload
  prompt scales its dashed border by `canvas.width / CANVAS_W` so the chrome is
  the same visual size on a 1024px base as on a 2048px one. Neither has
  anything to do with drawn products.

### The suite needed a new premise, not a new cast

This was the part that was under-scoped on the first pass. Grepping for the
literal string `'mug'` found two lines and fixed them; the full run then failed
**ten checks**, because most of section 5 never names a product at all. It
clears storage, loads `mockup.html`, and relies on **the default being a drawn
product** -- eligible for a background because its surround is transparent, and
recolourable because it carries `colors`.

Making `tshirt-model-white` the default satisfies both of those on a
photograph, so the assertions hold. Four things still had to change, and each
was measured in the browser first rather than adjusted until green:

**The premise wording.** "A drawn product: eligible, because everything around
the garment is transparent" is now a cut-out photograph reaching the same
eligibility a different way, and the check that read
`background panel offered on a drawn product` says
`on a cut-out photographic garment`. Verified: the canvas corner reads
`0,0,0,0` on load.

**A readiness wait that a drawn default never needed.** `drawPhoto`'s loading
state fills the WHOLE canvas with `#F4F3EF` at 1000x1000, so the corner read
taken immediately after navigation returned **244,243,239,255** and the
"export stays transparent" check failed against a placeholder. A drawn product
had nothing to load and was correct on the first frame. Section 5 now polls for
the canvas reaching the base's native 1024x1536, which is how the rest of the
suite already waits.

**The fabric sample point, which was silently wrong.** Pixel (500, 300) was
chosen for the drawn tee's 1000x1000 canvas. On the model photograph's
1024x1536 that point is **the model's skin** -- it measures 156,101,79. The
checks would have been reading a face and calling it fabric. It is (650, 520)
now, 28px above the print zone's top edge, measuring 244,244,249 and going to
18,51,84 under a `#123456` colourway. Used in two places: the colourway checks
and the tray checks, which share the reading.

**Four exact-equality assertions on dyed fabric.** Each compared a garment
pixel to a literal hex byte for byte, which held only because a drawn
product's fabric is a FLAT fill. A photographic garment is dyed through its
`tone` map -- the diffuse response normalised to its own peak, so it can only
darken -- and the reading sits a shade under the request:

| Asked | Read | Delta |
| --- | --- | --- |
| `#123456` | 18, 51, 84 | 0, 1, 2 |
| `#B5352E` | 177, 52, 45 | 4, 1, 1 |
| `#1F2A44` | 31, 41, 67 | 0, 1, 1 |

They now share one helper, `dyedAs(pixel, hex)`, with a tolerance of **5** --
one level above the worst modulation measured, and an order of magnitude below
what a real break shows, since a colourway that never reaches the garment
leaves it at 244,244,249, which is 60 to 226 levels out. The helper was
unit-checked against all three observed values plus the undyed reading it must
reject, because a tolerance that hides the failure it is meant to catch is
worse than no check.

**Section 5c's export-size pair.** It asserted drawn-versus-photographed sizes,
and every previous retirement just recast the drawn half. There is nothing left
to cast, so the pair is **two photographs of different native sizes** --
`frame-black-shelf` at 1122x1402 and `tshirt-model-white` at 1024x1536. That
still tests what the check is for, that export sizes are read from the canvas
rather than a hardcoded ladder, and tests it slightly harder: those differ in
both dimensions where 1000x1000 was square.

One comment elsewhere also stopped being true. The tile-shape check justified
standing apart on the grounds that "the tray checks above run against a
1000x1000 canvas, where a square tile and a correct one are
indistinguishable". The tray checks now run on `tshirt-model-white` -- this
very template -- so that isolation is gone. The check stays, because it is the
only one asserting tile SHAPE, but the comment now says so rather than
claiming a separation it no longer has.

Section 5's background-eligibility check also seeded storage with
`{ product: 'mug' }`; it now names `banner-rollup-white`, which actually
declares `background: true` as that test's comment claims.

## Verification

- Static suite: 131 passed, 0 failed
- Zone 580x852, artwork coverage 99.998%, no gap at the mat's edge
- Shading reaches the artwork: 248/252 at the left and top edges against 255 at
  the centre
- Colour field and Background panel both correctly hidden
- Cold start with cleared storage and no preset opens the first registry entry
- Catalog unchanged at 30 cards and 17 mockups -- a replacement, not an addition
- No `data-doc="mug"` and no `.mk-shape mug` markup anywhere in `site/`
- Default product is `tshirt-model-white`: corner `0,0,0,0`, colour and
  Background panels both offered, fabric at (650, 520) recolours
- Ten Open Graph cards regenerated; one changed, nine byte-identical

## The social card's copy

`site/tools/og-image.html` read "Drop your design on a shirt, mug or box."
Both the mug and the box are gone, so it now reads "Drop your design on a
shirt, hoodie or poster" -- three categories the catalog actually ships, with
three templates each.

Changing it means regenerating the whole set by policy, so
`node tools/make-og-cards.js` was run: Chrome 152.0.7977.66, both webfonts
loaded, ten cards written. **Exactly one moved.** `og-mockup.png` changed and
the other nine are byte-identical by md5, which is the check that tool's own
closing message asks for -- a card moving that you did not intend to touch
means the browser has been updated and all ten need committing together. None
did, so the browser is the same one that rendered the set on September 4.

## Related files

- `site/js/mockup-templates.js` -- the registry entry
- `site/js/mockup.js` -- the empty `PRODUCTS`, both fallbacks, the deleted
  drawn branch, the rewritten CANVAS_W note
- `site/css/style.css` -- the deleted `.mk-shape.mug` rules
- `tests/verify-layout.js` -- sections 5 and 5c, the fabric sample point and
  the hue strip's tolerance
- `site/tools/og-image.html` and `site/assets/og-mockup.png` -- the copy
- `site/assets/mockups/print/posters-and-frames/frame-black-shelf/` -- three maps
- `docs/implementation/INTERIOR_FRAME_MOCKUP_AND_FILL.md` -- the leaning frame
  this is calibrated against
- `docs/error-fixes/MOCKUP_PRINT_ZONES_OVERHANGING_THEIR_SURFACE.md` -- the
  trapezoid problem being square-on avoids
- `docs/implementation/HELD_PAPER_BAG_MOCKUP.md` -- the third retirement, and
  the light map that survived this argument
