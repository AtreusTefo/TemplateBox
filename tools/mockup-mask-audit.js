/* ==========================================================================
   TemplateBox - mockup print-zone mask audit

   Run from the repository root:   node tools/mockup-mask-audit.js
                                   node tools/mockup-mask-audit.js frame-black-interior

   Answers ONE question for every photographic mockup template: does the print
   zone land on the product?

   WHY THIS IS A TOOL AND NOT A CHECK IN THE SUITE

   A template declares its print area as four typed-in corners. That is a
   careful human estimate of where the product is in a photograph, and a
   photograph is not a rectangle -- an interior frame shot in slight
   perspective has a TRAPEZOID aperture, so an inscribed rectangle must either
   fall short (a white gutter down the sides) or overhang (artwork on the
   frame). Both faults found on September 2, 2026 were of exactly this shape,
   and the suite was clean at 1269/0 when they were found. See
   docs/error-fixes/MOCKUP_PRINT_ZONES_OVERHANGING_THEIR_SURFACE.md.

   Section 11 of tests/verify-layout.js renders every template and asserts a
   design prints, which catches a dead template. It does NOT catch artwork on
   the wrong part of a product, and cannot cheaply: the answer depends on the
   photograph. That is what this reconstructs.

   TWO KINDS OF ANSWER, AND THE DIFFERENCE MATTERS

   THIRTEEN templates ship a `garment` map -- the mask js/mockup.js already
   uses to keep a colour tint off skin, hair and background. It is authored,
   it is exact, and for those templates this audit is a measurement.

   SIX do not: wood-a4, both banners and all three frames. For those the
   printable surface has to be RECONSTRUCTED from the base photograph by
   flooding outward from the zone's own centre over pixels that look like the
   surface, which is how the frame's aperture was found in September. That is
   an estimate, and every line of the report says which kind it is. Do not
   read a derived number as though it were a measured one.

   Both faults in that write-up were in the derived group, which is not a
   coincidence: those are the templates with no authored mask to check against.

   FEATHER IS NOT OVERHANG

   The September audit first reported the business card at 99.7153% purity,
   3,174 pixels outside its mask -- and every one of them had mask alpha
   between 1 and 249, with none at 0. They are the mask's own one-pixel
   feathered edge, and a zone sitting flush with a bleed-to-edge card is
   correct rather than broken. The false positive was the audit's own
   `alpha >= 128` threshold.

   So the two are counted separately here and only `hardOff` -- mask alpha
   EXACTLY 0, artwork on a pixel that is provably not the product -- is
   reported as a fault. A large feather count next to a zero hard count is the
   signature of a deliberate bleed-to-edge zone, not a defect.

   No npm dependencies: it serves the repository with `npx serve` and drives a
   browser already on the machine over the DevTools Protocol, exactly as
   tests/verify-layout.js and tools/make-og-cards.js do.
   ========================================================================== */

"use strict";

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = path.resolve(__dirname, "..");
const PORT = 5097;
const CDP_PORT = 9449;

/* Only `hardOff` counts, and one stray pixel is antialiasing rather than a
   fault. The frame shipped 6,341 and the banner 1,232, so anything of that
   order is far above this and anything below it is noise. */
const FAULT_FLOOR = 200;

/* Mirrors DILATE inside the audit, for the report line only. */
const DILATE_PX = 0;

const ONLY = process.argv[2] || "";

function findBrowser() {
    const candidates = [
        process.env.CHROME_PATH,
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
        "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
        "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
        "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser"
    ].filter(Boolean);
    return candidates.filter((p) => { try { return fs.existsSync(p); } catch (e) { return false; } })[0] || null;
}

function killTree(proc) {
    try {
        spawnSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
    } catch (e) { /* not Windows */ }
    try { proc.kill(); } catch (e) { /* already gone */ }
}

async function waitForServer(port) {
    for (let i = 0; i < 80; i += 1) {
        await new Promise((r) => setTimeout(r, 250));
        try {
            const res = await fetch(`http://localhost:${port}/mockup.html`, { method: "HEAD" });
            if (res.ok) { return true; }
        } catch (e) { /* not up yet */ }
    }
    return false;
}

/* --------------------------------------------------------------------------
   The audit itself, as a string evaluated in the page. It runs there rather
   than here because decoding a PNG in plain Node needs a dependency, and a
   browser is already required to drive the editors.
   -------------------------------------------------------------------------- */
