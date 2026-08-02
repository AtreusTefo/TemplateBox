# Resume Template Descriptor and Its Two Renderers (Design Sketch)

Date: August 2, 2026
Status: **Sketch only. Nothing in `site/` implements this.** Written to make the shape concrete before deciding whether to build it. No file under `site/` was modified.

## The Problem This Solves

`site/js/resume.js` contains two functions that walk the same state object in the same order and produce the same document in two mediums:

| | `renderPreview(state)` | `buildPdf(state)` |
|---|---|---|
| Output | DOM nodes via `textContent` | jsPDF calls at mm coordinates |
| Name | `el("p", "rs-name", ...)` | `writeBlock(..., "times", "bold", 24, accent, 1.5)` |
| Section heading | `el("p", "rs-heading", label)` | `writeHeading(label)` plus an accent rule |
| Section order | Hardcoded in function body | Hardcoded in function body, again |

Both hardcode the same four decisions independently: which sections exist, in what order, under what labels, and from which fields. Adding a second resume style today means writing a third and fourth renderer. Adding fifteen means thirty.

This is the same class of duplication that produced `EXPORTED_POST_PAGE_FOOTER_DRIFT.md` and `STATIC_POST_PAGES_SERVED_NO_ADS.md`: one concept, two hand-maintained expressions, no mechanism forcing agreement.

The fix is the pattern `site/js/mockup-templates.js` already established three days ago — a data-only registry consumed by a generic renderer — extended to a medium that has two renderers instead of one.

## Design Principle

The descriptor owns everything that **must not differ** between preview and PDF: section order, labels, field mapping, font family class, type size, weight, and colour role.

Each renderer owns only what is **medium-specific**: DOM structure and CSS classes on one side, page geometry, word wrapping and page breaks on the other.

Under this split the two renderers cannot disagree about content at all, and can only disagree about visual detail to the extent the engine translates shared tokens differently.

## Part 1: The Descriptor

```js
/* site/js/resume-templates.js  (proposed)
   THE data source for resume template variants. A template is data.
   Adding one requires no renderer changes. */

"use strict";

window.TB_RESUME_TEMPLATES = [
    {
        id: "executive",
        title: "Executive Resume",
        thumb: "assets/thumbnails/resumes/executive-thumb.jpg",

        /* Page geometry in mm. Omit to inherit the engine defaults.
           A denser template narrows the margin; nothing else changes. */
        page: { margin: 18, bottom: 279 },

        /* Typography, declared once and read by BOTH renderers.
           size is in POINTS, which jsPDF takes natively and CSS supports
           as pt, so one number drives both mediums with no conversion
           table to keep in sync.

           family is a token, not a font name, because the two mediums
           cannot load the same fonts. See "Honest Limits" below. */
        type: {
            name:      { family: "serif", weight: "bold",   size: 24,  color: "accent", gapAfter: 1.5 },
            title:     { family: "sans",  weight: "bold",   size: 11,  color: "ink",    gapAfter: 1 },
            contact:   { family: "sans",  weight: "normal", size: 9,   color: "muted",  gapAfter: 1 },
            heading:   { family: "serif", weight: "bold",   size: 12,  color: "accent", rule: true, uppercase: true },
            entryHead: { family: "sans",  weight: "bold",   size: 10.5, color: "ink",   gapAfter: 0.5 },
            entryMeta: { family: "sans",  weight: "normal", size: 8.5, color: "muted",  gapAfter: 0.5 },
            body:      { family: "sans",  weight: "normal", size: 9.5, color: "ink",    gapAfter: 3 }
        },

        /* Document structure. Order here IS render order, in both
           mediums, because both renderers iterate this one array. */
        blocks: [
            { kind: "line", type: "name",    fields: ["name"], fallback: "Your Name" },
            { kind: "line", type: "title",   fields: ["title"] },
            { kind: "line", type: "contact", fields: ["email", "phone", "location"], separator: "  |  " },

            { kind: "section", label: "Summary",
              body: { kind: "paragraph", field: "summary" } },

            { kind: "section", label: "Work Experience",
              body: { kind: "entries", source: "experience",
                      head: { fields: ["role", "company"], separator: " - " },
                      meta: { fields: ["dates"] },
                      text: { field: "description" } } },

            { kind: "section", label: "Education",
              body: { kind: "entries", source: "education",
                      head: { fields: ["degree", "school"], separator: " - " },
                      meta: { fields: ["dates"] } } },

            { kind: "section", label: "Skills",
              body: { kind: "list", field: "skills", split: ",", bullet: "•  " } }
        ]
    }
];
```

That single object reproduces today's resume exactly. A "Minimalist ATS" variant is the same object with `heading.rule: false`, `heading.uppercase: false`, both families set to `sans`, and the Summary block moved or dropped. No code.

