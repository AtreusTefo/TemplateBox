# Product Mockup Generator Implementation

Date: July 20, 2026
Updated: July 21, 2026 — added the loading-page countdown resilience fix and the local-testing `serve.json` fix below, both surfaced while verifying the mockup launch flow end to end.

## Overview

A third editor tool, alongside the resume builder and poster maker: a print-on-demand product mockup generator. Users upload artwork once, pick a product template (t-shirt, hoodie, mug, or packaging box), choose a color, then drag and scale the design directly on a live canvas preview. A one-click "Add to My Mockups" tray lets a user build several product renders for one design before downloading them for a store listing. Follows the same 100% client-side, ad-free-editor architecture as `resume.html` and `poster.html`.

## Files Added

| File | Purpose |
|---|---|
| `mockup.html` | Editor page. Split-pane layout (`.editor-layout` / `.editor-pane` / `.preview-pane`) reusing the shared mobile-tab and shell CSS already established by `resume.html`/`poster.html`. |
| `js/mockup.js` | Core logic: flat vector product illustrations drawn on HTML5 Canvas, mime-validated design upload, pointer-driven drag/scale placement, the in-memory mockup tray, localStorage retention of non-image settings, and PNG export. |

## Files Modified

- `js/app.js` — added `mockup: "mockup.html"` to the `EDITOR_ROUTES` whitelist (the only change needed to wire the tool into the existing monetized `index.html -> loading.html -> editor` flow; no ad work required).
- `index.html` — added a "Mockups" filter pill, three catalog cards (Apparel, Mug, Packaging, all routing to `data-target="mockup"`, mirroring how the three existing poster cards all route to `poster`), and updated the page title/meta description/OG tags/JSON-LD description and the hero H1/copy to mention the new tool.
- `css/style.css` — mockup catalog card preview variants (`.mock-doc.mockup` + `.dot-row`/`.dot` color swatches), and the editor's own styles: `.mockup-stage`, `.color-row`, `.range-row`, `.mockup-tray` and its `.tray-*` grid/card/thumbnail rules.
- `sitemap.xml` — added `mockup.html` at the same priority (0.8) as the other two editor entry points.
- `js/app.js` (`initLoadingPage`) — sets `window.__tbLoadingActive = true` once it takes over the countdown, so the loading-page inline fallback (below) knows to stay dormant. The `DOMContentLoaded` boot handler also now runs `initCatalog`/`initLoadingPage`/`initEditorTabs` each inside its own `try/catch` instead of as three unguarded sequential calls, so a throw in one can no longer prevent the others — specifically, prevent the countdown — from starting.
- `loading.html` — added a dependency-free inline `<script>` safety net after the `js/app.js` include (see below).

## Loading-Page Countdown Resilience

Surfaced while testing the new mockup launch flow: the countdown text (`10`) is static markup in `loading.html`, so if `js/app.js` ever fails to load or throws before scheduling its timer (blocked request, cache corruption, an unrelated exception in a sibling initializer under the old unguarded boot sequence), the page was left frozen at `10` forever with no redirect — indistinguishable from "the countdown isn't working."

Two changes close this:

1. Each boot initializer in `js/app.js` is now isolated in its own `try/catch` (see above), so `initLoadingPage()` starting is no longer contingent on `initCatalog()`/`initEditorTabs()` succeeding.
2. `loading.html` carries a small inline, dependency-free fallback script after the `js/app.js` `<script>` tag. It waits 1.5s (giving the primary script a head start), then checks `window.__tbLoadingActive`. If unset, it runs its own identical 10-second countdown and redirect, resolving the `?target=` query against its own copy of the route whitelist (`resume`/`poster`/`mockup`, defaulting to `resume` for anything else — including hostile inputs like absolute/protocol-relative URLs, path traversal, or prototype-chain keys such as `__proto__`/`constructor`, guarded against via `Object.prototype.hasOwnProperty.call`).

The route table in the fallback duplicates `EDITOR_ROUTES` in `js/app.js` by necessity — the whole point is that it must not depend on `js/app.js` having loaded. **Adding a fifth editor requires updating both places**, or the fallback path silently routes unrecognized/failed cases to `resume.html`.

Verified with Playwright headless runs covering both paths: the normal path (`js/app.js` driving) still completes the countdown and redirect in exactly 10 seconds; the fallback path (`js/app.js` request aborted) completes in ~12 seconds (the 1.5s head start plus the 10-second countdown) and lands on the correct editor. A 10-case whitelist fuzz of the fallback's route resolution (valid targets, missing target, unknown target, and six hostile payloads) all resolved correctly, with none escaping to an external host.

## Local Testing Fix (serve.json)

