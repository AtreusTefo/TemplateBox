# Mockup Background Colour

Date: August 24, 2026

## What Was Built

The product mockup editor gained a Background panel: the visitor chooses the
colour painted behind the mockup, or leaves it Transparent, which is the
default and what every export produced before this existed.

Offered only where the mockup actually has a blank background.

## Eligibility Is Declared, Never Detected

Two families, and only two:

- **The four drawn products** (`tshirt`, `hoodie`, `mug`, `box`). `paint()`
  clears the canvas and draws the product onto it, so everything around the
  garment is transparent and exports that way. Always eligible, no flag needed.
- **A photographic template that declares `background: true`** in
  `js/mockup-templates.js`. Neither shipped template does. A photographed scene
  has its own backdrop; the flag is for a base that is a cut-out product on
  nothing.

The alternative -- testing the base image's alpha channel and offering the panel
wherever transparency exists -- is wrong, and specifically wrong for the
template most likely to be tested against. `wood-a4`'s base **is** transparent
inside its print window: that transparency is the mask the artwork shows
through. An alpha test would qualify it and paint the chosen colour behind the
poster.

## Not To Be Confused With `backing`

`drawPhoto()` has a `backing` value, the white paper sheet drawn behind artwork
that does not fill a frame's window. It is a different thing at a different
depth and it stays white whatever the background is set to. Conflating the two
would tint the paper inside the frame rather than the scene around it.

## Where the Fill Happens

On the canvas, before everything else, in both render paths:

- `paint()` -- after `clearRect`, before `config.drawBase`.
- `drawPhoto()` -- after `clearRect`, before the base photograph.

`paintBackground()` reads `activeBackground()`, which returns the chosen colour
only when the current product is eligible. A background chosen on a drawn
product and then carried into a photographic template therefore paints nothing,
which matters because the two share one storage record.

On the canvas rather than in CSS deliberately: the PNG export
(`canvas.toDataURL`) and the "My Mockups" tray thumbnails both read
`#mockup-canvas`, so a background painted there is in both of them for free, and
one painted in CSS would be in neither. A null background paints nothing at all
rather than filling white, so the export stays genuinely transparent.

## One Picker, Two Instances

The saturation/value square, hue strip, hex and RGB fields, presets and
eyedropper are now `createColorPicker(nodes, options)`, and the product
colourway picker and the background picker are both instances of it. It was a
single hard-wired picker reading module state directly.

What is **not** in the factory is as deliberate as what is. The product's swatch
row and the canvas's accessible label belong to the colourway path alone, and
the two instances hold genuinely different state -- a colourway key plus a
custom hex on one side, a hex or `null` on the other. Pushing those through the
factory would have needed more injection points than shared code, which is a
worse abstraction than two small call sites. The factory owns exactly the parts
that are identical.

`pickerHue` was module-level state when there was one picker. It is per-instance
now: shared between two, the background's hue strip would jump whenever the
garment colour changed.

The refactor is covered by its own assertion in the suite -- typing a hex and
clicking a colourway swatch must both still reach the garment's pixels -- because
"the picker still works" is not something to take on trust after moving 150
lines of it.

## Persistence and Validation

Stored as `bg` in the editor's existing `tb_mockup_v1` record: a six-digit hex
or `null`.

On the way back in it is parsed with `hexToRgb` and **re-derived** with
`rgbToHex` rather than passed through. Anything else -- including a plausible
CSS colour like `red` -- becomes `null`. `localStorage` is editable by the
visitor and this value reaches `ctx.fillStyle`, which accepts far more than
colours, so the boundary is where it gets checked. Verified with a seeded
`"red; background-image: url(x)"`: the panel reads Transparent and the canvas
corner stays at alpha 0.

## Verification

`tests/verify-layout.js` section 5, asserted against canvas pixels rather than
against the controls, because every route to a wrong export is silent. Pixel
(2, 2) is outside every product's own drawing, so it reads the background and
nothing else.

- The panel is offered on a drawn product, and the default corner is
  `0,0,0,0` -- transparent.
- Choosing Light Grey puts `229,229,226,255` in the corner, changes the exported
  data URL, and stores `#E5E5E2`.
- Transparent returns the corner to `0,0,0,0` and stores `null`.
- The panel is absent on a photographic template.
- The colourway picker still drives the garment after the refactor, and setting
  a garment colour leaves the corner transparent.

Mutation-tested: removing `paintBackground()` from `paint()`, making
`backgroundEligible` return `true` for everything, and dropping the `draw()`
call from `setCustomColor` each fail the check that covers them.

**One assertion was written and then removed**, which is worth recording. A
pixel check that a stored background never reaches an ineligible photographic
template did not fail when `backgroundEligible` was mutated to accept every
template: on a "window" template the base photograph is opaque everywhere except
its print opening, and the opening is covered by the white paper backing, so a
leaked background is invisible at every pixel. An assertion that cannot fail is
not evidence. What remains is the contract that can be checked -- the control is
not offered.

## Related Files

- `site/mockup.html` -- the `#m-bg-*` panel
- `site/js/mockup.js` -- `createColorPicker`, `paintBackground`,
  `backgroundEligible`, `activeBackground`, `setBackground`
- `site/js/mockup-templates.js` -- the `background` field, documented in the
  registry header
- `site/css/style.css` -- `.swatch-transparent`, `.color-trigger-dot.is-transparent`
- `tests/verify-layout.js` -- section 5
