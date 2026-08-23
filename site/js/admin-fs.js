/* ==========================================================================
   TemplateBox - Project Folder Access (admin.html only)

   Wraps the File System Access API so the admin panel can write generated
   files straight into the working copy instead of routing everything through
   the downloads folder and the clipboard.

   Why this exists: a page cannot reach the file system on its own, and that
   is a browser security rule rather than a gap in this project -- any site
   you visit could otherwise rewrite your files. This API is the sanctioned
   exception: the operator picks a folder once, in a native dialog this code
   cannot script, and the grant covers that folder and nothing else.

   Scope limits worth knowing before extending this:
   - Chromium only (Chrome, Edge). Firefox and Safari ship no
     showDirectoryPicker, so `supported()` is false there and every caller
     must keep working through the download/copy path.
   - The handle survives a restart via IndexedDB, but the PERMISSION does
     not. A restored handle needs requestPermission from a user gesture, so
     restore() reports "needs-permission" rather than prompting on load.
   - Writes are per-file and not atomic across files. A publish that fails
     halfway leaves the earlier files written, which is why the caller
     patches markup last: an orphaned image is inert, a markup edit
     referencing a file that was never written is a broken card.

   This file is loaded by admin.html alone. It is never referenced by any
   public page.
   ========================================================================== */

"use strict";

