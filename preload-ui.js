// Puente para las ventanas de ajustes y tutorial
const { contextBridge, ipcRenderer } = require('electron');
// Edición (personal | shared) que manda el proceso principal: decide colores y personajes
contextBridge.exposeInMainWorld('PAL_EDITION', (process.argv.find(a => a.startsWith('--pal-edition=')) || '--pal-edition=shared').slice(14));

contextBridge.exposeInMainWorld('ui', {
  status: () => ipcRenderer.invoke('ui:status'),
  installHooks: () => ipcRenderer.invoke('ui:install-hooks'),
  uninstallHooks: () => ipcRenderer.invoke('ui:uninstall-hooks'),
  setAutostart: on => ipcRenderer.invoke('ui:set-autostart', !!on),
  permSet: p => ipcRenderer.invoke('ui:perm-set', p && typeof p === 'object' ? p : {}),
  permInstall: () => ipcRenderer.invoke('ui:perm-install'),
  finishTutorial: () => ipcRenderer.invoke('ui:finish-tutorial'),
  preview: action => ipcRenderer.invoke('ui:preview', String(action || '')),
  open: page => ipcRenderer.invoke('ui:open', page),
  restart: () => ipcRenderer.send('ui:restart'),
  openData: () => ipcRenderer.invoke('ui:open-data'),
  clearHistory: () => ipcRenderer.invoke('ui:clear-history'),
  calmSet: p => ipcRenderer.invoke('ui:calm-set', p && typeof p === 'object' ? p : {}),
  onRefresh: cb => ipcRenderer.on('ui-refresh', () => cb()),
  close: () => ipcRenderer.send('ui:close'),
  phone: () => ipcRenderer.invoke('ui:phone'),
  phoneSet: patch => ipcRenderer.invoke('ui:phone-set', patch && typeof patch === 'object' ? patch : {}),
  phoneTest: () => ipcRenderer.invoke('ui:phone-test'),
  phoneKey: () => ipcRenderer.invoke('ui:phone-key'),
  phoneApk: () => ipcRenderer.invoke('ui:phone-apk'),
});
