# Social Bar (In-Page Push) Ad Not Displaying on the Loading Page

Date: July 11, 2026
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

## Related Files

- `loading.html` (Social Bar tag placement)
- `docs/error-fixes/ADSTERRA_AD_CONFLICT_FIX.md` (FortiGuard DNS sinkhole environment; banner and popunder conflicts)
- `docs/error-fixes/LOADING_REDIRECT_STALL_FIX.md` (loading page navigation watchdog)
- `docs/error-fixes/SOCIAL_BAR_NOT_DISPLAYING.md` (this document)
