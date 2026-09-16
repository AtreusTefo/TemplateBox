# Stylesheet Structure: One Global Sheet, Twenty Tagged Sections, One Split

Date: September 1, 2026
Scope: `site/css/style.css`, new `site/css/admin.css`, `site/admin.html`, `site/tools/og-image.html`

## What Was Asked

Two things, after a discussion about whether every page should have its own stylesheet in its own folder:

1. A table of contents, so a developer or an AI can find things in a 7,800-line file.
2. Split the private admin styles out, so they stop shipping to every visitor.

The per-page/per-folder proposal was examined and deliberately not adopted. The reasoning is recorded below, because it will be proposed again.

## Why the Sheet Stays Global

Measured before deciding:

| | |
|---|---|
| `style.css` | 7,823 lines, 743 top-level rules, 56 media blocks |
| On disk | 250 KB, of which **53% is comments** |
| On the wire | **51 KB brotli**, 65 KB gzip |
| Pages loading it | 26 |

Four reasons a per-page split loses here, in order of weight:

1. **Folder-per-page changes URLs, not just files.** `site/` is the Netlify publish directory and therefore the web root, so `about.html` is served at `templatebox.win/about.html`. Moving it into `about/` changes that address. There are 19 absolute `.html` entries in `sitemap.xml`, an absolute canonical on every page, 38 internal links to `about.html` alone, and `serve.json` sets `cleanUrls: false` deliberately so the interstitial's `?target=` query survives. That is a measurable SEO cost against a site whose nine landing pages exist purely as search-intent entry points, for no benefit a visitor can perceive.

2. **The shared surface is the majority and sharing is load-bearing.** Tokens, header, navigation, buttons, forms, the ad rails, print and dark mode are used by every page family. This project's strongest convention is that a component shared by two families is ONE selector list -- `.editor-rail, .home-rail, .content-rail { ... }` -- specifically so the three cannot drift. Per-page files force either duplication of those rules (which the convention forbids) or a shared file anyway, at which point the result is global-plus-per-page rather than per-page.

3. **There is no build step to reassemble it.** `netlify.toml` runs an empty build command by design. Splitting without a bundler means N blocking requests per page, or `@import` chains that serialize them, which is worse. The monetized flow is inherently multi-page -- catalog, `loading.html`, editor -- so one cached file across three hops beats three fresh fetches, and `loading.html` is a ten-second interstitial where render speed is the product.

4. **The delivery saving is small.** At 51 KB compressed, splitting out even the two largest page-exclusive blocks would save a blog reader roughly 10 KB. Real, but not what was making the file hard to work in.

Per-page stylesheets are good practice in projects with a bundler that tree-shakes and concatenates. What rules them out here is the absence of a build step, not the idea.

## What Changed

### 1. A contents block and twenty tagged sections

`style.css` opens with a "How this file is organised" block covering the reasoning above in short form, the two load-bearing conventions, the media-query specificity trap, and then a contents list of twenty sections.

**Sections are addressed by a bracketed tag, not a line number.** Each section opens with a banner carrying `[S01]` through `[S20]`; the contents list the same tags. Searching for `[S09]` jumps straight to the advertising section. Line numbers were rejected outright: they rot on the first edit and then actively mislead, while a tag survives any amount of insertion above it.

The twenty sections, in file order:

| Tag | Section |
|---|---|
| S01 | Design tokens and theme |
| S02 | Reset and base elements |
| S03 | Site shell: header, nav, mega-menu, search |
| S04 | Page headings and the continue strip |
| S05 | Homepage catalog feed |
| S06 | Buttons |
| S07 | Loading interstitial |
| S08 | Editors: shared shell |
| S09 | Advertising: rails, anchors and reservations |
| S10 | Editors: panes and form navigation |
| S11 | Editor toolbars and the download panel |
| S12 | Form controls |
| S13 | Resume editor |
| S14 | Business document editor |
| S15 | Poster editor |
| S16 | Mockup editor |
| S17 | Guides strip and search page |
| S18 | Content pages: landing, static, blog, post |
| S19 | Responsive rules |
| S20 | Print |

The 64 existing `/* ---- */` sub-headings were left exactly as they were. They are good, and they now sit under a top-level banner instead of floating in an undifferentiated 7,800 lines.

### 2. `css/admin.css`

28 rules moved out, loaded by `admin.html` and `tools/og-image.html` only, **after** `style.css`.

Both pages are private operator tools -- the blog and catalog-thumbnail workspace, and the Open Graph card generator, kept out of the index by `netlify.toml`. Their chrome was shipping to every public page.

**The load order is not cosmetic.** `.admin-thumb-preview` overrides `.catalog-grid`'s 2/3/4-column ladder, and media queries carry no specificity, so being declared later is the entire mechanism. A second sheet loaded after the first preserves that and strengthens it; loading it before would silently restore the four-column grid in the admin preview.

**Two rules inside the admin section deliberately did not move**, and this is the part most likely to be got wrong by a future pass that re-runs this split by line range:

- `.btn-small` is applied by `js/docs.js` and `js/resume.js` -- it is the sample notice's "Start blank" button on two public editors. It moved to S06 Buttons.
- `.radio-option` is in `docs.html`'s markup, on the "Blank printable form" checkbox. It moved to S12 Form controls.

Both were written in the admin section only because `admin.html` happened to need them first. Both now carry a comment saying why they are where they are. `.radio-row`, the flex row that pairs with `.radio-option`, **is** admin-only and did move.

Both relocations were checked for cascade safety before being made: nothing declared between the old and new positions competes for the same properties on the same elements, and the one selector that overlaps `.btn-small` -- `.sample-notice .btn-small` -- wins on specificity rather than order, so its position is irrelevant.

`tools/og-image.html` is easy to miss. It uses `.admin-main`, `.admin-panel`, `.admin-panel-head`, `.admin-actions`, `.admin-status`, `.admin-sync`, `.admin-help`, `.admin-intro` and `.mono`. Splitting without linking it there would have left that page unstyled.

## Verification

This was a pure refactor: no rule's selector or declarations changed, only which file it lives in and, for two rules, where in the file.

**Rule-level proof.** Every top-level block was normalized (comments stripped, whitespace collapsed) and compared against `git show HEAD:site/css/style.css`:

```
HEAD blocks: 743 | new combined: 743
rules in HEAD but not in new files: 0
rules in new files but not in HEAD: 0
order preserved (excluding the 2 re-homed rules): true
```

Brace depth returns to zero with no negative excursion in both files, so neither is truncated or over-closed.

**Structural checks.** All twenty tags resolve to exactly one banner plus one contents entry (`[S09]` appears three times because the navigating instructions use it as the worked example). No banner sits inside a rule block -- the first attempt put `[S01]` inside `:root`, which parses fine but is wrong, and it was moved above it.

**Browser-level.** `node tests/verify-layout.js`. Section 4, "ads blocked: layout identical to the last commit", is the check that matters here: it compares 1,400 measured properties in the working tree against a pristine `git archive HEAD` copy. For a refactor that changes nothing, it must pass with zero differences -- unlike a feature change, where it is expected to report the intended diffs.

`admin.html` is exercised by suite sections 6 and 8 but is not in the parity snapshot, so it was also checked by eye.

## Related Files

- `site/css/style.css` -- contents block, twenty section banners, two re-homed rules
- `site/css/admin.css` -- new, with its own header stating the rules for editing it
- `site/admin.html`, `site/tools/og-image.html` -- the second `<link>`
- `CLAUDE.md` -- the ad-band and shared-rule conventions the contents block summarizes
