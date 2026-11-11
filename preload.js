const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('clawd', {
  onState: cb => ipcRenderer.on('state', (_e, s) => cb(s)),
  onCursor: cb => ipcRenderer.on('cursor', (_e, p) => cb(p)),
  onCommand: cb => ipcRenderer.on('command', (_e, c) => cb(c)),
  onLayout: cb => ipcRenderer.on('layout', (_e, l) => cb(l)),
  onPrefs: cb => ipcRenderer.on('prefs', (_e, p) => cb(p)),
  moveBy: (x, y) => ipcRenderer.send('move-by', { x, y }),
  moveEnd: () => ipcRenderer.send('move-end'),
  savePref: p => ipcRenderer.send('save-pref', p),
  onSys: cb => ipcRenderer.on('sys', (_e, s) => cb(s)),
  onPos: cb => ipcRenderer.on('pos', (_e, p) => cb(p)),
  moveTo: (x, y) => ipcRenderer.send('move-to', { x, y }),
  setHidden: h => ipcRenderer.send('set-hidden', !!h),
  hideByUser: () => ipcRenderer.send('hide-by-user'),
  track: id => ipcRenderer.send('track', id),
  openSessions: file => ipcRenderer.send('open-sessions', file),
  pathForFile: f => { try { return webUtils.getPathForFile(f); } catch { return ''; } },
  setIgnore: v => ipcRenderer.send('set-ignore', v),
  dragStart: (x, y) => ipcRenderer.send('drag-start', { x, y }),
  dragMove: (x, y) => ipcRenderer.send('drag-move', { x, y }),
  dragEnd: () => ipcRenderer.send('drag-end'),
  contextMenu: () => ipcRenderer.send('context-menu'),
  // ⭐ progreso, 🔔 avisos de Windows y ⌨️ teclado para escribir un recordatorio
  progressLoad: () => ipcRenderer.invoke('progress-load'),
  progressSave: d => ipcRenderer.send('progress-save', d),
  notify: (title, body) => ipcRenderer.send('notify', { title: String(title || ''), body: String(body || '') }),
  inputFocus: on => ipcRenderer.send('input-focus', !!on),
  // 🛍️ personaje y accesorios
  setOutfit: p => ipcRenderer.send('outfit-set', p && typeof p === 'object' ? p : {}),
  openShop: () => ipcRenderer.send('shop-open'),
  // 💬 hablar con Pal
  talkAsk: (text, ctx) => ipcRenderer.invoke('talk-ask', String(text || ''), String(ctx || '')),
  talkStatus: () => ipcRenderer.invoke('talk-status'),
  listen: () => ipcRenderer.invoke('talk-listen'),
  openBrain: () => ipcRenderer.send('brain-open'),
  openUi: page => ipcRenderer.invoke('ui:open', page),
});
