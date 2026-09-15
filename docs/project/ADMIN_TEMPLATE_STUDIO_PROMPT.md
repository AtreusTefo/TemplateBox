# Coding Agent Brief: The Template Studio in Admin

Date: September 14, 2026
Status: Brief. Nothing built yet.

Add a panel to `site/admin.html` that lets the operator create and edit the
CV/resume templates and the receipt/invoice document types, preview them live,
and publish them into the working copy -- without hand-editing a registry in a
text editor.

Read this whole brief before writing anything. Sections 1 and 2 decide what can
honestly be built; section 4 is the part most likely to be got wrong in a way
that destroys a file.

---

## 1. The two halves are NOT the same shape, and the panel must say so

This is the finding that sets the scope. Get it wrong and the panel promises
something the architecture cannot deliver.

### Resumes: a data registry over a generic engine. Fully authorable

`site/js/resume-templates.js` is `window.TB_RESUME_TEMPLATES`, an array of
plain descriptors rendered by `site/js/resume-engine.js`. Its own header says
it: a template is DATA, and adding one requires no renderer code. Five ship
today. A sixth is a new object in that array and nothing else.

So for resumes the answer is **full authoring**: create, edit, duplicate,
delete, preview, publish.

### Receipts and invoices: data over FIVE hand-written renderers

`site/js/docs.js` has `DOC_TYPES`, which looks like the same thing and is not.
Each entry carries a `heading`, a `file`, a `labels` map -- all data -- and a
`layout`, which names one of exactly five functions in `RENDERERS`:
`receipt`, `itemized`, `notice`, `ruled-invoice`, `trade-receipt`.

So for documents the honest answer is **variants, not layouts**. The operator
may create a new document type that reuses one of the five existing layouts
with its own heading and its own field labels, and may edit any existing one. A
genuinely new layout -- a different arrangement of ink on the page -- is a
JavaScript function and stays one.

**Say that in the UI, not only in a comment.** The document half of the panel
must show which layout an entry uses, that the list of layouts is fixed, and
what a new layout would require. A form that silently cannot do the thing its
heading implies is worse than a form that says so.

---

## 2. Do not build a publishing mechanism. One already exists and it is good

The Catalog Thumbnails panel in `admin.html` already solves "a browser page
edits the working copy", carefully, and it was made careful by a defect that
broke the live homepage. Reuse the mechanism and copy the discipline.

- **`window.TBProjectFolder`** (`site/js/admin-fs.js`) wraps the File System
  Access API: `supported`, `isConnected`, `connect`, `restore`, `writeFile`,
  `readText`, `deleteFile`, `listDir`. The operator grants one folder once, in
  a native dialog, and the grant covers that folder alone.
- **Chromium only.** Firefox and Safari ship no `showDirectoryPicker`, so
  `supported()` is false there. The download-and-copy path is not a fallback to
  bolt on afterwards -- it is the entire workflow on two of the three engines,
  and every control has to work without a connected folder.
- **A restored handle has no permission.** `restore()` reports
  `needs-permission` rather than prompting on load, because the prompt needs a
  user gesture.
- **The workspace is localStorage**, like the blog drafts and the thumbnail
  records. Nothing reaches the live site until the operator commits and pushes.
  Deploying is always theirs; say so in the panel as the existing ones do.
- **Verify before writing, and write nothing on failure.** `patchIndexHtml()`
  and `verifyPatch()` are the model: the result must parse, the count must be
  what was expected, everything that should be unchanged must be byte-identical,
  and the new content must actually be present. If any check fails, the file is
  left exactly as it was and the panel says why.
- **Order the writes so a half-failure is inert.** The thumbnail panel writes
  images first and patches markup last, because an unreferenced file is
  harmless and a reference to a missing file is a visible defect. **Here that
  inverts: write the REGISTRY first and the catalog card last.** A descriptor
  nothing links to is inert; a card whose `data-doc` names a template that does
  not exist is a broken entry point.

---

## 3. Two half-tools already exist. Absorb them rather than making a third

- `site/tools/resume-template-preview.html` -- the internal harness that
  renders any registered template through the real engine. The studio's preview
  is this, in the panel.
