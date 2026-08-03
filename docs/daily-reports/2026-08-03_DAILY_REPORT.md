# Daily Report: August 3, 2026

Two distinct pieces of work. **Part one** (sections 1-7) was an investigation into the Pop-Under hijack, which changed no code and reached no root cause. **Part two** (sections 8-12) implemented a site-wide anchor banner, found and fixed two defects in the process, and shipped: commit `3ad5588` is pushed to `main` and therefore deployed.

Part one, session scope: investigation only. The operator reported that clicking buttons, navigation links and filter pills redirects the tab to an external site, and asked whether setting the Pop-Under frequency cap to one impression per user per 24 hours would resolve it.

The answer is no, and the reasoning matters more than the verdict: a frequency cap would reduce how often each visitor is hijacked while leaving the mechanism intact, and would simultaneously misdirect the impression away from the only click the site intends to monetize.

Two findings came out of the investigation that were not on the record before:

1. **The footer "Editors" column links carry `data-target`**, which makes them exempt from the ad click shield on `index.html`. To a visitor they read as ordinary navigation links, but the Pop-Under is permitted to observe them by design.
2. **The live Pop-Under script carries an aggressive back-button redirect capability**, which the click shield structurally cannot defend against, because it is history manipulation rather than a click. This was not known when `POPUNDER_HIJACKS_ALL_PAGE_CLICKS_FIX.md` was written.

The root cause is **not yet identified**. Four candidate mechanisms are now on the table with a reproduction test that distinguishes them; the operator has not yet run it.

## Summary

| Area | Outcome |
|---|---|
| **Part one: Pop-Under investigation** | |
| Question answered | Frequency cap rejected as a fix, with reasoning recorded below |
| Production shield status | **Verified live.** `index.html` on `templatebox.win` carries the shield above the Pop-Under tag |
| New finding 1 | Footer Editors links are shield-exempt launch controls on `index.html` |
| New finding 2 | Zone script carries back-button redirect capability the shield cannot block |
| Zone script analysis | Fetched and inspected; per-zone configuration values are **not** in the file |
| Root cause | **Not identified.** Four candidates, one diagnostic test pending |
| **Part two: site-wide anchor banner** | |
| Feature shipped | Fixed foot-of-viewport banner on 13 pages: 320x50 under 48rem, 728x90 above |
| Deliberately excluded | `index.html`, `loading.html`, `admin.html`, the four editors, the three blog surfaces |
| Defect found and fixed | Four pages shipped the ad host with no `js/ads.js` tag (guard matched its own comment) |
| Defect found and fixed | `privacy.html` loaded no JavaScript, so four footer launch links bypassed the interstitial |
| Correction issued | An earlier claim that duplicate zone serving is broken was overstated; see section 10 |
| Code changed | 18 files, commit `3ad5588` |
| Deployed | **Yes.** `3ad5588` is pushed to `main`, which auto-deploys |
| Documentation | This report plus `AD_HOST_SHIPPED_WITHOUT_ITS_SCRIPT.md` |

## 1. Why a frequency cap is not the fix

The proposal was to set the Pop-Under to one impression per user per 24 hours. Rejected on three counts.

**It does not reduce first-visitor harm at all.** The cap is per visitor per 24 hours, so every new visitor still receives exactly one off-site redirect, and it lands on their first click. First-time traffic is precisely the segment that has no established reason to return, and it is the segment whose behaviour Google observes.

**It misallocates the impression.** Under a one-per-day cap, the Pop-Under fires on whichever click comes first. On a catalog page the first click is typically a filter pill or a navigation link, not "Open editor". The cap would therefore spend the day's only impression on a click that produces no editor session, and then stay silent on the launch click — the click the entire `loading.html` interstitial exists to monetize. The result is less revenue and an unchanged hijack.

**It does not touch the mechanism.** The hijack is the Pop-Under's popup-blocked fallback redirecting the current tab instead of opening a background one. Capped or uncapped, when it fires it behaves identically.

