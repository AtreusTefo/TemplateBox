# Fixed Full-Height Ad Rail (Photopea Layout)

Date: August 10, 2026
Surfaces: `site/index.html` and the four editors (`resume.html`, `docs.html`, `poster.html`, `mockup.html`)
Files changed: `site/css/style.css`, `site/js/ads.js`

## What Changed

The ad rail was a sticky block inside the page, offset `top: 5.75rem` so it cleared the
site header, height-capped at `calc(100vh - 7rem)`, and sitting in normal flow as a flex
child beside the content column. It is now a column fixed to the right edge of the window,
running the full height of the viewport from `y = 0` to the foot, with the entire page —
the menu bar included — inset to its left.

This is the Photopea layout: the ad column owns the window's right edge, and the menu bar
ends where the column begins rather than running underneath it.

**This reverses a documented decision, deliberately, at the owner's instruction.** Both
`CLAUDE.md` and `docs/memory/PROJECT_STATUS.md` described the rail as sticky at
`top: 5.75rem` and recorded that a fixed full-height column with body padding had been
tried once and reverted. The owner reinstated that shape knowingly, on both the homepage
and the editors, to put the unit in full display. Both documents have been updated so the
next session does not revert it again.

## The Inset Is One Mechanism

The whole inset is a single `padding-right` on `<body>`:

```css
@media (min-width: 75rem) {
    body.has-ad-rail:has(.home-rail) { padding-right: var(--ad-rail-w); }
}

@media (min-width: 84rem) {
    body.has-ad-rail:has(.editor-rail) { padding-right: var(--ad-rail-w); }
}
```

Everything in normal flow inherits it, so no other element needs a rule:

- **`.site-header` is `position: sticky`, which stays in flow.** It inherits the inset with
  no rule of its own, and its background stops cleanly at the column's edge — exactly what
  Photopea's menu bar does. **If a width or margin hack on the header ever looks necessary,
  the padding is being applied in the wrong place.** Measured: the header's right edge and
  the column's left edge are the same coordinate at every rail width (1581 at 1920px, 1241
  at 1440px, 1167 at 1366px, 1001 at 1200px), scrolled and unscrolled.
- **The mega-menu** (`.nav-more-panel`) is absolutely positioned inside the inset header at
  `right: 0` and opens leftward, so it can never reach the column. Measured open at 1920,
  1440, 1366 and 1200: right edge 24px clear of the column at every width, left edge on
  screen, centre point hit-testing to the panel itself.
- **The sticky category tabs** (`.feed-tabs`) bleed to `main`'s padding edges, which are
  inside the inset. Right edge equals the column's left edge at the widths where `main` is
  viewport-bound, and is well clear where it is cap-bound. Verified at scroll offset 1400.
- **The editors' sticky export bar** (`.preview-actions`) is inside `.preview-pane`, inside
  the inset. Its right edge clears the column by 272px at 1920 and 65px at 1366.

`.has-ad-rail` is added by `js/ads.js` **only once `mountPlacement` has actually filled a
banner**, the same discipline `.has-site-anchor` and `.has-ad-anchor` already follow. A
dormant, blocked or wrong-viewport zone therefore reserves nothing.

## The Column's Width

One token, declared once and read by both the column and the padding that reserves it:

```css
:root {
    --ad-rail-creative: 160px;
    --ad-rail-w: calc(var(--ad-rail-creative) + var(--space-lg));
}

@media (min-width: 93rem) {
    :root { --ad-rail-creative: 300px; }
}
```

The width is the creative plus one `--space-lg` of gutter split evenly either side — which
is exactly what the old in-flow rail plus its flex gap occupied. That equality is what lets
the page width caps below shed the column without any pane narrowing. The 93rem boundary is
the same one `js/ads.js` uses to choose the band, so the width reserved can never disagree
with the unit that actually mounted.

The 1px edge is drawn with `box-shadow: inset 1px 0 0` rather than `border-left`: inside a
border box a real border would eat a pixel of the creative's width and raise a scrollbar in
the column.

## Both Bands Kept

Unchanged, and deliberately so: the three-slot 300x250 stack at 93rem and above, a single
160x600 below it. The body padding tracks whichever band mounted through
`--ad-rail-creative`, not a fixed number. Measured reserved widths: **324px** in the stack
band, **184px** in the single-unit band.

Dropping the 160x600 was tried once before and reverted, because a 300px unit on a 1366px
laptop is as wide as a content column and stops reading as a rail. Nothing here reopens that.

## Reworking `main:has(.editor-shell)`

The two tiers that raised the editor page to 84rem / 93rem existed so the **in-flow** rail
was added beside the panes rather than taken out of them. With the width now reserved by
body padding, keeping them would reserve it a second time and the panes would pay twice.

Both tiers are **left in place**, because with the script blocked or the zone dormant they
describe the layout a visitor still sees — the layout that must not change. A single
higher-specificity rule overrides them once a rail is actually in play:

