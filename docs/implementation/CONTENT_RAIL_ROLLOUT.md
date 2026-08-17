# Content Rail: the Fixed Rail Carried to a Third Page Family

Date: August 13, 2026
Surfaces: the nine `*-template.html` landing pages, `about.html`, `terms.html`, `privacy.html`,
`blog.html`, `post.html`, and generated `blog/<slug>.html` pages
Files changed: `site/css/style.css`, `site/js/ads.js`, `site/js/blog.js`, `site/js/admin.js`,
`tests/verify-layout.js`, and the 15 HTML pages listed above

## What Changed

The fixed full-height rail described in `FIXED_FULL_HEIGHT_AD_RAIL.md` existed for two page
families: `.editor-rail` (the four editors, floor 84rem) and `.home-rail` (the homepage, floor
75rem). Both were declared as one shared CSS rule specifically so they could not drift apart.
This work adds a third selector to that same rule, `.content-rail`, for every plain
single-column page that is neither a two-pane editor nor a masonry feed.

On the 12 pages that carried the site-wide bottom anchor (`about.html`, `terms.html`,
`privacy.html`, the nine landing pages), the anchor's desktop half is retired: above 48rem it
no longer shows a persistent 728x90 bar forever. Instead the rail takes over once there is
room for it, and between 48rem and the rail's own floor neither appears — the same gap the
homepage has always had between its own anchor and rail bands. Below 48rem, nothing changes:
the 320x50 anchor is exactly as it was.

On `blog.html`, `post.html` and the generated article pages, `.content-rail` replaces the
older in-flow sticky `.post-rail` / `.blog-sidebar` (a single skyscraper mounted beside the
article or list column from 70rem). Those pages never had the site-wide anchor and still
don't; what changes is only the rail mechanism and, as a direct consequence, its floor and its
new ability to show the three-slot stack at very wide viewports, which the old single-unit
sidebar never could.

## The Floor Is Measured, Not Copied

The editors' floor is 84rem because two fixed panes need protecting from a rail eating into
them. The homepage's is 75rem because its masonry columns simply reflow and the choice was
about when the margin reads as genuinely spare. Neither reason transfers to this family, so
the floor was derived from what actually breaks first.

Every page in this family sits inside the site's plain `main { max-width: 72rem; }` rule, with
no rail-aware override — unlike `.home-layout` and `.editor-shell`, this `main` was never
widened to include an in-flow rail, so there is nothing to shed and no
`main:has(...) { max-width: calc(...) }` rule exists for it. That means the rail can only be
shown once the viewport has 72rem of content width *and* the reserved column both, at once:

```
floor_px - --ad-rail-w >= 1152px (72rem)
```

At the single-unit width (`--ad-rail-w` = 184px, 160px creative + 1.5rem gutter) that break-even
is exactly `72rem + 11.5rem = 83.5rem`. At the 93rem stack boundary the column is wider (324px)
but 93rem already clears it with room to spare (1488 − 324 = 1164px > 1152px), so one floor
covers both bands — no second calculation was needed for the stack. **83.5rem is therefore the
precise point below which `main` would start losing width, not a stylistic choice**, and it
does not coincide with the editors' 84rem by anything but rough proximity of two independent
calculations.

No `main:has(...)` cap-shedding rule was added for this family, deliberately. The editors and
homepage need one because their caps were widened to include an in-flow rail and have to shed
that width back once the rail leaves flow. This family's `main` was never widened for a rail in
the first place, so shedding would be reserving the width a second time for nothing to give
back. The 83.5rem floor is the whole protection mechanism.

## Why the Blog Surfaces Were Upgraded Rather Than Left Alone

The alternative was leaving `blog.html`, `post.html` and the generated pages on their existing
in-flow sticky rail, unrelated to this rollout. Two things ruled that out:

1. **Adding the fixed rail alongside the old one would have shown two persistent units at
   once** in the 70–93rem range where both would have been active simultaneously — precisely
   what the acceptance criteria for this change rule out. The choice was binary: convert, or
   leave untouched.
