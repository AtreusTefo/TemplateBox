# Coding Agent Brief: The Labelled Sections CV

Date: September 14, 2026
Status: Brief. Nothing built yet.
Source: one reference image, supplied with this brief. There is no source
folder, no SVG and no font file.

Build the supplied CV as a fifth entry in the resume template registry: a
photograph and a name across the masthead, then five ruled bands, each with its
heading in a left gutter and its content in a column to the right.

Read this whole brief before writing anything. The section immediately below is
the one that cannot be got wrong, and the two after it decide whether this is a
data change or a code change.

---

## 1. Before anything else: the reference is a filled-in CV of a real person

**It is not a blank template. Every word on it is somebody's.** The image
carries a photograph of an identifiable individual, that person's full name,
their home municipality and province, their mobile number, and the name of a
company they worked for.

None of it may enter this repository: not in code, not in a comment, not in a
sample, not in a test fixture, not in a catalog card, not in a commit message,
and not in a file name. Not the photograph, not a crop of it, not a thumbnail
derived from it, not a colour sampled from a face.

**They are deliberately not quoted in this brief, not even to say what to
avoid.** A brief that reproduces the thing it forbids has already shipped it.
Look at the image if you need to see the shape of a line; write your own
placeholder.

That extends to the catalog tile. `index.html`'s existing resume cards are
filled with invented people and invented employers, and this one must be too.

**What you MAY take from the image**: the layout. Margins, column positions,
type sizes, weights, rule weights and the vertical rhythm are the design, and
the design is what you are building.

---

## 2. This is a resume, and a template here is DATA

It goes in `site/js/resume-templates.js`, rendered by `site/js/resume-engine.js`.
Read the header comment at the top of the registry before anything else: it
states the units, the coordinate convention, the family tokens and the colour
roles, and it is the contract you are writing against.

| You need | It already exists |
| --- | --- |
| A4 in points | `page: { width: 595, height: 842 }`, one-to-one with jsPDF's pt |
| Section headings with rules | `type.heading`, with `rule` and `ruleBefore` |
| Prose | `{ kind: "paragraph", field: "summary" }` |
| Dated entry lists | `{ kind: "entries", source: "experience" }` |
| Bulleted lists from a field | `{ kind: "list", field: "skills", split: "," }` |
| A photograph | `{ kind: "photo" }`, and `PHOTO_RATIO` |
| Contact rows with drawn glyphs | `kind: "contact"`, `"pin"`, `"phone"` |
| Page breaking that will not orphan a heading | `ensureRoom` / `bodyFirstLine` |
| Colour the visitor can change | palette ROLES, never a hex in a block |

**Four templates already ship.** Read `ruled-serif` for full-width rules and
`photo-rail` for the photo block before writing either. The registry's own
header says it plainly: adding a template requires no renderer code.

**For this one that is not quite true, and section 3 is why.** Establish what
the engine cannot do before you start writing data against it, because the
temptation once the other 90 per cent is in place is to fake the last 10.

---

## 3. Two things the engine does not do today

Both are load-bearing for this design. Neither is a reason to abandon the
registry pattern; both are a reason to extend the engine narrowly and say so in
the write-up.

### The heading sits in a gutter, not above the body

This is the design. Five bands, each with its label at the top left and its
content to the right of it, a full-width rule across the top of each.

`layoutSection` in the engine draws the heading at `anchorX(col, t.align)` and
then advances one cursor down the same column. `kind: "two-column"` is not this
either: that is a full-bleed sidebar with its OWN `firstBaseline` and `bottom`,
a second independent flow, which is how `grey-rail` works. Here the two columns
advance TOGETHER -- the next band's rule is below whichever of the two ran
longer.

So this needs one new capability. Scope it tightly: a section may put its label
in a gutter to the left of its body, and the section's height is the greater of
the two. Do not build a general multi-column flow engine for one template.

**A gutter label WRAPS.** The longest of the five labels sets two lines in the
reference, which is how you know the gutter's width is the constraint and not
the label's. A design that assumes one line is a design that breaks on the
fourth heading.

### The photograph is in the masthead, beside the name

`photo-rail` puts its photo in the sidebar, where the main column never sees
it. Here the photograph is top-left of the main column with the name and two
contact rows set to its right, and then the first rule runs under both.

Two consequences to handle rather than inherit:

