import { LRUCache } from 'lru-cache'

export type CachedViewEntry<T> = {
  data: T
  cached_at: string
  expires_at: string
}

// Global in-memory cache instance (max 1000 records, 5m default TTL)
const cache = new LRUCache<string, any>({
  max: 1000,
  ttl: 5 * 60 * 1000,
})
const userGenerations = new Map<string, number>()

export function getUserViewCacheGeneration(userId: string): number {
  return userGenerations.get(userId) ?? 0
}

export function buildViewCacheId(name: string, scope: Record<string, unknown>) {
  return `${name}:${JSON.stringify(scope)}`
}

export async function readViewCache<T>(userId: string, cacheId: string): Promise<T | null> {
  const key = `${userId}:${cacheId}`
  const entry = cache.get(key)
  if (entry === undefined) return null
  return entry as T
}

export async function writeViewCache<T>(userId: string, cacheId: string, data: T, ttlMs: number, expectedGeneration?: number): Promise<void> {
  // A mutation may clear the cache while this GET is still querying the DB.
  // Never allow that older response to repopulate post-mutation cache state.
  if (expectedGeneration !== undefined && getUserViewCacheGeneration(userId) !== expectedGeneration) return
  const key = `${userId}:${cacheId}`
  cache.set(key, data, { ttl: ttlMs })
}

export async function clearUserViewCache(userId: string): Promise<void> {
  userGenerations.set(userId, getUserViewCacheGeneration(userId) + 1)
  const prefix = `${userId}:`
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key)
    }
  }
}

