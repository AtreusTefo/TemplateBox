# Shared Resume Fields, Projects and References Sections, Redrawn Contact Glyphs, and Group Editing on the Preview

Date: September 1, 2026
Status: Complete
Related: `RESUME_TEMPLATE_ENGINE_IMPLEMENTATION.md`, `FOURTH_RESUME_DESIGN_GREY_RAIL.md`,
`CLASSIC_TEMPLATE_MIGRATION.md`, `RULED_SERIF_CV_TEMPLATE.md`

## Summary

Four changes to the resume editor, each of which turned out to expose a defect
rather than only add a feature.

1. **Professional Title and Languages are collected and drawn by all three
   templates.** They were gated to one template each, and the gate hid a field
   the visitor had already filled in whenever they switched design. Auditing the
   gates found two more that were plainly wrong: `grey-rail` reads
   `experience[].place` and `education[].place` and renders bulleted entry
   descriptions, and both were gated to Ruled Serif alone.
2. **The two-column template's contact glyphs were redrawn** and no longer sit
   inside a white disc. The handset in particular did not read as a telephone at
   the size it is drawn.
3. **The preview's click-to-edit covers a group of runs**, so a wrapped
   paragraph takes an overlay instead of throwing the visitor back to the form,
   and Tab walks the sheet. Fixing this exposed a measurement bug that already
   existed: clicking from one phrase straight to another opened an overlay 14px
   wide.
4. **Projects and References are new repeating sections**, drawn by all three
   templates. Giving the sample two more sections was enough to reveal that the
   engine had no widow-and-orphan control at all: a heading could be, and was,
   left alone at the foot of a page.

## 1. Fields that every template draws

### What changed

| Field | Drawn before | Drawn now |
| --- | --- | --- |
| `title` (Professional Title) | Classic | all three |
| `languages` | Ruled Serif | all three |
| `experience[].place`, `education[].place` | Ruled Serif and grey-rail | unchanged (the FORM now offers them to both) |

`data-templates` on a field in `resume.html` controls visibility, never
collection: a hidden field is still read by `collectState()` and still saved, so
switching template cannot discard typed content. That was already the design.
The defect was that the gate lists had drifted from what the descriptors
actually render.

Two of the four gates were simply stale, and both faults are of the kind that is
invisible until someone types the missing value:

- **`place` was gated to `ruled-serif`.** `grey-rail`'s experience sub-line is
  `Company, Place` and its education sub-line is `School - Place`. The engine
  drops an empty field along with its separator, so the line read `Company` with
  no dangling comma and nothing looked broken. The template rendered a field the
  form gave no way to fill.
- **"One bullet per line." was gated to `ruled-serif`.** `grey-rail` marks the
  description too, so that visitor was not told. Classic does not — its
  `entryBody` role carries `marker: ""` and `indent: 0`, so a line there is a
  paragraph — which is why the hint is gated to two templates rather than being
  ungated outright. Telling a Classic visitor they are writing bullets is a
  claim the preview immediately contradicts.

### How each template renders the two new fields

**Professional Title.** A `text` block, which draws nothing at all when the
field is empty. Both new blocks are placed so that an empty title leaves the
layout the template was originally measured against:

- `grey-rail`: `gapBefore: 16` under the masthead rule, in a new `titleLine`
  role — regular weight in the body ink, not a second accent line, because two
  display weights stacked read as two names. No `gapAfter`: the Professional
  Summary heading's own `gapBefore: 36` supplies the space below it, and adding
  one here would double it.
- `ruled-serif`: no `gapBefore` at all. The `display` block above already
  carries the artwork's 35.1pt drop, so the title lands on exactly the baseline
  the contact diamonds used to occupy and only the contact row moves down. 16pt
  serif, centred, in ink rather than accent — the accent belongs to the name and
  the six section headings, and a fourth coloured line would flatten that
  hierarchy into a list.
- `classic`: unchanged, it always had one.

**Languages.** Ruled Serif keeps its proficiency meters, which come from its
source artwork. The other two draw a bulleted list:

