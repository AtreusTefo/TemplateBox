/* ==========================================================================
   TemplateBox - layout and ad-placement verification

   Run before deploying:   node tests/verify-layout.js
   Static checks only:     node tests/verify-layout.js --quick
   Skip the HEAD parity:   node tests/verify-layout.js --no-baseline

   Lives OUTSIDE site/ and is never deployed. No npm dependencies: it drives a
   browser straight over the DevTools Protocol using Node's built-in fetch and
   WebSocket, and finds a browser binary already on the machine.

   WHY THIS EXISTS
   The failures that have actually cost this project money were silent ones --
   nothing errored, nothing looked wrong, something simply stopped working:

     - index.html shipped ad hosts with no <script src="js/ads.js"> for three
       days. Zero impressions. Every page rendered perfectly.
     - Renaming .filter-pills to .feed-tabs killed category filtering, because
       three selectors in js/app.js still asked for the old class. No error.

   Both are caught by section 1 below, which needs no browser and runs in
   under a second. Sections 2-4 cover the layout contracts that a person
   cannot check by eye across five pages and seven widths.

   This file is the thing docs/memory/PROJECT_STATUS.md refers to. If a check
   here is deleted, delete the claim there too -- a guarantee nobody enforces
   is worse than no guarantee, because it gets believed.
   ========================================================================== */

"use strict";

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = path.resolve(__dirname, "..");
const SITE = path.join(ROOT, "site");
const PORT = 5099;
const CDP_PORT = 9445;
const BASELINE_PORT = 5098;
const BASELINE_CDP = 9446;

const QUICK = process.argv.includes("--quick");
const NO_BASELINE = process.argv.includes("--no-baseline");

/* Pages carrying the fixed rail, and the widths that exercise every band
   boundary. 1488 is the 93rem stack gate. 1199/1200 straddle the 75rem rail
   floor, which as of August 13, 2026 is shared by ALL THREE rail families --
   homepage, editors and the content pages all mount at the same widths now.
   1280 is the reported MacBook Air width that motivated that consolidation.
   1335/1336 and 1344 are kept because they were the content-rail family's
   old 83.5rem floor and the editors' old 84rem floor respectively: nothing
   should change there any more, which is exactly why they are worth
   covering. */
const PAGES = [
    ["index", "/"],
    ["resume", "/resume.html"],
    ["docs", "/docs.html"],
    ["poster", "/poster.html"],
    ["mockup", "/mockup.html"],
    ["about", "/about.html"],
    ["rent-receipt", "/rent-receipt-template.html"],
    ["blog", "/blog.html"],
    ["post", "/post.html"]
];
const WIDTHS = [1920, 1600, 1488, 1440, 1366, 1344, 1336, 1335, 1280, 1200, 1199, 1024, 768, 320];

/* Pages that show NO band in some width range, keyed by page name, as
   [minPxExclusive, maxPxExclusive).

   This table used to carry index, about, rent-receipt, blog and post, all at
   [768, 1200]: the anchor stopped at 48rem, the rail did not start until
   75rem, and everything in between showed nothing. That band is every tablet
   in portrait and most in landscape, so the whole class of device was served
   no advertising at all -- and because this table said so, the suite asserted
   the hole was correct and defended it.

   Closed on August 20, 2026 by extending the anchor's ceiling to the rail's
   own floor (SITE_ANCHOR_MAX and HOME_ANCHOR_MAX in js/ads.js). Those pages
   now mount exactly one band at every width, like everything else, so they
   are gone from here rather than being given a new range.

   `post` is the one page that still has a genuine gap -- it carries no
   [data-ad-anchor] host at all -- but it is in MULTI_UNIT_PAGES below and so
   is skipped by the count assertion regardless, which is why it is not
   listed. Left as an empty table rather than deleted: a page that legitimately
   shows nothing in a range is a thing this suite should still be able to
   express. */
const RAIL_GAP = {};

/* Pages that deliberately run a top leaderboard alongside the side rail
   rather than treating them as alternatives for one slot -- see the comment
   at the "exactly N ad band mounts" check below. */
const MULTI_UNIT_PAGES = new Set(["blog", "post"]);

let passed = 0;
const failures = [];

function check(name, ok, detail) {
    if (ok) { passed += 1; return true; }
    failures.push({ name, detail });
    console.log("FAIL  " + name + (detail ? "\n      " + detail : ""));
    return false;
}

function section(title) {
    console.log("\n--- " + title + " ---");
}

/* ==========================================================================
   1. Static checks. No browser, no server.
   ========================================================================== */

function htmlFiles() {
    const out = [];
    (function walk(dir) {
        fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) { walk(full); }
            else if (entry.name.endsWith(".html")) { out.push(full); }
        });
    })(SITE);
    return out;
}

