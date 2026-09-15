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

    /* The profile photograph gets its OWN key, and not for tidiness.

       TB.storageSet swallows a quota failure by design -- editing has to keep
       working without persistence -- so a record too large to write fails
       SILENTLY. A photograph is the only thing this editor stores that can
       plausibly approach the quota, and in the same record it would take the
       whole document down with it: every save from that moment on would fail
       and the visitor's typing would stop being kept, with nothing said. Two
       keys means the worst a photograph can do is fail to save itself, which
       is a case this file can see and report. */
    const PHOTO_KEY = "tb_resume_photo_v1";

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
            phoneAlt: "",
            fatherName: "",
            dateOfBirth: "",
            declaration: "",
            tagline: "",
            placeOfBirth: "",
            maritalStatus: "",
            nationality: "",
            height: "",
            weight: "",
            religion: ""
        },
        experience: [{ role: "", company: "", place: "", dates: "", description: "" }],
        education: [{ degree: "", school: "", place: "", dates: "", score: "" }],
        projects: [{ name: "", role: "", dates: "", description: "" }],
        references: [{ name: "", title: "", company: "", email: "", phone: "", refAddress: "" }]
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
            /* SIZED TO ONE PAGE. Every length in this object is load-bearing,
               and the margin is NO LONGER four lines: Labelled Sections is the
               binding template now and it has none.

               Measured, last baseline against each template's own boundary:
               Labelled Sections 802 against 838 at a 22pt line height, which
               is zero further lines; Classic 714.13 against 790.87; grey-rail
               721 against 800; Photo Profile 528.5. Ruled Serif is
               structurally two pages at any content volume and constrains
               nothing here.

               Zero is not an estimate. A sixth skill was added back and
               measured: it puts one bullet on a second page. Adding to any
               field in this object now costs Labelled Sections a whole page,
               and not gradually -- see the note on references below.
               Re-measure rather than eyeball it. */
            summary: "Operations leader with fifteen years running supply chain and fulfilment teams across three continents. Known for turning underperforming depots into reliable, measurable operations.",
            /* No commas INSIDE a skill: the field splits on commas, so
               "Friendly, positive attitude" would become two skills.

               FIVE, not the seven this carried until September 14, 2026. The
               last two -- both short, both trailing -- were the whole of what
               spilled onto a second page on Labelled Sections, which sets its
               skills one per line where Classic and Photo Profile set them
               tighter and grey-rail puts them in a sidebar. Removing them
               gives every other template slack rather than costing it. */
            skills: "Supply chain strategy, Vendor negotiation, Lean process design, Demand forecasting, Team leadership",
            languages: "English: Native\nSpanish: Upper intermediate (B2)",
            accomplishments: "Named Operations Leader of the Year by the Midwest Logistics Council.\nSpeaker on depot automation at the 2024 Supply Chain Summit.",
            /* Only the two-column template draws these; the others compose
               their contact line from `location` and `phone` above. */
            address: "1400 North Lake Shore Drive",
            city: "Chicago, IL",
            postcode: "60610",
            phoneAlt: "+1 (555) 220-7741",
            /* Drawn by the biodata sheet alone, and hidden everywhere
               else. They carry sample text for the same reason every
               other field does: a template that opens with three empty
               rows in its own signature block shows the visitor nothing
               about what it is. */
            /* Drawn by the portrait CV alone. Conventional on a CV in much
               of Asia, which is the market that design comes from. */
            tagline: "A dependable fast learner who adapts quickly to change.",
            placeOfBirth: "Enugu, Nigeria",
            maritalStatus: "Married",
            nationality: "Nigerian",
            height: "5'7 ft",
            weight: "63 kg",
            religion: "Christian",
            fatherName: "Chukwuemeka Nwosu",
            dateOfBirth: "4 March 1987",
            declaration: "I hereby declare that the information given above is true to the best of my knowledge and belief."
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
            { degree: "MBA, Operations Management", school: "Kellogg School of Management", place: "Evanston, IL", dates: "2012 - 2014", score: "3.8 GPA" },
            { degree: "BSc Industrial Engineering", school: "University of Lagos", place: "Lagos", dates: "2005 - 2009", score: "First Class" }
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
            { name: "Marcus Ellery", title: "VP Supply Chain", company: "Northwind Logistics", email: "m.ellery@example.com", phone: "+1 (555) 014-2200", refAddress: "1400 North Lake Shore Drive, Chicago" }
        ]
    };

    /* The notice above the form, which has TWO states rather than one.

       It used to be one-way: the sample loaded, the notice offered "Start
       blank", and pressing it removed both the content and the notice. There
       was then no way back -- a visitor who wanted to see the preview working
       again had to clear this browser's storage.

       So the same element now says one of two things:

         "sample"  the sample content is loaded, and the offer is to empty it
         "blank"   the document is empty, and the offer is to put it back

       One element that changes its wording rather than two that take turns: a
       second notice appearing where the first one was reads as the page having
       changed its mind.

       The "blank" offer is shown ONLY while the document is genuinely empty,
       which is what makes it safe without a confirm dialog. It cannot destroy
       work, because it is not there once there is any work to destroy -- and
       it comes back if the visitor empties the form again. */
    const NOTICE_COPY = {
        sample: {
            text: "This is sample content so you can see how the live preview works. Type over it, or start from an empty resume.",
            button: "Start blank"
        },
        blank: {
            text: "Started from blank. Bring the sample content back at any time if you want to see the live preview working against a filled-in resume.",
            button: "Bring the sample back"
        }
    };

    /* Whether the editor is entitled to show the SAMPLE notice. Not derived
       from the content, deliberately: the sample notice stays up while the
       visitor types over the sample, which is the behaviour it has always had
       and is the point at which it is still useful. */
    let sampleShown = false;

    /* Whether "Start blank" was pressed in THIS session.

       The offer to bring the sample back was shown only while the document
       was empty, on the argument that it could then destroy nothing. True,
       and it hid the control at the exact moment somebody goes looking for
       it: start blank, type your name, decide you wanted to see the sample
       after all -- and it is gone, because one letter counted as work.

       So it survives typing, for this session, and asks before overwriting
       anything. What it does NOT do is follow a returning visitor around: a
       reload with a real document in it shows no notice at all, because
       somebody opening a finished resume is not looking for sample content. */
    let blankedThisSession = false;

    function renderNotice(mode) {
        const pane = form.parentElement;
        if (!pane) { return; }
        let notice = document.getElementById("sample-notice");

        if (!mode) {
            if (notice) { notice.remove(); }
            return;
        }

        if (!notice) {
            notice = document.createElement("div");
            notice.className = "sample-notice";
            notice.id = "sample-notice";
            notice.appendChild(document.createElement("p"));
            const button = document.createElement("button");
            button.type = "button";
            button.className = "btn btn-secondary btn-small";
            /* Read at click time, not bound per mode: one listener on one
               button that does whatever the notice currently offers. */
            button.addEventListener("click", () => {
                if (notice.getAttribute("data-mode") === "sample") { startBlank(); }
                else { restoreSample(); }
            });
            notice.appendChild(button);
            pane.insertBefore(notice, pane.firstChild);
        }

        if (notice.getAttribute("data-mode") === mode) { return; }
        notice.setAttribute("data-mode", mode);
        notice.querySelector("p").textContent = NOTICE_COPY[mode].text;
        notice.querySelector("button").textContent = NOTICE_COPY[mode].button;
    }

    /* Empty means the visitor has nothing to lose. The doc NAME is not
       counted: "Start blank" never cleared it, so a document called something
       and holding nothing is still empty in the only sense that matters here.

       Entry rows are not filtered out when empty -- collectEntries keeps the
       blank row every list opens with -- so the test has to look inside them
       rather than at how many there are. */
    function documentIsEmpty(state) {
        const fields = state.fields || {};
        if (Object.keys(fields).some((key) => fields[key])) { return false; }
        if (state.photo) { return false; }
        return ["experience", "education", "projects", "references"].every((list) =>
            (state[list] || []).every((row) =>
                Object.keys(row).every((key) => !row[key])));
    }

    /* Called after every change, from persistAndRender, so the offer tracks
       the document rather than needing each call site to remember it. */
    function syncNotice(state) {
        if (documentIsEmpty(state)) {
            sampleShown = false;
            renderNotice("blank");
            return;
        }
        if (sampleShown) {
            renderNotice("sample");
            return;
        }
        renderNotice(blankedThisSession ? "blank" : null);
    }

    function startBlank() {
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
        /* And the photograph, for the third time the same reason: it is
           not a [data-bind] control either, so the sweep above does not
           reach it. Left out, "Start blank" produced an empty resume with
           the visitor's face still on it -- and left the photograph in
           storage, so it survived the reload too. Content, and a
           photograph is content.

           This is the one part of a blank start that "Bring the sample
           back" cannot undo: the photograph was the visitor's, not the
           sample's, and nothing here keeps a copy of it. */
        clearPhoto();
        /* Starting blank clears the CONTENT, not the design. The template
           stays selected and its own accent comes back, so "Start blank"
           on a template chosen from a catalog card does not silently
           return the visitor to Classic charcoal. */
        applyAccent(defaultAccentFor(currentTemplate));
        sampleShown = false;
        blankedThisSession = true;
        /* Which swaps the notice to its "blank" state by way of syncNotice,
           rather than this function knowing what the notice should say. */
        persistAndRender();
        const first = form.querySelector("[data-bind]");
        if (first) {
            first.focus();
        }
    }

    function restoreSample() {
        /* Only when there is something to lose. An empty document needs no
           confirmation and asking for one on every press would make the way
           back feel dangerous when it is not. */
        if (!documentIsEmpty(collectState()) &&
                !window.confirm("Replace what is in this form with the sample content?")) {
            return;
        }
        fillForm(SAMPLE_STATE);
        /* The content comes back and the design does not, which is the same
           rule "Start blank" follows in the other direction: the template the
           visitor chose stays chosen, and the accent they are looking at is
           not overwritten by the sample's own blue. */
        sampleShown = true;
        blankedThisSession = false;
        persistAndRender();
        const first = form.querySelector("[data-bind]");
        if (first) {
            first.focus();
        }
    }

    /* Fills the form's CONTENT from a state object.

       Extracted from init() when the sample gained a way back: restoring it is
       the same operation as the first load, and a second copy of it would be a
       second place for a newly added field to be forgotten.

       Design -- the template and the accent -- is deliberately not here. Both
       callers decide that for themselves, and they decide differently. */
    function fillForm(state) {
        if (docNameInput) {
            docNameInput.value = TB.desanitize(state.docName || DEFAULT_DOC_NAME);
        }

        form.querySelectorAll("[data-bind]").forEach((input) => {
            input.value = TB.desanitize(state.fields[input.getAttribute("data-bind")] || "");
        });

        const experience = state.experience && state.experience.length
            ? state.experience
            : DEFAULT_STATE.experience;
        const education = state.education && state.education.length
            ? state.education
            : DEFAULT_STATE.education;

        /* Emptied first. hydrateList and addEntryRow both APPEND, which is
           right on a first load into empty lists and would otherwise stack the
           sample on top of whatever is already there when it is restored. */
        experienceList.textContent = "";
        educationList.textContent = "";
        experience.forEach((entry) => addEntryRow(experienceList, tplExperience, entry));
        education.forEach((entry) => addEntryRow(educationList, tplEducation, entry));

        /* Projects and references hydrate the same way, and an empty one still
           opens with a blank row so the section is visibly there to fill in --
           the rule the two lists above and the languages below both follow. */
        if (projectsList) { projectsList.textContent = ""; }
        if (referencesList) { referencesList.textContent = ""; }
        hydrateList(projectsList, tplProject, state.projects, DEFAULT_STATE.projects);
        hydrateList(referencesList, tplReference, state.references,
                    DEFAULT_STATE.references);

        /* Languages hydrate from the saved string rather than from a bound
           control, and an empty one still opens with a blank row so the
           section is visibly there to fill in, matching the two lists above. */
        if (languageList && tplLanguage) {
            languageList.textContent = "";
            const languages = parseLanguages(state.fields.languages);
            if (languages.length) {
                languages.forEach((row) => addEntryRow(languageList, tplLanguage, row));
            } else {
                addEntryRow(languageList, tplLanguage);
            }
        }
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
    const photoInput = document.getElementById("f-photo");
    const photoError = document.getElementById("f-photo-error");
    const photoPreview = document.getElementById("photo-preview");
    const photoThumb = document.getElementById("photo-thumb");
    const photoRemove = document.getElementById("photo-remove");
    const photoFrameBox = document.getElementById("photo-frame");
    const photoReset = document.getElementById("photo-reset");
    const zoomInput = document.getElementById("f-photo-zoom");
    const xInput = document.getElementById("f-photo-x");
    const yInput = document.getElementById("f-photo-y");

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
        const scope = root || document;
        scope.querySelectorAll("[data-templates]").forEach((node) => {
            node.hidden = node.getAttribute("data-templates")
                .split(/\s+/).indexOf(currentTemplate) === -1;
        });
        /* `data-needs` asks the DESCRIPTOR rather than naming templates.

           The photo field was gated with data-templates="photo-rail", a list
           of one written when there was one. The Labelled Sections CV then
           arrived drawing a photograph, and the field stayed hidden on it --
           a frame on the sheet with no control to fill it. A list of which
           templates draw a photo is a second copy of something the registry
           already knows, and it went stale the first time it could. */
        scope.querySelectorAll("[data-needs]").forEach((node) => {
            node.hidden = !templateNeeds(node.getAttribute("data-needs"));
        });
    }

    /* Does the current template draw the thing this field feeds? Only
       "photo" is asked today; the shape takes another the day one is added. */
    function templateNeeds(what) {
        const chosen = engineTemplate(currentTemplate);
        if (!chosen) { return false; }
        if (what === "photo") {
            return (chosen.blocks || []).some((b) => b.kind === "photo");
        }
        return true;
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
                ["degree", "school", "place", "dates", "score"]),
            /* The field NAMES here are the contract with the descriptors: a
               block reads `row.name`, so a rename in one place without the
               other silently empties the section rather than erroring. */
            projects: collectEntries(projectsList,
                ["name", "role", "dates", "description"]),
            references: collectEntries(referencesList,
                ["name", "title", "company", "email", "phone", "refAddress"])
        };
        form.querySelectorAll("[data-bind]").forEach((input) => {
            state.fields[input.getAttribute("data-bind")] = TB.sanitize(input.value);
        });
        /* After the [data-bind] sweep: languages is composed from its rows,
           not bound to a single control. */
        state.fields.languages = TB.sanitize(collectLanguages());
        /* Not a form field and not sanitized: it is a base64 data URI this
           file produced from a canvas, and escaping its "+" and "/" would
           corrupt it. Both the engine and the reader above validate its shape
           instead, which is the check that actually matters for a URI. */
        state.photo = currentPhoto;
        return state;
    }

    function persistAndRender() {
        const state = collectState();
        /* The document record WITHOUT the photograph, which lives under its
           own key -- see PHOTO_KEY. Stripped from a copy so the state handed
           to the renderer still carries it. */
        const record = Object.assign({}, state);
        delete record.photo;
        TB.storageSet(STORAGE_KEY, record);
        TB.markSaved();
        /* Before the render rather than after: the notice sits above the form,
           not in the sheet, and doing it here means no call site has to
           remember that emptying the document changes what is on offer. */
        syncNotice(state);
        renderPreview(state);
    }

    /* ----------------------------------------------------------------------
       Profile photograph.

       NOTHING LEAVES THE DEVICE. The file is read by FileReader, drawn to a
       canvas and re-encoded, all in the page; the result is a data URI in
       this browser's localStorage and a bitmap inside a PDF the browser
       builds. There is no upload, which is the whole architecture of this
       site (Rule 1 in CLAUDE.md) and also the only answer worth giving to
       somebody being asked for a photograph of their face.

       THE STORED COPY IS ALREADY THE SHAPE THE SHEET DRAWS. Cropping happens
       once, here, to TBResume.PHOTO_RATIO, so the engine receives a bitmap at
       exactly the aspect its photo block will draw and neither painter ever
       rescales one axis against the other. Cropping at DRAW time was the
       obvious alternative and does not work: SVG can slice an image to a box
       and jsPDF's addImage cannot, so the preview would crop and the PDF
       would stretch -- the one disagreement between the two mediums the
       engine exists to make impossible.
       ---------------------------------------------------------------------- */

    /* Wide enough that the 167pt (2.32in) box on photo-rail still has ~207dpi
       of detail in the PDF, small enough that the JPEG lands in tens of
       kilobytes rather than hundreds. localStorage is a ~5MB budget shared
       with every other editor on this origin, and a phone photograph stored
       raw is 3-8MB on its own. */
    const PHOTO_W = 480;

    /* Empirically the knee for a portrait at this size: 0.82 is 30-60KB and
       indistinguishable from 0.95 at 480px, which is 3-4x larger. */
    const PHOTO_QUALITY = 0.82;

    /* Three values, and they are not interchangeable:

         photoMaster   the whole photograph, downscaled, as stored
         photoView     how the frame sits on it
         currentPhoto  the frame itself, which is what the sheet draws

       The third is DERIVED from the first two and is never the source of
       truth. It used to be the only one that existed, which is why framing
       could not be offered: there was nothing left to re-frame against. */
    let photoMaster = "";
    let photoView = { zoom: 1, x: 0, y: 0 };
    let currentPhoto = "";

    /* The decoded master, kept for the session so moving a slider does not
       decode a data URI on every input event. Null until one is loaded, and
       null is what disables the framing controls. */
    let masterImg = null;

    /* The ratio the engine draws, never a second copy of the number. Falls
       back only if the engine failed to load, in which case nothing will be
       drawn anyway and the value merely has to be sane. */
    function photoRatio() {
        return (window.TBResume && window.TBResume.PHOTO_RATIO) || 0.8;
    }

    /* The engine's OWN guard, applied here as well on the way OUT of storage,
       so a hostile or corrupted value is dropped at the boundary rather than
       being carried through the form, the thumbnail and the state object
       first. Called rather than copied: this file carried its own identical
       regex briefly, and a security rule written down twice agrees on the day
       it is written and stops agreeing the day one copy is widened.

       Without the engine there is nothing to draw and nothing to protect, so
       an absent library rejects rather than falls back to a second copy. */
    function validPhoto(url) {
        return Boolean(window.TBResume && window.TBResume.isPhotoUrl &&
                       window.TBResume.isPhotoUrl(url));
    }

    function canvasOf(w, h) {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        return c;
    }

    /* The largest edge kept of the WHOLE photograph, and the quality it is
       kept at.

       This is new, and it is what makes framing possible. The editor used to
       keep only the finished 4:5 crop, so there was nothing left to re-frame
       against: moving the picture would have meant cropping a crop, losing a
       little more each time. The uncropped master is kept instead and the
       frame is cut from it on every change, so the three sliders are lossless
       against the upload however often they are moved.

       900 and 0.78 put a typical portrait at 90-140KB against the 480px
       crop's 30-60. That is the cost, it is paid once per document, and it
       buys a control that would otherwise have to lie about what it does. */
    const PHOTO_MASTER_EDGE = 900;
    const PHOTO_MASTER_QUALITY = 0.78;

    /* Framing, in the vocabulary js/poster.js already uses for exactly this:
       a zoom of 1 or more, and x and y as units of the slack in [-1, 1] so
       0 is centred and the ends are flush. Named the same way on purpose --
       a visitor who has framed a photograph on a poster has met this idea.

       Not shared with that file. The two editors are separate pages loading
       different scripts, and moving eight lines of arithmetic into js/app.js
       would mean touching the poster's photo handling inside a change to the
       resume's. Worth doing; not worth doing here. */
    function defaultView() {
        return { zoom: 1, x: 0, y: 0 };
    }

    function clampUnit(n) {
        return Math.min(1, Math.max(-1, Number(n) || 0));
    }

    /* The source rectangle a frame of `ratio` takes out of `img`. */
    function photoFrame(img, ratio, view) {
        const v = view || defaultView();
        const sw0 = img.naturalWidth || img.width;
        const sh0 = img.naturalHeight || img.height;
        const zoom = Math.max(1, Number(v.zoom) || 1);

        /* The biggest box of the target ratio that fits, then divided by the
           zoom: zooming IN takes a smaller piece of the source. */
        let cw = sw0;
        let ch = Math.round(sw0 / ratio);
        if (ch > sh0) {
            ch = sh0;
            cw = Math.round(sh0 * ratio);
        }
        cw = Math.max(1, Math.round(cw / zoom));
        ch = Math.max(1, Math.round(ch / zoom));

        const slackX = (sw0 - cw) / 2;
        const slackY = (sh0 - ch) / 2;
        return {
            sx: Math.round(slackX + clampUnit(v.x) * slackX),
            sy: Math.round(slackY + clampUnit(v.y) * slackY),
            sw: cw, sh: ch,
            /* Whether either slider has anywhere to go, which is what decides
               if they are offered as live controls or as disabled ones. */
            slackX: slackX, slackY: slackY
        };
    }

    /* Downscale in halving steps.

       The halving matters. Every browser's one-shot drawImage undersamples
       heavily on a large reduction -- a 4000px phone photograph drawn
       straight to 480px samples a fraction of the pixels it skips, which
       reads as aliasing on hair and on the edge of a collar. Halving
       repeatedly averages the pixels being discarded. Same technique, and the
       same reason, as scaleTo() in js/admin-image.js. */
    function halveTo(canvas, targetW, targetH) {
        let current = canvas;
        while (current.width > targetW * 2) {
            const next = canvasOf(Math.max(targetW, Math.round(current.width / 2)),
                                  Math.max(targetH, Math.round(current.height / 2)));
            next.getContext("2d").drawImage(current, 0, 0, next.width, next.height);
            current = next;
        }
        const out = canvasOf(targetW, targetH);
        out.getContext("2d").drawImage(current, 0, 0, targetW, targetH);
        return out;
    }

    /* The whole photograph, downscaled, uncropped. What gets stored. */
    function toMaster(img) {
        const sw = img.naturalWidth || img.width;
        const sh = img.naturalHeight || img.height;
        if (!sw || !sh) { return ""; }
        const scale = Math.min(1, PHOTO_MASTER_EDGE / Math.max(sw, sh));
        const targetW = Math.max(1, Math.round(sw * scale));
        const targetH = Math.max(1, Math.round(sh * scale));
        const first = canvasOf(sw, sh);
        first.getContext("2d").drawImage(img, 0, 0);
        return halveTo(first, targetW, targetH)
            .toDataURL("image/jpeg", PHOTO_MASTER_QUALITY);
    }

    /* The frame, cut from the master, at the size the sheet draws.

       JPEG, always: the engine's guard accepts PNG too, but a photograph has
       no transparency to protect and a PNG of one is roughly ten times the
       size -- straight out of the localStorage budget. */
    function toFrame(img, view) {
        const ratio = photoRatio();
        const f = photoFrame(img, ratio, view);
        if (!f.sw || !f.sh) { return ""; }
        const targetW = Math.min(PHOTO_W, f.sw);
        const targetH = Math.max(1, Math.round(targetW / ratio));

        /* First pass takes the crop out at its own size; the halving loop
           then works on a plain canvas, so the source rectangle is applied
           once and cannot compound. */
        const cut = canvasOf(f.sw, f.sh);
        cut.getContext("2d").drawImage(img, f.sx, f.sy, f.sw, f.sh, 0, 0, f.sw, f.sh);
        return halveTo(cut, targetW, targetH).toDataURL("image/jpeg", PHOTO_QUALITY);
    }

    /* The form's own copy of the photograph, and the Remove button that goes
       with it. Hidden entirely when there is none, so the control reads as
       "no photo yet" rather than as a broken image. */
    function syncPhotoControls() {
        if (photoThumb) {
            /* Assigning src, never markup: the value is a data URI this file
               produced from a canvas, and it is re-validated on the way out
               of storage besides.

               REMOVED rather than set to "" when there is none. An empty src
               resolves against the document, so the browser re-requests
               resume.html, fails to decode it as an image and paints the alt
               text -- inside an element that is hidden anyway, for a request
               that serves nothing. */
            if (currentPhoto) {
                photoThumb.src = currentPhoto;
            } else {
                photoThumb.removeAttribute("src");
            }
        }
        if (photoPreview) {
            photoPreview.hidden = !currentPhoto;
        }
        if (photoFrameBox) {
            photoFrameBox.hidden = !currentPhoto;
        }
        if (!masterImg) { return; }

        /* The sliders are written back from the view rather than left where
           the visitor dragged them, so Reset and a fresh upload both move
           them, and a reload restores the position the sheet is showing. */
        if (zoomInput) { zoomInput.value = String(Math.round(photoView.zoom * 100)); }
        if (xInput) { xInput.value = String(Math.round(photoView.x * 100)); }
        if (yInput) { yInput.value = String(Math.round(photoView.y * 100)); }

        /* At zoom 1 one axis has no slack at all -- the frame already spans
           the whole of it -- so its slider would move and change nothing.
           Disabled rather than hidden: a control that vanishes and returns as
           the zoom passes 1 is worse than one that is visibly not available
           yet. */
        const f = photoFrame(masterImg, photoRatio(), photoView);
        if (xInput) { xInput.disabled = f.slackX < 1; }
        if (yInput) { yInput.disabled = f.slackY < 1; }
    }

    /* Writes the photograph and CHECKS that the write happened.

       TB.storageSet cannot report a quota failure -- see PHOTO_KEY above --
       so the value is read back. Silence would be the worst outcome here:
       the sheet would show the photograph, the visitor would close the tab,
       and it would be gone with no explanation. */
    /* What goes under PHOTO_KEY: the master AND its framing, because a frame
       without the picture it was cut from is meaningless and the two must not
       be able to get out of step.

       An older document holds a bare STRING there -- the finished crop, from
       before framing existed. It is read as a master with a neutral view,
       which reproduces exactly what that document showed, because the stored
       crop is already at the frame's ratio. Zooming into it then works and
       costs a little sharpness, which is the honest outcome for a picture
       whose original this editor never kept. */
    function readStoredPhoto() {
        const raw = TB.storageGet(PHOTO_KEY);
        if (typeof raw === "string") {
            return { src: raw, zoom: 1, x: 0, y: 0 };
        }
        if (raw && typeof raw === "object" && typeof raw.src === "string") {
            return { src: raw.src, zoom: Math.max(1, Number(raw.zoom) || 1),
                x: clampUnit(raw.x), y: clampUnit(raw.y) };
        }
        return { src: "", zoom: 1, x: 0, y: 0 };
    }

    function storePhoto() {
        if (!photoMaster) {
            TB.storageSet(PHOTO_KEY, "");
            return true;
        }
        const record = { src: photoMaster, zoom: photoView.zoom,
            x: photoView.x, y: photoView.y };
        TB.storageSet(PHOTO_KEY, record);
        const back = TB.storageGet(PHOTO_KEY);
        if (back && back.src === photoMaster) {
            return true;
        }
        /* setItem threw, so the PREVIOUS photograph is still under this key
           and would come back on the next load -- which would make the
           message this returns false to say the opposite of what happens.
           Clearing it costs a photograph that was saved and makes the report
           true, and a small value replacing a large one is the write most
           likely to succeed against a full quota. */
        TB.storageSet(PHOTO_KEY, "");
        return false;
    }

    /* Re-cuts the frame, saves, and redraws. The one path every change to
       the photograph goes through -- upload, replace, a slider, Reset and
       Remove -- so none of them can save without redrawing or redraw without
       saving. */
    function applyPhoto() {
        currentPhoto = (masterImg && photoMaster) ? toFrame(masterImg, photoView) : "";
        syncPhotoControls();
        /* Any successful set clears a stale message. The upload handler
           clears it too, on the way in, but this is the path "Start blank"
           and Remove take -- and a quota warning left standing over a photo
           that has since been removed describes nothing that is true. */
        if (photoError) {
            photoError.textContent = "";
        }
        if (!storePhoto() && photoError) {
            photoError.textContent = "This photo is on the sheet and will export, " +
                "but there was not enough room in this browser's storage to keep it " +
                "for next time. Try a smaller image.";
        }
        persistAndRender();
    }

    /* Takes a master and a framing, decodes, then applies. Used by the
       upload, by a restore from storage, and by Remove with an empty src. */
    function loadPhoto(src, view, done) {
        photoView = view ? { zoom: Math.max(1, Number(view.zoom) || 1),
            x: clampUnit(view.x), y: clampUnit(view.y) } : defaultView();
        if (!src) {
            photoMaster = "";
            masterImg = null;
            applyPhoto();
            if (done) { done(true); }
            return;
        }
        const img = new Image();
        img.addEventListener("load", () => {
            photoMaster = src;
            masterImg = img;
            applyPhoto();
            if (done) { done(true); }
        });
        img.addEventListener("error", () => {
            photoMaster = "";
            masterImg = null;
            applyPhoto();
            if (done) { done(false); }
        });
        img.src = src;
    }

    function clearPhoto() {
        loadPhoto("", defaultView());
    }

    function bindPhotoUpload() {
        if (!photoInput) {
            return;
        }

        photoInput.addEventListener("change", () => {
            if (photoError) {
                photoError.textContent = "";
            }
            const file = photoInput.files && photoInput.files[0];
            if (!file) {
                return;
            }
            /* Explicit mime-type parse, terminating immediately on anything
               that is not an image -- the file-upload rule in CLAUDE.md, and
               the same check js/poster.js and js/mockup.js make. */
            if (!/^image\//.test(file.type)) {
                if (photoError) {
                    photoError.textContent = "That file is not an image. Please choose a JPG, PNG, or WebP file.";
                }
                photoInput.value = "";
                return;
            }

            const reader = new FileReader();
            reader.addEventListener("load", () => {
                const img = new Image();
                img.addEventListener("load", () => {
                    const master = toMaster(img);
                    if (!master) {
                        if (photoError) {
                            photoError.textContent = "That image could not be read. Please try a different file.";
                        }
                        photoInput.value = "";
                        return;
                    }
                    /* Cleared so re-picking the same file still fires change,
                        which is how a visitor retries after an error. */
                    photoInput.value = "";
                    /* A fresh upload starts centred and unzoomed, deliberately:
                       carrying the previous photograph's framing onto a new one
                       frames a face nobody has looked at yet. Replacing IS this
                       path -- there is no separate Replace control, because
                       choosing another file is the same gesture. */
                    loadPhoto(master, defaultView());
                });
                img.addEventListener("error", () => {
                    if (photoError) {
                        photoError.textContent = "That image could not be decoded. Please try a different file.";
                    }
                    photoInput.value = "";
                });
                img.src = reader.result;
            });
            reader.addEventListener("error", () => {
                if (photoError) {
                    photoError.textContent = "That file could not be read. Please try a different file.";
                }
                photoInput.value = "";
            });
            reader.readAsDataURL(file);
        });

        if (photoRemove) {
            photoRemove.addEventListener("click", () => {
                clearPhoto();
                if (photoInput) { photoInput.focus(); }
            });
        }

        /* The three framing sliders. All of them recut from the master, so
           dragging one back and forth is lossless however long it goes on.

           `input` rather than `change`, because a framing control that only
           updates when the mouse is released is a control you cannot aim. */
        [[zoomInput, "zoom", 100], [xInput, "x", 100], [yInput, "y", 100]]
            .forEach(([control, key, divisor]) => {
                if (!control) { return; }
                control.addEventListener("input", () => {
                    if (!masterImg) { return; }
                    const value = Number(control.value) / divisor;
                    photoView[key] = key === "zoom"
                        ? Math.max(1, value)
                        : clampUnit(value);
                    applyPhoto();
                });
            });

        if (photoReset) {
            photoReset.addEventListener("click", () => {
                if (!masterImg) { return; }
                photoView = defaultView();
                applyPhoto();
            });
        }
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
        const ctx = window.TBResume.renderPreview(tpl, state, sheet);
        labelPages();
        warnSideOverflow(ctx);
        return true;
    }

    /* The side column does not paginate.

       That is deliberate in the engine -- a rail carrying contact details and
       skills that split across two pages reads as a rendering fault rather
       than a longer document -- and it was harmless while every two-column
       template put only a handful of lines there. The Peach Portrait CV puts a
       contact block, seven personal-information rows and a list of referees in
       it, so a visitor can now fill it past the foot of the sheet, and what
       runs over is simply not drawn.

       The engine has always measured this and set ctx.overflow. Nothing ever
       read it: a third referee vanished with no message anywhere, in the
       preview and in the exported PDF alike. This is the thing reading it.

       Editor chrome, added after the paint like the page labels above, so it
       cannot reach the display list and therefore cannot reach the download.
       renderPreview() calls replaceChildren() first, so it is rebuilt every
       keystroke and disappears the moment the visitor shortens the column. */
    function warnSideOverflow(ctx) {
        const over = ctx && ctx.overflow;
        if (!over || !over.sidebar) {
            return;
        }
        const note = document.createElement("p");
        note.className = "sheet-warning";
        note.setAttribute("role", "status");
        /* Two messages, because the two cases are genuinely different. Past
           the column's boundary the last lines are crowding the foot of the
           page; past the paper they are not on it at all. */
        note.textContent = over.sidebarOffPage
            ? "The side column has run off the bottom of the page. Anything below the edge will not be printed or exported — shorten an entry, or remove one."
            : "The side column has reached the bottom of the page. Add any more and it will start to fall off the sheet.";
        sheet.insertBefore(note, sheet.firstChild);
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
            /* The prompt where a photograph would be opens the same file input
               the Profile Photo control does -- the same element, so the crop,
               the validation and the storage path are one route with two ways
               in. It is checked BEFORE the editable text below because it is
               its own thing, and closing an open editor first is what makes a
               click on it behave like a click anywhere else on the sheet.

               A file dialog needs a user activation, which mousedown carries. */
            const slot = event.target.closest("[data-photo-slot]");
            if (slot) {
                event.preventDefault();
                closeEditor(true);
                if (photoInput) {
                    photoInput.click();
                }
                return;
            }
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

        fillForm(state);

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

        /* Restored from its own key, and validated on the way out: a value
           that is not a base64 PNG or JPEG is dropped rather than handed to
           the engine, the thumbnail and the state object.

           ONLY ALONGSIDE A SAVED DOCUMENT. A photograph belongs to a
           document, and separate keys make it possible for one to outlive the
           other -- clear the record alone and a stored photograph would be
           restored onto the first-run SAMPLE content, which is somebody's
           face on a document that is not theirs. Nothing is lost by the gate:
           uploading writes the document record too, so a photograph with no
           record is an orphan by definition. It is cleared rather than left,
           or it would be waiting again on the next load. */
        const savedPhoto = readStoredPhoto();
        const keepPhoto = hasSaved && validPhoto(savedPhoto.src);
        if (!keepPhoto && savedPhoto.src) {
            TB.storageSet(PHOTO_KEY, "");
        }
        bindPhotoUpload();
        if (keepPhoto) {
            /* ASYNCHRONOUS, and everything below runs without waiting for it.

               Decoding the master is what makes the framing sliders live, and
               it cannot be done synchronously. The first render therefore
               happens with no photograph and a second one follows when the
               decode lands -- which is the same shape the page already had,
               since an <img> never painted on the first frame either. What
               matters is that nothing in between can save: loadPhoto only
               reaches applyPhoto once it has a decoded image or has given up,
               and giving up writes an empty key rather than the old one. */
            loadPhoto(savedPhoto.src, savedPhoto);
        } else {
            syncPhotoControls();
        }

        /* The opening notice. A first visit gets the sample and the offer to
           empty it; a returning visitor whose saved document is empty gets the
           offer to fill it, which is what somebody who pressed "Start blank"
           and then reloaded is looking at. Anyone with work in progress gets
           neither. */
        sampleShown = !hasSaved;
        const opening = collectState();
        syncNotice(opening);

        renderPreview(opening);
    }

    init();
})();