window.TBProjectFolder = (() => {

    const DB_NAME = "tb-admin-fs";
    const DB_STORE = "handles";
    const HANDLE_KEY = "site-dir";

    /* The live handle, or null. Deliberately module-private: nothing outside
       should be able to hand this module a directory it did not verify. */
    let dirHandle = null;

    function supported() {
        return typeof window.showDirectoryPicker === "function";
    }

    /* ----------------------------------------------------------------------
       Handle persistence.

       A FileSystemDirectoryHandle is structured-cloneable, so IndexedDB can
       store it verbatim; localStorage cannot, because it stores strings.
       ---------------------------------------------------------------------- */
    function openDb() {
        return new Promise((resolve, reject) => {
            const request = window.indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains(DB_STORE)) {
                    request.result.createObjectStore(DB_STORE);
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error("IndexedDB unavailable"));
        });
    }

    function dbPut(key, value) {
        return openDb().then((db) => new Promise((resolve, reject) => {
            const tx = db.transaction(DB_STORE, "readwrite");
            tx.objectStore(DB_STORE).put(value, key);
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); reject(tx.error); };
        }));
    }

    function dbGet(key) {
        return openDb().then((db) => new Promise((resolve, reject) => {
            const tx = db.transaction(DB_STORE, "readonly");
            const req = tx.objectStore(DB_STORE).get(key);
            req.onsuccess = () => { db.close(); resolve(req.result || null); };
            req.onerror = () => { db.close(); reject(req.error); };
        }));
    }

    function dbDelete(key) {
        return openDb().then((db) => new Promise((resolve, reject) => {
            const tx = db.transaction(DB_STORE, "readwrite");
            tx.objectStore(DB_STORE).delete(key);
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); reject(tx.error); };
        }));
    }

    /* ----------------------------------------------------------------------
       Permission.

       queryPermission and requestPermission are absent on handles that did
       not come from a picker (an origin-private handle, for instance) and on
       browsers with partial support. Absent means there is nothing to ask
       for, so treat it as granted rather than as a failure -- refusing would
       break a handle that is already fully usable.
       ---------------------------------------------------------------------- */
    async function queryPermission(handle) {
        if (!handle || typeof handle.queryPermission !== "function") {
            return "granted";
        }
        return handle.queryPermission({ mode: "readwrite" });
    }

    async function requestPermission(handle) {
        if (!handle || typeof handle.requestPermission !== "function") {
            return "granted";
        }
        return handle.requestPermission({ mode: "readwrite" });
    }

    /* Refuses any folder that is not the publish directory. Without this the
       operator can point the panel at their home folder or the repository
       root by mistake and the first publish writes assets/ and index.html
       into it -- a mess that looks like a bug in this code and is not. The
       two entries checked are exactly what every path this module writes is
       relative to. */
    async function looksLikePublishDir(handle) {
        try {
            await handle.getFileHandle("index.html");
            await handle.getDirectoryHandle("assets");
            return true;
        } catch (err) {
            return false;
        }
    }

    /* ----------------------------------------------------------------------
       Connection
       ---------------------------------------------------------------------- */
    async function connect() {
        if (!supported()) {
            throw new Error("This browser cannot open a project folder. Chrome or Edge can; Firefox and Safari cannot.");
        }
        const picked = await window.showDirectoryPicker({
            id: "templatebox-site",
            mode: "readwrite"
        });
        if (await requestPermission(picked) !== "granted") {
            throw new Error("Write permission was not granted, so nothing can be published.");
        }
        if (!await looksLikePublishDir(picked)) {
            throw new Error("That folder is not the site directory: it has no index.html and no assets folder. Choose the site folder inside the project, not the project root.");
        }
        dirHandle = picked;
        try {
            await dbPut(HANDLE_KEY, picked);
        } catch (err) {
            /* Storage refused the handle. The connection still works for
               this session; it just will not survive a reload. */
        }
        return picked.name;
    }

    /* Reads back a stored handle WITHOUT prompting. Returns the state so the
       caller can offer a reconnect button rather than firing a permission
       prompt at page load, which browsers reject outside a user gesture
       anyway. */
    async function restore() {
        if (!supported()) {
            return "unsupported";
        }
        let stored = null;
        try {
            stored = await dbGet(HANDLE_KEY);
        } catch (err) {
            return "disconnected";
        }
        if (!stored) {
            return "disconnected";
        }
        if (await queryPermission(stored) === "granted") {
            dirHandle = stored;
            return "connected";
        }
        dirHandle = null;
        return "needs-permission";
    }

    /* Re-grants a stored handle. Must be called from a user gesture. */
    async function reconnect() {
        const stored = await dbGet(HANDLE_KEY);
        if (!stored) {
            throw new Error("No project folder is remembered. Connect one.");
        }
        if (await requestPermission(stored) !== "granted") {
            throw new Error("Write permission was not granted.");
        }
        dirHandle = stored;
        return stored.name;
    }

    async function disconnect() {
        dirHandle = null;
        try {
            await dbDelete(HANDLE_KEY);
        } catch (err) {
            /* Nothing stored, or storage unavailable. */
        }
    }

    function isConnected() {
        return dirHandle !== null;
    }

    function folderName() {
        return dirHandle ? dirHandle.name : "";
    }

    /* ----------------------------------------------------------------------
       File operations. Every path is relative to the connected folder and
       uses forward slashes, matching the src attributes the generated markup
       writes, so one string describes both the file and the reference to it.
       ---------------------------------------------------------------------- */
    function requireHandle() {
        if (!dirHandle) {
            throw new Error("No project folder is connected.");
        }
        return dirHandle;
    }

    function split(relPath) {
        const parts = String(relPath).split("/").filter(Boolean);
        const name = parts.pop();
        if (!name) {
            throw new Error("Not a file path: " + relPath);
        }
        /* ".." would climb out of the granted folder. The API rejects it
           too, but failing here names the actual problem. */
        if (parts.indexOf("..") >= 0 || name === "..") {
            throw new Error("Path may not contain \"..\": " + relPath);
        }
        return { dirs: parts, name: name };
    }

    async function resolveDir(dirs, create) {
        let dir = requireHandle();
        for (const segment of dirs) {
            dir = await dir.getDirectoryHandle(segment, { create: create });
        }
        return dir;
    }

    async function writeFile(relPath, data) {
        const { dirs, name } = split(relPath);
        const dir = await resolveDir(dirs, true);
        const file = await dir.getFileHandle(name, { create: true });
        const stream = await file.createWritable();
        await stream.write(data);
        await stream.close();
    }

    async function readText(relPath) {
        const { dirs, name } = split(relPath);
        const dir = await resolveDir(dirs, false);
        const file = await dir.getFileHandle(name, { create: false });
        return (await file.getFile()).text();
    }

    async function deleteFile(relPath) {
        const { dirs, name } = split(relPath);
        try {
            const dir = await resolveDir(dirs, false);
            await dir.removeEntry(name);
            return true;
        } catch (err) {
            return false;
        }
    }

    async function listDir(relDir) {
        const dirs = String(relDir || "").split("/").filter(Boolean);
        const names = [];
        try {
            const dir = await resolveDir(dirs, false);
            for await (const entry of dir.values()) {
                if (entry.kind === "file") {
                    names.push(entry.name);
                }
            }
        } catch (err) {
            /* Folder does not exist yet; nothing to list. */
        }
        return names;
    }

    return {
        supported,
        isConnected,
        folderName,
        connect,
        reconnect,
        restore,
        disconnect,
        writeFile,
        readText,
        deleteFile,
        listDir
    };
})();