- `classic` — a plain list in the same role Skills uses. This is the template
  carrying the unqualified ATS claim, and a proficiency bar is a graphic that a
  parser reads as nothing. The level has to survive as words, which
  `English: Native` does and a 66%-filled rectangle does not.
- `grey-rail` — a `sidebarItem` list under a `Languages` sidebar heading. A
  meter would need a track colour that reads against the accent, and every
  accent on the swatch row is a different dark, so one fixed track would be
  muddy against at least one of them. A bullet needs nothing but the rail's own
  white.

### One engine addition: `entryList` on a list body

`languages` is composed by `collectLanguages()` from a repeating set of form
rows; there is no `[data-bind="languages"]` control. A list item's provenance
normally addresses a field and a segment index, which would resolve to nothing
here and make the item silently unclickable.

`body.entryList` makes provenance name the row instead:

```js
body.entryList
    ? Object.assign(entryEdit({ list: body.entryList, index: i }, "name"),
                    { inline: false })
    : fieldEdit(body.field, { part: { split: body.split, index: i } })
```

`inline: false` because one item is `English: Native` — two controls' worth of
value in a single run, so no overlay could write back both halves. It hands off
to the form row, the same answer the Ruled Serif meter's level already gives.
The index counts rendered items and the composer drops rows with no name; the
resolver in `js/resume.js` filters unnamed rows the same way, which is what
keeps the two ends on the same row.

## 2. Contact glyphs

`grey-rail` is the only template with a `contact` block: stacked icon rows down
its sidebar. Every glyph is drawn from display-list primitives (`circle`,
`poly`, `rect`, `line`) rather than an icon font, so the PDF stays vector and
the template needs no external asset. That constraint has not changed.

### The disc is gone, and is now optional

The original artwork knocked each glyph out of a filled white disc. A disc
spends the icon box on its own ring and leaves the glyph about 62% of it; at
13pt that was the difference between a recognisable handset and a grey smudge.
`block.disc` is now optional, and `grey-rail` omits it — the glyphs sit straight
on the rail at full size, which is also what the reference artwork the change
was measured against does.

Removing the disc removes the colour *behind* the glyph, which two of the three
shapes need: the pin's hole and the envelope's crease are knockouts, not
absences. `block.knockout` names that colour and defaults to the disc, so a
template that draws a disc needs no second key. `grey-rail` names the rail role,
not a hex, so both stay correct when the accent changes.

Getting this wrong is invisible on a white disc and glaring on a rail, which is
why it is passed into `drawIcon` rather than assumed to be the disc.

### The three shapes

Every coordinate is a multiple of `u`, the glyph's half extent, so the shapes
scale together from one number.

- **Pin** — a disc and a tapering body that share an edge, so the two primitives
  union into one teardrop instead of reading as a circle sitting on a triangle.
  The triangle's top edge is the disc's *diameter*, at the centre line; any
  higher and the join shows. A knockout circle cuts the hole.
- **Envelope** — a solid body with the flap cut back out of it as a chevron
  running corner to corner. The previous drawing used a knocked-out triangle,
  which removes the top two thirds of the body and leaves a shape that reads as
  an arrow.
- **Handset** — replaced outright. It was an I-beam (flared ends, narrow middle)
  projected onto a 45-degree axis, and it read as a dumbbell. It is now a
  crescent that thickens into a cup at each end: sampled off an arc rather than
  written out as vertices, because the two things that make it read as a phone
  at this size — the bow of the handle and the flare of the cups — are both
  curves, and hand-written vertices can only approximate a curve at one size.

There is no rotate operation in the display list, deliberately: jsPDF and SVG
express rotation differently, and a display list carrying one would have to be
interpreted twice. The handset's tilt is applied to the sampled points instead,
so one set of numbers describes the glyph however it is angled.

### The handset faced the wrong way

The first arc-sampled drawing ran **lower left to upper right**, which is the
mirror of the glyph everybody recognises. This is worth recording because the
arc is symmetrical, so a mirrored handset is still a perfectly plausible
drawing — it does not look broken, it looks like a phone that is subtly wrong,
and nothing in the geometry hints at which of the two it is. The whole
difference is **the sign of `TILT`**.

