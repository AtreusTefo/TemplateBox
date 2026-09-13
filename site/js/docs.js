/* ==========================================================================
   TemplateBox - Business Document Builder Core Logic
   Covers seven documents from one form and one state object: rent receipt,
   cash payment receipt, itemized business receipt, sales and cash receipt
   form, professional invoice, ruled invoice with logo, and employee warning
   notice.
   Responsibilities: document-type switching, real-time localStorage binding,
   repeating line items, automatic totals and amount-in-words, a local logo
   upload, safe textContent preview rendering, and client-side PDF
   compilation via the jsPDF native text API.
   Depends on: js/app.js (TB.sanitize, TB.desanitize, TB.storageGet/Set,
   TB.takePreset)
   ========================================================================== */

"use strict";

(() => {

    const STORAGE_KEY = "tb_docs_v1";

    /* ----------------------------------------------------------------------
       Document catalog. `layout` selects which renderer and PDF writer runs;
       `labels` re-words the shared form and preview for each document so a
       rent receipt says "Received From" where an invoice says "Billed To".
       ---------------------------------------------------------------------- */
    const DOC_TYPES = {
        "rent-receipt": {
            layout: "receipt",
            heading: "RENT RECEIPT",
            file: "rent-receipt",
            labels: {
                issuerLegend: "Landlord or Property Manager",
                issuerName: "Landlord / Property Manager",
                recipientLegend: "Tenant",
                recipientName: "Received From (Tenant)",
                docNumber: "Receipt No.",
                docDate: "Date Received",
                purpose: "For Rent Of (Property)",
                note: "Footer Message"
            }
        },
        "payment-receipt": {
            layout: "receipt",
            heading: "PAYMENT RECEIPT",
            file: "payment-receipt",
            labels: {
                issuerLegend: "Issued By",
                issuerName: "Business or Individual Name",
                recipientLegend: "Payer",
                recipientName: "Received From",
                docNumber: "Receipt No.",
                docDate: "Date Received",
                purpose: "Payment For",
                note: "Footer Message"
            }
        },
        "business-receipt": {
            layout: "itemized",
            heading: "RECEIPT",
            file: "business-receipt",
            labels: {
                issuerLegend: "Sent By (Your Business)",
                issuerName: "Your Company Name",
                recipientLegend: "Billed To (Customer)",
                recipientName: "Customer Name",
                docNumber: "Receipt No.",
                docDate: "Receipt Date",
                paid: "Amount Paid",
                note: "Footer Message"
            }
        },
        "sales-receipt": {
            layout: "itemized",
            heading: "SALES RECEIPT",
            file: "sales-receipt",
            labels: {
                issuerLegend: "Sold By",
                issuerName: "Store or Business Name",
                recipientLegend: "Sold To",
                recipientName: "Customer Name",
                docNumber: "Sale No.",
                docDate: "Sale Date",
                paid: "Cash Tendered",
                note: "Footer Message"
            }
        },
        "invoice": {
            layout: "itemized",
            heading: "INVOICE",
            file: "invoice",
            labels: {
                issuerLegend: "From (Your Business)",
                issuerName: "Your Company Name",
                recipientLegend: "Bill To (Client)",
                recipientName: "Client Name",
                docNumber: "Invoice No.",
                docDate: "Invoice Date",
                paid: "Amount Already Paid",
                note: "Footer Message"
            }
        },
        /* The ruled invoice (September 9, 2026). Same money model as
           "invoice" above and deliberately so -- it is a second SHEET, not a
           second set of arithmetic. What it adds is a visitor-uploaded logo,
           a per-row date column and an icon contact strip, and what it drops
           is the issuer address block: on this layout the business appears
           once as a wordmark beside its logo, and its contact details sit in
           the footer strip instead. */
        "logo-invoice": {
            layout: "ruled-invoice",
            heading: "INVOICE",
            file: "logo-invoice",
            labels: {
                issuerLegend: "Your Business",
                issuerName: "Business Name (shown as the wordmark)",
                recipientLegend: "Bill To",
                recipientName: "Bill to",
                docNumber: "No. Invoice",
                docDate: "Date",
                paid: "Amount Already Paid",
                note: "Closing Line"
            }
        },
        /* The trade counter receipt (September 11, 2026). Traced from a
           supplied A4 artwork: a parts-counter receipt that carries the
           seller's bank details on its face, so a customer paying later knows
           where to send the money.

           Same money model as every other itemised type and deliberately so --
           it is a fifth SHEET, not a fifth set of arithmetic. What it adds is
           the account block, a five-column ruled grid whose last column is the
           currency's minor unit, and a terms list. What it drops is the
           discount row and the amount-paid row, neither of which the artwork
           has anywhere to put. */
        "trade-receipt": {
            layout: "trade-receipt",
            heading: "RECEIPT",
            file: "trade-receipt",
            labels: {
                issuerLegend: "Your Business",
                issuerName: "Business Name",
                recipientLegend: "Customer",
                recipientName: "Client",
                docNumber: "Receipt No.",
                docDate: "Date",
                note: "Footer Message"
            }
        },
        "warning-notice": {
            layout: "notice",
            heading: "EMPLOYEE WARNING NOTICE",
            file: "employee-warning-notice",
            labels: {
                issuerLegend: "Employer",
                issuerName: "Company Name",
                recipientLegend: "Employee",
                recipientName: "Employee Name",
                docNumber: "Notice No.",
                docDate: "Date of Notice",
                note: "Closing Statement"
            }
        }
    };

    const DEFAULT_TYPE = "rent-receipt";

    /* Currency table. `symbol` is used on screen; `pdf` is used inside the
       exported PDF because jsPDF's built-in fonts are WinAnsi encoded and
       cannot render the rupee, naira or cedi glyphs - those fall back to a
       plain ASCII prefix instead of printing as blank boxes. */
    const CURRENCIES = {
        USD: { symbol: "$", pdf: "$", major: "dollars", minor: "cents", decimals: 2 },
        BWP: { symbol: "P", pdf: "P", major: "pulas", minor: "cents", decimals: 2 },
        EUR: { symbol: "€", pdf: "€", major: "euros", minor: "cents", decimals: 2 },
        GBP: { symbol: "£", pdf: "£", major: "pounds", minor: "pence", decimals: 2 },
        CAD: { symbol: "CA$", pdf: "CA$", major: "dollars", minor: "cents", decimals: 2 },
        AUD: { symbol: "A$", pdf: "A$", major: "dollars", minor: "cents", decimals: 2 },
        INR: { symbol: "₹", pdf: "Rs. ", major: "rupees", minor: "paise", decimals: 2 },
        NGN: { symbol: "₦", pdf: "NGN ", major: "naira", minor: "kobo", decimals: 2 },
        GHS: { symbol: "₵", pdf: "GHS ", major: "cedis", minor: "pesewas", decimals: 2 },
        KES: { symbol: "KSh ", pdf: "KSh ", major: "shillings", minor: "cents", decimals: 2 },
        ZAR: { symbol: "R", pdf: "R", major: "rand", minor: "cents", decimals: 2 },
        JPY: { symbol: "¥", pdf: "¥", major: "yen", minor: "sen", decimals: 0 }
    };

    const PAYMENT_METHODS = [
        { key: "cash", label: "Cash" },
        { key: "check", label: "Check" },
        { key: "card", label: "Credit / Debit Card" },
        { key: "transfer", label: "Bank Transfer" },
        { key: "mobile", label: "Mobile Money" },
        { key: "other", label: "Other" }
    ];

    const VIOLATIONS = [
        { key: "attendance", label: "Attendance or Tardiness" },
        { key: "performance", label: "Poor Work Performance" },
        { key: "policy", label: "Violation of Company Policy" },
        { key: "insubordination", label: "Insubordination" },
        { key: "safety", label: "Safety Violation" },
        { key: "conduct", label: "Unacceptable Conduct" },
        { key: "damage", label: "Damage or Loss of Property" },
        { key: "other", label: "Other" }
    ];

    const WARNING_LEVELS = [
        "Verbal Warning",
        "First Written Warning",
        "Second Written Warning",
        "Final Written Warning"
    ];

    /* ----------------------------------------------------------------------
       Contact-strip icons for the ruled invoice: Material Symbols outlines,
       kept as path data rather than as files under site/assets/.

       ONE copy, because two consumers need the same geometry -- the sheet
       draws it as an inline <svg> and the PDF has to draw it as a bitmap,
       jsPDF's built-in faces having no handset, envelope or globe glyph. A
       file plus a constant would be two sources of truth for one shape.

       The viewBox is "0 -960 960 960" and the NEGATIVE Y ORIGIN is the whole
       trap: the glyph occupies y = -960..0, so a canvas draw that does not
       translate down by 960 first puts every icon entirely off the surface
       and silently produces three blank images. See iconPng() below.
       ---------------------------------------------------------------------- */
    const ICON_VIEWBOX = "0 -960 960 960";
    const ICONS = {
        phone: "M798-120q-125 0-247-54.5T329-329Q229-429 174.5-551T120-798q0-18 12-30t30-12h162q14 0 25 9.5t13 22.5l26 140q2 16-1 27t-11 19l-97 98q20 37 47.5 71.5T387-386q31 31 65 57.5t72 48.5l94-94q9-9 23.5-13.5T670-390l138 28q14 4 23 14.5t9 23.5v162q0 18-12 30t-30 12ZM241-600l66-66-17-94h-89q5 41 14 81t26 79Zm358 358q39 17 79.5 27t81.5 13v-88l-94-19-67 67ZM241-600Zm358 358Z",
        mail: "M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm320-280L160-640v400h640v-400L480-440Zm0-80 320-200H160l320 200ZM160-640v-80 480-400Z",
        globe: "M325-111.5q-73-31.5-127.5-86t-86-127.5Q80-398 80-480.5t31.5-155q31.5-72.5 86-127t127.5-86Q398-880 480.5-880t155 31.5q72.5 31.5 127 86t86 127Q880-563 880-480.5T848.5-325q-31.5 73-86 127.5t-127 86Q563-80 480.5-80T325-111.5ZM480-162q26-36 45-75t31-83H404q12 44 31 83t45 75Zm-104-16q-18-33-31.5-68.5T322-320H204q29 50 72.5 87t99.5 55Zm208 0q56-18 99.5-55t72.5-87H638q-9 38-22.5 73.5T584-178ZM170-400h136q-3-20-4.5-39.5T300-480q0-21 1.5-40.5T306-560H170q-5 20-7.5 39.5T160-480q0 21 2.5 40.5T170-400Zm216 0h188q3-20 4.5-39.5T580-480q0-21-1.5-40.5T574-560H386q-3 20-4.5 39.5T380-480q0 21 1.5 40.5T386-400Zm268 0h136q5-20 7.5-39.5T800-480q0-21-2.5-40.5T790-560H654q3 20 4.5 39.5T660-480q0 21-1.5 40.5T654-400Zm-16-240h118q-29-50-72.5-87T584-782q18 33 31.5 68.5T638-640Zm-234 0h152q-12-44-31-83t-45-75q-26 36-45 75t-31 83Zm-200 0h118q9-38 22.5-73.5T376-782q-56 18-99.5 55T204-640Z"
    };

    /* The ruled invoice's grid is a printed form before it is a report: it
       always draws at least this many body rows, filled or not, so a
       half-completed invoice still looks like the template it came from. */
    const RULED_MIN_ROWS = 8;
    const RULED_COLUMNS = ["Date", "Item Description", "Price", "Qty", "Total"];
    /* Proportions of the table width, in the order above. */
    const RULED_WIDTHS = [0.13, 0.39, 0.17, 0.11, 0.20];

    /* The trade counter receipt (September 11, 2026). A fifth sheet, traced
       from a supplied A4 artwork whose own units are POINTS -- 595.28 x 841.89
       is exactly 210 x 297mm, so every figure below was converted once, here,
       and is held in the millimetres the rest of this file works in.

       The artwork's table spans x 45.40 to 546.65 points. Its left and right
       edges land on 16.02mm and 192.84mm against this page's 16mm margins, so
       they are squared up to the margins rather than kept: the difference is
       under a fifth of a millimetre and keeping it would mean this one sheet
       disagreeing with every other about where the page begins. The same is
       NOT done to the artwork's top margin, which is a real 10mm against the
       others' 16 and is part of how the form looks.

       Thirteen rows, because that is what the artwork draws. Its own rows are
       hand-placed and do not share a pitch -- ten are rects of 19.5pt at tops
       that drift, three are not rects at all, and the first measures 20.99 --
       so they are laid out here on ONE pitch across the same span. Copying
       thirteen hand positions would reproduce a wobble nobody intended. */
    const TRADE_MIN_ROWS = 13;

    /* Two of the artwork's five columns carry no heading at all. They are not
       decoration and both are named here, because a column a visitor cannot
       name is a column they will not fill.

       The evidence is in the totals: those three boxes span the LAST TWO
       columns and are divided at the same x the Amount column is divided at,
       while the 82.40pt column before Amount does not appear in them at all.
       A column that is not totalled is a unit price; a narrow column that
       carries the division through the totals is the currency's minor unit,
       which is what lets handwritten figures line up on the decimal point on a
       form that is meant to be completed by hand. */
    const TRADE_COLUMNS = ["Quantity", "Descriptions", "Price", "Amount", ""];
    /* 82.44, 212.11, 82.40, 82.74 and 41.56 points over a 501.25pt table. */
    const TRADE_WIDTHS = [0.1645, 0.4232, 0.1644, 0.1650, 0.0829];

    /* Seven fixed labels with a field each. Deliberately NOT the free-text
       bankDetails textarea the invoice types use: on this sheet the labels are
       printed furniture in a ruled block, and a visitor typing their own seven
       lines would lose the alignment the block is made of. */
    const TRADE_ACCOUNT_ROWS = [
        { label: "Account Name", bind: "acctName" },
        { label: "Bank Name", bind: "bankName" },
        { label: "Account Number", bind: "acctNumber" },
        { label: "Branch Name", bind: "branchName" },
        { label: "Branch Code", bind: "branchCode" },
        { label: "Swift Code", bind: "swiftCode" },
        { label: "Bank Address", bind: "bankAddress" }
    ];

    /* The artwork's own palette. #231F20 rather than #000000 is what the
       master file states, and it is the same rich black poster.js already uses
       for the music player's ground. The greens in the source belong to a
       logo this template does not draw, so they are not here. */
    const TRADE_INK = "#231F20";
    const TRADE_CREAM = "#F0E8CD";
    const TRADE_GREY = "#DBD9D9";
    const TRADE_RED = "#B92025";

    /* The footer band, in ONE place because two painters draw it. The preview
       builds an SVG from these paths; the PDF writer runs the same curves
       through jsPDF. A decorative shape is exactly where a second, hand-copied
       set of coordinates would drift without anything noticing.

       Coordinates are a 600 x 60 box that both painters scale to their own
       width, which is why the preview sets preserveAspectRatio="none". Three
       sweeps, back to front: a grey-to-black wash, a black mass rising to the
       right, and the red curve over both. */
    const TRADE_BAND = {
        w: 600,
        h: 60,
        gradients: [
            { id: "tb-band-wash", stops: [["0", "#FFFFFF"], ["0.55", "#9A9A9A"], ["1", "#231F20"]] },
            { id: "tb-band-dark", stops: [["0", "#6B6B66"], ["1", "#231F20"]] }
        ],
        /* Each sweep starts at `from`, runs the cubics in `curves` as
           [c1x, c1y, c2x, c2y, endx, endy], then closes through `then`.
           `fill` paints the screen, `pdfFill` the page -- see the note at the
           PDF call site for why those differ. */
        sweeps: [
            {
                fill: "url(#tb-band-wash)", pdfFill: "#8A8A88",
                from: [0, 46],
                curves: [[160, 26, 350, 14, 600, 7]],
                then: [[600, 60], [0, 60]]
            },
            {
                fill: "url(#tb-band-dark)", pdfFill: "#231F20",
                from: [205, 60],
                curves: [[345, 30, 465, 13, 600, 5]],
                then: [[600, 60]]
            },
            {
                fill: "#B92025", pdfFill: "#B92025",
                from: [0, 38],
                curves: [[150, 17, 340, 5, 600, 0]],
                then: [[600, 12]],
                tail: [[340, 17, 150, 29, 0, 50]]
            }
        ]
    };

    /* The SVG `d` for one sweep, generated rather than written out, so the
       numbers above are the only place the shape exists. */
    function tradeBandPath(sweep) {
        const parts = ["M" + sweep.from[0] + "," + sweep.from[1]];
        sweep.curves.forEach((c) => {
            parts.push("C" + c[0] + "," + c[1] + " " + c[2] + "," + c[3] + " " + c[4] + "," + c[5]);
        });
        (sweep.then || []).forEach((p) => {
            parts.push("L" + p[0] + "," + p[1]);
        });
        (sweep.tail || []).forEach((c) => {
            parts.push("C" + c[0] + "," + c[1] + " " + c[2] + "," + c[3] + " " + c[4] + "," + c[5]);
        });
        parts.push("Z");
        return parts.join(" ");
    }

    /* The same sweeps through jsPDF, which takes a start point and then
       segments RELATIVE to the point before them -- so the absolute
       coordinates above are differenced here rather than being held twice.

       doc.lines() wants [dx, dy] for a line and
       [dc1x, dc1y, dc2x, dc2y, dex, dey] for a cubic, every one of them
       measured from the START of that segment, which is the part that is easy
       to get wrong and impossible to see afterwards. */
    function drawTradeBand(doc, x, y, w, h) {
        const sx = w / TRADE_BAND.w;
        const sy = h / TRADE_BAND.h;
        TRADE_BAND.sweeps.forEach((sweep) => {
            const segments = [];
            let cx = sweep.from[0];
            let cy = sweep.from[1];
            const curve = (c) => {
                segments.push([
                    (c[0] - cx) * sx, (c[1] - cy) * sy,
                    (c[2] - cx) * sx, (c[3] - cy) * sy,
                    (c[4] - cx) * sx, (c[5] - cy) * sy
                ]);
                cx = c[4];
                cy = c[5];
            };
            sweep.curves.forEach(curve);
            (sweep.then || []).forEach((p) => {
                segments.push([(p[0] - cx) * sx, (p[1] - cy) * sy]);
                cx = p[0];
                cy = p[1];
            });
            (sweep.tail || []).forEach(curve);
            const rgb = [
                parseInt(sweep.pdfFill.slice(1, 3), 16),
                parseInt(sweep.pdfFill.slice(3, 5), 16),
                parseInt(sweep.pdfFill.slice(5, 7), 16)
            ];
            doc.setFillColor(rgb[0], rgb[1], rgb[2]);
            doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
            doc.lines(segments, x + sweep.from[0] * sx, y + sweep.from[1] * sy,
                [1, 1], "F", true);
        });
    }

    /* The artwork opens its terms with a line introducing the numbered clauses,
       and sets the whole block in capitals. Both are part of how that corner of
       the sheet reads, so both are here -- as DEFAULTS, in wording of our own.
       The source's five clauses are that company's policy and are not copied:
       the shape of a counter returns policy is not anybody's property, the
       sentences are. */
    const TRADE_TERMS_INTRO = "PLEASE NOTE THAT ALL GOODS SHOULD BE:";

    const TRADE_TERMS_DEFAULT = [
        "RETURNED WITHIN 7 DAYS OF PURCHASE.",
        "ACCOMPANIED BY THE ORIGINAL PROOF OF PURCHASE.",
        "UNDAMAGED AND UNUSED.",
        "IN THEIR ORIGINAL PACKAGING.",
        "SUBJECT TO A HANDLING FEE WHERE ONE APPLIES."
    ].join("\n");

    /* Uploaded logo. Downscaled to this longest edge before storage: a
       wordmark or a badge needs no more, and the encoded string is what has
       to fit alongside the visitor's typing in one localStorage record. */
    const LOGO_MAX_EDGE = 320;
    /* Read back from storage as untrusted input. Only a base64 raster is
       accepted; an SVG data URI is a script vector and must produce a sheet
       and an export identical to having no logo at all. */
    const LOGO_URI = /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+=*$/;

    const DEFAULT_ACCENT = "#1A1A1A";
    const DEFAULT_DOC_NAME = "Untitled document";

    const form = document.getElementById("docs-form");
    const sheet = document.getElementById("doc-sheet");
    if (!form || !sheet) {
        return;
    }

    /* ----------------------------------------------------------------------
       The document type for this session (August 11, 2026).

       This used to be a visible <select> in the form, and that select WAS the
       runtime source of truth: collectState() read its value on every
       keystroke. The control was removed because it undermined the funnel it
       sits at the end of -- seven catalog cards and seven landing pages exist to
       route a visitor to one document before the editor opens, and a free
       switcher inside the editor turned that into "one form, pick whatever",
       which is the argument for a single generic Documents entry instead.

       So the type is now resolved ONCE, on arrival, and is fixed for the
       session. Deliberately no replacement control: any in-editor switcher
       reintroduces exactly what was removed. Changing document means going
       back to the catalog, which every editor's header already links.

       Resolution order, unchanged from what the select was initialised with:
         1. TB.takePreset()   -- a fresh arrival from a card or landing page
         2. the saved state   -- a returning visitor resuming their own work
         3. DEFAULT_TYPE      -- a direct visit to docs.html with neither
       ---------------------------------------------------------------------- */
    let sessionDocType = DEFAULT_TYPE;

    const blankToggle = document.getElementById("f-blank");
    const docNameInput = document.getElementById("doc-name");
    const itemList = document.getElementById("item-list");
    const tplItem = document.getElementById("tpl-item");
    const swatchRow = document.getElementById("swatch-row");
    const methodRow = document.getElementById("method-row");
    const violationRow = document.getElementById("violation-row");
    const wordsHint = document.getElementById("amount-words-hint");
    const logoInput = document.getElementById("f-logo");
    const logoRemove = document.getElementById("logo-remove");
    const logoError = document.getElementById("logo-error");

    let currentAccent = DEFAULT_ACCENT;

    /* The logo is not a [data-bind] control, so every sweep that walks the
       form -- collectState, Clear Form, "Start blank" -- has to be told about
       it explicitly. js/resume.js has been bitten three separate times by
       exactly this, always by a field that is not an input. */
    let currentLogo = "";
    let currentLogoRatio = 0;

    /* ----------------------------------------------------------------------
       Value helpers
       ---------------------------------------------------------------------- */

    /* Parses a bound numeric field, rejecting NaN, Infinity and negatives so
       a pasted or tampered value can never invert a total. */
    function num(value) {
        const parsed = parseFloat(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    }

    function currencyOf(state) {
        return CURRENCIES[state.fields.currency] || CURRENCIES.USD;
    }

    function money(value, cur, forPdf) {
        const symbol = forPdf ? cur.pdf : cur.symbol;
        const digits = cur.decimals;
        const parts = Math.abs(value).toFixed(digits).split(".");
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        return (value < 0 ? "-" : "") + symbol + parts.join(".");
    }

    const MONTHS = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];

    /* Formats a native date input's YYYY-MM-DD value without going through
       Date parsing, which would shift the day across timezone boundaries. */
    function formatDate(iso) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
        if (!match) {
            return "";
        }
        const month = MONTHS[parseInt(match[2], 10) - 1];
        return month ? month + " " + parseInt(match[3], 10) + ", " + match[1] : "";
    }

    /* ----------------------------------------------------------------------
       Amount in words. Receipts are commonly required to spell the figure out
       as a tamper check, so the wording is generated from the number rather
       than typed by hand.
       ---------------------------------------------------------------------- */

    const ONES = ["", "one", "two", "three", "four", "five", "six", "seven",
        "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen",
        "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
    const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty",
        "seventy", "eighty", "ninety"];
    const SCALES = ["", " thousand", " million", " billion"];

    function tripletToWords(value) {
        let out = "";
        let rest = value;
        if (rest >= 100) {
            out += ONES[Math.floor(rest / 100)] + " hundred";
            rest %= 100;
            if (rest > 0) {
                out += " ";
            }
        }
        if (rest >= 20) {
            out += TENS[Math.floor(rest / 10)];
            rest %= 10;
            if (rest > 0) {
                out += "-" + ONES[rest];
            }
        } else if (rest > 0) {
            out += ONES[rest];
        }
        return out;
    }

    function integerToWords(value) {
        if (value === 0) {
            return "zero";
        }
        const groups = [];
        let rest = value;
        while (rest > 0) {
            groups.push(rest % 1000);
            rest = Math.floor(rest / 1000);
        }
        if (groups.length > SCALES.length) {
            return "";
        }
        return groups
            .map((group, index) => (group ? tripletToWords(group) + SCALES[index] : ""))
            .filter(Boolean)
            .reverse()
            .join(" ");
    }

    function amountToWords(value, cur) {
        const scaled = Math.round(value * 100);
        const major = Math.floor(scaled / 100);
        const minor = scaled % 100;
        let words = integerToWords(major);
        if (!words) {
            return "";
        }
        words += " " + cur.major;
        if (minor > 0 && cur.decimals > 0) {
            words += " and " + integerToWords(minor) + " " + cur.minor;
        }
        words += " only";
        return words.charAt(0).toUpperCase() + words.slice(1);
    }

    /* ----------------------------------------------------------------------
       State collection: sweep the live form, scrub every string through the
       sanitization firewall, then persist the snapshot to localStorage.
       ---------------------------------------------------------------------- */

    function collectChecks(container) {
        const checks = {};
        container.querySelectorAll("[data-check]").forEach((box) => {
            checks[box.getAttribute("data-check")] = box.checked === true;
        });
        return checks;
    }

    function collectItems() {
        return Array.from(itemList.querySelectorAll("[data-entry]")).map((row) => {
            const item = {};
            ["date", "description", "qty", "price"].forEach((name) => {
                const input = row.querySelector('[data-entry-field="' + name + '"]');
                item[name] = TB.sanitize(input ? input.value : "");
            });
            return item;
        });
    }

    function collectState() {
        const state = {
            /* Fixed for the session -- see sessionDocType above. Already
               validated against DOC_TYPES where it is resolved, so there is
               nothing to re-check on every keystroke. */
            docType: sessionDocType,
            accent: currentAccent,
            docName: TB.sanitize(docNameInput ? docNameInput.value : DEFAULT_DOC_NAME),
            blankForm: blankToggle.checked === true,
            /* Not collected from the form: see currentLogo above. The ratio
               travels with the image because the PDF writer is synchronous
               and cannot wait for a decode to learn the shape. */
            logo: currentLogo,
            logoRatio: currentLogoRatio,
            fields: {},
            items: collectItems(),
            methods: collectChecks(methodRow),
            violations: collectChecks(violationRow)
        };
        form.querySelectorAll("[data-bind]").forEach((input) => {
            state.fields[input.getAttribute("data-bind")] = TB.sanitize(input.value);
        });
        return state;
    }

    function persistAndRender() {
        const state = collectState();
        TB.storageSet(STORAGE_KEY, state);
        TB.markSaved();
        applyDocType(state);
        renderPreview(state);
    }

    /* ----------------------------------------------------------------------
       Totals. Discount applies before tax; the balance is what the recipient
       still owes after any amount already paid.
       ---------------------------------------------------------------------- */

    function computeTotals(state) {
        const subtotal = state.items.reduce(
            (sum, item) => sum + num(item.qty) * num(item.price), 0);
        const discount = Math.min(num(state.fields.discount), subtotal);
        const taxable = subtotal - discount;
        const taxRate = Math.min(num(state.fields.taxRate), 100);
        const tax = taxable * (taxRate / 100);
        const total = taxable + tax;
        const paid = num(state.fields.amountPaid);
        return {
            subtotal: subtotal,
            discount: discount,
            taxRate: taxRate,
            tax: tax,
            total: total,
            paid: paid,
            balance: total - paid
        };
    }

    /* ----------------------------------------------------------------------
       Document-type switching: relabel the shared form and show only the
       fieldsets and fields that belong to the selected document.
       ---------------------------------------------------------------------- */

    /* The section nav lists only the fieldsets the current document type
       shows, so it has to be rebuilt when that set changes. Guarded on the
       type actually changing: applyDocType runs on every keystroke through
       persistAndRender, and rebuilding the nav that often would be waste. */
    let navDocType = "";

    function syncFormNav(docType) {
        if (docType === navDocType) {
            return;
        }
        navDocType = docType;
        if (TB.refreshFormNav) {
            TB.refreshFormNav();
        }
    }

    function applyDocType(state) {
        const config = DOC_TYPES[state.docType];

        document.querySelectorAll("[data-for]").forEach((node) => {
            const allowed = node.getAttribute("data-for").split(/\s+/);
            node.hidden = allowed.indexOf(state.docType) === -1;
        });

        document.querySelectorAll("[data-label]").forEach((node) => {
            const key = node.getAttribute("data-label");
            if (config.labels[key]) {
                node.textContent = config.labels[key];
            }
        });

        if (wordsHint) {
            const cur = currencyOf(state);
            const words = amountToWords(num(state.fields.amount), cur);
            wordsHint.textContent = words
                ? "In words: " + words
                : "The amount in words is written out automatically.";
        }

        /* After the [data-for] toggles above, so the nav is rebuilt from the
           fieldsets this document type actually shows */
        syncFormNav(state.docType);
    }

    /* ----------------------------------------------------------------------
       Repeating line-item rows, cloned from static <template> markup.
       ---------------------------------------------------------------------- */

    function addItemRow(values) {
        const row = tplItem.content.firstElementChild.cloneNode(true);
        if (values) {
            row.querySelectorAll("[data-entry-field]").forEach((input) => {
                input.value = TB.desanitize(values[input.getAttribute("data-entry-field")] || "");
            });
        }
        row.querySelector("[data-entry-remove]").addEventListener("click", () => {
            row.remove();
            persistAndRender();
        });
        itemList.appendChild(row);
        /* The row carries a [data-for] field of its own (the ruled invoice's
           Date column), and nothing here reveals or hides it. That is
           deliberate: applyDocType sweeps `document`, not the form, and it
           runs on the next persistAndRender -- which is the very next
           statement on every path that clones a row. A per-clone guard was
           written here first and then deleted after being disabled on purpose
           and refusing to change the outcome: it could not be observed to
           fire, and at init it would have run against the DEFAULT_TYPE
           anyway, since the preset is resolved after the rows are added. */
    }

    /* ----------------------------------------------------------------------
       Logo upload. Nothing leaves the device: the file is read by FileReader,
       drawn to a canvas, and kept as a data URI in the same localStorage
       record as the typed fields.
       ---------------------------------------------------------------------- */

    /* Downscales to LOGO_MAX_EDGE and returns a PNG data URI, or "" if the
       image could not be drawn. PNG rather than JPEG deliberately: a logo
       almost always carries a transparent background, and JPEG has no alpha,
       so the same file would come back with a black box around it. */
    function prepareLogo(img) {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!w || !h) {
            return null;
        }
        const scale = Math.min(1, LOGO_MAX_EDGE / Math.max(w, h));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            return null;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return { uri: canvas.toDataURL("image/png"), ratio: w / h };
    }

    function setLogo(uri, ratio) {
        currentLogo = uri || "";
        currentLogoRatio = currentLogo && Number.isFinite(ratio) && ratio > 0 ? ratio : 0;
        if (logoRemove) {
            logoRemove.hidden = !currentLogo;
        }
        if (logoError) {
            logoError.textContent = "";
        }

        persistAndRender();

        /* TB.storageSet swallows a quota failure by design, so a logo that
           did not fit has to be detected by reading the record back. Saying
           nothing would be the worst outcome: the visitor sees it on the
           sheet, closes the tab, and it is gone with no explanation. */
        if (currentLogo && logoError) {
            const saved = TB.storageGet(STORAGE_KEY);
            if (!saved || saved.logo !== currentLogo) {
                logoError.textContent = "This logo is on the invoice and will " +
                    "export, but there was not enough room in this browser's " +
                    "storage to keep it for next time. Try a smaller image.";
            }
        }
    }

    /* Delegated, because the sheet is replaced on every keystroke and a listener
       bound to the button would go with it. */
    if (sheet) {
        sheet.addEventListener("click", (event) => {
            if (event.target.closest("[data-logo-slot]") && logoInput) {
                logoInput.click();
            }
        });
    }

    function bindLogoUpload() {
        if (!logoInput) {
            return;
        }

        logoInput.addEventListener("change", () => {
            if (logoError) {
                logoError.textContent = "";
            }
            const file = logoInput.files && logoInput.files[0];
            if (!file) {
                return;
            }
            /* Explicit mime-type parse, terminating immediately on anything
               that is not an image -- the file-upload rule in CLAUDE.md, and
               the same check js/poster.js, js/mockup.js and js/resume.js
               make. */
            if (!/^image\//.test(file.type)) {
                if (logoError) {
                    logoError.textContent = "That file is not an image. Please choose a PNG, JPG or WebP file.";
                }
                logoInput.value = "";
                return;
            }

            const reader = new FileReader();
            reader.addEventListener("load", () => {
                const img = new Image();
                img.addEventListener("load", () => {
                    const prepared = prepareLogo(img);
                    /* Cleared on every path, success included, so re-picking
                       the same file still fires change -- which is how a
                       visitor retries after an error. */
                    logoInput.value = "";
                    if (!prepared) {
                        if (logoError) {
                            logoError.textContent = "That image could not be read. Please try a different file.";
                        }
                        return;
                    }
                    setLogo(prepared.uri, prepared.ratio);
                });
                img.addEventListener("error", () => {
                    logoInput.value = "";
                    if (logoError) {
                        logoError.textContent = "That image could not be decoded. Please try a different file.";
                    }
                });
                img.src = reader.result;
            });
            reader.addEventListener("error", () => {
                logoInput.value = "";
                if (logoError) {
                    logoError.textContent = "That file could not be read. Please try a different file.";
                }
            });
            reader.readAsDataURL(file);
        });

        if (logoRemove) {
            logoRemove.addEventListener("click", () => {
                logoInput.value = "";
                setLogo("", 0);
            });
        }
    }

    /* ----------------------------------------------------------------------
       Preview rendering. Every dynamic string reaches the DOM exclusively
       through textContent, never innerHTML, closing the DOM XSS vector.
       ---------------------------------------------------------------------- */

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) {
            node.className = className;
        }
        if (text !== undefined) {
            node.textContent = text;
        }
        return node;
    }

    /* A label plus a ruled value line, the shape used across printed forms.
       An empty value still draws its line so a blank form stays writable. */
    function fieldLine(label, value, modifier) {
        const row = el("div", "dl-row" + (modifier ? " " + modifier : ""));
        row.appendChild(el("span", "dl-label", label));
        row.appendChild(el("span", "dl-value", value || ""));
        return row;
    }

    function appendLines(parent, text, className) {
        TB.desanitize(text)
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .forEach((line) => parent.appendChild(el("p", className, line)));
    }

    function ruledLines(parent, count) {
        for (let i = 0; i < count; i += 1) {
            parent.appendChild(el("div", "doc-rule-line"));
        }
    }

    function checkRow(options, checks, className) {
        const row = el("div", "doc-check-row" + (className ? " " + className : ""));
        options.forEach((option) => {
            const item = el("span", "doc-check");
            item.appendChild(el("span", "doc-check-box", checks[option.key] ? "X" : ""));
            item.appendChild(el("span", "doc-check-label", option.label));
            row.appendChild(item);
        });
        return row;
    }

    /* Party block: name plus its address/contact lines, used by every layout. */
    function partyBlock(label, name, details, state) {
        const block = el("div", "doc-party");
        block.appendChild(el("p", "doc-party-label", label));
        const value = TB.desanitize(name);
        if (value || state.blankForm) {
            block.appendChild(el("p", "doc-party-name", value || " "));
        }
        appendLines(block, details, "doc-party-line");
        return block;
    }

    /* --- Layout 1: rent and cash payment receipts ------------------------ */

    function renderReceipt(state) {
        const config = DOC_TYPES[state.docType];
        const cur = currencyOf(state);
        const f = state.fields;
        const d = TB.desanitize;
        const blank = state.blankForm;
        const amount = num(f.amount);

        const head = el("div", "doc-masthead");
        if (d(f.issuerName) || blank) {
            head.appendChild(el("p", "doc-brand", d(f.issuerName)));
        }
        appendLines(head, f.issuerDetails, "doc-brand-line");
        sheet.appendChild(head);

        sheet.appendChild(el("h3", "doc-title", config.heading));

        const meta = el("div", "doc-meta-row");
        if (d(f.docNumber) || blank) {
            meta.appendChild(fieldLine(config.labels.docNumber, d(f.docNumber)));
        }
        meta.appendChild(fieldLine(config.labels.docDate, formatDate(f.docDate)));
        sheet.appendChild(meta);

        const body = el("div", "doc-body");

        const receivedRow = el("div", "doc-split-row");
        receivedRow.appendChild(fieldLine(config.labels.recipientName, d(f.recipientName), "grow"));
        receivedRow.appendChild(fieldLine("Amount", amount > 0 ? money(amount, cur) : "", "boxed"));
        body.appendChild(receivedRow);

        appendLines(body, f.recipientDetails, "doc-party-line");

        body.appendChild(fieldLine("Amount in Words", amountToWords(amount, cur)));

        if (d(f.purpose) || blank) {
            body.appendChild(fieldLine(config.labels.purpose, d(f.purpose)));
        }

        if (state.docType === "rent-receipt") {
            const period = [formatDate(f.periodFrom), formatDate(f.periodTo)].filter(Boolean);
            if (period.length === 2 || blank) {
                body.appendChild(fieldLine("Rental Period", period.join("  to  ")));
            }
        }

        const methodBlock = el("div", "doc-inline-block");
        methodBlock.appendChild(el("span", "dl-label", "Payment Method"));
        methodBlock.appendChild(checkRow(PAYMENT_METHODS, state.methods));
        body.appendChild(methodBlock);

        if (d(f.reference) || blank) {
            body.appendChild(fieldLine("Reference", d(f.reference)));
        }

        if (state.docType === "rent-receipt") {
            const balance = num(f.balance);
            if (balance > 0 || blank) {
                body.appendChild(fieldLine("Balance Still Due",
                    balance > 0 ? money(balance, cur) : ""));
            }
        }

        body.appendChild(fieldLine("Received By", d(f.receivedBy)));
        body.appendChild(fieldLine("Signature", ""));

        sheet.appendChild(body);

        if (d(f.note) || blank) {
            sheet.appendChild(el("p", "doc-note", d(f.note)));
        }
    }

    /* --- Layout 2: itemized receipts and invoices ------------------------ */

    function renderItemized(state) {
        const config = DOC_TYPES[state.docType];
        const cur = currencyOf(state);
        const f = state.fields;
        const d = TB.desanitize;
        const blank = state.blankForm;
        const totals = computeTotals(state);

        const head = el("div", "doc-head");
        head.appendChild(el("h3", "doc-title left", config.heading));

        const headMeta = el("div", "doc-head-meta");
        if (d(f.docNumber) || blank) {
            headMeta.appendChild(fieldLine(config.labels.docNumber, d(f.docNumber)));
        }
        headMeta.appendChild(fieldLine(config.labels.docDate, formatDate(f.docDate)));
        if (state.docType === "invoice" && (f.dueDate || blank)) {
            headMeta.appendChild(fieldLine("Due Date", formatDate(f.dueDate)));
        }
        head.appendChild(headMeta);
        sheet.appendChild(head);

        const parties = el("div", "doc-parties");
        parties.appendChild(partyBlock(config.labels.recipientLegend,
            f.recipientName, f.recipientDetails, state));
        parties.appendChild(partyBlock(config.labels.issuerLegend,
            f.issuerName, f.issuerDetails, state));
        sheet.appendChild(parties);

        /* Line-item table. A blank printable form is padded out to a fixed
           row count so there is somewhere to write; a filled-in document
           shows only the rows that actually carry data. */
        const table = el("table", "doc-table");
        const thead = document.createElement("thead");
        const headRow = document.createElement("tr");
        ["Item Description", "Qty", "Unit Price", "Total"].forEach((title, index) => {
            const cell = el("th", index > 0 ? "num" : "", title);
            headRow.appendChild(cell);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        const filled = state.items.filter((item) => d(item.description) || num(item.qty) || num(item.price));
        const rows = blank ? state.items : filled;

        rows.forEach((item) => {
            const qty = num(item.qty);
            const price = num(item.price);
            const tr = document.createElement("tr");
            tr.appendChild(el("td", "", d(item.description)));
            tr.appendChild(el("td", "num", qty ? String(qty) : ""));
            tr.appendChild(el("td", "num", price ? money(price, cur) : ""));
            tr.appendChild(el("td", "num", qty && price ? money(qty * price, cur) : ""));
            tbody.appendChild(tr);
        });

        if (!rows.length) {
            const tr = document.createElement("tr");
            const cell = el("td", "doc-table-empty", "Add a line item to build this document.");
            cell.colSpan = 4;
            tr.appendChild(cell);
            tbody.appendChild(tr);
        }

        table.appendChild(tbody);

        /* The four-column table cannot compress below a legible width, so on
           narrow viewports it scrolls inside its own container rather than
           forcing the whole page to scroll sideways. */
        const tableWrap = el("div", "doc-table-wrap");
        tableWrap.appendChild(table);
        sheet.appendChild(tableWrap);

        /* Payment methods on the left, money column on the right */
        const summary = el("div", "doc-summary");

        const left = el("div", "doc-summary-left");
        left.appendChild(el("p", "doc-party-label", "Payment Method"));
        left.appendChild(checkRow(PAYMENT_METHODS, state.methods, "stacked"));
        if (d(f.reference) || blank) {
            left.appendChild(fieldLine("Reference", d(f.reference)));
        }
        summary.appendChild(left);

        const right = el("div", "doc-totals");
        right.appendChild(totalRow("Subtotal", money(totals.subtotal, cur)));
        if (totals.discount > 0) {
            right.appendChild(totalRow("Discount", "-" + money(totals.discount, cur)));
        }
        if (totals.taxRate > 0) {
            const taxLabel = (d(f.taxLabel) || "Tax") + " (" + totals.taxRate + "%)";
            right.appendChild(totalRow(taxLabel, money(totals.tax, cur)));
        }
        right.appendChild(totalRow("Grand Total", money(totals.total, cur), "grand"));
        if (totals.paid > 0) {
            right.appendChild(totalRow(config.labels.paid, money(totals.paid, cur)));
            right.appendChild(totalRow("Balance Due", money(totals.balance, cur), "grand"));
        }
        summary.appendChild(right);
        sheet.appendChild(summary);

        if (state.docType === "invoice") {
            const terms = el("div", "doc-terms");
            if (d(f.paymentTerms) || blank) {
                terms.appendChild(fieldLine("Payment Terms", d(f.paymentTerms)));
            }
            if (d(f.bankDetails) || blank) {
                terms.appendChild(el("p", "doc-party-label", "Payment Details"));
                appendLines(terms, f.bankDetails, "doc-party-line");
            }
            if (terms.childNodes.length) {
                sheet.appendChild(terms);
            }
        }

        const signs = el("div", "doc-sign-grid");
        signs.appendChild(signLine("Received By"));
        signs.appendChild(signLine("Authorized Signature"));
        sheet.appendChild(signs);

        if (d(f.note) || blank) {
            sheet.appendChild(el("p", "doc-note", d(f.note)));
        }
    }

    function totalRow(label, value, modifier) {
        const row = el("div", "doc-total-row" + (modifier ? " " + modifier : ""));
        row.appendChild(el("span", "", label));
        row.appendChild(el("span", "num", value));
        return row;
    }

    function signLine(label) {
        const block = el("div", "doc-sign");
        block.appendChild(el("div", "doc-sign-rule"));
        block.appendChild(el("p", "doc-sign-label", label));
        return block;
    }

    /* --- Layout 3: ruled invoice with logo -------------------------------- */

    /* An inline SVG built node by node, never from an HTML string. The icon
       is decorative: the phone number, address or URL beside it is the
       content, so it is hidden from the accessibility tree entirely. */
    function iconNode(key) {
        const NS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(NS, "svg");
        svg.setAttribute("viewBox", ICON_VIEWBOX);
        svg.setAttribute("class", "doc-ruled-icon");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("focusable", "false");
        const path = document.createElementNS(NS, "path");
        path.setAttribute("d", ICONS[key]);
        svg.appendChild(path);
        return svg;
    }

    /* Label above, value sitting on a rule -- the shape the artwork uses for
       Date, No. Invoice and Bill to. The rule is drawn whether or not there
       is a value, so an unfilled invoice prints as something to write on. */
    function ruledField(label, value) {
        const field = el("div", "doc-ruled-field");
        field.appendChild(el("p", "doc-ruled-field-label", label));
        field.appendChild(el("p", "doc-ruled-field-value", value || ""));
        return field;
    }

    function contactRow(key, value) {
        const row = el("p", "doc-ruled-contact-row" + (value ? "" : " is-blank"));
        row.appendChild(iconNode(key));
        row.appendChild(el("span", "doc-ruled-contact-value", value || ""));
        return row;
    }

    function renderRuledInvoice(state) {
        const config = DOC_TYPES[state.docType];
        const cur = currencyOf(state);
        const f = state.fields;
        const d = TB.desanitize;
        const blank = state.blankForm;
        const totals = computeTotals(state);

        /* Masthead: the wordmark and the uploaded logo sit on the title's
           optical line, flush right. */
        const head = el("div", "doc-ruled-masthead");
        head.appendChild(el("h3", "doc-ruled-title", config.heading));

        const brand = el("div", "doc-ruled-brand");
        if (d(f.issuerName) || blank) {
            brand.appendChild(el("p", "doc-ruled-wordmark", d(f.issuerName)));
        }
        if (state.logo) {
            const logo = document.createElement("img");
            logo.className = "doc-ruled-logo";
            logo.alt = "";
            logo.setAttribute("aria-hidden", "true");
            logo.src = state.logo;
            brand.appendChild(logo);
        } else {
            /* A prompt where the logo goes, which opens the same file input the
               Logo control does. Until now the only sign that this template
               takes a logo at all was a field further down the form.

               A BUTTON, not a decorated div: it is operated by the keyboard and
               announced as a control for free, and the sheet is otherwise inert.
               Deliberately shorter than the logo it stands for -- the real one
               is 3rem and this row is the wordmark's own height -- so the
               masthead does not change height when there is nothing in it. The
               preview would then be taller than the PDF, which draws the logo
               from `state` and never reads this sheet. */
            const slot = document.createElement("button");
            slot.type = "button";
            slot.className = "doc-logo-slot";
            slot.setAttribute("data-logo-slot", "");
            /* The words are the ACCESSIBLE NAME rather than the label, because
               the visible mark has to stay small enough not to squeeze the
               business name beside it -- see .doc-logo-slot in css/style.css.
               A screen reader hears "Add logo"; the sheet shows a plus. */
            slot.setAttribute("aria-label", "Add logo");
            slot.setAttribute("title", "Add logo");
            slot.textContent = "+";
            brand.appendChild(slot);
        }
        head.appendChild(brand);
        sheet.appendChild(head);

        /* Reference fields left, payment details right. */
        const top = el("div", "doc-ruled-top");

        /* The three fields are direct grid children rather than a nested
           column, which is what lets the payment block align with Bill To by
           grid placement (grid-row: 3) instead of by a padding figure that
           would have to be re-derived every time a font size moves. */
        top.appendChild(ruledField(config.labels.docDate + ":", formatDate(f.docDate)));
        top.appendChild(ruledField(config.labels.docNumber + " :", d(f.docNumber)));
        top.appendChild(ruledField(config.labels.recipientName + ":", d(f.recipientName)));
        const address = el("div", "doc-ruled-address-block");
        appendLines(address, f.recipientDetails, "doc-ruled-address");
        top.appendChild(address);

        const pay = el("div", "doc-ruled-pay");
        /* The same three-way condition writeRuledInvoice uses. They have to
           agree: a block that appears on the sheet and not in the export, or
           the reverse, is the preview-disagrees-with-export defect the
           two-painter discipline exists to prevent. */
        if (d(f.bankDetails) || d(f.paymentTerms) || formatDate(f.dueDate) || blank) {
            pay.appendChild(el("p", "doc-ruled-pay-label", "Payment Method:"));
            appendLines(pay, f.bankDetails, "doc-ruled-pay-line");
            if (d(f.paymentTerms)) {
                pay.appendChild(el("p", "doc-ruled-pay-line", "Terms: " + d(f.paymentTerms)));
            }
            if (formatDate(f.dueDate)) {
                pay.appendChild(el("p", "doc-ruled-pay-line", "Due: " + formatDate(f.dueDate)));
            }
        }
        top.appendChild(pay);
        sheet.appendChild(top);

        /* Line-item grid. Every cell is ruled on all four sides and the body
           never falls below RULED_MIN_ROWS, so the sheet reads as the printed
           form it is modelled on however little has been typed into it. */
        const table = el("table", "doc-ruled-table");
        const colgroup = document.createElement("colgroup");
        RULED_WIDTHS.forEach((width) => {
            const col = document.createElement("col");
            col.style.width = (width * 100).toFixed(2) + "%";
            colgroup.appendChild(col);
        });
        table.appendChild(colgroup);

        const thead = document.createElement("thead");
        const headRow = document.createElement("tr");
        RULED_COLUMNS.forEach((title) => headRow.appendChild(el("th", "", title)));
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        const filled = state.items.filter((item) =>
            d(item.description) || d(item.date) || num(item.qty) || num(item.price));
        const rows = blank ? state.items : filled;

        rows.forEach((item) => {
            const qty = num(item.qty);
            const price = num(item.price);
            const tr = document.createElement("tr");
            tr.appendChild(el("td", "", d(item.date)));
            tr.appendChild(el("td", "", d(item.description)));
            tr.appendChild(el("td", "num", price ? money(price, cur) : ""));
            tr.appendChild(el("td", "num", qty ? String(qty) : ""));
            /* Computed, never typed: there is no input for a row total. */
            tr.appendChild(el("td", "num", qty && price ? money(qty * price, cur) : ""));
            tbody.appendChild(tr);
        });

        for (let i = rows.length; i < RULED_MIN_ROWS; i += 1) {
            const tr = el("tr", "is-empty");
            RULED_COLUMNS.forEach(() => tr.appendChild(el("td", "", "")));
            tbody.appendChild(tr);
        }

        table.appendChild(tbody);
        const tableWrap = el("div", "doc-table-wrap");
        tableWrap.appendChild(table);
        sheet.appendChild(tableWrap);

        /* Closing row: the thank-you line, and the single boxed figure the
           artwork carries. Subtotal, discount, tax and any payment already
           made appear above the box ONLY when they are not zero, so a plain
           invoice renders exactly the reference -- one box, one number. */
        const close = el("div", "doc-ruled-close");
        close.appendChild(el("p", "doc-ruled-thanks", d(f.note) || "THANK YOU!"));

        const moneyCol = el("div", "doc-ruled-money");
        if (totals.discount > 0 || totals.taxRate > 0 || totals.paid > 0) {
            moneyCol.appendChild(totalRow("Subtotal", money(totals.subtotal, cur)));
            if (totals.discount > 0) {
                moneyCol.appendChild(totalRow("Discount", "-" + money(totals.discount, cur)));
            }
            if (totals.taxRate > 0) {
                moneyCol.appendChild(totalRow(
                    (d(f.taxLabel) || "Tax") + " (" + totals.taxRate + "%)",
                    money(totals.tax, cur)));
            }
            if (totals.paid > 0) {
                moneyCol.appendChild(totalRow(config.labels.paid,
                    "-" + money(totals.paid, cur)));
            }
        }

        const box = el("div", "doc-ruled-total");
        box.appendChild(el("span", "doc-ruled-total-label",
            totals.paid > 0 ? "Balance Due:" : "Total:"));
        box.appendChild(el("span", "doc-ruled-total-value",
            money(totals.paid > 0 ? totals.balance : totals.total, cur)));
        moneyCol.appendChild(box);
        close.appendChild(moneyCol);
        sheet.appendChild(close);

        /* Footer: icon contact strip left, signature rules right. */
        const foot = el("div", "doc-ruled-foot");

        const contact = el("div", "doc-ruled-contact");
        [["phone", d(f.contactPhone)], ["mail", d(f.contactEmail)],
            ["globe", d(f.contactSite)]].forEach((pair) => {
            if (pair[1] || blank) {
                contact.appendChild(contactRow(pair[0], pair[1]));
            }
        });
        foot.appendChild(contact);

        const signs = el("div", "doc-ruled-signs");
        const first = el("div", "doc-ruled-sign");
        first.appendChild(el("div", "doc-ruled-sign-rule"));
        if (d(f.signerName)) {
            first.appendChild(el("p", "doc-ruled-sign-label", d(f.signerName)));
        }
        signs.appendChild(first);
        signs.appendChild(el("div", "doc-ruled-sign-rule"));
        signs.appendChild(el("div", "doc-ruled-sign-rule"));
        foot.appendChild(signs);

        sheet.appendChild(foot);
    }

    /* --- Layout 4: employee warning notice ------------------------------- */

    function renderNotice(state) {
        const config = DOC_TYPES[state.docType];
        const f = state.fields;
        const d = TB.desanitize;
        const blank = state.blankForm;

        if (d(f.issuerName) || blank) {
            const head = el("div", "doc-masthead");
            head.appendChild(el("p", "doc-brand", d(f.issuerName)));
            appendLines(head, f.issuerDetails, "doc-brand-line");
            sheet.appendChild(head);
        }

        const titleBox = el("div", "doc-title-box");
        titleBox.appendChild(el("h3", "doc-title", config.heading));
        sheet.appendChild(titleBox);

        const grid = el("div", "doc-field-grid");
        grid.appendChild(fieldLine(config.labels.recipientName, d(f.recipientName)));
        grid.appendChild(fieldLine(config.labels.docDate, formatDate(f.docDate)));
        grid.appendChild(fieldLine("Position / Title", d(f.position)));
        grid.appendChild(fieldLine("Date of Incident", formatDate(f.incidentDate)));
        grid.appendChild(fieldLine("Department", d(f.department)));
        grid.appendChild(fieldLine("Employee ID", d(f.employeeId)));
        grid.appendChild(fieldLine("Supervisor", d(f.supervisor)));
        grid.appendChild(fieldLine(config.labels.docNumber, d(f.docNumber)));
        sheet.appendChild(grid);

        const levelBlock = el("div", "doc-inline-block");
        levelBlock.appendChild(el("span", "dl-label", "Warning Level"));
        const levelChecks = {};
        WARNING_LEVELS.forEach((level) => {
            levelChecks[level] = d(f.warningLevel) === level;
        });
        levelBlock.appendChild(checkRow(
            WARNING_LEVELS.map((level) => ({ key: level, label: level })), levelChecks));
        sheet.appendChild(levelBlock);

        sheet.appendChild(el("p", "doc-section-heading", "Reason for Warning"));
        sheet.appendChild(checkRow(VIOLATIONS, state.violations, "grid"));

        appendNoticeSection(sheet, "Description of Incident", f.incident, blank, 5);
        if (d(f.priorWarnings) || blank) {
            sheet.appendChild(fieldLine("Prior Warnings Issued", d(f.priorWarnings)));
        }
        appendNoticeSection(sheet, "Expected Corrective Action", f.corrective, blank, 4);
        appendNoticeSection(sheet, "Consequence of Further Violation", f.consequence, blank, 3);

        if (d(f.note) || blank) {
            sheet.appendChild(el("p", "doc-note left", d(f.note)));
        }

        const signs = el("div", "doc-sign-grid");
        signs.appendChild(signLine("Employee Signature and Date"));
        signs.appendChild(signLine("Supervisor Signature and Date"));
        sheet.appendChild(signs);
    }

    function appendNoticeSection(parent, heading, text, blank, blankRules) {
        const value = TB.desanitize(text);
        if (!value && !blank) {
            return;
        }
        parent.appendChild(el("p", "doc-section-heading", heading));
        if (value) {
            appendLines(parent, text, "doc-paragraph");
        } else {
            ruledLines(parent, blankRules);
        }
    }

    /* --- Layout 5: trade counter receipt ---------------------------------- */

    /* Money split at the decimal point: the major unit for the wide cell, the
       minor unit for the narrow one beside it. That narrow column is what the
       artwork's fifth column IS -- it runs the full height of the grid and
       through all three totals rows, so a customer filling the form in by hand
       has the decimal point in the same place on every line.

       A currency with no minor unit (JPY) returns an empty second part rather
       than "00", so the narrow cell is blank and the wide one carries the
       whole figure. Reads as one number, which for a currency without cents is
       what it is. */
    function tradeAmountParts(value, cur, forPdf) {
        const text = money(value, cur, forPdf);
        if (cur.decimals === 0) {
            return { major: text, minor: "" };
        }
        const cut = text.lastIndexOf(".");
        return cut === -1
            ? { major: text, minor: "" }
            : { major: text.slice(0, cut), minor: text.slice(cut + 1) };
    }

    /* One grid row, as the two painters both understand it: the four typed
       columns plus the split amount. Returns null for a row with nothing in
       it so the caller can draw an empty ruled line instead. */
    function tradeRowValues(item, cur) {
        const d = TB.desanitize;
        const qty = d(item.qty);
        const description = d(item.description);
        const price = d(item.price);
        if (!qty && !description && !price) {
            return null;
        }
        const amount = num(item.qty) * num(item.price);
        const parts = tradeAmountParts(amount, cur);
        return {
            qty: qty,
            description: description,
            price: price ? money(num(item.price), cur) : "",
            major: parts.major,
            minor: parts.minor
        };
    }

    function renderTradeReceipt(state) {
        const config = DOC_TYPES[state.docType];
        const cur = currencyOf(state);
        const f = state.fields;
        const d = TB.desanitize;
        const blank = state.blankForm;
        const totals = computeTotals(state);

        /* The header card: logo and address on the left, the business's own
           details and the three reference rows on the right. One rounded box
           holding both halves, which is what the artwork draws. */
        const card = el("div", "doc-trade-card");

        const left = el("div", "doc-trade-card-left");
        if (state.logo) {
            const logo = document.createElement("img");
            logo.className = "doc-trade-logo";
            logo.alt = "";
            logo.setAttribute("aria-hidden", "true");
            logo.src = state.logo;
            left.appendChild(logo);
        } else {
            /* The same control the ruled invoice uses, for the same reason:
               until the logo is uploaded the only sign this template takes one
               is a field further down the form. A button, so it is reachable
               by keyboard and announced as a control. */
            const slot = document.createElement("button");
            slot.type = "button";
            slot.className = "doc-logo-slot doc-trade-logo-slot";
            slot.setAttribute("data-logo-slot", "");
            slot.setAttribute("aria-label", "Add logo");
            slot.setAttribute("title", "Add logo");
            slot.textContent = "+";
            left.appendChild(slot);
        }
        const address = el("div", "doc-trade-address");
        appendLines(address, f.issuerDetails, "doc-trade-address-line");
        left.appendChild(address);
        card.appendChild(left);

        const right = el("div", "doc-trade-card-right");
        if (d(f.issuerName) || blank) {
            right.appendChild(el("p", "doc-trade-business", d(f.issuerName)));
        }
        if (d(f.contactEmail) || blank) {
            right.appendChild(el("p", "doc-trade-contact",
                "Email " + d(f.contactEmail)));
        }
        if (d(f.contactSite) || blank) {
            right.appendChild(el("p", "doc-trade-contact",
                "Website: " + d(f.contactSite)));
        }

        /* Three labelled rows in a bordered box, the labels on a grey ground.
           Drawn whether or not they carry a value: this is a form. */
        const refs = el("div", "doc-trade-refs");
        [[config.labels.docDate, formatDate(f.docDate)],
         [config.labels.recipientName, d(f.recipientName)],
         ["Cell No.", d(f.clientPhone)]].forEach((pair) => {
            const row = el("div", "doc-trade-ref-row");
            row.appendChild(el("span", "doc-trade-ref-label", pair[0]));
            row.appendChild(el("span", "doc-trade-ref-value", pair[1] || ""));
            refs.appendChild(row);
        });
        right.appendChild(refs);
        card.appendChild(right);
        sheet.appendChild(card);

        /* The account block. Every row keeps its rule when empty, because the
           sheet is a printed form before it is a record. */
        const account = el("div", "doc-trade-account");
        account.appendChild(el("p", "doc-trade-account-heading", "ACCOUNT DETAILS:"));
        const grid = el("div", "doc-trade-account-grid");
        TRADE_ACCOUNT_ROWS.forEach((entry) => {
            grid.appendChild(el("span", "doc-trade-account-label", entry.label));
            grid.appendChild(el("span", "doc-trade-account-colon", ":"));
            grid.appendChild(el("span", "doc-trade-account-value",
                d(f[entry.bind])));
        });
        account.appendChild(grid);
        sheet.appendChild(account);

        /* The grid. A real table element, so the header cells are header cells
           and a screen reader can associate them with the rows. */
        const table = document.createElement("table");
        table.className = "doc-trade-table";
        const colgroup = document.createElement("colgroup");
        TRADE_WIDTHS.forEach((share) => {
            const col = document.createElement("col");
            col.style.width = (share * 100).toFixed(3) + "%";
            colgroup.appendChild(col);
        });
        table.appendChild(colgroup);

        const thead = document.createElement("thead");
        const headRow = document.createElement("tr");
        TRADE_COLUMNS.forEach((title, index) => {
            const th = document.createElement("th");
            th.scope = "col";
            th.textContent = title;
            /* The minor-unit column has no heading in the artwork and none
               here. It is not a column of its own to a reader -- it is the
               right-hand half of Amount -- so it is marked as presentational
               rather than given an invented title nobody would want printed. */
            if (!title) {
                th.className = "is-unlabelled";
                th.setAttribute("aria-hidden", "true");
            }
            if (index === 2 || index === 3) {
                th.className = (th.className ? th.className + " " : "") + "num";
            }
            headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        const rows = state.items.map((item) => tradeRowValues(item, cur))
            .filter((row) => row !== null);
        const drawn = Math.max(TRADE_MIN_ROWS, rows.length);
        for (let i = 0; i < drawn; i += 1) {
            const row = rows[i] || null;
            const tr = document.createElement("tr");
            if (!row) {
                tr.className = "is-empty";
            }
            [[row ? row.qty : "", ""],
             [row ? row.description : "", ""],
             [row ? row.price : "", "num"],
             [row ? row.major : "", "num"],
             [row ? row.minor : "", "minor"]].forEach((cell) => {
                const td = document.createElement("td");
                if (cell[1]) { td.className = cell[1]; }
                td.textContent = cell[0];
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        sheet.appendChild(table);

        /* Payment method on the left, the three totals on the right, sharing
           one row so the method sits on the Sub Total line as it does in the
           artwork. */
        const foot = el("div", "doc-trade-foot");
        const method = el("div", "doc-trade-method");
        method.appendChild(el("p", "doc-trade-method-label", "Payment Method:"));
        const chosen = PAYMENT_METHODS
            .filter((option) => state.methods[option.key])
            .map((option) => option.label);
        if (chosen.length || blank) {
            method.appendChild(el("p", "doc-trade-method-value", chosen.join(", ")));
        }
        foot.appendChild(method);

        const totalsBox = el("div", "doc-trade-totals");
        [["Sub Total", totals.subtotal, ""],
         [d(f.taxLabel) || "V.A.T Inclusive", totals.tax, ""],
         ["TOTAL", totals.total, "is-total"]].forEach((entry) => {
            const row = el("div", "doc-trade-total-row" + (entry[2] ? " " + entry[2] : ""));
            row.appendChild(el("span", "doc-trade-total-label", entry[0]));
            const parts = tradeAmountParts(entry[1], cur);
            row.appendChild(el("span", "doc-trade-total-major", parts.major));
            row.appendChild(el("span", "doc-trade-total-minor", parts.minor));
            totalsBox.appendChild(row);
        });
        foot.appendChild(totalsBox);
        sheet.appendChild(foot);

        /* Terms, under a red rule that is the artwork's one flash of colour
           besides the footer band. */
        const termsText = d(f.terms) || (blank ? "" : TRADE_TERMS_DEFAULT);
        if (termsText || blank) {
            const terms = el("div", "doc-trade-terms");
            terms.appendChild(el("p", "doc-trade-terms-heading", "TERMS & CONDITIONS"));
            /* The line that introduces the numbered clauses. The PDF writer
               draws it too; a block that appears on the sheet and not in the
               export is the drift the two-painter discipline exists for, and
               this file has already been caught by it once over the footer
               band. */
            const intro = d(f.termsIntro) || (blank ? "" : TRADE_TERMS_INTRO);
            if (intro) {
                terms.appendChild(el("p", "doc-trade-terms-intro", intro));
            }
            const list = document.createElement("ol");
            list.className = "doc-trade-terms-list";
            termsText.split("\n").forEach((line) => {
                const text = line.trim();
                if (!text) { return; }
                list.appendChild(el("li", "doc-trade-terms-item", text));
            });
            terms.appendChild(list);
            sheet.appendChild(terms);
        }

        if (d(f.note)) {
            sheet.appendChild(el("p", "doc-trade-note", d(f.note)));
        }

        /* The artwork's footer band. An inline SVG rather than the CSS
           gradients this started as: the artwork's sweeps are CURVES, and
           linear-gradient can only give a straight edge, which came out as a
           hard-edged red wedge that read as a rendering fault rather than as a
           design. Only visible once it was rendered and looked at.

           TRADE_BAND is shared with the PDF writer, which draws the same three
           paths through jsPDF, so the two painters cannot disagree about a
           shape neither of them can check against the other. */
        const NS = "http://www.w3.org/2000/svg";
        const band = document.createElementNS(NS, "svg");
        band.setAttribute("class", "doc-trade-band");
        band.setAttribute("viewBox", "0 0 " + TRADE_BAND.w + " " + TRADE_BAND.h);
        band.setAttribute("preserveAspectRatio", "none");
        band.setAttribute("aria-hidden", "true");
        band.setAttribute("focusable", "false");
        const defs = document.createElementNS(NS, "defs");
        TRADE_BAND.gradients.forEach((entry) => {
            const grad = document.createElementNS(NS, "linearGradient");
            grad.setAttribute("id", entry.id);
            grad.setAttribute("x1", "0");
            grad.setAttribute("x2", "1");
            entry.stops.forEach((stop) => {
                const node = document.createElementNS(NS, "stop");
                node.setAttribute("offset", stop[0]);
                node.setAttribute("stop-color", stop[1]);
                grad.appendChild(node);
            });
            defs.appendChild(grad);
        });
        band.appendChild(defs);
        TRADE_BAND.sweeps.forEach((sweep) => {
            const path = document.createElementNS(NS, "path");
            path.setAttribute("d", tradeBandPath(sweep));
            path.setAttribute("fill", sweep.fill);
            band.appendChild(path);
        });
        sheet.appendChild(band);
    }

    /* --- Renderer dispatch ----------------------------------------------- */

    const RENDERERS = {
        receipt: renderReceipt,
        itemized: renderItemized,
        notice: renderNotice,
        "ruled-invoice": renderRuledInvoice,
        "trade-receipt": renderTradeReceipt
    };

    function renderPreview(state) {
        const config = DOC_TYPES[state.docType];
        sheet.replaceChildren();
        sheet.className = "doc-sheet is-" + config.layout;
        sheet.style.setProperty("--accent", state.accent);
        RENDERERS[config.layout](state);
    }

    /* ----------------------------------------------------------------------
       Accent color theming via CSS custom properties.
       ---------------------------------------------------------------------- */

    function applyAccent(accent) {
        currentAccent = /^#[0-9A-Fa-f]{6}$/.test(accent) ? accent : DEFAULT_ACCENT;
        swatchRow.querySelectorAll(".swatch").forEach((btn) => {
            btn.classList.toggle("is-active", btn.getAttribute("data-accent") === currentAccent);
        });
    }

    swatchRow.addEventListener("click", (event) => {
        const swatch = event.target.closest("[data-accent]");
        if (swatch) {
            applyAccent(swatch.getAttribute("data-accent"));
            persistAndRender();
        }
    });

    /* ----------------------------------------------------------------------
       PDF compilation via the jsPDF native text API (CDN in docs.html).
       Every string is written as true vector glyphs with doc.text(), so the
       exported document stays selectable, copyable and machine-readable.
       ---------------------------------------------------------------------- */

    /* ----------------------------------------------------------------------
       The contact-strip icons, rasterized for the PDF.

       These three cannot be text: jsPDF's built-in WinAnsi faces have no
       handset, envelope or globe glyph, and asking for one prints nothing.
       They are the ONLY raster in the export -- every string still goes
       through doc.text(), so the document stays selectable and parseable,
       which is the standing rule in
       docs/error-fixes/RESUME_PDF_RASTERIZED_TEXT_FIX.md.

       The transform is the whole subtlety. The viewBox is "0 -960 960 960",
       so the path occupies y = -960..0; translating down by the canvas height
       before scaling is what brings it onto the surface. Without it every
       icon is drawn above the canvas and three blank images are embedded,
       which looks exactly like a missing-asset bug and is not one.
       ---------------------------------------------------------------------- */
    const iconCache = {};

    function iconPng(key, pixels) {
        const cacheKey = key + "@" + pixels;
        if (Object.prototype.hasOwnProperty.call(iconCache, cacheKey)) {
            return iconCache[cacheKey];
        }
        let uri = "";
        const canvas = document.createElement("canvas");
        canvas.width = pixels;
        canvas.height = pixels;
        const ctx = canvas.getContext("2d");
        if (ctx && typeof window.Path2D === "function") {
            const scale = pixels / 960;
            ctx.setTransform(scale, 0, 0, scale, 0, pixels);
            ctx.fillStyle = "#1A1A1A";
            ctx.fill(new window.Path2D(ICONS[key]));
            uri = canvas.toDataURL("image/png");
        }
        iconCache[cacheKey] = uri;
        return uri;
    }

    const PAGE = { width: 210, margin: 16, bottom: 281 };
    const INK = [26, 26, 26];
    const INK_GRAY = [107, 107, 102];
    const INK_LINE = [190, 188, 182];

    function hexToRgb(hex) {
        return [
            parseInt(hex.slice(1, 3), 16),
            parseInt(hex.slice(3, 5), 16),
            parseInt(hex.slice(5, 7), 16)
        ];
    }

    function buildPdf(state) {
        const doc = new window.jspdf.jsPDF({ unit: "mm", format: "a4" });
        const config = DOC_TYPES[state.docType];
        const cur = currencyOf(state);
        const accent = hexToRgb(state.accent);
        const d = TB.desanitize;
        const f = state.fields;
        const blank = state.blankForm;

        const L = PAGE.margin;
        const R = PAGE.width - PAGE.margin;
        const W = R - L;
        let y = PAGE.margin + 6;

        function ensureRoom(needed) {
            if (y + needed > PAGE.bottom) {
                doc.addPage();
                y = PAGE.margin;
            }
        }

        function font(family, style, size, color) {
            doc.setFont(family, style);
            doc.setFontSize(size);
            const ink = color || INK;
            doc.setTextColor(ink[0], ink[1], ink[2]);
        }

        function stroke(color, width) {
            const ink = color || INK_LINE;
            doc.setDrawColor(ink[0], ink[1], ink[2]);
            doc.setLineWidth(width || 0.2);
        }

        /* Word-wraps a block of text and advances the cursor, breaking to a
           new page whenever the next line would overflow the bottom margin. */
        function block(text, family, style, size, color, gapAfter, x, width) {
            font(family, style, size, color);
            const left = x === undefined ? L : x;
            const lineHeight = size * 0.3528 * 1.35;
            doc.splitTextToSize(text, width === undefined ? W : width).forEach((line) => {
                ensureRoom(lineHeight);
                doc.text(line, left, y);
                y += lineHeight;
            });
            y += gapAfter || 0;
        }

        /* Label plus a ruled value line, matching the on-screen field rows. */
        function pdfFieldLine(label, value, x, width) {
            ensureRoom(9);
            const left = x === undefined ? L : x;
            const span = width === undefined ? W : width;
            font("helvetica", "bold", 8, INK_GRAY);
            const caption = label.toUpperCase() + ":";
            doc.text(caption, left, y);
            const offset = doc.getTextWidth(caption) + 2;
            font("helvetica", "normal", 10, INK);
            doc.text(String(value || ""), left + offset, y);
            stroke(INK_LINE, 0.2);
            doc.line(left + offset, y + 1.4, left + span, y + 1.4);
            y += 8;
        }

        function pdfChecks(options, checks, x, width, perRow) {
            const left = x === undefined ? L : x;
            const span = width === undefined ? W : width;
            const columns = perRow || 3;
            const colWidth = span / columns;
            let column = 0;
            ensureRoom(7);
            options.forEach((option) => {
                if (column === columns) {
                    column = 0;
                    y += 6;
                    ensureRoom(7);
                }
                const cx = left + column * colWidth;
                stroke(INK, 0.25);
                doc.rect(cx, y - 3, 3.2, 3.2);
                if (checks[option.key]) {
                    font("helvetica", "bold", 8, INK);
                    doc.text("X", cx + 0.55, y - 0.4);
                }
                font("helvetica", "normal", 8.5, INK);
                doc.text(option.label, cx + 4.6, y);
                column += 1;
            });
            y += 8;
        }

        function pdfTitle(text, centered) {
            ensureRoom(16);
            font("times", "bold", 20, accent);
            doc.text(text, centered ? PAGE.width / 2 : L, y,
                centered ? { align: "center" } : undefined);
            y += 3;
            stroke(accent, 0.6);
            doc.line(L, y, R, y);
            y += 8;
        }

        function pdfIssuerHead() {
            if (d(f.issuerName)) {
                block(d(f.issuerName), "times", "bold", 13, accent, 0.5);
            }
            const lines = d(f.issuerDetails).split("\n").map((s) => s.trim()).filter(Boolean);
            lines.forEach((line) => block(line, "helvetica", "normal", 8.5, INK_GRAY));
            if (d(f.issuerName) || lines.length) {
                y += 3;
            }
        }

        function pdfSignatures(leftLabel, rightLabel) {
            ensureRoom(20);
            y += 10;
            const half = (W - 12) / 2;
            stroke(INK, 0.3);
            doc.line(L, y, L + half, y);
            doc.line(R - half, y, R, y);
            y += 4;
            font("helvetica", "normal", 8, INK_GRAY);
            doc.text(leftLabel, L, y);
            doc.text(rightLabel, R - half, y);
            y += 6;
        }

        function pdfNote() {
            if (!d(f.note)) {
                return;
            }
            y += 4;
            block(d(f.note), "helvetica", "bold", 9.5, accent, 0);
        }

        /* --- Receipt layout ---------------------------------------------- */
        function writeReceipt() {
            const amount = num(f.amount);
            pdfIssuerHead();
            pdfTitle(config.heading, true);

            const half = W / 2;
            if (d(f.docNumber)) {
                pdfFieldLine(config.labels.docNumber, d(f.docNumber), L, half - 6);
                y -= 8;
            }
            pdfFieldLine(config.labels.docDate, formatDate(f.docDate), L + half, half);

            pdfFieldLine(config.labels.recipientName, d(f.recipientName), L, W * 0.62 - 6);
            y -= 8;
            pdfFieldLine("Amount", amount ? money(amount, cur, true) : "",
                L + W * 0.62, W * 0.38);

            pdfFieldLine("Amount in Words", amountToWords(amount, cur));

            if (d(f.purpose) || blank) {
                pdfFieldLine(config.labels.purpose, d(f.purpose));
            }

            if (state.docType === "rent-receipt") {
                const period = [formatDate(f.periodFrom), formatDate(f.periodTo)].filter(Boolean);
                if (period.length === 2 || blank) {
                    pdfFieldLine("Rental Period", period.join("  to  "));
                }
                const balance = num(f.balance);
                if (balance > 0 || blank) {
                    pdfFieldLine("Balance Still Due", balance > 0 ? money(balance, cur, true) : "");
                }
            }

            font("helvetica", "bold", 8, INK_GRAY);
            ensureRoom(8);
            doc.text("PAYMENT METHOD:", L, y);
            y += 6;
            pdfChecks(PAYMENT_METHODS, state.methods, L, W, 3);

            if (d(f.reference) || blank) {
                pdfFieldLine("Reference", d(f.reference));
            }
            pdfFieldLine("Received By", d(f.receivedBy));
            pdfFieldLine("Signature", "");
            pdfNote();
        }

        /* --- Itemized layout --------------------------------------------- */
        function writeItemized() {
            const totals = computeTotals(state);

            ensureRoom(20);
            font("times", "bold", 24, accent);
            doc.text(config.heading, L, y);

            const metaX = R;
            let metaY = y - 6;
            font("helvetica", "normal", 9, INK);
            if (d(f.docNumber)) {
                doc.text(config.labels.docNumber + " " + d(f.docNumber), metaX, metaY, { align: "right" });
                metaY += 5;
            }
            if (formatDate(f.docDate)) {
                doc.text(config.labels.docDate + ": " + formatDate(f.docDate), metaX, metaY, { align: "right" });
                metaY += 5;
            }
            if (state.docType === "invoice" && formatDate(f.dueDate)) {
                doc.text("Due Date: " + formatDate(f.dueDate), metaX, metaY, { align: "right" });
                metaY += 5;
            }
            y = Math.max(y + 4, metaY);
            stroke(accent, 0.6);
            doc.line(L, y, R, y);
            y += 8;

            /* Two party columns, drawn side by side from a shared baseline. */
            const colWidth = W / 2 - 6;
            const startY = y;
            const leftY = writeParty(config.labels.recipientLegend, f.recipientName,
                f.recipientDetails, L, colWidth, startY);
            const rightY = writeParty(config.labels.issuerLegend, f.issuerName,
                f.issuerDetails, L + W / 2 + 6, colWidth, startY);
            y = Math.max(leftY, rightY) + 6;

            writeItemTable();
            writeTotals(totals);

            if (state.docType === "invoice") {
                if (d(f.paymentTerms)) {
                    pdfFieldLine("Payment Terms", d(f.paymentTerms));
                }
                const bank = d(f.bankDetails).split("\n").map((s) => s.trim()).filter(Boolean);
                if (bank.length) {
                    font("helvetica", "bold", 8, INK_GRAY);
                    ensureRoom(8);
                    doc.text("PAYMENT DETAILS", L, y);
                    y += 5;
                    bank.forEach((line) => block(line, "helvetica", "normal", 9, INK));
                }
            }

            font("helvetica", "bold", 8, INK_GRAY);
            ensureRoom(8);
            doc.text("PAYMENT METHOD:", L, y);
            y += 6;
            pdfChecks(PAYMENT_METHODS, state.methods, L, W, 3);
            if (d(f.reference)) {
                pdfFieldLine("Reference", d(f.reference));
            }

            pdfSignatures("Received By", "Authorized Signature");
            pdfNote();
        }

        function writeParty(label, name, details, x, width, baselineY) {
            const saved = y;
            y = baselineY;
            font("helvetica", "bold", 8, INK_GRAY);
            doc.text(label.toUpperCase(), x, y);
            y += 1.5;
            stroke(INK_LINE, 0.2);
            doc.line(x, y, x + width, y);
            y += 5;
            if (d(name)) {
                block(d(name), "helvetica", "bold", 10.5, INK, 0.5, x, width);
            }
            d(details).split("\n").map((s) => s.trim()).filter(Boolean).forEach((line) => {
                block(line, "helvetica", "normal", 9, INK_GRAY, 0, x, width);
            });
            const endY = y;
            y = saved;
            return endY;
        }

        function writeItemTable() {
            const cols = [W * 0.50, W * 0.14, W * 0.18, W * 0.18];
            const x = [L, L + cols[0], L + cols[0] + cols[1], L + cols[0] + cols[1] + cols[2]];
            const right = [0, x[1] + cols[1], x[2] + cols[2], x[3] + cols[3]];

            ensureRoom(14);
            font("helvetica", "bold", 8.5, INK);
            doc.text("ITEM DESCRIPTION", x[0], y);
            doc.text("QTY", right[1], y, { align: "right" });
            doc.text("UNIT PRICE", right[2], y, { align: "right" });
            doc.text("TOTAL", right[3], y, { align: "right" });
            y += 2;
            stroke(INK, 0.4);
            doc.line(L, y, R, y);
            y += 5.5;

            const filled = state.items.filter(
                (item) => d(item.description) || num(item.qty) || num(item.price));
            const rows = blank ? state.items : filled;

            rows.forEach((item) => {
                const qty = num(item.qty);
                const price = num(item.price);
                font("helvetica", "normal", 9.5, INK);
                const lines = doc.splitTextToSize(d(item.description), cols[0] - 3);
                const rowHeight = Math.max(lines.length * 4.6, 6);
                ensureRoom(rowHeight + 2);
                lines.forEach((line, index) => {
                    doc.text(line, x[0], y + index * 4.6);
                });
                if (qty) {
                    doc.text(String(qty), right[1], y, { align: "right" });
                }
                if (price) {
                    doc.text(money(price, cur, true), right[2], y, { align: "right" });
                }
                if (qty && price) {
                    doc.text(money(qty * price, cur, true), right[3], y, { align: "right" });
                }
                y += rowHeight;
                stroke(INK_LINE, 0.15);
                doc.line(L, y - 2, R, y - 2);
            });

            y += 4;
        }

        function writeTotals(totals) {
            const boxWidth = W * 0.45;
            const left = R - boxWidth;

            function row(label, value, bold) {
                ensureRoom(7);
                font("helvetica", bold ? "bold" : "normal", bold ? 10.5 : 9.5, INK);
                doc.text(label, left, y);
                doc.text(value, R, y, { align: "right" });
                y += 5.5;
            }

            row("Subtotal", money(totals.subtotal, cur, true));
            if (totals.discount > 0) {
                row("Discount", "-" + money(totals.discount, cur, true));
            }
            if (totals.taxRate > 0) {
                row((d(f.taxLabel) || "Tax") + " (" + totals.taxRate + "%)",
                    money(totals.tax, cur, true));
            }
            stroke(INK, 0.4);
            doc.line(left, y - 3.5, R, y - 3.5);
            y += 1;
            row("Grand Total", money(totals.total, cur, true), true);
            if (totals.paid > 0) {
                row(config.labels.paid, money(totals.paid, cur, true));
                row("Balance Due", money(totals.balance, cur, true), true);
            }
            y += 4;
        }

        /* --- Ruled invoice layout ----------------------------------------- */

        const RULED_FILL = [232, 230, 225];

        function writeRuledInvoice() {
            const totals = computeTotals(state);
            const cols = RULED_WIDTHS.map((share) => W * share);
            const x = [];
            cols.reduce((left, width, index) => {
                x[index] = left;
                return left + width;
            }, L);

            /* Masthead: title left, wordmark and logo flush right. */
            ensureRoom(30);
            font("helvetica", "bold", 30, accent);
            doc.text(config.heading, L, y + 8);

            let brandRight = R;
            if (state.logo && state.logoRatio > 0) {
                let logoH = 14;
                let logoW = logoH * state.logoRatio;
                if (logoW > 34) {
                    logoW = 34;
                    logoH = logoW / state.logoRatio;
                }
                doc.addImage(state.logo, "PNG", R - logoW, y - 4, logoW, logoH);
                brandRight = R - logoW - 3;
            }
            if (d(f.issuerName)) {
                font("helvetica", "bold", 12, INK);
                doc.text(d(f.issuerName), brandRight, y + 6, { align: "right" });
            }
            y += 22;

            /* Reference fields left, payment block right. */
            const refWidth = W * 0.52;
            const refTop = y;

            function ruledPdfField(label, value, top) {
                font("helvetica", "normal", 9, INK_GRAY);
                doc.text(label, L, top);
                font("helvetica", "normal", 10.5, INK);
                doc.text(String(value || ""), L, top + 6);
                stroke(INK, 0.25);
                doc.line(L, top + 7.6, L + refWidth, top + 7.6);
            }

            ensureRoom(50);
            ruledPdfField(config.labels.docDate + ":", formatDate(f.docDate), refTop);
            ruledPdfField(config.labels.docNumber + " :", d(f.docNumber), refTop + 14);
            ruledPdfField(config.labels.recipientName + ":", d(f.recipientName), refTop + 28);

            y = refTop + 42;
            d(f.recipientDetails).split("\n").map((s) => s.trim()).filter(Boolean)
                .forEach((line) => block(line, "helvetica", "italic", 9, INK, 0, L, refWidth));
            const refEnd = y;

            /* Top-aligned with the Bill To field, as the artwork has it. */
            const payX = L + W * 0.55;
            const payWidth = W * 0.45;
            y = refTop + 28;
            const bank = d(f.bankDetails).split("\n").map((s) => s.trim()).filter(Boolean);
            /* Same condition as renderRuledInvoice, blank mode included, so
               the sheet and the export cannot disagree about whether this
               block is there. */
            if (bank.length || d(f.paymentTerms) || formatDate(f.dueDate) || blank) {
                block("Payment Method:", "helvetica", "normal", 9, INK_GRAY, 1.5, payX, payWidth);
                bank.forEach((line) =>
                    block(line, "helvetica", "normal", 9.5, INK, 0, payX, payWidth));
                if (d(f.paymentTerms)) {
                    block("Terms: " + d(f.paymentTerms), "helvetica", "normal", 9.5, INK, 0, payX, payWidth);
                }
                if (formatDate(f.dueDate)) {
                    block("Due: " + formatDate(f.dueDate), "helvetica", "normal", 9.5, INK, 0, payX, payWidth);
                }
            }

            y = Math.max(refEnd, y) + 8;

            /* Line-item grid, ruled on all four sides of every cell. */
            ensureRoom(20);
            doc.setFillColor(RULED_FILL[0], RULED_FILL[1], RULED_FILL[2]);
            stroke(INK, 0.3);
            doc.rect(L, y, W, 8, "FD");
            font("helvetica", "bold", 8.5, INK);
            RULED_COLUMNS.forEach((title, index) => {
                doc.text(title, x[index] + cols[index] / 2, y + 5.3, { align: "center" });
            });
            y += 8;

            function gridRow(height) {
                stroke(INK, 0.25);
                doc.rect(L, y, W, height);
                for (let i = 1; i < x.length; i += 1) {
                    doc.line(x[i], y, x[i], y + height);
                }
            }

            const filled = state.items.filter((item) =>
                d(item.description) || d(item.date) || num(item.qty) || num(item.price));
            const rows = blank ? state.items : filled;

            rows.forEach((item) => {
                const qty = num(item.qty);
                const price = num(item.price);
                font("helvetica", "normal", 9.5, INK);
                const lines = doc.splitTextToSize(d(item.description), cols[1] - 4);
                const height = Math.max(9, lines.length * 4.6 + 4);
                ensureRoom(height + 2);
                gridRow(height);
                doc.text(d(item.date), x[0] + 2, y + 5.8);
                lines.forEach((line, index) => {
                    doc.text(line, x[1] + 2, y + 5.8 + index * 4.6);
                });
                if (price) {
                    doc.text(money(price, cur, true), x[2] + cols[2] - 2, y + 5.8, { align: "right" });
                }
                if (qty) {
                    doc.text(String(qty), x[3] + cols[3] - 2, y + 5.8, { align: "right" });
                }
                if (qty && price) {
                    doc.text(money(qty * price, cur, true), x[4] + cols[4] - 2, y + 5.8,
                        { align: "right" });
                }
                y += height;
            });

            for (let i = rows.length; i < RULED_MIN_ROWS; i += 1) {
                ensureRoom(11);
                gridRow(9);
                y += 9;
            }

            y += 10;

            /* Closing row: the thank-you line sits on the Total box's line. */
            const boxWidth = W * 0.42;
            const boxLeft = R - boxWidth;
            ensureRoom(30);

            if (totals.discount > 0 || totals.taxRate > 0 || totals.paid > 0) {
                font("helvetica", "normal", 9, INK);
                const sub = [["Subtotal", money(totals.subtotal, cur, true)]];
                if (totals.discount > 0) {
                    sub.push(["Discount", "-" + money(totals.discount, cur, true)]);
                }
                if (totals.taxRate > 0) {
                    sub.push([(d(f.taxLabel) || "Tax") + " (" + totals.taxRate + "%)",
                        money(totals.tax, cur, true)]);
                }
                if (totals.paid > 0) {
                    sub.push([config.labels.paid, "-" + money(totals.paid, cur, true)]);
                }
                sub.forEach((pair) => {
                    doc.text(pair[0], boxLeft, y);
                    doc.text(pair[1], R, y, { align: "right" });
                    y += 5;
                });
                y += 1;
            }

            doc.setFillColor(RULED_FILL[0], RULED_FILL[1], RULED_FILL[2]);
            stroke(INK, 0.3);
            doc.rect(boxLeft, y, boxWidth, 9, "FD");
            font("helvetica", "bold", 10.5, INK);
            doc.text(totals.paid > 0 ? "Balance Due:" : "Total:", boxLeft + 3, y + 6);
            doc.text(money(totals.paid > 0 ? totals.balance : totals.total, cur, true),
                R - 3, y + 6, { align: "right" });

            /* The closing line is the visitor's own text, so it can be far
               longer than the artwork's "THANK YOU!". Shrink to fit rather
               than run it under the Total box -- the collision this project
               already shipped once, on the Open Graph invoice illustration. */
            const thanks = d(f.note) || "THANK YOU!";
            const thanksRoom = boxLeft - L - 4;
            let thanksSize = 18;
            font("helvetica", "bold", thanksSize, accent);
            while (thanksSize > 10 && doc.getTextWidth(thanks) > thanksRoom) {
                thanksSize -= 1;
                font("helvetica", "bold", thanksSize, accent);
            }
            doc.text(thanks, L, y + 7);
            y += 9 + 14;

            /* Footer: icon contact strip left, signature rules right. */
            ensureRoom(30);
            const footTop = y;

            [["phone", d(f.contactPhone)], ["mail", d(f.contactEmail)],
                ["globe", d(f.contactSite)]].forEach((pair) => {
                if (!pair[1]) {
                    return;
                }
                const png = iconPng(pair[0], 96);
                if (png) {
                    doc.addImage(png, "PNG", L, y - 3.2, 4.2, 4.2);
                }
                font("helvetica", "normal", 9.5, INK);
                doc.text(pair[1], L + 6.4, y);
                y += 7;
            });
            const contactEnd = y;

            let signY = footTop + 2;
            stroke(INK, 0.3);
            for (let i = 0; i < 3; i += 1) {
                doc.line(boxLeft, signY, R, signY);
                if (i === 0 && d(f.signerName)) {
                    font("helvetica", "normal", 8, INK_GRAY);
                    doc.text(d(f.signerName), boxLeft, signY + 3.6);
                }
                signY += 8;
            }

            y = Math.max(contactEnd, signY);
        }

        /* --- Warning notice layout ---------------------------------------- */
        function writeNotice() {
            pdfIssuerHead();

            ensureRoom(18);
            stroke(INK, 0.5);
            doc.rect(L, y - 5, W, 12);
            font("times", "bold", 16, accent);
            doc.text(config.heading, PAGE.width / 2, y + 3, { align: "center" });
            y += 16;

            const half = W / 2;
            const pairs = [
                [config.labels.recipientName, d(f.recipientName), config.labels.docDate, formatDate(f.docDate)],
                ["Position / Title", d(f.position), "Date of Incident", formatDate(f.incidentDate)],
                ["Department", d(f.department), "Employee ID", d(f.employeeId)],
                ["Supervisor", d(f.supervisor), config.labels.docNumber, d(f.docNumber)]
            ];
            pairs.forEach((pair) => {
                pdfFieldLine(pair[0], pair[1], L, half - 6);
                y -= 8;
                pdfFieldLine(pair[2], pair[3], L + half, half);
            });

            y += 2;
            font("helvetica", "bold", 8, INK_GRAY);
            ensureRoom(8);
            doc.text("WARNING LEVEL:", L, y);
            y += 6;
            const levelChecks = {};
            WARNING_LEVELS.forEach((level) => {
                levelChecks[level] = d(f.warningLevel) === level;
            });
            pdfChecks(WARNING_LEVELS.map((level) => ({ key: level, label: level })),
                levelChecks, L, W, 2);

            sectionHeading("Reason for Warning");
            pdfChecks(VIOLATIONS, state.violations, L, W, 2);

            noticeSection("Description of Incident", f.incident, 5);
            if (d(f.priorWarnings)) {
                pdfFieldLine("Prior Warnings Issued", d(f.priorWarnings));
            }
            noticeSection("Expected Corrective Action", f.corrective, 4);
            noticeSection("Consequence of Further Violation", f.consequence, 3);

            if (d(f.note)) {
                block(d(f.note), "helvetica", "normal", 9, INK, 2);
            }

            pdfSignatures("Employee Signature and Date", "Supervisor Signature and Date");
        }

        function sectionHeading(label) {
            ensureRoom(12);
            y += 2;
            font("helvetica", "bold", 9.5, accent);
            doc.text(label.toUpperCase(), L, y);
            y += 1.5;
            stroke(accent, 0.35);
            doc.line(L, y, R, y);
            y += 6;
        }

        function noticeSection(heading, text, blankRules) {
            const value = d(text);
            if (!value && !blank) {
                return;
            }
            sectionHeading(heading);
            if (value) {
                block(value, "helvetica", "normal", 9.5, INK, 3);
            } else {
                stroke(INK_LINE, 0.2);
                for (let i = 0; i < blankRules; i += 1) {
                    ensureRoom(8);
                    doc.line(L, y, R, y);
                    y += 8;
                }
            }
        }

        /* --- Layout 5: trade counter receipt ------------------------------ */

        /* Absolute placement rather than the flowing `y` cursor every other
           writer uses. This sheet is a FORM: the grid, the totals block and
           the footer band are at fixed heights on the page in the artwork, and
           a cursor that advanced by content would put them somewhere else on
           every receipt. Single page by construction -- thirteen rows is the
           form, and a fourteenth item extends the grid downward into space the
           layout reserves for it rather than starting a second sheet. */
        function writeTradeReceipt() {
            const totals = computeTotals(state);
            const ink = hexToRgb(TRADE_INK);
            const cream = hexToRgb(TRADE_CREAM);
            const grey = hexToRgb(TRADE_GREY);
            const red = hexToRgb(TRADE_RED);

            /* Points to millimetres, once: 595.28pt is exactly 210mm. */
            const TOP = 10;
            const CARD_H = 55.25;
            const cols = TRADE_WIDTHS.map((share) => W * share);
            const x = [];
            cols.reduce((leftEdge, width, index) => {
                x[index] = leftEdge;
                return leftEdge + width;
            }, L);
            x[TRADE_WIDTHS.length] = R;

            function fill(rgb) {
                doc.setFillColor(rgb[0], rgb[1], rgb[2]);
            }

            /* ---- header card ---- */
            stroke(ink, 0.3);
            doc.roundedRect(L, TOP, W, CARD_H, 2.94, 2.94, "S");

            const refX = 104.53;
            const refW = 86.32;
            const refLabelW = 20.48;
            const refTop = 40.74;
            const refH = 20.02;
            const rowH = refH / 3;

            /* The label column is the rounded LEFT END of the reference box,
               so it is drawn as a rounded rect clipped back to square on its
               right by the plain rect that follows. Drawing it as a plain grey
               rect would leave two square corners sitting outside the box's
               own rounding. */
            fill(grey);
            stroke(ink, 0.3);
            doc.roundedRect(refX, refTop, refLabelW, refH, 2.94, 2.94, "FD");
            fill(grey);
            doc.rect(refX + refLabelW - 2.94, refTop, 2.94, refH, "F");
            doc.roundedRect(refX, refTop, refW, refH, 2.94, 2.94, "S");
            doc.line(refX + refLabelW, refTop, refX + refLabelW, refTop + refH);
            doc.line(refX, refTop + rowH, refX + refW, refTop + rowH);
            doc.line(refX, refTop + rowH * 2, refX + refW, refTop + rowH * 2);

            if (state.logo && state.logoRatio > 0) {
                let logoH = 22;
                let logoW = logoH * state.logoRatio;
                if (logoW > 62) {
                    logoW = 62;
                    logoH = logoW / state.logoRatio;
                }
                doc.addImage(state.logo, "PNG", L + 6, TOP + 4, logoW, logoH);
            }

            font("helvetica", "normal", 11, ink);
            let addressY = TOP + 32;
            String(d(f.issuerDetails) || "").split("\n").slice(0, 3)
                .forEach((line) => {
                    if (!line.trim()) { return; }
                    doc.text(line.trim(), L + 6, addressY);
                    addressY += 6.2;
                });

            font("helvetica", "normal", 12, ink);
            let headY = TOP + 8;
            [d(f.issuerName),
             d(f.contactEmail) ? "Email " + d(f.contactEmail) : "",
             d(f.contactSite) ? "Website: " + d(f.contactSite) : ""]
                .forEach((line) => {
                    if (line) { doc.text(line, refX, headY); }
                    headY += 7;
                });

            font("helvetica", "normal", 10, ink);
            [[config.labels.docDate, formatDate(f.docDate)],
             [config.labels.recipientName, d(f.recipientName)],
             ["Cell No.", d(f.clientPhone)]].forEach((pair, index) => {
                const baseline = refTop + rowH * index + rowH / 2 + 1.4;
                doc.text(pair[0], refX + 1.6, baseline);
                if (pair[1]) {
                    doc.text(String(pair[1]), refX + refLabelW + 2, baseline);
                }
            });

            /* ---- account block ---- */
            font("helvetica", "bold", 10, ink);
            doc.text("ACCOUNT DETAILS:", L, 71.5);
            const acctLabelX = L;
            const acctColonX = 55;
            const acctValueX = 69.6;
            let acctY = 77.5;
            TRADE_ACCOUNT_ROWS.forEach((entry) => {
                font("helvetica", "normal", 10, ink);
                doc.text(entry.label, acctLabelX, acctY);
                doc.text(":", acctColonX, acctY);
                const value = d(f[entry.bind]);
                if (value) {
                    doc.text(String(value), acctValueX, acctY);
                }
                acctY += 4.6;
            });

            /* ---- the grid ---- */
            const HEAD_TOP = 111.74;
            const HEAD_H = 8.24;
            const BODY_TOP = HEAD_TOP + HEAD_H;
            const BODY_BOTTOM = 209.48;
            const rowsData = state.items.map((item) => tradeRowValues(item, cur))
                .filter((row) => row !== null);
            const drawn = Math.max(TRADE_MIN_ROWS, rowsData.length);
            const pitch = (BODY_BOTTOM - BODY_TOP) / TRADE_MIN_ROWS;
            const gridBottom = BODY_TOP + pitch * drawn;

            fill(cream);
            stroke(ink, 0.3);
            doc.roundedRect(L, HEAD_TOP, W, HEAD_H, 2.2, 2.2, "FD");
            fill(cream);
            doc.rect(L, HEAD_TOP + HEAD_H - 2.4, W, 2.4, "F");
            stroke(ink, 0.3);
            doc.line(L, HEAD_TOP + HEAD_H, R, HEAD_TOP + HEAD_H);

            font("helvetica", "normal", 12, ink);
            TRADE_COLUMNS.forEach((title, index) => {
                if (!title) { return; }
                const mid = x[index] + cols[index] / 2;
                doc.text(title, mid, HEAD_TOP + HEAD_H - 2.4, { align: "center" });
            });

            stroke(ink, 0.3);
            doc.rect(L, BODY_TOP, W, gridBottom - BODY_TOP, "S");
            for (let i = 1; i < drawn; i += 1) {
                const lineY = BODY_TOP + pitch * i;
                doc.line(L, lineY, R, lineY);
            }
            /* Every vertical runs from the head to the foot of the grid; the
               last two continue into the totals block below, which is what
               keeps the totals lined up with the Amount column above them. */
            for (let i = 1; i < TRADE_WIDTHS.length; i += 1) {
                doc.line(x[i], HEAD_TOP, x[i], gridBottom);
            }

            font("helvetica", "normal", 10, ink);
            rowsData.slice(0, drawn).forEach((row, index) => {
                const baseline = BODY_TOP + pitch * index + pitch - 2.2;
                doc.text(row.qty, x[0] + cols[0] / 2, baseline, { align: "center" });
                doc.text(row.description, x[1] + 2, baseline);
                if (row.price) {
                    doc.text(row.price, x[3] - 2, baseline, { align: "right" });
                }
                doc.text(row.major, x[4] - 2, baseline, { align: "right" });
                if (row.minor) {
                    doc.text(row.minor, x[4] + 2, baseline);
                }
            });

            /* ---- totals ---- */
            const TOTAL_ROWS = [
                { label: "Sub Total", value: totals.subtotal, fillRow: false },
                { label: d(f.taxLabel) || "V.A.T Inclusive", value: totals.tax, fillRow: false },
                { label: "TOTAL", value: totals.total, fillRow: true }
            ];
            const totalH = 8.6;
            TOTAL_ROWS.forEach((entry, index) => {
                const top = gridBottom + totalH * index;
                const last = index === TOTAL_ROWS.length - 1;
                stroke(ink, 0.3);
                if (entry.fillRow) {
                    fill(cream);
                    doc.roundedRect(x[3], top, R - x[3], totalH, 2.94, 2.94, "FD");
                    fill(cream);
                    doc.rect(x[3], top, R - x[3], totalH - 2.94, "F");
                    stroke(ink, 0.3);
                    doc.line(x[3], top, R, top);
                    doc.line(x[3], top, x[3], top + totalH - 2.94);
                    doc.line(R, top, R, top + totalH - 2.94);
                } else {
                    doc.rect(x[3], top, R - x[3], totalH, "S");
                }
                doc.line(x[4], top, x[4], top + totalH - (last ? 2.94 : 0));

                const baseline = top + totalH - 2.6;
                font("helvetica", last ? "bold" : "normal", last ? 13 : 12, ink);
                doc.text(entry.label, x[3] - 3, baseline, { align: "right" });
                const parts = tradeAmountParts(entry.value, cur, true);
                font("helvetica", last ? "bold" : "normal", last ? 12 : 11, ink);
                doc.text(parts.major, x[4] - 2, baseline, { align: "right" });
                if (parts.minor) {
                    doc.text(parts.minor, x[4] + 2, baseline);
                }
            });

            font("helvetica", "bold", 13, ink);
            doc.text("Payment Method:", L, gridBottom + 6.4);
            const chosen = PAYMENT_METHODS
                .filter((option) => state.methods[option.key])
                .map((option) => option.label);
            if (chosen.length) {
                font("helvetica", "normal", 11, ink);
                doc.text(chosen.join(", "), L, gridBottom + 13);
            }

            /* ---- terms ---- */
            const termsTop = Math.max(245, gridBottom + totalH * 3 + 10);
            font("helvetica", "normal", 10, red);
            doc.text("TERMS & CONDITIONS", 26.1, termsTop);
            stroke(red, 0.4);
            doc.line(26.1, termsTop + 1.4, 67.1, termsTop + 1.4);

            /* The introducing line, drawn here as well as on the sheet. It is
               indented past the numbers the way the artwork has it: the
               clauses hang off their figures and the intro sits inside them. */
            let termsY = termsTop + 6.4;
            const intro = d(f.termsIntro) || TRADE_TERMS_INTRO;
            if (intro) {
                font("helvetica", "normal", 9, ink);
                doc.text(String(intro), 29.5, termsY);
                termsY += 4.6;
            }

            const termsText = d(f.terms) || TRADE_TERMS_DEFAULT;
            font("helvetica", "normal", 9, ink);
            String(termsText).split("\n").forEach((line, index) => {
                const text = line.trim();
                /* The cutoff is 284 and not the band's own top edge at 270,
                   because the band is a SWEEP: it rises from left to right, and
                   these clauses are left-aligned at x=26-31 where its ink does
                   not begin until about 287. Cutting at the band's highest
                   point silently dropped the fifth clause while the preview,
                   which flows, still showed all five -- the two painters
                   disagreeing about the CONTENT rather than the geometry. */
                if (!text || termsY > 284) { return; }
                doc.text((index + 1) + ".", 26.1, termsY);
                doc.text(text, 31.5, termsY);
                termsY += 4.6;
            });

            /* ---- footer band ---- */
            /* The same three sweeps the preview draws, from the same
               TRADE_BAND coordinates, so the decoration cannot drift between
               the two painters.

               jsPDF has no gradients, so each wash is drawn as its darkest
               stop. That is a real difference from the screen and it is the
               right way round: a printed band of flat ink reproduces
               predictably, where a gradient banding across a cheap printer
               does not. */
            drawTradeBand(doc, 0, 297 - 27, 210, 27);
        }

        const WRITERS = {
            receipt: writeReceipt,
            itemized: writeItemized,
            notice: writeNotice,
            "ruled-invoice": writeRuledInvoice,
            "trade-receipt": writeTradeReceipt
        };
        WRITERS[config.layout]();

        return doc;
    }

    /* ----------------------------------------------------------------------
       Export actions
       ---------------------------------------------------------------------- */

    document.getElementById("download-pdf").addEventListener("click", () => {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            window.alert("The PDF engine is still loading. Please try again in a moment.");
            return;
        }
        const state = collectState();
        const config = DOC_TYPES[state.docType];

        /* The name in the bar is what names the file (August 24, 2026).
           Before this it named nothing: the export was always
           "<type>-<recipient>-templatebox.pdf", so renaming the document in
           the header was typed, saved and silently unused.

           It only wins when the visitor actually changed it. Left at the
           default, the composed name is more useful than "untitled-document"
           and stays the fallback. */
        const named = TB.desanitize(state.docName).trim() === DEFAULT_DOC_NAME
            ? ""
            : TB.fileSlug(state.docName);
        if (named) {
            buildPdf(state).save(named + "-templatebox.pdf");
            return;
        }

        const party = TB.fileSlug(state.fields.recipientName);
        buildPdf(state).save([config.file, party, "templatebox"].filter(Boolean).join("-") + ".pdf");
    });

    /* Print uses the browser dialog against a print stylesheet that hides
       every shell element, so the sheet prints on its own page. */
    document.getElementById("print-doc").addEventListener("click", () => {
        window.print();
    });

    document.getElementById("clear-doc").addEventListener("click", () => {
        if (!window.confirm("Clear every field in this document? This cannot be undone.")) {
            return;
        }
        form.querySelectorAll("[data-bind]").forEach((input) => {
            if (input.tagName === "SELECT") {
                input.selectedIndex = 0;
            } else {
                input.value = "";
            }
        });
        form.querySelectorAll("[data-check]").forEach((box) => {
            box.checked = false;
        });
        itemList.replaceChildren();
        addItemRow();
        /* The logo is not a [data-bind] control, so the sweep above does not
           reach it. Clearing every field and leaving the logo standing is the
           defect this line exists to prevent. */
        setLogo("", 0);
    });

    /* ----------------------------------------------------------------------
       Initialization: sweep localStorage, hydrate the form, first render.
       ---------------------------------------------------------------------- */

    /* First-run sample content.
       The builder previously opened onto an empty form beside an empty sheet,
       so a first-time visitor saw a blank rectangle and could not tell what
       the tool produces or that the preview is live. These values are shared
       across all seven document types (the per-type fields that do not apply
       are simply hidden), and are applied ONLY when no saved state exists so
       genuine work is never overwritten. */
    const SAMPLE_FIELDS = {
        issuerName: "Harbour Supply Co.",
        issuerDetails: "42 Dock Road, Portside\n+1 (555) 018-2244\nbilling@example.com",
        recipientName: "Nova Interiors Ltd",
        recipientDetails: "8 Coleman Street\nRiverton",
        docNumber: "0148",
        docDate: "2026-08-01",
        purpose: "Oak shelving and fittings order",
        amount: "389.00",
        periodFrom: "2026-08-01",
        periodTo: "2026-08-31",
        receivedBy: "R. Achterberg",
        reference: "Check no. 1042",
        note: "Thank you for your business.",
        contactPhone: "+1 (555) 018-2244",
        contactEmail: "billing@example.com",
        contactSite: "www.example.com",
        signerName: "R. Achterberg",
        taxLabel: "Sales Tax",
        taxRate: "8.5",
        paymentTerms: "Net 30",
        dueDate: "2026-08-31",
        employeeId: "EMP-2291",
        department: "Warehouse",
        position: "Shift Lead",
        incidentDate: "2026-07-19",
        incident: "Late arrival on three scheduled shifts during July, following a verbal discussion on 2 July.",
        corrective: "Arrive at or before the scheduled shift start for the next 60 days.",
        consequence: "Further lateness within this period may lead to a final written warning."
    };

    const SAMPLE_ITEMS = [
        { date: "1 Aug", description: "Oak shelving board", qty: "6", price: "45.00" },
        { date: "1 Aug", description: "Brass fittings set", qty: "2", price: "42.00" },
        { date: "3 Aug", description: "Delivery", qty: "1", price: "35.00" }
    ];

    /* Renders the sample-content notice above the form, with a one-click
       route to a genuinely empty document. */
    function showSampleNotice() {
        const pane = form.parentElement;
        if (!pane || document.getElementById("sample-notice")) {
            return;
        }

        const notice = document.createElement("div");
        notice.className = "sample-notice";
        notice.id = "sample-notice";

        const text = document.createElement("p");
        text.textContent = "This is sample content so you can see how the live preview works. Type over it, or start from an empty document.";

        const clear = document.createElement("button");
        clear.type = "button";
        clear.className = "btn btn-secondary btn-small";
        clear.textContent = "Start blank";
        clear.addEventListener("click", () => {
            form.querySelectorAll("[data-bind]").forEach((input) => {
                if (input.tagName === "SELECT") {
                    return;
                }
                input.value = "";
            });
            itemList.replaceChildren();
            addItemRow();
            notice.remove();
            /* Same reason as Clear Form above: not a [data-bind] control. */
            setLogo("", 0);
            const first = form.querySelector("[data-bind]:not(select)");
            if (first) {
                first.focus();
            }
        });

        notice.appendChild(text);
        notice.appendChild(clear);
        pane.insertBefore(notice, pane.firstChild);
    }

    /* Sample values that differ by document type, overlaid on SAMPLE_FIELDS.
       Only where the SHEET names a row differently: the trade receipt's middle
       total is "V.A.T Inclusive" in its artwork, and seeding the shared "Sales
       Tax" there would have the sample contradict the design it is sampling.
       The field stays editable -- a visitor outside a VAT regime should be
       able to type their own -- this only changes what it starts at.

       Deliberately NOT seeded: that sheet's seven account fields. Sample data
       elsewhere in this editor is a company nobody could mistake for real, and
       a bank account number is the one field where a plausible-looking
       placeholder left uncleared would be worse than an empty rule. The block
       draws its labels and its rules when empty, which is what a form does. */
    const SAMPLE_BY_TYPE = {
        /* `note` is blanked rather than removed. The artwork has NOTHING
           between its terms and the footer band, and a seeded closing line
           lands exactly there -- but a footer message is a useful thing to be
           able to add, so the field stays and only the sample stops filling
           it. */
        "trade-receipt": { taxLabel: "V.A.T Inclusive", taxRate: "14", note: "" }
    };

    function applySampleContent() {
        const overlay = SAMPLE_BY_TYPE[sessionDocType] || {};
        form.querySelectorAll("[data-bind]").forEach((input) => {
            const key = input.getAttribute("data-bind");
            if (input.tagName === "SELECT") {
                return;
            }
            if (Object.prototype.hasOwnProperty.call(overlay, key)) {
                input.value = overlay[key];
            } else if (Object.prototype.hasOwnProperty.call(SAMPLE_FIELDS, key)) {
                input.value = SAMPLE_FIELDS[key];
            }
        });
        itemList.replaceChildren();
        SAMPLE_ITEMS.forEach(addItemRow);
    }

    function init() {
        const saved = TB.storageGet(STORAGE_KEY);
        const state = saved && saved.fields ? saved : null;

        /* A catalog card or landing-page CTA pre-selects which document opens.
           The value is matched against DOC_TYPES, so an edited localStorage
           entry can only ever resolve to a document this editor already ships,
           and a direct visit with no preset and no saved work falls through to
           DEFAULT_TYPE rather than to nothing.

           This is the ONLY place the document type is decided; there is no
           control that can change it afterwards. The saved-state branch is
           what lets a returning visitor resume the document they were actually
           working on instead of being reset to the default.

           Resolved HERE, before the sample content below, because
           applySampleContent() overlays values that differ by document type
           and would otherwise read whichever type this variable still held
           from its declaration. TB.takePreset() REMOVES the key as it reads,
           so this must stay exactly one call. */
        const preset = TB.takePreset();
        sessionDocType = Object.prototype.hasOwnProperty.call(DOC_TYPES, preset)
            ? preset
            : (state && DOC_TYPES[state.docType] ? state.docType : DEFAULT_TYPE);

        if (docNameInput) {
            docNameInput.value = TB.desanitize((state && state.docName) || DEFAULT_DOC_NAME);
        }

        if (state) {
            applyAccent(state.accent);
            blankToggle.checked = state.blankForm === true;
            form.querySelectorAll("[data-bind]").forEach((input) => {
                const value = TB.desanitize(state.fields[input.getAttribute("data-bind")] || "");
                if (input.tagName === "SELECT") {
                    /* Only accept a stored option the select actually offers. */
                    if (Array.from(input.options).some((opt) => opt.value === value)) {
                        input.value = value;
                    }
                } else {
                    input.value = value;
                }
            });
            [[methodRow, state.methods], [violationRow, state.violations]].forEach((pair) => {
                const source = pair[1] || {};
                pair[0].querySelectorAll("[data-check]").forEach((box) => {
                    box.checked = source[box.getAttribute("data-check")] === true;
                });
            });
            (state.items && state.items.length ? state.items : [null]).forEach(addItemRow);

            /* The stored logo is untrusted input on the way out. Only a
               base64 raster is accepted -- an SVG data URI is a script
               vector -- and the ratio has to be present too, because the PDF
               writer is synchronous and cannot decode the image to learn the
               shape. A record missing either drops the logo rather than
               guessing at it and exporting something distorted. */
            if (LOGO_URI.test(String(state.logo || "")) &&
                    Number.isFinite(state.logoRatio) && state.logoRatio > 0) {
                currentLogo = state.logo;
                currentLogoRatio = state.logoRatio;
            }
        } else {
            applyAccent(DEFAULT_ACCENT);
            applySampleContent();
            showSampleNotice();
        }

        /* Real-time binding: one delegated listener covers every current and
           future input inside the form, including cloned line-item rows. */
        form.addEventListener("input", persistAndRender);
        form.addEventListener("change", persistAndRender);

        if (docNameInput) {
            docNameInput.addEventListener("input", persistAndRender);
        }

        document.getElementById("add-item").addEventListener("click", () => {
            addItemRow();
            persistAndRender();
        });

        bindLogoUpload();
        if (logoRemove) {
            logoRemove.hidden = !currentLogo;
        }

        const initial = collectState();
        applyDocType(initial);
        renderPreview(initial);
    }

    init();
})();
