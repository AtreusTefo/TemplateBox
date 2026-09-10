# Checks leaning on a wait nobody meant them to have, and a cleanup that never ran

Date: September 3, 2026
Updated: September 10, 2026 -- see section 5, which reverses section 1's "no production change"

## Summary

Removing the navigation wait on `readyState === "complete"` exposed three separate checks that had been relying on it, in three different ways, none of them a product defect. A fourth finding is recorded alongside them because it has the same shape seen from the other side: a cleanup that looked like it worked and had never once run.

The lesson for the first three is one lesson: **removing an over-broad wait does not break the pages, it exposes every check that was quietly leaning on it.** The lesson for the fourth is its mirror: **a fix inside a silent catch is indistinguishable from no fix at all.** Each section carries the measurement that settled it, because in every one of these cases the plausible reading and the true one differed.

Section 5 was added on September 10, 2026, when the placeholder from section 1 came back in two more checks at once. Its lesson is the one the first four kept circling without naming: **every settling signal here is an absence-of-change signal, and "nothing is happening" can never mean "everything has happened".** A page holding still on a placeholder is indistinguishable from a page that has finished, so the fix is a POSITIVE signal rather than a longer wait -- and it reverses section 1's decision to keep the fix out of production code, with the reasons recorded there.

## 1. The mockup background check sampled a loading placeholder

`tests/verify-layout.js` section 5, "mockup: that background reaches the photograph's
transparent surround", failed intermittently with
`before: "244,243,239,255"` where `"0,0,0,0"` was expected. The `after` value was exactly
right, so the feature under test worked perfectly and only the reading taken beforehand was
wrong. It did not reproduce on a pristine HEAD worktree run immediately afterwards, which is
the signature of a race rather than a defect.

### Root cause

`244,243,239` is `#F4F3EF`, the site's cream background token. `js/mockup.js` paints it across
the entire canvas as a **loading placeholder**:

```
if (assets.status !== "ready") {
    canvas.width = CANVAS_W;      // 1000
    canvas.height = CANVAS_H;     // 1000
    ctx.clearRect(...);
    ctx.fillStyle = "#F4F3EF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ...  "Loading mockup template..."
    return;
}
```

The check waited for the canvas's `aria-label` to start with `White T-Shirt on Model` and then
sampled pixel (2, 2). But the label is set from the template *config* — `config.label` at
`js/mockup.js:2967` — which is available the instant the preset is chosen, while the seven
bitmaps behind it are still being fetched and decoded. The base map alone is 1.997 MB. So the
label arrives, the check samples, and it reads the placeholder.

The two states are trivially distinguishable and the check was already asserting the
difference three lines later without realising it: the placeholder is **1000x1000**, and the
ready branch resizes the canvas to the base image's natural **1024x1536**. The sibling
assertion `native === "1024x1536"` passed in the same failing run, because `native` is read at
the end of the evaluate — after a 400 ms sleep — while `before` is read at the start.

**Why it appeared now.** Navigation stopped waiting for `readyState === "complete"` on
September 3, 2026 (commit `d1dba19`), because `complete` is the load event and waiting for it
meant waiting for unreachable ad iframes to time out. That wait had been *incidentally*
covering these image decodes: `js/mockup.js` starts them during load, and an image request
started before the load event delays it. Nothing in the editor regressed. The check simply
never had a wait of its own and had been living off one that was never meant for it.

That is the general shape worth remembering: **removing an over-broad wait does not break the
pages, it exposes every check that was quietly leaning on it.** The replacement quiescence poll
cannot cover this case either, and correctly so — its fingerprint is layout geometry, and a
canvas painting a placeholder is perfectly still.

### Fix applied

The wait in `tests/verify-layout.js` now requires the canvas to be at its native size as well
as correctly labelled:

```
if (label.indexOf('White T-Shirt on Model') === 0 &&
    canvas.width === 1024 && canvas.height === 1536) { break; }
```

