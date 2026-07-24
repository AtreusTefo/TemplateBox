/* ==========================================================================
   TemplateBox - Business Document Builder Core Logic
   Covers six documents from one form and one state object: rent receipt,
   cash payment receipt, itemized business receipt, sales and cash receipt
   form, professional invoice, and employee warning notice.
   Responsibilities: document-type switching, real-time localStorage binding,
   repeating line items, automatic totals and amount-in-words, safe
   textContent preview rendering, and client-side PDF compilation via the
   jsPDF native text API.
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

    const DEFAULT_ACCENT = "#1A1A1A";

    const form = document.getElementById("docs-form");
    const sheet = document.getElementById("doc-sheet");
    if (!form || !sheet) {
        return;
    }

    const typeSelect = document.getElementById("f-doctype");
    const blankToggle = document.getElementById("f-blank");
    const itemList = document.getElementById("item-list");
    const tplItem = document.getElementById("tpl-item");
    const swatchRow = document.getElementById("swatch-row");
    const methodRow = document.getElementById("method-row");
    const violationRow = document.getElementById("violation-row");
    const wordsHint = document.getElementById("amount-words-hint");

    let currentAccent = DEFAULT_ACCENT;

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
            ["description", "qty", "price"].forEach((name) => {
                const input = row.querySelector('[data-entry-field="' + name + '"]');
                item[name] = TB.sanitize(input ? input.value : "");
            });
            return item;
        });
    }

    function collectState() {
        const requested = typeSelect.value;
        const state = {
            docType: Object.prototype.hasOwnProperty.call(DOC_TYPES, requested)
                ? requested
                : DEFAULT_TYPE,
            accent: currentAccent,
            blankForm: blankToggle.checked === true,
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

    /* --- Layout 3: employee warning notice ------------------------------- */

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

    /* --- Renderer dispatch ----------------------------------------------- */

    const RENDERERS = {
        receipt: renderReceipt,
        itemized: renderItemized,
        notice: renderNotice
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

        const WRITERS = { receipt: writeReceipt, itemized: writeItemized, notice: writeNotice };
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
        const party = TB.desanitize(state.fields.recipientName)
            .trim()
            .replace(/[^A-Za-z0-9 _-]/g, "")
            .replace(/\s+/g, "-")
            .toLowerCase();

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
        persistAndRender();
    });

    /* ----------------------------------------------------------------------
       Initialization: sweep localStorage, hydrate the form, first render.
       ---------------------------------------------------------------------- */

    function init() {
        const saved = TB.storageGet(STORAGE_KEY);
        const state = saved && saved.fields ? saved : null;

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
        } else {
            applyAccent(DEFAULT_ACCENT);
            addItemRow();
        }

        /* A catalog card can pre-select which document opens. The value is
           matched against DOC_TYPES, so an edited localStorage entry can only
           ever resolve to a document this editor already ships. */
        const preset = TB.takePreset();
        const requested = Object.prototype.hasOwnProperty.call(DOC_TYPES, preset)
            ? preset
            : (state && DOC_TYPES[state.docType] ? state.docType : DEFAULT_TYPE);
        typeSelect.value = requested;

        /* Real-time binding: one delegated listener covers every current and
           future input inside the form, including cloned line-item rows. */
        form.addEventListener("input", persistAndRender);
        form.addEventListener("change", persistAndRender);

        document.getElementById("add-item").addEventListener("click", () => {
            addItemRow();
            persistAndRender();
        });

        const initial = collectState();
        applyDocType(initial);
        renderPreview(initial);
    }

    init();
})();
