# The Profile Photograph: Upload, Frame, Replace, Remove

Date: September 15, 2026
Status: Done

Reported as: the resume editor should let a visitor upload an image on every
template with a profile photo -- the Labelled Sections CV and the Photo Profile
CV -- and replace, resize and remove it.

Two of those four already worked. One was hidden on the template that needed
it, and one did not exist.

## The field was gated to a list of one

The photo field carried `data-templates="photo-rail"`, written when exactly one
template drew a photograph. The Labelled Sections CV then arrived drawing one
too, and the field stayed hidden on it: **a photo frame on the sheet with no
control to fill it**.

A list of which templates draw a photograph is a second copy of something the
registry already knows, and it went stale the first time it could. The field
carries `data-needs="photo"` now, and `syncTemplateFields()` answers it by
asking the descriptor:

    (chosen.blocks || []).some((b) => b.kind === "photo")

Verified across all five templates: shown on `photo-rail` and `label-rail`,
hidden on `classic`, `grey-rail` and `ruled-serif`, and each one matching
whether that descriptor actually has a photo block. A template the Template
Studio creates with a photo block gets the control for free.

## Resizing needed the photograph to still exist

The editor kept only the finished 4:5 crop. `cropToRatio()` centre-cropped on
upload and threw the rest away, with a comment saying a crop handle is a second
editor -- which was a reasonable trade while there was nothing to re-frame
against, and is exactly what made framing impossible. Moving the picture would
have meant cropping a crop, losing a little more every time somebody dragged a
slider back and forth.

So the editor now keeps three things, and they are not interchangeable:

| | What it is |
| --- | --- |
| `photoMaster` | the whole photograph, downscaled, uncropped. What is stored |
| `photoView` | how the frame sits on it |
| `currentPhoto` | the frame itself, which is what the sheet draws |

The third is **derived** from the first two and is never the source of truth.
Every change -- upload, replace, a slider, Reset, Remove -- goes through one
path that re-cuts it from the master, so dragging a slider is lossless against
the upload however long it goes on.

Proved rather than asserted: zooming to 200 per cent, moving to the top, and
then pressing Reset returns a thumbnail **byte-identical** to the one the
upload produced. A reload reproduces the framed crop byte-identically too, so a
returning visitor's face is not silently re-framed.

### What it costs

`PHOTO_MASTER_EDGE` is 900 and its quality 0.78, which puts a typical portrait
at 90-140KB against the 480px crop's 30-60. That is the price of the feature,
it is paid once per document, and it buys a control that would otherwise have
to lie about what it does.

### The vocabulary is the poster editor's

`{ zoom, x, y }` -- zoom of 1 or more, and `x` and `y` as units of the
available slack in `[-1, 1]` so 0 is centred and the ends are flush. Named the
same way as `js/poster.js`'s `defaultView()` and `photoMetrics()` on purpose: a
visitor who has framed a photograph on a poster has already met this idea.

**It is not shared with that file, and that is a deliberate debt.** The two
editors are separate pages loading different scripts, and moving eight lines of
arithmetic into `js/app.js` would mean touching the poster's photo handling
inside a change to the resume's. Worth doing; not worth doing here.

## The sliders say what they can do

At zoom 1 one axis has no slack at all -- the frame already spans the whole of
it -- so its slider would move and change nothing. It is **disabled**, not
hidden: a control that vanishes and returns as the zoom passes 1 is worse than
one that is visibly not available yet.

Which axis that is depends on the photograph, not on the template, and the
check is made against the decoded image. Confirmed both ways: a 1600x900
landscape upload disables "move up and down", and a 1200x1600 portrait disables
"move across".

## Storage gained a shape, and old documents still open

`PHOTO_KEY` held a bare string -- the finished crop. It holds
`{ src, zoom, x, y }` now, because a frame without the picture it was cut from
is meaningless and the two must not be able to get out of step.

An older document is read as a master with a neutral view. That reproduces
exactly what it showed, because the stored crop is already at the frame's
ratio. Zooming into it then works and costs a little sharpness, which is the
honest outcome for a picture whose original this editor never kept.

## Replacing is not a separate control

Choosing another file is the same gesture, so there is no Replace button --
only a hint saying so. A fresh upload starts centred and unzoomed, deliberately:
carrying the previous photograph's framing onto a new one frames a face nobody
has looked at yet. Confirmed by uploading over a photo zoomed to 250 per cent
and watching the sliders return to neutral.

## Restoring on load is asynchronous, and nothing between can save

Decoding the master is what makes the sliders live and cannot be done
synchronously, so the first render happens with no photograph and a second
follows when the decode lands. That is the shape the page already had -- an
`<img>` never painted on the first frame either.

What matters is that nothing in between can write: `loadPhoto()` only reaches
the save-and-render step once it has a decoded image or has given up, and
giving up writes an empty key rather than leaving the old one to come back.

## Testing

Driven through the form on the Labelled Sections CV, which could do none of it
before:

| Step | Result |
| --- | --- |
| Before upload | field visible, chip and framing hidden |
| Upload a 1600x900 landscape | chip and framing appear, sheet draws it, "move up and down" disabled |
| Zoom to 200% | both sliders live, crop changes |
| Move to the top | crop changes again |
| Reset framing | sliders neutral, thumbnail byte-identical to the upload |
| Replace with a 1200x1600 portrait | framing resets, "move across" disabled instead |
| Remove | chip, framing and sheet all cleared |
| Reload | zoom 180, x 60, y -40 restored, and the crop byte-identical |
| Every template | field shown exactly where the descriptor has a photo block |

`node tests/verify-layout.js`: 1582 passed, 0 failed.

## Files

- `site/js/resume.js` -- `templateNeeds()`, `defaultView()`, `clampUnit()`,
  `photoFrame()`, `halveTo()`, `toMaster()`, `toFrame()`, `readStoredPhoto()`,
  `applyPhoto()`, `loadPhoto()`, `clearPhoto()`, and the slider handlers
- `site/resume.html` -- `data-needs="photo"`, and the framing controls
- `site/css/style.css` -- `.photo-frame-controls`
