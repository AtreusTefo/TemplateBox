# The Footer Moved Into the Header Mega-Menu

Date: August 13, 2026
Surfaces: every public page except `loading.html` (no header) and `admin.html` (private tool)
Files changed: 20 HTML pages, `site/css/style.css`, `site/js/app.js`, `site/js/admin.js`,
`tests/verify-layout.js`

## What Changed

`index.html` carried no footer and instead exposed the same five link columns through a "More"
mega-menu in the header. Every other page carried the footer and no menu. That split is gone:
**no page has a footer any more** (except `admin.html`), and all 21 public pages carry the
mega-menu, matching the homepage exactly.

The four editors previously had neither a footer nor a menu, so they gain navigation they never
had — without it they would have been the only pages with no route at all to the legal or
landing pages.

## Two Things That Had To Change With It

Doing this literally — deleting footers and leaving everything else alone — would have shipped
two regressions. Both were found before release and handled.

### 1. The menu was desktop-only

`.nav-more` was `display: none` below 62rem, and the rule's own comment explained why: *"the
footer already carries these links on every page that has one."* With no footer left, hiding
the menu on phones would have left **privacy.html and terms.html unreachable from any other
page on a mobile viewport** — a navigation dead end on the two pages most likely to be needed
for compliance reasons.

The control is now available at every width. Below 62rem the panel restyles rather than
disappears: the five-column grid becomes a single stacked column spanning the header's full
width, scrolling internally past 75vh.

It stays `position: absolute` rather than switching to `fixed`, anchored to `.site-header` —
which is the containing block because it is `position: sticky`, i.e. positioned. That is what
lets `left: 0; right: 0; top: 100%` sit it exactly under the header without hardcoding a header
height. The header carries `flex-wrap: wrap` and grows a second row on narrow screens, so any
fixed pixel offset would have drifted the moment it wrapped.

Its `z-index` is 40, above the fixed mobile ad anchor's 30, or the foot of the panel would sit
behind the banner on a phone.

### 2. The social links existed only in the footer

The four social profile links (`.footer-social`, added July 25, 2026) had no other home on the
site. Deleting footers would have removed every link to them sitewide. They are now a
`.nav-more-social` row inside the panel, spanning all five columns under the link lists rather
than becoming a sixth column — four icons in a 9rem column would leave most of it empty, and
the grid's `minmax` would stretch the other five to match.

## The Regression This Introduced, and the Fix

The nav went from four controls to five. `.site-nav` was `display: flex` with a `1.5rem` gap
and **no wrapping**, so at 320px the added More button pushed the theme toggle past the right
edge: 372px of content in a 320px viewport, taking the whole page into horizontal scroll and
putting a header control out of reach. This broke **ten checks across every page** in the
verification suite (`@320: no horizontal page scroll` and `@320: every menu-bar control
reachable`), which is exactly what that suite exists for.

Fixed with `flex-wrap: wrap` on `.site-nav` plus a narrow-screen tier: the nav gap drops to
`--space-sm` and the header gutter to `--space-md` below 48rem. Four gaps at 1.5rem is 96px of
a 320px viewport — more than the More button itself costs — so the gap does most of the work.

**Worth recording for the next investigation:** this was briefly misdiagnosed as pre-existing,
on the reasoning that the overflow measured identically with the panel open and closed. That
observation was true and the conclusion drawn from it was wrong — it ruled out the *panel*
while saying nothing about the *button*, which is in the header whether the panel is open or
not.

## SEO and Crawlability

The footer was the site's documented internal-linking surface, so its removal deserves an
explicit answer rather than an assumption.

The panel's links are **real anchors in the served markup**. The panel is hidden with the
`hidden` attribute, not built in JavaScript, so every link a crawler could previously find in
the footer is still in the HTML on every page — verified: 22 links plus 4 social links present
in the served markup of all six sampled page types, with the panel in its default hidden state.
This is the same reasoning that made the homepage's menu acceptable when it was the only
instance.

What did change is that those links are now inside a collapsed element rather than visible
page furniture. That is a real difference in how much weight a search engine may assign them,
and it applies site-wide rather than to one page. It was accepted as the cost of the requested
consistency, not overlooked.

## The Post-Page Generator

`buildPostPage()` in `site/js/admin.js` emitted the footer from a `FOOTER` constant. That
constant is replaced by `MEGA_MENU`, wired into the generated `<nav>`, and the `FOOTER +`
reference removed from the page template, so newly exported post pages match the hand-written
ones.

The generator had also drifted: its `<nav>` never gained the theme toggle that every real page
carries, so exported pages would have shipped without dark-mode control. Fixed in the same
pass. The drift warning that lived on the old constant carries over verbatim to the new one —
this block is hand-copied across pages, so when it changes there it must change here too, or
the generated pages drift again.

## Verification

- **Full suite: 879 passed, 0 failed** (`node tests/verify-layout.js --no-baseline`), including
  the ten `@320` checks that the un-wrapped nav had broken.
- **Targeted mega-menu script, 14 checks, all passing**: menu present / footer absent / 22 links
  + 4 social in served markup across six page types including a generated post page; panel
  opens on screen, clear of the ad rail, and hit-tests to itself at 1920/1440/1280; the control
  is reachable on mobile with both legal links present and no overflow at 768/414/390/320; and
  the panel stacks above the mobile ad anchor.

**Not verified: anything visual.** The panel's appearance as a stacked mobile column, and
whether 75vh is the right internal-scroll ceiling, were checked by measurement rather than by
eye.

## Related Files

- `site/css/style.css` — `.nav-more-social`, the rewritten `@media (max-width: 62rem)` panel
  block, `.site-nav` wrapping and the narrow-screen header tier
- `site/js/app.js` — `initNavMore()`'s comment, now describing a site-wide all-width menu
- `site/js/admin.js` — `MEGA_MENU` replacing `FOOTER`, plus the restored theme toggle
- `tests/verify-layout.js` — unchanged for this work; it caught the 320px regression as written
- `docs/implementation/CONTENT_RAIL_ROLLOUT.md` — the ad rail work done the same day
