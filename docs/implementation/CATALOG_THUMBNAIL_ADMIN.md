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
| `site/admin.html` | New `Catalog Thumbnails` panel after the post preview panel: project-folder controls, item picker, new-item fields, destination folder, two file inputs, live preview, save/publish/copy/clear actions, saved-item list, four help disclosures |
| `site/js/admin.js` | New self-contained IIFE below the blog workspace. Catalog item list, image intake and compression, preview, markup generation, the `index.html` patcher and its verification, image downloads, localStorage workspace |
| `site/js/admin-fs.js` | New. File System Access API wrapper: folder handle, permission states, IndexedDB persistence, read/write/delete/list primitives. Knows nothing about catalogs. Loaded by `admin.html` only, before `admin.js` |
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

Two gates, then compression:

1. `file.type.startsWith("image/")`, per the project's Image Restrictions
   standard. Processing terminates immediately and the input is cleared.
2. 24 MB. This is a decode guard, not a quality rule: a 50-megapixel photograph
   is several hundred megabytes once decoded into a canvas, and the tab dies
   before any of the encoder runs.

A decode follows. It is a second gate — a file can carry an image mime type and
still not decode — and it is where the intrinsic dimensions come from. The
generated markup needs `width`/`height`; without them the feed shifts as
thumbnails load.

**The upload is then re-encoded to fit the budget rather than rejected for
exceeding it** (August 23, 2026). See the next section.

`EXT_BY_TYPE` no longer gates what may be uploaded — anything the browser can
decode is re-encoded into one of its three formats. It now names the *output*
extension. Deriving that from `file.name` would take it from a user-controlled
string: a file called `art.jpg` that is really a PNG would download as `.jpg`
and the generated markup would point at a file the deploy does not contain.

### Compression

Uploads are resized to a 1000px long edge and re-encoded until they fit
`TARGET_BYTES` (60 KB), entirely in the browser, in a canvas, with no library
and nothing uploaded anywhere.

**Calibrated against the four thumbnails already on disk**, which run 46-83 KB
at 600x750 and 800x1000 — about 0.8 bits per pixel. `OUTPUT_MAX_EDGE` of 1000
is the long edge of the largest shipped thumbnail, and is already far more
pixels than a catalog card can show at roughly 240 CSS px wide.

**Be precise about what this promises.** Re-encoding a photograph to a byte
budget is lossy by construction — that is what takes a multi-megabyte PNG to
tens of kilobytes. What it preserves is the appearance at the size the
thumbnail is displayed, where the source carries three to four times the pixels
the card can use. Measured against a lossless downscale of the same source: 45.3
dB PSNR at the encoded 800x1000, 49.4 dB at the rendered 240x300. Above 40 dB is
the conventional visually-indistinguishable threshold.

Four decisions inside it:

- **Downscaling happens in halving steps, not one jump.** Every browser's
  one-shot `drawImage` undersamples heavily on a large reduction — a 3000px
  photograph drawn straight to 800px samples a fraction of the pixels it skips,
  which reads as aliasing on fine detail such as fabric weave or text on a
  mockup. Halving repeatedly averages the pixels being discarded.
- **WebP is preferred wherever the browser can write it.** At equal perceived
  quality it is reliably a quarter to a third smaller than JPEG, which is the
  whole reason 60 KB is reachable at these dimensions. Support is detected by
  encoding a 1x1 canvas and checking the returned blob's type — a browser that
  cannot encode WebP silently returns PNG rather than failing, so the type is
  the only honest test.
- **Transparency decides the format list.** JPEG cannot carry an alpha channel,
  and flattening a transparent thumbnail into it paints the transparent region
  solid black. Every pixel is scanned rather than sampled, because a sampled
  scan misses a one-pixel transparent border — exactly the case that would come
  back as a black outline in the card.
- **Quality is searched, not fixed.** A six-probe binary search finds the
  highest quality that fits, landing within about one part in seventy of the
  true threshold — finer than the encoder's own granularity, at half the
  encodes a linear walk would need. Resolution is given up only when quality
  alone cannot reach the budget, because at the size a card renders, lost
  pixels are the more visible of the two losses. There is a floor
  (`MIN_QUALITY` 0.45): shipping a visibly broken thumbnail to hit a byte count
  is the wrong trade.

**An image that already fits is kept byte for byte** and never re-encoded —
under the budget, within the max edge, and already in an output format. That is
the one genuinely lossless path, and it is why re-saving an existing catalog
thumbnail does not degrade it a generation at a time.

