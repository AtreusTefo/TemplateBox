# Coding-Agent Prompt: the Trade Counter Receipt

Source artwork: `C:\Users\hp\Downloads\Auto Spares Template\Auto Spares Template\`

| File | What it is | Use it for |
| --- | --- | --- |
| `SVG/GppReceipt-01.svg` | the editable master, 595.28 x 841.89 (A4 points) | ALL geometry |
| `PNG/GppReceipt-01.png` | 2481 x 3508 render, 4.1678 px/pt | checking your result against |
| `PDF/GppReceipt.pdf` | outlined print file | nothing; it carries no text either |
| `JPG/GppReceipt-01.jpg` | the same render, lossy | nothing |
| `Adobe illustrator/GppReceipt.ai` | the working file | nothing; do not try to parse it |
| `Font/Roboto-Regular.ttf` | Roboto Regular 3.009, SIL OFL 1.1 | read the licence note below |
| `Receipt-01.png` (root) | a MARKETING preview with a "PDF SVG AI PNG JPG" banner baked across the bottom | nothing, and do not mistake it for the artwork |

Read this whole file before you open an editor. The first section is not
optional and is not a style preference.

## Before anything else: this artwork carries a real business's private data

The supplied receipt is a real company's own stationery, and it is filled in
with live details:

- a bank account number, with a branch code and a SWIFT code
- a personal Gmail address
- two mobile numbers
- a street address, a P O Box, and a registered company name
- a trademarked logo (a stylised turbocharger wordmark)

`site/` is the Netlify publish directory. Anything you put there is a public
URL. Shipping any of the above would publish a real company's banking details
and a real person's contact details on a template site, and would reproduce
their mark.

**You are rebuilding the LAYOUT, not this company's receipt.** Every string in
that artwork is either a visitor-editable field or a neutral placeholder.
Specifically:

- Do NOT trace, embed, or redraw the logo. The layout gets a visitor-uploaded
  logo box, which this editor already has (see `logo-invoice`).
- Do NOT carry any account number, branch code, SWIFT code, email, phone
  number, address or company name across, not even "as a placeholder so it
  looks right". Placeholders are generic: `Your Business Name`, `Bank Name`,
  `Account Number`, and empty values.
- Do NOT name the business in the template title, the file name, the catalog
  card, or a commit message. Call the template what it IS. "Trade Counter
  Receipt" or "Auto Parts Receipt" describes the layout; naming the shop
  advertises it.
- The bank-details block is a genuinely useful FEATURE of this layout -- a
  counter receipt that tells the customer where to pay -- so keep the block and
  make every line a field. Keep the shape, discard the contents.

If you find yourself copying a digit out of that artwork, stop.

## The task

Add this receipt to `site/js/docs.js` as a new document type. It is NOT a
poster and does not belong in `poster.js`.

`docs.js` is already the invoice-and-receipt editor. It has:

- `DOC_TYPES` -- id to `{ layout, heading, file, labels }`
- `RENDERERS` -- layout to a preview function that builds an HTML sheet
- `WRITERS` -- the same layout to a jsPDF function
- four layouts today: `receipt`, `itemized`, `notice`, `ruled-invoice`

You are adding a fifth layout and one `DOC_TYPES` entry that uses it. The
closest precedent by far is `ruled-invoice` / `logo-invoice`, added September 9,
2026: same money model, visitor-uploaded logo, a ruled table. Read
`renderRuledInvoice` and `writeRuledInvoice` before you write anything, and read
the comment above `"logo-invoice"` in `DOC_TYPES` -- it states the one rule that
matters here too: **a new sheet is not a new set of arithmetic.** Totals,
currency, number-to-words and rounding are shared. Do not fork them.

## Units: the source is in points, this editor is in millimetres

`PAGE = { width: 210, margin: 16, bottom: 281 }` in `docs.js` is MILLIMETRES,
because jsPDF is driven in mm. The source SVG is 595.28 x 841.89 POINTS.

595.28pt is exactly 210mm, so the conversion is one constant: `mm = pt / 2.8347`
(or `pt * 210 / 595.28`, which is the same number and shows its working).

Convert ONCE, where you declare the geometry, and hold the declared constants in
millimetres so they sit in the same units as everything else in that file. Do
not sprinkle the divisor through the renderer -- that is how one number gets
converted twice.

## Geometry, read off the SVG

These are the source's own numbers, in POINTS, exactly as the file states them.
Convert as above. Anything not listed here you read out of the SVG yourself the
same way -- do not estimate it from the PNG.

### The page and the header card

| Thing | x | y | w | h | r |
| --- | --- | --- | --- | --- | --- |
| page | 0 | 0 | 595.28 | 841.89 | -- |
| header card | 45.42 | 28.55 | 501.80 | 156.61 | 8.34 |
| Date/Client/Cell box | 296.32 | 115.47 | 244.69 | 56.76 | 8.34 |
| that box's grey label column | 296.33 | 115.47 | 58.04 | 56.76 | 8.34 left only |
| its middle row | 296.32 | 135.37 | 244.69 | 18.29 | -- |

The label column is rounded on its LEFT corners only and square on the right,
because it is the left end of a rounded box. Its fill is `#dbd9d9`.

