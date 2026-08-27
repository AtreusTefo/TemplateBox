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
               composites on top of the base (opaque base, e.g. flat paper,
               or a garment).
     backing   Colour painted behind the artwork inside the print area, or
               null for none. Absent means white in "window" mode and none
               in "surface" mode. A frame needs one so a small print reads as
               matted and the export stays opaque; a GARMENT must not have
               one, or the shirt gets a white rectangle on it.
     displace  Optional fabric displacement map, same size as the base.
               R = horizontal offset, G = vertical offset, 128 = no offset;
               neutral grey off-garment. This is what makes a print bend
               around folds instead of sitting on them like a sticker, and
               it is the difference between an apparel mockup that convinces
               and one that does not. Rigid templates (frames, boxes, cards)
               do not need it. The encoding is Photoshop's Displace
               convention, so a greyscale map exported from a purchased
               mockup PSD (R == G, giving an equal x/y shift) drops in
               unchanged. Generate one from the base photograph with
               tools/mockup-admin.html.
     shade     Optional greyscale luminance map, same size as the base, that
               multiplies into the ARTWORK during the displacement pass --
               not over the canvas like `overlay` does. That distinction is
               load-bearing: a full-canvas multiply shades every pixel it
               covers, so wherever the design does not reach it would darken
               the photograph a second time. 255 leaves artwork untouched.
     light     Optional greyscale specular map, screened onto the artwork
               during the displacement pass. Everything above the fabric's
               median, so a fold ridge catching the light lifts the ink
               instead of leaving it flat. Multiply alone can only darken; a
               shading map with no companion light map means the print is
               uniformly dimmed and never modelled.
     lightGain Multiplier on that screen layer. Omitted means 1.
     garment   Optional alpha mask of the garment, hole-filled and feathered.
               Recolour is confined to it -- without it a tint would flood
               skin, hair and background too.
     tone      Optional greyscale map for RECOLOUR only: the garment's
               diffuse response normalised to its own peak, so a dye can only
               darken. Deliberately NOT the `shade`/`light` pair, which is
               median-split for the print pass: screening that specular over
               a dye washes dark colours out (navy measured (140,146,159), a
               pale blue-grey, before this map existed).
     garmentColors
               Palette keyed like the vector products' `colors`. Declaring it
               AND `garment` is what turns the colour field on for a
               photographic template; either alone leaves it hidden. Mark the
               entry representing the garment as photographed with
               `original: true` -- it is skipped rather than tinted, and it
               is what a first-time visitor opens on.
     displaceStrength
               Peak offset in base-image pixels. Omitted means 12. Too high
               reads as melted fabric, too low as a sticker; judge it on a
               straight-lined design, which is where the eye is least
               forgiving.
     warpZone  Four corners of the print area in base-image pixels, ordered
               TL, TR, BR, BL. Axis-aligned rectangles render with the fast
               2D path; non-rectangular quads trigger the perspective warp
               (js/vendor/glfx.js, lazy-loaded only when needed).
     background
               Optional. `true` turns the editor's Background colour panel on
               for this template, which paints the chosen colour behind the
               base photograph. Only for a base whose SCENE is transparent --
               a cut-out product on nothing. A photographed scene has its own
               backdrop and must leave this off, which is why it is declared
               rather than detected: wood-a4's base is transparent inside its
               print window (that transparency IS the mask the artwork shows
               through), so an alpha test would qualify it and paint the
               chosen colour behind the poster. The four drawn products are
               always eligible and need no flag. Not related to `backing`,
               the white paper behind artwork inside a frame's window.

   Adding a template: tools/mockup-admin.html does the whole job. Load the
   base photograph and it will suggest a chest print zone from the garment's
   own proportions (or click the four corners yourself), derive the
   displacement and shading maps, let you tune displaceStrength against a
   test grid using the same shader the editor ships, and emit the thumbnail
   plus the entry below. Paste the entry here, save the downloads under the
   names it gives them, and add a catalog card in index.html with
   data-target="mockup" data-doc="<id>". No other code changes are needed.

   Asset conventions:
     site/assets/mockups/<id>-base.png / <id>-overlay.png
     site/assets/mockups/<id>-displace.png / <id>-shade.png   (fabric only)
     site/assets/thumbnails/product-mockups/<category>/<id>-thumb.jpg
   Paths must stay URL-safe: lowercase, hyphenated, no spaces. The admin tool
   derives every filename from the id, so the id and the assets cannot drift.

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
        thumb: "assets/thumbnails/product-mockups/posters-frames-canvas-billboards/wood-a4-thumb.webp",
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
    },
    {
        id: "tshirt-model-white",
        title: "White T-Shirt on Model",
        thumb: "assets/thumbnails/product-mockups/apparel/tshirt-model-white-thumb.webp",
        base: "assets/mockups/tshirt-model-white-base.png",
        /* Fabric, not glass: the artwork is bent and shaded by the two maps
           below during the displacement pass, so this template carries no
           full-canvas overlay at all. */
        overlay: null,
        displace: "assets/mockups/tshirt-model-white-displace.png",
        shade: "assets/mockups/tshirt-model-white-shade.png",
        /* 2.8% of this garment sits above its own reference white -- the
           light catching the fold ridges. Multiply clamps that away, so it
           is split into its own screen layer. */
        light: "assets/mockups/tshirt-model-white-light.png",
        /* 0.3, not 1. The light map is "everything above the fabric's
           median" on a WHITE garment, which is mostly bright DIFFUSE, not
           surface reflection -- the same confusion that washed dark dyes out
           in recolour before the tone map split them apart. Screened at full
           strength onto dark ink it destroys it: a #12305C navy fill measured
           p95 luma 159 against a source of 44, and a quarter of the print
           lost its blue identity outright. At 0.3 the highlight still models
           the surface and the ink stays the colour it was. */
        lightGain: 0.3,
        /* Alpha mask of the garment, hole-filled and feathered. Recolour is
           confined to it, so the tint cannot creep onto skin or background. */
        garment: "assets/mockups/tshirt-model-white-garment.png",
        /* Diffuse response normalised to the garment's own peak, used ONLY by
           recolour. Distinct from `shade` on purpose: shade is median-split
           for the print pass and pairs with `light`, which would wash a dye
           out. */
        tone: "assets/mockups/tshirt-model-white-tone.png",
        /* High-pass of the weave, centred at 128. Screened back over a
           heather colourway as the undyed fibre; unused by solid dyes. */
        grain: "assets/mockups/tshirt-model-white-grain.png",
        /* Declaring both `garment` and `garmentColors` is what turns the
           colour field on for a photographic template. The first entry is the
           photographed garment itself and is never tinted. */
        garmentColors: {
            original: { name: "As photographed", hex: "#E9E9EC", original: true },
            black: { name: "Black", hex: "#1A1A1A" },
            navy: { name: "Navy", hex: "#1F2A44" },
            red: { name: "Red", hex: "#B5352E" },
            forest: { name: "Forest Green", hex: "#2E4B3C" },
            sand: { name: "Sand", hex: "#D8C7A9" },
            /* `heather` is the fraction of fibre that misses the dye. The hex
               stays the FULL-strength dye; the renderer mixes it toward
               natural cotton by this amount and screens the weave back on.
               Writing the already-faded colour here instead would give the
               right average and no fibre at all. */
            heatherGrey: { name: "Heather Grey", hex: "#6E6E69", heather: 0.55 },
            /* 0.20, not the 0.42 a grey heather takes. A grey heather really
               is mostly undyed fibre, but a navy one is not -- at 0.42 this
               measured (117,121,133), a pale blue-grey with no navy left in
               it. The fraction is a property of the blend, not a constant. */
            heatherNavy: { name: "Heather Navy", hex: "#1F2A44", heather: 0.20 }
        },
        displaceStrength: 16,
        mode: "surface",
        backing: null,
        /* Eligible for the Background panel (August 25, 2026), and unlike
           every other photographic template that is a measured fact rather
           than a preference: this base is 1024x1536 with a fully transparent
           SURROUND -- all four corners read alpha 0 and 39.3% of the image is
           clear -- because the model was cut out of the studio backdrop.

           This is the opposite case to wood-a4, which is also transparent and
           must NOT have this flag: there the clear pixels are the print
           window, so a fill would land behind the artwork. Here they are the
           space around the model, so a fill lands behind the scene, which is
           exactly what a seller wants for a listing. Eligibility is still
           declared rather than detected, for that reason. */
        background: true,
        /* Measured from the base: garment centreline x=520, neckline bottom
           y=444, hem y=1419. The zone is a real 12x16in DTG print area
           scaled to this photograph (975px from collar to hem reads as 28in,
           so 34.8px/in) and starts 3in below the collar. Verified 100%
           fabric -- no skin, no background -- so no occlusion mask is
           needed. */
        warpZone: [
            { x: 311, y: 548 },
            { x: 729, y: 548 },
            { x: 729, y: 1105 },
            { x: 311, y: 1105 }
        ]
    },
    {
        id: "cap-model-white",
        title: "White Baseball Cap on Model",
        thumb: "assets/thumbnails/product-mockups/apparel/cap-model-white-thumb.jpg",
        base: "assets/mockups/cap-model-white-base.png",
        overlay: null,
        displace: "assets/mockups/cap-model-white-displace.png",
        shade: "assets/mockups/cap-model-white-shade.png",
        light: "assets/mockups/cap-model-white-light.png",
        /* 0.3, not 1. The light map is "everything above the fabric's
           median" on a WHITE garment, which is mostly bright DIFFUSE, not
           surface reflection -- the same confusion that washed dark dyes out
           in recolour before the tone map split them apart. Screened at full
           strength onto dark ink it destroys it: a #12305C navy fill measured
           p95 luma 159 against a source of 44, and a quarter of the print
           lost its blue identity outright. At 0.3 the highlight still models
           the surface and the ink stays the colour it was. */
        lightGain: 0.3,
        garment: "assets/mockups/cap-model-white-garment.png",
        tone: "assets/mockups/cap-model-white-tone.png",
        grain: "assets/mockups/cap-model-white-grain.png",
        /* Higher than the shirt's 16 because this base is 1939px wide against
           the shirt's 1024, and displaceStrength is in base-image pixels. It
           is NOT scaled proportionally (that would be ~30): a structured cap
           front is buckram-stiffened and barely moves, and its gradient p99
           measured 22.1 against the shirt's 32.2. What bends the print here is
           the crown's curvature and the two seams, not folds. */
        displaceStrength: 20,
        mode: "surface",
        backing: null,
        /* The cap is a cut-out on transparency, like the shirt, so the
           Background colour panel applies. */
        background: true,
        /* The model also wears a white tee, which classifies as the same
           fabric -- 299,506px, 22.6% of the mask. The factory now keeps only
           the region connected to the print zone, so recolour dyes the cap
           and leaves the shirt alone. */
        garmentColors: {
            original: { name: "As photographed", hex: "#E9E9EC", original: true },
            black: { name: "Black", hex: "#1A1A1A" },
            navy: { name: "Navy", hex: "#1F2A44" },
            red: { name: "Red", hex: "#B5352E" },
            forest: { name: "Forest Green", hex: "#2E4B3C" },
            sand: { name: "Sand", hex: "#D8C7A9" },
            heatherGrey: { name: "Heather Grey", hex: "#6E6E69", heather: 0.55 },
            heatherNavy: { name: "Heather Navy", hex: "#1F2A44", heather: 0.20 }
        },
        /* Front panel, clear of the brim seam (measured at y~740 on the
           centreline) and of the eyelets above. 2:1, the ratio of a standard
           4.5x2.25in cap embroidery area. Verified 99.9% fabric; the 141
           stray pixels are isolated specks, not an edge. */
        warpZone: [
            { x: 600, y: 300 },
            { x: 1340, y: 300 },
            { x: 1340, y: 670 },
            { x: 600, y: 670 }
        ]
    }
];
