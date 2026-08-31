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
        const p = template.palette || {};
        /* ONE level of indirection: a palette entry may itself name `accent`
           rather than a hex. That is how a template makes a named role follow
           the document's colour -- grey-rail's rail and display ink are one
           colour and both track the swatch row -- without every block in the
           descriptor having to say `accent` and lose the role's name.

           Resolved before the accent test rather than after, because the
           lookup used to return the palette's value verbatim: an entry of
           "accent" reached the painters as the literal string, which is not a
           colour any medium understands. */
        const resolved = (p[role] === undefined) ? role : p[role];
        if (resolved === "accent") {
            const a = state && state.accent;
            return /^#[0-9A-Fa-f]{6}$/.test(a) ? a : "#1A1A1A";
        }
        return resolved || "#000000";
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
            /* `field` rides along so the painters can say which control drew
               this run. Literals above deliberately carry none -- a ", " is
               punctuation the template owns, not the visitor's text. */
            out.push({ text: text, type: run.type, field: run.field });
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
        if (body.kind === "list" || body.kind === "meters") {
            return splitList((state.fields || {})[body.field], body.split).length > 0;
        }
        if (body.kind === "entries") {
            const rows = state[body.source] || [];
            return rows.some((row) => entryHasContent(body, row));
        }
        return false;
    }

    /* Normalizes `sub`, which is one line spec or an array of them. Kept a
       function rather than inlined twice, because the section gate and the
       row loop below must reach the same answer about what a row draws. */
    function subSpecs(body) {
        if (!body.sub) return [];
        return Array.isArray(body.sub) ? body.sub : [body.sub];
    }

    /* Does one entry row draw anything at all? Every part of the row counts,
       not just the head: an entry whose company is blank but whose role,
       place or dates are typed used to vanish silently, taking the visitor's
       text with it. The section gate and the row loop share this so they can
       never disagree -- a drift between them renders a heading over nothing,
       or hides a heading over something. */
    function entryHasContent(body, row) {
        if (buildRuns(body.head || {}, row).length) return true;
        if (subSpecs(body).some((spec) => buildRuns(spec, row).length)) return true;
        if (body.aside && buildRuns(body.aside, row).length) return true;
        return Boolean(body.bullets &&
            splitList(row[body.bullets.field], body.bullets.split).length);
    }

    /* ----------------------------------------------------------------------
       Layout pass. Produces the display list. No DOM, no jsPDF output --
       only measurement.
       ---------------------------------------------------------------------- */

    function columnsOf(template) {
        const L = template.layout;
        const pw = template.page.width;

        /* Single-column templates have no rail, so they get NO sidebar column
           at all rather than a zero-width one. A degenerate column would
           still be a valid target for `column: "sidebar"`, and a descriptor
           naming it by mistake would then lay text out invisibly instead of
           failing where the mistake is. Absence is checked for throughout:
           paintRail, the cursor set-up and the block loop. */
        if (L.kind === "single-column" || !L.sidebar) {
            return {
                main: {
                    boxX: 0, boxW: pw,
                    x: L.main.left,
                    width: pw - L.main.left - L.main.right,
                    first: L.main.firstBaseline, bottom: L.main.bottom
                }
            };
        }

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

        const cursor = { main: cols.main.first };
        const started = { main: false };
        const pageOf = { main: 0 };
        if (cols.sidebar) {
            cursor.sidebar = cols.sidebar.first;
            started.sidebar = false;
            pageOf.sidebar = 0;
        }

        template.blocks.forEach((block) => {
            const key = (block.column === "sidebar" && cols.sidebar) ? "sidebar" : "main";
            layoutBlock(ctx, block, key, cursor, started, pageOf);
        });

        ctx.overflow = {
            main: cursor.main > cols.main.bottom,
            sidebar: Boolean(cols.sidebar) && cursor.sidebar > cols.sidebar.bottom
        };
        return ctx;
    }

    function paintRail(ctx, page) {
        const L = ctx.template.layout;
        const c = ctx.cols.sidebar;
        if (!c) return;
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

    /* The x a painter needs for a given alignment. Both painters anchor the
       SAME x -- jsPDF's align option and SVG's text-anchor agree on what the
       coordinate means -- so alignment is decided once here rather than
       measured separately in each medium. */
    function anchorX(col, align) {
        if (align === "center") return col.x + col.width / 2;
        if (align === "right") return col.x + col.width;
        return col.x;
    }

    /* One rule emitter for every horizontal rule: the one above a heading,
       the one below it, and the standalone `rule` block. `bleedLeft` and
       `length` exist for the grey rail's part-width sidebar rules and are
       inert (0 and 1) everywhere else. */
    function emitRule(ctx, page, col, spec, y) {
        const bleed = spec.bleedLeft || 0;
        const len = spec.length === undefined ? 1 : spec.length;
        ctx.ops.push({
            op: "line", page: page, x1: col.x - bleed, y1: y,
            x2: col.x - bleed + (col.width + bleed) * len, y2: y,
            color: colorOf(spec.color, ctx.template, ctx.state),
            width: spec.width || 1
        });
    }

    /* `edit` is PROVENANCE: which form control produced this run, so the
       preview can be clicked into. It is carried on the display list and read
       only by paintSvg, which writes it onto the <text> node; paintPdf reads
       named keys and never sees it, so an exported file cannot carry editing
       metadata. Call sites that omit it produce text nobody can click --
       section headings are template labels, not the visitor's words.

       Shape, and both forms may carry `part` to address one item inside a
       multi-value field:
         { bind: "name" }                        a [data-bind] control
         { entry: { list, index, key } }         a row in a repeating list
         { part: { split: ",", index: 2 } }      one segment of that value
         { inline: false }                       clickable, but hands off to
                                                 the form instead of taking an
                                                 overlay -- wrapped prose,
                                                 joined lines, <select>s */
    function text(ctx, page, x, y, str, t, widthForAlign, edit) {
        const op = {
            op: "text", page: page, x: x, y: y, text: str,
            family: t.family, size: t.size, weight: t.weight,
            color: colorOf(t.color, ctx.template, ctx.state),
            align: t.align || "left", boxWidth: widthForAlign
        };
        if (edit) op.edit = edit;
        ctx.ops.push(op);
    }

    /* Provenance for a field named by a descriptor. `inline` defaults to true
       and is turned off by the caller for anything an overlay cannot honestly
       sit on top of. */
    function fieldEdit(name, extra) {
        if (!name) return null;
        return Object.assign({ bind: name }, extra || {});
    }

    /* Provenance for one field of one row in a repeating list. `index` is the
       row's position in the STATE array, which is also its position in the
       DOM: rows that render nothing are skipped by the painter but still
       occupy their slot in both, so the two cannot slide apart. */
    function entryEdit(ref, key) {
        if (!ref || !key) return null;
        return { entry: { list: ref.list, index: ref.index, key: key } };
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
            /* A split name is two lines showing halves of ONE field, and an
               overlay over half a value would let the visitor edit a fragment
               that does not exist in the form. Those hand off; an unsplit name
               takes the overlay. The uppercase transform is the same story --
               the sheet shows CALLING JOHNSON and the field holds Calling
               Johnson -- but the overlay carries the field's value, not the
               drawn one, so that stays honest either way. */
            const nameEdit = fieldEdit(block.field,
                lines.length > 1 ? { inline: false } : null);
            const nameX = anchorX(col, t.align);
            lines.forEach((line, idx) => {
                text(ctx, page, nameX, cursor[key], line, t, undefined, nameEdit);
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

        /* A paragraph that belongs to no section: the professional title and
           the contact line of a plain single-column CV, which sit under the
           name with no heading over them.

           `field` reads one value; `fields` joins several with `separator`,
           dropping the separator around values that are empty, so a visitor
           who filled in only a phone number gets no dangling bars. Unlike
           `display` -- which is the one-line masthead and never wraps -- this
           wraps to the column, and it leaves the cursor on its LAST baseline,
           which is the convention every other body in this engine follows. */
        if (block.kind === "text") {
            const t = T[block.type || "body"];
            const value = block.fields
                ? joinFields(block, ctx.state.fields)
                : readField(ctx.state.fields, block.field);
            if (!value) return;

            cursor[key] += block.gapBefore || 0;
            const wrapped = ctx.wrap(value, t, col.width);
            /* Two reasons to hand off rather than overlay: a joined line is
               several fields sharing one run, so there is no single control to
               put a caret in; and a wrapped one is several runs sharing one
               field, so an overlay would sit on a fragment. A single field on
               a single line -- the professional title -- takes the overlay. */
            const textEdit = block.fields
                ? fieldEdit(block.fields[0], { inline: false })
                : fieldEdit(block.field, wrapped.length > 1 ? { inline: false } : null);
            wrapped.forEach((line, i) => {
                if (i) cursor[key] += t.lineHeight || t.size;
                ensureRoom(ctx, key, cursor, pageOf, t.lineHeight || t.size);
                text(ctx, pageOf[key], anchorX(col, t.align), cursor[key], line, t,
                     undefined, textEdit);
            });
            cursor[key] += block.gapAfter || 0;
            started[key] = true;
            return;
        }

        /* A rule that belongs to no heading -- the hairline above the name
           on a fully ruled sheet. Kept a block rather than another optional
           key on `display`, because it is page furniture in its own right and
           a template may want one anywhere. */
        if (block.kind === "rule") {
            cursor[key] += block.gapBefore || 0;
            ensureRoom(ctx, key, cursor, pageOf, block.gapAfter || 0);
            emitRule(ctx, pageOf[key], col, block, cursor[key]);
            cursor[key] += block.gapAfter || 0;
            started[key] = true;
            return;
        }

        if (block.kind === "contact") {
            layoutContact(ctx, block, key, cursor, pageOf);
            started[key] = true;
            return;
        }

        /* One centred line of contact details with a drawn glyph between
           each pair -- the classic single-column masthead, as against the
           stacked icon rows of `contact`. */
        if (block.kind === "contactRow") {
            layoutContactRow(ctx, block, key, cursor, pageOf);
            started[key] = true;
            return;
        }

        if (block.kind === "section") {
            if (!sectionHasContent(block.body, ctx.state)) return;
            const t = T[block.headingType || "heading"];
            if (started[key]) cursor[key] += t.gapBefore || 0;

            const label = t.uppercase ? block.label.toUpperCase() : block.label;
            /* Enough room for the whole heading assembly, so a page never
               breaks between a rule and the heading it belongs to. */
            ensureRoom(ctx, key, cursor, pageOf, t.ruleBefore ? 72 : 40);

            if (t.ruleBefore) {
                emitRule(ctx, pageOf[key], col, t.ruleBefore, cursor[key]);
                cursor[key] += t.ruleBefore.gapAfter || 0;
            }

            text(ctx, pageOf[key], anchorX(col, t.align), cursor[key], label, t);

            if (t.rule) {
                const ry = cursor[key] + (t.rule.offset || 2);
                emitRule(ctx, pageOf[key], col, t.rule, ry);
                cursor[key] = ry;
            }
            /* A block may tighten its own heading-to-body gap: entry lists
               sit closer under the rule than prose and lists do, and that is
               a property of the body, not of the heading style. */
            cursor[key] += (block.gapAfter === undefined ? (t.gapAfter || 0) : block.gapAfter);
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
            /* Prose, always several runs to one field: hands off to the form. */
            const edit = fieldEdit(body.field, { inline: false });
            ctx.wrap(value, t, col.width).forEach((line, i) => {
                if (i) cursor[key] += t.lineHeight || t.size;
                ensureRoom(ctx, key, cursor, pageOf, t.lineHeight || t.size);
                text(ctx, pageOf[key], col.x, cursor[key], line, t, undefined, edit);
            });
            return;
        }

        if (body.kind === "list") {
            const t = T[body.type || "bullet"];
            const items = splitList((ctx.state.fields || {})[body.field], body.split);
            if (body.columns) {
                layoutListColumns(ctx, items, t, body.columns, key, cursor, pageOf,
                                  body.field, body.split);
                return;
            }
            items.forEach((item, i) => {
                if (i) cursor[key] += t.itemGap || t.lineHeight;
                layoutBulletItem(ctx, item, t, key, cursor, pageOf, undefined,
                    fieldEdit(body.field, { part: { split: body.split, index: i } }));
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

        /* Name, bar, level -- the language proficiency block. The bar is two
           rects rather than a stroked line, so track and fill are one
           primitive each and neither painter needs a new operation. */
        if (body.kind === "meters") {
            const t = T[body.type || "body"];
            const rows = splitList((ctx.state.fields || {})[body.field], body.split);
            const bar = body.bar || {};
            const lh = t.lineHeight || t.size;
            const h = bar.height || 6;

            rows.forEach((row, i) => {
                if (i) cursor[key] += body.itemGap || lh;

                const cut = row.indexOf(":");
                const name = (cut < 0 ? row : row.slice(0, cut)).trim();
                const level = cut < 0 ? "" : row.slice(cut + 1).trim();
                const fraction = meterFraction(level, body.levels);
                if (!name && !level) return;

                ensureRoom(ctx, key, cursor, pageOf, lh * 3);
                const page = pageOf[key];
                /* `meters` reads one composed string, but the FORM behind it is
                   a list of rows, so provenance is an entry reference. The
                   index counts rendered rows, and the composer drops any row
                   with no language name -- the resolver in js/resume.js closes
                   that gap by counting only named rows, which is the same rule
                   from the other end. The level is a <select> plus an optional
                   free-text box, which no single overlay can stand in for, so
                   it hands off. */
                const langName = entryEdit({ list: "language", index: i }, "name");
                const langLevel = Object.assign(
                    entryEdit({ list: "language", index: i }, "level"),
                    { inline: false });
                text(ctx, page, col.x, cursor[key], name + (level ? ":" : ""), t,
                     undefined, langName);

                if (fraction === null) {
                    if (level) cursor[key] += lh;
                } else {
                    cursor[key] += bar.gapBefore === undefined ? 12 : bar.gapBefore;
                    ctx.ops.push({
                        op: "rect", page: page, x: col.x, y: cursor[key] - h / 2,
                        w: col.width, h: h,
                        fill: colorOf(bar.track || "#D1D3D4", ctx.template, ctx.state)
                    });
                    if (fraction > 0) {
                        ctx.ops.push({
                            op: "rect", page: page, x: col.x, y: cursor[key] - h / 2,
                            w: col.width * fraction, h: h,
                            fill: colorOf(bar.fill || "ink", ctx.template, ctx.state)
                        });
                    }
                    cursor[key] += bar.gapAfter === undefined ? 16 : bar.gapAfter;
                }

                if (level) {
                    text(ctx, pageOf[key], col.x, cursor[key], level, t,
                         undefined, langLevel);
                }
            });
            return;
        }

        if (body.kind === "entries") {
            const rows = ctx.state[body.source] || [];
            let emitted = 0;
            rows.forEach((row, rowIndex) => {
                if (!entryHasContent(body, row)) return;
                const entryRef = { list: body.source, index: rowIndex };
                const headRuns = buildRuns(body.head || {}, row, ctx.template);
                const bullets = body.bullets
                    ? splitList(row[body.bullets.field], body.bullets.split) : [];

                if (emitted) cursor[key] += body.entryGap || 20;
                ensureRoom(ctx, key, cursor, pageOf, 40);

                if (headRuns.length) layoutRuns(ctx, headRuns, key, cursor, pageOf, entryRef);

                /* Dates set flush right on the head's OWN baseline, so the
                   cursor must not have moved yet -- that is why this is laid
                   out here rather than as another run inside the head. */
                if (body.aside) {
                    const asideRuns = buildRuns(body.aside, row, ctx.template);
                    if (asideRuns.length) {
                        layoutRunsRight(ctx, asideRuns, key, cursor[key], pageOf[key], entryRef);
                    }
                }

                /* `sub` is one line, or an ARRAY of them. Three-line entry
                   heads -- company, then role, then place, each on its own
                   baseline -- are common enough in CV artwork that folding
                   them into one comma-joined line misrepresents the design.
                   Each element keeps its own runs and its own gapBefore, and
                   a line whose every field is empty is skipped without
                   consuming its gap. A plain object still means exactly what
                   it did, so no existing descriptor changes. */
                subSpecs(body).forEach((spec) => {
                    const subRuns = buildRuns(spec, row, ctx.template);
                    if (!subRuns.length) return;
                    cursor[key] += (spec.gapBefore || 13);
                    ensureRoom(ctx, key, cursor, pageOf, 14);
                    layoutRuns(ctx, subRuns, key, cursor, pageOf, entryRef);
                });

                if (bullets.length) {
                    /* The entry body names its own type. It used to be hard
                       wired to T.bullet, which forces every template's entry
                       description to be a bulleted list -- but a plain CV sets
                       the description as PROSE while still wanting markers on
                       its skills, and one role cannot be both. Defaults to
                       "bullet", so no existing descriptor changes. */
                    const t = T[body.bullets.type || "bullet"];
                    cursor[key] += (body.bullets.gapBefore || 16);
                    bullets.forEach((item, i) => {
                        if (i) cursor[key] += t.itemGap || t.lineHeight;
                        layoutBulletItem(ctx, item, t, key, cursor, pageOf, undefined,
                            entryEdit(entryRef, body.bullets.field)
                                ? Object.assign(entryEdit(entryRef, body.bullets.field),
                                    { part: { split: body.bullets.split, index: i } })
                                : null);
                    });
                }
                emitted += 1;
            });
        }
    }

    /* One baseline, several fonts. Each run is measured and the pen advances,
       which is how a PDF draws mixed weights -- a single text call cannot
       change font mid-string. */
    function layoutRuns(ctx, runs, key, cursor, pageOf, entryRef) {
        const col = ctx.cols[key];
        const T = ctx.template.type;
        let x = col.x;
        runs.forEach((run) => {
            const t = T[run.type];
            text(ctx, pageOf[key], x, cursor[key], run.text, t, undefined,
                 entryEdit(entryRef, run.field));
            x += ctx.measure(run.text, t);
        });
    }

    /* The mirror of layoutRuns: the group is measured whole, then drawn left
       to right from an x that lands its last glyph on the column's right
       edge. Right-anchoring each run on its own would stack them all at the
       same place, so the measurement has to finish before anything is drawn. */
    function layoutRunsRight(ctx, runs, key, y, page, entryRef) {
        const col = ctx.cols[key];
        const T = ctx.template.type;
        let total = 0;
        runs.forEach((run) => { total += ctx.measure(run.text, T[run.type]); });
        let x = col.x + col.width - total;
        runs.forEach((run) => {
            const t = T[run.type];
            text(ctx, page, x, y, run.text, t, undefined, entryEdit(entryRef, run.field));
            x += ctx.measure(run.text, t);
        });
    }

    /* A list set side by side -- the two-up skills block of a classic CV.
       Both columns start on the same baseline and the cursor advances by the
       taller one.

       Deliberately NOT paginated. Room is reserved once, up front, and the
       sub-columns run on a private cursor key, which makes ensureRoom a no-op
       inside them (it only ever acts on "main"). A skills list that broke
       mid-column would leave its two halves on different pages, which reads
       as a rendering fault rather than a longer document -- the same
       judgement the sidebar's single-page rule already makes. */
    function layoutListColumns(ctx, items, t, spec, key, cursor, pageOf, field, split) {
        const col = ctx.cols[key];
        const count = Math.max(2, spec.count || 2);
        const gutter = spec.gutter === undefined ? 12 : spec.gutter;
        const lh = t.lineHeight || t.size;
        const perColumn = Math.ceil(items.length / count);
        if (!items.length) return;

        ensureRoom(ctx, key, cursor, pageOf, perColumn * (t.itemGap || lh));

        /* `split` is the fraction of the column width at which the second of
           two columns begins, taken from the source artwork. Any count other
           than exactly two gets equal widths. */
        const boxes = [];
        if (count === 2 && spec.split) {
            boxes.push({ x: col.x, width: col.width * spec.split - gutter });
            boxes.push({ x: col.x + col.width * spec.split,
                         width: col.width * (1 - spec.split) });
        } else {
            const w = (col.width - gutter * (count - 1)) / count;
            for (let i = 0; i < count; i += 1) {
                boxes.push({ x: col.x + (w + gutter) * i, width: w });
            }
        }

        let deepest = cursor[key];
        boxes.forEach((box, ci) => {
            const slice = items.slice(ci * perColumn, (ci + 1) * perColumn);
            const sub = { col: cursor[key] };
            const subPage = { col: pageOf[key] };
            slice.forEach((item, i) => {
                if (i) sub.col += t.itemGap || lh;
                /* The index within the WHOLE field, not within this
                   sub-column: editing the right-hand column would otherwise
                   rewrite the wrong comma-separated segment. */
                layoutBulletItem(ctx, item, t, "col", sub, subPage, box,
                    fieldEdit(field, { part: { split: split, index: ci * perColumn + i } }));
            });
            if (slice.length) deepest = Math.max(deepest, sub.col);
        });
        cursor[key] = deepest;
    }

    /* The bar's fill, resolved from the level text the visitor typed. The
       scale belongs to the template, not the engine: `levels` maps a token to
       a fraction, so a descriptor can publish CEFR bands, a five-point scale,
       or none at all. A bare percentage always works. Unrecognised text draws
       NO bar rather than a guessed one -- a meter at an invented length is a
       worse answer than no meter. */
    function meterFraction(level, levels) {
        if (!level) return null;
        const pct = level.match(/(\d{1,3})\s*%/);
        if (pct) return Math.min(1, Math.max(0, parseInt(pct[1], 10) / 100));

        const map = levels || {};
        const keys = Object.keys(map);
        for (let i = 0; i < keys.length; i += 1) {
            const token = keys[i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            if (new RegExp("(^|[^A-Za-z0-9])" + token + "([^A-Za-z0-9]|$)", "i").test(level)) {
                return map[keys[i]];
            }
        }
        return null;
    }

    /* `box` overrides the column, for sub-column layout; `t.inset` moves the
       whole item in from the column edge, which is how bullets sit indented
       under a full-width heading. */
    function layoutBulletItem(ctx, item, t, key, cursor, pageOf, box, edit) {
        const col = box || ctx.cols[key];
        const inset = t.inset || 0;
        /* `=== undefined`, not `||`: an explicit `indent: 0` is a real value
           and `0 || 8` silently becomes 8. That is how an unmarked prose body
           -- an entry description that is not a list -- came out indented 8pt
           from the margin AND wrapped to a column 8pt narrower than it should
           have been. Found by the Classic equivalence check, not by eye. */
        const indent = t.indent === undefined ? 8 : t.indent;
        const x = col.x + inset;
        const lines = ctx.wrap(item, t, col.width - inset - indent);
        /* One item that WRAPPED is several runs to one value, so it hands off
           for the same reason a paragraph does. An item on one line takes the
           overlay, and `part` is what lets the caret land on that item alone
           inside a comma- or newline-separated field. The marker carries the
           same provenance as its text, so clicking the bullet does what
           clicking the words does rather than nothing. */
        const itemEdit = (edit && lines.length > 1)
            ? Object.assign({}, edit, { inline: false })
            : edit;
        lines.forEach((line, i) => {
            if (i) cursor[key] += t.lineHeight || t.size;
            ensureRoom(ctx, key, cursor, pageOf, t.lineHeight || t.size);
            if (i === 0 && t.marker) {
                text(ctx, pageOf[key], x, cursor[key], t.marker, t, undefined, itemEdit);
            }
            text(ctx, pageOf[key], x + indent, cursor[key], line, t, undefined, itemEdit);
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

    /* One centred line: value, glyph, value, glyph, value -- the masthead of
       a classic single-column CV, as against the stacked icon rows above.

       The row is measured whole and then drawn left to right from a computed
       start. That is the only way to centre a line that mixes text with drawn
       vector art: neither medium can centre the pair as a unit, so the engine
       has to do the arithmetic itself. */
    function layoutContactRow(ctx, block, key, cursor, pageOf) {
        const col = ctx.cols[key];
        const t = ctx.template.type[block.type || "body"];
        const sep = block.separator || {};
        const size = sep.size || 7;
        const gap = sep.gap === undefined ? 12 : sep.gap;

        /* Field names ride along with their values through the empty-filter.
           Mapping `values[i]` back to `block.fields[i]` afterwards would be
           off by one for every empty field before it, which is how a caret
           lands in the wrong box. */
        const pairs = (block.fields || [])
            .map((n) => ({ field: n, value: readField(ctx.state.fields, n) }))
            .filter((p) => p.value);
        const values = pairs.map((p) => p.value);
        if (!values.length) return;

        cursor[key] += block.gapBefore || 0;
        ensureRoom(ctx, key, cursor, pageOf, t.lineHeight || t.size);
        const page = pageOf[key];
        const y = cursor[key];

        const widths = values.map((v) => ctx.measure(v, t));
        const stride = gap * 2 + size;
        let total = stride * (values.length - 1);
        widths.forEach((w) => { total += w; });

        /* A row wider than its column would be centred about a point it has
           already passed, hanging off BOTH edges. Too wide is set from the
           left margin instead, so it overruns in one direction only. */
        const centred = block.align === "center" && total <= col.width;
        let x = centred ? col.x + (col.width - total) / 2 : col.x;

        const glyph = colorOf(sep.color || "body", ctx.template, ctx.state);
        values.forEach((value, i) => {
            text(ctx, page, x, y, value, t, undefined, fieldEdit(pairs[i].field));
            x += widths[i];
            if (i < values.length - 1) {
                drawSeparator(ctx, page, sep.shape, x + gap + size / 2,
                              y - t.size * 0.35, size / 2, glyph);
                x += stride;
            }
        });
    }

    /* Separator glyphs are primitives for the same reason the contact icons
       are: the export stays vector and the template needs no image asset. */
    function drawSeparator(ctx, page, shape, cx, cy, r, color) {
        if (shape === "diamond") {
            ctx.ops.push({ op: "poly", page: page, fill: color, points: [
                [cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]
            ]});
            return;
        }
        if (shape === "square") {
            ctx.ops.push({ op: "rect", page: page, fill: color,
                           x: cx - r, y: cy - r, w: r * 2, h: r * 2 });
            return;
        }
        ctx.ops.push({ op: "circle", page: page, cx: cx, cy: cy, r: r, fill: color });
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
            /* The same x the PDF anchors: jsPDF's align option and SVG's
               text-anchor place a centred or right-aligned string identically
               about the coordinate, so no second measurement is needed here
               and the two mediums cannot disagree. */
            if (o.align === "center") n.setAttribute("text-anchor", "middle");
            else if (o.align === "right") n.setAttribute("text-anchor", "end");
            /* Namespaced attribute: setAttribute("xml:space", ...) silently
               fails to register, and SVG then collapses the leading space of
               a run such as " - ", so the preview loses whitespace the PDF
               draws. The runs stay positioned by measured width either way,
               so the symptom is a glyph sitting flush against the previous
               run rather than a shifted line. */
            n.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
            /* Provenance for click-to-edit, PREVIEW ONLY. paintPdf reads named
               keys and never looks at `edit`, so an exported file cannot carry
               it. Serialized rather than spread across attributes so the node
               carries one self-describing value; js/resume.js parses it back.
               Text with no `edit` gets no attribute and no cursor, which is
               how section headings stay inert -- they are the template's
               words, not the visitor's. */
            if (o.edit) {
                n.setAttribute("data-edit", JSON.stringify(o.edit));
                n.setAttribute("class", "rt-editable");
            }
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