# Internal Documentation and Instruction Files Served Publicly at templatebox.win

Date: July 27, 2026
Updated: July 27, 2026 — the 404-rule fix below was superseded the same day by moving the deployable site into `site/`. Read the Revised Solution section first; the original fix is kept because it documents the constraint that made it necessary and is still the right answer for any file that must live inside the publish directory.
Status: Fixed structurally (publish directory no longer contains internal files)

## Issue Title

Every internal project file was reachable over HTTP on the production site and crawlable by search engines. `https://templatebox.win/docs/memory/PROJECT_STATUS.md` returned the full operational handoff document, including the Adsterra zone key table, the Microsoft Clarity project ID, the GitHub repository path, and the DNS/Search Console setup notes. `PRD.md`, `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `README.md`, the whole `docs/` tree, and `.github/copilot-instructions.md` were all served the same way.

Found during a file-structure review, not reported as a failure. Nothing was broken; the files simply answered 200.

## Root Cause

Two project properties combine into this:

1. `netlify.toml` sets `publish = "."` with an empty build command. The publish directory is the web root, so every file in the workspace is uploaded and served, not only the pages.
2. There is no build step to strip non-page files (deliberate, per CLAUDE.md: "Production Build: None"), and `robots.txt` is `User-agent: * / Allow: /`, so nothing excluded them from crawling either.

The existing `X-Robots-Tag` header rules in `netlify.toml` cover only `/admin.html`, `/loading.html` and `/tools/*`. Markdown documentation was never considered as deployed content.

The obvious structural fix — move the deployable files into a `site/` folder and set `publish = "site"`, leaving documentation outside the publish directory — was evaluated and rejected for now: CLAUDE.md mandates that "the workspace files must remain flat," the workspace is not under local version control (no `.git`), and a 26-file move would have to be undone by hand if the URL shape or drag-and-drop deploy habit turned out to matter. It remains the cleaner option if the flatness requirement is ever relaxed; it changes no public URL, because the publish directory becomes the web root.

## Fix Applied

Added redirect rules to `netlify.toml` returning a real 404 for the internal paths:

```toml
[[redirects]]
  from = "/docs/*"
  to = "/404.html"
  status = 404
  force = true
```

Covered paths: `/docs`, `/docs/*`, `/.github/*`, `/CLAUDE.md`, `/AGENTS.md`, `/GEMINI.md`, `/PRD.md`, `/README.md`, `/netlify.toml`, `/serve.json`.

Three details matter:

- **404, not `X-Robots-Tag: noindex`.** The goal here is that the content is not served at all. A noindex header keeps a file out of the index while still handing its contents to anyone who requests the URL, which is the wrong trade for internal notes. This is the opposite of the `admin.html` decision, where the page must stay fetchable for its own noindex to be readable.
- **`force = true` is required.** Without it a Netlify redirect only fires when no file exists at the path, and these files do exist.
- **Individual rules for the root Markdown files.** A Netlify splat matches a whole trailing path segment, so there is no `/*.md` form. Five files, five rules.
- Blocking `/netlify.toml` over HTTP has no effect on deploys: Netlify reads that file from the repository at deploy time, not over the public URL.

`to = "/404.html"` names a file that does not exist yet, so Netlify serves its own default not-found page. Creating a branded `404.html` is a small open improvement, not a requirement for this fix.

## Revised Solution (July 27, 2026)

The `site/` publish-directory move was carried out on request, which makes ten of the eleven redirect rules unnecessary. `netlify.toml` now sets `publish = "site"`; documentation, specifications and instruction files sit outside that directory and are therefore never uploaded. That is a structural guarantee rather than a list of paths somebody has to remember to extend, which is the reason to prefer it: the failure mode of the 404-rule approach was a new note dropped into the repository root and silently published.

Why it was not the first fix, and why that changed:

- CLAUDE.md mandated that "the workspace files must remain flat," and there was no local git history to undo a 26-file move against. Both objections were the user's to overrule, and were overruled explicitly.
- The move changes no public URL. The publish directory becomes the web root, so `/rent-receipt-template.html` is unchanged; no canonical, sitemap entry, `og:url` or inbound link needed editing. This is the property that makes the move cheap.

What the move changed beyond file locations:

- `netlify.toml`: `publish = "site"`, and the `/docs`, `/docs/*`, `/.github/*`, five `.md` and `/netlify.toml` rules deleted rather than left as dead config.
- One rule was kept at first for `/serve.json`, on the assumption that the file had to ship inside `site/` for the local server to read it. That turned out to be avoidable: `serve.json` moved to the repository root with a `public: "site"` field, so the publish directory now contains only deployables and `netlify.toml` carries no internal-file 404 rules at all. See `LOCAL_INDEX_PAGE_BLANK_DIRECTORY_LISTING_INSTEAD_OF_HOMEPAGE.md`.
- Local testing is now `npx serve` from the repository root, which `serve.json` redirects to `site/`.
- CLAUDE.md, AGENTS.md, GEMINI.md, `.github/copilot-instructions.md` (four byte-identical copies), README.md and `docs/architecture/ARCHITECURE.md` were updated: the flatness mandate is now scoped to pages within `site/`, and the structure reference states that nothing but deployables may go in the publish directory.

Deleting the redirect rules means the earlier fix cannot be verified any more; verify the structural fix instead, per the Testing Steps below.

## Testing Steps

For the current (structural) fix, after deploying:

1. `curl -sI https://templatebox.win/docs/memory/PROJECT_STATUS.md` and the same for `/PRD.md`, `/CLAUDE.md`, `/.github/copilot-instructions.md`, `/netlify.toml` — all must 404, now because the files are not in the deploy at all.
2. `curl -sI https://templatebox.win/serve.json` — must 404, now because the file is outside the publish directory rather than through a rule.
3. Confirm nothing legitimate regressed: `/`, `/404.html`, `/robots.txt`, `/sitemap.xml`, `/css/style.css`, `/js/app.js`, `/blog.html`, `/blog/<slug>.html` and one landing page must all return 200.
4. Check the Netlify deploy log's file count against `find site -type f | wc -l`. A larger number means something outside `site/` is being uploaded, which would mean the publish directory setting did not take effect.

The original rule-based fix was verified only as far as `python -c "import tomllib; tomllib.load(open('netlify.toml','rb'))"` (the file parsed: 11 redirect rules, 4 header blocks). Its live-host steps are recorded below for reference:

1. `python -c "import tomllib; tomllib.load(open('netlify.toml','rb'))"` — confirms the file still parses (11 redirect rules, 4 header blocks after this change).
2. Deploy, then check status codes against the live host:
   ```
   curl -sI https://templatebox.win/docs/memory/PROJECT_STATUS.md   # expect 404
   curl -sI https://templatebox.win/PRD.md                          # expect 404
   curl -sI https://templatebox.win/CLAUDE.md                       # expect 404
   curl -sI https://templatebox.win/.github/copilot-instructions.md # expect 404
   ```
3. Confirm nothing legitimate regressed: `/`, `/robots.txt`, `/sitemap.xml`, `/css/style.css`, `/js/app.js`, `/blog.html` and one landing page must all still return 200.
4. In Search Console, run URL Inspection on one blocked path. If any of these URLs were already indexed, the 404 removes them on the next crawl.

## Troubleshooting

- If a blocked path still returns its contents, `force = true` is missing or the rule ordering put an earlier matching rule first — Netlify applies the first matching redirect, so keep these rules ahead of any future catch-all.
- If a legitimate asset starts 404ing, look for an over-broad splat. `/docs/*` and `docs.html` are different URLs and do not collide, but the similar names make this an easy mistake to make when editing these rules.
- Local `npx serve .` does not read `netlify.toml`, so documentation stays readable locally. That is intended, and it means local testing cannot verify this fix — only a deployed check can.

## Related Files

- `netlify.toml` — redirect rules added
- `robots.txt` — unchanged; a `Disallow` would not have prevented the files being served, only crawled
- `docs/memory/PROJECT_STATUS.md` — the most sensitive of the exposed files; contents should be treated as having been public until this deploys
- `admin.html`, `tools/og-image.html` — still publicly fetchable by design, excluded from indexing by header only
