# Homepage Feed Rework

Date: August 10, 2026
Files changed: `site/index.html`, `site/css/style.css`, `tests/verify-layout.js`
Scope: `index.html` only. No JavaScript was changed.

Five changes: a new column ladder, the card title becoming the link, hover previews on the
mockup and poster cards, descriptions removed from every card, and per-card preview ratios so
the multi-column layout reads as masonry.

**Amended twice the same day.** First the masonry was removed at the owner's request: the
per-card ratios reverted to a single 4/5. The columns were then reported as visibly out of
alignment, which they were, and fixing that properly meant replacing CSS multi-column with CSS
Grid. Section 5 records the whole sequence and the measurements behind it; the other four
changes are untouched.

## 0. Selectors Read First

`js/app.js` was read before any class was touched, because renaming `.filter-pills` to
`.feed-tabs` once killed category filtering silently. The catalogue code keys on
**attributes**, not classes: `[data-catalog-grid]`, `[data-category]`, `[data-filter]`,
`[data-target]`, `[data-search-input]`, `[data-catalog-empty]`. None of them changed.

The one class it queries is `.card-body`, in `initSearch()`, and that has a consequence of its
own — see section 4.

## 1. Column Ladder

```css
.catalog-grid { column-count: 2; column-gap: 1rem; }            /* below 48rem */
@media (min-width: 48rem)  { column-count: 3; column-gap: 1.5rem; }
@media (min-width: 64rem)  { column-count: 4; }
@media (min-width: 100rem) { column-count: 5; }
```

Counts were measured against the **feed's** width, not the viewport, because the ad rail takes
real width from 75rem up. Layout viewport is the window minus a 15px classic scrollbar.

| Window | Layout viewport | Ad column | Feed width | Columns | Card width |
|---|---|---|---|---|---|
| 1920px | 1905 | 324 | 1164 | 5 | 213.6px |
| 1600px | 1585 | 324 | 1164 | 5 | 213.6px |
| 1440px | 1425 | 184 | 1193 | 4 | 280.3px |
| 1366px | 1351 | 184 | 1119 | 4 | 261.8px |
| 1200px | 1185 | 184 | 953 | 4 | 220.3px |
| 1024px | 1009 | 0 | 961 | 4 | 222.3px |
| 768px | 753 | 0 | 721 | 3 | 224.3px |
| 414px | 399 | 0 | 367 | 2 | 175.5px |
| 320px | 305 | 0 | 273 | 2 | 128.5px |

Two notes carried from the brief.

**Per-category column counts were not built, as agreed.** The feed is one set of CSS columns
that the tabs filter in place, so the count is global; "4 except for Receipts and Invoices and
Resumes" is not expressible in this structure. What it would cost, if it is ever wanted: each
category becomes its own `<section>` with its own column context, the tabs switch sections
instead of toggling `.is-hidden` on cards, and the "All" tab either shows five stacked
sections (no longer one continuous feed) or needs a separate combined grid. That also splits
the search index, which currently walks one flat card list. It is a restructure of the feed's
model, not a CSS change, and it was deliberately not attempted in this pass.

**The 3-column band opens at exactly 48rem**, so 768px gets three columns. That follows the
ladder as specified and deliberately differs from every other 48rem gate on the site, which
treats 768px as phone width — the mobile ad anchor mounts at `max-width: 48rem`, so at exactly
768px the anchor and the 3-column feed are both up. They are independent concerns and nothing
about the anchor depends on the column count, but it is the one place where 48rem means
"desktop" rather than "phone".

**The `column-count: 1` rule below 26rem is gone**, and the miniatures were rechecked at 320px
rather than assumed — see the verification section.

## 2. The Card Title Is the Link

The standalone "Open editor" control is gone from all sixteen cards. The anchor moved onto the
title:

```html
<h3 class="card-title">
  <a class="card-link" href="docs.html" data-target="docs" data-doc="rent-receipt">Rent Receipt</a>
</h3>
```

All four requirements hold, and each was checked against the **served markup**, not the
rendered DOM:

