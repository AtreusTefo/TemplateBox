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
/* 880 joined on August 30, 2026, and it is the only entry here that is not a
   band edge or a real device width.

   This list jumped 1024 to 768, which left the whole 769-1023 band untested --
   every tablet in portrait. That was tolerable while nothing distinguished it
   from 1024, and stopped being so when the editors' split view was moved to
   collapse at 63.9375rem: 769-1023 is now a layout no other width in this list
   produces, a single tabbed column with a NON-sticky preview pane, and the
   export bar's anchor lift is a different value there for exactly that reason
   (the sticky allowance applies only where the pane is sticky). Both halves of
   that split were unverified by this suite and were measured by hand instead,
   which is the gap this closes.

   Confirmed to bite before being kept: setting the non-sticky tier's lift to
   the phone tier's 4.75rem makes `poster @880: export bar clears the anchor`
   fail here and nowhere else. */
const WIDTHS = [1920, 1600, 1488, 1440, 1366, 1344, 1336, 1335, 1280, 1200, 1199, 1024, 880, 768, 320];

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

    /* 1k2. The same rule for asset paths named in JavaScript.

            1k above covers <img src> in markup, and that is where it was
            written, so it sailed straight past two broken references that a
            thumbnail re-publish had left in js/mockup-templates.js: the
            registry still named .jpg files that the publish had replaced
            with .webp and deleted. Nothing failed -- the mockup editor's
            template picker simply showed a broken thumbnail, on a page the
            suite was not looking at.

            Any "assets/..." string literal counts, whatever key it sits
            under, because the defect is a dangling path and not a particular
            field name. */
    const assetScripts = ["js/mockup-templates.js", "js/ads.js", "js/app.js"];
    assetScripts.forEach((rel) => {
        const full = path.join(SITE, ...rel.split("/"));
        if (!fs.existsSync(full)) { return; }
        const src = fs.readFileSync(full, "utf8");
        const paths = [...new Set(
            [...src.matchAll(/"(assets\/[^"]+)"/g)].map((m) => m[1])
        )];
        if (!paths.length) { return; }
        const broken = paths.filter((p) => !fs.existsSync(path.join(SITE, p)));
        check(`${rel}: every asset path it names exists on disk (${paths.length} checked)`,
            broken.length === 0, `missing file(s): ${broken.join(", ")}`);
    });

    /* 1k3. Mockup assets live one folder per mockup, and that folder is named
            for the template id (September 3, 2026).

            1k and 1k2 above catch a path that points at nothing. Neither can
            catch a path that RESOLVES but sits in the wrong place, which is
            what a flat folder invites: ids nest here -- "tshirt-model-white"
            is a prefix of "tshirt-model-white-back" -- so a file dropped
            beside its neighbours is claimed by any prefix operation on the
            shorter id. The folder boundary is what removes that class, and a
            convention nothing enforces is one bad paste from being over.

            The file name keeps the id too, deliberately, so an asset still
            identifies itself in a network waterfall or a flat storage bucket
            where the folder is not visible. Both halves are asserted here,
            because either one alone would let the other rot.

            Parsed by hand rather than by regex: the file is a flat list of
            "key: value," lines, and a scanner that tracks the current id is
            both shorter and harder to get subtly wrong than a pattern. */
    {
        const ASSET_KEYS = ["base", "overlay", "displace", "shade", "light",
            "tone", "grain", "garment", "thumb"];
        const registry = fs.readFileSync(
            path.join(SITE, "js", "mockup-templates.js"), "utf8").split("\n");
        const bad = [];
        let current = null;
        let templates = 0;
        let checked = 0;
        registry.forEach((raw) => {
            const line = raw.trim();
            if (line.startsWith("id: \"")) {
                current = line.slice(5, line.indexOf("\"", 5));
                templates += 1;
                return;
            }
            if (!current) { return; }
            const key = ASSET_KEYS.find((k) => line.startsWith(k + ": \"assets/"));
            if (!key) { return; }
            const from = line.indexOf("\"") + 1;
            const value = line.slice(from, line.indexOf("\"", from));
            checked += 1;
            const cut = value.lastIndexOf("/");
            const file = value.slice(cut + 1);
            const folder = value.slice(0, cut);
            const owner = folder.slice(folder.lastIndexOf("/") + 1);
            if (owner !== current) {
                bad.push(value + " is not in a folder named " + current);
            } else if (!file.startsWith(current + "-")) {
                bad.push(value + " does not carry its id in the file name");
            }
        });
        check("mockup assets sit in <category>/<id>/<id>-* ("
            + checked + " paths across " + templates + " templates)",
            bad.length === 0 && checked > 0, bad.slice(0, 4).join("; "));
    }


    /* 1l. Every indexable page declares a social card, that card exists on
           disk, and any size it declares is the file's real size.

           1k above checks <img src> and explicitly skips absolute URLs,
           because those normally belong to a third party. og:image does not:
           it is absolute by protocol requirement -- a crawler resolves it
           without a base -- and it points at our own assets/ folder. That
           exemption left the whole social-card surface unchecked, and three
           separate defects were sitting in it on September 3, 2026:

             - privacy.html and blog.html declared twitter:image and NO
               og:image at all, so every OG consumer (Facebook, LinkedIn,
               Slack, WhatsApp, Discord, Telegram) rendered them with no
               preview image. Nothing failed; nothing could.
             - fifteen pages pointed at logo.png, which is 1219x1509, so every
               platform cropped a tall square into its 1.91:1 frame.
             - the pages that DID carry a real card were the only ones
               declaring og:image:width/height, and the pair had previously
               been wrong sitewide -- 1200x630 declared for that same
               1219x1509 file. A platform reserves the preview frame from the
               declared pair before the file downloads, so a wrong pair
               renders the card badly where a missing one only costs a
               measuring round trip.

           Scoped by <link rel="canonical"> rather than by a filename list,
           which is what makes it maintainable: a page with a canonical is a
           page meant to be indexed and therefore shared, and the tools,
           admin, loading, search and 404 pages carry none, so they are out of
           scope automatically and no exclusion list has to be kept in step.

           The declared-size check reads the PNG's own IHDR rather than
           trusting the filename, because "og-*.png" is a convention and the
           header is a fact. */
    {
        const ORIGIN = "https://templatebox.win";
        const pngSize = (file) => {
            const buf = fs.readFileSync(file);
            /* 8-byte signature, then a chunk header of 4 length + 4 type;
               IHDR's width and height are the first two big-endian uint32s
               of its payload. A PNG that does not start with IHDR is not a
               PNG this project produces. */
            if (buf.length < 24 || buf.toString("latin1", 12, 16) !== "IHDR") { return null; }
            return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
        };

        pages.forEach((file) => {
            const rel = path.relative(ROOT, file);
            const html = fs.readFileSync(file, "utf8").replace(/<!--[\s\S]*?-->/g, "");
            if (!/<link\s+rel="canonical"/.test(html)) { return; }

            const meta = (pattern) => {
                const m = html.match(pattern);
                return m ? m[1] : null;
            };
            const og = meta(/<meta\s+property="og:image"\s+content="([^"]*)"/);
            const tw = meta(/<meta\s+name="twitter:image"\s+content="([^"]*)"/);

            check(`${rel}: declares og:image and twitter:image`,
                !!og && !!tw,
                `og:image=${og || "MISSING"} twitter:image=${tw || "MISSING"}`);
            if (!og) { return; }

            /* Both tags must name the same card. Two different images is not
               a failure of either protocol, but it is always a half-finished
               edit rather than an intention. */
            check(`${rel}: og:image and twitter:image name the same card`,
                og === tw, `og:image=${og} twitter:image=${tw}`);

            /* Only our own origin can be checked; anything else is a third
               party this suite cannot vouch for, exactly as in 1k. */
            if (!og.startsWith(ORIGIN + "/")) { return; }
            const onDisk = path.join(SITE, decodeURI(og.slice(ORIGIN.length + 1).split("?")[0]));
            const exists = fs.existsSync(onDisk);
            check(`${rel}: its social card exists on disk`, exists,
                `${og} resolves to ${path.relative(ROOT, onDisk)}, which is not there`);
            if (!exists) { return; }

            const declaredW = meta(/<meta\s+property="og:image:width"\s+content="([^"]*)"/);
            const declaredH = meta(/<meta\s+property="og:image:height"\s+content="([^"]*)"/);
            if (declaredW === null && declaredH === null) { return; }

            const real = pngSize(onDisk);
            check(`${rel}: the declared og:image size is the file's real size`,
                real !== null && Number(declaredW) === real.w && Number(declaredH) === real.h,
                real === null
                    ? `${path.basename(onDisk)} has no readable PNG header`
                    : `declares ${declaredW}x${declaredH}, file is ${real.w}x${real.h}`);
        });
    }

    /* 1m. Every resume template's `defaultAccent` must be a swatch on
           resume.html's row.

           The invariant is written on the row itself, in an HTML comment,
           and was still broken the first time a template was added after it
           was written: `photo-rail` shipped with a navy that is not on the
           row. Nothing fails at runtime, which is the whole problem --
           applyAccent() marks a swatch active by matching its hex EXACTLY,
           so an off-row default opens the editor with the row showing
           nothing selected, and the moment the visitor tries another colour
           the template's own accent is unreachable forever. It is the
           dead-control defect this project has hit before, and a comment
           asking people to remember is not a check.

           The registry is parsed as text rather than executed: it is a
           browser file that assigns to `window`, and requiring a DOM here
           would put this in the browser sections where it does not belong.
           A template that declares NO defaultAccent is fine and skipped --
           Classic does exactly that on purpose, so it has no opinion about
           colour and a Classic card cannot reset the visitor's choice. */
    const templatesJs = fs.readFileSync(path.join(SITE, "js", "resume-templates.js"), "utf8");
    const resumeHtml = fs.readFileSync(path.join(SITE, "resume.html"), "utf8");

    const swatchHexes = new Set(
        [...resumeHtml.matchAll(/class="swatch[^"]*"[^>]*?data-accent="(#[0-9A-Fa-f]{6})"/g)]
            .map(([, hex]) => hex.toUpperCase()));

    /* id and defaultAccent are paired by ORDER: both appear once per entry,
       and an entry that declares no accent must not borrow the next one's.
       Scanning for whichever comes first keeps each accent with its own id. */
    const tplAccents = [...templatesJs.matchAll(/\b(id|defaultAccent):\s*"([^"]+)"/g)]
        .reduce((acc, [, key, value]) => {
            if (key === "id") { acc.push({ id: value, accent: null }); }
            else if (acc.length) { acc[acc.length - 1].accent = value.toUpperCase(); }
            return acc;
        }, []);

    check(`resume.html declares an accent swatch row (${swatchHexes.size} swatches) ` +
          `and js/resume-templates.js declares templates (${tplAccents.length})`,
        swatchHexes.size > 0 && tplAccents.length > 0,
        "the swatch row or the template registry could not be parsed, so the " +
        "defaultAccent invariant cannot be checked against either");

    const offRow = tplAccents.filter((t) => t.accent && !swatchHexes.has(t.accent));
    check("every resume template's defaultAccent is a swatch on resume.html's row",
        offRow.length === 0,
        offRow.map((t) => `${t.id}: ${t.accent} is not on the row ` +
            `(swatches: ${[...swatchHexes].join(", ")})`).join("\n      "));

    /* The catalog-empty message names the card count. It said 17 against
       eighteen cards until August 22, 2026, because adding a card does not
       force anyone to touch that sentence. */
    const stated = indexHtml.match(/class="catalog-empty"[\s\S]{0,300}?see all (\d+)/);
    check(`index.html's catalog-empty message states the real card count (${cards.length})`,
        stated !== null && Number(stated[1]) === cards.length,
        stated ? `message says ${stated[1]}, index.html has ${cards.length} cards`
            : "no \"see all N\" count found in the catalog-empty message");

    /* 1o. Backup and restore.

           The defect this section exists for is not a crash. A backup that
           silently omits a key restores a document that LOOKS restored -- the
           resume comes back with no photograph, in the wrong template, and
           says it succeeded. Nothing reports that, so it has to be checked
           here.

           Reference: docs/implementation/BACKUP_AND_RESTORE.md */
    backupChecks();

    /* 1n. Installed-app surface (Tier 0 PWA).

           Everything here fails silently on the web and only shows up on a
           device somebody has installed, which is the worst place to find
           out. None of it is exercised by loading a page in a browser tab.

           Reference: docs/implementation/PWA_INSTALLABLE_APP.md */
    pwaChecks(pages);
}

function backupChecks() {
    const appJsSrc = fs.readFileSync(path.join(SITE, "js", "app.js"), "utf8");

    const listed = new Set(
        [...appJsSrc.matchAll(/\{\s*key:\s*"(tb_[A-Za-z0-9_]+)",\s*label:/g)]
            .map(([, key]) => key));

    check("js/app.js declares a BACKUP_KEYS list",
        listed.size > 0, "no { key: \"tb_...\", label: ... } entries found");
    if (!listed.size) { return; }

    /* THE CHECK THIS SECTION EXISTS FOR.

       Every key an editor writes must be in that list. The list cannot be
       derived from EDITORS -- the resume editor writes THREE keys and EDITORS
       names one of them -- so the only thing that can keep the two in step is
       reading the editors' own constants and insisting.

       This is not hypothetical: tb_resume_photo_v1 and tb_resume_template are
       exactly the keys a backup built from EDITORS would have dropped, and a
       visitor would have discovered it on a new phone, holding the only copy
       of a resume that came back blank. */
    const EDITOR_FILES = ["resume.js", "docs.js", "poster.js", "mockup.js"];
    const written = [];
    EDITOR_FILES.forEach((file) => {
        const src = fs.readFileSync(path.join(SITE, "js", file), "utf8");
        [...src.matchAll(/const\s+[A-Z_]*KEY[A-Z_]*\s*=\s*"(tb_[A-Za-z0-9_]+)"/g)]
            .forEach(([, key]) => written.push({ file: file, key: key }));
    });

    check(`every editor storage key is declared for backup (${written.length} found)`,
        written.every((w) => listed.has(w.key)),
        written.filter((w) => !listed.has(w.key))
            .map((w) => `js/${w.file} writes ${w.key}, which BACKUP_KEYS does not carry`)
            .join("\n      "));

    /* And nothing in the list that no editor writes, which would be a key
       renamed in an editor and left behind here -- a backup carrying a key
       nothing reads, and silently not carrying its replacement. */
    const writtenKeys = new Set(written.map((w) => w.key));
    const orphaned = [...listed].filter((k) => !writtenKeys.has(k));
    check("every backed-up key is one an editor actually writes",
        orphaned.length === 0,
        `in BACKUP_KEYS but written by no editor: ${orphaned.join(", ")}`);

    /* --- "Start fresh" must clear everything an editor owns.

           The handler read EDITORS[target].storageKey, and EDITORS maps an
           editor to ONE key while the resume editor writes three, so
           discarding a resume left the photograph in storage.

           It did NOT put that photograph back on screen -- js/resume.js gates
           on `hasSaved && validPhoto(...)` and actively clears a photograph
           that outlives its document. That was checked by reproducing the old
           behaviour in a browser, and no image appeared. The guard is older
           than this check and is not what these assertions protect.

           What they protect is smaller: that discarding deletes the data when
           the visitor asks rather than leaving it until they next open an
           editor they have just finished with, and that the copy path and the
           delete path cannot come to disagree about which keys an editor owns.

           Reference: docs/error-fixes/START_FRESH_DID_NOT_CLEAR_EVERY_KEY.md */
    const editorTargets = new Set(
        [...(appJsSrc.match(/const EDITORS = \{[\s\S]*?\n    \};/) || [""])[0]
            .matchAll(/^\s{8}(\w+):\s*\{/gm)].map(([, t]) => t));

    check(`js/app.js declares EDITORS targets (${editorTargets.size})`,
        editorTargets.size > 0, "EDITORS block not found or empty");

    const entries = [...appJsSrc.matchAll(
        /\{\s*key:\s*"(tb_[A-Za-z0-9_]+)",[\s\S]{0,200}?target:\s*"(\w+)"(,\s*preference:\s*(true))?/g)]
        .map(([, key, target, , pref]) => ({ key, target, preference: pref === "true" }));

    check(`every backed-up key names the editor it belongs to (${entries.length} of ${listed.size})`,
        entries.length === listed.size,
        `${listed.size - entries.length} entr(ies) in BACKUP_KEYS carry no target field`);

    const badTarget = entries.filter((e) => !editorTargets.has(e.target));
    check("every backed-up key's target is a real editor",
        badTarget.length === 0,
        badTarget.map((e) => `${e.key} -> "${e.target}" is not in EDITORS`).join(", "));

    /* An editor whose keys are ALL preferences would have a Start fresh that
       silently does nothing at all -- a worse version of the original bug. */
    const noDiscard = [...editorTargets].filter(
        (t) => !entries.some((e) => e.target === t && !e.preference));
    check("every editor has at least one key that Start fresh clears",
        noDiscard.length === 0,
        `discarding these clears nothing: ${noDiscard.join(", ")}`);

    /* Only an id-shaped key may survive a discard. This is the rule that
       stops the original bug being reintroduced as a decision: marking the
       photograph or a document record as a preference would leave personal
       content behind after the visitor asked for it to go. */
    const keptContent = entries.filter((e) => {
        if (!e.preference) { return false; }
        const declared = appJsSrc.match(
            new RegExp('key:\\s*"' + e.key + '"[\\s\\S]{0,200}?kind:\\s*"(\\w+)"'));
        return !declared || declared[1] !== "id";
    });
    check("only a preference-shaped key survives Start fresh",
        keptContent.length === 0,
        `these hold content and must not be marked preference: ` +
        keptContent.map((e) => e.key).join(", "));

    /* And the handler must DERIVE the list rather than reach for the single
       key EDITORS names, which is the exact line that caused this. */
    const discardFn = (appJsSrc.match(
        /function discardKeysFor[\s\S]*?\n    \}/) || [""])[0];
    check("discardKeysFor derives its keys from BACKUP_KEYS",
        /BACKUP_KEYS/.test(discardFn) && /preference/.test(discardFn),
        "discardKeysFor must filter BACKUP_KEYS by target and skip preferences");

    const onDiscard = (appJsSrc.match(
        /const onDiscard = \(event\)[\s\S]*?\n        \};/) || [""])[0];
    check("the Start fresh handler clears every key the editor owns",
        /discardKeysFor\(/.test(onDiscard) &&
        !/EDITORS\[[^\]]*\]\.storageKey/.test(onDiscard),
        onDiscard.length
            ? "the handler still reads EDITORS[...].storageKey, which names one key per editor"
            : "the discard handler could not be located");

    /* Device settings must stay OUT. Restoring a backup should not reach over
       and change the theme someone is reading in, and tb_editor_preset is a
       one-shot hand-off from the catalog that means nothing an hour later.
       Written as a check rather than a comment because "add the theme too"
       is an entirely reasonable-sounding thing for someone to do. */
    const mustNotCarry = ["tb_theme", "tb_editor_preset", "tb_probe"];
    const leaked = mustNotCarry.filter((k) => listed.has(k));
    check("device settings are not carried in a backup",
        leaked.length === 0,
        `BACKUP_KEYS must not include: ${leaked.join(", ")}`);

    /* The image guard is a SECOND copy of the shape docs.js enforces on the
       stored logo. If docs.js ever accepts another raster type and this does
       not, a restore drops every logo of that type and reports success; if
       this accepts one docs.js does not, the guard is weaker than the editor
       it is protecting. */
    const docsSrc = fs.readFileSync(path.join(SITE, "js", "docs.js"), "utf8");
    const docsUri = (docsSrc.match(/LOGO_URI\s*=\s*(\/.+\/)\s*;/) || [])[1];
    const appUri = (appJsSrc.match(/IMAGE_URI\s*=\s*(\/.+\/)\s*;/) || [])[1];
    check("the backup's image guard matches docs.js's stored-logo guard",
        !!docsUri && docsUri === appUri,
        `docs.js: ${docsUri || "not found"} | app.js: ${appUri || "not found"}`);

    /* The image and colour guards are applied by FIELD NAME, so a typo is
       silent in the worst way: the field falls through to plain text, an
       unvetted value reaches ctx.fillStyle or an SVG fill attribute, and
       everything still renders. Each name must be one an editor persists. */
    const editorSrc = EDITOR_FILES
        .map((f) => fs.readFileSync(path.join(SITE, "js", f), "utf8")).join("\n");
    const nameList = (label) => {
        const block = (appJsSrc.match(
            new RegExp(label + "\\s*=\\s*\\[([^\\]]*)\\]")) || [])[1] || "";
        return [...block.matchAll(/"([A-Za-z0-9_]+)"/g)].map(([, n]) => n);
    };
    ["IMAGE_FIELDS", "COLOUR_FIELDS"].forEach((label) => {
        const names = nameList(label);
        check(`${label} names at least one field (${names.length})`,
            names.length > 0, "list not found or empty");
        const unknown = names.filter(
            (n) => !new RegExp("\\b" + n + ":").test(editorSrc));
        check(`every ${label} entry is a field an editor persists`,
            unknown.length === 0,
            `not found as a property in any editor: ${unknown.join(", ")}`);
    });

    /* The format marker is what lets a wrong file be reported as a wrong file
       rather than as an empty backup. Both halves have to agree or every
       exported file is rejected by the importer that wrote it. */
    const format = (appJsSrc.match(/BACKUP_FORMAT\s*=\s*"([^"]+)"/) || [])[1];
    check("the backup format marker is declared once and non-empty",
        !!format && (appJsSrc.match(/BACKUP_FORMAT\s*=/g) || []).length === 1,
        `BACKUP_FORMAT=${format || "not found"}`);

    /* Every page a visitor can reach has to be able to HOST the controls.

       js/app.js mounts them into [data-nav-more-panel], and where a page has
       none, into .editor-actions instead. That fallback is not hypothetical:
       resume.html and docs.html carry no mega-menu panel at all, which
       contradicts what this project's notes claim about every public page
       having one, and without the fallback the backup controls would be
       missing from the resume editor -- the page whose documents live longest.

       A page with neither host offers no backup and says nothing about it. */
    const hostless = [];
    fs.readdirSync(SITE).filter((f) => f.endsWith(".html")).forEach((name) => {
        /* admin.html is the private authoring tool, loading.html has no header
           at all by design, and offline.html must reference nothing. */
        if (["admin.html", "loading.html", "offline.html"].indexOf(name) !== -1) {
            return;
        }
        const html = fs.readFileSync(path.join(SITE, name), "utf8");
        if (!/data-nav-more-panel/.test(html) &&
                !/class="editor-actions"/.test(html)) {
            hostless.push(name);
        }
    });
    check("every public page can host the backup controls",
        hostless.length === 0,
        `no [data-nav-more-panel] and no .editor-actions: ${hostless.join(", ")}`);

    /* Prototype pollution. JSON.parse defines __proto__ as an own property,
       but the walker COPIES into a fresh object, and there the same name is
       the prototype setter. One line, and its absence is invisible. */
    check("the import walker refuses prototype-poisoning key names",
        /UNSAFE_KEYS\s*=\s*\[[^\]]*"__proto__"/.test(appJsSrc),
        "UNSAFE_KEYS must list __proto__");

    /* Cleaning has to finish before ANY write, or a half-valid file leaves
       storage half replaced: the visitor loses what it overwrote and does not
       gain what it could not restore.

       Checked as "the gathering loop contains no write" rather than as
       "the first write comes after the last clean". The position comparison
       was the obvious form and it is useless: a storageSet added INSIDE the
       gathering loop still sits after the cleanRecord call on the line above
       it, so the ordering holds and the check passes while the property it
       was written for is gone. Confirmed by breaking it exactly that way. */
    const gather = (appJsSrc.match(
        /const cleaned = \[\][\s\S]*?if \(!cleaned\.length\)/) || [""])[0];
    check("applyBackup's gathering pass performs no writes",
        gather.length > 0 && gather.indexOf("storageSet(") === -1,
        gather.length
            ? "a storageSet call sits inside the loop that cleans records"
            : "the gathering pass could not be located -- applyBackup was restructured");

    /* And the write pass has to exist, or the two halves of the check above
       could both be satisfied by a function that never writes at all. */
    const writePass = (appJsSrc.match(
        /if \(!cleaned\.length\)[\s\S]*?return \{\s*ok: true/) || [""])[0];
    check("applyBackup writes every cleaned record after the gathering pass",
        writePass.indexOf("storageSet(") > -1,
        "no storageSet call between the emptiness guard and the success return");
}

function pwaChecks(pages) {
    const manifestPath = path.join(SITE, "manifest.webmanifest");
    if (!fs.existsSync(manifestPath)) {
        check("manifest.webmanifest exists", false, "site/manifest.webmanifest not found");
        return;
    }

    let manifest = null;
    try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch (err) {
        check("manifest.webmanifest is valid JSON", false, err.message);
        return;
    }
    check("manifest.webmanifest is valid JSON", true);

    /* Reads a PNG's real dimensions from its IHDR, the same way the social
       card check does. A manifest declaring 512x512 over a 192x192 payload
       installs happily and is simply blurry on the device. */
    const pngSize = (file) => {
        if (!fs.existsSync(file)) { return null; }
        const buf = fs.readFileSync(file);
        if (buf.length < 24 || buf.toString("latin1", 12, 16) !== "IHDR") { return null; }
        return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    };

    /* --- Icons exist, and are the size they claim to be. */
    const badIcons = [];
    (manifest.icons || []).forEach((icon) => {
        const file = path.join(SITE, icon.src);
        const size = pngSize(file);
        if (!size) { badIcons.push(`${icon.src}: missing or not a PNG`); return; }
        const [w, h] = icon.sizes.split("x").map(Number);
        if (size.w !== w || size.h !== h) {
            badIcons.push(`${icon.src}: declared ${icon.sizes}, file is ${size.w}x${size.h}`);
        }
    });
    check(`every manifest icon exists at its declared size (${(manifest.icons || []).length} icons)`,
        badIcons.length === 0, badIcons.join("\n      "));

    /* A maskable icon is a SEPARATE file with more padding, not a purpose
       string added to the plain one. Declaring purpose:"maskable" on artwork
       drawn edge to edge is the single most common PWA icon mistake: the
       launcher crops it to a circle and clips the mark. */
    const maskable = (manifest.icons || []).filter((i) => /\bmaskable\b/.test(i.purpose || ""));
    const plain = (manifest.icons || []).filter((i) => !/\bmaskable\b/.test(i.purpose || ""));
    check("the manifest declares a maskable icon", maskable.length > 0,
        "no icon with purpose: maskable");
    check("the maskable icon is its own file, not a plain icon relabelled",
        maskable.every((m) => !plain.some((p) => p.src === m.src)),
        maskable.map((m) => m.src).join(", "));

    /* --- apple-touch-icon. iOS ignores the manifest's icons array entirely,
           so nothing above covers it and a missing file means a screenshot of
           the page on the home screen instead of the mark. */
    const appleIcon = pngSize(path.join(SITE, "assets", "icon-180.png"));
    check("assets/icon-180.png exists at 180x180 for apple-touch-icon",
        appleIcon !== null && appleIcon.w === 180 && appleIcon.h === 180,
        appleIcon ? `${appleIcon.w}x${appleIcon.h}` : "missing or not a PNG");

    /* --- THE REVENUE ONE. Manifest shortcuts are the long-press menu on an
           installed icon, and they are ordinary URLs: a shortcut pointing
           straight at resume.html would send every installed visitor into the
           editor without passing loading.html, silently removing the
           interstitial from the launch path that installed users are most
           likely to take. Nothing about that is visible on the web. */
    const appJsSrc = fs.readFileSync(path.join(SITE, "js", "app.js"), "utf8");
    const routeKeys = new Set(
        [...(appJsSrc.match(/EDITOR_ROUTES = \{[\s\S]*?\};/) || [""])[0]
            .matchAll(/(\w+):\s*"/g)].map(([, k]) => k));

    const shortcuts = manifest.shortcuts || [];
    check("the manifest declares shortcuts", shortcuts.length > 0, "none declared");

    const bypassing = shortcuts.filter((s) => !/^\/loading\.html\?target=/.test(s.url || ""));
    check(`every manifest shortcut routes through loading.html (${shortcuts.length} shortcuts)`,
        bypassing.length === 0,
        bypassing.map((s) => `${s.name}: ${s.url}`).join(", "));

    const unknownTarget = shortcuts
        .map((s) => (String(s.url).match(/target=([^&]+)/) || [])[1])
        .filter((t) => t && !routeKeys.has(t));
    check("every manifest shortcut names a real editor target",
        unknownTarget.length === 0,
        `not in EDITOR_ROUTES: ${unknownTarget.join(", ")} ` +
        `(known: ${[...routeKeys].join(", ")})`);

    /* --- The install head block, on every page that should have it.
           admin.html is the private authoring tool and offline.html must
           reference nothing; everything else a visitor can reach needs the
           manifest link or it is not installable FROM that page. */
    const exempt = new Set(["admin.html", "offline.html"]);
    const missingBlock = [];
    pages.forEach((file) => {
        const name = path.basename(file);
        const rel = path.relative(SITE, file).replace(/\\/g, "/");
        if (exempt.has(name) || rel.startsWith("tools/")) { return; }
        const html = fs.readFileSync(file, "utf8");
        const gaps = [];
        if (!/<link\s+rel="manifest"/.test(html)) { gaps.push("manifest"); }
        if (!/<link\s+rel="apple-touch-icon"/.test(html)) { gaps.push("apple-touch-icon"); }
        if (!/<meta\s+name="theme-color"/.test(html)) { gaps.push("theme-color"); }
        if (gaps.length) { missingBlock.push(`${rel}: no ${gaps.join(", ")}`); }
    });
    check(`every public page carries the installed-app head block (${pages.length} pages scanned)`,
        missingBlock.length === 0, missingBlock.join("\n      "));

    /* --- offline.html's whole contract, and the one most likely to be broken
           by a well-meaning tidy-up. sw.js serves it when the network is
           unreachable, so a <link> to css/style.css or a Google Fonts sheet
           renders it as unstyled black-on-white -- which looks MORE broken
           than the browser's own error page and so defeats the point. You
           cannot see this by loading the page; you have to be offline. */
    const offlinePath = path.join(SITE, "offline.html");
    if (fs.existsSync(offlinePath)) {
        const offlineHtml = fs.readFileSync(offlinePath, "utf8").replace(/<!--[\s\S]*?-->/g, "");
        const refs = [
            ...[...offlineHtml.matchAll(/<link\b[^>]*\shref="([^"]+)"/g)].map(([, v]) => v),
            ...[...offlineHtml.matchAll(/<script\b[^>]*\ssrc="([^"]+)"/g)].map(([, v]) => v),
            ...[...offlineHtml.matchAll(/<img\b[^>]*\ssrc="([^"]+)"/g)].map(([, v]) => v)
        ];
        check("offline.html references no external file at all",
            refs.length === 0, refs.join(", "));
        check("offline.html carries its styling inline",
            /<style>/.test(offlineHtml), "no inline <style> block");
        check("offline.html draws the mark inline rather than linking it",
            /<svg\b/.test(offlineHtml), "no inline <svg>");
    } else {
        check("offline.html exists", false, "site/offline.html not found");
    }

    /* --- sw.js must stay a pass-through. This project has no build step, so
           nothing would bump a cache version on deploy: a precached
           css/style.css or js/poster.js goes stale the moment it is fixed and
           stays stale, and a precached js/ads.js makes a dead ad zone and a
           stale copy indistinguishable. Both are silent. */
    const swPath = path.join(SITE, "sw.js");
    if (fs.existsSync(swPath)) {
        /* Comments stripped first: this file's own header NAMES ads.js and
           style.css in the course of explaining why they must never be cached,
           and a check that cannot tell an explanation from an instruction
           would fail on the documentation. */
        const swSrc = fs.readFileSync(swPath, "utf8")
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/^\s*\/\/.*$/gm, "");

        const quoted = [...swSrc.matchAll(/["'`]([^"'`]*\.(?:html|js|css|png|svg|json))["'`]/g)]
            .map(([, v]) => v);
        const unexpected = quoted.filter((v) => !/(^|\/)offline\.html$/.test(v));
        check("sw.js caches nothing but offline.html",
            unexpected.length === 0,
            `also names: ${unexpected.join(", ")}`);

        check("sw.js leaves non-navigation requests to the browser",
            /request\.mode\s*!==\s*["']navigate["']/.test(swSrc),
            "no early return for non-navigate requests -- every subresource " +
            "on the site would be routed through the worker");

        /* The fallback must be reached only when fetch() THROWS. Serving it
           for a 404 would tell a visitor with a working connection that they
           are offline, and 404.html is a real page of this site. */
        check("sw.js returns the network response untouched, including errors",
            /return await fetch\(request\)/.test(swSrc) &&
            /catch\s*\(/.test(swSrc),
            "the offline page must be a catch-branch fallback, not a status check");
    } else {
        check("sw.js exists", false, "site/sw.js not found");
    }

    /* --- theme-color is the installed app's status bar. It is hardcoded in
           28 page heads and once more in app.js, none of which move when the
           palette does, so it drifts exactly the way the two dark-theme
           blocks would without their own check above. */
    const css = fs.readFileSync(path.join(SITE, "css", "style.css"), "utf8");
    const token = (name) => {
        const m = css.match(new RegExp("--" + name + ":\\s*(#[0-9A-Fa-f]{6})"));
        return m ? m[1].toUpperCase() : null;
    };
    const lightBg = token("l-bg");
    const darkBg = token("d-bg");

    const appColors = appJsSrc.match(
        /THEME_COLORS = \{\s*light:\s*"(#[0-9A-Fa-f]{6})",\s*dark:\s*"(#[0-9A-Fa-f]{6})"/);
    check("js/app.js's THEME_COLORS match the stylesheet's --l-bg and --d-bg",
        appColors !== null &&
        appColors[1].toUpperCase() === lightBg &&
        appColors[2].toUpperCase() === darkBg,
        appColors
            ? `app.js: ${appColors[1]}/${appColors[2]} | style.css: ${lightBg}/${darkBg}`
            : "THEME_COLORS not found in js/app.js");

    check("the manifest's background and theme colours match --l-bg",
        String(manifest.background_color).toUpperCase() === lightBg &&
        String(manifest.theme_color).toUpperCase() === lightBg,
        `manifest: ${manifest.background_color}/${manifest.theme_color} | --l-bg: ${lightBg}`);

    const wrongMeta = [];
    pages.forEach((file) => {
        const rel = path.relative(SITE, file).replace(/\\/g, "/");
        const html = fs.readFileSync(file, "utf8");
        [...html.matchAll(
            /<meta\s+name="theme-color"\s+content="(#[0-9A-Fa-f]{6})"\s+media="\(prefers-color-scheme:\s*(\w+)\)">/g
        )].forEach(([, hex, scheme]) => {
            const want = scheme === "dark" ? darkBg : lightBg;
            if (hex.toUpperCase() !== want) {
                wrongMeta.push(`${rel}: ${scheme} declares ${hex}, --${scheme === "dark" ? "d" : "l"}-bg is ${want}`);
            }
        });
    });
    check("every page's theme-color meta tags match the stylesheet palette",
        wrongMeta.length === 0, wrongMeta.join("\n      "));

    /* --- admin.html generates blog post pages from its own head template, so
           a block added to the 28 hand-written pages does not reach an
           exported post. Same failure shape as MEGA_MENU, which is documented
           in CLAUDE.md precisely because it has drifted before. */
    const adminJs = fs.readFileSync(path.join(SITE, "js", "admin.js"), "utf8");
    const generatedGaps = [];
    if (!/rel="manifest" href="\.\.\/manifest\.webmanifest"/.test(adminJs)) {
        generatedGaps.push("manifest link");
    }
    if (!/rel="apple-touch-icon" href="\.\.\/assets\/icon-180\.png"/.test(adminJs)) {
        generatedGaps.push("apple-touch-icon");
    }
    if (!/name="theme-color"/.test(adminJs)) {
        generatedGaps.push("theme-color");
    }
    check("admin.html's generated post pages carry the installed-app head block",
        generatedGaps.length === 0,
        `buildPostPage() emits no ${generatedGaps.join(", ")} -- an exported ` +
        "post would be the one page of the site that is not installable");
}

/* ==========================================================================
   Browser plumbing
   ========================================================================== */

/* Reap a process AND everything it spawned.

   Two separate children in this file need this and for the same underlying
   reason: `proc.kill()` signals one process, and both of ours are the root of
   a tree. `npx serve` runs under a shell, so the shell dies and the server
   keeps the port. A headless browser forks a renderer, a GPU process and a
   network service per profile, so the parent dies and those keep running --
   and a machine carrying several of those is measurably slower to settle a
   navigation, which is how a leak here turns into "navigation did not settle
   within 20s" on a page that is perfectly fine (see PROJECT_STATUS.md).

   Kept as one helper so the next child added cannot get this wrong again. */
function killTree(proc) {
    if (!proc || !proc.pid) { return; }
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
}

/* Temporary profiles and baseline checkouts, removed on the way out.

   Each run makes a fresh browser profile (tens of MB) and a full `git archive`
   extraction. Neither was ever deleted, so an interrupted run left both behind
   and the machine accumulated them silently. Collected here and cleaned in
   one place, best-effort: a directory the browser still has open on Windows
   refuses to delete, and failing to tidy up is not a test failure. */
const TEMP_DIRS = [];

function tempDir(prefix) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    TEMP_DIRS.push(dir);
    return dir;
}

async function cleanTempDirs() {
    /* The delay between attempts has to be a real one, and this is the second
       attempt at that.

       taskkill returns as soon as it has SIGNALLED the tree, not once Windows
       has released the handles, so a browser profile is still locked for
       around a second after close(). The first version of this passed
       `{ maxRetries: 3 }` and swallowed the failure, so it silently did
       nothing: measured after a full run, every `tb-verify-` and
       `tb-baseline-` directory the run had created was still on disk, 87 of
       them accumulated.

       Adding `retryDelay` did NOT fix it, which is worth writing down because
       it is the obvious fix and it looks right. Both forms were measured
       against the suite's own sequence -- spawn headless Chrome on a fresh
       profile, taskkill /T /F, remove:

         maxRetries: 3                    removed=false  8ms   EPERM
         maxRetries: 10, retryDelay: 500  removed=false  8ms   EPERM
         manual loop, 250ms between       removed=TRUE   1079ms  2 attempts

       Both rmSync forms returned in 8ms, so the retry never waited at all --
       whatever `retryDelay` governs, it is not this EPERM. A loop that
       actually awaits between attempts succeeds on the second one.

       Still best-effort, and now it SAYS so when it fails rather than
       returning quietly, because a silent best-effort is indistinguishable
       from a broken one -- which is exactly how this went unnoticed. */
    const remaining = [];
    while (TEMP_DIRS.length) {
        const dir = TEMP_DIRS.pop();
        let removed = false;
        let lastErr = null;
        for (let i = 0; i < 12 && !removed; i += 1) {
            try {
                fs.rmSync(dir, { recursive: true, force: true });
                removed = !fs.existsSync(dir);
            } catch (err) {
                lastErr = err.code || err.message;
            }
            if (!removed) { await new Promise((r) => setTimeout(r, 250)); }
        }
        if (!removed) { remaining.push(`${path.basename(dir)} (${lastErr})`); }
    }
    if (remaining.length) {
        console.log(`      NOTE could not remove ${remaining.length} temp dir(s): ${remaining.join(", ")}`);
    }
}

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

/* The layout fingerprint the readiness poll waits to stop changing.

   Deliberately cheap and deliberately coarse: the page's own scroll box, the
   body reservation every ad band writes, how many ad slots have been mounted,
   and the height of `main`. Every layout property this suite asserts on moves
   one of those, so a fingerprint that has stopped changing is a page that has
   stopped moving. It is a settling signal, never an assertion -- nothing here
   is compared against an expected value. */
const QUIESCE = `(() => {
  const de = document.documentElement;
  const cs = getComputedStyle(document.body);
  const main = document.querySelector('main');
  return [
    de.scrollWidth, de.scrollHeight, de.clientWidth, de.clientHeight,
    cs.paddingRight, cs.paddingBottom,
    document.querySelectorAll('.ad-slot').length,
    main ? Math.round(main.getBoundingClientRect().height) : -1,
    /* Font loading is part of "has this page stopped moving", because a swap
       re-lays-out every line of text. It has to be IN the fingerprint rather
       than only awaited beforehand: index.html fetches its font CSS with
       media="print" onload="this.media='all'", so until that stylesheet
       applies there are no pending fonts at all and document.fonts.ready
       resolves immediately -- before the swap it is meant to wait for is even
       queued. As a fingerprint entry it cannot be outrun: status flips to
       "loading" when the CSS lands, which keeps the poll going. */
    document.fonts ? document.fonts.status : "n/a"
  ].join('|');
})()`;

async function connect(browserPath, cdpPort, options) {
    const adsBlocked = !!(options && options.adsBlocked);
    const userDir = tempDir("tb-verify-");
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
       page itself rather than trusting a single event.

       REVISED September 3, 2026: the poll no longer waits for
       `readyState === "complete"`, and that is the substance of the fix
       rather than a tuning tweak. `complete` IS the load event, so waiting
       for it is waiting for the unreachable ad iframes to time out, and how
       long that takes is ambient -- which is exactly what killed whole runs
       with "did not settle within 20s" on a different page each time, and
       what made section 4 compare a settled page against a
       partially-rendered one and report the difference as a layout change.

       What replaced it is stronger, not weaker, because `complete` was never
       what this suite needs:

         - Readiness is DOMContentLoaded having fired, read retroactively
           from PerformanceNavigationTiming, not `readyState`.

           An earlier version of this comment claimed `readyState !==
           "loading"` meant "the document is parsed and every deferred script
           has RUN". That is FALSE, and it shipped a real failure. The spec's
           "stop parsing" algorithm sets the state to "interactive" and only
           THEN executes the deferred scripts, firing DOMContentLoaded after
           them. On a page that defers a slow third-party script -- which
           resume.html does, for jsPDF -- "interactive" arrives long before
           js/ads.js's DOMContentLoaded listener has mounted anything.

           What is true is the part that matters: DOMContentLoaded does not
           wait for the load event, so nothing here waits on a cross-origin
           ad iframe. mountPlacement writes its srcdoc iframes synchronously,
           so once that listener has run the bands are in the DOM.

         - Readiness is then not treated as stillness. The page is polled
           until its layout fingerprint stops changing, which is the "poll
           for the specific elements each comparison measures" that
           PROJECT_STATUS.md prescribes, generalised so every section gets it
           rather than only the one that noticed. This is what makes two
           measurements of the same tree comparable.

       The old blind 250ms pause is gone: a fixed sleep is a guess about how
       long a page takes to settle, and the point here is to observe it
       instead. */
    /* Wait for the page to stop moving, and say so when it never does.

       Three identical consecutive fingerprints spanning ~200ms: enough to
       cover the gap between DOMContentLoaded mounting the ad bands and the
       reflow their reservation causes, short enough that the whole suite does
       not pay seconds per navigation for it.

       A page that never stabilises is NOT a navigation failure. It means
       something on it animates or polls, and failing the navigation would
       turn that into a red check on a page that loaded perfectly. It returns
       true and prints one line instead, so a page that genuinely never
       settles is visible in the output rather than silently measured as
       though it had. */
    /* Wait for webfonts BEFORE watching for stillness, because stillness is
       not the same as finished.

       index.html pulls its two families from fonts.googleapis.com with
       font-display, so text is laid out in the fallback face first and
       re-laid-out when the real one arrives. Between those two moments the
       page is perfectly still: the fingerprint below reads the same value
       three times running, the poll concludes, and the swap lands after the
       measurement. Nothing about that is a slow page -- it is a page that has
       not finished, holding still while it waits.

       It shows up as section 4 reporting a layout change on files that are
       byte-identical, because the two captures happened on opposite sides of
       the swap. The tell is that a measurement appears on BOTH sides across
       runs: index @1024's first card was "now 354.9 / HEAD 334.1" in one run
       and "now 334.1 / HEAD 354.9" in the next. That is one line of a card
       title wrapping or not -- about 21px of row height -- and at wider
       column counts the same swap moved main by 60px.

       `document.fonts.ready` is the signal that was missing: per spec it
       resolves once font loading AND the layout operations that depend on it
       are complete. Raced against a timeout because a font host unreachable
       from a test machine must not hang the run -- the same hazard the ad
       iframes pose, and the reason waiting on the load event was abandoned
       above. A timeout is reported rather than swallowed: it means every
       measurement afterwards is in the fallback face, which is consistent and
       therefore still comparable, but it is not what the site renders.

       This await is the CHEAP half and not the load-bearing one. On its own it
       is outrunnable: the font CSS arrives via media="print" onload, so before
       that stylesheet applies there is nothing pending and `ready` resolves at
       once. What actually closes the hole is `document.fonts.status` sitting
       in the QUIESCE fingerprint, where a late swap cannot slip past. Both are
       kept because this one collapses the common case in a single round trip
       and names a font host that has gone unreachable. */
    const FONTS_READY = `(() => {
  if (!document.fonts || !document.fonts.ready) { return Promise.resolve("no-font-api"); }
  return Promise.race([
    document.fonts.ready.then(() => "ready"),
    new Promise((r) => setTimeout(() => r("timeout"), 3000))
  ]);
})()`;

    /* The state of the LAST navigation's fonts, kept rather than only printed.

       The note above says a timeout is "consistent and therefore still
       comparable", and within one page's own measurements that is true. It is
       false across TWO separately navigated pages, which is exactly what
       section 4 does: if the webfonts load for one side and time out for the
       other, the two are measured in different faces and every text-driven
       height differs by a pixel or two. That reads as a layout regression and
       is not one -- observed with site/ byte-identical to HEAD, where a
       difference is impossible by construction.

       Kept here, at the only place that knows, so the comparison can ask. */
    let lastFonts = "unknown";

    const awaitFonts = async (url, width) => {
        let state = null;
        try { state = await evaluate(FONTS_READY); } catch (e) { state = "error"; }
        lastFonts = state;
        if (state === "timeout" || state === "error") {
            console.log(`      FONTS ${url} @${width} not ready after 3s (${state}); measuring in the fallback face`);
        }
    };

    const quiesce = async (url, width) => {
        await awaitFonts(url, width);
        const deadline = Date.now() + 5000;
        let last = null;
        let matches = 0;
        while (Date.now() < deadline) {
            let fp = null;
            try { fp = await evaluate(QUIESCE); } catch (e) { fp = null; }
            if (fp !== null && fp === last) {
                matches += 1;
                if (matches >= 2) { return true; }
            } else {
                matches = 0;
            }
            last = fp;
            await new Promise((r) => setTimeout(r, 100));
        }
        console.log(`      UNSETTLED ${url} @${width} still changing after 5s; measuring anyway`);
        return true;
    };

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
                    /* DOMContentLoaded has FIRED, asked retroactively.

                       readyState is not this signal and the difference is not
                       academic. Per the HTML spec's "stop parsing" steps the
                       state is set to "interactive" BEFORE the deferred
                       scripts run, and DOMContentLoaded is fired after them --
                       so "interactive" means the parser finished, not that the
                       document is ready. resume.html defers jsPDF from a CDN,
                       and js/ads.js mounts every band from its
                       DOMContentLoaded listener, so on a slow network the poll
                       released while the deferred script was still downloading
                       and the snapshot found no ad band at all. Measured on a
                       degraded connection here: jsPDF took 6.7s, and every
                       width of resume.html reported "got 0 -- rail=false
                       leaderboard=false anchor=false" on a page whose markup
                       and script tag were correct and untouched.

                       domContentLoadedEventEnd stays 0 until the event's
                       handlers have finished, and it is readable at any time
                       afterwards, which is what makes it usable from a poll
                       that may arrive late. It does NOT wait for the load
                       event, so the ad-iframe cost that this whole change
                       exists to avoid is still avoided. */
                    domReady: (() => {
                        const nav = performance.getEntriesByType('navigation')[0];
                        return !!(nav && nav.domContentLoadedEventEnd > 0);
                    })(),
                    adsReady: ${adsBlocked} ||
                              !document.querySelector('script[src*="js/ads.js"]') ||
                              typeof TBAds !== 'undefined',
                    /* The mockup template's base photograph has been painted.

                       This is a POSITIVE signal, and it has to be, because the
                       stillness poll below cannot supply one. While the base
                       PNG is in flight the canvas is a flat 1000x1000
                       placeholder fill -- so the page is not merely still, it
                       is stably WRONG, and three identical fingerprints mean
                       "nothing is happening", never "everything has happened".

                       Measured, by deleting the default template's base PNG and
                       serving the tree beside an intact one: the placeholder
                       settled in 381ms with the preview pane at 640 and the
                       fabric pixel at 244,243,239, against 788 and 244,244,249
                       on the healthy tree. Those are exactly the numbers that
                       had been appearing intermittently in section 4 and in
                       section 5's colourway check on a clean tree -- one cause,
                       two symptoms, depending on which section got there first.

                       Testing for "not loading" rather than for "ready" is
                       deliberate. An ERROR is a real defect, and it must reach
                       the check that can name it rather than expiring here as a
                       20-second navigation timeout on every mockup page in the
                       run. Section 5 asserts the ready state outright.

                       NOTE FOR ANYONE EDITING THIS STRING: it is the inside of
                       a template literal, so a backtick here does not comment
                       anything out -- it ENDS the literal. Two pairs of them in
                       this comment turned the whole expression into a chain of
                       string comparisons, which is valid JavaScript that
                       evaluates to false -- so a syntax check passed and every
                       navigation in the suite timed out at 20 seconds instead. */
                    mockupReady: (() => {
                        const wrap = document.querySelector('[data-mockup-state]');
                        return !wrap || wrap.getAttribute('data-mockup-state') !== 'loading';
                    })()
                }))()`);
            } catch (e) { continue; }
            /* A malformed readiness expression, named rather than waited out.

               The catch above exists because evaluate genuinely fails while a
               navigation is in flight, and swallowing that is right. What it
               also swallowed was an expression that RETURNED successfully with
               a non-object: a stray backtick in the comment above ended the
               template literal early and left a chain of string comparisons
               that evaluated to false. Every navigation then polled for 20
               seconds and the run died on whichever page came first -- with a
               message blaming that page, which had nothing to do with it.

               A throw here costs one run and points at the real line. */
            if (state !== null && state !== undefined && typeof state !== "object") {
                throw new Error("the readiness expression returned " + JSON.stringify(state) +
                    " instead of an object -- check tests/verify-layout.js for a backtick " +
                    "inside the evaluated template literal");
            }
            if (!state || state.path !== expected || state.ready === "loading" ||
                    !state.domReady || !state.adsReady || !state.mockupReady) {
                continue;
            }
            return await quiesce(url, width);
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

    /* Read an expression once IT has stopped changing, rather than once the
       page has.

       QUIESCE above is a page-wide approximation, and a good one: the scroll
       box, the ad reservation, the mounted slot count, main's height and the
       font status catch almost everything. It cannot catch everything, and
       resume.html is the case that proves it. Its preview pane grows from
       535.6px to its 788px cap when the descriptor engine finishes its first
       paint -- but that pane is far shorter than the 5300px editor pane
       beside it, so main's height never moves. Every generic measure says the
       page is still while the exact box section 4 compares is still growing,
       and the comparison then reports 535.6 against a settled 788 on a file
       nobody touched.

       So a comparison settles on its OWN snapshot. This is what
       PROJECT_STATUS.md prescribed in the first place -- "poll for the
       specific elements each comparison measures" -- and the generic
       fingerprint is the cheap approximation layered under it, not a
       replacement for it.

       It cannot mask a real change: a genuine layout difference is stable in
       both trees, so both sides settle and the difference is still reported.
       What it removes is the case where one side settles and the other is
       caught mid-paint. */
    const settled = async (expression, label) => {
        const deadline = Date.now() + 8000;
        let last = null;
        let matches = 0;
        let value = null;
        while (Date.now() < deadline) {
            value = await evaluate(expression);
            const key = JSON.stringify(value);
            if (key === last) {
                matches += 1;
                if (matches >= 2) { return value; }
            } else {
                matches = 0;
            }
            last = key;
            await new Promise((r) => setTimeout(r, 100));
        }
        console.log(`      UNSETTLED ${label} still changing after 8s; comparing anyway`);
        return value;
    };

    return {
        call, sessionId, navigate, evaluate, settled,
        /* Whether the last navigation measured in the real faces or the
           fallback. Only section 4 reads it; see lastFonts above. */
        fonts: () => lastFonts,
        /* killTree, not proc.kill(): a headless browser is the root of a
           process tree, and the renderers it leaves behind are what make the
           NEXT run's navigations slow enough to hit the 20s deadline. */
        close: () => { ws.close(); killTree(proc); }
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
    proc.killTree = () => killTree(proc);
    return proc;
}

/* 60 seconds, not the 20 this used to allow. `npx serve` prints nothing while
   it resolves and can take well over 20s to bind on a loaded machine -- measured
   on August 31, 2026: not listening at 8s, serving 200s by 50s, with an empty
   log throughout. At 20s the suite gave up and reported "could not start `npx
   serve`", which reads like the server is broken when it is only slow, and cost
   two false failures in one session.

   This is a budget that was too tight, not a symptom being masked: the server
   does bind and does serve. A genuinely dead server still fails, 40 seconds
   later than before, and the message below now says how long it actually
   waited so the next person can tell the two apart. */
const SERVER_WAIT_MS = 60000;

async function waitForServer(port) {
    const step = 250;
    for (let i = 0; i < SERVER_WAIT_MS / step; i += 1) {
        await new Promise((r) => setTimeout(r, step));
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
        /* 1100 and 375 were added on September 16, 2026 with the panel's
           height cap. They are the widths where a FIXED ANCHOR is mounted,
           and without at least one of them the anchor-clearance check below
           can never fail: the anchor's ceiling is 74.9375rem and every other
           width here is above it. They are also the burger widths, which is
           the harder case for the cap -- the header grows a second row when
           the nav opens, so the panel's room has to be measured, not
           assumed. */
        for (const width of [1920, 1440, 1366, 1200, 1100, 375]) {
            await page.navigate(`http://localhost:${PORT}${urlPath}`, width);
            const r = await page.evaluate(`(async () => {
                const toggle = document.querySelector('[data-nav-more-toggle]');
                if (!toggle) return { skipped: true };

                /* Below 74.9375rem the whole nav collapses behind the burger,
                   so .nav-more is display:none and clicking the More toggle
                   inside it yields a zero-sized panel and a run of false
                   failures. Open the burger first.

                   Checking .nav-more's own display rather than the width,
                   because the width at which it collapses is a fact about the
                   stylesheet and repeating it here is a second copy of it. */
                const more = document.querySelector('[data-nav-more]');
                if (more && getComputedStyle(more).display === 'none') {
                    const burger = document.querySelector('[data-nav-toggle]');
                    if (!burger) { return { skipped: true }; }
                    burger.click();
                }

                /* WAIT FOR --header-h TO CATCH UP BEFORE MEASURING ANYTHING.

                   Opening the burger grows the header by a whole row, and the
                   panel's max-height is calculated from --header-h, which
                   js/app.js republishes from a ResizeObserver -- asynchronously.
                   Measure in the same tick as the click and the panel is
                   positioned below the NEW header while sized against the OLD
                   one, so it overflows by exactly the difference.

                   That is not a hypothetical. The first run of these checks
                   failed at 1100 and 375 with a panel 662px tall where
                   900 - 85 - 12 - 24 - 116 = 663 -- the arithmetic of a 85px
                   header, while the panel actually hung below a 302px one. The
                   CSS was correct and the stopwatch was started too early, the
                   same fault this section's scroll check documents further down.

                   Polling until the published value matches the rendered height
                   is deterministic regardless of how long the observer takes. */
                const root = document.documentElement;
                const hdr = document.querySelector('.site-header');
                for (let i = 0; i < 60; i += 1) {
                    await new Promise(r => requestAnimationFrame(r));
                    const real = Math.ceil(hdr.getBoundingClientRect().height);
                    const published = parseFloat(
                        getComputedStyle(root).getPropertyValue('--header-h'));
                    if (published === real) { break; }
                }

                toggle.click();
                await new Promise(r => requestAnimationFrame(r));
                const p = document.querySelector('[data-nav-more-panel]');
                if (!p.getBoundingClientRect().height) { return { notOpen: true }; }
                const b = p.getBoundingClientRect();
                const rail = document.querySelector(${JSON.stringify(railSelector)});
                const up = rail && getComputedStyle(rail).display !== 'none' && rail.querySelector('.ad-slot');
                const mid = document.elementFromPoint(b.x + b.width / 2, b.y + 12);

                /* The FOOT of the panel, which is what this section used to
                   miss entirely: it asked whether the top was clickable and
                   never whether the bottom could be reached at all. It could
                   not. The panel measured 1121px hanging from y=96 in a 900px
                   viewport with no max-height, and because .site-header is
                   sticky and this is absolute against it, scrolling the page
                   never brought the foot into view -- which stranded
                   .nav-more-social, the only route to the social links since
                   the footer was folded into this menu.

                   Scrolling the panel to its end and hit-testing the last row
                   is deliberately stronger than "does the box fit": a panel
                   that fits by being clipped would pass a bounds check and
                   still lose its last row. */
                const last = p.lastElementChild;
                p.scrollTop = p.scrollHeight;
                const lr = last.getBoundingClientRect();
                const lastHit = document.elementFromPoint(lr.left + 20, lr.top + 10);

                /* An anchor is fixed to the foot of the window and CANNOT be
                   painted under: the header is a stacking context at z-index
                   20, below the anchor's 30, so no z-index on this panel can
                   lift it (measured at 30, 40 and 999). The panel therefore
                   has to stop above it. */
                const anchor = document.querySelector('.site-anchor.is-filled, .editor-anchor.is-filled');
                const aTop = anchor ? anchor.getBoundingClientRect().top : null;

                return { hidden: p.hasAttribute('hidden'), left: +b.x.toFixed(1), right: +b.right.toFixed(1),
                         railLeft: up ? +rail.getBoundingClientRect().x.toFixed(1) : null,
                         reachable: !!(mid && p.contains(mid)),
                         bottom: +b.bottom.toFixed(1), innerHeight: window.innerHeight,
                         anchorTop: aTop === null ? null : +aTop.toFixed(1),
                         lastClass: last ? last.className : null,
                         lastReachable: !!(lastHit && (last === lastHit || last.contains(lastHit))) };
            })()`);
            if (r.skipped) { continue; }
            /* Distinct from `skipped`: the controls are present and the
               panel still did not open, which is a real fault and must not
               be quietly stepped over the way an absent menu is. */
            check(`${label} mega-menu @${width}: the panel opens at all`,
                !r.notOpen, "clicking the toggle produced a zero-height panel");
            if (r.notOpen) { continue; }
            check(`${label} mega-menu @${width}: opens on screen, clear of the column, clickable`,
                !r.hidden && r.left >= 0 && r.reachable &&
                (r.railLeft === null || r.right <= r.railLeft + 0.5),
                JSON.stringify(r));

            check(`${label} mega-menu @${width}: its foot is on screen and reachable`,
                r.bottom <= r.innerHeight + 0.5 && r.lastReachable,
                `bottom ${r.bottom} vs viewport ${r.innerHeight}, ` +
                `last row "${r.lastClass}" reachable=${r.lastReachable}`);

            check(`${label} mega-menu @${width}: stops above a mounted anchor`,
                r.anchorTop === null || r.bottom <= r.anchorTop + 0.5,
                `panel bottom ${r.bottom} vs anchor top ${r.anchorTop}`);
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

/* A canvas reading of DYED garment fabric against the colour that was asked
   for.

   These comparisons were byte-exact until September 5, 2026, and could be: the
   editor's default was a drawn product whose fabric is a flat fill, so a
   recoloured pixel WAS the hex. With no drawn products left the default is
   `tshirt-model-white`, dyed through its `tone` map -- the garment's diffuse
   response normalised to its own peak, which can only darken -- so the reading
   sits a shade under the request. Measured at the sample point:

     #123456 -> 18,51,84   (asked 18,52,86)   delta 0,1,2
     #B5352E -> 177,52,45  (asked 181,53,46)  delta 4,1,1
     #1F2A44 -> 31,41,67   (asked 31,42,68)   delta 0,1,1

   So the tolerance is 5: one level above the worst modulation measured, and an
   order of magnitude below what a real break shows -- a colourway that fails to
   reach the garment leaves it at 244,244,249, which is 60 to 226 levels out. */
const DYE_TOLERANCE = 5;

function dyedAs(pixel, hex) {
    const m = /^#(..)(..)(..)$/.exec(hex);
    if (!m || typeof pixel !== "string") { return false; }
    const want = [1, 2, 3].map((i) => parseInt(m[i], 16));
    const got = pixel.split(",").map(Number);
    return got.length === 4 && got[3] >= 250 &&
        want.every((v, i) => Math.abs(got[i] - v) <= DYE_TOLERANCE);
}

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
       wood frame template instead of the editor's default and report
       "no background panel" as a product failure. They did, once. */
    await page.navigate(`http://localhost:${PORT}/mockup.html`, 1440);
    await page.evaluate("localStorage.clear(), true");

    /* The editor's default, which is `tshirt-model-white` since September 5,
       2026. It is eligible for the same reason the drawn products were --
       everything around the garment is transparent and exports that way --
       but it gets there by being a CUT-OUT PHOTOGRAPH rather than by being
       drawn, which is the only kind of eligible product left now that `mug`
       is retired. Verified: the canvas corner reads 0,0,0,0 on load. */
    await page.navigate(`http://localhost:${PORT}/mockup.html`, 1440);
    /* Driven through the picker, not a swatch row: the background's quick
       picks were replaced by a hue strip on August 25, 2026 and Transparent
       moved INTO the preset grid, where it is the first button. That move is
       the load-bearing part of this check -- without it, choosing a colour
       would be a one-way door, and the editor's default state unreachable. */
    /* Wait for the base photograph before reading a pixel, which a drawn
       default never needed. drawPhoto()'s loading state fills the WHOLE canvas
       with #F4F3EF at 1000x1000, so a corner read taken too early returns
       244,243,239,255 and the "export stays transparent" check fails on a
       placeholder. Readiness is the canvas reaching the base's native size. */
    const vector = await page.evaluate(`(async () => {
        for (let i = 0; i < 80; i += 1) {
            const c = document.getElementById('mockup-canvas');
            if (c.width + 'x' + c.height === '1024x1536') { break; }
            await new Promise(r => setTimeout(r, 100));
        }
        const field = document.getElementById('m-bg-field');
        const trigger = document.getElementById('m-bg-trigger');
        if (!field || !trigger) { return { missing: true }; }
        const corner = () => ${CORNER};
        const before = corner();
        const exportBefore = document.getElementById('mockup-canvas').toDataURL('image/png');

        trigger.click();
        const hex = document.getElementById('m-bg-in-hex');
        hex.value = '#E5E5E2';
        hex.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 250));
        const after = corner();
        const exportAfter = document.getElementById('mockup-canvas').toDataURL('image/png');
        const stored = (JSON.parse(localStorage.getItem('tb_mockup_v1') || '{}')).bg;

        const presets = [...document.querySelectorAll('#m-bg-presets button')];
        const first = presets[0] ? presets[0].getAttribute('aria-label') : null;
        presets[0].click();
        await new Promise(r => setTimeout(r, 250));
        const cleared = corner();
        trigger.click();
        return {
            hidden: field.hidden, before: before, after: after,
            exportChanged: exportBefore !== exportAfter, stored: stored,
            firstPreset: first, cleared: cleared,
            clearedStore: (JSON.parse(localStorage.getItem('tb_mockup_v1') || '{}')).bg,
            label: document.getElementById('m-bg-hex').textContent.trim(),
            strip: !!document.getElementById('m-bg-strip'),
            row: !!document.getElementById('m-bg-row')
        };
    })()`);

    check("mockup: background panel offered on a cut-out photographic garment",
        !vector.missing && vector.hidden === false, JSON.stringify(vector));
    check("mockup: no background by default, so the export stays transparent",
        vector.before === "0,0,0,0", `corner ${vector.before}`);
    check("mockup: a chosen background reaches the canvas and the export",
        vector.after === "229,229,226,255" && vector.exportChanged &&
        vector.stored === "#E5E5E2",
        JSON.stringify(vector));
    check("mockup: Transparent is the picker's first preset and clears the canvas",
        vector.firstPreset === "Transparent" && vector.cleared === "0,0,0,0" &&
        vector.clearedStore === null && vector.label === "Transparent",
        JSON.stringify(vector));
    check("mockup: the background panel carries a hue strip, not a swatch row",
        vector.strip === true && vector.row === false,
        JSON.stringify({ strip: vector.strip, row: vector.row }));

    /* A photographic template: NOT eligible unless it declares
       `background: true`. Seeded with a stored background from an eligible
       product, which must not reach this canvas -- the storage is shared
       across products. */
    await page.navigate(`http://localhost:${PORT}/mockup.html`, 1440);
    const photo = await page.evaluate(`(async () => {
        localStorage.setItem('tb_editor_preset', JSON.stringify('wood-a4'));
        localStorage.setItem('tb_mockup_v1', JSON.stringify({ product: 'banner-rollup-white', bg: '#FF0000' }));
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
       product colourway path anything. Pixel (650, 520) is garment fabric on
       `tshirt-model-white`, 28px above the print zone's top edge at y=548.

       It was (500, 300) until September 5, 2026, chosen for the drawn tee's
       1000x1000 canvas. On the model photograph's 1024x1536 that point is the
       model's SKIN -- it measured 156,101,79 -- so the check was reading a
       face and calling it fabric. The new point measures 244,244,249 and goes
       to 18,51,84 under a #123456 colourway, which is the literal hex the
       check types.

       Storage is cleared first, and that is not housekeeping: the block above
       seeds a red background to prove it cannot reach a photographic
       template, and the default product IS eligible for it, so without this
       the corner assertion below would read that red and fail for the wrong
       reason. It did, on the first run. */
    await page.navigate(`http://localhost:${PORT}/mockup.html`, 1440);
    await page.evaluate("localStorage.clear(), true");
    await page.navigate(`http://localhost:${PORT}/mockup.html`, 1440);

    /* The template loaded at all, asserted before anything samples the canvas.

       Everything below reads pixels, and until September 10, 2026 they were
       read with no guarantee there was a photograph under them. The navigation
       poll now holds until the base image is painted, so this should never
       fail -- and it is here precisely BECAUSE it should never fail: if the
       wait is ever removed, weakened, or outrun, this says "the template did
       not load" instead of letting three colour checks report a placeholder as
       a wrong colour. A defect should be named by the check nearest to it.

       It fails loudly on `error` rather than hanging: a template whose base
       photograph 404s is a real defect, and the navigation poll deliberately
       releases on that state so it arrives here. */
    const assetState = await page.evaluate(`(() => {
        const wrap = document.querySelector('[data-mockup-state]');
        return wrap ? wrap.getAttribute('data-mockup-state') : 'no-attribute';
    })()`);
    check("mockup: the template's base photograph loaded before anything sampled it",
        assetState === "ready", `data-mockup-state was ${assetState}`);

    const colorway = await page.evaluate(`(async () => {
        const fabric = () => {
            const c = document.getElementById('mockup-canvas');
            return [...c.getContext('2d').getImageData(650, 520, 1, 1).data].join(',');
        };
        const before = fabric();
        document.getElementById('m-color-trigger').click();
        const opened = !document.getElementById('m-color-popover').hidden;
        const hex = document.getElementById('m-color-in-hex');
        hex.value = '#123456';
        hex.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 250));
        const typed = fabric();
        /* Shut the popover before the strip check below: it is positioned
           directly over the strip, so a click there would land on the
           popover, not the track. */
        document.getElementById('m-color-trigger').click();
        return { opened: opened, before: before, typed: typed,
                 closed: document.getElementById('m-color-popover').hidden,
                 corner: ${CORNER} };
    })()`);

    check("mockup: the colourway picker still drives the garment",
        colorway.opened && colorway.closed && dyedAs(colorway.typed, "#123456"),
        JSON.stringify(colorway));
    check("mockup: a garment colour is not a background",
        colorway.corner === "0,0,0,0", `corner ${colorway.corner}`);

    /* The panel's hue strip, which replaced the colourway swatch row on
       August 25, 2026. It is the popover's own track a second time, sharing
       that picker instance's hue, so the two things that can silently break
       are the two asserted here: the drag has to reach the garment, and
       sync() has to move THIS strip's thumb and not only the popover's.

       Trusted input, not a synthetic PointerEvent: bindTrack calls
       setPointerCapture, which throws on a pointerId with no live pointer
       behind it, so a dispatched event would abort the handler before it ever
       read the pointer's position and the strip would look dead against
       working code.

       The colour is not hardcoded. Pressing at the middle of the track asks
       for hue 180 at the saturation and value of the #123456 typed above,
       and what that rounds to is the picker's business; the contract is that
       the garment, the trigger's label and the thumb all agree on it, and
       that the hue actually rotated -- a cyan has both green and blue above
       red, which #123456 does not.

       "Agree" is within DYE_TOLERANCE per channel, not exactly equal, and
       that changed on September 5, 2026 with the editor's default. A drawn
       product's fabric was a FLAT fill, so the recoloured pixel was the
       chosen hex to the bit. A photographic garment is dyed through its
       `tone` map, which can only darken, so the pixel sits a shade under the
       label: measured at this point, #123456 lands as 18,51,84 against a
       label of 18,52,86 -- a delta of 0,-1,-2. The tolerance is the tone
       map's modulation and nothing more; a real disagreement between the
       three readings is tens of levels, not two. */
    const stripBox = await page.evaluate(`(() => {
        const el = document.getElementById('m-color-strip');
        el.scrollIntoView({ block: 'center' });
        const b = el.getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2, width: b.width };
    })()`);
    for (const type of ["mousePressed", "mouseReleased"]) {
        await page.call("Input.dispatchMouseEvent", {
            type: type, x: stripBox.x, y: stripBox.y, button: "left",
            buttons: type === "mousePressed" ? 1 : 0, clickCount: 1
        }, page.sessionId);
    }
    const strip = await page.evaluate(`(async () => {
        await new Promise(r => setTimeout(r, 250));
        const c = document.getElementById('mockup-canvas');
        const px = [...c.getContext('2d').getImageData(650, 520, 1, 1).data];
        const label = document.getElementById('m-color-hex').textContent.trim();
        const m = /^#(..)(..)(..)$/.exec(label);
        return {
            px: px, label: label,
            labelRgb: m ? [1, 2, 3].map(i => parseInt(m[i], 16)) : null,
            thumb: parseFloat(document.getElementById('m-color-strip-thumb').style.left)
        };
    })()`);

    check("mockup: the panel hue strip drives the garment and its own thumb",
        !!strip.labelRgb &&
        strip.px.slice(0, 3).every((v, i) =>
            Math.abs(v - strip.labelRgb[i]) <= DYE_TOLERANCE) &&
        strip.px[1] > strip.px[0] && strip.px[2] > strip.px[0] &&
        Math.abs(strip.thumb - 50) <= 4,
        JSON.stringify(strip));

    /* ----------------------------------------------------------------------
       The model photograph, eligible since August 25, 2026.

       This one CAN be asserted against pixels, which the wood frame above
       cannot: its base is 1024x1536 with a transparent surround -- the model
       was cut out of the studio backdrop -- so a background fill lands in the
       space around the figure and shows. Corner (2, 2) is that surround.

       The two templates together are the whole contract: transparency around
       a subject qualifies, transparency that IS a print window does not, and
       neither is detected -- both are declared in js/mockup-templates.js.
       ---------------------------------------------------------------------- */
    await page.navigate(`http://localhost:${PORT}/mockup.html`, 1440);
    await page.evaluate(`(() => {
        localStorage.clear();
        localStorage.setItem('tb_editor_preset', JSON.stringify('tshirt-model-white'));
        return true;
    })()`);
    await page.navigate(`http://localhost:${PORT}/mockup.html`, 1440);
    const modelBg = await page.evaluate(`(async () => {
        /* Wait for the ASSETS, not for the label.

           The aria-label comes from the template config and is set the moment
           the preset is selected, while the seven bitmaps behind it are still
           decoding. Until they land, render() takes its not-ready branch and
           paints a 1000x1000 #F4F3EF placeholder over the whole canvas -- so
           a corner sampled in that window reads opaque cream, and the
           "before" half of the assertion below fails while the feature it is
           testing works perfectly. Measured: before "244,243,239,255" against
           an expected "0,0,0,0", with the "after" value exactly right.

           The ready branch sizes the canvas to the base image's natural
           dimensions, so 1024x1536 IS the readiness signal here -- and it is
           the same fact the next check asserts, which is why it needs no
           cooperation from mockup.js.

           This surfaced when navigation stopped waiting on
           readyState === "complete" (September 3, 2026). That wait had been
           covering these decodes incidentally: mockup.js starts them during
           load, and an image request started before the load event delays it.
           Nothing in the editor regressed -- this check never had a wait of
           its own and had been living off one that was never meant for it.
           Worth remembering as the general shape: removing an over-broad
           wait does not break the pages, it exposes every check that was
           quietly leaning on it. */
        const canvas = document.getElementById('mockup-canvas');
        let waited = 0;
        for (let i = 0; i < 150; i += 1) {
            const label = canvas.getAttribute('aria-label') || '';
            if (label.indexOf('White T-Shirt on Model') === 0 &&
                canvas.width === 1024 && canvas.height === 1536) { break; }
            await new Promise(r => setTimeout(r, 100));
            waited = i + 1;
        }
        const corner = () => ${CORNER};
        const before = corner();
        document.getElementById('m-bg-trigger').click();
        const hex = document.getElementById('m-bg-in-hex');
        hex.value = '#E5E5E2';
        hex.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 400));
        return {
            label: canvas.getAttribute('aria-label'),
            native: canvas.width + 'x' + canvas.height,
            hidden: document.getElementById('m-bg-field').hidden,
            /* Reported so a future failure says whether the wait ran out
               rather than leaving the next person to guess. */
            waitedMs: waited * 100,
            before: before, after: corner()
        };
    })()`);

    check("mockup: the model photograph offers a background",
        modelBg.hidden === false && modelBg.native === "1024x1536",
        JSON.stringify(modelBg));
    check("mockup: that background reaches the photograph's transparent surround",
        modelBg.before === "0,0,0,0" && modelBg.after === "229,229,226,255",
        JSON.stringify(modelBg));

    /* ----------------------------------------------------------------------
       5c. The export panel and the saved-mockups tab (August 25, 2026).

       Both replaced controls that the suite used to drive: a single
       "Download PNG" button in the editor bar, and a tray that sat in the
       flow under the canvas. What is asserted here is what silently breaks --
       that the sizes are the canvas's own and not a hardcoded ladder (they
       differ per product: 1000x1000 drawn, 1024x1536 photographed), that JPG
       really is a JPEG, and that the tray tab still reaches the collection
       now that it is hidden until asked for.
       ---------------------------------------------------------------------- */
    section("5c. Mockup editor: export panel and saved-mockups tab");

    /* Two PHOTOGRAPHIC templates now, and that is a change of premise rather
       than of casting. This pair used to be drawn-versus-photographed --
       `mug` at 1000x1000 against a photograph at its native size -- and every
       previous retirement just recast the drawn half: `tshirt` to `hoodie` on
       September 2, 2026, `hoodie` to `mug` on September 3.

       On September 5 `mug` became `frame-black-shelf` and there is no drawn
       product left to cast, so the pair is two photographs of DIFFERENT native
       sizes instead. That still tests the thing this check is for -- that the
       export sizes are read from the canvas rather than a hardcoded ladder --
       and tests it slightly harder, because 1122x1402 and 1024x1536 differ in
       both dimensions where 1000x1000 was square. */
    for (const [doc, native] of [["frame-black-shelf", "1122x1402"], ["tshirt-model-white", "1024x1536"]]) {
        await page.navigate(`http://localhost:${PORT}/mockup.html`, 1440);
        await page.evaluate(`(() => {
            localStorage.clear();
            localStorage.setItem('tb_editor_preset', JSON.stringify('${doc}'));
            return true;
        })()`);
        await page.navigate(`http://localhost:${PORT}/mockup.html`, 1440);
        const ex = await page.evaluate(`(async () => {
            for (let i = 0; i < 80; i += 1) {
                const c = document.getElementById('mockup-canvas');
                if (c.width + 'x' + c.height === '${native}') { break; }
                await new Promise(r => setTimeout(r, 100));
            }
            const canvas = document.getElementById('mockup-canvas');
            document.getElementById('dl-toggle').click();
            await new Promise(r => setTimeout(r, 150));
            const sizes = [...document.querySelectorAll('#dl-sizes .dl-size')]
                .map(b => b.getAttribute('data-size'));

            /* The anchor is never really followed: its href is read instead,
               which is also how the filename checks in section 7 work. */
            const seen = [];
            const real = HTMLAnchorElement.prototype.click;
            HTMLAnchorElement.prototype.click = function () {
                seen.push({ name: this.download, href: this.href });
            };
            document.querySelector('#dl-panel [data-format="jpg"]').click();
            await new Promise(r => setTimeout(r, 100));
            const note = !document.getElementById('dl-note').hidden;
            document.getElementById('dl-toggle').click();
            await new Promise(r => setTimeout(r, 120));
            document.querySelectorAll('#dl-sizes .dl-size')[1].click();
            await new Promise(r => setTimeout(r, 400));
            HTMLAnchorElement.prototype.click = real;

            let decoded = null;
            if (seen[0]) {
                const img = new Image();
                img.src = seen[0].href;
                try { await img.decode(); decoded = img.naturalWidth + 'x' + img.naturalHeight; }
                catch (e) { decoded = 'undecodable'; }
            }
            return {
                native: canvas.width + 'x' + canvas.height,
                sizes: sizes,
                jpgNote: note,
                file: seen[0] ? seen[0].name : null,
                mime: seen[0] ? seen[0].href.slice(0, 15) : null,
                decoded: decoded,
                closed: document.getElementById('dl-panel').hidden
            };
        })()`);

        const half = native.split("x").map((n) => Math.round(+n / 2)).join("x");
        check(`mockup export @${doc}: the sizes are the canvas's own`,
            ex.native === native &&
            ex.sizes.join(" | ") === `${native} px | ${half} px | ` +
                native.split("x").map((n) => Math.round(+n / 4)).join("x") + " px",
            JSON.stringify(ex));
        check(`mockup export @${doc}: JPG writes a real JPEG at the chosen size`,
            ex.file === "templatebox-mockup.jpg" &&
            ex.mime === "data:image/jpeg" && ex.decoded === half && ex.closed === true,
            JSON.stringify(ex));
        check(`mockup export @${doc}: JPG says it will flatten a transparent surround`,
            ex.jpgNote === true, JSON.stringify({ note: ex.jpgNote }));
    }

    /* The tray: hidden behind a tab now, so the assertion is that adding one
       still reaches it and that the count says so. A design has to be
       uploaded first -- the button refuses an empty canvas, which is itself
       worth keeping honest. */
    await page.navigate(`http://localhost:${PORT}/mockup.html`, 1440);
    await page.evaluate("localStorage.clear(), true");
    await page.navigate(`http://localhost:${PORT}/mockup.html`, 1440);
    const tray = await page.evaluate(`(async () => {
        /* Rendered, not just flagged. Setting the hidden ATTRIBUTE says
           nothing about whether the element is on screen: an author display
           in the stylesheet beats the UA sheet's [hidden] rule, which is
           exactly how the live canvas stayed visible underneath the My
           Mockups tab while every check here passed. */
        const shown = (id) => {
            const el = document.getElementById(id);
            if (!el) { return false; }
            return getComputedStyle(el).display !== 'none' &&
                el.getBoundingClientRect().height > 0;
        };

        const refused = (() => {
            document.getElementById('add-to-tray').click();
            return document.getElementById('m-design-error').textContent.length > 0;
        })();

        const c = document.createElement('canvas');
        c.width = 200; c.height = 200;
        const g = c.getContext('2d');
        g.fillStyle = '#CC3333';
        g.fillRect(0, 0, 200, 200);
        const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        const dt = new DataTransfer();
        dt.items.add(new File([blob], 'design.png', { type: 'image/png' }));
        const input = document.getElementById('m-design');
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 900));

        /* Pixel (650, 520) is garment fabric, above the print area: the same
           reading the colourway checks use, and moved for the same reason --
           (500, 300) is the model's skin on the photographic default. */
        const fabric = () => [...document.getElementById('mockup-canvas')
            .getContext('2d').getImageData(650, 520, 1, 1).data].join(',');
        const setHex = async (value) => {
            document.getElementById('m-color-trigger').click();
            const hex = document.getElementById('m-color-in-hex');
            hex.value = value;
            hex.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise(r => setTimeout(r, 300));
            document.getElementById('m-color-trigger').click();
        };
        const setLabel = (value) => {
            const el = document.getElementById('m-label');
            el.value = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
        };

        /* Mockup A: red, default size. */
        await setHex('#B5352E');
        setLabel('Red tee');
        document.getElementById('add-to-tray').click();
        await new Promise(r => setTimeout(r, 300));
        const afterAdd = {
            trayShown: shown('view-tray'),
            previewHidden: !shown('view-preview'),
            count: document.getElementById('tray-count').textContent,
            countShown: !document.getElementById('tray-count').hidden,
            items: document.querySelectorAll('#tray-grid .tray-item').length,
            captions: document.querySelectorAll('#tray-grid .tray-item-label').length
        };

        /* Mockup B: navy, resized. */
        document.getElementById('view-tab-preview').click();
        await setHex('#1F2A44');
        const scale = document.getElementById('m-scale');
        scale.value = '120';
        scale.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 250));
        setLabel('Navy tee');
        document.getElementById('add-to-tray').click();
        await new Promise(r => setTimeout(r, 300));

        /* Reopen A. Its colour, its layer's size and its name all have to come
           back, and the pane has to show the canvas again. */
        document.querySelectorAll('#tray-grid .tray-open')[0].click();
        await new Promise(r => setTimeout(r, 500));
        const reopened = {
            fabric: fabric(),
            scale: document.getElementById('m-scale-number').value,
            label: document.getElementById('m-label').value,
            previewShown: shown('view-preview'),
            trayHiddenWhilePreviewing: !shown('view-tray'),
            active: [...document.querySelectorAll('#tray-grid .tray-item')]
                .findIndex(t => t.classList.contains('is-active')),
            /* The same fact in the accessibility tree. A class is invisible
               to a screen reader, so the marking has to be asserted in both
               places or half of it can rot unnoticed. */
            current: [...document.querySelectorAll('#tray-grid .tray-open')]
                .map(b => b.getAttribute('aria-current') || 'none').join(','),
            items: document.querySelectorAll('#tray-grid .tray-item').length
        };

        /* Edit AFTER reopening, then switch away and back. A saved entry holds
           its own copy of the state, so these edits must not follow it. */
        await setHex('#2E4B3C');
        scale.value = '40';
        scale.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 250));
        document.getElementById('view-tab-tray').click();
        document.querySelectorAll('#tray-grid .tray-open')[1].click();
        await new Promise(r => setTimeout(r, 450));
        const backToB = { fabric: fabric(), scale: document.getElementById('m-scale-number').value };
        document.getElementById('view-tab-tray').click();
        document.querySelectorAll('#tray-grid .tray-open')[0].click();
        await new Promise(r => setTimeout(r, 450));
        const backToA = {
            fabric: fabric(), scale: document.getElementById('m-scale-number').value,
            current: [...document.querySelectorAll('#tray-grid .tray-open')]
                .map(b => b.getAttribute('aria-current') || 'none').join(',')
        };

        document.getElementById('view-tab-tray').click();
        await new Promise(r => setTimeout(r, 150));
        document.querySelectorAll('#tray-grid .tray-remove')[1].click();
        await new Promise(r => setTimeout(r, 200));
        const afterRemove = {
            items: document.querySelectorAll('#tray-grid .tray-item').length,
            count: document.getElementById('tray-count').textContent
        };

        document.getElementById('view-tab-preview').click();
        await new Promise(r => setTimeout(r, 150));
        return Object.assign(afterAdd, {
            refusedEmpty: refused,
            reopened: reopened, backToB: backToB, backToA: backToA,
            afterRemove: afterRemove,
            backToPreview: shown('view-preview') && !shown('view-tray')
        });
    })()`);

    check("mockup: an empty canvas is refused, with a reason",
        tray.refusedEmpty === true, JSON.stringify(tray));
    check("mockup: adding a mockup opens the tab it landed in and counts it",
        tray.trayShown && tray.previewHidden && tray.items === 1 &&
        tray.count === "1" && tray.countShown && tray.captions === 0,
        JSON.stringify(tray));
    check("mockup: clicking a saved mockup restores it and shows the canvas",
        dyedAs(tray.reopened.fabric, "#B5352E") && tray.reopened.scale === "75" &&
        tray.reopened.label === "Red tee" && tray.reopened.previewShown &&
        tray.reopened.trayHiddenWhilePreviewing &&
        tray.reopened.active === 0 && tray.reopened.items === 2,
        JSON.stringify(tray.reopened));
    /* Exactly one tile carries aria-current, and it moves with the selection.
       Asserted at two points on purpose: set-once-never-cleared and
       cleared-but-never-set both read as correct at a single moment.

       "none" rather than the raw getAttribute result: an absent attribute is
       null, and Array.join() renders null as an empty string, so the first
       version of this expected "true,null" and read "true," against perfectly
       good code. A sentinel that survives join keeps the failure output
       legible too. */
    check("mockup: the loaded tile says so in the accessibility tree, and only it",
        tray.reopened.current === "true,none" && tray.backToA.current === "true,none",
        JSON.stringify({ reopened: tray.reopened.current, backToA: tray.backToA.current }));
    /* The one that fails silently: share the state object between the entry
       and the editor and every edit rewrites the mockup it came from, so the
       tab quietly becomes two copies of the current render. */
    check("mockup: editing a reopened mockup does not rewrite what was saved",
        dyedAs(tray.backToB.fabric, "#1F2A44") && tray.backToB.scale === "120" &&
        dyedAs(tray.backToA.fabric, "#B5352E") && tray.backToA.scale === "75",
        JSON.stringify({ b: tray.backToB, a: tray.backToA }));
    check("mockup: removing a saved mockup drops it and recounts",
        tray.afterRemove.items === 1 && tray.afterRemove.count === "1",
        JSON.stringify(tray.afterRemove));
    check("mockup: the Live Preview tab comes back",
        tray.backToPreview === true, JSON.stringify(tray));

    /* A tile is the render's own shape, not a square (August 25, 2026).

       Asserted on the MODEL photograph specifically, and that is the whole
       point: its canvas is 1024x1536, so a forced 1:1 tile letterboxes it --
       measured at 84x127 inside a 127x127 box, a third of the tile empty and
       the mockup looking like a shrunken preview of itself.

       The reason this stood apart used to be that the tray checks above ran
       against the drawn t-shirt's 1000x1000 canvas, where a square tile and a
       correct one are indistinguishable. That stopped being true on
       September 5, 2026: with no drawn products left the editor's default IS
       `tshirt-model-white`, so those checks now run on this very template.
       The check stays because it is the only one that asserts tile SHAPE --
       the tray checks assert restore, labelling and counting -- but it is no
       longer isolating a canvas the others cannot reach.

       The comparison is the tile's rendered aspect against the thumbnail's
       own natural aspect, rather than a hardcoded 0.667: the assertion is
       "the tile matches its render", which stays true if a template's
       dimensions ever change. */
    await page.navigate(`http://localhost:${PORT}/mockup.html`, 1440);
    await page.evaluate(`(() => {
        localStorage.clear();
        localStorage.setItem('tb_editor_preset', JSON.stringify('tshirt-model-white'));
        return true;
    })()`);
    await page.navigate(`http://localhost:${PORT}/mockup.html`, 1440);
    const tileShape = await page.evaluate(`(async () => {
        for (let i = 0; i < 80; i += 1) {
            const label = document.getElementById('mockup-canvas').getAttribute('aria-label');
            if (label && label.indexOf('White T-Shirt on Model') === 0) { break; }
            await new Promise(r => setTimeout(r, 100));
        }
        const c = document.createElement('canvas');
        c.width = 300; c.height = 200;
        const g = c.getContext('2d');
        g.fillStyle = '#1B4FD8';
        g.fillRect(0, 0, 300, 200);
        const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        const dt = new DataTransfer();
        dt.items.add(new File([blob], 'art.png', { type: 'image/png' }));
        const input = document.getElementById('m-design');
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 1000));
        document.getElementById('add-to-tray').click();
        await new Promise(r => setTimeout(r, 600));

        const img = document.querySelector('#tray-grid .tray-thumb');
        const tile = document.querySelector('#tray-grid .tray-item');
        if (!img || !tile) { return { missing: true }; }
        const ib = img.getBoundingClientRect();
        const tb = tile.getBoundingClientRect();
        const panel = document.getElementById('view-tray');
        return {
            natural: +(img.naturalWidth / img.naturalHeight).toFixed(3),
            rendered: +(ib.width / ib.height).toFixed(3),
            emptyShare: +(1 - (ib.width * ib.height) / (tb.width * tb.height)).toFixed(3),
            /* The tab holds the tiles and nothing else -- no second canvas,
               no duplicate of the Live Preview beside them. */
            panelHolds: [...panel.children]
                .map(el => el.tagName.toLowerCase() + (el.hidden ? '(hidden)' : '')).join(','),
            canvases: panel.querySelectorAll('canvas').length,
            /* The one the screenshot caught: the stage carries an author
               display of flex, which outranks the UA sheet's [hidden] rule,
               so setting the attribute left the live canvas rendered above
               the tiles. Measured, not asked. */
            stageStillRendered: (() => {
                const stage = document.getElementById('view-preview');
                return getComputedStyle(stage).display !== 'none' &&
                    stage.getBoundingClientRect().height > 0;
            })(),
            /* What the stage's leak actually cost: with the canvas rendered
               above them, the tiles sat a full render down the pane. Measured
               as the tile's distance from the top of the panel rather than as
               "the pane does not scroll" -- a tray holding a dozen mockups is
               supposed to scroll, so that would have been the wrong contract
               and would fail on a full tray. */
            tileTopOffset: Math.round(
                tile.getBoundingClientRect().top - panel.getBoundingClientRect().top)
        };
    })()`);

    check("mockup: a saved tile is the render's shape, not a letterboxed square",
        !tileShape.missing && Math.abs(tileShape.natural - tileShape.rendered) < 0.02 &&
        tileShape.emptyShare < 0.05,
        JSON.stringify(tileShape));
    check("mockup: the My Mockups tab holds the tiles and nothing else",
        tileShape.canvases === 0 &&
        tileShape.panelHolds === "h2,p(hidden),div",
        JSON.stringify({ holds: tileShape.panelHolds, canvases: tileShape.canvases }));
    check("mockup: the live canvas is not rendered under the tiles",
        tileShape.stageStillRendered === false && tileShape.tileTopOffset < 8,
        JSON.stringify({ stage: tileShape.stageStillRendered,
                         tileTop: tileShape.tileTopOffset }));

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
            /* Download left the bar on August 25, 2026 for the control
               column's action row. Both halves are read here, because
               removing the first without adding the second would leave the
               page with no exporter at all. */
            barDownload: !!document.querySelector('.editor-bar .dl-toggle'),
            columnDownload: !!document.querySelector('.mockup-actions #dl-toggle'),
            addButton: (() => {
                const el = document.getElementById('add-to-tray');
                return el ? el.getAttribute('aria-label') : null;
            })(),
            addInPane: !!document.querySelector('.mockup-sidebar #add-to-tray')
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
    }

    /* Where the two actions live, at every width. The icon-only Add button is
       the reason the name is asserted rather than the text: it has no visible
       label at all, so an empty accessible name would leave a screen-reader
       user with an unlabelled button and no way to reach the tray. */
    for (const width of [1920, 1440, 1280, 1199, 768, 390, 320]) {
        await page.navigate(`http://localhost:${PORT}/mockup.html`, width);
        const b = await page.evaluate(BAR);
        check(`mockup @${width}: one exporter, in the column and not the bar`,
            b.barDownload === false && b.columnDownload === true,
            JSON.stringify({ bar: b.barDownload, column: b.columnDownload }));
        check(`mockup @${width}: the icon-only Add button carries its name`,
            b.addButton === "Add Mockup" && b.addInPane === false,
            JSON.stringify({ name: b.addButton, insidePane: b.addInPane }));
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
   7. The name a visitor types actually names the file (August 24, 2026).

   Reported as "naming your template is not working", and it was true on three
   of the four editors. The resume exported from the person's name field, the
   business document from its type and recipient, and the mockup from a
   hard-coded literal, so the name input in the bar was typed, persisted,
   restored on the next visit -- and never used for anything. Only the poster
   had ever wired its field to its export.

   This is asserted against the FILENAME THE BROWSER IS GIVEN, not against the
   state or the input, because a field that feeds a variable nobody reads is
   exactly the defect: everything looks correct at every layer except the one
   the visitor sees.

   Two interception points, because the two export engines differ. jsPDF's
   save() is not an own property of jsPDF.prototype and does not download
   through an anchor, so patching either of those captures nothing -- the
   constructor is what has to be wrapped. Canvas exports do use an anchor.
   Both were found the hard way while confirming the defect.
   ========================================================================== */

/* ==========================================================================
   8. Admin: a save that did not persist must not report success.

   TB.storageSet swallows quota and private-mode failures by design, so the
   blog workspace could write nothing and still print "Saved to the local
   workspace" -- with the post gone on the next reload. Posts carry their
   cover inlined as a data URI and that storage is shared with the thumbnail
   workspace, so filling it is ordinary rather than remote.

   The first attempt at the fix LOOKED right and did nothing: save() wrote
   the warning into formError, and the reset that runs immediately afterwards
   cleared it in the same tick. That is why this is a test and not a reading
   of the code -- the failure mode here is a message that exists for a
   microsecond.

   Both directions are asserted. A warning that appears and never clears
   would be just as wrong: the operator would learn to ignore it.
   ========================================================================== */

async function adminPersistenceChecks(page) {
    section("8. Admin: a save that did not persist says so");

    await page.navigate(`http://localhost:${PORT}/admin.html`, 1440);

    const out = await page.evaluate(`(async () => {
        const wait = (ms) => new Promise(r => setTimeout(r, ms));
        const fill = (title) => {
            document.querySelector("[data-new-post]").click();
            document.getElementById("f-title").value = title;
            document.getElementById("f-title").dispatchEvent(new Event("input"));
            document.getElementById("f-content").value =
                "## Heading" + String.fromCharCode(10, 10) + "Body text for the probe.";
            document.getElementById("post-form").requestSubmit();
        };

        localStorage.clear();

        /* Every write fails, exactly as a full quota does. */
        const realSet = TB.storageSet;
        TB.storageSet = () => {};
        fill("Quota Probe");
        await wait(300);
        const warned = document.querySelector("[data-form-error]").textContent;
        const claimed = document.querySelector("[data-form-status]").textContent;

        /* Storage works again: the warning must go and success must return. */
        TB.storageSet = realSet;
        localStorage.clear();
        fill("Good Save");
        await wait(300);
        const okWarn = document.querySelector("[data-form-error]").textContent;
        const okStatus = document.querySelector("[data-form-status]").textContent;
        const stored = JSON.parse(localStorage.getItem("tb_admin_posts") || "[]");
        localStorage.clear();

        return JSON.stringify({
            warnedOnFailure: warned.indexOf("did not store the workspace") >= 0,
            claimedSuccessOnFailure: claimed.indexOf("Saved to the local workspace") >= 0,
            warningClearedOnSuccess: okWarn === "",
            reportedSuccessOnSuccess: okStatus.indexOf("Saved to the local workspace") >= 0,
            persistedOnSuccess: stored.some((p) => p.slug === "good-save")
        });
    })()`);

    const r = JSON.parse(out);
    check("admin: a save that did not persist warns about it",
        r.warnedOnFailure, "no quota warning was shown");
    check("admin: a save that did not persist does not claim success",
        !r.claimedSuccessOnFailure, "it still said \"Saved to the local workspace\"");
    check("admin: a save that DID persist clears the warning",
        r.warningClearedOnSuccess, "the warning stuck after a good save");
    check("admin: a save that DID persist reports success and stores the post",
        r.reportedSuccessOnSuccess && r.persistedOnSuccess,
        `status shown: ${r.reportedSuccessOnSuccess}, post stored: ${r.persistedOnSuccess}`);
}

async function exportNameChecks(page) {
    section("7. Editors: the typed name names the downloaded file");

    /* jsPDF editors: wrap the constructor and read what save() is called
       with, once before touching the field and once after. */
    for (const [label, urlPath, fallback] of [
        ["resume", "/resume.html", "adaeze-nwosu-templatebox.pdf"],
        ["docs", "/docs.html", "rent-receipt-nova-interiors-ltd-templatebox.pdf"]
    ]) {
        await page.navigate(`http://localhost:${PORT}${urlPath}`, 1440);
        const r = await page.evaluate(`(async () => {
            for (let i = 0; i < 100; i += 1) {
                if (window.jspdf && window.jspdf.jsPDF) { break; }
                await new Promise(r => setTimeout(r, 100));
            }
            if (!window.jspdf || !window.jspdf.jsPDF) { return { error: 'jsPDF never loaded' }; }

            const out = {};
            const Real = window.jspdf.jsPDF;
            const wrap = (key) => {
                const F = function (...a) {
                    const inst = new Real(...a);
                    inst.save = (fn) => { out[key] = fn; return inst; };
                    return inst;
                };
                F.prototype = Real.prototype;
                return F;
            };

            window.jspdf.jsPDF = wrap('untouched');
            document.getElementById('download-pdf').click();
            await new Promise(r => setTimeout(r, 1200));

            /* An apostrophe and punctuation on purpose: the name reaches this
               through sanitize(), so "Ada's" is "Ada&#39;s" by then and a slug
               that strips punctuation without decoding first leaves the digits
               behind as "ada39s". */
            const field = document.getElementById('doc-name');
            field.value = "Ada's Big Project 2026!";
            field.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise(r => setTimeout(r, 400));

            window.jspdf.jsPDF = wrap('typed');
            document.getElementById('download-pdf').click();
            await new Promise(r => setTimeout(r, 1200));
            return out;
        })()`);

        check(`${label}: an untouched name field keeps the composed filename`,
            r.untouched === fallback, JSON.stringify(r));
        check(`${label}: a typed name is the filename`,
            r.typed === "adas-big-project-2026-templatebox.pdf", JSON.stringify(r));
    }

    /* Canvas editors: the anchor's download attribute is the filename.

       Storage is cleared first, and that is not housekeeping. The "untouched"
       case below asserts what an editor names a file when nobody has named
       the work -- which only holds on a clean profile, and section 5c types
       "Red tee" into #m-label and persists it. Without this the untouched
       export comes back as red-tee.png and the failure points at the export
       path, which is not where the problem is. Caught by a deliberate break
       elsewhere in the same run, not by design. */
    await page.navigate(`http://localhost:${PORT}/mockup.html`, 1440);
    await page.evaluate("localStorage.clear(), true");
    await page.navigate(`http://localhost:${PORT}/mockup.html`, 1440);
    const mockup = await page.evaluate(`(async () => {
        const seen = [];
        HTMLAnchorElement.prototype.click = function () { seen.push(this.download); };
        /* Two clicks per export since August 25, 2026: the toggle opens the
           panel, the size row writes the file. Full size is index 0. */
        const exportFullSize = async () => {
            document.getElementById('dl-toggle').click();
            await new Promise(r => setTimeout(r, 150));
            document.querySelectorAll('#dl-sizes .dl-size')[0].click();
            await new Promise(r => setTimeout(r, 350));
        };
        await exportFullSize();
        const label = document.getElementById('m-label');
        label.value = 'Front chest print, navy tee';
        label.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 300));
        await exportFullSize();
        return { untouched: seen[0], typed: seen[1] };
    })()`);

    check("mockup: an empty Mockup Label keeps the default filename",
        mockup.untouched === "templatebox-mockup.png", JSON.stringify(mockup));
    check("mockup: the Mockup Label is the filename",
        mockup.typed === "front-chest-print-navy-tee.png", JSON.stringify(mockup));

    await page.navigate(`http://localhost:${PORT}/poster.html`, 1440);
    const poster = await page.evaluate(`(async () => {
        const seen = [];
        HTMLAnchorElement.prototype.click = function () { seen.push(this.download); };
        document.getElementById('dl-toggle').click();
        await new Promise(r => setTimeout(r, 300));
        const btn = [...document.querySelectorAll('#dl-panel button')]
            .find(b => b.textContent.trim() === 'Download');
        if (!btn) { return { error: 'no Download button in the panel' }; }
        btn.click();
        await new Promise(r => setTimeout(r, 700));
        const field = document.getElementById('doc-name');
        field.value = 'Summer Gig Poster';
        field.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 300));
        btn.click();
        await new Promise(r => setTimeout(r, 700));
        return { untouched: seen[0], typed: seen[1] };
    })()`);

    check("poster: an untouched name field keeps the default filename",
        poster.untouched === "templatebox-poster.png", JSON.stringify(poster));
    check("poster: a typed name is the filename",
        poster.typed === "summer-gig-poster.png", JSON.stringify(poster));
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

/* ==========================================================================
   9. Resume templates: every design actually renders.

   THE GAP THIS CLOSES. Every other section here checks the machinery AROUND
   the documents -- which ad band mounts, where the header's edge lands, that
   a CTA routes through the interstitial, that a download is named from the
   right field. Nothing rendered a resume template and looked at the result,
   so on September 8, 2026 seven defects in one template were found by reading
   the code and NONE of them could have failed this suite.

   Worse, the one net that might have caught a regression -- section 4's
   comparison against HEAD -- only answers "did anything change since the last
   commit?". Commit a mistake and it becomes the baseline: from then on the
   broken version is compared against the broken version and reported clean.
   A check has to assert what is TRUE of a good sheet, not merely what is
   unchanged since yesterday.

   WHAT IS ASSERTED, AND WHY NOT MORE. Everything below holds for every
   template at any content volume, which is what lets it run against all of
   them with no per-template table to maintain -- a table would be a second
   source of truth and would drift the way the ad-host and footer constants
   already have.

   Page COUNT is deliberately not asserted. Ruled Serif is structurally two
   pages at any content volume (measured; see
   docs/implementation/RESUME_SHARED_FIELDS_AND_CONTACT_GLYPHS.md), so "one
   page" is false for it and an expected-count table is the drift this avoids.
   Overflow is the honest version of the same question: it asks whether
   content ran past the boundary its own column declared, which is wrong for
   every template however many pages it takes.

   This runs in the browser because layout() measures text through jsPDF and
   throws without it, so it cannot live in the static section.
   ========================================================================== */
async function resumeTemplateChecks(page) {
    section("9. Resume templates: every design renders");

    await page.navigate(`http://localhost:${PORT}/resume.html`, 1440);

    const r = await page.evaluate(`(async () => {
        for (let i = 0; i < 100; i += 1) {
            if (window.jspdf && window.jspdf.jsPDF) { break; }
            await new Promise(r => setTimeout(r, 100));
        }
        if (!window.jspdf || !window.jspdf.jsPDF) { return { error: 'jsPDF never loaded' }; }
        if (!window.TBResume || !window.TB_RESUME_TEMPLATES) { return { error: 'the engine or the registry did not load' }; }

        const HEX = /^#[0-9A-Fa-f]{6}$/;

        /* A private jsPDF purely to MEASURE with. The engine measures through
           the same Helvetica metrics, so a width taken here is the width the
           painters will draw, not an approximation of it. */
        const mdoc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
        const pdfFamily = (f) =>
            f === 'serif' ? 'times' : (f === 'mono' ? 'courier' : 'helvetica');
        const inkWidth = (o) => {
            mdoc.setFont(pdfFamily(o.family), o.weight === 'bold' ? 'bold' : 'normal');
            mdoc.setFontSize(o.size);
            return mdoc.getTextWidth(o.text) +
                (o.tracking ? o.tracking * Math.max(0, String(o.text).length - 1) : 0);
        };

        /* A photograph, so a template that draws one is exercised with one
           rather than only in its empty state. Drawn on a canvas at the ratio
           the engine declares, which is also how js/resume.js produces one. */
        const ratio = window.TBResume.PHOTO_RATIO;
        const pc = document.createElement('canvas');
        pc.width = 400; pc.height = Math.round(400 / ratio);
        const pg = pc.getContext('2d');
        pg.fillStyle = '#8FB3D9'; pg.fillRect(0, 0, pc.width, pc.height);
        const photo = pc.toDataURL('image/jpeg', 0.8);

        /* The editor's own sample content, read from the live form rather
           than restated here: a second copy would let this check keep passing
           against content the editor no longer produces. */
        const fields = {};
        document.querySelectorAll('#resume-form [data-bind]').forEach((el) => {
            fields[el.getAttribute('data-bind')] = el.value;
        });
        const rows = (listId, keys) =>
            [...document.querySelectorAll('#' + listId + ' [data-entry]')].map((row) => {
                const out = {};
                keys.forEach((k) => {
                    const el = row.querySelector('[data-entry-field="' + k + '"]');
                    out[k] = el ? el.value : '';
                });
                return out;
            });

        const sample = {
            accent: '#1F4E79',
            fields: fields,
            experience: rows('experience-list', ['role', 'company', 'place', 'dates', 'description']),
            education: rows('education-list', ['degree', 'school', 'place', 'dates', 'score']),
            projects: rows('projects-list', ['name', 'role', 'dates', 'description']),
            /* refAddress and score were missing until September 15, 2026, and
               a key missing here is not a cosmetic omission: this block exists
               to read the editor's REAL sample, and every field it forgets
               makes the document shorter than the one a visitor actually has.
               The overflow check below is the one that suffers -- it was
               asserting that no column overruns, against content lighter than
               the form produces. Add a key here whenever the form gains one. */
            references: rows('references-list',
                ['name', 'title', 'company', 'email', 'phone', 'refAddress'])
        };
        const empty = { accent: '#1A1A1A', fields: {},
                        experience: [], education: [], projects: [], references: [] };

        const out = { sampleFieldCount: Object.keys(fields).length,
                      sampleExperience: sample.experience.length, templates: [] };

        window.TB_RESUME_TEMPLATES.forEach((tpl) => {
            const row = { id: tpl.id, title: tpl.title };
            const W = tpl.page.width;
            const H = tpl.page.height;

            const run = (label, state) => {
                try {
                    const ctx = window.TBResume.layout(tpl, state);
                    const ops = ctx.ops;

                    /* Colours. Every op in the display list carries a hex by
                       the time a painter sees it -- a role name reaching one
                       is the defect colorOf's indirection was added to fix,
                       and it paints as nothing rather than erroring. */
                    const unresolved = ops.filter((o) => {
                        if (o.op === 'image' || o.op === 'imageCircle') { return false; }
                        /* A stroke joined fill and color as a colour-bearing
                           key when the rect op learned a keyline on September
                           14, 2026. (No back-ticks in here: this whole block
                           is inside a template literal, and one closes it.) A
                           stroke-only rect -- the frame around a photograph --
                           carries its colour there and nowhere else, so a
                           check reading the other two saw an op with no colour
                           at all and reported it unresolved.

                           EVERY colour an op carries is tested now rather than
                           the first one found, and an op carrying none is
                           still a failure. That is stricter than what this
                           replaced, not a loosening to accommodate the new
                           op. */
                        const found = ['fill', 'color', 'stroke']
                            .map((k) => o[k]).filter(Boolean);
                        if (!found.length) { return true; }
                        return found.some((c) => !HEX.test(c));
                    }).length;

                    /* Geometry. Anchors and boxes inside the paper. Text ops
                       carry an ANCHOR rather than an extent, so this catches
                       gross misplacement -- a block positioned off the page
                       -- and not overflow by a few points, which is what the
                       overflow flags are for. */
                    let offPage = 0;
                    ops.forEach((o) => {
                        const pts = [];
                        if (o.op === 'text' || o.op === 'circle') {
                            pts.push([o.x === undefined ? o.cx : o.x,
                                      o.y === undefined ? o.cy : o.y]);
                        } else if (o.op === 'line') {
                            pts.push([o.x1, o.y1], [o.x2, o.y2]);
                        } else if (o.op === 'poly') {
                            (o.points || []).forEach((pt) => pts.push(pt));
                        } else {
                            pts.push([o.x, o.y], [o.x + o.w, o.y + o.h]);
                        }
                        /* Half a point of slack: the sidebar rail and the
                           bar's overlap land exactly on an edge by design. */
                        if (pts.some(([x, y]) =>
                                x < -0.5 || x > W + 0.5 || y < -0.5 || y > H + 0.5)) {
                            offPage += 1;
                        }
                    });

                    /* Nothing may be drawn OUTSIDE the column it belongs to.
                       This is a different question from the off-page check
                       above, which asks only whether an anchor is on the
                       paper: a line can sit well inside the page and still be
                       drawn across the gutter into the next column, which is
                       what a two-column sheet cannot survive.

                       It needs a real width rather than an anchor, which is
                       why it measures. Added September 15, 2026 after exactly
                       that defect shipped: layoutRuns composed a label and a
                       field onto one baseline and never wrapped, so the Peach
                       Portrait CV drew a referee's street address 13.9pt into
                       the main column, on top of whatever was already there.
                       Every anchor was on the page throughout, so the check
                       above saw nothing wrong.

                       The column is the one whose box the anchor sits in --
                       taken from ctx.cols, the engine's own boxes, rather than
                       inferred from the descriptor, because a sidebar can be
                       on either side and guessing gets grey-rail backwards. */
                    let outsideColumn = 0;
                    let worstOutside = 0;
                    const boxes = Object.keys(ctx.cols || {})
                        .map((k) => ctx.cols[k]);
                    if (boxes.length) {
                        ops.filter((o) => o.op === 'text').forEach((o) => {
                            const w = inkWidth(o);
                            const right = o.align === 'center' ? o.x + w / 2
                                        : o.align === 'right' ? o.x
                                        : o.x + w;
                            let box = null;
                            boxes.forEach((b) => {
                                if (o.x >= b.x - 1 && (!box || b.x > box.x)) { box = b; }
                            });
                            if (!box) { return; }
                            const past = right - (box.x + box.width);
                            if (past > 0.5) {
                                outsideColumn += 1;
                                if (past > worstOutside) { worstOutside = past; }
                            }
                        });
                    }

                    /* Photographs. The anti-stretch invariant, asserted
                       rather than trusted: the drawn box must be the ratio
                       js/resume.js crops every upload to, or a face is
                       stretched and neither painter can tell. */
                    /* imageCircle counts as an image. It was added on
                       September 15, 2026 for a circular portrait, and while
                       this read 'image' alone every photo invariant below
                       silently did not apply to the template that draws one --
                       including the anti-stretch rule, which is the whole
                       reason this block exists. */
                    const images = ops.filter((o) =>
                        o.op === 'image' || o.op === 'imageCircle');
                    const stretched = images.filter((o) =>
                        Math.abs((o.w / o.h) - ratio) > 0.001).length;

                    return { ok: true, ops: ops.length, pages: ctx.pages,
                             overflowMain: ctx.overflow.main,
                             overflowSidebar: ctx.overflow.sidebar,
                             unresolved: unresolved, offPage: offPage,
                             outsideColumn: outsideColumn,
                             worstOutside: Math.round(worstOutside * 10) / 10,
                             images: images.length, stretched: stretched };
                } catch (e) {
                    return { ok: false, error: String((e && e.message) || e) };
                }
            };

            row.sample = run('sample', sample);
            row.withPhoto = run('withPhoto', Object.assign({}, sample, { photo: photo }));
            row.empty = run('empty', empty);
            /* An empty document must not draw a photograph either, and the
               guard has to reject a hostile URI rather than hand it to a
               painter. */
            row.hostile = run('hostile', Object.assign({}, sample,
                { photo: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }));

            try {
                const doc = window.TBResume.buildPdf(tpl, Object.assign({}, sample, { photo: photo }));
                row.pdfBytes = doc.output('arraybuffer').byteLength;
                /* Text must still be TEXT. Embedding a bitmap must not turn a
                   page into one: see
                   docs/error-fixes/RESUME_PDF_RASTERIZED_TEXT_FIX.md.

                   THE DOUBLE BACKSLASH IS LOAD-BEARING. This whole block is a
                   JS template literal, and \\b inside one is the BACKSPACE
                   escape, not a word boundary -- written singly the regex
                   becomes /<backspace>Td<backspace>/ and matches nothing at
                   all. It counted 0 operators on all four templates the first
                   time this ran, which is only visible because the assertion
                   demands a positive count rather than merely a non-negative
                   one. */
                row.pdfTextOps = (doc.output().match(/\\bTd\\b/g) || []).length;
            } catch (e) {
                row.pdfError = String((e && e.message) || e);
            }
            out.templates.push(row);
        });
        return out;
    })()`);

    if (r.error) {
        check("resume.html loads the template engine and the registry", false, r.error);
        return;
    }

    /* The sample is read out of the live form, so a form that stopped
       producing content would make every assertion below vacuously true. */
    check(`the editor's sample content was read from the form ` +
          `(${r.sampleFieldCount} fields, ${r.sampleExperience} experience rows)`,
        r.sampleFieldCount > 5 && r.sampleExperience > 0,
        "the form produced no sample content, so every template below would " +
        "have been checked against an empty document");

    check(`js/resume-templates.js registers templates (${r.templates.length})`,
        r.templates.length > 0, "no templates to render");

    r.templates.forEach((t) => {
        const states = [["sample content", t.sample], ["a photograph", t.withPhoto],
                        ["an empty document", t.empty], ["a hostile photo value", t.hostile]];

        states.forEach(([label, s]) => {
            check(`${t.id}: lays out with ${label}`, s.ok, s.error || "");
        });
        if (!states.every(([, s]) => s.ok)) { return; }

        check(`${t.id}: draws a document rather than a blank page`,
            t.sample.ops > 20, `only ${t.sample.ops} drawing operations`);

        /* Both columns. The sidebar is the one that matters -- it never
           paginates, so content past its boundary is simply lost off the
           foot of the sheet with nothing said. */
        check(`${t.id}: no column overflows its own boundary`,
            !t.sample.overflowMain && !t.sample.overflowSidebar &&
            !t.withPhoto.overflowMain && !t.withPhoto.overflowSidebar,
            `sample main=${t.sample.overflowMain} sidebar=${t.sample.overflowSidebar}, ` +
            `withPhoto main=${t.withPhoto.overflowMain} sidebar=${t.withPhoto.overflowSidebar}`);

        check(`${t.id}: every colour resolved to a hex`,
            states.every(([, s]) => s.unresolved === 0),
            states.map(([l, s]) => `${l}: ${s.unresolved}`).join(", "));

        check(`${t.id}: nothing is drawn off the page`,
            states.every(([, s]) => s.offPage === 0),
            states.map(([l, s]) => `${l}: ${s.offPage}`).join(", "));

        check(`${t.id}: no text is drawn outside its own column`,
            states.every(([, s]) => s.outsideColumn === 0),
            states.map(([l, s]) =>
                `${l}: ${s.outsideColumn} line(s), worst ${s.worstOutside}pt past the edge`
            ).join(", ") +
            " -- on a two-column sheet this is text drawn across the gutter " +
            "over the other column");

        check(`${t.id}: no photograph is drawn at the wrong aspect`,
            states.every(([, s]) => s.stretched === 0),
            states.map(([l, s]) => `${l}: ${s.stretched} of ${s.images}`).join(", "));

        /* A photo template draws one WITH a photograph and none without --
           and none from a value the guard should have rejected. */
        check(`${t.id}: draws a photograph only when there is a real one`,
            t.sample.images === 0 && t.empty.images === 0 && t.hostile.images === 0,
            `sample=${t.sample.images} empty=${t.empty.images} hostile=${t.hostile.images}, ` +
            "each should be 0 -- a photograph drawn from no photo, or from a " +
            "rejected data URI, means the guard did not hold");

        check(`${t.id}: exports a PDF whose text is still text`,
            t.pdfBytes > 0 && t.pdfTextOps > 20,
            t.pdfError || `${t.pdfBytes} bytes, ${t.pdfTextOps} text-positioning operators`);
    });
}

/* ==========================================================================
   9b. An overrun side column is SAID, not merely measured.

   Section 9 asserts that no template overruns its own side column with the
   editor's sample in it. That is the right check for the DESIGNS, and it says
   nothing about the visitor, who can put a fourth referee in a column that
   held three.

   The side column does not paginate, deliberately. So when it overruns, the
   lines past the foot are not drawn -- not in the preview, not in the
   exported PDF. The engine has always measured exactly this and set
   ctx.overflow.sidebar. Until September 15, 2026 nothing read it: a referee
   typed into the Peach Portrait CV vanished with no message anywhere, and
   both the preview and the download were quietly short.

   That is why this is its own section rather than another assertion inside 9.
   Section 9 runs layout() in a detached div and reads the return value; this
   one has to drive the real form and look at the real page, because the
   defect was never in the measurement -- it was in the wiring between the
   measurement and the screen, which only the live editor has.

   THE NON-VACUITY GUARD IS THE POINT. Every per-template assertion below is
   conditional on having actually pushed that template past its boundary, so
   without the global check that at least one was, a change that made overflow
   unreachable would turn this whole section into a silence that reads as a
   pass.
   ========================================================================== */
async function sidebarOverflowNoticeChecks(page) {
    section("9b. The editor reports an overrun side column");

    await page.navigate(`http://localhost:${PORT}/resume.html`, 1440);

    const r = await page.evaluate(`(async () => {
        const settle = () => new Promise(r => setTimeout(r, 260));
        for (let i = 0; i < 100; i += 1) {
            if (window.jspdf && window.jspdf.jsPDF) { break; }
            await new Promise(r => setTimeout(r, 100));
        }
        if (!window.jspdf || !window.jspdf.jsPDF) { return { error: 'jsPDF never loaded' }; }
        if (!window.TBResume || !window.TB_RESUME_TEMPLATES) { return { error: 'the engine or the registry did not load' }; }

        const notes = () => document.querySelectorAll('.sheet-warning').length;
        const refRows = () => [...document.querySelectorAll('#references-list [data-entry]')];
        const add = document.getElementById('add-reference');
        if (!add) { return { error: 'the references list has no Add control' }; }

        /* The state the EDITOR persisted, not one assembled here, so the
           overflow this asks the engine about is the overflow the visitor's
           own sheet has. */
        const state = () => JSON.parse(localStorage.getItem('tb_resume_v1') || 'null');
        const overflows = (tpl) => {
            const st = state();
            return Boolean(st && window.TBResume.layout(tpl, st).overflow.sidebar);
        };

        const rows = [];
        const sidebars = window.TB_RESUME_TEMPLATES.filter(
            (t) => t.layout && t.layout.sidebar);

        for (const tpl of sidebars) {
            const pick = document.querySelector('.template-pick[data-template="' + tpl.id + '"]');
            if (!pick) { continue; }
            pick.click();
            await settle();

            const row = { id: tpl.id, noteAtSample: notes(), added: 0 };
            row.sampleOverflows = overflows(tpl);

            /* Add referees one at a time until the ENGINE says the column has
               overrun, then look at the page. Capped, so a template with a
               deep side column ends the loop rather than the suite.

               WHOLE referees, not bare names, and the cap has margin. Filling
               only the name took 7 of 8 additions to overrun Peach Portrait,
               which is one short entry away from never reaching the boundary
               at all -- and every assertion under this loop is conditional on
               reaching it, so a cap that is nearly tight is a section that
               nearly stops testing anything. A referee with every field set is
               also what the template actually draws: it emits a line per
               populated field and drops the pairs that are empty. */
            let over = row.sampleOverflows;
            while (!over && row.added < 12) {
                add.click();
                const list = refRows();
                const last = list.length ? list[list.length - 1] : null;
                if (!last) { break; }
                const filled = [['name', 'Overflow Probe Referee'],
                                ['title', 'Principal Records Officer'],
                                ['company', 'Probe Manpower Services'],
                                ['refAddress', '14 Probe Street, Malolos, Bulacan'],
                                ['email', 'probe@example.com'],
                                ['phone', '(044) 791 2233']]
                    .filter(([k, v]) => {
                        const el = last.querySelector('[data-entry-field="' + k + '"]');
                        if (!el) { return false; }
                        el.value = v;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        return true;
                    }).length;
                if (!filled) { break; }
                row.added += 1;
                await settle();
                over = overflows(tpl);
            }
            row.engineSaysOverflow = over;
            row.noteWhenOver = notes();
            row.noteText = (document.querySelector('.sheet-warning') || {}).textContent || '';

            /* Take it back off again. A notice that does not clear is its own
               defect: the visitor shortens the column, the warning stays, and
               they are told they are losing lines that are on the page. */
            for (let i = 0; i < row.added; i += 1) {
                const list = refRows();
                if (!list.length) { break; }
                const btn = list[list.length - 1].querySelector('.entry-remove');
                if (!btn) { break; }
                btn.click();
            }
            await settle();
            row.noteAfterUndo = notes();
            row.refsAfterUndo = refRows().length;
            rows.push(row);
        }
        return { rows: rows, sidebars: sidebars.length,
                 templates: window.TB_RESUME_TEMPLATES.length };
    })()`);

    if (r.error) {
        check("resume.html loads the engine for the overrun check", false, r.error);
        return;
    }

    check(`a two-column template is registered to exercise ` +
          `(${r.sidebars} of ${r.templates})`,
        r.sidebars > 0,
        "no template declares a side column, so nothing below was exercised");

    check("at least one side column was actually driven past its boundary",
        r.rows.some((t) => t.engineSaysOverflow),
        "no template could be overrun in 8 referees, so every per-template " +
        "assertion below is vacuous -- either the columns grew or the form " +
        "stopped feeding them");

    r.rows.forEach((t) => {
        check(`${t.id}: the sample sheet carries no overrun notice`,
            t.noteAtSample === 0 && !t.sampleOverflows,
            `notice=${t.noteAtSample}, engine overflow=${t.sampleOverflows} -- ` +
            "a notice on the untouched sample means either the sample no " +
            "longer fits or the notice is stuck on");

        if (!t.engineSaysOverflow) { return; }

        check(`${t.id}: an overrun side column says so (${t.added} referees added)`,
            t.noteWhenOver === 1,
            `${t.noteWhenOver} notices while ctx.overflow.sidebar was true -- ` +
            "the engine measured the overrun and the editor drew nothing, " +
            "which is the silent-loss defect this section closes");

        check(`${t.id}: the notice tells the visitor which column`,
            /side column/i.test(t.noteText),
            `the notice read: ${t.noteText}`);

        check(`${t.id}: the notice clears once the column fits again`,
            t.noteAfterUndo === 0,
            `${t.noteAfterUndo} notices left with ${t.refsAfterUndo} referees, ` +
            "so a visitor who fixed the overrun is still being warned about it");
    });
}

/* ==========================================================================
   10. Poster editor: what it actually exports.

   Sections 5, 5b and 5c check the mockup editor's controls and section 7
   checks that a typed name reaches a filename. Nothing opened a poster
   export and looked inside it.

   THIS EDITOR HAS ALREADY LOST AN EXPORT SILENTLY. poster.html declared a
   wrong SRI hash for jsPDF, so every browser blocked the script and PDF
   export had been dead since commit cc7acff -- found while verifying an
   unrelated resume template, not by a check (see
   docs/implementation/FOURTH_RESUME_DESIGN_GREY_RAIL.md). Five formats
   times one silent failure each is the surface this closes.

   IT EXPORTS WITH CONTENT ON THE POSTER, and that is the point rather than
   a detail. An empty poster's SVG is a legitimate 284 bytes -- two rects and
   no image -- so a regression that dropped the artwork out of every export
   would pass against the default document while producing valid, empty
   files. A photograph and a caption go on first, and each format is then
   asked to prove it carried them.
   ========================================================================== */
async function posterExportChecks(page) {
    section("10. Poster editor: every format exports something real");

    await page.navigate(`http://localhost:${PORT}/poster.html`, 1440);

    const r = await page.evaluate(`(async () => {
        for (let i = 0; i < 100; i += 1) {
            if (window.jspdf && window.jspdf.jsPDF) { break; }
            await new Promise(r => setTimeout(r, 100));
        }
        if (!window.jspdf || !window.jspdf.jsPDF) { return { error: 'jsPDF never loaded' }; }

        const MARKER = 'VERIFYMARKER';

        /* Content first. A saturated fill and a caption, so every format can
           be asked whether it carried them rather than merely whether it
           produced bytes. */
        const pc = document.createElement('canvas');
        pc.width = 1200; pc.height = 1600;
        const pg = pc.getContext('2d');
        pg.fillStyle = '#00A0FF'; pg.fillRect(0, 0, 1200, 1600);
        const blob = await new Promise(r => pc.toBlob(r, 'image/png'));
        const dt = new DataTransfer();
        dt.items.add(new File([blob], 'p.png', { type: 'image/png' }));
        const fi = document.getElementById('p-image');
        if (!fi) { return { error: 'no photo input on poster.html' }; }
        fi.files = dt.files;
        fi.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 1500));

        const cap = document.getElementById('t-caption');
        if (cap) {
            cap.value = MARKER;
            cap.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise(r => setTimeout(r, 700));
        }

        /* Capture instead of downloading. PNG, JPG, SVG and PPTX all reach
           the disk through createObjectURL and an anchor; the PDF goes
           through jsPDF's own save(). Both are intercepted, and the anchor's
           click is swallowed so the run writes no files. */
        const out = { marker: MARKER, caption: Boolean(cap) };
        const realCreate = URL.createObjectURL;
        let pending = null;
        URL.createObjectURL = function (b) { pending = b; return realCreate.call(URL, b); };
        const realClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () {};
        const RealPDF = window.jspdf.jsPDF;
        const wrap = function (...a) {
            const inst = new RealPDF(...a);
            inst.save = () => {
                const text = inst.output();
                out.pdf = { bytes: inst.output('arraybuffer').byteLength,
                            head: text.slice(0, 5),
                            image: /\\/Subtype\\s*\\/Image/.test(text) };
                return inst;
            };
            return inst;
        };
        wrap.prototype = RealPDF.prototype;
        window.jspdf.jsPDF = wrap;

        const magic = async (b, n) => {
            const buf = new Uint8Array(await b.slice(0, n).arrayBuffer());
            return [...buf].map((x) => x.toString(16).padStart(2, '0')).join(' ');
        };

        const type = document.getElementById('dl-type');
        const go = document.getElementById('dl-go');
        if (!type || !go) {
            URL.createObjectURL = realCreate;
            HTMLAnchorElement.prototype.click = realClick;
            window.jspdf.jsPDF = RealPDF;
            return { error: 'no download controls on poster.html' };
        }

        for (const fmt of ['png', 'jpg', 'svg', 'pptx']) {
            pending = null;
            type.value = fmt;
            type.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise(r => setTimeout(r, 250));
            go.click();
            await new Promise(r => setTimeout(r, 3000));
            if (!pending) { out[fmt] = { missing: true }; continue; }
            out[fmt] = { mime: pending.type, size: pending.size, magic: await magic(pending, 4) };
            if (fmt === 'svg') {
                const text = await pending.text();
                out.svg.hasImage = /<image/.test(text);
                out.svg.hasText = /<text/.test(text);
                out.svg.hasDataUri = /href="data:image\\//.test(text);
                out.svg.carriesCaption = text.indexOf(MARKER) !== -1;
            }
        }

        type.value = 'pdf';
        type.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 250));
        go.click();
        await new Promise(r => setTimeout(r, 3500));

        URL.createObjectURL = realCreate;
        HTMLAnchorElement.prototype.click = realClick;
        window.jspdf.jsPDF = RealPDF;
        return out;
    })()`);

    if (r.error) {
        check("poster.html offers a photo input and download controls", false, r.error);
        return;
    }

    /* Magic bytes, not the MIME the page claimed: a Blob's type is whatever
       the code that built it said, so asserting it proves only that the
       label agrees with itself. The first bytes are the file. */
    const FORMATS = [
        ["PNG", "png", "image/png", "89 50 4e 47", 20000],
        ["JPG", "jpg", "image/jpeg", "ff d8 ff", 15000],
        ["SVG", "svg", "image/svg+xml", "3c 73 76 67", 2000],
        ["PPTX", "pptx", null, "50 4b 03 04", 15000]
    ];

    FORMATS.forEach(([label, key, mime, head, floor]) => {
        const f = r[key] || {};
        check(`poster ${label}: the download happened`, !f.missing && f.size > 0,
            f.missing ? "no blob reached the download path" : JSON.stringify(f));
        if (f.missing || !f.size) { return; }

        check(`poster ${label}: the bytes are really a ${label}`,
            String(f.magic || "").indexOf(head) === 0,
            `first bytes ${f.magic}, expected to start ${head}`);

        if (mime) {
            check(`poster ${label}: the blob is labelled ${mime}`, f.mime === mime,
                `labelled ${f.mime}`);
        }

        /* The empty-file failure. A format that silently stopped carrying the
           artwork still produces a valid, tiny file -- an empty poster's SVG
           is a legitimate 284 bytes -- so size is the assertion that a
           magic-byte check alone would miss. */
        check(`poster ${label}: carries the artwork rather than an empty page`,
            f.size > floor, `${f.size} bytes, under the ${floor} floor`);
    });

    /* The SVG is the only format whose content can be read as text, so it is
       the only one that can be asked exactly what it carried. */
    const svg = r.svg || {};
    check("poster SVG: embeds the photograph as an image",
        Boolean(svg.hasImage && svg.hasDataUri),
        `hasImage=${svg.hasImage} hasDataUri=${svg.hasDataUri}`);
    if (r.caption) {
        check("poster SVG: the caption is real text, not pixels",
            Boolean(svg.hasText && svg.carriesCaption),
            `hasText=${svg.hasText} carriesCaption=${svg.carriesCaption}`);
    }

    const pdf = r.pdf || {};
    check("poster PDF: save() ran and produced a PDF",
        pdf.head === "%PDF-", pdf.head ? `starts "${pdf.head}"` : "save() was never called");
    check("poster PDF: carries the artwork rather than an empty page",
        pdf.bytes > 20000 && pdf.image === true,
        `${pdf.bytes} bytes, image XObject=${pdf.image}`);

    /* ----------------------------------------------------------------------
       The card LAYOUT, which everything above misses.

       The block above exports the style the editor opens with. That leaves
       the Queen and King of Hearts style -- added September 9, 2026 -- with
       no coverage at all, and it is the style that needs it most: it is the
       first `frame` value that is a whole page layout rather than a border,
       so paint() branches before it reads frame or trim, and it draws things
       nothing else on this page draws. A heart from a Path2D, and rank
       glyphs set in a substituted display face.

       It also carries the exact hazard this section exists for. The heart is
       ONE path string feeding two renderers -- Path2D parses it for the
       canvas, the SVG export emits it verbatim under a transform -- and the
       whole point of writing it once is that an edit cannot land in one and
       silently miss the other. Nothing checked that it had not.
       ---------------------------------------------------------------------- */
    const card = await page.evaluate(`(async () => {
        const frame = document.getElementById('p-frame');
        if (!frame) { return { error: 'no frame control on poster.html' }; }
        if (![...frame.options].some(o => o.value === 'hearts')) {
            return { skip: 'this build has no hearts style' };
        }
        frame.value = 'hearts';
        frame.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 600));

        const out = { ranks: {} };
        /* The two corner ranks are the style's own controls and are chosen
           independently, so both are set away from their defaults: a glyph
           found in the export then proves the CONTROL reached it, not just
           that some default was drawn. */
        const head = document.getElementById('p-rank-head');
        const foot = document.getElementById('p-rank-foot');
        if (head && foot) {
            head.value = 'A'; head.dispatchEvent(new Event('change', { bubbles: true }));
            foot.value = 'J'; foot.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise(r => setTimeout(r, 600));
            out.ranks = { head: head.value, foot: foot.value };
        }

        const realCreate = URL.createObjectURL;
        let pending = null;
        URL.createObjectURL = function (b) { pending = b; return realCreate.call(URL, b); };
        const realClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () {};
        const RealPDF = window.jspdf.jsPDF;
        const wrap = function (...a) {
            const inst = new RealPDF(...a);
            inst.save = () => {
                const text = inst.output();
                out.pdf = { bytes: inst.output('arraybuffer').byteLength,
                            head: text.slice(0, 5),
                            image: /\\/Subtype\\s*\\/Image/.test(text) };
                return inst;
            };
            return inst;
        };
        wrap.prototype = RealPDF.prototype;
        window.jspdf.jsPDF = wrap;

        const type = document.getElementById('dl-type');
        const go = document.getElementById('dl-go');
        const grab = async (fmt) => {
            pending = null;
            type.value = fmt;
            type.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise(r => setTimeout(r, 250));
            go.click();
            await new Promise(r => setTimeout(r, 3000));
            return pending;
        };

        for (const fmt of ['png', 'jpg', 'pptx']) {
            const b = await grab(fmt);
            out[fmt] = b ? b.size : 0;
        }
        const svgBlob = await grab('svg');
        const svg = svgBlob ? await svgBlob.text() : '';
        out.svgBytes = svg.length;
        /* The opening coordinates of HEART_PATH in js/poster.js. Matching the
           path itself rather than a count of <path> elements: a frame border
           is paths too, so only the heart's own geometry proves the heart. */
        out.svgHeart = svg.indexOf('M0.5,0.1611') !== -1;
        out.svgRankHead = />\\s*A\\s*</.test(svg);
        out.svgRankFoot = />\\s*J\\s*</.test(svg);
        await grab('pdf');

        URL.createObjectURL = realCreate;
        HTMLAnchorElement.prototype.click = realClick;
        window.jspdf.jsPDF = RealPDF;
        return out;
    })()`);

    if (card.skip) {
        console.log("      SKIP  " + card.skip);
    } else if (card.error) {
        check("poster: the card layout can be selected", false, card.error);
    } else {
        check("poster card: both rank controls took the values set",
            card.ranks.head === "A" && card.ranks.foot === "J",
            JSON.stringify(card.ranks));

        /* Raster and PPTX carry the card as pixels, so the only honest
           question for them is whether a real file came out. The floors are
           the same ones the default style is held to. */
        check("poster card: PNG, JPG and PPTX all export a real file",
            card.png > 20000 && card.jpg > 15000 && card.pptx > 15000,
            `png=${card.png} jpg=${card.jpg} pptx=${card.pptx}`);

        check("poster card: PDF carries the artwork",
            card.pdf && card.pdf.head === "%PDF-" && card.pdf.bytes > 20000 &&
            card.pdf.image === true,
            JSON.stringify(card.pdf));

        /* The one that would have caught a divergence between Path2D and the
           SVG emitter: the heart's own geometry, in the exported file. */
        check("poster card: the SVG export draws the heart, not just the photo",
            card.svgHeart === true,
            `${card.svgBytes} bytes and no HEART_PATH geometry in them`);

        check("poster card: the SVG export carries both chosen rank glyphs",
            card.svgHeart && card.svgRankHead && card.svgRankFoot,
            `head A present=${card.svgRankHead}, foot J present=${card.svgRankFoot}`);
    }

    /* LEAVE THE ORIGIN AS WE FOUND IT, and this is not housekeeping either
       -- the same hazard section 7 documents, one step further on.

       Everything above persists real editor state to localStorage on
       the editors' own origin, and js/app.js builds the homepage's CONTINUE STRIP out of
       exactly those keys. Section 4 then measures index.html on this origin
       against a pristine baseline served on another port, which has no such
       state and so renders no strip. Left behind, this section makes the
       final parity comparison measure a homepage that carries a strip against
       one that does not, and reports it as a layout regression in site/ that
       nobody introduced.

       Cleared here rather than at the top of section 4, because the section
       that made the mess is the one that has to know about it. */
    await page.evaluate("localStorage.clear(), sessionStorage.clear(), true");
}

/* ==========================================================================
   11. Mockup editor: every template renders its product, and the design
       lands on it.

   Sections 5, 5b and 5c drive ONE template -- whichever the editor opens
   with -- and check the background picker, the export panel and the saved
   tab. Eighteen templates ship. Seventeen of them were never rendered by
   this suite at all, and a template whose assets 404 or whose zone prints
   nothing is a dead catalog card that fails silently: the page loads, the
   controls work, and the product simply never appears.

   HOW A TEMPLATE IS SELECTED. The picker was removed, so a product is
   reachable only through the catalog card hand-off -- js/app.js writes
   tb_editor_preset and js/mockup.js reads it with TB.takePreset() on load.
   That is why this reloads the page per template rather than clicking
   through a menu: there is no menu.

   ONE ASSERTION, AND THE TWO THAT WERE CUT. Ink is a saturated magenta that
   appears in no product photograph, so every magenta pixel on the canvas came
   from the design. Three assertions were written; only one survived being
   broken on purpose, and the other two are recorded here rather than left in,
   because a check that cannot fail is worse than no check -- it reads as
   cover.

   KEPT: a design placed on the template actually prints. Proven twice -- a
   404 on one template's base photograph, and a 404 on every asset of another
   -- and it is the assertion that catches a dead catalog card, where the page
   loads, the controls work, the layer is listed and the product is simply
   blank.

   CUT: "the product photograph renders", asserted as a floor on opaque
   pixels. A template whose assets ALL 404 does not render an empty canvas --
   it falls back to a 1000x1000 canvas that measures 100% opaque, which sails
   past any floor. The assertion could not fail.

   CUT: "no artwork lands on the transparent surround". The design is masked
   to the product, so it cannot paint on transparency at all: moving a
   garment's whole print zone to an 8,8..200,200 corner of the canvas, well
   clear of the shirt, still measured zero. The assertion could not fail
   either.

   That second one is worth keeping in mind before writing it again. Artwork
   landing where it should not IS a real fault class here -- both faults in
   docs/error-fixes/MOCKUP_PRINT_ZONES_OVERHANGING_THEIR_SURFACE.md are of it
   -- but neither lands on TRANSPARENCY. The frame's bled onto a black border
   and the banner's onto its own stand, both opaque scenery. Reintroducing the
   banner fault (warpZone bottom back to 1347 from 1345) was tested against
   this section and is not caught. Detecting that class needs the per-template
   mask audit that document describes, and its own conclusion still stands:
   "there is no cheap way for it to: the answer depends on the photograph."

   ========================================================================== */
async function mockupTemplateChecks(page) {
    section("11. Mockup editor: every template renders its product");

    await page.navigate(`http://localhost:${PORT}/mockup.html`, 1440);
    const ids = await page.evaluate(
        "(window.TB_PHOTO_MOCKUPS || []).map(t => t.id)");

    check(`js/mockup-templates.js registers photographic templates (${ids.length})`,
        Array.isArray(ids) && ids.length > 0,
        "no templates to render, so every assertion below would be vacuous");
    if (!Array.isArray(ids) || !ids.length) { return; }

    for (const id of ids) {
        /* The preset is consumed by takePreset() on load, so it is written
           immediately before the navigation that reads it. */
        await page.evaluate(
            `(localStorage.clear(),
              localStorage.setItem('tb_editor_preset', ${JSON.stringify(JSON.stringify(id))}), true)`);
        await page.navigate(`http://localhost:${PORT}/mockup.html`, 1440);

        const r = await page.evaluate(`(async () => {
            const c = document.getElementById('mockup-canvas');
            if (!c) { return { error: 'no canvas' }; }
            const g = c.getContext('2d');
            const opaqueCount = () => {
                const d = g.getImageData(0, 0, c.width, c.height).data;
                let n = 0;
                for (let i = 3; i < d.length; i += 4) { if (d[i] > 8) { n += 1; } }
                return n;
            };

            /* Assets load asynchronously and some products are megabytes, so
               settle on a stable opaque-pixel count rather than a fixed wait. */
            let last = -1, stable = 0, waited = 0;
            while (stable < 3 && waited < 20000) {
                await new Promise(r => setTimeout(r, 250));
                waited += 250;
                const n = opaqueCount();
                if (n === last && n > 0) { stable += 1; } else { stable = 0; }
                last = n;
            }

            const snap = () => new Uint8ClampedArray(g.getImageData(0, 0, c.width, c.height).data);
            const before = snap();

            const dc = document.createElement('canvas');
            dc.width = 2000; dc.height = 2000;
            const dg = dc.getContext('2d');
            dg.fillStyle = '#FF00AA';
            dg.fillRect(0, 0, 2000, 2000);
            const blob = await new Promise(r => dc.toBlob(r, 'image/png'));
            const dt = new DataTransfer();
            dt.items.add(new File([blob], 'fill.png', { type: 'image/png' }));
            const input = document.getElementById('m-design');
            if (!input) { return { error: 'no design input' }; }
            input.files = dt.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise(r => setTimeout(r, 3000));

            const after = snap();
            let onProduct = 0;
            for (let i = 0; i < after.length; i += 4) {
                if (after[i + 3] <= 8 || before[i + 3] === 0) { continue; }
                if (after[i] > 120 && after[i + 1] < 110 && after[i + 2] > 80) { onProduct += 1; }
            }
            return { w: c.width, h: c.height, settledMs: waited,
                     baseOpaque: last, onProduct: onProduct,
                     error: document.getElementById('m-design-error').textContent || '' };
        })()`);

        if (r.error) {
            check(`mockup ${id}: renders`, false, r.error);
            continue;
        }

        /* The one assertion that was proven able to fail. A zone that prints
           nothing, a base photograph that 404s, a render that threw: all of
           them are silent -- the page loads, the controls work, the layer is
           listed, and the product is blank -- and all of them land here. */
        check(`mockup ${id}: a design placed on it actually prints`,
            r.onProduct > 2000,
            `${r.onProduct} pixels of a saturated fill reached the product, ` +
            `on a ${r.w}x${r.h} canvas carrying ${r.baseOpaque} opaque pixels`);
    }

    /* The loop clears storage BEFORE each template, so the last one's mockup
       state would otherwise be left on the origin. See the note at the foot
       of section 10: js/app.js builds the homepage continue strip from these
       keys, and section 4 measures that homepage. */
    await page.evaluate("localStorage.clear(), sessionStorage.clear(), true");
}

/* ==========================================================================
   Section 12. The ruled invoice.

   Every other editor section here checks the machinery AROUND a document --
   which ad band mounted, where the header's edge landed, whether a download
   was named from the right field. This one checks the document: that the
   right layout opened, that the numbers on it are the numbers the inputs
   imply, and that a logo the visitor supplied survives into the export.

   The arithmetic assertions state the EXPECTED figure rather than merely
   that a number appeared. A totals bug produces a perfectly well-formed
   currency string, so "the box is not empty" is an assertion that cannot
   fail on the fault it exists to catch.
   ========================================================================== */

/* Captures the PDF the Download button produces, as a binary string, without
   writing a file. jsPDF 2.5.1 puts save() on the INSTANCE, not the
   prototype, so the constructor is what has to be wrapped -- js/docs.js
   reads window.jspdf.jsPDF at click time, which is what makes the swap
   land. */
const GRAB_PDF = `
    const grabPdf = () => {
        const Orig = window.jspdf.jsPDF;
        let uri = null;
        function Patched() {
            const d = new Orig(...arguments);
            d.save = function () { uri = d.output('datauristring'); return d; };
            return d;
        }
        Patched.prototype = Orig.prototype;
        window.jspdf.jsPDF = Patched;
        document.getElementById('download-pdf').click();
        window.jspdf.jsPDF = Orig;
        return uri ? atob(uri.split(',')[1]) : '';
    };
    const countIn = (hay, re) => (hay.match(re) || []).length;
    const setField = (id, value) => {
        const el = document.getElementById(id);
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const waitForPdfEngine = async () => {
        for (let i = 0; i < 100; i += 1) {
            if (window.jspdf && window.jspdf.jsPDF) { return true; }
            await new Promise(r => setTimeout(r, 100));
        }
        return false;
    };
`;

async function anniversaryCalendarChecks(page) {
    section("13. Calendar posters: the calendar is a calculation");

    /* All three calendar posters, through the same checks. They share
       annivMonth() and annivCell() -- one set of arithmetic, deliberately,
       because a second copy of a calendar is a second calendar to be wrong --
       so what is worth proving is that every one of these LAYOUTS puts the
       answer in the right square.

       The scan window differs because the calendars sit in different parts of
       their pages: the anniversary poster's is under its collage, the other
       two are above theirs. Everything else here calibrates itself off the
       drawing.

       `rows` is how many rows of the grid the window reaches, and it exists
       because of the tribute. That poster's window is bounded on BOTH sides by
       drawing rather than by margin: its first photo box's red fill begins at
       228.96pt of an 841.89pt page, and a six-row month's last row of dates
       sits at 238.59. There is no window that holds row 5 and excludes a red
       box, so this one stops at 227.3pt -- 2.5pt below the lowest ink of a row
       4 marker and 1.7pt above the highest ink of a box.

       That is safe for the ARTWORK, and for a reason worth writing down: row 5
       only ever exists when a month's first weekday and length push the last
       day past index 34, which puts that day in column 0 or column 1 and
       nowhere else -- the far left of the page, where no photo box reaches.
       The poster is right; it is only the pixel scan that cannot see down
       there.

       It is NOT automatically safe for a future CASE. A marker half inside the
       window yields a clipped centroid, and a clipped centroid can still round
       to the right row -- passing for the wrong reason, which is worse than
       failing. So the expectation is compared against `rows` first and the
       check fails loudly instead. */
    /* `ruleTop`/`ruleBottom` narrow the search for the RULE alone, and only
       the love story calendar needs them. The other three rely on no shape in
       their band being wider than their own rule; that poster draws a white
       cradle under the final row which is 239pt across against a 208pt rule,
       so the longest run in its band is the cradle whenever a short month
       brings the cradle up into the window. Bounding the rule's own search to
       the dozen points it lives in is the honest fix: the alternative is a
       marker window too shallow to reach row 4, which two of the six cases
       need. */
    const LAYOUTS = [
        { preset: "anniversary", label: "anniversary", top: 0.62, bottom: 0.99 },
        { preset: "birthday", label: "birthday", top: 0.10, bottom: 0.42 },
        { preset: "tribute", label: "tribute", top: 0.09, bottom: 0.270, rows: 5 },
        { preset: "love", label: "love", top: 0.09, bottom: 0.265, rows: 5,
          ruleTop: 0.105, ruleBottom: 0.119 }
    ];

    for (const L of LAYOUTS) {
        await oneCalendarPoster(page, L);
    }
}

async function oneCalendarPoster(page, L) {

    /* The supplied artwork labelled its grid NOVEMBER 2025 and drew the 1st
       under M in five rows. 1 November 2025 was a SATURDAY and the month needs
       six. Every date position in that source is hand-set to fit a month that
       does not exist, which is why this layout computes the grid instead of
       copying it -- and why the arithmetic is the part most worth a check.

       What is asserted is WHERE THE MARKED DAY LANDS: its column and its row.
       Both follow from the month's first weekday and its length, so a marker
       in the right cell across these months is the calculation being right.
       A day the month does not have must mark nothing at all.

       The expectations are derived HERE, in Node, from the same calendar every
       other program uses. They are deliberately not a second copy of the
       page's formula: a check that reimplements the code it is checking agrees
       with it even when both are wrong.

       Measured from the DRAWING, and self-calibrating. An earlier version of
       this check counted rows of ink instead, and could not be made to work:
       the marker's heart overhangs its row by about a point, enough to fuse it
       to the row below, and masking the heart out instead fragments a lone
       marked "1" into three slivers. Day 1 is always in row 0 and day 8 always
       in row 1, whatever the month, so the poster hands over its own row pitch
       without being asked where it drew anything. */
    const CASES = [
        { y: 2025, m: 10, day: 29, note: "opens Saturday, 30 days, six rows" },
        { y: 2026, m: 1, day: 14, note: "February opening Sunday, four rows" },
        { y: 2026, m: 7, day: 1, note: "31 days opening Saturday, six rows" },
        { y: 2024, m: 1, day: 29, note: "leap February" },
        { y: 2027, m: 1, day: 29, note: "a 29th in a NON-leap February" },
        { y: 2026, m: 8, day: 31, note: "a 31st in a 30-day month" }
    ];

    const expected = CASES.map((c) => {
        const first = new Date(Date.UTC(c.y, c.m, 1)).getUTCDay();
        const length = new Date(Date.UTC(c.y, c.m + 1, 0)).getUTCDate();
        const valid = c.day >= 1 && c.day <= length;
        const index = first + c.day - 1;
        return valid ? { col: index % 7, row: Math.floor(index / 7) } : null;
    });

    await page.evaluate("(localStorage.clear(), localStorage.setItem(" +
        "'tb_editor_preset', " + JSON.stringify(JSON.stringify(L.preset)) + "), true)");
    await page.navigate(`http://localhost:${PORT}/poster.html`, 1440);

    const got = await page.evaluate(`(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        await wait(400);

        /* Wait for the poster to have been PAINTED rather than for a fixed
           number of milliseconds. A flat 400ms is enough once the browser has
           loaded this page a few times and is not enough on a cold first load,
           which made this section pass or fail depending on what ran before it
           -- the anniversary poster, which happens to be first in the table,
           reported "no marker during calibration" when the section was run on
           its own and passed in a full suite. An order-dependent check is not
           a check. */
        const ready = async () => {
            const c = document.getElementById('poster-canvas');
            if (!c || !c.width) { return false; }
            const g = c.getContext('2d');
            const px = g.getImageData(0, 0, c.width, Math.min(c.height, 40)).data;
            for (let i = 0; i < px.length; i += 4) {
                if (px[i + 3] > 0 && (px[i] || px[i + 1] || px[i + 2])) { return true; }
            }
            return false;
        };
        for (let tries = 0; tries < 40 && !await ready(); tries += 1) {
            await wait(100);
        }

        const set = async (id, v) => {
            const el = document.getElementById(id);
            if (!el) { return false; }
            el.value = String(v);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            await wait(60);
            return true;
        };
        const canvas = document.getElementById('poster-canvas');
        if (!canvas) { return { error: 'no canvas' }; }
        const ctx = canvas.getContext('2d');

        /* The marker's centroid, and the horizontal extent of the rule that
           the columns are measured against. Both come out of the pixels. */
        const readMarker = () => {
            const W = canvas.width, H = canvas.height;
            const d = ctx.getImageData(0, 0, W, H).data;
            const bg = [d[0], d[1], d[2]];
            const top = Math.round(H * ${L.top}), bottom = Math.round(H * ${L.bottom});
            const ruleTop = Math.round(H * ${L.ruleTop === undefined ? L.top : L.ruleTop});
            const ruleBottom = Math.round(H * ${L.ruleBottom === undefined ? L.bottom : L.ruleBottom});

            /* The rule FIRST: the longest UNBROKEN horizontal run of ink in
               the band, which is the line under the day header. It is found
               before the marker because it is what bounds the search for it.

               An unbroken run, not a span. The first version of this took the
               leftmost and rightmost ink on each row and accepted the widest
               row that was at least 90 per cent filled, which is the same
               answer on two of the three posters and no answer at all on the
               third: the tribute hangs four hearts on strings from the top
               edge and two of those strings cross the rule's own row, 150
               points to its right. The span then ran from the rule's left end
               to a string, came out 43 per cent filled, and was rejected --
               leaving the marker search unbounded, which handed it four red
               hearts that do not move when the day changes and a calibration
               pitch of exactly zero.

               No box is wider than its poster's rule inside any of these three
               bands (the widest in band is 121pt against a 272pt rule on the
               birthday, 67pt against 209pt on the tribute), so the longest run
               is the rule on all of them. */
            let ruleLo = -1, ruleHi = -1, best = 0;
            for (let y = ruleTop; y <= ruleBottom; y += 1) {
                let runStart = -1;
                for (let x = 0; x <= W; x += 1) {
                    const i = ((y * W) + x) * 4;
                    const ink = x < W && (Math.abs(d[i] - bg[0]) > 60 ||
                        Math.abs(d[i + 1] - bg[1]) > 60 || Math.abs(d[i + 2] - bg[2]) > 60);
                    if (ink) {
                        if (runStart === -1) { runStart = x; }
                    } else if (runStart !== -1) {
                        if (x - runStart > best) {
                            best = x - runStart; ruleLo = runStart; ruleHi = x - 1;
                        }
                        runStart = -1;
                    }
                }
            }

            /* The marker, searched ONLY across the calendar's own width.

               Red is not by itself a marker. The birthday poster draws a red
               keyline around every one of its twelve photo boxes, three of
               which sit inside this band, and a whole-width scan put the
               centroid out in column 9 of a seven-column grid -- and found a
               marker in the two months that are supposed to have none. The
               rule is what says where the calendar is. */
            let hx = 0, hy = 0, hits = 0;
            const mLo = ruleLo >= 0 ? ruleLo : 0;
            const mHi = ruleHi >= 0 ? ruleHi : W - 1;
            for (let y = top; y <= bottom; y += 1) {
                for (let x = mLo; x <= mHi; x += 1) {
                    const i = ((y * W) + x) * 4;
                    if (d[i] > 180 && d[i + 1] < 90 && d[i + 2] < 90) {
                        hx += x; hy += y; hits += 1;
                    }
                }
            }
            return {
                hits: hits,
                x: hits ? hx / hits : null,
                y: hits ? hy / hits : null,
                ruleLo: ruleLo, ruleHi: ruleHi
            };
        };

        /* Calibration. Day 1 is row 0 and day 8 is row 1 in EVERY month, so
           these two give the pitch and the origin without the page being asked
           where it put anything. */
        if (!await set('p-month', 0) || !await set('p-year', 2027) ||
                !await set('p-day', 1)) {
            return { error: 'missing month/year/day control' };
        }
        await wait(260);
        const cal1 = readMarker();
        await set('p-day', 8);
        await wait(260);
        const cal8 = readMarker();
        if (!cal1.hits || !cal8.hits) { return { error: 'no marker during calibration' }; }
        const pitch = cal8.y - cal1.y;
        if (!(pitch > 2)) { return { error: 'calibration pitch came out ' + pitch }; }

        const cases = ${JSON.stringify(CASES)};
        const out = [];
        for (const c of cases) {
            await set('p-month', c.m);
            await set('p-year', c.y);
            await set('p-day', c.day);
            await wait(260);
            const m = readMarker();
            out.push({
                hits: m.hits,
                col: m.hits && m.ruleLo >= 0
                    ? Math.floor((m.x - m.ruleLo) / ((m.ruleHi - m.ruleLo) / 7))
                    : null,
                row: m.hits ? Math.round((m.y - cal1.y) / pitch) : null
            });
        }
        return { pitch: pitch, origin: cal1.y, cases: out };
    })()`);

    if (!got || got.error) {
        check(`13a. ${L.label}: the poster answered`, false,
            got && got.error ? got.error : "no result");
        return;
    }

    check(`13a. ${L.label}: row pitch calibrated from the poster`,
        got.pitch > 2, `day 1 and day 8 are ${got.pitch} apart`);

    CASES.forEach((c, i) => {
        const want = expected[i];
        const have = got.cases[i];
        const label = `${L.label} ${c.y}-${String(c.m + 1).padStart(2, "0")} day ${c.day} (${c.note})`;

        if (!want) {
            /* A day the month does not have must mark NOTHING, rather than
               something off the end of the grid. */
            check(`13b. ${label}: nothing is marked`, have.hits === 0,
                `found ${have.hits} marker pixels for a day not in the month`);
            return;
        }
        /* Before anything is measured: does this layout's window even reach
           the row the calendar should have used? A row outside it produces a
           clipped centroid, which is a wrong answer that can look like a right
           one. Say so plainly rather than let it round. */
        const reach = L.rows === undefined ? 6 : L.rows;
        if (want.row >= reach) {
            check(`13b. ${label}: inside the scan window`, false,
                `expected row ${want.row}, but this layout's window reaches ` +
                `rows 0 to ${reach - 1} only -- see the LAYOUTS comment before ` +
                "widening it, because the bound is drawing and not margin");
            return;
        }

        check(`13b. ${label}: the day is marked`, have.hits > 0,
            "no marker found");
        if (!have.hits) { return; }
        check(`13c. ${label}: column ${want.col}`, have.col === want.col,
            `marker fell in column ${have.col}, expected ${want.col}`);
        check(`13d. ${label}: row ${want.row}`, have.row === want.row,
            `marker fell in row ${have.row}, expected ${want.row}`);
    });
}

/* ==========================================================================
   14. Template Studio: a refused publish writes nothing.

   The studio edits JavaScript SOURCE. Everywhere else in this suite a defect
   is a wrong number on a page; here a defect is a corrupted registry, and the
   thing standing between the two is one function -- verifyRegistry -- that
   has to refuse a patch it cannot prove.

   So what is asserted is the REFUSAL, not the success. A splice that works is
   pleasant; a splice that quietly damages a neighbouring entry and gets
   written is the failure mode this whole design exists to prevent, and a
   check that only ever exercises the happy path would not see it.

   Everything here is in-memory. The studio hands back patched SOURCE and the
   caller decides whether to write it, so this section can exercise the whole
   mechanism against the real registries without touching a file.

   Runs in the browser because the verification uses DOMParser and compiles
   the patched file, neither of which exists in the static section.
   ========================================================================== */
async function templateStudioChecks(page) {
    section("14. Template Studio: a refused publish writes nothing");

    await page.navigate(`http://localhost:${PORT}/admin.html`, 1440);

    const r = await page.evaluate(`(async () => {
        for (let i = 0; i < 150; i += 1) {
            if (window.TBStudio) break;
            await new Promise((res) => setTimeout(res, 100));
        }
        if (!window.TBStudio) { return { error: "js/admin-studio.js did not load" }; }
        const S = window.TBStudio;
        /* Everything below reports its own failure rather than throwing into
           the void: an evaluate that throws comes back undefined, and "no
           result" is the least useful thing a check can say. */
        try {
        const reg = await S.loadRegistries();
        const RC = S.RESUME_CFG;
        const DC = S.DOCS_CFG;
        const ids = reg.resumes.map((t) => t.id);
        const docIds = Object.keys(reg.docs);
        const out = { ids: ids, docIds: docIds, drift: reg.drift };

        /* A round trip. Re-writing an entry with its own value must leave the
           registry meaning exactly what it meant -- the comments inside it do
           not survive and the MEANING must. */
        const same = reg.resumes[0];
        const rt = S.planRegistryEdit(reg.resumeSrc, RC, same, same.id, "save", ids);
        out.roundTrip = S.deepEqual(
            S.evaluateRegistry(rt.source, "window.TB_RESUME_TEMPLATES = [", "[", "]"),
            reg.resumes);

        /* Creating one must add exactly that one and move nothing else. */
        const made = { id: "suite-probe", title: "Suite Probe", catalog: false,
            page: { width: 595, height: 842 },
            layout: { kind: "single-column",
                main: { left: 48, right: 48, firstBaseline: 74, bottom: 800 } },
            palette: { ink: "#1A1A1A" },
            type: { body: { family: "sans", weight: "normal", size: 10,
                lineHeight: 14, color: "ink" } },
            blocks: [{ column: "main", kind: "text", type: "body", field: "summary" }] };
        const created = S.planRegistryEdit(reg.resumeSrc, RC, made, made.id, "save", ids);
        const afterCreate = S.evaluateRegistry(created.source,
            "window.TB_RESUME_TEMPLATES = [", "[", "]");
        out.create = afterCreate.length === reg.resumes.length + 1 &&
            S.deepEqual(afterCreate.slice(0, -1), reg.resumes) &&
            S.deepEqual(afterCreate[afterCreate.length - 1], made);

        /* And removing one must remove exactly that one. */
        const gone = S.planRegistryEdit(reg.resumeSrc, RC, null, ids[ids.length - 1],
            "delete", ids);
        out.remove = S.deepEqual(
            S.evaluateRegistry(gone.source, "window.TB_RESUME_TEMPLATES = [", "[", "]"),
            reg.resumes.slice(0, -1));

        /* The document registry is a different shape and the same rules. */
        const dmade = { layout: reg.layouts[0], heading: "SUITE PROBE",
            file: "suite-probe", labels: { issuerLegend: "Issued By" } };
        const dplan = S.planRegistryEdit(reg.docsSrc, DC, dmade, "suite-probe", "save", docIds);
        const afterDoc = S.evaluateRegistry(dplan.source, "const DOC_TYPES = {", "{", "}");
        out.docCreate = Object.keys(afterDoc).length === docIds.length + 1 &&
            docIds.every((k) => S.deepEqual(afterDoc[k], reg.docs[k])) &&
            S.deepEqual(afterDoc["suite-probe"], dmade);

        /* THE REFUSALS. Each of these is a patch that must never reach disk. */
        const refuse = (after, expected) => S.verifyRegistry(reg.resumeSrc, after, RC, expected);
        const target = reg.resumes[reg.resumes.length - 1];
        const expected = { id: target.id, value: target, count: reg.resumes.length,
            action: "save" };

        /* A neighbour quietly altered. */
        out.collateral = refuse(
            reg.resumeSrc.replace("title: " + JSON.stringify(reg.resumes[0].title),
                "title: " + JSON.stringify("Tampered")), expected);

        /* A patch that does not compile. */
        out.syntax = refuse(
            reg.resumeSrc.replace("window.TB_RESUME_TEMPLATES = [",
                "window.TB_RESUME_TEMPLATES = [ {{{ "), expected);

        /* A count that is not what the edit was for. */
        out.count = refuse(reg.resumeSrc, Object.assign({}, expected,
            { count: reg.resumes.length + 1 }));

        /* An entry that did not come back as it was written. */
        out.notWritten = refuse(reg.resumeSrc, Object.assign({}, expected,
            { value: Object.assign({}, target, { title: "Something Else" }) }));

        /* A file gutted. */
        out.truncated = refuse(reg.resumeSrc.slice(0, 400), expected);

        /* Validation catches what the engine cannot draw and the form cannot
           fill, BEFORE any of the above is reached. */
        out.validation = S.validateResume({
            id: "Not An Id", title: "",
            page: { width: 595, height: 842 },
            layout: { kind: "single-column",
                main: { left: 0, right: 0, firstBaseline: 10, bottom: 800 } },
            palette: { ink: "#1A1A1A" },
            type: { body: { family: "Helvetica", size: 10, color: "#FF0000" } },
            blocks: [{ column: "main", kind: "text", type: "body", field: "nickname" },
                { column: "main", kind: "photo", width: 100, height: 200 }]
        }, reg.resumes).length;

        /* A document layout that is not one of the five renderers. */
        out.docLayout = S.validateDoc({ layout: "invented", heading: "X", file: "x",
            labels: { a: "b" } }, "x", docIds).length;

        return out;
        } catch (err) {
            return { error: String((err && err.stack) || err) };
        }
    })()`);

    if (!r || r.error) {
        check("14a. the studio answered", false, r && r.error ? r.error : "no result");
        return;
    }

    check("14a. the studio reads both registries",
        r.ids.length > 0 && r.docIds.length > 0,
        r.ids.length + " resume templates, " + r.docIds.length + " document types");

    /* The five layout names are duplicated in js/admin-studio.js so a select
       cannot offer a sixth. This is what stops that copy going stale. */
    check("14b. the studio's layout list matches js/docs.js",
        r.drift.length === 0, "drift: " + r.drift.join(", "));

    check("14c. re-writing an entry preserves the registry's meaning", r.roundTrip,
        "a round trip through the serialiser changed what the registry means");
    check("14d. creating an entry moves nothing else", r.create,
        "the other entries did not come back unchanged");
    check("14e. removing an entry removes only that one", r.remove,
        "the remaining entries did not come back unchanged");
    check("14f. the document registry round-trips too", r.docCreate,
        "adding a document type disturbed the others");

    /* The half that matters. Each of these is a patch that must be refused,
       and the message is checked to be non-empty rather than exact: what is
       asserted is the refusal, not its wording. */
    [["14g", "collateral", "a patch that alters a neighbouring entry"],
     ["14h", "syntax", "a patch that does not compile"],
     ["14i", "count", "a patch with the wrong entry count"],
     ["14j", "notWritten", "a patch whose entry is not what was authored"],
     ["14k", "truncated", "a patch that gutted the file"]].forEach(([n, key, what]) => {
        check(n + ". refuses " + what, Boolean(r[key]),
            "this was ACCEPTED, and would have been written to disk");
    });

    check("14l. validation rejects what the engine cannot draw",
        r.validation >= 5, "only " + r.validation + " problems reported, expected at least 5");
    check("14m. a document layout outside the five is rejected",
        r.docLayout > 0, "an invented layout name was accepted");
}

async function definitionPosterChecks(page) {
    section("15. Definition poster: greyscale, and the four faces");

    /* The ninth poster is the only layout in this editor that CONVERTS a
       photograph, and the conversion is written twice -- ctx.filter for the
       canvas, an feColorMatrix for the SVG. Two painters that must agree is
       this file's standing hazard, and a greyscale that agrees on the screen
       and not in the export is invisible until somebody opens the file.

       So this is not a rendering check. It samples the two renders as NUMBERS
       and compares them, and it reads the export as MARKUP to see which face
       each of the four text roles actually carries -- because the failure this
       design invites is setting the closing line in the sans, which looks
       almost right.

       The photographs are flat colour on purpose. A shape inside one
       antialiases differently in two rasterisers, and those edge pixels would
       be counted as the painters disagreeing when they are only the scaler
       disagreeing with itself. */
    await page.navigate(`http://localhost:${PORT}/poster.html`, 1440);

    const r = await page.evaluate(`(async () => {
        const wait = (ms) => new Promise((res) => setTimeout(res, ms));
        try {
        const sel = document.getElementById('p-frame');
        if (!sel) { return { error: 'no frame select on poster.html' }; }
        sel.value = 'couple';
        if (sel.value !== 'couple') { return { error: 'no couple option in the frame select' }; }
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        await wait(700);

        const HUES = [0, 45, 90, 135, 180, 225, 270, 315, 20];
        const files = [];
        for (let i = 0; i < 9; i += 1) {
            const cv = document.createElement('canvas');
            cv.width = 400; cv.height = 500;
            const g = cv.getContext('2d');
            g.fillStyle = 'hsl(' + HUES[i] + ', 90%, 55%)';
            g.fillRect(0, 0, 400, 500);
            const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
            files.push(new File([blob], 'c' + i + '.png', { type: 'image/png' }));
        }
        const input = document.getElementById('p-image-grid');
        if (!input) { return { error: 'no batch photo input' }; }
        const dt = new DataTransfer();
        files.forEach((f) => dt.items.add(f));
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await wait(2500);

        /* The export, captured rather than downloaded. */
        const grab = async () => {
            let blob = null;
            const realCreate = URL.createObjectURL;
            const realClick = HTMLAnchorElement.prototype.click;
            HTMLAnchorElement.prototype.click = function () {};
            URL.createObjectURL = function (b) {
                if (b && b.type && b.type.indexOf('svg') >= 0) { blob = b; }
                return realCreate.call(URL, b);
            };
            const type = document.getElementById('dl-type');
            type.value = 'svg';
            type.dispatchEvent(new Event('change', { bubbles: true }));
            document.getElementById('dl-go').click();
            await wait(900);
            URL.createObjectURL = realCreate;
            HTMLAnchorElement.prototype.click = realClick;
            return blob ? blob.text() : null;
        };

        const canvas = document.getElementById('poster-canvas');
        const W = canvas.width, H = canvas.height;
        const raster = async (text) => {
            const img = new Image();
            img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text);
            await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
            const cv = document.createElement('canvas');
            cv.width = W; cv.height = H;
            cv.getContext('2d').drawImage(img, 0, 0, W, H);
            return cv.getContext('2d').getImageData(0, 0, W, H).data;
        };

        const svgText = await grab();
        if (!svgText) { return { error: 'the SVG export produced nothing' }; }
        const a = canvas.getContext('2d').getImageData(0, 0, W, H).data;
        const b = await raster(svgText);

        /* One sample from the middle of each of the nine cells, in both. The
           cell centres come from the design's own numbers: a 157-point cell on
           a 171-point step from a margin of 48.14, over a 595.28 by 841.89
           page whose grid starts at 110. */
        const at = (data, fx, fy) => {
            const i = (Math.round(H * fy) * W + Math.round(W * fx)) * 4;
            return [data[i], data[i + 1], data[i + 2]];
        };
        const cells = [];
        for (let row = 0; row < 3; row += 1) {
            for (let col = 0; col < 3; col += 1) {
                const fx = (48.14 + col * 171 + 78.5) / 595.28;
                const fy = (110 + row * 171 + 78.5) / 841.89;
                cells.push({ canvas: at(a, fx, fy), svg: at(b, fx, fy) });
            }
        }
        const isGrey = (p) => p[0] === p[1] && p[1] === p[2];
        const near = (p, q) => Math.max(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]),
            Math.abs(p[2] - q[2]));
        const out = {
            greyCanvas: cells.filter((c) => isGrey(c.canvas)).length,
            greySvg: cells.filter((c) => isGrey(c.svg)).length,
            worstDelta: Math.max(...cells.map((c) => near(c.canvas, c.svg))),
            /* Nine flat hues must not all convert to the same grey, or the
               check would pass just as well against a solid fill. */
            distinctGreys: new Set(cells.map((c) => c.canvas[0])).size
        };

        /* The type must NOT be greyed. The word is drawn in the theme's ink
           over the page, both neutral, so a leaked filter would be invisible
           there -- this asks the canvas directly whether the filter is still
           standing after the cells are painted. */
        out.filterAfterPaint = canvas.getContext('2d').filter;

        /* What the export says about the four roles. */
        const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
        const texts = Array.from(doc.querySelectorAll('text')).map((t) => ({
            family: (t.getAttribute('font-family') || '').split(',')[0].replace(/'/g, ''),
            weight: t.getAttribute('font-weight'),
            size: Number(t.getAttribute('font-size')),
            y: Number(t.getAttribute('y')),
            text: t.textContent || ''
        }));
        out.faces = texts.map((t) => t.family + ' ' + t.weight);
        out.first = texts[0] || null;
        out.last = texts[texts.length - 1] || null;
        out.brackets = texts.length > 1 &&
            texts[1].text.charAt(0) === '[' &&
            texts[1].text.charAt(texts[1].text.length - 1) === ']';
        /* The one thing about this design that could be READ off the
           reference rather than derived: the word and the bracket end their
           ink on the same pixel row, so they share a baseline. */
        out.sameBaseline = texts.length > 1 && texts[0].y === texts[1].y;
        out.smallerBracket = texts.length > 1 && texts[1].size < texts[0].size / 2;
        out.filters = Array.from(doc.querySelectorAll('filter')).map((f) => ({
            id: f.getAttribute('id'),
            space: f.getAttribute('color-interpolation-filters'),
            matrix: f.querySelector('feColorMatrix')
                ? f.querySelector('feColorMatrix').getAttribute('values') : null
        }));
        out.greyedGroups = doc.querySelectorAll('g[filter]').length;

        /* And with the treatment turned OFF the cells must come back coloured,
           in both painters. A toggle that only moves the preview is the other
           half of the same defect. */
        const box = document.getElementById('p-couple-grey');
        if (!box) { return { error: 'no black and white control' }; }
        box.checked = false;
        box.dispatchEvent(new Event('change', { bubbles: true }));
        await wait(800);
        const colourText = await grab();
        const ca = canvas.getContext('2d').getImageData(0, 0, W, H).data;
        const cb = await raster(colourText);
        const colour = [];
        for (let row = 0; row < 3; row += 1) {
            for (let col = 0; col < 3; col += 1) {
                const fx = (48.14 + col * 171 + 78.5) / 595.28;
                const fy = (110 + row * 171 + 78.5) / 841.89;
                colour.push({ canvas: at(ca, fx, fy), svg: at(cb, fx, fy) });
            }
        }
        out.colourCanvas = colour.filter((c) => !isGrey(c.canvas)).length;
        out.colourSvg = colour.filter((c) => !isGrey(c.svg)).length;
        out.colourWorstDelta = Math.max(...colour.map((c) => near(c.canvas, c.svg)));
        out.colourFilters = new DOMParser()
            .parseFromString(colourText, 'image/svg+xml')
            .querySelectorAll('filter').length;
        return out;
        } catch (err) {
            return { error: String((err && err.stack) || err) };
        }
    })()`);

    if (!r || r.error) {
        check("15a. the definition poster answered", false,
            r && r.error ? r.error : "no result");
        return;
    }

    check("15a. all nine cells are greyscale on the canvas",
        r.greyCanvas === 9, r.greyCanvas + " of 9 cells came back neutral");
    check("15b. all nine cells are greyscale in the SVG export",
        r.greySvg === 9, r.greySvg + " of 9 cells came back neutral");
    /* Within one level. The two rasterisers round the same matrix
       differently in the last bit and nothing else; anything larger is the
       linearRGB default coming back. */
    check("15c. the two painters agree on the grey",
        r.worstDelta <= 2, "worst channel difference " + r.worstDelta +
        " -- check color-interpolation-filters is still sRGB");
    check("15d. nine different hues make nine different greys",
        r.distinctGreys >= 7, "only " + r.distinctGreys +
        " distinct values, so this would pass against a flat fill");
    check("15e. the canvas filter does not leak past the photographs",
        r.filterAfterPaint === "none", "filter left as " + r.filterAfterPaint);

    check("15f. the export declares the filter in sRGB",
        r.filters.length === 1 && r.filters[0].space === "sRGB" &&
        r.filters[0].matrix === "0",
        JSON.stringify(r.filters));
    check("15g. every filled cell is greyed in the export",
        r.greyedGroups === 9, r.greyedGroups + " of 9 groups carry the filter");

    /* The four faces, in the order they are drawn: the word, the bracket, the
       definition's lines, and the closing line LAST. */
    const faces = r.faces || [];
    check("15h. the word is a heavy serif",
        faces[0] === "Playfair Display 700", "first text is " + faces[0]);
    check("15i. the bracket is a bold sans on the word's own baseline",
        faces[1] === "Inter 600" && r.sameBaseline && r.smallerBracket && r.brackets,
        "second text is " + faces[1] + ", same baseline: " + r.sameBaseline +
        ", smaller: " + r.smallerBracket + ", bracketed: " + r.brackets);
    check("15j. the definition is a sans",
        faces.slice(2, -1).length > 0 &&
        faces.slice(2, -1).every((f) => f === "Inter 400"),
        faces.slice(2, -1).join(" | "));
    check("15k. the closing line switches BACK to the serif",
        faces[faces.length - 1] === "Playfair Display 400",
        "last text is " + faces[faces.length - 1]);

    check("15l. turning the treatment off restores colour on the canvas",
        r.colourCanvas === 9, r.colourCanvas + " of 9 cells came back coloured");
    check("15m. turning it off restores colour in the export too",
        r.colourSvg === 9 && r.colourFilters === 0,
        r.colourSvg + " of 9 coloured, " + r.colourFilters + " filters still declared");
    check("15n. the two painters agree on the colour as well",
        r.colourWorstDelta <= 2, "worst channel difference " + r.colourWorstDelta);
}

async function songPosterChecks(page) {
    section("16. Song poster: the reused music block, and the split that feeds it");

    /* The tenth layout REUSES the music poster's block rather than drawing its
       own, and the two ways that goes wrong are both silent.

       PLAYER_ART's paths are in the player's PAGE coordinates, so a group
       placed with drawArt() lands where the PLAYER put it. This layout places
       each glyph by its own box instead, and if anyone ever "simplifies" that
       back the transport row moves to another poster's position -- which still
       renders, still exports, and is wrong. So the row is measured from the
       PIXELS rather than trusted from the code, in both painters.

       And the controls behind that block are SHARED, which is what made the
       split necessary. Widening #p-player-fields would have been one line and
       would have put a dead Screen Mode on this poster -- the exact defect this
       file already shipped once by widening #p-grid-fields. What is asserted
       here is both halves: that this poster can reach what it needs, and that
       it cannot reach what belongs to the other one.

       The third thing is the script face, which no poster in this editor had
       ever actually loaded -- see 16b. */
    await page.navigate(`http://localhost:${PORT}/poster.html`, 1440);

    const r = await page.evaluate(`(async () => {
        const wait = (ms) => new Promise((res) => setTimeout(res, ms));
        try {
        if (document.fonts && document.fonts.ready) { await document.fonts.ready; }
        await wait(900);

        const out = {};

        /* THE SCRIPT FACE. check() alone is not enough -- it answers about the
           font set, not about what the canvas would draw -- so the greeting is
           measured in the script and again in the fallback the stack names
           next. Equal widths mean the webfont is not in use whatever check()
           says. */
        out.scriptCheck = document.fonts.check('16px "Petit Formal Script"');
        const mc = document.createElement('canvas').getContext('2d');
        mc.font = '40px "Petit Formal Script"';
        out.scriptWidth = Math.round(mc.measureText('Happy Birthday').width * 100) / 100;
        mc.font = '40px "Playfair Display"';
        out.fallbackWidth = Math.round(mc.measureText('Happy Birthday').width * 100) / 100;

        const sel = document.getElementById('p-frame');
        if (!sel) { return { error: 'no frame select on poster.html' }; }
        sel.value = 'tune';
        if (sel.value !== 'tune') { return { error: 'no tune option in the frame select' }; }
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        await wait(800);

        /* Reachable means VISIBLE THROUGH ITS ANCESTORS, not merely present:
           a control inside a hidden block is in the DOM and unusable, which is
           the whole shape of the defect being guarded against. */
        const reach = (id) => {
            let el = document.getElementById(id);
            if (!el) { return null; }
            while (el && el !== document.body) {
                if (el.hidden) { return false; }
                el = el.parentElement;
            }
            return Boolean(el);
        };
        const SHARED = ['p-song', 'p-elapsed', 'p-total', 'p-heart-trigger', 'p-image-code'];
        const PLAYER_ONLY = ['p-artist', 'p-player-theme', 'p-code-pos', 'p-caption-head'];
        out.tuneShared = SHARED.map(reach);
        out.tunePlayerOnly = PLAYER_ONLY.map(reach);
        out.tuneOwn = [reach('p-tune-greeting'), reach('p-tune-theme')];
        out.tuneBatch = reach('p-image-grid');
        out.tuneSinglePhoto = reach('p-image');

        /* Flat fills, so a tile's own contents cannot be mistaken for the two
           painters disagreeing. */
        const files = [];
        for (let i = 0; i < 14; i += 1) {
            const cv = document.createElement('canvas');
            cv.width = 400; cv.height = 400;
            const g = cv.getContext('2d');
            g.fillStyle = 'hsl(' + (i * 26) + ', 70%, 58%)';
            g.fillRect(0, 0, 400, 400);
            const b = await new Promise((res) => cv.toBlob(res, 'image/png'));
            files.push(new File([b], 't' + i + '.png', { type: 'image/png' }));
        }
        const grid = document.getElementById('p-image-grid');
        if (!grid) { return { error: 'no batch photo input' }; }
        const dt = new DataTransfer();
        files.forEach((f) => dt.items.add(f));
        grid.files = dt.files;
        grid.dispatchEvent(new Event('change', { bubbles: true }));
        await wait(3200);

        let blob = null;
        const realCreate = URL.createObjectURL;
        const realClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () {};
        URL.createObjectURL = function (b) {
            if (b && b.type && b.type.indexOf('svg') >= 0) { blob = b; }
            return realCreate.call(URL, b);
        };
        const type = document.getElementById('dl-type');
        type.value = 'svg';
        type.dispatchEvent(new Event('change', { bubbles: true }));
        document.getElementById('dl-go').click();
        await wait(1400);
        URL.createObjectURL = realCreate;
        HTMLAnchorElement.prototype.click = realClick;
        if (!blob) { return { error: 'the SVG export produced nothing' }; }
        const svgText = await blob.text();

        const canvas = document.getElementById('poster-canvas');
        const W = canvas.width, H = canvas.height;
        const img = new Image();
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
        const sv = document.createElement('canvas');
        sv.width = W; sv.height = H;
        sv.getContext('2d').drawImage(img, 0, 0, W, H);
        const a = canvas.getContext('2d').getImageData(0, 0, W, H).data;
        const b = sv.getContext('2d').getImageData(0, 0, W, H).data;

        const at = (data, fx, fy) => {
            const i = (Math.round(H * fy) * W + Math.round(W * fx)) * 4;
            return [data[i], data[i + 1], data[i + 2]];
        };
        const gap = (p, q) => Math.max(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]),
            Math.abs(p[2] - q[2]));

        /* THE SEAM. Two cards abut at collage x 190, and both are card-coloured
           there. Filling the tiles one at a time drops each card's shadow onto
           the card beside it and stripes the collage; a filter on an SVG group
           shadows the composite and cannot. So a seam that is darker on the
           canvas than in the export is the two painters having parted. */
        const seamX = (72.64 + 168.5) / 595.28;
        const seamY = (98.4 + 90) / 841.89;
        out.seam = { canvas: at(a, seamX, seamY), svg: at(b, seamX, seamY) };
        out.seamGap = gap(out.seam.canvas, out.seam.svg);

        /* And the shadow itself, just below the lowest tiles, where nothing but
           shadow can be. */
        const shX = 0.504, shY = 444 / 841.89;
        out.shadow = { canvas: at(a, shX, shY), svg: at(b, shX, shY) };
        out.shadowGap = gap(out.shadow.canvas, out.shadow.svg);
        out.shadowIsDarker = at(a, shX, shY)[0] < at(a, 0.04, shY)[0] - 3;

        /* THE TRANSPORT ROW, from the pixels. Columns carrying ink across the
           row's band, grouped into runs: five glyphs, at this layout's own
           centres and not the player's. */
        const runs = (data) => {
            const y0 = Math.round(H * (770 / 841.89));
            const y1 = Math.round(H * (805 / 841.89));
            const found = [];
            let cur = null;
            for (let x = 0; x < W; x += 1) {
                let hit = 0;
                for (let y = y0; y <= y1; y += 1) {
                    const i = (y * W + x) * 4;
                    if (data[i] < 140) { hit += 1; }
                }
                if (hit) { if (!cur) { cur = [x, x]; } else { cur[1] = x; } }
                else if (cur) { found.push(cur); cur = null; }
            }
            if (cur) { found.push(cur); }
            return found.filter((f) => f[1] - f[0] >= 2);
        };
        const toPt = (v) => Math.round(v * 595.28 / W * 10) / 10;
        out.rowCanvas = runs(a).map((f) => ({
            centre: toPt((f[0] + f[1]) / 2), w: toPt(f[1] - f[0] + 1) }));
        out.rowSvg = runs(b).map((f) => ({
            centre: toPt((f[0] + f[1]) / 2), w: toPt(f[1] - f[0] + 1) }));
        /* Where the design says they go: 149.64 plus these fractions of 296. */
        out.rowWant = [0.0426, 0.266, 0.5, 0.728, 0.951]
            .map((k) => Math.round((136.09 + 323.1 * k) * 10) / 10);
        /* And where the PLAYER puts its own row, for contrast: its group spans
           92 to 508 of a 597.45-point page, which is nowhere near these. */
        out.playerRow = [92, 508];

        /* Back to the music poster: the split must not have cost it anything. */
        sel.value = 'player';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        await wait(700);
        out.playerShared = SHARED.map(reach);
        out.playerOwn = PLAYER_ONLY.map(reach);
        out.playerTuneBlock = reach('p-tune-greeting');
        return out;
        } catch (err) {
            return { error: String((err && err.stack) || err) };
        }
    })()`);

    if (!r || r.error) {
        check("16a. the song poster answered", false,
            r && r.error ? r.error : "no result");
        return;
    }

    check("16a. the song poster renders and exports", Array.isArray(r.rowCanvas),
        "no transport row came back");

    /* The script face had NEVER loaded before this layout was built: nothing
       on any page uses it in the DOM, so it was never pending, so
       document.fonts.ready resolved without it and five layouts drew their
       script text in the fallback. */
    check("16b. the script face is loaded, not merely declared",
        r.scriptCheck && r.scriptWidth !== r.fallbackWidth,
        "check: " + r.scriptCheck + ", script " + r.scriptWidth +
        " against fallback " + r.fallbackWidth +
        " -- a false check means the face was never requested; equal widths " +
        "mean it arrived and the canvas is drawing in the fallback anyway");

    check("16c. the song poster reaches every shared music control",
        r.tuneShared.every(Boolean), "reachable: " + JSON.stringify(r.tuneShared));
    check("16d. and reaches NONE of the music poster's own",
        r.tunePlayerOnly.every((v) => v === false),
        "reachable: " + JSON.stringify(r.tunePlayerOnly) +
        " -- a control that does nothing is the defect the split exists to prevent");
    check("16e. it shows its own two controls and the batch upload",
        r.tuneOwn.every(Boolean) && r.tuneBatch === true && r.tuneSinglePhoto === false,
        "own " + JSON.stringify(r.tuneOwn) + ", batch " + r.tuneBatch +
        ", single " + r.tuneSinglePhoto);
    check("16f. the split cost the music poster nothing",
        r.playerShared.every(Boolean) && r.playerOwn.every(Boolean) &&
        r.playerTuneBlock === false,
        "shared " + JSON.stringify(r.playerShared) + ", own " +
        JSON.stringify(r.playerOwn) + ", song poster's block " + r.playerTuneBlock);

    /* Five glyphs, at this poster's centres. Two failures are caught here: a
       group placed by drawArt() lands at the player's own coordinates, and a
       shuffle drawn from one path instead of three comes out narrow. */
    const centres = (list) => list.map((g) => g.centre);
    check("16g. the transport row has five glyphs on the canvas",
        r.rowCanvas.length === 5, "found " + r.rowCanvas.length + ": " +
        JSON.stringify(r.rowCanvas));
    check("16h. they land where THIS design puts them, not the player's",
        r.rowCanvas.length === 5 &&
        r.rowCanvas.every((g, i) => Math.abs(g.centre - r.rowWant[i]) <= 4),
        "drawn " + JSON.stringify(centres(r.rowCanvas)) + ", wanted " +
        JSON.stringify(r.rowWant));
    check("16i. the shuffle is drawn whole, all three of its paths",
        r.rowCanvas.length === 5 && r.rowCanvas[0].w >= 16,
        "leftmost glyph is " + (r.rowCanvas[0] || {}).w +
        " points wide, expected about 21 -- one path alone is nearer 9");
    check("16j. the export puts the row in the same place",
        r.rowSvg.length === 5 && r.rowCanvas.length === 5 &&
        r.rowSvg.every((g, i) => Math.abs(g.centre - r.rowCanvas[i].centre) <= 2),
        "export " + JSON.stringify(centres(r.rowSvg)) + " against canvas " +
        JSON.stringify(centres(r.rowCanvas)));

    check("16k. the tiles cast one shadow and not fourteen",
        r.seamGap <= 4, "a seam between two abutting cards reads " +
        JSON.stringify(r.seam.canvas) + " on the canvas and " +
        JSON.stringify(r.seam.svg) + " in the export");
    check("16l. the collage is shadowed at all, and the same in both",
        r.shadowIsDarker && r.shadowGap <= 4,
        "darker than the page: " + r.shadowIsDarker + ", canvas " +
        JSON.stringify(r.shadow.canvas) + " against export " +
        JSON.stringify(r.shadow.svg));
}

async function ruledInvoiceChecks(page) {
    section("12. Ruled invoice: the sheet, the arithmetic and the logo");

    const open = async (docType) => {
        /* takePreset() consumes the key on load, so it is written
           immediately before the navigation that reads it. */
        await page.evaluate("(localStorage.clear(), localStorage.setItem(" +
            "'tb_editor_preset', " + JSON.stringify(JSON.stringify(docType)) +
            "), true)");
        await page.navigate(`http://localhost:${PORT}/docs.html`, 1440);
    };

    await open("logo-invoice");

    const r = await page.evaluate(`(async () => {` + GRAB_PDF + `
        if (!await waitForPdfEngine()) { return { error: 'jsPDF never loaded' }; }

        const sheet = document.getElementById('doc-sheet');
        const layout = sheet.className;

        /* Start from a controlled document rather than the sample content:
           these are exact-figure assertions and the sample is free to
           change. */
        window.confirm = () => true;
        document.getElementById('clear-doc').click();
        await new Promise(r => setTimeout(r, 50));

        setField('f-contact-phone', '+1 (555) 018-2244');
        setField('f-contact-email', 'billing@example.com');
        setField('f-contact-site', 'www.example.com');

        const firstRow = document.querySelector('#item-list [data-entry]');
        const put = (name, value) => {
            const el = firstRow.querySelector('[data-entry-field="' + name + '"]');
            el.value = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        put('date', '12 Aug');
        put('description', 'Oak shelving board');
        put('qty', '3');
        put('price', '12.50');
        await new Promise(r => setTimeout(r, 50));

        const cells = [...sheet.querySelectorAll('.doc-ruled-table tbody tr')]
            .map(tr => [...tr.children].map(td => td.textContent));
        const emptyCell = sheet.querySelector('.doc-ruled-table tbody tr.is-empty td');
        const box = () => ({
            label: sheet.querySelector('.doc-ruled-total-label').textContent,
            value: sheet.querySelector('.doc-ruled-total-value').textContent
        });

        const plain = box();
        const subRowsWhenPlain = sheet.querySelectorAll('.doc-ruled-money .doc-total-row').length;

        /* 3 x 12.50 = 37.50, +10% tax = 41.25, less 10.00 paid = 31.25. */
        setField('f-tax-rate', '10');
        setField('f-paid', '10');
        await new Promise(r => setTimeout(r, 50));
        const withPayment = box();
        const subRows = [...sheet.querySelectorAll('.doc-ruled-money .doc-total-row')]
            .map(row => row.textContent);

        const icons = [...sheet.querySelectorAll('.doc-ruled-icon')].map(svg => ({
            viewBox: svg.getAttribute('viewBox'),
            d: svg.querySelector('path').getAttribute('d').length,
            fill: getComputedStyle(svg).fill
        }));

        /* A row added AFTER load must carry the Date input, which only this
           document type shows. applyDocType sweeps the document rather than
           the form, so a clone is covered -- but only because the sweep runs
           after it, and nothing about that is obvious from addItemRow. */
        document.getElementById('add-item').click();
        const rows = [...document.querySelectorAll('#item-list [data-entry]')];
        const addedDateField = rows[rows.length - 1]
            .querySelector('[data-entry-field="date"]').closest('[data-for]');
        const dateOnClone = {
            hidden: addedDateField.hidden,
            display: getComputedStyle(addedDateField).display
        };

        /* Logo: built here rather than read from disk, so the check carries
           its own fixture. Deliberately 2:1, to catch a writer that assumes
           a square. */
        const c = document.createElement('canvas');
        c.width = 200; c.height = 100;
        const g = c.getContext('2d');
        g.fillStyle = '#B4501E';
        g.fillRect(0, 0, 200, 100);
        const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        const dt = new DataTransfer();
        dt.items.add(new File([blob], 'logo.png', { type: 'image/png' }));
        const input = document.getElementById('f-logo');
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 400));

        const img = sheet.querySelector('.doc-ruled-logo');
        const stored = JSON.parse(localStorage.getItem('tb_docs_v1') || '{}');
        const withLogo = grabPdf();

        /* Removing it must return the export to exactly what it was, which
           is the baseline the hostile-value check below compares against. */
        document.getElementById('logo-remove').click();
        await new Promise(r => setTimeout(r, 100));
        const withoutLogo = grabPdf();

        return {
            layout: layout,
            rowCount: cells.length,
            firstRow: cells[0],
            emptyRowBorder: emptyCell
                ? getComputedStyle(emptyCell).borderBottomWidth
                : 'no empty row',
            plainLabel: plain.label,
            plainValue: plain.value,
            subRowsWhenPlain: subRowsWhenPlain,
            paidLabel: withPayment.label,
            paidValue: withPayment.value,
            subRows: subRows,
            icons: icons,
            dateOnClone: dateOnClone,
            logoOnSheet: !!img,
            logoIsRaster: /^data:image\\/png;base64,/.test(String(stored.logo || '')),
            logoRatio: stored.logoRatio,
            withLogoBytes: withLogo.length,
            withLogoImages: countIn(withLogo, /\\/Subtype\\s*\\/Image/g),
            withLogoText: countIn(withLogo, /\\bTj\\b/g) + countIn(withLogo, /\\bTJ\\b/g),
            withoutLogoBytes: withoutLogo.length,
            withoutLogoImages: countIn(withoutLogo, /\\/Subtype\\s*\\/Image/g),
            record: JSON.stringify(JSON.parse(localStorage.getItem('tb_docs_v1')))
        };
    })()`);

    check("the logo-invoice preset opens the ruled layout",
        r && !r.error && r.layout === "doc-sheet is-ruled-invoice",
        r && r.error ? r.error : `sheet class is "${r && r.layout}"`);
    if (!r || r.error) { return; }

    check("the grid never falls below eight body rows (one line item entered)",
        r.rowCount >= 8, `${r.rowCount} row(s) drawn`);

    check("an unfilled row is still ruled",
        r.emptyRowBorder !== "0px" && r.emptyRowBorder !== "no empty row",
        `border-bottom-width on an empty cell is ${r.emptyRowBorder}`);

    check("the five columns carry date, description, price, qty and row total",
        Array.isArray(r.firstRow) && r.firstRow.length === 5 &&
        r.firstRow[0] === "12 Aug" && r.firstRow[1] === "Oak shelving board" &&
        r.firstRow[2] === "$12.50" && r.firstRow[3] === "3",
        `row reads ${JSON.stringify(r.firstRow)}`);

    /* The row total is computed, never typed: 3 x 12.50. */
    check("the row total is quantity times price",
        Array.isArray(r.firstRow) && r.firstRow[4] === "$37.50",
        `row total reads "${r.firstRow && r.firstRow[4]}" against an expected $37.50`);

    check("a plain invoice shows one boxed total and no breakdown above it",
        r.plainLabel === "Total:" && r.plainValue === "$37.50" &&
        r.subRowsWhenPlain === 0,
        `box reads "${r.plainLabel} ${r.plainValue}" with ` +
        `${r.subRowsWhenPlain} row(s) above it; expected "Total: $37.50" and none`);

    /* 37.50 + 10% = 41.25, less 10.00 already paid. */
    check("recording a payment switches the box to the balance due",
        r.paidLabel === "Balance Due:" && r.paidValue === "$31.25",
        `box reads "${r.paidLabel} ${r.paidValue}" against an expected ` +
        `"Balance Due: $31.25"`);

    check("subtotal, tax and the amount paid appear above the box once non-zero",
        r.subRows.length === 3 &&
        r.subRows[0] === "Subtotal$37.50" &&
        r.subRows[1] === "Tax (10%)$3.75" &&
        r.subRows[2] === "Amount Already Paid-$10.00",
        `breakdown reads ${JSON.stringify(r.subRows)}`);

    check("all three contact icons draw on the sheet",
        r.icons.length === 3 &&
        r.icons.every((i) => i.viewBox === "0 -960 960 960" && i.d > 100),
        `icons: ${JSON.stringify(r.icons.map((i) => [i.viewBox, i.d]))}`);

    /* An SVG's fill does not inherit from color, so a deleted rule shows up
       here as browser-default pure black beside #1A1A1A text -- close enough
       to look right in a screenshot and wrong on paper. This cannot tell
       #1A1A1A from currentColor, and does not need to: inside .doc-sheet the
       two resolve identically in both themes. */
    check("the icons are filled with the sheet's ink, not SVG default black",
        r.icons.every((i) => i.fill === "rgb(26, 26, 26)"),
        `fills: ${JSON.stringify(r.icons.map((i) => i.fill))}`);

    check("a line-item row added after load carries the Date column's input",
        r.dateOnClone.hidden === false && r.dateOnClone.display !== "none",
        `hidden=${r.dateOnClone.hidden} display=${r.dateOnClone.display}`);

    check("an uploaded logo reaches the sheet and is stored as a base64 raster",
        r.logoOnSheet && r.logoIsRaster && r.logoRatio === 2,
        `onSheet=${r.logoOnSheet} raster=${r.logoIsRaster} ratio=${r.logoRatio} ` +
        "(a 200x100 upload; the ratio travels with the image because the PDF " +
        "writer cannot decode it to learn the shape)");

    check("the export embeds the logo and the icons and is still real text",
        r.withLogoImages > r.withoutLogoImages && r.withLogoText > 20,
        `${r.withLogoImages} image XObject(s) with a logo against ` +
        `${r.withoutLogoImages} without, and ${r.withLogoText} text-showing ` +
        "operator(s) -- a rasterized sheet would report zero");

    /* Untrusted input on the way out of storage. An SVG data URI is a script
       vector, and the honest outcome is an export indistinguishable from one
       with no logo at all -- not a smaller one, not a broken one. */
    const hostile = JSON.parse(r.record);
    hostile.logo = "data:image/svg+xml;base64," +
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString("base64");
    hostile.logoRatio = 2;
    await page.evaluate("(localStorage.setItem('tb_docs_v1', " +
        JSON.stringify(JSON.stringify(hostile)) + "), true)");
    await page.navigate(`http://localhost:${PORT}/docs.html`, 1440);

    const h = await page.evaluate(`(async () => {` + GRAB_PDF + `
        if (!await waitForPdfEngine()) { return { error: 'jsPDF never loaded' }; }
        const pdf = grabPdf();
        return {
            onSheet: document.querySelectorAll('.doc-ruled-logo').length,
            bytes: pdf.length,
            layout: document.getElementById('doc-sheet').className
        };
    })()`);

    check("a hostile SVG data URI in storage exports as though there were no logo",
        h && !h.error && h.onSheet === 0 && h.bytes === r.withoutLogoBytes,
        h && h.error ? h.error
            : `${h.onSheet} logo(s) on the sheet and a ${h.bytes}-byte export ` +
              `against the ${r.withoutLogoBytes}-byte no-logo baseline`);

    /* Clear Form sweeps [data-bind] controls. The logo is not one, and a
       field that is not an input is the exact shape of defect js/resume.js
       has been bitten by three separate times. */
    const cleared = await page.evaluate(`(async () => {
        const c = document.createElement('canvas');
        c.width = 120; c.height = 120;
        c.getContext('2d').fillRect(0, 0, 120, 120);
        const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        const dt = new DataTransfer();
        dt.items.add(new File([blob], 'l.png', { type: 'image/png' }));
        const input = document.getElementById('f-logo');
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 400));
        const before = document.querySelectorAll('.doc-ruled-logo').length;

        window.confirm = () => true;
        document.getElementById('clear-doc').click();
        await new Promise(r => setTimeout(r, 200));
        const rec = JSON.parse(localStorage.getItem('tb_docs_v1') || '{}');
        return {
            before: before,
            after: document.querySelectorAll('.doc-ruled-logo').length,
            storedLogo: String(rec.logo || ''),
            removeHidden: document.getElementById('logo-remove').hidden
        };
    })()`);

    check("Clear Form removes the logo along with the typed fields",
        cleared.before === 1 && cleared.after === 0 &&
        cleared.storedLogo === "" && cleared.removeHidden === true,
        `on the sheet before=${cleared.before} after=${cleared.after}, ` +
        `stored logo ${cleared.storedLogo.length} byte(s), ` +
        `Remove button hidden=${cleared.removeHidden}`);

    /* The other side of the cloned-row assertion: the Date input belongs to
       this one document type, and a check that only ever looks at the type
       showing it cannot tell "correctly shown" from "always shown". */
    await open("sales-receipt");
    const other = await page.evaluate(`(() => {
        document.getElementById('add-item').click();
        const rows = [...document.querySelectorAll('#item-list [data-entry]')];
        const field = rows[rows.length - 1]
            .querySelector('[data-entry-field="date"]').closest('[data-for]');
        return {
            layout: document.getElementById('doc-sheet').className,
            hidden: field.hidden,
            display: getComputedStyle(field).display
        };
    })()`);

    check("the Date column's input stays off every other document type",
        other.layout === "doc-sheet is-itemized" && other.hidden === true &&
        other.display === "none",
        `on ${other.layout}: hidden=${other.hidden} display=${other.display}`);

    /* Cleared for the same reason sections 10 and 11 clear: js/app.js builds
       the homepage continue strip from these keys, and section 4 measures
       that homepage. */
    await page.evaluate("localStorage.clear(), sessionStorage.clear(), true");
}

async function parityChecks(browserPath) {
    section("4. Ads blocked: layout identical to the last commit");

    const tmp = tempDir("tb-baseline-");
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
    let skipped = 0;
    /* Same leak as main(): a navigation timeout inside the loop used to skip
       both the browser and the baseline server on port 5098. */
    try {
        for (const [name, urlPath] of PAGES) {
            /* A page added since the last commit has no baseline to be
               identical to, and comparing it against the baseline server's
               404 would report every one of its measurements as a difference
               -- noise that says nothing about whether ads reserve space
               they have not filled. Skip it, loudly, rather than letting a
               new page turn this section red until it is committed. It stops
               being skipped on the next run after the commit, with no edit
               here. */
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
                const now = await page.settled(PARITY_SNAPSHOT, `${name} @${width} working tree`);
                const nowFonts = page.fonts();
                await page.navigate(`http://localhost:${BASELINE_PORT}${urlPath}`, width);
                const head = await page.settled(PARITY_SNAPSHOT, `${name} @${width} HEAD`);
                const headFonts = page.fonts();

                /* Both sides must have been measured in the SAME faces or the
                   comparison is meaningless. Skipping is the honest answer
                   rather than the convenient one: a difference reported here
                   would be a font substitution, not a layout change, and a
                   final section that cries wolf is a section people learn to
                   ignore.

                   It skips only when the two DISAGREE. Both timing out is
                   still comparable -- that is the case the note on awaitFonts
                   describes -- so a font host being unreachable does not
                   silently disable this check, it just measures everything in
                   the fallback. */
                if (nowFonts !== headFonts) {
                    console.log(`      SKIP  ${name} @${width}: fonts were ${nowFonts} for the ` +
                        `working tree and ${headFonts} for HEAD, so the two were measured in ` +
                        "different faces");
                    skipped += 1;
                    continue;
                }
                Object.keys(now).forEach((key) => {
                    comparisons += 1;
                    if (JSON.stringify(now[key]) !== JSON.stringify(head[key])) {
                        differences += 1;
                        console.log(`      ${name} @${width} ${key}: now ${JSON.stringify(now[key])}, HEAD ${JSON.stringify(head[key])}`);
                    }
                });
            }
        }
    } finally {
        page.close();
        server.killTree();
    }

    /* Reported, not hidden. A run that skipped most of its widths has not
       verified much, and the number is the only way to tell that from a run
       that compared everything. */
    check(`ads blocked: working tree matches HEAD (${comparisons} measurements` +
          `${skipped ? `, ${skipped} width(s) skipped on a font mismatch` : ""})`,
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
                throw new Error(`could not start \`npx serve\` on port ${PORT} from the repository root (waited ${SERVER_WAIT_MS / 1000}s)`);
            }
            /* The server was outside the try, so the ONE failure this suite
               actually suffers -- a navigation timeout out of layoutChecks --
               skipped killTree and left `npx serve` holding port 5099. The
               next run then either talked to that stale server from an older
               working tree or timed out against it, so a single flake
               poisoned every run after it until someone noticed by hand.
               That is the compounding half of the nav-timeout report in
               PROJECT_STATUS.md, and it is a leak, not a race. */
            try {
                const page = await connect(browserPath, CDP_PORT);
                try {
                    await layoutChecks(page);
                    await launchChecks(page);
                    await mockupChecks(page);
                    await adminThumbnailChecks(page);
                    await adminPersistenceChecks(page);
                    await exportNameChecks(page);
                    await resumeTemplateChecks(page);
                    await sidebarOverflowNoticeChecks(page);
                    await posterExportChecks(page);
                    await mockupTemplateChecks(page);
                    await ruledInvoiceChecks(page);
                    await anniversaryCalendarChecks(page);
                    await templateStudioChecks(page);
                    await definitionPosterChecks(page);
                    await songPosterChecks(page);
                } finally {
                    page.close();
                }
                if (!NO_BASELINE) { await parityChecks(browserPath); }
            } finally {
                server.killTree();
            }
        }
    }

    await cleanTempDirs();

    console.log(`\n${passed} passed, ${failures.length} failed`);
    if (failures.length) {
        console.log("\nFailures:");
        failures.forEach((f) => console.log("  - " + f.name));
    }
    process.exit(failures.length ? 1 : 0);
}

/* A crash must not leave a browser, a server or a profile directory behind:
   the whole point of the tree-kill above is that the NEXT run starts on a
   quiet machine, and the run most likely to leak is the one that failed. */
main().catch(async (err) => {
    await cleanTempDirs();
    console.error("\n" + err.stack);
    process.exit(1);
});
