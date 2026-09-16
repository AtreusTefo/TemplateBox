# Classic Migrated onto the Engine: One Renderer, and a Preview That Tells the Truth

Date: August 30, 2026

Status: Migrated and verified. `site/js/resume.js` no longer contains a
renderer. Every template, Classic included, is a descriptor in
`site/js/resume-templates.js` drawn by `site/js/resume-engine.js`.

Closes the last item of `RESUME_TEMPLATE_ENGINE_IMPLEMENTATION.md`'s "Known
Gaps Before Integration": *"`resume.js` is untouched. Migrating the three
existing single-column templates onto this engine is a separate step, and
should follow the equivalence check in the sketch: compare output both ways
before deleting the hand-written renderers."* The comparison was run first, and
is recorded below.

## Why This Was Worth Doing

The editor carried **two renderers for Classic that agreed about content and
about nothing else**:

| | Hand-written preview | Hand-written PDF writer |
|---|---|---|
| Medium | HTML `<p>` elements in a `div` | jsPDF, millimetres |
| Name | 1.75rem Playfair, `var(--accent)` | 24pt Times bold, accent |
| Headings | 0.9375rem, letterspaced | 12pt Times bold |
| Body | 0.8125rem | 9.5pt Helvetica |
| Page model | none, a flowing div | real A4 pagination |

So the live preview never showed what the download would contain, and a Classic
resume that exported to two pages **said so nowhere** — the defect reported for
Ruled Serif, which Classic had in a worse form because it had no page concept
at all to fix.

Both are deleted. What replaced them is one descriptor.

## The Equivalence Check

Run **before** anything was removed, comparing the produced PDF **files** rather
than two instrumented code paths: HEAD's `buildPdf` was pulled verbatim out of
`git show HEAD:site/js/resume.js`, run in the same page as the engine against
identical state, and both outputs parsed straight out of their PDF content
streams for text-showing operators, positions, font, size and colour.

Runs were merged by baseline before comparing, because the engine legitimately
draws as several runs what the old writer drew as one string: a mixed-weight
entry head, and a bullet marker plus its text.

| Case | Lines | Pages | Text mismatches | Style mismatches | Lines on a different page | dx | dy |
|---|---|---|---|---|---|---|---|
| Empty document | 1 / 1 | 1 / 1 | 0 | 0 | 0 | 0 | 0 |
| Sample resume | 28 / 28 | 1 / 1 | 0 | 0 | 0 | 0 | -1.8 to +4.4pt |
| Six long entries | 44 / 44 | 2 / 2 | 0 | 0 | 0 | 0 | -1.8 to +11.3pt |

Every line carries the same text, in the same order, in the same font, size and
colour, at the same x, and the page break falls at the same content. Only
vertical position moves, by at most 11.3pt across two full pages.

### Why any vertical drift at all

The old writer's section spacing was **incidental rather than designed**: the
gap from one section's last line to the next heading was `that line's own line
height + that block's own trailing gap + 4mm`, so it came out different after
every kind of content — 23.7pt after the summary, 32.2pt after a description,
28.0pt after education dates. The descriptor publishes one value, 27pt. That is
the entire source of the drift, and a uniform section rhythm is the better
answer.

One other deliberate difference: the old writer started continuation pages at
18mm and page one's first baseline at 22mm. The descriptor uses 22mm for both,
so every page has the same top margin.

### A real bug the check caught

The engine read its bullet indent as `t.indent || 8`. Classic's entry
description is **prose, not a list**, so it declares `indent: 0` — and `0 || 8`
is 8. The descriptions came out indented 8pt from the margin *and* wrapped to a
column 8pt narrower than they should have been.

Nothing about the page looked wrong; it was found only because the comparison
reported `dx: 8` on exactly the description lines. It is `t.indent === undefined
? 8 : t.indent` now. This is the argument for the equivalence check in one
example: the defect was invisible to the eye and obvious to the diff.

## What Changed in the Engine

Three additions, all backward compatible, all required by this template.

- **A `text` block kind**: a paragraph belonging to no section, for the
  professional title and the contact line, which sit under the name with no
  heading over them. `field` reads one value; `fields` + `separator` joins
  several and drops the separator around empty ones, so a visitor who filled in
  only a phone number gets no dangling bars. It wraps to the column, unlike
  `display`, which is the one-line masthead.
