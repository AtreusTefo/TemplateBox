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
     designScale
               What the FIRST upload opens at, as a fraction of the
               contain-fit inside the print zone. Omitted means 0.75, which
               suits artwork printed ON a product -- a chest graphic filling
               its print area edge to edge does not read as a t-shirt. Set 1
               where the artwork IS the product, so a poster fills its frame
               and a banner fills its face. The string "cover" goes further
               and fills the opening whatever the artwork's aspect, cropping
               the overflow against the zone clip -- which is what a frame
               wants, since a landscape photo letterboxed inside a portrait
               frame reads as a mistake. Only the STARTING scale changes
               either way; the fit underneath stays contain and Design Size
               scales back down to reveal the whole image, so nothing an
               uploader supplied is lost.
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
     site/assets/mockups/<category>/<id>/<id>-base.png / <id>-overlay.png
     site/assets/mockups/<category>/<id>/<id>-displace.png / <id>-shade.png
     site/assets/thumbnails/product-mockups/<category>/<id>/<id>-thumb.jpg
   Paths must stay URL-safe: lowercase, hyphenated, no spaces. The admin tool
   derives every filename from the id, so the id and the assets cannot drift.

   ONE FOLDER PER MOCKUP since September 3, 2026. The seven maps of a template
   are only ever loaded together, so they live together; retiring a template is
   deleting a directory rather than finding seven files by prefix among twenty.
   The prefix part is the real reason. Ids nest -- `tshirt-model-white` is a
   PREFIX of `tshirt-model-white-back` -- so in a flat folder no prefix-based
   operation on the shorter one is safe, and the same hazard had already been
   met once in js/admin.js, where `<id>-thumb` is a prefix of `<id>-thumb-blank`
   and a startsWith check deleted the wrong file. A folder boundary removes the
   whole class.

   The FILE NAMES still carry the id even though the folder already does, and
   the redundancy is deliberate. It is what lets an asset identify itself where
   its folder is not visible: a devtools network waterfall, a downloads folder,
   or the flat object-storage bucket the scale note below anticipates. Thirteen
   files called base.png would be worse in all three.

   <category> is a nested taxonomy path, and the SAME path is used in both
   trees -- apparel/t-shirts, apparel/hats/baseball-caps, drinkware/mugs,
   packaging/boxes, print/posters-and-frames, print/business-cards,
   print/signage, and so on. The admin tool takes
   it once and writes it into both. It carries no runtime meaning: nothing
   parses these strings, and the catalog card's data-category is what filters
   the grid. The folders exist so a collection of hundreds of source photos,
   seven maps apiece, stays navigable on disk -- and so the eventual move to
   object storage (see the scale note below) is a prefix swap rather than a
   sort. Segment names omit the word "mockup": the tree is already under
   assets/mockups/, so apparel/hats/baseball-caps, never
   "apparel mockups/hats Mockups/baseball cap mockups".

   Empty category folders are not in git -- git tracks files, not directories
   -- so a fresh clone has only the folders that hold assets. Creating one is
   part of adding the first template that needs it, not a separate step.

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
        thumb: "assets/thumbnails/product-mockups/print/posters-and-frames/wood-a4/wood-a4-thumb.webp",
        base: "assets/mockups/print/posters-and-frames/wood-a4/wood-a4-base.png",
        overlay: "assets/mockups/print/posters-and-frames/wood-a4/wood-a4-overlay.png",
        /* Measured: inside the print window this overlay averages alpha 193
           over a near-white body (mean luma 211), so it is a luminance map,
           not a shadow cut-out. */
        overlayBlend: "multiply",
        mode: "window",
        /* A poster fills its frame here too. The white `backing` behind the
           artwork means a smaller design reads as matted rather than broken,
           so this was less obviously wrong than on the interior frame -- but
           it was still a margin nobody asked for. */
        designScale: "cover",
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
        thumb: "assets/thumbnails/product-mockups/apparel/t-shirts/tshirt-model-white/tshirt-model-white-thumb.webp",
        base: "assets/mockups/apparel/t-shirts/tshirt-model-white/tshirt-model-white-base.png",
        /* Fabric, not glass: the artwork is bent and shaded by the two maps
           below during the displacement pass, so this template carries no
           full-canvas overlay at all. */
        overlay: null,
        displace: "assets/mockups/apparel/t-shirts/tshirt-model-white/tshirt-model-white-displace.png",
        shade: "assets/mockups/apparel/t-shirts/tshirt-model-white/tshirt-model-white-shade.png",
        /* 2.8% of this garment sits above its own reference white -- the
           light catching the fold ridges. Multiply clamps that away, so it
           is split into its own screen layer. */
        light: "assets/mockups/apparel/t-shirts/tshirt-model-white/tshirt-model-white-light.png",
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
        garment: "assets/mockups/apparel/t-shirts/tshirt-model-white/tshirt-model-white-garment.png",
        /* Diffuse response normalised to the garment's own peak, used ONLY by
           recolour. Distinct from `shade` on purpose: shade is median-split
           for the print pass and pairs with `light`, which would wash a dye
           out. */
        tone: "assets/mockups/apparel/t-shirts/tshirt-model-white/tshirt-model-white-tone.png",
        /* High-pass of the weave, centred at 128. Screened back over a
           heather colourway as the undyed fibre; unused by solid dyes. */
        grain: "assets/mockups/apparel/t-shirts/tshirt-model-white/tshirt-model-white-grain.png",
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
        /* The back of the same shirt, and the first template in the catalog
           that is a second VIEW of a product already here rather than a new
           product. That is a claim about the photographs, so it was measured
           before it was relied on: sleeve tip to sleeve tip is 1937px here
           against 966px on the front, which is 1932 once the front is put in
           this base's coordinates -- 0.26% apart. The hems agree too (2812
           here, 1418x2 = 2836 there). The two are the same garment at the same
           distance, so the front's 34.8 px/in carries over as 69.6 px/in and
           the print zone below is the same real 12x16in area. */
        id: "tshirt-model-white-back",
        title: "White T-Shirt on Model, Back",
        thumb: "assets/thumbnails/product-mockups/apparel/t-shirts/tshirt-model-white-back/tshirt-model-white-back-thumb.jpg",
        /* 2048x3072 -- twice the linear size of every other garment base here.
           That matters in exactly one place, `displaceStrength`, which is in
           base-image pixels; everything else in this entry is a coordinate in
           the same space. */
        base: "assets/mockups/apparel/t-shirts/tshirt-model-white-back/tshirt-model-white-back-base.png",
        overlay: null,
        displace: "assets/mockups/apparel/t-shirts/tshirt-model-white-back/tshirt-model-white-back-displace.png",
        shade: "assets/mockups/apparel/t-shirts/tshirt-model-white-back/tshirt-model-white-back-shade.png",
        light: "assets/mockups/apparel/t-shirts/tshirt-model-white-back/tshirt-model-white-back-light.png",
        /* 0.3, measured on this base rather than inherited: a #12305C navy
           fill across the zone reaches p95 luma 192.1 at gain 1.0 against a
           source of 44, and 11.90% of the print stops reading as blue. At 0.3
           the loss is 0.00% and p95 is 88.5. */
        lightGain: 0.3,
        garment: "assets/mockups/apparel/t-shirts/tshirt-model-white-back/tshirt-model-white-back-garment.png",
        tone: "assets/mockups/apparel/t-shirts/tshirt-model-white-back/tshirt-model-white-back-tone.png",
        /* The lowest weave in the catalog: 2.18 luma levels against the
           front's 3.78 and the hoodie's 4.11, barely over the 2.0 floor. A
           back has no chest folds to break the light up, so the heather
           colourways below model the fibre more faintly here than on any
           other garment. Real, and not worth faking with a synthetic map. */
        grain: "assets/mockups/apparel/t-shirts/tshirt-model-white-back/tshirt-model-white-back-grain.png",
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
        /* 27, and the arithmetic is the only reason it is not the front's 16.
           Gradient p99 is 17.34 here, but a Sobel measures luma change PER
           PIXEL, so a base at twice the linear size reads half the gradient
           for the same physical fold: in the front's coordinates this back is
           34.7 against its 41.5, a genuinely smoother surface at 0.836. The
           front spends 16/1024 = 1.56% of base width; 1.56% x 0.836 = 1.31%,
           which is 26.8px of this base. Judged on the straight bars of the
           thumbnail lockup: at 16 the edges stay too clean and the print
           reads as a decal, at 45 the ring is visibly out of round. */
        displaceStrength: 27,
        mode: "surface",
        backing: null,
        /* Cut out on transparency: all four corners read alpha 0 and 40.1% of
           the image is clear. */
        background: true,
        /* A real 12x16in back print at 69.6 px/in (835x1114), its top 3in
           below the collar seam -- the same 3in rule the front uses, applied
           to the back's own landmark, which is why this print sits higher in
           frame than the front's: a crew neck's front scoop is 1.8in below
           the back collar seam (y=761 here against y=888 for the front in
           these coordinates).

           Centred on x=1029, interpolated between the two symmetric landmarks
           rather than taken from the frame: the collar and yoke rows average a
           midpoint of 1024.0 and the hem rows 1038.1, and the zone's own
           mid-height falls 37% of the way between them. The frame centre,
           1024, and the armhole seams, 1008.5, both disagree with that by
           enough to see.

           Verified 100.0000% fabric, zero impure pixels, with the default
           sat<14 / luma>110 gates: the model's hair fails luma, the forearms
           and the back of the neck fail saturation (0 of 2160 probe pixels
           beside the torso classify), and the charcoal jeans fail luma
           outright, so the mask stops at y=2815 and none of it is skin.

           The zone's width is bounded by the arms, not the shoulders. From
           y~1740 down the forearms cut the visible torso to a run of x
           549..1511 through the centreline, and 835px leaves 63px clear on the
           left and 65px on the right at the narrowest row. The raw mask
           suggests 20px, but that is one stray pixel at (591, 1467); closing
           1-D specks shorter than 8px is what shows the real margin. */
        warpZone: [
            { x: 612, y: 970 },
            { x: 1446, y: 970 },
            { x: 1446, y: 2083 },
            { x: 612, y: 2083 }
        ]
    },
    {
        /* The plain product shot, and the template that REPLACED the drawn
           vector `tshirt` on September 2, 2026. No model: a shirt on a wooden
           hanger, cut out, so the editor's Background panel supplies whatever
           backdrop a seller wants.

           The photograph arrived with a chrome clothing rail across the top
           and down the left, and the rail had to be removed from the image
           before anything else could be done. Chrome and white cotton are the
           same thing to the classifier: the rail's specular measured luma 248
           at saturation 1 -- BRIGHTER and LESS saturated than the shirt's 232
           at 7 -- so no gate separates them, and raising the luma floor to 190
           still left 11,110 rail pixels while the shirt began losing its own
           shading. The connected-region restriction could not save it either,
           because the left sleeve hangs in front of the post at y 618..647 and
           joins the two into one region. 37,873 rail pixels sat in the
           shirt's own region, and every one of them would have turned navy
           with the shirt. This is the hanger's lesson in reverse: a WOODEN
           hanger fails the saturation gate at 103 and is safe, which is why
           the generation prompt asked for one. */
        id: "tshirt-hanger-white",
        title: "White T-Shirt on a Hanger",
        thumb: "assets/thumbnails/product-mockups/apparel/t-shirts/tshirt-hanger-white/tshirt-hanger-white-thumb.jpg",
        /* 1174x1468, and the first base in the catalog that is EXACTLY 4:5 --
           the catalog card's own ratio -- so its thumbnail is a straight
           downscale rather than a crop. That is built, not lucky: the frame is
           the garment's bounding box plus an 80px margin, with the height set
           from the width. */
        base: "assets/mockups/apparel/t-shirts/tshirt-hanger-white/tshirt-hanger-white-base.png",
        overlay: null,
        displace: "assets/mockups/apparel/t-shirts/tshirt-hanger-white/tshirt-hanger-white-displace.png",
        shade: "assets/mockups/apparel/t-shirts/tshirt-hanger-white/tshirt-hanger-white-shade.png",
        light: "assets/mockups/apparel/t-shirts/tshirt-hanger-white/tshirt-hanger-white-light.png",
        /* 0.3, measured on this base: a #12305C navy fill reaches p95 luma
           174.8 at gain 1.0 against a source of 44 and 13.46% of the print
           stops reading as blue. At 0.3, 0.00%. */
        lightGain: 0.3,
        garment: "assets/mockups/apparel/t-shirts/tshirt-hanger-white/tshirt-hanger-white-garment.png",
        tone: "assets/mockups/apparel/t-shirts/tshirt-hanger-white/tshirt-hanger-white-tone.png",
        /* 1.92 luma levels, and this is the only map here that ships BELOW its
           own quality floor: the derive flags anything under 2.0 as too
           smooth. A shirt on a hanger is lit flat and has no body under it to
           break the light up, so there is less weave to record than on any
           worn garment (back shirt 2.18, back hoodie 2.98, front shirt 3.78).
           The consequence is specific and limited -- the two heather
           colourways model their undyed fibre faintly here, closer to a plain
           marl than on the model shots. The solid colours do not use this map
           at all. */
        grain: "assets/mockups/apparel/t-shirts/tshirt-hanger-white/tshirt-hanger-white-grain.png",
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
        /* 16, by the zone measure the back hoodie introduced rather than by
           the global one. Global p99 is 15.06 and the zone's is 5.59, a ratio
           of 0.371, so this delivers 5.97px of peak offset inside the print --
           0.509% of base width, against the back shirt's 0.519% on a print
           surface of comparable flatness (zone p50 1.39 here, 0.84 there).
           Judged on the straight bars of the thumbnail lockup: 10 is too
           clean, and at 26 the ring starts to go out of round at its
           lower left. */
        displaceStrength: 16,
        mode: "surface",
        backing: null,
        /* Cut out on transparency: all four corners read alpha 0, 56.8% of the
           image is clear, and after the rail was removed ZERO transparent
           pixels still carry RGB. */
        background: true,
        /* 427x570 -- a real 12x16in print at 35.6 px/in, its top 3in below the
           neckline. Both the scale and the placement follow the same rules
           `tshirt-model-white` uses, applied to this photograph's own
           landmarks: the neckline's lowest point on the centreline is y=337,
           the hem is y=1333, and 996px between them reads as 28in. The zone
           therefore lands at the same fraction of the garment as the model
           shot's does (0.429 of collar-to-hem wide, 0.571 tall), so the same
           artwork reads the same size on both.

           Centred on x=570, which the garment's own row midpoints hold to
           within 2px from the chest to the hem. Verified 100.0000% fabric,
           zero impure pixels, with 86px of clearance on both sides, and the
           hanger stays out of the mask: 3 of 3,106 probe pixels across it
           classify, which is 0.097%. */
        warpZone: [
            { x: 356, y: 444 },
            { x: 782, y: 444 },
            { x: 782, y: 1013 },
            { x: 356, y: 1013 }
        ]
    },
    {
        id: "cap-model-white",
        title: "White Baseball Cap on Model",
        thumb: "assets/thumbnails/product-mockups/apparel/hats/baseball-caps/cap-model-white/cap-model-white-thumb.jpg",
        base: "assets/mockups/apparel/hats/baseball-caps/cap-model-white/cap-model-white-base.png",
        overlay: null,
        displace: "assets/mockups/apparel/hats/baseball-caps/cap-model-white/cap-model-white-displace.png",
        shade: "assets/mockups/apparel/hats/baseball-caps/cap-model-white/cap-model-white-shade.png",
        light: "assets/mockups/apparel/hats/baseball-caps/cap-model-white/cap-model-white-light.png",
        /* 0.3, not 1. The light map is "everything above the fabric's
           median" on a WHITE garment, which is mostly bright DIFFUSE, not
           surface reflection -- the same confusion that washed dark dyes out
           in recolour before the tone map split them apart. Screened at full
           strength onto dark ink it destroys it: a #12305C navy fill measured
           p95 luma 159 against a source of 44, and a quarter of the print
           lost its blue identity outright. At 0.3 the highlight still models
           the surface and the ink stays the colour it was. */
        lightGain: 0.3,
        garment: "assets/mockups/apparel/hats/baseball-caps/cap-model-white/cap-model-white-garment.png",
        tone: "assets/mockups/apparel/hats/baseball-caps/cap-model-white/cap-model-white-tone.png",
        grain: "assets/mockups/apparel/hats/baseball-caps/cap-model-white/cap-model-white-grain.png",
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
    },
    {
        id: "bag-paper-white",
        title: "White Paper Shopping Bag",
        thumb: "assets/thumbnails/product-mockups/packaging/bags/bag-paper-white/bag-paper-white-thumb.jpg",
        base: "assets/mockups/packaging/bags/bag-paper-white/bag-paper-white-base.png",
        overlay: null,
        displace: "assets/mockups/packaging/bags/bag-paper-white/bag-paper-white-displace.png",
        shade: "assets/mockups/packaging/bags/bag-paper-white/bag-paper-white-shade.png",
        light: "assets/mockups/packaging/bags/bag-paper-white/bag-paper-white-light.png",
        lightGain: 0.3,
        garment: "assets/mockups/packaging/bags/bag-paper-white/bag-paper-white-garment.png",
        tone: "assets/mockups/packaging/bags/bag-paper-white/bag-paper-white-tone.png",
        /* No `grain`, and that is a property of the material rather than an
           omission. The map exists to screen undyed fibre back over a heather
           blend, and paper has no blend -- there are no heather colourways
           below for it to serve. The weave measured 2.55 luma levels, above
           the 2.0 floor, so a map COULD have been derived; it would have been
           1.5MB that `ensurePhotoAssets` loads and nothing ever samples,
           because renderGarmentTint reads it only when a colourway declares a
           heather fraction. The extras list filters on presence, so leaving
           the key out drops the request. */
        garmentColors: {
            original: { name: "As photographed", hex: "#E9E9EC", original: true },
            /* The colourway that makes a white base the right choice: the
               classifier gates on sat < 14, so a photographed kraft bag
               (measured around 70) could never have been derived at all.
               Dyeing white to kraft gets the same product from a base the
               pipeline can actually read. */
            kraft: { name: "Kraft Brown", hex: "#C29A6B" },
            black: { name: "Black", hex: "#1A1A1A" },
            navy: { name: "Navy", hex: "#1F2A44" },
            red: { name: "Red", hex: "#B5352E" },
            forest: { name: "Forest Green", hex: "#2E4B3C" }
        },
        /* 8, against the shirt's 16 at 1024px and the cap's 20 at 1939px --
           0.39% of base width where those are 1.56% and 1.03%. Paper is the
           stiffest of the three surfaces, so it belongs at the bottom of that
           ordering, but the number was picked off the test grid rather than
           derived: at 12 the ruled lines start reading as cloth and at 18
           they wander outright. The displacement map is normalised to its own
           p99 (9.94 here, against the shirt's 41.5), so a nearly flat surface
           has its gentle creases stretched across the full encoded range --
           which is exactly why the strength has to come down to compensate,
           not up to match the larger base. */
        displaceStrength: 8,
        mode: "surface",
        backing: null,
        /* Cut out on transparency like the shirt and the cap: all four
           corners read alpha 0 and 38.0% of the image is clear, so a
           Background fill lands behind the product, not behind the artwork. */
        background: true,
        /* The front panel is one plane, bounded by the two folds that show up
           as the only strong horizontal steps in the row-mean scan: the rim
           at y=868 and the base gusset at y=2600. No vertical crease exists
           between them -- the column means fall smoothly 230 to 220 across
           the full width, which is the left-hand key light, not a gusset --
           so the whole panel width is usable and the four corners sit on one
           surface. 1150 square, centred on the panel (x 192..1858), verified
           100.00% surface: no alpha, no dark pixels, no saturated pixels. */
        warpZone: [
            { x: 450, y: 1150 },
            { x: 1600, y: 1150 },
            { x: 1600, y: 2300 },
            { x: 450, y: 2300 }
        ]
    },
    {
        /* The same product held rather than shot on white, and the template
           that REPLACED the drawn vector `box` on September 3, 2026 -- the
           last of the three drawn products to go.

           It is not a duplicate of `bag-paper-white` above. That one is a
           studio cut-out on transparency, square-on, no model, and it is what
           a seller uses for a catalogue tile. This is a lifestyle shot with a
           scene behind it, which is what a listing's second image wants. They
           differ in every property the renderer cares about: one has
           `background: true` and this one cannot.

           The terracotta wall is the reason the whole thing works, and it was
           specified before the photograph existed rather than discovered
           after. A NEUTRAL GREY backdrop -- the obvious studio choice, and
           what the reference image used -- would have been unrecoverable:
           saturation near 0 and luma around 190 passes both gates, the bag
           touches the backdrop along its whole silhouette so the
           connected-region restriction cannot separate them, and there is no
           third property to appeal to. Terracotta measures saturation 116 to
           123 against the bag's 4 to 10, which is not a margin so much as a
           different universe. The black trousers fail the luma gate at p99 74
           and the hand fails saturation at 76. */
        id: "bag-paper-held",
        title: "Paper Shopping Bag in Hand",
        thumb: "assets/thumbnails/product-mockups/packaging/bags/bag-paper-held/bag-paper-held-thumb.jpg",
        /* 1122x1402, which is 0.8003 -- 4:5 to within 0.03% -- so the catalog
           card is a straight downscale with no crop. */
        base: "assets/mockups/packaging/bags/bag-paper-held/bag-paper-held-base.png",
        overlay: null,
        displace: "assets/mockups/packaging/bags/bag-paper-held/bag-paper-held-displace.png",
        shade: "assets/mockups/packaging/bags/bag-paper-held/bag-paper-held-shade.png",
        /* Kept, and the decision went the other way once before landing here.
           The specular headroom is 5.5 luma levels (median 236.6 against a
           241.1 ceiling), the lowest of any template that ships this map, and
           close enough to the framed poster's 3.4 -- where it was omitted as
           mostly sensor noise -- to be worth testing rather than assuming. It
           is noisier than its peers: 0.23 of the local variation inside the
           zone survives a 5x5 blur, against 0.08 to 0.11 for the studio bag
           and the two hanger templates. But the render settles it. Dropping
           the map changes a #12305C navy fill by a mean of 11.8 levels and up
           to 71, because screen acts hardest on dark ink; on a near-white fill
           it changes 0.65. Roughly three quarters of that is structure. A map
           worth eleven levels on dark artwork earns its place even carrying
           some noise. */
        light: "assets/mockups/packaging/bags/bag-paper-held/bag-paper-held-light.png",
        /* 0.3, measured here: a #12305C navy fill loses 10.38% of its blue
           identity at gain 1.0 and 0.00% at 0.3. */
        lightGain: 0.3,
        garment: "assets/mockups/packaging/bags/bag-paper-held/bag-paper-held-garment.png",
        tone: "assets/mockups/packaging/bags/bag-paper-held/bag-paper-held-tone.png",
        /* Paper grain rather than a weave, sd 3.22. The studio bag above ships
           no grain map at all; this photograph's raking light records enough
           surface for one to be worth having. */
        grain: "assets/mockups/packaging/bags/bag-paper-held/bag-paper-held-grain.png",
        garmentColors: {
            original: { name: "As photographed", hex: "#E9E9EC", original: true },
            kraft: { name: "Kraft Brown", hex: "#C29A6B" },
            black: { name: "Black", hex: "#1A1A1A" },
            navy: { name: "Navy", hex: "#1F2A44" },
            red: { name: "Red", hex: "#B5352E" },
            forest: { name: "Forest Green", hex: "#2E4B3C" }
        },
        /* 16, and it lands on the studio bag's own number by the zone measure
           rather than by copying it: global p99 24.31, zone p99 1.00, so 16
           delivers 0.66px of peak offset -- 0.058% of base width, against that
           template's 0.060%. Same product, same stiff paper, same bend.

           This is the flattest print surface in the catalog by some way, zone
           p50 0.33 where the next flattest is 0.52, and the lowest
           zone/global ratio at 0.041: the bag's creased edges and its gusset
           carry essentially all of the gradient while the front panel is
           glass-flat. That is what a smooth paper face lit evenly looks like
           to this pipeline, and it is why the offsets here are sub-pixel. */
        displaceStrength: 16,
        mode: "surface",
        backing: null,
        /* NO `background` key: the scene is opaque, all four corners alpha 255
           and not one pixel of the image clear, so there is nothing behind the
           photograph for a colour to reach. The wall IS the backdrop. */
        /* 486x486 on the bag's front panel, centred at x=571 and vertically
           between the top edge and the base fold. The panel's own bounds were
           taken at luma > 215, which separates the face from the gusset
           cleanly -- the gusset sits in shadow at 180 to 199 while the face
           runs 230 to 242 -- giving a face of x 263..874 and y 484..1243, the
           top bound being where the rope handles stop notching into it.

           The zone is 80% of the panel's width, matching the studio bag's
           proportion, and clears 62px left, 64px right, 128px top and 138px
           bottom. Verified 100.0000% on the panel, zero impure pixels.

           The panel leans: its right edge runs 874 at the top and 894 at the
           bottom, so a rectangle inscribed in it has to take the narrower top.
           At this size that costs nothing -- the margins above are what is
           left over -- which is why no occlusion overlay is needed here and
           was on the framed poster. */
        warpZone: [
            { x: 328, y: 620 },
            { x: 813, y: 620 },
            { x: 813, y: 1105 },
            { x: 328, y: 1105 }
        ]
    },
    {
        /* The first template in the catalog whose print surfaces are NOT
           axis-aligned rectangles, and the reason the renderer changed on
           September 3, 2026.

           Until that day a non-rectangular zone cost direct manipulation
           outright: js/mockup.js warped an offscreen sheet onto the quad on
           the GPU, a one-way pass, and then nulled every hit rect because
           there was no way to carry a pointer back. The framed poster lost
           move, scale and rotate to exactly that and had to be reverted to a
           rectangle. Nothing about it was fundamental -- the forward map is a
           homography fixed by four corner correspondences, so the inverse is
           eight unknowns from eight equations -- and js/mockup.js now solves
           it, maps the pointer into sheet space and hit-tests there. Flat
           zones never touch that path.

           What a warped zone still does NOT get is the shading pass:
           drawWarpedDesign returns before it, so displace, shade and light are
           never sampled. They are therefore NOT DECLARED HERE, because they
           would ship as dead weight -- and `grain` goes with them, since it is
           only read when a colourway declares `heather` and a card palette has
           none. Three maps instead of seven, 2.0MB instead of about 5MB.

           That omission is affordable on THIS photograph and would not be on
           every one. The card faces measure a spread of just 10 luma levels
           p1 to p99, against 32 and 16 on the two zones of card-white-walnut,
           because a rigid card lit evenly has almost nothing to model. A
           warped template on a surface with real shading would want the sheet
           routed through the displacement pass first -- the maps are
           registered to the base, so the shader would work unchanged once the
           warp happens into the fabric sheet rather than straight to canvas. */
        id: "card-white-duotone",
        title: "Business Cards on Duotone",
        thumb: "assets/thumbnails/product-mockups/print/business-cards/card-white-duotone/card-white-duotone-thumb.jpg",
        /* 1122x1402, which is 0.8003 -- 4:5 to within 0.03%, so the catalog
           card is a straight downscale. */
        base: "assets/mockups/print/business-cards/card-white-duotone/card-white-duotone-base.png",
        overlay: null,
        garment: "assets/mockups/print/business-cards/card-white-duotone/card-white-duotone-garment.png",
        tone: "assets/mockups/print/business-cards/card-white-duotone/card-white-duotone-tone.png",
        /* The recolour mask is BOTH stacks. Everywhere else this pipeline
           keeps only the region connected to the print zone, which would have
           kept one card and left the other white. The two largest regions are
           kept instead -- 188,561px and 169,777px, where the third largest is
           93px of speckle, so there is no judgement in the cut. */
        garmentColors: {
            original: { name: "As photographed", hex: "#E9E9EC", original: true },
            ivory: { name: "Ivory", hex: "#EDE6D6" },
            kraft: { name: "Kraft Brown", hex: "#C29A6B" },
            navy: { name: "Navy", hex: "#1F2A44" },
            black: { name: "Black", hex: "#1A1A1A" }
        },
        mode: "surface",
        backing: null,
        /* NO `background`: the scene is opaque, every corner alpha 255 and not
           one pixel clear. The dual tone IS the backdrop, and it is what makes
           the photograph readable at all -- a neutral half would have been
           masked instead of the cards. Terracotta measures saturation 128-139
           and the sage 16-21 at luma 48-91, so one fails saturation and the
           other fails luma, against cards at saturation 0-12 and luma
           118-241. */
        designScale: "cover",
        zoneLabels: ["Front", "Back"],
        /* Two quads, found by fitting a line to each of the four edges from
           the face's boundary pixels and intersecting adjacent pairs, rather
           than by taking extreme points -- an extreme is a single antialiased
           pixel and is not the corner of a quad in perspective. The faces were
           separated from the stacks' cut edges at luma > 200: the edges sit
           around 140 and the faces at 236.

           Both come out 1.78:1 against a business card's 1.75, and the 1.8%
           is the foreshortening, which is the check that the corners are the
           real ones. */
        warpZones: [
            [
                { x: 530, y: 247 },
                { x: 1042, y: 362 },
                { x: 977, y: 650 },
                { x: 453, y: 524 }
            ],
            [
                { x: 96, y: 815 },
                { x: 639, y: 675 },
                { x: 739, y: 973 },
                { x: 187, y: 1121 }
            ]
        ],
        /* warpZones[0], not an independent value: every path that predates
           multi-zone reads this one and the validator requires it. */
        warpZone: [
            { x: 530, y: 247 },
            { x: 1042, y: 362 },
            { x: 977, y: 650 },
            { x: 453, y: 524 }
        ]
    },
    {
        id: "card-white-walnut",
        title: "Business Cards on Walnut",
        thumb: "assets/thumbnails/product-mockups/print/business-cards/card-white-walnut/card-white-walnut-thumb.jpg",
        base: "assets/mockups/print/business-cards/card-white-walnut/card-white-walnut-base.png",
        overlay: null,
        displace: "assets/mockups/print/business-cards/card-white-walnut/card-white-walnut-displace.png",
        shade: "assets/mockups/print/business-cards/card-white-walnut/card-white-walnut-shade.png",
        light: "assets/mockups/print/business-cards/card-white-walnut/card-white-walnut-light.png",
        lightGain: 0.3,
        garment: "assets/mockups/print/business-cards/card-white-walnut/card-white-walnut-garment.png",
        tone: "assets/mockups/print/business-cards/card-white-walnut/card-white-walnut-tone.png",
        /* No `grain`, for the same reason the paper bag has none: the map
           exists to screen undyed fibre back over a heather blend, and card
           stock has no blend. */
        garmentColors: {
            original: { name: "As photographed", hex: "#E9E9EC", original: true },
            ivory: { name: "Ivory", hex: "#EDE6D6" },
            kraft: { name: "Kraft Brown", hex: "#C29A6B" },
            navy: { name: "Navy", hex: "#1F2A44" },
            black: { name: "Black", hex: "#1A1A1A" }
        },
        /* 4, the lowest in the catalog: 0.17% of base width where the bag is
           0.39%, the cap 1.03% and the shirt 1.56%. A printed card lying flat
           on a desk is the stiffest surface here and belongs at the bottom of
           that ordering. Its gradient p99 measured 4.54 against the bag's
           10.32, so the map is normalising something very close to paper
           noise -- on the test grid 7 already reads as a buckled card and 12
           ripples outright, while 2 is indistinguishable from a flat paste. */
        displaceStrength: 4,
        mode: "surface",
        /* Business cards print full bleed, so the first upload fills the card
           it is dropped on rather than opening at the shared 0.75. With two
           surfaces this covers whichever one is being edited, because
           firstLayerScale measures against the ACTIVE zone. */
        designScale: "cover",
        /* Opaque scene, so NO `background` flag. The walnut is the product,
           not a backdrop to be filled: a colour fill would have nothing to
           land on and the Background panel correctly never appears. This is
           the first template whose base needs no alpha channel at all, which
           is also why it is written as RGB rather than RGBA. */
        /* The cards' true edges, not the classifier's: walking outward from
           each card's centre finds x 525..1871 with A at y 575..1400 and B at
           y 1563..2390. The mask-derived zones sat 3-4px inside that, which
           showed as a white rim once the design filled. Each zone sits exactly
           ON its card and never past it -- the surround is walnut, so artwork
           a pixel wide of the card would print onto the desk.

           A is 826 tall and B is 828. That 2px is antialiasing at the card
           edges rather than a real difference, and 0.24% of the height is far
           below anything visible; matching them would have meant either
           overshooting one card or leaving a rim on the other. */
        warpZones: [
            [
                { x: 525, y: 575 },
                { x: 1872, y: 575 },
                { x: 1872, y: 1401 },
                { x: 525, y: 1401 }
            ],
            [
                { x: 525, y: 1563 },
                { x: 1872, y: 1563 },
                { x: 1872, y: 2391 },
                { x: 525, y: 2391 }
            ]
        ],
        zoneLabels: ["Front", "Back"],
        /* The first zone again. Every path that predates multi-zone reads
           this one, and the validator requires it, so the two must not drift:
           it is warpZones[0], not an independent value.

           Both are 1340x820 and identical to the pixel, so a design renders
           at the same scale whichever card it is on. Measured from the
           photograph's modal card edges (x 526..1871 on both, y 575..1400 and
           y 1564..2390) inset by 3 and trimmed to a common height; verified
           100.0000% surface with zero impure pixels on both. The 163px of
           bare wood between them is what keeps the two cards separable -- and
           is also why the mask has to be flooded from BOTH zone centres. */
        warpZone: [
            { x: 525, y: 575 },
            { x: 1872, y: 575 },
            { x: 1872, y: 1401 },
            { x: 525, y: 1401 }
        ]
    },
    {
        id: "banner-rollup-white",
        title: "Roll-Up Banner Stand",
        thumb: "assets/thumbnails/product-mockups/print/signage/banner-rollup-white/banner-rollup-white-thumb.jpg",
        base: "assets/mockups/print/signage/banner-rollup-white/banner-rollup-white-base.png",
        overlay: null,
        displace: "assets/mockups/print/signage/banner-rollup-white/banner-rollup-white-displace.png",
        shade: "assets/mockups/print/signage/banner-rollup-white/banner-rollup-white-shade.png",
        light: "assets/mockups/print/signage/banner-rollup-white/banner-rollup-white-light.png",
        /* 0.3, as everywhere else, but here it was checked rather than copied.
           This face has the narrowest headroom in the catalog (median 237
           against a 248.9 ceiling, so 11.9 luma levels normalised across the
           full range), which pushed a navy fill's p95 to 81.6 against the
           business card's 59.3. That looked like the washout that forced 0.3
           in the first place, so blue identity was measured directly: 0.00% of
           pixels lose it at 0.15, 0.2, 0.25, 0.3 or even 0.4. The lift is
           uniform brightening, not a hue wash -- which is what a highlight on
           vinyl should be -- so the shared value stands. */
        lightGain: 0.3,
        /* FOUR maps, not seven, and the first template to ship fewer. Blank
           banner vinyl has no colour variant worth offering and a design
           covers the entire face, so there are no colourways for a `garment`
           mask or a `tone` map to serve, and `grain` has no fibre blend to
           model. Declaring no garmentColors is what turns the colour field
           off. The whole template is 1.5MB against the paper bag's 11.3MB. */
        displaceStrength: 10,
        mode: "surface",
        backing: null,
        /* Cut out on transparency -- all four corners read alpha 0 and 48.2%
           of the image is clear -- so a Background fill lands behind the
           stand. The generated file looked white-backed in a preview, which
           is only the viewer compositing onto white; the alpha channel is
           real. */
        background: true,
        /* The face measured x 205..819, y 128..1346, inset 6: still
           100.0000% pure with zero impure pixels, and clear of the edge
           feather. Zero blown pixels anywhere inside it, the only base in the
           catalog with none.

           The dark hardware is what makes this work. A brushed aluminium
           cassette measures roughly 5 saturation and 150-200 luma and would
           sail through both classifier gates while being physically joined to
           the face, dragging the median and the specular ceiling that `shade`
           and `light` normalise against. Anthracite fails the luma gate: the
           rail, cassette and feet measured p50 56-68, and the face holds
           99.83% of every classified pixel in the image. */
        /* A banner's artwork IS the banner: it prints edge to edge, so the
           first upload fills rather than opening at the shared 0.75. */
        designScale: "cover",
        /* The vinyl's true edge, not the classifier's. Walking outward from
           the face centre until alpha or luma drops finds x 205..819,
           y 128..1346; the mask-derived zone stopped 6px short on every side,
           which showed as a rim of bare white vinyl once the design filled.
           This sits exactly ON the edge and never past it: the surround here
           is transparent, so a zone even a pixel wide of the vinyl would
           paint artwork into empty space beside the banner. */
        /* The bottom edge was 1347 until September 2, 2026 and is 1345 now.
           Two rows does not sound like a defect, but this template fills its
           zone (`designScale: "cover"`), and rows 1346 and 1347 are entirely
           OFF the vinyl -- the face reads 616/616 pixels white at y=1345 and
           0/616 at y=1346, where luma drops from 229 to 135 as the banner's
           base begins. So a design was rendering a 616x2 strip of itself
           below the banner, against the transparent surround, which the
           Background panel then paints a colour behind. The 1-2px of zone
           that hangs over the vinyl's antialiased SIDE edges stays: that is
           the zone sitting flush with the face, which is what a
           bleed-to-edge banner wants, and pulling it in would trade an
           invisible overhang for a visible white gutter. */
        warpZone: [
            { x: 205, y: 128 },
            { x: 820, y: 128 },
            { x: 820, y: 1345 },
            { x: 205, y: 1345 }
        ]
    },
    {
        id: "hoodie-model-white",
        title: "White Hoodie on Model",
        thumb: "assets/thumbnails/product-mockups/apparel/hoodies/hoodie-model-white/hoodie-model-white-thumb.jpg",
        base: "assets/mockups/apparel/hoodies/hoodie-model-white/hoodie-model-white-base.png",
        overlay: null,
        displace: "assets/mockups/apparel/hoodies/hoodie-model-white/hoodie-model-white-displace.png",
        shade: "assets/mockups/apparel/hoodies/hoodie-model-white/hoodie-model-white-shade.png",
        light: "assets/mockups/apparel/hoodies/hoodie-model-white/hoodie-model-white-light.png",
        /* 0.3, and on this garment the check bites rather than merely passing:
           at gain 1.0 a #12305C navy fill loses 6.47% of its blue identity and
           p95 luma reaches 180 against a source of 44 -- the same failure that
           set this value on the shirt. At 0.3 the loss is 0.00%. */
        lightGain: 0.3,
        garment: "assets/mockups/apparel/hoodies/hoodie-model-white/hoodie-model-white-garment.png",
        tone: "assets/mockups/apparel/hoodies/hoodie-model-white/hoodie-model-white-tone.png",
        /* Fleece has the second-highest weave in the catalog, 4.11 luma levels
           against the shirt's 3.78, so heather reads well here. This is also
           the first template built AFTER the colourway chips landed: the
           heather fractions below and this map are reachable from the editor
           from day one, which was not true of the shirt or the cap. */
        grain: "assets/mockups/apparel/hoodies/hoodie-model-white/hoodie-model-white-grain.png",
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
        /* 10, against the shirt's 16 on an identically sized base. Gradient
           p99 measured 28.51 here to the shirt's 41.5, so matching the shirt's
           PHYSICAL bend would be about 11 -- and heavy fleece should bend a
           print less than jersey, not more, so at or below that. The grid
           agrees: 14 has more character than the fabric earns and 20 wanders.
           0.98% of base width, sitting just under the cap's 1.03% and well
           under the shirt's 1.56%. */
        displaceStrength: 10,
        mode: "surface",
        backing: null,
        /* Cut out on transparency: all four corners read alpha 0 and 16.0% of
           the image is clear. */
        background: true,
        /* 432px square -- 12in at this garment's scale (neckline y=280 to hem
           y=1338 is 1058px over roughly 29in, about 36.5 px/in), starting 3in
           below the neckline. A hoodie's print is shorter than a shirt's
           because the kangaroo pocket takes the lower half: the pocket's top
           seam is the strongest horizontal step in the whole photograph
           (+16.24 in the central columns at y=895), and this zone stops 64px
           above it. Centred on the torso's own centreline, 520.5, measured
           from the sleeve seams at x=223 and x=818 rather than from the frame.
           Verified 100.0000% surface with zero impure pixels.

           The two hazards a hoodie has and a shirt does not were kept out of
           the photograph rather than worked around: drawstrings would hang
           straight through this zone and be painted over, and the model's
           trousers are dark charcoal so they fail the luma gate outright
           (measured p50 39, 0.0% classified). White joggers would have been
           the cap's white-tee problem again, and worse -- touching the hem,
           they would be CONNECTED to the garment, so the connected-region
           restriction could not have saved it. */
        warpZone: [
            { x: 305, y: 390 },
            { x: 737, y: 390 },
            { x: 737, y: 822 },
            { x: 305, y: 822 }
        ]
    },
    {
        /* The hood is the whole problem with a back-view hoodie, and it was
           solved in the photograph rather than in code: worn down, flat and
           unbunched, it stops at y=590 and its cast shadow bottoms out in a
           row-mean trough at y=560 (203.8 against 234.5 for clear back). A
           raised or piled hood would have taken the print area with it, and
           there is no occlusion-mask support to paint around one. */
        id: "hoodie-model-white-back",
        title: "White Hoodie on Model, Back",
        thumb: "assets/thumbnails/product-mockups/apparel/hoodies/hoodie-model-white-back/hoodie-model-white-back-thumb.jpg",
        base: "assets/mockups/apparel/hoodies/hoodie-model-white-back/hoodie-model-white-back-base.png",
        overlay: null,
        displace: "assets/mockups/apparel/hoodies/hoodie-model-white-back/hoodie-model-white-back-displace.png",
        shade: "assets/mockups/apparel/hoodies/hoodie-model-white-back/hoodie-model-white-back-shade.png",
        light: "assets/mockups/apparel/hoodies/hoodie-model-white-back/hoodie-model-white-back-light.png",
        /* 0.3, measured on this base: a #12305C navy fill across the zone
           reaches p95 luma 174.8 at gain 1.0 against a source of 44, and
           11.99% of the print stops reading as blue. At 0.3, 0.00%. */
        lightGain: 0.3,
        garment: "assets/mockups/apparel/hoodies/hoodie-model-white-back/hoodie-model-white-back-garment.png",
        tone: "assets/mockups/apparel/hoodies/hoodie-model-white-back/hoodie-model-white-back-tone.png",
        /* Weave 2.98 luma levels: above the back shirt's 2.18, below the
           front hoodie's 4.11. Fleece nap still reads, but this back is lit
           flatter than the front, so heather models the fibre less strongly
           than it does on its pair. */
        grain: "assets/mockups/apparel/hoodies/hoodie-model-white-back/hoodie-model-white-back-grain.png",
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
        /* 9, and it is the first value here set by measuring the ZONE rather
           than the whole garment. The global gradient p99 is 22.32 against the
           front hoodie's 28.51, which by the ratio used until now would give
           10 x 22.32/28.51 = 8. But the global figure counts the hood roll and
           the sleeve seams, none of which the print ever touches, so it can
           under-bend a print whose garment happens to be lumpy elsewhere --
           exactly this garment. What the eye sees is the offset delivered
           INSIDE the zone, which is strength x zone_p99 / global_p99:

             template        zone p50   zone p99   peak offset in zone
             hoodie front      0.58       5.71        2.00px  @ 10
             hoodie back       0.60       4.82        1.94px  @  9

           The two zones are equally flat surfaces, so the pair should bend a
           print equally, and 9 matches the front's delivered offset to 3%.
           The old method's 8 is one unit away, so nothing shipped before this
           is called into question -- but the zone figure is the one that
           actually describes the print. */
        displaceStrength: 9,
        mode: "surface",
        backing: null,
        /* Cut out on transparency: all four corners read alpha 0 and 32.9% of
           the image is clear. The source arrived with a dark vignette and a
           white halo still stored as RGB in 449,932 fully transparent pixels
           -- invisible in a browser, and zeroed when the base was written. */
        background: true,
        /* 382x509: a real 12x16in back print, taller than the front hoodie's
           12x12 because the back has no kangaroo pocket eating its lower half.
           It sits 2in below the hood's lower edge and stops 124px (3.9in)
           above the body/waistband seam, which is the sharpest horizontal
           feature in the photograph -- vertical roughness spikes to 27.83 at
           y=1292 against a body reading 1.3 to 2.9.

           31.8 px/in, and this is the one number in the entry that is an
           estimate rather than a measurement. The front hoodie's 36.5 px/in
           cannot be reused: the back model is photographed smaller, with the
           torso running 0.870 of the front's width at five matched offsets
           above the waistband seam (spread 0.865 to 0.876). The waistband rib
           agrees to 4% at 0.835, which is the corroboration; a head-width
           comparison against the back shirt says 35.3 and is the outlier,
           but it crosses two unrelated photographs and two different people,
           so the hoodie-to-hoodie figure is the one used. An 11% band on the
           scale means the print could defensibly be up to 424x565.

           Centred on x=512, which three independent spans agree on to within
           2.4px: the hood rows read 510.7, the mid back 513.1 and the waist
           512.8. Verified 100.0000% fabric, zero impure pixels, with 65px of
           clearance left and 73px right at the narrowest row, and the same
           purity before and after closing 1-D specks -- unlike the back
           shirt, this mask has no stray pixel misreporting the margin. The
           default sat<14 / luma>110 gates are unchanged: hair fails luma, the
           hands fail saturation (0 of 589 probe pixels classify) and the jeans
           fail luma, so the mask stops at y=1369 with nothing below it. */
        warpZone: [
            { x: 321, y: 654 },
            { x: 702, y: 654 },
            { x: 702, y: 1162 },
            { x: 321, y: 1162 }
        ]
    },
    {
        /* The plain product shot, and the template that REPLACED the drawn
           vector `hoodie` on September 3, 2026 -- the day after the drawn tee
           went the same way. No model: the garment on a hanger against a wall.

           It is the first template here whose scene is a PHOTOGRAPHED
           BACKGROUND rather than a cut-out, and that is the whole reason it
           works. The wall is warm plaster and the fleece is white, so luma
           cannot separate them (wall p50 201 against garment 229, with the
           garment's own shadows reaching down to 161). SATURATION can, and
           cleanly: the wall runs p1 14 / p50 20 / p99 30, the garment p1 1 /
           p50 3 / p99 13. The factory gate of 14 falls exactly in that gap and
           needs no tuning -- but it has no margin either, and the sweep says
           so: at 15 the wall leaks 5,506 pixels instead of 1,116, and at 16 it
           leaks 20,464. Raising the LUMA gate does not help, because it takes
           the garment's shadows before it takes the wall. */
        id: "hoodie-hanger-white",
        title: "White Hoodie on a Hanger",
        thumb: "assets/thumbnails/product-mockups/apparel/hoodies/hoodie-hanger-white/hoodie-hanger-white-thumb.jpg",
        /* 1122x1402, which is 0.8003 -- 4:5 to within 0.03%, so the catalog
           card is a straight downscale with no crop. */
        base: "assets/mockups/apparel/hoodies/hoodie-hanger-white/hoodie-hanger-white-base.png",
        overlay: null,
        displace: "assets/mockups/apparel/hoodies/hoodie-hanger-white/hoodie-hanger-white-displace.png",
        shade: "assets/mockups/apparel/hoodies/hoodie-hanger-white/hoodie-hanger-white-shade.png",
        light: "assets/mockups/apparel/hoodies/hoodie-hanger-white/hoodie-hanger-white-light.png",
        /* 0.3. This base is the least sensitive to the value of any garment
           here -- a #12305C navy fill loses only 1.43% of its blue identity
           even at gain 1.0, against 11.99% on the back hoodie -- but 0.3 costs
           nothing (0.00% lost, p95 70.4 against a source of 44) and keeps the
           whole apparel set on one number. */
        lightGain: 0.3,
        garment: "assets/mockups/apparel/hoodies/hoodie-hanger-white/hoodie-hanger-white-garment.png",
        tone: "assets/mockups/apparel/hoodies/hoodie-hanger-white/hoodie-hanger-white-tone.png",
        /* Weave 4.28 -- the highest in the catalog, past the front hoodie's
           4.11. Directional daylight across brushed fleece records more nap
           than a flat studio key does, which is the same lighting that cost
           this base its 0.252% of blown pixels. The heather colourways read
           better here than anywhere else. */
        grain: "assets/mockups/apparel/hoodies/hoodie-hanger-white/hoodie-hanger-white-grain.png",
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
        /* 12, and it sits deliberately BETWEEN the catalog's two clusters
           rather than joining either. Measured by the zone method: global p99
           24.92, zone p99 7.38, so 12 delivers 3.55px of peak offset inside
           the print, 0.317% of base width. The two model hoodies deliver
           0.19% and the two hanger/back shirts 0.50%.

           Both arguments apply here and neither wins outright. It is fleece,
           which is heavier and stiffer than jersey and should bend a print
           less -- that is what puts the model hoodies at 0.19%. But its print
           surface is measurably more structured than either of theirs: zone
           p50 0.99 against 0.58 and 0.60, because a garment hanging free
           drapes more than one stretched over a body. Splitting them is the
           honest answer, and the grid agrees: at 8 the bars are too clean for
           fabric this textured, and at 18 the ring flattens at its lower
           left. */
        displaceStrength: 12,
        mode: "surface",
        backing: null,
        /* NO `background` key, and that is the point of the wall. The scene is
           opaque -- all four corners are alpha 255 and not one pixel of the
           image is clear -- so there is nothing behind the photograph for a
           colour to show through. Eligibility is declared rather than
           detected precisely so this stays off. The backdrop is the
           photograph's own, which is the trade a scene buys: one good wall
           instead of any colour the visitor likes. */
        /* 335x335 -- a 10x10in chest print at 33.5 px/in, centred on x=566 and
           sitting between the two features that bound it: the hood's V ends at
           y=440 and the kangaroo pocket's top seam is at y=868, both found as
           vertical-roughness spikes (16.64 and 11.78 against a body reading
           1.5 to 3.0). The zone leaves 60px above and 48px below, verified
           100.0000% fabric with zero impure pixels and 94px of side clearance.

           10in, not the model hoodie's 12in, and that is the garment rather
           than the scale: this hood is oversized and hangs low, and its pocket
           sits high, leaving 428px of clear chest where a 12in print would
           need more. 33.5 px/in is an estimate with an 11% band -- the
           waistband rib says 35.3 (88px here against the model hoodie's 91)
           and pocket-seam-to-hem says 31.3 (380px against 443). Neckline
           comparisons were discarded rather than averaged in: an oversized
           hood's V is not the same landmark as a worn hoodie's collar, and
           they disagree by 39%. */
        warpZone: [
            { x: 399, y: 486 },
            { x: 733, y: 486 },
            { x: 733, y: 820 },
            { x: 399, y: 820 }
        ]
    },
    {
        id: "frame-black-interior",
        title: "Framed Poster in Interior",
        thumb: "assets/thumbnails/product-mockups/print/posters-and-frames/frame-black-interior/frame-black-interior-thumb.jpg",
        base: "assets/mockups/print/posters-and-frames/frame-black-interior/frame-black-interior-base.png",
        /* Added September 2, 2026, and it is an OCCLUSION mask rather than the
           shadow-and-glare sheet this key usually carries: the base with the
           frame's aperture punched out, so the frame itself is redrawn over
           the artwork.

           It exists because the print zone deliberately overhangs the window.
           The frame is photographed in slight perspective, so its aperture is a
           trapezoid -- 279..843 at the top, 273..849 at the bottom -- while the
           zone must stay an axis-aligned RECTANGLE, because a non-rectangular
           quad routes to the perspective warp, which returns before the shading
           pass and nulls every hit rect. That is how this template lost scale
           and rotate once already. A rectangle inscribed in a trapezoid has to
           choose: fall short at the wide end and show a white gutter, or
           overhang at the narrow end and bleed onto the frame. The zone was
           widened to 271..850 to kill the gutter, which left 6,341 pixels of
           artwork sitting on the black border, worst at the top (8px left, 7px
           right, tapering to 2px and 1px at the bottom).

           This overlay masks exactly those 6,341 pixels. Both faults are gone
           at once, and the zone stays a rectangle. `source-over`, because it is
           a pre-masked photograph and not a luminance map -- multiply would
           darken the whole scene by itself. */
        overlay: "assets/mockups/print/posters-and-frames/frame-black-interior/frame-black-interior-overlay.png",
        overlayBlend: "source-over",
        displace: "assets/mockups/print/posters-and-frames/frame-black-interior/frame-black-interior-displace.png",
        shade: "assets/mockups/print/posters-and-frames/frame-black-interior/frame-black-interior-shade.png",
        /* NO `light`, and this is the first template to omit it. The map exists
           to lift a print where a fold ridge catches the light; a matte poster
           lit evenly inside a frame has no such feature, and the numbers say so
           -- the specular headroom here is 3.4 luma levels (median 243.3
           against a 246.7 ceiling), which the map then normalises across the
           full 0-255 range. What it encodes is therefore mostly sensor noise.

           Screened onto a FLAT #808080 fill over the zone interior it measured
           sd 9.35 and a p1-p99 spread of 34 at the 0.3 every other template
           uses, against a baseline sd of 0.44 with no map at all: visible
           mottling on exactly the flat-colour artwork a poster tends to carry.
           Even 0.1 left a spread of 12. Shipping it at any gain would have been
           shipping noise, so it is not shipped. The shader guards on
           u_hasLight and skips the screen. `shade` is kept and earns its place
           -- it bottoms out at 153, the rebate shadow correctly darkening
           artwork near the frame. */
        displaceStrength: 2,
        mode: "surface",
        backing: null,
        /* Opaque scene, so NO `background` flag: the room IS the product and
           there is nothing behind it to fill. This is what it trades away
           against wood-a4, which is also the template it is least likely to be
           confused with -- that one is a leaning wood frame in "window" mode
           with a real transparent print opening and a multiply overlay. */
        /* Poster opening measured at x 272..849, y 270..1067 with modal edges
           278 and 844. The zone is NOT taken from that mask, and it is NOT a
           rectangle, for two separate reasons that both showed as white paper
           against the frame.

           First, the classifier gates on luma > 110 and the rebate shadow
           dips under it, so the mask stops short of the paper on every side.
           Walking raw luma OUTWARD from the opening's centre finds the true
           transition -- walking inward instead reads the gold stems on the
           right and the wall on the left, which is how the first measurement
           got 201 and 948.

           Second: the frame leans back, so the opening is really a TRAPEZOID.
           Top and bottom are perfectly horizontal at y=270 and y=1067 for
           every column, but the sides slant -- left runs 280 at the top to 272
           at the bottom, right 842 to 849, giving 563px of width at the top
           and 578px at the bottom.

           This zone is nonetheless the smallest RECTANGLE containing all of
           it, and that is a deliberate reversal. The exact trapezoid was tried
           and taken back out: a non-rectangular quad routes to the perspective
           warp, which returns before the shading pass AND leaves every layer
           without a hit rect. No hit rect means no selection chrome at all --
           no drag, no resize grip, and no rotate handle. Rotation exists
           ONLY as a canvas drag; there is no sidebar control for it, so the
           warp path does not degrade rotation, it removes it. Scale survives
           because the sidebar has a slider, which is what made the loss easy
           to understate.

           So the rectangle spans the widest extent, 271..850 by 269..1068.
           Where the opening is narrower -- at the top, by 8-9px a side,
           tapering to nothing at the bottom -- the artwork laps very slightly
           onto the black frame. That reads as a print sitting flush rather
           than as an error, and it is much less visible than bare white paper
           against black, which is what any inset rectangle produces along the
           bottom.

           Two lessons generalise. The classified mask is the right input for
           deriving MAPS and the wrong one for placing a ZONE wherever a
           surface meets something dark. And the warp path costs far more than
           its comment suggests: it is only worth taking where direct
           manipulation genuinely does not matter.

           The whole gradient lives at that rebate: inside the opening the
           displacement magnitude measures p50 1.4 and p99 3.2 out of 127,
           while the outer 60px band saturates at 127. The interior is flat
           paper and renders identically at every strength from 2 to 14, so 2
           is chosen for what it does at the EDGE -- a couple of pixels of
           softening where the paper meets the rebate. The map exists mainly
           because the shading pass is gated on it; without a displace map,
           `shade` never runs either.

           This is also the first template where the connected-region
           restriction is load-bearing by design rather than as a safety net.
           The whitewashed floor, the cream candles and the skirting all pass
           the classifier -- 2634 regions in total, and the restriction drops
           200,272 px of them, 30.56%. What keeps the poster separable is the
           WIDE black frame: the nearest other classified pixel is 272px away
           at mid-height, far beyond the 6px dilation. A thin frame here would
           have let the mask swallow the room. */
        /* A poster fills its frame, whatever shape the artwork is. Without
           this the first upload opened at the shared 0.75 and left a quarter
           of the opening as bare paper, which on this template reads as a
           mistake rather than a margin -- and a landscape photo dropped in
           here would have floated in the middle of a portrait frame. */
        designScale: "cover",
        warpZone: [
            { x: 271, y: 269 },
            { x: 850, y: 269 },
            { x: 850, y: 1068 },
            { x: 271, y: 1068 }
        ]
    },
    {
        id: "bucket-hat-white",
        title: "White Bucket Hat on Model",
        thumb: "assets/thumbnails/product-mockups/apparel/hats/bucket-hats/bucket-hat-white/bucket-hat-white-thumb.jpg",
        base: "assets/mockups/apparel/hats/bucket-hats/bucket-hat-white/bucket-hat-white-base.png",
        overlay: null,
        displace: "assets/mockups/apparel/hats/bucket-hats/bucket-hat-white/bucket-hat-white-displace.png",
        shade: "assets/mockups/apparel/hats/bucket-hats/bucket-hat-white/bucket-hat-white-shade.png",
        light: "assets/mockups/apparel/hats/bucket-hats/bucket-hat-white/bucket-hat-white-light.png",
        /* 0.3. At gain 1.0 a #12305C navy fill loses 3.49% of its blue
           identity and p95 luma reaches 163 against a source of 44; at 0.3 the
           loss is 0.00%. */
        lightGain: 0.3,
        garment: "assets/mockups/apparel/hats/bucket-hats/bucket-hat-white/bucket-hat-white-garment.png",
        tone: "assets/mockups/apparel/hats/bucket-hats/bucket-hat-white/bucket-hat-white-tone.png",
        /* Weave measured 5.33 luma levels, second only to the cap's 5.86 and
           well clear of the 2.0 floor, so the heather colourways below have
           real fibre to screen back. */
        grain: "assets/mockups/apparel/hats/bucket-hats/bucket-hat-white/bucket-hat-white-grain.png",
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
        /* 6, which is 0.53% of base width -- between the paper bag's 0.39% and
           the hoodie's 0.98%. Gradient p99 measured 14.23 against the hoodie's
           28.5 and the cap's 30.3: a crown stretched over a head is a smooth
           cylinder with very little folding, so it bends a print less than
           fleece drape but more than stiff paper. Matching the hoodie's
           physical bend works out at 10 x (14.23 / 28.5) x (1122 / 1024) = 5.5,
           and the grid agrees -- at 10 the ruled lines already read as a loose
           hat rather than a taut one. */
        displaceStrength: 6,
        mode: "surface",
        backing: null,
        /* Cut out on transparency: all four corners read alpha 0 and 34.0% of
           the image is clear. */
        background: true,
        /* THE THRESHOLDS ARE TUNED FOR THIS BASE, and both are raised from the
           factory defaults of sat < 14 and luma > 110. This is the first
           template that needed it, and the defaults were wrong here in BOTH
           directions at once.

           The hat carries a slight colour cast -- its own saturation runs 12
           to 16 -- so a gate of 14 bisected the crown, leaving it 87.9%
           classified with holes scattered through the print zone. Raising
           saturation alone to 20 fixed the crown but pulled 5,930 forehead
           pixels into the mask, and the connected-region restriction cannot
           drop those: the brim rests on the forehead, so they are genuinely
           connected, unlike the cap's separate white tee. The LUMA gate is
           what separates them, because the hat's p1 is 174 while the face's
           p50 is 131. Measured:

             gates      face in mask    brim kept   zone purity
             14 / 110   0.251% (750)    89.51%      87.92%
             20 / 165   0.119% (355)    99.54%      100.0000%

           Strictly better on every axis. Pushing luma to 175 trims the face
           further to 0.058% but costs brim coverage (98.90%), and the brim is
           the product. Re-deriving this template with the factory defaults
           will silently produce a speckled mask -- set both thresholds. */
        /* 470x260 on the crown front, centred on the crown's own centreline
           (x 565, constant to within 3px from y=120 to y=500), stopping 32px
           above the brim seam. That seam is the strongest horizontal step in
           the crown's central columns, +4.96 at y=491. Verified 100.0000%
           surface with zero impure pixels.

           This is deliberately LARGER than a conventional bucket hat print.
           It started at 320x190, about 11.7 x 6.9cm at this hat's scale, which
           is what a real embroidered front actually measures; it was doubled
           in area at the owner's request, and now covers roughly 17 x 9.5cm --
           a full front-panel graphic rather than a badge.

           What bounds it is not purity, which holds at 100.0000% out to
           550x280, but CURVATURE. The displacement map is the surface gradient,
           so its magnitude reports where the cylinder rolls out of view: it
           runs 3 to 11 across x 240..760, reaches 14.1 at x=800 and spikes to
           24.3 at x=840. The right edge sits at 799, just short of that spike,
           and the left mirrors it about the centreline. Pushing to 510 or 550
           wide stays pure but reaches into the turn, where artwork foreshortens
           hard against the near-flat middle.

           The seamless front panel the photograph was asked for is what makes a
           rectangle legitimate here at all: a four-panel crown would have put a
           vertical seam straight down the middle of this zone. */
        warpZone: [
            { x: 330, y: 200 },
            { x: 800, y: 200 },
            { x: 800, y: 460 },
            { x: 330, y: 460 }
        ]
    }
];
