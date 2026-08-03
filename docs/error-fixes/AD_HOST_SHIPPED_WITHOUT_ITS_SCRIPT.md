# Ad Host Shipped Without js/ads.js: a Guard Regex Matched the Comment It Had Just Written

Date: July 30, 2026
Status: Fixed

## Issue Title

Reported as "I'm not seeing the ad in other pages such as about page, privacy." Four pages carried the site-wide anchor host in their markup but never loaded the script that fills it, so the bar could not appear on any of them at any viewport size: `about.html`, `privacy.html`, `terms.html`, `404.html`. The nine landing pages were unaffected.

A second, unrelated defect surfaced during the same investigation: `privacy.html` loaded no JavaScript at all, so the four `data-target` links in its footer bypassed the monetized loading flow entirely.

## Root Cause

### Defect 1: the guard matched its own comment

The anchor was rolled out by a script that did two things per page: insert the host element, then add `<script src="js/ads.js">` if the page did not already have it. The guard was a substring test:

```js
if (!/js\/ads\.js/.test(src)) { /* add the script tag */ }
```

The host inserted immediately before it carries an explanatory comment:

```html
<!-- Site-wide anchor: ... Filled by js/ads.js; suppressed on desktop ... -->
```

So by the time the guard ran, the page contained the literal text `js/ads.js` inside an HTML comment. The regex matched, the guard concluded the script was already present, and the tag was never added. Only the four pages that did not already load `ads.js` were affected; the nine landing pages already had a real tag, so the same false positive was harmless there.

The failure is silent by construction. `.site-anchor` is `display: none` until `js/ads.js` adds `is-filled`, which is what stops a dormant zone leaving a gap in the layout. A host with no script is indistinguishable from a host whose zone did not fill, and both look exactly like "ads are just not showing," which is also what an ad blocker looks like.

### Why the verification missed it

The check written alongside the change was:

```js
if (anchor && 'js/ads.js' not in src) -> problem
```

The same substring, and therefore the same blind spot: it matched the comment too and reported "problems: none" across all 24 pages. A verification that shares the bug's assumption verifies nothing. The corrected check matches an actual tag:

```python
re.search(r'<script src="[^"]*' + re.escape('js/ads.js') + r'"', src)
```

### Defect 2: privacy.html had no JavaScript

Separate and older. The July 28 commit that routed the footer's Editors column through the ad flow added `data-target` attributes to those four links on all 22 pages. Those attributes do nothing on their own -- `bindLaunchControls()` in `js/app.js` is what intercepts the click and routes it through `loading.html`. `privacy.html` was the one public page that had never loaded `js/app.js`, so its four footer links navigated straight to the editors, skipping the interstitial and its Popunder, two banners and Social Bar.

## Fix Applied

- `site/404.html`, `site/about.html`, `site/terms.html`: added `<script src="js/ads.js"></script>` before the existing `js/app.js` tag.
- `site/privacy.html`: added both `js/ads.js` and `js/app.js`. The second is what makes its footer launch links behave like every other page's.
- The re-check now matches `<script src="...">` tags rather than any occurrence of the filename.

## Testing Steps

1. Exact-tag audit across all 24 pages, asserting two rules: any page with an ad host loads `js/ads.js`, and any page with `data-target` links loads `js/app.js`. Both pass; the table also confirms `index.html` and `loading.html` still carry no ad host by design.
2. Served over HTTP (`npx serve`) and confirmed per page that the response body contains both `class="site-anchor"` and a real `<script src="js/ads.js">` tag: `about.html`, `privacy.html`, `terms.html`, `404.html` and one landing page all pass. `/js/ads.js` and `/js/app.js` both return 200.
3. `node --check site/js/ads.js`, plus a symbol check that `mountSiteAnchor` is defined and called from the `DOMContentLoaded` handler.

To confirm in a browser, with the ad blocker off, on one of the four pages:

```js
document.querySelector('[data-ad-anchor]').className
```

`site-anchor is-filled` means the placement mounted. `site-anchor` alone means the code ran but the zone did not serve, which is frequency capping or a blocked request, not this defect. A `null` means the host is missing, which would be a different fault.

## Troubleshooting

- **A page has the bar and another does not:** check for a real script tag, not the filename. `grep -c 'js/ads.js'` is not a valid test on these pages, because the host comment mentions the filename; match `<script src=` instead.
- **Nothing appears anywhere:** confirm the change is actually deployed. This defect was reported against a working tree that had 16 modified files and zero commits, so the live site was serving none of it.
- **The bar appears but nothing else changed:** that is correct. `index.html`, `loading.html` and `admin.html` are excluded by policy, and the four editors mount their own band system.

## Related Files

- `site/404.html`, `site/about.html`, `site/terms.html`, `site/privacy.html`
- `site/js/ads.js` (`mountSiteAnchor`, the `.site-anchor` host contract)
- `site/js/app.js` (`bindLaunchControls`, the `data-target` interception privacy.html was missing)
- `docs/implementation/EDITOR_PAGE_AD_PLACEMENT.md` -- the band system these pages sit alongside
- `docs/error-fixes/STATIC_POST_PAGES_SERVED_NO_ADS.md` -- same silent-failure class: an ad surface that renders nothing when misconfigured looks identical to one whose zone is dormant
