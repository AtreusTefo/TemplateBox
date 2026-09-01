/* ==========================================================================
   TemplateBox - CV/Resume Builder Core Logic
   Responsibilities: real-time localStorage binding, repeating experience and
   education entries, CSS-variable accent theming, safe textContent preview
   rendering, template selection, and client-side PDF compilation.

   TWO RENDERERS, ON PURPOSE (August 30, 2026). "Classic" is the hand-written
   preview and jsPDF writer at the foot of this file. Every other template is
   a descriptor in js/resume-templates.js drawn by js/resume-engine.js, which
   lays out once and paints the same display list to both the preview and the
   PDF. The hand-written pair was NOT rewritten onto the engine: it renders
   every document saved before templates existed, and migrating it is a
   separate step that owes an output-equivalence check first (see
   docs/implementation/RESUME_TEMPLATE_ENGINE_IMPLEMENTATION.md). Until then
   `classic` is a sentinel id, not a registry entry, and the two paths meet at
   exactly two places: renderPreview() and the download handler.

   Depends on: js/app.js (TB.sanitize, TB.desanitize, TB.storageGet/Set,
   TB.takePreset), js/resume-templates.js and js/resume-engine.js.
   ========================================================================== */

"use strict";

(() => {

    const STORAGE_KEY = "tb_resume_v1";

    /* The chosen template gets its own key, outliving the document.

       It cannot rely on the document record alone. Sample content is
       deliberately never persisted -- that is what keeps the "this is sample
       content" notice and its Start blank button honest on a second visit --
       so a visitor who arrived on a catalog card and then reloaded WITHOUT
       typing anything would have silently dropped back to Classic, having
       chosen a template and watched it revert.

       This is a fallback, not a second source of truth: a saved document's own
       `template` still wins, and this is consulted only when there is no
       document yet. */
    const TEMPLATE_KEY = "tb_resume_template";

    const DEFAULT_DOC_NAME = "Untitled resume";

    /* The editor's default layout, and the fallback for any template id the
       registry no longer carries. It was a SENTINEL until August 30, 2026 --
       nothing in js/resume-templates.js described it and it meant "use the
       hand-written renderer in this file". It is an ordinary descriptor now,
       so the id is named here only because two places need to reach for it by
       name: the default state, and the fallback in engineTemplate(). */
    const CLASSIC_ID = "classic";

    const DEFAULT_STATE = {
        accent: "#1A1A1A",
        docName: DEFAULT_DOC_NAME,
        template: CLASSIC_ID,
        fields: {
            name: "",
            title: "",
            email: "",
            phone: "",
            location: "",
            summary: "",
            skills: "",
            languages: "",
            accomplishments: "",
            address: "",
            city: "",
            postcode: "",
            phoneAlt: ""
        },
        experience: [{ role: "", company: "", place: "", dates: "", description: "" }],
        education: [{ degree: "", school: "", place: "", dates: "" }],
        projects: [{ name: "", role: "", dates: "", description: "" }],
        references: [{ name: "", title: "", company: "", email: "", phone: "" }]
    };

    /* First-run sample content.
       The editor previously opened onto an empty form beside an empty white
       sheet, so a first-time visitor could not see what the tool produces or
       that the preview updates live until they had typed several fields.
       Loaded ONLY when no saved state exists, so it can never overwrite real
       work, and announced by a dismissible notice offering a blank start. */
    const SAMPLE_STATE = {
        accent: "#1F4E79",
        fields: {
            name: "Adaeze Nwosu",
            title: "Operations Director",
            email: "adaeze.nwosu@example.com",
            phone: "+1 (555) 014-8820",
            location: "Chicago, IL",
            /* SIZED TO ONE PAGE. Every length in this object is load-bearing:
               Classic finishes at y=741.7 against a 790.87 boundary and
               grey-rail at 721 against 800, so roughly four lines of slack
               on the tighter of the two. Adding to any field here can cost
               a whole page, and not gradually -- see the note on references
               below. Re-measure rather than eyeball it. */
            summary: "Operations leader with fifteen years running supply chain and fulfilment teams across three continents. Known for turning underperforming depots into reliable, measurable operations.",
            /* No commas INSIDE a skill: the field splits on commas, so
               "Friendly, positive attitude" would become two skills. */
            skills: "Supply chain strategy, Vendor negotiation, Lean process design, Demand forecasting, Team leadership, SAP, Power BI",
            languages: "English: Native\nSpanish: Upper intermediate (B2)",
            accomplishments: "Named Operations Leader of the Year by the Midwest Logistics Council.\nSpeaker on depot automation at the 2024 Supply Chain Summit.",
            /* Only the two-column template draws these; the others compose
               their contact line from `location` and `phone` above. */
            address: "1400 North Lake Shore Drive",
            city: "Chicago, IL",
            postcode: "60610",
            phoneAlt: "+1 (555) 220-7741"
        },
        /* Descriptions are one achievement per LINE. Ruled Serif splits them
           into bullets on the newline; Classic reflows them as prose, which
           still reads correctly because each line is a complete sentence. */
        experience: [
            {
                role: "Director of Operations",
                company: "Northwind Logistics",
                place: "Chicago, IL",
                dates: "2019 - Present",
                description: "Cut average fulfilment lead time 34% across nine regional depots.\nRebuilt the carrier mix, saving $1.8M annually against the prior contract structure."
            },
            {
                role: "Head of Fulfilment",
                company: "Cardinal Freight",
                place: "Milwaukee, WI",
                dates: "2014 - 2019",
                description: "Scaled a single warehouse operation into four sites during a period of 3x order growth."
            }
        ],
        education: [
            { degree: "MBA, Operations Management", school: "Kellogg School of Management", place: "Evanston, IL", dates: "2012 - 2014" },
            { degree: "BSc Industrial Engineering", school: "University of Lagos", place: "Lagos", dates: "2005 - 2009" }
        ],
        /* One project, not three. The sample exists to show what the preview
           does with a section, and every extra row is a row the visitor has to
           delete before typing their own. */
        projects: [
            {
                name: "Depot Routing Rebuild",
                role: "Programme lead - nine sites, twelve carriers",
                dates: "2023",
                description: "Replaced a manual routing spreadsheet with a rules engine the depot managers maintain themselves.\nCut empty-mile running 22% in the first quarter after rollout."
            }
        ],
        /* ONE referee, and it is the section that decides whether the sample
           paginates. A second one costs Classic a whole page rather than a few
           lines: References is the last section, so its heading lands near the
           foot of the page, and a heading now reserves its own assembly plus
           its body's first line -- 80pt for an entries body. Miss that window
           and the entire section moves down, taking 98pt of usable page with
           it. Classic measured 692 of 790.87 with two referees and still
           paginated, which is why the fit was checked by rendering rather than
           by counting lines.

           No phone on purpose: an omitted field still has to leave no dangling
           separator, and this is what keeps that demonstrated now that the
           second referee -- which used to carry the other half of it -- is
           gone. */
        references: [
            { name: "Marcus Ellery", title: "VP Supply Chain", company: "Northwind Logistics", email: "m.ellery@example.com", phone: "" }
        ]
    };

    /* Renders the sample-content notice above the form. Clearing swaps the
       whole editor back to a blank document in one action. */
    function showSampleNotice() {
        const pane = form.parentElement;
        if (!pane || document.getElementById("sample-notice")) {
            return;
        }

        const notice = document.createElement("div");
        notice.className = "sample-notice";
        notice.id = "sample-notice";

        const text = document.createElement("p");
        text.textContent = "This is sample content so you can see how the live preview works. Type over it, or start from an empty resume.";

        const clear = document.createElement("button");
        clear.type = "button";
        clear.className = "btn btn-secondary btn-small";
        clear.textContent = "Start blank";
        clear.addEventListener("click", () => {
            form.querySelectorAll("[data-bind]").forEach((input) => {
                input.value = "";
            });
            experienceList.textContent = "";
            educationList.textContent = "";
            addEntryRow(experienceList, tplExperience);
            addEntryRow(educationList, tplEducation);
            /* Languages are rows too, so clearing [data-bind] controls does
               not reach them -- they have to be emptied by hand like the two
               lists above, or the sample's three languages survive a blank
               start. */
            if (languageList && tplLanguage) {
                languageList.textContent = "";
                addEntryRow(languageList, tplLanguage);
            }
            /* Same story for projects and references: rows, not [data-bind]
               controls, so the sweep above does not reach them and the
               sample's entries would survive a blank start. */
            [[projectsList, tplProject], [referencesList, tplReference]]
                .forEach(([listEl, template]) => {
                    if (!listEl || !template) return;
                    listEl.textContent = "";
                    addEntryRow(listEl, template);
                });
            /* Starting blank clears the CONTENT, not the design. The template
               stays selected and its own accent comes back, so "Start blank"
               on a template chosen from a catalog card does not silently
               return the visitor to Classic charcoal. */
            applyAccent(defaultAccentFor(currentTemplate));
            notice.remove();
            persistAndRender();
            const first = form.querySelector("[data-bind]");
            if (first) {
                first.focus();
            }
        });

        notice.appendChild(text);
        notice.appendChild(clear);
        pane.insertBefore(notice, pane.firstChild);
    }

    const form = document.getElementById("resume-form");
    const sheet = document.getElementById("resume-sheet");
    if (!form || !sheet) {
        return;
    }

    const experienceList = document.getElementById("experience-list");
    const educationList = document.getElementById("education-list");
    const languageList = document.getElementById("language-list");
    const projectsList = document.getElementById("projects-list");
    const referencesList = document.getElementById("references-list");
    const tplExperience = document.getElementById("tpl-experience");
    const tplEducation = document.getElementById("tpl-education");
    const tplLanguage = document.getElementById("tpl-language");
    const tplProject = document.getElementById("tpl-project");
    const tplReference = document.getElementById("tpl-reference");
    const swatchRow = document.getElementById("swatch-row");
    const docNameInput = document.getElementById("doc-name");
    const templateRow = document.getElementById("template-row");

    /* ----------------------------------------------------------------------
       Template selection.

       The registry is consulted through catalogTemplates() rather than
       TBResume.byId(), which falls back to the FIRST registry entry for an
       unknown id -- correct for the internal harness, wrong here: a saved
       document naming a template that has since been retired would silently
       render as some other design. An unknown id must fall back to Classic,
       which is what an editor that never had a picker produced.
       ---------------------------------------------------------------------- */

    let currentTemplate = CLASSIC_ID;

    /* Templates a VISITOR may choose: registry entries flagged `catalog`.
       Unflagged entries stay reachable from the internal harness at
       tools/resume-template-preview.html and never appear here, because they
       may read fields this form does not collect. An empty list means the
       registry or the engine failed to load, which the callers report -- since
       the Classic migration there is no hand-written renderer to fall back to. */
    function catalogTemplates() {
        if (!window.TBResume || !window.TB_RESUME_TEMPLATES) {
            return [];
        }
        return window.TB_RESUME_TEMPLATES.filter((t) => t.catalog);
    }

    /* The descriptor for an id, falling back to Classic.

       Deliberately not TBResume.byId(), which falls back to the FIRST registry
       entry: correct for the harness, wrong here, because a saved document
       naming a retired template would silently render as some other design.
       Classic is the honest fallback -- it is what this editor produced before
       it had a picker at all. Null only when nothing loaded. */
    function engineTemplate(id) {
        const all = catalogTemplates();
        return all.filter((t) => t.id === id)[0]
            || all.filter((t) => t.id === CLASSIC_ID)[0]
            || null;
    }

    function defaultAccentFor(id) {
        const tpl = engineTemplate(id);
        return (tpl && tpl.defaultAccent) || DEFAULT_STATE.accent;
    }

    /* Shows the fields the current template draws and hides the rest. Hidden
       fields keep their values and keep being collected, deliberately, so
       switching templates never discards typed work -- the same judgement
       js/docs.js makes for its [data-for] fields. Scoped to `root` so a newly
       cloned entry row can be synced on its own without re-sweeping the page.

       Marked-up nodes with no data-templates attribute are shown by every
       template; only listed ones are conditional. */
    function syncTemplateFields(root) {
        (root || document).querySelectorAll("[data-templates]").forEach((node) => {
            node.hidden = node.getAttribute("data-templates")
                .split(/\s+/).indexOf(currentTemplate) === -1;
        });
    }

    function buildTemplateRow() {
        if (!templateRow) {
            return;
        }
        /* Classic is an ordinary registry entry since the migration, so the
           row is built from the registry alone -- it used to be prepended by
           hand here because no descriptor described it. */
        const picks = catalogTemplates().map((t) => ({ id: t.id, title: t.title }));

        picks.forEach((pick) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "template-pick";
            btn.setAttribute("data-template", pick.id);
            btn.setAttribute("aria-pressed", "false");
            /* textContent, never innerHTML: registry titles are data. */
            btn.textContent = pick.title;
            templateRow.appendChild(btn);
        });
    }

    /* `withAccent` is true when the visitor actively CHOSE this template --
       from the picker, or by arriving on a catalog card. It applies the
       template's own accent, which is what makes Ruled Serif open green
       without freezing the swatch row out of that template. Restoring a saved
       document passes false, so a returning visitor keeps the accent they
       picked rather than having it reset on every load. */
    function selectTemplate(id, withAccent) {
        /* Resolve THEN take the descriptor's own id, so an id the registry no
           longer carries is normalized to Classic rather than being stored and
           re-resolved on every load. engineTemplate() falls back internally,
           so testing its return for truthiness would accept anything. */
        const chosen = engineTemplate(id);
        currentTemplate = chosen ? chosen.id : CLASSIC_ID;
        TB.storageSet(TEMPLATE_KEY, currentTemplate);

        if (templateRow) {
            templateRow.querySelectorAll("[data-template]").forEach((btn) => {
                const on = btn.getAttribute("data-template") === currentTemplate;
                btn.classList.toggle("is-active", on);
                btn.setAttribute("aria-pressed", on ? "true" : "false");
            });
        }

        syncTemplateFields();

        /* Only a template that DECLARES an accent imposes one. Classic has no
           opinion about colour -- the swatch row is its colour control -- so
           landing on a Classic catalog card must not reset the accent a
           returning visitor chose. */
        if (withAccent && chosen && chosen.defaultAccent) {
            applyAccent(chosen.defaultAccent);
        }

        /* After the field toggles, so the jump list is rebuilt from the
           fieldsets this template actually shows. */
        if (TB.refreshFormNav) {
            TB.refreshFormNav();
        }
    }

    /* ----------------------------------------------------------------------
       State collection: sweep the live form, scrub every string through the
       sanitization firewall, then persist the snapshot to localStorage.
       ---------------------------------------------------------------------- */

    function collectEntries(listEl, fieldNames) {
        /* A missing list means the markup and this file have gone out of step,
           which is a deploy fault rather than a runtime one. Returning nothing
           keeps the editor working in every other respect; throwing here would
           take collectState with it, and with it the save AND the render. */
        if (!listEl) return [];
        return Array.from(listEl.querySelectorAll("[data-entry]")).map((row) => {
            const entry = {};
            fieldNames.forEach((name) => {
                const input = row.querySelector('[data-entry-field="' + name + '"]');
                entry[name] = TB.sanitize(input ? input.value : "");
            });
            return entry;
        });
    }

    /* ----------------------------------------------------------------------
       Languages.

       Stored as it always was -- one "Name: Level" line per language in
       fields.languages -- but no longer TYPED that way. The field used to be a
       textarea with a hint explaining that a CEFR band or a percentage drew
       the proficiency bar and other wording did not, which put the rule in a
       sentence and left the visitor guessing. It is a row per language now:
       a name, a level chosen from the levels that actually draw a bar, and an
       "Other" choice that reveals a free-text box for anything else.

       Keeping the STORED format unchanged is deliberate. The engine's `meters`
       body and the template's `levels` map both read that string and are
       already verified against it, and every document saved before this change
       still loads -- an unrecognised level simply arrives as "Other" with its
       text intact.
       ---------------------------------------------------------------------- */

    const LEVEL_CUSTOM = "__custom__";

    /* The known levels, read out of the row template's own <option> values
       rather than repeated here. Adding a level to resume.html is therefore
       the whole change; this list follows. */
    function knownLevels() {
        if (!tplLanguage) {
            return [];
        }
        return Array.from(tplLanguage.content.querySelectorAll("option"))
            .map((option) => option.value)
            .filter((value) => value !== LEVEL_CUSTOM);
    }

    /* Rows to the one string the template reads. A row with no language name
       is dropped whatever its level says: a level belonging to no language is
       not a line anyone meant to write. */
    function collectLanguages() {
        if (!languageList) {
            return "";
        }
        return Array.from(languageList.querySelectorAll("[data-entry]")).map((row) => {
            const field = (name) => row.querySelector('[data-entry-field="' + name + '"]');
            const name = (field("name") || {}).value || "";
            const select = field("level");
            const custom = field("custom");
            const picked = select ? select.value : "";
            const level = picked === LEVEL_CUSTOM
                ? ((custom || {}).value || "").trim()
                : picked;
            if (!name.trim()) {
                return "";
            }
            return level ? name.trim() + ": " + level : name.trim();
        }).filter(Boolean).join("\n");
    }

    /* The string back to rows, for hydrating a saved document. A level the
       option list does not carry becomes the "Other" selection with its own
       wording preserved, so nothing a visitor typed before this change is
       lost or silently rewritten. */
    function parseLanguages(value) {
        const known = knownLevels();
        return TB.desanitize(value || "").split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
                const cut = line.indexOf(":");
                const name = (cut < 0 ? line : line.slice(0, cut)).trim();
                const level = cut < 0 ? "" : line.slice(cut + 1).trim();
                return known.indexOf(level) !== -1
                    ? { name: name, level: level, custom: "" }
                    : { name: name, level: LEVEL_CUSTOM, custom: level };
            });
    }

    /* The free-text box exists only while "Other" is the choice. */
    function syncLanguageRow(row) {
        const select = row.querySelector('[data-entry-field="level"]');
        const box = row.querySelector("[data-language-custom]");
        if (select && box) {
            box.hidden = select.value !== LEVEL_CUSTOM;
        }
    }

    function collectState() {
        const state = {
            accent: currentAccent,
            docName: TB.sanitize(docNameInput ? docNameInput.value : DEFAULT_DOC_NAME),
            template: currentTemplate,
            fields: {},
            experience: collectEntries(experienceList,
                ["role", "company", "place", "dates", "description"]),
            education: collectEntries(educationList,
                ["degree", "school", "place", "dates"]),
            /* The field NAMES here are the contract with the descriptors: a
               block reads `row.name`, so a rename in one place without the
               other silently empties the section rather than erroring. */
            projects: collectEntries(projectsList,
                ["name", "role", "dates", "description"]),
            references: collectEntries(referencesList,
                ["name", "title", "company", "email", "phone"])
        };
        form.querySelectorAll("[data-bind]").forEach((input) => {
            state.fields[input.getAttribute("data-bind")] = TB.sanitize(input.value);
        });
        /* After the [data-bind] sweep: languages is composed from its rows,
           not bound to a single control. */
        state.fields.languages = TB.sanitize(collectLanguages());
        return state;
    }

    function persistAndRender() {
        const state = collectState();
        TB.storageSet(STORAGE_KEY, state);
        TB.markSaved();
        renderPreview(state);
    }

    /* ----------------------------------------------------------------------
       Repeating entry rows, cloned from static <template> markup.
       ---------------------------------------------------------------------- */

    function addEntryRow(listEl, template, values) {
        const row = template.content.firstElementChild.cloneNode(true);
        if (values) {
            row.querySelectorAll("[data-entry-field]").forEach((input) => {
                const key = input.getAttribute("data-entry-field");
                input.value = TB.desanitize(values[key] || "");
            });
        }
        row.querySelector("[data-entry-remove]").addEventListener("click", () => {
            row.remove();
            persistAndRender();
        });
        /* A cloned row carries the conditional fields of every template, so
           it has to be reconciled with the current one before it is shown. */
        syncTemplateFields(row);
        /* A language row also has to agree with its own level choice, or a
           hydrated "Other" row appears with its wording box still hidden. */
        syncLanguageRow(row);
        listEl.appendChild(row);
    }

    /* Wires an "Add" button to its list. Guarded like hydrateList below, so a
       page served without one of these sections degrades to not offering it
       rather than throwing on load and taking the whole editor down. */
    function bindAdd(buttonId, listEl, template) {
        const button = document.getElementById(buttonId);
        if (!button || !listEl || !template) return;
        button.addEventListener("click", () => {
            addEntryRow(listEl, template);
            persistAndRender();
        });
    }

    /* Fills one repeating list from saved rows, falling back to a single
       blank row. Guarded on the list and its template because a section added
       later than a saved document is exactly the case this has to survive. */
    function hydrateList(listEl, template, rows, fallback) {
        if (!listEl || !template) return;
        const source = (rows && rows.length) ? rows : (fallback || []);
        source.forEach((entry) => addEntryRow(listEl, template, entry));
    }

    /* ----------------------------------------------------------------------
       Preview rendering. ONE renderer as of August 30, 2026: every template,
       Classic included, is a descriptor drawn by js/resume-engine.js.

       This file used to carry a second, hand-written pair -- an HTML preview
       and a jsPDF writer -- for the Classic layout. They agreed about content
       and about nothing else: different fonts, different sizes, different
       spacing, so the live preview never showed what the download would
       contain, and a Classic resume that ran to two pages said so nowhere.
       Both are deleted. Their replacement was checked against them first,
       run for run, before either was removed; the measurements are in
       docs/implementation/CLASSIC_TEMPLATE_MIGRATION.md.

       Nothing here builds DOM from strings: the engine paints with
       createElementNS and textContent only.
       ---------------------------------------------------------------------- */

    function renderPreview(state) {
        /* A repaint replaces the sheet's children, which takes any open
           overlay with it. Drop the stale reference rather than leaving a
           handle to a detached input that a later blur would try to commit. */
        if (openEditor && !sheet.contains(openEditor.input)) {
            openEditor = null;
        }
        const tpl = engineTemplate(state.template);
        if (!tpl) {
            /* The registry or the engine failed to load. Nothing can be drawn,
               so say so rather than leaving a blank rectangle that reads as a
               document with no content in it. */
            showSheetMessage("The template library could not be loaded. Reload the page to try again.");
            return;
        }
        /* .is-engine is added only once a sheet has actually been painted. It
           turns the container into the workspace mat the pages sit on, and
           adding it while a paint is still pending would collapse the pane to
           nothing and back. */
        sheet.classList.toggle("is-engine", paintEngine(tpl, state));
    }

    /* Set once while a first paint is waiting on jsPDF, so the retry is
       registered a single time however many keystrokes arrive first. */
    let awaitingPdf = false;

    function showSheetMessage(message) {
        sheet.classList.remove("is-engine");
        const note = document.createElement("p");
        note.className = "sheet-message";
        note.textContent = message;
        sheet.replaceChildren(note);
    }

    /* True when the sheet was painted.

       js/resume.js is a plain end-of-body script, so it runs BEFORE the
       deferred jsPDF tag in the head. The engine measures every line through
       jsPDF and cannot lay out without it, so the first paint on a cold load
       has nothing to measure with. Rather than draw a wrong sheet, the
       container is left alone and repainted once jsPDF has run --
       DOMContentLoaded fires after deferred scripts, and load is the backstop
       for a slow CDN.

       If jsPDF never arrives at all the sheet says so. That case used to be
       covered by the hand-written renderer, which needed no library; with one
       renderer there is nothing to fall back TO, so the failure has to be
       reported instead of leaving an empty white pane forever. */
    function paintEngine(tpl, state) {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            if (!awaitingPdf) {
                awaitingPdf = true;
                const repaint = () => {
                    if (!awaitingPdf) {
                        return;
                    }
                    if (!window.jspdf || !window.jspdf.jsPDF) {
                        return;
                    }
                    awaitingPdf = false;
                    renderPreview(collectState());
                };
                document.addEventListener("DOMContentLoaded", repaint, { once: true });
                window.addEventListener("load", repaint, { once: true });
                /* Last word, after load has been and gone with no library. */
                window.addEventListener("load", () => {
                    if (awaitingPdf) {
                        showSheetMessage("The preview engine could not be loaded. Check your connection and reload.");
                    }
                }, { once: true });
            }
            return false;
        }
        window.TBResume.renderPreview(tpl, state, sheet);
        labelPages();
        return true;
    }

    /* "Page 1 of 2" under each page, so a CV that has run over says so instead
       of the visitor having to notice a seam.

       Added here rather than inside the engine because a page number is EDITOR
       chrome, not part of the document: the engine paints the preview and the
       PDF from one display list, so anything it drew would be exported into
       the file itself. Nothing is added to a single-page document.

       renderPreview() calls replaceChildren() first, so these are rebuilt from
       scratch on every keystroke and cannot accumulate. */

    /* ----------------------------------------------------------------------
       Click-to-edit on the preview.

       The sheet is an SVG, which cannot host a caret -- that is the price of
       painting the preview and the PDF from one display list, and it is not
       negotiable. So the engine tags every run it drew with the control that
       produced it (`data-edit`), and this layer does one of two things with a
       click:

         inline   float a real <input> exactly over the run, matched for font,
                  size, weight, colour and alignment. The visitor types on the
                  document; the sheet re-renders when they leave.
         hand off focus and reveal the form control instead. Used wherever an
                  overlay would be a lie: wrapped prose (many runs, one field),
                  a joined contact line (one run, many fields), a split name
                  (half a value), and <select>s.

       Nothing here can reach the PDF: it edits form controls, and the export
       is built from those. The overlay is removed before any re-render.
       ---------------------------------------------------------------------- */

    /* The control a `data-edit` descriptor points at, or null. */
    function controlFor(edit) {
        if (!edit) {
            return null;
        }
        if (edit.bind) {
            return form.querySelector('[data-bind="' + edit.bind + '"]');
        }
        if (!edit.entry) {
            return null;
        }
        const list = document.getElementById(edit.entry.list + "-list");
        if (!list) {
            return null;
        }
        let rows = Array.from(list.querySelectorAll("[data-entry]"));
        /* Languages are composed into one string by collectLanguages(), which
           DROPS any row with no language name -- so the engine's row index
           counts named rows only. Filtering the same way here is what keeps
           the two ends agreeing; using the raw DOM index would put the caret
           in the wrong row as soon as one above it was left unnamed. */
        if (edit.entry.list === "language") {
            rows = rows.filter((row) => {
                const name = row.querySelector('[data-entry-field="name"]');
                return name && name.value.trim();
            });
        }
        const row = rows[edit.entry.index];
        return row
            ? row.querySelector('[data-entry-field="' + edit.entry.key + '"]')
            : null;
    }

    /* The text the caret should start on. For a `part` descriptor that is one
       segment of a multi-value field, not the whole of it. */
    function valueFor(control, edit) {
        const whole = TB.desanitize(control.value || "");
        if (!edit.part) {
            return whole;
        }
        const seg = whole.split(edit.part.split === "\n" ? /\r?\n/ : edit.part.split);
        return (seg[edit.part.index] || "").trim();
    }

    /* Writes an edited value back, splicing it into place when the descriptor
       addresses one segment. The separator is re-used verbatim so a
       comma-separated field keeps its ", " and a newline field keeps its
       lines. */
    function writeValue(control, edit, next) {
        if (!edit.part) {
            control.value = next;
            return;
        }
        const isNewline = edit.part.split === "\n";
        const whole = TB.desanitize(control.value || "");
        const seg = whole.split(isNewline ? /\r?\n/ : edit.part.split);
        if (edit.part.index >= seg.length) {
            return;
        }
        seg[edit.part.index] = isNewline ? next : " " + next;
        control.value = seg.join(isNewline ? "\n" : ",").replace(/^\s+/, "");
    }

    /* Every run drawn from the SAME descriptor, in document order. A wrapped
       paragraph is many runs to one value, and unioning them is what lets one
       overlay stand in for the whole of it instead of for whichever line
       happened to be under the cursor.

       Compared as serialised descriptors because that is exactly what the
       engine wrote: two runs of one field carry an identical string by
       construction. Scoped to the run's own <svg>, so a paragraph that broke
       across a page boundary edits the half that was clicked -- one
       absolutely positioned box cannot span two sheets with a band of mat
       between them. */
    function runsSharing(target) {
        const key = target.getAttribute("data-edit");
        const page = target.ownerSVGElement;
        if (!page || !key) {
            return [target];
        }
        return Array.from(page.querySelectorAll(".rt-editable"))
            .filter((n) => n.getAttribute("data-edit") === key);
    }

    /* Union of the runs' screen boxes, in the sheet's own coordinates -- the
       overlay is a child of the sheet, which is the positioned ancestor. */
    function unionBox(nodes) {
        const origin = sheet.getBoundingClientRect();
        let l = Infinity;
        let t = Infinity;
        let r = -Infinity;
        let b = -Infinity;
        nodes.forEach((n) => {
            const box = n.getBoundingClientRect();
            l = Math.min(l, box.left);
            t = Math.min(t, box.top);
            r = Math.max(r, box.right);
            b = Math.max(b, box.bottom);
        });
        return { left: l - origin.left, top: t - origin.top,
                 width: r - l, height: b - t };
    }

    /* One entry per DESCRIPTOR, in document order: the Tab order of the sheet.
       A wrapped paragraph is one stop rather than one stop per line, which is
       the same grouping the overlay uses. */
    function editableStops() {
        const seen = Object.create(null);
        const stops = [];
        Array.from(sheet.querySelectorAll(".rt-editable")).forEach((n) => {
            const key = n.getAttribute("data-edit");
            if (!key || seen[key]) {
                return;
            }
            seen[key] = true;
            stops.push(n);
        });
        return stops;
    }

    /* The open overlay, if any. At most one at a time. */
    let openEditor = null;

    function closeEditor(commit) {
        if (!openEditor) {
            return;
        }
        const { input, control, edit, group } = openEditor;
        openEditor = null;
        group.forEach((n) => n.style.removeProperty("visibility"));
        const next = input.value;
        input.remove();
        if (!commit) {
            renderPreview(collectState());
            return;
        }
        writeValue(control, edit, next);
        /* Through the form's own listener, so the edit takes exactly the path
           a keystroke in the form takes: sanitize, persist, re-render. */
        control.dispatchEvent(new Event("input", { bubbles: true }));
    }

    /* Focus a control and bring it into view, for the descriptors an overlay
       cannot honestly represent. */
    function revealControl(control) {
        const fieldset = control.closest("fieldset");
        if (fieldset && fieldset.hidden) {
            return;
        }
        control.scrollIntoView({ block: "center", behavior: "smooth" });
        control.focus({ preventScroll: true });
        if (control.select && control.type !== "email") {
            try { control.select(); } catch (err) { /* selects cannot */ }
        }
    }

    /* Float an editor over the run -- or the group of runs -- that was
       clicked.

       Sizing comes from the runs' own screen boxes and the SVG's scale, so
       the overlay matches whatever width the pane happens to be: the sheet is
       laid out in points on a 595-wide viewBox and displayed at whatever CSS
       width the pane gives it. */
    function openInlineEditor(target, control, edit) {
        const svg = target.ownerSVGElement;
        const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
        const group = edit.multi ? runsSharing(target) : [target];
        /* A textarea only where the value behind the run really is multi-line,
           which means a whole textarea field. A `part` descriptor addresses
           ONE line of one, so it takes a single-line input: a textarea there
           would let a newline split one bullet into two silently. */
        const multiline = control.tagName === "TEXTAREA" && !edit.part;
        const box = unionBox(group);
        const pad = 2;

        const input = document.createElement(multiline ? "textarea" : "input");
        if (!multiline) {
            input.type = "text";
        }
        input.className = "rt-inline-editor";
        input.value = valueFor(control, edit);
        if (control.maxLength > 0) {
            input.maxLength = control.maxLength;
        }
        input.setAttribute("aria-label", "Edit this text");

        const cs = window.getComputedStyle(target);
        const fontPx = parseFloat(target.getAttribute("font-size")) * scale;
        /* The engine's OWN leading, read off the gap between two runs of the
           group rather than guessed from the font size -- every template sets
           its own lineHeight and none of them is a fixed multiple of the
           size. With one run there is no gap to read, and none is needed. */
        let leading = fontPx * 1.3;
        if (group.length > 1) {
            leading = (parseFloat(group[1].getAttribute("y"))
                       - parseFloat(group[0].getAttribute("y"))) * scale;
        }

        input.style.left = (box.left - pad) + "px";
        input.style.top = (box.top - pad) + "px";
        input.style.fontFamily = cs.fontFamily;
        input.style.fontSize = fontPx + "px";
        input.style.fontWeight = cs.fontWeight;
        input.style.color = target.getAttribute("fill") || "inherit";

        if (multiline) {
            /* Height from the LEADING and the line count, not from the union
               of the ink boxes: those measure glyph extents, so three lines of
               prose union to about two leadings plus a cap height and the last
               line would be clipped. */
            input.style.lineHeight = leading + "px";
            input.style.width = (box.width + pad * 2 + 6) + "px";
            input.style.height = (leading * group.length + pad * 2) + "px";
            input.rows = group.length;
        } else {
            input.style.lineHeight = "1.15";
            /* A generous minimum so a short value is still comfortable to type
               in, and room to grow past the text it replaces. */
            input.style.width = Math.max(box.width + 24, 90) + "px";
            input.style.height = (box.height + pad * 2) + "px";
        }

        if (target.getAttribute("text-anchor") === "middle") {
            input.style.textAlign = "center";
            input.style.left =
                (box.left - (parseFloat(input.style.width) - box.width) / 2) + "px";
        }

        /* Hide the painted runs while the overlay stands in for them, so the
           two are never legible at once and half-overlapping. */
        group.forEach((n) => { n.style.visibility = "hidden"; });
        sheet.appendChild(input);
        openEditor = { input: input, control: control, edit: edit, group: group };

        input.focus();
        input.select();

        /* Grow with the text rather than clipping it. An overlay that stops at
           the width of the words it replaced feels full the moment anything is
           added to it. */
        if (!multiline) {
            const floor = parseFloat(input.style.width);
            input.addEventListener("input", () => {
                input.style.width = "0px";
                input.style.width = Math.max(floor, input.scrollWidth + 8) + "px";
            });
        }

        input.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                closeEditor(false);
                return;
            }
            if (event.key === "Tab") {
                event.preventDefault();
                stepEditor(event.shiftKey ? -1 : 1);
                return;
            }
            if (event.key !== "Enter") {
                return;
            }
            /* Enter is a newline in a textarea and a commit everywhere else.
               Ctrl or Cmd commits either way, which is the only way out of a
               textarea that involves neither the mouse nor Tab. */
            if (!multiline || event.ctrlKey || event.metaKey) {
                event.preventDefault();
                closeEditor(true);
            }
        });
        input.addEventListener("blur", () => closeEditor(true));
        /* The sheet's own handler must not treat a click inside the overlay as
           a click on the document underneath it. */
        input.addEventListener("mousedown", (event) => event.stopPropagation());
    }

    /* The live node for a descriptor, or null. */
    function nodeFor(key) {
        return Array.from(sheet.querySelectorAll(".rt-editable"))
            .filter((n) => n.getAttribute("data-edit") === key)[0] || null;
    }

    /* Open one run: an overlay where one can stand in for the value, the form
       control itself where it cannot. */
    function activate(target) {
        const key = target.getAttribute("data-edit");
        let edit = null;
        try {
            edit = JSON.parse(key);
        } catch (err) {
            return;
        }
        /* Commit whatever was open BEFORE measuring anything. That dispatches
           an input event on the form, and the form's listener re-renders the
           preview synchronously -- which replaces every node on the sheet,
           `target` among them. A detached node measures as a zero box, so the
           overlay that followed came out 14px wide and 4 high: clicking
           straight from one phrase to the next opened a slot too small to see
           the text in. Re-resolving by descriptor is what survives the
           re-render, and it is the same identity Tab traversal uses. */
        closeEditor(true);
        const live = target.isConnected ? target : nodeFor(key);
        if (!live) {
            return;
        }
        const control = controlFor(edit);
        if (!control) {
            return;
        }
        if (edit.inline === false) {
            revealControl(control);
            return;
        }
        openInlineEditor(live, control, edit);
    }

    /* Tab and Shift-Tab walk the sheet in reading order, committing as they
       go. The next stop is remembered by its DESCRIPTOR rather than by its
       node or its index: committing re-renders the preview, which replaces
       every node, and an edit that adds or removes a wrapped line changes how
       many runs there are. The descriptor is the one identity that survives
       both. */
    function stepEditor(delta) {
        const current = openEditor && openEditor.group[0];
        if (!current) {
            closeEditor(true);
            return;
        }
        const key = current.getAttribute("data-edit");
        const stops = editableStops();
        let i = -1;
        stops.forEach((n, idx) => {
            if (i < 0 && n.getAttribute("data-edit") === key) {
                i = idx;
            }
        });
        const next = i < 0 ? null : stops[i + delta];
        const nextKey = next ? next.getAttribute("data-edit") : null;
        closeEditor(true);
        if (!nextKey) {
            return;
        }
        /* Looked up after the re-render the commit above triggered, not
           before it: `next` is one of the nodes that commit just replaced. */
        const node = nodeFor(nextKey);
        if (node) {
            node.scrollIntoView({ block: "nearest" });
            activate(node);
        }
    }

    function bindPreviewEditing() {
        sheet.addEventListener("mousedown", (event) => {
            const target = event.target.closest(".rt-editable");
            if (!target) {
                closeEditor(true);
                return;
            }
            if (openEditor && openEditor.group.indexOf(target) !== -1) {
                return;
            }
            event.preventDefault();
            activate(target);
        });
    }

    function labelPages() {
        const pages = sheet.querySelectorAll("svg.rt-sheet");
        if (pages.length < 2) {
            return;
        }
        pages.forEach((page, i) => {
            const label = document.createElement("p");
            label.className = "rt-page-label";
            label.textContent = "Page " + (i + 1) + " of " + pages.length;
            page.insertAdjacentElement("afterend", label);
        });
    }

    /* ----------------------------------------------------------------------
       Accent color theming via CSS custom properties.
       ---------------------------------------------------------------------- */

    let currentAccent = DEFAULT_STATE.accent;

    function applyAccent(accent) {
        currentAccent = /^#[0-9A-Fa-f]{6}$/.test(accent) ? accent : DEFAULT_STATE.accent;
        swatchRow.querySelectorAll(".swatch").forEach((btn) => {
            btn.classList.toggle("is-active", btn.getAttribute("data-accent") === currentAccent);
        });
    }

    swatchRow.addEventListener("click", (event) => {
        const swatch = event.target.closest("[data-accent]");
        if (swatch) {
            applyAccent(swatch.getAttribute("data-accent"));
            persistAndRender();
        }
    });

    if (templateRow) {
        templateRow.addEventListener("click", (event) => {
            const pick = event.target.closest("[data-template]");
            if (pick) {
                selectTemplate(pick.getAttribute("data-template"), true);
                persistAndRender();
            }
        });
    }

    /* ----------------------------------------------------------------------
       PDF export. The engine paints it from the SAME display list it painted
       the preview from, so what was on screen and what lands in the file
       cannot disagree -- which is the whole reason the hand-written writer
       that used to sit here was retired on August 30, 2026.

       Still the jsPDF native text API underneath: every string is drawn with
       doc.text(), so the export carries real vector glyphs and stays
       ATS-parseable. Nothing may go through a canvas here; see
       docs/error-fixes/RESUME_PDF_RASTERIZED_TEXT_FIX.md.
       ---------------------------------------------------------------------- */

    document.getElementById("download-pdf").addEventListener("click", () => {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            window.alert("The PDF engine is still loading. Please try again in a moment.");
            return;
        }
        const state = collectState();

        /* The name in the bar is what names the file (August 24, 2026).
           Before this it named nothing at all: the export was always built
           from the person's name field, so renaming the resume in the header
           had no observable effect anywhere -- typed, saved, and silently
           unused.

           It only wins when the visitor actually changed it. Left at the
           default, the person's name is the better filename and stays the
           fallback, so nothing regresses for anyone who never touches the
           field. */
        const named = TB.desanitize(state.docName).trim() === DEFAULT_DOC_NAME
            ? ""
            : TB.fileSlug(state.docName);
        const safeName = named || TB.fileSlug(state.fields.name) || "resume";

        const tpl = engineTemplate(state.template);
        if (!tpl) {
            window.alert("The template library could not be loaded. Reload the page and try again.");
            return;
        }
        window.TBResume.buildPdf(tpl, state).save(safeName + "-templatebox.pdf");
    });

    /* ----------------------------------------------------------------------
       Initialization: sweep localStorage, hydrate the form, first render.
       ---------------------------------------------------------------------- */

    function init() {
        const saved = TB.storageGet(STORAGE_KEY);
        const hasSaved = Boolean(saved && saved.fields);
        /* Sample content only on a genuinely first visit; saved work always
           wins, so returning visitors never see their document replaced. */
        const state = hasSaved ? saved : SAMPLE_STATE;

        applyAccent(state.accent);

        if (docNameInput) {
            docNameInput.value = TB.desanitize(state.docName || DEFAULT_DOC_NAME);
        }

        form.querySelectorAll("[data-bind]").forEach((input) => {
            input.value = TB.desanitize(state.fields[input.getAttribute("data-bind")] || "");
        });

        /* A catalog card's data-doc names the template, handed over through
           localStorage by bindLaunchControls() in js/app.js. It beats the
           saved choice on purpose: arriving on the Ruled Serif card IS the
           request for that design, and only the design changes -- the
           visitor's content is untouched and their previous template is one
           click away in the picker. Absent a preset, the saved choice wins,
           then Classic. */
        buildTemplateRow();
        const preset = TB.takePreset ? TB.takePreset() : "";
        selectTemplate(
            preset || (hasSaved && state.template) || TB.storageGet(TEMPLATE_KEY) || CLASSIC_ID,
            Boolean(preset));

        const experience = state.experience && state.experience.length
            ? state.experience
            : DEFAULT_STATE.experience;
        const education = state.education && state.education.length
            ? state.education
            : DEFAULT_STATE.education;

        experience.forEach((entry) => addEntryRow(experienceList, tplExperience, entry));
        education.forEach((entry) => addEntryRow(educationList, tplEducation, entry));

        /* Projects and references hydrate the same way, and an empty one still
           opens with a blank row so the section is visibly there to fill in --
           the rule the two lists above and the languages below both follow. */
        hydrateList(projectsList, tplProject, state.projects, DEFAULT_STATE.projects);
        hydrateList(referencesList, tplReference, state.references,
                    DEFAULT_STATE.references);

        /* Languages hydrate from the saved string rather than from a bound
           control, and an empty one still opens with a blank row so the
           section is visibly there to fill in, matching the two lists above. */
        if (languageList && tplLanguage) {
            const languages = parseLanguages(state.fields.languages);
            if (languages.length) {
                languages.forEach((row) => addEntryRow(languageList, tplLanguage, row));
            } else {
                addEntryRow(languageList, tplLanguage);
            }
        }

        /* Real-time binding: one delegated listener covers every current and
           future input inside the form, including cloned entry rows.

           A <select> fires `input` as well as `change`, so one listener still
           covers the level picker -- but the row it belongs to has to be
           reconciled BEFORE the state is collected, or choosing "Other"
           collects the level from a box that is still hidden. */
        form.addEventListener("input", (event) => {
            const row = event.target.closest("[data-entry]");
            if (row) {
                syncLanguageRow(row);
            }
            persistAndRender();
        });

        if (docNameInput) {
            docNameInput.addEventListener("input", persistAndRender);
        }

        document.getElementById("add-experience").addEventListener("click", () => {
            addEntryRow(experienceList, tplExperience);
            persistAndRender();
        });
        document.getElementById("add-education").addEventListener("click", () => {
            addEntryRow(educationList, tplEducation);
            persistAndRender();
        });
        const addLanguage = document.getElementById("add-language");
        if (addLanguage) {
            addLanguage.addEventListener("click", () => {
                addEntryRow(languageList, tplLanguage);
                persistAndRender();
            });
        }
        bindAdd("add-project", projectsList, tplProject);
        bindAdd("add-reference", referencesList, tplReference);

        bindPreviewEditing();

        if (!hasSaved) {
            showSampleNotice();
        }

        renderPreview(collectState());
    }

    init();
})();
