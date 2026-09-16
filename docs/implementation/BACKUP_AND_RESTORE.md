# Backup and Restore of Saved Work

Date: September 16, 2026

## Summary

A visitor can download every document they have saved as one JSON file, and
load that file back on any device.

Two controls, in the header "More" panel on every page that has one and in the
editor bar on the two editors that do not, plus a second export entry point on
the homepage's continuation strip. They are hidden below 48rem in the editor
bar only -- see the measurements under "Where the controls live".

This is the item
`docs/implementation/PWA_INSTALLABLE_APP.md` named as deliberately not
included in Tier 0. It is the only fix for iOS keeping separate storage for
Safari and the installed app, and the only way to move work between devices.

## The finding that shaped it

A backup built from the `EDITORS` map in `js/app.js` would have been wrong,
and wrong in the way that is hardest to notice: it would have looked complete.

`EDITORS` names four storage keys, one per editor. The resume editor writes
**three**:

| Key | Holds | Why it is separate |
| --- | --- | --- |
| `tb_resume_v1` | the document | |
| `tb_resume_photo_v1` | the photograph and its framing | `storageSet` swallows a quota failure by design, so a photograph inside the document record would take the whole document down with it -- see `PHOTO_KEY` in `js/resume.js` |
| `tb_resume_template` | the chosen layout | it is the fallback for a visitor who has no document yet |

So the naive version restores a resume **with no photograph, in the Classic
layout**, and reports success. The visitor discovers it on a new phone, while
holding the only copy of the file.

Nothing about that is a crash, nothing logs, and no existing check covers it.
That is why `tests/verify-layout.js` now reads the editors' own `*KEY*`
constants and fails if any of them is missing from `BACKUP_KEYS` (section 1o).

The full list is six keys: the three above plus `tb_docs_v1`, `tb_poster_v1`
and `tb_mockup_v1`.

**Deliberately excluded**, and asserted to stay excluded: `tb_theme` and
`tb_editor_preset` are device settings rather than work -- restoring a backup
should not reach over and change the theme someone is reading in -- `tb_probe`
is a storage probe, and the `tb_admin_*` keys belong to the private authoring
tool.

## What is NOT in a backup, and is not a bug

Neither `js/poster.js` nor `js/mockup.js` persists an uploaded image. Poster
photographs, the scan-code image and the mockup design are session-only and
are already lost on reload today. A backup carries what the editors store, so
it carries what would survive a refresh and nothing more. That is pre-existing
behaviour, not something this feature narrows.

The only images in a backup are the invoice logo (`tb_docs_v1.logo`) and the
resume photograph.

## The trust boundary

A restore takes a file off the visitor's disk and writes it into the exact
place the editors read from. That **skips every check the editors apply to
typed input**: `collectState()` sanitizes on the way in, and a restored record
never passes through it.

So the file is untrusted, the same way the stored invoice logo already is. The
boundary the importer draws, stated so it can be argued with:

- no string reaches storage in an unescaped form
- nothing used as an image source reaches storage unless it is a base64
  raster, so a `data:image/svg+xml` carrying a script cannot be restored
- nothing used as a fill style or an SVG `fill` attribute reaches storage
  unless it is a six-digit hex
- no object can pollute a prototype, recurse without bound, or grow without
  bound

**What it deliberately does not do** is check that a resume record has the
fields a resume has. The editors already re-validate their own shapes on read
-- `migrate()` in `poster.js`, `readStoredPhoto()` in `resume.js`,
`DEFAULT_STATE` merges, bounded numbers -- and duplicating that here would be
a second copy of four schemas that would rot within a month. A structurally
valid file with nonsense in it produces an empty-looking editor, not a broken
one.

### Re-escaping, not escaping

Values in storage are **already** sanitized, so running `sanitize()` over one
directly would double-escape it: an apostrophe saved as `&#39;` comes back as
`&amp;#39;` and the visitor finds their own name spelled in entities.

`cleanText` therefore runs `sanitize(desanitize(value))`. The pair is
idempotent for a well-formed value and still escapes a raw `<` from a
hand-edited file. Same ordering trap `fileSlug()` documents a few hundred
lines above it.

### Guards applied by field name

`IMAGE_FIELDS` and `COLOUR_FIELDS` match on the **field name**, not on what
the value looks like. A value that merely resembles a data URI is not the test
that matters; what matters is where the editors use it.

This has a limit worth stating. The suite checks that every name in those
lists is a field some editor persists -- it caught `photo` on the first run,
which `persistAndRender()` deletes from the record it writes, so a guard for
it guarded nothing. It **cannot** catch the reverse: an editor gaining a new
image field that nobody adds here, because "this string will be used as an
image" is not visible in the source. Adding an image to a stored record means
adding its field name to `IMAGE_FIELDS` by hand.

### Cleaning finishes before anything is written

A file that is half valid must not leave storage half replaced -- the visitor
would have lost the documents it overwrote and not gained the ones it could
not restore. Every record is cleaned into an array first; only then is
anything written.

