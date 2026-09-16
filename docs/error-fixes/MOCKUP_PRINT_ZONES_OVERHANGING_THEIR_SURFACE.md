# Print Zones Overhanging Their Own Surface: Frame and Banner

Date: September 2, 2026
Status: Fixed

## Issue Title

Artwork rendering outside the product it is printed on: on the interior framed
poster it bled onto the frame's black border, and on the roll-up banner a strip
of it floated below the banner entirely.

## How they were found

The verification suite was clean -- **1269 passed, 0 failed** -- so these were
not suite failures. They came out of a direct audit of all twelve photographic
templates against their shipped assets: for each one, rebuild the garment mask,
measure the print zone's purity against it, measure the zone's gradient, and
compare the zone's edges against the surface's real boundary row by row.

That is worth recording, because it is the second time an audit has found
something the suite could not. The suite checks that assets exist, that bands
mount, that layout is stable. It does not check that a print zone lands on the
product, and there is no cheap way for it to: the answer depends on the
photograph.

## Fault 1: the frame's zone overhung its window

### Root cause

The frame is photographed in slight perspective, so its aperture is a
**trapezoid** -- x 279..843 at the top, widening to 273..849 at the bottom. The
print zone must be an **axis-aligned rectangle**, because a non-rectangular quad
routes to the perspective warp in `js/mockup.js`, and that path returns before
the shading pass and nulls every layer hit rect. That is how this template lost
scale and rotate once already (see `INTERIOR_FRAME_MOCKUP_AND_FILL.md`).

A rectangle inscribed in a trapezoid has to choose:

- Fall short at the wide end, and a white gutter shows down the sides.
- Overhang at the narrow end, and artwork sits on the frame.

The zone had been widened to x 271..850 to kill the gutter, which was the right
call at the time and left the other half of the trade in place. Measured, with
`designScale: "cover"` filling the zone:

| Row | Aperture | Zone overhang, left | right |
| --- | --- | --- | --- |
| y=389 | 279..843 | 8px | 7px |
| y=629 | 277..845 | 6px | 5px |
| y=869 | 274..847 | 3px | 3px |
| y=989 | 273..849 | 2px | 1px |

**6,341 pixels of artwork** were landing on the black border, worst at the top.

### Fix applied

`site/js/mockup-templates.js` -- `frame-black-interior` now declares an
`overlay`, which had been `null`:

```js
overlay: "assets/mockups/print/posters-and-frames/frame-black-interior-overlay.png",
overlayBlend: "source-over",
```

The new asset is the base photograph with the aperture punched out, so the frame
is **redrawn over the artwork**. This is what the `overlay` key is for -- the top
slice of the Sandwich Method -- and `js/mockup.js` already draws it last, at base
size, over everything including the design. No renderer change was needed.

The aperture was found by flooding the bright region from the window's centre
(the black border encloses it, so the flood cannot leak into the room):
**454,885 px, bbox 578x798, filling 98.62% of that bbox** -- a rectangle with the
perspective taper, exactly as expected. The punch is feathered by one pixel via a
3x3 box blur of the binary mask, so the overlay's inner edge meets the base's own
antialiased frame edge without a hairline seam.

`source-over`, not `multiply`: this is a pre-masked photograph, not a luminance
map. Multiply would darken the whole scene by itself.

**The zone is unchanged.** It still overhangs; the overlay simply hides that it
does, which is the only way to have both no gutter and no bleed while keeping the
rectangle that scale and rotate depend on.

### Verification

A saturated `#FF00AA` fill uploaded in the live editor, then read back from the
canvas:

| Row | Magenta run before | after | Aperture |
| --- | --- | --- | --- |
| y=290 | 271..850 | **280..842** | ~279..843 |
| y=389 | 271..850 | **279..843** | 279..843 |
| y=669 | 271..850 | **276..845** | tapering |
| y=989 | 271..850 | **273..849** | 273..849 |

The fill now follows the trapezoid at every row instead of the rectangle. Ink
bounding box 272..849 x 270..1067 against the aperture's 272..849 x 270..1067 --
identical. 454,916 magenta pixels against the aperture's 454,885; the 31 are the
feathered edge.

Rendered crops of the top-left corner before and after confirm it visually: the
frame's inner bevel and its shadow line are fully restored, with no white gutter
and no visible seam.

### Cost

The overlay is 2,379KB, roughly doubling this template's asset weight to about
4.6MB. That is mid-range for the catalog (the paper bag is 11.3MB).

The catalog thumbnail was generated before this fix and still carries the old
4px-at-thumbnail-scale bleed. It was left alone deliberately: regenerating it
would need the original design lockup, which is not preserved, so a rebuild would
change the thumbnail's artwork -- a bigger visual change than the 4px it fixes.

## Fault 2: the banner's zone ran two rows past the vinyl

### Root cause

`banner-rollup-white`'s zone ended at y=1347. The white vinyl face ends at
y=1345:

| Row | Zone pixels on the white face | Luma at x=512 |
| --- | --- | --- |
| y=1344 | 616 / 616 | 219 |
| **y=1345** | **616 / 616** | **229** |
| y=1346 | 0 / 616 | 135 |
| y=1347 | 0 / 616 | 62 |

This template also fills its zone (`designScale: "cover"`), so a **616x2 pixel
strip of the design** was rendering below the banner, against the transparent
surround -- which the Background panel then paints a colour behind, making it a
visible detached line rather than nothing.

Two rows out of 1,220 is small, but it is artwork outside the product, which is
the same class of fault as the frame's and not a matter of degree.

### Fix applied

`site/js/mockup-templates.js` -- the zone's bottom edge moved from 1347 to 1345.

Off-face zone pixels went from **2,781 (0.3701%) to 1,549 (0.2065%)**, and the
worst single row from **616px to 3px**.

**The 1-2px of zone that hangs over the vinyl's antialiased side edges was left
alone.** That is the zone sitting flush with the face, which is what a
bleed-to-edge banner wants. Pulling it in would trade an invisible overhang for a
visible white gutter -- the same trade the frame's overlay exists to avoid, and
here there is no overlay to make it free.

## Two findings that turned out not to be faults

Recorded because both looked like defects on first measurement.

**The business card's zones are not impure.** The audit reported zone 0 at
99.7153% purity, 3,174 pixels outside the garment mask. Every one of those
pixels has mask alpha between 1 and 249, and **zero have alpha 0**: they are the
mask's own feathered edge, one pixel wide, with no interior pixels at all. The
zone sits flush with the card's edge, which is correct for a bleed-to-edge
business card. The false positive was the audit's `alpha >= 128` threshold, not
the template.

**The banner's previously reported "4-6px bare-vinyl strip on its right edge" is
gone.** Measured now, the zone tracks the vinyl's side edges to within -3 to +1
pixels at every row. The zone was widened when `designScale: "cover"` was added
to this template, which fixed it; the earlier report described a state that no
longer exists.

## Related files

- `site/js/mockup-templates.js` -- both zones, and the frame's `overlay` keys
- `site/assets/mockups/print/posters-and-frames/frame-black-interior-overlay.png` -- new
- `site/js/mockup.js` -- the overlay composite step, unchanged
- `docs/implementation/INTERIOR_FRAME_MOCKUP_AND_FILL.md` -- the fill work and the
  scale/rotate regression that forces the rectangle
- `docs/implementation/ROLLUP_BANNER_MOCKUP.md` -- the banner template
