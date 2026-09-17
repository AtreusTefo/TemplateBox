# Installable App (Tier 0 PWA)

Date: September 16, 2026

## Summary

TemplateBox is installable. On Android and desktop Chrome the browser offers
"Install"; on iOS, Add to Home Screen produces the same thing. The installed
app opens full screen with no address bar, carries the isometric box mark as
its icon, and is **the live site** rather than a copy of it. A deploy to
Netlify reaches every installed device on the next launch, because there is no
second copy of anything to keep in step.

It is deliberately **not** offline-capable. A page that renders with no network
makes no ad call, and advertising is what pays for this site; the only thing
stored on the device is a notice saying the connection is down.

## Why this tier, and what it is not

Three routes to "an app" were considered. This is the first of them and the
only one that needs no second codebase:

| | Where the code lives | How updates reach it | Cost |
| --- | --- | --- | --- |
| Tier 0: PWA (this) | templatebox.win | Instantly. Same URL. | About a day |
| Tier 1: Android TWA on Play | templatebox.win, in a Play wrapper | Instantly. The app holds no copy. | $25, plus policy risk |
| Tier 2: iOS native | A bundled copy | A review cycle per release | $99/yr, plus a real shell codebase |

Tier 0 is the only tier where keeping the app and the website in sync is not a
task but a consequence of there being one thing instead of two. Both later
tiers reintroduce the problem in some form, and Tier 1 additionally puts the
10-second interstitial in front of Google Play's disruptive-ads policy and in
front of whatever Adsterra's terms say about in-app traffic. Neither question
is answered yet; neither has to be for this tier.

## Files

| File | Role |
| --- | --- |
| `site/manifest.webmanifest` | Name, icons, colours, scope, shortcuts. This is what makes the site installable. |
| `site/sw.js` | Pass-through service worker. Without it Chrome will not offer the install at all; serves `offline.html` when a navigation cannot reach the network. |
| `site/offline.html` | Self-contained offline notice. References no other file, by contract. |
| `site/assets/icon-{192,512,180}.png`, `icon-maskable-512.png` | Rendered from `assets/logo-mark.svg` by `tools/make-app-icons.js`. |
| `tools/make-app-icons.js` | Renders the four icons from the one SVG. Run from the repository root. |
| `js/app.js` | `initInstallSupport()` registers the worker and asks for persistent storage; `syncThemeColor()` keeps the status-bar tint honest. |
| `js/admin.js` | `buildPostPage()` emits the same head block, so an exported post is installable too. |
| `netlify.toml` | Manifest content type, `sw.js` cache headers, `offline.html` noindex. |

Every page except `admin.html` (private) and `offline.html` (references
nothing) carries the head block, inserted after the favicon link.

## The service worker caches almost nothing, and that is the design

`sw.js` handles navigations only. Everything else -- stylesheets, scripts,
images, ad iframes, fonts, XHR -- is passed back to the browser by not calling
`respondWith` at all, so the worker is not in the path.

Two reasons it exists:

1. **Chrome will not offer the install at all** for a site whose worker has no
   fetch handler. Without it the manifest produces a bookmark with an icon and
   nothing more. (iOS ignores service workers for Add to Home Screen, so this
   file is not what makes it work there.) "Offer" means a MENU ENTRY, not a
   popup -- current Chrome shows no automatic banner. Read the install section
   under Verification before chasing a prompt that was never going to appear.
2. **A navigation that cannot reach the network should land on `offline.html`**
   rather than the browser's error screen, so an installed app with no signal
   reads as "no connection" rather than "this app crashed and took my
   documents with it".

### Why not cache the site's own CSS and JS

Caching them would **not** cost impressions. An impression is counted when the
ad network's script makes its own request to its own server, and that happens
whenever the page runs, regardless of where the page markup came from. The
argument against it is different, and it is about this project specifically:

**TemplateBox has no build step.** Nothing stamps a hash onto `css/style.css`
or `js/poster.js`, and nothing would bump `CACHE` in `sw.js` on deploy. A
cached editor script therefore goes stale the moment it is fixed and stays
stale until someone remembers a manual step -- forever, on every deploy. The
failure mode is a bug report that cannot be reproduced because the maintainer's
own copy is fresh.

Netlify already serves these files with validators and the browser already
revalidates them. That is the same speed win with none of the discipline.

`offline.html` is the one cached file and the one acceptable exception, because
it has no content that can go out of date: no ad hosts, no editor code, no
catalog, no prices. If that stops being true, `CACHE` needs a version bump.

**Never cache `js/ads.js` or `loading.html`.** Beyond staleness, a cached ad
script makes a dead zone and a stale copy indistinguishable from one another,
which turns the next zero-impressions morning into guesswork. That bug has cost
this project three days once already.

## offline.html references nothing, and must not start to

This is the contract, and it is the thing most likely to be broken by a
well-meaning tidy-up. When the page is served there is no network, so a `<link>`
to `css/style.css`, a Google Fonts stylesheet, an `<img>` for the mark or any
`<script src>` comes back empty and the page renders as unstyled
black-on-white -- which looks **more** broken than the browser's own error
screen and so defeats the only reason the page exists.

