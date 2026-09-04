/* ==========================================================================
   TemplateBox - render every Open Graph social card

   Run from the repository root:   node tools/make-og-cards.js

   Writes all ten 1200x630 cards into site/assets/, one per preset declared in
   site/tools/og-image.html. No npm dependencies: it drives a browser already
   on the machine over the DevTools Protocol, exactly as tests/verify-layout.js
   does.

   WHY THIS EXISTS, AND WHY IT LIVES HERE

   It drives the real tool rather than reimplementing its drawing code, so a
   card produced here is identical to one a person would get by opening
   site/tools/og-image.html and clicking Download PNG. There is no second copy
   of the artwork to drift.

   It sits at the repository root and NOT in site/tools/ beside the page it
   drives. site/ is the Netlify publish directory and therefore the web root,
   so anything placed there is a public URL -- see
   docs/error-fixes/INTERNAL_FILES_PUBLICLY_SERVED.md. This is a working file,
   so it belongs outside the deploy, with docs/ and tests/.

   REGENERATE THE WHOLE SET, NEVER ONE CARD

   Output is deterministic given the tool plus the browser build: re-running
   this returns every card made on the same Chrome byte-identical, verified
   with `git hash-object`. Across builds it does not -- three cards drawn on an
   older Chrome came back with roughly 40,000 of 3,024,000 channels differing
   at a maximum delta of 27-58 of 255, which is glyph-edge antialiasing and
   nothing else.

   So after running this, check `git status`. If a card you did not intend to
   touch has moved, the browser has been updated and the whole set should be
   regenerated and committed together, rather than leaving a set whose
   provenance is two different browsers.

   Full reference: docs/implementation/OPEN_GRAPH_SOCIAL_CARDS.md
   ========================================================================== */

"use strict";

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = path.resolve(__dirname, "..");
const TOOL = "file:///" +
    path.join(ROOT, "site", "tools", "og-image.html").replace(/\\/g, "/");
const OUT = path.join(ROOT, "site", "assets");
const CDP_PORT = 9448;

/* Finds a browser already on the machine, like tests/verify-layout.js -- but
   in a DIFFERENT ORDER, and the difference is deliberate.

   The suite puts a cached Playwright chromium FIRST, because it wants the most
   pinned browser it can find for stable layout measurements. This wants the
   opposite: the installed system Chrome, because the whole claim above is that
   a card produced here is what a person gets by opening og-image.html and
   clicking Download PNG, and that person is using their normal browser.

   Copying the suite's list verbatim got this wrong once. It silently selected
   `ms-playwright/chromium-1234` and re-rendered the committed set with a
   different binary from the one that produced it. The cards happened to come
   back byte-identical, which is luck and not a guarantee -- on a Chromium of a
   different vintage it would have rewritten all ten and the diff would have
   looked like a content change.

   Which is why the version is printed below rather than assumed: for a tool
   whose documented rule is "regenerate the set together", the browser that did
   it is the one fact worth having in the run output. */
function findBrowser() {
    const candidates = [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        "/usr/bin/google-chrome",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
    ];
    /* Last resort only: better than failing outright on a machine with no
       system Chrome, but it will not match the set committed from one. */
    const cacheDir = path.join(process.env.LOCALAPPDATA || "", "ms-playwright");
    if (fs.existsSync(cacheDir)) {
        fs.readdirSync(cacheDir).filter((d) => d.startsWith("chromium-")).forEach((d) => {
            candidates.push(path.join(cacheDir, d, "chrome-win64", "chrome.exe"));
        });
    }
    return candidates.find((p) => p && fs.existsSync(p)) || null;
}