The correct orientation puts the earpiece at the top left and the mouthpiece at
the bottom right, so a cord would leave toward the lower left and the hollow of
the crescent faces up and to the right. The cups were deepened at the same time
(`FLARE` 0.34 to 0.40 of the arc scale, ramp 0.22 to 0.26) so they read as cups
rather than as a bar that happens to thicken; their thickness is now about three
and a half times the handle's. Re-measured after the change: the glyph occupies
10.22 x 9.13pt inside a 13.2pt icon box and its right edge sits 14.5pt clear of
the text column, and the PDF still carries the 34-vertex closed filled path.

### Verification

The handset is a 34-vertex concave polygon, well past anything the display list
had carried before. Both painters were checked on the same drawing:

- SVG — inspected at roughly 25x by cloning the sheet into an oversized viewBox.
  All three glyphs fill correctly; the handset reads as a receiver.
- PDF — the generated content stream (uncompressed) was parsed and its path
  operators counted. It contains a 34-segment closed filled path (the handset),
  a 6-segment one (the envelope chevron) and a 3-segment one (the pin body),
  which is exactly what the display list describes. All three templates export
  without error: 9.3KB / 13.4KB / 13.4KB.

## 3. Group editing on the live preview

### `multi` split out of `inline: false`

The engine tags each run with the form control that produced it. That
descriptor carried one flag for two unrelated situations, and the editing layer
could only do the more pessimistic thing with both:

| Descriptor | Means | Editing layer |
| --- | --- | --- |
| `{ multi: true }` | several runs, ONE value | overlay covers the group |
| `{ inline: false }` | no overlay can be honest | focus the form control |

Everything that wrapped used to be `inline: false`, so clicking your own summary
scrolled the sheet out from under you. They are separate now because they are
separate problems: `multi` is "this value is bigger than the run you clicked",
`inline: false` is "this run is not the whole of any one value" — half a split
name, a joined contact line, a `<select>`, a composed language row.

### What the overlay does with a group

- Runs sharing a descriptor are found by comparing the serialised `data-edit`
  string, which two runs of one field carry identically by construction.
- Scoped to the run's own `<svg>`, so a paragraph broken across a page boundary
  edits the half that was clicked. One absolutely positioned box cannot span two
  sheets with a band of mat between them.
- A `<textarea>` is used only where the value really is multi-line, meaning a
  whole textarea field. A `part` descriptor addresses one line of one, so it
  takes a single-line input; a textarea there would let a newline split one
  bullet into two without saying so.
- Height comes from the *leading* and the line count, not from the union of the
  ink boxes: those measure glyph extents, so three lines of prose union to about
  two leadings plus a cap height and the last line is clipped. The leading is
  read off the gap between two runs of the group rather than guessed from the
  font size, because every template sets its own and none is a fixed multiple.
- Single-line overlays grow with the text instead of clipping at the width of
  the words they replaced.
- Enter is a newline in a textarea and a commit everywhere else; Ctrl or Cmd
  with it commits either way. Escape cancels. Tab and Shift-Tab walk the sheet
  in reading order, committing as they go, with a wrapped paragraph counting as
  one stop rather than one per line.

### The bug this exposed

Committing dispatches an `input` event on the form, and the form's own listener
re-renders the preview **synchronously** — replacing every node on the sheet.
Both `activate` and the Tab step were holding node references across that
commit. A detached node measures as a zero-sized box, so:

- clicking straight from one phrase to the next opened an overlay 14px wide and
  4px high — a slot too small to see the text in;
- Tab would have landed on a node that no longer existed.

This predates the group work: the original handler had the same
`closeEditor(true)` then `openInlineEditor(target, …)` ordering, and it bit on
every run-to-run click, which is the common case. Both paths now re-resolve by
descriptor after committing, which is the one identity that survives a
re-render — the count of runs changes when an edit adds or removes a wrapped
line, so an index would not do.

### Verified

Per template, driving the real DOM:

- Clicking a plain run, then clicking straight onto the summary: exactly one
  overlay, correctly sized (`TEXTAREA` 409x24 / 275x47 / 438x46, 2 / 4 / 3
  rows).
