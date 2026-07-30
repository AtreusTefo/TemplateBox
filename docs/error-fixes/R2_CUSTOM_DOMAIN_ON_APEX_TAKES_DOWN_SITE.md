# R2 Custom Domain on the Apex Takes the Whole Site Down (404 on Every Path)

Date: July 30, 2026
Status: **Resolved the same day.** Root cause confirmed from the Cloudflare dashboard, then fixed and verified in production. Total outage window roughly one hour of active diagnosis; actual start time unknown, since the bucket's custom domain was bound before anyone noticed.

**Read the "Removing the Custom Domain Deletes the Apex Record" section below before doing this again.** Removing the R2 binding does not restore service by itself; it takes the site from a 404 to not resolving at all, which looks worse and caused a second round of confusion.

## Issue Title

Every path on `https://templatebox.win/` returns HTTP 404, served by Cloudflare with no Netlify headers, rendering a storage-style error page reading "Object not found" and "Is this your bucket?". `https://templatebox.netlify.app/` serves 200 normally at the same moment. `www` is affected too.

## Root Cause

An R2 bucket named `product-mockups` was created and `templatebox.win` — **the apex domain, which is the website** — was added to it under Settings, Custom Domains, showing Status "Active" and Access "Enabled".

An R2 custom domain does not add a path or a subdirectory. It **binds the entire hostname to the bucket**, so every request to that hostname is answered by R2 instead of reaching Netlify. The bucket was empty (Bucket Size 0 B, zero objects), so R2 correctly answered every request with "object not found". The site was not broken; it was no longer being asked.

Two things make this worse than it first looks:

1. **Uploading files would not have fixed it.** A bucket serves an object only when the request path matches an object key. There is no `index.html`, no page routing, no 404 page, no `netlify.toml` headers or redirects. The site would still have been gone; visitors would just have hit a file server.
2. **The root path can never work.** Cloudflare's own documentation states that public buckets do not list bucket contents at the root of the domain, so `/` returns 404 by design regardless of what is uploaded.

Binding the custom domain also takes over DNS for that hostname, superseding the `CNAME` to `templatebox.netlify.app` recorded in the Live Infrastructure table in `PROJECT_STATUS.md`. `www` returning 404 as well indicates it resolves through the apex rather than independently to Netlify, so both records need checking.

## Fix Applied

This is dashboard state; nothing in the repository can cause or correct it. The sequence that worked, in order:

1. **Released the hostname.** R2, then the `product-mockups` bucket, then Settings, then Custom Domains, then the `...` menu beside `templatebox.win`, then Remove.
2. **Recreated the apex DNS record**, which step 1 destroyed (see the next section). `CNAME` on `@` to `templatebox.netlify.app`.
3. **Left it grey-cloud (DNS only) until Netlify verified it.** Netlify's Domain management showed `templatebox.win` as "Pending DNS verification" until the record existed and had propagated; proxying before that point can block verification, because Netlify resolves the name and sees Cloudflare's IPs rather than its own load balancer. This is the same sequencing lesson already recorded in `PROJECT_STATUS.md` from the original July domain setup.
4. **Switched the record to Proxied** once Netlify showed it verified and the Let's Encrypt certificate listed both `templatebox.win` and `www.templatebox.win`.

Final state: apex and `www` both `CNAME` to `templatebox.netlify.app`, both proxied, matching the configuration recorded in the Live Infrastructure table in `PROJECT_STATUS.md`.

## Removing the Custom Domain Deletes the Apex Record

This is the part that is genuinely surprising and cost a second round of diagnosis.

Binding an R2 custom domain **creates** a DNS record for that hostname. Removing the binding **deletes that record** — and because the binding had superseded the original `CNAME` to Netlify, there was nothing underneath it to fall back to. The zone was left with only the `www` CNAME and two `google-site-verification` TXT records, and no address record for the apex at all.

The failure mode therefore changes rather than disappears, and the second one reads as worse:

| Stage | Symptom | What it means |
|---|---|---|
| R2 bound to apex | `404` from Cloudflare, storage error page | Hostname resolves, but to an empty bucket |
| R2 binding removed | `DNS_PROBE_FINISHED_NXDOMAIN`, "This site can't be reached" | Hostname does not resolve at all |
| Apex `CNAME` recreated | `200` with `x-nf-request-id` | Fixed |

Cloudflare does flag this correctly if you read the panel: a "Visitors cannot reach templatebox.win — Add an A, AAAA, or CNAME record" recommendation appears at the top of the DNS page. That banner is also cached, so it persists for a while after the record is added; do not treat its continued presence as evidence the fix failed.

A related consequence worth knowing: with the apex missing, `www` appeared broken too, even though its record was intact and proxied. Netlify redirects `www` to the primary domain, so a request to `www` 301'd to the apex and then failed to resolve — the browser reports the failure against the apex name, which makes the surviving hostname look like the broken one.

## Verification Performed

Confirmed in production after the fix, through the Cloudflare proxy:

