# Mockup Editor Audit: three faults found and fixed

Date: August 31, 2026
Status: Fixed and verified

An audit of all six photographic mockup templates, the four drawn products and
the mockup editor. The registry itself was clean -- an invariant check across
every template found no missing files, no orphaned assets, and no contradictions
(a `garment` map without `garmentColors`, a `grain` map without a heather
colourway, `light` without `displace`, `warpZone` not equal to `warpZones[0]`).

The faults were all at the UI and state layers, where a data check cannot see
them.

---

## Issue 1: every named colourway was unreachable from the editor

**Severity:** dead feature, plus 2.3MB of assets that nothing could sample.

### Root cause

The colourway swatch row was removed on August 25, 2026 in the control-panel
trim. The colourways themselves were kept in the registry, on the reasoning that
a product still OPENS on its default one. Nothing replaced the row, so every
route into the colour control went through `setCustomColor`, which sets
`currentColor = CUSTOM_COLOR`. `activeColor` then returns a synthesised
`{ name: "Custom", hex, outline }` object.

That object has no `heather` fraction and no `original` flag, so:

- **`original` was one-way.** "As photographed" skips the tint entirely. Typing
  `#E9E9EC` is not the same thing -- it dyes the garment its own photographed
  shade, which is a different render. Once a visitor picked any colour there was
  no way back to the photograph.
- **`heather` was dead code.** `renderGarmentTint` reads `colorInfo.heather` and
  screens the `grain` map back over the dye. A custom colour never carries one,
  so the branch could not execute. The shirt's and the cap's `grain` maps --
  910KB and 1.4MB, **2.3MB shipped** -- were downloaded by `ensurePhotoAssets`
  on every visit and never sampled.
- The eight colourway *names* the shirt declares appeared nowhere in the UI.

Measured in the browser before the fix: of `["As photographed", "Black",
"Navy", "Red", "Forest Green", "Sand", "Heather Grey", "Heather Navy"]`, the
number found anywhere in the rendered page was **zero**. The picker offered 28
fixed hexes with no relationship to the product.

### Fix applied

The colourways are rendered as named chips at the head of the picker's existing
preset grid, ahead of the generic hexes. `site/js/mockup.js` gains
`colorwayList()` and `setColorway(key)`; `createColorPicker` gains
`options.colorways`, `options.setColorway` and `options.activeColorway`.

This follows the precedent already in that function rather than inventing one.
When the swatch row was removed, the background's **Transparent** state was
moved into the same grid, with the comment that "no hex can express it, so
dropping the row without moving it would have stranded the default state with
no way back". `original` and `heather` are exactly that kind of state. A plain
hex colourway like Navy did not strictly need a chip -- it is reachable by
typing -- but it is included so the product's real options carry their names.

Details worth keeping:

- A heather chip is painted with `mixToward(hex, NATURAL_FIBRE, heather)`, the
  colour the render actually produces. Painting the full-strength dye would
  promise a colour that never appears.
- Chips are rebuilt only by `buildPresets()`; `sync()` re-marks the active one.
  `sync()` runs on every pointermove of the hue track, and tearing down 36
  buttons per move would be gratuitous.
- Selecting a custom hex marks no chip as pressed, which is correct: a custom
  colour is not one of them.
- The product cannot change without a page load (the Mockups dropdown routes
  through the interstitial), so building once at init is sufficient.

### Verification

Live canvas, sampled on fabric OUTSIDE the print zone -- the first attempt
sampled inside it and read the `#F4F3EF` upload placeholder in every state,
which looked like the recolour was broken:

| Colourway | Shoulder | Sleeve | Below hem |
| --- | --- | --- | --- |
| As photographed | 218,218,227 | 229,229,237 | 211,212,219 |
| Black | 22,22,22 | 24,24,24 | 22,22,22 |
| Heather Grey | 171,170,166 | 179,178,173 | 163,163,159 |
| Heather Navy | 73,79,96 | 75,83,101 | 68,75,92 |
| Navy (solid) | 27,36,58 | 29,39,63 | 27,36,58 |
| As photographed again | 218,218,227 | 229,229,237 | 211,212,219 |