15 seconds of budget at 100 ms intervals, and the elapsed wait is returned as `waitedMs` so a
future failure says whether the wait ran out instead of leaving the next person to guess.

No production change. The readiness signal already existed in the canvas's own dimensions, so
the check needs no cooperation from `js/mockup.js` — which matters, because a test hook added
to production code for a test's convenience is a liability the next refactor has to carry.

The drawn-product background check earlier in the same section was left alone deliberately. It
opens the default drawn t-shirt, which is composed from Canvas primitives with no external
maps, so `assets.status` is ready without a fetch; it has never failed, and its placeholder
size and its ready size are both 1000x1000, so a dimension poll could not tell them apart
anyway. If a drawn template ever gains an image map, this is the check that will start
flickering first.

### Evidence

`node tests/verify-layout.js`. The failing run was 1357 passed / 1 failed; the pristine HEAD
run alongside it passed the same check, which is what established this as intermittent.

Reproducing a race on demand is the hard part, so the window was measured directly rather than
by re-running until it failed: a probe navigates to `mockup.html` with the same preset, records
the moment the label appears together with the canvas size and corner pixel at that moment, and
then the moment the canvas reaches 1024x1536 with its corner pixel there. The gap between those
two timestamps is the window in which the old check could sample, and the corner value at the
first timestamp is what it would have read.

Four consecutive runs:

| Run | At the label | At readiness | Window |
| --- | --- | --- | --- |
| 1 | 29 ms, 1000x1000, `244,243,239,255` | 124 ms, 1024x1536, `0,0,0,0` | 95 ms |
| 2 | 45 ms, 1000x1000, `244,243,239,255` | 79 ms, 1024x1536, `0,0,0,0` | 34 ms |
| 3 | 53 ms, 1000x1000, `244,243,239,255` | 75 ms, 1024x1536, `0,0,0,0` | 22 ms |
| 4 | 40 ms, 1024x1536, `0,0,0,0` | 41 ms, 1024x1536, `0,0,0,0` | 1 ms |

Three of four runs had the placeholder on screen at the moment the old wait released, reading
the exact value the failure reported. Run 4 is the case that used to pass. The suite failed far
less often than three-in-four because it makes several DevTools round trips between releasing
the wait and sampling the corner, and those usually — not always — outlast the window. That
gap between "usually" and "always" is the whole bug, and it is why the fix polls for the state
rather than widening a sleep.

## 2. Section 4 compared a settled page against one still painting

Fixing the mockup check exposed a second instance of the identical pattern on the next run, and
it is worth recording together because the lesson is the same one.

Section 4 reported `resume @1600 panes: now [..., 535.6], HEAD [..., 788]` on a file nobody had
touched. `resume.html`'s preview pane grows to its 788px cap when the descriptor engine
finishes its first paint. That pane is far shorter than the 5300px editor pane beside it, so
**`main`'s height never moves while it grows** — and `main`'s height is what the generic
quiescence fingerprint watches. Every generic measure said the page was still while the exact
box the comparison reads was still growing.

Traced over three runs, sampling every 50 ms:

| Run | Generic fingerprint quiesced | Pane at that moment | Pane settled | Window |
| --- | --- | --- | --- | --- |
| 1 | 362 ms | **535.6** | 788 at 2579 ms | **2.2 s**, 33 non-final samples |
| 2 | 682 ms | 788 | 788 | none |
| 3 | 220 ms | 788 | 788 | none |

Run 1 is the reported failure exactly. Runs 2 and 3 are the case that passes.

The fix is `page.settled(expression, label)`: a comparison polls its **own** snapshot until
three identical consecutive readings, 8 seconds of budget, and section 4 uses it for both
sides. That is what `PROJECT_STATUS.md` prescribed in the first place — "poll for the specific
elements each comparison measures" — with the generic fingerprint as the cheap approximation
layered underneath, not a replacement for it.

