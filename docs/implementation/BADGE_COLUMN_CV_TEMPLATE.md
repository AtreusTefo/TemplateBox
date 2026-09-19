# The Badge Column CV, and a Gap Measured From the Wrong Place

Built September 19, 2026, from a supplied raster reference. Tenth resume
template, and the first with an icon badge beside every section heading.

## Summary

A clean two-column CV, dark ink and one blue, no photograph. A centred masthead
sets the name in large caps over a tracked professional title, with a short
blue rule beneath. Below it two columns run to the foot, divided by a hairline: CONTACT, SKILLS and EDUCATION on the left,
PROFESSIONAL SUMMARY and EXPERIENCE on the right. Every heading carries a
filled blue disc with a white glyph. A rule closes the sheet, and the column
divider runs down to meet it.

## The reference is a MOCKUP; crop to the sheet first

This reference is not a bare artwork: the CV is placed on a beige ground with a
drop shadow. Measuring the raster would fold the mockup's padding into every
number.

Finding the sheet took two attempts and the first was wrong in a way worth
recording. Scanning inwards from each edge for the first near-white pixel gave
different answers per scan line -- the right edge read anywhere between 684 and
708 -- because the shadow softens the edge. Taking the MIN and MAX of those
readings produced a crop 18px too wide and 11px too tall, which moved every
landmark below it. **The median across many scan lines is the sheet; the
extremes are the shadow.**

| | value |
| --- | --- |
| raster | 736 x 1104 |
| sheet | x 54..685, y 75..1022 |
| sheet size | **632 x 948**, aspect **0.6667** |

That is a clean 2:3, and the fourth reference in a row to be one. A4 is 0.7067,
so the scale is taken off the HEIGHT -- `k = 842/948 = 0.88819` on both axes,
which is uniform and costs only margins. Scaling by width would overrun.

**The masthead and the columns disagree about the centre.** The masthead
centres on 297.5 of the A4 page; the two-column block centres on 285.5, 12pt
left. Both are centred here, on the grounds that a designer centres both and
the 12pt is mockup perspective. Reproducing it would bake a photographic
artefact into a layout decision.

## Measurements

Sizes come from measured WIDTHS through jsPDF's Helvetica metrics.

**The headings are the rare case where width and cap height agree**: eight
labels give 12.35 to 12.71 by width, and a 8.88pt cap height implies 12.38
through Helvetica's 0.717 ratio. That agreement is the finding -- it proves
there is no letter-spacing on them.

Three long summary lines put the body at 10.64, 10.64 and 10.70.

**The capitals in the reference are PLACEHOLDERS, not content.** "SKILL ONE"
and "LOCATION" measure as letter-spaced, and they are not tracked here: a
visitor's real skills are not capitals, so tracking them would be fitting the
mockup rather than the design. The two masthead lines ARE tracked, because
those are the design.

| landmark | points |
| --- | --- |
| text block | 59 .. 536 |
| left column | 59 .. 193 (w 134) |
| divider | 218.83, running 141.9 .. 769.1 |
| right column | 250.9 .. 536 (w 285.1) |
| masthead baselines, as measured | 43.52, 116.35, 143.00 |
| masthead baselines, as shipped | 80, 106.7 (see below) |
| first heading, both columns, as measured | 220.27 |
| heading badge | 22.2pt diameter, at the column's left edge |
| heading rule | 22.2pt wide, 11.55 under the baseline |
| foot rule | full measure, met by the divider |

**The badges are all one size.** A first pass read 22.2 for two of them and 8pt
fragments for the others, and the prompt for this build asked whether that was
design or noise. It is noise: the white glyph splits the blue disc into two
runs, so a naive scan measures the pieces rather than the disc.

## The kicker line was removed

The reference opens with a small tracked "CV TEMPLATE" over a short rule, above
the name. It was removed at the owner's instruction, and the name is the first
block now.

`firstBaseline` moved from 43.52 to 80 rather than leaving the name where the
kicker had pushed it. The kicker's own top margin was about 36pt of white above
a 10pt line; inheriting that under a 42pt name would have left 116pt -- 41mm --
of empty sheet above it. 80 puts the name's cap top at roughly the 50pt the
rest of the masthead was drawn against.

Everything below follows the cursor, so the sheet gained the 36.5pt the kicker
occupied: **the deepest ink went from 785.4 to 749.1 and the foot margin from
36.6pt to 72.9**. That matters more than it sounds. This template had been
0.4pt from a second page, which is why its contact rows are set tighter than
the reference's; the removal is what gives a visitor room for a sixth skill or
a third job.

## The defect: a gap measured from the wrong place

Every `gapAfter` in the first draft was derived as (first body baseline) minus
(heading baseline). That is not what the engine does. A heading that draws a
rule under itself **leaves the cursor ON the rule**, not on its own baseline,
so `gapAfter` is applied from 11.55pt lower than where it was measured.

Every section was therefore 11.55pt too loose, and with five sections that put
the sheet onto a second page. Corrected against the reference:

