# No Static Link to Any Blog Post: sitemap.xml Was the Only Route to blog/<slug>.html

Date: July 27, 2026
Status: Fixed

## Issue Title

The served markup of `blog.html` contained no link to any blog post. Every card on the blog index, and every card in the homepage guides strip, is created in JavaScript, so a client that does not execute scripts saw an empty article area and no path to `blog/<slug>.html`. The only static reference to a post anywhere in the project was its `<loc>` entry in `sitemap.xml`.

## Root Cause

The blog index was designed as a runtime renderer over a static data file. `initBlogIndex()` in `js/blog.js` clears `[data-blog-featured]` and `[data-blog-list]` and builds a featured card plus one row per post from `window.TB_BLOG_POSTS`; `initGuidesStrip()` in `js/app.js` does the equivalent for the homepage strip, setting `link.href` on an element it creates. Both are correct as written — the omission is that neither leaves anything behind in the HTML.

This is the same defect class as two already-documented ones, arriving from a third direction:

- The editor pages once had zero crawlable inbound links because their launch controls were `<button>` elements (fixed July 26, 2026 by converting them to anchors).
- Post metadata was resolved at runtime, so social crawlers previewed every share as a generic "Article" (fixed July 26, 2026 by exporting static post pages).

In each case the page worked for a human with JavaScript and was invisible to something that does not run it. Here the consequence was that post discovery depended entirely on the sitemap: Google renders JavaScript, but only on a deferred second pass, and crawlers that never render (including social and several non-Google indexers) had no route from the blog index to a post at all. The hub page for the content programme passed no internal link equity to the content.

## Fix Applied

- `site/blog.html`: added a static archive after the card layout —
  ```html
  <nav class="guide-archive" aria-label="All guides" data-guide-archive>
      <h2>All guides</h2>
      <ul>
          <li><a href="blog/<slug>.html">Title</a> <span>July 18, 2026</span></li>
      </ul>
  </nav>
  ```
  It sits outside the two containers `initBlogIndex()` clears, so the JS render cannot remove it and cannot duplicate it. It is visible to every visitor, not hidden markup for crawlers only: a complete archive index is legitimate navigation, whereas links hidden from users are a ranking-manipulation signal.
- `site/js/admin.js`: added `buildArchiveList()` and `copyArchiveList()`, exposed as a **Copy Guides Archive** button in `admin.html`. The list is generated from the same workspace data as the post pages and the data file, so the archive cannot disagree with them about which posts exist. Emitted as clipboard text rather than a file because it replaces one element inside a hand-maintained page.
- `escapeMarkup()` was added alongside it. This export is the one place in the project that builds markup as a string from post data (everything else renders through `createElement`/`textContent`), so the four characters that could break out of the attribute or element context are escaped explicitly.
- `site/css/style.css`: `.guide-archive` styles, composed from the existing spacing and color tokens.
- The `<noscript>` line on `blog.html` used to read "The article list requires JavaScript to display," which is now false; it points at the archive instead.
- `admin.html`'s publishing checklist gained the archive step and now names four artifacts: `js/blog-data.js`, `blog/<slug>.html`, the archive list in `blog.html`, and `sitemap.xml`.

The homepage guides strip was deliberately left as a JavaScript render. It is a "latest three" widget, not a discovery path, and `blog.html` is statically linked from the primary nav and the footer of all 22 pages, so the crawl route is now index to blog index to post without it.

## Testing Steps

1. Verified at fix time that the real `buildArchiveList()` output is byte-identical to the `<ul>` in `blog.html`. The check extracts the function from `js/admin.js` and runs it in a `vm` context against `js/blog-data.js`, with the real `TB.desanitize` (from `js/app.js`) and `TBBlog.formatDate` (from `js/blog.js`), then compares: matched, 1 link, 0 missing targets, and every visible post present.
2. Serve locally (`npx serve site`) and load `blog.html` with JavaScript disabled. The archive must list every published post, and each link must open the post page.
3. Re-enable JavaScript and reload. Cards render as before, and the archive remains — exactly one copy of it.
4. `curl -s http://localhost:<port>/blog.html | grep 'blog/'` must return one line per published post. This is the check that actually matters: it is what a non-rendering crawler sees.
5. Publish flow: add a post in `admin.html`, click Copy Guides Archive, paste over the `<ul>`, and confirm the new post appears with no JavaScript.

## Troubleshooting

- If the archive appears twice, something is rendering into `[data-guide-archive]`. Nothing should: `js/blog.js` only touches `[data-blog-featured]` and `[data-blog-list]`.
- If a post is missing from the archive but present in the cards, the archive list was not regenerated after publishing. Regenerate it rather than editing the `<ul>` by hand; hand-editing is how the copies drift apart.
- A post hidden with `visible: false` is excluded from both the archive and the cards, by the same filter. It should also be removed from `sitemap.xml`, or the sitemap will advertise a page nothing links to.

## Related Files

- `site/blog.html` (`nav.guide-archive`)
- `site/js/admin.js` (`buildArchiveList`, `copyArchiveList`, `escapeMarkup`)
- `site/admin.html` (Copy Guides Archive control, publishing checklist)
- `site/css/style.css` (`.guide-archive`)
- `site/js/blog.js` (`initBlogIndex`) and `site/js/app.js` (`initGuidesStrip`) — the runtime renderers, unmodified
- `docs/project/SEO_AUDIT.md` finding 2.1 — the button-to-anchor fix for the editor pages, the same defect class
- `docs/memory/PROJECT_STATUS.md` — July 26 entry on static post pages, also the same defect class
