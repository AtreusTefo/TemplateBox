# Two pages shipped a Twitter card and no Open Graph image, and fifteen more pointed at a 1219x1509 logo

Date: September 3, 2026

## Issue Title

`privacy.html` and `blog.html` declared `twitter:image` with no `og:image` at all, so every
Open Graph consumer rendered them with no preview image. Separately, fifteen pages pointed
`og:image` at `assets/logo.png`, which is 1219x1509 and therefore cropped by every platform
into its 1.91:1 frame. Nothing in the test suite could see either fault, because the one check
that validates image paths deliberately skips absolute URLs and `og:image` is absolute by
protocol requirement.

## Root Cause

Three faults with one shared cause: the social-card surface had no owner and no check.

**1. The missing tag.** `privacy.html` and `blog.html` carry a full `og:type` / `og:site_name` /
`og:title` / `og:description` / `og:url` block and a complete Twitter Card block, and the
`og:image` line simply is not in either of them. Every other page on the site has it. It reads
exactly like a block copied from a sibling page with one line lost, and once lost there was
nothing to notice it: an absent meta tag renders nothing, warns nothing and breaks nothing on
the page itself. The consequence is only visible off-site, on someone else's server, when a link
is shared.

The two are not equivalent. `twitter:image` is read by Twitter/X. `og:image` is read by
Facebook, LinkedIn, Slack, WhatsApp, Discord, Telegram and — as a documented fallback —
by Twitter/X as well. A page with `twitter:image` alone therefore has a preview on exactly one
platform and a bare link everywhere else. `blog.html` is the site's content hub, which is the
page most likely to be shared deliberately.

**2. The wrong shape.** `assets/logo.png` is the brand mark: 1219x1509, portrait, 489KB. Open
Graph consumers render a 1.91:1 frame, so a portrait source is centre-cropped to a band across
its middle. Fifteen pages shared that crop. This was already known and recorded in
`PROJECT_STATUS.md` as an open item — "og-cover.png is the priority remaining one" — with
three of ten planned cards drawn and seven never generated.

**3. The declared size that could not be trusted.** `og:image:width` / `og:image:height` had
previously been declared as 1200x630 on the `logo.png` pages, for a file that is 1219x1509. A
platform reserves the preview frame from the declared pair *before* the file downloads, so a
wrong pair renders the card badly, whereas a missing pair only costs a measuring round trip.
The pair was therefore stripped from those pages, correctly, with a note to re-add it whenever
a page was pointed at a real 1200x630 card. That note was the only thing keeping the two facts
in agreement, and a note is not a mechanism.

