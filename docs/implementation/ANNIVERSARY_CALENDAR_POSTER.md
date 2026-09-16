# The Anniversary Calendar Poster

Date: September 11, 2026
Status: Implemented

## Summary

A supplied artwork -- a heart-shaped photo collage over a month, with the day
that matters marked -- is the poster editor's FIFTH layout, after the playing
card, the diagonal split, the search screen and the music player.

| File | Change |
| --- | --- |
| `js/poster.js` | the `anniversary` layout: geometry, the calendar, both painters, nineteen slots |
| `poster.html` | two names, the tagline, month, year, day; the scan code lifted out of the player's block |
| `css/style.css` | the catalog miniature |
| `index.html`, `js/admin.js` | the catalog card and its registry entry |

The brief this was built from is `docs/project/ANNIVERSARY_POSTER_PROMPT.md`.

## The supplied artwork is LANDSCAPE and this is portrait

At the owner's instruction. The source is A4 landscape with the collage on the
left and the code and calendar stacked to its right; there is no room for that
beside a 400pt-wide heart on a 597pt page, so the four blocks stack instead --
names, collage, code, calendar -- with the tagline along the foot.

That decision removed the largest risk the brief identified. `PAPER` in
`poster.js` has no landscape entry and no layout had ever drawn one; portrait
means none of that had to be touched.

**What is NOT rearranged is the collage.** Those eighteen rectangles are the
heart, and their proportions are the design. They are held in the ARTWORK'S own
coordinates and normalised into whatever box this layout gives them, so the
shape cannot drift while the page does. `ANNIV_COLLAGE_BOX` is derived from the
rectangles rather than typed, and the collage's height follows its own aspect
rather than being a second number to keep in step.

## The artwork's calendar was wrong, which is the whole point of the template

The source is labelled NOVEMBER 2025 and puts the 1st under M in a five-row
grid ending with 30 in the third column.

**1 November 2025 was a Saturday.** The real month starts in the last column,
needs six rows, and ends with 30 alone on the sixth. The 29th, which the artwork
marks with a heart, was a Saturday and not a Monday. The designer laid out a
generic 30-day month opening on a Monday and typed a real month's name over it.

So none of its thirty date positions are copied. `annivMonth()` derives the
first weekday and the length through `Date.UTC`, never by parsing a date string
-- `new Date("2025-11-01")` is UTC midnight and renders as the previous day
anywhere west of Greenwich, which would put the whole grid on the wrong weekday
for half the planet.

Column centres come from the rule beneath the header, seven across its span.
Row baselines are one pitch from one origin. Nothing is hand-placed.

**The rhythm is set by the SIX-row case, not the five-row one.** A 31-day month
opening on a Friday or Saturday needs six; a 28-day February opening on a Sunday
needs four. Both are drawn, and the vertical budget is arranged so row six
clears the tagline. A layout tuned to the common case and broken by August is
the fault the artwork already has.

Verified by rendering: February 2026 draws four rows, August 2026 six, November
2025 six.

## Nineteen slots, and why that is now safe

Eighteen collage boxes plus the scan code. Until this morning `SLOT_COUNT` was
read in three places as the number of slots a visitor can REACH, and adding the
player's eighth put a phantom "Card 8" in the search screen's menu that deleted
the player's photograph. `slotsFor(layout)` is the fix, and adding eighteen more
slots is a two-line change because of it -- without that work this change would
have put ten phantom cards in that menu, each able to destroy a picture on a
different poster. See
`docs/error-fixes/PHANTOM_CARD_EIGHT_AND_FRAMING_CONTROLS_ON_THE_WRONG_SLOT.md`.

The collage's first box is **slot 0**, "the photograph" every single-photo
layout uses, so a picture carries across when a visitor tries this template
against the card or the player. The scan code reuses **CODE_SLOT**, because it
is the same kind of thing the music player draws -- which is also why its
control was lifted out of the player-only block in `poster.html` into one both
layouts show.

