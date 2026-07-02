const { contextBridge, ipcRenderer } = require('electron');

const allowedInvoke = new Set([
  'auth:login',
  'auth:logout',
  'auth:status',
  'app:getVersion',
  'open-external',
  'file:save',
  'file:open'
]);

const allowedSend = new Set([
  'webrtc:signal',
  'log'
]);

const allowedReceive = new Set([
  'webrtc:offer',
  'webrtc:answer',
  'webrtc:ice',
  'auth:status'
]);

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel, ...args) => {
    if (!allowedInvoke.has(channel)) {
      throw new Error(`ipc.invoke blocked for channel: ${channel}`);
    }
    return ipcRenderer.invoke(channel, ...args);
  },

  send: (channel, ...args) => {
    if (!allowedSend.has(channel)) {
      throw new Error(`ipc.send blocked for channel: ${channel}`);
    }
    return ipcRenderer.send(channel, ...args);
  },

  on: (channel, listener) => {
    if (!allowedReceive.has(channel)) {
      throw new Error(`ipc.on blocked for channel: ${channel}`);
    }
    const wrapped = (event, ...args) => listener(...args);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  }
});

// Keep the preload surface minimal and whitelist-forward only.
// Minimal preload for Electron; keep contextIsolation safe
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('__vibematch_electron', {
  platform: process.platform
});
