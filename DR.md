# TemplateBox Disaster Recovery Plan

Last reviewed: August 6, 2026
Owner: site operator (single-operator project)
Scope: total loss of any or all of the delivery chain — GitHub, Netlify, Cloudflare, the domain, the local machine, or the Adsterra account.

## 1. The Honest Summary

**Full rebuild from a surviving copy of the Git repository: about 45 minutes of work, plus up to 48 hours of DNS and TLS propagation that cannot be shortened.**

The site is unusually easy to recover, and that is a consequence of the architecture rather than luck:

- There is no database, no server-side runtime, and no build step.
- The entire deployable site is 54 files and 6.9MB, of which 5.2MB is mockup imagery.
- Every visitor's document lives in their own browser's `localStorage` and never touches our infrastructure, so **there is no user data for us to lose, restore, or breach.** This is the single largest reason the recovery story is short.
- Netlify serves the `site/` directory verbatim. "Deploying" is copying a folder.

The realistic worst case is therefore not data loss. It is **downtime while DNS and TLS re-establish**, and **revenue interruption if the Adsterra account is what is lost.**

## 2. What Would Actually Hurt

Ranked by how painful recovery is, not by likelihood.

| Rank | Loss | Recoverable from | Realistic recovery time |
|---|---|---|---|
| 1 | **Adsterra account** | Nothing we hold. Zone keys are theirs to reissue | Days to weeks; revenue is zero throughout |
| 2 | **Domain lapses or is seized** | Cloudflare Registrar; renewal records | Hours if renewal; potentially never if lost at registry level |
| 3 | **GitHub and local machine, simultaneously** | Netlify's deployed copy (see 4.6) | 2 hours, losing `docs/` |
| 4 | Cloudflare account | Re-point nameservers; re-add DNS records | 1 hour work + up to 48h propagation |
| 5 | Netlify account | New site, reconnect repo or drag-and-drop | 20 minutes + DNS/TLS |
| 6 | GitHub repository | Local clone, or any other clone | 10 minutes |
| 7 | Local machine | `git clone` | 5 minutes |

**The asymmetry worth internalising:** items 3–7 are all genuinely quick. Items 1 and 2 are the ones that can end the project, and neither is fixed by better backups. They are fixed by not letting them happen — see section 8.

## 3. The Complete Inventory

### 3.1 Code and content — fully version controlled

| Asset | Location | Recoverable? |
|---|---|---|
| Entire `site/` publish directory | Git (`AtreusTefo/TemplateBox`, branch `main`) | Yes |
| All documentation (`docs/`, `PRD.md`, `CLAUDE.md`, this file) | Same repo | Yes |
| `netlify.toml` (headers, redirects) | Same repo | Yes |
| Blog content (`site/js/blog-data.js` + `site/blog/*.html`) | Same repo | Yes |
| Mockup imagery and thumbnails (5.2MB) | Same repo | Yes — the only files that cannot be regenerated from code |

### 3.2 Configuration held only in third-party dashboards

**This is the part that is not in Git and must be reproducible from this document.**

| Item | Where | Value / note |
|---|---|---|
| Netlify publish directory | Netlify build settings | `site` |
| Netlify build command | Netlify build settings | *(empty — there is no build)* |
| DNS records | Cloudflare | `templatebox.win` → CNAME → `templatebox.netlify.app`, proxied<br>`www` → CNAME → `templatebox.netlify.app`, proxied |
| SSL/TLS mode | Cloudflare | **Full (strict)** — Flexible causes an infinite redirect loop against Netlify's forced HTTPS |
| Nameservers | Cloudflare Registrar | Locked to Cloudflare; Netlify DNS can never complete verification, do not try |
| Clarity project ID | Hardcoded in every page | `xix7m2758f` |
| Adsterra zone keys | Hardcoded in `site/js/ads.js` and `site/loading.html` | See the zone table in `docs/memory/PROJECT_STATUS.md` |

**Adsterra zone keys live in the repository**, so losing the Adsterra *account* loses the revenue relationship but not the knowledge of which zone served where. Restoring means Adsterra reissuing zones and a find-and-replace in `site/js/ads.js`.

### 3.3 External runtime dependencies

Three origins we do not control:

- `cdnjs.cloudflare.com` — jsPDF 2.5.1, used for every PDF export
- `fonts.googleapis.com` / `fonts.gstatic.com` — Playfair Display, Inter

