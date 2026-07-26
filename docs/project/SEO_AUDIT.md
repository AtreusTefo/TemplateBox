# TemplateBox SEO Audit

Date: July 26, 2026
Auditor: Full-stack/SEO review session
Scope: `index.html`, all four editor pages, `blog.html`, `post.html`, `privacy.html`, `sitemap.xml`, `robots.txt`, `netlify.toml`, `js/blog.js`, `js/blog-data.js`

Companion to `docs/project/UI_UX_AUDIT.md`, conducted in the same session. Findings are ordered by impact, with structural defects ahead of technical hygiene, because the structural ones cap the ceiling of everything below them.

## 1. Baseline: What Was Already Correct

The site was not starting from zero. The following were verified as already sound and required no change:

- Canonical URL on every indexable page
- `noindex, nofollow` correctly applied to `loading.html`, which is properly excluded from `sitemap.xml`
- Open Graph tags present on all public pages except `post.html`
- Valid JSON-LD `WebApplication` schema on `index.html`, correctly placed in `<head>`
- Single `<h1>` per page across all pages
- Title tags within length limits and reasonably differentiated
- Descriptive, keyword-relevant meta descriptions under 160 characters
- Category filter pills implemented as real anchors rather than buttons, deliberately, for crawler indexability

## 2. Structural Findings

### 2.1 Editor pages had no crawlable internal link from anywhere on the site

Severity: Critical. Status: Resolved.

Every catalog call to action in `index.html` was a `<button type="button" data-target="...">`. Googlebot does not click buttons and does not execute click handlers that trigger navigation. The consequence: `resume.html`, `docs.html`, `poster.html` and `mockup.html` — the four pages carrying the site's entire commercial value — had zero inbound internal links. Their only discovery path was `sitemap.xml`.

A sitemap is a discovery hint, not a ranking signal. Internal links are how link equity flows and how Google infers site structure and relative page importance. Four orphaned pages is a severe structural handicap.

The fix does not require changing the monetization. Each CTA becomes a real anchor pointing at the editor page; `js/app.js` intercepts the click, calls `preventDefault()`, writes the template preset, and routes through `loading.html` exactly as before. Every human visitor with JavaScript enabled experiences an identical flow. Crawlers, which do not run the handler, follow the href and see a coherent link graph. This is standard progressive enhancement and mirrors the approach already taken deliberately for the filter pills.

Resolution: all fifteen catalog CTAs converted to anchors with the launch handler rewritten to intercept them.

### 2.2 A single URL competing for six unrelated search intents

Severity: Critical. Status: Resolved.

`docs.html` serves rent receipts, cash payment receipts, itemized business receipts, sales receipts, invoices, and employee warning notices from one URL under one title tag. These are six distinct search intents with six distinct competitor sets and effectively no keyword overlap. Google ranks URLs, not features. One URL can hold a primary ranking position for one intent cluster; the other five are structurally unable to compete regardless of content quality.

The same applies at lower magnitude to `resume.html` (three catalog cards) and `mockup.html` (three catalog cards).

Resolution: dedicated static landing pages per document type, each with its own title, H1, meta description, canonical, `FAQPage` schema, and genuinely useful body content, converting into the editor with the correct variant preset pre-selected. This is the largest available organic-traffic lever and is fully compatible with the zero-server constraint, since the pages are static files.

### 2.3 Blog post metadata exists only after JavaScript executes

Severity: High. Status: Resolved.

Every blog post resolves to `post.html?slug=...`. The static HTML served to any client contains `<title>Article | TemplateBox Blog</title>` and a generic description. The real title, canonical URL and `BlogPosting` schema are injected at runtime by `js/blog.js`. `post.html` also carried no Open Graph tags at all.

Two distinct consequences:

1. Google does render JavaScript, but on a deferred second-pass rendering queue that can lag the initial crawl considerably. Correct metadata arriving late is materially weaker than correct metadata arriving in the HTML.
2. Social crawlers do not execute JavaScript at all. Facebook, X, LinkedIn and WhatsApp will render every shared TemplateBox post as "Article | TemplateBox Blog" with a generic description and no image, indefinitely. Given four social accounts were added to the footer on July 25, 2026 specifically to drive distribution, this defect directly undermines that channel.

Resolution, implemented in four parts:

1. `admin.html` gained a **Download Post Pages** action that emits one static HTML file per visible post into `blog/<slug>.html`, with title, description, canonical, Open Graph, Twitter Card and `BlogPosting` JSON-LD baked into the served markup. The body is produced by passing the post through the existing `TBBlog.renderBlocks` and serializing the result, so there is exactly one block-rendering implementation in the project and the static output cannot drift from what the site shows. Because that renderer builds the DOM through `createElement` and `textContent` only, the serialized string is correctly escaped by construction.
2. Every link the site generates (blog index cards, the homepage guides strip) now points at `blog/<slug>.html` rather than the query route, via a single `postUrlFor()` helper in `js/blog.js`.
3. `netlify.toml` 301-redirects `post.html?slug=<slug>` to the static file. A redirect rather than a `noindex` was chosen deliberately: the old query URLs are already indexed, and a 301 consolidates their accumulated signal onto the new URL instead of discarding it.
4. `post.html` is retained as the draft-preview and local-testing route and carries `noindex, follow`. The admin preview was moved from `?slug=` to `?draft=` so the redirect rule cannot bounce a draft to a static file that has not been exported yet.

