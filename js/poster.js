/* ==========================================================================
   TemplateBox - Poster & Canvas Creator Core Logic
   Responsibilities: strict client-side image mime-type validation, HTML5
   Canvas composition (photo, matte, frame, caption typography), real-time
   localStorage retention of text settings, and high-resolution PNG export
   through a local canvas.toDataURL() stream.
   Depends on: js/app.js (TB.sanitize, TB.desanitize, TB.storageGet/Set)
   ========================================================================== */

"use strict";

(() => {

    const STORAGE_KEY = "tb_poster_v1";

    /* Fixed internal resolution: the visible element scales via CSS while
       exports always render at full 1200 x 1500 quality. */
    const CANVAS_W = 1200;
    const CANVAS_H = 1500;
    const FRAME_WIDTH = 60;
    const MATTE_WIDTH = 50;
    const CAPTION_STRIP = 170;

    const FRAME_STYLES = {
        black: { frame: "#111111", trim: "#111111" },
        wood: { frame: "#7B5B3A", trim: "#5E4426" },
        gold: { frame: "#C9A227", trim: "#A5841C" }
    };

    const canvas = document.getElementById("poster-canvas");
    if (!canvas) {
        return;
    }
    const ctx = canvas.getContext("2d");

    const fileInput = document.getElementById("p-image");
    const fileError = document.getElementById("p-image-error");
    const captionInput = document.getElementById("p-caption");
    const frameSelect = document.getElementById("p-frame");

    /* The uploaded photo lives only in memory. Image data is intentionally
       never written to localStorage to respect browser quota limits. */
    let photo = null;

    /* ----------------------------------------------------------------------
       Canvas composition
       ---------------------------------------------------------------------- */

    function drawCoverImage(img, x, y, w, h) {
        /* Cover-crop: scale to fill the target rect, trim the overflow. */
        const scale = Math.max(w / img.width, h / img.height);
        const sw = w / scale;
        const sh = h / scale;
        const sx = (img.width - sw) / 2;
        const sy = (img.height - sh) / 2;
        ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    }

    function draw() {
        const styleKey = FRAME_STYLES[frameSelect.value] ? frameSelect.value : "black";
        const frame = FRAME_STYLES[styleKey];
        const caption = captionInput.value.trim();

        /* Frame */
        ctx.fillStyle = frame.frame;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        /* Trim line inside the frame for wood and gold finishes */
        ctx.strokeStyle = frame.trim;
        ctx.lineWidth = 6;
        ctx.strokeRect(FRAME_WIDTH - 14, FRAME_WIDTH - 14,
            CANVAS_W - (FRAME_WIDTH - 14) * 2, CANVAS_H - (FRAME_WIDTH - 14) * 2);

        /* White matte board */
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(FRAME_WIDTH, FRAME_WIDTH,
            CANVAS_W - FRAME_WIDTH * 2, CANVAS_H - FRAME_WIDTH * 2);

        /* Photo window */
        const px = FRAME_WIDTH + MATTE_WIDTH;
        const py = FRAME_WIDTH + MATTE_WIDTH;
        const pw = CANVAS_W - px * 2;
        const ph = CANVAS_H - py * 2 - CAPTION_STRIP;

        if (photo) {
            drawCoverImage(photo, px, py, pw, ph);
        } else {
            ctx.fillStyle = "#F4F3EF";
            ctx.fillRect(px, py, pw, ph);
            ctx.fillStyle = "#6B6B66";
            ctx.font = '400 40px "Inter", sans-serif';
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("Upload a photo to begin", CANVAS_W / 2, py + ph / 2);
        }

        /* Caption typography on the matte strip */
        if (caption) {
            ctx.fillStyle = "#1A1A1A";
            ctx.font = 'italic 700 64px "Playfair Display", Georgia, serif';
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(caption, CANVAS_W / 2, CANVAS_H - FRAME_WIDTH - MATTE_WIDTH - CAPTION_STRIP / 2, pw);
        }
    }

    /* ----------------------------------------------------------------------
       Image upload with explicit mime-type validation. Execution terminates
       immediately when file.type does not match the image.* designation.
       ---------------------------------------------------------------------- */

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
            draw();
            return;
        }

        const reader = new FileReader();
        reader.addEventListener("load", () => {
            const img = new Image();
            img.addEventListener("load", () => {
                photo = img;
                draw();
            });
            img.addEventListener("error", () => {
                fileError.textContent = "That image could not be decoded. Please try a different file.";
                fileInput.value = "";
            });
            img.src = reader.result;
        });
        reader.readAsDataURL(file);
    });

    /* ----------------------------------------------------------------------
       Real-time retention of text settings in localStorage.
       ---------------------------------------------------------------------- */

    function persist() {
        TB.storageSet(STORAGE_KEY, {
            caption: TB.sanitize(captionInput.value),
            frame: FRAME_STYLES[frameSelect.value] ? frameSelect.value : "black"
        });
    }

    captionInput.addEventListener("input", () => {
        persist();
        draw();
    });

    frameSelect.addEventListener("change", () => {
        persist();
        draw();
    });

    /* ----------------------------------------------------------------------
       High-resolution PNG export via a local data stream. The delivered
       file is completely clean: no ads run on the export action.
       ---------------------------------------------------------------------- */

    document.getElementById("download-png").addEventListener("click", () => {
        const link = document.createElement("a");
        link.href = canvas.toDataURL("image/png");
        link.download = "templatebox-poster.png";
        link.click();
    });

    /* ----------------------------------------------------------------------
       Initialization: hydrate saved settings, then first paint. A second
       paint fires once the display fonts finish loading so the caption
       renders in Playfair Display rather than the fallback serif.
       ---------------------------------------------------------------------- */

    const saved = TB.storageGet(STORAGE_KEY);
    if (saved) {
        captionInput.value = TB.desanitize(saved.caption || "");
        if (FRAME_STYLES[saved.frame]) {
            frameSelect.value = saved.frame;
        }
    }

    draw();

    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(draw);
    }
})();
