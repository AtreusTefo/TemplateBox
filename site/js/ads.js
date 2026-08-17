/* ==========================================================================
   TemplateBox - Ad Placement Registry and Mounting
   Scope: the single declaration of every Adsterra placement on the site, plus
   the code that renders one into a host element.

   Extracted from js/blog.js once a third page family (the document landing
   pages) needed placements: blog.js is a 790-line content library, and
   loading it on nine marketing pages to fill one banner would have been
   waste, while copying the zone table into a second file is the drift that
   has already caused two defects in this project.

   Dependencies: none. Load this before js/blog.js on pages that use both.

   Page families and how they mount:
     - blog.html / post.html   js/blog.js mounts the top/in-article hosts as
                               it renders; the content rail is static markup
                               and mounts through mountContentAds instead
     - blog/<slug>.html        hosts are in the served markup, auto-mounted
     - *-template.html,        same, auto-mounted
       about/terms/privacy
     - the four editors        same, auto-mounted (rail + mobile anchor)
   Auto-mounting is opt-in through [data-ads-static] on the page's <main>, so
   a page whose renderer does its own mounting can never double-count.
   mountSiteAnchor and mountContentAds are the two exceptions: both run
   unconditionally on every page regardless of that gate, because
   about/terms/privacy and the blog surfaces carry neither a renderer nor
   [data-ads-static] and still need the anchor and the rail to mount.

   Ad policy this file enforces by omission: only passive banner formats live
   here. The Popunder (index.html) and Social Bar (loading.html) are declared
   inline on those two pages and are deliberately absent from every indexable
   content page and from every editor.

   index.html carried no banner at all until August 6, 2026, on the grounds
   that it is the page Google indexes and the first impression for every
   visitor. That was reversed; it now carries a fixed rail on wide viewports
   and a mobile anchor. Only the ban on active formats there survives.
   ========================================================================== */

"use strict";

