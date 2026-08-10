# Feed Hover Zoom, Hide-on-Scroll Navigation, and Rounded Cards

Date: August 10, 2026
Files changed: `site/index.html`, `site/css/style.css`, `site/js/app.js`
Documentation corrected: `site/css/style.css` header, `PRD.md`, `MOCKUP_GENERATOR_IMPLEMENTATION.md`

Three changes to the homepage feed, building on the same day's grid rework. Each is
independent of the other two.

## 0. Selectors Read First

`js/app.js` was read before anything was renamed, because renaming `.filter-pills` to
`.feed-tabs` once killed category filtering in silence, and this pass touches the same header
and tab markup. The catalogue and tab code keys on **attributes** — `[data-catalog-grid]`,
`[data-category]`, `[data-filter]`, `[data-target]`, `[data-search-input]` — and on one class,
`.card-body`, in `initSearch()`.

**Nothing was renamed.** The only markup addition is a new `.card-media` wrapper inside each
`.card-preview`, which no selector in `js/app.js` reads. Category filtering was re-verified
after the change: 6 / 3 / 3 / 4 / 16.

## 1. Hover Zoom

`.card-media` wraps everything inside the preview window, and that one element carries the
scale:

```css
.catalog-grid .card-media { transform: scale(1); transition: transform var(--motion-base) var(--ease); }

@media (hover: hover) {
    .catalog-grid .template-card:hover .card-media,
    .catalog-grid .template-card:focus-within .card-media { transform: scale(1.06); }
}
```

**Why a wrapper rather than scaling the existing children.** The poster cards composite a
frame photograph over artwork positioned inside the frame's print window. Scaling those
separately — each about its own centre — slides the artwork out of the opening, because they
have different centres. One wrapper means one `transform-origin` and the composite stays
registered. It also means the zoom applies to whichever visual is showing, so it cannot
desync from either crossfade: the mockups' design-on-product fade and the posters' frame
scene are both inside the element being scaled.

**The clip is on the container, the scale on the child**, as required. `.card-preview` keeps
`overflow: hidden`; `.card-media` is `overflow: visible` and is what grows. Scaling the
clipping box instead would scale the window along with the content and the card would spill.
Verified directly: with the card hovered, `.card-media` measures wider than `.card-preview`
and nothing escapes the card.

**Costs no layout.** Transform only. Card and grid geometry are identical before and after
hover at every width tested — for example at 1920px, card 279x397.5 and grid 1638.2 both
before and after.

**Reduced motion** is handled by the global `prefers-reduced-motion` block near the top of the
stylesheet, which zeroes `transition-duration` everywhere. The state change still happens;
only the animation does not, which is what the brief asked for.

**Gated behind `@media (hover: hover)`**, so a touch device can never strand a card in the
zoomed state. Verified under touch emulation: `(hover: none)` matches and the transform stays
at identity.

## 2. Hide-on-Scroll

One utility in `js/app.js`, `initScrollDirection()`, which knows nothing about any element. It
tracks `pageYOffset`, compares against the previous value, and writes a single class,
`.is-nav-hidden`, onto `<body>`. Which elements react, and at which widths, is entirely CSS.

```js
window.addEventListener("scroll", () => {
    if (!queued) { queued = true; window.requestAnimationFrame(update); }
}, { passive: true });
```

- **Passive listener**, so it can never block scrolling.
- **One rAF per frame** through a flag, so the work is throttled rather than running per pixel.
  The scroll position is read inside the frame callback, not in the handler.
- **`JITTER = 6`** ignores sub-pixel and rubber-band noise that would otherwise flip the class
  back and forth while the page is effectively still.
- **`REVEAL_ABOVE = 80`** keeps everything visible near the top of the document.

The CSS is the opt-in:

```css
body:has(.home-layout).is-nav-hidden .feed-tabs { transform: translateY(calc(-100% - 5.25rem)); }

@media (max-width: 48rem) {
    body:has(.home-layout).is-nav-hidden .feed-tabs  { transform: translateY(calc(-100% - 4.75rem)); }
    body:has(.home-layout).is-nav-hidden .site-header { transform: translateY(-100%); }
}
```

**The tabs travel their own height plus their sticky offset.** Travelling only `-100%` would
park them on top of the header on desktop and leave them visible below a hidden header on
mobile. Measured: the tab bar's bottom edge sits at exactly 0px when hidden, at every width.

