# Daily Report: August 13, 2026

Six pieces of work, all landing on the site's ad architecture and its primary navigation.
Together they extended the fixed rail pattern to a third page family, then a fourth context
(the loading interstitial), lowered a floor that had been deliberately set high once already,
reworked the guides page's ad shape, and replaced the split footer/mega-menu navigation with one
mega-menu used everywhere. Every change was measured before being applied and re-measured after;
three of the six surfaced a real defect that a first pass would have missed. Everything is
committed as `8f68db0` on `dev2` and pushed to `origin/dev2`.

## Summary

| Area | Outcome |
|---|---|
| Content rail rollout | `.content-rail` extended to 15 pages (landing, legal, blog surfaces), reusing the editor/home rail mechanism exactly |
| Floor math | Content-rail floor measured at 83.5rem (not copied from editors' 84rem); later revised to 75rem for cross-family parity |
| Blog/post rail upgrade | Old in-flow `.post-rail`/`.blog-sidebar` single skyscraper replaced by the shared fixed-column rail, gaining the 3-slot stack |
| `loading.html` rail | Upgraded to `mountContentAds()`'s markup contract, deliberately kept off the fixed-column CSS (stayed `position: sticky`) to avoid reopening a solved overlap bug |
| `loading.html` header | Removed entirely; theme control was already redundant with the inline no-flash script |
| `loading.html` mobile | Real overflow found and fixed at both 400x667 and 320x568 (iPhone SE); required four rounds of measurement, not one |
| `loading.html` anchor | Added back on mobile only, after confirming the page's mobile layout no longer scrolls -- the exact condition that makes a fixed anchor safe there |
| Editor rail floor | Lowered 84rem -> 75rem, knowingly reopening a documented, previously-fixed pane-narrowing regression, for cross-page-type parity |
| Guides page (`blog.html`) | Reworked to one persistent unit: rail on laptops+, bottom anchor on mobile, top leaderboard removed entirely |
| Social bar investigation | Confirmed present in markup; non-display is a known, previously-diagnosed frequency-capping/timing issue, not a defect |
| Footer -> mega-menu | Footer deleted from 20 public pages; the "More" panel (previously homepage-only, desktop-only) is now site-wide and available at every width |
| Editor page furniture | Breadcrumb and intro paragraph removed from all four editors; h1 kept but visually hidden (`sr-only`), not deleted, to preserve the single-h1 SEO rule |
| Defects found and fixed | 2 self-introduced (320px header overflow from the mega-menu; a misdiagnosed "pre-existing" overflow that was actually the same regression) |
| Test suite | Extended with the editor rail floor, the mega-menu's every-width requirement, and 320px coverage; full suite 703 -> 879 checks, 0 failed at every re-run after fixes |
| Documentation | 2 new implementation docs, 5 existing docs updated, `AGENTS.md`/`GEMINI.md` re-synced with `CLAUDE.md` (closing a pre-existing drift) |
| Commit | `8f68db0` "improvements" on `dev2`, pushed to `origin/dev2` |

## 1. Content rail: a third page family, then a fourth

### 1.1 What was asked and what was already true

The request was to apply the fixed full-height rail -- proven on the homepage and editors -- to
13 more pages, with a 3-slot stack on wide screens. Before writing any code, the actual current
behavior was checked rather than assumed: the homepage and editors already shared one CSS rule
and one 93rem stack boundary, so "apply the same rail" was a known-working mechanism to point
at, not a design question.

### 1.2 The floor was measured, not copied

The editors' 84rem floor exists because an editor's `main` cap was widened to include an
in-flow rail, so it has a `calc()` override to shed that width once the rail goes fixed. The new
page family's `main` was never widened for a rail -- it is the site's flat `main { max-width:
72rem; }` -- so there is nothing to shed and the floor alone is the protection. The break-even
was computed directly: `72rem + var(--ad-rail-w)` (11.5rem at the single-unit creative width)
equals exactly 83.5rem, the precise point below which the reserved column starts eating into
`main`'s own cap rather than sitting in spare margin. That number, not 84rem and not a
stylistic choice, became the initial floor.

### 1.3 Blog and post pages were upgraded, not left alone

`blog.html`, `post.html` and the generated `blog/<slug>.html` article already had a rail --
an older, different one: `.post-rail`/`.blog-sidebar`, sticky and in-flow, single skyscraper
only, floored at 70rem. Adding the new fixed rail *alongside* it would have shown two persistent
units at once in the 70-93rem range, which the task's own acceptance criteria ruled out
directly. The choice was binary: convert, or leave untouched. Converting was chosen, accepting
a real, narrow cost -- those three pages lose the rail in the 70-83.5rem band where the old
sidebar used to appear -- in exchange for one rail component sitewide and a 3-slot stack those
pages had never been able to show.

### 1.4 Verification, and what it caught

The project's own `tests/verify-layout.js` was extended rather than trusted blindly. Two real
bugs surfaced from doing so:

- `mountHosts()` still queried the now-dead `[data-ad-sidebar]` hook -- caught by the suite's
  own "every hook queries exists in the served markup" check, removed.
- The suite's leaderboard-shown check queried only `.editor-leaderboard`, which blog/post pages
  never used (they use `.ad-lead`) -- so the check silently read "not shown" regardless of
  actual state. Fixed, and while fixing it, established that blog/post's top-leaderboard-plus-
  side-rail is a genuinely different, intentional multi-unit pattern from index/editors'
  mutually-exclusive bands, so those two pages were excluded from that one assertion rather than
  weakening it sitewide.

Full suite after this pass: 703 passed, 0 failed. Full reasoning: `docs/implementation/CONTENT_RAIL_ROLLOUT.md`.

## 2. `loading.html`: rail, header, and a mobile fix that took four rounds

### 2.1 The header

Removed entirely -- it was a wordmark link and a theme toggle, nothing else. The toggle's
removal was verified harmless before treating it as one: the inline no-flash script in `<head>`
already applies the last-saved theme before first paint, independent of whether a toggle button
exists on the page.

### 2.2 The rail: same contract, deliberately different CSS

`mountContentAds()` was reused for its markup contract only -- `[data-ad-content-rail]` plus
three `[data-ad-rail-slot]` children -- never its CSS. `.content-rail` is `position: fixed`,
correct on pages where ad content runs to the document's true end. `loading.html`'s two banners
sit mid-page inside a centred card, and this page had already tried a fixed bottom anchor once
and reverted it for exactly that reason: a fixed element pins to the viewport regardless of
scroll position and can cover mid-page content on a short screen. `.loading-rail` keeps its own
`position: sticky` rule instead, so it moves with the content and cannot overlap anything by
construction -- the reuse gained the real 3-slot stack without reopening the bug the original
sticky design existed to avoid.

### 2.3 Mobile: the reported fix wasn't sufficient, and the numbers said so before assuming otherwise

The initial ask was "drop to one banner below 70rem." Measured at 400x667 before making any
change: the page's content alone, excluding every pixel of padding, already totalled ~685px --
over budget before a single margin was added. Cutting to one banner (necessary) was not
sufficient on its own. Closing the gap took three further, explicit cuts: tightened
padding/margins throughout the card, a tightened `line-height: 1.3` (down from the site's 1.6
body default, generous for paragraphs and excessive for two-line captions), and hiding the trust
list as the least load-bearing content. That combination fit 400x667 with ~27px to spare -- but
not 320x568 (iPhone SE, CLAUDE.md's own stated 320px minimum, paired with a genuinely short
device), which still overflowed by ~69px once narrower text wrapped onto more lines. A fourth
cut, hiding the template preview below 384px only, closed that gap without touching the wider
range that already fit.

**A verification script's own flakiness produced two false failures along the way** (banners
reporting `display: block` instead of `flex`; a `scrollHeight` nearly 300px too tall) that did
not reproduce on any re-run and vanished once re-checked with a more careful, better-waited
script -- recorded as a reminder that the measuring tool can be the bug, not only the page.

