/* ==========================================================================
   TemplateBox - Shared App Logic
   Scope: input sanitization, safe localStorage access, catalog category
   filtering, monetized launch flow (index -> loading -> editor), and the
   10-second intermediary countdown on loading.html.
   Architecture: 100% client-side. No server calls, no databases, no cookies.
   ========================================================================== */

"use strict";

const TB = (() => {

    /* ----------------------------------------------------------------------
       Editor route whitelist.
       loading.html only ever redirects to a value from this map, so a
       tampered ?target= query string can never become an open redirect.
       ---------------------------------------------------------------------- */
    const EDITOR_ROUTES = {
        resume: "resume.html",
        poster: "poster.html",
        mockup: "mockup.html",
        docs: "docs.html"
    };

    const DEFAULT_TARGET = "resume";
    const COUNTDOWN_SECONDS = 10;

    /* ----------------------------------------------------------------------
       Editor registry.
       One place describing every editor: its route, its display name, and
       the localStorage key its own script writes. Consumed by the loading
       page (to name and preview the chosen template during the wait) and by
       the catalog (to offer returning visitors their saved work). Keeping
       this beside EDITOR_ROUTES means adding an editor touches one region.
       ---------------------------------------------------------------------- */
    const EDITORS = {
        resume: { label: "Resume", storageKey: "tb_resume_v1" },
        docs: { label: "Business Document", storageKey: "tb_docs_v1" },
        poster: { label: "Poster", storageKey: "tb_poster_v1" },
        mockup: { label: "Product Mockup", storageKey: "tb_mockup_v1" }
    };

    /* Display names for the docs.html variants, so a returning visitor is
       told "Rent Receipt" rather than the generic "Business Document".
       Mirrors the variant whitelist docs.js validates against. */
    const DOC_LABELS = {
        "rent-receipt": "Rent Receipt",
        "payment-receipt": "Cash Payment Receipt",
        "business-receipt": "Itemized Business Receipt",
        "sales-receipt": "Sales Receipt Form",
        "invoice": "Invoice",
        "warning-notice": "Employee Warning Notice"
    };

    /* Hand-off slot for editors that open more than one template variant
       (docs.html). The catalog writes the clicked card's variant here and the
       editor reads it once on arrival; the value is never trusted as a route,
       only matched against the editor's own whitelist of variants. */
    const PRESET_KEY = "tb_editor_preset";

    /* ----------------------------------------------------------------------
       Security: input sanitization firewall.
       Escapes markup-significant characters before any string is written to
       localStorage. Rendering additionally uses textContent only, so data
       is neutralized at both the write boundary and the DOM boundary.
       ---------------------------------------------------------------------- */
    function sanitize(value) {
        if (typeof value !== "string") {
            return "";
        }
        return value
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    /* Reverses sanitize() so stored text re-populates form fields verbatim. */
    function desanitize(value) {
        if (typeof value !== "string") {
            return "";
        }
        return value
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, "\"")
            .replace(/&gt;/g, ">")
            .replace(/&lt;/g, "<")
            .replace(/&amp;/g, "&");
    }

    /* ----------------------------------------------------------------------
       Safe localStorage wrappers. Private browsing modes and full quotas
       throw synchronously; the app must keep working without persistence.
       ---------------------------------------------------------------------- */
    function storageSet(key, data) {
        try {
            window.localStorage.setItem(key, JSON.stringify(data));
        } catch (err) {
            /* Persistence unavailable: editing continues in-memory only. */
        }
    }

    function storageGet(key) {
        try {
            const raw = window.localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (err) {
            return null;
        }
    }

    /* ----------------------------------------------------------------------
       Monetized launch flow (fires from catalog card CTA buttons).
       The Adsterra Pop-Under snippet installed in the <head> of index.html
       self-attaches to this same click and spawns its background tab; this
       handler only routes the foreground tab to the intermediary page.

       The navigation is deferred one beat rather than assigned inline:
       when a popup blocker suppresses the Pop-Under's background tab, the
       ad script falls back to redirecting the current tab, and its
       document-level handler runs after this one. Whichever location
       assignment happens last supersedes any still-uncommitted navigation,
       and the ad redirect needs a cross-origin network round-trip to
       commit, so assigning ours after a short delay keeps the foreground
       tab on loading.html.
       ---------------------------------------------------------------------- */
    const LAUNCH_DELAY_MS = 150;

    function launchTemplate(targetKey) {
        const safeKey = Object.prototype.hasOwnProperty.call(EDITOR_ROUTES, targetKey)
            ? targetKey
            : DEFAULT_TARGET;
        window.setTimeout(() => {
            window.location.href = "loading.html?target=" + encodeURIComponent(safeKey);
        }, LAUNCH_DELAY_MS);
    }

    /* Binds any element carrying data-target to the monetized launch flow.
       Every launch control on the site is a real anchor whose href points at
       the editor page itself; this handler intercepts the click and routes
       through loading.html instead. Crawlers, which never run the handler,
       follow the href and so see genuine internal links to the editors,
       which previously had none anywhere on the site.

       Modified clicks (new tab, new window, middle click) are deliberately
       left alone so the browser's own behaviour still works. */
    function bindLaunchControls(root) {
        root.querySelectorAll("[data-target]").forEach((el) => {
            el.addEventListener("click", (event) => {
                if (event.defaultPrevented || event.button > 0 ||
                    event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                    return;
                }
                event.preventDefault();

                const preset = el.getAttribute("data-doc");
                if (preset) {
                    storageSet(PRESET_KEY, preset);
                }
                launchTemplate(el.getAttribute("data-target"));
            });
        });
    }

    function initCatalog() {
        bindLaunchControls(document);

        const grid = document.querySelector("[data-catalog-grid]");
        if (!grid) {
            return;
        }

        /* Category filter pills: plain anchors for crawlers, enhanced with
           lightweight data-attribute visibility toggling for users. */
        const pills = document.querySelectorAll(".filter-pills [data-filter]");
        const cards = grid.querySelectorAll("[data-category]");

        pills.forEach((pill) => {
            pill.addEventListener("click", () => {
                const filter = pill.getAttribute("data-filter");

                pills.forEach((p) => p.classList.toggle("is-active", p === pill));
                cards.forEach((card) => {
                    const match = filter === "all" ||
                        card.getAttribute("data-category") === filter;
                    card.classList.toggle("is-hidden", !match);
                });
            });
        });
    }

    /* ----------------------------------------------------------------------
       Returning-visitor continuation strip.
       Every editor already persists to localStorage, but the catalog had no
       awareness of it, so a visitor coming back to finish a document had to
       re-navigate the catalog and sit through the interstitial with no
       confirmation their work still existed. Rendered only when saved state
       is actually found, so the strip never appears empty.
       ---------------------------------------------------------------------- */
    function describeSavedWork() {
        const found = [];

        Object.keys(EDITORS).forEach((key) => {
            const saved = storageGet(EDITORS[key].storageKey);
            if (!saved || typeof saved !== "object") {
                return;
            }

            /* A record with no meaningful content is not worth offering. */
            const summary = summarizeSaved(key, saved);
            if (!summary) {
                return;
            }

            found.push({ target: key, label: EDITORS[key].label, summary: summary });
        });

        return found;
    }

    /* Produces a short human description of a saved record, or an empty
       string when the record holds nothing the visitor would recognise.

       The shapes differ per editor and are read directly from what each
       editor's own collectState()/persist() writes: resume.js and docs.js
       nest their text under a `fields` object, while poster.js and
       mockup.js persist a flat record. */
    function summarizeSaved(target, saved) {
        if (target === "resume") {
            const fields = saved.fields || {};
            const name = desanitize(String(fields.name || "")).trim();
            const title = desanitize(String(fields.title || "")).trim();
            if (!name && !title) {
                return "";
            }
            return [name, title].filter(Boolean).join(" - ");
        }

        if (target === "docs") {
            const fields = saved.fields || {};
            const type = String(saved.docType || "");
            const label = Object.prototype.hasOwnProperty.call(DOC_LABELS, type)
                ? DOC_LABELS[type]
                : "";
            /* The recipient is the party a visitor recognises the document
               by ("the receipt for Daniel Osei"), so it is preferred over
               the issuer, which is usually their own business name. */
            const party = desanitize(
                String(fields.recipientName || fields.issuerName || "")
            ).trim();
            /* docType is always populated, even on a document the visitor
               has just cleared, so the party name is what distinguishes
               real work from an empty form. Requiring it stops the strip
               offering "Continue: Rent Receipt" on a blank document. */
            if (!party) {
                return "";
            }
            return [label, party].filter(Boolean).join(" - ");
        }

        if (target === "poster") {
            const caption = desanitize(String(saved.caption || "")).trim();
            return caption || "";
        }

        if (target === "mockup") {
            const label = desanitize(String(saved.label || "")).trim();
            const product = String(saved.product || "").trim();
            if (label) {
                return label;
            }
            return product ? "Product: " + product : "";
        }

        return "";
    }

    function initContinueStrip() {
        const mount = document.querySelector("[data-continue-mount]");
        if (!mount) {
            return;
        }

        const saved = describeSavedWork();
        if (!saved.length) {
            return;
        }

        /* Most recently useful first is not knowable without timestamps the
           editors do not write, so the registry order is used and only the
           single most specific record is offered, to keep the strip to one
           clear action rather than a second competing catalog. */
        const item = saved[0];

        const strip = document.createElement("div");
        strip.className = "continue-strip";

        const copy = document.createElement("div");
        copy.className = "continue-copy";

        const label = document.createElement("p");
        label.className = "continue-label";
        label.textContent = "Continue where you left off";

        const title = document.createElement("p");
        title.className = "continue-title";
        title.textContent = item.summary;

        const meta = document.createElement("p");
        meta.className = "continue-meta";
        meta.textContent = item.label + " - saved on this device";

        copy.appendChild(label);
        copy.appendChild(title);
        copy.appendChild(meta);

        const actions = document.createElement("div");
        actions.className = "continue-actions";

        /* Resumes straight into the editor, deliberately bypassing the
           interstitial: this visitor already paid that cost on the first
           visit, and charging it again to reopen their own saved work is
           the fastest way to lose a returning user. */
        const open = document.createElement("a");
        open.className = "btn";
        open.href = EDITOR_ROUTES[item.target];
        open.textContent = "Continue editing";

        const discard = document.createElement("button");
        discard.className = "btn btn-secondary";
        discard.type = "button";
        discard.textContent = "Start fresh";
        discard.addEventListener("click", () => {
            try {
                window.localStorage.removeItem(EDITORS[item.target].storageKey);
            } catch (err) {
                /* Persistence unavailable: nothing to clear. */
            }
            strip.remove();
        });

        actions.appendChild(open);
        actions.appendChild(discard);

        strip.appendChild(copy);
        strip.appendChild(actions);
        mount.appendChild(strip);
    }

    /* ----------------------------------------------------------------------
       Homepage guides strip.
       Surfaces the newest posts from js/blog-data.js on the homepage, which
       previously linked to no blog content at all. Rendered with
       createElement/textContent only, never HTML strings, matching the
       rendering rule the blog library follows.
       ---------------------------------------------------------------------- */
    const GUIDES_ON_HOME = 3;

    function initGuidesStrip() {
        const section = document.querySelector("[data-guides-section]");
        const grid = document.querySelector("[data-guides-grid]");
        if (!section || !grid) {
            return;
        }

        const posts = Array.isArray(window.TB_BLOG_POSTS) ? window.TB_BLOG_POSTS : [];
        if (!posts.length) {
            return;
        }

        const newest = posts
            .slice()
            .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
            .slice(0, GUIDES_ON_HOME);

        newest.forEach((post) => {
            const slug = String(post.slug || "");
            if (!slug) {
                return;
            }

            const card = document.createElement("article");
            card.className = "guide-card";

            if (post.date) {
                const meta = document.createElement("p");
                meta.className = "card-category";
                meta.textContent = formatPostDate(post.date);
                card.appendChild(meta);
            }

            const heading = document.createElement("h3");
            heading.className = "card-title";

            const link = document.createElement("a");
            /* Static post page, not the post.html fallback route: see the
               postUrlFor comment in js/blog.js for why. */
            link.href = "blog/" + encodeURIComponent(slug) + ".html";
            link.textContent = desanitize(String(post.title || "Untitled"));
            heading.appendChild(link);
            card.appendChild(heading);

            if (post.standfirst) {
                const desc = document.createElement("p");
                desc.className = "card-desc";
                desc.textContent = desanitize(String(post.standfirst));
                card.appendChild(desc);
            }

            grid.appendChild(card);
        });

        if (grid.childElementCount) {
            section.hidden = false;
        }
    }

    function formatPostDate(value) {
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
            return String(value);
        }
        return parsed.toLocaleDateString("en-GB", {
            day: "numeric", month: "short", year: "numeric"
        });
    }

    /* ----------------------------------------------------------------------
       Intermediary countdown (loading.html).
       Ticks 10 -> 0, then hands the foreground tab to the whitelisted
       editor route. The Social Bar ad manages its own appearance timing
       independently, so no reveal logic is needed here.
       ---------------------------------------------------------------------- */
    function initLoadingPage() {
        const counterEl = document.getElementById("countdown");
        if (!counterEl) {
            return;
        }

        /* Signal to the dependency-free inline safety net in loading.html
           that this script successfully took over the countdown, so the net
           stays dormant and does not double-drive the redirect. */
        window.__tbLoadingActive = true;

        const params = new URLSearchParams(window.location.search);
        const requested = params.get("target") || DEFAULT_TARGET;
        const destination = EDITOR_ROUTES[requested] || EDITOR_ROUTES[DEFAULT_TARGET];

        /* Name the template the visitor actually chose. Previously the wait
           showed a bare numeral with no confirmation of what was coming, so
           it read as an obstacle rather than as preparation. The label is
           resolved from the same whitelists used for routing, so a tampered
           query value can only ever produce a name that already ships. */
        const nameEl = document.getElementById("loading-template-name");
        if (nameEl) {
            const preset = storageGet(PRESET_KEY);
            const presetLabel = typeof preset === "string" &&
                Object.prototype.hasOwnProperty.call(DOC_LABELS, preset)
                ? DOC_LABELS[preset]
                : "";
            const editorLabel = Object.prototype.hasOwnProperty.call(EDITORS, requested)
                ? EDITORS[requested].label
                : EDITORS[DEFAULT_TARGET].label;
            nameEl.textContent = presetLabel || editorLabel;
        }

        /* Progress bar: a filling indicator is perceived as faster than a
           descending numeral. The numeral is retained beside it as a precise
           readout rather than removed. */
        const progressEl = document.getElementById("progress-fill");
        const progressHost = progressEl ? progressEl.parentElement : null;
        const setProgress = (elapsed) => {
            const pct = Math.min(100, Math.round((elapsed / COUNTDOWN_SECONDS) * 100));
            if (progressEl) {
                progressEl.style.width = pct + "%";
            }
            if (progressHost) {
                progressHost.setAttribute("aria-valuenow", String(pct));
            }
        };

        let remaining = COUNTDOWN_SECONDS;
        counterEl.textContent = String(remaining);
        setProgress(0);

        const clock = window.setInterval(() => {
            remaining -= 1;
            setProgress(COUNTDOWN_SECONDS - remaining);

            if (remaining <= 0) {
                window.clearInterval(clock);
                counterEl.textContent = "0";

                /* Navigation watchdog. A single location assignment can be
                   cancelled or out-raced by navigations the ad scripts on
                   this page start themselves (whichever assignment lands
                   last wins), leaving the countdown stuck at zero. The URL
                   is resolved against the document location so an injected
                   base element cannot repoint the relative editor path, and
                   the assignment is re-issued on a short interval until the
                   page actually unloads, which kills the timer. */
                const editorUrl = new URL(destination, window.location.href).href;
                const go = () => window.location.replace(editorUrl);
                go();
                window.setInterval(go, 700);
                return;
            }

            counterEl.textContent = String(remaining);
        }, 1000);
    }

    /* Reads the one-shot template-variant hand-off written by initCatalog and
       clears it, so a later direct visit to the editor opens the visitor's
       own saved document rather than re-applying a stale card choice. */
    function takePreset() {
        const value = storageGet(PRESET_KEY);
        try {
            window.localStorage.removeItem(PRESET_KEY);
        } catch (err) {
            /* Persistence unavailable: nothing to clear. */
        }
        return typeof value === "string" ? value : "";
    }

    /* ----------------------------------------------------------------------
       Mobile editor tabs (shared by every editor page).
       Below the 48rem breakpoint the split view collapses and these tabs
       switch between the form pane and the live preview pane.
       ---------------------------------------------------------------------- */
    function initEditorTabs() {
        const layout = document.getElementById("editor-layout");
        const tabEdit = document.getElementById("tab-edit");
        const tabPreview = document.getElementById("tab-preview");
        if (!layout || !tabEdit || !tabPreview) {
            return;
        }

        function setTab(showPreview) {
            layout.classList.toggle("show-preview", showPreview);
            layout.classList.toggle("show-edit", !showPreview);
            tabEdit.classList.toggle("is-active", !showPreview);
            tabPreview.classList.toggle("is-active", showPreview);
            tabEdit.setAttribute("aria-selected", String(!showPreview));
            tabPreview.setAttribute("aria-selected", String(showPreview));
        }

        tabEdit.addEventListener("click", () => setTab(false));
        tabPreview.addEventListener("click", () => setTab(true));
    }

    /* ----------------------------------------------------------------------
       Autosave indicator (shared by every editor).
       Persistence was previously silent, which wastes the trust payoff of a
       product whose whole proposition is "no account, and your work is held
       on your own device". Editors call markSaved() after each write.
       ---------------------------------------------------------------------- */
    const SAVED_LABEL_MS = 1600;
    let saveResetTimer = 0;

    function markSaved(ok) {
        const el = document.getElementById("save-state");
        if (!el) {
            return;
        }

        if (ok === false) {
            el.classList.remove("is-saved");
            el.classList.add("is-unavailable");
            el.textContent = "Not saved on this device";
            return;
        }

        el.classList.remove("is-unavailable");
        el.classList.add("is-saved");
        el.textContent = "Saved on this device";

        window.clearTimeout(saveResetTimer);
        saveResetTimer = window.setTimeout(() => {
            el.classList.remove("is-saved");
            el.textContent = "Saves automatically";
        }, SAVED_LABEL_MS);
    }

    /* True when localStorage is actually writable. Private browsing modes
       and exhausted quotas throw, and an editor that silently discards work
       is worse than one that says so up front. */
    function storageAvailable() {
        try {
            const probe = "tb_probe";
            window.localStorage.setItem(probe, "1");
            window.localStorage.removeItem(probe);
            return true;
        } catch (err) {
            return false;
        }
    }

    function initSaveState() {
        const el = document.getElementById("save-state");
        if (!el) {
            return;
        }
        if (!storageAvailable()) {
            markSaved(false);
            return;
        }
        el.textContent = "Saves automatically";
    }

    /* ----------------------------------------------------------------------
       Boot
       ---------------------------------------------------------------------- */
    /* Each initializer is isolated so a failure in one (for example a DOM
       shape this build did not anticipate) can never prevent the others from
       running. This specifically guarantees the loading-page countdown always
       starts, independent of the catalog and editor-tab wiring. */
    document.addEventListener("DOMContentLoaded", () => {
        [
            initCatalog,
            initLoadingPage,
            initEditorTabs,
            initContinueStrip,
            initGuidesStrip,
            initSaveState
        ].forEach((init) => {
            try {
                init();
            } catch (err) {
                /* Swallow: one broken initializer must not halt the page. */
            }
        });
    });

    /* Public surface consumed by the editor scripts */
    return {
        sanitize,
        desanitize,
        storageSet,
        storageGet,
        takePreset,
        launchTemplate,
        markSaved
    };
})();
