# R2 Custom Domain on the Apex Takes the Whole Site Down (404 on Every Path)

Date: July 30, 2026
Status: Root cause confirmed from the Cloudflare dashboard. Remediation steps below, not yet applied.

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

Not yet applied — this is dashboard state, and nothing in the repository can cause or correct it. Perform in this order:

1. **Release the hostname.** R2, then the `product-mockups` bucket, then Settings, then Custom Domains. Open the `...` menu beside `templatebox.win` and remove it. This is the single step that restores service.
2. **Restore DNS.** In Cloudflare DNS, confirm `templatebox.win` is a `CNAME` to `templatebox.netlify.app`, proxied (orange cloud), and that `www` is too. Recreate either record if the R2 binding replaced it. Keep SSL/TLS on Full (strict); see the operational notes in `PROJECT_STATUS.md` about the redirect loop that Flexible causes against Netlify.
3. **Verify before assuming success.** `curl -I https://templatebox.win/` must return 200 with a Netlify header such as `x-nf-request-id` present. A 200 alone is not sufficient evidence, because R2 can also return 200 once objects exist — the Netlify header is what proves the request reached the right origin.

**If R2 is still wanted for asset hosting, bind it to a subdomain**, for example `cdn.templatebox.win` or `assets.templatebox.win`. Never the apex, and never `www`. Both of those are the website.

## Why R2 Is Not Needed Yet

The photographic mockup feature shipped with assets under `site/assets/mockups/`, served by Netlify's CDN at no cost. R2 becomes worthwhile only when the repository approaches its practical size ceiling of roughly 1GB, which is a few hundred templates away. The migration path is already prepared in `js/mockup.js`: registry entries accept absolute URLs and the loader sets `crossOrigin = "anonymous"` for them.

One requirement for that future move, currently unmet: the bucket has no CORS policy ("There is no CORS Policy defined for this bucket"). The editor reads these images into a canvas and exports with `toDataURL()`, so without a policy allowing `https://templatebox.win` the canvas becomes tainted and the download button fails silently. See `PHOTO_MOCKUP_TEMPLATES_IMPLEMENTATION.md`.

## Testing Steps

1. `curl -I https://templatebox.win/` returns 200 and includes `x-nf-request-id`.
2. `curl -I https://www.templatebox.win/` behaves the same, or redirects to the apex and then does.
3. A mistyped path renders the site's own `404.html` rather than a storage error page.
4. One catalog card click reaches `loading.html` and then the editor.

## Troubleshooting

- **Still 404 after removing the custom domain.** The DNS record for the hostname was probably consumed by the binding and not restored. Recreate the proxied `CNAME` to `templatebox.netlify.app` by hand.
- **200 but the wrong content.** Check the response headers. If `Server: cloudflare` appears with no Netlify request id, something in Cloudflare is still terminating the request ahead of Netlify: check Workers and Pages routes bound to `templatebox.win/*`, and any other R2 bucket that may also claim the hostname.
- **Diagnosing this class of fault generally.** The distinguishing signal is the *absence* of origin headers, not the status code. A 404 carrying `x-nf-request-id` is the site's own 404 page and means routing is healthy; a 404 with only Cloudflare headers means the request never left Cloudflare.

## Related Files

None in the repository. This is Cloudflare dashboard configuration. Recorded here because the failure is total, the cause is invisible from the codebase, and it will recur if R2 is retried on the wrong hostname.
