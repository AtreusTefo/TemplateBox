# Photographic Mockup Templates ("Sandwich Method") Implementation

Date: July 30, 2026

## Overview

The Product Mockup Generator now supports photographic mockup templates alongside the four flat-vector products. A photographic template composites three layers on the editor's canvas, entirely client-side ("Level A" architecture):

1. Base: a photographed scene (frame, wall, furniture).
2. Design: the user's uploaded artwork, placed into the template's print area.
3. Overlay: a transparent PNG carrying pre-baked shadows and light, drawn last so the artwork appears to sit under real lighting.

The first template is a leaning wood A4 frame (`wood-a4`), built from a purchased isolated-object asset pair. The gallery for these templates is the existing index.html catalog: each template is a catalog card under the Product Mockups filter pill, and clicking it routes through the monetized loading.html flow exactly like every other card. A same-page gallery/modal (as in the original research spec) was deliberately not built because it would bypass the mandatory ad interstitial.

## Files Added

| File | Purpose |
|---|---|
| `site/js/mockup-templates.js` | THE registry of photographic templates (`window.TB_PHOTO_MOCKUPS`). Data only; adding a template requires no changes to `js/mockup.js`. |
| `site/js/vendor/glfx.js` | Vendored copy of glfx.js 0.0.4 (MIT, Evan Wallace) for the 4-point perspective warp. Lazy-loaded only when a non-rectangular warp zone is rendered; never requested for rectangular templates. Vendored rather than CDN-linked because the cdnjs URL circulating in research notes (`cdnjs.cloudflare.com/ajax/libs/glfx.js/0.0.4/glfx.min.js`) does not exist (404); the file was fetched from jsdelivr (`npm/glfx@0.0.4`). |
| `site/tools/mockup-admin.html` | Internal coordinate picker. Load a base image locally, click the four print-area corners (TL, TR, BR, BL), and copy a ready-to-paste registry entry. Covered by the existing `X-Robots-Tag: noindex` rule on `/tools/*` in `netlify.toml`. |
| `site/assets/mockups/wood-a4-base.png` | Scene photograph, 2000x2000, with a fully transparent print window (moved from `site/assets/`). |
| `site/assets/mockups/wood-a4-overlay.png` | Shadow/glare overlay, 2000x2000 (moved from `site/assets/`). |
| `site/assets/thumbnails/product-mockups/posters-frames-canvas-billboards/wood-a4-thumb.jpg` | Generated catalog thumbnail (800x1000, 63KB): white backing + base + overlay, cropped to the card's 4:5 ratio. |

## Files Modified

- `site/js/mockup.js` - photographic product type: registry ingestion with structural validation, per-template asset cache with loading/error canvas states, Sandwich Method compositor, canvas resizing to the base photograph's native resolution for full-quality export, `TB.takePreset()` consumption so catalog cards can deep-select a template, `crossOrigin="anonymous"` on absolute asset URLs (future object-storage readiness), lazy perspective-warp path for non-rectangular zones, color-field hiding for photo templates.
- `site/mockup.html` - `js/mockup-templates.js` include before `js/mockup.js`, `id="m-color-field"` wrapper for the color field, intro/meta/JSON-LD copy extended to mention photographed poster frames.
- `site/index.html` - new catalog card (Leaning Wood Frame Poster Mockup) with a real image thumbnail, `data-target="mockup" data-doc="wood-a4"`; hero template count updated from fifteen to sixteen.
- `site/css/style.css` - `.card-preview.photo` and `.card-thumb`: image thumbnails fill the 4:5 preview edge-to-edge instead of receiving the CSS-miniature padding.

## Rendering: Compositing Order Depends on the Asset Style

The purchased asset's print window is fully transparent in the base file, which changes the classic sandwich order. Two modes are supported, declared per template:

- `mode: "window"` (wood-a4): design first (over a white paper backing), then the base, then the overlay. The base's own antialiased window edge masks the design, which is why this order produces cleaner edges than clipping the design on top. The white backing keeps exports opaque when the design does not cover the full window (reads as a matted print).
- `mode: "surface"`: base first, then design, then overlay - for future assets whose print area is opaque in the base file.

