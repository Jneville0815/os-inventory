import { app, shell, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';
import { readSnapshot, writeSnapshot } from './cache';
import { readSettings, writeSettings } from './settings';
import { describeRecipes, describeSources, testCustomSource } from './sources';
import { normalizeCustomSource } from './settings';
import { runRefresh } from './refresh';
import type { CustomSource, CustomSourceTest, RefreshProgress, Snapshot } from '../shared/types';

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 720,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.on('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return mainWindow;
}

// The auto-refresh timer and an explicit click can land together; a second
// refresh would duplicate every child process, so callers share the in-flight one.
let inFlight: Promise<Snapshot> | null = null;

function refresh(broadcast: (progress: RefreshProgress) => void): Promise<Snapshot> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const settings = await readSettings();
    const snapshot = await runRefresh(settings, broadcast);
    await writeSnapshot(snapshot);
    return snapshot;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

// Every open window follows along, not just the one that asked to refresh.
function broadcastProgress(progress: RefreshProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.webContents.isDestroyed()) win.webContents.send('inventory:progress', progress);
  }
}

function registerIpc(): void {
  ipcMain.handle('inventory:getSnapshot', () => readSnapshot());
  ipcMain.handle('inventory:getSettings', () => readSettings());
  ipcMain.handle('inventory:saveSettings', (_event, settings: unknown) =>
    writeSettings(settings)
  );
  ipcMain.handle('inventory:listSources', async () => describeSources(await readSettings()));
  ipcMain.handle('inventory:listRecipes', () => describeRecipes());
  ipcMain.handle('inventory:refresh', () => refresh(broadcastProgress));

  ipcMain.handle(
    'inventory:testCustomSource',
    async (_event, candidate: unknown): Promise<CustomSourceTest> => {
      // Validate before running: the same rules the saved config must satisfy.
      const config = normalizeCustomSource(candidate as CustomSource);
      if (!config) {
        return { ok: false, error: 'Needs a name, a command, and a valid pattern in regex mode.' };
      }
      return testCustomSource(config);
    }
  );
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.jimmyneville.os-inventory');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
