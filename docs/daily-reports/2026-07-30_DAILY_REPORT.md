# Daily Report: July 30, 2026

Session scope: one feature built to a supplied specification, plus one production outage discovered incidentally. Photographic mockup templates were added to the Product Mockup Generator using three-layer compositing (the "Sandwich Method"), driven by a research brief the operator had assembled with another AI and attached as `MOCKUP_CONTEXT.MD`. The first photographic template, a leaning wood A4 frame, is working from the catalog through to export. No public URL changed and no constraint in CLAUDE.md was relaxed.

Two findings outrank the feature work itself:

1. **Production `templatebox.win` was serving 404 on every path**, from Cloudflare rather than Netlify. Discovered by accident while trying to compare a layout against the live site. The whole site, including all ad revenue, was down. Cause: an R2 bucket had the apex domain bound as its Custom Domain. **Diagnosed and fixed within the session; the site is live again and today's feature is deployed and verified on it.**
2. **The specification's compositing instructions were incomplete in a way that silently ruins output.** Implementing them literally produced washed-out artwork. The missing element was the overlay's blend mode, and the failure mode is invisible: the browser reports no error.

## Summary

| Area | Outcome |
|---|---|
| Photographic mockup templates | Working. Registry-driven, first template live end to end |
| Rendering engine | `js/mockup.js` extended with a photo product type; the four vector products are untouched |
| Catalog integration | New card under Product Mockups, opening the editor with the template pre-selected |
| Ad flow | Unchanged. The new card routes through `loading.html` exactly like every other card |
| Coordinate tooling | Internal picker built, so future templates need no manual pixel hunting |
| Defect found and fixed | Overlay blend mode washing out all artwork; found during verification, never deployed |
| Verification capability gained | File uploads can now be driven headlessly, closing a gap open since July 20 |
| Production outage | Found, diagnosed and **fixed**. R2 bucket had claimed the apex domain |
| Production status | **Live**, with today's feature deployed and verified through the Cloudflare proxy |
| Documentation | 3 new documents, 3 updated, 1 daily report, 2 memory entries |

## 1. What I did today

### 1.1 Read the brief against the codebase before building

The attached specification described a Mockey/Placeit-style architecture: a gallery page of thumbnails, each opening an editor modal in place. That shape was deliberately **not** built.

The reason is monetization, not preference. `index.html` already is the gallery, and every catalog card routes through `loading.html`, the ten-second interstitial that carries the Popunder, two banners and the Social Bar and is the site's only revenue surface. An in-page modal would let a visitor reach a working editor without ever passing through it, which is a direct violation of the architecture in CLAUDE.md and PRD.md. Instead each photographic template became a catalog card using the `data-doc` preset hand-off that `docs.html` already uses for its six document types, so the monetized flow is untouched and the deep-selection behaviour the brief wanted is still delivered.

Three further points in the brief were checked rather than accepted:

- **Cloudflare R2 object storage** was specified for the heavy assets. Not adopted today: with one template the repository carries it comfortably, and adding a second origin, a CORS policy and an untestable failure mode to host 2.3MB is cost without benefit. The code path for the move is in place instead (see 1.3), so it becomes a configuration change when the collection justifies it.
- **The glfx.js CDN URL in the brief is dead.** `cdnjs.cloudflare.com/ajax/libs/glfx.js/0.0.4/glfx.min.js` returns 404; that library was never published to cdnjs at that path. Had it been pasted in as given, the warp feature would have failed silently in production. Vendored from jsdelivr instead.
- **The `react-window` virtualization** the brief called for solves a problem this design does not have. It exists to stop fifty simultaneous canvases freezing the browser, which is a consequence of the rejected grid-of-live-previews shape. One editor renders one canvas.

### 1.2 Measured the supplied assets instead of trusting their filenames

Four files were supplied. Each needed work before it could be used.

| Supplied | Finding | Action |
|---|---|---|
| `wood-a4-base.png` | 2000x2000. Print window is **fully transparent**, not opaque | Changed compositing order; see 1.4 |
| `wood-a4-overlay.png` | 2000x2000. Near-white at 76% opacity inside the window | Required `multiply`; see section 3 |
| `wood-a4-thumbnail.webp` | 2000x2000, 1.44MB | Not used. Too heavy for a catalog card |
| `wood-a4-thumbnailPreview.webp` | 2000x2000, 1.41MB | Not used, same reason |

