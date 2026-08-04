/* ==========================================================================
   TemplateBox - Figma Import for Resume Templates
   Converts a Figma REST API file document into a DRAFT descriptor for
   js/resume-engine.js, plus a report of what it could and could not resolve.

   WHY THIS IS FEASIBLE WITHOUT A SERVER. Figma's REST API sends
   access-control-allow-origin: * and lists X-Figma-Token among its allowed
   headers, so a browser can call it directly. Verified against the live API
   on August 2, 2026 (community answers claiming otherwise are out of date).
   No proxy, no build step, no runtime cost -- which is what keeps this
   inside the zero-server constraint in CLAUDE.md.

   TOKEN HANDLING. The token is never committed and never shipped. The tool
   page asks the operator to paste one and keeps it in that browser's own
   localStorage. A key baked into client-side source would be readable by
   anyone, and /tools/* is reachable even though it is noindexed.

   WHAT THIS DOES WELL: geometry, palette, type roles, rules, column
   detection, run grouping, bullet detection. These come from structured
   data, so they are read rather than guessed.

   WHAT IT CANNOT KNOW: which text is a FIELD rather than literal content.
   A design showing "Aiden Leonard" cannot tell you whether that is the
   name field or fixed text. Layer names help when they are meaningful,
   which in practice they usually are not. Heuristics cover the obvious
   cases (email, phone, date ranges) and everything else is reported for
   human mapping. Output is a DRAFT for review, never a finished template.

   BASELINES ARE APPROXIMATE. Figma reports a text node's bounding box, not
   its baseline, and the engine positions by baseline. The offset is
   recovered with BASELINE_RATIO below; it is the single largest source of
   vertical error in an import and is the first thing to adjust if a draft
   sits consistently high or low.
   ========================================================================== */

"use strict";

