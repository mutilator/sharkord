/**
 * electron-store wrapper that mirrors the web client's localStorage/sessionStorage API.
 * in electron, we use the native browser localStorage which persists to disk automatically
 * in the app's userData directory.
 */

type StorageKey = string;

/**
 * In Electron, sessionStorage works like the web version.
 * It's not persisted between app restarts.
 */
export const getSessionStorageItem = (key: StorageKey): string | null => {
  return sessionStorage.getItem(key);
};

export const setSessionStorageItem = (
  key: StorageKey,
  value: string,
): void => {
  sessionStorage.setItem(key, value);
};

export const removeSessionStorageItem = (key: StorageKey): void => {
  sessionStorage.removeItem(key);
};

/**
 * Mirror localStorage API for compatibility.
 * In Electron, we use the native browser localStorage which persists to disk
 * in the app's userData directory automatically.
 */
export const getLocalStorageItem = (key: StorageKey): string | null => {
  // Safety check: if key is undefined or empty, return null
  if (!key || typeof key !== 'string') {
    return null;
  }
  
  return localStorage.getItem(key);
};

export const setLocalStorageItem = (
  key: StorageKey,
  value: string,
): void => {
  localStorage.setItem(key, value);
};

export const removeLocalStorageItem = (key: StorageKey): void => {
  localStorage.removeItem(key);
};

export const getLocalStorageItemBool = (key: StorageKey): boolean => {
  const value = getLocalStorageItem(key);
  return value === 'true';
};

export const setLocalStorageItemBool = (
  key: StorageKey,
  value: boolean,
): void => {
  setLocalStorageItem(key, value ? 'true' : 'false');
};
