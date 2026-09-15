# The Boxed Headings Biodata CV, Measured Off Its Own Artwork

Date: September 15, 2026
Status: Complete
Related: `RESUME_TEMPLATE_ENGINE_IMPLEMENTATION.md`, `RESUME_SHARED_FIELDS_AND_CONTACT_GLYPHS.md`,
`RULED_SERIF_CV_TEMPLATE.md`

## Summary

A supplied design shipped as the `boxed-biodata` template: the Indian biodata
resume, where a filled heading box, a labelled details block and a ruled marks
table are the whole visual grammar. It is the sixth resume template and the
first with a table.

**It is ATS-compliant by construction, and that is a stronger claim than it
sounds** — because this engine emits its own PDF content stream, reading order
is a decision rather than a renderer's guess. A table that would scramble a
parser when produced by a word processor extracts here as clean records. The
proof is an extracted-text dump, reproduced in full below, not an assertion.

Six engine additions were required, each an optional key that leaves the five
pre-existing templates producing **byte-identical display lists** — measured,
not asserted; see Verification.

Every geometric number in the descriptor is **measured off the supplied raster
programmatically**, not eyeballed. The first pass was proportional and wrong by
enough to see: the banner was 25pt where it is really 40. Rendered with the
reference's own content, the template now lands within a **mean 2.98pt** of the
reference's own landmarks.

## Why the design is ATS-safe

The site's documented position is that a template earns the unqualified ATS
claim when it is single column, carries no photograph, and has deterministic
extraction order. This design meets all three, but the third needed work and
the second needed a decision.

### Reading order is the whole game

An applicant tracking system reads the PDF's text stream in the order the text
was drawn. Three constructs in this design could have destroyed it:

- **The education table.** Drawn column by column, it extracts as four
  unrelated lists and every qualification loses its board, its year and its
  mark. `layoutTable` emits **row-major**, so each row extracts as a contiguous
  record. This is the single highest-risk item in the design and the reason the
  table body kind exists rather than being faked with positioned text.
- **The label-and-value rows.** Emitted label, separator, value — three runs in
  reading order — so `Date of Birth : 4 March 1987` survives as a line. Emitted
  as two columns it would have produced six labels followed by six unrelated
  values.
- **The multi-column bullet lists.** Each bullet is atomic, so column order
  cannot scramble a record the way it can in a table. Deterministic either way.

### What looks unsafe and is not

- **The filled heading boxes are a rect with ordinary text over it.** They
  extract as text. The most decorative thing on the sheet costs a parser
  nothing, which is worth knowing before anyone "fixes" it.
- **Cell borders are vector lines**, invisible to a text extractor. The risk in
  a table is reading order, never the rules.
- Text is already guaranteed selectable: `CLAUDE.md` mandates the jsPDF native
  text API precisely because `html2pdf.js` rasterizes and breaks scanning.

### Two deliberate departures from the reference

- **The photograph is opt-in and empty by default.** The reference shows one
  because this format conventionally carries one; US and UK screening does not
  want it. An unfilled slot never reaches the PDF at all — `paintPdf` drops the
  `photoSlot` op — so a default export has no photograph and no placeholder.
- **"Career Objective" is titled "Objective", and "Languages Known" is
  "Languages".** Those are the words a parser's section dictionary carries.
- A third, unrelated to ATS: **the reference's lone "Fresher" line under Work
  Experience is not a special field.** The section is ordinary entries, so a
  fresher types Fresher into the job title and gets exactly that line, while
  anyone with real roles gets a real history. One shape serves both; a
  dedicated free-text note would have served only the first.

## The three engine additions

All three are optional and inert on every template that does not name them.

### 1. A filled box behind a section heading

`type.heading.box` — `{ color, padX, above, below }`. The box is drawn first,
sized to the measured label, and the label keeps its own colour role so it
knocks out of it. `rule.fromBox` runs the heading's rule on from the box's
right edge instead of the column's left, which is what makes box and rule read
as one horizontal feature rather than a box with a line near it.

### 2. `table` body kind

