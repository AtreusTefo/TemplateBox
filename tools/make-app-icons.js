/* ==========================================================================
   TemplateBox - render every installed-app icon

   Run from the repository root:   node tools/make-app-icons.js

   Writes four PNGs into site/assets/, all four derived from
   site/assets/logo-mark.svg. No npm dependencies: it drives a browser already
   on the machine over the DevTools Protocol, exactly as tools/make-og-cards.js
   and tests/verify-layout.js do.

   WHY THIS EXISTS

   A manifest needs raster icons, and this project has no build step, so the
   PNGs have to be committed files. Committing four hand-exported bitmaps
   would put five copies of one mark in the repository -- the SVG plus four
   rasters -- with nothing tying them together. This tool READS the SVG and
   renders it, so the mark has exactly one definition and a change to it
   propagates by re-running this rather than by remembering to re-export.

   That is the same reasoning as make-og-cards.js, and it lives beside it and
   outside site/ for the same reason: site/ is the Netlify publish directory
   and therefore the web root, so a working file placed there is a public URL
   (docs/error-fixes/INTERNAL_FILES_PUBLICLY_SERVED.md).

   WHAT IT WRITES, AND WHY EACH ONE

     icon-192.png           the smaller of the two sizes Chrome requires of an
                            installable manifest
     icon-512.png           the larger, and the one Android uses for the
                            splash screen
     icon-maskable-512.png  the same mark at 46% rather than 62%, because a
                            maskable icon is cropped to whatever shape the
                            launcher uses -- a circle on most Android skins --
                            and only the central 80% is guaranteed to survive.
                            Rendering one file at both densities is not
                            possible: the padding IS the difference.
     icon-180.png           apple-touch-icon. iOS ignores the manifest's icons
                            array entirely and reads the <link> tag, so
                            without this the home screen shows a screenshot of
                            the page instead of the mark.

   THE GROUND IS OPAQUE ON PURPOSE. A transparent icon renders black-on-black
   under a maskable crop, and iOS composites it onto white regardless. The
   cream is --l-bg from css/style.css and the mark's ink is the #1A1A1A the
   SVG already hardcodes, so the icon is the favicon at size rather than a
   second interpretation of the brand.

   REGENERATE THE WHOLE SET, NEVER ONE SIZE -- the same rule, for the same
   reason, as the social cards: output is deterministic given this tool plus
   the browser, so a size you did not intend to touch coming back changed
   means the browser moved underneath you and all four should be committed
   together. The build is printed below for that reason.

   Full reference: docs/implementation/PWA_INSTALLABLE_APP.md
   ========================================================================== */

"use strict";

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = path.resolve(__dirname, "..");
const SITE = path.join(ROOT, "site");
const MARK = path.join(SITE, "assets", "logo-mark.svg");
const OUT = path.join(SITE, "assets");
const CDP_PORT = 9449;

/* Ground and ink. The ground is --l-bg from css/style.css; the ink is not
   named here at all because it comes in with the SVG's own stroke colour.
   Anything that recoloured the mark here would be a second opinion about the
   brand, which is the thing this tool exists to prevent. */
const GROUND = "#F4F3EF";

/* Mark height as a fraction of the canvas.

   0.62 for the plain icons is the mark reading at the same weight it has in
   the header: the hexagon fills its viewBox almost edge to edge, so a larger
   fraction crowds the tile and a smaller one floats.

   0.46 for the maskable one is not a taste judgement. A maskable icon is
   cropped by the launcher and only the central 80% diameter is guaranteed;
   0.46 keeps the mark's corners inside that circle with room for the shadow
   some skins add. Verified by eye against a circle mask, which is the only
   way to check it -- the number alone tells you nothing. */
const SCALE_PLAIN = 0.62;
const SCALE_MASKABLE = 0.46;

const TARGETS = [
    { file: "icon-192.png", size: 192, scale: SCALE_PLAIN },
    { file: "icon-512.png", size: 512, scale: SCALE_PLAIN },
    { file: "icon-maskable-512.png", size: 512, scale: SCALE_MASKABLE },
    { file: "icon-180.png", size: 180, scale: SCALE_PLAIN }
];

/* Same list and the same ORDER as make-og-cards.js: the installed system
   Chrome first, a cached Playwright chromium only as a last resort. See that
   file for why the test suite deliberately orders it the other way round. */
function findBrowser() {
    const candidates = [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        "/usr/bin/google-chrome",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
    ];
    const cacheDir = path.join(process.env.LOCALAPPDATA || "", "ms-playwright");
    if (fs.existsSync(cacheDir)) {
        fs.readdirSync(cacheDir).filter((d) => d.startsWith("chromium-")).forEach((d) => {
            candidates.push(path.join(cacheDir, d, "chrome-win64", "chrome.exe"));
        });
    }
    return candidates.find((p) => p && fs.existsSync(p)) || null;
}

/* Builds the page a single icon is screenshotted from.

   The SVG is inlined rather than referenced through <img src>, because an
   <img> pointing at a file:// SVG is a separate document that Chrome will not
   always have painted by the time the screenshot is taken, and a half-painted
   icon looks like a rendering bug rather than a race. Inline, it is part of
   the same layout pass as the body.

   The mark's own width/height attributes are stripped so the wrapper controls
   the size; the viewBox stays, which is what preserves the aspect ratio. */
