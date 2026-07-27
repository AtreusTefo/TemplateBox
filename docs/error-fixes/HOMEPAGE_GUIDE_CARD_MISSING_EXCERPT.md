# Homepage Latest Guides Cards Never Render an Excerpt

Date: July 27, 2026
Status: Fixed

## Issue Title

The "Latest Guides" cards in the homepage guides strip render a date and a linked title, but never the one-line excerpt below them, even though every post in `js/blog-data.js` has description text and the blog index cards display it correctly.

## Root Cause

Field-name mismatch, failing silently. `initGuidesStrip()` in `js/app.js` read `post.standfirst`:

```js
if (post.standfirst) {
    ...
    desc.textContent = desanitize(String(post.standfirst));
}
```

No post object has a `standfirst` property. The field is `description` (documented in the post-shape comment at the top of `js/blog-data.js`, and read correctly by the card and row renderers in `js/blog.js`). `standfirst` is the name of the *CSS class* used for the excerpt paragraph on a post page (`.post-standfirst`), which is the likely source of the confusion.

Because the guard is a truthiness check on a missing property, it evaluated false every time and the paragraph was simply never appended. No error, no console output, nothing to notice unless the card is compared against a blog-index card for the same post.

## Fix Applied

`js/app.js`, `initGuidesStrip()`: read `post.description` instead of `post.standfirst`, with a comment naming the two files that define the field, so the next reader does not reintroduce the class name.

## Testing Steps

1. `node --check js/app.js`.
2. Serve locally (`npx serve site`) and load the homepage. Each card in the Latest Guides strip must show date, title, and an excerpt paragraph matching the `description` value for that slug in `js/blog-data.js`.
3. Compare against the same post's card on `blog.html` — the excerpt text must be identical, since both now read the same field.

Not verified in a browser at fix time: Playwright is not installed in this environment, and the change was confirmed as a field-name correction against `js/blog-data.js` and `js/blog.js` only.

## Troubleshooting

- If cards still show no excerpt, confirm the post objects in `js/blog-data.js` actually carry non-empty `description` values, and that `window.TB_BLOG_POSTS` is populated (the strip returns early and stays hidden when the array is empty, which is intended).
- The excerpt is the full meta description, so cards can run long. If that reads badly at some point, truncate in the renderer rather than adding a second per-post field — one field with two consumers is what keeps the homepage and blog index consistent.

## Related Files

- `js/app.js` (`initGuidesStrip`)
- `js/blog-data.js` — post shape, `description`
- `js/blog.js` — the blog index renderers that already used the field correctly
- `index.html` — the guides strip markup (`[data-guides-section]`, `[data-guides-grid]`)
