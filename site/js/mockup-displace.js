/* ==========================================================================
   TemplateBox - Fabric displacement pass for photographic mockups.

   Bends a flattened artwork sheet around the folds of a garment and shades
   it with the garment's own light, in a single GPU pass. This is the step
   that separates an apparel mockup from a sticker: the multiply overlay
   used by rigid templates (framed posters, boxes) darkens a print in the
   creases but does not move it, so on fabric the artwork stays visibly flat
   however good the lighting is.

   Two maps drive it, both generated from the base photograph itself by
   tools/mockup-admin.html and both the full size of the base:

     <id>-displace.png   R = horizontal offset, G = vertical offset,
                         128 = no offset. Neutral grey off-garment.
     <id>-shade.png      Greyscale luminance of the garment against its own
                         reference white; 255 leaves the artwork untouched.

   The R/G encoding is deliberately Photoshop's Displace convention, so a
   displacement map lifted out of a purchased mockup PSD drops in unchanged:
   such maps are greyscale, giving R == G, which this shader reads as an
   equal x/y offset -- exactly the diagonal shift Photoshop applies.

   The shading is applied to the ARTWORK, not to the canvas, which is what
   keeps it from double-darkening the photograph. A full-canvas multiply
   overlay (the wood-a4 path) shades every pixel it covers, so wherever the
   design does not reach it would shade the base a second time. Folding it
   into this pass means untouched fabric stays exactly as photographed.
   ========================================================================== */

"use strict";

