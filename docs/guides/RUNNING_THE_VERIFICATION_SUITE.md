# Running the Verification Suite

Date added: August 10, 2026
Script: `tests/verify-layout.js` (outside `site/`, never deployed)

## Commands

```
node tests/verify-layout.js               Everything. ~2 minutes.
node tests/verify-layout.js --quick       Static checks only. Under a second.
node tests/verify-layout.js --no-baseline Everything except the HEAD comparison.
```

Run it from the repository root. Exit code is 0 when everything passes and 1 when
anything fails, so it can gate a deploy script later without modification.

**Run the full suite before deploying.** Nothing runs it automatically — there is no CI on
this project, and pretending otherwise is how the previous set of claimed-but-absent tests
came about (see "History" below).

## What It Needs

Nothing installed. It has no npm dependencies and no config file:

- **Node 18 or newer.** It uses the built-in `fetch` and `WebSocket`, so nothing is imported.
- **A Chromium-family browser already on the machine.** It looks for the Playwright browser
  cache first, then Chrome, then Edge, then the usual Linux and macOS paths. If it finds
  none it says so and runs the static checks only, rather than failing.
- **`npx serve`**, which it starts itself on port 5099 and shuts down at the end. This is the
  same server CLAUDE.md prescribes for local testing, launched from the repository root so
  `serve.json` applies and local URLs match production.

No network access to the ad hosts is required. The Adsterra creatives will not load on a test
machine and that is fine: the mounting code builds each slot synchronously, so the layout
under test is the layout a real visitor gets.

## What It Checks

### 1. Static (no browser, under a second)

| Check | The failure it catches |
|---|---|
| Every page with `data-ad-*` hosts loads `js/ads.js` | `index.html` ran ad slots with no ad script for three days. Zero impressions, nothing visibly wrong |
| Every zone named by a `mountPlacement` call exists in `AD_ZONES` with a non-empty key | A placement pointing at a missing or blank zone renders nothing, forever, silently |
| `EDITOR_RAIL_STACK` and `HOME_RAIL_STACK` use a distinct key per slot | Three slots sharing one key is one placement counted three times, not three placements |
| Every selector hook `js/app.js`, `js/ads.js` and `js/search.js` look up exists in the served markup | Renaming a `data-` attribute or class on one side kills a feature with no error at all |
| The homepage rail's `display: none` gate is declared after the shared rule | Media queries carry no specificity; written above the shared rule the gate loses and the rail shows on viewports it must skip |
| `loading.html`'s inline route whitelist matches `EDITOR_ROUTES` | The two copies drifting sends the fallback path to the wrong editor |
| `CATALOG_ITEMS` in `js/admin.js` lists exactly the cards `index.html` ships, with matching title, category and `data-doc` | The homepage feed has no data file, so admin.html's thumbnail picker holds a hardcoded copy of it. A card added to `index.html` alone is not offered as an existing item, and attaching a thumbnail to it then generates a whole new `<article>` instead of the `.card-preview` block the card needs. Both halves keep working perfectly on their own, which is why nothing fails without this |
| Every `CATEGORIES` record in `js/admin.js` matches the cards it describes | That record supplies the label, editor page and `data-target` written into a generated card. If it disagrees with the category's existing cards, every new card in that category is wrong the same way |
| Every local `<img src>` in every page exists on disk | A card rendered a broken-image icon after a publish deleted its old thumbnails and then failed to rewrite `index.html`. 988 checks passed while the homepage was visibly broken, because none of them asked whether a referenced file is actually there. Also catches a thumbnail downloaded but never placed, and a path typed by hand |
| `index.html`'s catalog-empty message states the real card count | It said "all 17" against eighteen cards; adding a card does not force anyone to touch that sentence |

### 2. Layout (10 pages x 14 widths)

Widths are 1920, 1600, 1488, 1440, 1366, 1344, 1336, 1335, 1280, 1200, 1199, 1024, 768 and
320 — including 1344 and 1488, which are the 93rem stack gate and (with 1199/1200) the 75rem
rail floor shared by the homepage and, since August 13, 2026, the editors. `search.html`
joined the page list on August 24, 2026.

