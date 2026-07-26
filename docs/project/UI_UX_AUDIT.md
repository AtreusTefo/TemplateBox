# TemplateBox UI/UX Audit

Date: July 26, 2026
Auditor: Full-stack/UI-UX review session
Scope: All nine public pages, `css/style.css`, `js/app.js`, and the monetized catalog-to-editor flow
Reference sites supplied by the product owner: `mavigadget.com`, `fabricfilmstudio.com`

This document closes the "No formal UI/UX audit has been done yet" open item recorded in `docs/memory/PROJECT_STATUS.md`. Findings are ordered by impact. Each carries a status so the file stays useful as a tracker rather than becoming a snapshot.

## 1. Reading the Reference Sites Correctly

Both supplied references are e-commerce storefronts selling physical goods. Their design systems exist to make product photography desirable. TemplateBox is a tool: the product is the artifact the visitor generates, not a photograph of an object. Copying the surface of those sites (price carousels, testimonial walls, "From $60" labels) would import patterns that solve a problem TemplateBox does not have.

The transferable principles are narrower and were used as the basis for this audit.

| Principle | Source | Application to TemplateBox |
|---|---|---|
| One outcome-led promise plus one primary CTA in the hero | Fabric Film Studio | Replace the keyword-string H1 and 62-word paragraph |
| Trust signals given dedicated real estate, not footnote treatment | Mavigadget | Surface the "nothing leaves your device" differentiator |
| Navigation and category labels written in user-intent language | Mavigadget | Rename internal taxonomy labels such as "Graphic Canvas" |
| Curated hierarchy instead of a flat grid | Mavigadget | Featured row above the full 15-card catalog |
| Generous whitespace, soft state transitions, editorial section headers | Fabric Film Studio | Motion tokens and spacing scale in the stylesheet |
| Multi-column footer with real information architecture | Both | Replaces the current three-link footer |

## 2. Findings

### 2.1 Catalog card previews read as unfinished skeleton screens

Severity: High. Status: Resolved.

`css/style.css` rendered every catalog thumbnail through the `.mock-doc` component as undifferentiated grey `.bar`, `.rule` and `.block` primitives. For a template product the preview is the product. Fifteen grey wireframes communicate "still loading" rather than "this is the document you will receive", and they give the visitor no basis on which to choose between six visually identical business-document cards.

Resolution: the mock components now render filled miniature documents with representative sample text, real currency figures in line-item tables, accent-colored section rules on resume mocks, and checked boxes on the warning-notice mock. The approach remains pure CSS with zero image payload and zero cumulative layout shift, per the existing architectural constraint.

### 2.2 Hero performs SEO work at the expense of comprehension

Severity: High. Status: Resolved.

`index.html` opened with a keyword-string H1 ("Free Receipt, Invoice, Resume, Poster and Mockup Maker") followed by a 62-word paragraph, and contained no call to action of any kind. A visitor had to read to the end of a dense paragraph and then scroll before encountering anything actionable.

Resolution: short outcome-led H1, one-line subheading, and a primary/secondary CTA pair. Keyword coverage is preserved by relocating it into the catalog section introduction, the card copy, and the new document landing pages, where it continues to serve ranking purposes without degrading first-view comprehension.

### 2.3 The core differentiator is buried

Severity: High. Status: Resolved.

"Nothing is uploaded, everything runs locally" is a stronger trust claim than either reference site can make, and is the primary reason a visitor should choose TemplateBox over a login-walled competitor. It previously appeared once, in a single footer sentence, and inside the 62-word hero paragraph.

Resolution: a dedicated four-item trust band sits directly beneath the hero, covering no sign-up, in-browser processing, ATS-safe selectable-text PDF export, and free with no watermark.

### 2.4 Flat catalog with no hierarchy and four different CTA verbs

Severity: Medium-High. Status: Resolved.

Fifteen cards carried identical visual weight with no entry point for a scanning visitor, and the CTA buttons used four different verbs for one identical action: "Personalize Template", "Fill Out Template", "Remix Template", "Generate Mockup". Inconsistent labelling for an identical action increases cognitive load and weakens the button as a recognizable affordance.