- **`bullets.type` on an entries body**, so an entry description can be prose
  while the same template's skills keep their markers. It was hard-wired to
  `T.bullet`, and one role cannot be both.
- **The `indent` falsy-zero fix** above.

`grey-rail` and `ruled-serif` are untouched by all three: verified after the
fact that Ruled Serif's thirteen rules land on exactly the same coordinates as
before the migration, and that grey-rail still lays out.

## What Was Deleted

| Removed | Lines |
|---|---|
| `renderClassic()` and its `el()` helper | 72 |
| `buildPdf()`, `PAGE`, `INK_CHARCOAL`, `INK_GRAY`, `hexToRgb()` | 112 |
| `.rs-name` / `.rs-title` / `.rs-contact` / `.rs-section` / `.rs-heading` / `.rs-entry` / `.rs-entry-head` / `.rs-entry-meta` / `.resume-sheet ul` | 53 |

The CSS went with the renderer it was sized for, per this project's standing
rule that retiring a unit deletes the rule sized for it. Confirmed dead first:
no `.rs-*` class is referenced by any script or page, and the rendered sheet
contains zero `[class^=rs-]` nodes.

`renderPreview()` and the download handler each collapsed from a two-path
branch to one call.

## Consequences Worth Knowing

- **`classic` is a registry id now, not a sentinel.** It used to mean "use the
  hand-written renderer in this file". Saved documents naming it keep working
  because the descriptor carries that exact id.
- **`engineTemplate()` falls back to Classic, not to null.** Previously null was
  the signal to use the built-in renderer; there is no built-in renderer, so an
  id the registry no longer carries resolves to Classic — which is what this
  editor produced before it had a picker. `selectTemplate()` takes the resolved
  descriptor's **own id** rather than testing the return for truthiness, or an
  unknown id would be stored verbatim and re-resolved on every load.
- **The picker builds itself entirely from the registry.** Classic used to be
  prepended by hand because no descriptor described it.
- **There is no longer a renderer that works without jsPDF.** The hand-written
  preview needed no library; the engine measures every line through jsPDF. The
  first paint already waited for the deferred CDN tag, and now a `load` event
  that arrives with still no library puts a message on the sheet instead of
  leaving an empty white pane forever. `.sheet-message` is that state, and it is
  deliberately plain — it is a fault report, not part of any document.
- **Classic now paginates visibly**, with the same mat, per-page borders and
  "Page 1 of 2" captions Ruled Serif got. This is the change that was asked for,
  and it could not have been made in CSS: it needed the page model the migration
  brings.

## Verification

| Check | Result |
|---|---|
| Equivalence, three cases | table above; 0 text, 0 style, 0 x differences |
| Ruled Serif unchanged after the engine edits | 13 rules at identical coordinates |
| grey-rail still lays out | 1 page, 59 ops |
| Classic renders through the engine | `.is-engine`, real A4 page, 0 `.rs-*` nodes |
| Accent swatch still drives Classic | headings navy to burgundy on click |
| Classic multi-page | 2 pages, 49px mat band, "Page 1 of 2" |
| Download from the UI | `adaeze-nwosu-templatebox.pdf`, no console errors |
| Full suite | 1171 passed, 1 failed (section 4 only) |

Section 4 diffs the working tree against `git archive HEAD` and therefore
reports any intentional layout change until it is committed. Its 56 differences
were parsed rather than eyeballed: all are height-only, on `index` and `resume`
alone, with zero x, y or width drift, and each group is accounted for.

| Group | Delta | Cause |
|---|---|---|
| `index` feed and main | +20.8 to +514.8 | the added Ruled Serif catalog card |
| `resume` edit pane | +93.6 | template picker, green swatch, two new fieldsets |
| `resume` preview pane, 1024-1336px | -18.6 to -119.8 | the pane is now exactly as tall as the A4 page it holds |

That last group is the migration showing up as a measurement. The preview pane
used to be a flowing HTML div with a 28rem floor; it now contains a real A4
sheet, so at 1024px it is 668.2px tall — `468.5 x 842/595` plus padding — rather
than a height that depended on how much sample text happened to be in it. Above
1336px the sticky pane is capped and the number is unchanged.