The operator is told what happened in every case: "Compressed 16.2 MB to 60 KB
WEBP, 800x1000 (resized from 2400x3000)", or "Kept as uploaded: 5 KB, 600x750.
Already within budget, so it was not re-encoded."

**The output format is the encoder's choice, which means a re-export can orphan
a file.** A card whose thumbnail is on disk as `.jpg` gets a `.webp` written
beside it, not over it, and the stale file keeps deploying while nothing
references it. Nothing in a browser can see the repository to check, so the
download status says so every time rather than guessing.

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
5. **Publish** (see the next section): the images are written into the right
   folder and `index.html` is edited in place. Steps 6 to 8 are then done.
6. Or, without a connected folder: Download, and put the files in the folder
   the row names; they are already named to the convention.
7. Or: Copy Markup and paste it into `index.html`, updating the
   `catalog-empty` count if the card is new.
8. Review with `git diff`, then commit and push to `main`, or drag the `site`
   folder into Netlify.

Deploying stays manual in every path. No page can push to a repository or
trigger a deploy on the operator's behalf, and nothing here tries to.

## Publishing Into the Working Copy (August 23, 2026)

`js/admin-fs.js` wraps the File System Access API so Publish writes the
generated files straight into the project instead of routing them through the
downloads folder and the clipboard. This removes the two manual steps where a
mistake was silent: putting the file in the wrong folder, and pasting the
markup over the wrong block.

**Why this could not have been done sooner, and why the manual path stays.** A
page cannot reach the file system on its own. That is a browser security rule,
not a gap in this project — any site you visit could otherwise rewrite your
files. This API is the sanctioned exception: the operator picks a folder once,
in a native dialog this code cannot script, and the grant covers that folder
and nothing else. It is **Chromium only**. Firefox and Safari ship no
`showDirectoryPicker`, so `supported()` is false there, the Publish controls
never appear, and Download plus Copy Markup remain the entire workflow.

### The guards, in the order they run

1. **The folder must look like the publish directory** — an `index.html` and an
   `assets/` directory. Without this the operator can point the panel at their
   home folder or the repository root by mistake and the first publish scatters
   files into it, which looks like a bug in this code and is not.
2. **Three ordered steps, not two: write the images, rewrite the markup, then
   delete the superseded files.** A run that dies after writing an image leaves
   a file nothing references, which is inert; the reverse would leave
   `index.html` pointing at a file that was never written. **The delete was in
   the first phase until August 24, 2026, and that broke a live card** — a
   correct, safety-motivated refusal of the markup edit left the page
   referencing files that had just been removed. Anything destructive belongs
   after the markup that stops referencing it is safely on disk. Full
   write-up: `docs/error-fixes/PUBLISH_DELETED_THUMBNAILS_BEFORE_REWRITING_MARKUP.md`.
3. **The card is located unambiguously or not at all.** `data-doc` where the
   card has one, otherwise the title — the same identity rule the picker and
   the drift test use. Two matches is a refusal, not a guess.
4. **The result is verified before anything is written.** See below.

### Why it is a byte splice and not a parse-and-reserialize

Running `index.html` through `DOMParser` and writing `documentElement.outerHTML`
back would normalize whitespace, entities and void tags across the whole file,
turning a two-line change into an unreviewable diff and quietly rewriting markup
nobody asked to touch. Instead the exact byte range of one element is located
and replaced, leaving every other byte identical. Measured on the real file:
replacing a card's preview changed **12 lines out of a 47 KB file, and nothing
else**.

`DOMParser` is still used — afterwards, to check the result.

Three details that make the splice safe:

- **Comment bodies are blanked to spaces of equal length before any scanning**,
  so offsets stay valid in the original while a commented-out card or a stray
  `</div>` inside a comment cannot steer the splice. `index.html` carries
  several explanatory comments between cards, including one describing this
  very markup. Verified: a commented-out copy of a card is ignored and the real
  card is patched.
- **Div matching is a balanced scan, not a lazy match to the first `</div>`.**
  A card preview contains nested divs; a non-greedy match would close three
  levels early and leave orphan tags.
- **The replaced range is extended backwards over its own indentation**, so the
  replacement supplies its own leading whitespace and cannot land
  double-indented or flush-left.

### Verification before writing

`verifyPatch` rejects the result, leaving `index.html` untouched, unless all of
the following hold: the file did not lose a quarter of its length; the markup
parses; the card count is what was expected; **every other card's category,
link, variant and title are unchanged**; and the new image paths actually
appear in the output.

