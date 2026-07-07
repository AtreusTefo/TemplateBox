# TemplateBox

templatebox.win is a highly responsive, 100% database-free, serverless interactive web application. The platform allows everyday users to personalize text-based and visual assets (initially launching with a CV/Resume builder and a Custom Canvas/Poster creator) natively inside their web browser.

## Features

- Interactive CV/Resume builder with live preview, accent color theming, and ATS-compliant selectable vector text PDF export via the jsPDF native text API
- Poster and canvas creator with photo upload, caption typography, frame styles, and high-resolution PNG export via the HTML5 Canvas API
- Real-time state persistence through browser localStorage
- Strict client-side security guardrails: input sanitization before storage, textContent-only DOM writes, and image mime-type validation
- Monetized loading flow: catalog to intermediary countdown page to editor, with clearly marked placeholder blocks for Adsterra and Microsoft Clarity snippets

## Stack

Vanilla JAMstack: HTML5, CSS3, and ES6+ JavaScript. No build step, no framework, no server-side code.

## Project Structure

```
index.html          Homepage (template catalog and category filter)
loading.html        10-second ad intermediary page (timer, banners, push)
resume.html         CV/Resume builder editor
poster.html         Poster and canvas creator editor
privacy.html        Privacy policy and data processing notice
css/style.css       Unified global stylesheet
js/app.js           Shared logic (sanitization, filtering, countdown)
js/resume.js        CV builder core logic (localStorage, jsPDF)
js/poster.js        Poster creator core logic (HTML5 Canvas)
assets/logo.png     Brand logo
docs/               Project documentation (see DOCUMENTATION_INDEX.md)
```

## Local Development

Serve the folder with any static file server:

```
python -m http.server 8000
```

or use the VS Code Live Server extension. No dependencies to install.

## Deployment

The repository deploys as flat static assets. On Netlify: import the repository, leave the build command empty, and set the publish directory to the repository root.
