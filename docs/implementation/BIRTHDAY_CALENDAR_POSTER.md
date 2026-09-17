# The Birthday Calendar Poster

Date: September 12, 2026
Status: Implemented

## Summary

A supplied A4 portrait artwork -- a birthday tribute carrying a calendar, a
cascade of twelve photographs, a quote and a closing line -- is the poster
editor's SIXTH layout, after the playing card, the diagonal split, the search
screen, the music player and the anniversary calendar.

| File | Change |
| --- | --- |
| `js/poster.js` | the `birthday` layout: constants, both painters, two colourways |
| `poster.html` | the quote, the closing line, the colour, and a SHARED calendar block |
| `index.html`, `js/admin.js` | the catalog card and its registry entry |
| `tests/verify-layout.js` | section 13 now runs over both calendar posters |

The brief this was built from is
`docs/project/BIRTHDAY_CALENDAR_POSTER_PROMPT.md`.

## Nothing of the source ships

The folder's root PNG is a marketplace preview whose left-hand poster is a
COMPLETED example filled with a dozen photographs of one identifiable woman, and
its quote and closing line are a real message from one person to their mother.
None of it is here: not the file, not a crop of it, not a thumbnail derived from
it, not a sample, not a sentence. The placeholders are our own and say nothing
about anybody.

Both supplied fonts are Monotype's and carry an explicit licence-agreement
clause, so neither is bundled -- the same answer as the anniversary poster and
the opposite of the trade counter receipt's Roboto, which was OFL.

## Its calendar was RIGHT, which is the point worth recording

The artwork says SEPTEMBER, opens the 1st under M in five rows of thirty days,
and marks the 15th. September 2025 opened on a Monday, has thirty days, needs
five rows, and its 15th was a Monday. Everything agrees.

That is the opposite of the anniversary artwork, which claimed November 2025
opened on a Monday when it opened on a Saturday. **Neither fact is a rule.**
Both were checked, and the checking is the only part that transfers.

It is still computed, for reasons that have nothing to do with this month being
right: the source's positions are hand-set -- one row sits at x 34.02, 78.99,
119.46, 165.13, 207.75, 242.21 and 282.24, gaps of 44.97, 40.47, 45.67, 42.62,
34.46 and 40.03 -- and a visitor picking another month gets another first
weekday, another length and four to six rows.

`annivMonth()` and `annivCell()` do that arithmetic and are REUSED. There is one
calendar in this editor and two layouts that draw it.

## Three places the artwork was followed, and two where it was not

**Followed.** The twelve boxes are the artwork's own, including the gaps between
them -- measured at 3.8 to 9.6 points and never the same twice. The cascade
reads as a cascade BECAUSE the spacing is irregular; squaring it onto a grid
would turn a scatter into a table. The red keyline is on every box, filled or
not, because it is what holds twelve rectangles together as a set of pictures.

**Not followed: the marked day.** The artwork leaves its `15` in place and draws
an opaque heart OVER it, so the one date the poster exists to point at is the
only one that cannot be read. Here the heart goes down first and the number is
drawn on it in a colour that contrasts with the heart rather than with the page.
The anniversary poster already does that, and its `onAccent` token exists
because a number drawn in the page ink vanishes on red. Two layouts in one
editor disagreeing about this would be worse than either choice.

**Not followed: the quote's centring.** The artwork's last line is centred by
nineteen literal spaces under `xml:space="preserve"` -- an indent that was only
ever correct in Monotype Corsiva at 30.63px. The quote is a field somebody types
into, so it WRAPS, and `cleanBlock()` collapses runs of spaces while keeping
line breaks. Verified: the artwork's indent comes through as a single space,
which the wrapper then discards.

## The sparkles are vector, and 40KB lighter for it

The source carries 95 `<mask>` elements backed by 74 embedded base64 PNGs --
about 40KB decoded, 44 per cent of that file's weight -- and all they do is
soften the ends of the sparkle bars. None of it is here. A four-pointed star is
two crossed spikes with concave flanks, which is one path, and it is the same
path in both painters.