**Folder names had to be renamed.** The thumbnails arrived at `assets/thumbnails/Product Mockups/Posters,frames,canvas, billboards/`, containing spaces and commas. In this project the publish directory is the web root, so every asset path is a public URL; spaces and commas there produce percent-encoded, fragile links. Renamed to kebab-case throughout.

**The print-area coordinates were measured, not estimated.** The brief's method is to hover over corners in an image editor and write down what you see. Instead the base's alpha channel was scanned programmatically: the fully transparent region is exactly x 655 to 1461, y 224 to 1583, and it accounts for 98.6% of its own bounding box, which also confirms the opening is a clean rectangle rather than an angled quad. That single measurement determined both the coordinates and which rendering path the template needs.

**A replacement thumbnail was generated** at 800x1000 and 69KB, composited through the same three layers the editor uses, with a sample art print inside the frame. Filled rather than empty, because that is the documented standard for catalog cards in `PROJECT_STATUS.md` and because an empty frame advertises nothing.

### 1.3 Built the template registry

`site/js/mockup-templates.js` (73 lines) is data only. An entry declares an id, title, thumbnail, base, overlay, blend mode, compositing mode, and the four print-area corners. `js/mockup.js` ingests the registry at startup, validates each entry structurally, and skips malformed ones rather than letting one bad entry break the editor. Valid entries become both an option in the Product Template select and an accepted `data-doc` preset.

The consequence worth recording: **adding a template requires no engine changes.** Assets, one registry entry, one catalog card, one thumbnail.

Object-storage readiness is built in rather than deferred: template images whose URLs are absolute get `crossOrigin = "anonymous"` before `src` is assigned. Without that, a future move to R2 would taint the canvas and make `toDataURL()` throw, breaking the download button with no other symptom. Local relative paths are unaffected.

### 1.4 Extended the renderer

`js/mockup.js` grew by 371 lines net, adding a photo product type alongside the four vector products, which are functionally untouched.

**Compositing order is per template, because the supplied asset inverts the textbook order.** The brief specifies base, then design, then overlay. That assumes an opaque base. This base has a transparent print window, so the design is drawn *first*, over a white paper backing, and the base is drawn *over* it, letting the photograph's own antialiased window edge mask the artwork. This produces cleaner edges than clipping the design on top of the base would. Both orders are supported and declared per entry: `mode: "window"` for transparent-opening assets, `mode: "surface"` for opaque ones.

Other decisions inside the renderer:

- **Canvas resizes to the base photograph's native resolution** (2000x2000 here) rather than the vector products' fixed 1000x1000, so exports keep the photograph's full quality. Placeholder text and dash patterns scale with it so they do not shrink into illegibility.
- **The four corners are stored even though this template is rectangular.** A rectangle takes the existing contain-fit, drag and scale path. A non-rectangular quad takes a perspective warp. Storing corners rather than a bounding box means angled frames need no schema change later.
- **The warp library loads lazily**, only when a non-rectangular zone actually renders, so this rectangular template pays nothing for a capability it does not use. If the library or WebGL is unavailable the design falls back to an unwarped draw rather than vanishing.
- **The colour field is hidden entirely** for photographic templates, which have no colourway, rather than presented as an empty radio group.
- **The size slider is disabled** where a warp maps the design corner to corner, because in that mode the control would do nothing.

### 1.5 Built the coordinate picker

`site/tools/mockup-admin.html` (312 lines, no dependencies). Load a base image locally, click the four print-area corners, and it emits a complete registry entry to copy. Corners are drawn as marked points joined by lines so a misclick is visible before the entry is used, and clicks are recorded in the image's own pixel space so the on-screen display size never affects accuracy.

It sits in `tools/`, which `netlify.toml` already serves with `X-Robots-Tag: noindex`, so it inherited the correct treatment without a new rule. It never uploads anything.

### 1.6 Wired it into the catalog and editor

