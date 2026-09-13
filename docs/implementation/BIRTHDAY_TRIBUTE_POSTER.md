# The Birthday Tribute Poster

Date: September 12, 2026
Status: Implemented

## Summary

A supplied A4 portrait artwork -- a calendar across the head of the page, a wall
of fifteen overlapping photographs, a heading carrying an inline heart, a short
message and a line along the foot -- is the poster editor's SEVENTH layout,
after the playing card, the diagonal split, the search screen, the music player,
the anniversary calendar and the birthday calendar.

| File | Change |
| --- | --- |
| `js/poster.js` | the `tribute` layout: constants, both painters, two colourways, a third sanitiser |
| `poster.html` | the heading, the message, the foot line, the colour, and the SHARED calendar block |
| `index.html`, `js/admin.js` | the catalog card and its registry entry (47 templates) |
| `css/style.css` | `.mock-doc.poster.trib`, the catalog tile |
| `tests/verify-layout.js` | section 13 now runs over all three calendar posters |

The brief this was built from is
`docs/project/BIRTHDAY_TRIBUTE_POSTER_PROMPT.md`.

## Nothing of the source ships

The folder's root PNG is a marketplace preview whose poster is a COMPLETED
example: roughly fourteen photographs of one identifiable private individual and
one of two people embracing. The SVG's heading and message are a real message
from one person to their partner. None of it is here -- not the file, not a
crop, not a thumbnail derived from it, not a sample, not a sentence. The
placeholders are our own and say nothing about anybody.

Both supplied fonts are Monotype's and carry an explicit licence-agreement
clause, so neither is bundled. That is the same answer as both earlier calendar
posters and the opposite of the trade counter receipt's Roboto, which was OFL.

## Its calendar is right about the week and wrong about two cells

The third artwork in this family, and the third different answer.

The grid says OCTOBER and puts the 1st under W and the 5th under S. October 2025
did open on a Wednesday, and its 5th was a Sunday. So far, correct -- and better
than the anniversary artwork, which labelled a Saturday month as a Monday one.

Then it draws the 6 and the 7 in the FIRST row, beside the 1, 2, 3 and 4, and
leaves row two reading 5, then a gap of two columns, then 8. The dates are in
the right COLUMNS and two of them are a row too high. The marked day is the 6,
so the one date the poster exists to point at is drawn in a cell it does not
belong to.

Measured from the source's own text origins, which is the only way to see it:

    row 0 (y 127.99)   6@63.2  7@94.8   1@129.6  2@161.7  3@190.1  4@219.9
    row 1 (y 150.11)   5@29.8                    8@125.4  9@158.0 10@184.8 11@216.3
    row 2 (y 172.23)  12@24.5 13@59.1  14@90.3  15@125.4 16@158.2 17@184.8 18@215.6

Three artworks, three outcomes: one wrong about the weekday, one entirely right,
one right about the weekday and wrong about two cells. **None of that is a
rule.** Only the checking transfers, which is the same conclusion the birthday
poster's document reached from the opposite result.

Here the grid is computed, by `annivMonth()` and `annivCell()`, shared with both
earlier posters. One calendar in this editor, three layouts that draw it.

## Fifteen boxes, and the overlaps are the design

`TRIB_BOXES` is the artwork's own fifteen rectangles in its own points,
normalised onto the drawn page by the shared `scaleBoxes()`. Four pairs of them
genuinely overlap -- not by a hairline, by tens of points -- and the white
keyline on every box is what turns that into a stack of photographs on a wall
rather than a set of misaligned rectangles.

Two consequences fall straight out of the overlaps, and both are places where
copying the birthday poster's code would have been wrong:

- **They are painted FORWARDS**, first to last, so a later box sits on an
  earlier one. That is the artwork's own order and it is load-bearing.
- **`slotAt()` searches BACKWARDS.** The box a click lands in has to be the one
  painted last, or clicking the visible photograph selects the one hidden
  underneath it.

One box, index 3, is filled a lighter red than the other fourteen in the source.
It is kept, as `boxTint`, because it is the only thing giving the wall any depth
while it is empty.

## The heading's heart is marked by a space, so it needed a third sanitiser

The artwork stores the heading as ONE string under `xml:space="preserve"`:
leading spaces, a single letter, a run of FIVE spaces, then two more words. The
wording itself is a real message between two people and is not repeated here or
anywhere else in this repository.

The heart is not a separator between two phrases. It is standing in for the
second letter of a two-letter word, and that run of five spaces is the only
instruction in the entire file about where it goes.

So two-or-more spaces mean "the heart goes here", and `cleanHeading()` exists
because neither existing sanitiser could carry that:

- `cleanBlock()` collapses runs of spaces, which is right for a paragraph and
  would silently delete the marker.
- `cleanLine()` does not keep the run either.

`cleanHeading()` folds newlines to a space, normalises runs of three or more
down to two -- so leaning on the space bar gives the same result as pressing it
twice -- and caps at 60 characters. `tribHeadingParts()` then trims before it
splits, so leading spaces do not put the heart in front of the first word.