- Tab moves to the next stop and opens it with the right value.
- Escape closes, and no run is left with `visibility: hidden`.
- Committing a paragraph through the textarea writes to the form control, the
  sheet, and storage. Committing one bullet segment splices into the right index
  of the comma-separated field and leaves the rest intact.

## 4. Projects and References

Two new repeating sections, drawn by all three templates. Both follow the
pattern Work Experience and Education already use, so neither needed a new
body kind: a `<template>` row in `resume.html`, a list id, an entry array in
the state, and an `entries` block per descriptor.

### The fields

| Section | State key | Row fields |
| --- | --- | --- |
| Projects | `projects` | `name`, `role`, `dates`, `description` |
| References | `references` | `name`, `title`, `company`, `email`, `phone` |

**"Your Role or Stack" is one field on purpose.** On a project the useful
second line is as often the stack or the client as it is a job title, and one
label that admits all three beats three fields of which two are always empty.

**Every reference field is optional, and that is a feature.** `buildRuns` drops
an empty field together with the separator that would dangle after it, so a
referee entered as a name alone sets as one clean line rather than
`Jane , , `. That is what makes "available on request" — a name and nothing
else — a supported entry rather than a broken one. Verified against the sample,
whose second referee has no email: her contact line renders as the single run
`+1 (555) 771-0043`, with no orphaned separator before it.

The list ids are `projects-list` and `references-list`, matching the state keys,
because click-to-edit resolves a control through `edit.entry.list + "-list"`.
Getting that wrong makes the runs silently unclickable rather than throwing.
Both were verified end to end: a click on the project name resolves to
`projects[0].name` in the form, and on the referee to `references[0].name`.

### Where each template puts them

Projects sit **directly after Work Experience** on all three: a project is what
the roles above had no room for, not an appendix. References are **last** on
all three, which is where a reader looks.

Each takes its own template's existing entry shape rather than inventing a
fourth one:

- `classic` — head is `Name - Role` in the same shape Experience and Education
  use; dates on a sub-line; description as prose.
- `grey-rail` — head is `Name, Dates` in mixed weights, matching Work History
  directly above it. References sit in the **main column, not the rail**: the
  rail is 224pt wide and already carries contact, skills and languages, and a
  referee's name, title and email would wrap to three or four lines each in
  there and read as a second contact list for the wrong person.
- `ruled-serif` — head left, dates hard right through `aside`, which is this
  design's entry shape. The referee's contact line takes the same right slot.

### The engine bug this exposed: a heading alone at the foot of a page

Adding two sections gave the sample enough content to land a heading in a narrow
band that nothing had reached before, and **Classic ended page one on a bare
`REFERENCES`** with the first referee on page two.

The section block reserved room for the heading assembly — `72` where a rule
sits above the heading, `40` otherwise — and nothing for what the heading
introduces. So the assembly fitted, the heading was drawn, and then the body's
own `ensureRoom` found no space and broke the page, leaving the heading behind.
There was no widow-and-orphan control at all; it simply had never been visible.

The reservation is now the assembly **plus the first line of the body**, and the
body half is *read from the body* rather than restated:

```js
ensureRoom(ctx, key, cursor, pageOf,
           (t.ruleBefore ? 72 : 40) + bodyFirstLine(block.body, T));
```

`bodyFirstLine` returns exactly what each branch of `layoutBody` passes to its
own `ensureRoom` — 40 for `entries`, three leadings for `meters` (a name, a bar
and a level), one leading otherwise. That is the point of deriving it: a section
heading reserves room for its body by asking the body, so the two reservations
cannot drift apart the way a second copy of the arithmetic would.

This is a conservative fix in the safe direction. It can push a section to the
next page in the rare case where the heading and one line would have fitted in
the last 40pt, which costs a little white space at a page foot; it can never
strand a heading.

**Verified by breaking it on purpose.** With the body term neutralised
(`+ 0 * bodyFirstLine(...)`) and the page reloaded, Classic's page one ends on
`REFERENCES` again; with it restored, page one ends on the last language and the
whole References section moves down intact. Checked across all three templates
that no page's last text is a section label.

### Verified

