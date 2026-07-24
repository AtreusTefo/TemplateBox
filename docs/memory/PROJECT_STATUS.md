# TemplateBox — Project Status and Session Handoff

Last updated: July 21, 2026 (business document builder added)

## Purpose of This Document

This is a snapshot of everything built, deployed, and learned during the initial build-out and launch of TemplateBox. Paste this file (or its path) into a new chat session to get instant context without re-deriving decisions already made. For requirements and specification, see `PRD.md` at the repo root — this document covers implementation state and operational knowledge that PRD.md does not.

## What TemplateBox Is

A 100% client-side, serverless template personalization engine at templatebox.win. Four live tools today: a CV/Resume builder, a Business Document builder (rent receipts, cash payment receipts, itemized business receipts, sales and cash receipt forms, invoices, employee warning notices), a Poster/Canvas creator, and a Product Mockup generator for print-on-demand sellers (t-shirt, hoodie, mug, packaging box). Monetized through a mandatory 10-second ad loading page between the catalog and the editor. Full requirements and design system live in `PRD.md` and `CLAUDE.md`.

## Live Infrastructure

| Layer | Provider | Status |
|---|---|---|
| Domain registrar + DNS | Cloudflare (`templatebox.win`) | Live, orange-cloud proxied |
| SSL/TLS | Cloudflare, mode Full (strict) | Active |
| Hosting | Netlify, auto-deploy from `main` | Live |
| Source control | GitHub: `AtreusTefo/TemplateBox` | Live, `main` is production |
| Analytics | Microsoft Clarity, project ID `xix7m2758f` | Installed on all 5 pages, confirmed no console errors |
| Search | Google Search Console, Domain property `templatebox.win` | Verified via DNS TXT; homepage indexed; sitemap submission pending first crawl (see Known Issues) |
| Ads | Adsterra | Popunder, 2x Banner 300x250 (distinct zones), Social Bar — all live, see table below |

DNS record shape in Cloudflare: `templatebox.win` and `www` are both `CNAME` → `templatebox.netlify.app`, proxied (orange cloud). No Netlify DNS zone is used — it was deliberately deleted because Cloudflare Registrar locks nameservers to Cloudflare, so Netlify DNS can never complete verification.

## Adsterra Zone Reference

| Placement | Location | Zone key / script ID |
|---|---|---|
| Popunder | `index.html` `<head>` | `pl30250761` |
| Banner 300x250, slot 1 | `loading.html` `#ad-banner-1` | `4a408738c2170da16b47c5ac05b3780a` |
| Banner 300x250, slot 2 | `loading.html` `#ad-banner-2` | `70d844a3963c8415efa49af391c897a0` (distinct zone, provisioned by Adsterra support on request) |
| Social Bar | `loading.html`, directly before `</body>` | `pl30250765` |
| Banner 300x250 (reused zone 1) | `post.html` in-content break, via `AD_ZONES.inContent` in `js/blog.js` | `4a408738c2170da16b47c5ac05b3780a` |
| Banner 300x250 (reused zone 2) | `post.html` end-of-article, via `AD_ZONES.endOfArticle` | `70d844a3963c8415efa49af391c897a0` |
| Banner 728x90 leaderboard | `blog.html` + `post.html` top, desktop, via `AD_ZONES.leaderboard` | `7577a9abda8083816fafd71754b18205` |
| Banner 320x50 mobile leaderboard | Same hosts, chosen instead of 728x90 under 48rem at load, via `AD_ZONES.leaderboardMobile` | `101fe70128e51351589ecd23ab2d0e21` |
| Banner 160x600 skyscraper | `post.html` sticky rail, viewports over 70rem, via `AD_ZONES.skyscraper` | `aaa51e997d5bd5badf6557a7773f78a6` |

Adult ads are toggled off for this site in the Adsterra dashboard. `index.html` and the editor pages carry zero visible ads by design — only `loading.html` shows ad units; this is a deliberate PRD/CLAUDE.md architecture decision, not an oversight, argued out in-session (SEO/trust risk on the indexed homepage vs. limited upside).

## File Map