window.TBFigmaImport = (() => {

    /* Fraction of font size from a text box's top to its first baseline when
       line height is auto. Arial/Helvetica ascent is 0.905em and the em box
       carries a little leading; 0.80 matches Figma's auto line height
       closely for the Latin faces this engine can use. */
    const BASELINE_RATIO = 0.80;

    /* A filled shape this thin is a rule, not a panel. */
    const RULE_MAX_HEIGHT = 3;
    /* A panel covering at least this fraction of page height is a column. */
    const COLUMN_MIN_HEIGHT = 0.9;
    /* Two runs within this many points of each other sit on one baseline. */
    const BASELINE_EPSILON = 1.2;

    function toHex(color) {
        if (!color) return null;
        const to255 = (v) => {
            const n = Math.round(Math.max(0, Math.min(1, v)) * 255);
            return (n < 16 ? "0" : "") + n.toString(16);
        };
        return ("#" + to255(color.r) + to255(color.g) + to255(color.b)).toUpperCase();
    }

    function solidFill(node) {
        const fills = node.fills || [];
        for (let i = 0; i < fills.length; i += 1) {
            const f = fills[i];
            if (f.type === "SOLID" && f.visible !== false) {
                if (f.opacity !== undefined && f.opacity < 0.05) continue;
                return toHex(f.color);
            }
        }
        return null;
    }

    /* ----------------------------------------------------------------------
       Fetch. Direct browser call; see the CORS note in the header.
       ---------------------------------------------------------------------- */

    function parseFileKey(input) {
        const s = String(input || "").trim();
        const m = s.match(/figma\.com\/(?:file|design)\/([A-Za-z0-9]+)/);
        if (m) return m[1];
        return /^[A-Za-z0-9]+$/.test(s) ? s : null;
    }

    function fetchFile(fileKey, token) {
        return fetch("https://api.figma.com/v1/files/" + encodeURIComponent(fileKey), {
            headers: { "X-Figma-Token": token }
        }).then((res) => {
            if (!res.ok) {
                return res.text().then((body) => {
                    throw new Error("Figma API " + res.status + ": " + body.slice(0, 200));
                });
            }
            return res.json();
        });
    }

    /* ----------------------------------------------------------------------
       Flatten. Figma nests deeply and groups carry no styling of their own,
       so only leaves with a bounding box matter.
       ---------------------------------------------------------------------- */

    function flatten(node, out) {
        if (!node || node.visible === false) return out;
        const kids = node.children || [];
        if (node.absoluteBoundingBox &&
            (node.type === "TEXT" || !kids.length ||
             node.type === "RECTANGLE" || node.type === "LINE" ||
             node.type === "ELLIPSE" || node.type === "VECTOR")) {
            out.push(node);
        }
        kids.forEach((k) => flatten(k, out));
        return out;
    }

    function findFrame(doc) {
        const frames = [];
        (function walk(n) {
            if (!n) return;
            if ((n.type === "FRAME" || n.type === "COMPONENT") && n.absoluteBoundingBox) {
                frames.push(n);
            }
            (n.children || []).forEach(walk);
        })(doc);
        if (!frames.length) return null;
        return frames.sort((a, b) =>
            (b.absoluteBoundingBox.width * b.absoluteBoundingBox.height) -
            (a.absoluteBoundingBox.width * a.absoluteBoundingBox.height))[0];
    }

    /* ----------------------------------------------------------------------
       Analysis
       ---------------------------------------------------------------------- */

    function analyze(figmaFile) {
        const doc = figmaFile.document || figmaFile;
        const frame = findFrame(doc);
        if (!frame) throw new Error("No frame found in this Figma file");

        const box = frame.absoluteBoundingBox;
        const page = { width: Math.round(box.width), height: Math.round(box.height) };
        const ox = box.x, oy = box.y;

        const nodes = flatten(frame, []).filter((n) => n !== frame);
        const texts = [];
        const panels = [];
        const rules = [];
        const discs = [];

        nodes.forEach((n) => {
            const b = n.absoluteBoundingBox;
            if (!b) return;
            const x = b.x - ox, y = b.y - oy;

            if (n.type === "TEXT" && n.characters) {
                const st = n.style || {};
                const size = st.fontSize || 10;
                texts.push({
                    text: n.characters,
                    x: round(x),
                    baseline: round(y + (st.lineHeightPx
                        ? (st.lineHeightPx + size * 0.716) / 2
                        : size * BASELINE_RATIO)),
                    width: b.width,
                    size: size,
                    weight: (st.fontWeight || 400) >= 600 ? "bold" : "normal",
                    family: familyToken(st.fontFamily || st.fontPostScriptName || ""),
                    color: solidFill(n) || "#000000",
                    name: n.name || ""
                });
                return;
            }
            if (n.type === "ELLIPSE") {
                discs.push({ x: round(x), y: round(y), w: b.width, h: b.height,
                             color: solidFill(n) });
                return;
            }
            const fill = solidFill(n);
            if (!fill) return;
            if (b.height <= RULE_MAX_HEIGHT && b.width > 20) {
                rules.push({ x: round(x), y: round(y), w: round(b.width), color: fill });
            } else if (b.height >= page.height * COLUMN_MIN_HEIGHT &&
                       b.width < page.width * 0.7) {
                panels.push({ x: round(x), w: round(b.width), color: fill });
            }
        });

        texts.sort((a, b) => a.baseline - b.baseline || a.x - b.x);

        const sidebar = panels.length ? pickSidebar(panels, page) : null;
        const styles = clusterStyles(texts, sidebar);

        return {
            page: page, sidebar: sidebar, rules: rules, discs: discs,
            texts: texts, styles: styles,
            frameName: frame.name || "Imported"
        };
    }

    function round(n) { return Math.round(n * 10) / 10; }

    function familyToken(name) {
        const f = String(name).toLowerCase();
        if (/times|georgia|garamond|playfair|serif|merriweather/.test(f)) return "serif";
        if (/courier|mono|consolas/.test(f)) return "mono";
        return "sans";
    }

    function pickSidebar(panels, page) {
        const p = panels.sort((a, b) => b.w - a.w)[0];
        return {
            side: p.x > page.width * 0.4 ? "right" : "left",
            x: p.x, width: p.w, background: p.color,
            fraction: Math.round((p.w / page.width) * 10000) / 10000
        };
    }

    function inSidebar(t, sidebar) {
        if (!sidebar) return false;
        return sidebar.side === "right" ? t.x >= sidebar.x - 2
                                        : t.x < sidebar.x + sidebar.width;
    }

    /* Distinct (family, weight, size, colour) combinations become candidate
       type roles. Reading them from the file is what makes an import
       trustworthy where structure inference is not. */
    function clusterStyles(texts, sidebar) {
        const map = {};
        texts.forEach((t) => {
            const side = inSidebar(t, sidebar) ? "s" : "m";
            const key = [side, t.family, t.weight, t.size, t.color].join("|");
            if (!map[key]) {
                map[key] = { side: side, family: t.family, weight: t.weight,
                             size: t.size, color: t.color, count: 0, samples: [] };
            }
            map[key].count += 1;
            if (map[key].samples.length < 3) map[key].samples.push(t.text.slice(0, 32));
        });

        const list = Object.keys(map).map((k) => map[k]);
        const main = list.filter((s) => s.side === "m").sort((a, b) => b.size - a.size);
        const side = list.filter((s) => s.side === "s").sort((a, b) => b.size - a.size);
        const bodyOf = (arr) => arr.slice().sort((a, b) => b.count - a.count)[0];

        const roles = {};
        const mainBody = bodyOf(main);
        const sideBody = bodyOf(side);

        if (main.length) {
            roles.displayName = main[0];
            const heads = main.filter((s) => s.weight === "bold" && s !== main[0] &&
                                             mainBody && s.size > mainBody.size);
            if (heads.length) roles.heading = heads[0];
            if (mainBody) roles.body = mainBody;
            const eh = main.filter((s) => s.weight === "bold" && mainBody &&
                                          Math.abs(s.size - mainBody.size) < 1.5)[0];
            if (eh) roles.entryHead = eh;
        }
        if (side.length) {
            const sh = side.filter((s) => s.weight === "bold" && sideBody &&
                                          s.size > sideBody.size)[0];
            if (sh) roles.sidebarHeading = sh;
            if (sideBody) roles.sidebarItem = sideBody;
        }
        return { roles: roles, all: list };
    }

    /* ----------------------------------------------------------------------
       Structure. Text sharing a baseline is one line of runs; a line whose
       style matches a heading role opens a section.
       ---------------------------------------------------------------------- */

    function groupLines(texts) {
        const lines = [];
        texts.forEach((t) => {
            const last = lines[lines.length - 1];
            if (last && Math.abs(last.baseline - t.baseline) <= BASELINE_EPSILON) {
                last.runs.push(t);
                last.runs.sort((a, b) => a.x - b.x);
            } else {
                lines.push({ baseline: t.baseline, runs: [t] });
            }
        });
        return lines;
    }

    function sameStyle(t, role) {
        return role && t.size === role.size && t.weight === role.weight &&
               t.color === role.color && t.family === role.family;
    }

    function toDescriptor(report, id) {
        const R = report.styles.roles;
        const sb = report.sidebar;
        const palette = {};
        const type = {};
        const unmapped = [];

        if (sb) palette.railBg = sb.background;
        Object.keys(R).forEach((k) => { palette[k + "Ink"] = R[k].color; });

        const mk = (r, extra) => Object.assign({
            family: r.family, weight: r.weight, size: r.size, color: r.color
        }, extra || {});

        if (R.displayName) type.displayName = mk(R.displayName,
            { lineHeight: Math.round(R.displayName.size * 0.92) });
        if (R.heading) type.heading = mk(R.heading,
            { uppercase: true, gapBefore: 36, gapAfter: 22,
              rule: { color: R.heading.color, width: 1, offset: 2 } });
        if (R.sidebarHeading) type.sidebarHeading = mk(R.sidebarHeading,
            { uppercase: true, gapBefore: 36, gapAfter: 22,
              rule: { color: R.sidebarHeading.color, width: 1, offset: 2 } });
        if (R.entryHead) type.entryHead = mk(R.entryHead);
        if (R.body) type.body = mk(R.body, { lineHeight: Math.round(R.body.size * 1.3) });
        if (R.body) type.entryMeta = mk(R.body, { color: R.entryHead ? R.entryHead.color : R.body.color });
        if (R.body) type.bullet = mk(R.body,
            { lineHeight: Math.round(R.body.size * 1.3), marker: "•", indent: 8, itemGap: 16 });
        if (R.sidebarItem) type.sidebarItem = mk(R.sidebarItem,
            { lineHeight: Math.round(R.sidebarItem.size * 1.3), marker: "•", indent: 8, itemGap: 13 });
        if (R.sidebarItem) type.sidebarContact = mk(R.sidebarItem,
            { lineHeight: Math.round(R.sidebarItem.size * 1.3), rowGap: 14 });

        /* Column geometry read from the panel and the leftmost text. */
        const mainTexts = report.texts.filter((t) => !inSidebar(t, sb));
        const sideTexts = report.texts.filter((t) => inSidebar(t, sb));
        const mainLeft = mainTexts.length ? Math.min.apply(null, mainTexts.map((t) => t.x)) : 35;
        const sideLeft = sideTexts.length ? Math.min.apply(null, sideTexts.map((t) => t.x)) : 0;

        const layout = { kind: sb ? "two-column" : "single-column" };
        if (sb) {
            layout.sidebar = {
                side: sb.side, width: sb.fraction, background: "railBg",
                left: round(sideLeft - sb.x), right: 29,
                firstBaseline: sideTexts.length ? sideTexts[0].baseline : 53,
                bottom: Math.round(report.page.height * 0.95)
            };
        }
        layout.main = {
            left: round(mainLeft),
            right: 20,
            firstBaseline: mainTexts.length ? mainTexts[0].baseline : 60,
            bottom: Math.round(report.page.height * 0.95)
        };

        /* Blocks. Headings are detected by style; everything between two
           headings becomes that section's body. Field mapping is heuristic
           and anything unresolved is reported rather than invented. */
        const blocks = [];
        [["main", mainTexts, R.heading], ["sidebar", sideTexts, R.sidebarHeading]]
            .forEach((pair) => {
                const col = pair[0], list = pair[1], headRole = pair[2];
                if (!list.length) return;
                const lines = groupLines(list);
                let current = null;

                lines.forEach((line, idx) => {
                    const first = line.runs[0];
                    if (col === "main" && idx === 0 && sameStyle(first, R.displayName)) {
                        blocks.push({ column: col, kind: "display", field: "name",
                                      type: "displayName", split: "firstWord",
                                      uppercase: /^[A-Z\s]+$/.test(first.text),
                                      fallback: "Your Name" });
                        return;
                    }
                    if (sameStyle(first, R.displayName)) return; /* 2nd name line */

                    if (headRole && sameStyle(first, headRole)) {
                        current = { column: col, kind: "section",
                                    label: titleCase(first.text),
                                    body: { kind: "lines", lines: [] } };
                        if (col === "sidebar") {
                            current.headingType = "sidebarHeading";
                            /* Without this the body falls back to the main
                               column's body role, painting rail text in the
                               main ink -- dark on dark, invisible. */
                            current.body.type = "sidebarItem";
                        }
                        blocks.push(current);
                        return;
                    }
                    const mapped = mapLine(line);
                    if (mapped.unmapped) unmapped.push(mapped.text);
                    if (current) current.body.lines.push(mapped);
                    else unmapped.push(first.text);
                });
            });

        return {
            descriptor: {
                id: id || "imported",
                title: report.frameName,
                page: report.page,
                layout: layout,
                palette: palette,
                type: type,
                blocks: blocks
            },
            unmapped: unmapped
        };
    }

    function titleCase(s) {
        return String(s).toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
    }

    /* Content heuristics. Deliberately conservative: a wrong field guess is
       worse than an honest "needs mapping", because a wrong guess renders
       plausibly and hides the error. */
    function mapLine(line) {
        const joined = line.runs.map((r) => r.text).join("");
        const t = joined.trim();
        if (/^[•\-•]/.test(t)) {
            return { kind: "bullet", text: t.replace(/^[•\-•]\s*/, "") };
        }
        if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(t)) return { kind: "field", field: "email", text: t };
        if (/^[+()\d][\d\s()+-]{6,}$/.test(t)) return { kind: "field", field: "phone", text: t };
        if (/\b\d{2}\/\d{4}\b|\b(19|20)\d{2}\s*[-–]\s*(19|20)\d{2}|current|present/i.test(t)) {
            return { kind: "runs", text: t, note: "date range detected" };
        }
        return { kind: "text", text: t, unmapped: true };
    }

    return {
        parseFileKey: parseFileKey,
        fetchFile: fetchFile,
        analyze: analyze,
        toDescriptor: toDescriptor,
        BASELINE_RATIO: BASELINE_RATIO
    };
})();