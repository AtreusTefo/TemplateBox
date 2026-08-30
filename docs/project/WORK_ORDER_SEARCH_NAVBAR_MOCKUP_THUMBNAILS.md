# Work Order: Search Surface, Editor Navbar, Mockup Background, Catalog Thumbnail Fit

Status: not started. Written August 24, 2026. Target branch: `dev2`.

Paste this whole file into Claude Code as the task, and attach the two reference
screenshots with it:

- `mobile and tablet search button.webp` -- the mobile search surface to imitate:
  a search field pinned at the top of the viewport, then stacked browse rows,
  each a short section heading over a row of image tiles.
- `navbar.PNG` -- the desktop editor bar to imitate: brand mark hard left, then a
  row of category dropdowns, then a wide search field, then the right-hand
  actions.

---

## How to work

1. Read `CLAUDE.md` (identical to `AGENTS.md`) before touching anything. The ad
   invariants, the launch-flow rules and the rail-inset mechanism in it are
   binding, and several of them are easy to break silently from the files this
   work order touches.
2. Follow the Error Resolution Procedure: search `docs/error-fixes/`,
   `docs/implementation/` and `docs/daily-reports/` for each symptom BEFORE
   analysing it yourself.
3. Run `node tests/verify-layout.js` from the repository root first, to get a
   clean baseline, and again after each task. Exit code 1 on any failure.
   Nothing runs it automatically.
4. Vanilla HTML5 / CSS3 / ES6 only. No dependencies, no build step, no
   server-side anything. Never `innerHTML` for content you did not author as a
   literal; use `textContent`.
5. No emojis anywhere -- code, comments, documentation or commit messages.
6. One commit per task, and one write-up per task in `docs/implementation/`.
   Task 1 additionally needs an entry in `docs/error-fixes/`, because part of it
   is a live bug.
7. Where a task reverses or reopens a documented decision, say so in the write-up
   in those words. Two of the five do.

---

## Task 1 -- The mobile and tablet search button must lead to a real search page

### What is actually wrong right now

The search button is not merely unhelpful on small screens; on almost all of
them it does nothing at all.

- `site/index.html:157` renders `.search-toggle`.
- `js/app.js:917` `initHeaderToggles()` toggles a `search-open` class on the
  header (`setSearch`, `js/app.js:957`).
- `site/css/style.css:800-804` hides the field: `@media (max-width: 62rem) {
  .site-search { display: none } }`.
- The only rule that puts the field back is `site/css/style.css:617`
  (`.site-header.search-open .site-search { display: flex; ... }`) and it sits
  inside `@media (max-width: 22.5rem)`, opened at line 601. Its own comment says
  it beats the 62rem rule on specificity, which is true, but it is scoped to
  360px and below.

Net effect: from 361px to 992px -- every phone wider than an iPhone SE and every
tablet below 992px -- tapping search toggles a class that changes nothing. Above
62rem the field is inline and the button is hidden. The feature has only ever
worked at 360px and narrower. Verify this yourself at 390px before fixing it, and
write it up in `docs/error-fixes/` with the root cause stated as a media-query
scoping error, not as a missing feature.

### What to build

A real search page, `site/search.html`, and make the button navigate to it.

1. **Page shell.** Standard public-page shell: same `<head>` conventions as
   `site/about.html`, the standard `.site-header` with wordmark, `.site-nav`,
   the `.nav-more` mega-menu and the theme toggle. No footer (no page has one).
2. **The search field is the first thing in `main`**, sticky under the header,
   focused on arrival when there is no `?q=`.
3. **Query handling.** Accept `?q=`, prefill it, apply it. Typing filters live.
   Mirror the current query into the URL with `history.replaceState` so a reload
   or a shared link keeps it -- never navigate per keystroke. Sanitize with
   `TB.sanitize` before anything reaches the DOM, and write it with
   `textContent` only.
4. **Two result groups: Templates and Guides.** Each shows a count and an empty
   state. Guides are what makes this page worth having over the homepage's
   in-place filter, which searches templates only.