**`PHOTO_RATIO` is 4/5 and is not the template's to change.** The engine takes
a WIDTH and derives the height, precisely so that a template cannot stretch a
face; `js/resume.js` crops every upload to that ratio on the way in. The
reference's photo box is close to square. You may not have both, and changing
the constant would re-crop the photograph of every visitor who already has one
and move `photo-rail`'s layout. Set the width, accept 4:5, and record which
dimension you matched and why.

**A photo block deliberately does NOT advance the cursor when there is no
photograph** -- it draws a short prompt and nothing else, so a photo-less sheet
prints as though the block were absent. The engine's own comment on that says:
"If another template ever gains a photo block, check this height against what
follows it." You are that template. Decide what the masthead does with no
photograph -- the name closing up to the left margin is the obvious answer --
and make sure the prompt does not land on top of the contact rows.

---

## 4. The reference is not automatically right

Three artworks in the poster family have now had faults traced from their own
sources, and the only thing that transferred was that somebody checked. Check
here too.

- **A section heading on the reference is MISSPELLED.** It has a doubled
  letter. Do not reproduce it. "Trace the artwork exactly" is how a typo ships
  as a feature in four hundred documents.
- **The address line has no spaces after its commas.** That is a
  text-extraction artifact of whatever produced the reference, not a design
  decision, and the editor's own contact field will supply real spacing.
- **The dates in the filled content do not hold up** -- one education entry
  overlaps the other and the experience runs a single month. That is somebody's
  content and none of it is yours to carry; it is listed only so you do not
  mistake it for a layout constraint about field widths.

---

## 5. Geometry, read off the reference

The sheet is A4: the image's own aspect is 1.42 against A4's 1.415, so the
supplied render is the whole page and every proportion below converts directly
onto the 595 x 842 point grid.

