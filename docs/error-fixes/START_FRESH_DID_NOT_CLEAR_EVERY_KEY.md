# "Start fresh" Did Not Clear Every Key an Editor Owns

Date: September 16, 2026

## Read this first: the reported symptom does not occur

This was filed as a data leak: *"a visitor who discarded their CV opens a
blank form carrying the previous person's picture."*

**That does not happen, and it never did.** `js/resume.js` already guards it,
deliberately, and the guard predates this investigation:

```js
const savedPhoto = readStoredPhoto();
const keepPhoto = hasSaved && validPhoto(savedPhoto.src);
if (!keepPhoto && savedPhoto.src) {
    TB.storageSet(PHOTO_KEY, "");
}
```

`hasSaved` is `Boolean(saved && saved.fields)` -- the document record. So a
photograph is only restored **alongside a document**, and one that outlives
its document is not merely ignored but actively zeroed. The comment beside it
states the reason plainly: a restored orphan would be *"somebody's face on a
document that is not theirs"*.

Verified rather than assumed. The old behaviour was reproduced in a browser --
document key removed, photo key left in place, `resume.html` reloaded -- and
the result was `photoKeyPresent: true, dataImagesOnPage: 0`. No photograph
reached the page, and the orphaned key was cleared by the gate.

If you are reading this because you have just noticed that `EDITORS` names one
key per editor and the resume editor writes three: yes, and it is handled.
Please do not re-file it.

## What was actually wrong

Smaller, and real.

In `site/js/app.js`, the continuation strip's discard handler was:

```js
window.localStorage.removeItem(EDITORS[item.target].storageKey);
```

`EDITORS` maps each editor to exactly one storage key. The resume editor
writes three:

| Key | Holds |
| --- | --- |
| `tb_resume_v1` | the document |
| `tb_resume_photo_v1` | the photograph and its framing |
| `tb_resume_template` | the chosen layout |

So discarding a resume cleared the document and **left the photograph in
storage** until the next time the visitor opened `resume.html` -- which,
having just discarded their resume, they may never do.

Two reasons that is worth fixing even though nothing is visible:

1. **A control should do what it says when it is asked.** "Start fresh"
   implies the data is gone now, not that it will be tidied up on a later
   visit to a page the visitor has finished with. On a shared or borrowed
   device the difference between "deleted" and "deleted eventually" is the
   whole point.
2. **It removes a single point of failure.** Today, no-leak correctness rests
   entirely on that one gate in one editor. Clearing at the source is defence
   in depth; the gate stays exactly as it is.

## Root cause

Two lists describing the same thing, in different shapes, with no link
between them.

`EDITORS` is an editor-to-one-key map built for the continuation strip.
`BACKUP_KEYS` is the complete six-key inventory built for the backup feature
(September 16, 2026). Nothing tied the second to the first, so the operation
that **copies** an editor's keys and the operation that **deletes** them
disagreed about what an editor owns -- and only one of them was right.

## Fix applied

`site/js/app.js`

`BACKUP_KEYS` entries gained two fields:

- `target` -- the editor the key belongs to, matching the `EDITORS` keys
  (`resume`, `docs`, `poster`, `mockup`)
- `preference` -- marks a key that survives being discarded

A helper derives the delete list from the same inventory the copy list uses:

```js
function discardKeysFor(target) {
    return BACKUP_KEYS
        .filter((entry) => entry.target === target && !entry.preference)
        .map((entry) => entry.key);
}
```

The handler iterates it, with the `try` **inside** the loop rather than around
it: a partial discard that aborts on the first un-removable key would stop at
the document and leave exactly the photograph this change exists to remove.

An editor gaining a fourth key now needs no edit at this call site.

### The one key that survives, and why

`tb_resume_template` is kept. This is a decision, not an oversight.

`js/resume.js` describes `TEMPLATE_KEY` as *"a fallback, not a second source
of truth: a saved document's own `template` still wins, and this is consulted
only when there is no document yet."*

The state immediately after "Start fresh" **is** "no document yet" -- the one
situation the key exists to serve. Clearing it would make the key do nothing
in the only case it was designed for, and the visitor would silently lose a
layout they chose. A blank document in your chosen template is what "start
fresh" means; being returned to Classic is the application forgetting
something.

The photograph is **not** a preference. It is personal content attached to a
document, and it goes.

## Testing steps

1. `node tests/verify-layout.js --quick` -- section 1o covers this.
2. By hand, on the homepage with a saved resume: click **Start fresh**, then
   check `localStorage`. `tb_resume_v1` and `tb_resume_photo_v1` are gone;
   `tb_resume_template` remains at its chosen value.
3. Open `resume.html`. The form shows sample content, not the discarded
   document, and no photograph.

Measured on the real button: `documentCleared: true, photographCleared: true,
templateKept: true, templateValue: "photo-rail", stripRemoved: true`.

## The checks, and the breakages that proved them

Seven assertions in section 1o of `tests/verify-layout.js` (of its 19). Six of
them were broken on purpose and confirmed to fail before this was called done;
the seventh is the guard that locates the EDITORS block, which the other six
depend on:

| Broken on purpose | Caught by |
| --- | --- |
| the handler reverted to `EDITORS[item.target].storageKey` | the Start fresh handler clears every key the editor owns |
| a key added with no `target` | every backed-up key names the editor it belongs to |
| a key attributed to an editor that does not exist | every backed-up key's target is a real editor |
| the photograph marked `preference: true` | only a preference-shaped key survives Start fresh |
| an editor whose every key is a preference, so discard is a no-op | every editor has at least one key that Start fresh clears |
| `discardKeysFor` reaching for `EDITORS` again | discardKeysFor derives its keys from BACKUP_KEYS |

The fourth is the one worth keeping: it stops the original shape being
reintroduced as a *decision* rather than as an oversight. Marking the
photograph a preference would leave personal content behind after the visitor
asked for it to go, and it would look deliberate in the diff.

Section 1o's existing key regex (`{ key: "...", label:`) was checked against
the new entry shape and still matches all six, because `target` was added
after `label`. No test change was needed for that.

## Related files

- `site/js/app.js` -- `BACKUP_KEYS`, `discardKeysFor()`, the strip's discard handler
- `site/js/resume.js` -- the `keepPhoto` gate that makes the reported symptom impossible
- `tests/verify-layout.js` -- section 1o
- `docs/implementation/BACKUP_AND_RESTORE.md` -- where the key inventory came from, and where this was first filed with the wrong premise
