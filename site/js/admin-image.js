/* ==========================================================================
   TemplateBox - Admin Image Encoder (admin.html only)

   One in-browser image pipeline, shared by both halves of the admin panel:
   the catalog thumbnail workspace and the blog cover intake. Everything runs
   on the client, in a canvas, with no library and no upload -- nothing here
   talks to a server, per Rule 1.

   Why it is a module rather than a copy. Both halves need the same work
   (gate the mime type, decode, optionally reshape, downscale, search for the
   highest quality that fits a byte budget) and differ only in their numbers.
   This project has been bitten twice by the alternative: the footer constant
   in js/admin.js drifted from the 21 hand-maintained copies
   (EXTERNAL: EXPORTED_POST_PAGE_FOOTER_DRIFT.md), and loading.html's inline
   route whitelist needs a test to keep it honest against EDITOR_ROUTES. A
   second encoder would drift the same way and the drift would be invisible:
   both halves would keep working, just differently.

   The caller supplies the policy, this file supplies the mechanism:

       TBAdminImage.prepare(file, {
           targetBytes,      REQUIRED. Byte budget for the output.
           maxEdge,          REQUIRED. Cap on the longest side, in pixels.
           aspect,           Reshape to this ratio (w/h), or null to keep the
                             source's own shape.
           aspectLabel,      How to name that ratio in operator-facing text.
           fitMode,          "fill" centre-crops to `aspect`, "fit" pads it.
                             Ignored when `aspect` is null.
           maxInputBytes,    Decode guard. Defaults to 24 MB.
           oversizeMessage,  What to say when the guard trips.
           onProgress        Called with a status string before the encode.
       })

   Resolves to { data, ext, w, h, note } and rejects with an Error whose
   message is fit to show the operator verbatim.
   ========================================================================== */

"use strict";