A cap remains reasonable as polish for repeat visitors once the shield is confirmed to be confining the ad script to genuine catalog launches. It is not a remedy, and adopting it as one would leave the defect in place while making it harder to observe.

## 2. Production state verified before diagnosing

The shield from the July 27-28 fix is live. `index.html` served from `templatebox.win` contains the shield block, the overlay neutralizer and the Pop-Under tag in the documented order (shield above the ad tag). This rules out the simplest explanation — that the fix was never deployed or was overwritten.

## 3. Finding: the footer Editors column is shield-exempt

Commit `d9a9289` ("Route footer Editors column through the ad flow; harden launch navigation") added `data-target` to the four footer links in the Editors column:

```html
<li><a href="resume.html" data-target="resume">Resume Builder</a></li>
<li><a href="docs.html" data-target="docs">Business Document Builder</a></li>
<li><a href="poster.html" data-target="poster">Poster Creator</a></li>
<li><a href="mockup.html" data-target="mockup">Product Mockup Generator</a></li>
```

The shield exempts `[data-target]` and its entire subtree, because launch controls are the one surface the Pop-Under is deliberately allowed to observe. That exemption was written when the only elements carrying `data-target` were catalog card CTAs. It now also covers four footer links that a visitor experiences as site navigation.

On `index.html` this means clicking a footer editor link is a monetized click: the ad script sees it, and if the browser blocks the background window, the fallback redirect races the 700 ms re-issuing watchdog in `launchTemplate()`. The watchdog loses if the ad commits inside a single window. This is a plausible source of "navigation links redirect me" on a page whose shield is otherwise verified working.

### Proposed fix, not yet applied

Narrow the exemption and keep the routing:

- Change the shield's exemption test from `[data-target]` to `.card-link[data-target]`, so only catalog CTAs are visible to the ad script.
- Move `bindLaunchControls()` (`site/js/app.js:170`) from element-level listeners to window-capture delegation, matching the pattern the filter pills already use at `site/js/app.js:221-227`. This is required, because the shield's `stopPropagation()` at window capture would otherwise silence the footer links' element-level launch handlers and break their routing through `loading.html`.

Net effect: footer navigation becomes unhijackable while still passing through the ad interstitial, and the Pop-Under continues to see every genuine template launch. Not implemented pending confirmation that this is the mechanism actually being hit.

## 4. Finding: analysis of the live zone script

The Pop-Under tag for zone `pl30250761` was fetched from its serving domain (HTTP 200, 68,605 bytes) and inspected.

### What the script cannot tell us

The file is a **generic loader shared across publishers**, not a per-zone build. What initially looks like configuration is a settings schema: each field is a `{type, placeholder}` descriptor, and the corresponding runtime values are read from a config object resolved elsewhere. For example `extraAutoRedirectPlacementKey` initialises to the empty string and is populated from that object.

**Consequence: whether auto-redirect is enabled on this zone cannot be determined from the served JavaScript.** Only the Adsterra dashboard or Adsterra support can answer that. This corrects an implicit assumption in the troubleshooting section of `POPUNDER_HIJACKS_ALL_PAGE_CLICKS_FIX.md`, which treats the presence of `extraAutoRedirectPlacementKey` in the deobfuscated script as something the operator can act on directly.

### What the script does tell us

The capability set is wider than previously recorded. Settings present in the schema:

| Setting | Behaviour |
|---|---|
| `extraAutoRedirectPlacementKey` | Redirect with no click at all (already noted July 28) |
| `enableAggressiveBb` | Back-button redirect |
| `enableExtraAggressiveBb` | Extended back-button redirect |
| `extraAggressiveBbPlacementKey` | Separate zone key for the back-button ad |
| `backButtonRedirectsMaxPerPeriod` | Frequency cap on back-button redirects |
| `backButtonRedirectsPeriod` | Period for that cap |

The back-button handler is **installed from the top-level `init()`, not from inside a click listener** — the entry sequence at the end of the file runs `init()`, which invokes the handler's own `init()` unconditionally. Whether it then redirects is gated in code by `document.referrer` and the `enableAggressiveBb` flag, so the outcome depends on zone configuration; the installation does not.