## Part 2: The Shared Resolution Layer

Both renderers need the same answers to "what is `family: serif`" and "what is `color: accent`". That belongs in one place, not two.

```js
/* Shared token resolution. The only place a token becomes a concrete
   value, so preview and PDF cannot disagree about what a token means. */
const FAMILY = {
    serif: { css: "'Playfair Display', Georgia, serif", pdf: "times" },
    sans:  { css: "'Inter', system-ui, sans-serif",     pdf: "helvetica" },
    mono:  { css: "ui-monospace, monospace",            pdf: "courier" }
};

const INK = { charcoal: [26, 26, 26], gray: [107, 107, 102] };

/* accent is per-document (the swatch row), so it is resolved at render
   time from state, not baked into the descriptor. */
function resolveColor(role, state) {
    if (role === "accent") return hexToRgb(state.accent);
    if (role === "muted")  return INK.gray;
    return INK.charcoal;
}

const PT_TO_MM = 0.3528;

/* Joins the fields a block names, desanitizing on the way out. Used
   identically by both renderers, so "which fields, in what order,
   joined by what" has exactly one implementation. */
function joinFields(spec, source) {
    return (spec.fields || [])
        .map((name) => TB.desanitize(String(source[name] || "")).trim())
        .filter(Boolean)
        .join(spec.separator || " ");
}
```

## Part 3: Renderer A, the Live Preview

Structurally identical to today's output, so `css/style.css` needs no changes: the same `.rs-*` classes are emitted. Typography arrives as CSS custom properties derived from the descriptor, so the stylesheet keeps owning spacing and layout while the descriptor owns type.

```js
function renderPreview(template, state, sheet) {
    const t = template.type;
    sheet.replaceChildren();
    sheet.style.setProperty("--accent", state.accent);

    /* Descriptor-driven type, exposed to CSS. style.css reads these
       instead of hardcoding sizes, so one descriptor drives both. */
    Object.keys(t).forEach((role) => {
        const spec = t[role];
        sheet.style.setProperty("--" + role + "-size", spec.size + "pt");
        sheet.style.setProperty("--" + role + "-family", FAMILY[spec.family].css);
        sheet.style.setProperty("--" + role + "-weight", spec.weight === "bold" ? "600" : "400");
    });

    template.blocks.forEach((block) => {
        if (block.kind === "line") {
            const text = joinFields(block, state.fields) || block.fallback || "";
            if (text) sheet.appendChild(el("p", "rs-" + block.type, text));
            return;
        }

        const rendered = renderSectionBody(block.body, state);
        if (!rendered.length) return;   /* empty sections never appear */

        const section = el("div", "rs-section");
        section.appendChild(el("p", "rs-heading",
            t.heading.uppercase ? block.label.toUpperCase() : block.label));
        rendered.forEach((node) => section.appendChild(node));
        sheet.appendChild(section);
    });
}

function renderSectionBody(body, state) {
    if (body.kind === "paragraph") {
        const text = TB.desanitize(String(state.fields[body.field] || ""));
        return text ? [el("p", "", text)] : [];
    }

    if (body.kind === "entries") {
        return (state[body.source] || [])
            .filter((row) => joinFields(body.head, row) || (body.text && row[body.text.field]))
            .map((row) => {
                const entry = el("div", "rs-entry");
                const head = joinFields(body.head, row);
                if (head) entry.appendChild(el("p", "rs-entry-head", head));
                const meta = joinFields(body.meta || {}, row);
                if (meta) entry.appendChild(el("p", "rs-entry-meta", meta));
                if (body.text && row[body.text.field]) {
                    entry.appendChild(el("p", "", TB.desanitize(row[body.text.field])));
                }
                return entry;
            });
    }

    if (body.kind === "list") {
        const items = TB.desanitize(String(state.fields[body.field] || ""))
            .split(body.split).map((s) => s.trim()).filter(Boolean);
        if (!items.length) return [];
        const list = document.createElement("ul");
        items.forEach((item) => list.appendChild(el("li", "", item)));
        return [list];
    }

    return [];
}
```

## Part 4: Renderer B, the jsPDF Writer

The existing layout primitives (`writeBlock`, `writeHeading`, `ensureRoom`) already are the engine. They stop being called in a hardcoded sequence and start being driven by the same `blocks` array.