| Check | Result |
|---|---|
| Apex resolution | `172.67.205.174`, `104.21.90.225` (Cloudflare, correct for proxied) |
| Apex homepage | `200`, `Server: cloudflare` **and** `x-nf-request-id` present |
| Redirect loop | None: 0 redirects, final `200`, so SSL/TLS is not on Flexible |
| `www` | `301` to `https://templatebox.win/` |
| Certificate | Let's Encrypt covering `templatebox.win, www.templatebox.win` |
| Deployed pages and assets | `/mockup.html`, the mockup registry and all three image assets return `200` |
| Internal files | `/docs/memory/PROJECT_STATUS.md` and `/CLAUDE.md` return `404` |

**Verify with the header pair, not the status code.** `Server: cloudflare` proves the proxy is in front; `x-nf-request-id` on the same response proves the request reached Netlify behind it. Either one alone proves nothing: a 200 can come from R2 once objects exist, and a Cloudflare-only response is exactly what the outage looked like.

**Expect stale negative DNS caching to outlast the fix.** After the record was correct at Cloudflare's authoritative nameservers and at 1.1.1.1, 8.8.8.8 and 9.9.9.9, the local resolver still returned NXDOMAIN, because the earlier "does not exist" answer was cached with its own TTL and `Clear-DnsClientCache` does not reach upstream resolvers. Verification had to bypass DNS entirely:

```
curl -s -o /dev/null -D - --resolve templatebox.win:443:<edge-ip> https://templatebox.win/
```

Do that before concluding a DNS fix has not worked, and treat a browser still showing the error as unproven rather than as evidence.

**If R2 is still wanted for asset hosting, bind it to a subdomain**, for example `cdn.templatebox.win` or `assets.templatebox.win`. Never the apex, and never `www`. Both of those are the website.

## Why R2 Is Not Needed Yet

The photographic mockup feature shipped with assets under `site/assets/mockups/`, served by Netlify's CDN at no cost. R2 becomes worthwhile only when the repository approaches its practical size ceiling of roughly 1GB, which is a few hundred templates away. The migration path is already prepared in `js/mockup.js`: registry entries accept absolute URLs and the loader sets `crossOrigin = "anonymous"` for them.

One requirement for that future move, currently unmet: the bucket has no CORS policy ("There is no CORS Policy defined for this bucket"). The editor reads these images into a canvas and exports with `toDataURL()`, so without a policy allowing `https://templatebox.win` the canvas becomes tainted and the download button fails silently. See `PHOTO_MOCKUP_TEMPLATES_IMPLEMENTATION.md`.

## Troubleshooting

- **Still 404 after removing the custom domain.** The apex DNS record was consumed by the binding and not restored. Recreate the `CNAME` to `templatebox.netlify.app` by hand. If it now fails to resolve rather than 404ing, that is progress, not regression — see the table above.
- **Netlify stays on "Pending DNS verification".** Either the record does not exist yet, or it is proxied and Netlify is seeing Cloudflare's IPs. Set it to DNS only until Netlify verifies, then re-enable the proxy.
- **200 but the wrong content, or a Cloudflare-only response.** Something in Cloudflare is still terminating the request ahead of Netlify. Check Workers and Pages routes bound to `templatebox.win/*`, and any other R2 bucket that may also claim the hostname.
- **Infinite redirect loop after enabling the proxy.** SSL/TLS is on Flexible. Set it to Full (strict); Netlify forces HTTPS and Flexible fights it.
- **Cloudflare still warns "Visitors cannot reach templatebox.win" after the record exists.** The Recommendations panel is cached. Confirm against the record list, not the banner.
- **Diagnosing this class of fault generally.** The distinguishing signal is the *absence of origin headers*, not the status code. A 404 carrying `x-nf-request-id` is the site's own 404 page and routing is healthy; a 404 with only Cloudflare headers means the request never left Cloudflare.

## Do Not Do These

Both were offered by the tooling during this incident and both are wrong for this project:

- **Do not accept Netlify's suggestion to make `www.templatebox.win` the primary domain.** Netlify recommends it because an apex primary bypasses some of its own CDN, but Cloudflare is the CDN here so the concern barely applies. Acting on it would change the primary domain while every canonical URL, `og:url` and `sitemap.xml` entry on the site is `https://templatebox.win/...` — rewriting the site's identity in search to solve a problem it does not have.
- **Do not use "Set up Netlify DNS".** Cloudflare Registrar locks nameservers to Cloudflare, so Netlify DNS can never complete verification. This was already tried during the original July setup and the Netlify DNS zone had to be deleted to get the domain into external-DNS mode. See the operational notes in `PROJECT_STATUS.md`.

## Related Files

None in the repository. This is Cloudflare and Netlify dashboard configuration. Recorded here because the failure is total, the cause is invisible from the codebase, the remedy has a destructive second step that is easy to misread as a new fault, and it will recur if R2 is retried on the wrong hostname.
