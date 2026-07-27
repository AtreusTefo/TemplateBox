/* ==========================================================================
   TemplateBox - Blog Admin Panel (admin.html)
   Scope: localStorage-backed post workspace, add/edit/delete/preview, cover
   image intake with mime-type enforcement, and export of the static
   js/blog-data.js file that publishes posts to the live site.
   Depends on: js/app.js (TB), js/blog.js (TBBlog), js/blog-data.js
   (window.TB_BLOG_POSTS, used to seed the workspace and detect sync state).
   Architecture: 100% client-side. This panel never talks to a server; the
   deploy step is replacing js/blog-data.js in the repo/Netlify drop.
   ========================================================================== */

"use strict";

(() => {

    const STORAGE_KEY = TBBlog.ADMIN_STORAGE_KEY;
    const MAX_COVER_BYTES = 400 * 1024;

    /* DOM handles */
    const form = document.getElementById("post-form");
    if (!form) {
        return;
    }

    const el = {
        title: document.getElementById("f-title"),
        slug: document.getElementById("f-slug"),
        category: document.getElementById("f-category"),
        description: document.getElementById("f-description"),
        content: document.getElementById("f-content"),
        coverFile: document.getElementById("f-cover-file"),
        coverUrl: document.getElementById("f-cover-url"),
        coverAlt: document.getElementById("f-cover-alt"),
        coverPreview: document.querySelector("[data-cover-preview]"),
        coverThumb: document.querySelector("[data-cover-thumb]"),
        coverRemove: document.querySelector("[data-cover-remove]"),
        coverError: document.querySelector("[data-cover-error]"),
        formTitle: document.querySelector("[data-form-title]"),
        formError: document.querySelector("[data-form-error]"),
        formStatus: document.querySelector("[data-form-status]"),
        saveBtn: document.querySelector("[data-save-btn]"),
        cancelBtn: document.querySelector("[data-cancel-btn]"),
        previewBtn: document.querySelector("[data-preview-btn]"),
        previewPanel: document.querySelector("[data-preview-panel]"),
        previewTarget: document.querySelector("[data-preview-target]"),
        list: document.querySelector("[data-admin-list]"),
        newPost: document.querySelector("[data-new-post]"),
        sync: document.querySelector("[data-admin-sync]"),
        exportDownload: document.querySelector("[data-export-download]"),
        exportPages: document.querySelector("[data-export-pages]"),
        exportCopy: document.querySelector("[data-export-copy]"),
        exportArchive: document.querySelector("[data-export-archive]"),
        exportStatus: document.querySelector("[data-export-status]")
    };

    /* ----------------------------------------------------------------------
       Workspace state. Seeded once from the deployed js/blog-data.js so the
       live posts are editable out of the box; afterwards localStorage is
       the single source of truth for this browser.
       ---------------------------------------------------------------------- */
    let posts = TBBlog.getAdminPosts();
    if (!posts.length && TBBlog.getLivePosts().length) {
        posts = JSON.parse(JSON.stringify(TBBlog.getLivePosts()));
        TB.storageSet(STORAGE_KEY, posts);
    }

    /* Slug of the post being edited, null while adding a new one */
    let editingSlug = null;
    /* Current cover value: https URL, data URI, or "" */
    let coverData = "";

    function save() {
        TB.storageSet(STORAGE_KEY, posts);
        renderList();
        renderSyncState();
    }

    function todayIso() {
        const d = new Date();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return d.getFullYear() + "-" + mm + "-" + dd;
    }

    function slugify(text) {
        return String(text || "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 80);
    }

    /* Sanitizes every text field of a parsed block array before storage,
       per the project rule that all text is scrubbed at the write boundary.
       Image sources are not entity-escaped (that would corrupt URLs); they
       pass the safeImageSrc whitelist instead, and invalid ones are dropped. */
    function sanitizeBlocks(blocks) {
        return blocks
            .map((b) => {
                if (b.type === "ul" || b.type === "ol") {
                    return { type: b.type, items: b.items.map(TB.sanitize) };
                }
                if (b.type === "img") {
                    const src = TBBlog.safeImageSrc(b.src);
                    return src ? { type: "img", src: src, alt: TB.sanitize(b.alt || "") } : null;
                }
                return { type: b.type, text: TB.sanitize(b.text || "") };
            })
            .filter(Boolean);
    }

    function desanitizeBlocks(blocks) {
        return (blocks || []).map((b) => {
            if (b.type === "ul" || b.type === "ol") {
                return { type: b.type, items: (b.items || []).map(TB.desanitize) };
            }
            if (b.type === "img") {
                return { type: "img", src: b.src, alt: TB.desanitize(b.alt || "") };
            }
            return { type: b.type, text: TB.desanitize(b.text || "") };
        });
    }

    /* ----------------------------------------------------------------------
       Export: generates the replacement js/blog-data.js
       ---------------------------------------------------------------------- */
    function buildDataFile() {
        const header = [
            "/* ==========================================================================",
            "   TemplateBox - Published Blog Data",
            "   Generated by admin.html on " + todayIso() + ".",
            "   This file IS the blog database: deploy it as a static asset and",
            "   visitors' browsers read posts from window.TB_BLOG_POSTS below.",
            "   Author in admin.html, export, replace this file, commit/deploy.",
            "   ========================================================================== */",
            "",
            "\"use strict\";",
            "",
            "window.TB_BLOG_POSTS = "
        ].join("\n");
        return header + JSON.stringify(posts, null, 4) + ";\n";
    }

    function downloadDataFile() {
        const blob = new Blob([buildDataFile()], { type: "text/javascript" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "blog-data.js";
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 5000);
        setText(el.exportStatus, "Downloaded. Replace js/blog-data.js in the project with this file, then commit and push (or drag the folder into Netlify).");
    }

    /* ----------------------------------------------------------------------
       Export: static per-post HTML pages (blog/<slug>.html)

       Why this exists: post.html is a single renderer that resolves its
       title, description, canonical URL and BlogPosting schema at runtime
       from js/blog.js. Google renders JavaScript, but on a deferred second
       pass, and social crawlers (Facebook, X, LinkedIn, WhatsApp) do not run
       JavaScript at all, so every shared post link previewed as the generic
       "Article | TemplateBox Blog" with no image. These files carry the real
       metadata in the served markup.

       The body is produced by TBBlog.renderBlocks into a detached container
       and then serialized, so there is exactly one block-rendering
       implementation in the project and the static output cannot drift from
       what post.html shows. Because that renderer builds the DOM with
       createElement and textContent only, the serialized string is escaped
       correctly by construction.
       ---------------------------------------------------------------------- */
    const POST_ORIGIN = "https://templatebox.win";

    /* The site footer, byte-for-byte the .site-footer block every root page
       carries, with each path prefixed ../ because posts live in blog/.
       Exported pages used to ship a single-row .footer-links footer that
       predated the four-column one, so post pages lost every link to the
       document landing pages and the social row. The footer is hand-copied
       across pages in this project; when it changes there, change it here and
       re-export the post pages, or the generated ones drift again. */
    const FOOTER =
'    <footer class="site-footer">\n' +
'        <div class="footer-cols">\n' +
'            <div class="footer-col">\n' +
'                <h2>Receipts and Invoices</h2>\n' +
'                <ul>\n' +
'                    <li><a href="../rent-receipt-template.html">Rent Receipt Template</a></li>\n' +
'                    <li><a href="../cash-payment-receipt-template.html">Cash Payment Receipt</a></li>\n' +
'                    <li><a href="../itemized-receipt-template.html">Itemized Business Receipt</a></li>\n' +
'                    <li><a href="../sales-receipt-template.html">Sales Receipt Form</a></li>\n' +
'                    <li><a href="../free-invoice-template.html">Free Invoice Template</a></li>\n' +
'                    <li><a href="../employee-warning-notice-template.html">Employee Warning Notice</a></li>\n' +
'                </ul>\n' +
'            </div>\n' +
'            <div class="footer-col">\n' +
'                <h2>Resumes and Creative</h2>\n' +
'                <ul>\n' +
'                    <li><a href="../ats-resume-template.html">ATS Resume Template</a></li>\n' +
'                    <li><a href="../poster-maker.html">Poster Maker</a></li>\n' +
'                    <li><a href="../tshirt-mockup-generator.html">T-Shirt Mockup Generator</a></li>\n' +
'                </ul>\n' +
'            </div>\n' +
'            <div class="footer-col">\n' +
'                <h2>Editors</h2>\n' +
'                <ul>\n' +
'                    <li><a href="../resume.html" data-target="resume">Resume Builder</a></li>\n' +
'                    <li><a href="../docs.html" data-target="docs">Business Document Builder</a></li>\n' +
'                    <li><a href="../poster.html" data-target="poster">Poster Creator</a></li>\n' +
'                    <li><a href="../mockup.html" data-target="mockup">Product Mockup Generator</a></li>\n' +
'                </ul>\n' +
'            </div>\n' +
'            <div class="footer-col">\n' +
'                <h2>Learn</h2>\n' +
'                <ul>\n' +
'                    <li><a href="../blog.html">Guides and Articles</a></li>\n' +
'                    <li><a href="../index.html#templates">All Templates</a></li>\n' +
'                </ul>\n' +
'            </div>\n' +
'            <div class="footer-col">\n' +
'                <h2>Company</h2>\n' +
'                <ul>\n' +
'                    <li><a href="../about.html">About TemplateBox</a></li>\n' +
'                    <li><a href="../privacy.html">Privacy Policy</a></li>\n' +
'                    <li><a href="../terms.html">Terms of Use</a></li>\n' +
'                </ul>\n' +
'            </div>\n' +
'        </div>\n' +
'\n' +
'        <div class="footer-base">\n' +
'            <div class="footer-social">\n' +
'                <a href="https://x.com/Templatebox26" target="_blank" rel="noopener noreferrer" aria-label="TemplateBox on X">\n' +
'                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>\n' +
'                </a>\n' +
'                <a href="https://www.facebook.com/profile.php?id=61592027191178" target="_blank" rel="noopener noreferrer" aria-label="TemplateBox on Facebook">\n' +
'                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M24 12.073C24 5.446 18.627.073 12 .073S0 5.446 0 12.073c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>\n' +
'                </a>\n' +
'                <a href="https://www.tiktok.com/@templatebox26" target="_blank" rel="noopener noreferrer" aria-label="TemplateBox on TikTok">\n' +
'                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>\n' +
'                </a>\n' +
'                <a href="https://www.instagram.com/templatebox26/" target="_blank" rel="noopener noreferrer" aria-label="TemplateBox on Instagram">\n' +
'                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>\n' +
'                </a>\n' +
'            </div>\n' +
'            <p>TemplateBox. All editing happens locally in your browser. No data leaves your device.</p>\n' +
'        </div>\n' +
'    </footer>\n';

    /* Pages live one level down in blog/, so every shell asset path in the
       generated markup is prefixed with ../ */
    function buildPostPage(post) {
        const slug = String(post.slug || "");
        const url = POST_ORIGIN + "/blog/" + slug + ".html";
        const title = post.title || "Untitled";
        const desc = post.description || "";
        const cover = TBBlog.safeImageSrc(post.cover || "");

        /* Body: rendered through the shared renderer, then serialized */
        const holder = document.createElement("div");
        TBBlog.renderBlocks(holder, post.blocks);

        /* In-content 300x250 host, positioned while the body is still a DOM
           tree by the same TBAds.adBreakIndex() rule post.html uses at
           runtime, so the ad sits in the same place whichever path produced
           the page. The host ships empty; js/blog.js fills it at load from the
           AD_ZONES registry, which stays the single definition of every
           placement. */
        const breakAt = TBAds.adBreakIndex(holder.children);
        if (breakAt > -1) {
            const inContent = document.createElement("div");
            inContent.className = "ad-break";
            inContent.setAttribute("data-ad-incontent", "");
            holder.insertBefore(inContent, holder.children[breakAt]);
        }

        /* One top-level block per line, indented to match the surrounding
           markup. Serializing the whole holder in one go (innerHTML) produces
           a single unbroken line, because the renderer builds the tree with
           createElement only and leaves no whitespace text nodes; that made
           the exported file impossible to diff and invited hand-prettifying
           it, which then meant a re-export never matched what was committed.
           Whitespace between block elements is insignificant to rendering, so
           this costs nothing and makes the output reproducible. */
        const body = Array.from(holder.children)
            .map((el) => "                " + el.outerHTML)
            .join("\n");

        const schema = {
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            headline: TB.desanitize(title),
            description: TB.desanitize(desc),
            datePublished: post.date || "",
            dateModified: post.updated || post.date || "",
            mainEntityOfPage: url,
            author: { "@type": "Organization", name: "TemplateBox" },
            publisher: {
                "@type": "Organization",
                name: "TemplateBox",
                logo: { "@type": "ImageObject", url: POST_ORIGIN + "/assets/logo.png" }
            }
        };
        if (cover) {
            schema.image = cover;
        }

        const ogImage = cover || (POST_ORIGIN + "/assets/logo.png");
        const fonts = "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600&display=swap";

        /* Indented to sit inside <article>, which is now one level deeper
           than it was before the .post-layout wrapper was added for the rail */
        const coverMarkup = cover
            ? '                <img class="post-cover" src="' + cover + '" alt="' + (post.coverAlt || "") + '" loading="lazy">\n'
            : "";

        return '<!DOCTYPE html>\n' +
'<html lang="en">\n' +
'<head>\n' +
'    <meta charset="UTF-8">\n' +
'    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n\n' +
'    <!-- Generated by admin.html. Metadata is baked into the markup so that\n' +
'         crawlers which do not execute JavaScript still see the real title,\n' +
'         description, canonical URL and structured data. -->\n' +
'    <title>' + title + ' | TemplateBox</title>\n' +
'    <meta name="description" content="' + desc + '">\n' +
'    <link rel="canonical" href="' + url + '">\n\n' +
'    <meta property="og:type" content="article">\n' +
'    <meta property="og:site_name" content="TemplateBox">\n' +
'    <meta property="og:title" content="' + title + '">\n' +
'    <meta property="og:description" content="' + desc + '">\n' +
'    <meta property="og:url" content="' + url + '">\n' +
'    <meta property="og:image" content="' + ogImage + '">\n' +
'    <meta property="article:published_time" content="' + (post.date || "") + '">\n' +
'    <meta property="article:modified_time" content="' + (post.updated || post.date || "") + '">\n\n' +
'    <meta name="twitter:card" content="summary_large_image">\n' +
'    <meta name="twitter:title" content="' + title + '">\n' +
'    <meta name="twitter:description" content="' + desc + '">\n' +
'    <meta name="twitter:image" content="' + ogImage + '">\n\n' +
'    <script type="application/ld+json">\n' +
    JSON.stringify(schema, null, 4) + '\n' +
'    </' + 'script>\n\n' +
'    <script type="text/javascript">\n' +
'        (function(c,l,a,r,i,t,y){\n' +
'            c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};\n' +
'            t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;\n' +
'            y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);\n' +
'        })(window, document, "clarity", "script", "xix7m2758f");\n' +
'    </' + 'script>\n\n' +
'    <link rel="preconnect" href="https://fonts.googleapis.com">\n' +
'    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
'    <link rel="stylesheet" media="print" onload="this.media=\'all\'" href="' + fonts + '">\n' +
'    <noscript><link rel="stylesheet" href="' + fonts + '"></noscript>\n' +
'    <link rel="stylesheet" href="../css/style.css">\n' +
'</head>\n' +
'<body>\n\n' +
'    <a class="skip-link" href="#main">Skip to main content</a>\n\n' +
'    <header class="site-header">\n' +
'        <a class="wordmark" href="../index.html">TemplateBox</a>\n' +
'        <nav class="site-nav" aria-label="Primary">\n' +
'            <a href="../index.html">Templates</a>\n' +
'            <a href="../blog.html" aria-current="page">Guides</a>\n' +
'            <a href="../about.html">About</a>\n' +
'        </nav>\n' +
'    </header>\n\n' +
'    <main id="main" data-ads-static>\n' +
'        <nav class="breadcrumb" aria-label="Breadcrumb">\n' +
'            <ol>\n' +
'                <li><a href="../index.html">Templates</a></li>\n' +
'                <li><a href="../blog.html">Guides</a></li>\n' +
'                <li aria-current="page">' + title + '</li>\n' +
'            </ol>\n' +
'        </nav>\n\n' +
'        <!-- Ad hosts ship empty and are filled by TBAds (js/ads.js), which\n' +
'             auto-mounts because <main> carries data-ads-static: 728x90 (320x50 mobile)\n' +
'             leaderboard here, 300x250 after the second block, a second\n' +
'             300x250 at the end of the article, and a 160x600 rail on\n' +
'             viewports over 70rem. Passive formats only -- no Popunder and no\n' +
'             Social Bar on indexable content, per the blog ad policy. An\n' +
'             unfilled host collapses via the :empty rules in css/style.css. -->\n' +
'        <div class="ad-lead" data-ad-leaderboard></div>\n\n' +
'        <div class="post-layout">\n' +
'            <article class="post-article prose" data-static-post>\n' +
'                <header class="post-header">\n' +
'                    <p class="post-meta">' + (post.category || "") +
        (post.category && post.date ? " &middot; " : "") +
        TBBlog.formatDate(post.date) + '</p>\n' +
'                    <h1>' + title + '</h1>\n' +
        (desc ? '                    <p class="post-standfirst">' + desc + '</p>\n' : "") +
'                </header>\n' +
coverMarkup +
'                <div class="post-body">\n' +
body + '\n' +
'                </div>\n' +
'                <div class="ad-break" data-ad-endofarticle></div>\n' +
'                <footer class="post-footer">\n' +
'                    <a class="btn" href="../index.html#templates">Browse templates</a>\n' +
'                    <a class="btn btn-secondary" href="../blog.html">More guides</a>\n' +
'                </footer>\n' +
'            </article>\n' +
'            <aside class="post-rail" data-ad-rail aria-label="Advertisement"></aside>\n' +
'        </div>\n' +
'    </main>\n\n' +
FOOTER +
'\n' +
/* The 790-line blog library and the whole post database were both dead
   weight on a page whose metadata and body are already baked into the
   markup: nothing here reads window.TB_BLOG_POSTS, and the only runtime
   need is filling the ad hosts. */
'    <script src="../js/app.js"></' + 'script>\n' +
'    <script src="../js/ads.js"></' + 'script>\n' +
'</body>\n' +
'</html>\n';
    }

    /* Downloads one .html file per visible post. Browsers throttle rapid
       sequential downloads, so they are spaced out; for the post counts this
       blog realistically reaches, that is simpler and more transparent than
       pulling in a zip library, which would also add a CDN dependency. */
    function downloadPostPages() {
        const visible = posts.filter((p) => p.visible !== false && p.slug);
        if (!visible.length) {
            setText(el.exportStatus, "No visible posts to export.");
            return;
        }

        visible.forEach((post, index) => {
            window.setTimeout(() => {
                const blob = new Blob([buildPostPage(post)], { type: "text/html" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = post.slug + ".html";
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.setTimeout(() => URL.revokeObjectURL(url), 5000);
            }, index * 350);
        });

        setText(el.exportStatus, "Downloading " + visible.length +
            " post page(s). Put them in the project's blog/ folder, add each to sitemap.xml, then deploy.");
    }

    /* ----------------------------------------------------------------------
       Export: the static guides archive list for blog.html

       Why this exists: the cards on blog.html are rendered from
       window.TB_BLOG_POSTS at runtime, so the served markup of the blog index
       contained no link to any post. sitemap.xml was the only static route to
       blog/<slug>.html, which made every post dependent on a crawler running
       JavaScript and unreachable to any client that does not. The archive list
       in blog.html fixes that, and is generated here so the two never disagree
       about which posts exist.

       Emitted as text for pasting rather than as a file, because it replaces
       one element inside a hand-maintained page. Indentation matches the
       <nav class="guide-archive"> block in blog.html.
       ---------------------------------------------------------------------- */
    function buildArchiveList() {
        const visible = posts
            .filter((p) => p && p.visible !== false && p.slug && p.title)
            .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

        const lines = ["            <ul>"];
        visible.forEach((post) => {
            /* Titles are stored sanitized; desanitize for display, then
               re-escape for markup. The archive is plain text on purpose:
               no cover images, no excerpts, nothing to keep in sync but
               the title, the URL and the date. */
            const title = escapeMarkup(TB.desanitize(post.title));
            const href = "blog/" + encodeURIComponent(post.slug) + ".html";
            const date = TBBlog.formatDate(post.date);
            lines.push('                <li><a href="' + href + '">' + title + "</a>" +
                (date ? " <span>" + date + "</span>" : "") + "</li>");
        });
        lines.push("            </ul>");
        return lines.join("\n") + "\n";
    }

    /* Minimal escaper for the four characters that can break out of the
       markup context this string is pasted into. Everything else about the
       blog renders through createElement/textContent; this export is the one
       place the project builds HTML as a string from post data. */
    function escapeMarkup(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function copyToClipboard(text, okMessage) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(
                () => setText(el.exportStatus, okMessage),
                () => setText(el.exportStatus, "Copy failed in this browser. Use Download instead.")
            );
        } else {
            setText(el.exportStatus, "Clipboard unavailable in this browser. Use Download instead.");
        }
    }

    function copyDataFile() {
        copyToClipboard(buildDataFile(),
            "Copied. Paste over the full contents of js/blog-data.js, then deploy.");
    }

    function copyArchiveList() {
        const visible = posts.filter((p) => p.visible !== false && p.slug && p.title);
        if (!visible.length) {
            setText(el.exportStatus, "No visible posts, so there is no archive list to copy.");
            return;
        }
        copyToClipboard(buildArchiveList(), "Copied " + visible.length + " entr" +
            (visible.length === 1 ? "y" : "ies") +
            ". In blog.html, replace the <ul> inside <nav class=\"guide-archive\"> with this, then deploy.");
    }

    function renderSyncState() {
        const liveJson = JSON.stringify(TBBlog.getLivePosts());
        const workJson = JSON.stringify(posts);
        const visibleCount = posts.filter((p) => p.visible !== false).length;
        const base = posts.length + " post" + (posts.length === 1 ? "" : "s") +
            " in workspace (" + visibleCount + " visible). ";
        setText(el.sync, base + (liveJson === workJson
            ? "In sync with the deployed data file."
            : "Changes not yet exported to js/blog-data.js."));
    }

    /* ----------------------------------------------------------------------
       Post list (management table)
       ---------------------------------------------------------------------- */
    function renderList() {
        el.list.textContent = "";

        if (!posts.length) {
            const empty = document.createElement("p");
            empty.className = "admin-empty";
            empty.textContent = "No posts yet. Use the form below to add your first blog post.";
            el.list.appendChild(empty);
            return;
        }

        posts.forEach((post) => {
            const row = document.createElement("div");
            row.className = "admin-row";

            const info = document.createElement("div");
            info.className = "admin-row-info";

            const title = document.createElement("p");
            title.className = "admin-row-title";
            title.textContent = TB.desanitize(post.title || "(untitled)");
            info.appendChild(title);

            const meta = document.createElement("p");
            meta.className = "admin-row-meta";
            const bits = [];
            if (post.updated || post.date) {
                bits.push("Last edited: " + (TBBlog.formatDate(post.updated || post.date) || "unknown"));
            }
            bits.push(post.visible === false ? "Invisible" : "Visible");
            if (post.category) {
                bits.push(TB.desanitize(post.category));
            }
            meta.textContent = bits.join(" — ");
            info.appendChild(meta);

            row.appendChild(info);

            const actions = document.createElement("div");
            actions.className = "admin-row-actions";

            const editBtn = document.createElement("button");
            editBtn.className = "btn btn-secondary btn-small";
            editBtn.type = "button";
            editBtn.textContent = "Edit";
            editBtn.addEventListener("click", () => startEdit(post.slug));
            actions.appendChild(editBtn);

            const viewBtn = document.createElement("button");
            viewBtn.className = "btn btn-secondary btn-small";
            viewBtn.type = "button";
            viewBtn.textContent = "View";
            viewBtn.addEventListener("click", () => {
                /* draft= rather than slug=: netlify.toml 301-redirects
                   post.html?slug= to the static page, which a draft does
                   not have yet. */
                window.open("post.html?draft=" + encodeURIComponent(post.slug) + "&preview=1", "_blank");
            });
            actions.appendChild(viewBtn);

            const delBtn = document.createElement("button");
            delBtn.className = "entry-remove";
            delBtn.type = "button";
            delBtn.textContent = "Delete";
            delBtn.addEventListener("click", () => {
                const name = TB.desanitize(post.title || post.slug);
                if (window.confirm("Delete the post \"" + name + "\" from the workspace? This cannot be undone here (the live site keeps it until you export and deploy).")) {
                    posts = posts.filter((p) => p.slug !== post.slug);
                    if (editingSlug === post.slug) {
                        resetForm();
                    }
                    save();
                }
            });
            actions.appendChild(delBtn);

            row.appendChild(actions);
            el.list.appendChild(row);
        });
    }

    /* ----------------------------------------------------------------------
       Form behavior
       ---------------------------------------------------------------------- */
    let slugTouched = false;

    function setText(target, message) {
        if (target) {
            target.textContent = message || "";
        }
    }

    function showCoverPreview() {
        const src = TBBlog.safeImageSrc(coverData);
        if (src) {
            el.coverThumb.src = src;
            el.coverPreview.hidden = false;
        } else {
            el.coverThumb.removeAttribute("src");
            el.coverPreview.hidden = true;
        }
    }

    function resetForm() {
        form.reset();
        editingSlug = null;
        slugTouched = false;
        coverData = "";
        showCoverPreview();
        setText(el.formError, "");
        setText(el.formStatus, "");
        setText(el.coverError, "");
        el.formTitle.textContent = "Add New Blog Post";
        el.saveBtn.textContent = "Add Blog Post";
        el.cancelBtn.hidden = true;
        el.previewPanel.hidden = true;
    }

    function startEdit(slug) {
        const post = posts.find((p) => p.slug === slug);
        if (!post) {
            return;
        }
        editingSlug = slug;
        slugTouched = true;
        el.title.value = TB.desanitize(post.title || "");
        el.slug.value = post.slug;
        el.category.value = TB.desanitize(post.category || "");
        el.description.value = TB.desanitize(post.description || "");
        el.content.value = TBBlog.blocksToText(desanitizeBlocks(post.blocks));
        el.coverAlt.value = TB.desanitize(post.coverAlt || "");
        coverData = post.cover || "";
        el.coverUrl.value = /^https?:\/\//.test(coverData) ? coverData : "";
        el.coverFile.value = "";
        showCoverPreview();
        const visibleRadio = form.querySelector(
            "input[name='visibility'][value='" + (post.visible === false ? "invisible" : "visible") + "']");
        if (visibleRadio) {
            visibleRadio.checked = true;
        }
        el.formTitle.textContent = "Editing: " + TB.desanitize(post.title || slug);
        el.saveBtn.textContent = "Save Changes";
        el.cancelBtn.hidden = false;
        setText(el.formError, "");
        setText(el.formStatus, "");
        el.formTitle.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function collectPost() {
        const title = el.title.value.trim();
        const slug = el.slug.value.trim() || slugify(title);
        const content = el.content.value;

        if (!title) {
            throw new Error("Title is required.");
        }
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
            throw new Error("Slug may only contain lowercase letters, numbers, and single hyphens.");
        }
        if (!content.trim()) {
            throw new Error("Content is empty.");
        }
        const clash = posts.find((p) => p.slug === slug && p.slug !== editingSlug);
        if (clash) {
            throw new Error("Another post already uses the slug \"" + slug + "\".");
        }

        const blocks = sanitizeBlocks(TBBlog.parseContent(content));
        if (!blocks.length) {
            throw new Error("Content produced no blocks. Check the formatting reference.");
        }

        const visibility = form.querySelector("input[name='visibility']:checked");
        const existing = editingSlug ? posts.find((p) => p.slug === editingSlug) : null;

        return {
            slug: slug,
            title: TB.sanitize(title),
            description: TB.sanitize(el.description.value.trim()),
            category: TB.sanitize(el.category.value.trim()),
            date: existing && existing.date ? existing.date : todayIso(),
            updated: todayIso(),
            visible: !visibility || visibility.value === "visible",
            cover: TBBlog.safeImageSrc(coverData),
            coverAlt: TB.sanitize(el.coverAlt.value.trim()),
            blocks: blocks
        };
    }

    form.addEventListener("submit", (evt) => {
        evt.preventDefault();
        setText(el.formError, "");
        let post;
        try {
            post = collectPost();
        } catch (err) {
            setText(el.formError, err.message);
            return;
        }

        if (editingSlug) {
            const idx = posts.findIndex((p) => p.slug === editingSlug);
            if (idx >= 0) {
                posts[idx] = post;
            } else {
                posts.push(post);
            }
        } else {
            posts.unshift(post);
        }
        save();
        setText(el.formStatus, "Saved to the local workspace. Use the Publish panel above to export js/blog-data.js when ready.");
        resetFormKeepStatus();
    });

    function resetFormKeepStatus() {
        const status = el.formStatus.textContent;
        resetForm();
        setText(el.formStatus, status);
    }

    el.cancelBtn.addEventListener("click", resetForm);
    el.newPost.addEventListener("click", () => {
        resetForm();
        el.formTitle.scrollIntoView({ behavior: "smooth", block: "start" });
        el.title.focus();
    });

    el.title.addEventListener("input", () => {
        if (!slugTouched) {
            el.slug.value = slugify(el.title.value);
        }
    });
    el.slug.addEventListener("input", () => {
        slugTouched = el.slug.value.trim().length > 0;
    });

    el.previewBtn.addEventListener("click", () => {
        setText(el.formError, "");
        const blocks = sanitizeBlocks(TBBlog.parseContent(el.content.value));
        el.previewTarget.textContent = "";

        const h1 = document.createElement("h1");
        h1.textContent = el.title.value.trim() || "(untitled)";
        el.previewTarget.appendChild(h1);

        const body = document.createElement("div");
        body.className = "post-body";
        TBBlog.renderBlocks(body, blocks);
        el.previewTarget.appendChild(body);

        el.previewPanel.hidden = false;
        el.previewPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    /* ----------------------------------------------------------------------
       Cover image intake.
       Mime-type gate per project standard: file.type must match image.*,
       otherwise processing terminates immediately. Size is capped because
       the image is inlined into the exported data file as a data URI.
       ---------------------------------------------------------------------- */
    el.coverFile.addEventListener("change", () => {
        setText(el.coverError, "");
        const file = el.coverFile.files && el.coverFile.files[0];
        if (!file) {
            return;
        }
        if (!/^image\//.test(file.type)) {
            el.coverFile.value = "";
            setText(el.coverError, "Rejected: the selected file is not an image.");
            return;
        }
        if (file.size > MAX_COVER_BYTES) {
            el.coverFile.value = "";
            setText(el.coverError, "Rejected: image exceeds 400 KB. Compress it or host it and use the URL field.");
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            coverData = String(reader.result || "");
            el.coverUrl.value = "";
            showCoverPreview();
        };
        reader.readAsDataURL(file);
    });

    el.coverUrl.addEventListener("change", () => {
        const url = el.coverUrl.value.trim();
        setText(el.coverError, "");
        if (!url) {
            return;
        }
        if (!TBBlog.safeImageSrc(url)) {
            setText(el.coverError, "Rejected: cover URL must start with https:// (or http://).");
            return;
        }
        coverData = url;
        el.coverFile.value = "";
        showCoverPreview();
    });

    el.coverRemove.addEventListener("click", () => {
        coverData = "";
        el.coverFile.value = "";
        el.coverUrl.value = "";
        showCoverPreview();
    });

    /* ----------------------------------------------------------------------
       Export bindings + boot
       ---------------------------------------------------------------------- */
    el.exportDownload.addEventListener("click", downloadDataFile);
    if (el.exportPages) {
        el.exportPages.addEventListener("click", downloadPostPages);
    }
    el.exportCopy.addEventListener("click", copyDataFile);
    if (el.exportArchive) {
        el.exportArchive.addEventListener("click", copyArchiveList);
    }

    renderList();
    renderSyncState();
})();
