# The Mockup Editor's Navigation Bar

Date: August 24, 2026

## What Changed

`mockup.html`'s editor bar was rebuilt. It carried an all-templates icon, a
document-name input and the save/download actions; it now carries navigation.

**From 75rem:** the TemplateBox wordmark at the left edge, a Mockups dropdown,
Templates and Guides links, a search field, then the save indicator and
Download PNG.

**Below 75rem:** the all-templates icon, a hamburger holding the same links, a
search button, then the actions.

`resume.html`, `docs.html` and `poster.html` are untouched, and that is
verified rather than assumed: section 4 of `tests/verify-layout.js` compares
every page against `git archive HEAD` and reports zero differences for all
three at all fourteen widths.

## One Boundary, 75rem

Every control belongs to exactly one side of a single boundary. It is the width
`js/app.js` already collapses `.site-nav` at (`initHeaderToggles` matches on
`74.9375rem`, the pixel below), and the same seam where the ad anchor ends and
the ad rail begins.

A second boundary was available -- the site header's own field is gated at
62rem -- and was rejected. Two boundaries would create a band where the bar is
half collapsed, and, more importantly, would put the CSS and the JS into
disagreement about when the bar *is* collapsed. That disagreement is precisely
what produced the dead search control this work also fixed: a rule scoped to one
breakpoint undoing a rule scoped to another, with a band in the middle served by
neither. The suite asserts both states at six widths each, so a boundary that
moves in one place and not the other fails rather than silently opening a gap.

## The Wordmark Is a New Class

`.editor-brand`, not a change to `.editor-home`. The icon is still there and
still named "All templates"; it is simply the narrow-screen identity now. The
three other editors share `.editor-home`, so editing that rule would have
changed all four bars.

## The Mockups Dropdown

The existing `.nav-more` disclosure component, not a second dropdown pattern:
same markup shape, same `initNavMore` handler, same panel anchored to the sticky
header at `top: 100%`.

Its items are plain anchors carrying `data-target="mockup"` and a `data-doc` id.
Nothing routes them explicitly. `bindLaunchControls` in `js/app.js` binds every
`[data-target]` on every page through `initCatalog`, so each item goes to
`loading.html?target=mockup` with the variant preset written, and a crawler
still follows the `href` to a real page.

**Accepted consequence:** switching mockups from inside the editor costs the
10-second interstitial, exactly as every other launch on the site does. An
in-place template swap would be a different decision and would need a rule for
the layers already on the canvas -- it is not implemented and should not be
without that decision being made.

The panel is asserted to stay clear of the fixed ad rail. The mockup editor is
the harder case of the two pages that now carry a mega-menu: its rail is up at
every width in the check, and the panel is anchored to a header that is itself
inset by the body padding the rail reserves. Section 2b covers both pages.

## The Search Field Needs No JavaScript

`<form action="search.html" method="get">` with a field named `q`. There is
nothing on this page to filter, so the only correct behaviour is to navigate,
and the browser does that itself on Enter. Below 75rem the field is replaced by
the same `.search-toggle` link the homepage header carries.

Its appearance is shared with the site header's field rather than copied: the
`.site-search input` rules are now a two-selector list. Only the display gate
differs, because this bar switches at 75rem and the header's field at 62rem.

## The Document-Name Input Is Gone

`#doc-name` was removed from `mockup.html` at every width, along with its
lookup, its listener and the persisted `docName` key in `js/mockup.js`. No
guarded dead code was left behind. A stale `docName` in a returning visitor's
storage is simply never read.

`#m-label` ("Mockup Label") in the controls is what names a mockup now. The two
are asserted together in the suite: removing the bar's field without confirming
the controls' field exists would leave the editor with no way to name a mockup
at all.

`.doc-name`'s CSS is untouched -- resume, docs and poster still use it.

## The Download Button Loses Its Label on Phones