window.TB_Displace = (function () {

    const VERT = [
        "attribute vec2 a_pos;",
        "varying vec2 v_uv;",
        "void main() {",
        "    v_uv = vec2(a_pos.x, 1.0 - a_pos.y);",
        "    gl_Position = vec4(a_pos * 2.0 - 1.0, 0.0, 1.0);",
        "}"
    ].join("\n");

    /* highp where the hardware offers it. At mediump the ink drifts: a
       measured #D8232A (R=216) came back at 222, a ~3% error visible as a
       slight colour shift across a large flat fill. */
    const FRAG = [
        "#ifdef GL_FRAGMENT_PRECISION_HIGH",
        "precision highp float;",
        "#else",
        "precision mediump float;",
        "#endif",
        "varying vec2 v_uv;",
        "uniform sampler2D u_sheet;",
        "uniform sampler2D u_disp;",
        "uniform sampler2D u_shade;",
        "uniform sampler2D u_light;",
        "uniform vec2 u_strength;",
        "uniform float u_hasShade;",
        "uniform float u_hasLight;",
        "uniform float u_lightGain;",
        "void main() {",
        /* 0.5 is "no offset"; the map stores 128/255 there. */
        "    vec2 dv = texture2D(u_disp, v_uv).rg - 0.5;",
        "    vec4 art = texture2D(u_sheet, v_uv + dv * u_strength);",
        "    if (art.a <= 0.0) { discard; }",
        /* Shading and light are sampled at the UNDISPLACED position: they
           belong to the garment's surface at this point on screen, not to
           the piece of artwork that got pulled into it.

           Both are branched rather than mix()'d. mix() evaluates every
           argument, so an absent map still meant sampling a texture unit
           with nothing bound -- an incomplete-texture read that returns
           black and warns, even though the result was discarded. */
        "    vec3 rgb = art.rgb;",
        "    if (u_hasShade > 0.5) {",
        "        rgb *= texture2D(u_shade, v_uv).rgb;",
        "    }",
        /* Screen for specular: a fold ridge catching the light brightens the
           ink instead of leaving it flat. Multiply alone can only darken, so
           without this the print never picks up a highlight the garment has.
           Premultiplied throughout, so the term scales by alpha. */
        "    if (u_hasLight > 0.5) {",
        "        vec3 hi = texture2D(u_light, v_uv).rgb * u_lightGain * art.a;",
        "        rgb = rgb + hi - rgb * hi / max(art.a, 0.0001);",
        "    }",
        "    gl_FragColor = vec4(clamp(rgb, 0.0, art.a), art.a);",
        "}"
    ].join("\n");

    let gl = null;
    let glCanvas = null;
    let program = null;
    let state = "idle";   /* idle | ready | failed */
    let textures = null;

    function compile(type, source) {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, source);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            throw new Error(gl.getShaderInfoLog(sh) || "shader compile failed");
        }
        return sh;
    }

    function init() {
        if (state !== "idle") {
            return state === "ready";
        }
        try {
            glCanvas = document.createElement("canvas");
            const opts = {
                alpha: true,
                premultipliedAlpha: true,
                antialias: false,
                depth: false,
                stencil: false
            };
            gl = glCanvas.getContext("webgl", opts) || glCanvas.getContext("experimental-webgl", opts);
            if (!gl) {
                throw new Error("no webgl context");
            }
            program = gl.createProgram();
            gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
            gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                throw new Error(gl.getProgramInfoLog(program) || "link failed");
            }
            const buf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(
                gl.ARRAY_BUFFER,
                new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]),
                gl.STATIC_DRAW
            );
            const loc = gl.getAttribLocation(program, "a_pos");
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
            textures = {
                sheet: gl.createTexture(),
                disp: gl.createTexture(),
                shade: gl.createTexture(),
                light: gl.createTexture()
            };
            state = "ready";
            return true;
        } catch (err) {
            state = "failed";
            gl = null;
            return false;
        }
    }

    function upload(tex, unit, source, premultiply) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !!premultiply);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }

    /* Renders the sheet displaced and shaded. Returns a canvas the caller
       drawImages over the base photograph, or null when the GPU path is
       unavailable -- callers must treat null as "draw the sheet unchanged"
       rather than as an error, exactly as the perspective warp does. */
    function render(sheet, dispImage, shadeImage, maxOffsetPx, lightImage, lightGain) {
        if (!init()) {
            return null;
        }
        const w = sheet.width;
        const h = sheet.height;
        try {
            if (glCanvas.width !== w || glCanvas.height !== h) {
                glCanvas.width = w;
                glCanvas.height = h;
            }
            gl.viewport(0, 0, w, h);
            gl.useProgram(program);

            /* The sheet carries alpha, so it must be premultiplied on upload
               or linear filtering will fringe its edges with black. The two
               maps are opaque and must NOT be, or their stored values shift. */
            upload(textures.sheet, 0, sheet, true);
            upload(textures.disp, 1, dispImage, false);
            const hasShade = !!shadeImage;
            const hasLight = !!lightImage;
            if (hasShade) {
                upload(textures.shade, 2, shadeImage, false);
            }
            if (hasLight) {
                upload(textures.light, 3, lightImage, false);
            }

            gl.uniform1i(gl.getUniformLocation(program, "u_sheet"), 0);
            gl.uniform1i(gl.getUniformLocation(program, "u_disp"), 1);
            gl.uniform1i(gl.getUniformLocation(program, "u_shade"), 2);
            gl.uniform1i(gl.getUniformLocation(program, "u_light"), 3);
            gl.uniform1f(gl.getUniformLocation(program, "u_hasShade"), hasShade ? 1 : 0);
            gl.uniform1f(gl.getUniformLocation(program, "u_hasLight"), hasLight ? 1 : 0);
            gl.uniform1f(
                gl.getUniformLocation(program, "u_lightGain"),
                typeof lightGain === "number" ? lightGain : 1
            );
            /* dv spans -0.5..0.5, so doubling maps the extremes to +-maxOffsetPx. */
            const px = typeof maxOffsetPx === "number" ? maxOffsetPx : 12;
            gl.uniform2f(gl.getUniformLocation(program, "u_strength"), (2 * px) / w, (2 * px) / h);

            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            return glCanvas;
        } catch (err) {
            state = "failed";
            return null;
        }
    }

    function available() {
        return state === "ready" || (state === "idle" && init());
    }

    return { render: render, available: available };
}());
