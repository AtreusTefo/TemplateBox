# Mockup Editor: Multi-Layer Designs and the Tool-Panel UI

Date: August 17, 2026

## Overview

The Product Mockup Generator's editor was reshaped from a single-design form into a tool panel beside a large stage, matching the interaction model of mockey.ai and placeit.net. The substantive change underneath the layout is that the editor now composites an **ordered stack of design layers** on one product instead of exactly one image.

Scope: `site/mockup.html`, `site/js/mockup.js`, `site/css/style.css`. No other page, and no ad code, was touched. The rail markup, `js/ads.js`, the `.editor-bar` toolbar ids (`#save-state`, `#download-mockup-png`) and the mega-menu structure are all unchanged, because other scripts and `tests/verify-layout.js` depend on them.

## What Changed

| Area | Before | After |
|---|---|---|
| Designs per mockup | Exactly one, via `drawDesignInArea()` | Ordered array of up to 12 layers, via `paintLayers()` |
| Placement | Drag and a size slider | Drag, corner-handle resize, rotate handle, per-layer size |
| Layer management | None | Add, replace, remove, hide/show, select — per layer |
| Colour | Four fixed colorway swatches | Same swatches as quick picks, plus a free HSV picker (gradient square, hue strip, Hex/R/G/B, preset grid, native eyedropper where available) |
| Size control | Slider, 30-100% | Slider plus a typed percentage and a reset, 5-200% |
| Layout | Even 1fr/1fr split | 20rem control column beside the stage, at 48rem and above |

The size range widened because multi-layer compositions are mostly a large print plus small badges; 30% was a sensible floor for one centred design and a poor one for a logo.

## The Layer Model

One object per layer, ordered back-to-front — array index 0 paints first, the last entry paints in front. The sidebar list renders the reverse, front-most first, which is how every layers panel reads.

```
{ id, name, img, scale, offsetX, offsetY, rotation, visible, rect }
```

`img` and `rect` are runtime-only. Everything else persists.

### What persists, and what does not

Design bitmaps are never written to `localStorage`, matching the poster editor's precedent of keeping image data off disk to respect browser storage quotas. What *is* persisted is every layer's **placement** — name, size, offset, rotation, visibility — so a returning visitor re-uploads their files into a composition that is already arranged. This is the same bargain the single-design version struck, applied to each layer rather than to one image.

A restored layer therefore arrives with `img === null`. That is the `is-pending` state: the row shows the remembered filename over a dashed empty thumbnail and the words "Re-upload to restore", and Replace hands the file back without disturbing the placement. The canvas shows its usual "Upload your design" placeholder until at least one layer has a bitmap.

Saves written before this change held one design's placement in flat top-level fields (`scale`, `offsetX`, `offsetY`). `restoreLayers()` migrates that shape into a single layer rather than discarding it.

## Selection Chrome Lives on a Second Canvas

`#mockup-overlay` sits on top of `#mockup-canvas`, same internal resolution, `pointer-events: none`.

This is not cosmetic separation. PNG export and the "My Mockups" tray thumbnails both read `canvas.toDataURL()` on `#mockup-canvas`, so anything painted there ends up in the visitor's downloaded file. Drawing the bounding box, corner handles, rotate handle and layer name tag on a separate surface is what makes it structurally impossible for selection chrome to be exported — rather than something that has to be remembered at each export site. It also means selecting a layer repaints only the overlay, not the product.

The overlay is hidden in the print block for the same reason: `.preview-pane` prints (unlike `.editor-pane`, which is hidden wholesale), so without that rule a mockup printed while a layer was selected would carry its handles onto the paper.

Handle sizes are quoted in **screen** pixels and converted through `canvasPerScreenPx()`, so they stay the same visual size whether the canvas is a 1000px vector square scaled down or a photograph at native resolution. That conversion depends on the canvas's displayed width, so the overlay is repainted on `resize` and on the mobile Edit/Preview tab switch, which changes that width without firing one.

## Photographic Templates

Layers are composited into an offscreen "artwork sheet" the size of the warp zone's bounding box, and the **sheet** is warped, so an angled frame carries the whole stack through a single GPU pass instead of one pass per layer.

Two consequences worth knowing:

