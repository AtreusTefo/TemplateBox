# A Phantom "Card 8", and Framing Controls Holding the Wrong Photograph

Date: September 11, 2026
Status: Fixed

## Issue Title

Two faults in `site/js/poster.js`, both introduced when the music player poster
added an eighth photo slot:

1. The search screen's card menu offered a **"Card 8"** the search screen does
   not draw. Selecting it and pressing **Remove photo** deleted the photograph
   in the MUSIC PLAYER's scan-code slot, from a different template's editor.
2. On the music player, the size slider always held the **album**. Clicking the
   scan code on the preview selected nothing, the slider's label went on saying
   "Photo Size", and dragging it resized the album instead. A poster carrying a
   scan code and no album offered no framing control at all.

## Root Cause

One cause, two symptoms. `SLOT_COUNT` is the LENGTH OF THE `photos` ARRAY --
eight since the player appended its scan code at index 7. Three decisions read
it, or a hardcoded `0`, as "which slots can the visitor reach on the layout in
front of them", and those stopped being the same number the moment a layout
owned a slot other layouts do not.

| Site | Read | Consequence |
| --- | --- | --- |
| `buildSelects()` | `for (i = 0; i < SLOT_COUNT; i += 1)` | an eighth option, named "Card 8" by `slotName()`'s fallback |
| the menu's `change` handler | `Math.min(SLOT_COUNT - 1, ...)` | the clamp accepted slot 7 on a layout with seven slots |
| `primarySlot()` | `layoutOf(state.frame) === "browser" ? state.card : 0` | every non-search layout's framing controls pinned to slot 0 |

`primarySlot()`'s answer was correct while every layout but the search screen had
exactly one photograph. The player has two.

A fourth line completed the second fault: the preview's selection was set from
`cardAt()`, which returns `-1` on every layout except the search screen -- so on
the player a click on a photograph could start a DRAG but could never move the
selection the controls read.

## Fix Applied

All changes in `site/js/poster.js`. One new function is the fix; the rest route
through it.

- **`slotsFor(layout)`** (line 2734, new) -- the slots a layout actually draws,
  in the order the menu lists them. `browser` gives cards 0-5 plus the profile
  circle, `player` gives `[0, CODE_SLOT]`, `split` gives `[0, 1]`, everything
  else `[0]`. Slot 0 is on every list, because it is "the photograph" every
  single-photo layout has always used and switching templates is meant to carry
  the picture across.
- **`slotName(i, layout)`** (line 2751) -- names the scan code, and answers
  "Album" for slot 0 on the player. A slider labelled "Card 1 Size" over a
  record sleeve names the wrong thing.
- **`primarySlot()`** (line 2771) -- the SELECTED slot wherever the layout owns
  it, and the layout's first slot when the selection was left behind by a
  different layout. `split` is the deliberate exception and still answers 0: its
  lower half has a slider of its own, and both pointing at slot 1 would be two
  controls fighting over one photograph.
- **`buildSelects()`** (line 4311) -- the menu is built from
  `slotsFor("browser")`, not from the array's length.
- **the menu's `change` handler** (line 2834) -- clamps into the layout's slots.
- **Remove photo** (line 2815) -- clears `primarySlot()`, so it cannot reach a
  slot this layout does not own.
- **the selection ring** (line 2023) -- reads `primarySlot()`, so the ringed
  card and the card the slider holds cannot disagree.
- **the size label** (line 2973) -- names its slot on any layout with more than
  one, not on the search screen alone.
- **the preview's selection** (line 2399) -- `slotAt()` rather than `cardAt()`.
  `slotAt()` delegates to `cardAt()` on the search screen, so that layout's
  behaviour is unchanged.
- **the two player uploads** -- select the slot they filled, so a poster with a
  scan code and no album has a control to frame the code with. The framing group
  hides when the selected slot is empty, and without this the selection would
  sit on an album nobody uploaded.

## Testing Steps

Each was run against the unfixed file first and reproduced the fault, then
against the fix. Probes drive headless Chrome over the DevTools Protocol.

**The menu.** Open the search screen. The card menu has SEVEN options, ending
"Profile circle". Before: eight, ending "Card 8".

