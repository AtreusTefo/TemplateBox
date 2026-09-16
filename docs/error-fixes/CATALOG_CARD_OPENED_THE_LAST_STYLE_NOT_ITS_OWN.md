# A catalog card that opened whatever you built last, not the thing on the card

Date: September 10, 2026
Status: Fixed

## Issue

Clicking **Framed Photo Poster** on the homepage opened the poster editor showing
the **Search Screen, Six Photos** layout -- a phone search-results page, from a
card whose title says "framed photo" and whose thumbnail is a photograph in a
black frame.

Reported as "why does clicking framed photo poster redirect me to search screen".

## Root cause

Three of the nine poster cards carried no `data-doc` attribute:

| card | `data-doc` |
| --- | --- |
| Framed Photo Poster | absent |
| Matte Wood Canvas | absent |
| Polished Gold Frame | absent |
| the four suits, the split, the search screen | present |

`bindLaunchControls()` in `js/app.js` writes the preset only when there is one:

```js
const preset = el.getAttribute("data-doc");
if (preset) {
    storageSet(PRESET_KEY, preset);
}
```

So those three clicks hand over nothing. `poster.html` then reaches
`TB.takePreset()`, gets an empty string, and keeps the style `migrate()` already
restored from `tb_poster_v1` -- which is whatever the visitor last built.

Reproduced rather than inferred. Clicking the card lands on
`loading.html?target=poster` with:

```
tb_editor_preset        null
tb_poster_v1.frame      "browser"
```

Nothing was written, so nothing could be applied.

## Why it was like that, and why that stopped being defensible

This was deliberate. `js/admin.js` said so:

> The three above carry null because they open the editor on whatever it last
> held.

That is a reasonable reading of "continue where you left off", and it cost
nothing while the poster editor had four near-identical frame styles: black,
wood, gold and none differ by a border colour, and the difference between them
was one control away.

It stopped being defensible when the editor grew to ten styles of which three
are whole LAYOUTS -- the playing card, the diagonal split and the search screen.
"Opens on the last style" and "opens on a different template entirely" are the
same sentence in code and completely different experiences. A card advertises a
specific thing in its title and its picture; opening something else reads as the
link being broken.

Continuity is not lost by fixing this: the homepage's own
continue-where-you-left-off strip is what serves that, and it reads the same
storage key.

## Fix applied

Three attributes, one table, one comment corrected.

**`site/index.html`** -- the three cards name their style:

```html
<a class="card-link" href="poster.html" data-target="poster"
   data-doc="framed-photo-poster">Framed Photo Poster</a>
```

**`site/js/poster.js`** -- a table resolving those ids to styles:

```js
const PRESET_ALIASES = {
    "framed-photo-poster": "black",
    "matte-wood-canvas": "wood",
    "polished-gold-frame": "gold"
};
```

**`site/js/admin.js`** -- the three `CATALOG_ITEMS` entries carry `doc` instead
of `null`, and the comment that recorded the old behaviour is replaced by one
recording this.

### Why the ids were not simply renamed to the style keys

The tidier-looking fix is `data-doc="black"` with no table at all. Two things
stop it.

`tests/verify-layout.js` keys each homepage card by `card.doc || slugish(title)`
and requires that key to be an `id` in `CATALOG_ITEMS`, so the doc value and the
id have to match -- which is why `hearts` needs no translation: someone chose
the catalog id to BE the style key when that card was added.

And the id is a FILE NAME. `js/admin.js` builds thumbnail paths as
`folder + "/" + id + "-thumb-blank." + ext`, and
`framed-photo-poster-thumb-blank.webp` ships on disk today. Renaming the id to
`black` renames that asset to `black-thumb-blank.webp`, which identifies nothing
in a downloads folder or a devtools waterfall -- the same argument CLAUDE.md
already makes for the mockup asset names.

So the ids stay, and the two namespaces are bridged in one place with the reason
written next to it.

## A mistake made while fixing it

The first version read the preset twice:

```js
const framePreset = PRESET_ALIASES[TB.takePreset()] || TB.takePreset();
```

`takePreset()` REMOVES the key as it reads it. The second call returns an empty
string, so for any card without an alias -- every suit, the split, the search
screen -- this evaluates to `undefined || ""` and no preset applies at all. It
would have turned a fix for three cards into a regression for six.

Caught before it ran, but it is worth recording as a shape: a function whose
name says `take` is a mutation, and calling it inside an expression that reads
it twice is a bug that looks like a default.

## Testing steps

Set the editor to one layout, arrive from a card advertising another, and check
which one opens. The saved style was `browser` before every one of these:

| arrived from | style applied | label shown |
| --- | --- | --- |
| `framed-photo-poster` | `black` | Solid Black |
| `matte-wood-canvas` | `wood` | Matte Wood |
| `polished-gold-frame` | `gold` | Polished Gold |
| `hearts` | `hearts` | Queen and King of Hearts |
| `browser` | `browser` | Search Screen, Six Photos |
| `split` | `split` | Queen and King, Two Photos |

The last three are the regression check on the alias lookup: a value that is
already a style key must pass through untouched.

`node tests/verify-layout.js` -- the catalog cross-check in section 1 is the one
that would catch a `data-doc` whose id does not exist in `CATALOG_ITEMS`.

## Troubleshooting

**A catalog card opens the wrong template.** Check `data-doc` on its
`.card-link` first: absent means the editor keeps whatever it last held, which
looks like a redirect and is not one. Then check that the value resolves --
either it is a `FRAME_STYLES` key or `PRESET_ALIASES` maps it to one.

**A card opens the right template but the suite fails section 1.** The
`data-doc` value and the `CATALOG_ITEMS` id must be the same string. The card is
keyed by its doc when it has one, and by a slug of its title when it does not.

**A preset seems to apply only sometimes.** `TB.takePreset()` consumes the
value. Anything that reads it twice gets the second answer.

## Related Files

- `site/index.html` -- the nine poster cards
- `site/js/poster.js` -- `PRESET_ALIASES` and the hand-off at the foot of the file
- `site/js/app.js` -- `bindLaunchControls()`, which writes the preset only when
  the card names one; unchanged
- `site/js/admin.js` -- `CATALOG_ITEMS`, whose ids double as thumbnail file names
- `tests/verify-layout.js` -- the section 1 cross-check between the two