Resolution: a single CTA verb across all cards, the entire card made interactive rather than the button alone, and a featured row surfacing the highest-intent tools above the full grid.

### 2.5 Category labels use internal taxonomy

Severity: Medium. Status: Resolved.

The filter pill "Graphic Canvas" is internal vocabulary. No visitor searches for or thinks in that phrase; they think "poster". Both reference sites label by user intent rather than internal structure.

Resolution: pills renamed to intent language. "Graphic Canvas" becomes "Posters and Prints", "Business Docs" becomes "Receipts and Invoices", and the remaining labels follow the same rule.

### 2.6 Saved work is invisible to returning visitors

Severity: Medium-High. Status: Resolved.

Every editor persists its state to `localStorage`, yet the homepage had no awareness of it. A visitor returning to finish a half-completed invoice had to re-navigate the catalog, sit through the ten-second interstitial, and hope their data was still present, with no confirmation beforehand that it was.

Resolution: a "Continue where you left off" strip renders at the top of the catalog when saved editor state is detected, naming the document and linking directly back into it. This is a retention lever no login-walled competitor can match on friction, and it costs nothing server-side.

### 2.7 The loading interstitial is the weakest and highest-risk moment in the flow

Severity: High. Status: Resolved.

`loading.html` presented a bare numeral counting from ten above two advertisement containers. Three separate problems compounded:

1. A naked descending number is perceived as slower than a filling progress indicator.
2. The visitor had no object of anticipation. Nothing on the page confirmed which template they had selected, so the wait read as an obstacle rather than as preparation.
3. The status copy stated "Loading editing canvas, typography fonts, and template assets...", describing work that is not occurring. The editors are static pages requiring no such preparation.

Point 3 is the material one. Misdescribing an advertising interval as asset loading is a dark pattern. It is detectable in Microsoft Clarity rage-click and session-replay data, it is the category of practice Google's ad-experience guidance targets, and it is unnecessary: the ten-second interval is the monetization mechanism and can be stated plainly without any revenue impact.

Resolution: a progress bar replaces the bare numeral while the numeric countdown is retained as a secondary readout for visitors who want a precise figure; the selected template is named and previewed so the wait has an anticipated object; and the status copy states honestly that the editor opens automatically after a short interval. No change was made to ad placement, ad count, zone keys, or interval length.

### 2.8 Editors open blank with no indication of output

Severity: Medium-High. Status: Resolved.

`resume.html` presented an empty form beside an empty white `.resume-sheet`. A first-time visitor saw a blank rectangle and had no way to understand what the tool produces or that the preview is live until they had typed several fields. The same pattern applied to `docs.html`.

Resolution: `resume.html` and `docs.html` now open with realistic sample content, so the live-preview behaviour is legible within the first second. A notice above the form states plainly that the content is sample data and offers a single "Start blank" action that empties the whole document and focuses the first field. Sample content loads only when no saved state exists, so a returning visitor's genuine work is never replaced.

`poster.html` and `mockup.html` were left unchanged: both render a complete product on the canvas from their default state, so neither ever presented an empty preview.

### 2.9 Persistence is silent

Severity: Medium. Status: Resolved.

State was written to `localStorage` on every input event with no user-visible confirmation. For a product whose central promise is "no account required and your work is safe", silent persistence wastes the trust payoff and invites visitors to distrust the model.

Resolution: a save indicator reports saved state in each editor.

### 2.10 Primary export action sits below the fold

Severity: Medium. Status: Resolved.

The download control was positioned beneath the full-height preview sheet. On mobile, and on desktop for longer documents, the visitor had to scroll past an entire rendered page to reach the button that completes their task.

Resolution: the export action is presented in a sticky action bar within the preview pane.

### 2.11 Mobile tab pattern disables the core value proposition

Severity: Medium-High. Status: Partially resolved, tracked.

Below the 48rem breakpoint the split view collapses to tabs that fully hide the preview pane while the form is being edited. Live preview is the product's principal differentiator, and on the traffic segment most likely to dominate the audience it is switched off for the entire editing session.

Resolution applied: the tab control is more prominent and preserves scroll position across switches. A fuller solution (persistent collapsed preview strip or floating preview affordance with change indication) requires design validation on a real device and is recorded as an open item rather than implemented speculatively.

