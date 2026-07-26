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
        const body = holder.innerHTML;

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

        const coverMarkup = cover
            ? '        <img class="post-cover" src="' + cover + '" alt="' + (post.coverAlt || "") + '" loading="lazy">\n'
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
'    <main id="main">\n' +
'        <nav class="breadcrumb" aria-label="Breadcrumb">\n' +
'            <ol>\n' +
'                <li><a href="../index.html">Templates</a></li>\n' +
'                <li><a href="../blog.html">Guides</a></li>\n' +
'                <li aria-current="page">' + title + '</li>\n' +
'            </ol>\n' +
'        </nav>\n\n' +
'        <article class="post-article">\n' +
'            <header class="post-header">\n' +
'                <p class="post-meta">' + (post.category || "") +
        (post.category && post.date ? " &middot; " : "") +
        TBBlog.formatDate(post.date) + '</p>\n' +
'                <h1>' + title + '</h1>\n' +
        (desc ? '                <p class="post-standfirst">' + desc + '</p>\n' : "") +
'            </header>\n' +
coverMarkup +
'            <div class="post-body">\n' +
body + '\n' +
'            </div>\n' +
'            <footer class="post-footer">\n' +
'                <a class="btn" href="../index.html#templates">Browse templates</a>\n' +
'                <a class="btn btn-secondary" href="../blog.html">More guides</a>\n' +
'            </footer>\n' +
'        </article>\n' +
'    </main>\n\n' +
'    <footer class="site-footer">\n' +
'        <div class="footer-base">\n' +
'            <div class="footer-links">\n' +
'                <a href="../index.html">Templates</a>\n' +
'                <a href="../blog.html">Guides</a>\n' +
'                <a href="../about.html">About</a>\n' +
'                <a href="../privacy.html">Privacy Policy</a>\n' +
'                <a href="../terms.html">Terms of Use</a>\n' +
'            </div>\n' +
'            <p>TemplateBox. All editing happens locally in your browser. No data leaves your device.</p>\n' +
'        </div>\n' +
'    </footer>\n\n' +
'    <script src="../js/blog-data.js"></' + 'script>\n' +
'    <script src="../js/app.js"></' + 'script>\n' +
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

    function copyDataFile() {
        const text = buildDataFile();
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(
                () => setText(el.exportStatus, "Copied. Paste over the full contents of js/blog-data.js, then deploy."),
                () => setText(el.exportStatus, "Copy failed in this browser. Use Download instead.")
            );
        } else {
            setText(el.exportStatus, "Clipboard unavailable in this browser. Use Download instead.");
        }
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

    renderList();
    renderSyncState();
})();
