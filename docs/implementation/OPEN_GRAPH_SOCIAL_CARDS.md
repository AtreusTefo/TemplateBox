# Open Graph social cards: the set, the map, and how to add one

Date: September 3, 2026

Every indexable page now shares with its own drawn 1200x630 card instead of the site logo.
This document is the reference for which page uses which card, how the set is produced, and
what has to stay in agreement. The defects that prompted it — two pages with no `og:image`
at all, fifteen pointing at a portrait logo, and a declared size nothing verified — are in
`docs/error-fixes/SOCIAL_CARDS_MISSING_WRONG_SHAPE_AND_UNCHECKED.md`.

## The card set

Ten cards, all 1200x630, 75-103KB, in `site/assets/`. Each is drawn entirely with Canvas
primitives by `site/tools/og-image.html` — there are no image assets behind them, which is
why the whole set can be regenerated from source at any time.

| Card | Illustration | Headline |
| --- | --- | --- |
| `og-cover.png` | invoice | Free invoice, receipt and resume maker |
| `og-rent-receipt.png` | receipt | Free rent receipt template |
| `og-payment-receipt.png` | receipt | Free cash payment receipt |
| `og-itemized-receipt.png` | invoice | Free itemized receipt template |
| `og-sales-receipt.png` | receipt | Free sales receipt form |
| `og-invoice.png` | invoice | Free invoice template |
| `og-warning-notice.png` | notice | Free employee warning notice |
| `og-resume.png` | resume | Free ATS resume template |
| `og-mockup.png` | tee | Free t-shirt mockup generator |
| `og-poster.png` | framed poster | Free poster and canvas maker |

## The page-to-card map

Nineteen indexable pages. Two rules decide the map, and neither is a matter of taste:

**An editor shares its landing page's card.** That convention was already set by
`og-resume.png`, which serves both `ats-resume-template.html` and `resume.html`. A visitor
sharing the editor and a visitor sharing the landing page are sharing the same product.

**A page with no document of its own takes the site-wide cover.** The homepage, About, Terms,
Privacy, the blog index and `docs.html` all fall here. `docs.html` is the six-document receipts
and invoices editor, so it has no single landing page to inherit from and the cover's
"Free invoice, receipt and resume maker" is the accurate description of it.

| Page | Card |
| --- | --- |
| `index.html`, `about.html`, `terms.html`, `privacy.html`, `blog.html`, `docs.html` | `og-cover.png` |
| `ats-resume-template.html`, `resume.html` | `og-resume.png` |
| `rent-receipt-template.html` | `og-rent-receipt.png` |
| `cash-payment-receipt-template.html` | `og-payment-receipt.png` |
| `itemized-receipt-template.html` | `og-itemized-receipt.png` |
| `sales-receipt-template.html` | `og-sales-receipt.png` |
| `free-invoice-template.html` | `og-invoice.png` |
| `employee-warning-notice-template.html` | `og-warning-notice.png` |
| `tshirt-mockup-generator.html`, `mockup.html` | `og-mockup.png` |
| `poster-maker.html`, `poster.html` | `og-poster.png` |
| `blog/<slug>.html` with no cover image | `og-cover.png`, from `js/admin.js` |

`404.html`, `search.html`, `loading.html`, `admin.html` and everything under `tools/` carry no
canonical and no card, deliberately. `search.html` is `noindex, follow`; `404.html` has no
canonical by design and must stay out of `sitemap.xml`.

## Three things that must stay in agreement

**The card, the declared size, and the file.** Each page declares `og:image:width` and
`og:image:height`. A platform reserves the preview frame from that pair before the file
downloads, so a wrong pair renders the card badly while a missing pair only costs a measuring
round trip — which is why the pair was once removed sitewide rather than corrected, and why
it is only ever declared for a file whose size is known. Static check 1l reads the PNG's own
IHDR chunk and compares, so the declaration cannot drift from the file.

**`og:image` and `twitter:image`.** Both are declared on every page and must name the same
card. Two different images is not a protocol violation, but it has never once been an
intention — it is always a half-finished edit, so 1l asserts they match.

**The generator and the exported pages.** `js/admin.js` bakes the card into every post page it
emits. Its fallback for a post with no cover is `og-cover.png`, and it emits the size pair only
in that fallback branch, because a post's own cover is whatever the author uploaded. A post page
in `site/blog/` must match generator output; hand-picking a nicer card for one of them is the
drift `EXPORTED_POST_PAGE_FOOTER_DRIFT.md` documents, and the next export silently reverts it.