- **A real `<a>` with a real `href` per card.** 16 cards, 16 anchors, all four editor pages
  linked. These are the only crawlable inbound links the editors have.
- **Accessible text**, because the anchor wraps the title. It cannot become an empty box.
- **`data-target` and `data-doc` unchanged.** `bindLaunchControls()` binds `[data-target]` and
  is untouched; the `docs.html` variant hand-off still writes the preset.
- **`.card-link::after` still stretched**, so the whole card surface is the target.

One thing this exposed that would have been a live bug: `.card-preview` needed
`isolation: isolate`. The frame hover's base and overlay carry `z-index: 2` and `3`; without a
stacking context on the preview those compete in the **card's** context and paint over
`.card-link::after`. The card would have looked correct and refused clicks over the preview
area. Isolation also keeps the overlay's `multiply` blending against the frame rather than the
page.

Focus, now that the button is gone: the ring goes on the preview via
`:has(.card-link:focus-visible)` because that is what reads as "the card", and the title also
underlines so focus is still signalled if `:has()` is unavailable.

## 3. Hover Previews

Both are inside `@media (hover: hover)` and both happen inside `.card-preview`, whose
`aspect-ratio` fixes its box — so no hover can change a card's height or repack the masonry.
Verified: card and grid geometry are byte-identical before and after hover.

**Product mockups.** `.mk-art` is already in the markup inside each CSS product shape, so this
is `opacity: 0` by default and `1` on hover with a `--motion-base` fade. The global
`prefers-reduced-motion` block zeroes the transition along with every other one. Applies to the
t-shirt, mug and box cards; the fourth mockup card is the photographic wood-a4 thumbnail, which
has no `.mk-art` and is unaffected.

**Posters and prints.** The poster miniature composites into the real wood-a4 frame. No canvas,
no glfx.js, no new assets — the `warpZone` is an axis-aligned rectangle (x 655-1461, y 224-1583
of a 2000x2000 base), so it needs no perspective transform.

