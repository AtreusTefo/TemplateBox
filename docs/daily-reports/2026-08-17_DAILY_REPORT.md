# Daily Report: August 17, 2026

The Product Mockup Generator's editor went from placing exactly one design on a product to
compositing an ordered stack of them, with real corner/rotate handles instead of a slider. The
data model, the selection-chrome rendering, and two site-wide CSS specificity bugs the rebuild
surfaced are the substantive parts of the day; everything is committed as `26d2fa4` "improve
mockup editor page" on `dev2`, pushed to `origin/dev2`. Branch hygiene closed out the session:
`dev3`, which had drifted six days behind, was fast-forwarded to match `dev2` exactly.

## Summary

| Area | Outcome |
|---|---|
| Layer model | Single `design`/`offsetX`/`offsetY` globals replaced with an ordered array of layers (id, image, name, scale, offset, rotation, visibility); front-most-first list, back-to-front paint order |
| Persistence | Layer placement persists to `localStorage`; bitmaps stay in-memory only (poster editor's existing precedent), so a reload restores an arranged composition awaiting re-upload per layer |
| Selection chrome | Bounding box, corner resize handles, rotate handle and name tag moved to a second canvas (`#mockup-overlay`, `pointer-events: none`) stacked over the product canvas -- structurally prevents chrome from ever reaching an exported PNG, since export and tray thumbnails read the product canvas alone |
| Handle icons | Corner handles now draw a diagonal double-arrow oriented to the layer's own rotation; the rotate handle draws a circular arrow instead of a blank dot -- both hand-drawn on canvas, no new asset |
| Direct manipulation | One pointer pipeline drives move / resize / rotate, chosen by hit location; resize also reachable via a typed percentage field, rotate snaps to 15-degree steps with Shift held |
| Colour | Product colorways kept as one-click swatches; added a dependency-free HSV picker (CSS-gradient saturation/value square, hue strip, Hex/R/G/B inputs, preset grid, native `EyeDropper` where supported) |
| Warped photographic templates | Layers now composite into an offscreen flattened sheet before the perspective warp, so a multi-layer stack survives a leaning-frame template in one GPU pass instead of one pass per layer; artwork on these templates is now aspect-preserved rather than stretched corner-to-corner (a deliberate rendering change, not incidental) |
| Catalog | The single "Apparel Mockup: T-Shirt and Hoodie" card split into two cards (`data-doc="tshirt"` / `"hoodie"`), matching the removed in-editor template picker's one-card-one-product constraint |
| CSS defects found | Two site-wide horizontal-scroll bugs, both `.sr-only`/`[hidden]` losing a specificity fight to a more specific rule elsewhere in the stylesheet -- see section 3 |
| Verification | `tests/verify-layout.js`: 881 passed, 1 failed (the "matches last commit" baseline, which any real layout change trips by design); 48 additional behavioural checks in throwaway scripts, all passing |
| Branch maintenance | `dev3` (`39ec5ea`, 6 days behind) fast-forwarded to `dev2`'s `26d2fa4` -- verified zero unique commits on `dev3` before pushing, so nothing was at risk of being discarded |
| Commit | `26d2fa4` "improve mockup editor page" on `dev2`, pushed to `origin/dev2` and `origin/dev3` |

## 1. The layer model

### 1.1 What changed and why

The editor's canvas engine (`js/mockup.js`) previously carried a single uploaded design: one
`Image`, one scale, one x/y offset, composited with `drawDesignInArea()`. That became an array
of layer objects -- `{ id, name, img, scale, offsetX, offsetY, rotation, visible, rect }` --
painted in array order (index 0 first, last entry frontmost), with a single `selectedId`
tracking which one the sidebar and the canvas handles currently act on.

`rect` is the one runtime-only field beyond `img`: it holds the layer's last-painted screen-space
geometry (centre, width, height, rotation), recomputed every frame by `paintLayers()`, and is
what the hit-testing and handle-drawing code reads. Nothing about placement math lives in two
places -- the paint pass and the pointer pipeline both consume the same `rect`.

### 1.2 What persists across a reload

Bitmaps are never written to `localStorage`. This was already the poster editor's rule for image
data (respecting browser storage quotas), extended here to every layer rather than the one image
the old version had. What does persist is each layer's placement: name, scale, offset, rotation,
visibility. A layer restored this way arrives with `img === null` -- the `is-pending` state,
rendered as a dashed empty thumbnail with the remembered filename and "Re-upload to restore" --
so returning to the editor rebuilds the arrangement and waits for files rather than discarding
the layout.

Saves written before this change held one design's placement in flat top-level fields (`scale`,
`offsetX`, `offsetY`). `restoreLayers()` migrates that shape into a single-layer array instead of
discarding old saves.

