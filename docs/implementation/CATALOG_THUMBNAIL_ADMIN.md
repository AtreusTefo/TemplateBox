# Catalog Thumbnail Management in admin.html

Added: August 22, 2026

## Summary

`admin.html` gained a second workflow. Alongside the blog post workspace it now
carries a Catalog Thumbnails panel that attaches a required default thumbnail
and an optional hover thumbnail to any homepage catalog card, previews the pair
in the production markup, and exports the two renamed image files plus the
markup block that references them.

Nothing about the public site changed. The panel produces artifacts that a
human places in the repository, exactly as the blog post export does.

## What This Targets

`site/index.html` already carried a two-image convention on two of its eighteen
cards, introduced August 18, 2026:

```html
<div class="card-preview photo" aria-hidden="true">
    <div class="card-media">
        <img class="card-thumb card-thumb-blank" src="...-thumb-blank.jpg" alt="" width="800" height="1000" loading="lazy">
        <img class="card-thumb card-thumb-hover" src="...-thumb.jpg" alt="" width="800" height="1000" loading="lazy">
    </div>
</div>
```

`card-thumb-blank` lays out normally and is the card at rest. `card-thumb-hover`
stacks on top absolutely and crossfades in under `@media (hover: hover)` on
`:hover` and `:focus-within`. A card with only the first image is a complete
card, which is why the hover slot is optional in the panel and never blocks a
save. Sixteen of the eighteen cards are exactly that today, drawing CSS
miniatures instead of photographs.

The panel does not invent this structure. It emits it.

## Why Artifact-Based Rather Than Data-Driven

The obvious alternative was a catalog registry file, along the lines of
`js/mockup-templates.js`, with `index.html` rendering its cards from it and
`admin.html` editing it.

That was rejected, and the reasoning is worth keeping because it will look like
an oversight later:

- **There is no catalog data file to edit.** The eighteen cards are hand-written
  markup. A registry would mean rewriting the feed to render from JavaScript,
  which is a much larger change than the request, and one with a direct SEO cost
  on the site's most important indexed page: the card titles are the only
  crawlable internal links to the editors (`SEO_AUDIT.md` finding 2.1), and
  moving them into a runtime render is precisely the defect
  `BLOG_POSTS_NOT_CRAWLABLE_WITHOUT_JAVASCRIPT.md` records for the blog.
- **A browser page cannot write into `site/assets/`.** With no server and no
  build step, image files have to be downloaded and placed by hand whatever the
  data model is. The registry would have moved the markup step, not removed the
  file step.
- **The blog panel already establishes the pattern.** Edit locally, export an
  artifact, place it, commit. A second workflow in the same tool that behaved
  differently would be the surprising thing.

The cost is that pasting the markup is manual, and that the hardcoded item list
in `js/admin.js` can drift from `index.html`. Both are recorded under Known
Limitations below.

## Files Changed

| File | Change |
|---|---|
| `site/admin.html` | New `Catalog Thumbnails` panel after the post preview panel: item picker, new-item fields, destination folder, two file inputs, live preview, save/copy/clear actions, saved-item list, two help disclosures |
| `site/js/admin.js` | New self-contained IIFE below the blog workspace. Catalog item list, image intake and validation, preview, markup generation, image downloads, localStorage workspace |
| `site/css/style.css` | One block: `.admin-thumb-preview` column and width override, two `[hidden]` display overrides, `.admin-thumb-paths` |
| `site/index.html` | One word: the `catalog-empty` message said "all 17" against eighteen cards |

## How It Works

### The item list

`CATALOG_ITEMS` in `js/admin.js` is the eighteen cards as `index.html` ships
them, in source order. It is a picker, not a database: nothing on the public
site reads it, and a card added to `index.html` without being added here still
works, it just has to be re-entered as a new item.

`id` is the file-name stem. Where a card carries `data-doc` it is that value, so
the file name matches the variant the card already names. The three resume cards
and the three poster cards carry no `data-doc` (they open the same editor with
no preset), so their ids are derived from their titles and `doc` is null. The
generated markup omits the attribute in that case rather than inventing one,
which would send a preset to an editor with no variant table to match it
against.

`folder` is present only on the two cards that already have thumbnails on disk,
so re-exporting one regenerates its existing path rather than moving the file.
Everything else falls back to the category default.

### Image intake

Three gates, in order:

1. `file.type.startsWith("image/")`, per the project's Image Restrictions
   standard. Processing terminates immediately and the input is cleared.
2. The mime type must be in `EXT_BY_TYPE` (JPEG, PNG, WebP), which is also where
   the file extension comes from. Deriving the extension from `file.name` would
   take it from a user-controlled string: a file called `art.jpg` that is really
   a PNG would download as `.jpg` and the generated markup would point at a file
   the deploy does not contain.
3. 500 KB. Images are held as data URIs in `localStorage` so the form survives a
   refresh, and that storage is a few megabytes shared with the blog workspace.
   The thumbnails already shipping are around 60 KB each.

A decode probe follows. It is a second gate — a file can carry an image mime
type and still not decode — and it is where `naturalWidth`/`naturalHeight` come
from, which the generated markup needs for its `width`/`height` attributes.
Those attributes are not decoration: without them the feed shifts as thumbnails
load.

### Preview

