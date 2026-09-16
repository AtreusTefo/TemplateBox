/* ==========================================================================
   TemplateBox - service worker

   THIS WORKER DELIBERATELY CACHES ALMOST NOTHING, AND THAT IS THE POINT.

   It exists for exactly two reasons:

     1. Chrome will not offer the install prompt for a site whose worker has
        no fetch handler. This is the fetch handler. Without it there is no
        "Install" entry on Android or desktop and the manifest alone gets you
        nothing but a nicer bookmark. (iOS ignores service workers for
        Add to Home Screen, so this file is not what makes it work there.)

     2. A navigation that cannot reach the network should land on
        offline.html rather than the browser's own error screen, so an
        installed app with no signal reads as "no connection" rather than
        "this app crashed and took my documents with it".

   EVERY OTHER REQUEST PASSES STRAIGHT THROUGH, UNTOUCHED AND UNCACHED, and
   the next maintainer should leave it that way. The reasoning, because it is
   not obvious and it is the kind of thing a well-meaning performance pass
   would undo:

   TemplateBox is paid for by advertising. Offline capability is therefore
   worth nothing here -- a page that renders with no network renders with no
   ad call, so a visitor served from cache is a visitor who costs bandwidth
   and returns zero. Caching the site's own CSS and JS would NOT cost
   impressions (the ad network's script makes its own request to its own
   server regardless of where the page markup came from), so the argument
   against it is a different one and it is about this project specifically:

   TemplateBox has no build step. Nothing stamps a hash onto css/style.css or
   js/poster.js, and nothing would bump the version constant below on deploy.
   A cached editor script therefore goes stale the moment it is fixed, and
   stays stale until somebody remembers a manual step -- forever, on every
   deploy. The failure mode is a bug report you cannot reproduce because your
   own copy is fresh. Meanwhile Netlify already serves these files with
   validators and the browser already revalidates them, which is the same
   speed win with none of the discipline.

   The single cached file is offline.html, and it is the one acceptable
   exception because it has no content that can go out of date: no ad hosts,
   no editor code, no catalog, no prices. If that ever stops being true, this
   file needs a version bump to match.

   AND NEVER CACHE js/ads.js OR loading.html. Beyond the staleness, a cached
   ad script makes a dead zone and a stale copy indistinguishable from one
   another, which turns the next zero-impressions morning into a guess. That
   bug has already cost this project three days once.

   Full reasoning: docs/implementation/PWA_INSTALLABLE_APP.md
   ========================================================================== */

"use strict";

/* Bump when offline.html changes. It is the only cached file, so this is the
   only thing the version governs; activate() drops every cache that is not
   this exact name, so an old shell cannot survive a bump. */
const CACHE = "tb-shell-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        /* cache: "reload" so the install fetches from the network rather than
           picking up whatever the HTTP cache happens to be holding. Installing
           a stale offline page out of the browser cache would be a stale copy
           of the only file here that is allowed to be cached at all. */
        await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
    })());

    /* Safe here specifically BECAUSE nothing else is cached. The usual danger
       of skipWaiting is a page that has already loaded old assets suddenly
       being served new ones by a worker that took over mid-session; with a
       pass-through worker there are no assets to mismatch. */
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(
            names.filter((name) => name !== CACHE).map((name) => caches.delete(name))
        );
        await self.clients.claim();
    })());
});

self.addEventListener("fetch", (event) => {
    const request = event.request;

    /* Navigations only. Everything else -- stylesheets, scripts, images, ad
       iframes, font files, XHR -- is left alone by NOT calling respondWith at
       all, which hands it back to the browser's own networking stack with no
       worker in the path. Returning fetch(request) here instead would look
       identical and would route every subresource on the site through this
       worker for no benefit. */
    if (request.mode !== "navigate") {
        return;
    }

    /* A worker cannot replay a POST body, and this site has no forms that
       submit anywhere regardless. Leave them to the browser. */
    if (request.method !== "GET") {
        return;
    }

    event.respondWith((async () => {
        try {
            /* preloadResponse is only present if navigation preload were
               enabled, which it is not; awaiting it costs nothing and keeps
               this correct if it ever is. */
            const preloaded = await event.preloadResponse;
            if (preloaded) {
                return preloaded;
            }
            return await fetch(request);
        } catch (err) {
            /* Reached ONLY when the request could not be made at all. A 404 or
               a 500 is a successful fetch and is returned above untouched --
               404.html is a real page of this site and must not be replaced by
               an offline notice, which would tell the visitor their connection
               is broken when their connection is fine. */
            const cache = await caches.open(CACHE);
            const offline = await cache.match(OFFLINE_URL);
            if (offline) {
                return offline;
            }
            /* Cache evicted and no network: nothing left to serve. Rethrowing
               gives the browser's own error page, which is where this started
               and is still better than a blank frame. */
            throw err;
        }
    })());
});