function staticChecks() {
    section("1. Static: ad wiring and selector agreement");

    const pages = htmlFiles();
    const adsJs = fs.readFileSync(path.join(SITE, "js", "ads.js"), "utf8");
    const appJs = fs.readFileSync(path.join(SITE, "js", "app.js"), "utf8");

    /* 1a. A page carrying an ad host must load the script that fills it.
           This is the three-days-of-zero-impressions bug. The guard is
           deliberately literal: the ONLY thing that catches a missing script
           tag is looking for the script tag. */
    pages.forEach((file) => {
        const rel = path.relative(ROOT, file);
        const html = fs.readFileSync(file, "utf8");
        const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "");
        const hasHost = /\sdata-ad-[a-z-]+/.test(withoutComments) ||
            /\sdata-ads-static/.test(withoutComments);
        if (!hasHost) { return; }
        /* Match the tag itself, not the filename inside a comment -- a guard
           that missed that distinction is what let four pages ship broken. */
        const hasScript = /<script[^>]+src\s*=\s*["'][^"']*js\/ads\.js["']/.test(withoutComments);
        check(`${rel} carries ad hosts and loads js/ads.js`, hasScript,
            hasScript ? "" : "has data-ad-* hosts but no <script src=\"js/ads.js\"> tag");
    });

    /* 1b. Every zone a mountPlacement call names must exist in AD_ZONES with
           a non-empty key, or the placement renders nothing forever. */
    const zoneBlock = adsJs.slice(adsJs.indexOf("const AD_ZONES"), adsJs.indexOf("function buildBannerFrame"));
    const declared = {};
    zoneBlock.replace(/([A-Za-z0-9_]+)\s*:\s*\{\s*key\s*:\s*"([^"]*)"/g, (m, name, key) => {
        declared[name] = key;
        return m;
    });
    const named = new Set();
    adsJs.replace(/mountPlacement\([^,]+,\s*"([^"]+)"\)/g, (m, zone) => { named.add(zone); return m; });
    adsJs.replace(/RAIL_STACK\s*=\s*\[([^\]]+)\]/g, (m, list) => {
        list.match(/"([^"]+)"/g).forEach((q) => named.add(q.slice(1, -1)));
        return m;
    });
    named.forEach((zone) => {
        check(`AD_ZONES.${zone} exists with a non-empty key`,
            Object.prototype.hasOwnProperty.call(declared, zone) && declared[zone].length > 0,
            declared[zone] === undefined ? "named by a mountPlacement call but not declared"
                : "declared with an empty key, so it renders nothing");
    });

    /* 1c. Rail slots must not repeat a zone key. Three slots sharing one key
           is one placement counted three times, not three placements. */
    ["EDITOR_RAIL_STACK", "HOME_RAIL_STACK", "CONTENT_RAIL_STACK"].forEach((constName) => {
        const m = adsJs.match(new RegExp(constName + "\\s*=\\s*\\[([^\\]]+)\\]"));
        if (!m) { return; }
        const zones = m[1].match(/"([^"]+)"/g).map((q) => q.slice(1, -1));
        const keys = zones.map((z) => declared[z]);
        check(`${constName} uses a distinct zone key per slot`,
            new Set(keys).size === keys.length,
            "repeated key(s): " + keys.join(", "));
    });

    /* 1d. Every hook the JavaScript LOOKS UP must exist in the served markup.

           This is the category-filtering bug, and getting it right took two
           attempts. The first version scanned only class selectors, which
           made it nearly vacuous: js/app.js queries exactly two classes, and
           the handlers that broke key on the `data-filter` ATTRIBUTE. A
           renamed hook is invisible either way -- no error, no console
           warning, the feature just stops -- so the check has to cover every
           token type a selector can carry, not the one that happened to
           break last time.

           Only querySelector/querySelectorAll/closest/matches arguments are
           scanned, so hooks the scripts create rather than look up are not
           flagged. */
    const allHtml = pages.map((f) => fs.readFileSync(f, "utf8")).join("\n");
    const sources = { "js/app.js": appJs, "js/ads.js": adsJs };

    Object.keys(sources).forEach((label) => {
        const tokens = new Set();
        sources[label].replace(
            /(?:querySelectorAll|querySelector|closest|matches)\(\s*["'`]([^"'`]+)["'`]/g,
            (m, sel) => {
                /* Attribute hooks: [data-foo] and [data-foo="bar"] alike. */
                (sel.match(/\[[A-Za-z][A-Za-z0-9_-]*(?:[~^$*|]?=)?[^\]]*\]/g) || [])
                    .forEach((t) => tokens.add(t.replace(/[~^$*|]?=.*\]$/, "]")));
                (sel.match(/\.[A-Za-z][A-Za-z0-9_-]*/g) || []).forEach((t) => tokens.add(t));
                (sel.match(/#[A-Za-z][A-Za-z0-9_-]*/g) || []).forEach((t) => tokens.add(t));
                return m;
            }
        );

        const present = (token) => {
            if (token[0] === "[") {
                const attr = token.slice(1, -1);
                return new RegExp("\\s" + attr + "(?=[\\s>=])").test(allHtml);
            }
            if (token[0] === ".") {
                return new RegExp('class="[^"]*\\b' + token.slice(1) + '\\b').test(allHtml);
            }
            return new RegExp('id="' + token.slice(1) + '"').test(allHtml);
        };

        const absent = [...tokens].filter((t) => !present(t));
        check(`every hook ${label} queries exists in the served markup`,
            absent.length === 0,
            absent.length ? `queried but present in no page: ${absent.join(", ")}` : "");
    });

    /* 1f. Every page family's `display: none` gate must be declared AFTER the
           shared .editor-rail/.home-rail/.content-rail/.loading-rail rule.
           Media queries carry no specificity, so written before it the gate
           loses to the shared `display: flex` and the rail appears on every
           viewport it is meant to skip -- with nothing failing anywhere to
           say so. Source order is the whole contest, which makes it worth a
           test.

           Each gate is matched by the SELECTOR it hides, never by its width
           alone. As of August 13, 2026 all three original rail families
           floor at 75rem and so share the identical 74.9375rem hide value; a
           bare width search would match whichever happens to sit earliest in
           the file regardless of which selector it actually gates, which is
           the false pass this pairing exists to avoid. loading.html's
           .loading-rail joined the shared selector itself (August 16, 2026,
           reversing its earlier position:sticky treatment) and is checked
           the same way as the other three now rather than being the
           unrelated edge case it used to be. */
    const css = fs.readFileSync(path.join(SITE, "css", "style.css"), "utf8");
    const sharedRule = css.search(/\.editor-rail,\s*\.home-rail,\s*\.content-rail,\s*\.loading-rail\s*\{/);
    const gateOf = (selector) => css.search(
        new RegExp("@media\\s*\\(max-width:\\s*74\\.9375rem\\)\\s*\\{\\s*\\" + selector + "\\s*\\{")
    );
    [["homepage", ".home-rail"], ["editor", ".editor-rail"], ["content", ".content-rail"], ["loading", ".loading-rail"]]
        .forEach(([label, selector]) => {
            const gate = gateOf(selector);
            check(`the ${label} rail's display gate is declared after the shared rule`,
                sharedRule !== -1 && gate !== -1 && gate > sharedRule,
                `shared rule at ${sharedRule}, ${selector} gate at ${gate}`);
        });

    /* 1e. Both copies of the editor route whitelist must agree, or the
           loading page's dependency-free fallback sends a visitor to the
           wrong editor when js/app.js fails. */
    const loading = fs.readFileSync(path.join(SITE, "loading.html"), "utf8");
    const routesOf = (src, name) => {
        const m = src.match(new RegExp(name + "\\s*=\\s*\\{([^}]+)\\}"));
        if (!m) { return null; }
        return (m[1].match(/([A-Za-z0-9_]+)\s*:\s*"/g) || [])
            .map((s) => s.replace(/\s*:\s*"$/, "")).sort().join(",");
    };
    const appRoutes = routesOf(appJs, "EDITOR_ROUTES");
    const inlineRoutes = routesOf(loading, "ROUTES");
    check("loading.html's inline route whitelist matches EDITOR_ROUTES",
        appRoutes !== null && appRoutes === inlineRoutes,
        `js/app.js: ${appRoutes} | loading.html: ${inlineRoutes}`);

    /* 1f2. Every banner runs inside a srcdoc iframe, and the srcdoc body's
            inline style is what suppresses a scrollbar when a creative lays
            out larger than the size it was booked at -- the iframe's own
            document scrolls, and that scrollbar paints inside the frame where
            the parent .ad-slot's overflow:hidden cannot reach it (August 16,
            2026). js/ads.js builds that string for every dynamically mounted
            placement; loading.html hardcodes two of its own. Same duplication
            shape as the route whitelist above and the footer constant that
            already drifted once, so it is asserted rather than trusted: a
            style added to the generator alone would leave loading.html's two
            banners scrollbarred with nothing failing to say so. */
    const adsBodyStyle = adsJs.match(/"<body style='([^']+)'>"/);
    const loadingBodyStyles = [...loading.matchAll(/srcdoc="<body style='([^']+)'>/g)]
        .map((m) => m[1]);
    const norm = (s) => (s || "").split(";").map((d) => d.trim())
        .filter(Boolean).sort().join(";");
    check("loading.html's inline banner srcdoc body style matches js/ads.js",
        adsBodyStyle !== null && loadingBodyStyles.length === 2 &&
        loadingBodyStyles.every((s) => norm(s) === norm(adsBodyStyle[1])),
        `js/ads.js: ${adsBodyStyle ? adsBodyStyle[1] : "not found"} | ` +
        `loading.html: ${loadingBodyStyles.join(" , ") || "none found"}`);

    /* 1g. The dark theme is declared twice -- once for the explicit
           data-theme="dark" attribute and once for the prefers-color-scheme
           fallback that serves visitors without JavaScript. CSS has no way to
           share one declaration block between them, so the two must be kept
           identical by hand, and a colour added to one but not the other would
           show up only for the half of visitors hitting the other branch. */
    const darkExplicit = css.match(/:root\[data-theme="dark"\]\s*\{([^}]+)\}/);
    const darkFallback = css.match(/:root:not\(\[data-theme\]\)\s*\{([^}]+)\}/);
    const decls = (block) => (block ? block[1]
        .split(";").map((d) => d.trim()).filter(Boolean).sort().join(" | ") : null);
    check("the two dark-theme declaration blocks are identical",
        darkExplicit && darkFallback && decls(darkExplicit) === decls(darkFallback),
        darkExplicit && darkFallback
            ? `explicit: ${decls(darkExplicit)}\n      fallback: ${decls(darkFallback)}`
            : "one of the two dark blocks is missing");

    /* 1h. Every page carries an inline no-flash snippet in <head> that reads
           the theme from localStorage before first paint. It cannot import the
           key from js/app.js -- it has to run before any external file loads --
           so the string is duplicated per page. A rename on one side would
           silently give every returning visitor a flash of the wrong theme,
           which is precisely the failure the snippet exists to prevent. */
    const keyMatch = appJs.match(/THEME_KEY\s*=\s*"([^"]+)"/);
    const themeKey = keyMatch ? keyMatch[1] : null;
    check("js/app.js declares a THEME_KEY", !!themeKey);

    const themed = pages.filter((f) =>
        /href="[^"]*css\/style\.css"/.test(fs.readFileSync(f, "utf8")));
    const missingSnippet = [];
    const wrongKey = [];
    themed.forEach((file) => {
        const rel = path.relative(ROOT, file);
        const html = fs.readFileSync(file, "utf8");
        const snippet = html.match(/localStorage\.getItem\("([^"]+)"\)/);
        if (!/setAttribute\("data-theme"/.test(html)) { missingSnippet.push(rel); return; }
        if (!snippet || snippet[1] !== themeKey) { wrongKey.push(rel + " -> " + (snippet ? snippet[1] : "none")); }
    });
    check(`every themed page carries the no-flash snippet (${themed.length} pages)`,
        missingSnippet.length === 0, "missing on: " + missingSnippet.join(", "));
    check("every no-flash snippet uses the same key as js/app.js",
        wrongKey.length === 0, `THEME_KEY is "${themeKey}"; mismatched: ${wrongKey.join(", ")}`);

    /* 1i. Print must never inherit the screen theme: a receipt printed in dark
           mode would otherwise put a near-white --color-text onto white paper.
           The print block re-points the aliases back to the light palette. */
    const printBlock = css.slice(css.indexOf("@media print"));
    check("the print block resets the palette to the light aliases",
        /:root\[data-theme="dark"\][\s\S]{0,400}--color-text:\s*var\(--l-text\)/.test(printBlock),
        "print output would inherit the dark palette");
}

/* ==========================================================================
   Browser plumbing
   ========================================================================== */

function findBrowser() {
    const candidates = [
        path.join(process.env.LOCALAPPDATA || "", "ms-playwright", "chromium-1234", "chrome-win64", "chrome.exe"),
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        "/usr/bin/google-chrome",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    ];
    const cacheDir = path.join(process.env.LOCALAPPDATA || "", "ms-playwright");
    if (fs.existsSync(cacheDir)) {
        fs.readdirSync(cacheDir).filter((d) => d.startsWith("chromium-")).forEach((d) => {
            candidates.unshift(path.join(cacheDir, d, "chrome-win64", "chrome.exe"));
        });
    }
    return candidates.find((p) => p && fs.existsSync(p)) || null;
}

async function connect(browserPath, cdpPort, options) {
    const adsBlocked = !!(options && options.adsBlocked);
    const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "tb-verify-"));
    const proc = spawn(browserPath, [
        "--headless=new", "--remote-debugging-port=" + cdpPort,
        "--user-data-dir=" + userDir, "--no-first-run", "--no-default-browser-check",
        "--disable-gpu", "--disable-extensions", "--force-device-scale-factor=1"
    ], { stdio: "ignore" });

    let wsUrl = null;
    for (let i = 0; i < 80 && !wsUrl; i += 1) {
        await new Promise((r) => setTimeout(r, 250));
        try {
            wsUrl = (await (await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).json()).webSocketDebuggerUrl;
        } catch (e) { /* not up yet */ }
    }
    if (!wsUrl) { throw new Error("browser did not expose a debugger endpoint on port " + cdpPort); }

    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    const events = [];
    let nextId = 1;
    await new Promise((r) => ws.addEventListener("open", r, { once: true }));
    ws.addEventListener("message", (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id && pending.has(msg.id)) {
            const entry = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) { entry.reject(new Error(msg.error.message)); } else { entry.resolve(msg.result); }
        } else { events.push(msg); }
    });
    const call = (method, params, sessionId) => new Promise((resolve, reject) => {
        const id = nextId += 1;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params: params || {}, sessionId }));
    });

    const { targetId } = await call("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true });
    await call("Page.enable", {}, sessionId);
    await call("Runtime.enable", {}, sessionId);
    await call("Network.enable", {}, sessionId);

    const evaluate = async (expression) => (await call("Runtime.evaluate",
        { expression, returnByValue: true, awaitPromise: true }, sessionId)).result.value;

    /* Navigation has to be deterministic or the whole suite is noise.

       Two things bite here. The main-frame load event waits on the ad
       iframes, whose script host is unreachable from a test machine, so it
       can arrive seconds late -- and a load event left in the queue from the
       PREVIOUS page will satisfy a naive wait immediately, snapshotting a
       page that has not rendered yet. That produced exactly one spurious
       "0 ad bands" failure before this was fixed.

       So: drain stale events first, then wait for readiness by polling the
       page itself rather than trusting a single event. */
    const navigate = async (url, width, height) => {
        await call("Emulation.setDeviceMetricsOverride",
            { width, height: height || 900, deviceScaleFactor: 1, mobile: false }, sessionId);

        for (let i = events.length - 1; i >= 0; i -= 1) {
            if (events[i].method === "Page.loadEventFired") { events.splice(i, 1); }
        }
        await call("Page.navigate", { url }, sessionId);

        const expected = new URL(url).pathname;
        const deadline = Date.now() + 20000;
        while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 100));
            let state = null;
            try {
                state = await evaluate(`(() => ({
                    path: location.pathname,
                    ready: document.readyState,
                    adsReady: ${adsBlocked} ||
                              !document.querySelector('script[src*="js/ads.js"]') ||
                              typeof TBAds !== 'undefined'
                }))()`);
            } catch (e) { continue; }
            if (!state || state.path !== expected || state.ready !== "complete" || !state.adsReady) {
                continue;
            }
            await new Promise((r) => setTimeout(r, 250));
            return;
        }
        throw new Error("navigation to " + url + " did not settle within 20s");
    };

    return {
        call, sessionId, navigate, evaluate,
        close: () => { ws.close(); proc.kill(); }
    };
}

