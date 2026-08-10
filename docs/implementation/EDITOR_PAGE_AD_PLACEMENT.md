# Editor Page Ad Placement

Date: July 27, 2026
Status: Implemented across all four editors
Supersedes: the "no ads on the editor pages, ever" decision recorded in `docs/memory/PROJECT_STATUS.md` and `PRD.md` section 5.3

## Why This Reverses an Earlier Decision

The original rule was that neither `index.html` nor the editors would ever carry advertising, on the grounds that ad-free editors build the return usage the whole model depends on. Half of that rule stands unchanged: the homepage still carries nothing.

The editor half was reversed on a dwell-time argument. The interstitial monetizes ten seconds. An editing session is minutes: filling an itemized invoice with several line items, or drafting a warning notice with an incident description, is not a ten-second task. On impressions per session, one passive unit beside an editor plausibly out-earns the interstitial, and it does so without interrupting anything, because it never moves, covers or delays the workspace.

The prompting example was Photopea, which runs a right-hand skyscraper on desktop and a bottom anchor on mobile, in an application people sit inside for far longer than they sit on any marketing page. The pattern transfers directly.

What did not change: the trade only holds while the placement stays genuinely passive. The moment it becomes an interstitial, an expanding unit, or anything that competes with the document, the return-usage argument that motivated the original rule reasserts itself.

## What Was Built

Four mutually exclusive viewport bands. The boundaries are non-overlapping to the pixel, so no viewport can ever mount two bands or none.

| Viewport | Placement | Zone(s) | Host |
|---|---|---|---|
| 93rem and above | Sticky rail of three stacked 300x250 units | `editorRail1/2/3` | `[data-ad-rail-slot]` |
| 84rem to 93rem | Sticky single 160x600 rail | `skyscraper` | first `[data-ad-rail-slot]` |
| 48rem to 84rem | 728x90 leaderboard above the workspace | `leaderboard` | `[data-ad-editor-leaderboard]` |
| 48rem and below | Fixed 320x50 anchor at the foot of the viewport | `leaderboardMobile` | `[data-ad-editor-anchor]` |

### The rail stack (added August 3, 2026)

Very wide screens have room for more than one unit beside the workspace, and an editor session is long enough that a stack is seen for its whole duration rather than scrolled past. Three 300x250 slots replace the single 160x600 above 93rem.

**Every slot carries its own zone key.** Repeating one key down the stack would have Adsterra treat it as the same placement rendered three times, which is not the same thing as three placements. This is the same reason `loading.html` carries two distinct 300x250 zones rather than one key twice.

The rail launched with slots 1-2 reusing the site's two existing 300x250 zones and slot 3 keyless (the dashboard blocks creating a duplicate of a size already in use, so a third zone needs a support ticket). A ticket was filed August 3, 2026 asking for three dedicated zones so the rail would stop sharing keys with `inContent` and `endOfArticle` entirely.

Adsterra's first response issued two genuinely new zones and, for the third, repeated the existing `endOfArticle` key rather than a new one — worth noticing rather than assuming three-for-three, since nothing about the response format distinguished a fresh zone from a returned one. A follow-up delivered the actual third zone. All three rail slots now carry keys that appear nowhere else in `AD_ZONES`, so each reports independently in the Adsterra dashboard, and `inContent`/`endOfArticle` are freed from double duty on the editors.

Why 93rem: a three-slot 300px rail needs 324px including its gap. Holding the editing panes at the 540px they had before any rail existed therefore takes 1476px of viewport. Below that the single 160px rail still fits, which is what the 84rem band is for. The principle is unchanged from the 84rem gate — inventory is added beside the workspace, never taken out of it.

The rail is capped at `calc(100vh - 7rem)` with internal scrolling. Three stacked units plus labels run to roughly 830px, which exceeds a short laptop viewport; capping keeps the workspace unaffected either way, and on a tall screen the cap never engages.