### 2.4 The anchor came back, on the strength of 2.3

Later the same day: "add the bottom anchor too, if it fits properly." The original exclusion
was reframed rather than overturned -- the bug was never about banner count, it was about a
fixed element sitting over content that gets scrolled past it. Section 2.3's tightening had,
incidentally, already gotten the page to fit the viewport with **zero scrolling**, which removes
the "scrolled past" moment the bug depended on. Adding the anchor claims a further 4.75rem
(76px) of reserved padding the earlier budget hadn't accounted for; closing that gap moved the
template-preview hide threshold from the narrow 24rem chosen to touch as few devices as possible
up to the anchor's own 48rem (one shared breakpoint governing both trade-offs), plus a further
48rem-scoped layer of cuts including a `.countdown` font-size reduction scoped to that tier only.
Net result, measured directly rather than inferred: 320x568, 400x667 and 375x667 all land at an
exact scrollHeight-equals-viewport fit; overlap with the in-flow banner was checked directly at
every size, not assumed from the zero-scroll condition alone.

Verification grew from 12 to 31 targeted checks across this section. Full suite re-run
afterward: still 703 passed, 0 failed.

## 3. Editor rail floor: 84rem -> 75rem, a documented cost reopened deliberately

### 3.1 The premise didn't reproduce -- so the actual gap had to be found

