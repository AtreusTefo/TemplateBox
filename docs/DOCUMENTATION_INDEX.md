# TemplateBox Documentation Index

Start here: `docs/memory/PROJECT_STATUS.md` for current build/deploy state and operational knowledge — paste it into a new chat session for full context with no re-discovery needed. Requirements live in `PRD.md` at the repo root.

## docs/memory/
- `PROJECT_STATUS.md` — current state, live infrastructure, Adsterra zone reference, solved issues, operational gotchas, and the pattern for adding a new template/editor. Kept up to date as the single source of truth for AI session handoff.

## docs/architecture/
- `ARCHITECURE.md` — folder structure and system layout reference

## docs/project/
- `AGILE_HIERACHY.md` — Scrum hierarchy and technology stack reference

## docs/implementation/
- `BLOG_SYSTEM_IMPLEMENTATION.md` — serverless blog: admin panel authoring workflow, block content model, size-aware Adsterra placement registry, export/publish flow
- `MOCKUP_GENERATOR_IMPLEMENTATION.md` — print-on-demand mockup generator: canvas-rendered product templates, color swatches, design upload/reposition, PNG export

## docs/error-fixes/
- `RESUME_PDF_RASTERIZED_TEXT_FIX.md` — html2pdf.js rasterized PDF text; replaced with jsPDF native text API
- `ADSTERRA_AD_CONFLICT_FIX.md` — Popunder foreground hijack and duplicate banner tag interference
- `LOADING_REDIRECT_STALL_FIX.md` — loading page countdown stalling at zero without redirecting
- `SOCIAL_BAR_NOT_DISPLAYING.md` — diagnosis confirming correct integration; non-display caused by frequency capping and page lifetime, not a defect
- `LOCAL_SERVE_CLEAN_URL_DROPS_TARGET_QUERY.md` — `npx serve .`'s default clean-URL redirect drops the loading page's `?target=` query, sending every editor launch to the fallback default during local testing only; fixed via `serve.json`

## docs/guides/
(none yet)

## docs/daily-reports/
(none yet)