Hence: styling inline, the mark as an inline `<svg>`, the system font stack
rather than Inter, no `js/ads.js`, no `js/app.js`, no manifest link and no
favicon link. Every one of those is a deliberate omission.

**You cannot see this failure by loading the page.** You have to be offline.
The suite checks it instead (section 1n).

It also carries no advertising, and that costs nothing: a visitor with no
network cannot complete an ad call anyway.

The page's most important line is not its heading. It is *"Your saved work is
still on this device."* Someone who taps the icon on a train and sees a crash
screen assumes their half-finished resume is gone. That sentence is the
difference between "the internet is down" and "this app lost my work".

## Shortcuts route through the interstitial

The manifest declares four shortcuts -- the long-press menu on an installed
icon. Every one of them points at `/loading.html?target=<editor>`, never at the
editor directly.

This is the revenue-critical detail of the whole tier. A shortcut is an
ordinary URL, so one pointed at `/resume.html` would send every installed
visitor into the editor without passing the interstitial, silently removing
monetization from the launch path that installed users are **most** likely to
take. Nothing about that is visible on the web, and no amount of testing in a
browser tab would surface it.

The suite asserts both halves: that every shortcut goes through
`loading.html`, and that each `target=` names a key that actually exists in
`EDITOR_ROUTES`.

## Persistent storage is requested, but not on every visit

Every document on this site lives in `localStorage` and nowhere else, in a
bucket the browser may clear under space pressure. There is no server copy to
restore from: losing it is losing the document. `navigator.storage.persist()`
asks the browser not to do that.

It is **not** requested on first load. Firefox shows a permission prompt for
it, and putting a storage dialog in front of a first-time visitor who has not
typed anything is the worst possible moment to ask -- there is nothing to
protect, so the request is unexplained, and a "no" is remembered.

`requestPersistentStorage()` asks only when the answer has a reason the visitor
could infer:

- they have installed the app (`display-mode: standalone`, or
  `navigator.standalone` on iOS), or
- they have saved work on this device (`describeSavedWork().length > 0`).

Chrome grants or refuses silently on its own heuristics, where an installed app
is already the strongest signal.

**This does not solve the iOS drawer problem.** On iOS the installed app and
Safari keep separate storage, so work saved in the browser does not appear in
the app. Nothing technical fixes that. The fix is export/import, which is a
separate task and is deliberately not folded in here -- see "Not included"
below.

## Registration is deferred past window load

On an ad-funded site this matters. Registration competes for the same
connection as `js/ads.js` and the ad network's own scripts, and the worker has
nothing to contribute to the first paint: it cannot serve the page that
registered it, and it is not needed until the next navigation. There is no
reason for it to be in the way of an impression.

It is also guarded on protocol. `file://` has an opaque origin and cannot
register a worker, and `site/tools/` pages are opened from disk deliberately
(see `tools/make-og-cards.js`), so excluding by protocol keeps those runs from
logging a failure every time.

## theme-color

Only visible once installed: it tints the Android status bar, the task
switcher card and the desktop PWA title bar. In a tab it does nothing, which is
why the site has never carried it before.

Each page ships **two** media-scoped tags so the colour is right before any
script runs, for the visitor who has not overridden their system theme.
`syncThemeColor()` in `js/app.js` exists for the one who has: `data-theme` is
the truth and `prefers-color-scheme` is only a default, so a visitor reading
light on a dark machine would otherwise get a near-black status bar over a
cream page.

It writes the same value into **every** `theme-color` tag rather than removing
the media attributes. A browser picks the first tag whose media query matches,
so making them all agree is correct whichever one that turns out to be and does
not depend on their order.

The hexes are `--l-bg` and `--d-bg` from `css/style.css`, duplicated into 26
page heads and once more into `app.js`. The suite checks all of them against
the stylesheet, because nothing else would move them when the palette does.

## Icons

`tools/make-app-icons.js` reads `site/assets/logo-mark.svg` and renders four
PNGs by driving a browser over the DevTools Protocol -- the same approach, for
the same reason, as `tools/make-og-cards.js`. The mark has one definition; a
change to it propagates by re-running the tool rather than by remembering to
re-export four bitmaps.

```bash
node tools/make-app-icons.js
```

Regenerate the whole set, never one size. Output is deterministic given the
tool plus the browser, so a size you did not intend to touch coming back
changed means the browser moved underneath you and all four should be committed
together. The tool prints the browser build for exactly that reason.

The maskable icon is a **separate file** with the mark at 46% rather than 62%,
not the plain icon with a `purpose` string added. A maskable icon is cropped by
the launcher -- a circle on most Android skins -- and only the central 80% is
guaranteed to survive; artwork drawn edge to edge gets clipped. The suite
checks the two are distinct files.

The ground is opaque cream on purpose. A transparent icon renders black on
black under a maskable crop, and iOS composites it onto white regardless.

## Verification

Static checks live in section 1n of `tests/verify-layout.js` (19 assertions).
All twelve deliberate breakages below were confirmed to fail the suite before
this was considered done:

