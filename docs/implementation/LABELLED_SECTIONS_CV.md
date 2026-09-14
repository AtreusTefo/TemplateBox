# The Labelled Sections CV, and Two Capabilities the Engine Gained For It

Date: September 14, 2026
Status: Built
Brief: `docs/project/LABELLED_SECTIONS_CV_PROMPT.md`

A fifth entry in the resume template registry: a photograph and a name across
the masthead, then five ruled bands, each with its heading in a left gutter and
its content in a column beside it. Traced from a supplied reference at A4.

## It is the first template here the registry could not carry alone

`js/resume-templates.js` opens by saying that adding a template requires no
renderer code. That was true four times and is not true of this one, and the
honest thing is to say which two things had to be added rather than to fake
them in data.

### `type.heading.gutter` -- a label beside its body, not above it

`layoutSection` drew every heading at `anchorX(col, align)` and then advanced
one cursor down the same column. `kind: "two-column"` is not this either: that
is a full-bleed sidebar with its own `firstBaseline` and `bottom`, a second
independent flow, which is how `grey-rail` works. Here the two columns advance
TOGETHER and the next band's rule sits below whichever of the two ran longer.

`layoutGutterSection()` is the whole of it, and three things in it are
load-bearing:

- **The label wraps inside the gutter.** The longest of the five labels sets
  two lines on the reference, which is what fixes the gutter's width at 127
  rather than the label's own measure. A version that assumed one line would
  break on the fourth heading.
- **The room reserved is the taller of the two, never their sum.** A band is as
  deep as its deeper column.
- **The maximum is not taken across a page break.** If the body broke, the
  label is on the page above and the cursor belongs to the page below;
  comparing them would push the new page's first band down by the height of a
  label that is not on it.

### `inset` -- a block in part of its column

The reference puts the photograph top-left of the main column with the name and
the contact rows to its right. `photo-rail`, the only other template with a
photograph, puts it in a sidebar the main column never sees.

`inset` narrows a block's column for the duration of that block. It works
because everything downstream reads `ctx.cols[key]` at the moment it draws --
wrapping width, alignment anchors, bullet boxes, an entry's dates ranged to the
right edge -- so narrowing the column is all it takes to put a block beside
something instead of under it. The cursor is untouched, which is what keeps
pagination working inside an inset block, and `withColumn()` restores the
column in a `finally` so a throw cannot leave it narrowed for the rest of the
page.

It is deliberately not a property of the column: two blocks in one column may
want different insets, and a column carrying one would have to be un-narrowed
by whatever came next.

**The masthead then needs no third column and no second pass.** The name and
the contact rows are inset past the photograph's width and come FIRST, so they
advance the cursor themselves; the photo block follows and only ever pushes the
cursor DOWN -- `Math.max(cursor, top + h + gapAfter)`, which was already there
for exactly this shape -- so whichever side is taller closes the masthead.

### A third, smaller one: `rect` learned a stroke

The reference frames its photograph with a thin keyline. The `rect` op was
fill-only in both painters. It now takes `stroke` and `strokeWidth`, in the SVG
and in the jsPDF half, and `{ kind: "photo", border: {...} }` uses it. An op
with neither fill nor stroke still fills, so nothing existing changed.

## The photograph is 110 wide, not the reference's 119

`PHOTO_RATIO` is 4/5 and is not a template's to choose. The engine takes a
width and derives the height precisely so a descriptor cannot stretch a face,
and `js/resume.js` crops every upload to that ratio on the way in. The
reference's box is close to square, so one of the two dimensions had to give.

The width was kept near the reference's so the name's own x holds, and the
height 4/5 then forces (137.5) still clears the first rule. Changing the
constant was never an option: it would re-crop the photograph of every visitor
who already has one and move `photo-rail`'s layout.

## What the masthead does with no photograph

