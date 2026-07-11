# Adsterra Integration: Foreground Redirect Hijack and Intermittent Blank Banners

Date: July 11, 2026
Status: Fixed (code-level causes); residual client-side blocking documented below

## Issue Title

After clicking a catalog "Personalize Template" button, the foreground tab is sometimes redirected to an ad domain instead of loading.html. Separately, the two 300x250 banner slots on loading.html sometimes render blank or show a browser error frame (for example an unreachable spendsdetachment.com creative URL).

## Root Cause

Two independent defects plus one environmental factor:

1. Pop-Under click race (foreground hijack). The Adsterra Pop-Under script in the head of index.html attaches its own document-level click handler. The intended behavior is: ad opens in a background tab, our handler routes the foreground tab to loading.html. When the browser's popup blocker suppresses the background window.open, the ad script falls back to redirecting the current tab to the ad URL. Because the ad script's handler runs after ours in the same click, its location assignment happened last and superseded our still-uncommitted navigation. The behavior is intermittent because pop-unders are frequency-capped per visitor, so only the first eligible click in a session is contested.

2. Shared global configuration between duplicate banner tags. The Adsterra banner tag configures itself through a global atOptions variable read by invoke.js. Both loading.html slots ran copies of the same tag (same zone key) in one page context, allowing the second tag to clobber the first's configuration mid-parse and allowing the ad script to deduplicate or misrender repeated instances of the same key.

3. Environmental (not a code defect): the visible error frame naming an unreachable ad-creative domain means the creative failed to load inside Adsterra's own iframe. That is caused by client-side ad blocking (browser extension, DNS filtering, hosts file) or by ad-network no-fill, both outside the site's control. Newly approved placements can also take time before Adsterra serves fill consistently.

## Fix Applied

- `js/app.js`
  - `launchTemplate()` now assigns `window.location.href` inside a 150 ms `setTimeout` (constant `LAUNCH_DELAY_MS`) instead of synchronously. This guarantees our navigation is assigned after the ad script's same-click fallback redirect. A later location assignment supersedes any earlier navigation that has not yet committed, and the ad redirect requires a cross-origin network round-trip to commit, so the foreground tab reliably proceeds to loading.html. The delay is imperceptible when no interference occurs.
- `loading.html`
  - Each banner tag now runs inside its own same-origin `srcdoc` iframe (300x250, borderless). Each iframe provides an isolated window scope, so the two tags cannot clobber each other's global `atOptions` and the ad script cannot deduplicate them against each other. Both slots still share one zone key; when Adsterra support provisions a second distinct 300x250 zone, only the key inside slot 2's srcdoc needs replacing (a marker comment sits above the slots).

## Testing Steps

1. Serve the site and open index.html with the browser's popup blocker in its default (blocking) state.
2. Click "Personalize Template" once. The foreground tab must land on loading.html?target=... even if the pop-under was suppressed or its fallback fired. Repeat in a fresh session (clear cookies or use a new private window) since pop-unders are frequency-capped.
3. On loading.html, confirm both banner slots either render creatives or remain visually clean, and that the countdown still redirects to the editor at zero regardless of ad outcomes.
4. Verify banner isolation: in DevTools, confirm each slot contains its own srcdoc iframe and that no atOptions variable exists on the top-level window.

## Troubleshooting

- Banners blank with a network error inside the frame: the creative domain is blocked client-side. Retest with ad-blocking extensions disabled, on a different network, or on a mobile connection. This is environmental and cannot be fixed in site code.
- Banners blank with no error: likely no-fill from the network, common for newly approved placements. Recheck after a few hours; confirm the placement shows impressions in the Adsterra dashboard.
- Foreground still occasionally lands on an ad page: the ad's fallback redirect can win only if it commits within the 150 ms window, which requires an unusually fast ad response. If observed repeatedly, raise `LAUNCH_DELAY_MS` in js/app.js (for example to 250) at the cost of a slightly longer perceived pause after the click.
- Pop-under never appears: frequency capping is expected behavior (roughly one per visitor per time window). Test in a fresh private window.

## Related Files

- `js/app.js`
- `loading.html`
- `index.html` (Pop-Under script location, unchanged by this fix)
- `docs/error-fixes/ADSTERRA_AD_CONFLICT_FIX.md` (this document)