The check for this took two attempts, and the first one is instructive. "The
first write comes after the last clean" is the obvious form and it is useless:
a `storageSet` added *inside* the gathering loop still sits after the
`cleanRecord` call on the line above it, so the ordering holds and the check
passes while the property it was written for is gone. Confirmed by breaking it
exactly that way. It is checked as "the gathering pass contains no write",
paired with "the write pass exists" so a function that never writes at all
cannot satisfy both.

## Where the controls live

**In the mega-menu, on every page.** This is the point of putting them there:
**restore matters most where there is nothing saved.** A visitor opening the
installed app on a new phone has an empty continuation strip and no other
route back to their own documents.

**Built in JavaScript**, not shipped in the markup of 26 pages. This looks
like it contradicts the panel's own rule -- its links are real anchors in the
served markup, on purpose, so they stay crawlable -- but that rule is about
**links**. These are buttons and a file input: nothing for a crawler to
follow, no destination to pass rank to. Shipping them in markup would buy
nothing and would put the same block on 26 pages plus `admin.js`'s generated
post head, which is the drift this project already documents twice.

**First in the panel**, and that is a correctness fix rather than emphasis.
Appended, the controls measured at y=1105 in a 900px-tall viewport and could
not be reached at all: the panel is 1256px tall at 1440x900 with no
`max-height` and no internal scroll, and because `.site-header` is sticky the
panel is pinned -- scrolling the page moves the document underneath it and
leaves the panel's own foot exactly where it was.

**That overflow is pre-existing and is not fixed here.** The social row was
already below the fold at the same size, and the panel measured 1145px without
this row; it is a consequence of folding the footer into the menu on August
13, it belongs to the panel rather than to this feature, and it is filed
separately. Putting this row at the top keeps this feature out of the dead
zone. It does not fix the dead zone.

**And in the editor bar, for the two editors that have no panel.**
`resume.html` and `docs.html` carry no mega-menu panel at all -- which
contradicts what this project's notes claim about every public page having
one, and predates this feature. Without a fallback the backup controls would
be missing from the resume editor, the page whose documents live longest and
whose photograph is the thing most at risk.

`.editor-actions` is the right neighbour rather than merely an available one:
it holds the "Saves automatically" cloud, so it is already where the page
talks about persistence. The fallback mounts **only** where there is no panel,
so `poster.html` and `mockup.html` keep the menu route and nobody gets the
same control twice. The suite now checks that every public page has one host
or the other.

### The editor bar is empty on phones, and that took three measurements

`.site-header` is sticky, so every pixel it takes is taken for the whole
session. On `resume.html` at 320px, where the bar already wraps so any added
button lands on a row of its own:

| Controls shown | Header height | Over HEAD |
| --- | --- | --- |
| Back up + Restore | 186px | +101 |
| Back up only | 126px | +41 |
| None | 85px | unchanged |

Forty-one permanent pixels off a 720px phone is a poor trade for a control
used a few times a year, and it is the same trade refused one step earlier
when the pair became one. Refusing it once and accepting it the second time
would only have meant stopping halfway. The whole row is hidden below 48rem,
at the wrapper rather than per control, so a button added to that row later
inherits the decision instead of quietly reopening it.

Nothing is lost that is not one tap away. The homepage strip carries "Back up
my work" and appears exactly when there is work to lose, and the homepage is
where a visitor restoring onto a new phone arrives anyway -- they have nothing
to open an editor with yet.

**The suite found the cost before I did.** Section 4 compares the working tree
against HEAD with ads blocked, and it reported six differing measurements, all
of them `resume.html` and `docs.html` at 320px: `header [0,0,305,186]` against
`HEAD [0,0,305,85]`. That is what a check written for ad-layout drift is for
-- it does not know what a backup button is, only that the header moved.

### A specificity trap on the way

The first attempt hid the restore button with `.editor-backup-restore {
display: none }` inside the 48rem media query. It had no effect. `.btn` sets
`display: inline-flex` and is declared some 2,200 lines further down the
stylesheet; **a media query carries no specificity of its own**, so the two
tied at one class each and source order decided it. The status line beside it
hid correctly on one class, because nothing else targets a `<p>` there -- so
the rule looked, to every reading, like it was being applied.

This is the same trap recorded for the homepage rail's own `display: none`
gate. It was fixed by raising specificity rather than by moving the rule
lower: order is what broke it, and a fix that depends on order is one
reshuffle away from breaking the same way.

**And on the continuation strip**, as a second entry point to the same export.
It earns its place by *when* it appears rather than by what it does: nobody
goes looking for a backup button, and this one is in front of a visitor who
demonstrably has work to lose, beside the control that throws it away.

The label reads "Back up my work" and not "this document" deliberately -- the
strip describes only the single most recent record, but the export carries all
six keys, and a visitor reading it as "back up this poster" would think the
rest was not covered.

## Behaviour worth knowing