```css
@media (min-width: 84rem) {
    body.has-ad-rail main:has(.editor-shell) { max-width: 72.75rem; }
}
```

72.75rem is 93rem minus the 324px the three-slot column occupies. One flat cap replaces both
tiers because the two arithmetically correct values (93rem − 324px = 1164px and
84rem − 184px = 1160px) are only 4px apart; taking the wider of the two leaves no pane
narrower anywhere.

### Measured editing-pane widths

Layout viewport is the window minus a 15px classic scrollbar, so a 1920px window lays out at
1905px. Both panes measure identically in every case; figures are one pane.

| Window | Band | Pane before | Pane after | Delta |
|---|---|---|---|---|
| 1920px | Stack, 3x 300x250 | 546px | 546px | 0 |
| 1440px | Single 160x600 | 544px | 546px | +2px |
| 1366px | Single 160x600 | 544px | 546px | +2px |
| 1200px | No rail (leaderboard) | 540px | 540px | 0 |
| 1024px | No rail (leaderboard) | 468.5px | 468.5px | 0 |
| 768px / 320px | No rail (anchor) | 705px / 257px | 705px / 257px | 0 |

Identical at 1920px, 2px wider in the single-unit band, untouched below the gate. No pane is
narrower at any width, on any of the four editors.

## The Same Correction on the Homepage

`main:has(.home-layout)`'s 96rem cap was chosen with the in-flow rail sitting inside it —
cap and rail landed in the same commit — so leaving it alone would have handed the feed the
column's full width the moment the column left the flow, growing the cards by roughly a
third on a wide screen. It sheds exactly the reserved width instead:

```css
@media (min-width: 75rem) {
    body.has-ad-rail main:has(.home-layout) { max-width: calc(96rem - var(--ad-rail-w)); }
}
```

### Measured feed-column widths

| Window | Band | Feed before | Feed after | Delta |
|---|---|---|---|---|
| 1920px | Stack, 3x 300x250 | 1156px | 1164px | +8px |
| 1440px | Single 160x600 | 1185px | 1193px | +8px |
| 1366px | Single 160x600 | 1111px | 1119px | +8px |
| 1200px | Single 160x600 | 945px | 953px | +8px |
| 1024px / 768px / 320px | No rail | 961 / 721 / 273px | unchanged | 0 |

A uniform +8px, which is the difference between the `--space-xl` flex gap the rail used to
sit behind and the `--space-lg` gutter it now carries inside the column. The masonry columns
absorb it; card proportions are unchanged.

## Recomputing `max-height`

`max-height: calc(100vh - 7rem)` is gone. `top: 0` and `bottom: 0` pin the column's height
to the viewport, so the cap has nothing left to subtract — that 7rem was the 5.75rem sticky
header clearance plus breathing room, and a column starting at `y = 0` clears nothing.
Measured height equals `innerHeight` exactly at every width, scrolled and unscrolled.

What is kept:

- `overflow-y: auto` with `scrollbar-width: none` and the `::-webkit-scrollbar` rule. Three
  stacked units still exceed a short viewport, so the internal scroll still matters; on a
  tall screen it never engages.
- `.editor-rail > div:empty, .home-rail > div:empty { display: none }`, so the two unused
  slots in the single-unit band collapse instead of leaving a gap.
- `.editor-rail:not(:has(.ad-slot)), .home-rail:not(:has(.ad-slot)) { display: none }`, so
  a rail that filled nothing is not rendered at all.

The accepted trade is unchanged: on a short screen the lower slots sit inside a scroller
most visitors will not scroll.

## What Did Not Change

- **`.editor-rail, .home-rail` is still ONE selector list.** The homepage rail is not a copy
  of the editor rail, it is the same rule. All the new geometry went into that one block.
- **The viewport gates.** 75rem floor on the homepage, 84rem on the editors, 93rem for the
  three-slot stack. The homepage's `display: none` gate is still declared *after* the shared
  rule, because media queries carry no specificity and it would otherwise lose to the shared
  `display: flex`.
- **The zones.** Same `[data-ad-rail-slot]` markup, same `editorRail1/2/3` and `skyscraper`
  keys, one distinct key per slot. Nothing added, swapped or invented. Passive banners only.
- **The HTML.** No markup changed on any of the five pages. A fixed-position element's place
  in the DOM does not affect its layout, so the rail stays where it was inside
  `.home-layout` / `.editor-shell` and every existing selector keeps working.
- **The two fixed anchors.** `.site-anchor` / `.editor-anchor` are `position: fixed`, so they
  are the only elements that do not inherit the inset. They mount only under 48rem, where the
  rail floors are 75rem and 84rem, so the two can never coexist and `has-ad-rail` is never
  present when an anchor is on screen. **Confirmed rather than assumed:** measured at 768px
  and 320px on all five pages, body `padding-right` is `0px` and the anchor spans the full
  window width. No change was needed and none was made.
