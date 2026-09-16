# The Mega-Menu Panel Scrolls Instead of Running Off the Screen

Date: September 16, 2026

## Summary

The header "More" panel now has a height cap and scrolls internally. Before
this it simply overflowed the window, and because of how it is positioned the
overflow could not be scrolled to at all -- the bottom of the menu was
unreachable on any laptop-height screen.

What that stranded was `.nav-more-social`. Since the footer was folded into
this menu on August 13, 2026 (`FOOTER_TO_MEGA_MENU.md`), that row is the only
route to the site's social links anywhere.

## The measurements

On `about.html` at 1440x900, panel open:

| | |
| --- | --- |
| panel height | 1121px |
| panel top | y=96 |
| viewport height | 900px |
| foot of panel | 317px past the bottom edge |
| `max-height` | `none` |
| `overflow-y` | `visible` |

And it could not be scrolled into view. `.site-header` is `position: sticky`
and the panel is `position: absolute` against it, so scrolling the page moves
the document underneath a panel that stays put: measured, the panel's top was
still at y=96 after scrolling 600px, and its last row still at y=1105.

## Three bands, not two

The task this came from assumed the panel behaved one way above 62rem and
another below. It is three bands, and the middle one is the awkward one:

| Width | Nav | Panel rule | State before this change |
| --- | --- | --- | --- |
| >= 75rem | inline | base grid | overflowed, unreachable; rail present, no anchor |
| 62 - 74.9375rem | burger | base grid | overflowed, **and** a fixed anchor at the foot |
| < 62rem | burger | `max-height: 75vh` + `overflow-y: auto` | already capped |

The collapse breakpoint is **74.9375rem**, not 62rem -- the same line the
rail's floor uses. So the burger band and the anchor band overlap, and the
panel there has both a header that grows a second row when opened and a fixed
banner at the bottom of the window.

## The fix

```css
.nav-more-panel {
    --nav-more-gap: 0.75rem;
    top: calc(100% + var(--nav-more-gap));

    max-height: calc(100vh  - var(--header-h, 5.25rem) - var(--nav-more-gap)
        - var(--space-lg) - var(--anchor-h, 0px));
    max-height: calc(100dvh - var(--header-h, 5.25rem) - var(--nav-more-gap)
        - var(--space-lg) - var(--anchor-h, 0px));
    overflow-y: auto;
    overscroll-behavior: contain;
}
```

**One token ties `top` to `max-height`.** The panel hangs `--nav-more-gap`
below the header, so that is exactly the room it loses. Making it a token
means an offset changed in one place cannot leave the height silently wrong.
The `<62rem` rule sets it to `0px`, because that variant uses `top: 100%`.

**`--header-h` is measured, never assumed.** `initHeaderHeight()` in
`js/app.js` republishes it through a `ResizeObserver`, so the cap tracks the
header growing a second row on burger widths. Verified: at 1100x700 with the
burger open the header measures 290px, `--header-h` reads `290px`, and the
panel sizes to 374px. A hardcoded header height is explicitly forbidden by
`CLAUDE.md` for exactly this reason.

**Two `max-height` lines, `vh` then `dvh`.** The rule this replaced used a
flat `75vh` on phones, and that was conservative slack absorbing a mobile URL
bar. An exact `vh`-only calc would have removed the slack and made the panel
taller than the visible area while the bar shows -- a regression on the one
form factor that already worked. `dvh` is the right tool and the `vh` line
above it is the fallback.

**`overscroll-behavior: contain`** because the panel is a scroller inside a
page that also scrolls; without it, reaching the end of the menu hands the
wheel to the document and the page lurches behind an open menu.

### The anchor allowance is derived, not copied

`--anchor-h` is set only by `body.has-site-anchor` / `body.has-ad-anchor` --
on the very rules that reserve the page's bottom padding for a mounted anchor:

```css
body.has-site-anchor {
    --anchor-h: 4.75rem;
    padding-bottom: var(--anchor-h);
}
```

