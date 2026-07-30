# Photographic Mockup Overlay Washes Out the Uploaded Design

Date: July 30, 2026
Status: Fixed (caught during implementation verification, never deployed)

## Issue Title

Uploaded artwork renders pale, desaturated and semi-transparent inside a photographic mockup frame, as though covered by a sheet of tracing paper. The frame, room and shadows look correct; only the design looks wrong.

## Root Cause

The "Sandwich Method" overlay layer for these assets is a **baked luminance map**, not a shadow cut-out: inside the print window `wood-a4-overlay.png` averages alpha 193 (76% opaque) over a near-white body (mean luma 211, with 66% of pixels at luma 224-255). Drawn with the canvas default `globalCompositeOperation = "source-over"`, that near-white body is simply painted over the artwork at 76% strength, veiling it.

Measured proof, sampling the centre of a design whose true colour was `#C48A4A` (196, 138, 74):

| Composite operation | Sampled pixel | Verdict |
|---|---|---|
| `source-over` | (234, 219, 204) | Washed pale beige, unrelated to the design |
| `multiply` | (190, 134, 72) | True design colour, lightly shaded |

`multiply` is the correct operation for a luminance map: white pixels (255) leave the underlying pixel unchanged, so lit areas pass the artwork through untouched, while grey pixels darken it proportionally and reproduce the shadow. This is what the Sandwich Method has always specified ("Multiply for shadows, Screen for glass reflections"); the defect was that the first implementation drew the overlay with the default operation instead.

The overlay's non-transparent pixels are confined to the print window (alpha is 0 outside a bounding box of roughly 809x1361 around the frame opening), so `multiply` cannot darken the room, the wall or the furniture.

## Fix Applied

`site/js/mockup.js`, in `drawPhoto()`: the overlay draw is wrapped in `ctx.save()`/`ctx.restore()` and its composite operation comes from the template's `overlayBlend` field, validated against a whitelist (`OVERLAY_BLENDS = ["multiply", "screen", "source-over"]`) and defaulting to `source-over` when absent or unrecognized.

`site/js/mockup-templates.js`: the `wood-a4` entry declares `overlayBlend: "multiply"`, with the measured alpha/luma values recorded in a comment beside it, and the field is documented in the registry's entry contract.

The whitelist is load-bearing beyond tidiness: the Canvas spec says an unrecognized `globalCompositeOperation` value is **ignored**, leaving `source-over` in place. A typo in a registry entry would therefore reintroduce this exact defect silently, with no error anywhere.

## Testing Steps

1. Serve the site (`npx serve` from the repository root) and open the mockup editor on a photographic template.
2. Upload a strongly saturated design (a dark navy or deep red block works best; pale artwork hides the defect).
3. The design must keep its saturation, with the scene's shadows visibly falling across it. If it looks pale or milky, the overlay is compositing with `source-over`.
4. Pixel-level check: sample the centre of a flat colour region of the rendered canvas with `getImageData` and compare against the design's source colour. It should match within the shading, not drift toward white.

## Troubleshooting

If the artwork still looks washed out after setting `overlayBlend: "multiply"`:

- Confirm the value is spelled exactly `multiply`. Read `ctx.globalCompositeOperation` back immediately after assigning it — if it reads `source-over`, the value was rejected and ignored.
- Confirm the entry actually reached the renderer: a registry entry failing the structural validation in `js/mockup.js` is skipped entirely.
- Check the asset class. Open the overlay on its own: a white rectangle with grey shading is a luminance map and needs `multiply`; dark shapes floating on full transparency are a pre-masked cut-out and need `source-over`; a black field with bright streaks is a glare map and needs `screen`. Choosing by asset appearance is reliable, guessing is not.
- If a future overlay carries both shadow and glare baked into one file, it cannot be composited correctly with a single operation. Split it into two layers rather than compromising on one blend.

## Related Files

- `site/js/mockup.js` (`drawPhoto()`, `OVERLAY_BLENDS`)
- `site/js/mockup-templates.js` (`overlayBlend` field and entry contract)
- `docs/implementation/PHOTO_MOCKUP_TEMPLATES_IMPLEMENTATION.md`
