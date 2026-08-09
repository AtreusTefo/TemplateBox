# AGENTS.md - TemplateBox Master Instructions

## Project Context
- **Name:** TemplateBox (templatebox.win)
- **Target-Stack:** Vanilla JAMstack (HTML5, CSS3, ES6+ JavaScript)
- **Primary IDEs:** VS Code 2026, Claude Code.
- **Main Goal:** A serverless, 100% database-free template engine that monetizes free user customization traffic through a mandatory 10-second intermediary ad loading page (Adsterra Banners plus Social Bar) before rendering client-side editors, plus passive banners on the editors and on indexable content pages.
- **No Pop-Under, as of August 6, 2026.** It was removed because it redirected visitors to third-party sites on ordinary clicks. The ~150-line click shield and overlay neutralizer in `site/index.html` that existed solely to contain it went with it, as did the deferred-navigation/watchdog machinery in `launchTemplate()`. Do not reintroduce a Pop-Under, In-Page Push, or any other format that can navigate the visitor's tab without an explicit click on an ad — on any page. The passive homepage banner added later the same day (next line) is a different category and does not reopen this.
- **Ad policy (revised August 9, 2026):** `index.html` carries passive banners: a sticky rail beside the catalogue at 75rem and above, a 320x50 anchor below 48rem, and nothing between. **The rail is the editor rail, not a copy of it.** One shared CSS rule, `.editor-rail, .home-rail { ... }`, so the two cannot drift apart; same `[data-ad-rail-slot]` markup, same three 300x250 zones, same `max-height: calc(100vh - 7rem)` cap and internal scroll. Both of the editors' bands are kept: the three-slot 300x250 stack at 93rem and above, a single 160x600 below that. Only the floor differs -- 75rem rather than 84rem, because below 84rem an editor's rail comes out of its fixed panes while the feed's masonry columns simply reflow. **Do not collapse the two bands into one.** Dropping the 160x600 was tried and reverted: three columns of 257px at 1200px are perfectly readable, but a 300px unit on a 1366px laptop is as wide as a content column, so the rail stops reading as a rail and becomes a fourth column of adverts. Width that is affordable is not the same as width that looks right. The homepage's `display: none` gate must stay declared **after** the shared rule; media queries carry no specificity, so written before it, it would simply lose to the shared `display: flex`.

## AI Behavior Guidelines
- **No Emojis:** Do NOT use emojis in any documentation, comments, or commit messages. Keep text professional and plain-text based.
- **For Claude:** Focus on clean architecture, strict type safety.
- **For Gemini/GPT:** Be extremely concise. Avoid conversational filler.
- **General:** If logic is ambiguous, explicitly state the ambiguity and request clarification from the user in a concise format. Reference ARCHITECTURE.md before suggesting structural changes.

## Error Resolution Procedure
### When an Error Occurs or Needs Fixing:
1. **Check Existing Documentation FIRST**
   - Search `docs/error-fixes/` for the error message, error code, or related keywords
   - Check `docs/daily-reports/` for recent issues and resolutions
   - Check `docs/implementation/` for known issues and completed fixes
   - Use grep/semantic search to find if this error has been documented before

2. **Identify If Already Documented**
   - If error documentation exists, review the root cause and solution
   - If a fix was already applied, verify it was implemented correctly
   - If multiple solutions exist, choose the most recent or recommended one

3. **Apply Documented Solution**
   - Follow the exact steps outlined in the existing error documentation
   - Reference the documented fix in your response to the user
   - Link to the existing error documentation file

4. **If Error Not Documented**
   - Proceed with analysis and implementation
   - Create comprehensive error documentation in `docs/error-fixes/` 
   - Include root cause, solution, testing steps, and troubleshooting guide
   - Reference this file for future occurrences

5. **If Documented Solution Doesn't Work**
   - Test the documented solution thoroughly to verify it truly doesn't resolve the issue
   - Analyze why the documented fix failed (environment differences, code changes, etc.)
   - Implement a new solution using root cause analysis
   - Update the original error documentation file with:
     - **New Section:** "Why Previous Solution Failed" - Explain the reason
     - **Revised Solution:** Replace old fix with new, tested fix
     - **Updated Testing Steps:** Reflect the new solution validation
     - **Version Note:** Add timestamp "Updated: [DATE]" at top of document
     - **Related Issues:** Link any new error files if multiple fixes discovered
   - Document both solutions if both are valid for different scenarios
   - Alert the user that documentation has been revised

### Error Documentation Template
When creating new error fix documentation:
- **Issue Title:** Clear, searchable error description
- **Root Cause:** Technical explanation of why error occurred
- **Fix Applied:** Exact changes made (file paths, line numbers, code)
- **Testing Steps:** How to verify the fix works
- **Troubleshooting:** Additional diagnostics if error persists
- **Related Files:** All files affected by the fix