**These were read off the image at the size it was supplied and are good to
about a point. Re-measure them.** They are a starting position and a check on
your own measurement, not numbers to paste in.

    page margin, both sides    x 26.8 and x 568.4   (the rules' own extent)
    label gutter starts        x 42
    body column starts         x 169
    photo box                  x 42, y 48, about 119 wide
    name baseline              x 183, y 86, bold sans caps, about 29pt
    contact rows               glyph x 193, text x 211, baselines y 122 and 151
    first rule                 y 199

**Everything below that first rule is CONTENT-DRIVEN and must flow.** The
reference's remaining rules fall at roughly y 293, 421, 520 and 643, and those
four numbers are the one thing here you must NOT transfer: a CV's sections grow
and shrink with what somebody types. They are evidence of the vertical rhythm --
measure the GAPS between a rule and its first baseline, and between a band's
last line and the next rule -- and nothing else.

The same applies across. The body column's text starts at four slightly
different x positions down the reference, 169 through 190. That is a hand
placing blocks, not a grid. Derive ONE body column and use it.

**The rules may not be one weight.** The divider across each band looks heavier
over the label gutter than across the body column. Measure it before deciding;
`type.heading.rule` already carries a `width`, and if there really are two
weights the gutter's is a second rule and not a thicker version of the same
one.

### Type

Everything is one sans family. The name is the only large thing on the page;
the five gutter labels are bold uppercase at roughly half its size; entry heads
and dates are bold at body size; everything else is regular. Bullets are round
markers.

An experience entry sets its role-and-employer bold on the left and its dates
bold on the RIGHT, both on one baseline, ranged to the body column's right
edge. Education sets its school bold on one line and the year regular on the
next.

### Colour

**There is none.** The reference is near-black on white throughout -- no accent
anywhere. That is a decision to make deliberately rather than by omission,
because the editor has a live accent swatch row and a template that names no
role for it presents a control that changes nothing.

`classic` declares no `defaultAccent` on purpose, so that arriving on its
catalog card does not reset the colour a returning visitor chose. Follow that.
Then decide whether the name and the rules take the `accent` role so the
swatches do something, while body text stays `ink` -- and write down which you
chose and why. Do not put a hex in a block either way.

---

## 6. The form already has every field. Do not add one

The five bands map onto what `collectState()` in `js/resume.js` already
collects:

| Band | Field |
| --- | --- |
| Objective | `summary`, as a paragraph |
| Experience | the `experience` entry list |
| Education | the `education` entry list |
| Personal attributes | `accomplishments`, split on newlines |
| Skills | `skills`, split on commas |

**A block's `label` is free text**, so the fourth band reads `accomplishments`
and prints whatever heading this design wants over it. `photo-rail` already
does exactly that. Adding a form field for it would put a control on every
template's form to serve one template's heading.

`catalog: true` is what separates a template a visitor may pick from one that
exists only for the internal harness. It belongs on this one -- but only once
the form can fill every section the layout draws. Offering a template the form
cannot fill presents a picker entry that silently drops half its own layout.

---

## 7. Traps

- **Both mediums must agree.** The preview and the jsPDF export are two
  renderers over one op list; that is the whole point of the engine and it is
  why anything you add has to be added in both halves. The editor has already
  been bitten once by a preview that did not show what the download contained.
- **`family` is `serif|sans|mono`, never a font name.** Anything outside that
  set needs an embedded font file, which inflates every export and reopens the
  WinAnsi encoding problem documented for currencies in `js/docs.js`.
- **No `html2pdf`, and no rasterised text.** Text goes through the jsPDF native
  text API so it stays selectable and ATS-parseable. See
  `docs/error-fixes/RESUME_PDF_RASTERIZED_TEXT_FIX.md`.
- **`bottom` is a reservation boundary, not the last baseline.** `ensureRoom`
  breaks the page when baseline plus line height passes it. Setting it to the
  baseline you want costs a whole line.
- **Do not orphan a heading.** A gutter label is still a heading, and the
  existing `ensureRoom` call reserves room for the heading assembly AND the
  first line of what it introduces -- because a version without the second half
  left a heading alone at the foot of a page. Whatever you add must keep that
  property, and a gutter label that wraps to two lines must reserve for two.
- **Never `innerHTML` for a visitor's string**, anywhere near the preview.

---

## 8. While you are in there

- A catalog card in `site/index.html` with `data-target="resume"` and
  `data-doc="<id>"`, and the matching entry wherever the registry's title is
  read. **The card's title must match the registry's exactly** -- suite section
  1 checks that pair, and it is the one defect in this family that no amount of
  looking would have found.
- **Update the catalog-empty count, 48 to 49.** It is the "see all N" in the
  `catalog-empty` message in `index.html`, and the suite checks it against the
  real card count.
- A `.mock-doc` tile in `site/css/style.css`, built from bars and labels the
  way the other resume tiles are. What identifies this design at thumbnail size
  is the left label column and the ruled bands -- lead with those, and fill it
  with invented content per section 1.
- A suggested id and title: `label-rail` and "Labelled Sections CV". Change
  them if something reads better, but change them in both places.

---

## 9. Definition of done

- The sheet matches the reference in layout, checked by RENDERING it and
  measuring, not by reading the code back. Lay your render beside the reference
  at the same page size and compare feature by feature in points.
- The preview and the PDF agree: same fonts, same sizes, same positions, same
  page count.
- Every section fills from the existing form, and a section with nothing in it
  draws nothing -- no stranded heading, no empty rule.
- It survives content volume in both directions: an almost-empty document, and
  one long enough to break across pages with a band split.
- A document with NO photograph lays out correctly, and the prompt does not
  collide with the contact rows.
- Both a short and a long gutter label sit correctly, including one that wraps.
- `node tests/verify-layout.js` passes. Section 9 runs against every registered
  template with no per-template table, so this one is covered the moment it is
  registered -- read what it asserts before assuming it passes. Section 4 fails
  while your work is uncommitted; that is the working-tree-versus-HEAD
  comparison and it clears on commit. Check its differences are confined to the
  pages listing the catalog.
- Nothing from the reference image is anywhere in the repository: no
  photograph, no name, no number, no address, no employer -- including in
  comments, samples, test fixtures, tile content and commit messages.
- A write-up in `docs/implementation/`, and an index entry in
  `docs/DOCUMENTATION_INDEX.md` under the right section. Record what you had to
  add to the engine and why the registry alone could not carry it.

---

## 10. Do not

- Do not build this as a poster. It is a resume, and it belongs to the resume
  engine.
- Do not write a second renderer, a second page-breaker or a second photo
  cropper.
- Do not change `PHOTO_RATIO`.
- Do not add a form field to serve one heading.
- Do not embed a font.
- Do not reproduce the reference's misspelled heading.
- Do not copy the photograph, the name, the number, the address or the
  employer.
- Do not add a server call, a font CDN, or any third-party runtime.
- Do not use `innerHTML` for any visitor string.
- Do not put working files inside `site/`.
- Do not use emojis anywhere -- code, comments, documentation or commit
  messages.