The approach remains entirely client-side and drag-and-drop deployable, consistent with `CLAUDE.md`.

### 2.4 Content volume is one article

Severity: High. Status: Open, programme required.

`js/blog-data.js` is 3.4KB containing a single post. Organic growth for a free-tool site is driven by long-tail informational queries feeding transactional tool pages. One article is not a content programme and cannot produce a measurable traffic curve.

This finding cannot be closed by a code change. It is recorded with a target cluster list in section 5 for execution over time.

## 3. Technical Findings

### 3.1 Structured data coverage

Severity: Medium-High. Status: Resolved.

Only `index.html` carried JSON-LD. The four editor pages, which are the pages a search visitor most plausibly lands on, carried none.

Applied:

- `SoftwareApplication` schema per editor page with its own name, description and category
- Site-wide `Organization` schema including `logo` and a `sameAs` array listing the four social profiles added on July 25, 2026. This is the mechanism by which Google associates those accounts with the brand entity, and it was a free win left unclaimed
- `BreadcrumbList` on editor, landing and blog pages
- `FAQPage` on the new document landing pages

Explicitly not applied: `HowTo` schema. Google removed HowTo rich results from search in 2023; implementing it would consume effort for no SERP benefit.

### 3.2 No Twitter Card tags anywhere on the site

Severity: Medium. Status: Resolved.

No page carried `twitter:card` or any related property. Every link shared to X rendered as a bare URL with no preview card, which suppresses click-through severely. Directly relevant given the X account added on July 25, 2026.

Resolution: `twitter:card`, `twitter:title`, `twitter:description` and `twitter:image` added to every public page.

### 3.3 Open Graph image is unsuitable

Severity: Medium. Status: Partially resolved, one manual step outstanding.

`assets/logo.png` is a 489KB logo image referenced as `og:image` site-wide. Three problems: social preview cards expect roughly 1.91:1, so a logo is cropped or letterboxed; 489KB is heavier than necessary for an asset fetched by every crawler on every share; and no `og:image:width` or `og:image:height` was declared, which forces platforms to fetch and measure before rendering.

Resolution: dimension properties declared, and a client-side Open Graph card generator added at `tools/og-image.html` that renders a correctly proportioned 1200x630 card using the same Canvas approach as the poster editor. The generated file must be saved to `assets/og-cover.png` once by the owner; until then the metadata continues to reference the existing logo. This is documented as an outstanding manual step in section 6.

### 3.4 Sitemap carried only signals Google ignores

Severity: Medium. Status: Resolved.

`sitemap.xml` set `<priority>` on all eight entries and `<lastmod>` on none. Google has stated publicly and repeatedly that it ignores `<priority>` entirely. It does use `<lastmod>`, as an input to recrawl scheduling, when the values are consistently accurate. The file therefore carried exclusively ignored signals while omitting the one that is consumed.

Resolution: `<priority>` removed, accurate `<lastmod>` values added, and all new landing pages, static blog posts, and company pages registered.

### 3.5 robots.txt Disallow conflicts with the noindex it is meant to enforce

Severity: Medium. Status: Resolved.

`robots.txt` contained `Disallow: /admin.html`, while `admin.html` separately carried `<meta name="robots" content="noindex, nofollow">`. These two mechanisms are mutually defeating. A `Disallow` directive prevents Google from fetching the page, which prevents it from ever reading the `noindex` instruction. A disallowed URL can still be indexed on the strength of external links, and in that state Google cannot discover that it was asked not to index it.

Resolution: the `Disallow` removed and replaced with an `X-Robots-Tag: noindex` response header scoped to that path in `netlify.toml`, which is authoritative, cannot be missed by a crawler that fetches the URL, and does not depend on the page's own markup.

### 3.6 Render-blocking third-party script on the primary indexed page

Severity: Medium-High. Status: Resolved.

The Adsterra Pop-Under tag in `index.html` was a synchronous `<script src="...">` in `<head>` with no `async` or `defer`. A synchronous third-party script blocks HTML parsing until it is fetched, parsed and executed, placing a cross-origin network round trip directly on the critical rendering path of the one page Google actually indexes. This degrades Largest Contentful Paint, which is a confirmed ranking factor on mobile.

Resolution: `async` applied. The Pop-Under attaches its own document-level click handler on execution, so asynchronous loading does not affect its behaviour. The 150ms deferred navigation in `launchTemplate()` that resolves the documented race condition in `docs/error-fixes/ADSTERRA_AD_CONFLICT_FIX.md` is unaffected and was left unchanged.

### 3.7 Render-blocking web fonts from a third-party origin

Severity: Medium. Status: Resolved.

Two Google Fonts families load through a render-blocking external stylesheet on every page. `preconnect` reduces but does not eliminate the cost: the stylesheet must still be fetched from `fonts.googleapis.com` before the font files can even be discovered on `fonts.gstatic.com`, producing two sequential cross-origin round trips on the critical path.