Heather Navy (73,79,96) against solid Navy (27,36,58) is the fibre mix
rendering for the first time, which is what the 2.3MB of grain maps are for.
"As photographed" restores **exactly**, byte for byte.

The four drawn products benefit too: the vector t-shirt now exposes White,
Black, Heather Gray and Navy by name.

---

## Issue 2: the saved-mockups tray dropped a layer's surface

**Severity:** data loss on a shipped feature. Introduced August 30, 2026 with
multi-zone support.

### Root cause

`copyLayers` omits `zone`. The "My Mockups" tray round-trips state through that
function in both directions (`snapshotState` on save, `openTrayItem` on
reopen), so a restored layer had no `zone`, and `layerZone()` reads a missing
value as surface 0.

`addLayer`, `persist()` and the localStorage restore path all carried `zone`
correctly. This was the one copy that did not, which is why it survived the
original multi-zone verification -- that testing exercised upload, switching
surfaces and persistence, but not the tray.

### Fix applied

`zone: layerZone(layer)` added to `copyLayers` in `site/js/mockup.js`.

### Verification

Two-card mockup, a design on each surface, saved to the tray and reopened.

Before the fix:

```
before reopen  front.png:zone0  back.png:zone1   cardA 192,57,43   cardB 18,126,125
after  reopen  front.png:zone0  back.png:zone0   cardA 14,124,123  cardB 241,241,243
```

The back design moved onto the front card and painted over it; the back card
went blank.

After the fix, zones and rendered pixels are both identical across the
round-trip.

---

## Issue 3: the layer cap left a dead-end on a multi-surface template

**Severity:** minor. Introduced with multi-zone support.

`MAX_LAYERS` is 12 across the whole mockup, but the layer list is scoped to the
surface being edited. With 12 designs on the front card, the back card showed an
empty list, a disabled "+", and an **enabled** full-width upload button that
dead-ended in an error on file selection.

The cap is correctly global -- it bounds render cost, and every surface is drawn
in one shader pass, so the total is what matters. The fix is to make the state
legible rather than to scope the cap: both controls are disabled together, and
the error message says the count is across both surfaces when there is more
than one.

---

## Also fixed: the suite reported a slow server as a dead one

`waitForServer` in `tests/verify-layout.js` allowed 20 seconds. On a loaded
machine `npx serve` prints nothing while it resolves and can take far longer to
bind -- measured on August 31, 2026: not listening at 8 seconds, serving 200s by
50, with an empty log throughout. The suite gave up and threw "could not start
`npx serve`", which reads like a broken server and is not one. It cost two false
failures in one session.

Raised to 60 seconds, and the error now states how long it waited so a slow
start is distinguishable from a dead one. This is a budget that was too tight
rather than a symptom being masked: the server does bind and does serve, and a
genuinely dead server still fails, forty seconds later.

Contributing factor worth recording: the stall was made much likelier by driving
the browser automation heavily while a backgrounded suite run was in progress.
`CLAUDE.md` already warns that a polling loop can cause the navigation timeout
it is waiting to observe; the same applies to any concurrent browser work.

---

## Testing steps

1. `node tests/verify-layout.js` -- 1244 passed, 1 failed. The single failure is
   section 4 (`ads blocked: layout identical to the last commit`) reporting the
   `index` feed taller at 320px, which is the uncommitted roll-up banner catalog
   card. It resolves on commit.
2. Open the shirt, cycle the colourway chips, sample fabric outside the print
   zone at the coordinates in the table above.
3. Open the business card template, put a different design on each surface, save
   to the tray, reopen, and confirm both zones and both rendered cards survive.

## Related files

- `site/js/mockup.js` -- `colorwayList`, `setColorway`, `createColorPicker`,
  `copyLayers`, `renderLayerList`, the upload handler.
- `site/css/style.css` -- `.color-colorway[aria-pressed="true"]`.
- `tests/verify-layout.js` -- `SERVER_WAIT_MS`, `waitForServer`.
- `docs/implementation/MOCKUP_CONTROL_PANEL_TRIM.md` -- the August 25 removal
  that stranded the colourways.
- `docs/implementation/TWO_ZONE_BUSINESS_CARD_MOCKUP.md` -- multi-zone support,
  where issues 2 and 3 came from.
