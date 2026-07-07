# AGENTS.md - TemplateBox Master Instructions

## Project Context
- **Name:** TemplateBox (templatebox.win)
- **Target-Stack:** Vanilla JAMstack (HTML5, CSS3, ES6+ JavaScript)
- **Primary IDEs:** VS Code 2026, Claude Code.
- **Main Goal:** A serverless, 100% database-free template engine that monetizes free user customization traffic through a mandatory 10-second intermediary ad loading loop (Adsterra Pop-Under, Banners, and In-Page Push) before rendering client-side editors.

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
- **Documentation:** `docs/` (Refer to `DOCUMENTATION_INDEX.md`).

## Environment Commands
- **Local Testing:** Run a lightweight static server locally (e.g., VS Code Live Server or `npx serve .`).
- **Production Build:** None. The workspace files must remain flat, static text assets optimized for direct drag-and-drop ingestion into Netlify.

## Data Integrity, Referential Integrity & Consistency Standards
- **Form Limits:** Enforce strict HTML5 validation attributes (`maxlength`, `required`, type constraints) on all input parameters to prevent UI layout breaks or local device browser crashes.
- **Image Restrictions:** For file upload modules, use client-side JavaScript to explicitly parse the `file.type` property. Terminate execution immediately if the mime-type fails to match an `image.*` designation.

### Testing Requirements
- **Ad Script Separation:** Verify that triggering a download action initiates the background window hook (Adsterra Pop-Under) while successfully routing the primary active foreground view to the 10-second timer page.
- **Responsive Fluidity:** Test layouts down to a minimum screen width of `320px` to verify that text containers wrap cleanly and that the dual 300x250 ad container collapses into a balanced vertical stack on mobile viewports.

## Critical Rules
- **Rule 1:** Maintain zero-server runtime metrics. Every computation must happen on the client machine to protect our $0/month infrastructure setup.
- **Rule 2:** Adhere to Google Search Central guidelines. Ensure optimized metadata, strict `<h1>` single-instance markup hierarchies, and valid JSON-LD `WebApplication` structured schema stay inside the `<head>` of the entry document.