```js
function buildPdf(template, state) {
    const doc = new window.jspdf.jsPDF({ unit: "mm", format: "a4" });
    const t = template.type;
    const page = Object.assign({ width: 210, margin: 18, bottom: 279 }, template.page);
    const contentWidth = page.width - page.margin * 2;
    let y = page.margin + 4;

    function ensureRoom(needed) {
        if (y + needed > page.bottom) { doc.addPage(); y = page.margin; }
    }

    /* One writer for every text run. Takes a type role from the
       descriptor rather than seven positional arguments, so a template
       changes typography by changing data. */
    function write(text, role, gapOverride) {
        const spec = t[role];
        const color = resolveColor(spec.color, state);
        doc.setFont(FAMILY[spec.family].pdf, spec.weight);
        doc.setFontSize(spec.size);
        doc.setTextColor(color[0], color[1], color[2]);

        const lineHeight = spec.size * PT_TO_MM * 1.3;
        doc.splitTextToSize(text, contentWidth).forEach((line) => {
            ensureRoom(lineHeight);
            doc.text(line, page.margin, y);
            y += lineHeight;
        });
        y += gapOverride !== undefined ? gapOverride : (spec.gapAfter || 0);
    }

    function writeHeading(label) {
        const spec = t.heading;
        ensureRoom(14);
        y += 4;
        write(spec.uppercase ? label.toUpperCase() : label, "heading", 0);
        if (spec.rule) {
            const accent = resolveColor(spec.color, state);
            y += 1.5;
            doc.setDrawColor(accent[0], accent[1], accent[2]);
            doc.setLineWidth(0.5);
            doc.line(page.margin, y, page.width - page.margin, y);
        }
        y += 5.5;
    }

    /* Same array, same order, same emptiness rules as the preview. */
    template.blocks.forEach((block) => {
        if (block.kind === "line") {
            const text = joinFields(block, state.fields) || block.fallback || "";
            if (text) write(text, block.type);
            return;
        }
        if (!sectionHasContent(block.body, state)) return;
        writeHeading(block.label);
        writeSectionBody(block.body, state, write);
    });

    return doc;
}
```

`sectionHasContent()` is deliberately shared with the preview renderer. "Is this section empty" answered in two places is precisely the drift this design exists to prevent.

## What This Buys

| Today | With the descriptor |
|---|---|
| New template = 2 hand-written renderers | New template = 1 data object |
| Section order defined twice | Once |
| Labels defined twice | Once |
| Type sizes defined twice | Once |
| Preview/PDF drift possible and silent | Structurally impossible for content |
| An LLM must write correct jsPDF coordinate code | An LLM writes a validated data object |

The last row is the answer to the original question about Lovable and Builder. Once a template is data with a documented schema, bulk generation is trivial and needs no external platform — the same way `mockup-templates.js` made photographic mockups cheap to add.

## Honest Limits

**This does not express arbitrary layout.** The block vocabulary is single-column, top-to-bottom. A two-column resume with a sidebar is not a descriptor change — it requires the engine to grow a column concept in both renderers. All three current resume cards are single-column, so this covers today's catalogue and perhaps fifteen to twenty more variants, but it is a variant system, not a design system.

**Font families are constrained to what both mediums have.** jsPDF's standard fonts are Helvetica, Times and Courier. Anything else means embedding a font file, which inflates every export and reopens the WinAnsi encoding problem already documented for `CURRENCIES` in `docs.js`. Hence `serif|sans|mono` tokens rather than font names. The preview can render Playfair Display while the PDF renders Times, which is a visible difference the current code already lives with.

**Preview and PDF still differ in line breaking.** The browser wraps text with its own metrics; `doc.splitTextToSize()` uses jsPDF's. Identical inputs can produce a different number of lines. The descriptor removes structural drift, not typographic drift.

**`style.css` needs a pass.** The `.rs-*` rules currently hardcode sizes that would move into custom properties. Mechanical, but not zero.

## Migration Path

The working editor must not be put at risk. The order matters:

1. **Write the descriptor for the current resume** so it reproduces today's output exactly. One object, no behaviour change.
2. **Build the two generic renderers alongside the existing ones**, not replacing them.
3. **Prove equivalence before deleting anything.** Two checks, both of which this project already knows how to run:
   - Preview: render both ways into detached nodes and compare `outerHTML`. Must be identical.
   - PDF: inspect the output stream for `Tj` text operators and compare extracted strings and coordinates against the current build. The technique is documented in `RESUME_PDF_RASTERIZED_TEXT_FIX.md`.
4. **Only then delete the hand-written renderers** and move `docs.js` and `poster.js` onto the same engine if it proves out.

Step 3 is the whole safety argument. It is the same byte-identical verification used for the footer restructure on July 27, and the reason that change was safe across 22 files.

## Open Questions

- **Does the descriptor own the form, too?** Today `resume.html` hardcodes the input fields. A template that drops the Summary section still shows a Summary textarea. Deriving the form from the descriptor is the logical next step but widens the change considerably; recommend deferring.
- **Where does `accent` live?** Currently per-document via the swatch row. A template could constrain the palette (an ATS template arguably should not offer colour at all). Treated above as runtime state, not descriptor data.
- **Do the three existing catalog cards become three descriptors, or one descriptor plus presets?** They differ only in typography today, which argues for three descriptors and no new concept.