The photo block draws a short prompt and does NOT advance the cursor, so the
masthead closes up to whatever the text needed -- verified, and the sheet is a
valid CV. The engine's own comment on that behaviour asks the next template
that gains a photo block to check the prompt's height against what follows it;
here the prompt sits at the left margin under nothing, because the text is
inset to its right, so there is nothing to collide with.

**The inset stays either way, deliberately.** Adding a photograph then does not
reflow the sheet, and the prompt marks the space it will occupy. The cost is
that a visitor who never adds one gets a permanently indented masthead -- but
the prompt is preview only (`paintPdf` returns on `photoSlot` before reading
anything), so the export has clean white there rather than a placeholder.

## Colour: no `defaultAccent`, but the accent is live

The reference is near-black on white throughout, with no accent anywhere. Both
obvious readings of that are wrong in different ways: a template that names no
accent role presents a live swatch row that changes nothing, and one that
declares a `defaultAccent` resets the colour a returning visitor chose the
moment they land on its catalog card.

So it declares **no** `defaultAccent`, following `classic`, and the display
name, the headings and the rules name the **accent** role while the body,
entries and bullets stay `ink` at a fixed `#1A1A1A`. An untouched document's
accent is `#1A1A1A`, so the sheet opens monochrome exactly as traced, and the
swatch row still does something.

## The rules are wider than the text column

They run 26.8 to 568.4 on the reference where the gutter labels start at 42.
The text column is 42 to 553 and the bleed is carried by the heading's own rule
spec -- `bleedLeft: 15.2, length: 1.0293` -- rather than by widening the
column, because widening it would carry the gutter labels out with it.
`bleedLeft` and `length` already existed for the grey rail's part-width sidebar
rules.

## What was measured, and what was deliberately not copied

The reference's five rules fall at roughly y 199, 293, 421, 520 and 643. Those
are the one set of numbers NOT transferred: a CV's bands grow and shrink with
what somebody types, so only the gaps are design. Measured, the reference
hand-sets its rule-to-first-baseline at 21 to 32 and its last-line-to-next-rule
at 15 to 18. One value each is used -- 22 and 16 -- because a rhythm that
varies per band for no expressible reason is a defect to inherit rather than a
feature.

The body column's text starts at four slightly different x positions down the
reference, 169 through 190. That is a hand placing blocks. One body column.

**One heading on the reference is misspelled**, with a doubled letter. It is
spelled correctly here. Tracing an artwork exactly is how a typo ships as a
feature.

**The reference's last baseline is at 825 and this template's deepest is 816.**
825 cannot be reached: `ensureRoom` breaks the page when baseline plus line
height passes `bottom`, and 825 + 22 is past the paper. That is the reservation
being conservative and it is the right kind of conservative -- a CV whose last
line sits 6mm from the edge is one many printers clip. 816 puts it at 9mm and
still fits the content volume the reference itself carries on one page.

## The editor's first-run sample lost two skills to this template

`SAMPLE_STATE` in `js/resume.js` is shared by every template and carries a
comment saying it is sized to one page. It was -- for the four that existed
when it was written. On this one it ran to two pages, and page two held
precisely two bullets: the last two skills.

This template sets its skills one per line where Classic and Photo Profile set
them tighter and grey-rail puts them in a sidebar that does not paginate at
all, so it is the binding template now. The two shortest, trailing skills came
out of the sample. That gives every other template slack rather than costing it
anything.

**It leaves no margin, and the comment says so with a measurement rather than
an estimate.** Last baseline 802 against this template's 838 boundary at a 22pt
line height is zero further lines, confirmed by adding a sixth skill back and
watching one bullet land on a second page. Anything added to that object now
costs this template a whole page.

| Template | Last baseline on page 1 | Boundary | Pages |
| --- | --- | --- | --- |
| Labelled Sections | 802 | 838 | 1 |
| Classic | 714.13 | 790.87 | 1 |
| Modern Professional | 721 | 800 | 1 |
| Photo Profile | 528.5 | 800 | 1 |
| Ruled Serif | 714.34 | 830 | 2, structurally |

