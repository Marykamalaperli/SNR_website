export const AUTH_STORAGE_KEY = 'snr-nest-auth';

export function createAuthStorage(getStorage = () => globalThis.sessionStorage) {
  const fallback = new Map();
  return {
    getItem(key) {
      try {
        return getStorage()?.getItem(key) ?? fallback.get(key) ?? null;
      } catch {
        return fallback.get(key) ?? null;
      }
    },
    setItem(key, value) {
      fallback.set(key, value);
      try {
        getStorage()?.setItem(key, value);
      } catch {
        /* Memory-only when browser storage is blocked. */
      }
    },
    removeItem(key) {
      fallback.delete(key);
      try {
        getStorage()?.removeItem(key);
      } catch {
        /* Clear the memory fallback as well. */
      }
    },
  };
}

export const authStorage = createAuthStorage();
