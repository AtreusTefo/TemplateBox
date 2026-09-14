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
        /* The split layout's other three suits, added September 11, 2026.

           It shipped in hearts alone while the single-photo card had all four,
           which is the sort of gap nobody decides on -- hearts was simply what
           the first one was written as. Each of these is one entry and nothing
           else: the pip comes from `suit` through suitOf(), the corner letters
           from `ranks`, the seam and the two photographs from the layout. No
           renderer changed to accept them.

           The pairings follow the single-photo cards: red leads with the queen,
           black with the king. The key is prefixed rather than suffixed so the
           four sort together in the Frame Style menu, which is built from the
           order of this object. */
        "split-spades": {
            frame: null, trim: null, label: "King and Queen of Spades, Two Photos",
            layout: "split", suit: "spades", ranks: { head: "K", foot: "Q" }
        },
        "split-diamonds": {
            frame: null, trim: null, label: "Queen and King of Diamonds, Two Photos",
            layout: "split", suit: "diamonds", ranks: { head: "Q", foot: "K" }
        },
        "split-clubs": {
            frame: null, trim: null, label: "King and Queen of Clubs, Two Photos",
            layout: "split", suit: "clubs", ranks: { head: "K", foot: "Q" }
        },
        /* A third layout, and the first one that is not a playing card: a phone
           search-results screen with a masonry of six photographs in it. It
           carries `suit` for the row of pips along its foot -- the same traced
           heart the card layouts use -- and no `ranks`, because it has no
           corner indices for them to fill. */
        browser: {
            frame: null, trim: null, label: "Search Screen, Six Photos",
            layout: "browser", suit: "hearts"
        },
        /* The fourth layout: a phone music player, one album photograph and one
           scannable code. No `suit` and no `ranks` -- it has neither a pip nor
           a corner index, and styleRanks() is only consulted for styles that
           declare a pairing. */
        player: {
            frame: null, trim: null, label: "Now Playing, Music Poster",
            layout: "player"
        },
        /* The fifth layout: a heart-shaped photo collage over a month, with the
           day that matters marked. The supplied artwork is LANDSCAPE and this
           is portrait -- the blocks are stacked rather than set side by side.
           See paintAnniversary(). */
        anniversary: {
            frame: null, trim: null, label: "Anniversary Calendar, Photo Heart",
            layout: "anniversary"
        },
        /* The sixth layout: a birthday tribute, from a supplied A4 portrait
           artwork. Same page shape as the anniversary poster and the same
           computed calendar -- deliberately the same arithmetic, not a second
           copy of it -- over a cascade of twelve photographs, a quote and a
           closing message. See paintBirthday(). */
        birthday: {
            frame: null, trim: null, label: "Birthday Calendar, Photo Cascade",
            layout: "birthday"
        },
        /* The seventh layout, and the SIBLING of the sixth: a second artwork
           from the same family, A4 portrait on the same ground with a month
           top left, a computed calendar, a message on the left, a cascade of
           photographs and a line along the foot.

           Kept separate rather than folded into `birthday` because the boxes
           differ in count and position, the decoration differs and the text
           blocks differ -- but it shares the calendar, the wrapper, the
           sparkle and the heart, because a second copy of any of those is a
           second one to be wrong. See paintTribute(). */
        tribute: {
            frame: null, trim: null, label: "Birthday Tribute, Photo Wall",
            layout: "tribute"
        }
    };

    /* Catalog ids that are not FRAME_STYLES keys.

       For the card layouts the catalog id IS the style key -- someone chose
       "hearts" to be both -- so those need no translation and are absent here.
       These three predate the hand-off: their ids name a catalog entry and, for
       the first, a thumbnail file that ships on disk. Renaming them to "black",
       "wood" and "gold" would have been the tidier-looking fix and it would
       have renamed `framed-photo-poster-thumb-blank.webp` to
       `black-thumb-blank.webp`, which says nothing in a downloads folder or a
       devtools waterfall. So the ids stay and the mapping lives here.

       They carried no data-doc at all until September 10, 2026, which meant
       those three cards opened the editor on whatever style it last held. With
       ten styles and three of them whole layouts, "Framed Photo Poster" could
       open a search-results screen. */
    const PRESET_ALIASES = {
        "framed-photo-poster": "black",
        "matte-wood-canvas": "wood",
        "polished-gold-frame": "gold"
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
    /* The empty panel's two halves, the artwork's own, for EVERY suit.

       The upper half followed the suit's ink for about an hour on September 11,
       2026, on the reasoning that the artwork's #BE1E2D is exactly
       SUITS.hearts.ink so hearts would be unchanged and the black suits would
       stop wearing a red plate under a black pip. The arithmetic was right and
       the result was bad, which is only visible by looking at it:

       the panel is ruled in black, so a black upper half SWALLOWS the rule
       along the top and right edges and the poster stops reading as a card at
       all -- and #00AEEF against pure black is a warning sign rather than a
       print. Red and blue work together because they are saturated colours of
       similar weight; black is not a colour in that sense, it is a hole.

       So the plate is the artwork on all four, and the suit is carried where
       the single-photo card carries it: the pip and the corner letters, on the
       white margin outside the panel. */
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

    /* The music-player layout, traced from the supplied "spotify template.svg".

       That file holds BOTH colourways on one artboard, side by side: the light
       one is the dark one translated by (+646.77, -6.10). Only the dark theme
       is traced here and the light one is a palette, which is what keeps the
       two from drifting apart in layout the way SCREEN and SCREEN_THEMES do.

       Points, not page fractions, for the same reason SCREEN uses them: every
       number below can be read straight off the source SVG and checked, where
       `x / 597.45` forty times over can only be trusted.

       THE ARTWORK DISAGREES WITH ITSELF IN THREE PLACES, all of them hand
       placement rather than intent, and all three are resolved here rather than
       averaged:

       - The two time baselines are 612.6 and 615.31. They read as one row, so
         both are drawn on the FIRST, and the 2.7pt is discarded.
       - The left edge is 91.04 for the album box, 92.2 for the progress track
         and 93.97 for the title. Those are kept AS THEY ARE: they are what the
         artwork looks like, the differences are under a millimetre on A4, and
         squaring them up would be redrawing somebody's poster rather than
         tracing it.
       - The knob sits at 25.6 per cent of the track while the times say 1:07 of
         5:07, which is 21.8. See playedFraction(): the knob follows the times,
         because a poster reading 1:07 of 3:48 with the knob at four fifths is
         wrong in a way nobody has to measure to see. The artwork's own figure
         survives as the fallback for when the fields are not times. */
    const PLAYER = {
        page: { w: 597.45, h: 841.89 },
        album: { x: 91.04, y: 40.85, w: 416.15, h: 422.99, r: 13.53, stroke: 3 },
        dots: { cx: 493.96, r: 2.07, y: [22.42, 29.72, 37.02] },
        title: { x: 93.97, baseline: 521.12, size: 32, right: 462 },
        artist: { x: 93.96, baseline: 549.97, size: 21, right: 462 },
        track: { x1: 92.2, x2: 507.52, y: 589.14, width: 5, dim: 0.74 },
        knob: { r: 9.72 },
        /* Both times on the first baseline; `squeeze` is the artwork's own
           scale(0.87 1), a horizontal condense rather than a narrower face. */
        time: { baseline: 612.6, size: 19.75, squeeze: 0.87, leftX: 92.2, rightX: 472.31 },
        play: { cx: 299.62, cy: 667.67, r: 35.88 },
        code: { x: 68.6, y: 719.22, w: 460.8, h: 115.2 },

        /* The two gaps the artwork itself sets, named because moving the code
           re-uses them rather than inventing new ones. This page has NO slack:
           57.28 + 182.43 + 15.67 + 115.2 + 7.47 is exactly the 378.05 points
           below the album. Every number here is spent. */
        codeGap: 15.67,        /* what sits above the code at the foot */
        albumToTitle: 57.28,   /* album bottom to the song title's baseline */

        /* The code when a CAPTION shares the page with it. Nothing is resized
           by moving the code -- a swap is a swap -- but a caption is a new
           element on a page with nothing spare, so the 60 points it needs come
           out of the code, which is the only thing here that is optional and
           the only thing whose size carries no information. The artwork's 4:1
           is kept, because the box crops what is dropped into it and a code
           cropped out of proportion does not scan.

           ONE compact size, used in both positions, so that switching the
           position while a caption is present still resizes nothing. */
        codeCompact: { x: 202.73, w: 192, h: 48 },

        /* Two optional lines under the transport row. Measured DOWN FROM the
           transport row rather than pinned to the page, because that row moves
           when the code changes places and the caption has to move with it.
           `drop` is a gap of 8 plus the heading's own ascent. */
        caption: {
            x: 93.97, right: 505,
            drop: 26.72, leading: 28, tail: 17,
            headSize: 26, bodySize: 22
        },
        /* The fallback when either time field is not a time: the artwork's own
           knob position, (198.63 - 92.2) / (507.52 - 92.2). */
        fallbackPlayed: 0.2563
    };

    const PLAYER_THEMES = {
        dark: {
            label: "Dark",
            /* #231F20, not #000000. The SVG says #231F20 and the designer's own
               exported PNG samples #000000 at the same point -- a real
               disagreement between the master and the render. The master wins:
               it is the editable file and that value is what was typed. On
               screen the difference is invisible; in print it is a rich black
               against a flat one. */
            page: "#231F20",
            ink: "#FFFFFF",
            accent: "#e93625",
            albumFill: "#FFFFFF",
            albumStroke: null
        },
        light: {
            label: "Light",
            page: "#FFFFFF",
            ink: "#231F20",
            accent: "#e93625",
            /* The empty album is an OUTLINE here rather than a fill. A white
               box on white paper is not a box, which is the same problem the
               search screen's empty cards have and the same shape of answer. */
            albumFill: null,
            albumStroke: "#231F20"
        }
    };

    const DEFAULT_PLAYER_THEME = "dark";

    /* The heart is the one thing on this poster whose colour a visitor picks
       outright, so it is NOT a theme token. It layers over whichever theme is
       showing, which is why it survives a switch between dark and light --
       recording it inside the two themes would mean choosing it twice and
       getting it wrong once. */
    const DEFAULT_HEART_COLOUR = "#e93625";
    const DEFAULT_CODE_POS = "foot";

    const CODE_POSITIONS = {
        foot: { label: "Below the buttons" },
        top: { label: "Above the song title" }
    };

    function playerTheme() {
        const base = PLAYER_THEMES[state.playerTheme] ||
            PLAYER_THEMES[DEFAULT_PLAYER_THEME];
        const heart = cleanColour(state.heartColour) || base.accent;
        /* A copy, not a mutation: PLAYER_THEMES is shared and a painter that
           wrote to it would change the OTHER colourway too. */
        return Object.assign({}, base, { accent: heart });
    }

    function codePos() {
        return CODE_POSITIONS[state.codePos] ? state.codePos : DEFAULT_CODE_POS;
    }

    /* True when the caption has anything in it, which is what decides whether
       the code has to share the foot of the page. */
    function hasCaption() {
        return Boolean((state.captionHead || "").trim() ||
            (state.captionBody || "").trim());
    }

    /* The player's glyphs, verbatim from the SVG and already in PAGE
       coordinates -- unlike the search screen's five icons, which carry their
       source files' own viewBoxes. So the `view` here is the page itself and
       the transform that places them is just the page scale.

       `rule` matters on exactly one of them. The repeat glyph is drawn with
       fill-rule: evenodd in the source (its class carries `fill-rule:evenodd`),
       and filled nonzero it comes out as a solid blob with the arrow's counter
       filled in. Same class of trap as the club pip's winding, and visible
       immediately once drawn. */
    const PLAYER_VIEW = [0, 0, 597.45, 841.89];

    const PLAYER_ART = {
        /* The chevron and the dots belong to the TOP of the screen and never
           move. The transport glyphs belong to the controls row, which does
           move when the code changes places -- so they are a separate group.
           They were one `chrome` list until the code became movable, and a
           single list is exactly what makes a chevron slide down the page
           with the play button. */
        chevron: {
            view: PLAYER_VIEW, ink: "ink",
            parts: [
                { stroke: true, width: 3, d: "M100.37,24.63L109.36,35.29L117.99,24.63" }
            ]
        },
        transport: {
            view: PLAYER_VIEW, ink: "ink",
            parts: [
                { d: "M103.62,667.67l.78-1.1,1.32-1.83c-2.18-2.93-4.6-5.3-7.45-5.3H92.18v3.79h6.09c1.66,0,3.45,1.92,5.35,4.44Z" },
                { d: "M119.75,670.76v4.7h-4.46c-1.79,0-3.5-1.94-5.27-4.46l-.46.69c-.47.71-.94,1.42-1.44,2.14,2.3,2.95,4.7,5.37,7.17,5.37h4.46v4.69l3.34-3.28,3.35-3.28L123.09,674Z" },
                { d: "M123.09,658l-3.34-3.29v4.7h-4.46c-6.35,0-12.25,16-17,16H92.18v3.79h6.09c7.41,0,11.87-16,17-16h4.46v4.69l3.34-3.28,3.35-3.28Z" },
                { d: "M189.53,665.11V653h-6.32V682.3h6.32V670.22l21,12.14V653Z" },
                { d: "M409.71,654.78v12.07l-21-12.14V684.1l21-12.13V684H416V654.78Z" },
                { rule: "evenodd", d: "M500.4,679.62h-6.21l3.29,3.46a2.44,2.44,0,0,1,0,3.24,2.15,2.15,0,0,1-3.14.07l-6.73-7.09h0a2.43,2.43,0,0,1,0-3.31l6.73-7.09a2.15,2.15,0,0,1,3.14,0,2.45,2.45,0,0,1,0,3.31l-2.59,2.73h5.51a3.06,3.06,0,0,0,3-3.14v-9.5a3.06,3.06,0,0,0-3-3.14H479.73a3.06,3.06,0,0,0-3,3.14v9.5a3.06,3.06,0,0,0,3,3.14h1.95a2.34,2.34,0,0,1,0,4.68h-1.95a7.63,7.63,0,0,1-7.42-7.82v-9.5a7.64,7.64,0,0,1,7.42-7.82H500.4a7.64,7.64,0,0,1,7.42,7.82v9.5A7.63,7.63,0,0,1,500.4,679.62Z" }
            ]
        },
        /* The play triangle is the PAGE colour, not the ink: it is a hole in the
           white disc behind it, so on the light theme it is white. */
        playIcon: {
            view: PLAYER_VIEW, ink: "page",
            parts: [{ d: "M289.63,651.3v29.39l26-14.7Z" }]
        },
        /* The one colour that does not flip between the themes, and the one
           the visitor sets outright -- playerTheme() overlays their choice on
           whichever colourway is showing, so "accent" here is only the
           fallback for a value that fails cleanColour(). */
        heart: {
            view: PLAYER_VIEW, ink: "accent",
            parts: [{ d: "M490.06,512.22a11.35,11.35,0,0,0-9.67-5.88A10.19,10.19,0,0,0,470,516.71c0,11.41,6.23,13.14,20.05,26.27,13.83-13.13,20.06-14.86,20.06-26.27a10.19,10.19,0,0,0-10.38-10.37A11.37,11.37,0,0,0,490.06,512.22Z" }]
        }
    };

    Object.keys(PLAYER_ART).forEach((k) => {
        PLAYER_ART[k].parts.forEach((p) => { p.path = new Path2D(p.d); });
    });

    /* ----------------------------------------------------------------------
       The anniversary calendar poster (September 11, 2026).

       Traced from a supplied artwork that is A4 LANDSCAPE. This is PORTRAIT,
       at the owner's instruction, so the arrangement is rebuilt rather than
       copied: in the source the heart collage sits left with the code and the
       calendar stacked to its right, and there is no room for that beside a
       420pt-wide collage on a 597pt page. Here the four blocks stack -- names,
       collage, code, calendar -- with the tagline on the foot.

       What IS copied exactly is the collage's own geometry. Those eighteen
       rectangles are the heart, and their proportions are the design; they are
       held below in the SOURCE's coordinates and normalised into whatever box
       this layout gives them, so the shape cannot drift while the page does.
       ---------------------------------------------------------------------- */

    /* The eighteen photo boxes, verbatim from the artwork's own artboard.

       EIGHT of these carry a `transform="translate(a b) rotate(-180)"` in the
       source and every one of them is a NO-OP: rotating an axis-aligned rect
       180 degrees about the right point maps it onto itself, and measured,
       each lands back within 0.01pt of its own x and y. The designer mirrored
       the left half to build the right and the transform is what was left
       over. They are dropped here. Applying them would double-transform the
       right-hand half of the heart; skipping those rects as "already mirrored"
       would lose it. */
    const ANNIV_COLLAGE = [
        { x: 151.99, y: 213.01, w: 188.46, h: 221.15 },
        { x: 25.29, y: 177.59, w: 121.70, h: 101.83 },
        { x: 86.15, y: 127.18, w: 60.85, h: 47.23 },
        { x: 49.36, y: 143.98, w: 33.15, h: 30.43 },
        { x: 151.99, y: 159.76, w: 69.62, h: 47.20 },
        { x: 31.94, y: 283.20, w: 34.75, h: 34.75 },
        { x: 70.09, y: 283.20, w: 76.91, h: 76.91 },
        { x: 101.04, y: 363.82, w: 46.92, h: 46.92 },
        { x: 173.23, y: 437.65, w: 35.68, h: 34.80 },
        { x: 344.96, y: 177.59, w: 121.70, h: 101.83 },
        { x: 344.96, y: 127.18, w: 60.85, h: 47.23 },
        { x: 409.44, y: 143.98, w: 33.15, h: 30.43 },
        { x: 270.34, y: 159.76, w: 69.62, h: 47.20 },
        { x: 425.26, y: 283.20, w: 34.75, h: 34.75 },
        { x: 344.96, y: 283.20, w: 76.91, h: 76.91 },
        { x: 343.99, y: 363.82, w: 46.92, h: 46.92 },
        { x: 284.47, y: 437.65, w: 35.68, h: 34.80 },
        { x: 212.49, y: 437.65, w: 68.37, h: 57.00 }
    ];

    /* The collage's own bounding box in those coordinates, derived rather than
       typed so it cannot disagree with the rectangles above it. */
    const ANNIV_COLLAGE_BOX = (() => {
        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        ANNIV_COLLAGE.forEach((r) => {
            x1 = Math.min(x1, r.x);
            y1 = Math.min(y1, r.y);
            x2 = Math.max(x2, r.x + r.w);
            y2 = Math.max(y2, r.y + r.h);
        });
        return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    })();

    /* Page geometry, in points on this editor's own portrait A4. */
    const ANNIV = {
        page: { w: 597.45, h: 841.89 },
        names: { baseline: 84, size: 46, gap: 26 },
        /* The heart between the names, and the one behind the marked day. The
           artwork draws two paths at different sizes; they are the same shape
           (aspect 1.092 and 1.093 measured), so one path serves both. */
        nameHeart: { w: 42, cy: 66 },
        collage: { x: 98.725, y: 100, w: 400, h: 0 },
        code: { x: 188.725, y: 448, w: 220, h: 55 },
        month: { baseline: 540, size: 26 },
        head: { baseline: 573, size: 21 },
        rule: { y: 583, x1: 148.725, x2: 448.725, width: 2 },
        /* Six rows is the worst case -- a 31-day month opening on a Friday or
           Saturday -- and the rhythm below is set so that row six clears the
           tagline rather than so that five rows look comfortable. A layout
           tuned to the common case and broken by August is the fault the
           supplied artwork already has. */
        grid: { top: 613, pitch: 27, size: 21 },
        dayHeart: { w: 32 },
        tagline: { baseline: 800, size: 34, maxW: 0.82 }
    };
    /* Height follows the collage's own proportions; typing it would let the
       heart stretch the first time the width moved. */
    ANNIV.collage.h = ANNIV.collage.w * (ANNIV_COLLAGE_BOX.h / ANNIV_COLLAGE_BOX.w);

    /* Two colourways, holding COLOUR and nothing else, so the geometry above
       cannot drift between them -- the same separation SCREEN/SCREEN_THEMES and
       PLAYER/PLAYER_THEMES already make in this file.

       `boxFill` and `boxStroke` are the pair that matters. An empty collage box
       is WHITE on the artwork's black ground, and that is the design rather
       than a placeholder: the heart reads as a heart before a single photograph
       is in it. Invert the ground and a white box disappears, so the light
       colourway outlines its boxes instead of filling them -- the same problem
       and the same answer as the player's empty album panel. */
    const ANNIV_THEMES = {
        night: {
            label: "Dark",
            page: "#050606",
            ink: "#FFFFFF",
            accent: "#E93625",
            boxFill: "#FFFFFF",
            boxStroke: null,
            /* The marked day's number sits ON the heart, so its colour has to
               contrast with THAT, not with the page. Both colourways keep the
               same red heart, so both put white on it. */
            onAccent: "#FFFFFF"
        },
        day: {
            label: "Light",
            page: "#FFFFFF",
            ink: "#1A1A1A",
            /* The heart keeps its red. It is the one colour in this poster
               that is not carrying contrast against the ground, and flipping
               it would be inventing a design the artwork does not have. */
            accent: "#E93625",
            boxFill: null,
            boxStroke: "#1A1A1A",
            onAccent: "#FFFFFF"
        }
    };

    /* The option labels read Dark and Light, matching the music player's, so
       all four posters that carry a colourway describe it the same way. The
       stored KEYS stay "night" and "day": they are in every saved poster and
       in the history, and renaming them to tidy a label would invalidate work
       somebody already has open. */
    const DEFAULT_ANNIV_THEME = "night";

    function annivTheme() {
        return ANNIV_THEMES[state.annivTheme] || ANNIV_THEMES[DEFAULT_ANNIV_THEME];
    }

    /* The heart, verbatim from the artwork, with its MEASURED bounding box as
       the view so drawArt() can place it in any rectangle. The box came from
       getBBox() on the real path rather than from reading the numbers out of
       the `d` string, which are relative deltas and do not bound anything. */
    const ANNIV_HEART = {
        view: [447.88, 43, 57.07, 52.27],
        ink: "accent",
        parts: [{ d: "M476.41,95.27l-2.93-2.63Q465.95,85.71,461,80.7a88,88,0,0,1-7.84-9,29.3,29.3,0,0,1-4.1-7.16,18.81,18.81,0,0,1-1.18-6.48,14.74,14.74,0,0,1,15-15A15.15,15.15,0,0,1,470.39,45a18.27,18.27,0,0,1,6,5.55,20.77,20.77,0,0,1,6.34-5.66A14.86,14.86,0,0,1,489.94,43a14.72,14.72,0,0,1,15,15,18.58,18.58,0,0,1-1.18,6.48,29.56,29.56,0,0,1-4.09,7.16,88.2,88.2,0,0,1-7.85,9q-4.92,5-12.46,11.94Z" }]
    };
    ANNIV_HEART.parts.forEach((p) => { p.path = new Path2D(p.d); });

    /* ----------------------------------------------------------------------
       The birthday calendar poster (September 12, 2026).

       Traced from a supplied A4 PORTRAIT artwork, so unlike the anniversary
       poster nothing had to be rearranged: the source's own page is this
       editor's page and every figure below is the artwork's own.

       Its calendar was CORRECT in the source -- September 2025 did open on a
       Monday with thirty days in five rows, and its 15th was a Monday. That is
       the opposite of the anniversary artwork, which claimed November 2025
       opened on a Monday when it opened on a Saturday. Neither fact is a rule:
       both were checked.

       It is still computed rather than copied, because the source's positions
       are hand-set -- one row sits at x 34.02, 78.99, 119.46, 165.13, 207.75,
       242.21 and 282.24, gaps of 44.97, 40.47, 45.67, 42.62, 34.46 and 40.03 --
       and because a visitor picking another month gets another first weekday,
       another length and four to six rows.

       annivMonth() and annivCell() do that arithmetic and are REUSED here. A
       second calendar is a second calendar to be wrong.
       ---------------------------------------------------------------------- */

    /* The twelve photo boxes, verbatim from the artwork, in its own order.

       They do NOT overlap, and the gaps between them are hand-set: measured,
       3.8 to 9.6 points and never the same twice. The cascade reads as a
       cascade BECAUSE the spacing is irregular, so these are kept exactly
       rather than squared onto a grid, which would turn a scatter into a
       table. */
    const HBD_BOXES = [
        { x: 326.20, y: 163.36, w: 121.16, h: 98.48 },
        { x: 454.71, y: 208.49, w: 71.02, h: 125.93 },
        { x: 464.21, y: 341.76, w: 103.55, h: 119.64 },
        { x: 468.96, y: 471.05, w: 77.05, h: 107.47 },
        { x: 322.36, y: 360.52, w: 131.42, h: 110.53 },
        { x: 56.37, y: 520.15, w: 100.41, h: 142.55 },
        { x: 161.54, y: 557.00, w: 100.41, h: 140.71 },
        { x: 365.09, y: 575.69, w: 77.66, h: 112.40 },
        { x: 266.70, y: 567.52, w: 93.63, h: 149.99 },
        { x: 292.39, y: 477.27, w: 72.71, h: 85.76 },
        { x: 369.02, y: 476.56, w: 89.51, h: 95.29 },
        { x: 334.16, y: 266.33, w: 110.66, h: 90.40 }
    ];

    const HBD = {
        page: { w: 595.28, h: 841.89 },
        month: { baseline: 63.28, x: 53.1, size: 42.52 },
        head: { baseline: 103.67, size: 23.93, track: 0.4 },
        rule: { y: 114.44, x1: 36.4, x2: 308.39, width: 2 },
        grid: { top: 151.88, pitch: 28.73, size: 23.93 },
        dayHeart: { w: 30 },
        quote: { x: 34.02, baseline: 321.97, size: 30.63, leading: 36.76, maxLines: 7 },
        closing: { x: 34.02, baseline: 757.05, size: 29, leading: 34.8 },
        /* The heart that closes the last line, sized and placed relative to
           the line it follows rather than pinned to the artwork's 536.72 --
           the message is visitor-typed and its last line will not be that
           long. */
        closingHeart: { w: 26 },
        photoStroke: 1
    };

    const HBD_THEMES = {
        night: {
            label: "Dark",
            page: "#231F20",
            ink: "#FFFFFF",
            accent: "#E93625",
            boxFill: "#FFFFFF",
            boxStroke: "#E93625",
            onAccent: "#FFFFFF",
            garlandA: "#C190B7",
            garlandB: "#A4B1C3",
            sparkle: "#FDF5A2",
            sparkleTip: "#FFFDE6"
        },
        day: {
            label: "Light",
            page: "#FFFFFF",
            ink: "#231F20",
            accent: "#E93625",
            /* An empty box is a white panel on the artwork's black ground, and
               that is the design rather than a placeholder. Invert the ground
               and a white box disappears, so this colourway outlines instead --
               the same problem and the same answer as the anniversary poster's
               collage and the player's empty album. */
            boxFill: null,
            boxStroke: "#E93625",
            onAccent: "#FFFFFF",
            garlandA: "#9B6C92",
            garlandB: "#7A8AA0",
            /* Pale yellow on white is not a sparkle. */
            sparkle: "#D8B24A",
            sparkleTip: "#F3E3B0"
        }
    };

    const DEFAULT_HBD_THEME = "night";

    function hbdTheme() {
        return HBD_THEMES[state.hbdTheme] || HBD_THEMES[DEFAULT_HBD_THEME];
    }

    const DEFAULT_HBD_QUOTE =
        "Write the words you would say if you had the whole page for them.";
    const DEFAULT_HBD_CLOSING =
        "With all my love, always";

    /* Five garland hearts on a string, across the top right. Positions and
       sizes are the artwork's, as fractions of the page so they follow the
       paper rather than a pixel size. Alternating colours, and the string is
       drawn through their centres. */
    const HBD_GARLAND = {
        hearts: [
            { cx: 384.0, cy: 96.5, w: 30.0, tint: "A" },
            { cx: 420.6, cy: 88.5, w: 27.5, tint: "B" },
            { cx: 456.0, cy: 82.0, w: 30.0, tint: "A" },
            { cx: 492.5, cy: 75.0, w: 27.5, tint: "B" },
            { cx: 528.0, cy: 66.5, w: 32.0, tint: "A" }
        ],
        string: { x1: 356.0, y1: 104.0, x2: 556.0, y2: 58.0, width: 1.4 },
        /* The little tick marks at each end of the string in the artwork. */
        ticks: [{ x: 352.0, y: 105.0 }, { x: 560.0, y: 57.0 }]
    };

    /* Five sparkle clusters. Each is a large four-pointed star with three
       smaller ones around it; `r` is the large star's half-width and the
       satellites are [dx, dy, r] relative to it.

       The artwork draws the GLOW behind each spike as a raster mask -- 95
       masks backed by 74 embedded PNGs, about 40KB and 44 per cent of that
       file's weight. None of it is here. A four-pointed star is two crossed
       tapered spikes and needs no mask; the softness the masks were adding is
       a gradient, which costs nothing and travels through both painters.

       These numbers are MEASURED from the artwork's paths, and the ones they
       replace were not. Eyeballed, the clusters landed within a point or two
       of the right place and then drew two-and-a-half times too large, square,
       and with one satellite missing each -- the positions were near enough to
       look deliberate, which is exactly why nobody caught the size. Reading
       the file was the only thing that would have. */
    const HBD_SPARKLES = [
        { x: 476.9, y: 187.2, r: 5.04,
          sats: [[6.25, -5.18, 1.88], [-5.04, -4.49, 1.73], [-4.3, 5.9, 1.77]] },
        { x: 551.4, y: 296.5, r: 9.64,
          sats: [[12.04, -9.93, 3.59], [-9.56, -8.56, 3.31], [-8.14, 11.32, 3.38]] },
        { x: 254.3, y: 525.6, r: 11.73,
          sats: [[14.67, -12.13, 4.37], [-11.6, -10.47, 4.02], [-9.9, 13.73, 4.11]] },
        { x: 491.4, y: 635.1, r: 16.1,
          sats: [[20.08, -16.62, 5.99], [-15.94, -14.33, 5.52], [-13.58, 18.85, 5.63]] },
        { x: 64.25, y: 699.3, r: 13.25,
          sats: [[16.55, -13.66, 4.91], [-13.11, -11.78, 4.55], [-11.15, 15.55, 4.64]] }
    ];

    /* ----------------------------------------------------------------------
       The birthday tribute poster (September 12, 2026).

       The sixth layout's sibling, from a second artwork in the same family.
       Everything it can share it shares: annivMonth(), annivCell(), hbdWrap(),
       hbdFont(), HBD_SPARK_PATH, ANNIV_HEART, scaleBoxes() and calGrid(). What
       is here is what actually differs.
       ---------------------------------------------------------------------- */

    /* Four sparkle clusters, measured the same way as the birthday's five and
       in the same shape, because it is the same star -- this artwork simply
       scatters four of them instead of five and puts them elsewhere. Sharing
       the DATA would have been the mistake; sharing HBD_SPARK_PATH and
       hbdDrawSparkle() is the whole of what these two posters have in
       common here. */
    const TRIB_SPARKLES = [
        { x: 418, y: 215.2, r: 5.93,
          sats: [[7.37, -6.13, 2.21], [-5.86, -5.29, 2.04], [-5.01, 6.94, 2.06]] },
        { x: 537.9, y: 302.8, r: 11.34,
          sats: [[14.16, -11.71, 4.22], [-11.21, -10.09, 3.9], [-9.59, 13.28, 3.97]] },
        { x: 221.9, y: 531.6, r: 13.8,
          sats: [[17.23, -14.24, 5.13], [-13.66, -12.29, 4.73], [-11.61, 16.15, 4.86]] },
        { x: 54.38, y: 711.1, r: 13.25,
          sats: [[16.55, -13.67, 4.94], [-13.13, -11.79, 4.54], [-11.19, 15.54, 4.64]] }
    ];

    /* The glossy heart, six layers deep, verbatim from the artwork.

       The flat heart this replaces was ANNIV_HEART -- one path, one fill --
       borrowed from the anniversary poster because a heart is a heart. On this
       artwork it is not. The four hanging hearts and the one at the foot are
       MODELLED: a base red, a dark rim down the right, a lighter wash across
       the belly with a wavy top edge, and a bright crescent on the upper-left
       lobe. At 67 points across, flat red reads as a sticker where the source
       reads as an object with a light on it, and nothing about the silhouette
       was ever the problem.

       So the six paths are kept exactly as drawn and each gradient is resolved
       out of the source's own `gradientTransform` into this box's coordinates,
       which is the only part that needed arithmetic. `view` is the TRUE
       bounding box, sampled along the curves rather than taken from the path's
       anchors -- a heart's widest points are mid-curve, and the anchors put it
       16 points shorter than it draws.

       Kept OUT of it: the day marker and the heading heart, which the artwork
       itself draws flat, and both stay ANNIV_HEART. Gloss at eighteen points
       is noise. */
    const TRIB_HEART = {
        view: [348.34, 93.64, 67.17, 59.85],
        parts: [
            { fill: "#EE3533",
              d: "M415.5,114.32" +
                 "c.46,21.52-32.77,33-32.9,39.17.08-6.43-33.8-16.23-34.26-37.74" +
                 "s32.78-32.32,33.33-6.24C381.12,83.33,415.05,92.81,415.5,114.32Z" },
            { grad: [381.87, 102.72, 359.03, 91.18], stops: [[0, "#D22026", 1], [1, "#D22026", 0]], rule: "evenodd",
              d: "M366.11,95.12a33.52,33.52,0,0,1,9,2c3.58,1.6,5.57,7.52,5.6,9.19" +
                 "a15,15,0,0,0,.44,3.16" +
                 "s-1.43-5.93-5.4-8.64-12.56-3.83-15.15-3,5.71-2.73,5.53-2.73Z" },
            { grad: [348.73, 119.88, 386.52, 119.49], stops: [[0, "#F15858", 1], [1, "#F15858", 0]], rule: "evenodd",
              d: "M367.05,95.66c2.89-.06,7.09.41,8.15,6.35" +
                 "s-2.54,12.35-5,20.79-2.3,14.39,3.56,18.55a28.46,28.46,0,0,1,8.19,8.4" +
                 "s-7-6.19-10.6-8-12.3-7.74-16.68-13.44" +
                 "c-7.47-9.71-5.45-20.18-.35-25.33,5.84-5.9,10-7.29,12.7-7.35Z" },
            { grad: [369.52, 110.98, 396.22, 134.90], stops: [[0, "#FCD5D5", 1], [1, "#F7A8AA", 0]], rule: "evenodd", alpha: 0.4,
              d: "M352.78,125.59a16.66,16.66,0,0,1,17.6-4.66" +
                 "c11.25,3.3,18.35,4.08,23.68,1" +
                 "s14.48-2.54,17.13-.92-3.5,10.69-10.48,15.5-16,9.84-17.46,11.36-13.94-6.78-18.67-10.41" +
                 "S354.37,130.21,352.78,125.59Z" },
            { grad: [410.94, 122.93, 392.81, 120.71], stops: [[0, "#D22026", 1], [1, "#D22026", 0]], rule: "evenodd",
              d: "M386,100.85" +
                 "s9.81-3,13.43.83,7.82,17.17,2.42,26-15.53,14.67-18.28,17.15-6.16-.61-9.73-2.4-10.19-5.93-10.19-5.93,8.89,6.14,12.29,8.68" +
                 "a67.85,67.85,0,0,1,6.65,5.82" +
                 "s11.91-9.57,16.68-13,12.71-15.74,14.12-19.3-.83-12.66-4.26-16.5-11.34-7.58-15.42-6.56-7.71,5.19-7.71,5.19" +
                 "Z" },
            { grad: [349.35, 111.88, 356.12, 114.13], stops: [[0, "#FCD5D5", 1], [1, "#F7A8AA", 0]], rule: "evenodd",
              d: "M371.8,100.22S363,99.66,359,104.77a20.83,20.83,0,0,0-3.74,16.48" +
                 "A32.75,32.75,0,0,0,364,135.6c3.61,3.09,11.21,10.19,11.21,10.19" +
                 "s-14.93-10.11-19.37-17.1-5.31-13.49-3.23-20.8,9.84-10.27,13-10.15" +
                 "S372.19,100.58,371.8,100.22Z" },
            { grad: [391.88, 93.83, 392.71, 97.52], stops: [[0, "#F7A8AA", 1], [1, "#F7A8AA", 0]], rule: "evenodd",
              d: "M384.22,105.73" +
                 "s6.2-6.28,9.35-7.09,11,1.81,11,1.81-5.13-4.92-10.15-4.25-9.78,4.3-10.23,9.53" +
                 "Z" },
        ]
    };

    /* Fifteen photo boxes, verbatim from the artwork.

       THESE OVERLAP, which the sibling layout's do not. Measured: boxes 1 and 9
       by 108.2 x 2.5pt, 1 and 11 by 92.9 x 2.8, 2 and 12 by 80.3 x 2.4, and 8
       and 9 by 5.0 x 51.0. The first three are edge kisses where the 2pt white
       strokes coincide -- which is exactly how a stack of bordered photographs
       reads -- and the fourth is a real overlap.

       So DRAW ORDER is load-bearing here, and the hit test walks backwards to
       break the tie the same way the paint does. The positions are not tidied.

       `tint` marks the one box the artwork fills a lighter red. */
    const TRIB_BOXES = [
        { x: 333.59, y: 359.38, w: 113.00, h: 92.78 },
        { x: 446.59, y: 403.92, w: 103.80, h: 228.83 },
        { x: 149.41, y: 230.43, w: 64.32, h: 59.38 },
        { x: 299.34, y: 568.00, w: 147.26, h: 168.78, tint: true },
        { x: 213.73, y: 227.96, w: 63.70, h: 90.30 },
        { x: 277.44, y: 223.01, w: 60.92, h: 108.24 },
        { x: 338.36, y: 218.89, w: 67.11, h: 55.77 },
        { x: 446.59, y: 310.83, w: 75.77, h: 93.08 },
        { x: 338.36, y: 274.65, w: 113.18, h: 87.21 },
        { x: 256.50, y: 452.16, w: 97.16, h: 115.85 },
        { x: 353.66, y: 449.40, w: 92.94, h: 118.60 },
        { x: 446.59, y: 630.36, w: 80.29, h: 73.28 },
        { x: 183.25, y: 568.00, w: 115.88, h: 186.96 },
        { x: 105.30, y: 597.98, w: 77.46, h: 131.56 },
        { x: 24.49, y: 584.54, w: 79.82, h: 89.87 }
    ];

    const TRIB = {
        page: { w: 595.28, h: 841.89 },
        month: { baseline: 69.25, x: 44.12, size: 38.43 },
        head: { baseline: 90.88, size: 18.42 },
        rule: { y: 99.17, x1: 26.32, x2: 235.72, width: 2 },
        grid: { top: 127.99, pitch: 22.12, size: 18.42 },
        dayHeart: { w: 24 },
        /* The heading and the three lines under it are ONE block in the
           artwork and two here: the heading carries an inline heart and the
           body wraps, and those are different jobs. */
        heading: { x: 25.15, baseline: 357.37, size: 26.44, heart: 17, gap: 5 },
        message: { x: 25.15, baseline: 389.1, size: 26.44, leading: 31.73, maxLines: 5 },
        /* `heart` and `lift` are measured the same way: the foot heart draws
           51.67 wide with its top 35 points above the title's baseline, which
           is 0.75 of its own height. */
        title: { x: 112.18, baseline: 816.33, size: 49.87, heart: 51.67,
            gap: 4, lift: 0.75 },
        boxStroke: 2,
        /* Four hearts on strings from the top edge. Each string runs from y
           `from` down to its own `to`, and the heart hangs in its cleft.

           The widths are MEASURED off the reference -- the widest red run in
           each heart's own column, at three samples per point -- and not read
           off the path anchors, which come up short on a shape whose widest
           points are mid-curve. The four had been 44, 36, 40 and 38, which is
           roughly two thirds of the truth and is what a heart looks like when
           somebody sized it by eye against a thumbnail. */
        strings: [
            { x: 381.63, from: 10.06, to: 108.55, w: 67.33 },
            { x: 435.48, from: 10.06, to: 68.55, w: 42.00 },
            { x: 477.64, from: 10.06, to: 137.37, w: 59.33 },
            { x: 518.46, from: 10.06, to: 85.90, w: 49.00 }
        ],
        stringWidth: 3
    };

    const TRIB_THEMES = {
        night: {
            label: "Dark",
            page: "#231F20",
            ink: "#FFFFFF",
            accent: "#E93625",
            /* An empty box is a RED panel here, not a white one: this artwork
               fills its boxes and outlines them in white, the reverse of the
               sibling's. That is the design, and it is why an unfilled poster
               still reads as a wall of pictures. */
            boxFill: "#E93625",
            boxTint: "#EF4136",
            boxStroke: "#FFFFFF",
            onAccent: "#FFFFFF",
            string: "#ED1C24",
            /* Two tokens, because the sparkle is LIT rather than filled:
               warm at the core, near-white out along the spikes. Measured off
               the reference, which reads #FEF7AE at the core and #FFFDE6 at
               the tips. */
            sparkle: "#FDF5A2",
            sparkleTip: "#FFFDE6"
        },
        day: {
            label: "Light",
            page: "#FFFFFF",
            ink: "#231F20",
            accent: "#E93625",
            boxFill: "#E93625",
            boxTint: "#EF4136",
            /* The white keyline vanishes on white paper, so on this colourway
               the boxes are separated by the ground itself and outlined in the
               ink instead. */
            boxStroke: "#231F20",
            onAccent: "#FFFFFF",
            string: "#C2161C",
            /* On white paper the same lighting has to run the other way: a
               near-white tip would disappear into the page, so the core is
               gold and the tips stop at cream. */
            sparkle: "#D8B24A",
            sparkleTip: "#F3E3B0"
        }
    };

    const DEFAULT_TRIB_THEME = "night";

    function tribTheme() {
        return TRIB_THEMES[state.tribTheme] || TRIB_THEMES[DEFAULT_TRIB_THEME];
    }

    /* Two spaces, and the T is deliberate: the heart stands in for the O, so
       the default demonstrates the marker rather than describing it. */
    const DEFAULT_TRIB_HEADING = "T  SOMEONE";
    const DEFAULT_TRIB_MESSAGE =
        "Write the few lines you would want them to read first.";
    const DEFAULT_TRIB_TITLE = "Happy Birthday";

    function tribRects(W, H) {
        return scaleBoxes(TRIB_BOXES, TRIB.page, W, H);
    }

    function tribGrid(W, H) {
        return calGrid(TRIB, W, H);
    }

    /* How wide the message may run before it reaches the photographs.

       Box 9 is the leftmost box of the middle band -- the one the message
       actually runs into -- and the 10 points are the gap the artwork leaves
       between the two. Derived rather than typed, so moving that box moves the
       wrap with it, and in ONE place because both painters need the same
       answer and this file's standing hazard is two painters that disagree
       quietly. */
    const TRIB_MESSAGE_GUTTER = 10;

    function tribMessageWidth(W) {
        return (TRIB_BOXES[9].x - TRIB.message.x - TRIB_MESSAGE_GUTTER) *
            (W / TRIB.page.w);
    }

    /* The heading: text, heart, text.

       The artwork stores it as ONE string under xml:space="preserve", with
       seven leading spaces and then five more between the first letter and the
       rest -- and those five are not spacing, they are a HOLE the heart sits
       in, punched by hand in Monotype Corsiva at 26.44px. Kept, they are a
       ragged gap in any other face; stripped, the heart lands on a letter.

       So the heading is split on the FIRST run of two or more spaces, the two
       halves are measured, and the heart goes between them. A visitor who types
       no double space gets a heading with the heart at the end, which is the
       sensible reading of "no gap was asked for". */
    function tribHeadingParts(text) {
        const t = String(text || "");
        const m = /\s{2,}/.exec(t.trim());
        if (!m) { return { before: t.trim(), after: "" }; }
        const trimmed = t.trim();
        return {
            before: trimmed.slice(0, m.index).trim(),
            after: trimmed.slice(m.index + m[0].length).trim()
        };
    }

    const ANNIV_DAYS = ["S", "M", "T", "W", "T", "F", "S"];
    const ANNIV_MONTHS = ["January", "February", "March", "April", "May",
        "June", "July", "August", "September", "October", "November",
        "December"];

    const DEFAULT_NAME_A = "Your Name";
    const DEFAULT_NAME_B = "Their Name";
    const DEFAULT_TAGLINE = "Years of togetherness";

    /* Which weekday the month opens on, and how long it is.

       Built through Date.UTC rather than by parsing a string. `new
       Date("2025-11-01")` is UTC midnight, which is the previous DAY anywhere
       west of Greenwich, and a calendar that silently starts on the wrong
       weekday for half the planet is the defect this whole layout exists to
       avoid -- the supplied artwork itself has November 2025 opening on a
       Monday when it opened on a Saturday. */
    function annivMonth(year, month) {
        const y = Math.min(9999, Math.max(1, Math.round(Number(year) || 1)));
        const m = Math.min(11, Math.max(0, Math.round(Number(month) || 0)));
        const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
        const length = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
        return {
            year: y,
            month: m,
            first: first,
            length: length,
            /* Four for a 28-day February opening on a Sunday, six for a
               31-day month opening on a Friday or Saturday. Both are drawn. */
            rows: Math.ceil((first + length) / 7)
        };
    }

    /* Where one date sits, as a column and a row. Returns null for a day the
       month does not have, so a visitor who picks the 31st and then a 30-day
       month gets no marker rather than one off the end of the grid. */
    function annivCell(info, day) {
        const d = Math.round(Number(day) || 0);
        if (d < 1 || d > info.length) {
            return null;
        }
        const index = info.first + d - 1;
        return { col: index % 7, row: Math.floor(index / 7), day: d };
    }

    /* The grid's own metrics. Seven columns across the rule beneath the
       header, which is what the artwork centres its numbers against -- badly,
       by hand, which is why none of its thirty positions are copied. */
    function annivGrid(W, H) {
        const fx = W / ANNIV.page.w;
        const fy = H / ANNIV.page.h;
        const x1 = ANNIV.rule.x1 * fx;
        const span = (ANNIV.rule.x2 - ANNIV.rule.x1) * fx;
        return {
            fx: fx,
            fy: fy,
            x1: x1,
            span: span,
            col: span / 7,
            centre: (i) => x1 + (span / 7) * (i + 0.5),
            baseline: (r) => (ANNIV.grid.top + ANNIV.grid.pitch * r) * fy
        };
    }

    /* The collage's eighteen boxes mapped from the artwork's coordinates into
       this page's. One function, so the hit test, the painter and the SVG
       exporter cannot disagree about where a photograph goes. */
    function annivRects(W, H) {
        const fx = W / ANNIV.page.w;
        const fy = H / ANNIV.page.h;
        const box = ANNIV.collage;
        const src = ANNIV_COLLAGE_BOX;
        return ANNIV_COLLAGE.map((r) => ({
            x: (box.x + ((r.x - src.x) / src.w) * box.w) * fx,
            y: (box.y + ((r.y - src.y) / src.h) * box.h) * fy,
            w: ((r.w / src.w) * box.w) * fx,
            h: ((r.h / src.h) * box.h) * fy
        }));
    }

    function annivClampMonth(v) {
        const n = Math.round(Number(v));
        return Number.isFinite(n) ? Math.min(11, Math.max(0, n)) : new Date().getMonth();
    }

    function annivClampYear(v) {
        const n = Math.round(Number(v));
        return Number.isFinite(n) ? Math.min(2999, Math.max(1900, n)) : new Date().getFullYear();
    }

    /* 1 to 31 here rather than to the month's own length: the day survives a
       change of month, so picking the 31st and then February leaves the marker
       off until a 31-day month comes back round. annivCell() returns null for
       a day the month does not have, which is where that is handled. */
    function annivClampDay(v) {
        const n = Math.round(Number(v));
        return Number.isFinite(n) ? Math.min(31, Math.max(1, n)) : new Date().getDate();
    }

    function annivCodeRect(W, H) {
        const fx = W / ANNIV.page.w;
        const fy = H / ANNIV.page.h;
        return {
            x: ANNIV.code.x * fx, y: ANNIV.code.y * fy,
            w: ANNIV.code.w * fx, h: ANNIV.code.h * fy
        };
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
    /* The music player's scannable code, appended for the same reason the
       circle was: every index already in use keeps the number it had.

       Its ALBUM artwork is not here -- that is slot 0, "the photograph" every
       single-photo layout uses, so switching between the card and the player
       carries the picture across the way it already does everywhere else. */
    const CODE_SLOT = 7;

    /* The anniversary collage is eighteen boxes. The first of them is SLOT 0 --
       "the photograph" every single-photo layout already uses -- so the picture
       carries across when a visitor tries this template against the card or the
       player, which is the rule slotsFor() is built on. The other seventeen are
       appended, and the scan code reuses CODE_SLOT because it is the same kind
       of thing the player draws.

       Eighteen reachable slots is far more than any layout had before, and the
       only reason that is safe is slotsFor(): SLOT_COUNT is the array's LENGTH
       and nothing reads it as how many slots a visitor can reach. Before that
       fix this change would have put ten phantom cards in the search screen's
       menu, each able to delete a photograph from a different poster. */
    const ANNIV_EXTRA = 17;
    const ANNIV_FIRST = 8;

    /* The birthday poster's twelve boxes, appended by the same rule again: its
       first box is SLOT 0 so a photograph carries across, and the other eleven
       take fresh indices rather than sharing the anniversary's. Sharing would
       be tempting -- both are collages of rectangles -- and would mean a
       visitor who arranged eighteen photographs into a heart, then looked at
       the birthday poster, found twelve of them rearranged and six missing. A
       slot is a place in ONE design. */
    const HBD_EXTRA = 11;
    const HBD_FIRST = ANNIV_FIRST + ANNIV_EXTRA;

    /* The birthday tribute's fifteen boxes, appended by the same rule a third
       time: its first box is SLOT 0 so a photograph carries across, and the
       other fourteen take fresh indices. They are NOT shared with the birthday
       calendar poster's twelve even though the two layouts are siblings -- a
       visitor who arranged twelve photographs into one cascade and then opened
       the other would find them redistributed through a different design. A
       slot is a place in ONE arrangement. */
    const TRIB_EXTRA = 14;
    const TRIB_FIRST = HBD_FIRST + HBD_EXTRA;
    const SLOT_COUNT = TRIB_FIRST + TRIB_EXTRA;

    /* Collage box index (0..17) to photo slot. */
    function annivSlot(i) {
        return i === 0 ? 0 : ANNIV_FIRST + i - 1;
    }

    /* Birthday box index (0..11) to photo slot. */
    function hbdSlot(i) {
        return i === 0 ? 0 : HBD_FIRST + i - 1;
    }

    /* Tribute box index (0..14) to photo slot. */
    function tribSlot(i) {
        return i === 0 ? 0 : TRIB_FIRST + i - 1;
    }

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

    /* The music player's four words, and the two rules they follow.

       The defaults are the artwork's own -- "Song Title", "Artist Name", 1:07
       and 5:07 -- because unlike the search bar's query these ARE placeholders
       in the source rather than somebody's real content, so shipping them
       copies nobody's poster. */
    const DEFAULT_SONG = "Song Title";
    const DEFAULT_ARTIST = "Artist Name";
    const DEFAULT_ELAPSED = "1:07";
    const DEFAULT_TOTAL = "5:07";

    const LINE_MAX_CHARS = 40;
    const TIME_MAX_CHARS = 8;

    function cleanLine(value) {
        return String(value === null || value === undefined ? "" : value)
            .replace(/\s+/g, " ")
            .slice(0, LINE_MAX_CHARS);
    }

    /* Free text, not a parsed duration. A visitor may well want "--:--" or
       "forever", and a field that refuses anything but digits would be an
       editor arguing with a poster. playedFraction() reads it leniently and
       falls back when it cannot; it never rewrites what was typed. */
    /* A paragraph rather than a line. Line BREAKS survive, because somebody
       writing a message may want one; runs of spaces do not, which is what
       flattens the supplied artwork's hand-typed indent -- its quote fakes a
       centred last line with nineteen literal spaces under
       xml:space="preserve", an indent that was only ever correct in Monotype
       Corsiva at 30.63px and is meaningless in any other face. The wrapper
       does the centring that indent was imitating. */
    const BLOCK_MAX_CHARS = 220;

    function cleanBlock(value) {
        return String(value === null || value === undefined ? "" : value)
            .replace(/\r\n?/g, "\n")
            .replace(/[^\S\n]+/g, " ")
            .replace(/\n{3,}/g, "\n\n")
            .slice(0, BLOCK_MAX_CHARS);
    }

    /* The tribute heading, which is the one field in this editor where a RUN
       of spaces is meaningful rather than sloppy.

       Its artwork reads a single letter, a heart, then two more words -- the
       heart is standing in for the second letter of a two-letter word, not
       separating two phrases. The source punches the gap with five literal
       spaces under xml:space="preserve", and that is the only instruction in
       the file about where the heart belongs. (The artwork's own wording is a
       real message between two people and is deliberately not repeated here.)

       So two-or-more spaces are kept and mean "the heart goes here", and
       cleanBlock() is deliberately NOT used: it collapses runs of spaces, which
       is right for a paragraph and would silently delete the marker here. Runs
       longer than two are normalised so a visitor leaning on the space bar gets
       the same result as one pressing it twice. */
    const HEADING_MAX_CHARS = 60;

    function cleanHeading(value) {
        return String(value === null || value === undefined ? "" : value)
            .replace(/[\r\n]+/g, " ")
            .replace(/ {3,}/g, "  ")
            .slice(0, HEADING_MAX_CHARS);
    }

    /* A colour, and nothing else.

       This one is not cosmetic hygiene like cleanLine(). The value goes
       straight into ctx.fillStyle AND into a `fill="..."` attribute in the
       exported SVG, so an unchecked string here is markup written into a file
       a visitor then opens. Only the two hex forms a colour input can produce
       are allowed through; anything else returns "" and the caller falls back
       to the theme's own accent.

       Normalised to lower case so the same colour cannot be stored two ways
       and compare unequal. */
    const COLOUR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

    function cleanColour(value) {
        const v = String(value === null || value === undefined ? "" : value).trim();
        return COLOUR_RE.test(v) ? v.toLowerCase() : "";
    }

    function cleanTime(value) {
        return String(value === null || value === undefined ? "" : value)
            .replace(/\s+/g, "")
            .slice(0, TIME_MAX_CHARS);
    }

    /* Where the knob sits, from the two time fields rather than a control of
       its own. m:ss and h:mm:ss both parse; anything else -- and any total of
       zero -- takes the artwork's own position instead of dividing by nothing. */
    function playedFraction() {
        const secs = (text) => {
            const parts = String(text).split(":");
            if (!parts.length || parts.length > 3) { return null; }
            let total = 0;
            for (let i = 0; i < parts.length; i += 1) {
                if (!/^\d{1,2}$/.test(parts[i])) { return null; }
                total = total * 60 + Number(parts[i]);
            }
            return total;
        };
        const a = secs(state.elapsed);
        const b = secs(state.total);
        if (a === null || b === null || b <= 0) {
            return PLAYER.fallbackPlayed;
        }
        return Math.min(1, Math.max(0, a / b));
    }

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
        playerTheme: DEFAULT_PLAYER_THEME,
        heartColour: DEFAULT_HEART_COLOUR,
        codePos: DEFAULT_CODE_POS,
        captionHead: "",
        captionBody: "",
        annivTheme: DEFAULT_ANNIV_THEME,
        hbdTheme: DEFAULT_HBD_THEME,
        tribTheme: DEFAULT_TRIB_THEME,
        heading: DEFAULT_TRIB_HEADING,
        message: DEFAULT_TRIB_MESSAGE,
        title: DEFAULT_TRIB_TITLE,
        quote: DEFAULT_HBD_QUOTE,
        closing: DEFAULT_HBD_CLOSING,
        nameA: DEFAULT_NAME_A,
        nameB: DEFAULT_NAME_B,
        tagline: DEFAULT_TAGLINE,
        /* The month the poster opens on. Today's, so a visitor who changes
           nothing still sees a real calendar rather than a fixed month from
           whenever this was written -- which is exactly what the supplied
           artwork did, and its month was wrong. */
        month: new Date().getMonth(),
        year: new Date().getFullYear(),
        day: new Date().getDate(),
        song: DEFAULT_SONG,
        artist: DEFAULT_ARTIST,
        elapsed: DEFAULT_ELAPSED,
        total: DEFAULT_TOTAL,
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
            playerTheme: state.playerTheme, song: state.song, artist: state.artist,
            elapsed: state.elapsed, total: state.total,
            heartColour: state.heartColour, codePos: state.codePos,
            captionHead: state.captionHead, captionBody: state.captionBody,
            annivTheme: state.annivTheme,
            hbdTheme: state.hbdTheme,
            tribTheme: state.tribTheme,
            heading: state.heading, message: state.message, title: state.title,
            quote: state.quote, closing: state.closing,
            nameA: state.nameA, nameB: state.nameB, tagline: state.tagline,
            month: state.month, year: state.year, day: state.day,
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
        state.playerTheme = PLAYER_THEMES[parsed.playerTheme]
            ? parsed.playerTheme : DEFAULT_PLAYER_THEME;
        state.heartColour = cleanColour(parsed.heartColour) || DEFAULT_HEART_COLOUR;
        state.codePos = CODE_POSITIONS[parsed.codePos]
            ? parsed.codePos : DEFAULT_CODE_POS;
        state.captionHead = cleanLine(parsed.captionHead);
        state.captionBody = cleanLine(parsed.captionBody);
        state.song = cleanLine(parsed.song);
        state.artist = cleanLine(parsed.artist);
        state.elapsed = cleanTime(parsed.elapsed);
        state.total = cleanTime(parsed.total);
        state.annivTheme = ANNIV_THEMES[parsed.annivTheme]
            ? parsed.annivTheme : DEFAULT_ANNIV_THEME;
        state.hbdTheme = HBD_THEMES[parsed.hbdTheme]
            ? parsed.hbdTheme : DEFAULT_HBD_THEME;
        state.tribTheme = TRIB_THEMES[parsed.tribTheme]
            ? parsed.tribTheme : DEFAULT_TRIB_THEME;
        state.heading = cleanHeading(parsed.heading);
        state.message = cleanBlock(parsed.message);
        state.title = cleanLine(parsed.title);
        state.quote = cleanBlock(parsed.quote);
        state.closing = cleanBlock(parsed.closing);
        state.nameA = cleanLine(parsed.nameA);
        state.nameB = cleanLine(parsed.nameB);
        state.tagline = cleanLine(parsed.tagline);
        state.month = annivClampMonth(parsed.month);
        state.year = annivClampYear(parsed.year);
        state.day = annivClampDay(parsed.day);
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
            playerTheme: state.playerTheme,
            heartColour: state.heartColour,
            codePos: state.codePos,
            captionHead: TB.sanitize(state.captionHead),
            captionBody: TB.sanitize(state.captionBody),
            song: TB.sanitize(state.song),
            artist: TB.sanitize(state.artist),
            elapsed: TB.sanitize(state.elapsed),
            total: TB.sanitize(state.total),
            annivTheme: state.annivTheme,
            hbdTheme: state.hbdTheme,
            tribTheme: state.tribTheme,
            heading: TB.sanitize(state.heading),
            message: TB.sanitize(state.message),
            title: TB.sanitize(state.title),
            quote: TB.sanitize(state.quote),
            closing: TB.sanitize(state.closing),
            nameA: TB.sanitize(state.nameA),
            nameB: TB.sanitize(state.nameB),
            tagline: TB.sanitize(state.tagline),
            month: state.month,
            year: state.year,
            day: state.day,
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
        state.playerTheme = PLAYER_THEMES[saved.playerTheme]
            ? saved.playerTheme : DEFAULT_PLAYER_THEME;
        state.heartColour = cleanColour(saved.heartColour) || DEFAULT_HEART_COLOUR;
        state.codePos = CODE_POSITIONS[saved.codePos]
            ? saved.codePos : DEFAULT_CODE_POS;
        state.captionHead = saved.captionHead === undefined
            ? "" : cleanLine(TB.desanitize(String(saved.captionHead)));
        state.captionBody = saved.captionBody === undefined
            ? "" : cleanLine(TB.desanitize(String(saved.captionBody)));
        /* Same rule as the ranks and the search query: only `undefined` takes
           the default, because an empty string is a line the visitor cleared. */
        state.song = saved.song === undefined
            ? DEFAULT_SONG : cleanLine(TB.desanitize(String(saved.song)));
        state.artist = saved.artist === undefined
            ? DEFAULT_ARTIST : cleanLine(TB.desanitize(String(saved.artist)));
        state.elapsed = saved.elapsed === undefined
            ? DEFAULT_ELAPSED : cleanTime(TB.desanitize(String(saved.elapsed)));
        state.total = saved.total === undefined
            ? DEFAULT_TOTAL : cleanTime(TB.desanitize(String(saved.total)));
        /* Read back as untrusted input, like every other stored key: an
           edited record can only ever resolve to a colourway this editor
           ships. */
        state.annivTheme = ANNIV_THEMES[saved.annivTheme]
            ? saved.annivTheme : DEFAULT_ANNIV_THEME;
        state.hbdTheme = HBD_THEMES[saved.hbdTheme]
            ? saved.hbdTheme : DEFAULT_HBD_THEME;
        state.tribTheme = TRIB_THEMES[saved.tribTheme]
            ? saved.tribTheme : DEFAULT_TRIB_THEME;
        state.heading = saved.heading === undefined
            ? DEFAULT_TRIB_HEADING : cleanHeading(TB.desanitize(String(saved.heading)));
        state.message = saved.message === undefined
            ? DEFAULT_TRIB_MESSAGE : cleanBlock(TB.desanitize(String(saved.message)));
        state.title = saved.title === undefined
            ? DEFAULT_TRIB_TITLE : cleanLine(TB.desanitize(String(saved.title)));
        state.quote = saved.quote === undefined
            ? DEFAULT_HBD_QUOTE : cleanBlock(TB.desanitize(String(saved.quote)));
        state.closing = saved.closing === undefined
            ? DEFAULT_HBD_CLOSING : cleanBlock(TB.desanitize(String(saved.closing)));
        state.nameA = saved.nameA === undefined
            ? DEFAULT_NAME_A : cleanLine(TB.desanitize(String(saved.nameA)));
        state.nameB = saved.nameB === undefined
            ? DEFAULT_NAME_B : cleanLine(TB.desanitize(String(saved.nameB)));
        state.tagline = saved.tagline === undefined
            ? DEFAULT_TAGLINE : cleanLine(TB.desanitize(String(saved.tagline)));
        /* A stored date is untrusted input like everything else here. Clamped
           rather than rejected: an edited record should give a poster with a
           real month on it, not a blank one. */
        state.month = saved.month === undefined
            ? new Date().getMonth() : annivClampMonth(saved.month);
        state.year = saved.year === undefined
            ? new Date().getFullYear() : annivClampYear(saved.year);
        state.day = saved.day === undefined
            ? new Date().getDate() : annivClampDay(saved.day);
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
    function drawArt(c, art, x, y, w, h, theme) {
        const v = art.view;
        const ink = (theme || screenTheme())[art.ink];
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
                /* evenodd where the source says so: the player's repeat glyph
                   fills as a solid blob under the nonzero default. */
                if (p.rule) { c.fill(p.path, p.rule); } else { c.fill(p.path); }
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

    /* ------------------------------------------------------------------
       The music-player layout
       ------------------------------------------------------------------ */

    function playerScale(W, H) {
        return { fx: W / PLAYER.page.w, fy: H / PLAYER.page.h };
    }

    /* The album box, which is where the photograph goes and the one rectangle
       on this layout the pointer can reach. */
    function albumRect(W, H) {
        const s = playerScale(W, H);
        const a = PLAYER.album;
        return { x: a.x * s.fx, y: a.y * s.fy, w: a.w * s.fx, h: a.h * s.fy,
            r: a.r * s.fx };
    }

    /* The whole vertical arrangement, in PAGE points, worked out once.

       Moving the scan code above the song title is a SWAP, not a resize:
       everything from the title down slides by one distance and keeps every
       gap the artwork set. The numbers fall out exactly -- put the code under
       the album with the same 15.67 gap it has above it at the foot, leave the
       artwork's own 57.28 between the code and the title, and the controls
       come to rest at 834.42, which is precisely where the code's bottom used
       to be. The page margin stays 7.47. Nothing changes size.

       A caption is the one thing that does cost something, because this page
       has no slack at all. See PLAYER.codeCompact. */
    function playerFlow() {
        const P = PLAYER;
        const top = codePos() === "top";
        const caption = hasCaption();
        /* Compact ONLY when a caption is present. Moving the code must not
           resize it: with nothing else competing for the page the full box
           fits in either position, and the swap is exact -- the controls come
           to rest at 834.42, where the code's own bottom used to be. */
        const box = caption ? P.codeCompact : P.code;
        const albumBottom = P.album.y + P.album.h;

        let codeY = P.code.y;
        let shift = 0;
        if (top) {
            codeY = albumBottom + P.codeGap;
            shift = (codeY + box.h + P.albumToTitle) - P.title.baseline;
        }

        const controlsBottom = P.play.cy + P.play.r + shift;
        const headBaseline = controlsBottom + P.caption.drop;
        const bodyBaseline = headBaseline + P.caption.leading;
        if (!top && caption) {
            /* The code follows the caption down rather than the caption
               squeezing in above it: text under the buttons is what was
               asked for, and the code is what gives way. */
            codeY = bodyBaseline + P.caption.tail;
        }

        return {
            shift: shift,
            controlsBottom: controlsBottom,
            headBaseline: headBaseline,
            bodyBaseline: bodyBaseline,
            code: { x: box.x === undefined ? P.code.x : box.x, y: codeY,
                w: box.w, h: box.h }
        };
    }

    /* The scannable code's box. Kept beside albumRect() so the two slots this
       layout owns are derived the same way. */
    function codeRect(W, H) {
        const s = playerScale(W, H);
        /* Straight off the flow. Every caller reads this -- slotAt(),
           rectForSlot() and the preview's prompt included -- so the code's box
           only has to move HERE for the click target, the selection ring and
           the framing slider to move with it. */
        const c = playerFlow().code;
        return { x: c.x * s.fx, y: c.y * s.fy, w: c.w * s.fx, h: c.h * s.fy };
    }

    /* One line of the player's type, set down when it would reach the heart.

       The artwork's face is Helvetica World Bold and Inter is not metrically
       identical to it, so a title that fits there can overrun here -- and what
       it overruns into is the green heart, which is the one thing on this row
       that cannot move. Same treatment as the rank letters and the search
       query: measured and scaled to fit rather than clipped. */
    function fitLine(c, text, px, maxPx, weight) {
        c.font = weight + " " + px + "px " + fontStack(SCREEN_FONT);
        if (!text) {
            return px;
        }
        const measured = c.measureText(text).width;
        return measured > maxPx ? px * (maxPx / measured) : px;
    }

    /* The player: a phone's now-playing screen on A4, with one photograph in
       the album box and one uploaded scan code along the foot.

       An empty album is the ARTWORK'S own empty state -- a white panel on the
       dark theme, an outlined one on the light -- rather than a prompt, because
       that is a finished-looking design in the source and printing "upload a
       photo" over it would be the editor putting its furniture on a wall. An
       empty code box draws nothing at all, for the same reason the search
       screen's empty cards do: a poster with no scan code is a perfectly
       ordinary thing to want, and a placeholder there would be a caption
       nobody asked for. Both carry preview-only prompts instead; see
       drawPlayerChrome(). */
    function paintPlayer(c, W, H, options) {
        const s = playerScale(W, H);
        const P = PLAYER;
        const ink = playerTheme();
        const flow = playerFlow();
        /* Everything from the song title down rides this one offset, so the
           row of glyphs, the disc, the heart, the bar and the type cannot
           drift apart from each other when the code changes places. */
        const dy = flow.shift * s.fy;

        if (!options.transparent) {
            c.fillStyle = ink.page;
            c.fillRect(0, 0, W, H);
        }

        /* The album photograph, clipped to the artwork's rounded corners. */
        const album = albumRect(W, H);
        roundRectPath(c, album.x, album.y, album.w, album.h, album.r);
        if (photos[0]) {
            c.save();
            c.clip();
            drawCoverImage(c, photos[0], album.x, album.y, album.w, album.h, state.views[0]);
            c.restore();
        } else if (!options.transparent) {
            if (ink.albumFill) {
                c.fillStyle = ink.albumFill;
                c.fill();
            }
            if (ink.albumStroke) {
                c.strokeStyle = ink.albumStroke;
                c.lineWidth = P.album.stroke * s.fx;
                c.stroke();
            }
        }

        /* The chrome. drawArt() places page-space paths by the page scale, so
           the transform is a translate and a scale -- and the translate is
           what carries the shift. The chevron and the dots sit at the top of
           the screen and never move; everything else does. */
        drawArt(c, PLAYER_ART.chevron, 0, 0, W, H, ink);
        drawArt(c, PLAYER_ART.transport, 0, dy, W, H, ink);

        c.fillStyle = ink.ink;
        P.dots.y.forEach((cy) => {
            c.beginPath();
            c.arc(P.dots.cx * s.fx, cy * s.fy, P.dots.r * s.fx, 0, Math.PI * 2);
            c.fill();
        });

        c.beginPath();
        c.arc(P.play.cx * s.fx, P.play.cy * s.fy + dy, P.play.r * s.fx, 0, Math.PI * 2);
        c.fill();
        drawArt(c, PLAYER_ART.playIcon, 0, dy, W, H, ink);

        drawArt(c, PLAYER_ART.heart, 0, dy, W, H, ink);

        /* Title and artist. The right limit is the heart's left edge less a
           little air, so neither line can run into it. */
        c.textAlign = "left";
        c.textBaseline = "alphabetic";
        c.fillStyle = ink.ink;
        if (state.song) {
            const size = fitLine(c, state.song, P.title.size * s.fx,
                (P.title.right - P.title.x) * s.fx, "700");
            c.font = "700 " + size + "px " + fontStack(SCREEN_FONT);
            c.fillText(state.song, P.title.x * s.fx, P.title.baseline * s.fy + dy);
            noteText(c, "song", { x: P.title.x * s.fx, y: P.title.baseline * s.fy + dy - size,
                w: (P.title.right - P.title.x) * s.fx, h: size * 1.3,
                size: size, font: c.font, align: "left" });
        }
        if (state.artist) {
            const size = fitLine(c, state.artist, P.artist.size * s.fx,
                (P.artist.right - P.artist.x) * s.fx, "400");
            c.font = "400 " + size + "px " + fontStack(SCREEN_FONT);
            c.fillText(state.artist, P.artist.x * s.fx, P.artist.baseline * s.fy + dy);
            noteText(c, "artist", { x: P.artist.x * s.fx,
                y: P.artist.baseline * s.fy + dy - size,
                w: (P.artist.right - P.artist.x) * s.fx, h: size * 1.3,
                size: size, font: c.font, align: "left" });
        }

        /* The progress bar: the whole track dimmed, the played part solid over
           it, then the knob. Drawn in that order because the two share an end
           and a round cap on the dim one would otherwise sit on top. */
        const x1 = P.track.x1 * s.fx;
        const x2 = P.track.x2 * s.fx;
        const ty = P.track.y * s.fy + dy;
        const played = x1 + (x2 - x1) * playedFraction();
        c.save();
        c.lineCap = "round";
        c.lineWidth = P.track.width * s.fx;
        c.globalAlpha = P.track.dim;
        c.strokeStyle = ink.ink;
        c.beginPath();
        c.moveTo(x1, ty);
        c.lineTo(x2, ty);
        c.stroke();
        c.globalAlpha = 1;
        c.beginPath();
        c.moveTo(x1, ty);
        c.lineTo(played, ty);
        c.stroke();
        c.restore();

        c.fillStyle = ink.ink;
        c.beginPath();
        c.arc(played, ty, P.knob.r * s.fx, 0, Math.PI * 2);
        c.fill();

        /* Both times on ONE baseline -- see the note on PLAYER -- and both
           horizontally condensed to 0.87 the way the artwork sets them. */
        const drawTime = (key, text, xPt, align) => {
            if (!text) { return; }
            const size = P.time.size * s.fx;
            c.save();
            c.translate(xPt * s.fx, P.time.baseline * s.fy + dy);
            c.scale(P.time.squeeze, 1);
            c.font = "400 " + size + "px " + fontStack(SCREEN_FONT);
            c.textAlign = align;
            c.fillText(text, 0, 0);
            const runW = c.measureText(text).width;
            c.restore();
            noteText(c, key, { x: xPt * s.fx,
                y: P.time.baseline * s.fy + dy - size,
                w: Math.max(runW, size * 2) * P.time.squeeze, h: size * 1.3,
                size: size, font: c.font, align: "left",
                squeeze: P.time.squeeze });
        };
        drawTime("elapsed", state.elapsed, P.time.leftX, "left");
        drawTime("total", state.total, P.time.rightX, "left");

        /* The caption, under the transport row. Two independent lines: a
           heading and one line beneath it, either of which may be empty. Both
           are set down to fit rather than clipped, the same call the title and
           artist make. */
        const cap = P.caption;
        const capWidth = (cap.right - cap.x) * s.fx;
        if (state.captionHead) {
            const size = fitLine(c, state.captionHead, cap.headSize * s.fx,
                capWidth, "700");
            c.font = "700 " + size + "px " + fontStack(SCREEN_FONT);
            c.fillText(state.captionHead, cap.x * s.fx, flow.headBaseline * s.fy);
            noteText(c, "captionHead", { x: cap.x * s.fx,
                y: flow.headBaseline * s.fy - size, w: capWidth, h: size * 1.3,
                size: size, font: c.font, align: "left" });
        }
        if (state.captionBody) {
            const size = fitLine(c, state.captionBody, cap.bodySize * s.fx,
                capWidth, "400");
            c.font = "400 " + size + "px " + fontStack(SCREEN_FONT);
            c.fillText(state.captionBody, cap.x * s.fx, flow.bodyBaseline * s.fy);
            noteText(c, "captionBody", { x: cap.x * s.fx,
                y: flow.bodyBaseline * s.fy - size, w: capWidth, h: size * 1.3,
                size: size, font: c.font, align: "left" });
        }

        const code = codeRect(W, H);
        if (photos[CODE_SLOT]) {
            c.save();
            c.beginPath();
            c.rect(code.x, code.y, code.w, code.h);
            c.clip();
            drawCoverImage(c, photos[CODE_SLOT], code.x, code.y, code.w, code.h,
                state.views[CODE_SLOT]);
            c.restore();
        }
    }

    /* transparent=true skips the frame, matte and placeholder fills so a PNG
       exports with a genuinely empty background rather than a white one -- the
       toggle in the download panel does this and nothing else. */
    /* ----------------------------------------------------------------------
       The anniversary poster's painter.

       One SERIF throughout, because the artwork's two faces -- Monotype
       Corsiva for the names and Times New Roman for the calendar -- are both
       Monotype's, both carry an explicit licence-agreement clause, and `site/`
       is the publish directory. The same call the card layout made about
       Algerian and the music player made about Helvetica World, and the
       OPPOSITE of the trade counter receipt's Roboto, which turned out to be
       OFL. Check the font you are handed, every time.

       Playfair Display italic is what stands in for the script. It is a
       different letter, and it is the one real loss in this template.
       ---------------------------------------------------------------------- */

    function annivFont(size, italic, weight) {
        return (italic ? "italic " : "") + (weight || 700) + " " + size +
            'px "Playfair Display", Georgia, serif';
    }

    /* A line set down to fit a width, never clipped. Same argument as the rank
       letters and the search query: a name that vanishes halfway through with
       nothing on screen to say why is worse than a smaller name. */
    function annivFit(c, text, px, maxPx, italic, weight) {
        let size = px;
        c.font = annivFont(size, italic, weight);
        let w = c.measureText(text).width;
        if (w > maxPx && w > 0) {
            size = Math.max(6, size * (maxPx / w));
            c.font = annivFont(size, italic, weight);
        }
        return size;
    }

    /* The calendar is set in TIMES, and the display text is not.

       All three artworks in this family say so in their own stylesheets, and
       they agree: `MonotypeCorsiva` for the month name, the message and the
       line along the foot, `TimesNewRomanPSMT` for the day letters and every
       date. Two faces with two jobs -- a script for the words somebody chose,
       a quiet book face for the grid.

       We had been drawing the whole poster in Playfair Display: italic at 700
       for the display text, upright at 600 for the dates. Upright was right;
       Playfair at 600 was not. It is a Didone with heavy stems and abrupt
       hairlines, so a grid of thirty-one dates came out as a wall of black
       where the artwork has a light, even texture.

       Times needs no webfont -- it is on every desktop that matters and the
       fallbacks behind it are the same shape -- so this costs nothing to load
       and is what the source actually specifies. Playfair Display italic still
       stands in for Corsiva on the display text, which we cannot bundle.
       See the note above annivFont(). */
    const CAL_FACE = "Times New Roman, Times, Liberation Serif, serif";

    function calFont(size) {
        return "400 " + size + 'px "Times New Roman", Times, "Liberation Serif", serif';
    }

    /* The day letters are centred on their COLUMNS, not tracked as one string.

       The artwork tracks them 0.4em, and copying that put the seven letters
       across 147pt of a 300pt grid -- measured -- because its own grid was
       narrower than this one. Tracking is how you space a line of type; this is
       a HEADER ROW over seven columns, and the thing that makes it read as one
       is each letter sitting over the dates it labels. */
    function annivHead(c, letters, g, baseline, size) {
        c.font = calFont(size);
        c.textAlign = "center";
        letters.forEach((ch, i) => {
            c.fillText(ch, g.centre(i), baseline);
        });
    }

    /* ----------------------------------------------------------------------
       The birthday poster's painter.
       ---------------------------------------------------------------------- */

    /* The four-pointed sparkle, which is the ARTWORK'S OWN PATH now rather
       than an approximation of it.

       Both artworks draw thirty-six of these between them, at nine sizes, and
       every one is this identical shape -- width over height between 0.618 and
       0.625 -- so it is stored once at the size it happens to be drawn largest
       and mapped onto whatever box a cluster asks for.

       What it replaces was two crossed quadratics with their control points at
       13 per cent of each half-axis. That is a plausible four-pointed star and
       it is not this one. The source builds each spike as a CUBIC whose first
       control sits on the tip itself and whose second sits barely off the
       centre line, which is what draws out the long needle taper; a quadratic
       cannot bend that way, so ours came out blunt and heavy at a third of the
       apparent length. Reading the path was the only thing that would have
       shown it -- the proportion was already right, and a fat star at the
       correct proportion still looks like a star.

       Note the arms do NOT cross at the middle of the box: the left and right
       tips sit at y 535.05 where the box's own centre is 531.64, three and a
       half points lower. That asymmetry is the artwork's and is kept, which is
       why `cross` is carried separately rather than assumed to be 0.5. */
    const HBD_SPARK = {
        view: [208.09, 509.46, 27.59, 44.35],
        cross: 0.5766,
        d: "M221.89,509.46s1.67,25.64-13.8,25.59c0,0,14.07-1.2,14.12,18.76,0,0" +
           "-.15-16.89,13.47-18.76C235.68,535.05,222.38,531.7,221.89,509.46Z"
    };
    HBD_SPARK.path = new Path2D(HBD_SPARK.d);

    /* The glow. The source spends 40KB of embedded PNG masks on it -- 74 of
       them across the two files, 44 per cent of one file's weight -- and all
       they do is lift the spikes towards white and leave a faint haze just
       beyond the tips. Measured off the reference: the core reads #FEF6AD, the
       spikes #FFFDE6, and one point past a tip the page has lifted from
       #231F20 to #2D2928.

       That is a radial gradient, which costs nothing, needs no raster, and
       travels through both painters: the theme's `sparkle` at the core, its
       `sparkleTip` from 45 per cent out to the ends.

       A soft HALO was tried here too and was wrong, which is worth recording
       because it is the obvious reading of the word "glow". Four points to the
       side of a spike the reference is pure page -- #231F20, not a lifted
       #2D2925 -- so the masks are brightening the spikes and spilling nothing
       around them. What looks like a haze in the artwork is the needle taper
       plus its own antialiasing. Measure before adding light. */

    /* Boxes in an artwork's own points, scaled onto the drawn page. Two
       collage layouts use this; neither holds its own copy of four
       multiplications. */
    function scaleBoxes(boxes, page, W, H) {
        const fx = W / page.w;
        const fy = H / page.h;
        return boxes.map((r) => ({
            x: r.x * fx, y: r.y * fy, w: r.w * fx, h: r.h * fy
        }));
    }

    /* A calendar's metrics, from the rule under its day header -- which is what
       the columns are actually measured against, every one of these artworks
       having hand-set its own thirty-odd date positions to no pitch at all.

       Takes the layout's geometry rather than reading one layout's constants,
       because there are three calendars drawn in this file now and they differ
       only in where they sit. */
    function calGrid(geo, W, H) {
        const fx = W / geo.page.w;
        const fy = H / geo.page.h;
        const x1 = geo.rule.x1 * fx;
        const span = (geo.rule.x2 - geo.rule.x1) * fx;
        return {
            fx: fx, fy: fy, x1: x1, span: span,
            centre: (i) => x1 + (span / 7) * (i + 0.5),
            baseline: (r) => (geo.grid.top + geo.grid.pitch * r) * fy
        };
    }

    function hbdRects(W, H) {
        return scaleBoxes(HBD_BOXES, HBD.page, W, H);
    }

    function hbdGrid(W, H) {
        return calGrid(HBD, W, H);
    }

    /* The display face for these two posters: a stand-in for Monotype
       Corsiva, which both artworks set every word in and neither may ship.

       Playfair Display italic was the stand-in before, on the grounds that it
       was already loaded and was the closest thing on hand. It is not close.
       Corsiva is a CHANCERY -- rounded bowls, a shallow slope, semi-connected,
       one weight -- and Playfair is a Didone: vertical stress, hairline
       serifs, a much wider italic. Set side by side at the same size the two
       do not read as the same kind of lettering, and on a poster whose words
       are the whole design that is the largest thing separating ours from the
       reference.

       Petit Formal Script was picked by rendering five candidates against
       Corsiva at the sizes these posters actually use -- the month name, the
       foot line and a paragraph of the message -- and it is the nearest of
       them by a distance. EB Garamond and the two Cormorants are book italics
       and read as such.

       It has ONE weight and it is already slanted, so nothing here asks for
       bold or italic: both would be synthesised, and a browser's synthetic
       oblique on an already-sloped script is a smear. That is why the
       signature lost its `italic` and `weight` arguments rather than keeping
       them and passing false.

       The fallback chain keeps Playfair Display in second place, so a blocked
       webfont degrades to what this used to be rather than to Georgia. */
    const SCRIPT_FACE = '"Petit Formal Script", "Playfair Display", Georgia, serif';
    const SCRIPT_SVG_FACE = "Petit Formal Script, Playfair Display, Georgia, serif";

    /* Petit Formal Script draws BIGGER than Monotype Corsiva at the same
       nominal size: 79 units of cap height per 100 of em against Corsiva's 65,
       measured. Every size in these two artworks is written in Corsiva's em,
       so each one is multiplied by this before it reaches the substitute --
       otherwise the whole poster sets a fifth too large and the message
       overruns the lines it is allowed.

       Cap height and not width, deliberately. Matching widths instead would
       need 0.66 and would leave the lettering visibly too small; cap height is
       what the eye reads as "the same size". The substitute is still about a
       fifth wider set at matched cap height, and the wrap and shrink-to-fit
       rules are what absorb that. This is the same idea as CSS `size-adjust`
       and exists for the same reason: a fallback face is never the metrics of
       the one it stands in for. */
    const SCRIPT_SIZE_ADJUST = 65 / 79;

    /* Sizes are carried in the ARTWORK'S units everywhere except the two
       places that have to emit a real px number -- here and in the SVG -- so
       the adjustment is applied once, in both, and nowhere else. */
    function hbdPx(size) {
        return size * SCRIPT_SIZE_ADJUST;
    }

    function hbdFont(size) {
        return "400 " + hbdPx(size) + "px " + SCRIPT_FACE;
    }

    /* annivFit(), in the display face. Same shrink-to-fit rule; the only
       reason it is a second function is that the font builders differ. */
    function hbdFit(c, text, px, maxPx) {
        let size = px;
        c.font = hbdFont(size);
        const w = c.measureText(text).width;
        if (w > maxPx && w > 0) {
            size = Math.max(6, size * (maxPx / w));
            c.font = hbdFont(size);
        }
        return size;
    }

    /* Wraps a visitor's block to a width, in the face it will be drawn in.
       The artwork's quote is six hand-broken lines whose last one is centred by
       nineteen literal spaces and xml:space="preserve" -- an indent that was
       only ever right in Monotype Corsiva at 30.63px. None of that survives
       contact with a field somebody types into, so the block wraps here and the
       spaces are not reproduced. */
    function hbdWrap(c, text, maxPx) {
        const out = [];
        String(text || "").split("\n").forEach((para) => {
            const words = para.split(/\s+/).filter(Boolean);
            if (!words.length) { out.push(""); return; }
            let line = words[0];
            for (let i = 1; i < words.length; i += 1) {
                const next = line + " " + words[i];
                if (c.measureText(next).width > maxPx) {
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

    /* Where a star of half-width `r` centred on (cx, cy) lands, in drawn
       pixels, and where its arms cross inside that box. Shared so the canvas
       and the SVG cannot disagree about it. */
    function sparkBox(cx, cy, r, fx, fy) {
        const v = HBD_SPARK.view;
        const w = 2 * r * fx;
        const h = 2 * r * (v[3] / v[2]) * fy;
        return { x: cx * fx - w / 2, y: cy * fy - h / 2, w: w, h: h,
            crossX: v[0] + v[2] / 2, crossY: v[1] + v[3] * HBD_SPARK.cross };
    }

    /* A gradient stop with its own opacity. Canvas takes one CSS colour per
       stop and no separate alpha, where SVG carries stop-opacity beside the
       colour -- and this artwork's gloss is built almost entirely out of stops
       that fade a colour to NOTHING rather than to another colour. */
    function stopColour(hex, alpha) {
        if (alpha >= 1) { return hex; }
        const n = parseInt(hex.slice(1), 16);
        return "rgba(" + ((n >> 16) & 255) + ", " + ((n >> 8) & 255) + ", " +
            (n & 255) + ", " + alpha + ")";
    }

    /* The glossy heart onto a box, on canvas. */
    function tribDrawHeart(c, x, y, w, h) {
        const v = TRIB_HEART.view;
        c.save();
        c.translate(x, y);
        c.scale(w / v[2], h / v[3]);
        c.translate(-v[0], -v[1]);
        TRIB_HEART.parts.forEach((p) => {
            if (!p.path) { p.path = new Path2D(p.d); }
            if (p.fill) {
                c.fillStyle = p.fill;
            } else {
                const gr = c.createLinearGradient(p.grad[0], p.grad[1],
                    p.grad[2], p.grad[3]);
                p.stops.forEach((st) => {
                    gr.addColorStop(st[0], stopColour(st[1], st[2]));
                });
                c.fillStyle = gr;
            }
            /* Both of these are load-bearing and both were missed on the
               first pass: the belly wash carries opacity 0.4 and came out
               twice as bright without it, and every overlay is evenodd --
               these are hollow slivers, and nonzero fills their middles. */
            c.globalAlpha = p.alpha === undefined ? 1 : p.alpha;
            c.fill(p.path, p.rule || "nonzero");
            c.globalAlpha = 1;
        });
        c.restore();
    }

    /* The same heart as SVG. `tag` keeps the gradient ids unique: five of
       these go into one document and an id collision silently paints four of
       them with the fifth one's light. */
    function tribHeartSVG(x, y, w, h, tag) {
        const v = TRIB_HEART.view;
        let defs = "";
        let body = "";
        TRIB_HEART.parts.forEach((p, i) => {
            const opt = (p.rule ? ' fill-rule="' + p.rule + '"' : "") +
                (p.alpha === undefined ? "" : ' opacity="' + p.alpha + '"');
            if (p.fill) {
                body += '<path d="' + p.d + '" fill="' + p.fill + '"' + opt + "/>";
                return;
            }
            const id = "tb-th-" + tag + "-" + i;
            defs += '<linearGradient id="' + id + '" gradientUnits="userSpaceOnUse"' +
                ' x1="' + p.grad[0] + '" y1="' + p.grad[1] +
                '" x2="' + p.grad[2] + '" y2="' + p.grad[3] + '">' +
                p.stops.map((st) => '<stop offset="' + st[0] + '" stop-color="' +
                    st[1] + '" stop-opacity="' + st[2] + '"/>').join("") +
                "</linearGradient>";
            body += '<path d="' + p.d + '" fill="url(#' + id + ')"' + opt + "/>";
        });
        return '<g transform="translate(' + x + " " + y + ') scale(' +
            (w / v[2]) + " " + (h / v[3]) + ') translate(' + (-v[0]) + " " +
            (-v[1]) + ')"><defs>' + defs + "</defs>" + body + "</g>";
    }

    /* Where a hanging heart sits. The string ends a quarter of the way DOWN
       the heart, in its cleft, which is where a hanging thing is actually
       tied -- measured at 0.27 on all four, and the reason the heart cannot
       simply be hung from its own top edge. */
    const TRIB_HEART_CLEFT = 0.249;

    function tribHeartBox(st, fx, fy) {
        const v = TRIB_HEART.view;
        const w = st.w * fx;
        const h = st.w * (v[3] / v[2]) * fy;
        return { x: st.x * fx - w / 2, y: st.to * fy - h * TRIB_HEART_CLEFT,
            w: w, h: h };
    }

    /* One sparkle cluster: a large star and its satellites, each lit from its
       own centre and sitting in its own haze. */
    function hbdDrawSparkle(c, spark, fx, fy, ink) {
        const v = HBD_SPARK.view;
        const put = (cx, cy, r) => {
            const b = sparkBox(cx, cy, r, fx, fy);
            c.save();
            c.translate(b.x, b.y);
            c.scale(b.w / v[2], b.h / v[3]);
            c.translate(-v[0], -v[1]);

            const lit = c.createRadialGradient(b.crossX, b.crossY, 0,
                b.crossX, b.crossY, v[3] / 2);
            lit.addColorStop(0, ink.sparkle);
            lit.addColorStop(0.45, ink.sparkleTip || ink.sparkle);
            lit.addColorStop(1, ink.sparkleTip || ink.sparkle);
            c.fillStyle = lit;
            c.fill(HBD_SPARK.path);
            c.restore();
        };
        put(spark.x, spark.y, spark.r);
        spark.sats.forEach((sat) => {
            put(spark.x + sat[0], spark.y + sat[1], sat[2]);
        });
    }

    /* The same cluster as SVG. One emitter, used by both posters, because two
       copies of this is exactly how the two painters drift. `tag` keeps the
       gradient ids unique within one document. */
    function sparkleSVG(sparkles, fx, fy, ink, tag) {
        const v = HBD_SPARK.view;
        let out = "";
        let n = 0;
        sparkles.forEach((sp) => {
            const put = (cx, cy, r) => {
                const b = sparkBox(cx, cy, r, fx, fy);
                const id = "tb-sp-" + tag + "-" + (n += 1);
                const open = '<g transform="translate(' + b.x + " " + b.y +
                    ') scale(' + (b.w / v[2]) + " " + (b.h / v[3]) +
                    ') translate(' + (-v[0]) + " " + (-v[1]) + ')">';
                const g = "<defs>" + '<radialGradient id="' + id + '" gradientUnits="userSpaceOnUse" cx="' +
                    b.crossX + '" cy="' + b.crossY + '" r="' + (v[3] / 2) + '">' +
                    '<stop offset="0" stop-color="' + ink.sparkle + '"/>' +
                    '<stop offset="0.45" stop-color="' + (ink.sparkleTip || ink.sparkle) + '"/>' +
                    '<stop offset="1" stop-color="' + (ink.sparkleTip || ink.sparkle) +
                    '"/></radialGradient></defs>';
                let body = '<path d="' + HBD_SPARK.d + '" fill="url(#' + id + ')"/>';
                return open + g + body + "</g>";
            };
            out += put(sp.x, sp.y, sp.r);
            sp.sats.forEach((sat) => {
                out += put(sp.x + sat[0], sp.y + sat[1], sat[2]);
            });
        });
        return out;
    }

    function hbdDrawGarland(c, W, H, ink) {
        const fx = W / HBD.page.w;
        const fy = H / HBD.page.h;
        const g = HBD_GARLAND;
        c.save();
        c.strokeStyle = ink.ink;
        c.lineWidth = Math.max(0.8, g.string.width * fx);
        c.beginPath();
        c.moveTo(g.string.x1 * fx, g.string.y1 * fy);
        c.lineTo(g.string.x2 * fx, g.string.y2 * fy);
        c.stroke();
        /* The tick marks at each end, three short strokes fanned across the
           string the way the artwork draws them. */
        g.ticks.forEach((t) => {
            for (let k = -1; k <= 1; k += 1) {
                c.beginPath();
                c.moveTo((t.x - 4) * fx, (t.y + k * 3 - 3) * fy);
                c.lineTo((t.x + 4) * fx, (t.y + k * 3 + 3) * fy);
                c.stroke();
            }
        });
        c.restore();
        g.hearts.forEach((h) => {
            const w = h.w * fx;
            const hh = w / (ANNIV_HEART.view[2] / ANNIV_HEART.view[3]);
            drawArt(c, ANNIV_HEART, h.cx * fx - w / 2, h.cy * fy - hh / 2, w, hh,
                { accent: h.tint === "A" ? ink.garlandA : ink.garlandB });
        });
    }

    function paintTribute(c, W, H, options) {
        const fx = W / TRIB.page.w;
        const fy = H / TRIB.page.h;
        const ink = tribTheme();
        const heartRatio = ANNIV_HEART.view[2] / ANNIV_HEART.view[3];

        if (!options.transparent) {
            c.fillStyle = ink.page;
            c.fillRect(0, 0, W, H);
        }

        /* ---- sparkles, behind everything ---- */
        TRIB_SPARKLES.forEach((sp) => hbdDrawSparkle(c, sp, fx, fy, ink));

        /* ---- the hanging hearts ---- */
        c.save();
        c.strokeStyle = ink.string;
        c.lineWidth = Math.max(1, TRIB.stringWidth * fx);
        TRIB.strings.forEach((st) => {
            c.beginPath();
            c.moveTo(st.x * fx, st.from * fy);
            c.lineTo(st.x * fx, st.to * fy);
            c.stroke();
        });
        c.restore();
        TRIB.strings.forEach((st) => {
            const b = tribHeartBox(st, fx, fy);
            tribDrawHeart(c, b.x, b.y, b.w, b.h);
        });

        /* ---- the month ---- */
        c.textAlign = "left";
        c.textBaseline = "alphabetic";
        c.fillStyle = ink.ink;
        const info = annivMonth(state.year, state.month);
        const label = (ANNIV_MONTHS[info.month] || "").toUpperCase();
        hbdFit(c, label, TRIB.month.size * fy,
            (TRIB.rule.x2 - TRIB.month.x) * fx);
        c.fillText(label, TRIB.month.x * fx, TRIB.month.baseline * fy);

        /* ---- the calendar ---- */
        const g = tribGrid(W, H);
        annivHead(c, ANNIV_DAYS, g, TRIB.head.baseline * fy, TRIB.head.size * fy);

        c.strokeStyle = ink.ink;
        c.lineWidth = Math.max(1, TRIB.rule.width * fy);
        c.beginPath();
        c.moveTo(g.x1, TRIB.rule.y * fy);
        c.lineTo(g.x1 + g.span, TRIB.rule.y * fy);
        c.stroke();

        /* The heart goes down first and the number on it, as the sibling
           layout does. The ARTWORK covers its marked date with an opaque heart,
           so the one square the poster exists to point at is the only one that
           cannot be read; that is not copied. */
        const cell = annivCell(info, state.day);
        if (cell) {
            const hw = TRIB.dayHeart.w * fx;
            const hh = hw / heartRatio;
            drawArt(c, ANNIV_HEART, g.centre(cell.col) - hw / 2,
                g.baseline(cell.row) - hh * 0.62, hw, hh, ink);
        }
        c.textAlign = "center";
        c.font = calFont(TRIB.grid.size * fy);
        for (let d = 1; d <= info.length; d += 1) {
            const at = annivCell(info, d);
            c.fillStyle = (cell && cell.day === d) ? ink.onAccent : ink.ink;
            c.fillText(String(d), g.centre(at.col), g.baseline(at.row));
        }

        /* ---- the photographs ---- */
        /* Forwards, so a later box paints over an earlier one. Four pairs
           overlap and that stacking IS the design. */
        const rects = tribRects(W, H);
        rects.forEach((r, i) => {
            const slot = tribSlot(i);
            if (photos[slot]) {
                c.save();
                c.beginPath();
                c.rect(r.x, r.y, r.w, r.h);
                c.clip();
                drawCoverImage(c, photos[slot], r.x, r.y, r.w, r.h, state.views[slot]);
                c.restore();
            } else {
                c.fillStyle = TRIB_BOXES[i].tint ? ink.boxTint : ink.boxFill;
                c.fillRect(r.x, r.y, r.w, r.h);
            }
            c.strokeStyle = ink.boxStroke;
            c.lineWidth = Math.max(1, TRIB.boxStroke * fx);
            c.strokeRect(r.x, r.y, r.w, r.h);
        });

        /* ---- the heading, with its heart in the gap ---- */
        c.textAlign = "left";
        c.fillStyle = ink.ink;
        const parts = tribHeadingParts(state.heading);
        const hSize = TRIB.heading.size * fy;
        c.font = hbdFont(hSize);
        const hx = TRIB.heading.x * fx;
        const hy = TRIB.heading.baseline * fy;
        const beforeW = c.measureText(parts.before).width;
        const hw2 = TRIB.heading.heart * fx;
        const hh2 = hw2 / heartRatio;
        const gap = TRIB.heading.gap * fx;
        c.fillText(parts.before, hx, hy);
        drawArt(c, ANNIV_HEART, hx + beforeW + gap, hy - hh2 * 0.82, hw2, hh2, ink);
        let headRun = beforeW;
        if (parts.after) {
            c.fillStyle = ink.ink;
            c.fillText(parts.after, hx + beforeW + gap * 2 + hw2, hy);
            headRun = beforeW + gap * 2 + hw2 + c.measureText(parts.after).width;
        }
        noteText(c, "heading", { x: hx, y: hy - hSize,
            w: Math.max(headRun, hSize * 4), h: hSize * 1.3,
            size: hSize, font: c.font, align: "left" });

        /* ---- the message ---- */
        const mSize = TRIB.message.size * fy;
        c.font = hbdFont(mSize);
        const mW = tribMessageWidth(W);
        const mLines = hbdWrap(c, state.message, mW).slice(0, TRIB.message.maxLines);
        mLines.forEach((line, i) => {
            c.fillText(line, TRIB.message.x * fx,
                (TRIB.message.baseline + TRIB.message.leading * i) * fy);
        });
        noteText(c, "message", { x: TRIB.message.x * fx,
            y: TRIB.message.baseline * fy - mSize, w: mW,
            h: TRIB.message.leading * fy * Math.max(1, mLines.length),
            size: mSize, font: c.font, align: "left",
            multiline: true, leading: TRIB.message.leading * fy });

        /* ---- the foot title, with its heart ---- */
        const tSize = TRIB.title.size * fy;
        const tHeartW = TRIB.title.heart * fx;
        const tHeartH = TRIB.title.heart * (TRIB_HEART.view[3] / TRIB_HEART.view[2]) * fy;
        hbdFit(c, state.title, tSize, W - TRIB.title.x * fx * 2 - tHeartW);
        const tW = c.measureText(state.title).width;
        /* Centred as a UNIT -- the words and the heart together -- because the
           artwork's title is centred on the page and a heart pinned to the end
           of it would push the words off centre by half its width. */
        const tx = (W - (tW + TRIB.title.gap * fx + tHeartW)) / 2;
        const ty = TRIB.title.baseline * fy;
        c.fillStyle = ink.ink;
        c.fillText(state.title, tx, ty);
        tribDrawHeart(c, tx + tW + TRIB.title.gap * fx,
            ty - tHeartH * TRIB.title.lift, tHeartW, tHeartH);
        /* The words alone, not the unit: the heart is not editable and an
           editor covering it would put the caret past the end of the text. */
        noteText(c, "title", { x: tx, y: ty - tSize,
            w: Math.max(tW, tSize * 3), h: tSize * 1.3,
            size: tSize, font: c.font, align: "left" });
    }

    function paintBirthday(c, W, H, options) {
        const fx = W / HBD.page.w;
        const fy = H / HBD.page.h;
        const ink = hbdTheme();

        if (!options.transparent) {
            c.fillStyle = ink.page;
            c.fillRect(0, 0, W, H);
        }

        /* ---- the sparkles, behind everything ---- */
        HBD_SPARKLES.forEach((sp) => hbdDrawSparkle(c, sp, fx, fy, ink));

        /* ---- the garland ---- */
        hbdDrawGarland(c, W, H, ink);

        /* ---- the month ---- */
        c.textAlign = "left";
        c.textBaseline = "alphabetic";
        c.fillStyle = ink.ink;
        const info = annivMonth(state.year, state.month);
        const label = (ANNIV_MONTHS[info.month] || "").toUpperCase();
        /* Measured and set down rather than allowed to run: SEPTEMBER fits the
           artwork because the artwork was drawn around it, and FEBRUARY is
           longer. The ceiling is the garland's own left end. */
        hbdFit(c, label, HBD.month.size * fy,
            (HBD_GARLAND.string.x1 - HBD.month.x - 12) * fx);
        c.fillText(label, HBD.month.x * fx, HBD.month.baseline * fy);

        /* ---- the calendar ---- */
        const g = hbdGrid(W, H);
        /* annivHead(), not a tracked string: the anniversary poster already
           found that copying the artwork's 0.4em tracking spreads the seven
           letters across half the grid, because the source's own grid is
           narrower than the one they have to label here. */
        annivHead(c, ANNIV_DAYS, g, HBD.head.baseline * fy, HBD.head.size * fy);

        c.strokeStyle = ink.ink;
        c.lineWidth = Math.max(1, HBD.rule.width * fy);
        c.beginPath();
        c.moveTo(g.x1, HBD.rule.y * fy);
        c.lineTo(g.x1 + g.span, HBD.rule.y * fy);
        c.stroke();

        /* The marked day's heart goes down FIRST and the number is drawn on it.

           The ARTWORK does the opposite: its 15 is still in the file, at the
           same place as every other date, with an opaque heart drawn over it,
           so the marked date cannot be read at all. That is a deliberate
           departure. A calendar whose one important square is the only one you
           cannot read is a poster arguing with itself, and the anniversary
           poster already draws its number on the heart -- two layouts in one
           editor disagreeing about that would be worse than either choice. */
        const cell = annivCell(info, state.day);
        if (cell) {
            const hw = HBD.dayHeart.w * fx;
            const hh = hw / (ANNIV_HEART.view[2] / ANNIV_HEART.view[3]);
            drawArt(c, ANNIV_HEART, g.centre(cell.col) - hw / 2,
                g.baseline(cell.row) - hh * 0.62, hw, hh, ink);
        }

        c.textAlign = "center";
        c.font = calFont(HBD.grid.size * fy);
        for (let d = 1; d <= info.length; d += 1) {
            const at = annivCell(info, d);
            c.fillStyle = (cell && cell.day === d) ? ink.onAccent : ink.ink;
            c.fillText(String(d), g.centre(at.col), g.baseline(at.row));
        }

        /* ---- the photographs ---- */
        const rects = hbdRects(W, H);
        rects.forEach((r, i) => {
            const slot = hbdSlot(i);
            if (photos[slot]) {
                c.save();
                c.beginPath();
                c.rect(r.x, r.y, r.w, r.h);
                c.clip();
                drawCoverImage(c, photos[slot], r.x, r.y, r.w, r.h, state.views[slot]);
                c.restore();
            } else if (ink.boxFill) {
                c.fillStyle = ink.boxFill;
                c.fillRect(r.x, r.y, r.w, r.h);
            }
            /* The red keyline is on every box, filled or not: it is what holds
               the cascade together as a set of pictures rather than a scatter
               of rectangles, and the artwork draws it under the photograph. */
            c.strokeStyle = ink.boxStroke;
            c.lineWidth = Math.max(1, HBD.photoStroke * fx);
            c.strokeRect(r.x, r.y, r.w, r.h);
        });

        /* ---- the quote ---- */
        c.textAlign = "left";
        c.fillStyle = ink.ink;
        const quoteW = (HBD_BOXES[4].x - HBD.quote.x - 12) * fx;
        c.font = hbdFont(HBD.quote.size * fy);
        const qSize = HBD.quote.size * fy;
        const qlines = hbdWrap(c, state.quote, quoteW).slice(0, HBD.quote.maxLines);
        qlines.forEach((line, i) => {
            c.fillText(line, HBD.quote.x * fx,
                (HBD.quote.baseline + HBD.quote.leading * i) * fy);
        });
        /* A wrapped block: the box is the WRAP WIDTH and as many lines as the
           cap allows, not the longest line -- an editor sized to the ink would
           re-wrap differently the moment a word was added. */
        noteText(c, "quote", { x: HBD.quote.x * fx, y: HBD.quote.baseline * fy - qSize,
            w: quoteW, h: HBD.quote.leading * fy * Math.max(1, qlines.length),
            size: qSize, font: c.font, align: "left",
            multiline: true, leading: HBD.quote.leading * fy });

        /* ---- the closing message, with its heart on the last line ---- */
        const heartW = HBD.closingHeart.w * fx;
        const heartH = heartW / (ANNIV_HEART.view[2] / ANNIV_HEART.view[3]);
        const closeW = W - HBD.closing.x * fx * 2 - heartW - 6 * fx;
        c.font = hbdFont(HBD.closing.size * fy);
        const cSize = HBD.closing.size * fy;
        const clines = hbdWrap(c, state.closing, closeW).slice(0, 3);
        noteText(c, "closing", { x: HBD.closing.x * fx,
            y: HBD.closing.baseline * fy - cSize, w: closeW,
            h: HBD.closing.leading * fy * Math.max(1, clines.length),
            size: cSize, font: c.font, align: "left",
            multiline: true, leading: HBD.closing.leading * fy });
        clines.forEach((line, i) => {
            const y = (HBD.closing.baseline + HBD.closing.leading * i) * fy;
            c.fillText(line, HBD.closing.x * fx, y);
            if (i === clines.length - 1) {
                const w = c.measureText(line).width;
                drawArt(c, ANNIV_HEART, HBD.closing.x * fx + w + 6 * fx,
                    y - heartH * 0.78, heartW, heartH, ink);
            }
        });
    }

    function paintAnniversary(c, W, H, options) {
        const fx = W / ANNIV.page.w;
        const fy = H / ANNIV.page.h;
        const mid = W / 2;
        const ink = annivTheme();

        if (!options.transparent) {
            c.fillStyle = ink.page;
            c.fillRect(0, 0, W, H);
        }

        /* ---- the two names, with the heart between them ---- */
        const heartW = ANNIV.nameHeart.w * fx;
        const heartH = heartW / (ANNIV_HEART.view[2] / ANNIV_HEART.view[3]);
        const gap = ANNIV.names.gap * fx;
        const half = (W - heartW - gap * 2) / 2;

        c.textBaseline = "alphabetic";
        c.fillStyle = ink.ink;
        c.textAlign = "right";
        const sizeA = annivFit(c, state.nameA, ANNIV.names.size * fy,
            half - W * 0.06, true, 700);
        c.fillText(state.nameA, mid - heartW / 2 - gap, ANNIV.names.baseline * fy);
        noteText(c, "nameA", { x: mid - heartW / 2 - gap - (half - W * 0.06),
            y: ANNIV.names.baseline * fy - sizeA,
            w: half - W * 0.06, h: sizeA * 1.3,
            size: sizeA, font: c.font, align: "right" });

        c.textAlign = "left";
        const sizeB = annivFit(c, state.nameB, ANNIV.names.size * fy,
            half - W * 0.06, true, 700);
        c.fillText(state.nameB, mid + heartW / 2 + gap, ANNIV.names.baseline * fy);
        noteText(c, "nameB", { x: mid + heartW / 2 + gap,
            y: ANNIV.names.baseline * fy - sizeB,
            w: half - W * 0.06, h: sizeB * 1.3,
            size: sizeB, font: c.font, align: "left" });

        drawArt(c, ANNIV_HEART, mid - heartW / 2,
            ANNIV.nameHeart.cy * fy - heartH / 2, heartW, heartH, ink);

        /* ---- the collage ---- */
        /* An empty box is drawn as a WHITE panel, which is the artwork's own
           empty state: the heart reads as a heart before a single photograph
           is in it. Nothing here is a placeholder to be replaced -- it is the
           design, and a poster exported with empty boxes is a finished thing. */
        const rects = annivRects(W, H);
        rects.forEach((r, i) => {
            const slot = annivSlot(i);
            if (photos[slot]) {
                c.save();
                c.beginPath();
                c.rect(r.x, r.y, r.w, r.h);
                c.clip();
                drawCoverImage(c, photos[slot], r.x, r.y, r.w, r.h, state.views[slot]);
                c.restore();
            } else if (ink.boxFill) {
                c.fillStyle = ink.boxFill;
                c.fillRect(r.x, r.y, r.w, r.h);
            } else {
                /* Outlined rather than filled: on a light ground a white box
                   is not a box. Inset by half the stroke so the heart keeps
                   its measured size instead of growing by a line width. */
                const lw = Math.max(1, r.w * 0.012);
                c.strokeStyle = ink.boxStroke;
                c.lineWidth = lw;
                c.strokeRect(r.x + lw / 2, r.y + lw / 2, r.w - lw, r.h - lw);
            }
        });

        /* ---- the scan code ---- */
        const code = annivCodeRect(W, H);
        if (photos[CODE_SLOT]) {
            c.save();
            c.beginPath();
            c.rect(code.x, code.y, code.w, code.h);
            c.clip();
            drawCoverImage(c, photos[CODE_SLOT], code.x, code.y, code.w, code.h,
                state.views[CODE_SLOT]);
            c.restore();
        }

        /* ---- the calendar ---- */
        const info = annivMonth(state.year, state.month);
        const g = annivGrid(W, H);

        c.textAlign = "center";
        c.fillStyle = ink.ink;
        const label = (ANNIV_MONTHS[info.month] || "").toUpperCase() + " " + info.year;
        annivFit(c, label, ANNIV.month.size * fy, g.span, false, 600);
        c.fillText(label, mid, ANNIV.month.baseline * fy);

        annivHead(c, ANNIV_DAYS, g, ANNIV.head.baseline * fy, ANNIV.head.size * fy);

        c.strokeStyle = ink.ink;
        c.lineWidth = Math.max(1, ANNIV.rule.width * fy);
        c.beginPath();
        c.moveTo(g.x1, ANNIV.rule.y * fy);
        c.lineTo(g.x1 + g.span, ANNIV.rule.y * fy);
        c.stroke();

        /* The marked day's heart goes down FIRST, so the number sits on it.
           The artwork does the same and keeps the number white, which is the
           only reason it stays legible on that red. */
        const cell = annivCell(info, state.day);
        if (cell) {
            const hw = ANNIV.dayHeart.w * fx;
            const hh = hw / (ANNIV_HEART.view[2] / ANNIV_HEART.view[3]);
            drawArt(c, ANNIV_HEART, g.centre(cell.col) - hw / 2,
                g.baseline(cell.row) - hh * 0.62, hw, hh, ink);
        }

        c.font = calFont(ANNIV.grid.size * fy);
        for (let d = 1; d <= info.length; d += 1) {
            const at = annivCell(info, d);
            c.fillStyle = (cell && cell.day === d) ? ink.onAccent : ink.ink;
            c.fillText(String(d), g.centre(at.col), g.baseline(at.row));
        }

        /* ---- the tagline ---- */
        c.textAlign = "center";
        const tagSize = annivFit(c, state.tagline, ANNIV.tagline.size * fy,
            W * ANNIV.tagline.maxW, true, 700);
        c.fillText(state.tagline, mid, ANNIV.tagline.baseline * fy);
        noteText(c, "tagline", { x: mid - (W * ANNIV.tagline.maxW) / 2,
            y: ANNIV.tagline.baseline * fy - tagSize,
            w: W * ANNIV.tagline.maxW, h: tagSize * 1.3,
            size: tagSize, font: c.font, align: "center" });
    }

    /* The same poster as vector. A SECOND renderer, which is exactly where this
       editor has drifted before, so everything either painter needs is read
       from the shared helpers above -- annivRects, annivGrid, annivMonth and
       annivCell -- and neither holds a coordinate of its own. */
    /* The birthday poster as vector. A SECOND renderer, which is where this
       editor has drifted before, so everything either painter needs comes from
       the shared helpers -- hbdRects, hbdGrid, annivMonth, annivCell, hbdWrap
       -- and neither holds a coordinate of its own. */
    /* The tribute poster as vector. Second renderer, so everything it needs
       comes from the shared helpers -- tribRects, tribGrid, annivMonth,
       annivCell, hbdWrap, tribHeadingParts -- and it holds no coordinate of
       its own. */
    function tributeSVG(W, H, esc) {
        const fx = W / TRIB.page.w;
        const fy = H / TRIB.page.h;
        const ink = tribTheme();
        const face = SCRIPT_SVG_FACE;
        const ratio = ANNIV_HEART.view[2] / ANNIV_HEART.view[3];
        const measure = document.createElement("canvas").getContext("2d");
        let out = '<rect width="' + W + '" height="' + H + '" fill="' + ink.page + '"/>';

        const heartSVG = (x, y, w, h, colour) => {
            const v = ANNIV_HEART.view;
            return '<g transform="translate(' + x + " " + y + ') scale(' +
                (w / v[2]) + " " + (h / v[3]) + ') translate(' + (-v[0]) + " " +
                (-v[1]) + ')"><path d="' + ANNIV_HEART.parts[0].d + '" fill="' +
                colour + '"/></g>';
        };
        const textSVG = (x, y, size, fill, str, extra) =>
            '<text x="' + x + '" y="' + y + '" font-family="' + face +
            '" font-weight="400" font-size="' + hbdPx(size) +
            '" fill="' + fill + '"' + (extra || "") + '>' + esc(str) + "</text>";

        out += sparkleSVG(TRIB_SPARKLES, fx, fy, ink, "tb");

        TRIB.strings.forEach((st) => {
            out += '<line x1="' + (st.x * fx) + '" y1="' + (st.from * fy) +
                '" x2="' + (st.x * fx) + '" y2="' + (st.to * fy) + '" stroke="' +
                ink.string + '" stroke-width="' + Math.max(1, TRIB.stringWidth * fx) + '"/>';
        });
        TRIB.strings.forEach((st, i) => {
            const b = tribHeartBox(st, fx, fy);
            out += tribHeartSVG(b.x, b.y, b.w, b.h, "h" + i);
        });

        const info = annivMonth(state.year, state.month);
        const label = (ANNIV_MONTHS[info.month] || "").toUpperCase();
        const mSize = hbdFit(measure, label, TRIB.month.size * fy,
            (TRIB.rule.x2 - TRIB.month.x) * fx);
        out += textSVG(TRIB.month.x * fx, TRIB.month.baseline * fy, mSize, ink.ink, label);

        const g = tribGrid(W, H);
        ANNIV_DAYS.forEach((ch, i) => {
            out += '<text x="' + g.centre(i) + '" y="' + (TRIB.head.baseline * fy) +
                '" text-anchor="middle" font-family="' + CAL_FACE +
                '" font-weight="400" font-size="' + (TRIB.head.size * fy) +
                '" fill="' + ink.ink + '">' + esc(ch) + "</text>";
        });
        out += '<line x1="' + g.x1 + '" y1="' + (TRIB.rule.y * fy) + '" x2="' +
            (g.x1 + g.span) + '" y2="' + (TRIB.rule.y * fy) + '" stroke="' + ink.ink +
            '" stroke-width="' + Math.max(1, TRIB.rule.width * fy) + '"/>';

        const cell = annivCell(info, state.day);
        if (cell) {
            const hw = TRIB.dayHeart.w * fx;
            const hh = hw / ratio;
            out += heartSVG(g.centre(cell.col) - hw / 2,
                g.baseline(cell.row) - hh * 0.62, hw, hh, ink.accent);
        }
        for (let d = 1; d <= info.length; d += 1) {
            const at = annivCell(info, d);
            out += '<text x="' + g.centre(at.col) + '" y="' + g.baseline(at.row) +
                '" text-anchor="middle" font-family="' + CAL_FACE +
                '" font-weight="400" font-size="' + (TRIB.grid.size * fy) + '" fill="' +
                ((cell && cell.day === d) ? ink.onAccent : ink.ink) + '">' + d + "</text>";
        }

        const rects = tribRects(W, H);
        rects.forEach((r, i) => {
            const slot = tribSlot(i);
            if (photos[slot]) {
                const id = "tb-trib-" + i;
                out += '<defs><clipPath id="' + id + '"><rect x="' + r.x + '" y="' + r.y +
                    '" width="' + r.w + '" height="' + r.h + '"/></clipPath></defs>' +
                    '<g clip-path="url(#' + id + ')">' +
                    photoImageSVG(photos[slot], state.views[slot], r.x, r.y, r.w, r.h) +
                    "</g>";
            } else {
                out += '<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w +
                    '" height="' + r.h + '" fill="' +
                    (TRIB_BOXES[i].tint ? ink.boxTint : ink.boxFill) + '"/>';
            }
            out += '<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w +
                '" height="' + r.h + '" fill="none" stroke="' + ink.boxStroke +
                '" stroke-width="' + Math.max(1, TRIB.boxStroke * fx) + '"/>';
        });

        /* Heading: text, heart, text -- measured, never spaced. */
        const parts = tribHeadingParts(state.heading);
        const hSize = TRIB.heading.size * fy;
        measure.font = hbdFont(hSize);
        const beforeW = measure.measureText(parts.before).width;
        const hw2 = TRIB.heading.heart * fx;
        const hh2 = hw2 / ratio;
        const gap = TRIB.heading.gap * fx;
        const hx = TRIB.heading.x * fx;
        const hy = TRIB.heading.baseline * fy;
        out += textSVG(hx, hy, hSize, ink.ink, parts.before);
        out += heartSVG(hx + beforeW + gap, hy - hh2 * 0.82, hw2, hh2, ink.accent);
        if (parts.after) {
            out += textSVG(hx + beforeW + gap * 2 + hw2, hy, hSize, ink.ink, parts.after);
        }

        const msgSize = TRIB.message.size * fy;
        measure.font = hbdFont(msgSize);
        const mW = tribMessageWidth(W);
        hbdWrap(measure, state.message, mW).slice(0, TRIB.message.maxLines)
            .forEach((line, i) => {
                out += textSVG(TRIB.message.x * fx,
                    (TRIB.message.baseline + TRIB.message.leading * i) * fy,
                    msgSize, ink.ink, line);
            });

        const tHeartW = TRIB.title.heart * fx;
        const tHeartH = TRIB.title.heart *
            (TRIB_HEART.view[3] / TRIB_HEART.view[2]) * fy;
        const tSize = hbdFit(measure, state.title, TRIB.title.size * fy,
            W - TRIB.title.x * fx * 2 - tHeartW);
        const tW = measure.measureText(state.title).width;
        const tx = (W - (tW + TRIB.title.gap * fx + tHeartW)) / 2;
        const ty = TRIB.title.baseline * fy;
        out += textSVG(tx, ty, tSize, ink.ink, state.title);
        out += tribHeartSVG(tx + tW + TRIB.title.gap * fx,
            ty - tHeartH * TRIB.title.lift, tHeartW, tHeartH, "t");
        return out;
    }

    function birthdaySVG(W, H, esc) {
        const fx = W / HBD.page.w;
        const fy = H / HBD.page.h;
        const ink = hbdTheme();
        const face = SCRIPT_SVG_FACE;
        const measure = document.createElement("canvas").getContext("2d");
        let out = '<rect width="' + W + '" height="' + H + '" fill="' + ink.page + '"/>';

        const heartSVG = (x, y, w, h, colour) => {
            const v = ANNIV_HEART.view;
            return '<g transform="translate(' + x + " " + y + ') scale(' +
                (w / v[2]) + " " + (h / v[3]) + ') translate(' + (-v[0]) + " " +
                (-v[1]) + ')"><path d="' + ANNIV_HEART.parts[0].d + '" fill="' +
                colour + '"/></g>';
        };

        /* ---- sparkles ---- */
        out += sparkleSVG(HBD_SPARKLES, fx, fy, ink, "hb");

        /* ---- garland ---- */
        const g0 = HBD_GARLAND;
        out += '<line x1="' + (g0.string.x1 * fx) + '" y1="' + (g0.string.y1 * fy) +
            '" x2="' + (g0.string.x2 * fx) + '" y2="' + (g0.string.y2 * fy) +
            '" stroke="' + ink.ink + '" stroke-width="' +
            Math.max(0.8, g0.string.width * fx) + '"/>';
        g0.ticks.forEach((t) => {
            for (let k = -1; k <= 1; k += 1) {
                out += '<line x1="' + ((t.x - 4) * fx) + '" y1="' + ((t.y + k * 3 - 3) * fy) +
                    '" x2="' + ((t.x + 4) * fx) + '" y2="' + ((t.y + k * 3 + 3) * fy) +
                    '" stroke="' + ink.ink + '" stroke-width="' +
                    Math.max(0.8, g0.string.width * fx) + '"/>';
            }
        });
        g0.hearts.forEach((h) => {
            const w = h.w * fx;
            const hh = w / (ANNIV_HEART.view[2] / ANNIV_HEART.view[3]);
            out += heartSVG(h.cx * fx - w / 2, h.cy * fy - hh / 2, w, hh,
                h.tint === "A" ? ink.garlandA : ink.garlandB);
        });

        /* ---- month ---- */
        const info = annivMonth(state.year, state.month);
        const label = (ANNIV_MONTHS[info.month] || "").toUpperCase();
        const monthSize = hbdFit(measure, label, HBD.month.size * fy,
            (HBD_GARLAND.string.x1 - HBD.month.x - 12) * fx);
        out += '<text x="' + (HBD.month.x * fx) + '" y="' + (HBD.month.baseline * fy) +
            '" font-family="' + face + '" font-weight="400" font-size="' +
            hbdPx(monthSize) + '" fill="' + ink.ink + '">' + esc(label) + "</text>";

        /* ---- calendar ---- */
        const g = hbdGrid(W, H);
        /* Centred per column, the same way annivHead() does it on the canvas,
           so the two painters land the letters on the same marks. */
        const headSize = HBD.head.size * fy;
        ANNIV_DAYS.forEach((ch, i) => {
            out += '<text x="' + g.centre(i) + '" y="' + (HBD.head.baseline * fy) +
                '" text-anchor="middle" font-family="' + CAL_FACE +
                '" font-weight="400" font-size="' + headSize + '" fill="' + ink.ink +
                '">' + esc(ch) + "</text>";
        });

        out += '<line x1="' + g.x1 + '" y1="' + (HBD.rule.y * fy) + '" x2="' +
            (g.x1 + g.span) + '" y2="' + (HBD.rule.y * fy) + '" stroke="' + ink.ink +
            '" stroke-width="' + Math.max(1, HBD.rule.width * fy) + '"/>';

        const cell = annivCell(info, state.day);
        if (cell) {
            const hw = HBD.dayHeart.w * fx;
            const hh = hw / (ANNIV_HEART.view[2] / ANNIV_HEART.view[3]);
            out += heartSVG(g.centre(cell.col) - hw / 2,
                g.baseline(cell.row) - hh * 0.62, hw, hh, ink.accent);
        }
        for (let d = 1; d <= info.length; d += 1) {
            const at = annivCell(info, d);
            out += '<text x="' + g.centre(at.col) + '" y="' + g.baseline(at.row) +
                '" text-anchor="middle" font-family="' + CAL_FACE +
                '" font-weight="400" font-size="' + (HBD.grid.size * fy) + '" fill="' +
                ((cell && cell.day === d) ? ink.onAccent : ink.ink) + '">' + d + "</text>";
        }

        /* ---- photographs ---- */
        const rects = hbdRects(W, H);
        rects.forEach((r, i) => {
            const slot = hbdSlot(i);
            if (photos[slot]) {
                const id = "tb-hbd-" + i;
                out += '<defs><clipPath id="' + id + '"><rect x="' + r.x + '" y="' + r.y +
                    '" width="' + r.w + '" height="' + r.h + '"/></clipPath></defs>' +
                    '<g clip-path="url(#' + id + ')">' +
                    photoImageSVG(photos[slot], state.views[slot], r.x, r.y, r.w, r.h) +
                    "</g>";
            } else if (ink.boxFill) {
                out += '<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w +
                    '" height="' + r.h + '" fill="' + ink.boxFill + '"/>';
            }
            out += '<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w +
                '" height="' + r.h + '" fill="none" stroke="' + ink.boxStroke +
                '" stroke-width="' + Math.max(1, HBD.photoStroke * fx) + '"/>';
        });

        /* ---- quote ---- */
        const quoteSize = HBD.quote.size * fy;
        measure.font = hbdFont(quoteSize);
        const quoteW = (HBD_BOXES[4].x - HBD.quote.x - 12) * fx;
        hbdWrap(measure, state.quote, quoteW).slice(0, HBD.quote.maxLines)
            .forEach((line, i) => {
                out += '<text x="' + (HBD.quote.x * fx) + '" y="' +
                    ((HBD.quote.baseline + HBD.quote.leading * i) * fy) +
                    '" font-family="' + face +
                    '" font-weight="400" font-size="' + hbdPx(quoteSize) +
                    '" fill="' + ink.ink + '">' + esc(line) + "</text>";
            });

        /* ---- closing, with its heart on the last line ---- */
        const closeSize = HBD.closing.size * fy;
        measure.font = hbdFont(closeSize);
        const heartW = HBD.closingHeart.w * fx;
        const heartH = heartW / (ANNIV_HEART.view[2] / ANNIV_HEART.view[3]);
        const closeW = W - HBD.closing.x * fx * 2 - heartW - 6 * fx;
        const clines = hbdWrap(measure, state.closing, closeW).slice(0, 3);
        clines.forEach((line, i) => {
            const y = (HBD.closing.baseline + HBD.closing.leading * i) * fy;
            out += '<text x="' + (HBD.closing.x * fx) + '" y="' + y +
                '" font-family="' + face +
                '" font-weight="400" font-size="' + hbdPx(closeSize) +
                '" fill="' + ink.ink + '">' + esc(line) + "</text>";
            if (i === clines.length - 1) {
                const w = measure.measureText(line).width;
                out += heartSVG(HBD.closing.x * fx + w + 6 * fx,
                    y - heartH * 0.78, heartW, heartH, ink.accent);
            }
        });
        return out;
    }

    function anniversarySVG(W, H, esc) {
        const fx = W / ANNIV.page.w;
        const fy = H / ANNIV.page.h;
        const mid = W / 2;
        const ink = annivTheme();
        const face = "Playfair Display, Georgia, serif";
        let out = '<rect width="' + W + '" height="' + H + '" fill="' + ink.page + '"/>';

        const measure = document.createElement("canvas").getContext("2d");

        const heartW = ANNIV.nameHeart.w * fx;
        const heartH = heartW / (ANNIV_HEART.view[2] / ANNIV_HEART.view[3]);
        const gap = ANNIV.names.gap * fx;
        const half = (W - heartW - gap * 2) / 2;

        const sizeA = annivFit(measure, state.nameA, ANNIV.names.size * fy,
            half - W * 0.06, true, 700);
        const sizeB = annivFit(measure, state.nameB, ANNIV.names.size * fy,
            half - W * 0.06, true, 700);
        out += '<text x="' + (mid - heartW / 2 - gap) + '" y="' +
            (ANNIV.names.baseline * fy) + '" text-anchor="end" font-family="' + face +
            '" font-style="italic" font-weight="700" font-size="' + sizeA +
            '" fill="' + ink.ink + '">' + esc(state.nameA) + "</text>";
        out += '<text x="' + (mid + heartW / 2 + gap) + '" y="' +
            (ANNIV.names.baseline * fy) + '" text-anchor="start" font-family="' + face +
            '" font-style="italic" font-weight="700" font-size="' + sizeB +
            '" fill="' + ink.ink + '">' + esc(state.nameB) + "</text>";
        out += annivHeartSVG(mid - heartW / 2, ANNIV.nameHeart.cy * fy - heartH / 2,
            heartW, heartH);

        const rects = annivRects(W, H);
        rects.forEach((r, i) => {
            const slot = annivSlot(i);
            if (photos[slot]) {
                const id = "tb-anniv-" + i;
                out += '<defs><clipPath id="' + id + '"><rect x="' + r.x + '" y="' + r.y +
                    '" width="' + r.w + '" height="' + r.h + '"/></clipPath></defs>' +
                    '<g clip-path="url(#' + id + ')">' +
                    photoImageSVG(photos[slot], state.views[slot], r.x, r.y, r.w, r.h) +
                    "</g>";
            } else if (ink.boxFill) {
                out += '<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w +
                    '" height="' + r.h + '" fill="' + ink.boxFill + '"/>';
            } else {
                /* The same half-stroke inset the canvas uses. An SVG stroke is
                   centred on the path, so without it the outlined heart comes
                   out a line width larger here than on screen -- small, and
                   exactly the kind of difference that survives because nobody
                   measures an empty box. */
                const lw = Math.max(1, r.w * 0.012);
                out += '<rect x="' + (r.x + lw / 2) + '" y="' + (r.y + lw / 2) +
                    '" width="' + (r.w - lw) + '" height="' + (r.h - lw) +
                    '" fill="none" stroke="' + ink.boxStroke +
                    '" stroke-width="' + lw + '"/>';
            }
        });

        const code = annivCodeRect(W, H);
        if (photos[CODE_SLOT]) {
            out += '<defs><clipPath id="tb-anniv-code"><rect x="' + code.x + '" y="' +
                code.y + '" width="' + code.w + '" height="' + code.h +
                '"/></clipPath></defs><g clip-path="url(#tb-anniv-code)">' +
                photoImageSVG(photos[CODE_SLOT], state.views[CODE_SLOT],
                    code.x, code.y, code.w, code.h) + "</g>";
        }

        const info = annivMonth(state.year, state.month);
        const g = annivGrid(W, H);
        const label = (ANNIV_MONTHS[info.month] || "").toUpperCase() + " " + info.year;
        const labelSize = annivFit(measure, label, ANNIV.month.size * fy, g.span, false, 600);
        out += '<text x="' + mid + '" y="' + (ANNIV.month.baseline * fy) +
            '" text-anchor="middle" font-family="' + face + '" font-weight="600" font-size="' +
            labelSize + '" fill="' + ink.ink + '">' + esc(label) + "</text>";

        /* The header, on the same column centres the canvas uses. */
        const headSize = ANNIV.head.size * fy;
        ANNIV_DAYS.forEach((ch, i) => {
            out += '<text x="' + g.centre(i) + '" y="' + (ANNIV.head.baseline * fy) +
                '" text-anchor="middle" font-family="' + CAL_FACE +
                '" font-weight="400" font-size="' + headSize + '" fill="' + ink.ink +
                '">' + esc(ch) + "</text>";
        });

        out += '<line x1="' + g.x1 + '" y1="' + (ANNIV.rule.y * fy) + '" x2="' +
            (g.x1 + g.span) + '" y2="' + (ANNIV.rule.y * fy) + '" stroke="' + ink.ink +
            '" stroke-width="' + Math.max(1, ANNIV.rule.width * fy) + '"/>';

        const cell = annivCell(info, state.day);
        if (cell) {
            const hw = ANNIV.dayHeart.w * fx;
            const hh = hw / (ANNIV_HEART.view[2] / ANNIV_HEART.view[3]);
            out += annivHeartSVG(g.centre(cell.col) - hw / 2,
                g.baseline(cell.row) - hh * 0.62, hw, hh);
        }

        for (let d = 1; d <= info.length; d += 1) {
            const at = annivCell(info, d);
            out += '<text x="' + g.centre(at.col) + '" y="' + g.baseline(at.row) +
                '" text-anchor="middle" font-family="' + CAL_FACE +
                '" font-weight="400" font-size="' + (ANNIV.grid.size * fy) + '" fill="' +
                ((cell && cell.day === d) ? ink.onAccent : ink.ink) + '">' + d + "</text>";
        }

        const tagSize = annivFit(measure, state.tagline, ANNIV.tagline.size * fy,
            W * ANNIV.tagline.maxW, true, 700);
        out += '<text x="' + mid + '" y="' + (ANNIV.tagline.baseline * fy) +
            '" text-anchor="middle" font-family="' + face +
            '" font-style="italic" font-weight="700" font-size="' + tagSize +
            '" fill="' + ink.ink + '">' + esc(state.tagline) + "</text>";
        return out;
    }

    /* The heart as a placed vector, for the exporter. artSVG() serves the
       search screen's icons the same way; this is the one-part case. */
    function annivHeartSVG(x, y, w, h) {
        const v = ANNIV_HEART.view;
        return '<g transform="translate(' + x + ' ' + y + ') scale(' + (w / v[2]) +
            " " + (h / v[3]) + ') translate(' + (-v[0]) + " " + (-v[1]) + ')">' +
            '<path d="' + ANNIV_HEART.parts[0].d + '" fill="' + annivTheme().accent +
            '"/></g>';
    }

    /* ----------------------------------------------------------------------
       Where each layout's own text actually landed.

       The layouts draw their fields at their own sizes, and several SHRINK to
       fit -- the song title, the anniversary names, the tribute's foot line.
       An editor placed over them has to know the size that was used, not the
       size that was asked for.

       So the painters report, rather than the editor re-deriving. Each text a
       visitor can edit calls noteText() at the point it is drawn, with the
       numbers it just drew with. Nothing is recomputed and nothing can drift:
       the region IS the drawing.

       Recording is ADDITIVE. A field whose painter forgets to call this is
       simply not editable on the canvas; it cannot come out drawn wrongly,
       which is what a `skip this one` flag threaded through the same twenty
       call sites would have risked.

       Only the preview records -- render() asks for it. Exports paint at their
       own scale, and letting one overwrite these would leave the editor
       pointing at coordinates from a different canvas. */
    let textRegions = [];
    let recordingRegions = false;

    /* x,y is the TOP-LEFT of the drawn run, w,h its size, all in canvas
       pixels. `align` and `font` are what the context was set to. */
    function noteText(c, key, box) {
        if (recordingRegions) {
            /* fillStyle is still the colour the words were just drawn in, so
               the caret can match the ink without every call site repeating
               it -- and a ghost editor whose caret inherited `transparent`
               from its own text colour would be invisible. */
            textRegions.push(Object.assign({ key: key, caret: c.fillStyle }, box));
        }
    }

    function paint(c, W, H, opts) {
        const options = opts || {};
        if (options.record) {
            textRegions = [];
            recordingRegions = true;
        }
        const frame = FRAME_STYLES[state.frame] || FRAME_STYLES.black;
        const scale = W / 1200;

        c.clearRect(0, 0, W, H);

        if (frame.layout === "card") {
            paintCard(c, W, H, options, scale);
        } else if (frame.layout === "split") {
            paintSplit(c, W, H, options, scale);
        } else if (frame.layout === "browser") {
            paintScreen(c, W, H, options);
        } else if (frame.layout === "player") {
            paintPlayer(c, W, H, options);
        } else if (frame.layout === "anniversary") {
            paintAnniversary(c, W, H, options);
        } else if (frame.layout === "birthday") {
            paintBirthday(c, W, H, options);
        } else if (frame.layout === "tribute") {
            paintTribute(c, W, H, options);
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

        /* One element is skipped while it is being edited on the canvas:
           the DOM editor is drawing it instead. Passed in rather than read
           from module scope so that EXPORTS, which call paint() without it,
           always draw every element -- an export is never mid-edit. */
        state.texts.forEach((el) => {
            if (el.id !== options.skipTextId) {
                drawTextElement(c, el, W, H);
            }
        });

        recordingRegions = false;
    }

    function render() {
        const s = previewSize();
        if (canvas.width !== s.w || canvas.height !== s.h) {
            canvas.width = s.w;
            canvas.height = s.h;
        }
        paint(ctx, s.w, s.h, { skipTextId: editingTextId(), record: true });
        drawGridChrome();
        drawPlayerChrome();
        drawAnniversaryChrome();
        drawCollageChrome();
        drawSelection();
        syncQueryInput();
        positionTextLive();
    }

    /* Preview-only prompts for the player's two empty slots.

       Outside paint(), which every export renders through, and for two
       different reasons. The album's empty state is the ARTWORK'S -- a white
       panel on the dark theme, an outlined one on the light -- and it looks
       finished, so printing "upload a photo" over it would put the editor's
       furniture on somebody's wall. The scan code's empty state is nothing at
       all, because a poster without a code is an ordinary thing to want, the
       same argument the search screen's empty cards are built on.

       Neither is discoverable without this, which is the whole point: both
       boxes are clickable and a box that looks like artwork does not say so. */
    /* Preview-only prompts for the anniversary poster. render() calls this and
       paint() does not, so none of it is in any export.

       The collage's empty boxes are NOT prompted over. They are white panels
       and that is the artwork's own empty state -- a heart of blank frames is a
       finished-looking design, and printing "click to add" eighteen times would
       put this editor's furniture on somebody's wall. Only the scan code, which
       is invisible when empty, gets a prompt. */
    function drawAnniversaryChrome() {
        if (layoutOf(state.frame) !== "anniversary") {
            return;
        }
        const W = canvas.width;
        const H = canvas.height;
        const code = annivCodeRect(W, H);
        ctx.save();
        if (!photos[CODE_SLOT]) {
            ctx.strokeStyle = annivTheme().ink;
            ctx.fillStyle = annivTheme().ink;
            ctx.globalAlpha = 0.45;
            ctx.lineWidth = Math.max(1, W * 0.002);
            ctx.setLineDash([W * 0.008, W * 0.006]);
            ctx.strokeRect(code.x, code.y, code.w, code.h);
            ctx.setLineDash([]);
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = "400 " + (W * 0.024) + 'px "Inter", sans-serif';
            ctx.fillText("Click to add your scan code",
                code.x + code.w / 2, code.y + code.h / 2);
            ctx.globalAlpha = 1;
        }

        ctx.restore();
    }

    /* The selected box, rung the way the search screen and the player ring
       theirs, on every collage rather than on one of them.

       It began as four lines inside the anniversary's chrome, justified there
       by "with eighteen boxes this is the only thing on the preview that says
       which one the size slider is holding". That argument was never about the
       anniversary. The birthday has twelve boxes and shipped with no ring at
       all; the tribute has fifteen, four pairs of which OVERLAP, so the box a
       click lands in is the one painted last -- which is not a thing a visitor
       can see, and is the strongest case of the three for saying it out loud.

       Same colour, dash and weight as the other two rings, for the reason the
       player's comment already gives: two rings that mean the same thing
       should not look like two different things.

       Preview only. render() calls this and paint() does not, so it is in no
       export. */
    function drawCollageChrome() {
        const lay = layoutOf(state.frame);
        if (lay !== "anniversary" && lay !== "birthday" && lay !== "tribute") {
            return;
        }
        const W = canvas.width;
        const H = canvas.height;
        const sel = primarySlot();
        /* The anniversary's scan code is the one selectable thing here that is
           not one of the collage's boxes, so it is the one rect that does not
           come from rectForSlot(). */
        const box = (lay === "anniversary" && sel === CODE_SLOT)
            ? annivCodeRect(W, H)
            : rectForSlot(sel, W, H);
        if (!box) {
            return;
        }
        ctx.save();
        const inset = Math.max(2, W * 0.006);
        ctx.strokeStyle = "#8A6A3B";
        ctx.lineWidth = Math.max(1.5, W * 0.004);
        ctx.setLineDash([W * 0.01, W * 0.008]);
        ctx.strokeRect(box.x + inset, box.y + inset,
            box.w - inset * 2, box.h - inset * 2);
        ctx.setLineDash([]);
        ctx.restore();
    }

    function drawPlayerChrome() {
        if (layoutOf(state.frame) !== "player") {
            return;
        }
        const W = canvas.width;
        const H = canvas.height;
        const s = playerScale(W, H);
        const ink = playerTheme();

        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "400 " + (W * 0.028) + 'px "Inter", sans-serif';

        if (!photos[0]) {
            const a = albumRect(W, H);
            /* On the dark theme the empty album is a WHITE panel, so the prompt
               has to be dark on it -- the page colour, not the ink. On the light
               theme the panel is the page, so the ink is right. Getting this
               backwards is how a prompt ends up correct, well placed and
               invisible, which this editor has already done once. */
            ctx.fillStyle = ink.albumFill ? ink.page : ink.ink;
            ctx.globalAlpha = 0.55;
            ctx.fillText("Click to add the album artwork", a.x + a.w / 2, a.y + a.h / 2);
            ctx.globalAlpha = 1;
        }

        if (!photos[CODE_SLOT]) {
            const c = codeRect(W, H);
            ctx.strokeStyle = ink.ink;
            ctx.fillStyle = ink.ink;
            ctx.globalAlpha = 0.45;
            ctx.lineWidth = Math.max(1, W * 0.002);
            ctx.setLineDash([W * 0.008, W * 0.006]);
            roundRectPath(ctx, c.x, c.y, c.w, c.h, 8 * s.fx);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillText("Click to add your scan code", c.x + c.w / 2, c.y + c.h / 2);
            ctx.globalAlpha = 1;
        }

        /* Which slot the controls are holding, said on the PREVIEW and not only
           in the panel. The search screen has always rung its selected card;
           this layout had nothing to ring until its two slots became separately
           selectable, and a selection that moves a control without moving
           anything the visitor can see is the milder half of the fault that
           made it selectable in the first place. On a phone the preview is a
           separate tab from the form, so the panel's label is not an answer
           anyone can read while looking at the poster.

           Same colour, dash and weight as the grid's ring, from the same
           reasoning: two rings that mean the same thing should not look like
           two different things. Preview only -- render() calls this and paint()
           does not, so it is in no export.

           Drawn INSIDE the box, inset, which the grid's ring does not do and
           this one has to. Two reasons, both found by looking at it rather than
           by measuring it. On the box's own edge the dash straddles the border
           of a picture that runs edge to edge -- on the code's saturated green
           that reads as a damaged border rather than a selection. And there is
           no room OUTSIDE the album: its top sits 1.76pt below the lowest of
           the three header dots, where the stroke alone is 2.4pt wide, so an
           outside ring cuts through the chevron and touches the dots. Inset, it
           collides with nothing and reads as the crop marquee it resembles. */
        const sel = primarySlot();
        const box = sel === CODE_SLOT ? codeRect(W, H) : albumRect(W, H);
        const inset = Math.max(2, W * 0.007);
        ctx.strokeStyle = "#8A6A3B";
        ctx.lineWidth = Math.max(1.5, W * 0.004);
        ctx.setLineDash([W * 0.01, W * 0.008]);
        roundRectPath(ctx, box.x + inset, box.y + inset,
            box.w - inset * 2, box.h - inset * 2,
            Math.max(0, (sel === CODE_SLOT ? 8 : PLAYER.album.r) * s.fx - inset));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
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

        /* The ring reads the same answer the framing controls do, so the
           highlighted card and the card the slider is holding cannot disagree
           -- a selection left behind by another layout rings nothing at all. */
        const selected = primarySlot();

        ctx.save();
        rects.forEach((r, i) => {
            if (!photos[i]) {
                ctx.fillStyle = "#B9BAC0";
                ctx.font = "400 " + (W * 0.045) + 'px "Inter", sans-serif';
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(String(i + 1), r.x + r.w / 2, r.y + r.h / 2);
            }
            if (i === selected) {
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
        if (selected === AVATAR_SLOT) {
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
    /* Where a text element actually lands on the canvas, in canvas pixels.

       Three things need this box and each used to work it out again: the
       selection ring, the hit test, and now the inline editor that sits over
       it. Three copies of an alignment rule is three chances for the ring to
       sit somewhere the click does not.

       Leaves ctx's font and metrics SET, because every caller wants them --
       the ring measures with them, and the editor reads ctx.font to copy the
       face into the DOM. */
    function textBox(el, W, H) {
        const px = applyTextStyle(ctx, el, W);
        const lines = layoutLines(ctx, el,
            el.upper ? el.text.toUpperCase() : el.text, el.boxW * W);
        let maxW = 0;
        lines.forEach((l) => { maxW = Math.max(maxW, ctx.measureText(l).width); });
        let x = el.x * W;
        if (el.align === "center") { x -= maxW / 2; }
        if (el.align === "right") { x -= maxW; }
        return {
            x: x, y: el.y * H - px, w: maxW, h: lines.length * px * el.line,
            px: px, lines: lines, font: ctx.font
        };
    }

    function drawSelection() {
        const el = selected();
        if (!el || !el.text) {
            return;
        }
        const W = canvas.width;
        const H = canvas.height;
        const box = textBox(el, W, H);
        const px = box.px;
        const maxW = box.w;
        const h = box.h;
        const x = box.x;
        const y = box.y;
        ctx.globalAlpha = 1;

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
       Typing on the poster itself.

       A textarea parked over the element being edited, wearing its font. The
       canvas stops drawing that one element while this is open, so there is
       exactly one rendering of the words at any moment -- see the note beside
       #p-text-live in poster.html.
       ---------------------------------------------------------------------- */

    /* Sixteen, and the transform does the sizing -- the same trick and the
       same reason as QUERY_LIVE_FONT. */
    const TEXT_LIVE_FONT = 16;

    /* What is being edited on the canvas, or null. Two kinds, because the
       two behave differently:

         { kind: "text",  id }   a free text element -- the canvas SKIPS it and
                                 the editor draws it, opaque.
         { kind: "field", key }  a layout's own field -- the canvas keeps
                                 drawing it and the editor is a GHOST over the
                                 top, contributing only a caret and a
                                 selection.

       The layouts are ghosts for a practical reason. A free text element is
       one object drawn in one place, so skipping it is a single condition. A
       layout's fields are drawn inside four painters at fourteen different
       call sites, several of them shrink-to-fit and three of them wrapped
       blocks; threading a "not this one" flag through all of that would be
       fourteen chances to break a poster that currently renders correctly.
       Reading where they landed is additive and cannot. */
    let editing = null;
    const textLive = byId("p-text-live");

    function editingTextId() {
        return editing && editing.kind === "text" ? editing.id : null;
    }

    /* Which panel control each canvas-editable field mirrors, and the
       sanitiser that field uses. Both have to match the panel exactly: two
       ways to type one string, and the stricter of the two rules has to win
       in both places or the poster changes depending on where it was typed.

       cleanHeading for the tribute's heading, because the run of spaces in it
       is the marker for where the heart goes and cleanBlock() would eat it. */
    const LIVE_FIELDS = {
        song: { field: "p-song", clean: cleanLine },
        artist: { field: "p-artist", clean: cleanLine },
        elapsed: { field: "p-elapsed", clean: cleanTime },
        total: { field: "p-total", clean: cleanTime },
        captionHead: { field: "p-caption-head", clean: cleanLine },
        captionBody: { field: "p-caption-body", clean: cleanLine },
        nameA: { field: "p-name-a", clean: cleanLine },
        nameB: { field: "p-name-b", clean: cleanLine },
        tagline: { field: "p-tagline", clean: cleanLine },
        quote: { field: "p-quote", clean: cleanBlock },
        closing: { field: "p-closing", clean: cleanBlock },
        heading: { field: "p-heading", clean: cleanHeading },
        message: { field: "p-message", clean: cleanBlock },
        title: { field: "p-title", clean: cleanLine }
    };

    function regionFor(key) {
        return textRegions.find((r) => r.key === key) || null;
    }

    /* The layout field under a point, if any. Searched backwards so a region
       recorded later -- drawn on top -- wins, the same rule the overlapping
       photo boxes follow. */
    function fieldAt(pt, W, H) {
        for (let i = textRegions.length - 1; i >= 0; i -= 1) {
            const r = textRegions[i];
            if (!LIVE_FIELDS[r.key]) { continue; }
            const pad = r.size * 0.25;
            if (pt.x * W >= r.x - pad && pt.x * W <= r.x + r.w + pad &&
                    pt.y * H >= r.y - pad && pt.y * H <= r.y + r.h + pad) {
                return r;
            }
        }
        return null;
    }

    function positionTextLive() {
        if (!textLive) {
            return;
        }
        if (!editing) {
            textLive.hidden = true;
            return;
        }
        if (editing.kind === "field") {
            positionFieldLive();
            return;
        }
        const el = state.texts.find((t) => t.id === editing.id);
        if (!el) {
            textLive.hidden = true;
            return;
        }
        const rect = canvas.getBoundingClientRect();
        if (!rect.width) {
            /* The preview is on the other tab. Leaving the box where it was
               would strand an editable field over a pane it no longer sits on. */
            return;
        }
        const W = canvas.width;
        const H = canvas.height;
        const box = textBox(el, W, H);
        /* CSS pixels per canvas pixel. */
        const k = rect.width / W;
        const px = box.px * k;
        const scale = px / TEXT_LIVE_FONT;

        textLive.hidden = false;
        /* The font the CANVAS just used, with only its size swapped for the
           one the transform expects. Copying the shorthand rather than
           rebuilding it means the editor cannot disagree with the drawing
           about weight, slant or which family actually resolved. */
        textLive.style.font = box.font.replace(
            /(^|\s)(\d*\.?\d+)px(\s)/, "$1" + TEXT_LIVE_FONT + "px$3");
        const track = (el.letter * box.px * k) / scale;
        textLive.style.letterSpacing = (Number.isFinite(track) ? track : 0) + "px";
        textLive.style.lineHeight = ((box.px * el.line * k) / scale) + "px";
        textLive.style.color = el.color;
        textLive.style.caretColor = el.color;
        textLive.style.opacity = String(el.opacity);
        textLive.style.textAlign = el.align;
        textLive.style.textTransform = el.upper ? "uppercase" : "none";
        textLive.style.transform = "scale(" + scale + ")";

        /* The BOX, not the ink: an alignment other than left means the drawn
           run sits inside a wider column, and the editor has to be that column
           or the caret lands where the text is not. */
        const colW = el.boxW * W * k;
        let left = el.x * W * k;
        if (el.align === "center") { left -= colW / 2; }
        if (el.align === "right") { left -= colW; }
        textLive.style.left = left + "px";
        textLive.style.width = (colW / scale) + "px";
        /* textBox()'s y is the first line's ascent top, which is where a
           textarea's first line box starts too. */
        textLive.style.top = (box.y * k) + "px";
        textLive.style.height = ((box.h * k) / scale) + "px";

        textLive.classList.remove("is-ghost");
        if (textLive.value !== el.text) {
            textLive.value = el.text;
        }
    }

    /* A layout's own field. The canvas is still drawing the words, so this is
       a GHOST: transparent ink, real caret, real selection. Everything about
       the box comes from what the painter recorded, which is why a
       shrink-to-fit title gets an editor at the size it actually printed. */
    function positionFieldLive() {
        const box = regionFor(editing.key);
        if (!box) {
            /* The field left the page -- a layout switch, or a caption
               emptied. Nothing to sit over. */
            textLive.hidden = true;
            return;
        }
        const rect = canvas.getBoundingClientRect();
        if (!rect.width) {
            return;
        }
        const k = rect.width / canvas.width;
        const px = box.size * k;
        const scale = px / TEXT_LIVE_FONT;

        textLive.hidden = false;
        textLive.classList.add("is-ghost");
        textLive.style.font = box.font.replace(
            /(^|\s)(\d*\.?\d+)px(\s)/, "$1" + TEXT_LIVE_FONT + "px$3");
        textLive.style.letterSpacing = "0px";
        textLive.style.lineHeight =
            (((box.leading || box.size * 1.3) * k) / scale) + "px";
        textLive.style.color = "transparent";
        textLive.style.caretColor = box.caret || "currentColor";
        textLive.style.opacity = "1";
        textLive.style.textAlign = box.align;
        textLive.style.textTransform = "none";
        /* The times carry the artwork's horizontal condense, so the editor
           wears it too -- a caret on unsqueezed digits drifts further right
           with every character. */
        textLive.style.transform = "scale(" + (scale * (box.squeeze || 1)) +
            ", " + scale + ")";
        textLive.style.left = (box.x * k) + "px";
        textLive.style.top = (box.y * k) + "px";
        textLive.style.width = ((box.w * k) / (scale * (box.squeeze || 1))) + "px";
        textLive.style.height = ((box.h * k) / scale) + "px";

        const value = String(state[editing.key] === undefined ? "" : state[editing.key]);
        if (textLive.value !== value) {
            textLive.value = value;
        }
    }

    function beginTextEdit(el) {
        if (!textLive || !el) {
            return;
        }
        state.sel = el.id;
        editing = { kind: "text", id: el.id };
        syncControls();
        render();
        textLive.focus();
        textLive.setSelectionRange(textLive.value.length, textLive.value.length);
    }

    function beginFieldEdit(key) {
        if (!textLive || !LIVE_FIELDS[key]) {
            return;
        }
        editing = { kind: "field", key: key };
        render();
        textLive.focus();
        textLive.setSelectionRange(textLive.value.length, textLive.value.length);
    }

    function endTextEdit() {
        if (editing === null) {
            return;
        }
        editing = null;
        if (textLive) {
            textLive.hidden = true;
            textLive.classList.remove("is-ghost");
        }
        render();
    }

    if (textLive) {
        textLive.addEventListener("input", () => {
            if (editing && editing.kind === "field") {
                const spec = LIVE_FIELDS[editing.key];
                const next = spec.clean(textLive.value);
                if (state[editing.key] === next) {
                    return;
                }
                beginChange();
                state[editing.key] = next;
                /* Keyed on the field, so a burst of typing is one undo -- and
                   the SAME key the panel control uses, so typing in one and
                   then the other does not split into two entries either. */
                commit("live:" + editing.key);
                const panel = byId(spec.field);
                if (panel && panel.value !== next) {
                    panel.value = next;
                }
                render();
                return;
            }
            const el = state.texts.find((t) => t.id === editingTextId());
            if (!el || el.text === textLive.value) {
                return;
            }
            beginChange();
            el.text = textLive.value;
            /* The same coalesce key the panel's own textarea uses, so a burst
               of typing is one undo whichever of the two it was typed into. */
            commit("text:" + el.id);
            const panel = byId("t-caption");
            if (panel && panel.value !== el.text) {
                panel.value = el.text;
            }
            render();
        });

        textLive.addEventListener("keydown", (ev) => {
            if (ev.key === "Escape") {
                ev.preventDefault();
                endTextEdit();
                canvas.focus();
            }
        });

        textLive.addEventListener("blur", endTextEdit);
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
            const box = textBox(el, W, H);
            const pad = box.px * 0.3;
            const inX = pt.x * W >= box.x - pad && pt.x * W <= box.x + box.w + pad;
            const inY = pt.y * H >= box.y - pad && pt.y * H <= box.y + box.h + pad;
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
        /* The player owns two boxes and neither is photoRectFor()'s single
           answer, so it branches here for the same reason the search screen
           does -- and photoRectFor() is left without a case for either. */
        if (layout === "player") {
            const px = pt.x * W;
            const py = pt.y * H;
            const inside = (r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
            if (inside(albumRect(W, H))) { return 0; }
            if (inside(codeRect(W, H))) { return CODE_SLOT; }
            return -1;
        }
        if (layout === "tribute") {
            const px = pt.x * W;
            const py = pt.y * H;
            const rects = tribRects(W, H);
            /* Backwards, and here it MATTERS: four pairs of these boxes
               genuinely overlap, so the box a click finds has to be the one
               painted last. */
            for (let i = rects.length - 1; i >= 0; i -= 1) {
                const r = rects[i];
                if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
                    return tribSlot(i);
                }
            }
            return -1;
        }
        if (layout === "birthday") {
            const px = pt.x * W;
            const py = pt.y * H;
            const rects = hbdRects(W, H);
            /* Backwards, the same way the anniversary collage walks: these
               boxes do not overlap, but they sit as little as 3.8pt apart and
               a stroke straddles its own edge, so the tie breaks the way the
               paint does. */
            for (let i = rects.length - 1; i >= 0; i -= 1) {
                const r = rects[i];
                if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
                    return hbdSlot(i);
                }
            }
            return -1;
        }
        if (layout === "anniversary") {
            const px = pt.x * W;
            const py = pt.y * H;
            const inside = (r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
            const rects = annivRects(W, H);
            /* Last first: the collage's boxes do not overlap, but the centre
               one is declared first and is much the largest, so walking
               backwards costs nothing and keeps the small pieces reachable if
               a future arrangement ever does overlap them. */
            for (let i = rects.length - 1; i >= 0; i -= 1) {
                if (inside(rects[i])) { return annivSlot(i); }
            }
            if (inside(annivCodeRect(W, H))) { return CODE_SLOT; }
            return -1;
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
        const layout = layoutOf(state.frame);
        if (layout === "player") {
            return i === CODE_SLOT ? codeRect(W, H) : albumRect(W, H);
        }
        if (layout === "tribute") {
            const rects = tribRects(W, H);
            for (let k = 0; k < rects.length; k += 1) {
                if (tribSlot(k) === i) { return rects[k]; }
            }
            return rects[0];
        }
        if (layout === "birthday") {
            const rects = hbdRects(W, H);
            for (let k = 0; k < rects.length; k += 1) {
                if (hbdSlot(k) === i) { return rects[k]; }
            }
            return rects[0];
        }
        if (layout === "anniversary") {
            if (i === CODE_SLOT) { return annivCodeRect(W, H); }
            const rects = annivRects(W, H);
            for (let k = 0; k < rects.length; k += 1) {
                if (annivSlot(k) === i) { return rects[k]; }
            }
            return rects[0];
        }
        if (layout !== "browser") {
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
        if (layout === "player") {
            id = i === CODE_SLOT ? "p-image-code" : "p-image";
        } else if (layout === "anniversary") {
            id = i === CODE_SLOT ? "p-image-code" : "p-image-grid";
        } else if (layout === "browser") {
            id = i === AVATAR_SLOT ? "p-image-avatar" : "p-image-grid";
        } else if (layout === "split" && i === 1) {
            id = "p-image-b";
        }
        const input = byId(id);
        if (input) {
            input.click();
        }
    }

    /* Double-click a text element to type on it. A plain click still selects
       and drags, which is what the panel has always promised; this is the
       second gesture rather than a replacement for the first.

       On pointerdown, ANY press outside the element being edited ends the
       edit. The textarea's own blur would do it a moment later anyway, but not
       before the press has already been handled -- so without this a click on
       another text element would start dragging something the canvas was still
       refusing to draw. */
    canvas.addEventListener("dblclick", (ev) => {
        const pt = canvasPoint(ev);
        /* A free text element first: it is drawn ON TOP of the layout, so a
           double-click where the two overlap should reach the one you can
           see. */
        const el = hitTest(pt);
        if (el) {
            ev.preventDefault();
            beginTextEdit(el);
            return;
        }
        const field = fieldAt(pt, canvas.width, canvas.height);
        if (field) {
            ev.preventDefault();
            beginFieldEdit(field.key);
        }
    });

    canvas.addEventListener("pointerdown", (ev) => {
        const pt = canvasPoint(ev);
        if (editing !== null) {
            const over = hitTest(pt);
            const sameText = editing.kind === "text" && over && over.id === editing.id;
            const field = fieldAt(pt, canvas.width, canvas.height);
            const sameField = editing.kind === "field" && field &&
                field.key === editing.key;
            if (!sameText && !sameField) {
                endTextEdit();
            }
        }
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
            /* A click on a photo slot selects it whether or not there is a
               photograph in it, and then falls through to the drag below -- so
               one press on a filled slot both points the controls at it and
               starts moving it, which is what the text elements have always
               done.

               slotAt() rather than cardAt(): cardAt() answers -1 on every
               layout but the search screen, so on the player a click on the
               scan code selected nothing and the size slider went on holding
               the album. slotAt() delegates to cardAt() on the search screen,
               so that layout's behaviour is unchanged. */
            const card = slotAt(pt, canvas.width, canvas.height);
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

    /* An upload SELECTS the slot it filled. The framing group hides when the
       selected slot is empty, so without this a player poster carrying a scan
       code and no album offers no control to frame the code with -- the
       selection would be sitting on an album nobody uploaded. On every layout
       whose only slot is 0 this changes nothing. */
    bindPhotoInput("p-image", "p-image-error", (img) => {
        state.card = 0;
        fillSlot(0, img);
    });
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
        /* The collage layouts -- eighteen boxes on the anniversary poster,
           twelve on the birthday one -- are not filled a box at a time by
           anybody, so a batch fills them in the artwork's own order. Same two
           rules as the search screen below (empty boxes first, then wrap from
           the selection) expressed over the LAYOUT'S OWN slot list rather than
           over the six grid cards.

           One branch for both. A third near-copy of this allocator is how the
           second collage ends up filling in a different order from the first
           for no reason anybody chose. */
        const upLayout = layoutOf(state.frame);
        if (upLayout === "anniversary" || upLayout === "birthday" ||
                upLayout === "tribute") {
            const slots = slotsFor(upLayout)
                .filter((i) => i !== CODE_SLOT);
            const from = Math.max(0, slots.indexOf(primarySlot()));
            if (count > 0 && !photos[slots[from]]) {
                out.push(slots[from]);
            }
            slots.forEach((i) => {
                if (out.length < count && !photos[i] && out.indexOf(i) === -1) {
                    out.push(i);
                }
            });
            for (let k = 0; k < slots.length && out.length < count; k += 1) {
                const i = slots[(from + k) % slots.length];
                if (out.indexOf(i) === -1) { out.push(i); }
            }
            return out;
        }
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

    /* The player's scan code. One more slot through the one mime gate. */
    bindPhotoInput("p-image-code", "p-image-code-error", (img) => {
        state.card = CODE_SLOT;
        fillSlot(CODE_SLOT, img);
    });

    /* The player's typed fields. Same two events as the ranks and the query
       and for the same reasons: typing coalesces into one history entry per
       burst, and `change` catches a paste committed by blurring.

       The heart's colour is NOT in here. It is a picker rather than a field
       now -- see initHeartPicker(), which does its own coalescing for the
       same reason: dragging a hue track fires continuously, and one undo
       entry per pixel of travel is not an undo history. */
    [["p-song", "song", cleanLine], ["p-artist", "artist", cleanLine],
     ["p-elapsed", "elapsed", cleanTime], ["p-total", "total", cleanTime],
     ["p-caption-head", "captionHead", cleanLine],
     ["p-caption-body", "captionBody", cleanLine]]
        .forEach((entry) => {
            const el = byId(entry[0]);
            if (!el) {
                return;
            }
            const apply = (coalesceKey) => {
                const next = entry[2](el.value);
                if (state[entry[1]] === next) {
                    return;
                }
                beginChange();
                state[entry[1]] = next;
                commit(coalesceKey);
            };
            el.addEventListener("input", () => apply("player-" + entry[1]));
            el.addEventListener("change", () => apply(null));
        });

    /* Moves the SELECTED photograph into another box, trading places with
       whatever was there. The boxes are fixed -- their arrangement is the heart
       -- so the only thing worth moving is which picture is in which one, and
       the thing a visitor actually wants is a particular photograph in the
       large centre box.

       Framings travel with their pictures. A view is a crop of ONE photograph,
       so leaving them behind would apply somebody's crop of one picture to a
       different picture, which is the same argument fillSlot() makes for
       resetting the view on a fresh upload.

       Writes NO history entry, for the reason cardClear() gives: photographs
       are not in `state` and never have been, so a commit here would push an
       entry that restores framings undo cannot bring photographs back to. An
       undo that visibly does nothing is worse than one that is not offered. */
    function swapSlots(a, b) {
        if (a === b) { return; }
        const photo = photos[a];
        photos[a] = photos[b];
        photos[b] = photo;
        const view = state.views[a];
        state.views[a] = state.views[b];
        state.views[b] = view;
        /* The selection follows the picture rather than staying on the box:
           the visitor was pointing at a photograph, and it has moved. */
        state.card = b;
    }

    const annivSwapSelect = byId("p-anniv-swap");
    if (annivSwapSelect) {
        annivSwapSelect.addEventListener("change", () => {
            const target = Number(annivSwapSelect.value);
            const slots = slotsFor(layoutOf(state.frame));
            if (slots.indexOf(target) === -1) { return; }
            swapSlots(primarySlot(), target);
            syncPhotoControls();
            render();
        });
    }

    const tribThemeSelect = byId("p-trib-theme");
    if (tribThemeSelect) {
        tribThemeSelect.addEventListener("change", () => {
            beginChange();
            state.tribTheme = TRIB_THEMES[tribThemeSelect.value]
                ? tribThemeSelect.value : DEFAULT_TRIB_THEME;
            commit();
            render();
        });
    }

    /* The heading has its own cleaner: a run of spaces is the marker for where
       the heart goes, and cleanBlock() would collapse it away. */
    [["p-heading", "heading", cleanHeading],
     ["p-message", "message", cleanBlock],
     ["p-title", "title", cleanLine]].forEach((entry) => {
        const el = byId(entry[0]);
        if (!el) { return; }
        el.addEventListener("input", () => {
            beginChange();
            state[entry[1]] = entry[2](el.value);
            commit("trib-" + entry[1]);
        });
    });

    const hbdThemeSelect = byId("p-hbd-theme");
    if (hbdThemeSelect) {
        hbdThemeSelect.addEventListener("change", () => {
            beginChange();
            state.hbdTheme = HBD_THEMES[hbdThemeSelect.value]
                ? hbdThemeSelect.value : DEFAULT_HBD_THEME;
            commit();
            render();
        });
    }

    [["p-quote", "quote"], ["p-closing", "closing"]].forEach((pair) => {
        const el = byId(pair[0]);
        if (!el) { return; }
        el.addEventListener("input", () => {
            beginChange();
            state[pair[1]] = cleanBlock(el.value);
            commit("hbd-" + pair[1]);
        });
    });

    const annivThemeSelect = byId("p-anniv-theme");
    if (annivThemeSelect) {
        annivThemeSelect.addEventListener("change", () => {
            beginChange();
            state.annivTheme = ANNIV_THEMES[annivThemeSelect.value]
                ? annivThemeSelect.value : DEFAULT_ANNIV_THEME;
            commit();
            render();
        });
    }

    /* The heart's colour picker: the shared control from
       js/color-picker.js, the same one the mockup editor drives for a product
       colour. It owns its own nodes and reads and writes state.heartColour
       through the two callbacks; nothing about it is poster-specific except
       those.

       `heartPicker` is module-level so syncControls() can repaint it after an
       undo, which rewrites state wholesale and would otherwise leave the dot,
       the hex and both hue tracks showing the colour before the undo. */
    let heartPicker = null;

    function syncHeartPicker() {
        const hex = cleanColour(state.heartColour) || DEFAULT_HEART_COLOUR;
        const dot = byId("p-heart-dot");
        if (dot) { dot.style.backgroundColor = hex; }
        const label = byId("p-heart-hex");
        if (label) { label.textContent = hex.toUpperCase(); }
        if (heartPicker) { heartPicker.sync(); }
    }

    function initHeartPicker() {
        const trigger = byId("p-heart-trigger");
        const popover = byId("p-heart-popover");
        if (!trigger || !popover || !window.TBColor) {
            return;
        }
        heartPicker = window.TBColor.createColorPicker({
            trigger: trigger, popover: popover,
            sv: byId("p-heart-sv"), svThumb: byId("p-heart-sv-thumb"),
            hue: byId("p-heart-hue"), hueThumb: byId("p-heart-hue-thumb"),
            hueInline: byId("p-heart-strip"),
            hueInlineThumb: byId("p-heart-strip-thumb"),
            inHex: byId("p-heart-in-hex"), inR: byId("p-heart-in-r"),
            inG: byId("p-heart-in-g"), inB: byId("p-heart-in-b"),
            presets: byId("p-heart-presets")
        }, {
            getHex: () => cleanColour(state.heartColour) || DEFAULT_HEART_COLOUR,
            setHex: (hex) => {
                const next = cleanColour(hex);
                if (!next || next === state.heartColour) {
                    /* Rejected or unchanged: no history entry and no repaint.
                       The picker calls this on every pointermove. */
                    return false;
                }
                beginChange();
                state.heartColour = next;
                /* One coalesce key for the whole drag, so a sweep across the
                   hue strip is one undo rather than two hundred. */
                commit("heart-colour");
                render();
                syncHeartPicker();
                return true;
            }
        });
        heartPicker.buildPresets();
        syncHeartPicker();
    }

    initHeartPicker();

    const codePosSelect = byId("p-code-pos");
    if (codePosSelect) {
        codePosSelect.addEventListener("change", () => {
            beginChange();
            state.codePos = CODE_POSITIONS[codePosSelect.value]
                ? codePosSelect.value : DEFAULT_CODE_POS;
            commit();
            render();
        });
    }

    const playerThemeSelect = byId("p-player-theme");
    if (playerThemeSelect) {
        playerThemeSelect.addEventListener("change", () => {
            beginChange();
            state.playerTheme = PLAYER_THEMES[playerThemeSelect.value]
                ? playerThemeSelect.value : DEFAULT_PLAYER_THEME;
            commit();
            render();
        });
    }

    /* Which slots a layout actually DRAWS, in the order the card menu lists
       them. SLOT_COUNT is how long the photos array is; this is how many of
       those slots the visitor can reach on the layout in front of them, and the
       two stopped being the same number the moment the player added a scan
       code. The menu, the selection clamp and the framing controls all read it
       from here, so none of them can offer a slot this poster has no room for.

       Slot 0 is on every list: it is "the photograph" that every single-photo
       layout has always used, and switching templates is meant to carry the
       picture across rather than lose it. */
    function slotsFor(layout) {
        if (layout === "browser") {
            const out = [];
            for (let i = 0; i < GRID_SLOTS; i += 1) { out.push(i); }
            out.push(AVATAR_SLOT);
            return out;
        }
        if (layout === "player") { return [0, CODE_SLOT]; }
        if (layout === "anniversary") {
            const out = [];
            for (let i = 0; i < ANNIV_COLLAGE.length; i += 1) { out.push(annivSlot(i)); }
            out.push(CODE_SLOT);
            return out;
        }
        if (layout === "birthday") {
            const out = [];
            for (let i = 0; i < HBD_BOXES.length; i += 1) { out.push(hbdSlot(i)); }
            return out;
        }
        if (layout === "tribute") {
            const out = [];
            for (let i = 0; i < TRIB_BOXES.length; i += 1) { out.push(tribSlot(i)); }
            return out;
        }
        if (layout === "split") { return [0, 1]; }
        return [0];
    }

    /* What a slot is called, in the one place both the menu and the slider
       label read from, so they cannot disagree about which photograph the
       controls are pointing at. The layout is part of the answer: slot 0 is a
       playing card's photograph and the player's ALBUM, and a slider labelled
       "Card 1 Size" over a record sleeve names the wrong thing. */
    function slotName(i, layout) {
        const lay = layout || layoutOf(state.frame);
        if (i === AVATAR_SLOT) { return "Profile circle"; }
        if (i === CODE_SLOT) { return "Scan code"; }
        if (lay === "player") { return "Album"; }
        /* Eighteen boxes in a heart cannot be told apart by a number alone, so
           the centre one is named for what it is and the rest are counted in
           the order an upload fills them. */
        if (lay === "anniversary") {
            return i === 0 ? "Centre photo" : "Photo " + (i - ANNIV_FIRST + 2);
        }
        if (lay === "birthday") {
            return i === 0 ? "Photo 1" : "Photo " + (i - HBD_FIRST + 2);
        }
        if (lay === "tribute") {
            return i === 0 ? "Photo 1" : "Photo " + (i - TRIB_FIRST + 2);
        }
        return "Card " + (i + 1);
    }

    /* Which slot the FIRST framing slider holds: the selected one wherever this
       layout owns it, so that clicking a photograph on the preview and then
       dragging the slider move the same picture -- and the layout's first slot
       when the selection belongs to a different layout, which is what a visitor
       leaves behind every time they switch templates without touching anything.

       It answered 0 for everything but the search screen, which was right while
       every other layout had one photograph. The player has two, so selecting
       its scan code and reaching for the size slider resized the album instead.

       The split layout is the deliberate exception and still answers 0: its
       lower half has a slider of its own, and both pointing at slot 1 would be
       two controls fighting over one photograph.

       Called at event time rather than bound once, because the selection
       moves -- which is why the slider table below passes this function rather
       than a slot number. */
    function primarySlot() {
        const layout = layoutOf(state.frame);
        if (layout === "split") { return 0; }
        const slots = slotsFor(layout);
        return slots.indexOf(state.card) === -1 ? slots[0] : state.card;
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
            fillSlot(primarySlot(), null);
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

    /* The anniversary poster's own controls. The three text lines coalesce
       their history entries per field, the way the player's do, so typing a
       name is one undo rather than one per keystroke. */
    [["p-name-a", "nameA"], ["p-name-b", "nameB"], ["p-tagline", "tagline"]]
        .forEach((entry) => {
            const el = byId(entry[0]);
            if (!el) { return; }
            el.addEventListener("input", () => {
                beginChange();
                state[entry[1]] = cleanLine(el.value);
                commit("anniv-" + entry[1]);
            });
        });

    [["p-month", "month", annivClampMonth], ["p-year", "year", annivClampYear],
     ["p-day", "day", annivClampDay]].forEach((entry) => {
        const el = byId(entry[0]);
        if (!el) { return; }
        el.addEventListener("input", () => {
            beginChange();
            state[entry[1]] = entry[2](el.value);
            commit("anniv-" + entry[1]);
        });
        el.addEventListener("change", () => {
            /* On blur the field is written back from state, so a value the
               clamp moved is visible rather than left showing what was typed. */
            const v = String(state[entry[1]]);
            if (el.value !== v) { el.value = v; }
        });
    });

    const cardPick = byId("p-card-pick");
    if (cardPick) {
        cardPick.addEventListener("change", () => {
            const want = Number(cardPick.value) || 0;
            const slots = slotsFor(layoutOf(state.frame));
            state.card = slots.indexOf(want) === -1 ? slots[0] : want;
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
        /* One slider serves six cards on the search screen and two panels on
           the player, so on either it has to say which one it is holding --
           otherwise a visitor who selected card 4, or the scan code, is given a
           control labelled for a photograph they are not looking at. The split
           layout is left out on purpose: its two halves have a slider each, and
           each is already labelled for its own. */
        if (label) {
            const named = layout !== "split" && slotsFor(layout).length > 1;
            label.textContent = named
                ? slotName(slot, layout) + " Size"
                : "Photo Size";
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
            Array.prototype.forEach.call(pick.options, (o) => {
                const i = Number(o.value);
                const text = slotName(i, "browser") + (photos[i] ? "" : " (empty)");
                if (o.textContent !== text) { o.textContent = text; }
            });
        }

        /* The move menu lists every box EXCEPT the one holding the
           selection, because "swap with itself" is not an action. It is
           rebuilt rather than relabelled: which entry is missing changes every
           time the selection does, and an option list that is one item shorter
           cannot be kept in step by editing text in place.

           It reads "(empty)" the way the search screen's menu does, so moving
           a photograph into a free box and trading with an occupied one are
           told apart before the click rather than after it. */
        const swap = byId("p-anniv-swap");
        if (swap) {
            const slots = slotsFor(layout).filter((i) => i !== slot);
            const want = slots.map(
                (i) => i + "|" + slotName(i, layout) + (photos[i] ? "" : " (empty)")
            ).join(",");
            if (swap.getAttribute("data-built") !== want) {
                swap.setAttribute("data-built", want);
                swap.replaceChildren();
                const head = document.createElement("option");
                head.value = "";
                head.textContent = photos[slot]
                    ? "Move it to..."
                    : "Nothing selected to move";
                swap.appendChild(head);
                slots.forEach((i) => {
                    const o = document.createElement("option");
                    o.value = String(i);
                    o.textContent = slotName(i, layout) + (photos[i] ? "" : " (empty)");
                    swap.appendChild(o);
                });
            }
            swap.value = "";
            swap.disabled = !photos[slot];
        }

        const clear = byId("p-card-clear");
        if (clear) { clear.disabled = !grid || !photos[slot]; }
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
        /* The player keeps the single Photo Upload: its album IS slot 0, so the
           control that fills slot 0 everywhere else is the right one here. */
        if (photoFields) { photoFields.hidden = grid; }

        const player = style.layout === "player";
        const playerFields = byId("p-player-fields");
        if (playerFields) { playerFields.hidden = !player; }

        const anniv = style.layout === "anniversary";
        const annivFields = byId("p-anniv-fields");
        if (annivFields) { annivFields.hidden = !anniv; }

        const hbd = style.layout === "birthday";
        const hbdFields = byId("p-hbd-fields");
        if (hbdFields) { hbdFields.hidden = !hbd; }

        const trib = style.layout === "tribute";
        const tribFields = byId("p-trib-fields");
        if (tribFields) { tribFields.hidden = !trib; }

        /* One calendar block for both posters, shown whenever either is open.
           The YEAR is the awkward one: the anniversary poster prints it beside
           the month and this one does not print it at all, so on the birthday
           poster a control that reshapes the grid changes nothing a visitor can
           see. The hint says so rather than leaving them to find out. */
        const calFields = byId("p-calendar-fields");
        if (calFields) { calFields.hidden = !anniv && !hbd && !trib; }
        const yearHint = byId("p-year-hint");
        if (yearHint) {
            yearHint.textContent = (hbd || trib)
                ? "The year sets which weekday the month opens on. This poster prints the month name only, so changing the year moves the dates without showing you a year."
                : "The year sets which weekday the month opens on, and is printed beside the month name.";
        }
        /* The scan code is shared: the music poster and this one both carry
           one, so its control belongs to neither block. */
        const codeFields = byId("p-code-fields");
        if (codeFields) { codeFields.hidden = !player && !anniv; }
        /* The collage takes a batch, so it uses the multi-file input rather
           than the single Photo Upload -- the same swap the search screen
           makes, for the same reason.

           The BATCH input is what they share, and nothing else. It used to sit
           inside #p-grid-fields, so showing it here showed the search screen's
           Profile Photo, Selected Photo, Search Text and Screen Mode as well:
           four controls that do nothing on a collage, and the last of them
           with the same name as the poster's own colourway select further down
           the panel. A visitor reached the first Screen Mode they saw and it
           did nothing. The two blocks are separate now, and #p-grid-fields is
           gated on the search screen alone, above. */
        const batchFields = byId("p-batch-fields");
        if (batchFields) {
            batchFields.hidden = !grid && !anniv && !hbd && !trib;
        }
        if (photoFields) { photoFields.hidden = grid || anniv || hbd || trib; }

        [["p-name-a", "nameA"], ["p-name-b", "nameB"],
         ["p-tagline", "tagline"]].forEach((entry) => {
            const el = byId(entry[0]);
            if (el && el.value !== state[entry[1]]) { el.value = state[entry[1]]; }
        });
        const monthSel = byId("p-month");
        if (monthSel && monthSel.value !== String(state.month)) {
            monthSel.value = String(state.month);
        }
        [["p-year", "year"], ["p-day", "day"]].forEach((entry) => {
            const el = byId(entry[0]);
            if (el && el.value !== String(state[entry[1]])) {
                el.value = String(state[entry[1]]);
            }
        });
        [["p-song", "song"], ["p-artist", "artist"],
         ["p-elapsed", "elapsed"], ["p-total", "total"],
         ["p-caption-head", "captionHead"],
         ["p-caption-body", "captionBody"]].forEach((entry) => {
            const el = byId(entry[0]);
            /* Compared before writing: assigning .value to what it already
               holds still drops the caret to the end of the field mid-word. */
            if (el && el.value !== state[entry[1]]) { el.value = state[entry[1]]; }
        });
        const pt = byId("p-player-theme");
        if (pt) { pt.value = state.playerTheme; }
        const cp = byId("p-code-pos");
        if (cp) { cp.value = codePos(); }
        syncHeartPicker();
        const at = byId("p-anniv-theme");
        if (at) { at.value = state.annivTheme; }
        const ht = byId("p-hbd-theme");
        if (ht) { ht.value = state.hbdTheme; }
        const tt = byId("p-trib-theme");
        if (tt) { tt.value = state.tribTheme; }
        [["p-heading", "heading"], ["p-message", "message"],
         ["p-title", "title"]].forEach((pair) => {
            const el = byId(pair[0]);
            if (el && el.value !== state[pair[1]]) { el.value = state[pair[1]]; }
        });
        [["p-quote", "quote"], ["p-closing", "closing"]].forEach((pair) => {
            const el = byId(pair[0]);
            /* Compared before writing: assigning .value to what it already
               holds still drops the caret to the end of the field mid-word. */
            if (el && el.value !== state[pair[1]]) { el.value = state[pair[1]]; }
        });

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
    function artSVG(art, x, y, w, h, theme) {
        const v = art.view;
        const ink = (theme || screenTheme())[art.ink];
        const t = "translate(" + x + " " + y + ") scale(" + (w / v[2]) + " " + (h / v[3]) +
            ") translate(" + (-v[0]) + " " + (-v[1]) + ")";
        return '<g transform="' + t + '">' + art.parts.map((p) => '<path d="' + p.d + '"' +
            (p.stroke
                ? ' fill="none" stroke="' + ink + '" stroke-width="' + p.width + '"'
                : ' fill="' + ink + '"' + (p.rule ? ' fill-rule="' + p.rule + '"' : "")) +
            "/>").join("") + "</g>";
    }

    /* SVG twin of paintPlayer(). Reads playerScale(), albumRect(), codeRect()
       and playedFraction() -- the same four the canvas reads -- so the knob
       cannot land at one fraction here and another there, and the two boxes
       cannot be derived twice.

       Both photographs need a real clip: a zoomed one is larger than the box it
       fills, and preserveAspectRatio is not doing the cropping. */
    function playerSVG(W, H, esc) {
        const s = playerScale(W, H);
        const P = PLAYER;
        const ink = playerTheme();
        const album = albumRect(W, H);
        const code = codeRect(W, H);
        const flow = playerFlow();
        const dy = flow.shift * s.fy;
        const family = esc(fontStack(SCREEN_FONT).replace(/"/g, "'"));

        let defs = "";
        if (photos[0]) {
            defs += '<clipPath id="tb-player-album"><rect x="' + album.x + '" y="' + album.y +
                '" width="' + album.w + '" height="' + album.h +
                '" rx="' + album.r + '"/></clipPath>';
        }
        if (photos[CODE_SLOT]) {
            defs += '<clipPath id="tb-player-code"><rect x="' + code.x + '" y="' + code.y +
                '" width="' + code.w + '" height="' + code.h + '"/></clipPath>';
        }

        let out = '<rect width="' + W + '" height="' + H + '" fill="' + ink.page + '"/>';
        if (defs) { out += "<defs>" + defs + "</defs>"; }

        const albumBox = 'x="' + album.x + '" y="' + album.y + '" width="' + album.w +
            '" height="' + album.h + '" rx="' + album.r + '"';
        if (photos[0]) {
            out += '<g clip-path="url(#tb-player-album)">' +
                photoImageSVG(photos[0], state.views[0], album.x, album.y, album.w, album.h) +
                "</g>";
        } else if (ink.albumFill) {
            out += "<rect " + albumBox + ' fill="' + ink.albumFill + '"/>';
        } else {
            out += "<rect " + albumBox + ' fill="none" stroke="' + ink.albumStroke +
                '" stroke-width="' + (P.album.stroke * s.fx) + '"/>';
        }

        out += artSVG(PLAYER_ART.chevron, 0, 0, W, H, ink);
        out += artSVG(PLAYER_ART.transport, 0, dy, W, H, ink);

        P.dots.y.forEach((cy) => {
            out += '<circle cx="' + (P.dots.cx * s.fx) + '" cy="' + (cy * s.fy) +
                '" r="' + (P.dots.r * s.fx) + '" fill="' + ink.ink + '"/>';
        });

        out += '<circle cx="' + (P.play.cx * s.fx) + '" cy="' +
            (P.play.cy * s.fy + dy) + '" r="' + (P.play.r * s.fx) +
            '" fill="' + ink.ink + '"/>';
        out += artSVG(PLAYER_ART.playIcon, 0, dy, W, H, ink);
        out += artSVG(PLAYER_ART.heart, 0, dy, W, H, ink);

        /* Measured on the live canvas context, because there is nothing in an
           SVG string to measure with -- and it has to be the SAME number the
           canvas used or a long title collides with the heart here and not
           there. */
        if (state.song) {
            const size = fitLine(ctx, state.song, P.title.size * s.fx,
                (P.title.right - P.title.x) * s.fx, "700");
            out += '<text x="' + (P.title.x * s.fx) + '" y="' +
                (P.title.baseline * s.fy + dy) +
                '" font-family="' + family + '" font-size="' + size +
                '" font-weight="700" fill="' + ink.ink + '">' + esc(state.song) + "</text>";
        }
        if (state.artist) {
            const size = fitLine(ctx, state.artist, P.artist.size * s.fx,
                (P.artist.right - P.artist.x) * s.fx, "400");
            out += '<text x="' + (P.artist.x * s.fx) + '" y="' +
                (P.artist.baseline * s.fy + dy) +
                '" font-family="' + family + '" font-size="' + size +
                '" fill="' + ink.ink + '">' + esc(state.artist) + "</text>";
        }

        const x1 = P.track.x1 * s.fx;
        const x2 = P.track.x2 * s.fx;
        const ty = P.track.y * s.fy + dy;
        const played = x1 + (x2 - x1) * playedFraction();
        const lineAttrs = ' stroke="' + ink.ink + '" stroke-width="' + (P.track.width * s.fx) +
            '" stroke-linecap="round"';
        out += '<line x1="' + x1 + '" y1="' + ty + '" x2="' + x2 + '" y2="' + ty + '"' +
            lineAttrs + ' stroke-opacity="' + P.track.dim + '"/>';
        out += '<line x1="' + x1 + '" y1="' + ty + '" x2="' + played + '" y2="' + ty + '"' +
            lineAttrs + "/>";
        out += '<circle cx="' + played + '" cy="' + ty + '" r="' + (P.knob.r * s.fx) +
            '" fill="' + ink.ink + '"/>';

        /* The artwork's horizontal condense, as a transform rather than a
           narrower face -- the same thing scale(0.87 1) does in the source. */
        const timeAt = (text, xPt) => {
            if (!text) { return ""; }
            return '<text x="0" y="0" transform="translate(' + (xPt * s.fx) + " " +
                (P.time.baseline * s.fy + dy) + ") scale(" + P.time.squeeze + ' 1)"' +
                ' font-family="' + family + '" font-size="' + (P.time.size * s.fx) +
                '" fill="' + ink.ink + '">' + esc(text) + "</text>";
        };
        out += timeAt(state.elapsed, P.time.leftX);
        out += timeAt(state.total, P.time.rightX);

        /* The caption, measured on the live canvas context for the same reason
           the title is: fitLine() has to return the SAME number in both
           painters or a long line sets smaller in one of them. */
        const cap = P.caption;
        const capWidth = (cap.right - cap.x) * s.fx;
        const capLine = (text, baseline, px, weight) => {
            if (!text) { return ""; }
            const size = fitLine(ctx, text, px * s.fx, capWidth, weight);
            return '<text x="' + (cap.x * s.fx) + '" y="' + (baseline * s.fy) +
                '" font-family="' + family + '" font-size="' + size +
                '" font-weight="' + weight + '" fill="' + ink.ink + '">' +
                esc(text) + "</text>";
        };
        out += capLine(state.captionHead, flow.headBaseline, cap.headSize, "700");
        out += capLine(state.captionBody, flow.bodyBaseline, cap.bodySize, "400");

        if (photos[CODE_SLOT]) {
            out += '<g clip-path="url(#tb-player-code)">' +
                photoImageSVG(photos[CODE_SLOT], state.views[CODE_SLOT],
                    code.x, code.y, code.w, code.h) + "</g>";
        }

        return out;
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
        } else if (frame.layout === "player") {
            body += playerSVG(W, H, esc);
        } else if (frame.layout === "anniversary") {
            body += anniversarySVG(W, H, esc);
        } else if (frame.layout === "birthday") {
            body += birthdaySVG(W, H, esc);
        } else if (frame.layout === "tribute") {
            body += tributeSVG(W, H, esc);
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
        const tribTheme2 = byId("p-trib-theme");
        if (tribTheme2 && !tribTheme2.options.length) {
            Object.keys(TRIB_THEMES).forEach((k) => {
                const o = document.createElement("option");
                o.value = k;
                o.textContent = TRIB_THEMES[k].label;
                tribTheme2.appendChild(o);
            });
        }
        const hbdTheme2 = byId("p-hbd-theme");
        if (hbdTheme2 && !hbdTheme2.options.length) {
            Object.keys(HBD_THEMES).forEach((k) => {
                const o = document.createElement("option");
                o.value = k;
                o.textContent = HBD_THEMES[k].label;
                hbdTheme2.appendChild(o);
            });
        }
        const annivTheme2 = byId("p-anniv-theme");
        if (annivTheme2 && !annivTheme2.options.length) {
            Object.keys(ANNIV_THEMES).forEach((k) => {
                const o = document.createElement("option");
                o.value = k;
                o.textContent = ANNIV_THEMES[k].label;
                annivTheme2.appendChild(o);
            });
        }
        const codePos2 = byId("p-code-pos");
        if (codePos2 && !codePos2.options.length) {
            Object.keys(CODE_POSITIONS).forEach((k) => {
                const o = document.createElement("option");
                o.value = k;
                o.textContent = CODE_POSITIONS[k].label;
                codePos2.appendChild(o);
            });
        }
        const playerTheme2 = byId("p-player-theme");
        if (playerTheme2 && !playerTheme2.options.length) {
            Object.keys(PLAYER_THEMES).forEach((k) => {
                const o = document.createElement("option");
                o.value = k;
                o.textContent = PLAYER_THEMES[k].label;
                playerTheme2.appendChild(o);
            });
        }
        const theme = byId("p-screen-theme");
        if (theme && !theme.options.length) {
            Object.keys(SCREEN_THEMES).forEach((k) => {
                const o = document.createElement("option");
                o.value = k;
                o.textContent = SCREEN_THEMES[k].label;
                theme.appendChild(o);
            });
        }
        /* The menu belongs to the search screen alone, so it lists THAT
           layout's slots rather than every slot the photos array has room for.
           Built from SLOT_COUNT it offered a "Card 8" -- the player's scan
           code, a slot this poster never draws -- and the menu's own Remove
           button then deleted the photograph sitting in it. */
        const months = byId("p-month");
        if (months && !months.options.length) {
            ANNIV_MONTHS.forEach((name, i) => {
                const o = document.createElement("option");
                o.value = String(i);
                o.textContent = name;
                months.appendChild(o);
            });
        }

        const pick = byId("p-card-pick");
        if (pick && !pick.options.length) {
            slotsFor("browser").forEach((i) => {
                const o = document.createElement("option");
                o.value = String(i);
                o.textContent = slotName(i, "browser");
                pick.appendChild(o);
            });
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
    /* ONE call: takePreset() removes the key as it reads it, so asking twice
       gets the value and then an empty string. */
    const presetId = TB.takePreset();
    const framePreset = PRESET_ALIASES[presetId] || presetId;
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
