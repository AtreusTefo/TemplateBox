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
        poster: "poster.html"
    };

    const DEFAULT_TARGET = "resume";
    const COUNTDOWN_SECONDS = 10;

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
       ---------------------------------------------------------------------- */
    function launchTemplate(targetKey) {
        const safeKey = Object.prototype.hasOwnProperty.call(EDITOR_ROUTES, targetKey)
            ? targetKey
            : DEFAULT_TARGET;
        window.location.href = "loading.html?target=" + encodeURIComponent(safeKey);
    }

    function initCatalog() {
        const grid = document.querySelector("[data-catalog-grid]");
        if (!grid) {
            return;
        }

        /* CTA buttons: route the foreground tab into the loading page. */
        grid.querySelectorAll("[data-target]").forEach((btn) => {
            btn.addEventListener("click", () => {
                launchTemplate(btn.getAttribute("data-target"));
            });
        });

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

        const params = new URLSearchParams(window.location.search);
        const requested = params.get("target") || DEFAULT_TARGET;
        const destination = EDITOR_ROUTES[requested] || EDITOR_ROUTES[DEFAULT_TARGET];

        let remaining = COUNTDOWN_SECONDS;
        counterEl.textContent = String(remaining);

        const clock = window.setInterval(() => {
            remaining -= 1;

            if (remaining <= 0) {
                window.clearInterval(clock);
                counterEl.textContent = "0";
                window.location.href = destination;
                return;
            }

            counterEl.textContent = String(remaining);
        }, 1000);
    }

    /* ----------------------------------------------------------------------
       Mobile editor tabs (shared by resume.html and poster.html).
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
       Boot
       ---------------------------------------------------------------------- */
    document.addEventListener("DOMContentLoaded", () => {
        initCatalog();
        initLoadingPage();
        initEditorTabs();
    });

    /* Public surface consumed by resume.js and poster.js */
    return {
        sanitize,
        desanitize,
        storageSet,
        storageGet,
        launchTemplate
    };
})();
