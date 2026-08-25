# Publish Failed With "state cached in an interface object ... had changed since it was read from disk"

Date: August 25, 2026

## Issue Title

Publishing a blog post (and potentially a catalog thumbnail) into a connected
project folder aborted with:

```
Stopped: An operation that depends on state cached in an interface object was
made but the state had changed since it was read from disk.
```

Reported after editing an existing post and uploading a cover image.

## Root Cause

`InvalidStateError`, raised by Chrome's File System Access API. A
`FileSystemDirectoryHandle` caches filesystem state on the handle object.
Writing into that directory changes it underneath the cached state, after
which a later `getFileHandle` or `getDirectoryHandle` resolved *through the
same handle* can fail.

Which is precisely the shape of both publish routines. `publishBlog` writes
`js/blog-data.js`, writes one page per post into `blog/`, then reads and
rewrites `blog.html` and `sitemap.xml`, then lists and prunes `blog/` — every
step resolved from the one long-lived handle stored at connect time.
`publishRecord` does the same for thumbnails and `index.html`.

`NotReadableError` is the same situation reported differently: a `File`
snapshot taken with `getFile()` before the change, then read after it.

**It does not reproduce against an origin-private directory**, which is all
the test harness here can reach — an OPFS handle carries no such cache. A
publish driven end to end through OPFS, including a 7.3 MB cover upload,
succeeds every time. That is why the defect reached an operator: the code was
tested thoroughly against a filesystem that cannot exhibit the failure.

## Fix Applied

**`site/js/admin-fs.js`** — a `retrying(label, run)` wrapper around every
filesystem operation: `writeFile`, `readText`, `readFile`, `deleteFile`,
`listDir`, and the `looksLikePublishDir` probe used at connect.

On `InvalidStateError` or `NotReadableError` it runs the operation again.
Because each operation re-resolves its path from the root handle
(`resolveDir` walks the segments every call), the retry picks up current
state and succeeds.

Three deliberate choices:

- **One retry, not a loop.** A second failure is a real problem — a revoked
  grant, a folder that has been moved or deleted — and looping would bury it
  behind a delay. The second failure is re-thrown with a message naming the
  path and stating that nothing further was changed.
- **Every wrapped operation is idempotent.** Each resolves a path and then
  reads, writes or deletes; none appends. Re-running one is safe. `listDir`
  clears its accumulator first, so a retry cannot double-list.
- **`looksLikePublishDir` no longer swallows every error.** It previously
  returned false on any exception, so a transient stale handle at connect
  time surfaced as *"That folder is not the site directory"* — sending the
  operator off to re-pick the folder they already had right. Only
  `NotFoundError` now means "wrong folder"; anything else propagates.

## Testing Steps

The failure cannot be produced by an origin-private directory, so it was
injected: the directory handle returned to the panel was wrapped in a proxy
whose next `getFileHandle`/`getDirectoryHandle` call throws the exact
`DOMException` Chrome raises, then behaves normally — the faithful model of a
handle going stale at one moment and re-resolving cleanly afterwards.

1. **Blog publish, staleness armed mid-run.** One error injected, absorbed by
   the retry, publish completed: `js/blog-data.js` written, the post page
   written, one archive link, one sitemap blog URL.
2. **Thumbnail publish, staleness armed mid-run.** One error injected,
   absorbed, `index.html` rewritten to reference the new thumbnail and the
   image written.
3. **Both attempts failing.** The wrapper re-throws with the folder-changed
   message rather than the raw DOMException.
4. **An unrealistic injector that failed every distinct child name once**
   exhausted both attempts, as designed — recorded here because it looked
   like a bug in the retry and was a bug in the test. A block containing two
   different child lookups gets one retry of the whole block, not one per
   call.
5. `node tests/verify-layout.js`: 1162 passed, 0 failed.

## Troubleshooting

- **"the project folder changed underneath ... while it was being written."**
  Two consecutive failures. Something else is writing to the folder — a git
  checkout, a sync client, an editor saving on a timer. Stop it and publish
  again.
- **"That folder is not the site directory"** now means only that: no
  `index.html` or no `assets/` at the chosen path.
- A publish that stops partway never leaves a dangling reference. Both
  routines write and patch first and delete last, so the worst case is a file
  nothing points at yet.

## Related Files

- `site/js/admin-fs.js` — `retrying`, `isStaleHandle`, `looksLikePublishDir`
- `site/js/admin.js` — `publishBlog`, `publishRecord`
- `docs/error-fixes/PUBLISH_DELETED_THUMBNAILS_BEFORE_REWRITING_MARKUP.md`