Ruled Serif is two pages at any content volume and was before this change; it
is documented as such in `RESUME_SHARED_FIELDS_AND_CONTACT_GLYPHS.md` and
removing skills does not and cannot fix it.

## The form already had every field

| Band | Field |
| --- | --- |
| Objective | `summary`, as a paragraph |
| Experience | the `experience` entry list, with `dates` as a right-ranged `aside` |
| Education | the `education` entry list |
| Personal Attributes | `accomplishments`, split on newlines |
| Skills | `skills`, split on commas |

A block's `label` is free text, so the fourth band reads `accomplishments`
under a heading of its own wording. Adding a form field to carry one template's
heading would put a control on every other template's form.

**Education leads with the SCHOOL**, where `classic` leads with the degree.
That is the reference's own order and it is the one that degrades well: this
design is as likely to be used by somebody with no degree to name as by
somebody with one, and a head that is empty half the time drops its whole line.
The degree still sets, on the line under it, and is skipped without consuming
its gap when there is none.

## Testing

`node tests/verify-layout.js`: **1568 passed, 1 failed** -- section 4 alone,
which compares the working tree against `git archive HEAD` and fails while the
work is uncommitted. Its differences are confined to `index` and `resume`: the
new catalog card, and the template picker row gaining a fifth entry.

Section 9 runs against every registered template with no per-template table, so
this one was covered the moment it was registered -- and it **failed**, which is
the check earning its keep. Its colour assertion read `o.fill || o.color`, and a
stroke-only rect carries its colour in neither. The check was amended to test
EVERY colour key an op carries rather than the first one found, which is
stricter than what it replaced and not a loosening to accommodate the new op.

Broken on purpose afterwards to confirm the amended check works: naming a role
that does not exist as the photo keyline's colour failed both
`every colour resolved to a hex` and `exports a PDF whose text is still text` --
the second being independent confirmation that a stroke really does reach the
PDF half.

One thing to know before editing that check again: its body lives inside a
template literal, so a back-tick in a comment closes it and the whole file stops
parsing.

Checked by hand, by laying the sheet out and reading the op list rather than
the code:

| Case | Result |
| --- | --- |
| Reference's own content volume, with a photograph | 1 page, no overflow |
| Same, with no photograph | 1 page, masthead closes up, prompt at the photo's place |
| A gutter band long enough to split | 2 pages; the label stays on page 1, the body continues on page 2, the next heading lands correctly on page 2 |
| Long document | nothing above `firstBaseline` or below `bottom` on either page |
| An almost-empty document | 0 rules, 0 headings, only the name drawn -- no stranded rule |
| PDF | builds from the same op list, 1 page, 11KB |

Feature positions on a sheet with a photograph: rules at 201.5, 283.5, 412.5,
512.5 and 638.5; gutter labels at x 42; body column at x 169; rules 26.8 to
568.4; name at 183, 86. The reference's rules are at 199, 293, 421, 520 and
643 -- the differences are the single rhythm replacing its four hand-set gaps,
and the content lengths differing.

### A collision worth recording

The tile's bullet markers were first given `class="dot"`. This stylesheet
already has a site-wide `.dot`: a 14px bordered circle used for colour
swatches. Every bullet bar came out as a small ring, and nothing failed --
it simply looked wrong. The class is `mk-li` now, and the lesson is that a
generic class name in one shared stylesheet is a collision waiting for whoever
writes the next tile.

## Files

- `site/js/resume-engine.js` -- `withColumn()`, `insetOf()`,
  `layoutGutterSection()`, the `inset` wrapper on `layoutBlock`, and the
  stroked `rect` in both painters
- `site/js/resume-templates.js` -- the `label-rail` entry
- `site/index.html` -- the catalog card, and the card count 48 to 49
- `site/js/admin.js` -- the registry entry, whose title matches the card's
- `site/css/style.css` -- `.mock-doc.labelled`