- **Exactly one ad band mounts**, never two and never none. The one documented exception is
  the homepage between 48rem and 75rem, which shows nothing by design.
- No horizontal page scroll.
- Every menu-bar control is on screen and hit-tests to itself, not to something covering it.
- The rail is `fixed`, starts at y=0, runs the full viewport height, and sits flush to the
  right edge.
- `body`'s reserved `padding-right` equals the column's width exactly — and is zero, with no
  `.has-ad-rail` class, whenever no rail is up.
- The header, the category tabs and the editors' export bar all stop at or before the
  column's left edge. **If one of these fails, someone has given the header a rule of its own
  instead of letting it inherit the body padding.**
- The rail's creative stays narrower than one column of the feed beside it, which is what
  keeps it reading as a rail rather than a fourth column of adverts.
- The mega-menu opens on screen, clear of the column, and is clickable.
- After a real scroll, the column is still full height and the header still inset.
- Under print media there is no column and no reserved width.

### 2f. Catalog thumbnails fill their card

Every photo thumbnail's PAINTED image is measured against the card it sits in, and its
declared `width`/`height` against the file.

The first version of this measured `img.getBoundingClientRect()` and was worthless: the
element is `width: 100%; height: 100%`, so its box always equals the card whatever the image
inside it is doing — it reported a letterboxed 707x1000 poster as filling its card. The
painted box has to be derived from `object-fit: contain`. See
`docs/implementation/CATALOG_THUMBNAIL_CARD_FIT.md`.

### 3. Launch flow

A plain click routes the foreground tab to `loading.html?target=...`; ctrl-click and
middle-click each open that same interstitial in a new tab with the opener unmoved.

**3b** follows the header search control with a real click and requires a focused, usable
field at the other end — stated as an outcome because asserting "it is a link to search.html"
would pass a search page that renders nothing. **3c** and **3d** do the same for the cards on
`search.html` and the mockup editor's Mockups dropdown: both are built or bound after
`initCatalog` has run its one pass, so both can silently bypass the interstitial the site is
funded by.

**These must use `Input.dispatchMouseEvent`, not a synthetic `MouseEvent`.** A synthetic event
is not a user activation, so the `window.open` in `bindLaunchControls` is popup-blocked and
the modified-click checks fail against perfectly working code. This produced two false
failures during development before the cause was found. The same trap applies to anything
gated on user activation — clipboard writes, fullscreen, file pickers, autoplay with sound.

### 5 and 5b. Mockup editor

**5** asserts the background colour against canvas PIXELS rather than against the controls,
because every route to a wrong export is silent — a background painted in CSS would look
right on screen and be absent from the PNG. **5b** asserts the editor bar's two states at ten
widths, including that it stays one row: it is a sticky header on a workspace, and a second
row costs 56px of a phone viewport permanently.

### 6. Admin thumbnail intake

Drives `admin.html`'s real intake with generated uploads — square, wide, and a small
in-budget WebP — and requires 4:5 out of each. The small case is the original defect: an
upload already under the byte budget was kept byte for byte, and shape was not part of that
test.

### 7. The typed name names the file

Each editor is exercised twice: untouched, to prove the fallback filename still
holds, and after typing a name. Asserted against the filename the browser is
GIVEN — a field feeding a variable nobody reads is the defect this exists for,
and it looks correct at every other layer.

Note the two interception points. jsPDF's `save` is not an own property of
`jsPDF.prototype` and does not download through an anchor, so patching either
captures nothing and reads as "no export happened"; the constructor has to be
wrapped. Canvas exports do use an `<a download>` click.

### 4. Ads blocked, compared against the last commit

The rail, the anchors and the leaderboard all reserve space only once a banner has actually
filled. That promise is only worth something if a blocked script leaves the page measurably
untouched, so this extracts `git archive HEAD` to a temporary directory, serves it alongside
on port 5098, blocks `js/ads.js` in both, and compares geometry at every page and width.

Any difference is reported per property. **A difference here is not automatically a bug** — if
you deliberately changed a layout, the working tree is supposed to differ from HEAD. Read the
reported values before acting: this check is asking "did an ad-related change leak into the
no-ads layout?", and the answer is only meaningful when you know what you changed.

