// Puente para las ventanas de ajustes y tutorial
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ui', {
  status: () => ipcRenderer.invoke('ui:status'),
  installHooks: () => ipcRenderer.invoke('ui:install-hooks'),
  uninstallHooks: () => ipcRenderer.invoke('ui:uninstall-hooks'),
  setAutostart: on => ipcRenderer.invoke('ui:set-autostart', !!on),
  finishTutorial: () => ipcRenderer.invoke('ui:finish-tutorial'),
  preview: action => ipcRenderer.invoke('ui:preview', String(action || '')),
  open: page => ipcRenderer.invoke('ui:open', page),
  close: () => ipcRenderer.send('ui:close'),
});
