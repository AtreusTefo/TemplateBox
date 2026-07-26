# TemplateBox Documentation Index

Start here: `docs/memory/PROJECT_STATUS.md` for current build/deploy state and operational knowledge — paste it into a new chat session for full context with no re-discovery needed. Requirements live in `PRD.md` at the repo root.

## docs/memory/
- `PROJECT_STATUS.md` — current state, live infrastructure, Adsterra zone reference, solved issues, operational gotchas, and the pattern for adding a new template/editor. Kept up to date as the single source of truth for AI session handoff.

## docs/architecture/
- `ARCHITECURE.md` — folder structure and system layout reference

## docs/project/
- `AGILE_HIERACHY.md` — Scrum hierarchy and technology stack reference
- `UI_UX_AUDIT.md` — formal interface audit against the supplied reference sites: catalog preview fidelity, hero and trust-signal hierarchy, loading-interstitial honesty and perceived duration, editor first-run and persistence feedback, stylesheet token layer. Findings carry status and double as a tracker
- `SEO_AUDIT.md` — formal search-visibility audit: orphaned editor pages, one URL competing for six intents, JavaScript-only blog metadata, structured-data coverage, sitemap and robots defects, render-blocking third-party resources, plus the target query clusters for the content programme

## docs/implementation/
- `BLOG_SYSTEM_IMPLEMENTATION.md` — serverless blog: admin panel authoring workflow, block content model, size-aware Adsterra placement registry, export/publish flow
- `MOCKUP_GENERATOR_IMPLEMENTATION.md` — print-on-demand mockup generator: canvas-rendered product templates, color swatches, design upload/reposition, PNG export
- `BUSINESS_DOCUMENT_BUILDER_IMPLEMENTATION.md` — receipts, invoices and employee warning notices: one form driving six documents, blank printable form mode, automatic totals and amount-in-words, hand-rolled jsPDF table/checkbox primitives, catalog variant hand-off

## docs/error-fixes/
- `RESUME_PDF_RASTERIZED_TEXT_FIX.md` — html2pdf.js rasterized PDF text; replaced with jsPDF native text API
- `ADSTERRA_AD_CONFLICT_FIX.md` — Popunder foreground hijack and duplicate banner tag interference
- `LOADING_REDIRECT_STALL_FIX.md` — loading page countdown stalling at zero without redirecting
- `SOCIAL_BAR_NOT_DISPLAYING.md` — diagnosis confirming correct integration; non-display caused by frequency capping and page lifetime, not a defect
- `LOCAL_SERVE_CLEAN_URL_DROPS_TARGET_QUERY.md` — `npx serve .`'s default clean-URL redirect drops the loading page's `?target=` query, sending every editor launch to the fallback default during local testing only; fixed via `serve.json`

## Maintenance notes not covered by a dedicated document
- Publishing a blog post is now a three-file operation: export `js/blog-data.js` from `admin.html`, export the post pages into `blog/`, and add the new URL to `sitemap.xml`. See `docs/implementation/BLOG_SYSTEM_IMPLEMENTATION.md` and the July 26 entry in `PROJECT_STATUS.md`.
- The catalog CTAs must stay as anchors, not buttons. Converting them back removes the only crawlable internal links to the editor pages. See `SEO_AUDIT.md` finding 2.1.

## docs/guides/
(none yet)

## docs/daily-reports/
(none yet)
