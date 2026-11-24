function createTtlCache({ maxEntries = 300 } = {}) {
  const entries = new Map();
  const inFlight = new Map();

  const pruneExpired = (now) => {
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) entries.delete(key);
    }
  };

  const get = (key) => {
    const entry = entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      entries.delete(key);
      return undefined;
    }
    return entry.value;
  };

  const set = (key, value, ttlMs) => {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) return value;
    const now = Date.now();
    if (entries.size >= maxEntries && !entries.has(key)) {
      pruneExpired(now);
      if (entries.size >= maxEntries) {
        const oldestKey = entries.keys().next().value;
        if (oldestKey !== undefined) entries.delete(oldestKey);
      }
    }
    entries.set(key, { value, expiresAt: now + ttlMs });
    return value;
  };

  const getOrSet = async (key, ttlMs, loader) => {
    const cached = get(key);
    if (cached !== undefined) return cached;

    if (inFlight.has(key)) {
      return inFlight.get(key);
    }

    const generationToken = Symbol('cache-load');
    const promise = Promise.resolve()
      .then(loader)
      .then((value) => {
        // Only write to cache if this load was not invalidated while in flight.
        if (inFlight.get(key) === promise && promise._token === generationToken) {
          set(key, value, ttlMs);
        }
        return value;
      })
      .finally(() => {
        if (inFlight.get(key) === promise) {
          inFlight.delete(key);
        }
      });
    promise._token = generationToken;
    inFlight.set(key, promise);
    return promise;
  };

  const invalidate = (prefix = '') => {
    if (!prefix) {
      entries.clear();
      inFlight.clear();
      return;
    }
    for (const key of [...entries.keys()]) {
      if (key.startsWith(prefix)) entries.delete(key);
    }
    for (const key of [...inFlight.keys()]) {
      if (key.startsWith(prefix)) inFlight.delete(key);
    }
  };

  const clear = () => {
    entries.clear();
    inFlight.clear();
  };

  return {
    get,
    set,
    getOrSet,
    invalidate,
    clear,
    size: () => entries.size
  };
}

const appCache = createTtlCache({ maxEntries: 300 });

const invalidatePublicListingCaches = () => {
  appCache.invalidate('properties:guest:');
  appCache.invalidate('plus:official-preview');
  appCache.invalidate('preferences:options:');
};

module.exports = { createTtlCache, appCache, invalidatePublicListingCaches };
