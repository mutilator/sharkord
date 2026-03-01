import { BrowserWindow, ipcMain } from 'electron';
import Store from 'electron-store';

let uiohook: any = null;
let UiohookKey: Record<string, number> = {};

// store the BrowserWindow when registering so handlers can use it
let currentMainWindow: BrowserWindow | null = null;


// types ------------------------------------------------------------------
interface Hotkey {
  keycode?: number;       // keyboard keycode (uiohook/raw scan code)
  key?: string;           // fallback DOM key string ("v", "F1", etc.)
  button?: number;        // mouse button number (1=left,4=back,5=forward)
  alt: boolean;
  ctrl: boolean;
  shift: boolean;
  meta: boolean;
}

// helpers ----------------------------------------------------------------
// debug emitter for main->renderer and console; also keeps a short history so
// the renderer can request past messages later (useful when devtools open
// after events have already been sent).
const DEBUG_HISTORY_LIMIT = 200;
const debugHistory: Array<{ msg: string; data?: any }> = [];
const sendDebug = (msg: string, data?: any) => {
  // store in history
  debugHistory.push({ msg, data });
  if (debugHistory.length > DEBUG_HISTORY_LIMIT) {
    debugHistory.shift();
  }
  // forward to renderer if available
  if (currentMainWindow) {
    currentMainWindow.webContents.send('hotkeys:debug', { msg, data });
  }
};

// called via IPC when renderer wants the backlog
export const getDebugHistory = () => [...debugHistory];

const readPttHotkey = (): Hotkey =>
  (store.get?.('hotkeys.pushToTalk') as Hotkey | undefined) ?? DEFAULT_PTT_HOTKEY;

const hotkeyToName = (h: Hotkey): string => {
  const parts: string[] = [];
  if (h.ctrl) parts.push('Ctrl');
  if (h.alt) parts.push('Alt');
  if (h.shift) parts.push('Shift');
  if (h.meta) parts.push('Meta');
  if (h.button !== undefined) {
    parts.push(`Mouse${h.button}`);
  } else if (h.keycode !== undefined) {
    parts.push(KEYCODE_NAMES[h.keycode] ?? `Key(${h.keycode})`);
  } else if (h.key !== undefined) {
    // key string may be lowercase; normalize for display
    parts.push(h.key.toUpperCase());
  }
  return parts.join('+');
};

/**
/**
 * Helpers for matching events against the stored hotkey descriptor.
 */

const hotkeyMatches = (h: Hotkey, evt: any): boolean => {
  // first ensure modifier state matches exactly; if not, no need to
  // examine the key/button at all.
  const mods =
    h.alt === !!evt.altKey &&
    h.ctrl === !!evt.ctrlKey &&
    h.shift === !!evt.shiftKey &&
    h.meta === !!evt.metaKey;
  if (!mods) return false;

  // button-based hotkeys are simple: check numeric button property
  if (h.button !== undefined) {
    return typeof evt.button === 'number' && evt.button === h.button;
  }

  // try numeric keycodes (uiohook emits `keycode`, Electron uses `keyCode`)
  const evtCode =
    typeof evt.keycode === 'number'
      ? evt.keycode
      : typeof evt.keyCode === 'number'
      ? evt.keyCode
      : typeof evt.rawcode === 'number'
      ? evt.rawcode
      : undefined;

  if (h.keycode !== undefined && evtCode !== undefined) {
    return evtCode === h.keycode;
  }

  // fallback to comparing the string key name if provided
  if (h.key !== undefined && typeof evt.key === 'string') {
    return evt.key.toLowerCase() === h.key.toLowerCase();
  }

  return false;
};


// we delay loading the native hook until registerGlobalHotkeys is called
// because synchronous `require` in an ES module compiles to a bare
// `require()` call which doesn't exist at runtime.  the async import below
// avoids that issue.

