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
   boundary. 1344 and 1488 are the 84rem and 93rem gates themselves. */
const PAGES = [
    ["index", "/"],
    ["resume", "/resume.html"],
    ["docs", "/docs.html"],
    ["poster", "/poster.html"],
    ["mockup", "/mockup.html"]
];
const WIDTHS = [1920, 1600, 1488, 1440, 1366, 1344, 1200, 1024, 768, 320];

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
    ["EDITOR_RAIL_STACK", "HOME_RAIL_STACK"].forEach((constName) => {
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

    /* 1f. The homepage's `display: none` gate must be declared AFTER the
           shared .editor-rail/.home-rail rule. Media queries carry no
           specificity, so written before it the gate loses to the shared
           `display: flex` and the rail appears on every viewport it is meant
           to skip -- with nothing failing anywhere to say so. Source order is
           the whole contest, which makes it worth a test. */
    const css = fs.readFileSync(path.join(SITE, "css", "style.css"), "utf8");
    const sharedRule = css.search(/\.editor-rail,\s*\.home-rail\s*\{/);
    const homeGate = css.search(/@media\s*\(max-width:\s*74\.9375rem\)/);
    check("the homepage rail's display gate is declared after the shared rule",
        sharedRule !== -1 && homeGate !== -1 && homeGate > sharedRule,
        `shared rule at ${sharedRule}, gate at ${homeGate}`);

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
    return spawn(`npx serve -l ${port}`, { cwd, stdio: "ignore", shell: true });
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
  const rail = document.querySelector('.editor-rail, .home-rail');
  const railShown = rail ? getComputedStyle(rail).display !== 'none' : false;
  const filled = rail ? [...rail.querySelectorAll('[data-ad-rail-slot] .ad-slot')] : [];
  const lb = document.querySelector('.editor-leaderboard');
  const anchor = document.querySelector('.editor-anchor, .site-anchor');
  const anchorShown = anchor ? getComputedStyle(anchor).display !== 'none' : false;
  return {
    innerWidth: window.innerWidth, innerHeight: window.innerHeight,
    clientWidth: de.clientWidth, scrollWidth: de.scrollWidth,
    bodyPadRight: parseFloat(getComputedStyle(document.body).paddingRight),
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

               The single documented exception is the homepage between 48rem
               and 75rem, which shows nothing by design: too narrow for the
               rail, too wide for the phone anchor. */
            const railUp = !!(s.rail && s.rail.shown && s.rail.filledCount > 0);
            const bands = [railUp, s.leaderboardShown, !!(s.anchor && s.anchor.shown)].filter(Boolean).length;
            const expected = (name === "index" && width > 768 && width < 1200) ? 0 : 1;
            check(`${tag}: exactly ${expected} ad band mounts`, bands === expected,
                `got ${bands} -- rail=${railUp} leaderboard=${s.leaderboardShown} anchor=${!!(s.anchor && s.anchor.shown)}`);

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

    for (const [label, urlPath, width] of [["homepage", "/", 1920], ["editor", "/docs.html", 1366]]) {
        await page.navigate(`http://localhost:${PORT}${urlPath}`, width);
        const r = await page.evaluate(`(async () => {
            window.scrollTo(0, 1400);
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            const rail = document.querySelector('.editor-rail, .home-rail');
            const rr = rail.getBoundingClientRect();
            const hd = document.querySelector('.site-header').getBoundingClientRect();
            return { railTop: +rr.y.toFixed(1), railBottom: +rr.bottom.toFixed(1),
                     railLeft: +rr.x.toFixed(1), headerTop: +hd.y.toFixed(1),
                     headerRight: +hd.right.toFixed(1), innerHeight: window.innerHeight };
        })()`);
        check(`${label} scrolled: column still full height, header still inset`,
            r.railTop === 0 && Math.abs(r.railBottom - r.innerHeight) < 1 &&
            r.headerTop === 0 && r.headerRight <= r.railLeft + 0.5,
            JSON.stringify(r));
    }

    /* Print must carry neither the column nor the width it reserved. */
    section("2c. Layout: print output");
    for (const [label, urlPath, width] of [["homepage", "/", 1920], ["editor", "/resume.html", 1366]]) {
        await page.navigate(`http://localhost:${PORT}${urlPath}`, width);
        await page.call("Emulation.setEmulatedMedia", { media: "print" }, page.sessionId);
        const r = await page.evaluate(`(() => {
            const rail = document.querySelector('.editor-rail, .home-rail');
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
        server.kill();
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
    server.kill();

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
                server.kill();
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
            server.kill();
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
