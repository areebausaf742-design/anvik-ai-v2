/**=============================================================================
 * ANVIK AI — Edge Cache (Enterprise Performance)
 * ============================================================================
 * Provides edge-response caching for AI API responses.
 * Caches Gemini API responses at the edge to reduce latency and
 * provider costs. Uses short TTL caching with stale-while-revalidate
 * strategy.
 * ==========================================================================*/

/** Edge cache entry */
export interface EdgeCacheEntry {
  /** Cache key */
  key: string;
  /** Cached response */
  response: Response;
  /** Timestamp when cached */
  cachedAt: number;
  /** TTL in ms */
  ttlMs: number;
  /** Whether the entry is stale */
  stale: boolean;
}

/** Edge cache configuration */
export interface EdgeCacheConfig {
  /** Default TTL in ms (default: 60 seconds) */
  defaultTtlMs?: number;
  /** Maximum cache size in entries */
  maxSize?: number;
  /** Whether to enable stale-while-revalidate */
  staleWhileRevalidate?: boolean;
  /** Maximum age of stale entry before forced revalidation */
  maxStaleAgeMs?: number;
}

/** In-memory edge cache implementation (for edge runtime or edge functions) */
export class EdgeCache {
  private cache: Map<string, EdgeCacheEntry> = new Map();
  private config: EdgeCacheConfig;
  private accessOrder: string[] = []; // LRU tracking

  constructor(config: EdgeCacheConfig = {}) {
    this.config = {
      defaultTtlMs: 60_000, // 60 seconds default
      maxSize: 1000,
      staleWhileRevalidate: true,
      maxStaleAgeMs: 5_000, // 5 seconds max stale age
      ...config,
    };
  }

  /** Get a cached entry if it exists and is not expired */
  get(key: string): EdgeCacheEntry | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if entry has expired
    const age = Date.now() - entry.cachedAt;
    if (age > entry.ttlMs) {
      // Entry has expired, remove it
      this.delete(key);
      return null;
    }

    // Move to end of LRU order (most recently accessed)
    this.updateAccessOrder(key);

    // Mark as stale if we're within the SWR window
    if (this.config.staleWhileRevalidate) {
      const staleAge = Date.now() - entry.cachedAt;
      entry.stale = staleAge > (entry.ttlMs - this.config.maxStaleAgeMs ?? 0);
    }

    return entry;
  }

  /** Set a cached entry */
  set(key: string, response: Response, ttlMs?: number): void {
    const entryTtl = ttlMs ?? this.config.defaultTtlMs;

    // Create the entry
    const entry: EdgeCacheEntry = {
      key,
      response: response.clone(),
      cachedAt: Date.now(),
      ttlMs: entryTtl,
      stale: false,
    };

    // If cache is at max size, remove the least recently used entry
    if (this.cache.size >= this.config.maxSize ?? 1000 && !this.cache.has(key)) {
      const lruKey = this.accessOrder[0];
      if (lruKey) {
        this.cache.delete(lruKey);
        this.accessOrder.shift();
      }
    }

    // Store the entry
    this.cache.set(key, entry);

    // Update access order
    this.updateAccessOrder(key);
  }

  /** Check if a key exists in cache (without retrieving it) */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check if expired
    const age = Date.now() - entry.cachedAt;
    if (age > (entry.ttlMs ?? this.config.defaultTtlMs)) {
      return false;
    }

    return true;
  }

  /** Delete a cache entry */
  delete(key: string): boolean {
    const removed = this.cache.delete(key);
    this.accessOrder = this.accessOrder.filter((k) => k !== key);
    return removed;
  }

  /** Get the cached response for a key, or null if not found/expired */
  async getResponse(key: string): Promise<Response | null> {
    const entry = this.get(key);
    if (!entry) return null;
    return entry.response;
  }

  /** Invalidate a cache entry (force revalidation) */
  invalidate(key: string): void {
    this.delete(key);
  }

  /** Invalidate all cache entries */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  /** Get cache size */
  getSize(): number {
    return this.cache.size;
  }

  /** Get all cache keys */
  getKeys(): string[] {
    return Array.from(this.cache.keys());
  }

  /** Get cache statistics */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    missCount: number;
    hitCount: number;
  } {
    // Calculate hit/miss rates (simplified)
    // In a full implementation, would track accesses
    return {
      size: this.cache.size,
      maxSize: this.config.maxSize ?? 1000,
      hitRate: 0,
      missCount: 0,
      hitCount: 0,
    };
  }

  /** Update the access order for LRU tracking */
  private updateAccessOrder(key: string): void {
    // Remove existing occurrence
    this.accessOrder = this.accessOrder.filter((k) => k !== key);
    // Add to end (most recently used)
    this.accessOrder.push(key);
  }
}

/** Create an edge cache instance */
export function createEdgeCache(config: EdgeCacheConfig = {}): EdgeCache {
  return new EdgeCache(config);
}

/** Cache an AI response at the edge */
export function cacheAiResponse(
  cache: EdgeCache,
  feature: "chat" | "code" | "image" | "voice" | "vision" | "ask",
  model: string,
  inputTokens: number,
  outputTokens: number,
  response: Response,
): void {
  const key = `anvik-ai-${feature}-${model}-${inputTokens}i-${outputTokens}t`;
  cache.set(key, response);
}

/** Get a cached AI response */
export function getCachedAiResponse(
  cache: EdgeCache,
  feature: "chat" | "code" | "image" | "voice" | "vision" | "ask",
  model: string,
  inputTokens: number,
  outputTokens: number,
): Response | null {
  const key = `anvik-ai-${feature}-${model}-${inputTokens}i-${outputTokens}t`;
  return cache.getResponse(key);
}

/** Generate a cache key for an AI request */
export function generateCacheKey(
  feature: "chat" | "code" | "image" | "voice" | "vision" | "ask",
  model: string,
  inputTokens: number,
  outputTokens: number,
  conversationId?: string,
): string {
  const base = `anvik-ai-${feature}-${model}-${inputTokens}i-${outputTokens}t`;
  if (conversationId) {
    return `${base}-${conversationId}`;
  }
  return base;
}