/* ==========================================================================
   TemplateBox - Blog Library and Public Page Initializers
   Scope: block-based content model (parse/serialize), XSS-safe DOM
   rendering (textContent only, zero innerHTML), blog index (blog.html)
   and single post (post.html) boot. Ad placements come from js/ads.js.
   Depends on: js/ads.js (TBAds placement registry), js/app.js
   (TB.sanitize / TB.desanitize / TB.storageGet)
   and js/blog-data.js (window.TB_BLOG_POSTS, the published post array).
   Architecture: 100% client-side. Posts are static data shipped with the
   site; the admin panel (admin.html) edits localStorage drafts and exports
   a replacement js/blog-data.js.
   ========================================================================== */

"use strict";

const TBBlog = (() => {

    /* Ad placements live in js/ads.js (TBAds), which must be loaded first.
       They were moved there when the document landing pages became a third
       page family needing banners: one registry, three mounting paths. */

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

    /* Canonical public URL for a post.

       Posts are published as static files under blog/, generated by
       admin.html, because post.html only acquires its real title,
       description and structured data after JavaScript runs, which social
       crawlers never do and Google only does on a deferred second pass.
       post.html?slug= remains a working fallback route for existing links,
       but every link the site generates points at the static page so link
       equity and social previews land on the canonical URL.

       A preview from the admin panel keeps using post.html, since a draft
       has no exported static file yet. */
    function postUrlFor(slug) {
        return "blog/" + encodeURIComponent(String(slug)) + ".html";
    }

    function buildFeaturedCard(post) {
        const postUrl = postUrlFor(post.slug);
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
        const postUrl = postUrlFor(post.slug);
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

        TBAds.mountLeaderboard(document.querySelector("[data-ad-leaderboard]"));

        const sidebar = document.querySelector("[data-ad-sidebar]");
        if (sidebar && window.matchMedia("(min-width: 70rem)").matches) {
            TBAds.mountPlacement(sidebar, "skyscraper");
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

       Published posts are served from static files under blog/, so in
       production ?slug=<slug> is 301-redirected there by netlify.toml and
       this renderer only ever runs for drafts and for local testing.

       ?draft=<slug>&preview=1 reads the admin localStorage workspace instead
       of the published data file, so a draft can be proofed on the real page
       layout before it is exported. The draft parameter is deliberately NOT
       named slug: the redirect rule keys on slug, and a preview must not be
       bounced to a static file that does not exist yet.

       ?slug=<slug> still works when the redirect is not in play (local
       testing, or an older link hitting the file directly).
       ---------------------------------------------------------------------- */
    function initPostPage() {
        const root = document.querySelector("[data-post-root]");
        if (!root) {
            return;
        }

        const params = new URLSearchParams(window.location.search);
        const isPreview = params.get("preview") === "1";
        const slug = params.get("draft") || params.get("slug") || "";

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
        /* Canonical points at the static page, not at this fallback route,
           so the two URLs are never treated as duplicate content and all
           ranking signal consolidates on the file that carries real
           server-rendered metadata. */
        const canonicalUrl = SITE_ORIGIN + "/" + postUrlFor(post.slug);
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

        TBAds.mountLeaderboard(document.querySelector("[data-ad-leaderboard]"));

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

        /* In-content 300x250, positioned by the shared rule */
        const breakAt = TBAds.adBreakIndex(body.children);
        if (breakAt > -1) {
            const inContent = TBAds.buildAdBreak("inContent");
            if (inContent) {
                body.insertBefore(inContent, body.children[breakAt]);
            }
        }

        /* End-of-article 300x250, distinct zone for separate reporting */
        const endBreak = TBAds.buildAdBreak("endOfArticle");
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
        if (TBAds.AD_ZONES.skyscraper.key &&
            window.matchMedia("(min-width: 70rem)").matches) {
            const rail = document.createElement("aside");
            rail.className = "post-rail";
            TBAds.mountPlacement(rail, "skyscraper");
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
