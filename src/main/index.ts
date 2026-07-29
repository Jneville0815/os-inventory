import { app, shell, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';
import { fetchInstalled } from './brew';
import { fetchNpmGlobals } from './npm';
import { fetchVscodeExtensions } from './vscode';
import { fetchGoBinaries } from './go';
import { fetchInstalledApps } from './apps';
import { readSnapshot, writeSnapshot } from './cache';
import type { RefreshProgress, Snapshot } from '../shared/types';

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

function registerIpc(): void {
  ipcMain.handle('brew:getSnapshot', async () => readSnapshot());

  ipcMain.handle('brew:refresh', async (event): Promise<Snapshot> => {
    const emit = (progress: RefreshProgress): void => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('brew:progress', progress);
      }
    };

    const { formulae, casks, caskAppNames } = await fetchInstalled(emit);
    const npmGlobals = await fetchNpmGlobals(emit);
    const vscodeExtensions = await fetchVscodeExtensions(emit);
    const goBinaries = await fetchGoBinaries(emit);
    const macosApps = await fetchInstalledApps(caskAppNames, emit);
    const snapshot: Snapshot = {
      refreshedAt: new Date().toISOString(),
      formulae,
      casks,
      npmGlobals,
      vscodeExtensions,
      goBinaries,
      macosApps
    };

    emit({ phase: 'writing-cache' });
    await writeSnapshot(snapshot);
    return snapshot;
  });
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