- **Direct manipulation is still unavailable on non-rectangular warp zones.** Mapping a pointer back into sheet space needs the inverse of the perspective transform, which the glfx pass does not hand back. Layers there keep no hit rect, so nothing on the canvas is grabbable and the sidebar controls are the only way to place artwork. This matches the previous behaviour, which also disabled dragging on warped quads.
- **Artwork on a warped template is now contained rather than stretched.** The previous single-design path mapped the image corner-to-corner onto the quad, distorting its aspect ratio to fill the frame. The sheet path draws each layer with `containBase` scaling, so aspect is preserved. This is a deliberate rendering change, not an accident, and the size slider is now meaningful on those templates where it used to be disabled.

The photographic-template colour rule is unchanged: `#m-color-field` is hidden outright, because those templates have no colorway concept.

## Two CSS Specificity Traps Worth Recording

Both produced a page-wide horizontal scroll at **every** viewport, and neither was visible by inspection.

**`.sr-only` is a single class and loses to any `.parent element` rule.** The hidden file input was written as `class="sr-only"`, but `.field input` (a class *and* a type, specificity 0-1-1) sets `width: 100%`, which beats `.sr-only`'s `width: 1px` (0-1-0). The input is `position: absolute` by then, so it resolved to the full width of its containing block and pushed the page sideways by roughly a viewport. The same trap hit `#m-scale-output`, where `.range-row output`'s `min-width: 3rem` beat `.sr-only`'s width and reserved 48px at the end of the row.

The fixes are a dedicated `.file-trigger { display: none }` for the input (it is never focused or clicked directly — the visible buttons carry the accessible names and call `.click()` on it) and an explicit `.range-row output.sr-only { min-width: 0 }`.

**An author `display` declaration beats the UA stylesheet's `[hidden] { display: none }`.** `.layer-list` (`display: flex`) and `.layer-actions` (`display: grid`) both ignored `element.hidden = true` from JavaScript until `.layer-list[hidden], .layer-actions[hidden] { display: none }` was added.

A third, milder trap: the mockup grid override is declared **inside** `@media (min-width: 48.0625rem)` on purpose. Below 48rem the shared `.editor-layout { grid-template-columns: 1fr }` rule must win, and a bare `.editor-layout.mockup-layout` would outrank it and strand the sidebar in a two-column grid on a phone.

## Verification

`node tests/verify-layout.js`: **881 passed, 1 failed.**

The single failure is section 4, "ads blocked: working tree matches HEAD", which compares the working tree against `git archive HEAD`. It necessarily trips on any intentional layout change and clears once committed. The differences are confined to two pages — `mockup` (this work) and `index` (a separate uncommitted change splitting the T-Shirt/Hoodie catalog card in two). Every other page in the suite measures byte-identical, which is the signal that matters: the shared-stylesheet edits did not leak.

Sections 1, 2, 2b, 2c and 3 pass clean, including no horizontal scroll at all fourteen widths down to 320px, correct ad-band selection at every boundary, rail inset integrity, and print output.

Behaviour is not covered by that suite, so it was exercised separately in a real browser (48 checks, all passing): uploading several designs; selecting, moving, resizing and rotating each independently with real pointer events; replace preserving placement; remove; hide/show; the colour popover on a vector product and its absence on a photographic one; persistence and pending-state restore across a reload; the mobile Edit/Preview switch at 320px; dark mode repaint; and — asserted directly on the decoded PNG — that an exported file contains no selection chrome.

## Deliberately Not Replicated From the Reference

- **The download format dropdown.** TemplateBox exports PNG only; a chevron opening a menu of one is noise. `#download-mockup-png` is untouched.
- **"Download Without Watermark".** There is no paid tier and no watermark.
- **The product-category top navigation** (Mockups / Video Mockups / 3D Mockups / Collection / Tools). The editor bar's nav slot belongs to the shared mega-menu, which is off limits.
- **The bookmark/save button.** Saving is automatic and already reported by `#save-state`.
- **Layer reordering.** Array order is z-order, so drag-to-reorder is cheap to add, but it is not in the reference screenshots and was left out. This is the most likely follow-up: with two overlapping designs, the only way to change which sits in front is currently to remove and re-add one.