const AUDIT = (only) => `(async () => {
    const ONLY = ${JSON.stringify(only)};

    if (!window.TB_PHOTO_MOCKUPS) {
        const src = await (await fetch('/js/mockup-templates.js')).text();
        (0, eval)(src);
    }
    const all = window.TB_PHOTO_MOCKUPS || [];
    const list = ONLY ? all.filter(t => t.id === ONLY) : all;
    if (!list.length) { return { error: ONLY ? 'no template with id ' + ONLY : 'empty registry' }; }

    const load = (url) => new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('could not load ' + url));
        img.src = '/' + url;
    });

    const pixels = (img) => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0);
        return { w: c.width, h: c.height,
                 d: c.getContext('2d', { willReadFrequently: true })
                      .getImageData(0, 0, c.width, c.height).data };
    };

    /* Point in quad, by the winding/cross-product test. Every shipped zone is
       axis aligned today, but the descriptor's contract is four arbitrary
       corners and a rectangle-only audit would silently mis-measure the first
       template that uses them. */
    const inQuad = (q, x, y) => {
        let sign = 0;
        for (let i = 0; i < 4; i += 1) {
            const a = q[i], b = q[(i + 1) % 4];
            const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
            if (cross === 0) { continue; }
            const s = cross > 0 ? 1 : -1;
            if (sign === 0) { sign = s; } else if (s !== sign) { return false; }
        }
        return true;
    };

    const luma = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];

    /* The reconstruction, for the six templates with no authored mask: flood
       out from the zone's own centre over pixels that look like the surface.
       The frame's black border and the banner's dark edge both enclose their
       bright face, so the flood cannot leak into the room -- which is exactly
       how the aperture was found in September.

       The threshold is taken from the surface itself rather than fixed: the
       median luma of the zone's central ninth, less a wide band. A fixed
       number would have to suit both a white vinyl banner and a wood frame's
       mat, and would be wrong for one of them. */
    const DILATE = 0;

    const finish = (mask, filled, w, h, median, floor, isWindow) => {
        for (let pass = 0; pass < DILATE; pass += 1) {
            const next = new Uint8Array(mask);
            for (let y = 0; y < h; y += 1) {
                for (let x = 0; x < w; x += 1) {
                    const p = y * w + x;
                    if (mask[p]) { continue; }
                    if ((x > 0 && mask[p - 1]) || (x < w - 1 && mask[p + 1]) ||
                        (y > 0 && mask[p - w]) || (y < h - 1 && mask[p + w])) {
                        next[p] = 1;
                    }
                }
            }
            mask = next;
        }
        let grown = 0, minX = w, maxX = -1, minY = h, maxY = -1;
        for (let p = 0; p < mask.length; p += 1) {
            if (!mask[p]) { continue; }
            grown += 1;
            const x = p % w, y = (p - x) / w;
            if (x < minX) { minX = x; } if (x > maxX) { maxX = x; }
            if (y < minY) { minY = y; } if (y > maxY) { maxY = y; }
        }
        return { mask, filled, grown, median, floor, window: isWindow,
                 bbox: [minX, minY, maxX, maxY],
                 fillRatio: grown / Math.max(1, (maxX - minX + 1) * (maxY - minY + 1)) };
    };

    const reconstruct = (px, quad, windowMode) => {
        const { w, h, d } = px;
        const cx = Math.round((quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4);
        const cy = Math.round((quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4);
        if (cx < 0 || cy < 0 || cx >= w || cy >= h) { return null; }

        /* A window template is inside out. Its printable area is a HOLE
           punched through the base -- the design shows through from behind --
           so the surface is where the base is TRANSPARENT, enclosed by the
           opaque frame around it. Flooding for bright pixels finds nothing at
           all there, which is exactly how wood-a4 reported "could not
           reconstruct" and is what identified the case. */
        if (windowMode) {
            const mask = new Uint8Array(w * h);
            const stack = [cy * w + cx];
            let filled = 0;
            let minX = w, maxX = -1, minY = h, maxY = -1;
            while (stack.length) {
                const q = stack.pop();
                if (mask[q]) { continue; }
                if (d[q * 4 + 3] > 40) { continue; }
                mask[q] = 1; filled += 1;
                const x = q % w, y = (q - x) / w;
                if (x < minX) { minX = x; } if (x > maxX) { maxX = x; }
                if (y < minY) { minY = y; } if (y > maxY) { maxY = y; }
                if (x > 0) { stack.push(q - 1); }
                if (x < w - 1) { stack.push(q + 1); }
                if (y > 0) { stack.push(q - w); }
                if (y < h - 1) { stack.push(q + w); }
            }
            if (!filled) { return null; }
            return finish(mask, filled, w, h, -1, -1, true);
        }

        const sample = [];
        const rx = Math.max(2, Math.round((Math.abs(quad[1].x - quad[0].x)) / 6));
        const ry = Math.max(2, Math.round((Math.abs(quad[2].y - quad[1].y)) / 6));
        for (let y = cy - ry; y <= cy + ry; y += 1) {
            for (let x = cx - rx; x <= cx + rx; x += 1) {
                if (x < 0 || y < 0 || x >= w || y >= h) { continue; }
                const i = (y * w + x) * 4;
                if (d[i + 3] > 200) { sample.push(luma(d, i)); }
            }
        }
        if (!sample.length) { return null; }
        sample.sort((a, b) => a - b);
        const median = sample[Math.floor(sample.length / 2)];
        const floor = Math.max(60, median - 70);

        const mask = new Uint8Array(w * h);
        const stack = [cy * w + cx];
        let filled = 0;
        let minX = w, maxX = -1, minY = h, maxY = -1;
        while (stack.length) {
            const p = stack.pop();
            if (mask[p]) { continue; }
            const i = p * 4;
            if (d[i + 3] <= 200 || luma(d, i) < floor) { continue; }
            mask[p] = 1; filled += 1;
            const x = p % w, y = (p - x) / w;
            if (x < minX) { minX = x; } if (x > maxX) { maxX = x; }
            if (y < minY) { minY = y; } if (y > maxY) { maxY = y; }
            if (x > 0) { stack.push(p - 1); }
            if (x < w - 1) { stack.push(p + 1); }
            if (y > 0) { stack.push(p - w); }
            if (y < h - 1) { stack.push(p + w); }
        }
        return finish(mask, filled, w, h, Math.round(median), Math.round(floor), false);
    };

    /* Grow a reconstructed mask by DILATE pixels before comparing a zone
       against it.

       A photographed edge is antialiased, so the boundary of any surface is a
       ramp two or three pixels wide rather than a line. A flood stops part way
       up that ramp, which makes every reconstruction a pixel or two TIGHT --
       and a zone drawn flush to the real edge then reads as overhanging all
       the way round by that margin.

       That is not hypothetical. Before this, the two frames with an aperture
       reported 6,650 and 16,942 off-product pixels, and wood-a4's worst row
       was y=1580 against a reconstructed hole ending at y=1579: exactly one
       row, the whole way along. Both vanish under a two-pixel dilation, which
       is what identifies them as boundary artefacts rather than faults.

       A REAL overhang survives this. The banner's was two full rows of 616
       and the frame's ran to eight pixels deep at the top, so neither is
       within the ramp. Dilation trades a class of false positive that would
       have buried both for a small loss of sensitivity at exactly one or two
       pixels, which is the right side of that trade for an audit a person
       reads. */
    const out = [];
    for (const t of list) {
        const zones = t.warpZones ? t.warpZones : (t.warpZone ? [t.warpZone] : []);
        const row = { id: t.id, title: t.title,
                      source: t.garment ? 'garment'
                          : ((t.overlay && (t.overlayBlend || 'source-over') === 'source-over')
                              ? 'overlay' : 'derived'),
                      zones: [], notes: [] };
        if (!zones.length) { row.notes.push('declares no print zone'); out.push(row); continue; }

        let px = null, base = null, over = null;
        try {
            base = pixels(await load(t.base));
            px = t.garment ? pixels(await load(t.garment)) : base;
            /* The top slice of the Sandwich Method, drawn LAST and over
               everything including the design. Where it is opaque, artwork
               that overhangs the surface is redrawn over and never seen --
               which is the whole mechanism of the September 2 frame fix, and
               the reason that template's zone was left overhanging on
               purpose. An audit blind to it reports a fixed template as
               broken; this one did, before this was added. */
            if (t.overlay) { over = pixels(await load(t.overlay)); }
        } catch (e) {
            row.notes.push(e.message);
            out.push(row);
            continue;
        }
        row.canvas = [px.w, px.h];

        for (let zi = 0; zi < zones.length; zi += 1) {
            const quad = zones[zi];
            const label = (t.zoneLabels && t.zoneLabels[zi]) || ('zone ' + zi);
            /* Surface, in order of how much it can be trusted.

               1. garment  -- an authored mask, shipped for recolouring.
               2. overlay  -- also authored. Its punched hole IS the aperture
                              the design shows through, so for a template that
                              ships one there is nothing to reconstruct and
                              nothing to disagree with. Using a flood here
                              instead put a phantom ring round every aperture:
                              the flood stops a pixel or two inside the real
                              edge, those pixels fall outside the derived
                              surface AND inside the overlay's punch, and so
                              were counted as visible overhang. That is what
                              reported 4,542 px and an 86%-of-a-row worst case
                              on a frame whose zone is deliberately overhung
                              and fully covered.
               3. flood    -- a reconstruction, for the templates with neither. */
            /* ONLY a source-over overlay. js/mockup.js draws the overlay
               with the declared globalCompositeOperation, and multiply TINTS
               rather than hides: artwork under it is still seen. Treating
               every overlay as an occluder reported wood-a4 and
               banner-rollup-angled as 98.6% and 99.9% covered, which would
               mean their designs never show at all -- flatly contradicted by
               section 11, which prints one on both. Of the three overlays
               shipped, only the frame's is source-over, and it is source-over
               precisely because it was added to hide an overhang. */
            const occludes = over && over.w === px.w && over.h === px.h &&
                (t.overlayBlend || 'source-over') === 'source-over';
            const overHole = occludes ? { over: over } : null;
            const rec = (t.garment || overHole) ? null
                : reconstruct(px, quad, t.mode === 'window');
            if (!t.garment && !overHole && !rec) {
                row.zones.push({ label, error: 'could not reconstruct a surface from the base' });
                continue;
            }

            const xs = quad.map(p => p.x), ys = quad.map(p => p.y);
            const x0 = Math.max(0, Math.floor(Math.min(...xs)));
            const x1 = Math.min(px.w - 1, Math.ceil(Math.max(...xs)));
            const y0 = Math.max(0, Math.floor(Math.min(...ys)));
            const y1 = Math.min(px.h - 1, Math.ceil(Math.max(...ys)));

            let area = 0, hardOff = 0, feather = 0, covered = 0;
            let worstRow = { y: -1, n: 0 };
            let inkMinY = px.h, inkMaxY = -1, inkMinX = px.w, inkMaxX = -1;

            for (let y = y0; y <= y1; y += 1) {
                let rowOff = 0, rowWide = 0;
                for (let x = x0; x <= x1; x += 1) {
                    if (!inQuad(quad, x + 0.5, y + 0.5)) { continue; }
                    area += 1; rowWide += 1;
                    const p = y * px.w + x;
                    const a = t.garment ? px.d[p * 4 + 3]
                        : (overHole ? (overHole.over.d[p * 4 + 3] < 128 ? 255 : 0)
                                    : (rec.mask[p] ? 255 : 0));
                    if (a === 0) {
                        hardOff += 1;
                        /* Off the surface -- but is it SEEN? Two things can
                           redraw over artwork, and neither is a forgiveness:
                           the overhang is still there and a later change to
                           either would expose it, so covered pixels are
                           counted apart rather than dropped.

                           1. An overlay, the top slice of the Sandwich
                              Method, drawn last over everything including the
                              design. This is the whole mechanism of the
                              September 2 frame fix, which is why that
                              template's zone was left overhanging on purpose.

                           2. In window mode the BASE occludes. The design
                              is drawn behind the photograph and shows through
                              a punched hole, so every pixel outside that hole
                              is already covered by the base itself. Missing
                              this reported wood-a4 as overhanging by eleven
                              full-width rows that no visitor can ever see.

                           The threshold is 128, not 250, because both punches
                           are FEATHERED -- the frame's by a 3x3 blur of its
                           binary mask, deliberately, so its inner edge meets
                           the base's antialiased frame edge with no hairline
                           seam. At 250 that one-pixel ramp reads as uncovered
                           the whole way round an aperture, which is what left
                           2,987 phantom pixels on the frame. */
                        const ov = occludes ? over.d[p * 4 + 3] : 0;
                        const bs = (t.mode === 'window' && base.w === px.w && base.h === px.h)
                            ? base.d[p * 4 + 3] : 0;
                        /* Whichever occludes MORE. wood-a4 has both an overlay
                           and window mode, and taking the overlay alone left
                           its eleven rows below the aperture reported as
                           visible when the opaque base covers every one. */
                        if (Math.max(ov, bs) >= 128) { covered += 1; }
                        else { rowOff += 1; }
                    }
                    else if (a < 250) { feather += 1; }
                    if (a > 0) {
                        if (y < inkMinY) { inkMinY = y; } if (y > inkMaxY) { inkMaxY = y; }
                        if (x < inkMinX) { inkMinX = x; } if (x > inkMaxX) { inkMaxX = x; }
                    }
                }
                if (rowOff > worstRow.n) { worstRow = { y, n: rowOff, of: rowWide }; }
            }

            const visible = hardOff - covered;
            const z = { label, area, hardOff, feather, covered, visible,
                        hardPct: +(100 * visible / Math.max(1, area)).toFixed(4),
                        featherPct: +(100 * feather / Math.max(1, area)).toFixed(4),
                        worstRow,
                        zoneBox: [x0, y0, x1, y1],
                        onProductBox: inkMaxY < 0 ? null : [inkMinX, inkMinY, inkMaxX, inkMaxY] };
            if (rec) {
                z.surface = { filled: rec.filled, grown: rec.grown, bbox: rec.bbox,
                              fillRatio: +rec.fillRatio.toFixed(4),
                              median: rec.median, floor: rec.floor };
            }
            row.zones.push(z);
        }
        out.push(row);
    }
    return { templates: out };
})()`;

