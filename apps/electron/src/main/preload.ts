// We intentionally ignore type errors from electron typings
import { contextBridge, ipcRenderer } from 'electron';

console.log('preload script running');

// expose a limited API to the renderer for hotkey management
contextBridge.exposeInMainWorld('electronAPI', {
  // Push-to-talk events
  onPushToTalkStart: (callback: (...args: any[]) => void) =>
    ipcRenderer.on('ptt:start', callback),
  offPushToTalkStart: (callback: (...args: any[]) => void) =>
    ipcRenderer.removeListener('ptt:start', callback),
  onPushToTalkStop: (callback: (...args: any[]) => void) =>
    ipcRenderer.on('ptt:stop', callback),
  offPushToTalkStop: (callback: (...args: any[]) => void) =>
    ipcRenderer.removeListener('ptt:stop', callback),
  setPushToTalkKey: (hotkey: any) =>
    ipcRenderer.invoke('hotkeys:setPushToTalk', hotkey),
  getPushToTalkKey: () => ipcRenderer.invoke('hotkeys:getPushToTalk'),
  recordPushToTalkKey: () => ipcRenderer.invoke('hotkeys:recordKey'),
  cancelRecordPushToTalkKey: () => ipcRenderer.invoke('hotkeys:cancelRecord'),
  onHotkeysAvailability: (cb: (e: any, available: boolean) => void) =>
    ipcRenderer.on('hotkeys:available', cb),
  offHotkeysAvailability: (cb: (e: any, available: boolean) => void) =>
    ipcRenderer.removeListener('hotkeys:available', cb),
  // debug channel for recording events
  onHotkeysDebug: (cb: (e: any, data: any) => void) =>
    ipcRenderer.on('hotkeys:debug', cb),
  offHotkeysDebug: (cb: (e: any, data: any) => void) =>
    ipcRenderer.removeListener('hotkeys:debug', cb),
  getHotkeysDebugHistory: () => ipcRenderer.invoke('hotkeys:getDebugHistory'),
  // Frameless window controls
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  toggleDevTools: () => ipcRenderer.send('window:toggleDevTools'),
  // Maximize state events
  onWindowMaximized: (cb: (e: any, isMax: boolean) => void) =>
    ipcRenderer.on('window:maximized', cb),
  offWindowMaximized: (cb: (e: any, isMax: boolean) => void) =>
    ipcRenderer.removeListener('window:maximized', cb),
});