window.TBAdminImage = (() => {

    /* Quality floor for the search. Below this the artefacts are visible at
       ordinary viewing size, not merely on close inspection, and shipping a
       visibly broken image to hit a byte count is the wrong trade -- the
       encoder gives up pixels instead. */
    const MIN_QUALITY = 0.45;
    const MAX_QUALITY = 0.92;

    const DEFAULT_MAX_INPUT_BYTES = 24 * 1024 * 1024;

    /* One pixel of slack per thousand: an 800x1000 upload must not be
       re-drawn just because floating point disagrees with itself. */
    const ASPECT_TOLERANCE = 0.001;

    /* Mime type to file extension. This names the OUTPUT format, which the
       encoder chooses -- it is not a gate on what may be uploaded, because
       anything the browser can decode is re-encoded into one of these.
       Deriving the extension from file.name would take it from a
       user-controlled string: a file called "art.jpg" that is really a PNG
       would be written as .jpg and any generated markup would point at a
       file the deploy does not contain. */
    const EXT_BY_TYPE = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp"
    };

    function kb(bytes) {
        return bytes >= 1024 * 1024
            ? (bytes / (1024 * 1024)).toFixed(1) + " MB"
            : Math.round(bytes / 1024) + " KB";
    }

    /* ----------------------------------------------------------------------
       Primitives
       ---------------------------------------------------------------------- */
    function readFileAsDataUri(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error("The file could not be read."));
            reader.onload = () => resolve(String(reader.result || ""));
            reader.readAsDataURL(file);
        });
    }

    function decode(dataUri) {
        return new Promise((resolve, reject) => {
            const probe = new Image();
            probe.onerror = () => reject(
                new Error("The file claims to be an image but could not be decoded."));
            probe.onload = () => resolve(probe);
            probe.src = dataUri;
        });
    }

    function encode(canvas, mime, quality) {
        return new Promise((resolve) => {
            canvas.toBlob((blob) => resolve(blob), mime, quality);
        });
    }

    function blobToDataUri(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error("The encoded image could not be read back."));
            reader.onload = () => resolve(String(reader.result || ""));
            reader.readAsDataURL(blob);
        });
    }

    function paint(source, w, h) {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(source, 0, 0, w, h);
        return canvas;
    }

    /* An <img> reports naturalWidth; a <canvas> reports width. Both are valid
       drawImage sources and both flow through this pipeline, since the
       reshape pass hands a canvas to the scaler. */
    function srcW(source) { return source.naturalWidth || source.width; }
    function srcH(source) { return source.naturalHeight || source.height; }

    /* ----------------------------------------------------------------------
       Reshaping to a target ratio.

       Used by the catalog thumbnails, where .card-preview is
       `aspect-ratio: 4 / 5` and `.card-preview.photo .card-thumb` is
       `object-fit: contain`. Making the FILE the right shape is what stops
       `contain` having anything left to decide, so no per-card class is
       needed and none can be dropped by a later publish.

       `aspect: null` skips all of this, which is what blog covers want: a
       cover has no fixed shape to conform to.
       ---------------------------------------------------------------------- */
    function isRatio(source, aspect) {
        if (!aspect) {
            return true;
        }
        return Math.abs((srcW(source) / srcH(source)) - aspect) <= ASPECT_TOLERANCE;
    }

    /* Two modes, both producing a file at `aspect`. They differ only in what
       happens to the pixels that do not fit:

         fill  centre-crop. The frame is filled edge to edge. What a mockup or
               a photograph wants.
         fit   pad. The whole design stays visible, letterboxed inside a file
               that is still the target ratio.

       An image already at the ratio is returned untouched, so the common case
       costs no re-draw at all. */
    function fitToAspect(img, aspect, mode) {
        if (!aspect || isRatio(img, aspect)) {
            return img;
        }

        const w = srcW(img);
        const h = srcH(img);

        if (mode === "fit") {
            /* Grow the short side to the ratio rather than shrinking the long
               one: nothing is thrown away and no resolution is lost. */
            const outW = Math.max(w, Math.round(h * aspect));
            const outH = Math.max(h, Math.round(w / aspect));
            const canvas = document.createElement("canvas");
            canvas.width = outW;
            canvas.height = outH;
            const ctx = canvas.getContext("2d");
            /* The padding is left TRANSPARENT rather than filled with a
               ground colour, and that is a dark-mode decision. A baked light
               pad is a pale band down each side for every visitor on the dark
               theme, permanently, because a file cannot respond to a media
               query. Transparent padding lets the container's own background
               show through.

               The cost is the format: JPEG has no alpha channel, so a padded
               image can only be encoded as WebP or PNG. compress() below
               already detects transparency and drops JPEG from its format
               list for exactly this reason. */
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(img, Math.round((outW - w) / 2), Math.round((outH - h) / 2), w, h);
            return canvas;
        }

        /* fill: take the largest window at the ratio the source contains,
           centred. */
        const cropW = Math.min(w, Math.round(h * aspect));
        const cropH = Math.min(h, Math.round(w / aspect));
        const canvas = document.createElement("canvas");
        canvas.width = cropW;
        canvas.height = cropH;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, Math.round((w - cropW) / 2), Math.round((h - cropH) / 2),
            cropW, cropH, 0, 0, cropW, cropH);
        return canvas;
    }

    /* Downscale in halving steps rather than one jump. Every browser's
       one-shot drawImage undersamples heavily on a large reduction -- a
       3000px photograph drawn straight to 800px samples a fraction of the
       pixels it skips, which reads as aliasing on any fine detail such as
       fabric weave or text. Halving repeatedly averages the pixels that are
       being discarded, and it is the difference between an image that looks
       resized and one that looks sharp. */
    function scaleTo(img, maxEdge) {
        const longest = Math.max(srcW(img), srcH(img));
        const ratio = Math.min(1, maxEdge / longest);
        const targetW = Math.max(1, Math.round(srcW(img) * ratio));
        const targetH = Math.max(1, Math.round(srcH(img) * ratio));

        let source = img;
        let w = srcW(img);
        let h = srcH(img);
        while (w > targetW * 2 && h > targetH * 2) {
            w = Math.max(targetW, Math.round(w / 2));
            h = Math.max(targetH, Math.round(h / 2));
            source = paint(source, w, h);
        }
        return paint(source, targetW, targetH);
    }

    /* JPEG cannot carry an alpha channel: flattening a transparent image into
       it paints the transparent region solid black. Only PNG and WebP survive
       it, so transparency decides the format list. The source is a data URI,
       so the canvas is never tainted and getImageData is allowed. Every pixel
       is scanned rather than sampled -- a sampled scan misses a one-pixel
       transparent border, which is exactly the case that would come back as a
       black outline. */
    function hasTransparency(canvas) {
        const pixels = canvas.getContext("2d")
            .getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 3; i < pixels.length; i += 4) {
            if (pixels[i] < 255) {
                return true;
            }
        }
        return false;
    }

    let webpSupport = null;
    async function supportsWebp() {
        if (webpSupport === null) {
            const probe = document.createElement("canvas");
            probe.width = 1;
            probe.height = 1;
            const blob = await encode(probe, "image/webp", 0.8);
            /* A browser that cannot encode WebP silently returns PNG rather
               than failing, so the type is the only honest test. */
            webpSupport = Boolean(blob) && blob.type === "image/webp";
        }
        return webpSupport;
    }

    /* Highest quality that fits the budget, by binary search. Six probes land
       within about one part in seventy of the true threshold, which is finer
       than the encoder's own quality granularity, and costs six encodes
       instead of the dozen a linear walk down would take. */
    async function bestQualityUnder(canvas, mime, targetBytes) {
        const top = await encode(canvas, mime, MAX_QUALITY);
        if (!top || top.type !== mime) {
            return null;
        }
        if (top.size <= targetBytes) {
            return { blob: top, quality: MAX_QUALITY };
        }

        let low = MIN_QUALITY;
        let high = MAX_QUALITY;
        let best = null;
        for (let i = 0; i < 6; i += 1) {
            const mid = (low + high) / 2;
            const blob = await encode(canvas, mime, mid);
            if (blob && blob.type === mime && blob.size <= targetBytes) {
                best = { blob: blob, quality: mid };
                low = mid;
            } else {
                high = mid;
            }
        }
        return best;
    }

    /* Format, dimensions and quality that together meet the budget. Tries the
       full size first and only gives up pixels when quality alone cannot get
       there, because dropping resolution is the more visible of the two
       losses at ordinary viewing size. */
    async function compress(img, opts) {
        /* Reshape BEFORE scaling, so the long edge that maxEdge caps is the
           one that survives into the file. Cropping after the scale would
           leave a 1000px source producing an 800px-tall output. */
        const source = fitToAspect(img, opts.aspect, opts.fitMode);
        const full = scaleTo(source, opts.maxEdge);
        const transparent = hasTransparency(full);
        const webp = await supportsWebp();

        /* WebP first wherever it exists: at equal perceived quality it is
           reliably a quarter to a third smaller than JPEG, which is the whole
           reason these budgets are reachable at these dimensions. */
        const formats = [];
        if (webp) { formats.push("image/webp"); }
        if (!transparent) { formats.push("image/jpeg"); }
        if (transparent && !webp) { formats.push("image/png"); }

        let canvas = full;
        for (let attempt = 0; attempt < 4; attempt += 1) {
            for (const mime of formats) {
                if (mime === "image/png") {
                    /* PNG ignores the quality argument; it either fits at
                       this size or it does not. */
                    const blob = await encode(canvas, "image/png");
                    if (blob && blob.size <= opts.targetBytes) {
                        return { blob: blob, mime: mime, w: canvas.width, h: canvas.height };
                    }
                    continue;
                }
                const found = await bestQualityUnder(canvas, mime, opts.targetBytes);
                if (found) {
                    return {
                        blob: found.blob, mime: mime,
                        w: canvas.width, h: canvas.height
                    };
                }
            }
            const nextEdge = Math.round(Math.max(canvas.width, canvas.height) * 0.75);
            if (nextEdge < 200) { break; }
            /* From the reshaped source, not the original: dropping back to
               `img` here would undo the crop on every retry. */
            canvas = scaleTo(source, nextEdge);
        }
        return null;
    }

    /* ----------------------------------------------------------------------
       Intake. Mime-type gate per the project standard: file.type must be an
       image type, otherwise processing terminates immediately. The decode is
       a second gate -- a file can carry an image mime type and still not be
       an image.

       An upload that already fits the budget at sensible dimensions AND at
       the right shape is kept byte for byte. Re-encoding it would only throw
       away quality to reach a size it had already reached.
       ---------------------------------------------------------------------- */
    async function prepare(file, options) {
        const opts = {
            targetBytes: options.targetBytes,
            maxEdge: options.maxEdge,
            aspect: options.aspect || null,
            aspectLabel: options.aspectLabel || "",
            fitMode: options.fitMode === "fit" ? "fit" : "fill",
            maxInputBytes: options.maxInputBytes || DEFAULT_MAX_INPUT_BYTES
        };

        if (!file.type.startsWith("image/")) {
            throw new Error("Rejected: the selected file is not an image.");
        }
        if (file.size > opts.maxInputBytes) {
            throw new Error(options.oversizeMessage ||
                ("Rejected: file is over " + kb(opts.maxInputBytes) +
                    ". Export a smaller copy first."));
        }

        const original = await readFileAsDataUri(file);
        const img = await decode(original);
        const shapeSuffix = opts.aspect ? " and " + opts.aspectLabel : "";

        /* The ratio test is not decoration. Without it a square upload
           already under the budget is kept byte for byte and walks straight
           past the reshape pass -- which is precisely how the 1000x1000 pair
           that letterboxed its card got onto disk. An upload has to be the
           right SHAPE as well as the right size to skip re-encoding. */
        const alreadyFits = file.size <= opts.targetBytes &&
            Math.max(img.naturalWidth, img.naturalHeight) <= opts.maxEdge &&
            isRatio(img, opts.aspect) &&
            Object.prototype.hasOwnProperty.call(EXT_BY_TYPE, file.type);
        if (alreadyFits) {
            return {
                data: original,
                ext: EXT_BY_TYPE[file.type],
                w: img.naturalWidth,
                h: img.naturalHeight,
                note: "Kept as uploaded: " + kb(file.size) + ", " +
                    img.naturalWidth + "x" + img.naturalHeight +
                    ". Already" + shapeSuffix + " within budget, so it was not re-encoded."
            };
        }

        if (options.onProgress) {
            options.onProgress("Compressing " + kb(file.size) + " image...");
            /* Yields a frame so the message paints before the encoder locks
               the main thread. */
            await new Promise((resolve) => window.setTimeout(resolve, 0));
        }

        const result = await compress(img, opts);
        if (!result) {
            throw new Error("Could not get this image under " + kb(opts.targetBytes) +
                " without destroying it. Crop or flatten it and try again.");
        }

        const data = await blobToDataUri(result.blob);
        const resized = result.w !== img.naturalWidth || result.h !== img.naturalHeight;
        const reshaped = !isRatio(img, opts.aspect);
        return {
            data: data,
            ext: EXT_BY_TYPE[result.mime],
            w: result.w,
            h: result.h,
            note: "Compressed " + kb(file.size) + " to " + kb(result.blob.size) +
                " " + EXT_BY_TYPE[result.mime].toUpperCase() + ", " +
                result.w + "x" + result.h +
                (reshaped
                    ? (opts.fitMode === "fit" ? " (padded to " : " (cropped to ") +
                        opts.aspectLabel + ")"
                    : "") +
                (resized ? " (resized from " + img.naturalWidth + "x" + img.naturalHeight + ")" : "") + "."
        };
    }

    return {
        prepare,
        decode,
        blobToDataUri,
        kb,
        EXT_BY_TYPE
    };
})();