- All three templates draw both sections from the sample. Preview and PDF agree
  on page count for every one of them, which is the invariant the
  single-layout-pass design exists to hold.
- PDFs build clean: 12.6KB / 16.3KB / 16.7KB.
- The form's jump list picks up both new fieldsets automatically.
- "Start blank" empties both lists and leaves one blank row in each, the same
  rule the other three repeating lists follow. They are rows rather than
  `[data-bind]` controls, so the blank sweep does not reach them.
- A saved document from before these sections existed hydrates to one blank row
  in each, and an all-blank row draws no heading — `sectionHasContent` is
  generic over `entries`, so this needed no special case.

### The sample was trimmed back to one page

Adding two sections pushed the sample to two pages on every template. It is one
page again on Classic and grey-rail. **Ruled Serif stays at two, deliberately,
because it cannot be anything else.**

Four cuts, chosen by measuring rather than by eye:

| Cut | From | To |
| --- | --- | --- |
| References | 2 referees | 1 |
| Languages | 3 | 2 |
| Summary | 3 sentences | 2 |
| Second job's description | 2 bullets | 1 |

Result: Classic finishes at y=741.7 against a 790.87 boundary, grey-rail at 721
against 800 — roughly four lines of slack on the tighter of the two. Preview and
PDF agree on one page for both.

**The fit is not linear, and that is the thing to know before editing
`SAMPLE_STATE` again.** References is the last section on every template, so its
heading lands near the foot of the page, and a heading now reserves its own
assembly plus its body's first line — 80pt for an `entries` body. Miss that
window and the whole section moves to page two, taking the rest of the page with
it. Classic measured **y=692 of 790.87 — 98pt of apparently free page — and
still paginated**, because the References heading fell 8pt short of its
reservation. A variant keeping both project bullets and one keeping only one
came out at *identical* height for that reason, which is why the shipped sample
keeps both project bullets and trims a job bullet instead: same page cost,
better sample. Re-measure by rendering; counting lines will mislead.

The one remaining referee carries no phone on purpose. An omitted field has to
leave no dangling separator, and that is what keeps the behaviour demonstrated
now that the second referee, which used to carry the other half of it, is gone.

### Why Ruled Serif cannot be one page

Not a content problem — a structural one. It sets eight sections through a
heading assembly costing **83.5pt each** (18 gapBefore + 27.5 after the rule
above + 11 rule offset + 27 gapAfter) at 24pt centred type with a rule above and
below, in an 807pt column that also carries a masthead. Measured, with **one
word in every field and one entry in every list**, it still ends page one at
y=783 and spills 98.7pt. Dropping Accomplishments *and* a job still spills 266pt
with the real sample.

So the options were to compress a vertical rhythm measured from the supplied
source SVG for every visitor, or to remove one of the sections from that
template alone while the form went on collecting it. **Neither was taken.** Two
pages is this design's honest length, it was already two pages before Projects
and References existed, and the "Page N of M" captions exist for exactly this.

## Files changed

| File | Change |
| --- | --- |
| `site/js/resume-templates.js` | `titleLine` roles and `text` blocks on `grey-rail` and `ruled-serif`; Languages sections on `classic` and `grey-rail`; Projects and References blocks on all three; contact block loses `disc`, gains `knockout`, icon box 15.2 to 13.2pt and text offset 28 to 25pt |
| `site/js/resume-engine.js` | `drawIcon` takes an optional disc and a knockout colour, three glyphs redrawn, handset sampled off an arc; `entryList` provenance on list bodies; `multi` split out of `inline: false`; a section heading now reserves its body's first line through `bodyFirstLine` |
| `site/js/resume.js` | group overlays, textarea overlays, Tab traversal, auto-growing width; `activate` and `stepEditor` re-resolve by descriptor after a commit; `projects` and `references` state, sample rows, and the `hydrateList`/`bindAdd` helpers the two new lists share with a guard for a missing list |
| `site/resume.html` | Professional Title and the Languages fieldset ungated; `place` and the bullet hint extended to `grey-rail`; Projects and References fieldsets and their two row templates |
| `site/css/style.css` | `textarea.rt-inline-editor`; `box-sizing: content-box` pinned on the overlay |
