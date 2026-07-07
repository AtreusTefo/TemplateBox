/* ==========================================================================
   TemplateBox - CV/Resume Builder Core Logic
   Responsibilities: real-time localStorage binding, repeating experience and
   education entries, CSS-variable accent theming, safe textContent preview
   rendering, and client-side PDF compilation via html2pdf.js.
   Depends on: js/app.js (TB.sanitize, TB.desanitize, TB.storageGet/Set)
   ========================================================================== */

"use strict";

(() => {

    const STORAGE_KEY = "tb_resume_v1";

    const DEFAULT_STATE = {
        accent: "#1A1A1A",
        fields: {
            name: "",
            title: "",
            email: "",
            phone: "",
            location: "",
            summary: "",
            skills: ""
        },
        experience: [{ role: "", company: "", dates: "", description: "" }],
        education: [{ degree: "", school: "", dates: "" }]
    };

    const form = document.getElementById("resume-form");
    const sheet = document.getElementById("resume-sheet");
    if (!form || !sheet) {
        return;
    }

    const experienceList = document.getElementById("experience-list");
    const educationList = document.getElementById("education-list");
    const tplExperience = document.getElementById("tpl-experience");
    const tplEducation = document.getElementById("tpl-education");
    const swatchRow = document.getElementById("swatch-row");

    /* ----------------------------------------------------------------------
       State collection: sweep the live form, scrub every string through the
       sanitization firewall, then persist the snapshot to localStorage.
       ---------------------------------------------------------------------- */

    function collectEntries(listEl, fieldNames) {
        return Array.from(listEl.querySelectorAll("[data-entry]")).map((row) => {
            const entry = {};
            fieldNames.forEach((name) => {
                const input = row.querySelector('[data-entry-field="' + name + '"]');
                entry[name] = TB.sanitize(input ? input.value : "");
            });
            return entry;
        });
    }

    function collectState() {
        const state = {
            accent: currentAccent,
            fields: {},
            experience: collectEntries(experienceList, ["role", "company", "dates", "description"]),
            education: collectEntries(educationList, ["degree", "school", "dates"])
        };
        form.querySelectorAll("[data-bind]").forEach((input) => {
            state.fields[input.getAttribute("data-bind")] = TB.sanitize(input.value);
        });
        return state;
    }

    function persistAndRender() {
        const state = collectState();
        TB.storageSet(STORAGE_KEY, state);
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
        listEl.appendChild(row);
    }

    /* ----------------------------------------------------------------------
       Preview rendering. Every dynamic string reaches the DOM exclusively
       through textContent, never innerHTML, closing the DOM XSS vector.
       ---------------------------------------------------------------------- */

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) {
            node.className = className;
        }
        if (text !== undefined) {
            node.textContent = text;
        }
        return node;
    }

    function renderPreview(state) {
        const f = state.fields;
        const d = TB.desanitize;

        sheet.replaceChildren();
        sheet.style.setProperty("--accent", state.accent);

        sheet.appendChild(el("p", "rs-name", d(f.name) || "Your Name"));
        if (f.title) {
            sheet.appendChild(el("p", "rs-title", d(f.title)));
        }

        const contactParts = [f.email, f.phone, f.location]
            .filter(Boolean)
            .map(d);
        if (contactParts.length) {
            sheet.appendChild(el("p", "rs-contact", contactParts.join("  |  ")));
        }

        if (f.summary) {
            const section = el("div", "rs-section");
            section.appendChild(el("p", "rs-heading", "Summary"));
            section.appendChild(el("p", "", d(f.summary)));
            sheet.appendChild(section);
        }

        const experience = state.experience.filter((e) => e.role || e.company || e.description);
        if (experience.length) {
            const section = el("div", "rs-section");
            section.appendChild(el("p", "rs-heading", "Work Experience"));
            experience.forEach((exp) => {
                const entry = el("div", "rs-entry");
                entry.appendChild(el("p", "rs-entry-head",
                    [exp.role, exp.company].filter(Boolean).map(d).join(" - ")));
                if (exp.dates) {
                    entry.appendChild(el("p", "rs-entry-meta", d(exp.dates)));
                }
                if (exp.description) {
                    entry.appendChild(el("p", "", d(exp.description)));
                }
                section.appendChild(entry);
            });
            sheet.appendChild(section);
        }

        const education = state.education.filter((e) => e.degree || e.school);
        if (education.length) {
            const section = el("div", "rs-section");
            section.appendChild(el("p", "rs-heading", "Education"));
            education.forEach((edu) => {
                const entry = el("div", "rs-entry");
                entry.appendChild(el("p", "rs-entry-head",
                    [edu.degree, edu.school].filter(Boolean).map(d).join(" - ")));
                if (edu.dates) {
                    entry.appendChild(el("p", "rs-entry-meta", d(edu.dates)));
                }
                section.appendChild(entry);
            });
            sheet.appendChild(section);
        }

        const skills = d(f.skills).split(",").map((s) => s.trim()).filter(Boolean);
        if (skills.length) {
            const section = el("div", "rs-section");
            section.appendChild(el("p", "rs-heading", "Skills"));
            const list = document.createElement("ul");
            skills.forEach((skill) => list.appendChild(el("li", "", skill)));
            section.appendChild(list);
            sheet.appendChild(section);
        }
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

    /* ----------------------------------------------------------------------
       PDF compilation via the jsPDF native text API (CDN in resume.html).
       Every string is written as true vector glyphs with doc.text(), so the
       exported document is fully selectable, copyable, and ATS-parseable.
       This replaces html2pdf.js, which rasterizes pages through html2canvas;
       see docs/error-fixes/RESUME_PDF_RASTERIZED_TEXT_FIX.md for details.
       ---------------------------------------------------------------------- */

    const PAGE = { width: 210, margin: 18, bottom: 279 };
    const INK_CHARCOAL = [26, 26, 26];
    const INK_GRAY = [107, 107, 102];

    function hexToRgb(hex) {
        return [
            parseInt(hex.slice(1, 3), 16),
            parseInt(hex.slice(3, 5), 16),
            parseInt(hex.slice(5, 7), 16)
        ];
    }

    function buildPdf(state) {
        const doc = new window.jspdf.jsPDF({ unit: "mm", format: "a4" });
        const d = TB.desanitize;
        const f = state.fields;
        const accent = hexToRgb(state.accent);
        const contentWidth = PAGE.width - PAGE.margin * 2;
        let y = PAGE.margin + 4;

        function ensureRoom(needed) {
            if (y + needed > PAGE.bottom) {
                doc.addPage();
                y = PAGE.margin;
            }
        }

        /* Word-wraps a block of text and advances the cursor, breaking to a
           new page whenever the next line would overflow the bottom margin. */
        function writeBlock(text, font, style, size, color, gapAfter) {
            doc.setFont(font, style);
            doc.setFontSize(size);
            doc.setTextColor(color[0], color[1], color[2]);
            const lineHeight = size * 0.3528 * 1.3;
            doc.splitTextToSize(text, contentWidth).forEach((line) => {
                ensureRoom(lineHeight);
                doc.text(line, PAGE.margin, y);
                y += lineHeight;
            });
            y += gapAfter || 0;
        }

        function writeHeading(label) {
            ensureRoom(14);
            y += 4;
            doc.setFont("times", "bold");
            doc.setFontSize(12);
            doc.setTextColor(accent[0], accent[1], accent[2]);
            doc.text(label.toUpperCase(), PAGE.margin, y);
            y += 1.5;
            doc.setDrawColor(accent[0], accent[1], accent[2]);
            doc.setLineWidth(0.5);
            doc.line(PAGE.margin, y, PAGE.width - PAGE.margin, y);
            y += 5.5;
        }

        writeBlock(d(f.name) || "Your Name", "times", "bold", 24, accent, 1.5);
        if (f.title) {
            writeBlock(d(f.title), "helvetica", "bold", 11, INK_CHARCOAL, 1);
        }
        const contact = [f.email, f.phone, f.location].filter(Boolean).map(d).join("  |  ");
        if (contact) {
            writeBlock(contact, "helvetica", "normal", 9, INK_GRAY, 1);
        }

        if (f.summary) {
            writeHeading("Summary");
            writeBlock(d(f.summary), "helvetica", "normal", 9.5, INK_CHARCOAL);
        }

        const experience = state.experience.filter((e) => e.role || e.company || e.description);
        if (experience.length) {
            writeHeading("Work Experience");
            experience.forEach((exp) => {
                const head = [exp.role, exp.company].filter(Boolean).map(d).join(" - ");
                if (head) {
                    writeBlock(head, "helvetica", "bold", 10.5, INK_CHARCOAL, 0.5);
                }
                if (exp.dates) {
                    writeBlock(d(exp.dates), "helvetica", "normal", 8.5, INK_GRAY, 0.5);
                }
                if (exp.description) {
                    writeBlock(d(exp.description), "helvetica", "normal", 9.5, INK_CHARCOAL, 3);
                } else {
                    y += 3;
                }
            });
        }

        const education = state.education.filter((e) => e.degree || e.school);
        if (education.length) {
            writeHeading("Education");
            education.forEach((edu) => {
                const head = [edu.degree, edu.school].filter(Boolean).map(d).join(" - ");
                if (head) {
                    writeBlock(head, "helvetica", "bold", 10.5, INK_CHARCOAL, 0.5);
                }
                if (edu.dates) {
                    writeBlock(d(edu.dates), "helvetica", "normal", 8.5, INK_GRAY, 2);
                } else {
                    y += 2;
                }
            });
        }

        const skills = d(f.skills).split(",").map((s) => s.trim()).filter(Boolean);
        if (skills.length) {
            writeHeading("Skills");
            skills.forEach((skill) => {
                writeBlock("•  " + skill, "helvetica", "normal", 9.5, INK_CHARCOAL, 0.5);
            });
        }

        return doc;
    }

    document.getElementById("download-pdf").addEventListener("click", () => {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            window.alert("The PDF engine is still loading. Please try again in a moment.");
            return;
        }
        const state = collectState();
        const safeName = TB.desanitize(state.fields.name)
            .trim()
            .replace(/[^A-Za-z0-9 _-]/g, "")
            .replace(/\s+/g, "-")
            .toLowerCase() || "resume";

        buildPdf(state).save(safeName + "-templatebox.pdf");
    });

    /* ----------------------------------------------------------------------
       Initialization: sweep localStorage, hydrate the form, first render.
       ---------------------------------------------------------------------- */

    function init() {
        const saved = TB.storageGet(STORAGE_KEY);
        const state = saved && saved.fields ? saved : DEFAULT_STATE;

        applyAccent(state.accent);

        form.querySelectorAll("[data-bind]").forEach((input) => {
            input.value = TB.desanitize(state.fields[input.getAttribute("data-bind")] || "");
        });

        const experience = state.experience && state.experience.length
            ? state.experience
            : DEFAULT_STATE.experience;
        const education = state.education && state.education.length
            ? state.education
            : DEFAULT_STATE.education;

        experience.forEach((entry) => addEntryRow(experienceList, tplExperience, entry));
        education.forEach((entry) => addEntryRow(educationList, tplEducation, entry));

        /* Real-time binding: one delegated listener covers every current and
           future input inside the form, including cloned entry rows. */
        form.addEventListener("input", persistAndRender);

        document.getElementById("add-experience").addEventListener("click", () => {
            addEntryRow(experienceList, tplExperience);
            persistAndRender();
        });
        document.getElementById("add-education").addEventListener("click", () => {
            addEntryRow(educationList, tplEducation);
            persistAndRender();
        });

        renderPreview(collectState());
    }

    init();
})();