Skip it with `--no-baseline` when you already know the layout moved. A page that does not
exist in HEAD yet is skipped automatically, with a line saying so, rather than being compared
against the baseline server's 404.

### A RETRY line in the output

A navigation occasionally fails to settle for reasons that have nothing to do with the page:
`npx serve` stalls a request under load and `js/ads.js` never evaluates, so the readiness poll
waits for a `TBAds` that is not coming. It lands on a different page every time and used to
kill the whole run. It is retried once and announced (August 24, 2026).

One RETRY line is noise. The same page retrying every run is a real defect — do not treat the
retry as having settled the question.

### 9. Resume templates: every design actually renders

Added September 8, 2026. It closes the gap every other section here shares:
they check the machinery AROUND the documents -- which ad band mounts, where
the header's edge lands, that a CTA routes through the interstitial, that a
download is named from the right field -- and nothing rendered a resume
template and looked at the result.

That was not theoretical. Seven defects in one template were found by reading
the code on the day it shipped, and none of them could have failed this suite.
The one net that might have caught a later regression, section 4, only answers
"did anything change since the last commit?" -- so a mistake, once committed,
becomes the baseline and is compared against itself forever after. A check has
to assert what is TRUE of a good sheet, not merely what is unchanged.

#### What it does

Loads `resume.html`, reads the editor's own sample content back out of the
live form, and lays out every template in the registry against four states:
the sample, the sample plus a photograph, an empty document, and a document
whose photo value is a hostile SVG data URI. For each it asserts:

| Assertion | What it catches |
|---|---|
| lays out without throwing | a descriptor naming a type role, field or body kind that does not exist |
| draws more than 20 operations | a template that renders a blank page |
| neither column overflows its own boundary | content past the foot of a column -- and the sidebar never paginates, so its overflow is simply lost |
| every colour resolved to a hex | a role name reaching a painter, which draws as nothing rather than erroring |
| nothing drawn off the page | a block positioned outside the paper |
| no photograph at the wrong aspect | a stretched face, which neither painter can detect |
| a photograph only when there is a real one | the untrusted-input guard failing open |
| the PDF's text is still text | a change that rasterizes the page and breaks ATS parsing |

#### What it deliberately does NOT assert

**Page count.** Ruled Serif is structurally two pages at any content volume,
so "one page" is false for it, and a per-template expected-count table would be
a second source of truth of exactly the kind this project has already watched
drift. Overflow is the honest version of the same question: it asks whether
content ran past a boundary the column itself declared, which is wrong for
every template however many pages it takes.

**Text extent.** A text operation carries an anchor, not a width, so the
off-page check catches gross misplacement and not overflow by a few points.
The overflow flags cover the latter.

#### It was mutation-proven six ways

Every assertion family was broken on purpose and confirmed to fail, per the
rule in CLAUDE.md that an assertion which has never failed is not evidence:

| Break | Caught by |
|---|---|
| sidebar `bottom` cut to 300 | no column overflows its own boundary |
| photo `top` moved to 900 | nothing is drawn off the page |
| a type role renamed to `nosuchrole` | every colour resolved to a hex |
| `h = w / PHOTO_RATIO` changed to `/ 1.45` | no photograph at the wrong aspect |
| the URL guard widened to any `data:image/` | a photograph only when there is a real one |
| a block naming a type the template lacks | lays out without throwing (all four states) |

#### One trap worth knowing

The evaluated browser code is a JavaScript template literal, and `\b` inside
one is the BACKSPACE escape, not a word boundary. The PDF text-operator count
was written `/\bTd\b/` and silently matched nothing, reporting 0 operators on
all four templates the first time it ran. It has to be `\\b` in the source.

It is only visible because the assertion demands a POSITIVE count rather than a
non-negative one -- written the lazy way it would have passed forever while
measuring nothing. That is the general lesson for anything added here: assert
the value you expect, never merely that the code ran.

### 10. Poster editor: every format exports something real

Added September 8, 2026. `poster.html` offers five export formats and the suite
opened none of them.