The overlay is always the final layer.

## The Overlay Blend Mode Is Not Optional

The overlay's composite operation is declared per template (`overlayBlend`) and it decides whether the layer reads as light or as paint. The wood-a4 overlay is a baked luminance map: inside the print window it averages alpha 193 over a near-white body (mean luma 211). Drawn with the canvas default `source-over` it veiled the artwork completely — a design whose true colour was (196, 138, 74) sampled as (234, 219, 204). With `multiply`, white pixels pass the artwork through untouched and greys darken it, so the same sample reads (190, 134, 72) and the window-light and pampas-grass shadows fall across the design convincingly. The valid values are `multiply` (luminance/shadow map), `screen` (glare map) and `source-over` (conventional pre-masked cut-out); an absent or unrecognized value falls back to `source-over`.

The whitelist around this field matters because the Canvas spec ignores an unrecognized `globalCompositeOperation`, silently leaving `source-over` — so a typo would reintroduce the washout with no error surfaced anywhere. Full diagnosis, per-asset-class selection guidance and the pixel-level test: `docs/error-fixes/PHOTO_MOCKUP_OVERLAY_WASHES_OUT_DESIGN.md`.

## Print Area Placement

The `warpZone` is four corners in base-image pixels (TL, TR, BR, BL).

- Axis-aligned rectangle (the wood-a4 case): the design uses the existing contain-fit, scale-slider and drag-to-reposition logic, clipped to the zone. Coordinates for wood-a4 were measured from the base's alpha channel: the transparent window spans x 655-1461, y 224-1583.
- Non-rectangular quad (future leaning/angled shots): the design maps corner-to-corner through a 4-point perspective warp (glfx.js, WebGL). Drag is not offered and the size slider is disabled, because the mapping is full-bleed by definition. If the library or a WebGL context is unavailable, the design falls back to an unwarped draw across the zone's bounding box.

The warp path is structurally complete but **dormant and unverified**: no non-rectangular asset exists yet. Verify it visually when the first angled template is added.

## Adding a Template (data-only workflow)

1. Save assets as `site/assets/mockups/<id>-base.png` and `<id>-overlay.png` (URL-safe names: lowercase, hyphens, no spaces - the folders supplied for wood-a4 contained spaces and commas and had to be renamed before they could be referenced).
2. Open `tools/mockup-admin.html`, load the base image, click the four print-area corners, fill in the id/title/mode, and copy the generated entry.
3. Paste the entry into `window.TB_PHOTO_MOCKUPS` in `site/js/mockup-templates.js`, then set `overlayBlend` by inspecting the overlay asset: white-with-grey-shading means `multiply`, dark-shapes-on-transparency means `source-over`, black-with-bright-streaks means `screen`. Do not skip this — the wrong value silently washes the artwork out (see the section above).
4. Generate a thumbnail under roughly 100KB at `site/assets/thumbnails/product-mockups/<category>/<id>-thumb.jpg` (composite white backing + base + overlay, crop to 4:5). Do not use the full-resolution renders as thumbnails: the supplied `wood-a4-thumbnail.webp` files are 2000x2000 at about 1.4MB each, which is catalog-poison at 100+ planned items. They remain in the repository unused.
5. Add a catalog card in `index.html` with `data-target="mockup" data-doc="<id>"`, an `<img class="card-thumb">` preview inside `<div class="card-preview photo">`, and `data-category="mockups"`.
6. Update the hero template count in `index.html`.

The editor picks the template up automatically: registry entries become options in the Product Template select (under a "Poster and Frame Mockups" optgroup) and valid `data-doc` presets, with no `js/mockup.js` changes.

## Security and Integrity