The preview is the homepage's own markup inside a real `.catalog-grid` wrapper:
`.template-card` > `.card-preview.photo` > `.card-media` > two `.card-thumb`
images. The 4:5 window, the hover crossfade, the card lift and the rounded
geometry are all inherited from the feed's rules rather than reimplemented, so
what the panel shows cannot disagree with what ships.

Two `[hidden]` overrides were needed, both for the same reason: an author
`display` beats the UA stylesheet's `[hidden] { display: none }`.
`.catalog-grid` sets `display: grid` on the wrapper, and
`.card-preview.photo .card-thumb` sets `display: block` on the images. Without
the second rule the hover slot would paint over the default image whenever an
item has no hover thumbnail, which is the optional case and therefore the common
one.

The single-column override has to be declared after `.catalog-grid`'s 2/3/4
column ladder. Media queries carry no specificity, so source order is the whole
contest — the same trap the rail's `display: none` gates document.

### Markup generation

Every element carrying operator-supplied text or a generated path is built with
`createElement`/`textContent`/`setAttribute` and then serialized, so escaping is
the serializer's job rather than a hand-rolled escaper. The surrounding wrapper
lines are literal constants containing no variable at all. Indentation matches
`index.html`, so the block pastes in without reformatting.

Two details worth keeping:

- **The elements are built in an inert document** created with
  `document.implementation.createHTMLDocument("")`. An `<img>` created in the
  live document and given a `src` fetches it immediately even while detached
  from the tree, and the `src` being generated is by definition a file that does
  not exist yet — so every Copy Markup logged a 404 for the thumbnail it was
  describing. Caught in the browser, not in review.
- **The opening tag comes from the serializer**, via a helper that strips the
  closing tag from `outerHTML`. Slicing to the first `>` would be shorter and
  wrong: nothing in the HTML serialization rules escapes `>` inside an attribute
  value.

An existing card produces the `.card-preview` block alone, indented 20 spaces,
to replace that card's existing preview. An item not in `CATALOG_ITEMS` produces
the whole `<article class="template-card">`, indented 16, to paste into
`.catalog-grid`.

### Downloads

Data URIs are converted to Blobs before download. Browsers cap or block `data:`
URLs on a download link at sizes well under the 500 KB cap; a Blob URL is what
the post-page export already uses and has no such limit. Downloads are spaced
350ms apart for the same reason as the post pages: browsers throttle rapid
sequential downloads, and a zip library would mean a CDN dependency for a
handful of files.

### Persistence

`tb_admin_catalog_thumbs`, separate from the blog workspace's `tb_admin_posts`.

`TB.storageSet` swallows quota and private-mode failures by design, so the write
is read back and a failure is reported. A workspace holding several images is
exactly the case that fills the quota, and silently losing an upload the
operator believes is saved is the failure worth catching.

## Publishing Workflow

1. Pick a catalog item, or choose "Add a new catalog item" and describe it.
2. Upload the default thumbnail. Required.
3. Optionally upload the hover thumbnail.
4. Save. The item joins the list, stored in this browser only.
5. Download. Put the files in the folder the row names; they are already named
   to the convention.
6. Copy Markup and paste it into `index.html`.
7. For a new card, update the count in the `catalog-empty` message.
8. Commit and push to `main`, or drag the `site` folder into Netlify.

## Verification

Driven in a browser against the local server, not reasoned about:

- All eighteen items appear in the picker, grouped by category (6/3/3/6).
- A `text/plain` file is refused with a visible message and the input cleared.
- Default-only save succeeds; the hover slot renders `display: none` with no
  `src`, so it cannot paint over the default.
- Saving with no default image is refused: "A default thumbnail is required. The
  hover thumbnail is optional."
- Adding a hover image later changes only that field; the row and the sync line
  move from "Default only" to "Default and hover".
- Generated markup is structurally identical to the two photo cards already in
  `index.html`, including attribute order and indentation, for both the
  preview-block and whole-article shapes.
- A title of `Tote "Bag" & <Canvas>` serializes as
  `Tote "Bag" &amp; &lt;Canvas&gt;` in text position. No injection.
- File names and extensions track the source format: `hoodie-thumb-blank.png`,
  `hoodie-thumb.png`, `canvas-tote-bag-thumb-blank.jpg`. An item with no hover
  image downloads one file, not two.
- Workspace survives a full page reload.
- Hover crossfade confirmed by screenshot at rest and hovered, driven entirely
  by the production CSS.
- No console errors, no 404s after the inert-document fix, no horizontal scroll.
- `node tests/verify-layout.js`: 981 passed, 0 failed.

## Known Limitations

- **`CATALOG_ITEMS` can drift from `index.html`.** Nothing enforces agreement.
  A card added to the homepage without a matching entry here is reachable only
  through the new-item path, which then generates a whole `<article>` rather
  than the preview block the card actually needs. `tests/verify-layout.js` does
  not scan `admin.js`, so this would fail silently — the same defect class as
  `EXPORTED_POST_PAGE_FOOTER_DRIFT.md`. Worth a static check if the list is
  edited often.
- **Category, title and variant of an item saved through the new-item path are
  not editable afterwards.** Only the folder and the images are. Delete and
  re-add to change them.
- **No image processing.** Aspect ratio, compression and dimensions are the
  operator's responsibility. The preview shows what a wrong ratio will look
  like, since `object-fit: cover` crops it exactly as the feed will.
- **The markup step is manual.** See the reasoning above; automating it means
  building the catalog registry that was deliberately not built.
