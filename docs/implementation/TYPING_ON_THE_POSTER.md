# Typing on the Poster

Date: September 13, 2026
Status: Implemented

## Summary

Double-click any text element on the poster preview and type on it directly.
A plain click still selects and drags, which is what the panel has always
promised; this is a second gesture rather than a replacement for the first.

| File | Change |
| --- | --- |
| `js/poster.js` | `textBox()`, `positionTextLive()`, `beginTextEdit()`, `dblclick` |
| `poster.html` | the overlay textarea, and a hint that says the gesture exists |
| `css/style.css` | `.text-live` |

## It is the search bar's trick, with one thing reversed

`#p-query-live` already does this for the search-screen poster: a field parked
over the canvas so the caret and the selection are real. That established the
positioning, and the reason the element stays at 16px while a transform does
the sizing -- iOS zooms the whole page when it focuses a field computing under
16px, and poster type is regularly far under it.

One thing is deliberately the opposite. The search bar's input is TRANSPARENT
and the canvas keeps drawing the words underneath; this one is opaque and the
canvas stops drawing the element while the editor is open.

The search bar is one short line that never wraps, so a transparent field can
sit over the drawn glyphs and contribute only a caret. A text element wraps,
can be centred or right-aligned, and carries letter-spacing and a line-height
of its own. Two wrap engines agreeing to the pixel is not something to rely on,
and a few pixels out means the visitor reads every character twice. One
renderer at a time is the honest way round.

The skip is passed INTO `paint()` rather than read from module scope:

    paint(ctx, s.w, s.h, { skipTextId: textEditing });

Exports call `paint()` without it, so they always draw every element. Verified
directly -- an SVG exported while the editor was open contains the text the
canvas was refusing to draw.

## textBox(), because three places were measuring the same box

The selection ring and the hit test each worked out where a text element lands,
independently, with the same alignment rules written twice. The editor would
have been a third copy.

`textBox(el, W, H)` is now the one answer, and it deliberately leaves the
canvas context's font SET, because every caller wants it -- the ring measures
with it, and the editor reads `ctx.font` to copy the face into the DOM rather
than rebuilding the shorthand and risking a disagreement about weight, slant,
or which family actually resolved.

Measured afterwards: the DOM and the canvas size the same string to 378.72 and
378.73 pixels, and the drawn ink and the overlay share a centre to within half
a pixel.

## The box, not the ink

The overlay is the text's COLUMN, not the run of glyphs. An alignment other
than left means the drawn words sit inside a wider column, and an editor shaped
to the glyphs would put the caret where the text is not. So it takes `boxW`,
offset by the alignment, exactly as the canvas does.

## Three false alarms, all mine

Worth recording, because each one looked like a product defect and each was an
artifact of the probe:

1. The canvas appeared to keep drawing the element while editing -- the ink
   count was unchanged, then grew when a longer string was typed. It was
   counting the dashed SELECTION RING. `#8A6A3B` has a luminance of 109 and the
   threshold was 110. The ring tracks the text box, so it grew exactly as text
   would. Threshold 60 separates it from `#1A1A1A` text at 26, and with that
   the canvas measures no text ink at all while the editor is open.
2. Two screenshots seemed to show the text at different widths. They were taken
   in separate page loads, where the webfont may not have been equally ready.
   Measured in ONE session the widths are identical.
3. An ink bounding box that "proved" a misalignment had caught the poster's
   dark frame rather than the glyphs.

The lesson is the same one this codebase keeps relearning: a measurement is
evidence only once you have checked what it actually selects. Two of these
would have been read as a defect and "fixed", which would have broken working
code.

## Not done

- **Only the free text elements.** The layouts' own fields -- song title,
  artist, month, the tribute's heading -- are still panel-only. Each carries
  its own geometry, shrink-to-fit and wrap rules, so each would need its own
  mapping rather than one general one.
- **An empty element cannot be double-clicked**, because `hitTest()` skips
  elements with no text and there is nothing on the canvas to aim at. Text
  still starts in the panel; this edits what is already there.
