# Mockup Editor: Control Panel Trim

**Date:** August 25, 2026
**Files:** `site/mockup.html`, `site/js/mockup.js`, `site/css/style.css`, `tests/verify-layout.js`

## Summary

Two changes to the mockup editor's control column, both about the same thing --
panel height spent on text and on a second route to something the panel already
offered.

1. Three standing hint paragraphs are deleted.
2. The Colour panel's colorway swatch row is replaced by an inline hue strip
   under the trigger, the same track the picker's popover already carries.

Measured with the verification suite's own layout snapshot, the control pane is
**233.5px shorter at 1920px** (1054.5px to 821px) and **351.9px shorter at
320px** (1249.7px to 897.8px), where the panel stacks above the preview and
every pixel is scroll a visitor pays for before reaching the canvas.

## 1. The three hints

| Removed from | Text |
|---|---|
| Design upload | "PNG, JPG, or WebP with a transparent background works best. Validated client-side before drawing." |
| Design Size | "Drag a design on the preview to move it. Corner handles resize it, and the round handle above rotates it." |
| Mockup Label | "Names the PNG you download and the entry added to My Mockups. Leave it empty for templatebox-mockup.png." |

Nothing behind them changed. The mime-type validation still runs and still
reports a rejected file through `#m-design-error`, the drag/resize/rotate
handles still work, and the label still names both the downloaded PNG and the
tray entry. Each paragraph described behaviour that the visitor meets by doing
it, on a panel whose scarce resource is vertical space.

The Background panel's hint ("Transparent exports a PNG with no background...")
was **not** removed. It is the only one of the four that describes something not
visible from the control: the state of the exported file, which the visitor
cannot see until after downloading it.

What the label field lost in prose is kept as a comment in `mockup.html` beside
the input, because the fact it records -- that this field, and only this field,
names the export -- is not obvious from the markup.

## 2. Colour: a hue strip instead of a swatch row

The panel had a `#m-color-row` radiogroup of the product's shipped colorways
sitting directly under a picker whose preset grid already carries a greyscale
run and a wide spread of hues. The row was a second route to colours the
dropdown already had, and it cost a full band of panel height (and a second
wrapped band at narrow widths).

It is now a hue strip in the same position:

```html
<div class="color-hue color-hue-inline" id="m-color-strip" aria-hidden="true">
    <span class="color-hue-thumb" id="m-color-strip-thumb"></span>
</div>
```

**It is not a lookalike of the popover's strip -- it is the same control.**
`createColorPicker` now holds a `hueTracks` list rather than a single track, and
binds one handler across it:

```js
const hueTracks = [
    { track: nodes.hue, thumb: nodes.hueThumb },
    { track: nodes.hueInline, thumb: nodes.hueInlineThumb }
].filter((entry) => !!entry.track);
```

One `hue` per picker instance, both thumbs painted by the same `sync()`, the
same "rotate the hue, keep the current saturation and value" rule (with the
existing fully-saturated fallback for a greyscale start). The background picker
passes no inline nodes, so its list has one entry and it behaves exactly as
before. There is no second copy of the maths anywhere.

`renderColorSwatches()` is now `syncColorField()` and does the one thing the row
could not be removed without: hiding `#m-color-field` outright for a
photographic template, which has no colorway concept.

### What this costs, stated plainly

- **The colorways lose their buttons, not their effect.** A product still opens
  on its default colorway, which is what gives the drawn garments their
  hand-picked outline colour; any colour chosen after that derives its outline
  by darkening, exactly as a picker-chosen colour always did. What is gone is
  one-click return to a named colorway -- its hex has to be reached through the
  picker like any other.
- **The swatch row was keyboard-operable and the strip is not.** The strip is
  pointer-only and `aria-hidden`, the same as the popover's own track and for
  the same stated reason: the trigger beside it is a real button that opens
  Hex/R/G/B fields and a grid of preset buttons, all focusable, all setting the
  identical value. No colour became keyboard-unreachable; the shortcut to a
  handful of them did.
- **The open popover covers the strip.** It is positioned directly below the
  trigger with `z-index: 5`. That is ordinary dropdown behaviour -- the same
  hue track is inside the popover, one drag away -- but it is why the
  verification suite has to close the popover before driving the strip.

### The Background panel keeps its row

> **Superseded the same day.** The Background panel got the same hue strip a few
> hours later, and its hint went with it -- see `MOCKUP_WORKSPACE_REBUILD.md`.
> The reasoning below is why the row could not simply be deleted, and it still
> holds: Transparent was not dropped, it moved into the picker's preset grid as
> the first button, which is what made removing the row safe.

`#m-bg-row` is untouched, and the shared `.color-row` rule stays for it. Its
first quick pick is **Transparent**, which is a real choosable state that no hex
in the popover can express: without the row there is no way back to it. That
asymmetry between the two panels is the reason, and it is recorded in the CSS
rule's own comment.

### Styling

`.color-hue-inline` is one rule on top of the existing `.color-hue`: taller
(1.125rem against 0.875rem, because this one is dragged with a thumb on a phone
rather than inside an open popover) and spaced off the trigger the way the
swatch row was. The strip is square-cornered rather than rounded -- the theme
has exactly one radius token and it exists for the homepage catalogue cards.

## Verification

`node tests/verify-layout.js`, full run: 1161 passed. The single failure is
section 4's working-tree-against-HEAD parity check, reporting the 28 measured
mockup dimensions this change deliberately shortens; it passes again once the
change is the baseline.

The colourway check in section 5 was rewritten, since it drove
`#m-color-row .swatch` directly:

- The popover path is unchanged and still asserted -- typing `#123456` into the
  hex field paints the garment fabric at (500, 300) exactly `18,52,86,255`.
- A new check presses the middle of the panel strip with **trusted input**
  (`Input.dispatchMouseEvent`, not a synthetic `PointerEvent`: `bindTrack` calls
  `setPointerCapture`, which throws on a pointerId with no live pointer behind
  it, and the handler would abort before reading the position). It asserts the
  garment pixel equals the trigger's own hex label, that the hue actually
  rotated (green and blue both above red, which `#123456` is not), and that
  **this** strip's thumb moved to the pressed position -- the thumb assertion is
  what catches a strip wired to the colour but not to `sync()`.

The check was confirmed to fail against a break made on purpose: removing
`hueInline: colorStrip, hueInlineThumb: colorStripThumb` from the product
picker's nodes.

## Related

- `MOCKUP_EDITOR_MULTI_LAYER_UI.md` -- the panel and picker this trims
- `MOCKUP_BACKGROUND_COLOUR.md` -- the one-picker-two-instances factory, now
  one-picker-two-instances-three-tracks