- `site/tools/resume-figma-import.html` and `site/js/resume-import-figma.js`
  (`window.TBFigmaImport`, with `analyze()` and `toDescriptor()`) -- an import
  path that already turns a Figma file into a descriptor.

Both are already the front half of "author a template". Wire them in rather
than writing a second importer or a second preview. If one of them is better
left standalone, say which and why in the write-up.

---

## 4. Editing a JavaScript registry safely. This is the hard part

The thumbnail panel patches `index.html`, which is markup: `DOMParser` reads it,
and `verifyPatch` can walk every card and prove the others did not move.
`resume-templates.js` and `docs.js` are **JavaScript**. There is no `DOMParser`
for a program, and a regex rewrite of a source file is how an admin panel
corrupts a repository.

Required approach:

1. **Locate one entry, never the whole file.** Anchor on the entry's own
   `id: "<value>"` and find the object's boundaries by matching braces out from
   that anchor -- counting, and skipping braces inside strings, template
   literals, regexes and comments. Splice only that byte range. Every other byte
   in the file stays identical, so `git diff` shows one entry.
2. **Prove the result before writing it.** Evaluate the rewritten source in an
   isolated context -- a `new Function` with its own `window` stand-in, never
   the live page's -- and compare the array it produces against the array
   before:
   - it parses at all;
   - the length is what was expected (unchanged for an edit, +1 for a create,
     -1 for a delete);
   - **every entry that was not being changed is deep-equal to what it was**;
   - the changed or created entry deep-equals what the form authored.
3. **On any failure, write nothing** and report which check failed.

That is the JavaScript analogue of the markup verification, and it is stronger
than a regex could ever be: it tests the file's actual meaning rather than its
shape.

**Serialise deterministically.** The registry is a hand-maintained, heavily
commented source file. An authored entry should be written in the same style as
its neighbours -- two-space-consistent indentation matching the file, keys in a
fixed order, no `JSON.stringify` dump with quoted keys -- or every publish
produces a diff nobody can read. Comments on an entry the operator did not
touch must survive; comments inside an entry they DID rewrite will not, and the
panel should say so before it replaces one.

---

## 5. What must be authorable

### A resume template

Every part of a descriptor, because a form that covers half of one produces
templates that have to be finished by hand anyway:

- `id`, `title`, `catalog`, `defaultAccent`
- `page`, and `layout`: `kind`, and the `main`/`sidebar` boxes with their
  `left`, `right`, `firstBaseline`, `bottom`, and the sidebar's `side`,
  `width`, `background`
- `palette`: named roles and their hexes
- `type`: the ramp -- `family`, `weight`, `size`, `lineHeight`, `color`,
  `align`, `uppercase`, `gapBefore`, `gapAfter`, `rule`, `ruleBefore`,
  `gutter`, and the bullet's `marker`, `indent`, `itemGap`
- `blocks`: `column`, `kind`, and each kind's own keys -- including `inset`,
  and `entries`' `head`, `aside`, `sub`, `bullets` and `entryGap`

Validation the panel must do, because the engine will not:

- **`family` is `serif`, `sans` or `mono` only.** Anything else needs an
  embedded font file, which inflates every export and reopens the WinAnsi
  encoding problem documented for currencies in `js/docs.js`.
- **Colours name palette ROLES, never hexes, inside blocks and types.** That is
  the registry's own stated rule and it is what makes one palette edit enough.
- **Every `field` and `source` must be one the form actually collects.** The
  list is fixed: `name`, `title`, `email`, `phone`, `location`, `summary`,
  `skills`, `languages`, `accomplishments`, `address`, `city`, `postcode`,
  `phoneAlt`, and the `experience`, `education`, `projects` and `references`
  lists. Offering a template the form cannot fill is the exact defect
  `catalog: true`'s own comment in the registry warns about -- a picker entry
  that silently drops half its own layout.
- **`PHOTO_RATIO` is not the template's to choose.** A photo block names a
  width; the height is derived. The panel must not offer a height.

### A document type

`id`, `layout` (chosen from the five that exist, never typed), `heading`,
`file`, and the `labels` map. **The labels differ per layout** -- a receipt
reads a different set from a ruled invoice -- so the form must show the labels
that layout actually reads rather than a fixed list. Derive that from the
layout's own renderer; do not hand-maintain a second table of it.

