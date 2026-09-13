# Editing a Layout's Own Text on the Preview

Date: September 13, 2026
Status: Implemented

## Summary

Double-click any line on the four narrative posters and type on the poster
itself. Fourteen fields across four layouts:

| Layout | Fields |
| --- | --- |
| Now Playing, Music Poster | song, artist, elapsed, total, caption heading, caption line |
| Anniversary Calendar, Photo Heart | nameA, nameB, tagline |
| Birthday Calendar, Photo Cascade | quote, closing |
| Birthday Tribute, Photo Wall | heading, message, foot title |

This extends the free-text editor to the layouts' own fields, which that
document listed as not done.

## The painters report; the editor does not re-derive

The obvious approach is to work out where each field lands from the layout
constants. It is the wrong one. Several of these fields SHRINK to fit -- the
song title, both anniversary names, the tribute's foot line -- so their drawn
size is a function of their content, and three more are wrapped blocks whose
height depends on where the words broke. Re-deriving that in an editor means a
second copy of the painter's own arithmetic, which is the failure this codebase
keeps writing documents about.

So each painter calls `noteText()` at the point it draws, with the numbers it
just drew with:

    noteText(c, "song", { x, y, w, h, size, font: c.font, align: "left" });

`textRegions` is rebuilt on every preview paint. The region IS the drawing, so
it cannot disagree with it.

**Recording is additive, and that was the deciding factor.** The alternative --
threading a "skip this one while it is being edited" flag through the same
fourteen call sites -- is fourteen chances to stop a poster rendering
correctly. A field whose painter forgets to record is merely not editable on
the canvas. Nothing can come out drawn wrongly.

Only the preview records. Exports paint at their own scale, and letting one
overwrite these would leave the editor pointing at coordinates from a different
canvas.

## Two kinds of editor, and why they differ

    { kind: "text",  id }    a free text element
    { kind: "field", key }   a layout's own field

A free text element is one object drawn in one place, so the canvas SKIPS it
and the opaque editor draws it instead -- one rendering at a time.

A layout field is a GHOST: transparent ink over text the canvas keeps drawing,
contributing only a caret and a selection. That is what `#p-query-live` has
always done for the search bar, and it is the right trade here for the reason
above -- no painter needs to know the editor exists.

The caret cannot inherit `currentColor`, which on a ghost is transparent, so
`noteText()` records `c.fillStyle` at the moment of drawing. One line in the
recorder rather than a colour repeated at fourteen call sites.

## The wrap worry was unfounded, and it was worth checking

The stated risk for wrapped blocks was that a textarea and `hbdWrap()` would
break lines differently, putting the selection on the wrong words. Measured
first: the DOM and the canvas size the same string to 378.72 and 378.73 pixels.
With metrics that close, two greedy wrappers at the same width agree.

Confirmed by selecting characters 14 to 52 of the tribute's message and looking
at it: the highlight runs to the end of line one, across all of line two and
into line three, aligned to the glyphs on each.

## Details that needed their own handling

- **The player's times** carry the artwork's 0.87 horizontal condense. The
  editor wears it as `scale(scale * squeeze, scale)`, or its caret walks
  further right with every digit.
- **The tribute's heading** is drawn as two halves around a heart but is ONE
  string in state, with a run of spaces marking where the heart goes. Its
  region spans both halves, and it is sanitised with `cleanHeading()` -- the
  panel's own rule -- so typing on the canvas cannot destroy the marker that
  `cleanBlock()` would eat.
- **The tribute's foot title** is centred as a unit with its heart. The region
  covers the WORDS only: a box including the heart would put the caret past
  the end of the text.
- **The anniversary names** flank a heart, one right-aligned into the gap and
  one left out of it. Each region runs from the heart back to its own margin.
- **Wrapped blocks** take the WRAP WIDTH as their box, not the longest line.
  Sized to the ink, the editor would re-wrap differently the moment a word was
  added.

## Verified

- All fourteen fields, on all four layouts: the editor opens on the field, and
  typing reaches both the state and the panel control.
- Selection alignment checked by eye on a single line and on a wrapped block.
- Time fields correctly reject prose -- `cleanTime` strips it, exactly as the
  panel does. Both routes share one sanitiser per field.
- Coalesce keys are per field, so a burst of typing is one undo whichever of
  the two routes it was typed through.

## Not done

- **The month, year and day are pickers, not text**, so the month name and the
  dates are not editable on the canvas. They are derived, not typed.
- **An empty field records nothing**, because a painter that draws nothing has
  nothing to report. Text still starts in the panel; this edits what is there.