It cannot mask a real change: a genuine layout difference is stable in both trees, so both
sides settle and the difference is still reported. What it removes is the case where one side
settles and the other is caught mid-paint. A snapshot that never settles prints one
`UNSETTLED` line and is compared anyway, so it stays visible rather than silently absorbed.

## 3. The readiness gate released before deferred scripts had run

The next run produced `exactly 1 ad band mounts: got 0 -- rail=false leaderboard=false
anchor=false` at **every one of the fifteen widths** of `resume.html` — the rail band, the
leaderboard band and the anchor band all absent, on a page whose markup and script tag were
correct and untouched. Fifteen failures on one page, and nothing wrong with the page.

The readiness gate had been changed to `document.readyState !== "loading"` on the stated
grounds that this "means the document is parsed and every deferred script has RUN". **That is
false.** The HTML specification's "stop parsing" algorithm sets the readiness to `"interactive"`
and only *then* executes the deferred scripts, firing `DOMContentLoaded` after them. So
`"interactive"` means the parser finished — not that the document is ready.

It only shows on a page that defers something slow. `resume.html` defers jsPDF from
`cdnjs.cloudflare.com`, and `js/ads.js` mounts every band from its `DOMContentLoaded` listener.
The connection degraded during this session — jsPDF measured at 6.7 s against a fetch that had
taken well under a second earlier — and the gate started releasing while the deferred script
was still in flight.

Both gates measured on `resume.html` with the HTTP cache disabled, recording how many
`.ad-slot` elements were mounted at the instant each released:

| Run | Old gate | New gate | Gap |
| --- | --- | --- | --- |
| 1 | 211 ms, **0 ad slots** | 2407 ms, **3 ad slots** | 2196 ms |
| 2 | 248 ms, 3 ad slots | 248 ms, 3 ad slots | 0 ms |
| 3 | 211 ms, 3 ad slots | 211 ms, 3 ad slots | 0 ms |
| 4 | 172 ms, 3 ad slots | 172 ms, 3 ad slots | 0 ms |

The fix is to ask for the event itself rather than a proxy for it:

```
domReady: (() => {
    const nav = performance.getEntriesByType('navigation')[0];
    return !!(nav && nav.domContentLoadedEventEnd > 0);
})()
```

`domContentLoadedEventEnd` stays 0 until the event's handlers have finished and is readable at
any time after, which is what makes it usable from a poll that may arrive late — an ordinary
`addEventListener` cannot answer "did this already happen?". It does **not** wait for the load
event, so the ad-iframe cost the whole change exists to avoid is still avoided.

Note what this failure was *not*: it was not a slow network breaking the site. A real visitor on
that connection sees the ads mount at 2.4 s, which is correct behaviour. The suite was reporting
zero because it looked too early, and it looked too early because a comment asserted something
about the spec that nobody had checked.

## 4. A cleanup that had never once worked, and looked like it had

Not a check this time, but the same failure mode one level down, and it belongs here because it
was found by the same habit of counting rather than assuming.

The tree-kill work added a `cleanTempDirs()` that removed each run's browser profile and
`git archive` extraction. It called `fs.rmSync(dir, { recursive: true, force: true,
maxRetries: 3 })` inside a `catch` that deliberately said nothing, on the reasoning that a
locked directory is not a test failure. It removed nothing, ever. `taskkill` returns once it
has **signalled** the tree, not once Windows has released the handles, and the profile stays
locked for around a second afterwards — so all three attempts landed inside that window and
the failure went into a silent catch. It surfaced only by listing the temp directory after a
green run: **87 accumulated `tb-verify-` and `tb-baseline-` folders**.

Adding `retryDelay: 500` is the obvious fix, reads correctly, and **also does not work.** Both
forms were measured against the suite's own sequence — spawn headless Chrome on a fresh
profile, `taskkill /T /F`, remove:

