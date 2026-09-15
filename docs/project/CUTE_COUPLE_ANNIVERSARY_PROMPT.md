# Coding Agent Brief: The Cute Couple Anniversary Poster

Date: September 15, 2026
Status: Brief. Nothing built yet.
Source: one reference image, `Cute Couple Anniversary Designs.jpg`, supplied
with this brief. There is no artwork file, no SVG and no font.

Build the supplied design as the poster editor's NINTH layout: a three-by-three
grid of photographs over a dictionary-definition block -- a word, a bracketed
pair of initials, a definition, and a closing line.

Read this whole brief before writing anything. Section 1 cannot be got wrong.
Section 2 is the one that decides how the rest of the work is done, and it is
the opposite of what the four previous briefs in this family said.

---

## 1. Before anything else: the reference is somebody's private photograph

It is not an artwork file. It is a photograph of a framed print, **held in
somebody's hand, in their home**, and it carries:

- **Nine photographs of two identifiable private individuals**, a couple, in
  intimate moments. Not the file, not a crop of it, not a thumbnail derived
  from it, not a colour sampled from a face.
- **Their initials**, in the bracket beside the heading.
- **A closing line that is a real message** from one of them to the other.
- **The room**: a hand, a floor, a cabinet hinge, a door.

None of it may enter this repository -- not in code, not in a comment, not in a
sample, not in a test fixture, not in a catalog card, not in a commit message,
and not in a file name. They are deliberately not quoted here, not even to say
what to avoid.

**What you MAY take is the layout**: the grid, the proportions, the type roles
and the vertical rhythm. That is the design, and the design is the deliverable.

---

## 2. There is no artwork file, and that changes the method entirely

Every previous brief in this family handed you an SVG with exact coordinates
and told you to read them rather than eyeball. **This one hands you a
photograph, and the honest instruction is the reverse: derive a clean design,
do not trace a skewed image.**

What is wrong with the reference, measured:

- **Perspective.** The frame is held at an angle. Row three's three cells
  measure 134, 167 and 179 pixels wide in a 736-pixel image. In the design they
  are equal. Any number you read off this photograph is a number times an
  unknown projective transform.
- **A specular reflection** runs across the top right; the print is behind
  glass.
- **Uneven lighting**: the left edge is in shadow, the right is blown out.
- **The mat's inner edge** is visible and is not the print's edge.

So: read PROPORTIONS and ROLES. Derive one clean grid with equal columns, equal
rows and one gutter value. State in the write-up which numbers you chose and
why, and do not present any of them as measured from an artwork -- they are
not, and a later reader deserves to know which figures are evidence and which
are design.

Where the reference is genuinely readable, it is readable as a RATIO: the grid
occupies roughly the upper three fifths of the print and the text block the
lower two, and the gutters between cells are about two per cent of the print's
width. Check those against the image yourself; they are a starting position.

---

## 3. The type is FOUR faces, and this is what a build gets wrong

The design reads as a dictionary entry, so the obvious assumption is one serif
throughout, or a serif heading over a serif body. **It is neither.** Enlarged,
the reference shows:

| Element | Face |
| --- | --- |
| The word (`Love`) | a heavy, high-contrast SERIF, very large |
| The bracket (`[X & Y]`) | a BOLD SANS, in square brackets |
| The definition, three lines | a SANS, regular, generous leading |
| The closing line | a SERIF, regular -- it switches back |

The bracket sits on the **same baseline as the word**, not centred on its
x-height, and is a fraction of its size.

That last row is the one to be deliberate about: the closing line is a
different face from the three lines above it, and that is the design's own
choice rather than an accident of whatever produced the print. Reproduce it,
and say in the write-up that you checked.

The editor already stands Playfair Display in for display serifs and has a
sans stack. Use what is loaded; do not add a webfont.

---

## 4. This is the poster editor's ninth layout. Reuse, do not re-derive

`site/js/poster.js` already draws eight: `card`, `split`, `browser`, `player`,
`anniversary`, `birthday`, `tribute` and `love`. You are adding a ninth
arrangement, and almost everything it needs exists.

| You need | It already exists |
| --- | --- |
| Boxes in artwork points onto the page | `scaleBoxes(boxes, page, W, H)` |
| Which slots a layout draws | `slotsFor(layout)` -- extend it, do not bypass it |
| Hit testing and the framing controls | `slotAt()`, `rectForSlot()`, `photoAt()` |
| Filling a batch of photographs in order | `uploadTargets(count)` |
| Per-photo zoom and pan | `state.views[slot]`, `drawCoverImage()` |
| Greedy word wrap | `hbdWrap(c, text, maxPx)` |
| Shrink a line to fit | `hbdFit()` / `annivFit()` |
| Where a text field landed, for canvas editing | `noteText(c, key, box)` |
| A colourway, labelled Screen Mode with Dark and Light | the pattern the other four follow |

**`slotsFor()` is not optional.** `SLOT_COUNT` is the photos array's LENGTH,
and three separate bugs have come from reading it as "slots a visitor can
reach". Add a `FIRST` / `EXTRA` pair the way the other collages do.