5. **Empty-query browse state**, per the screenshot: one row per catalog category
   (Receipts and Invoices, Resumes, Posters and Prints, Product Mockups) plus a
   Guides row. Short heading, then the tiles.
6. **Data sources -- do not create a third copy of the catalog.**
   - Templates: `fetch("index.html")`, parse with `DOMParser`, and `importNode`
     the `<article class="template-card">` elements. That gives the real cards,
     the real CSS miniatures and the real photo thumbnails with zero duplication
     and no drift check to maintain. No `innerHTML` is involved.
   - The alternative -- a `js/catalog-data.js` registry -- means a third list
     that must be kept in step with `index.html` and with `CATALOG_ITEMS` in
     `js/admin.js`, which `tests/verify-layout.js:360-460` already cross-checks.
     Only take that route if the fetch approach fails for a concrete reason, and
     if you do, extend that existing drift check to cover the third list.
   - Guides: `window.TB_BLOG_POSTS` from `js/blog-data.js`, exactly as
     `initGuidesStrip` (`js/app.js:424`) already does. Load `js/blog-data.js` on
     the page.
   - Failure mode: if the fetch fails, render a visible fallback linking to
     `index.html`. A blank page is not acceptable.
7. **Trap to handle explicitly.** Cloned cards carry `data-target` and
   `data-doc`, but `bindLaunchControls` (`js/app.js:152`) runs once inside
   `initCatalog` at `DOMContentLoaded`. Cards inserted after that are NOT bound,
   so their clicks would follow the raw href straight into the editor and skip
   `loading.html` -- silently defeating the monetized flow the whole site is
   built around. Export `bindLaunchControls` on the `TB` object and call it over
   the inserted subtree. Confirm with a real click that a card on the search page
   lands on `loading.html?target=...`, and that ctrl/middle-click opens the same
   interstitial in a new tab.
8. **New `js/search.js`, loaded only by `search.html`.** Use hooks distinct from
   the homepage's (`data-search-page`, `data-search-page-input`, and so on) so
   `initSearch` (`js/app.js:1122`), which requires `[data-search]` +
   `[data-search-input]` + `[data-catalog-grid]` together, misses cleanly and
   cannot double-bind. Then add `"js/search.js"` to the `sources` map in check 1d
   of `tests/verify-layout.js` (around line 201) so the new file's selectors get
   the same "every hook exists in the served markup" protection app.js and ads.js
   have.
9. **Advertising.** The page is a new member of the content-page family and must
   satisfy "never two bands at once and never none". Carry, exactly as
   `site/about.html:217-234` does:
   - `<aside class="content-rail" data-ad-content-rail>` with three
     `[data-ad-rail-slot]` children;
   - `<div class="site-anchor" data-ad-anchor>`.

   `mountSiteAnchor` and `mountContentAds` (`js/ads.js:543`, `js/ads.js:592`) run
   unconditionally on every page, so no change to `js/ads.js` is needed. Then add
   `["search", "/search.html"]` to `PAGES` in `tests/verify-layout.js:56` so all
   fourteen widths are asserted. Do not add an entry to `RAIL_GAP`.
10. **SEO.** `<meta name="robots" content="noindex, follow">`, no `sitemap.xml`
    entry, and a matching `X-Robots-Tag` header for `/search.html` in
    `netlify.toml` alongside the existing `/admin.html` and `/loading.html`
    blocks. Do NOT add a `robots.txt` Disallow -- a Disallow stops the crawler
    reading the page's own noindex, which is documented in the file map and in
    `netlify.toml`'s own comments. The reasoning for noindex: every template it
    lists is already on `index.html`, so an indexable version is a thin duplicate
    of the most-indexed page on the site.
11. **Wire the entry point.** Below 62rem, `index.html`'s `.search-toggle`
    becomes an anchor to `search.html` rather than a class toggle. Keep the
    inline field above 62rem, where it works and where filtering in place is the
    right behaviour. It stays hidden above 62rem so there are never two search
    affordances in one bar.