Also surfaced while testing this flow: `npx serve .` — the local test command this project's own tooling docs recommend — 301-redirects any `*.html` request to a clean, extensionless URL by default, and that redirect drops the query string. `loading.html?target=mockup` was silently becoming `loading` with no `target`, so `initLoadingPage()` fell back to the default editor (`resume`) instead of `mockup`, purely as a local-dev-server artifact — Netlify (production) has no equivalent redirect. Fixed by adding `serve.json` (`{"cleanUrls": false}`) at the repo root. Full write-up: `docs/error-fixes/LOCAL_SERVE_CLEAN_URL_DROPS_TARGET_QUERY.md`.

## Product Rendering

Each product template is a flat, gradient-free vector illustration composed with plain Canvas 2D path/fill/stroke calls, matching the "Flat, sharp, rectangular. No gradients, no drop shadows" theme already documented at the top of `css/style.css` — no external product photography or template image assets are loaded, keeping the tool fully offline-capable and payload-free like the poster frame styles.

| Product | Notable construction detail |
|---|---|
| T-Shirt | Single closed path (12 line segments + one neckline curve) for the silhouette; a `printArea` rectangle centered on the chest. |
| Hoodie | Reuses the t-shirt silhouette, then layers a hood shape, two drawstrings, a rounded kangaroo pocket, and sleeve cuffs on top. |
| Mug | Rounded-rect body plus a rim (two nested ellipses) and a handle drawn as a thick arc. The handle's arc sweep deliberately extends past 90 degrees on each side so both ends land behind the body's right edge (hidden under it) rather than floating disconnected — the visible crescent is only the portion the body doesn't cover. |
| Packaging Box | A front-facing rect plus two flat, semi-transparent flap-strip polygons (top and side) to suggest depth without a gradient, and two small tape-tab rectangles positioned clear of the print area. |

`roundRectPath()` is a small hand-written helper (used for the mug body, hoodie pocket, and the print-area clip) rather than `ctx.roundRect()`, since that native method isn't supported in every browser this free tool needs to reach.

Every product declares an axis-aligned `printArea` (`{x, y, w, h}` in the fixed 1000x1000 canvas coordinate space) that the uploaded design composites into, clipped with `ctx.clip()` so the artwork never bleeds onto the rest of the product.

## Design Placement (drag and scale)

- **Scale**: a single range input (30-100%) scales the design using a contain-fit against the print area (`Math.min(area.w / img.width, area.h / img.height)`), so the artwork's aspect ratio is never distorted.
- **Position**: Pointer Events (`pointerdown`/`pointermove`/`pointerup`/`pointercancel`) drive drag-to-reposition. A hit test against the design's last-drawn on-canvas rectangle means dragging only starts when the pointer actually lands on the artwork, not anywhere on the product illustration. `canvas.setPointerCapture()` keeps the drag alive even if the pointer leaves the canvas mid-move. Screen-to-canvas coordinate conversion accounts for the CSS-scaled display size versus the fixed 1000x1000 internal resolution (the same fixed-resolution-with-CSS-scaling pattern `poster.html` uses for its 1200x1500 canvas).
- Offsets are clamped to keep the design's center within the print area bounds so it cannot be dragged entirely out of view.

## The "My Mockups" Tray

A one-click "Add to My Mockups" button snapshots the current canvas (`canvas.toDataURL()`) into an in-memory array rendered as a thumbnail grid, each with its own Download and Remove action. This is the closest honest equivalent to "add images to your products in one click" that a database-free, server-free tool can offer: there is no product catalog to attach images to, so the tray is a staging area for exporting several finished mockups from one uploaded design before dropping them into whatever store platform the user actually manages.

The tray is intentionally **not** persisted to localStorage — only in memory for the current tab. This matches the precedent already set by `poster.js`, whose photo upload comment explains that image data is kept out of `localStorage` to respect browser storage quotas; a tray of several full-resolution PNG data URIs would risk hitting that quota. Non-image settings (selected product, color, scale, drag offset, and the label field) are still persisted under `tb_mockup_v1`, following the same sanitize-on-write/desanitize-on-render round trip as the poster caption.

## Security

- Upload validation matches the existing pattern exactly: `file.type` must match `/^image\//`; execution terminates immediately (upload cleared, no draw) on a mismatch, per the project's image-restriction rule.
- All tray rendering uses `createElement` + `textContent`/`.alt`/`.src` property assignment; `innerHTML` is never used.
- The mockup label field is passed through `TB.sanitize` before being stored (in the tray item object and in localStorage) and `TB.desanitize` before being written back into any preview surface, matching the resume/poster text-field pattern.

## Known Limitations

- The packaging box print area is a plain axis-aligned rectangle on the front face rather than a perspective-skewed quad, so it does not visually "wrap" the isometric flap strips. This trade-off keeps the drag/scale/clip logic identical across all four products instead of introducing a separate affine-transform code path for one product.
- Product illustrations are stylized flat icons, not photographic mockups — consistent with the project's zero-image-asset, zero-server-payload constraint, but a visual step down from photographic mockup services.
