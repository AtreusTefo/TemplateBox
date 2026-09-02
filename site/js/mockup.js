/* ==========================================================================
   TemplateBox - Product Mockup Generator Core Logic
   Responsibilities: strict client-side image mime-type validation, flat
   vector product illustrations composed on HTML5 Canvas (t-shirt, hoodie,
   mug, packaging box), photographic mockup templates composited with the
   three-layer "Sandwich Method" (scene photograph, warped/placed design,
   shadow-and-glare overlay), an ORDERED STACK of design layers each with its
   own position, size, rotation and visibility, direct manipulation of the
   selected layer on the canvas, a dependency-free HSV colour picker, real-time
   localStorage retention of non-image settings, an in-memory "My Mockups"
   tray, and PNG export through a local canvas.toDataURL() stream.
   Depends on: js/app.js (TB.sanitize, TB.desanitize, TB.storageGet/Set,
   TB.takePreset) and js/mockup-templates.js (window.TB_PHOTO_MOCKUPS).
   ========================================================================== */

"use strict";

(() => {

    const STORAGE_KEY = "tb_mockup_v1";

    /* Upper bound on printable surfaces per template, used only to bound a
       restored layer's zone index before the live template is known. Nothing
       stops a template declaring fewer; layerZone() clamps to the real count. */
    const MAX_ZONES = 8;

    /* Internal resolution for the vector products: the visible element
       scales via CSS while exports render at full 1000 x 1000 quality.
       Photographic templates instead resize the canvas to the base
       photograph's native dimensions so exports keep the photo's quality. */
    const CANVAS_W = 1000;
    const CANVAS_H = 1000;

    const canvas = document.getElementById("mockup-canvas");
    if (!canvas) {
        return;
    }
    const ctx = canvas.getContext("2d");

    /* Selection chrome is painted on a SEPARATE canvas stacked over the one
       above. Export and the tray thumbnails both read #mockup-canvas via
       toDataURL(), so anything drawn there ends up in the visitor's file --
       handles, the bounding box and the layer name tag must therefore never
       touch it. */
    const overlay = document.getElementById("mockup-overlay");
    const canvasWrap = document.querySelector(".mockup-canvas-wrap");
    const octx = overlay ? overlay.getContext("2d") : null;

    const SVG_NS = "http://www.w3.org/2000/svg";

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    /* ----------------------------------------------------------------------
       Small canvas path helper. Written locally instead of relying on
       ctx.roundRect(), which is not supported in every browser this free
       tool needs to reach.
       ---------------------------------------------------------------------- */
    function roundRectPath(context, x, y, w, h, r) {
        context.beginPath();
        context.moveTo(x + r, y);
        context.lineTo(x + w - r, y);
        context.arcTo(x + w, y, x + w, y + r, r);
        context.lineTo(x + w, y + h - r);
        context.arcTo(x + w, y + h, x + w - r, y + h, r);
        context.lineTo(x + r, y + h);
        context.arcTo(x, y + h, x, y + h - r, r);
        context.lineTo(x, y + r);
        context.arcTo(x, y, x + r, y, r);
        context.closePath();
    }

    /* ----------------------------------------------------------------------
       Product library: each entry draws a flat, gradient-free vector
       illustration (matching the site's Fabric Film Studio theme) and
       declares the axis-aligned print area the uploaded design composites
       into.
       ---------------------------------------------------------------------- */

    function drawTshirtBody(context, hex, outline) {
        context.save();
        context.fillStyle = hex;
        context.strokeStyle = outline;
        context.lineWidth = 6;
        context.beginPath();
        context.moveTo(430, 140);
        context.lineTo(330, 170);
        context.lineTo(170, 230);
        context.lineTo(110, 430);
        context.lineTo(300, 380);
        context.lineTo(300, 900);
        context.lineTo(700, 900);
        context.lineTo(700, 380);
        context.lineTo(890, 430);
        context.lineTo(830, 230);
        context.lineTo(670, 170);
        context.lineTo(570, 140);
        context.quadraticCurveTo(500, 210, 430, 140);
        context.closePath();
        context.fill();
        context.stroke();

        /* Collar rib detail */
        context.beginPath();
        context.moveTo(450, 150);
        context.quadraticCurveTo(500, 200, 550, 150);
        context.lineWidth = 4;
        context.stroke();
        context.restore();
    }

    function drawHoodieBody(context, hex, outline) {
        drawTshirtBody(context, hex, outline);

        context.save();
        context.fillStyle = hex;
        context.strokeStyle = outline;
        context.lineWidth = 6;

        /* Hood, folded down across the shoulders */
        context.beginPath();
        context.moveTo(330, 170);
        context.quadraticCurveTo(500, 90, 670, 170);
        context.quadraticCurveTo(650, 230, 500, 250);
        context.quadraticCurveTo(350, 230, 330, 170);
        context.closePath();
        context.fill();
        context.stroke();

        /* Drawstrings */
        context.lineWidth = 6;
        [460, 540].forEach((sx) => {
            context.beginPath();
            context.moveTo(sx, 250);
            context.lineTo(sx, 300);
            context.stroke();
            context.beginPath();
            context.arc(sx, 306, 6, 0, Math.PI * 2);
            context.fillStyle = outline;
            context.fill();
        });

        /* Kangaroo pocket, below the print area */
        context.fillStyle = hex;
        roundRectPath(context, 380, 700, 240, 130, 14);
        context.fill();
        context.stroke();

        /* Sleeve cuffs, sized to stay within the sleeve silhouette */
        context.fillStyle = outline;
        context.fillRect(125, 405, 35, 45);
        context.fillRect(840, 405, 35, 45);
        context.restore();
    }

    function drawMugBody(context, hex, outline) {
        context.save();

        /* Handle, drawn first so the body seam sits cleanly on top of it.
           The angle range deliberately overshoots 90 degrees on each side so
           both ends land to the left of the body's right edge (x = 700) and
           are hidden underneath it, instead of floating disconnected. */
        context.beginPath();
        context.arc(700, 560, 150, -1.9, 1.9);
        context.lineWidth = 55;
        context.strokeStyle = hex;
        context.stroke();
        context.lineWidth = 6;
        context.strokeStyle = outline;
        context.stroke();

        /* Body */
        context.fillStyle = hex;
        context.strokeStyle = outline;
        context.lineWidth = 6;
        roundRectPath(context, 300, 320, 400, 480, 18);
        context.fill();
        context.stroke();

        /* Base shadow band */
        context.globalAlpha = 0.12;
        context.beginPath();
        context.ellipse(500, 780, 190, 16, 0, 0, Math.PI, false);
        context.fillStyle = outline;
        context.fill();
        context.globalAlpha = 1;

        /* Rim opening */
        context.beginPath();
        context.ellipse(500, 320, 200, 40, 0, 0, Math.PI * 2);
        context.fillStyle = outline;
        context.fill();
        context.beginPath();
        context.ellipse(500, 314, 188, 32, 0, 0, Math.PI * 2);
        context.fillStyle = hex;
        context.fill();
        context.lineWidth = 4;
        context.strokeStyle = outline;
        context.stroke();
        context.restore();
    }

    function drawBoxBody(context, hex, outline) {
        context.save();
        context.fillStyle = hex;
        context.strokeStyle = outline;
        context.lineWidth = 6;

        /* Front face */
        context.fillRect(280, 340, 440, 460);
        context.strokeRect(280, 340, 440, 460);

        /* Top and side flap strips suggest depth without a gradient */
        context.fillStyle = outline;
        context.globalAlpha = 0.55;
        context.beginPath();
        context.moveTo(280, 340);
        context.lineTo(360, 260);
        context.lineTo(800, 260);
        context.lineTo(720, 340);
        context.closePath();
        context.fill();

        context.beginPath();
        context.moveTo(720, 340);
        context.lineTo(800, 260);
        context.lineTo(800, 680);
        context.lineTo(720, 760);
        context.closePath();
        context.fill();
        context.globalAlpha = 1;

        /* Packing tape tabs, positioned clear of the print area */
        context.fillStyle = outline;
        context.fillRect(470, 340, 60, 50);
        context.fillRect(470, 750, 60, 50);

        context.strokeRect(280, 340, 440, 460);
        context.restore();
    }

    /* The drawn `tshirt` was retired on September 2, 2026, replaced by the
       photographic `tshirt-hanger-white`. `drawTshirtBody` above STAYS: the
       drawn hoodie is built on top of it, so deleting the shape with the
       product would have taken the hoodie's body with it. */
    const PRODUCTS = {
        hoodie: {
            label: "Hoodie",
            printArea: { x: 370, y: 380, w: 260, h: 230 },
            drawBase: drawHoodieBody,
            colors: {
                black: { name: "Black", hex: "#1A1A1A", outline: "#000000" },
                heather: { name: "Heather Gray", hex: "#B9B7B2", outline: "#98968F" },
                navy: { name: "Navy", hex: "#1F2A44", outline: "#141B2C" },
                white: { name: "White", hex: "#FFFFFF", outline: "#D8D6D0" }
            }
        },
        mug: {
            label: "Mug",
            printArea: { x: 340, y: 400, w: 320, h: 300 },
            drawBase: drawMugBody,
            colors: {
                white: { name: "White", hex: "#FFFFFF", outline: "#D8D6D0" },
                black: { name: "Black", hex: "#1A1A1A", outline: "#000000" },
                red: { name: "Red", hex: "#B5352E", outline: "#8F2A24" }
            }
        },
        box: {
            label: "Packaging Box",
            printArea: { x: 330, y: 430, w: 340, h: 260 },
            drawBase: drawBoxBody,
            colors: {
                kraft: { name: "Kraft Brown", hex: "#C48A4A", outline: "#9C6B34" },
                white: { name: "White", hex: "#FFFFFF", outline: "#D8D6D0" },
                black: { name: "Black", hex: "#1A1A1A", outline: "#000000" }
            }
        }
    };

    /* ----------------------------------------------------------------------
       Photographic mockup templates ("Sandwich Method").
       js/mockup-templates.js publishes window.TB_PHOTO_MOCKUPS; each valid
       entry becomes a product whose base is a photographed scene instead of
       a vector illustration. Rendering order for mode "window" is design
       first, then the base photograph (whose fully transparent print
       opening masks the art with its own antialiased edge), then the
       shadow/glare overlay. Mode "surface" draws the base first, for
       templates whose print area is opaque in the base file. Malformed
       registry entries are skipped rather than allowed to break the editor.
       ---------------------------------------------------------------------- */

    const PHOTO_REGISTRY = Array.isArray(window.TB_PHOTO_MOCKUPS) ? window.TB_PHOTO_MOCKUPS : [];

    /* Composite operations a template may request for its overlay layer.
       "multiply" for baked shadow/light maps, "screen" for glass glare,
       "source-over" for a conventional pre-masked transparent PNG. */
    const OVERLAY_BLENDS = ["multiply", "screen", "source-over"];

    /* One quad of four numeric corners. */
    function validQuad(zone) {
        return Array.isArray(zone) && zone.length === 4 &&
            zone.every((p) => p && typeof p.x === "number" && typeof p.y === "number");
    }

    PHOTO_REGISTRY.forEach((tpl) => {
        const valid = tpl &&
            typeof tpl.id === "string" && tpl.id &&
            !Object.prototype.hasOwnProperty.call(PRODUCTS, tpl.id) &&
            typeof tpl.base === "string" &&
            validQuad(tpl.warpZone) &&
            /* `warpZones` is optional and additive: a template that declares
               it carries one printable surface per entry, and `warpZone` stays
               the first of them so every existing path keeps working. An
               invalid extra zone rejects the whole template rather than
               silently printing on one card and not the other. */
            (!Object.prototype.hasOwnProperty.call(tpl, "warpZones") ||
                (Array.isArray(tpl.warpZones) && tpl.warpZones.length > 0 &&
                    tpl.warpZones.every(validQuad)));
        if (!valid) {
            return;
        }
        /* Recolour needs BOTH a palette and a mask: without the mask there is
           nothing to confine the tint to and it would flood the whole frame,
           model included. Declaring only one of the pair leaves the colour
           field hidden, exactly as it is for a framed poster. */
        const recolorable = tpl.garment && tpl.garmentColors &&
            typeof tpl.garmentColors === "object" &&
            Object.keys(tpl.garmentColors).length > 0;

        PRODUCTS[tpl.id] = {
            type: "photo",
            label: typeof tpl.title === "string" && tpl.title ? tpl.title : tpl.id,
            template: tpl,
            colors: recolorable ? tpl.garmentColors : null
        };
    });

    /* Axis-aligned bounding box of a four-corner warp zone. */
    /* Every printable surface on a template, in order. Single-zone templates
       -- which is all of them except the business card pair -- return their
       one `warpZone`, so callers never branch on which kind they have. */
    function zonesOf(tpl) {
        return (tpl && Array.isArray(tpl.warpZones) && tpl.warpZones.length)
            ? tpl.warpZones
            : [tpl.warpZone];
    }

    /* Which surface new uploads land on, and which the layer list shows. Only
       ever non-zero on a multi-zone template; clamped whenever the product
       changes so switching from the two-card mockup to a t-shirt cannot leave
       it pointing at a surface that no longer exists. */
    let activeZone = 0;

    function zoneCount() {
        const config = PRODUCTS[currentProduct];
        return (config && config.template) ? zonesOf(config.template).length : 1;
    }

    function clampActiveZone() {
        activeZone = clamp(Math.round(activeZone) || 0, 0, zoneCount() - 1);
    }

    /* A layer belongs to exactly one surface. Absent or corrupt values read as
       surface 0, which is what every layer saved before this existed has. */
    function layerZone(layer) {
        const z = Math.round(layer && layer.zone);
        return (isFinite(z) && z >= 0 && z < zoneCount()) ? z : 0;
    }

    function zoneBounds(zone) {
        const xs = zone.map((p) => p.x);
        const ys = zone.map((p) => p.y);
        const minX = Math.min.apply(null, xs);
        const minY = Math.min.apply(null, ys);
        return {
            x: minX,
            y: minY,
            w: Math.max.apply(null, xs) - minX,
            h: Math.max.apply(null, ys) - minY
        };
    }

    /* True when the quad is an upright rectangle, which composites with the
       plain 2D path and keeps drag/scale placement. Non-rectangular quads
       (angled or leaning frames) take the perspective-warp path instead. */
    function zoneIsRect(zone) {
        return zone[0].y === zone[1].y && zone[3].y === zone[2].y &&
            zone[0].x === zone[3].x && zone[1].x === zone[2].x;
    }

    /* ----------------------------------------------------------------------
       Photo template asset loading. Base and overlay images load once per
       template and stay cached for the session. Absolute URLs (future
       object-storage hosting) get crossOrigin="anonymous" so
       canvas.toDataURL() exports are not blocked by a tainted canvas.
       ---------------------------------------------------------------------- */

    const photoAssets = {};

    function loadTemplateImage(src, onDone) {
        const img = new Image();
        if (/^https?:/i.test(src)) {
            img.crossOrigin = "anonymous";
        }
        img.addEventListener("load", () => onDone(img));
        img.addEventListener("error", () => onDone(null));
        img.src = src;
    }

    function ensurePhotoAssets(key) {
        if (photoAssets[key]) {
            return photoAssets[key];
        }
        const tpl = PRODUCTS[key].template;
        /* Every optional map costs one more load to wait on. Only the base
           is required; the rest degrade the render without breaking it. */
        const extras = ["overlay", "displace", "shade", "light", "garment", "tone", "grain"]
            .filter((k) => tpl[k]);
        const entry = {
            status: "loading",
            base: null,
            overlay: null,
            displace: null,
            shade: null,
            light: null,
            garment: null,
            tone: null,
            grain: null,
            pending: 1 + extras.length
        };
        photoAssets[key] = entry;

        const settle = () => {
            entry.pending -= 1;
            if (entry.pending > 0) {
                return;
            }
            /* A missing overlay only costs realism; a missing base is fatal
               for the template. A missing displacement map is the same class
               of loss as a missing overlay -- the artwork simply renders
               flat, which is what every template did before the pass
               existed. */
            entry.status = entry.base ? "ready" : "error";
            if (currentProduct === key) {
                draw();
            }
        };

        loadTemplateImage(tpl.base, (img) => {
            entry.base = img;
            settle();
        });
        extras.forEach((k) => {
            loadTemplateImage(tpl[k], (img) => {
                entry[k] = img;
                settle();
            });
        });
        return entry;
    }

    /* ----------------------------------------------------------------------
       Perspective warp (non-rectangular warp zones only). The WebGL helper
       is vendored at js/vendor/glfx.js and loaded lazily the first time an
       angled template actually needs it, so rectangular templates cost no
       extra payload. If the library or a WebGL context is unavailable the
       design falls back to an unwarped draw across the zone's bounding box.

       Layers are composited into an offscreen "artwork sheet" FIRST and the
       sheet is what gets warped, so a leaning frame carries the whole stack
       through a single GPU pass rather than one pass per layer.
       ---------------------------------------------------------------------- */

    let warpLibState = "idle"; /* idle | loading | ready | failed */
    let fxCanvas = null;
    let sheetCanvas = null;

    function ensureWarpLib() {
        if (warpLibState !== "idle") {
            return;
        }
        warpLibState = "loading";
        const script = document.createElement("script");
        script.src = "js/vendor/glfx.js";
        script.addEventListener("load", () => {
            warpLibState = window.fx ? "ready" : "failed";
            draw();
        });
        script.addEventListener("error", () => {
            warpLibState = "failed";
            draw();
        });
        document.head.appendChild(script);
    }

    /* The flattened artwork sheet handed to the warp, sized to the zone's
       bounding box so layer placement carries across unchanged. The white
       fill is the paper backing the previous single-design path drew. */
    function renderSheet(area, zoneIndex) {
        const w = Math.max(1, Math.round(area.w));
        const h = Math.max(1, Math.round(area.h));
        if (!sheetCanvas) {
            sheetCanvas = document.createElement("canvas");
        }
        if (sheetCanvas.width !== w || sheetCanvas.height !== h) {
            sheetCanvas.width = w;
            sheetCanvas.height = h;
        }
        const sctx = sheetCanvas.getContext("2d");
        sctx.clearRect(0, 0, w, h);
        sctx.fillStyle = "#FFFFFF";
        sctx.fillRect(0, 0, w, h);
        paintLayers(sctx, { x: 0, y: 0, w: w, h: h }, false, zoneIndex);
        return sheetCanvas;
    }

    /* The sheet handed to the fabric displacement pass. Unlike renderSheet()
       above it is the size of the WHOLE canvas, because the displacement and
       shading maps are registered to the base photograph pixel-for-pixel and
       the shader samples all three in one coordinate space. Layers are still
       painted into the print zone, and their hit rects are still recorded --
       displacement shifts the artwork by a few pixels at most, so unlike the
       perspective warp this path keeps drag-to-position working. */
    let fabricSheet = null;

    /* Every surface is painted into ONE canvas-sized sheet, so the shader
       still runs a single pass no matter how many cards a template has: the
       displacement, shading and specular maps already cover the whole
       photograph, and the pass discards wherever the sheet is empty. */
    function renderFabricSheet(zones) {
        if (!fabricSheet) {
            fabricSheet = document.createElement("canvas");
        }
        if (fabricSheet.width !== canvas.width || fabricSheet.height !== canvas.height) {
            fabricSheet.width = canvas.width;
            fabricSheet.height = canvas.height;
        }
        const sctx = fabricSheet.getContext("2d");
        sctx.clearRect(0, 0, fabricSheet.width, fabricSheet.height);
        zones.forEach((zone, index) => {
            const area = zoneBounds(zone);
            sctx.save();
            sctx.beginPath();
            sctx.rect(area.x, area.y, area.w, area.h);
            sctx.clip();
            paintLayers(sctx, area, true, index);
            sctx.restore();
        });
        return fabricSheet;
    }

    function drawWarpedDesign(zone, zoneIndex) {
        const area = zoneBounds(zone);
        if (warpLibState === "ready") {
            try {
                fxCanvas = fxCanvas || window.fx.canvas();
                const texture = fxCanvas.texture(renderSheet(area, zoneIndex));
                fxCanvas.draw(texture, canvas.width, canvas.height).perspective(
                    [0, 0, canvas.width, 0, canvas.width, canvas.height, 0, canvas.height],
                    [
                        zone[0].x, zone[0].y,
                        zone[1].x, zone[1].y,
                        zone[2].x, zone[2].y,
                        zone[3].x, zone[3].y
                    ]
                ).update();
                ctx.drawImage(fxCanvas, 0, 0);
                texture.destroy();
                /* Direct manipulation is not offered on warped quads: mapping
                   a pointer back into sheet space needs the inverse of the
                   perspective transform, which the GPU pass above does not
                   hand back. Layers keep no hit rect, so nothing on the
                   canvas is grabbable and the sidebar controls are the only
                   way to place artwork here. */
                layers.forEach((layer) => {
                    if (typeof zoneIndex !== "number" || layerZone(layer) === zoneIndex) {
                        layer.rect = null;
                    }
                });
                return;
            } catch (err) {
                warpLibState = "failed";
            }
        } else {
            ensureWarpLib();
        }
        drawLayersInArea(area, 0, zoneIndex);
    }

    /* ----------------------------------------------------------------------
       Colour maths for the picker. Everything here is plain arithmetic on
       sRGB triples -- no library, no CDN, no canvas readback.
       ---------------------------------------------------------------------- */

    function hexToRgb(value) {
        const raw = String(value == null ? "" : value).trim().replace(/^#/, "");
        const full = raw.length === 3
            ? raw[0] + raw[0] + raw[1] + raw[1] + raw[2] + raw[2]
            : raw;
        if (!/^[0-9a-f]{6}$/i.test(full)) {
            return null;
        }
        const n = parseInt(full, 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }

    function rgbToHex(r, g, b) {
        const part = (v) => {
            const s = clamp(Math.round(v), 0, 255).toString(16);
            return s.length === 1 ? "0" + s : s;
        };
        return ("#" + part(r) + part(g) + part(b)).toUpperCase();
    }

    function rgbToHsv(r, g, b) {
        const rn = r / 255;
        const gn = g / 255;
        const bn = b / 255;
        const max = Math.max(rn, gn, bn);
        const min = Math.min(rn, gn, bn);
        const d = max - min;
        let h = 0;
        if (d !== 0) {
            if (max === rn) { h = ((gn - bn) / d) % 6; }
            else if (max === gn) { h = (bn - rn) / d + 2; }
            else { h = (rn - gn) / d + 4; }
            h *= 60;
            if (h < 0) { h += 360; }
        }
        return { h: h, s: max === 0 ? 0 : d / max, v: max };
    }

    function hsvToRgb(h, s, v) {
        const c = v * s;
        const hp = (((h % 360) + 360) % 360) / 60;
        const x = c * (1 - Math.abs((hp % 2) - 1));
        let rgb = [0, 0, 0];
        if (hp < 1) { rgb = [c, x, 0]; }
        else if (hp < 2) { rgb = [x, c, 0]; }
        else if (hp < 3) { rgb = [0, c, x]; }
        else if (hp < 4) { rgb = [0, x, c]; }
        else if (hp < 5) { rgb = [x, 0, c]; }
        else { rgb = [c, 0, x]; }
        const m = v - c;
        return { r: (rgb[0] + m) * 255, g: (rgb[1] + m) * 255, b: (rgb[2] + m) * 255 };
    }

    /* Vector products need an outline colour as well as a fill. The shipped
       colorways carry a hand-picked one; a freely chosen colour derives its
       own by darkening, which keeps every seam and rib visible whatever the
       visitor picks -- including on white, where a pure-white outline would
       erase the garment's silhouette entirely. */
    function deriveOutline(hex) {
        const c = hexToRgb(hex) || { r: 0, g: 0, b: 0 };
        return rgbToHex(c.r * 0.78, c.g * 0.78, c.b * 0.78);
    }

    /* Presets mirror the reference picker: a greyscale run, then a spread of
       saturated hues wide enough to reach most brand colours in one click. */
    const COLOR_PRESETS = [
        "#FFFFFF", "#D6D6D6", "#9B9B9B", "#4A4A4A", "#000000", "#E9A13B", "#F5D547",
        "#8B5A2B", "#6E8B3D", "#7ED321", "#22B573", "#4A90D9", "#2F4FCD", "#8E44AD",
        "#1A1A1A", "#6B6B66", "#B9B7B2", "#D0021B", "#00C853", "#0033CC", "#FFEB00",
        "#FF2D95", "#00E0E0", "#F5A623", "#5B2C82", "#0B6E2E", "#1F2A44", "#B5352E"
    ];

    /* ----------------------------------------------------------------------
       DOM references
       ---------------------------------------------------------------------- */

    const colorField = document.getElementById("m-color-field");
    const colorTrigger = document.getElementById("m-color-trigger");
    const colorPopover = document.getElementById("m-color-popover");
    const colorDot = document.getElementById("m-color-dot");
    const colorHexLabel = document.getElementById("m-color-hex");
    const svArea = document.getElementById("m-color-sv");
    const svThumb = document.getElementById("m-color-sv-thumb");
    const hueArea = document.getElementById("m-color-hue");
    const hueThumb = document.getElementById("m-color-hue-thumb");
    const inHex = document.getElementById("m-color-in-hex");
    const inR = document.getElementById("m-color-in-r");
    const inG = document.getElementById("m-color-in-g");
    const inB = document.getElementById("m-color-in-b");
    const presetGrid = document.getElementById("m-color-presets");

    /* The hue strip that sits in the panel under the trigger, where the
       colourway swatch row used to be (August 25, 2026). Driven by the same
       picker instance as the popover's own strip, not by a second copy of the
       maths. */
    const colorStrip = document.getElementById("m-color-strip");
    const colorStripThumb = document.getElementById("m-color-strip-thumb");

    /* The background picker: the same component again, driven by the same
       factory. See the Background section further down. */
    const bgField = document.getElementById("m-bg-field");
    const bgTrigger = document.getElementById("m-bg-trigger");
    const bgPopover = document.getElementById("m-bg-popover");
    const bgDot = document.getElementById("m-bg-dot");
    const bgHexLabel = document.getElementById("m-bg-hex");
    const bgSvArea = document.getElementById("m-bg-sv");
    const bgSvThumb = document.getElementById("m-bg-sv-thumb");
    const bgHueArea = document.getElementById("m-bg-hue");
    const bgHueThumb = document.getElementById("m-bg-hue-thumb");
    const bgInHex = document.getElementById("m-bg-in-hex");
    const bgInR = document.getElementById("m-bg-in-r");
    const bgInG = document.getElementById("m-bg-in-g");
    const bgInB = document.getElementById("m-bg-in-b");
    const bgPresetGrid = document.getElementById("m-bg-presets");
    const bgStrip = document.getElementById("m-bg-strip");
    const bgStripThumb = document.getElementById("m-bg-strip-thumb");

    const fileInput = document.getElementById("m-design");
    const fileError = document.getElementById("m-design-error");
    const layerList = document.getElementById("m-layer-list");
    const zoneSwitch = document.getElementById("m-zone-switch");
    const layerActions = document.getElementById("m-layer-actions");
    const addDesignBtn = document.getElementById("m-add-design");
    const uploadDesignBtn = document.getElementById("m-upload-design");
    const actResize = document.getElementById("m-act-resize");
    const actReplace = document.getElementById("m-act-replace");
    const actRemove = document.getElementById("m-act-remove");

    const scaleInput = document.getElementById("m-scale");
    const scaleNumber = document.getElementById("m-scale-number");
    const scaleReset = document.getElementById("m-scale-reset");
    const scaleOutput = document.getElementById("m-scale-output");
    const labelInput = document.getElementById("m-label");
    const addToTrayBtn = document.getElementById("add-to-tray");
    const trayGrid = document.getElementById("tray-grid");
    const trayEmpty = document.getElementById("tray-empty");
    const trayCount = document.getElementById("tray-count");

    /* The two views of the preview pane, and the tabs that switch them. */
    const viewTabs = [document.getElementById("view-tab-preview"),
                      document.getElementById("view-tab-tray")];
    const viewPanels = [document.getElementById("view-preview"),
                        document.getElementById("view-tray")];

    /* The export panel, which lives in the control pane's action row since
       August 25, 2026. The editor bar's single "Download PNG" button is gone
       -- there is one exporter on this page, and it is here. */
    const dlToggle = document.getElementById("dl-toggle");
    const dlPanel = document.getElementById("dl-panel");
    const dlFormats = dlPanel ? dlPanel.querySelectorAll("[data-format]") : [];
    const dlSizes = document.getElementById("dl-sizes");
    const dlNote = document.getElementById("dl-note");
    /* No #doc-name here (August 24, 2026). The bar's document-name input was
       removed when the bar gained navigation and a search field; #m-label,
       "Mockup Label" in the controls, is what names a mockup now. A stale
       `docName` in a returning visitor's storage is simply not read. */

    /* ----------------------------------------------------------------------
       State. Design bitmaps live only in memory: neither a layer's source
       image nor the tray thumbnails are written to localStorage, matching the
       poster editor's precedent of keeping image data off disk to respect
       browser storage quotas. What IS persisted is every layer's placement --
       name, size, offset, rotation, visibility -- so a returning visitor
       re-uploads the files into a composition that is already arranged, the
       same bargain the single-design version struck for one image.

       Array order is paint order: index 0 is the back of the stack, the last
       entry is the front. The sidebar list renders the reverse, front-most
       first, which is what every layers panel does.
       ---------------------------------------------------------------------- */

    const CUSTOM_COLOR = "custom";
    const MIN_SCALE = 0.05;
    const MAX_SCALE = 2;
    const DEFAULT_SCALE = 0.75;
    /* Additional layers are usually badges and logos beside a main print, so
       they start smaller rather than at the first layer's size. */
    const EXTRA_SCALE = 0.35;
    /* A sanity ceiling. Tampered storage cannot spawn an unbounded list, and
       a real composition never needs this many. */
    const MAX_LAYERS = 12;

    let currentProduct = "hoodie";
    let currentColor = "black";
    let customHex = "#FFFFFF";
    /* The canvas background, or null for transparent -- which is the default
       and what every export produced before this existed. `pickerHue` used to
       live here; it belongs to a picker instance now that there are two. */
    let bgHex = null;

    let layers = [];
    let selectedId = null;
    let layerCounter = 0;

    /* Which layer the next file pick lands on: a fresh one, or a named
       existing layer whose placement survives the swap. */
    let uploadIntent = { mode: "add", id: null };

    let drag = null;

    /* In-memory tray of one-click "added" mockups for this browser tab. */
    let trayItems = [];

    function selectedLayer() {
        if (selectedId === null) {
            return null;
        }
        for (let i = 0; i < layers.length; i += 1) {
            if (layers[i].id === selectedId) {
                return layers[i];
            }
        }
        return null;
    }

    function readyLayers() {
        return layers.filter((layer) => layer.img);
    }

    /* ----------------------------------------------------------------------
       Canvas composition
       ---------------------------------------------------------------------- */

    /* Paints every layer into `area` of `context`. Hit rectangles are recorded
       only for the real canvas: the offscreen warp sheet shares this painter
       but its coordinates mean nothing to a pointer. */
    function paintLayers(context, area, recordRects, zoneIndex) {
        /* `zoneIndex` absent means "every layer, one surface" -- the vector
           products and the flattened export sheet. When it is given, a layer
           belonging to another surface is skipped entirely, INCLUDING its hit
           rectangle: the caller loops the surfaces and each pass must leave
           the other surfaces' rectangles alone rather than nulling them. */
        const scoped = typeof zoneIndex === "number";
        layers.forEach((layer) => {
            if (scoped && layerZone(layer) !== zoneIndex) {
                return;
            }
            if (recordRects) {
                layer.rect = null;
            }
            if (!layer.img) {
                return;
            }

            const containBase = Math.min(area.w / layer.img.width, area.h / layer.img.height);
            const drawW = layer.img.width * containBase * layer.scale;
            const drawH = layer.img.height * containBase * layer.scale;

            /* Half the print area in each direction: a layer can hang off the
               edge (the clip hides the excess) but cannot be lost entirely
               beyond it. */
            const maxOffsetX = area.w / 2;
            const maxOffsetY = area.h / 2;
            layer.offsetX = clamp(layer.offsetX, -maxOffsetX, maxOffsetX);
            layer.offsetY = clamp(layer.offsetY, -maxOffsetY, maxOffsetY);

            const cx = area.x + area.w / 2 + layer.offsetX;
            const cy = area.y + area.h / 2 + layer.offsetY;

            if (recordRects) {
                layer.rect = { cx: cx, cy: cy, w: drawW, h: drawH, rotation: layer.rotation };
            }

            if (!layer.visible) {
                return;
            }

            context.save();
            context.translate(cx, cy);
            if (layer.rotation) {
                context.rotate(layer.rotation);
            }
            context.drawImage(layer.img, -drawW / 2, -drawH / 2, drawW, drawH);
            context.restore();
        });
    }

    function drawLayersInArea(area, cornerRadius, zoneIndex) {
        const r = typeof cornerRadius === "number" ? cornerRadius : 16;
        /* Placeholder styling scales with the canvas, which runs at 1000px
           for vector products but at the base photograph's native size for
           photographic templates. */
        const k = canvas.width / CANVAS_W;

        /* Emptiness is per surface: on the two-card template a design on the
           front must not suppress the "Upload your design" prompt on the back,
           or the second card silently looks like part of the photograph. */
        const scoped = typeof zoneIndex === "number";
        const mine = scoped
            ? layers.filter((layer) => layer.img && layerZone(layer) === zoneIndex)
            : readyLayers();

        if (!mine.length) {
            ctx.save();
            roundRectPath(ctx, area.x, area.y, area.w, area.h, r);
            ctx.fillStyle = "#F4F3EF";
            ctx.fill();
            ctx.setLineDash([12 * k, 8 * k]);
            ctx.strokeStyle = "#B9B7B2";
            ctx.lineWidth = 3 * k;
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = "#6B6B66";
            ctx.font = "400 " + Math.round(32 * k) + 'px "Inter", sans-serif';
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("Upload your design", area.x + area.w / 2, area.y + area.h / 2, area.w - 40 * k);
            ctx.restore();
            layers.forEach((layer) => {
                if (!scoped || layerZone(layer) === zoneIndex) {
                    layer.rect = null;
                }
            });
            return;
        }

        ctx.save();
        roundRectPath(ctx, area.x, area.y, area.w, area.h, r);
        ctx.clip();
        paintLayers(ctx, area, true, zoneIndex);
        ctx.restore();
    }

    /* The chosen background, painted before anything else so it sits behind
       the product, the artwork and any overlay. On the canvas rather than in
       CSS deliberately: the PNG export and the tray thumbnails both read
       #mockup-canvas, so a background painted here is in both of them for
       free, and a background painted in CSS would be in neither.

       Called after clearRect in both render paths. A null background paints
       nothing at all, which leaves the export transparent exactly as it was
       before this existed. */
    function paintBackground() {
        const hex = activeBackground();
        if (!hex) {
            return;
        }
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = hex;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
    }

    function paint() {
        const product = PRODUCTS[currentProduct] ? currentProduct : "hoodie";
        currentProduct = product;
        const config = PRODUCTS[currentProduct];

        if (config.type === "photo") {
            drawPhoto(config);
            return;
        }

        if (canvas.width !== CANVAS_W || canvas.height !== CANVAS_H) {
            canvas.width = CANVAS_W;
            canvas.height = CANVAS_H;
        }

        const color = activeColor(config);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        paintBackground();
        config.drawBase(ctx, color.hex, color.outline);
        drawLayersInArea(config.printArea, 16);
    }

    /* Publishes the canvas's real aspect ratio to CSS, which uses it to bound
       the render's WIDTH by the height the pane has left -- see the
       .mockup-canvas-wrap cap in css/style.css. Written here rather than at
       the three places that resize the canvas: a photographic template sizes
       itself from a base image that loads asynchronously, so the value has to
       be re-read after painting rather than once at startup.

       Only written when it changes, so this costs nothing on a drag. */
    let publishedAspect = 0;

    function syncCanvasAspect() {
        if (!canvas.height) {
            return;
        }
        const aspect = canvas.width / canvas.height;
        if (aspect !== publishedAspect) {
            publishedAspect = aspect;
            canvasWrap.style.setProperty("--mockup-aspect", String(aspect));
        }
    }

    function draw() {
        paint();
        drawOverlay();
        syncCanvasAspect();
    }

    /* The Sandwich Method compositor for photographic templates. Layer
       order depends on the template's mode: "window" bases carry a fully
       transparent print opening, so the design (over a white paper backing)
       is painted first and the base then masks it; "surface" bases are
       opaque, so the design is painted over them. The shadow/glare overlay
       is always the final layer. */
    /* ----------------------------------------------------------------------
       Garment recolour.

       A recoloured shirt is the shading that was already derived, tinted --
       no extra maps and no per-colour assets. Flat colour, multiplied by the
       fold structure, lifted by the specular, then confined to the garment
       mask. Because both maps are measured against the fabric's own median,
       a mid-tone colour lands at its true value where the garment is evenly
       lit and darkens only where it genuinely folds.

       The specular is what stops a dark colour reading as flat paint: on
       black or navy almost everything the eye uses to identify cloth is in
       the highlights, not the shadows.
       ---------------------------------------------------------------------- */

    /* Undyed cotton, the colour the fibres that miss the dye keep. Not pure
       white: natural cotton is warm and slightly grey, and mixing toward
       #FFFFFF gives a heather that reads as faded rather than blended. */
    const NATURAL_FIBRE = { r: 242, g: 240, b: 236 };

    function mixToward(hex, target, amount) {
        const rgb = hexToRgb(hex);
        if (!rgb) {
            return hex;
        }
        const t = clamp(amount, 0, 1);
        return rgbToHex(
            Math.round(rgb.r + (target.r - rgb.r) * t),
            Math.round(rgb.g + (target.g - rgb.g) * t),
            Math.round(rgb.b + (target.b - rgb.b) * t)
        );
    }

    let tintCanvas = null;

    /* A heather is dyed fibres interleaved with undyed ones, so it needs two
       things a flat dye does not: the mean lift toward natural fibre, and the
       fibre speckle itself. The mean is exact arithmetic on the hex. The
       speckle is the photograph's own weave, screened back on -- `tone` can
       only multiply, so it can darken the dye but can never produce a fibre
       lighter than it. */
    function renderGarmentTint(colorInfo, assets, w, h) {
        const heather = typeof colorInfo.heather === "number"
            ? clamp(colorInfo.heather, 0, 1)
            : 0;
        const hex = heather > 0
            ? mixToward(colorInfo.hex, NATURAL_FIBRE, heather)
            : colorInfo.hex;
        if (!tintCanvas) {
            tintCanvas = document.createElement("canvas");
        }
        if (tintCanvas.width !== w || tintCanvas.height !== h) {
            tintCanvas.width = w;
            tintCanvas.height = h;
        }
        const t = tintCanvas.getContext("2d");
        t.globalCompositeOperation = "source-over";
        t.clearRect(0, 0, w, h);
        t.fillStyle = hex;
        t.fillRect(0, 0, w, h);

        /* The TONE map, not the shade/light pair the print pass uses. Tone is
           the garment's diffuse response normalised to its own peak, so a dye
           can only ever darken -- which is what a dye does. Screening the
           specular over a colour instead washes it out: navy measured
           (140,146,159), a pale blue-grey, because on a white garment that
           map is mostly bright DIFFUSE rather than true surface reflection. */
        const shading = assets.tone || assets.shade;
        if (shading) {
            t.globalCompositeOperation = "multiply";
            t.drawImage(shading, 0, 0, w, h);
        }
        /* The undyed fibres. Screened, because they are lighter than the dye
           and no multiply can reach them. Scaled by the heather fraction, so
           a 100% dyed colourway never touches this path at all. */
        if (heather > 0 && assets.grain) {
            t.globalCompositeOperation = "screen";
            t.globalAlpha = heather * 0.35;
            t.drawImage(assets.grain, 0, 0, w, h);
            t.globalAlpha = 1;
        }
        /* Last, and the reason the tint cannot reach skin, hair or
           background. The mask is feathered, so this also gives the recolour
           the same soft edge the photograph has. */
        t.globalCompositeOperation = "destination-in";
        t.drawImage(assets.garment, 0, 0, w, h);
        t.globalCompositeOperation = "source-over";
        return tintCanvas;
    }

    function drawPhoto(config) {
        const assets = ensurePhotoAssets(currentProduct);

        if (assets.status !== "ready") {
            if (canvas.width !== CANVAS_W || canvas.height !== CANVAS_H) {
                canvas.width = CANVAS_W;
                canvas.height = CANVAS_H;
            }
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.save();
            ctx.fillStyle = "#F4F3EF";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "#6B6B66";
            ctx.font = '400 32px "Inter", sans-serif';
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(
                assets.status === "error"
                    ? "This mockup template could not be loaded."
                    : "Loading mockup template...",
                canvas.width / 2,
                canvas.height / 2,
                canvas.width - 80
            );
            ctx.restore();
            layers.forEach((layer) => {
                layer.rect = null;
            });
            return;
        }

        /* Export quality tracks the photograph: the canvas runs at the base
           image's native resolution while CSS scales the visible element. */
        const w = assets.base.naturalWidth;
        const h = assets.base.naturalHeight;
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
        }
        ctx.clearRect(0, 0, w, h);
        /* Behind the photograph, so it shows only where the base is actually
           transparent -- which is why a template has to opt in: on a scene
           with an opaque backdrop this would be invisible, and on one with a
           transparent print window it would land behind the artwork. */
        paintBackground();

        const tpl = config.template;
        const zones = zonesOf(tpl);
        /* Every surface has to be a rectangle for the shading pass to run:
           the perspective warp is checked first and returns, so one tilted
           card would cost BOTH cards their displacement and lighting. */
        const rectZone = zones.every(zoneIsRect);

        /* A paper sheet sits behind artwork that does not fill a frame's
           window, and keeps exports opaque behind a transparent base. A
           GARMENT has no such backing: painting one would put a white
           rectangle on the shirt. Templates may state it outright; absent
           that, only "window" mode gets one. */
        const backing = Object.prototype.hasOwnProperty.call(tpl, "backing")
            ? tpl.backing
            : (tpl.mode === "window" ? "#FFFFFF" : null);

        const paintDesign = () => {
            if (readyLayers().length && !rectZone) {
                zones.forEach(drawWarpedDesign);
                return;
            }
            /* Fabric: displace the artwork around the folds and shade it
               with the garment's own light, in one GPU pass. Returning null
               means no WebGL, which is a quality loss and not an error -- the
               flat draw below is exactly what shipped before this existed.
               One pass covers every surface: the sheet carries them all. */
            if (readyLayers().length && assets.displace && window.TB_Displace) {
                const out = window.TB_Displace.render(
                    renderFabricSheet(zones),
                    assets.displace,
                    assets.shade,
                    tpl.displaceStrength,
                    assets.light,
                    typeof tpl.lightGain === "number" ? tpl.lightGain : 1
                );
                if (out) {
                    ctx.drawImage(out, 0, 0);
                    return;
                }
            }
            zones.forEach((zone, index) => {
                const area = zoneBounds(zone);
                if (backing) {
                    ctx.fillStyle = backing;
                    ctx.fillRect(area.x, area.y, area.w, area.h);
                }
                drawLayersInArea(area, 0, index);
            });
        };

        if (tpl.mode === "surface") {
            ctx.drawImage(assets.base, 0, 0, w, h);
            /* Recolour sits between the photograph and the artwork: the print
               is on top of the dyed shirt, not under it. The palette's
               "original" entry is the garment as photographed, so it skips
               the tint entirely rather than trying to reproduce itself. */
            const garmentColor = activeColor(config);
            if (assets.garment && garmentColor && !garmentColor.original) {
                ctx.drawImage(renderGarmentTint(garmentColor, assets, w, h), 0, 0);
            }
            paintDesign();
        } else {
            paintDesign();
            ctx.drawImage(assets.base, 0, 0, w, h);
        }
        if (assets.overlay) {
            /* The blend mode is what makes the overlay read as light rather
               than as a sheet of paint. A luminance map (white = lit, grey =
               shadowed) must multiply: at source-over its near-white body
               would veil the artwork and desaturate it completely. Canvas
               ignores an unrecognized value and silently leaves source-over,
               so the whitelist here is also what keeps a typo from becoming
               an invisible rendering regression. */
            const blend = OVERLAY_BLENDS.indexOf(tpl.overlayBlend) > -1
                ? tpl.overlayBlend
                : "source-over";
            ctx.save();
            ctx.globalCompositeOperation = blend;
            ctx.drawImage(assets.overlay, 0, 0, w, h);
            ctx.restore();
        }
    }

    /* ----------------------------------------------------------------------
       Selection chrome, on its own canvas. Handle sizes are quoted in SCREEN
       pixels and converted, so they stay the same visual size whether the
       canvas is a 1000px vector square scaled down or a 4000px photograph.
       ---------------------------------------------------------------------- */

    const HANDLE_SIZE = 11;   /* screen px, corner square side -- big enough to hold a glyph */
    const HANDLE_HIT = 16;    /* screen px, grab radius -- generous for touch */
    const ROTATE_GAP = 26;    /* screen px, rotate handle's lift above the top edge */
    const CHROME_COLOR = "#D0021B";

    function canvasPerScreenPx() {
        const rect = canvas.getBoundingClientRect();
        if (!rect.width) {
            return 1;
        }
        return canvas.width / rect.width;
    }

    function rectCorners(rect) {
        const hw = rect.w / 2;
        const hh = rect.h / 2;
        const cos = Math.cos(rect.rotation);
        const sin = Math.sin(rect.rotation);
        return [
            { x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh }
        ].map((p) => ({
            x: rect.cx + p.x * cos - p.y * sin,
            y: rect.cy + p.x * sin + p.y * cos
        }));
    }

    function rotateHandlePoint(rect, k) {
        const lift = rect.h / 2 + ROTATE_GAP * k;
        return {
            x: rect.cx + lift * Math.sin(rect.rotation),
            y: rect.cy - lift * Math.cos(rect.rotation)
        };
    }

    function distance(a, b) {
        return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
    }

    /* A short double-headed arrow along `angle`, chevron caps on both ends --
       the standard "resize" glyph, oriented along the corner's own diagonal
       (the direction a drag there actually resizes along) so a corner handle
       reads as "resize" rather than as an anonymous square. Rotating the
       layer rotates `angle` with it, so the arrow stays aligned to the true
       diagonal instead of the screen's. */
    function drawResizeGlyph(context, cx, cy, angle, len, head) {
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        const nx = -dy;
        const ny = dx;
        const half = len / 2;

        context.beginPath();
        context.moveTo(cx - dx * half, cy - dy * half);
        context.lineTo(cx + dx * half, cy + dy * half);
        context.stroke();

        [[-1, -dx, -dy], [1, dx, dy]].forEach(([, ox, oy]) => {
            const tipX = cx + ox * half;
            const tipY = cy + oy * half;
            const backX = tipX - ox * head;
            const backY = tipY - oy * head;
            context.beginPath();
            context.moveTo(backX + nx * head * 0.6, backY + ny * head * 0.6);
            context.lineTo(tipX, tipY);
            context.lineTo(backX - nx * head * 0.6, backY - ny * head * 0.6);
            context.stroke();
        });
    }

    /* A circular arrow -- the same "rotate/refresh" shape already used for
       the Reset design size button in the sidebar (there an SVG, here drawn
       on canvas), so the rotate handle reads as "rotate" rather than as a
       plain dot indistinguishable from a move handle. */
    function drawRotateGlyph(context, cx, cy, r) {
        const start = -Math.PI * 0.6;
        const end = Math.PI * 0.65;

        context.beginPath();
        context.arc(cx, cy, r, start, end, false);
        context.stroke();

        /* Arrowhead at the arc's leading end, tangent to the direction the
           arc was just drawn in (canvas sweeps clockwise as angle
           increases), so it reads as the arrow's point rather than a loose
           mark beside the curve. */
        const tipX = cx + Math.cos(end) * r;
        const tipY = cy + Math.sin(end) * r;
        const tangent = end + Math.PI / 2;
        const armLen = r * 0.9;
        const backX = tipX - Math.cos(tangent) * armLen;
        const backY = tipY - Math.sin(tangent) * armLen;
        const nx = Math.cos(end);
        const ny = Math.sin(end);
        const spread = r * 0.62;

        context.beginPath();
        context.moveTo(backX + nx * spread, backY + ny * spread);
        context.lineTo(tipX, tipY);
        context.lineTo(backX - nx * spread, backY - ny * spread);
        context.stroke();
    }

    /* Point-in-layer, done by rotating the point back into the layer's own
       unrotated frame rather than by testing a rotated polygon. */
    function hitsBody(rect, pt) {
        const dx = pt.x - rect.cx;
        const dy = pt.y - rect.cy;
        const cos = Math.cos(-rect.rotation);
        const sin = Math.sin(-rect.rotation);
        const lx = dx * cos - dy * sin;
        const ly = dx * sin + dy * cos;
        return Math.abs(lx) <= rect.w / 2 && Math.abs(ly) <= rect.h / 2;
    }

    function drawNameTag(layer, corners, k) {
        const fontSize = 13 * k;
        octx.font = "500 " + fontSize.toFixed(1) + 'px "Inter", sans-serif';
        const text = TB.desanitize(layer.name);
        const padX = 9 * k;
        const padY = 6 * k;
        const glyph = 8 * k;
        const gap = 6 * k;
        const w = padX * 2 + glyph + gap + octx.measureText(text).width;
        const h = fontSize + padY * 2;

        /* Anchored off the corner nearest the bottom-right, then pulled back
           inside the canvas so the tag is never clipped at an edge. */
        let anchor = corners[0];
        corners.forEach((p) => {
            if (p.x + p.y > anchor.x + anchor.y) {
                anchor = p;
            }
        });
        const x = clamp(anchor.x + 8 * k, 2 * k, overlay.width - w - 2 * k);
        const y = clamp(anchor.y + 8 * k, 2 * k, overlay.height - h - 2 * k);

        roundRectPath(octx, x, y, w, h, h / 2);
        octx.fillStyle = "rgba(255, 255, 255, 0.96)";
        octx.fill();
        octx.strokeStyle = "rgba(0, 0, 0, 0.15)";
        octx.lineWidth = Math.max(1, k);
        octx.stroke();

        octx.fillStyle = CHROME_COLOR;
        octx.fillRect(x + padX, y + h / 2 - glyph / 2, glyph, glyph);

        octx.fillStyle = "#1A1A1A";
        octx.textAlign = "left";
        octx.textBaseline = "middle";
        octx.fillText(text, x + padX + glyph + gap, y + h / 2);
    }

    function drawOverlay() {
        if (!octx) {
            return;
        }
        if (overlay.width !== canvas.width || overlay.height !== canvas.height) {
            overlay.width = canvas.width;
            overlay.height = canvas.height;
        }
        octx.clearRect(0, 0, overlay.width, overlay.height);

        const layer = selectedLayer();
        if (!layer || !layer.rect || !layer.visible) {
            return;
        }

        const k = canvasPerScreenPx();
        const corners = rectCorners(layer.rect);
        const rot = rotateHandlePoint(layer.rect, k);

        octx.save();
        octx.strokeStyle = CHROME_COLOR;
        octx.lineWidth = Math.max(1, 1.5 * k);

        octx.beginPath();
        octx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < corners.length; i += 1) {
            octx.lineTo(corners[i].x, corners[i].y);
        }
        octx.closePath();
        octx.stroke();

        /* Stem linking the box to the rotate handle */
        octx.beginPath();
        octx.moveTo((corners[0].x + corners[1].x) / 2, (corners[0].y + corners[1].y) / 2);
        octx.lineTo(rot.x, rot.y);
        octx.stroke();

        const side = HANDLE_SIZE * k;
        octx.fillStyle = "#FFFFFF";
        corners.forEach((p) => {
            octx.beginPath();
            octx.rect(p.x - side / 2, p.y - side / 2, side, side);
            octx.fill();
            octx.stroke();
        });

        const rotR = side * 0.8;
        octx.beginPath();
        octx.arc(rot.x, rot.y, rotR, 0, Math.PI * 2);
        octx.fill();
        octx.stroke();

        /* Glyphs drawn last and at a lighter weight than the box/handle
           outlines above, so a corner reads as "resize" and the top handle
           reads as "rotate" instead of both being anonymous shapes -- the
           same distinction a cursor icon gives on desktop, made visible here
           since canvas has no cursor-per-pixel to rely on. */
        octx.lineWidth = Math.max(1, k);
        corners.forEach((p) => {
            const angle = Math.atan2(p.y - layer.rect.cy, p.x - layer.rect.cx);
            drawResizeGlyph(octx, p.x, p.y, angle, side * 0.62, side * 0.22);
        });
        drawRotateGlyph(octx, rot.x, rot.y, rotR * 0.6);

        drawNameTag(layer, corners, k);
        octx.restore();
    }

    /* ----------------------------------------------------------------------
       Layer list. Built with createElement and textContent only, per the
       project's DOM-XSS prevention rule -- the filename is visitor-supplied
       text and never reaches innerHTML.
       ---------------------------------------------------------------------- */

    const ICONS = {
        eye: ["M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6-10-6-10-6Z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"],
        eyeOff: ["M4 4l16 16", "M9.6 9.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-1.2", "M6.3 6.6C3.8 8.2 2 12 2 12s3.8 6 10 6c1.7 0 3.2-.4 4.5-1.1", "M19.5 15.4C21.2 13.9 22 12 22 12s-3.8-6-10-6c-.7 0-1.4.1-2 .2"],
        upload: ["M12 16V4", "m7.5 8.5 4.5-4.5 4.5 4.5", "M4 20h16"]
    };

    function icon(paths) {
        const svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("focusable", "false");
        paths.forEach((d) => {
            const path = document.createElementNS(SVG_NS, "path");
            path.setAttribute("d", d);
            svg.appendChild(path);
        });
        return svg;
    }

    function iconButton(paths, label) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "layer-tool";
        btn.setAttribute("aria-label", label);
        btn.setAttribute("title", label);
        btn.appendChild(icon(paths));
        return btn;
    }

    /* One button per printable surface, built from the registry's own labels.
       Hidden and emptied below two surfaces, so every existing template is
       byte-identical to having no switch at all. */
    function renderZoneSwitch() {
        const count = zoneCount();
        while (zoneSwitch.firstChild) {
            zoneSwitch.removeChild(zoneSwitch.firstChild);
        }
        zoneSwitch.hidden = count < 2;
        if (count < 2) {
            return;
        }
        const config = PRODUCTS[currentProduct];
        const labels = (config && config.template && Array.isArray(config.template.zoneLabels))
            ? config.template.zoneLabels
            : [];
        for (let i = 0; i < count; i += 1) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "zone-tab";
            btn.setAttribute("aria-pressed", String(i === activeZone));
            /* textContent, never innerHTML -- the project's DOM-XSS rule
               applies to registry strings the same as to visitor input. */
            btn.textContent = (typeof labels[i] === "string" && labels[i])
                ? labels[i]
                : ("Card " + (i + 1));
            btn.addEventListener("click", (function (index) {
                return function () {
                    if (activeZone === index) {
                        return;
                    }
                    activeZone = index;
                    /* The selected layer lives on the surface being left, and
                       leaving it selected would point the size and rotation
                       controls at a row the list no longer shows. */
                    selectedId = null;
                    renderLayerList();
                    syncScaleControls();
                    syncLayerActions();
                    drawOverlay();
                };
            }(i)));
            zoneSwitch.appendChild(btn);
        }
    }

    function renderLayerList() {
        /* Both run here rather than at every product-change site: this is
           already called on init, on every layer edit and on a tray restore,
           so the switch cannot drift out of step with the template. */
        clampActiveZone();
        renderZoneSwitch();

        while (layerList.firstChild) {
            layerList.removeChild(layerList.firstChild);
        }

        /* The list is scoped to the surface being edited. Both surfaces still
           RENDER -- this is which one the controls act on. */
        const shown = zoneCount() < 2
            ? layers.slice()
            : layers.filter((layer) => layerZone(layer) === activeZone);

        /* Front-most first: the list reads top-to-bottom as front-to-back,
           the reverse of the paint order. */
        shown.slice().reverse().forEach((layer) => {
            const readable = TB.desanitize(layer.name);
            const li = document.createElement("li");
            li.className = "layer-row" +
                (layer.id === selectedId ? " is-selected" : "") +
                (layer.img ? "" : " is-pending") +
                (layer.visible ? "" : " is-hidden");

            const main = document.createElement("button");
            main.type = "button";
            main.className = "layer-main";
            main.setAttribute("aria-pressed", String(layer.id === selectedId));

            const thumb = document.createElement("span");
            thumb.className = "layer-thumb";
            if (layer.img) {
                const img = document.createElement("img");
                img.src = layer.img.src;
                img.alt = "";
                thumb.appendChild(img);
            }
            main.appendChild(thumb);

            const text = document.createElement("span");
            text.className = "layer-text";

            const nameEl = document.createElement("span");
            nameEl.className = "layer-name";
            nameEl.textContent = readable;
            text.appendChild(nameEl);

            if (!layer.img) {
                const note = document.createElement("span");
                note.className = "layer-note";
                note.textContent = "Re-upload to restore";
                text.appendChild(note);
            }

            main.appendChild(text);
            main.addEventListener("click", () => selectLayer(layer.id));
            li.appendChild(main);

            const tools = document.createElement("span");
            tools.className = "layer-tools";

            const eye = iconButton(
                layer.visible ? ICONS.eye : ICONS.eyeOff,
                (layer.visible ? "Hide " : "Show ") + readable
            );
            eye.addEventListener("click", () => {
                layer.visible = !layer.visible;
                persist();
                renderLayerList();
                draw();
            });
            tools.appendChild(eye);

            const replace = iconButton(ICONS.upload, "Replace " + readable);
            replace.addEventListener("click", () => requestUpload("replace", layer.id));
            tools.appendChild(replace);

            li.appendChild(tools);
            layerList.appendChild(li);
        });

        layerList.hidden = shown.length === 0;
        /* The full-width upload button is the empty state; once a stack
           exists the "+" in the section header is the way to extend it.
           Scoped to the surface, so an empty back card offers the same
           first-run affordance the front did.

           The CAP is not scoped, though, and both controls have to honour it.
           It bounds render cost, and every surface is drawn in one shader
           pass, so the total is what matters -- but with the list scoped, a
           full front card used to leave the back showing an empty list, a
           disabled "+", and an ENABLED upload button that dead-ended in an
           error message. Disabling both makes the state legible. */
        const atCap = layers.length >= MAX_LAYERS;
        uploadDesignBtn.hidden = shown.length > 0;
        uploadDesignBtn.disabled = atCap;
        addDesignBtn.disabled = atCap;
    }

    function syncLayerActions() {
        layerActions.hidden = !selectedLayer();
    }

    function selectLayer(id) {
        selectedId = id;
        /* A canvas click can land on a layer belonging to the other surface.
           Following it keeps the list, the controls and the selection talking
           about the same thing. */
        const picked = selectedLayer();
        if (picked) {
            activeZone = layerZone(picked);
        }
        renderLayerList();
        syncScaleControls();
        syncLayerActions();
        /* Only the chrome changed, so the product and layers underneath do
           not need repainting. */
        drawOverlay();
    }

    /* What the FIRST upload on a template opens at, as a fraction of the
       contain-fit inside the print zone.

       0.75 is right where the artwork is a print ON a product: a chest graphic
       that filled the whole print area edge to edge would not read as a
       t-shirt. It is wrong where the artwork IS the product -- a poster fills
       its frame, a banner fills its face -- and there the default left a
       visible margin the visitor had to drag out by hand every time. Templates
       say which they are with `designScale`; anything without it keeps 0.75.

       `"cover"` goes further and fills the opening whatever the artwork's
       aspect, which is what a frame actually wants: a landscape photo dropped
       into a portrait frame should look like a framed print, not a small
       picture floating in white. Everything downstream is unchanged -- this
       only picks the STARTING scale, the fit underneath stays contain, and the
       overflow is cropped by the zone clip that was already there. Nothing is
       destroyed: Design Size scales back down to reveal the whole image. */
    function firstLayerScale(img) {
        const config = PRODUCTS[currentProduct];
        const tpl = config && config.template;
        const want = tpl ? tpl.designScale : undefined;

        if (want === "cover" && img && img.width && img.height) {
            const zones = zonesOf(tpl);
            const area = zoneBounds(zones[Math.min(activeZone, zones.length - 1)]);
            const contain = Math.min(area.w / img.width, area.h / img.height);
            const cover = Math.max(area.w / img.width, area.h / img.height);
            /* paintLayers multiplies by the contain fit, so the scale that
               covers is just the ratio between the two. Equal aspects give
               exactly 1. */
            return contain > 0 ? clamp(cover / contain, MIN_SCALE, MAX_SCALE) : DEFAULT_SCALE;
        }
        return clamp(typeof want === "number" ? want : DEFAULT_SCALE, MIN_SCALE, MAX_SCALE);
    }

    function addLayer(img, name) {
        layerCounter += 1;
        /* Counted PER SURFACE, not across the mockup. On the two-card
           template the first design dropped on the back card is layer two
           overall, so counting globally gave it EXTRA_SCALE and a stagger
           offset -- it arrived small and off-centre instead of filling the
           card, which is the opposite of what the surface switch promises.
           Each surface gets its own first-upload treatment. */
        const onThisZone = layers.filter((layer) => layerZone(layer) === activeZone).length;
        /* Stagger each addition so a second upload reads as its own object
           instead of hiding exactly behind the first. */
        const step = (onThisZone % 4) * 24;
        layers.push({
            id: "L" + layerCounter + "-" + Date.now(),
            name: name,
            img: img,
            scale: onThisZone ? EXTRA_SCALE : firstLayerScale(img),
            offsetX: step,
            offsetY: step,
            rotation: 0,
            visible: true,
            /* The surface being edited. Always 0 on a single-zone template,
               so this is inert everywhere except the two-card mockup. */
            zone: activeZone,
            rect: null
        });
        selectedId = layers[layers.length - 1].id;
    }

    /* ----------------------------------------------------------------------
       Image upload with explicit mime-type validation. EVERY upload path on
       the page -- the "+", the empty-state button and each row's Replace --
       funnels through this one input and this one check, so no route can
       reach the canvas without it.
       ---------------------------------------------------------------------- */

    function requestUpload(mode, id) {
        uploadIntent = { mode: mode, id: id || null };
        /* Clearing first means re-picking the same file still fires change. */
        fileInput.value = "";
        fileInput.click();
    }

    fileInput.addEventListener("change", () => {
        fileError.textContent = "";
        const file = fileInput.files && fileInput.files[0];
        if (!file) {
            return;
        }

        if (!/^image\//.test(file.type)) {
            fileError.textContent = "That file is not an image. Please choose a JPG, PNG, or WebP file.";
            fileInput.value = "";
            return;
        }

        if (uploadIntent.mode === "add" && layers.length >= MAX_LAYERS) {
            /* "on one mockup", not "on this card": the cap is across every
               surface, and on a two-card template the visitor is looking at
               one of them. */
            fileError.textContent = zoneCount() > 1
                ? "That is the maximum number of designs on one mockup, counted across both surfaces."
                : "That is the maximum number of designs on one mockup.";
            fileInput.value = "";
            return;
        }

        const name = TB.sanitize(file.name).slice(0, 60) || "design";

        const reader = new FileReader();
        reader.addEventListener("load", () => {
            const img = new Image();
            img.addEventListener("load", () => {
                if (uploadIntent.mode === "replace") {
                    const target = layers.filter((layer) => layer.id === uploadIntent.id)[0];
                    if (target) {
                        /* Size, offset and rotation are deliberately kept: a
                           replace is a swap of artwork, not of placement. */
                        target.img = img;
                        target.name = name;
                        selectedId = target.id;
                    }
                } else {
                    addLayer(img, name);
                }
                fileInput.value = "";
                persist();
                renderLayerList();
                syncScaleControls();
                syncLayerActions();
                draw();
            });
            img.addEventListener("error", () => {
                fileError.textContent = "That image could not be decoded. Please try a different file.";
                fileInput.value = "";
            });
            img.src = reader.result;
        });
        reader.readAsDataURL(file);
    });

    addDesignBtn.addEventListener("click", () => requestUpload("add", null));
    uploadDesignBtn.addEventListener("click", () => requestUpload("add", null));

    actReplace.addEventListener("click", () => {
        const layer = selectedLayer();
        if (layer) {
            requestUpload("replace", layer.id);
        }
    });

    actRemove.addEventListener("click", () => {
        const layer = selectedLayer();
        if (!layer) {
            return;
        }
        layers = layers.filter((entry) => entry.id !== layer.id);
        selectedId = layers.length ? layers[layers.length - 1].id : null;
        fileError.textContent = "";
        persist();
        renderLayerList();
        syncScaleControls();
        syncLayerActions();
        draw();
    });

    /* Resize has no separate mode: the handles are already live on the
       selected layer, so this points at the numeric control for anyone who
       would rather type a size than drag a corner. */
    actResize.addEventListener("click", () => {
        if (!selectedLayer()) {
            return;
        }
        scaleNumber.focus();
        scaleNumber.select();
    });

    /* ----------------------------------------------------------------------
       Colour: one free HSV picker, reachable two ways -- the trigger opens
       the full popover, and the hue strip under it rotates the colour in
       place. Both write to the same state the canvas reads. The colorway
       quick-pick row that used to sit here was removed on August 25, 2026.
       ---------------------------------------------------------------------- */

    function activeColor(config) {
        if (!config.colors) {
            return null;
        }
        if (currentColor === CUSTOM_COLOR) {
            return { name: "Custom", hex: customHex, outline: deriveOutline(customHex) };
        }
        if (!config.colors[currentColor]) {
            currentColor = Object.keys(config.colors)[0];
        }
        return config.colors[currentColor];
    }

    function activeHex() {
        const config = PRODUCTS[currentProduct];
        const color = activeColor(config);
        return color ? color.hex : customHex;
    }

    /* The product's own colourways, for the picker's preset grid.

       These are here for the same reason the background's Transparent chip is:
       a state no hex can express would otherwise have no way back. `original`
       SKIPS the tint rather than painting a colour, so typing #E9E9EC is not
       "As photographed" -- it dyes the garment its own photographed shade,
       which is a different render. A heather is not a hex at all: the dye is
       mixed toward undyed fibre and the weave is screened back over it.

       Before this existed the colourway row had been removed (August 25, 2026)
       and nothing replaced it, so every route into the picker went through
       setCustomColor and set currentColor to CUSTOM. The eight colourways the
       shirt declares were unreachable, "As photographed" was one-way, and the
       heather fractions -- and the grain maps that serve them, 2.3MB across
       the shirt and the cap -- were shipped code that nothing could run. */
    function colorwayList() {
        const config = PRODUCTS[currentProduct];
        if (!config || !config.colors) {
            return [];
        }
        return Object.keys(config.colors).map((key) => {
            const c = config.colors[key];
            const heather = typeof c.heather === "number" ? clamp(c.heather, 0, 1) : 0;
            return {
                key: key,
                name: c.name || key,
                /* The chip shows what the visitor will GET. A heather swatch
                   painted at full dye strength would promise a colour the
                   render never produces. */
                swatch: heather > 0 ? mixToward(c.hex, NATURAL_FIBRE, heather) : c.hex
            };
        });
    }

    function setColorway(key) {
        const config = PRODUCTS[currentProduct];
        if (!config || !config.colors || !config.colors[key]) {
            return false;
        }
        currentColor = key;
        syncColorUI();
        persist();
        draw();
        return true;
    }

    /* The colourway swatch row this used to build is gone (August 25, 2026);
       what is left is the one job that could not go with it. A photographic
       template has no colorway concept, so the whole field disappears rather
       than offering a colour control over a photograph.

       The shipped colorways did not disappear with their buttons. The
       product still OPENS on its default one -- that is what gives the drawn
       garments their hand-picked outline colour -- and every hex those
       swatches offered is a click away in the picker's preset grid, which is
       why the row was cut: it was a second route to colours the dropdown
       already carried, at the cost of a band of panel height. */
    function syncColorField() {
        const config = PRODUCTS[currentProduct];
        if (colorField) {
            colorField.hidden = !config.colors;
        }
    }

    /* ----------------------------------------------------------------------
       The colour picker component.

       ONE implementation, two instances (August 24, 2026): the product's
       colourway picker, and the background picker added alongside it. It was
       a single hard-wired picker reading module state directly until the
       background needed the same control; generalising it was preferred to a
       second copy of 150 lines of gradient tracks, hex/RGB plumbing and
       popover lifecycle.

       What is NOT in here is as deliberate as what is. The canvas's
       accessible label is specific to the colourway path, and the two
       instances hold genuinely different state -- a colourway key plus a
       custom hex on one side, a hex or null on the other. Pushing those
       through the factory would have meant more injection points than shared
       code, which is a worse abstraction than two small call sites. The
       factory owns exactly the parts that are identical: the popover, the
       saturation/value square, the hue strips, the hex and RGB fields, the
       presets and the eyedropper.

       Each instance keeps its own `hue`. It was module-level state when there
       was one picker; shared between two it would make the background's hue
       strip jump whenever the garment colour changed. The product picker now
       drives TWO strips off that one value (August 25, 2026) -- see
       `hueTracks` -- which is the same reason again, one level down: two
       views of one hue, never two hues.

       nodes    the elements this instance drives.
       options  getHex()            the colour to display, or null
                setHex(hex, skip)   commit a colour; returns truthy on success
       ---------------------------------------------------------------------- */

    function trackRatio(el, evt) {
        const rect = el.getBoundingClientRect();
        return {
            x: rect.width ? clamp((evt.clientX - rect.left) / rect.width, 0, 1) : 0,
            y: rect.height ? clamp((evt.clientY - rect.top) / rect.height, 0, 1) : 0
        };
    }

    function bindTrack(el, apply) {
        if (!el) {
            return;
        }
        let active = false;
        el.addEventListener("pointerdown", (evt) => {
            active = true;
            el.setPointerCapture(evt.pointerId);
            apply(evt);
            evt.preventDefault();
        });
        el.addEventListener("pointermove", (evt) => {
            if (active) {
                apply(evt);
            }
        });
        const stop = () => { active = false; };
        el.addEventListener("pointerup", stop);
        el.addEventListener("pointercancel", stop);
    }

    function createColorPicker(nodes, options) {
        let hue = 0;
        /* Rebuilt only by buildPresets(); sync() just re-marks which is
           active, because sync() runs on every pointermove of the hue track
           and tearing down 36 buttons per move would be gratuitous. */
        let colorwayChips = [];

        /* Two strips, one hue. The popover's, and -- on the product picker --
           the one standing in the panel where the swatch row used to be. They
           are the same control at two sizes, so they share this instance's
           `hue`, the handler below and the repaint in sync(); neither knows
           the other exists. An instance given only a popover strip simply has
           a one-entry list. */
        const hueTracks = [
            { track: nodes.hue, thumb: nodes.hueThumb },
            { track: nodes.hueInline, thumb: nodes.hueInlineThumb }
        ].filter((entry) => !!entry.track);

        function commit(hex, skip) {
            return options.setHex(hex, skip);
        }

        /* Repaints every part of this picker from its current colour. `skip`
           names an input the visitor is currently typing in, which must not be
           rewritten underneath the caret. */
        function sync(skip) {
            markActiveColorway();
            const hex = options.getHex();
            /* No colour at all (the background's Transparent state): the
               gradients keep their last position rather than snapping, and
               the fields empty. Painting white here would say the background
               IS white, which is a different export. */
            const rgb = hexToRgb(hex) || { r: 255, g: 255, b: 255 };
            const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);

            /* A greyscale colour carries no meaningful hue, so the strip keeps
               its last position instead of snapping to red. */
            if (hsv.s > 0.001 && hsv.v > 0.001) {
                hue = hsv.h;
            }

            if (nodes.sv) {
                nodes.sv.style.setProperty("--picker-hue", String(Math.round(hue)));
            }
            if (nodes.svThumb) {
                nodes.svThumb.style.left = (hsv.s * 100) + "%";
                nodes.svThumb.style.top = ((1 - hsv.v) * 100) + "%";
                nodes.svThumb.style.backgroundColor = hex || "transparent";
            }
            hueTracks.forEach((track) => {
                if (track.thumb) {
                    track.thumb.style.left = ((hue / 360) * 100) + "%";
                }
            });

            const fields = hex ? { hex: hex, r: rgb.r, g: rgb.g, b: rgb.b }
                : { hex: "", r: "", g: "", b: "" };
            if (nodes.inHex && skip !== nodes.inHex) { nodes.inHex.value = fields.hex; }
            if (nodes.inR && skip !== nodes.inR) { nodes.inR.value = String(fields.r); }
            if (nodes.inG && skip !== nodes.inG) { nodes.inG.value = String(fields.g); }
            if (nodes.inB && skip !== nodes.inB) { nodes.inB.value = String(fields.b); }
        }

        function buildPresets() {
            if (!nodes.presets) {
                return;
            }
            while (nodes.presets.firstChild) {
                nodes.presets.removeChild(nodes.presets.firstChild);
            }

            /* "No colour at all" as the first preset, for the instance that
               has such a state -- the background's Transparent (August 25,
               2026). It moved in here when the quick-pick row that used to
               carry it was removed: every other colour on that row is in the
               grid below, but this one is not a colour and no hex can express
               it, so dropping the row without moving it would have stranded
               the default state with no way back. */
            if (options.allowClear) {
                const clear = document.createElement("button");
                clear.type = "button";
                clear.className = "color-preset swatch-transparent";
                clear.setAttribute("aria-label", "Transparent");
                clear.setAttribute("title", "Transparent");
                clear.addEventListener("click", () => commit(null));
                nodes.presets.appendChild(clear);
            }

            /* Native colour sampling where the browser offers it (Chromium's
               EyeDropper). No polyfill and no button at all elsewhere: a
               control that silently does nothing is worse than one that is
               absent. */
            if (window.EyeDropper) {
                const drop = document.createElement("button");
                drop.type = "button";
                drop.className = "color-eyedropper";
                drop.setAttribute("aria-label", "Pick a colour from the screen");
                drop.setAttribute("title", "Pick a colour from the screen");
                drop.appendChild(icon([
                    "m2 22 4-1 11-11-3-3L3 18l-1 4Z",
                    "m15 5 4-4 4 4-4 4",
                    "m13 7 4 4"
                ]));
                drop.addEventListener("click", () => {
                    new window.EyeDropper().open().then((result) => {
                        commit(result.sRGBHex);
                    }, () => {
                        /* Dismissed with Escape: nothing to do. */
                    });
                });
                nodes.presets.appendChild(drop);
            }

            /* The product's own colourways first, named, ahead of the
               generic hexes. Only the product picker supplies these. */
            colorwayChips = [];
            (options.colorways ? options.colorways() : []).forEach((cw) => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "color-preset color-colorway";
                btn.style.backgroundColor = cw.swatch;
                btn.setAttribute("aria-label", cw.name);
                btn.setAttribute("title", cw.name);
                btn.addEventListener("click", () => options.setColorway(cw.key));
                colorwayChips.push({ btn: btn, key: cw.key });
                nodes.presets.appendChild(btn);
            });

            COLOR_PRESETS.forEach((hex) => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "color-preset";
                btn.style.backgroundColor = hex;
                btn.setAttribute("aria-label", hex);
                btn.setAttribute("title", hex);
                btn.addEventListener("click", () => commit(hex));
                nodes.presets.appendChild(btn);
            });
            markActiveColorway();
        }

        /* Which colourway is selected, if any. A custom hex selects none, so
           the grid correctly shows nothing pressed once the visitor picks a
           colour of their own. */
        function markActiveColorway() {
            const active = options.activeColorway ? options.activeColorway() : null;
            colorwayChips.forEach((chip) => {
                chip.btn.setAttribute("aria-pressed", String(chip.key === active));
            });
        }

        /* --- popover open/close --- */

        function onOutside(evt) {
            if (nodes.popover.contains(evt.target) || nodes.trigger.contains(evt.target)) {
                return;
            }
            close();
        }

        function onKey(evt) {
            if (evt.key === "Escape") {
                close();
                nodes.trigger.focus();
            }
        }

        function open() {
            nodes.popover.hidden = false;
            nodes.trigger.setAttribute("aria-expanded", "true");
            sync();
            document.addEventListener("pointerdown", onOutside, true);
            document.addEventListener("keydown", onKey, true);
        }

        function close() {
            nodes.popover.hidden = true;
            nodes.trigger.setAttribute("aria-expanded", "false");
            document.removeEventListener("pointerdown", onOutside, true);
            document.removeEventListener("keydown", onKey, true);
        }

        if (nodes.trigger && nodes.popover) {
            nodes.trigger.addEventListener("click", () => {
                if (nodes.popover.hidden) {
                    open();
                } else {
                    close();
                }
            });
        }

        /* --- gradient tracks --- */

        bindTrack(nodes.sv, (evt) => {
            const r = trackRatio(nodes.sv, evt);
            const rgb = hsvToRgb(hue, r.x, 1 - r.y);
            commit(rgbToHex(rgb.r, rgb.g, rgb.b));
        });

        hueTracks.forEach((entry) => {
            bindTrack(entry.track, (evt) => {
                hue = trackRatio(entry.track, evt).x * 360;
                const current = hexToRgb(options.getHex()) || { r: 255, g: 255, b: 255 };
                const hsv = rgbToHsv(current.r, current.g, current.b);
                /* A pure white or black start has no saturation to rotate, so
                   the new hue would produce the same greyscale colour and the
                   strip would look broken. Fall back to a fully saturated
                   sample. */
                const s = hsv.s > 0.001 ? hsv.s : 1;
                const v = hsv.v > 0.001 ? hsv.v : 1;
                const rgb = hsvToRgb(hue, s, v);
                commit(rgbToHex(rgb.r, rgb.g, rgb.b));
            });
        });

        /* --- hex / R / G / B --- */

        if (nodes.inHex) {
            nodes.inHex.addEventListener("input", () => {
                if (hexToRgb(nodes.inHex.value)) {
                    commit(nodes.inHex.value, nodes.inHex);
                }
            });
            nodes.inHex.addEventListener("blur", () => sync());
        }

        [nodes.inR, nodes.inG, nodes.inB].forEach((input) => {
            if (!input) {
                return;
            }
            input.addEventListener("input", () => {
                const r = clamp(parseInt(nodes.inR.value, 10) || 0, 0, 255);
                const g = clamp(parseInt(nodes.inG.value, 10) || 0, 0, 255);
                const b = clamp(parseInt(nodes.inB.value, 10) || 0, 0, 255);
                commit(rgbToHex(r, g, b), input);
            });
            input.addEventListener("blur", () => sync());
        });

        return { sync: sync, buildPresets: buildPresets, close: close };
    }

    const productPicker = createColorPicker({
        trigger: colorTrigger, popover: colorPopover,
        sv: svArea, svThumb: svThumb, hue: hueArea, hueThumb: hueThumb,
        hueInline: colorStrip, hueInlineThumb: colorStripThumb,
        inHex: inHex, inR: inR, inG: inG, inB: inB, presets: presetGrid
    }, {
        getHex: () => activeHex(),
        setHex: (hex, skip) => setCustomColor(hex, skip),
        /* Only the product picker has named colourways; the background is a
           plain colour with a Transparent state and no palette of its own. */
        colorways: () => colorwayList(),
        setColorway: (key) => setColorway(key),
        activeColorway: () => currentColor
    });

    /* Repaints the whole colourway UI: the picker's own nodes, plus the two
       things outside it that track the same value. */
    function syncColorUI(skip) {
        /* Every route that changes the colourway lands here -- swatch, hex
           field, RGB fields, picker, eyedropper -- so it is the one place the
           canvas label needs re-deriving. */
        syncCanvasLabel();
        productPicker.sync(skip);

        const hex = activeHex();
        if (colorDot) {
            colorDot.style.backgroundColor = hex;
        }
        if (colorHexLabel) {
            colorHexLabel.textContent = hex;
        }
    }

    function setCustomColor(hex, skip) {
        const rgb = hexToRgb(hex);
        if (!rgb) {
            return false;
        }
        customHex = rgbToHex(rgb.r, rgb.g, rgb.b);
        currentColor = CUSTOM_COLOR;
        syncColorUI(skip);
        persist();
        draw();
        return true;
    }

    /* ----------------------------------------------------------------------
       Background colour (August 24, 2026).

       Only offered where the mockup HAS a blank background:

         - the four drawn products, which paint onto a cleared canvas, so
           everything around the garment is transparent and exports that way;
         - a photographic template that declares `background: true`.

       Eligibility is declared, never inferred. wood-a4's base photograph is
       transparent inside its print window -- that transparency IS the mask
       the design shows through -- so an alpha test would qualify it and paint
       the chosen colour behind the poster.

       Distinct from `backing` in drawPhoto(), the white paper sheet behind
       artwork that does not fill a frame's window. That stays white whatever
       is chosen here.

       null is Transparent and is the default. Choosing nothing must leave the
       exported PNG byte-identical to what it was before this existed.
       ---------------------------------------------------------------------- */

    function backgroundEligible(config) {
        if (!config) {
            return false;
        }
        return config.type === "photo"
            ? !!(config.template && config.template.background === true)
            : true;
    }

    const backgroundPicker = createColorPicker({
        trigger: bgTrigger, popover: bgPopover,
        sv: bgSvArea, svThumb: bgSvThumb, hue: bgHueArea, hueThumb: bgHueThumb,
        hueInline: bgStrip, hueInlineThumb: bgStripThumb,
        inHex: bgInHex, inR: bgInR, inG: bgInG, inB: bgInB, presets: bgPresetGrid
    }, {
        getHex: () => bgHex,
        setHex: (hex, skip) => setBackground(hex, skip),
        /* Only this instance has a "no colour" state to return to. */
        allowClear: true
    });

    function setBackground(hex, skip) {
        if (hex === null) {
            bgHex = null;
        } else {
            const rgb = hexToRgb(hex);
            if (!rgb) {
                return false;
            }
            bgHex = rgbToHex(rgb.r, rgb.g, rgb.b);
        }
        syncBackgroundUI(skip);
        persist();
        draw();
        return true;
    }

    function syncBackgroundUI(skip) {
        /* The whole panel disappears for a product with a background of its
           own, rather than offering a control that would do nothing. */
        if (bgField) {
            bgField.hidden = !backgroundEligible(PRODUCTS[currentProduct]);
        }
        backgroundPicker.sync(skip);

        if (bgDot) {
            bgDot.classList.toggle("is-transparent", !bgHex);
            bgDot.style.backgroundColor = bgHex || "";
        }
        if (bgHexLabel) {
            bgHexLabel.textContent = bgHex || "Transparent";
        }
    }

    /* The colour actually painted behind everything, or null. Read by both
       render paths, so an ineligible product can never pick up a background
       left over from an eligible one. */
    function activeBackground() {
        return backgroundEligible(PRODUCTS[currentProduct]) ? bgHex : null;
    }

    /* ----------------------------------------------------------------------
       Design size. The slider, the numeric field and the corner handles all
       write the SELECTED layer's scale; nothing here is global any more.
       ---------------------------------------------------------------------- */

    function syncScaleControls() {
        const layer = selectedLayer();
        const enabled = !!(layer && layer.img);
        scaleInput.disabled = !enabled;
        scaleNumber.disabled = !enabled;
        scaleReset.disabled = !enabled;

        const pct = Math.round((layer ? layer.scale : DEFAULT_SCALE) * 100);
        scaleInput.value = String(pct);
        scaleNumber.value = String(pct);
        scaleOutput.textContent = pct + "%";
    }

    function applyScalePercent(pct, skip) {
        const layer = selectedLayer();
        if (!layer) {
            return;
        }
        layer.scale = clamp(pct / 100, MIN_SCALE, MAX_SCALE);
        const rounded = Math.round(layer.scale * 100);
        if (skip !== scaleInput) { scaleInput.value = String(rounded); }
        if (skip !== scaleNumber) { scaleNumber.value = String(rounded); }
        scaleOutput.textContent = rounded + "%";
        persist();
        draw();
    }

    scaleInput.addEventListener("input", () => {
        applyScalePercent(Number(scaleInput.value), scaleInput);
    });

    scaleNumber.addEventListener("input", () => {
        const value = parseInt(scaleNumber.value, 10);
        if (!isNaN(value)) {
            applyScalePercent(value, scaleNumber);
        }
    });

    scaleNumber.addEventListener("blur", syncScaleControls);

    scaleReset.addEventListener("click", () => {
        const layer = selectedLayer();
        if (!layer) {
            return;
        }
        layer.scale = DEFAULT_SCALE;
        layer.rotation = 0;
        layer.offsetX = 0;
        layer.offsetY = 0;
        syncScaleControls();
        persist();
        draw();
    });

    /* ----------------------------------------------------------------------
       Direct manipulation. One pointer pipeline drives move, resize and
       rotate: which one is chosen depends only on where the press landed --
       the rotate handle, a corner, a layer's body, or empty space.
       ---------------------------------------------------------------------- */

    function getCanvasPoint(evt) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (evt.clientX - rect.left) * scaleX,
            y: (evt.clientY - rect.top) * scaleY
        };
    }

    /* Which grab, if any, a point lands on. Handles beat bodies, and the
       front-most layer beats the ones behind it. */
    function hitTest(pt, k) {
        const tol = HANDLE_HIT * k;
        const sel = selectedLayer();

        if (sel && sel.rect && sel.visible) {
            if (distance(pt, rotateHandlePoint(sel.rect, k)) <= tol) {
                return { mode: "rotate", layer: sel };
            }
            const corners = rectCorners(sel.rect);
            for (let i = 0; i < corners.length; i += 1) {
                if (distance(pt, corners[i]) <= tol) {
                    return { mode: "resize", layer: sel };
                }
            }
        }

        for (let i = layers.length - 1; i >= 0; i -= 1) {
            const layer = layers[i];
            if (layer.rect && layer.visible && hitsBody(layer.rect, pt)) {
                return { mode: "move", layer: layer };
            }
        }
        return null;
    }

    canvas.addEventListener("pointerdown", (evt) => {
        const k = canvasPerScreenPx();
        const pt = getCanvasPoint(evt);
        const hit = hitTest(pt, k);

        if (!hit) {
            if (selectedId !== null) {
                selectLayer(null);
            }
            return;
        }

        if (hit.layer.id !== selectedId) {
            selectLayer(hit.layer.id);
        }

        const rect = hit.layer.rect;
        const center = { x: rect.cx, y: rect.cy };
        drag = {
            mode: hit.mode,
            layer: hit.layer,
            start: pt,
            center: center,
            startOffset: { x: hit.layer.offsetX, y: hit.layer.offsetY },
            startScale: hit.layer.scale,
            startDistance: distance(pt, center),
            startRotation: hit.layer.rotation,
            startAngle: Math.atan2(pt.y - center.y, pt.x - center.x)
        };

        canvas.setPointerCapture(evt.pointerId);
        canvas.classList.add("is-dragging");
        evt.preventDefault();
    });

    canvas.addEventListener("pointermove", (evt) => {
        const k = canvasPerScreenPx();
        const pt = getCanvasPoint(evt);

        if (!drag) {
            const hit = hitTest(pt, k);
            canvas.style.cursor = hit
                ? (hit.mode === "move" ? "grab" : (hit.mode === "rotate" ? "crosshair" : "nwse-resize"))
                : "default";
            return;
        }

        if (drag.mode === "move") {
            drag.layer.offsetX = drag.startOffset.x + (pt.x - drag.start.x);
            drag.layer.offsetY = drag.startOffset.y + (pt.y - drag.start.y);
        } else if (drag.mode === "resize") {
            if (drag.startDistance > 0.5) {
                applyScalePercent(
                    (drag.startScale * (distance(pt, drag.center) / drag.startDistance)) * 100
                );
                return;
            }
        } else if (drag.mode === "rotate") {
            const angle = Math.atan2(pt.y - drag.center.y, pt.x - drag.center.x);
            let next = drag.startRotation + (angle - drag.startAngle);
            if (evt.shiftKey) {
                const step = Math.PI / 12;
                next = Math.round(next / step) * step;
            }
            drag.layer.rotation = next;
        }
        draw();
    });

    function endDrag() {
        if (!drag) {
            return;
        }
        drag = null;
        canvas.classList.remove("is-dragging");
        persist();
    }

    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);

    /* Handle sizes are quoted in screen pixels, so the chrome has to be
       repainted whenever the canvas's displayed width changes -- on a window
       resize, and on the mobile tab switch, which changes it without firing
       one. */
    window.addEventListener("resize", drawOverlay);
    const tabPreview = document.getElementById("tab-preview");
    if (tabPreview) {
        tabPreview.addEventListener("click", () => window.requestAnimationFrame(drawOverlay));
    }

    /* ----------------------------------------------------------------------
       Real-time retention of non-image settings in localStorage.
       ---------------------------------------------------------------------- */

    function persist() {
        TB.storageSet(STORAGE_KEY, {
            product: currentProduct,
            color: currentColor,
            customHex: customHex,
            /* null for transparent. Validated on the way back in, never
               trusted as a fill style. */
            bg: bgHex,
            layers: layers.map((layer) => ({
                name: layer.name,
                scale: layer.scale,
                offsetX: layer.offsetX,
                offsetY: layer.offsetY,
                rotation: layer.rotation,
                visible: layer.visible,
                zone: layerZone(layer)
            })),
            label: TB.sanitize(labelInput.value)
        });
        TB.markSaved();
    }

    labelInput.addEventListener("input", persist);

    /* ----------------------------------------------------------------------
       "My Mockups" tray: a one-click way to collect several product
       renders for a design before downloading them for a store listing.
       Rendered with createElement/textContent only, per the project's
       DOM-XSS prevention rule.
       ---------------------------------------------------------------------- */

    /* The pane shows ONE of its two panels (August 25, 2026). Both used to be
       in the flow, the tray under the canvas, which made the pane taller than
       any viewport: the render was never fully visible and neither was the
       collection. `hidden` rather than a class, so the panel that is not
       showing is out of the accessibility tree and out of the tab order. */
    function showView(index) {
        viewTabs.forEach((tab, i) => {
            if (!tab) { return; }
            tab.setAttribute("aria-selected", String(i === index));
            tab.classList.toggle("is-active", i === index);
        });
        viewPanels.forEach((panel, i) => {
            if (panel) { panel.hidden = i !== index; }
        });
    }

    viewTabs.forEach((tab, i) => {
        if (tab) { tab.addEventListener("click", () => showView(i)); }
    });

    function renderTray() {
        while (trayGrid.firstChild) {
            trayGrid.removeChild(trayGrid.firstChild);
        }
        trayEmpty.hidden = trayItems.length > 0;

        /* The count on the tab is the only sign the other panel holds
           anything, now that it is hidden until asked for. */
        if (trayCount) {
            trayCount.textContent = String(trayItems.length);
            trayCount.hidden = trayItems.length === 0;
        }

        trayItems.forEach((item) => {
            const card = document.createElement("div");
            card.className = "tray-item";
            if (item.id === activeTrayId) {
                card.classList.add("is-active");
            }

            /* The thumbnail IS the control (August 25, 2026). The card used to
               carry a caption and two buttons under it; what a saved mockup is
               for is being looked at and gone back to, and the label reads
               better as the button's name than as a line of text under every
               tile. Download went with the caption -- clicking a mockup loads
               it, and the panel above exports it at any size or format, which
               the per-item button could not. */
            const open = document.createElement("button");
            open.type = "button";
            open.className = "tray-open";
            open.setAttribute("data-tray-id", item.id);
            open.setAttribute("data-tip", TB.desanitize(item.label));
            open.setAttribute("aria-label", "Open " + TB.desanitize(item.label));

            /* Which tile is loaded, for anyone who cannot see the border and
               the inset ring that say so. Without this the grid announces
               "Open Red tee, Open Navy tee" with nothing to distinguish the
               one already on the canvas, and the tab stops being a set you
               can tell your position in. Set only on the active tile: the
               attribute is a singular "this is the current one", so writing
               aria-current="false" everywhere else would be noise. */
            if (item.id === activeTrayId) {
                open.setAttribute("aria-current", "true");
            }

            const img = document.createElement("img");
            img.className = "tray-thumb";
            img.src = item.thumb;
            img.alt = "";
            open.appendChild(img);
            open.addEventListener("click", () => openTrayItem(item.id));
            card.appendChild(open);

            const rmBtn = document.createElement("button");
            rmBtn.type = "button";
            rmBtn.className = "tray-remove";
            rmBtn.setAttribute("aria-label", "Remove " + TB.desanitize(item.label));
            rmBtn.setAttribute("data-tip", "Remove");
            rmBtn.appendChild(icon(["M6 6l12 12", "M18 6 6 18"]));
            rmBtn.addEventListener("click", () => {
                trayItems = trayItems.filter((entry) => entry.id !== item.id);
                if (activeTrayId === item.id) {
                    activeTrayId = null;
                }
                renderTray();
            });
            card.appendChild(rmBtn);

            trayGrid.appendChild(card);
        });
    }

    /* ----------------------------------------------------------------------
       Saving and reopening a mockup.

       A tray entry holds the STATE that produced it, not only the picture:
       the colourway, the background and every layer's placement, plus a
       reference to each layer's bitmap. That is what makes the tab a set of
       mockups a visitor switches between rather than a strip of screenshots
       -- clicking one puts the editor back where it was, and the live preview
       is genuinely live rather than a saved image pretending to be one.

       The bitmaps are shared by reference and everything else is copied.
       Sharing the bitmap is safe because a layer never mutates its image;
       copying the rest is what stops editing a reopened mockup rewriting the
       entry it came from. Copied again on the way out for the same reason.

       Session-scoped, exactly as the tray always was: the images are held in
       memory and never written to storage, so a reload empties the tab.
       ---------------------------------------------------------------------- */

    let activeTrayId = null;

    function copyLayers(list) {
        return list.map((layer) => ({
            id: layer.id,
            name: layer.name,
            img: layer.img,
            scale: layer.scale,
            offsetX: layer.offsetX,
            offsetY: layer.offsetY,
            rotation: layer.rotation,
            visible: layer.visible,
            /* The surface the layer belongs to. Omitting it here silently
               collapsed a two-card mockup onto card 1 on reopen: the tray
               round-trips through this function, layerZone() reads a missing
               value as 0, and the back design landed on top of the front one.
               persist() and the restore path both carry it; this was the one
               copy that did not. */
            zone: layerZone(layer),
            rect: null
        }));
    }

    function snapshotState() {
        return {
            color: currentColor,
            customHex: customHex,
            bg: bgHex,
            layers: copyLayers(layers)
        };
    }

    function openTrayItem(id) {
        const item = trayItems.find((entry) => entry.id === id);
        if (!item || !item.state) {
            return;
        }

        currentColor = item.state.color;
        customHex = item.state.customHex;
        bgHex = item.state.bg;
        layers = copyLayers(item.state.layers);
        selectedId = layers.length ? layers[layers.length - 1].id : null;
        activeTrayId = id;

        /* The label follows the mockup, so exporting straight after reopening
           writes the file under the name it was saved with. */
        labelInput.value = TB.desanitize(item.label);

        syncColorUI();
        syncBackgroundUI();
        renderLayerList();
        syncScaleControls();
        syncLayerActions();
        syncCanvasLabel();
        renderTray();
        persist();
        draw();

        /* Back to the canvas, which is the whole point of the click. */
        showView(0);
    }

    let trayCounter = 0;

    addToTrayBtn.addEventListener("click", () => {
        if (!layers.some((layer) => layer.img && layer.visible)) {
            fileError.textContent = "Upload a design before adding it to your mockups.";
            return;
        }
        fileError.textContent = "";

        trayCounter += 1;
        const typed = labelInput.value.trim();
        const fallback = PRODUCTS[currentProduct].label + " mockup " + trayCounter;
        const item = {
            id: Date.now() + "-" + trayCounter,
            label: TB.sanitize(typed || fallback),
            /* Reads the product canvas alone, so no selection chrome can
               reach the thumbnail. */
            thumb: canvas.toDataURL("image/png"),
            /* What makes this reopenable rather than just viewable. */
            state: snapshotState()
        };
        trayItems.push(item);
        activeTrayId = item.id;
        renderTray();
        /* Switch to the collection. With the tray hidden behind a tab, a
           silent add looks like a button that did nothing; this shows the
           visitor the render they just saved, and one click goes back. */
        showView(1);
    });

    /* ----------------------------------------------------------------------
       Export: a format and a size, still a local data stream (August 25,
       2026). It was one button that wrote the canvas out at its own
       resolution as a PNG, which is a fine default and a poor only option --
       a listing image wants a smaller file, and a print-on-demand upload
       often wants JPG.

       THE SIZES ARE DERIVED, NEVER HARDCODED. The canvas is 1000x1000 for a
       drawn product, 1024x1536 for the model photograph and 2000x2000 for the
       wood frame, so a fixed ladder like 1600x2000 would distort two of the
       three and upscale the third. Full size, half and quarter keep every
       product's own proportions and can never invent detail the canvas does
       not have. Each row states the real pixels, so the visitor is choosing a
       size rather than a word.
       ---------------------------------------------------------------------- */

    const EXPORT_TIERS = [
        { name: "Full size", divisor: 1 },
        { name: "Half", divisor: 2 },
        { name: "Quarter", divisor: 4 }
    ];

    let exportFormat = "png";

    function exportName() {
        /* Mockup Label names the download (August 24, 2026). It named only
           the tray caption before, so a visitor who filled it in and pressed
           Download got "templatebox-mockup.png" regardless -- and since the
           bar's own name input was removed when the bar gained navigation,
           this field is the only place left to name the work. Empty, it falls
           back to what the file has always been called. The size is NOT in
           the name: a visitor exporting a second size wants it beside the
           first under the name they chose, not one the editor invented. */
        return (TB.fileSlug(labelInput.value) || "templatebox-mockup") +
            (exportFormat === "jpg" ? ".jpg" : ".png");
    }

    function exportAt(width, height) {
        const out = document.createElement("canvas");
        out.width = Math.max(1, Math.round(width));
        out.height = Math.max(1, Math.round(height));
        const octx = out.getContext("2d");

        /* JPEG has no alpha channel. Drawn straight, every transparent pixel
           in the surround comes out BLACK, which on a product exported with
           no background is most of the image. Flattening onto white is what
           the format can actually carry, and it matches what a listing page
           shows behind a JPG anyway. PNG keeps the transparency, which is why
           it stays the default. */
        if (exportFormat === "jpg") {
            octx.fillStyle = "#FFFFFF";
            octx.fillRect(0, 0, out.width, out.height);
        }

        /* The product canvas alone. #mockup-overlay carries the selection
           box, the corner handles and the layer tag, and reading it here is
           exactly how those would get baked into a visitor's file. */
        octx.imageSmoothingQuality = "high";
        octx.drawImage(canvas, 0, 0, out.width, out.height);

        const link = document.createElement("a");
        link.href = exportFormat === "jpg"
            ? out.toDataURL("image/jpeg", 0.92)
            : out.toDataURL("image/png");
        link.download = exportName();
        link.click();
    }

    /* Rebuilt every time the panel opens, not once at startup: a photographic
       template sizes the canvas from its own base image, and that image loads
       after this script runs. */
    function renderExportSizes() {
        if (!dlSizes) {
            return;
        }
        while (dlSizes.firstChild) {
            dlSizes.removeChild(dlSizes.firstChild);
        }

        EXPORT_TIERS.forEach((tier) => {
            const w = Math.round(canvas.width / tier.divisor);
            const h = Math.round(canvas.height / tier.divisor);
            const dims = w + "x" + h + " px";

            const row = document.createElement("button");
            row.type = "button";
            row.className = "dl-size";
            row.setAttribute("data-size", dims);

            const text = document.createElement("span");
            text.textContent = dims;
            row.appendChild(text);

            const mark = document.createElement("span");
            mark.className = "dl-size-go";
            mark.appendChild(icon([
                "M12 3v12", "m7.5 10.5 4.5 4.5 4.5-4.5", "M4 20h16"
            ]));
            row.appendChild(mark);

            /* The tier names the row for assistive tech, with the pixels
               after it: "Half, 512x768 px" reads better than digits alone. */
            row.setAttribute("aria-label", tier.name + ", " + dims);
            row.addEventListener("click", () => {
                exportAt(w, h);
                setExportOpen(false);
            });
            dlSizes.appendChild(row);
        });
    }

    function syncExportFormat() {
        dlFormats.forEach((btn) => {
            const on = btn.getAttribute("data-format") === exportFormat;
            btn.setAttribute("aria-checked", String(on));
            btn.classList.toggle("is-active", on);
        });
        if (dlNote) {
            /* Said only when it applies: a JPG of a mockup with no background
               is a white rectangle behind the product, and finding that out
               after downloading is too late. */
            const flattens = exportFormat === "jpg" && !activeBackground();
            dlNote.hidden = !flattens;
            dlNote.textContent = flattens
                ? "JPG cannot hold transparency, so the empty surround is exported white."
                : "";
        }
    }

    function setExportOpen(open) {
        if (!dlPanel || !dlToggle) {
            return;
        }
        if (open) {
            renderExportSizes();
            syncExportFormat();
        }
        dlPanel.hidden = !open;
        dlToggle.setAttribute("aria-expanded", String(open));
    }

    if (dlToggle && dlPanel) {
        dlToggle.addEventListener("click", () => setExportOpen(dlPanel.hidden));

        dlFormats.forEach((btn) => {
            btn.addEventListener("click", () => {
                exportFormat = btn.getAttribute("data-format");
                syncExportFormat();
            });
        });

        /* Same dismissal rules as poster.html's exporter: a click outside, or
           Escape, which returns focus to the control that opened it. */
        document.addEventListener("click", (evt) => {
            if (dlPanel.hidden) { return; }
            if (dlPanel.contains(evt.target) || dlToggle.contains(evt.target)) { return; }
            setExportOpen(false);
        });
        document.addEventListener("keydown", (evt) => {
            if (evt.key === "Escape" && !dlPanel.hidden) {
                setExportOpen(false);
                dlToggle.focus();
            }
        });
    }

    /* ----------------------------------------------------------------------
       Per-template control state

       There is no in-editor template picker: the mockup is chosen by the
       catalog card that opened the page (data-doc preset, consumed below).
       The product therefore never changes during a session, so this runs
       once at startup rather than on a change event.

       With the picker gone, this label is the only text naming the loaded
       mockup, so it carries the whole burden for screen-reader users.
       ---------------------------------------------------------------------- */

    /* With the template picker gone this label is the only thing naming the
       mockup for a screen-reader user. Now that the colourway changes what is
       rendered, it has to name that too -- otherwise choosing a colour
       produces no perceivable feedback at all. */
    function syncCanvasLabel() {
        const config = PRODUCTS[currentProduct];
        const color = activeColor(config);
        const suffix = color && !color.original ? " in " + color.name : "";
        canvas.setAttribute("aria-label", config.label + suffix + " mockup preview");
    }

    /* ----------------------------------------------------------------------
       Initialization: hydrate saved settings, populate the colour controls
       for the starting product, then paint.
       ---------------------------------------------------------------------- */

    function numberIn(value, min, max, fallback) {
        return typeof value === "number" && isFinite(value)
            ? clamp(value, min, max)
            : fallback;
    }

    function restoreLayers(saved) {
        /* Saves written before this editor had layers held one design's
           placement in flat top-level fields. Migrating them keeps a
           returning visitor's size and position instead of silently
           resetting to the default. */
        const rows = Array.isArray(saved.layers)
            ? saved.layers
            : (typeof saved.scale === "number"
                ? [{
                    name: "design",
                    scale: saved.scale / 100,
                    offsetX: saved.offsetX,
                    offsetY: saved.offsetY,
                    rotation: 0,
                    visible: true
                }]
                : []);

        rows.slice(0, MAX_LAYERS).forEach((row) => {
            if (!row || typeof row !== "object") {
                return;
            }
            layerCounter += 1;
            layers.push({
                id: "L" + layerCounter + "-restored",
                name: typeof row.name === "string" && row.name ? row.name.slice(0, 60) : "design",
                /* No bitmap: image data is never written to storage, so a
                   restored layer holds its placement and waits for the file
                   to be handed back through Replace. */
                img: null,
                scale: numberIn(row.scale, MIN_SCALE, MAX_SCALE, DEFAULT_SCALE),
                offsetX: numberIn(row.offsetX, -5000, 5000, 0),
                offsetY: numberIn(row.offsetY, -5000, 5000, 0),
                rotation: numberIn(row.rotation, -Math.PI * 4, Math.PI * 4, 0),
                visible: row.visible !== false,
                /* Clamped against MAX_ZONES rather than the current
                   template's count: the product is restored separately and
                   may not be resolved yet, and layerZone() re-checks against
                   the live count on every read anyway. */
                zone: numberIn(row.zone, 0, MAX_ZONES - 1, 0),
                rect: null
            });
        });
    }

    const saved = TB.storageGet(STORAGE_KEY);
    if (saved) {
        if (PRODUCTS[saved.product]) {
            currentProduct = saved.product;
        }
        if (hexToRgb(saved.customHex)) {
            const c = hexToRgb(saved.customHex);
            customHex = rgbToHex(c.r, c.g, c.b);
        }
        /* Anything that is not a six-digit hex is treated as transparent.
           localStorage is editable by the visitor, and this value reaches
           ctx.fillStyle -- which accepts far more than colours -- so it is
           re-derived from parsed components rather than passed through. */
        if (typeof saved.bg === "string") {
            const bg = hexToRgb(saved.bg);
            bgHex = bg ? rgbToHex(bg.r, bg.g, bg.b) : null;
        }
        if (saved.color === CUSTOM_COLOR) {
            currentColor = CUSTOM_COLOR;
        } else if (PRODUCTS[currentProduct].colors && PRODUCTS[currentProduct].colors[saved.color]) {
            currentColor = saved.color;
        }
        if (typeof saved.label === "string") {
            labelInput.value = TB.desanitize(saved.label);
        }
        restoreLayers(saved);
    }

    /* The catalog card that opened this editor decides which mockup loads
       (data-doc hand-off via TB.takePreset), and since the template picker
       was removed it is the ONLY way to choose one -- every product needs
       its own card in index.html or it cannot be reached at all. The value
       is only ever matched against PRODUCTS, so a tampered preset resolves
       to nothing worse than a template that already ships. It outranks the
       saved product because it represents a fresh, explicit card choice;
       a direct visit with no preset falls back to the last one used. */
    const preset = TB.takePreset();
    if (typeof preset === "string" && Object.prototype.hasOwnProperty.call(PRODUCTS, preset)) {
        currentProduct = preset;
        const presetPalette = PRODUCTS[currentProduct].colors;
        if (presetPalette && currentColor !== CUSTOM_COLOR && !presetPalette[currentColor]) {
            currentColor = Object.keys(presetPalette)[0];
        }
        /* Print areas differ between products, so a placement carried over
           from the last one would land somewhere arbitrary on this one. */
        layers.forEach((layer) => {
            layer.offsetX = 0;
            layer.offsetY = 0;
            layer.rotation = 0;
        });
    }

    /* "black" is the module-level default and a reasonable one for a DRAWN
       garment, but on a photographic template it would tint the shirt before
       the visitor has asked for anything -- a first-time arrival would meet a
       black shirt rather than the photograph the catalog card showed them.
       Unless a colour was genuinely restored for THIS product, a photographic
       template opens as photographed. */
    const finalConfig = PRODUCTS[currentProduct];
    const restoredForThisProduct = !!saved && saved.product === currentProduct &&
        (saved.color === CUSTOM_COLOR ||
            (finalConfig.colors && !!finalConfig.colors[saved.color]));
    if (finalConfig.type === "photo" && finalConfig.colors &&
        currentColor !== CUSTOM_COLOR && !restoredForThisProduct) {
        currentColor = Object.keys(finalConfig.colors)[0];
    }

    selectedId = layers.length ? layers[layers.length - 1].id : null;

    productPicker.buildPresets();
    syncColorField();
    syncColorUI();
    backgroundPicker.buildPresets();
    syncBackgroundUI();
    renderLayerList();
    syncScaleControls();
    syncLayerActions();
    syncCanvasLabel();
    renderTray();
    draw();

    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(draw);
    }
})();