12. **Delete what this retires.** The `search-open` reveal rule at
    `site/css/style.css:614-622`, and the `setSearch` / `search-open` branches in
    `initHeaderToggles` (`js/app.js:957-1020`) if nothing sets the class any
    more. This project's own rule: retiring a unit deletes the rule sized for it.
    Leaving dead CSS behind is how the 116px over-reservation in the August 20
    anchor work happened.

### Acceptance

- At 320, 360, 390, 414, 768 and 1024 CSS px the button navigates to
  `search.html` and the page is usable with no horizontal scroll.
- At 1200 and above the homepage's inline field still filters cards in place.
- `search.html?q=receipt` arrives already filtered.
- Exactly one ad band mounts on `search.html` at every width in `WIDTHS`.
- A search-page card click reaches `loading.html?target=...`.

---

## Task 2 -- Background colour for mockups with a blank background

### Goal

On the product mockup editor, let the visitor choose the background colour when
the active mockup has a blank background.

### Where things stand

- The four vector products (`PRODUCTS`, `js/mockup.js:237` -- tshirt, hoodie,
  mug, box) are drawn by `paint()` (`js/mockup.js:802`) onto a cleared canvas.
  The surround is transparent, so the exported PNG has no background at all.
  These are the blank-background case, always.
- Photographic templates are photographed scenes and are NOT blank by default.
- `backing` (`js/mockup.js:975`) is a different thing entirely: the white paper
  sheet behind artwork that does not fill a frame's window. It must stay white
  and must not follow the background colour. Do not conflate the two.

### What to build

1. A new `.field.panel-block` in the mockup sidebar, after the Color block
   (`site/mockup.html:204-263`), with `m-bg-*` ids. Hide the whole panel when the
   active product is not eligible, the same way `#m-color-field` is hidden for
   photographic templates.
2. **Eligibility is declarative, never inferred.** The vector products qualify
   automatically. A photographic template qualifies only by an explicit opt-in
   field in `js/mockup-templates.js` (for example `background: true`), documented
   in that file's header comment block. Do not detect it from the base image's
   alpha channel: `wood-a4`'s base is transparent inside its print window --
   that transparency IS the mask -- so an alpha test would qualify it wrongly and
   paint the chosen colour behind the poster.
3. **Default is Transparent**, and picking nothing must leave the exported PNG
   byte-identical to today's. This is a new option, not a new default.
4. **Reuse the existing colour picker.** The saturation/value square, hue strip,
   hex/RGB inputs and presets already exist (`site/mockup.html:209-260`,
   `js/mockup.js:1563-1652`). Factor that into something that can drive two
   instances rather than duplicating roughly 150 lines and a second copy of the
   popover markup. If the refactor turns out to be riskier than it looks, the
   fallback is a preset swatch row plus a hex input -- but say in the write-up
   which you did and why.
5. **Render order.** The background fills first, before the product illustration
   in `paint()` and before the base photograph in `drawPhoto()`
   (`js/mockup.js:964`). It must appear in the PNG export
   (`js/mockup.js:2112`) and in the "My Mockups" tray thumbnails
   (`js/mockup.js:2087-2106`), both of which read `#mockup-canvas` and so get it
   for free if the fill is on that canvas rather than in CSS.
6. **Persistence.** Add the value to `persist()` (`js/mockup.js:1998`) as
   `bg: "#RRGGBB"` or `null`, and restore it on load. Validate the restored
   value against `/^#[0-9a-fA-F]{6}$/` before it reaches `ctx.fillStyle`:
   tampered localStorage must not flow into a canvas API unchecked, per the data
   sanitization standard.
7. Presets worth shipping: Transparent, white, the site's cream ground, a light
   grey, a charcoal, and free hex entry for anything else.

### Acceptance

- Choosing a colour repaints the canvas immediately, survives a reload, and is
  present in both the downloaded PNG and the tray thumbnail.
