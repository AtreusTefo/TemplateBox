# Dark Mode

Date: August 11, 2026
Files changed: `site/css/style.css`, `site/js/app.js`, 24 HTML pages, `tests/verify-layout.js`

A site-wide dark theme with an explicit toggle, applied to every page that loads the
stylesheet — not a homepage feature.

## The Premise Was Wrong, and It Mattered

The brief said a spot check suggested every rule references tokens rather than hardcoding hex,
and asked me to confirm before relying on it. **It does not hold.** Auditing every colour
literal outside `:root` found **45 hardcoded values across 42 lines** (four more are in the
header comment). They fall into four groups, and each needed a different answer:

| Group | Examples | Decision |
|---|---|---|
| **Document sheets** — `.resume-sheet`, `.doc-sheet` and their descendants | `#FFFFFF` grounds, `#1A1A1A` ink, `#6B6B66` labels, `var(--accent)` headings | Stay light. They depict printed paper |
| **Feed miniatures** — `.mock-doc` and its `--mk-accent` variants | `#1F4E79` navy, `#2E5E4E` forest, `#8A5A2B` brand | Stay light, same reason |
| **Artwork and product colour** — poster plates and frames, `.mk-shape.tee/mug/box`, `.mk-art` | `#DAD6CE`, `#B5352E`, `#C48A4A` | Unchanged in both themes. These are content, like a photograph |
| **Status colour** — `.save-state`, `.form-error` | `#2E5E4E`, `#8A1F1F` | **Tokenized.** A forest green and a deep red are unreadable on a dark ground |

Only the last group was a genuine gap. The first two turned out to be a feature rather than a
problem — see below.

## Token Architecture

Every colour is written **once**, as an `--l-*` / `--d-*` source pair in `:root`. Nothing in
the stylesheet reads those directly; rules read a `--color-*` alias, and switching theme only
re-points the aliases:

```css
:root {
    --l-bg: #F4F3EF;   --d-bg: #14130F;
    --l-text: #1A1A1A; --d-text: #F2F0EA;
    /* ... */
    --color-bg: var(--l-bg);
    --color-text: var(--l-text);
}

:root[data-theme="dark"] {
    --color-bg: var(--d-bg);
    --color-text: var(--d-text);
}
```

A colour change is therefore a one-line edit in one place, and the alias blocks stay purely
mechanical. **`--accent` is deliberately not themed** — it is the resume editor's per-document
ink colour, it lives on a paper sheet, and the brief required it stay independent. All ten of
its use sites were checked and every one is inside `.resume-sheet` or `.doc-sheet`.

### The dark palette is not an inversion

Warm near-black, chosen to keep the cream/charcoal character. Contrast measured in-page against
the real computed values rather than eyeballed:

| Token | Value | Contrast on `--d-bg` |
|---|---|---|
| `--d-text` | `#F2F0EA` | **16.3:1** |
| `--d-muted` | `#A8A59B` | **7.7:1** |
| `--d-brand` | `#C8925A` | **6.9:1** |
| `--d-ok` | `#6FBF9B` | **8.7:1** |
| `--d-warn` | `#FF9A8A` | **9.2:1** |
| `--d-border-strong` | `#6B665A` | **3.05:1** on `--d-card` |

`--d-border-strong` is the one tuned to a threshold rather than for comfort: it draws form
input boundaries, and WCAG 1.4.11 wants 3:1 for those. `--d-border` is deliberately subtle
(1.48:1) because the flat, shadowless design uses borders as hairline separators — the light
theme's equivalent is 1.26:1, so dark is if anything slightly more visible.

`color-scheme` is set alongside the palette so native controls, scrollbars and form widgets
follow.

## Paper Surfaces Never Go Dark

The single judgement call in this change, flagged because it is the one place I decided
something the brief did not specify.

`.resume-sheet`, `.doc-sheet` and `.mock-doc` depict **printed paper**. Their grounds and ink
were already hardcoded light, but their *descendants* read `--color-*` like everything else —
labels, table headers, rules, the navy and forest document accents. A blind swap would have put
light-grey labels and `#1F4E79` headings onto white paper.

Rather than rewriting those component rules, the light palette is re-declared at the top of
each paper surface:

```css
:root[data-theme="dark"] .mock-doc,
:root[data-theme="dark"] .resume-sheet,
:root[data-theme="dark"] .doc-sheet {
    --color-text: var(--l-text);
    --color-muted: var(--l-muted);
    /* ... */
}
```

One block, no component touched, and it stays correct automatically if the dark palette
changes. Measured on every page carrying a sheet: ground `rgb(255,255,255)`, ink
`rgb(26,26,26)`, **17.4:1**.

This is also what makes the feed read well in dark mode — white document miniatures on a
near-black ground, which is closer to how the products actually look than a dark receipt would
be.

## The Three States, and No Flash

```
1. Never toggled, OS prefers dark   -> @media (prefers-color-scheme: dark)
2. Never toggled, OS prefers light  -> the :root defaults
3. Toggled                          -> data-theme on <html>, explicit block wins
```

Every page carries a small synchronous script in `<head>`, immediately before the stylesheet
link:

```js
var saved = window.localStorage.getItem("tb_theme");
var dark = saved ? saved === "dark"
                 : window.matchMedia("(prefers-color-scheme: dark)").matches;
document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
```

**Inline and synchronous by necessity** — an external file loads after the first paint, and the
flash is exactly what this prevents. It runs before `<body>` is parsed, so the attribute is set
before anything renders.

Two details that are easy to get wrong:

