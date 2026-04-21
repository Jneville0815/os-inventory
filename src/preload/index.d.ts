import type { OsInventoryApi } from '../shared/types';

declare global {
  interface Window {
    api: OsInventoryApi;
  }
}

export {};