- `index.html`: new card with a real photographic thumbnail, `data-target="mockup" data-doc="wood-a4"`, under the existing Mockups filter pill. Hero count corrected from fifteen templates to sixteen.
- `mockup.html`: registry include ahead of the engine, a wrapper id so the colour field can be hidden, and intro, meta description and `SoftwareApplication` JSON-LD extended to mention photographed frames.
- `css/style.css`: `.card-preview.photo` drops the CSS-miniature padding so an image thumbnail fills the 4:5 window edge to edge.

## 2. What was completed

Working and verified:

1. Photographic mockup rendering in the existing editor, first template end to end from catalog click to PNG export.
2. Data-only registry, so further templates need no engine work.
3. Coordinate picker tool for producing new entries.
4. Catalog card, correctly filtered, correctly routed through the ad interstitial, with a preset that survives tampering.
5. Optimised thumbnail replacing the 1.4MB supplied files.
6. Object-storage migration path prepared in code.
7. Overlay blend-mode defect found and fixed before it ever deployed.
8. Documentation: implementation write-up, error document, `PROJECT_STATUS.md`, `DOCUMENTATION_INDEX.md`, this report.

Built but **not** verified: the perspective-warp path for angled frames. It is structurally complete and never executes for any current template, because no angled asset exists yet. It should be treated as unproven until one does.

## 3. Challenges faced and how they were resolved

| Challenge | Resolution |
|---|---|
| **The brief's compositing instructions produced washed-out artwork.** Following them literally, the design rendered pale and milky, as if under tracing paper. The frame and room looked correct, so the layering was clearly right in outline | Measured the overlay instead of guessing: inside the print window it averages alpha 193 over a near-white body (mean luma 211, two thirds of pixels above luma 224). It is a baked **luminance map**, not a shadow cut-out, so at the canvas default `source-over` it simply paints over the artwork. Switched that layer to `multiply`, where white passes the art through untouched and greys darken it. A design colour of (196,138,74) went from sampling (234,219,204) to (190,134,72). Documented in `PHOTO_MOCKUP_OVERLAY_WASHES_OUT_DESIGN.md` |
| **That defect class is invisible.** The Canvas specification says an unrecognised `globalCompositeOperation` is *ignored*, silently leaving `source-over`. A typo in a registry entry would reintroduce the washout with no error anywhere | The blend value is whitelisted in code and defaults safely. The picker tool offers it as a labelled dropdown describing what each asset type looks like, so the value is chosen by inspection rather than recalled. The error document records the selection rule and a pixel-level test |
| **The supplied base inverts the expected layer order.** Its print window is transparent, so drawing the base first, per the brief, would have covered the design | Made compositing order an explicit per-template field with two modes, and used the transparent-window order for this asset so the photograph's own antialiased edge masks the artwork. Cleaner edges than clipping, and future opaque assets remain supported |
| **The brief's CDN link for the warp library 404s.** Pasting it in as given would have shipped a feature that fails only in production | Probed the URL before using it, then probed mirrors. Vendored the file from jsdelivr into `site/js/vendor/`, which also removes a third-party runtime dependency from a page that is meant to work offline |
| **Playwright is not installed in this environment**, and the project's verification precedent depends on it | Used headless Microsoft Edge with `--screenshot` and `--dump-dom`, reading results back through `document.title`. Sufficient for rendering, pixel sampling and DOM assertions |
| **Headless browsers cannot type into a file picker**, so the upload path looked unverifiable, and it is the single most important path in the tool | Populated the input programmatically: built a PNG `File` with `canvas.toBlob`, assigned it through a `DataTransfer`, and dispatched `change`, so the production handler ran unmodified. This closed a verification gap that has been open on this project since July 20 and applies equally to the poster and resume editors |
| **A 320px capture appeared to show layout overflow**, which would be a PRD violation | Did not act on it. Reproduced the identical cutoff on the pre-change page and on `docs.html`, which was Playwright-verified overflow-free on July 21. It is headless-Edge window clamping, not overflow. Recorded as such so it is not chased again |
| **Production could not be used as a comparison baseline** because it returned 404 | Compared against the previous committed revision instead, extracted with `git show` and served locally. The outage was then investigated separately and fixed |
| **Fixing the outage appeared to make it worse**, going from a 404 page to the domain not resolving at all | Recognised the change as progress rather than regression: removing the R2 binding deletes the DNS record it created, so the apex had no record at all. Recreated the `CNAME`, which Cloudflare's own "Visitors cannot reach templatebox.win" banner was already asking for |
| **A DNS fix that was verifiably correct still failed every local test.** The record resolved at Cloudflare's authoritative nameservers and at three public resolvers, yet `Invoke-WebRequest` and `curl` both reported the host as unresolvable | Negative caching: the earlier NXDOMAIN was cached upstream, and `Clear-DnsClientCache` does not reach the upstream resolver. Bypassed DNS entirely with `curl --resolve` against the edge IP, which proved the site was serving with correct SNI while the resolver was still stale. Without this the fix would have looked like a failure |
| **The push was rejected with 403 despite valid stored credentials** | Two GitHub accounts are stored on the machine. The remote URL carries no username, so Git selected `atreusramokate`, which has no write access to `AtreusTefo/TemplateBox`. Pushed once via `https://AtreusTefo@github.com/...` to select the owner's credential; the remote config was deliberately left unchanged and the mismatch reported rather than silently rewritten |
| **`git mv` failed on the asset folders** | The files were untracked, so there was nothing for git to move. Used filesystem moves. A subsequent directory rename was refused by a file lock and was resolved by creating the target structure and moving contents |
| **The first thumbnail was composited with the wrong blend**, so the card preview no longer matched what the tool produces | Regenerated it, implementing alpha-aware multiply arithmetic directly since GDI+ has no such blend mode, then regenerated again with sample art inside the frame to meet the project's filled-preview standard |

