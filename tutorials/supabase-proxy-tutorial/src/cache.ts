import * as Kv from "@spinframework/spin-kv";

interface CacheData {
  expiresAt: string,
  data: any
}

export const ALL_ARTICLES_CACHE_KEY = "all-articles";

export function buildKey(id: string): string {
  return `article-${id}`;
}

export function readFromCache(key: string): any | undefined {
  console.log(`Reading from Cache with key: ${key}`);
  const store = Kv.openDefault();
  if (!store.exists(key)) {
    return undefined;
  }
  const cacheData = store.getJson(key);
  return onlyValidCacheData(cacheData);
};

export function storeInCache(key: string, value: any, ttl: number) {
  console.log(`Storing data in Cache at ${key}`);
  const store = Kv.openDefault();
  store.setJson(key, buildCacheData(value, ttl));
  if (key !== ALL_ARTICLES_CACHE_KEY && store.exists(ALL_ARTICLES_CACHE_KEY)) {
    console.log(`Invalidating data from Cache at ${ALL_ARTICLES_CACHE_KEY}`);
    store.delete(ALL_ARTICLES_CACHE_KEY);
  }
}

export function invalidate(key: string) {
  console.log(`Invalidating data from Cache at ${key}`);
  const store = Kv.openDefault();
  if (store.exists(key)) {
    store.delete(key);
  }
  if (key !== ALL_ARTICLES_CACHE_KEY && store.exists(ALL_ARTICLES_CACHE_KEY)) {
    console.log(`Invalidating data from Cache at ${ALL_ARTICLES_CACHE_KEY}`);
    store.delete(ALL_ARTICLES_CACHE_KEY);
  }
}

const buildCacheData = (data: any, ttl: number): CacheData => {
  return {
    expiresAt: new Date(Date.now() + ttl * 60 * 1000).toISOString(),
    data: data
  } as CacheData;
}

const onlyValidCacheData = (cacheItem: CacheData): any | undefined => {
  const now = new Date();
  const expiresAt = new Date(cacheItem.expiresAt);
  if (now > expiresAt) {
    return undefined;
  }
  return cacheItem.data;
}