```
index.html          Catalog: 15 template cards (3 resume, 6 business docs, 3 poster, 3 mockup), category filter pills, Popunder script, JSON-LD WebApplication schema
loading.html         10s countdown, 2 banner slots (isolated in srcdoc iframes), Social Bar script, navigation watchdog, dependency-free inline countdown/redirect fallback (activates only if js/app.js fails to take over)
resume.html + js/resume.js    CV builder: split-pane editor, accent swatches, localStorage binding, jsPDF native-text PDF export
docs.html + js/docs.js        Business document builder: one form driving six documents (rent/payment receipts, itemized business + sales receipts, invoice, employee warning notice), blank-printable-form mode, automatic totals and amount-in-words, jsPDF native-text export, print stylesheet
poster.html + js/poster.js    Poster creator: HTML5 Canvas, image upload with mime validation, frame styles, PNG export
mockup.html + js/mockup.js    Product mockup generator: flat-vector Canvas product illustrations (t-shirt/hoodie/mug/box), mime-validated design upload, pointer drag + scale placement, in-memory "My Mockups" tray, PNG export
privacy.html          Compliance page
css/style.css         Single global stylesheet (Fabric Film Studio theme: cream/charcoal, Playfair Display + Inter)
js/app.js             Shared: sanitization firewall, localStorage wrappers, catalog filtering, launch/redirect flow, mobile tab switching
netlify.toml          Build config (no build step) + baseline security headers; CSP deliberately omitted (ad domains not finalized enough to allowlist safely)
blog.html             Public blog index: cards from js/blog-data.js, dormant leaderboard ad host, Blog JSON-LD
post.html             Single post renderer (?slug=), in-content + end-of-article 300x250 banners, BlogPosting JSON-LD
admin.html + js/admin.js    Private blog authoring panel (noindex, robots-disallowed): localStorage workspace, exports js/blog-data.js
js/blog.js            Shared blog library: block content model, XSS-safe rendering, AD_ZONES size-aware placement registry
js/blog-data.js       THE blog database: static window.TB_BLOG_POSTS array, generated by admin.html export, deployed as an asset
robots.txt / sitemap.xml    SEO; loading.html excluded from sitemap (already noindex,nofollow); admin.html disallowed
serve.json           Local-testing-only config for `npx serve .`: disables cleanUrls so it matches Netlify's actual (no-redirect) behavior, see LOCAL_SERVE_CLEAN_URL_DROPS_TARGET_QUERY.md
docs/error-fixes/*.md       Debugged issues, see Known Issues Already Solved below
```

## The Monetized Flow (as implemented)

```
index.html card click
  -> js/app.js launchTemplate(): navigation to loading.html?target=resume|poster
     deferred 150ms so it wins any race against the Popunder's same-click fallback redirect
  -> loading.html: 10s countdown, 2 banners + Social Bar render
  -> at 0: navigation watchdog re-issues location.replace(editorUrl) every 700ms
     until the page actually unloads, so ad-initiated navigations can't strand the user
  -> resume.html or poster.html: fully ad-free, localStorage-backed editor
```

`EDITOR_ROUTES` in `js/app.js` is the whitelist mapping `target` query values to editor pages — this is what makes the redirect immune to open-redirect tampering. `loading.html` carries a second, dependency-free copy of this same whitelist inline (see below) — **both must be updated when adding a new editor**, or the fallback path silently sends unrecognized/failed cases to the default editor instead of the new one.

An editor that serves several catalog cards (docs.html serves six) also needs a **variant hand-off**: `initCatalog()` writes the clicked card's `data-doc` value to `localStorage` under `tb_editor_preset`, and `TB.takePreset()` reads and clears it on arrival. The preset is never a route — the editor matches it against its own variant table, so a tampered value can only resolve to something that already ships. Clearing on read is what stops a later direct visit from re-applying a stale card choice over the visitor's saved work.

## Known Issues Already Solved (see docs/error-fixes/ for full write-ups)

