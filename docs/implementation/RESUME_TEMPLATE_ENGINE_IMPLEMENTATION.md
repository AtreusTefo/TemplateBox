# Resume Template Engine: Descriptor, One Layout Pass, Two Painters

Date: August 2, 2026
Status: Built and verified in isolation. **Not yet wired into `resume.html`** — the live resume editor is untouched and still uses the hand-written renderers in `site/js/resume.js`.

Supersedes the design in `docs/architecture/RESUME_TEMPLATE_DESCRIPTOR_SKETCH.md` on one point, noted below.

## What Was Built

| File | Role |
|---|---|
| `site/js/resume-templates.js` | Data-only registry. One template: `grey-rail` |
| `site/js/resume-engine.js` | `TBResume`: layout pass plus the SVG and jsPDF painters |
| `site/tools/resume-template-preview.html` | Internal harness (noindex via `/tools/*`), sample state, layout report, PDF export |

No existing file was modified. A parallel session held uncommitted work in `site/css/style.css`, `site/js/app.js` and `site/resume.html` at the time, so the harness carries its own inline styles rather than adding rules to the global stylesheet.

## Architecture Change From the Sketch

The sketch proposed two renderers, each walking the state and laying itself out. That was still two implementations of the same layout, differing only in vocabulary — the drift risk was reduced, not removed.

What was built instead is **one layout pass, two painters**:

```
descriptor + state
        |
        v
   layout()  ---- measures text through jsPDF ----
        |
        v
  display list  (rect | line | circle | poly | roundrect | text)
       /  \
      /    \
 paintSvg  paintPdf
```

`layout()` makes every positional decision once and emits primitive drawing operations with absolute point coordinates. Neither painter makes a layout decision, so the two outputs cannot disagree about what is drawn or where.

Text is measured through jsPDF **even when only previewing**. This closes the gap the sketch explicitly could not: preview and PDF wrap identically because the same measurer decides both. The sketch listed divergent line breaking as an accepted limit; it is now eliminated between the two outputs.

## Units and Coordinates

Points throughout, on the 595x842 A4 grid, matching jsPDF's `pt` unit and the reference artwork's own coordinate space. One number drives both mediums.

`firstBaseline` is a column's first text baseline as an absolute page y, not a box inset, because every vertical measurement was taken from baselines in the source.

## Why the Preview Is SVG

An HTML preview positions text by box top, while the display list carries baselines, so an HTML painter would have to re-derive positions from font metrics — reintroducing an independent calculation. SVG's `y` **is** the baseline, so the painter consumes the display list unchanged. Text stays selectable and the sheet scales through `viewBox`.

Built with `createElementNS` and `textContent` only, never innerHTML, per the rendering rule in CLAUDE.md.

## Verification

27 automated checks, all passing, run with Playwright against `npx serve`.

| Check | Result |
|---|---|
| Preview and PDF emit identical text, in identical order | 101 runs each, identical |
| PDF carries real `Tj` text operators | 100+, ATS-parseable |
| PDF embeds no images | confirmed, nothing rasterized |
| Six pre-wrap landmarks vs the source artwork | exact (under 1.5pt) |
| Grey rail geometry | x=371, w=224, matching source |
| Mixed-weight run shares one baseline | bold role, regular dates, correct order |
| Entry heads pure black, prose muted | matches source ink split |
| Bullet glyph through WinAnsi | survives as byte 149 |
| Text outside page bounds | none |
| Console errors | none |
| PDF size | 16.4 KB |

### Fidelity limit, measured

Landmarks *above* the first wrapped paragraph match the artwork exactly. Landmarks *below* it drift, and the cause was measured rather than assumed:

> `"Prepared surfaces for painting using hand scrapers and wire brushes."` measures **306.4pt** in jsPDF Helvetica 10pt against a **308pt** column. jsPDF fits it on one line; the original artwork broke it earlier.

A 1.6pt measurement difference decides one line break, and everything below shifts by a line. `EDUCATION` lands 16pt above the artwork; `SKILLS` within 2pt. This is inherent to reproducing a design whose original producer used different metrics, and does not affect internal consistency — preview and PDF still agree exactly, because both are measured by jsPDF.

## Two Defects Found and Fixed During the Build

**Contact rows did not advance past the line just drawn.** The row cursor added only the inter-row gap, not the line height, putting the whole rail 24pt high. Now advances `lineHeight + rowGap`.

**`xml:space` was set with `setAttribute`.** It is a namespaced attribute, so the call silently failed to register and SVG collapsed the leading space of runs such as `" - "`. The education line rendered `"Clayton College-  London"` in the preview while the PDF drew it correctly — a preview/PDF divergence that the text-equality test could not catch, because `textContent` preserved the spaces even though rendering collapsed them. Fixed with `setAttributeNS`. Worth remembering: identical text content does not prove identical rendering.

## Known Gaps Before Integration

1. **New state fields.** The descriptor reads `address`, `city`, `postcode`, `phoneAlt`, `place`, and `education[].field`, none of which the current resume state or form has. Integration means extending both.
2. **Bullet descriptions.** `experience[].description` is currently one prose block; this template splits it on newlines into bullets.
3. **Sidebar pagination.** Main-column pagination is implemented; the sidebar is deliberately single-page and reports overflow instead. A rail that splits mid-list reads as a fault rather than a longer document.
4. **Long unbreakable tokens.** A long email wraps mid-word (`example-exampl / e.co.uk`). The source artwork has the same behaviour; a break-on-punctuation rule would improve it.
5. **`resume.js` is untouched.** Migrating the three existing single-column templates onto this engine is a separate step, and should follow the equivalence check in the sketch: compare output both ways before deleting the hand-written renderers.

## ATS Position

Two-column layouts carry parsing risk, and that matters because ATS-safety is an explicit claim on the resume tools. Two mitigations are real here: there is no photograph, and because the engine controls `doc.text()` call order, extraction order is deterministic rather than interleaved. Ship this template as design-led, with the single-column templates retaining the unqualified ATS claim.

## Adding a Template

Copy an entry in `site/js/resume-templates.js`, change the data, and add a catalog card in `index.html` with `data-target="resume" data-doc="<id>"`. No engine changes. This is the same data-only-registry pattern as `site/js/mockup-templates.js`.