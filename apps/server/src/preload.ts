import { contextBridge, ipcRenderer } from 'electron';
import { channels } from './ipc/channels.js';

/**
 * The ONLY renderer-visible surface. Never expose ipcRenderer directly —
 * see docs/DATABASE_RULES.md section 5 and docs/SYSTEM_DESIGN.md section 1.
 */
contextBridge.exposeInMainWorld('api', {
  system: {
    ping: (): Promise<{ tableCount: number }> =>
      ipcRenderer.invoke(channels.system.ping) as Promise<{ tableCount: number }>,
  },
});
