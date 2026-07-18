/* ==========================================================================
   TemplateBox - Blog Library and Public Page Initializers
   Scope: block-based content model (parse/serialize), XSS-safe DOM
   rendering (textContent only, zero innerHTML), size-aware Adsterra banner
   slot system, blog index (blog.html) and single post (post.html) boot.
   Depends on: js/app.js (TB.sanitize / TB.desanitize / TB.storageGet)
   and js/blog-data.js (window.TB_BLOG_POSTS, the published post array).
   Architecture: 100% client-side. Posts are static data shipped with the
   site; the admin panel (admin.html) edits localStorage drafts and exports
   a replacement js/blog-data.js.
   ========================================================================== */

"use strict";

const TBBlog = (() => {

    /* ----------------------------------------------------------------------
       Ad zone registry. Every blog placement is declared here; a placement
       only renders when its key is non-empty, and an empty key produces no
       markup at all (zero layout shift), so new sizes activate by pasting
       a zone key -- no page edits required.

       All five zones are provisioned and live (July 18, 2026). The two
       300x250 zones are the same ones serving on loading.html; reusing
       keys across pages is functionally fine per Adsterra.
       ---------------------------------------------------------------------- */
    const AD_ZONES = {
        /* 728x90 leaderboard, top of blog index and post pages (desktop) */
        leaderboard: { key: "7577a9abda8083816fafd71754b18205", width: 728, height: 90 },
        /* 320x50 mobile leaderboard, swapped in under 48rem viewports */
        leaderboardMobile: { key: "101fe70128e51351589ecd23ab2d0e21", width: 320, height: 50 },
        /* 300x250 in-content break inside the article body -- live zone */
        inContent: { key: "4a408738c2170da16b47c5ac05b3780a", width: 300, height: 250 },
        /* 300x250 end-of-article -- live zone (distinct reporting zone) */
        endOfArticle: { key: "70d844a3963c8415efa49af391c897a0", width: 300, height: 250 },
        /* 160x600 wide skyscraper, desktop sidebar next to the article */
        skyscraper: { key: "aaa51e997d5bd5badf6557a7773f78a6", width: 160, height: 600 }
    };

    const SITE_ORIGIN = "https://templatebox.win";
    const ADMIN_STORAGE_KEY = "tb_admin_posts";

    /* ----------------------------------------------------------------------
       Source whitelists. Post data is author-controlled, but it round-trips
       through localStorage and an exported file, so URLs are still validated
       before ever being assigned to href/src attributes.
       ---------------------------------------------------------------------- */
    function safeImageSrc(src) {
        if (typeof src !== "string") {
            return "";
        }
        const ok = /^https?:\/\/[^\s"'<>]+$/.test(src) ||
            /^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/i.test(src) ||
            /^assets\/[\w./-]+$/.test(src);
        return ok ? src : "";
    }

    function safeLinkHref(url) {
        if (typeof url !== "string") {
            return "";
        }
        const ok = /^https?:\/\/[^\s"'<>]+$/.test(url) ||
            /^[\w-]+\.html(\?[\w=&%-]*)?(#[\w-]*)?$/.test(url);
        return ok ? url : "";
    }

    /* ----------------------------------------------------------------------
       Content model. A post body is an array of typed blocks:
         { type: "p" | "h2" | "h3" | "quote", text }
         { type: "ul" | "ol", items: [] }
         { type: "img", src, alt }
       The admin panel edits a plain-text markup form of this model:
         ## Heading        -> h2         ### Heading -> h3
         - item / * item   -> ul         1. item     -> ol
         > line            -> quote      [image: URL | alt] -> img
         blank-line-separated text -> p
       Inline inside text blocks: **bold**, *italic*, [label](url).
       ---------------------------------------------------------------------- */
    function parseContent(raw) {
        const blocks = [];
        let para = [];

        function flushPara() {
            if (para.length) {
                blocks.push({ type: "p", text: para.join(" ").trim() });
                para = [];
            }
        }

        function lastBlock() {
            return blocks.length ? blocks[blocks.length - 1] : null;
        }

        String(raw || "").replace(/\r\n/g, "\n").split("\n").forEach((line) => {
            const t = line.trim();

            if (!t) {
                flushPara();
                return;
            }

            const img = t.match(/^\[image:\s*([^\s|\]]+)\s*(?:\|\s*([^\]]+))?\]$/i);
            if (img) {
                flushPara();
                blocks.push({ type: "img", src: img[1], alt: (img[2] || "").trim() });
                return;
            }
            if (t.startsWith("### ")) {
                flushPara();
                blocks.push({ type: "h3", text: t.slice(4).trim() });
                return;
            }
            if (t.startsWith("## ")) {
                flushPara();
                blocks.push({ type: "h2", text: t.slice(3).trim() });
                return;
            }
            if (t.startsWith("> ")) {
                flushPara();
                const prev = lastBlock();
                if (prev && prev.type === "quote") {
                    prev.text += " " + t.slice(2).trim();
                } else {
                    blocks.push({ type: "quote", text: t.slice(2).trim() });
                }
                return;
            }
            if (/^[-*]\s+/.test(t)) {
                flushPara();
                const prev = lastBlock();
                const item = t.replace(/^[-*]\s+/, "").trim();
                if (prev && prev.type === "ul") {
                    prev.items.push(item);
                } else {
                    blocks.push({ type: "ul", items: [item] });
                }
                return;
            }
            if (/^\d+[.)]\s+/.test(t)) {
                flushPara();
                const prev = lastBlock();
                const item = t.replace(/^\d+[.)]\s+/, "").trim();
                if (prev && prev.type === "ol") {
                    prev.items.push(item);
                } else {
                    blocks.push({ type: "ol", items: [item] });
                }
                return;
            }

            para.push(t);
        });

        flushPara();
        return blocks;
    }

    /* Serializes blocks back to the plain-text markup for re-editing.
       Expects already-desanitized text. */
    function blocksToText(blocks) {
        return (blocks || []).map((b) => {
            switch (b.type) {
                case "h2": return "## " + b.text;
                case "h3": return "### " + b.text;
                case "quote": return "> " + b.text;
                case "ul": return b.items.map((i) => "- " + i).join("\n");
                case "ol": return b.items.map((i, n) => (n + 1) + ". " + i).join("\n");
                case "img": return "[image: " + b.src + (b.alt ? " | " + b.alt : "") + "]";
                default: return b.text || "";
            }
        }).join("\n\n");
    }

    /* ----------------------------------------------------------------------
       Rendering. Everything goes through createElement + textContent; no
       string of post data is ever handed to innerHTML.
       ---------------------------------------------------------------------- */
    const INLINE_PATTERN = /\[([^\]]+)\]\(([^\s)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/;

    function renderInline(parent, rawText) {
        let rest = TB.desanitize(String(rawText || ""));
        while (rest) {
            const m = rest.match(INLINE_PATTERN);
            if (!m) {
                parent.appendChild(document.createTextNode(rest));
                break;
            }
            if (m.index > 0) {
                parent.appendChild(document.createTextNode(rest.slice(0, m.index)));
            }
            if (m[1] !== undefined) {
                const href = safeLinkHref(m[2]);
                if (href) {
                    const a = document.createElement("a");
                    a.href = href;
                    if (/^https?:\/\//.test(href) && href.indexOf(SITE_ORIGIN) !== 0) {
                        a.rel = "noopener";
                        a.target = "_blank";
                    }
                    a.textContent = m[1];
                    parent.appendChild(a);
                } else {
                    parent.appendChild(document.createTextNode(m[1]));
                }
            } else if (m[3] !== undefined) {
                const strong = document.createElement("strong");
                strong.textContent = m[3];
                parent.appendChild(strong);
            } else {
                const em = document.createElement("em");
                em.textContent = m[4];
                parent.appendChild(em);
            }
            rest = rest.slice(m.index + m[0].length);
        }
    }

    function renderBlocks(container, blocks) {
        container.textContent = "";
        (blocks || []).forEach((b) => {
            let el;
            switch (b.type) {
                case "h2":
                case "h3":
                    el = document.createElement(b.type);
                    renderInline(el, b.text);
                    break;
                case "quote":
                    el = document.createElement("blockquote");
                    renderInline(el, b.text);
                    break;
                case "ul":
                case "ol":
                    el = document.createElement(b.type);
                    (b.items || []).forEach((item) => {
                        const li = document.createElement("li");
                        renderInline(li, item);
                        el.appendChild(li);
                    });
                    break;
                case "img": {
                    const src = safeImageSrc(b.src);
                    if (!src) {
                        return;
                    }
                    el = document.createElement("figure");
                    el.className = "post-figure";
                    const imgEl = document.createElement("img");
                    imgEl.src = src;
                    imgEl.alt = TB.desanitize(b.alt || "");
                    imgEl.loading = "lazy";
                    el.appendChild(imgEl);
                    if (b.alt) {
                        const cap = document.createElement("figcaption");
                        cap.textContent = TB.desanitize(b.alt);
                        el.appendChild(cap);
                    }
                    break;
                }
                default:
                    el = document.createElement("p");
                    renderInline(el, b.text);
            }
            container.appendChild(el);
        });
    }

    /* ----------------------------------------------------------------------
       Ad slot construction. Identical isolation strategy to loading.html:
       each Adsterra tag runs inside its own srcdoc iframe so multiple
       banner instances on one page cannot clobber each other's global
       atOptions object.
       ---------------------------------------------------------------------- */
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
       the host empty and collapsed) when the placement has no zone key. */
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

    /* In-article break used inside the post body flow */
    function buildAdBreak(zoneName) {
        const row = document.createElement("div");
        row.className = "ad-break";
        if (!mountPlacement(row, zoneName)) {
            return null;
        }
        return row;
    }

    /* ----------------------------------------------------------------------
       Data access
       ---------------------------------------------------------------------- */
    function getLivePosts() {
        return Array.isArray(window.TB_BLOG_POSTS) ? window.TB_BLOG_POSTS : [];
    }

    function getVisiblePosts() {
        return getLivePosts()
            .filter((p) => p && p.visible !== false && p.slug && p.title)
            .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    }

    function getAdminPosts() {
        const stored = TB.storageGet(ADMIN_STORAGE_KEY);
        return Array.isArray(stored) ? stored : [];
    }

    function formatDate(iso) {
        const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) {
            return "";
        }
        const months = ["January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"];
        return months[Number(m[2]) - 1] + " " + Number(m[3]) + ", " + m[1];
    }

    /* ----------------------------------------------------------------------
       Blog index page (blog.html)
       Layout: a large featured card for the most recent post, a list of
       the remaining posts underneath, and a sticky ad rail alongside both
       -- the featured/latest-articles/sidebar arrangement common to
       editorial blogs. The sidebar only appears when its zone key is set
       and the viewport is wide enough to hold a 160px rail comfortably.
       ---------------------------------------------------------------------- */
    function buildCoverEl(post, postUrl) {
        const coverLink = document.createElement("a");
        coverLink.className = "blog-card-cover";
        coverLink.href = postUrl;
        coverLink.setAttribute("aria-hidden", "true");
        coverLink.tabIndex = -1;
        const coverSrc = safeImageSrc(post.cover || "");
        if (coverSrc) {
            const img = document.createElement("img");
            img.src = coverSrc;
            img.alt = "";
            img.loading = "lazy";
            coverLink.appendChild(img);
        } else {
            const mock = document.createElement("span");
            mock.className = "blog-card-mock";
            mock.textContent = "TemplateBox";
            coverLink.appendChild(mock);
        }
        return coverLink;
    }

    function buildMetaLine(post) {
        const meta = document.createElement("p");
        meta.className = "card-category";
        meta.textContent = [TB.desanitize(post.category || "Article"), formatDate(post.date)]
            .filter(Boolean).join(" · ");
        return meta;
    }

    function buildFeaturedCard(post) {
        const postUrl = "post.html?slug=" + encodeURIComponent(post.slug);
        const card = document.createElement("article");
        card.className = "blog-featured-card";

        card.appendChild(buildCoverEl(post, postUrl));

        const body = document.createElement("div");
        body.className = "card-body";
        body.appendChild(buildMetaLine(post));

        const title = document.createElement("h2");
        title.className = "blog-featured-title";
        const titleLink = document.createElement("a");
        titleLink.href = postUrl;
        titleLink.textContent = TB.desanitize(post.title);
        title.appendChild(titleLink);
        body.appendChild(title);

        const desc = document.createElement("p");
        desc.className = "card-desc";
        desc.textContent = TB.desanitize(post.description || "");
        body.appendChild(desc);

        const read = document.createElement("a");
        read.className = "btn";
        read.href = postUrl;
        read.textContent = "Read Article";
        body.appendChild(read);

        card.appendChild(body);
        return card;
    }

    function buildListRow(post) {
        const postUrl = "post.html?slug=" + encodeURIComponent(post.slug);
        const row = document.createElement("article");
        row.className = "blog-list-row";

        row.appendChild(buildCoverEl(post, postUrl));

        const body = document.createElement("div");
        body.className = "card-body";
        body.appendChild(buildMetaLine(post));

        const title = document.createElement("h3");
        title.className = "card-title";
        const titleLink = document.createElement("a");
        titleLink.href = postUrl;
        titleLink.textContent = TB.desanitize(post.title);
        title.appendChild(titleLink);
        body.appendChild(title);

        const desc = document.createElement("p");
        desc.className = "card-desc";
        desc.textContent = TB.desanitize(post.description || "");
        body.appendChild(desc);

        const read = document.createElement("a");
        read.className = "blog-list-link";
        read.href = postUrl;
        read.textContent = "Read More";
        body.appendChild(read);

        row.appendChild(body);
        return row;
    }

    function initBlogIndex() {
        const featuredHost = document.querySelector("[data-blog-featured]");
        const listHost = document.querySelector("[data-blog-list]");
        if (!featuredHost || !listHost) {
            return;
        }

        mountLeaderboard(document.querySelector("[data-ad-leaderboard]"));

        const sidebar = document.querySelector("[data-ad-sidebar]");
        if (sidebar && window.matchMedia("(min-width: 70rem)").matches) {
            mountPlacement(sidebar, "skyscraper");
        }

        const posts = getVisiblePosts();
        featuredHost.textContent = "";
        listHost.textContent = "";

        if (!posts.length) {
            const empty = document.createElement("p");
            empty.className = "blog-empty";
            empty.textContent = "No articles published yet. Check back soon.";
            featuredHost.appendChild(empty);
            return;
        }

        featuredHost.appendChild(buildFeaturedCard(posts[0]));

        if (posts.length > 1) {
            const heading = document.createElement("h2");
            heading.className = "section-title blog-list-heading";
            heading.textContent = "Latest Articles";
            listHost.appendChild(heading);

            posts.slice(1).forEach((post) => {
                listHost.appendChild(buildListRow(post));
            });
        }
    }

    /* ----------------------------------------------------------------------
       Single post page (post.html)
       ?slug=<slug> selects the post. ?preview=1 additionally reads the
       admin localStorage drafts instead of the published data file, so a
       draft can be proofed on the real page before exporting.
       ---------------------------------------------------------------------- */
    function initPostPage() {
        const root = document.querySelector("[data-post-root]");
        if (!root) {
            return;
        }

        const params = new URLSearchParams(window.location.search);
        const slug = params.get("slug") || "";
        const isPreview = params.get("preview") === "1";

        const source = isPreview ? getAdminPosts() : getVisiblePosts();
        const post = source.find((p) => p && p.slug === slug);

        root.textContent = "";

        if (!post) {
            const box = document.createElement("div");
            box.className = "prose post-missing";
            const h1 = document.createElement("h1");
            h1.textContent = "Article Not Found";
            const p = document.createElement("p");
            p.textContent = "This article does not exist or has not been published yet.";
            const back = document.createElement("a");
            back.className = "btn";
            back.href = "blog.html";
            back.textContent = "Back to Blog";
            box.appendChild(h1);
            box.appendChild(p);
            box.appendChild(back);
            root.appendChild(box);
            return;
        }

        const title = TB.desanitize(post.title);
        const description = TB.desanitize(post.description || "");

        /* Head metadata: title, description, canonical, BlogPosting schema */
        document.title = title + " | TemplateBox Blog";
        const metaDesc = document.querySelector("meta[name='description']");
        if (metaDesc && description) {
            metaDesc.setAttribute("content", description);
        }
        const canonicalUrl = SITE_ORIGIN + "/post.html?slug=" + encodeURIComponent(post.slug);
        let canonical = document.querySelector("link[rel='canonical']");
        if (!canonical) {
            canonical = document.createElement("link");
            canonical.rel = "canonical";
            document.head.appendChild(canonical);
        }
        canonical.href = canonicalUrl;

        if (!isPreview) {
            const ld = document.createElement("script");
            ld.type = "application/ld+json";
            const schema = {
                "@context": "https://schema.org",
                "@type": "BlogPosting",
                "headline": title,
                "description": description,
                "datePublished": post.date || "",
                "dateModified": post.updated || post.date || "",
                "mainEntityOfPage": canonicalUrl,
                "publisher": {
                    "@type": "Organization",
                    "name": "TemplateBox",
                    "url": SITE_ORIGIN + "/"
                }
            };
            const schemaImg = safeImageSrc(post.cover || "");
            if (schemaImg && !/^data:/.test(schemaImg)) {
                schema.image = schemaImg;
            }
            ld.textContent = JSON.stringify(schema);
            document.head.appendChild(ld);
        }

        if (isPreview) {
            const note = document.createElement("p");
            note.className = "preview-banner";
            note.textContent = "Preview mode: rendering the local draft from this browser. " +
                "Export and deploy js/blog-data.js from the admin panel to publish.";
            root.appendChild(note);
        }

        mountLeaderboard(document.querySelector("[data-ad-leaderboard]"));

        const layout = document.createElement("div");
        layout.className = "post-layout";

        const article = document.createElement("article");
        article.className = "post-article prose";

        const header = document.createElement("header");
        header.className = "post-header";

        const meta = document.createElement("p");
        meta.className = "post-meta";
        meta.textContent = [TB.desanitize(post.category || "Article"), formatDate(post.date)]
            .filter(Boolean).join(" · ");
        header.appendChild(meta);

        const h1 = document.createElement("h1");
        h1.textContent = title;
        header.appendChild(h1);

        if (description) {
            const standfirst = document.createElement("p");
            standfirst.className = "post-standfirst";
            standfirst.textContent = description;
            header.appendChild(standfirst);
        }

        const coverSrc = safeImageSrc(post.cover || "");
        if (coverSrc) {
            const cover = document.createElement("img");
            cover.className = "post-cover";
            cover.src = coverSrc;
            cover.alt = TB.desanitize(post.coverAlt || post.title);
            header.appendChild(cover);
        }

        article.appendChild(header);

        const body = document.createElement("div");
        body.className = "post-body";
        renderBlocks(body, post.blocks);
        article.appendChild(body);

        /* In-content 300x250: inserted after the second block so the reader
           gets an uncluttered opening, matching standard in-article
           placement guidance. Skipped for very short posts. */
        if (body.children.length >= 4) {
            const inContent = buildAdBreak("inContent");
            if (inContent) {
                body.insertBefore(inContent, body.children[2]);
            }
        }

        /* End-of-article 300x250, distinct zone for separate reporting */
        const endBreak = buildAdBreak("endOfArticle");
        if (endBreak) {
            article.appendChild(endBreak);
        }

        const footer = document.createElement("footer");
        footer.className = "post-footer";
        const back = document.createElement("a");
        back.className = "btn btn-secondary";
        back.href = "blog.html";
        back.textContent = "Back to All Articles";
        const cta = document.createElement("a");
        cta.className = "btn";
        cta.href = "index.html#templates";
        cta.textContent = "Browse Free Templates";
        footer.appendChild(back);
        footer.appendChild(cta);
        article.appendChild(footer);

        layout.appendChild(article);

        /* 160x600 skyscraper rail: only rendered on wide viewports and only
           once its zone key exists; otherwise the rail element is absent and
           the article takes the full column. */
        if (AD_ZONES.skyscraper.key &&
            window.matchMedia("(min-width: 70rem)").matches) {
            const rail = document.createElement("aside");
            rail.className = "post-rail";
            mountPlacement(rail, "skyscraper");
            layout.appendChild(rail);
        }

        root.appendChild(layout);
    }

    document.addEventListener("DOMContentLoaded", () => {
        initBlogIndex();
        initPostPage();
    });

    /* Public surface consumed by js/admin.js */
    return {
        ADMIN_STORAGE_KEY,
        parseContent,
        blocksToText,
        renderBlocks,
        safeImageSrc,
        formatDate,
        getLivePosts,
        getAdminPosts
    };
})();