function iconPage(svg, size, scale) {
    const markH = Math.round(size * scale);
    const markW = Math.round(markH * (64 / 72));
    const bare = svg
        .replace(/\swidth="[^"]*"/, "")
        .replace(/\sheight="[^"]*"/, "");

    return "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><style>" +
        "html,body{margin:0;padding:0}" +
        "body{width:" + size + "px;height:" + size + "px;background:" + GROUND + ";" +
        "display:flex;align-items:center;justify-content:center}" +
        ".m{width:" + markW + "px;height:" + markH + "px}" +
        ".m svg{display:block;width:100%;height:100%}" +
        "</style></head><body><div class=\"m\">" + bare + "</div></body></html>";
}

async function main() {
    if (!fs.existsSync(MARK)) {
        throw new Error("source mark not found: " + path.relative(ROOT, MARK));
    }
    const svg = fs.readFileSync(MARK, "utf8");

    const browserPath = findBrowser();
    if (!browserPath) {
        throw new Error("no Chrome/Edge/Chromium found on this machine");
    }
    console.log("browser: " + browserPath);
    console.log("source:  " + path.relative(ROOT, MARK));

    const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "tb-icons-"));
    const proc = spawn(browserPath, [
        "--headless=new", "--remote-debugging-port=" + CDP_PORT,
        "--user-data-dir=" + userDir, "--no-first-run", "--no-default-browser-check",
        "--disable-gpu", "--disable-extensions", "--force-device-scale-factor=1",
        "--hide-scrollbars"
    ], { stdio: "ignore" });

    /* taskkill signals the tree but Windows holds the profile handles for
       about a second afterwards, so a plain rmSync throws EPERM. Only a loop
       that awaits between attempts works; it succeeds on the second. Copied
       deliberately from make-og-cards.js, where the same defect was fixed
       after it left 87 directories behind. */
    const cleanup = async () => {
        try {
            spawnSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
        } catch (e) { /* not Windows, or already gone */ }
        try { proc.kill(); } catch (e) { /* already gone */ }

        let lastErr = null;
        for (let i = 0; i < 12; i += 1) {
            try {
                fs.rmSync(userDir, { recursive: true, force: true });
                if (!fs.existsSync(userDir)) { return; }
            } catch (err) {
                lastErr = err.code || err.message;
            }
            await new Promise((r) => setTimeout(r, 250));
        }
        console.log("NOTE could not remove " + userDir + ": " + lastErr);
    };

    try {
        let wsUrl = null;
        for (let i = 0; i < 80 && !wsUrl; i += 1) {
            await new Promise((r) => setTimeout(r, 250));
            try {
                wsUrl = (await (await fetch(
                    "http://127.0.0.1:" + CDP_PORT + "/json/version")).json()).webSocketDebuggerUrl;
            } catch (e) { /* not up yet */ }
        }
        if (!wsUrl) {
            throw new Error("browser did not expose a debugger endpoint on port " + CDP_PORT);
        }

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

        /* The browser build is the provenance of the set, exactly as it is for
           the social cards. Print it so a run that rewrites all four can be
           explained from the log rather than guessed at from the diff. */
        const version = await call("Browser.getVersion", {});
        console.log("build:   " + version.product + "\n");

        const { targetId } = await call("Target.createTarget", { url: "about:blank" });
        const { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true });
        await call("Page.enable", {}, sessionId);
        await call("Runtime.enable", {}, sessionId);

        for (const target of TARGETS) {
            await call("Emulation.setDeviceMetricsOverride", {
                width: target.size, height: target.size,
                deviceScaleFactor: 1, mobile: false
            }, sessionId);

            const html = iconPage(svg, target.size, target.scale);
            const { frameTree } = await call("Page.getFrameTree", {}, sessionId);
            await call("Page.setDocumentContent",
                { frameId: frameTree.frame.id, html }, sessionId);

            /* Two frames, not one: the first commits the new document, the
               second paints it. A single rAF screenshots the previous icon at
               the new size, which at 192 and 512 produces two plausible-looking
               files that are silently one step out of phase. */
            await call("Runtime.evaluate", {
                expression: "new Promise(r => requestAnimationFrame(" +
                    "() => requestAnimationFrame(r)))",
                awaitPromise: true
            }, sessionId);

            const shot = await call("Page.captureScreenshot", {
                format: "png",
                clip: { x: 0, y: 0, width: target.size, height: target.size, scale: 1 },
                captureBeyondViewport: false
            }, sessionId);

            const buf = Buffer.from(shot.data, "base64");

            /* Refuse a file that is not the size that was asked for. A screenshot
               taken before the metrics override lands comes back at the previous
               dimensions, and nothing downstream would notice: a manifest
               declaring 512x512 over a 192x192 payload installs, and the icon is
               simply blurry on the device. */
            const w = buf.readUInt32BE(16);
            const h = buf.readUInt32BE(20);
            if (w !== target.size || h !== target.size) {
                throw new Error(target.file + " came back " + w + "x" + h +
                    ", expected " + target.size + "x" + target.size);
            }

            fs.writeFileSync(path.join(OUT, target.file), buf);
            console.log("  " + target.file.padEnd(24) + w + "x" + h + "  " +
                Math.round(buf.length / 1024) + "KB  mark " +
                Math.round(target.scale * 100) + "%");
        }

        ws.close();
        console.log("\nwrote " + TARGETS.length + " icons to site/assets/");
        console.log("Now run `git status`: if a size you did not intend to touch has moved,");
        console.log("the browser has been updated -- regenerate and commit the whole set.");
    } finally {
        await cleanup();
    }
}

main().catch((err) => {
    console.error("FAILED: " + err.message);
    process.exit(1);
});
