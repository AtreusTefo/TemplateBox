/* ==========================================================================
   TemplateBox - Resume Template Engine
   Renders a descriptor from js/resume-templates.js to BOTH the on-screen
   preview and the exported PDF.

   ARCHITECTURE: one layout pass, two painters.

   The naive design is two renderers that each walk the state and lay it out
   independently. That is exactly the duplication this engine exists to
   remove -- it is how resume.js ended up defining section order, labels and
   type sizes twice, and it is the same defect class as the footer and
   ad-host drift documented in docs/error-fixes/.

   Instead, layout() runs ONCE and produces a flat display list of primitive
   drawing operations with absolute point coordinates. Two painters consume
   that list: paintSvg() for the live preview, paintPdf() for the export.
   Neither painter makes a single layout decision, so the two outputs cannot
   disagree about what is drawn or where.

   Text is measured through jsPDF even when only previewing, so line breaking
   is decided by the engine that will produce the PDF. This closes the last
   gap the earlier design sketch could not: preview and PDF wrap identically
   because they are wrapped by the same measurer.

   UNITS: points throughout, on the 595x842 A4 grid. See the header of
   js/resume-templates.js for the descriptor contract.

   SECURITY: the preview is built with createElementNS + textContent only,
   never innerHTML or string-concatenated markup, matching the rendering rule
   in CLAUDE.md.

   Depends on: jsPDF (window.jspdf), optionally js/app.js for TB.desanitize.
   ========================================================================== */

"use strict";

