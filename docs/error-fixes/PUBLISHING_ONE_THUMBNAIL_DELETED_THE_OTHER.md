# Publishing One Thumbnail Deleted the Card's Other One

Date: August 24, 2026

## Issue Title

Uploading a replacement default thumbnail through `admin.html` and publishing
it stripped the card's hover thumbnail from `index.html` and deleted the file
from disk. No warning, no way to tell it was about to happen.

## Symptom

Reported as the flow "not working" and "failing to produce the final outcome
wanted". The publish reported success, the new thumbnail did appear, and the
card's hover state was gone.

On the mockup cards this is the whole design: `card-thumb-blank` is the bare
product and `card-thumb-hover` is the styled demo that crossfades in. Losing
the second image removes the effect the card exists for.

## Root Cause

**The workspace was write-only.** It knew what had been uploaded into it and
nothing at all about what the card already had.

Selecting a card that ships two thumbnails presented an empty form. Uploading
one image therefore produced a record with `hoverImage: null`, and every
downstream step honoured that faithfully:

- `previewMarkup` emitted a single-image `.card-preview` block.
- The patcher replaced the card's whole preview with it, dropping the hover
  `<img>`.
- `removeStaleSiblings` then deleted every `<id>-thumb.*` file, because the
  record named no hover file to keep.

Each step was individually correct. The defect was that the record described
an intention the operator never expressed: nothing in the panel had ever read
the card's existing state, so "I did not upload a hover image" and "this card
should have no hover image" were indistinguishable.

This is the same class as the August 24 deletion-ordering bug in
`PUBLISH_DELETED_THUMBNAILS_BEFORE_REWRITING_MARKUP.md`, and it survived that
fix untouched: ordering the delete correctly stops a *failed* publish breaking
the page, but this destruction happened on a fully *successful* one.

## Fix Applied

**Hydration (`hydrateFromProject` in `site/js/admin.js`).** When a project
folder is connected and the operator selects a card with no saved workspace
record, the panel now reads `index.html`, locates that card with the same
locator the patcher uses, pulls the `<img>` sources out of its preview block,
loads those files off disk, and populates the form with them. The preview then
shows what the site actually has, and the destination folder is taken from the
real `src` path so a re-publish writes where the files already live.

With the existing hover shot in the record, replacing only the default keeps
it: the generated markup carries both images and the cleanup keeps the file.

A stale-token guard discards a slow read whose card is no longer selected.

**Explicit-removal flag (`hoverCleared`).** Hydration only runs with a folder
connected, and a workspace saved before this change still holds
`hoverImage: null`. So publishing now refuses when the live card has a hover
thumbnail, the record has none, and the operator never pressed Remove Hover
Image. The flag is set only by that button and cleared by uploading a
replacement, which is what separates a deliberate removal from an absent read.

**`readFile` in `site/js/admin-fs.js`** returns a file as a `File`, or null
when it is not there, since "does the project already have this?" is an
ordinary question with an ordinary negative answer.

## Testing Steps

Driven through the real code path in a browser against a project folder holding
the real `index.html` and the real shipped thumbnails. The directory handle was
wrapped so it carries `queryPermission`/`requestPermission` like one from the
native picker, which earlier tests never exercised.

1. **Hydration.** Select `White T-Shirt on Model Mockup` with nothing saved.
   Both thumbnails load ("Already on the site: 46 KB, 600x750"), both preview
   slots fill, both Remove buttons appear, and the folder resolves to
   `assets/thumbnails/product-mockups/apparel`.
2. **Replace only the default.** Upload a new blank image, publish. Result:
   markup carries `blank -> ...-thumb-blank.png` **and**
   `hover -> ...-thumb.jpg`; only the superseded default is removed; every
   referenced file confirmed present. Before the fix this left one image and
   deleted the hover file.
3. **Deliberate removal.** Re-select to hydrate, press Remove Hover Image,
   publish. Result: hover `<img>` gone from the markup and
   `...-thumb.jpg` removed from disk. Removal still works when asked for.
4. **The guard.** Force a record to `hoverImage: null, hoverCleared: false`,
   the shape a pre-fix save leaves. Publish is refused by name, and both the
   markup and the files are untouched.
5. `node tests/verify-layout.js`: 988 passed, 0 failed.

## Troubleshooting

- **The form is empty for a card that has thumbnails.** Hydration needs a
  connected folder; without one the panel cannot see the project. Connect, then
  re-select the card.
- **A saved workspace record wins over hydration**, deliberately, so unsaved
  work is never overwritten by a background read. Delete the row to hydrate
  fresh.
- **Publish refuses over a hover thumbnail.** That is the guard. Re-select the
  card to load what is there, or press Remove Hover Image to drop it.

## Related Files

- `site/js/admin.js` - `hydrateFromProject`, `currentThumbsOf`, `hoverCleared`,
  the guard in `publishRecord`
- `site/js/admin-fs.js` - `readFile`
- `docs/error-fixes/PUBLISH_DELETED_THUMBNAILS_BEFORE_REWRITING_MARKUP.md`
- `docs/implementation/CATALOG_THUMBNAIL_ADMIN.md`
