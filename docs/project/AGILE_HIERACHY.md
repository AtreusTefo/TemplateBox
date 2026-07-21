## TemplateBox — Agile Methodology## Scrum Framework with Application > Epic > Feature > User Story > Task Hierarchy## Overview
This document applies the Scrum framework to the TemplateBox project. Scrum is an Agile framework that delivers value in short, time-boxed iterations called Sprints. It provides structure through defined roles (Product Owner, Scrum Master, Development Team), artifacts (Product Backlog, Sprint Backlog, Increment), and events (Sprint Planning, Daily Scrum, Sprint Review, Sprint Retrospective). [1, 2] 
The project work is organized using a five-level Agile hierarchy — Application → Epics → Features → User Stories → Tasks — which populates the Scrum Product Backlog. User Stories are estimated with story points (Fibonacci scale), prioritized by business value, and allocated to standard 1-week iterative Sprints. Each User Story is broken down into concrete Tasks representing individual client-side implementation steps completed within a Sprint. [3, 4, 5, 6, 7] 
------------------------------
## Technology Stack
Frontend: Vanilla JAMstack architecture. Pure HTML5 (semantic structure), CSS3 (utilizing CSS custom properties/variables for global theme switching), and modern client-side JavaScript (ES6+).
Libraries & Core Engines: jsPDF native text API loaded via public CDN for native text vector PDF generation (revised from html2pdf.js; see docs/error-fixes/RESUME_PDF_RASTERIZED_TEXT_FIX.md); native HTML5 Canvas API for client-side graphic layer compositions and multi-layered processing.
State Management & Persistence: Browser Web Storage API (localStorage) handling all local text field caching natively on the user's active device.
Security Gateway: Client-side DOM input filtering running strict textContent and innerText variable insertion bounds. Pure JavaScript regular expression sanitization utility functions to strip malicious script markup tags before browser cache persistence.
Infrastructure: Netlify (Static File Hosting Network), Cloudflare Registrar, and Cloudflare DNS reverse proxy infrastructure (Proxied Orange Cloud mode active) providing global Edge caching and enterprise-grade DDoS firewalls.
Analytics & Tracking: Microsoft Clarity tracking snippet integration embedded into document headers for session recordings and interaction heatmaps; [Google Search Console](https://search.google.com/search-console/about) integration for organic click telemetry tracking.
------------------------------
## Agile Hierarchy: Definitions## Application
The Application is the complete product being built — the entire standalone system delivered at the end of all Sprints. It sits at the top of the hierarchy and represents the overarching project goal. [7] 

This project: TemplateBox (templatebox.win) — a premium, database-free web application allowing visitors to preview, select, and customize high-end document layouts (Resumes) or visual art graphics (Posters) entirely inside their local web browser without user sign-ups or server-side constraints.

------------------------------
## Epic
An Epic is a large body of work representing a high-level business domain or major platform capability. Epics span multiple Sprints and are broken down into Features. [6, 8] 

Format: EPIC-XX: <Title> — A plain text technical descriptor outlining a specific structural domain area.

------------------------------
## Feature
A Feature is a distinct tool, layout service, or functional requirement that delivers business value to the end-user. It represents a specific technical capability within an Epic and is broken down into testable User Stories. [3, 9, 10] 

Format: FEAT-XX: <Title> — Identifies a specific technical asset within the Epic framework.

------------------------------
## User Story
A User Story describes a discrete piece of system functionality written strictly from the end-user's perspective. It is estimated in story points and broken down into independent engineering Tasks. [7, 11] 

Format: US-XX: As a [role], I want [goal], so that [benefit].
Each story includes a clear description, explicit non-deceptive acceptance criteria, and micro-task assignments.

------------------------------
## Task
A Task is the smallest block of work — a concrete, implementable step required to fulfill an individual User Story. Tasks are assigned, processed, and validated locally by the client browser engine within a short development frame and carry no story point metrics. [7, 12, 13] 

Format: TASK-XX: <Action verb> + <specific technical implementation unit> — e.g., "Write local validation function for poster file upload type check".

------------------------------
## Hierarchy Map

APPLICATION: TemplateBox (templatebox.win)
│
├── EPIC-01: Core Monetization & Intermediary Traffic Control
│   ├── FEAT-01: Catalog Landing Interface
│   │   ├── US-01: As a platform visitor, I want a premium minimalist home catalog layout so that I can browse tools.
│   │   │   ├── TASK-01: Implement semantic index.html page using modern editorial layout design properties.
│   │   │   ├── TASK-02: Write responsive CSS media query grid blocks for template card visualization.
│   │   │   └── TASK-03: Embed standard-compliant JSON-LD WebApplication schema inside index.html head.
│   │   └── US-02: As a platform visitor, I want responsive category filter tags so that I can instantly isolate template options.
│   │       ├── TASK-04: Implement horizontal row of flat rectangular category filter pill elements.
│   │       ├── TASK-05: Write vanilla JavaScript listener mapping to item cards via data-category filters.
│   │       └── TASK-06: Configure client-side display class toggles for smooth layout fade transitions.
│   ├── FEAT-02: Secure Ad-Separation Sequence
│   │   ├── US-03: As a platform owner, I want the tool CTA button to initiate a hybrid dual-tab routing flow so that monetization runs safely.
│   │   │   ├── TASK-07: Bind click listener to "Personalize Template" buttons to capture user activation intents.
│   │   │   ├── TASK-08: Write JavaScript background trigger script to execute Adsterra Pop-Under initialization.
│   │   │   └── TASK-09: Implement synchronous foreground redirect window route linking cleanly to loading.html.
│   │   └── US-04: As a platform visitor, I want a clean 10-second wait screen so that I understand when my workspace assets are fully ready.
│   │       ├── TASK-10: Build loading.html using a center card matching the Fabric Film Studio design aesthetic.
│   │       ├── TASK-11: Implement JavaScript setInterval execution loop managing a 10-to-0 countdown clock.
│   │       └── TASK-12: Write automated conditional window location override logic firing immediately at timer zero.
│   └── FEAT-03: Multi-Ad Grid Architecture
│       ├── US-05: As a platform owner, I want the loading interface to maintain responsive ad slots so that waiting time is monetized across all devices.
│       │   ├── TASK-13: Create CSS layout container optimized to display two side-by-side 300x250 Adsterra banners.
│       │   ├── TASK-14: Implement mobile-first CSS logic to snap the horizontal ad block into a vertical column at 768px.
│       │   ├── TASK-15: Inject Adsterra In-Page Push notification ad code placeholder snippet below main headings.
│       │   └── TASK-16: Write client timeout logic scheduled to reveal the animated push notice at countdown second 7.
│
├── EPIC-02: Interactive Client-Side App Editors
│   ├── FEAT-04: Dynamic CV/Resume Builder
│   │   ├── US-06: As a job seeker, I want an interactive split-screen workspace so that I can modify form values and track changes in real-time.
│   │   │   ├── TASK-17: Build 50/50 responsive split flexbox structure mapping input nodes alongside a vector preview container.
│   │   │   ├── TASK-18: Implement mobile media query rules mapping the layout into selectable tabbed workspace panes.
│   │   │   └── TASK-19: Write change listener functions mapping form values directly to preview items via textContent.
│   │   └── US-07: As a job seeker, I want to toggle template color accents so that I can match my personal corporate identity.
│   │       ├── TASK-20: Create custom palette selection nodes using flat, sharp rectangular visual geometries.
│   │       └── TASK-21: Code JavaScript click handoff variables that manipulate document highlights via CSS root variables.
│   ├── FEAT-05: HTML5 PDF Compilation Engine
│   │   └── US-08: As a job seeker, I want to export my finished resume directly to an ATS-compliant PDF so that corporate scanners can highlight my text data.
│   │       ├── TASK-22: Integrate jsPDF configuration dependencies via secure script CDN paths.
│   │       ├── TASK-23: Code explicit canvas optimization scale flags within the PDF export script to protect document resolution.
│   │       └── TASK-24: Implement direct local browser memory stream triggers outputting selectable vector text files on click.
│   └── FEAT-06: Canvas Graphic Customizer
│       ├── US-09: As a digital creator, I want to upload custom imagery and overlay text captions so that I can generate tailored frame poster graphics.
│       │   ├── TASK-25: Embed a highly responsive HTML5 canvas element inside the workspace interface.
│       │   ├── TASK-26: Write client-side file upload node listeners inspecting incoming file type definitions via JavaScript arrays.
│       │   ├── TASK-27: Create text layout input elements bound to canvas text layer drawing rendering tools.
│   │   └── US-10: As a digital creator, I want to export my finished graphic directly to my download folder so that I can preserve the custom artwork files.
│   │       ├── TASK-28: Write canvas layer composition logic stitching image, frame vectors, and text titles.
│   │       └── TASK-29: Implement canvas toDataURL local stream download links outputting high-resolution PNG assets.
│
├── EPIC-03: Security Guardrails, Telemetry & Compliance
│   ├── FEAT-07: Client-Side Input Firewall
│   │   ├── US-11: As a system, I want all input strings sanitized and capped before processing so that malicious injection attacks are nullified.
│   │   │   ├── TASK-30: Build global regular expression utility function to encode script characters before variable execution.
│   │   │   ├── TASK-31: Implement HTML5 native maxlength boundary conditions across all form string input structures.
│   │   │   └── TASK-32: Code strict image mime-type validation checks blocking non-image extension injection attempts.
│   │   └── US-12: As a visitor, I want my form inputs persisted locally in real-time so that my progress is preserved across unexpected tab closures.
│   │       ├── TASK-33: Write real-time localStorage item setters tracking active user text input modifications.
│   │       └── TASK-34: Code initialization logic sweeping browser cache records on workspace mount to restore state arrays.
│   └── FEAT-08: Platform Legal & Traffic Analytics
│       ├── US-13: As a system, I want legal disclosure transparency pages available so that search crawlers maintain domain trust flags.
│       │   ├── TASK-35: Write privacy.html document adopting the uniform premium editorial minimalist design framework.
│       │   └── TASK-36: Populate plain text disclosures detailing browser storage mechanics and third-party ad log pipelines.
│       └── US-14: As a platform owner, I want silent user behavioral telemetry tracked so that I can optimize ad container layouts based on clicks.
│           ├── TASK-37: Embed universal Microsoft Clarity tracking code snippets across all individual HTML asset headers.
│           └── TASK-38: Connect Google Search Console validation layers to track organic keyword ranking metrics safely.
│
├── EPIC-04: Print-on-Demand Mockup Generator (shipped July 20, 2026)
│   └── FEAT-09: Canvas Product Mockup Tool
│       ├── US-15: As a print-on-demand seller, I want to preview a design on real product templates so that I can skip a photoshoot.
│       │   ├── TASK-39: Build flat-vector Canvas product illustrations (t-shirt, hoodie, mug, packaging box).
│       │   ├── TASK-40: Write mime-validated design upload matching the poster app's file-type guard.
│       │   ├── TASK-41: Implement Pointer Events drag-to-reposition and range-input scale placement, clipped to a per-product print area.
│       │   └── TASK-42: Wire `mockup: "mockup.html"` into `EDITOR_ROUTES` so the tool routes through the existing monetized loading flow with zero ad-side changes.
│       └── US-16: As a print-on-demand seller, I want to stage several finished renders before downloading so that I can build a store listing in one session.
│           └── TASK-43: Build an in-memory "My Mockups" tray with per-item download/remove actions, deliberately not persisted to localStorage.
│
└── EPIC-05: Serverless Content Marketing Blog (shipped July 18, 2026)
    └── FEAT-10: Static Admin-Authored Blog
        ├── US-17: As a platform owner, I want to publish blog content without a database or server so that the $0/month infrastructure constraint holds.
        │   ├── TASK-44: Build a private, robots-disallowed admin.html authoring panel backed by localStorage drafts.
        │   ├── TASK-45: Implement a typed block content model rendered exclusively via createElement/textContent, never raw HTML.
        │   └── TASK-46: Write an export flow that generates a static js/blog-data.js post database for deployment.
        └── US-18: As a platform owner, I want the blog to carry passive ad formats only so that it stays trustworthy as indexable content.
            └── TASK-47: Build the size-aware AD_ZONES placement registry in js/blog.js, keeping Popunder and Social Bar off blog pages entirely.