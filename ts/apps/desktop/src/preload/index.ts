import { contextBridge } from "electron";

// Renderer talks to Showdown directly; preload stays minimal. M2 adds
// safeStorage-backed credential IPC here.
contextBridge.exposeInMainWorld("psShell", {
  platform: process.platform,
});