Resolution: the font stylesheet is loaded non-render-blocking via the `media="print"` swap pattern with a `<noscript>` fallback, and `font-display: swap` is relied upon so text paints immediately in the fallback face. Full self-hosting of the woff2 files would eliminate the third-party dependency entirely and remains the stronger option; it was not applied here because it introduces binary assets and a licensing/attribution obligation that warrant a separate decision. Recorded in section 6.

### 3.8 Internal linking density

Severity: Medium. Status: Resolved.

Three header links and three footer links site-wide, with no cross-linking between editors and no contextual links from blog content into the tools. Internal links are a primary mechanism for both crawl discovery and relative-importance inference.

Resolution: multi-column footer naming every tool and landing page across all public pages, plus a related-tools block at the foot of each editor.

### 3.9 Missing trust and entity pages

Severity: Medium. Status: Resolved.

No About, Contact or Terms page existed. TemplateBox publishes tools for invoices, rent receipts and employment disciplinary notices — subject matter touching money and employment, where Google's quality guidance directs raters to scrutinize who operates the site and how contactable they are. An identifiable operating entity, reachable contact information and published terms are the baseline expectation for this category.

Resolution: About and Terms pages added, linked site-wide from the footer, and referenced by the `Organization` schema.

## 4. Findings Deliberately Not Actioned

| Item | Reason |
|---|---|
| `HowTo` structured data | Google removed HowTo rich results in 2023. No SERP benefit available |
| Content Security Policy in `netlify.toml` | Unchanged decision from PROJECT_STATUS: Adsterra domains rotate enough that a hand-written allowlist would likely break ad delivery. Not an SEO factor |
| Removing the ten-second interstitial | It is the monetization model, is `noindex, nofollow`, and sits behind a click rather than on an indexed URL. Interstitial penalties target interstitials on landing pages arriving from search. The UI/UX audit addresses its honesty and perceived duration instead |
| `hreflang` | Single-language site |
| Pagination markup on `blog.html` | One post. Revisit past roughly twenty |

## 5. Target Query Clusters for the Content Programme

Recorded here so the programme in finding 2.4 has a concrete starting point. Each cluster should resolve to one landing page plus supporting blog articles that link into it.

| Cluster | Primary landing page | Supporting article themes |
|---|---|---|
| Rent receipts | `rent-receipt-template.html` | What a rent receipt must contain; landlord record-keeping; rent receipts for tax deduction claims |
| Cash payment receipts | `cash-payment-receipt-template.html` | Proof of payment for informal sales; when a handwritten receipt is sufficient |
| Invoices | `free-invoice-template.html` | Payment terms explained; what makes an invoice legally complete; chasing late payment |
| Itemized and sales receipts | `itemized-receipt-template.html`, `sales-receipt-template.html` | Counter-sale record keeping; itemized versus simple receipts |
| Employee warning notices | `employee-warning-notice-template.html` | Documenting a verbal warning; progressive discipline steps; what to include in a written warning |
| Resumes | `ats-resume-template.html` | Why PDF text must be selectable for ATS parsing; resume length; formatting mistakes that break parsers |
| Product mockups | `tshirt-mockup-generator.html` | Print-on-demand artwork sizing; presenting designs without a photoshoot |
| Posters | `poster-maker.html` | Print resolution basics; framing and border choices |

## 6. Outstanding Manual Steps

| Step | Owner action required |
|---|---|
| Generate the remaining Open Graph cards | Three are done as of July 26, 2026: `og-resume.png` (wired to `ats-resume-template.html` and `resume.html`), `og-rent-receipt.png` and `og-warning-notice.png`. Every other page still falls back to `assets/logo.png`. Open `tools/og-image.html`, step through the remaining presets, save into `assets/`, and wire each page's `og:image` and `twitter:image` to its own file. **`og-cover.png` is the important one**: it is the site-wide default that `index.html` and every unwired page should use instead of the logo |
| Restore `og:image:width` / `og:image:height` as cards land | Those declarations were removed from the nine pages still on `logo.png`, because they stated 1200x630 for an image that is actually 1219x1509, and platforms use the declared size to reserve the preview frame before the file arrives. Pages wired to a real 1200x630 card keep an accurate declaration. Re-add the pair whenever a page is pointed at a generated card |
| Resubmit sitemap in Search Console | After deployment, so the new landing pages and static blog posts enter the crawl queue |
| Decide on font self-hosting | Stronger than the current non-blocking load, but introduces binary assets and an attribution obligation |
| Content programme | Section 5 clusters, executed over time |

## 7. Related Documents

- `docs/project/UI_UX_AUDIT.md` — companion audit; findings 2.1, 3.8 and 3.9 overlap
- `docs/memory/PROJECT_STATUS.md` — live infrastructure, Search Console and Adsterra operational knowledge
- `docs/implementation/BLOG_SYSTEM_IMPLEMENTATION.md` — blog authoring and export flow altered by finding 2.3
- `CLAUDE.md` — Critical Rule 2 mandates Google Search Central compliance, metadata quality, single-H1 hierarchy and valid JSON-LD in `<head>`