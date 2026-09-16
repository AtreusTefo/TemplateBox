# Sparkles Drawn Two-And-A-Half Times Too Large, Square, And One Short

Date: September 12, 2026
Status: Fixed

## Issue

The birthday calendar poster's five sparkle clusters shipped with invented
geometry. Each cluster was drawn at roughly two-and-a-half times the artwork's
size, as a SQUARE four-pointed star where the artwork's is half again taller
than it is wide, and with two satellites where the artwork draws three.

Found while building the birthday tribute poster, by measuring that artwork's
sparkles instead of reusing the birthday poster's -- which was the first time
anybody had read either artwork's star geometry out of the file.

## Root cause

The cluster POSITIONS were taken from the artwork and were very nearly right --
within a point or two of the measured centres. The sizes and the satellites were
not taken from anything. They were chosen by eye to look like the preview, and
then the correct-looking positions made the whole set look deliberate.

That is the specific trap worth recording. A wrong number next to a set of right
ones does not read as wrong. Nothing about the rendered poster said "these are
made up" because four of the five values in each entry came from the drawing and
the fifth did not.

The square unit box has a second cause on top of that. `HBD_SPARK_PATH` was
written as a shape in a unit box centred on the origin -- `M0,-1 ... 0,1` -- and
a unit box is square unless somebody checks. The data then carried a single `r`,
so there was nowhere for a proportion to live even if it had been measured.

## Evidence

Both artworks in this family draw the same star, 36 of them between the two
files, at nine different sizes. Every one measures the same proportion:

    width / height across 20 stars (birthday): 0.6185 to 0.6227
    width / height across 16 stars (tribute):  0.6177 to 0.6248

Against that, the shipped birthday values for cluster one were `r: 13` where the
star's half-width is 5.04, and `sats: [[10, -6, 5], [-9, 7, 4]]` where the
artwork draws three satellites at (6.25, -5.18), (-5.04, -4.49) and (-4.30,
5.90) with half-widths 1.88, 1.73 and 1.77.

Measuring this needed a path walker rather than a regex. Every shape in both
files uses relative commands, so taking the minimum and maximum of every number
in a `d` attribute gives a bounding box that is not the shape's -- the first
attempt returned boxes 600 points tall for stars 19 points tall, and also
matched `id="path5283-2"` as coordinates.

## Fix applied

`site/js/poster.js`:

- **`HBD_SPARK_PATH`** is 1 wide and 1.608 tall now, so the shape carries the
  artwork's proportion and `r` stays what it always claimed to be -- the half
  WIDTH -- with the height following from the path. The concave flank's control
  point keeps its 13 per cent of each half-axis, which is why its y reads 0.209.
- **`HBD_SPARKLES`** replaced with the five measured clusters, three satellites
  each.
- **`TRIB_SPARKLES`** added: the tribute artwork's own four clusters, measured
  the same way. The two posters share the PATH and the painter and share no
  data, which is the right split -- it is the same star scattered differently.

`hbdDrawSparkle()` and both SVG emitters needed no change: they already scaled
the unit path by `r`.

## Testing steps

1. Open the poster editor on the birthday calendar preset and on the birthday
   tribute preset.
2. The stars are elongated vertically, not square, and are small accents rather
   than large ornaments.
3. Each has three satellites: upper-right, upper-left, lower-left.
4. Compare against the source SVGs' star paths. For the birthday, cluster one
   sits at (476.9, 187.2) with a half-width of 5.04 in a 595.28 x 841.89 page.

To reproduce the measurement, walk the path commands rather than scanning the
numbers -- a minimum/maximum over the digits in a relative path is meaningless.

## Troubleshooting

If a star looks square again, check `HBD_SPARK_PATH` first rather than the data:
a unit box restored to `-1 ... 1` silently squashes every cluster in both
posters at once, and the positions will still look correct.

## Later: the shape was wrong too

Fixing the SIZE left the SHAPE invented. `HBD_SPARK_PATH` was two crossed
quadratics; the source builds each spike as a cubic whose first control sits on
the tip, which is what draws the needle taper, and a quadratic cannot bend that
way. The artwork's own path is used now. The proportion this document is about
was right all along, which is exactly why nothing looked wrong.

See `docs/implementation/CALENDAR_POSTER_VISUAL_FIDELITY.md`.

## Related files

- `site/js/poster.js` -- `HBD_SPARK_PATH`, `HBD_SPARKLES`, `TRIB_SPARKLES`,
  `hbdDrawSparkle()`, `birthdaySVG()`, `tributeSVG()`
- `docs/implementation/BIRTHDAY_CALENDAR_POSTER.md` -- "The sparkles are vector,
  and 40KB lighter for it" describes the same code before this correction
- `docs/implementation/BIRTHDAY_TRIBUTE_POSTER.md`
