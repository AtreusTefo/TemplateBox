# The Template Studio: Authoring Registries From Admin

Date: September 14, 2026
Status: Built
Brief: `docs/project/ADMIN_TEMPLATE_STUDIO_PROMPT.md`

A panel in `admin.html` that creates and edits the resume/CV templates and the
receipt/invoice document types, previews them against the real engine, and
writes them into the working copy.

## The asymmetry that set the scope

The two registries look alike and are not, and the panel is shaped around the
difference rather than papering over it.

**`js/resume-templates.js` is data over a generic engine.** Its own header says
adding a template requires no renderer code. So a resume template is fully
authorable: create from nothing, preview, publish.

**`DOC_TYPES` in `js/docs.js` is data over FIVE hand-written functions.** Its
`layout` key names one of `receipt`, `itemized`, `notice`, `ruled-invoice` or
`trade-receipt`, each a function in that file. So a document **variant** is
authorable -- a new heading, a new download name, its own field labels, one of
the five layouts -- and a new **layout** is JavaScript and stays JavaScript.

The panel says that in the UI, not only here. The layout control is a fixed
`<select>` rather than a text field, and the help text explains why. A form
that silently cannot do what its heading implies is worse than one that admits
the limit.

## Editing JavaScript source safely

This is the part that could have destroyed a repository, and it is why the
module is split in two: `js/admin-studio.js` decides what is safe to write and
`js/admin-studio-ui.js` only asks.

The catalog thumbnail panel can splice `index.html` and then prove the result
with `DOMParser`. There is no `DOMParser` for a program. The design is
therefore:

1. **Locate one entry, never the whole file.** Anchored on the entry's own
   `id`, with the object's bounds found by matching braces outward --
   `matchBalanced()`, which skips strings, template literals, line comments and
   block comments. Only that byte range is replaced.
2. **Prove the result before writing it.** `verifyRegistry()`:
   - `new Function(source)` compiles the whole file without running a line of
     it, which is the cheapest possible proof that the splice did not break it;
   - the registry's own literal is extracted and evaluated **on its own**, in
     isolation -- not by executing the site's source inside the admin page, and
     necessarily so, because `DOC_TYPES` is private inside an IIFE and
     executing `docs.js` would not expose it at all;
   - the entry count must be what the edit was for;
   - **every entry this edit was not about must come back deep-equal to what it
     was**;
   - the authored entry must come back exactly as written.
3. **Any failure writes nothing** and names the check that failed.

Step 2 is what makes step 1 safe, and the division of labour is deliberate:
**the scanner is allowed to be fooled and the check is not.** `matchBalanced()`
does not handle regular expression literals, because telling a regex from a
division needs a parser. Neither registry contains one inside an entry today;
if one ever appears the splice will be wrong, and the verification will catch
it and refuse. That is stated in the code at the point where it matters.

## What a splice does not preserve, and saying so first

Re-serialising an entry keeps its meaning and destroys its prose. That is not a
small loss in this project: `classic` alone carries **3,389 bytes** of comment
explaining numbers nobody could re-derive.

`commentCost()` measures it, and the panel reports the real byte count **when
an entry is opened** rather than when it is published -- by the time somebody
has typed into a textarea, "your comments will be lost" is news about a
decision they have already made. Comments on entries the edit is not about are
untouched, because those bytes are never rewritten.

`serializeEntry()` is deliberately not `JSON.stringify`: keys keep the order
they were given, identifiers stay unquoted, short objects stay on one line, and
the indentation matches the file. A dump with quoted keys would produce a diff
nobody can read.

## Reading from the served site, writing through the folder

The registries are read with `fetch()` from the same origin, so the list, the
editor, the validation and the preview are live on **any** browser with no
folder connected. Only writing needs `window.TBProjectFolder`, which is
Chromium only.

That is not a fallback bolted on afterwards. On Firefox and Safari, Copy Entry
and Copy Card Markup are the whole workflow, and the panel says so rather than
disabling itself.

## The write order inverts from the thumbnail panel's

That panel writes images first and patches markup last: an unreferenced file is
inert, a reference to a missing file is a visible defect.