### The table

Column edges, x: `45.40`, `127.84`, `339.95`, `422.35`, `505.09`, `546.65`.

That is five columns, and two of them are not what they look like:

| Column | From | To | Width | Header |
| --- | --- | --- | --- | --- |
| Quantity | 45.40 | 127.84 | 82.44 | "Quantity" |
| Descriptions | 127.84 | 339.95 | 212.11 | "Descriptions" |
| (unnamed) | 339.95 | 422.35 | 82.40 | none |
| Amount | 422.35 | 505.09 | 82.74 | "Amount" |
| (narrow) | 505.09 | 546.65 | 41.56 | none |

**Two of the five columns have no heading in the artwork.** Decide what they
are and say so in your write-up rather than shipping two blank columns because
the source had them. The likely reading is that the unnamed 82.40 column is a
unit price and the narrow 41.56 one is the currency's minor unit split off from
the Amount column -- which is why the totals rows below are divided at the same
x=505.09. Make a decision, implement it, and record the reasoning. A column a
visitor cannot name is a column they will not fill.

Header band: y `316.74` to `340.12`. Fill `#f0e8cd`, stroke `#231f20`. Its two
end cells are separate rounded paths (top-left r 6.29, top-right r 8.59); the
three middle cells are plain rects.

Body: 13 rows, y `340.12` down to `593.80`.

**The source's rows are hand-placed and do not share a pitch.** The rects
declare heights of 19.5 with tops at 361.11, 380.45, 399.65, 419.08, 438.50,
457.94, 477.21, 496.81, 535.54 and 554.80 -- and three of the thirteen rows are
not rects at all. Row 1 measures 20.99. Lay your rows out on ONE pitch across
340.12 to 593.80 and let the arithmetic place them. Copying thirteen hand
positions reproduces a wobble nobody intended and leaves you thirteen numbers to
maintain instead of two.

Totals, stacked under the Amount and narrow columns:

| Row | y from | y to | Fill |
| --- | --- | --- | --- |
| Sub Total | 593.80 | 618.18 | none |
| V.A.T Inclusive | 618.18 | 643.53 | none |
| TOTAL | 643.53 | 667.87 | `#f0e8cd`, bottom corners r 8.34 |

The three labels sit OUTSIDE those boxes, right-aligned, ending just left of
x=422.35. "Payment Method:" sits at the left on the Sub Total row's line.

### The footer

`TERMS & CONDITIONS` is underlined by a red rule, `#b92025`, from x `73.98` to
`190.33` at y `694.52`. Five numbered lines follow it.

