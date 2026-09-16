# A Dead "Screen Mode" on Three Posters, From One Shared Field Block

Date: September 14, 2026
Status: Fixed

## Issue

Reported as: the Screen Mode does not work on the anniversary calendar, the
birthday calendar and the birthday tribute.

It was true, and the control being reached was not the poster's own. Each of
those three showed TWO Screen Mode selects. The first one down the panel
belonged to the SEARCH SCREEN poster and changed a colourway the poster on
screen does not use, so it did nothing visible. The poster's own was further
down.

Three other search-screen controls were showing on those layouts too: a
Profile Photo slot for a circle those layouts do not draw, a Selected Photo
menu, and a Search Text field with no search bar to type into.

## Root cause

One field block doing two jobs.

`#p-grid-fields` holds the search screen's controls AND the multi-file photo
input. The three collage posters fill from a batch, so they need that input --
and the only way to reach it was to show the whole block:

    if (gridFields) { gridFields.hidden = !grid && !anniv && !hbd && !trib; }

That line reads as "show the batch uploader for the collages". What it does is
show four unrelated controls with it.

The Selected Photo menu is the clearest evidence they were never meant to be
there: it is built from `slotsFor("browser")`, so on a fifteen-box collage it
lists the search screen's seven slots and none of the boxes in front of you.

## Why it took a report to find

Nothing was broken in the sense a test can see. Every control worked; one of
them was simply wired to a different poster. The suite checks that each layout
shows its own fields, not that it shows ONLY its own, and no rendering was
wrong on either poster involved.

It became worse, not better, on September 13, when the three collage posters'
colourway selects were relabelled from "Colour" to "Screen Mode" to match the
music player. Before that the visitor met a dead "Screen Mode" above a live
"Colour" and might reasonably have tried the second. Afterwards there were two
controls with the same name, and the first one did nothing.

## Fix applied

`site/poster.html` -- the batch input moved into its own block:

    <div id="p-batch-fields" hidden>   <!-- Photos, multi-file -->
    <div id="p-grid-fields" hidden>    <!-- the search screen's four -->

`site/js/poster.js` -- one gate each:

    if (gridFields) { gridFields.hidden = !grid; }
    if (batchFields) { batchFields.hidden = !grid && !anniv && !hbd && !trib; }

Nothing else changed. No painter, no state, no colourway.

## Testing steps

Open each layout and count the visible controls:

| Layout | Screen Mode shown | batch upload | search-screen extras |
| --- | --- | --- | --- |
| Search screen | `p-screen-theme` | yes | yes, its own |
| Music player | `p-player-theme` | no | no |
| Anniversary | `p-anniv-theme` | yes | no |
| Birthday | `p-hbd-theme` | yes | no |
| Tribute | `p-trib-theme` | yes | no |

Exactly one label reading "Screen Mode" is visible on every layout, and
switching it turns the page white on all five:

    browser      #070807 -> #ffffff
    player       #231f20 -> #ffffff
    anniversary  #050606 -> #ffffff
    birthday     #231f20 -> #ffffff
    tribute      #231f20 -> #ffffff

## Troubleshooting

If a control reappears where it does not belong, check which `*-fields` block
it sits in before changing any gate. The gates are correct; what went wrong
here was a control living in the wrong block, and widening a gate to reach one
control is what drags the rest along.

## Related files

- `site/poster.html` -- `#p-batch-fields`, `#p-grid-fields`
- `site/js/poster.js` -- `syncDocControls()`, the two `hidden` assignments
