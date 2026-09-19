# The Blue Banner CV, and a Two-Column Band That Starts Mid-Sheet

Built September 19, 2026, from a supplied raster reference. Ninth resume
template, and the first whose two columns are LOCAL rather than the page's.

## Summary

A blue and white CV in a sans face. A header sets a rectangular photograph
beside the name, a subtitle flanked by short rules, and three icon-led contact
rows. Every section is introduced by a solid blue tab that bleeds off the left
edge of the sheet, with a pale band running from the tab to the right edge.
CAREER OBJECTIVE and EDUCATION run full width; SKILLS and EXPERIENCE then sit
in a left column with PARENTS INFORMATION and LANGUAGES beside them; INTERESTS
and DECLARATION return to full width, and a signature rule closes the sheet.

## The reference is 2:3, and the scale comes off its HEIGHT

Measured: **736 x 1104**, aspect 0.6667 -- a clean 2:3, which is a screen
export ratio rather than a paper one. A4 is 0.7067. This is the same shape as
the Serif Timeline CV's reference and the answer is the same:

| | scale by width | scale by height |
| --- | --- | --- |
| factor | 0.80842 | **0.76268** |
| raster maps to | 595 x 892.5pt | 561.3 x 842pt |
| deepest ink | **19.8pt off the page** | on the page |
| cost | 50.5pt out of the vertical rhythm | wider side margins |

`k = 842/1104` on both axes, and the 736px block maps to 561.3pt centred on
595, so content sits between 16.83 and 578.17. **Furniture that BLEEDS goes to
the real page edges instead** -- the tabs and their wash start at x=0 and the
wash runs to 595, because a design that runs off the paper cannot stop at the
edge of a centred block.

## Measurements

Sizes are derived from measured WIDTHS through jsPDF's **Helvetica** metrics:
this design is a sans, not a serif.

**The tab labels are the one case where width and cap height agree.** Eight
labels give 10.49 to 11.88, mean 10.99; the cap height of 7.63pt implies 10.64
through Helvetica's 0.717 cap ratio. That agreement is itself the finding --
it says there is no letter-spacing, which the first measurement pass wrongly
suggested there was.

That first pass read 11.2 to 18.2 across the same eight labels, a spread too
wide to be type. The cause was the white-glyph detector counting each tab's
antialiased right edge as part of its label: on the tabs whose label nearly
fills them the "label" ran to within 2px of the tab's end. Requiring a glyph
pixel to have tab-blue to its RIGHT within 14px fixed it. **A measurement that
disagrees with itself across eight samples is an instrument fault, not a
design with eight different type sizes.**

Body text from six strings: 11.0 to 11.4, set at 11.3.

| landmark | raster px | points |
| --- | --- | --- |
| text block left | x 44 to 47 | 52.68 |
| text measure right | bounded by the objective's wrap | 515 |
| photograph | x 40..203, y 30..246 | 47.35..171.66, 22.88..187.62 |
| tab height | 24 to 26 px | 19 |
| tab right-edge slant | 9 to 10 px | 6.9 |
| local band divider | x 360 | 291.4 |
| band right column | x 361 | 292.16 |

Colours sampled rather than guessed: the tab blue is **#21619F and it is
FLAT** -- sampled down a tab it does not vary, and the variation across it is
the white lettering. Body ink is about #333333.

**The text measure is bounded, not pinned.** The objective's first line ends at
504.95 and its next word would take it past 525, so the measure lies between
those; 515 is used. The signature rule reaches 536 in the reference and stops
at the measure here, which shortens one decorative line by 21pt.

## The pale wash is a gradient, and it ships flat

Measured across a heading row, the wash runs (211, 224, 243) at the tab's edge
to white at the right edge. That is a real left-to-right gradient.

