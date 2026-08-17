/* ==========================================================================
   TemplateBox - poster editor behaviour verification

   Run:  node tests/verify-poster-editor.js

   WHY THIS EXISTS, SEPARATELY FROM verify-layout.js
   That suite measures geometry: where boxes land, which ad band mounts, what
   the header's right edge does. It is deliberately blind to whether a control
   does anything, because for four form-driven editors the layout WAS the risk.

   The poster editor stopped being form-driven (August 16, 2026): it now has a
   model, a history stack and five export paths, and every one of those can
   break without moving a single pixel. An undo button that never enables, a
   download panel that shows PDF options for a PNG, an export that throws
   inside a try/catch and silently produces nothing -- none of that is
   visible to a layout assertion.

   This file drives the real controls over CDP and asserts on the model and on
   the blobs the export paths actually produce, rather than on their styling.
   No npm dependencies, same approach as verify-layout.js: it starts and stops
   its own server and finds a browser already on the machine. Exit code 1 on
   any failure.
   ========================================================================== */

"use strict";

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = "c:\\Users\\hp\\Desktop\\TemplateBox";
const PORT = 5131;
const CDP = 9461;

let pass = 0;
const fails = [];
function check(name, ok, detail) {
    if (ok) { pass += 1; console.log("  ok   " + name); return; }
    fails.push(name);
    console.log("  FAIL " + name + (detail ? "\n       " + detail : ""));
}

function findBrowser() {
    const c = [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
    ];
    const cache = path.join(process.env.LOCALAPPDATA || "", "ms-playwright");
    if (fs.existsSync(cache)) {
        fs.readdirSync(cache).filter((d) => d.startsWith("chromium-")).forEach((d) => {
            c.unshift(path.join(cache, d, "chrome-win64", "chrome.exe"));
        });
    }
    return c.find((p) => p && fs.existsSync(p)) || null;
}