### Tested against the real file

Driven through the real code path in a browser, with the native picker stubbed
to return an origin-private directory handle — so permission handling,
IndexedDB persistence, the folder-shape check, writes and deletes all executed
for real, against a genuine copy of `index.html`.

| Case | Result |
|---|---|
| Replace an existing card's preview | 12 lines removed, 4 added, at line 566. Nothing else moved |
| Add a card not on the page | Appended inside `.catalog-grid`, count corrected 18 to 19, parses |
| Stale `.jpg` beside a new `.webp` | Removed, named in the status line |
| Two cards with the same identity | Refused. File unchanged |
| Card with an unbalanced preview block | Refused. File unchanged |
| Card with no `.card-preview` at all | Refused. File unchanged |
| Commented-out copy of a card | Ignored; the real card patched, comment intact |
| Preview block closed early, swallowing four cards | `verifyPatch` fired: "card count became 14, expected 18". File unchanged |
| Publish All across three items | 4 files, 2 replaced, 1 inserted, 19 cards, parses |
| A folder that is not the site directory | Refused at connect |
| Publish refused after the images were written | `index.html` byte-identical, and the superseded files it still references **survive** (August 24, 2026 regression test) |
| Publish succeeded | Superseded files removed, and every path the page references confirmed present on disk |

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

- **`CATALOG_ITEMS` can drift from `index.html` — now guarded, see below.** A
  card added to the homepage without a matching entry here is reachable only
  through the new-item path, which then generates a whole `<article>` rather
  than the preview block the card actually needs. Both halves keep working
  perfectly on their own, so nothing fails at runtime; it is the same defect
  class as `EXPORTED_POST_PAGE_FOOTER_DRIFT.md`. The drift itself is still
  possible — the two lists are still maintained by hand — but it can no longer
  ship unnoticed.
- **Category, title and variant of an item saved through the new-item path are
  not editable afterwards.** Only the folder and the images are. Delete and
  re-add to change them.
- **Nothing crops.** The encoder resizes and compresses but never crops, and
  since August 23, 2026 neither does the card -- see Thumbnails Are Never
  Cropped below. An off-ratio upload is shown whole against the card ground.
- **Compression is lossy on anything that does not already fit.** See the
  Compression section for what that does and does not cost. Compressing an image
  yourself before uploading is counterproductive: it is then compressed twice,
  which is what actually produces visible artefacts. Upload the largest clean
  copy available.
- **New thumbnails are WebP, while the two already on disk are JPEG.** Both work
  in every browser the site supports (WebP since Safari 14, 2020), and the
  markup carries whichever extension the file actually has, so the mix is
  harmless — but a re-export leaves the old-format file behind as an orphan.
- **The workspace can fill localStorage.** Eighteen cards with both images is
  roughly 2.9 MB once base64-encoded, against a typical 5 MB origin quota shared
  with the blog workspace. The save path reads back what it wrote and warns
  rather than losing an upload silently, but the real remedy is deleting items
  once they are exported.
- **The markup step is manual on Firefox and Safari.** Publish removes it on
  Chromium; elsewhere Copy Markup is still the route. Automating it further
  would mean building the catalog registry that was deliberately not built.
- **Publishing replaces a card's whole preview.** No card has a bespoke hover
  effect any more, so nothing is currently at risk -- but a future card that
  grows one would lose it to a publish, silently. See the section below for
  the shape that problem took the first time.

## The Wood-Frame Hover Composite, and Its Removal (August 23, 2026)

The three poster cards once ran a bespoke hover effect instead of the
blank/hover image swap. `.card-preview.framed` composited three layers: at rest
a CSS-drawn poster, and on hover the drawn border and caption dropped away
while the plate was repositioned into the print window of a photographed
leaning wood frame that faded in over it, reusing the `wood-a4` base and
shadow overlay the mockup editor ships.

Publishing a thumbnail over such a card replaced the whole block and took the
composite with it. That was briefly solved rather than accepted: because the
hover rule positions *one box* into the frame window, an `<img>` served as well
as a `<div>`, so a framed card could carry a real poster image that showed
whole at rest and slid into the frame on hover, and `CATALOG_ITEMS` carried a
`framed: true` flag so the generator, the preview and the publish routine all
respected it.