**The click shield structurally cannot defend against this.** The shield operates on `pointerdown`, `mousedown`, `touchstart`, `click` and `auxclick`. A back-button redirect is history manipulation and involves none of them. No addition to `GUARDED_EVENTS` would help.

## 5. Candidate mechanisms and the test that separates them

Four mechanisms are now plausible and they have different owners. Run in a fresh private window against production, with the popup blocker in its default state.

| Test | Redirect here means | Owner |
|---|---|---|
| Click a filter pill | Shield is being outrun | Code: add `mouseup`, `touchend`, `pointerup` to `GUARDED_EVENTS` |
| Click a footer Editors link | `data-target` exemption (section 3) | Code: the fix in section 3 |
| Navigate to another page via a header link, then press Back | Aggressive back-button redirect | Adsterra dashboard or support |
| Load `index.html` and touch nothing for 60 seconds | Auto-redirect | Adsterra dashboard or support |

Two of the four are fixable in this codebase. The other two are zone configuration and no client-side code can prevent them.

## 6. Adsterra dashboard guidance

Requested: how to turn off auto-redirect and direct-link options on zone `pl30250761`. This could not be verified — the dashboard is not accessible from this environment and Adsterra revises these labels. Best-effort path:

1. Log in at `publishers.adsterra.com`.
2. Left sidebar, **Websites & Placements**.
3. Expand `templatebox.win` and locate the Popunder placement with ID `30250761`.
4. Open the row's edit control.
5. Look for **Back button**, **Aggressive back button**, **Auto redirect** or **Direct link** toggles. Frequency capping is in the same panel.

**Expect these not to be exposed.** In most publisher accounts the Popunder edit panel offers only frequency capping, ad categories and the adult-content toggle; auto-redirect and aggressive back-button behave as account-level flags managed by Adsterra. If the toggles are absent, a support ticket is required, and it should name the internal flags so it is not answered generically:

> For Popunder placement 30250761 on templatebox.win, please confirm whether auto-redirect (`extraAutoRedirectPlacementKey`) and aggressive back-button redirect (`enableAggressiveBb` / `extraAggressiveBbPlacementKey`) are enabled on this zone, and disable both if so. I want click-triggered popunder only.

This connects to existing operational knowledge in `PROJECT_STATUS.md`: Adsterra support tickets on zone configuration need explicit, specific wording, the same lesson learned when obtaining the second 300x250 zone.

## 7. Open items created by the investigation

- **Run the four-way reproduction test in section 5.** Everything else is blocked on it. Fixing the wrong mechanism would leave the symptom in place and consume the evidence.
- **Decide on the section 3 fix independently of the test outcome.** The footer exemption is a real widening of the ad script's observable surface whether or not it is today's symptom, and it was introduced without being weighed.
- **Update `POPUNDER_HIJACKS_ALL_PAGE_CLICKS_FIX.md`** once the mechanism is confirmed. Two corrections are already owed regardless: the back-button capability is not mentioned at all, and the troubleshooting note implying the operator can act on `extraAutoRedirectPlacementKey` from the script needs qualifying with section 4's finding that per-zone values are not in the file.
- **Re-evaluate the frequency cap after the fix.** It is defensible as repeat-visitor polish once the shield is confirmed to be confining the ad script to catalog launches; it is not defensible as a remedy.

---

# Part Two: Site-Wide Anchor Banner

Requested after the investigation: carry the editors' mobile anchor banner to every page except the homepage, and work out the desktop equivalent.

## 8. What shipped

A banner **fixed to the foot of the viewport** for the whole visit, on **13 pages**: the nine `*-template.html` landing pages plus `about.html`, `terms.html`, `privacy.html` and `404.html`.

### The desktop answer

The question was how to do "the same thing" on laptops and desktops. The answer taken is the literal one: **the same bar, swapped to 728x90 above 48rem** and 320x50 below it. One host, one mounting function, one padding mechanism.

The alternative — a 160x600 rail like the editors and blog use — was rejected for these pages. A rail needs a spare column, which only the editors and blog surfaces have; retrofitting one onto `about.html` or a landing page means restructuring the layout of fifteen pages to gain one unit. The bar works regardless of what the page's layout is.