## Documentation Standards
- **Style:** Professional, technical, and objective. 
- **Format:** Use standard Markdown (headings, tables, lists).
- **Prohibition:** Strictly zero emojis allowed in `.md` files.
- **Organization:** All documentation files MUST be created in their rightful folders under `docs/`:
  - `docs/architecture/` - System design, data flow, architectural patterns
  - `docs/implementation/` - Implementation guides, code summaries, completion reports
  - `docs/project/` - Project requirements, planning, deliverables, scope documentation
  - `docs/guides/` - Quick start guides, testing guides, how-to documentation
  - `docs/error-fixes/` - Bug fixes, error resolutions, issue tracking
  - `docs/daily-reports/` - Daily progress reports and status updates
- **Never** leave documentation files in the `docs/` root directory.

## Coding Standards & Patterns
- **Architecture:** 100% Client-Side execution. Server-side code (PHP, Node, Python) is strictly forbidden.
- **Security:** Never use `innerHTML` to push user data to the DOM. Use `textContent` or `innerText` to prevent DOM-based XSS attacks.
- **Data sanitization:** All text parameters must be scrubbed using a custom regex function before being written to localStorage or the preview panels.
- **State Management:** Bind form fields directly to browser `localStorage` in real-time for seamless data persistence.
- **Compilation Engines:** Use the `jsPDF` native text API (`doc.text()`) via clean CDN links for selectable vector text PDF exports. Do not use `html2pdf.js`: it rasterizes text through html2canvas and breaks ATS parsing (see `docs/error-fixes/RESUME_PDF_RASTERIZED_TEXT_FIX.md`). Use the native HTML5 Canvas API for graphic/poster compilation and `.png` exports via local data streams.

## Project Structure Reference
The repository has exactly two top levels: what ships, and what does not.
- **`site/`** is the deployable site and the Netlify publish directory, so it is also the web root: `site/index.html` is served at `/index.html`. Pages sit flat at `site/`, with `css/`, `js/`, `assets/`, `blog/` and `tools/` beneath it, plus `robots.txt`, `sitemap.xml` and `404.html`. Anything a visitor must be able to fetch belongs here, and nothing else does.
- **Everything outside `site/`** is never uploaded: `docs/`, `PRD.md`, this file and its copies, `README.md`, `netlify.toml`, `serve.json`, `.vscode/`. Never put project notes, specifications or working files inside `site/` — the publish directory is served verbatim, so a file placed there is a public URL (see `docs/error-fixes/INTERNAL_FILES_PUBLICLY_SERVED.md`).
- **Documentation:** `docs/` (Refer to `DOCUMENTATION_INDEX.md`).
- Paths in documentation written before July 27, 2026 omit the `site/` prefix: read `js/app.js` as `site/js/app.js`.

## Environment Commands
- **Local Testing:** Run `npx serve` from the repository root. `serve.json` there points the server at `site/` via its `public` field, restores `/` to `index.html` with a rewrite, and disables clean-URL rewriting so query strings survive; local URLs then match production exactly. Do NOT run it from inside `site/` (the config is invisible there and `loading.html?target=` breaks), and do not remove `cleanUrls: false` to fix a root URL problem -- see `docs/error-fixes/LOCAL_INDEX_PAGE_BLANK_DIRECTORY_LISTING_INSTEAD_OF_HOMEPAGE.md`. VS Code Live Server is configured through `.vscode/settings.json`, which roots it at `/site`.
- **Production Build:** None. `netlify.toml` sets `publish = "site"` with an empty build command: static text assets, no compilation step. Drag-and-drop deploys use the `site` folder rather than the repository root.

## Data Integrity, Referential Integrity & Consistency Standards
- **Form Limits:** Enforce strict HTML5 validation attributes (`maxlength`, `required`, type constraints) on all input parameters to prevent UI layout breaks or local device browser crashes.
- **Image Restrictions:** For file upload modules, use client-side JavaScript to explicitly parse the `file.type` property. Terminate execution immediately if the mime-type fails to match an `image.*` designation.

### Testing Requirements
- **Launch Flow Integrity:** Verify that clicking a catalog CTA routes the foreground tab to `loading.html?target=...`, and that a ctrl/cmd/middle-click opens that same interstitial in a NEW tab rather than following the anchor's href straight to the editor. The href points at the editor deliberately, so crawlers see a real link; the handler is what keeps human clicks inside the monetized flow.
- **Editor Ad Containment:** On every editor, verify that the banner never overlaps the sticky export bar (the anchor reserves body padding and lifts it), that the correct band mounts at every width (three-slot rail at 93rem and above, single rail 84-93rem, leaderboard 48-84rem, anchor below 48rem, never two bands at once and never none), that each rail slot uses a distinct zone key, that neither appears in print output, and that a dormant or blocked zone leaves the workspace layout byte-identical to having no placement at all.
- **Responsive Fluidity:** Test layouts down to a minimum screen width of `320px` to verify that text containers wrap cleanly and that the dual 300x250 ad container collapses into a balanced vertical stack on mobile viewports.

## Critical Rules
- **Rule 1:** Maintain zero-server runtime metrics. Every computation must happen on the client machine to protect our $0/month infrastructure setup.
- **Rule 2:** Adhere to Google Search Central guidelines. Ensure optimized metadata, strict `<h1>` single-instance markup hierarchies, and valid JSON-LD `WebApplication` structured schema stay inside the `<head>` of the entry document.