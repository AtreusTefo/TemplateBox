# Search Page: Header Hidden Below the Rail Floor, Back Control Added

Date: September 18, 2026
Files: `site/search.html`, `site/css/style.css`, `site/js/search.js`

## Summary

`search.html` no longer shows the site header below 75rem. The search field
owns the top of the viewport on phones and tablets, and a back control sits to
its left. At 75rem and above nothing changes: the header is present exactly as
on every other page, and the back control is hidden.

The field is this page's entire purpose. On a phone the header is 145px at
390px and 201px at 320px -- a third of a small viewport spent on navigation,
above a control the visitor came here specifically to type into.

## The gate is 74.9375rem, and it is not a new number

75rem is this project's existing definition of "not a desktop". The site anchor
runs to 74.9375rem, the ad rail begins at 75rem, the two bands are documented as
meeting exactly, and `.site-nav` already collapses to a burger on the same seam.
Reusing it means the header cannot disagree with the ad layout, or with its own
burger, about what a tablet is.

That the burger band and the hidden-header band are identical is the point: the
navigation this removes on a tablet was already collapsed behind a hamburger,
not visible links.

## The header is hidden, not removed

An earlier working-tree attempt deleted the `<header>` from `search.html`
outright. That is wrong for two reasons, both of which are silent:

1. **Section 1o of the suite requires every public page to be able to host the
   backup and restore controls.** It scans `site/*.html` for
   `data-nav-more-panel` or `class="editor-actions"`, exempting only
   `admin.html`, `loading.html` and `offline.html`. A header-less `search.html`
   is reported as hostless, and a visitor there is offered no backup at all.

2. **Section 2d dereferences `.site-header` without a null check.** It reads
   `document.querySelector('.site-header').getBoundingClientRect()` at eight
   widths; with the element gone that throws a TypeError rather than failing a
   check, so the section dies instead of reporting.

With the header present and `display: none`, both hold. Section 2d's contract
is still genuinely satisfied rather than dodged: a hidden header has a zero
rect, so the measured overlap with the bar is 0, and `elementFromPoint` at the
bar's centre lands inside the bar.

## `top: 0` is explicit, and cannot be left to `--header-h`

`.search-page-bar` is sticky at `top: var(--header-h, 5.25rem)`. The obvious
assumption is that a hidden header publishes `--header-h: 0px` and the bar
therefore pins itself to the top on its own. It does not.

`initHeaderHeight()` in `js/app.js` guards its write with `if (h > 0)`. A
`display: none` header measures 0, so the property is never published and stays
UNSET -- and an unset custom property falls back to the second argument. The bar
would pin itself at the 5.25rem desktop literal, 84px down the page, with
nothing above it.

`main`'s own `padding-top: 2.5rem` is the same shape of problem, so
`.search-page` drops it inside the same media query. Both are stated
explicitly rather than inferred:

```css
@media (max-width: 74.9375rem) {
    body:has(.search-page) .site-header { display: none; }
    .search-page { padding-top: 0; }
    .search-page-bar { top: 0; }
}
```

`body:has(.search-page)` is safe to scope this way because `.search-page` is
used on exactly one page; a second use would silently take that page's header
with it.

## The bar is a flex row, and the form needs `min-width: 0`

`.search-page-bar` was the `<form>` itself. It is now a flex row holding the
back control and a `.search-page-form`, so the two stay on one line and stick
together.

`.search-page-form` carries `min-width: 0`. A flex child defaults to
`min-width: auto` and refuses to shrink below its content's minimum -- the same
default that pushed the invoice line-item table out of its grid track and
scrolled the whole page sideways at 320px. The field inside carries a 44rem
`max-width`, so without it the form wins the row and the back control is
squeezed instead.

The `display: none` that hides the back control at 75rem is declared AFTER its
base `display: inline-flex`. A media query carries no specificity, so written
before it, it would simply lose -- the trap already recorded for the rail's gate
and for the editor backup row.

## Back behaviour

The control is a real `<a href="index.html">`. Everything in `js/search.js` is
an upgrade of a working link, and every path out ends on that href.

`history.back()` runs only where there is somewhere on this site to go back to.
The referrer is the signal:

| Arrival | Referrer | Behaviour |
|---|---|---|
| Tapped search on a TemplateBox page | same-origin | `history.back()`, landing where they were, mid-scroll |
| Bookmarked or shared `?q=` URL | none | follows the href to `index.html` |
| Arrived from a search engine | not ours | follows the href; back would leave the site |

Modified and non-left clicks are left completely alone, so ctrl/cmd/middle-click
still opens the homepage in a new tab -- the same rule the catalog's own launch
handler follows.

This is safe against the address bar only because `syncUrl()` uses
`replaceState`. With `pushState` the control would walk the query back one
keystroke at a time instead of leaving the page.

## What is deliberately lost below 75rem

The theme toggle and the mega-menu panel (the legal links, the landing pages and
the social row) are inside the header, so they are unreachable from
`search.html` on a phone or tablet. Accepted, on three grounds: the theme is
already persisted in `tb_theme` from whatever page set it, the panel is one tap
away through Back, and `search.html` is `noindex, follow` -- a transient utility
surface a visitor passes through, not a page they land on and read.

This is a real narrowing of the "the panel is the only route to those links on a
phone" position taken when the footer was removed, and it is scoped to this one
page rather than reopening that decision.

## Verification

Measured in-browser at 320, 390, 768, 1024, 1199, 1200, 1440 and 1920.

| Width | Header | Back control | Bar top |
|---|---|---|---|
| 320 | none | 44x44 | 0 |
| 390 | none | 44x44 | 0 |
| 768 | none | shown | 0 |
| 1024 | none | shown | 0 |
| 1199 | none | shown | 0 |
| 1200 | flex, 85px | hidden | 125 (85 header + 40 padding) |
| 1920 | flex | hidden | clear of the header, not covered |

No horizontal overflow at any width. The field keeps its 16px font at 320px, so
iOS still does not auto-zoom it. The bar stays stuck at 0 after scrolling and
remains hit-testable. All three back paths confirmed by dispatching real click
events and stubbing `history.back`: same-origin referrer calls it and prevents
the default; no referrer does neither; ctrl-click does neither.

Section 4 reports `search.html` as drifted from HEAD until this is committed.
That is the intended layout change, not a regression -- the section is an ad
reservation check that only knows the header moved, the same way it reported the
backup button in September.