The bottom decoration is three overlapping swooshes using two linear gradients
(white to black) plus a flat red `#b92025`. The gradients are declared in the
SVG's `defs` as `linear-gradient` (x 0 to 595.85 at y 813.98) and
`linear-gradient-2` (x 411.74 to 595.85 at y 779.89). Copy the path data
verbatim and place it by transform -- it is already in page coordinates, so the
transform is just the page scale. This is the same treatment `PLAYER_ART` and
`drawArt()` use in `poster.js`; read them for the pattern, but do NOT import
them, because that file is a different editor.

## Colours

| Token | Value | Used by |
| --- | --- | --- |
| ink | `#231f20` | every rule and all body type |
| cream | `#f0e8cd` | table header band, TOTAL row |
| grey | `#dbd9d9` | Date/Client/Cell label column |
| red | `#b92025` | the terms rule, the footer swoosh |
| green | `#056534` / `#15562b` | the logo ONLY -- and you are not drawing the logo, so you should not need these |

Hold them in one object, the way `PLAYER_THEMES` does in `poster.js` and for the
same reason. Do not inline a hex twice.

Note `#231f20` rather than `#000000`: that is what the master says, and it is
what `poster.js` already uses for the music player's ground. Keep it.

## The font: bundling is ALLOWED here, and you still should not

The supplied `Roboto-Regular.ttf` is Roboto Regular 3.009 under the **SIL Open
Font License 1.1**. Google relicensed Roboto from Apache 2.0 to OFL in 2024. So
unlike the music player poster -- which had to refuse Microsoft's and Linotype's
faces -- bundling this one is legally permitted, with attribution and the OFL
text alongside it.

Ship Inter anyway, which is what this project already loads. The reasons are
weight and consistency, not licence: a fifth document layout is not a reason to
add a 146KB TTF to a page that already has a typeface, and one editor rendering
in a different face from the other four is a bug report waiting to happen.

**Record the licence finding in your write-up regardless.** The next person to
look at this folder will assume the font is off limits because the last one was,
and they will be wrong. State that it is OFL, that bundling was available, and
that it was declined on weight rather than on law.

Because Inter is not metrically identical to Roboto, measure every fixed-width
line and set it down to fit rather than trusting the source's sizes. `fitLine()`
in `poster.js` is the shape of the answer.

## What the visitor edits

Everything below is a field. Nothing below ships with a real value.

**Header card**
- logo (upload; reuse `LOGO_MAX_EDGE` and the `LOGO_URI` gate, do not write a
  second validator)
- business name, email, website
- three address lines
- Date, Client, Cell No.

**Account details block** -- seven label and value pairs: Account Name, Bank
Name, Account Number, Branch Name, Branch Code, Swift Code, Bank Address.
Labels are fixed, values are fields, all empty by default.

**Table** -- Quantity, Description, and the two columns you named, per row.
Minimum row count as `RULED_MIN_ROWS` does it for the ruled invoice, so an empty
receipt still prints as a ruled form.

**Totals** -- Sub Total and TOTAL are COMPUTED, never typed. "V.A.T Inclusive"
is a rate the visitor sets. Route all of it through the existing money helpers.

**Payment Method** -- reuse `PAYMENT_METHODS`, already in the file.

**Terms** -- five lines, editable, shipping with generic returns wording that
you write. Do not copy the supplied five: they are that company's policy, and
they contain a typo ("PLEASE NOT THAT") that you should not faithfully
reproduce.

Gate every new control with `data-for` in `docs.html`, the way the existing
types do.

## Traps

1. **Two painters that must not disagree.** The preview and the jsPDF writer
   are separate code paths, exactly like `paint()` and `exportSVG()` in
   `poster.js`, and they drift silently. After you build them, sample the two at
   the same points and compare. Do not eyeball one and assume the other.

   Note the preview is an HTML sheet styled by CSS -- NOT an SVG, which an
   earlier draft of this brief said. Its geometry lives partly in
   `css/style.css`, so the two painters share no constants unless you give them
   some: a decorative shape drawn in one and forgotten in the other is the
   likeliest way this drifts, because nothing about its absence is obvious.
