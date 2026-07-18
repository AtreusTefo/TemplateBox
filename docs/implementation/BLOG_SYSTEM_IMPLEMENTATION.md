# Blog System Implementation

Date: July 18, 2026

## Overview

A serverless blog with a local admin panel, following the existing 100% client-side architecture. Posts are authored in `admin.html`, stored as drafts in the browser's localStorage, and published by exporting a static data file (`js/blog-data.js`) that is committed and deployed like any other asset. Public blog pages carry Adsterra banner placements; the admin panel carries none.

## Files Added

| File | Purpose |
|---|---|
| `blog.html` | Public blog index. Featured hero card for the newest post, a "Latest Articles" list for the rest, a sticky 160x600 sidebar rail on wide viewports, leaderboard ad host up top; Blog JSON-LD schema. |
| `post.html` | Single post renderer. Selects a post via `?slug=`; sets title, meta description, canonical, and BlogPosting JSON-LD at render time; in-content and end-of-article banners. |
| `admin.html` | Private authoring panel (noindex, robots-disallowed, unlinked). Post list with Edit/View/Delete, add/edit form, preview, export workflow. |
| `js/blog.js` | Shared library: block content model (parse/serialize), XSS-safe DOM rendering, size-aware ad zone registry, page initializers. |
| `js/blog-data.js` | The published post data (`window.TB_BLOG_POSTS`). This file is the blog database; the admin panel generates its replacement. |
| `js/admin.js` | Admin panel logic: localStorage workspace, cover image intake with mime enforcement, data file export. |

## Files Modified

- `css/style.css` — blog index, post page, ad placement, and admin panel styles; responsive rules.
- `index.html` — Blog link added to header nav and footer.
- `sitemap.xml` — added `blog.html` and the seed post URL.
- `robots.txt` — added `Disallow: /admin.html`.

## Publishing Workflow

1. Open `admin.html` (locally or on the live site; it edits only that browser's localStorage).
2. Add or edit posts. Drafts save to localStorage under `tb_admin_posts`. On first use the workspace seeds itself from the deployed `js/blog-data.js`.
3. View proofs a draft on the real `post.html` via `?slug=...&preview=1` (preview mode reads localStorage instead of live data).
4. Click Download `js/blog-data.js`, replace the file in the project, commit and push to `main` (Netlify auto-deploys) or drag the folder into Netlify.

The admin panel is intentionally public-safe: it contains no credentials and can only modify the visitor's own localStorage. Publishing requires repository/Netlify access, which is the real authorization boundary.

## Content Model

Post body content is stored as typed blocks, never HTML:

```
{ type: "p" | "h2" | "h3" | "quote", text }
{ type: "ul" | "ol", items: [] }
{ type: "img", src, alt }
```

The admin form edits a plain-text markup form of this model (`## heading`, `- item`, `1. item`, `> quote`, `[image: url | alt]`, blank-line paragraphs, inline `**bold**` / `*italic*` / `[label](url)`), parsed by `TBBlog.parseContent` and serialized back by `TBBlog.blocksToText`.

## Security

- All rendering uses `createElement` + `textContent`; no post data ever reaches `innerHTML`.
- All text fields pass through `TB.sanitize` at the write boundary and `TB.desanitize` at render, matching the editors' pattern.
- Image sources and link hrefs are validated against whitelists (`https?://`, `data:image/*;base64` for images, relative `*.html` for internal links). `javascript:` and non-image data URIs are rejected; failed links degrade to plain text, failed images are dropped.
- Cover upload enforces `file.type` matching `image/*` (execution terminates on mismatch) and a 400 KB cap because covers inline into the exported data file as data URIs.
- The `?slug=` parameter only selects from the shipped post array; it cannot inject content or redirect.

## Ad Placements (size-aware registry)

All blog placements are declared in `AD_ZONES` at the top of `js/blog.js`. A placement renders only when its zone key is non-empty; empty-key placements produce zero markup and zero layout shift. Activating a new size means pasting its key into the registry — no page edits.

| Placement | Size | Location | Zone key |
|---|---|---|---|
| `leaderboard` | 728x90 | Top of blog.html and post.html, desktop | `7577a9abda8083816fafd71754b18205` |
| `leaderboardMobile` | 320x50 | Same host, chosen instead of 728x90 under 48rem | `101fe70128e51351589ecd23ab2d0e21` |
| `inContent` | 300x250 | Inside post body after the second block (skipped on very short posts) | Reuses `4a408738c2170da16b47c5ac05b3780a` |
| `endOfArticle` | 300x250 | After the post body | Reuses `70d844a3963c8415efa49af391c897a0` |
| `skyscraper` | 160x600 | Sticky rail beside the article, viewports over 70rem | `aaa51e997d5bd5badf6557a7773f78a6` |

All five zones were provisioned in the Adsterra dashboard and activated on July 18, 2026.

Notes:

- Banner tags run in isolated `srcdoc` iframes, the same anti-clobbering strategy as `loading.html` (two Adsterra tags sharing one window scope corrupt each other's `atOptions`).
- Reusing the two live 300x250 keys across `loading.html` and blog pages is functionally fine per Adsterra; distinct zones are only needed for separated reporting.
- The leaderboard host picks 728x90 or 320x50 once at page load via `matchMedia`; it does not swap on resize, to avoid double-counting impressions.
- The homepage and the two editors remain ad-free per the standing architecture decision; the blog is a new, deliberately monetized surface like `loading.html`, with the difference that blog pages are indexable content, so only passive banner formats are used there (no Popunder, no Social Bar).

## Blog Index Layout

`blog.html` uses a hero-plus-list-plus-rail layout: `initBlogIndex()` in `js/blog.js` sorts visible posts by date, renders the newest as a large `blog-featured-card`, and renders the rest as `blog-list-row` items under a "Latest Articles" heading (skipped entirely when there is only one post). A sticky `160x600` skyscraper mounts into `[data-ad-sidebar]` alongside the article column, gated to viewports of 70rem and up — same threshold and zone (`AD_ZONES.skyscraper`) as the rail on `post.html`. List rows collapse to a stacked layout under 40rem for phones.

## Testing Performed

- `node --check` on all four blog-related JS files.
- Node vm harness, parse layer: block grouping (paragraph joining, list grouping, multi-line quote merge), heading/image syntax, serialize-reparse round-trip stability, image whitelist accept/reject cases, seed data integrity, date formatting. 16/16 pass.
- Node vm harness, render layer (minimal DOM stub): bold/italic/link creation, external links get `rel="noopener"` + `target="_blank"`, relative internal links stay same-tab, `javascript:` links degrade to text, malicious image blocks dropped, figure/figcaption structure, list and blockquote structure, sanitized entities rendering back as literal text. 12/12 pass.
- Node vm harness, blog index layout (DOM stub with attribute/class `querySelector`, capturing and firing the real `DOMContentLoaded` handler): featured card selects the newest post, list renders remaining posts under a heading, list heading/rows omitted with only one post, sidebar mounts only at wide viewports, leaderboard mounts, empty-post state renders the placeholder message in the featured slot with an empty list. 13/13 pass.
- Browser pass still recommended: load `blog.html`, `post.html?slug=free-cv-resume-templates-build-professional-resume-fast`, and `admin.html` via a local static server; confirm all five banner sizes fill, the sidebar/rail appear only above 70rem, and layouts stack correctly under 48rem/40rem on mobile.

## Related Files

`blog.html`, `post.html`, `admin.html`, `js/blog.js`, `js/blog-data.js`, `js/admin.js`, `css/style.css`, `index.html`, `sitemap.xml`, `robots.txt`