```js
body: { kind: "table", source: "education",
        headerType, cellType, headerFill, border, padX, padY,
        columns: [{ label, field, width, align }] }
```

Column widths are **fractions of the measure**, normalised, so the table tracks
the text column rather than carrying absolute numbers that break on a narrower
page. Cells wrap, and a row is as deep as its deepest cell. Each row reserves
its own full height through the same `ensureRoom` path as everything else, so a
row is never split across a page.

The header does not repeat on a second page. That is a real limitation and an
accepted one for a document whose tables run to a handful of rows; noted here
so nobody has to rediscover it.

### 3. `fields` body kind

```js
body: { kind: "fields", labelWidth, valueWidth, rowGap,
        rows: [{ label, field }, { label, fields: [...], separator }] }
```

Colons align on a fixed column. A row may name one field or join several — the
address is three on this sheet, and `joinFields` drops an empty one with the
separator that would dangle after it. `valueWidth` caps the wrap measure, which
is how the address stays clear of a photograph at the right margin **without**
insetting the whole block; the headings still run the full measure, as the
reference draws them.

### The photograph, and a block-ordering trap

The frame sits beside the details rows at the right margin, which is where the
reference puts it. Two things make that work, and one of them was a defect
first.

`inset.left` of 423 puts its right edge on the measure's right margin, and
`top` is absolute at 130 -- which it can be, because everything above it is
fixed height (a one-line banner, a rule, a heading), so the frame lands beside
the first detail row at y=138.5 whatever the visitor types.

**The block must come AFTER the section, not before it.** A photo block
reserves its own height by pushing the cursor to `Math.max(cursor, top + h)`.
Placed ahead of the Personal Details section, that reservation drove the
PERSONAL DETAILS heading from y=117 down to y=271 the moment a photograph was
uploaded. It shipped that way for an hour and looked perfect throughout,
because the sample carries no photograph and the empty-slot path returns before
the reservation runs -- the whole fault was invisible until something was
actually uploaded. Placed after the section the reservation lands where it
belongs: it pushes OBJECTIVE clear of the frame when the details are shorter
than it, and does nothing when they are longer.

Measured both ways:

| | heading | OBJECTIVE | pages |
| --- | --- | --- | --- |
| no photograph | 117 | 258.5 | 1 |
| photograph | 117 | 285 | 1 |

The heading no longer moves, and OBJECTIVE clears the frame's bottom edge at
260 only when there is a frame to clear.

4:5 is not negotiable: `PHOTO_RATIO` is fixed site-wide precisely so neither
painter can rescale one axis against the other and stretch a face. The
reference's frame is nearer 2:3; 104 x 130 is the closest honest fit.

### Two more, added when the measurements went in

**`block.gapBefore`** overrides a heading's own gap above it, mirroring the
`block.gapAfter` that already existed. The first section of a sheet follows a
masthead where the rest follow a body, and the reference draws exactly that
difference — 25.9pt under the banner against 33 to 36 elsewhere. One shared
value left the top 5pt low and the foot 29pt high once seven sections had
accumulated the error.

**The sign-off's right-hand group is positioned rather than derived.** The
reference puts its signature rule *between* the two labelled rows, not level
with the last one, and insets it 12pt from the margin instead of running it to
the edge — so `rightOffset`, `rightInset` and `rightGap` are parameters.

Fixing that also caught a reservation bug: the block reserved
`rowGap * rows.length` where it draws `rowGap * (rows.length - 1)`, because the
first row sits on the cursor and only the rows after it cost a gap. It
over-reserved by a whole row and broke the page **1.3pt short of fitting** a
block that had 89pt of clear space beneath it.

### And one block: `signoff`

The hand-completed foot of a printed sheet — labelled blanks on the left, a
signature rule on the right. Deliberately not fields: the rules exist to be
written on after printing, so there is nothing to collect and nothing a parser
should find. Labels are real text and cost nothing; rules are lines and are
invisible to an extractor.

## Measurements

The first pass at this template was built to **proportions eyeballed off the
image**, and it was wrong by enough to matter: the banner was set at 25pt where
it is really 40, and the section chips at 9.5pt where they are really 11.3. The
numbers below are **measured off the supplied raster programmatically**, and
the difference is visible at a glance.