async function main() {
    const browserPath = findBrowser();
    if (!browserPath) {
        throw new Error("no Chrome/Edge/Chromium found on this machine");
    }
    console.log("browser: " + browserPath);

    const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "tb-og-"));
    const proc = spawn(browserPath, [
        "--headless=new", "--remote-debugging-port=" + CDP_PORT,
        "--user-data-dir=" + userDir, "--no-first-run", "--no-default-browser-check",
        "--disable-gpu", "--disable-extensions", "--force-device-scale-factor=1",
        "--allow-file-access-from-files"
    ], { stdio: "ignore" });

    /* taskkill returns once it has SIGNALLED the tree, not once Windows has
       released the handles, so the browser profile stays locked for about a
       second afterwards. fs.rmSync with `maxRetries` spends every attempt
       inside that window and throws EPERM in ~8ms; `retryDelay` does not help
       either, measured. Only a loop that actually awaits between attempts
       works, and it succeeds on the second.

       This is the same defect that left 87 directories behind from the test
       suite before it was fixed there. It reports when it gives up rather
       than failing silently, because a cleanup that fails quietly is
       indistinguishable from one that works -- which is precisely how it
       survived in two places at once. */
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
        console.log(`NOTE could not remove ${userDir}: ${lastErr}`);
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

        /* The browser build IS the provenance of the set. Print it, so a run
           that rewrites every card can be explained by looking at the log
           rather than guessed at from the diff. */
        const version = await call("Browser.getVersion", {});
        console.log("build:   " + version.product);

        const { targetId } = await call("Target.createTarget", { url: "about:blank" });
        const { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true });
        await call("Page.enable", {}, sessionId);
        await call("Runtime.enable", {}, sessionId);

        const evaluate = async (expression) => {
            const res = await call("Runtime.evaluate",
                { expression, returnByValue: true, awaitPromise: true }, sessionId);
            if (res.exceptionDetails) {
                throw new Error(res.exceptionDetails.text + " " + JSON.stringify(
                    res.exceptionDetails.exception && res.exceptionDetails.exception.description));
            }
            return res.result.value;
        };

        await call("Emulation.setDeviceMetricsOverride",
            { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
        await call("Page.navigate", { url: TOOL }, sessionId);

        for (let i = 0; i < 100; i += 1) {
            await new Promise((r) => setTimeout(r, 200));
            const ready = await evaluate(
                "document.readyState !== 'loading' && !!document.getElementById('og-canvas')"
            ).catch(() => false);
            if (ready) { break; }
        }

        /* The tool's own comment: draw before the webfonts land and the canvas
           measures Georgia while painting Playfair. Refuse rather than write a
           set that silently does not match the site's typography -- a wrong
           card looks fine in isolation and only reveals itself once it is
           being shared. */
        const fonts = await evaluate(`(async () => {
            await document.fonts.ready;
            return {
                playfair: document.fonts.check('700 38px "Playfair Display"'),
                inter: document.fonts.check('600 28px "Inter"')
            };
        })()`);
        console.log(`fonts: playfair=${fonts.playfair} inter=${fonts.inter}`);
        if (!fonts.playfair || !fonts.inter) {
            throw new Error("webfonts did not load (fonts.googleapis.com unreachable?); " +
                "refusing to render cards in a fallback face");
        }

        const presets = await evaluate(
            "[...document.getElementById('og-preset').options].map(o => o.value)");

        for (const id of presets) {
            const info = await evaluate(`(async () => {
                const sel = document.getElementById('og-preset');
                sel.value = ${JSON.stringify(id)};
                sel.dispatchEvent(new Event('change', { bubbles: true }));
                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
                const canvas = document.getElementById('og-canvas');
                return {
                    file: document.getElementById('og-filename').value,
                    title: document.getElementById('og-title').value,
                    w: canvas.width, h: canvas.height,
                    data: canvas.toDataURL('image/png')
                };
            })()`);

            const buf = Buffer.from(
                info.data.replace(/^data:image\/png;base64,/, ""), "base64");
            fs.writeFileSync(path.join(OUT, info.file), buf);
            console.log(`  ${info.file}  ${info.w}x${info.h}  ` +
                `${Math.round(buf.length / 1024)}KB  "${info.title}"`);
        }

        ws.close();
        console.log(`\nwrote ${presets.length} cards to site/assets/`);
        console.log("Now run `git status`: if a card you did not intend to touch has moved,");
        console.log("the browser has been updated -- regenerate and commit the whole set.");
    } finally {
        await cleanup();
    }
}

main().catch((err) => {
    console.error("FAILED: " + err.message);
    process.exit(1);
});
