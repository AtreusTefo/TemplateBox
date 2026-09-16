# Ruled Serif CV: The Template Engine Reaches the Live Editor

Date: August 30, 2026

Status: Built and verified. `resume.html` now offers a template picker, and the
descriptor engine draws both the preview and the PDF for any template chosen
from it.

Supersedes one line of `docs/implementation/RESUME_TEMPLATE_ENGINE_IMPLEMENTATION.md`:
that document's status header says the engine is "not yet wired into
`resume.html`". It is now. Its "Known Gaps Before Integration" list is
addressed below, gap by gap.

## What Was Asked For

A supplied Figma design -- a centred, fully ruled A4 CV set in Times New Roman
with green section headings -- as an editable template under Resumes. Three
source files were provided and all three were read: the Figma HTML export, the
Illustrator SVG, and the PDF. **The SVG is what the measurements come from.**
It is the only one of the three that carries exact baselines on the 595.28 x
841.89 artboard; the Figma HTML export positions text by box top and rounds,
and the PDF cannot be measured without re-deriving font metrics.

## What Was Built

| File | Change |
|---|---|
| `site/js/resume-templates.js` | New `ruled-serif` descriptor. Data only |
| `site/js/resume-engine.js` | Multi-line entry sub-heads; one shared entry-emptiness gate |
| `site/resume.html` | Template picker, green swatch, conditional fields, engine scripts |
| `site/js/resume.js` | Template state, picker, preset intake, render and export dispatch |
| `site/css/style.css` | `.template-row`/`.template-pick`, `.resume-sheet.is-engine`, ruled miniature |
| `site/index.html` | Catalog card carrying `data-doc="ruled-serif"`; card count 20 to 21 |
| `site/js/admin.js` | Matching `CATALOG_ITEMS` entry |

## Two Renderers, On Purpose

> Superseded the same day. Classic was migrated onto the engine and the
> hand-written pair deleted; there is one renderer now. This section is kept as
> the reasoning that held while two existed, and the stopping point it
> describes was real -- the migration was done only after the equivalence check
> it asks for. See `docs/implementation/CLASSIC_TEMPLATE_MIGRATION.md`.

`resume.html` now has two rendering paths, and this is a deliberate stopping
point rather than an unfinished migration.

`classic` is a **sentinel id, not a registry entry**: it names the hand-written
preview and jsPDF writer that have always lived in `site/js/resume.js`. Every
other id addresses a descriptor. The hand-written pair was not rewritten onto
the engine because it renders every resume saved before templates existed, and
the engine document's own integration note asks for an output-equivalence check
before those renderers are deleted. That check is a separate piece of work.

The cost of keeping both is bounded because **the two paths meet at exactly two
places**: `renderPreview()` and the download handler. Both branch on one
expression, `engineTemplate(state.template)`, which returns `null` for Classic.

### Why not `TBResume.byId()`

`byId()` falls back to the **first registry entry** for an unknown id. That is
correct for the internal harness, which always wants something on screen, and
wrong here: a saved document naming a retired template would silently render as
some other design. `engineTemplate()` returns `null` instead, and `null` routes
to Classic -- which is what an editor with no picker produced, so an unknown id
degrades to the historical behaviour rather than to a surprise.

The same reasoning covers a missing script: if `js/resume-engine.js` or
`js/resume-templates.js` fails to load, `catalogTemplates()` returns an empty
list, the picker shows Classic alone, and nothing else changes.

## Measurements

Points throughout, on the 595x842 A4 grid, matching the artboard one-to-one so
every number below is the artwork's own rather than a conversion.

| Landmark | Source artwork | Rendered | Drift |
|---|---|---|---|
| Top hairline | 22.94 | 22.94 | 0 |
| Name baseline | 58.04 | 58.04 | 0 |
| Contact row | 93.15 | 93.14 | 0.01 |
| Summary rule above | 113.36 | 111.14 | -2.2 |
| Skills rule above | 248.47 | 245.04 | -3.4 |
| Experience rule above | 363.36 | 362.14 | -1.2 |
| Education rule above | 516.55 | 522.54 | +6.0 |
| Languages rule above | 629.39 | 616.34 | -13.1 |
| Accomplishments rule above | 741.02 | 729.64 | -11.4 |

Every deviation is accounted for, and none is a defect:

1. **Uniform section gaps.** The artwork's gap between one section's last line
   and the next section's rule varies between 9.24 and 20.21pt with no
   expressible rule. The descriptor publishes one value, 18.
2. **One fewer education line.** The artwork wraps
   "Limkokwing University of Creative Technology" and "- Gaborone" onto two
   lines. The descriptor sets school and place as one run group on one
   baseline, which fits inside the 519pt column with room to spare and is the
   better typography. That saves 16.8pt, which is most of the -13 at Languages.