| Strategy | Removed | Time | Error |
| --- | --- | --- | --- |
| `{ maxRetries: 3 }` | no | 8 ms | `EPERM` |
| `{ maxRetries: 10, retryDelay: 500 }` | no | 8 ms | `EPERM` |
| manual loop, awaiting 250 ms between attempts | **yes** | 1079 ms | succeeded on attempt 2 |

Both `rmSync` forms returned in 8 ms, so no retry waited at all — whatever `retryDelay`
governs, it is not this `EPERM`. `cleanTempDirs()` is `async` now, loops with a real `await`
between attempts, and both call sites await it. It also **prints what it could not remove**:
a silent best-effort is indistinguishable from a broken one, which is exactly how two
successive versions of this passed for a fix.

The general point is the same as the three above, from the other direction. Those were checks
that looked like they were testing something and were not; this was a fix that looked like it
was working and was not. Neither is visible without going and counting the thing itself.

## 5. The same placeholder again, in two sections at once, and why the fix moved into production

Updated: September 10, 2026

Section 1 above fixed one check by waiting for the canvas to reach `1024x1536`. Seven days later
the identical placeholder took down two more, and the fix that worked for one check could not be
extended to either of them.

### Symptom

Three consecutive full runs on a byte-identical, clean working tree, with only a `git commit`
between them -- which changes no file content -- disagreed with each other:

| Run | Section 5 colourway | Section 4 parity |
| --- | --- | --- |
| 1 | passed | failed (a genuine extra catalog card) |
| 2 | **failed** `before: "244,243,239,255"` | passed |
| 3 | passed | **failed**, four mockup pane measurements |

Run 2's `before` is `#F4F3EF` -- the placeholder fill from section 1, read at pixel (650, 520)
this time instead of (2, 2). Run 3 reported `mockup @1366 panes: now [...,640], HEAD [...,788]`
on files that were identical on both servers.

Two symptoms, one cause, and which one appeared depended only on which section reached the page
while the photograph was still in flight.

### Root cause

`syncCanvasAspect()` publishes `--mockup-aspect` from whatever the canvas currently is, and CSS
bounds the preview pane's height from it. While the base photograph is loading the canvas is the
1000x1000 placeholder, so the aspect is published as `1` and the pane settles at 640 instead of
788.

The important part is not that the value is wrong. It is that the value is **stably** wrong:

| | healthy tree | base photograph absent |
| --- | --- | --- |
| `main` height | 812 | 716.8 |
| preview pane | 788 | **640** |
| canvas | 1024x1536 | 1000x1000 |
| `--mockup-aspect` | 0.667 | 1 |
| fabric pixel at (650, 520) | 244,244,249 | **244,243,239** |
| `settled()` returned after | 573 ms | **381 ms** |

Those are the two servers side by side, and the last row is the whole finding. Every settling
signal this suite has -- the QUIESCE fingerprint, and `settled()` on a comparison's own snapshot
-- is an **absence-of-change** signal. Three identical readings mean "nothing is happening". They
can never mean "everything has happened", and a page holding still on a placeholder is
indistinguishable from a page that has finished.

Timed directly, with a harness serving the real tree but delaying any `-base.png` by 1500 ms and
injecting a probe into the page so the measurement starts at the first frame rather than a round
trip later:

| Moment | `data-mockup-state` | Preview pane |
| --- | --- | --- |
| 0 ms | not yet set | -- |
| 31 ms | `loading` | **640** |
| 1564 ms | `ready` | **788** |

A 1.53-second window of perfect stillness at the wrong value. `settled()` needs three readings
100 ms apart, so it lands inside that window and returns 640 every time. Section 1's measurements
put the same window at 1-95 ms across four runs on a warm local server; it widens to whatever the network and the
machine are doing, which is why this surfaces under contention -- section 4 runs two servers and
two browsers at once.

### Fix applied

A **positive** signal, because no amount of waiting for stillness can produce one.

`site/js/mockup.js` publishes the asset state it already tracks onto the canvas wrapper:

