/* ==========================================================================
   TemplateBox - Template Studio (admin.html only)

   Authors the two registries that describe templates rather than draw them:

     js/resume-templates.js   window.TB_RESUME_TEMPLATES, an array of
                              descriptors rendered by js/resume-engine.js.
                              A template here is DATA, so one can be created
                              whole from this panel.

     js/docs.js               DOC_TYPES, whose entries are also data -- a
                              heading, a file name, a labels map -- except for
                              `layout`, which names one of FIVE hand-written
                              renderer functions. So a document VARIANT is
                              authorable and a new LAYOUT is not: it is a
                              JavaScript function and stays one. The panel says
                              so rather than offering a control that cannot
                              work.

   WHAT THIS DOES NOT DO. It does not deploy. Like every other admin
   workspace here, it edits the working copy and stops; committing and pushing
   is the operator's, because no page can push to a repository on their behalf.

   READING vs WRITING. The registries are read with fetch() from the served
   site, so the panel is fully usable -- browse, edit, preview, copy -- with no
   folder connected and on browsers that have no File System Access API.
   Writing needs window.TBProjectFolder, which is Chromium only. The
   download-and-copy path is not a fallback bolted on afterwards; it is the
   whole workflow on two of the three engines.

   THE DANGEROUS PART, AND WHY IT IS SAFE. Editing these files is string
   surgery on JavaScript SOURCE. The catalog thumbnail panel can splice
   index.html and then prove the result with DOMParser; there is no DOMParser
   for a program, and a regex rewrite of a source file is how an admin tool
   corrupts a repository. So:

     1. One entry is located by anchoring on its own `id:` and matching braces
        outward, skipping strings, template literals and comments. Only that
        byte range is replaced. Every other byte is untouched, so `git diff`
        shows one entry.
     2. The result is PROVED before it is written. The whole file is compiled
        (never run) to show it parses, the registry's own literal is extracted
        and evaluated in isolation, and the value is compared against what it
        was: same length, every entry that was not being changed deep-equal to
        before, and the changed one deep-equal to what the form authored.
     3. Any failure writes nothing and says which check failed.

   Step 2 is what makes step 1 safe. It tests the file's MEANING rather than
   its shape, so a mis-splice cannot reach disk even if the scanner in step 1
   is fooled by something this file has not anticipated.
   ========================================================================== */

"use strict";