**Slot 0 is the first cell**, so a photograph carries across from the card, the
player and the other collages -- the rule every layout in this file follows.

---

## 5. The photographs are black and white, and the editor cannot do that yet

All nine are greyscale. That is the design, not the photographs: a colour
snapshot dropped into this layout would break it.

Nothing in `poster.js` converts a photograph today. This is the one genuinely
new capability, and it has to work in **both painters**, which is this file's
standing hazard:

- **Canvas**: `ctx.filter = "grayscale(1)"` before `drawCoverImage`, restored
  after. Check it survives `save()`/`restore()` and that the export path uses
  the same code as the preview.
- **SVG**: an `<feColorMatrix type="saturate" values="0">` filter, defined once
  and referenced by each image. An SVG exported and rasterised must look like
  the canvas.

**Offer it as a control, defaulting on.** A visitor who wants colour should be
able to have it, and a toggle costs one line of state. Whatever you decide,
decide it deliberately and write down which.

---

## 6. The fields

Four, and they map to nothing that already exists, so they are new state keys:

| Field | What it is |
| --- | --- |
| the word | one line, large. "Love" in the reference |
| the bracket | one short line, shown in square brackets the template draws |
| the definition | a wrapped block, three lines in the reference |
| the closing line | one line, in the serif |

The brackets are the TEMPLATE'S, not the visitor's: they type the initials and
the layout draws `[` and `]` around them. A visitor who types their own
brackets should not get two sets -- decide how you handle that and say so.

Register all four with `noteText()` so they are editable on the preview, as the
other four layouts' fields are.

---

## 7. Traps

- **Two painters, one poster.** `paint*()` and `*SVG()` drift silently. Compare
  SHAPES by pixel and TEXT by exported coordinates. An SVG rasterised in an
  `<img>` gets no webfonts, so text positions will not match there -- that is
  pre-existing and editor-wide, not a bug you introduced.
- **Stroke widths in the artwork's own points, never device pixels.**
  `Math.max(1, fx)` clamps at one scale and not the other, so the same keyline
  comes out different in the preview and the export. This has already happened
  once in this file.
- **`#p-grid-fields` is the search screen's block.** If this layout needs the
  batch photo input, show `#p-batch-fields`. Widening the other one is what put
  a dead "Screen Mode" on three posters.
- **The catalog count is a moving target.** It reads 51 today and the
  repository is being worked on by more than one session -- there were three
  commits between this brief being researched and written. **Count the cards
  yourself** (`grep -c 'class="template-card"' site/index.html`) rather than
  trusting the number above, and make the `catalog-empty` message match.
- **The card's title must match the registry's exactly.** Suite section 1
  checks that pair, and it is the one defect in this family that no amount of
  looking would have found.
- **Do not use `innerHTML`** for any visitor string.

---

## 8. While you are in there

- A catalog card in `site/index.html`, the matching entry in `site/js/admin.js`,
  and the count corrected.
- A `.mock-doc` tile in `site/css/style.css`. What identifies this design at
  thumbnail size is the three-by-three grid over a heavy word -- lead with
  those. Beware generic class names: a tile's bullet markers were once called
  `dot` in a stylesheet that already had a `.dot`, and a function was once
  called `renderNotice` in a file that already had one. Both failed silently.
- Controls in `site/poster.html`, in their own `#p-*-fields` block.
- Check what the suite already covers for posters -- section 10 opens an export
  and looks inside it -- and extend it if this layout can fail in a way nothing
  currently catches.

---

## 9. Definition of done

- The poster matches the reference in layout and rhythm, checked by RENDERING
  it and comparing, not by reading the code back.
- Nine photographs upload, frame and export; a batch fills them in order; each
  one can be zoomed and panned in its cell.
- The greyscale treatment looks the same in the preview, the PNG and the SVG.
- Both colourways render, and an empty grid is legible in each.
- All four text fields wrap or shrink sensibly, and are editable on the
  preview.
- `node tests/verify-layout.js` passes. Section 4 fails while your work is
  uncommitted -- that is the working-tree-versus-HEAD comparison and it clears
  on commit; check its differences are confined to the pages listing the
  catalog.
- Nothing from the reference is anywhere in the repository: no photograph, no
  initials, no sentence of the message -- including in comments, samples, test
  fixtures, tile content and commit messages.
- A write-up in `docs/implementation/`, and an index entry in
  `docs/DOCUMENTATION_INDEX.md`. Record which numbers were derived and which
  were measured, because for this design almost all of them are derived.

---

## 10. Do not

- Do not trace the photograph. It is projectively distorted and you will build
  a trapezoid.
- Do not present derived numbers as measured ones.
- Do not write a second collage, wrapper, or photo-framing model.
- Do not copy the reference image, the photographs in it, the initials, or the
  closing line.
- Do not add a webfont, a server call, or any third-party runtime.
- Do not use `innerHTML` for any visitor string.
- Do not put working files inside `site/`.
- Do not use emojis anywhere -- code, comments, documentation or commit
  messages.
