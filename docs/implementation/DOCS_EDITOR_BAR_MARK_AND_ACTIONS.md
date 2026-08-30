# Business Document Editor: Site Mark at the Far Left, Print and Clear Form in the Bar

Date: August 26, 2026
Scope: `site/docs.html`, `site/css/style.css`
Page family: the receipts, invoices and notices editor only. `resume.html`, `poster.html` and `mockup.html` are untouched and measure byte-identical against HEAD.

## What Was Asked

Two changes to the Receipts and Invoices editor:

1. Put the site logo alone at the far left end of the bar, with no "TemplateBox" wording, ahead of the document-name field.
2. Move Print and Clear Form into the bar, beside the Download button on the right.

## What Was There Before

The bar carried, in source order: an `.editor-home` house icon linking to `index.html`, an `.sr-only` label, the `.doc-name` input, `.editor-actions` holding the autosave cloud and Download PDF, and an empty `.site-nav`. Print and Clear Form sat below the rendered sheet in `.preview-actions` inside the preview pane.

Two defects fell out of that arrangement, and both are the reason the request was made.

**The house icon rendered after the name field, not before it.** `.editor-bar` publishes explicit `order` values for the controls it knows about -- `.editor-home` is `order: 1` -- and `.doc-name` carries no `order` at all, so it sits at the flex default of `0` and sorts ahead of everything in that list. The icon therefore painted to the RIGHT of the name input at every width where it was visible. Measured at 1440px before the change: `.doc-name` at x=24, the icon further along the row.

**Above 75rem there was no identity at the left edge at all.** `@media (min-width: 75rem) { .editor-bar .editor-home { display: none } }` exists so `mockup.html`'s `.editor-brand` wordmark can take the slot on wide screens. `docs.html` has no `.editor-brand`, so from 1200px up the far left of the bar was empty.

## What Changed

### 1. `.editor-mark` -- the mark on its own, at every width

`docs.html` now opens its bar with:

```html
<a class="editor-mark" href="index.html" title="TemplateBox home"
   aria-label="TemplateBox home, all templates"><svg viewBox="0 0 64 72" ...></svg></a>
```

The SVG is the same isometric-box mark `index.html`'s `.wordmark` and `mockup.html`'s `.editor-brand` inline, with `stroke="currentColor"` so it inherits the bar's text colour and its `:hover` brand colour, in light and dark alike.

Three deliberate choices:

- **A new class, not a reuse of `.editor-brand`.** That class exists to carry the word beside the mark, and the word is the half explicitly asked to be dropped.
- **A new class, not an edit to `.editor-home`.** `resume.html`, `poster.html` and `mockup.html` share `.editor-home`, and this project already recorded that it must stay byte-identical across them.
- **No viewport gate.** `.editor-brand` is gated at 75rem because `.editor-home` covers the band below it on `mockup.html`. Here the mark REPLACES the icon outright, so a gate would produce a band served by neither -- the exact shape of the dead search control this bar's own comment block warns about.

`order: -1`, not `1`. The name input has no `order`, so any positive value lands the mark after it. `-1` is the only value that puts the mark at the far left without assigning an `order` to a class `resume.html` and `poster.html` share.

### 2. `.editor-bar .editor-mark ~ .editor-actions { margin-left: auto }`

`.site-header` is `justify-content: space-between`, so leftover free space is shared out between items unless something absorbs it. The base `.editor-actions` rule absorbs it with `margin-left: auto`; the 75rem rule hands that job to the search FIELD instead, which is correct for `mockup.html` and wrong for a bar that has no field. Without this rule the free space was split and, once the mark moved to the front, the document name floated 219px away from it in the middle of the bar.

Three classes, so it wins over the two-class rule inside the media query regardless of source order. Media queries carry no specificity, which is the same trap the homepage rail's `display: none` gate is written around.

### 3. Print and Clear Form moved into `.editor-actions`

Both buttons keep their ids -- `#print-doc` and `#clear-doc` -- and `js/docs.js` binds both by id, so no JavaScript changed. **No second copy was left in the preview pane**: two elements sharing an id would leave one of them permanently dead.

