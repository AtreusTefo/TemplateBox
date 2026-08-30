# The Editor Name Fields Named Nothing

Date: August 24, 2026

## Issue Title

Typing a name for your document, resume or mockup had no observable effect on
three of the four editors. Reported as "the naming your template or label for
your template is not working".

## Symptom

The field accepted text, persisted it, and restored it on the next visit. The
downloaded file ignored it completely.

Observed by wrapping the export engine and reading the filename it was actually
given:

| Editor | Field | Typed | File it exported |
|---|---|---|---|
| `resume.html` | `#doc-name` "Untitled resume" | "My Senior Engineer CV" | `adaeze-nwosu-templatebox.pdf` |
| `docs.html` | `#doc-name` "Untitled document" | anything | `rent-receipt-nova-interiors-ltd-templatebox.pdf` |
| `mockup.html` | `#m-label` "Mockup Label" | "Front chest print, navy tee" | `templatebox-mockup.png` |
| `poster.html` | `#doc-name` "Untitled poster" | "Summer Gig Poster" | `summer-gig-poster.png` (correct) |

## Root Cause

Not a bug in the usual sense -- nothing threw, nothing was miswired. The value
was simply never read by the code that names the file.

- **`resume.js`** built its filename from `state.fields.name`, the person's
  name on the resume itself.
- **`docs.js`** built its from the document type plus the recipient name.
- **`mockup.js`** used the literal `"templatebox-mockup.png"`. `#m-label`
  captioned an entry in the in-memory "My Mockups" tray and did nothing else.
- **`poster.js`** was the only one that had ever wired its field to its export.

So on three editors the name was typed, sanitized, written to `localStorage`,
read back on the next visit, and used for nothing. Every layer looked correct
except the one the visitor sees.

The mockup editor's case got sharper on August 24, 2026, when the bar's
document-name input was removed in favour of the controls' Mockup Label (see
`MOCKUP_EDITOR_NAVBAR.md`). That made `#m-label` the only place left to name
the work, and it was the field that did the least.

## Fix Applied

**One slug helper, `TB.fileSlug`, in `js/app.js`**, replacing three near-identical
regex chains. Used by all four editors, so a file downloaded from any of them is
named the same way.

It calls `desanitize` **first**, and that is load-bearing rather than tidy: the
name reaches it through `sanitize()`, so an apostrophe is already `&#39;`.
Stripping punctuation from that leaves the digits behind, and "Ada's CV" would
have exported as `ada39s-cv.pdf`. The suite's fixture types
`Ada's Big Project 2026!` for exactly this reason.

**Every editor now prefers the typed name, and only the typed name.** The rule
is the same in all four:

- The visitor changed the field: that is the filename.
- The field is untouched at its default: the previous, more useful fallback
  stands -- the person's name on a resume, the type and recipient on a business
  document, `templatebox-mockup.png`, `templatebox-poster.png`.

Nothing regresses for anyone who never touches the field, which is why the
fallbacks were kept rather than replaced with `untitled-resume.pdf`.

`poster.js` already worked and was changed anyway, for two reasons: it now uses
the shared slug, and an untouched field falls back to `templatebox-poster.png`
rather than exporting `untitled-poster.png`, which told the visitor nothing.

**The fields now say what they do.** The three bar inputs carry
`title="Names the file you download"`, and Mockup Label gained a hint line under
it. A control whose only effect is invisible is how this survived.

| File | Change |
|---|---|
| `site/js/app.js` | `fileSlug`, exported on `TB` |
| `site/js/resume.js` | typed name wins, person's name is the fallback |
| `site/js/docs.js` | typed name wins, composed name is the fallback |
| `site/js/mockup.js` | `#m-label` names the PNG and each tray download |
| `site/js/poster.js` | shared slug, default falls back to the brand name |
| `site/mockup.html` | hint under Mockup Label |
| `site/resume.html`, `docs.html`, `poster.html` | `title` on `#doc-name` |
| `tests/verify-layout.js` | section 7 |

## Testing Steps

`node tests/verify-layout.js`, section 7. It asserts **the filename the browser
is given**, not the state and not the input, because a field feeding a variable
nobody reads is precisely the defect being fixed.

Two interception points, both found the hard way while confirming the bug:

- **jsPDF** (`resume`, `docs`): `save` is not an own property of
  `jsPDF.prototype`, and the download does not go through an anchor element, so
  patching either captures nothing and looks like "no export happened". The
  **constructor** has to be wrapped.
- **Canvas** (`mockup`, `poster`): the export is an `<a download>` click, so
  patching `HTMLAnchorElement.prototype.click` and reading `download` works.

Each editor is exercised twice per run: once untouched, to prove the fallback
still holds, and once after typing.

Mutation-tested:

| Mutation | Result |
|---|---|
| `resume.js` back to the person's name only | "resume: a typed name is the filename" fails |
| `mockup.js` back to the literal | "mockup: the Mockup Label is the filename" fails |
| `fileSlug` stops decoding entities first | "docs: a typed name is the filename" fails -- the apostrophe case, producing `ada39s-...` |

## Troubleshooting

- **A name types fine but the file is still the fallback.** Check the field is
  actually different from its default: the default string is compared exactly
  (`DEFAULT_DOC_NAME`, `DEFAULT_POSTER_NAME`), so a field reset to "Untitled
  resume" by hand counts as untouched.
- **The filename has stray digits in it.** Something is slugging sanitized text
  without decoding it first. `TB.fileSlug` does that internally; a caller doing
  its own regex will not.
- **A tray download is named by a timestamp.** That is the fallback when a tray
  item has no label; the item's own label is used when it has one.

## Related Files

- `site/js/app.js` (`fileSlug`), `site/js/resume.js`, `site/js/docs.js`,
  `site/js/mockup.js`, `site/js/poster.js`
- `site/mockup.html`, `site/resume.html`, `site/docs.html`, `site/poster.html`
- `tests/verify-layout.js` section 7
- `docs/implementation/MOCKUP_EDITOR_NAVBAR.md` -- why Mockup Label became the
  mockup editor's only naming control
