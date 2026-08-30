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
        /* The editor's original layout, migrated onto this engine from the
           hand-written preview and jsPDF writer that used to live in
           js/resume.js. Those two agreed about content and about nothing else
           -- different fonts, different sizes, different spacing -- so the
           live preview never showed what the download would contain, and a
           resume that ran to two pages said so nowhere.

           Every type size, colour and margin below is the number the old
           jsPDF writer used, converted from millimetres at 72/25.4. The
           SPACING is uniform where the old writer's was incidental; see
           docs/implementation/CLASSIC_TEMPLATE_MIGRATION.md for the
           measured drift and why each difference is the better answer.

           It declares no defaultAccent on purpose: this template has no
           opinion about colour, so arriving on one of its catalog cards must
           not reset the accent a returning visitor chose. */
        id: "classic",
        title: "Classic",
        catalog: true,

        page: { width: 595, height: 842 },

        layout: {
            kind: "single-column",
            /* 18mm margins and a 174mm text column, to the point. `right` is
               the 0.27pt smaller remainder rather than another 51.02, so the
               column measures EXACTLY the old writer's 174mm and line breaks
               therefore fall in the same places. */
            main: {
                left: 51.02, right: 50.75,
                firstBaseline: 62.36,
                bottom: 790.87
            }
        },

        palette: {
            ink:   "#1A1A1A",
            muted: "#6B6B66"
        },

        /* Line heights are the old writer's `size * 0.3528 * 1.3`, which is
           exactly 1.3x the point size once the millimetre round trip cancels
           out. */
        type: {
            displayName: { family: "serif", weight: "bold",   size: 24,
                           lineHeight: 31.2, color: "accent" },
            titleLine:   { family: "sans",  weight: "bold",   size: 11,
                           lineHeight: 14.3, color: "ink" },
            contactLine: { family: "sans",  weight: "normal", size: 9,
                           lineHeight: 11.7, color: "muted" },

            heading:     { family: "serif", weight: "bold", size: 12,
                           color: "accent", uppercase: true,
                           gapBefore: 27, gapAfter: 15.59,
                           rule: { color: "accent", width: 1.42, offset: 4.25 } },

            body:        { family: "sans", weight: "normal", size: 9.5,
                           lineHeight: 12.35, color: "ink" },
            entryHead:   { family: "sans", weight: "bold",   size: 10.5,
                           lineHeight: 13.65, color: "ink" },
            entryMeta:   { family: "sans", weight: "normal", size: 8.5,
                           lineHeight: 11.05, color: "muted" },

            /* An entry description is PROSE here, not a list: no marker and no
               indent, so it sets flush like the summary above it. Skills are
               the only marked list on this template, which is why the two are
               separate roles rather than one. */
            entryBody:   { family: "sans", weight: "normal", size: 9.5,
                           lineHeight: 12.35, color: "ink",
                           marker: "", indent: 0, itemGap: 12.35 },
            /* 8.64pt is the MEASURED width of the old writer's "•  " prefix
               in Helvetica 9.5, so the skill text starts on the same x it
               always did. It drew marker and text as one string; the engine
               draws two runs, which is why the indent has to be measured
               rather than guessed. */
            bullet:      { family: "sans", weight: "normal", size: 9.5,
                           lineHeight: 12.35, color: "ink",
                           marker: "•", indent: 8.64, itemGap: 13.77 }
        },

        blocks: [
            { column: "main", kind: "display", field: "name", type: "displayName",
              fallback: "Your Name", gapAfter: 35.45 },

            /* gapAfter carries a line height as well as the gap, because the
               cursor is left ON the last baseline drawn. The contact line
               below adds none: the first heading's own gapBefore covers it. */
            { column: "main", kind: "text", field: "title", type: "titleLine",
              gapAfter: 17.14 },

            { column: "main", kind: "text", type: "contactLine",
              fields: ["email", "phone", "location"], separator: "  |  " },

            { column: "main", kind: "section", label: "Summary",
              body: { kind: "paragraph", field: "summary" } },

            { column: "main", kind: "section", label: "Work Experience",
              body: { kind: "entries", source: "experience",
                      head: { runs: [
                          { field: "role",    type: "entryHead" },
                          { literal: " - ",   type: "entryHead" },
                          { field: "company", type: "entryHead" }
                      ]},
                      sub: [
                          { runs: [{ field: "dates", type: "entryMeta" }],
                            gapBefore: 15.07 }
                      ],
                      bullets: { field: "description", split: "\n",
                                 type: "entryBody", gapBefore: 12.47 },
                      entryGap: 20.85 } },

            { column: "main", kind: "section", label: "Education",
              body: { kind: "entries", source: "education",
                      head: { runs: [
                          { field: "degree", type: "entryHead" },
                          { literal: " - ",  type: "entryHead" },
                          { field: "school", type: "entryHead" }
                      ]},
                      sub: [
                          { runs: [{ field: "dates", type: "entryMeta" }],
                            gapBefore: 15.07 }
                      ],
                      entryGap: 16.72 } },

            { column: "main", kind: "section", label: "Skills",
              body: { kind: "list", field: "skills", split: "," } }
        ]
    },

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
    },

    {
        id: "ruled-serif",
        title: "Ruled Serif CV",

        /* `catalog` is what separates a template a VISITOR may pick from one
           that exists only for the internal harness at
           tools/resume-template-preview.html. grey-rail above carries no
           flag on purpose: it reads address/city/postcode/phoneAlt, none of
           which the editor form collects, so offering it would present a
           picker entry that silently drops half the sidebar. */
        catalog: true,

        /* Every colour role that is not ink resolves to `accent`, so the
           editor's swatch row is live on this template rather than being a
           control that changes nothing. `defaultAccent` is what the picker
           applies when this template is CHOSEN, which is how the sheet comes
           up in the artwork's green without freezing the swatches out. */
        defaultAccent: "#327B3C",

        /* A4 in points, matching the 595.28x841.89 artboard of the source
           artwork one-to-one, so every measurement below is the artwork's own
           number rather than a conversion. */
        page: { width: 595, height: 842 },

        layout: {
            kind: "single-column",
            /* The full-width rules in the source run x=36.7 to x=555.85.
               Those two numbers ARE the column, so the text block and the
               rules cannot drift apart. */
            /* `bottom` is a RESERVATION boundary, not the last baseline:
               ensureRoom breaks the page when baseline + lineHeight passes
               it, so the deepest line this template can set is 830 - 16.8 =
               813.2 -- which is where the source artwork's last baseline
               sits. Setting it to the baseline itself costs a whole line and
               pushes the final wrap onto a second page. */
            main: {
                left: 36.7, right: 39.15,
                firstBaseline: 22.94,
                bottom: 830
            }
        },

        palette: {
            ink:        "#231F20",   /* body text, rules, meter fill */
            meterTrack: "#D1D3D4"
        },

        type: {
            displayName: { family: "serif", weight: "bold", size: 25,
                           lineHeight: 28, color: "accent", align: "center" },

            /* One size for every section heading. The source artwork sets
               PROFESSIONAL SUMMARY at 21pt and the other five at 24pt, which
               is the designer having scaled the longest label by eye rather
               than a design rule -- it fits at 24pt with 260pt to spare. A
               heading that is smaller than its neighbours for no expressible
               reason is a defect to inherit, not a feature. */
            heading:     { family: "serif", weight: "bold", size: 24,
                           color: "accent", align: "center", uppercase: true,
                           gapBefore: 18, gapAfter: 27,
                           ruleBefore: { color: "ink", width: 2, gapAfter: 27.5 },
                           rule: { color: "ink", width: 2, offset: 11 } },

            body:        { family: "serif", weight: "normal", size: 14,
                           lineHeight: 16.8, color: "ink" },
            entryHead:   { family: "serif", weight: "bold",   size: 14, color: "ink" },
            entryMeta:   { family: "serif", weight: "normal", size: 14, color: "ink" },
            entrySub:    { family: "serif", weight: "normal", size: 14, color: "ink" },

            /* Experience and accomplishment bullets are inset from the column
               edge in the source; skills bullets sit flush against it. That
               is the only difference between the two roles, and it is why
               they are two roles rather than one. */
            bullet:      { family: "serif", weight: "normal", size: 14,
                           lineHeight: 16.8, color: "ink",
                           marker: "•", indent: 8, inset: 29.8, itemGap: 16.8 },
            skillItem:   { family: "serif", weight: "normal", size: 14,
                           lineHeight: 16.8, color: "ink",
                           marker: "•", indent: 7.6, itemGap: 16.8 }
        },

        blocks: [
            /* The hairline above the name. A block rather than a key on the
               display below it, because in this design the sheet opens with a
               rule whether or not a name has been typed. */
            { column: "main", kind: "rule", color: "ink", width: 2, gapAfter: 35.1 },

            { column: "main", kind: "display", field: "name", type: "displayName",
              uppercase: true, fallback: "Your Name", gapAfter: 35.1 },

            /* Location, phone and email on one centred line, separated by the
               source's small filled diamonds. Fields that are empty drop out
               with their separator, so a two-value row still centres. */
            { column: "main", kind: "contactRow", type: "body", align: "center",
              fields: ["location", "phone", "email"],
              separator: { shape: "diamond", size: 7.2, gap: 8, color: "ink" } },

            { column: "main", kind: "section", label: "Professional Summary",
              body: { kind: "paragraph", field: "summary" } },

            /* Two-up, splitting at 0.615 of the column: the source's second
               skills column starts at x=355.85 against a 519.15pt column. */
            { column: "main", kind: "section", label: "Skills",
              body: { kind: "list", field: "skills", split: ",",
                      type: "skillItem",
                      columns: { count: 2, split: 0.615, gutter: 12 } } },

            /* Entry lists sit closer under their rule than prose does, which
               is a property of the body rather than of the heading -- hence
               the per-block gapAfter here and on Education. */
            { column: "main", kind: "section", label: "Experience",
              gapAfter: 20.5,
              body: { kind: "entries", source: "experience",
                      head:  { runs: [{ field: "company", type: "entryHead" }] },
                      aside: { runs: [{ field: "dates",   type: "entryMeta" }] },
                      /* Three baselines, not one comma-joined line: company
                         in bold, then the role, then the place, exactly as
                         the artwork stacks them. */
                      sub: [
                          { runs: [{ field: "role",  type: "entrySub" }], gapBefore: 16.8 },
                          { runs: [{ field: "place", type: "entrySub" }], gapBefore: 16.8 }
                      ],
                      bullets: { field: "description", split: "\n", gapBefore: 16.2 },
                      entryGap: 22 } },

            { column: "main", kind: "section", label: "Education",
              gapAfter: 20.5,
              body: { kind: "entries", source: "education",
                      /* Regular weight, not bold: this design sets the degree
                         in the same face as its body copy. */
                      head:  { runs: [{ field: "degree", type: "entryMeta" }] },
                      aside: { runs: [{ field: "dates",  type: "entryMeta" }] },
                      sub: [
                          { runs: [
                              { field: "school", type: "entrySub" },
                              { literal: " - ",  type: "entrySub" },
                              { field: "place",  type: "entrySub" }
                          ], gapBefore: 16.8 }
                      ],
                      entryGap: 20 } },

            /* "English: Upper intermediate (B2)" draws a proficiency bar
               between the two lines. The CEFR bands are the template's, not
               the engine's: B2 fills 0.66 of the track, which is where the
               source artwork's fill stops (x=373.94 of a 38.06..546.28 bar).
               A level outside the scale draws no bar rather than a guessed
               one, and a bare percentage always works. */
            { column: "main", kind: "section", label: "Languages",
              body: { kind: "meters", field: "languages", split: "\n",
                      levels: { "A1": 0.17, "A2": 0.33, "B1": 0.5,
                                "B2": 0.66, "C1": 0.83, "C2": 1 },
                      bar: { height: 7, track: "meterTrack", fill: "ink",
                             gapBefore: 11.7, gapAfter: 18.1 },
                      itemGap: 24 } },

            { column: "main", kind: "section", label: "Accomplishments",
              body: { kind: "list", field: "accomplishments", split: "\n" } }
        ]
    }
];