**This editor has already lost an export silently.** It declared a wrong SRI
hash for jsPDF, so every browser blocked the script and PDF export had been dead
since commit `cc7acff` -- found while verifying an unrelated resume template, not
by a check. Five formats times one silent failure each is the surface this
closes.

It puts a photograph and a caption on the poster FIRST, and that is the point
rather than a detail: an empty poster's SVG is a legitimate 284 bytes -- two
rects and no image -- so a regression that dropped the artwork out of every
export would produce valid, empty files and pass against the default document.

| Assertion | What it catches |
|---|---|
| the download happened | an export path that throws or never fires |
| the bytes are really a PNG / JPG / SVG / PPTX | checked by magic bytes, not the Blob's `type`, which is only whatever the code that built it claimed |
| carries the artwork rather than an empty page | a format that still produces a valid file after silently dropping the content |
| SVG embeds the photograph as an image | the SVG path losing its data URI |
| SVG's caption is real text, not pixels | the caption being rasterized into the image |
| PDF `save()` ran and starts `%PDF-` | the jsPDF breakage above, exactly |
| PDF carries an image XObject | a PDF exported with no artwork in it |

Mutation-proven twice: emptying the SVG's image `href` fails two assertions, and
short-circuiting the PDF's `addImage` fails the artwork one.

**The card layout is covered separately (September 9, 2026).** Everything above
exports the style the editor opens with, which left the Queen and King of
Hearts style -- the first `frame` value that is a whole page layout rather than
a border -- with no coverage at all. It is the style that needs it most: it
draws a heart from a `Path2D` and rank glyphs in a substituted display face,
and the heart is ONE path string feeding two renderers, canvas and the SVG
emitter. Writing it once is what stops an edit landing in one and silently
missing the other, and nothing checked that it had not.

The section now also selects that style, sets BOTH rank corners away from their
defaults (so a glyph found in the export proves the control reached it, not
that some default was drawn), and asserts the raster and PPTX exports are real
files, the PDF carries an image, and the SVG carries the heart's own geometry
and both chosen glyphs. Mutation-proven twice: changing one coordinate of
`HEART_PATH` and disabling the card branch in `exportSVG` alone each fail it,
with different messages -- the first leaves the rank glyphs present, the second
does not.

### 11. Mockup editor: every template renders its product

Added September 8, 2026. Sections 5, 5b and 5c drive ONE template -- whichever
the editor opens with. Eighteen ship, and seventeen had never been rendered by
this suite at all.

A product is reachable only through the catalog card hand-off (`js/app.js`
writes `tb_editor_preset`, `js/mockup.js` reads it with `TB.takePreset()`), since
the template picker was removed. That is why this reloads the page per template:
there is no menu to click.

It places a saturated magenta fill -- a colour in no product photograph -- and
asserts **a design placed on the template actually prints**. That catches the
dead catalog card: the page loads, the controls work, the layer is listed, and
the product is blank. Proven three times, by 404ing one template's base
photograph, by 404ing every asset of another, and again on the final build.

#### Two assertions were written and cut, which is the useful part

Both were removed after being broken on purpose and refusing to fail. A check
that cannot fail is worse than no check, because it reads as cover.

**"The product photograph renders"**, as a floor on opaque pixels. A template
whose assets ALL 404 does not render an empty canvas -- it falls back to a
1000x1000 canvas measuring 100% opaque, which sails past any floor.

**"No artwork lands on the transparent surround."** The design is masked to the
product, so it cannot paint on transparency at all. Moving a garment's entire
print zone to an `8,8..200,200` corner of the canvas, well clear of the shirt,
still measured zero off-product pixels.

That second one is worth remembering before writing it again. Artwork landing
where it should not IS a real fault class here -- both faults in
`docs/error-fixes/MOCKUP_PRINT_ZONES_OVERHANGING_THEIR_SURFACE.md` are of it --
but neither lands on transparency. The frame's bled onto a black border and the
banner's onto its own stand, both opaque scenery. Reintroducing the banner fault
(`warpZone` bottom back to 1347 from 1345) was tested against this section and is
**not** caught. Detecting that class needs the per-template mask audit that
document describes, and its own conclusion still stands: "there is no cheap way
for it to: the answer depends on the photograph."

