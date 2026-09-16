# "Start Blank" Has a Way Back

Date: September 15, 2026
Status: Done

Reported as: after pressing Start blank, the sample content should be able to
come back, so that starting blank is not a one-way door. Then: put it in every
receipt and invoice and every resume template.

Both editors have it now. The resume side needed nothing per template -- the
notice belongs to the editor, not to a design, so all five templates had it the
moment it existed. The documents editor is the work, and it carried the same
one-way notice for all seven document types.

## What it was

`showSampleNotice()` built the notice above the resume form, and its button
emptied the editor and then called `notice.remove()`. That was the whole of it.
There was no second state and no second offer.

So a visitor who pressed Start blank to see what an empty sheet looked like,
or who pressed it by accident, had no route back to the sample. The only way to
see the preview working against real content again was to clear this browser's
storage, which is not a thing an editor should make anybody do.

## What it is now

One element with two states, chosen from the document itself:

| State | When | Offer |
| --- | --- | --- |
| `sample` | the sample is loaded | Start blank |
| `blank` | the document is empty | Bring the sample back |

One element that changes its wording rather than two that take turns. A second
notice appearing where the first one was reads as the page having changed its
mind.

## When the offer is shown, and the rule that got it wrong first

The first version showed the "bring it back" offer **only while the document
was completely empty**, on the argument that it could then destroy nothing and
needed no confirmation.

That was true and it was the wrong trade. It hid the control at the exact
moment somebody goes looking for it: start blank, type your name, decide you
wanted to see the sample after all -- and it is gone, because one letter
counted as work. Reported as "where's the button to bring the sample back",
which is the only review that matters.

The offer now survives typing, for the session in which "Start blank" was
pressed, and **asks before overwriting anything**:

| State | Offer |
| --- | --- |
| the sample is loaded | Start blank |
| the document is empty | Bring the sample back |
| Start blank was pressed this session, and there is now content | Bring the sample back, with a confirm |
| a saved document opened normally | neither |

The last row is what keeps it from becoming furniture. `blankedThisSession` is
not persisted, so a reload with a real document in it shows no notice at all --
somebody opening a finished resume is not looking for sample content.

The confirm fires only when there is something to lose. Asking on every press
would make the way back feel dangerous when it is not.

`documentIsEmpty()` still decides the empty case, and two things in it are easy
to get wrong:

- **The document NAME is not counted.** Start blank never cleared it, so a
  document called something and holding nothing is still empty in the only
  sense that matters here.
- **Empty entry rows have to be looked inside.** `collectEntries()` keeps the
  blank row every list opens with rather than filtering it out, so counting
  rows would find four lists of one and conclude the document was full.

`syncNotice()` runs from `persistAndRender()`, which is the single choke point
every change already passes through, so no call site has to remember that
emptying the document changes what is on offer.

## The documents editor got the same thing, and one collision

`js/docs.js` had the identical one-way notice: sample loads, "Start blank"
empties it and removes itself. It now has the same two states, the same
wording, the same `blankedThisSession` rule and the same confirm.

**Not shared code.** The two editors hold entirely different documents -- what
"empty" means and what "the sample" is are different in each -- and the notice
is four small functions over those two answers. What is shared is the
behaviour, which is the part a visitor meets.

Three things specific to that editor:

- **Clear Form earns the way back too.** It empties the document exactly as
  Start blank does, so it sets the same flag. A visitor who cleared the form
  and then wants the sample to look at gets the same offer.
- **`documentIsEmpty()` has more to look at**: fields, the logo, line items,
  and the method and violation checkbox sets. The document name, the accent,
  the type and the blank-form toggle are not content and are not counted.
- **A bug found on the way past.** `startBlank()` swept `[data-bind]` controls,
  the line items and the logo -- and not the `[data-check]` boxes. "Start
  blank" on a warning notice emptied every field and left its violation boxes
  ticked. Clear Form had always cleared them; this never had. Fixed, and
  verified by ticking one and watching it go.

### The collision, which is worth reading twice