---

## 6. A template is not published until the catalog knows about it

For a resume template, one publish is five edits and the panel should do all of
them or none:

1. the entry in `site/js/resume-templates.js`
2. a card in `site/index.html` with `data-target="resume"` and
   `data-doc="<id>"`
3. the matching entry in the `admin.js` catalog registry
4. the `catalog-empty` count, currently **49**
5. a `.mock-doc` tile in `site/css/style.css`

**The card's title and the registry's must match exactly** -- suite section 1
checks that pair, and it is the one defect in this family that no amount of
looking would have found.

Items 4 and 5 are where judgement is needed. The count is arithmetic and should
just be right. A tile is a small piece of design, and the panel cannot invent
one: either generate a plain default from the descriptor and say it is a
starting point, or leave the card without a preview and tell the operator what
to write. Decide, do it consistently, and record which.

---

## 7. Traps

- **`SAMPLE_STATE` in `js/resume.js` is shared by every template and sized to
  one page, and there is now NO slack.** Labelled Sections finishes at 802
  against an 838 boundary at a 22pt line height, which is zero further lines.
  If the studio lets the operator edit sample content, it has to re-measure
  every registered template and say which ones went to two pages. If it does
  not let them, say so.
- **A new template changes what the suite measures.** Section 9 runs against
  every registered template with no per-template table, so a bad descriptor
  fails the suite -- which is correct, and also too late. The studio should
  catch what section 9 would catch, before writing.
- **Section 4 compares the working tree against `HEAD`.** Every publish makes
  it fail until the operator commits. That is expected; the panel should say
  so rather than letting it look like a regression.
- **`admin.html` is private.** It must stay out of `sitemap.xml`, and nothing
  public may link to it. `/tools/*` already carries `X-Robots-Tag: noindex` in
  `netlify.toml`.
- **Never `innerHTML` for an operator's string.** A descriptor is text the
  operator typed and it ends up in a preview; `textContent` throughout.
- **No server, no build step, no third-party runtime.** Everything here runs in
  the browser, on the operator's machine.
- **Storage is a few megabytes and already shared** with the blog workspace and
  the thumbnail records. A workspace holding several full descriptors plus
  preview state has to be budgeted, not assumed.

---

## 8. While you are in there

- The panel needs the same `admin-help` `<details>` blocks the existing ones
  carry: what Publish changes, what it will not touch, and what to do without a
  connected folder. Those are how the operator knows the tool is safe.
- Add whatever the suite can check. Sections 6 and 8 already cover admin
  intake and a save that did not persist; a studio that writes source files
  deserves at least a check that a refused publish leaves the file byte-
  identical.
- A write-up in `docs/implementation/`, and an index entry in
  `docs/DOCUMENTATION_INDEX.md` under the right section.

---

## 9. Definition of done

- A resume template can be created from nothing, previewed, published, and then
  opened from the catalog and used -- verified by doing it, not by reading the
  code.
- An existing template can be edited and republished, and `git diff` shows only
  that entry.
- A document type can be created against an existing layout and edited, and the
  labels shown are the ones its layout reads.
- A publish that fails any verification leaves every file byte-identical, and
  the panel says which check failed.
- The whole workflow works with no connected folder, through download and copy,
  on a browser with no File System Access API.
- Deleting a template removes its entry, its card, its registry line and its
  tile, and the count is right afterwards.
- `node tests/verify-layout.js` passes, including section 9 against every
  template the studio produced during testing.

---

## 10. Do not

- Do not promise a new document LAYOUT from a form. Five exist; a sixth is
  JavaScript.
- Do not rewrite a registry file with a regex, and do not reformat a file you
  are splicing one entry of.
- Do not write any file before the verification passes.
- Do not evaluate an authored descriptor in the live admin page's context.
- Do not add a second importer, a second preview harness or a second publishing
  mechanism.
- Do not make the File System Access path the only path.
- Do not put the studio on a public page, link to `admin.html`, or add it to
  the sitemap.
- Do not add a server call, a build step, a database or any third-party
  runtime.
- Do not use `innerHTML` for any operator string.
- Do not put working files inside `site/`.
- Do not use emojis anywhere -- code, comments, documentation or commit
  messages.
