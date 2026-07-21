/* ==========================================================================
   TemplateBox - Product Mockup Generator Core Logic
   Responsibilities: strict client-side image mime-type validation, flat
   vector product illustrations composed on HTML5 Canvas (t-shirt, hoodie,
   mug, packaging box), pointer-driven design placement, real-time
   localStorage retention of non-image settings, an in-memory "My Mockups"
   tray, and PNG export through a local canvas.toDataURL() stream.
   Depends on: js/app.js (TB.sanitize, TB.desanitize, TB.storageGet/Set)
   ========================================================================== */

"use strict";

(() => {

    const STORAGE_KEY = "tb_mockup_v1";

    /* Fixed internal resolution: the visible element scales via CSS while
       exports always render at full 1000 x 1000 quality. */
    const CANVAS_W = 1000;
    const CANVAS_H = 1000;

    const canvas = document.getElementById("mockup-canvas");
    if (!canvas) {
        return;
    }
    const ctx = canvas.getContext("2d");

    /* ----------------------------------------------------------------------
       Small canvas path helper. Written locally instead of relying on
       ctx.roundRect(), which is not supported in every browser this free
       tool needs to reach.
       ---------------------------------------------------------------------- */
    function roundRectPath(context, x, y, w, h, r) {
        context.beginPath();
        context.moveTo(x + r, y);
        context.lineTo(x + w - r, y);
        context.arcTo(x + w, y, x + w, y + r, r);
        context.lineTo(x + w, y + h - r);
        context.arcTo(x + w, y + h, x + w - r, y + h, r);
        context.lineTo(x + r, y + h);
        context.arcTo(x, y + h, x, y + h - r, r);
        context.lineTo(x, y + r);
        context.arcTo(x, y, x + r, y, r);
        context.closePath();
    }

    /* ----------------------------------------------------------------------
       Product library: each entry draws a flat, gradient-free vector
       illustration (matching the site's Fabric Film Studio theme) and
       declares the axis-aligned print area the uploaded design composites
       into.
       ---------------------------------------------------------------------- */

    function drawTshirtBody(context, hex, outline) {
        context.save();
        context.fillStyle = hex;
        context.strokeStyle = outline;
        context.lineWidth = 6;
        context.beginPath();
        context.moveTo(430, 140);
        context.lineTo(330, 170);
        context.lineTo(170, 230);
        context.lineTo(110, 430);
        context.lineTo(300, 380);
        context.lineTo(300, 900);
        context.lineTo(700, 900);
        context.lineTo(700, 380);
        context.lineTo(890, 430);
        context.lineTo(830, 230);
        context.lineTo(670, 170);
        context.lineTo(570, 140);
        context.quadraticCurveTo(500, 210, 430, 140);
        context.closePath();
        context.fill();
        context.stroke();

        /* Collar rib detail */
        context.beginPath();
        context.moveTo(450, 150);
        context.quadraticCurveTo(500, 200, 550, 150);
        context.lineWidth = 4;
        context.stroke();
        context.restore();
    }

    function drawHoodieBody(context, hex, outline) {
        drawTshirtBody(context, hex, outline);

        context.save();
        context.fillStyle = hex;
        context.strokeStyle = outline;
        context.lineWidth = 6;

        /* Hood, folded down across the shoulders */
        context.beginPath();
        context.moveTo(330, 170);
        context.quadraticCurveTo(500, 90, 670, 170);
        context.quadraticCurveTo(650, 230, 500, 250);
        context.quadraticCurveTo(350, 230, 330, 170);
        context.closePath();
        context.fill();
        context.stroke();

        /* Drawstrings */
        context.lineWidth = 6;
        [460, 540].forEach((sx) => {
            context.beginPath();
            context.moveTo(sx, 250);
            context.lineTo(sx, 300);
            context.stroke();
            context.beginPath();
            context.arc(sx, 306, 6, 0, Math.PI * 2);
            context.fillStyle = outline;
            context.fill();
        });

        /* Kangaroo pocket, below the print area */
        context.fillStyle = hex;
        roundRectPath(context, 380, 700, 240, 130, 14);
        context.fill();
        context.stroke();

        /* Sleeve cuffs, sized to stay within the sleeve silhouette */
        context.fillStyle = outline;
        context.fillRect(125, 405, 35, 45);
        context.fillRect(840, 405, 35, 45);
        context.restore();
    }

    function drawMugBody(context, hex, outline) {
        context.save();

        /* Handle, drawn first so the body seam sits cleanly on top of it.
           The angle range deliberately overshoots 90 degrees on each side so
           both ends land to the left of the body's right edge (x = 700) and
           are hidden underneath it, instead of floating disconnected. */
        context.beginPath();
        context.arc(700, 560, 150, -1.9, 1.9);
        context.lineWidth = 55;
        context.strokeStyle = hex;
        context.stroke();
        context.lineWidth = 6;
        context.strokeStyle = outline;
        context.stroke();

        /* Body */
        context.fillStyle = hex;
        context.strokeStyle = outline;
        context.lineWidth = 6;
        roundRectPath(context, 300, 320, 400, 480, 18);
        context.fill();
        context.stroke();

        /* Base shadow band */
        context.globalAlpha = 0.12;
        context.beginPath();
        context.ellipse(500, 780, 190, 16, 0, 0, Math.PI, false);
        context.fillStyle = outline;
        context.fill();
        context.globalAlpha = 1;

        /* Rim opening */
        context.beginPath();
        context.ellipse(500, 320, 200, 40, 0, 0, Math.PI * 2);
        context.fillStyle = outline;
        context.fill();
        context.beginPath();
        context.ellipse(500, 314, 188, 32, 0, 0, Math.PI * 2);
        context.fillStyle = hex;
        context.fill();
        context.lineWidth = 4;
        context.strokeStyle = outline;
        context.stroke();
        context.restore();
    }

    function drawBoxBody(context, hex, outline) {
        context.save();
        context.fillStyle = hex;
        context.strokeStyle = outline;
        context.lineWidth = 6;

        /* Front face */
        context.fillRect(280, 340, 440, 460);
        context.strokeRect(280, 340, 440, 460);

        /* Top and side flap strips suggest depth without a gradient */
        context.fillStyle = outline;
        context.globalAlpha = 0.55;
        context.beginPath();
        context.moveTo(280, 340);
        context.lineTo(360, 260);
        context.lineTo(800, 260);
        context.lineTo(720, 340);
        context.closePath();
        context.fill();

        context.beginPath();
        context.moveTo(720, 340);
        context.lineTo(800, 260);
        context.lineTo(800, 680);
        context.lineTo(720, 760);
        context.closePath();
        context.fill();
        context.globalAlpha = 1;

        /* Packing tape tabs, positioned clear of the print area */
        context.fillStyle = outline;
        context.fillRect(470, 340, 60, 50);
        context.fillRect(470, 750, 60, 50);

        context.strokeRect(280, 340, 440, 460);
        context.restore();
    }

    const PRODUCTS = {
        tshirt: {
            label: "T-Shirt",
            printArea: { x: 360, y: 400, w: 280, h: 300 },
            drawBase: drawTshirtBody,
            colors: {
                white: { name: "White", hex: "#FFFFFF", outline: "#D8D6D0" },
                black: { name: "Black", hex: "#1A1A1A", outline: "#000000" },
                heather: { name: "Heather Gray", hex: "#B9B7B2", outline: "#98968F" },
                navy: { name: "Navy", hex: "#1F2A44", outline: "#141B2C" }
            }
        },
        hoodie: {
            label: "Hoodie",
            printArea: { x: 370, y: 380, w: 260, h: 230 },
            drawBase: drawHoodieBody,
            colors: {
                black: { name: "Black", hex: "#1A1A1A", outline: "#000000" },
                heather: { name: "Heather Gray", hex: "#B9B7B2", outline: "#98968F" },
                navy: { name: "Navy", hex: "#1F2A44", outline: "#141B2C" },
                white: { name: "White", hex: "#FFFFFF", outline: "#D8D6D0" }
            }
        },
        mug: {
            label: "Mug",
            printArea: { x: 340, y: 400, w: 320, h: 300 },
            drawBase: drawMugBody,
            colors: {
                white: { name: "White", hex: "#FFFFFF", outline: "#D8D6D0" },
                black: { name: "Black", hex: "#1A1A1A", outline: "#000000" },
                red: { name: "Red", hex: "#B5352E", outline: "#8F2A24" }
            }
        },
        box: {
            label: "Packaging Box",
            printArea: { x: 330, y: 430, w: 340, h: 260 },
            drawBase: drawBoxBody,
            colors: {
                kraft: { name: "Kraft Brown", hex: "#C48A4A", outline: "#9C6B34" },
                white: { name: "White", hex: "#FFFFFF", outline: "#D8D6D0" },
                black: { name: "Black", hex: "#1A1A1A", outline: "#000000" }
            }
        }
    };

    /* ----------------------------------------------------------------------
       DOM references
       ---------------------------------------------------------------------- */

    const productSelect = document.getElementById("m-product");
    const colorRow = document.getElementById("m-color-row");
    const fileInput = document.getElementById("m-design");
    const fileError = document.getElementById("m-design-error");
    const scaleInput = document.getElementById("m-scale");
    const scaleOutput = document.getElementById("m-scale-output");
    const labelInput = document.getElementById("m-label");
    const addToTrayBtn = document.getElementById("add-to-tray");
    const downloadBtn = document.getElementById("download-mockup-png");
    const trayGrid = document.getElementById("tray-grid");
    const trayEmpty = document.getElementById("tray-empty");

    /* ----------------------------------------------------------------------
       State. The uploaded design lives only in memory: neither the source
       image nor the tray thumbnails are written to localStorage, matching
       the poster editor's precedent of keeping image data off disk to
       respect browser storage quotas. Position/scale/product/color are
       plain numbers and strings, so those alone are persisted.
       ---------------------------------------------------------------------- */

    let currentProduct = "tshirt";
    let currentColor = "black";
    let design = null;
    let designScale = 0.75;
    let offsetX = 0;
    let offsetY = 0;
    let lastDesignRect = null;

    let dragging = false;
    let dragStart = { x: 0, y: 0 };
    let dragOffsetStart = { x: 0, y: 0 };

    /* In-memory tray of one-click "added" mockups for this browser tab. */
    let trayItems = [];

    /* ----------------------------------------------------------------------
       Canvas composition
       ---------------------------------------------------------------------- */

    function drawDesignInArea(area) {
        if (!design) {
            ctx.save();
            roundRectPath(ctx, area.x, area.y, area.w, area.h, 16);
            ctx.fillStyle = "#F4F3EF";
            ctx.fill();
            ctx.setLineDash([12, 8]);
            ctx.strokeStyle = "#B9B7B2";
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = "#6B6B66";
            ctx.font = '400 32px "Inter", sans-serif';
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("Upload your design", area.x + area.w / 2, area.y + area.h / 2, area.w - 40);
            ctx.restore();
            lastDesignRect = null;
            return;
        }

        const containBase = Math.min(area.w / design.width, area.h / design.height);
        const drawW = design.width * containBase * designScale;
        const drawH = design.height * containBase * designScale;

        const maxOffsetX = area.w / 2;
        const maxOffsetY = area.h / 2;
        offsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, offsetX));
        offsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, offsetY));

        const centerX = area.x + area.w / 2 + offsetX;
        const centerY = area.y + area.h / 2 + offsetY;
        const drawX = centerX - drawW / 2;
        const drawY = centerY - drawH / 2;

        ctx.save();
        roundRectPath(ctx, area.x, area.y, area.w, area.h, 16);
        ctx.clip();
        ctx.drawImage(design, drawX, drawY, drawW, drawH);
        ctx.restore();

        lastDesignRect = { x: drawX, y: drawY, w: drawW, h: drawH };
    }

    function draw() {
        const product = PRODUCTS[currentProduct] ? currentProduct : "tshirt";
        currentProduct = product;
        const config = PRODUCTS[currentProduct];

        if (!config.colors[currentColor]) {
            currentColor = Object.keys(config.colors)[0];
        }
        const color = config.colors[currentColor];

        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        config.drawBase(ctx, color.hex, color.outline);
        drawDesignInArea(config.printArea);
    }

    /* ----------------------------------------------------------------------
       Color swatches: rebuilt whenever the product template changes, since
       each product offers a different palette.
       ---------------------------------------------------------------------- */

    function renderColorSwatches() {
        while (colorRow.firstChild) {
            colorRow.removeChild(colorRow.firstChild);
        }

        const config = PRODUCTS[currentProduct];
        Object.keys(config.colors).forEach((key) => {
            const info = config.colors[key];
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "swatch" + (key === currentColor ? " is-active" : "");
            btn.style.backgroundColor = info.hex;
            btn.setAttribute("role", "radio");
            btn.setAttribute("aria-checked", String(key === currentColor));
            btn.setAttribute("aria-label", info.name);
            btn.addEventListener("click", () => {
                currentColor = key;
                colorRow.querySelectorAll(".swatch").forEach((s) => {
                    s.classList.remove("is-active");
                    s.setAttribute("aria-checked", "false");
                });
                btn.classList.add("is-active");
                btn.setAttribute("aria-checked", "true");
                persist();
                draw();
            });
            colorRow.appendChild(btn);
        });
    }

    /* ----------------------------------------------------------------------
       Product template switch
       ---------------------------------------------------------------------- */

    productSelect.addEventListener("change", () => {
        currentProduct = PRODUCTS[productSelect.value] ? productSelect.value : "tshirt";
        if (!PRODUCTS[currentProduct].colors[currentColor]) {
            currentColor = Object.keys(PRODUCTS[currentProduct].colors)[0];
        }
        offsetX = 0;
        offsetY = 0;
        renderColorSwatches();
        persist();
        draw();
    });

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
            design = null;
            draw();
            return;
        }

        const reader = new FileReader();
        reader.addEventListener("load", () => {
            const img = new Image();
            img.addEventListener("load", () => {
                design = img;
                offsetX = 0;
                offsetY = 0;
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
       Design size slider
       ---------------------------------------------------------------------- */

    scaleInput.addEventListener("input", () => {
        designScale = Number(scaleInput.value) / 100;
        scaleOutput.textContent = scaleInput.value + "%";
        persist();
        draw();
    });

    /* ----------------------------------------------------------------------
       Pointer-driven repositioning. Drag only begins when the pointer
       actually lands on the currently drawn design image, so the rest of
       the product illustration stays inert.
       ---------------------------------------------------------------------- */

    function getCanvasPoint(evt) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (evt.clientX - rect.left) * scaleX,
            y: (evt.clientY - rect.top) * scaleY
        };
    }

    canvas.addEventListener("pointerdown", (evt) => {
        if (!design || !lastDesignRect) {
            return;
        }
        const pt = getCanvasPoint(evt);
        const hit = pt.x >= lastDesignRect.x && pt.x <= lastDesignRect.x + lastDesignRect.w &&
            pt.y >= lastDesignRect.y && pt.y <= lastDesignRect.y + lastDesignRect.h;
        if (!hit) {
            return;
        }
        dragging = true;
        dragStart = pt;
        dragOffsetStart = { x: offsetX, y: offsetY };
        canvas.setPointerCapture(evt.pointerId);
        canvas.classList.add("is-dragging");
    });

    canvas.addEventListener("pointermove", (evt) => {
        if (!dragging) {
            return;
        }
        const pt = getCanvasPoint(evt);
        offsetX = dragOffsetStart.x + (pt.x - dragStart.x);
        offsetY = dragOffsetStart.y + (pt.y - dragStart.y);
        draw();
    });

    function endDrag() {
        if (!dragging) {
            return;
        }
        dragging = false;
        canvas.classList.remove("is-dragging");
        persist();
    }

    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);

    /* ----------------------------------------------------------------------
       Real-time retention of non-image settings in localStorage.
       ---------------------------------------------------------------------- */

    function persist() {
        TB.storageSet(STORAGE_KEY, {
            product: currentProduct,
            color: currentColor,
            scale: Math.round(designScale * 100),
            offsetX,
            offsetY,
            label: TB.sanitize(labelInput.value)
        });
    }

    labelInput.addEventListener("input", persist);

    /* ----------------------------------------------------------------------
       "My Mockups" tray: a one-click way to collect several product
       renders for a design before downloading them for a store listing.
       Rendered with createElement/textContent only, per the project's
       DOM-XSS prevention rule.
       ---------------------------------------------------------------------- */

    function renderTray() {
        while (trayGrid.firstChild) {
            trayGrid.removeChild(trayGrid.firstChild);
        }
        trayEmpty.hidden = trayItems.length > 0;

        trayItems.forEach((item) => {
            const card = document.createElement("div");
            card.className = "tray-item";

            const img = document.createElement("img");
            img.className = "tray-thumb";
            img.src = item.thumb;
            img.alt = TB.desanitize(item.label) + " mockup preview";
            card.appendChild(img);

            const body = document.createElement("div");
            body.className = "tray-item-body";

            const labelEl = document.createElement("p");
            labelEl.className = "tray-item-label";
            labelEl.textContent = TB.desanitize(item.label);
            body.appendChild(labelEl);

            const actions = document.createElement("div");
            actions.className = "tray-item-actions";

            const dlBtn = document.createElement("button");
            dlBtn.type = "button";
            dlBtn.className = "btn btn-secondary btn-small";
            dlBtn.textContent = "Download";
            dlBtn.addEventListener("click", () => {
                const link = document.createElement("a");
                link.href = item.thumb;
                link.download = "templatebox-mockup-" + item.id + ".png";
                link.click();
            });

            const rmBtn = document.createElement("button");
            rmBtn.type = "button";
            rmBtn.className = "btn btn-secondary btn-small";
            rmBtn.textContent = "Remove";
            rmBtn.addEventListener("click", () => {
                trayItems = trayItems.filter((entry) => entry.id !== item.id);
                renderTray();
            });

            actions.appendChild(dlBtn);
            actions.appendChild(rmBtn);
            body.appendChild(actions);
            card.appendChild(body);
            trayGrid.appendChild(card);
        });
    }

    let trayCounter = 0;

    addToTrayBtn.addEventListener("click", () => {
        if (!design) {
            fileError.textContent = "Upload a design before adding it to your mockups.";
            return;
        }
        fileError.textContent = "";

        trayCounter += 1;
        const typed = labelInput.value.trim();
        const fallback = PRODUCTS[currentProduct].label + " mockup " + trayCounter;
        const item = {
            id: Date.now() + "-" + trayCounter,
            label: TB.sanitize(typed || fallback),
            thumb: canvas.toDataURL("image/png")
        };
        trayItems.push(item);
        renderTray();
    });

    /* ----------------------------------------------------------------------
       Single-mockup PNG export via a local data stream.
       ---------------------------------------------------------------------- */

    downloadBtn.addEventListener("click", () => {
        const link = document.createElement("a");
        link.href = canvas.toDataURL("image/png");
        link.download = "templatebox-mockup.png";
        link.click();
    });

    /* ----------------------------------------------------------------------
       Initialization: hydrate saved settings, populate the color row for
       the starting product, then paint.
       ---------------------------------------------------------------------- */

    const saved = TB.storageGet(STORAGE_KEY);
    if (saved) {
        if (PRODUCTS[saved.product]) {
            currentProduct = saved.product;
        }
        if (PRODUCTS[currentProduct].colors[saved.color]) {
            currentColor = saved.color;
        }
        if (typeof saved.scale === "number" && saved.scale >= 30 && saved.scale <= 100) {
            designScale = saved.scale / 100;
        }
        if (typeof saved.offsetX === "number") {
            offsetX = saved.offsetX;
        }
        if (typeof saved.offsetY === "number") {
            offsetY = saved.offsetY;
        }
        if (typeof saved.label === "string") {
            labelInput.value = TB.desanitize(saved.label);
        }
    }

    productSelect.value = currentProduct;
    scaleInput.value = String(Math.round(designScale * 100));
    scaleOutput.textContent = scaleInput.value + "%";

    renderColorSwatches();
    renderTray();
    draw();

    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(draw);
    }
})();
