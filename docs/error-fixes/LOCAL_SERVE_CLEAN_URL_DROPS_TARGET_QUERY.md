# `npx serve .` Silently Drops `?target=` on loading.html, Redirecting to the Wrong Editor

Date: July 20, 2026
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

## Testing Steps

1. `npx serve .` from the repo root.
2. `curl -sD - -o /dev/null "http://localhost:<port>/loading.html?target=mockup"` must return `200 OK`, not a `301`.
3. Open `loading.html?target=mockup` (and `?target=poster`, `?target=resume`) in a browser, let the countdown run to zero, and confirm it lands on the matching editor page each time.

## Troubleshooting

- If the redirect-to-wrong-page behavior returns after this fix, confirm `serve.json` is present in the directory being served (the `-c`/`--config` flag can point `serve` at a different file, overriding the root one) and that no other locally installed `serve.json` or `now.json` further up the directory tree is taking precedence.
- This class of bug (a local static-file server rewriting URLs in a way production doesn't) is worth checking first any time a flow works "sometimes" locally depending on which catalog card was clicked — compare `curl -D -` output for the request against what `netlify.toml` would actually do.

## Related Files

- `serve.json`
- `js/app.js` (`initLoadingPage`, `EDITOR_ROUTES`, `DEFAULT_TARGET`) — confirmed correct, not modified for this fix
- `loading.html` — confirmed correct, not modified for this fix
- `docs/error-fixes/LOADING_REDIRECT_STALL_FIX.md` — a different, previously-fixed defect in the same countdown/redirect flow; worth ruling out first if the symptom recurs, since both present as "the loading page didn't take me to the right place."
