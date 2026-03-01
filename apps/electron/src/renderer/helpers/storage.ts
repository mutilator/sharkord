/**
 * Electron-compatible storage helpers that mirror the web client's API.
 * This module provides the same interface as apps/client/src/helpers/storage.ts
 * but uses electron-store for persistence instead of browser localStorage.
 */

import {
  getLocalStorageItem as electronGetLocalStorage,
  setLocalStorageItem as electronSetLocalStorage,
  removeSessionStorageItem as electronRemoveSessionStorage,
  getSessionStorageItem as electronGetSessionStorage,
  setSessionStorageItem as electronSetSessionStorage,
} from './electron-storage';

// Re-export the storage key enums from web client
export enum LocalStorageKey {
  IDENTITY = 'sharkord-identity',
  REMEMBER_CREDENTIALS = 'sharkord-remember-identity',
  USER_PASSWORD = 'sharkord-user-password',
  SERVER_PASSWORD = 'sharkord-server-password',
  VITE_UI_THEME = 'vite-ui-theme',
  DEVICES_SETTINGS = 'sharkord-devices-settings',
  FLOATING_CARD_POSITION = 'sharkord-floating-card-position',
  RIGHT_SIDEBAR_STATE = 'sharkord-right-sidebar-state',
  VOICE_CHAT_SIDEBAR_STATE = 'sharkord-voice-chat-sidebar-state',
  VOICE_CHAT_SIDEBAR_WIDTH = 'sharkord-voice-chat-sidebar-width',
  VOICE_CHAT_SHOW_USER_BANNERS = 'sharkord-voice-chat-show-user-banners',
  VOLUME_SETTINGS = 'sharkord-volume-settings',
  RECENT_EMOJIS = 'sharkord-recent-emojis',
  DEBUG = 'sharkord-debug',
  DRAFT_MESSAGES = 'sharkord-draft-messages',
  HIDE_NON_VIDEO_PARTICIPANTS = 'sharkord-hide-non-video-participants',
  THREAD_SIDEBAR_WIDTH = 'sharkord-thread-sidebar-width',
  LEFT_SIDEBAR_WIDTH = 'sharkord-left-sidebar-width',
  RIGHT_SIDEBAR_WIDTH = 'sharkord-right-sidebar-width',
  CATEGORIES_EXPANDED = 'sharkord-categories-expanded',
  AUTO_LOGIN = 'sharkord-auto-login',
  AUTO_LOGIN_TOKEN = 'sharkord-auto-login-token',
  LAST_SELECTED_CHANNEL = 'sharkord-last-selected-channel',
  AUTO_JOIN_LAST_CHANNEL = 'sharkord-auto-join-last-channel',
  SERVER_URL = 'sharkord-server-url',
}

export enum SessionStorageKey {
  TOKEN = 'sharkord-token',
}

export const getLocalStorageItem = (key: LocalStorageKey): string | null => {
  return electronGetLocalStorage(key);
};

export const getLocalStorageItemBool = (
  key: LocalStorageKey,
  defaultValue: boolean = false
): boolean => {
  const item = electronGetLocalStorage(key);

  if (item === null) {
    return defaultValue ?? false;
  }

  return item === 'true';
};

export const setLocalStorageItemBool = (
  key: LocalStorageKey,
  value: boolean
): void => {
  electronSetLocalStorage(key, value.toString());
};

export const getLocalStorageItemAsJSON = <T>(
  key: LocalStorageKey,
  defaultValue: T | undefined = undefined
): T | undefined => {
  const item = electronGetLocalStorage(key);

  if (item) {
    return JSON.parse(item) as T;
  }

  return defaultValue;
};

export const setLocalStorageItemAsJSON = <T>(
  key: LocalStorageKey,
  value: T
): void => {
  electronSetLocalStorage(key, JSON.stringify(value));
};

export const setLocalStorageItem = (
  key: LocalStorageKey,
  value: string
): void => {
  electronSetLocalStorage(key, value);
};

export const removeLocalStorageItem = (key: LocalStorageKey): void => {
  const currentValue = electronGetLocalStorage(key);
  if (currentValue !== null) {
    electronSetLocalStorage(key, '');
  }
};

export const getSessionStorageItem = (
  key: SessionStorageKey
): string | null => {
  return electronGetSessionStorage(key);
};

export const setSessionStorageItem = (
  key: SessionStorageKey,
  value: string
): void => {
  electronSetSessionStorage(key, value);
};

export const removeSessionStorageItem = (key: SessionStorageKey): void => {
  electronRemoveSessionStorage(key);
};
