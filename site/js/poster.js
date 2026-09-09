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
        gold: { frame: "#C9A227", trim: "#A5841C", label: "Polished Gold" },
        /* Not a frame in the sense the other four are: it replaces the whole
           page layout rather than wrapping the photo panel, so paint() branches
           on `layout` before it reads `frame` or `trim`. It lives in this map
           anyway because the frame select is built from these keys and migrate()
           validates the saved style against them, so a fifth entry needs no new
           control, no new persisted field and no migration step. */
        hearts: {
            frame: null, trim: null, label: "Queen and King of Hearts",
            layout: "card", suit: "hearts", ranks: { head: "Q", foot: "K" }
        },
        /* The other three suits cost a pip path, an ink and a default pairing
           each -- no second renderer, which is the return on having made the
           first one a layout rather than a special case.

           The red suits lead with the queen and the black with the king. That
           is arbitrary, but it is the pattern the first two shipped with, and
           it gives the four catalog cards four different titles rather than
           the same one in four colours. The pairing is only a starting point:
           both corners are editable on every one of them. */
        spades: {
            frame: null, trim: null, label: "King and Queen of Spades",
            layout: "card", suit: "spades", ranks: { head: "K", foot: "Q" }
        },
        diamonds: {
            frame: null, trim: null, label: "Queen and King of Diamonds",
            layout: "card", suit: "diamonds", ranks: { head: "Q", foot: "K" }
        },
        clubs: {
            frame: null, trim: null, label: "King and Queen of Clubs",
            layout: "card", suit: "clubs", ranks: { head: "K", foot: "Q" }
        }
    };

    /* Geometry for the card layout, traced from the supplied A4 artwork
       (595.3 x 841.9 pt) and stored as fractions of the page rather than
       points, so one set of numbers serves every paper size and both the
       preview and the export scale -- the same reason text elements are
       fractional.

       The artwork's two corner indices are not exact mirrors of each other:
       the top margin above the Q is 120.4pt against 117.5pt below the K, which
       reads as hand placement rather than intent. This draws the bottom-right
       index as a true mirror of the top-left one; the 2.9pt difference is a
       third of a millimetre on A4. */
    const CARD = {
        panel: { x: 74.5 / 595.3, y: 59.1 / 841.9, w: 446.3 / 595.3, h: 724.5 / 841.9 },
        rule: 4 / 595.3,
        pip: { x: 11 / 595.3, y: 120.4 / 841.9, w: 55.6 / 595.3, h: 50.9 / 841.9 },
        /* The artwork sets its rank at 83.6676pt in Algerian. Playfair Display,
           the face substituted for it, is about 18 per cent wider at the same
           em -- enough that a Q ends 2.8pt PAST the panel edge and a K clears
           it by 3.8pt against the pip's 7.9pt. So the substituted face is set
           at the em that puts its Q on the pip's right edge, which is where
           the artwork puts its own: 70.1pt. Carrying the artwork's number over
           unchanged is what put the letters into the photograph. */
        rank: { x: 10.99 / 595.3, baseline: 94.55 / 841.9, size: 70.1 / 595.3 },
        red: "#BE1E2D",
        ink: "#000000"
    };

    /* The suit pip, the artwork's own bezier path normalised to a unit box so
       it can be placed at any size. One string feeds both renderers -- Path2D
       parses it for the canvas and the SVG export emits it verbatim under a
       transform -- so an edit to the shape cannot land in one export format
       and silently miss the other. */
    const HEART_PATH = "M0.5,0.1611C0.4478,0.0668 0.3615,0.002 0.259,0.002" +
        "C0.1133,0.002 0,0.1238 0,0.2849C0,0.5953 0.1547,0.6425 0.5,1" +
        "C0.8453,0.6405 1,0.5934 1,0.2829C1,0.1238 0.8885,0 0.741,0" +
        "C0.6385,0 0.5522,0.0668 0.5,0.1611Z";

    /* The spade has no artwork to trace, so it is drawn to the heart's own
       proportions: same unit box, apex on the centre line, lobes reaching the
       full width, and a stem whose flare ends on the baseline. Drawn point-UP,
       which is the orientation the heart's mirror gives it for free -- the
       flipped index turns both suits over together, so nothing about the
       bottom-right corner needs to know which suit it is drawing. */
    const SPADE_PATH = "M0.5,0C0.5,0.18 0.3,0.28 0.15,0.42" +
        "C0.02,0.54 0,0.63 0,0.7C0,0.8 0.07,0.86 0.17,0.86" +
        "C0.27,0.86 0.35,0.81 0.42,0.73C0.42,0.8 0.39,0.92 0.32,1" +
        "L0.68,1C0.61,0.92 0.58,0.8 0.58,0.73" +
        "C0.65,0.81 0.73,0.86 0.83,0.86C0.93,0.86 1,0.8 1,0.7" +
        "C1,0.63 0.98,0.54 0.85,0.42C0.7,0.28 0.5,0.18 0.5,0Z";

    /* The diamond is the one pip that is symmetric about BOTH axes, so the
       mirrored corner turns it into itself and the flip is invisible on it.
       Inset horizontally rather than filling the box, because the pip box is
       wider than it is tall (the heart's own bbox) and a diamond drawn to the
       full width reads as a lozenge. */
    const DIAMOND_PATH = "M0.5,0L0.85,0.5L0.5,1L0.15,0.5Z";

    /* The club is four subpaths -- three lobes and a stem -- rather than one
       traced outline, which is the only thing here that needs care: canvas and
       SVG both fill with the NONZERO rule, so the stem has to wind the same way
       as the lobes or the overlap cancels and leaves a hole where the stem
       meets them. Drawn the other way round it does exactly that, which is
       visible immediately and was checked before this was written down.

       The lobes overlap on purpose: at r=0.235 with centres 0.315 apart the
       top lobe reaches both lower ones, so the union is a single shape. Pull
       them apart and the trefoil separates into three circles. */
    const CLUB_PATH = "M0.265,0.235a0.235,0.235 0 1,0 0.47,0a0.235,0.235 0 1,0 -0.47,0Z" +
        "M0.015,0.55a0.235,0.235 0 1,0 0.47,0a0.235,0.235 0 1,0 -0.47,0Z" +
        "M0.515,0.55a0.235,0.235 0 1,0 0.47,0a0.235,0.235 0 1,0 -0.47,0Z" +
        "M0.44,0.35C0.44,0.7 0.4,0.9 0.31,1L0.69,1C0.6,0.9 0.56,0.7 0.56,0.35Z";

    /* Suit = a pip path plus the ink it is filled with. Everything else about
       the layout is shared, so a suit costs two lines here and one entry in
       FRAME_STYLES. The Path2D is built once per suit rather than per paint:
       paint() runs on every keystroke. */
    const SUITS = {
        hearts: { path: HEART_PATH, ink: "#BE1E2D" },
        spades: { path: SPADE_PATH, ink: "#000000" },
        diamonds: { path: DIAMOND_PATH, ink: "#BE1E2D" },
        clubs: { path: CLUB_PATH, ink: "#000000" }
    };
    const SUIT_PATHS = {};
    Object.keys(SUITS).forEach((k) => { SUIT_PATHS[k] = new Path2D(SUITS[k].path); });

    function suitOf(frameKey) {
        const style = FRAME_STYLES[frameKey];
        return (style && SUITS[style.suit]) ? style.suit : "hearts";
    }

    /* The artwork sets its Q and K in Algerian, which is a licensed Monotype
       face: the design folder carries the TTF, but bundling it into a public
       web root is a redistribution this project has no licence for, and the
       FONTS list above exists precisely so the editor never names a face the
       renderer would substitute. Playfair Display is already loaded by the
       page and is the closest high-contrast display serif on hand, so the
       indices are set in it and the substitution is deliberate rather than
       silent. */
    const CARD_RANK_FONT = "playfair";

    /* The four ranks offered as suggestions. They are no longer the only
       allowed values: the corner is free text, so an initial, a monogram or a
       10 are all typeable. This list only fills the datalist behind the two
       inputs, which is what keeps the common case one click. */
    const RANKS = ["A", "J", "Q", "K"];

    /* Free text needs exactly three rules, and they are the ones the drawing
       imposes rather than taste: no whitespace (a rank of " " renders as a
       blank corner that reads as a bug), at most two characters, and nothing
       that is not a single line. Emptiness is allowed on purpose -- clearing
       the field leaves the pip alone in the corner, which is a legitimate
       thing to want. */
    function cleanRank(value) {
        return String(value === null || value === undefined ? "" : value)
            .replace(/\s+/g, "")
            .slice(0, 2);
    }

    function styleRanks(frameKey) {
        const style = FRAME_STYLES[frameKey];
        return (style && style.ranks) || FRAME_STYLES.hearts.ranks;
    }

    /* Nothing in the corner reaches further right than the pip does. The pip's
       own right edge is 66.6pt against a panel starting at 74.5, so the artwork
       leaves 7.9pt of paper between the index and the photograph -- and it puts
       its rank on that same edge rather than closer in.

       Expressed against the pip rather than as a number, so the two can only
       move together. Anything a visitor types that would be wider is scaled
       down to it, which is what makes a free-text field safe here: without a
       cap, "WW" runs a third of the way across the photograph. */
    const RANK_MAX_W = CARD.pip.x + CARD.pip.w - CARD.rank.x;

    function fitRankSize(c, rank, W) {
        const size = CARD.rank.size * W;
        if (!rank) {
            return size;
        }
        c.save();
        c.font = "700 " + size + "px " + fontStack(CARD_RANK_FONT);
        const measured = c.measureText(rank).width;
        c.restore();
        const max = RANK_MAX_W * W;
        return measured > max ? size * (max / measured) : size;
    }

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

    /* Mirrors the value attribute on #doc-name in poster.html. An untouched
       field falls back to the brand filename rather than exporting
       "untitled-poster.png". */
    const DEFAULT_POSTER_NAME = "Untitled poster";

    let state = {
        name: DEFAULT_POSTER_NAME,
        size: "A3",
        frame: "black",
        rankHead: FRAME_STYLES.hearts.ranks.head,
        rankFoot: FRAME_STYLES.hearts.ranks.foot,
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
        return JSON.stringify({
            name: state.name, size: state.size, frame: state.frame,
            rankHead: state.rankHead, rankFoot: state.rankFoot, texts: state.texts
        });
    }

    function restore(json) {
        const parsed = JSON.parse(json);
        state.name = parsed.name;
        state.size = parsed.size;
        state.frame = parsed.frame;
        state.rankHead = cleanRank(parsed.rankHead);
        state.rankFoot = cleanRank(parsed.rankFoot);
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
        syncDocControls();
    }

    function redo() {
        if (!future.length) {
            return;
        }
        past.push({ key: null, json: snapshot() });
        restore(future.pop());
        afterChange();
        syncControls();
        syncDocControls();
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
            rankHead: TB.sanitize(state.rankHead),
            rankFoot: TB.sanitize(state.rankFoot),
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
        /* Absent on every record written before the ranks were editable, so
           an older poster reopens as the pairing its own style advertises.
           Only `undefined` takes the fallback: an empty string is a corner the
           visitor deliberately cleared, and restoring a letter over it would
           be the editor arguing with them. */
        const fallbackRanks = styleRanks(state.frame);
        state.rankHead = saved.rankHead === undefined
            ? fallbackRanks.head
            : cleanRank(TB.desanitize(String(saved.rankHead)));
        state.rankFoot = saved.rankFoot === undefined
            ? fallbackRanks.foot
            : cleanRank(TB.desanitize(String(saved.rankFoot)));
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

    /* The photo, or the prompt that stands in for it. Shared by both layouts so
       an empty editor looks the same whichever style is selected, and so the
       placeholder can never be styled in one and forgotten in the other. */
    function drawPhotoPanel(c, x, y, w, h, scale, transparent) {
        if (photo) {
            drawCoverImage(c, photo, x, y, w, h);
            return;
        }
        if (transparent) {
            return;
        }
        c.fillStyle = "#F4F3EF";
        c.fillRect(x, y, w, h);
        c.fillStyle = "#6B6B66";
        c.font = "400 " + (34 * scale) + 'px "Inter", sans-serif';
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText("Upload a photo to begin", x + w / 2, y + h / 2);
    }

    /* One corner index: the rank letter with its suit pip below it.

       The bottom-right copy is the top-left one mirrored VERTICALLY, which is
       what the artwork does -- matrix(1 0 0 -1) on both the K and its pip --
       rather than the 180-degree rotation a real playing card uses. The
       difference is visible on the K: a rotation would also reverse it left to
       right. That is why only the y axis goes through the transform and the x
       positions are mirrored arithmetically instead. */
    function drawCardIndex(c, W, H, rank, flip, suit) {
        const pipW = CARD.pip.w * W;
        const pipH = CARD.pip.h * H;
        const pipX = flip ? W - CARD.pip.x * W - pipW : CARD.pip.x * W;
        const rankX = flip ? W - CARD.rank.x * W : CARD.rank.x * W;
        const key = SUITS[suit] ? suit : "hearts";

        c.save();
        if (flip) {
            c.translate(0, H);
            c.scale(1, -1);
        }

        c.fillStyle = CARD.ink;
        c.font = "700 " + fitRankSize(c, rank, W) + "px " + fontStack(CARD_RANK_FONT);
        c.textAlign = flip ? "right" : "left";
        c.textBaseline = "alphabetic";
        c.fillText(rank, rankX, CARD.rank.baseline * H);

        c.fillStyle = SUITS[key].ink;
        c.translate(pipX, CARD.pip.y * H);
        c.scale(pipW, pipH);
        c.fill(SUIT_PATHS[key]);
        c.restore();
    }

    /* The playing-card layout: white paper, a ruled photo panel, and the two
       corner indices. Nothing here reads frame.frame or frame.trim -- this
       style carries a layout instead of a colour pair. The indices are drawn
       even for a transparent export, because they are the artwork rather than
       the background the toggle exists to drop. */
    function paintCard(c, W, H, options, scale) {
        if (!options.transparent) {
            c.fillStyle = "#FFFFFF";
            c.fillRect(0, 0, W, H);
        }

        const x = CARD.panel.x * W;
        const y = CARD.panel.y * H;
        const w = CARD.panel.w * W;
        const h = CARD.panel.h * H;

        drawPhotoPanel(c, x, y, w, h, scale, options.transparent);

        /* Stroked ON the panel boundary, as the artwork has it, so half the
           rule falls over the photograph. Insetting it instead would leave a
           hairline of paper between rule and photo at export scale. */
        c.strokeStyle = CARD.ink;
        c.lineWidth = CARD.rule * W;
        c.strokeRect(x, y, w, h);

        const suit = suitOf(state.frame);
        drawCardIndex(c, W, H, state.rankHead, false, suit);
        drawCardIndex(c, W, H, state.rankFoot, true, suit);
    }

    /* transparent=true skips the frame, matte and placeholder fills so a PNG
       exports with a genuinely empty background rather than a white one -- the
       toggle in the download panel does this and nothing else. */
    function paint(c, W, H, opts) {
        const options = opts || {};
        const frame = FRAME_STYLES[state.frame] || FRAME_STYLES.black;
        const scale = W / 1200;

        c.clearRect(0, 0, W, H);

        if (frame.layout === "card") {
            paintCard(c, W, H, options, scale);
        } else {
            const FRAME_W = frame.frame ? 60 * scale : 0;
            const MATTE_W = frame.frame ? 50 * scale : 0;

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

            drawPhotoPanel(c, px, py, pw, ph, scale, options.transparent);
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

    /* The clickable area of a corner index: the margin strip beside the panel,
       from the top of the rank letter down to the foot of the pip. Deliberately
       generous and deliberately not a drag handle -- the indices have fixed
       positions in this layout, so the only useful thing a click on one can do
       is take you to the field that changes it. */
    function cardIndexAt(pt, W, H) {
        if ((FRAME_STYLES[state.frame] || {}).layout !== "card") {
            return null;
        }
        const capPx = CARD.rank.size * W * 0.75;
        const top = CARD.rank.baseline * H - capPx;
        const bottom = (CARD.pip.y + CARD.pip.h) * H;
        const left = CARD.rank.x * W;
        const right = CARD.panel.x * W;
        const x = pt.x * W;
        const y = pt.y * H;

        if (x >= left && x <= right && y >= top && y <= bottom) {
            return "head";
        }
        if (x >= W - right && x <= W - left && y >= H - bottom && y <= H - top) {
            return "foot";
        }
        return null;
    }

    /* Click the letter on the poster, type the letter you want. Not an
       in-canvas text editor -- that means a caret, a selection model and IME
       handling for two characters of content -- but it closes the same loop:
       the corner is where the visitor is looking, so that is where the way in
       should be. */
    function focusRankFor(corner) {
        const input = corner === "head" ? rankHeadInput : rankFootInput;
        if (!input) {
            return;
        }
        /* On a phone the form and the preview are separate tabs, so focusing a
           field in the hidden one would do nothing visible. */
        const editTab = byId("tab-edit");
        const layout = byId("editor-layout");
        if (editTab && layout && !layout.classList.contains("show-edit")) {
            editTab.click();
        }
        input.focus();
        input.select();
        if (input.scrollIntoView) {
            input.scrollIntoView({ block: "center" });
        }
    }

    canvas.addEventListener("pointerdown", (ev) => {
        const pt = canvasPoint(ev);
        const corner = cardIndexAt(pt, canvas.width, canvas.height);
        if (corner) {
            focusRankFor(corner);
            return;
        }
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
            syncDocControls();
        });
    }

    const rankHeadInput = byId("p-rank-head");
    const rankFootInput = byId("p-rank-foot");

    /* Both events, and they are not redundant. `input` is the visitor typing,
       and coalesces so a two-character rank is one history entry rather than
       two. `change` is the datalist being picked with the mouse, a paste
       committed by blurring -- and the verification suite, which sets .value
       and dispatches change to prove the CONTROL reached the export. */
    [[rankHeadInput, "rankHead"], [rankFootInput, "rankFoot"]].forEach((entry) => {
        const el = entry[0];
        if (!el) {
            return;
        }
        const apply = (coalesceKey) => {
            const next = cleanRank(el.value);
            if (state[entry[1]] === next) {
                return;
            }
            beginChange();
            state[entry[1]] = next;
            commit(coalesceKey);
        };
        el.addEventListener("input", () => apply("rank-" + entry[1]));
        el.addEventListener("change", () => apply(null));
    });

    /* Pushes state back INTO the document-level controls. syncControls() next
       to it does the same job for the text toolbar, and deliberately returns
       early when nothing is selected, so it was never the place for these.

       Undo and redo are why this exists: they rewrite state wholesale, and
       until now nothing wrote the result back to these selects -- undoing a
       frame change repainted the canvas correctly and left the Frame Style
       select showing the style that had just been undone. The rank selects
       would have inherited exactly that. */
    function syncDocControls() {
        const style = FRAME_STYLES[state.frame] || FRAME_STYLES.black;
        if (frameSelect) { frameSelect.value = state.frame; }
        if (sizeSelect) { sizeSelect.value = state.size; }
        /* Compared before writing, on all three: these are text fields now, and
           assigning .value to what it already holds still drops the caret to
           the end of the field mid-word. */
        if (nameInput && nameInput.value !== state.name) { nameInput.value = state.name; }
        if (rankHeadInput && rankHeadInput.value !== state.rankHead) { rankHeadInput.value = state.rankHead; }
        if (rankFootInput && rankFootInput.value !== state.rankFoot) { rankFootInput.value = state.rankFoot; }

        const cardFields = byId("p-card-fields");
        if (cardFields) {
            cardFields.hidden = style.layout !== "card";
        }
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

    /* The poster editor was the ONE editor whose name field already reached
       its export; the other three ignored theirs entirely. It uses the shared
       slug now so a file downloaded here is named the same way as one from
       any other editor (August 24, 2026), and it treats the untouched default
       the way they do -- "untitled-poster.png" tells the visitor nothing they
       did not already know, so an untouched field falls back to the brand
       name instead. */
    function fileName(ext) {
        const named = String(state.name || "").trim() === DEFAULT_POSTER_NAME
            ? ""
            : TB.fileSlug(state.name);
        return (named || "templatebox-poster") + "." + ext;
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

    /* The uploaded photo as a data URL for embedding in an SVG. It goes through
       a canvas rather than being carried from the file input, because the
       source may be any format the browser can decode and the export has to be
       one an SVG viewer can. */
    function photoDataURL() {
        const c = document.createElement("canvas");
        c.width = photo.width;
        c.height = photo.height;
        c.getContext("2d").drawImage(photo, 0, 0);
        return c.toDataURL("image/jpeg", 0.92);
    }

    /* SVG twin of drawCardIndex(). Same constants, same unit pip path, same
       mirror-in-y-only rule for the bottom-right index. */
    function cardIndexSVG(W, H, rank, flip, esc, suit) {
        const pipW = CARD.pip.w * W;
        const pipH = CARD.pip.h * H;
        const pipX = flip ? W - CARD.pip.x * W - pipW : CARD.pip.x * W;
        const rankX = flip ? W - CARD.rank.x * W : CARD.rank.x * W;
        const key = SUITS[suit] ? suit : "hearts";
        /* Measured on the live canvas context, because there is nothing in an
           SVG string to measure with -- and the fit has to be the SAME number
           the canvas used or a wide rank would collide here and not there. */
        const size = fitRankSize(ctx, rank, W);

        return (flip ? '<g transform="translate(0 ' + H + ') scale(1 -1)">' : "<g>") +
            '<text x="' + rankX + '" y="' + (CARD.rank.baseline * H) +
            '" font-family="' + esc(fontStack(CARD_RANK_FONT).replace(/"/g, "'")) +
            '" font-size="' + size + '" font-weight="700"' +
            ' fill="' + CARD.ink + '" text-anchor="' + (flip ? "end" : "start") + '">' +
            esc(rank) + "</text>" +
            '<path d="' + SUITS[key].path + '" fill="' + SUITS[key].ink + '" transform="translate(' +
            pipX + " " + (CARD.pip.y * H) + ") scale(" + pipW + " " + pipH + ')"/>' +
            "</g>";
    }

    /* SVG twin of paintCard(). Reads the same CARD geometry the canvas
       renderer does, so the two can only drift if a structural element is
       added to one and not the other. */
    function cardSVG(W, H, esc) {
        const x = CARD.panel.x * W;
        const y = CARD.panel.y * H;
        const w = CARD.panel.w * W;
        const h = CARD.panel.h * H;

        let out = '<rect width="' + W + '" height="' + H + '" fill="#FFFFFF"/>';

        if (photo) {
            out += '<image x="' + x + '" y="' + y + '" width="' + w + '" height="' + h +
                '" preserveAspectRatio="xMidYMid slice" href="' + photoDataURL() + '"/>';
        }

        out += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h +
            '" fill="none" stroke="' + CARD.ink + '" stroke-width="' + (CARD.rule * W) + '"/>';

        const suit = suitOf(state.frame);
        return out + cardIndexSVG(W, H, state.rankHead, false, esc, suit) +
            cardIndexSVG(W, H, state.rankFoot, true, esc, suit);
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

        if (frame.layout === "card") {
            body += cardSVG(W, H, esc);
        } else {
            if (frame.frame) {
                body += '<rect width="' + W + '" height="' + H + '" fill="' + frame.frame + '"/>';
            }
            const fw = frame.frame ? W * 0.05 : 0;
            body += '<rect x="' + fw + '" y="' + fw + '" width="' + (W - fw * 2) +
                '" height="' + (H - fw * 2) + '" fill="#FFFFFF"/>';

            if (photo) {
                const mw = fw + W * 0.042;
                body += '<image x="' + mw + '" y="' + mw + '" width="' + (W - mw * 2) +
                    '" height="' + (H - mw * 2 - H * 0.11) +
                    '" preserveAspectRatio="xMidYMid slice" href="' + photoDataURL() + '"/>';
            }
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
        /* Suggestions behind both rank fields, from the one list, so the
           common four stay one click while the field itself takes anything. */
        const rankList = byId("p-rank-options");
        if (rankList && !rankList.options.length) {
            RANKS.forEach((r) => {
                const o = document.createElement("option");
                o.value = r;
                rankList.appendChild(o);
            });
        }
    }

    buildSelects();
    migrate(TB.storageGet(STORAGE_KEY));

    /* A catalog card can pre-select the frame style, the same data-doc hand-off
       docs.html and mockup.html already use. The value is only ever matched
       against FRAME_STYLES, so a tampered localStorage entry resolves to
       nothing worse than a style this editor already ships. It outranks the
       saved style because arriving from a card is a fresh, deliberate choice,
       and it deliberately leaves the rest of the saved poster alone -- the
       photo, the text and the paper size all survive the switch. */
    const framePreset = TB.takePreset();
    if (FRAME_STYLES[framePreset]) {
        state.frame = framePreset;
        /* The pairing comes with it, because the card is named after it: a
           visitor who clicked "King and Queen of Spades" should get a K and a
           Q. Only the catalog hand-off does this -- picking the same style
           from the Frame Style control leaves whatever letters are already
           there, since that is an edit in progress rather than a request for
           the template as advertised. */
        const presetRanks = styleRanks(framePreset);
        state.rankHead = presetRanks.head;
        state.rankFoot = presetRanks.foot;
    }

    syncDocControls();

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