**Transform, never `display: none`.** Both elements are `position: sticky`, and collapsing
them would drop their boxes out of flow — `index.html`'s ad-rail inset works precisely because
`.site-header` stays in normal flow and inherits the body padding. A transform moves the paint,
not the box. Verified: the rail inset, the header's right edge and horizontal overflow are all
unchanged at every width, and the full layout suite still passes 388/388.

**Desktop header behaviour is unchanged, deliberately.** The brief allowed extending it if
there were a reason; there is not. Desktop has room for the header, and it carries the search
field, which is the one control a visitor is most likely to want mid-scroll. Measured at 1920,
1600, 1440, 1366, 1200 and 1024: header transform stays `none` while the tabs hide.

**Scoped to the homepage** with `body:has(.home-layout)`. The class is written on every page
that loads `js/app.js`, but the editors deliberately do not opt in: they carry their own sticky
export bar and a fixed ad anchor, and a header moving underneath those has not been tested.
Extending this to the editors should be a deliberate decision with its own verification, not a
selector tweak.

**Keyboard focus cannot be stranded:**

```css
body.is-nav-hidden .feed-tabs:focus-within,
body.is-nav-hidden .site-header:focus-within { transform: none; }
```

Both rules tie the hiding rules on specificity (0,3,1) and win on source order, which is why
they are declared after. Verified: with the page scrolled down and the tab bar hidden at
bottom 0px, focusing the first tab brings the bar back to bottom 129px with the correct
element focused.

## 3. Bigger, Rounded Columns

### Which was the culprit: the gap or the column count?

Measured before changing anything.

| Window | Feed | Columns | Gap | Card | Gap as % of feed | Gap as % of card |
|---|---|---|---|---|---|---|
| 1920px | 1164 | 5 | 24 | 213.6 | 8.2% | 11.2% |
| 1600px | 1164 | 5 | 24 | 213.6 | 8.2% | 11.2% |
| 1440px | 1193 | 4 | 24 | 280.3 | 6.0% | 8.6% |
| 1366px | 1119 | 4 | 24 | 261.8 | 6.4% | 9.2% |
| 1200px | 953 | 4 | 24 | 220.3 | 7.6% | 10.9% |
| 1024px | 961 | 4 | 24 | 222.3 | 7.5% | 10.8% |
| 768px | 721 | 3 | 24 | 224.3 | 6.7% | 10.7% |
| 414px | 367 | 2 | 16 | 175.5 | 4.4% | 9.1% |
| 320px | 273 | 2 | 16 | 128.5 | 5.9% | 12.5% |

**The column count was the culprit; the gap was close to a red herring.** At 1920px the four
gaps came to 96px of a 1164px feed — 8.2%. Deleting the gap *entirely* would have taken a card
from 213.6px to 232.8px, **+9%**. Dropping the fifth column takes it to 279px, **+31%**.

So the fifth column went, and the gap came down as a smaller second-order improvement
(1.5rem to 1rem on desktop, 1rem to 0.75rem on mobile). The 100rem tier is deleted rather than
lowered, since 4 is now the ceiling and 64rem upward share one rule.

### After

| Window | Columns | Gap | Card before | Card after | Change |
|---|---|---|---|---|---|
| 1920px | 5 to **4** | 24 to 16 | 213.6 | **279.0** | **+30.6%** |
| 1600px | 5 to **4** | 24 to 16 | 213.6 | **279.0** | **+30.6%** |
| 1440px | 4 | 24 to 16 | 280.3 | **286.3** | +2.1% |
| 1366px | 4 | 24 to 16 | 261.8 | **267.8** | +2.3% |
| 1200px | 4 | 24 to 16 | 220.3 | **226.3** | +2.7% |
| 1024px | 4 | 24 to 16 | 222.3 | **228.3** | +2.7% |
| 768px | 3 | 24 to 16 | 224.3 | **229.7** | +2.4% |
| 414px | 2 | 16 to 12 | 175.5 | **177.5** | +1.1% |
| 320px | 2 | 16 to 12 | 128.5 | **130.5** | +1.6% |

Gap as a share of the feed drops from 4.4-8.2% to 3.3-5.0%. Checked by eye at 1920, 1440 and
414 against the previous build: the document miniatures are visibly more readable at 1920,
which is where the complaint came from, and the whitespace between columns no longer dominates.

**The next lever, if they still read small**, is the 48-64rem band — 3 columns, 229.7px at
768px. Two columns there gives 352.5px, which is a large card for a tablet, so it is worth
looking at rather than assuming.

### Rounding

