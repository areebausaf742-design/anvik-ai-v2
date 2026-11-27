/**=============================================================================
 * ANVIK AI — Offline Queue (Enterprise Reliability)
 * ============================================================================
 * Provides a persistent offline request queue using IndexedDB.
 * Queues AI requests when the network is unavailable and auto-syncs
 * when connectivity is restored. Integrates with the service worker
 * for background synchronization.
 * ==========================================================================*/

/** Offline queue entry */
export interface OfflineQueueEntry {
  /** Unique identifier for the entry */
  id: string;
  /** The request data to replay */
  request: {
    method: string;
    url: string;
    body?: unknown;
    headers?: Record<string, string>;
  };
  /** The handler to execute when the request is synced */
  handler: (response: Response) => Promise<void>;
  /** Whether the entry has been synced */
  synced: boolean;
  /** When the entry was created */
  createdAt: number;
  /** Optional timeout in ms */
  timeoutMs?: number;
  /** Number of retry attempts */
  retryCount: number;
}

/** Offline queue state */
export type OfflineQueueState = "idle" | "syncing" | "offline" | "error";

/** Offline queue events */
export interface OfflineQueueEvents {
  /** Fired when the queue state changes */
  onstatechange: (state: OfflineQueueState) => void;
  /** Fired when an entry is added */
  onentryadded: (entry: OfflineQueueEntry) => void;
  /** Fired when an entry is synced */
  onentriesynced: (entryId: string) => void;
  /** Fired when an entry fails after max retries */
  onentryfailed: (entry: OfflineQueueEntry) => void;
}

/** IndexedDB-based offline queue implementation */
export class OfflineQueue {
  private db: IDBDatabase | null = null;
  private state: OfflineQueueState = "idle";
  private eventListeners: OfflineQueueEvents = {
    onstatechange: () => {},
    onentryadded: () => {},
    onentriesynced: () => {},
    onentryfailed: () => {},
  };
  private pendingSyncPromise: Promise<void> | null = null;

  /** Initialize the IndexedDB database */
  async initialize(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("anvik-ai-offline-queue", 1);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBRequest).result;