Measured at 390px: with "Download PNG" beside the hamburger and the search
button, the bar wrapped to a second row and the sticky header went from 85px to
141px. That is 56px taken permanently out of a phone viewport, on a workspace,
which is the cost the header collapse exists to avoid in the first place.

The label is in a `<span class="dl-label">` hidden visually below 48rem. It stays
in the document, so it is still the button's accessible name -- a screen reader
still announces "Download PNG" and there is no `aria-label` to maintain in
parallel. `.dl-label` exists only in `mockup.html`, so the rule cannot reach the
other editors' download buttons.

The suite asserts both halves: the bar is one row at every width, and the
button still carries its name at every width.

## Measured Result

The rebuilt bar is **shorter** than the one it replaced on a small phone. The
only difference section 4 reports against HEAD, across nine pages and fourteen
widths, is `mockup @320`: the header is 85px where it was 133px, because the old
bar's name input wrapped it to two rows. Everything else on every other page is
identical to the byte.

> **Correction, August 25, 2026.** The download button left this bar entirely.
> It is a JPG/PNG export panel in the control column's action row now, so every
> "save, download" below reads "save" on `mockup.html`; the other three editors
> are unchanged. The phone rule that hid its label (`.editor-bar .dl-label`) was
> deleted with it. See `MOCKUP_WORKSPACE_REBUILD.md`.


| Width | Left | Middle | Right | Header |
|-------|------|--------|-------|--------|
| 1920 | wordmark | Mockups, Templates, Guides | field, save, Download PNG | 85px |
| 1440 | wordmark | Mockups, Templates, Guides | field, save, Download PNG | 85px |
| 1199 | icon, hamburger | (in the hamburger) | search button, save, download | 85px |
| 768 | icon, hamburger | (in the hamburger) | search button, save, download | 85px |
| 390 | icon, hamburger | (in the hamburger) | search button, save, download | 85px |
| 320 | icon, hamburger | (in the hamburger) | search button, save, download | 85px |

## Nothing Sets a Width on the Header

Every rule in the editor-bar block uses `order`, which moves paint order within
the flex line and reserves nothing. The fixed ad rail insets the whole page with
one `padding-right` on `<body>`, and the header inherits it by staying in normal
flow. A width, margin or transform on the header would break exactly the
mechanism `FIXED_FULL_HEIGHT_AD_RAIL.md` warns about. Verified at 1280 and 1920:
the header's right edge lands exactly on the rail's left edge, and the open
dropdown panel stops before it.

## Verification

- **2b** -- the mega-menu on the mockup editor as well as the homepage: opens on
  screen, clear of the ad column, and clickable at 1920/1440/1366/1200.
  Mutation-tested by pushing `.nav-more-panel` past the header's right edge:
  fails on both pages at all four widths.
- **3d** -- a dropdown item routes through the interstitial with its preset, in
  both bar states. Mutation-tested by dropping `data-target` from one item:
  both states fail.
- **5b** -- bar composition at 1920/1440/1280/1200 and at
  1199/1024/768/414/390/320, one row in every case, plus the download button's
  accessible name and the name-input swap. Mutation-tested by moving the
  desktop gate to 62rem (1199 and 1024 fail, the band served by neither) and by
  un-hiding the download label (320 fails on header height).

## Deliberately Not Done

- **The other three editors keep their bars.** Rolling this out to resume, docs
  and poster is a separate task, and "links to other mockups" needs a per-editor
  equivalent before it means anything there.
- **No theme toggle in the editor bar.** The other editors do not have one, and
  adding it to one of the four is worse than adding it to none.

## Related Files

- `site/mockup.html` -- the bar
- `site/css/style.css` -- "The mockup editor's bar" block, the shared
  `.site-search`/`.editor-search` rules, the phone-only `.dl-label` rule
- `site/js/mockup.js` -- `docName` removal
- `tests/verify-layout.js` -- sections 2b, 3d, 5b
- `docs/implementation/SEARCH_PAGE.md` -- where the field and the button lead
