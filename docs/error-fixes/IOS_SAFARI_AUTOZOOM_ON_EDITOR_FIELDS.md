# iOS Safari Zooms the Page In When an Editor Field Takes Focus

Date: August 20, 2026

## Issue Title

Twenty-seven text-entry fields across the four editors compute to a font-size
below 16px on a phone. iOS Safari zooms the whole viewport in when such a field
receives focus, and does not zoom back out on blur -- so a visitor filling in a
form is left at roughly 1.2x with the layout overflowing sideways, once per
field, on pages whose entire purpose is filling fields in.

Carried as an open item in `docs/memory/PROJECT_STATUS.md` ("confirm no input
auto-zoom") from the PRD's mobile-device checklist. It had never been measured;
this is the first pass that did.

## Root Cause

iOS Safari's auto-zoom is a device behaviour with a hard threshold: a
text-entry field whose *computed* font-size is under 16px triggers it. There is
no viewport-meta way to switch it off that is not also destructive --
`maximum-scale=1` or `user-scalable=no` disables pinch-zoom entirely, which is
a WCAG 1.4.4 failure and worse than the problem. The only non-destructive fix
is 16px.

`site/index.html` and every editor already ship the correct, non-destructive
viewport tag (`width=device-width, initial-scale=1.0`) with no scale lock, so
the tag was never the fault -- verified, not assumed.

The stylesheet has no global form reset (no `input, select, textarea { font:
inherit }`), so fields fall to whatever rule matches or, failing that, to the
user-agent default of about 13.3px. The main editor forms were fine --
`.field input, .field textarea, .field select` is `font-size: 1rem` -- which is
why this was never obvious. What was missed is everything outside `.field`:
document-name inputs, and the poster and mockup toolbars, which were styled for
desktop density.

Measured at 390px before the fix, counting only field types that trigger the
zoom (`select`, `textarea`, and text-like `input` types; `color` and `range`
excluded because neither triggers it):

| Page | Fields under 16px | Visible without opening a panel |
|---|---|---|
| resume.html | 1 | 1 |
| docs.html | 1 | 1 |
| poster.html | 19 | 12 |
| mockup.html | 6 | 2 |

Breakdown:

- `.doc-name` at 0.9375rem (15px) -- on **all four** editors. One pixel short.
- poster `.text-toolbar select` / `input[type=number]` at 13px -- font, size,
  align, list.
- poster `.tt-adv-panel input` / `select` -- letter spacing, line height,
  anchor, box width, x, y, opacity. These inherit the UA default; they have no
  font-size of their own.
- poster `.dl-panel select` / `input[type=password]` at 13px -- the seven
  export controls, behind a panel.
- mockup `.color-input-cell input` at 12px -- hex, R, G, B.
- mockup `.size-number input` at 13px -- scale.

## Fix Applied

One block in `site/css/style.css`, added immediately before the print block so
it wins specificity ties on source order:

```css
@media (max-width: 48rem) {
    .doc-name,
    .dl-panel select,
    .dl-panel input,
    .dl-panel input[type="password"],
    .text-toolbar select,
    .text-toolbar input,
    .text-toolbar input[type="number"],
    .tt-adv-panel input,
    .tt-adv-panel input[type="number"],
    .tt-adv-panel select,
    .caption-row textarea,
    .color-input-cell input,
    .color-input-cell input[type="number"],
    .size-number input,
    .size-number input[type="number"] {
        font-size: 1rem;
    }
}
```

Three decisions worth keeping:

- **Scoped to the phone breakpoint.** These are dense desktop toolbars whose
  proportions are deliberate at full width, and the behaviour being defended
  against exists only on touch devices. Bumping them everywhere would trade a
  real mobile fault for a real desktop regression.
- **The `[type="..."]` variants are listed alongside the bare element
  selectors.** Several of the rules being overridden are themselves attribute
  selectors (`.color-input-cell input[type="number"]`,
  `.size-number input[type="number"]`), which outrank a bare tag selector
  regardless of source order.
- **Colour and range inputs are deliberately absent.** Neither is a text-entry
  field and neither triggers the zoom, so including them would only widen
  controls for nothing.

## Testing Steps

`tests/verify-layout.js` section 2e loads each of the four editors plus the
homepage at 390px and asserts that no `select`, `textarea` or text-like
`input` computes below 16px. After the fix: zero on all five pages.

**Reflow was the risk and was measured, not assumed.** Raising a 13px control
to 16px widens it, and the poster toolbar is the densest layout on the site.
The full overflow sweep -- 12 page families at 320, 360, 390, 414, 768, 769,
1024, 1199, 1200, 1280, 1366, 1440, 1488 and 1920px, 168 combinations --
reports zero horizontal overflow after the change, the same as before it.

Full suite: 902 passed, 0 failed.

**Mutation-tested** by removing `.doc-name` from the selector list: fails on all
four editors.

## Troubleshooting

- **A new field zooms.** It is outside `.field` and outside this list. Either
  give it `.field` styling or add it here. Section 2e will catch it first.
- **Do not "fix" this with `maximum-scale=1` or `user-scalable=no`.** It
  disables pinch-zoom for everyone, fails WCAG 1.4.4, and is worse than the
  behaviour it suppresses.
- **A control overflows its toolbar on a phone after being added here.** Let
  the toolbar wrap or scroll; do not drop back below 16px. Re-run the overflow
  sweep rather than eyeballing one width.
- **15px is not close enough.** `.doc-name` was 15px and zoomed. The threshold
  is exact.

## Related Files

- `site/css/style.css` -- the 16px block, immediately before `@media print`
- `tests/verify-layout.js` -- section 2e
- `site/poster.html`, `site/mockup.html` -- the two dense toolbars
- `docs/memory/PROJECT_STATUS.md` -- the mobile-device checklist open item