The report was "the editor page doesn't show the same rail the homepage and other pages show,
on laptop screens." Tested directly across `index.html`, a content-rail page and an editor at
seven widths before changing anything: all three already behaved identically -- single unit at
1366/1440px, 3-slot stack at 1512px+. The real gap only appeared once the user gave a specific
width: 1280x800 (MacBook Air), where the homepage showed a rail (75rem floor) and the editor did
not (84rem floor).

### 3.2 The cost was measured, and the trade-off put back to the user with numbers

84rem was not an arbitrary number -- `docs/implementation/EDITOR_PAGE_AD_PLACEMENT.md` already
documented it as the point below which the rail comes straight out of the editing panes rather
than out of spare margin, with a 68px-per-pane cost measured at 1200px when it was tried at
75rem the first time. Reusing that math rather than re-deriving it, the actual cost of lowering
the floor again was presented before touching any code: panes go from 540px to 465px at 1200px,
505px at 1280px, unaffected from 1366px up. The user chose parity knowing this. **A cap cannot
rescue this band**: `body.has-ad-rail main:has(.editor-shell)`'s 72.75rem cap now applies from
75rem too, but in that band the page is viewport-bound well below 72.75rem regardless, so the
padding decides the width and the panes absorb it -- recorded explicitly so a future session
doesn't waste time trying to fix it with a `max-width` adjustment.

### 3.3 Verification surfaced an environmental problem, not a code problem

The suite failed four consecutive runs with navigation timeouts after this change. Rather than
accept that at face value, all 126 page/width combinations were reproduced in a separate,
independent harness -- every one settled cleanly in under 3 seconds -- isolating the cause to
the suite leaking its own `npx serve` child process on every run (`server.kill()` is
unreachable when a check throws), colliding with itself on a fixed port across repeated runs.
After clearing the accumulated stale servers: 840 passed, 0 failed.

## 4. Guides page: one unit instead of two, and the anchor it unlocked

`blog.html` previously ran a top leaderboard *and* the side rail simultaneously. Reworked to
exactly one persistent unit: the fixed rail from 75rem (matching the new sitewide floor), the
fixed bottom anchor below 48rem, nothing in between -- the same gap shape the homepage has
always had. Removing the top leaderboard is what made the anchor possible: it had drawn from
`leaderboard`/`leaderboardMobile`, the same zones the anchor uses, and serving one zone key
twice in a single page view was the documented reason an anchor had been kept off this page.
With the top unit gone, `js/blog.js` no longer mounts any ad on the index at all -- both
remaining placements are static markup mounted unconditionally by `js/ads.js`, independent of
the renderer.

## 5. Social bar: investigated, not modified

Reported as missing on `loading.html`. The script tag was confirmed present at its documented
location. A prior investigation (`docs/error-fixes/SOCIAL_BAR_NOT_DISPLAYING.md`) had already
verified the full delivery chain and concluded non-display is frequency capping plus the
widget's animated entrance losing the race against a page with a 10-second lifetime -- not a
code defect, and nothing here contradicted that. **One new risk flagged, not yet verified**:
the mobile anchor added in section 2.4 is `position: fixed; bottom: 0`, the same general
location Social Bar typically injects into. Whether they now collide on a real device has not
been checked -- headless Chrome cannot render the live widget.

