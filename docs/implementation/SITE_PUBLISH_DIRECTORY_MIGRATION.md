# Publish Directory Migration, 404 Page and Footer Restructure

Date: July 27, 2026

Four changes carried out in one pass, all structural rather than behavioral. No public URL changed, and no user-facing flow changed except the footer's link groupings.

## 1. Deployable files moved into `site/`

`netlify.toml` previously set `publish = "."`, so the publish directory was the whole repository and every documentation, specification and instruction file was a public URL (see `docs/error-fixes/INTERNAL_FILES_PUBLICLY_SERVED.md`).

What moved into `site/`: all 21 HTML pages, `css/`, `js/`, `assets/`, `blog/`, `tools/`, `robots.txt`, `sitemap.xml`. (`serve.json` moved there first and was pulled back out the same day — see the correction below.)

What stayed at (or came back to) the repository root: `netlify.toml`, `serve.json`, `.vscode/settings.json`, `docs/`, `PRD.md`, `README.md`, `CLAUDE.md` and its three byte-identical copies (`AGENTS.md`, `GEMINI.md`, `.github/copilot-instructions.md`), `.gitignore`.

Why no URL changed: the publish directory is the web root. `site/index.html` is served at `/index.html`, so canonicals, `og:url` values, sitemap entries and every relative path between site files are all still correct. Nothing needed rewriting — this is the property that makes the move cheap, and the reason it was preferable to per-path 404 rules.

Consequences to remember:

- Local testing is `npx serve` from the repository root, where `serve.json` points the server at `site/`. Running it from inside `site/` misses that config and reintroduces the `?target=` query-dropping defect.
- Drag-and-drop deploys use the `site` folder.
- **Correction, same day:** putting `serve.json` inside `site/` was wrong twice over. It left a non-deployable in the publish directory needing its own 404 rule, and serving from the repository root then produced a file listing at `/` plus broken relative paths under `/site`. The config now lives at the repository root with `public: "site"`, so `npx serve` from the root serves the site correctly and the publish directory contains only deployables. `netlify.toml` needs no internal-file 404 rules at all. Full diagnosis: `docs/error-fixes/LOCAL_INDEX_PAGE_BLANK_DIRECTORY_LISTING_INSTEAD_OF_HOMEPAGE.md`.
- All eleven redirect rules were deleted rather than left as dead config.
- Documentation written before this date uses unprefixed paths (`js/app.js`); read them as `site/js/app.js`. Rewriting every historical reference would have been a large diff with no functional benefit, so the convention is recorded in `CLAUDE.md` and `docs/DOCUMENTATION_INDEX.md` instead.

## 2. `site/404.html`

Netlify serves a `404.html` at the publish root for any unmatched path automatically. Before this it produced Netlify's default not-found page.

The page carries the standard header, hero and footer, `noindex, follow` (follow, because its whole purpose is to route a lost visitor onward), no canonical and no sitemap entry — Netlify serves it for many URLs, so a canonical would be a claim about a page that does not exist. It includes the Clarity snippet, so 404 hits are visible in session replay alongside everything else, and a nine-item Popular Pages list covering the landing pages and all four editors. Those links deliberately carry no `data-target` attribute: `bindLaunchControls()` in `js/app.js` routes anything with one through the ad interstitial, which belongs to a catalog card click, not to error recovery.

## 3. Footer restructured into five columns

The old "Creative Tools" column mixed three landing pages with two of the four editors, which is why `docs.html` and `poster.html` looked arbitrarily omitted. Landing pages and editors are now separate columns and each is complete:

| Column | Contents |
|---|---|
| Receipts and Invoices | The six business-document landing pages |
| Resumes and Creative | `ats-resume-template.html`, `poster-maker.html`, `tshirt-mockup-generator.html` |
| Editors | `resume.html`, `docs.html`, `poster.html`, `mockup.html` |
| Learn | `blog.html`, `index.html#templates` |
| Company | `about.html`, `privacy.html`, `terms.html` |

`.footer-cols` uses `repeat(auto-fit, minmax(11rem, 1fr))`, so the fifth column needed no CSS change and still collapses to a centered stack on narrow viewports.

Two drift problems were fixed in the same pass:

- `privacy.html` alone wrapped each footer column in `<details open><summary><h2>...</h2></summary>`, an accordion variant with no supporting CSS anywhere in the stylesheet, so it rendered with default browser disclosure triangles. Normalized.
- The nine landing pages carried the opening `<footer>` tag at column 0 while every other page indented it four spaces. Normalized, so all 22 copies are now byte-identical.

The footer is applied from one source: a script generated the block, wrote it into all 22 pages (the root pages plus the exported post page, with `../` prefixes where needed) and re-quoted it as the `FOOTER` constant in `js/admin.js`. `admin.html` keeps its deliberately minimal footer as a private tool.

Verification: all 22 copies hash identically after normalizing the `../` prefix; the generator's output is byte-identical to the exported post page's footer; all 18 relative link targets resolve on disk.

## 4. Static guides archive on `blog.html`

Covered in full in `docs/error-fixes/BLOG_POSTS_NOT_CRAWLABLE_WITHOUT_JAVASCRIPT.md`. In short: the blog index rendered every post link in JavaScript, so `sitemap.xml` was the only static route to a post. `blog.html` now carries a visible archive list of every published post, generated by a new **Copy Guides Archive** action in `admin.html` so it cannot disagree with the data file or the exported pages.

## Publishing a post: now four artifacts

1. Export `js/blog-data.js` from `admin.html` and replace `site/js/blog-data.js`.
2. Export the post pages and put them in `site/blog/`.
3. Copy Guides Archive and paste it over the `<ul>` inside `<nav class="guide-archive">` in `site/blog.html`.
4. Add the post URL to `site/sitemap.xml`.

## Verification performed

- All 23 pages: tag balance, exactly one `<h1>` each, no duplicate `id` attributes, every JSON-LD block parses.
- Every relative link across `site/` resolves to a file that exists, including the `../` paths from `site/blog/`.
- Footer parity across all copies plus the generator constant.
- `node --check` on all modified JavaScript; `netlify.toml` parsed with `tomllib`.
- `npx serve` smoke test from the repository root: `/` serves the homepage (title checked, not just the status code), every page and asset returns 200 at the same paths as before the move, `loading.html?target=mockup` returns 200 rather than a 301, unknown paths 404 instead of listing files, and `/PRD.md` and `/docs/...` 404 locally exactly as they will in production. All three of `npx serve`, `npx serve .` and `npx serve site` were confirmed equivalent.

Not verified: browser rendering. Playwright is not installed in this environment, so the five-column footer at 320px, the archive list's appearance, and the 404 page's layout were checked structurally and against the existing token/CSS definitions, not visually. Netlify-specific behavior (the publish-directory setting taking effect and the automatic `404.html` handling) cannot be tested locally and needs a post-deploy check.
