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

            /* Immediately after Work Experience on all three templates: a
               project is what the roles above had no room for, not an
               appendix. The head reads "Name - Role" in the same shape the
               two sections around it use, so the page keeps one rhythm. */
            { column: "main", kind: "section", label: "Projects",
              body: { kind: "entries", source: "projects",
                      head: { runs: [
                          { field: "name", type: "entryHead" },
                          { literal: " - ", type: "entryHead" },
                          { field: "role", type: "entryHead" }
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
              body: { kind: "list", field: "skills", split: "," } },

            /* A plain bulleted list, in the same role Skills above uses. This
               is the template that carries the unqualified ATS claim, and a
               proficiency bar is a graphic a parser reads as nothing -- the
               level has to survive as WORDS, which "English: Native" does and
               a 66%-filled rectangle does not. Ruled Serif draws the bars
               because its source artwork does; this one stays legible to a
               machine. */
            { column: "main", kind: "section", label: "Languages",
              body: { kind: "list", field: "languages", split: "\n",
                      entryList: "language" } },

            /* Last, which is where a reader looks for it. Two lines per
               referee: the person, then how to reach them. Every run is
               optional -- buildRuns drops an empty field along with the
               separator that would dangle after it -- so a referee entered as
               a name alone sets as one clean line rather than "Jane , , ". */
            { column: "main", kind: "section", label: "References",
              body: { kind: "entries", source: "references",
                      head: { runs: [
                          { field: "name",    type: "entryHead" },
                          { literal: " - ",   type: "entryMeta" },
                          { field: "title",   type: "entryMeta" },
                          { literal: ", ",    type: "entryMeta" },
                          { field: "company", type: "entryMeta" }
                      ]},
                      sub: [
                          { runs: [
                              { field: "email", type: "entryMeta" },
                              { literal: "  |  ", type: "entryMeta" },
                              { field: "phone", type: "entryMeta" }
                          ], gapBefore: 15.07 }
                      ],
                      entryGap: 16.72 } }
        ]
    },

    {
        /* SHIPPED August 30, 2026. Built and verified on August 2 but held
           back from the picker because it reads address, city, postcode and
           phoneAlt, none of which the editor form collected -- offering it
           would have presented a template that silently dropped half its
           sidebar. The form collects all four now, so the only thing that was
           keeping it internal is gone.

           Named for the card it serves rather than for its rail, so the picker
           button and the catalog card say the same thing. It is the site's
           only TWO-COLUMN resume, which is a real ATS trade: parsers handle a
           single column more reliably. It ships as design-led, with the other
           three carrying the unqualified ATS claim -- there is no photograph
           and extraction order is deterministic, which are the two mitigations
           that matter. See docs/implementation/RESUME_TEMPLATE_ENGINE_IMPLEMENTATION.md,
           "ATS Position".

           It still reads `education[].field`, which the form does NOT collect.
           That is deliberate and safe rather than an oversight: buildRuns drops
           an empty field along with the separator that would dangle after it,
           so the head reads "Degree, Dates" instead of "Degree, , Dates". A
           visitor who wants the field of study types it into the degree, which
           is what the sample content has always done. */
        id: "grey-rail",
        title: "Modern Professional CV",
        catalog: true,

        /* The rail and the display ink are ONE colour and both resolve to
           accent, so the swatch row is live here as it is on Ruled Serif
           rather than being a control that changes nothing. Every swatch on
           the row is dark enough to carry the rail's white sidebar text --
           that is the constraint any new swatch has to meet, not a
           coincidence. defaultAccent is the artwork's own grey, so the
           template still opens exactly as it was verified. */
        defaultAccent: "#4A4A4A",

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
            railBg:     "accent",    /* the rail block, and the icon glyphs */
            sidebarInk: "#FFFFFF",
            display:    "accent",    /* name, section headings, rules */
            ink:        "#000000",   /* entry heads and company lines */
            body:       "#46464D"    /* prose and bullets */
        },

        type: {
            displayName:    { family: "sans", weight: "bold",   size: 36,
                              lineHeight: 33, color: "display" },
            /* The professional title, set under the rule that closes the
               masthead. Regular weight in the body ink rather than a second
               accent line: two display weights stacked read as two names. */
            titleLine:      { family: "sans", weight: "normal", size: 12.5,
                              lineHeight: 15, color: "body" },
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

            /* Draws nothing at all until a title is typed, so the masthead is
               still the rule hard against the name for everyone who leaves it
               empty -- the layout this template was measured against. Only
               `gapBefore` is set: the summary heading's own gapBefore of 36
               supplies the space underneath, and adding a gapAfter here would
               double it. */
            { column: "main", kind: "text", field: "title", type: "titleLine",
              gapBefore: 16 },

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

            /* Head is "Name, Dates" in mixed weights, matching Work History
               directly above it rather than inventing a third entry shape. */
            { column: "main", kind: "section", label: "Projects",
              body: { kind: "entries", source: "projects",
                      head: { runs: [
                          { field: "name",  type: "entryHead" },
                          { literal: ", ",  type: "entryMeta" },
                          { field: "dates", type: "entryMeta" }
                      ]},
                      sub: { runs: [{ field: "role", type: "entrySub" }],
                             gapBefore: 13 },
                      bullets: { field: "description", split: "\n",
                                 gapBefore: 18 },
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

            /* In the MAIN column, not the rail. The rail is 224pt wide and
               already carries the contact block, skills and languages; a
               referee's name, title and email would wrap to three or four
               lines each in there and read as a second contact list for the
               wrong person. */
            { column: "main", kind: "section", label: "References",
              body: { kind: "entries", source: "references",
                      head: { runs: [
                          { field: "name",    type: "entryHead" },
                          { literal: ", ",    type: "entryMeta" },
                          { field: "title",   type: "entryMeta" }
                      ]},
                      sub: [
                          { runs: [
                              { field: "company", type: "entrySub" }
                          ], gapBefore: 13 },
                          { runs: [
                              { field: "email", type: "entrySub" },
                              { literal: " - ", type: "entrySub" },
                              { field: "phone", type: "entrySub" }
                          ], gapBefore: 13 }
                      ],
                      entryGap: 22 } },

            /* White glyphs straight on the rail, drawn from primitives
               rather than an icon font so the export stays vector and needs
               no external asset.

               They WERE knocked out of a white disc, which is what the source
               artwork drew. A disc spends the icon box on its own ring and
               leaves the glyph about 62% of it; at this size that was the
               difference between a recognisable handset and a grey smudge.
               `knockout` is the colour behind the glyphs now that no disc
               provides one -- it fills the pin's hole and the envelope's
               crease -- and it names the rail ROLE rather than a hex so both
               stay correct when the accent changes. */
            { column: "sidebar", kind: "contact",
              iconSize: 13.2, textOffset: 25,
              glyph: "sidebarInk", knockout: "railBg",
              rows: [
                  { icon: "pin",      fields: ["address", "city", "postcode"], separator: ", " },
                  { icon: "phone",    fields: ["phone", "phoneAlt"],           separator: ", " },
                  { icon: "envelope", fields: ["email"] }
              ] },

            { column: "sidebar", kind: "section", label: "Skills",
              headingType: "sidebarHeading",
              body: { kind: "list", field: "skills", split: ",", type: "sidebarItem" } },

            /* A bulleted list rather than the proficiency meters Ruled Serif
               draws. A meter needs a track colour that reads against the
               accent, and every accent on the swatch row is a different dark
               -- one fixed track would be muddy on at least one of them. A
               bullet needs nothing but the rail's own white. `entryList` is
               what keeps the item clickable: the form holds languages as
               rows and the engine reads them as one composed string, so
               provenance has to name the row rather than the field. */
            { column: "sidebar", kind: "section", label: "Languages",
              headingType: "sidebarHeading",
              body: { kind: "list", field: "languages", split: "\n",
                      type: "sidebarItem", entryList: "language" } }
        ]
    },

    {
        id: "ruled-serif",
        title: "Ruled Serif CV",

        /* `catalog` is what separates a template a VISITOR may pick from one
           that exists only for the internal harness at
           tools/resume-template-preview.html. All three registry entries
           carry it today; the flag earns its keep the moment a fourth is
           imported and is being fitted to the form, which is the state
           grey-rail was in until the editor learned to collect address, city,
           postcode and phoneAlt. Offering a template the form cannot fill
           presents a picker entry that silently drops half its own layout. */
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

            /* The professional title, centred under the name. Ink rather than
               accent, and two thirds of the display size: the accent belongs
               to the name and the six section headings on this sheet, and a
               fourth accent line between them would flatten that hierarchy
               into a list of coloured text. */
            titleLine:   { family: "serif", weight: "normal", size: 16,
                           lineHeight: 19.2, color: "ink", align: "center" },

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

            /* Between the name and the contact row, and absent entirely
               until a title is typed. No gapBefore, deliberately: the display
               above already carries the artwork's 35.1pt drop, so the title
               lands on exactly the baseline the diamonds used to sit on and a
               sheet with no title is byte-identical to the layout this
               template was measured against. Only the contact row moves. */
            { column: "main", kind: "text", field: "title", type: "titleLine",
              gapAfter: 28 },

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

            /* Company/dates split across the column is this design's entry
               shape -- head left, aside hard right -- so a project takes it
               too, with the role on the second baseline where the job title
               sits in Experience above. */
            { column: "main", kind: "section", label: "Projects",
              gapAfter: 20.5,
              body: { kind: "entries", source: "projects",
                      head:  { runs: [{ field: "name",  type: "entryHead" }] },
                      aside: { runs: [{ field: "dates", type: "entryMeta" }] },
                      sub: [
                          { runs: [{ field: "role", type: "entrySub" }],
                            gapBefore: 16.8 }
                      ],
                      bullets: { field: "description", split: "\n",
                                 gapBefore: 16.2 },
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
                      /* EVERY fixed option in the Languages fieldset of
                         resume.html must be recognised here, or the picker
                         offers a level that silently draws no bar. The band
                         codes cover six of the seven because each option's
                         text carries its code in brackets; "Native" is the
                         seventh and has no CEFR code, which is why it is a
                         key of its own.

                         ORDER MATTERS: meterFraction returns the FIRST key
                         that matches, so the codes come first. Were the word
                         "Intermediate" a key ahead of them, "Upper
                         intermediate (B2)" would match it and draw 0.5
                         instead of 0.66. That is also why no other word is a
                         key: bare words invite exactly that collision, and
                         "Not fluent" matching "Fluent" would draw a FULL bar
                         for the opposite of what was typed. Anything not
                         listed sets the level as plain text with no bar,
                         which is the safe answer. */
                      levels: { "A1": 0.17, "A2": 0.33, "B1": 0.5,
                                "B2": 0.66, "C1": 0.83, "C2": 1,
                                "Native": 1 },
                      bar: { height: 7, track: "meterTrack", fill: "ink",
                             gapBefore: 11.7, gapAfter: 18.1 },
                      itemGap: 24 } },

            { column: "main", kind: "section", label: "Accomplishments",
              body: { kind: "list", field: "accomplishments", split: "\n" } },

            /* Last on every template. The referee's name takes the entry head
               and the contact line sits right, which is the same head/aside
               split Experience and Education use on this sheet. */
            { column: "main", kind: "section", label: "References",
              gapAfter: 20.5,
              body: { kind: "entries", source: "references",
                      head:  { runs: [{ field: "name", type: "entryHead" }] },
                      aside: { runs: [
                          { field: "email", type: "entryMeta" },
                          { literal: " - ", type: "entryMeta" },
                          { field: "phone", type: "entryMeta" }
                      ]},
                      sub: [
                          { runs: [
                              { field: "title",   type: "entrySub" },
                              { literal: ", ",    type: "entrySub" },
                              { field: "company", type: "entrySub" }
                          ], gapBefore: 16.8 }
                      ],
                      entryGap: 20 } }
        ]
    }
];