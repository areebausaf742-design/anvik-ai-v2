/**=============================================================================
 * ANVIK AI — Service Worker (PWA Offline Support)
 * ============================================================================
 * Provides offline caching and offline queue synchronization for the
 * ANVIK AI Progressive Web App. Caches essential assets and enables
 * background sync for AI requests when the network is restored.
 * ==========================================================================*/

const CACHE_NAME = "anvik-ai-v2";
const OFFLINE_QUEUE_STORE = "anvik-offline-queue";

// Cache the essential assets used by the app shell
const ASSETS_TO_CACHE = [
  "/",
  "/_app/immutable/next/dist/pages/*",
  "/favicon.ico",
  "/icon.svg",
  "/apple-icon.png",
  "/robots.txt",
  "/sitemap.xml",
];

// Install event - cache essential assets
self.addEventListener("install", (event: ExtendableEvent) => {
  // console.info("Service Worker: Installing…");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE.map((asset) => {
        // Ensure we have a valid URL
        const url = new URL(asset, self.location.origin).href;
        // console.info(`Caching ${url}`);
        return url;
      }));
    }),
  );
  // Force the waiting service worker to become the active SW immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener("activate", (event: ExtendableEvent) => {
  // console.info("Service Worker: Activating…");
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            // console.info(`Service Worker: Removing old cache ${cache}`);
            return caches.delete(cache);
          }
        }),
      );
    }),
  );
  // Claim all clients immediately so the SW controls the page right away
  self.clients.claim();
});

// Fetch event - serve from cache, fall back to network
self.addEventListener("fetch", (event: FetchEvent) => {
  // Only handle GET requests and same-origin URLs
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Only cache same-origin requests
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Return cached response if available
      if (cachedResponse) {
        // console.info(`Cache hit for ${event.request.url}`);
        return cachedResponse;
      }

      // Otherwise, fetch from network
      // console.info(`Network fetch for ${event.request.url}`);
      return fetch(event.request).then((networkResponse) => {
        // Don't cache non-GET responses or error responses
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== "basic") {
          return networkResponse;
        }

        // Clone the response since it's a stream
        const responseToCache = networkResponse.clone();

        caches.open(CACHE_NAME).then((cache) => {
          // Don't cache overly large responses
          if (networkResponse.headers.get("content-length") && 
              parseInt(networkResponse.headers.get("content-length")) > 10 * 1024 * 1024) {
            return;
          }

          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch((err) => {
        // console.error(`Fetch error for ${event.request.url}`, err);

        // If we're offline, try to serve from cache with a fallback
        return cachedResponse || new Response("Offline", {
          status: 503,
          statusText: "Service Unavailable",
        });
      });
    }),
  );
});

// Background sync for offline queue
self.addEventListener("sync", (event: SyncEvent) => {
  if (event.tag === "anvik-ai-queue-sync") {
    event.waitUntil(syncOfflineQueue());
  }
});

/** Sync the offline queue with the backend */
async function syncOfflineQueue(): Promise<void> {
  const db = await (indexedDB as any).openDB("anvik-ai-db", 1);

  const tx = db.transaction("offline-queue", "readwrite");
  const store = tx.objectStore("offline-queue");
  const request = store.getAll();

  await new Promise<void>((resolve, reject) => {
    request.onsuccess = async () => {
      const items = request.result;

      // Send each item to the backend
      for (const item of items) {
        try {
          const response = await fetch("/api/offline-queue/sync", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(item),
          });

          if (response.ok) {
            // Remove the synced item from the store
            const deleteRequest = store.delete(item.id);
            await new Promise<void>((resolve2) => {
              deleteRequest.once("success", resolve2);
            });
          }
        } catch (err) {
          // console.error(`Failed to sync offline item ${item.id}`, err);
        }
      }

      tx.complete.then(() => {
        // console.info("Offline queue synced successfully");
        resolve();
      });
    };

    request.onerror = () => {
      tx.error.then(() => {
        reject(request.error);
      });
    };
  });
}

// Message listener for communication with the app
self.addEventListener("message", (event: MessageEvent) => {
  if (event.data && event.data.type === "ANVIK_SYNC_QUEUE") {
    syncOfflineQueue().catch((err) => {
      // console.error("Sync on message failed", err);
    });
  }
});