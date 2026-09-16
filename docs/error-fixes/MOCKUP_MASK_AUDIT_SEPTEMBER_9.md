# Mask Audit of All Nineteen Mockup Templates

Date: September 9, 2026

Status: Audit complete. Twenty-three print zones measured across nineteen
templates. **No confirmed fault.** One low-confidence candidate is recorded
below with the reason it is not being acted on yet.

The audit is now a tool that can be re-run: `node tools/mockup-mask-audit.js`
from the repository root, or with a template id to look at one.

## What This Answers

Does each template's print zone land on the product it is printed on?

A template declares its print area as four typed-in corners. That is a careful
human estimate of where a product sits in a photograph, and a photograph is not
a rectangle. The September 2, 2026 audit found two zones that missed -- artwork
on a frame's black border, and a strip of design floating below a roll-up
banner -- while the suite was clean at 1269 passed, 0 failed. See
`MOCKUP_PRINT_ZONES_OVERHANGING_THEIR_SURFACE.md`.

Section 11 of `tests/verify-layout.js` (September 8) renders every template and
asserts a design prints, which catches a dead template. It does not catch
artwork on the wrong part of a live one, and that write-up's conclusion was
explicit about why: "there is no cheap way for it to: the answer depends on the
photograph."

This is that expensive way, mechanised.

## Result

| Group | Templates | Zones | Visible artwork off the product |
|---|---|---|---|
| Measured against an authored `garment` mask | 13 | 17 | none |
| Measured against an authored `source-over` overlay | 1 | 1 | none |
| Derived by reconstructing the surface | 5 | 5 | one candidate, `wood-a4` |

Two numbers are reported per zone and they are not the same question.

**Off-product** is artwork on a pixel that is provably not the product AND not
redrawn over by anything. This is the fault number.

**Covered** is artwork off the surface that something draws over afterwards, so
no visitor ever sees it. It is counted and shown rather than forgiven, because
the overhang is still there and a later change to the thing covering it would
expose it. `frame-black-interior` carries 7,740 such pixels by design -- that
is the September 2 fix working exactly as intended.

## The One Candidate: wood-a4

```
wood-a4  (Leaning Wood Frame Poster)
  zone 0: 1095354 px, off-product 1765 (0.1611%), feather 0 (0%)
      plus 15177 px off the surface but redrawn over, so never visible
      worst row y=1579 with 255 of 806 px across (31.6% of that row)
      surface 1078412 px flooded, bbox 656..224..1458..1579 (window mode)
```

**Not being acted on, and the reason matters.** The zone extends about four
rows below the reconstructed aperture, which ends at y=1579. Of the pixels in
that band, 15,177 are covered by the opaque base and 1,765 are not -- and the
ones that are not sit where the base's alpha is between the two thresholds this
audit uses (40 for "this is the hole", 128 for "this occludes"). That is the
antialiased edge of the aperture: a soft ramp two or three rows deep, which is
what a photographed edge looks like.

So the most likely reading is a soft-edge artefact of the reconstruction, not
artwork on the wood. Confirming it either way needs the same thing the frame
needed in September -- a rendered crop of the bottom edge, looked at -- and
that is worth doing before touching a zone that is otherwise correct.

**The shape is what says it is probably not a fault.** See the next section.

## Shape Separates a Fault From a Ramp, and Depth Does Not

The audit reports, for the worst row of each zone, how much of that row is off
the surface. That single number turned out to be the discriminator:

| | Off-product | Worst row |
|---|---|---|
| `banner-rollup-white` with the September 2 fault reintroduced | 615 px | **615 of 615 across, 100%** |
| `wood-a4` today | 1,765 px | 255 of 806 across, 31.6% |
| `frame-black-shelf` today | 37 px | 1 of 580 across, 0.2% |
| `card-white-duotone` Back today | 103 px | 6 of 590 across, 1.0% |