| Viewport | Landing, about, terms, privacy, 404 | Editors (unchanged) | Blog and articles (unchanged) | index, loading, admin |
|---|---|---|---|---|
| Under 48rem | anchor 320x50 | anchor 320x50 | top 320x50 plus in-flow units | none |
| 48rem to 84rem | anchor 728x90 | leaderboard 728x90 | top 728x90 plus in-flow units | none |
| Above 84rem | anchor 728x90 | rail 160x600 | rail 160x600 plus in-flow units | none |

### Implementation

- `mountSiteAnchor()` in `site/js/ads.js` reads the same `AD_ZONES` registry as every other placement. No second copy of the zone table, which is the drift that has caused three defects in this project already.
- The host is `<div class="site-anchor" data-ad-anchor>` immediately before `</body>`. Which pages participate is decided purely by where that element exists; the function returns immediately when it finds none, so it is safe to run everywhere.
- `.site-anchor` is `display: none` until a banner actually fills, at which point `js/ads.js` adds `is-filled` and `has-site-anchor` to `<body>`. That reserves 7.25rem of bottom padding on desktop and 4.75rem on mobile, so the foot of the page can still be scrolled clear of the bar. A dormant, blocked or unfilled zone therefore costs no layout shift at all.
- `env(safe-area-inset-bottom)` padding clears the home-indicator gesture bar on modern phones.
- Print styles hide the bar and drop the reserved padding, so PDFs and printed documents are unaffected.
- `buildPostPage()` in `site/js/admin.js` is documented **not** to emit one, so exported post pages stay consistent with the decision in section 10.

## 9. Two defects found and fixed

### Defect 1: four pages shipped the ad host with no script to fill it

`about.html`, `privacy.html`, `terms.html` and `404.html` carried the anchor container but never loaded `js/ads.js`, so the bar could not appear on any of them. This is what the operator reported as "I'm not seeing the ad in other pages such as about page, privacy."

The rollout script inserted the host first, then guarded the script tag with a substring test for `js/ads.js`. The host's own comment reads "Filled by js/ads.js" — so the guard matched the comment it had just written, concluded the script was present, and skipped it. The nine landing pages were unaffected because they already carried a genuine tag.

**The verification written alongside it used the same substring and passed.** A check that shares the bug's blind spot verifies nothing. It now matches an actual `<script src="...">` tag. Full write-up: `docs/error-fixes/AD_HOST_SHIPPED_WITHOUT_ITS_SCRIPT.md`.

This defect is invisible by construction: a host with no script looks exactly like a host whose zone did not fill, which looks exactly like an ad blocker.

### Defect 2: privacy.html bypassed the monetized flow

Pre-existing, introduced by commit `d9a9289` on July 28 and unrelated to the anchor work. That commit added `data-target` to the footer Editors column on all 22 pages, but those attributes are inert without `bindLaunchControls()` in `js/app.js`. `privacy.html` was the one public page that loaded **no JavaScript at all**, so its four footer launch links navigated straight to the editors — skipping `loading.html` and its Pop-Under, two banners and Social Bar.

Fixed by adding both `js/ads.js` and `js/app.js` to that page. An audit now asserts the general rule: every page carrying `data-target` links also loads `app.js`. No other page failed it.

## 10. Why the blog surfaces were excluded, and a correction

`blog.html`, `post.html` and the generated article pages do **not** get the anchor.

**Correction first.** The initial reasoning given was that the anchor would serve the same zone key twice in one page view and that this was a technical problem. That was overstated. `PROJECT_STATUS.md` records the opposite from direct experience: reusing a banner key across both slots on `loading.html` "is fine functionally; a second zone was obtained purely for separated reporting, not because sharing was broken."

The decision stands, on two narrower grounds:

