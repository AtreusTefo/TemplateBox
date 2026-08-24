# The Search Page (search.html)

Date: August 24, 2026

## What Was Built

`site/search.html`, the site's first search **results** surface, plus
`site/js/search.js` which builds it. It is what the phone and tablet search
control opens now that the control is a link rather than a dead class toggle
(see `docs/error-fixes/HEADER_SEARCH_BUTTON_DEAD_ON_PHONES_AND_TABLETS.md`), and
what the mockup editor's search field submits to.

Two states, never both:

- **Empty field:** browse rows -- one horizontally scrollable row per catalog
  category, then a Guides row. Modelled on the supplied reference surface: a
  heading over a strip of tiles, the last tile clipped so the row reads as
  scrollable.
- **With a query:** a Templates section and a Guides section, each with a count,
  each hidden when it matches nothing, and a shared empty state when neither
  matches.

## Why a Page Rather Than a Reveal

The homepage field filters the cards already on the homepage in place. That was
a deliberate decision and it remains correct there: there is no server to query
and every template is already on that page, so a results page would send the
visitor to where they already are.

It does not generalise. It cannot search the guides, it cannot run on a page
that is not the catalog, and it needs a field the header has no room for below
62rem. The page is what those three constraints add up to.

## Where the Data Comes From

**Templates: fetched from `index.html`, not duplicated.** `js/search.js` fetches
the homepage, parses it with `DOMParser`, and `importNode`s the real
`<article class="template-card">` elements. No `innerHTML` is involved anywhere
in the path.

The alternative considered and rejected was a `js/catalog-data.js` registry. The
homepage's eighteen cards are hand-authored markup carrying CSS document
miniatures, photo thumbnails and the `data-target`/`data-doc` launch attributes.
A registry would be a **third** list to hold in step with `index.html` and with
`CATALOG_ITEMS` in `js/admin.js` -- two lists that `tests/verify-layout.js`
already has to cross-check because they drifted -- and it still could not
reproduce the miniatures. Importing the real nodes cannot drift by construction.

The cost of that choice, stated plainly: the search page depends on
`index.html`'s markup shape at runtime. If `.catalog-grid .template-card` or
`.card-body` were renamed, the page would render nothing rather than throw.
That is covered two ways -- the hook scan in `tests/verify-layout.js` now reads
`js/search.js` and requires every selector it queries to exist in some served
page, and section 3c clicks a card in both states.

**Guides: `window.TB_BLOG_POSTS`** from `js/blog-data.js`, the same source the
homepage guides strip reads. The card itself is now built by
`TB.buildGuideCard`, extracted from `initGuidesStrip` so the URL shape, the date
format and the `description` field live in one place rather than two.

## The Launch Flow Trap

`js/app.js` binds every `[data-target]` control once, inside `initCatalog`, at
`DOMContentLoaded`. Every card on the search page is inserted **after** that
pass has run, so each one is bound only because `js/search.js` calls
`TB.bindLaunchControls` over the subtree it just inserted.

Get this wrong and the cards look and feel perfect while going straight to the
editor, skipping `loading.html` -- the interstitial the entire site is funded
by -- with nothing anywhere to say so.

It was got wrong during the build, which is worth recording. The first version
guarded the call with `if (window.TB && ...)`. `js/app.js` declares `const TB` at
the top level of a classic script, which creates a **lexical** global, not a
property of `window`, so the guard was always false. A result card navigated to
`docs.html` instead of `loading.html?target=docs`. The guard is
`typeof TB !== "undefined"` now, and section 3c of the suite asserts the
outcome in both the results list and the browse rows.

## Advertising

The page joins the **content-page family**: a `[data-ad-content-rail]` aside with
three slots, and the site-wide `[data-ad-anchor]`, exactly as `about.html`
carries them. `mountSiteAnchor` and `mountContentAds` already run
unconditionally on every page, so `js/ads.js` needed no change at all.