async function main() {
    const browserPath = findBrowser();
    if (!browserPath) { throw new Error("no Chrome/Edge/Chromium found on this machine"); }

    console.log("TemplateBox mockup print-zone mask audit");
    console.log("browser: " + browserPath);

    const server = spawn(`npx serve -l ${PORT}`, { cwd: ROOT, stdio: "ignore", shell: true });
    if (!await waitForServer(PORT)) {
        killTree(server);
        throw new Error(`could not start \`npx serve\` on port ${PORT} from the repository root`);
    }

    const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "tb-audit-"));
    const proc = spawn(browserPath, [
        "--headless=new", "--remote-debugging-port=" + CDP_PORT,
        "--user-data-dir=" + userDir, "--no-first-run", "--no-default-browser-check",
        "--disable-gpu", "--disable-extensions", "--force-device-scale-factor=1"
    ], { stdio: "ignore" });

    const cleanup = async () => {
        killTree(proc);
        killTree(server);
        for (let i = 0; i < 12; i += 1) {
            try {
                fs.rmSync(userDir, { recursive: true, force: true });
                if (!fs.existsSync(userDir)) { return; }
            } catch (e) { /* still locked */ }
            await new Promise((r) => setTimeout(r, 250));
        }
    };

    try {
        let wsUrl = null;
        for (let i = 0; i < 80 && !wsUrl; i += 1) {
            await new Promise((r) => setTimeout(r, 250));
            try {
                wsUrl = (await (await fetch(
                    `http://127.0.0.1:${CDP_PORT}/json/version`)).json()).webSocketDebuggerUrl;
            } catch (e) { /* not up yet */ }
        }
        if (!wsUrl) { throw new Error("browser did not expose a debugger endpoint on port " + CDP_PORT); }

        const ws = new WebSocket(wsUrl);
        const pending = new Map();
        let nextId = 1;
        await new Promise((r) => ws.addEventListener("open", r, { once: true }));
        ws.addEventListener("message", (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg.id && pending.has(msg.id)) {
                const entry = pending.get(msg.id);
                pending.delete(msg.id);
                if (msg.error) { entry.reject(new Error(msg.error.message)); }
                else { entry.resolve(msg.result); }
            }
        });
        const call = (method, params, sessionId) => new Promise((resolve, reject) => {
            const id = nextId += 1;
            pending.set(id, { resolve, reject });
            ws.send(JSON.stringify({ id, method, params: params || {}, sessionId }));
        });

        const version = await call("Browser.getVersion", {});
        console.log("build:   " + version.product);

        const { targetId } = await call("Target.createTarget", { url: "about:blank" });
        const { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true });
        await call("Page.enable", {}, sessionId);
        await call("Runtime.enable", {}, sessionId);

        /* 404.html rather than mockup.html: same origin, so the assets and the
           registry both fetch, but nothing starts loading a template's
           megabytes behind the audit's back. */
        await call("Page.navigate", { url: `http://localhost:${PORT}/404.html` }, sessionId);
        for (let i = 0; i < 100; i += 1) {
            await new Promise((r) => setTimeout(r, 150));
            const res = await call("Runtime.evaluate",
                { expression: "document.readyState", returnByValue: true }, sessionId);
            if (res.result && res.result.value !== "loading") { break; }
        }

        const res = await call("Runtime.evaluate",
            { expression: AUDIT(ONLY), returnByValue: true, awaitPromise: true }, sessionId);
        if (res.exceptionDetails) {
            throw new Error(res.exceptionDetails.text + " " +
                JSON.stringify(res.exceptionDetails.exception &&
                               res.exceptionDetails.exception.description));
        }
        report(res.result.value);
    } finally {
        await cleanup();
    }
}

