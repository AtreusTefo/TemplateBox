# Header Search Button Did Nothing From 361px to 992px

Date: August 24, 2026

## Issue Title

The header search control on `index.html` was visible and tappable on phones
and small tablets but produced no visible change. Reported as "make the search
button for mobile and tablet responsiveness function"; investigation showed the
control was not merely unhelpful, it was inert on almost every width it
appeared at.

## Symptom

At 390px, tapping the search control in the header:

- set `search-open` on `.site-header` (confirmed: `class="site-header
  search-open"`),
- left `.site-search` at `display: none`,
- produced no field, no error and no console output.

Measured before the fix, on `/` at three widths:

| Width | Control visible | Field after click |
|-------|-----------------|-------------------|
| 360px | yes             | `flex` (worked)   |
| 390px | yes             | `none` (dead)     |
| 768px | yes             | `none` (dead)     |

## Root Cause

A media-query scoping error, not a missing feature. Two rules disagreed about
which viewports they governed:

- `css/style.css` hid the field for everything below 62rem:

  ```css
  @media (max-width: 62rem) {
      .site-search { display: none; }
  }
  ```

- The only rule that undid that `display: none` was written inside a **22.5rem**
  media query, alongside an unrelated rule that shortens the wordmark on very
  narrow phones:

  ```css
  @media (max-width: 22.5rem) {
      .wordmark span { ... }

      /* The search field, revealed on demand as its own row. Beats the
         display:none at 62rem below on specificity (0,2,1 against 0,1,0), so
         source order between the two blocks does not matter. */
      .site-header.search-open .site-search { display: flex; ... }
  }
  ```

The comment on that rule is correct about specificity and silent about scope.
It does out-specify the 62rem rule -- but only within `max-width: 22.5rem`. From
361px to 992px the class the button toggled matched no rule that changed
anything.

Why it survived: 360px is the width anyone testing "a phone" reaches for first,
and at 360px the feature works perfectly. Nothing throws, nothing logs, and the
control looks correct in a screenshot at any width. `tests/verify-layout.js` had
no assertion about the control at all.

## Fix Applied

The control was not repaired in place. Revealing a field inside a 320px header
row is the wrong end state anyway: there is no room for it, and it can only
search what is already on the page, so it cannot reach the guides. The control
is now a link to a real page.

| File | Change |
|------|--------|
| `site/search.html` | New page. Search field pinned under the header, live-filtered template and guide results, category browse rows when the field is empty. |
| `site/js/search.js` | New. Builds the page from the real `index.html` cards and from `window.TB_BLOG_POSTS`. |
| `site/index.html` | `.search-toggle` is now `<a href="search.html">`, not a `<button>` toggling a class. |
| `site/js/app.js` | `setSearch`, the `searchToggle` lookup, its click listener, the `search-open` branch of the Escape handler and the `search-open` reset in `onBreakpoint` all deleted from `initHeaderToggles`. Exports `bindLaunchControls` and `buildGuideCard`. |
| `site/css/style.css` | Both `search-open` rules deleted (the 22.5rem reveal and the 62rem `order: 6`). `.search-toggle` gained `text-decoration: none` and a `:focus-visible` state so it works as an anchor. |
| `netlify.toml` | `X-Robots-Tag = "noindex, follow"` for `/search.html`. |
| `tests/verify-layout.js` | New section 3b, plus `search` in `PAGES` and `js/search.js` in the hook scan. |

Deleting both `search-open` rules is deliberate rather than tidy-minded: this
project's own rule is that retiring a unit deletes the rule sized for it, and a
dead reveal rule left in the stylesheet is exactly what the next person would
try to "fix" by widening its media query, restoring a cramped in-header field
instead of the page.

The field above 62rem is untouched. It filters the catalog in place, which is
the right behaviour on the page that *is* the catalog, and it is why the link
stays hidden there -- two search affordances in one bar was the thing the
original 62rem gate existed to prevent.

## Testing Steps

Automated. `node tests/verify-layout.js` from the repository root:

- **3b, phone and small tablet** (320, 360, 390, 414, 768): the control must be
  present and visible, and *clicking it with trusted input* must land on
  `/search.html` with the field rendered and focused. Stated as an outcome on
  purpose -- asserting "it is a link to search.html" would pass a search page
  that renders nothing.
- **3b, from 62rem up** (1024, 1200, 1440): the inline field must be present and
  must actually narrow the catalog, so the band cannot end up served by neither
  affordance, which is the same bug one band over.

Mutation-tested, both directions:

| Mutation | Result |
|----------|--------|
| Restore the `<button>` plus the 22.5rem reveal rule | 3b fails at 390, 414, 768; passes at 320 and 360 -- the exact shape of the original bug |
| Point `.search-toggle` at `index.html` | 3b fails at all five phone/tablet widths |
| Move the field's `display: none` gate from 62rem to 75rem | the inline-field checks fail at 1024 and 1200, pass at 1440 |

Manual: load `/` at 390px in a real browser, tap the control, confirm the search
page opens with the keyboard raised and the field focused.

## Troubleshooting

- **The control navigates but the page is empty.** `js/search.js` fetches
  `index.html` and parses it; a fetch failure shows the fallback paragraph
  linking to the homepage. Check the console for `TemplateBox search:`.
- **Cards on the search page open the editor directly.** They are inserted after
  `initCatalog` has run its one binding pass, so `js/search.js` must call
  `TB.bindLaunchControls` over the inserted subtree. Note that `TB` is a
  top-level `const` in a classic script, so it is a lexical global and **not** a
  property of `window`: a guard written `window.TB && ...` is always false and
  skips the call silently. Section 3c covers this.
- **The field sits under the header on a phone.** `.search-page-bar` sticks at
  `var(--header-h, 5.25rem)`. A literal cannot work -- the header wraps, so it is
  85px on desktop and 145px or more on a phone. Section 2d covers this.

## Related Files

- `site/search.html`, `site/js/search.js`
- `site/index.html` (header block), `site/js/app.js` (`initHeaderToggles`)
- `site/css/style.css` (`.search-toggle`, `.site-search`, `.search-page-*`)
- `netlify.toml`
- `tests/verify-layout.js` (sections 2d, 3b, 3c)
- `docs/implementation/SEARCH_PAGE.md`