## 6. Footer moved into the header mega-menu, sitewide

### 6.1 What was asked, and the two regressions the literal version would have shipped

The ask: put every page's footer links under the "More" dropdown the way the homepage already
does. Two consequences had to be handled rather than inherited from a literal footer deletion:

- The dropdown was `display: none` below 62rem, on the documented grounds that the footer
  covered those links on small screens. Deleting footers without changing that would have made
  `privacy.html` and `terms.html` **unreachable from any other page on a phone**. The control is
  now available at every width; below 62rem the panel restyles into a single stacked full-width
  column rather than disappearing.
- The four social links existed only in the footer. They are now a `.nav-more-social` row
  spanning the panel's full width beneath the link columns.

### 6.2 A self-introduced regression, caught by the suite it was written to protect

Adding a fifth control to `.site-nav` (previously four: wordmark, three nav links, theme
toggle) without wrapping broke the header at 320px: 372px of content in a 320px viewport,
taking the whole page into horizontal scroll and putting the theme toggle out of reach. This
broke ten checks across every page in the full suite (`@320: no horizontal page scroll` and
`@320: every menu-bar control reachable`) -- exactly the failure class that suite exists to
catch. Fixed with `flex-wrap: wrap` plus a narrow-screen gap/padding tier.

**Worth recording as a diagnostic lesson**: a `privacy.html` 320px overflow was initially
reported back as "pre-existing," on the reasoning that it measured identically with the
mega-menu panel open and closed. That reasoning was wrong -- it ruled out the *panel*, but said
nothing about the *button*, which sits in the header regardless of panel state. It was the same
regression, and the header fix resolved it. The correction was made explicitly rather than left
standing once the header fix's suite results made the mistake visible.

### 6.3 The generator, and a second piece of drift found while fixing the first

`buildPostPage()` in `js/admin.js` generated a `FOOTER` constant for exported post pages.
Replaced with a `MEGA_MENU` constant, wired into the generated `<nav>`. While doing this, found
the generator's `<nav>` had never carried a theme toggle at all -- a pre-existing drift from
every hand-written page, unrelated to today's work but fixed in the same pass since it was
touching the same lines.

### 6.4 Verification

Full suite: 879 passed, 0 failed (up from 703 at the start of the day, reflecting both new
checks added and the width-coverage extensions from section 3). A standalone targeted script
(14 checks) additionally confirmed: the panel's links are real anchors in the served markup
(hidden via the `hidden` attribute, not built in JavaScript, so crawlers see them) across six
sampled page types including a generated post page; the panel opens on-screen and hit-tests to
itself at three desktop widths; it is reachable with both legal links present at four mobile
widths down to 320px; and it stacks above the mobile ad anchor's z-index rather than behind it.

**Accepted cost, not overlooked**: the footer's links are still crawlable, but they now sit
inside a collapsed `[hidden]` element rather than visible page furniture, which may carry less
weight with a search engine. That trade was made explicitly for the requested consistency, not
assumed to be free.

## 7. Editor page furniture: breadcrumb and intro removed, h1 kept but hidden

