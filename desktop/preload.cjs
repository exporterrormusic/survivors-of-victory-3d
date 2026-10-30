// The only bridge from the game page to the desktop shell: the experimental-updates switch.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sovDesktop', {
  getExperimentalUpdates: () => ipcRenderer.invoke('updates:get-experimental'),
  setExperimentalUpdates: (enabled) => ipcRenderer.invoke('updates:set-experimental', Boolean(enabled)),
});