The heart itself is placed by MEASURING the text before it, never by padding
with spaces: `measureText()` gives the width, the heart goes a fixed gap after
it, and the remainder follows. The artwork's own five-space gap was only ever
correct in one font at one size.

## Four hearts on strings, four sparkle clusters

`TRIB.strings` holds four vertical lines from the top edge, each with its own
length and its own heart width, and the hearts hang at the feet. They are drawn
in two passes -- every string, then every heart -- so no heart is crossed by a
later line.

The sparkles share their path and painter with the birthday poster and share
NO data with it: `TRIB_SPARKLES` is this artwork's own four clusters. Measuring
them is what exposed a defect in the birthday poster that had already shipped
-- see `docs/error-fixes/EYEBALLED_SPARKLE_GEOMETRY.md`.

**Revised September 13, 2026.** The hearts here are GLOSSY now, seven layers
each and two-thirds larger than they were, and the sparkle uses the artwork's
own path rather than an approximation of it. See
`docs/implementation/CALENDAR_POSTER_VISUAL_FIDELITY.md`.

## Two colourways, and the boxes stay red in both

`TRIB_THEMES` holds colour and nothing else; the layout is identical.

The empty photo boxes are red on BOTH, which is a deliberate departure from the
rule the other posters follow. On the anniversary and the birthday, an empty box
is a white panel that has to become an outline on white paper, because a white
box on white paper is not a box. Here the red IS the artwork's empty state -- a
wall of red rectangles is a finished-looking design, not a placeholder -- so
what changes between colourways is the KEYLINE, which cannot be white on white
paper, and the sparkle, which is pale yellow on black and gold on white.

## The first render was completely blank, and the cause was declaration order

Nothing drew. The frame select had zero options and the preset was never
consumed, which together say the module threw during initialisation rather than
during painting.

`state` is built at roughly line 1140 and reads `DEFAULT_TRIB_THEME`. The TRIB
data block had been added at roughly line 2400, next to the other layout
constants, where it reads naturally. `const` is hoisted but not initialised, so
reading it earlier is a ReferenceError in the temporal dead zone, and the whole
module died before anything was wired up.

The 6041-byte block moved above `const ANNIV_DAYS`. Worth recording because the
symptom -- an empty select and an unconsumed preset -- points at the wiring, and
the cause was 1200 lines away in a file where every other layout's constants sit
exactly where this one's had been put.

## The selection ring became everyone's

The anniversary poster rang its selected box on the preview and justified it
with "with eighteen boxes this is the only thing on the preview that says which
one the size slider is holding". That argument was never about the anniversary.
The birthday has twelve boxes and shipped with no ring at all.

`drawCollageChrome()` is that code lifted out and pointed at all three layouts.
The tribute is the strongest case of the three, because four of its pairs
overlap and which box a click lands in is not something a visitor can see. Same
colour, dash and weight as the search screen's ring and the player's, for the
reason the player's comment already gives: two rings that mean the same thing
should not look like two different things.

Preview only. `render()` calls it and `paint()` does not, so it is in no export.

## Section 13 now runs over three posters, and needed a new bound

Adding the tribute to the suite's calendar section was one more row in its
`LAYOUTS` table plus one thing that had not come up before.

This poster's scan window is bounded on BOTH sides by drawing rather than by
margin. Its first photo box's red fill begins at 228.96pt of an 841.89pt page,
and a six-row month's last row of dates sits at 238.59pt. **There is no window
that holds row 5 and excludes a red box.** The window stops at 227.3pt: 2.5pt
below the lowest ink a row-4 marker reaches, 1.7pt above the highest ink of a
box.

That is safe for the poster, and for a reason worth writing down rather than
discovering twice. Row 5 exists only when a month's first weekday and its length
push the last day past index 34, and that puts the day in column 0 or column 1
and nowhere else -- the far left of the page, where no photo box reaches. The
drawing is correct down there; it is only the pixel scan that cannot see it.

It is NOT automatically safe for a future case, and that is the part that needed
code. A marker half inside the window gives a clipped centroid, and a clipped
centroid can still round to the right row -- passing for the wrong reason, which
is worse than failing. So each layout now declares how many rows its window
reaches and the expectation is compared against that FIRST, failing loudly with
an instruction to read the comment before widening anything.

The marker search is still bounded by the rule's own measured extent, and on
this layout that bound is doing more work than on either sibling: this poster
draws fourteen red boxes and four red hearts, all in the marker's own colour.

## Not done

- **No landing page.** `anniversary-calendar-poster.html` is the pattern if one
  is wanted.
- **The message wraps to a fixed width.** It does not reflow around the
  photographs; the width is the gap to the leftmost box in the middle band.
- **The string and sparkle positions are fixed.** They are decoration and
  nothing reads them from the visitor.
- **The boxes cannot be rearranged.** The anniversary poster can move a
  photograph between boxes; this one cannot yet.