All three zones already existed and are live; no new Adsterra provisioning was needed. Every host is empty in the served markup and filled by `mountEditorAds()` in `site/js/ads.js`, which runs because each editor's `<main>` carries `data-ads-static`.

### Why the rail gate is 84rem, not 75rem

The first implementation gated the rail at 75rem, which was wrong, and the arithmetic shows why. Below 84rem the page is capped by the viewport rather than by its own `max-width`, so there is no spare margin for the rail to occupy and it comes straight out of the panes instead:

| Screen | Pane width, no rail | Pane width, rail at 75rem gate |
|---|---|---|
| 1200px | 540px | 472px |
| 1280px | 540px | 512px |
| 1366px | 540px | 544px |
| 1440px and up | 540px | 544px |

At 1200px each pane lost 68px against the pre-rail layout — a real regression, on a common laptop width. Above 84rem (1344px) the page is at its full declared width, the rail sits in margin that was previously empty, and the panes measure 544px, marginally *wider* than the 540px they had before any rail existed.

Raising the gate leaves the 48rem-to-84rem band with no room beside the panes, which is what the leaderboard is for.

### Why the leaderboard is the fallback, not the primary

A banner above the workspace scrolls out of view within seconds of the visitor reaching the form, so it earns roughly one impression per session. The rail is visible for the entire session. Since session-long visibility is the whole argument for advertising on editors, the rail is used wherever it fits and the leaderboard only covers the band where it does not.

A sticky top banner was rejected: laptops are wide and short, and a sticky site header plus a sticky 90px banner would permanently occupy roughly a quarter of the vertical space on a 1366x768 screen — the axis where those machines are actually tight. Horizontal space is what they have spare.

## The Rail

`.editor-shell` is a new flex wrapper around the existing `.editor-layout` grid. The panes keep their own two-column grid untouched; the shell only decides how much width they get and seats the rail beside them.

Two details worth knowing before adjusting it:

- `.editor-shell .editor-layout` carries `min-width: 0`. Flex children default to `min-width: auto` and would refuse to shrink below the invoice line-item table's irreducible width, which would push the rail off-screen entirely. This is the same containment defect documented for the grid panes in the July 21 entry of `PROJECT_STATUS.md`, in a new place.
- `main:has(.editor-shell)` widens to `84rem` above the rail gate, so the rail is *added beside* the panes rather than *taken out of* them. Without this the panes would each lose about 90px to make room.

The rail is `position: sticky` with `top: 5.75rem`, which clears the sticky site header rather than sliding under it.

## The Anchor, and the Collision It Caused

The anchor is `position: fixed` at the foot of the viewport. That created a real conflict: `.preview-actions` — the sticky Download bar added so the export action was not stranded below a full page of document preview — is itself `position: sticky; bottom: 0`. An anchor at `bottom: 0` sits directly on top of it.

Two rules fix it, and both are required:

```css
body.has-ad-anchor { padding-bottom: 4.75rem; }
body.has-ad-anchor .preview-actions { bottom: 4.75rem; }
```

The first reserves the space so the end of the page can scroll clear of the fixed unit. The second lifts the export button above it. With only the first, the Download button hides under the ad. With only the second, the page's last content is unreachable.

`.has-ad-anchor` is added by `mountEditorAds()` **only when a banner actually filled**. A dormant zone, a blocked request or an ad blocker therefore leaves the layout byte-identical to having no placement at all, rather than reserving space for something that never arrives.

The anchor also carries `padding-bottom: calc(0.25rem + env(safe-area-inset-bottom, 0px))` so it clears the home-indicator gesture bar on modern phones, and keeps a deliberately small "Advertisement" label: on a 50px unit a full-size label would nearly double the vertical cost.

## Iframe Isolation Is Load-Bearing Here