## 2. Selection chrome on a second canvas

`#mockup-overlay` sits over `#mockup-canvas`, same internal resolution, `pointer-events: none`.
This is a structural choice, not a stylistic one: PNG export and the "My Mockups" tray thumbnails
both call `.toDataURL()` on `#mockup-canvas` alone, so anything painted there ends up in the
visitor's downloaded file. Keeping the box, the corner handles, the rotate handle and the layer
name tag on a separate surface makes it impossible for selection chrome to be exported, rather
than something that has to be remembered at each of the two export call sites. Selecting a
different layer also only repaints the overlay, not the product underneath it.

Handle sizes are quoted in **screen** pixels and converted through a canvas-to-CSS-pixel ratio,
so a handle is the same visual size whether the canvas is a 1000px vector square scaled down or a
photograph at native resolution -- which meant the overlay has to repaint on `resize` and on the
mobile Edit/Preview tab switch, since that toggle changes the canvas's displayed width without
firing a resize event.

### 2.1 Handle icons

The corner squares and the rotate circle previously carried no glyph -- a plain dot and four
plain squares, indistinguishable in function from each other. Two small canvas-drawn icons were
added: a diagonal double-headed arrow at each corner, computed from that corner's actual angle
from the layer's centre (so it rotates correctly with the layer instead of staying screen-
aligned), and a circular arrow inside the rotate handle. Both are drawn with plain `arc`/`lineTo`
calls at the point the handles are already painted -- no new asset, no library.

## 3. Two CSS specificity bugs, both causing a page-wide horizontal scroll

Neither was visible by inspection; both were found by enumerating every element whose bounding
box extended past the viewport's right edge, at several widths, in a real browser.

**`.sr-only` is a single class, and loses to any rule with higher specificity.** The hidden file
input driving every upload path was marked `class="sr-only"`, but `.field input` (a class *and*
an element type, specificity 0-1-1) sets `width: 100%`, beating `.sr-only`'s `width: 1px`
(0-1-0). The input is `position: absolute`, so it resolved to the full width of its containing
block and pushed the page sideways by roughly a viewport at every width tested. The same
mechanism hit `#m-scale-output`, where `.range-row output`'s `min-width: 3rem` beat `.sr-only`'s
width and reserved 48px at the end of the row. Fixed with a dedicated `.file-trigger { display:
none }` and an explicit `.range-row output.sr-only { min-width: 0 }`, rather than trying to win
the specificity fight with `.sr-only` itself.

**An author `display` declaration beats the user-agent stylesheet's `[hidden] { display: none }`.**
`.layer-list` (`display: flex`) and `.layer-actions` (`display: grid`) both ignored
`element.hidden = true` set from JavaScript, because the author rule outranks the browser's own
`[hidden]` rule at equal specificity by source order. Fixed with explicit `.layer-list[hidden],
.layer-actions[hidden] { display: none }`.

## 4. Warped photographic templates

Layers now composite into an offscreen "artwork sheet" sized to the warp zone's bounding box, and
the *sheet* is what gets perspective-warped -- so a multi-layer composition on a leaning-frame
template goes through the GPU warp pass once, not once per layer. Two consequences worth
recording:

- Direct manipulation is still unavailable on non-rectangular warp zones: mapping a pointer back
  into sheet space would need the inverse of the perspective transform, which the warp library
  does not return. Layers on these templates keep no hit rect; placement there is sidebar-only,
  matching the previous version's behaviour.
- Artwork on these templates is now **contained** within the print area rather than **stretched**
  to fill it corner-to-corner, which is how the single-design version mapped an image onto a warp
  zone. This changes existing rendered output on any warped template and was a deliberate call,
  not an incidental side effect of the sheet-based rewrite.

## 5. Verification