2. Their `main` is the same unmodified 72rem rule as every other page in this family (nothing
   about `.post-layout` / `.blog-layout` changes that), so the same floor math protects them
   the same way. Keeping them on a different floor (e.g. reusing the old 70rem) would have
   meant a fourth bespoke rail treatment instead of the third shared one, which is what the
   acceptance criteria explicitly ruled out.

**The accepted trade:** between 70rem and 83.5rem, blog and post pages now show no side rail,
where the old sidebar used to appear starting at 70rem. That is a real, narrow regression,
accepted in exchange for one rail component instead of two, and the new ability to run the
three-slot stack at 93rem and above, which the old single-skyscraper sidebar could never do.

The leaderboard at the top of these pages (`.ad-lead`, `[data-ad-leaderboard]`) is unrelated to
this change and unaffected: it still mounts at every width, independent of the rail, exactly as
before.

## Mounting

`mountContentAds()` in `site/js/ads.js` follows the same shape as `mountEditorAds` /
`mountHomeAds`: a three-slot stack (`editorRail1/2/3`) at 93rem and above, a single `skyscraper`
unit between the floor and 93rem, nothing below the floor. No new zone table — same reuse
discipline the file already documents for the homepage rail.

Unlike the editor and home mounts, which run inside `mountHosts()` behind the
`[data-ads-static]` gate, `mountContentAds()` runs **unconditionally** on every page load,
alongside `mountSiteAnchor()` (also now unconditional, and now gated to mobile only — see
above). This is what lets `about.html`, `terms.html`, `privacy.html`, `blog.html` and
`post.html` participate without carrying `data-ads-static` on `<main>`: none of them have a
renderer that needs to control mount timing for this host, so there was no reason to route them
through the gate that exists for pages that do. Both functions no-op safely when their host is
absent, so it is harmless to run them on every page regardless of which rail, if any, that page
carries.

For `blog.html` and `post.html` specifically, the rail host is now **static markup** in the
page itself rather than an element the renderer builds. Previously `js/blog.js` created the
sidebar/rail element from inside `initBlogIndex()` / the post renderer, which meant the ad
could not mount before the featured cards or the article had rendered. Making the host static
removes that dependency entirely: `mountContentAds()` can mount it the moment the page's own
HTML has parsed, regardless of whether `js/blog.js` has run yet.

## Verification

`tests/verify-layout.js` gained:

- Two new static checks (section 1f): the content rail's own `display: none` gate is declared
  after the shared `.editor-rail, .home-rail, .content-rail` rule (same specificity-order
  hazard the homepage gate already guards against), and `CONTENT_RAIL_STACK` uses a distinct
  zone key per slot.
- The existing "every hook queries exists in the served markup" check caught a genuinely dead
  query left behind by this change: `[data-ad-sidebar]` in `mountHosts()`, no longer served by
  any page now that `blog.html`'s sidebar moved to `.content-rail`. Removed.
- Four new pages in the browser-driven `PAGES` list (`about`, `rent-receipt`, `blog`, `post`),
  and two new widths (1335, 1336 — the content-rail floor's own hide/show boundary, mirroring
  1344/1488 for the editor and stack floors already in the list).
- `RAIL_GAP`, generalized from the homepage-only special case that used to be hardcoded inline,
  now keyed per page name so the "exactly one band" assertion knows each page family's own gap
  range (home: 48–75rem, content-rail family: 48–83.5rem) instead of assuming everyone's matches
  the homepage's.
- `MULTI_UNIT_PAGES`, excluding `blog` and `post` from the "exactly one band" assertion
  specifically — their leaderboard is a top-of-page content unit designed to run alongside the
  side rail, not an alternative to it, so the mutual-exclusivity invariant that holds for
  index/editors was never true for them and asserting it would have been testing the wrong
  thing. All the *other* checks (rail geometry, exact body-padding reservation, anchor never
  coexisting with the rail, no horizontal scroll) still run for them in full.
