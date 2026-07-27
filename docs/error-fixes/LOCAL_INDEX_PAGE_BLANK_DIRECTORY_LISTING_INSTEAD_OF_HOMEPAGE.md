# Local Index Page Blank: serve Returns a Directory Listing Instead of index.html

Date: July 27, 2026
Status: Fixed

## Issue Title

Reported as "index page is blank." Opening the local server's root URL showed a file browser listing `docs`, `site`, `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `PRD.md`, `README.md` and `netlify.toml` instead of the TemplateBox homepage. Clicking into `site` then produced an unstyled, non-functional page rather than the catalog.

## Root Cause

Two independent faults, one long-standing and one introduced by the `site/` move earlier the same day. Neither is a defect in the site itself: `site/index.html` was verified intact (15 catalog cards, 5,638 characters of visible text, valid tag structure).

**Fault 1, the actual cause of the blank page: `{"cleanUrls": false}` disables `serve`'s directory-index resolution.**

`serve.json` was added on July 20, 2026 to stop `serve` 301-redirecting `*.html` requests to extensionless URLs, because that redirect drops query strings and broke `loading.html?target=...` (see `LOCAL_SERVE_CLEAN_URL_DROPS_TARGET_QUERY.md`). Setting `cleanUrls: false` also switches off the behavior that maps a directory request to its `index.html`, and with `directoryListing` defaulting to true, `serve` lists the directory instead. Demonstrated by isolating the config:

```
# with site/serve.json present ({"cleanUrls": false})
$ curl -s http://localhost:4183/ | grep -o "<title>[^<]*</title>"
<title>Files within site\</title>

# same command, serve.json temporarily removed (serve defaults)
$ curl -s http://localhost:4184/ | grep -o "<title>[^<]*</title>"
<title>Free Invoice, Receipt and Resume Maker | TemplateBox</title>
$ curl -sD - -o /dev/null "http://localhost:4184/loading.html?target=mockup" | head -1
HTTP/1.1 301 Moved Permanently        <- and the original query-dropping bug is back
```

So the two settings were in direct conflict: `cleanUrls: true` serves `/` correctly but breaks the interstitial's query string; `cleanUrls: false` fixes the query string but stops `/` ever resolving to a page. This fault predates the `site/` move — it was simply less visible, because the listing used to show the site's own files and clicking `index.html` worked.

**Fault 2: serving the repository root instead of the publish directory.** After the move the repository root has no `index.html`, so the listing is of project folders. Worse, `serve` returns `site/index.html` for the URL `/site` **without** redirecting to `/site/`, so the browser resolves every relative path against `/`:

```
$ curl -s -o /dev/null -w "%{http_code}" http://localhost:4179/css/style.css       # what /site asks for
404
$ curl -s -o /dev/null -w "%{http_code}" http://localhost:4179/site/css/style.css  # where the file is
200
```

The HTML arrives but the stylesheet and every script 404, which is what produced the unstyled page after clicking into `site`.

## Fix Applied

One config file at the repository root, replacing `site/serve.json`:

```json
{
  "public": "site",
  "cleanUrls": false,
  "directoryListing": false,
  "rewrites": [
    { "source": "/", "destination": "/index.html" }
  ]
}
```

- **`public: "site"`** points `serve` at the publish directory no matter how it is invoked, which removes fault 2 entirely: `npx serve`, `npx serve .` and `npx serve site` all now serve the site correctly from the repository root.
- **`rewrites`** restores `/` to `index.html`, which `cleanUrls: false` had disabled. This is the fix for fault 1 — it keeps the query-string behavior the interstitial needs and gets the homepage back.
- **`directoryListing: false`** means a wrong URL 404s instead of quietly exposing a file browser, so this failure mode announces itself next time rather than looking like a blank page.
- `site/serve.json` was deleted. Nothing non-deployable remains inside the publish directory, so the `/serve.json` forced-404 rule was removed from `netlify.toml` as well.
- `.vscode/settings.json` was added with `liveServer.settings.root: "/site"`, because Live Server (recommended in CLAUDE.md alongside `serve`) serves the workspace root and would hit fault 2 in exactly the same way.

Local URLs now match production URLs exactly: `/index.html`, `/blog/<slug>.html`, `/css/style.css`, with no `/site` prefix anywhere.

## Testing Steps

All verified at fix time from the repository root:

1. `npx serve` — then check:
   - `curl -s http://localhost:<port>/ | grep -o "<title>[^<]*</title>"` must return the homepage title, not `Files within ...`.
   - `/index.html`, `/blog.html`, `/404.html`, `/blog/<slug>.html`, `/css/style.css`, `/js/app.js` all return 200.
   - `curl -sD - -o /dev/null "http://localhost:<port>/loading.html?target=mockup" | head -1` must be `HTTP/1.1 200 OK`, **not** a 301. A 301 here means the query string is being dropped and the countdown will land on the wrong editor.
   - `/does-not-exist.html` returns 404, not a listing.
   - `/PRD.md` and `/docs/memory/PROJECT_STATUS.md` return 404, matching production (they are outside the served directory).
2. Repeat step 1 with `npx serve .` and `npx serve site`. All three invocations were confirmed equivalent.
3. Load the homepage in a browser and confirm the catalog renders with styling and that a card click reaches `loading.html?target=...` with the query intact.

## Troubleshooting

- **A file listing at `/`** means the `rewrites` entry is missing or `serve` is reading a different config. `serve` reads `serve.json` from the current working directory, so run it from the repository root.
- **`cd site && npx serve .` is not equivalent** and should not be used: from inside `site/` the root `serve.json` is invisible, `serve` falls back to defaults, and the `?target=` query-dropping bug returns (verified: that invocation 301s `loading.html?target=mockup`). Serve from the repository root.
- **A page with no styling** is fault 2: check whether the URL has a `/site` prefix. If it does, the server is rooted at the repository instead of the publish directory.
- Do not "simplify" this config by deleting `cleanUrls: false` to get `/` working. That trades this bug for the query-dropping one; the `rewrites` entry is what lets both be correct at once.

## Related Files

- `serve.json` (repository root; replaces `site/serve.json`)
- `.vscode/settings.json` (Live Server root)
- `netlify.toml` (the `/serve.json` 404 rule became unnecessary and was removed)
- `docs/error-fixes/LOCAL_SERVE_CLEAN_URL_DROPS_TARGET_QUERY.md` — the July 20 fix whose side effect is fault 1 here; updated with a pointer to this document
- `docs/implementation/SITE_PUBLISH_DIRECTORY_MIGRATION.md` — the move that exposed fault 2