That gives the required "never two bands at once and never none" at every width:
the anchor to 74.9375rem, the rail from 75rem. `search` is in `PAGES` in
`tests/verify-layout.js`, so all fourteen widths are asserted, and it is
deliberately **not** in `RAIL_GAP` -- there is no width at which this page shows
nothing.

Since this is a mobile surface first, the anchor is the band that matters most
here, which is the opposite of the editors.

## SEO

`noindex, follow`, no `sitemap.xml` entry, plus a matching `X-Robots-Tag` header
for `/search.html` in `netlify.toml`.

Every template the page can list is already on `index.html`, so an indexable
copy is a thin duplicate of the most-indexed page on the site, and a results URL
with an arbitrary `?q=` is exactly the "substantially similar" page Search
Central asks not to be given. `follow` is deliberate: the links out of it are
real internal links and should still pass.

There is deliberately **no** `robots.txt` Disallow. A Disallow stops the crawler
fetching the page at all, which stops it ever reading the page's own noindex,
leaving the URL indexable on the strength of an external link -- the same
reasoning already recorded for `loading.html` and `admin.html`.

## Implementation Notes Worth Keeping

- **`.browse-scroll` rides on `.catalog-grid`.** Nearly every card rule is scoped
  `.catalog-grid .card-*`, so a card cloned into a plain flex row would lose its
  styling. The browse rows keep the class and override only `display`. The two
  selectors carry equal (0,1,0) specificity, so `.browse-scroll` is declared
  after `.catalog-grid` and source order is the whole contest.
- **The field sticks at `var(--header-h, 5.25rem)`**, the header's real measured
  height published by `initHeaderHeight()`. A literal would be calibrated on
  desktop and put the field inside the header's box on a phone, where the header
  wraps to 145px or more -- and the header would paint over it, z-index 20
  against 15. This is the page whose entire purpose is that field. Section 2d
  asserts it, mutation-tested with the literal.
- **The header does not hide on scroll here.** That behaviour is scoped to
  `body:has(.home-layout)`, so there is no `is-nav-hidden` partner rule to write.
- **The form is real.** `<form action="search.html" method="get">` with a named
  `q` field, so Enter works before the script has bound anything and a shared
  `?q=` URL is a first-class entry point. Once the script is running it
  intercepts the submit and filters in place. The URL follows the field via
  `history.replaceState`, never `pushState` -- an entry per keystroke would make
  the back button walk the query letter by letter.
- **Results are built once and filtered**, exactly as the homepage filter works.
  Re-cloning on each keystroke would re-run the launch binding, re-request the
  thumbnails and flicker the grid.
- **The query is scrubbed at the boundary** (`cleanQuery`): `<`, `>`, quotes,
  backtick and backslash out, whitespace collapsed, capped at the field's own
  80-character `maxlength`. Nothing is ever written as markup, but the project
  standard is to scrub text parameters where they arrive rather than to rely on
  every later use being careful.
- **Only `.card-body` is indexed**, not the whole card. The preview miniatures
  are `aria-hidden` decorative sample text ("Daniel Osei", "$1,250.00"), so
  indexing the card would make a search for a sample name match.

## What Was Deliberately Left Out

- The search control was added to `index.html` only. Putting it in the other
  fourteen page headers also means updating the `MEGA_MENU` constant in
  `js/admin.js`, which regenerates exported post pages, and it is a separate
  decision about how much header a content page should carry.
- No search history, no suggestions, no fuzzy matching. Every term must appear,
  the same rule the homepage filter follows, so a second word narrows rather
  than widens.

## Related Files

- `site/search.html`, `site/js/search.js`
- `site/css/style.css` -- the "Search page (search.html)" section
- `site/js/app.js` -- `buildGuideCard`, exported `bindLaunchControls`
- `site/index.html` -- the header control
- `netlify.toml`, `tests/verify-layout.js`
- `docs/error-fixes/HEADER_SEARCH_BUTTON_DEAD_ON_PHONES_AND_TABLETS.md`