**Revised September 12, 2026.** The star's GEOMETRY here was invented, and the
positions being nearly right is what hid it: the clusters were drawn about
two-and-a-half times too large, square where the artwork's star is half again
taller than wide, and with two satellites where it draws three. Measured out of
the artwork now, along with the tribute poster's own four clusters. Everything
above about the masks and the 40KB is unchanged and was never the problem. See
`docs/error-fixes/EYEBALLED_SPARKLE_GEOMETRY.md`.

## Two colourways

`HBD_THEMES` holds colour and nothing else. The light one outlines empty photo
boxes instead of filling them, for the reason the anniversary poster and the
player's empty album already establish: a white box on white paper is not a box.

Two tokens change for legibility rather than for taste. The garland's purple and
blue are DEEPER on white, and the sparkle is gold rather than the artwork's pale
yellow, which on a white ground is not a sparkle but a smudge.

## Two defects found by rendering it

- **The painter threw part-way through and the poster silently lost everything
  below the month.** `annivTracked` does not exist: the day header helper is
  `annivHead()`, which centres each letter on its COLUMN rather than tracking
  the string -- a distinction the anniversary poster had already had to learn,
  because the artwork's 0.4em tracking spreads seven letters across half a grid
  that is wider than the one it came from. Nothing errored visibly; the page
  just ended.
- **Only one of twelve photographs landed.** `uploadTargets()` had a branch for
  the anniversary collage and everything else fell through to the six grid
  cards. It covers both collages now, in one branch rather than a third
  near-copy -- which is how the second collage would otherwise have ended up
  filling in a different order from the first for no reason anybody chose.

## A third defect, and the suite found this one

The catalog card was cloned from the anniversary card and then rebuilt, and the
rebuild gave it the title "Birthday Calendar Poster" while `js/admin.js` carried
"Birthday Calendar, Photo Cascade". Section 1 caught it by name:

    birthday: title "Birthday Calendar, Photo Cascade" vs index.html "Birthday Calendar Poster"

Worth recording because it is the one defect in this template that was NOT found
by looking. Both titles are plausible, both render correctly, and nothing about
either page looks wrong -- the card says one thing and the registry says
another, and the only way to see it is to compare them. That check exists
because somebody previously found out the hard way.

## Section 13 now runs over both posters

The suite's calendar section was written for the anniversary poster and is
parameterised now: same six months chosen for their edges, same self-calibrating
row pitch, run against each layout in turn. The only per-layout figure is the
scan window, because one poster's calendar sits under its collage and the
other's sits above it.

**Extending it exposed a fault in the CHECK.** The birthday poster draws a red
keyline around all twelve photo boxes and three of them sit inside the scan
band, in the same `#E93625` as the marker. A whole-width search put the marker's
centroid in column 9 of a seven-column grid and found a marker in the two months
that are supposed to have none. The search is bounded by the rule's own measured
extent now -- the rule is what says where the calendar is, and red by itself is
not a marker.

Verified by breaking it: shifting the first weekday by two fails all four
markable months on the birthday layout, and the two impossible-date cases
correctly still pass.

## Not done

- **No landing page.** `anniversary-calendar-poster.html` is the pattern if one
  is wanted.
- **The quote and the closing line share one wrap width each.** Neither reflows
  around the photographs.
- **The garland and the sparkle positions are fixed.** They are decoration, and
  nothing reads them from the visitor.
- **No selection ring** when this was written. It has one now, shared with the
  other two collages -- see `docs/implementation/BIRTHDAY_TRIBUTE_POSTER.md`,
  "The selection ring became everyone's".

## A third colourway: Black (September 16, 2026)

This poster's dark ground is `#231F20`, which came from its artwork's master
SVG rather than from the designer's exported PNG -- the two disagree, and the
master won. A pure `#000000` option now sits beside it, because the two are
indistinguishable on a screen and are not the same thing on paper, and which
one is wanted depends on where the poster is going.

`#231F20` remains the default. The variant is derived by `trueBlack()` in
`site/js/poster.js` rather than written out, so a change to this colourway
cannot leave its twin behind. Full reasoning:
`docs/implementation/MUSIC_PLAYER_POSTER.md`, "The page ground".
