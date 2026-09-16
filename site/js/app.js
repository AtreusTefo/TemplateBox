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
        "logo-invoice": "Editable Invoice with Logo",
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
       Export file names (August 24, 2026).

       Every editor names its download from something the visitor typed, and
       every one of them carried its own copy of this regex chain. Three of
       the four then ignored the name field entirely: typing a document name
       in the bar changed nothing, because the resume exported from the
       person's name field, the business document from its type and
       recipient, and the mockup from a hard-coded literal. Only the poster
       ever used what was typed. One implementation, used by all four.

       desanitize FIRST. The name arrives from state that has been through
       sanitize(), so an apostrophe is "&#39;" by the time it gets here -- and
       stripping punctuation from that leaves the digits behind. "Ada's CV"
       would have exported as "ada39s-cv.pdf".
       ---------------------------------------------------------------------- */
    const MAX_FILE_SLUG = 60;

    function fileSlug(value) {
        return desanitize(String(value || ""))
            .replace(/[^A-Za-z0-9 _-]/g, "")
            .trim()
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-")
            .toLowerCase()
            .slice(0, MAX_FILE_SLUG)
            /* Trimmed again after the cap, or a name cut mid-word at the
               limit can end on a hyphen. */
            .replace(/^-+|-+$/g, "");
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
       Launch flow (fires from catalog card CTAs and every other
       [data-target] control). Routes the visitor to the intermediary page,
       which is where the monetization now lives.

       This used to be considerably more complicated. The navigation was
       deferred 150ms and then re-issued on a 700ms watchdog, because the
       Adsterra Pop-Under attached to the same click and, when a popup
       blocker suppressed its background tab, fell back to redirecting the
       foreground tab out from under us -- last location assignment wins.
       The Pop-Under was removed on August 6, 2026 (it was redirecting
       visitors off-site on ordinary clicks), so nothing competes for the
       navigation any more and the delay was pure latency on every launch.
       Assign it directly.

       If a competing navigation is ever reintroduced, the watchdog pattern
       is still documented in docs/error-fixes/LOADING_REDIRECT_STALL_FIX.md
       and still live on loading.html's countdown, which faces the Social
       Bar rather than the Pop-Under.
       ---------------------------------------------------------------------- */
    function launchTemplate(targetKey) {
        window.location.href = launchUrl(targetKey);
    }

    /* Resolves a target key to its interstitial URL through the route
       whitelist, so a tampered data-target can never become an open
       redirect. Shared by the same-tab and new-tab paths. */
    function launchUrl(targetKey) {
        const safeKey = Object.prototype.hasOwnProperty.call(EDITOR_ROUTES, targetKey)
            ? targetKey
            : DEFAULT_TARGET;
        return "loading.html?target=" + encodeURIComponent(safeKey);
    }

    /* Binds any element carrying data-target to the launch flow.
       Every launch control on the site is a real anchor whose href points at
       the editor page itself; this handler intercepts the click and routes
       through loading.html instead. Crawlers, which never run the handler,
       follow the href and so see genuine internal links to the editors. */
    function bindLaunchControls(root) {
        root.querySelectorAll("[data-target]").forEach((el) => {
            /* Modified clicks (ctrl/cmd/shift, middle button) would otherwise
               follow the href straight to the editor and skip the
               interstitial entirely -- the href points at the editor
               precisely because that is what makes those pages crawlable.
               So intercept those too and open the interstitial in the new
               tab instead. window.open is permitted here because it runs
               inside a real user gesture; it is not a popup a browser
               blocks. The editors keep their crawlable links via the
               footer's Editors column on every page carrying a footer. */
            const openInNewTab = (event) => {
                if (event.defaultPrevented) {
                    return false;
                }
                const modified = event.metaKey || event.ctrlKey ||
                    event.shiftKey || event.altKey || event.button === 1;
                if (!modified) {
                    return false;
                }
                event.preventDefault();

                const preset = el.getAttribute("data-doc");
                if (preset) {
                    storageSet(PRESET_KEY, preset);
                }
                /* noopener: the new tab gets no handle back to this window */
                window.open(launchUrl(el.getAttribute("data-target")), "_blank", "noopener");
                return true;
            };

            /* Middle click fires auxclick, not click, in every current
               browser -- without this the gesture most likely to be used
               for "open in new tab" would still slip past. */
            el.addEventListener("auxclick", openInNewTab);

            el.addEventListener("click", (event) => {
                if (openInNewTab(event)) {
                    return;
                }
                if (event.defaultPrevented || event.button > 0) {
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
           lightweight data-attribute visibility toggling for users.

           Delegated from the window capture phase rather than bound to the
           pill elements. This was originally required: the ad click shield
           in the head of index.html stopped non-launch clicks propagating
           below window, which would have silenced an element-level listener
           here too. The shield went with the Pop-Under on August 6, 2026,
           so capture-phase delegation is no longer necessary -- but it is
           still correct, and rewriting working event wiring to remove a
           constraint that no longer applies buys nothing. Left as is.

           Matched on the attribute alone rather than on a wrapper class.
           The homepage rebuild renamed .filter-pills to .feed-tabs when the
           catalog became a feed, which silently killed filtering here and in
           initSearch(); data-filter is what both actually key on, so a
           future rename of the container cannot repeat that. */
        const pills = document.querySelectorAll("[data-filter]");
        const cards = grid.querySelectorAll("[data-category]");

        const applyFilter = (pill) => {
            const filter = pill.getAttribute("data-filter");

            pills.forEach((p) => p.classList.toggle("is-active", p === pill));
            cards.forEach((card) => {
                const match = filter === "all" ||
                    card.getAttribute("data-category") === filter;
                card.classList.toggle("is-hidden", !match);
            });
        };

        window.addEventListener("click", (event) => {
            const origin = event.target instanceof Element ? event.target : null;
            const pill = origin ? origin.closest("[data-filter]") : null;
            if (pill) {
                applyFilter(pill);
            }
        }, true);
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

        /* A second entry point to the same export the mega-menu offers, and
           it earns its place by WHEN it appears rather than by what it does.
           Nobody goes looking for a backup button; this one is in front of a
           visitor who demonstrably has work to lose, at the moment they are
           being shown it, and beside the control that throws it away.

           The label says "my work" and not "this document" deliberately: the
           strip describes only the single most recent record, but the export
           carries all six keys, and a visitor who read it as "back up this
           poster" would think the rest was not covered. */
        const backup = document.createElement("button");
        backup.className = "btn btn-secondary";
        backup.type = "button";
        backup.textContent = "Back up my work";
        backup.addEventListener("click", () => {
            const result = exportBackup();
            /* The button reports on itself. A download is one of the few
               actions the browser confirms on the page's behalf, so a status
               line here would be a third thing saying the same thing; what it
               cannot report is a refusal, which is the case this covers. */
            backup.disabled = true;
            backup.textContent = result.ok ? "Saved to downloads" : "Nothing to back up";
            window.setTimeout(() => {
                backup.disabled = false;
                backup.textContent = "Back up my work";
            }, 2500);
        });

        const discard = document.createElement("button");
        discard.className = "btn btn-secondary";
        discard.type = "button";
        discard.textContent = "Start fresh";

        /* Delegated from window capture for the same reason as the filter
           pills, and kept for the same reason: originally required by the
           ad click shield, no longer required since it was removed, still
           correct. */
        const onDiscard = (event) => {
            const origin = event.target instanceof Element ? event.target : null;
            if (!origin || (origin !== discard && !discard.contains(origin))) {
                return;
            }
            /* Every key this editor owns, not just the one EDITORS names.
               See discardKeysFor() for what that distinction did and, just as
               importantly, what it did not do. */
            discardKeysFor(item.target).forEach((key) => {
                try {
                    window.localStorage.removeItem(key);
                } catch (err) {
                    /* Persistence unavailable: nothing to clear. Caught per
                       key rather than around the loop, so one key that cannot
                       be removed does not abandon the rest -- a partial
                       discard that stops at the document would leave exactly
                       the photograph this fix exists to remove. */
                }
            });
            strip.remove();
            window.removeEventListener("click", onDiscard, true);
        };
        window.addEventListener("click", onDiscard, true);

        actions.appendChild(open);
        actions.appendChild(backup);
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

    /* One guide card. Extracted from initGuidesStrip when search.html needed
       the same card: the search page lists guides beside templates, and a
       second renderer would be a second place for the URL shape, the date
       format and the description field to be got wrong. Returns null for a
       post with no slug, which has nowhere to link to. */
    function buildGuideCard(post) {
        const slug = String((post && post.slug) || "");
        if (!slug) {
            return null;
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

        /* Field is `description` (see js/blog-data.js and the blog card
           renderer in js/blog.js); there is no `standfirst` on a post,
           so reading one silently dropped every excerpt. */
        if (post.description) {
            const desc = document.createElement("p");
            desc.className = "card-desc";
            desc.textContent = desanitize(String(post.description));
            card.appendChild(desc);
        }

        return card;
    }

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
            const card = buildGuideCard(post);
            if (card) {
                grid.appendChild(card);
            }
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
       Form section navigation.

       A long form pushed the live preview off the screen, so the visitor was
       typing blind into the feature the split view exists for. The preview is
       now sticky (css/style.css) and this adds a jump list so the form itself
       is quicker to move around.

       Deliberately anchors rather than tabs: tabs hide fields, and a visitor
       who never notices a tab exports a document missing that whole section.
       Anchors keep every field present, findable with the browser's own
       search, and reviewable in one pass before export.

       The list is built from the form's own fieldsets, so adding a fieldset
       adds a nav entry with no second place to update. Hidden fieldsets are
       skipped, which is what makes it usable on docs.html, where the visible
       set changes with the document type.
       ---------------------------------------------------------------------- */
    let navObserver = null;

    function slugifyLegend(text, index) {
        const base = String(text).toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
        return "sect-" + (base || String(index));
    }

    /* A fieldset the page has hidden has no layout box. offsetParent is null
       for display:none, which is how docs.html hides the fieldsets that do
       not belong to the selected document type. */
    function isVisible(el) {
        return Boolean(el.offsetParent !== null || el.getClientRects().length);
    }

    function initFormNav() {
        const mount = document.querySelector("[data-form-nav]");
        if (!mount) {
            return;
        }

        const pane = mount.closest(".editor-pane") || document;
        const sections = Array.prototype.slice
            .call(pane.querySelectorAll("fieldset"))
            .filter((fs) => fs.querySelector("legend") && isVisible(fs));

        mount.textContent = "";
        if (navObserver) {
            navObserver.disconnect();
            navObserver = null;
        }

        /* One section is not worth a navigation row */
        if (sections.length < 2) {
            mount.hidden = true;
            return;
        }
        mount.hidden = false;

        const links = [];
        sections.forEach((fs, index) => {
            const legend = fs.querySelector("legend");
            const label = (legend.textContent || "").trim();
            if (!fs.id) {
                fs.id = slugifyLegend(label, index);
            }

            const link = document.createElement("a");
            link.href = "#" + fs.id;
            link.textContent = label;
            link.addEventListener("click", (event) => {
                /* Handled here so the section lands under the sticky header
                   rather than behind it, and so the URL is not littered with
                   fragments the visitor did not choose to bookmark. */
                event.preventDefault();
                fs.scrollIntoView({ behavior: "smooth", block: "start" });
                const firstField = fs.querySelector("input, textarea, select");
                if (firstField) {
                    firstField.focus({ preventScroll: true });
                }
            });
            mount.appendChild(link);
            links.push({ link: link, section: fs });
        });

        highlightOnScroll(links);
    }

    /* Marks the section currently in view. IntersectionObserver rather than a
       scroll handler so this costs nothing while the visitor is typing. */
    function highlightOnScroll(links) {
        if (typeof window.IntersectionObserver !== "function") {
            return;
        }

        const bySection = new Map();
        links.forEach((entry) => bySection.set(entry.section, entry.link));

        navObserver = new window.IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }
                links.forEach((item) => item.link.classList.remove("is-current"));
                const active = bySection.get(entry.target);
                if (active) {
                    active.classList.add("is-current");
                }
            });
        }, {
            /* Fires when a section reaches the band just below the sticky
               header, rather than when it merely touches the viewport edge */
            rootMargin: "-10% 0px -70% 0px",
            threshold: 0
        });

        links.forEach((entry) => navObserver.observe(entry.section));
    }

    /* ----------------------------------------------------------------------
       Theme toggle (August 11, 2026).

       The theme is already applied by the time this runs: every page carries a
       tiny inline script in <head> that reads the same localStorage key and
       writes data-theme onto <html> before first paint, so a returning visitor
       never sees a flash of the wrong theme. This function only wires up the
       button and keeps its accessible name truthful.

       THEME_KEY is duplicated in that inline snippet by necessity -- the
       snippet has to run before any external file loads, so it cannot import
       from here. Both spellings are asserted identical by
       tests/verify-layout.js, which is the guard against them drifting.

       Storage is wrapped because a visitor with cookies and site data blocked
       throws on localStorage access; the toggle still works for the session.
       ---------------------------------------------------------------------- */
    const THEME_KEY = "tb_theme";

    /* ----------------------------------------------------------------------
       Browser/app chrome colour.

       Only visible once installed: it tints the Android status bar, the task
       switcher card and the desktop PWA title bar. In a tab it does nothing,
       which is why it has never been here before.

       The markup ships two media-scoped <meta name="theme-color"> tags so the
       colour is right before any script runs, for the visitor who has not
       overridden their system theme -- which is most of them. This function
       exists for the one who has: data-theme is the truth, prefers-color-
       scheme is only a default, and a visitor reading light on a dark machine
       would otherwise get a near-black status bar over a cream page.

       It writes the same value into EVERY theme-color tag rather than
       removing the media attributes. A browser picks the first tag whose
       media query matches, so making them all agree is correct whichever one
       that turns out to be, and does not depend on their order.
       ---------------------------------------------------------------------- */
    const THEME_COLORS = { light: "#F4F3EF", dark: "#14130F" };

    function syncThemeColor() {
        const dark = document.documentElement.getAttribute("data-theme") === "dark";
        const color = dark ? THEME_COLORS.dark : THEME_COLORS.light;
        document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
            meta.setAttribute("content", color);
        });
    }

    function initThemeColor() {
        syncThemeColor();
    }

    function initThemeToggle() {
        const button = document.querySelector("[data-theme-toggle]");
        if (!button) {
            return;
        }

        const root = document.documentElement;

        /* The button names the ACTION, not the current state, which is what a
           screen reader user needs in order to know what pressing it does. */
        function label() {
            const dark = root.getAttribute("data-theme") === "dark";
            const text = dark ? "Switch to light theme" : "Switch to dark theme";
            button.setAttribute("aria-label", text);
            button.setAttribute("title", text);
        }

        label();

        button.addEventListener("click", () => {
            const dark = root.getAttribute("data-theme") !== "dark";
            /* Always write an explicit value, never remove the attribute: an
               absent attribute means "follow the OS", so a visitor choosing
               light on a dark-set machine would be overruled on next load. */
            root.setAttribute("data-theme", dark ? "dark" : "light");
            try {
                window.localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
            } catch (err) {
                /* Storage unavailable: the choice holds for this page only. */
            }
            label();
            /* After the attribute is set, not before: syncThemeColor reads
               data-theme rather than being told what to use, so there is one
               source of truth for which theme is active. */
            syncThemeColor();
        });
    }

    /* ----------------------------------------------------------------------
       Scroll direction (August 10, 2026).

       ONE utility for every element that hides on scroll-down, rather than a
       copy per element: this only decides which way the page is moving and
       writes a single class onto <body>. Which elements react, and at which
       widths, is entirely a CSS question -- today that is the homepage
       category tabs at every width and the homepage header below 48rem.

       Three deliberate details:

         - The listener is passive, so it can never block scrolling, and the
           work is deferred to one requestAnimationFrame per frame through a
           flag. Reading scrollY inside the rAF rather than the event also
           keeps the read out of the scroll handler's critical path.
         - JITTER ignores sub-pixel and rubber-band noise that would otherwise
           flip the class back and forth while the page is effectively still.
         - REVEAL_ABOVE keeps everything visible near the top of the document,
           so a short scroll on a nearly-unscrolled page does not hide the
           navigation the visitor is still looking at.

       The hidden state is a transform in CSS, never display:none, so it
       animates and so the sticky elements keep their boxes -- index.html's
       ad-rail inset depends on .site-header staying in normal flow.
       ---------------------------------------------------------------------- */
    function initScrollDirection() {
        const JITTER = 6;
        const REVEAL_ABOVE = 80;
        let lastY = Math.max(0, window.pageYOffset || 0);
        let queued = false;

        function update() {
            queued = false;
            const y = Math.max(0, window.pageYOffset || 0);
            if (Math.abs(y - lastY) < JITTER) {
                return;
            }
            document.body.classList.toggle(
                "is-nav-hidden",
                y > lastY && y > REVEAL_ABOVE
            );
            lastY = y;
        }

        window.addEventListener("scroll", () => {
            if (!queued) {
                queued = true;
                window.requestAnimationFrame(update);
            }
        }, { passive: true });
    }

    /* ----------------------------------------------------------------------
       Publish the site header's real height as --header-h on <html>.

       Nothing here knows about any element that consumes it, exactly as
       initScrollDirection() knows nothing about who reacts to .is-nav-hidden:
       this writes one custom property and CSS decides what to do with it.

       It exists because .site-header's height is not a function of viewport
       width. It is flex-wrap: wrap carrying a wordmark, a search box and five
       nav controls, so its height depends on how those wrap: measured, 85px
       from 600px up, 145px from 360px to 480px, and 201px at 320px. Every
       sticky offset calibrated to sit "just under the header" was therefore a
       literal that was correct on desktop and wrong on every phone -- the
       category tabs' 76px put the entire tab row inside the header's box,
       where the header painted straight over it.

       ResizeObserver rather than a resize listener: the height changes when
       the header's CONTENTS rewrap, which a viewport resize is only one cause
       of (web fonts landing and the search box appearing at 62rem are two
       others, and neither fires a resize event).
       ---------------------------------------------------------------------- */
    function initHeaderHeight() {
        const header = document.querySelector(".site-header");
        if (!header) {
            return;
        }

        function publish() {
            /* Rounded up: a fractional height would leave a sub-pixel seam of
               page showing between the header's bottom edge and whatever sits
               under it, which reads as a flicker while scrolling. */
            const h = Math.ceil(header.getBoundingClientRect().height);
            if (h > 0) {
                document.documentElement.style.setProperty("--header-h", h + "px");
            }
        }

        publish();

        if (typeof ResizeObserver === "function") {
            new ResizeObserver(publish).observe(header);
        } else {
            /* No ResizeObserver: the CSS fallbacks still hold, and a resize
               listener recovers the common case of an orientation change. */
            window.addEventListener("resize", publish, { passive: true });
        }
    }

    /* ----------------------------------------------------------------------
       Header hamburger (August 18, 2026; the search half was removed on
       August 24, 2026).

       Five controls in the bar wrapped onto a second row on a phone, making
       the sticky header tall enough to cost a real share of a small
       viewport. Below 74.9375rem -- every width under the ad rail's floor,
       so phones and tablets alike -- the primary links collapse behind a
       hamburger sitting beside the wordmark.

       This function used to own a second toggle as well: below 62rem, where
       the search field is display:none, a button set a `search-open` class
       that was supposed to reveal the field as its own row. It only ever
       worked at 360px and below, because the one rule that undid the
       display:none was scoped to a 22.5rem media query -- so from 361px to
       992px the button toggled a class that changed nothing at all. The
       button is a link to search.html now, which is a page rather than a
       reveal, and every trace of the class it toggled is gone from here and
       from the stylesheet. See
       docs/error-fixes/HEADER_SEARCH_BUTTON_DEAD_ON_PHONES_AND_TABLETS.md.

       Everything about the collapsed/expanded LAYOUT is CSS. This only owns
       the open/closed state and the accessibility plumbing, so a page whose
       header does not carry the button (the editor pages, whose .site-nav is
       empty) needs no special case: the query simply misses.
       ---------------------------------------------------------------------- */
    function initHeaderToggles() {
        const header = document.querySelector(".site-header");
        if (!header) {
            return;
        }
        const navToggle = header.querySelector("[data-nav-toggle]");
        const nav = document.getElementById("site-nav");

        /* Mirrors the stylesheet's collapse range exactly, so the two cannot
           disagree about when the bar is collapsed. 74.9375rem is the width
           just below the ad rail's 75rem floor -- the same seam the site
           anchor stops at, and this project's own boundary for "not a
           desktop". */
        const collapsed = window.matchMedia("(max-width: 74.9375rem)");

        function setNav(open) {
            header.classList.toggle("nav-open", open);
            if (navToggle) {
                navToggle.setAttribute("aria-expanded", String(open));
                navToggle.setAttribute(
                    "aria-label",
                    open ? "Close navigation menu" : "Open navigation menu"
                );
            }
            /* Collapsing the bar hides .nav-more outright, so a mega-menu
               left open would keep aria-expanded="true" on a control that is
               no longer rendered, and would reappear already expanded the
               next time the hamburger is opened. */
            if (!open) {
                const morePanel = header.querySelector("[data-nav-more-panel]");
                const moreToggle = header.querySelector("[data-nav-more-toggle]");
                if (morePanel && !morePanel.hidden) {
                    morePanel.hidden = true;
                    if (moreToggle) {
                        moreToggle.setAttribute("aria-expanded", "false");
                    }
                }
            }
        }

        if (navToggle && nav) {
            navToggle.addEventListener("click", () => {
                setNav(!header.classList.contains("nav-open"));
            });

            /* A tap on any link navigates, but an in-page hash link does
                 not, and leaving the panel open over the destination is
                 disorienting. Closing on any link covers both. */
            nav.addEventListener("click", (event) => {
                const link = event.target instanceof Element
                    ? event.target.closest("a")
                    : null;
                if (link) {
                    setNav(false);
                }
            });
        }

        /* Escape closes the menu and returns focus to its trigger, or a
           keyboard user who opened it has no way back out. */
        header.addEventListener("keydown", (event) => {
            if (event.key !== "Escape") {
                return;
            }
            if (header.classList.contains("nav-open")) {
                setNav(false);
                if (navToggle) {
                    navToggle.focus();
                }
            }
        });

        /* Widening past the breakpoint restores the inline bar, and a state
           class left behind would keep .site-nav a full-width column on a
           desktop. Cleared on the transition rather than on every resize. */
        function onBreakpoint(event) {
            if (!event.matches) {
                setNav(false);
            }
        }
        if (typeof collapsed.addEventListener === "function") {
            collapsed.addEventListener("change", onBreakpoint);
        } else if (typeof collapsed.addListener === "function") {
            /* Safari before 14. */
            collapsed.addListener(onBreakpoint);
        }
    }

    /* ----------------------------------------------------------------------
       Header mega-menu.

       Originally homepage-only, because the homepage was the one page with
       no footer and the landing and legal pages would otherwise have been
       unreachable from it. As of August 13, 2026 NO page has a footer --
       the link columns moved into this panel site-wide -- so this is now
       the primary navigation surface on every page, at every width.

       That "at every width" matters: the panel used to be hidden below
       62rem on the grounds that the footer covered the same links on small
       screens. With no footer left, hiding it would strand the legal pages
       on phones, so the CSS restyles the panel for narrow viewports instead
       of hiding the control. Nothing here changes by width; the behaviour
       is entirely CSS.
       ---------------------------------------------------------------------- */
    function initNavMore() {
        const root = document.querySelector("[data-nav-more]");
        if (!root) {
            return;
        }
        const toggle = root.querySelector("[data-nav-more-toggle]");
        const panel = root.querySelector("[data-nav-more-panel]");
        if (!toggle || !panel) {
            return;
        }

        function setOpen(open) {
            panel.hidden = !open;
            toggle.setAttribute("aria-expanded", String(open));
        }

        toggle.addEventListener("click", (event) => {
            event.preventDefault();
            setOpen(panel.hidden);
        });

        /* Close on outside click. Capture phase for the same reason the
           filter pills use it -- consistent with the rest of this file. */
        window.addEventListener("click", (event) => {
            if (panel.hidden) {
                return;
            }
            const origin = event.target instanceof Element ? event.target : null;
            if (!origin || !root.contains(origin)) {
                setOpen(false);
            }
        }, true);

        /* Escape closes and returns focus to the trigger, or a keyboard user
           who opened the panel has no way back out of it. */
        root.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && !panel.hidden) {
                setOpen(false);
                toggle.focus();
            }
        });

        /* Tabbing past the last link closes it rather than leaving an open
           panel floating over the page. */
        panel.addEventListener("focusout", () => {
            window.setTimeout(() => {
                if (!panel.contains(document.activeElement) &&
                    document.activeElement !== toggle) {
                    setOpen(false);
                }
            }, 0);
        });
    }

    /* ----------------------------------------------------------------------
       Catalog search.

       Filters the cards already on the page rather than navigating to a
       results page: there is no server to query and every template is
       already here, so a results page would send the visitor to where they
       already are.

       Searches the card's own visible text (category, title, description),
       so it stays correct automatically when a card is added or reworded --
       there is no keyword list to maintain alongside the markup.
       ---------------------------------------------------------------------- */
    function initSearch() {
        const wrap = document.querySelector("[data-search]");
        const input = document.querySelector("[data-search-input]");
        const grid = document.querySelector("[data-catalog-grid]");
        if (!wrap || !input || !grid) {
            return;
        }

        const clear = wrap.querySelector("[data-search-clear]");
        const empty = document.querySelector("[data-catalog-empty]");
        const pills = document.querySelectorAll("[data-filter]");
        const cards = Array.prototype.slice.call(grid.querySelectorAll("[data-category]"));

        /* Indexed once. The preview miniatures are aria-hidden decorative
           sample text ("Daniel Osei", "$1,250.00") and must not be
           searchable, or a search for a sample name would match. */
        const index = cards.map((card) => {
            const body = card.querySelector(".card-body");
            return {
                card: card,
                text: (body ? body.textContent : "").toLowerCase().replace(/\s+/g, " ")
            };
        });

        function apply(rawQuery) {
            const query = String(rawQuery || "").trim().toLowerCase();
            wrap.classList.toggle("has-value", query.length > 0);

            if (!query) {
                index.forEach((entry) => entry.card.classList.remove("is-hidden"));
                if (empty) {
                    empty.hidden = true;
                }
                return;
            }

            /* Every whitespace-separated term must appear somewhere in the
               card, so "rent receipt" narrows rather than widening the way
               an OR match would. */
            const terms = query.split(/\s+/);
            let shown = 0;

            index.forEach((entry) => {
                const match = terms.every((term) => entry.text.indexOf(term) !== -1);
                entry.card.classList.toggle("is-hidden", !match);
                if (match) {
                    shown += 1;
                }
            });

            if (empty) {
                empty.hidden = shown > 0;
            }

            /* A live search and a category pill filtering the same cards
               would fight each other, so searching resets the pills to All. */
            pills.forEach((p) => p.classList.toggle("is-active",
                p.getAttribute("data-filter") === "all"));
        }

        input.addEventListener("input", () => apply(input.value));

        input.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                input.value = "";
                apply("");
            }
        });

        if (clear) {
            clear.addEventListener("click", () => {
                input.value = "";
                apply("");
                input.focus();
            });
        }

        /* Clicking a category pill abandons the search, for the same reason
           the search resets the pills. */
        pills.forEach((pill) => {
            pill.addEventListener("click", () => {
                if (input.value) {
                    input.value = "";
                    wrap.classList.remove("has-value");
                    if (empty) {
                        empty.hidden = true;
                    }
                }
            });
        });
    }

    /* ----------------------------------------------------------------------
       Autosave indicator (shared by every editor).
       Persistence was previously silent, which wastes the trust payoff of a
       product whose whole proposition is "no account, and your work is held
       on your own device". Editors call markSaved() after each write.
       ---------------------------------------------------------------------- */
    const SAVED_LABEL_MS = 1600;
    let saveResetTimer = 0;

    /* Writes the state text. Editors that show the indicator as prose get it
       as the element's own text, exactly as before. poster.html shows it as a
       cloud-and-tick icon instead, so it supplies a [data-save-label] child
       and the words go there -- visually hidden, still read by assistive
       technology, and mirrored into the title attribute so hovering the icon
       reveals them. Writing textContent on the element itself in that case
       would delete the icon's SVG, which is exactly what this indirection
       exists to prevent. */
    function setSaveText(el, text) {
        const label = el.querySelector("[data-save-label]");
        if (label) {
            label.textContent = text;
        } else {
            el.textContent = text;
        }
        el.setAttribute("title", text);
    }

    function markSaved(ok) {
        const el = document.getElementById("save-state");
        if (!el) {
            return;
        }

        if (ok === false) {
            el.classList.remove("is-saved");
            el.classList.add("is-unavailable");
            setSaveText(el, "Not saved on this device");
            return;
        }

        el.classList.remove("is-unavailable");
        el.classList.add("is-saved");
        setSaveText(el, "Saved on this device");

        window.clearTimeout(saveResetTimer);
        saveResetTimer = window.setTimeout(() => {
            el.classList.remove("is-saved");
            setSaveText(el, "Saves automatically");
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
        setSaveText(el, "Saves automatically");
    }

    /* ======================================================================
       Backup and restore of saved work.

       Every document on this site lives in localStorage and nowhere else.
       There is no account and no server copy, so the browser clearing its
       storage, a visitor switching device, or iOS keeping SEPARATE storage
       for Safari and the installed app all mean the same thing: the work is
       gone, with nothing to restore it from. This is the only thing that
       fixes any of those, and the iOS split in particular has no other fix.

       It lives in app.js rather than in a js/backup.js of its own for a
       reason worth stating: a new file needs a <script> tag on 26 pages, and
       a per-page script tag is precisely the drift surface this project keeps
       being bitten by. Everything here needs sanitize(), storageGet/Set() and
       describeSavedWork(), all of which are already in this closure.

       Full write-up: docs/implementation/BACKUP_AND_RESTORE.md
       ====================================================================== */

    const BACKUP_FORMAT = "templatebox-backup";
    const BACKUP_VERSION = 1;

    /* EVERY KEY THAT HOLDS A VISITOR'S WORK, and the reason this list is not
       derived from EDITORS above.

       EDITORS names four storage keys, one per editor, and a backup built
       from it would look complete and be wrong: the resume editor writes
       THREE keys, not one. The photograph is under its own key because
       storageSet swallows a quota failure by design, and a photograph in the
       document record would take the whole document down with it (see
       PHOTO_KEY in js/resume.js). The chosen template is separate because it
       is the fallback for a visitor who has no document yet.

       So a naive backup over EDITORS restores a resume with no photograph, in
       the Classic layout, and says it succeeded. Nothing would have reported
       that -- which is why tests/verify-layout.js reads the editors' own key
       constants and fails if any of them is missing from this list.

       Deliberately NOT here: tb_theme and tb_editor_preset are device
       settings rather than work, and restoring a backup should not reach over
       and change the theme someone is reading in; tb_probe is a storage
       probe; the tb_admin_* keys belong to the private authoring tool and are
       not a visitor's documents. */
    /* `target` names the editor a key belongs to, matching the EDITORS keys
       above. It is here so that "Start fresh" can clear everything an editor
       owns instead of the one key EDITORS names -- see discardKeysFor() and
       docs/error-fixes/START_FRESH_LEFT_THE_PHOTOGRAPH_BEHIND.md.

       `preference` marks a key that survives being discarded. Only one does,
       and the reason is written on the key itself: js/resume.js describes
       TEMPLATE_KEY as "consulted only when there is no document yet". The
       state immediately after Start fresh IS "no document yet", so clearing
       it would make the key do nothing in the one situation it exists for,
       and the visitor would silently lose a layout they chose. A blank
       document in your chosen template is what "start fresh" means; being
       returned to Classic is the app forgetting something. The PHOTOGRAPH is
       not a preference -- it is personal content attached to the document --
       and it goes. */
    const BACKUP_KEYS = [
        { key: "tb_resume_v1", label: "Resume", kind: "record", target: "resume" },
        { key: "tb_resume_photo_v1", label: "Resume photograph", kind: "photo",
            target: "resume" },
        { key: "tb_resume_template", label: "Resume template", kind: "id",
            target: "resume", preference: true },
        { key: "tb_docs_v1", label: "Business document", kind: "record", target: "docs" },
        { key: "tb_poster_v1", label: "Poster", kind: "record", target: "poster" },
        { key: "tb_mockup_v1", label: "Product mockup", kind: "record", target: "mockup" }
    ];

    /* Everything "Start fresh" must remove for one editor.

       Derived from BACKUP_KEYS rather than from EDITORS, because EDITORS maps
       an editor to exactly ONE key and the resume editor writes three. The
       handler used to read EDITORS[target].storageKey, so discarding a resume
       cleared the document and left the photograph in storage.

       BE ACCURATE ABOUT WHAT THAT DID AND DID NOT CAUSE. It did NOT put the
       old photograph back on screen. js/resume.js already gates on exactly
       this -- `keepPhoto = hasSaved && validPhoto(...)` -- and where a
       photograph outlives its document it is not merely ignored but actively
       cleared, with the reasoning written beside it: "somebody's face on a
       document that is not theirs". That guard was there first, it works, and
       it stays. This was investigated as a leak and is not one; see
       docs/error-fixes/START_FRESH_DID_NOT_CLEAR_EVERY_KEY.md before filing
       it again.

       What was actually wrong is smaller and still worth fixing: the
       photograph sat in storage from the moment the visitor asked for it to
       go until the next time they happened to open resume.html -- which,
       having just discarded their resume, they may never do. "Start fresh"
       should delete what it says it deletes when it is asked, not leave it
       for a later page load to tidy up, and on a shared device that is a real
       difference. It also means no-leak correctness stops depending on one
       gate in one editor continuing to exist.

       One list for "every key this editor owns", used by both the thing that
       copies them and the thing that deletes them, is what stops those two
       disagreeing at all. An editor gaining a fourth key should not require
       anyone to remember this call site. */
    function discardKeysFor(target) {
        return BACKUP_KEYS
            .filter((entry) => entry.target === target && !entry.preference)
            .map((entry) => entry.key);
    }

    /* ----------------------------------------------------------------------
       The trust boundary.

       A restore takes a file off the visitor's disk and writes it into the
       exact place the editors read from, which SKIPS every check the editors
       apply to typed input: collectState() sanitizes on the way in, and a
       restored record never passes through it. So the file is untrusted, the
       same way the stored invoice logo already is, and everything below is
       about making a hand-edited or hostile file harmless rather than about
       re-implementing each editor's schema.

       The boundary this draws, stated plainly so it can be argued with:

         - no string reaches storage in an unescaped form
         - nothing that will be used as an image source reaches storage
           unless it is a base64 raster, so a data:image/svg+xml carrying a
           script cannot be restored
         - nothing that will be used as a fill style or an SVG fill attribute
           reaches storage unless it is a six-digit hex
         - no object can pollute a prototype, recurse without bound, or grow
           without bound

       What it deliberately does NOT do is check that a resume record has the
       fields a resume has. The editors already re-validate their own shapes
       on read -- migrate() in poster.js, readStoredPhoto() in resume.js,
       DEFAULT_STATE merges, bounded numbers -- and duplicating that here
       would be a second copy of four schemas that would rot within a month.
       A structurally valid file with nonsense in it produces an empty-looking
       editor, not a broken one.
       ---------------------------------------------------------------------- */

    const CLEAN_MAX_DEPTH = 8;
    const CLEAN_MAX_ARRAY = 500;
    const CLEAN_MAX_KEYS = 200;
    const CLEAN_MAX_TEXT = 100000;

    /* 8MB. localStorage is about 5MB in every browser that matters, so a file
       larger than this could not be restored even if every byte were valid,
       and reading it would only be a way to be handed an arbitrary amount of
       memory by a file picker. */
    const BACKUP_MAX_BYTES = 8 * 1024 * 1024;

    /* The same shape docs.js already enforces on the stored logo. png|jpeg
       covers everything this site can legitimately produce: the invoice logo
       is read from the visitor's device and re-encoded, and the resume
       photograph is always canvas.toDataURL("image/jpeg") -- never the raw
       upload -- so no valid photograph is lost to this. */
    const IMAGE_URI = /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+=*$/;
    const HEX_COLOUR = /^#[0-9A-Fa-f]{6}$/;
    const SLUG_ID = /^[A-Za-z0-9_-]{1,64}$/;

    /* A key that matches SAFE_KEY can still be __proto__, which assignment
       treats as the prototype setter rather than as a property. JSON.parse
       itself is safe -- it defines an own property -- but the copy this
       walker makes is not, so the name has to be refused by name. */
    const SAFE_KEY = /^[A-Za-z0-9_-]{1,64}$/;
    const UNSAFE_KEYS = ["__proto__", "constructor", "prototype"];

    /* Matched on the field NAME rather than on the value, deliberately. A
       value that merely looks like a data URI is not the test that matters:
       what matters is where the editors USE it, and these are the names they
       read an image from (docs.js `logo`, resume.js's photo record `src`).

       `photo` was here too, defensively, and the suite rejected it: resume.js
       collects state.photo but persistAndRender deletes it from the copy it
       writes, so that name is in no stored record and a guard for it guards
       nothing. The limit of that check is worth knowing -- it catches a name
       here that no editor persists, but it cannot catch an editor persisting
       a NEW image field that nobody added here, because "this string will be
       used as an image" is not visible in the source. Adding an image to a
       stored record means adding its field name here by hand. */
    const IMAGE_FIELDS = ["logo", "src"];

    /* Likewise by name: these reach ctx.fillStyle and a fill="..." attribute
       in an exported SVG. js/color-picker.js records why a COLOUR needed a
       sanitiser at all, and the path that matters there is this one --
       storage -- because it has no <input type="color"> in front of it to
       coerce a hostile value to #000000 first. */
    const COLOUR_FIELDS = ["accent", "bg", "customHex", "heartColour"];

    function isImageField(name) {
        return IMAGE_FIELDS.indexOf(name) !== -1;
    }

    function isColourField(name) {
        return COLOUR_FIELDS.indexOf(name) !== -1;
    }

    /* Re-escapes rather than escaping. Values in storage are ALREADY
       sanitized, so running sanitize() over one directly would double-escape
       it -- an apostrophe saved as "&#39;" would come back as "&amp;#39;" and
       the visitor would find their name spelled in entities. desanitize first
       and the pair is idempotent for a well-formed value, while a raw "<"
       from a hand-edited file still comes out escaped. Same ordering trap
       fileSlug() documents above. */
    function cleanText(value) {
        if (typeof value !== "string") {
            return "";
        }
        return sanitize(desanitize(value.slice(0, CLEAN_MAX_TEXT)));
    }

    function cleanImage(value) {
        return typeof value === "string" && IMAGE_URI.test(value) ? value : "";
    }

    /* null is a legitimate value here and not a rejection: js/mockup.js uses
       it for a transparent background. An unrecognised colour becomes null
       too, which leaves the editor to apply its own default rather than
       painting with something unvetted. */
    function cleanColour(value) {
        if (value === null || value === "") {
            return value;
        }
        return typeof value === "string" && HEX_COLOUR.test(value) ? value : null;
    }

    function cleanId(value) {
        return typeof value === "string" && SLUG_ID.test(value) ? value : "";
    }

    function cleanValue(value, name, depth) {
        if (value === null) {
            return null;
        }
        if (typeof value === "boolean") {
            return value;
        }
        if (typeof value === "number") {
            /* JSON has no NaN or Infinity, but a number that arrives as one
               through any other route would reach arithmetic in four editors
               and produce NaN co-ordinates rather than an error. */
            return Number.isFinite(value) ? value : 0;
        }
        if (typeof value === "string") {
            if (isImageField(name)) {
                return cleanImage(value);
            }
            if (isColourField(name)) {
                return cleanColour(value);
            }
            return cleanText(value);
        }
        if (depth >= CLEAN_MAX_DEPTH) {
            return null;
        }
        if (Array.isArray(value)) {
            return value.slice(0, CLEAN_MAX_ARRAY)
                .map((item) => cleanValue(item, name, depth + 1));
        }
        if (typeof value === "object") {
            const out = {};
            Object.keys(value).slice(0, CLEAN_MAX_KEYS).forEach((key) => {
                if (!SAFE_KEY.test(key) || UNSAFE_KEYS.indexOf(key) !== -1) {
                    return;
                }
                out[key] = cleanValue(value[key], key, depth + 1);
            });
            return out;
        }
        /* Unreachable from JSON.parse, which produces nothing else. Kept so
           the function is total for any caller. */
        return null;
    }

    /* One stored key, cleaned according to what that key actually holds.
       Returns undefined when there is nothing worth restoring, which is how
       the caller tells "absent" from "present and empty". */
    function cleanRecord(kind, value) {
        if (kind === "id") {
            const id = cleanId(value);
            return id || undefined;
        }
        if (kind === "photo") {
            /* Three legitimate shapes. A bare string is a document from
               before framing existed -- readStoredPhoto() in js/resume.js
               still reads one -- so refusing it here would quietly drop the
               photograph of exactly the oldest documents. */
            if (typeof value === "string") {
                const src = cleanImage(value);
                return src || undefined;
            }
            if (!value || typeof value !== "object") {
                return undefined;
            }
            const src = cleanImage(value.src);
            if (!src) {
                return undefined;
            }
            return {
                src: src,
                zoom: Math.max(1, Number(value.zoom) || 1),
                x: Number.isFinite(Number(value.x)) ? Number(value.x) : 0,
                y: Number.isFinite(Number(value.y)) ? Number(value.y) : 0
            };
        }
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            return undefined;
        }
        return cleanValue(value, "", 0);
    }

    /* ----------------------------------------------------------------------
       Export
       ---------------------------------------------------------------------- */

    function collectBackup() {
        const data = {};
        let found = 0;

        BACKUP_KEYS.forEach((entry) => {
            const value = storageGet(entry.key);
            /* storageGet returns null both for an absent key and for one
               holding "null". Either way there is nothing to carry. */
            if (value === null || value === undefined || value === "") {
                return;
            }
            data[entry.key] = value;
            found += 1;
        });

        if (!found) {
            return null;
        }

        return {
            format: BACKUP_FORMAT,
            version: BACKUP_VERSION,
            created: new Date().toISOString(),
            data: data
        };
    }

    function backupFileName() {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        return "templatebox-backup-" + now.getFullYear() + "-" +
            pad(now.getMonth() + 1) + "-" + pad(now.getDate()) + ".json";
    }

    function exportBackup() {
        const payload = collectBackup();
        if (!payload) {
            return { ok: false,
                message: "There is nothing saved on this device yet." };
        }

        try {
            const blob = new Blob([JSON.stringify(payload, null, 2)],
                { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = backupFileName();
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 5000);
        } catch (err) {
            return { ok: false,
                message: "That file could not be created. Try again." };
        }

        const count = Object.keys(payload.data).length;
        return { ok: true,
            message: "Saved " + count + " item" + (count === 1 ? "" : "s") +
                " to your downloads. Keep the file somewhere you can find it." };
    }

    /* ----------------------------------------------------------------------
       Import
       ---------------------------------------------------------------------- */

    function applyBackup(text) {
        let parsed = null;
        try {
            parsed = JSON.parse(text);
        } catch (err) {
            return { ok: false,
                message: "That file is not a TemplateBox backup." };
        }

        /* The format marker earns its place here: without it, any JSON file a
           visitor happened to pick would be walked, produce zero recognised
           keys, and report "nothing to restore" -- which reads as "my backup
           was empty" rather than "that was the wrong file". */
        if (!parsed || typeof parsed !== "object" ||
                parsed.format !== BACKUP_FORMAT ||
                !parsed.data || typeof parsed.data !== "object") {
            return { ok: false,
                message: "That file is not a TemplateBox backup." };
        }

        const cleaned = [];
        BACKUP_KEYS.forEach((entry) => {
            if (!Object.prototype.hasOwnProperty.call(parsed.data, entry.key)) {
                return;
            }
            const value = cleanRecord(entry.kind, parsed.data[entry.key]);
            if (value === undefined) {
                return;
            }
            cleaned.push({ entry: entry, value: value });
        });

        if (!cleaned.length) {
            return { ok: false,
                message: "That backup holds nothing this version can restore." };
        }

        /* Everything is cleaned BEFORE anything is written. A file that is
           half valid must not leave storage half replaced -- the visitor
           would have lost the documents it overwrote and not gained the ones
           it could not. */
        let written = 0;
        cleaned.forEach((item) => {
            storageSet(item.entry.key, item.value);
            written += 1;
        });

        return {
            ok: true,
            written: written,
            labels: cleaned.map((item) => item.entry.label),
            message: "Restored " + written + " item" + (written === 1 ? "" : "s") +
                ". Reloading..."
        };
    }

    function importBackupFile(file, done) {
        if (!file) {
            done({ ok: false, message: "No file chosen." });
            return;
        }
        if (file.size > BACKUP_MAX_BYTES) {
            done({ ok: false,
                message: "That file is too large to be a backup." });
            return;
        }

        const reader = new FileReader();
        reader.addEventListener("load", () => {
            done(applyBackup(String(reader.result || "")));
        });
        reader.addEventListener("error", () => {
            done({ ok: false, message: "That file could not be read." });
        });
        reader.readAsText(file);
    }

    /* ----------------------------------------------------------------------
       Controls.

       Built in JavaScript and appended to the mega-menu panel, rather than
       shipped in the markup of 26 pages.

       This looks like it contradicts the panel's own rule -- its links are
       real anchors in the served markup, on purpose, so they stay crawlable
       -- but that rule is about LINKS. These are buttons and a file input:
       there is nothing for a crawler to follow, no destination to pass rank
       to, and no value in a search engine seeing them. Shipping them in the
       markup would buy nothing and would put the same block on 26 pages plus
       admin.js's generated post head, which is the drift this project
       already documents twice.

       On every page rather than only the homepage, and that is the point of
       putting them here: RESTORE MATTERS MOST WHERE THERE IS NOTHING SAVED.
       A visitor opening the installed app on a new phone has an empty
       continuation strip and no other route back to their own documents.
       ---------------------------------------------------------------------- */

    function buildBackupControls(host, compact) {
        const wrap = document.createElement("div");
        wrap.className = compact ? "editor-backup" : "nav-more-tools";

        /* No heading in the editor bar. The bar is a row of controls beside
           the save cloud, not a panel section, and a second-level heading
           inside it would be both visually wrong and a stray <h2> in a
           document that already has its own heading hierarchy. */
        if (!compact) {
            const heading = document.createElement("h2");
            heading.textContent = "Your work";
            wrap.appendChild(heading);
        }

        const row = document.createElement("div");
        row.className = "nav-more-tools-row";

        const save = document.createElement("button");
        save.type = "button";
        save.className = "btn btn-secondary";
        /* Shorter in the editor bar, where the surrounding controls are
           one or two words and the row has to survive 320px. The menu has
           room for the sentence and needs it, because nothing around it
           says what "Back up" would apply to. */
        save.textContent = compact ? "Back up" : "Back up my work";

        const restore = document.createElement("button");
        restore.type = "button";
        restore.className = "btn btn-secondary";
        restore.textContent = compact ? "Restore" : "Restore a backup";
        if (compact) {
            /* Tagged for the stylesheet. The whole row is hidden below
               48rem now rather than this button alone -- see the rule in
               css/style.css for the three header measurements that
               decided it -- but the class stays, because "which of these
               is the secondary action" is a fact about the row and not
               about the breakpoint that currently acts on it. */
            restore.classList.add("editor-backup-restore");
        }

        /* Not hidden with CSS: a display:none input cannot be opened by a
           programmatic click in every browser, and `hidden` plus an off-flow
           position is the combination that works without the control ever
           being reachable by tab. */
        const picker = document.createElement("input");
        picker.type = "file";
        picker.accept = "application/json,.json";
        picker.hidden = true;

        const status = document.createElement("p");
        status.className = compact ? "editor-backup-status" : "nav-more-tools-status";
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");

        const report = (result) => {
            status.textContent = result.message;
            status.classList.toggle("is-warn", !result.ok);
        };

        save.addEventListener("click", () => {
            report(exportBackup());
        });

        restore.addEventListener("click", () => {
            /* Cleared before opening, not after: a file input fires `change`
               only when the SELECTION changes, so picking the same file twice
               in a row would be silently ignored the second time. The same
               defect was fixed in the poster editor's photo uploads on
               September 14, 2026 -- worth not reintroducing here. */
            picker.value = "";
            picker.click();
        });

        picker.addEventListener("change", () => {
            const file = picker.files && picker.files[0];
            if (!file) {
                return;
            }

            /* A restore overwrites without an undo, so it asks first -- but
               only when there is something to lose. On the device this
               feature exists for, a new phone with an empty store, there is
               nothing to warn about and a confirm would be noise. */
            const existing = describeSavedWork();
            if (existing.length &&
                    !window.confirm("Restoring replaces the work already saved " +
                        "on this device. This cannot be undone. Continue?")) {
                report({ ok: false, message: "Restore cancelled. Nothing changed." });
                return;
            }

            status.textContent = "Reading...";
            status.classList.remove("is-warn");

            importBackupFile(file, (result) => {
                report(result);
                if (result.ok) {
                    /* The editors read their keys once, at init. A reload is
                       what makes a restore visible, and doing it here means no
                       page has to know that its storage changed underneath it. */
                    window.setTimeout(() => window.location.reload(), 600);
                }
            });
        });

        row.appendChild(save);
        row.appendChild(restore);
        wrap.appendChild(row);
        wrap.appendChild(status);
        wrap.appendChild(picker);

        if (compact) {
            /* Appended to the editor bar rather than inserted first: the save
               cloud reads as the status of what is already there, and putting
               a button in front of it would separate it from the document it
               describes. The bar has no overflow problem to avoid. */
            host.appendChild(wrap);
            return;
        }

        /* FIRST in the panel, and this is a correctness fix rather than a
           matter of emphasis.

           Appended, these controls were measured at y=1105 in a 900px-tall
           viewport and could not be reached at all: the panel is 1256px tall
           at 1440x900 with no max-height and no internal scroll, and because
           .site-header is sticky the panel is pinned -- scrolling the page
           moves the document underneath it and leaves the panel's own foot
           exactly where it was. A control nobody can reach is worse than no
           control, because the menu claims to offer it.

           That overflow is NOT introduced here: the social row was already
           below the fold at the same size, and the panel measured 1145px
           without this row. It is a pre-existing consequence of folding the
           footer into the menu, it belongs to the panel rather than to this
           feature, and it is filed separately. Putting this row at the top is
           what keeps this feature out of the dead zone; it does not fix the
           dead zone. */
        panel.insertBefore(wrap, panel.firstChild);
    }

    /* A flag rather than a "has the row already been built" DOM lookup, and
       the reason is a check rather than a preference. Section 1d of the suite
       asserts that every hook this file LOOKS UP exists in the served markup,
       which is what catches a hook renamed in HTML and not in JS. A class
       this file creates itself has no markup to be found in, so looking for
       it would have meant either shipping a dead class on 26 pages or
       exempting the selector -- and an exemption list is how that check stops
       being worth running. Nothing is looked up, so nothing is claimed.

       Worth knowing if this comment is ever rewritten: that scan reads the
       raw source, comments included, so spelling the lookup out here in full
       fails the check on the strength of the comment alone. It did. */
    let backupControlsBuilt = false;

    function initBackupControls() {
        if (backupControlsBuilt || !storageAvailable()) {
            /* No persistence means there is nothing to back up and nowhere to
               restore to. Offering either would be a control that cannot work. */
            return;
        }
        backupControlsBuilt = true;

        const panels = document.querySelectorAll("[data-nav-more-panel]");
        if (panels.length) {
            panels.forEach((panel) => {
                buildBackupControls(panel);
            });
            return;
        }

        /* Fallback host, and it is not hypothetical: resume.html and docs.html
           carry no mega-menu panel at all. That contradicts what this
           project's own notes claim about every public page having one, it
           predates this feature, and without a fallback the backup controls
           would be missing from the resume editor -- the page whose documents
           live longest and whose photograph is the thing most at risk.

           .editor-actions is the right neighbour rather than merely an
           available one: it holds the "Saves automatically" cloud, so it is
           already where the page talks about persistence.

           Only where there is no panel, so poster.html and mockup.html keep
           the menu route and nobody gets the same control twice. */
        document.querySelectorAll(".editor-actions").forEach((bar) => {
            buildBackupControls(bar, true);
        });
    }

    /* ----------------------------------------------------------------------
       Installed-app support (Tier 0 PWA).

       Two unrelated jobs that happen to share a trigger, kept in one
       initializer because both must wait for the same moment:

         1. Register sw.js. The worker is a pass-through that caches one file
            (see its own header for why it must stay that way). Registering it
            is what makes Chrome offer "Install"; without it the manifest
            alone produces a bookmark with an icon.

         2. Ask the browser to stop evicting our storage. Every document on
            this site lives in localStorage and nowhere else, in a bucket the
            browser is free to clear under space pressure. There is no server
            copy to restore from -- losing it is losing the document.

       Full reasoning: docs/implementation/PWA_INSTALLABLE_APP.md
       ---------------------------------------------------------------------- */

    /* True when the page is running as an installed app rather than in a
       browser tab. Both spellings are needed: display-mode is the standard
       and covers Android and desktop, navigator.standalone is the only signal
       iOS gives for a home-screen launch. */
    function isInstalledApp() {
        try {
            if (window.matchMedia("(display-mode: standalone)").matches) {
                return true;
            }
        } catch (err) {
            /* matchMedia unavailable: fall through to the iOS check. */
        }
        return window.navigator.standalone === true;
    }

    /* Asks for persistent storage, but NOT on every visit.

       Firefox shows a permission prompt for this. Putting a storage
       permission dialog in front of a first-time visitor who has not typed
       anything yet is the worst possible moment to ask: there is nothing to
       protect, so the request is unexplained, and a "no" is remembered.

       So it is asked only when the answer has a reason the visitor could
       infer -- they have saved work on this device, or they have installed
       the app and eviction is now the difference between their documents
       being there and not. Chrome grants or refuses silently on its own
       heuristics, where an installed app is already the strongest signal. */
    function requestPersistentStorage() {
        const storage = window.navigator.storage;
        if (!storage || typeof storage.persist !== "function") {
            return;
        }

        let worthAsking = isInstalledApp();
        if (!worthAsking) {
            try {
                worthAsking = describeSavedWork().length > 0;
            } catch (err) {
                worthAsking = false;
            }
        }
        if (!worthAsking) {
            return;
        }

        /* persisted() first: re-requesting an already-granted permission is a
           no-op on Chrome but re-prompts on some builds, and there is nothing
           to gain from asking twice. */
        Promise.resolve(storage.persisted())
            .then((already) => (already ? null : storage.persist()))
            .catch(() => {
                /* Refused, unsupported, or a private window. Storage still
                   works exactly as it did before; it is simply evictable,
                   which is the status quo this tries to improve on and not a
                   regression if it fails. */
            });
    }

    function initInstallSupport() {
        /* file:// has an opaque origin and cannot register a worker at all.
           Excluded by protocol rather than by catching the rejection, because
           site/tools/ pages are opened from disk deliberately (see
           tools/make-og-cards.js) and should not log a failure every run. */
        if (!/^https?:$/.test(window.location.protocol)) {
            return;
        }
        if (!("serviceWorker" in window.navigator)) {
            requestPersistentStorage();
            return;
        }

        /* Deferred past load, and this is the part that matters on an
           ad-funded site: registration competes for the same connection as
           js/ads.js and the ad network's own scripts. The worker has nothing
           to contribute to the first paint -- it cannot serve this page, and
           it is not needed until the NEXT navigation -- so there is no reason
           for it to be in the way of an impression. */
        const start = () => {
            /* Root-absolute, not relative. A worker's scope cannot rise above
               its own path, so a relative "sw.js" resolved from
               /blog/<slug>.html would look for /blog/sw.js and, even if it
               existed, could only control /blog/. One worker at the root
               controls the whole site, which is what the manifest's scope
               claims. */
            window.navigator.serviceWorker.register("/sw.js", { scope: "/" })
                .catch(() => {
                    /* Blocked by policy, an unsupported build, or a private
                       window. The site is unchanged without it: no offline
                       page and no install prompt, but nothing breaks. */
                });
            requestPersistentStorage();
        };

        if (document.readyState === "complete") {
            start();
        } else {
            window.addEventListener("load", start, { once: true });
        }
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
            initSaveState,
            initFormNav,
            initHeaderToggles,
            initNavMore,
            /* After initNavMore: it appends into the panel that initNavMore
               wires, and the toggle must already be bound or the first open
               would show a panel whose controls are not there yet. */
            initBackupControls,
            initSearch,
            /* Before initScrollDirection: the hide transform reads --header-h,
               so it should be published before anything can hide the header. */
            initHeaderHeight,
            initScrollDirection,
            initThemeToggle,
            /* After initThemeToggle only for readability; it reads the
               attribute the inline <head> script already set, so it does not
               depend on the toggle having been wired. */
            initThemeColor,
            /* Last: it does nothing before window load anyway, and anything
               that can be deferred past the ad scripts should be. */
            initInstallSupport
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
        /* Shared by all four editors so a downloaded file is named the same
           way wherever it came from. */
        fileSlug,
        storageSet,
        storageGet,
        takePreset,
        launchTemplate,
        /* search.html inserts real catalog cards long after initCatalog has
           run its one binding pass, so it has to bind its own subtree or
           every card it shows would bypass loading.html. */
        bindLaunchControls,
        /* Same card, two pages: the homepage guides strip and the search
           page's guide results. */
        buildGuideCard,
        markSaved,
        /* docs.html changes which fieldsets are visible with the document
           type, so it rebuilds the nav after a type change */
        refreshFormNav: initFormNav
    };
})();
