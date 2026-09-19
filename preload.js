const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('buddy', {
  onTick: (cb) => ipcRenderer.on('tick', (_e, d) => cb(d)),
  onPaused: (cb) => ipcRenderer.on('paused', (_e, p) => cb(p)),
  onQuiet: (cb) => ipcRenderer.on('quiet', (_e, q) => cb(q)),
  onTestMode: (cb) => ipcRenderer.on('test-mode', (_e, v) => cb(v)),
  onAppearNow: (cb) => ipcRenderer.on('appear-now', () => cb()),
  onEvent: (cb) => ipcRenderer.on('event', (_e, ev) => cb(ev)),
  setVisible: (v) => ipcRenderer.send('set-visible', !!v),
  log: (m) => ipcRenderer.send('rlog', String(m)),
});