### Method

The supplied file is 736 x 1040. Its aspect is 0.7077 against A4's 0.7067, so
it is an uncropped page and its pixels convert at 595/736 with nothing to
correct for. Landmarks were found by scanning pixels: navy runs give the banner
and the heading chips with their text knocked out of them, full-width dark runs
give the rules and the table grid, and ink runs in a column give text baselines.

**Type sizes come from measured WIDTHS through jsPDF's own Helvetica metrics,
never from cap heights.** A scan's antialiasing adds about a pixel either side
of a capital, which inflates a cap-height estimate by roughly two points — that
is exactly how the first pass produced 10pt for a chip that measures 11.3
across seven independent samples. Width has no such error: `Father's Name` is
6.82 em of Helvetica Bold and spans 82.5pt, which fixes the size at 12.1
without any judgement.

The reference is **not set in Helvetica** — its face is narrower per em. Since
this engine only has jsPDF's built-ins, each size here is the Helvetica size
that reproduces the reference's measured line *widths*, because width is what
decides where lines break.

### What was measured

| Element | Reference | Used |
| --- | --- | --- |
| Page | 736 x 1040 raster, A4 aspect | 595 x 842 |
| Rules | x 25.9 to 565.9 | 27pt margins, 541pt measure |
| Banner | "RESUME" 170.6pt wide, baseline 57.5 | sans bold 40pt, baseline 57.5 |
| Heading chip | 19.4pt deep, label 13.0 below the top and 5.7 above the bottom, 7.3 side padding | box above 13, below 5.7, padX 7.3 |
| Chip label | 10.73 to 11.49pt across seven chips, mean 11.26 | sans bold 11.3 |
| Body | two long lines give 12.68 and 12.78 | sans 12.5 |
| Bold labels | two labels give 11.66 and 12.10 | sans bold 12.5 |
| Leading | address second line 18.6 under its first | 18.6 |
| Detail rows | 23.5pt apart | leading 18.6 + rowGap 4.9 |
| Label column | labels at x 33.1, colons at 151.5, values at 160.1 | indent 6.1, labelWidth 118.4 |
| Table | rules 23.5pt apart | leading 14 + padY 4.75 |
| Photo frame | x 432.5-542.0, y 99.2-251.8 | inset 405.5, top 99, width 110 |
| Sign-off | Date blank 84.1 wide, signature rule 89.8 wide inset 12 from the margin | 84, 90, inset 12 |
| Default accent | `#1F4E79` — already a swatch, which is the invariant |

Two numbers are deliberately **not** the measurement. The reference's margins
are 25.9 left and 29.1 right; that 3.2pt asymmetry is scan skew rather than
design, so it is split into a symmetric 27, which lands the rules within 1.2pt.
And 4:5 is forced on the photo frame by `PHOTO_RATIO`, where the reference's is
nearer 0.72 — the frame matches the reference's width and top-left corner and
falls 16pt short at the bottom, which is the closest an unstretchable face can
come.

### How close it lands

Laid out with the reference's **own** content, against the reference's own
landmarks:

| Landmark | Rendered | Reference | Delta |
| --- | --- | --- | --- |
| Banner baseline | 57.5 | 57.5 | 0.0 |
| First chip top | 70.5 | 70.4 | +0.1 |
| First detail row | 117.5 | 117.4 | +0.1 |
| Objective chip | 275.6 | 279.3 | -3.7 |
| Education chip | 355.9 | 357.9 | -2.0 |
| Skills chip | 476.0 | 468.8 | +7.2 |
| Work chip | 574.9 | 570.8 | +4.1 |
| Languages chip | 628.6 | 632.3 | -3.7 |
| Declaration chip | 690.3 | 693.0 | -2.7 |
| Date label | 782.0 | 778.0 | +4.0 |
| Place label | 805.0 | 800.9 | +4.1 |
| Signature caption | 807.9 | 803.9 | +4.0 |
| Signature rule | 790.9 | 786.9 | +4.0 |