- a shortcut pointed straight at the editor, bypassing `loading.html`
- a shortcut naming an editor target that does not exist
- an icon declared at a size the file is not
- the plain 512 relabelled maskable instead of using the padded file
- the manifest palette drifting from `--l-bg`
- `offline.html` "tidied" onto the shared stylesheet
- `sw.js` precaching the stylesheet and the ad script
- `sw.js` routing every subresource through the worker
- a new page shipped without the install head block
- a theme-color hex drifting from the palette
- `js/app.js`'s `THEME_COLORS` drifting from the stylesheet
- `admin.html`'s generated post head losing the block

The offline path itself is **not** covered by the suite. It was verified twice,
and the second time is the one that counts: **on a Samsung Galaxy A16 with
airplane mode on, September 17, 2026** -- the installed app opened to the
offline card rather than to Chrome's error page. A radio that is actually off
is not something emulation can stand in for, and given that the first emulated
attempt passed while proving nothing (see the CDP trap below), a real device
was the only way to retire the doubt.

Before that it was verified by driving headless Chrome with
`Network.emulateNetworkConditions`,
including a negative control (with the worker unregistered, the same navigation
must produce the browser's own error page, or the test proves nothing).

One trap worth recording, because the first run of that test passed while
proving nothing: **a service worker is its own CDP target.** Network conditions
set on the page session do not reach it, so the worker's `fetch()` goes out
over the real network while the page believes it is offline, and the real page
renders. The emulation has to be applied to the attached `service_worker`
session as well, with the HTTP cache disabled on both.

What was confirmed by hand: the notice renders correctly in both themes at
375px, the address bar stays on the page the visitor asked for (so "Try again"
retries their destination rather than the homepage), a 404 still returns
`404.html` rather than the offline notice, and the cache holds exactly one
entry.

### Installed on real hardware, and THERE IS NO PROMPT TO WAIT FOR

Confirmed September 17, 2026 on a Samsung Galaxy A16, Chrome for Android,
installed from the browser menu. That closes the one item this document
previously listed as unverifiable without a device.

**Current Chrome does not show an automatic install banner**, and expecting one
sends you looking for a symptom that does not exist. Installing is a menu
action:

| Browser | Where |
| --- | --- |
| Chrome (Android) | the browser menu, "Install app" or "Add to Home screen" |
| Samsung Internet | menu, "Add page to" then "Home screen" -- never prompts |
| Chrome (desktop) | install icon at the right of the address bar |
| Safari (iOS) | Share, then "Add to Home Screen" -- Apple has never supported prompts |

This matters because the A16, like every Samsung handset, ships with **Samsung
Internet as the default browser**, so the first browser a tester reaches for is
the one that definitely never prompts.

Confirmed on the same device once installed: the icon is the box mark rather
than a screenshot of the page, the app opens full screen with no address bar,
and **the long-press shortcuts land on `loading.html` rather than jumping
straight into an editor.**

That last one deserves its own line, because **no amount of suite coverage
could have caught it.** Manifest shortcuts do not exist until the app is
installed, so they cannot be exercised by a browser driven against the served
site -- section 1n can only assert that the shortcut URLs in the manifest point
at `loading.html`, never that the launcher honours them. It is the one decision
in this whole feature with revenue attached and the one that had to be checked
by a person long-pressing an icon.

Worth recording that the sentence this replaces called it "the install prompt"
and listed it as the last unverified item. Both halves were misleading: the
absence of a prompt is normal, and the feature was working the whole time.

Do NOT treat `beforeinstallprompt` not firing as evidence of anything. It was
tested here and did not fire, on a site that installs correctly -- automated
browsers suppress it, and it fires early enough that a listener attached after
load misses it. What IS worth checking, because these genuinely block an offer:
`prefer_related_applications`, `related_applications`, a `start_url` outside
`scope`, an icon that 404s or decodes at a size other than the one declared,
and a worker with no fetch handler. All five were checked against production
and are clean.

## Not included, deliberately

**Export and import of saved work.** A backup button on its own solves nothing
-- a file you can download but not load back is a comfort blanket, and the
value is entirely in the restore. Restore means taking a file off the visitor's
disk and writing it into the place the editors read from, skipping every check
the editors apply to typed input, so it has to be treated as untrusted and
re-validated on the way in, the way the invoice logo already is
(`docs/memory/PROJECT_STATUS.md`, logo-invoice). That is real work and should
not be estimated as "add a download button".

It is the only thing that fixes the iOS separate-storage problem and the only
way to move work between devices. When it is built, the homepage's
continuation strip is where it belongs: it already appears exactly when there
is saved work, and it already sits next to "Start fresh", which is the moment a
visitor most wants an undo. Note that the strip describes only the single most
recent document, so the control should read "Back up my work" rather than "Back
up this document" -- it saves all four editors at once.

**Offline capability**, for the reason at the top of this document.

**A Play Store listing (Tier 1).** Two questions have to be answered first, and
either can sink it: whether Adsterra's terms permit in-app WebView traffic (if
they classify it as invalid, the app has no revenue model and the web account
that funds everything is at risk), and whether a mandatory 10-second
interstitial survives Google Play's disruptive-ads policy. Both are business
questions, not engineering ones.
