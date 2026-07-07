📁 The Optimal Folder StructureTo ensure a seamless, frictionless drag-and-drop deployment on Netlify, the project directory must be kept flat, modular, and organized. Save your files in a single root folder configured exactly like this:

templatebox/
│
├── index.html          # Homepage (Template Catalog & Category Filter)
├── loading.html        # 10-Second Ad Intermediary Page (Timer, Banners, Push)
├── privacy.html        # Privacy Policy & Data Processing Compliance Notice
│
├── css/
│   └── style.css       # Unified Global Stylesheet (Fabric Film Studio Theme)
│
├── js/
│   ├── app.js          # Shared App Logic (Sanitization, Global Listeners)
│   ├── resume.js       # CV Builder Core Logic (localStorage, jsPDF)
│   └── poster.js       # Poster Creator Core Logic (HTML5 Canvas Drawing)
│
└── assets/
    └── logo.png        # Brand Logo