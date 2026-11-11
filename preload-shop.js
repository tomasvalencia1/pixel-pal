// Puente para la tienda de personajes y accesorios
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('shop', {
  get: () => ipcRenderer.invoke('shop-get'),
  set: patch => ipcRenderer.invoke('shop-set', patch && typeof patch === 'object' ? patch : {}),
  close: () => ipcRenderer.send('shop-close'),
  onUpdate: cb => ipcRenderer.on('shop-update', (_e, d) => cb(d)),
});
