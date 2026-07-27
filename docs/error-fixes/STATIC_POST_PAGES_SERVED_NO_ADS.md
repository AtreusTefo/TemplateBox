# Blog Article Pages Served Zero Ads: Every Provisioned Zone Was Dead on the Pages Readers Reach

Date: July 27, 2026
Status: Fixed

## Issue Title

Raised as a question — "why not add ads on the guides/articles?" The placements were already designed, zoned and paid for: five Adsterra zones exist for blog surfaces and all five carry live keys. But none of them appeared on an article page. The static post pages under `blog/` carried no ad host elements at all and did not even load `js/blog.js`, so the leaderboard, the in-content 300x250, the end-of-article 300x250 and the 160x600 rail were all inert. `blog.html` was fine (leaderboard plus sidebar rail). The blog earned nothing on the pages people actually read.

## Root Cause

Collateral damage from the July 26, 2026 migration to static post pages. Before it, `post.html` rendered each article at runtime and `initPostPage()` in `js/blog.js` created the ad hosts as it built the DOM: leaderboard into the host in `post.html`'s markup, in-content inserted into the body mid-render, end-of-article appended after the body, and the skyscraper rail appended to the layout on wide viewports.

The migration replaced that page with generated static files whose body is real markup, and the generator's shell in `buildPostPage()` (`js/admin.js`) was written from the visible structure of a rendered post — header, body, footer — without the ad hosts, and with only `blog-data.js` and `app.js` as script tags. `netlify.toml` then 301'd `post.html?slug=` to those files, so the one page that still had working placements stopped being reachable.

Nothing failed loudly. Ad hosts render nothing when empty, which is the property that makes dormant zones safe, and it is also what let four live zones disappear silently. Adsterra impression counts for those zones would have been the only signal.

## Fix Applied

Placement stayed in one registry; only the mounting path is new. (The registry was in `js/blog.js` at the time of this fix and moved to `js/ads.js` hours later — see `docs/implementation/LANDING_PAGE_AD_PLACEMENT.md`.)

- **`js/admin.js`, `buildPostPage()`** now emits the hosts in the generated markup: `<div class="ad-lead" data-ad-leaderboard>` above the article, `<div class="ad-break" data-ad-incontent>` inside the body, `<div class="ad-break" data-ad-endofarticle>` after it, and an `<aside class="post-rail" data-ad-rail>` inside a new `.post-layout` wrapper. The article carries `data-static-post` and the shell now loads `js/blog.js`.
- **Mounting** fills those hosts on load from the same registry. Introduced here as `initStaticPost()` in `js/blog.js`, keyed on `[data-static-post]`; superseded within the day by the generic `TBAds.mountHosts()` auto-mount in `js/ads.js`, keyed on `data-ads-static`, when the landing pages needed the same behavior. Either way the rail is only filled above 70rem, matching the runtime rule, and the key cannot collide with `initPostPage()`.
- **Shared placement rule.** `adBreakIndex()` was extracted into `js/blog.js` and exported, so the runtime renderer and the generator position the in-content break identically. It also fixes a defect in the old rule: inserting before `children[2]` unconditionally could land the ad between a heading and the paragraph it introduces. The rule now slides forward past any position whose preceding sibling is a heading, so the break falls between sections. On the existing post (`P H2 P H2 UL P H2 P`) it moves from index 2 to index 3 — after a paragraph, before the next heading.
- **`css/style.css`**: `:empty` collapse rules for `.ad-lead`, `.ad-break`, `.post-rail` and `.blog-sidebar`. This matters more than it did before: hosts now ship in static markup and exist even when unfilled, and `.ad-break` carries 2rem of vertical margin while `.post-rail` is a flex item with a gap beside it. Without the rules, a dormant zone or a visitor without JavaScript would see holes in the layout.
- **Reproducible body serialization.** The generator previously serialized the body with `holder.innerHTML`, which yields one unbroken line because the renderer builds the tree with `createElement` only and leaves no whitespace text nodes. The committed page had been pretty-printed by hand afterwards, so a re-export could never match what was in the repository. It now emits one top-level block per line at a fixed indent, which is diffable and exactly reproducible. Whitespace between block elements does not affect rendering.
- The existing post page was regenerated to match, including the `prose` class the runtime path applied and the static shell had been missing (card background, border, padding).

