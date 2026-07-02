// Minimal preload for Electron; keep contextIsolation safe
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('__vibematch_electron', {
  platform: process.platform
});
