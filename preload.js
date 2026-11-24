'use strict';
/*
 * The only bridge between the page and the main process.
 * The page gets a small frozen object with plain functions - never ipcRenderer itself.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'api',
  Object.freeze({
    isDesktop: true,
    copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
    saveFile: (payload) => ipcRenderer.invoke('file:save', payload),
    openJson: () => ipcRenderer.invoke('file:open-json'),
    scanFolder: (opts) => ipcRenderer.invoke('folder:scan', { skipHeavy: !!(opts && opts.skipHeavy) }),
    pickCreateTarget: (payload) => ipcRenderer.invoke('tree:create-pick', payload),
    runCreate: () => ipcRenderer.invoke('tree:create-run'),
    cancelCreate: () => ipcRenderer.invoke('tree:create-cancel'),
    openCreated: () => ipcRenderer.invoke('tree:create-open'),
    loadStored: () => ipcRenderer.sendSync('db:load'),
    saveStored: (json) => ipcRenderer.send('db:save', json),
    saveStoredNow: (json) => ipcRenderer.sendSync('db:save-now', json),
  })
);