function startServer(cwd, port) {
    /* One command string rather than a program plus an args array: Node 24
       on Windows refuses to spawn a .cmd shim without a shell (EINVAL), and
       passing args alongside shell:true is deprecated. The port is a literal
       defined in this file, so there is nothing here to escape. */
    const proc = spawn(`npx serve -l ${port}`, { cwd, stdio: "ignore", shell: true });

    /* shell:true means the child is the SHELL, and npx then spawns serve
       beneath it. proc.kill() reaps only the shell, so every interrupted or
       failed run used to leave a live server holding this port -- after which
       the next run silently talked to a stale server from an older working
       tree, or timed out against it. That surfaced as "navigation did not
       settle within 20s" on an unrelated page, which reads like a site bug and
       is not one. Kill the whole tree instead. */
    proc.killTree = () => {
        try {
            if (process.platform === "win32") {
                spawnSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
            } else {
                process.kill(-proc.pid, "SIGKILL");
            }
        } catch (err) {
            /* Already gone. */
        }
        try { proc.kill(); } catch (err) { /* already gone */ }
    };
    return proc;
}

async function waitForServer(port) {
    for (let i = 0; i < 80; i += 1) {
        await new Promise((r) => setTimeout(r, 250));
        try {
            const res = await fetch(`http://localhost:${port}/`);
            if (res.ok) { return true; }
        } catch (e) { /* not up yet */ }
    }
    return false;
}