Eighteen boxes cannot be filled one at a time, so `uploadTargets()` gained a
branch: a batch fills the collage in the artwork's own order, centre first and
then out through the heart, with the same two rules the search screen uses --
empty boxes first, then wrap from the selection.

## Nothing of the source ships

The supplied folder contains a real Spotify scannable export -- their logo mark
baked into the PNG, encoding one specific track -- and two real people's names.
None of it is here. The code reaches the poster only inside an image the visitor
uploads, exactly as the music player does, and the names are placeholders.

Neither supplied font is bundled. Monotype Corsiva and Times New Roman are both
Monotype's and both carry an explicit licence-agreement clause; `site/` is the
publish directory. **This is the opposite of the trade counter receipt**, whose
supplied Roboto was SIL OFL 1.1 and could have been bundled. Check the font you
are handed, every time.

Playfair Display italic stands in for the script. It is a different letter and
it is the one real loss in this template; the italic axis was added to the
family `poster.html` already loads rather than introducing a new family.

## Two painters

The canvas and `exportSVG()` are separate renderers in this file and they drift
silently. Everything either one needs comes from the shared helpers --
`annivRects`, `annivGrid`, `annivMonth`, `annivCell` -- and neither holds a
coordinate of its own.

Verified: ground, collage, both hearts and the rule match at diff 0. The
exported file carries both names, the tagline and the month, and carries NO
preview prompt and NO selection ring.

**A measurement trap worth recording.** Comparing the two painters by rendering
the SVG into an `<img>` and sampling pixels works for shapes and fails for TEXT:
an SVG loaded as an image gets no webfonts, so every string falls back to a
system face and samples differ by 200 levels for no reason. The check that
actually means something is the exported coordinates. Read back: the tagline's
centre is exactly W/2, its baseline exactly `800 * (H / 841.89)`, and "29" lands
in column 7 row 5 -- where 29 November 2025 belongs.

The music player's SVG check has the same blind spot and did not expose it,
because its seven sample points were all shapes.

## Two things found by looking

- **The day header was tracked and came out bunched.** The artwork letter-spaces
  `S M T W T F S` at 0.4em, and copied straight across that put the seven
  letters over 147pt of a 300pt grid -- measured. Tracking is how you space a
  line of type; this is a header row over seven columns, and what makes it read
  as one is each letter sitting over the dates it labels. It is centred per
  column now, like the dates: 168.4 to 430.9 against a rule of 148.5 to 448.4.
- **The catalog miniature overflowed**, because the heart was given the tile's
  full width where the poster gives it 67 per cent. Then, once it fitted, the
  calendar was two rules where the poster has six, and the tile had a hole where
  the poster has a month.

## Section 13: the calendar is a calculation, and now it is checked

`tests/verify-layout.js` gained a section for the arithmetic, because the
arithmetic is the whole template and it had no check.

What it asserts is WHERE THE MARKED DAY LANDS -- its column and its row -- over
six months chosen for their edges: one opening on a Saturday in six rows, a
February opening on a Sunday in four, a 31-day month opening on a Saturday, a
leap February, a 29th in a NON-leap February, and a 31st in a 30-day month. The
last two must mark nothing at all. Expectations are computed in Node from the
same calendar every other program uses, deliberately NOT from a second copy of
the page's own formula: a check that reimplements the code it is checking agrees
with it even when both are wrong.

**It is measured from the drawing and calibrates itself.** Day 1 is in row 0 and
day 8 in row 1 in every month that exists, so the poster hands over its own row
pitch without being asked where it drew anything, and a later change to the grid
constants cannot quietly turn the assertion into a measurement of blank paper.

