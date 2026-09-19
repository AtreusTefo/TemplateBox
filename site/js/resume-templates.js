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
        /* Traced from a supplied design and MEASURED off the raster. A clean
           two-column CV, dark ink and one blue, with a filled disc carrying a
           glyph beside every section heading. Built September 19, 2026.

           THE REFERENCE IS A MOCKUP, not a bare artwork: the sheet is placed
           on a beige ground with a drop shadow. Measuring the raster would
           fold the mockup padding into every number, so the sheet was found
           first -- x 54..685, y 75..1022 of a 736x1104 image -- and everything
           below is measured from that crop. The sheet is 632x948, aspect
           0.6667, a clean 2:3 and the FOURTH reference in a row to be one; A4
           is 0.7067. Scaling by width would overrun the page, so the scale is
           k = 842/948 = 0.88819 on BOTH axes, which is uniform and costs only
           margins.

           The masthead centres on the page at 297.5 and the two columns centre
           on 285.5 in the raster -- a 12pt disagreement that is treated as
           mockup crop rather than design, so both are centred here. Anything
           else would reproduce a perspective artefact as a layout decision.

           Sizes come from measured WIDTHS through jsPDF's HELVETICA metrics.
           Three long summary lines put the body at 10.64, 10.64 and 10.70;
           two headings at 12.71 and 12.35, and their cap height independently
           implies 12.38, which is how you know the headings are NOT tracked.

           THE CAPS IN THE REFERENCE ARE PLACEHOLDERS, NOT CONTENT. "SKILL
           ONE" and "LOCATION" measure as letter-spaced, and they are not
           tracked here: a visitor's real skills are not capitals, so tracking
           them would be fitting the mockup rather than the design. The two
           masthead lines ARE tracked, because those are the design.
           See docs/implementation/BADGE_COLUMN_CV_TEMPLATE.md. */
        id: "badge-column",
        title: "Badge Column CV",
        catalog: true,

        /* One blue throughout -- discs, rules and the divider -- so the swatch
           row moves the whole identity together. The reference's blue is not
           on the row; the row's navy is the nearest, and `applyAccent` matches
           the hex exactly, so anything else would open the editor with no
           swatch selected. */
        defaultAccent: "#1F4E79",

        page: { width: 595, height: 842 },

        /* ONE column, split into two for the body. The masthead is centred on
           the PAGE, which a sidebar layout cannot do -- its columns own their
           own halves and `anchorX` would centre the name in whichever half it
           was declared in. So the sheet is single-column down to the masthead
           and `split` opens the two columns under it.

           The consequence to know: the two halves do NOT paginate, the same
           rule the sidebar follows, because a column that breaks mid-list
           reads as a rendering fault. `rejoin` pushes the deeper half into the
           main cursor, so an overrun is reported rather than lost. */
        layout: {
            main: { left: 59, right: 59, firstBaseline: 80, bottom: 815 }
        },

        palette: {
            blue:    "accent",
            ink:     "#2F333C",
            rule:    "#D8DCE3",
            divider: "#A3AFCB",
            paper:   "#FFFFFF"
        },

        type: {
            displayName:{ family: "sans", weight: "bold", size: 42,
                          tracking: 1.9, color: "ink", align: "center" },
            title:      { family: "sans", weight: "normal", size: 11,
                          tracking: 3.5, color: "ink", align: "center" },

            /* Two heading roles, because the rule under a heading is 22.2pt on
               BOTH sides and `emitRule` takes its length as a fraction of the
               column -- 0.166 of the narrow one and 0.078 of the wide one is
               the same 22.2pt. The badge geometry is identical in both. */
            headLeft:   { family: "sans", weight: "bold", size: 12.5,
                          color: "ink", uppercase: true,
                          gapBefore: 38, gapAfter: 16.9,
                          badge: { r: 11.1, color: "blue", glyph: "paper",
                                   gap: 15.1, dy: 4.45 },
                          rule: { color: "blue", width: 1.8, offset: 11.55,
                                  length: 0.1657 } },
            headRight:  { family: "sans", weight: "bold", size: 12.5,
                          color: "ink", uppercase: true,
                          gapBefore: 38, gapAfter: 16.9,
                          badge: { r: 11.1, color: "blue", glyph: "paper",
                                   gap: 15.1, dy: 4.45 },
                          rule: { color: "blue", width: 1.8, offset: 11.55,
                                  length: 0.0779 } },

            body:       { family: "sans", weight: "normal", size: 10.65,
                          lineHeight: 15.99, color: "ink" },
            contact:    { family: "sans", weight: "normal", size: 10.65,
                          lineHeight: 15.99, color: "ink", rowGap: 12 },
            entryHead:  { family: "sans", weight: "bold", size: 10.65,
                          lineHeight: 15.99, color: "ink" },
            entrySub:   { family: "sans", weight: "normal", size: 10.65,
                          lineHeight: 15.99, color: "ink" },
            meta:       { family: "sans", weight: "normal", size: 10.65,
                          lineHeight: 15.99, color: "ink" },
            bullet:     { family: "sans", weight: "normal", size: 10.65,
                          lineHeight: 15.99, color: "ink",
                          marker: "\u2022", indent: 11, itemGap: 15.99 }
        },

        blocks: [
            /* ---------------- masthead, centred on the page --------------- */
            /* The reference opens with a small tracked "CV TEMPLATE" over a
               short rule. Removed at the owner's instruction, and the name is
               the first block now.

               `firstBaseline` moved from 43.52 to 80 rather than leaving the
               name where the kicker had pushed it: the kicker's own top margin
               was 36pt of white above a 10pt line, and inheriting that under a
               42pt name would have left 116pt -- 41mm -- of empty sheet above
               it. 80 puts the name's cap top at the same 50pt the rest of the
               masthead was drawn against.

               Everything below follows the cursor, so the sheet gains the
               36.5pt the kicker occupied. That is a real benefit rather than
               incidental: this template was at 785.4 of an 815 boundary and
               had no room for a visitor's sixth skill. */
            { column: "main", kind: "display", field: "name",
              type: "displayName", uppercase: true, fallback: "Your Name",
              gapAfter: 26.65 },

            { column: "main", kind: "display", field: "title", type: "title",
              uppercase: true, gapAfter: 47.27 },
            { column: "main", kind: "rule", float: true, dy: -29.51,
              dx: 209.6, length: 0.1638, color: "blue", width: 1.8 },

            /* ---------------- the two columns ---------------------------- */
            /* The divider runs 20pt past the deeper column so it meets the
               rule across the foot, which is what the reference draws. */
            { column: "main", kind: "split", x: 218.83,
              gapLeft: 25.83, gapRight: 32.07,
              rule: { color: "divider", width: 1, inset: -12, extend: 8 } },

            /* -- left -- */
            { column: "bandLeft", kind: "section", label: "Contact",
              headingType: "headLeft", icon: "person", gapBefore: 30,
              gapAfter: 24,
              body: { kind: "contact", type: "contact",
                      iconSize: 15, textOffset: 27,
                      glyph: "blue", knockout: "paper",
                      rows: [
                          { icon: "envelope", fields: ["email"] },
                          { icon: "phone",    fields: ["phone"] },
                          { icon: "pin",      fields: ["location"] },
                          { icon: "link",     fields: ["linkedin"] },
                          { icon: "globe",    fields: ["website"] }
                      ] } },

            { column: "bandLeft", kind: "rule", gapBefore: 26,
              color: "rule", width: 1 },

            { column: "bandLeft", kind: "section", label: "Skills",
              headingType: "headLeft", icon: "star", gapBefore: 43.5,
              body: { kind: "list", field: "skills", split: "," } },

            { column: "bandLeft", kind: "rule", gapBefore: 26,
              color: "rule", width: 1 },

            { column: "bandLeft", kind: "section", label: "Education",
              headingType: "headLeft", icon: "cap", gapBefore: 45.3,
              body: { kind: "entries", source: "education",
                      head: { runs: [{ field: "degree", type: "entryHead" }] },
                      sub: [
                          { runs: [{ field: "school", type: "entrySub" }],
                            gapBefore: 15.1 },
                          { runs: [{ field: "dates", type: "meta" }],
                            gapBefore: 16.9 }
                      ],
                      divider: { color: "rule", width: 1 },
                      entryGap: 28 } },

            /* -- right -- */
            { column: "bandRight", kind: "section", label: "Professional Summary",
              headingType: "headRight", icon: "person", gapBefore: 30,
              gapAfter: 21.3,
              body: { kind: "paragraph", field: "summary", type: "body" } },

            { column: "bandRight", kind: "rule", gapBefore: 23.1,
              color: "rule", width: 1 },

            /* The years sit FLUSH RIGHT on the job title's own baseline, which
               is what `aside` is for -- laid out before the cursor moves. */
            { column: "bandRight", kind: "section", label: "Experience",
              headingType: "headRight", icon: "briefcase", gapBefore: 44.4,
              body: { kind: "entries", source: "experience",
                      head: { runs: [{ field: "role", type: "entryHead" }] },
                      aside: { runs: [{ field: "dates", type: "meta" }] },
                      sub: [
                          { runs: [
                              { field: "company", type: "entrySub" },
                              { literal: "  |  ", type: "entrySub" },
                              { field: "place",   type: "entrySub" }
                            ], gapBefore: 19.54 }
                      ],
                      bullets: { field: "description", split: "\n",
                                 gapBefore: 19.54 },
                      divider: { color: "rule", width: 1 },
                      entryGap: 46 } },

            { column: "main", kind: "rejoin", gapAfter: 20 },

            /* The rule across the foot, which the column divider runs down to
               meet. */
            { column: "main", kind: "rule", gapBefore: 0,
              color: "blue", width: 1.8 }
        ]
    },

    {
        /* Traced from a supplied design and MEASURED off the raster: a blue
           and white CV whose sections are introduced by a solid tab bleeding
           off the left edge, with a pale band behind it. Built September 19,
           2026.

           IT SHIPS DESIGN-LED. Photo-led, and two-column for part of its
           height, so it fails two of the three conditions the site's
           unqualified ATS claim needs. grey-rail, peach-portrait and
           serif-timeline set the precedent. It keeps the third: blocks are
           declared so the content stream reads the header, then each section
           whole, and within the band the whole left column before the whole
           right one.

           THE REFERENCE IS 736x1104 -- aspect 0.6667, a clean 2:3, which is a
           screen export ratio rather than a paper one, and the same shape as
           the Serif Timeline CV's reference. The scale is taken off the
           HEIGHT, k = 842/1104 = 0.76268, applied to BOTH axes: scaling by
           width maps the sheet to 892.5pt and overruns A4 by 19.8pt, which
           would then have to come out of the vertical rhythm. Uniform scaling
           costs only margins. The 736px block maps to 561.3pt and is centred,
           so content sits between 16.83 and 578.17 -- and furniture that
           BLEEDS goes to the real page edges instead, which is what the tabs
           and their wash do.

           Sizes are derived from measured WIDTHS through jsPDF's HELVETICA
           metrics -- this design is a sans. Eight tab labels put the heading
           size between 10.49 and 11.88, mean 10.99, and the cap height
           independently implies 10.64, so there is no letter-spacing. Body
           text from six strings: 11.0 to 11.4.
           See docs/implementation/BLUE_BANNER_CV_TEMPLATE.md. */
        id: "blue-banner",
        title: "Blue Banner CV",
        catalog: true,

        /* The reference's blue is #21619F, which is NOT on the swatch row.
           applyAccent matches the hex exactly, so a value that is not a swatch
           opens the editor with nothing selected -- the defect grey-rail
           shipped with. The row's navy is the nearest, and the sheet is one
           blue throughout, so the swatch moves the name, every tab and every
           rule together. */
        defaultAccent: "#1F4E79",

        page: { width: 595, height: 842 },

        /* Single column. The two-column band in the middle is LOCAL and is
           opened by a `split` block, because it starts and stops mid-sheet --
           the engine's two-column layout is a property of the page and cannot
           express that.

           The right inset is 80, putting the measure at 515. That is derived
           from where the objective wraps: its first line ends at 504.95 and
           the next word would take it past 525, so the measure is bounded
           between those rather than pinned. The signature rule reaches 536 in
           the reference and stops at the measure here, which is a 21pt
           shortening of one decorative line. */
        layout: {
            main: { left: 52.68, right: 80, firstBaseline: 83.13, bottom: 815 }
        },

        palette: {
            blue:   "accent",
            wash:   "#E8EFF9",   /* the band behind each tab, flattened */
            ink:    "#333333",
            paper:  "#FFFFFF",
            onBlue: "#FFFFFF"
        },

        type: {
            displayName: { family: "sans", weight: "bold", size: 38,
                           color: "blue" },

            /* Italic, which the SVG painter only learned to draw on September
               19, 2026 -- before that a role saying "italic" slanted in the
               PDF and stood upright in the preview. */
            subtitle:    { family: "serif", weight: "italic", size: 18.5,
                           color: "blue", align: "center" },

            /* The tab. It bleeds 52.68 to the left so it runs off the page
               edge, keeps no pad before its label and 30 after it, and slants
               6.9 off its bottom-right corner. */
            tab:         { family: "sans", weight: "bold", size: 11,
                           color: "onBlue", uppercase: true,
                           gapBefore: 30, gapAfter: 26,
                           box: { color: "blue", bleedLeft: 52.68,
                                  padX: 0, padRight: 30, slant: 6.9,
                                  above: 13, below: 6,
                                  wash: { color: "wash", bleed: "page" } } },

            /* The band's right half. Same tab, but it starts at its own column
               rather than off the page, so it pads before the label instead of
               bleeding. */
            tabRight:    { family: "sans", weight: "bold", size: 11,
                           color: "onBlue", uppercase: true,
                           gapBefore: 30, gapAfter: 26,
                           box: { color: "blue", padX: 16.8, padRight: 25,
                                  slant: 6.9, above: 13, below: 6 } },

            contact:     { family: "sans", weight: "normal", size: 11.3,
                           lineHeight: 14, color: "ink", rowGap: 9.2 },
            body:        { family: "sans", weight: "normal", size: 11.3,
                           lineHeight: 16, color: "ink" },
            bodyItalic:  { family: "serif", weight: "italic", size: 11.8,
                           lineHeight: 16, color: "ink" },
            entryHead:   { family: "sans", weight: "bold", size: 11.3,
                           lineHeight: 16, color: "blue" },
            entryTail:   { family: "sans", weight: "normal", size: 11.3,
                           lineHeight: 16, color: "ink" },
            entrySub:    { family: "serif", weight: "italic", size: 11.3,
                           lineHeight: 16, color: "ink" },
            label:       { family: "sans", weight: "bold", size: 11.3,
                           lineHeight: 16, color: "blue" },
            bullet:      { family: "sans", weight: "normal", size: 11.3,
                           lineHeight: 14.5, color: "ink",
                           marker: "\u2022", indent: 12, itemGap: 17 }
        },

        blocks: [
            /* ---------------- header -------------------------------------- */
            /* Absolute, advancing no cursor. The reference's frame is 0.7547
               and PHOTO_RATIO is fixed at 4:5 site-wide so no painter can
               stretch a face, so the width is the reference's and the height
               is 4:5's -- 9pt shorter than the artwork's. */
            /* The header is a band too: the photograph occupies the left and
               everything else is set beside it. No divider between them.

               The photograph is declared INSIDE the band, in its left half,
               and that placement is load-bearing rather than tidy. A filled
               photo block advances its column cursor -- deliberately, so a
               picture at the top of a single-column sheet pushes the text
               below it -- while an empty slot does not. In the main column
               that made this sheet one page with no portrait and TWO with
               one, because the name started 95pt lower as soon as a visitor
               uploaded anything. In the band the depth it adds is bandLeft's,
               and `rejoin` takes the deeper of the two halves, which is the
               answer for a photograph standing beside a header rather than
               above it. */
            { column: "main", kind: "split", x: 185, gapLeft: 6, gapRight: 8.78 },

            { column: "bandLeft", kind: "photo", top: 22.88, width: 124.3 },

            { column: "bandRight", kind: "display", field: "name",
              type: "displayName", uppercase: true, fallback: "Your Name",
              gapAfter: 22.9 },

            /* A literal, carried as a fallback on a field no state has: this
               line names the DOCUMENT rather than the person, so there is
               nothing for a visitor to fill in. */
            { column: "bandRight", kind: "display", field: "documentLabel",
              fallback: "Curriculum Vitae", type: "subtitle", gapAfter: 32.8 },

            /* Short rules either side of the subtitle, at its own mid-height.
               They float: they are beside the line, not a step under it. */
            { column: "bandRight", kind: "rule", float: true, dy: -27.5,
              dx: 18.3, length: 0.128, color: "blue", width: 1 },
            { column: "bandRight", kind: "rule", float: true, dy: -27.5,
              dx: 194.5, length: 0.152, color: "blue", width: 1 },

            { column: "bandRight", kind: "contact", type: "contact",
              iconSize: 14, textOffset: 22.9,
              glyph: "blue", knockout: "paper",
              rows: [
                  { icon: "pin",      fields: ["address", "city"],
                    separator: ", " },
                  { icon: "phone",    fields: ["phone"] },
                  { icon: "envelope", fields: ["email"] }
              ] },

            { column: "main", kind: "rejoin", gapAfter: 35.1 },

            /* ---------------- full-width sections ------------------------- */
            { column: "main", kind: "section", label: "Career Objective",
              headingType: "tab", gapAfter: 25,
              body: { kind: "paragraph", field: "summary", type: "body" } },

            { column: "main", kind: "section", label: "Education",
              headingType: "tab",
              body: { kind: "entries", source: "education",
                      head: { runs: [
                          { field: "degree", type: "entryHead" },
                          { literal: " - ", type: "entryTail" },
                          { field: "dates",  type: "entryTail" }
                      ]},
                      sub: [
                          { runs: [{ field: "school", type: "entrySub" }],
                            gapBefore: 16 }
                      ],
                      entryGap: 27 } },

            /* ---------------- the local two-column band ------------------- */
            /* The divider measures x=360 in the raster, 291.4pt here. The
               reference's own rule stops short at both ends; this one spans
               the band inset by 10, which reads as the same feature and does
               not need re-measuring when the content grows. */
            { column: "main", kind: "split", x: 291.4,
              gapLeft: 6.4, gapRight: 0.8,
              rule: { color: "blue", width: 0.8, inset: 10 } },

            { column: "bandLeft", kind: "section", label: "Skills",
              headingType: "tab", gapAfter: 25,
              body: { kind: "list", field: "skills", split: "," } },

            { column: "bandLeft", kind: "section", label: "Experience",
              headingType: "tab",
              body: { kind: "entries", source: "experience",
                      /* Employer and dates on ONE line. The reference's own
                         experience is a single "Fresher" line, so it never had
                         to answer this -- but the editor's sample carries two
                         real posts, and a line each put the sheet on a second
                         page. Composed, so an entry with no dates drops the
                         separator with them. */
                      head: { runs: [{ field: "role", type: "entryHead" }] },
                      sub: [
                          { runs: [
                              { field: "company", type: "entryTail" },
                              { literal: " - ",   type: "entryTail" },
                              { field: "dates",   type: "entryTail" }
                            ], gapBefore: 16 }
                      ],
                      entryGap: 27 } },

            /* Deliberately lower than SKILLS beside it. The reference staggers
               the two tabs by 31.3pt rather than aligning them, which stops
               the pair reading as one banner across the sheet. */
            { column: "bandRight", kind: "section", label: "Parents Information",
              headingType: "tabRight", gapBefore: 52, gapAfter: 24,
              body: { kind: "fields", type: "body", labelType: "label",
                      labelWidth: "auto", separator: "  ", rowGap: 0.8,
                      rows: [
                          { label: "Father:", field: "fatherName" },
                          { label: "Mother:", field: "motherName" }
                      ] } },

            { column: "bandRight", kind: "section", label: "Languages",
              headingType: "tabRight", gapAfter: 24,
              body: { kind: "list", field: "languages", split: "\n" } },

            { column: "main", kind: "rejoin", gapAfter: 30 },

            /* ---------------- full width again ---------------------------- */
            { column: "main", kind: "section", label: "Interests",
              headingType: "tab",
              body: { kind: "list", field: "interests", split: "\n" } },

            { column: "main", kind: "section", label: "Declaration",
              headingType: "tab", gapAfter: 26,
              body: { kind: "paragraph", field: "declaration",
                      type: "bodyItalic" } },

            /* The reference closes with a handwritten signature in script.
               None of the three families is a script and the engine will not
               pretend otherwise, so this is the rule and the caption to sign
               ABOVE by hand -- the same answer boxed-biodata gives. */
            { column: "main", kind: "signoff", type: "body",
              gapBefore: 32,
              left: [],
              rule: { color: "ink", width: 0.8 },
              right: { label: "Signature" },
              rightWidth: 129.7, rightInset: 0, rightOffset: 0, rightGap: 14.4 }
        ]
    },

    {
        /* Traced from a supplied design and MEASURED off the raster rather
           than eyeballed: a serif CV on a grey sheet, with a full-width header
           of photograph and name over two columns, and an education timeline.
           Built September 19, 2026.

           IT SHIPS DESIGN-LED, NOT ATS-UNQUALIFIED. The site grants the
           unqualified claim to a sheet that is single column, carries no
           photograph, and has deterministic extraction order. This is
           two-column AND photo-led, so it fails two of the three by
           construction, and removing either would be designing a different
           sheet. grey-rail and peach-portrait set that precedent. What it
           KEEPS is the third: the blocks below are declared sidebar-first, so
           the content stream reads CONTACTS and EXPERIENCE whole and then the
           main column whole, never interleaved across the gutter. The
           timeline costs nothing at parse time -- a rule and three dots are
           vector marks an extractor does not see, so each education entry
           still extracts as a contiguous record.

           THE REFERENCE IS NOT A4, AND THE SCALE IS TAKEN OFF ITS HEIGHT.
           The raster is 736x1104 -- aspect 0.6667, a clean 2:3, which is a
           screen export ratio rather than a paper one. A4 is 0.7067. Scaling
           by WIDTH would map the sheet to 892.5pt tall, 50.5pt more than A4
           has, and that deficit would have to come out of the vertical rhythm
           -- compressing the design against itself by six percent. Scaling by
           HEIGHT costs nothing: k = 842/1104 = 0.76268 applied to both axes
           preserves every internal proportion exactly, lands the deepest ink
           at 813pt with a 29pt foot margin, and leaves the content block
           500.3pt wide, which is centred here with 47.34pt side margins. A
           differently-proportioned design has to give somewhere; giving it to
           the margins is the only option that does not distort the artwork.

           The export is also shifted 6px LEFT of centre: its rules measure 656
           wide on a 736 sheet, which is exactly symmetric 40px margins, but
           they run x=34..689 rather than 40..695. That offset is corrected
           here rather than reproduced.

           Type sizes are derived from measured WIDTHS through jsPDF's TIMES
           metrics -- times, not helvetica, because this is a serif design and
           the two have different widths per em, so a size taken through the
           wrong one breaks lines in the wrong places. Ten independent strings
           put the body between 12.27 and 13.09, mean 12.49. The reference's
           own face is NOT Times and has a taller cap for its width: its caps
           imply 16.1pt where its widths imply 14.33 for the headings. Width
           wins, because width is what decides where a line breaks.
           See docs/implementation/SERIF_TIMELINE_CV_TEMPLATE.md. */
        id: "serif-timeline",
        title: "Serif Timeline CV",
        catalog: true,

        /* The design is monochrome: near-black on grey, with no second colour
           anywhere. The accent therefore drives the DISPLAY ink -- the name,
           the section headings and every rule -- while body text stays a fixed
           near-black. At the default swatch the two are the same value, which
           is the reference; pick another and the sheet gains one colour in the
           places a two-tone design would have used it. */
        defaultAccent: "#1A1A1A",

        page: { width: 595, height: 842 },

        layout: {
            kind: "two-column",
            /* The divider measures x=244 in the raster, 207.50pt here, so the
               sidebar box is 207.50/595 = 0.34874 of the page. Left column
               text runs 47.34..177.00 and main text 232.67..547.66, which are
               the insets below.

               The sidebar's firstBaseline is the PHOTOGRAPH's top edge and is
               deliberately shallow: nothing flows in this column above the
               header, and `crossRule` levels both columns underneath it, so
               whatever is set here is replaced before the first section. */
            sidebar: {
                side: "left",
                width: 0.34874,
                /* The right inset is 5, not the 30.5 the heading rules would
                   suggest. Those rules are a fixed decorative length rather
                   than the column's width: the reference runs its email to
                   201.4pt, 24pt PAST where its rules stop and hard against the
                   divider, so the text measure is the gutter and the rule is
                   shorter than it on purpose. Taking the rules for the measure
                   made a 24-character address break mid-word. */
                left: 47.34, right: 5,
                firstBaseline: 47.3,
                bottom: 815
            },
            main: {
                left: 25.17, right: 47.34,
                firstBaseline: 80.1,
                bottom: 815
            }
        },

        palette: {
            paper:   "#EAEAEA",   /* the sheet, sampled at 234,234,234 */
            ink:     "#1A1A1A",   /* body text                         */
            display: "accent"     /* name, headings, every rule        */
        },

        background: "paper",

        type: {
            /* 32pt from the measured width of CALIPA AMINODEN, the longer and
               therefore more reliable of the two name lines. Its cap height
               implies 39 -- the reference's display face is a Didone with a
               tall cap for its width -- and matching the cap would set a name
               a fifth too wide for the column it has to fit. */
            bannerName: { family: "serif", weight: "bold", size: 32,
                          lineHeight: 47.3, color: "display" },

            /* Five headings measured 14.75 to 15.79 at width-scale, mean
               15.19, which is 14.33 here. The rule under each is part of the
               heading rather than a block of its own, so a section that draws
               no body draws neither. */
            heading:    { family: "serif", weight: "bold", size: 14.3,
                          color: "display", uppercase: true,
                          gapBefore: 36, gapAfter: 24,
                          rule: { color: "display", width: 1.2, offset: 12.6 } },

            /* Identical but for the rule, which stops at 0.8335 of the column
               -- 128.9pt, the reference's own -- because the sidebar's text
               measure runs on past it to the divider. */
            sideHeading:{ family: "serif", weight: "bold", size: 14.3,
                          color: "display", uppercase: true,
                          gapBefore: 36, gapAfter: 24,
                          rule: { color: "display", width: 1.2, offset: 12.6,
                                  length: 0.8335 } },

            /* The header's icon rows. rowGap is the measured 28.09 row pitch
               less the line height, so a row whose value wraps pushes the next
               one down by a whole line rather than overlapping it. */
            detail:     { family: "serif", weight: "normal", size: 12.5,
                          lineHeight: 17.55, color: "ink", rowGap: 10.54 },

            /* CONTACTS sets a label over its value: 16.77 between the two,
               30.51 between rows, so rowGap is that pitch less the line. */
            contact:    { family: "serif", weight: "normal", size: 12.5,
                          lineHeight: 16.77, color: "ink", rowGap: 13.74 },

            entryHead:  { family: "serif", weight: "bold", size: 12.5,
                          lineHeight: 15.5, color: "ink" },
            entrySub:   { family: "serif", weight: "normal", size: 12.5,
                          lineHeight: 15.5, color: "ink" },

            /* Two bullet roles, because the two lists are set differently in
               the reference and the difference is structural rather than
               incidental: CHARACTERISTICS runs to three-line sentences and
               needs its items further apart than its lines, SKILLS is five
               short phrases where an item gap wider than the line height would
               read as five separate paragraphs. */
            bullet:     { family: "serif", weight: "normal", size: 12.5,
                          lineHeight: 16.4, color: "ink",
                          marker: "\u2022", indent: 15.5, itemGap: 21.4 },
            skill:      { family: "serif", weight: "normal", size: 12.5,
                          lineHeight: 16.4, color: "ink",
                          marker: "\u2022", indent: 15.5, itemGap: 16.4 }
        },

        blocks: [
            /* ---------------- the header, spanning both columns ----------- */
            /* The photograph is absolute and advances no cursor. Its width is
               the reference's; its HEIGHT is not. PHOTO_RATIO is fixed at 4:5
               site-wide so no painter can stretch a face, and the reference's
               frame is 0.688 -- taller than 4:5. Keeping the width and taking
               4:5's height ends the picture 33pt higher than the reference's
               does. The alternatives were changing PHOTO_RATIO, which is
               forbidden and would reach every other template, or letterboxing,
               which puts grey bars inside a portrait. */
            { column: "sidebar", kind: "photo", top: 47.3, width: 161.7 },

            /* `split: "firstWord"` is the reference's own two-line treatment:
               forename over surnames. The rule beneath belongs to the name
               rather than to any heading. */
            { column: "main", kind: "display", field: "name",
              type: "bannerName", uppercase: true, split: "firstWord",
              fallback: "Your Name",
              rule: { color: "display", width: 1.2 },
              gapAfterBaseline: 21.7, gapAfter: 29.4 },

            { column: "main", kind: "contact", type: "detail",
              iconSize: 13, textOffset: 33.6,
              glyph: "display", knockout: "paper",
              rows: [
                  { icon: "person",   fields: ["age"] },
                  { icon: "calendar", fields: ["dateOfBirth"] },
                  { icon: "flag",     fields: ["nationality"] },
                  { icon: "pin",      fields: ["address", "city"],
                    separator: ", " }
              ] },

            /* Closes the header and starts both columns level beneath it. The
               bleed carries the rule back across the gutter to the page's left
               text margin, so one block draws what reads as one line. */
            { column: "main", kind: "crossRule", bleedLeft: 185.33,
              color: "display", width: 1.2,
              gapBefore: 26.3, gapAfter: 35.1, minY: 262 },

            /* The hairline between the columns. Absolute, and it stops short
               of the foot exactly where the reference's does. */
            { column: "main", kind: "vrule", x: 207.5, fromCursor: true,
              y1: -15.3, y2: 813, color: "display", width: 0.8 },

            /* ---------------- sidebar ------------------------------------ */
            /* Declared before the main column's sections so the content
               stream reads this column whole. */
            { column: "sidebar", kind: "section", label: "Contacts",
              headingType: "sideHeading", gapAfter: 28.6,
              body: { kind: "contact", type: "contact",
                      iconSize: 14.5, textOffset: 28.2, labelGap: 16.8,
                      glyph: "display", knockout: "paper",
                      rows: [
                          { icon: "phone",    label: "Phone:", fields: ["phone"] },
                          { icon: "envelope", label: "Email:", fields: ["email"] }
                      ] } },

            /* A marker per ENTRY rather than per line: one bullet for the job,
               with its employer and place indented past it. */
            { column: "sidebar", kind: "section", label: "Experience",
              headingType: "sideHeading", gapAfter: 24,
              body: { kind: "entries", source: "experience",
                      indent: 16, marker: "\u2022", markerType: "entryHead",
                      head: { runs: [{ field: "role", type: "entryHead" }] },
                      sub: [
                          { runs: [{ field: "company", type: "entrySub" }],
                            gapBefore: 16.8 },
                          { runs: [{ field: "place", type: "entrySub" }],
                            gapBefore: 15.6 }
                      ],
                      entryGap: 26 } },

            /* ---------------- main column -------------------------------- */
            { column: "main", kind: "section", label: "Characteristics",
              gapAfter: 24.4,
              body: { kind: "list", field: "characteristics", split: "\n" } },

            /* The timeline is driven from the entry list: a fourth row grows
               the rule and gains a dot with nothing here changing. `indent`
               moves the entries clear of it; the rule and the dots are drawn
               against the column's own edge. */
            { column: "main", kind: "section", label: "Education",
              gapAfter: 27.1,
              body: { kind: "entries", source: "education",
                      indent: 27.5,
                      timeline: { x: 4.2, width: 1.5, r: 3.8, dy: -6.5,
                                  color: "display" },
                      head: { runs: [{ field: "degree", type: "entryHead" }] },
                      sub: [
                          { runs: [{ field: "school", type: "entrySub" }],
                            gapBefore: 15.5 },
                          { runs: [{ field: "field", type: "entrySub" }],
                            gapBefore: 13.2 },
                          { runs: [{ field: "dates", type: "entrySub" }],
                            gapBefore: 13.2 }
                      ],
                      entryGap: 29 } },

            { column: "main", kind: "section", label: "Skills",
              gapAfter: 16.8,
              body: { kind: "list", type: "skill", field: "skills",
                      split: "," } }
        ]
    },

    {
        /* Traced from a supplied design, measured off the artwork rather than
           eyeballed: a two-column CV with a charcoal masthead, a circular
           portrait straddling it, and blush heading bands across both columns.
           Built September 15, 2026.

           IT SHIPS DESIGN-LED, NOT ATS-UNQUALIFIED, and that is deliberate.
           The site's documented position grants the unqualified claim to a
           sheet that is single column, carries no photograph, and has
           deterministic extraction order. This one is two-column AND
           photo-led -- the portrait is its centrepiece -- so it fails two of
           the three by construction, and removing either would be designing a
           different sheet rather than building this one. grey-rail set that
           precedent. What it DOES keep is the third: the engine emits its own
           content stream, so the sidebar extracts whole and then the main
           column extracts whole, never interleaved across the gutter.

           Measurements: the supplied raster is 736x1041 and its aspect is
           0.7070 against A4's 0.7067, so it is an uncropped page converting at
           595/736 with nothing to correct. Sizes are derived from measured
           WIDTHS through jsPDF's Helvetica metrics; where a string is
           letter-spaced the size comes from its cap height and the tracking
           from the width it has left over. See
           docs/implementation/PEACH_PORTRAIT_CV_TEMPLATE.md. */
        id: "peach-portrait",
        title: "Peach Portrait CV",
        catalog: true,

        /* The artwork's own charcoal. Every role that is not the accent is a
           fixed colour here, because this design is a two-tone scheme rather
           than an accented one -- the swatch row moves the masthead and
           nothing else, which is honest about what it controls. */
        defaultAccent: "#4A4A4A",

        page: { width: 595, height: 842 },

        layout: {
            kind: "two-column",
            /* The divider measures x=254.2, so the sidebar is 253.8 of 595 =
               0.4266. Sidebar text runs 12.9 to 248.2 and main text 269.2 to
               582.1, which are the insets below.

               `bottom` is a reservation boundary, not the last baseline. */
            sidebar: {
                side: "left",
                width: 0.4266,
                left: 13, right: 7,
                firstBaseline: 245.1,
                bottom: 815
            },
            main: {
                left: 15.4, right: 12.9,
                firstBaseline: 144,
                bottom: 815
            }
        },

        palette: {
            paper:    "#F9EEEA",   /* the whole sheet, both columns alike */
            charcoal: "#322E2F",   /* the masthead band                   */
            band:     "#F3D8C5",   /* every heading band                  */
            tan:      "#C79B80",   /* the name, on the charcoal           */
            ink:      "#2B2B2B",
            divider:  "#69605B",
            onDark:   "#FFFFFF"
        },

        /* The sheet is not white: it is a pale pink, and both columns are the
           same pale pink. There is no tinted sidebar in this design, which is
           easy to mis-see -- what separates the columns is one hairline rule.
           Sampling the two columns returns the identical value. */
        background: "paper",

        type: {
            /* 23pt with 2.55 of tracking. The cap height puts the size at
               about 23; the string measures 218.3pt where 23pt of Helvetica
               Bold is 182.6, and the 35.7 left over spread across 14 gaps is
               the tracking. Deriving the size from the width alone would have
               given 27.5 and glyphs half again too heavy. */
            bannerName: { family: "sans", weight: "bold", size: 23,
                          tracking: 2.55, color: "tan" },
            bannerRole: { family: "sans", weight: "normal", size: 11.5,
                          tracking: 3.18, color: "onDark" },

            /* Band labels. The main column's are a point larger than the
               sidebar's in the artwork -- 9.71pt of cap against 8.90 -- so
               they are two roles rather than one. */
            heading:     { family: "sans", weight: "normal", size: 12.5,
                           tracking: 2.2, color: "ink", uppercase: true,
                           /* The artwork measures 30 above a band and 27.5
                              below it. Both are opened up here, and the entry
                              gaps with them, because the MAIN column had 117pt
                              of slack left even with the densest content the
                              reference itself carries, and a shorter CV read
                              as a tight block with a band of empty paper under
                              it.

                              Opened MODERATELY: 34 and 29 against the measured
                              30 and 27.5. A first pass at 40 and 33 bought more
                              air and cost far too much fidelity -- it pushed
                              the Professional Experience band 44.8pt below
                              where the artwork puts it, where this sits 12pt
                              off. Most of the readability came from the
                              LEADING below rather than from these gaps, which
                              is why the gaps are nearly the measurement and
                              the leading is not. The sidebar gets none of it;
                              see its own note. */
                           gapBefore: 40, gapAfter: 33,
                           box: { color: "band", full: true, padX: 16.2,
                                  above: 19.4, below: 10.5 } },
            /* Deliberately NOT opened up the way the main column is. With the
               reference's own three referees the sidebar finishes at y=813.4
               against an 815 boundary -- 1.6pt of slack -- and the sidebar
               cannot paginate: the engine reports its overflow rather than
               moving it to a second page. Loosening it would silently clip a
               third referee off the foot of somebody's CV. */
            sideHeading: { family: "sans", weight: "normal", size: 11.5,
                           tracking: 2.5, color: "ink", uppercase: true,
                           gapBefore: 37, gapAfter: 28.5,
                           box: { color: "band", full: true, padX: 25.9,
                                  above: 21.9, below: 8.9 } },

            /* The lead paragraph is markedly larger than anything under it:
               15pt against 12, which is the artwork's own hierarchy. */
            lead:        { family: "sans", weight: "normal", size: 15,
                           lineHeight: 21.5, color: "ink" },

            body:        { family: "sans", weight: "normal", size: 12,
                           lineHeight: 15.3, color: "ink" },
            tagline:     { family: "sans", weight: "normal", size: 12,
                           lineHeight: 16.5, color: "ink", align: "center" },

            /* Bold, where the artwork sets the company name heavier than the
               role under it. */
            entryHead:   { family: "sans", weight: "bold", size: 12,
                           lineHeight: 18, color: "ink" },
            entrySub:    { family: "sans", weight: "normal", size: 12,
                           lineHeight: 18, color: "ink" },
            /* itemGap above lineHeight: a bullet that wraps stays one block
               while the space BETWEEN bullets opens, which is the difference
               between a list that reads and a paragraph with dots in it. */
            bullet:      { family: "sans", weight: "normal", size: 12,
                           lineHeight: 18, color: "ink",
                           marker: "\u2022", indent: 11, itemGap: 23 },
            sideContact: { family: "sans", weight: "normal", size: 12,
                           lineHeight: 16.2, color: "ink", rowGap: 8.5 }
        },

        blocks: [
            /* ---------------- masthead, drawn in the main column ---------- */
            /* Bleeds the whole page width even though it belongs to the main
               column, because the artwork runs it edge to edge behind the
               portrait. It advances no cursor: both columns set their own
               firstBaseline below it, so a template that dropped the banner
               would keep every other measurement. */
            { column: "main", kind: "banner", fill: "charcoal",
              bleed: "page", top: 12.1, height: 108.4,
              lines: [
                  { field: "name",  type: "bannerName", baseline: 55,
                    dx: 11.3, uppercase: true, fallback: "Your Name" },
                  { field: "title", type: "bannerRole", baseline: 88.2,
                    dx: 12.1, uppercase: true }
              ] },

            /* The one hairline that separates the columns. Absolute, and it
               starts below the masthead and stops short of the foot exactly
               where the artwork's does. */
            { column: "main", kind: "vrule", x: 254.2, y1: 150.4, y2: 810.5,
              color: "divider", width: 0.8 },

            /* ---------------- sidebar ------------------------------------ */
            /* Centre (131, 123) with a 102 radius, so it spans y 21 to 225
               and overlaps the masthead that ends at 119.7. `cx` is relative
               to the column box, `cy` absolute.

               The first pass had r=120 and cy=139.5, which reached y=259.5 --
               PAST the tagline's baseline at 245.1, so the sidebar's first
               line was being drawn over the photograph. It came from measuring
               the circle by its white pixels, which also matched the sheet's
               own pale paper below it; the honest measurement is the white
               ring's apex against the charcoal band (y=19.4) and the widest
               chord (204.5 across), which fix the centre and radius between
               them. The circle now clears the tagline by 20pt. */
            { column: "sidebar", kind: "photo", shape: "circle",
              cx: 131, cy: 123, r: 102,
              ring: { color: "paper", width: 7 } },

            { column: "sidebar", kind: "text", field: "tagline",
              type: "tagline" },

            { column: "sidebar", kind: "section", label: "Contact",
              headingType: "sideHeading",
              body: { kind: "contact", type: "sideContact",
                      iconSize: 12, textOffset: 38.7,
                      glyph: "ink", knockout: "paper",
                      rows: [
                          { icon: "phone",    fields: ["phone"] },
                          { icon: "envelope", fields: ["email"] },
                          { icon: "pin",      fields: ["address", "city"],
                            separator: ", " }
                      ] } },

            /* labelWidth "auto" runs the colon straight after each label, as
               the artwork does -- these are not a column of aligned colons. */
            { column: "sidebar", kind: "section", label: "Personal Information",
              headingType: "sideHeading",
              body: { kind: "fields", type: "body", labelType: "body",
                      labelWidth: "auto", separator: ": ", rowGap: 1.5,
                      rows: [
                          { label: "Date of Birth",  field: "dateOfBirth" },
                          { label: "Place of Birth", field: "placeOfBirth" },
                          { label: "Marital Status", field: "maritalStatus" },
                          { label: "Nationality",    field: "nationality" },
                          { label: "Height",         field: "height" },
                          { label: "Weight",         field: "weight" },
                          { label: "Religion",       field: "religion" }
                      ] } },

            /* Every line is "Label: Value" built from a literal run and a
               field, which is what keeps an empty one from leaving a stray
               label behind -- buildRuns drops the pair together. */
            { column: "sidebar", kind: "section", label: "Character Reference",
              headingType: "sideHeading",
              body: { kind: "entries", source: "references",
                      head: { runs: [
                          { literal: "Name: ", type: "body" },
                          { field: "name",     type: "body" }
                      ]},
                      sub: [
                          { runs: [{ literal: "Company: ", type: "body" },
                                   { field: "company",     type: "body" }],
                            gapBefore: 15.3 },
                          { runs: [{ literal: "Profession: ", type: "body" },
                                   { field: "title",          type: "body" }],
                            gapBefore: 15.3 },
                          { runs: [{ literal: "Address: ", type: "body" },
                                   { field: "refAddress",   type: "body" }],
                            gapBefore: 15.3 },
                          { runs: [{ literal: "Contact Number: ", type: "body" },
                                   { field: "phone",              type: "body" }],
                            gapBefore: 15.3 }
                      ],
                      entryGap: 24 } },

            /* ---------------- main column -------------------------------- */
            /* The lead paragraph carries no heading: the artwork opens the
               column with it, straight under the masthead. Justified, which
               the engine does by per-line TRACKING rather than word spacing,
               because tracking is the one measure both painters honour
               identically. */
            { column: "main", kind: "text", field: "summary", type: "lead",
              justify: true, gapAfter: 14 },

            { column: "main", kind: "section", label: "Educational Attainment",
              body: { kind: "entries", source: "education",
                      head: { runs: [{ field: "degree", type: "entryHead" }] },
                      sub: [
                          { runs: [{ field: "school", type: "entrySub" }],
                            gapBefore: 18 },
                          { runs: [{ literal: "School Year(s): ", type: "entrySub" },
                                   { field: "dates",              type: "entrySub" }],
                            gapBefore: 16 }
                      ],
                      entryGap: 34 } },

            { column: "main", kind: "section", label: "Professional Experience",
              body: { kind: "entries", source: "experience",
                      head: { runs: [{ field: "company", type: "entryHead" }] },
                      sub: [
                          { runs: [{ field: "role",  type: "entrySub" }],
                            gapBefore: 19 },
                          { runs: [{ field: "dates", type: "entrySub" }],
                            gapBefore: 20 },
                          { runs: [{ literal: "Work Responsibilities",
                                     type: "entrySub", keep: true }],
                            gapBefore: 17 }
                      ],
                      bullets: { field: "description", split: "\n",
                                 gapBefore: 21 },
                      entryGap: 36 } }
        ]
    },

    {
        /* Traced from a supplied design: the Indian biodata resume, where a
           filled heading box, a labelled details block and a ruled marks table
           are the whole visual grammar. Built September 15, 2026.

           IT IS ATS-COMPLIANT BY CONSTRUCTION, which is the reason several
           things below are not what the reference draws. See
           docs/implementation/BOXED_BIODATA_RESUME_TEMPLATE.md for the
           extracted-text proof; the short version is that this engine emits
           its own PDF content stream, so reading order is a decision rather
           than a renderer's guess, and a design this decorative can still
           parse as clean linear text. Three specifics worth knowing before
           editing anything here:

           - The education TABLE emits row-major. A table drawn column by
             column extracts as four unrelated lists and every qualification
             loses its board, its year and its mark. Row-major it extracts as
             records. `layoutTable` guarantees it; do not reorder it.
           - The heading boxes are a filled rect with ordinary text over it.
             They read as graphics and extract as text, which is why the most
             decorative thing on the sheet costs a parser nothing.
           - The photograph is OPT-IN and empty by default, and an unfilled
             slot never reaches the PDF at all -- paintPdf drops `photoSlot`.
             The reference shows one because this format conventionally
             carries one; US and UK screening does not want it. */
        id: "boxed-biodata",
        title: "Boxed Headings Biodata CV",
        catalog: true,

        /* The navy the reference is drawn in, and already a swatch on the
           editor's row -- which is the invariant: applyAccent matches the hex
           exactly, so a defaultAccent that is not on the row opens the editor
           with nothing selected. */
        defaultAccent: "#1F4E79",

        page: { width: 595, height: 842 },

        layout: {
            kind: "single-column",
            /* MEASURED off the supplied 736x1040 raster, whose aspect is A4
               to within a thousandth, so its pixels convert at 595/736 with no
               crop to correct for. Every number in this descriptor came out of
               that scan rather than off a proportional eyeball; the few places
               a measurement was overridden say so and why.

               The reference's rules run x=25.9 to x=565.9, so its margins are
               25.9 left and 29.1 right. That 3.2pt asymmetry is scan skew, not
               design -- nobody sets a page that way -- so it is split into a
               symmetric 27, which puts the rules within 1.2pt of the scan.

               `bottom` is a reservation boundary, not the last baseline. The
               reference's own last mark is the signature caption at 803.9,
               so 830 is the boundary that lets the sign-off block fit rather
               than the depth anything actually reaches. */
            main: {
                left: 27, right: 27,
                firstBaseline: 57.5,
                bottom: 830
            }
        },

        palette: {
            ink:         "#1A1A1A",
            headBg:      "accent",    /* the filled heading boxes and rules */
            headingInk:  "#FFFFFF",   /* knocked out of them               */
            rule:        "accent",
            /* A pale tint of the navy for the table's header band. Fixed
               rather than derived: it has to stay legible under black header
               text whatever accent the visitor picks, and a tint computed
               from a gold or burgundy accent would not. */
            tableHeadBg: "#DCE4F0"
        },

        type: {
            /* The banner word. Not a field: this design puts RESUME across the
               head of the sheet and the visitor's name in the details block
               below, which is the format's own convention. */
            /* 40pt, from the measured width: "RESUME" spans 170.6pt in the
               scan, and those six caps are 4.278 em of Helvetica Bold, which
               puts the size at 39.9. The cap height agrees once the scan's
               antialiasing is allowed for. */
            displayName: { family: "sans", weight: "bold", size: 40,
                           lineHeight: 44, color: "accent", align: "center" },

            /* The chip measures 19.4pt deep with its label's baseline 13.0pt
               below its top edge and 5.7pt above its bottom -- and the rule
               sits exactly ON that bottom edge, which is why the offset and
               `below` are the same number. Seven chips measured through
               jsPDF's Helvetica metrics put the label between 10.73 and
               11.49pt, mean 11.26, so 11.3; the left inset measures 7.3 on
               every one of them.

               gapBefore is 35 for every section but the first, which sets 26
               of its own. That is not over-fitting: the first heading follows
               a MASTHEAD and the rest follow a body, and the reference draws
               exactly that difference -- 25.9pt under the banner against 33 to
               36 everywhere else. One shared value left the top 5pt low and
               the foot 29pt high once seven sections had accumulated it. The
               remaining spread between 33 and 36 IS content-dependent, since a
               paragraph, a table and a bullet list leave different descender
               space under their last baseline, and fitting each separately
               would be false precision. */
            heading:     { family: "sans", weight: "bold", size: 11.3,
                           color: "headingInk", uppercase: true,
                           gapBefore: 35, gapAfter: 21,
                           box: { color: "headBg", padX: 7.3, above: 13, below: 5.7 },
                           /* fromBox runs the rule on from the box's right
                              edge, so the two read as one horizontal feature
                              rather than a box with a line near it. */
                           rule: { color: "rule", width: 1, offset: 5.7, fromBox: 0 } },

            /* Sizes are derived from MEASURED WIDTHS through jsPDF's own
               Helvetica metrics, never from cap heights -- a scan's
               antialiasing adds a pixel either side of a cap and throws that
               estimate by two points, which is how an earlier pass here got
               10pt for a chip that is really 11.3.

               The reference is not set in Helvetica; its face is narrower per
               em. Matching the WIDTH is what matters, because width decides
               where lines break, so every size is the Helvetica size that
               reproduces the reference's measured line widths. Two long lines
               put the body at 12.68 and 12.78, two labels put the bold at
               11.66 and 12.10; 12.5 sits inside both bands and keeps a label
               and its value visually equal.

               18.6pt leading is measured directly: the address's second line
               sits 18.6 under its first and rows sit 23.5 apart, so the 4.9
               difference is the gap BETWEEN rows rather than leading. */
            body:        { family: "sans", weight: "normal", size: 12.5,
                           lineHeight: 18.6, color: "ink" },
            fieldLabel:  { family: "sans", weight: "bold", size: 12.5,
                           lineHeight: 18.6, color: "ink" },

            /* The table's rules sit 23.5pt apart, header row included. That
               depth is the leading plus twice the cell padding below. */
            tableHead:   { family: "sans", weight: "bold", size: 11,
                           lineHeight: 14, color: "ink" },
            tableCell:   { family: "sans", weight: "normal", size: 11,
                           lineHeight: 14, color: "ink" },

            bullet:      { family: "sans", weight: "normal", size: 12.5,
                           lineHeight: 18.6, color: "ink",
                           marker: "\u2022", indent: 10, itemGap: 18.6 }
        },

        blocks: [
            /* No rule block under the banner. There appears to be one in the
               artwork and there is not: the scan's first full-width rule is at
               y=88.2, which is the PERSONAL DETAILS chip's own bottom edge.
               Drawing a second one here put a line on the page the reference
               does not have. */
            { column: "main", kind: "display", type: "displayName",
              fallback: "RESUME", uppercase: true },

            /* 26, not the 35 every other section takes: this one follows the
               banner rather than a body. */
            /* gapAfter 28.3, where a paragraph section takes the heading's
               own 21.1: the reference sets its first detail row 28.3pt under
               the rule and its objective's first line 21.1pt under one. That
               is a property of the BODY, not the heading, which is why it
               belongs on the block. */
            { column: "main", kind: "section", label: "Personal Details",
              gapBefore: 26, gapAfter: 28.3,
              /* Measured: labels start at x=33.1 against a 27pt margin, the
                 colons align at x=151.5 and the values at x=160.1. The
                 valueWidth stops the address short of the photo frame's left
                 edge at 432.5 rather than letting it run under the frame. */
              body: { kind: "fields", type: "body", labelType: "fieldLabel",
                      indent: 6.1, labelWidth: 118.4, valueWidth: 262,
                      rowGap: 4.9,
                      rows: [
                          { label: "Name",          field: "name" },
                          { label: "Father's Name", field: "fatherName" },
                          { label: "Date of Birth", field: "dateOfBirth" },
                          { label: "Mobile No.",    field: "phone" },
                          { label: "Email ID",      field: "email" },
                          /* Three fields joined, because the reference sets a
                             full postal address across two lines and the form
                             already collects it in three parts. */
                          { label: "Address",
                            fields: ["address", "city", "postcode"],
                            separator: ", " }
                      ] } },

            /* AFTER the details, not before them, and that ordering is load
               bearing. A photo block reserves its own height by pushing the
               cursor to `Math.max(cursor, top + h)`, so placed ahead of the
               section it drove the PERSONAL DETAILS heading down to y=271 the
               moment a photograph was uploaded -- invisible while the sample
               carried none, which is exactly how it shipped that way for an
               hour. Placed here the reservation lands where it belongs: it
               pushes OBJECTIVE clear of the photograph when the details are
               shorter than the frame, and does nothing when they are longer.

               `inset.left` of 423 puts its right edge on the 527pt measure's
               right margin. `top` is absolute and can be, because everything
               above it is fixed height -- a one-line banner, a rule and a
               heading -- so the frame lands beside the first detail row at
               y=138.5 whatever the visitor types.

               4:5 is not negotiable: PHOTO_RATIO is fixed site-wide precisely
               so that neither painter can ever rescale one axis against the
               other and stretch a face. The reference's frame is nearer 2:3;
               this is the closest honest fit to it. */
            { column: "main", kind: "photo",
              inset: { left: 405.5 }, top: 99, width: 110,
              border: { color: "ink", width: 1.2 } },

            /* "Career Objective" on the reference. Titled Objective because
               that is the word a parser's section dictionary carries. */
            { column: "main", kind: "section", label: "Objective",
              body: { kind: "paragraph", field: "summary" } },

            /* The table sits 8.9pt under its rule where prose sits 21.1pt
               under one, which is a property of the body rather than of the
               heading -- the same reason entry lists carry their own gapAfter
               on the other templates. */
            { column: "main", kind: "section", label: "Education",
              gapAfter: 8.9,
              body: { kind: "table", source: "education",
                      headerType: "tableHead", cellType: "tableCell",
                      headerFill: "tableHeadBg",
                      border: { color: "ink", width: 0.8 },
                      /* 14pt of leading plus 4.75 above and below is the
                         23.5pt the scan's table rules are apart. */
                      padX: 7, padY: 4.75,
                      /* Widths are FRACTIONS of the measure, so the table
                         tracks the text column instead of carrying absolute
                         numbers that would break on a narrower page. */
                      columns: [
                          { label: "Qualification",      field: "degree", width: 0.30 },
                          { label: "Board / University", field: "school", width: 0.30 },
                          { label: "Year of Passing",    field: "dates",  width: 0.20,
                            align: "center" },
                          { label: "Percentage",         field: "score",  width: 0.20,
                            align: "center" }
                      ] } },

            { column: "main", kind: "section", label: "Skills",
              body: { kind: "list", field: "skills", split: ",",
                      columns: { count: 2, split: 0.5, gutter: 18 } } },

            /* Ordinary entries, not the reference's single "Fresher" line. A
               fresher types Fresher into the job title and gets exactly that
               line, because an entry draws whatever parts of it are filled;
               anyone with real roles gets a real history. One shape serves
               both, which a free-text note would not. */
            { column: "main", kind: "section", label: "Work Experience",
              gapAfter: 13,
              body: { kind: "entries", source: "experience",
                      head: { runs: [
                          { field: "role",    type: "fieldLabel" },
                          { literal: ", ",    type: "body" },
                          { field: "company", type: "body" }
                      ]},
                      sub: [
                          { runs: [{ field: "dates", type: "body" }], gapBefore: 13 }
                      ],
                      bullets: { field: "description", split: "\n",
                                 gapBefore: 14 },
                      entryGap: 18 } },

            /* Three columns, as the reference sets them. Each bullet is a
               self-contained item, so column order cannot scramble a record
               the way it would in a table. */
            { column: "main", kind: "section", label: "Languages",
              body: { kind: "list", field: "languages", split: "\n",
                      entryList: "language",
                      columns: { count: 3, gutter: 14 } } },

            { column: "main", kind: "section", label: "Declaration",
              body: { kind: "paragraph", field: "declaration" } },

            /* Measured off the scan's foot: the Date label runs 33.1 to 75.2,
               its blank rule 80.8 to 164.9 (84.1 wide), and the signature rule
               464.0 to 553.8 (89.8 wide) with its caption under it. The 52pt
               gap above it is measured too: the declaration's own line sits at
               726.2 and the Date label at 778.0. */
            { column: "main", kind: "signoff", type: "body", gapBefore: 52,
              labelWidth: 42, ruleWidth: 84, rowGap: 23,
              rightWidth: 90, rightInset: 12, rightOffset: 8.9, rightGap: 17,
              left: [{ label: "Date" }, { label: "Place" }],
              right: { label: "Signature" },
              rule: { color: "ink", width: 0.8 } }
        ]
    },

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
    },

    {
        /* The first template that draws the visitor's photograph. Everything
           else about it is ordinary registry data -- one photo block, one
           colour bar, and the same sections every other descriptor here sets.

           THE PHOTO IS OPTIONAL AND THE SHEET IS DESIGNED FOR THAT. Upload
           nothing and the panel simply starts at CONTACT: no gap, no
           placeholder, no second layout. See the `photo` branch in
           js/resume-engine.js for why a placeholder was rejected.

           IT NEEDS NO FIELD THE FORM DID NOT ALREADY COLLECT. The contact
           rows read `email`, `phone` and `location`, which every template
           reads, rather than the four address fields grey-rail added -- so
           switching to this design from any other shows the whole document
           immediately, with only the photograph left to add. */
        id: "photo-rail",
        title: "Photo Profile CV",
        catalog: true,

        /* Navy, and live: the panel is a pale tint that does NOT track the
           accent, but the icon discs, every heading, the first bar segment
           and the block behind the photograph all do, so the swatch row
           recolours the sheet's whole identity rather than one rule. The
           panel stays fixed because it is the ground those elements are read
           against -- tinting it with the accent as well would collapse the
           contrast the sidebar depends on at three of the five swatches.

           THE HEX IS THE ROW'S NAVY, not a navy chosen for this design. Every
           `defaultAccent` must be a swatch on resume.html's row -- the
           invariant is written on the row itself, and check 1m in
           tests/verify-layout.js enforces it now. This template shipped for
           an afternoon with #1B2A4A, which is not on the row: it opened with
           no swatch showing as selected, and the moment the visitor tried
           another colour the template's own navy was unreachable forever.
           A NEW swatch was the other option and was rejected -- #1B2A4A and
           the row's #1F4E79 are both navy, so it would have put two almost
           identical blues side by side to serve one template. */
        defaultAccent: "#1F4E79",

        page: { width: 595, height: 842 },

        layout: {
            kind: "two-column",
            /* A left panel, the side the eye reaches first, because the
               photograph is the reason to choose this design. 0.355 of 595
               is 211.2pt: wide enough for a 167pt photograph with margins
               that still read as margins. */
            sidebar: {
                side: "left",
                width: 0.355,
                background: "panel",
                left: 22, right: 22,
                /* An ordinary text baseline, and deliberately the SAME as the
                   main column's: with no photograph uploaded the panel's
                   first heading sits level with the name, which is where a
                   heading belongs. The photograph does not use this -- it is
                   placed absolutely by its own `top` -- so the two cases are
                   independent instead of one coordinate having to mean a box
                   top for one and a baseline for the other. It did mean both
                   for an afternoon, and the no-photo panel started 54pt too
                   high as a result. */
                firstBaseline: 86,
                bottom: 806
            },
            main: {
                left: 30, right: 34,
                firstBaseline: 86,
                bottom: 806
            }
        },

        palette: {
            panel:      "#EEF1F6",
            accentRole: "accent",   /* discs, headings, bar, photo backdrop */
            display:    "#14161C",  /* the name, deliberately not the accent */
            ink:        "#14161C",
            body:       "#4C525E",
            sidebarInk: "#2B313C",
            onAccent:   "#FFFFFF"
        },

        type: {
            displayName:    { family: "sans", weight: "bold",   size: 26,
                              lineHeight: 26, color: "display" },
            /* Bold and small under a 26pt name: a second line at reading
               weight disappears against it, and a second large one reads as
               part of the name. */
            titleLine:      { family: "sans", weight: "bold",   size: 8.5,
                              lineHeight: 11, color: "body" },
            heading:        { family: "sans", weight: "bold",   size: 10.5,
                              color: "accentRole", uppercase: true,
                              gapBefore: 25, gapAfter: 15,
                              rule: { color: "accentRole", width: 0.8, offset: 4 } },
            sidebarHeading: { family: "sans", weight: "bold",   size: 10,
                              color: "accentRole", uppercase: true,
                              gapBefore: 24, gapAfter: 14,
                              rule: { color: "accentRole", width: 0.8, offset: 4 } },
            entryHead:      { family: "sans", weight: "bold",   size: 9.5, color: "ink" },
            entryMeta:      { family: "sans", weight: "normal", size: 8.5, color: "body" },
            entrySub:       { family: "sans", weight: "bold",   size: 8.5, color: "accentRole" },
            body:           { family: "sans", weight: "normal", size: 8.8,
                              lineHeight: 11.5, color: "body" },
            bullet:         { family: "sans", weight: "normal", size: 8.8,
                              lineHeight: 11.5, color: "body",
                              marker: "•", indent: 8, itemGap: 12.5 },
            /* The panel's own scale. Smaller than the main column's by a
               point: a 211pt column at the main column's size wraps a job
               title onto three lines. */
            sidebarHead:    { family: "sans", weight: "bold",   size: 8.8, color: "ink" },
            sidebarSub:     { family: "sans", weight: "normal", size: 8.2,
                              lineHeight: 10.5, color: "sidebarInk" },
            sidebarItem:    { family: "sans", weight: "normal", size: 8.4,
                              lineHeight: 10.8, color: "sidebarInk",
                              marker: "•", indent: 7, itemGap: 10.8 },
            /* layoutContact reads this role BY NAME, so a photo template
               without it draws no contact rows at all. */
            sidebarContact: { family: "sans", weight: "normal", size: 8.2,
                              lineHeight: 10.5, color: "sidebarInk", rowGap: 11 }
        },

        blocks: [
            /* 167pt wide is the panel's full inner width, so the photograph
               spans the panel edge to edge inside its margins and the design
               does not depend on a second horizontal measurement. The height
               follows from PHOTO_RATIO: 208.75pt, a quarter of the page.

               The backdrop is offset UP AND LEFT into the panel's own margin,
               which is the only direction with room for it, and it is drawn
               in the accent so the corner reads as part of the colour scheme
               rather than as a misregistered print. */
            { column: "sidebar", kind: "photo",
              top: 32, width: 167, gapAfter: 20,
              backdrop: { color: "accentRole", dx: -11, dy: -13 } },

            /* Discs, not bare glyphs: the panel is pale, so a glyph drawn
               straight onto it in the accent is a small dark smudge at 13pt.
               A filled disc in the accent with the glyph knocked out of it in
               white is the chip the reference artwork draws, and `knockout`
               defaults to the disc so nothing else needs saying.

               The rows are this section's BODY rather than a bare block,
               which is what puts a CONTACT heading over them -- and what
               makes the heading vanish with the rows on a document that has
               no contact details in it. `phoneAlt` rides along with `phone`
               so a visitor who filled it in for grey-rail keeps it here; it
               contributes nothing when empty. */
            { column: "sidebar", kind: "section", label: "Contact",
              headingType: "sidebarHeading", gapAfter: 16,
              body: { kind: "contact",
                      iconSize: 13, textOffset: 21,
                      disc: "accentRole", glyph: "onAccent",
                      rows: [
                          { icon: "envelope", fields: ["email"] },
                          { icon: "phone",    fields: ["phone", "phoneAlt"],
                            separator: ", " },
                          { icon: "pin",      fields: ["location"] }
                      ] } },

            { column: "sidebar", kind: "section", label: "Skills",
              headingType: "sidebarHeading",
              body: { kind: "list", field: "skills", split: ",",
                      type: "sidebarItem" } },

            /* Education sits in the panel on this design, where every other
               template sets it in the main column: it is short, it is
               structured, and it is what balances a panel whose top quarter
               is a photograph. */
            { column: "sidebar", kind: "section", label: "Education",
              headingType: "sidebarHeading", gapAfter: 13,
              body: { kind: "entries", source: "education",
                      head: { runs: [{ field: "degree", type: "sidebarHead" }] },
                      sub: [
                          { runs: [{ field: "school", type: "sidebarSub" }],
                            gapBefore: 11 },
                          { runs: [
                              { field: "dates", type: "sidebarSub" },
                              { literal: " - ", type: "sidebarSub" },
                              { field: "place", type: "sidebarSub" }
                          ], gapBefore: 10.5 }
                      ],
                      entryGap: 15 } },

            { column: "sidebar", kind: "section", label: "Languages",
              headingType: "sidebarHeading",
              body: { kind: "list", field: "languages", split: "\n",
                      type: "sidebarItem", entryList: "language" } },

            /* One line, never split: this masthead sets the whole name at one
               size against the panel, so the two-line stack grey-rail uses
               would push the bar and the summary down a full line for no
               gain. */
            { column: "main", kind: "display", field: "name", type: "displayName",
              uppercase: true, fallback: "Your Name", gapAfter: 15 },

            { column: "main", kind: "text", field: "title", type: "titleLine" },

            /* The masthead's signature. Four segments opening on the accent
               and running to a violet, so the accent is where the eye lands
               and the rest is a gradient away from it. The three fixed
               colours are chosen to read against every swatch on the row. */
            { column: "main", kind: "bar",
              height: 4.5, gapBefore: 12,
              colors: ["accentRole", "#2F6FD0", "#23B0C9", "#7A4BC0"] },

            { column: "main", kind: "section", label: "Professional Summary",
              body: { kind: "paragraph", field: "summary" } },

            { column: "main", kind: "section", label: "Experience",
              gapAfter: 13,
              body: { kind: "entries", source: "experience",
                      head:  { runs: [{ field: "role", type: "entryHead" }] },
                      aside: { runs: [{ field: "dates", type: "entryMeta" }] },
                      sub: [
                          { runs: [
                              { field: "company", type: "entrySub" },
                              { literal: ", ",    type: "entrySub" },
                              { field: "place",   type: "entrySub" }
                          ], gapBefore: 11.5 }
                      ],
                      bullets: { field: "description", split: "\n", gapBefore: 13 },
                      entryGap: 17 } },

            { column: "main", kind: "section", label: "Projects",
              gapAfter: 13,
              body: { kind: "entries", source: "projects",
                      head:  { runs: [{ field: "name", type: "entryHead" }] },
                      aside: { runs: [{ field: "dates", type: "entryMeta" }] },
                      sub: [
                          { runs: [{ field: "role", type: "entrySub" }],
                            gapBefore: 11.5 }
                      ],
                      bullets: { field: "description", split: "\n", gapBefore: 13 },
                      entryGap: 17 } },

            /* The reference artwork sets CERTIFICATIONS and AWARDS as two
               sections. They are ONE here, reading the `accomplishments`
               field the editor already collects, because splitting them would
               mean a new form field whose only purpose is to decide which of
               two identical lists a line appears under. One list, one
               heading, one place to type. */
            { column: "main", kind: "section", label: "Certifications and Awards",
              body: { kind: "list", field: "accomplishments", split: "\n" } },

            { column: "main", kind: "section", label: "References",
              gapAfter: 13,
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
                          ], gapBefore: 11.5 }
                      ],
                      entryGap: 16 } }
        ]
    },
    {
        /* Traced from a supplied reference at A4, and the first template here
           that the registry could not carry alone: two capabilities went into
           the engine for it, both narrow, both documented where they live.

           Its shape is five ruled bands, each with its heading in a left
           GUTTER and its content in a column beside it, under a masthead whose
           photograph and name sit side by side. Every other template in this
           file stacks its heading above its body, which is why
           `type.heading.gutter` had to exist; and every other one that carries
           a photograph puts it in a sidebar the main column never sees, which
           is why `inset` had to.

           See docs/implementation/LABELLED_SECTIONS_CV.md. */
        id: "label-rail",
        title: "Labelled Sections CV",
        catalog: true,

        /* No defaultAccent, for the reason `classic` declares none: this
           design has no opinion about colour, so arriving on its catalog card
           must not reset the accent a returning visitor chose.

           The display name, the headings and the rules nevertheless name the
           ACCENT role rather than ink. The reference is pure near-black, and
           an untouched document's accent IS #1A1A1A -- so it opens monochrome,
           exactly as traced, while the editor's swatch row still does
           something. A template that named no accent role anywhere would
           present a live control that changes nothing, which is the worse of
           the two ways to be faithful. */

        page: { width: 595, height: 842 },

        layout: {
            kind: "single-column",
            /* The TEXT column, 42 to 553. The rules are wider than it on both
               sides -- they run 26.8 to 568.4 on the reference -- and that
               bleed is carried by the heading's own rule spec rather than by
               widening the column, because widening it would move the gutter
               labels out with it.

               `bottom` is a reservation boundary, not the last baseline:
               ensureRoom breaks the page when baseline + lineHeight passes it,
               so the deepest line this template sets is 838 - 22 = 816.

               The reference's own last baseline is at 825, which this engine
               cannot reach: 825 + 22 is past the paper. That is the line-height
               reservation being conservative, and it is the right kind of
               conservative -- a CV whose last line sits 6mm from the edge is
               one many printers clip. 816 puts it at 9mm and still fits the
               content volume the reference itself carries on one page. */
            main: {
                left: 42, right: 42,
                firstBaseline: 86,
                bottom: 838
            }
        },

        palette: {
            ink:   "#1A1A1A",   /* body, entries, bullets -- never the accent */
            /* What fills the hollows in a contact glyph. These sit straight on
               the sheet with no disc behind them, so the knockout has to be
               the sheet's own white or the pin's hole comes out black. */
            sheet: "#FFFFFF"
        },

        type: {
            displayName: { family: "sans", weight: "bold", size: 29,
                           lineHeight: 33, color: "accent" },

            /* The five gutter labels. `gutter.width` is what the label wraps
               inside -- the longest of them sets two lines on the reference,
               which is the measurement that fixes this number -- and 127 is
               the distance from the label's own x to the body column's.

               gapBefore is the space from a band's last line to the NEXT
               band's rule; ruleBefore.gapAfter is the space from that rule
               down to the first baseline of both the label and the body. The
               reference hand-sets those at 15 to 18 and 21 to 32
               respectively; one value each is used here, because a rhythm
               that varies per band for no expressible reason is a defect to
               inherit rather than a feature. */
            heading:     { family: "sans", weight: "bold", size: 12.5,
                           color: "accent", uppercase: true,
                           gapBefore: 16,
                           gutter: { width: 127, lineHeight: 18 },
                           /* TWO strokes, not one, and it took two passes to
                              read them correctly.

                              Above the label gutter the reference shows a
                              SHORT rule with white below it and a second line
                              under that; to the right of the gutter there is a
                              single hairline. Measured at 736px for a 595pt
                              page: the short one is solid black, one pixel,
                              and stops at x 169 -- exactly where the body
                              column begins. The long one is a pixel that never
                              reaches full black, and it sits 3px below the
                              short one at the left edge.

                              Read first as ONE heavy rule over the gutter,
                              which is what a single row of pixels says if you
                              only sample one. A column through the band says
                              otherwise: dark, light, dark. Two strokes with a
                              gap, not one thick one.

                              Both `length` values come from a column that runs
                              42 to 553: 26.8 to 169 for the short rule, 26.8
                              to 568.4 for the long one. */
                           ruleBefore: [
                               { color: "accent", width: 1, dy: -2.4,
                                 bleedLeft: 15.2, length: 0.2702 },
                               { color: "accent", width: 0.7, gapAfter: 22,
                                 bleedLeft: 15.2, length: 1.0293 }
                           ] },

            body:        { family: "sans", weight: "normal", size: 11,
                           lineHeight: 22, color: "ink" },

            /* 22 everywhere: the reference's paragraph lines, its experience
               bullets and its skills bullets are all 22 apart, so the whole
               sheet keeps one rhythm and a band's height is always a whole
               number of them. */
            bullet:      { family: "sans", weight: "normal", size: 11,
                           lineHeight: 22, color: "ink",
                           marker: "•", indent: 12, itemGap: 22 },

            entryHead:   { family: "sans", weight: "bold",   size: 11, color: "ink" },
            /* The dates, ranged right on the head's own baseline. Bold, which
               is the reference's own weight for them and is what makes the two
               ends of that line read as one. */
            entryDate:   { family: "sans", weight: "bold",   size: 11, color: "ink" },
            entryMeta:   { family: "sans", weight: "normal", size: 11, color: "ink" },
            entrySub:    { family: "sans", weight: "normal", size: 11, color: "ink" },

            /* The two masthead rows. Tighter than the body: they are one line
               each and a 22pt leading between a location and a phone number
               would open a hole in the middle of the masthead. */
            sidebarContact: { family: "sans", weight: "normal", size: 11,
                              lineHeight: 14, color: "ink", rowGap: 15 }
        },

        blocks: [
            /* The masthead is THREE blocks in one column and they end up side
               by side, which is worth reading once because nothing else in
               this file does it.

               The name and the contact rows are `inset` past the photograph's
               width, so they set to the right of it. They come FIRST so that
               they advance the cursor themselves; the photo block then follows
               and only ever pushes the cursor DOWN -- `Math.max(cursor, top +
               h + gapAfter)` -- so whichever of the two sides is taller closes
               the masthead. No second pass, and no third column.

               With NO photograph the block draws a short prompt and does not
               advance the cursor at all, so the masthead closes up to whatever
               the text needed. The inset stays either way, deliberately:
               adding a photograph then does not reflow the sheet, and the
               prompt marks the space it will occupy. The prompt is preview
               only -- paintPdf returns on it -- so an export with no photo has
               clean white there rather than a placeholder. */
            { column: "main", kind: "display", field: "name", type: "displayName",
              uppercase: true, fallback: "Your Name",
              inset: { left: 141 }, gapAfter: 36 },

            /* Bare glyphs on the sheet, no discs: this design draws a solid
               pin and a solid handset rather than the chips photo-rail sets in
               its pale panel. Inset 10pt further than the name, which is where
               the reference hangs them. */
            { column: "main", kind: "contact",
              inset: { left: 151 },
              iconSize: 12, textOffset: 20,
              glyph: "ink", knockout: "sheet",
              rows: [
                  { icon: "pin",      fields: ["location"] },
                  { icon: "phone",    fields: ["phone", "phoneAlt"], separator: ", " },
                  /* Not on the reference, which carries no email address.
                     Drawn only when there is one to draw, and a CV without an
                     email address is the rarer document. */
                  { icon: "envelope", fields: ["email"] }
              ] },

            /* 110 wide, not the reference's 119. PHOTO_RATIO is 4/5 and is not
               a template's to choose -- js/resume.js crops every upload to it,
               and a descriptor naming both dimensions could stretch a face
               silently. The reference's box is close to square, so one of the
               two had to give: the width was kept near enough to hold the
               name's own x, and the height that 4/5 then forces (137.5) still
               clears the first rule. */
            { column: "main", kind: "photo", top: 48, width: 110,
              /* 1.6, because that is what the reference draws: a 2px frame at
                 736px for a 595pt page. At 1 it is there in the export and
                 all but invisible in the preview, where the sheet is scaled
                 to fit a pane -- a keyline that only exists at full size is a
                 keyline the visitor has no way to trust. */
              border: { color: "ink", width: 1.6 } },

            { column: "main", kind: "section", label: "Objective",
              body: { kind: "paragraph", field: "summary" } },

            { column: "main", kind: "section", label: "Experience",
              body: { kind: "entries", source: "experience",
                      head: { runs: [
                          { field: "role",    type: "entryHead" },
                          { literal: ", ",    type: "entryHead" },
                          { field: "company", type: "entryHead" }
                      ]},
                      /* Flush right on the head's own baseline. */
                      aside: { runs: [{ field: "dates", type: "entryDate" }] },
                      sub: [
                          { runs: [{ field: "place", type: "entryMeta" }],
                            gapBefore: 16 }
                      ],
                      bullets: { field: "description", split: "\n",
                                 type: "bullet", gapBefore: 25 },
                      entryGap: 26 } },

            /* The SCHOOL is the head here, where classic leads with the
               degree. That is the reference's own order, and it is the one
               that degrades well: this design is as likely to be used by
               somebody with no degree to name as by somebody with one, and a
               head that is empty half the time drops its whole line. The
               degree still sets, on the line under it, and is skipped without
               consuming its gap when there is none. */
            { column: "main", kind: "section", label: "Education",
              body: { kind: "entries", source: "education",
                      head: { runs: [{ field: "school", type: "entryHead" }] },
                      sub: [
                          { runs: [{ field: "degree", type: "entryMeta" }],
                            gapBefore: 21 },
                          { runs: [
                              { field: "dates", type: "entryMeta" },
                              { literal: ", ",  type: "entryMeta" },
                              { field: "place", type: "entryMeta" }
                          ], gapBefore: 21 }
                      ],
                      entryGap: 20 } },

            /* The fourth band reads `accomplishments` under a heading of its
               own. A block's label is free text, so this costs nothing; adding
               a form field to carry one template's wording would put a control
               on every other template's form. */
            { column: "main", kind: "section", label: "Personal Attributes",
              body: { kind: "list", field: "accomplishments", split: "\n" } },

            { column: "main", kind: "section", label: "Skills",
              body: { kind: "list", field: "skills", split: "," } }
        ]
    }
];