/* The snapshot every layout assertion is made against. Returns geometry
   only -- no expected values live in the page, so this file owns the
   contract and the page cannot quietly agree with itself. */
const SNAPSHOT = `(() => {
  const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
    return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1),
             h: +b.height.toFixed(1), right: +b.right.toFixed(1), bottom: +b.bottom.toFixed(1) }; };
  const de = document.documentElement;
  const rail = document.querySelector('.editor-rail, .home-rail, .content-rail');
  const railShown = rail ? getComputedStyle(rail).display !== 'none' : false;
  const filled = rail ? [...rail.querySelectorAll('[data-ad-rail-slot] .ad-slot')] : [];
  /* .editor-leaderboard is the editors' 48-84rem band; .ad-lead is the same
     role's name on the blog surfaces (blog.html, post.html, blog/<slug>.html),
     which mount a leaderboard at every width rather than only in one band --
     both collapse to display:none while empty, one via .is-filled gating the
     other via :empty, so one query reads either correctly. */
  const lb = document.querySelector('.editor-leaderboard, .ad-lead');
  const anchor = document.querySelector('.editor-anchor, .site-anchor');
  const anchorShown = anchor ? getComputedStyle(anchor).display !== 'none' : false;
  return {
    innerWidth: window.innerWidth, innerHeight: window.innerHeight,
    clientWidth: de.clientWidth, scrollWidth: de.scrollWidth,
    bodyPadRight: parseFloat(getComputedStyle(document.body).paddingRight),
    bodyPadBottom: parseFloat(getComputedStyle(document.body).paddingBottom),
    hasRailClass: document.body.classList.contains('has-ad-rail'),
    hasAnchorClass: document.body.classList.contains('has-ad-anchor') ||
                    document.body.classList.contains('has-site-anchor'),
    rail: rail ? { shown: railShown, position: getComputedStyle(rail).position,
                   rect: box(rail), filledCount: filled.length,
                   sizes: filled.map(s => Math.round(s.getBoundingClientRect().width) + 'x' +
                                          Math.round(s.getBoundingClientRect().height)) } : null,
    leaderboardShown: lb ? getComputedStyle(lb).display !== 'none' : false,
    anchor: anchor ? { shown: anchorShown, rect: box(anchor) } : null,
    header: box(document.querySelector('.site-header')),
    tabs: box(document.querySelector('.feed-tabs')),
    exportBar: box(document.querySelector('.preview-actions')),
    feedColumn: (() => {
      const card = document.querySelector('.template-card');
      return card ? +card.getBoundingClientRect().width.toFixed(1) : null;
    })(),
    unreachableHeaderControls: (() => {
      const bad = [];
      document.querySelectorAll('.site-header a, .site-header button, .site-header input').forEach(c => {
        const b = c.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) return;
        if (b.right > window.innerWidth + 0.5) { bad.push('offscreen: ' + (c.textContent || c.tagName).trim().slice(0, 24)); return; }
        const el = document.elementFromPoint(b.x + b.width / 2, Math.min(b.y + b.height / 2, window.innerHeight - 1));
        if (!(el && (el === c || c.contains(el) || el.contains(c)))) {
          bad.push('covered: ' + (c.textContent || c.name || c.tagName).trim().slice(0, 24));
        }
      });
      return bad;
    })()
  };
})()`;