- **No resize-driven remounting.** Ads still mount once at load via `matchMedia`. The two
  padding rules carry the same floors as the rail's own display gates, so a window dragged
  below a floor after load drops the reservation together with the column rather than
  leaving a gap behind it — CSS is the only thing that can follow a resize here.

## The Disclosure Label Is Small, and Stays

Asked, on seeing a real 160x600 clipped at the foot of a laptop screen, whether removing the
"ADVERTISEMENT" label would let the ad fill that space. It would not, and the reason is worth
recording so it is not re-litigated: **the zone is booked at a fixed 160x600 and the creative
does not grow into space the label gives up.** `buildBannerFrame()` writes the booked width
and height onto the iframe; freeing 24px at the top of the column simply moves 24px of white
space to the bottom. The label is also a disclosure rather than decoration — an ad has to be
identifiable as an ad, and on a product whose promise is that nothing leaves the visitor's
device, naming third-party content plainly is load-bearing.

The instinct behind the question was still right about something. Measured at full size, the
label cost 23.6px (17.6px of text plus a 6px margin) above a 600px creative that starts 16px
down the column — so the unit ran to y=639.6 and a 638px laptop viewport clipped it. The
label is now set small, the same treatment `.site-anchor` and `.editor-anchor` already give
it and for the same reason:

```css
.editor-rail .ad-label,
.home-rail .ad-label {
    font-size: 0.5625rem;
    margin-bottom: 0.125rem;
}
```

Cost drops to 16.4px, and the creative ends at y=632.4. Measured effect, at load with no
scrolling:

| Screen | Viewport height | Before | After |
|---|---|---|---|
| 1366x768, typical | 638px | 160x600 clipped by 1.6px | **100% visible** |
| 1366x768, bookmarks bar | 600px | 93% visible | 95% visible |
| 1920x1080, large taskbar | 810px | slot 3 at 76% | **85%** |
| 1600x900 | 770px | slot 3 at 60% | **69%** |

The stack band gains three times over, since it carries three labels. Slots 1 and 2 are fully
visible in every case measured; **slot 3 is the one with a real viewability ceiling on a short
desktop, and is the one to drop first** if Adsterra's reporting ever shows one of the three
underperforming. Page geometry is untouched by this change: 455 measured properties compared
against the run before it, zero differences.

One thing this does not fix, and cannot: on a viewport shorter than about 616px the 600px
creative plus the column's top padding does not fit at all. No label size changes that.

## Print

`.editor-rail` and `.home-rail` were already in the print `display: none` list. The reserved
width is now zeroed alongside the anchors' reserved height:

```css
body.has-ad-rail { padding-right: 0 !important; }
```

Verified under emulated print media on the homepage at 1920px and on the editors at 1920px
and 1366px: column `display: none`, body `padding-right: 0px`, with `.has-ad-rail` still on
`<body>`.

## Verification

`npx serve` from the repository root (never from inside `site/`), driven headlessly over the
Chrome DevTools Protocol. `index.html` and all four editors at 1920, 1440, 1366, 1200, 1024,
768 and 320px — 35 page/width combinations.

| Check | Result |
|---|---|
| Exactly one band mounts, or none by design | Pass. Anchor at 320/768; leaderboard at 1024/1200 on editors and nothing on the homepage between 48rem and 75rem; single 160x600 at 1366/1440; three-slot stack at 1920. Never two, never an unintended none |
| No horizontal page scroll | Pass. `scrollWidth === clientWidth` at all 35 combinations |
| Every menu-bar control visible and clickable | Pass. Every header anchor, button and input hit-tests to itself and none extends past the viewport, at all 35 combinations |
| Column geometry | Pass. `position: fixed`, `y = 0`, height equals `innerHeight`, left edge + width equals the layout viewport width at every rail width |
| Ad script blocked, layout identical to pre-change | Pass. 455 measured properties compared against a pristine `git archive HEAD` copy served separately, **0 differences**. No reserved gap, no inset header, no rail rendered |
| Print output excludes rail and reserved width | Pass (three page/width combinations under emulated print media) |
| Launch flow: plain click | Pass. Foreground tab routes to `loading.html?target=docs`, no new tab opened |
| Launch flow: ctrl-click and middle-click | Pass. Both open `loading.html?target=docs` in a new tab; the opener stays on `/` |

One note on method: the launch-flow checks must be driven with **trusted** input
(`Input.dispatchMouseEvent`), not synthetic `MouseEvent` dispatch. A synthetic event is not a
user gesture, so `window.open` in `bindLaunchControls` is popup-blocked and the modified-click
tests fail against working code. Worth knowing before chasing that as a defect.

## Related Documents

- `docs/implementation/EDITOR_PAGE_AD_PLACEMENT.md` — why the editors carry banners at all,
  the four viewport bands, and what was ruled out
- `docs/memory/PROJECT_STATUS.md` — the decision log entry for this reversal
- `CLAUDE.md` — the ad policy section this change rewrites
