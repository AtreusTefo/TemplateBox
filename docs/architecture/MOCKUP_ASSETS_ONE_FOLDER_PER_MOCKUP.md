# Mockup Assets: One Folder Per Mockup

Date: September 3, 2026
Status: Implemented

## Summary

Mockup assets moved from a flat folder per category to **one folder per
mockup**, named for the template id. 105 files, 13 templates.

```
before   assets/mockups/apparel/t-shirts/tshirt-model-white-base.png
after    assets/mockups/apparel/t-shirts/tshirt-model-white/tshirt-model-white-base.png
```

The same shape applies to thumbnails:

```
before   assets/thumbnails/product-mockups/apparel/t-shirts/tshirt-model-white-thumb.jpg
after    assets/thumbnails/product-mockups/apparel/t-shirts/tshirt-model-white/tshirt-model-white-thumb.jpg
```

Nothing was broken before this change. It buys structure, and it closes one
real hazard.

## Why: ids nest, so prefixes are not safe

The `apparel/t-shirts` folder held 21 files for three templates, and sorted
like this:

```
tshirt-model-white-back-base.png      <- a different template
tshirt-model-white-base.png
```

**`tshirt-model-white` is a prefix of `tshirt-model-white-back`.** In a flat
folder, any prefix-based operation on the shorter id -- delete it, move it,
glob it, clean up after it -- silently catches the longer one's files.

That is not hypothetical. `js/admin.js` already carries a defensive comment
about the identical shape one level down:

> Exact-name matching, never a prefix test: `<id>-thumb` is a prefix of
> `<id>-thumb-blank`, so a startsWith check here would delete the default
> thumbnail while cleaning up after the hover one.

A folder boundary removes the whole class rather than defending against it
case by case.

The secondary reasons are ordinary: the seven maps of a template are only ever
loaded together, so they belong together; retiring a template becomes deleting
a directory rather than finding seven files by prefix among twenty; and at ten
templates in one category a flat folder holds seventy files.

## Why the file names still carry the id

`tshirt-model-white/tshirt-model-white-base.png` repeats the id, and that was
the deliberate choice over the tidier `tshirt-model-white/base.png`.

The id in the file name is what lets an asset identify itself **where its
folder is not visible**:

- a devtools network waterfall, whose Name column shows the last path segment
- a downloads folder, when someone pulls one asset out
- the flat object-storage bucket the registry's scale note anticipates

Thirteen files called `base.png` would be worse in all three. The redundancy
costs nothing but characters.

It also preserves the property the registry header already claimed: *"The admin
tool derives every filename from the id, so the id and the assets cannot
drift."* That survives the move because the tool now derives the folder from the
id as well.

## What changed

| File | Change |
| --- | --- |
| 105 asset files | `git mv` into `<category>/<id>/`, history preserved |
| `site/js/mockup-templates.js` | 91 paths, plus the Asset Conventions block |
| `site/index.html` | 26 thumbnail `<img src>` |
| `site/js/admin.js` | 13 `folder:` fields gain `/<id>` |
| `site/tools/mockup-admin.html` | 9 emitted paths, plus the checklist |
| `site/admin.html` | the hint naming the two files it writes |
| `CLAUDE.md`, `AGENTS.md` | the convention, and why the names repeat the id |
| `tests/verify-layout.js` | new check 1k3 |

The move plan was built **from the registry rather than by prefix matching** --
matching by prefix is precisely the hazard being removed, and it would have
mis-assigned `tshirt-model-white-back`'s seven files to `tshirt-model-white`.
Every declared path was moved, then the trees were re-walked to find files no
entry named.

That found two, both explained rather than assumed:

- `tshirt-model-white-thumb-blank.jpg` -- the registry names a `.webp` thumb
  while the shipping blank is `.jpg`, so deriving the blank's name from the
  thumb's extension missed it. It is referenced by `index.html` and moved with
  its template.
- `wood-a4-thumbnail-preview.webp` -- documented in two places as a
  deliberately unused source render. Kept, and moved into its template's
  folder.

## The convention is now enforced, not just documented

Checks 1k and 1k2 catch an asset path that points at nothing. Neither can catch
a path that **resolves but sits in the wrong place**, which is exactly what a
flat folder invites and what a new template pasted from an old example would
reintroduce.

New check **1k3** asserts both halves of the convention: every asset path in the
registry sits in a folder named for its template id, and every file name starts
with that id.

It was verified by breaking it, twice:

| Break | Message |
| --- | --- |
| Path put back in the flat category folder | `assets/mockups/apparel/t-shirts/tshirt-model-white-shade.png is not in a folder named tshirt-model-white` |
| Id stripped from a file name | `assets/mockups/apparel/hoodies/hoodie-hanger-white/tone.png does not carry its id in the file name` |

The check parses the registry by hand rather than by regex: the file is a flat
list of `key: "value",` lines, and a scanner that tracks the current id is
shorter and harder to get subtly wrong than a pattern.

## Adding a template after this

`site/tools/mockup-admin.html` emits the entry with the new paths and its
checklist names the new folders, so the normal route needs no extra thought.
By hand:

```
site/assets/mockups/<category>/<id>/<id>-base.png
site/assets/mockups/<category>/<id>/<id>-displace.png          (and the rest)
site/assets/thumbnails/product-mockups/<category>/<id>/<id>-thumb.jpg
site/assets/thumbnails/product-mockups/<category>/<id>/<id>-thumb-blank.jpg
```

Three places know this shape -- the registry, `tools/mockup-admin.html` and
`js/admin.js` -- so a change to it has to touch all three or they drift. Check
1k3 catches the registry half.

## Related files

- `site/js/mockup-templates.js` -- the Asset Conventions block in the header
- `tests/verify-layout.js` -- check 1k3
- `docs/implementation/MOCKUP_ASSET_FOLDER_STRUCTURE.md` -- the category
  taxonomy this nests inside
