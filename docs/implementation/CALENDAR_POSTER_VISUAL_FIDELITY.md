# Matching the Two Birthday Posters to Their Artwork

Date: September 13, 2026
Status: Implemented

## Summary

The birthday calendar poster and the birthday tribute poster were built to the
right GEOMETRY and the wrong SURFACE. Every box, baseline, column and rule was
measured off the source SVGs and is correct. What was not measured was how the
artwork is drawn: the typefaces it sets, the shape of its sparkles, and the fact
that its hearts are modelled objects rather than flat silhouettes.

This pass read those out of the sources and reproduced them.

| File | Change |
| --- | --- |
| `js/poster.js` | `calFont`/`CAL_FACE`, `SCRIPT_FACE`/`SCRIPT_SIZE_ADJUST`, the real sparkle path with a lit core, `TRIB_HEART` and its two painters, measured heart sizes |
| `poster.html` | loads Petit Formal Script |

Everything here was found by measuring the source and comparing rendered
pixels, never by eye alone. Where the two disagreed the measurement won -- and
in one case (the "glow") the measurement overturned a change already made.

## The type: two faces, and we had neither

All three artworks in this family -- the anniversary, the birthday calendar and
the birthday tribute -- specify exactly two faces in their own stylesheets, and
they agree with each other:

    MonotypeCorsiva     the month name, the message, the line along the foot
    TimesNewRomanPSMT   the day letters and every date

We drew the whole poster in Playfair Display: italic 700 for the display text,
upright 600 for the dates. **Upright was right and Playfair was not**, in both
roles.

**The calendar is Times now.** Playfair at 600 is a Didone -- heavy stems,
abrupt hairlines -- so thirty-one dates came out as a wall of black where the
artwork has a light, even texture. Times needs no webfont, so this costs
nothing to load, and `calFont()` is shared by all three calendar posters
because all three sources say the same thing.

**The display text is a script now.** Monotype Corsiva cannot ship: it is
Monotype's and carries an explicit licence-agreement clause, the same reason
neither supplied font was ever bundled. Playfair Display italic had been
standing in for it on the grounds that it was already loaded and was the
closest thing on hand. It is not close. Corsiva is a chancery -- rounded bowls,
shallow slope, semi-connected, one weight -- and Playfair is a Didone with a
much wider italic. On a poster whose words are most of the design, that was the
single largest thing separating ours from the reference.

**Petit Formal Script** replaces it, picked by rendering five candidates
against Corsiva at the sizes these posters actually use -- the month name, the
foot line, and a paragraph of the message. EB Garamond and both Cormorants are
book italics and read as such; Petit Formal Script is the same kind of
lettering. It is one more family on a font request that already carries two.

### The substitute needed a size adjustment, and this is why

Petit Formal Script draws BIGGER than Corsiva at the same nominal size: 79
units of cap height per 100 of em against Corsiva's 65, measured. The artworks'
sizes are all written in Corsiva's em, so used directly they set the whole
poster a fifth too large -- and the tribute's message, which is capped at five
lines, lost its last line off the end.

`SCRIPT_SIZE_ADJUST` is `65 / 79` and every size passes through it.

**Cap height and not width, deliberately.** Matching widths instead would need
0.66 and would leave the lettering visibly too small. Cap height is what the
eye reads as "the same size". The substitute is still about a fifth wider set
at matched cap height, and the wrap and shrink-to-fit rules absorb that. This
is the same idea as CSS `size-adjust`, and it exists for the same reason: a
fallback face never has the metrics of the one it stands in for.

## The sparkles were the right proportion and the wrong shape

The star is one shape drawn at nine sizes across the two artworks. Its
proportion was already correct here. Its SHAPE was invented: two crossed
quadratics with their control points at 13 per cent of each half-axis.

The source builds each spike as a CUBIC whose first control sits on the tip
itself and whose second sits barely off the centre line. That is what draws out
the long needle taper, and a quadratic cannot bend that way -- ours came out
blunt and heavy at about a third of the apparent spike length. The artwork's
own path is used now, mapped out of its own view box.

