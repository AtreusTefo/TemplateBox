# Landing Page Ad Placement and the Shared Placement Module

Date: July 27, 2026

## The question

The nine document landing pages carried no ads, and the hero has a visible block of empty space under the call to action. The obvious move is to put a banner in it. That is the one place on these pages a banner should not go.

## Why not the hero

The landing pages are not the product; they are the funnel into it. A visitor who clicks the hero CTA goes to `loading.html`, which serves a Popunder, two 300x250 banners and the Social Bar across a ten-second dwell. That is worth substantially more than one banner impression on a page the visitor is about to leave anyway. Anything that competes with the CTA for attention trades a high-value event for a low-value one.

The empty space is also not a slot. `.landing-hero` is a two-column grid whose right column is a 4:5 document miniature; the left column holds a headline, one paragraph and a button, so it is always much shorter. With `align-items: start` the difference piled up underneath the CTA and read as an unfinished gap. It is now `align-items: center`, which distributes the same space above and below so the column reads as a short block against a tall image. Under 48rem the layout is already a single stack, so nothing changes there.

## Where the banner went

One 300x250, between the end of the body copy and the FAQ section:

```
hero + CTA  ->  body copy  ->  [300x250]  ->  FAQ  ->  closing CTA band  ->  related templates
```

The reasoning, in order of what was rejected:

- **Not the hero, not above the fold.** Conversion path, as above. It would also push the H1 down.
- **Not immediately before the closing CTA band.** That is the second conversion element and the ad would sit in the reader's path at the decision moment.
- **Not at the very bottom, after related templates.** Safe, but low viewability; a unit nobody sees earns nothing and still costs a request.
- **After the body, before the FAQ.** The reader has finished the substantive content. The FAQ and the closing CTA both still follow, so the conversion path is intact. This mirrors the in-content break already used inside articles.

One unit per page, passive format only. No Popunder and no Social Bar on landing pages: they are indexable content and those formats stay on `index.html` and `loading.html` respectively. This is consistent with the existing decision that blog pages are a monetized surface with banners only.

The unit reuses the `inContent` zone key, which already serves the article in-content break and `loading.html` slot 1. Reuse is functionally fine per Adsterra; only reporting is affected. If landing-page revenue needs separate tracking, that requires a support ticket for a second zone of a size already in use (see the Adsterra notes in `PROJECT_STATUS.md`).

## The shared module: js/ads.js

Landing pages were the third page family needing placements, after the blog index and the article pages. The registry lived inside `js/blog.js`, a 790-line content library. Neither option was acceptable: loading that library on nine marketing pages to fill one banner is waste, and copying the zone table into a second file is exactly the drift that has already caused two defects in this project.

So the placement concern moved to `js/ads.js` (187 lines, no dependencies), exposing `TBAds`: the `AD_ZONES` registry, `mountPlacement`, `mountLeaderboard`, `buildAdBreak`, `adBreakIndex` and `mountHosts`. `js/blog.js` now consumes it and dropped to 655 lines.

Three mounting paths, one registry:

| Page family | Hosts come from | Mounted by |
|---|---|---|
| `blog.html`, `post.html` | markup + runtime render | `js/blog.js` as it renders |
| `blog/<slug>.html` | generated markup | `TBAds` auto-mount |
| `*-template.html` (9) | hand-written markup | `TBAds` auto-mount |

Auto-mounting is opt-in through `data-ads-static` on the page's `<main>`, so a page whose renderer does its own mounting can never double-count impressions. `initStaticPost()` in `blog.js` was removed; the generated post pages now use the same auto-mount as the landing pages, which also let them stop loading `js/blog.js` and `js/blog-data.js` entirely — neither was read on a page whose metadata and body are already baked into the markup, and the post database grows with every published post.

## Verification

- Per-surface audit asserting the expected hosts, that every host-bearing page loads `js/ads.js`, that every referenced zone name resolves to a non-empty key, and that no indexable content page carries the Popunder (`pl30250761`) or Social Bar (`pl30250765`):

  | Surface | Hosts | ads.js | Popunder | Social Bar |
  |---|---|---|---|---|
  | `blog.html` | leaderboard, sidebar | yes | no | no |
  | `post.html` | leaderboard | yes | no | no |
  | `blog/<slug>.html` | leaderboard, incontent, endofarticle, rail | yes | no | no |
  | landing pages (9) | incontent | yes | no | no |
  | `index.html` | none | no | yes | no |
  | `loading.html` | none | no | no | yes |

- All nine landing pages carry exactly one host, one `data-ads-static` marker and one script tag.
- Script order checked on every page: `js/ads.js` precedes `js/blog.js` and `js/admin.js`.
- Served-markup check through a local server: the host, the marker and the script are present in the delivered HTML, and the placement sits between `.landing-body` and the FAQ, above `.landing-cta` and `.related-tools`.
- Structural pass across all 24 pages: tag balance, single `<h1>`, no duplicate ids, 40 JSON-LD blocks parse, 687 internal links resolve. `node --check` on all nine scripts.

Not verified: real ad fill and the visual result. Playwright is not installed here, so the centered hero and the in-content unit at 320px were checked against the CSS rather than rendered. Confirm fill through Adsterra impression counts after deploying, not by looking at one page load — frequency capping makes a single empty load meaningless (see `SOCIAL_BAR_NOT_DISPLAYING.md`).

## If this should be more aggressive later

The restrained choice here is one passive unit per landing page. Before adding a second, weigh it against what these pages exist to do: their measured job is sending clicks into `loading.html`, where the high-value formats already run. A second unit on the landing page is worth adding only if landing-page traffic turns out to bounce without converting at a high rate, which Clarity session replay can answer directly.
