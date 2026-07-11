# Loading Page Countdown Stalls at Zero Without Redirecting to the Editor

Date: July 11, 2026
Status: Fixed

## Issue Title

On loading.html, the countdown reaches 0 and stays there; the automatic redirect to the selected editor (resume.html or poster.html) never completes. Observed only after the live Adsterra ad scripts were installed on the page; the redirect worked reliably before ad integration.

## Root Cause

The redirect was issued exactly once, as a single `window.location.href` assignment when the countdown reached zero. Browser navigation assignments are not final until they commit: a later navigation started by any script on the page supersedes an earlier uncommitted one, and an uncommitted navigation can also hang indefinitely if its destination never responds.

The ad scripts on loading.html (banner tags and the Social Bar widget) can start their own navigation attempts. In the observed environment, ad campaign domains were additionally sinkholed by FortiGuard DNS filtering to an address that accepts no connections (see the related document below), producing exactly the hanging-navigation condition: an ad-initiated navigation to an unreachable destination out-raced or cancelled the one-shot editor redirect, leaving the page visibly stuck at 0.

Diagnostic signature that distinguishes this from a countdown failure: the display shows 0, which is set by the same code branch that issues the redirect, proving the timer ran to completion and the redirect was issued but did not survive.

## Fix Applied

- `js/app.js` (`initLoadingPage`)
  - The one-shot assignment was replaced with a navigation watchdog. At zero, the editor URL is resolved once via `new URL(destination, window.location.href)` so an ad-injected `<base>` element cannot repoint the relative path, then `window.location.replace(editorUrl)` is issued immediately and re-issued every 700 ms by a `setInterval`. Each re-issue supersedes whatever competing navigation is currently pending. The interval is never cleared explicitly because a successful navigation unloads the page, which destroys all timers; if a competing script cancels or out-races one attempt, the next attempt fires within 700 ms.
  - `location.replace` is used instead of assigning `location.href` so repeated attempts do not stack history entries; the loading page is also intentionally absent from history after the redirect, matching its role as a transient waypoint.

This is the same class of defect fixed for index.html CTA clicks in the related document below (last navigation assignment wins), addressed there with a one-shot delayed assignment because the competing pop-under fallback fires exactly once per click. On loading.html the interference window spans the whole page lifetime, so persistent re-assertion is required instead of a fixed delay.

## Testing Steps

1. Open the live site, click a catalog CTA, and let the countdown run to zero without interacting. The browser must land on the correct editor for the chosen template.
2. Repeat with the target parameter for both editors (loading.html?target=resume and loading.html?target=poster).
3. Repeat on a network where ad domains are blocked or sinkholed (the original failure environment): the redirect must still complete within roughly one watchdog tick of reaching zero.
4. After landing in the editor, press the browser back button: the loading page must not reappear (location.replace behavior).

## Troubleshooting

- Countdown still stalls at 0: open DevTools Network and check whether resume.html/poster.html requests appear every ~700 ms and are being cancelled; if so, identify what is issuing the competing navigation. As a mitigation, shorten the watchdog interval in js/app.js.
- Countdown never reaches 0: unrelated to this fix; the timer itself is not running (check for a js/app.js load or parse failure in the console).

## Related Files

- `js/app.js`
- `loading.html`
- `docs/error-fixes/ADSTERRA_AD_CONFLICT_FIX.md` (same defect class on index.html; also documents the FortiGuard DNS sinkhole environment)
- `docs/error-fixes/LOADING_REDIRECT_STALL_FIX.md` (this document)