2. **The unit boundary.** Points in, millimetres out, one conversion. A number
   converted twice is out by a factor of eight and looks almost plausible.
3. **The source disagrees with itself.** The totals block's left edge is
   `422.21`, `422.29` and `422.35` in three different elements; the table's left
   edge appears as `45.29`, `45.35`, `45.37`, `45.42`, `45.44`, `45.47` and
   `45.49`. These are hand placement, under a fifth of a millimetre, and
   squaring them up is correct here -- unlike the music player's three
   disagreements, which were visible and were kept. Pick one value per edge and
   say which.
4. **Every glyph in the source is an outline.** There are 673 `path` elements
   and zero `text`. You cannot read a single string out of the SVG or the PDF,
   and you must not try to reuse the outlined glyphs as editable type. Retype
   what you need; the PNG is how you check spelling.
5. **`Receipt-01.png` is not the artwork.** It is the marketplace preview, 3701
   tall instead of 3508, with a format banner across the bottom. Deriving
   anything from it puts a blue bar in your receipt.
6. **The narrow fifth column is load-bearing.** It runs the full height of the
   table AND through all three totals rows. If you drop it as decoration, the
   totals stop lining up with the table above them, and the error reads as a
   rounding bug.
7. **The logo box must survive an empty upload.** `logo-invoice` already solves
   this; match its empty state rather than inventing a second one.
8. **Do not let the account block collapse when its values are empty.** It is a
   ruled form and its job is to be filled in by hand after printing. Empty
   fields keep their lines.
9. **The suite will not tell you this looks right.** Section 12 checks the ruled
   invoice's sheet, arithmetic and logo; nothing checks yours until you add it.
   Render the result and LOOK at it, at an empty state and a filled one. The
   last four defects found in this project were all invisible to measurement and
   obvious on sight.

## While you are in there

- Add a catalog card in `site/index.html` and the matching entry in
  `site/js/admin.js` (`{ id, title, category: "documents", doc }`), the way
  `logo-invoice` does. Update the catalog-empty count.
- Add the `data-for` controls to `site/docs.html`.
- Consider a landing page: there are already four receipt landing pages
  (`cash-payment-receipt-template.html`, `itemized-receipt-template.html`,
  `rent-receipt-template.html`, `sales-receipt-template.html`). Match whatever
  they do rather than inventing a fifth shape.

## Definition of done

- The preview matches the supplied PNG in layout at both empty and filled
  states, checked by rendering, not by reasoning.
- The PDF matches the preview, sampled at the same points.
- The PDF's text is SELECTABLE -- `doc.text()`, never a rasterised canvas. See
  `docs/error-fixes/RESUME_PDF_RASTERIZED_TEXT_FIX.md`.
- Sub Total and TOTAL compute; the VAT rate is the only money the visitor types
  besides the line amounts.
- No account number, email, phone number, address, company name or logo from the
  source appears anywhere in the repository, including in comments, test
  fixtures and commit messages.
- `node tests/verify-layout.js` passes. Section 4 fails while your work is
  uncommitted -- that is the working-tree-versus-HEAD comparison and it clears
  on commit. Check that its differences are confined to the pages that list the
  catalog.
- A write-up in `docs/implementation/`, and an index entry in
  `docs/DOCUMENTATION_INDEX.md` under the right section.

## Do not

- Do not put this in `poster.js`. It is a document.
- Do not fork the money model, the currency table, or the number-to-words code.
- Do not add a server call, a font CDN, or any third-party runtime. This project
  is 100% client-side (Critical Rule 1).
- Do not use `innerHTML` for any visitor string.
- Do not put working files inside `site/`.
- Do not use emojis anywhere -- code, comments, documentation or commit
  messages.
- End commit messages with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
