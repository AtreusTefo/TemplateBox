/* ==========================================================================
   TemplateBox - Search page (search.html)

   Scope: the site's only search RESULTS surface. The homepage field filters
   the cards already on the homepage in place, which is the right behaviour
   there and impossible anywhere else; this page is what the phone and tablet
   search button opens, and what the mockup editor's field submits to.

   Two things it searches that the homepage field cannot: the guides, and the
   catalog from a page that is not the catalog.

   Where the data comes from:

     Templates  fetched from index.html, parsed with DOMParser, and the real
                <article class="template-card"> elements imported into this
                page. NOT a second copy of the catalog. index.html's cards are
                hand-authored markup carrying CSS document miniatures, photo
                thumbnails and the data-target/data-doc launch attributes; a
                registry duplicating them would be a third list to keep in
                step with index.html and with CATALOG_ITEMS in js/admin.js
                (tests/verify-layout.js already cross-checks those two), and
                it would still not reproduce the miniatures. Importing the
                real nodes cannot drift by construction.

     Guides     window.TB_BLOG_POSTS from js/blog-data.js, the same source
                the homepage guides strip reads.

   Rendered with importNode/createElement/textContent only, never an HTML
   string, matching the rule the rest of the site follows.
   ========================================================================== */

"use strict";

(function () {

    /* The four homepage categories, in the order index.html declares them.
       `key` is the card's own data-category attribute -- the same attribute
       the homepage's category tabs key on, so a renamed category shows up
       here as an empty row rather than as silently missing cards. */
    const CATEGORY_ROWS = [
        { key: "documents", label: "Receipts and Invoices" },
        { key: "resumes", label: "Resumes" },
        { key: "canvas", label: "Posters and Prints" },
        { key: "mockups", label: "Product Mockups" }
    ];

    const GUIDES_IN_BROWSE = 6;

    /* Mirrors the maxlength on the field. A query longer than this is a
       paste accident or a probe, never a search for a receipt template. */
    const MAX_QUERY = 80;

    const el = {
        page: document.querySelector("[data-search-page]"),
        input: document.querySelector("[data-search-page-input]"),
        clear: document.querySelector("[data-search-page-clear]"),
        results: document.querySelector("[data-search-page-results]"),
        templateSection: document.querySelector("[data-search-page-template-section]"),
        templates: document.querySelector("[data-search-page-templates]"),
        templateCount: document.querySelector("[data-search-page-template-count]"),
        guideSection: document.querySelector("[data-search-page-guide-section]"),
        guides: document.querySelector("[data-search-page-guides]"),
        guideCount: document.querySelector("[data-search-page-guide-count]"),
        empty: document.querySelector("[data-search-page-empty]"),
        browse: document.querySelector("[data-search-page-browse]"),
        error: document.querySelector("[data-search-page-error]"),
        back: document.querySelector("[data-search-back]")
    };

    if (!el.page || !el.input || !el.results || !el.browse) {
        return;
    }

    /* One entry per card/post in the RESULTS lists. The nodes are built once
       and filtering toggles .is-hidden on them, exactly as the homepage
       filter does: re-cloning on every keystroke would re-run the launch
       binding, re-request the thumbnails and flicker the grid. */
    let templateIndex = [];
    let guideIndex = [];

    /* ----------------------------------------------------------------------
       Query scrubbing.

       The query arrives from ?q=, which is attacker-controlled text, and ends
       up in an input value and in match comparisons. Nothing here is ever
       written as markup, but the project standard is to scrub text parameters
       at the boundary rather than to rely on every later use being careful,
       so the characters that only matter to a parser are dropped outright.
       ---------------------------------------------------------------------- */
    function cleanQuery(value) {
        return String(value || "")
            .replace(/[<>"'`\\]/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, MAX_QUERY);
    }

    function queryFromUrl() {
        try {
            return cleanQuery(new URLSearchParams(window.location.search).get("q"));
        } catch (err) {
            return "";
        }
    }

    /* The address bar follows the field so a result set can be shared or
       reloaded, but with replaceState rather than a navigation: pushing an
       entry per keystroke would make the back button walk the query letter
       by letter. */
    function syncUrl(query) {
        if (!window.history || typeof window.history.replaceState !== "function") {
            return;
        }
        const url = query
            ? "search.html?q=" + encodeURIComponent(query)
            : "search.html";
        try {
            window.history.replaceState(null, "", url);
        } catch (err) {
            /* Some embedded browsers refuse this; the page still works. */
        }
    }

    /* ----------------------------------------------------------------------
       Matching. Every whitespace-separated term must appear, so a second word
       narrows the result set rather than widening it the way an OR match
       would -- the same rule the homepage filter follows.
       ---------------------------------------------------------------------- */
    function matches(entry, terms) {
        return terms.every((term) => entry.text.indexOf(term) !== -1);
    }

    function apply(rawQuery) {
        const query = cleanQuery(rawQuery);
        const field = el.input.closest(".search-page-field");
        if (field) {
            field.classList.toggle("has-value", query.length > 0);
        }

        if (!query) {
            el.results.hidden = true;
            el.browse.hidden = false;
            syncUrl("");
            return;
        }

        const terms = query.toLowerCase().split(" ").filter(Boolean);
        let templatesShown = 0;
        let guidesShown = 0;

        templateIndex.forEach((entry) => {
            const hit = matches(entry, terms);
            entry.node.classList.toggle("is-hidden", !hit);
            if (hit) { templatesShown += 1; }
        });

        guideIndex.forEach((entry) => {
            const hit = matches(entry, terms);
            entry.node.classList.toggle("is-hidden", !hit);
            if (hit) { guidesShown += 1; }
        });

        if (el.templateCount) {
            el.templateCount.textContent = countLabel(templatesShown, "template");
        }
        if (el.guideCount) {
            el.guideCount.textContent = countLabel(guidesShown, "guide");
        }
        if (el.templateSection) {
            el.templateSection.hidden = templatesShown === 0;
        }
        if (el.guideSection) {
            el.guideSection.hidden = guidesShown === 0;
        }
        if (el.empty) {
            el.empty.hidden = (templatesShown + guidesShown) > 0;
        }

        el.results.hidden = false;
        el.browse.hidden = true;
        syncUrl(query);
    }

    function countLabel(count, noun) {
        return count + " " + noun + (count === 1 ? "" : "s");
    }

    /* ----------------------------------------------------------------------
       Catalog intake.
       ---------------------------------------------------------------------- */
    function cardText(card) {
        /* .card-body only. The preview miniatures are aria-hidden decorative
           sample text ("Daniel Osei", "$1,250.00"), so indexing the whole
           card would match a search for a sample name -- the same trap the
           homepage filter documents. */
        const body = card.querySelector(".card-body");
        return (body ? body.textContent : "")
            .toLowerCase().replace(/\s+/g, " ").trim();
    }

    async function loadCatalog() {
        const response = await window.fetch("index.html", { credentials: "same-origin" });
        if (!response.ok) {
            throw new Error("catalog request failed: " + response.status);
        }
        const parsed = new DOMParser().parseFromString(await response.text(), "text/html");
        const cards = parsed.querySelectorAll(".catalog-grid .template-card");
        if (!cards.length) {
            throw new Error("no cards found in index.html");
        }
        return Array.prototype.map.call(cards, (card) => ({
            card: card,
            category: card.getAttribute("data-category") || "",
            text: cardText(card)
        }));
    }

    /* Cards arrive as nodes from ANOTHER document, so each one has to be
       adopted into this one before it can be inserted. importNode(true) does
       that without ever touching innerHTML. */
    function importCard(entry) {
        return document.importNode(entry.card, true);
    }

    function guideText(post) {
        return [post.title, post.description, post.category]
            .map((part) => String(part || ""))
            .join(" ")
            .toLowerCase().replace(/\s+/g, " ").trim();
    }

    function visiblePosts() {
        const posts = Array.isArray(window.TB_BLOG_POSTS) ? window.TB_BLOG_POSTS : [];
        return posts
            .filter((post) => post && post.slug && post.visible !== false)
            .slice()
            .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    }

    /* ----------------------------------------------------------------------
       Browse state: a heading over a horizontally scrollable row per
       category, then the newest guides. What the visitor sees before typing
       anything, so the page is a place to look around rather than an empty
       field.
       ---------------------------------------------------------------------- */
    function browseRow(label, moreHref, moreLabel, gridClass) {
        const section = document.createElement("section");
        section.className = "browse-row";

        const head = document.createElement("div");
        head.className = "section-head";

        const heading = document.createElement("h2");
        heading.className = "section-title";
        heading.textContent = label;
        head.appendChild(heading);

        const more = document.createElement("a");
        more.className = "section-more";
        more.href = moreHref;
        more.textContent = moreLabel;
        head.appendChild(more);

        const scroll = document.createElement("div");
        scroll.className = gridClass + " browse-scroll";

        section.appendChild(head);
        section.appendChild(scroll);
        return { section: section, scroll: scroll };
    }

    function buildBrowse(catalog, posts) {
        CATEGORY_ROWS.forEach((row) => {
            const entries = catalog.filter((entry) => entry.category === row.key);
            if (!entries.length) {
                return;
            }
            /* .catalog-grid rides along with .browse-scroll because nearly
               every card rule is scoped `.catalog-grid .card-*`; the scroller
               only overrides the display. Dropping the class here would strip
               the cards of their own styling. */
            const built = browseRow(row.label, "index.html#templates", "See all", "catalog-grid");
            entries.forEach((entry) => built.scroll.appendChild(importCard(entry)));
            el.browse.appendChild(built.section);
            bindLaunches(built.scroll);
        });

        if (posts.length) {
            const built = browseRow("Guides", "blog.html", "All guides", "");
            posts.slice(0, GUIDES_IN_BROWSE).forEach((post) => {
                const card = TB.buildGuideCard(post);
                if (card) { built.scroll.appendChild(card); }
            });
            el.browse.appendChild(built.section);
        }
    }

    /* ----------------------------------------------------------------------
       The launch flow.

       js/app.js binds every [data-target] control once, inside initCatalog,
       at DOMContentLoaded. Every card on this page is inserted AFTER that has
       run, so without this call their clicks would follow the raw href
       straight into the editor and skip loading.html entirely -- the cards
       would look and feel correct while quietly bypassing the interstitial
       the whole site is funded by.

       js/app.js declares `const TB` at the top level of a classic script, so
       TB is a global LEXICAL binding and not a property of window: a guard
       written `window.TB && ...` is always false and skips this silently.
       Verified the hard way -- with that guard in place a result card
       navigated straight to docs.html instead of loading.html.
       ---------------------------------------------------------------------- */
    function bindLaunches(root) {
        if (typeof TB !== "undefined" && typeof TB.bindLaunchControls === "function") {
            TB.bindLaunchControls(root);
        }
    }

    function fail(err) {
        /* Not "loading" any more, and deliberately not "ready" either: the
           suite waits for not-loading so this reaches the checks that can
           name it, rather than timing out every navigation to this page. */
        setState("error");
        if (el.error) {
            el.error.hidden = false;
        }
        el.browse.hidden = true;
        el.results.hidden = true;
        if (window.console && console.warn) {
            console.warn("TemplateBox search:", err && err.message ? err.message : err);
        }
    }

    /* Machine-readable state, for anything that needs to know this page has
       FINISHED rather than merely stopped moving.

       This page is empty for its first 120-510ms: loadCatalog() fetches the
       whole of index.html (118KB), parses it, and imports 53 cards. Until
       that lands, the document is not busy and not broken -- it is stably,
       convincingly wrong, which no stillness poll can distinguish from being
       done. tests/verify-layout.js section 4 settled on the empty page and
       reported main at 201px against a populated 2179px on a file nobody had
       touched.

       Same shape and same reasoning as js/mockup.js's data-mockup-state, and
       the suite reads both the same way: it waits for NOT-loading rather than
       for ready, so a genuine failure surfaces as an error the checks can name
       instead of expiring as a 20-second navigation timeout. */
    function setState(state) {
        if (el.page) {
            el.page.setAttribute("data-search-state", state);
        }
    }

    async function init() {
        setState("loading");

        const startingQuery = queryFromUrl();
        if (startingQuery) {
            el.input.value = startingQuery;
        }

        let catalog = [];
        try {
            catalog = await loadCatalog();
        } catch (err) {
            fail(err);
            return;
        }

        const posts = visiblePosts();

        catalog.forEach((entry) => {
            const node = importCard(entry);
            node.classList.add("is-hidden");
            el.templates.appendChild(node);
            templateIndex.push({ node: node, text: entry.text });
        });
        bindLaunches(el.templates);

        posts.forEach((post) => {
            const node = TB.buildGuideCard(post);
            if (!node) { return; }
            node.classList.add("is-hidden");
            el.guides.appendChild(node);
            guideIndex.push({ node: node, text: guideText(post) });
        });

        buildBrowse(catalog, posts);

        el.input.addEventListener("input", () => apply(el.input.value));

        el.input.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                el.input.value = "";
                apply("");
            }
        });

        /* The form is a real GET fallback for a browser that reached this
           page before the script ran. Once it has, submitting must filter in
           place rather than reload the page onto itself. */
        const form = el.input.form;
        if (form) {
            form.addEventListener("submit", (event) => {
                event.preventDefault();
                apply(el.input.value);
                el.input.blur();
            });
        }

        if (el.clear) {
            el.clear.addEventListener("click", () => {
                el.input.value = "";
                apply("");
                el.input.focus();
            });
        }

        /* Back. The control is a real <a href="index.html">, so everything
           below is an UPGRADE of a working link and every path out of here
           ends on that href.

           history.back() only where there is genuinely somewhere on this site
           to go back TO. The referrer is the signal: a visitor who tapped
           search on the homepage has a same-origin one and expects to land
           back where they were, mid-scroll, while a bookmarked or shared ?q=
           URL has none -- and one arriving from a search engine has a
           referrer that is not ours, where back would leave the site
           altogether. Both of those follow the href instead.

           Modified and non-left clicks are left completely alone, so
           ctrl/cmd/middle-click still opens the homepage in a new tab. Same
           rule the catalog's own launch handler follows.

           Safe against the address bar only because syncUrl() uses
           replaceState: with pushState this would walk the query back one
           keystroke at a time instead of leaving. */
        if (el.back) {
            el.back.addEventListener("click", (event) => {
                if (event.button !== 0 || event.ctrlKey || event.metaKey ||
                        event.shiftKey || event.altKey) {
                    return;
                }

                let sameSite = false;
                try {
                    sameSite = !!document.referrer &&
                        new URL(document.referrer).origin === window.location.origin;
                } catch (err) {
                    sameSite = false;
                }

                if (sameSite && window.history && window.history.length > 1) {
                    event.preventDefault();
                    window.history.back();
                }
            });
        }

        apply(startingQuery);

        /* Arriving with no query means the visitor came here to type. Arriving
           WITH one means they came to read the results, so stealing focus (and
           on a phone, raising the keyboard over them) would be wrong. */
        if (!startingQuery) {
            try {
                el.input.focus({ preventScroll: true });
            } catch (err) {
                el.input.focus();
            }
        }

        /* Last line of init, AFTER apply() has rendered. Set any earlier and
           the signal would fire on a page that is still empty, which is the
           exact failure it exists to prevent. */
        setState("ready");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