```
function publishAssetState(state) {
    if (canvasWrap && canvasWrap.getAttribute("data-mockup-state") !== state) {
        canvasWrap.setAttribute("data-mockup-state", state);
    }
}
```

called from `drawPhoto()` with `assets.status`, so it tracks `loading`, `ready` and `error` on
every repaint including a template switch.

`tests/verify-layout.js` holds its navigation readiness poll while the attribute reads `loading`,
alongside the existing `adsReady` condition. That is one place, so **every** section that visits
`mockup.html` inherits it -- including section 5's colourway check, which had no wait of its own
at all, and section 4, which could not have had one.

The poll tests for "not loading" rather than for "ready" deliberately. An `error` is a real
defect and has to reach a check that can name it, rather than expiring as a 20-second navigation
timeout on every mockup page in the run. Section 5 now asserts the ready state outright, before
anything samples a pixel.

### This reverses section 1's "no production change", knowingly

Section 1 said, and was right to say:

> No production change. The readiness signal already existed in the canvas's own dimensions, so
> the check needs no cooperation from `js/mockup.js` -- which matters, because a test hook added
> to production code for a test's convenience is a liability the next refactor has to carry.

Three things changed:

1. **That signal was a per-template constant.** It is the literal `1024 && 1536` in the suite --
   the default template's dimensions. Section 4 measures this page at every width and would need
   a table of every template's natural size, which this repo has repeatedly found becomes a
   second source of truth and drifts.
2. **It cannot distinguish loading from failed.** Both leave the canvas at 1000x1000. Those are
   different facts -- one is a wait, the other is a defect -- and a check that conflates them
   reports a slow network as a broken template.
3. **The alternative coupling is not weaker, only quieter.** Polling for "not 1000x1000" depends
   on `CANVAS_W`/`CANVAS_H` just as much, without naming them, and breaks silently the day a base
   photograph happens to be 1000px wide.

An explicit named attribute is the honest version of a dependency that already existed. It is
still a cost, and it is recorded here as one.

The attribute is **not** an accessibility fix, though it sits next to a gap worth noting: the
canvas's `aria-label` names the product while the canvas reads "Loading mockup template...", so a
screen-reader user is told there is a t-shirt on screen before there is one. That was left alone.

### A mistake this fix made, worth more than the fix

The first attempt put backticks in a comment **inside the evaluated expression**, which is the
inside of a JavaScript template literal:

```
`!== "loading"` rather than `=== "ready"` on purpose.
```

Four backticks close and reopen the literal. The result was a chain of string comparisons --
entirely valid JavaScript evaluating to `false`. So:

- `node --check tests/verify-layout.js` **passed**.
- `Runtime.evaluate` returned `false` rather than throwing.
- The poll's `catch (e) { continue; }` never fired, because nothing threw.
- Every navigation in the suite polled for its full 20 seconds and the run died on the first page
  it tried -- `http://localhost:5099/ @1920`, the homepage, which had nothing to do with the
  change.

A syntax check proves a file parses, not that an expression means anything. The guard added
alongside the fix throws when the readiness expression returns a non-object, naming the cause
instead of costing a run and pointing at an innocent page.

The predicate is now verified by **execution** rather than inspection -- extracted from the suite
source and run against all four states:

| `data-mockup-state` | poll |
| --- | --- |
| absent (every non-mockup page) | releases |
| `loading` | **holds** |
| `ready` | releases |
| `error` | releases, so section 5 names it |

### Evidence

**Reproduced on demand, which is the part that was missing before.** A copy of the tree with the
default template's base photograph deleted, served beside an intact one, produced the failing
numbers deterministically -- 640 against 788 and `244,243,239` against `244,244,249`, with
`settled()` declaring the broken page settled in 381 ms. A second harness served the real tree
with any `-base.png` delayed 1500 ms, which is the honest version of the race: the file exists,
the page is up, and the photograph is genuinely in flight.

