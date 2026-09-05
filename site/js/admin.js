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

/* --------------------------------------------------------------------------
   Shared by BOTH workspaces below.

   Each half patches a hand-maintained file -- the blog half rewrites the
   guides archive in blog.html and the post URLs in sitemap.xml, the catalog
   half splices one card's preview in index.html -- and both must locate
   their target the same way.

   maskComments blanks comment bodies to spaces of equal length, so every
   offset found in the masked copy is still valid in the original. Searching
   the raw text would let a commented-out card, or a stray "</div>" inside a
   comment, steer a splice: index.html carries several explanatory comments
   between its cards, including one describing that very markup.

   These lived as a copy in each IIFE until August 25, 2026. They were still
   identical then, which is the point -- the footer constant and the inline
   route whitelist were identical too, right up until they were not, and
   both cost a defect nobody could see. One definition cannot drift.
   -------------------------------------------------------------------------- */
const maskComments = (html) =>
    html.replace(/<!--[\s\S]*?-->/g, (match) => " ".repeat(match.length));

const newlineOf = (text) => (text.indexOf("\r\n") >= 0 ? "\r\n" : "\n");


(() => {

    const STORAGE_KEY = TBBlog.ADMIN_STORAGE_KEY;

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
        coverNote: document.querySelector("[data-cover-note]"),
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
        exportStatus: document.querySelector("[data-export-status]"),
        fsState: document.querySelector("[data-blog-fs-state]"),
        fsConnect: document.querySelector("[data-blog-fs-connect]"),
        fsDisconnect: document.querySelector("[data-blog-fs-disconnect]"),
        publishBtn: document.querySelector("[data-blog-publish]")
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

    /* The write is read back. TB.storageSet swallows quota and private-mode
       failures by design, so without this a save that never landed still
       reported "Saved to the local workspace" -- and the post was gone on the
       next reload. Posts carry their cover inlined as a data URI, and that
       storage is shared with the thumbnail workspace, so filling it is an
       ordinary outcome rather than a remote one. The catalog half has had
       this check since August 22, 2026; this half never got it. */
    function save() {
        TB.storageSet(STORAGE_KEY, posts);
        const stored = TB.storageGet(STORAGE_KEY);
        const persisted = Array.isArray(stored) && stored.length === posts.length;
        renderList();
        renderSyncState();
        if (!persisted) {
            setText(el.formError, "Warning: this browser did not store the workspace, most likely because the cover images filled its quota. Publish or export now; deleting posts you have already published frees space.");
        }
        return persisted;
    }

    /* What the workspace looked like the last time it was published from this
       page. renderSyncState compares against the deployed data file, which is
       window.TB_BLOG_POSTS -- read once at page load and never updated, so
       after a successful publish the panel went on insisting the changes were
       not exported. Held in memory only, deliberately: after a reload the
       freshly written blog-data.js IS the deployed file and the ordinary
       comparison is correct again. */
    let lastPublishedJson = null;

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

    /* The header mega-menu, byte-for-byte the .nav-more block every page
       carries, with each path prefixed ../ because posts live in blog/.

       This replaced the FOOTER constant on August 13, 2026, when the
       footer's link columns moved into this panel site-wide and the footer
       itself was deleted from every page. The drift warning the old constant
       carried applies unchanged here: the block is hand-copied across pages
       in this project, so when it changes there, change it here and re-export
       the post pages, or the generated ones drift again. */
    const MEGA_MENU =
'            <div class="nav-more" data-nav-more>\n' +
'                <button type="button" aria-expanded="false" aria-controls="nav-more-panel" data-nav-more-toggle>\n' +
'                    More\n' +
'                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 9l7 7 7-7"/></svg>\n' +
'                </button>\n' +
'                <div class="nav-more-panel" id="nav-more-panel" hidden data-nav-more-panel>\n' +
'                    <div>\n' +
'                        <h2>Receipts and Invoices</h2>\n' +
'                        <ul>\n' +
'                            <li><a href="../rent-receipt-template.html">Rent Receipt Template</a></li>\n' +
'                            <li><a href="../cash-payment-receipt-template.html">Cash Payment Receipt</a></li>\n' +
'                            <li><a href="../itemized-receipt-template.html">Itemized Business Receipt</a></li>\n' +
'                            <li><a href="../sales-receipt-template.html">Sales Receipt Form</a></li>\n' +
'                            <li><a href="../free-invoice-template.html">Free Invoice Template</a></li>\n' +
'                            <li><a href="../employee-warning-notice-template.html">Employee Warning Notice</a></li>\n' +
'                        </ul>\n' +
'                    </div>\n' +
'                    <div>\n' +
'                        <h2>Resumes and Creative</h2>\n' +
'                        <ul>\n' +
'                            <li><a href="../ats-resume-template.html">ATS Resume Template</a></li>\n' +
'                            <li><a href="../poster-maker.html">Poster Maker</a></li>\n' +
'                            <li><a href="../tshirt-mockup-generator.html">T-Shirt Mockup Generator</a></li>\n' +
'                        </ul>\n' +
'                    </div>\n' +
'                    <div>\n' +
'                        <h2>Product Mockups</h2>\n' +
'                        <ul>\n' +
'                            <li><a href="../mockup.html" data-target="mockup" data-doc="tshirt-model-white">White T-Shirt Mockup</a></li>\n' +
'                            <li><a href="../mockup.html" data-target="mockup" data-doc="tshirt-model-white-back">White T-Shirt Back Mockup</a></li>\n' +
'                            <li><a href="../mockup.html" data-target="mockup" data-doc="cap-model-white">White Baseball Cap Mockup</a></li>\n' +
'                            <li><a href="../mockup.html" data-target="mockup" data-doc="bag-paper-white">White Paper Bag Mockup</a></li>\n' +
'                            <li><a href="../mockup.html" data-target="mockup" data-doc="card-white-walnut">Business Card Mockup</a></li>\n' +
'                            <li><a href="../mockup.html" data-target="mockup" data-doc="card-white-duotone">Duotone Business Card Mockup</a></li>\n' +
'                            <li><a href="../mockup.html" data-target="mockup" data-doc="banner-rollup-white">Roll-Up Banner Mockup</a></li>\n' +
'                            <li><a href="../mockup.html" data-target="mockup" data-doc="banner-rollup-angled">Angled Roll-Up Banner Mockup</a></li>\n' +
'                            <li><a href="../mockup.html" data-target="mockup" data-doc="hoodie-model-white">White Hoodie Mockup</a></li>\n' +
'                            <li><a href="../mockup.html" data-target="mockup" data-doc="hoodie-model-white-back">White Hoodie Back Mockup</a></li>\n' +
'                            <li><a href="../mockup.html" data-target="mockup" data-doc="frame-black-interior">Interior Framed Poster Mockup</a></li>\n' +
'                            <li><a href="../mockup.html" data-target="mockup" data-doc="bucket-hat-white">White Bucket Hat Mockup</a></li>\n' +
'                            <li><a href="../mockup.html" data-target="mockup" data-doc="tshirt-hanger-white">T-Shirt Mockup</a></li>\n' +
'                            <li><a href="../mockup.html" data-target="mockup" data-doc="hoodie-hanger-white">Hoodie Mockup</a></li>\n' +
'                            <li><a href="../mockup.html" data-target="mockup" data-doc="wood-a4">Framed Poster Mockup</a></li>\n' +
'                            <li><a href="../mockup.html" data-target="mockup" data-doc="frame-black-shelf">Framed Poster Wall Mockup</a></li>\n' +
'                            <li><a href="../mockup.html" data-target="mockup" data-doc="frame-wood-linen">Linen Framed Print Mockup</a></li>\n' +
'                            <li><a href="../mockup.html" data-target="mockup" data-doc="bag-paper-held">Packaging Mockup</a></li>\n' +
'                        </ul>\n' +
'                    </div>\n' +
'                    <div>\n' +
'                        <h2>Editors</h2>\n' +
'                        <ul>\n' +
'                            <li><a href="../resume.html" data-target="resume">Resume Builder</a></li>\n' +
'                            <li><a href="../docs.html" data-target="docs">Business Document Builder</a></li>\n' +
'                            <li><a href="../poster.html" data-target="poster">Poster Creator</a></li>\n' +
'                            <li><a href="../mockup.html" data-target="mockup">Product Mockup Generator</a></li>\n' +
'                        </ul>\n' +
'                    </div>\n' +
'                    <div>\n' +
'                        <h2>Learn</h2>\n' +
'                        <ul>\n' +
'                            <li><a href="../blog.html">Guides and Articles</a></li>\n' +
'                            <li><a href="../index.html#templates">All Templates</a></li>\n' +
'                        </ul>\n' +
'                    </div>\n' +
'                    <div>\n' +
'                        <h2>Company</h2>\n' +
'                        <ul>\n' +
'                            <li><a href="../about.html">About TemplateBox</a></li>\n' +
'                            <li><a href="../privacy.html">Privacy Policy</a></li>\n' +
'                            <li><a href="../terms.html">Terms of Use</a></li>\n' +
'                        </ul>\n' +
'                    </div>\n' +
'                    <div class="nav-more-social">\n' +
'                        <h2>Follow</h2>\n' +
'                        <div>\n' +
'                            <a href="https://x.com/Templatebox26" target="_blank" rel="noopener noreferrer" aria-label="TemplateBox on X"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>\n' +
'                            <a href="https://www.facebook.com/profile.php?id=61592027191178" target="_blank" rel="noopener noreferrer" aria-label="TemplateBox on Facebook"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M24 12.073C24 5.446 18.627.073 12 .073S0 5.446 0 12.073c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg></a>\n' +
'                            <a href="https://www.tiktok.com/@templatebox26" target="_blank" rel="noopener noreferrer" aria-label="TemplateBox on TikTok"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg></a>\n' +
'                            <a href="https://www.instagram.com/templatebox26/" target="_blank" rel="noopener noreferrer" aria-label="TemplateBox on Instagram"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg></a>\n' +
'                        </div>\n' +
'                    </div>\n' +
'                </div>\n' +
'            </div>\n';

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

        /* og-cover.png, not logo.png. The logo is 1219x1509, so every OG
           consumer cropped it to its own 1.91:1 frame and a post with no
           cover image shared as a mangled square. og-cover.png is the
           site-wide 1200x630 card, which is what that frame expects.

           The declared width/height pair goes with the FALLBACK only: its
           dimensions are known, whereas a post's own cover is whatever the
           author uploaded, and a wrong declared pair renders the card badly
           where a missing one only costs a measuring round trip. That is the
           same reasoning that stripped the pair from the logo.png pages. */
        const ogImage = cover || (POST_ORIGIN + "/assets/og-cover.png");
        const ogImageDims = cover ? "" :
'    <meta property="og:image:width" content="1200">\n' +
'    <meta property="og:image:height" content="630">\n';
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
    ogImageDims +
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
'        <button type="button" class="nav-toggle" data-nav-toggle aria-expanded="false" aria-controls="site-nav" aria-label="Open navigation menu"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>\n' +
'        <nav class="site-nav" id="site-nav" aria-label="Primary">\n' +
'            <a href="../index.html">Templates</a>\n' +
'            <a href="../blog.html" aria-current="page">Guides</a>\n' +
'            <a href="../about.html">About</a>\n' +
MEGA_MENU +
'            <button type="button" class="theme-toggle" data-theme-toggle aria-label="Switch to dark theme" title="Switch to dark theme"><svg class="icon-moon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/></svg><svg class="icon-sun" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/></svg></button>\n' +
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
'             leaderboard here, 300x250 after the second block, and a second\n' +
'             300x250 at the end of the article. The rail beside the article\n' +
'             (below) mounts separately via TBAds.mountContentAds(), which\n' +
'             runs unconditionally regardless of data-ads-static: a single\n' +
'             160x600 from 83.5rem, a three-slot 300x250 stack from 93rem,\n' +
'             nothing narrower. Passive formats only -- no Popunder and no\n' +
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
'            <aside class="content-rail" data-ad-content-rail aria-label="Advertisements">\n' +
'                <div data-ad-rail-slot></div>\n' +
'                <div data-ad-rail-slot></div>\n' +
'                <div data-ad-rail-slot></div>\n' +
'            </aside>\n' +
'        </div>\n' +
'    </main>\n\n' +
'\n' +
/* No site-wide anchor here, deliberately. Article pages already mount the
   leaderboard zones into the host above, and the anchor draws from those same
   two zones -- putting one here would serve a single zone key twice in one
   page view. They also already carry four units. If an anchor is ever wanted
   on article pages, get a dedicated zone from Adsterra first. */
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
        if (workJson === liveJson) {
            setText(el.sync, base + "In sync with the deployed data file.");
        } else if (workJson === lastPublishedJson) {
            setText(el.sync, base + "Published to the project folder. Commit and push to deploy.");
        } else {
            setText(el.sync, base + "Changes not yet exported to js/blog-data.js.");
        }
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
        setText(el.coverNote, "");
        el.formTitle.textContent = "Add New Blog Post";
        el.saveBtn.textContent = "Add Blog Post";
        /* Belt and braces against a reset landing between an upload starting
           and its finally clause: the form must never come back unusable. */
        el.saveBtn.disabled = false;
        el.previewBtn.disabled = false;
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
        /* The disabled Save button is not the guard. A form submits on Enter
           in any text field, and requestSubmit() ignores button state
           entirely -- so without this the post still saved mid-encode, with
           no cover, while the preview filled in a moment later. */
        if (el.saveBtn.disabled) {
            setText(el.formError, "The cover image is still being processed. It will only take a moment.");
            return;
        }
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
        /* Do not claim a save that did not land. save() writes the quota
           warning into formError, and resetFormKeepStatus carries both lines
           across the reset -- without that the warning was written and wiped
           in the same tick, which is how it went unnoticed. */
        const persisted = save();
        setText(el.formStatus, persisted
            ? "Saved to the local workspace. Use the Publish panel above to export js/blog-data.js when ready."
            : "");
        resetFormKeepStatus();
    });

    /* Carries the error across too, not just the status. save() writes its
       quota warning into formError, and resetForm clears it -- so the warning
       was written and wiped in the same tick, which is exactly how a save
       that never landed went on reporting success. */
    function resetFormKeepStatus() {
        const status = el.formStatus.textContent;
        const error = el.formError.textContent;
        resetForm();
        setText(el.formStatus, status);
        setText(el.formError, error);
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
       otherwise processing terminates immediately.

       Oversize uploads are re-encoded to fit rather than refused (August 24,
       2026). The old behaviour was a flat "exceeds 400 KB" rejection, which
       made an ordinary phone photograph unusable as a cover and left the
       operator to go and shrink it by hand -- while the catalog half of this
       same panel had done the shrinking for them since the day before.

       **The budget is far tighter than a thumbnail's and the reason is the
       data file.** A cover is inlined into js/blog-data.js as a data URI, and
       base64 costs another third on top, so every cover is paid for by every
       visitor who loads blog.html -- not just the one reading that post. Ten
       posts at the old 400 KB cap is a 5 MB script. At 120 KB it is 1.6 MB,
       which is still the largest thing on that page and is why the URL field
       next to this one is worth using for anything heavy.

       No reshape: a cover has no fixed frame to conform to, unlike a catalog
       thumbnail. 1600px is twice the widest it renders, which covers a 2x
       display without paying for pixels nobody sees.
       ---------------------------------------------------------------------- */
    const COVER_TARGET_BYTES = 120 * 1024;
    const COVER_MAX_EDGE = 1600;

    el.coverFile.addEventListener("change", async () => {
        setText(el.coverError, "");
        setText(el.coverNote, "");
        const file = el.coverFile.files && el.coverFile.files[0];
        if (!file) {
            return;
        }
        /* Saving mid-encode stored the post with NO cover, then the encode
           finished and filled the preview -- so the panel showed an image the
           saved post did not have, silently. Disabling the input alone was
           not enough: Save is a separate control and stayed live. */
        setCoverBusy(true);
        try {
            const shot = await window.TBAdminImage.prepare(file, {
                targetBytes: COVER_TARGET_BYTES,
                maxEdge: COVER_MAX_EDGE,
                oversizeMessage: "Rejected: file is over 24 MB. Export a smaller copy first.",
                onProgress: (message) => setText(el.coverNote, message)
            });
            coverData = shot.data;
            el.coverUrl.value = "";
            setText(el.coverNote, shot.note);
            showCoverPreview();
        } catch (err) {
            el.coverFile.value = "";
            setText(el.coverNote, "");
            setText(el.coverError, err.message);
        } finally {
            setCoverBusy(false);
        }
    });

    /* One switch for every control that must not be used while an upload is
       still being encoded. */
    function setCoverBusy(busy) {
        el.coverFile.disabled = busy;
        el.saveBtn.disabled = busy;
        el.previewBtn.disabled = busy;
        el.saveBtn.textContent = busy
            ? "Waiting for the image..."
            : (editingSlug ? "Save Changes" : "Add Blog Post");
    }

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
        setText(el.coverNote, "");
        showCoverPreview();
    });

    /* ----------------------------------------------------------------------
       Export bindings + boot
       ---------------------------------------------------------------------- */
    /* ----------------------------------------------------------------------
       Publishing the blog straight into the working copy (August 24, 2026).

       The four exports above stay: they are the only route on Firefox and
       Safari, and the only route with no folder connected. This removes the
       manual half of all four at once, which mattered more here than it did
       for thumbnails -- a post needed FOUR artifacts placed by hand, and
       forgetting the third leaves the post invisible to anything that does
       not run JavaScript (BLOG_POSTS_NOT_CRAWLABLE_WITHOUT_JAVASCRIPT.md).

       Two of the four are whole-file writes with nothing to preserve:
       js/blog-data.js and every blog/<slug>.html are generated in full. Only
       blog.html's archive list and sitemap.xml need surgical edits, and both
       have a single unambiguous anchor.

       Order is the safety, exactly as on the thumbnail side: write and patch
       everything first, RECONCILE LAST. A run that dies early leaves a page
       nothing links to, which is inert. Deleting first would leave blog.html
       and sitemap.xml pointing at pages that no longer exist.
       ---------------------------------------------------------------------- */
    const FS = window.TBProjectFolder;
    const DATA_PATH = "js/blog-data.js";
    const BLOG_INDEX_PATH = "blog.html";
    const SITEMAP_PATH = "sitemap.xml";

    function visiblePosts() {
        return posts.filter((p) => p && p.visible !== false && p.slug && p.title);
    }

    /* Replaces the <ul> inside <nav class="guide-archive">. That list is the
       ONLY link to a post in blog.html's served markup, so it is also the
       one thing here whose absence is invisible until a crawler tells you
       months later. */
    function patchGuideArchive(html) {
        const masked = maskComments(html);
        const nav = masked.search(/<nav class="guide-archive"[^>]*>/);
        if (nav === -1) {
            throw new Error("blog.html has no <nav class=\"guide-archive\">, so the archive cannot be updated.");
        }
        const navEnd = masked.indexOf("</nav>", nav);
        const listStart = masked.indexOf("<ul", nav);
        const listEnd = masked.indexOf("</ul>", listStart);
        if (listStart === -1 || listEnd === -1 || navEnd === -1 ||
                listStart > navEnd || listEnd > navEnd) {
            throw new Error("blog.html's guide archive has no <ul> to replace.");
        }
        /* Back up over the indentation so the replacement supplies its own. */
        let from = listStart;
        while (from > 0 && (html.charAt(from - 1) === " " || html.charAt(from - 1) === "\t")) {
            from -= 1;
        }
        const nl = newlineOf(html);
        const block = buildArchiveList().replace(/\r?\n$/, "");
        return html.slice(0, from) +
            (nl === "\n" ? block : block.split("\n").join(nl)) +
            html.slice(listEnd + "</ul>".length);
    }

    function verifyArchive(before, after) {
        if (after.length < before.length * 0.75) {
            return "blog.html lost a quarter of its content";
        }
        const doc = new DOMParser().parseFromString(after, "text/html");
        if (doc.querySelector("parsererror")) {
            return "the patched blog.html does not parse";
        }
        const nav = doc.querySelector(".guide-archive");
        if (!nav) {
            return "the guide archive is gone from the patched markup";
        }
        const hrefs = Array.from(nav.querySelectorAll("a")).map((a) => a.getAttribute("href"));
        const wanted = visiblePosts().map((p) => "blog/" + encodeURIComponent(p.slug) + ".html");
        if (hrefs.length !== wanted.length) {
            return "the archive lists " + hrefs.length + " posts, expected " + wanted.length;
        }
        const missing = wanted.filter((h) => hrefs.indexOf(h) === -1);
        if (missing.length) {
            return "the archive does not link " + missing.join(", ");
        }
        return null;
    }

    /* Adds, updates and removes the <url> blocks whose <loc> is a blog post,
       and touches nothing else. Rewriting the whole file from the post list
       would be shorter and would silently drop every hand-maintained URL in
       it -- the editors, the landing pages, the homepage. */
    function patchSitemap(xml) {
        const nl = newlineOf(xml);
        const visible = visiblePosts();
        const wanted = new Map();
        visible.forEach((p) => {
            wanted.set(POST_ORIGIN + "/blog/" + p.slug + ".html", p.updated || p.date || todayIso());
        });

        let out = xml;
        const seen = new Set();

        /* Existing blog blocks: refresh the ones still wanted, drop the rest. */
        const blocks = [...out.matchAll(/[ \t]*<url>[\s\S]*?<\/url>\r?\n?/g)];
        for (let i = blocks.length - 1; i >= 0; i -= 1) {
            const block = blocks[i][0];
            const loc = (block.match(/<loc>([^<]+)<\/loc>/) || [])[1];
            if (!loc || loc.indexOf("/blog/") === -1) {
                continue;
            }
            if (wanted.has(loc)) {
                seen.add(loc);
                const fixed = block.replace(/<lastmod>[^<]*<\/lastmod>/,
                    "<lastmod>" + wanted.get(loc) + "</lastmod>");
                out = out.slice(0, blocks[i].index) + fixed +
                    out.slice(blocks[i].index + block.length);
            } else {
                out = out.slice(0, blocks[i].index) +
                    out.slice(blocks[i].index + block.length);
            }
        }

        /* Anything not already present goes in before the closing tag. */
        const additions = [];
        wanted.forEach((lastmod, loc) => {
            if (seen.has(loc)) { return; }
            additions.push(
                "  <url>" + nl +
                "    <loc>" + loc + "</loc>" + nl +
                "    <lastmod>" + lastmod + "</lastmod>" + nl +
                "  </url>" + nl);
        });
        if (additions.length) {
            const close = out.lastIndexOf("</urlset>");
            if (close === -1) {
                throw new Error("sitemap.xml has no </urlset>, so no URL can be added.");
            }
            let at = close;
            while (at > 0 && (out.charAt(at - 1) === " " || out.charAt(at - 1) === "\t")) {
                at -= 1;
            }
            out = out.slice(0, at) + additions.join("") + out.slice(at);
        }
        return out;
    }

    function verifySitemap(before, after) {
        const doc = new DOMParser().parseFromString(after, "text/xml");
        if (doc.querySelector("parsererror")) {
            return "the patched sitemap.xml is not valid XML";
        }
        const locs = Array.from(doc.querySelectorAll("url > loc")).map((n) => n.textContent.trim());
        const wanted = visiblePosts().map((p) => POST_ORIGIN + "/blog/" + p.slug + ".html");
        const missing = wanted.filter((l) => locs.indexOf(l) === -1);
        if (missing.length) {
            return "sitemap.xml does not list " + missing.join(", ");
        }
        const strayBlog = locs.filter((l) => l.indexOf("/blog/") >= 0 && wanted.indexOf(l) === -1);
        if (strayBlog.length) {
            return "sitemap.xml still lists " + strayBlog.join(", ");
        }
        /* Every non-post URL in the file must survive untouched. */
        const beforeDoc = new DOMParser().parseFromString(before, "text/xml");
        const keep = Array.from(beforeDoc.querySelectorAll("url > loc"))
            .map((n) => n.textContent.trim())
            .filter((l) => l.indexOf("/blog/") === -1);
        const dropped = keep.filter((l) => locs.indexOf(l) === -1);
        if (dropped.length) {
            return "sitemap.xml lost " + dropped.length + " non-post URL(s): " + dropped.join(", ");
        }
        return null;
    }

    async function publishBlog() {
        if (!FS || !FS.isConnected()) {
            setText(el.exportStatus, "Connect the project folder first, or use the Download and Copy buttons.");
            return;
        }
        const visible = visiblePosts();
        if (!visible.length) {
            setText(el.exportStatus, "No visible posts to publish.");
            return;
        }

        setText(el.exportStatus, "Publishing " + visible.length + " post(s)...");
        try {
            await FS.writeFile(DATA_PATH, new Blob([buildDataFile()], { type: "text/javascript" }));
            for (const post of visible) {
                await FS.writeFile("blog/" + post.slug + ".html",
                    new Blob([buildPostPage(post)], { type: "text/html" }));
            }

            const blogBefore = await FS.readText(BLOG_INDEX_PATH);
            const blogAfter = patchGuideArchive(blogBefore);
            const blogProblem = verifyArchive(blogBefore, blogAfter);
            if (blogProblem) {
                throw new Error("blog.html was left untouched: " + blogProblem);
            }
            await FS.writeFile(BLOG_INDEX_PATH, new Blob([blogAfter], { type: "text/html" }));

            const mapBefore = await FS.readText(SITEMAP_PATH);
            const mapAfter = patchSitemap(mapBefore);
            const mapProblem = verifySitemap(mapBefore, mapAfter);
            if (mapProblem) {
                throw new Error("sitemap.xml was left untouched: " + mapProblem);
            }
            await FS.writeFile(SITEMAP_PATH, new Blob([mapAfter], { type: "application/xml" }));

            /* Reconcile LAST. Every page in blog/ is generated from this
               workspace, so one with no visible post behind it is a page for
               a deleted or hidden post -- still served, still crawlable, and
               no longer linked from anywhere. */
            const keep = new Set(visible.map((p) => p.slug + ".html"));
            const present = await FS.listDir("blog");
            const removed = [];
            for (const name of present) {
                if (name.endsWith(".html") && !keep.has(name)) {
                    if (await FS.deleteFile("blog/" + name)) {
                        removed.push(name);
                    }
                }
            }

            lastPublishedJson = JSON.stringify(posts);
            renderSyncState();
            setText(el.exportStatus, "Published into " + FS.folderName() + "/: js/blog-data.js, " +
                visible.length + " post page(s), the guides archive in blog.html and sitemap.xml." +
                (removed.length
                    ? " Removed " + removed.length + " page(s) with no visible post: " + removed.join(", ") + "."
                    : "") +
                " Review with git diff, then commit and push to deploy.");
        } catch (err) {
            setText(el.exportStatus, "Stopped: " + err.message);
        }
    }

    function renderBlogFsState(state, detail) {
        if (!el.fsState) {
            return;
        }
        const messages = {
            unsupported: "This browser cannot write to the project folder. Chrome and Edge can; Firefox and Safari cannot. Use the Download and Copy buttons.",
            disconnected: "Not connected. Publishing writes all four artifacts for you; without it, use the Download and Copy buttons and place them by hand.",
            "needs-permission": "A project folder is remembered but the browser dropped its permission on restart. Reconnect to publish.",
            connected: "Connected to " + (detail || "the project folder") +
                ". Publish writes the data file, the post pages, the guides archive and sitemap.xml."
        };
        setText(el.fsState, messages[state] || messages.disconnected);
        const supported = state !== "unsupported";
        el.fsConnect.hidden = !supported || state === "connected";
        el.fsConnect.textContent = state === "needs-permission"
            ? "Reconnect Project Folder"
            : "Connect Project Folder";
        el.fsDisconnect.hidden = state !== "connected";
        el.publishBtn.hidden = state !== "connected";
    }

    /* Every path must end in a rendered state. restore() reads IndexedDB and
       asks the browser to vouch for a stored handle, and either can reject --
       blocked storage, a partitioned context, a handle the browser will not
       stand behind. When that rejection was left unhandled the renderer never
       ran, so the panel kept the markup's own defaults: no status text and
       every button still carrying its `hidden` attribute. The result was a
       publish feature that could not be reached OR explained. Falling back to
       "disconnected" always leaves Connect available. */
    async function refreshBlogFsState() {
        if (!FS || !FS.supported()) {
            renderBlogFsState("unsupported");
            return;
        }
        if (FS.isConnected()) {
            renderBlogFsState("connected", FS.folderName());
            return;
        }
        try {
            renderBlogFsState(await FS.restore(), FS.folderName());
        } catch (err) {
            renderBlogFsState("disconnected");
            setText(el.exportStatus, "Could not check for a remembered project folder (" +
                err.message + "). Connecting one still works.");
        }
    }

    if (FS && el.fsConnect) {
        el.fsConnect.addEventListener("click", async () => {
            setText(el.exportStatus, "");
            try {
                const name = el.fsConnect.textContent.indexOf("Reconnect") === 0
                    ? await FS.reconnect()
                    : await FS.connect();
                renderBlogFsState("connected", name);
            } catch (err) {
                if (err && err.name === "AbortError") { return; }
                setText(el.exportStatus, err.message);
            }
        });
        el.fsDisconnect.addEventListener("click", async () => {
            await FS.disconnect();
            renderBlogFsState("disconnected");
            setText(el.exportStatus, "Disconnected. Nothing was changed in the project.");
        });
        el.publishBtn.addEventListener("click", () => publishBlog().catch((err) => {
            setText(el.exportStatus, "Stopped: " + err.message);
        }));
        /* One folder, two panels: a connect made in the thumbnail panel has
           to show up here too. */
        window.addEventListener("tb-project-folder-changed", refreshBlogFsState);
    }

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
    refreshBlogFsState();
})();