// Reverse map: keycode number → display name (PC XT scan codes)
export const KEYCODE_NAMES: Record<number, string> = {
  1: 'Escape',
  2: '1', 3: '2', 4: '3', 5: '4', 6: '5', 7: '6', 8: '7', 9: '8', 10: '9', 11: '0',
  14: 'Backspace', 15: 'Tab',
  16: 'Q', 17: 'W', 18: 'E', 19: 'R', 20: 'T', 21: 'Y', 22: 'U', 23: 'I', 24: 'O', 25: 'P',
  30: 'A', 31: 'S', 32: 'D', 33: 'F', 34: 'G', 35: 'H', 36: 'J', 37: 'K', 38: 'L',
  44: 'Z', 45: 'X', 46: 'C', 47: 'V', 48: 'B', 49: 'N', 50: 'M',
  28: 'Enter', 29: 'LCtrl', 42: 'LShift', 54: 'RShift',
  56: 'LAlt', 57: 'Space', 58: 'CapsLock',
  59: 'F1', 60: 'F2', 61: 'F3', 62: 'F4', 63: 'F5', 64: 'F6',
  65: 'F7', 66: 'F8', 67: 'F9', 68: 'F10', 87: 'F11', 88: 'F12',
  91: 'F13', 92: 'F14', 93: 'F15', 94: 'F16',
  55: 'Numpad *', 71: 'Numpad 7', 72: 'Numpad 8', 73: 'Numpad 9',
  74: 'Numpad -', 75: 'Numpad 4', 76: 'Numpad 5', 77: 'Numpad 6',
  78: 'Numpad +', 79: 'Numpad 1', 80: 'Numpad 2', 81: 'Numpad 3',
  82: 'Numpad 0', 83: 'Numpad.',
  3612: 'REnter', 3613: 'RCtrl', 3637: 'Numpad/', 3640: 'RAlt',
  3655: 'Home', 3657: 'PageUp', 3663: 'End', 3665: 'PageDn',
  3666: 'Insert', 3667: 'Delete',
  57419: 'Left', 57420: 'Up', 57421: 'Right', 57424: 'Down',
  // mouse buttons are represented by event.button (1–5)
  // we'll synthesize names when formatting
};

export const getKeyName = (keycode: number): string =>
  KEYCODE_NAMES[keycode] ?? `Key(${keycode})`;

// Default PTT key: V (keycode 47)
const DEFAULT_PTT_KEYCODE: number = (UiohookKey['V'] as number | undefined) ?? 47;

// (used only to seed DEFAULT_PTT_HOTKEY below)
const DEFAULT_PTT_HOTKEY: Hotkey = {
  keycode: DEFAULT_PTT_KEYCODE,
  alt: false,
  ctrl: false,
  shift: false,
  meta: false,
};

const store: any = new Store();
let isPushToTalkActive = false;
let isRecordingKey = false;
let recordResolve: ((h: Hotkey) => void) | null = null;