**Two earlier versions of this check did not work**, and both failures are worth
keeping. Counting rows of ink under-counted, because the marker's heart
overhangs its row by about a point -- enough to fuse it to the row below.
February 2026 then reported three rows for four and August 2026 five for six,
purely because the marked day was not on the last row. Masking the heart out
instead broke it the other way: a lone marked "1" is drawn white ON the red, so
removing the red fragmented that one numeral into three slivers and August 2026
reported eight rows for six. Neither version was wrong about the poster. Both
were wrong about what they were measuring.

**Verified by breaking it, twice**, as this project requires of a new check:

| Bug introduced | What failed |
| --- | --- |
| first weekday shifted by one, the artwork's own error | all four markable months, on column |
| every month forced to 31 days | both impossible-date cases, which then marked something |

The two bug classes fail different cases, which is what says the six cases are
each carrying weight rather than duplicating one another.

## The landing page

`anniversary-calendar-poster.html`. The poster editor had only the generic
`poster-maker.html`, so this is the first per-design landing page for that
editor rather than a copy of an existing pattern -- worth knowing before a
second one is added.

Its angle is the thing no other page here can claim: the calendar is real.
A whole section is given to the artwork's own error, because "the date is on the
right day of the week" is both the differentiator and the thing a visitor would
otherwise never think to check.

Adding it touched the usual surfaces: a social card (`og-anniversary.png`, the
thirteen-card set regenerated together with the other twelve byte-identical
afterwards), the mega-menu in 21 files plus `js/admin.js`, `sitemap.xml`, and
incoming links from the two poster-adjacent pages.

One thing caught by looking rather than by measurement: the hero preview was
first written with invented class names and rendered as a poster with NO HEART
-- names, code strip and calendar over an empty black field. It carries the
catalog card's own markup now, which is 18 percentage-positioned boxes derived
from the artwork's rects, so the two miniatures cannot drift apart either.

## Moving a photograph between boxes

The boxes are fixed and stay fixed: their arrangement IS the heart, and moving
one would destroy the thing the template is. What a visitor actually wants is a
particular photograph in the large centre box, which is a different operation --
so `swapSlots()` trades the pictures rather than the boxes.

Select a box on the preview, then choose where its photograph should go. The two
trade places and each keeps its own framing, because a view is a crop of ONE
photograph and leaving them behind would apply somebody's crop of one picture to
another -- the same argument `fillSlot()` makes for resetting the view on a fresh
upload.

The menu lists every box except the one holding the selection, marks the empty
ones, and is rebuilt rather than relabelled: which entry is missing changes every
time the selection does, and a list one item shorter cannot be kept in step by
editing text in place. It writes NO history entry, for the reason `cardClear()`
gives -- photographs are not in `state`, so a commit would push an entry that
restores framings undo cannot bring photographs back to.

## Two colourways

`ANNIV_THEMES` holds colour and nothing else, so the geometry cannot drift
between them -- the separation `SCREEN`/`SCREEN_THEMES` and `PLAYER`/
`PLAYER_THEMES` already make in this file.

`boxFill` and `boxStroke` are the pair that matters. An empty collage box is a
white panel on the artwork's black ground, and that is the DESIGN rather than a
placeholder: the heart reads as a heart before a single photograph is in it.
Invert the ground and a white box disappears, so the light colourway outlines its
boxes instead -- the same problem and the same answer as the player's empty album
panel.

**A defect the second colourway exposed, found by looking.** The marked day's
number was drawn in the page ink, which is white on the dark ground and near
black on the light one -- so on the light colourway it came out dark on the red
heart. The comment above that code already said the number "keeps the number
white, which is the only reason it stays legible on that red", and the code had
never done what the comment claimed; on one colourway it did not matter. The
themes carry `onAccent` now, because that number contrasts with the HEART and not
with the page.

## Not done

- **The scan code and the collage share one framing slider.** Selecting either
  points the controls at it, which is correct, but there is no way to frame two
  boxes at once.
- **No third colourway.** `ANNIV_THEMES` would take one entry.