window.TBResume = (() => {

    const SVG_NS = "http://www.w3.org/2000/svg";

    /* Family tokens resolved once, for both mediums. jsPDF's built-in faces
       are the only ones available without embedding a font file. */
    const FAMILY = {
        sans:  { css: "Arial, Helvetica, sans-serif",      pdf: "helvetica" },
        serif: { css: "'Times New Roman', Times, serif",   pdf: "times" },
        mono:  { css: "'Courier New', Courier, monospace", pdf: "courier" }
    };

    function desanitize(value) {
        if (window.TB && typeof window.TB.desanitize === "function") {
            return window.TB.desanitize(value);
        }
        return String(value === undefined || value === null ? "" : value)
            .replace(/&#39;/g, "'").replace(/&quot;/g, "\"")
            .replace(/&gt;/g, ">").replace(/&lt;/g, "<")
            .replace(/&amp;/g, "&");
    }

    function hexToRgb(hex) {
        return [
            parseInt(hex.slice(1, 3), 16),
            parseInt(hex.slice(3, 5), 16),
            parseInt(hex.slice(5, 7), 16)
        ];
    }

    /* Colour roles never reach a painter as a role: everything in the display
       list is already a hex string. `accent` is per-document runtime state. */
    function colorOf(role, template, state) {
        if (role === "accent") {
            const a = state && state.accent;
            return /^#[0-9A-Fa-f]{6}$/.test(a) ? a : "#1A1A1A";
        }
        const p = template.palette || {};
        return p[role] || role || "#000000";
    }

    /* ----------------------------------------------------------------------
       Data access. `field` reads state.fields unless addressing an entry row,
       `source` reads a top-level array. Missing fields render nothing rather
       than throwing, so a descriptor may reference fields a given saved
       document has never had.
       ---------------------------------------------------------------------- */

    function readField(source, name) {
        if (!source || !name) return "";
        return desanitize(String(source[name] === undefined ? "" : source[name])).trim();
    }

    function joinFields(spec, source) {
        return (spec.fields || [])
            .map((n) => readField(source, n))
            .filter(Boolean)
            .join(spec.separator || " ");
    }

    /* Builds the drawable runs of a mixed-weight line, dropping separators
       that would be left dangling by an empty field. */
    function buildRuns(spec, source, template) {
        const out = [];
        (spec.runs || []).forEach((run) => {
            if (run.literal !== undefined) {
                if (out.length) out.push({ text: run.literal, type: run.type, pending: true });
                return;
            }
            const text = readField(source, run.field);
            if (!text) return;
            /* A pending separator is only kept once real text follows it. */
            out.forEach((r) => { r.pending = false; });
            out.push({ text: text, type: run.type });
        });
        return out.filter((r) => !r.pending);
    }

    function splitList(value, on) {
        return desanitize(String(value || ""))
            .split(on === "\n" ? /\r?\n/ : on)
            .map((s) => s.trim())
            .filter(Boolean);
    }

    /* ----------------------------------------------------------------------
       Emptiness, answered in ONE place. Both the heading and its body consult
       this, so a section can never render a heading over nothing (or hide a
       heading over something) in one medium but not the other.
       ---------------------------------------------------------------------- */
    function sectionHasContent(body, state) {
        if (!body) return false;
        if (body.kind === "lines") return (body.lines || []).length > 0;
        if (body.kind === "paragraph") {
            return Boolean(readField(state.fields, body.field));
        }
        if (body.kind === "list") {
            return splitList((state.fields || {})[body.field], body.split).length > 0;
        }
        if (body.kind === "entries") {
            const rows = state[body.source] || [];
            return rows.some((row) =>
                buildRuns(body.head || {}, row).length > 0 ||
                (body.bullets && splitList(row[body.bullets.field], body.bullets.split).length));
        }
        return false;
    }

    /* ----------------------------------------------------------------------
       Layout pass. Produces the display list. No DOM, no jsPDF output --
       only measurement.
       ---------------------------------------------------------------------- */

    function columnsOf(template) {
        const L = template.layout;
        const pw = template.page.width;
        const sbW = pw * L.sidebar.width;
        const onRight = L.sidebar.side !== "left";
        const sbX = onRight ? pw - sbW : 0;
        const mainX = onRight ? 0 : sbW;
        const mainW = pw - sbW;
        return {
            sidebar: {
                boxX: sbX, boxW: sbW,
                x: sbX + L.sidebar.left,
                width: sbW - L.sidebar.left - L.sidebar.right,
                first: L.sidebar.firstBaseline, bottom: L.sidebar.bottom
            },
            main: {
                boxX: mainX, boxW: mainW,
                x: mainX + L.main.left,
                width: mainW - L.main.left - L.main.right,
                first: L.main.firstBaseline, bottom: L.main.bottom
            }
        };
    }

    function layout(template, state) {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            throw new Error("jsPDF is required for layout measurement");
        }
        const measureDoc = new window.jspdf.jsPDF({ unit: "pt", format: "a4" });
        const cols = columnsOf(template);
        const ops = [];
        const ctx = {
            template: template, state: state, measureDoc: measureDoc,
            ops: ops, cols: cols, pages: 1
        };

        const setFont = (t) => {
            measureDoc.setFont(FAMILY[t.family].pdf, t.weight);
            measureDoc.setFontSize(t.size);
        };
        ctx.measure = (text, t) => { setFont(t); return measureDoc.getTextWidth(text); };
        ctx.wrap = (text, t, w) => { setFont(t); return measureDoc.splitTextToSize(text, w); };

        paintRail(ctx, 0);

        const cursor = { main: cols.main.first, sidebar: cols.sidebar.first };
        const started = { main: false, sidebar: false };
        const pageOf = { main: 0, sidebar: 0 };

        template.blocks.forEach((block) => {
            const key = block.column === "sidebar" ? "sidebar" : "main";
            layoutBlock(ctx, block, key, cursor, started, pageOf);
        });

        ctx.overflow = {
            main: cursor.main > cols.main.bottom,
            sidebar: cursor.sidebar > cols.sidebar.bottom
        };
        return ctx;
    }

    function paintRail(ctx, page) {
        const L = ctx.template.layout;
        const c = ctx.cols.sidebar;
        ctx.ops.push({
            op: "rect", page: page,
            x: c.boxX, y: 0, w: c.boxW, h: ctx.template.page.height,
            fill: colorOf(L.sidebar.background, ctx.template, ctx.state)
        });
    }

    /* Main-column pagination. The sidebar is deliberately single-page: it
       carries contact details and skills, which are not expected to run over,
       and a rail that splits mid-list reads as a rendering fault rather than
       a longer document. Overflow is reported by layout() instead. */
    function ensureRoom(ctx, key, cursor, pageOf, needed) {
        if (key !== "main") return;
        const c = ctx.cols.main;
        if (cursor.main + needed <= c.bottom) return;
        pageOf.main += 1;
        ctx.pages = Math.max(ctx.pages, pageOf.main + 1);
        paintRail(ctx, pageOf.main);
        cursor.main = c.first;
    }

    function text(ctx, page, x, y, str, t, widthForAlign) {
        ctx.ops.push({
            op: "text", page: page, x: x, y: y, text: str,
            family: t.family, size: t.size, weight: t.weight,
            color: colorOf(t.color, ctx.template, ctx.state),
            align: t.align || "left", boxWidth: widthForAlign
        });
    }

    function layoutBlock(ctx, block, key, cursor, started, pageOf) {
        const col = ctx.cols[key];
        const T = ctx.template.type;
        const page = pageOf[key];

        if (block.kind === "display") {
            const t = T[block.type];
            let value = readField(ctx.state.fields, block.field) || block.fallback || "";
            if (!value) return;
            if (block.uppercase) value = value.toUpperCase();

            let lines = [value];
            if (block.split === "firstWord") {
                const i = value.indexOf(" ");
                lines = i > 0 ? [value.slice(0, i), value.slice(i + 1)] : [value];
            }
            lines.forEach((line, idx) => {
                text(ctx, page, col.x, cursor[key], line, t);
                if (idx < lines.length - 1) cursor[key] += t.lineHeight || t.size;
            });
            if (block.rule) {
                const ry = cursor[key] + (block.gapAfterBaseline || 10);
                ctx.ops.push({
                    op: "line", page: page, x1: col.x, y1: ry,
                    x2: col.x + col.width, y2: ry,
                    color: colorOf(block.rule.color, ctx.template, ctx.state),
                    width: block.rule.width || 1
                });
                cursor[key] = ry;
            }
            cursor[key] += block.gapAfter || 0;
            started[key] = true;
            return;
        }

        if (block.kind === "contact") {
            layoutContact(ctx, block, key, cursor, pageOf);
            started[key] = true;
            return;
        }

        if (block.kind === "section") {
            if (!sectionHasContent(block.body, ctx.state)) return;
            const t = T[block.headingType || "heading"];
            if (started[key]) cursor[key] += t.gapBefore || 0;

            const label = t.uppercase ? block.label.toUpperCase() : block.label;
            ensureRoom(ctx, key, cursor, pageOf, 40);
            text(ctx, pageOf[key], col.x, cursor[key], label, t);

            if (t.rule) {
                const ry = cursor[key] + (t.rule.offset || 2);
                const x1 = col.x - (t.rule.bleedLeft || 0);
                const len = t.rule.length === undefined ? 1 : t.rule.length;
                ctx.ops.push({
                    op: "line", page: pageOf[key], x1: x1, y1: ry,
                    x2: x1 + (col.width + (t.rule.bleedLeft || 0)) * len, y2: ry,
                    color: colorOf(t.rule.color, ctx.template, ctx.state),
                    width: t.rule.width || 1
                });
                cursor[key] = ry;
            }
            cursor[key] += t.gapAfter || 0;
            layoutBody(ctx, block.body, key, cursor, pageOf);
            started[key] = true;
        }
    }

    function layoutBody(ctx, body, key, cursor, pageOf) {
        const col = ctx.cols[key];
        const T = ctx.template.type;

        if (body.kind === "paragraph") {
            const t = T[body.type || "body"];
            const value = readField(ctx.state.fields, body.field);
            if (!value) return;
            ctx.wrap(value, t, col.width).forEach((line, i) => {
                if (i) cursor[key] += t.lineHeight || t.size;
                ensureRoom(ctx, key, cursor, pageOf, t.lineHeight || t.size);
                text(ctx, pageOf[key], col.x, cursor[key], line, t);
            });
            return;
        }

        if (body.kind === "list") {
            const t = T[body.type || "bullet"];
            const items = splitList((ctx.state.fields || {})[body.field], body.split);
            items.forEach((item, i) => {
                if (i) cursor[key] += t.itemGap || t.lineHeight;
                layoutBulletItem(ctx, item, t, key, cursor, pageOf);
            });
            return;
        }

        /* Draft body from an import: literal lines carrying the design's own
           sample text, before a human has mapped them to fields. Lets an
           imported descriptor render immediately for review instead of
           having to be finished first. Not for production templates -- a
           shipped template maps to fields. */
        if (body.kind === "lines") {
            const t = T[body.type || "body"];
            (body.lines || []).forEach((ln, i) => {
                if (i) cursor[key] += (ln.kind === "bullet" ? (t.itemGap || t.lineHeight)
                                                            : (t.lineHeight || t.size));
                if (ln.kind === "bullet") {
                    /* A body that names its own type wins over the generic
                       bullet role: a sidebar list must not be painted in the
                       main column's ink, which is dark-on-dark in a rail. */
                    layoutBulletItem(ctx, ln.text, body.type ? t : (T.bullet || t),
                                     key, cursor, pageOf);
                    return;
                }
                ctx.wrap(String(ln.text || ""), t, col.width).forEach((line, j) => {
                    if (j) cursor[key] += t.lineHeight || t.size;
                    ensureRoom(ctx, key, cursor, pageOf, t.lineHeight || t.size);
                    text(ctx, pageOf[key], col.x, cursor[key], line, t);
                });
            });
            return;
        }

        if (body.kind === "entries") {
            const rows = ctx.state[body.source] || [];
            let emitted = 0;
            rows.forEach((row) => {
                const headRuns = buildRuns(body.head || {}, row, ctx.template);
                const bullets = body.bullets
                    ? splitList(row[body.bullets.field], body.bullets.split) : [];
                if (!headRuns.length && !bullets.length) return;

                if (emitted) cursor[key] += body.entryGap || 20;
                ensureRoom(ctx, key, cursor, pageOf, 40);

                if (headRuns.length) layoutRuns(ctx, headRuns, key, cursor, pageOf);

                const subRuns = body.sub ? buildRuns(body.sub, row, ctx.template) : [];
                if (subRuns.length) {
                    cursor[key] += (body.sub.gapBefore || 13);
                    ensureRoom(ctx, key, cursor, pageOf, 14);
                    layoutRuns(ctx, subRuns, key, cursor, pageOf);
                }

                if (bullets.length) {
                    const t = T["bullet"];
                    cursor[key] += (body.bullets.gapBefore || 16);
                    bullets.forEach((item, i) => {
                        if (i) cursor[key] += t.itemGap || t.lineHeight;
                        layoutBulletItem(ctx, item, t, key, cursor, pageOf);
                    });
                }
                emitted += 1;
            });
        }
    }

    /* One baseline, several fonts. Each run is measured and the pen advances,
       which is how a PDF draws mixed weights -- a single text call cannot
       change font mid-string. */
    function layoutRuns(ctx, runs, key, cursor, pageOf) {
        const col = ctx.cols[key];
        const T = ctx.template.type;
        let x = col.x;
        runs.forEach((run) => {
            const t = T[run.type];
            text(ctx, pageOf[key], x, cursor[key], run.text, t);
            x += ctx.measure(run.text, t);
        });
    }

    function layoutBulletItem(ctx, item, t, key, cursor, pageOf) {
        const col = ctx.cols[key];
        const indent = t.indent || 8;
        const lines = ctx.wrap(item, t, col.width - indent);
        lines.forEach((line, i) => {
            if (i) cursor[key] += t.lineHeight || t.size;
            ensureRoom(ctx, key, cursor, pageOf, t.lineHeight || t.size);
            if (i === 0 && t.marker) {
                text(ctx, pageOf[key], col.x, cursor[key], t.marker, t);
            }
            text(ctx, pageOf[key], col.x + indent, cursor[key], line, t);
        });
    }

    /* ----------------------------------------------------------------------
       Contact rows: a filled disc with the glyph knocked out in the rail
       colour. Drawn from primitives so the export stays vector and the
       template needs no image asset (the constraint that already keeps
       js/mockup.js free of bundled artwork).
       ---------------------------------------------------------------------- */
    function layoutContact(ctx, block, key, cursor, pageOf) {
        const col = ctx.cols[key];
        const T = ctx.template.type;
        const t = T.sidebarContact;
        const r = (block.iconSize || 15) / 2;
        const disc = colorOf(block.disc, ctx.template, ctx.state);
        const glyph = colorOf(block.glyph, ctx.template, ctx.state);
        const page = pageOf[key];

        let emitted = 0;
        (block.rows || []).forEach((row) => {
            const value = joinFields(row, ctx.state.fields);
            if (!value) return;
            /* Advance past the line already drawn, then the inter-row gap.
               Leaving out the line height is what put the rail 24pt high
               against the reference artwork. */
            if (emitted) cursor[key] += (t.lineHeight || t.size) + (t.rowGap || 14);
            emitted += 1;

            const lines = ctx.wrap(value, t, col.width - (block.textOffset || 28));
            const cy = cursor[key] - t.size * 0.32;
            drawIcon(ctx, page, row.icon, col.x + r, cy, r, disc, glyph);

            lines.forEach((line, i) => {
                if (i) cursor[key] += t.lineHeight || t.size;
                text(ctx, page, col.x + (block.textOffset || 28), cursor[key], line, t);
            });
        });
    }

    function drawIcon(ctx, page, kind, cx, cy, r, disc, glyph) {
        const P = ctx.ops;
        P.push({ op: "circle", page: page, cx: cx, cy: cy, r: r, fill: disc });

        if (kind === "pin") {
            P.push({ op: "circle", page: page, cx: cx, cy: cy - 0.16 * r, r: 0.30 * r, fill: glyph });
            P.push({ op: "poly", page: page, fill: glyph, points: [
                [cx - 0.28 * r, cy + 0.02 * r],
                [cx + 0.28 * r, cy + 0.02 * r],
                [cx, cy + 0.60 * r]
            ]});
            return;
        }
        if (kind === "phone") {
            P.push({ op: "roundrect", page: page, fill: glyph,
                     x: cx - 0.26 * r, y: cy - 0.50 * r, w: 0.52 * r, h: 1.00 * r, r: 0.12 * r });
            P.push({ op: "line", page: page, color: disc, width: Math.max(0.4, 0.10 * r),
                     x1: cx - 0.10 * r, y1: cy - 0.34 * r, x2: cx + 0.10 * r, y2: cy - 0.34 * r });
            return;
        }
        /* envelope */
        P.push({ op: "rect", page: page, fill: glyph,
                 x: cx - 0.44 * r, y: cy - 0.32 * r, w: 0.88 * r, h: 0.64 * r });
        P.push({ op: "poly", page: page, fill: disc, points: [
            [cx - 0.44 * r, cy - 0.32 * r],
            [cx + 0.44 * r, cy - 0.32 * r],
            [cx, cy + 0.06 * r]
        ]});
    }

    /* ----------------------------------------------------------------------
       Painter A: SVG preview.
       SVG rather than positioned HTML because its y IS the text baseline, so
       the preview uses the display list's coordinates unchanged instead of
       re-deriving them from font metrics. Text stays selectable and the sheet
       scales with viewBox.
       ---------------------------------------------------------------------- */
    function paintSvg(ctx, page) {
        const tpl = ctx.template;
        const svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("viewBox", "0 0 " + tpl.page.width + " " + tpl.page.height);
        svg.setAttribute("width", "100%");
        svg.setAttribute("class", "rt-sheet");
        svg.setAttribute("role", "img");

        const bg = document.createElementNS(SVG_NS, "rect");
        bg.setAttribute("width", String(tpl.page.width));
        bg.setAttribute("height", String(tpl.page.height));
        bg.setAttribute("fill", "#FFFFFF");
        svg.appendChild(bg);

        ctx.ops.filter((o) => (o.page || 0) === page).forEach((o) => {
            svg.appendChild(svgNode(o));
        });
        return svg;
    }

    function svgNode(o) {
        let n;
        if (o.op === "rect") {
            n = document.createElementNS(SVG_NS, "rect");
            n.setAttribute("x", o.x); n.setAttribute("y", o.y);
            n.setAttribute("width", o.w); n.setAttribute("height", o.h);
            n.setAttribute("fill", o.fill);
        } else if (o.op === "roundrect") {
            n = document.createElementNS(SVG_NS, "rect");
            n.setAttribute("x", o.x); n.setAttribute("y", o.y);
            n.setAttribute("width", o.w); n.setAttribute("height", o.h);
            n.setAttribute("rx", o.r); n.setAttribute("fill", o.fill);
        } else if (o.op === "circle") {
            n = document.createElementNS(SVG_NS, "circle");
            n.setAttribute("cx", o.cx); n.setAttribute("cy", o.cy);
            n.setAttribute("r", o.r); n.setAttribute("fill", o.fill);
        } else if (o.op === "poly") {
            n = document.createElementNS(SVG_NS, "polygon");
            n.setAttribute("points", o.points.map((p) => p[0] + "," + p[1]).join(" "));
            n.setAttribute("fill", o.fill);
        } else if (o.op === "line") {
            n = document.createElementNS(SVG_NS, "line");
            n.setAttribute("x1", o.x1); n.setAttribute("y1", o.y1);
            n.setAttribute("x2", o.x2); n.setAttribute("y2", o.y2);
            n.setAttribute("stroke", o.color);
            n.setAttribute("stroke-width", o.width);
        } else {
            n = document.createElementNS(SVG_NS, "text");
            n.setAttribute("x", o.x); n.setAttribute("y", o.y);
            n.setAttribute("font-family", FAMILY[o.family].css);
            n.setAttribute("font-size", o.size);
            n.setAttribute("font-weight", o.weight === "bold" ? "700" : "400");
            n.setAttribute("fill", o.color);
            /* Namespaced attribute: setAttribute("xml:space", ...) silently
               fails to register, and SVG then collapses the leading space of
               a run such as " - ", so the preview loses whitespace the PDF
               draws. The runs stay positioned by measured width either way,
               so the symptom is a glyph sitting flush against the previous
               run rather than a shifted line. */
            n.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
            /* textContent only: no markup path for document data. */
            n.textContent = o.text;
        }
        return n;
    }

    /* ----------------------------------------------------------------------
       Painter B: jsPDF.
       Every string is written with doc.text(), so the export carries real
       vector glyphs and stays ATS-parseable. See
       docs/error-fixes/RESUME_PDF_RASTERIZED_TEXT_FIX.md for why nothing
       here may go through a canvas.
       ---------------------------------------------------------------------- */
    function paintPdf(ctx) {
        const doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4" });
        for (let page = 0; page < ctx.pages; page += 1) {
            if (page) doc.addPage();
            ctx.ops.filter((o) => (o.page || 0) === page).forEach((o) => pdfOp(doc, o));
        }
        return doc;
    }

    function pdfOp(doc, o) {
        if (o.op === "rect" || o.op === "roundrect") {
            const c = hexToRgb(o.fill);
            doc.setFillColor(c[0], c[1], c[2]);
            if (o.op === "rect") doc.rect(o.x, o.y, o.w, o.h, "F");
            else doc.roundedRect(o.x, o.y, o.w, o.h, o.r, o.r, "F");
            return;
        }
        if (o.op === "circle") {
            const c = hexToRgb(o.fill);
            doc.setFillColor(c[0], c[1], c[2]);
            doc.circle(o.cx, o.cy, o.r, "F");
            return;
        }
        if (o.op === "poly") {
            const c = hexToRgb(o.fill);
            doc.setFillColor(c[0], c[1], c[2]);
            const start = o.points[0];
            const rel = o.points.slice(1).map((p, i) => {
                const prev = o.points[i];
                return [p[0] - prev[0], p[1] - prev[1]];
            });
            doc.lines(rel, start[0], start[1], [1, 1], "F", true);
            return;
        }
        if (o.op === "line") {
            const c = hexToRgb(o.color);
            doc.setDrawColor(c[0], c[1], c[2]);
            doc.setLineWidth(o.width);
            doc.line(o.x1, o.y1, o.x2, o.y2);
            return;
        }
        const c = hexToRgb(o.color);
        doc.setFont(FAMILY[o.family].pdf, o.weight);
        doc.setFontSize(o.size);
        doc.setTextColor(c[0], c[1], c[2]);
        doc.text(o.text, o.x, o.y, o.align && o.align !== "left"
            ? { align: o.align } : undefined);
    }

    /* ---------------------------------------------------------------------- */

    function byId(id) {
        const all = window.TB_RESUME_TEMPLATES || [];
        return all.filter((t) => t.id === id)[0] || all[0] || null;
    }

    function renderPreview(template, state, mount) {
        const ctx = layout(template, state);
        mount.replaceChildren();
        for (let p = 0; p < ctx.pages; p += 1) {
            mount.appendChild(paintSvg(ctx, p));
        }
        return ctx;
    }

    function buildPdf(template, state) {
        return paintPdf(layout(template, state));
    }

    return {
        byId: byId,
        layout: layout,
        renderPreview: renderPreview,
        buildPdf: buildPdf,
        sectionHasContent: sectionHasContent,
        FAMILY: FAMILY
    };
})();