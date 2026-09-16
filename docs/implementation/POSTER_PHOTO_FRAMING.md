# Moving and Resizing the Photograph, on Every Poster Style

Date: September 9, 2026
Status: Implemented

## Summary

Until now a photograph was cover-fitted to its panel and that was the whole of
it: whatever the centre crop gave you was what you printed. A face near an edge
could not be brought in, and a wide shot could not be tightened.

Every poster style now takes a framing -- a zoom and a position -- set by
dragging the photograph on the preview, or by a slider for the visitors who
cannot drag. The split layout's two photographs each carry their own.

| File | Change |
| --- | --- |
| `js/poster.js` | the framing model, both renderers, the drag, the controls |
| `poster.html` | a size slider and a reset per photograph |

## The model is fractions of the slack, not pixels

```js
{ zoom: 1, x: 0, y: 0 }
```

`zoom` multiplies the cover fit, so **1 is exactly the crop this editor drew
before framing existed** -- every poster made before today renders identically.

`x` and `y` are the interesting part. They are not pixels and not fractions of
the image: they are fractions of the SLACK that the zoom leaves, running -1 to
1. That buys three things at once. It is independent of the photograph's
resolution, so the same framing means the same crop whether the upload is 800px
or 6000px. It is independent of the paper size, like every other constant in
this editor. And it is self-clamping: at zoom 1 an image matching the panel's
aspect has no slack in one axis, and panning it there correctly does nothing
rather than sliding paper into view.

`photoMetrics()` is the single place that turns a framing into a source
rectangle, and both renderers read it.

## Held in state, deliberately not persisted

The framing lives on `state` so undo covers a drag, and it is in `snapshot()`
for that reason. It is **not** in `persist()`.

The photograph itself has never been written to localStorage -- one phone photo
as a data URL exhausts the whole quota and evicts the text the visitor typed --
so a framing restored without it would be a crop with nothing to crop. Worse, it
would then apply somebody's careful framing of one picture to whatever they
uploaded next. A new upload resets to the cover fit for the same reason.

## The SVG export could not express this, and had to stop trying

Every `<image>` in the SVG export carried `preserveAspectRatio="xMidYMid slice"`,
which is a compact way of saying "cover-fit this, centred". It cannot say
anything else. A zoomed or panned photograph would have exported at the default
crop, and the file would have quietly disagreed with the preview -- the exact
failure mode this project has been bitten by before, because the preview looks
right either way.

So the whole image is now emitted, scaled and offset, inside a clip path:

```
k = destWidth / sourceWidth
x = destX - sourceX * k     width = imageWidth * k
```

That means a clip is no longer optional, because a zoomed photograph is larger
than the box it fills. All three call sites gained one: the plain frame styles,
the card layout, and the split layout (which already had two).

`photoImageSVG()` reads `photoMetrics()`, the same function the canvas draws
from, so the crop cannot be computed two ways.

Verified by setting a deliberately off-centre framing at 300 per cent, exporting,
rendering the exported file back to a canvas and sampling four points against the
same four on the preview: **identical**, with `preserveAspectRatio` absent from
the file.

## Dragging: two negations, both necessary

A pointer delta becomes a framing delta through the scale and the slack. It is
negated once because moving the crop right THROUGH THE SOURCE moves the picture
LEFT on the page.

It is negated a second time for the split layout's lower half, which is drawn
upside down. Without that the photograph would run away from the pointer, which
is the kind of thing that reads as a broken control rather than a wrong sign.
Measured: a drag of 178px moved the lower photograph's marker stripe by exactly
178px, in the same direction.

Text wins the pointer over the photograph. A caption sitting on a photo has to
stay draggable, so `hitTest()` is consulted first and the framing drag only takes
points nothing else claimed. `photoAt()` returns null where there is no
photograph, so a drag on an empty panel does nothing rather than silently
adjusting a framing nobody can see.

## The controls

A size slider, and a reset. The slider is the accessible route to what dragging
does by hand; the reset exists because **the slider alone cannot undo a pan** --
returning the zoom to 100 leaves the offset where it was, and at zoom 1 there is
no slack to drag it back with.

Both are hidden when there is no photograph to frame, on the same argument as
the rank fields: a control that is visible but inert reads as broken.

## A false alarm worth recording

A regression check reported that dragging text had stopped working. It had not.
`#t-posx` and `#t-posy` are refreshed by `syncControls()`, which the drag path
has never called -- so those fields have always gone stale after a drag, and
reading them proved nothing. The state showed the text had moved correctly all
along.

The lesson is about the check rather than the code: a regression test that reads
a control instead of the thing the control describes will report whatever the
control last happened to hold.

## Verified

- Zoom: at 100 the sampled point is the same colour it was before framing
  existed; at 250 the image's centre patch covers it.
- Drag moves the photograph, and undo restores the previous framing.
- The split layout's lower half follows the pointer 1:1 despite being drawn
  upside down.
- The SVG export matches the canvas at four sample points under a 300 per cent
  off-centre framing.
- Text dragging is unaffected; the four plain frame styles and the card layouts
  render as before at the default framing.
- The framing is absent from localStorage.

## Not done

- **No wheel or pinch zoom.** Wheel over a canvas that fills the pane traps the
  page scroll, which is a worse problem than the one it solves; pinch needs a
  second pointer and its own gesture handling. The slider covers both for now.
- **No rotation or straightening**, and no aspect crop other than the panel's.
- The framing is lost on reload, because the photograph is.