/* ==========================================================================
   2. Layout contracts across every page and width
   ========================================================================== */

async function layoutChecks(page) {
    section("2. Layout: band exclusivity, inset integrity, overflow");

    for (const [name, urlPath] of PAGES) {
        for (const width of WIDTHS) {
            const tag = `${name} @${width}`;
            await page.navigate(`http://localhost:${PORT}${urlPath}`, width);
            const s = await page.evaluate(SNAPSHOT);

            /* "Never two bands at once and never none" -- CLAUDE.md's own
               words, so assert the exact count, not merely "no more than
               one". The loose version passes when a band silently fails to
               mount, which is the failure mode that actually costs money:
               a renamed host attribute leaves the page looking perfect and
               earning nothing.

               RAIL_GAP above is the exception table, and it is empty now: the
               homepage and the content-rail family used to show nothing
               between the anchor's old 48rem ceiling and the rail's 75rem
               floor, and since August 20, 2026 the anchor covers that band
               instead, so every non-editor page mounts exactly one unit at
               every width.

               This invariant is about one slot alternating between mutually
               exclusive units, which is not what blog/post are: their
               leaderboard is a top-of-page content unit that is DESIGNED to
               run alongside the side rail (plus in-content and
               end-of-article units elsewhere on the page), not an
               alternative to it -- see the "already carry four units"
               reasoning in js/ads.js's site-anchor comment. Skip the count
               assertion there; the rail-specific checks below (geometry,
               reservation, anchor-never-with-rail) still apply to them in
               full. */
            const railUp = !!(s.rail && s.rail.shown && s.rail.filledCount > 0);
            const bands = [railUp, s.leaderboardShown, !!(s.anchor && s.anchor.shown)].filter(Boolean).length;
            const gap = RAIL_GAP[name];
            const expected = (gap && width > gap[0] && width < gap[1]) ? 0 : 1;
            if (!MULTI_UNIT_PAGES.has(name)) {
                check(`${tag}: exactly ${expected} ad band mounts`, bands === expected,
                    `got ${bands} -- rail=${railUp} leaderboard=${s.leaderboardShown} anchor=${!!(s.anchor && s.anchor.shown)}`);
            }

            check(`${tag}: no horizontal page scroll`, s.scrollWidth <= s.clientWidth,
                `scrollWidth ${s.scrollWidth} > clientWidth ${s.clientWidth}`);

            check(`${tag}: every menu-bar control reachable`,
                s.unreachableHeaderControls.length === 0,
                s.unreachableHeaderControls.join("; "));

            if (railUp) {
                /* The column owns the window's right edge, top to bottom. */
                check(`${tag}: rail is fixed, full height, at the right edge`,
                    s.rail.position === "fixed" && s.rail.rect.y === 0 &&
                    Math.abs(s.rail.rect.bottom - s.innerHeight) < 1 &&
                    Math.abs(s.rail.rect.right - s.clientWidth) < 1,
                    JSON.stringify(s.rail.rect) + ` innerHeight=${s.innerHeight} clientWidth=${s.clientWidth}`);

                /* The reservation must equal the column, or the page either
                   overlaps it or leaves a gap beside it. */
                check(`${tag}: body reserves exactly the column's width`,
                    s.hasRailClass && Math.abs(s.bodyPadRight - s.rail.rect.w) < 1,
                    `padding-right ${s.bodyPadRight} vs column ${s.rail.rect.w}, has-ad-rail=${s.hasRailClass}`);

                /* One padding insets everything in flow. If any of these
                   reaches past the column, the header has been given a rule
                   of its own and the mechanism has been broken. */
                [["header", s.header], ["category tabs", s.tabs], ["export bar", s.exportBar]]
                    .filter(([, rect]) => rect && rect.w > 0)
                    .forEach(([label, rect]) => {
                        check(`${tag}: ${label} stops at or before the column`,
                            rect.right <= s.rail.rect.x + 0.5,
                            `${label} right ${rect.right} vs column left ${s.rail.rect.x}`);
                    });

                /* The rail must not dominate the page.

                   This assertion was originally "the rail creative is
                   narrower than one feed column", encoding the decision
                   reached the hard way: a 300px unit beside three wide
                   columns on a 1366px laptop stopped reading as a side rail
                   and became a fourth column of adverts.

                   It was RELAXED on August 10, 2026, and the reason is worth
                   knowing before anyone tightens it again. Two things changed
                   underneath it. The rail stopped being an in-flow neighbour
                   of the feed and became a column fixed to the window edge
                   with its own background, which is what actually separates
                   it from the content now. And the feed went to a 4/5-column
                   ladder, so a feed column at 1920px is 214px against the
                   stack's 300px creative -- the old form of the assertion
                   became unsatisfiable without either dropping the three-slot
                   band or capping the columns, both of which are ruled out
                   elsewhere.

                   What survives is the principle rather than the proxy: the
                   ad column never takes more than a quarter of the window.
                   That still catches a fourth slot, a wider creative, or a
                   reservation that stops tracking its band. The narrower
                   "reads as a rail" judgement is now a thing to look at, not
                   a thing to measure -- see the note in PROJECT_STATUS.md. */
                if (name === "index") {
                    const share = s.rail.rect.w / s.clientWidth;
                    check(`${tag}: ad column takes under a quarter of the window`,
                        share < 0.25,
                        `column ${s.rail.rect.w}px is ${(share * 100).toFixed(1)}% of ${s.clientWidth}px`);
                }

                /* One creative in the single band, three in the stack, and
                   never a repeated size within one rail. */
                check(`${tag}: rail mounted a coherent band`,
                    (s.rail.filledCount === 1 && s.rail.sizes[0] === "160x600") ||
                    (s.rail.filledCount === 3 && s.rail.sizes.every((z) => z === "300x250")),
                    "slots: " + s.rail.sizes.join(", "));
            } else {
                check(`${tag}: nothing reserved when no rail is up`,
                    s.bodyPadRight === 0 && !s.hasRailClass,
                    `padding-right ${s.bodyPadRight}, has-ad-rail=${s.hasRailClass}`);
            }

            /* The fixed anchors are the only things that do not inherit the
               inset, and they must never coexist with a rail. */
            if (s.anchor && s.anchor.shown) {
                check(`${tag}: anchor spans the full window and no rail is up`,
                    !railUp && s.bodyPadRight === 0 &&
                    Math.abs(s.anchor.rect.w - s.clientWidth) < 1,
                    `anchor width ${s.anchor.rect.w} vs ${s.clientWidth}, railUp=${railUp}`);

                /* The reservation has to match the unit actually mounted, not
                   a unit that used to be mounted. body.has-site-anchor
                   reserved 7.25rem (116px) for a 728x90 that was retired on
                   August 13, 2026; the branch was unreachable while the anchor
                   was phone-only, and came back to life the moment the anchor
                   was extended to tablets on August 20 -- 116px of padding
                   under a 50px bar, on every tablet page, with nothing
                   failing. Under-reserving strands the foot of the document
                   beneath a fixed bar; over-reserving leaves dead space. Both
                   are silent, so both are asserted here. */
                /* CLAUDE.md's own requirement: "the banner never overlaps the
                   sticky export bar". The anchor is z-index 30 against the
                   bar's 5, so an overlap paints over the control that
                   completes the task. This went wrong the moment the editors'
                   anchor was extended to tablets on August 20, 2026, because
                   .preview-pane is position:sticky only above 48.0625rem and
                   a sticky pane puts the bar's stuck position 12px below what
                   its `bottom` asks for -- so the phone tier's arithmetic,
                   which is exact, did not carry over. Asserted rather than
                   reasoned about, since the two tiers now legitimately differ.
                   A hidden bar measures as a zero rect and passes trivially,
                   which is correct: there is nothing to overlap. */
                check(`${tag}: export bar clears the anchor`,
                    !s.exportBar || s.exportBar.h === 0 ||
                    s.exportBar.bottom <= s.anchor.rect.y + 0.5,
                    `export bar bottom ${s.exportBar && s.exportBar.bottom} vs anchor top ${s.anchor.rect.y}`);

                check(`${tag}: anchor reservation matches the mounted unit`,
                    s.hasAnchorClass
                        ? s.bodyPadBottom >= s.anchor.rect.h - 1 &&
                          s.bodyPadBottom <= s.anchor.rect.h + 12
                        : true,
                    `padding-bottom ${s.bodyPadBottom} vs anchor height ${s.anchor.rect.h}`);
            }
        }
    }

    /* Mega-menu opened, and the sticky furniture after a real scroll. */
    section("2b. Layout: mega-menu open and scrolled state");
    for (const width of [1920, 1440, 1366, 1200]) {
        await page.navigate(`http://localhost:${PORT}/`, width);
        const r = await page.evaluate(`(() => {
            const toggle = document.querySelector('[data-nav-more-toggle]');
            if (!toggle) return { skipped: true };
            toggle.click();
            const p = document.querySelector('[data-nav-more-panel]');
            const b = p.getBoundingClientRect();
            const rail = document.querySelector('.home-rail');
            const up = rail && getComputedStyle(rail).display !== 'none' && rail.querySelector('.ad-slot');
            const mid = document.elementFromPoint(b.x + b.width / 2, b.y + 12);
            return { hidden: p.hasAttribute('hidden'), left: +b.x.toFixed(1), right: +b.right.toFixed(1),
                     railLeft: up ? +rail.getBoundingClientRect().x.toFixed(1) : null,
                     reachable: !!(mid && p.contains(mid)) };
        })()`);
        if (r.skipped) { continue; }
        check(`mega-menu @${width}: opens on screen, clear of the column, clickable`,
            !r.hidden && r.left >= 0 && r.reachable &&
            (r.railLeft === null || r.right <= r.railLeft + 0.5),
            JSON.stringify(r));
    }

    for (const [label, urlPath, width] of [["homepage", "/", 1920], ["editor", "/docs.html", 1366],
            ["content page", "/about.html", 1920]]) {
        await page.navigate(`http://localhost:${PORT}${urlPath}`, width);
        /* Wait for the header to STOP MOVING rather than for a fixed two
           frames. The homepage header hides on scroll-down (August 14, 2026)
           by translating upward over a CSS transition, so two rAFs after a
           scrollTo catches it mid-flight: this assertion failed roughly one
           run in three with headerTop at fractional values like -1.9, which
           is not a layout fault but a stopwatch started too early. Polling
           until two consecutive samples agree is deterministic regardless of
           how long the transition takes. */
        const r = await page.evaluate(`(async () => {
            window.scrollTo(0, 1400);
            const hdr = document.querySelector('.site-header');
            let last = null;
            for (let i = 0; i < 60; i += 1) {
                await new Promise(r => requestAnimationFrame(r));
                const y = +hdr.getBoundingClientRect().y.toFixed(1);
                if (last !== null && y === last) { break; }
                last = y;
            }
            const rail = document.querySelector('.editor-rail, .home-rail, .content-rail');
            const rr = rail.getBoundingClientRect();
            const hd = hdr.getBoundingClientRect();
            return { railTop: +rr.y.toFixed(1), railBottom: +rr.bottom.toFixed(1),
                     railLeft: +rr.x.toFixed(1), headerTop: +hd.y.toFixed(1),
                     headerHeight: +hd.height.toFixed(1),
                     headerRight: +hd.right.toFixed(1), innerHeight: window.innerHeight };
        })()`);
        /* headerTop is no longer required to be exactly 0. This check is about
           the INSET -- that the header's right edge stops at the column -- and
           the rail's full height; the header's vertical offset belongs to the
           hide-on-scroll feature, which legitimately parks it anywhere from 0
           to minus its own height. Demanding 0 asserted the header does not do
           the thing it was deliberately built to do, and only passed at all
           because an instant scrollTo does not always trigger the hide. */
        check(`${label} scrolled: column still full height, header still inset`,
            r.railTop === 0 && Math.abs(r.railBottom - r.innerHeight) < 1 &&
            r.headerTop <= 0.5 && r.headerTop >= -(r.headerHeight + 0.5) &&
            r.headerRight <= r.railLeft + 0.5,
            JSON.stringify(r));
    }

    /* ----------------------------------------------------------------------
       2d. The category tabs must sit BELOW the header, not inside it.

       .site-header is flex-wrap: wrap and its height is a function of how its
       contents wrap, not of the viewport width: 85px from 600px up, but 145px
       from 360px to 480px and 201px at 320px. Every sticky offset written as a
       literal was therefore calibrated on desktop and wrong on phones. The
       tabs' 76px put the whole 45px tab row inside the header's box, and the
       header (z-index 20, against the tabs' 15) painted straight over it -- so
       on every phone width the category filter was invisible and untappable
       whenever the header was showing and the page was scrolled.

       Nothing errored and nothing looked broken on a desktop, which is the
       exact failure profile this suite exists for. The offset is a measured
       --header-h now; these two checks are what stop it going back to a
       literal. Both were mutation-tested by restoring the 4.75rem/5.25rem
       literals: the overlap check failed at 320/360/390/414/768, and the
       flush check failed at every width.
       ---------------------------------------------------------------------- */
    section("2d. Layout: sticky offsets track the header's real height");
    for (const width of [320, 360, 390, 414, 768, 1024, 1366, 1920]) {
        await page.navigate(`http://localhost:${PORT}/`, width);
        const r = await page.evaluate(`(async () => {
            const settle = async () => {
                const hdr = document.querySelector('.site-header');
                let last = null;
                for (let i = 0; i < 60; i += 1) {
                    await new Promise(r => requestAnimationFrame(r));
                    const y = +hdr.getBoundingClientRect().y.toFixed(1);
                    if (last !== null && y === last) { break; }
                    last = y;
                }
            };
            const fire = async (from, to, step) => {
                for (let y = from; step > 0 ? y <= to : y >= to; y += step) {
                    window.scrollTo(0, y);
                    window.dispatchEvent(new Event('scroll'));
                    await new Promise(r => setTimeout(r, 50));
                }
                await settle();
            };
            const h = document.querySelector('.site-header');
            const t = document.querySelector('.feed-tabs');
            if (!h || !t) { return { skipped: true }; }

            /* Scrolled down far enough to hide the header, then part-way back
               up so it is revealed WHILE the page is still scrolled -- the
               state in which a too-small offset hides the tabs. */
            await fire(0, 600, 120);
            await fire(600, 480, -60);
            const hr = h.getBoundingClientRect(), tr = t.getBoundingClientRect();
            const hit = document.elementFromPoint(tr.left + Math.min(60, tr.width / 2),
                                                  tr.top + tr.height / 2);
            const revealed = {
                headerBottom: +hr.bottom.toFixed(1), tabsTop: +tr.top.toFixed(1),
                overlap: +Math.max(0, hr.bottom - tr.top).toFixed(1),
                coveredByHeader: hit ? h.contains(hit) : null
            };

            /* And scrolled down again, where the header is gone and the tabs
               must close the gap it leaves rather than parking below it. */
            await fire(480, 900, 120);
            const t2 = t.getBoundingClientRect();
            return { revealed, hiddenTabsTop: +t2.top.toFixed(1),
                     navHidden: document.body.classList.contains('is-nav-hidden') };
        })()`);
        if (r.skipped) { continue; }

        check(`category tabs @${width}: clear of the header, not painted over by it`,
            r.revealed.overlap <= 0.5 && r.revealed.coveredByHeader === false,
            JSON.stringify(r.revealed));

        check(`category tabs @${width}: land flush at the viewport top when the header hides`,
            !r.navHidden || Math.abs(r.hiddenTabsTop) <= 0.5,
            JSON.stringify({ hiddenTabsTop: r.hiddenTabsTop, navHidden: r.navHidden }));
    }

    /* ----------------------------------------------------------------------
       2e. No text field under 16px on a phone.

       iOS Safari zooms the page in when a text-entry field smaller than that
       takes focus, and does not zoom back out on blur -- once per field, on
       pages whose whole purpose is filling fields in. It is a device
       behaviour with a hard threshold, so this is a real contract and not a
       taste question. Colour and range inputs are excluded because neither is
       a text-entry field and neither triggers the zoom.

       Mutation-tested by putting .doc-name back to 0.9375rem: fails on all
       four editors.
       ---------------------------------------------------------------------- */
    section("2e. Layout: no phone text field small enough to trigger iOS zoom");
    for (const [label, urlPath] of [["resume", "/resume.html"], ["docs", "/docs.html"],
            ["poster", "/poster.html"], ["mockup", "/mockup.html"], ["homepage", "/"]]) {
        await page.navigate(`http://localhost:${PORT}${urlPath}`, 390);
        const small = await page.evaluate(`(() => {
            const zoomy = new Set(['text','search','password','email','number','tel','url',
                                   'date','datetime-local','month','week','time']);
            const out = [];
            document.querySelectorAll('input,select,textarea').forEach((el) => {
                const t = (el.type || '').toLowerCase();
                if (el.tagName === 'INPUT' && !zoomy.has(t)) { return; }
                const fs = parseFloat(getComputedStyle(el).fontSize);
                if (fs < 16) { out.push((el.id || el.className || el.tagName) + '@' + fs + 'px'); }
            });
            return out;
        })()`);
        check(`${label} @390: every text field is at least 16px`,
            small.length === 0, small.join(", "));
    }

    /* Print must carry neither the column nor the width it reserved. */
    section("2c. Layout: print output");
    for (const [label, urlPath, width] of [["homepage", "/", 1920], ["editor", "/resume.html", 1366],
            ["content page", "/about.html", 1920]]) {
        await page.navigate(`http://localhost:${PORT}${urlPath}`, width);
        await page.call("Emulation.setEmulatedMedia", { media: "print" }, page.sessionId);
        const r = await page.evaluate(`(() => {
            const rail = document.querySelector('.editor-rail, .home-rail, .content-rail');
            return { railDisplay: getComputedStyle(rail).display,
                     padRight: parseFloat(getComputedStyle(document.body).paddingRight),
                     padBottom: parseFloat(getComputedStyle(document.body).paddingBottom) };
        })()`);
        await page.call("Emulation.setEmulatedMedia", { media: "" }, page.sessionId);
        check(`${label} print: no column and no reserved width`,
            r.railDisplay === "none" && r.padRight === 0 && r.padBottom === 0,
            JSON.stringify(r));
    }
}

