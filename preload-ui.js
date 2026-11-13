// Puente para las ventanas de ajustes y tutorial
const { contextBridge, ipcRenderer } = require('electron');
// Edición (personal | shared) que manda el proceso principal: decide colores y personajes
contextBridge.exposeInMainWorld('PAL_EDITION', (process.argv.find(a => a.startsWith('--pal-edition=')) || '--pal-edition=shared').slice(14));

contextBridge.exposeInMainWorld('ui', {
  status: () => ipcRenderer.invoke('ui:status'),
  installHooks: () => ipcRenderer.invoke('ui:install-hooks'),
  uninstallHooks: () => ipcRenderer.invoke('ui:uninstall-hooks'),
  setAutostart: on => ipcRenderer.invoke('ui:set-autostart', !!on),
  finishTutorial: () => ipcRenderer.invoke('ui:finish-tutorial'),
  preview: action => ipcRenderer.invoke('ui:preview', String(action || '')),
  open: page => ipcRenderer.invoke('ui:open', page),
  close: () => ipcRenderer.send('ui:close'),
  phone: () => ipcRenderer.invoke('ui:phone'),
  phoneSet: patch => ipcRenderer.invoke('ui:phone-set', patch && typeof patch === 'object' ? patch : {}),
  phoneTest: () => ipcRenderer.invoke('ui:phone-test'),
});