**The leak.** Open the player, upload an album and a scan code, switch to the
search screen, select the last menu entry, press Remove photo, switch back.
The scan code is still there. Before: the scan-code panel sampled `#231F20`,
the page ground -- the photograph was gone.

**The scan code alone.** Open the player and upload ONLY a scan code. The
framing group is visible and reads "Scan code Size", and the slider resizes the
code (stripe edges across the code strip, 105 at 100% against 42 at 250%).
Before: the group was hidden and the code could not be reached at all.

**The wrong photograph.** Upload both, click the scan code on the preview. The
label reads "Scan code Size", and moving the slider changes the code (105 to 40
edges) and NOT the album (128 both before and after). Before: the label said
"Album Size" and the album moved (128 to 49) while the code sat still.

**Regressions.** On the search screen: "Card 4 Size" after selecting card 4
through the menu, zoom redraws, Remove photo empties card 4 and leaves card 1
filled, the profile circle is selectable and named. On the split layout: the
label stays the generic "Photo Size", the first slider moves the upper half and
not the lower, the second moves the lower and not the upper. On the card
layout: "Photo Size", zoom redraws.

Note that a FLAT test image proves nothing here -- a zoom of a solid colour
looks identical at every scale. The first run of the framing probe used flat
fills and reported "unchanged" for a control that worked. Use a striped source
and count colour transitions along a row.

## A third change, found by looking at the result

With the two faults fixed, every probe passed and the poster was rendered to be
looked at. It showed something no measurement had asked about: the scan code was
SELECTED in that image and nothing on the preview said so. The search screen has
always rung its selected card; the player had nothing to ring, because until
this change clicking it selected nothing at all. The fix had made the selection
reachable without making it visible, and on a phone the preview is a separate
tab from the form, so the panel's label is not an answer anyone can read while
looking at the poster.

`drawPlayerChrome()` draws the ring now, in the grid's colour, dash and weight.
Getting it to look right took three attempts and neither of the first two was
wrong by any number:

1. **On the box's edge**, as the grid draws it. The grid rings grey placeholder
   cards on white chrome; here the picture runs edge to edge, and a brown dash
   straddling the border of the saturated green code read as a damaged border
   rather than a selection.
2. **Just outside the box.** Good contrast on the page ground, and it covered
   none of the artwork -- but the album's top edge sits 1.76pt below the lowest
   of the three header dots and the stroke alone is 2.4pt wide, so the ring cut
   through the chevron and touched the dots. There is no room above the album
   for an outside ring, which only a magnified render makes obvious.
3. **Inset inside the box**, which collides with nothing, leaves the picture's
   edge crisp, and reads as the crop marquee it resembles.

Verified preview-only in both directions: the ring is present on the canvas and
absent from the exported PNG and the exported SVG, checked by sampling the
export for the ring's colour rather than by trusting that `paint()` does not
call `drawPlayerChrome()`.

## Troubleshooting

- **A menu option appears for a slot the layout does not draw.** Something is
  iterating `SLOT_COUNT` again. That constant is the array's length and the only
  legitimate uses of it are allocating and trimming that array
  (`defaultViews()`, `normalizeViews()`).
- **The slider and the highlighted card disagree.** Something is reading
  `state.card` directly rather than `primarySlot()`. `state.card` is the raw
  selection and may belong to a layout the visitor has since left; it is
  deliberately NOT clamped on a layout switch, so that selecting card 4,
  visiting another template and coming back returns to card 4.
- **A new layout's second photo cannot be framed.** Add it to `slotsFor()`. If
  it needs a second independent slider like the split layout's, give it one and
  pin `primarySlot()` for that layout, rather than letting one slider serve two.

## Related Files

- `site/js/poster.js` -- every change
- `docs/implementation/MUSIC_PLAYER_POSTER.md` -- claimed both player slots were
  "resizable through the existing framing controls", which was not true when
  written; corrected there
- `docs/implementation/SEARCH_SCREEN_PHOTO_GRID_POSTER.md` -- where the card
  menu, `state.card` and the slot array were introduced