`schema.org` `Organization.logo` in the JSON-LD blocks still points at `logo.png` on every page,
and should. A logo is what that field is for; a social card is not.

## Adding or regenerating a card

1. Add a preset to the `PRESETS` array in `site/tools/og-image.html` — `id`, `label`, `file`,
   `doc` (one of `none`, `invoice`, `receipt`, `notice`, `resume`, `poster`, `tee`), `title`,
   `sub`. Each preset carries its own filename so the whole set can be produced by stepping
   through the list.
2. Run `node tools/make-og-cards.js` from the repository root, which writes every card
   including the new one. (By hand: open the tool, pick the preset, click Download PNG, save
   into `site/assets/`.) Either way the tool waits on `document.fonts.ready` before its first
   paint; if it drew before the webfonts landed it would measure Georgia while painting
   Playfair, so a machine that cannot reach `fonts.googleapis.com` cannot produce a correct
   card and should not try — the script refuses outright rather than writing ten wrong ones.
3. Point the page's `og:image` and `twitter:image` at it and declare 1200x630.
4. `node tests/verify-layout.js --quick`. Check 1l will fail if the file is not there, if the
   two tags disagree, or if the declared size is not the file's real size.

The whole set is rendered by `tools/make-og-cards.js`, run from the repository root:

```
node tools/make-og-cards.js
```

It drives `site/tools/og-image.html` itself over the DevTools Protocol and reads
`canvas.toDataURL`, rather than reimplementing the drawing code, so a card it produces is what
a person gets by opening the tool and clicking Download PNG — there is no second copy of the
artwork to drift. No npm dependencies; it finds a browser already on the machine.

**It lives at the repository root, not in `site/tools/` beside the page it drives.** `site/` is
the Netlify publish directory and therefore the web root, so a script placed there would be a
public URL (`INTERNAL_FILES_PUBLICLY_SERVED.md`). The two `tools/` directories are opposites:
`site/tools/` is browser pages that ship, the root's is working files that must not.

Two things it does deliberately. It **refuses to write anything** if Playfair Display or Inter
did not load, because the tool measures the real face while painting whatever is available, and
a fallback-face card looks fine in isolation and only reveals itself once it is being shared.
And it **prints the browser build** it used — `Chrome/152.0.7977.66` for the current set —
because that build is the provenance of the whole set, and a run that rewrites every card
should be explainable from the log rather than guessed at from the diff.

It prefers the installed system Chrome over a cached Playwright chromium, which is the opposite
order to `tests/verify-layout.js`. The suite wants the most pinned browser it can find for
stable measurements; this wants the browser a person actually uses, since that equivalence is
the whole point. Copying the suite's list verbatim got this wrong once and silently re-rendered
the committed set with a different binary.

**Regenerate the whole set, not part of it.** The output is deterministic given the tool and
the browser: re-running the generator returns every card produced by the same Chrome build
byte-identical, verified by `git hash-object`. Across builds it does not — the three cards
drawn in July came back with 39,183-40,329 of 3,024,000 channels differing at a maximum delta
of 27-58 out of 255, which is glyph-edge antialiasing and nothing else, no difference in
content or position. That is invisible in use, so it is not a quality argument either way; the
reason to regenerate together is provenance. A set built from two browser versions has to have
that explained every time someone touches part of it, and the explanation is not in the files.
All ten currently come from **Chrome 152.0.7977.66**.

If a single card ever does need regenerating alone, run the whole set and check with
`git status` that only the intended file moved. Any other card changing means the browser has
been updated, and the set should be regenerated and committed as one.

## The invoice illustration's total row

`drawInvoice` draws "BALANCE DUE" left-aligned from the total rule's start and the amount
right-aligned at its end, both on one baseline, so the rule's span is the entire budget for the
pair. It starts at 30% of the content width, not 45%: at 45% the span is 136.4 reference units
against the 161.3 the strings need, and the label ran 30.8 card pixels under the amount on
`og-cover`, `og-invoice` and `og-itemized-receipt`. The rule's width is the complement of its
start, so **the two numbers must sum to 1** or the rule stops meeting the right edge of the
sheet. The illustration draws in a 300x400 reference space that `draw()` scales by
`k = 372/300 = 1.24`, so every measurement inside `drawInvoice` is in reference units and one
unit is 1.24 card pixels.
