import { contextBridge, ipcRenderer } from 'electron';
import type {
  CustomSourceTest,
  RecipeDescriptor,
  OsInventoryApi,
  RefreshProgress,
  Settings,
  Snapshot,
  SourceDescriptor
} from '../shared/types';

const api: OsInventoryApi = {
  getSnapshot: () => ipcRenderer.invoke('inventory:getSnapshot') as Promise<Snapshot | null>,
  refresh: () => ipcRenderer.invoke('inventory:refresh') as Promise<Snapshot>,
  onProgress: (cb) => {
    const listener = (_: unknown, progress: RefreshProgress): void => cb(progress);
    ipcRenderer.on('inventory:progress', listener);
    return () => ipcRenderer.removeListener('inventory:progress', listener);
  },
  getSettings: () => ipcRenderer.invoke('inventory:getSettings') as Promise<Settings>,
  saveSettings: (settings) =>
    ipcRenderer.invoke('inventory:saveSettings', settings) as Promise<Settings>,
  listSources: () => ipcRenderer.invoke('inventory:listSources') as Promise<SourceDescriptor[]>,
  listRecipes: () => ipcRenderer.invoke('inventory:listRecipes') as Promise<RecipeDescriptor[]>,
  testCustomSource: (source) =>
    ipcRenderer.invoke('inventory:testCustomSource', source) as Promise<CustomSourceTest>
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
