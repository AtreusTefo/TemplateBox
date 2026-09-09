# The Split-Photo Card, and the Editor's Second Photograph

Date: September 9, 2026
Status: Implemented

## Summary

A playing-card poster whose panel is cut by a diagonal seam into two regions,
each holding its own photograph, with the lower one turned upside down the way
a court card's halves oppose each other. With nothing uploaded the two regions
are the artwork's flat red and blue.

Built from supplied A4 artwork ("Cards - 21", 595.3 x 841.9 pt), which is drawn
on the same page as the four card styles that shipped before it and reuses their
panel, corner indices, pip and rank fields wholesale. Nothing about it is a new
suit -- it is a new `layout`, the second one, and the first thing in this editor
to need two photographs at once.

| File | Change |
| --- | --- |
| `js/poster.js` | the style, `SPLIT` geometry, both renderers, the second photo |
| `poster.html` | the second upload, hidden for every other style |
| `index.html` | one catalog card, and the catalog-empty count |
| `js/admin.js` | the matching `CATALOG_ITEMS` entry |
| `css/style.css` | the miniature's diagonal plate |

## The editor held one photograph, and that was the real work

`let photo = null`, one `#p-image` input, and `drawPhotoPanel()`, `paint()` and
the SVG export all written around it. A second photograph is not a constant, it
is a second image in memory, a second validated input, and a second branch in
every renderer that draws one.

The upload path was extracted rather than copied: `bindPhotoInput(inputId,
errorId, assign)` now serves both inputs, so the mime check -- which is the one
part of it that is a security control rather than a convenience -- exists once.
`assign` is the only thing that differs between the two.

Neither image is written to localStorage, for the reason the first one never
was: a single phone photo as a data URL exhausts the whole quota on its own and
evicts the text the visitor typed.

## Rotated, not mirrored

The artwork places its lower photograph with `matrix(-0.1118, 0, 0, -0.1118)`.
Negative on BOTH axes is a rotation. The corner index a few lines away in the
same renderer uses `scale(1, -1)`, negative on one axis, which is a mirror.

Both operations now live in `js/poster.js` and they are not interchangeable: a
mirror reverses the subject left to right, which on a photograph of a person is
unmistakable and wrong. `drawPanelPhoto()` rotates about the panel centre.

Verified by construction rather than by eye. Two probe images at the panel's own
aspect ratio, each with a marker block in its TOP-LEFT corner:

| Sample point | Expected | Measured |
| --- | --- | --- |
| Panel top-left | upper photo's marker | its marker |
| Panel top-right | upper photo's body | its body |
| Panel bottom-right | lower photo's marker, rotated | **its marker** |
| Panel bottom-left | lower photo's body | its body |

The last two are the test. Under a 180-degree rotation the lower photograph's
top-left corner lands at the panel's bottom-RIGHT, and it did. Under a vertical
mirror it would land at the bottom-LEFT, which sampled as body colour.

## The seam is drawn by overlapping, not by meeting

The artwork's two polygons overlap: its red one reaches to y=430.4 down the left
edge while the blue one's top edge is at y=230.9, and blue is painted second. So
the visible seam is the blue polygon's top edge, and the red polygon's own lower
boundary is never seen.

Both renderers reproduce that construction rather than the shape it produces:
the upper photograph is drawn across the WHOLE panel, and the lower one is drawn
over it clipped to its own region.

That is not an aesthetic choice. Clipping both halves to meet exactly on the
seam is the obvious construction and it leaves a hairline of paper along it,
because two anti-aliased fills either side of one edge do not sum to opaque. The
overlap makes the gap structurally impossible: there is no shared edge.

Checked on a real 3508 x 4961 PNG export, not the preview -- 597 samples along
the seam and its immediate neighbours, **zero paper-coloured pixels**.

## Geometry

`SPLIT` carries only what differs from `CARD`, and reads `CARD.panel` for the
rest. The seam is expressed against the PANEL rather than the page, because it
runs from the panel's left edge to its right edge and has to stay on them at
every paper size.

| | |
| --- | --- |
| seam, left end | 171.8 / 724.5 of the panel height |
| seam, right end | 572.8 / 724.5 of the panel height |
| rule | 8 / 595.3 of the page width |
| upper fill | `#BE1E2D` |
| lower fill | `#00AEEF` |

**The rule is 8pt here against the card layout's 4pt.** Sharing that constant
would have been the obvious economy and it would have been wrong; the two
artworks genuinely differ.

`splitGeometry()` returns the panel box and both seam ends, and both renderers
read it, so the seam cannot land in one place on the canvas and another in the
SVG.

## The empty state is the artwork

With no photographs the poster is the red-and-blue split rather than a grey
placeholder -- the artwork's own colour version is a finished design. That does
mean the upload prompt sits on strong red and strong blue, where the panel's
usual grey-on-cream is illegible, so it is set in white over a dark halo.

## The SVG twin

`splitSVG()` reads the same `splitGeometry()` and repeats the same construction:
one clip for the panel, one for the lower region, two embedded images, and the
rotation as `rotate(180 cx cy)` -- the artwork's negative-scale matrix said
another way.

Verified by rendering the exported file back to a canvas over a magenta ground
and sampling the same four corners the canvas was sampled at: identical results,
paper still white outside the panel.

## One CSS trap, paid for

The miniature's plate reuses `.mk-plate`, whose `::after` is a 22-per-cent-inset
circle -- the sun in the shared horizon motif. Turning it into a full-bleed
clipped polygon means undoing every one of its declarations, and the first
attempt wrote `inset: 0` and then `right: auto; top: auto;` to clear the circle's
own offsets. `inset` sets all four; following it with two `auto`s strips two
anchors, and with width and height auto the element collapses to nothing. The
tile rendered flat red until that was found.

## Verified

- Empty state: upper `#BE1E2D`, lower `#00AEEF`, seam between them, paper white
  outside the panel.
- Two photographs land in their own regions, the lower one rotated (table above).
- No hairline along the seam at export scale (597 samples, zero paper pixels).
- SVG export parses, carries two clip paths, two images and one rotation, and
  renders back to the same samples as the canvas.
- The catalog tile is cut on the renderer's own seam percentages.
- The second upload and the rank fields are hidden for the styles that have no
  use for them.

## Not done

- **One suit.** The layout ships in hearts to match the artwork; the other three
  are one `FRAME_STYLES` entry each, exactly as they were for the card layout.
- **The seam is fixed.** A visitor cannot change its angle, and the two regions
  cannot be swapped without re-uploading both photographs the other way round.
- **Neither photograph can be nudged or zoomed.** Both cover-fit the panel and
  are cropped by it, which is what the artwork does, but a face landing near the
  seam cannot be moved off it.