Every banner on the site renders inside a `srcdoc` iframe. On the blog and landing pages that was an anti-clobbering measure (`ADSTERRA_AD_CONFLICT_FIX.md`: two Adsterra tags sharing one window scope corrupt each other's `atOptions`).

On the editors it carries a second, heavier job. Editors are where visitors type tenant addresses, employee disciplinary records, salary figures and bank details. The product's central claim is that none of it leaves the device. The iframe is served from the network's own origin, so the same-origin policy prevents anything inside it from reading the containing document, its form fields, or `localStorage` for this site. The claim survives intact and is now stated explicitly in `site/privacy.html`.

**Adsterra's Native Banner was rejected for exactly this reason and must not be used on editor pages.** It injects into the page context, which would place third-party JavaScript in the same document as the user's typed content. Whatever it earned, it would make the privacy claim false. This constraint is recorded in `CLAUDE.md`, `PRD.md` and the header comment of `site/js/ads.js` so it survives a future session that only reads one of them.

## Documents Updated Alongside

Reversing an ad-policy decision falsifies every document that stated the old one. All were corrected in the same pass:

| File | Change |
|---|---|
| `site/privacy.html` | Section 4 now lists every surface carrying advertising and adds a clause explaining the isolation guarantee. Revision date bumped |
| `site/terms.html` | Section 6 rewritten to cover editors and to state the homepage and exports carry none. Revision date bumped |
| `site/about.html` | The paragraph claiming editors carry no advertising was factually wrong the moment this shipped; rewritten |
| `PRD.md` | Section 5.3 carries the revised policy with its five constraints |
| `CLAUDE.md` | Project context and a new Editor Ad Containment testing requirement |
| `docs/memory/PROJECT_STATUS.md` | Decision log entry recording the reversal and its reasoning; the monetized flow diagram updated |

If this decision is ever reversed again, every row above needs revisiting.

## Ruled Out

- **A second unit per editor.** One is the whole point. Two makes it a monetized surface rather than a workspace with a banner.
- **Any placement inside the form or preview panes.** The document must never compete with an advertisement for attention. The placement lives in the page shell only.
- **Pop-Under or Social Bar on editors.** Same rule the blog already follows for indexable content. A Pop-Under firing while someone drafts a disciplinary notice is precisely the experience that costs a return visit.
- **Live reflow between bands on resize.** The band is chosen once per page load via `matchMedia`, matching the existing leaderboard behaviour, because re-mounting a tag double-counts impressions. Resizing a window across a band boundary mid-session therefore leaves the original unit in place, which is the correct trade.
- **A top banner as the primary placement.** Raised as an alternative to the rail on the grounds that it costs no pane width. Rejected because it scrolls out of view within seconds of the visitor reaching the form, which forfeits the session-long visibility that is the entire argument for advertising on editors. It survives only as the fallback for the band where a rail does not fit.
- **A distinct reporting zone.** The rail reuses the blog's `skyscraper` key and the anchor reuses `leaderboardMobile`. Separating editor revenue in Adsterra reporting needs a support ticket for a size already in use (see the Adsterra notes in `PROJECT_STATUS.md`); worth doing if editor placements turn out to carry the revenue, but not a blocker.

## Verification

Verified without a browser, consistent with the rest of this work:

- Structural pass across all 24 pages: internal links resolve, JSON-LD parses, single `<h1>`, canonical and metadata coverage intact
- All four editors serve locally with every asset returning 200
- `node --check` clean across `site/js`
- Mount-logic harness over `mountEditorAds()`, 32 cases: exactly one unit at every one of fourteen widths including both band boundaries and one pixel either side of each, correct zone size per band, every unit labelled and iframe-isolated, dormant zones filling nothing and reserving no space, missing hosts survivable, `.has-ad-anchor` added only on a successful anchor fill

**Not verified, and worth a real-device pass:** that the anchor genuinely clears the Download button on a phone, that the rail does not collide with the sticky header at awkward zoom levels, and that print output from `docs.html` carries neither placement. The print rules are written but were verified as CSS only, not as a rendered print job — the same gap already recorded for the document builder.