// helper that turns a uiohook event or before-input-event into a Hotkey
const captureEvent = (evt: any): Hotkey => {
  // Create a normalized hotkey descriptor out of either a uiohook event or
  // Electron before-input-event. The latter uses camelCase `keyCode` and
  // string types like "keyDown"/"mouseDown", so we tolerant both forms.
  const base: Hotkey = {
    alt: !!evt.altKey,
    ctrl: !!evt.ctrlKey,
    shift: !!evt.shiftKey,
    meta: !!evt.metaKey,
  };

  const type = String(evt.type || '').toLowerCase();

  // uiohook represents mouse events with numeric type codes (7/8), so the
  // string check isn't reliable.  Treat anything with a numeric `button`
  // property as a mouse event and return early.
  if (typeof evt.button === 'number') {
      if (isRecordingKey && currentMainWindow) {
        currentMainWindow.webContents.send('hotkeys:debug', {
          when: 'captureEvent mouse',
          evt,
        });
      }
      return { ...base, button: evt.button };
    }

  // uiohook sometimes provides `keycode`, other times `rawcode` – or the
  // before-input-event gives `keyCode`. Prefer whichever numeric code is
  // available so we don't silently lose it.
  const keycode =
    typeof evt.keycode === 'number'
      ? evt.keycode
      : typeof evt.keyCode === 'number'
      ? evt.keyCode
      : typeof evt.rawcode === 'number'
      ? evt.rawcode
      : undefined;

  // Determine if this event should be interpreted as a keyboard event.  The
  // numeric `type` from uiohook isn't human‑readable, so we rely on the
  // existence of a keycode or key string instead of checking the type prefix.
  // (mouse events have already returned above.)
  const isKey = keycode !== undefined || typeof evt.key === 'string';
  if (isKey) {
    if (isRecordingKey && currentMainWindow) {
      currentMainWindow.webContents.send('hotkeys:debug', {
        when: 'captureEvent key',
        evt,
      });
    }
    if (keycode !== undefined) {
      return { ...base, keycode };
    }
    if (typeof evt.key === 'string' && evt.key.length > 0) {
      return { ...base, key: evt.key };
    }
  }

  // If we're in recording mode, log the event for debugging purposes so we
  // can see what *did* arrive; this helps diagnose missing mouse buttons
  // or zero keycodes. The logging is conditional to avoid spam in normal
  // operation.
  if (isRecordingKey) {
    if (currentMainWindow) {
      currentMainWindow.webContents.send('hotkeys:debug', {
        when: 'captureEvent fallback',
        evt,
      });
    }
  }

  return base;
};

// helper for emitting debug messages into the renderer (and
// logging to the main process console).  `currentMainWindow` may be null

export const registerGlobalHotkeys = async (mainWindow: BrowserWindow | null) => {
  sendDebug('registerGlobalHotkeys called');
  if (!mainWindow) return;
  currentMainWindow = mainWindow;

  // inform renderer whether a global hook layer is available
  const notify = (available: boolean) =>
    mainWindow?.webContents.send('hotkeys:available', available);

  // dynamically import the native hook module; this avoids emitted `require`
  // calls that fail under ESM.
  try {
    const mod = await import('uiohook-napi');
    sendDebug('uiohook-napi module loaded');
    uiohook = mod.uIOhook ?? mod;
    UiohookKey = mod.UiohookKey ?? {};
  } catch (e) {
    sendDebug('uiohook-napi import failed', e);
    console.warn('uiohook-napi not available; push-to-talk disabled');
    notify(false);
    return;
  }

  notify(true);

  // listen to before-input-event only for debug purposes; we do not use it
  // to emulate PTT when uiohook is active.
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    sendDebug('before-input-event', input);
  });

  uiohook.on('keydown', (event: any) => {
    // Key recording mode: capture next keydown and return hotkey
    if (isRecordingKey && recordResolve) {
      isRecordingKey = false;
      const resolve = recordResolve;
      recordResolve = null;
      const h = captureEvent(event);
      sendDebug('captureEvent result during recording (keydown)', h);
      resolve(h);
      return;
    }

    const h = readPttHotkey();
    const matched = hotkeyMatches(h, event);
    sendDebug('keydown match check', { hotkey: h, event, matched });
    if (matched && !isPushToTalkActive) {
      isPushToTalkActive = true;
      sendDebug('ptt:start triggered');
      mainWindow?.webContents.send('ptt:start');
    }
  });

  uiohook.on('mousedown', (event: any) => {
    sendDebug('uiohook mousedown', event);
    if (isRecordingKey && recordResolve) {
      isRecordingKey = false;
      const resolve = recordResolve;
      recordResolve = null;
      const h = captureEvent(event);
      sendDebug('captureEvent result during recording', h);
      resolve(h);
      return;
    }
    const h = readPttHotkey();
    const matched = hotkeyMatches(h, event);
    sendDebug('mousedown match check', { hotkey: h, event, matched });
    if (matched && !isPushToTalkActive) {
      isPushToTalkActive = true;
      sendDebug('ptt:start triggered');
      mainWindow?.webContents.send('ptt:start');
    }
  });

  uiohook.on('keyup', (event: any) => {
    sendDebug('uiohook keyup', event);
    if (!isPushToTalkActive) return;
    const h = readPttHotkey();
    const matched = hotkeyMatches(h, event);
    sendDebug('keyup match check', { hotkey: h, event, matched });
    if (matched) {
      isPushToTalkActive = false;
      sendDebug('ptt:stop triggered');
      mainWindow?.webContents.send('ptt:stop');
    }
  });

  try {
    uiohook.start();
    sendDebug('uiohook started, global hotkeys enabled', hotkeyToName(readPttHotkey()));
    notify(true);
  } catch (e) {
    // starting the hook failed, disable PTT entirely
    sendDebug('Failed to start uiohook, disabling push-to-talk', e);
    notify(false);
    return;
  }

  // when using uiohook we also want to know about mouseup events in order to
  // release the PTT state; the library emits a separate `mouseup` event.
  uiohook.on('mouseup', (event: any) => {
    sendDebug('uiohook mouseup', event);
    if (!isPushToTalkActive) return;
    const h = readPttHotkey();
    const matched = hotkeyMatches(h, event);
    sendDebug('mouseup match check', { hotkey: h, event, matched });
    if (matched) {
      isPushToTalkActive = false;
      sendDebug('ptt:stop triggered');
      mainWindow?.webContents.send('ptt:stop');
    }
  });
};

