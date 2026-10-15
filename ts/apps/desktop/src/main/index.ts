import { app, BrowserWindow, shell } from "electron";
import { join } from "node:path";

// Main process only handles the window + OS integration. All Showdown
// protocol traffic runs in the renderer over its own WebSocket (ps-net),
// mirroring the iOS app's architecture.
function createWindow(): void {
  const win = new BrowserWindow({
    width: 1050,
    height: 780,
    minWidth: 800,
    minHeight: 600,
    title: "Pokemon Showdown",
    backgroundColor: "#f7f4f4",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Open external links in the OS browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https:") || url.startsWith("http:")) void shell.openExternal(url);
    return { action: "deny" };
  });

  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

void app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
