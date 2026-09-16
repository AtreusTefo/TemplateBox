/* ==========================================================================
   TemplateBox -- the colour picker, shared.

   Lifted out of js/mockup.js on September 13, 2026, unchanged, when the poster
   editor needed the same control for the music player's heart. It was already
   written as a factory over a node map and a getHex/setHex pair, so nothing
   here had to be generalised to make it move -- the only thing that changed is
   where it lives.

   Two consumers now: the mockup editor's product and background colours, and
   the poster editor's heart. A second COPY was the alternative and is the one
   thing this file exists to prevent; this codebase has been bitten before by
   two implementations of one drawing drifting apart quietly.

   Everything is plain arithmetic on sRGB triples -- no library, no CDN, no
   canvas readback -- and the picker paints its gradients with CSS, so it
   needs only the pointer's position within each track.

   Load it BEFORE the editor script that uses it.
   ========================================================================== */
(function () {
    "use strict";

    const SVG_NS = "http://www.w3.org/2000/svg";

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function hexToRgb(value) {
        const raw = String(value == null ? "" : value).trim().replace(/^#/, "");
        const full = raw.length === 3
            ? raw[0] + raw[0] + raw[1] + raw[1] + raw[2] + raw[2]
            : raw;
        if (!/^[0-9a-f]{6}$/i.test(full)) {
            return null;
        }
        const n = parseInt(full, 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }

    function rgbToHex(r, g, b) {
        const part = (v) => {
            const s = clamp(Math.round(v), 0, 255).toString(16);
            return s.length === 1 ? "0" + s : s;
        };
        return ("#" + part(r) + part(g) + part(b)).toUpperCase();
    }

    function rgbToHsv(r, g, b) {
        const rn = r / 255;
        const gn = g / 255;
        const bn = b / 255;
        const max = Math.max(rn, gn, bn);
        const min = Math.min(rn, gn, bn);
        const d = max - min;
        let h = 0;
        if (d !== 0) {
            if (max === rn) { h = ((gn - bn) / d) % 6; }
            else if (max === gn) { h = (bn - rn) / d + 2; }
            else { h = (rn - gn) / d + 4; }
            h *= 60;
            if (h < 0) { h += 360; }
        }
        return { h: h, s: max === 0 ? 0 : d / max, v: max };
    }

    function hsvToRgb(h, s, v) {
        const c = v * s;
        const hp = (((h % 360) + 360) % 360) / 60;
        const x = c * (1 - Math.abs((hp % 2) - 1));
        let rgb = [0, 0, 0];
        if (hp < 1) { rgb = [c, x, 0]; }
        else if (hp < 2) { rgb = [x, c, 0]; }
        else if (hp < 3) { rgb = [0, c, x]; }
        else if (hp < 4) { rgb = [0, x, c]; }
        else if (hp < 5) { rgb = [x, 0, c]; }
        else { rgb = [c, 0, x]; }
        const m = v - c;
        return { r: (rgb[0] + m) * 255, g: (rgb[1] + m) * 255, b: (rgb[2] + m) * 255 };
    }

    /* Presets mirror the reference picker: a greyscale run, then a spread of
       saturated hues wide enough to reach most brand colours in one click. */
    const COLOR_PRESETS = [
        "#FFFFFF", "#D6D6D6", "#9B9B9B", "#4A4A4A", "#000000", "#E9A13B", "#F5D547",
        "#8B5A2B", "#6E8B3D", "#7ED321", "#22B573", "#4A90D9", "#2F4FCD", "#8E44AD",
        "#1A1A1A", "#6B6B66", "#B9B7B2", "#D0021B", "#00C853", "#0033CC", "#FFEB00",
        "#FF2D95", "#00E0E0", "#F5A623", "#5B2C82", "#0B6E2E", "#1F2A44", "#B5352E"
    ];

    function icon(paths) {
        const svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("focusable", "false");
        paths.forEach((d) => {
            const path = document.createElementNS(SVG_NS, "path");
            path.setAttribute("d", d);
            svg.appendChild(path);
        });
        return svg;
    }

    function trackRatio(el, evt) {
        const rect = el.getBoundingClientRect();
        return {
            x: rect.width ? clamp((evt.clientX - rect.left) / rect.width, 0, 1) : 0,
            y: rect.height ? clamp((evt.clientY - rect.top) / rect.height, 0, 1) : 0
        };
    }

    function bindTrack(el, apply) {
        if (!el) {
            return;
        }
        let active = false;
        el.addEventListener("pointerdown", (evt) => {
            active = true;
            el.setPointerCapture(evt.pointerId);
            apply(evt);
            evt.preventDefault();
        });
        el.addEventListener("pointermove", (evt) => {
            if (active) {
                apply(evt);
            }
        });
        const stop = () => { active = false; };
        el.addEventListener("pointerup", stop);
        el.addEventListener("pointercancel", stop);
    }

    function createColorPicker(nodes, options) {
        let hue = 0;
        /* Rebuilt only by buildPresets(); sync() just re-marks which is
           active, because sync() runs on every pointermove of the hue track
           and tearing down 36 buttons per move would be gratuitous. */
        let colorwayChips = [];

        /* Two strips, one hue. The popover's, and -- on the product picker --
           the one standing in the panel where the swatch row used to be. They
           are the same control at two sizes, so they share this instance's
           `hue`, the handler below and the repaint in sync(); neither knows
           the other exists. An instance given only a popover strip simply has
           a one-entry list. */
        const hueTracks = [
            { track: nodes.hue, thumb: nodes.hueThumb },
            { track: nodes.hueInline, thumb: nodes.hueInlineThumb }
        ].filter((entry) => !!entry.track);

        function commit(hex, skip) {
            return options.setHex(hex, skip);
        }

        /* Repaints every part of this picker from its current colour. `skip`
           names an input the visitor is currently typing in, which must not be
           rewritten underneath the caret. */
        function sync(skip) {
            markActiveColorway();
            const hex = options.getHex();
            /* No colour at all (the background's Transparent state): the
               gradients keep their last position rather than snapping, and
               the fields empty. Painting white here would say the background
               IS white, which is a different export. */
            const rgb = hexToRgb(hex) || { r: 255, g: 255, b: 255 };
            const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);

            /* A greyscale colour carries no meaningful hue, so the strip keeps
               its last position instead of snapping to red. */
            if (hsv.s > 0.001 && hsv.v > 0.001) {
                hue = hsv.h;
            }

            if (nodes.sv) {
                nodes.sv.style.setProperty("--picker-hue", String(Math.round(hue)));
            }
            if (nodes.svThumb) {
                nodes.svThumb.style.left = (hsv.s * 100) + "%";
                nodes.svThumb.style.top = ((1 - hsv.v) * 100) + "%";
                nodes.svThumb.style.backgroundColor = hex || "transparent";
            }
            hueTracks.forEach((track) => {
                if (track.thumb) {
                    track.thumb.style.left = ((hue / 360) * 100) + "%";
                }
            });

            const fields = hex ? { hex: hex, r: rgb.r, g: rgb.g, b: rgb.b }
                : { hex: "", r: "", g: "", b: "" };
            if (nodes.inHex && skip !== nodes.inHex) { nodes.inHex.value = fields.hex; }
            if (nodes.inR && skip !== nodes.inR) { nodes.inR.value = String(fields.r); }
            if (nodes.inG && skip !== nodes.inG) { nodes.inG.value = String(fields.g); }
            if (nodes.inB && skip !== nodes.inB) { nodes.inB.value = String(fields.b); }
        }

        function buildPresets() {
            if (!nodes.presets) {
                return;
            }
            while (nodes.presets.firstChild) {
                nodes.presets.removeChild(nodes.presets.firstChild);
            }

            /* "No colour at all" as the first preset, for the instance that
               has such a state -- the background's Transparent (August 25,
               2026). It moved in here when the quick-pick row that used to
               carry it was removed: every other colour on that row is in the
               grid below, but this one is not a colour and no hex can express
               it, so dropping the row without moving it would have stranded
               the default state with no way back. */
            if (options.allowClear) {
                const clear = document.createElement("button");
                clear.type = "button";
                clear.className = "color-preset swatch-transparent";
                clear.setAttribute("aria-label", "Transparent");
                clear.setAttribute("title", "Transparent");
                clear.addEventListener("click", () => commit(null));
                nodes.presets.appendChild(clear);
            }

            /* Native colour sampling where the browser offers it (Chromium's
               EyeDropper). No polyfill and no button at all elsewhere: a
               control that silently does nothing is worse than one that is
               absent. */
            if (window.EyeDropper) {
                const drop = document.createElement("button");
                drop.type = "button";
                drop.className = "color-eyedropper";
                drop.setAttribute("aria-label", "Pick a colour from the screen");
                drop.setAttribute("title", "Pick a colour from the screen");
                drop.appendChild(icon([
                    "m2 22 4-1 11-11-3-3L3 18l-1 4Z",
                    "m15 5 4-4 4 4-4 4",
                    "m13 7 4 4"
                ]));
                drop.addEventListener("click", () => {
                    new window.EyeDropper().open().then((result) => {
                        commit(result.sRGBHex);
                    }, () => {
                        /* Dismissed with Escape: nothing to do. */
                    });
                });
                nodes.presets.appendChild(drop);
            }

            /* The product's own colourways first, named, ahead of the
               generic hexes. Only the product picker supplies these. */
            colorwayChips = [];
            (options.colorways ? options.colorways() : []).forEach((cw) => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "color-preset color-colorway";
                btn.style.backgroundColor = cw.swatch;
                btn.setAttribute("aria-label", cw.name);
                btn.setAttribute("title", cw.name);
                btn.addEventListener("click", () => options.setColorway(cw.key));
                colorwayChips.push({ btn: btn, key: cw.key });
                nodes.presets.appendChild(btn);
            });

            COLOR_PRESETS.forEach((hex) => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "color-preset";
                btn.style.backgroundColor = hex;
                btn.setAttribute("aria-label", hex);
                btn.setAttribute("title", hex);
                btn.addEventListener("click", () => commit(hex));
                nodes.presets.appendChild(btn);
            });
            markActiveColorway();
        }

        /* Which colourway is selected, if any. A custom hex selects none, so
           the grid correctly shows nothing pressed once the visitor picks a
           colour of their own. */
        function markActiveColorway() {
            const active = options.activeColorway ? options.activeColorway() : null;
            colorwayChips.forEach((chip) => {
                chip.btn.setAttribute("aria-pressed", String(chip.key === active));
            });
        }

        /* --- popover open/close --- */

        function onOutside(evt) {
            if (nodes.popover.contains(evt.target) || nodes.trigger.contains(evt.target)) {
                return;
            }
            close();
        }

        function onKey(evt) {
            if (evt.key === "Escape") {
                close();
                nodes.trigger.focus();
            }
        }

        function open() {
            nodes.popover.hidden = false;
            nodes.trigger.setAttribute("aria-expanded", "true");
            sync();
            document.addEventListener("pointerdown", onOutside, true);
            document.addEventListener("keydown", onKey, true);
        }

        function close() {
            nodes.popover.hidden = true;
            nodes.trigger.setAttribute("aria-expanded", "false");
            document.removeEventListener("pointerdown", onOutside, true);
            document.removeEventListener("keydown", onKey, true);
        }

        if (nodes.trigger && nodes.popover) {
            nodes.trigger.addEventListener("click", () => {
                if (nodes.popover.hidden) {
                    open();
                } else {
                    close();
                }
            });
        }

        /* --- gradient tracks --- */

        bindTrack(nodes.sv, (evt) => {
            const r = trackRatio(nodes.sv, evt);
            const rgb = hsvToRgb(hue, r.x, 1 - r.y);
            commit(rgbToHex(rgb.r, rgb.g, rgb.b));
        });

        hueTracks.forEach((entry) => {
            bindTrack(entry.track, (evt) => {
                hue = trackRatio(entry.track, evt).x * 360;
                const current = hexToRgb(options.getHex()) || { r: 255, g: 255, b: 255 };
                const hsv = rgbToHsv(current.r, current.g, current.b);
                /* A pure white or black start has no saturation to rotate, so
                   the new hue would produce the same greyscale colour and the
                   strip would look broken. Fall back to a fully saturated
                   sample. */
                const s = hsv.s > 0.001 ? hsv.s : 1;
                const v = hsv.v > 0.001 ? hsv.v : 1;
                const rgb = hsvToRgb(hue, s, v);
                commit(rgbToHex(rgb.r, rgb.g, rgb.b));
            });
        });

        /* --- hex / R / G / B --- */

        if (nodes.inHex) {
            nodes.inHex.addEventListener("input", () => {
                if (hexToRgb(nodes.inHex.value)) {
                    commit(nodes.inHex.value, nodes.inHex);
                }
            });
            nodes.inHex.addEventListener("blur", () => sync());
        }

        [nodes.inR, nodes.inG, nodes.inB].forEach((input) => {
            if (!input) {
                return;
            }
            input.addEventListener("input", () => {
                const r = clamp(parseInt(nodes.inR.value, 10) || 0, 0, 255);
                const g = clamp(parseInt(nodes.inG.value, 10) || 0, 0, 255);
                const b = clamp(parseInt(nodes.inB.value, 10) || 0, 0, 255);
                commit(rgbToHex(r, g, b), input);
            });
            input.addEventListener("blur", () => sync());
        });

        return { sync: sync, buildPresets: buildPresets, close: close };
    }

    /* One namespace, and the colour maths goes out with the picker: mockup.js
       aliases these rather than keeping its own, so there is exactly one
       hexToRgb on the site. */
    window.TBColor = {
        createColorPicker: createColorPicker,
        hexToRgb: hexToRgb,
        rgbToHex: rgbToHex,
        rgbToHsv: rgbToHsv,
        hsvToRgb: hsvToRgb,
        PRESETS: COLOR_PRESETS
    };
}());
