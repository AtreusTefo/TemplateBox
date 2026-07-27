# `npx serve .` Silently Drops `?target=` on loading.html, Redirecting to the Wrong Editor

Date: July 20, 2026
Updated: July 27, 2026 — this fix was **incomplete**. `cleanUrls: false` also disables `serve`'s directory-index resolution, so the root URL returned a file listing instead of the homepage; it presented later as "the index page is blank." The config now lives at the repository root and carries a `rewrites` entry that restores `/` while keeping the query-string behavior described here. Full diagnosis: `LOCAL_INDEX_PAGE_BLANK_DIRECTORY_LISTING_INSTEAD_OF_HOMEPAGE.md`. Read the Revised Solution section below before acting on the Fix Applied section.
Status: Fixed

## Issue Title

Reported as "the countdown is not working on the mockup page." The countdown on `loading.html?target=mockup` actually runs 10 to 0 normally, but at zero the page redirects to `resume.html` instead of `mockup.html`, making the flow look broken. Same defect affects `loading.html?target=poster`; it went unnoticed for that editor because the wrong destination (`resume.html`, the `DEFAULT_TARGET` fallback in `js/app.js`) happens to be a valid page, not an error.

## Root Cause

This is a local-dev-server artifact, not an application bug. `js/app.js`, `loading.html`, and `netlify.toml` were all unaffected and correct.

CLAUDE.md's own recommended local test command is `npx serve .`. The `serve` CLI ships with `cleanUrls` enabled by default: any request for `*.html` gets a `301 Moved Permanently` to the extensionless path before the file is ever served. That redirect does not forward the query string:

```
$ curl -sD - -o /dev/null "http://localhost:4173/loading.html?target=mockup"
HTTP/1.1 301 Moved Permanently
Location: /loading
```

The browser follows the redirect to `/loading` with the `?target=mockup` query gone. `initLoadingPage()` in `js/app.js` then falls back to `DEFAULT_TARGET` ("resume"), so the countdown completes correctly and redirects correctly — just to the wrong editor.

Netlify (the actual production host) has no equivalent redirect configured in `netlify.toml`, so `templatebox.win/loading.html?target=mockup` is served as-is in production; this defect is local-testing-only.

## Fix Applied

- Added `serve.json` at the repo root:
  ```json
  { "cleanUrls": false }
  ```
  This disables `serve`'s `.html`-stripping redirect, so `npx serve .` now serves every page exactly as requested — matching Netlify's actual behavior and preserving query strings on `loading.html`.

## Why the Previous Solution Was Incomplete

`{"cleanUrls": false}` does two things, and only one of them was wanted. It stops the `.html`-to-extensionless 301 that drops query strings, which is the fix this document is about. It also stops `serve` resolving a directory request to that directory's `index.html`, and since `directoryListing` defaults to true, the root URL then renders a file browser rather than the homepage. Verified by isolating the file: with `serve.json` present, `GET /` returned `<title>Files within site\</title>`; with it temporarily removed, `GET /` returned the real homepage title and `loading.html?target=mockup` went back to 301ing.

That side effect existed from July 20 onward. It only became visible after the deployable site moved into `site/` on July 27, because until then the listing showed the site's own files and clicking `index.html` worked, which looks like a quirk rather than a fault.

## Revised Solution

`site/serve.json` was replaced by a single `serve.json` at the repository root:

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

`cleanUrls: false` still does the job this document describes. The `rewrites` entry restores the homepage at `/`. `public` points `serve` at the publish directory regardless of how it is invoked, and `directoryListing: false` makes a wrong path 404 instead of silently listing files. Do not remove `cleanUrls: false` to "fix" the root URL — that reintroduces the query-dropping defect. Both settings are needed together.

## Testing Steps

1. `npx serve` from the repo root (all of `npx serve`, `npx serve .` and `npx serve site` are equivalent now that `public` is set; running it from inside `site/` is not, and reintroduces this defect).
2. `curl -sD - -o /dev/null "http://localhost:<port>/loading.html?target=mockup"` must return `200 OK`, not a `301`.
3. Open `loading.html?target=mockup` (and `?target=poster`, `?target=resume`) in a browser, let the countdown run to zero, and confirm it lands on the matching editor page each time.

## Troubleshooting

- If the redirect-to-wrong-page behavior returns after this fix, confirm `serve.json` is present in the working directory the command was run from (the repository root, not `site/`) (the `-c`/`--config` flag can point `serve` at a different file, overriding the root one) and that no other locally installed `serve.json` or `now.json` further up the directory tree is taking precedence.
- This class of bug (a local static-file server rewriting URLs in a way production doesn't) is worth checking first any time a flow works "sometimes" locally depending on which catalog card was clicked — compare `curl -D -` output for the request against what `netlify.toml` would actually do.

## Related Files

- `serve.json`
- `js/app.js` (`initLoadingPage`, `EDITOR_ROUTES`, `DEFAULT_TARGET`) — confirmed correct, not modified for this fix
- `loading.html` — confirmed correct, not modified for this fix
- `docs/error-fixes/LOADING_REDIRECT_STALL_FIX.md` — a different, previously-fixed defect in the same countdown/redirect flow; worth ruling out first if the symptom recurs, since both present as "the loading page didn't take me to the right place."