(async () => {
    const browserPath = findBrowser();
    const server = spawn(`npx serve -l ${PORT}`, { cwd: ROOT, stdio: "ignore", shell: true });
    for (let i = 0; i < 60; i += 1) {
        await new Promise((r) => setTimeout(r, 250));
        try { if ((await fetch(`http://localhost:${PORT}/`)).ok) { break; } } catch (e) { /* wait */ }
    }

    const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "tb-smoke-"));
    const proc = spawn(browserPath, ["--headless=new", "--remote-debugging-port=" + CDP,
        "--user-data-dir=" + userDir, "--no-first-run", "--disable-gpu",
        "--force-device-scale-factor=1"], { stdio: "ignore" });

    let wsUrl = null;
    for (let i = 0; i < 80 && !wsUrl; i += 1) {
        await new Promise((r) => setTimeout(r, 250));
        try { wsUrl = (await (await fetch(`http://127.0.0.1:${CDP}/json/version`)).json()).webSocketDebuggerUrl; } catch (e) { /* wait */ }
    }
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    const logs = [];
    let nextId = 1;
    await new Promise((r) => ws.addEventListener("open", r, { once: true }));
    ws.addEventListener("message", (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id && pending.has(m.id)) {
            const e = pending.get(m.id);
            pending.delete(m.id);
            if (m.error) { e.reject(new Error(m.error.message)); } else { e.resolve(m.result); }
        } else if (m.method === "Runtime.exceptionThrown") {
            logs.push("EXCEPTION: " + JSON.stringify(m.params.exceptionDetails.text || ""));
        } else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
            logs.push("console.error");
        }
    });
    const call = (method, params, sid) => new Promise((res, rej) => {
        const id = nextId += 1;
        pending.set(id, { resolve: res, reject: rej });
        ws.send(JSON.stringify({ id, method, params: params || {}, sessionId: sid }));
    });
    const { targetId } = await call("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true });
    await call("Page.enable", {}, sessionId);
    await call("Runtime.enable", {}, sessionId);
    const ev = async (expr) => (await call("Runtime.evaluate",
        { expression: expr, returnByValue: true, awaitPromise: true }, sessionId)).result.value;

    await call("Emulation.setDeviceMetricsOverride",
        { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await call("Page.navigate", { url: `http://localhost:${PORT}/poster.html` }, sessionId);
    for (let i = 0; i < 80; i += 1) {
        await new Promise((r) => setTimeout(r, 100));
        const ok = await ev("!!document.getElementById('t-caption') && typeof TB !== 'undefined'");
        if (ok) { break; }
    }
    await new Promise((r) => setTimeout(r, 600));

    console.log("\n--- poster editor smoke ---");

    check("no uncaught exceptions on load", logs.length === 0, logs.join(" | "));

    check("toolbar controls present", await ev(`
        !!document.getElementById('act-undo') && !!document.getElementById('act-redo') &&
        !!document.getElementById('dl-toggle') && !!document.getElementById('doc-name') &&
        !!document.querySelector('.editor-home')`));

    check("save indicator keeps its icon and has a hidden label",
        await ev(`(() => { const e = document.getElementById('save-state');
            return !!e.querySelector('svg') && !!e.querySelector('[data-save-label]'); })()`));

    check("font and paper selects are populated",
        await ev("document.getElementById('t-font').options.length > 3 && document.getElementById('p-size').options.length === 5"));

    check("emoji grid built with real buttons",
        await ev("document.querySelectorAll('#emoji-grid button').length > 50"));

    check("text toolbar visible (an element is selected by default)",
        await ev("document.getElementById('text-toolbar').hidden === false"));

    check("undo starts disabled", await ev("document.getElementById('act-undo').disabled === true"));

    /* Type into the caption and confirm the model + canvas react. */
    await ev(`(() => { const f = document.getElementById('t-caption');
        f.value = 'Hello poster'; f.dispatchEvent(new Event('input', {bubbles:true})); })()`);
    await new Promise((r) => setTimeout(r, 150));

    check("typing enables undo", await ev("document.getElementById('act-undo').disabled === false"));
    check("typing persists to localStorage under the caption key the homepage reads",
        await ev(`(() => { const raw = JSON.parse(localStorage.getItem('tb_poster_v1'));
            return raw && typeof raw.caption === 'string' && raw.caption.indexOf('Hello') === 0; })()`));
    check("typing writes the element list too",
        await ev(`(() => { const raw = JSON.parse(localStorage.getItem('tb_poster_v1'));
            return Array.isArray(raw.texts) && raw.texts.length === 1; })()`));

    check("canvas actually painted pixels",
        await ev(`(() => { const c = document.getElementById('poster-canvas');
            const d = c.getContext('2d').getImageData(0,0,4,4).data; return d[3] > 0; })()`));

    /* Undo should revert the typed text. */
    await ev("document.getElementById('act-undo').click()");
    await new Promise((r) => setTimeout(r, 120));
    check("undo reverts the typed caption",
        await ev(`(() => { const raw = JSON.parse(localStorage.getItem('tb_poster_v1'));
            return raw.caption === ''; })()`));
    check("redo becomes available", await ev("document.getElementById('act-redo').disabled === false"));

    await ev("document.getElementById('act-redo').click()");
    await new Promise((r) => setTimeout(r, 120));
    check("redo restores the caption",
        await ev(`(() => { const raw = JSON.parse(localStorage.getItem('tb_poster_v1'));
            return raw.caption.indexOf('Hello') === 0; })()`));

    /* Formatting toggles */
    await ev("document.getElementById('t-bold').click()");
    await new Promise((r) => setTimeout(r, 100));
    check("bold toggle flips aria-pressed",
        await ev("document.getElementById('t-bold').getAttribute('aria-pressed') === 'false'"));

    /* Download panel */
    await ev("document.getElementById('dl-toggle').click()");
    await new Promise((r) => setTimeout(r, 150));
    check("download panel opens", await ev("document.getElementById('dl-panel').hidden === false"));
    check("panel reports real output dimensions",
        await ev("/\\d+ x \\d+ px at \\d+ DPI/.test(document.getElementById('dl-dimensions').textContent)"),
        await ev("document.getElementById('dl-dimensions').textContent"));

    check("PNG options shown, PDF options hidden for the default type",
        await ev(`document.getElementById('dl-group-png').hidden === false &&
                  document.getElementById('dl-group-pdf').hidden === true`));

    await ev(`(() => { const t = document.getElementById('dl-type'); t.value='pdf';
        t.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await new Promise((r) => setTimeout(r, 120));
    check("switching to PDF swaps the option groups",
        await ev(`document.getElementById('dl-group-pdf').hidden === false &&
                  document.getElementById('dl-group-png').hidden === true`));

    await ev(`(() => { const p = document.getElementById('dl-pdf-preset'); p.value='print';
        p.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await new Promise((r) => setTimeout(r, 120));
    check("print preset reveals colour profile and crop marks",
        await ev("document.getElementById('dl-group-pdf-print').hidden === false"));

    /* Paper size must change the EXPORT dimensions, not the preview shape.
       Every ISO A size shares the same 1:sqrt(2) ratio by definition, so an
       assertion that the canvas proportions change between A3 and A0 tests
       the opposite of correct behaviour -- it was written that way first and
       failed against working code, which is what surfaced the point. */
    const beforeRatio = await ev("(() => { const c=document.getElementById('poster-canvas'); return c.width/c.height; })()");
    const beforeDims = await ev("document.getElementById('dl-dimensions').textContent");
    await ev(`(() => { const s=document.getElementById('p-size'); s.value='A0';
        s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await new Promise((r) => setTimeout(r, 200));
    const afterRatio = await ev("(() => { const c=document.getElementById('poster-canvas'); return c.width/c.height; })()");
    const afterDims = await ev("document.getElementById('dl-dimensions').textContent");

    check("paper size keeps the ISO A aspect ratio (1:sqrt2) across sizes",
        Math.abs(beforeRatio - afterRatio) < 0.001 && Math.abs(afterRatio - 1 / Math.SQRT2) < 0.002,
        `A3 ${beforeRatio} vs A0 ${afterRatio}`);
    check("paper size changes the reported export dimensions",
        beforeDims !== afterDims && afterDims.indexOf("841 x 1189 mm") === 0,
        `${beforeDims}  ->  ${afterDims}`);
    check("an oversized sheet reports the DPI it will really use, not the one asked for",
        /reduced from the requested DPI/.test(afterDims), afterDims);

    /* Exports: run the real code paths and confirm they produce data. */
    check("SVG export produces vector text",
        await ev(`(() => { try {
            const saved = []; const oldCreate = document.createElement.bind(document);
            let svgText = null;
            const origUrl = URL.createObjectURL;
            URL.createObjectURL = (b) => { saved.push(b); return 'blob:stub'; };
            document.getElementById('dl-type').value = 'svg';
            document.getElementById('dl-go').click();
            URL.createObjectURL = origUrl;
            return saved.length === 1 && saved[0].type.indexOf('svg') >= 0 && saved[0].size > 100;
        } catch (e) { return 'threw: ' + e.message; } })()`) === true);

    check("PNG export produces a png blob",
        await ev(`(() => { try {
            const saved = []; const origUrl = URL.createObjectURL;
            URL.createObjectURL = (b) => { saved.push(b); return 'blob:stub'; };
            document.getElementById('dl-type').value = 'png';
            document.getElementById('dl-dpi').value = '72';
            document.getElementById('dl-go').click();
            URL.createObjectURL = origUrl;
            return saved.length === 1 && saved[0].type === 'image/png' && saved[0].size > 1000;
        } catch (e) { return 'threw: ' + e.message; } })()`) === true);

    check("PPTX export produces a zip with the OOXML content type",
        await ev(`(async () => { try {
            const saved = []; const origUrl = URL.createObjectURL;
            URL.createObjectURL = (b) => { saved.push(b); return 'blob:stub'; };
            document.getElementById('dl-type').value = 'pptx';
            document.getElementById('dl-dpi').value = '72';
            document.getElementById('dl-go').click();
            URL.createObjectURL = origUrl;
            if (saved.length !== 1) { return 'no blob'; }
            const buf = new Uint8Array(await saved[0].arrayBuffer());
            // Local file header signature "PK\\u0003\\u0004"
            return buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 3 && buf[3] === 4 && buf.length > 2000;
        } catch (e) { return 'threw: ' + e.message; } })()`) === true);

    /* PDF is the branch with the most logic behind it (a raster composite, a
       real vector text layer over the top, crop marks, colour conversion), so
       it is worth more than "did not throw". jsPDF comes from a CDN, which a
       machine running these tests may not be able to reach -- that is reported
       rather than silently passing, because a skipped check that looks like a
       pass is worse than a visible gap. */
    /* jsPDF is a CDN dependency, so whether it loads is a property of the
       machine rather than of this code -- reported for information, never
       asserted, because a test that fails on a train is a test people learn to
       ignore. */
    const jspdfUp = await ev("typeof window.jspdf !== 'undefined' && !!window.jspdf.jsPDF");
    console.log("  note: real jsPDF " + (jspdfUp ? "loaded" : "unreachable") +
        " on this machine; PDF assertions run against a recording stub either way");

    {
        /* A recording stub with the same API surface, asserting on the CALLS
           the exporter makes. This deliberately does not test jsPDF -- it
           tests this project's export logic, which is the part that can
           regress: whether real text operators are emitted at all (the
           standing rule from RESUME_PDF_RASTERIZED_TEXT_FIX.md), whether
           flatten suppresses them, and whether crop marks and bleed do what
           the checkbox claims. Stubbing unconditionally also makes the result
           identical on a machine with and without network. */
        const stubbed = await ev(`(() => {
            const log = { text: 0, addImage: 0, line: 0, width: null, encrypted: false };
            function Stub(opts) {
                log.width = Array.isArray(opts.format) ? opts.format[0] : null;
                log.encrypted = !!opts.encryption;
            }
            Stub.prototype.addImage = function () { log.addImage += 1; };
            Stub.prototype.text = function () { log.text += 1; };
            Stub.prototype.line = function () { log.line += 1; };
            Stub.prototype.setFontSize = function () {};
            Stub.prototype.setFont = function () {};
            Stub.prototype.setTextColor = function () {};
            Stub.prototype.setDrawColor = function () {};
            Stub.prototype.setLineWidth = function () {};
            Stub.prototype.setProperties = function () {};
            Stub.prototype.save = function () { log.saved = true; };
            window.jspdf = { jsPDF: Stub };
            window.__pdfLog = log;
            return true;
        })()`);

        const run = async (setup) => ev(`(() => {
            window.__pdfLog.text = 0; window.__pdfLog.addImage = 0; window.__pdfLog.line = 0;
            ${setup}
            document.getElementById('dl-type').value = 'pdf';
            document.getElementById('dl-dpi').value = '72';
            document.getElementById('dl-go').click();
            return JSON.stringify(window.__pdfLog);
        })()`);

        check("PDF stub installed", stubbed === true);

        const plain = JSON.parse(await run(`
            document.getElementById('dl-pdf-flatten').checked = false;
            const p = document.getElementById('dl-pdf-preset'); p.value='digital';
            p.dispatchEvent(new Event('change',{bubbles:true}));`));
        check("PDF writes the artwork as an image AND real text operators over it",
            plain.addImage === 1 && plain.text >= 1, JSON.stringify(plain));

        const flat = JSON.parse(await run(`
            document.getElementById('dl-pdf-flatten').checked = true;`));
        check("flatten suppresses the vector text layer",
            flat.addImage === 1 && flat.text === 0, JSON.stringify(flat));

        const crop = JSON.parse(await run(`
            document.getElementById('dl-pdf-flatten').checked = false;
            const p = document.getElementById('dl-pdf-preset'); p.value='print';
            p.dispatchEvent(new Event('change',{bubbles:true}));
            document.getElementById('dl-pdf-crop').checked = true;
            const s = document.getElementById('p-size'); s.value='A3';
            s.dispatchEvent(new Event('change',{bubbles:true}));`));
        check("crop marks draw 8 marks and bleed enlarges the sheet by 3mm a side",
            crop.line === 8 && Math.abs(crop.width - (297 + 6)) < 0.01, JSON.stringify(crop));

        const enc = JSON.parse(await run(`
            document.getElementById('dl-pdf-password').value = 'hunter2';`));
        check("a password request reaches the PDF as encryption options",
            enc.encrypted === true, JSON.stringify(enc));
    }
    console.log(`\n${pass} passed, ${fails.length} failed`);
    if (logs.length) { console.log("page errors: " + logs.join(" | ")); }
    ws.close();
    proc.kill();
    /* shell:true means server is the SHELL; npx spawns serve beneath it, so
       server.kill() alone leaves a live server holding the port and the next
       run either talks to a stale tree or times out against it. Same fix as
       startServer() in verify-layout.js. */
    try {
        if (process.platform === "win32") {
            spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
        } else {
            process.kill(-server.pid, "SIGKILL");
        }
    } catch (err) { /* already gone */ }
    server.kill();
    process.exit(fails.length ? 1 : 0);
})();
