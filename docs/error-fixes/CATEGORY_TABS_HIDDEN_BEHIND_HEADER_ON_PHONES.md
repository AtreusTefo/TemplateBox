# Category Tabs Painted Over by the Site Header on Every Phone Width

Date: August 20, 2026

## Issue Title

On `index.html`, the sticky category tab row (`.feed-tabs`) is completely
covered by `.site-header` at every viewport below roughly 600px whenever the
header is visible and the page is scrolled. Filtering -- a primary action on
the site's most-indexed page -- is invisible and untappable on phones.

Reported indirectly: `docs/memory/PROJECT_STATUS.md` recorded that "below 48rem
the header can exceed 200px on the narrowest phones and the 76px reserved there
already undershoots", noted the mismatch predated the August 14 hide-on-scroll
work, and left it open. It was described there as the tabs "only partially
closing the gap". That description is wrong in a way worth recording: there is
no gap. The tabs are behind the header.

## Root Cause

`.site-header` is `display: flex` with `flex-wrap: wrap`, carrying a wordmark,
a search box and five nav controls. Its height is therefore a function of how
its contents wrap, not of the viewport width. Measured on `/` with the served
CSS:

| Viewport | `.site-header` height |
|---|---|
| 320px | 201px |
| 360px | 145px |
| 390px | 145px |
| 414px | 145px |
| 480px | 145px |
| 600px | 85px |
| 768px | 85px |
| 1024px and above | 85px |

`.feed-tabs` is `position: sticky` with a literal offset -- `top: 5.25rem`
(84px), overridden to `top: 4.75rem` (76px) below 48rem. The row is 45px tall,
so once the page is scrolled it pins at 76-121px on a phone. The header
occupies 0-145px there (0-201px at 320px), so the tab row is entirely inside
the header's box. `.site-header` is `z-index: 20` and `.feed-tabs` is
`z-index: 15`, so the header paints over it.

Measured before the fix, scrolling down and then part-way back up so the header
is revealed while the page is still scrolled:

| Viewport | header height | tabs top | tabs bottom | overlap | `elementFromPoint` at the tab row's centre |
|---|---|---|---|---|---|
| 320px | 201 | 76 | 121 | 45px (full height) | inside `.site-header` |
| 360px | 145 | 76 | 121 | 45px (full height) | inside `.site-header` |
| 390px | 145 | 76 | 121 | 45px (full height) | inside `.site-header` |
| 414px | 145 | 76 | 121 | 45px (full height) | inside `.site-header` |
| 480px | 145 | 76 | 121 | 45px (full height) | inside `.site-header` |
| 600px | 85 | 76 | 121 | 9px | `a.tab` |
| 768px | 85 | 76 | 121 | 9px | `a.tab` |
| 1024px+ | 85 | 84 | 129 | 1px | `div.feed-tabs-scroll` |

Two smaller instances of the same fault are visible in that table and were
fixed by the same change: a 9px overlap at 600-768px, and the 1px overlap on
desktop that `PROJECT_STATUS.md` already recorded as "1px off the 84px the
desktop offset reserves".

**Why it survived the August 14 verification.** That pass checked the *hidden*
state -- that the tabs rise to land flush at y=0 as the header retracts -- and
that check passes at every width, before and after this fix, because the hide
transform and the sticky offset were the same literal and cancelled exactly.
The broken state is the opposite one: header *revealed* while scrolled. It was
never measured.

## Fix Applied

The header's height is measured and published as a CSS custom property; every
offset calibrated to "just under the header" reads that property instead of a
literal.

**`site/js/app.js`** -- new `initHeaderHeight()`, registered in the
`DOMContentLoaded` boot list immediately before `initScrollDirection` (the hide
transform reads the property, so it must be published first). It writes
`--header-h` onto `document.documentElement` from
`.site-header.getBoundingClientRect().height`, rounded up so no sub-pixel seam
shows, and keeps it current with a `ResizeObserver` on the header. A
`ResizeObserver` rather than a `resize` listener because the height changes
whenever the header's *contents* rewrap -- web fonts landing and the search box
appearing at 62rem both do that without firing a `resize` event.

**`site/css/style.css`** -- three literals replaced:

- `.feed-tabs { top: 5.25rem }` becomes `top: var(--header-h, 5.25rem)`
- the `@media (max-width: 48rem)` override `top: 4.75rem` becomes
  `top: var(--header-h, 4.75rem)`
- the hide transforms `translateY(-5.25rem)` / `translateY(-4.75rem)` become
  `translateY(calc(-1 * var(--header-h, 5.25rem)))` and the 4.75rem equivalent

The fallbacks are the previous literals deliberately. If `js/app.js` fails to
load or throws before the boot list reaches this init, every offset resolves to
exactly what it was before, so the page degrades to the previous behaviour
rather than to a broken one. This follows the same reasoning as
`loading.html`'s dependency-free countdown fallback.

The mobile `@media` block is kept rather than collapsed into the base rule
solely to carry the smaller 4.75rem fallback for the no-JavaScript path.

## Testing Steps

`tests/verify-layout.js` section 2d, at 320, 360, 390, 414, 768, 1024, 1366 and
1920px, drives a real scroll sequence (down past the hide threshold, then
part-way back up so the header is revealed while scrolled) and asserts:

1. `header.bottom - tabs.top <= 0.5` -- no overlap, and
   `elementFromPoint` at the tab row's centre resolves to something *not*
   inside `.site-header`.
2. Scrolled down again with the header hidden, the tabs land within 0.5px of
   y=0 -- the August 14 property, preserved.

Measured after the fix, same probe as the table above: overlap 0.0px at all
eight widths, `elementFromPoint` returns `a.tab` on every phone width, and
`hiddenTabsTop` is 0 at all eight.

Full suite: 902 passed, 0 failed (881 before these 21 checks were added).

**Both checks were mutation-tested.** Restoring the `top` literals while
leaving the transforms reading `--header-h` failed 16 checks across all eight
widths. That mutation is not a perfect inverse of the fix -- it leaves the two
halves inconsistent -- but it exercises both assertions, which is what the
check is for.

## Troubleshooting

- **The tabs sit too low, with a strip of page between them and the header.**
  `--header-h` is being published larger than the header renders. Check that
  nothing else on the page writes that property, and that the rounding in
  `publish()` is `Math.ceil` on the border-box height.
- **The tabs are behind the header again on a phone.** Confirm
  `initHeaderHeight` still appears in the boot list in `js/app.js`, and that it
  is registered *before* `initScrollDirection`. If `js/app.js` throws in an
  earlier init, the per-init `try/catch` means later inits still run, so check
  the console for a throw rather than assuming the file failed to load.
- **A new sticky element needs to clear the header.** Use
  `var(--header-h, <literal>)`, never a bare literal. The header's height is
  not derivable from the viewport width.
- **Do not give `.site-header` a height.** Pinning it would fix the symptom and
  break the wrapping that lets five nav controls fit at 320px, which is what
  the `flex-wrap: wrap` rule and its August 13 comment exist for.

## Related Files

- `site/js/app.js` -- `initHeaderHeight()` and the boot list
- `site/css/style.css` -- `.feed-tabs` sticky offset and the two hide transforms
- `tests/verify-layout.js` -- section 2d
- `docs/memory/PROJECT_STATUS.md` -- the August 14 hide-on-scroll entry, which
  recorded the undershoot as a known open mismatch