Requested: remove the breadcrumb, heading and intro paragraph from all four editors, keeping
only the "Saves automatically" indicator. Implemented with one deliberate deviation from the
literal instruction: the `<h1>` was **not** deleted, only visually hidden (`class="sr-only"`,
the same technique already used for the homepage's search label). Deleting it outright would
have left all four editors -- which carry no `noindex` and are real indexed content -- with
zero `<h1>` elements, directly conflicting with CLAUDE.md's own Critical Rule requiring a
strict single-h1 hierarchy. This was flagged rather than silently either violating the rule or
silently overriding the instruction.

Verified with a targeted script that specifically distinguishes "present in the DOM at a 1x1px
clipped box" (the correct, intended state for `sr-only`) from "occupies real screen area" --
the first version of that check incorrectly flagged the correct implementation as a failure,
which was caught and fixed before trusting the result. Confirmed across all four editors: h1
text present but not visible on screen, breadcrumb and intro absent, save-state indicator
visible with correct text, and `<title>` tags unaffected (independent of the h1). Full suite
after this change: 879 passed, 0 failed, unchanged from before it.

## Verification Summary

| Check | Result |
|---|---|
| Full suite, after content-rail rollout | 703 passed, 0 failed |
| Full suite, after editor floor + loading.html work | 840 passed, 0 failed |
| Full suite, after footer-to-mega-menu | 879 passed, 0 failed |
| Full suite, after editor furniture cleanup | 879 passed, 0 failed |
| Targeted loading.html script | 31 passed, 0 failed |
| Targeted mega-menu script | 14 passed, 0 failed |
| Targeted editor-head script | 8 passed, 0 failed |
| JS syntax (`node --check`) | `ads.js`, `app.js`, `blog.js`, `admin.js` all clean |
| CSS brace balance | Checked after every edit throughout the day |

## Defects Found This Session

1. **`mountHosts()` queried a dead `[data-ad-sidebar]` hook** after blog.html's sidebar moved to
   the shared rail. Caught by the suite's own hook-existence check. Fixed.
2. **The suite's leaderboard-shown check didn't recognize `.ad-lead`**, blog/post's class for
   the same role `.editor-leaderboard` plays on editors -- silently read "not shown" regardless
   of actual state. Fixed, and led to correctly identifying blog/post as an intentional
   multi-unit exception to the "exactly one band" invariant.
3. **The suite leaked its own server process on every run**, colliding with itself on a fixed
   port across repeated invocations and producing navigation timeouts that looked like a code
   regression. Diagnosed by reproducing all 126 page/width combinations in an independent
   harness before concluding the suite itself was at fault.
4. **The mega-menu's fifth nav control broke the header at 320px** on every page (self-introduced,
   found by the full suite, fixed with `flex-wrap`).
5. **A `privacy.html` 320px overflow was misdiagnosed as pre-existing** before being correctly
   identified as the same regression as #4 and fixed by the same change. The incorrect
   diagnosis was corrected explicitly once evidence contradicted it, rather than left standing.

## Open Items

- **Social Bar / mobile anchor collision on `loading.html` is unverified.** Both are now
  bottom-of-viewport, phone-width elements; whether they visually conflict has not been checked
  on a real device with the ad blocker off.
- **`404.html` was not brought into the content-rail rollout.** It still shows the older
  always-on desktop anchor from the original site-wide anchor rollout. Noted as an explicit
  scope exclusion in `CONTENT_RAIL_ROLLOUT.md`, not an oversight, but worth revisiting for
  consistency.
- **The footer's SEO weight trade (section 6.4) has no data yet.** Whether burying the link
  columns inside a collapsed panel measurably affects internal-link equity is something Search
  Console data could eventually answer; nothing here does.
- **`tests/verify-layout.js`'s server-leak bug (defect #3) was diagnosed but not fixed.** The
  suite still leaks its `npx serve` child on a thrown check; wrapping the teardown so the
  server dies on the throw path as well as the success path was identified as the fix but is
  outside what was asked for today.

## Related Files

- `docs/implementation/CONTENT_RAIL_ROLLOUT.md` — sections 1, 3 and 4 of this report in full,
  including the fourth-pass addendum for the 75rem floor consolidation and the guides rework
- `docs/implementation/FOOTER_TO_MEGA_MENU.md` — section 6 of this report in full
- `docs/implementation/EDITOR_PAGE_AD_PLACEMENT.md` — the "Revised: the gate moved to 75rem"
  section, section 3 of this report
- `docs/error-fixes/SOCIAL_BAR_NOT_DISPLAYING.md` — the pre-existing diagnosis referenced in
  section 5
- `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` — all three re-synced and updated; they had drifted
  out of sync with each other before today
- `docs/memory/PROJECT_STATUS.md`, `PRD.md`, `docs/guides/RUNNING_THE_VERIFICATION_SUITE.md` —
  updated for the 75rem floor consolidation
- `site/css/style.css`, `site/js/ads.js`, `site/js/app.js`, `site/js/blog.js`,
  `site/js/admin.js` — every code change described above
- `tests/verify-layout.js` — extended for the editor rail floor, mega-menu, and 320px coverage;
  the server-leak defect (#3 above) is diagnosed here but not fixed