const TBAds = (() => {

    /* ----------------------------------------------------------------------
       Zone registry. A placement renders only when its key is non-empty; an
       empty key produces no markup at all (zero layout shift), so a new size
       activates by pasting a zone key here -- no page edits required.

       All five zones are provisioned and live (July 18, 2026). The two
       300x250 zones are the same ones serving on loading.html; reusing keys
       across pages is functionally fine per Adsterra, and only separated
       reporting requires a distinct zone (which needs a support ticket for a
       size already in use).
       ---------------------------------------------------------------------- */
    const AD_ZONES = {
        /* 728x90 leaderboard, top of the blog index and post pages (desktop) */
        leaderboard: { key: "7577a9abda8083816fafd71754b18205", width: 728, height: 90 },
        /* 320x50 mobile leaderboard, swapped in under 48rem viewports */
        leaderboardMobile: { key: "101fe70128e51351589ecd23ab2d0e21", width: 320, height: 50 },
        /* 300x250 in-content break: article bodies and landing pages */
        inContent: { key: "4a408738c2170da16b47c5ac05b3780a", width: 300, height: 250 },
        /* 300x250 end-of-article (distinct reporting zone) */
        endOfArticle: { key: "70d844a3963c8415efa49af391c897a0", width: 300, height: 250 },
        /* 160x600 wide skyscraper, desktop rail beside an article */
        skyscraper: { key: "aaa51e997d5bd5badf6557a7773f78a6", width: 160, height: 600 },

        /* Editor rail stack, very wide screens only. Three slots, each with
           its own dedicated key so Adsterra treats them as three separate
           placements rather than one unit repeated -- the same reason
           loading.html carries two distinct 300x250 zones instead of the
           same key twice.

           Requested via support ticket (Aug 3, 2026). The first response
           issued two new zones and, for the third, repeated the existing
           endOfArticle key rather than a fresh one; a follow-up delivered
           the genuinely new third zone below, so all three now report
           independently of each other and of every other 300x250 on the
           site. */
        editorRail1: { key: "3d08daa8e24f9416073d41bb566768bb", width: 300, height: 250 },
        editorRail2: { key: "67fd95399c1261e2f4ffbd1b284dd38d", width: 300, height: 250 },
        editorRail3: { key: "0f6d3819d6704f2c657da28a4e25ae11", width: 300, height: 250 }
    };

    /* Each banner is isolated in its own srcdoc iframe: the Adsterra tag
       communicates through a global `atOptions`, so two tags sharing one page
       context clobber each other's configuration and one slot renders the
       other's size. See docs/error-fixes/ADSTERRA_AD_CONFLICT_FIX.md. */
    function buildBannerFrame(zone) {
        const frame = document.createElement("iframe");
        frame.title = "Advertisement";
        frame.width = String(zone.width);
        frame.height = String(zone.height);
        frame.setAttribute("scrolling", "no");
        frame.style.border = "0";
        frame.style.display = "block";
        /* overflow:hidden on the srcdoc body, not just on the parent .ad-slot.
           A creative that lays out wider or taller than the size it was booked
           at scrolls the IFRAME'S OWN document, and that scrollbar is painted
           inside the frame's box -- the parent's overflow:hidden clips what
           escapes the box, which is a different thing and cannot remove it
           (reported August 16, 2026 as a scrollbar under both loading.html
           banners at laptop widths, where nothing in the surrounding layout
           was squeezing them). scrolling="no" is the deprecated attribute that
           used to do this and is no longer reliably honoured. The srcdoc
           document inherits this page's origin, so its body is ours to style;
           the nested cross-origin frame the ad script then injects is not, but
           it is that outer document's scrollbar that shows. */
        frame.setAttribute("srcdoc",
            "<body style='margin:0;overflow:hidden'>" +
            "<script>atOptions={'key':'" + zone.key + "','format':'iframe'," +
            "'height':" + zone.height + ",'width':" + zone.width + ",'params':{}};<\/script>" +
            "<script src='https://www.highperformanceformat.com/" + zone.key + "/invoke.js'><\/script>" +
            "</body>");
        return frame;
    }

    /* Renders one placement into a host element. Returns false (and leaves
       the host empty and collapsed) when the host is absent or the placement
       has no zone key. */
    function mountPlacement(host, zoneName) {
        const zone = AD_ZONES[zoneName];
        if (!host || !zone || !zone.key) {
            return false;
        }
        const slot = document.createElement("div");
        slot.className = "ad-slot";
        slot.style.width = zone.width + "px";
        slot.style.height = zone.height + "px";
        slot.appendChild(buildBannerFrame(zone));

        const label = document.createElement("p");
        label.className = "ad-label";
        label.textContent = "Advertisement";

        host.textContent = "";
        host.appendChild(label);
        host.appendChild(slot);
        host.classList.add("is-filled");
        return true;
    }

    /* The rail is a column fixed to the right edge of the window, running the
       full height of the viewport, so the page has to make room for it:
       .has-ad-rail puts one padding-right on <body> and everything in normal
       flow -- the sticky header included -- is inset to the left of the
       column. The class is added only when a banner actually filled, the same
       discipline .has-site-anchor and .has-ad-anchor follow, so a dormant or
       blocked zone leaves the page byte-identical to having no placement at
       all. How much width to reserve is a CSS token that tracks the band, so
       this never has to know which unit mounted. */
    function reserveRailWidth(filled) {
        if (filled) {
            document.body.classList.add("has-ad-rail");
        }
        return filled;
    }

    /* Leaderboard host: desktop 728x90 zone with a 320x50 mobile swap.
       Uses matchMedia at mount time (ad tags cannot be live-reflowed after
       injection without double-counting impressions, so the choice is made
       once per page load). */
    function mountLeaderboard(host) {
        if (!host) {
            return false;
        }
        const mobile = window.matchMedia("(max-width: 48rem)").matches;
        const first = mobile ? "leaderboardMobile" : "leaderboard";
        const second = mobile ? "leaderboard" : "leaderboardMobile";
        return mountPlacement(host, first) || mountPlacement(host, second);
    }

    /* In-article break element, built for a renderer to insert into a flow */
    function buildAdBreak(zoneName) {
        const row = document.createElement("div");
        row.className = "ad-break";
        if (!mountPlacement(row, zoneName)) {
            return null;
        }
        return row;
    }

    /* ----------------------------------------------------------------------
       Where the in-content 300x250 goes inside an article body.

       Starts after the second block, so the reader gets an uncluttered
       opening, then slides forward past any position that would separate a
       heading from the text it introduces -- landing between sections rather
       than inside one. Returns -1 when the post is too short to carry a break
       at all, or when sliding forward runs out of body.

       Shared deliberately: post.html renders at runtime and the static pages
       are generated by js/admin.js, and an ad that moves depending on which
       path produced the page would be untestable.
       ---------------------------------------------------------------------- */
    const AD_BREAK_MIN_BLOCKS = 4;
    const AD_BREAK_AFTER = 2;

    function adBreakIndex(nodes) {
        const list = Array.prototype.slice.call(nodes || []);
        if (list.length < AD_BREAK_MIN_BLOCKS) {
            return -1;
        }
        let index = AD_BREAK_AFTER;
        while (index < list.length && /^H[1-6]$/.test(list[index - 1].tagName)) {
            index += 1;
        }
        return index < list.length ? index : -1;
    }

    /* ----------------------------------------------------------------------
       Fills every host present in a page's served markup. Used by the pages
       that have no renderer of their own: generated post pages and the
       document landing pages.
       ---------------------------------------------------------------------- */
    function mountHosts(scope) {
        const root = scope || document;

        mountLeaderboard(root.querySelector("[data-ad-leaderboard]"));
        mountPlacement(root.querySelector("[data-ad-incontent]"), "inContent");
        mountPlacement(root.querySelector("[data-ad-endofarticle]"), "endOfArticle");

        mountEditorAds(root);
        mountHomeAds(root);
    }

    /* ----------------------------------------------------------------------
       Homepage placements (August 6, 2026).

       This reverses a rule that had stood since launch and was recorded as
       non-negotiable: index.html carried zero advertising, on the grounds
       that it is the page Google indexes and the first impression every
       visitor gets. The owner reversed it after the catalog moved to a
       masonry layout that leaves genuine empty margin beside three columns.

       What makes it defensible where the old Pop-Under was not: this is a
       passive banner in the page's own margin. It cannot navigate the tab,
       cannot cover content, and renders nothing at all below 75rem where
       that margin does not exist. The formats that made the homepage
       hostile -- Pop-Under, In-Page Push -- remain banned everywhere.

       Zone note: the rail reuses `skyscraper` and the three `editorRail`
       zones, which also serve the blog rails and the editor rails, so
       homepage impressions blend into those zones' reporting. Dedicated
       zones would need an Adsterra support ticket for sizes already in use;
       worth doing if homepage revenue needs measuring separately.
       ---------------------------------------------------------------------- */
    const HOME_RAIL_MIN = "(min-width: 75rem)";
    const HOME_ANCHOR_MAX = "(max-width: 48rem)";

    /* The editor rail, on the homepage. Same markup, same slots, same three
       zones, and the same .editor-rail CSS rule -- not a copy of it, the same
       selector, so the two cannot drift apart.

       Both bands are the editors' bands, and the 93rem boundary between them
       matters more than the arithmetic suggested. It was briefly dropped
       here, on the reasoning that the feed has no fixed panes to protect and
       three columns of 257px are still perfectly readable at 1200px. That is
       true and beside the point: a 300px stack on a 1366px laptop is as wide
       as a content column, so it stops reading as a rail beside the feed and
       starts reading as a fourth column of adverts. The 160px skyscraper is
       what makes the 75-93rem band look like a side rail at all. Width that
       is merely affordable is not the same as width that looks right.

       The only thing that differs from the editors is the floor: 75rem here
       rather than 84rem, because below 84rem an editor's rail comes straight
       out of its fixed panes while the feed's masonry columns simply reflow.
       ---------------------------------------------------------------------- */
    const HOME_RAIL_STACK_MIN = "(min-width: 93rem)";
    const HOME_RAIL_STACK = ["editorRail1", "editorRail2", "editorRail3"];

    function mountHomeAds(scope) {
        const root = scope || document;
        const rail = root.querySelector("[data-ad-home-rail]");
        const slots = rail
            ? Array.prototype.slice.call(rail.querySelectorAll("[data-ad-rail-slot]"))
            : [];

        if (slots.length && window.matchMedia(HOME_RAIL_STACK_MIN).matches) {
            /* Styling hook only, and currently unstyled -- .editor-rail sets
               it too and no rule reads it on either page. Kept because the
               two rails are meant to stay interchangeable. */
            rail.classList.add("is-stack");
            let filled = false;
            HOME_RAIL_STACK.forEach((zoneName, index) => {
                filled = mountPlacement(slots[index], zoneName) || filled;
            });
            reserveRailWidth(filled);
            return;
        }

        /* Narrower than the stack band: one 160x600 in the first slot, the
           other two left empty and collapsed by .home-rail > div:empty. */
        if (slots.length && window.matchMedia(HOME_RAIL_MIN).matches) {
            reserveRailWidth(mountPlacement(slots[0], "skyscraper"));
            return;
        }

        /* Phones get the same fixed anchor the content pages use. The two
           are mutually exclusive by viewport, so the homepage never shows
           both. .has-site-anchor reserves the space only on a real fill. */
        if (window.matchMedia(HOME_ANCHOR_MAX).matches) {
            const anchor = root.querySelector("[data-ad-home-anchor]");
            if (mountPlacement(anchor, "leaderboardMobile")) {
                document.body.classList.add("has-site-anchor");
            }
        }
    }

    /* ----------------------------------------------------------------------
       Editor placements.

       The editors are the longest sessions on the site -- filling an itemized
       invoice takes minutes, where a catalog visit takes seconds -- so a
       persistent passive banner earns more per session than the interstitial
       does, without interrupting anything. This reverses the earlier
       "editors stay ad-free" decision; see
       docs/implementation/EDITOR_PAGE_AD_PLACEMENT.md for the reasoning and
       what was ruled out.

       Both placements are iframe-isolated like every other banner here, which
       is what keeps the product's central claim honest: the ad script runs
       cross-origin and cannot read the document the visitor is typing into.
       A page-context format (Adsterra's Native Banner) was rejected for
       exactly that reason and must not be used on these pages.
       ---------------------------------------------------------------------- */

    /* Three mutually exclusive viewport bands, one unit each. The boundaries
       are deliberately non-overlapping to the pixel, so no viewport can ever
       mount two placements or none.

       The rail gate is 75rem, matching the homepage exactly (August 13,
       2026, at the owner's instruction, reversing this file's own prior
       84rem gate) -- NOT the mathematically "safe" floor. 84rem was the
       measured break-even where the rail sits in genuinely spare margin: at
       1200px (this new 75rem floor) each pane loses real width against the
       pre-rail 540px, roughly 20-35px depending on how the cap sheds it,
       the same class of cost the original EDITOR_PAGE_AD_PLACEMENT.md
       measured as 68px and rejected. That cost is accepted here, knowingly,
       for parity with the homepage's rail appearing at the same laptop
       widths (1280px MacBook Air was the reported case) rather than staying
       viewport-bound until 1344px. See
       docs/implementation/EDITOR_PAGE_AD_PLACEMENT.md for the original
       84rem reasoning this reverses, and its "Revised" section for this
       change and the exact numbers.

       Between 48rem and 75rem there is no room beside the panes, so that
       band gets a leaderboard above the workspace instead. It scrolls away,
       which is why it is the fallback rather than the primary: the whole
       argument for advertising on editors is session-long visibility. */
    const EDITOR_RAIL_MIN = "(min-width: 75rem)";
    const EDITOR_LEADERBOARD_BAND =
        "(min-width: 48.0625rem) and (max-width: 74.9375rem)";
    const EDITOR_ANCHOR_MAX = "(max-width: 48rem)";

    /* A three-slot 300px rail needs 324px including its gap. Holding the
       editing panes at the 540px they had before any rail existed therefore
       takes 1476px of viewport, so the stack only appears at 93rem and up.
       Between 75rem and 93rem there is room for the 160px skyscraper but not
       for the stack, and that band keeps the single unit. */
    const EDITOR_RAIL_STACK_MIN = "(min-width: 93rem)";
    const EDITOR_RAIL_STACK = ["editorRail1", "editorRail2", "editorRail3"];

    function mountEditorAds(scope) {
        const root = scope || document;

        const rail = root.querySelector("[data-ad-editor-rail]");
        const slots = rail
            ? Array.prototype.slice.call(rail.querySelectorAll("[data-ad-rail-slot]"))
            : [];

        if (slots.length && window.matchMedia(EDITOR_RAIL_STACK_MIN).matches) {
            rail.classList.add("is-stack");
            let filled = false;
            EDITOR_RAIL_STACK.forEach((zoneName, index) => {
                filled = mountPlacement(slots[index], zoneName) || filled;
            });
            reserveRailWidth(filled);
        } else if (slots.length && window.matchMedia(EDITOR_RAIL_MIN).matches) {
            reserveRailWidth(mountPlacement(slots[0], "skyscraper"));
        }

        /* mountPlacement directly rather than mountLeaderboard(): the mobile
           320x50 swap that helper performs is wrong here, because this band
           starts above the mobile breakpoint. */
        if (window.matchMedia(EDITOR_LEADERBOARD_BAND).matches) {
            mountPlacement(root.querySelector("[data-ad-editor-leaderboard]"), "leaderboard");
        }

        /* The anchor is fixed over the foot of the viewport, so the page has
           to make room for it: .has-ad-anchor reserves bottom padding and
           lifts the sticky export bar above it. The class is only added when
           a banner actually filled, so a dormant or blocked zone leaves the
           layout exactly as it was. */
        if (window.matchMedia(EDITOR_ANCHOR_MAX).matches) {
            const anchor = root.querySelector("[data-ad-editor-anchor]");
            if (mountPlacement(anchor, "leaderboardMobile")) {
                document.body.classList.add("has-ad-anchor");
            }
        }
    }

    /* ----------------------------------------------------------------------
       Site-wide anchor: mobile only.

       Originally this mounted at every width -- 320x50 under 48rem, 728x90
       above it, forever. That desktop half is retired (August 13, 2026): a
       persistent bottom bar was a placeholder for the fixed rail this page
       family did not have yet. Now that .content-rail exists (below), the
       anchor's job stops at the mobile breakpoint and the rail takes over
       once there is room for it; between 48rem and the rail's own floor
       neither appears, matching the gap the homepage's own rail has always
       had between its anchor and its rail band. See mountContentAds.

       Deliberately absent from:
         index.html    the page Google indexes and the first impression every
                       visitor gets. That decision predates this and stands.
         admin.html    private authoring tool, never carries ads.
         the editors   they mount their own three-band system, which includes
                       this same anchor below 48rem. Their host attribute is
                       different so the two can never both fire.
         blog.html,    these mount `leaderboard` / `leaderboardMobile` into
         post.html,    their own top host, and the anchor draws from those
         blog/*.html   same two zones -- an anchor here would serve one zone
                       key twice in a single page view, which is not the same
                       thing as reusing a key across different pages. They
                       also already carry four units including the rail.
                       Giving them an anchor needs a dedicated Adsterra zone
                       first (a duplicate size requires a support ticket);
                       see docs/memory/PROJECT_STATUS.md.

       loading.html's history with this anchor is worth knowing before
       touching either. It briefly carried the anchor (August 2026) on the
       reasoning that .has-site-anchor reserves body padding, so the fixed
       bar could not cover anything. That reasoning was wrong: reserving
       body padding at the FOOT of the document only protects the end of it,
       and this page's ad content sits mid-page inside a centred card, so on
       a short viewport the bar sat straight over it while scrolled past --
       nowhere near the document's actual end. It was removed and replaced
       with a [data-ad-content-rail] rail beside the card instead (still
       there, desktop-only, see mountContentAds below).

       That rail itself briefly stayed position:sticky rather than joining
       the fixed .editor-rail/.home-rail/.content-rail family, on reasoning
       that generalised the anchor's lesson too far: it treated any fixed
       placement on this page as unsafe, rather than distinguishing a fixed
       BOTTOM bar (which pins to wherever the visitor has scrolled to, so
       body padding only guarantees clearance at the document's end) from a
       fixed SIDE rail (which reserves its width with body padding for the
       entire page, at every scroll position, not just the end -- there is
       no scroll position where content could occupy that column, because
       the column's width is removed from the page outright rather than
       floated over it). That is the mechanism index.html and the editors
       already relied on safely, and the rail switched to it too (August 16,
       2026) -- see the .loading-rail comment in css/style.css.

       The anchor came back on mobile a second time, once the page's own
       mobile layout was tuned to fit the viewport with zero scrolling (see
       the loading.html-scoped rules under @media (max-width: 48rem) in
       css/style.css). That is what actually fixes the original problem:
       the overlap only ever happened while the ad content was being
       scrolled past a fixed element, and a page that never scrolls has no
       such moment. The anchor is unsafe to add back to ANY page that still
       scrolls its ad content past the viewport foot, regardless of how
       little content remains below it -- verify zero scroll at the
       targeted viewport sizes first, the way loading.html's own
       verification script does, before reusing this reasoning elsewhere.
       ---------------------------------------------------------------------- */
    const SITE_ANCHOR_MOBILE = "(max-width: 48rem)";

    function mountSiteAnchor(scope) {
        const root = scope || document;
        const anchor = root.querySelector("[data-ad-anchor]");
        if (!anchor || !window.matchMedia(SITE_ANCHOR_MOBILE).matches) {
            return false;
        }

        /* .has-site-anchor reserves the space the fixed bar occupies, and is
           only added when a banner actually filled -- a dormant or blocked
           zone leaves the layout untouched. */
        if (mountPlacement(anchor, "leaderboardMobile")) {
            document.body.classList.add("has-site-anchor");
            return true;
        }
        return false;
    }

    /* ----------------------------------------------------------------------
       Content rail (August 13, 2026): the fixed full-height rail carried to
       a third context -- plain single-column pages that are neither a
       two-pane editor nor a masonry feed. Nine landing pages, about, terms,
       privacy, and the three blog surfaces (blog.html, post.html and the
       generated blog/<slug>.html pages) all mount through this one function.
       Same markup, same slots, same zones as mountEditorAds/mountHomeAds --
       deliberately the third page family sharing the pattern, not a fourth
       rail design. It replaces the desktop half of the site-wide anchor on
       these pages, and on the blog surfaces it replaces the older in-flow
       sticky .post-rail/.blog-sidebar single skyscraper, which could not
       have run alongside this without showing two persistent units at once.

       The floor is 75rem, the same as the homepage and (since the same day)
       the editors -- all three rail contexts now appear at identical
       widths, which is the whole point of the number. It was 83.5rem
       first, derived as this family's own break-even: below it the
       reserved column starts eating into `main`'s 72rem cap rather than
       sitting in spare margin (72rem + 11.5rem = 83.5rem exactly). That
       derivation is still correct and 75rem knowingly overrides it, the
       same trade the editors took: between 75rem and 83.5rem a content
       page's text column is narrower than its cap would otherwise allow.
       Prose reflowing narrower is a far cheaper cost than an editor's
       fixed panes losing width, which is why this was the easier of the
       two calls. Below 75rem these pages show the mobile anchor (under
       48rem) or nothing at all (48rem to 75rem), the same shape the
       homepage has always had between its own anchor and rail bands. */
    const CONTENT_RAIL_MIN = "(min-width: 75rem)";
    const CONTENT_RAIL_STACK_MIN = "(min-width: 93rem)";
    const CONTENT_RAIL_STACK = ["editorRail1", "editorRail2", "editorRail3"];

    function mountContentAds(scope) {
        const root = scope || document;
        const rail = root.querySelector("[data-ad-content-rail]");
        const slots = rail
            ? Array.prototype.slice.call(rail.querySelectorAll("[data-ad-rail-slot]"))
            : [];

        if (!slots.length) {
            return false;
        }

        if (window.matchMedia(CONTENT_RAIL_STACK_MIN).matches) {
            rail.classList.add("is-stack");
            let filled = false;
            CONTENT_RAIL_STACK.forEach((zoneName, index) => {
                filled = mountPlacement(slots[index], zoneName) || filled;
            });
            return reserveRailWidth(filled);
        }

        if (window.matchMedia(CONTENT_RAIL_MIN).matches) {
            return reserveRailWidth(mountPlacement(slots[0], "skyscraper"));
        }

        return false;
    }

    /* mountSiteAnchor and mountContentAds both run unconditionally on every
       page load, exactly like each other: each queries its own host and
       no-ops when that host is absent, so it is safe to run on pages that
       carry neither, either, or (never, by construction of the CSS floors)
       both filled at once. Neither depends on [data-ads-static] -- that gate
       is for mountHosts, which pages with their own renderer (blog.html,
       post.html) deliberately skip to control mount timing themselves. */
    document.addEventListener("DOMContentLoaded", () => {
        if (document.querySelector("[data-ads-static]")) {
            mountHosts();
        }
        mountSiteAnchor();
        mountContentAds();
    });

    return {
        AD_ZONES,
        mountPlacement,
        mountLeaderboard,
        buildAdBreak,
        adBreakIndex,
        mountHosts,
        mountEditorAds,
        mountHomeAds,
        mountSiteAnchor,
        mountContentAds
    };
})();