1. **Density.** An article page at wide desktop already runs four units — top leaderboard, in-content 300x250, end-of-article 300x250, and the 160x600 rail. A fifth, permanently on screen, on the pages the site most wants ranking.
2. **Attribution.** The anchor draws from `leaderboard` / `leaderboardMobile`, which the blog's top banner also uses. Sharing a key there would make it impossible to tell whether the bar earns anything or merely moves clicks off the banner above it.

If the anchor is wanted on blog pages later, the clean route is a dedicated Adsterra zone first. Reversing the decision is one line per page: the mounting code is page-agnostic and already runs everywhere.

## 11. Verification

- **Exact-tag audit across all 24 pages**, asserting two rules: any page with an ad host loads `js/ads.js`, and any page with `data-target` links loads `js/app.js`. Both hold with no exceptions. The same table confirms `index.html` and `loading.html` still carry no ad host.
- **Served over HTTP** (`npx serve`): the response body of `about.html`, `privacy.html`, `terms.html`, `404.html` and one landing page each contain both the host and a real script tag; `/js/ads.js` and `/js/app.js` return 200.
- **Structural pass** over 25 pages: tag balance, single `<h1>`, no duplicate ids, 40 JSON-LD blocks parse, 695 internal links resolve.
- **CSS brace balance** checked after editing the stylesheet; `node --check` on `ads.js` and `admin.js`; symbol check that `mountSiteAnchor` is defined and called from `DOMContentLoaded`.
- **Placement map** confirming no page carries two anchor kinds and no page runs a leaderboard zone twice.

**Not verified: anything visual.** Playwright is not installed in this environment, so the 728x90 bar on a laptop, whether 7.25rem is the right reserve, and the bar's appearance at 320px were checked against the stylesheet rather than rendered. Nor is ad fill verified — a single page load proves nothing because of frequency capping.

To check fill in a browser with the blocker off:

```js
document.querySelector('[data-ad-anchor]').className
```

`site-anchor is-filled` means the placement mounted. Plain `site-anchor` means the code ran and the zone did not serve, which is capping, not a fault.

## 12. Open items from the implementation work

- **Get a dedicated Adsterra zone for the anchor.** This matters more than it first appears. The bar currently draws from `leaderboard` / `leaderboardMobile`, keys already used by the editors' 728x90 band, the editors' 320x50 anchor and the blog's top banner. **The anchor's earnings are therefore unmeasurable anywhere on the site today.** Both sizes already exist, so per existing operational knowledge this needs a support ticket worded explicitly as separate tracking for an existing slot, not additional inventory. Once the keys exist, add `anchor` / `anchorMobile` to `AD_ZONES` and point `mountSiteAnchor()` at them: one line.
- **Look at the deployed bar on a laptop and on a phone.** Specifically whether 7.25rem of reserved space is right for the 728x90, and whether the bar reads as acceptable on `terms.html` and `privacy.html`, which are trust pages.
- **Decide the blog-surface question with data**, once the dedicated zone makes the anchor measurable.
- **This report is untracked.** `docs/daily-reports/2026-08-03_DAILY_REPORT.md` has never been committed; commit `3ad5588` shipped the code without it.

## Related Files

- `site/index.html` — ad click shield and overlay neutralizer (lines 77-271), footer Editors column (lines 756-759)
- `site/js/app.js` — `bindLaunchControls()` at line 170, delegated pill handler at lines 221-227, `launchTemplate()` watchdog
- `site/js/ads.js` — `AD_ZONES`, `mountSiteAnchor()`, and the exclusion list with its reasoning
- `site/css/style.css` — `.site-anchor`, `body.has-site-anchor`, and the print resets
- `site/js/admin.js` — the post-page generator, documented not to emit an anchor
- `docs/error-fixes/AD_HOST_SHIPPED_WITHOUT_ITS_SCRIPT.md` — defect 1 and defect 2 in full
- `docs/error-fixes/POPUNDER_HIJACKS_ALL_PAGE_CLICKS_FIX.md` — the July 27-28 fix this session re-examined
- `docs/implementation/EDITOR_PAGE_AD_PLACEMENT.md` — the editors' band system this extends
- `docs/memory/PROJECT_STATUS.md` — Adsterra zone reference and operational knowledge
