# Mockup Editor: Workspace Rebuild

**Date:** August 25, 2026
**Files:** `site/mockup.html`, `site/js/mockup.js`, `site/js/mockup-templates.js`,
`site/css/style.css`, `tests/verify-layout.js`

## Summary

Six changes to the mockup editor, all from one session and all pointing the same
way: the page was a document with an editor on it, and it is a workspace now.

1. The White T-Shirt on Model template gained the Background panel.
2. "Add to My Mockups" and Download became one action row above the control
   column, outside the pane.
3. Download became a panel: JPG or PNG, at three sizes derived from the canvas.
4. The saved-mockups tray moved out of the flow into a tab beside Live Preview.
5. Both columns hold the viewport and scroll independently.
6. The Background panel got the Colour panel's treatment -- hue strip in place
   of the swatch row -- and its standing hint was removed.

Companion to `MOCKUP_CONTROL_PANEL_TRIM.md`, which made the first pass at the
same panel earlier the same day.

## 1. The model photograph is background-eligible

Reported as: the White T-Shirt on Model has a transparent background but the
editor offers no Background panel for it.

True, and the panel was withheld by design: a photographic template qualifies
only by declaring `background: true` in `js/mockup-templates.js`, and neither
shipped template did. The declaration rule stays -- what changed is that this
template now declares it, on measured evidence:

| Measurement | Value |
|---|---|
| Base image | `assets/mockups/tshirt-model-white-base.png` |
| Dimensions | 1024 x 1536 |
| Corner alpha (all four) | 0 |
| Fully transparent share of the image | 39.3% |

**This is the opposite case to `wood-a4` and that distinction is the whole
reason eligibility is declared rather than detected.** Both templates have
transparent pixels. On the model the clear region is the *surround* -- the
figure was cut out of a studio backdrop -- so a fill lands behind the scene,
which is what a seller wants. On the wood frame the clear region *is the print
window*, so the same fill would land behind the artwork. An alpha test cannot
tell those apart; a person looking at the file can.

Verified in the suite against pixels, which the wood frame could not be: corner
(2, 2) reads `0,0,0,0` before and `229,229,226,255` after choosing Light Grey.

## 2. and 3. The action row and the export panel

**Before:** "Add to My Mockups" was a sticky bar at the *foot* of the control
pane; Download was a button in the editor bar at the top of the page. The two
halves of "keep this render, or take it away" were at opposite ends of the
layout, and neither was where a visitor looks.

**Now:** one row above the control pane, outside the card -- an icon-only Add
button on the left, Download on the right.

- **Add is icon only, with its label on hover and focus.** The label is both
  the `data-tip` and the `aria-label`, deliberately the same string: a bookmark
  glyph with no accessible name is unusable with a screen reader, and if the
  two differ, voice control (which matches on what a person can read) breaks.
  The tooltip is left-anchored here by an override -- the shared `[data-tip]`
  rule grows the label inwards from a control's right edge, which for a button
  at the column's left edge means growing off-screen (measured: left edge at
  -12px at 320px wide).
- **The panel is poster.html's exporter**, same `.dl` / `.dl-toggle` /
  `.dl-panel` component, same dismissal rules (outside click, Escape returns
  focus). Only the two controls inside differ, because the choices do: a canvas
  mockup has a format and a pixel size, not a paper stock and a DPI.

### The sizes are derived, never hardcoded

The reference the request came with offered 1600x2000, 800x1000 and 400x500 --
a 4:5 ladder. **This editor cannot use a fixed ladder**, because its canvas is
a different shape per product:

| Product | Canvas | Full | Half | Quarter |
|---|---|---|---|---|
| Drawn t-shirt, hoodie, mug, box | 1000x1000 | 1000x1000 | 500x500 | 250x250 |
| White T-Shirt on Model | 1024x1536 | 1024x1536 | 512x768 | 256x384 |
| Leaning Wood Frame | 2000x2000 | 2000x2000 | 1000x1000 | 500x500 |

A 4:5 ladder would distort two of the three and upscale the third. Full, half
and quarter keep each product's proportions and can never invent detail the
canvas does not hold. Every row states its real pixel size, so the visitor
chooses a size rather than a word.

The list is rebuilt each time the panel opens, not once at startup: a
photographic template sizes its canvas from a base image that loads after the
script runs.

### JPG flattens onto white, and says so

JPEG has no alpha channel. Drawn straight, every transparent pixel comes out
**black** -- which on a product exported with no background is most of the
image. The export fills white first, and while JPG is selected on a mockup with
no background the panel says so, before the download rather than after it.

Filenames are unchanged: the Mockup Label names the file, `templatebox-mockup`
when empty, with the extension following the format. The size is deliberately
not in the name -- a visitor exporting a second size wants it beside the first
under the name they chose.

## 4. and 5. Two tabs, two independent columns