The scene is a square the height of the preview, centred and clipped:
`height: 100%; aspect-ratio: 1; left: 50%; translateX(-50%)`. Expressing the window against
that square is what makes the numbers independent of the card's own aspect ratio — vertical is
direct (`top` and `height` are percentages of the containing block's height, which is the
square's side), and horizontal uses the element's own width: the window centre sits at 52.9% of
the square rather than 50%, and that 2.9% offset is 7.196% of the window's own width, hence
`translateX(-42.804%)`.

The ratio-independence is not a claim, it was measured at two different card shapes: a 3/5
preview while the masonry existed, and the 4/5 preview that replaced it.

| | 3/5 preview (H=467.1) | 4/5 preview (H=350.3) | Target |
|---|---|---|---|
| Window left | 12.82% of H | 22.85% of H | 12.76% / 22.75% |
| Window top | 11.36% of H | 11.42% of H | 11.20% |
| Window width | 40.13% of H | 40.07% of H | 40.30% |
| Window height | 67.66% of H | 67.56% of H | 67.95% |

Only the horizontal offset moves between the two, and it moves exactly as the geometry predicts:
the square scene is the preview's height, so a wider card crops less off each side.

Compositing follows the template's declared `mode: "window"`: artwork first (z-index 1), then
the base whose transparent print opening reveals it (2), then the overlay multiplied on top
(3). The overlay is a baked luminance map — at the default `source-over` it would paint over
the artwork and wash it out completely, which is a documented defect
(`PHOTO_MOCKUP_OVERLAY_WASHES_OUT_DESIGN.md`).

## 4. Descriptions Removed

`.card-desc` is gone from all sixteen cards. `.card-category` stays; it is a label, not a
description. `.catalog-grid .card-body` was retuned from `0.75rem` top padding and a
`0.1875rem` gap — set for an eyebrow, a title, a paragraph and a 2.25rem CTA — down to
`0.625rem` and `0.125rem` for what is now an eyebrow and a title.

The base `.card-desc` rule stays in the stylesheet: `js/app.js` and `js/blog.js` both create
that class for the guides strip and blog cards. Only the `.catalog-grid` override was removed.

**Nothing was hidden in `.sr-only` or an `aria-label` to compensate**, as instructed. Text
hidden purely to feed a crawler is the wrong fix.

Two consequences, both flagged rather than absorbed:

**The card titles are now the page's only indexable prose.** The H1 is `.sr-only`, and the
hero, trust band and keyword strip were already removed. This is recorded in
`docs/memory/PROJECT_STATUS.md` as a candidate cause if homepage impressions fall in Search
Console.

**The on-site search index shrank, which the brief did not raise.** `initSearch()` indexes
`.card-body` text content, which until now included the description. The index is now the
category eyebrow plus the title. Measured before and after:

| Query | Hits before | Hits after |
|---|---|---|
| `rent` | 1 | 1 |
| `resume` | 3 | 3 |
| `mug` | 1 | 1 |
| `invoice` | 6 | 6 |
| `ats` | 1 | 1 |
| **`tenant`** | **1** | **0** |

Terms that only ever appeared in prose — `tenant`, `landlord`, `photoshoot`, `print-on-demand`
— no longer match anything. Every term a visitor is likely to type that also appears in a title
or category still works. This is a functional narrowing, not a bug, and it was left as-is
because the alternative (a `data-keywords` attribute folded into the index) is invisible text
added for matching, which is close enough to the thing the brief ruled out that it should be
your call rather than mine.

## 5. Masonry Built, Removed, Then Multi-column Replaced by Grid

Three states in one day. The end state is CSS Grid with one uniform 4/5 preview ratio.

### 5a. Masonry, built

Every preview was locked to `aspect-ratio: 4 / 5`, so with the descriptions gone the card bodies
were uniform and the columns lined up like a grid. Six `.ratio-*` classes were assigned per card
to vary the heights, producing 8 distinct card heights across a 185px range at 1920px.

### 5b. Masonry, removed

Removed hours later at the owner's request. Every preview went back to a single 4/5 and the
`.ratio-*` classes were deleted from the markup and the stylesheet.

### 5c. Multi-column replaced by Grid

The columns were then reported as misaligned on the All tab -- "the last vertical items on the
far right". Measured, that was two separate defects.

**Defect 1: one two-line title knocks a whole column out of alignment.** Multi-column packs each
column independently, so a taller card pushes every card below it in that column down a line.
Second-card top per column, left to right:

| Width | Column tops | Drift |
|---|---|---|
| 1366px | 400, 400, 400, **421** | far-right column 21px low |
| 1200px | 348, 348, 348, **369** | same |
| 1024px | 351, 351, 351, **371** | same |
| 414px | 284, **305** | same |

The culprit at those widths is "Apparel Mockup: T-Shirt and Hoodie", the first card of the last
column, whose title wraps to two lines.

**Defect 2: at 1920 and 1600 the distribution was [3,3,4,3,3]** -- one column held four cards and
ran 339px below every other column.

**The obvious fix makes it worse.** Reserving two lines of title height (`min-height: 2.6em`)
cures Defect 1 completely, and then breaks the column count:

| Width | Distribution before | With `min-height: 2.6em` |
|---|---|---|
| 1920px | [3,3,4,3,3] | **[4,4,4,4]** -- the fifth column disappears |
| 1600px | [3,3,4,3,3] | **[4,4,4,4]** |

With sixteen equal-height cards, `column-fill: balance` fits them into four columns of four and
leaves the fifth empty. **The ragged card heights were the only reason five columns appeared at
all.** Multi-column cannot deliver aligned rows and a five-column band simultaneously; that is
structural, not a tuning problem.

**So the layout is CSS Grid**, which delivers both and needs no reserved height at all: every
card in a row shares the row's height, so tops align whatever the title wraps to.

```css
.catalog-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
    align-items: stretch;
}
/* 3 at 48rem, 4 at 64rem, 5 at 100rem */
```

`minmax(0, 1fr)` rather than `1fr`: a track's default minimum is min-content, so a long unbroken
title would push its track wider than its share and skew the row. `align-items: stretch` is
load-bearing -- `align-items: start` would reintroduce exactly the ragged alignment this
replaced. `gap` replaces both `column-gap` and the cards' `margin-bottom`, which would otherwise
double the gutter. `break-inside: avoid` is kept for paged media only.

### Measured result

| Window | Columns | Rows | Cards per row | Misaligned rows |
|---|---|---|---|---|
| 1920px | 5 | 4 | 5, 5, 5, 1 | 0 |
| 1600px | 5 | 4 | 5, 5, 5, 1 | 0 |
| 1440px | 4 | 4 | 4, 4, 4, 4 | 0 |
| 1366px | 4 | 4 | 4, 4, 4, 4 | 0 |
| 1200px | 4 | 4 | 4, 4, 4, 4 | 0 |
| 1024px | 4 | 4 | 4, 4, 4, 4 | 0 |
| 768px | 3 | 6 | 3, 3, 3, 3, 3, 1 | 0 |
| 414px / 320px | 2 | 8 | 2 x 8 | 0 |

A row counts as misaligned if its cards' previews do not all start at the same y. Zero at every
width, and zero on every category filter (documents, resumes, canvas, mockups, all).

### Two things this fixed for free

- **Reading order now runs across rows rather than down each column.** That was a documented
  trade-off of the multi-column choice, live since the August 9 rebuild, and it is simply gone.
- **The `.card-category` eyebrow wraps to two lines at 320px**, a second source of drift that the
  title `min-height` fix would not have covered. Row height absorbs it.

Do not switch back to multi-column, and do not re-add the `.ratio-*` classes: both were tried,
both are recorded above with the measurements that ruled them out.

## 6. Previews Fill the Tile

`.card-preview` carried a `--space-md` inset, so every CSS miniature floated inside its tile
with its own 1px border showing as a second rectangle inside the card's border: two frames
around one document. The one card whose preview is a real photograph, the wood-a4 mockup, had
no inset and filled its tile edge to edge, so the feed was inconsistent with itself.

The padding is now zero for feed cards and the miniature's own border goes with it, leaving a
single 1px outline:

```css
.catalog-grid .card-preview { padding: 0; }
.catalog-grid .card-preview .mock-doc:not(.poster) { border: 0; }
```

Three things worth knowing before touching this:

- **Scoped to `.catalog-grid` deliberately.** The nine `*-template.html` landing pages use
  `.card-preview` for a hero preview where the inset is correct. An unscoped change would have
  altered all ten pages.
- **The poster miniature keeps its border, because there the border IS the drawn picture
  frame** rather than a container edge. `.mock-doc.poster` and a plain `.catalog-grid .mock-doc`
  would both be two-class selectors, so source order alone would decide and the frame would
  silently vanish; the `:not(.poster)` guard plus the extra `.card-preview` in the selector is
  what settles it on specificity instead.
- **The miniature's own 0.625rem internal padding stays.** That is the document's margin, not a
  container inset, and removing it would run the sample text into the tile edge.

The hover geometry is unaffected. An absolutely positioned child resolves against its
containing block's padding box, which is unchanged by removing padding, so the frame scene and
the window rectangle measure identically before and after.

## Verification

`npx serve` from the repository root, driven headlessly over CDP, at 1920, 1600, 1440, 1366,
1200, 1024, 768, 414 and 320px.

| Check | Result |
|---|---|
| Column count matches the ladder, measured against feed width | Pass at all 9 widths (table above) |
| No horizontal page scroll | Pass at all 9 widths |
| Whole card surface clickable | Pass. Every card hit-tests to `a.card-link` at its preview centre, each scrolled into view first |
| One crawlable anchor with href and text, in the served markup | Pass. 16/16, all four editors linked, no leftover `.btn` or `.card-desc` |
| Plain click reaches `loading.html?target=...` | Pass, foreground tab, no new tab opened |
| Ctrl-click and middle-click open the interstitial in a new tab | Pass, opener stays on `/` |
| `data-doc` preset still written | Pass (`tb_editor_preset` = `"warning-notice"`, JSON-encoded by `TB.storageSet`) |
| Category tabs still filter | Pass: 6 / 3 / 3 / 4 / 16 |
| Hover previews fade in without moving anything | Pass. Card and grid geometry identical before and after hover, re-checked after the ratios were removed |
| Hover effects absent under `(hover: none)` | Pass. Under touch emulation the frame pseudo-elements do not exist (`content: none`, no image fetched) and `.mk-art` stays at opacity 0 |
| Keyboard focus reaches every card with a visible state | Pass. Anchor focusable, matches `:focus-visible`, 2px outline on the preview, title underlined |

Full suite (`node tests/verify-layout.js --no-baseline`): 388 passed, 0 failed.

### The 320px legibility question, answered honestly

Two columns at 320px gives a 128.5px card. The miniatures **do** still read: the document
headings that identify each template — RENT RECEIPT, PAYMENT RECEIPT, SALES RECEIPT, EMPLOYEE
WARNING NOTICE, the Harbour Supply Co. and Meridian Studio letterheads — are all legible, as
are the bold amounts. Body detail below the heading degrades into texture, but the *type* of
document is clear, which is what a visitor is choosing between. The 1-column rule was not
quietly kept.

### The six business documents, checked

All six remain distinguishable at 320px. The closest pair is **Rent Receipt and Sales and Cash
Receipt Form** — both are a centred receipt wordmark over label/value rows, and the wordmark
alone does not separate them. What does separate them is that the rent receipt is filled
(Daniel Osei, $1,250.00, amount in words) while the sales form is a blank ruled table with
empty ITEM/QTY/PRICE rules, which reads as a printable form at a glance. Second closest is
Itemized Business Receipt against Professional Invoice, both company letterhead plus a
line-item table; the invoice's navy accent and the RECEIPT/INVOICE wordmarks separate them
cleanly. No two read as the same card.

## Things You Should Know

**All three poster cards hover into the same frame.** `wood-a4` is the only frame mockup in the
repository and no asset paths were invented for frames that do not exist. Side by side at 4 or
5 columns the three poster cards show an identical wood frame with identical room shadows, and
it does read as repetitive. What would fix it, in increasing order of cost: vary the artwork
inside the window per card (already true — each card's plate has its own palette, which is what
currently carries the difference); apply a per-card CSS `filter: hue-rotate()` or a slight
`scale`/`rotate` on the frame so the three read as three photographs (cheap, slightly
dishonest); or add two more real frame assets to `assets/mockups/` with their own warp zones
via `tools/mockup-admin.html`, which is the only fix that is actually three frames.

**The frame hover downloads 2.3MB on first hover.** `wood-a4-base.png` is 2.07MB and the
overlay 224KB, both 2000x2000. Because the `background-image` is declared only inside the
`:hover` rule inside `@media (hover: hover)`, nothing is fetched until a desktop visitor first
hovers a poster card, and touch devices never fetch it at all — but that is still 2.3MB on the
site's most-indexed page for a hover effect. A downscaled derivative (800px, roughly 150KB)
would remove the problem entirely; it is an added asset, which this pass was told not to do, so
it is flagged rather than done.

**The ad rail is now wider than a feed column at 93rem and up.** See the entry in
`docs/memory/PROJECT_STATUS.md` — this is the one place where the new ladder collides with a
previously documented rule, and it needs your eye rather than a measurement.

## Related Documents

- `docs/implementation/FIXED_FULL_HEIGHT_AD_RAIL.md` — the fixed rail this feed sits beside
- `docs/error-fixes/PHOTO_MOCKUP_OVERLAY_WASHES_OUT_DESIGN.md` — why the overlay must multiply
- `docs/guides/RUNNING_THE_VERIFICATION_SUITE.md` — how to re-run the checks above
