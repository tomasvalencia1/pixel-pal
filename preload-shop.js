// Puente para la tienda de personajes y accesorios
const { contextBridge, ipcRenderer } = require('electron');
// Edición (personal | shared) que manda el proceso principal: decide colores y personajes
contextBridge.exposeInMainWorld('PAL_EDITION', (process.argv.find(a => a.startsWith('--pal-edition=')) || '--pal-edition=shared').slice(14));

contextBridge.exposeInMainWorld('shop', {
  get: () => ipcRenderer.invoke('shop-get'),
  set: patch => ipcRenderer.invoke('shop-set', patch && typeof patch === 'object' ? patch : {}),
  close: () => ipcRenderer.send('shop-close'),
  onUpdate: cb => ipcRenderer.on('shop-update', (_e, d) => cb(d)),
});