3. **jsPDF Times metrics** differ slightly from the artwork's Times New Roman.
   This is the fidelity limit already documented for `grey-rail`, where it
   costs 16pt; here it costs under 4.

### One deliberate deviation from the artwork

The source sets `PROFESSIONAL SUMMARY` at 21pt and the other five headings at
24pt. That is the designer having scaled the longest label by eye, not a design
rule -- it fits at 24pt with roughly 260pt of column to spare. **The descriptor
uses 24pt for all six.** A heading that is smaller than its neighbours for no
expressible reason is a defect to inherit rather than a feature to reproduce.

### `bottom` is a reservation boundary, not the last baseline

Set to 815 -- just past the artwork's deepest baseline of 813.61 -- the document
paginated. `ensureRoom` breaks the page when `baseline + lineHeight` passes
`bottom`, so 815 makes 798.2 the deepest line the template can set and pushes
the final accomplishment wrap onto page two. It is **830** now, which puts the
deepest usable baseline at 813.2, within half a point of the artwork's own.
Worth remembering when adding any future descriptor: `bottom` must be the last
baseline plus one line height.

## Two Engine Changes

Both are backward compatible, and both were needed by this design rather than
speculative.

**`entries.sub` accepts an array.** The artwork stacks company, role and place
on three baselines. Expressed as the single comma-joined line the engine
previously allowed, that reads "Graphic Designer, Gaborone, Botswana" -- a
double comma that misrepresents the design. Each array element keeps its own
runs and its own `gapBefore`, and an element whose fields are all empty is
skipped without consuming its gap. A plain object still means exactly what it
did, so `grey-rail` is untouched.

**One shared entry-emptiness gate.** The row loop previously skipped any entry
whose head runs and bullets were both empty. With `company` as the head of this
template's experience block, an entry with a role and a location typed but no
company vanished silently, taking the visitor's text with it. `entryHasContent()`
now considers head, every sub line, the aside and the bullets, and
`sectionHasContent()` calls the same function -- they must agree, or a section
renders a heading over nothing, or hides a heading over something.

This does change `grey-rail`: an experience row carrying only a company now
renders where it previously did not. That is the correct direction. Typed data
appearing is not a regression.

## Fields

Gap 1 of the engine document was "new state fields, none of which the current
resume state or form has". This template needs four the form did not collect:
`languages`, `accomplishments`, and `place` on both experience and education
entries. All four are added.

They are hidden for Classic, which draws none of them, through a
`data-templates` attribute listing the templates that draw each field. Two
consequences worth knowing:

- **Hidden fields are still collected and still saved**, deliberately, so
  switching templates never discards typed work. This is the same judgement
  `js/docs.js` makes for its `[data-for]` fields.
- **A cloned entry row carries every template's conditional fields**, so
  `addEntryRow()` reconciles the new row before appending it. Sweeping the
  whole document on every keystroke instead would be waste.

`TB.refreshFormNav()` runs after the toggles, so the section jump list is built
from the fieldsets the current template actually shows.

Gap 2, "bullet descriptions", is handled the same way: `description` is one
field, split on newlines into bullets by this template and reflowed as prose by
Classic. The shipped sample content is written one complete sentence per line so
it reads correctly in both.

## Languages: the Rule Is the Control

`languages` shipped as a textarea taking `Name: Level` lines, under a hint
explaining that a CEFR band or a percentage drew the proficiency bar and other
wording did not. Reported as confusing, and rightly: that puts the rule in a
sentence and leaves the visitor guessing which wordings count. **The levels that
draw a bar are the choices now**, in a row per language -- a name, a `<select>`,
and an "Other" option that reveals a free-text box for anything else.

**The stored format did not change.** `fields.languages` is still one
`Name: Level` line per language; the rows compose it on collect and parse it
back on load. That keeps the engine's `meters` body, the template's `levels` map
and everything already verified against them untouched, and it means every
document saved before the change still loads -- a level the option list does not
carry simply arrives as "Other" with its wording intact. Verified against a
seeded legacy string: `German: Upper intermediate` and `Italian: 40%` both come
back as "Other" with their text, `Zulu` comes back with no level, and the
round-tripped string is byte-identical.

Three things worth knowing:

- **The option list is the single source of the known levels.** `js/resume.js`
  reads the `<option>` values back out of the row `<template>` rather than
  repeating them, so adding a level is an HTML-only change.
- **Every fixed option must be recognised by the template's `levels` map**, or
  the picker offers a level that silently draws nothing. Six of the seven carry
  their CEFR code in brackets; `Native` has no code and is a key of its own,
  added for this. Verified: all seven draw bars at 1, 1, 0.83, 0.66, 0.5, 0.33
  and 0.17.