Here the same principle points the other way. A descriptor nothing links to is
inert; a catalog card whose `data-doc` names a template that does not exist is a
broken entry point. So the registry is written first and the card last, and
every file in a publish is **planned and proved before any of them is written**.

A resume publish is up to three files: the registry entry, a catalog card in
`index.html` with the empty-search count corrected, and a line in the catalog
list in `js/admin.js`. A document type is one.

## Two things the panel deliberately will not do

**It does not replace an existing catalog card.** A card's tile is design
somebody drew by hand, and regenerating it would throw that away. Editing a
template that already has a card leaves the card alone.

**It does not delete markup.** Removing a template removes its registry entry
only; the card, the admin line and the count are left for the operator, because
deleting markup they may have hand-edited is not a decision this panel should
take on its own. The confirm dialog says so.

A newly published card does carry a generated tile -- a plain ruled sheet in
the template's own accent -- because a card with no preview reads as broken in
the grid. The panel calls it a starting point to replace, in the message, at
the moment it is produced.

## Validation, before any of the file machinery is reached

`validateResume()` catches what the engine will not tell you about until a
sheet comes out wrong or a commit fails the suite:

- `family` outside `serif|sans|mono`, which would need an embedded font file
  and reopen the WinAnsi encoding problem documented for currencies in
  `js/docs.js`;
- a colour that is a hex where a palette role belongs, which is the registry's
  own stated rule;
- a `field` or `source` the form does not collect -- the exact defect
  `catalog: true`'s own comment warns about, a picker entry that silently drops
  half its own layout;
- a photo block naming a height, which `PHOTO_RATIO` derives so a descriptor
  cannot stretch a face;
- and a column that runs past its declared boundary, which is reported from the
  live layout rather than guessed.

The preview uses its own short sample, **not** `SAMPLE_STATE` from
`js/resume.js`. That object is sized to one page across every shipped template
and has no slack left; tying a preview to it would tie the studio to a
constraint it has no part in.

## Testing

`node tests/verify-layout.js` gains **section 14**, and what it asserts is the
**refusal**, not the success. A splice that works is pleasant; a splice that
quietly damages a neighbouring entry and gets written is the failure mode the
whole design exists to prevent, and a check that only exercised the happy path
would not see it.

Everything in it is in-memory: the studio hands back patched source and the
caller decides whether to write, so the section exercises the whole mechanism
against the real registries without touching a file.

| Check | What it proves |
| --- | --- |
| 14b | the five layout names duplicated in `admin-studio.js` still match `docs.js` |
| 14c | re-writing an entry preserves the registry's meaning |
| 14d | creating one moves nothing else |
| 14e | removing one removes only that one |
| 14f | the document registry round-trips too |
| 14g | **refuses** a patch that alters a neighbouring entry |
| 14h | **refuses** a patch that does not compile |
| 14i | **refuses** a patch with the wrong entry count |
| 14j | **refuses** a patch whose entry is not what was authored |
| 14k | **refuses** a patch that gutted the file |
| 14l | validation rejects what the engine cannot draw |
| 14m | a document layout outside the five is rejected |

Driven by hand through the panel as well: the list renders both registries,
opening `classic` fills the editor and reports its 3,389 bytes of comment, the
starter descriptor renders a real one-page sheet with no complaints, and each
validation rule fires on a descriptor edited to break it.

## Files

- `site/js/admin-studio.js` -- the surgery: `matchBalanced`, `findEntryRange`,
  `findKeyedRange`, `spliceRegistry`, `verifyRegistry`, `planRegistryEdit`,
  `planCatalogCard`, `planAdminEntry`, `serializeEntry`, `commentCost`
- `site/js/admin-studio-ui.js` -- the panel: list, editor, live preview,
  validation display, publish and copy
- `site/admin.html` -- the panel markup and its help blocks; jsPDF, the resume
  engine and the registry are loaded here for the live preview, as
  `resume.html` loads them
- `site/css/admin.css` -- `.studio-*`, and `.mock-doc.studio` for the generated
  tile
- `tests/verify-layout.js` -- section 14