- **RESUME_PDF_RASTERIZED_TEXT_FIX.md** — html2pdf.js rasterizes text (fails ATS parsing); replaced with jsPDF native `doc.text()` API. Verified with an automated PDF-stream inspection (real `Tj` text operators, no embedded images) plus a manual browser highlight-copy-paste test.
- **ADSTERRA_AD_CONFLICT_FIX.md** — Popunder's fallback redirect could hijack the foreground tab when popups were blocked (last navigation assignment wins); fixed with the 150ms deferred nav in `launchTemplate()`. Also: two banner tags sharing one page context clobbered each other's global `atOptions`; fixed by isolating each in its own `srcdoc` iframe.
- **LOADING_REDIRECT_STALL_FIX.md** — same "last navigation wins" defect class, but spanning the whole loading.html page lifetime instead of one click; fixed with the persistent navigation watchdog described above.
- **SOCIAL_BAR_NOT_DISPLAYING.md** — not a defect. Full delivery chain verified (script serves, runtime domains resolve and respond). Non-display was per-visitor frequency capping plus the widget's animated entrance losing the race against the page's 10-second lifetime. Confirmed serving via Adsterra dashboard impression counts.
- **LOCAL_SERVE_CLEAN_URL_DROPS_TARGET_QUERY.md** — not an application defect. `npx serve .` (CLAUDE.md's own recommended local test command) 301-redirects `*.html` requests to extensionless clean URLs by default, which drops the `?target=` query string; `loading.html` then falls back to `DEFAULT_TARGET` ("resume") and redirects to the wrong editor once the countdown finishes, which reads like "the countdown isn't working." Netlify has no such redirect, so production was never affected. Fixed by adding `serve.json` (`{"cleanUrls": false}`) at the repo root so local testing matches production. Worth ruling out first if a loading-page flow ever seems to land on the wrong editor again during local testing.

## Operational Knowledge Not Written Down Elsewhere

These cost real time to work out during setup and aren't captured in any other doc — worth reading before touching DNS, Search Console, or Adsterra again.

- **Cloudflare DNS + Netlify domain cutover order matters.** Add the custom domain in Netlify first; if Netlify shows "Netlify DNS propagating" it means it tried to create its own DNS zone — go to the Netlify team's Domains page and delete that DNS zone, then re-add the domain so it shows "Pending DNS verification" instead (external-DNS mode). Only then add the Cloudflare CNAME records.
- **SSL cert sequencing:** keep new DNS records gray-cloud (DNS only) until Netlify's Let's Encrypt certificate shows as issued in Domain management, only then flip to orange-cloud proxied. Proxying before the cert issues can block Netlify's verification. After flipping to proxied, set Cloudflare SSL/TLS to **Full (strict)** — leaving it on "Flexible" causes an infinite redirect loop against Netlify's forced HTTPS.
- **Google Search Console Domain properties want the bare hostname** (`templatebox.win`, no protocol) when creating the property, but want the **full absolute URL** (`https://templatebox.win/sitemap.xml`) when submitting a sitemap — the relative form (`sitemap.xml`) throws "Invalid sitemap address" on a Domain property because the host/protocol is ambiguous.
- **A freshly submitted sitemap shows "Couldn't fetch" instantly**, before Google has attempted any fetch — this is a UI placeholder, not a real failure. Don't chase it via Cloudflare Security Events unless the URL Inspection "Live Test" also fails; if Live Test passes, the sitemap status is cosmetic and will resolve on Google's own schedule (can take 1-2+ days). Forcing a re-check: delete and resubmit, or submit with a cache-busting query string (`sitemap.xml?v=2`) to force a treat-as-new fetch.
- **Cloudflare Security → Events** is the authoritative way to check whether Googlebot (or any specific requester) is being challenged/blocked — filter by path and/or user agent. A `curl` spoofing Googlebot's user-agent from a non-Google IP does NOT reproduce what Cloudflare's bot detection sees, since it checks IP/ASN and reverse DNS, not just the UA header — don't trust that kind of test as conclusive.
- **Adsterra's "Create Ad Unit" dialog only allows one placement per format-and-size per site** — it greys out exact duplicates. A second zone of a size you already have (e.g., a second distinct 300x250 Banner) requires a direct support ticket; be explicit in the ticket that you want a second zone for an *existing* ad slot's separate tracking, not additional ad inventory, or support may push back citing ad-density/CPM concerns. Different Banner sizes are NOT blocked, though: the 728x90, 320x50, and 160x600 blog zones were all created straight from the dashboard on July 18, 2026 with no ticket.
- **Adsterra's "Adult ads" toggle can reset to ON** on ad-unit-creation dialogs even after being turned off elsewhere for the site — recheck it each time before creating a new placement.
- **Ad script page resources always show as "couldn't be loaded" in Google's URL Inspection tool.** This is universal for any ad-monetized site (ad networks block crawler fetches of their own scripts) and is not a problem to fix.

## Design/Architecture Decisions Made During Build (with reasoning, in case revisited)

- **jsPDF primitives over jspdf-autotable.** The invoice/receipt line-item table, checkbox rows and side-by-side party columns in `js/docs.js` are hand-rolled on `doc.text()`, `doc.rect()` and `doc.line()` rather than adding the autotable plugin. Rationale: it keeps the CDN surface identical to the resume builder's single jsPDF include, and CLAUDE.md mandates the native text API specifically. Do not add autotable to "simplify" the table code without weighing that.
- **No ads on index.html or the editor pages, ever.** Argued out explicitly: index.html is the page Google actually indexes (loading.html is noindex,nofollow), so ad clutter there carries real SEO/trust risk that the isolated loading-page model doesn't. Editors stay ad-free per PRD to build return-usage trust.
- **Reused Adsterra banner keys across both slots is fine** functionally; a second zone was obtained purely for separated reporting, not because sharing was broken.
- **CSP is intentionally not in `netlify.toml` yet** — Adsterra's ad domains rotate/vary enough that a hand-written allowlist would likely break ads; revisit once ad domains are observed to be stable.
- **jsPDF over html2pdf.js** is now the mandated PDF engine project-wide (CLAUDE.md and PRD.md both updated) — do not reintroduce html2pdf.js.
- **Loading-page countdown resilience (July 21, 2026).** The countdown text (`10`) is static markup in `loading.html`, so if `js/app.js` ever fails to load or throws before scheduling its timer, the page freezes at 10 forever with no redirect — indistinguishable from "the countdown isn't working," and distinct from the already-solved stall-at-zero defect in LOADING_REDIRECT_STALL_FIX.md (that one starts the timer but loses the redirect race; this one never starts the timer at all). Two changes close the gap: (1) the `DOMContentLoaded` boot handler in `js/app.js` now runs `initCatalog`/`initLoadingPage`/`initEditorTabs` each in its own `try/catch` instead of as unguarded sequential calls, so a throw in one can't block the others; (2) `loading.html` carries a small inline, dependency-free fallback script (after the `js/app.js` include) that waits 1.5s, checks a `window.__tbLoadingActive` flag `initLoadingPage()` sets on success, and if unset runs its own identical countdown/redirect against its own copy of the route whitelist. Verified with Playwright: normal path completes in 10s as before; with `js/app.js` blocked, the fallback completes in ~12s and lands on the correct editor; a 10-case fuzz of the fallback's whitelist (valid/missing/unknown targets plus six hostile payloads: absolute URL, protocol-relative, path traversal, `__proto__`, `constructor`) all resolved to the correct or default editor with nothing escaping to an external host. Full write-up: `docs/implementation/MOCKUP_GENERATOR_IMPLEMENTATION.md`.
- **Mockup generator (July 20, 2026): flat-vector Canvas products, no image assets.** Rather than photographic mockup templates (which would need licensed/hosted product photos), all four products are drawn as flat vector illustrations directly in `js/mockup.js`, matching the site's "no gradients, no drop shadows" theme and keeping the tool's payload at zero images, consistent with the poster editor's approach. The mug handle's arc deliberately oversweeps past 90 degrees on each side so it tucks behind the body edge instead of floating disconnected — worth knowing before adjusting that shape. The "Add to My Mockups" tray is the closest honest stand-in for "add to products in one click" a database-free tool can offer (there is no real product catalog to attach to); it lives in memory only, not localStorage, for the same image-quota reason `poster.js` never persists the uploaded photo. Full write-up: `docs/implementation/MOCKUP_GENERATOR_IMPLEMENTATION.md`.
- **Business document builder (July 21, 2026): one editor, six catalog cards.** Rather than six near-duplicate pages, `docs.html` drives all six documents from one form and one state object; fieldsets carry `data-for` lists of the document keys they belong to and labels are re-worded from a per-type `labels` map, so the same input reads "Received From (Tenant)" on a rent receipt and "Employee Name" on a warning notice. Hidden fields are still collected into state, deliberately, so switching document types never loses typed data. Three layout families (`receipt`, `itemized`, `notice`) each have one preview renderer and one jsPDF writer. Two things worth knowing before touching it: (1) `CURRENCIES` carries two symbols per entry because jsPDF's built-in fonts are WinAnsi-encoded and cannot draw the rupee/naira/cedi glyphs — those use an ASCII prefix in the PDF only, while dollar/euro/pound/yen are inside cp1252 and print as-is; (2) the PDF table, checkbox and two-column-party primitives are hand-rolled on top of `doc.text()`/`doc.rect()`/`doc.line()` rather than pulling in jspdf-autotable, keeping the CDN surface identical to the resume builder's. The "Blank printable form" toggle is what makes the printable-form cards distinct: empty optional fields render as ruled lines instead of being omitted. Full write-up: `docs/implementation/BUSINESS_DOCUMENT_BUILDER_IMPLEMENTATION.md`.
- **Grid children need `min-width: 0` (July 21, 2026).** `.editor-pane` / `.preview-pane` are CSS grid children and so default to `min-width: auto`, meaning they refuse to shrink below their content's minimum width. The invoice line-item table (four columns, irreducible below roughly 272px) therefore pushed its own pane past its grid track and scrolled the entire page sideways at a 320px viewport — a PRD violation that looked like a table bug but was a grid-sizing default. Fixed with `min-width: 0` on both panes plus an `overflow-x: auto` wrapper on the table, the same containment approach already used on `.ad-slot`. Worth checking first if any editor ever overflows horizontally on mobile.
- **Blog (July 18, 2026): serverless admin-panel model.** No database means the blog "publishes" by exporting a static `js/blog-data.js` from `admin.html` (drafts live in that browser's localStorage under `tb_admin_posts`) and deploying it. Post bodies are typed blocks rendered createElement/textContent-only — never HTML strings. Blog pages are a monetized surface (banners only, passive formats); the no-ads rule still holds for index.html and the editors, and Popunder/Social Bar are deliberately kept off blog pages because they are indexable content. Ad placements live in the `AD_ZONES` registry in `js/blog.js`: a placement with an empty key renders nothing (zero layout shift), so 728x90/320x50/160x600 activate by pasting keys once Adsterra provisions the zones. Full write-up: `docs/implementation/BLOG_SYSTEM_IMPLEMENTATION.md`.

## Extending TemplateBox: Adding a New Template/Editor

Pattern demonstrated by resume.html/docs.html/poster.html/mockup.html, to follow for a fifth tool:

1. Add a card to the `.catalog-grid` in `index.html` with a `data-target="yourkey"` button and a `data-category` matching an existing or new filter pill. If the new editor serves several cards, also give each card a `data-doc="variantkey"` and consume it with `TB.takePreset()` (see the docs.html pattern above).
2. Add `yourkey: "yourpage.html"` to `EDITOR_ROUTES` in `js/app.js` **and** to the mirrored inline `ROUTES` table in `loading.html` — this is what keeps the loading-page redirect safe from tampering, on both the normal and the fallback path.
3. Build `yourpage.html` + `js/yourpage.js` following the resume/poster split-pane pattern: `.editor-layout` / `.editor-pane` / `.preview-pane` / `.mobile-tabs` CSS classes are already themed and responsive; `TB.sanitize`, `TB.desanitize`, `TB.storageGet`, `TB.storageSet` from `js/app.js` are the shared utilities to reuse for localStorage binding and XSS-safe rendering.
4. No ad work needed — the new tool automatically routes through the existing monetized `loading.html` flow.
5. Add SEO meta tags + canonical URL following the pattern in resume.html/poster.html, and add the new page to `sitemap.xml`.

## Open Items

- Mobile device pass from the PRD checklist: confirm no input auto-zoom, ad slots stack cleanly under 768px, localStorage restores correctly, all on a real device over mobile data (also gives an unfiltered view of ad rendering).
- Sitemap fetch status in Search Console — expected to self-resolve, not currently blocking anything (homepage is already indexed).
- No formal UI/UX audit has been done yet; discussed once as an option but not started or scoped.
- Browser pass on admin.html and the under-48rem mobile stack of the blog pages (desktop blog.html and post.html verified July 18, 2026 with 300x250 banners filling; leaderboard/skyscraper zones added the same day, first fill not yet observed).
- `docs.html` (added July 21, 2026) was verified headlessly via Playwright the same day: catalog filtering, the card-to-editor variant hand-off, per-type field visibility and relabeling, totals arithmetic, amount-in-words, currency switching (including the zero-decimal JPY path), an XSS probe, reload persistence, PDF export for all six document types (single page, real `Tj` text operators, zero image XObjects, nothing drawn outside page bounds), and zero horizontal overflow at 320px across all three layouts, all with zero console errors. Still open: a real-touchscreen pass and a check of actual browser print-dialog output (the print rules were verified as CSS only, not as a rendered print job).
- `mockup.html` (added July 20, 2026) was verified headlessly via Playwright the same day: all four product illustrations render correctly (including the mug handle attaching cleanly to the body), color swatches, design upload/clip, mouse-drag repositioning, and the tray all work with zero console errors, at desktop viewport size. The full catalog -> loading.html?target=mockup -> countdown -> mockup.html flow was also verified end to end (see LOCAL_SERVE_CLEAN_URL_DROPS_TARGET_QUERY.md for a local-testing-only redirect issue hit and fixed along the way). Still open: a real-touchscreen pass for the pointer-drag interaction, and a narrow-viewport (down to 320px) check of the mobile tab layout and tray grid.