- With no colour chosen, the exported PNG still has a transparent background.
- The panel is absent for `wood-a4` and `tshirt-model-white` unless they are
  opted in.
- The white paper inside the wood frame's window is unchanged in every case.

---

## Task 3 -- Desktop and laptop editor navbar: brand, mockup links, search field

Reference: `navbar.PNG`.

Current bar: `site/mockup.html:95-112` -- a house icon (`.editor-home`, line 96),
the document name input (`#doc-name`, lines 98-99), `.editor-actions` with the
save indicator and Download PNG, and an empty `<nav class="site-nav">`.

### What to build (on `mockup.html` only -- see Open Questions)

1. **Brand hard left.** At 62rem and above, replace the house icon with the
   TemplateBox wordmark used on `site/index.html:137` (same SVG plus the
   `<span>`), linking to `index.html`. Use a new class (`.editor-brand`); do NOT
   change `.editor-home`'s shared rule at `site/css/style.css:3631` -- resume,
   docs and poster all use it and must come out byte-identical.
2. **Links to the other mockups.** A "Mockups" dropdown listing the six mockup
   cards `index.html` currently carries: `tshirt`, `hoodie`, `mug`, `box`,
   `wood-a4`, `tshirt-model-white`. Reuse the existing `.nav-more` disclosure
   component (`site/index.html:167-217` plus `initNavMore` in `js/app.js`)
   instead of inventing a second dropdown pattern.
   - Every item is a real anchor: `href="mockup.html" data-target="mockup"
     data-doc="<id>"`. `bindLaunchControls` (`js/app.js:152`) already binds every
     `[data-target]` element on every page through `initCatalog`, so these route
     through `loading.html?target=mockup` with the variant preset written, and
     crawlers still see a genuine link. Do not hand-roll navigation, and do not
     call `launchTemplate` directly.
   - Accept or raise: switching mockups from inside the editor therefore costs
     the 10-second interstitial each time. That is consistent with every other
     launch on the site. An in-place template swap is a different decision and
     would need a rule for the visitor's existing layers -- do not implement it
     without the owner's word.
3. **Search field in the bar.** Shaped like `.site-search`; on Enter or on the
   icon it navigates to `search.html?q=<encodeURIComponent(value)>`. It filters
   nothing locally, so it must navigate -- there is no catalog on this page.
4. **Layout constraints that are easy to break here:**
   - `.editor-bar` is `.site-header` with different contents. The fixed ad rail
     insets the whole page with one `padding-right` on `<body>` and the header
     inherits it with no rule of its own. Never give the header its own width,
     margin or transform. If one looks necessary, the padding is being applied in
     the wrong place (`CLAUDE.md`,
     `docs/implementation/FIXED_FULL_HEIGHT_AD_RAIL.md`).
   - The bar must stay one row at 1280px with the rail mounted, which is the
     tightest desktop case. The current bar has four items; this adds a dropdown
     and a field.
   - The dropdown panel must open clear of the rail column. Check 1200, 1280,
     1440 and 1920 (Rail Inset Integrity in `CLAUDE.md`).

---

## Task 4 -- Mobile and tablet editor navbar: hamburger, home icon, search button

1. Below the collapse boundary: `.editor-home` house icon stays, a hamburger
   holds the mockup links, and a search button links to `search.html`. The brand
   wordmark and the inline field are hidden.
2. **Use the boundary the rest of the header already uses** -- 74.9375rem, the
   value `initHeaderToggles` matches on at `js/app.js:926` and the site's own
   "not a desktop" seam -- rather than inventing a new one, or the CSS and the JS
   will disagree about when the bar is collapsed. If you deliberately choose
   62rem instead so tablets keep the inline field, mirror that value in both
   places and say so in the write-up.
