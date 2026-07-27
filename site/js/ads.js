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
     - blog.html / post.html   js/blog.js mounts as it renders
     - blog/<slug>.html        hosts are in the served markup, auto-mounted
     - *-template.html         same, auto-mounted
   Auto-mounting is opt-in through [data-ads-static] on the page's <main>, so
   a page whose renderer does its own mounting can never double-count.

   Ad policy this file enforces by omission: only passive banner formats live
   here. The Popunder (index.html) and Social Bar (loading.html) are declared
   inline on those two pages and are deliberately absent from every indexable
   content page.
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
        skyscraper: { key: "aaa51e997d5bd5badf6557a7773f78a6", width: 160, height: 600 }
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
        frame.setAttribute("srcdoc",
            "<body style='margin:0'>" +
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

        /* The 160x600 rail only exists on viewports wide enough to hold it
           beside the content column. */
        if (window.matchMedia("(min-width: 70rem)").matches) {
            mountPlacement(root.querySelector("[data-ad-rail]"), "skyscraper");
            mountPlacement(root.querySelector("[data-ad-sidebar]"), "skyscraper");
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        if (document.querySelector("[data-ads-static]")) {
            mountHosts();
        }
    });

    return {
        AD_ZONES,
        mountPlacement,
        mountLeaderboard,
        buildAdBreak,
        adBreakIndex,
        mountHosts
    };
})();
