# Loading Page: Full-Display Rail and Copy Trim

Date: August 16, 2026
Surfaces: `site/loading.html` primarily; the `srcdoc` scrollbar fix in `buildBannerFrame()` and
the `.ad-slot` overflow narrowing both apply to every ad placement on the site
Files changed: `site/loading.html`, `site/css/style.css`, `site/js/ads.js`, `tests/verify-layout.js`

## What Changed

Four changes, the first two asked for together and the last two reported after them.

1. **The rail is now the same fixed full-height column as everywhere else.** `.loading-rail`
   joins the shared `.editor-rail, .home-rail, .content-rail` selector in `css/style.css` (now
   `.editor-rail, .home-rail, .content-rail, .loading-rail`), inheriting `position: fixed`,
   `top: 0`, `right: 0`, `bottom: 0`, the shared width token, and body-padding reservation
   through `.has-ad-rail`. It previously carried its own `position: sticky` rule instead. The
   `.loading-layout` flex wrapper that existed only to seat the sticky rail beside the card is
   removed; `.loading-wrap` and `<aside class="loading-rail">` are now plain siblings inside
   `<main>`, the same structure `about.html` and every other `.content-rail` page already use.

2. **The three-item "trust list"** (`<ul class="loading-points">`: "Everything you type stays on
   this device...", "Your work saves automatically...", "Export a finished PDF or PNG...") is
   deleted from the page, along with its CSS and the mobile-only `display: none` rule that used
   to hide it below 70rem (now moot — there is nothing left to hide).

3. **The banners' internal scrollbar is suppressed** at the layer that actually owns it — the
   `srcdoc` body — rather than on the parent `.ad-slot`. See "Second Issue" below, including a
   first attempt that missed.

4. **Two height-keyed tiers bring the banners above the fold on laptops**, which no existing
   width-keyed tier reached. See "Third Issue" below.

Mounting was already correct and needed no JavaScript change: `loading.html` has called
`mountContentAds()` via the shared `[data-ad-content-rail]` / `[data-ad-rail-slot]` markup
contract since August 13, 2026 (see `CONTENT_RAIL_ROLLOUT.md`). Only the CSS this page opted out
of at that time is now adopted too.

## Why the Rail Was Sticky in the First Place, and Why That No Longer Holds

The original decision (see the removed comment, now superseded) reasoned from this page's real
and correctly-diagnosed anchor bug: a fixed **bottom** bar pins to wherever the visitor has
scrolled to, so reserving body padding only guarantees clearance at the document's true end —
not at every scroll position along the way. This page's two 300x250 banners sit mid-page inside
a centred card, so a fixed bottom anchor tried here once genuinely did cover them on a short
viewport while scrolled past. That anchor was removed and never came back on desktop.

The rail inherited a **generalized** version of that lesson rather than its actual mechanism: it
was kept `position: sticky` "because it cannot overlap anything by construction," on the
assumption that any fixed placement on this page carried the same risk the anchor did. It does
not. A fixed **side** rail and a fixed **bottom** anchor reserve space differently:

- The anchor reserves body **padding-bottom**, which protects only the region at the foot of the
  document — exactly where the anchor sits, and nowhere else the document scrolls through.
- The rail reserves body **padding-right**, a single value applied for the entire height of the
  page, at every scroll position, not just at one edge of the document. There is no scroll
  position where in-flow content can occupy the reserved column, because that column's width is
  removed from the page's available width outright — not floated on top of content that might
  still be there.

This is the exact mechanism `index.html` and the four editors already rely on (see
`FIXED_FULL_HEIGHT_AD_RAIL.md`): the rail cannot cover the loading card for the same reason it
cannot cover the homepage feed or an editor's panes. The risk that justified reverting the fixed
*anchor* here was never actually present for the fixed *rail* — it was assumed by analogy, not
re-derived.

This page also carries less risk than the other `.content-rail` pages that adopted this
mechanism on August 13, 2026: `.loading-wrap` caps at 44rem, far under the 72rem `main` cap those
pages' 75rem floor exists to protect. There was never a squeeze case here to guard against, which
is also why no `main:has(.loading-wrap) { max-width: calc(...) }` cap-shedding rule was needed —
same reasoning as the content-rail family, one step further removed from the risk.

The floor is kept at 75rem anyway, matching every other rail context, purely so the rail mounts
at identical widths sitewide rather than because this page's own arithmetic demands it.

## Why the Trust List Was Removed

Reported as taking up space the visitor doesn't need explained to them mid-countdown. It carried
no functional role — the page's honesty-in-copy discipline (see the inline comment above the
`<h1>` in `loading.html` about not describing work that does not occur) already covers what the
countdown is actually for; the list was reassurance copy layered on top of that, and its removal
gives the card more room to breathe without losing any load-bearing content.

## Second Issue: a Scrollbar Under Both Banners, and a Fix That Missed

Reported after the rail change: both 300x250 banners showed a horizontal scrollbar under the
creative at laptop widths, where nothing in the surrounding layout is squeezing a 300px box.

**The first attempt was at the wrong layer and did not fix it.** `.ad-slot` carried
`overflow: hidden` followed later in the same rule by `overflow-x: auto`, which quietly re-opened
the x-axis at every viewport. That was narrowed to `@media (max-width: 20rem)` — the only case it
was ever needed for, since below the PRD's 320px minimum the slot's own box can be narrower than
the fixed-width iframe (measured on `loading.html`: at exactly 320px, inherited `main` and
`.loading-card` padding leaves roughly 288px against a 300px creative). That narrowing is correct
and was kept, but **it does not remove the reported scrollbar**, and the first version of this
document wrongly claimed it did.

