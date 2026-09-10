/* ==========================================================================
   TemplateBox - Poster & Canvas Creator Core Logic

   Responsibilities: strict client-side image mime-type validation, HTML5
   Canvas composition (photo, matte, frame, text elements), a linear undo/redo
   history, real-time localStorage retention, and a multi-format export matrix
   (PNG / JPG / PDF / SVG / PPTX) at named paper sizes.

   Depends on: js/app.js (TB.sanitize, TB.desanitize, TB.storageGet/Set,
   TB.markSaved). jsPDF is loaded by poster.html and used only for PDF.

   ARCHITECTURE NOTE. This replaced a three-field form (photo, one caption
   string, frame style) drawing a fixed 1200x1500 canvas. The single change
   that everything else here depends on is that the caption stopped being an
   <input> value read at draw time and became a list of text ELEMENTS, each
   carrying its own style object. One model is read by the canvas renderer AND
   by every export path, rather than each export re-deriving typography from
   the DOM -- which is what makes "what you see is what downloads" true across
   five formats instead of only the one the preview happens to use.
   ========================================================================== */

"use strict";

(() => {

    /* v1 was {caption, frame}. v2 adds the element list, paper size and doc
       name. The key is deliberately NOT bumped: a v1 record still loads (see
       migrate()), because bumping it would silently discard the saved work of
       every visitor mid-poster at deploy time. */
    const STORAGE_KEY = "tb_poster_v1";

    /* Named paper sizes in millimetres. The descriptions are shown in the
       download panel so the choice is about the job rather than the numbers. */
    const PAPER = {
        A4: { w: 210, h: 297, label: "A4", note: "Small art prints, certificates, desktop frames" },
        A3: { w: 297, h: 420, label: "A3", note: "Medium prints, small wall posters, gallery walls" },
        A2: { w: 420, h: 594, label: "A2", note: "Standard wall posters and hallways" },
        A1: { w: 594, h: 841, label: "A1", note: "Large feature wall art and statement prints" },
        A0: { w: 841, h: 1189, label: "A0", note: "Oversized promotional and exhibition posters" }
    };

    /* Export resolution. 300 DPI is the print standard, but A0 at 300 DPI is
       9933 x 14043 = 139 megapixels, which is roughly 558 MB of RGBA and fails
       on the canvas size limits of every browser well before it fails on
       memory. So the requested DPI is honoured until the long edge hits this
       cap, then the effective DPI is reduced and REPORTED -- the panel shows
       the pixel dimensions and the DPI actually used, never the one asked for.
       Quietly returning a smaller file than the label promises is the kind of
       thing this project treats as a defect, not a rounding detail. */
    const MAX_EXPORT_EDGE = 8000;
    const DEFAULT_DPI = 300;

    /* Preview resolution. Independent of export: the visible canvas only has
       to look right on screen, and rendering an A0 at export scale for every
       keystroke would make typing unusable. */
    const PREVIEW_LONG_EDGE = 1400;

    /* Curated to fonts that are actually available: the two the page already
       loads plus system faces. A dropdown offering a face the renderer would
       silently substitute is a lie the export makes visible. */
    const FONTS = [
        { id: "playfair", label: "Playfair Display", stack: '"Playfair Display", Georgia, serif' },
        { id: "inter", label: "Inter", stack: '"Inter", system-ui, sans-serif' },
        { id: "georgia", label: "Georgia", stack: 'Georgia, "Times New Roman", serif' },
        { id: "times", label: "Times New Roman", stack: '"Times New Roman", Times, serif' },
        { id: "arial", label: "Arial", stack: "Arial, Helvetica, sans-serif" },
        { id: "verdana", label: "Verdana", stack: "Verdana, Geneva, sans-serif" },
        { id: "trebuchet", label: "Trebuchet MS", stack: '"Trebuchet MS", Tahoma, sans-serif' },
        { id: "courier", label: "Courier New", stack: '"Courier New", Courier, monospace' },
        { id: "impact", label: "Impact", stack: "Impact, Haettenschweiler, sans-serif" }
    ];

    const FRAME_STYLES = {
        none: { frame: null, trim: null, label: "No frame" },
        black: { frame: "#111111", trim: "#111111", label: "Solid Black" },
        wood: { frame: "#7B5B3A", trim: "#5E4426", label: "Matte Wood" },
        gold: { frame: "#C9A227", trim: "#A5841C", label: "Polished Gold" },
        /* Not a frame in the sense the other four are: it replaces the whole
           page layout rather than wrapping the photo panel, so paint() branches
           on `layout` before it reads `frame` or `trim`. It lives in this map
           anyway because the frame select is built from these keys and migrate()
           validates the saved style against them, so a fifth entry needs no new
           control, no new persisted field and no migration step. */
        hearts: {
            frame: null, trim: null, label: "Queen and King of Hearts",
            layout: "card", suit: "hearts", ranks: { head: "Q", foot: "K" }
        },
        /* The other three suits cost a pip path, an ink and a default pairing
           each -- no second renderer, which is the return on having made the
           first one a layout rather than a special case.

           The red suits lead with the queen and the black with the king. That
           is arbitrary, but it is the pattern the first two shipped with, and
           it gives the four catalog cards four different titles rather than
           the same one in four colours. The pairing is only a starting point:
           both corners are editable on every one of them. */
        spades: {
            frame: null, trim: null, label: "King and Queen of Spades",
            layout: "card", suit: "spades", ranks: { head: "K", foot: "Q" }
        },
        diamonds: {
            frame: null, trim: null, label: "Queen and King of Diamonds",
            layout: "card", suit: "diamonds", ranks: { head: "Q", foot: "K" }
        },
        clubs: {
            frame: null, trim: null, label: "King and Queen of Clubs",
            layout: "card", suit: "clubs", ranks: { head: "K", foot: "Q" }
        },
        /* A second card LAYOUT rather than a fifth suit: the panel is split
           diagonally and holds two photographs, the lower one turned upside
           down the way a court card's halves oppose each other. It reuses the
           corner indices, the pip and the rank fields wholesale -- the only
           thing it replaces is what happens inside the panel. */
        split: {
            frame: null, trim: null, label: "Queen and King, Two Photos",
            layout: "split", suit: "hearts", ranks: { head: "Q", foot: "K" }
        },
        /* A third layout, and the first one that is not a playing card: a phone
           search-results screen with a masonry of six photographs in it. It
           carries `suit` for the row of pips along its foot -- the same traced
           heart the card layouts use -- and no `ranks`, because it has no
           corner indices for them to fill. */
        browser: {
            frame: null, trim: null, label: "Search Screen, Six Photos",
            layout: "browser", suit: "hearts"
        }
    };

    /* Geometry for the card layout, traced from the supplied A4 artwork
       (595.3 x 841.9 pt) and stored as fractions of the page rather than
       points, so one set of numbers serves every paper size and both the
       preview and the export scale -- the same reason text elements are
       fractional.

       The artwork's two corner indices are not exact mirrors of each other:
       the top margin above the Q is 120.4pt against 117.5pt below the K, which
       reads as hand placement rather than intent. This draws the bottom-right
       index as a true mirror of the top-left one; the 2.9pt difference is a
       third of a millimetre on A4. */
    const CARD = {
        panel: { x: 74.5 / 595.3, y: 59.1 / 841.9, w: 446.3 / 595.3, h: 724.5 / 841.9 },
        rule: 4 / 595.3,
        pip: { x: 11 / 595.3, y: 120.4 / 841.9, w: 55.6 / 595.3, h: 50.9 / 841.9 },
        /* The artwork sets its rank at 83.6676pt in Algerian. Playfair Display,
           the face substituted for it, is about 18 per cent wider at the same
           em -- enough that a Q ends 2.8pt PAST the panel edge and a K clears
           it by 3.8pt against the pip's 7.9pt. So the substituted face is set
           at the em that puts its Q on the pip's right edge, which is where
           the artwork puts its own: 70.1pt. Carrying the artwork's number over
           unchanged is what put the letters into the photograph. */
        rank: { x: 10.99 / 595.3, baseline: 94.55 / 841.9, size: 70.1 / 595.3 },
        red: "#BE1E2D",
        ink: "#000000"
    };

    /* The split layout, traced from the "Cards - 21" artwork, which is drawn on
       the same A4 page as the one above and shares its panel, its corner
       indices and its pip. Two things differ: the panel is cut by a diagonal
       seam into regions that take a photograph each, and the rule is 8pt
       against the other's 4 -- which is why this carries its own `rule` rather
       than reading CARD's.

       The seam is expressed against the PANEL rather than the page, because it
       runs from the panel's left edge to its right edge and has to stay on
       them at every paper size. */
    const SPLIT = {
        rule: 8 / 595.3,
        seam: { left: 171.8 / 724.5, right: 572.8 / 724.5 },
        upper: "#BE1E2D",
        lower: "#00AEEF"
    };

    /* The search-screen layout, traced from the "browser frame" artwork -- an
       HTML/CSS build of a 595.28 x 841.89 artboard, which is the same A4 page
       the card layouts are drawn on.

       Kept in the ARTBOARD'S OWN POINTS rather than as page fractions, unlike
       CARD and SPLIT above. There are about forty numbers here against those
       two's dozen, and every one of them can be read straight off the source
       Style.css and checked; written as `x / 595.28` each they become forty
       divisions that all have to be trusted rather than read. gridRects() and
       paintScreen() convert with one factor per axis, which is the same
       arithmetic the fractions were doing, done once instead of at every
       constant.

       `current: 1` is the artwork's own selected tab: Images, which is the tab
       a page full of photographs would be on. The strip is clipped at
       right: 527, which is where the artboard cuts "Forums" off after "For" --
       a detail rather than an accident, and the thing that makes the mockup
       read as a screenshot of something wider than the paper. */
    const SCREEN = {
        page: { w: 595.28, h: 841.89 },
        lab: { x: 89, y: 32, w: 23, h: 24 },
        logo: { x: 242.5, y: 29, w: 109.5, h: 37 },
        /* A photograph slot in its own right, not a decoration: it is the
           account picture, and the one place on this poster where a face
           belongs. Empty, it falls back to the theme's own flat circle. */
        avatar: { cx: 489.95, cy: 47.4, r: 19.51 },
        pill: { x: 87.1, y: 83.9, w: 422.6, h: 53.1 },
        search: { x: 103, y: 98.5, w: 22.5, h: 24 },
        mic: { x: 412.5, y: 97, w: 19.5, h: 25.5 },
        lens: { x: 467.5, y: 97, w: 26, h: 25.5 },
        query: { x: 144.4, baseline: 117.27, size: 19.4, right: 394.5 },
        tabs: {
            x: 87.3, baseline: 171.52, size: 17.2, gap: 28.8, right: 527,
            underline: { y: 181.34, h: 2, pad: 1.4 },
            items: ["All", "Images", "Videos", "News", "Short Videos", "Forums"],
            current: 1
        },
        rule: { x: 66.96, y: 194.93, w: 461.74, h: 0.75 },
        /* Two columns of six cards between them, described by their column
           rhythm rather than listed as six rectangles: the heights and the two
           different gaps are the artwork's, and deriving the tops from them is
           what keeps a change to one card from silently leaving a hole under
           it. The two gaps really do differ by a third of a point. */
        grid: {
            x: 75.78, y: 204.91, colW: 216.04, gutter: 10.76, radius: 12,
            cols: [
                { gap: 23.35, cards: [216.04, 144.5, 120.74] },
                { gap: 23.02, cards: [157.06, 157.06, 167.4] }
            ]
        },
        pips: { y: 756, w: 45.5, h: 39.5, x: [182, 241.95, 299.24, 356.18] }
    };

    /* Every colour on the search screen, and NOTHING else -- the geometry above
       is shared, so the two themes cannot drift apart in layout however much
       they differ in ink. Adding a third would be one entry here.

       `dark` is the supplied artwork exactly. `light` is the same screen in
       daylight rather than an inversion: a straight negative would put pure
       black on pure white and a #B1A9A8 pill on it, which is not what a light
       search page looks like. These are the greys the real thing uses.

       Two of them are worth their own line.

       `card` is what an EMPTY photo card is filled with, and it is the one
       value that cannot simply be carried across. White cards on near-black
       paper are the artwork; white cards on a white page are invisible, so the
       light theme fills them with the same grey as its search pill and the
       masonry still reads as a masonry before a single photograph is uploaded.

       `pip` mirrors a decision already recorded for the dark theme, in the
       other direction. The artwork's hearts are #E93625, lighter than the card
       layouts' #BE1E2D, because a dark ground needs a lighter red to read as
       red at all. On white paper that argument reverses, so the light theme
       uses the card layouts' own red -- which is the red this site already
       prints on white. */
    const SCREEN_THEMES = {
        dark: {
            label: "Dark",
            bg: "#070807",
            chrome: "#FFFFFF",
            pill: "#4E5257",
            searchIcon: "#B9BAC0",
            icon: "#CCCED3",
            query: "#CCCED3",
            tabIdle: "#9AA0A6",
            rule: "#FFFFFF",
            ruleAlpha: 0.81,
            avatar: "#FFFFFF",
            card: "#FFFFFF",
            pip: "#E93625"
        },
        light: {
            label: "Light",
            bg: "#FFFFFF",
            chrome: "#202124",
            pill: "#F1F3F4",
            searchIcon: "#5F6368",
            icon: "#5F6368",
            query: "#202124",
            tabIdle: "#5F6368",
            rule: "#DADCE0",
            ruleAlpha: 1,
            avatar: "#DADCE0",
            card: "#F1F3F4",
            pip: "#BE1E2D"
        }
    };

    const DEFAULT_SCREEN_THEME = "dark";

    function screenTheme() {
        return SCREEN_THEMES[state.screenTheme] || SCREEN_THEMES[DEFAULT_SCREEN_THEME];
    }

    /* Six cards in the masonry, plus the account circle above the search bar,
       which is a seventh photograph and not a decoration.

       Two constants rather than one because they answer different questions.
       GRID_SLOTS is how many cards the masonry has, and it is what the upload
       fills in order and what the preview numbers. SLOT_COUNT is how long the
       photo array is. The circle is last so that every index the grid uses
       keeps the number it already had -- a card the visitor knows as "card 3"
       must not become card 4 because a slot was added in front of it. */
    const GRID_SLOTS = 6;
    const AVATAR_SLOT = 6;
    const SLOT_COUNT = 7;

    /* The artwork's icons, kept in their SOURCE files' own coordinates and
       viewBoxes rather than normalised to a unit box like the suit pips above.
       Nothing here was retyped: each `d` is verbatim from the design folder, so
       there is no transcription to get wrong, and the placement is a transform
       instead. drawArt() and artSVG() build the same transform from the same
       four numbers, which is what keeps the canvas and the SVG export from
       disagreeing -- the drift this editor has already been bitten by once.

       The Google wordmark's source carries the same "l" twice, as a <rect> and
       again as a path 0.16pt wider that completely contains it. Only the path
       is here; the rect was redundant geometry, not a second glyph.

       The lab flask's outline is the one stroked part in the set (fill:none,
       stroke:#fff in the source), which is why `parts` distinguishes a fill
       from a stroke at all.

       The COLOUR is the one thing not carried over from the source files. Each
       icon is monochrome there, so it names a role in SCREEN_THEMES instead of
       a hex -- which is what lets the same five paths serve the dark screen and
       the light one without a second copy of any of them. */
    const ART = {
        lab: {
            view: [89, 32, 23, 24], ink: "chrome",
            parts: [
                { d: "M105,37.21l-9,0c-.16,0-.28-.12-.38-.1h0a2.14,2.14,0,0,1,0-2.25l0,0A.53.53,0,0,1,96,34.6h9a.52.52,0,0,1,.43.28l0,0a2.12,2.12,0,0,1,0,2.15l0,0A.73.73,0,0,1,105,37.21Z" },
                { d: "M93,48a2.26,2.26,0,0,0,3,2.2,20.6,20.6,0,0,0,4.51-2.14s3.92-2.27,5-2.29,1.42.41,1.42.41l2.78,4.8.39.68a2.11,2.11,0,0,1-.05,2,1.93,1.93,0,0,1-1.8,1H92.69a2,2,0,0,1-1.19-.39,2.19,2.19,0,0,1-.8-1.23A1.77,1.77,0,0,1,91,51.56C91.55,50.66,93,48,93,48Z" },
                { stroke: true, width: 1, d: "M110.23,51.49l-6.31-10.94v-3.8h1.13a1.14,1.14,0,0,0,0-2.27H96a1.14,1.14,0,0,0,0,2.27h1.13v3.8L90.81,51.49a2.27,2.27,0,0,0,2,3.4h15.5A2.27,2.27,0,0,0,110.23,51.49Z" }
            ]
        },
        logo: {
            view: [242.5, 29, 109.5, 37], ink: "chrome",
            parts: [
                { d: "M269.81,42.24H257v3.81h9.08c-.45,5.35-4.88,7.63-9.07,7.63a10.19,10.19,0,0,1,0-20.37,9.84,9.84,0,0,1,6.85,2.76l2.66-2.77a13.5,13.5,0,0,0-9.64-3.81,14,14,0,1,0,.2,28c7.47,0,12.94-5.14,12.94-12.74a11.49,11.49,0,0,0-.23-2.53" },
                { d: "M280.48,42.92a5.17,5.17,0,0,1,5,5.48,5.1,5.1,0,1,1-10.17,0A5.2,5.2,0,0,1,280.48,42.92Zm-.06-3.53a9,9,0,1,0,9,9A8.88,8.88,0,0,0,280.42,39.39Z" },
                { d: "M300.13,42.93a5.16,5.16,0,0,1,5,5.47,5.1,5.1,0,1,1-10.17,0,5.19,5.19,0,0,1,5.14-5.45Zm-.05-3.54a9,9,0,1,0,9,9,8.88,8.88,0,0,0-9-9Z" },
                { d: "M318.78,42.92c2.37,0,4.8,2,4.8,5.49s-2.43,5.45-4.85,5.45a5.1,5.1,0,0,1-5-5.42A5.18,5.18,0,0,1,318.78,42.92Zm-.35-3.53a9,9,0,0,0-.08,18,5.93,5.93,0,0,0,4.92-2.18V57c0,3.11-1.88,5-4.71,5a5,5,0,0,1-4.6-3.21l-3.45,1.45a8.64,8.64,0,0,0,8.07,5.3c4.8,0,8.46-3,8.46-9.39V39.93h-3.77v1.53A6.3,6.3,0,0,0,318.43,39.39Z" },
                { d: "M342.77,42.84a3.6,3.6,0,0,1,3.33,1.93l-8,3.37a5,5,0,0,1,4.71-5.3Zm-.15-3.46c-4.55,0-8.37,3.63-8.37,9a8.69,8.69,0,0,0,8.8,9,9.11,9.11,0,0,0,7.52-3.95l-3.1-2.07a5,5,0,0,1-4.4,2.47,4.62,4.62,0,0,1-4.4-2.72l12-5-.63-1.46A8.12,8.12,0,0,0,342.62,39.38Z" },
                { d: "M328.57,56.77h4.57V30.22h-4.57Z" }
            ]
        },
        search: {
            view: [103, 98.5, 22.5, 24], ink: "searchIcon",
            parts: [
                { d: "M124.58,121.83l-8-8a7.67,7.67,0,0,1-4.8,1.64,8.24,8.24,0,1,1,8.22-8.22,7.55,7.55,0,0,1-.45,2.62,7.36,7.36,0,0,1-1.2,2.19l8,8ZM111.81,113a5.67,5.67,0,1,0-4-1.66A5.48,5.48,0,0,0,111.81,113Z" }
            ]
        },
        mic: {
            view: [412.5, 97, 19.5, 25.5], ink: "icon",
            parts: [
                { d: "M422.18,112.31a3.11,3.11,0,0,1-2.35-1,3.48,3.48,0,0,1-.95-2.46v-8.2a3.12,3.12,0,0,1,1-2.31,3.33,3.33,0,0,1,4.68,0,3.12,3.12,0,0,1,1,2.31v8.2a3.47,3.47,0,0,1-.94,2.46A3.13,3.13,0,0,1,422.18,112.31Z" },
                { d: "M421.2,122.21v-4.45a8.83,8.83,0,0,1-5.81-2.9,8.59,8.59,0,0,1-2.36-6h2a6.66,6.66,0,0,0,2.1,5,7.38,7.38,0,0,0,10.17,0,6.63,6.63,0,0,0,2.11-5h2a8.58,8.58,0,0,1-2.35,6,8.87,8.87,0,0,1-5.82,2.9v4.45Z" },
                { d: "M421.2,117.76h1.96v4.44H421.2Z" }
            ]
        },
        lens: {
            view: [467.5, 97, 26, 25.5], ink: "icon",
            parts: [
                { d: "M485.96,118.07a2.76,2.76,0,1,0,5.52,0a2.76,2.76,0,1,0,-5.52,0Z" },
                { d: "M476.3,111.17a4.14,4.14,0,1,0,8.28,0a4.14,4.14,0,1,0,-8.28,0Z" },
                { d: "M468,116.55a5.66,5.66,0,0,0,5.66,5.66h6.76v-2.76l-6.91,0a3,3,0,0,1-2.75-3.09v-3.1H468Z" },
                { d: "M492.85,105.79a5.66,5.66,0,0,0-5.66-5.66h-3.31l3.45,2.76a3,3,0,0,1,2.76,3.11v5.17h2.76Z" },
                { d: "M483.19,97.37h-5.52l-2.07,2.76h-1.93a5.67,5.67,0,0,0-5.66,5.66v3.31h2.76V106a3,3,0,0,1,2.76-3.11h13.8Z" }
            ]
        }
    };

    /* Parsed once, not per paint: paint() runs on every keystroke. */
    Object.keys(ART).forEach((k) => {
        ART[k].parts.forEach((p) => { p.path = new Path2D(p.d); });
    });

    /* The suit pip, the artwork's own bezier path normalised to a unit box so
       it can be placed at any size. One string feeds both renderers -- Path2D
       parses it for the canvas and the SVG export emits it verbatim under a
       transform -- so an edit to the shape cannot land in one export format
       and silently miss the other. */
    const HEART_PATH = "M0.5,0.1611C0.4478,0.0668 0.3615,0.002 0.259,0.002" +
        "C0.1133,0.002 0,0.1238 0,0.2849C0,0.5953 0.1547,0.6425 0.5,1" +
        "C0.8453,0.6405 1,0.5934 1,0.2829C1,0.1238 0.8885,0 0.741,0" +
        "C0.6385,0 0.5522,0.0668 0.5,0.1611Z";

    /* The spade has no artwork to trace, so it is drawn to the heart's own
       proportions: same unit box, apex on the centre line, lobes reaching the
       full width, and a stem whose flare ends on the baseline. Drawn point-UP,
       which is the orientation the heart's mirror gives it for free -- the
       flipped index turns both suits over together, so nothing about the
       bottom-right corner needs to know which suit it is drawing. */
    const SPADE_PATH = "M0.5,0C0.5,0.18 0.3,0.28 0.15,0.42" +
        "C0.02,0.54 0,0.63 0,0.7C0,0.8 0.07,0.86 0.17,0.86" +
        "C0.27,0.86 0.35,0.81 0.42,0.73C0.42,0.8 0.39,0.92 0.32,1" +
        "L0.68,1C0.61,0.92 0.58,0.8 0.58,0.73" +
        "C0.65,0.81 0.73,0.86 0.83,0.86C0.93,0.86 1,0.8 1,0.7" +
        "C1,0.63 0.98,0.54 0.85,0.42C0.7,0.28 0.5,0.18 0.5,0Z";

    /* The diamond is the one pip that is symmetric about BOTH axes, so the
       mirrored corner turns it into itself and the flip is invisible on it.
       Inset horizontally rather than filling the box, because the pip box is
       wider than it is tall (the heart's own bbox) and a diamond drawn to the
       full width reads as a lozenge. */
    const DIAMOND_PATH = "M0.5,0L0.85,0.5L0.5,1L0.15,0.5Z";

    /* The club is four subpaths -- three lobes and a stem -- rather than one
       traced outline, which is the only thing here that needs care: canvas and
       SVG both fill with the NONZERO rule, so the stem has to wind the same way
       as the lobes or the overlap cancels and leaves a hole where the stem
       meets them. Drawn the other way round it does exactly that, which is
       visible immediately and was checked before this was written down.

       The lobes overlap on purpose: at r=0.235 with centres 0.315 apart the
       top lobe reaches both lower ones, so the union is a single shape. Pull
       them apart and the trefoil separates into three circles. */
    const CLUB_PATH = "M0.265,0.235a0.235,0.235 0 1,0 0.47,0a0.235,0.235 0 1,0 -0.47,0Z" +
        "M0.015,0.55a0.235,0.235 0 1,0 0.47,0a0.235,0.235 0 1,0 -0.47,0Z" +
        "M0.515,0.55a0.235,0.235 0 1,0 0.47,0a0.235,0.235 0 1,0 -0.47,0Z" +
        "M0.44,0.35C0.44,0.7 0.4,0.9 0.31,1L0.69,1C0.6,0.9 0.56,0.7 0.56,0.35Z";

    /* Suit = a pip path plus the ink it is filled with. Everything else about
       the layout is shared, so a suit costs two lines here and one entry in
       FRAME_STYLES. The Path2D is built once per suit rather than per paint:
       paint() runs on every keystroke. */
    const SUITS = {
        hearts: { path: HEART_PATH, ink: "#BE1E2D" },
        spades: { path: SPADE_PATH, ink: "#000000" },
        diamonds: { path: DIAMOND_PATH, ink: "#BE1E2D" },
        clubs: { path: CLUB_PATH, ink: "#000000" }
    };
    const SUIT_PATHS = {};
    Object.keys(SUITS).forEach((k) => { SUIT_PATHS[k] = new Path2D(SUITS[k].path); });

    function suitOf(frameKey) {
        const style = FRAME_STYLES[frameKey];
        return (style && SUITS[style.suit]) ? style.suit : "hearts";
    }

    /* Which of the four renderers a style asks for. Undefined for the plain
       frames, which is the branch paint() falls through to. */
    function layoutOf(frameKey) {
        return (FRAME_STYLES[frameKey] || {}).layout;
    }

    /* The artwork sets its Q and K in Algerian, which is a licensed Monotype
       face: the design folder carries the TTF, but bundling it into a public
       web root is a redistribution this project has no licence for, and the
       FONTS list above exists precisely so the editor never names a face the
       renderer would substitute. Playfair Display is already loaded by the
       page and is the closest high-contrast display serif on hand, so the
       indices are set in it and the substitution is deliberate rather than
       silent. */
    const CARD_RANK_FONT = "playfair";

    /* The search screen's own type. The artwork sets everything in Roboto and
       the design folder carries the TTF; Inter is what this page already loads,
       and the two are close relatives -- both neo-grotesque UI faces on the same
       skeleton, which is why Inter is the usual substitute for Roboto rather
       than one of many. It is not identical, and it is slightly the wider of
       the two, which is why the query is measured and fitted rather than set at
       the artwork's em and hoped for. Named here rather than written into six
       font strings so the substitution is one decision. */
    const SCREEN_FONT = "inter";

    /* The search bar's text. Free-form on purpose -- names, a date, a place, an
       inside joke -- and capped where the pill runs out rather than where the
       words do: 40 characters is roughly half again what fits at the artwork's
       own em, and fitQuerySize() sets the overflow down to fit instead of
       clipping it. */
    const QUERY_MAX_CHARS = 40;

    /* Deliberately not a pair of names. The artwork's own query is the
       designer's subject, and inventing a couple to replace them would ship
       somebody's poster as the default; this states the shape without claiming
       to be anyone. The field's hint is where the suggestion belongs. */
    const DEFAULT_QUERY = "Us, always";

    /* One line, inside the cap. Runs of whitespace collapse to a single space,
       which is what turns a pasted paragraph into one line rather than letting
       a newline draw over the tab strip -- but a TRAILING space survives,
       because a field that eats the space you just typed cannot be typed in. */
    function cleanQuery(value) {
        return String(value === null || value === undefined ? "" : value)
            .replace(/\s+/g, " ")
            .slice(0, QUERY_MAX_CHARS);
    }

    /* The four ranks offered as suggestions. They are no longer the only
       allowed values: the corner is free text, so an initial, a monogram or a
       10 are all typeable. This list only fills the datalist behind the two
       inputs, which is what keeps the common case one click. */
    const RANKS = ["A", "J", "Q", "K"];

    /* Free text needs exactly three rules, and they are the ones the drawing
       imposes rather than taste: no whitespace (a rank of " " renders as a
       blank corner that reads as a bug), at most two characters, and nothing
       that is not a single line. Emptiness is allowed on purpose -- clearing
       the field leaves the pip alone in the corner, which is a legitimate
       thing to want. */
    function cleanRank(value) {
        return String(value === null || value === undefined ? "" : value)
            .replace(/\s+/g, "")
            .slice(0, 2);
    }

    function styleRanks(frameKey) {
        const style = FRAME_STYLES[frameKey];
        return (style && style.ranks) || FRAME_STYLES.hearts.ranks;
    }

    /* Nothing in the corner reaches further right than the pip does. The pip's
       own right edge is 66.6pt against a panel starting at 74.5, so the artwork
       leaves 7.9pt of paper between the index and the photograph -- and it puts
       its rank on that same edge rather than closer in.

       Expressed against the pip rather than as a number, so the two can only
       move together. Anything a visitor types that would be wider is scaled
       down to it, which is what makes a free-text field safe here: without a
       cap, "WW" runs a third of the way across the photograph. */
    const RANK_MAX_W = CARD.pip.x + CARD.pip.w - CARD.rank.x;

    function fitRankSize(c, rank, W) {
        const size = CARD.rank.size * W;
        if (!rank) {
            return size;
        }
        c.save();
        c.font = "700 " + size + "px " + fontStack(CARD_RANK_FONT);
        const measured = c.measureText(rank).width;
        c.restore();
        const max = RANK_MAX_W * W;
        return measured > max ? size * (max / measured) : size;
    }

    /* Emoji picker inventory. Native Unicode only -- no image CDN, which would
       be a network dependency inside an editor whose whole proposition is that
       it runs with nothing leaving the device (CLAUDE.md Critical Rule 1). */
    const EMOJI = {
        Smileys: "😀 😃 😄 😁 😊 🙂 😉 😍 🥰 😘 🤩 🤗 🤔 😎 🥳 😇 🙃 😌 😢 😭 😡 🤯 😱 🥺",
        People: "👋 🙌 👏 🤝 💪 🙏 👍 👎 ✌️ 🤞 👀 🧠 👶 🧑 👩 👨 👵 👴 🕺 💃",
        Nature: "🌸 🌺 🌻 🌼 🌷 🌹 🍀 🌿 🌱 🌳 🌲 🌊 🔥 ⭐ 🌟 ✨ ⚡ 🌈 ☀️ 🌙 ❄️ 🍂",
        Food: "🍕 🍔 🍟 🌮 🍣 🍜 🍰 🎂 🍪 🍩 ☕ 🍺 🍷 🥂 🍾 🍎 🍓 🥑 🥐 🍫",
        Travel: "✈️ 🚗 🚕 🚌 🚲 🛵 🚀 🛳️ 🏖️ 🏔️ 🗺️ 🧳 🏕️ 🎡 🗽 🏰 ⛺ 🌍",
        Objects: "🎉 🎊 🎁 🎈 🏆 🥇 💎 💡 📷 🎧 🎸 🎬 📚 ✏️ 💼 🔑 ⏰ 💰 🛒 📌",
        Symbols: "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💖 💯 ✅ ❌ ⭕ ❗ ❓ ♻️ ⚠️ 🔴 🟢 🔵"
    };

    const canvas = document.getElementById("poster-canvas");
    if (!canvas) {
        return;
    }
    const ctx = canvas.getContext("2d");

    /* ----------------------------------------------------------------------
       State, history and persistence
       ---------------------------------------------------------------------- */

    /* The uploaded photos live only in memory. Image data is intentionally
       never written to localStorage: a single phone photo as a data URL
       exhausts the ~5 MB quota on its own and would evict the text the
       visitor actually typed.

       ONE indexed store rather than a variable per photograph. It was `photo`
       and `photoB` while two was the most any layout wanted; the search screen
       wants six, and a third variable followed by a fourth is how a renderer
       ends up with one path that handles slot 3 and another that forgot to.
       Slot 0 is "the photograph" for every layout that has just one, and slot 1
       is the split layout's second half, so the two names that were here map
       onto the first two entries and nothing else had to be re-taught. */
    const photos = new Array(SLOT_COUNT).fill(null);

    function defaultText(id, text) {
        return {
            id: id,
            text: text || "",
            /* Fractions of the canvas, not pixels: the same element has to
               land in the same visual place whether the document is A4 or A0
               and whether it is being drawn at preview or export scale. */
            x: 0.5,
            y: 0.88,
            boxW: 0.8,
            anchor: "box",
            font: "playfair",
            size: 0.043,
            bold: true,
            italic: true,
            underline: false,
            strike: false,
            upper: false,
            color: "#1A1A1A",
            align: "center",
            list: "none",
            letter: 0,
            line: 1.25,
            opacity: 1,
            ligatures: true
        };
    }

    /* Mirrors the value attribute on #doc-name in poster.html. An untouched
       field falls back to the brand filename rather than exporting
       "untitled-poster.png". */
    const DEFAULT_POSTER_NAME = "Untitled poster";

    let state = {
        name: DEFAULT_POSTER_NAME,
        size: "A3",
        frame: "black",
        rankHead: FRAME_STYLES.hearts.ranks.head,
        rankFoot: FRAME_STYLES.hearts.ranks.foot,
        query: DEFAULT_QUERY,
        screenTheme: DEFAULT_SCREEN_THEME,
        /* One framing per photo slot, indexed to match `photos`. */
        views: defaultViews(),
        texts: [defaultText("t1", "")],
        /* Which grid card the framing controls point at. UI selection like
           `sel` below it, so it is in neither the history nor storage: undoing
           should move a photograph back, not move the visitor's attention. */
        card: 0,
        sel: "t1"
    };

    /* Linear command stack. Deliberately snapshot-based rather than diff or
       command-object based: the whole document is a few kilobytes of JSON, a
       single visitor in a single tab, and a snapshot cannot desynchronise from
       the model the way a hand-written inverse operation can. */
    const HISTORY_LIMIT = 60;
    let past = [];
    let future = [];

    function snapshot() {
        return JSON.stringify({
            name: state.name, size: state.size, frame: state.frame,
            rankHead: state.rankHead, rankFoot: state.rankFoot,
            query: state.query, screenTheme: state.screenTheme,
            views: state.views, texts: state.texts
        });
    }

    function restore(json) {
        const parsed = JSON.parse(json);
        state.name = parsed.name;
        state.size = parsed.size;
        state.frame = parsed.frame;
        state.rankHead = cleanRank(parsed.rankHead);
        state.rankFoot = cleanRank(parsed.rankFoot);
        state.query = cleanQuery(parsed.query);
        state.screenTheme = SCREEN_THEMES[parsed.screenTheme]
            ? parsed.screenTheme : DEFAULT_SCREEN_THEME;
        state.views = normalizeViews(parsed.views);
        state.texts = parsed.texts;
        if (!state.texts.some((t) => t.id === state.sel)) {
            state.sel = state.texts.length ? state.texts[0].id : null;
        }
    }

    let pending = null;

    /* Commits a history entry. Text typing coalesces: one entry per burst
       rather than one per keystroke, or a single sentence would bury every
       earlier state past the limit and make undo useless. */
    function commit(coalesceKey) {
        const before = pending !== null ? pending : snapshot();
        pending = null;

        if (coalesceKey && past.length && past[past.length - 1].key === coalesceKey) {
            /* Same burst: leave the earlier entry as the restore point. */
        } else {
            past.push({ key: coalesceKey || null, json: before });
            if (past.length > HISTORY_LIMIT) {
                past.shift();
            }
        }
        future = [];
        afterChange();
    }

    /* Captures the pre-change state before a mutation runs. */
    function beginChange() {
        if (pending === null) {
            pending = snapshot();
        }
    }

    function undo() {
        if (!past.length) {
            return;
        }
        future.push(snapshot());
        restore(past.pop().json);
        afterChange();
        syncControls();
        syncDocControls();
    }

    function redo() {
        if (!future.length) {
            return;
        }
        past.push({ key: null, json: snapshot() });
        restore(future.pop());
        afterChange();
        syncControls();
        syncDocControls();
    }

    function afterChange() {
        persist();
        render();
        updateHistoryButtons();
    }

    function updateHistoryButtons() {
        const u = document.getElementById("act-undo");
        const r = document.getElementById("act-redo");
        if (u) { u.disabled = past.length === 0; }
        if (r) { r.disabled = future.length === 0; }
    }

    function persist() {
        const first = state.texts[0];
        TB.storageSet(STORAGE_KEY, {
            /* Top-level `caption` is retained for the homepage's
               continue-where-you-left-off strip, which reads exactly this key
               (summarizeSaved() in js/app.js). Dropping it would not fail
               anything loudly -- the strip would just quietly stop describing
               poster work, which is the class of silent regression this
               project has been bitten by before. */
            caption: TB.sanitize(first ? first.text : ""),
            frame: state.frame,
            name: TB.sanitize(state.name),
            rankHead: TB.sanitize(state.rankHead),
            rankFoot: TB.sanitize(state.rankFoot),
            query: TB.sanitize(state.query),
            screenTheme: state.screenTheme,
            size: state.size,
            texts: state.texts.map((t) => {
                const copy = Object.assign({}, t);
                copy.text = TB.sanitize(t.text);
                return copy;
            })
        });
        TB.markSaved();
    }

    function migrate(saved) {
        if (!saved || typeof saved !== "object") {
            return;
        }
        state.frame = FRAME_STYLES[saved.frame] ? saved.frame : "black";
        /* Absent on every record written before the ranks were editable, so
           an older poster reopens as the pairing its own style advertises.
           Only `undefined` takes the fallback: an empty string is a corner the
           visitor deliberately cleared, and restoring a letter over it would
           be the editor arguing with them. */
        const fallbackRanks = styleRanks(state.frame);
        state.rankHead = saved.rankHead === undefined
            ? fallbackRanks.head
            : cleanRank(TB.desanitize(String(saved.rankHead)));
        state.rankFoot = saved.rankFoot === undefined
            ? fallbackRanks.foot
            : cleanRank(TB.desanitize(String(saved.rankFoot)));
        /* Same rule as the ranks: only `undefined` takes the default, because an
           empty string is a search bar the visitor deliberately cleared and
           putting words back into it would be the editor arguing with them. */
        state.query = saved.query === undefined
            ? DEFAULT_QUERY
            : cleanQuery(TB.desanitize(String(saved.query)));
        state.screenTheme = SCREEN_THEMES[saved.screenTheme]
            ? saved.screenTheme : DEFAULT_SCREEN_THEME;
        state.size = PAPER[saved.size] ? saved.size : "A3";
        state.name = TB.desanitize(String(saved.name || "")).trim() || "Untitled poster";

        if (Array.isArray(saved.texts) && saved.texts.length) {
            state.texts = saved.texts.map((t, i) => {
                const base = defaultText(String(t.id || "t" + (i + 1)), "");
                Object.keys(base).forEach((k) => {
                    if (t[k] !== undefined && t[k] !== null) {
                        base[k] = t[k];
                    }
                });
                base.text = TB.desanitize(String(t.text || ""));
                return base;
            });
        } else {
            /* v1 record: one caption string, no element list. */
            state.texts = [defaultText("t1", TB.desanitize(String(saved.caption || "")))];
        }
        state.sel = state.texts.length ? state.texts[0].id : null;
    }

    /* ----------------------------------------------------------------------
       Geometry
       ---------------------------------------------------------------------- */

    function paper() {
        return PAPER[state.size] || PAPER.A3;
    }

    function previewSize() {
        const p = paper();
        const ratio = p.w / p.h;
        return { w: Math.round(PREVIEW_LONG_EDGE * ratio), h: PREVIEW_LONG_EDGE };
    }

    /* Export dimensions for a requested DPI, clamped so the long edge never
       exceeds what a canvas can actually allocate. Returns the EFFECTIVE dpi
       so the UI can show what will really be produced. */
    function exportSize(dpi) {
        const p = paper();
        const want = dpi || DEFAULT_DPI;
        let w = Math.round(p.w / 25.4 * want);
        let h = Math.round(p.h / 25.4 * want);
        let eff = want;
        const longEdge = Math.max(w, h);
        if (longEdge > MAX_EXPORT_EDGE) {
            const k = MAX_EXPORT_EDGE / longEdge;
            w = Math.round(w * k);
            h = Math.round(h * k);
            eff = Math.round(want * k);
        }
        return { w: w, h: h, dpi: eff, clamped: eff !== want };
    }

    function fontStack(id) {
        const f = FONTS.find((x) => x.id === id);
        return f ? f.stack : FONTS[0].stack;
    }

    /* ----------------------------------------------------------------------
       Rendering. One function drives the on-screen canvas and every raster
       export, parameterised only by target size, so an export can never drift
       from the preview.
       ---------------------------------------------------------------------- */

    /* Where a photograph sits inside the box it fills. `zoom` multiplies the
       cover fit, so 1 is exactly the crop this editor drew before framing
       existed. x and y are fractions of the SLACK that zoom leaves rather than
       pixels or image fractions, which is what makes them independent of both
       the photograph's resolution and the paper size, and what makes them
       self-clamping: at zoom 1 an image matching the panel's aspect has no
       slack in one axis, and panning it there correctly does nothing.

       Held on `state` so undo covers it, but deliberately NOT persisted: the
       photograph itself is never written to storage, so a framing restored
       without it would apply someone's old crop to their next upload. */
    function defaultView() {
        return { zoom: 1, x: 0, y: 0 };
    }

    function defaultViews() {
        const out = [];
        for (let i = 0; i < SLOT_COUNT; i += 1) {
            out.push(defaultView());
        }
        return out;
    }

    /* A history entry written before the search screen existed carries `view`
       and `viewB` rather than an array, and the history is in memory only -- so
       this exists for the array's LENGTH rather than for old data: every reader
       indexes it by slot, and a short array would hand `undefined` to
       photoMetrics() as a framing. */
    function normalizeViews(saved) {
        const out = defaultViews();
        if (Array.isArray(saved)) {
            saved.slice(0, SLOT_COUNT).forEach((v, i) => {
                if (v && typeof v === "object") { out[i] = v; }
            });
        }
        return out;
    }

    function clampUnit(n) {
        return Math.min(1, Math.max(-1, Number(n) || 0));
    }

    function photoMetrics(img, w, h, view) {
        const v = view || defaultView();
        const zoom = Math.max(1, Number(v.zoom) || 1);
        const scale = Math.max(w / img.width, h / img.height) * zoom;
        const sw = w / scale;
        const sh = h / scale;
        const slackX = (img.width - sw) / 2;
        const slackY = (img.height - sh) / 2;
        return {
            scale: scale, sw: sw, sh: sh, slackX: slackX, slackY: slackY,
            sx: slackX + clampUnit(v.x) * slackX,
            sy: slackY + clampUnit(v.y) * slackY
        };
    }

    function drawCoverImage(c, img, x, y, w, h, view) {
        const m = photoMetrics(img, w, h, view);
        c.drawImage(img, m.sx, m.sy, m.sw, m.sh, x, y, w, h);
    }

    /* Splits a string into rendered lines, honouring explicit newlines and
       wrapping to the element's box when it is anchored rather than free. */
    function layoutLines(c, el, text, boxPx) {
        const hard = text.split("\n");
        if (el.anchor !== "box") {
            return hard;
        }
        const out = [];
        hard.forEach((para) => {
            const words = para.split(/\s+/).filter(Boolean);
            if (!words.length) {
                out.push("");
                return;
            }
            let line = words[0];
            for (let i = 1; i < words.length; i += 1) {
                const next = line + " " + words[i];
                if (c.measureText(next).width > boxPx && line) {
                    out.push(line);
                    line = words[i];
                } else {
                    line = next;
                }
            }
            out.push(line);
        });
        return out;
    }

    function applyTextStyle(c, el, W) {
        const px = el.size * W;
        const weight = el.bold ? "700" : "400";
        const style = el.italic ? "italic " : "";
        c.font = style + weight + " " + px + 'px ' + fontStack(el.font);
        c.textAlign = el.align;
        c.textBaseline = "alphabetic";
        c.fillStyle = el.color;
        c.globalAlpha = el.opacity;

        /* letterSpacing is supported on Canvas2D in current Chromium/WebKit
           and simply ignored elsewhere; there is no manual fallback here
           because per-character placement would break the alignment and
           wrapping above for a cosmetic control. */
        if ("letterSpacing" in c) {
            c.letterSpacing = (el.letter * px) + "px";
        }
        /* Canvas exposes no direct ligature switch. fontKerning is the real,
           observable lever, so the control is labelled for what it does
           ("Kerning and ligatures") rather than promising OpenType feature
           control the API cannot deliver. */
        if ("fontKerning" in c) {
            c.fontKerning = el.ligatures ? "normal" : "none";
        }
        return px;
    }

    function drawTextElement(c, el, W, H) {
        let text = el.text;
        if (!text) {
            return;
        }
        if (el.upper) {
            text = text.toUpperCase();
        }

        const px = applyTextStyle(c, el, W);
        const boxPx = el.boxW * W;
        let lines = layoutLines(c, el, text, boxPx);

        if (el.list !== "none") {
            lines = lines.map((l, i) => {
                if (!l) { return l; }
                return (el.list === "number" ? (i + 1) + ". " : "• ") + l;
            });
        }

        const lineH = px * el.line;
        const x = el.x * W;
        let y = el.y * H;

        lines.forEach((line, i) => {
            const ly = y + i * lineH;
            c.fillText(line, x, ly);

            if (el.underline || el.strike) {
                const wdt = c.measureText(line).width;
                let lx = x;
                if (el.align === "center") { lx = x - wdt / 2; }
                if (el.align === "right") { lx = x - wdt; }
                c.save();
                c.strokeStyle = el.color;
                c.lineWidth = Math.max(1, px * 0.05);
                if (el.underline) {
                    c.beginPath();
                    c.moveTo(lx, ly + px * 0.16);
                    c.lineTo(lx + wdt, ly + px * 0.16);
                    c.stroke();
                }
                if (el.strike) {
                    c.beginPath();
                    c.moveTo(lx, ly - px * 0.3);
                    c.lineTo(lx + wdt, ly - px * 0.3);
                    c.stroke();
                }
                c.restore();
            }
        });

        c.globalAlpha = 1;
        if ("letterSpacing" in c) { c.letterSpacing = "0px"; }
    }

    /* The photo, or the prompt that stands in for it. Shared by both layouts so
       an empty editor looks the same whichever style is selected, and so the
       placeholder can never be styled in one and forgotten in the other. */
    function drawPhotoPanel(c, x, y, w, h, scale, transparent) {
        if (photos[0]) {
            drawCoverImage(c, photos[0], x, y, w, h, state.views[0]);
            return;
        }
        if (transparent) {
            return;
        }
        c.fillStyle = "#F4F3EF";
        c.fillRect(x, y, w, h);
        c.fillStyle = "#6B6B66";
        c.font = "400 " + (34 * scale) + 'px "Inter", sans-serif';
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText("Upload a photo to begin", x + w / 2, y + h / 2);
    }

    /* One corner index: the rank letter with its suit pip below it.

       The bottom-right copy is the top-left one mirrored VERTICALLY, which is
       what the artwork does -- matrix(1 0 0 -1) on both the K and its pip --
       rather than the 180-degree rotation a real playing card uses. The
       difference is visible on the K: a rotation would also reverse it left to
       right. That is why only the y axis goes through the transform and the x
       positions are mirrored arithmetically instead. */
    function drawCardIndex(c, W, H, rank, flip, suit) {
        const pipW = CARD.pip.w * W;
        const pipH = CARD.pip.h * H;
        const pipX = flip ? W - CARD.pip.x * W - pipW : CARD.pip.x * W;
        const rankX = flip ? W - CARD.rank.x * W : CARD.rank.x * W;
        const key = SUITS[suit] ? suit : "hearts";

        c.save();
        if (flip) {
            c.translate(0, H);
            c.scale(1, -1);
        }

        c.fillStyle = CARD.ink;
        c.font = "700 " + fitRankSize(c, rank, W) + "px " + fontStack(CARD_RANK_FONT);
        c.textAlign = flip ? "right" : "left";
        c.textBaseline = "alphabetic";
        c.fillText(rank, rankX, CARD.rank.baseline * H);

        c.fillStyle = SUITS[key].ink;
        c.translate(pipX, CARD.pip.y * H);
        c.scale(pipW, pipH);
        c.fill(SUIT_PATHS[key]);
        c.restore();
    }

    /* The playing-card layout: white paper, a ruled photo panel, and the two
       corner indices. Nothing here reads frame.frame or frame.trim -- this
       style carries a layout instead of a colour pair. The indices are drawn
       even for a transparent export, because they are the artwork rather than
       the background the toggle exists to drop. */
    function paintCard(c, W, H, options, scale) {
        if (!options.transparent) {
            c.fillStyle = "#FFFFFF";
            c.fillRect(0, 0, W, H);
        }

        const x = CARD.panel.x * W;
        const y = CARD.panel.y * H;
        const w = CARD.panel.w * W;
        const h = CARD.panel.h * H;

        drawPhotoPanel(c, x, y, w, h, scale, options.transparent);

        /* Stroked ON the panel boundary, as the artwork has it, so half the
           rule falls over the photograph. Insetting it instead would leave a
           hairline of paper between rule and photo at export scale. */
        c.strokeStyle = CARD.ink;
        c.lineWidth = CARD.rule * W;
        c.strokeRect(x, y, w, h);

        const suit = suitOf(state.frame);
        drawCardIndex(c, W, H, state.rankHead, false, suit);
        drawCardIndex(c, W, H, state.rankFoot, true, suit);
    }

    /* The panel's four corners plus the two seam ends, in page pixels. Both
       renderers derive every region from this one function, so the seam cannot
       land in one place on the canvas and another in the SVG. */
    function splitGeometry(W, H) {
        const x = CARD.panel.x * W;
        const y = CARD.panel.y * H;
        const w = CARD.panel.w * W;
        const h = CARD.panel.h * H;
        return {
            x: x, y: y, w: w, h: h,
            seamLeftY: y + SPLIT.seam.left * h,
            seamRightY: y + SPLIT.seam.right * h
        };
    }

    /* The lower region: the seam, then down the right edge, along the bottom
       and back up the left. The UPPER region has no path of its own on purpose
       -- see paintSplit(). */
    function lowerRegionPath(c, g) {
        c.beginPath();
        c.moveTo(g.x, g.seamLeftY);
        c.lineTo(g.x + g.w, g.seamRightY);
        c.lineTo(g.x + g.w, g.y + g.h);
        c.lineTo(g.x, g.y + g.h);
        c.closePath();
    }

    /* Covers the panel with one photograph, turned 180 degrees when asked.

       ROTATED, not mirrored. The artwork applies matrix(-s, 0, 0, -s), which is
       negative on BOTH axes; drawCardIndex() a few lines up applies scale(1,-1),
       which is negative on one. Those are different operations and they sit in
       the same renderer: a mirror here would reverse the subject left to right,
       which on a photograph of a person is unmistakable. */
    function drawPanelPhoto(c, img, g, upsideDown, view) {
        c.save();
        if (upsideDown) {
            c.translate(g.x + g.w / 2, g.y + g.h / 2);
            c.rotate(Math.PI);
            c.translate(-(g.x + g.w / 2), -(g.y + g.h / 2));
        }
        drawCoverImage(c, img, g.x, g.y, g.w, g.h, view);
        c.restore();
    }

    /* The split layout: one ruled panel divided by a diagonal seam, a
       photograph in each half, the lower one upside down.

       The upper half is drawn across the WHOLE panel and the lower half is then
       drawn over it, clipped to its own region. That is what the artwork does
       -- its two polygons overlap and the later one wins -- and it is also what
       makes a hairline of paper along the seam impossible: there is no shared
       edge for two anti-aliased fills to fall either side of. Clipping both
       halves to meet exactly on the seam is the obvious construction and it
       shows a white line at export scale. */
    function paintSplit(c, W, H, options, scale) {
        if (!options.transparent) {
            c.fillStyle = "#FFFFFF";
            c.fillRect(0, 0, W, H);
        }

        const g = splitGeometry(W, H);

        c.save();
        c.beginPath();
        c.rect(g.x, g.y, g.w, g.h);
        c.clip();
        if (photos[0]) {
            drawPanelPhoto(c, photos[0], g, false, state.views[0]);
        } else if (!options.transparent) {
            c.fillStyle = SPLIT.upper;
            c.fillRect(g.x, g.y, g.w, g.h);
        }
        c.restore();

        c.save();
        lowerRegionPath(c, g);
        c.clip();
        if (photos[1]) {
            drawPanelPhoto(c, photos[1], g, true, state.views[1]);
        } else if (!options.transparent) {
            c.fillStyle = SPLIT.lower;
            lowerRegionPath(c, g);
            c.fill();
        }
        c.restore();

        /* The empty state is the artwork's own two-colour split rather than a
           grey placeholder, so the prompt has to read against a strong red and
           a strong blue -- white with a dark halo does, and neither flat colour
           is light enough for the panel's usual grey-on-cream. */
        if (!photos[0] && !photos[1] && !options.transparent) {
            c.save();
            c.font = "400 " + (34 * scale) + 'px "Inter", sans-serif';
            c.textAlign = "center";
            c.textBaseline = "middle";
            c.lineWidth = 4 * scale;
            c.strokeStyle = "rgba(0, 0, 0, 0.45)";
            c.strokeText("Upload two photos to begin", g.x + g.w / 2, g.y + g.h / 2);
            c.fillStyle = "#FFFFFF";
            c.fillText("Upload two photos to begin", g.x + g.w / 2, g.y + g.h / 2);
            c.restore();
        }

        c.strokeStyle = CARD.ink;
        c.lineWidth = SPLIT.rule * W;
        c.strokeRect(g.x, g.y, g.w, g.h);

        const suit = suitOf(state.frame);
        drawCardIndex(c, W, H, state.rankHead, false, suit);
        drawCardIndex(c, W, H, state.rankFoot, true, suit);
    }

    /* ------------------------------------------------------------------
       The search-screen layout
       ------------------------------------------------------------------ */

    /* Points to pixels, one factor per axis. The A series is all the same
       1:root-2 shape to within a rounded millimetre, so these two differ by
       about a tenth of a per cent -- but they are kept separate anyway, because
       that is what CARD and SPLIT's fractions already do and a single averaged
       factor would put the artwork's own numbers slightly out on both axes
       instead of exactly right on each. */
    function screenScale(W, H) {
        return { fx: W / SCREEN.page.w, fy: H / SCREEN.page.h };
    }

    /* One rounded rectangle, as a PATH rather than a shape: each card clips a
       photograph, so the path is needed whether or not it is also filled.

       arcTo rather than roundRect(), which is recent enough that an older
       browser would throw here and lose the whole poster rather than draw
       square corners. */
    function roundRectPath(c, x, y, w, h, r) {
        const rad = Math.max(0, Math.min(r, w / 2, h / 2));
        c.beginPath();
        c.moveTo(x + rad, y);
        c.arcTo(x + w, y, x + w, y + h, rad);
        c.arcTo(x + w, y + h, x, y + h, rad);
        c.arcTo(x, y + h, x, y, rad);
        c.arcTo(x, y, x + w, y, rad);
        c.closePath();
    }

    /* The six cards, in the order uploads fill them and the order the preview
       numbers them: down the left column, then down the right. Derived from the
       column rhythm rather than listed, so the artwork's two different gaps are
       stated once each. */
    function gridRects(W, H) {
        const s = screenScale(W, H);
        const g = SCREEN.grid;
        const out = [];
        g.cols.forEach((col, ci) => {
            let top = g.y;
            col.cards.forEach((h) => {
                out.push({
                    x: (g.x + ci * (g.colW + g.gutter)) * s.fx,
                    y: top * s.fy,
                    w: g.colW * s.fx,
                    h: h * s.fy
                });
                top += h + col.gap;
            });
        });
        return out;
    }

    /* The square the account photograph is cover-fitted into, before the circle
       clips it. Square rather than the circle's bounding behaviour, so a
       portrait crops the way it does in every other slot and the framing
       controls mean the same thing here as they do on a card. */
    function avatarRect(W, H) {
        const s = screenScale(W, H);
        const a = SCREEN.avatar;
        return {
            x: (a.cx - a.r) * s.fx, y: (a.cy - a.r) * s.fy,
            w: a.r * 2 * s.fx, h: a.r * 2 * s.fy
        };
    }

    /* One icon, placed by transform: to the target box, scaled from the source
       viewBox, then back by the viewBox's own origin -- which is what lets the
       path data stay verbatim. artSVG() emits the identical chain. */
    function drawArt(c, art, x, y, w, h) {
        const v = art.view;
        const ink = screenTheme()[art.ink];
        c.save();
        c.translate(x, y);
        c.scale(w / v[2], h / v[3]);
        c.translate(-v[0], -v[1]);
        art.parts.forEach((p) => {
            if (p.stroke) {
                c.strokeStyle = ink;
                c.lineWidth = p.width;
                c.stroke(p.path);
            } else {
                c.fillStyle = ink;
                c.fill(p.path);
            }
        });
        c.restore();
    }

    /* Nothing in the search bar may reach the microphone: the source's input
       stops 115.2pt short of the pill's right edge, and this is that edge. A
       query wider than it is set down rather than clipped, on the same argument
       as the rank letters -- the alternative is a name that vanishes halfway
       through with nothing on screen to say why. */
    const QUERY_MAX_W = SCREEN.query.right - SCREEN.query.x;

    function fitQuerySize(c, text, W) {
        const size = SCREEN.query.size * (W / SCREEN.page.w);
        if (!text) {
            return size;
        }
        c.save();
        c.font = "400 " + size + "px " + fontStack(SCREEN_FONT);
        const measured = c.measureText(text).width;
        c.restore();
        const max = QUERY_MAX_W * (W / SCREEN.page.w);
        return measured > max ? size * (max / measured) : size;
    }

    /* The search-screen layout: a phone's results page on near-black paper,
       with six photographs in the masonry and the visitor's own words in the
       search bar.

       An empty card is left as the artwork's plain white rather than carrying a
       placeholder, which is the one place this layout deliberately parts from
       the other three. There, an empty photo panel means an unfinished poster
       and saying so is a service. Here it does not: four photographs in six
       cards is a composition, and printing "upload a photo" into the other two
       would be the editor putting its furniture on someone's wall. The slot
       numbers exist instead, in the preview only -- see drawGridChrome(). */
    function paintScreen(c, W, H, options) {
        const s = screenScale(W, H);
        const S = SCREEN;
        const ink = screenTheme();

        if (!options.transparent) {
            c.fillStyle = ink.bg;
            c.fillRect(0, 0, W, H);
        }

        drawArt(c, ART.lab, S.lab.x * s.fx, S.lab.y * s.fy, S.lab.w * s.fx, S.lab.h * s.fy);
        drawArt(c, ART.logo, S.logo.x * s.fx, S.logo.y * s.fy, S.logo.w * s.fx, S.logo.h * s.fy);

        /* The account circle. A photograph when there is one, clipped to the
           circle rather than drawn square and rounded off, so the crop the
           visitor drags is the crop they get. */
        c.beginPath();
        c.arc(S.avatar.cx * s.fx, S.avatar.cy * s.fy, S.avatar.r * s.fx, 0, Math.PI * 2);
        if (photos[AVATAR_SLOT]) {
            const a = avatarRect(W, H);
            c.save();
            c.clip();
            drawCoverImage(c, photos[AVATAR_SLOT], a.x, a.y, a.w, a.h, state.views[AVATAR_SLOT]);
            c.restore();
        } else if (!options.transparent) {
            c.fillStyle = ink.avatar;
            c.fill();
        }

        c.fillStyle = ink.pill;
        roundRectPath(c, S.pill.x * s.fx, S.pill.y * s.fy, S.pill.w * s.fx, S.pill.h * s.fy,
            (S.pill.h / 2) * s.fy);
        c.fill();

        drawArt(c, ART.search, S.search.x * s.fx, S.search.y * s.fy, S.search.w * s.fx, S.search.h * s.fy);
        drawArt(c, ART.mic, S.mic.x * s.fx, S.mic.y * s.fy, S.mic.w * s.fx, S.mic.h * s.fy);
        drawArt(c, ART.lens, S.lens.x * s.fx, S.lens.y * s.fy, S.lens.w * s.fx, S.lens.h * s.fy);

        if (state.query) {
            c.fillStyle = ink.query;
            c.font = "400 " + fitQuerySize(c, state.query, W) + "px " + fontStack(SCREEN_FONT);
            c.textAlign = "left";
            c.textBaseline = "alphabetic";
            c.fillText(state.query, S.query.x * s.fx, S.query.baseline * s.fy);
        }

        /* The strip is clipped, not laid out to fit: cutting "Forums" short is
           what makes the paper read as a window onto a wider screen. */
        const t = S.tabs;
        c.save();
        c.beginPath();
        c.rect(t.x * s.fx, (t.baseline - t.size) * s.fy, (t.right - t.x) * s.fx,
            (t.underline.y + t.underline.h - t.baseline + t.size) * s.fy);
        c.clip();
        c.font = "400 " + (t.size * s.fx) + "px " + fontStack(SCREEN_FONT);
        c.textAlign = "left";
        c.textBaseline = "alphabetic";
        let tabX = t.x;
        t.items.forEach((label, i) => {
            const wdt = c.measureText(label).width;
            c.fillStyle = i === t.current ? ink.chrome : ink.tabIdle;
            c.fillText(label, tabX * s.fx, t.baseline * s.fy);
            if (i === t.current) {
                c.fillRect(tabX * s.fx - t.underline.pad * s.fx, t.underline.y * s.fy,
                    wdt + t.underline.pad * 2 * s.fx, t.underline.h * s.fy);
            }
            /* Advanced in POINTS, so the measured pixel width comes back
               through the same factor the rest of the layout uses. */
            tabX += wdt / s.fx + t.gap;
        });
        c.restore();

        c.save();
        c.globalAlpha = ink.ruleAlpha;
        c.fillStyle = ink.rule;
        c.fillRect(S.rule.x * s.fx, S.rule.y * s.fy, S.rule.w * s.fx, S.rule.h * s.fy);
        c.restore();

        gridRects(W, H).forEach((r, i) => {
            roundRectPath(c, r.x, r.y, r.w, r.h, SCREEN.grid.radius * s.fx);
            if (photos[i]) {
                c.save();
                c.clip();
                drawCoverImage(c, photos[i], r.x, r.y, r.w, r.h, state.views[i]);
                c.restore();
            } else if (!options.transparent) {
                c.fillStyle = ink.card;
                c.fill();
            }
        });

        const suit = suitOf(state.frame);
        c.fillStyle = ink.pip;
        S.pips.x.forEach((px) => {
            c.save();
            c.translate(px * s.fx, S.pips.y * s.fy);
            c.scale(S.pips.w * s.fx, S.pips.h * s.fy);
            c.fill(SUIT_PATHS[suit]);
            c.restore();
        });
    }

    /* transparent=true skips the frame, matte and placeholder fills so a PNG
       exports with a genuinely empty background rather than a white one -- the
       toggle in the download panel does this and nothing else. */
    function paint(c, W, H, opts) {
        const options = opts || {};
        const frame = FRAME_STYLES[state.frame] || FRAME_STYLES.black;
        const scale = W / 1200;

        c.clearRect(0, 0, W, H);

        if (frame.layout === "card") {
            paintCard(c, W, H, options, scale);
        } else if (frame.layout === "split") {
            paintSplit(c, W, H, options, scale);
        } else if (frame.layout === "browser") {
            paintScreen(c, W, H, options);
        } else {
            const FRAME_W = frame.frame ? 60 * scale : 0;
            const MATTE_W = frame.frame ? 50 * scale : 0;

            if (!options.transparent) {
                if (frame.frame) {
                    c.fillStyle = frame.frame;
                    c.fillRect(0, 0, W, H);
                    c.strokeStyle = frame.trim;
                    c.lineWidth = 6 * scale;
                    c.strokeRect(FRAME_W - 14 * scale, FRAME_W - 14 * scale,
                        W - (FRAME_W - 14 * scale) * 2, H - (FRAME_W - 14 * scale) * 2);
                }
                c.fillStyle = "#FFFFFF";
                c.fillRect(FRAME_W, FRAME_W, W - FRAME_W * 2, H - FRAME_W * 2);
            }

            const px = FRAME_W + MATTE_W;
            const py = FRAME_W + MATTE_W;
            const pw = W - px * 2;
            const ph = H - py * 2 - (0.11 * H);

            drawPhotoPanel(c, px, py, pw, ph, scale, options.transparent);
        }

        state.texts.forEach((el) => drawTextElement(c, el, W, H));
    }

    function render() {
        const s = previewSize();
        if (canvas.width !== s.w || canvas.height !== s.h) {
            canvas.width = s.w;
            canvas.height = s.h;
        }
        paint(ctx, s.w, s.h);
        drawGridChrome();
        drawSelection();
        syncQueryInput();
    }

    /* Preview-only chrome for the search screen: a number on every empty card,
       and a dashed outline on the one the controls are pointing at.

       Deliberately outside paint(), which is what every export renders through.
       The other layouts DO print their "Upload a photo to begin" panel, and
       rightly: one empty photo panel means an unfinished poster. Six cards are
       different -- four photographs and two clean white cards is a composition
       somebody may well want -- so the numbers stay on this side of the export
       boundary, where they can help without ending up on a wall. */
    function drawGridChrome() {
        if (layoutOf(state.frame) !== "browser") {
            return;
        }
        const W = canvas.width;
        const H = canvas.height;
        const rects = gridRects(W, H);

        const selectRing = () => {
            ctx.strokeStyle = "#8A6A3B";
            ctx.lineWidth = Math.max(1.5, W * 0.004);
            ctx.setLineDash([W * 0.01, W * 0.008]);
        };

        ctx.save();
        rects.forEach((r, i) => {
            if (!photos[i]) {
                ctx.fillStyle = "#B9BAC0";
                ctx.font = "400 " + (W * 0.045) + 'px "Inter", sans-serif';
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(String(i + 1), r.x + r.w / 2, r.y + r.h / 2);
            }
            if (i === state.card) {
                selectRing();
                roundRectPath(ctx, r.x, r.y, r.w, r.h, SCREEN.grid.radius * (W / SCREEN.page.w));
                ctx.stroke();
                ctx.setLineDash([]);
            }
        });

        /* The account circle gets the same ring, drawn round rather than square
           so the selection matches the shape that is actually clickable. It
           carries no number: it is not part of the numbered run, and a digit
           inside a 39pt circle would be furniture rather than help. */
        if (state.card === AVATAR_SLOT) {
            const sc = screenScale(W, H);
            selectRing();
            ctx.beginPath();
            ctx.arc(SCREEN.avatar.cx * sc.fx, SCREEN.avatar.cy * sc.fy,
                SCREEN.avatar.r * sc.fx + ctx.lineWidth, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.restore();
    }

    /* Selection chrome is drawn on the preview only and is never part of an
       export -- paint() has no knowledge of it. */
    function drawSelection() {
        const el = selected();
        if (!el || !el.text) {
            return;
        }
        const W = canvas.width;
        const H = canvas.height;
        const px = applyTextStyle(ctx, el, W);
        ctx.globalAlpha = 1;
        const lines = layoutLines(ctx, el, el.upper ? el.text.toUpperCase() : el.text, el.boxW * W);
        let maxW = 0;
        lines.forEach((l) => { maxW = Math.max(maxW, ctx.measureText(l).width); });
        const h = lines.length * px * el.line;
        let x = el.x * W;
        if (el.align === "center") { x -= maxW / 2; }
        if (el.align === "right") { x -= maxW; }
        const y = el.y * H - px;

        ctx.save();
        ctx.strokeStyle = "#8A6A3B";
        ctx.lineWidth = Math.max(1.5, W * 0.002);
        ctx.setLineDash([W * 0.01, W * 0.008]);
        ctx.strokeRect(x - px * 0.2, y - px * 0.1, maxW + px * 0.4, h + px * 0.3);
        ctx.restore();
        if ("letterSpacing" in ctx) { ctx.letterSpacing = "0px"; }
    }

    function selected() {
        return state.texts.find((t) => t.id === state.sel) || null;
    }

    /* ----------------------------------------------------------------------
       Direct manipulation: click to select, drag to position
       ---------------------------------------------------------------------- */

    let dragging = null;

    /* A photograph being moved. Separate from `dragging`, which moves text: the
       two never run at once and conflating them would mean one set of fields
       meaning two things. */
    let panning = null;

    function canvasPoint(ev) {
        const r = canvas.getBoundingClientRect();
        return {
            x: (ev.clientX - r.left) / r.width,
            y: (ev.clientY - r.top) / r.height
        };
    }

    function hitTest(pt) {
        const W = canvas.width;
        const H = canvas.height;
        for (let i = state.texts.length - 1; i >= 0; i -= 1) {
            const el = state.texts[i];
            if (!el.text) { continue; }
            const px = applyTextStyle(ctx, el, W);
            const lines = layoutLines(ctx, el, el.upper ? el.text.toUpperCase() : el.text, el.boxW * W);
            let maxW = 0;
            lines.forEach((l) => { maxW = Math.max(maxW, ctx.measureText(l).width); });
            const h = lines.length * px * el.line;
            let x = el.x * W;
            if (el.align === "center") { x -= maxW / 2; }
            if (el.align === "right") { x -= maxW; }
            const y = el.y * H - px;
            const inX = pt.x * W >= x - px * 0.3 && pt.x * W <= x + maxW + px * 0.3;
            const inY = pt.y * H >= y - px * 0.3 && pt.y * H <= y + h + px * 0.3;
            if (inX && inY) {
                return el;
            }
        }
        return null;
    }

    /* The clickable area of a corner index: the margin strip beside the panel,
       from the top of the rank letter down to the foot of the pip. Deliberately
       generous and deliberately not a drag handle -- the indices have fixed
       positions in this layout, so the only useful thing a click on one can do
       is take you to the field that changes it. */
    function cardIndexAt(pt, W, H) {
        const layout = layoutOf(state.frame);
        if (layout !== "card" && layout !== "split") {
            return null;
        }
        const capPx = CARD.rank.size * W * 0.75;
        const top = CARD.rank.baseline * H - capPx;
        const bottom = (CARD.pip.y + CARD.pip.h) * H;
        const left = CARD.rank.x * W;
        const right = CARD.panel.x * W;
        const x = pt.x * W;
        const y = pt.y * H;

        if (x >= left && x <= right && y >= top && y <= bottom) {
            return "head";
        }
        if (x >= W - right && x <= W - left && y >= H - bottom && y <= H - top) {
            return "foot";
        }
        return null;
    }

    /* Click the letter on the poster, type the letter you want. Not an
       in-canvas text editor -- that means a caret, a selection model and IME
       handling for two characters of content -- but it closes the same loop:
       the corner is where the visitor is looking, so that is where the way in
       should be. */
    function focusRankFor(corner) {
        focusField(corner === "head" ? rankHeadInput : rankFootInput);
    }

    /* Brings a control into view and puts the caret in it. Shared by the corner
       letters and the search bar, because the awkward part is the same for both:
       on a phone the form and the preview are separate tabs, so focusing a field
       in the hidden one would do nothing visible at all. */
    function focusField(input) {
        if (!input) {
            return;
        }
        const editTab = byId("tab-edit");
        const layout = byId("editor-layout");
        if (editTab && layout && !layout.classList.contains("show-edit")) {
            editTab.click();
        }
        input.focus();
        input.select();
        if (input.scrollIntoView) {
            input.scrollIntoView({ block: "center" });
        }
    }

    /* The box THE photograph fills, per layout. Both card layouts fill the
       panel; everything else fills the matted rectangle above the caption band.
       Shared with paint() so a drag cannot be measured against a different box
       from the one the photograph was drawn into.

       The search screen is deliberately absent: it has six boxes rather than
       one, so there is no single answer to give and the question is asked of
       gridRects() instead. photoAt() branches before it reaches here. */
    function photoRectFor(W, H) {
        const layout = layoutOf(state.frame);
        if (layout === "card" || layout === "split") {
            return {
                x: CARD.panel.x * W, y: CARD.panel.y * H,
                w: CARD.panel.w * W, h: CARD.panel.h * H
            };
        }
        const frame = FRAME_STYLES[state.frame] || FRAME_STYLES.black;
        const scale = W / 1200;
        const inset = frame.frame ? 110 * scale : 0;
        return {
            x: inset, y: inset,
            w: W - inset * 2, h: H - inset * 2 - 0.11 * H
        };
    }

    /* Which grid card a point is in, or -1. Answers for EMPTY cards too, which
       is what separates it from photoAt(): clicking an empty card has to select
       it, so that the next upload and the size slider have somewhere to go. */
    function cardAt(pt, W, H) {
        if (layoutOf(state.frame) !== "browser") {
            return -1;
        }
        const x = pt.x * W;
        const y = pt.y * H;
        const rects = gridRects(W, H);
        for (let i = 0; i < rects.length; i += 1) {
            const r = rects[i];
            if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
                return i;
            }
        }
        /* The account circle, tested as a CIRCLE rather than as its bounding
           box. The box would claim the paper at each corner, and the corner
           nearest the page edge is a place a caption can legitimately sit. */
        const s = screenScale(W, H);
        const a = SCREEN.avatar;
        const dx = x - a.cx * s.fx;
        const dy = y - a.cy * s.fy;
        const rr = a.r * s.fx;
        if (dx * dx + dy * dy <= rr * rr) {
            return AVATAR_SLOT;
        }
        return -1;
    }

    /* The search bar's own hit area, so clicking the words on the poster takes
       you to the field that changes them -- the same loop cardIndexAt() closes
       for the corner letters, for the same reason: the visitor is looking at
       the bar, so that is where the way in should be. */
    function queryBarAt(pt, W, H) {
        if (layoutOf(state.frame) !== "browser") {
            return false;
        }
        const s = screenScale(W, H);
        const x = pt.x * W;
        const y = pt.y * H;
        return x >= SCREEN.pill.x * s.fx && x <= (SCREEN.pill.x + SCREEN.pill.w) * s.fx &&
            y >= SCREEN.pill.y * s.fy && y <= (SCREEN.pill.y + SCREEN.pill.h) * s.fy;
    }

    /* Which photograph a point belongs to, and the box it was drawn into. The
       split layout owns two divided by its seam, the search screen owns six in
       a masonry, and every other style owns one. Returns null where there is no
       photograph to move, so a drag on an empty panel does nothing rather than
       silently adjusting a framing nobody can see.

       The RECT comes back with it rather than being re-derived by the caller
       from photoRectFor(): with six boxes on the page, "the photograph under
       the pointer" and "the box the controls are pointing at" can be different
       things for one frame, and a drag measured against the wrong box moves at
       the wrong speed. */
    /* Which photo slot a point falls in, FILLED OR NOT, and -1 for none.

       Emptiness is deliberately not part of the question. Two things need the
       answer and they need it for opposite reasons: a drag wants the slot
       because there is a photograph in it, and a click on the placeholder wants
       the slot because there is not. Asking once and testing `photos[i]` at the
       call site is what keeps those two from drifting into two hit-tests that
       disagree about where a panel's edge is. */
    function slotAt(pt, W, H) {
        const layout = layoutOf(state.frame);
        if (layout === "browser") {
            return cardAt(pt, W, H);
        }
        const r = photoRectFor(W, H);
        const x = pt.x * W;
        const y = pt.y * H;
        if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) {
            return -1;
        }
        if (layout === "split") {
            const g = splitGeometry(W, H);
            const t = (x - g.x) / g.w;
            const seamY = g.seamLeftY + t * (g.seamRightY - g.seamLeftY);
            return y > seamY ? 1 : 0;
        }
        return 0;
    }

    /* The box a given slot's photograph is drawn into. */
    function rectForSlot(i, W, H) {
        if (layoutOf(state.frame) !== "browser") {
            return photoRectFor(W, H);
        }
        return i === AVATAR_SLOT ? avatarRect(W, H) : gridRects(W, H)[i];
    }

    /* Which photograph a point belongs to, and the box it was drawn into.
       Returns null where there is no photograph to move, so a drag on an empty
       panel does nothing rather than silently adjusting a framing nobody can
       see -- the click on that panel is an UPLOAD now, handled separately.

       The RECT comes back with it rather than being re-derived by the caller:
       with seven boxes on the page, "the photograph under the pointer" and "the
       box the controls are pointing at" can be different things for one frame,
       and a drag measured against the wrong box moves at the wrong speed. */
    function photoAt(pt, W, H) {
        const i = slotAt(pt, W, H);
        if (i === -1 || !photos[i]) {
            return null;
        }
        return {
            img: photos[i], view: state.views[i], index: i,
            /* The split layout's lower half is drawn upside down, so a drag
               there has to follow the pointer rather than the source. */
            flipped: layoutOf(state.frame) === "split" && i === 1,
            rect: rectForSlot(i, W, H)
        };
    }

    /* The upload that belongs to a slot. Clicking the placeholder on the
       preview opens the same picker the panel's own button does -- the same
       input element, so the one mime gate and the one assignment path serve
       both routes and there is nothing here to keep in step. */
    function openUploadFor(i) {
        const layout = layoutOf(state.frame);
        let id = "p-image";
        if (layout === "browser") {
            id = i === AVATAR_SLOT ? "p-image-avatar" : "p-image-grid";
        } else if (layout === "split" && i === 1) {
            id = "p-image-b";
        }
        const input = byId(id);
        if (input) {
            input.click();
        }
    }

    canvas.addEventListener("pointerdown", (ev) => {
        const pt = canvasPoint(ev);
        const corner = cardIndexAt(pt, canvas.width, canvas.height);
        if (corner) {
            focusRankFor(corner);
            return;
        }
        if (queryBarAt(pt, canvas.width, canvas.height)) {
            /* Anywhere on the pill puts the caret in the search bar, which is
               what the source artwork's own script does -- the input covers the
               words, not the whole pill, so without this a click beside the
               magnifier would do nothing. The panel field is the fallback for
               when the inline one is not on screen, which on a phone is
               whenever the form tab is showing. */
            if (queryLive && !queryLive.hidden) {
                queryLive.focus();
            } else {
                focusField(byId("p-query"));
            }
            return;
        }
        const hit = hitTest(pt);
        if (!hit) {
            /* A click on a grid card selects it whether or not there is a
               photograph in it, and then falls through to the drag below -- so
               one press on a filled card both points the controls at it and
               starts moving it, which is what the text elements have always
               done. */
            const card = cardAt(pt, canvas.width, canvas.height);
            if (card !== -1 && card !== state.card) {
                state.card = card;
                syncPhotoControls();
                render();
            }
            /* An EMPTY photo area opens its own file picker. The panel says
               "Upload a photo to begin" in the middle of that area, and until
               now that was a caption rather than a control -- the visitor read
               an instruction and had to go and find the button that carried it
               out. Clicking the words does the thing the words describe.

               This runs on pointerdown, inside the gesture, because opening a
               file dialog needs a user activation. Nothing is dragged from an
               empty panel anyway, so there is no interaction to lose. */
            const empty = slotAt(pt, canvas.width, canvas.height);
            if (empty !== -1 && !photos[empty]) {
                openUploadFor(empty);
                return;
            }
            /* Nothing else claimed the point, so it belongs to the photograph
               under it. Text wins on purpose: a caption sitting over a photo
               has to stay draggable. */
            const target = photoAt(pt, canvas.width, canvas.height);
            if (target) {
                const r = target.rect;
                const m = photoMetrics(target.img, r.w, r.h, target.view);
                panning = {
                    index: target.index, startX: pt.x, startY: pt.y,
                    fromX: target.view.x, fromY: target.view.y,
                    scale: m.scale, slackX: m.slackX, slackY: m.slackY,
                    flipped: target.flipped, moved: false
                };
                canvas.setPointerCapture(ev.pointerId);
                canvas.style.cursor = "grabbing";
            }
            return;
        }
        state.sel = hit.id;
        dragging = { id: hit.id, dx: pt.x - hit.x, dy: pt.y - hit.y, moved: false };
        canvas.setPointerCapture(ev.pointerId);
        syncControls();
        render();
    });

    /* What the pointer says the canvas will do, which is the only thing telling
       anyone that the placeholder is clickable at all. Without it the upload
       area is a control that looks exactly like a caption.

       Skipped entirely while a drag is running: the cursor is already set for
       that, and hit-testing on every move of a drag is work for an answer
       nobody reads. */
    function syncCursor(pt) {
        const W = canvas.width;
        const H = canvas.height;
        if (cardIndexAt(pt, W, H) || queryBarAt(pt, W, H)) {
            canvas.style.cursor = "text";
            return;
        }
        if (hitTest(pt)) {
            canvas.style.cursor = "move";
            return;
        }
        const i = slotAt(pt, W, H);
        if (i === -1) {
            canvas.style.cursor = "default";
        } else if (photos[i]) {
            canvas.style.cursor = "grab";
        } else {
            canvas.style.cursor = "pointer";
        }
    }

    canvas.addEventListener("pointermove", (ev) => {
        if (!panning && !dragging) {
            syncCursor(canvasPoint(ev));
        }
        if (panning) {
            const pt = canvasPoint(ev);
            if (!panning.moved) {
                beginChange();
                panning.moved = true;
            }
            /* Pointer delta in canvas pixels, converted to source pixels, then
               to a fraction of the slack. Negated because moving the crop right
               through the source moves the picture LEFT on the page -- and
               negated AGAIN for the split layout's lower half, which is drawn
               upside down, so a drag has to follow the pointer rather than the
               source. */
            const dir = panning.flipped ? 1 : -1;
            const dxPx = (pt.x - panning.startX) * canvas.width * dir;
            const dyPx = (pt.y - panning.startY) * canvas.height * dir;
            const view = state.views[panning.index];
            view.x = panning.slackX > 0
                ? clampUnit(panning.fromX + (dxPx / panning.scale) / panning.slackX)
                : 0;
            view.y = panning.slackY > 0
                ? clampUnit(panning.fromY + (dyPx / panning.scale) / panning.slackY)
                : 0;
            render();
            return;
        }
        if (!dragging) {
            return;
        }
        const el = state.texts.find((t) => t.id === dragging.id);
        if (!el) { return; }
        if (!dragging.moved) {
            beginChange();
            dragging.moved = true;
        }
        const pt = canvasPoint(ev);
        el.x = Math.min(1, Math.max(0, pt.x - dragging.dx));
        el.y = Math.min(1, Math.max(0, pt.y - dragging.dy));
        render();
    });

    canvas.addEventListener("pointerup", (ev) => {
        canvas.style.cursor = "";
        if (panning && panning.moved) {
            commit();
            syncPhotoControls();
        }
        panning = null;
        if (dragging && dragging.moved) {
            commit();
        }
        dragging = null;
        try { canvas.releasePointerCapture(ev.pointerId); } catch (err) { /* not captured */ }
    });

    /* ----------------------------------------------------------------------
       Image upload with explicit mime-type validation. Execution terminates
       immediately when file.type does not match the image.* designation.
       ---------------------------------------------------------------------- */

    /* THE mime gate. Every upload path on this page reaches an Image through
       this one function, which is what keeps the check that is a security
       control rather than a convenience from existing in three copies -- and
       three copies is what a second and then a sixth photograph would have
       produced. `fail` takes a message; it never throws, because a rejected
       file is an ordinary thing a visitor does, not an error. */
    function readImage(file, ok, fail) {
        if (!/^image\//.test(file.type)) {
            fail("That file is not an image. Please choose a JPG, PNG, or WebP file.");
            return;
        }
        const reader = new FileReader();
        reader.addEventListener("load", () => {
            const img = new Image();
            img.addEventListener("load", () => ok(img));
            img.addEventListener("error", () => {
                fail("That image could not be decoded. Please try a different file.");
            });
            img.src = reader.result;
        });
        reader.addEventListener("error", () => {
            fail("That file could not be read. Please try a different file.");
        });
        reader.readAsDataURL(file);
    }

    /* One single-photograph input. `assign` is what differs between the two
       that exist, and it is the only thing that differs. */
    function bindPhotoInput(inputId, errorId, assign) {
        const input = document.getElementById(inputId);
        const error = document.getElementById(errorId);
        if (!input || !error) {
            return;
        }
        input.addEventListener("change", () => {
            error.textContent = "";
            const file = input.files && input.files[0];
            if (!file) {
                return;
            }
            readImage(file, (img) => {
                assign(img);
                render();
            }, (message) => {
                error.textContent = message;
                input.value = "";
                assign(null);
                render();
            });
        });
    }

    /* A new photograph starts at the plain cover fit. Carrying the previous
       one's framing over would apply somebody's crop of one picture to a
       different picture, which is never what they meant. */
    function fillSlot(i, img) {
        photos[i] = img;
        state.views[i] = defaultView();
        syncPhotoControls();
    }

    bindPhotoInput("p-image", "p-image-error", (img) => fillSlot(0, img));
    bindPhotoInput("p-image-b", "p-image-b-error", (img) => fillSlot(1, img));
    bindPhotoInput("p-image-avatar", "p-image-avatar-error", (img) => fillSlot(AVATAR_SLOT, img));

    /* Where the next batch of files lands: every empty card in reading order
       first, and then -- once there are none left -- the SELECTED card and the
       ones after it, wrapping round. Two rules rather than one because they
       answer two different questions. Filling the empty cards is what makes
       "choose six photos" work in a single gesture; falling back to the
       selection is what makes a seventh upload replace something visible
       instead of being silently dropped, which is the failure a visitor cannot
       tell from a broken control. */
    function uploadTargets(count) {
        const out = [];
        /* The SELECTED card first, when it is empty and there is a file for it.
           Clicking an empty card on the preview is now how the picker gets
           opened, and it also selects that card -- so a photograph that landed
           in a different one would read as the click having missed. When
           nothing in particular is selected this is card 1, which is where the
           reading order below would have put it anyway. */
        if (count > 0 && state.card < GRID_SLOTS && !photos[state.card]) {
            out.push(state.card);
        }
        for (let i = 0; i < GRID_SLOTS && out.length < count; i += 1) {
            if (!photos[i] && out.indexOf(i) === -1) { out.push(i); }
        }
        /* Cards only, never the account circle: that has its own input, and a
           batch of six photographs must not silently claim it. The modulo is
           taken against a card index for the same reason -- the circle can be
           the selected slot, and 6 % 6 would quietly restart at card 1. */
        const from = state.card < GRID_SLOTS ? state.card : 0;
        for (let k = 0; k < GRID_SLOTS && out.length < count; k += 1) {
            const i = (from + k) % GRID_SLOTS;
            if (out.indexOf(i) === -1) { out.push(i); }
        }
        return out;
    }

    /* The grid's own input: many files at once, each one decoded through the
       same gate as every other upload.

       Slots are allocated SYNCHRONOUSLY, in the order the files were chosen,
       before any of them is decoded. Decoding is asynchronous and a small
       photograph finishes ahead of a large one, so allocating on completion
       would put the pictures in a different order every time, depending on
       nothing the visitor can see. */
    (() => {
        const input = byId("p-image-grid");
        const error = byId("p-image-grid-error");
        if (!input || !error) {
            return;
        }
        input.addEventListener("change", () => {
            error.textContent = "";
            const files = Array.prototype.slice.call(input.files || []);
            if (!files.length) {
                return;
            }
            const targets = uploadTargets(files.length);
            if (files.length > targets.length) {
                error.textContent = "There are six cards, so " +
                    (files.length - targets.length) + " of those files were not used.";
            }
            targets.forEach((slot, n) => {
                readImage(files[n], (img) => {
                    fillSlot(slot, img);
                    render();
                }, (message) => {
                    error.textContent = message;
                });
            });
            /* Cleared so choosing the same file again still fires a change. */
            input.value = "";
        });
    })();

    /* Which framing the shared size slider drives: the selected card on the
       search screen, and slot 0 on every other layout, which is the only
       photograph they have. Read at event time rather than bound once, because
       the selection moves. */
    /* What a slot is called, in the one place both the menu and the slider
       label read from, so they cannot disagree about which photograph the
       controls are pointing at. */
    function slotName(i) {
        return i === AVATAR_SLOT ? "Profile circle" : "Card " + (i + 1);
    }

    function primarySlot() {
        return layoutOf(state.frame) === "browser" ? state.card : 0;
    }

    /* The framing controls. The first pair serves whichever slot primarySlot()
       names; the second belongs to the split layout's lower half alone. */
    [["p-zoom", "p-zoom-reset", primarySlot], ["p-zoom-b", "p-zoom-b-reset", () => 1]]
        .forEach((entry) => {
            const slider = byId(entry[0]);
            const reset = byId(entry[1]);
            const slot = entry[2];
            if (slider) {
                slider.addEventListener("input", () => {
                    const i = slot();
                    beginChange();
                    state.views[i].zoom = Math.max(1, (Number(slider.value) || 100) / 100);
                    commit("zoom-" + i);
                });
            }
            if (reset) {
                reset.addEventListener("click", () => {
                    beginChange();
                    state.views[slot()] = defaultView();
                    commit();
                    syncPhotoControls();
                });
            }
        });

    /* Empties the selected card. The only way back from a photograph in the
       wrong card, since an upload fills the empty cards first and would never
       choose an occupied one on its own.

       Writes NO history entry, exactly as an upload does not. Photographs have
       never been in the undo stack -- they are not in `state` at all, for the
       storage reason above -- so a commit here would push an entry that
       restores the framing of a photograph undo cannot bring back. An undo that
       visibly does nothing is worse than one that is not offered. */
    const cardClear = byId("p-card-clear");
    if (cardClear) {
        cardClear.addEventListener("click", () => {
            fillSlot(state.card, null);
            render();
        });
    }

    const themeSelect = byId("p-screen-theme");
    if (themeSelect) {
        themeSelect.addEventListener("change", () => {
            beginChange();
            state.screenTheme = SCREEN_THEMES[themeSelect.value]
                ? themeSelect.value : DEFAULT_SCREEN_THEME;
            commit();
            render();
        });
    }

    const cardPick = byId("p-card-pick");
    if (cardPick) {
        cardPick.addEventListener("change", () => {
            state.card = Math.min(SLOT_COUNT - 1, Math.max(0, Number(cardPick.value) || 0));
            syncPhotoControls();
            render();
        });
    }

    /* The search bar, typed on directly.

       Position, width and type size all come from the SAME constants
       paintScreen() draws from, converted through the canvas's RENDERED size
       rather than its pixel size -- the canvas is 990px wide internally and
       whatever CSS gives it on screen, and the input lives in CSS pixels.

       The font size is fitQuerySize(), not SCREEN.query.size, because a long
       query is set down to fit and the caret has to land between the glyphs
       that are actually drawn. Same function, same number, so it does.

       Called from render(), which is what runs on every keystroke, paper-size
       change and undo -- and from a resize listener, because none of those fire
       when the pane merely gets wider. */
    /* The inline input's own font size, which is NOT the size it renders at --
       see the transform in syncQueryInput(). Sixteen because that is where iOS
       stops zooming the page when it focuses a field. */
    const QUERY_LIVE_FONT = 16;

    function syncQueryInput() {
        /* The panel field FIRST, and before any early return.

           There are two ways to type the same string now, and each has to
           follow the other. This direction is the one that is easy to miss:
           typing inline commits and repaints, but nothing else writes the
           result back to the panel -- so the panel keeps the value it had, and
           the next keystroke there reverts everything typed on the poster.
           render() runs after every commit, which is what makes this the right
           place for it. */
        const panel = byId("p-query");
        if (panel && panel.value !== state.query) {
            panel.value = state.query;
        }
        if (!queryLive) {
            return;
        }
        if (layoutOf(state.frame) !== "browser") {
            queryLive.hidden = true;
            return;
        }
        queryLive.hidden = false;

        const rect = canvas.getBoundingClientRect();
        if (!rect.width) {
            /* The preview is on the other tab, so there is nothing to sit over.
               Leaving the last position would put an invisible input across a
               pane it no longer belongs to. */
            return;
        }
        /* CSS pixels per canvas pixel, and canvas pixels per artboard point. */
        const k = rect.width / canvas.width;
        const s = screenScale(canvas.width, canvas.height);
        const size = fitQuerySize(ctx, state.query, canvas.width) * k;

        /* The element stays at QUERY_LIVE_FONT and a transform does the sizing,
           so its COMPUTED font-size never drops under the 16px at which iOS
           zooms the page on focus. Width and height are therefore divided by
           the scale: they are pre-transform lengths, and the transform is what
           brings them back to the sizes wanted on screen. */
        const scale = size / QUERY_LIVE_FONT;
        queryLive.style.left = (SCREEN.query.x * s.fx * k) + "px";
        queryLive.style.width = ((QUERY_MAX_W * s.fx * k) / scale) + "px";
        queryLive.style.transform = "scale(" + scale + ")";
        /* Positioned on the BASELINE the canvas draws from: the input's own box
           is its line height, and the text sits centred in it, so the top is
           the baseline less the part of the em that rises above it. 0.8 of the
           size is Inter's ascent closely enough that the caret brackets the
           drawn glyphs rather than floating over them. The transform's origin
           is this corner, so the arithmetic is the same either way. */
        queryLive.style.height = (QUERY_LIVE_FONT * 1.35) + "px";
        queryLive.style.top = (SCREEN.query.baseline * s.fy * k - size * 0.8 -
            size * 0.175) + "px";
        queryLive.style.caretColor = screenTheme().query;

        if (queryLive.value !== state.query) {
            queryLive.value = state.query;
        }
    }

    const queryLive = byId("p-query-live");
    if (queryLive) {
        const applyLive = (coalesceKey) => {
            const next = cleanQuery(queryLive.value);
            if (state.query === next) {
                return;
            }
            beginChange();
            state.query = next;
            commit(coalesceKey);
            /* commit() repaints through afterChange(), and render() calls
               syncQueryInput(), which writes the cleaned value back. */
        };
        queryLive.addEventListener("input", () => applyLive("query"));
        queryLive.addEventListener("change", () => applyLive(null));
        /* Enter has nothing to submit -- there is no form here and no search to
           run -- so it blurs, which is what it appears to do on the real thing. */
        queryLive.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter") {
                ev.preventDefault();
                queryLive.blur();
            }
        });
    }

    /* The pane resizing moves the canvas without redrawing it, and the input is
       positioned against the canvas's rendered size. */
    window.addEventListener("resize", syncQueryInput);

    /* Pushes the framing back into its slider -- after a drag, an undo, a fresh
       upload or a change of selected card -- and hides the whole group when
       there is no photograph to frame, since a size control over an empty panel
       does nothing. */
    function syncPhotoControls() {
        const layout = layoutOf(state.frame);
        const grid = layout === "browser";
        const slot = primarySlot();
        const zoom = byId("p-zoom");
        const zoomB = byId("p-zoom-b");
        const group = byId("p-frame-fields");
        const label = byId("p-zoom-label");

        if (zoom) { zoom.value = Math.round(state.views[slot].zoom * 100); }
        if (zoomB) { zoomB.value = Math.round(state.views[1].zoom * 100); }
        if (group) { group.hidden = !photos[slot]; }
        /* One slider serves six cards on the search screen, so it has to say
           which one it is holding -- otherwise a visitor who selected card 4 is
           given a control labelled for a photograph they are not looking at. */
        if (label) {
            label.textContent = grid ? slotName(slot) + " Size" : "Photo Size";
        }

        const groupB = byId("p-zoom-b");
        if (groupB && groupB.parentElement) {
            groupB.parentElement.hidden = layout !== "split" || !photos[1];
        }

        const pick = byId("p-card-pick");
        if (pick) {
            if (pick.value !== String(slot)) { pick.value = String(slot); }
            /* Which cards are already taken, in the menu rather than only on the
               canvas: on a phone the preview is a separate tab, so the menu is
               the only place that answer can be while the form is open. */
            Array.prototype.forEach.call(pick.options, (o, i) => {
                const text = slotName(i) + (photos[i] ? "" : " (empty)");
                if (o.textContent !== text) { o.textContent = text; }
            });
        }

        const clear = byId("p-card-clear");
        if (clear) { clear.disabled = !grid || !photos[state.card]; }
    }

    /* ----------------------------------------------------------------------
       Control wiring
       ---------------------------------------------------------------------- */

    function byId(id) {
        return document.getElementById(id);
    }

    /* Binds one control to one property of the selected text element. */
    function bindText(id, prop, read, coalesce) {
        const el = byId(id);
        if (!el) {
            return;
        }
        const evName = el.type === "checkbox" || el.tagName === "SELECT" ? "change" : "input";
        el.addEventListener(evName, () => {
            const t = selected();
            if (!t) { return; }
            beginChange();
            t[prop] = read(el);
            commit(coalesce ? prop + ":" + t.id : null);
            render();
        });
    }

    function bindToggle(id, prop) {
        const el = byId(id);
        if (!el) {
            return;
        }
        el.addEventListener("click", () => {
            const t = selected();
            if (!t) { return; }
            beginChange();
            t[prop] = !t[prop];
            el.setAttribute("aria-pressed", String(t[prop]));
            commit();
            render();
        });
    }

    /* Pushes the selected element's state back into every control, so the
       toolbar always describes what is actually selected rather than the last
       thing that was typed into it. */
    function syncControls() {
        const t = selected();
        const bar = byId("text-toolbar");
        if (bar) {
            bar.hidden = !t;
        }
        if (!t) {
            return;
        }
        const set = (id, v) => { const e = byId(id); if (e) { e.value = v; } };
        const press = (id, v) => { const e = byId(id); if (e) { e.setAttribute("aria-pressed", String(v)); } };

        set("t-caption", t.text);
        set("t-font", t.font);
        set("t-size", Math.round(t.size * 1000));
        set("t-color", t.color);
        set("t-align", t.align);
        set("t-list", t.list);
        set("t-letter", t.letter);
        set("t-line", t.line);
        set("t-opacity", Math.round(t.opacity * 100));
        set("t-anchor", t.anchor);
        set("t-boxw", Math.round(t.boxW * 100));
        set("t-posx", Math.round(t.x * 100));
        set("t-posy", Math.round(t.y * 100));

        press("t-bold", t.bold);
        press("t-italic", t.italic);
        press("t-underline", t.underline);
        press("t-strike", t.strike);
        press("t-upper", t.upper);
        press("t-lig", t.ligatures);
    }

    bindText("t-caption", "text", (e) => e.value, true);
    bindText("t-font", "font", (e) => e.value);
    bindText("t-size", "size", (e) => Math.max(5, Number(e.value) || 43) / 1000, true);
    bindText("t-color", "color", (e) => e.value, true);
    bindText("t-align", "align", (e) => e.value);
    bindText("t-list", "list", (e) => e.value);
    bindText("t-letter", "letter", (e) => Number(e.value) || 0, true);
    bindText("t-line", "line", (e) => Number(e.value) || 1.25, true);
    bindText("t-opacity", "opacity", (e) => Math.min(100, Math.max(0, Number(e.value) || 100)) / 100, true);
    bindText("t-anchor", "anchor", (e) => e.value);
    bindText("t-boxw", "boxW", (e) => Math.min(100, Math.max(5, Number(e.value) || 80)) / 100, true);
    bindText("t-posx", "x", (e) => Math.min(100, Math.max(0, Number(e.value) || 50)) / 100, true);
    bindText("t-posy", "y", (e) => Math.min(100, Math.max(0, Number(e.value) || 88)) / 100, true);

    bindToggle("t-bold", "bold");
    bindToggle("t-italic", "italic");
    bindToggle("t-underline", "underline");
    bindToggle("t-strike", "strike");
    bindToggle("t-upper", "upper");
    bindToggle("t-lig", "ligatures");

    const frameSelect = byId("p-frame");
    if (frameSelect) {
        frameSelect.addEventListener("change", () => {
            beginChange();
            state.frame = FRAME_STYLES[frameSelect.value] ? frameSelect.value : "black";
            commit();
            syncDocControls();
        });
    }

    const rankHeadInput = byId("p-rank-head");
    const rankFootInput = byId("p-rank-foot");

    /* Both events, and they are not redundant. `input` is the visitor typing,
       and coalesces so a two-character rank is one history entry rather than
       two. `change` is the datalist being picked with the mouse, a paste
       committed by blurring -- and the verification suite, which sets .value
       and dispatches change to prove the CONTROL reached the export. */
    [[rankHeadInput, "rankHead"], [rankFootInput, "rankFoot"]].forEach((entry) => {
        const el = entry[0];
        if (!el) {
            return;
        }
        const apply = (coalesceKey) => {
            const next = cleanRank(el.value);
            if (state[entry[1]] === next) {
                return;
            }
            beginChange();
            state[entry[1]] = next;
            commit(coalesceKey);
        };
        el.addEventListener("input", () => apply("rank-" + entry[1]));
        el.addEventListener("change", () => apply(null));
    });

    /* The search bar's text. Same two events as the ranks and for the same
       reasons -- typing coalesces into one history entry per burst, and `change`
       catches a paste committed by blurring. */
    const queryInput = byId("p-query");
    if (queryInput) {
        const applyQuery = (coalesceKey) => {
            const next = cleanQuery(queryInput.value);
            if (state.query === next) {
                return;
            }
            beginChange();
            state.query = next;
            commit(coalesceKey);
        };
        queryInput.addEventListener("input", () => applyQuery("query"));
        queryInput.addEventListener("change", () => applyQuery(null));
    }

    /* Pushes state back INTO the document-level controls. syncControls() next
       to it does the same job for the text toolbar, and deliberately returns
       early when nothing is selected, so it was never the place for these.

       Undo and redo are why this exists: they rewrite state wholesale, and
       until now nothing wrote the result back to these selects -- undoing a
       frame change repainted the canvas correctly and left the Frame Style
       select showing the style that had just been undone. The rank selects
       would have inherited exactly that. */
    function syncDocControls() {
        const style = FRAME_STYLES[state.frame] || FRAME_STYLES.black;
        if (frameSelect) { frameSelect.value = state.frame; }
        if (sizeSelect) { sizeSelect.value = state.size; }
        /* Compared before writing, on all three: these are text fields now, and
           assigning .value to what it already holds still drops the caret to
           the end of the field mid-word. */
        if (nameInput && nameInput.value !== state.name) { nameInput.value = state.name; }
        if (rankHeadInput && rankHeadInput.value !== state.rankHead) { rankHeadInput.value = state.rankHead; }
        if (rankFootInput && rankFootInput.value !== state.rankFoot) { rankFootInput.value = state.rankFoot; }
        if (queryInput && queryInput.value !== state.query) { queryInput.value = state.query; }
        if (themeSelect) { themeSelect.value = state.screenTheme; }

        /* Both card layouts carry corner indices, so the rank fields belong to
           either of them; the second upload belongs to the split one alone. */
        const cardFields = byId("p-card-fields");
        if (cardFields) {
            cardFields.hidden = style.layout !== "card" && style.layout !== "split";
        }

        const splitFields = byId("p-split-fields");
        if (splitFields) {
            splitFields.hidden = style.layout !== "split";
        }

        /* The search screen's upload is a different control from the others' --
           six cards at once rather than one panel -- so the two swap places
           rather than sitting side by side. Leaving the single Photo Upload
           visible would give the grid two ways in, one of which only ever fills
           card 1, which reads as the other one being broken. */
        const grid = style.layout === "browser";
        const gridFields = byId("p-grid-fields");
        if (gridFields) { gridFields.hidden = !grid; }
        const photoFields = byId("p-photo-fields");
        if (photoFields) { photoFields.hidden = grid; }

        syncPhotoControls();
    }

    const sizeSelect = byId("p-size");
    if (sizeSelect) {
        sizeSelect.addEventListener("change", () => {
            beginChange();
            state.size = PAPER[sizeSelect.value] ? sizeSelect.value : "A3";
            commit();
            render();
        });
    }

    const nameInput = byId("doc-name");
    if (nameInput) {
        nameInput.addEventListener("input", () => {
            beginChange();
            state.name = nameInput.value.slice(0, 80);
            commit("name");
        });
    }

    const addBtn = byId("t-add");
    if (addBtn) {
        addBtn.addEventListener("click", () => {
            beginChange();
            const id = "t" + (Date.now().toString(36));
            const el = defaultText(id, "New text");
            el.y = 0.2;
            el.bold = false;
            el.italic = false;
            state.texts.push(el);
            state.sel = id;
            commit();
            syncControls();
            render();
        });
    }

    const delBtn = byId("t-delete");
    if (delBtn) {
        delBtn.addEventListener("click", () => {
            if (state.texts.length <= 1) {
                return;
            }
            beginChange();
            state.texts = state.texts.filter((t) => t.id !== state.sel);
            state.sel = state.texts[0].id;
            commit();
            syncControls();
            render();
        });
    }

    const undoBtn = byId("act-undo");
    const redoBtn = byId("act-redo");
    if (undoBtn) { undoBtn.addEventListener("click", undo); }
    if (redoBtn) { redoBtn.addEventListener("click", redo); }

    document.addEventListener("keydown", (ev) => {
        const mod = ev.ctrlKey || ev.metaKey;
        if (!mod) {
            return;
        }
        const k = ev.key.toLowerCase();
        if (k === "z" && !ev.shiftKey) {
            ev.preventDefault();
            undo();
        } else if ((k === "z" && ev.shiftKey) || k === "y") {
            ev.preventDefault();
            redo();
        }
    });

    /* ----------------------------------------------------------------------
       Emoji picker. Inserts at the caret of the caption field rather than
       appending, so it behaves like typing.
       ---------------------------------------------------------------------- */

    function initEmoji() {
        const host = byId("emoji-grid");
        const toggle = byId("emoji-toggle");
        const panel = byId("emoji-panel");
        if (!host || !toggle || !panel) {
            return;
        }

        Object.keys(EMOJI).forEach((group) => {
            const h = document.createElement("h4");
            h.textContent = group;
            host.appendChild(h);
            const row = document.createElement("div");
            row.className = "emoji-row";
            EMOJI[group].split(/\s+/).filter(Boolean).forEach((ch) => {
                const b = document.createElement("button");
                b.type = "button";
                /* textContent, never innerHTML -- the same discipline the rest
                   of the project applies to anything reaching the DOM. */
                b.textContent = ch;
                b.setAttribute("aria-label", "Insert " + ch);
                b.addEventListener("click", () => insertEmoji(ch));
                row.appendChild(b);
            });
            host.appendChild(row);
        });

        toggle.addEventListener("click", () => {
            const open = panel.hidden;
            panel.hidden = !open;
            toggle.setAttribute("aria-expanded", String(open));
        });

        document.addEventListener("click", (ev) => {
            if (panel.hidden) { return; }
            if (panel.contains(ev.target) || toggle.contains(ev.target)) { return; }
            panel.hidden = true;
            toggle.setAttribute("aria-expanded", "false");
        });
    }

    function insertEmoji(ch) {
        const t = selected();
        const field = byId("t-caption");
        if (!t || !field) {
            return;
        }
        const start = field.selectionStart === null ? field.value.length : field.selectionStart;
        const end = field.selectionEnd === null ? field.value.length : field.selectionEnd;
        beginChange();
        t.text = field.value.slice(0, start) + ch + field.value.slice(end);
        field.value = t.text;
        const caret = start + ch.length;
        field.setSelectionRange(caret, caret);
        field.focus();
        commit();
        render();
    }

    /* ----------------------------------------------------------------------
       Export
       ---------------------------------------------------------------------- */

    function renderTo(w, h, opts) {
        const off = document.createElement("canvas");
        off.width = w;
        off.height = h;
        paint(off.getContext("2d"), w, h, opts);
        return off;
    }

    /* The poster editor was the ONE editor whose name field already reached
       its export; the other three ignored theirs entirely. It uses the shared
       slug now so a file downloaded here is named the same way as one from
       any other editor (August 24, 2026), and it treats the untouched default
       the way they do -- "untitled-poster.png" tells the visitor nothing they
       did not already know, so an untouched field falls back to the brand
       name instead. */
    function fileName(ext) {
        const named = String(state.name || "").trim() === DEFAULT_POSTER_NAME
            ? ""
            : TB.fileSlug(state.name);
        return (named || "templatebox-poster") + "." + ext;
    }

    function downloadBlob(blob, name) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
    }

    function dataUrlToBlob(url) {
        const parts = url.split(",");
        const mime = parts[0].match(/:(.*?);/)[1];
        const bin = atob(parts[1]);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) {
            arr[i] = bin.charCodeAt(i);
        }
        return new Blob([arr], { type: mime });
    }

    function readOpts() {
        const get = (id) => byId(id);
        const val = (id, d) => { const e = get(id); return e ? e.value : d; };
        const on = (id) => { const e = get(id); return !!(e && e.checked); };
        return {
            type: val("dl-type", "png"),
            dpi: Number(val("dl-dpi", DEFAULT_DPI)) || DEFAULT_DPI,
            jpgQuality: val("dl-jpg-quality", "high"),
            pngQuality: val("dl-png-quality", "high"),
            transparent: on("dl-transparent"),
            pdfPreset: val("dl-pdf-preset", "digital"),
            colorProfile: val("dl-pdf-profile", "rgb"),
            compress: on("dl-pdf-compress"),
            cropMarks: on("dl-pdf-crop"),
            flatten: on("dl-pdf-flatten"),
            notes: on("dl-pdf-notes"),
            password: val("dl-pdf-password", "")
        };
    }

    function exportPNG(o) {
        const s = exportSize(o.dpi);
        const c = renderTo(s.w, s.h, { transparent: o.transparent });
        /* PNG is lossless, so "quality" cannot mean JPEG-style compression.
           It maps to output scale instead, and the panel says so rather than
           implying a quality slider the format does not have. */
        const scale = o.pngQuality === "compress" ? 0.6 : (o.pngQuality === "limit" ? 0.8 : 1);
        const out = scale === 1 ? c : (() => {
            const d = document.createElement("canvas");
            d.width = Math.round(s.w * scale);
            d.height = Math.round(s.h * scale);
            d.getContext("2d").drawImage(c, 0, 0, d.width, d.height);
            return d;
        })();
        downloadBlob(dataUrlToBlob(out.toDataURL("image/png")), fileName("png"));
    }

    function exportJPG(o) {
        const s = exportSize(o.dpi);
        /* JPEG has no alpha, so a transparent request would flatten to black.
           Paint the opaque background regardless and let the panel hide the
           transparency toggle for this format. */
        const c = renderTo(s.w, s.h, { transparent: false });
        const q = o.jpgQuality === "low" ? 0.5 : (o.jpgQuality === "medium" ? 0.75 : 0.92);
        downloadBlob(dataUrlToBlob(c.toDataURL("image/jpeg", q)), fileName("jpg"));
    }

    /* RGB -> CMYK, naive and declared as such. jsPDF has no colour-management
       pipeline and no ICC profile handling, so this is a numeric conversion,
       not a colorimetric separation: it will not match a press proof. The
       control is offered because the device-CMYK tag is genuinely written into
       the PDF and some print shops require it, and the panel says exactly this
       rather than implying press accuracy. */
    function rgbToCmyk(hex) {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        const k = 1 - Math.max(r, g, b);
        if (k === 1) {
            return [0, 0, 0, 100];
        }
        return [
            Math.round((1 - r - k) / (1 - k) * 100),
            Math.round((1 - g - k) / (1 - k) * 100),
            Math.round((1 - b - k) / (1 - k) * 100),
            Math.round(k * 100)
        ];
    }

    function exportPDF(o) {
        const ctor = window.jspdf && window.jspdf.jsPDF;
        if (!ctor) {
            window.alert("The PDF engine did not load. Check your connection and try again.");
            return;
        }
        const p = paper();
        const isPrint = o.pdfPreset === "print";
        const bleed = isPrint && o.cropMarks ? 3 : 0;
        const opts = { orientation: p.w > p.h ? "l" : "p", unit: "mm", format: [p.w + bleed * 2, p.h + bleed * 2] };
        if (o.password) {
            opts.encryption = { userPassword: o.password, ownerPassword: o.password };
        }
        const doc = new ctor(opts);

        /* The artwork is a raster composite (it contains an uploaded photo),
           so it is placed as an image -- but the TEXT is then drawn again on
           top with doc.text(), the native vector text API. That is the
           project's standing rule (see RESUME_PDF_RASTERIZED_TEXT_FIX.md): the
           output carries real text operators, so it stays selectable and
           searchable instead of being a flat picture of words. */
        const s = exportSize(Math.min(o.dpi, 200));
        const art = renderTo(s.w, s.h, { transparent: false, textless: false });
        doc.addImage(art.toDataURL("image/jpeg", o.compress ? 0.7 : 0.95),
            "JPEG", bleed, bleed, p.w, p.h, undefined, o.compress ? "FAST" : "SLOW");

        if (!o.flatten) {
            state.texts.forEach((el) => {
                if (!el.text) { return; }
                const sizePt = el.size * p.w * 2.8346;
                doc.setFontSize(sizePt);
                const serif = el.font === "playfair" || el.font === "georgia" || el.font === "times";
                doc.setFont(serif ? "times" : (el.font === "courier" ? "courier" : "helvetica"),
                    el.bold && el.italic ? "bolditalic" : (el.bold ? "bold" : (el.italic ? "italic" : "normal")));
                if (o.colorProfile === "cmyk") {
                    const c = rgbToCmyk(el.color);
                    doc.setTextColor(c[0], c[1], c[2], c[3]);
                } else {
                    doc.setTextColor(el.color);
                }
                const txt = el.upper ? el.text.toUpperCase() : el.text;
                doc.text(txt, bleed + el.x * p.w, bleed + el.y * p.h, {
                    align: el.align,
                    maxWidth: el.anchor === "box" ? el.boxW * p.w : undefined
                });
            });
        }

        if (isPrint && o.cropMarks) {
            doc.setDrawColor(0);
            doc.setLineWidth(0.25);
            const m = bleed;
            const W = p.w + bleed * 2;
            const H = p.h + bleed * 2;
            [[m, 0, m, m], [0, m, m, m],
             [W - m, 0, W - m, m], [W, m, W - m, m],
             [m, H, m, H - m], [0, H - m, m, H - m],
             [W - m, H, W - m, H - m], [W, H - m, W - m, H - m]
            ].forEach((l) => doc.line(l[0], l[1], l[2], l[3]));
        }

        if (o.notes) {
            doc.setProperties({ title: state.name, subject: "TemplateBox poster", creator: "TemplateBox" });
        }

        doc.save(fileName("pdf"));
    }

    /* The uploaded photo as a data URL for embedding in an SVG. It goes through
       a canvas rather than being carried from the file input, because the
       source may be any format the browser can decode and the export has to be
       one an SVG viewer can. */
    function photoDataURL(img) {
        const source = img || photos[0];
        const c = document.createElement("canvas");
        c.width = source.width;
        c.height = source.height;
        c.getContext("2d").drawImage(source, 0, 0);
        return c.toDataURL("image/jpeg", 0.92);
    }

    /* One photograph, placed in SVG exactly as the canvas places it.

       preserveAspectRatio="xMidYMid slice" was doing this until framing
       existed, and it CANNOT express a framing: it always centres its own
       cover fit, so a zoomed or panned photo would export at the default crop
       and the file would quietly disagree with the preview. So the whole image
       is emitted, scaled and offset, and clipped by the caller's clip path --
       which the caller must therefore provide.

       Both are read from photoMetrics(), the same function the canvas draws
       from, so the crop cannot be computed two ways. */
    function photoImageSVG(img, view, x, y, w, h, transform) {
        const m = photoMetrics(img, w, h, view);
        const k = w / m.sw;
        return '<image x="' + (x - m.sx * k) + '" y="' + (y - m.sy * k) +
            '" width="' + (img.width * k) + '" height="' + (img.height * k) + '"' +
            (transform ? ' transform="' + transform + '"' : "") +
            ' href="' + photoDataURL(img) + '"/>';
    }

    /* One icon in SVG. The transform chain is character for character the one
       drawArt() applies to the canvas -- translate to the box, scale from the
       source viewBox, translate back by the viewBox origin -- because the path
       data is the source file's own and the placement is the only difference
       between the two renderers. Anything else here and the export drifts, which
       on this page has happened before and is invisible until someone opens the
       file. */
    function artSVG(art, x, y, w, h) {
        const v = art.view;
        const ink = screenTheme()[art.ink];
        const t = "translate(" + x + " " + y + ") scale(" + (w / v[2]) + " " + (h / v[3]) +
            ") translate(" + (-v[0]) + " " + (-v[1]) + ")";
        return '<g transform="' + t + '">' + art.parts.map((p) => '<path d="' + p.d + '"' +
            (p.stroke
                ? ' fill="none" stroke="' + ink + '" stroke-width="' + p.width + '"'
                : ' fill="' + ink + '"') +
            "/>").join("") + "</g>";
    }

    /* SVG twin of paintScreen(). Reads screenScale() and gridRects(), the same
       two functions the canvas reads, so the masonry cannot land in one place
       here and another there.

       The tab strip needs a real clip rather than a laid-out row, exactly as the
       canvas does, because cutting "Forums" short is the artwork. Every card
       needs one too: a zoomed photograph is larger than the card it fills and
       preserveAspectRatio is not doing the cropping any more. */
    function screenSVG(W, H, esc) {
        const s = screenScale(W, H);
        const S = SCREEN;
        const ink = screenTheme();
        const rects = gridRects(W, H);
        const tabClip = {
            x: S.tabs.x * s.fx,
            y: (S.tabs.baseline - S.tabs.size) * s.fy,
            w: (S.tabs.right - S.tabs.x) * s.fx,
            h: (S.tabs.underline.y + S.tabs.underline.h - S.tabs.baseline + S.tabs.size) * s.fy
        };
        const family = esc(fontStack(SCREEN_FONT).replace(/"/g, "'"));

        let defs = '<clipPath id="tb-screen-tabs"><rect x="' + tabClip.x + '" y="' + tabClip.y +
            '" width="' + tabClip.w + '" height="' + tabClip.h + '"/></clipPath>';
        if (photos[AVATAR_SLOT]) {
            defs += '<clipPath id="tb-screen-avatar"><circle cx="' + (S.avatar.cx * s.fx) +
                '" cy="' + (S.avatar.cy * s.fy) + '" r="' + (S.avatar.r * s.fx) + '"/></clipPath>';
        }
        rects.forEach((r, i) => {
            if (!photos[i]) { return; }
            defs += '<clipPath id="tb-screen-card-' + i + '"><rect x="' + r.x + '" y="' + r.y +
                '" width="' + r.w + '" height="' + r.h + '" rx="' + (S.grid.radius * s.fx) + '"/></clipPath>';
        });

        let out = '<rect width="' + W + '" height="' + H + '" fill="' + ink.bg + '"/>';
        out += "<defs>" + defs + "</defs>";

        out += artSVG(ART.lab, S.lab.x * s.fx, S.lab.y * s.fy, S.lab.w * s.fx, S.lab.h * s.fy);
        out += artSVG(ART.logo, S.logo.x * s.fx, S.logo.y * s.fy, S.logo.w * s.fx, S.logo.h * s.fy);
        if (photos[AVATAR_SLOT]) {
            const av = avatarRect(W, H);
            out += '<g clip-path="url(#tb-screen-avatar)">' +
                photoImageSVG(photos[AVATAR_SLOT], state.views[AVATAR_SLOT],
                    av.x, av.y, av.w, av.h) + "</g>";
        } else {
            out += '<circle cx="' + (S.avatar.cx * s.fx) + '" cy="' + (S.avatar.cy * s.fy) +
                '" r="' + (S.avatar.r * s.fx) + '" fill="' + ink.avatar + '"/>';
        }
        out += '<rect x="' + (S.pill.x * s.fx) + '" y="' + (S.pill.y * s.fy) + '" width="' +
            (S.pill.w * s.fx) + '" height="' + (S.pill.h * s.fy) + '" rx="' +
            ((S.pill.h / 2) * s.fy) + '" fill="' + ink.pill + '"/>';
        out += artSVG(ART.search, S.search.x * s.fx, S.search.y * s.fy, S.search.w * s.fx, S.search.h * s.fy);
        out += artSVG(ART.mic, S.mic.x * s.fx, S.mic.y * s.fy, S.mic.w * s.fx, S.mic.h * s.fy);
        out += artSVG(ART.lens, S.lens.x * s.fx, S.lens.y * s.fy, S.lens.w * s.fx, S.lens.h * s.fy);

        if (state.query) {
            /* Measured on the live canvas context, because there is nothing in
               an SVG string to measure with -- and it has to be the SAME number
               the canvas used, or a long query wraps the mic here and not
               there. */
            out += '<text x="' + (S.query.x * s.fx) + '" y="' + (S.query.baseline * s.fy) +
                '" font-family="' + family + '" font-size="' + fitQuerySize(ctx, state.query, W) +
                '" fill="' + ink.query + '">' + esc(state.query) + "</text>";
        }

        const t = S.tabs;
        ctx.save();
        ctx.font = "400 " + (t.size * s.fx) + "px " + fontStack(SCREEN_FONT);
        out += '<g clip-path="url(#tb-screen-tabs)">';
        let tabX = t.x;
        t.items.forEach((label, i) => {
            const wdt = ctx.measureText(label).width;
            out += '<text x="' + (tabX * s.fx) + '" y="' + (t.baseline * s.fy) +
                '" font-family="' + family + '" font-size="' + (t.size * s.fx) +
                '" fill="' + (i === t.current ? ink.chrome : ink.tabIdle) + '">' + esc(label) + "</text>";
            if (i === t.current) {
                out += '<rect x="' + (tabX * s.fx - t.underline.pad * s.fx) + '" y="' +
                    (t.underline.y * s.fy) + '" width="' + (wdt + t.underline.pad * 2 * s.fx) +
                    '" height="' + (t.underline.h * s.fy) + '" fill="' + ink.chrome + '"/>';
            }
            tabX += wdt / s.fx + t.gap;
        });
        ctx.restore();
        out += "</g>";

        out += '<rect x="' + (S.rule.x * s.fx) + '" y="' + (S.rule.y * s.fy) + '" width="' +
            (S.rule.w * s.fx) + '" height="' + (S.rule.h * s.fy) + '" fill="' + ink.rule +
            '" fill-opacity="' + ink.ruleAlpha + '"/>';

        rects.forEach((r, i) => {
            const box = 'x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h +
                '" rx="' + (S.grid.radius * s.fx) + '"';
            if (photos[i]) {
                out += '<g clip-path="url(#tb-screen-card-' + i + ')">' +
                    photoImageSVG(photos[i], state.views[i], r.x, r.y, r.w, r.h) + "</g>";
            } else {
                out += "<rect " + box + ' fill="' + ink.card + '"/>';
            }
        });

        const suit = suitOf(state.frame);
        S.pips.x.forEach((px) => {
            out += '<path d="' + SUITS[suit].path + '" fill="' + ink.pip +
                '" transform="translate(' + (px * s.fx) + " " + (S.pips.y * s.fy) + ") scale(" +
                (S.pips.w * s.fx) + " " + (S.pips.h * s.fy) + ')"/>';
        });

        return out;
    }

    /* SVG twin of paintSplit(). Reads splitGeometry(), the same function the
       canvas reads, so the seam cannot land in two places -- the arithmetic is
       shared rather than repeated.

       Same construction as the canvas: the upper photograph covers the whole
       panel and the lower one is drawn over it inside a clip, so there is no
       shared edge to leave a hairline. The 180-degree turn is a rotate() about
       the panel centre, which is the artwork's matrix(-s, 0, 0, -s) said
       another way. */
    function splitSVG(W, H, esc) {
        const g = splitGeometry(W, H);
        const cx = g.x + g.w / 2;
        const cy = g.y + g.h / 2;
        const panelRect = 'x="' + g.x + '" y="' + g.y + '" width="' + g.w + '" height="' + g.h + '"';
        const lowerPoints = g.x + "," + g.seamLeftY + " " + (g.x + g.w) + "," + g.seamRightY +
            " " + (g.x + g.w) + "," + (g.y + g.h) + " " + g.x + "," + (g.y + g.h);

        let out = '<rect width="' + W + '" height="' + H + '" fill="#FFFFFF"/>';
        out += '<defs><clipPath id="tb-split-panel"><rect ' + panelRect + '/></clipPath>' +
            '<clipPath id="tb-split-lower"><polygon points="' + lowerPoints + '"/></clipPath></defs>';

        out += '<g clip-path="url(#tb-split-panel)">';
        out += photos[0]
            ? photoImageSVG(photos[0], state.views[0], g.x, g.y, g.w, g.h)
            : '<rect ' + panelRect + ' fill="' + SPLIT.upper + '"/>';
        out += "</g>";

        out += '<g clip-path="url(#tb-split-lower)">';
        out += photos[1]
            ? photoImageSVG(photos[1], state.views[1], g.x, g.y, g.w, g.h,
                "rotate(180 " + cx + " " + cy + ")")
            : '<polygon points="' + lowerPoints + '" fill="' + SPLIT.lower + '"/>';
        out += "</g>";

        out += '<rect ' + panelRect + ' fill="none" stroke="' + CARD.ink +
            '" stroke-width="' + (SPLIT.rule * W) + '"/>';

        const suit = suitOf(state.frame);
        return out + cardIndexSVG(W, H, state.rankHead, false, esc, suit) +
            cardIndexSVG(W, H, state.rankFoot, true, esc, suit);
    }

    /* SVG twin of drawCardIndex(). Same constants, same unit pip path, same
       mirror-in-y-only rule for the bottom-right index. */
    function cardIndexSVG(W, H, rank, flip, esc, suit) {
        const pipW = CARD.pip.w * W;
        const pipH = CARD.pip.h * H;
        const pipX = flip ? W - CARD.pip.x * W - pipW : CARD.pip.x * W;
        const rankX = flip ? W - CARD.rank.x * W : CARD.rank.x * W;
        const key = SUITS[suit] ? suit : "hearts";
        /* Measured on the live canvas context, because there is nothing in an
           SVG string to measure with -- and the fit has to be the SAME number
           the canvas used or a wide rank would collide here and not there. */
        const size = fitRankSize(ctx, rank, W);

        return (flip ? '<g transform="translate(0 ' + H + ') scale(1 -1)">' : "<g>") +
            '<text x="' + rankX + '" y="' + (CARD.rank.baseline * H) +
            '" font-family="' + esc(fontStack(CARD_RANK_FONT).replace(/"/g, "'")) +
            '" font-size="' + size + '" font-weight="700"' +
            ' fill="' + CARD.ink + '" text-anchor="' + (flip ? "end" : "start") + '">' +
            esc(rank) + "</text>" +
            '<path d="' + SUITS[key].path + '" fill="' + SUITS[key].ink + '" transform="translate(' +
            pipX + " " + (CARD.pip.y * H) + ") scale(" + pipW + " " + pipH + ')"/>' +
            "</g>";
    }

    /* SVG twin of paintCard(). Reads the same CARD geometry the canvas
       renderer does, so the two can only drift if a structural element is
       added to one and not the other. */
    function cardSVG(W, H, esc) {
        const x = CARD.panel.x * W;
        const y = CARD.panel.y * H;
        const w = CARD.panel.w * W;
        const h = CARD.panel.h * H;

        let out = '<rect width="' + W + '" height="' + H + '" fill="#FFFFFF"/>';

        /* The clip is not optional now: a zoomed photograph is larger than the
           panel, and preserveAspectRatio is no longer doing the cropping. */
        if (photos[0]) {
            out += '<defs><clipPath id="tb-card-panel"><rect x="' + x + '" y="' + y +
                '" width="' + w + '" height="' + h + '"/></clipPath></defs>' +
                '<g clip-path="url(#tb-card-panel)">' +
                photoImageSVG(photos[0], state.views[0], x, y, w, h) + "</g>";
        }

        out += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h +
            '" fill="none" stroke="' + CARD.ink + '" stroke-width="' + (CARD.rule * W) + '"/>';

        const suit = suitOf(state.frame);
        return out + cardIndexSVG(W, H, state.rankHead, false, esc, suit) +
            cardIndexSVG(W, H, state.rankFoot, true, esc, suit);
    }

    /* SVG: genuinely vector text over an embedded raster photo. The photo
       cannot become vector, but the type does not have to be rasterised with
       it, which is the whole reason to offer this format. */
    function exportSVG() {
        const p = paper();
        const W = p.w;
        const H = p.h;
        const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

        let body = "";
        const frame = FRAME_STYLES[state.frame] || FRAME_STYLES.black;

        if (frame.layout === "card") {
            body += cardSVG(W, H, esc);
        } else if (frame.layout === "split") {
            body += splitSVG(W, H, esc);
        } else if (frame.layout === "browser") {
            body += screenSVG(W, H, esc);
        } else {
            if (frame.frame) {
                body += '<rect width="' + W + '" height="' + H + '" fill="' + frame.frame + '"/>';
            }
            const fw = frame.frame ? W * 0.05 : 0;
            body += '<rect x="' + fw + '" y="' + fw + '" width="' + (W - fw * 2) +
                '" height="' + (H - fw * 2) + '" fill="#FFFFFF"/>';

            if (photos[0]) {
                const mw = fw + W * 0.042;
                const pw = W - mw * 2;
                const ph = H - mw * 2 - H * 0.11;
                body += '<defs><clipPath id="tb-plain-panel"><rect x="' + mw + '" y="' + mw +
                    '" width="' + pw + '" height="' + ph + '"/></clipPath></defs>' +
                    '<g clip-path="url(#tb-plain-panel)">' +
                    photoImageSVG(photos[0], state.views[0], mw, mw, pw, ph) + "</g>";
            }
        }

        state.texts.forEach((el) => {
            if (!el.text) { return; }
            const txt = el.upper ? el.text.toUpperCase() : el.text;
            const anchor = el.align === "center" ? "middle" : (el.align === "right" ? "end" : "start");
            const decoration = [el.underline ? "underline" : "", el.strike ? "line-through" : ""]
                .filter(Boolean).join(" ");
            body += '<text x="' + (el.x * W) + '" y="' + (el.y * H) +
                '" font-family="' + esc(fontStack(el.font).replace(/"/g, "'")) + '"' +
                ' font-size="' + (el.size * W) + '"' +
                ' font-weight="' + (el.bold ? 700 : 400) + '"' +
                ' font-style="' + (el.italic ? "italic" : "normal") + '"' +
                ' fill="' + el.color + '" fill-opacity="' + el.opacity + '"' +
                ' text-anchor="' + anchor + '"' +
                ' letter-spacing="' + (el.letter * el.size * W) + '"' +
                (decoration ? ' text-decoration="' + decoration + '"' : "") +
                '>' + esc(txt) + '</text>';
        });

        const svg = '<svg xmlns="http://www.w3.org/2000/svg" ' +
            'xmlns:xlink="http://www.w3.org/1999/xlink" width="' + W + 'mm" height="' + H +
            'mm" viewBox="0 0 ' + W + " " + H + '">' + body + "</svg>";
        downloadBlob(new Blob([svg], { type: "image/svg+xml" }), fileName("svg"));
    }

    /* ------------------------------------------------------------------
       Minimal store-only ZIP writer, for PPTX.

       A .pptx is an OOXML package: a ZIP of XML parts. There is no server to
       build one and no bundler here, so rather than vendor a general ZIP
       library for a single use, this writes the archive directly with the
       STORE method (no compression). That keeps it to a CRC32 table and two
       record layouts, and a store-only archive is a fully valid ZIP that
       PowerPoint opens normally -- the cost is file size, which for a
       one-slide deck holding one JPEG is dominated by the image either way.
       ------------------------------------------------------------------ */

    const CRC_TABLE = (() => {
        const t = new Uint32Array(256);
        for (let n = 0; n < 256; n += 1) {
            let c = n;
            for (let k = 0; k < 8; k += 1) {
                c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
            }
            t[n] = c >>> 0;
        }
        return t;
    })();

    function crc32(bytes) {
        let c = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i += 1) {
            c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
        }
        return (c ^ 0xFFFFFFFF) >>> 0;
    }

    function zip(files) {
        const enc = new TextEncoder();
        const chunks = [];
        const central = [];
        let offset = 0;

        const u16 = (n) => [n & 0xFF, (n >>> 8) & 0xFF];
        const u32 = (n) => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];

        files.forEach((f) => {
            const nameBytes = enc.encode(f.name);
            const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
            const sum = crc32(data);

            const local = [].concat(
                u32(0x04034B50), u16(20), u16(0), u16(0), u16(0), u16(0),
                u32(sum), u32(data.length), u32(data.length),
                u16(nameBytes.length), u16(0)
            );
            chunks.push(new Uint8Array(local), nameBytes, data);

            central.push([].concat(
                u32(0x02014B50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
                u32(sum), u32(data.length), u32(data.length),
                u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0),
                u32(offset)
            ).concat(Array.from(nameBytes)));

            offset += local.length + nameBytes.length + data.length;
        });

        const centralBytes = [];
        central.forEach((c) => c.forEach((b) => centralBytes.push(b)));
        const end = [].concat(
            u32(0x06054B50), u16(0), u16(0), u16(files.length), u16(files.length),
            u32(centralBytes.length), u32(offset), u16(0)
        );

        return new Blob(chunks.concat([new Uint8Array(centralBytes), new Uint8Array(end)]),
            { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
    }

    function exportPPTX(o) {
        const p = paper();
        /* OOXML measures in EMU: 914400 per inch. */
        const emuW = Math.round(p.w / 25.4 * 914400);
        const emuH = Math.round(p.h / 25.4 * 914400);
        const s = exportSize(Math.min(o.dpi, 150));
        const jpg = renderTo(s.w, s.h, { transparent: false }).toDataURL("image/jpeg", 0.9);
        const bin = atob(jpg.split(",")[1]);
        const img = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) {
            img[i] = bin.charCodeAt(i);
        }

        const x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
        const files = [
            { name: "[Content_Types].xml", data: x +
                '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
                '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
                '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
                '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
                '<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>' +
                '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
                '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
                '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
                "</Types>" },
            { name: "_rels/.rels", data: x +
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>' +
                "</Relationships>" },
            { name: "ppt/presentation.xml", data: x +
                '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
                'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
                'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
                '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
                '<p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>' +
                '<p:sldSz cx="' + emuW + '" cy="' + emuH + '"/>' +
                '<p:notesSz cx="' + emuW + '" cy="' + emuH + '"/></p:presentation>' },
            { name: "ppt/_rels/presentation.xml.rels", data: x +
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>' +
                '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>' +
                '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>' +
                "</Relationships>" },
            { name: "ppt/slides/slide1.xml", data: x +
                '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
                'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
                'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
                "<p:cSld><p:spTree>" +
                '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
                "<p:grpSpPr/>" +
                '<p:pic><p:nvPicPr><p:cNvPr id="2" name="Poster"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>' +
                '<p:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>' +
                '<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + emuW + '" cy="' + emuH + '"/></a:xfrm>' +
                '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>' +
                "</p:spTree></p:cSld><p:clrMapOvr><a:overrideClrMapping bg1=\"lt1\" tx1=\"dk1\" bg2=\"lt2\" tx2=\"dk2\" accent1=\"accent1\" accent2=\"accent2\" accent3=\"accent3\" accent4=\"accent4\" accent5=\"accent5\" accent6=\"accent6\" hlink=\"hlink\" folHlink=\"folHlink\"/></p:clrMapOvr></p:sld>" },
            { name: "ppt/slides/_rels/slide1.xml.rels", data: x +
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.jpeg"/>' +
                "</Relationships>" },
            { name: "ppt/media/image1.jpeg", data: img },
            { name: "ppt/slideMasters/slideMaster1.xml", data: x +
                '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
                'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
                'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
                '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
                "<p:grpSpPr/></p:spTree></p:cSld>" +
                "<p:clrMap bg1=\"lt1\" tx1=\"dk1\" bg2=\"lt2\" tx2=\"dk2\" accent1=\"accent1\" accent2=\"accent2\" accent3=\"accent3\" accent4=\"accent4\" accent5=\"accent5\" accent6=\"accent6\" hlink=\"hlink\" folHlink=\"folHlink\"/>" +
                '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>' },
            { name: "ppt/slideMasters/_rels/slideMaster1.xml.rels", data: x +
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' +
                '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>' +
                "</Relationships>" },
            { name: "ppt/slideLayouts/slideLayout1.xml", data: x +
                '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
                'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
                'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank">' +
                '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
                "<p:grpSpPr/></p:spTree></p:cSld></p:sldLayout>" },
            { name: "ppt/slideLayouts/_rels/slideLayout1.xml.rels", data: x +
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>' +
                "</Relationships>" },
            { name: "ppt/theme/theme1.xml", data: x +
                '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="TemplateBox">' +
                "<a:themeElements><a:clrScheme name=\"TB\">" +
                '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>' +
                '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
                '<a:dk2><a:srgbClr val="1A1A1A"/></a:dk2><a:lt2><a:srgbClr val="F4F3EF"/></a:lt2>' +
                '<a:accent1><a:srgbClr val="8A6A3B"/></a:accent1><a:accent2><a:srgbClr val="C9A227"/></a:accent2>' +
                '<a:accent3><a:srgbClr val="7B5B3A"/></a:accent3><a:accent4><a:srgbClr val="111111"/></a:accent4>' +
                '<a:accent5><a:srgbClr val="6B6B66"/></a:accent5><a:accent6><a:srgbClr val="5E4426"/></a:accent6>' +
                '<a:hlink><a:srgbClr val="8A6A3B"/></a:hlink><a:folHlink><a:srgbClr val="5E4426"/></a:folHlink>' +
                "</a:clrScheme>" +
                '<a:fontScheme name="TB"><a:majorFont><a:latin typeface="Georgia"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
                '<a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
                "<a:fmtScheme name=\"TB\"><a:fillStyleLst><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill>" +
                '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>' +
                '<a:lnStyleLst><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>' +
                '<a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>' +
                '<a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>' +
                "<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle>" +
                "<a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>" +
                '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
                '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>' +
                "</a:fmtScheme></a:themeElements></a:theme>" }
        ];

        downloadBlob(zip(files), fileName("pptx"));
    }

    function runExport() {
        const o = readOpts();
        try {
            if (o.type === "png") { exportPNG(o); }
            else if (o.type === "jpg") { exportJPG(o); }
            else if (o.type === "pdf") { exportPDF(o); }
            else if (o.type === "svg") { exportSVG(o); }
            else if (o.type === "pptx") { exportPPTX(o); }
        } catch (err) {
            window.alert("That export could not be completed. Try a smaller paper size or a different format.");
        }
    }

    /* ----------------------------------------------------------------------
       Download panel
       ---------------------------------------------------------------------- */

    function initDownload() {
        const toggle = byId("dl-toggle");
        const panel = byId("dl-panel");
        const type = byId("dl-type");
        if (!toggle || !panel || !type) {
            return;
        }

        const setOpen = (open) => {
            panel.hidden = !open;
            toggle.setAttribute("aria-expanded", String(open));
        };

        toggle.addEventListener("click", () => setOpen(panel.hidden));
        document.addEventListener("click", (ev) => {
            if (panel.hidden) { return; }
            if (panel.contains(ev.target) || toggle.contains(ev.target)) { return; }
            setOpen(false);
        });
        document.addEventListener("keydown", (ev) => {
            if (ev.key === "Escape" && !panel.hidden) {
                setOpen(false);
                toggle.focus();
            }
        });

        type.addEventListener("change", syncPanel);
        const dpi = byId("dl-dpi");
        const size = byId("p-size");
        if (dpi) { dpi.addEventListener("change", syncPanel); }
        if (size) { size.addEventListener("change", syncPanel); }
        ["dl-pdf-preset"].forEach((id) => {
            const e = byId(id);
            if (e) { e.addEventListener("change", syncPanel); }
        });

        const go = byId("dl-go");
        if (go) {
            go.addEventListener("click", () => {
                runExport();
                setOpen(false);
            });
        }
        syncPanel();
    }

    /* Shows only the options the selected format actually has, and states the
       real output dimensions rather than leaving the paper size abstract. */
    function syncPanel() {
        const type = byId("dl-type");
        if (!type) {
            return;
        }
        const t = type.value;
        const show = (id, on) => {
            const e = byId(id);
            if (e) { e.hidden = !on; }
        };
        const raster = t === "png" || t === "jpg";
        show("dl-group-size", raster || t === "pdf" || t === "pptx");
        show("dl-group-jpg", t === "jpg");
        show("dl-group-png", t === "png");
        show("dl-group-pdf", t === "pdf");

        const preset = byId("dl-pdf-preset");
        const isPrint = preset && preset.value === "print";
        show("dl-group-pdf-print", t === "pdf" && isPrint);

        const out = byId("dl-dimensions");
        if (out) {
            const dpiEl = byId("dl-dpi");
            const s = exportSize(Number(dpiEl ? dpiEl.value : DEFAULT_DPI) || DEFAULT_DPI);
            const p = paper();
            out.textContent = p.w + " x " + p.h + " mm  |  " + s.w + " x " + s.h + " px at " +
                s.dpi + " DPI" + (s.clamped ? " (reduced from the requested DPI to stay within browser canvas limits)" : "");
        }
    }

    /* ----------------------------------------------------------------------
       Initialization
       ---------------------------------------------------------------------- */

    function buildSelects() {
        const font = byId("t-font");
        if (font && !font.options.length) {
            FONTS.forEach((f) => {
                const o = document.createElement("option");
                o.value = f.id;
                o.textContent = f.label;
                font.appendChild(o);
            });
        }
        const size = byId("p-size");
        if (size && !size.options.length) {
            Object.keys(PAPER).forEach((k) => {
                const o = document.createElement("option");
                o.value = k;
                o.textContent = PAPER[k].label + " - " + PAPER[k].w + " x " + PAPER[k].h + " mm";
                size.appendChild(o);
            });
        }
        const frame = byId("p-frame");
        if (frame && !frame.options.length) {
            Object.keys(FRAME_STYLES).forEach((k) => {
                const o = document.createElement("option");
                o.value = k;
                o.textContent = FRAME_STYLES[k].label;
                frame.appendChild(o);
            });
        }
        /* Suggestions behind both rank fields, from the one list, so the
           common four stay one click while the field itself takes anything. */
        const rankList = byId("p-rank-options");
        if (rankList && !rankList.options.length) {
            RANKS.forEach((r) => {
                const o = document.createElement("option");
                o.value = r;
                rankList.appendChild(o);
            });
        }
        /* Six cards, numbered as the preview numbers them. The "(empty)" half of
           each label is written by syncPhotoControls(), which is the only thing
           that knows what is in them. */
        const theme = byId("p-screen-theme");
        if (theme && !theme.options.length) {
            Object.keys(SCREEN_THEMES).forEach((k) => {
                const o = document.createElement("option");
                o.value = k;
                o.textContent = SCREEN_THEMES[k].label;
                theme.appendChild(o);
            });
        }
        const pick = byId("p-card-pick");
        if (pick && !pick.options.length) {
            for (let i = 0; i < SLOT_COUNT; i += 1) {
                const o = document.createElement("option");
                o.value = String(i);
                o.textContent = slotName(i);
                pick.appendChild(o);
            }
        }
    }

    buildSelects();
    migrate(TB.storageGet(STORAGE_KEY));

    /* A catalog card can pre-select the frame style, the same data-doc hand-off
       docs.html and mockup.html already use. The value is only ever matched
       against FRAME_STYLES, so a tampered localStorage entry resolves to
       nothing worse than a style this editor already ships. It outranks the
       saved style because arriving from a card is a fresh, deliberate choice,
       and it deliberately leaves the rest of the saved poster alone -- the
       photo, the text and the paper size all survive the switch. */
    const framePreset = TB.takePreset();
    if (FRAME_STYLES[framePreset]) {
        state.frame = framePreset;
        /* The pairing comes with it, because the card is named after it: a
           visitor who clicked "King and Queen of Spades" should get a K and a
           Q. Only the catalog hand-off does this -- picking the same style
           from the Frame Style control leaves whatever letters are already
           there, since that is an edit in progress rather than a request for
           the template as advertised. */
        /* Only a style that DECLARES a pairing carries one, which the search
           screen does not: it has no corner indices, so taking the fallback
           here would quietly rewrite the letters on a card poster the visitor
           still had open, from a card that shows no letters at all. */
        const preset = FRAME_STYLES[framePreset];
        if (preset.ranks) {
            state.rankHead = preset.ranks.head;
            state.rankFoot = preset.ranks.foot;
        }
    }

    syncDocControls();

    initEmoji();
    initDownload();
    syncControls();
    updateHistoryButtons();
    render();

    /* A second paint once the display fonts finish loading, so the caption
       renders in Playfair Display rather than the fallback serif. */
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(render);
    }
})();