- The preset from `TB.takePreset()` is only ever matched against the products that ship (`hasOwnProperty` guard), mirroring the docs.html pattern - a tampered value cannot become a route or an asset URL.
- Registry entries are structurally validated before registration; a malformed entry is skipped, not allowed to break the editor.
- Upload mime validation, sanitize/desanitize round-trips and createElement-only tray rendering are unchanged.
- `crossOrigin="anonymous"` is set on template images with absolute http(s) URLs so a future move to object storage does not taint the canvas and silently break PNG export. Local relative paths are unaffected. When that move happens, the bucket must also send a CORS policy allowing `https://templatebox.win`.

## Scale Plan (from the research brief)

Assets stay local while the collection is small; the repository can comfortably carry tens of templates. When the collection approaches the point where the repo nears 1GB, move base/overlay PNGs to object storage and switch the registry's `base`/`overlay` fields to absolute URLs - the code path for that is already in place (see above). Thumbnails stay local and in the repository regardless: they are small and the catalog depends on them.

## Verification (July 30, 2026)

Playwright is not installed in this environment; verification used headless Microsoft Edge screenshots against `npx serve` plus `node --check` syntax validation.

- Preset hand-off: a temporary same-origin seed page (deleted after the run) wrote `tb_editor_preset` exactly as `js/app.js` does; the editor opened on "Leaning Wood Frame Poster" with the color field hidden and the full sandwich rendered (base photograph, paper backing with prompt visible through the frame window, overlay shadows falling across it).
- Compositing with a real design: a scratchpad harness reproducing `drawPhoto()`'s mode-"window" path against the real assets, with a synthetic saturated A4 design, rendered the artwork correctly masked by the frame's window with the scene's shadows across it, and `canvas.toDataURL()` returned a 3.4MB PNG rather than throwing, confirming the canvas is not tainted. This harness is what surfaced the overlay blend-mode defect: `source-over` vs `multiply` were rendered side by side and sampled pixel-by-pixel (see the error-fix document).
- **End-to-end upload through the editor's own file input.** Headless browsers cannot type into a file picker, but they can populate one programmatically: a harness built a PNG `File` via `canvas.toBlob`, assigned it through a `DataTransfer` to `#m-design`, and dispatched the `change` event, so the production path ran unmodified — mime validation, `FileReader`, image decode, `drawPhoto()`. Result: product resolved to `wood-a4`, canvas sized to the base's native 2000x2000, the design's kraft region sampled (190, 134, 72) against a true `#C48A4A` (196, 138, 74) so saturation survives the overlay, `toDataURL()` succeeded (untainted), and the error element stayed empty. The rendered frame shows the artwork with the window light and pampas shadows across it. This technique is worth reusing: it closes the file-upload verification gap that has been open on this project since July 20.
- Vector regression: default load still opens the T-Shirt with color swatches and placeholder, unchanged.
- Catalog: the new card renders with the photographic thumbnail filling the 4:5 preview; all URLs (registry, vendor lib, both PNGs, thumbnail, admin tool) return 200 through the standard `serve.json` setup.
- A 320px-wide capture showed right-edge cutoff, but the identical cutoff appears on the pre-change page and on `docs.html`, which was Playwright-verified overflow-free on July 21 - it is a headless-Edge window-clamp artifact, not layout overflow. The real-device narrow-viewport pass for mockup.html remains open exactly as before.

Discovered during verification, unrelated to this feature: production `https://templatebox.win/` was returning 404 for every path directly from Cloudflare (no Netlify headers) while `https://templatebox.netlify.app/` served normally - recorded as a critical open item in `docs/memory/PROJECT_STATUS.md`.

## Known Limitations
- Tray thumbnails for photo templates snapshot the full 2000x2000 canvas as PNG data URLs in memory; a long session adding many mockups will hold several MB per entry. In-memory only, so the cost ends when the tab closes.
- The size slider's 30-100% range is a contain-fit: 100% fits the design inside the paper, it does not cover-crop. An A4-proportioned upload fills the wood-a4 sheet almost exactly; other ratios show the white mat, which is intended.
- The perspective-warp path awaits its first real angled asset before it can be considered verified.