/* ==========================================================================
   3. Launch flow. MUST use trusted input.

   A synthetic MouseEvent is not a user activation, so window.open in
   bindLaunchControls is popup-blocked and the modified-click checks fail
   against working code. Input.dispatchMouseEvent injects real input.
   ========================================================================== */

async function launchChecks(page) {
    section("3. Launch flow (trusted input)");

    const locate = `(() => {
        const a = document.querySelector('.template-card .card-link');
        a.scrollIntoView({ block: 'center' });
        const b = a.getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2, target: a.getAttribute('data-target') };
    })()`;

    const clickAt = async (box, button, modifiers) => {
        const base = { x: box.x, y: box.y, button, modifiers: modifiers || 0, clickCount: 1 };
        await page.call("Input.dispatchMouseEvent",
            Object.assign({ type: "mousePressed", buttons: button === "middle" ? 4 : 1 }, base), page.sessionId);
        await page.call("Input.dispatchMouseEvent",
            Object.assign({ type: "mouseReleased", buttons: 0 }, base), page.sessionId);
        await new Promise((r) => setTimeout(r, 1500));
    };
    const pageTargets = async () => (await page.call("Target.getTargets")).targetInfos.filter((t) => t.type === "page");

    await page.navigate(`http://localhost:${PORT}/`, 1440);
    let box = await page.evaluate(locate);
    let before = (await pageTargets()).map((t) => t.targetId);
    await clickAt(box, "left");
    let url = await page.evaluate("location.pathname + location.search");
    check("plain click routes the foreground tab to the interstitial",
        url === "/loading.html?target=" + box.target &&
        (await pageTargets()).length === before.length, "landed on " + url);

    for (const [label, button, modifiers] of [["ctrl-click", "left", 2], ["middle-click", "middle", 0]]) {
        await page.navigate(`http://localhost:${PORT}/`, 1440);
        box = await page.evaluate(locate);
        before = (await pageTargets()).map((t) => t.targetId);
        await clickAt(box, button, modifiers);
        const fresh = (await pageTargets()).filter((t) => !before.includes(t.targetId));
        const stayed = await page.evaluate("location.pathname");
        check(`${label} opens the interstitial in a new tab, opener unmoved`,
            fresh.length === 1 &&
            fresh[0].url.indexOf("/loading.html?target=" + box.target) >= 0 &&
            stayed === "/",
            `opened [${fresh.map((t) => t.url).join(", ") || "nothing"}], opener at ${stayed}`);
        for (const t of fresh) { await page.call("Target.closeTarget", { targetId: t.targetId }); }
    }
}