### 2.12 Stylesheet lacks a token layer and any motion

Severity: Medium. Status: Resolved.

The 1,980-line stylesheet contained no `transition` declaration anywhere, and spacing values were assigned ad hoc across at least eight distinct magnitudes (0.375, 0.5, 0.625, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5rem) with no underlying scale. The `--accent` token was defined as `#1A1A1A`, identical to `--color-text`, meaning that outside the resume editor (which overrides it per-document) the site had no accent color at all. Interactive elements changed state instantaneously, which is the largest single contributor to the interface reading as unstyled markup rather than as designed.

Resolution: a token layer covering spacing, motion duration, and a restrained accent, with transitions applied to interactive state changes. Every motion declaration is wrapped by a `prefers-reduced-motion` guard.

### 2.13 Button inversion on hover is excessive

Severity: Low. Status: Resolved.

`.btn:hover` inverted a solid charcoal fill to a white fill, the maximum possible contrast delta. Against the calm editorial character the theme is targeting, this reads as abrupt.

Resolution: softened hover treatment with a transition, retaining sufficient state distinction for accessibility.

### 2.14 Keyboard focus styling is incomplete

Severity: Medium (accessibility). Status: Resolved.

Focus styling existed only on form inputs and footer social links. `.btn`, `.pill`, `.mobile-tabs button`, `.swatch` and `.entry-remove` had none, leaving keyboard users dependent on the browser default ring, which renders inconsistently against the inverted dark button fill.

Resolution: an explicit `:focus-visible` treatment applied consistently across all interactive components.

### 2.15 Cards give no interactive affordance

Severity: Low-Medium. Status: Resolved.

`.template-card` had no hover or focus state. Nothing indicated the card was a target.

Resolution: hover and focus-within states on the card with a bordered and elevated treatment consistent with the flat, shadow-free geometry the theme mandates.

### 2.16 Footer carries no information architecture

Severity: Medium. Status: Resolved.

The footer held three links. Both reference sites use multi-column footers as a genuine navigation surface. This is simultaneously a UX finding and an SEO finding, since the footer is the principal site-wide internal-linking surface.

Resolution: multi-column footer naming every tool and landing page, with legal and company columns.

### 2.17 The blog is invisible from the homepage

Severity: Medium. Status: Resolved.

A blog system exists and is linked from the header, but the homepage surfaced no post. The content investment produced no dwell-time or internal-linking benefit on the site's most-visited page.

Resolution: a guides strip on the homepage rendering the most recent posts from `js/blog-data.js`.

## 3. Design System Decisions Recorded

- Motion is capped at 180ms and applies only to color, border, opacity and transform. No layout-affecting property is animated, preserving the zero-CLS characteristic.
- The accent token is used for interactive emphasis and active state only. Document sheets continue to derive their accent from per-document state so the resume accent swatches behave as before.
- The flat, shadow-free geometry mandated by `CLAUDE.md` is retained. Card elevation on hover is expressed through border weight and a one-pixel transform, not drop shadows.
- No component library or external design-system tooling was introduced. At one stylesheet, nine pages and one contributor, a synced design-system project would create a second artifact to reconcile by hand while the authoritative work still lands in `css/style.css`. The token layer delivers the substantive benefit within the existing no-build constraint. This should be revisited if the tool count passes roughly ten or a second contributor joins.

## 4. Open Items

| Item | Reason not closed |
|---|---|
| Persistent mobile preview affordance (finding 2.11) | Requires validation on a real touchscreen device before committing to a pattern |
| Real-device pass across all editors | Carried over from the existing PROJECT_STATUS open items |
| Social proof and usage figures | No honest data source yet. Fabricated testimonials are not acceptable; revisit when Clarity or Adsterra figures support a truthful claim |
| Dark mode | Low priority for this audience; no requests observed |

## 5. Related Documents

- `docs/project/SEO_AUDIT.md` — the search-visibility audit conducted in the same session; findings 2.4, 2.16 and 2.17 overlap with it
- `docs/memory/PROJECT_STATUS.md` — implementation state and operational knowledge
- `PRD.md` — requirements and design system specification
- `CLAUDE.md` — coding standards, security rules and documentation standards