**Why the suite could not catch any of it.** Check 1k ("every local image a page references
must exist on disk") ends with an explicit exemption: "Only local paths are checked; anything
absolute or protocol-relative belongs to a third party this suite cannot vouch for." That is
right for `<img src>`. It is wrong for `og:image`, which is absolute because a crawler resolves
it with no base document, and which points at our own `assets/` folder. The exemption was
written for third-party images and silently swallowed the entire social-card surface with them.

## Fix Applied

**The cards.** All ten presets in `site/tools/og-image.html` were rendered to
`site/assets/`, giving seven new 1200x630 cards (`og-cover.png`, `og-payment-receipt.png`,
`og-itemized-receipt.png`, `og-sales-receipt.png`, `og-invoice.png`, `og-mockup.png`,
`og-poster.png`) alongside the three that already existed. They were produced by driving the
real tool over the DevTools Protocol rather than by reimplementing its drawing code, so they
come off the same path as the originals.

The three existing cards were regenerated too. They were first kept rather than replaced, on
the grounds that the re-renders differed only in glyph-edge antialiasing — 39,183-40,329 of
3,024,000 channels at a maximum delta of 27-58 of 255, no difference in content or position —
so swapping three verified, deployed assets bought nothing visible. **That was then reversed
at the owner's instruction: all ten cards are rendered on one Chrome build.** Both readings are
defensible and the deciding argument is not the pixels. A set produced by two different browser
versions is a set whose provenance has to be explained every time someone regenerates part of
it; a set from one build is reproducible, and the run that proved it is the evidence below.

The regeneration is deterministic, which is what makes the uniform set worth having. Re-running
the generator returned the **seven cards drawn earlier the same day byte-identical** — same
`git hash-object` — and changed only the three from July. So the generator's output is a
function of the tool plus the Chrome build, with nothing ambient in it. Chrome 152.0.7977.66
produced the current set.

**A collision in the invoice illustration.** `drawInvoice` places "BALANCE DUE" left-aligned
from the total rule's start and the amount right-aligned at its end, on the same baseline, so
the rule's span is the entire budget for the pair. At its 45% start that span is 136.4 reference
units against the 161.3 the two strings actually need, and the label ran **30.8 card pixels**
underneath the amount on all three cards using that illustration. The rule now starts at 30%,
measured: 0.35 leaves -0.1 units (touching), 0.30 leaves 12.3 units, which is 15.3 card pixels
of clear air. The rule's width is the complement of its start, so the two numbers must always
sum to 1 or it stops meeting the right edge of the sheet.

**The wiring.** Nineteen indexable pages now point `og:image` and `twitter:image` at a real
1200x630 card and declare its size. An editor shares its landing page's card, which is the
convention the resume pair already set. Pages with no document of their own — homepage,
About, Terms, Privacy, the blog index, the six-document receipts editor — take
`og-cover.png`.

JSON-LD `"logo"` was **left alone**. `schema.org` `Organization.logo` wants the brand mark, not
a social card, so `logo.png` is correct there and rewriting it for consistency would have been
a regression.

**The post generator.** `js/admin.js` fell back to `logo.png` for a post with no cover image; it
falls back to `og-cover.png` now, and emits the declared width/height pair **only** in that
fallback case. A post's own cover is whatever the author uploaded, and a wrong declared pair is
worse than none — the same reasoning that stripped the pair from the `logo.png` pages. The one
existing exported post page was brought in line with generator output rather than hand-picked a
better card, because a hand-picked value is exactly the drift `EXPORTED_POST_PAGE_FOOTER_DRIFT.md`
was written about: the next export would silently revert it.

**The check.** New static check 1l in `tests/verify-layout.js`, four assertions per page:

- the page declares both `og:image` and `twitter:image`
- the two name the same card (two different images is always a half-finished edit)
- a card on our own origin exists on disk
- a declared `og:image:width`/`height` pair matches the PNG's real size, read from the file's
  own IHDR chunk rather than trusted from its name

It is scoped by `<link rel="canonical">` rather than by a filename list, and that is what makes
it maintainable: a page with a canonical is meant to be indexed and therefore shared, while the
tools, `admin.html`, `loading.html`, `search.html` and `404.html` carry none and fall out of
scope automatically. No exclusion list has to be kept in step with the page list.

## Testing Steps

`node tests/verify-layout.js --quick` — 55 checks before, 131 after; 76 of the new ones are
1l across 19 indexable pages.

All four assertions are mutation-proven, each against its own defect, restored after each:

| Mutation | Check that failed |
| --- | --- |
| Strip `og:image` from `terms.html` | `declares og:image and twitter:image` |
| Point `about.html`'s `twitter:image` at a different card | `og:image and twitter:image name the same card` |
| Point `docs.html`'s `og:image` at `og-nope.png` | `its social card exists on disk` |
| Declare height 1509 on `index.html` | `the declared og:image size is the file's real size` |

The full suite (`node tests/verify-layout.js`) covers the rest; these are `<head>` changes and
move no geometry, so section 4's HEAD parity is the check that matters and it is clean.

## Troubleshooting

**A card renders in the wrong typeface.** `tools/og-image.html` draws with Playfair Display and
Inter from `fonts.googleapis.com` and waits on `document.fonts.ready` before its first paint. A
generator run on a machine that cannot reach that host will paint Georgia and a fallback sans
while measuring the real faces. The generator asserts `document.fonts.check()` for both families
and refuses to write anything if either is missing, rather than producing ten subtly wrong
cards; if it refuses, fix the network rather than removing the guard.

**A page is edited by script and silently skipped.** This tree contains both line endings:
`core.autocrlf` checks files out as CRLF, and anything a tool has rewritten since is LF. A
pattern anchored on `\n` matches some pages and skips others with no error — it did exactly
that here, leaving six pages with a card and no declared size, and the run reported success.
Any script that rewrites markup must match `\r?\n` and insert using the file's own ending.
Check 1l catches the *result*; it cannot catch a script that never ran.

**A platform still shows the old image.** Facebook, LinkedIn and Slack cache scrapes for days.
Use each platform's own debugger to force a re-scrape; a stale preview is not evidence the tag
is wrong.

## Related Files

- `site/assets/og-cover.png`, `og-payment-receipt.png`, `og-itemized-receipt.png`,
  `og-sales-receipt.png`, `og-invoice.png`, `og-mockup.png`, `og-poster.png` — new
- `site/assets/og-resume.png`, `og-rent-receipt.png`, `og-warning-notice.png` — re-rendered
  so the whole set comes off one Chrome build (152.0.7977.66)
- `site/tools/og-image.html` — the balance-row collision fix
- `site/js/admin.js` — post-generator fallback and its conditional size declaration
- Nineteen pages under `site/` and `site/blog/` — `og:image`, `og:image:width`,
  `og:image:height`, `twitter:image`
- `tests/verify-layout.js` — static check 1l
- `docs/implementation/OPEN_GRAPH_SOCIAL_CARDS.md` — the card set and the page-to-card map
