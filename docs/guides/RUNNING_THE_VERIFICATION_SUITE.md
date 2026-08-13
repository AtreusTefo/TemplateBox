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
| Every selector hook `js/app.js` and `js/ads.js` look up exists in the served markup | Renaming a `data-` attribute or class on one side kills a feature with no error at all |
| The homepage rail's `display: none` gate is declared after the shared rule | Media queries carry no specificity; written above the shared rule the gate loses and the rail shows on viewports it must skip |
| `loading.html`'s inline route whitelist matches `EDITOR_ROUTES` | The two copies drifting sends the fallback path to the wrong editor |

### 2. Layout (5 pages x 10 widths)

Widths are 1920, 1600, 1488, 1440, 1366, 1344, 1200, 1024, 768 and 320 — including 1344 and
1488, which are the 93rem stack gate and (with 1199/1200) the 75rem rail floor shared by the homepage and, since August 13, 2026, the editors.

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

### 3. Launch flow

A plain click routes the foreground tab to `loading.html?target=...`; ctrl-click and
middle-click each open that same interstitial in a new tab with the opener unmoved.

**These must use `Input.dispatchMouseEvent`, not a synthetic `MouseEvent`.** A synthetic event
is not a user activation, so the `window.open` in `bindLaunchControls` is popup-blocked and
the modified-click checks fail against perfectly working code. This produced two false
failures during development before the cause was found. The same trap applies to anything
gated on user activation — clipboard writes, fullscreen, file pickers, autoplay with sound.

### 4. Ads blocked, compared against the last commit

The rail, the anchors and the leaderboard all reserve space only once a banner has actually
filled. That promise is only worth something if a blocked script leaves the page measurably
untouched, so this extracts `git archive HEAD` to a temporary directory, serves it alongside
on port 5098, blocks `js/ads.js` in both, and compares geometry at every page and width.

Any difference is reported per property. **A difference here is not automatically a bug** — if
you deliberately changed a layout, the working tree is supposed to differ from HEAD. Read the
reported values before acting: this check is asking "did an ad-related change leak into the
no-ads layout?", and the answer is only meaningful when you know what you changed.

Skip it with `--no-baseline` when you already know the layout moved.

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
