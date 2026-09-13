# The Colour Picker Became Shared

Date: September 13, 2026
Status: Implemented

## Summary

The poster editor's heart colour was an `<input type="color">`. It is the full
picker now -- swatch, hex readout, caret, saturation/value square, hue track,
Hex/R/G/B fields, eyedropper and a preset grid -- and it is not a second
implementation of one. `createColorPicker()` moved out of `js/mockup.js` into
`js/color-picker.js`, and both editors call it.

| File | Change |
| --- | --- |
| `js/color-picker.js` | NEW. The picker and its colour maths |
| `js/mockup.js` | 323 lines lighter; aliases the shared module |
| `js/poster.js` | `initHeartPicker()`, `syncHeartPicker()` |
| `poster.html`, `mockup.html` | load the shared script |

## Why it moved rather than being copied

The mockup editor already had exactly the control the reference showed, down to
the inline hue strip under the trigger. The choice was to copy 243 lines or to
move them.

Copying was not really a choice. This codebase has been bitten repeatedly by
two implementations of one thing drifting -- the two poster painters, the band
that the HTML sheet and the jsPDF export each drew differently, the mega-menu
that `js/admin.js` has to regenerate identically. A second colour picker would
have been the same mistake with a fresh coat of paint.

It moved easily because it was already written as a factory over a node map and
a `getHex`/`setHex` pair, with no reference to mockup-specific state. Nothing
had to be generalised; only its address changed.

**Lifted verbatim, by script, not retyped.** Three hundred lines of working
colour arithmetic is exactly the kind of thing where a transcription slip looks
right and is quietly wrong.

## What moved and what stayed

Moved: `hexToRgb`, `rgbToHex`, `rgbToHsv`, `hsvToRgb`, `COLOR_PRESETS`,
`trackRatio`, `bindTrack`, `createColorPicker`, and a private `icon()`.

`hexToRgb` and `rgbToHex` are used all over `mockup.js` -- 21 call sites
between them -- so rather than rewrite every one, that file now does:

    const hexToRgb = window.TBColor.hexToRgb;

One line each, every call site untouched, and still exactly one implementation
on the site. `clamp` stayed local in both: it is a one-line utility, not a
shared concern, and threading it through a namespace would be ceremony.

## The poster's instance differs only in its callbacks

    getHex: () => cleanColour(state.heartColour) || DEFAULT_HEART_COLOUR
    setHex: (hex) => { ... beginChange(); state.heartColour = next; commit("heart-colour"); }

No colourways and no Transparent state -- those are options the mockup editor
supplies and the heart has no use for, so its grid is the 28 generic presets
and the eyedropper.

`setHex` returns false for a rejected or unchanged value. The picker calls it
on every pointermove, so without that guard a drag across the hue strip would
write a history entry per pixel of travel; with it, and with one coalesce key
for the whole gesture, a sweep is one undo.

## A defect this uncovered, which had nothing to do with the picker

Wiring the picker's undo revealed that **undo and redo had been silently
dropping all four fields added earlier that day** -- `heartColour`, `codePos`,
`captionHead` and `captionBody`.

The cause was a scripted edit that reported success and wrote nothing. The
script applied five substitutions; the fourth failed its match count and called
`sys.exit(1)`, which happens BEFORE the file is written. So the three that had
printed "ok" were never saved either. A later, narrower script re-applied only
the last two, and the gap went unnoticed because the feature still worked:
`migrate()` supplies the defaults on load, so the fields were always populated
and only the history path was short.

Found by auditing all five persistence points for each field rather than
trusting that the edits had landed:

    heartColour   default:0 snapshot:0 restore:0 persist:1 migrate:1

Two lessons worth keeping. A script that edits a file must write what it has
already matched or nothing at all -- printing "ok" for work it then discards is
worse than failing outright. And "the feature works" is not evidence that the
wiring is complete, because a default can mask a missing restore indefinitely.

Verified afterwards: a colour change, a position change, undo, undo, redo --
each step restoring both fields correctly.

## Verified

- Mockup editor unchanged: picker opens, 36 presets, a preset click moves the
  hex, the dot and the inline hue thumb.
- Poster: 28 presets, preset click, typed hex and the R/G/B fields all drive
  the drawn heart; the hue thumb tracks.
- Undo and redo restore the heart colour and the code position.
- `node tests/verify-layout.js` green.