**The check can fail, verified by breaking the product.** With the base photograph removed from
the working tree, the run reported:

```
FAIL  mockup: the template's base photograph loaded before anything sampled it
      data-mockup-state was error
```

Fifteen other mockup checks failed alongside it -- colours, export sizes, saved mockups, the
print check, and 24 of section 4's measurements -- every one of them a downstream reading of the
same placeholder. The new check is the only one that names the cause. Nothing hung: the `error`
state released the navigation poll as designed, and the run finished in its normal time.

**The absent-attribute escape cannot misfire.** The predicate treats a missing attribute as
ready, which is what lets every non-mockup page through. On `mockup.html` the attribute is set at
roughly 48 ms (navigation-relative) while `domContentLoadedEventEnd` is 77.1 ms, and the poll
already requires the latter -- so the escape is unreachable there. `js/mockup.js` is a classic
script at the foot of `<body>`, which is why.

**Clean runs.** With the photograph restored: 1488 passed, 0 failed.

### What was deliberately left alone

The two existing `1024x1536` waits in section 5 stay. The navigation gate now guarantees the
template is painted before either of them runs, so both break out of their loop on the first
iteration -- they are redundant rather than wrong, and rewriting a passing check to use a new
mechanism buys nothing and risks something.

They are worth watching for one reason. In the deliberate-break run below, one of them reported
`waitedMs: 15000`: it spent its entire budget waiting for dimensions that were never coming and
then sampled the placeholder anyway. That is the failure mode of a wait with no way to say the
thing it waited for is not going to happen, and it is what the new check replaces -- one
evaluate, one named answer.

## Troubleshooting

**The check fails with `waitedMs: 15000`.** The wait ran out, which is a different fault from
the one this document describes: the assets genuinely did not load. Check that all seven maps
for `tshirt-model-white` are present under
`site/assets/mockups/apparel/t-shirts/tshirt-model-white/` and that the local server is serving
them — a 404 leaves `assets.status` at `error`, which paints the same cream placeholder with
"This mockup template could not be loaded." instead of "Loading mockup template...".

**A different section starts failing on a first reading after a navigation.** Suspect the same
cause before suspecting the page. Anything that measures a canvas, an image, or a
JavaScript-rendered region needs a wait for the thing it measures; `readyState` no longer
provides one, and layout quiescence does not see inside a canvas.

**A page reports zero ad bands at every width.** Check whether it defers a third-party script.
`readyState` and even a `DOMContentLoaded` listener attached after the fact will not tell you
whether the event has already fired; `performance.getEntriesByType('navigation')[0]
.domContentLoadedEventEnd` will. Before assuming the ad wiring broke, confirm against the
static check in section 1, which reads the markup and cannot be affected by timing at all: if
that passes and the browser reports zero, the fault is in when you looked.

**Everything is slow and several sections wobble at once.** Measure the third-party hosts
before blaming the suite. `curl -o /dev/null -w "%{http_code} %{time_total}s"` against
`fonts.googleapis.com` and `cdnjs.cloudflare.com` took 0.6 s early in this session and 3.2 s
and 6.7 s later the same day, which is what turned finding 3 from latent into reproducible.

## Related Files

- `tests/verify-layout.js` — the readiness gate and `quiesce` in `connect()`, the `settled`
  helper, section 4's comparison, and section 5's model-photograph background check
- `site/js/mockup.js` — the not-ready branch and the label; CHANGED on September 10, 2026, which reverses this document's own section 1: `publishAssetState()` writes `data-mockup-state` (`loading` / `ready` / `error`) onto `.mockup-canvas-wrap` from `drawPhoto()`, and `syncCanvasAspect()` is why the pane height follows it
- `site/resume.html` — the deferred jsPDF tag that exposed finding 3; unchanged
- `site/js/ads.js` — mounts every band from its `DOMContentLoaded` listener; unchanged
- `docs/memory/PROJECT_STATUS.md` — the two Open Items this closes
