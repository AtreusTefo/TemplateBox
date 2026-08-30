# Mockup Asset Folder Structure

Date: August 29, 2026
Status: Implemented

## Summary

`site/assets/mockups/` and `site/assets/thumbnails/product-mockups/` were flat.
Sixteen map files and seven thumbnails sat in two directories with no grouping,
and the only thing separating a cap from a t-shirt was the filename prefix. At
three templates that is merely untidy; at the hundred the catalog is planned for
it is unnavigable, because a single fabric template contributes seven files
(`base`, `displace`, `shade`, `light`, `tone`, `grain`, `garment`) plus two
thumbnails. Both trees now carry the same nested product taxonomy, and the
factory writes the operator's chosen category into both.

Nothing about rendering changed. This is a path move plus the four places that
name a path.

## The taxonomy

One tree, mirrored in both roots:

```
apparel/
  t-shirts/
  hoodies/
  tote-bags/
  hats/
    baseball-caps/
    beanies/
    bucket-hats/
drinkware/
  mugs/
  bottles/
packaging/
  boxes/
  bags/
print/
  posters-and-frames/
  business-cards/
  stickers/
tech/
  phone-cases/
```

The same relative path is used under both roots, so a template's maps and its
thumbnail are always at the same coordinates in their respective trees:

| Template | Maps | Thumbnail |
| --- | --- | --- |
| `tshirt-model-white` | `site/assets/mockups/apparel/t-shirts/` | `site/assets/thumbnails/product-mockups/apparel/t-shirts/` |
| `cap-model-white` | `site/assets/mockups/apparel/hats/baseball-caps/` | `site/assets/thumbnails/product-mockups/apparel/hats/baseball-caps/` |
| `wood-a4` | `site/assets/mockups/print/posters-and-frames/` | `site/assets/thumbnails/product-mockups/print/posters-and-frames/` |

`posters-frames-canvas-billboards`, the one pre-existing thumbnail category
folder, became `print/posters-and-frames`. It was the only name in either tree
that tried to enumerate its own contents rather than name a category, and the
enumeration was already wrong: it held one leaning wood frame and no canvas or
billboard.

## Naming rules

- **Lowercase, hyphenated, no spaces.** This is the existing site-wide rule for
  anything under `site/` and it is not new here. It is also not cosmetic: the
  original wood-a4 assets arrived in folders containing spaces and commas and
  had to be renamed before they could be referenced, and the baseball cap
  arrived under `Hat Mockups/baseball cap mockups/` and needed the same
  treatment.
- **Segments do not contain the word "mockup".** The tree is already rooted at
  `assets/mockups/`, so `apparel/hats/baseball-caps`, not
  `apparel-mockups/hats-mockups/baseball-cap-mockups`. This is the one place the
  implemented structure departs from the shape originally sketched for it; the
  departure is the URL-safety rule plus the redundancy.
- **Category depth is not fixed.** `drinkware/mugs` is two levels,
  `apparel/hats/baseball-caps` is three. Nothing parses these strings, so depth
  is a readability decision per product family, not a schema.

## What the category does and does not do

It is a filesystem-organisation device only. Nothing at runtime reads it:

- The registry entries in `site/js/mockup-templates.js` hold complete literal
  paths. The engine loads what the string says.
- Catalog filtering is driven by the card's `data-category` attribute in
  `site/index.html` (`mockups`, `documents`, `resumes`, `canvas`), which is a
  separate and much coarser vocabulary. A card for a baseball cap is
  `data-category="mockups"` regardless of where its files live.

The value it does carry is future: when the collection outgrows the repository
and base/overlay files move to object storage (see the scale note in
`site/js/mockup-templates.js`), a prefixed tree makes that a prefix swap rather
than a sort.

## Code changes

Four locations name these paths, and all four were updated.

1. **`site/js/mockup-templates.js`** - all 23 literal paths across the three
   photo templates, plus the "Asset conventions" doc block, which now documents
   `<category>` for both trees and states that empty category folders are not in
   git.
