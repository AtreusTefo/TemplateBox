# The Upload Prompt Became a Control, on Every Editor That Has One

Date: September 10, 2026
Status: Implemented

## Summary

"Upload a photo to begin" sat in the middle of an empty panel and was a caption:
the visitor read an instruction and then had to go and find the button that
carried it out. Clicking the words now does the thing the words describe.

Rolled out across all four editors, in three commits. The last two are recorded
here because they are the awkward ones -- the poster and the mockup already drew
a prompt to click, and the resume and the invoice drew nothing at all.

| Editor | Prompt before | Clickable |
| --- | --- | --- |
| poster | "Upload a photo to begin" | `b4be80b` |
| mockup | "Upload your design", per print surface | `8df13ac` |
| resume | none -- the photograph was simply absent | this change |
| docs (ruled invoice) | none -- the logo was simply absent | this change |

Every route opens the SAME file input the control panel shows. One element, so
the mime check, the crop and the storage path are one path with two ways in, and
there is nothing to keep in step.

## The rule all four follow

An empty image area is clickable, its cursor is `pointer`, and the prompt is
EDITOR CHROME: it never reaches an export. Where an editor already had a
placeholder that printed, that behaviour is unchanged; where a prompt is new, it
is preview-only.

## Resume: the prompt must not move the sheet

`js/resume-engine.js` builds ONE display list that the SVG preview and the jsPDF
export both paint from. That makes two things load-bearing.

**It reserves no space.** The photo block already returned early when there was
no photograph, leaving the column cursor where it was; the prompt is pushed as
an op and the early return is otherwise unchanged. Verified: the sidebar's first
heading sits at y=86 with the prompt exactly as it did without it, so a
photo-less sheet lays out and prints as it always has. Reserving the photo's
space would have put a hole in every photo-less export -- the photograph is
208pt tall on `photo-rail`.

**Which is why the prompt is 44pt tall and the photograph is not.** The real box
runs from y=32 to y=240.75. The sidebar's first heading is at y=86 when there is
no photograph. A true-size prompt would have covered the visitor's own contact
details, so this marks the top-left corner and the width instead. If another
template ever gains a photo block, check this height against what follows it.

**`paintPdf()` returns on the op, explicitly.** Its chain ends in a text
fallthrough -- an op it does not recognise is not skipped, it is read as a
string and reaches `FAMILY[undefined].pdf`. Anything preview-only has to say so
there by name. Verified: the PDF exports at 18,282 bytes, starts `%PDF-`, throws
nothing, and does not contain the string "Add a photo".

### A defect this shipped and then fixed

The first version drew the prompt in white, on the assumption that the photo
panel is a dark rail. **`photo-rail`'s sidebar is `#EEF1F6`.** The prompt was
drawn correctly, in the right place, and was invisible.

It takes `colorOf("accent", ...)` now -- the role the sidebar's own headings are
drawn in, which is guaranteed to contrast with the sheet and follows the
visitor's colour choice for free. The lesson is the ordinary one: a colour
chosen against an imagined background is a guess, and this one survived being
measured for position without ever being looked at.

## Docs: the prompt must not squeeze the wordmark

The invoice is easier in one way -- the PDF is drawn by jsPDF from `state` and
never reads the sheet, so a DOM prompt cannot leak into it -- and harder in
another.

`.doc-ruled-brand` is a flex row inside a masthead that is already tight. The
first version was an "ADD LOGO" chip. It measured 68px, pushed the business name
onto a second line, and took the masthead from 40px to 45px: the preview showed
a wrapped name the PDF does not wrap.

Measured, by shrinking it and watching the wordmark:

| Prompt width | Wordmark height | Masthead |
| --- | --- | --- |
| 68px | 45 (wrapped) | 45 |
| 56px | 22.5 | 40 |
| 48px and below | 22.5 | 40 |

**A width was not the fix**, which is the part worth keeping: that threshold
moves with the length of the business name, so any fixed width is one long name
away from wrapping again. The prompt is a 1.25rem SQUARE carrying a plus, a
fifth of the width that broke it, and it is `flex: 0 1 auto; min-width: 0` so it
shrinks BEFORE the wordmark does. The chrome yields; the document does not.

What it says is in its accessible name rather than on its face: a screen reader
hears "Add logo", the sheet shows a plus. Verified: the masthead measures 40px
with the prompt and 40px with it removed.

## Not done

- **`resume.html` and `docs.html` are the only two that gained a prompt.** No
  other editor draws an image the visitor uploads.
- The resume prompt appears on any template with a photo block, which today is
  `photo-rail` alone.
- The invoice prompt is on the ruled masthead only, which is the one document
  variant that takes a logo.

## Verified

- Resume: the prompt is at x=22, y=32, 167 wide -- the photograph's own column,
  top and width; `mousedown` opens `#f-photo`; the cursor is `pointer`; it
  disappears once a photograph is added and the photograph then reserves its
  space as before, moving CONTACT to y=284.75.
- Resume PDF: exports clean, no exception, prompt text absent.
- Docs: the prompt is 20x20, clicking opens `#f-logo`, its accessible name is
  "Add logo", and the masthead height is identical with and without it.
- Suite: 1488 passed, 0 failed.

## Related Files

- `js/resume-engine.js` -- the `photoSlot` op, its SVG branch, and the explicit
  return in `paintPdf()`
- `js/resume.js` -- the sheet's `mousedown` delegation, which checks the slot
  before the editable text
- `js/docs.js` -- the ruled masthead's prompt and the delegated click, which has
  to be delegated because the sheet is rebuilt on every keystroke
- `css/style.css` -- `.rt-photo-slot` and `.doc-logo-slot`, both dropped in print