- **The media query is `:root:not([data-theme])`**, matching only when the attribute is
  *absent*. Since the script always writes an explicit value, that branch in practice serves
  visitors with JavaScript disabled. Writing it as `:not([data-theme="light"])` would have been
  equivalent for them but would leave no way to distinguish "no opinion" from "chose light".
- **The toggle always writes an explicit value and never removes the attribute.** An absent
  attribute means "follow the OS", so removing it would overrule a visitor who deliberately
  chose light on a dark-set machine.

## The Toggle

A real `<button>` in the header, last child of `.site-nav` where one exists so it joins the
existing right-hand group rather than becoming a fourth flex child and redistributing the
header. `loading.html` has no nav, so there it is the last child of the header itself.

Its accessible name states the **action**, not the icon — "Switch to dark theme" / "Switch to
light theme" — and `js/app.js` updates it on every toggle. Two inline SVGs follow the site's
flat icon convention (`stroke: currentColor`, no fill, square joins, matching the wordmark and
the footer social row); CSS shows the one for the theme the button would switch *to*.

`tools/og-image.html` has a header but does not load `js/app.js`, so it gets the theme script
but **not** the button — an unwired control is worse than none.

## Print Is Not Themed

The print block re-points the aliases back to the light palette before anything else:

```css
@media print {
    :root, :root[data-theme], :root[data-theme="dark"] { --color-text: var(--l-text); /* ... */ }
}
```

Without this, a visitor printing a receipt in dark mode would send a near-white `--color-text`
onto white paper and get a nearly blank page. Verified under emulated print media *with the
screen theme set to dark*: body renders `rgb(255,255,255)` on `rgb(26,26,26)` ink, 17.4:1, on
`docs.html`, `resume.html` and `index.html`.

## Drift Guards

Two things in this change are duplicated by necessity, and both are now asserted by
`tests/verify-layout.js` rather than trusted:

- **The dark palette is declared twice** — once for `data-theme="dark"` and once for the
  no-JavaScript `prefers-color-scheme` fallback. CSS cannot share one declaration block between
  them. A colour added to one and not the other would show up only for the half of visitors
  hitting the other branch. Section 1 compares the two blocks declaration by declaration.
- **`tb_theme` is spelled in `js/app.js` and in 24 inline snippets.** The snippet cannot import
  the key — it has to run before any external file. A rename on one side would silently give
  every returning visitor a flash of the wrong theme. Section 1 checks every themed page
  carries the snippet and that its key matches `THEME_KEY`.

Plus a check that the print block still resets the palette.

**All four were mutation-tested** — broken deliberately, confirmed failing, restored:

| Mutation | Caught by |
|---|---|
| One dark block given a different value | "the two dark-theme declaration blocks are identical" |
| `THEME_KEY` renamed in `app.js` only | "every no-flash snippet uses the same key" |
| A page shipped without the snippet | "every themed page carries the no-flash snippet (24 pages)" |
| Print block stops resetting the palette | "the print block resets the palette to the light aliases" |

## A Regression This Caught

Adding the toggle to `.site-nav` pushed the mega-menu panel **5px off the left edge at 1200px**.
The panel was `position: absolute; right: 0` inside `.nav-more`, so its left edge depended on
how many controls happened to sit to its right — and it had only 3px of margin at 1024px even
before the toggle existed.

Fixed at the cause rather than the symptom: `.nav-more` is no longer a positioning context, so
the panel anchors to `.site-header` (which is `position: sticky`, and therefore a containing
block), inset by the header's own gutter and clamped with
`max-width: calc(100% - 2 * var(--space-lg))`. `min-width: 52rem` became `width: 52rem`,
because **min-width beats max-width when they conflict** and a min-width panel cannot be clamped
at all.

Left edge after the fix: 145px at 1200, 153px at 1024, 725px at 1920 — comfortably on screen
everywhere, and now independent of what else sits in the nav.

## Verification

`npx serve` from the repository root, driven headlessly over CDP. Contrast ratios computed
in-page from the real computed values.

| Check | Result |
|---|---|
| OS preference honoured when never toggled | Pass, both directions |
| Explicit choice beats the OS | Pass — choosing light on a dark-set OS survives reload |
| Persists across reload and across pages | Pass |
| No flash of the wrong theme | Pass on all 9 page types: the attribute reads `dark` at the earliest observable moment |
| Dark palette across page types | Pass on index, 4 editors, loading, about, blog, a landing page — 16.3:1 text, 6.9-15.0:1 header nav |
| Document sheets stay light | Pass — white ground, `#1A1A1A` ink, 17.4:1 |
| Ad rail and banners legible | Pass — label 6.92:1, containers adapt |
| Print unaffected by screen theme | Pass on 3 pages under emulated print media |
| Full site suite | 393 passed, 0 failed |
| Feed, launch flow, a11y checks | All pass, unchanged |

## One Thing to Know

**An unfilled ad iframe is a bright white rectangle in dark mode.** The container adapts
correctly — rail `#1D1C17`, slot ground `#14130F`, label at 6.92:1 — but the creative itself is
a cross-origin document whose own canvas paints white, and nothing on our side can style it. In
light mode it blends; in dark it is a light block. With a real ad filling the frame this is
whatever the advertiser served, exactly as on any dark-themed site. Left as-is deliberately:
forcing a light container would only change the blank state, and dimming third-party creatives
is not something to do without thinking about the ad terms.

## Related Documents

- `docs/guides/RUNNING_THE_VERIFICATION_SUITE.md` — how to re-run the checks above
- `docs/implementation/FEED_HOVER_ZOOM_HIDE_ON_SCROLL_ROUNDED_CARDS.md` — the header the toggle
  joins, and the scroll-direction utility beside which the theme toggle is registered
