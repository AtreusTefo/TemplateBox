/* ==========================================================================
   TemplateBox - Poster & Canvas Creator Core Logic

   Responsibilities: strict client-side image mime-type validation, HTML5
   Canvas composition (photo, matte, frame, text elements), a linear undo/redo
   history, real-time localStorage retention, and a multi-format export matrix
   (PNG / JPG / PDF / SVG / PPTX) at named paper sizes.

   Depends on: js/app.js (TB.sanitize, TB.desanitize, TB.storageGet/Set,
   TB.markSaved). jsPDF is loaded by poster.html and used only for PDF.

   ARCHITECTURE NOTE. This replaced a three-field form (photo, one caption
   string, frame style) drawing a fixed 1200x1500 canvas. The single change
   that everything else here depends on is that the caption stopped being an
   <input> value read at draw time and became a list of text ELEMENTS, each
   carrying its own style object. One model is read by the canvas renderer AND
   by every export path, rather than each export re-deriving typography from
   the DOM -- which is what makes "what you see is what downloads" true across
   five formats instead of only the one the preview happens to use.
   ========================================================================== */

"use strict";

(() => {

    /* v1 was {caption, frame}. v2 adds the element list, paper size and doc
       name. The key is deliberately NOT bumped: a v1 record still loads (see
       migrate()), because bumping it would silently discard the saved work of
       every visitor mid-poster at deploy time. */
    const STORAGE_KEY = "tb_poster_v1";

    /* Named paper sizes in millimetres. The descriptions are shown in the
       download panel so the choice is about the job rather than the numbers. */
    const PAPER = {
        A4: { w: 210, h: 297, label: "A4", note: "Small art prints, certificates, desktop frames" },
        A3: { w: 297, h: 420, label: "A3", note: "Medium prints, small wall posters, gallery walls" },
        A2: { w: 420, h: 594, label: "A2", note: "Standard wall posters and hallways" },
        A1: { w: 594, h: 841, label: "A1", note: "Large feature wall art and statement prints" },
        A0: { w: 841, h: 1189, label: "A0", note: "Oversized promotional and exhibition posters" }
    };

    /* Export resolution. 300 DPI is the print standard, but A0 at 300 DPI is
       9933 x 14043 = 139 megapixels, which is roughly 558 MB of RGBA and fails
       on the canvas size limits of every browser well before it fails on
       memory. So the requested DPI is honoured until the long edge hits this
       cap, then the effective DPI is reduced and REPORTED -- the panel shows
       the pixel dimensions and the DPI actually used, never the one asked for.
       Quietly returning a smaller file than the label promises is the kind of
       thing this project treats as a defect, not a rounding detail. */
    const MAX_EXPORT_EDGE = 8000;
    const DEFAULT_DPI = 300;

    /* Preview resolution. Independent of export: the visible canvas only has
       to look right on screen, and rendering an A0 at export scale for every
       keystroke would make typing unusable. */
    const PREVIEW_LONG_EDGE = 1400;

    /* Curated to fonts that are actually available: the two the page already
       loads plus system faces. A dropdown offering a face the renderer would
       silently substitute is a lie the export makes visible. */
    const FONTS = [
        { id: "playfair", label: "Playfair Display", stack: '"Playfair Display", Georgia, serif' },
        { id: "inter", label: "Inter", stack: '"Inter", system-ui, sans-serif' },
        { id: "georgia", label: "Georgia", stack: 'Georgia, "Times New Roman", serif' },
        { id: "times", label: "Times New Roman", stack: '"Times New Roman", Times, serif' },
        { id: "arial", label: "Arial", stack: "Arial, Helvetica, sans-serif" },
        { id: "verdana", label: "Verdana", stack: "Verdana, Geneva, sans-serif" },
        { id: "trebuchet", label: "Trebuchet MS", stack: '"Trebuchet MS", Tahoma, sans-serif' },
        { id: "courier", label: "Courier New", stack: '"Courier New", Courier, monospace' },
        { id: "impact", label: "Impact", stack: "Impact, Haettenschweiler, sans-serif" }
    ];

    const FRAME_STYLES = {
        none: { frame: null, trim: null, label: "No frame" },
        black: { frame: "#111111", trim: "#111111", label: "Solid Black" },
        wood: { frame: "#7B5B3A", trim: "#5E4426", label: "Matte Wood" },
        gold: { frame: "#C9A227", trim: "#A5841C", label: "Polished Gold" }
    };

    /* Emoji picker inventory. Native Unicode only -- no image CDN, which would
       be a network dependency inside an editor whose whole proposition is that
       it runs with nothing leaving the device (CLAUDE.md Critical Rule 1). */
    const EMOJI = {
        Smileys: "😀 😃 😄 😁 😊 🙂 😉 😍 🥰 😘 🤩 🤗 🤔 😎 🥳 😇 🙃 😌 😢 😭 😡 🤯 😱 🥺",
        People: "👋 🙌 👏 🤝 💪 🙏 👍 👎 ✌️ 🤞 👀 🧠 👶 🧑 👩 👨 👵 👴 🕺 💃",
        Nature: "🌸 🌺 🌻 🌼 🌷 🌹 🍀 🌿 🌱 🌳 🌲 🌊 🔥 ⭐ 🌟 ✨ ⚡ 🌈 ☀️ 🌙 ❄️ 🍂",
        Food: "🍕 🍔 🍟 🌮 🍣 🍜 🍰 🎂 🍪 🍩 ☕ 🍺 🍷 🥂 🍾 🍎 🍓 🥑 🥐 🍫",
        Travel: "✈️ 🚗 🚕 🚌 🚲 🛵 🚀 🛳️ 🏖️ 🏔️ 🗺️ 🧳 🏕️ 🎡 🗽 🏰 ⛺ 🌍",
        Objects: "🎉 🎊 🎁 🎈 🏆 🥇 💎 💡 📷 🎧 🎸 🎬 📚 ✏️ 💼 🔑 ⏰ 💰 🛒 📌",
        Symbols: "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💖 💯 ✅ ❌ ⭕ ❗ ❓ ♻️ ⚠️ 🔴 🟢 🔵"
    };

    const canvas = document.getElementById("poster-canvas");
    if (!canvas) {
        return;
    }
    const ctx = canvas.getContext("2d");

    /* ----------------------------------------------------------------------
       State, history and persistence
       ---------------------------------------------------------------------- */

    /* The uploaded photo lives only in memory. Image data is intentionally
       never written to localStorage: a single phone photo as a data URL
       exhausts the ~5 MB quota on its own and would evict the text the
       visitor actually typed. */
    let photo = null;

    function defaultText(id, text) {
        return {
            id: id,
            text: text || "",
            /* Fractions of the canvas, not pixels: the same element has to
               land in the same visual place whether the document is A4 or A0
               and whether it is being drawn at preview or export scale. */
            x: 0.5,
            y: 0.88,
            boxW: 0.8,
            anchor: "box",
            font: "playfair",
            size: 0.043,
            bold: true,
            italic: true,
            underline: false,
            strike: false,
            upper: false,
            color: "#1A1A1A",
            align: "center",
            list: "none",
            letter: 0,
            line: 1.25,
            opacity: 1,
            ligatures: true
        };
    }

    let state = {
        name: "Untitled poster",
        size: "A3",
        frame: "black",
        texts: [defaultText("t1", "")],
        sel: "t1"
    };

    /* Linear command stack. Deliberately snapshot-based rather than diff or
       command-object based: the whole document is a few kilobytes of JSON, a
       single visitor in a single tab, and a snapshot cannot desynchronise from
       the model the way a hand-written inverse operation can. */
    const HISTORY_LIMIT = 60;
    let past = [];
    let future = [];

    function snapshot() {
        return JSON.stringify({ name: state.name, size: state.size, frame: state.frame, texts: state.texts });
    }

    function restore(json) {
        const parsed = JSON.parse(json);
        state.name = parsed.name;
        state.size = parsed.size;
        state.frame = parsed.frame;
        state.texts = parsed.texts;
        if (!state.texts.some((t) => t.id === state.sel)) {
            state.sel = state.texts.length ? state.texts[0].id : null;
        }
    }

    let pending = null;

    /* Commits a history entry. Text typing coalesces: one entry per burst
       rather than one per keystroke, or a single sentence would bury every
       earlier state past the limit and make undo useless. */
    function commit(coalesceKey) {
        const before = pending !== null ? pending : snapshot();
        pending = null;

        if (coalesceKey && past.length && past[past.length - 1].key === coalesceKey) {
            /* Same burst: leave the earlier entry as the restore point. */
        } else {
            past.push({ key: coalesceKey || null, json: before });
            if (past.length > HISTORY_LIMIT) {
                past.shift();
            }
        }
        future = [];
        afterChange();
    }

    /* Captures the pre-change state before a mutation runs. */
    function beginChange() {
        if (pending === null) {
            pending = snapshot();
        }
    }

    function undo() {
        if (!past.length) {
            return;
        }
        future.push(snapshot());
        restore(past.pop().json);
        afterChange();
        syncControls();
    }

    function redo() {
        if (!future.length) {
            return;
        }
        past.push({ key: null, json: snapshot() });
        restore(future.pop());
        afterChange();
        syncControls();
    }

    function afterChange() {
        persist();
        render();
        updateHistoryButtons();
    }

    function updateHistoryButtons() {
        const u = document.getElementById("act-undo");
        const r = document.getElementById("act-redo");
        if (u) { u.disabled = past.length === 0; }
        if (r) { r.disabled = future.length === 0; }
    }

    function persist() {
        const first = state.texts[0];
        TB.storageSet(STORAGE_KEY, {
            /* Top-level `caption` is retained for the homepage's
               continue-where-you-left-off strip, which reads exactly this key
               (summarizeSaved() in js/app.js). Dropping it would not fail
               anything loudly -- the strip would just quietly stop describing
               poster work, which is the class of silent regression this
               project has been bitten by before. */
            caption: TB.sanitize(first ? first.text : ""),
            frame: state.frame,
            name: TB.sanitize(state.name),
            size: state.size,
            texts: state.texts.map((t) => {
                const copy = Object.assign({}, t);
                copy.text = TB.sanitize(t.text);
                return copy;
            })
        });
        TB.markSaved();
    }

    function migrate(saved) {
        if (!saved || typeof saved !== "object") {
            return;
        }
        state.frame = FRAME_STYLES[saved.frame] ? saved.frame : "black";
        state.size = PAPER[saved.size] ? saved.size : "A3";
        state.name = TB.desanitize(String(saved.name || "")).trim() || "Untitled poster";

        if (Array.isArray(saved.texts) && saved.texts.length) {
            state.texts = saved.texts.map((t, i) => {
                const base = defaultText(String(t.id || "t" + (i + 1)), "");
                Object.keys(base).forEach((k) => {
                    if (t[k] !== undefined && t[k] !== null) {
                        base[k] = t[k];
                    }
                });
                base.text = TB.desanitize(String(t.text || ""));
                return base;
            });
        } else {
            /* v1 record: one caption string, no element list. */
            state.texts = [defaultText("t1", TB.desanitize(String(saved.caption || "")))];
        }
        state.sel = state.texts.length ? state.texts[0].id : null;
    }

    /* ----------------------------------------------------------------------
       Geometry
       ---------------------------------------------------------------------- */

    function paper() {
        return PAPER[state.size] || PAPER.A3;
    }

    function previewSize() {
        const p = paper();
        const ratio = p.w / p.h;
        return { w: Math.round(PREVIEW_LONG_EDGE * ratio), h: PREVIEW_LONG_EDGE };
    }

    /* Export dimensions for a requested DPI, clamped so the long edge never
       exceeds what a canvas can actually allocate. Returns the EFFECTIVE dpi
       so the UI can show what will really be produced. */
    function exportSize(dpi) {
        const p = paper();
        const want = dpi || DEFAULT_DPI;
        let w = Math.round(p.w / 25.4 * want);
        let h = Math.round(p.h / 25.4 * want);
        let eff = want;
        const longEdge = Math.max(w, h);
        if (longEdge > MAX_EXPORT_EDGE) {
            const k = MAX_EXPORT_EDGE / longEdge;
            w = Math.round(w * k);
            h = Math.round(h * k);
            eff = Math.round(want * k);
        }
        return { w: w, h: h, dpi: eff, clamped: eff !== want };
    }

    function fontStack(id) {
        const f = FONTS.find((x) => x.id === id);
        return f ? f.stack : FONTS[0].stack;
    }

    /* ----------------------------------------------------------------------
       Rendering. One function drives the on-screen canvas and every raster
       export, parameterised only by target size, so an export can never drift
       from the preview.
       ---------------------------------------------------------------------- */

    function drawCoverImage(c, img, x, y, w, h) {
        const scale = Math.max(w / img.width, h / img.height);
        const sw = w / scale;
        const sh = h / scale;
        const sx = (img.width - sw) / 2;
        const sy = (img.height - sh) / 2;
        c.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    }

    /* Splits a string into rendered lines, honouring explicit newlines and
       wrapping to the element's box when it is anchored rather than free. */
    function layoutLines(c, el, text, boxPx) {
        const hard = text.split("\n");
        if (el.anchor !== "box") {
            return hard;
        }
        const out = [];
        hard.forEach((para) => {
            const words = para.split(/\s+/).filter(Boolean);
            if (!words.length) {
                out.push("");
                return;
            }
            let line = words[0];
            for (let i = 1; i < words.length; i += 1) {
                const next = line + " " + words[i];
                if (c.measureText(next).width > boxPx && line) {
                    out.push(line);
                    line = words[i];
                } else {
                    line = next;
                }
            }
            out.push(line);
        });
        return out;
    }

    function applyTextStyle(c, el, W) {
        const px = el.size * W;
        const weight = el.bold ? "700" : "400";
        const style = el.italic ? "italic " : "";
        c.font = style + weight + " " + px + 'px ' + fontStack(el.font);
        c.textAlign = el.align;
        c.textBaseline = "alphabetic";
        c.fillStyle = el.color;
        c.globalAlpha = el.opacity;

        /* letterSpacing is supported on Canvas2D in current Chromium/WebKit
           and simply ignored elsewhere; there is no manual fallback here
           because per-character placement would break the alignment and
           wrapping above for a cosmetic control. */
        if ("letterSpacing" in c) {
            c.letterSpacing = (el.letter * px) + "px";
        }
        /* Canvas exposes no direct ligature switch. fontKerning is the real,
           observable lever, so the control is labelled for what it does
           ("Kerning and ligatures") rather than promising OpenType feature
           control the API cannot deliver. */
        if ("fontKerning" in c) {
            c.fontKerning = el.ligatures ? "normal" : "none";
        }
        return px;
    }

    function drawTextElement(c, el, W, H) {
        let text = el.text;
        if (!text) {
            return;
        }
        if (el.upper) {
            text = text.toUpperCase();
        }

        const px = applyTextStyle(c, el, W);
        const boxPx = el.boxW * W;
        let lines = layoutLines(c, el, text, boxPx);

        if (el.list !== "none") {
            lines = lines.map((l, i) => {
                if (!l) { return l; }
                return (el.list === "number" ? (i + 1) + ". " : "• ") + l;
            });
        }

        const lineH = px * el.line;
        const x = el.x * W;
        let y = el.y * H;

        lines.forEach((line, i) => {
            const ly = y + i * lineH;
            c.fillText(line, x, ly);

            if (el.underline || el.strike) {
                const wdt = c.measureText(line).width;
                let lx = x;
                if (el.align === "center") { lx = x - wdt / 2; }
                if (el.align === "right") { lx = x - wdt; }
                c.save();
                c.strokeStyle = el.color;
                c.lineWidth = Math.max(1, px * 0.05);
                if (el.underline) {
                    c.beginPath();
                    c.moveTo(lx, ly + px * 0.16);
                    c.lineTo(lx + wdt, ly + px * 0.16);
                    c.stroke();
                }
                if (el.strike) {
                    c.beginPath();
                    c.moveTo(lx, ly - px * 0.3);
                    c.lineTo(lx + wdt, ly - px * 0.3);
                    c.stroke();
                }
                c.restore();
            }
        });

        c.globalAlpha = 1;
        if ("letterSpacing" in c) { c.letterSpacing = "0px"; }
    }

    /* transparent=true skips the frame, matte and placeholder fills so a PNG
       exports with a genuinely empty background rather than a white one -- the
       toggle in the download panel does this and nothing else. */
    function paint(c, W, H, opts) {
        const options = opts || {};
        const frame = FRAME_STYLES[state.frame] || FRAME_STYLES.black;
        const scale = W / 1200;
        const FRAME_W = frame.frame ? 60 * scale : 0;
        const MATTE_W = frame.frame ? 50 * scale : 0;

        c.clearRect(0, 0, W, H);

        if (!options.transparent) {
            if (frame.frame) {
                c.fillStyle = frame.frame;
                c.fillRect(0, 0, W, H);
                c.strokeStyle = frame.trim;
                c.lineWidth = 6 * scale;
                c.strokeRect(FRAME_W - 14 * scale, FRAME_W - 14 * scale,
                    W - (FRAME_W - 14 * scale) * 2, H - (FRAME_W - 14 * scale) * 2);
            }
            c.fillStyle = "#FFFFFF";
            c.fillRect(FRAME_W, FRAME_W, W - FRAME_W * 2, H - FRAME_W * 2);
        }

        const px = FRAME_W + MATTE_W;
        const py = FRAME_W + MATTE_W;
        const pw = W - px * 2;
        const ph = H - py * 2 - (0.11 * H);

        if (photo) {
            drawCoverImage(c, photo, px, py, pw, ph);
        } else if (!options.transparent) {
            c.fillStyle = "#F4F3EF";
            c.fillRect(px, py, pw, ph);
            c.fillStyle = "#6B6B66";
            c.font = "400 " + (34 * scale) + 'px "Inter", sans-serif';
            c.textAlign = "center";
            c.textBaseline = "middle";
            c.fillText("Upload a photo to begin", W / 2, py + ph / 2);
        }

        state.texts.forEach((el) => drawTextElement(c, el, W, H));
    }

    function render() {
        const s = previewSize();
        if (canvas.width !== s.w || canvas.height !== s.h) {
            canvas.width = s.w;
            canvas.height = s.h;
        }
        paint(ctx, s.w, s.h);
        drawSelection();
    }

    /* Selection chrome is drawn on the preview only and is never part of an
       export -- paint() has no knowledge of it. */
    function drawSelection() {
        const el = selected();
        if (!el || !el.text) {
            return;
        }
        const W = canvas.width;
        const H = canvas.height;
        const px = applyTextStyle(ctx, el, W);
        ctx.globalAlpha = 1;
        const lines = layoutLines(ctx, el, el.upper ? el.text.toUpperCase() : el.text, el.boxW * W);
        let maxW = 0;
        lines.forEach((l) => { maxW = Math.max(maxW, ctx.measureText(l).width); });
        const h = lines.length * px * el.line;
        let x = el.x * W;
        if (el.align === "center") { x -= maxW / 2; }
        if (el.align === "right") { x -= maxW; }
        const y = el.y * H - px;

        ctx.save();
        ctx.strokeStyle = "#8A6A3B";
        ctx.lineWidth = Math.max(1.5, W * 0.002);
        ctx.setLineDash([W * 0.01, W * 0.008]);
        ctx.strokeRect(x - px * 0.2, y - px * 0.1, maxW + px * 0.4, h + px * 0.3);
        ctx.restore();
        if ("letterSpacing" in ctx) { ctx.letterSpacing = "0px"; }
    }

    function selected() {
        return state.texts.find((t) => t.id === state.sel) || null;
    }

    /* ----------------------------------------------------------------------
       Direct manipulation: click to select, drag to position
       ---------------------------------------------------------------------- */

    let dragging = null;

    function canvasPoint(ev) {
        const r = canvas.getBoundingClientRect();
        return {
            x: (ev.clientX - r.left) / r.width,
            y: (ev.clientY - r.top) / r.height
        };
    }

    function hitTest(pt) {
        const W = canvas.width;
        const H = canvas.height;
        for (let i = state.texts.length - 1; i >= 0; i -= 1) {
            const el = state.texts[i];
            if (!el.text) { continue; }
            const px = applyTextStyle(ctx, el, W);
            const lines = layoutLines(ctx, el, el.upper ? el.text.toUpperCase() : el.text, el.boxW * W);
            let maxW = 0;
            lines.forEach((l) => { maxW = Math.max(maxW, ctx.measureText(l).width); });
            const h = lines.length * px * el.line;
            let x = el.x * W;
            if (el.align === "center") { x -= maxW / 2; }
            if (el.align === "right") { x -= maxW; }
            const y = el.y * H - px;
            const inX = pt.x * W >= x - px * 0.3 && pt.x * W <= x + maxW + px * 0.3;
            const inY = pt.y * H >= y - px * 0.3 && pt.y * H <= y + h + px * 0.3;
            if (inX && inY) {
                return el;
            }
        }
        return null;
    }

    canvas.addEventListener("pointerdown", (ev) => {
        const pt = canvasPoint(ev);
        const hit = hitTest(pt);
        if (!hit) {
            return;
        }
        state.sel = hit.id;
        dragging = { id: hit.id, dx: pt.x - hit.x, dy: pt.y - hit.y, moved: false };
        canvas.setPointerCapture(ev.pointerId);
        syncControls();
        render();
    });

    canvas.addEventListener("pointermove", (ev) => {
        if (!dragging) {
            return;
        }
        const el = state.texts.find((t) => t.id === dragging.id);
        if (!el) { return; }
        if (!dragging.moved) {
            beginChange();
            dragging.moved = true;
        }
        const pt = canvasPoint(ev);
        el.x = Math.min(1, Math.max(0, pt.x - dragging.dx));
        el.y = Math.min(1, Math.max(0, pt.y - dragging.dy));
        render();
    });

    canvas.addEventListener("pointerup", (ev) => {
        if (dragging && dragging.moved) {
            commit();
        }
        dragging = null;
        try { canvas.releasePointerCapture(ev.pointerId); } catch (err) { /* not captured */ }
    });

    /* ----------------------------------------------------------------------
       Image upload with explicit mime-type validation. Execution terminates
       immediately when file.type does not match the image.* designation.
       ---------------------------------------------------------------------- */

    const fileInput = document.getElementById("p-image");
    const fileError = document.getElementById("p-image-error");

    if (fileInput) {
        fileInput.addEventListener("change", () => {
            fileError.textContent = "";
            const file = fileInput.files && fileInput.files[0];
            if (!file) {
                return;
            }
            if (!/^image\//.test(file.type)) {
                fileError.textContent = "That file is not an image. Please choose a JPG, PNG, or WebP file.";
                fileInput.value = "";
                photo = null;
                render();
                return;
            }
            const reader = new FileReader();
            reader.addEventListener("load", () => {
                const img = new Image();
                img.addEventListener("load", () => {
                    photo = img;
                    render();
                });
                img.addEventListener("error", () => {
                    fileError.textContent = "That image could not be decoded. Please try a different file.";
                    fileInput.value = "";
                });
                img.src = reader.result;
            });
            reader.readAsDataURL(file);
        });
    }

    /* ----------------------------------------------------------------------
       Control wiring
       ---------------------------------------------------------------------- */

    function byId(id) {
        return document.getElementById(id);
    }

    /* Binds one control to one property of the selected text element. */
    function bindText(id, prop, read, coalesce) {
        const el = byId(id);
        if (!el) {
            return;
        }
        const evName = el.type === "checkbox" || el.tagName === "SELECT" ? "change" : "input";
        el.addEventListener(evName, () => {
            const t = selected();
            if (!t) { return; }
            beginChange();
            t[prop] = read(el);
            commit(coalesce ? prop + ":" + t.id : null);
            render();
        });
    }

    function bindToggle(id, prop) {
        const el = byId(id);
        if (!el) {
            return;
        }
        el.addEventListener("click", () => {
            const t = selected();
            if (!t) { return; }
            beginChange();
            t[prop] = !t[prop];
            el.setAttribute("aria-pressed", String(t[prop]));
            commit();
            render();
        });
    }

    /* Pushes the selected element's state back into every control, so the
       toolbar always describes what is actually selected rather than the last
       thing that was typed into it. */
    function syncControls() {
        const t = selected();
        const bar = byId("text-toolbar");
        if (bar) {
            bar.hidden = !t;
        }
        if (!t) {
            return;
        }
        const set = (id, v) => { const e = byId(id); if (e) { e.value = v; } };
        const press = (id, v) => { const e = byId(id); if (e) { e.setAttribute("aria-pressed", String(v)); } };

        set("t-caption", t.text);
        set("t-font", t.font);
        set("t-size", Math.round(t.size * 1000));
        set("t-color", t.color);
        set("t-align", t.align);
        set("t-list", t.list);
        set("t-letter", t.letter);
        set("t-line", t.line);
        set("t-opacity", Math.round(t.opacity * 100));
        set("t-anchor", t.anchor);
        set("t-boxw", Math.round(t.boxW * 100));
        set("t-posx", Math.round(t.x * 100));
        set("t-posy", Math.round(t.y * 100));

        press("t-bold", t.bold);
        press("t-italic", t.italic);
        press("t-underline", t.underline);
        press("t-strike", t.strike);
        press("t-upper", t.upper);
        press("t-lig", t.ligatures);
    }

    bindText("t-caption", "text", (e) => e.value, true);
    bindText("t-font", "font", (e) => e.value);
    bindText("t-size", "size", (e) => Math.max(5, Number(e.value) || 43) / 1000, true);
    bindText("t-color", "color", (e) => e.value, true);
    bindText("t-align", "align", (e) => e.value);
    bindText("t-list", "list", (e) => e.value);
    bindText("t-letter", "letter", (e) => Number(e.value) || 0, true);
    bindText("t-line", "line", (e) => Number(e.value) || 1.25, true);
    bindText("t-opacity", "opacity", (e) => Math.min(100, Math.max(0, Number(e.value) || 100)) / 100, true);
    bindText("t-anchor", "anchor", (e) => e.value);
    bindText("t-boxw", "boxW", (e) => Math.min(100, Math.max(5, Number(e.value) || 80)) / 100, true);
    bindText("t-posx", "x", (e) => Math.min(100, Math.max(0, Number(e.value) || 50)) / 100, true);
    bindText("t-posy", "y", (e) => Math.min(100, Math.max(0, Number(e.value) || 88)) / 100, true);

    bindToggle("t-bold", "bold");
    bindToggle("t-italic", "italic");
    bindToggle("t-underline", "underline");
    bindToggle("t-strike", "strike");
    bindToggle("t-upper", "upper");
    bindToggle("t-lig", "ligatures");

    const frameSelect = byId("p-frame");
    if (frameSelect) {
        frameSelect.addEventListener("change", () => {
            beginChange();
            state.frame = FRAME_STYLES[frameSelect.value] ? frameSelect.value : "black";
            commit();
        });
    }

    const sizeSelect = byId("p-size");
    if (sizeSelect) {
        sizeSelect.addEventListener("change", () => {
            beginChange();
            state.size = PAPER[sizeSelect.value] ? sizeSelect.value : "A3";
            commit();
            render();
        });
    }

    const nameInput = byId("doc-name");
    if (nameInput) {
        nameInput.addEventListener("input", () => {
            beginChange();
            state.name = nameInput.value.slice(0, 80);
            commit("name");
        });
    }

    const addBtn = byId("t-add");
    if (addBtn) {
        addBtn.addEventListener("click", () => {
            beginChange();
            const id = "t" + (Date.now().toString(36));
            const el = defaultText(id, "New text");
            el.y = 0.2;
            el.bold = false;
            el.italic = false;
            state.texts.push(el);
            state.sel = id;
            commit();
            syncControls();
            render();
        });
    }

    const delBtn = byId("t-delete");
    if (delBtn) {
        delBtn.addEventListener("click", () => {
            if (state.texts.length <= 1) {
                return;
            }
            beginChange();
            state.texts = state.texts.filter((t) => t.id !== state.sel);
            state.sel = state.texts[0].id;
            commit();
            syncControls();
            render();
        });
    }

    const undoBtn = byId("act-undo");
    const redoBtn = byId("act-redo");
    if (undoBtn) { undoBtn.addEventListener("click", undo); }
    if (redoBtn) { redoBtn.addEventListener("click", redo); }

    document.addEventListener("keydown", (ev) => {
        const mod = ev.ctrlKey || ev.metaKey;
        if (!mod) {
            return;
        }
        const k = ev.key.toLowerCase();
        if (k === "z" && !ev.shiftKey) {
            ev.preventDefault();
            undo();
        } else if ((k === "z" && ev.shiftKey) || k === "y") {
            ev.preventDefault();
            redo();
        }
    });

    /* ----------------------------------------------------------------------
       Emoji picker. Inserts at the caret of the caption field rather than
       appending, so it behaves like typing.
       ---------------------------------------------------------------------- */

    function initEmoji() {
        const host = byId("emoji-grid");
        const toggle = byId("emoji-toggle");
        const panel = byId("emoji-panel");
        if (!host || !toggle || !panel) {
            return;
        }

        Object.keys(EMOJI).forEach((group) => {
            const h = document.createElement("h4");
            h.textContent = group;
            host.appendChild(h);
            const row = document.createElement("div");
            row.className = "emoji-row";
            EMOJI[group].split(/\s+/).filter(Boolean).forEach((ch) => {
                const b = document.createElement("button");
                b.type = "button";
                /* textContent, never innerHTML -- the same discipline the rest
                   of the project applies to anything reaching the DOM. */
                b.textContent = ch;
                b.setAttribute("aria-label", "Insert " + ch);
                b.addEventListener("click", () => insertEmoji(ch));
                row.appendChild(b);
            });
            host.appendChild(row);
        });

        toggle.addEventListener("click", () => {
            const open = panel.hidden;
            panel.hidden = !open;
            toggle.setAttribute("aria-expanded", String(open));
        });

        document.addEventListener("click", (ev) => {
            if (panel.hidden) { return; }
            if (panel.contains(ev.target) || toggle.contains(ev.target)) { return; }
            panel.hidden = true;
            toggle.setAttribute("aria-expanded", "false");
        });
    }

    function insertEmoji(ch) {
        const t = selected();
        const field = byId("t-caption");
        if (!t || !field) {
            return;
        }
        const start = field.selectionStart === null ? field.value.length : field.selectionStart;
        const end = field.selectionEnd === null ? field.value.length : field.selectionEnd;
        beginChange();
        t.text = field.value.slice(0, start) + ch + field.value.slice(end);
        field.value = t.text;
        const caret = start + ch.length;
        field.setSelectionRange(caret, caret);
        field.focus();
        commit();
        render();
    }

    /* ----------------------------------------------------------------------
       Export
       ---------------------------------------------------------------------- */

    function renderTo(w, h, opts) {
        const off = document.createElement("canvas");
        off.width = w;
        off.height = h;
        paint(off.getContext("2d"), w, h, opts);
        return off;
    }

    function fileName(ext) {
        const base = (state.name || "poster").replace(/[^\w\d -]+/g, "").trim().replace(/\s+/g, "-").toLowerCase();
        return (base || "templatebox-poster") + "." + ext;
    }

    function downloadBlob(blob, name) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
    }

    function dataUrlToBlob(url) {
        const parts = url.split(",");
        const mime = parts[0].match(/:(.*?);/)[1];
        const bin = atob(parts[1]);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) {
            arr[i] = bin.charCodeAt(i);
        }
        return new Blob([arr], { type: mime });
    }

    function readOpts() {
        const get = (id) => byId(id);
        const val = (id, d) => { const e = get(id); return e ? e.value : d; };
        const on = (id) => { const e = get(id); return !!(e && e.checked); };
        return {
            type: val("dl-type", "png"),
            dpi: Number(val("dl-dpi", DEFAULT_DPI)) || DEFAULT_DPI,
            jpgQuality: val("dl-jpg-quality", "high"),
            pngQuality: val("dl-png-quality", "high"),
            transparent: on("dl-transparent"),
            pdfPreset: val("dl-pdf-preset", "digital"),
            colorProfile: val("dl-pdf-profile", "rgb"),
            compress: on("dl-pdf-compress"),
            cropMarks: on("dl-pdf-crop"),
            flatten: on("dl-pdf-flatten"),
            notes: on("dl-pdf-notes"),
            password: val("dl-pdf-password", "")
        };
    }

    function exportPNG(o) {
        const s = exportSize(o.dpi);
        const c = renderTo(s.w, s.h, { transparent: o.transparent });
        /* PNG is lossless, so "quality" cannot mean JPEG-style compression.
           It maps to output scale instead, and the panel says so rather than
           implying a quality slider the format does not have. */
        const scale = o.pngQuality === "compress" ? 0.6 : (o.pngQuality === "limit" ? 0.8 : 1);
        const out = scale === 1 ? c : (() => {
            const d = document.createElement("canvas");
            d.width = Math.round(s.w * scale);
            d.height = Math.round(s.h * scale);
            d.getContext("2d").drawImage(c, 0, 0, d.width, d.height);
            return d;
        })();
        downloadBlob(dataUrlToBlob(out.toDataURL("image/png")), fileName("png"));
    }

    function exportJPG(o) {
        const s = exportSize(o.dpi);
        /* JPEG has no alpha, so a transparent request would flatten to black.
           Paint the opaque background regardless and let the panel hide the
           transparency toggle for this format. */
        const c = renderTo(s.w, s.h, { transparent: false });
        const q = o.jpgQuality === "low" ? 0.5 : (o.jpgQuality === "medium" ? 0.75 : 0.92);
        downloadBlob(dataUrlToBlob(c.toDataURL("image/jpeg", q)), fileName("jpg"));
    }

    /* RGB -> CMYK, naive and declared as such. jsPDF has no colour-management
       pipeline and no ICC profile handling, so this is a numeric conversion,
       not a colorimetric separation: it will not match a press proof. The
       control is offered because the device-CMYK tag is genuinely written into
       the PDF and some print shops require it, and the panel says exactly this
       rather than implying press accuracy. */
    function rgbToCmyk(hex) {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        const k = 1 - Math.max(r, g, b);
        if (k === 1) {
            return [0, 0, 0, 100];
        }
        return [
            Math.round((1 - r - k) / (1 - k) * 100),
            Math.round((1 - g - k) / (1 - k) * 100),
            Math.round((1 - b - k) / (1 - k) * 100),
            Math.round(k * 100)
        ];
    }

    function exportPDF(o) {
        const ctor = window.jspdf && window.jspdf.jsPDF;
        if (!ctor) {
            window.alert("The PDF engine did not load. Check your connection and try again.");
            return;
        }
        const p = paper();
        const isPrint = o.pdfPreset === "print";
        const bleed = isPrint && o.cropMarks ? 3 : 0;
        const opts = { orientation: p.w > p.h ? "l" : "p", unit: "mm", format: [p.w + bleed * 2, p.h + bleed * 2] };
        if (o.password) {
            opts.encryption = { userPassword: o.password, ownerPassword: o.password };
        }
        const doc = new ctor(opts);

        /* The artwork is a raster composite (it contains an uploaded photo),
           so it is placed as an image -- but the TEXT is then drawn again on
           top with doc.text(), the native vector text API. That is the
           project's standing rule (see RESUME_PDF_RASTERIZED_TEXT_FIX.md): the
           output carries real text operators, so it stays selectable and
           searchable instead of being a flat picture of words. */
        const s = exportSize(Math.min(o.dpi, 200));
        const art = renderTo(s.w, s.h, { transparent: false, textless: false });
        doc.addImage(art.toDataURL("image/jpeg", o.compress ? 0.7 : 0.95),
            "JPEG", bleed, bleed, p.w, p.h, undefined, o.compress ? "FAST" : "SLOW");

        if (!o.flatten) {
            state.texts.forEach((el) => {
                if (!el.text) { return; }
                const sizePt = el.size * p.w * 2.8346;
                doc.setFontSize(sizePt);
                const serif = el.font === "playfair" || el.font === "georgia" || el.font === "times";
                doc.setFont(serif ? "times" : (el.font === "courier" ? "courier" : "helvetica"),
                    el.bold && el.italic ? "bolditalic" : (el.bold ? "bold" : (el.italic ? "italic" : "normal")));
                if (o.colorProfile === "cmyk") {
                    const c = rgbToCmyk(el.color);
                    doc.setTextColor(c[0], c[1], c[2], c[3]);
                } else {
                    doc.setTextColor(el.color);
                }
                const txt = el.upper ? el.text.toUpperCase() : el.text;
                doc.text(txt, bleed + el.x * p.w, bleed + el.y * p.h, {
                    align: el.align,
                    maxWidth: el.anchor === "box" ? el.boxW * p.w : undefined
                });
            });
        }

        if (isPrint && o.cropMarks) {
            doc.setDrawColor(0);
            doc.setLineWidth(0.25);
            const m = bleed;
            const W = p.w + bleed * 2;
            const H = p.h + bleed * 2;
            [[m, 0, m, m], [0, m, m, m],
             [W - m, 0, W - m, m], [W, m, W - m, m],
             [m, H, m, H - m], [0, H - m, m, H - m],
             [W - m, H, W - m, H - m], [W, H - m, W - m, H - m]
            ].forEach((l) => doc.line(l[0], l[1], l[2], l[3]));
        }

        if (o.notes) {
            doc.setProperties({ title: state.name, subject: "TemplateBox poster", creator: "TemplateBox" });
        }

        doc.save(fileName("pdf"));
    }

    /* SVG: genuinely vector text over an embedded raster photo. The photo
       cannot become vector, but the type does not have to be rasterised with
       it, which is the whole reason to offer this format. */
    function exportSVG() {
        const p = paper();
        const W = p.w;
        const H = p.h;
        const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

        let body = "";
        const frame = FRAME_STYLES[state.frame] || FRAME_STYLES.black;
        if (frame.frame) {
            body += '<rect width="' + W + '" height="' + H + '" fill="' + frame.frame + '"/>';
        }
        const fw = frame.frame ? W * 0.05 : 0;
        body += '<rect x="' + fw + '" y="' + fw + '" width="' + (W - fw * 2) +
            '" height="' + (H - fw * 2) + '" fill="#FFFFFF"/>';

        if (photo) {
            const c = document.createElement("canvas");
            c.width = photo.width;
            c.height = photo.height;
            c.getContext("2d").drawImage(photo, 0, 0);
            const mw = fw + W * 0.042;
            body += '<image x="' + mw + '" y="' + mw + '" width="' + (W - mw * 2) +
                '" height="' + (H - mw * 2 - H * 0.11) +
                '" preserveAspectRatio="xMidYMid slice" href="' + c.toDataURL("image/jpeg", 0.92) + '"/>';
        }

        state.texts.forEach((el) => {
            if (!el.text) { return; }
            const txt = el.upper ? el.text.toUpperCase() : el.text;
            const anchor = el.align === "center" ? "middle" : (el.align === "right" ? "end" : "start");
            const decoration = [el.underline ? "underline" : "", el.strike ? "line-through" : ""]
                .filter(Boolean).join(" ");
            body += '<text x="' + (el.x * W) + '" y="' + (el.y * H) +
                '" font-family="' + esc(fontStack(el.font).replace(/"/g, "'")) + '"' +
                ' font-size="' + (el.size * W) + '"' +
                ' font-weight="' + (el.bold ? 700 : 400) + '"' +
                ' font-style="' + (el.italic ? "italic" : "normal") + '"' +
                ' fill="' + el.color + '" fill-opacity="' + el.opacity + '"' +
                ' text-anchor="' + anchor + '"' +
                ' letter-spacing="' + (el.letter * el.size * W) + '"' +
                (decoration ? ' text-decoration="' + decoration + '"' : "") +
                '>' + esc(txt) + '</text>';
        });

        const svg = '<svg xmlns="http://www.w3.org/2000/svg" ' +
            'xmlns:xlink="http://www.w3.org/1999/xlink" width="' + W + 'mm" height="' + H +
            'mm" viewBox="0 0 ' + W + " " + H + '">' + body + "</svg>";
        downloadBlob(new Blob([svg], { type: "image/svg+xml" }), fileName("svg"));
    }

    /* ------------------------------------------------------------------
       Minimal store-only ZIP writer, for PPTX.

       A .pptx is an OOXML package: a ZIP of XML parts. There is no server to
       build one and no bundler here, so rather than vendor a general ZIP
       library for a single use, this writes the archive directly with the
       STORE method (no compression). That keeps it to a CRC32 table and two
       record layouts, and a store-only archive is a fully valid ZIP that
       PowerPoint opens normally -- the cost is file size, which for a
       one-slide deck holding one JPEG is dominated by the image either way.
       ------------------------------------------------------------------ */

    const CRC_TABLE = (() => {
        const t = new Uint32Array(256);
        for (let n = 0; n < 256; n += 1) {
            let c = n;
            for (let k = 0; k < 8; k += 1) {
                c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
            }
            t[n] = c >>> 0;
        }
        return t;
    })();

    function crc32(bytes) {
        let c = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i += 1) {
            c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
        }
        return (c ^ 0xFFFFFFFF) >>> 0;
    }

    function zip(files) {
        const enc = new TextEncoder();
        const chunks = [];
        const central = [];
        let offset = 0;

        const u16 = (n) => [n & 0xFF, (n >>> 8) & 0xFF];
        const u32 = (n) => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];

        files.forEach((f) => {
            const nameBytes = enc.encode(f.name);
            const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
            const sum = crc32(data);

            const local = [].concat(
                u32(0x04034B50), u16(20), u16(0), u16(0), u16(0), u16(0),
                u32(sum), u32(data.length), u32(data.length),
                u16(nameBytes.length), u16(0)
            );
            chunks.push(new Uint8Array(local), nameBytes, data);

            central.push([].concat(
                u32(0x02014B50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
                u32(sum), u32(data.length), u32(data.length),
                u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0),
                u32(offset)
            ).concat(Array.from(nameBytes)));

            offset += local.length + nameBytes.length + data.length;
        });

        const centralBytes = [];
        central.forEach((c) => c.forEach((b) => centralBytes.push(b)));
        const end = [].concat(
            u32(0x06054B50), u16(0), u16(0), u16(files.length), u16(files.length),
            u32(centralBytes.length), u32(offset), u16(0)
        );

        return new Blob(chunks.concat([new Uint8Array(centralBytes), new Uint8Array(end)]),
            { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
    }

    function exportPPTX(o) {
        const p = paper();
        /* OOXML measures in EMU: 914400 per inch. */
        const emuW = Math.round(p.w / 25.4 * 914400);
        const emuH = Math.round(p.h / 25.4 * 914400);
        const s = exportSize(Math.min(o.dpi, 150));
        const jpg = renderTo(s.w, s.h, { transparent: false }).toDataURL("image/jpeg", 0.9);
        const bin = atob(jpg.split(",")[1]);
        const img = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) {
            img[i] = bin.charCodeAt(i);
        }

        const x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
        const files = [
            { name: "[Content_Types].xml", data: x +
                '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
                '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
                '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
                '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
                '<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>' +
                '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
                '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
                '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
                "</Types>" },
            { name: "_rels/.rels", data: x +
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>' +
                "</Relationships>" },
            { name: "ppt/presentation.xml", data: x +
                '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
                'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
                'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
                '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
                '<p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>' +
                '<p:sldSz cx="' + emuW + '" cy="' + emuH + '"/>' +
                '<p:notesSz cx="' + emuW + '" cy="' + emuH + '"/></p:presentation>' },
            { name: "ppt/_rels/presentation.xml.rels", data: x +
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>' +
                '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>' +
                '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>' +
                "</Relationships>" },
            { name: "ppt/slides/slide1.xml", data: x +
                '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
                'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
                'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
                "<p:cSld><p:spTree>" +
                '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
                "<p:grpSpPr/>" +
                '<p:pic><p:nvPicPr><p:cNvPr id="2" name="Poster"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>' +
                '<p:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>' +
                '<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + emuW + '" cy="' + emuH + '"/></a:xfrm>' +
                '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>' +
                "</p:spTree></p:cSld><p:clrMapOvr><a:overrideClrMapping bg1=\"lt1\" tx1=\"dk1\" bg2=\"lt2\" tx2=\"dk2\" accent1=\"accent1\" accent2=\"accent2\" accent3=\"accent3\" accent4=\"accent4\" accent5=\"accent5\" accent6=\"accent6\" hlink=\"hlink\" folHlink=\"folHlink\"/></p:clrMapOvr></p:sld>" },
            { name: "ppt/slides/_rels/slide1.xml.rels", data: x +
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.jpeg"/>' +
                "</Relationships>" },
            { name: "ppt/media/image1.jpeg", data: img },
            { name: "ppt/slideMasters/slideMaster1.xml", data: x +
                '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
                'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
                'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
                '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
                "<p:grpSpPr/></p:spTree></p:cSld>" +
                "<p:clrMap bg1=\"lt1\" tx1=\"dk1\" bg2=\"lt2\" tx2=\"dk2\" accent1=\"accent1\" accent2=\"accent2\" accent3=\"accent3\" accent4=\"accent4\" accent5=\"accent5\" accent6=\"accent6\" hlink=\"hlink\" folHlink=\"folHlink\"/>" +
                '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>' },
            { name: "ppt/slideMasters/_rels/slideMaster1.xml.rels", data: x +
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' +
                '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>' +
                "</Relationships>" },
            { name: "ppt/slideLayouts/slideLayout1.xml", data: x +
                '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
                'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
                'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank">' +
                '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
                "<p:grpSpPr/></p:spTree></p:cSld></p:sldLayout>" },
            { name: "ppt/slideLayouts/_rels/slideLayout1.xml.rels", data: x +
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>' +
                "</Relationships>" },
            { name: "ppt/theme/theme1.xml", data: x +
                '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="TemplateBox">' +
                "<a:themeElements><a:clrScheme name=\"TB\">" +
                '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>' +
                '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
                '<a:dk2><a:srgbClr val="1A1A1A"/></a:dk2><a:lt2><a:srgbClr val="F4F3EF"/></a:lt2>' +
                '<a:accent1><a:srgbClr val="8A6A3B"/></a:accent1><a:accent2><a:srgbClr val="C9A227"/></a:accent2>' +
                '<a:accent3><a:srgbClr val="7B5B3A"/></a:accent3><a:accent4><a:srgbClr val="111111"/></a:accent4>' +
                '<a:accent5><a:srgbClr val="6B6B66"/></a:accent5><a:accent6><a:srgbClr val="5E4426"/></a:accent6>' +
                '<a:hlink><a:srgbClr val="8A6A3B"/></a:hlink><a:folHlink><a:srgbClr val="5E4426"/></a:folHlink>' +
                "</a:clrScheme>" +
                '<a:fontScheme name="TB"><a:majorFont><a:latin typeface="Georgia"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
                '<a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
                "<a:fmtScheme name=\"TB\"><a:fillStyleLst><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill>" +
                '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>' +
                '<a:lnStyleLst><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>' +
                '<a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>' +
                '<a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>' +
                "<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle>" +
                "<a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>" +
                '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
                '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>' +
                "</a:fmtScheme></a:themeElements></a:theme>" }
        ];

        downloadBlob(zip(files), fileName("pptx"));
    }

    function runExport() {
        const o = readOpts();
        try {
            if (o.type === "png") { exportPNG(o); }
            else if (o.type === "jpg") { exportJPG(o); }
            else if (o.type === "pdf") { exportPDF(o); }
            else if (o.type === "svg") { exportSVG(o); }
            else if (o.type === "pptx") { exportPPTX(o); }
        } catch (err) {
            window.alert("That export could not be completed. Try a smaller paper size or a different format.");
        }
    }

    /* ----------------------------------------------------------------------
       Download panel
       ---------------------------------------------------------------------- */

    function initDownload() {
        const toggle = byId("dl-toggle");
        const panel = byId("dl-panel");
        const type = byId("dl-type");
        if (!toggle || !panel || !type) {
            return;
        }

        const setOpen = (open) => {
            panel.hidden = !open;
            toggle.setAttribute("aria-expanded", String(open));
        };

        toggle.addEventListener("click", () => setOpen(panel.hidden));
        document.addEventListener("click", (ev) => {
            if (panel.hidden) { return; }
            if (panel.contains(ev.target) || toggle.contains(ev.target)) { return; }
            setOpen(false);
        });
        document.addEventListener("keydown", (ev) => {
            if (ev.key === "Escape" && !panel.hidden) {
                setOpen(false);
                toggle.focus();
            }
        });

        type.addEventListener("change", syncPanel);
        const dpi = byId("dl-dpi");
        const size = byId("p-size");
        if (dpi) { dpi.addEventListener("change", syncPanel); }
        if (size) { size.addEventListener("change", syncPanel); }
        ["dl-pdf-preset"].forEach((id) => {
            const e = byId(id);
            if (e) { e.addEventListener("change", syncPanel); }
        });

        const go = byId("dl-go");
        if (go) {
            go.addEventListener("click", () => {
                runExport();
                setOpen(false);
            });
        }
        syncPanel();
    }

    /* Shows only the options the selected format actually has, and states the
       real output dimensions rather than leaving the paper size abstract. */
    function syncPanel() {
        const type = byId("dl-type");
        if (!type) {
            return;
        }
        const t = type.value;
        const show = (id, on) => {
            const e = byId(id);
            if (e) { e.hidden = !on; }
        };
        const raster = t === "png" || t === "jpg";
        show("dl-group-size", raster || t === "pdf" || t === "pptx");
        show("dl-group-jpg", t === "jpg");
        show("dl-group-png", t === "png");
        show("dl-group-pdf", t === "pdf");

        const preset = byId("dl-pdf-preset");
        const isPrint = preset && preset.value === "print";
        show("dl-group-pdf-print", t === "pdf" && isPrint);

        const out = byId("dl-dimensions");
        if (out) {
            const dpiEl = byId("dl-dpi");
            const s = exportSize(Number(dpiEl ? dpiEl.value : DEFAULT_DPI) || DEFAULT_DPI);
            const p = paper();
            out.textContent = p.w + " x " + p.h + " mm  |  " + s.w + " x " + s.h + " px at " +
                s.dpi + " DPI" + (s.clamped ? " (reduced from the requested DPI to stay within browser canvas limits)" : "");
        }
    }

    /* ----------------------------------------------------------------------
       Initialization
       ---------------------------------------------------------------------- */

    function buildSelects() {
        const font = byId("t-font");
        if (font && !font.options.length) {
            FONTS.forEach((f) => {
                const o = document.createElement("option");
                o.value = f.id;
                o.textContent = f.label;
                font.appendChild(o);
            });
        }
        const size = byId("p-size");
        if (size && !size.options.length) {
            Object.keys(PAPER).forEach((k) => {
                const o = document.createElement("option");
                o.value = k;
                o.textContent = PAPER[k].label + " - " + PAPER[k].w + " x " + PAPER[k].h + " mm";
                size.appendChild(o);
            });
        }
        const frame = byId("p-frame");
        if (frame && !frame.options.length) {
            Object.keys(FRAME_STYLES).forEach((k) => {
                const o = document.createElement("option");
                o.value = k;
                o.textContent = FRAME_STYLES[k].label;
                frame.appendChild(o);
            });
        }
    }

    buildSelects();
    migrate(TB.storageGet(STORAGE_KEY));

    if (frameSelect) { frameSelect.value = state.frame; }
    if (sizeSelect) { sizeSelect.value = state.size; }
    if (nameInput) { nameInput.value = state.name; }

    initEmoji();
    initDownload();
    syncControls();
    updateHistoryButtons();
    render();

    /* A second paint once the display fonts finish loading, so the caption
       renders in Playfair Display rather than the fallback serif. */
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(render);
    }
})();
