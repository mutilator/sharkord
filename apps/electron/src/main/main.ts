import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';

// __dirname isn't defined in ES modules; emulate it
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import Store from 'electron-store';
import { registerGlobalHotkeys, stopGlobalHotkeys } from './hotkeys.js';

const store = new Store();

let mainWindow: BrowserWindow | null = null;

const createWindow = () => {
  // choose height 752 = 720 content + 32px custom titlebar
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 700,
    frame: false,
    backgroundColor: '#141414',
    show: false, // wait until content has loaded
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  // also explicitly set content size (same 752) to be safe
  mainWindow.setContentSize(1280, 700);

  // prefer explicit start URL (set by the dev script) so we don't rely on NODE_ENV
  const urlEnv = process.env.ELECTRON_START_URL;
  const urlPath = path.join(__dirname, '../renderer/index.html');
  const url = urlEnv || urlPath;

  console.log('electron loading URL', url);

  if (urlEnv) {
    mainWindow.loadURL(url).catch((e) =>
      console.error('loadURL failed', e)
    );
  } else {
    mainWindow
      .loadFile(urlPath)
      .catch((e) => console.error('loadFile failed', e));
  }

  mainWindow.webContents.on('did-fail-load', (e, errorCode, errorDescription, validatedURL) => {
    console.error('did-fail-load', errorCode, errorDescription, validatedURL);
  });

  mainWindow.once('ready-to-show', () => {
    console.log('window ready-to-show');
    mainWindow?.show();
  });

  // open devtools when running with a development start URL
  if (process.env.ELECTRON_START_URL) {
    mainWindow.webContents.openDevTools();
  }

  // catch F12 key in renderer so DevTools can be toggled in packaged apps
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      mainWindow?.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // Forward renderer console messages to main process stdout (helps debug production)
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    const tag = ['verbose', 'info', 'warn', 'error'][level] ?? 'log';
    console.log(`[renderer:${tag}] ${message} (${sourceId}:${line})`);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('maximize', () =>
    mainWindow?.webContents.send('window:maximized', true)
  );
  mainWindow.on('unmaximize', () =>
    mainWindow?.webContents.send('window:maximized', false)
  );
};

app.on('ready', async () => {
  process.on('uncaughtException', (err) => {
    console.error('uncaughtException', err);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('unhandledRejection', reason);
  });

  createWindow();
  await registerGlobalHotkeys(mainWindow);

  // F12 toggles DevTools in any build — useful for debugging production
  globalShortcut.register('F12', () => {
    mainWindow?.webContents.isDevToolsOpened()
      ? mainWindow.webContents.closeDevTools()
      : mainWindow?.webContents.openDevTools();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('before-quit', () => stopGlobalHotkeys());

ipcMain.on('window:toggleDevTools', () => {
  mainWindow?.webContents.toggleDevTools();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Window control IPC handlers for custom frameless titlebar
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());