All four reservations were rewritten this way. The computed values are
unchanged, so the suite's existing `anchor reservation matches the mounted
unit` check -- which reads the browser's computed `padding-bottom`, not the
stylesheet text -- still validates them. The point is that the panel now
subtracts **the same declaration** the page reserves, so the two cannot drift.
That is stronger than duplicating the number and adding a check that they
agree.

Verified: with an anchor mounted at 1440x900, `--anchor-h` computes to
`7.25rem`, `padding-bottom` to `116px`, and the panel shrinks by exactly
116px, finishing 25px above the anchor's top edge.

## The z-index that did nothing

The `<62rem` rule carried `z-index: 40` with the comment *"Above the fixed ad
anchor (z-index 30), or the foot of the panel would sit behind the banner on a
phone."*

**It could not do that, and never did.** `.site-header` is `position: sticky;
z-index: 20`, which makes it a stacking context. Every z-index inside it is
resolved among the header's own children, and the header as a whole paints
below the anchor's 30. No value on the panel can escape its ancestor.

Measured directly, with the panel forced over a stand-in anchor and
`elementsFromPoint` sampling who paints on top:

| Panel z-index | Top element |
| --- | --- |
| 30 | `site-anchor is-filled` |
| 40 | `site-anchor is-filled` |
| 999 | `site-anchor is-filled` |

Confirmed at 1440px and at 375px; the header creates a stacking context at
both widths.

The declaration was **removed** rather than corrected in place. A declaration
that does nothing while claiming to is worse than no declaration, because the
next person reads it and believes the case is handled. Subtracting `--anchor-h`
is what actually keeps the panel off the anchor.

## Verification

Measured after the change, panel open, last row scrolled to and hit-tested:

| Viewport | Nav | Panel | Clearance | Notes |
| --- | --- | --- | --- | --- |
| 1920x1080 | inline | 959px | 25px | clear of rail |
| 1440x900 | inline | 779px | 25px | social link clickable |
| 1200x800 | inline | 679px | 25px | clear of rail |
| 1100x700 | burger | 374px | 25px | header measured at 290px |
| 375x667 | burger | 277px | 26px above a real anchor | `--anchor-h` applied |

No page scrolls horizontally at any of them, and the header's right edge still
lands on the rail's left edge where a rail is up.

### The checks, and what breaking them proved

Section 2b already opened the panel at four widths and asserted it was on
screen, clear of the rail column, and clickable -- **at its top**. It never
asked whether the bottom could be reached, which is why this survived.

Three assertions were added per width: the panel opens at all, its foot is on
screen and its last row is reachable, and it stops above a mounted anchor.
Scrolling the panel to its end and hit-testing the last row is deliberately
stronger than a bounds check, since a panel that fits by being clipped would
pass "does the box fit" and still lose its last row.

Removing the height cap -- the exact pre-fix state -- produced:

```
FAIL  homepage mega-menu @1920: its foot is on screen and reachable
FAIL  homepage mega-menu @1440: its foot is on screen and reachable
FAIL  homepage mega-menu @1366: its foot is on screen and reachable
FAIL  homepage mega-menu @1200: its foot is on screen and reachable
FAIL  homepage mega-menu @1100: its foot is on screen and reachable
FAIL  homepage mega-menu @1100: stops above a mounted anchor
FAIL  homepage mega-menu @375:  its foot is on screen and reachable
FAIL  homepage mega-menu @375:  stops above a mounted anchor
FAIL  mockup editor mega-menu @375: its foot is on screen and reachable
FAIL  mockup editor mega-menu @375: stops above a mounted anchor
```

### The first attempt at those checks was worth nothing

On the first run the anchor assertion was **not caught**. Section 2b ran only
at 1920, 1440, 1366 and 1200, and the anchor's ceiling is 74.9375rem -- so
there was no anchor at any width it tested and the check passed vacuously at
all four. It could never have failed.

1100 and 375 were added for that reason, which also extended the panel's
coverage into the burger band. Doing so required teaching section 2b to open
the burger first: below 74.9375rem `.nav-more` is `display: none`, so clicking
the More toggle inside it yields a zero-height panel and a run of false
failures. It checks `.nav-more`'s computed display rather than the width,
because the width at which it collapses is a fact about the stylesheet and
repeating it in the test would be a second copy of it.

A `the panel opens at all` assertion was added alongside, so a zero-height
panel fails loudly instead of being stepped over the way a genuinely absent
menu is.

### And then those checks failed, and the code was right

The first full run with 1100 and 375 in the sweep failed six checks -- both new
assertions at both burger widths, plus the mockup editor at 375. The panel was
overflowing, at widths verified by hand minutes earlier as fitting.

The arithmetic identified it. At 1100 the panel measured 662px tall, and
`900 - 85 - 12 - 24 - 116` is 663: the numbers of an **85px header**. But the
panel was hanging below a 302px one. It had been positioned against the grown
header and sized against the old one.

Opening the burger grows the header by a whole row, and `--header-h` is
republished from a `ResizeObserver`, which is asynchronous. Measuring in the
same tick as the click reads the previous value. The CSS was correct and the
stopwatch was started too early -- the same fault this very section already
documents for its scroll check, where two `requestAnimationFrame`s after a
`scrollTo` caught the header mid-transition and failed about one run in three.

The check now polls until the published `--header-h` equals the header's
rendered height before measuring anything, which is deterministic regardless of
how long the observer takes.

Worth stating plainly because the instinct runs the other way: **six failing
assertions across two widths looked like a broken fix, and the fix was fine.**
The thing to reach for is the arithmetic -- if the measured height is exactly
what some *other* input would produce, the measurement is reading the wrong
input rather than the code producing the wrong output.

## Related files

- `site/css/style.css` -- `.nav-more-panel` base rule, the `<62rem` variant, the four anchor reservations
- `site/js/app.js` -- `initHeaderHeight()`, which publishes `--header-h`
- `tests/verify-layout.js` -- section 2b
- `docs/implementation/FOOTER_TO_MEGA_MENU.md` -- why the social row is only in this panel