The jsPDF tag carries a Subresource Integrity hash, so a swapped or altered file is refused rather than executed. That covers tampering, not availability: if cdnjs went down — or served a modified file, which SRI turns into a refusal — **PDF export breaks on every editor** while the rest of the site works. Self-hosting `jspdf.umd.min.js` (~356KB) into `site/js/vendor/` is the remaining fix and is not currently done. See section 8.

**If the pinned jsPDF version is ever changed, the SRI hash must be recomputed**, or every editor silently loses PDF export:

```
curl -sS https://cdnjs.cloudflare.com/ajax/libs/jspdf/<version>/jspdf.umd.min.js \
  | openssl dgst -sha384 -binary | openssl base64 -A
```

## 4. Recovery Runbooks

### 4.1 Local machine lost

```
git clone https://github.com/AtreusTefo/TemplateBox.git
cd TemplateBox
npx serve          # from the repo root, NOT from inside site/
```

**Time: 5 minutes.** No dependencies to install, no environment variables, no secrets file.

### 4.2 GitHub repository lost or corrupted

Any full clone is a complete replacement, including history.

```
cd TemplateBox                       # an existing local clone
git remote set-url origin <new-remote-url>
git push --all && git push --tags
```

Then reconnect Netlify to the new repository, or switch to drag-and-drop deploys (4.5).

**Time: 10 minutes.**

### 4.3 Netlify account or site lost

1. Create a new Netlify site.
2. Connect it to the GitHub repository, branch `main`.
3. Build settings: **publish directory `site`, build command empty.** `netlify.toml` sets both, but confirm the UI has not overridden them.
4. Note the new `*.netlify.app` hostname.
5. In Cloudflare, update both CNAME records to it.
6. **Set the new records to DNS-only (grey cloud) first.** Wait for Netlify's Let's Encrypt certificate to show as issued, then switch to proxied (orange cloud). Proxying before the certificate issues blocks Netlify's verification.
7. Confirm Cloudflare SSL/TLS is **Full (strict)**.

**Time: 20 minutes of work; certificate issuance usually minutes, allow several hours.**

### 4.4 Cloudflare account lost

1. Re-register or transfer the domain into a new Cloudflare account (nothing in the architecture requires Cloudflare specifically).
2. Recreate the two CNAME records from 3.2.
3. Set SSL/TLS to Full (strict).
4. Re-add the custom domain in Netlify.

**Time: 1 hour of work, plus up to 48 hours of nameserver propagation.** The longest unavoidable delay in any scenario.

### 4.5 Deploying with no Git at all

Netlify accepts a folder drop. Drag the **`site` folder** — not the repository root — onto the Netlify deploys page. Works from any surviving copy, including one pulled off the live site (4.6).

### 4.6 Everything lost except the live site itself

If every repository, clone and backup is gone but templatebox.win still resolves:

```
wget --mirror --page-requisites --convert-links --no-parent https://templatebox.win/
```

This returns every served file: HTML, CSS, JS, images. It does **not** return `docs/`, `PRD.md`, `CLAUDE.md`, `DR.md` or `netlify.toml`, because those deliberately live outside the publish directory and are never uploaded (see `INTERNAL_FILES_PUBLICLY_SERVED.md` — that is a security feature, and this is its one cost).

Also check the Wayback Machine, which has crawled the site.

**Time: 2 hours.** The site returns to service; documentation and header configuration must be rewritten from this file.

### 4.7 Adsterra account lost or terminated

No technical recovery exists. The zone keys belong to Adsterra.

1. The site keeps working. Every ad host renders nothing when its zone key is dead — designed behaviour, not a failure mode, and no layout shifts.
2. Open a support case, or failing that register fresh.
3. Replace zone keys in `site/js/ads.js` (`AD_ZONES`) and the two inline banners in `site/loading.html`.
4. The Social Bar script tag in `site/loading.html` also carries an account-specific URL and must be replaced.

**Time: 30 minutes of code once new zones exist. Getting new zones is the unbounded part.**

## 5. Verifying a Recovery Actually Worked

Do not declare recovery complete on "the homepage loads." Run this:

```
npx serve                    # from repo root
```

Then confirm:

