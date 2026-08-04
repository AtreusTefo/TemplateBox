/* ==========================================================================
   TemplateBox - Resume Template Registry
   THE data source for resume template variants rendered by
   js/resume-engine.js. A template is DATA: adding one requires no renderer
   code. This is the same data-only-registry pattern as js/mockup-templates.js.

   UNITS. Everything geometric is in POINTS, matching jsPDF's "pt" unit and
   the 595x842 A4 point grid. Type sizes are points too, so one number drives
   both the on-screen preview and the PDF with no conversion table to keep in
   sync. 595x842pt is exactly A4 (210x297mm).

   COORDINATES. `firstBaseline` is the absolute page y of a column's first
   text baseline, not a box inset, because every vertical measurement below
   was taken from baselines in the source artwork. `left` and `right` are
   insets from that column's own box edges.

   FAMILY TOKENS. `serif|sans|mono` rather than font names, because the two
   mediums cannot load the same fonts. The engine maps each token to a CSS
   stack and to one of jsPDF's built-in faces. Anything outside that set
   would need an embedded font file, which inflates every export and reopens
   the WinAnsi encoding problem documented for CURRENCIES in js/docs.js.

   COLOUR ROLES. Blocks name a role ("ink", "body"), never a hex value, so a
   palette change is one edit. `accent` is reserved for per-document colour
   chosen at runtime; templates that do not offer it simply never use it.

   Adding a template: copy an entry, change the data, and add a catalog card
   in index.html with data-target="resume" data-doc="<id>". No other code
   changes are needed.
   ========================================================================== */

"use strict";

window.TB_RESUME_TEMPLATES = [
    {
        id: "grey-rail",
        title: "Grey Rail Resume",

        /* A4 in points. */
        page: { width: 595, height: 842 },

        layout: {
            kind: "two-column",
            /* Full-bleed rail down the right edge. The fraction is measured:
               the source fills x=371..595 of 595, so 224/595. */
            sidebar: {
                side: "right",
                width: 0.3765,
                background: "railBg",
                left: 20, right: 29,
                firstBaseline: 53,
                bottom: 800
            },
            main: {
                left: 35, right: 20,
                firstBaseline: 61.5,
                bottom: 800
            }
        },

        palette: {
            railBg:     "#4A4A4A",
            sidebarInk: "#FFFFFF",
            display:    "#4A4A4A",   /* name, section headings, rules */
            ink:        "#000000",   /* entry heads and company lines */
            body:       "#46464D"    /* prose and bullets */
        },

        type: {
            displayName:    { family: "sans", weight: "bold",   size: 36,
                              lineHeight: 33, color: "display" },
            heading:        { family: "sans", weight: "bold",   size: 13.5,
                              color: "display", uppercase: true,
                              gapBefore: 36, gapAfter: 22,
                              rule: { color: "display", width: 1, offset: 2 } },
            sidebarHeading: { family: "sans", weight: "bold",   size: 13.5,
                              color: "sidebarInk", uppercase: true,
                              gapBefore: 36, gapAfter: 22,
                              /* The source rule starts 20pt left of the
                                 heading, bleeding toward the rail edge. */
                              rule: { color: "sidebarInk", width: 1, offset: 2,
                                      bleedLeft: 20, length: 0.845 } },
            entryHead:      { family: "sans", weight: "bold",   size: 10, color: "ink" },
            entryMeta:      { family: "sans", weight: "normal", size: 10, color: "ink" },
            entrySub:       { family: "sans", weight: "normal", size: 10, color: "ink" },
            body:           { family: "sans", weight: "normal", size: 10,
                              lineHeight: 13, color: "body" },
            bullet:         { family: "sans", weight: "normal", size: 10,
                              lineHeight: 13, color: "body",
                              marker: "•", indent: 8, itemGap: 16 },
            sidebarItem:    { family: "sans", weight: "normal", size: 10,
                              lineHeight: 13, color: "sidebarInk",
                              marker: "•", indent: 8, itemGap: 13 },
            sidebarContact: { family: "sans", weight: "normal", size: 10,
                              lineHeight: 13, color: "sidebarInk", rowGap: 14 }
        },

        blocks: [
            /* First word on line one, the remainder on line two, then a rule.
               Matches the stacked AIDEN / LEONARD of the source. */
            { column: "main", kind: "display", field: "name", type: "displayName",
              split: "firstWord", uppercase: true, fallback: "Your Name",
              gapAfterBaseline: 11.5, gapAfter: 10,
              rule: { color: "display", width: 1 } },

            { column: "main", kind: "section", label: "Professional Summary",
              body: { kind: "paragraph", field: "summary" } },

            { column: "main", kind: "section", label: "Work History",
              body: { kind: "entries", source: "experience",
                      /* Mixed weights on ONE baseline: bold role, then the
                         dates in regular. The engine measures each run and
                         advances x, which is how the source PDF drew it. */
                      head: { runs: [
                          { field: "role",  type: "entryHead" },
                          { literal: ", ",  type: "entryMeta" },
                          { field: "dates", type: "entryMeta" }
                      ]},
                      sub: { runs: [
                          { field: "company", type: "entrySub" },
                          { literal: ", ",    type: "entrySub" },
                          { field: "place",   type: "entrySub" }
                      ], gapBefore: 13 },
                      bullets: { field: "description", split: "\n", gapBefore: 18 },
                      entryGap: 25 } },

            { column: "main", kind: "section", label: "Education",
              body: { kind: "entries", source: "education",
                      head: { runs: [
                          { field: "degree", type: "entryHead" },
                          { literal: ", ",   type: "entryHead" },
                          { field: "field",  type: "entryHead" },
                          { literal: ", ",   type: "entryMeta" },
                          { field: "dates",  type: "entryMeta" }
                      ]},
                      sub: { runs: [
                          { field: "school", type: "entrySub" },
                          { literal: " - ",  type: "entrySub" },
                          { field: "place",  type: "entrySub" }
                      ], gapBefore: 13 },
                      entryGap: 22 } },

            /* White disc with the glyph knocked out in the rail colour.
               Glyphs are drawn from primitives, not an icon font, so the
               export stays vector and needs no external asset. */
            { column: "sidebar", kind: "contact",
              iconSize: 15.2, textOffset: 28,
              disc: "sidebarInk", glyph: "railBg",
              rows: [
                  { icon: "pin",      fields: ["address", "city", "postcode"], separator: ", " },
                  { icon: "phone",    fields: ["phone", "phoneAlt"],           separator: ", " },
                  { icon: "envelope", fields: ["email"] }
              ] },

            { column: "sidebar", kind: "section", label: "Skills",
              headingType: "sidebarHeading",
              body: { kind: "list", field: "skills", split: ",", type: "sidebarItem" } }
        ]
    }
];