#### Cost

Section 11 reloads `mockup.html` eighteen times and some products are several
megabytes, so it is the slowest section here -- roughly two minutes, and it is
why a full run is now nearer six than four.

#### A section that writes localStorage must clear it before it returns

Sections 10 and 11 both drive real editors, so both persist real editor state
to `localStorage` on `localhost:5099`. `js/app.js` builds the homepage's
**continue strip** out of exactly those keys, and section 4 measures
`index.html` on that same origin against a pristine baseline served on another
port -- which has no such state and so renders no strip.

Left behind, the two new sections make the final parity comparison measure a
homepage carrying a continue strip against one that is not, and report it as a
layout regression in `site/` that nobody introduced. Both now clear the origin
before returning.

Section 7 documents the same hazard one step earlier ("Storage is cleared
first, and that is not housekeeping"), where a seeded background colour made a
later assertion fail for the wrong reason. The rule generalises: **a section
that writes storage owns clearing it**, and the clear belongs in the section
that made the mess rather than at the top of the one that trips over it.

#### A FONTS timeout used to make section 4 report differences that were not real

Fixed September 9, 2026. Recorded because the symptom is distinctive and the
fix is easy to undo by accident.

Section 4 measures the working tree and the baseline in two SEPARATE
navigations. If the webfonts loaded for one and timed out for the other, the
two were measured in different faces and every text-driven height differed by a
pixel or two -- reported as a layout regression, with `site/` byte-identical to
HEAD, where a difference is impossible by construction:

```
FONTS http://localhost:5099/ @1920 not ready after 3s (timeout); ...
FONTS http://localhost:5098/ @1920 not ready after 3s (timeout); ...
FONTS http://localhost:5099/ @1488 not ready after 3s (timeout); ...
index @1488 main: now [0,85,1473,4968.5], HEAD [0,85,1473,4972.1]
```

Both sides timed out at 1920 and no difference was reported. Only ONE side
timed out at 1488, and that is the width that failed.

`awaitFonts` now records the state instead of only printing it, and the parity
loop skips a width whose two passes disagree, saying so. It skips only on
DISAGREEMENT: both sides timing out is still comparable, which is the case the
note on `awaitFonts` describes, so an unreachable font host does not silently
disable the section -- it measures everything in the fallback instead. The
number of skipped widths is reported in the check's own name, because a run
that skipped most of them has not verified much.

Mutation-proven both ways: forcing the two states to disagree produces a SKIP
line per width, and a real 24px change to `main`'s padding is still caught at
every width with the skip in place.

**The first two attempts at that second proof were inert, which is worth more
than the fix.** Adding `margin-bottom` to `.mock-doc` changed nothing, because
it sits inside a fixed-aspect `.card-media` that absorbs it. Adding
`padding-top` to `main` changed nothing either, because that rule ends with a
`padding:` SHORTHAND which overrides any longhand written above it. Both times
the suite reported no difference and both times it was right -- so if a
mutation appears not to be caught, prove the mutation is observable in a
browser before concluding the check is broken.

## Adding a Check

Two rules, both learned from this suite's own bugs.

**Assert the exact contract, not a loose version of it.** The band check originally read
"at most one band mounts". That passes when a band silently fails to mount — the failure mode
that actually costs money. It only became useful when it asserted the exact expected count.

**Prove a new check fails.** Break the thing on purpose, confirm the check catches it, then
put it back. Every check in this file was verified that way, and it caught a real problem:
the selector-hook check originally scanned only class names, and would have passed straight
through a rename of the `data-filter` attribute the category filtering actually depends on.
A test that has never failed is not evidence of anything.

## History

`docs/memory/PROJECT_STATUS.md` used to describe two test files, `test-home.js` and
`verify-site.js`, as enforcing several of the guarantees above. **Neither file was ever in the
repository.** The guarantees were real decisions and the descriptions were accurate about what
*should* hold, but nothing was checking any of them, and the wording invited the next reader
to believe the coverage existed and stop verifying by hand.

Those claims now point here, and every one of them is enforced by a check above. If a check is
ever deleted, delete the claim with it.