- [ ] `https://templatebox.win/` serves over HTTPS with a valid certificate, no redirect loop
- [ ] `https://www.templatebox.win/` reaches the same site
- [ ] Clicking a catalog card reaches `loading.html`, counts down, and lands on the correct editor
- [ ] `loading.html?target=docs` opens the document builder, not the resume builder — the whole `?target=` mechanism depends on query strings surviving
- [ ] Ctrl-clicking a catalog card opens `loading.html` in a new tab, not the editor directly
- [ ] An editor exports a PDF (proves cdnjs is reachable, jsPDF loaded, and the SRI hash still matches)
- [ ] `/blog/free-cv-resume-templates-build-professional-resume-fast.html` returns 200
- [ ] `/post.html?slug=free-cv-resume-templates-build-professional-resume-fast` 301-redirects to it
- [ ] `/sitemap.xml`, `/robots.txt` and `/assets/logo-mark.svg` return 200
- [ ] A nonexistent path returns the custom `404.html`
- [ ] Response headers include `X-Content-Type-Options` and `X-Frame-Options`
- [ ] `/admin.html` returns `X-Robots-Tag: noindex`
- [ ] Adsterra dashboard records impressions within a few hours

Then resubmit `https://templatebox.win/sitemap.xml` in Google Search Console.

## 6. Recovery Time and Point Objectives

| Scenario | RTO (time to restore) | RPO (data lost) |
|---|---|---|
| Local machine | 5 min | None |
| GitHub | 10 min | None |
| Netlify | 20 min + cert | None |
| Cloudflare / DNS | 1 h + up to 48 h propagation | None |
| Everything but the live site | 2 h | `docs/` and `netlify.toml` |
| Total loss including live site | Bounded by domain recovery | Everything not in an off-site copy |
| Adsterra | Unbounded | No site data; revenue only |

**RPO is effectively zero for user data in every scenario, because we hold none.** Every RPO above refers to project files, not customer information.

## 7. What Is Not Currently Backed Up

Stated plainly, because a DR plan that only lists strengths is not a DR plan.

1. **There is no off-site backup independent of GitHub.** Every copy is either the GitHub remote or a clone of it. GitHub disappearing *and* the local machine failing together is unlikely, but it is the one scenario that costs real work (2 hours, per 4.6).
2. **`docs/` exists only in Git.** It is deliberately not on the live site. Losing GitHub and local simultaneously loses all documentation, including this file. Keep a copy somewhere else.
3. **jsPDF is loaded from cdnjs, not self-hosted.** A cdnjs outage silently breaks PDF export on all four editors.
4. **The mockup imagery (5.2MB) is the only genuinely irreplaceable content.** Everything else is text that could be rewritten; those photographs and their derived thumbnails could not.

## 8. Recommended Hardening

In order of value per effort.

| # | Action | Effort | Addresses |
|---|---|---|---|
| 1 | **Enable domain auto-renew and registrar lock in Cloudflare.** Confirm the billing card on file is current | 5 min | Risk rank 2, the one that can end the project |
| 2 | **Enable 2FA on GitHub, Netlify and Cloudflare** | 10 min | The only realistic compromise path for a static site |
| 3 | **Verify the Adsterra payout email and 2FA are current** | 10 min | Risk rank 1 |
| 4 | **Add a second Git remote** (GitLab or Codeberg mirror) and push to both | 15 min | Gaps 1 and 2 |
| 5 | **Self-host jsPDF** into `site/js/vendor/` (SRI already covers tampering; this covers outage, and removes the hash-rotation trap in 3.3) | 30 min | Gap 3 |
| 6 | Keep an offline archive of `site/assets/` on external storage | 10 min | Gap 4 |
| 7 | Re-read this document each quarter | 2 min | Drift |

Items 1–3 cost twenty-five minutes together and address the failure modes no amount of backup discipline can fix. They are the highest-value actions in this document.

## 9. Why This Plan Is Short

Most disaster recovery plans are long because most systems have state: databases to restore to a point in time, queues to drain, caches to warm, sessions to invalidate, secrets to rotate.

TemplateBox has none of that. The decisions that made it cheap to run — no server, no database, no accounts, everything client-side — are the same decisions that make it cheap to recover. The architecture is the disaster recovery plan; this document mostly writes down where the pieces live.

The corollary is worth stating: **the failure modes that remain are commercial, not technical.** Losing the domain or the ad account would hurt far more than losing every server we have, because we do not have any servers.

## 10. Related Documents

- `docs/memory/PROJECT_STATUS.md` — live infrastructure detail, Adsterra zone table, and the DNS/TLS cutover ordering that recovery depends on
- `docs/error-fixes/INTERNAL_FILES_PUBLICLY_SERVED.md` — why `docs/` is not on the live site, which is why 4.6 cannot recover it
- `docs/error-fixes/LOCAL_INDEX_PAGE_BLANK_DIRECTORY_LISTING_INSTEAD_OF_HOMEPAGE.md` — local serve configuration, needed when verifying a recovery
- `CLAUDE.md` — architecture constraints that must survive any rebuild
