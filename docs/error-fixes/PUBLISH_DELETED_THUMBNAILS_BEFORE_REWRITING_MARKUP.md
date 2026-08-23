# Publish Deleted the Old Thumbnails Before Rewriting index.html

Date: August 24, 2026

## Issue Title

Homepage catalog card rendered a broken-image icon after publishing a thumbnail
from `admin.html`. `index.html` referenced `wood-a4-thumb-blank.jpg` and
`wood-a4-thumb.jpg`; neither file existed. The replacement `.webp` files were on
disk, referenced by nothing.

## Symptom

The "Leaning Wood Frame Poster Mockup" card showed the browser's broken-image
placeholder in place of its preview. Every other card was fine. Nothing failed
in the console beyond the two 404s, and `node tests/verify-layout.js` passed:
988 checks, none of which asked whether a referenced file exists.

## Evidence

| Artifact | State |
|---|---|
| `assets/.../posters-frames-canvas-billboards/` | `wood-a4-thumb-blank.webp`, `wood-a4-thumb.webp`, both written 00:12 |
| The same folder | `wood-a4-thumb-blank.jpg`, `wood-a4-thumb.jpg` — **gone** |
| `site/index.html` | Still referencing both `.jpg` names |
| `site/index.html` mtime | 23:17, **55 minutes before** the images were written |

The mtime is what makes the sequence unambiguous: `publishRecord` reached the
point of writing images and deleting their predecessors, and never reached the
point of writing `index.html`.

## Root Cause

`publishRecord` in `js/admin.js` ran in this order:

1. Write the new image files.
2. **Delete the superseded files** (`removeStaleSiblings`).
3. Read `index.html`, patch it, verify the patch.
4. Write `index.html`.

Steps 3 and 4 can both fail by design — the patcher refuses an ambiguous or
unrecognised card, and `verifyPatch` rejects any result that would damage the
page. Those refusals are correct and deliberately leave `index.html` untouched.

**But step 2 had already removed the files `index.html` still pointed at.** So a
correct, safety-motivated refusal produced a broken homepage.

The code carried an explicit comment claiming the ordering was safe:

> Images are written FIRST, the markup edit LAST. A run that dies halfway then
> leaves an unreferenced image file, which is inert.

That reasoning was right about the *writes* and silently wrong about the
*delete*, which had been placed in the same early phase. Written-then-
unreferenced is inert. Referenced-then-deleted is a visible defect. Only the
first of the two was actually being ordered for.

The specific failure that triggered step 3 or 4 on the day was not reproducible
afterwards: the patcher and its verification both succeed against the exact
`index.html` involved, replayed through the real code path. The ordering flaw is
independent of which failure exposed it — any refusal, permission drop or write
error in steps 3 to 4 produces the same broken page.

## Fix Applied

**`site/js/admin.js`, `publishRecord`** — the delete moved to last, after
`index.html` has been successfully written:

1. Write the new image files.
2. Read, patch and verify `index.html`.
3. Write `index.html`.
4. **Then** delete the superseded files.

Once step 3 lands, the markup no longer references the old files, so removing
them cannot break anything. If any step before it fails, the old files are still
present and the card keeps rendering its previous thumbnail.

The failure message was also corrected. It said "The image files were written;
paste the markup by hand", which was true and incomplete; it now states that
nothing references them yet and that the card still shows its previous
thumbnail.

**`site/index.html`** — repaired to reference the `.webp` files that exist, with
`width`/`height` corrected to their real `1000x1000` (the uploaded source was
square, not the 4:5 the previous `.jpg` pair had been).

**`tests/verify-layout.js`, check 1k** — every local `<img src>` in every page
must exist on disk. This is what should have caught the breakage the moment it
happened. It is deliberately broader than this one bug: it also catches a
thumbnail downloaded but never placed, a typo in a hand-pasted path, and a file
renamed without its reference. Absolute, protocol-relative and `data:` sources
are skipped, since they are not this repository's to vouch for.

## Testing Steps

Driven through the real code path in a browser, with the native directory picker
stubbed to return an origin-private directory handle holding a copy of the real
`index.html`:

1. **Failed publish leaves the page working.** Seed the folder with
   `wood-a4-thumb-blank.jpg` and `wood-a4-thumb.jpg`, duplicate the wood-a4 card
   so the patcher refuses, then publish. Result: status reports the refusal,
   `index.html` byte-identical, **both `.jpg` files still present**. Under the
   previous ordering both were deleted.
2. **Successful publish still cleans up.** Same folder, single card, publish.
   Result: "Removed 2 superseded file(s): wood-a4-thumb-blank.jpg,
   wood-a4-thumb.jpg", `index.html` referencing the new files, and every
   referenced file confirmed present on disk.
3. **The new static check catches the real breakage.** Restoring `index.html` to
   the exact broken state (`.jpg` references, no `.jpg` files) fails check 1k
   with `missing file(s)`; restoring the repair passes. Mutation-tested rather
   than assumed.
4. `node tests/verify-layout.js`: 988 passed, 0 failed.
5. All five catalog thumbnails confirmed loading in the browser, with declared
   `width`/`height` matching each file's intrinsic dimensions.

## Troubleshooting

If a card shows a broken image again:

- Run `node tests/verify-layout.js --quick`. Check 1k names the missing file and
  the page referencing it.
- Compare `git status` in `site/assets/thumbnails/` against the `src` in
  `index.html`. The two must agree on both name and extension — the encoder
  chooses the output format, so a re-publish can change `.jpg` to `.webp`.
- The publish status line reports what it removed. If it reports a removal but
  the page still references the removed name, the markup write did not land.

## Related Files

- `site/js/admin.js` — `publishRecord`, and the ordering comment above it
- `site/index.html` — the repaired wood-a4 card
- `tests/verify-layout.js` — check 1k
- `docs/implementation/CATALOG_THUMBNAIL_ADMIN.md` — the publish workflow
