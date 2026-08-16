# Social Bar (In-Page Push) Ad Not Displaying on the Loading Page

Date: July 11, 2026
Updated: August 16, 2026 (re-verified after the loading page rework; script payload decompiled far
enough to name the actual capping mechanism, which the original diagnosis inferred but could not
show. Original conclusion stands and is now better evidenced. See "Revised" at the bottom.)
Status: Diagnosed; integration verified correct at every externally testable layer; no code defect found

## Issue Title

The Adsterra Social Bar widget never becomes visible on loading.html during the 10-second countdown, while both 300x250 banners on the same page display normally.

## Root Cause

No integration defect exists. The complete delivery chain was verified from the same machine and network where the non-display was observed:

1. The Social Bar script tag is present on the deployed page, directly above the closing body tag per Adsterra's placement instruction.
2. The script URL (pl30250765.effectivecpmnetwork.com) serves the full ~93 KB payload to browser user-agents. Note: it returns an empty 200 response to non-browser user-agents such as default curl, which can mislead command-line diagnostics.
3. The runtime domains referenced inside the script (kettledroopingcontinuation.com, zoologyfibre.com) resolve to genuine Adsterra serving IPs (172.240.x.x), identical to the domains used by the working banners, and are not sinkholed by the FortiGuard DNS filtering documented in ADSTERRA_AD_CONFLICT_FIX.md.
4. Both runtime domains answer HTTPS requests with HTTP 200 and full payloads.

The non-display is therefore the ad script's own runtime decision, with these causes ranked by likelihood:

- Frequency capping: Social Bar serves a visitor once and then caps for a period, tracked per IP/session server-side. Repeated developer reloads from one IP guarantee the cap is hit, after which the script loads but intentionally renders nothing.
- Page lifetime: loading.html hard-navigates to the editor at 10 seconds. Social Bar fetches campaign data and commonly delays its entrance by several seconds by design, so its display window on this page is inherently tight and it can lose the race even for uncapped visitors.
- Geo/format fill: no matching Social Bar campaign for the visitor's region at a given moment.

## Fix Applied

None required in code. The integration matches Adsterra's own placement instruction and was left unchanged; modifying a verified-correct setup to chase runtime ad-network behavior would add risk without evidence.

## Testing Steps

1. Definitive check: in the Adsterra dashboard, view statistics filtered to the Social Bar placement after 24-48 hours of real visitor traffic. Impressions present means the unit serves and observed absence was frequency capping. Zero impressions while the banner placements record impressions indicates a fill or timing problem to escalate to Adsterra support with the zone ID.
2. Spot check: open the site from a different device on mobile data (fresh IP and session) and remain on loading.html for the full countdown without clicking.
3. In-browser check: with DevTools open on loading.html, confirm the pl30250765 script loads (Network tab) and watch for requests to the runtime domains above; their presence proves the widget is executing and deciding not to render.

## Troubleshooting

- Script request absent in DevTools: an ad-blocking extension is stripping it; retest in a clean profile.
- Persistent zero impressions in the dashboard: contact Adsterra support, referencing the Social Bar zone on templatebox.win, and ask whether the format has fill for the site's primary geos and whether its display delay is configurable.
- Structural consideration: the Social Bar is placed only on a page that exists for roughly 10 seconds per visit, so it will always under-deliver relative to the banners even when healthy. Whether that placement is worth revisiting is a product decision outside the scope of this document.

## Revised: August 16, 2026

Re-reported after the loading page's rail and layout rework. **Nothing in that work touched the
Social Bar** — the tag is intact at `loading.html:273`, still directly above `</body>` per
Adsterra's instruction. The original diagnosis is unchanged, but the delivery chain was re-verified
against current data and the capping mechanism is no longer an inference.

**Delivery chain, re-verified (all healthy):**

| Check | Result |
|---|---|
| Script payload, browser UA + referer | HTTP 200, 97,137 bytes (July: "~93 KB") |
| Script host DNS | Resolves to the same Adsterra pool (172.240.x, 23.111.84.x) as the working banner host |
| `kettledroopingcontinuation.com` | Resolves, Adsterra pool |
| `portalfluently.com` | Resolves, Adsterra pool |
| `workdeadlinededicate.com` | Resolves, Adsterra pool |
| `protrafficinspector.com` | Resolves (AWS, 18.196.51.86) |
| `mamshirt.com` | Resolves (Cloudflare) |

Note the runtime domain list has **changed since July**: `zoologyfibre.com` is no longer referenced,
and `portalfluently.com`, `workdeadlinededicate.com`, `mamshirt.com` and `protrafficinspector.com`
are new. Do not treat the July list as current when diagnosing a block; re-extract it from the
served payload instead.

**What the payload actually does.** The script is obfuscated with a string-table indirection
(`s2pjfl(i)` indexing an array built by `s2pjfs()`), a single 97 KB line, so a plain text search
for `location.hostname` finds nothing and proves nothing. Extracting around the decoded string
indices shows three things worth knowing:

1. **A 7-day capping cookie keyed to the hostname.** The cookie write passes `0x7*0x15180`
   seconds — 7 × 86400 = **604800s = 7 days** — together with `window.location.hostname`. This is
   the frequency cap the original document ranked as the most likely cause, and it is
   substantially longer-lived than "per session" suggests. A developer reloading `loading.html`
   repeatedly will set it once and then see nothing for a week in that browser profile, on that
   hostname.
2. **A third-party user-ID cookie on `protrafficinspector.com`** (`userIdCookieDomain`). Browsers
   that block third-party cookies — Chrome Incognito by default, Safari and Firefox generally —
   deny this, and it is exactly the sort of domain tracking-protection lists and network-level DNS
   filters carry. A blocked ID cookie is an additional independent way for the widget to load and
   then decline to render.
3. **A same-host referrer comparison**: `new URL(document.referrer).hostname === new URL(document.URL).hostname`.
   This passes in normal use and also passes in local testing (index → loading, both on
   `localhost`), so it is not a localhost-specific blocker.

**On local testing specifically.** No hard hostname allowlist was found in the payload — the
`hostname` uses located are telemetry, cookie scoping and the referrer comparison above, none of
which reject `localhost`. That is **not** proof the network will fill for a non-registered origin,
since the fill decision is server-side and unobservable from here; it only means the failure cannot
be attributed to a client-side domain gate. The banners rendering fine on `localhost` shows the
network does not blanket-refuse local origins, but the banners are a different format served from a
different endpoint and their behaviour does not transfer.

**Ranked causes, unchanged in order, now better evidenced:** the 7-day hostname cookie cap; the
10-second page lifetime racing the widget's deliberate entrance delay; third-party cookie blocking
on `protrafficinspector.com`; geo/format fill.

**Fastest way to distinguish them:** open `loading.html` in a **fresh incognito window with a
different IP** (mobile hotspot), sit through the full countdown without clicking, and watch the
Network tab. Script request absent means an extension is stripping it. Script present with no
follow-up requests to the runtime domains above means it loaded and declined — cap or fill. Script
present *with* runtime requests and still nothing visible means it is rendering and losing the
10-second race. The Adsterra dashboard impression count remains the only definitive answer.

## Related Files

- `loading.html` (Social Bar tag placement)
- `docs/error-fixes/ADSTERRA_AD_CONFLICT_FIX.md` (FortiGuard DNS sinkhole environment; banner and popunder conflicts)
- `docs/error-fixes/LOADING_REDIRECT_STALL_FIX.md` (loading page navigation watchdog)
- `docs/error-fixes/SOCIAL_BAR_NOT_DISPLAYING.md` (this document)