`--radius-card: 0.75rem` is a new token in `:root` rather than a magic number, and deliberately
the only one. It is applied to `.catalog-grid .card-preview`; because `.catalog-grid
.template-card` carries no background or border of its own, rounding that single box rounds the
whole card and there is no square frame left behind it.

`overflow: hidden` on the same element clips to the radius, which is what keeps the zoom and
both crossfades inside the curve. **Verified visually rather than assumed**: with a poster card
hovered — frame photograph, multiplied overlay and a 1.06 zoom all active at once — the corners
are cleanly rounded with no square flash under the mask.

## The Contradicted Documentation

The stylesheet's own header said:

> Geometry: Flat, sharp, rectangular. No gradients, no drop shadows.

Rounding the cards contradicts "sharp, rectangular" **on purpose, at the owner's instruction**.
Three places said it and all three now record the exception, so the next session does not trust
stale documentation over the CSS:

- `site/css/style.css` header — rewritten to name the exception and its scope.
- `PRD.md` line 31, the design-system statement the stylesheet header echoes.
- `docs/implementation/MOCKUP_GENERATOR_IMPLEMENTATION.md`, which quotes the header verbatim to
  justify the flat-vector product illustrations. Those illustrations are unaffected.

`docs/memory/PROJECT_STATUS.md` also quotes the theme, but only the "no gradients, no drop
shadows" half, which is still true everywhere. **CLAUDE.md carries no geometry claim** — checked
rather than assumed — so it needed no change on this point.

The scope is narrow by design: everything outside `.catalog-grid` keeps square corners, and no
gradients or drop shadows were introduced anywhere. If a second rounded surface appears, the
exception has become drift and the wording should be rewritten rather than extended.

## Verification

`npx serve` from the repository root, driven headlessly over CDP, at 1920, 1600, 1440, 1366,
1200, 1024, 768, 414 and 320px.

| Check | Result |
|---|---|
| Zoom applies on hover | Pass at 1920, 1366, 1024 (`matrix(1.06, ...)`) |
| Zoom costs no layout | Pass. Card and grid geometry identical before and after |
| Clip on container, scale on child | Pass. Preview `overflow: hidden`, media `overflow: visible` and measurably wider than the window while hovered |
| Zoom absent under `(hover: none)` | Pass under touch emulation, transform stays at identity |
| Tabs hide on scroll-down, return on scroll-up | Pass at all 9 widths |
| Hidden tabs clear the viewport | Pass. Bottom edge at exactly 0px at all 9 widths |
| Header hides on mobile only | Pass. Hidden at 768, 414, 320; `transform: none` at 1024 through 1920 |
| Keyboard focus reaches a scrolled-away tab | Pass. Bar returns from bottom 0px to 129px, correct element focused |
| No horizontal scroll | Pass at all 9 widths, including while zoomed |
| Column ladder and row alignment | Pass. 4 / 4 / 4 / 4 / 4 / 4 / 3 / 2 / 2 with 0 misaligned rows |
| Rounded corners with the hover crossfades | Pass, confirmed by screenshot on the poster, mug and photo cards |
| Category filtering still works | Pass. 6 / 3 / 3 / 4 / 16 |
| Full site suite | `node tests/verify-layout.js --no-baseline` — 388 passed, 0 failed |
| Launch flow and card anchors | Pass. Plain, ctrl and middle click; 16/16 crawlable anchors; `data-doc` preset intact |

One method note for whoever re-runs this. Two harness traps cost real time and are worth
knowing:

- **`Emulation.setTouchEmulationEnabled` with `maxTouchPoints` alongside `enabled: false` still
  makes the page report a touch device**, which turns `(hover: hover)` off and silently disables
  every hover rule under test. Only send the argument when actually emulating touch.
- **A synthetic mouse move must not be aimed using coordinates read in the same round trip as a
  `scrollIntoView`.** Chrome has not committed the scroll, so the pointer lands at the old
  offset and hovers nothing. Scroll, settle, then read the rect — and wait for the hovered state
  as a condition rather than on a fixed timer, so a genuinely broken rule still fails.

## Related Documents

- `docs/implementation/HOMEPAGE_FEED_REWORK.md` — the grid, the card-as-link and the hover
  crossfades this builds on
- `docs/implementation/FIXED_FULL_HEIGHT_AD_RAIL.md` — the ad rail whose inset depends on the
  header staying in normal flow
- `docs/guides/RUNNING_THE_VERIFICATION_SUITE.md` — how to re-run the site suite