They carry `class="btn btn-secondary bar-action"`, and `.bar-action` was added to the existing `.dl-toggle` rule as a selector list rather than as a second block that looks like it:

```css
.dl-toggle,
.bar-action { ... }

.dl-toggle svg,
.bar-action svg { ... }
```

Order in the bar is Print, Clear Form, Download PDF -- the destructive action between the two safe ones is deliberate only in that Download stays last, hard against the right edge where it has always been.

### 4. `.bar-label`, and the 320px arithmetic

Every label in the bar is now wrapped in `<span class="bar-label">`, including Download PDF's, and all three are `display: none` below 48rem. Each button carries an `aria-label` identical to its visible text, so the accessible name survives the label going.

This is not cosmetic. Three labelled buttons do not fit a phone bar, and the cost of overflow is a sticky header on a workspace growing a second row. Measured after the change:

| Width | Header height | Labels | Name field | Horizontal overflow |
|---|---|---|---|---|
| 1440 | 85px | shown | 288px (its cap) | none |
| 900 | 85px | shown | 288px | none |
| 768 | 85px | hidden | 288px | none |
| 390 | 85px | hidden | 122px | none |
| 320 | 130px | hidden | 252px | none |

320px was already two rows before this change, at 133px against HEAD. It is 130px now -- three pixels shorter, because three icon buttons occupy less than one labelled Download button plus the old spacing. Every bar control hit-tests to itself at 320px.

### 5. `.doc-actions` deleted

The row that held the two buttons inside the preview pane is gone, and nothing else in the repository used the class, so `.doc-actions`, `.doc-actions .btn` and its entry in the print stylesheet's hide list were deleted with it. This follows the project's own rule that retiring a unit deletes the rule sized for it -- a live rule for a retired element is what silently over-reserved 116px under the site anchor once already.

## What Was Deliberately Kept

**`.preview-actions` stays, holding only the export note.** It is what the ad anchor's lift is measured against -- `body.has-ad-anchor .preview-actions` -- and `tests/verify-layout.js` reads it as `exportBar` in both its layout section and its parity snapshot. Removing the element would have changed an ad-containment invariant to save a border and a line of text. The note itself ("No file ever leaves your device") belongs beside the rendered sheet rather than in the navigation.

Its measured height drops from 103.8px to 43.8px at 1920px, which is the only layout consequence of the move.

**The print stylesheet needed no change for the new buttons.** `.site-header` is already in its hide list, so all three actions are absent from print output by inheritance.

## Verification

`node tests/verify-layout.js` from the repository root: 1183 checks pass. Section 4, "ads blocked: layout identical to the last commit", reports the intended differences against HEAD and will do so until this change is committed -- that section compares the working tree to `git archive HEAD`, so any deliberate layout change shows up there by construction. The differences it lists are `docs` `exportBar` at nine widths (60px shorter), and `docs` `header`, `main` and `panes` at 320px (three pixels shorter).

Checked by hand in a browser at 1440, 900, 768, 390 and 320px:

- The mark is the leftmost item at every width, with the name field immediately after it.
- Print, Clear Form and Download sit together at the right, in that order.
- `#print-doc` and `#clear-doc` still fire their handlers from their new position: with `window.print` and `window.confirm` stubbed, one call each.
- No duplicate ids; `document.querySelectorAll` returns exactly one node for each of the three.
- No horizontal overflow and no covered or offscreen bar control at 320px.

## Related Files

- `site/docs.html` -- header block and `.preview-actions`
- `site/css/style.css` -- `.editor-mark`, the `.editor-actions` margin rule, the `.dl-toggle`/`.bar-action` selector lists, the 48rem `.bar-label` rule, and the deleted `.doc-actions` rules
- `docs/implementation/MOCKUP_WORKSPACE_REBUILD.md` -- the `.editor-brand` precedent this follows
- `CLAUDE.md` -- "Editor Ad Containment", for why `.preview-actions` stays