        // Create the offline-queue object store if it doesn't exist
        if (!db.objectStoreNames.contains("offline-queue")) {
          const store = db.createObjectStore("offline-queue", {
            keyPath: "id",
            autoIncrement: false,
          });

          // Create index for tracking sync status
          store.createIndex("synced", "synced", { unique: false });
          store.createIndex("createdAt", "createdAt", { unique: false });
          store.createIndex("timeoutMs", "timeoutMs", { unique: false });
        }
      };

      request.onsuccess = (event) => {
        const db = (event.target as IDBRequest).result;
        this.db = db;

        // Check if the app is back online and sync immediately
        if (navigator.onLine) {
          void this.sync().catch((err) => {
            // Best-effort sync failure, ignore
          });
        }

        resolve();
      };

      request.onerror = () => {
        // console.error("OfflineQueue: IndexedDB error", request.error);
        reject(request.error);
      };
    });
  }

  /** Get the current queue state */
  getState(): OfflineQueueState {
    return this.state;
  }

  /** Subscribe to state changes */
  on(event: keyof OfflineQueueEvents, listener: Function): void {
    this.eventListeners[event] = listener;
  }

  /** Fire state change event */
  private fireStateChange(state: OfflineQueueState): void {
    this.state = state;
    this.eventListeners.onstatechange(state);
  }

  /** Add an entry to the offline queue */
  async addEntry(
    request: RequestInfo,
    handler: (response: Response) => Promise<void>,
    options: { timeoutMs?: number } = {},
  ): Promise<string> {
    if (!this.db) {
      await this.initialize();
    }

    const entry: OfflineQueueEntry = {
      id: crypto.randomUUID(),
      request: {
        method: typeof request === "string" ? request : request.method,
        url: typeof request === "string" ? request : request.url,
        body: (request as Request).body,
        headers: (request as Request).headers,
      },
      handler,
      synced: false,
      createdAt: Date.now(),
      timeoutMs: options.timeoutMs,
      retryCount: 0,
    };

    return new Promise<string>((resolve) => {
      if (!this.db) {
        resolve(entry.id);
        return;
      }

      const tx = this.db!.transaction("offline-queue", "readwrite");
      const store = tx.objectStore("offline-queue");
      const addRequest = store.add(entry);

      addRequest.onsuccess = () => {
        this.fireStateChange("offline");
        this.eventListeners.onentryadded(entry);
        resolve(entry.id);
      };

      addRequest.onerror = () => {
        // console.error("OfflineQueue: Failed to add entry", addRequest.error);
        resolve(entry.id);
      };

      tx.oncomplete = () => {
        // console.info("OfflineQueue: Entry added and transaction complete");
      };

      tx.onerror = () => {
        // console.error("OfflineQueue: Transaction error", tx.error);
      };

      tx.abort();
    });
  }

  /** Get all entries in the queue */
  async getEntries(): Promise<OfflineQueueEntry[]> {
    if (!this.db) {
      await this.initialize();
    }

    if (!this.db) return [];

    return new Promise<OfflineQueueEntry[]>((resolve) => {
      const tx = this.db.transaction("offline-queue", "readonly");
      const store = tx.objectStore("offline-queue");
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result);
      };

      tx.onerror = () => {
        resolve([]);
      };
    });
  }

  /** Get un-synced entries */
  async getUnsyncedEntries(): Promise<OfflineQueueEntry[]> {
    const allEntries = await this.getEntries();
    return allEntries.filter((entry) => !entry.synced);
  }

  /** Mark an entry as synced */
  async markSynced(entryId: string): Promise<void> {
    if (!this.db) return;

    const tx = this.db.transaction("offline-queue", "readwrite");
    const store = tx.objectStore("offline-queue");
    const entry = await new Promise<OfflineQueueEntry>((resolve, reject) => {
      const request = store.get(entryId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    if (entry) {
      entry.synced = true;
      const updateRequest = store.put(entry);
      await new Promise<void>((resolve, reject) => {
        updateRequest.onsuccess = () => resolve();
        updateRequest.onerror = () => reject(updateRequest.error);
      });
    }

    tx.complete.then(() => {
      // Check if there are still un-synced entries
      void this.getUnsyncedEntries().then((entries) => {
        if (entries.length === 0) {
          this.fireStateChange("idle");
        }
      });
    });
  }

  /** Sync all un-synced entries */
  async sync(): Promise<void> {
    // Avoid concurrent syncs
    if (this.pendingSyncPromise) {
      return this.pendingSyncPromise;
    }

    this.pendingSyncPromise = (async () => {
      try {
        this.fireStateChange("syncing");
        const entries = await this.getUnsyncedEntries();

        for (const entry of entries) {
          // Check for timeout
          if (entry.timeoutMs && Date.now() - entry.createdAt > entry.timeoutMs) {
            // console.warn(`OfflineQueue: Entry ${entry.id} timed out`);
            entry.retryCount++;
            if (entry.retryCount >= 3) {
              // Max retries exceeded, mark as failed
              entry.synced = true; // Mark to remove it
              await this.markSynced(entry.id);
              this.eventListeners.onentryfailed(entry);
              continue;
            }
          }

          try {
            // Fetch the original request
            const url = new URL(entry.request.url, self.location.origin).href;
            const init: RequestInit = {
              method: entry.request.method,
              headers: entry.request.headers,
            };

            if (entry.request.body && typeof entry.request.body !== "string") {
              init.body = JSON.stringify(entry.request.body);
              init.headers = init.headers ?? {};
              init.headers["Content-Type"] = "application/json";
            }

            const response = await fetch(url, init);

            // Call the handler with the response
            await entry.handler(new Response(response.body, {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
            }));

            // Mark as synced
            await this.markSynced(entry.id);
            this.eventListeners.onentriesynced(entry.id);
          } catch (err) {
            // console.error(`OfflineQueue: Sync failed for ${entry.id}`, err);
            entry.retryCount++;
            // Retry later - don't mark as synced
          }
        }

        this.fireStateChange("idle");
      } catch (err) {
        // console.error("OfflineQueue: Sync error", err);
        this.fireStateChange("error");
      } finally {
        this.pendingSyncPromise = null;
      }
    })();

    return this.pendingSyncPromise;
  }

  /** Clear all entries from the queue */
  async clear(): Promise<void> {
    if (!this.db) return;

    const tx = this.db.transaction("offline-queue", "readwrite");
    const store = tx.objectStore("offline-queue");
    const deleteRequest = store.clear();

    await new Promise<void>((resolve, reject) => {
      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => reject(deleteRequest.error);
    });

    tx.complete.then(() => {
      this.fireStateChange("idle");
    });
  }
}

/** Create an offline queue instance */
export function createOfflineQueue(): OfflineQueue {
  return new OfflineQueue();
}

/** Queue summary for UI display */
export function queueSummary(state: OfflineQueueState): string {
  switch (state) {
    case "idle":
      return "Ready";
    case "syncing":
      return "Syncing…";
    case "offline":
      return "Offline";
    case "error":
      return "Error";
    default:
      return "Unknown";
  }
}