- The SNAPSHOT function's leaderboard query, `.editor-leaderboard`, did not recognize `.ad-lead`
  (the same role's class name on the blog surfaces), so `leaderboardShown` silently read `false`
  for `blog`/`post` regardless of actual fill state — a latent gap the expanded `PAGES` list
  surfaced for the first time. Both classes collapse to `display: none` while empty by different
  mechanisms (`.is-filled` gating vs. `:empty`), so one query reads either correctly.

Full suite: 703 passed, 0 failed (`node tests/verify-layout.js --no-baseline`), including the
four newly added pages across every width in `WIDTHS`.

**Not touched by this pass: `loading.html`.** At the time this section was written it kept its
own unrelated sticky `[data-ad-rail]` beside the centred countdown card. That changed the same
day, in two further passes -- see the Addendum and Third Pass sections below.

## Explicitly Out of Scope

**`404.html`** carries the site-wide anchor from the earlier rollout but was not named in this
task's page list and was left untouched: it still shows the 728x90 bar above 48rem forever, no
`.content-rail`. Worth revisiting for consistency, but not assumed here.

## Addendum: loading.html (August 13, 2026, same day)

`loading.html` was deliberately excluded above and stayed on its own bespoke
single-skyscraper `.loading-rail` (see the "Not verified" note). A follow-up
task reused `mountContentAds()` there too, but only its markup contract, not
its CSS -- the distinction matters and is worth recording.

**What changed:**

- The page's `<header>` (wordmark plus theme toggle, nothing else) was
  removed entirely. `initThemeToggle()` in `js/app.js` already null-guards on
  `[data-theme-toggle]`, so this is a clean removal, not a null-check fix.
- `.loading-rail`'s host markup switched from a single `[data-ad-rail]` div
  to the three-slot `[data-ad-content-rail]` / `[data-ad-rail-slot]` contract
  `mountContentAds()` already looks for -- zero new JavaScript. The now-dead
  `[data-ad-rail]` branch in `mountHosts()` was removed in the same change
  (nothing else served it once this page's markup switched).
- **The CSS was deliberately NOT joined to the shared `.editor-rail,
  .home-rail, .content-rail` rule.** That rule is `position: fixed`, full
  viewport height, reserving its width with body padding -- correct where the
  ad content runs to the true bottom of the document. This page's two
  banners sit mid-page inside a centred card; a fixed element pins to the
  viewport regardless of scroll position and can cover them on a short
  viewport even though they are nowhere near the document's actual end. This
  page tried exactly that once already and reverted it (see the original
  `.loading-rail` and `mountSiteAnchor` comments). `.loading-rail` keeps its
  own `position: sticky` block instead, with the shared rule's internal
  stack styling (flex column, gap, label sizing, empty-slot collapse)
  duplicated rather than joined, so the position mechanism can never
  accidentally inherit from the fixed family.
- The floor is inherited from `mountContentAds()`'s own hardcoded 83.5rem /
  93rem gates (there was no way to give this page a different one without
  forking the function, which "reuse the markup contract, not the CSS"
  ruled out). Measured rather than assumed: this page's flex row
  (`.loading-wrap` at 44rem plus the rail) never comes close to `main`'s
  72rem cap even added together, so unlike the other content-rail pages
  there was no main-squeeze risk to protect against here -- the floor is
  shared purely for consistency with the rest of the rollout.
- `reserveRailWidth()` still adds `.has-ad-rail` to `<body>` when the rail
  fills, an unavoidable side effect of reusing the function unchanged.
  Confirmed harmless: every screen-mode CSS rule keyed on `.has-ad-rail`
  also requires `:has(.home-rail)`, `:has(.editor-rail)` or
  `:has(.content-rail)`, none of which match `.loading-rail`, so no padding
  is ever actually reserved on this page.

**Mobile:** `#ad-banner-2` hides below 70rem (a media query, matching the
pattern `.ad-row` already used to switch row-to-column). This alone was not
sufficient -- measured at 400x667, the content alone (excluding all padding)
already totals ~685px, over budget before any spacing is added. Closing the
gap took three further cuts, all below 70rem: tightened padding/margins
throughout the card, a tightened `line-height: 1.3` on the card (down from
the site's 1.6 body default, which is generous for paragraphs and excessive
for two-line caption text), and hiding `.loading-points` (the trust list) as
the least load-bearing content once the card runs out of headroom. That
combination fit 400x667 with ~27px to spare, but **not** the smaller 320x568
(iPhone SE, CLAUDE.md's own stated 320px minimum paired with a genuinely
short device) -- narrower text wraps onto more lines and the total still
overflowed by ~69px. A fourth cut, hiding `.loading-template` (the "Opening
<name>" preview), closed that too. At this point the bottom anchor other
pages use was deliberately left out, on the reasoning that a fixed element
would risk covering the same mid-page banners the same way the rail could
not be `position: fixed` either. **That reasoning was revisited the same
day -- see the third pass below.**

## Third Pass (Same Day): Adding the Anchor Back, Correctly

Requested after the second pass shipped: add the mobile bottom anchor too,
but only if it can actually fit without reintroducing the overlap risk the
first pass explicitly ruled it out for.

**The reasoning that excluded the anchor was reframed, not overturned.** The
original overlap bug was never really about how many banners were on the
page -- it was about a `position: fixed` element sitting over content that
gets scrolled past it, which can happen at any scroll position on a page
tall enough to need scrolling, regardless of how far the content in question
sits from the document's true end. The second pass's mobile tightening had
already, incidentally, gotten the whole page to fit inside the viewport with
**zero scrolling** at every phone size tested. A page that never scrolls has
no "scrolled past" moment for a fixed element to exploit -- so the fix
was never really "cut enough banners," it was "make the page fit," and once
that was true the anchor became safe on its own terms, not despite the
original reasoning but because of it.

**What changed:**

- Added the standard `<div class="site-anchor" data-ad-anchor>` host,
  identical to every other page. `mountSiteAnchor()` in `js/ads.js` already
  ran unconditionally on every page and already found nothing here; adding
  the host was the only change needed on the mounting side.
- Updated `mountSiteAnchor()`'s own comment block, which had previously
  documented loading.html as a deliberate, permanent exclusion -- now
  explains why the anchor is safe here specifically (zero scroll), and warns
  against reusing that reasoning on a different page without first verifying
  zero scroll there too.
- The anchor reserves a further 4.75rem (76px) of body padding at its own
  48rem breakpoint (`SITE_ANCHOR_MOBILE` in `js/ads.js`), which the second
  pass's budget did not have to account for. Measured with the anchor
  active: 400x667 overflowed by ~29px, 320x568 by ~50px.
- The `.loading-template` hide breakpoint moved from a narrow 24rem (384px,
  chosen in the second pass to touch as few devices as possible) to the
  anchor's own 48rem, trading the template preview for room at exactly the
  widths where the anchor's extra 76px now needs to be found -- one
  breakpoint governing both trade-offs rather than two drifting
  independently. A further, `48rem`-scoped layer of padding/margin/line-height
  cuts (tighter than the 70rem tier's own) closes the remaining gap at
  320x568 specifically, including a `.countdown` font-size reduction to
  2rem within that tier only.
- Net result, measured: 320x568, 400x667 and 375x667 all land at an exact
  scrollHeight-equals-viewport-height fit (zero pixels of both overflow and
  slack); 414x736 fits with room to spare untouched.

**What this does NOT change:** the desktop rail (still `position: sticky`,
still floors at 83.5rem/93rem) and the reasoning that keeps `.loading-rail`
off the shared fixed-column selector are exactly as the second pass left
them. The anchor and the rail are still mutually exclusive by viewport --
under 48rem the rail's own floor (83.5rem) is nowhere close, and above
48rem the anchor's own gate excludes it -- so the two can never coexist,
matching the "never two persistent units at once" invariant this whole
rollout has held pages to throughout.

**Verification:** the same standalone CDP script gained anchor-specific
checks -- mounted and filled at all four phone sizes, zero overlap with the
in-flow banner confirmed directly (not just inferred from zero scroll),
the 48rem breakpoint itself checked at 767/769px, and desktop confirmed to
show the rail with the anchor absent. 31 checks pass (up from 12). The
first attempt at these checks used a quicker, less careful CDP script
without the settle-time polling `tests/verify-layout.js` itself uses, and
it produced two flaky false failures (banners reporting `display: block`
instead of `flex`, a `scrollHeight` nearly 300px too tall) that did not
reproduce on any re-run and did not appear at all once re-checked with the
more careful script -- a reminder that a script's own timing can be the
bug, not always the page. The full site-wide suite was re-run afterward:
still 703 passed, 0 failed.

## Fourth Pass (Same Day): the Floor Consolidated to 75rem, and the Guides Page Reworked

Two further changes landed after the editors' floor moved to 75rem, both driven by the same
report: a 1280px MacBook Air showed a rail on some page types and not others.

**The content-rail floor dropped from 83.5rem to 75rem**, so all three rail contexts — homepage,
editors, content pages — now mount at identical widths. The 83.5rem derivation in the section
above is still correct and is knowingly overridden: between 75rem and 83.5rem a content page's
text column is narrower than its 72rem cap would otherwise allow, because the page is
viewport-bound there and the body padding decides the width. That cost is far cheaper here than
on the editors (prose reflowing narrower versus fixed panes losing width), which is why this was
the easier of the two calls.

**The guides page (`blog.html`) now carries exactly one persistent unit.** It previously ran a
top leaderboard *plus* the side rail on desktop. Now:

| Viewport | Unit |
|---|---|
| 93rem and above | Three-slot 300x250 stack, fixed rail |
| 75rem to 93rem | Single 160x600, fixed rail |
| 48rem to 75rem | Nothing (the same gap the homepage has always had) |
| Below 48rem | 320x50 fixed bottom anchor |

Removing the top leaderboard is what made the anchor possible: it drew from
`leaderboard`/`leaderboardMobile`, the same zones the anchor uses, and serving one zone key
twice in a single page view was the stated objection that had kept an anchor off this page. With
the top unit gone the objection no longer applies, and `js/blog.js` no longer mounts any ad at
all on the index — both remaining placements are static markup mounted unconditionally, so
neither depends on the renderer having run.

Measured across 1920/1512/1280/1200/1199/768/390/320: correct band at every width, never both
rail and anchor, no horizontal overflow.

## Related Files

- `site/css/style.css` — `.content-rail` in the shared rail rule, its own floor/stack media
  queries, `body.has-ad-rail:has(.content-rail)`, print hide list; retired `.post-rail` /
  `.blog-sidebar` sticky rules
- `site/js/ads.js` — `mountContentAds()`, `mountSiteAnchor()`'s mobile-only gate, the
  unconditional `DOMContentLoaded` wiring, the retired `[data-ad-sidebar]` query
- `site/js/blog.js` — `initBlogIndex()` and the post renderer, both no longer building or
  mounting a rail element
- `site/js/admin.js` — `buildPostPage()`'s generated markup and ad-host comment
- `tests/verify-layout.js` — `RAIL_GAP`, `MULTI_UNIT_PAGES`, the extended `PAGES`/`WIDTHS`,
  the corrected leaderboard selector
- `docs/implementation/FIXED_FULL_HEIGHT_AD_RAIL.md` — the mechanism this extends
- `docs/error-fixes/AD_HOST_SHIPPED_WITHOUT_ITS_SCRIPT.md` — the site-wide anchor this partially
  retires