It is drawn as a **flat** #E8EFF9 band. The display list has no gradient op,
and preview and PDF are painted from the same list -- a fade one painter could
produce and the other could not is a divergence, not a nicety. jsPDF's basic
API offers no dependable gradient, so adding one would mean a new op, two
painter implementations and a proof that they agree, to reproduce a fade that
is nearly invisible in print. The flat band keeps the design's structure (a
pale field running past the tab to the page edge) and loses only the fade.

## The local two-column band: `split` and `rejoin`

The engine's two-column layout is a property of the PAGE -- a sidebar and a
main column, both top to bottom. This design needs two columns for one band in
the middle and full width above and below it.

`split` creates two columns, seeds both cursors from the column it was declared
in, and remembers where the band began. Sections then name `bandLeft` or
`bandRight` like any other column. `rejoin` takes the deeper of the two, draws
the divider if one was declared, and hands the flow back.

Three things make it work:

- **Any declared column may be targeted.** The block loop chose `sidebar` or
  `main` by name; it now looks the name up in `ctx.cols`, which is what lets a
  column created at layout time be addressed at all. An unknown name still
  falls back to main, exactly as an unmatched `column: "sidebar"` already did.
- **`split` marks its halves STARTED and `rejoin` clears the host.** The band
  opens under whatever came before it, so its first section needs a heading
  gap; the section below the band draws at the cursor with `rejoin`'s own
  `gapAfter` instead. Same contract `crossRule` settled on, and for the same
  reason -- otherwise the spacing depends on whether something happened to mark
  the column started.
- **The halves do not paginate**, like the sidebar, because a band split across
  pages reads as a rendering fault. An overrun is still reported, because
  `rejoin` sets the host cursor to the deeper of the two and the overflow check
  sees it.

The header is a band too: the photograph occupies the left half and the name,
subtitle and contact rows are set beside it, with no divider.

## The defect that placement fixed

A filled photo block **advances its column's cursor** -- deliberately, so a
picture at the top of a single-column sheet pushes the text below it. An empty
photo slot does not.

With the photograph declared in `main`, that made this sheet **one page with no
portrait and two pages with one**: the name began 95pt lower the moment a
visitor uploaded anything, and everything below it followed. The empty state
looked correct, which is what made it worth catching by measurement rather than
by eye.

Declaring the photograph inside the band's left half is the fix. The depth it
adds is `bandLeft`'s, and `rejoin` already takes the deeper of the two halves
-- which is the right answer for a photograph standing beside a header rather
than above it. Verified: one page and an identical first baseline both with and
without a portrait.

## Other engine additions

Every one is an optional key.

| addition | what it does |
| --- | --- |
| `box.bleedLeft` | the tab keeps its label-sized width but starts further left, running off the sheet |
| `box.padRight` | a pad after the label that differs from the one before it |
| `box.slant` | cuts the bottom-right corner back, making the tab a trapezoid |
| `box.wash` | a paler band of the same height behind the tab, bleeding to the page |
| `rule.dx` | a rule that starts across the measure rather than at its edge |
| `rule.float` | a rule drawn relative to the cursor that does not advance it |
| italic in the SVG painter | see below |

**The SVG painter could not draw italic.** jsPDF takes the style in the same
argument as the weight, so a role saying `"italic"` already slanted in the
PDF -- while `paintSvg` mapped only `bold` and drew it upright. A role using it
would have rendered differently in the preview and the export, with identical
text, which is the same shape as the `xml:space` bug this engine has already
had once. Both painters honour it now.

## ATS position: design-led

Photo-led, and two-column for part of its height, so it fails two of the three
conditions the unqualified claim needs. grey-rail, peach-portrait and
serif-timeline set the precedent.

It keeps deterministic extraction. The measured content stream is six runs, and
none of them interleaves a line from one column with a line from the other: the
header, then everything down to and including the band's LEFT half, then the
band's RIGHT half whole, then the sections below it. Each experience entry
reads as role then employer-and-dates; each parent as label then name.

## Verification

- **All eight existing templates are byte-identical.** Display lists captured
  with ONE fixed state, engine and registry reverted to HEAD with `git stash`,
  recaptured, compared on op count, page count and hash. The control is that
  neither new template appears in the reverted registry.

