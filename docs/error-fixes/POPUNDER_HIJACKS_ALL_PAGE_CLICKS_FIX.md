# Pop-Under Hijacks Every Homepage Click: Pills, Navigation, Catalog and Launch Buttons Redirect Off-Site

Date: July 27, 2026
Status: Fixed and browser-verified

## Issue Title

Clicking anything on index.html — Open Editor buttons, header navigation links, the template section, or the category filter pills — sometimes redirects the tab to an external ad website instead of performing the expected action.

## Root Cause

The Adsterra Pop-Under script in the head of index.html attaches its own click handler at document level, so it observes every click anywhere on the page, not just the monetized launch controls. Its intended behavior is to open the ad in a background tab. When the browser's popup blocker suppresses that background window (the default state in every modern browser), the script falls back to redirecting the current tab to the ad URL.

The consequences differ by what was clicked:

1. **Filter pills** perform no navigation of their own, so the ad's fallback redirect wins unopposed. Every popup-blocked pill click sends the visitor off-site.
2. **Navigation links** (header, footer, in-copy links) navigate via the browser default, which races the ad's redirect; whichever navigation commits last wins, so the outcome is a coin flip weighted by network timing.
3. **Launch controls** (`[data-target]` anchors) were protected by the 150 ms deferred navigation from `ADSTERRA_AD_CONFLICT_FIX.md`, but that protection is a single one-shot assignment: a fast ad response can commit inside the 150 ms window, and an ad script that defers its own fallback past 150 ms out-orders the one-shot assignment with nothing left to supersede it.

The July 11 fix only defended the launch click, because at the time that was the only surface observed being hijacked. The defect class is broader: any click the ad script can observe is a click it can hijack.

## Fix Applied

Three coordinated changes. The principle: the ad script may only observe the clicks that are deliberately monetized (the `[data-target]` launch controls), and even those clicks get a persistent navigation defense instead of a one-shot one.

### 1. Ad click shield (`site/index.html`, inline script in `<head>`)

A dependency-free inline script placed above the Pop-Under tag registers capture-phase listeners on `window` for `pointerdown`, `mousedown`, `touchstart`, `click` and `auxclick`. Window-capture listeners fire before any document-level listener regardless of registration order, and because the shield is a synchronous inline script that parses before the async ad tag can execute, it always registers first.

For any event whose target is not inside a `[data-target]` element the shield calls `event.stopPropagation()`, so the event never reaches the document-level listeners where the ad script hooks the page. Default actions are never suppressed for the page's own links, so normal navigation, crawling and keyboard activation are unaffected.

The shield additionally refuses (`preventDefault`) clicks on any anchor resolving to an origin the page does not ship — defense against ad scripts that inject overlay links rather than redirecting. The only external links on index.html are the four footer social profiles, which are allowlisted by host. URLs are resolved with `new URL(href, window.location.href)` so an injected `base` element cannot repoint relative hrefs.

### 2. Delegated page handlers (`site/js/app.js`)

`stopPropagation()` at window capture also silences the page's own element-level listeners, so the two index.html behaviors that used them moved to window-capture delegation, registered after the shield (same node and phase, so `stopPropagation` does not silence them and registration order guarantees they run after the shield):

- The category filter pills (`initCatalog`).
- The continue-strip "Start fresh" discard button (`initContinueStrip`).

Launch controls keep their element-level listeners in `bindLaunchControls()` unchanged, because the shield deliberately lets launch clicks propagate.

### 3. Launch navigation watchdog (`site/js/app.js`, `launchTemplate()`)

The single deferred `location.href` assignment is now followed by a re-issuing interval (`LAUNCH_REASSERT_MS`, 700 ms, matching the proven countdown watchdog on loading.html): after the first assignment at 150 ms, the navigation is re-issued every 700 ms until the page actually unloads, which kills the timers. An ad fallback that out-orders or out-races any single assignment is superseded by the next re-issue unless the ad commits within one 700 ms window, which requires a cross-origin round trip faster than the local navigation — the same reasoning already documented in `LOADING_REDIRECT_STALL_FIX.md`.