A real fault takes out a whole row. An antialiasing ramp takes out a percent of
one. Note that the fault has FEWER total pixels than the candidate -- so a
total count alone ranks them the wrong way round, and only the shape gets it
right.

## Four Things The Tool Had To Learn, Each Of Which Produced A False Positive First

Recorded because each one reported a template as broken that was not, and the
next person to touch this will hit them in the same order.

### 1. An overlay can hide an overhang -- but only a `source-over` one

`frame-black-interior` deliberately overhangs its aperture and redraws the
frame over the artwork. Blind to that, the audit reported 12,281 px of fault on
a template whose overhang had been fixed a week earlier.

Crediting EVERY overlay with occluding is the opposite error, and it is worse
because it is silent: `js/mockup.js` draws the overlay with the blend the
template declares, and `multiply` tints rather than hides. Of the three
overlays shipped, only the frame's is `source-over`. Treating all three as
occluders reported `wood-a4` and `banner-rollup-angled` as 98.6% and 99.9%
covered -- which would mean their designs never appear at all, flatly
contradicted by suite section 11, which prints one on both.

### 2. A `window` template is inside out

`wood-a4` is `mode: "window"`: its printable area is a hole punched through the
base, and the design is drawn behind and shows through. Flooding for bright
pixels finds nothing there at all, which is how it reported "could not
reconstruct a surface" and identified itself. The base also occludes in that
mode, which is separate from any overlay -- missing it reported eleven
full-width rows of fault that no visitor can see.

### 3. Feather is not overhang

Carried over from the September audit and confirmed again: `card-white-walnut`
shows 9,796 and 11,087 pixels of feather with zero off-product. That is a zone
sitting flush with a bleed-to-edge card, which is correct. Only mask alpha of
EXACTLY zero counts as off the product.

### 4. Dilation defeats the whole audit -- do not add it back

The reconstruction stops part way up an antialiased edge, so it is a pixel or
two tight, and every zone drawn flush to a real edge reads as overhanging all
the way round. Growing the reconstructed mask by two pixels cleaned that up
beautifully: `frame-black-shelf` went to zero and the frames' counts halved.

**It also made the audit blind to the fault it exists to find.** The banner's
overhang is exactly two rows deep, so a two-pixel dilation absorbs it whole --
verified by reintroducing the September 2 fault, which the dilated audit passed
without a word. Dilation is off, and the ramps it would have hidden are left
visible in the report for a person to dismiss by their shape instead.

That is the trade worth remembering: **a fault at this scale is the same depth
as the noise, so depth cannot separate them. Shape can.**

## Method

`tools/mockup-mask-audit.js` serves the repository with `npx serve` and drives
a browser already on the machine over the DevTools Protocol, with no npm
dependencies -- the same shape as `tests/verify-layout.js` and
`tools/make-og-cards.js`. It runs in a page because decoding a PNG in plain
Node needs a dependency.

For each zone it rasterizes the quad by a winding test (every shipped zone is
axis aligned, but the descriptor's contract is four arbitrary corners), then
classifies every pixel inside it against the best surface available:

1. the template's own `garment` mask, where it ships one -- authored, exact
2. a `source-over` overlay's punched hole -- also authored
3. a flood outward from the zone's centre, over pixels that look like the
   surface, with the threshold taken from the surface's own median luma rather
   than fixed, because one number cannot suit both a white vinyl banner and a
   wood frame's mat

Lines in the report say which was used. Do not read a derived number as though
it were a measured one.

## Related Files

- `tools/mockup-mask-audit.js` -- the tool
- `docs/error-fixes/MOCKUP_PRINT_ZONES_OVERHANGING_THEIR_SURFACE.md` -- the
  September 2 audit this reconstructs, and the two faults it found
- `docs/guides/RUNNING_THE_VERIFICATION_SUITE.md` -- section 11, and why it
  cannot cover this
- `site/js/mockup-templates.js` -- the zones being audited