**Mean absolute delta 2.98pt, worst 7.2pt**, over one page of A4. The residual
is the part that cannot be fitted with one `gapBefore`: the reference's gaps
above a heading run from 33 to 36 depending on whether a paragraph, a table or
a bullet list precedes it, because each leaves a different amount of descender
under its last baseline. Fitting each separately would be fitting content, not
design.

## Verification

**Preview and PDF agree**: 1 page each.

**The reference's own content fits one page**, which is the check that
separates a metric problem from a content one. The shared editor sample does
not — it is a mid-career CV with two jobs and four bullets, where the reference
is a fresher's sheet whose entire work history is the word "Fresher". At the
reference's true type size that sample is a two-page document, exactly as it is
on Ruled Serif. The metrics are not the thing to change for it.

**The five pre-existing templates are untouched.** Their display lists were
captured under the extended engine, the engine and registry were then reverted
to HEAD with `git stash`, and the lists recaptured from the same state:

| Template | Result |
| --- | --- |
| classic | IDENTICAL |
| grey-rail | IDENTICAL |
| ruled-serif | IDENTICAL |
| photo-rail | IDENTICAL |
| label-rail | IDENTICAL |

The control on that comparison is that the HEAD run reported
`registryHasNewTemplate: false`, proving it really was running the old registry
rather than silently comparing the tree against itself.

**The photograph costs the text stream nothing.** The extracted text is
byte-identical with and without one, and the default export contains no image
at all -- 0 `/Subtype /Image` objects and 0 draw operators at 12,633 bytes,
against 2 and 1 at 213,244 bytes once a photograph is added. (A first pass at
this check grepped for `/Image` and reported one in both: `/ProcSet [/PDF /Text
/ImageB /ImageC /ImageI]` is boilerplate in every jsPDF file, so the substring
proves nothing. `/Subtype /Image` is the honest test.)

**Extraction order**, read out of the generated PDF's content stream in draw
order. Abridged only where it repeats:

```
RESUME
PERSONAL DETAILS
Name | : | Adaeze Nwosu
Father's Name | : | Chukwuemeka Nwosu
Date of Birth | : | 4 March 1987
Mobile No. | : | +1 (555) 014-8820
Email ID | : | adaeze.nwosu@example.com
Address | : | 1400 North Lake Shore Drive, Chicago, IL, 60610
OBJECTIVE
Operations leader with fifteen years running supply chain ...
EDUCATION
Qualification | Board / University | Year of Passing | Percentage
MBA, Operations Management | Kellogg School of Management | 2012 - 2014 | 3.8 GPA
BSc Industrial Engineering | University of Lagos | 2005 - 2009 | First Class
SKILLS
- Supply chain strategy ... - Team leadership
WORK EXPERIENCE
Director of Operations | , | Northwind Logistics
2019 - Present
- Cut average fulfilment lead time 34% ...
LANGUAGES
- English: Native
- Spanish: Upper intermediate (B2)
DECLARATION
I hereby declare that the information given above is true ...
Date | : | Place | : | Signature
```

Every education row is contiguous, every label sits beside its value, sections
are in document order, and no photograph appears.

**Determinism**: with `tb_resume_template` poisoned to `ruled-serif`, so a card
storing no preset would visibly fall through, all six resume cards open their
own template.

**Suite**: static checks 148 passed, 0 failed, including the `CATALOG_ITEMS`
cross-check in both directions.

## Files changed

| File | Change |
| --- | --- |
| `site/js/resume-engine.js` | heading `box` and `rule.fromBox`; `table` and `fields` body kinds; `signoff` block; both new bodies wired into `sectionHasContent` and `bodyFirstLine` |
| `site/js/resume-templates.js` | the `boxed-biodata` descriptor |
| `site/resume.html` | `fatherName`, `dateOfBirth`, `declaration`, education `score`; the address trio ungated to this template |
| `site/js/resume.js` | the new fields in `DEFAULT_STATE` and the sample; `score` collected |
| `site/index.html` | catalog card, card count 49 to 50 |
| `site/js/admin.js` | `CATALOG_ITEMS` entry |
| `site/css/style.css` | `.mock-doc.biodata` miniature |