Two further details, both from the source rather than from looking:

- The arms do not cross at the middle of the box. The left and right tips sit
  three and a half points below the box's own centre, so `cross` is carried in
  the data instead of assumed to be one half.
- The star is not a flat fill. Measured off the reference it reads `#FEF7AE` at
  the core and `#FFFDE6` along the spikes, which is the 74 embedded PNG masks
  -- 40KB, 44 per cent of one file's weight -- doing their only job. A radial
  gradient reproduces it, costs nothing and travels through both painters.

### A glow was added here and then removed, which is the part worth keeping

"The masks add a glow" is the obvious reading, and a soft halo was duly added
behind every star. Then it was measured: **four points to the side of a spike
the reference is pure page**, `#231F20`, where ours had lifted it to `#2D2925`.
The masks brighten the spikes and spill nothing around them. What looks like
haze in the artwork is the needle taper plus its own antialiasing.

The halo came out again. Measure before adding light.

## The tribute's hearts are modelled, not flat

The four hanging hearts and the one at the foot had been drawn with
`ANNIV_HEART` -- one path, one fill -- borrowed from the anniversary poster on
the reasonable-sounding grounds that a heart is a heart.

On this artwork a heart is seven layers: a base red, a dark rim down the right,
a lighter wash across the belly with a wavy top edge, a bright crescent on the
upper-left lobe, and three more. At 67 points across, flat red reads as a
sticker where the source reads as an object with a light on it. The silhouette
was never the problem.

All seven paths are kept exactly as drawn, and each gradient is resolved out of
the source's own `gradientTransform` into the heart's box -- the only part that
needed arithmetic.

**And they were two-thirds the right size.** The four had been 44, 36, 40 and
38 points wide; measured off the reference they are 67.33, 42.00, 59.33 and
49.00. The foot heart was 40 and is 51.67.

The day marker and the heading heart stay flat `ANNIV_HEART`, because the
artwork draws those flat too. Gloss at eighteen points is noise.

### Three things that were missed on the first extraction pass

Worth recording, because the first pass looked complete and rendered plausibly:

- **A seventh layer.** The extractor selected paths by bounding box and one
  layer's box fell outside the window. Taking the run of paths that follows the
  base fill -- document structure rather than geometry -- gets all of them.
- **`opacity: 0.4` on the belly wash.** Without it that layer came out twice as
  bright as the reference, which measured as `#F69393` against `#F26766` at the
  same point. This was the one visible error of the three.
- **`fill-rule: evenodd` on every overlay.** These are hollow slivers and the
  default nonzero rule fills their middles.

After all three: eleven of twelve sampled points on the heart agree with the
reference within 2/255. The twelfth is the cleft, where the string shows
through in the reference and the heart's edge shows in ours -- a sub-point
boundary difference, with the strings drawn before the hearts in both.

## What was NOT changed

- **The marked day still shows its number.** The artwork draws an opaque heart
  OVER the date, so the one day the poster exists to point at is the only one
  that cannot be read. All three calendar posters here draw the number ON the
  heart in a contrasting colour. That is a deliberate, documented departure and
  it did not seem right to undo it for fidelity's sake; it is also the kind of
  thing a visitor would report as a bug.
- **The catalog tiles.** Their month name is a 7px miniature in the shared
  serif. Loading a script face on the homepage for two tiles that size is not a
  trade worth making.
- **The anniversary poster's display text.** Its source specifies Corsiva too,
  so the same substitution would suit it, but it was out of scope here and has
  its own layout to re-verify. Its CALENDAR did change, with the other two,
  because that is one shared helper and one shared finding.

## Verification

- Both painters compared: all 24 shape sample points identical, and all four
  text anchors at one uniform scale to five figures.
- Heart, sparkle and box colours sampled against the rendered reference.
- Both colourways rendered, filled and empty.
- `node tests/verify-layout.js`.