Deliberately unchanged: no Popunder and no Social Bar on any blog surface. Those are the aggressive formats and blog pages are indexable content; the existing policy keeps them to `index.html` and `loading.html` respectively. Article pages get passive banners only.

## Testing Steps

Automated, all passing at fix time:

1. Extract the real `adBreakIndex()` from `js/blog.js`, run it against the committed page's block sequence, and assert it returns the index the in-content host actually occupies, and that the host's preceding sibling is not a heading. Result: rule says 3, host sits at 3, no heading split.
2. Assert every zone name referenced by a host in served markup resolves to a non-empty key in `AD_ZONES`. Result: all five set.
3. Per-surface inventory, asserting each page has the hosts it should, that any page with hosts also loads `js/blog.js`, and that no blog surface carries the Popunder (`pl30250761`) or Social Bar (`pl30250765`) script:

   | Surface | Hosts | Loads blog.js | Popunder | Social Bar |
   |---|---|---|---|---|
   | `blog.html` | leaderboard, sidebar | yes | no | no |
   | `post.html` | leaderboard | yes | no | no |
   | `blog/<slug>.html` | leaderboard, incontent, endofarticle, rail | yes | no | no |
   | `index.html` | none | no | yes | no |
   | `loading.html` | none | no | no | yes |

4. Structural pass over all 24 pages: tag balance, single `<h1>`, no duplicate ids, 40 JSON-LD blocks parse, 676 internal links resolve.
5. Served-markup check: `curl` the post page and confirm all four `data-ad-*` hosts, `data-static-post` and the `js/blog.js` tag are present, and that the `:empty` rules are in the served stylesheet.

Not verified: actual ad fill in a browser. That needs a real page load — Adsterra frequency-capping and zone warm-up mean a first load can legitimately show nothing (see `SOCIAL_BAR_NOT_DISPLAYING.md` for the same class of false alarm). Confirm via impression counts in the Adsterra dashboard for the leaderboard, in-content, end-of-article and skyscraper zones a day after deploying; those four should go from zero to non-zero.

## Troubleshooting

- **A host renders but stays empty:** its zone key is empty in `AD_ZONES`, or the viewport rule excluded it (the rail needs 70rem, the leaderboard swaps to 320x50 under 48rem). Both are intended behaviors, not faults.
- **Holes in the layout where an ad should be:** the `:empty` rules are missing from `css/style.css`. Do not "fix" this by removing the hosts from the generator; the hosts are what keep the markup and the registry in one place.
- **Ads appear twice:** a page that renders its own placements was also given `data-ads-static`, so both the renderer and the `TBAds` auto-mount ran. The marker belongs only on pages whose hosts are in the served markup.
- **A newly exported post page has no ads:** it was exported by an older `admin.js`. Re-export after any change to `buildPostPage()`.
- **In-content break missing on a short post:** intended. `adBreakIndex()` returns -1 below four top-level blocks, and also when sliding past headings runs out of body.

## Related Files

- `site/js/admin.js` (`buildPostPage`, body serialization)
- `site/js/ads.js` (`AD_ZONES`, `adBreakIndex`, `mountHosts`) and `site/js/blog.js` (`initPostPage`, `initBlogIndex`)
- `site/css/style.css` (`:empty` collapse rules)
- `site/blog/free-cv-resume-templates-build-professional-resume-fast.html` (regenerated)
- `docs/implementation/BLOG_SYSTEM_IMPLEMENTATION.md` — the placement registry and blog ad policy
- `docs/error-fixes/EXPORTED_POST_PAGE_FOOTER_DRIFT.md` — the same generator, the same class of omission: the shell was written without something every other page had