/* ==========================================================================
   4. Ads-blocked parity against the last commit.

   The rail, the anchors and the leaderboard all reserve space only once a
   banner has actually filled. That promise is only worth anything if a
   blocked script leaves the page measurably untouched, so this compares the
   working tree against a pristine `git archive HEAD` copy served alongside.
   ========================================================================== */

const PARITY_SNAPSHOT = `(() => {
  const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
    return [+b.x.toFixed(1), +b.y.toFixed(1), +b.width.toFixed(1), +b.height.toFixed(1)]; };
  const de = document.documentElement;
  return {
    scrollWidth: de.scrollWidth, clientWidth: de.clientWidth,
    bodyPad: getComputedStyle(document.body).padding,
    main: box(document.querySelector('main')),
    header: box(document.querySelector('.site-header')),
    tabs: box(document.querySelector('.feed-tabs')),
    feed: box(document.querySelector('.home-main')),
    firstCard: box(document.querySelector('.template-card')),
    panes: [...document.querySelectorAll('.editor-pane, .preview-pane')].map(box),
    exportBar: box(document.querySelector('.preview-actions'))
  };
})()`;

async function parityChecks(browserPath) {
    section("4. Ads blocked: layout identical to the last commit");

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tb-baseline-"));
    const archive = spawnSync("git", ["archive", "HEAD", "site"], { cwd: ROOT, maxBuffer: 1 << 28 });
    if (archive.status !== 0) {
        console.log("SKIP  no git HEAD to compare against");
        return;
    }
    fs.writeFileSync(path.join(tmp, "head.tar"), archive.stdout);
    /* Extract from inside the directory with a bare relative filename. An
       absolute Windows path here fails: GNU tar reads the "C:" in
       C:\Users\... as a remote host spec and answers
       "Cannot connect to C: resolve failed". */
    const untar = spawnSync("tar", ["-xf", "head.tar"], { cwd: tmp });
    if (untar.status !== 0) {
        console.log("SKIP  could not extract the baseline: " +
            (String(untar.stderr || "").trim() || untar.error || "tar unavailable"));
        return;
    }
    fs.copyFileSync(path.join(ROOT, "serve.json"), path.join(tmp, "serve.json"));

    const server = startServer(tmp, BASELINE_PORT);
    if (!await waitForServer(BASELINE_PORT)) {
        server.killTree();
        console.log("SKIP  baseline server did not start");
        return;
    }

    /* This session deliberately blocks js/ads.js, so the readiness poll
       must not wait for TBAds -- it will never arrive. */
    const page = await connect(browserPath, BASELINE_CDP, { adsBlocked: true });
    await page.call("Network.setBlockedURLs", { urls: ["*/js/ads.js"] }, page.sessionId);

    let comparisons = 0;
    let differences = 0;
    for (const [name, urlPath] of PAGES) {
        for (const width of WIDTHS) {
            await page.navigate(`http://localhost:${PORT}${urlPath}`, width);
            const now = await page.evaluate(PARITY_SNAPSHOT);
            await page.navigate(`http://localhost:${BASELINE_PORT}${urlPath}`, width);
            const head = await page.evaluate(PARITY_SNAPSHOT);
            Object.keys(now).forEach((key) => {
                comparisons += 1;
                if (JSON.stringify(now[key]) !== JSON.stringify(head[key])) {
                    differences += 1;
                    console.log(`      ${name} @${width} ${key}: now ${JSON.stringify(now[key])}, HEAD ${JSON.stringify(head[key])}`);
                }
            });
        }
    }
    page.close();
    server.killTree();

    check(`ads blocked: working tree matches HEAD (${comparisons} measurements)`,
        differences === 0, `${differences} differing measurements, listed above`);
}

/* ========================================================================== */

async function main() {
    console.log("TemplateBox layout verification");

    staticChecks();

    if (!QUICK) {
        const browserPath = findBrowser();
        if (!browserPath) {
            console.log("\nSKIP  no Chrome/Edge/Chromium found; static checks only");
        } else {
            const server = startServer(ROOT, PORT);
            if (!await waitForServer(PORT)) {
                server.killTree();
                throw new Error(`could not start \`npx serve\` on port ${PORT} from the repository root`);
            }
            const page = await connect(browserPath, CDP_PORT);
            try {
                await layoutChecks(page);
                await launchChecks(page);
            } finally {
                page.close();
            }
            if (!NO_BASELINE) { await parityChecks(browserPath); }
            server.killTree();
        }
    }

    console.log(`\n${passed} passed, ${failures.length} failed`);
    if (failures.length) {
        console.log("\nFailures:");
        failures.forEach((f) => console.log("  - " + f.name));
    }
    process.exit(failures.length ? 1 : 0);
}

main().catch((err) => { console.error("\n" + err.stack); process.exit(1); });
