// Puente para la ventana "Cerebro de Haiku" (clave de API y límite de gasto)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('brain', {
  status: () => ipcRenderer.invoke('brain-status'),
  setKey: key => ipcRenderer.invoke('brain-set-key', String(key || '')),
  clearKey: () => ipcRenderer.invoke('brain-clear-key'),
  setLimit: usd => ipcRenderer.invoke('brain-set-limit', Number(usd)),
  openConsole: () => ipcRenderer.send('brain-console'),
  close: () => ipcRenderer.send('brain-close'),
});