- **`levels` keys are matched in order and bare words are avoided on purpose.**
  `meterFraction` returns the first key that matches, so the codes come first --
  were `Intermediate` a key ahead of them, `Upper intermediate (B2)` would match
  it and draw 0.5. Bare words are also a trap in the other direction: `Not
  fluent` would match a `Fluent` key and draw a FULL bar for the opposite of
  what was typed. Verified that it draws none.

The custom field's hint says a percentage still draws a bar, because it does --
`meterFraction` matches one before it consults the level names, and claiming
otherwise would have replaced one inaccurate hint with another.

## The Accent Swatches Stay Live

Every non-ink colour role in the descriptor resolves to `accent` rather than to
a literal green. Hard-coding the green would have left the swatch row changing
nothing on this template, which is the dead-control defect class this project
has hit before.

`defaultAccent` on the descriptor is what makes the sheet open green anyway: it
is applied when the template is **chosen** -- from the picker, or by arriving on
the catalog card -- and never re-applied when a saved document is restored. So
a returning visitor keeps the accent they picked. The template's green was also
added to the swatch row so it is reachable again after a change.

**Classic never imposes an accent.** Only a template that declares one applies
one, so landing on a Classic catalog card does not reset a returning visitor's
colour.

## A Document That Runs Over Says So

Reported after the first build: a CV longer than one page rendered as one long
A4 rather than as a stack of pages.

It was a real defect and the cause was that **the container carried the paper**.
`.resume-sheet` kept its own white ground and border while each `<svg>` page had
neither, so the 12pt gap between two pages was white on white. Measured on the
sample document: one 1116px white column with an invisible seam, one border
drawn around the pair, and nothing anywhere telling the visitor their resume had
run to two pages.

The paper moved onto the pages and the container became a workspace mat:

| | Before | After |
|---|---|---|
| Container | white ground, 1px border, no padding | mat (`--color-bg`), 0.75rem padding |
| Each page | no ground, no border, no shadow | white, `--color-border-strong`, soft lift |
| Gap between pages | 12px, white on white | 49px of visible mat |
| Page count shown | nowhere | "Page 1 of 2" under each page |

Three things worth knowing:

- **The labels are editor chrome and are added in `js/resume.js`, not the
  engine.** The engine paints the preview and the PDF from one display list, so
  anything it drew would be exported into the file. `renderPreview()` calls
  `replaceChildren()` first, so they are rebuilt each keystroke and cannot
  accumulate.
- **A single-page document gets no labels at all** -- verified: trimming the
  sample to one page leaves zero label elements and no page chrome.
- **The mat stays light grey in dark mode**, inheriting the light palette from
  the paper-surfaces rule. That is deliberate rather than an oversight of the
  dark-mode work: it is how document editors present paper, a light mat under
  white pages whatever the chrome is doing, and it keeps the labels legible in
  both themes. Verified in dark mode: pane `rgb(29,28,23)`, mat
  `rgb(244,243,239)`, pages white, break clearly visible.

**Classic was unaffected by this change, and had no page model of its own.** A
Classic resume that exported to two pages gave no indication of it in the
preview: that preview was a flowing HTML div, never A4-proportioned, with no
concept of a page boundary and so nothing to label. It could not be fixed in
CSS.

**That is no longer the case.** Classic was migrated onto the engine later the
same day and now carries the same mat, per-page borders and "Page 1 of 2"
captions, because it now has the page model it lacked. See
`docs/implementation/CLASSIC_TEMPLATE_MIGRATION.md`, which also records the
equivalence check run before the hand-written renderers were deleted.

## The Chosen Template Outlives the Document

`tb_resume_template` is a second, single-value key, and it exists because of a
defect found at 320px during verification rather than by design.

Sample content is **deliberately never persisted** -- that is what keeps the
"this is sample content" notice and its Start blank button honest on a second
visit. So a visitor who arrived on the Ruled Serif card, looked around without
typing anything, and reloaded, silently dropped back to Classic: they had chosen
a template and watched it revert.

Writing the sample document to storage to fix that would have cost the
onboarding notice. Instead the template alone is stored, and the precedence is:

1. A catalog card's preset, if the visitor just arrived on one.
2. A **saved document's own** `template`.
3. `tb_resume_template`, the last selection.
4. Classic.

So it is a fallback, not a competing source of truth -- a saved document always
carries its own template and step 3 is never consulted for it. Verified both
ways: the template survives a reload with nothing typed and the sample notice
still appears, and a saved Classic document still opens as Classic with the
fallback key forced to `ruled-serif`.

## jsPDF Load Order

`js/resume.js` is a plain end-of-body script and therefore runs **before** the
deferred jsPDF tag in the head. The engine measures every line through jsPDF and
cannot lay out without it, so the first engine render on a cold load has nothing
to measure with.