| section | first line, before | after | reference |
| --- | --- | --- | --- |
| CONTACT | 267.4 | **255.8** | 255.80 |
| EDUCATION | -- | **660.5** | 662.59 |
| PROFESSIONAL SUMMARY | -- | **253.1** | 253.13 |
| EXPERIENCE | -- | **397.0** | 397.02 |

This is the same shape as the defect the Blue Banner CV shipped and had to
retune: **a distance measured to a baseline is not the distance the engine
applies, when the thing in between is drawn from that baseline.** Measure the
landmark you can see, then work out what the engine does with it -- do not
assume they are the same number.

## Engine additions

Every one is an optional key.

| addition | what it does |
| --- | --- |
| `badge` on a heading role | a filled disc with a glyph, left of the label, insetting the label and its rule |
| `divider` on an entries body | a rule BETWEEN entries, the gap split around it |
| `rule.extend` on a split | the column divider runs past the deeper column to meet a foot rule |
| glyphs | star, mortarboard, briefcase, globe, link |

**The badge is on the ROLE and the icon is on the BLOCK.** Disc colour, glyph
colour and radius are the same for every heading on a sheet; which glyph is the
only part that differs per section. A role with a badge and a block with no
icon draws nothing and insets nothing, so a section can opt out.

**The entry divider draws between entries, never after the last one.** It is
emitted at the top of each entry after the first, with the entry gap split
around it, rather than after each entry -- which would leave one trailing under
the final row.

**A brand mark was declined.** The reference labels its LinkedIn row with the
company's logo. Reproducing a trademark inside a template we publish is a legal
question rather than a drawing problem, and the field it labels is a URL like
any other, so the glyph here is a generic `link` -- two interlocking bars that
read as "a link" and belong to nobody.

## What did not fit, and why it is left that way

**A real email does not fit the left column on one line.** The column is 134pt
and the icon takes 27, leaving 107; `adaeze.nwosu@example.com` measures 141.9pt
at the body size and would need to drop to 8.4pt to fit. That is not a bug in
this build -- it is what a 134pt sidebar means, and the reference never had to
face it because its placeholder reads "EMAIL". The email wraps to two lines.
Widening the column would change the design's 1:2.1 proportion to 1:1.5, which
is a bigger loss than one wrapped line.

The LinkedIn and website values ARE within this build's gift, because they are
invented sample content, and they are written compactly (`in/adaezenwosu`,
`adaezenwosu.com`) so they set on one line each.

**The contact rows are tighter than the reference**, 28pt of pitch against
31.75. That is the price of the wrapped email: with the reference's pitch the
sheet runs 0.4pt past its boundary. It is one block tightened by 12 percent
rather than the whole rhythm tightened, which is the lesson from the previous
template.

**`bottom` is 815, not 800.** The foot rule is drawn after `rejoin` at the
deepest column plus 20, so with content ending at 785.4 the rule wants 805.4 --
and a boundary of 800 paginated the RULE onto a second page while every word
fitted on the first. A reservation boundary has to leave room for what is drawn
after the last line, not just for the last line.

## ATS position: design-led

No photograph, but two-column, so it fails one of the three conditions and
ships design-led like the other two-column templates.

Extraction is deterministic: the measured content stream is three runs -- the
masthead, the whole left column, then the whole right column -- with no
interleaving. A badge is a disc and a glyph, vector marks an extractor does not
see, so it costs nothing at parse time.

## Verification

- **All nine existing templates are byte-identical**, captured with ONE fixed
  state taken from the persisted editor state, before and after.

| template | ops/pages/hash |
| --- | --- |
| blue-banner | 84/1/6b1c5a2d |
| serif-timeline | 72/1/16ab42d8 |
| peach-portrait | 88/1/4b719c90 |
| boxed-biodata | 118/2/8bbe8850 |
| classic | 66/1/7a3bd424 |
| grey-rail | 97/1/3a177d3e |
| ruled-serif | 96/2/27860014 |
| photo-rail | 102/1/0c9766d1 |
| label-rail | 72/1/ee53c87d |

- **One page**, with and without a photograph, deepest ink 749.1 against an 815
  boundary, with a 72.9pt foot margin.
- **Every colour resolves to a hex, nothing is drawn off the page, and no text
  leaves its column**, across sample, photograph, empty and hostile-photo
  states.
- **The PDF's text is still text**: 23,191 bytes, 56 text-positioning
  operators.
- **The masthead landed on the reference's own baselines before the kicker was
  removed**: 43.5, 116.3 and 143.0 against 43.52, 116.35 and 143.00. It is
  re-anchored at 80 now, and the spacing WITHIN the masthead is unchanged.

## Files changed

| File | Change |
| --- | --- |
| `site/js/resume-engine.js` | heading `badge`, entries `divider`, split `rule.extend`, five glyphs |
| `site/js/resume-templates.js` | the `badge-column` descriptor |
| `site/resume.html` | `linkedin` and `website`, gated |
| `site/js/resume.js` | the new fields in `DEFAULT_STATE` and the sample |
| `site/index.html` | catalog card, count 56 to 57 |
| `site/js/admin.js` | `CATALOG_ITEMS` entry |
| `site/css/style.css` | `.mock-doc.badge` miniature |
