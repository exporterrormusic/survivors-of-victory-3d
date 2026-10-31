// The only bridge from the game page to the desktop shell: auto-update status for the banner.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sovUpdates', {
  /** The latest status now (null if nothing to report), then every change. Returns an unsubscribe. */
  watch(callback) {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('update:status', listener);
    void ipcRenderer.invoke('update:get').then(callback);
    return () => ipcRenderer.removeListener('update:status', listener);
  },
  restart: () => ipcRenderer.invoke('update:restart'),
});