3. **Remove `#doc-name` from `site/mockup.html` (lines 98-99) at every width.**
   `#m-label` ("Mockup Label", `site/mockup.html:286-287`) is the naming control
   from now on. Then:
   - delete the `docNameInput` lookup, its listener and the persisted `docName`
     key from `js/mockup.js` (lines 655, 2012, 2017-2019, 2212-2213). Do not
     leave guarded dead code behind.
   - leave the `.doc-name` CSS alone (`site/css/style.css:3657`, and the
     references at 4054 and 6494): resume, docs and poster still use it.
   - a stale `docName` in existing localStorage must be ignored silently, not
     throw in the hydrate path.
   - if the export filename ever becomes dynamic, it reads `#m-label`. Today it
     is the literal `templatebox-mockup.png` (`js/mockup.js:2114`) -- changing
     that is optional and out of scope.
4. The editors' `.site-nav` is empty today, which is exactly why
   `initHeaderToggles` no-ops on them. Once the mockup editor's nav has contents,
   confirm the hamburger, the mega-menu cleanup inside `setNav`, and the Escape
   handling all behave, and that resume, docs and poster are untouched.

### Acceptance for tasks 3 and 4

- 1920, 1440, 1280: one-row bar, brand left, Mockups dropdown, search field,
  actions right, rail mounted, header's right edge exactly on the rail's left
  edge, no horizontal scroll.
- 1024, 768, 390, 320: house icon, hamburger, search button, actions; no name
  input anywhere; bar fits without wrapping into a tall header.
- A dropdown item click reaches `loading.html?target=mockup` and arrives in the
  editor with the chosen mockup loaded.
- `node tests/verify-layout.js` passes, including the editor ad-containment and
  rail-inset sections.

---

## Task 5 -- Catalog thumbnails must fill the whole card

### Diagnosis (confirm before changing anything)

- `.card-preview` is `aspect-ratio: 4 / 5` (`site/css/style.css:1657`).
- `.card-preview.photo .card-thumb` is `object-fit: contain`
  (`site/css/style.css:1700`).
- The Leaning Wood Frame pair is 1000x1000 (`site/index.html:641-642`:
  `wood-a4-thumb-blank.webp` and `wood-a4-thumb.webp`). A square image in a 4:5
  window letterboxes, leaving roughly a fifth of the card as empty ground.
- The t-shirt pair is 600x750 -- exactly 4:5 -- which is why only this one card
  looks wrong.

**Do not simply flip `contain` to `cover`.** That keyword was chosen deliberately
on August 23, 2026 and the reasoning is in the comment at
`site/css/style.css:1682-1699`: a catalog thumbnail depicts a finished design,
designs carry content to their edges, and `cover` crops exactly those edges. Flip
it and every future off-ratio upload is silently cropped. Fix the files instead,
and make the tool guarantee the ratio from here on. If after reading that comment
you still think `cover` is right, raise it rather than doing it.

### (a) Make the admin pipeline produce 4:5 thumbnails

In the Catalog Thumbnails IIFE of `site/js/admin.js` (from roughly line 872):

1. Add a crop-to-card-ratio pass in the intake path, before `scaleTo`
   (`js/admin.js:1200`). Name the constant (`CARD_ASPECT = 4 / 5`) and cite the
   stylesheet rule in its comment so the two cannot drift apart unnoticed.
   Centre crop.
2. `OUTPUT_MAX_EDGE` is 1000 (`js/admin.js:925`), so output lands at 800x1000 --
   the same shape as the thumbnails already shipping.
3. **The `alreadyFits` fast path (`js/admin.js:1343`) must also test the aspect
   ratio.** As written, a square upload already under 60KB is kept byte for byte
   and would walk straight past the new crop, reintroducing exactly this bug.
4. Give the operator an explicit choice, defaulting to Fill:
   - **Fill the card** -- centre-crop to 4:5 (default);
   - **Fit the whole design** -- pad to 4:5 with the card's own ground colour.

   Either way the file written to disk is 4:5, so `object-fit` stops mattering
   and no per-card class is needed. That is what keeps `previewMarkup`
   (`js/admin.js:1746`) emitting the same fixed block and avoids the "bespoke
   class dropped on the next publish" failure the stylesheet comment warns about.