/* ==========================================================================
   TemplateBox - Catalog Thumbnail Workspace (admin.html)
   Scope: attaching a default thumbnail (required) and an optional hover
   thumbnail to a homepage catalog card, previewing the pair in the
   production markup, and exporting the two renamed image files plus the
   markup block that references them.
   Depends on: js/app.js (TB) only.

   Why this is artifact-based rather than data-driven: the homepage catalog
   has no data file. The 18 cards in index.html are hand-written markup, so
   there is nothing here to generate the way js/blog-data.js is generated for
   the blog, and inventing a catalog registry would mean rewriting index.html
   to render from it -- a much larger change than "let me attach two images".
   What this exports instead is what the workflow actually needs: the images,
   named to the convention, and the block to paste.

   The two-image convention it targets already exists in index.html: an
   .card-thumb-blank image is the card at rest, and a .card-thumb-hover image
   stacked on top of it crossfades in on hover and focus. A card with no
   hover image is a complete card -- 16 of the 18 are exactly that today --
   which is why the hover slot is optional here and never blocks a save.

   Kept as its own IIFE, sharing nothing with the blog workspace above: the
   two workflows have separate storage, separate exports and separate
   failure modes, and either half can be absent from the page.
   ========================================================================== */

(() => {

    const form = document.getElementById("thumb-form");
    if (!form) {
        return;
    }

    const STORAGE_KEY = "tb_admin_catalog_thumbs";


    /* One record per catalog category: the filter value on the card's
       data-category, the visible label above the title, the editor the card
       opens, and the folder new thumbnails default into. */
    const CATEGORIES = {
        documents: {
            label: "Receipts and Invoices",
            page: "docs.html",
            target: "docs",
            folder: "assets/thumbnails/documents"
        },
        resumes: {
            label: "Resumes",
            page: "resume.html",
            target: "resume",
            folder: "assets/thumbnails/resumes"
        },
        canvas: {
            label: "Posters and Prints",
            page: "poster.html",
            target: "poster",
            folder: "assets/thumbnails/posters"
        },
        mockups: {
            label: "Product Mockups",
            page: "mockup.html",
            target: "mockup",
            folder: "assets/thumbnails/product-mockups"
        }
    };

    /* The catalog as index.html ships it, in source order. This is a picker,
       not a database: nothing reads it at runtime on the public site, and a
       card added to index.html without being added here still works -- it
       just has to be re-entered as a new item to get thumbnails.

       `id` is the file-name stem. Where a card carries data-doc it is that
       value, so the file name matches the variant the card already names.
       The three resume cards and the three poster cards carry no data-doc
       (they all open the same editor with no preset), so their ids are
       derived from their titles and `doc` is null -- the generated markup
       omits the attribute rather than inventing one, which would send a
       preset to an editor with no variant table to match it against.

       `folder` is present only where a card already has thumbnails on disk,
       so re-exporting one regenerates its existing path rather than moving
       the file. Everything else falls back to the category default. */
    const CATALOG_ITEMS = [
        { id: "rent-receipt", title: "Rent Receipt", category: "documents", doc: "rent-receipt" },
        { id: "payment-receipt", title: "Cash Payment Receipt", category: "documents", doc: "payment-receipt" },
        { id: "business-receipt", title: "Itemized Business Receipt", category: "documents", doc: "business-receipt" },
        { id: "sales-receipt", title: "Sales and Cash Receipt Form", category: "documents", doc: "sales-receipt" },
        { id: "invoice", title: "Professional Invoice", category: "documents", doc: "invoice" },
        { id: "warning-notice", title: "Employee Warning Notice", category: "documents", doc: "warning-notice" },
        { id: "executive-resume", title: "Executive Resume", category: "resumes", doc: "executive-resume" },
        { id: "grey-rail", title: "Modern Professional CV", category: "resumes", doc: "grey-rail" },
        { id: "minimalist-ats-resume", title: "Minimalist ATS Resume", category: "resumes", doc: "minimalist-ats-resume" },
        { id: "ruled-serif", title: "Ruled Serif CV", category: "resumes", doc: "ruled-serif" },
        /* These three carried a `framed: true` flag until August 23, 2026,
           when the wood-a4 hover composite was removed at the owner's
           request. They are ordinary photo cards now: two thumbnails, the
           second optional, exactly like every other entry here. */
        { id: "framed-photo-poster", title: "Framed Photo Poster", category: "canvas", doc: null },
        { id: "matte-wood-canvas", title: "Matte Wood Canvas", category: "canvas", doc: null },
        { id: "polished-gold-frame", title: "Polished Gold Frame", category: "canvas", doc: null },
        {
            id: "tshirt-hanger-white", title: "T-Shirt Mockup", category: "mockups", doc: "tshirt-hanger-white",
            folder: "assets/thumbnails/product-mockups/apparel/t-shirts/tshirt-hanger-white"
        },
        {
            id: "hoodie-hanger-white", title: "Hoodie Mockup", category: "mockups", doc: "hoodie-hanger-white",
            folder: "assets/thumbnails/product-mockups/apparel/hoodies/hoodie-hanger-white"
        },
        {
            id: "frame-black-shelf", title: "Framed Poster Wall Mockup", category: "mockups", doc: "frame-black-shelf",
            folder: "assets/thumbnails/product-mockups/print/posters-and-frames/frame-black-shelf"
        },
        {
            id: "frame-wood-linen", title: "Linen Framed Print Mockup", category: "mockups", doc: "frame-wood-linen",
            folder: "assets/thumbnails/product-mockups/print/posters-and-frames/frame-wood-linen"
        },
        {
            id: "bag-paper-held", title: "Packaging Mockup", category: "mockups", doc: "bag-paper-held",
            folder: "assets/thumbnails/product-mockups/packaging/bags/bag-paper-held"
        },
        {
            id: "wood-a4", title: "Leaning Wood Frame Poster Mockup", category: "mockups", doc: "wood-a4",
            folder: "assets/thumbnails/product-mockups/print/posters-and-frames/wood-a4"
        },
        {
            id: "tshirt-model-white", title: "White T-Shirt on Model Mockup", category: "mockups", doc: "tshirt-model-white",
            folder: "assets/thumbnails/product-mockups/apparel/t-shirts/tshirt-model-white"
        },
        {
            id: "cap-model-white", title: "White Baseball Cap Mockup", category: "mockups", doc: "cap-model-white",
            folder: "assets/thumbnails/product-mockups/apparel/hats/baseball-caps/cap-model-white"
        },
        {
            id: "bag-paper-white", title: "White Paper Bag Mockup", category: "mockups", doc: "bag-paper-white",
            folder: "assets/thumbnails/product-mockups/packaging/bags/bag-paper-white"
        },
        {
            id: "card-white-walnut", title: "Business Card Mockup", category: "mockups", doc: "card-white-walnut",
            folder: "assets/thumbnails/product-mockups/print/business-cards/card-white-walnut"
        },
        {
            id: "card-white-duotone", title: "Duotone Business Card Mockup", category: "mockups", doc: "card-white-duotone",
            folder: "assets/thumbnails/product-mockups/print/business-cards/card-white-duotone"
        },
        {
            id: "banner-rollup-white", title: "Roll-Up Banner Mockup", category: "mockups", doc: "banner-rollup-white",
            folder: "assets/thumbnails/product-mockups/print/signage/banner-rollup-white"
        },
        {
            id: "banner-rollup-angled", title: "Angled Roll-Up Banner Mockup", category: "mockups", doc: "banner-rollup-angled",
            folder: "assets/thumbnails/product-mockups/print/signage/banner-rollup-angled"
        },
        {
            id: "hoodie-model-white", title: "White Hoodie Mockup", category: "mockups", doc: "hoodie-model-white",
            folder: "assets/thumbnails/product-mockups/apparel/hoodies/hoodie-model-white"
        },
        {
            id: "frame-black-interior", title: "Interior Framed Poster Mockup", category: "mockups", doc: "frame-black-interior",
            folder: "assets/thumbnails/product-mockups/print/posters-and-frames/frame-black-interior"
        },
        {
            id: "bucket-hat-white", title: "White Bucket Hat Mockup", category: "mockups", doc: "bucket-hat-white",
            folder: "assets/thumbnails/product-mockups/apparel/hats/bucket-hats/bucket-hat-white"
        },
        {
            id: "tshirt-model-white-back", title: "White T-Shirt Back Mockup", category: "mockups", doc: "tshirt-model-white-back",
            folder: "assets/thumbnails/product-mockups/apparel/t-shirts/tshirt-model-white-back"
        },
        {
            id: "hoodie-model-white-back", title: "White Hoodie Back Mockup", category: "mockups", doc: "hoodie-model-white-back",
            folder: "assets/thumbnails/product-mockups/apparel/hoodies/hoodie-model-white-back"
        }
    ];

    const el = {
        item: document.querySelector("[data-thumb-item]"),
        newFields: document.querySelector("[data-thumb-new-fields]"),
        newId: document.getElementById("f-thumb-id"),
        newTitle: document.getElementById("f-thumb-title"),
        newCategory: document.querySelector("[data-thumb-category]"),
        newDoc: document.getElementById("f-thumb-doc"),
        folder: document.getElementById("f-thumb-folder"),
        fit: document.querySelector("[data-thumb-fit]"),
        defaultFile: document.querySelector("[data-thumb-default-file]"),
        defaultError: document.querySelector("[data-thumb-default-error]"),
        defaultNote: document.querySelector("[data-thumb-default-note]"),
        defaultRemove: document.querySelector("[data-thumb-default-remove]"),
        hoverFile: document.querySelector("[data-thumb-hover-file]"),
        hoverError: document.querySelector("[data-thumb-hover-error]"),
        hoverNote: document.querySelector("[data-thumb-hover-note]"),
        hoverRemove: document.querySelector("[data-thumb-hover-remove]"),
        preview: document.querySelector("[data-thumb-preview]"),
        previewDefault: document.querySelector("[data-thumb-preview-default]"),
        previewHover: document.querySelector("[data-thumb-preview-hover]"),
        previewLabel: document.querySelector("[data-thumb-preview-label]"),
        previewTitle: document.querySelector("[data-thumb-preview-title]"),
        error: document.querySelector("[data-thumb-error]"),
        formStatus: document.querySelector("[data-thumb-form-status]"),
        saveBtn: document.querySelector("[data-thumb-save]"),
        copy: document.querySelector("[data-thumb-copy]"),
        clear: document.querySelector("[data-thumb-clear]"),
        list: document.querySelector("[data-thumb-list]"),
        sync: document.querySelector("[data-thumb-sync]"),
        status: document.querySelector("[data-thumb-status]"),
        downloadAll: document.querySelector("[data-thumb-download-all]"),
        fsState: document.querySelector("[data-thumb-fs-state]"),
        fsConnect: document.querySelector("[data-thumb-fs-connect]"),
        fsDisconnect: document.querySelector("[data-thumb-fs-disconnect]"),
        fsPublishAll: document.querySelector("[data-thumb-publish-all]")
    };

    const NEW_ITEM = "__new__";

    /* Saved records, keyed by id. Shape:
       { id, title, category, doc, folder,
         defaultImage: { data, ext, w, h }, hoverImage: null | same, updated } */
    const restored = TB.storageGet(STORAGE_KEY);
    let items = Array.isArray(restored) ? restored : [];

    /* The record being edited, or null. Images live here until saved so that
       an abandoned edit never touches the stored workspace. */
    let draftDefault = null;
    let draftHover = null;
    let editingId = null;
    /* Set only by the hover Remove button: the operator saying the card
       should have no hover thumbnail, as distinct from one never being
       loaded. Publishing refuses to delete a live hover file without it. */
    let hoverCleared = false;

    function setText(target, message) {
        if (target) {
            target.textContent = message || "";
        }
    }

    function todayIso() {
        const d = new Date();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return d.getFullYear() + "-" + mm + "-" + dd;
    }

    function slugish(value) {
        return String(value || "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
    }

    function catalogItem(id) {
        return CATALOG_ITEMS.find((entry) => entry.id === id) || null;
    }

    function savedItem(id) {
        return items.find((entry) => entry.id === id) || null;
    }

    function defaultFolder(item) {
        return item.folder || CATEGORIES[item.category].folder;
    }

    /* Both file names in one place. -thumb-blank is the resting state and
       -thumb is the hover state, matching the two pairs already on disk. */
    function thumbPath(record, which) {
        const shot = which === "hover" ? record.hoverImage : record.defaultImage;
        const suffix = which === "hover" ? "-thumb." : "-thumb-blank.";
        return record.folder + "/" + record.id + suffix + shot.ext;
    }

    function fileName(record, which) {
        const path = thumbPath(record, which);
        return path.slice(path.lastIndexOf("/") + 1);
    }

    /* ----------------------------------------------------------------------
       Persistence. TB.storageSet swallows quota and private-mode failures by
       design, so the write is read back: a workspace holding several images
       is exactly the case that fills the quota, and silently losing an
       upload the operator believes is saved is the failure worth catching.
       ---------------------------------------------------------------------- */
    function save() {
        TB.storageSet(STORAGE_KEY, items);
        const stored = TB.storageGet(STORAGE_KEY);
        const persisted = Array.isArray(stored) && stored.length === items.length;
        renderList();
        renderSyncState();
        if (!persisted) {
            setText(el.status, "Warning: this browser did not store the workspace, most likely because the images filled its quota. Download the images now; deleting exported items frees space.");
        }
        return persisted;
    }

    /* ----------------------------------------------------------------------
       Encoder.

       The pipeline itself lives in js/admin-image.js, shared with the blog
       cover intake in the IIFE above. Only the numbers are local: what a
       catalog thumbnail is FOR decides the budget, the pixel cap and the
       4:5 reshape, and none of that belongs to a blog cover.
       ---------------------------------------------------------------------- */
    const IMG = window.TBAdminImage;
    const EXT_BY_TYPE = IMG.EXT_BY_TYPE;
    const kb = IMG.kb;
    const decode = IMG.decode;
    const blobToDataUri = IMG.blobToDataUri;

    /* Calibrated against the four thumbnails already on disk, which run
       46-83 KB at 600x750 and 800x1000 -- about 0.8 bits per pixel. The
       1000px cap is the long edge of the largest shipped thumbnail, already
       far more pixels than the card needs at roughly 240 CSS px wide. */
    const TARGET_BYTES = 60 * 1024;
    const OUTPUT_MAX_EDGE = 1000;

    /* .card-preview is `aspect-ratio: 4 / 5` and `.card-preview.photo
       .card-thumb` is `object-fit: contain`. Change either and this has to
       move with it, or thumbnails start being letterboxed again -- the
       defect this exists to stop. The Leaning Wood Frame pair shipped at
       1000x1000, square, and lost about a fifth of its card to empty
       ground. Making the FILE 4:5 leaves `contain` nothing to decide. */
    const CARD_ASPECT = 4 / 5;

    function isCardRatio(source) {
        const w = source.naturalWidth || source.width;
        const h = source.naturalHeight || source.height;
        return Math.abs((w / h) - CARD_ASPECT) <= 0.001;
    }

    async function readImage(file, onOk, onFail, onProgress, mode) {
        try {
            onOk(await IMG.prepare(file, {
                targetBytes: TARGET_BYTES,
                maxEdge: OUTPUT_MAX_EDGE,
                aspect: CARD_ASPECT,
                aspectLabel: "4:5",
                fitMode: mode,
                oversizeMessage: "Rejected: file is over 24 MB. That is a full-resolution photograph, not a thumbnail; export a smaller copy first.",
                onProgress: onProgress
            }));
        } catch (err) {
            onFail(err.message);
        }
    }

    /* Read at upload time rather than stored: the control applies to the
       NEXT file chosen, and an operator who changes it and re-picks the same
       file expects the new answer. "fill" whenever the control is missing,
       which is also what an older saved draft implies. */
    function cardFitMode() {
        return el.fit && el.fit.value === "fit" ? "fit" : "fill";
    }

    /* A COUNTER rather than a flag: this half has two upload slots and either
       can be encoding, so a flag cleared by whichever finished first would
       re-enable Save while the other was still running -- the same silent
       drop the blog cover had. */
    let thumbEncodes = 0;

    function setThumbBusy(delta) {
        thumbEncodes = Math.max(0, thumbEncodes + delta);
        const busy = thumbEncodes > 0;
        el.saveBtn.disabled = busy;
        el.copy.disabled = busy;
        el.saveBtn.textContent = busy ? "Waiting for the image..." : "Save Thumbnails";
    }

    function bindUpload(input, errorTarget, noteTarget, removeBtn, assign, onRemove) {
        input.addEventListener("change", () => {
            setText(errorTarget, "");
            setText(noteTarget, "");
            const file = input.files && input.files[0];
            if (!file) {
                return;
            }
            /* Encoding a large photograph blocks the main thread for a
               moment, so the control is disabled while it runs rather than
               left looking idle and clickable. */
            input.disabled = true;
            setThumbBusy(1);
            readImage(file, (shot) => {
                input.disabled = false;
                setThumbBusy(-1);
                assign(shot);
                setText(noteTarget, shot.note || "");
                renderPreview();
            }, (message) => {
                input.disabled = false;
                setThumbBusy(-1);
                input.value = "";
                assign(null);
                setText(errorTarget, message);
                setText(noteTarget, "");
                renderPreview();
            }, (progress) => {
                setText(noteTarget, progress);
            }, cardFitMode());
        });

        removeBtn.addEventListener("click", () => {
            input.value = "";
            setText(errorTarget, "");
            setText(noteTarget, "");
            assign(null);
            if (onRemove) { onRemove(); }
            renderPreview();
        });
    }

    bindUpload(el.defaultFile, el.defaultError, el.defaultNote, el.defaultRemove, (shot) => {
        draftDefault = shot;
    });
    bindUpload(el.hoverFile, el.hoverError, el.hoverNote, el.hoverRemove, (shot) => {
        draftHover = shot;
        /* A replacement is not a removal: uploading again un-clears it. */
        if (shot) { hoverCleared = false; }
    }, () => {
        /* Pressing Remove is the only way to say "this card should have no
           hover thumbnail". Publishing keys on it, so that an absent hover
           caused by a failed read can never be mistaken for a deliberate
           one and silently delete a live file. */
        hoverCleared = true;
    });

    /* ----------------------------------------------------------------------
       Form
       ---------------------------------------------------------------------- */
    function buildItemOptions() {
        el.item.textContent = "";

        const blank = document.createElement("option");
        blank.value = "";
        blank.textContent = "Select a catalog item";
        el.item.appendChild(blank);

        Object.keys(CATEGORIES).forEach((key) => {
            const group = document.createElement("optgroup");
            group.label = CATEGORIES[key].label;
            CATALOG_ITEMS.filter((entry) => entry.category === key).forEach((entry) => {
                const option = document.createElement("option");
                option.value = entry.id;
                option.textContent = entry.title + (savedItem(entry.id) ? " (has thumbnails)" : "");
                group.appendChild(option);
            });
            el.item.appendChild(group);
        });

        /* Items saved here that are not in CATALOG_ITEMS: cards added to
           index.html after this list was written, or ones not pasted in yet. */
        const extra = items.filter((entry) => !catalogItem(entry.id));
        if (extra.length) {
            const group = document.createElement("optgroup");
            group.label = "Added here";
            extra.forEach((entry) => {
                const option = document.createElement("option");
                option.value = entry.id;
                option.textContent = TB.desanitize(entry.title);
                group.appendChild(option);
            });
            el.item.appendChild(group);
        }

        const addNew = document.createElement("option");
        addNew.value = NEW_ITEM;
        addNew.textContent = "Add a new catalog item";
        el.item.appendChild(addNew);
    }

    function buildCategoryOptions() {
        el.newCategory.textContent = "";
        Object.keys(CATEGORIES).forEach((key) => {
            const option = document.createElement("option");
            option.value = key;
            option.textContent = CATEGORIES[key].label;
            el.newCategory.appendChild(option);
        });
    }

    function isNewSelected() {
        return el.item.value === NEW_ITEM;
    }

    function syncFormToSelection() {
        const value = el.item.value;
        el.newFields.hidden = value !== NEW_ITEM;
        setText(el.error, "");
        setText(el.formStatus, "");
        /* Any hydration still in flight is for the previous selection now. */
        hydrateToken += 1;

        if (!value) {
            clearImages();
            el.folder.value = "";
            editingId = null;
            renderPreview();
            return;
        }

        if (value === NEW_ITEM) {
            clearImages();
            editingId = null;
            el.folder.value = CATEGORIES[el.newCategory.value].folder;
            renderPreview();
            return;
        }

        const saved = savedItem(value);
        const known = catalogItem(value);
        editingId = value;
        clearImages();

        if (saved) {
            draftDefault = saved.defaultImage;
            draftHover = saved.hoverImage;
            el.folder.value = saved.folder;
            setText(el.defaultNote, draftDefault ? draftDefault.note || "" : "");
            setText(el.hoverNote, draftHover ? draftHover.note || "" : "");
        } else if (known) {
            el.folder.value = defaultFolder(known);
            /* Nothing saved for this card yet, so show what the site has
               rather than an empty form that invites overwriting it.

               Not awaited -- this runs from a change handler and the rest of
               the form must not wait on disk. The catch is therefore the only
               thing standing between a bad read and an unhandled rejection
               that leaves the form silently empty, which is worse than it
               sounds: an empty form is exactly what invites uploading over
               thumbnails the card already has. */
            hydrateFromProject(known, hydrateToken).catch((err) => {
                setText(el.formStatus, "Could not read this card's current thumbnails from the project (" +
                    err.message + "). Anything you upload will REPLACE whatever the card has now.");
            });
        }
        renderPreview();
    }

    function clearImages() {
        draftDefault = null;
        draftHover = null;
        el.defaultFile.value = "";
        el.hoverFile.value = "";
        el.defaultFile.disabled = false;
        el.hoverFile.disabled = false;
        setText(el.defaultError, "");
        setText(el.hoverError, "");
        setText(el.defaultNote, "");
        setText(el.hoverNote, "");
        hoverCleared = false;
    }

    /* The record the form currently describes, or an Error message. Used by
       both save and Copy Markup, so the two can never disagree about what is
       valid. */
    function collectRecord() {
        const value = el.item.value;
        if (!value) {
            throw new Error("Choose a catalog item first.");
        }

        let id;
        let title;
        let category;
        let doc;

        if (value === NEW_ITEM) {
            id = slugish(el.newId.value.trim() || el.newTitle.value.trim());
            title = el.newTitle.value.trim();
            category = el.newCategory.value;
            doc = slugish(el.newDoc.value.trim());
            if (!title) {
                throw new Error("A new catalog item needs a card title.");
            }
            if (!id) {
                throw new Error("A new catalog item needs an id (lowercase letters, numbers and hyphens).");
            }
            if (!Object.prototype.hasOwnProperty.call(CATEGORIES, category)) {
                throw new Error("Choose a category.");
            }
            if (id !== editingId && (savedItem(id) || catalogItem(id))) {
                throw new Error("The id \"" + id + "\" is already in use by another catalog item.");
            }
        } else {
            const saved = savedItem(value);
            const known = catalogItem(value);
            const source = known || saved;
            id = source.id;
            title = TB.desanitize(source.title);
            category = source.category;
            doc = source.doc || "";
        }

        const folder = String(el.folder.value || "").trim().replace(/^\/+|\/+$/g, "");
        if (!/^[a-z0-9][a-z0-9/-]*$/.test(folder)) {
            throw new Error("The destination folder may only contain lowercase letters, numbers, hyphens and slashes.");
        }

        if (!draftDefault) {
            throw new Error("A default thumbnail is required. The hover thumbnail is optional.");
        }

        return {
            id: id,
            title: TB.sanitize(title),
            category: category,
            doc: doc || null,
            folder: folder,
            defaultImage: draftDefault,
            hoverImage: draftHover,
            hoverCleared: hoverCleared,
            updated: todayIso()
        };
    }

    form.addEventListener("submit", (evt) => {
        evt.preventDefault();
        setText(el.error, "");
        /* Same reason as the blog form above: Enter in a field and
           requestSubmit() both bypass a disabled button. */
        if (thumbEncodes > 0) {
            setText(el.error, "An image is still being processed. It will only take a moment.");
            return;
        }
        let record;
        try {
            record = collectRecord();
        } catch (err) {
            setText(el.error, err.message);
            return;
        }

        const idx = items.findIndex((entry) => entry.id === (editingId || record.id));
        if (idx >= 0) {
            items[idx] = record;
        } else {
            items.push(record);
        }
        editingId = record.id;

        if (save()) {
            setText(el.formStatus, "Saved to the local workspace. Download the images and copy the markup from the list above when ready.");
        }
        buildItemOptions();
        el.item.value = record.id;
        el.newFields.hidden = true;
        renderPreview();
    });

    el.item.addEventListener("change", syncFormToSelection);
    el.newCategory.addEventListener("change", () => {
        if (isNewSelected()) {
            el.folder.value = CATEGORIES[el.newCategory.value].folder;
        }
    });
    el.clear.addEventListener("click", () => {
        form.reset();
        editingId = null;
        clearImages();
        el.newFields.hidden = true;
        setText(el.error, "");
        setText(el.formStatus, "");
        renderPreview();
    });

    /* ----------------------------------------------------------------------
       Preview. Sources are set as properties on the two <img> elements that
       ship in the panel's markup; nothing is built from a string.
       ---------------------------------------------------------------------- */
    function renderPreview() {
        el.defaultRemove.hidden = !draftDefault;
        el.hoverRemove.hidden = !draftHover;

        if (!draftDefault) {
            el.preview.hidden = true;
            el.previewDefault.removeAttribute("src");
            el.previewHover.removeAttribute("src");
            el.previewHover.hidden = true;
            return;
        }

        el.previewDefault.src = draftDefault.data;
        if (draftHover) {
            el.previewHover.src = draftHover.data;
            el.previewHover.hidden = false;
        } else {
            el.previewHover.removeAttribute("src");
            el.previewHover.hidden = true;
        }

        let label = "";
        let title = "";
        if (isNewSelected()) {
            label = CATEGORIES[el.newCategory.value].label;
            title = el.newTitle.value.trim();
        } else {
            const source = catalogItem(el.item.value) || savedItem(el.item.value);
            if (source) {
                label = CATEGORIES[source.category].label;
                title = TB.desanitize(source.title);
            }
        }
        el.previewLabel.textContent = label;
        el.previewTitle.textContent = title;
        el.preview.hidden = false;
    }

    /* ----------------------------------------------------------------------
       Markup generation.

       Every element carrying operator-supplied text or a generated path is
       built with createElement/textContent/setAttribute and then serialized,
       so escaping is the serializer's job rather than a hand-rolled escaper.
       The surrounding wrapper lines are literal constants containing no
       variable at all. Indentation matches index.html so the block pastes in
       without reformatting.
       ---------------------------------------------------------------------- */
    /* Markup elements are built in an inert document, never in this one. An
       <img> created here and given a src fetches it immediately even while
       detached from the tree, and the src being generated is a file that by
       definition does not exist yet -- so every Copy Markup logged a 404 for
       the thumbnail it was describing. The inert document loads nothing. */
    const MARKUP_DOC = document.implementation.createHTMLDocument("");

    /* The opening tag of an element, taken from the serializer rather than
       assembled by hand so attribute escaping stays the serializer's job.
       Slicing to the first ">" would be shorter and wrong: nothing in the
       HTML serialization rules escapes ">" inside an attribute value. */
    function openTag(node) {
        const html = node.outerHTML;
        const close = "</" + node.tagName.toLowerCase() + ">";
        return html.slice(-close.length) === close
            ? html.slice(0, html.length - close.length)
            : html;
    }

    function imgMarkup(record, which) {
        const shot = which === "hover" ? record.hoverImage : record.defaultImage;
        const img = MARKUP_DOC.createElement("img");
        img.className = which === "hover"
            ? "card-thumb card-thumb-hover"
            : "card-thumb card-thumb-blank";
        img.setAttribute("src", thumbPath(record, which));
        img.setAttribute("alt", "");
        img.setAttribute("width", String(shot.w));
        img.setAttribute("height", String(shot.h));
        img.setAttribute("loading", "lazy");
        return img.outerHTML;
    }

    /* The .card-preview block, which is what replaces an existing card's
       preview. `pad` is the indentation of its opening tag in index.html. */
    function previewMarkup(record, pad) {
        const lines = [
            pad + '<div class="card-preview photo" aria-hidden="true">',
            pad + '    <div class="card-media">',
            pad + '        ' + imgMarkup(record, "default")
        ];
        if (record.hoverImage) {
            lines.push(pad + '        ' + imgMarkup(record, "hover"));
        }
        lines.push(pad + '    </div>');
        lines.push(pad + '</div>');
        return lines.join("\n");
    }

    /* The whole card, for an item not on the homepage yet. */
    function articleMarkup(record) {
        const category = CATEGORIES[record.category];

        const link = MARKUP_DOC.createElement("a");
        link.className = "card-link";
        link.setAttribute("href", category.page);
        link.setAttribute("data-target", category.target);
        if (record.doc) {
            link.setAttribute("data-doc", record.doc);
        }
        link.textContent = TB.desanitize(record.title);

        const label = MARKUP_DOC.createElement("p");
        label.className = "card-category";
        label.textContent = category.label;

        const article = MARKUP_DOC.createElement("article");
        article.className = "template-card";
        article.setAttribute("data-category", record.category);

        return [
            '                ' + openTag(article),
            previewMarkup(record, "                    "),
            '                    <div class="card-body">',
            '                        ' + label.outerHTML,
            '                        <h3 class="card-title">' + link.outerHTML + '</h3>',
            '                    </div>',
            '                </article>'
        ].join("\n");
    }

    function markupFor(record) {
        return catalogItem(record.id)
            ? previewMarkup(record, "                    ")
            : articleMarkup(record);
    }

    /* ----------------------------------------------------------------------
       Patching index.html.

       This edits a 47 KB hand-maintained file that is the site's most
       important page, so the whole design here is about being surgical and
       being verifiable.

       It is a byte splice, NOT a parse-and-reserialize. Running index.html
       through DOMParser and writing documentElement.outerHTML back would
       normalize whitespace, entities and void tags across the entire file,
       turning a two-line change into an unreviewable diff and quietly
       rewriting markup nobody asked to touch. Instead the exact byte range
       of one element is located and replaced, leaving every other byte
       identical. DOMParser is still used, but only afterwards, to check the
       result -- see verifyPatch.
       ---------------------------------------------------------------------- */

    /* Blanks comment bodies while preserving length, so every offset found
       in the masked copy is valid in the original. Searching the raw text
       would let a commented-out card or a stray "</div>" inside a comment
       steer the splice -- index.html carries several explanatory comments
       between cards, including one that describes this very markup. */
    function withNewline(block, nl) {
        return nl === "\n" ? block : block.split("\n").join(nl);
    }

    function findArticles(masked) {
        const found = [];
        const open = /<article class="template-card"[^>]*>/g;
        let match;
        while ((match = open.exec(masked)) !== null) {
            const close = masked.indexOf("</article>", match.index);
            if (close === -1) {
                throw new Error("index.html has a <article class=\"template-card\"> that is never closed.");
            }
            const innerStart = match.index + match[0].length;
            /* Articles are not nested in this markup, and the flat
               indexOf above is only correct while that holds. */
            if (masked.slice(innerStart, close).indexOf("<article") >= 0) {
                throw new Error("index.html has nested <article> elements, which this patcher cannot edit safely.");
            }
            found.push({
                start: match.index,
                innerStart: innerStart,
                innerEnd: close,
                end: close + "</article>".length
            });
        }
        return found;
    }

    /* Balanced scan rather than a lazy match to the first "</div>": a
       card-preview contains nested divs, so a non-greedy match would close
       the block three levels too early and leave orphan closing tags behind. */
    function findBalancedDiv(masked, from, limit) {
        const opening = /<div\b[^>]*>/g;
        opening.lastIndex = from;
        const first = opening.exec(masked);
        if (!first || first.index >= limit) {
            return null;
        }
        const tags = /<div\b[^>]*>|<\/div\s*>/g;
        tags.lastIndex = first.index + first[0].length;
        let depth = 1;
        let tag;
        while ((tag = tags.exec(masked)) !== null && tag.index < limit) {
            depth += tag[0].charAt(1) === "/" ? -1 : 1;
            if (depth === 0) {
                return { start: first.index, end: tag.index + tag[0].length };
            }
        }
        return null;
    }

    function findPreviewBlock(masked, article) {
        const marker = /<div class="card-preview[^"]*"[^>]*>/g;
        marker.lastIndex = article.innerStart;
        const match = marker.exec(masked);
        if (!match || match.index >= article.innerEnd) {
            return null;
        }
        return findBalancedDiv(masked, match.index, article.innerEnd);
    }

    /* Extends a range backwards over the indentation on its own line, so the
       replacement supplies its own leading whitespace and the result cannot
       end up double-indented or flush-left. */
    function withIndent(html, start) {
        let i = start;
        while (i > 0 && (html.charAt(i - 1) === " " || html.charAt(i - 1) === "\t")) {
            i -= 1;
        }
        return i;
    }

    function anchorOf(html, article) {
        const match = html.slice(article.innerStart, article.innerEnd)
            .match(/<a class="card-link"([^>]*)>([\s\S]*?)<\/a>/);
        if (!match) {
            return null;
        }
        return {
            doc: (match[1].match(/data-doc="([^"]*)"/) || [])[1] || "",
            href: (match[1].match(/href="([^"]*)"/) || [])[1] || "",
            title: TB.desanitize(match[2].trim())
        };
    }

    /* data-doc where the card has one, otherwise the title -- the same
       identity rule the picker and the drift test use. */
    function articleMatches(html, article, record) {
        const anchor = anchorOf(html, article);
        if (!anchor) {
            return false;
        }
        return record.doc
            ? anchor.doc === record.doc
            : anchor.doc === "" && anchor.title === TB.desanitize(record.title);
    }

    function patchIndexHtml(html, record) {
        const masked = maskComments(html);
        const nl = newlineOf(html);
        const articles = findArticles(masked);
        if (!articles.length) {
            throw new Error("index.html contains no template cards. Is the connected folder the right one?");
        }

        const matches = articles.filter((article) => articleMatches(html, article, record));
        if (matches.length > 1) {
            throw new Error("index.html has " + matches.length + " cards matching \"" +
                TB.desanitize(record.title) + "\". Fix the duplicate before publishing.");
        }

        if (matches.length === 1) {
            const block = findPreviewBlock(masked, matches[0]);
            if (!block) {
                throw new Error("The card for \"" + TB.desanitize(record.title) +
                    "\" has no <div class=\"card-preview\"> to replace. Paste the markup by hand.");
            }
            const from = withIndent(html, block.start);
            const replacement = withNewline(previewMarkup(record, "                    "), nl);
            return {
                html: html.slice(0, from) + replacement + html.slice(block.end),
                action: "replaced",
                cards: articles.length
            };
        }

        /* Not on the page yet: append to the grid and correct the count. */
        const gridMarker = /<div class="catalog-grid"[^>]*>/.exec(masked);
        if (!gridMarker) {
            throw new Error("index.html has no <div class=\"catalog-grid\">, so there is nowhere to add a card.");
        }
        const grid = findBalancedDiv(masked, gridMarker.index, masked.length);
        if (!grid) {
            throw new Error("index.html's catalog grid is not balanced, so a card cannot be added safely.");
        }
        const closeStart = withIndent(html, grid.end - "</div>".length);
        const article = withNewline(articleMarkup(record), nl);
        let patched = html.slice(0, closeStart) + article + nl + nl + html.slice(closeStart);

        const count = articles.length + 1;
        patched = patched.replace(/(clear the search to see all )\d+/, "$1" + count);
        return { html: patched, action: "inserted", cards: count };
    }

    /* ----------------------------------------------------------------------
       Verification. The splice above is string surgery on the homepage, so
       nothing is written until the result has been parsed and checked
       against what it was supposed to change -- and, just as importantly,
       against everything it was supposed to leave alone.
       ---------------------------------------------------------------------- */
    function cardSignatures(doc) {
        return Array.from(doc.querySelectorAll(".catalog-grid .template-card")).map((card) => {
            const link = card.querySelector(".card-link");
            return [
                card.getAttribute("data-category") || "",
                link ? link.getAttribute("href") || "" : "",
                link ? link.getAttribute("data-doc") || "" : "",
                link ? link.textContent.trim() : ""
            ].join("|");
        });
    }

    function verifyPatch(before, after, record, expected) {
        if (after.length < before.length * 0.75) {
            return "the patched file lost a quarter of its content";
        }
        const parser = new DOMParser();
        const afterDoc = parser.parseFromString(after, "text/html");
        if (afterDoc.querySelector("parsererror")) {
            return "the patched markup does not parse";
        }
        const beforeSigs = cardSignatures(parser.parseFromString(before, "text/html"));
        const afterSigs = cardSignatures(afterDoc);

        if (afterSigs.length !== expected.cards) {
            return "card count became " + afterSigs.length + ", expected " + expected.cards;
        }
        /* Replacing a preview must not touch any card's identity; inserting
           one must add exactly one and leave the rest in order. */
        const carried = expected.action === "inserted"
            ? afterSigs.slice(0, beforeSigs.length)
            : afterSigs;
        for (let i = 0; i < beforeSigs.length; i += 1) {
            if (carried[i] !== beforeSigs[i]) {
                return "card " + (i + 1) + " changed identity: " + beforeSigs[i] + " -> " + carried[i];
            }
        }

        /* The images the patch exists to add must actually be referenced. */
        const wanted = [thumbPath(record, "default")]
            .concat(record.hoverImage ? [thumbPath(record, "hover")] : []);
        const sources = Array.from(afterDoc.querySelectorAll(".catalog-grid .card-thumb"))
            .map((img) => img.getAttribute("src"));
        for (const src of wanted) {
            if (sources.indexOf(src) === -1) {
                return "the patched markup does not reference " + src;
            }
        }
        return null;
    }

    function copyMarkup(record) {
        const text = markupFor(record) + "\n";
        const isKnown = Boolean(catalogItem(record.id));
        const note = isKnown
            ? "Copied. In index.html, replace the <div class=\"card-preview\"> block inside the \"" +
                TB.desanitize(record.title) + "\" card with this."
            : "Copied. In index.html, paste this as a new <article> inside <div class=\"catalog-grid\">, then update the card count in the catalog-empty message.";
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(
                () => setText(el.status, note),
                () => setText(el.status, "Copy failed in this browser.")
            );
        } else {
            setText(el.status, "Clipboard unavailable in this browser.");
        }
    }

    /* ----------------------------------------------------------------------
       Downloads. Same spacing as the post-page export: browsers throttle
       rapid sequential downloads, and a zip library would mean a CDN
       dependency for a handful of files.
       ---------------------------------------------------------------------- */
    /* Data URI back to bytes. The stored image could be handed straight to
       a download link, but browsers cap or block data: URLs in that position
       at sizes well under this cap; a Blob URL is what the post-page export
       already uses and has no such limit. */
    function dataUriToBlob(data) {
        const comma = data.indexOf(",");
        const type = (data.slice(0, comma).match(/:([^;,]+)/) || [])[1] || "application/octet-stream";
        const binary = window.atob(data.slice(comma + 1));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new Blob([bytes], { type: type });
    }

    function downloadShot(record, which, delay) {
        const shot = which === "hover" ? record.hoverImage : record.defaultImage;
        if (!shot) {
            return 0;
        }
        window.setTimeout(() => {
            const url = URL.createObjectURL(dataUriToBlob(shot.data));
            const a = document.createElement("a");
            a.href = url;
            a.download = fileName(record, which);
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 5000);
        }, delay);
        return 1;
    }

    /* The encoder picks the output format, so re-exporting a card whose
       thumbnail is already on disk in another format writes a new file
       beside the old one rather than over it, and the stale one keeps being
       deployed while nothing references it. Nothing in a browser can see the
       repository to check, so this says so every time rather than guessing. */
    function replacementNote(record) {
        const exts = new Set([record.defaultImage.ext]);
        if (record.hoverImage) { exts.add(record.hoverImage.ext); }
        return " Delete any older " + record.id + "-thumb* file in that folder" +
            " with a different extension: a re-encode writes ." +
            [...exts].join("/.") + " beside the previous file, not over it.";
    }

    function downloadRecord(record) {
        let count = downloadShot(record, "default", 0);
        count += downloadShot(record, "hover", 350);
        setText(el.status, "Downloading " + count + " file(s). Put them in site/" +
            record.folder + "/ and keep the names unchanged." + replacementNote(record));
    }

    function downloadAll() {
        if (!items.length) {
            setText(el.status, "No catalog thumbnails saved yet.");
            return;
        }
        let slot = 0;
        const folders = new Set();
        items.forEach((record) => {
            slot += downloadShot(record, "default", slot * 350);
            slot += downloadShot(record, "hover", slot * 350);
            folders.add(record.folder);
        });
        setText(el.status, "Downloading " + slot + " file(s) across " + folders.size +
            " folder(s). Each row above shows where its files belong.");
    }

    /* ----------------------------------------------------------------------
       Hydration: loading a card's CURRENT thumbnails out of the project.

       Why this exists. Until August 24, 2026 this workspace was write-only --
       it knew what you had uploaded and nothing about what the card already
       had. Selecting a card that ships two thumbnails showed an empty form,
       so uploading one image and publishing emitted a single-image block:
       the hover <img> was stripped from index.html and its file deleted by
       the cleanup, with no warning, because nothing here had ever seen it.
       On the mockup cards, whose whole design is the bare-product/styled-demo
       pair, that quietly destroyed the effect the card existed for.

       Reading the current state first is what makes "replace only the
       default" mean what it says: the hover shot is already in the record, so
       the generated markup keeps it. Removing one is still possible, but only
       by asking for it with the Remove button.
       ---------------------------------------------------------------------- */

    /* Guards against a slow read landing after the operator has moved on to
       another card. Bumped on every selection change; a hydration whose token
       is stale throws its result away. */
    let hydrateToken = 0;

    function extOfPath(path) {
        const dot = path.lastIndexOf(".");
        const ext = dot === -1 ? "" : path.slice(dot + 1).toLowerCase();
        return ext === "jpeg" ? "jpg" : ext;
    }

    async function shotFromFile(file, srcPath) {
        const data = await blobToDataUri(file);
        const img = await decode(data);
        return {
            data: data,
            ext: extOfPath(srcPath) || EXT_BY_TYPE[file.type] || "jpg",
            w: img.naturalWidth,
            h: img.naturalHeight,
            note: "Already on the site: " + kb(file.size) + ", " +
                img.naturalWidth + "x" + img.naturalHeight +
                ". Replace it, or leave it and it publishes back unchanged."
        };
    }

    /* The <img> sources inside one card's preview, in markup order, plus the
       folder they live in. Reuses the same locator the patcher uses, so the
       card this reads is by construction the card a publish would rewrite. */
    function currentThumbsOf(html, item) {
        const masked = maskComments(html);
        const articles = findArticles(masked);
        const record = { doc: item.doc || "", title: TB.sanitize(item.title) };
        const matches = articles.filter((a) => articleMatches(html, a, record));
        if (matches.length !== 1) {
            return null;
        }
        const block = findPreviewBlock(masked, matches[0]);
        if (!block) {
            return null;
        }
        const found = { blank: null, hover: null, folder: null };
        [...html.slice(block.start, block.end)
            .matchAll(/<img\b[^>]*class="card-thumb ([^"]*)"[^>]*\ssrc="([^"]+)"/g)]
            .forEach(([, classes, src]) => {
                const slot = classes.indexOf("card-thumb-hover") >= 0 ? "hover" : "blank";
                found[slot] = src;
                found.folder = src.slice(0, src.lastIndexOf("/"));
            });
        return found.blank || found.hover ? found : null;
    }

    async function hydrateFromProject(item, token) {
        if (!FS || !FS.isConnected() || !item) {
            return false;
        }
        let html;
        try {
            html = await FS.readText(INDEX_PATH);
        } catch (err) {
            return false;
        }
        if (token !== hydrateToken) { return false; }

        const current = currentThumbsOf(html, item);
        if (!current) {
            return false;
        }

        const loaded = {};
        for (const slot of ["blank", "hover"]) {
            if (!current[slot]) { continue; }
            const file = await FS.readFile(current[slot]);
            if (!file) { continue; }
            loaded[slot] = await shotFromFile(file, current[slot]);
        }
        if (token !== hydrateToken) { return false; }
        if (!loaded.blank && !loaded.hover) {
            return false;
        }

        draftDefault = loaded.blank || null;
        draftHover = loaded.hover || null;
        if (current.folder) {
            el.folder.value = current.folder;
        }
        setText(el.defaultNote, draftDefault ? draftDefault.note : "");
        setText(el.hoverNote, draftHover ? draftHover.note : "");
        renderPreview();
        setText(el.formStatus, "Loaded this card's current thumbnails from the project. " +
            "Replace either one; whatever you leave alone stays exactly as it is.");
        return true;
    }

    /* ----------------------------------------------------------------------
       Publishing straight into the working copy.

       The download-and-paste path above still exists and is still the only
       path on Firefox and Safari. This one removes the two manual steps
       where a mistake is silent: putting the file in the wrong folder, and
       pasting the markup over the wrong block.

       Order is deliberate and load-bearing, and there are THREE steps to it,
       not two: write the new images, rewrite the markup, then delete the
       superseded files. Every failure point must leave the page working.

       Write-then-rewrite is the easy half: a run that dies after writing an
       image leaves a file nothing references, which is inert, whereas the
       reverse would leave index.html pointing at a file that was never
       written.

       The delete is the half that was got wrong. It ran in the first phase
       until August 24, 2026, so a failed markup edit left the page
       referencing files that had just been removed -- a broken image on the
       live card, which is precisely the outcome the ordering exists to
       prevent. Anything destructive belongs after the markup that stops
       referencing it is safely on disk.
       ---------------------------------------------------------------------- */
    const FS = window.TBProjectFolder;
    const INDEX_PATH = "index.html";
    const KNOWN_EXTS = ["jpg", "jpeg", "png", "webp"];

    /* The encoder picks the output format, so publishing can leave the
       previous file behind under a different extension -- still deployed,
       referenced by nothing. Anything matching this card's two names in any
       known image extension other than the one just written is removed. */
    async function removeStaleSiblings(record, written) {
        const names = await FS.listDir(record.folder);
        const stems = [
            { stem: record.id + "-thumb-blank", keep: written.blank },
            { stem: record.id + "-thumb", keep: written.hover }
        ];
        const removed = [];
        for (const { stem, keep } of stems) {
            for (const name of names) {
                const matches = KNOWN_EXTS.some((ext) => name === stem + "." + ext);
                /* Exact-name matching, never a prefix test: "<id>-thumb" is
                   a prefix of "<id>-thumb-blank", so a startsWith check here
                   would delete the default thumbnail while cleaning up after
                   the hover one. */
                if (matches && name !== keep) {
                    if (await FS.deleteFile(record.folder + "/" + name)) {
                        removed.push(name);
                    }
                }
            }
        }
        return removed;
    }

    async function publishRecord(record) {
        const written = { blank: fileName(record, "default"), hover: null };
        await FS.writeFile(record.folder + "/" + written.blank,
            dataUriToBlob(record.defaultImage.data));
        if (record.hoverImage) {
            written.hover = fileName(record, "hover");
            await FS.writeFile(record.folder + "/" + written.hover,
                dataUriToBlob(record.hoverImage.data));
        }

        const before = await FS.readText(INDEX_PATH);

        /* Last line of defence against the August 24, 2026 defect: a record
           carrying no hover shot produces a single-image block, which strips
           the card's hover <img> and lets the cleanup delete its file. That
           is correct when the operator asked for it and destructive when the
           hover simply was not loaded -- a failed read, or a workspace saved
           before hydration existed. Only an explicit Remove authorises it. */
        const known = catalogItem(record.id);
        if (known && !record.hoverImage && !record.hoverCleared) {
            const live = currentThumbsOf(before, known);
            if (live && live.hover) {
                throw new Error("this card already has a hover thumbnail (" +
                    live.hover.split("/").pop() + ") and this upload has none, so publishing " +
                    "would delete it. Re-select the card to load what is already there, " +
                    "or press Remove Hover Image to drop it deliberately.");
            }
        }

        const patch = patchIndexHtml(before, record);
        const problem = verifyPatch(before, patch.html, record, patch);
        if (problem) {
            throw new Error("index.html was left untouched: " + problem +
                ". The new image files were written but nothing references them yet, " +
                "and the card still shows its previous thumbnail. Paste the markup by hand.");
        }
        await FS.writeFile(INDEX_PATH, patch.html);

        /* ONLY after index.html has been rewritten. Deleting earlier is what
           broke the homepage on August 24, 2026: the superseded .jpg files
           were removed, the markup edit then failed, and index.html was left
           pointing at files that no longer existed -- a broken image on the
           live card. Written-then-unreferenced is inert; referenced-then-
           deleted is a visible defect, so the destructive step has to be the
           last one, after the markup that stops referencing them is safely on
           disk. */
        const removed = await removeStaleSiblings(record, written);

        record.publishedAt = todayIso();
        return {
            action: patch.action,
            files: written.hover ? 2 : 1,
            removed: removed
        };
    }

    /* publish() catches per record, so reaching here means something outside
       that loop failed. Reported rather than dropped: a click that produces
       neither a result nor a message reads as the button being broken. */
    function reportPublishFailure(err) {
        setText(el.status, "Stopped: " + (err && err.message ? err.message : err));
    }

    async function publish(records) {
        if (!FS || !FS.isConnected()) {
            setText(el.status, "Connect the project folder first, or use Download and Copy Markup.");
            return;
        }
        const ready = records.filter((record) => record && record.defaultImage);
        if (!ready.length) {
            setText(el.status, "Nothing to publish yet.");
            return;
        }

        setText(el.status, "Publishing " + ready.length + " item(s)...");
        let files = 0;
        let inserted = 0;
        let replaced = 0;
        const removed = [];
        for (const record of ready) {
            try {
                const result = await publishRecord(record);
                files += result.files;
                if (result.action === "inserted") { inserted += 1; } else { replaced += 1; }
                result.removed.forEach((name) => removed.push(name));
            } catch (err) {
                save();
                setText(el.status, "Stopped at \"" + TB.desanitize(record.title) + "\": " +
                    err.message);
                return;
            }
        }
        save();

        setText(el.status, "Published " + files + " image file(s) into " +
            FS.folderName() + "/. " +
            (replaced ? replaced + " card preview(s) replaced. " : "") +
            (inserted ? inserted + " card(s) added to the grid. " : "") +
            (removed.length ? "Removed " + removed.length + " superseded file(s): " +
                removed.join(", ") + ". " : "") +
            "Review with git diff, then commit and push to deploy.");
    }

    /* ----------------------------------------------------------------------
       Project folder connection UI
       ---------------------------------------------------------------------- */
    function renderFsState(state, detail) {
        if (!el.fsState) {
            return;
        }
        const messages = {
            unsupported: "This browser cannot write to the project folder. Chrome and Edge can; Firefox and Safari cannot. Use Download and Copy Markup instead.",
            disconnected: "Not connected. Publishing writes the images and edits index.html for you; without it, use Download and Copy Markup.",
            "needs-permission": "A project folder is remembered but the browser dropped its permission on restart. Reconnect to publish.",
            connected: "Connected to " + (detail || "the project folder") +
                ". Publish writes images into assets/ and edits index.html directly."
        };
        setText(el.fsState, messages[state] || messages.disconnected);

        const supported = state !== "unsupported";
        el.fsConnect.hidden = !supported || state === "connected";
        el.fsConnect.textContent = state === "needs-permission"
            ? "Reconnect Project Folder"
            : "Connect Project Folder";
        el.fsDisconnect.hidden = state !== "connected";
        el.fsPublishAll.hidden = state !== "connected";
        renderList();
    }

    /* Same contract as the blog panel's: a rejected restore() must still
       leave a rendered, usable state rather than the markup's hidden
       defaults. See the note there. */
    async function refreshFsState() {
        if (!FS || !FS.supported()) {
            renderFsState("unsupported");
            return;
        }
        /* Live state first, storage only as the fallback. restore() answers
           from IndexedDB, so asking it about a connection this page just
           made means racing the write -- which is precisely how connecting
           in one panel left the other reading "Not connected". */
        if (FS.isConnected()) {
            renderFsState("connected", FS.folderName());
            return;
        }
        try {
            renderFsState(await FS.restore(), FS.folderName());
        } catch (err) {
            renderFsState("disconnected");
            setText(el.status, "Could not check for a remembered project folder (" +
                err.message + "). Connecting one still works.");
        }
    }

    /* ----------------------------------------------------------------------
       Saved item list
       ---------------------------------------------------------------------- */
    function renderList() {
        el.list.textContent = "";

        if (!items.length) {
            const empty = document.createElement("p");
            empty.className = "admin-empty";
            empty.textContent = "No catalog thumbnails yet. Pick an item below and upload a default image to start.";
            el.list.appendChild(empty);
            return;
        }

        items.forEach((record) => {
            const row = document.createElement("div");
            row.className = "admin-row";

            const info = document.createElement("div");
            info.className = "admin-row-info";

            const title = document.createElement("p");
            title.className = "admin-row-title";
            title.textContent = TB.desanitize(record.title);
            info.appendChild(title);

            const meta = document.createElement("p");
            meta.className = "admin-row-meta";
            meta.textContent = [
                CATEGORIES[record.category].label,
                record.hoverImage ? "Default and hover" : "Default only",
                catalogItem(record.id) ? "On the homepage" : "New card",
                "Last edited: " + record.updated,
                record.publishedAt
                    ? "Published to the project " + record.publishedAt
                    : "Not published"
            ].join(" — ");
            info.appendChild(meta);

            const paths = document.createElement("p");
            paths.className = "admin-thumb-paths";
            paths.textContent = "site/" + thumbPath(record, "default") +
                (record.hoverImage ? "  |  site/" + thumbPath(record, "hover") : "");
            info.appendChild(paths);

            row.appendChild(info);

            const actions = document.createElement("div");
            actions.className = "admin-row-actions";

            const editBtn = document.createElement("button");
            editBtn.className = "btn btn-secondary btn-small";
            editBtn.type = "button";
            editBtn.textContent = "Edit";
            editBtn.addEventListener("click", () => {
                el.item.value = record.id;
                syncFormToSelection();
                form.scrollIntoView({ behavior: "smooth", block: "start" });
            });
            actions.appendChild(editBtn);

            /* Only offered where it can actually work. An always-visible
               Publish that errors on click would read as a broken feature
               rather than an unavailable one. */
            if (FS && FS.isConnected()) {
                const pubBtn = document.createElement("button");
                pubBtn.className = "btn btn-small";
                pubBtn.type = "button";
                pubBtn.textContent = "Publish";
                pubBtn.addEventListener("click", () => publish([record]).catch(reportPublishFailure));
                actions.appendChild(pubBtn);
            }

            const dlBtn = document.createElement("button");
            dlBtn.className = "btn btn-secondary btn-small";
            dlBtn.type = "button";
            dlBtn.textContent = "Download";
            dlBtn.addEventListener("click", () => downloadRecord(record));
            actions.appendChild(dlBtn);

            const copyBtn = document.createElement("button");
            copyBtn.className = "btn btn-secondary btn-small";
            copyBtn.type = "button";
            copyBtn.textContent = "Copy Markup";
            copyBtn.addEventListener("click", () => copyMarkup(record));
            actions.appendChild(copyBtn);

            const delBtn = document.createElement("button");
            delBtn.className = "entry-remove";
            delBtn.type = "button";
            delBtn.textContent = "Delete";
            delBtn.addEventListener("click", () => {
                const name = TB.desanitize(record.title);
                if (window.confirm("Remove the thumbnails for \"" + name + "\" from this workspace? Files already placed in the project are not affected.")) {
                    items = items.filter((entry) => entry.id !== record.id);
                    if (editingId === record.id) {
                        editingId = null;
                        el.item.value = "";
                        clearImages();
                        renderPreview();
                    }
                    save();
                    buildItemOptions();
                }
            });
            actions.appendChild(delBtn);

            row.appendChild(actions);
            el.list.appendChild(row);
        });
    }

    function renderSyncState() {
        const withHover = items.filter((entry) => entry.hoverImage).length;
        setText(el.sync, items.length
            ? items.length + " item" + (items.length === 1 ? "" : "s") + " in workspace (" +
                withHover + " with a hover image). Nothing is live until the files and markup are committed."
            : "No catalog thumbnails in this browser's workspace.");
    }

    /* ----------------------------------------------------------------------
       Bindings + boot
       ---------------------------------------------------------------------- */
    el.copy.addEventListener("click", () => {
        setText(el.error, "");
        let record;
        try {
            record = collectRecord();
        } catch (err) {
            setText(el.error, err.message);
            return;
        }
        copyMarkup(record);
    });
    el.downloadAll.addEventListener("click", downloadAll);

    if (FS && el.fsConnect) {
        el.fsConnect.addEventListener("click", async () => {
            setText(el.status, "");
            try {
                /* A remembered folder only needs its permission re-granted;
                   asking for the picker again would make the operator
                   re-find the same directory for no reason. */
                const name = el.fsConnect.textContent.indexOf("Reconnect") === 0
                    ? await FS.reconnect()
                    : await FS.connect();
                renderFsState("connected", name);
                setText(el.status, "Connected to " + name + "/. Publish now writes into it.");
            } catch (err) {
                /* Dismissing the native picker throws AbortError; that is a
                   choice, not a failure worth reporting as one. */
                if (err && err.name === "AbortError") {
                    return;
                }
                setText(el.status, err.message);
            }
        });

        el.fsDisconnect.addEventListener("click", async () => {
            await FS.disconnect();
            renderFsState("disconnected");
            setText(el.status, "Disconnected. Nothing was changed in the project.");
        });

        el.fsPublishAll.addEventListener("click", () => publish(items).catch(reportPublishFailure));
        /* One folder, two panels -- and the broadcast has to be listened for
           in BOTH. It was wired on the blog side only, so connecting there
           left this panel reading "Not connected" with its Publish buttons
           hidden until a reload, while connecting here updated both. */
        window.addEventListener("tb-project-folder-changed", refreshFsState);
    }

    buildCategoryOptions();
    buildItemOptions();
    renderList();
    renderSyncState();
    renderPreview();
    refreshFsState();
})();
