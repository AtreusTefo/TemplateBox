# search.html Was Measured Before Its Catalog Arrived

Date: September 17, 2026

## The symptom

Section 4 of `tests/verify-layout.js` compares the working tree against a
checkout of HEAD. Twice it reported differences on `search.html` at 1336px, on
a file neither tree had touched:

```
search @1336 scrollWidth: now 1321, HEAD 1336
search @1336 clientWidth: now 1321, HEAD 1336
search @1336 main:        now [84.5,85,1152,2179.3], HEAD [92,85,1152,201]
search @1336 header:      now [0,0,1321,85],         HEAD [0,0,1336,85]
search @1336 firstCard:   now [0,0,0,0],             HEAD null
```

It did not reproduce on a re-run either time, and was written off as flake
twice. It is not flake.

Read the numbers: `main` is 2179px on one side and 201px on the other, and
`firstCard` exists on one side and is absent on the other. One tree rendered
the catalog and the other did not. The 15px `scrollWidth` difference is just
the scrollbar the tall page grows.

## Root cause

`search.html` is empty for the first fraction of a second of its life.

`loadCatalog()` in `js/search.js` fetches the whole of `index.html` (118KB),
parses it with `DOMParser`, and imports 53 `.template-card` nodes. Until that
finishes the page is interactive, not busy, and not broken -- it is stably,
convincingly **wrong**.

Both of the suite's readiness mechanisms are stillness polls:

| Mechanism | Requires |
| --- | --- |
| `quiesce()` | 3 identical `QUIESCE` fingerprints, 100ms apart -- ~300ms |
| `settled()` | 2 identical snapshots, 100ms apart -- ~200ms |

Neither can tell "has not started" from "has finished". The suite's own
comment on `mockupReady` had already said so, about a different page: *"three
identical fingerprints mean 'nothing is happening', never 'everything has
happened'."*

### Measured

Loading `search.html` repeatedly and timing from "interactive" to "cards
present":

| Round | Empty window |
| --- | --- |
| 1, cold server | **510ms** |
| 3 | 123ms |
| 4 | 117ms |
| 5 | 147ms |
| 6 | 141ms |

So on a **cold** server the empty state outlasts both polls and is measured as
final. On a warm one the cards arrive at ~120-150ms, just inside the 200ms
window, and the page is measured correctly.

### Why it was asymmetric, and therefore not random

Section 4 measures the working tree and HEAD with the same browser but against
**two different servers**, and it **starts the baseline server itself** for
that section:

- the working-tree server has been serving the whole run -- warm, ~120ms,
  measured populated
- the baseline server is seconds old -- cold, ~510ms, measured empty

That is the whole bug. The two sides were never compared in the same state.

It surfaced in this session specifically because a browser was being driven
alongside the suite, and the contention pushed even warm loads toward the
200ms edge. `CLAUDE.md` already warns that a polling loop can cause the
failure it is waiting to observe; this is the same hazard from the other
direction.

## Fix applied

A positive readiness signal, which is the only thing that can distinguish the
two states -- and the pattern this suite already uses for the mockup canvas.

**`site/js/search.js`** sets `data-search-state` on `[data-search-page]`:

| Value | When |
| --- | --- |
| `loading` | first line of `init()` |
| `ready` | last line of `init()`, **after** `apply()` has rendered |
| `error` | in `fail()`, when the catalog fetch throws |

`ready` is set last on purpose. Set any earlier and the signal fires on a page
that is still empty, which is precisely the failure it exists to prevent.

**`tests/verify-layout.js`** gates navigation on it, alongside `mockupReady`:

```js
searchReady: (() => {
    const page = document.querySelector('[data-search-page]');
    return !page || page.getAttribute('data-search-state') !== 'loading';
})()
```

It waits for **not-loading** rather than for ready, for the reason
`mockupReady` already documents: a page whose fetch genuinely failed must
reach the checks that can name it, rather than expiring as a 20-second
navigation timeout on every visit to it.

### Verified

Re-running the timing harness with the gate in place, the gate opened at
730ms, 223ms, 194ms, 188ms, 170ms and 198ms -- in every round, **exactly when
the cards landed**, including the cold 730ms one.

## The check that guards the pairing, and three ways it was wrong first

Section 1p asserts that each attribute a shipped file sets is the one the poll
reads. It earns its place because the failure is silent and in the worst
direction: `getAttribute` returns `null` for an attribute that no longer
exists, `null` is not `'loading'`, so a renamed attribute makes the gate pass
**instantly, on every page** -- restoring this bug while looking like nothing.

Getting that check right took four attempts, and the first three failed the
same way: **the check kept matching itself.**

1. It searched all of `__filename` for the gate name followed by the attribute
   name. Its own lookup table contains both, adjacent, so the table matched
   instead of the gate.
2. Scoped by slicing from `path: location.pathname`. That string appears in
   the check's own code, earlier in the file than the poll, so `indexOf` found
   the check and sliced 62 characters of itself.
3. Re-anchored on `const attemptNavigate`, with a comment asserting the anchor
   "is not quotable from here" -- in a comment that quoted it. `indexOf` found
   the comment.

The fix was to stop parsing source entirely. The readiness expression is now
`READINESS`, a module-level constant beside `QUIESCE` and `PARITY_SNAPSHOT`,
taking `adsBlocked` because section 4 blocks `js/ads.js`. The check reads the
same value the poll evaluates, so there is nothing to anchor and nothing to
match by accident.

A fourth attempt was still too loose. It tested whether the attribute name
appeared near the gate, and the `mockupReady` gate names it **twice** -- in
`querySelector('[data-mockup-state]')` and in `getAttribute('...')`. Renaming
only the read left the selector's copy behind and the check passed. It asserts
`getAttribute('<attr>')` now: the gate is only correct if it READS the
attribute.

Four deliberate breakages, all caught:

| Broken on purpose | |
| --- | --- |
| `search.js` renames its attribute | caught |
| the `searchReady` gate stops reading it | caught |
| `mockup.js` renames its attribute | caught |
| the `mockupReady` gate stops reading it | caught |

## The general lesson

Two, and the second is the one that cost the time.

**A stillness poll cannot supply a positive signal.** Any page that populates
asynchronously needs one, and this is now the second page in this project to
prove it. If a third appears, give it a `data-*-state` attribute before
waiting for the suite to go intermittent.

**A check that reads its own source can satisfy itself.** It does not fail
loudly when it does -- it reports green. If a check must inspect the suite,
inspect a value the suite exports, never its text.

## Related files

- `site/js/search.js` -- `setState()`, and the three call sites
- `tests/verify-layout.js` -- `READINESS`, the `searchReady` gate, section 1p
- `site/js/mockup.js` -- `data-mockup-state`, the precedent this follows
