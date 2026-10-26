// The page gets exactly one desktop power: the native folder picker.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('virtualof', {
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
});