window.TBStudio = (() => {

    const FS = window.TBProjectFolder;

    const RESUME_PATH = "js/resume-templates.js";
    const DOCS_PATH = "js/docs.js";
    const INDEX_PATH = "index.html";
    const ADMIN_PATH = "js/admin.js";

    /* The registry's own global, and the assignment that introduces it. Both
       are needed: the first to name what was evaluated, the second to find
       the literal in the source. */
    const RESUME_ANCHOR = "window.TB_RESUME_TEMPLATES = [";
    const DOCS_ANCHOR = "const DOC_TYPES = {";

    /* The five renderers in js/docs.js. NOT a list this panel may extend --
       each name is a function over there, and an entry naming anything else
       renders nothing at all. Kept here so the select cannot offer a sixth,
       and checked against the file on load so the two cannot drift. */
    const DOC_LAYOUTS = ["receipt", "itemized", "notice", "ruled-invoice", "trade-receipt"];

    /* Every field js/resume.js actually collects. A descriptor naming
       anything else presents a picker entry that silently drops half its own
       layout -- the defect `catalog: true`'s own comment in the registry
       warns about -- so it is rejected here rather than shipped. */
    const FORM_FIELDS = ["name", "title", "email", "phone", "location", "summary",
        "skills", "languages", "accomplishments", "address", "city", "postcode",
        "phoneAlt"];
    const FORM_LISTS = ["experience", "education", "projects", "references"];

    /* The engine maps these three to a CSS stack and to one of jsPDF's built-in
       faces. Anything outside the set needs an embedded font file, which
       inflates every export and reopens the WinAnsi encoding problem
       documented for currencies in js/docs.js. */
    const FAMILIES = ["serif", "sans", "mono"];

    /* ----------------------------------------------------------------------
       Source scanning. Brace matching that is aware of the four things in
       JavaScript that contain braces which are not braces.
       ---------------------------------------------------------------------- */

    /* Walks `src` from `from`, returning the index just past the balanced
       run that opens with `open`. Strings, template literals, line comments
       and block comments are skipped wholesale.

       Regular expression literals are NOT handled, because telling a regex
       from a division needs a parser. Neither registry contains one inside an
       entry today; if one ever appears the splice will be wrong and the
       verification in step 2 will catch it and refuse to write. That is the
       division of labour: this function is allowed to be fooled, the check
       after it is not. */
    function matchBalanced(src, from, open, close) {
        let depth = 0;
        let i = from;
        while (i < src.length) {
            const c = src[i];
            if (c === "/" && src[i + 1] === "/") {
                const nl = src.indexOf("\n", i);
                i = nl === -1 ? src.length : nl;
                continue;
            }
            if (c === "/" && src[i + 1] === "*") {
                const end = src.indexOf("*/", i + 2);
                i = end === -1 ? src.length : end + 2;
                continue;
            }
            if (c === '"' || c === "'" || c === "`") {
                i = skipString(src, i);
                continue;
            }
            if (c === open) { depth += 1; }
            else if (c === close) {
                depth -= 1;
                if (depth === 0) { return i + 1; }
            }
            i += 1;
        }
        return -1;
    }

    function skipString(src, i) {
        const quote = src[i];
        let j = i + 1;
        while (j < src.length) {
            if (src[j] === "\\") { j += 2; continue; }
            if (src[j] === quote) { return j + 1; }
            j += 1;
        }
        return src.length;
    }

    /* The byte range of the object literal whose `id` is `id`.

       Anchored on the id rather than on position: entries are reordered and
       commented, and counting commas from the top of an array is how a tool
       edits the wrong one. The opening brace is then found by walking BACK
       from the anchor, because an entry's id is not always its first key. */
    function findEntryRange(src, id, region) {
        const anchor = new RegExp('id:\\s*"' + escapeRe(id) + '"');
        const slice = src.slice(region.start, region.end);
        const hit = anchor.exec(slice);
        if (!hit) { return null; }
        const at = region.start + hit.index;

        let open = -1;
        for (let i = at; i >= region.start; i -= 1) {
            if (src[i] === "{") { open = i; break; }
            /* A closing brace before an opening one means the id sits outside
               any object in this region -- in a comment that survived, or in
               a nested literal whose owner has already closed. */
            if (src[i] === "}") { return null; }
        }
        if (open === -1) { return null; }
        const end = matchBalanced(src, open, "{", "}");
        if (end === -1) { return null; }
        return { start: open, end: end };
    }

    /* A DOC_TYPES entry is keyed by its id rather than carrying one, so it is
       found by its key and its value's own braces. */
    function findKeyedRange(src, id, region) {
        const anchor = new RegExp('(^|[{,\\s])"?' + escapeRe(id) + '"?\\s*:\\s*\\{', "m");
        const slice = src.slice(region.start, region.end);
        const hit = anchor.exec(slice);
        if (!hit) { return null; }
        const open = region.start + hit.index + hit[0].length - 1;
        const end = matchBalanced(src, open, "{", "}");
        if (end === -1) { return null; }
        /* Back to the start of the key, so the whole `"id": { ... }` pair is
           the range and a replacement can rename it. */
        let keyStart = region.start + hit.index;
        while (keyStart < open && /[\s,{]/.test(src[keyStart])) { keyStart += 1; }
        return { start: keyStart, end: end };
    }

    /* How much COMMENT is inside one entry.

       Re-serialising an entry preserves its meaning and destroys its prose.
       These two registries are among the most heavily annotated files in the
       project -- `classic` alone carries 1.2KB of it, explaining numbers
       nobody could re-derive -- so an operator about to replace one should be
       told what it costs before they do, not discover it in a diff.

       Measured rather than described: the panel reports the real byte count
       for the entry actually open. */
    function commentBytes(src, range) {
        let bytes = 0;
        let i = range.start;
        while (i < range.end) {
            const c = src[i];
            if (c === "/" && src[i + 1] === "/") {
                const nl = src.indexOf("\n", i);
                const to = nl === -1 ? range.end : nl;
                bytes += to - i;
                i = to;
                continue;
            }
            if (c === "/" && src[i + 1] === "*") {
                const end = src.indexOf("*/", i + 2);
                const to = end === -1 ? range.end : end + 2;
                bytes += to - i;
                i = to;
                continue;
            }
            if (c === '"' || c === "'" || c === "`") {
                i = skipString(src, i);
                continue;
            }
            i += 1;
        }
        return bytes;
    }

    /* The comment weight of the entry with this id, or 0 if it is new. */
    function commentCost(source, cfg, id) {
        try {
            const region = registryRegion(source, cfg.anchor, cfg.open, cfg.close);
            const range = cfg.rangeOf(source, id, region);
            return range ? commentBytes(source, range) : 0;
        } catch (err) {
            return 0;
        }
    }

    function escapeRe(s) {
        return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    /* Where the registry's own literal begins and ends. Everything above it
       is a comment block and a "use strict"; everything below is nothing. */
    function registryRegion(src, anchorText, open, close) {
        const at = src.indexOf(anchorText);
        if (at === -1) {
            throw new Error("could not find " + anchorText.trim() + " -- is the connected folder the right one?");
        }
        const openAt = at + anchorText.length - 1;
        const end = matchBalanced(src, openAt, open, close);
        if (end === -1) {
            throw new Error(anchorText.trim() + " is not balanced, so nothing can be spliced safely.");
        }
        return { start: openAt, end: end, literalStart: openAt };
    }

    /* ----------------------------------------------------------------------
       Verification. Nothing above is trusted; this is what decides.
       ---------------------------------------------------------------------- */

    /* Compiles the whole file without running a line of it. `new Function`
       parses its body eagerly, so a syntax error throws here -- which is the
       cheapest possible proof that a splice did not break the file. */
    function parses(source) {
        try {
            new Function(source);
            return null;
        } catch (err) {
            return err && err.message ? err.message : String(err);
        }
    }

    /* The registry's VALUE, evaluated on its own.

       The literal is extracted and evaluated by itself rather than the file
       being executed, for two reasons: docs.js keeps DOC_TYPES private inside
       an IIFE so executing it would not expose the value at all, and running
       a site's own source inside the admin page is not something this panel
       should ever do. */
    function evaluateRegistry(source, anchorText, open, close) {
        const region = registryRegion(source, anchorText, open, close);
        const literal = source.slice(region.literalStart, region.end);
        return new Function("return (" + literal + ");")();
    }

    function deepEqual(a, b) {
        if (a === b) { return true; }
        if (typeof a !== typeof b || a === null || b === null) { return false; }
        if (typeof a !== "object") { return false; }
        if (Array.isArray(a) !== Array.isArray(b)) { return false; }
        const ka = Object.keys(a);
        const kb = Object.keys(b);
        if (ka.length !== kb.length) { return false; }
        for (const k of ka) {
            if (!Object.prototype.hasOwnProperty.call(b, k)) { return false; }
            if (!deepEqual(a[k], b[k])) { return false; }
        }
        return true;
    }

    /* The whole safety argument, in one function.

       `expected` says what the edit was FOR: which key changed, what the count
       should become, and the value that should now be there. Everything else
       must be exactly what it was. */
    function verifyRegistry(before, after, cfg, expected) {
        if (after.length < before.length * 0.6) {
            return "the patched file lost nearly half its content";
        }
        const syntax = parses(after);
        if (syntax) { return "the patched file does not parse: " + syntax; }

        let wasValue;
        let isValue;
        try {
            wasValue = evaluateRegistry(before, cfg.anchor, cfg.open, cfg.close);
            isValue = evaluateRegistry(after, cfg.anchor, cfg.open, cfg.close);
        } catch (err) {
            return "the patched registry could not be read back: " +
                (err && err.message ? err.message : err);
        }

        const wasKeys = cfg.keysOf(wasValue);
        const isKeys = cfg.keysOf(isValue);
        if (isKeys.length !== expected.count) {
            return "the registry went to " + isKeys.length + " entries, expected " + expected.count;
        }

        /* Everything that was not the subject of this edit, byte for byte in
           meaning. This is the check the whole design exists for. */
        for (const key of wasKeys) {
            if (key === expected.id || key === expected.replacedId) { continue; }
            if (isKeys.indexOf(key) === -1) {
                return "entry \"" + key + "\" disappeared";
            }
            if (!deepEqual(cfg.entryOf(wasValue, key), cfg.entryOf(isValue, key))) {
                return "entry \"" + key + "\" changed, and this edit was not about it";
            }
        }

        if (expected.action === "delete") {
            if (isKeys.indexOf(expected.id) !== -1) {
                return "entry \"" + expected.id + "\" is still there after a delete";
            }
            return null;
        }

        const written = cfg.entryOf(isValue, expected.id);
        if (!written) { return "entry \"" + expected.id + "\" is not in the patched registry"; }
        if (!deepEqual(written, expected.value)) {
            return "entry \"" + expected.id + "\" did not come back as it was written";
        }
        return null;
    }

    /* ----------------------------------------------------------------------
       The two registries, described so one set of functions serves both.
       ---------------------------------------------------------------------- */

    const RESUME_CFG = {
        path: RESUME_PATH,
        anchor: RESUME_ANCHOR,
        open: "[",
        close: "]",
        keysOf: (v) => (v || []).map((t) => t.id),
        entryOf: (v, id) => (v || []).find((t) => t.id === id) || null,
        rangeOf: findEntryRange
    };

    const DOCS_CFG = {
        path: DOCS_PATH,
        anchor: DOCS_ANCHOR,
        open: "{",
        close: "}",
        keysOf: (v) => Object.keys(v || {}),
        entryOf: (v, id) => (v || {})[id] || null,
        rangeOf: findKeyedRange
    };

    /* ----------------------------------------------------------------------
       Serialising a descriptor back into source.

       Deliberately NOT JSON.stringify: these are hand-maintained, heavily
       commented files, and a dump with quoted keys and four-space indents
       produces a diff nobody can read. Keys keep the order the author gave
       them, and the indentation matches the file around it.
       ---------------------------------------------------------------------- */

    const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

    function quote(s) {
        return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')
            .replace(/\n/g, "\\n").replace(/\r/g, "").replace(/\t/g, "\\t") + '"';
    }

    function isPlain(v) {
        return v === null || typeof v !== "object";
    }

    function writeValue(value, indent) {
        if (value === null) { return "null"; }
        if (typeof value === "string") { return quote(value); }
        if (typeof value === "number" || typeof value === "boolean") { return String(value); }
        if (Array.isArray(value)) {
            if (!value.length) { return "[]"; }
            /* A row of plain values stays on one line; anything holding an
               object breaks, because a wrapped array of objects is unreadable
               either way and one-per-line at least diffs cleanly. */
            if (value.every(isPlain)) {
                const inline = "[" + value.map((v) => writeValue(v, indent)).join(", ") + "]";
                if (inline.length + indent.length <= 78) { return inline; }
            }
            const pad = indent + "    ";
            return "[\n" + value.map((v) => pad + writeValue(v, pad)).join(",\n") +
                "\n" + indent + "]";
        }
        const keys = Object.keys(value);
        if (!keys.length) { return "{}"; }
        if (keys.every((k) => isPlain(value[k]))) {
            const inline = "{ " + keys.map((k) =>
                writeKey(k) + ": " + writeValue(value[k], indent)).join(", ") + " }";
            if (inline.length + indent.length <= 78) { return inline; }
        }
        const pad = indent + "    ";
        return "{\n" + keys.map((k) =>
            pad + writeKey(k) + ": " + writeValue(value[k], pad)).join(",\n") +
            "\n" + indent + "}";
    }

    function writeKey(k) {
        return IDENT.test(k) ? k : quote(k);
    }

    function serializeEntry(value, indent) {
        return writeValue(value, indent);
    }

    /* ----------------------------------------------------------------------
       Splicing.
       ---------------------------------------------------------------------- */

    function indentOf(src, at) {
        let i = at;
        while (i > 0 && src[i - 1] !== "\n") { i -= 1; }
        const line = src.slice(i, at);
        return /^[ \t]*$/.test(line) ? line : "        ";
    }

    /* Replace one entry, add one, or remove one. Returns the new source and
       what the count should become, which is what verification is told to
       expect rather than being left to work out for itself. */
    function spliceRegistry(source, cfg, entry, id, action) {
        const region = registryRegion(source, cfg.anchor, cfg.open, cfg.close);
        const existing = cfg.rangeOf(source, id, region);

        if (action === "delete") {
            if (!existing) { throw new Error("\"" + id + "\" is not in the registry."); }
            let from = existing.start;
            let to = existing.end;
            /* Take the trailing comma and the blank line with it, or the file
               grows a stray separator every time something is removed. */
            while (from > region.start && /[ \t]/.test(source[from - 1])) { from -= 1; }
            if (source[from - 1] === "\n") { from -= 1; }
            if (source[to] === ",") { to += 1; }
            return { source: source.slice(0, from) + source.slice(to), action: "delete" };
        }

        if (existing) {
            const indent = indentOf(source, existing.start);
            const body = cfg === DOCS_CFG
                ? writeKey(id) + ": " + serializeEntry(entry, indent)
                : serializeEntry(entry, indent);
            return {
                source: source.slice(0, existing.start) + body + source.slice(existing.end),
                action: "replaced"
            };
        }

        /* New: appended just inside the registry's closing bracket, after the
           last entry, with the comma the previous one now needs. */
        const closeAt = region.end - 1;
        let tail = closeAt;
        while (tail > region.start && /\s/.test(source[tail - 1])) { tail -= 1; }
        const needsComma = source[tail - 1] !== cfg.open && source[tail - 1] !== ",";
        const indent = "    ";
        const body = cfg === DOCS_CFG
            ? writeKey(id) + ": " + serializeEntry(entry, indent)
            : serializeEntry(entry, indent);
        const inserted = (needsComma ? "," : "") + "\n" + indent + body + "\n";
        return {
            source: source.slice(0, tail) + inserted + source.slice(tail),
            action: "inserted"
        };
    }

    /* ----------------------------------------------------------------------
       Validation. Everything the engine will not tell you about until the
       sheet comes out wrong, or until the suite fails on a commit.
       ---------------------------------------------------------------------- */

    function validateResume(t, others) {
        const out = [];
        const say = (m) => out.push(m);

        if (!t || typeof t !== "object") { return ["the descriptor is not an object"]; }
        if (!t.id || !/^[a-z0-9-]+$/.test(t.id)) {
            say("id must be lower-case letters, digits and hyphens");
        }
        if (!t.title) { say("title is required -- the catalog card shows it"); }
        if (others && others.some((o) => o.title === t.title && o.id !== t.id)) {
            say("another template already has the title \"" + t.title + "\"");
        }
        if (!t.page || !t.page.width || !t.page.height) { say("page needs a width and a height"); }
        if (!t.layout || !t.layout.main) { say("layout needs a main column"); }
        if (t.layout && t.layout.kind === "two-column" && !t.layout.sidebar) {
            say("a two-column layout needs a sidebar");
        }

        const roles = Object.keys(t.palette || {});
        const known = roles.concat(["accent"]);
        Object.keys(t.type || {}).forEach((name) => {
            const s = t.type[name];
            if (s.family && FAMILIES.indexOf(s.family) === -1) {
                say("type." + name + ".family is \"" + s.family + "\"; only " +
                    FAMILIES.join(", ") + " can be drawn in both mediums");
            }
            if (s.color && known.indexOf(s.color) === -1) {
                say("type." + name + ".color names \"" + s.color +
                    "\", which is not a palette role" +
                    (/^#/.test(s.color) ? " -- blocks name roles, never hexes" : ""));
            }
            /* `ruleBefore` may be a set of strokes drawn on one line, so
               every member is checked rather than the first. */
            ["rule", "ruleBefore"].forEach((k) => {
                const specs = s[k] ? (Array.isArray(s[k]) ? s[k] : [s[k]]) : [];
                specs.forEach((spec, n) => {
                    if (spec && spec.color && known.indexOf(spec.color) === -1) {
                        say("type." + name + "." + k +
                            (specs.length > 1 ? "[" + n + "]" : "") +
                            ".color names \"" + spec.color +
                            "\", which is not a palette role");
                    }
                });
            });
        });

        Object.keys(t.palette || {}).forEach((role) => {
            const v = t.palette[role];
            if (v !== "accent" && !/^#[0-9A-Fa-f]{6}$/.test(v)) {
                say("palette." + role + " must be a six-digit hex or the word accent");
            }
        });

        (t.blocks || []).forEach((b, i) => {
            const at = "block " + (i + 1) + " (" + (b.kind || "?") + ")";
            if (b.field && FORM_FIELDS.indexOf(b.field) === -1) {
                say(at + " reads \"" + b.field + "\", which the form does not collect");
            }
            (b.fields || []).forEach((f) => {
                if (FORM_FIELDS.indexOf(f) === -1) {
                    say(at + " reads \"" + f + "\", which the form does not collect");
                }
            });
            const body = b.body;
            if (body) {
                if (body.field && FORM_FIELDS.indexOf(body.field) === -1) {
                    say(at + "'s body reads \"" + body.field + "\", which the form does not collect");
                }
                if (body.source && FORM_LISTS.indexOf(body.source) === -1) {
                    say(at + "'s body reads the list \"" + body.source + "\", which does not exist");
                }
            }
            if (b.kind === "photo" && b.height !== undefined) {
                say(at + " names a height. The engine derives it from the width so a " +
                    "descriptor cannot stretch a face; remove it.");
            }
        });

        if (!(t.blocks || []).length) { say("a template with no blocks draws nothing"); }
        return out;
    }

    function validateDoc(d, id, others) {
        const out = [];
        if (!id || !/^[a-z0-9-]+$/.test(id)) {
            out.push("id must be lower-case letters, digits and hyphens");
        }
        if (!d.layout) { out.push("a layout is required"); }
        else if (DOC_LAYOUTS.indexOf(d.layout) === -1) {
            out.push("\"" + d.layout + "\" is not one of the five renderers in js/docs.js. " +
                "A new layout is a JavaScript function, not a form field.");
        }
        if (!d.heading) { out.push("a heading is required -- it is printed on the sheet"); }
        if (!d.file) { out.push("a file name is required -- it names the download"); }
        if (!d.labels || !Object.keys(d.labels).length) {
            out.push("labels are required -- they are what the form calls each field");
        }
        if (others && others.indexOf(id) !== -1) { /* editing, not a clash */ }
        return out;
    }

    /* ----------------------------------------------------------------------
       Reading the current registries. fetch() from the served site, so the
       panel works with no folder connected, on any browser.
       ---------------------------------------------------------------------- */

    async function readSource(path) {
        if (FS && FS.isConnected()) {
            const text = await FS.readText(path);
            if (text !== null && text !== undefined) { return text; }
        }
        const res = await fetch(path, { cache: "no-store" });
        if (!res.ok) { throw new Error("could not read " + path + " (" + res.status + ")"); }
        return res.text();
    }

    async function loadRegistries() {
        const [resumeSrc, docsSrc] = await Promise.all([
            readSource(RESUME_PATH), readSource(DOCS_PATH)
        ]);
        const resumes = evaluateRegistry(resumeSrc, RESUME_ANCHOR, "[", "]");
        const docs = evaluateRegistry(docsSrc, DOCS_ANCHOR, "{", "}");

        /* The five layout names are duplicated in this file so a select
           cannot offer a sixth. Checked against what docs.js actually
           registers, so the copy cannot go stale in silence. */
        const declared = [];
        const rendererBlock = /const RENDERERS = \{([\s\S]*?)\};/.exec(docsSrc);
        if (rendererBlock) {
            const re = /["']?([a-z-]+)["']?\s*:/g;
            let m;
            while ((m = re.exec(rendererBlock[1])) !== null) { declared.push(m[1]); }
        }
        const drift = declared.length
            ? DOC_LAYOUTS.filter((l) => declared.indexOf(l) === -1)
                .concat(declared.filter((l) => DOC_LAYOUTS.indexOf(l) === -1))
            : [];

        return { resumeSrc, docsSrc, resumes, docs, layouts: declared.length ? declared : DOC_LAYOUTS, drift };
    }

    /* ----------------------------------------------------------------------
       Publishing.
       ---------------------------------------------------------------------- */

    /* One registry edit, proved before it is written. Returns the patched
       source rather than writing it, so a caller doing several files can
       prove all of them before touching any. */
    function planRegistryEdit(source, cfg, entry, id, action, currentKeys) {
        const spliced = spliceRegistry(source, cfg, entry, id, action);
        const had = currentKeys.indexOf(id) !== -1;
        const count = action === "delete" ? currentKeys.length - 1
            : (had ? currentKeys.length : currentKeys.length + 1);
        const problem = verifyRegistry(source, spliced.source, cfg, {
            id: id, value: entry, count: count, action: action
        });
        if (problem) {
            throw new Error("refused to write " + cfg.path + ": " + problem);
        }
        return { path: cfg.path, source: spliced.source, action: spliced.action };
    }

    /* The catalog card. A resume template is not published until the catalog
       can reach it, and the count in the empty-search message has to follow.

       Insert only: this panel never rewrites an existing card's markup,
       because a card's preview tile is design somebody wrote by hand and
       replacing it with a generated default would throw that away. Editing a
       template that already has a card leaves the card alone. */
    function planCatalogCard(html, meta) {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const grid = doc.querySelector(".catalog-grid");
        if (!grid) { throw new Error("index.html has no catalog grid."); }
        const cards = grid.querySelectorAll(".template-card");
        const already = Array.from(doc.querySelectorAll(".card-link"))
            .some((a) => a.getAttribute("data-doc") === meta.id);
        if (already) { return null; }

        /* After the LAST card rather than before the grid's closing tag.
           Divs do not brace-match, and hunting for the right </div> among the
           nested ones inside every card is how an insert lands in the middle
           of somebody else's markup. The last </article> before the
           empty-search message is unambiguous. */
        const gridAt = html.search(/<div class="catalog-grid"[^>]*>/);
        const emptyAt = html.indexOf("catalog-empty");
        if (gridAt === -1) {
            throw new Error("index.html's catalog grid could not be located for an insert.");
        }
        const limit = emptyAt === -1 ? html.length : emptyAt;
        const lastCard = html.lastIndexOf("</article>", limit);
        if (lastCard === -1 || lastCard < gridAt) {
            throw new Error("index.html has no catalog cards to append after.");
        }
        const at = lastCard + "</article>".length;

        const article = cardMarkup(meta);
        let patched = html.slice(0, at) + "\n\n" + article + html.slice(at);
        const count = cards.length + 1;
        patched = patched.replace(/(clear the search to see all )\d+/, "$1" + count);

        const problem = verifyCard(html, patched, meta, count);
        if (problem) { throw new Error("refused to write index.html: " + problem); }
        return { path: INDEX_PATH, source: patched, action: "inserted", count: count };
    }

    /* The generated tile. A card with no preview reads as broken in the grid,
       and this panel cannot invent the hand-drawn mock-ups the other cards
       carry -- so it emits a plain ruled sheet in the template's own accent
       and says, in the panel, that it is a starting point to replace. */
    function cardMarkup(meta) {
        const pad = "                ";
        const accent = /^#[0-9A-Fa-f]{6}$/.test(meta.accent || "") ? meta.accent : "#1A1A1A";
        const bars = ["", "", "", ""].map(() => pad + '                        <span></span>').join("\n");
        return [
            pad + '<article class="template-card" data-category="' + meta.category + '">',
            pad + '    <div class="card-preview" aria-hidden="true">',
            pad + '        <div class="card-media">',
            pad + '            <div class="mock-doc studio" style="--mk-accent: ' + accent + '">',
            pad + '                <p class="mk-name">' + escapeHtml(meta.title) + '</p>',
            pad + '                <div class="mk-st-band">',
            bars,
            pad + '                </div>',
            pad + '                <div class="mk-st-band">',
            bars,
            pad + '                </div>',
            pad + '            </div>',
            pad + '        </div>',
            pad + '    </div>',
            pad + '    <div class="card-body">',
            pad + '        <p class="card-category">' + escapeHtml(meta.categoryLabel) + '</p>',
            pad + '        <h3 class="card-title"><a class="card-link" href="' + meta.href +
                '" data-target="' + meta.target + '" data-doc="' + meta.id + '">' +
                escapeHtml(meta.title) + '</a></h3>',
            pad + '    </div>',
            pad + '</article>'
        ].join("\n");
    }

    function escapeHtml(s) {
        return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function cardSignatures(doc) {
        return Array.from(doc.querySelectorAll(".catalog-grid .template-card")).map((card) => {
            const link = card.querySelector(".card-link");
            return [
                card.getAttribute("data-category") || "",
                link ? link.getAttribute("href") || "" : "",
                link ? link.getAttribute("data-doc") || "" : "",
                link ? link.textContent.trim() : ""
            ].join("|");
        });
    }

    function verifyCard(before, after, meta, expectedCount) {
        if (after.length < before.length * 0.9) {
            return "the patched homepage lost content";
        }
        const parser = new DOMParser();
        const afterDoc = parser.parseFromString(after, "text/html");
        if (afterDoc.querySelector("parsererror")) { return "the patched markup does not parse"; }

        const was = cardSignatures(parser.parseFromString(before, "text/html"));
        const is = cardSignatures(afterDoc);
        if (is.length !== expectedCount) {
            return "card count became " + is.length + ", expected " + expectedCount;
        }
        for (let i = 0; i < was.length; i += 1) {
            if (is[i] !== was[i]) {
                return "card " + (i + 1) + " changed identity: " + was[i] + " -> " + is[i];
            }
        }
        const added = Array.from(afterDoc.querySelectorAll(".card-link"))
            .find((a) => a.getAttribute("data-doc") === meta.id);
        if (!added) { return "the new card is not in the patched markup"; }
        if (added.textContent.trim() !== meta.title) {
            return "the new card's title does not match the registry's";
        }
        const stated = /clear the search to see all (\d+)/.exec(after);
        if (!stated || Number(stated[1]) !== expectedCount) {
            return "the catalog-empty count was not corrected to " + expectedCount;
        }
        return null;
    }

    /* The admin catalog registry, which is what admin.html's own picker
       lists. One line, appended after the last entry of the same category. */
    function planAdminEntry(source, meta) {
        if (source.indexOf('id: "' + meta.id + '"') !== -1) { return null; }
        const re = new RegExp('^\\s*\\{ id: "[^"]+", title: "[^"]+", category: "' +
            escapeRe(meta.category) + '", doc: "[^"]+" \\},?$', "gm");
        let last = null;
        let m;
        while ((m = re.exec(source)) !== null) { last = m; }
        if (!last) {
            throw new Error("could not find the " + meta.category +
                " block in js/admin.js to append to.");
        }
        const line = '        { id: "' + meta.id + '", title: "' + meta.title +
            '", category: "' + meta.category + '", doc: "' + meta.id + '" },';
        const at = last.index + last[0].length;
        const patched = source.slice(0, at) + "\n" + line + source.slice(at);
        const syntax = parses(patched);
        if (syntax) { return Promise.reject(new Error("refused to write js/admin.js: " + syntax)); }
        return { path: ADMIN_PATH, source: patched, action: "inserted" };
    }

    /* Every write for one publish, planned and PROVED before any of them
       happens, then written in an order where a half-failure is inert.

       The registry goes first and the catalog card last, which is the inverse
       of the thumbnail panel's order and the same principle: there, an
       unreferenced image is harmless and a reference to a missing file is a
       visible defect. Here a descriptor nothing links to is inert, and a card
       whose data-doc names a template that does not exist is a broken entry
       point. */
    async function publish(plans) {
        if (!FS || !FS.isConnected()) {
            throw new Error("Connect the project folder first, or use Copy and paste by hand.");
        }
        const written = [];
        for (const plan of plans) {
            if (!plan) { continue; }
            await FS.writeFile(plan.path, new Blob([plan.source], { type: "text/plain" }));
            written.push(plan.path);
        }
        return written;
    }

    return {
        /* The source surgery, exposed for the panel and for the suite. */
        matchBalanced,
        commentBytes,
        commentCost,
        findEntryRange,
        findKeyedRange,
        registryRegion,
        evaluateRegistry,
        verifyRegistry,
        spliceRegistry,
        planRegistryEdit,
        planCatalogCard,
        planAdminEntry,
        serializeEntry,
        deepEqual,
        parses,
        publish,
        loadRegistries,
        readSource,
        validateResume,
        validateDoc,
        RESUME_CFG,
        DOCS_CFG,
        DOC_LAYOUTS,
        FORM_FIELDS,
        FORM_LISTS,
        FAMILIES
    };
})();