Reported as: the mockups should be in full display, and so should the controls,
without scrolling the live preview to see the rest of the render -- and there is
too much space above both.

Three separate causes, three fixes.

**The tray was in the flow under the canvas.** That made the preview pane taller
than any viewport, so neither the render nor the collection was ever fully
visible. It is a tab now, beside Live Preview, with a count badge that is the
only sign the other panel holds anything. Panels are hidden with the `hidden`
attribute rather than a class, which is what keeps the inactive one out of the
accessibility tree and the tab order. Adding a mockup switches to the tray: with
the panel hidden, a silent add looks like a button that did nothing.

**The tab is a set of mockups to switch between, not a strip of screenshots.**
Each tile is the thumbnail and nothing else -- no caption, no per-item buttons.
The label is the tile's accessible name and its hover tip; a remove control sits
in the corner, always present rather than revealed on hover, because a control
that appears only under a pointer cannot be reached by touch or keyboard. The
per-item Download went with the caption: clicking a tile loads that mockup, and
the export panel above then writes it at any size or format, which the old
button could not -- it only ever re-saved the thumbnail.

**Clicking a tile reopens the mockup, it does not display a picture.** A tray
entry holds the state that produced it -- colourway, custom hex, background, and
every layer's placement, plus a reference to each layer's bitmap -- so the live
preview stays genuinely live and the reopened mockup is fully editable. Bitmaps
are shared by reference (a layer never mutates its image); everything else is
copied on the way in and again on the way out, which is what stops editing a
reopened mockup rewriting the entry it came from. That failure would be silent:
share the object and the tab quietly becomes several copies of the current
render. The suite asserts it directly -- save red, save navy, reopen red, edit
it green, then switch to navy and back and check both still read what they were
saved with.

Editing a reopened mockup and pressing Add again saves a **new** entry rather
than updating the one it came from. Entries are versions, not documents; there
is no in-place update, and the label is what tells two versions apart.

**The `hidden` attribute had to be made to actually hide.** For a day the
live canvas rendered above the tiles the entire time the My Mockups tab was
open -- reported with a screenshot, not caught by the suite. `.mockup-stage`
carries `display: flex`, and an author `display` beats the UA stylesheet's
`[hidden] { display: none }`, so the panel was flagged hidden and shown anyway.
`.mockup-tray` has no author display and hid correctly, which made the defect
one-sided and invisible from the Live Preview tab. One rule fixes it, listing
both panels: the tray is included so that a future rule giving it a display
cannot reintroduce this silently.

The same trap is already on record for `admin.html`'s catalog preview
(`CATALOG_THUMBNAIL_ADMIN.md`, "two `[hidden]` overrides"). Choosing the
attribute over a class is right for the accessibility tree, but it only works
if the stylesheet lets it.

**Every check that should have caught it was asserting the wrong thing.** They
read `element.hidden` -- the property, true the instant the attribute is set,
whatever is on screen -- so they confirmed the line of JavaScript that had just
run rather than the result. They measure computed `display` and box height now.
This is the section's own rule turned on itself: an assertion that cannot fail
is not evidence, and `element.hidden` after `element.hidden = true` cannot fail.

**A tile is the render's own shape, not a square.** The first version forced
`aspect-ratio: 1 / 1` with `object-fit: contain`, which is right only for the
drawn products. On the model photograph, whose canvas is 1024x1536, the thumb
drew at 84x127 inside a 127x127 tile -- a third of the tile empty, and the
mockup reading as a shrunken preview of itself rather than a saved piece of
work. The tile takes the image's own dimensions now, and there is no
`object-fit` left because the box IS the image's aspect. `align-items: start`
on the grid keeps a tile from stretching to its row; that is defensive rather
than load-bearing, since a session shows one product and therefore one thumb
shape, but nothing in the grid enforces that.

The suite asserts this on the model photograph specifically. On a 1000x1000
drawn product a square tile and a correct one are indistinguishable, so the
check would pass for the wrong reason anywhere else, and it compares the tile's
rendered aspect against the thumbnail's own natural aspect rather than a
hardcoded 0.667.

**The loaded tile is marked twice over.** Visually it takes a border colour and
an inset ring -- two signals, because a border colour alone is easy to miss in a
grid of squares and invisible to anyone who cannot separate those two hues. In
the accessibility tree it carries `aria-current="true"`, and only it: without
that the grid announces "Open Red tee, Open Navy tee" with nothing to say which
one is already on the canvas, so the tab stops being a set you can tell your
position in. The suite asserts the attribute at two points in the sequence,
because set-once-never-cleared and cleared-but-never-set both look correct at a
single moment.

The tray stays session-scoped, as it always was: the bitmaps live in memory and
are never written to storage, so a reload empties the tab.

**The control column scrolled with the page** while the preview was already
sticky, so reaching the last control pushed the render off screen. The column
wrapper is sticky and capped at `calc(100vh - 7rem)`; the pane inside takes what
is left and scrolls. The wrapper holds the height rather than the pane so the
action row stays put while the controls move under it. `min-height: 0` on the
pane is load-bearing -- without it a flex item refuses to shrink below its
content and the column grows past its cap.

