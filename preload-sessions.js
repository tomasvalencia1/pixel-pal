const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sess', {
  onData: cb => ipcRenderer.on('sess-data', (_e, d) => cb(d)),
  onResult: cb => ipcRenderer.on('sess-result', (_e, r) => cb(r)),
  action: (kind, extra = {}) => ipcRenderer.send('sess-action', { kind, ...extra }),
});
