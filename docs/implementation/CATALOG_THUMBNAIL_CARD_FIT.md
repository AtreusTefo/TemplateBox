# Catalog Thumbnails Fill Their Card

Date: August 24, 2026

## The Defect

The Leaning Wood Frame Poster Mockup card showed its thumbnail letterboxed:
about a fifth of the card was empty ground, and the mockup itself read small.

Measured on the live homepage at 1440px: the card window is 286x358, and the
painted image was 284x284 -- **73.6px of empty card**.

## Root Cause

Two facts that were fine separately.

- `.card-preview` is `aspect-ratio: 4 / 5` and
  `.card-preview.photo .card-thumb` is `object-fit: contain`, so an off-ratio
  file is shown whole and letterboxed rather than cropped.
- `wood-a4-thumb.webp` and `wood-a4-thumb-blank.webp` were **1000x1000**.

A square image in a 4:5 window fits by width and leaves 20% of the height
empty. The t-shirt pair is 600x750, exactly 4:5, which is why only this card
looked wrong.

`admin.html`'s intake let it happen and would have let it happen again: it
resized to a maximum edge and re-encoded to a byte budget, and never had an
opinion about shape.

## What Was Not Done

`contain` was **not** changed to `cover`. It was chosen deliberately on August
23, 2026, and its reasoning is sound: a catalog thumbnail depicts a finished
design, designs carry content to their edges, and `cover` would silently crop
exactly those edges on every future upload.

The fix is to make the **file** the card's shape. With a 4:5 file, `contain` and
`cover` are identical and the CSS stops deciding anything. That also keeps the
generated markup a fixed block, with no per-card class to be dropped the next
time the card is published -- the failure the stylesheet comment already warns
about.

### A comment that asserted something untrue

That same August 23 comment ended: *"It changes nothing on disk today: every
shipped thumbnail is exactly 4:5 (800x1000 and 600x750)."*

It was wrong when it was written. Two of the five shipped thumbnails were not
4:5, and one of them was visibly letterboxed on the most-visited page on the
site. The comment is corrected in place rather than quietly deleted, because
the lesson is the transferable part: a claim that a change is academic is worth
checking against the files.

## The Fix, Part One: the Intake

`fitToCard(img, mode)` in `js/admin.js`, applied before the scaler, with
`CARD_ASPECT = 4 / 5` named against the stylesheet rule it mirrors.

- **Fill** (default) centre-crops to the largest 4:5 window the source
  contains. Right for a photograph or a scene.
- **Fit** pads to 4:5. Right for a design that carries a printed border or a
  caption to its edges.

Either way the file written to disk is 4:5.

Three details that matter:

**The reshape happens before the scale.** Cropping after would leave a 1000px
source producing an 800px-tall thumbnail, because `OUTPUT_MAX_EDGE` caps the
long edge.

**The `alreadyFits` fast path now tests the ratio too.** An upload under the
budget and under the maximum edge is kept byte for byte, and shape was not part
of that test -- which is exactly how a small square file reached disk untouched.
Mutation-tested by removing the ratio term: a 500x500 in-budget WebP comes back
"Kept as uploaded, 500x500" instead of 400x500.

**Fit pads with transparency, not with a colour.** A baked light pad is a pale
band down each side of the card for every visitor on the dark theme,
permanently, because a file cannot answer a media query. Transparent padding
lets `.card-preview`'s own background show through, so the card looks the same
in both themes -- exactly as an unpadded letterboxed image does today. The cost
is the format: JPEG has no alpha, so a padded thumbnail encodes as WebP or PNG,
which `compress()` already handles because it drops JPEG whenever it detects
transparency.

An upload that is already 4:5 is returned untouched, so the common case costs no
re-draw.

### Sizes are not forced to 800x1000

A 1600x900 source under Fill comes out **720x900**, not 800x1000. The pipeline
does not upscale, and it should not: enlarging invents pixels, and at the ~240
CSS px a card renders, 720px is already three times what it can show. The
contract is the **ratio**, not an absolute size.

## The Fix, Part Two: the Files On Disk

Three files were off-ratio. Each was re-run through `admin.html`'s own intake --
the real pipeline, driven in a headless browser, not a reimplementation of it --
and the result written back:

| File | Before | Mode | After |
|------|--------|------|-------|
| `wood-a4-thumb-blank.webp` | 1000x1000, 59 KB | Fill | 800x1000, 56 KB |
| `wood-a4-thumb.webp` | 1000x1000, 60 KB | Fill | 800x1000, 60 KB |
| `framed-photo-poster-thumb-blank.webp` | 707x1000, 58 KB | Fit | 800x1000, 59 KB |

The wood frame pair is a photographed scene: the centre crop keeps the framed
poster whole and trims a basket on the right and part of a vase on the left,
which is what makes the mockup itself larger in the card.

The framed photo poster is a **design**, not a scene -- a black printed border
around a photo with a caption at the foot. Cropping it would take the border and
the caption, which is precisely what the `contain` decision exists to prevent,
so it was padded instead. It renders exactly as it did before; the difference is
that the file is now the card's shape, so it satisfies the same rule as
everything else instead of being an exception something has to remember.

`index.html`'s `width`/`height` attributes were updated to match. That is not
cosmetic: those attributes reserve the box before the image arrives, so a file
re-cropped without them trades a visible gap for a layout shift -- quieter, and
worse.

The 1.4 MB `wood-a4-thumbnail-preview.webp` source render was left alone; it is
deliberately unused.

## Verification

**Section 2f** measures every photo thumbnail's painted image against the card
it sits in, and asserts the declared `width`/`height` match the file.

The first version of that check measured `img.getBoundingClientRect()` and was
worthless: the element is `width: 100%; height: 100%`, so its box always equals
the card whatever the image inside it is doing. It reported the letterboxed
707x1000 poster as filling its card. The painted box has to be derived from
`object-fit: contain` -- scale to whichever axis runs out first. With that
corrected, restoring the original square file reports `gapH: 73.6`, the real
defect, and fails.

**Section 6** drives `admin.html`'s intake with generated uploads -- square,
wide, and a small in-budget WebP -- and requires 4:5 out of each, plus a preview
showing the processed image rather than the file the operator picked.

Mutation-tested: removing the reshape and the ratio guard fails all six checks
in section 6; restoring the original 1000x1000 file fails both checks in 2f.

## Related Files

- `site/js/admin.js` -- `CARD_ASPECT`, `isCardRatio`, `fitToCard`, `srcW`/`srcH`,
  the `alreadyFits` ratio term, `compress(img, targetBytes, mode)`
- `site/admin.html` -- the "How should the image sit in the card?" control
- `site/css/style.css` -- the corrected `contain` comment
- `site/index.html` -- three updated `width`/`height` pairs
- `site/assets/thumbnails/` -- three re-encoded files
- `tests/verify-layout.js` -- sections 2f and 6
- `docs/implementation/CATALOG_THUMBNAIL_ADMIN.md` -- the workflow this extends