export const stopGlobalHotkeys = () => {
  try { uiohook?.stop?.(); } catch { /* ignore */ }
};


// ── IPC handlers ────────────────────────────────────────────────────────────

ipcMain.handle('hotkeys:getPushToTalk', () => {
  const h = readPttHotkey();
  return { hotkey: h, name: hotkeyToName(h) };
});

ipcMain.handle('hotkeys:getDebugHistory', () => {
  return getDebugHistory();
});

ipcMain.handle('hotkeys:setPushToTalk', (_event, hotkey: Hotkey) => {
  store.set?.('hotkeys.pushToTalk', hotkey);
  return { hotkey, name: hotkeyToName(hotkey) };
});

// Start listening for the next keypress and return its keycode + name
ipcMain.handle('hotkeys:recordKey', () => {
  

  if (!uiohook) {
    return new Promise<{ hotkey: Hotkey; name: string }>((resolve) => {
      if (!currentMainWindow) {
        const h = DEFAULT_PTT_HOTKEY;
        resolve({ hotkey: h, name: hotkeyToName(h) });
        return;
      }
      const listener = (_e: any, input: any) => {
        const type = String(input.type || '').toLowerCase();
        if (type.startsWith('key') || type.startsWith('mouse')) {
          const h = captureEvent(input);
          store.set?.('hotkeys.pushToTalk', h);
          currentMainWindow?.webContents.removeListener('before-input-event', listener);
          resolve({ hotkey: h, name: hotkeyToName(h) });
        }
      };
      currentMainWindow.webContents.on('before-input-event', listener);
      // cancel after timeout
      setTimeout(() => {
        currentMainWindow?.webContents.removeListener('before-input-event', listener);
        const h = readPttHotkey();
        resolve({ hotkey: h, name: hotkeyToName(h) });
      }, 10_000);
    });
  }

  return new Promise<{ hotkey: Hotkey; name: string }>((resolve) => {
    isRecordingKey = true;
    recordResolve = (h: Hotkey) => {
      sendDebug('recorded hotkey', h);
      store.set?.('hotkeys.pushToTalk', h);
      resolve({ hotkey: h, name: hotkeyToName(h) });
    };
    // Auto-cancel after 10 s
    setTimeout(() => {
      if (isRecordingKey) {
        isRecordingKey = false;
        recordResolve = null;
        const h = readPttHotkey();
        resolve({ hotkey: h, name: hotkeyToName(h) });
      }
    }, 10_000);
  });
});

ipcMain.handle('hotkeys:cancelRecord', () => {
  isRecordingKey = false;
  recordResolve = null;
});