Rather than paint the wrong design and swap it, or throw, the sheet is left
untouched and repainted once jsPDF has run -- `DOMContentLoaded` fires after
deferred scripts, with `load` as the backstop for a slow CDN, and a flag makes
the repaint happen once however many keystrokes arrive first. `.is-engine` is
added only once a page has actually been painted; applied to an empty container
it would collapse the preview pane to nothing and back.

The classic renderer needs none of this and still paints immediately.

## Catalog Wiring

The card carries `data-doc="ruled-serif"`, which `bindLaunchControls()` in
`js/app.js` hands to the editor through localStorage. It is the first resume
card with a preset; the three above it have none and therefore open whatever
template was last used.

**The existing three cards were deliberately left without presets.** The
verification suite keys each card by `data-doc || slug(title)`, so giving all
three `data-doc="classic"` would collapse them to one id and orphan their three
`CATALOG_ITEMS` entries. The consequence is real and accepted: a visitor on
Ruled Serif who clicks "Minimalist ATS Resume" stays on Ruled Serif. That is
unchanged from how those cards have always behaved, and the picker is one click
away.

Three files move together for one card, and the suite enforces all three:
`index.html`'s card, `CATALOG_ITEMS` in `js/admin.js`, and the "see all N" count
in the catalog-empty message. `js/search.js` needs nothing -- it imports the
real card nodes from `index.html` rather than keeping a list.

## ATS Position

This template is **single-column**, so it carries none of the parsing risk the
engine document flags for `grey-rail`'s two-column rail. Verified on the
exported PDF: 64 `Tj` text operators, zero image XObjects, extraction order
deterministic because the engine controls `doc.text()` call order. The
`/ImageB /ImageC /ImageI` tokens that appear in the file are jsPDF's boilerplate
ProcSet array, not an embedded image -- worth knowing before a naive grep for
`/Image` raises a false alarm.

## Verification

Driven against `npx serve` through the Browser pane, plus the full
`tests/verify-layout.js` suite.

| Check | Result |
|---|---|
| Layout landmarks vs the source SVG | table above, all explained |
| Single page for the artwork's own content | 1 page, no overflow |
| Preview text nodes vs PDF text operators | 64 and 64, identical |
| PDF embeds no image | 0 image XObjects |
| Console errors on `resume.html` | none |
| Classic default on a cold load | picker on Classic, engine fields hidden |
| Template switch | green applied, fields shown, jump list rebuilt, state saved |
| Saved template survives reload | yes |
| Template survives reload with nothing typed | yes, sample notice intact |
| Saved document's template beats the fallback key | yes |
| Every fixed language level draws a bar | 7/7, at 1, 1, 0.83, 0.66, 0.5, 0.33, 0.17 |
| Custom level wording draws no bar | "Conversational" and "Not fluent" both none |
| Language rows round-trip through storage | custom row survives reload with its wording |
| Legacy free-text languages still load | hydrate as "Other", string byte-identical |
| Two-page document reads as two pages | 49px mat band, per-page border and lift, "Page 1 of 2" |
| One-page document carries no page chrome | 0 label elements |
| Classic unaffected by the page chrome | no `.is-engine`, white sheet, 32px padding, 0 labels |
| Multi-page presentation in dark mode | dark chrome, light mat, white pages, labels legible |
| 320px: overflow, picker row, field sizes | 0px overflow, one row, no field under 16px |
| `CATALOG_ITEMS` cross-check | passes, and fails when broken on purpose |
| Full suite | 1171 passed; 1 failed, section 4 only (see below) |

Section 4 diffs the working tree against `git archive HEAD` with `js/ads.js`
blocked, so it reports any intentional layout change until that change is
committed. Its 56 differences were parsed rather than eyeballed: **every one is
on `index` or `resume`, and every one is a height increase, with zero difference
in x, y or width.** That is exactly the footprint of one added catalog card and
the editor's new form controls -- no inset, width or other-page regression.

The catalog check was broken deliberately -- the title changed to "Ruled Serif
CVX" -- and confirmed to fail before being reverted, per the standing rule in
`CLAUDE.md` that an assertion which has never failed is not evidence.

## Adding the Next Template

Unchanged, and now it reaches visitors: copy an entry in
`site/js/resume-templates.js`, give it `catalog: true`, and add a card in
`index.html` with `data-target="resume" data-doc="<id>"` plus the matching
`CATALOG_ITEMS` entry and card count. The picker builds itself from the
registry, so no HTML lists templates by hand.

`catalog: true` is what separates a template a visitor may pick from one that
exists only for `tools/resume-template-preview.html`. `grey-rail` is
deliberately unflagged: it reads `address`, `city`, `postcode` and `phoneAlt`,
none of which this form collects, so offering it would present a picker entry
that silently drops half its sidebar.