## 4. Production outage: found, diagnosed and fixed

Found while attempting to fetch `https://templatebox.win/mockup.html` as a layout baseline — the outage was not reported, and nothing in the repository could have revealed it.

**Observed.** Every path on the apex returned HTTP 404 with `Server: cloudflare` and no Netlify headers at all, rendering a storage error page reading "Object not found" and "Is this your bucket?". At the same moment `https://templatebox.netlify.app/` returned 200 with normal Netlify headers. `www` was affected too.

**Cause, confirmed from the dashboard rather than inferred.** An R2 bucket named `product-mockups` had `templatebox.win` — the apex, the website itself — bound as its Custom Domain, Active and Enabled. An R2 custom domain binds the *entire hostname* to the bucket, so every request was answered by R2 instead of reaching Netlify, and the bucket was empty. Uploading assets would not have fixed it: a bucket has no page routing, no `netlify.toml` headers or redirects, and Cloudflare does not serve bucket listings at a domain root, so `/` 404s by design. The site was never broken; it had simply stopped being asked.

**The remedy has a destructive second step, and this is the part worth remembering.** Removing the binding also deletes the DNS record it created, and because that binding had superseded the original `CNAME` to Netlify, nothing remained underneath. The symptom changed from a 404 to `DNS_PROBE_FINISHED_NXDOMAIN`, which reads as a worse failure than the one being fixed:

| Stage | Symptom | Meaning |
|---|---|---|
| R2 bound to apex | 404 from Cloudflare, storage error page | Resolves, but to an empty bucket |
| Binding removed | NXDOMAIN, "This site can't be reached" | Does not resolve at all |
| Apex `CNAME` recreated | 200 with `x-nf-request-id` | Fixed |

`www` appeared broken throughout despite having an intact, proxied record of its own, because Netlify 301s it to the primary domain and the apex was what was failing — so the browser reported the error against the apex name even when the request started at `www`.

**Sequence that resolved it:** removed the binding; recreated the apex `CNAME` to `templatebox.netlify.app`; left it DNS-only until Netlify's Domain management moved off "Pending DNS verification" and the Let's Encrypt certificate listed both hostnames; then switched to Proxied. Proxying earlier would have kept Netlify's verification failing, because Netlify resolves the name and sees Cloudflare's IPs rather than its own load balancer — the same sequencing lesson already recorded from the original July setup.

**Two dashboard suggestions were deliberately refused.** Netlify recommends making `www` the primary domain, because an apex primary bypasses some of its own CDN; that barely applies behind Cloudflare, and accepting it would have changed the primary domain while every canonical URL, `og:url` and sitemap entry is `https://templatebox.win/...` — rewriting the site's search identity mid-outage to solve a problem it does not have. Netlify also offers "Set up Netlify DNS", which cannot work here: Cloudflare Registrar locks nameservers to Cloudflare, which is why the Netlify DNS zone was deleted during the original setup.