2. **`site/tools/mockup-admin.html`** - the factory. Previously the category
   field was labelled "Thumbnail category folder" and was applied to the
   thumbnail path alone; the map paths were emitted flat as
   `assets/mockups/<id>-base.png`. It now writes the same category into all
   eight emitted paths. The field is relabelled, carries the nested form as its
   placeholder, and has a hint listing the taxonomy. The checklist gained a step
   for creating the folder.
3. **`site/js/admin.js`** - the three `folder:` overrides in `CATALOG_ITEMS`.
   These are the thumbnail admin's per-item defaults, so that re-exporting an
   existing card regenerates its current path instead of moving the file.
4. **`site/index.html`** - the six `card-thumb` `src` attributes on the three
   photo mockup cards.

### slugPath

The factory's `slug()` replaces every character outside `[a-z0-9-]` with a
hyphen, which is correct for an id and wrong for a path: it would flatten
`apparel/hats/baseball-caps` into `apparel-hats-baseball-caps` and silently emit
a filename where a folder was meant. `slugPath()` splits on a forward or back
slash, slugs each segment, drops empty segments and rejoins:

| Input | Output |
| --- | --- |
| `apparel` | `apparel` |
| `apparel/hats/baseball-caps` | `apparel/hats/baseball-caps` |
| `Drinkware/Mugs` | `drinkware/mugs` |
| `/print//posters-and-frames/` | `print/posters-and-frames` |
| a Windows path with spaces and mixed case | each segment slugged, separators kept |
| (blank) | the fallback, `apparel` |

Backslashes are accepted because the operator is on Windows and will paste one.
Empty segments are dropped because a stray leading, trailing or doubled
separator would otherwise emit a doubled slash in the path, which an HTTP server
resolves and a filesystem does not - the failure would appear only after deploy.

## Empty folders are not in git

Git tracks files, not directories. The category folders created here that hold
no assets yet - `apparel/hoodies`, `drinkware/mugs`, `packaging/boxes` and the
rest - exist in the working tree and will not survive a clone. This is
deliberate rather than papered over with `.gitkeep` files: `site/` is the
Netlify publish directory and is served verbatim, so every placeholder file
inside it becomes a public URL for no benefit (see
`docs/error-fixes/INTERNAL_FILES_PUBLICLY_SERVED.md`).

The taxonomy therefore lives in three places that are all tracked: this
document, the doc block in `site/js/mockup-templates.js`, and the hint and
checklist in `site/tools/mockup-admin.html`. Creating a category folder is a
step in adding the first template that needs it.

## Verification

- 33 path references extracted from the three referencing source files and
  resolved against the filesystem: all resolve. The two that do not name files
  on disk, `assets/thumbnails/documents` and `assets/thumbnails/resumes`, are
  pre-existing `CATEGORIES` defaults for categories that have no saved
  thumbnails yet, and are unrelated to this change.
- All 23 referenced asset URLs fetched over HTTP from `npx serve` at their new
  paths: 23 of 23 returned 200.
- Orphan check: every file under `site/assets/mockups/` is referenced by a
  registry entry. Nothing was left behind by the move.
- `slugPath` exercised against the cases in the table above, run against the
  function as it exists in the shipped file rather than a copy.
- `node tests/verify-layout.js`: 1168 passed, 0 failed. Section 2f (catalog
  thumbnails fill their card) and section 4 (ads-blocked layout compared against
  `git archive HEAD`) both load the moved thumbnails.

## Related

- `docs/implementation/PHOTO_MOCKUP_TEMPLATES_IMPLEMENTATION.md` - the Sandwich
  Method and the registry the paths live in.
- `docs/implementation/FABRIC_DISPLACEMENT_APPAREL_MOCKUPS.md` - what the seven
  fabric maps are and how the factory derives them.
- `docs/implementation/CATALOG_THUMBNAIL_ADMIN.md` - the thumbnail admin whose
  `folder:` overrides were updated.
- `docs/error-fixes/INTERNAL_FILES_PUBLICLY_SERVED.md` - why nothing that is not
  a served asset goes under `site/`.
