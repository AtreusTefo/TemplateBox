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
    ["post", "/post.html"],
    /* search.html joined the content-rail family on August 24, 2026. It is
       the page the phone and tablet search control opens, so it is a mobile
       surface first -- which makes the anchor band, not the rail, the one
       that matters most here. */
    ["search", "/search.html"]
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
    const searchJs = fs.readFileSync(path.join(SITE, "js", "search.js"), "utf8");

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
    /* js/search.js joined this scan on August 24, 2026. It builds the search
       page out of hooks in search.html and out of the real catalog markup in
       index.html, so it has MORE ways to be silently wrong than app.js does:
       a renamed hook leaves it rendering an empty page with no error. */
    const sources = { "js/app.js": appJs, "js/ads.js": adsJs, "js/search.js": searchJs };

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

    /* 1j. admin.html's Catalog Thumbnails picker holds a hardcoded copy of the
           homepage catalog: CATALOG_ITEMS in js/admin.js. It exists because the
           feed has no data file to read -- the cards are hand-written markup,
           deliberately, so the card titles stay crawlable links to the editors
           -- which makes this the same duplication shape as the route
           whitelist above and the footer constant that already drifted once.

           A card added to index.html alone is not offered as an existing item,
           so attaching a thumbnail to it generates a whole new <article>
           instead of the .card-preview block the card actually needs, and the
           operator finds out by pasting the wrong thing into the homepage. A
           card removed or renamed leaves a picker entry that writes a file
           path nothing references. Nothing fails at runtime in either case:
           both halves keep working perfectly on their own, which is exactly
           why this is asserted rather than trusted.

           The id rule mirrors js/admin.js: data-doc where a card carries one,
           otherwise the title slugified. Titles are compared literally, so an
           entity in the markup that is a bare character in the JS would read
           as drift -- correctly, since the generated markup would then differ
           from the card it replaces. */
    const adminJs = fs.readFileSync(path.join(SITE, "js", "admin.js"), "utf8");
    const indexHtml = fs.readFileSync(path.join(SITE, "index.html"), "utf8");

    const blockOf = (src, opener, closer) => {
        const start = src.indexOf(opener);
        if (start === -1) { return null; }
        const end = src.indexOf(closer, start);
        return end === -1 ? null : src.slice(start + opener.length, end);
    };
    const quoted = (text, name) =>
        (text.match(new RegExp("\\b" + name + ':\\s*"([^"]*)"')) || [])[1] || "";
    const slugish = (value) => String(value || "").toLowerCase()
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

    const catBlock = blockOf(adminJs, "const CATEGORIES = {", "\n    };");
    const itemBlock = blockOf(adminJs, "const CATALOG_ITEMS = [", "\n    ];");

    const adminCats = {};
    [...(catBlock || "").matchAll(/([A-Za-z][A-Za-z0-9_]*):\s*\{([^}]*)\}/g)]
        .forEach(([, key, body]) => {
            adminCats[key] = {
                label: quoted(body, "label"),
                page: quoted(body, "page"),
                target: quoted(body, "target")
            };
        });

    /* Entries carry no nested object, so a brace pair is exactly one entry. */
    const adminItems = [...(itemBlock || "").matchAll(/\{[^{}]*\}/g)].map(([entry]) => ({
        id: quoted(entry, "id"),
        title: quoted(entry, "title"),
        category: quoted(entry, "category"),
        doc: quoted(entry, "doc")
    }));

    const cards = indexHtml.split('<article class="template-card"').slice(1).map((chunk) => {
        const body = chunk.slice(0, chunk.indexOf("</article>"));
        const anchor = body.match(/<a class="card-link"([^>]*)>([^<]*)<\/a>/);
        const attrs = anchor ? anchor[1] : "";
        const attr = (name) => (attrs.match(new RegExp(name + '="([^"]*)"')) || [])[1] || "";
        return {
            category: (body.match(/^\s*data-category="([^"]+)"/) || [])[1] || "",
            title: anchor ? anchor[2].trim() : "",
            doc: attr("data-doc"),
            target: attr("data-target"),
            page: attr("href"),
            label: (body.match(/<p class="card-category">([^<]*)<\/p>/) || [])[1] || ""
        };
    });

    check("js/admin.js declares CATALOG_ITEMS and CATEGORIES",
        adminItems.length > 0 && Object.keys(adminCats).length > 0,
        `parsed ${adminItems.length} item(s) and ${Object.keys(adminCats).length} category(ies); ` +
        "the picker cannot be checked against index.html if either block was renamed or restructured");

    const cardById = new Map();
    cards.forEach((card) => cardById.set(card.doc || slugish(card.title), card));
    const adminById = new Map(adminItems.map((item) => [item.id, item]));

    const absent = [...cardById.keys()].filter((id) => !adminById.has(id));
    check(`admin.html's catalog picker lists every homepage card (${cards.length} cards)`,
        absent.length === 0,
        `on index.html but missing from CATALOG_ITEMS: ${absent.join(", ")}`);

    const orphaned = [...adminById.keys()].filter((id) => !cardById.has(id));
    check("admin.html's catalog picker lists no card index.html does not have",
        orphaned.length === 0,
        `in CATALOG_ITEMS but not on index.html: ${orphaned.join(", ")}`);

    const drifted = [];
    cardById.forEach((card, id) => {
        const entry = adminById.get(id);
        if (!entry) { return; }
        if (entry.title !== card.title) {
            drifted.push(`${id}: title "${entry.title}" vs index.html "${card.title}"`);
        }
        if (entry.category !== card.category) {
            drifted.push(`${id}: category "${entry.category}" vs index.html "${card.category}"`);
        }
        if (entry.doc !== card.doc) {
            drifted.push(`${id}: data-doc "${entry.doc}" vs index.html "${card.doc}"`);
        }
    });
    check("every CATALOG_ITEMS entry matches its card's title, category and variant",
        drifted.length === 0, drifted.join("\n      "));

    /* CATEGORIES supplies the label, editor page and data-target the generated
       markup writes for a NEW card. If a category's cards disagree with it,
       every card generated for that category is wrong in the same way. */
    const catDrift = new Set();
    cards.forEach((card) => {
        const cat = adminCats[card.category];
        if (!cat) {
            catDrift.add(`"${card.category}" is used on index.html but not declared in CATEGORIES`);
            return;
        }
        if (cat.label !== card.label) {
            catDrift.add(`${card.category}: label "${cat.label}" vs index.html "${card.label}"`);
        }
        if (cat.page !== card.page) {
            catDrift.add(`${card.category}: page "${cat.page}" vs index.html "${card.page}"`);
        }
        if (cat.target !== card.target) {
            catDrift.add(`${card.category}: target "${cat.target}" vs index.html "${card.target}"`);
        }
    });
    check("every CATEGORIES record matches the cards it describes",
        catDrift.size === 0, [...catDrift].join("\n      "));

    /* 1k. Every local image a page references must exist on disk.

           This is the August 24, 2026 breakage: admin.html's publish deleted
           the superseded thumbnails before rewriting index.html, the rewrite
           then failed, and the homepage was left pointing at two files that
           had just been removed. The card rendered as a broken-image icon and
           nothing anywhere failed -- the suite passed, because every check it
           had asked whether the markup was well formed, never whether the
           files it names are actually there.

           Deliberately broader than that one bug: it also catches a thumbnail
           downloaded but never placed, a typo in a hand-pasted path, and a
           file renamed without its reference. Cheap, since it is one stat per
           src. Only local paths are checked; anything absolute or protocol-
           relative belongs to a third party this suite cannot vouch for. */
    pages.forEach((file) => {
        const rel = path.relative(ROOT, file);
        const html = fs.readFileSync(file, "utf8");
        const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "");
        const dir = path.dirname(file);
        const broken = [];
        const seen = new Set();

        [...withoutComments.matchAll(/<img\b[^>]*?\ssrc="([^"]+)"/g)]
            .map((m) => m[1])
            .filter((src) => src && !/^(https?:)?\/\//.test(src) && !src.startsWith("data:"))
            .forEach((src) => {
                if (seen.has(src)) { return; }
                seen.add(src);
                /* Query strings and fragments are not part of the file name. */
                const clean = decodeURI(src.split("?")[0].split("#")[0]);
                const target = clean.startsWith("/")
                    ? path.join(SITE, clean)
                    : path.join(dir, clean);
                if (!fs.existsSync(target)) { broken.push(src); }
            });

        if (!seen.size) { return; }
        check(`${rel}: every local <img> src exists on disk (${seen.size} checked)`,
            broken.length === 0, `missing file(s): ${broken.join(", ")}`);
    });

    /* The catalog-empty message names the card count. It said 17 against
       eighteen cards until August 22, 2026, because adding a card does not
       force anyone to touch that sentence. */
    const stated = indexHtml.match(/class="catalog-empty"[\s\S]{0,300}?see all (\d+)/);
    check(`index.html's catalog-empty message states the real card count (${cards.length})`,
        stated !== null && Number(stated[1]) === cards.length,
        stated ? `message says ${stated[1]}, index.html has ${cards.length} cards`
            : "no \"see all N\" count found in the catalog-empty message");
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
    const attemptNavigate = async (url, width, height) => {
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
            return true;
        }
        return false;
    };

    /* One retry, announced.

       A navigation occasionally fails to settle here for reasons that have
       nothing to do with the page: `npx serve` stalls a request under load and
       js/ads.js never evaluates, so the readiness poll waits for a TBAds that
       is not coming. It is intermittent, it lands on a different page every
       time, and it kills the whole run -- an expensive way to learn nothing,
       on a suite that takes minutes and that nothing runs automatically.

       Retried ONCE and printed when it happens, rather than silently or by
       raising the deadline. A page that genuinely cannot load fails on the
       second attempt exactly as it did before, and a RETRY line in the output
       is a signal worth seeing: if one starts appearing on the same page every
       run, that is a real defect and not this. */
    const navigate = async (url, width, height) => {
        if (await attemptNavigate(url, width, height)) {
            return;
        }
        console.log(`      RETRY ${url} @${width} did not settle in 20s`);
        if (await attemptNavigate(url, width, height)) {
            return;
        }
        throw new Error("navigation to " + url + " did not settle within 20s, twice");
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

    /* Mega-menu opened, and the sticky furniture after a real scroll.

       The mockup editor joined this loop on August 24, 2026, when its bar
       gained a Mockups dropdown built from the same .nav-more component. It
       is the harder case of the two: the editor's rail is up at every width
       here, and the panel is anchored to a header that is itself inset by
       the body padding the rail reserves. */
    section("2b. Layout: mega-menu open and scrolled state");
    for (const [label, urlPath, railSelector] of [
        ["homepage", "/", ".home-rail"],
        ["mockup editor", "/mockup.html", ".editor-rail"]
    ]) {
        for (const width of [1920, 1440, 1366, 1200]) {
            await page.navigate(`http://localhost:${PORT}${urlPath}`, width);
            const r = await page.evaluate(`(() => {
                const toggle = document.querySelector('[data-nav-more-toggle]');
                if (!toggle) return { skipped: true };
                toggle.click();
                const p = document.querySelector('[data-nav-more-panel]');
                const b = p.getBoundingClientRect();
                const rail = document.querySelector(${JSON.stringify(railSelector)});
                const up = rail && getComputedStyle(rail).display !== 'none' && rail.querySelector('.ad-slot');
                const mid = document.elementFromPoint(b.x + b.width / 2, b.y + 12);
                return { hidden: p.hasAttribute('hidden'), left: +b.x.toFixed(1), right: +b.right.toFixed(1),
                         railLeft: up ? +rail.getBoundingClientRect().x.toFixed(1) : null,
                         reachable: !!(mid && p.contains(mid)) };
            })()`);
            if (r.skipped) { continue; }
            check(`${label} mega-menu @${width}: opens on screen, clear of the column, clickable`,
                !r.hidden && r.left >= 0 && r.reachable &&
                (r.railLeft === null || r.right <= r.railLeft + 0.5),
                JSON.stringify(r));
        }
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

    /* The search page's field is sticky under the header for the same reason
       and by the same mechanism, so it inherits the same failure mode: a
       literal offset would be calibrated on desktop and put the field inside
       the header's box on a phone, where the header is 145px rather than
       85px -- and the header paints over it (z-index 20 against 15). This is
       the page whose entire purpose is that field. Mutation-tested by
       replacing var(--header-h) with the 5.25rem literal: fails at 320, 360,
       390 and 414. */
    for (const width of [320, 360, 390, 414, 768, 1024, 1366, 1920]) {
        await page.navigate(`http://localhost:${PORT}/search.html`, width);
        const r = await page.evaluate(`(async () => {
            window.scrollTo(0, 400);
            await new Promise(r => setTimeout(r, 150));
            const h = document.querySelector('.site-header').getBoundingClientRect();
            const bar = document.querySelector('.search-page-bar');
            if (!bar) { return { missing: true }; }
            const b = bar.getBoundingClientRect();
            const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
            const field = document.querySelector('[data-search-page-input]');
            return { overlap: +Math.max(0, h.bottom - b.top).toFixed(1),
                     coveredByHeader: hit ? document.querySelector('.site-header').contains(hit) : null,
                     fieldVisible: !!field && field.getBoundingClientRect().width > 0 };
        })()`);
        check(`search field @${width}: sticks clear of the header, not under it`,
            !r.missing && r.overlap <= 0.5 && r.coveredByHeader === false && r.fieldVisible,
            JSON.stringify(r));
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

    /* ----------------------------------------------------------------------
       2f. Catalog thumbnails fill their card.

       .card-preview is a 4:5 window and .card-preview.photo .card-thumb is
       object-fit: contain, so an off-ratio file letterboxes. The Leaning Wood
       Frame pair shipped at 1000x1000 and left about a fifth of its card as
       empty ground -- visible on the page, invisible to every check, because
       nothing measured the image against the card it sits in.

       `contain` is deliberate and is not what this asserts against. The fix
       was to make the FILE 4:5, at which point contain and cover are
       identical. So the contract is: the thumbnail files are the card's
       shape. admin.html's intake enforces it for every future upload; this
       is what catches one that got on disk another way.

       The attribute check is the second half of the same defect. width and
       height on the <img> are what reserve the box before the image arrives,
       so a file re-cropped without updating them trades a visible gap for a
       layout shift -- quieter, and worse.
       ---------------------------------------------------------------------- */
    section("2f. Layout: catalog thumbnails fill their card");
    await page.navigate(`http://localhost:${PORT}/`, 1440);
    const thumbs = await page.evaluate(`(async () => {
        const out = [];
        const imgs = [...document.querySelectorAll('.card-preview.photo .card-thumb')];
        for (const img of imgs) {
            /* They are loading="lazy", so an offscreen one never decodes and
               would report 0x0 naturals. */
            img.loading = 'eager';
            img.scrollIntoView({ block: 'center' });
            if (!img.complete || !img.naturalWidth) {
                await new Promise(r => { img.onload = r; img.onerror = r; setTimeout(r, 3000); });
            }
            await new Promise(r => requestAnimationFrame(r));
            const box = img.getBoundingClientRect();
            const card = img.closest('.card-preview').getBoundingClientRect();

            /* getBoundingClientRect on an <img> returns the ELEMENT box, and
               the element is width:100%/height:100%, so it always equals the
               card whatever the image inside it is doing. Measuring that and
               calling it "fills the card" is a check that cannot fail -- it
               reported the letterboxed 707x1000 poster as filling. The
               PAINTED box has to be derived from object-fit: contain, which
               scales to whichever axis runs out first. */
            const natRatio = img.naturalHeight ? img.naturalWidth / img.naturalHeight : 0;
            const boxRatio = box.height ? box.width / box.height : 0;
            const paintedW = natRatio > boxRatio ? box.width : box.height * natRatio;
            const paintedH = natRatio > boxRatio ? box.width / natRatio : box.height;

            out.push({
                file: (img.getAttribute('src') || '').split('/').pop(),
                ratio: img.naturalHeight ? +(natRatio).toFixed(4) : null,
                gapW: +(card.width - paintedW).toFixed(1),
                gapH: +(card.height - paintedH).toFixed(1),
                attr: img.getAttribute('width') + 'x' + img.getAttribute('height'),
                natural: img.naturalWidth + 'x' + img.naturalHeight
            });
        }
        return out;
    })()`);

    check("catalog: photo thumbnails found on the homepage",
        thumbs.length > 0, "no .card-preview.photo .card-thumb elements");

    thumbs.forEach((t) => {
        /* 2.5px of slack: .card-preview carries a 1px border on each side. */
        check(`thumbnail ${t.file}: 4:5 and fills its card`,
            t.ratio !== null && Math.abs(t.ratio - 0.8) <= 0.001 &&
            t.gapW <= 2.5 && t.gapH <= 2.5,
            JSON.stringify(t));
        check(`thumbnail ${t.file}: declared size matches the file`,
            t.attr === t.natural, JSON.stringify(t));
    });

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

    /* ----------------------------------------------------------------------
       3b. The header search control must actually produce a search surface.

       This is the August 24, 2026 bug, and it is stated as an OUTCOME on
       purpose. The control was a button toggling a `search-open` class, and
       the one rule that turned the hidden field back on lived inside
       `@media (max-width: 22.5rem)` while the display:none it was undoing was
       scoped to 62rem. So from 361px to 992px -- every phone wider than an
       iPhone SE and every tablet below 992px -- tapping search set a class
       and changed nothing on the screen. Nothing errored, and at 360px, the
       width anyone testing a phone reaches for first, it worked perfectly.

       Asserting "the control is a link to search.html" would pass a page
       where search.html renders nothing, so this follows the click and
       requires a focused, usable field at the other end. Mutation-tested by
       putting the old button and its 22.5rem reveal rule back: fails at 390,
       414 and 768, and passes at 320 and 360, which is exactly the shape of
       the original bug.

       The widths stop at 768 because 62rem (992px) is where the header's own
       inline field appears and the control is deliberately hidden -- two
       search affordances in one bar is the thing that gate exists to
       prevent. The band from there to the rail's floor is covered by the
       second loop below, which requires the field itself to be there and to
       work, so no width between 320 and 1200 is left unasserted.
       ---------------------------------------------------------------------- */
    section("3b. Search entry point (trusted input)");
    for (const width of [320, 360, 390, 414, 768]) {
        await page.navigate(`http://localhost:${PORT}/`, width);
        const control = await page.evaluate(`(() => {
            const el = document.querySelector('.site-header .search-toggle');
            if (!el) { return { missing: true }; }
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden') { return { hidden: true }; }
            el.scrollIntoView({ block: 'center' });
            const b = el.getBoundingClientRect();
            return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
        })()`);

        if (control.missing || control.hidden) {
            check(`search control @${width}: present and visible in the header`,
                false, JSON.stringify(control));
            continue;
        }

        await clickAt(control, "left");
        const after = await page.evaluate(`(() => {
            const field = document.querySelector('[data-search-page-input]');
            const usable = !!field && getComputedStyle(field).display !== 'none' &&
                field.getBoundingClientRect().width > 0;
            return { path: location.pathname, usable: usable,
                     focused: !!field && document.activeElement === field };
        })()`);

        check(`search control @${width}: opens a usable, focused search field`,
            after.path === "/search.html" && after.usable && after.focused,
            JSON.stringify(after));
    }

    /* From 62rem up the header carries the field itself and filters the
       catalog in place, which is the right behaviour on the page that IS the
       catalog. What must not happen is the band being served by neither: the
       control hidden because the field is "there", and the field
       display:none because the viewport is "small". That is precisely the
       shape of the bug above, one band over. */
    for (const width of [1024, 1200, 1440]) {
        await page.navigate(`http://localhost:${PORT}/`, width);
        const r = await page.evaluate(`(() => {
            const field = document.querySelector('[data-search-input]');
            if (!field) { return { missing: true }; }
            field.value = 'rent';
            field.dispatchEvent(new Event('input', { bubbles: true }));
            const cards = [...document.querySelectorAll('.catalog-grid .template-card')];
            return {
                visible: getComputedStyle(field).display !== 'none' &&
                         field.getBoundingClientRect().width > 0,
                shown: cards.filter(c => !c.classList.contains('is-hidden')).length,
                total: cards.length
            };
        })()`);
        check(`inline search field @${width}: present and filtering in place`,
            !r.missing && r.visible && r.shown > 0 && r.shown < r.total,
            JSON.stringify(r));
    }

    /* ----------------------------------------------------------------------
       3c. Cards on the search page must stay inside the monetized flow.

       js/app.js binds [data-target] once, at DOMContentLoaded, inside
       initCatalog. Every card on search.html is imported from index.html
       AFTER that pass has run, so it is bound only because js/search.js asks
       for it explicitly. Get that wrong and the cards look perfect and go
       straight to the editor, skipping the interstitial the site is funded
       by -- with nothing anywhere to say so.

       Found exactly that way during the build: the first version guarded the
       call with `window.TB`, which is always false because js/app.js declares
       TB as a top-level const (a lexical global, not a window property), and
       a result card navigated straight to docs.html.
       ---------------------------------------------------------------------- */
    section("3c. Search page cards route through the interstitial");
    for (const [label, pageUrl, selector] of [
        /* Both states, because they are populated by different code paths:
           the results list is built once and filtered, the browse rows are
           built per category. Binding one and not the other is a live
           possibility, and the query string is what decides which of the two
           is on screen -- a browse row is display:none while a query is
           present, and a click on a hidden element goes nowhere. */
        ["results", "/search.html?q=rent",
            "[data-search-page-templates] .template-card:not(.is-hidden) .card-link"],
        ["browse row", "/search.html", ".browse-row .template-card .card-link"]
    ]) {
        await page.navigate(`http://localhost:${PORT}${pageUrl}`, 1024);
        /* The catalog arrives by fetch, so the cards are not in the document
           at load. Poll rather than sleep. */
        const box = await page.evaluate(`(async () => {
            for (let i = 0; i < 60; i += 1) {
                const a = document.querySelector(${JSON.stringify(selector)});
                if (a) {
                    a.scrollIntoView({ block: 'center' });
                    const b = a.getBoundingClientRect();
                    return { x: b.x + b.width / 2, y: b.y + b.height / 2,
                             target: a.getAttribute('data-target') };
                }
                await new Promise(r => setTimeout(r, 100));
            }
            return { missing: true };
        })()`);

        if (box.missing) {
            check(`search page ${label}: a card is present to click`, false,
                `no card matched ${selector}`);
            continue;
        }

        await clickAt(box, "left");
        const url = await page.evaluate("location.pathname + location.search");
        check(`search page ${label} click routes through the interstitial`,
            url === "/loading.html?target=" + box.target,
            "landed on " + url);
    }

    /* ----------------------------------------------------------------------
       3d. The mockup editor's own Mockups dropdown.

       Its items are plain anchors carrying data-target and data-doc, bound by
       the same bindLaunchControls pass every other launch control on the site
       goes through. Nothing about that is special-cased for this bar, which
       is exactly why it is worth asserting: the href points at mockup.html,
       so a binding that failed to attach would look like a working link that
       reloads the editor -- losing the interstitial AND the chosen mockup,
       silently, since the preset is written by the same handler.

       Run at both states of the bar: at 1440 the dropdown is inline, at 768
       it is inside the hamburger, and they are different paint paths.
       ---------------------------------------------------------------------- */
    section("3d. Mockup dropdown routes through the interstitial");
    for (const [label, width, collapsed] of [["desktop", 1440, false], ["collapsed", 768, true]]) {
        await page.navigate(`http://localhost:${PORT}/mockup.html`, width);
        const box = await page.evaluate(`(async () => {
            ${collapsed ? "document.querySelector('[data-nav-toggle]').click();" : ""}
            await new Promise(r => setTimeout(r, 150));
            document.querySelector('[data-nav-more-toggle]').click();
            await new Promise(r => setTimeout(r, 200));
            const a = document.querySelector('[data-nav-more-panel] a[data-doc="wood-a4"]');
            if (!a) { return { missing: true }; }
            a.scrollIntoView({ block: 'center' });
            const b = a.getBoundingClientRect();
            return { x: b.x + b.width / 2, y: b.y + b.height / 2,
                     target: a.getAttribute('data-target'), doc: a.getAttribute('data-doc') };
        })()`);

        if (box.missing) {
            check(`mockup dropdown (${label}): the item is present`, false, "no wood-a4 item");
            continue;
        }

        await clickAt(box, "left");
        const landed = await page.evaluate(`(() => ({
            url: location.pathname + location.search,
            preset: localStorage.getItem('tb_editor_preset')
        }))()`);
        check(`mockup dropdown (${label}): routes through the interstitial with the preset`,
            landed.url === "/loading.html?target=" + box.target &&
            landed.preset === JSON.stringify(box.doc),
            JSON.stringify(landed));
    }
}

/* ==========================================================================
   5. Mockup editor: the background colour (August 24, 2026).

   Asserted against the CANVAS, not against the controls. The whole value of
   this feature is what comes out of the export, and every route to a wrong
   export is silent: a background painted in CSS would look right on screen
   and be absent from the PNG; a background applied to a photographic
   template would paint behind a scene that already has a backdrop, or -- for
   a "window" template like wood-a4, whose base is transparent inside its
   print opening -- behind the artwork itself.

   Pixel (2, 2) is the corner of the canvas, which is outside every product's
   own drawing and outside every photograph's print window, so it reads the
   background and nothing else.
   ========================================================================== */

async function mockupChecks(page) {
    section("5. Mockup editor: background colour");

    const CORNER = `(() => {
        const c = document.getElementById('mockup-canvas');
        return [...c.getContext('2d').getImageData(2, 2, 1, 1).data].join(',');
    })()`;

    /* Start from a clean profile, and not as a formality: section 3d clicks a
       Mockups dropdown item, which WRITES tb_editor_preset and then navigates
       to the interstitial, where the run stops. The preset is consumed by the
       next mockup.html load, so without this the checks below would open the
       wood frame template instead of the default drawn t-shirt and report
       "no background panel" as a product failure. They did, once. */
    await page.navigate(`http://localhost:${PORT}/mockup.html`, 1440);
    await page.evaluate("localStorage.clear(), true");

    /* A drawn product: eligible, because everything around the garment is
       transparent and exports that way. */
    await page.navigate(`http://localhost:${PORT}/mockup.html`, 1440);
    const vector = await page.evaluate(`(async () => {
        const field = document.getElementById('m-bg-field');
        const row = document.getElementById('m-bg-row');
        if (!field || !row) { return { missing: true }; }
        const corner = () => ${CORNER};
        const before = corner();
        const exportBefore = document.getElementById('mockup-canvas').toDataURL('image/png');
        /* Index 3 is Light Grey; index 0 is Transparent. */
        row.querySelectorAll('.swatch')[3].click();
        await new Promise(r => setTimeout(r, 250));
        const after = corner();
        const exportAfter = document.getElementById('mockup-canvas').toDataURL('image/png');
        const stored = (JSON.parse(localStorage.getItem('tb_mockup_v1') || '{}')).bg;
        row.querySelectorAll('.swatch')[0].click();
        await new Promise(r => setTimeout(r, 250));
        return {
            hidden: field.hidden, before: before, after: after,
            exportChanged: exportBefore !== exportAfter, stored: stored,
            cleared: corner(),
            clearedStore: (JSON.parse(localStorage.getItem('tb_mockup_v1') || '{}')).bg
        };
    })()`);

    check("mockup: background panel offered on a drawn product",
        !vector.missing && vector.hidden === false, JSON.stringify(vector));
    check("mockup: no background by default, so the export stays transparent",
        vector.before === "0,0,0,0", `corner ${vector.before}`);
    check("mockup: a chosen background reaches the canvas and the export",
        vector.after === "229,229,226,255" && vector.exportChanged &&
        vector.stored === "#E5E5E2",
        JSON.stringify(vector));
    check("mockup: Transparent returns the canvas to no background at all",
        vector.cleared === "0,0,0,0" && vector.clearedStore === null,
        JSON.stringify({ cleared: vector.cleared, stored: vector.clearedStore }));

    /* A photographic template: NOT eligible unless it declares
       `background: true`. Seeded with a stored background from an eligible
       product, which must not reach this canvas -- the storage is shared
       across products. */
    await page.navigate(`http://localhost:${PORT}/mockup.html`, 1440);
    const photo = await page.evaluate(`(async () => {
        localStorage.setItem('tb_editor_preset', JSON.stringify('wood-a4'));
        localStorage.setItem('tb_mockup_v1', JSON.stringify({ product: 'tshirt', bg: '#FF0000' }));
        return true;
    })()`);
    if (photo) {
        await page.navigate(`http://localhost:${PORT}/mockup.html`, 1440);
        const r = await page.evaluate(`(async () => {
            for (let i = 0; i < 60; i += 1) {
                const label = document.getElementById('mockup-canvas').getAttribute('aria-label');
                if (label && label.indexOf('Leaning Wood Frame') === 0) { break; }
                await new Promise(r => setTimeout(r, 100));
            }
            return { label: document.getElementById('mockup-canvas').getAttribute('aria-label'),
                     hidden: document.getElementById('m-bg-field').hidden,
                     corner: ${CORNER} };
        })()`);
        /* The panel being hidden is the whole assertion here, and that is a
           deliberate limit rather than a thin test. A companion pixel check
           ("the stored red never reaches this canvas") was written first and
           then removed: mutating backgroundEligible to return true for every
           template did NOT make it fail. On a "window" template the base
           photograph is opaque everywhere except its print opening, and the
           opening is covered by the white paper backing, so a background
           painted behind it is invisible at every pixel. An assertion that
           cannot fail is not evidence, so the honest contract to assert is
           the one that can: the control is not offered. */
        check("mockup: background panel absent on a photographic template",
            r.hidden === true, JSON.stringify(r));
    }

    /* The refactor that made one picker into two must not have cost the
       product colourway path anything. Pixel (500, 300) is garment fabric on
       the drawn t-shirt, above the print area.

       Storage is cleared first, and that is not housekeeping: the block above
       seeds a red background to prove it cannot reach a photographic
       template, and a drawn product IS eligible for it, so without this the
       corner assertion below would read that red and fail for the wrong
       reason. It did, on the first run. */
    await page.navigate(`http://localhost:${PORT}/mockup.html`, 1440);
    await page.evaluate("localStorage.clear(), true");
    await page.navigate(`http://localhost:${PORT}/mockup.html`, 1440);
    const colorway = await page.evaluate(`(async () => {
        const fabric = () => {
            const c = document.getElementById('mockup-canvas');
            return [...c.getContext('2d').getImageData(500, 300, 1, 1).data].join(',');
        };
        const before = fabric();
        document.getElementById('m-color-trigger').click();
        const opened = !document.getElementById('m-color-popover').hidden;
        const hex = document.getElementById('m-color-in-hex');
        hex.value = '#123456';
        hex.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 250));
        const typed = fabric();
        const swatches = document.querySelectorAll('#m-color-row .swatch');
        swatches[3].click();
        await new Promise(r => setTimeout(r, 250));
        return { opened: opened, before: before, typed: typed, swatched: fabric(),
                 swatchHex: swatches[3].getAttribute('data-hex'),
                 active: document.querySelectorAll('#m-color-row .swatch.is-active').length,
                 corner: ${CORNER} };
    })()`);

    check("mockup: the colourway picker still drives the garment",
        colorway.opened && colorway.typed === "18,52,86,255" &&
        colorway.swatched === "31,42,68,255" && colorway.active === 1,
        JSON.stringify(colorway));
    check("mockup: a garment colour is not a background",
        colorway.corner === "0,0,0,0", `corner ${colorway.corner}`);

    /* ----------------------------------------------------------------------
       5b. The editor bar's two states.

       ONE boundary, 75rem, and every control belongs to exactly one side of
       it. The failure this guards against is the one the header search
       control already produced once: a band where a control is hidden
       because "the other one is there" and the other one is hidden too, so
       the band is served by neither.

       The single-row assertion is not cosmetic. This is a sticky header on a
       workspace: measured at 390px, the bar wrapped to a second row and went
       from 85px to 141px as soon as it carried the label on the download
       button, which is 56px taken permanently out of a phone viewport.
       ---------------------------------------------------------------------- */
    section("5b. Mockup editor: bar composition at both states");

    const BAR = `(() => {
        const vis = (sel) => {
            const el = document.querySelector(sel);
            return !!el && getComputedStyle(el).display !== 'none' &&
                   el.getBoundingClientRect().width > 0;
        };
        return {
            brand: vis('.editor-brand'), home: vis('.editor-home'),
            hamburger: vis('.nav-toggle'), searchButton: vis('.search-toggle'),
            field: vis('.editor-search'), dropdown: !!document.querySelector('[data-nav-more-toggle]'),
            docName: !!document.getElementById('doc-name'),
            label: !!document.getElementById('m-label'),
            headerHeight: Math.round(document.querySelector('.site-header').getBoundingClientRect().height),
            downloadName: (document.getElementById('download-mockup-png') || {}).textContent
        };
    })()`;

    for (const width of [1920, 1440, 1280, 1200]) {
        await page.navigate(`http://localhost:${PORT}/mockup.html`, width);
        const b = await page.evaluate(BAR);
        check(`mockup bar @${width}: wordmark, dropdown and field, one row`,
            b.brand && !b.home && b.field && !b.hamburger && !b.searchButton &&
            b.dropdown && b.headerHeight <= 100,
            JSON.stringify(b));
    }

    for (const width of [1199, 1024, 768, 414, 390, 320]) {
        await page.navigate(`http://localhost:${PORT}/mockup.html`, width);
        const b = await page.evaluate(BAR);
        check(`mockup bar @${width}: home icon, hamburger and search button, one row`,
            !b.brand && b.home && !b.field && b.hamburger && b.searchButton &&
            b.dropdown && b.headerHeight <= 100,
            JSON.stringify(b));
        /* The label is hidden visually on phones but must still name the
           button, or the only download control on the page is an unlabelled
           icon to a screen reader. */
        check(`mockup bar @${width}: the download button keeps its name`,
            (b.downloadName || "").indexOf("Download PNG") !== -1,
            JSON.stringify({ name: b.downloadName }));
    }

    /* The bar's name field is gone and the controls' one is what replaced
       it. Asserted together: removing the first without the second would
       leave the editor with no way to name a mockup at all. */
    await page.navigate(`http://localhost:${PORT}/mockup.html`, 1440);
    const naming = await page.evaluate(BAR);
    check("mockup: no name input in the bar, and the controls still have one",
        naming.docName === false && naming.label === true,
        JSON.stringify({ docName: naming.docName, mLabel: naming.label }));
}

/* ==========================================================================
   6. admin.html's thumbnail intake reshapes uploads to the card (August 24,
   2026).

   Section 2f asserts that what is ON DISK fills its card. This asserts that
   what the tool PRODUCES will, which is the half that stops the defect coming
   back: the card window is 4:5, the stylesheet shows a thumbnail with
   object-fit: contain, and an off-ratio file therefore letterboxes. Making
   the file the card's shape is what retires the question.

   The small-square case is the original bug, not a hypothetical. An upload
   already under the byte budget and under the maximum edge is kept byte for
   byte -- and before this, shape was not part of that test, so a square file
   went straight to disk untouched. That is how a 1000x1000 pair came to lose
   a fifth of its card.
   ========================================================================== */

async function adminThumbnailChecks(page) {
    section("6. Admin: thumbnail intake reshapes uploads to the card");

    await page.navigate(`http://localhost:${PORT}/admin.html`, 1440);

    const feed = async (w, h, mode, small) => page.evaluate(`(async () => {
        const c = document.createElement('canvas');
        c.width = ${w}; c.height = ${h};
        const x = c.getContext('2d');
        const g = x.createLinearGradient(0, 0, ${w}, ${h});
        g.addColorStop(0, '#2F4FCD'); g.addColorStop(1, '#E9A13B');
        x.fillStyle = g; x.fillRect(0, 0, ${w}, ${h});

        /* A small, in-budget, allowed-type upload is the one that can skip
           re-encoding entirely, so it has to be encoded as such. */
        const blob = ${small}
            ? await new Promise(r => c.toBlob(r, 'image/webp', 0.5))
            : await new Promise(r => c.toBlob(r, 'image/png'));
        const file = new File([blob], ${small} ? 'probe.webp' : 'probe.png',
            { type: ${small} ? 'image/webp' : 'image/png' });

        const dt = new DataTransfer();
        dt.items.add(file);
        const fit = document.querySelector('[data-thumb-fit]');
        if (!fit) { return { missing: 'the fit control' }; }
        fit.value = ${JSON.stringify(mode)};
        const input = document.querySelector('[data-thumb-default-file]');
        input.value = '';
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));

        for (let i = 0; i < 200; i += 1) {
            await new Promise(r => setTimeout(r, 100));
            const err = document.querySelector('[data-thumb-default-error]').textContent;
            if (err) { return { error: err }; }
            const note = document.querySelector('[data-thumb-default-note]').textContent;
            if (note && (note.indexOf('Compressed') === 0 || note.indexOf('Kept') === 0)) {
                const img = document.querySelector('[data-thumb-preview-default]');
                if (img && !img.complete) {
                    await new Promise(r => { img.onload = r; img.onerror = r; setTimeout(r, 3000); });
                }
                return { note: note, w: img.naturalWidth, h: img.naturalHeight,
                         ratio: img.naturalHeight ? +(img.naturalWidth / img.naturalHeight).toFixed(4) : null };
            }
        }
        return { error: 'timed out waiting for the intake' };
    })()`);

    for (const [label, w, h, mode, small] of [
        ["square 1000x1000, fill", 1000, 1000, "fill", false],
        ["square 1000x1000, fit", 1000, 1000, "fit", false],
        ["wide 1600x900, fill", 1600, 900, "fill", false],
        ["wide 1600x900, fit", 1600, 900, "fit", false],
        /* The alreadyFits path: small enough and few enough pixels to be kept
           byte for byte, so only the ratio test can send it to the reshaper. */
        ["small square webp, in budget", 500, 500, "fill", true]
    ]) {
        const r = await feed(w, h, mode, small);
        check(`admin intake: ${label} comes out 4:5`,
            !r.error && !r.missing && r.ratio !== null &&
            Math.abs(r.ratio - 0.8) <= 0.001,
            JSON.stringify(r));
    }

    /* The preview is the operator's only view of what will be written, so it
       has to show the PROCESSED image rather than the file they picked. */
    const last = await feed(1000, 1000, "fill", false);
    check("admin intake: the preview shows the processed image",
        !last.error && last.w === 800 && last.h === 1000 &&
        /cropped to 4:5/.test(last.note || ""),
        JSON.stringify(last));
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
        /* A page added since the last commit has no baseline to be identical
           to, and comparing it against the baseline server's 404 would report
           every one of its measurements as a difference -- noise that says
           nothing about whether ads reserve space they have not filled. Skip
           it, loudly, rather than letting a new page turn this section red
           until it is committed. It stops being skipped on the next run after
           the commit, with no edit here. */
        const inHead = await (async () => {
            try {
                const res = await fetch(`http://localhost:${BASELINE_PORT}${urlPath}`,
                    { method: "HEAD" });
                return res.ok;
            } catch (e) {
                return false;
            }
        })();
        if (!inHead) {
            console.log(`      SKIP  ${name}: not in HEAD yet, no baseline to compare against`);
            continue;
        }
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
                await mockupChecks(page);
                await adminThumbnailChecks(page);
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