## Testing Steps

Verified July 27, 2026 with Playwright (Chromium) against `npx serve` from the repository root. The test simulates the ad script faithfully: a document-level capture listener attached before any page script runs (a stricter ordering than production, where the async tag runs after the inline shield), which on click issues a `location.href` redirect to an ad URL served with a 600 ms delay to mirror a cross-origin round trip. All 16 checks passed:

1. Pill click: no navigation occurs, the simulated ad handler observes zero events, the filter is applied and the active pill moves.
2. Header navigation click lands on blog.html, never the ad URL.
3. An injected full-page overlay anchor pointing at a foreign origin does not navigate; the shield cancels it.
4. The allowlisted footer social link is not blocked by the shield.
5. The continue-strip discard button still clears storage and removes the strip under the shield.
6. Launch click: the foreground tab reaches loading.html?target=docs despite the competing ad redirect, and the ad handler does still observe the launch click (Pop-Under monetization intact).
7. Full flow: catalog card to loading.html (which names the chosen template) to docs.html after the countdown.
8. Zero page errors on index.html.

Manual re-test in production: with the popup blocker in its default state, click several pills, a header link, and empty catalog space; none may leave the site. Click Open Editor once; the foreground tab must land on loading.html. Repeat in a fresh private window, since the Pop-Under is frequency-capped per visitor.

## Trade-offs Accepted

- **Analytics click capture on index.html is reduced.** Microsoft Clarity hooks events at document level too, so the shield starves it of the same guarded press events on non-launch clicks. Scroll, movement and the launch clicks themselves are unaffected. Broken visitor trust from off-site hijacks costs more than click-heatmap fidelity on one page.
- **`mouseup`, `touchend` and `pointerup` are deliberately unguarded.** Pop scripts rarely trigger on release events, and replay quality depends on them. If a hijack is ever observed again on index.html, guarding these is the first thing to try (one-line change to `GUARDED_EVENTS`).
- **The launch click remains observable by the ad script by design** — that is the monetized click. Its residual hijack risk is now bounded by the watchdog rather than a single 150 ms race.

## Troubleshooting

- **Hijack still observed on a non-launch click:** confirm the shield script is still the first script ahead of the Pop-Under tag in index.html and was not moved below it; confirm the click target is not inside an element carrying `data-target` (the shield exempts the whole subtree).
- **Pills or the discard button stop responding:** something re-bound them as element-level listeners. They must stay window-capture delegated; see the comments at both sites in `js/app.js`.
- **A legitimate new external link on index.html does not work:** add its host to `EXTERNAL_ALLOW` in the shield.
- **Launch click lands on the ad site anyway:** the ad committed within one watchdog window. Lower `LAUNCH_REASSERT_MS` cautiously (a too-short interval can restart the pending navigation before slow connections commit it) before considering other changes.
- **New page starts carrying the Pop-Under:** the shield ships only on index.html. Copy the inline shield block into any page that gets the Pop-Under tag, and keep any element-level click listeners on that page off non-launch controls.

## Related Issues

- `docs/error-fixes/ADSTERRA_AD_CONFLICT_FIX.md` — the July 11 fix for the same hijack observed only on launch clicks; its one-shot deferral is superseded by the watchdog, and its scope is superseded by the shield. Updated with a pointer here.
- `docs/error-fixes/LOADING_REDIRECT_STALL_FIX.md` — origin of the re-issuing navigation watchdog pattern reused in `launchTemplate()`.

## Related Files

- `site/index.html` — ad click shield inline script, updated Pop-Under comment block
- `site/js/app.js` — `launchTemplate()` watchdog, delegated pill filter, delegated continue-strip discard
- `docs/error-fixes/POPUNDER_HIJACKS_ALL_PAGE_CLICKS_FIX.md` (this document)