| template | ops | pages | hash |
| --- | --- | --- | --- |
| serif-timeline | 72 | 1 | 16ab42d8 |
| peach-portrait | 88 | 1 | 4b719c90 |
| boxed-biodata | 118 | 2 | 8bbe8850 |
| classic | 66 | 1 | 7a3bd424 |
| grey-rail | 97 | 1 | 3a177d3e |
| ruled-serif | 96 | 2 | 27860014 |
| photo-rail | 102 | 1 | 0c9766d1 |
| label-rail | 72 | 1 | ee53c87d |

  **The first attempt at this proof was invalid and said so loudly**: five
  templates appeared to change. The baseline had been harvested from the FORM,
  which misses `languages` -- an entry list rather than a `data-bind` control --
  so the two runs were laid out from different documents. Both runs must use
  one state, and the persisted state is the one to use.

- **One page**, with and without a photograph, deepest ink 806.7 against an 815
  boundary, and every tab clearing the line above it by the same 17.0pt.
- **No text is drawn outside its column**, including inside the band.
- **The photograph draws at exactly 0.8000**, the ratio `PHOTO_RATIO` fixes,
  against the reference's 0.7547 frame.
- **The PDF's text is still text**: 17,698 bytes, 59 text-positioning
  operators, 1 image.

## What the sample cost, and the retune that followed

The reference is a fresher's CV: its EXPERIENCE is the single line "Fresher (No
formal experience)". The editor's shared sample carries two real posts, which
inside the band is about 100pt more, and the sheet ran to two pages.

The first response was to tighten everything until it fitted -- heading gaps to
28/26, item gaps to 18, the employer and dates composed onto one line. It fitted
at 787.2 of 800. **It also made a mess of the rhythm, and measuring it is what
showed how bad:**

| | before the retune | after |
| --- | --- | --- |
| tab clearances | 1.5 to 22.1pt, no two alike | **17.0pt, every one** |
| INTERESTS tab | 1.5pt below the previous baseline | 17.0 |
| entry gap vs line height (experience) | 18 against 16 | 27 against 16 |
| entry gap vs line height (education) | 22 against 17 | 27 against 16 |

Two things were wrong rather than merely tight. **The INTERESTS tab overlapped
the line above it**: that section follows the band, so its position came from
`rejoin`'s `gapAfter` of 14.5, and the tab is drawn 13 ABOVE its own baseline
-- leaving 1.5pt, which descenders close. A gap that is measured to a baseline
and a box that is drawn from one are not the same measurement, and only one of
them was being checked. **And an entry list separated by 18 with a line height
of 16 does not separate at all** -- four experience lines read as one block,
which is the defect that makes a CV look like a paragraph.

The fix was one `gapBefore` for every tab, so every clearance is identical,
and an entry gap well clear of the line height. It is paid for with a tighter
item gap (17), a shorter run-up to the signature (32) and a `bottom` of 815.
Deepest
ink is 806.7, a 35pt foot margin against the reference's 53.

This template is at its one-page limit with the shared sample. Anything added to
a field it reads will push it over -- and the main column paginates, so that
degrades into a second page rather than losing content.

## Files changed

| File | Change |
| --- | --- |
| `site/js/resume-engine.js` | `split`/`rejoin`, column lookup by name, `box` bleed/slant/wash/padRight, `rule` dx/float, italic in the SVG painter |
| `site/js/resume-templates.js` | the `blue-banner` descriptor |
| `site/resume.html` | `motherName`, `interests`; blue-banner added to the address, city, father and declaration gates |
| `site/js/resume.js` | the new fields in `DEFAULT_STATE` and the sample |
| `site/index.html` | catalog card, count 55 to 56 |
| `site/js/admin.js` | `CATALOG_ITEMS` entry |
| `site/css/style.css` | `.mock-doc.banner` miniature |