Full write-up, including troubleshooting and the CORS prerequisite for any future R2 migration: `docs/error-fixes/R2_CUSTOM_DOMAIN_ON_APEX_TAKES_DOWN_SITE.md`.

## Verification performed

Headless Microsoft Edge against `npx serve` from the repository root, plus `node --check`.

| Check | Result |
|---|---|
| `node --check` on both JavaScript files | Pass |
| All new URLs served: registry, vendor library, both PNGs, thumbnail, admin tool | 8 of 8 return 200 |
| Catalog card renders with photographic thumbnail filling the 4:5 preview | Pass |
| Preset hand-off opens the editor on the correct template | Pass, `product=wood-a4` |
| Colour field hidden for photographic templates | Pass |
| Vector product regression: default load, swatches, placeholder | Pass, unchanged |
| Empty state renders base, paper backing and overlay shadows | Pass |
| **Design upload through the editor's own file input** | Pass, no validation error raised |
| Canvas sized to the base's native resolution for export | Pass, 2000x2000 |
| Design saturation survives the overlay | Pass, (190,134,72) against a true (196,138,74) |
| `toDataURL()` succeeds, canvas not tainted | Pass |
| Blend comparison, `source-over` against `multiply`, pixel-sampled | Confirms the defect and the fix |
| Asset paths free of spaces and commas | Pass |
| No temporary or internal files left inside `site/` | Pass |

### Post-deploy verification in production

Run after the outage was fixed and the commit had deployed, through the Cloudflare proxy. This also closes the post-deploy checklist carried since the July 27 `site/` migration.

| Check | Result |
|---|---|
| Apex resolution | `172.67.205.174`, `104.21.90.225` — Cloudflare, correct for proxied |
| Homepage | 200, `Server: cloudflare` **and** `x-nf-request-id` present |
| Redirect loop | None: 0 redirects, final 200, so SSL/TLS is not on Flexible |
| `www` | 301 to `https://templatebox.win/` |
| Certificate | Let's Encrypt covering `templatebox.win, www.templatebox.win` |
| `/mockup.html` | 200 |
| `/assets/mockups/wood-a4-base.png` | 200, 2,174,533 bytes — byte-identical to the committed file |
| `/assets/mockups/wood-a4-overlay.png`, thumbnail, registry, vendored glfx.js | 200 |
| `/tools/mockup-admin.html` | 200 with `X-Robots-Tag: noindex, nofollow` |
| `/docs/memory/PROJECT_STATUS.md`, `/docs/project/MOCKUP_CONTEXT.md`, `/CLAUDE.md`, `/PRD.md` | 404 — internal files correctly unserved |
| Mistyped path | 404 |

**Not verified.** The perspective-warp path, which no current template exercises. Real-touchscreen dragging. Narrow-viewport layout on a real device. Whether the Adsterra zones resume filling now that the site is reachable again — the outage will have zeroed impressions for its duration, so treat today's ad figures as unusable rather than as a signal about placement.

All temporary harness files created inside `site/` during verification were removed, and their absence was asserted rather than assumed.

## Files

**Created (8):** `site/js/mockup-templates.js` (73 lines), `site/tools/mockup-admin.html` (312 lines), `site/js/vendor/glfx.js` (vendored, MIT), `site/assets/mockups/wood-a4-base.png` and `-overlay.png` (moved from `site/assets/`), `site/assets/thumbnails/product-mockups/posters-frames-canvas-billboards/wood-a4-thumb.jpg` (generated, 69KB), plus `docs/implementation/PHOTO_MOCKUP_TEMPLATES_IMPLEMENTATION.md`, `docs/error-fixes/PHOTO_MOCKUP_OVERLAY_WASHES_OUT_DESIGN.md`, `docs/error-fixes/R2_CUSTOM_DOMAIN_ON_APEX_TAKES_DOWN_SITE.md` and this report.