`node tests/verify-layout.js`: **881 passed, 1 failed.** The one failure is the suite's "ads
blocked: matches last commit" parity check, which diffs the working tree against `git archive
HEAD` and therefore trips on any genuine layout change by design. The differing measurements
were confined to `mockup.html` (this work) and `index.html` (the catalog card split, section 6)
-- every other page in the suite measured byte-identical, which is the signal that the shared
`css/style.css` edits did not leak into unrelated pages.

That suite covers layout and ad wiring, not feature behaviour, so the layer engine was exercised
separately with throwaway Node/CDP scripts driving a real headless browser: 35 checks covering
multi-layer upload, hide/replace/remove, the colour picker, persistence and pending-state restore
across a reload, and confirming a decoded exported PNG contains zero selection-chrome pixels; a
further 13 checks driving real pointer events for move, corner-resize and rotate, including a
15-degree Shift-snap and a click-to-deselect. All 48 passed. Two of those checks initially
reported failures that turned out to be bugs in the test itself (aiming at a clipped visible
bounding box instead of the layer's true corners; reading `getComputedStyle`'s live object after
the theme had already changed underneath it) rather than in the code -- corrected before trusting
the result.

## 6. Catalog: the T-Shirt/Hoodie card split

The mockup catalog on `index.html` carried one card, "Apparel Mockup: T-Shirt and Hoodie",
routing to a single `data-target="mockup"` link with no product preset. Split into two cards
(`data-doc="tshirt"`, `data-doc="hoodie"`), each with its own preview thumbnail and colour dots.
This follows directly from an earlier, separate change: the editor's in-editor template picker
was removed, so the catalog card is the *only* way to choose a product, and one card can
therefore only ever open one.

## Verification Summary

| Check | Result |
|---|---|
| Full suite (`tests/verify-layout.js`) | 881 passed, 1 failed (expected baseline-parity failure, see section 5) |
| Layer engine behavioural checks (throwaway script) | 35 passed, 0 failed |
| Direct-manipulation pointer-event checks (throwaway script) | 13 passed, 0 failed |
| Handle-icon visual check | Rendered and screenshotted directly; confirmed legible on both a dark and a white product |
| Branch sync (`dev3` <- `dev2`) | Fast-forward confirmed via `git merge-base --is-ancestor`; verified zero unique `dev3` commits before pushing |

## Defects Found This Session

1. **`.sr-only` file input resolved to full containing-block width**, pushing every page into
   horizontal scroll at every tested viewport (320px through 1920px). Caused by `.field input`
   outranking `.sr-only` on specificity. Fixed.
2. **`.sr-only` on the scale `<output>` reserved 48px it should not have**, same specificity
   mechanism via `.range-row output`. Fixed.
3. **`element.hidden` had no effect on `.layer-list`/`.layer-actions`**, because both carry an
   author `display` declaration that outranks the browser's built-in `[hidden]` rule. Fixed with
   explicit `[hidden]` overrides.
4. **Two bugs in the session's own verification scripts**, not in the shipped code: a drag test
   computed handle positions from a clipped visible bounding box instead of the layer's actual
   (unclipped) corners; a dark-mode test read `getComputedStyle`'s live declaration object after
   the theme attribute had already been reset, comparing a value against itself. Both corrected
   before the results were trusted.

## Open Items

- **Layer reordering is not implemented.** Paint order is array order, so it would be cheap to
  add, but with two overlapping layers the only current way to change which sits in front is to
  remove and re-add one. Not present in the reference material this rebuild followed; flagged in
  `MOCKUP_EDITOR_MULTI_LAYER_UI.md` as the most likely next piece of work.
- **The site mega-menu's "Product Mockup Generator" link points at the page it is already on**
  when reached from within the mockup editor's own catalog reference elsewhere on the site --
  clicking it replays the 10-second loading interstitial for no reason. This is inherited from an
  existing shared component, not introduced today, and not yet addressed.
- **Warped-template output changed for any existing template using a non-rectangular warp
  zone** (contained instead of stretched, section 4). Existing screenshots or documentation
  referencing the old stretched behaviour on such a template would now be stale.

## Related Files

- `docs/implementation/MOCKUP_EDITOR_MULTI_LAYER_UI.md` -- full technical write-up of sections
  1, 2, 4 and the CSS specificity findings in section 3
- `docs/implementation/MOCKUP_GENERATOR_IMPLEMENTATION.md`,
  `docs/implementation/PHOTO_MOCKUP_TEMPLATES_IMPLEMENTATION.md` -- updated for the layer-array
  model and the sheet-based warp compositing respectively
- `docs/memory/PROJECT_STATUS.md` -- pointer to today's work added
- `site/js/mockup.js`, `site/css/style.css`, `site/mockup.html` -- every code change described
  above
- `site/index.html` -- the T-Shirt/Hoodie catalog card split, section 6
- `tests/verify-layout.js` -- unchanged today; ran as the primary verification gate throughout