The reason is that the scrollbar is not the slot's. A creative that lays out larger than the size
it was booked at scrolls **the iframe's own document**, and that scrollbar is painted *inside* the
frame's box. The parent's `overflow: hidden` clips what escapes the box, which is a different
thing — it cannot reach inside the frame. `scrolling="no"` is the attribute that used to do this
and is deprecated and no longer reliably honoured.

The actual fix is on the srcdoc body, which is ours to style because a `srcdoc` document inherits
the embedding page's origin: `<body style='margin:0'>` becomes
`<body style='margin:0;overflow:hidden'>`. The nested cross-origin frame the Adsterra script then
injects is not ours, but the scrollbar that shows belongs to that outer document. Applied in both
places the string exists — `buildBannerFrame()` in `js/ads.js` (which covers every dynamically
mounted placement sitewide: rail slots, leaderboards, anchors, in-content and end-of-article
breaks) and the two hardcoded iframes in `loading.html`.

That duplication is the same shape as the route whitelist and the `FOOTER` constant that already
drifted once in this project, so it is now asserted rather than trusted — see Verification.

## Third Issue: the Banners Sat Below the Fold on a Laptop

Reported as: you have to scroll down to see the two banners. Measured at 1366x625 (a 768px laptop
screen less browser chrome), before any change: the ad row's bottom edge sat at **725px against a
625px viewport** — 100px under the fold — with the document running to 870px. Neither existing
tier reached this case, because both key on *width* (70rem and 48rem) and a 1366px laptop is far
above either.

Two height-keyed tiers were added, scoped to `min-width: 70.0625rem` so they and the two width
tiers are disjoint by construction — they set many of the same properties, and media queries carry
no specificity, so overlapping them would let source order decide the winner on a short phone.

- **`max-height: 56.25rem` (900px)** — the point below which the untouched layout stops fitting.
  Spacing only, no content removed: page/wrap/card padding, the inter-block margins, and the
  template thumbnail (which shrinks from 52x65 to 40x50 rather than disappearing, since it is what
  tells the visitor which template is opening).
- **`max-height: 37.5rem` (600px)** — a 1280x720 laptop leaves roughly 550px, where the first tier
  alone still left the banners 23px under the fold. This one additionally steps down the two
  display type sizes (h1 to 1.375rem, the countdown numeral to 1.875rem), the first thing on the
  page that can give up height without removing anything.

Above 900px nothing changes: on a 1080p screen the whole 870px document already fits with room
over, and the generous spacing is what makes the card read as a considered page rather than a
cramped one.

Measured after, with both banners fully visible at every size tested:

| Viewport | Ad row bottom | Banners fully visible | Page scroll |
|---|---|---|---|
| 1920x937 | 725px | yes | none |
| 1536x730 | 576px | yes | none |
| 1440x700 | 576px | yes | none |
| 1366x625 | 576px | yes | none |
| 1366x590 | 532px | yes | none |
| 1280x650 | 576px | yes | none |
| 1280x550 | 532px | yes | 31px |

The residual 31px at 1280x550 is padding below the banners, not the banners themselves — the
reported problem is resolved there too.

## Verification

- `node tests/verify-layout.js --quick` — updated the source-order assertion for the shared rail
  rule (it previously matched the literal string ending `.content-rail {`; the selector list now
  ends `.loading-rail {`) and added `loading` as a fourth family alongside homepage/editor/content
  in the display-gate-after-shared-rule check.
- **New check (1f2):** `loading.html`'s two inline banner `srcdoc` body styles must match the one
  `buildBannerFrame()` builds in `js/ads.js`, compared declaration-by-declaration rather than as a
  raw string. **Mutation-tested before being trusted**, per CLAUDE.md: reverting one of the two
  banners to the old `margin:0` made the check fail with both values printed, and restoring it
  made it pass again.
- `node tests/verify-layout.js` (full suite, 882 checks) — passes. Note `loading.html` is not a
  member of the `PAGES` array the browser-driven section 2 layout snapshot iterates (it never
  was, before or after this change), so the rail's runtime geometry on this specific page is
  exercised by the static selector/source-order checks and by the same shared CSS rule's coverage
  on every other page that uses it, not by a dedicated dynamic snapshot of `loading.html` itself.
  Adding `loading.html` to that matrix (handling its auto-redirect timer during a headless check)
  is a reasonable follow-up but was out of scope for this change.
- The vertical measurements above were taken with a throwaway CDP script driving a real headless
  browser against `loading.html?target=docs` at each viewport, reading `getBoundingClientRect()`
  on every block in the card. Two measurement traps worth knowing if this is ever repeated: the
  page's ad iframes stall `readyState: "complete"` long enough that the 10-second countdown can
  redirect to the editor first, so the probe must wait on the ad row *existing* rather than on
  load; and a cold browser's first navigation can land on `about:blank`, which reads as
  `docHeight === viewport` with no ad row — throw one navigation away before measuring.
- **Not verified locally:** that a real Adsterra creative now renders without a scrollbar. The
  test harness never loads real creatives (the ad host is unreachable from a test machine), and an
  oversized creative is precisely what cannot be reproduced without one. This needs a look in a
  real browser against the live page.
