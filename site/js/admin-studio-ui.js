/* ==========================================================================
   TemplateBox - Template Studio panel (admin.html only)

   The form, the list, the live preview and the publish buttons. All of the
   file surgery lives in js/admin-studio.js; this file decides nothing about
   what is safe to write, it only asks.

   Two halves, and they are deliberately shaped differently because the two
   registries are:

     Resumes    the whole descriptor, edited as the DATA it is, beside a live
                sheet drawn by the real engine at the real page size. A
                sixty-key form would be worse than the object itself, and
                would still have to be kept in step with an engine that gains
                keys -- which is how a studio ends up unable to author the
                newest thing the engine can draw.

     Documents  a short form, because a document type IS short: an id, one of
                five layouts, a heading, a download name, and the labels its
                layout reads. There is no sheet preview here and the panel
                says why: the renderers in js/docs.js draw into that page's
                own DOM, and reaching across for it would couple this panel to
                an editor it has no business knowing about.
   ========================================================================== */

"use strict";

(() => {

    const S = window.TBStudio;
    const FS = window.TBProjectFolder;
    const root = document.querySelector("[data-studio]");
    if (!S || !root) { return; }

    const el = {
        state: root.querySelector("[data-studio-fs-state]"),
        connect: root.querySelector("[data-studio-connect]"),
        kind: root.querySelector("[data-studio-kind]"),
        list: root.querySelector("[data-studio-list]"),
        status: root.querySelector("[data-studio-status]"),
        resumePane: root.querySelector("[data-studio-resume]"),
        docPane: root.querySelector("[data-studio-doc]"),
        editor: root.querySelector("[data-studio-editor]"),
        problems: root.querySelector("[data-studio-problems]"),
        preview: root.querySelector("[data-studio-preview]"),
        pages: root.querySelector("[data-studio-pages]"),
        newBtn: root.querySelector("[data-studio-new]"),
        dupBtn: root.querySelector("[data-studio-duplicate]"),
        publishBtn: root.querySelector("[data-studio-publish]"),
        copyBtn: root.querySelector("[data-studio-copy]"),
        deleteBtn: root.querySelector("[data-studio-delete]"),
        card: root.querySelector("[data-studio-card]"),
        docId: root.querySelector("[data-studio-doc-id]"),
        docLayout: root.querySelector("[data-studio-doc-layout]"),
        docHeading: root.querySelector("[data-studio-doc-heading]"),
        docFile: root.querySelector("[data-studio-doc-file]"),
        docLabels: root.querySelector("[data-studio-doc-labels]"),
        drift: root.querySelector("[data-studio-drift]")
    };

    let registries = null;
    let kind = "resume";
    let openId = null;

    function setText(node, text) {
        if (node) { node.textContent = text; }
    }

    function say(message) {
        setText(el.status, message || "");
    }

    /* ----------------------------------------------------------------------
       Folder state. Identical in shape to the other admin panels, because an
       operator who has learned one should not have to learn a second.
       ---------------------------------------------------------------------- */

    function syncFolder() {
        if (!FS || !FS.supported()) {
            setText(el.state, "This browser has no File System Access API, so publishing " +
                "writes nothing. Everything else works: edit, preview, and use Copy to paste " +
                "the entry in by hand.");
            if (el.connect) { el.connect.hidden = true; }
            if (el.publishBtn) { el.publishBtn.disabled = true; }
            return;
        }
        if (FS.isConnected()) {
            setText(el.state, "Connected to " + FS.folderName() + ". Publishing writes into " +
                "that folder and nowhere else. Committing and pushing is still yours.");
            el.connect.hidden = true;
            el.publishBtn.disabled = false;
        } else {
            setText(el.state, "No project folder connected. Connect one to publish, or use " +
                "Copy and paste the entry in by hand.");
            el.connect.hidden = false;
            el.publishBtn.disabled = true;
        }
    }

    /* ----------------------------------------------------------------------
       Loading.
       ---------------------------------------------------------------------- */

    async function load() {
        say("Reading the registries...");
        try {
            registries = await S.loadRegistries();
        } catch (err) {
            say("Could not read the registries: " + (err && err.message ? err.message : err));
            return;
        }
        if (registries.drift.length && el.drift) {
            el.drift.hidden = false;
            setText(el.drift, "js/docs.js registers layouts this panel does not know about, " +
                "or the other way round: " + registries.drift.join(", ") +
                ". Update DOC_LAYOUTS in js/admin-studio.js before authoring a document type.");
        }
        buildLayoutOptions();
        renderList();
        say("Read " + registries.resumes.length + " resume templates and " +
            Object.keys(registries.docs).length + " document types.");
    }

    function buildLayoutOptions() {
        if (!el.docLayout) { return; }
        el.docLayout.replaceChildren();
        registries.layouts.forEach((name) => {
            const o = document.createElement("option");
            o.value = name;
            o.textContent = name;
            el.docLayout.appendChild(o);
        });
    }

    /* ----------------------------------------------------------------------
       The list of what already exists.
       ---------------------------------------------------------------------- */

    function renderList() {
        if (!registries) { return; }
        el.list.replaceChildren();
        const items = kind === "resume"
            ? registries.resumes.map((t) => ({ id: t.id, title: t.title,
                note: t.catalog ? "in the catalog" : "not in the catalog" }))
            : Object.keys(registries.docs).map((id) => ({ id: id,
                title: registries.docs[id].heading,
                note: registries.docs[id].layout }));

        items.forEach((item) => {
            const row = document.createElement("button");
            row.type = "button";
            row.className = "studio-row" + (item.id === openId ? " is-open" : "");
            row.setAttribute("data-open", item.id);
            const name = document.createElement("strong");
            name.textContent = item.title || item.id;
            const meta = document.createElement("span");
            meta.textContent = item.id + " - " + item.note;
            row.append(name, meta);
            el.list.appendChild(row);
        });
    }

    /* ----------------------------------------------------------------------
       Opening one for editing.
       ---------------------------------------------------------------------- */

    function openEntry(id) {
        openId = id;
        if (kind === "resume") {
            const t = registries.resumes.find((x) => x.id === id);
            if (!t) { return; }
            el.editor.value = S.serializeEntry(t, "");
            validateAndPreview();
            /* Said on OPEN rather than on publish: by the time the operator
               has typed into it, "your comments will be lost" is news about a
               decision they have already made. */
            const cost = S.commentCost(registries.resumeSrc, S.RESUME_CFG, id);
            say(cost
                ? "Editing " + id + ". Publishing replaces this entry, which means losing the " +
                  cost + " bytes of comment inside it -- copy anything worth keeping first."
                : "Editing " + id + ".");
            return;
        } else {
            const d = registries.docs[id];
            if (!d) { return; }
            el.docId.value = id;
            el.docLayout.value = d.layout;
            el.docHeading.value = d.heading || "";
            el.docFile.value = d.file || "";
            el.docLabels.value = Object.keys(d.labels || {})
                .map((k) => k + ": " + d.labels[k]).join("\n");
            const cost = S.commentCost(registries.docsSrc, S.DOCS_CFG, id);
            say(cost
                ? "Editing " + id + ". Publishing replaces this entry, which means losing the " +
                  cost + " bytes of comment inside it -- copy anything worth keeping first."
                : "Editing " + id + ".");
        }
        renderList();
    }

    function startNew() {
        openId = null;
        if (kind === "resume") {
            /* A working descriptor rather than an empty object: a blank
               textarea is not a starting point, it is a specification to go
               and read. This one renders a real sheet the moment it is
               pasted, and every part of it is meant to be changed. */
            el.editor.value = S.serializeEntry({
                id: "my-template",
                title: "My Template",
                catalog: true,
                page: { width: 595, height: 842 },
                layout: { kind: "single-column",
                    main: { left: 48, right: 48, firstBaseline: 74, bottom: 800 } },
                palette: { ink: "#1A1A1A" },
                type: {
                    displayName: { family: "sans", weight: "bold", size: 26,
                        lineHeight: 30, color: "accent" },
                    heading: { family: "sans", weight: "bold", size: 12, color: "accent",
                        uppercase: true, gapBefore: 24, gapAfter: 18,
                        rule: { color: "accent", width: 1, offset: 6 } },
                    body: { family: "sans", weight: "normal", size: 10,
                        lineHeight: 14, color: "ink" },
                    bullet: { family: "sans", weight: "normal", size: 10,
                        lineHeight: 14, color: "ink", marker: "•",
                        indent: 10, itemGap: 14 },
                    entryHead: { family: "sans", weight: "bold", size: 10, color: "ink" },
                    entryMeta: { family: "sans", weight: "normal", size: 10, color: "ink" },
                    entrySub: { family: "sans", weight: "normal", size: 10, color: "ink" }
                },
                blocks: [
                    { column: "main", kind: "display", field: "name", type: "displayName",
                        uppercase: true, fallback: "Your Name", gapAfter: 8 },
                    { column: "main", kind: "text", type: "body",
                        fields: ["location", "phone", "email"], separator: "  |  " },
                    { column: "main", kind: "section", label: "Summary",
                        body: { kind: "paragraph", field: "summary" } },
                    { column: "main", kind: "section", label: "Experience",
                        body: { kind: "entries", source: "experience",
                            head: { runs: [
                                { field: "role", type: "entryHead" },
                                { literal: " - ", type: "entryHead" },
                                { field: "company", type: "entryHead" }
                            ] },
                            aside: { runs: [{ field: "dates", type: "entryMeta" }] },
                            bullets: { field: "description", split: "\n",
                                type: "bullet", gapBefore: 12 },
                            entryGap: 18 } },
                    { column: "main", kind: "section", label: "Education",
                        body: { kind: "entries", source: "education",
                            head: { runs: [{ field: "school", type: "entryHead" }] },
                            sub: [{ runs: [{ field: "dates", type: "entryMeta" }],
                                gapBefore: 13 }],
                            entryGap: 15 } },
                    { column: "main", kind: "section", label: "Skills",
                        body: { kind: "list", field: "skills", split: "," } }
                ]
            }, "");
            validateAndPreview();
        } else {
            el.docId.value = "";
            el.docLayout.value = registries.layouts[0];
            el.docHeading.value = "";
            el.docFile.value = "";
            el.docLabels.value = suggestedLabels(registries.layouts[0]);
            say("New document type. It will use an existing layout.");
        }
        renderList();
    }

    function duplicate() {
        if (!openId) { say("Open one first, then duplicate it."); return; }
        if (kind === "resume") {
            const t = JSON.parse(JSON.stringify(
                registries.resumes.find((x) => x.id === openId)));
            t.id = t.id + "-copy";
            t.title = t.title + " (copy)";
            el.editor.value = S.serializeEntry(t, "");
            openId = null;
            validateAndPreview();
        } else {
            const d = JSON.parse(JSON.stringify(registries.docs[openId]));
            el.docId.value = openId + "-copy";
            el.docLayout.value = d.layout;
            el.docHeading.value = d.heading;
            el.docFile.value = (d.file || openId) + "-copy";
            openId = null;
        }
        renderList();
        say("Duplicated. Change the id before publishing.");
    }

    /* The labels an existing type of the same layout uses, which is the only
       honest source for "what does this layout read": the renderers are
       functions over in js/docs.js and this panel does not parse them. */
    function suggestedLabels(layout) {
        const sibling = Object.keys(registries.docs)
            .map((id) => registries.docs[id])
            .find((d) => d.layout === layout);
        if (!sibling) { return ""; }
        return Object.keys(sibling.labels || {})
            .map((k) => k + ": ").join("\n");
    }

    /* ----------------------------------------------------------------------
       Reading the form back.
       ---------------------------------------------------------------------- */

    function readResume() {
        const text = el.editor.value;
        try {
            /* The descriptor is JavaScript, not JSON -- unquoted keys, single
               quotes, trailing commas -- because that is what the registry
               holds and what Copy has to produce. Evaluated as an expression
               in its own scope, never in this page's. */
            const value = new Function("return (" + text + ");")();
            if (!value || typeof value !== "object") { throw new Error("not an object"); }
            return { value: value, error: null };
        } catch (err) {
            return { value: null, error: err && err.message ? err.message : String(err) };
        }
    }

    function readDoc() {
        const labels = {};
        el.docLabels.value.split("\n").forEach((line) => {
            const at = line.indexOf(":");
            if (at === -1) { return; }
            const k = line.slice(0, at).trim();
            const v = line.slice(at + 1).trim();
            if (k && v) { labels[k] = v; }
        });
        return {
            id: el.docId.value.trim(),
            value: {
                layout: el.docLayout.value,
                heading: el.docHeading.value.trim(),
                file: el.docFile.value.trim(),
                labels: labels
            }
        };
    }

    /* ----------------------------------------------------------------------
       Validation and the live sheet.
       ---------------------------------------------------------------------- */

    function showProblems(list) {
        el.problems.replaceChildren();
        if (!list.length) {
            el.problems.hidden = true;
            return;
        }
        el.problems.hidden = false;
        const ul = document.createElement("ul");
        list.forEach((p) => {
            const li = document.createElement("li");
            li.textContent = p;
            ul.appendChild(li);
        });
        el.problems.appendChild(ul);
    }

    /* Sample content for the preview. Deliberately NOT js/resume.js's
       SAMPLE_STATE: that object is sized to one page across every shipped
       template and has no slack left, so reaching for it here would tie a
       preview to a constraint it has no part in. This is its own, shorter. */
    const PREVIEW_STATE = {
        accent: "#1A1A1A",
        photo: "",
        fields: {
            name: "Sample Name", title: "Job Title",
            email: "name@example.com", phone: "+1 (555) 010-0000",
            location: "City, Region",
            summary: "Two or three lines of summary, long enough to wrap so the column " +
                "width and the leading can both be judged from the preview.",
            skills: "First skill, Second skill, Third skill, Fourth skill",
            languages: "English: Native",
            accomplishments: "An accomplishment worth a line.\nAnd a second one.",
            address: "1 Example Street", city: "City", postcode: "00000",
            phoneAlt: "+1 (555) 010-0001"
        },
        experience: [{ role: "Job Title", company: "Company", place: "City",
            dates: "2022 - Present",
            description: "Something achieved, stated in one line.\nAnd a second achievement." }],
        education: [{ degree: "Degree", school: "Institution", place: "City",
            dates: "2016 - 2020" }],
        projects: [], references: []
    };

    function validateAndPreview() {
        if (kind !== "resume") { return; }
        const read = readResume();
        if (read.error) {
            showProblems(["the descriptor does not evaluate: " + read.error]);
            setText(el.pages, "");
            return;
        }
        const others = registries.resumes.filter((t) => t.id !== read.value.id);
        const problems = S.validateResume(read.value, others);

        if (!window.TBResume || !window.jspdf || !window.jspdf.jsPDF) {
            showProblems(problems.concat(
                ["the engine or jsPDF has not loaded, so there is no preview"]));
            return;
        }
        try {
            const state = Object.assign({}, PREVIEW_STATE,
                { accent: read.value.defaultAccent || "#1A1A1A" });
            const ctx = window.TBResume.layout(read.value, state);
            el.preview.replaceChildren();
            window.TBResume.renderPreview(read.value, state, el.preview);
            setText(el.pages, ctx.pages + (ctx.pages === 1 ? " page" : " pages") +
                (ctx.overflow.main || ctx.overflow.sidebar
                    ? " -- and a column overflows its own boundary" : ""));
            if (ctx.overflow.main || ctx.overflow.sidebar) {
                problems.push("a column runs past the boundary it declared, which the " +
                    "suite checks for and fails on");
            }
        } catch (err) {
            problems.push("the engine could not lay it out: " +
                (err && err.message ? err.message : err));
            el.preview.replaceChildren();
            setText(el.pages, "");
        }
        showProblems(problems);
    }

    /* ----------------------------------------------------------------------
       Planning a publish. Every file is proved before any is written.
       ---------------------------------------------------------------------- */

    function planAll(action) {
        if (kind === "resume") {
            const read = readResume();
            if (read.error) { throw new Error("the descriptor does not evaluate: " + read.error); }
            const t = read.value;
            const problems = S.validateResume(t,
                registries.resumes.filter((x) => x.id !== t.id));
            if (problems.length && action !== "delete") {
                throw new Error("fix these first: " + problems.join("; "));
            }
            const keys = registries.resumes.map((x) => x.id);
            const plans = [S.planRegistryEdit(registries.resumeSrc, S.RESUME_CFG,
                t, action === "delete" ? openId : t.id, action, keys)];

            if (action !== "delete" && t.catalog) {
                plans.push(S.planCatalogCard(registries.indexSrc, {
                    id: t.id, title: t.title, category: "resumes",
                    categoryLabel: "Resumes", href: "resume.html", target: "resume",
                    accent: t.defaultAccent || "#1A1A1A"
                }));
                plans.push(S.planAdminEntry(registries.adminSrc, {
                    id: t.id, title: t.title, category: "resumes"
                }));
            }
            return plans.filter(Boolean);
        }

        const read = readDoc();
        const problems = S.validateDoc(read.value, read.id, Object.keys(registries.docs));
        if (problems.length && action !== "delete") {
            throw new Error("fix these first: " + problems.join("; "));
        }
        const keys = Object.keys(registries.docs);
        return [S.planRegistryEdit(registries.docsSrc, S.DOCS_CFG,
            read.value, action === "delete" ? openId : read.id, action, keys)];
    }

    async function ensureCatalogSources() {
        if (registries.indexSrc && registries.adminSrc) { return; }
        registries.indexSrc = await S.readSource("index.html");
        registries.adminSrc = await S.readSource("js/admin.js");
    }

    async function doPublish(action) {
        say("Checking...");
        try {
            await ensureCatalogSources();
            const plans = planAll(action);
            const written = await S.publish(plans);
            say("Wrote " + written.join(", ") + ". Review with git diff, then commit and " +
                "push -- deploying is yours, no page can do it for you.");
            registries = null;
            await load();
        } catch (err) {
            say("Nothing was written. " + (err && err.message ? err.message : err));
        }
    }

    async function doCopy() {
        try {
            await ensureCatalogSources();
            const plans = planAll("save");
            const entry = kind === "resume"
                ? S.serializeEntry(readResume().value, "    ")
                : S.serializeEntry(readDoc().value, "    ");
            const where = kind === "resume"
                ? "js/resume-templates.js, inside window.TB_RESUME_TEMPLATES"
                : "js/docs.js, inside DOC_TYPES";
            await navigator.clipboard.writeText(entry + "\n");
            say("Copied. Paste it into " + where + " as a new entry, or over the existing " +
                "one. " + (plans.length > 1
                    ? "This template also needs a catalog card in index.html and a line in " +
                      "js/admin.js; use Card Markup for the first."
                    : ""));
        } catch (err) {
            say("Could not copy: " + (err && err.message ? err.message : err));
        }
    }

    async function doCardMarkup() {
        if (kind !== "resume") { say("Document types have no catalog card of their own."); return; }
        try {
            await ensureCatalogSources();
            const t = readResume().value;
            const plan = S.planCatalogCard(registries.indexSrc, {
                id: t.id, title: t.title, category: "resumes",
                categoryLabel: "Resumes", href: "resume.html", target: "resume",
                accent: t.defaultAccent || "#1A1A1A"
            });
            if (!plan) { say("index.html already has a card for " + t.id + "."); return; }
            /* The card alone, cut out of the patched file, so what lands on
               the clipboard is what has to be pasted and not a whole page. */
            const start = plan.source.indexOf('data-doc="' + t.id + '"');
            const open = plan.source.lastIndexOf("<article", start);
            const close = plan.source.indexOf("</article>", start) + "</article>".length;
            await navigator.clipboard.writeText(plan.source.slice(open, close) + "\n");
            say("Card markup copied. Paste it inside <div class=\"catalog-grid\"> in " +
                "index.html, then set the empty-search count to " + plan.count +
                ", and add a matching line to the catalog list in js/admin.js. " +
                "The tile it carries is a plain default -- replace it with a real one.");
        } catch (err) {
            say("Could not build the card: " + (err && err.message ? err.message : err));
        }
    }

    /* ----------------------------------------------------------------------
       Wiring.
       ---------------------------------------------------------------------- */

    el.kind.addEventListener("change", () => {
        kind = el.kind.value;
        openId = null;
        el.resumePane.hidden = kind !== "resume";
        el.docPane.hidden = kind !== "doc";
        renderList();
        say("");
    });

    el.list.addEventListener("click", (ev) => {
        const btn = ev.target.closest("[data-open]");
        if (btn) { openEntry(btn.getAttribute("data-open")); }
    });

    let timer = null;
    el.editor.addEventListener("input", () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(validateAndPreview, 350);
    });

    el.newBtn.addEventListener("click", startNew);
    el.dupBtn.addEventListener("click", duplicate);
    el.publishBtn.addEventListener("click", () => doPublish("save"));
    el.copyBtn.addEventListener("click", doCopy);
    if (el.card) { el.card.addEventListener("click", doCardMarkup); }
    el.deleteBtn.addEventListener("click", () => {
        if (!openId) { say("Open one first."); return; }
        if (!window.confirm("Remove \"" + openId + "\" from the registry? " +
            "Its catalog card is left alone and has to be removed by hand.")) { return; }
        doPublish("delete");
    });

    if (el.connect) {
        el.connect.addEventListener("click", async () => {
            try {
                await FS.connect();
            } catch (err) {
                say("Could not connect: " + (err && err.message ? err.message : err));
            }
            syncFolder();
        });
    }
    /* One folder grant covers every panel, so this listens for the same
       event the thumbnail panel announces rather than offering a second
       Connect button for a folder that is already connected. */
    window.addEventListener("tb-project-folder-changed", syncFolder);

    syncFolder();
    load();
})();
