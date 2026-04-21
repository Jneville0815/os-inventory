import { contextBridge, ipcRenderer } from 'electron';
import type {
  OsInventoryApi,
  RefreshProgress,
  Snapshot
} from '../shared/types';

const api: OsInventoryApi = {
  getSnapshot: () => ipcRenderer.invoke('brew:getSnapshot') as Promise<Snapshot | null>,
  refresh: () => ipcRenderer.invoke('brew:refresh') as Promise<Snapshot>,
  onProgress: (cb) => {
    const listener = (_: unknown, progress: RefreshProgress): void => cb(progress);
    ipcRenderer.on('brew:progress', listener);
    return () => ipcRenderer.removeListener('brew:progress', listener);
  }
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api;
}