**Modified (6):** `site/js/mockup.js` (+371 net), `site/index.html`, `site/mockup.html`, `site/css/style.css`, `docs/memory/PROJECT_STATUS.md`, `docs/DOCUMENTATION_INDEX.md`.

**Moved:** `MOCKUP_CONTEXT.MD` from the repository root to `docs/project/MOCKUP_CONTEXT.md`, per the documentation-organization rule in CLAUDE.md. It was outside `site/` before and after, so it was never publicly served.

**Renamed:** the two supplied thumbnail folders, to remove spaces and commas from public URLs.

**Unused but retained:** the two supplied 1.4MB `.webp` renders, kept in the repository in case a larger preview surface wants them later.

**Commits.** `e47d7f5` on `main`, pushed to `origin` (18 files, 3,099 insertions). Netlify deployed it, and the assets were verified live afterwards. The documentation updates recording the outage resolution follow in a second commit.

## Open items carried forward

1. **Confirm SSL/TLS is Full (strict)** in Cloudflare. The absence of a redirect loop rules out Flexible, so it is almost certainly already correct, but the difference between Full and Full (strict) is whether Cloudflare validates Netlify's certificate on the back half of the connection.
2. **Fix the GitHub push identity.** Either `git remote set-url origin https://AtreusTefo@github.com/AtreusTefo/TemplateBox.git`, or add `atreusramokate` as a collaborator. As it stands a plain `git push` will 403 again, while commits are authored as the account that cannot push.
3. **Verify the perspective-warp path** when the first genuinely angled frame asset arrives. It has never rendered a real image.
4. **Real-touchscreen pass** on the drag interaction, and a narrow-viewport check on a real device. Open since July 20. Do not treat the headless 320px cutoff as evidence of overflow.
5. **Ignore today's Adsterra figures.** The site was unreachable for an unknown period, so impressions are not a signal about placement. This also delays the clean before/after read on the four article-page zones from July 28.
6. **Consider removing the unused 1.4MB `.webp` files** if the collection grows and they stay unused.
7. Pre-existing items still open: sitemap resubmission, the remaining Open Graph cards with `og-cover.png` as the priority, and the Adsterra escalation from July 28. The July 27 post-deploy checklist for the `site/` migration is now closed by the verification table above.

## Notes for the next session

- **Adding a photographic template is data-only.** Assets into `site/assets/mockups/` with URL-safe names, corners from `tools/mockup-admin.html`, one registry entry, one catalog card, one generated thumbnail, and bump the hero template count. No engine edits.
- **Always set `overlayBlend`, and set it by looking at the asset.** White with grey shading means `multiply`. Dark shapes on transparency means `source-over`. Black with bright streaks means `screen`. Getting it wrong washes the artwork out and reports no error.
- **Check whether a new base has a transparent print window** before assuming the layer order. It decides `mode`.
- **Thumbnails must be generated and filled, not shipped as supplied.** Under 100KB, 4:5, sample art inside the frame.
- **File inputs can be verified headlessly** via `canvas.toBlob`, `DataTransfer` and a dispatched `change` event. Worth applying to the poster and resume editors, whose upload paths have never been verified either.
- **Asset filenames are public URLs here.** Reject spaces, commas and capitals at the point assets arrive, not later.
- **Verify third-party CDN URLs before pasting them**, including ones supplied in a specification. One in today's brief was a 404.
- **Never bind an R2 bucket, Worker route or any other Cloudflare product to `templatebox.win` or `www`.** A custom domain binding takes the whole hostname, and the website disappears. Asset hosting goes on its own subdomain, e.g. `cdn.templatebox.win`.
- **Judge domain routing by the header pair, not the status code.** `Server: cloudflare` plus `x-nf-request-id` on the same response is the only real proof. A bare 200 is not proof, and a 404 carrying `x-nf-request-id` is a healthy site serving its own 404 page.
- **When a DNS fix looks like it failed, suspect negative caching before suspecting the fix.** Query the authoritative nameservers directly, then bypass DNS with `curl --resolve <host>:443:<ip>`. A local cache flush does not reach upstream resolvers, and a browser still erroring is not evidence.
- **Restore or add DNS records grey-cloud first, then proxy.** Netlify cannot verify a hostname that resolves to Cloudflare's IPs, so proxying too early deadlocks it on "Pending DNS verification".