5. The `width`/`height` attributes the generator writes (`js/admin.js:1737-1739`)
   come from the encoded canvas, so they should follow automatically -- confirm
   they do rather than assuming.
6. The in-page preview must show the processed result, not the original file.

### (b) Fix the two files already on disk

There is no image tooling in this repository -- no build step and no
dependencies -- so the crop can only run in the browser `admin.html` already
uses. After (a) ships:

1. Open `admin.html`, select "Leaning Wood Frame Poster Mockup".
2. Re-upload the current `wood-a4-thumb-blank.webp` and `wood-a4-thumb.webp` from
   `site/assets/thumbnails/product-mockups/posters-frames-canvas-billboards/`.
3. Publish (Chromium File System Access path writes the files and splices
   `index.html`) or export and paste the markup block by hand.
4. Confirm `site/index.html` ends with `width="800" height="1000"` on both
   images, matching the files.

If you cannot drive a browser, stop and say so. Do not hand-edit the width and
height attributes to values the files on disk do not actually have -- that trades
a visible gap for a layout-shift bug nothing will catch.

Leave `wood-a4-thumbnail-preview.webp` (1.4MB) alone; it is a deliberately unused
source render.

### Acceptance

- The Leaning Wood Frame card's image fills its card at 320, 768, 1200 and 1920,
  with no letterbox band, and the hover crossfade still registers with the
  resting image.
- A deliberately square test upload through admin comes out 800x1000.
- A deliberately wide (16:9) test upload comes out 800x1000 under both Fill and
  Fit, and Fit shows the whole design.
- The generated markup block is unchanged in shape.

---

## Cross-cutting constraints

- **Advertising invariants.** Never two bands at once and never none, at every
  width, on every page family. The anchor's reserved body padding must equal the
  height of the creative that actually mounted -- under-reserving strands the
  foot of the document under a fixed bar and over-reserving leaves dead space,
  and both are silent. `js/ads.js` reads `matchMedia` once at mount and never
  remounts, so **test by loading each width fresh; resizing the window proves
  nothing.**
- **No format that can navigate the visitor's tab without an explicit click on an
  ad.** No Pop-Under, no In-Page Push, on any page including the new one.
- **Do not touch the rail inset mechanism**: one `padding-right` on `<body>`,
  applied only once a banner has actually filled.
- **Security**: `textContent` over `innerHTML`; validate everything read back out
  of localStorage or a query string before it reaches the DOM or a canvas API.
- **Verification**: add checks for the new behaviours to `tests/verify-layout.js`,
  and break each new check on purpose once to confirm it catches the thing. An
  assertion that has never failed is not evidence.
- **Documentation**: `docs/implementation/` for each task's write-up,
  `docs/error-fixes/` for the search-toggle media-query bug. Never leave a
  document in the `docs/` root, and never put project files inside `site/` -- the
  publish directory is served verbatim.

---

## Open questions -- proceed with the stated default, flag if you disagree

1. **Search entry points.** Default: `search.html` is reachable from
   `index.html`'s mobile/tablet button and from the mockup editor bar only.
   Adding the button to the other fourteen page headers also means updating the
   `MEGA_MENU` constant in `js/admin.js`, which regenerates exported post pages;
   that is a follow-up, not this task.
2. **Editor navbar scope.** Default: `mockup.html` only. Resume, docs and poster
   stay byte-identical. Rolling the same bar out to them is a follow-up, and
   "links to other mockups" would need a per-editor equivalent.
3. **Switching mockups from the editor** goes through the 10-second interstitial
   (default, consistent with every other launch on the site). An in-place swap is
   the alternative and needs a decision about the visitor's current layers.
4. **Background colour eligibility** for photographic templates is opt-in per
   registry entry. Both shipped photographic templates stay ineligible unless the
   owner says otherwise.
5. **Search page indexability.** Default: `noindex, follow`, no sitemap entry.
