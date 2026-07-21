## Product Requirements Document (PRD)## 📑 Document Control

* Project Name: TemplateBox (templatebox.win)
* Target Stack: Vanilla JAMstack (HTML5, CSS3, ES6+ JavaScript)
* Hosting Target: Netlify (Static Hosting)
* Security & CDN: [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/) + Cloudflare DNS Proxy (Orange Cloud)
* Monetization Engine: Adsterra (Pop-Under, Banners, In-Page Push)
* Analytics Engine: [Microsoft Clarity](https://clarity.microsoft.com/) (Session Recording & Heatmaps) + Google Search Console
* Version: 1.4
* Date: July 21, 2026
* Changelog: v1.4 adds the Mockup Generator (section 5.3, App C) and the Serverless Blog (section 5.4) as shipped features beyond the original two-editor scope. v1.3 ad plan named an In-Page Push placement; the shipped implementation uses an Adsterra Social Bar in that role instead (see `docs/error-fixes/SOCIAL_BAR_NOT_DISPLAYING.md`).

------------------------------
## 1. Executive Summary & Objective## 1.1 What We Are Building
templatebox.win is a highly responsive, 100% database-free, serverless interactive web application. The platform allows everyday users to personalize text-based and visual assets (initially launching with a CV/Resume builder and a Custom Canvas/Poster creator) natively inside their web browser.
## 1.2 Who It Is For

* Job seekers needing high-end, ATS-friendly resumes without paying subscription walls.
* Digital creators, students, and small business owners looking for quick, aesthetic design customizations.
* A massive segment of mobile-first users looking for seamless utility tools.

## 1.3 Why It Matters (The Business Goal)
Traditional download blogs suffer from high user bounce rates, heavy browser ad-blocking, and strict search engine penalties when trying to run aggressive ad configurations. This platform solves those issues by transforming static downloads into an interactive utility tool.
By wrapping the application loading state inside a strategic 10-second monetization window, the platform secures a high-value "Double-Payout" from Adsterra (Pop-Under + Banners + In-Page Push) safely without breaking Google Search Central or browser security protocols.
------------------------------
## 2. Global Visual Aesthetic (Inspired by Fabric Film Studio)
The entire application must adopt a premium, high-end, minimalist e-commerce design system to build immediate user trust and reduce bounce rates.

* Color Palette: Soft off-white/cream background (#F4F3EF), dark charcoal text (#1A1A1A), pure white asset cards (#FFFFFF), and clean light-gray utility borders (#EAE8E3). [4] 
* Typography: Elegant, bold Serif fonts (e.g., Playfair Display or Lora via Google Fonts) for editorial headlines, paired with modern, hyper-clean Sans-Serif fonts (e.g., Inter) for forms, controls, and UI buttons.
* Component Geometry: Flat, sharp, rectangular shapes with generous whitespace padding. Avoid bubbly gradients, drop shadows, or cartoonish curves.

------------------------------
## 3. Technical SEO & Google Search Optimization
To ensure templatebox.win ranks at the top of Google Search and passes all core algorithm filters, the codebase must adhere strictly to these technical SEO parameters:

* Semantic HTML & Header Hierarchy: Use strict semantic HTML5 tags (<header>, <main>, <section>, <footer>). Ensure every page has exactly one <h1> tag containing high-intent keywords (e.g., "Free Interactive Resume & CV Builder"). Subheadings must follow a logical <h2> and <h3> nested order. [5] 
* Meta Tags & Open Graph: Include fully optimized <title> tags (under 60 characters) and <meta name="description"> tags (under 160 characters) rich with target keywords. Provide full Open Graph (og:title, og:description, og:image) tags for social media sharing optimization. [6] 
* Structured Data (JSON-LD Schema): Embed a squeaky-clean, standard-compliant WebApplication JSON-LD schema inside the <head> of index.html. It must accurately declare the software category (BusinessApplication), operating systems (All), and a free $0.00 pricing tier to align with Google Search Central guidelines. [7, 8] 
* Mobile-First Indexing Performance: All fonts must use scalable units (rem), and touch-targets must be a minimum of 44px x 44px for mobile thumb accessibility. Image placeholders must include explicit width and height aspect ratios to prevent Cumulative Layout Shifts (CLS).
* SEO-Friendly Navigation: Category filters must use standard text anchor tags to ensure search crawlers can index the site layout seamlessly.

------------------------------
## 4. Core User Experience & System Flow
The app operates on a strict single-direction visual path to isolate monetization hooks from browser security blocks: [9] 

[Step 1: index.html] ──> User clicks "Personalize Template"
                                │
                                ▼
[Step 2: loading.html] ─> Foreground: 10s Timer + Dual Banners + In-Page Push
                          Background: Fires Adsterra Pop-Under
                                │
                                ▼
[Step 3: Editor Views] ─> User edits document locally via localStorage
                                │
                                ▼
[Step 4: Local Export] ─> User clicks "Download" (Clean direct delivery, NO ads)

------------------------------
## 5. Functional Requirements & Page Specifications## 5.1 Page 1: The Catalog Home (index.html)

* Description: The user landing page displaying the available tool categories. [10] 
* UI Components:
* A clean, modern grid interface featuring visual mockup cards for tools.
   * Filter System: Include a top row of minimalist category filter pills (All, Resumes, Graphic Canvas). Use lightweight client-side JavaScript to toggle visibility smoothly via data-attributes (no heavy backend search engine).
   * Each card features a prominent, touch-friendly CTA button labeled "Personalize Template" or "Remix Template".
* Technical / Ad Logic:
* The CTA button uses JavaScript event handling to cleanly redirect the foreground window to loading.html.
   * CRITICAL Pop-Under Action: The instant a user clicks a card's CTA button, an Adsterra Pop-Under ad script must fire, opening an ad secretly in a hidden background browser tab while simultaneously pushing the active foreground tab to the loading page. [11] 

## 5.2 Page 2: The Monetized Intermediary Page (loading.html)

* Description: A strategic wait screen designed to maximize ad impressions under the UX guise of loading editing assets.
* UI Components:
* A clean, centered card displaying a loading spinner or dynamic text: "Loading editing canvas, typography fonts, and assets..."
   * A highly visible, large text countdown timer ticking smoothly from 10 down to 0. [12] 
* Ad Layout Constraints (The Double-Payout Geometry):
* Must contain a dedicated layout block optimized to load two 300x250 Adsterra Banner Ads right near the timer.
   * Must feature a script placeholder tag for an Adsterra In-Page Push ad to slide an animated notification alert onto the page around second 7.
   * Responsiveness: This entire block must dynamically collapse into a single vertical stack on mobile device widths without stretching the viewport or creating horizontal scrolling bugs.
* Technical Logic:
* Uses a client-side JavaScript setInterval countdown clock.
   * Once the timer strikes 0, the browser must execute an automated redirection (window.location.href) to launch the selected interactive web editor.
   * Resilience requirement: the countdown and redirect must complete even if the primary shared script fails to load or throws (extension interference, ad-blocker collateral damage, cache corruption). loading.html implements this via a dependency-free inline fallback that runs its own identical countdown only if the primary script does not signal it took over; see `docs/error-fixes/LOADING_REDIRECT_STALL_FIX.md` and `docs/implementation/MOCKUP_GENERATOR_IMPLEMENTATION.md`.

## 5.3 Page 3: The Interactive Web App Editors
Once the user clears the loading screen, they enter an isolated, clean workspace. To build user loyalty and word-of-mouth virality, the final file export must be entirely ad-free.
## App A: The Interactive CV/Resume Builder

* UI Layout:
* Desktop: A clean 50/50 split-screen. Left side holds the input forms; Right side displays a live vector layout document preview.
   * Mobile/Tablet: Automatically collapses into a single-column stacked view, or introduces clean top-tab navigation switching between "Edit Form" and "View Live Preview". [13] 
* Customization Engine:
* Form fields must include semantic inputs: Full Name, Contact Details, Professional Summary, Work Experience (repeating fields), and Education. Max lengths must be strictly capped (maxlength="50" for names, maxlength="100" for emails) via HTML5 validation.
   * A color picker palette at the top. Clicking a color swatch must instantly change the template design accent highlights in the preview window using native CSS Custom Properties (Variables). [14, 15] 
* The Compilation Engine:
* Must integrate the client-side jsPDF native text API via CDN. (Revised from html2pdf.js, which rasterizes text through html2canvas and cannot satisfy the vector text quality gate below; see docs/error-fixes/RESUME_PDF_RASTERIZED_TEXT_FIX.md.)
   * CRITICAL Quality Gate: The exported PDF must render as native vector text, 100% copyable, highlightable, and selectable. Flattened image-to-PDF screenshots are strictly forbidden due to Applicant Tracking System (ATS) corporate compliance.

## App B: The Poster & Canvas Frame Personalizer

* UI Layout: A clean container wrapping a responsive HTML5 <canvas> element surrounded by editing controls.
* Customization Engine:
* An image upload node allowing the user to pick a photo from their local storage or camera roll.
   * A text input field to overlay a custom stylized quote or caption.
   * A dynamic frame picker allowing the user to select custom borders (e.g., Solid Black, Matte Wood, Polished Gold).
* The Compilation Engine:
* Uses native JavaScript HTML5 Canvas drawing protocols to compile the uploaded image, border vectors, and custom typography layers.
   * The canvas container must dynamically scale responsively to fit mobile device aspect ratios without cropping the text controls.
   * Provides an instant local download link via a native client-side canvas.toDataURL() stream, outputting a high-resolution .png file directly to the device's downloads path.

## App C: The Print-on-Demand Mockup Generator

* Description: Lets print-on-demand sellers preview a design on real product templates without a photoshoot — upload a design, pick a product, see it applied instantly.
* UI Layout: A clean container wrapping a responsive HTML5 <canvas> element surrounded by editing controls, following the same split-pane pattern as the CV/Resume and Poster editors.
* Customization Engine:
* A product template picker covering t-shirts, hoodies, mugs, and packaging.
   * A design upload node validated client-side against an image.* mime-type, matching the Poster app's file validation rule.
   * Color swatches to change the product base color.
   * Drag-to-reposition placement of the uploaded design directly on the canvas preview, with edits reflected live.
* The Compilation Engine:
* Uses native JavaScript HTML5 Canvas drawing protocols to compile the product template, uploaded design layer, and selected color into a single flattened image.
   * Provides an instant local download link via canvas.toDataURL(), outputting a high-resolution .png file.
* Full implementation notes: `docs/implementation/MOCKUP_GENERATOR_IMPLEMENTATION.md`.

## 5.4 Page 4: The Serverless Blog (blog.html, post.html, admin.html)

* Description: A content-marketing and SEO surface, kept separate from the ad-monetized loading flow. Blog pages are indexable and must never carry the Popunder or Social Bar; only passive Banner placements are permitted there.
* Authoring Model: Since the platform has zero database and zero server, `admin.html` is a private (noindex, robots-disallowed) authoring panel. Drafts are held in that browser's localStorage; "publishing" exports a static `js/blog-data.js` file that is committed and deployed like any other asset.
* Content Safety: Post bodies use a typed block content model rendered exclusively via `createElement`/`textContent` — never raw HTML strings — to preserve the project's no-`innerHTML`-for-user-data rule.
* Full implementation notes: `docs/implementation/BLOG_SYSTEM_IMPLEMENTATION.md`.

------------------------------
## 6. Non-Functional Requirements & Performance## 6.1 Databaseless State & Retention Strategy

* Zero Server Architecture: The app must require zero databases, zero cookies, and zero user sign-ups.
* State Persistence: The JavaScript logic inside the editors must bind all input form text nodes to the browser's built-in localStorage API in real-time.
* If a user closes their browser app mid-session, runs out of battery, or returns days later, the editor initialization script must automatically sweep localStorage, fetch the cached strings, and re-populate the workspace fields immediately.

## 6.2 Security Guardrails & Compliance Assets

* DOM XSS Mitigation: The app developer must ensure all dynamic form preview strings are pushed to the UI layout strictly using textContent or innerText instead of innerHTML. An input regex sanitization function must clean strings before they write to localStorage.
* Image File Validation: The Poster app must validate file uploads explicitly via JavaScript to confirm they match an image.* mime-type before drawing them to the canvas container, instantly dropping invalid files.
* Compliance Asset (privacy.html): A dedicated, minimalist privacy layout page explicitly detailing that data stays 100% local inside the browser cache, state preservation executes via localStorage, and automated connection telemetry is securely routed through third-party ad networks (Adsterra) and infrastructure network routing layers (Cloudflare/Netlify).

## 6.3 Real-Time Session Monitoring

* Microsoft Clarity Tagging: Every standalone HTML page layout must include the global Microsoft Clarity client tracker script in the <head> block to record user journeys, monitor click heatmaps, and discover UI friction points (rage clicks) on mobile vs. desktop viewports.

------------------------------
## 7. Verification & Testing Requirements (Developer Checklist)
Prior to deploying the code to production on Netlify, the developer must verify the following items:

   1. Verify that clicking the catalog download button successfully spawns the background window hook (Adsterra Pop-Under simulation) without halting the immediate foreground transition to loading.html.
   2. Verify that on an iPhone or Android Chrome viewport, the text sizes scale fluidly and input boxes do not trigger an un-styled browser auto-zoom bug.
   3. Open the final exported resume PDF document inside a reader app, highlight a block of text, copy it, and paste it into a notepad to confirm it is readable vector text and not a rasterized screenshot image.
   4. Clear the browser tab, reopen the editor view, and ensure the local JavaScript pulls prior inputs safely from localStorage.
   5. Verify that the Microsoft Clarity integration script successfully initialises on load without throwing synchronous render-blocking console exceptions.

------------------------------
This document serves as your single source of truth for the codebase.