**The canvas is width-driven** (`width: 100%`), so a tall product overflowed the
capped pane. The cap bounds its *width* by the height available and the
product's own aspect ratio, which `js/mockup.js` publishes as `--mockup-aspect`
from the canvas's real dimensions: `width <= cap * aspect` means
`height <= cap`, by arithmetic rather than by luck.

> **Not `object-fit: contain` with a max-height**, which is the obvious one-line
> answer. It letterboxes inside the element's box, and the pointer maths maps
> client coordinates through `canvas.width / rect.width`. Letterboxing makes
> `rect` larger than the pixels it holds, so every drag, resize and rotate lands
> somewhere other than the pointer, and the overlay canvas drifts from the
> product canvas for the same reason.

**The space above.** `.editor-head` is empty on this page -- its `h1` is
`.sr-only` and the autosave indicator moved into the bar long ago -- yet it
contributed a 1.5rem bottom margin under main's 2.5rem top padding. The element
stays, because it holds the page's only `h1`; its margin is zeroed, the top
padding is halved, and both pane headings became `.sr-only`. Bottom padding is
zero in the two-column band, which is doing real work: header (85px) plus top
padding plus a column capped at `100vh - 7rem` comes to 3px under an 800px
viewport, so *any* bottom padding puts the workspace into page scroll to reveal
empty space.

Measured at 1440x800 with the model photograph loaded: 152px of chrome above the
canvas became 58px, the page does not scroll at all (`scrollHeight` 800 =
viewport), and the whole 373x560 render is visible.

## 6. Background gets the Colour panel's strip

The swatch row is replaced by the same inline hue strip the Colour panel got
earlier the same day, and the standing hint ("Transparent exports a PNG with no
background...") is gone with the panel's other prose.

**Transparent moved into the picker rather than being dropped.** It was the one
thing that row had which the preset grid did not -- it is not a colour, and no
hex expresses it -- so removing the row without moving it would have stranded
the editor's default state with no way back to it. It is now the *first* button
in the background picker's preset grid, drawn as the usual grey chequer, ahead
of the eyedropper. The `createColorPicker` factory grew one option,
`allowClear`, and only the background instance passes it; the product picker's
grid is unchanged.

With the row gone, `.color-row` had no users left and was deleted, along with
`.tray-hint` and the `@media (max-width: 48rem) .editor-bar .dl-label` rule that
existed only to hide the label of the bar button that no longer exists.

## What this cost

- **`mockup.html` no longer has a sticky export bar.** `.preview-actions` is
  still the pattern on resume, docs and poster, and the anchor's lift rule for
  it is unchanged there. On this page the actions are at the top, where a
  bottom-fixed ad cannot reach them.
- **Two clicks to export instead of one.** The panel is the price of offering a
  format and three sizes; the previous single button had neither.
- **The Add button has no visible label.** Its name is in the tooltip, the
  accessible name and the tab it fills ("My Mockups"), and the empty tray says
  where to find it -- but a first-time visitor meets a glyph. This was asked for
  explicitly, against a reference that does the same.

## Verification

`node tests/verify-layout.js`. The checks that drove removed controls were
rewritten rather than deleted:

- The bar composition checks no longer look for `#download-mockup-png`. They
  assert both halves of the move at seven widths -- no `.dl-toggle` in the
  editor bar, one in `.mockup-actions` -- because removing the first without
  the second would leave the page with no exporter at all. They also assert the
  icon-only Add button's accessible name, which is the only name it has.
- The background checks drove `#m-bg-row .swatch`, which no longer exists. They
  go through the picker now, and assert that Transparent is the first preset and
  returns the canvas to `0,0,0,0` with `null` in storage -- without that move,
  choosing a background would be a one-way door.
- The tray checks drive the whole switch: two saved mockups, a reopen that has
  to restore colour, layer size, name and the canvas view, an edit after
  reopening that must not follow the saved entry, and a removal that recounts.
- New: the model photograph's eligibility and its background reaching pixels;
  the export panel's sizes matching the canvas for both a drawn and a
  photographed product, JPG producing a real `data:image/jpeg` at the chosen
  size, and the flattening note appearing; the tray refusing an empty canvas,
  and the tab opening with a count when a mockup is added.
- Section 7's filename checks now open the panel and click the full-size row.

## Related

- `MOCKUP_CONTROL_PANEL_TRIM.md` -- the Colour panel's strip and the three hints
- `MOCKUP_BACKGROUND_COLOUR.md` -- why eligibility is declared, not detected
- `MOCKUP_EDITOR_NAVBAR.md` -- the bar this took the download button out of
- `PHOTO_MOCKUP_TEMPLATES_IMPLEMENTATION.md` -- the template registry