function report(result) {
    if (!result || result.error) {
        console.log("\nERROR " + ((result && result.error) || "no result"));
        process.exitCode = 1;
        return;
    }

    const faults = [];
    const derived = [];

    console.log("\n" + "-".repeat(78));
    console.log("MEASURED against each template's own authored `garment` mask");
    console.log("-".repeat(78));
    result.templates.filter((t) => t.source === "garment").forEach((t) => print(t));

    console.log("\n" + "-".repeat(78));
    console.log("DERIVED by reconstructing the surface from the base photograph");
    console.log("These are ESTIMATES. Check `surface fill` looks like the real face");
    console.log("before trusting a number on this half of the report.");
    console.log("-".repeat(78));
    result.templates.filter((t) => t.source !== "garment").forEach((t) => print(t));

    function print(t) {
        console.log(`\n${t.id}  (${t.title})`);
        if (t.canvas) { console.log(`  canvas ${t.canvas[0]}x${t.canvas[1]}`); }
        t.notes.forEach((n) => console.log("  NOTE " + n));
        t.zones.forEach((z) => {
            if (z.error) { console.log(`  ${z.label}: ${z.error}`); return; }
            const flag = z.visible >= FAULT_FLOOR ? "  <== OVERHANG" : "";
            console.log(`  ${z.label}: ${z.area} px, off-product ${z.visible} ` +
                        `(${z.hardPct}%), feather ${z.feather} (${z.featherPct}%)${flag}`);
            if (z.covered) {
                console.log(`      plus ${z.covered} px off the surface but redrawn over, ` +
                            "so never visible");
            }
            if (z.visible) {
                console.log(`      worst row y=${z.worstRow.y} with ${z.worstRow.n} of ` +
                            `${z.worstRow.of} px across (` +
                            `${(100 * z.worstRow.n / Math.max(1, z.worstRow.of)).toFixed(1)}% of that row)`);
            }
            if (z.surface) {
                console.log(`      surface ${z.surface.filled} px flooded, ` +
                            `${z.surface.grown} after a ${DILATE_PX}px dilation, bbox ` +
                            `${z.surface.bbox.join("..")}, ${(100 * z.surface.fillRatio).toFixed(2)}% of it` +
                            (z.surface.floor >= 0
                                ? `, luma >= ${z.surface.floor} (median ${z.surface.median})`
                                : ", transparent hole (window mode)"));
            }
            if (z.visible >= FAULT_FLOOR) {
                faults.push(`${t.id} / ${z.label}: ${z.visible} px (${z.hardPct}%)` +
                            (t.source === "garment" ? "" : "  [derived]"));
            }
            if (t.source !== "garment") { derived.push(t.id); }
        });
    }

    console.log("\n" + "=".repeat(78));
    if (faults.length) {
        console.log(`${faults.length} zone(s) with artwork off the product:`);
        faults.forEach((f) => console.log("  - " + f));
        console.log("\nA [derived] fault is an estimate. Confirm it against the photograph");
        console.log("before changing a zone; a reconstruction that leaked will read as one.");
    } else {
        console.log("No zone has artwork on a pixel that is provably not the product.");
    }
    console.log("\nFeather is not a fault: a large feather count beside a zero off-product");
    console.log("count is a zone sitting flush with a bleed-to-edge surface, which is");
    console.log("correct. See the September 2 note on the business card.");
    console.log("=".repeat(78));
}

main().catch(async (err) => {
    console.error("\n" + (err && err.stack ? err.stack : String(err)));
    process.exit(1);
});
