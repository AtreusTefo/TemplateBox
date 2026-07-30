/* ==========================================================================
   TemplateBox - Photographic Mockup Template Registry
   THE single data source for photographic ("Level A" / Sandwich Method)
   mockup templates rendered by js/mockup.js. Each entry pairs a photographed
   base scene with an optional transparency overlay and declares the print
   area in base-image pixel coordinates.

   Entry contract:
     id        Unique key. Also the value catalog cards pass via data-doc,
               matched against this registry only (never used as a route).
     title     Human label shown in the editor's template select.
     thumb     Small local thumbnail for catalog/preview use (kept under
               ~100KB; generate from base+overlay, do not ship the full-size
               render as a thumbnail).
     base      The scene photograph. In "window" mode the print opening is
               fully transparent in this file, so the user's design renders
               BEHIND it and the base's own antialiased edges mask the art.
     overlay   Optional transparent PNG of shadows/glare drawn last, on top
               of everything ("the top slice of the sandwich"). Null if the
               template has none.
     overlayBlend
               How the overlay composites: "multiply" for a baked luminance
               map (white = lit, grey = shadowed), "screen" for glass glare,
               "source-over" for a conventional pre-masked PNG. Omitted
               means "source-over". Getting this wrong is not subtle: a
               near-white luminance map at source-over paints over the
               artwork instead of shading it. Check the asset before
               choosing -- if the overlay looks like a white rectangle with
               grey shading when opened on its own, it is a luminance map
               and needs "multiply".
     mode      "window": design composites behind the base (transparent
               print opening cut out of the base). "surface": design
               composites on top of the base (opaque base, e.g. flat paper).
     warpZone  Four corners of the print area in base-image pixels, ordered
               TL, TR, BR, BL. Axis-aligned rectangles render with the fast
               2D path; non-rectangular quads trigger the perspective warp
               (js/vendor/glfx.js, lazy-loaded only when needed).

   Adding a template: measure the corners with tools/mockup-admin.html
   (click the four corners of the print area on the base image), drop the
   generated entry here, and add a catalog card in index.html with
   data-target="mockup" data-doc="<id>". No other code changes are needed.

   Asset conventions:
     site/assets/mockups/<id>-base.png / <id>-overlay.png
     site/assets/thumbnails/product-mockups/<category>/<id>-thumb.jpg
   Paths must stay URL-safe: lowercase, hyphenated, no spaces.

   Scale note: assets are local while the catalog is small. When the
   collection outgrows the repository (roughly 1GB), move base/overlay
   files to object storage and use absolute https URLs here; js/mockup.js
   already sets crossOrigin="anonymous" on absolute URLs so canvas exports
   do not become tainted.
   ========================================================================== */

"use strict";

window.TB_PHOTO_MOCKUPS = [
    {
        id: "wood-a4",
        title: "Leaning Wood Frame Poster",
        thumb: "assets/thumbnails/product-mockups/posters-frames-canvas-billboards/wood-a4-thumb.jpg",
        base: "assets/mockups/wood-a4-base.png",
        overlay: "assets/mockups/wood-a4-overlay.png",
        /* Measured: inside the print window this overlay averages alpha 193
           over a near-white body (mean luma 211), so it is a luminance map,
           not a shadow cut-out. */
        overlayBlend: "multiply",
        mode: "window",
        /* Measured from the base's alpha channel: the fully transparent
           window spans x 655-1461, y 224-1583 in the 2000x2000 source. */
        warpZone: [
            { x: 655, y: 224 },
            { x: 1461, y: 224 },
            { x: 1461, y: 1583 },
            { x: 655, y: 1583 }
        ]
    }
];
