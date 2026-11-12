const { contextBridge, ipcRenderer } = require('electron');
// Edición (personal | shared) que manda el proceso principal: decide colores y personajes
contextBridge.exposeInMainWorld('PAL_EDITION', (process.argv.find(a => a.startsWith('--pal-edition=')) || '--pal-edition=shared').slice(14));

contextBridge.exposeInMainWorld('sess', {
  onData: cb => ipcRenderer.on('sess-data', (_e, d) => cb(d)),
  onResult: cb => ipcRenderer.on('sess-result', (_e, r) => cb(r)),
  action: (kind, extra = {}) => ipcRenderer.send('sess-action', { kind, ...extra }),
});