**All of that was removed the same day at the owner's request.** The three cards
are ordinary photo cards now: `Framed Photo Poster` is `card-preview photo`
with a real thumbnail, the other two keep their drawn miniature under a plain
`card-preview`. Deleted with it: both `@media (hover: hover)` blocks keyed to
`.card-preview.framed` in `css/style.css` (about 5.6 KB), the `framed` flags and
every branch reading them in `js/admin.js`, the `is-unavailable` field styling,
and the disabled-hover-upload behaviour. The hover input accepts a second
thumbnail on these cards again, and the generator emits the standard two-image
block.

**`assets/mockups/wood-a4-base.png` and `wood-a4-overlay.png` stay.** They are
the mockup editor's own template assets, registered in `js/mockup-templates.js`
and used by `mockup.html`. Only the homepage's use of them as a hover
background is gone.

Two things worth keeping from the removed work, should anything like it return.
The window geometry was duplicated between the `.mock-doc.poster` and
`.card-thumb` hover rules rather than shared, because the drawn miniature needs
border, padding and gap reset and ignores `object-fit` while an image needs the
opposite. And `object-fit` was deliberately `contain` at rest but `cover` inside
the frame: a finished poster carries content to its edges, and `cover` in the
4:5 window clips a 707x1000 design by about 11.5% of its height. **That argument
survived the removal**: rather than special-case the one card, the shared
`.card-preview.photo .card-thumb` rule moved to `contain` -- see below.

## Thumbnails Are Never Cropped (August 23, 2026)

`.card-preview.photo .card-thumb` uses `object-fit: contain`, not `cover`.

A catalog thumbnail depicts a finished design, and a design carries content to
its edges: a printed border, a caption near the foot. `cover` fills the tile by
cropping whatever does not fit the 4:5 window, which takes exactly those edges.
Measured on the live poster thumbnail, a 707x1000 design lost **11.5% of its
height**. Letterboxing instead leaves a little of the card's own ground either
side, which reads as a mat.

**This is deliberately the shared rule, not a class on the one card that needed
it.** A bespoke class would be dropped the next time that card was published
from `admin.html`, whose generator emits a fixed `card-preview photo` block --
the same silent loss the removed `framed` machinery existed to prevent. The
shared rule is the only version that survives a republish.

**It changes nothing already on disk.** Every shipped thumbnail is exactly 4:5
(800x1000 and 600x750), where the two keywords are identical. Measured after
the change: all four mockup thumbnails still draw the full 285x356 box, and the
707x1000 poster draws 252x356 with 33px of ground split either side and zero
vertical crop. The rule only decides what happens to an off-ratio upload, and
showing the whole design is the right answer for a catalog.

The mat colour is the card's own background token, so it follows the theme
(white in light, `rgb(29, 28, 23)` in dark) rather than showing as a grey band.

## The Drift Guard (August 23, 2026)

Six checks in section 1 of `tests/verify-layout.js` (`1j`) read `js/admin.js`
and `index.html` off disk and assert the two agree. They cost nothing to run —
`--quick` still finishes in under a second — and they turn the accepted
limitation above from silent into loud.

| Check | Catches |
|---|---|
| `js/admin.js` declares `CATALOG_ITEMS` and `CATEGORIES` | A rename or restructure that would make every check below vacuously pass |
| The picker lists every homepage card | A card added to `index.html` alone, or removed from `CATALOG_ITEMS` alone |
| The picker lists no card `index.html` does not have | A card deleted from the homepage, or an id typo |
| Each entry matches its card's title, category and variant | A card renamed, recategorized or given a different `data-doc` on one side |
| Each `CATEGORIES` record matches the cards it describes | A label, editor page or `data-target` that would be written wrong into every generated card of that category |
| The catalog-empty message states the real card count | The "all 17" against eighteen cards this panel's own work uncovered |

The id rule mirrors `js/admin.js`: `data-doc` where a card carries one,
otherwise the title slugified. Titles are compared literally, so an entity in
the markup that is a bare character in the JavaScript reads as drift —
correctly, since the generated markup would then differ from the card it
replaces.

**Mutation tested, ten breaks, all ten caught**, per the project rule that an
assertion which has never failed is not evidence: removing a card from
`CATALOG_ITEMS`; adding one that does not exist on the homepage; renaming,
recategorizing and re-`data-doc`-ing a card in `index.html` only; adding a whole
new card to `index.html` only; changing a `CATEGORIES` label; pointing a
`CATEGORIES` record at the wrong editor; falsifying the card count; and renaming
the `CATALOG_ITEMS` constant. Every one of the six checks fired on at least one
mutation. The harness itself found a real trap worth recording: the project's
files are CRLF, and three mutations silently matched nothing until the line
endings were handled — a mutation that does not apply looks exactly like a check
that passed.