**The confirm is conditional.** A restore overwrites with no undo, so it asks
first -- but only when `describeSavedWork()` finds something to lose. On the
device this feature exists for, a new phone with an empty store, there is
nothing to warn about and a dialog would be noise.

**The file input is cleared before opening, not after.** A file input fires
`change` only when the selection changes, so picking the same file twice in a
row would be silently ignored the second time. The same defect was fixed in
the poster editor's photo uploads on September 14, 2026.

**A successful restore reloads the page.** The editors read their keys once,
at init. Reloading is what makes a restore visible, and doing it in one place
means no page has to know that its storage changed underneath it.

**Three failure messages, not one.** A malformed file, an unrelated JSON file
and a well-formed backup holding nothing restorable are distinct, because
"that backup was empty" and "that was the wrong file" lead a visitor to
different next actions. The `format` marker is what makes the distinction
possible.

## The hook check, and why the guard is a flag

`initBackupControls` uses a module-level boolean rather than looking the row
up in the DOM. Section 1d of the suite asserts that every hook `app.js` looks
up exists in the served markup, which is what catches a hook renamed in HTML
and not in JS. A class this file creates itself has no markup to be found in,
so looking for it would have meant either shipping a dead class on 26 pages or
exempting the selector -- and an exemption list is how that check stops being
worth running.

Worth knowing: that scan reads the **raw source, comments included**. Spelling
the lookup out in a comment explaining why it is not done fails the check on
the strength of the comment alone. It did.

## Verification

Static checks: 12 of section 1o's 19 in `tests/verify-layout.js` belong to
this feature; the other 7 cover the discard path and are described in
`docs/error-fixes/START_FRESH_DID_NOT_CLEAR_EVERY_KEY.md`. Twelve deliberate
breakages were confirmed to fail them:

- the resume photograph key dropped from the list (the real bug)
- the resume template key dropped from the list
- a key left behind after an editor renamed it
- the theme "helpfully" added to the backup
- `docs.js` widening its logo guard without the importer following
- a typo in a colour field name, letting an unvetted fill through
- a typo in an image field name, letting a raw string through as a logo
- the prototype-poisoning guard removed
- a half-valid file left able to half-replace storage
- a restore that reports success but writes nothing
- the format marker emptied, so a wrong file reads as an empty backup
- a page carrying neither a mega-menu panel nor an editor bar, so it could
  host no controls at all

Behaviour was driven through the **real controls** in a browser -- the actual
button, the actual file input -- rather than by calling internals, which the
page does not expose. Export was captured by intercepting
`URL.createObjectURL`; restores were fed through the file input with a
`DataTransfer`.

Round trip: six keys planted, exported, storage wiped, file restored. All six
came back **byte-identical**, including the photograph record with its zoom
and offsets and the template id.

Adversarial, each through the real file input:

| Input | Result |
| --- | --- |
| `data:image/svg+xml` with a script, as the invoice logo | `""` |
| `<img src=x onerror=...>` in a text field | escaped |
| Already-sanitized `Bea &amp; Co &#39;24` | unchanged, not double-escaped |
| `__proto__` and `constructor` keys | dropped, `{}.polluted` undefined |
| `url(#evil)` and `red` as colours | `null` |
| A legitimate `null` background | kept |
| A valid `#C8925A` | kept |
| `tb_theme` inside the file | ignored, existing theme untouched |
| An unrelated JSON file | "That file is not a TemplateBox backup." |
| Malformed JSON | same message |
| Right format, nothing restorable | "That backup holds nothing this version can restore." |
| 9MB file | refused before being read |

Also confirmed: the confirm fires and cancelling changes nothing; accepting
overwrites; **an empty device is never asked**; both menu buttons sit in the
viewport and hit-test to themselves at 1440x900; the header's right edge still
lands exactly on the rail's left edge; and no page scrolls horizontally.

On `resume.html`, which uses the editor-bar fallback: both buttons visible and
hit-testing to themselves at 1440x900 with the header unchanged at 85px, the
real export button carrying all three resume keys; and at 320px the row hidden,
the header back to **exactly** the 85px HEAD measures, no horizontal scroll.

## Filed separately

- **The mega-menu panel overflows the viewport with no internal scroll.**
  1256px at 1440x900, pinned by the sticky header, so its foot is unreachable.
  Pre-existing since the footer was folded in. The social links are the
  visible casualty.
- **"Start fresh" on the continuation strip removes only the editor's main
  key.** For the resume that leaves `tb_resume_photo_v1` in storage. Surfaced
  by taking the full key inventory for this feature.

  **Corrected, and fixed, on the same day.** The note here first claimed a
  fresh document would open carrying the previous photograph. It does not:
  `js/resume.js` gates on `hasSaved && validPhoto(...)` and actively clears a
  photograph that outlives its document, with the reasoning written beside it.
  Reproduced in a browser and no image appeared. What was real is smaller --
  the data sat in storage until the visitor next opened that editor -- and is
  fixed now. See `docs/error-fixes/START_FRESH_DID_NOT_CLEAR_EVERY_KEY.md`.