The new function was called `renderNotice`. **`js/docs.js` already had one**:
the layout renderer for the employee warning notice, in `RENDERERS`. Two
function declarations in one scope means the later one wins, so the warning
notice's SHEET was being drawn by the sample bar, called with the state object.

The symptom was a sample bar carrying `data-mode="[object Object]"` and an
empty button, on one document type out of seven, four hundred lines from the
cause. It also hung every attempt to drive that page, which is what led to
looking at the DOM instead of reasoning about the code -- the DOM said
`[object Object]` and that was the whole diagnosis.

It is `renderSampleBar` now, with the reason written at the declaration. This
is the second collision of exactly this shape in two days: the Labelled
Sections tile's bullets were called `dot` in a stylesheet that already had a
`.dot`. A generic name in a big shared file is a collision waiting to happen,
and in JavaScript it fails silently in a different feature.

## `fillForm()`, extracted

Restoring the sample is the same operation as the first load, so `init()`'s
inline hydration became `fillForm(state)` and both call it. A second copy would
have been a second place for a newly added field to be forgotten.

Two details it had to gain that `init()` did not need:

- **The lists are emptied first.** `hydrateList()` and `addEntryRow()` both
  APPEND, which is right on a first load into empty lists and would have
  stacked the sample on top of whatever was already there on a restore.
- **Design is deliberately not in it.** The template and the accent are the
  callers' business, and the two callers differ: `init()` applies the saved
  accent and resolves a catalog preset, while restoring the sample leaves both
  alone. That is the same rule Start blank already followed in the other
  direction -- it clears the content and keeps the design -- and it means
  bringing the sample back does not overwrite a colour the visitor picked with
  the sample's own blue.

Extracting it moved `buildTemplateRow()` and `selectTemplate()` ahead of the
field population in `init()`. Checked rather than assumed: `selectTemplate()`
writes only `TEMPLATE_KEY` and never calls `persistAndRender()`, so it cannot
save an empty form over a returning visitor's document. Verified by reloading
with work in progress and confirming it survived.

## The one thing it cannot undo

**A photograph.** Start blank clears it from the form and from storage, and
nothing keeps a copy. The photograph was the visitor's, not the sample's, and
the sample never had one to restore.

That is called out in the code at the point where the photo is cleared, so the
next person to read "Start blank is reversible now" does not assume it is
reversible in every respect.

## Testing

Driven through the editor rather than asserted about the code:

| Step | Result |
| --- | --- |
| Fresh load | sample content, notice offers Start blank |
| Start blank | form empty, notice offers to bring it back |
| Bring the sample back | sample returns whole: 2 experience rows, 2 language rows, 1 reference |
| Start blank again | empty again -- reversible in both directions, repeatedly |
| Type a name | the offer STAYS -- this is what the first version got wrong |
| Press it with content in the form | asks first, then restores the sample |
| Decline that confirm | nothing changes and the typing is intact |
| Clear what was typed | the offer is still there |
| Reload after Start blank | the offer survives the reload |
| Reload with work saved | no notice, and the work is still there |

And in the documents editor, across four of its seven types -- rent receipt,
invoice, trade receipt and warning notice -- each behaving identically:

| Step | Result |
| --- | --- |
| Fresh load | sample content, notice offers Start blank |
| Start blank | fields empty, checkboxes cleared, notice offers to bring it back |
| Type a field | the offer stays |
| Bring the sample back | asks first, then restores the sample |
| Clear Form | the offer returns |
| The warning notice's sheet | still drawn by its own renderer, 14 elements and 934 characters |

`node tests/verify-layout.js`: 1582 passed, 0 failed.

## Files

- `site/js/docs.js` -- `SAMPLE_COPY`, `renderSampleBar()`, `documentIsEmpty()`,
  `syncSampleBar()`, `startBlank()`, `restoreSample()`, the `[data-check]`
  sweep, and the Clear Form flag
- `site/js/resume.js` -- `NOTICE_COPY`, `renderNotice()`, `documentIsEmpty()`,
  `blankedThisSession`,
  `syncNotice()`, `startBlank()`, `restoreSample()`, `fillForm()`, and the
  `syncNotice()` call in `persistAndRender()`
