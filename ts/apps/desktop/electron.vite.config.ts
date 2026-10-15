import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

// Workspace core packages ship TypeScript sources; bundle them (esbuild)
// instead of leaving them external for Node's runtime resolution.
const bundleWorkspaceDeps = externalizeDepsPlugin({
  exclude: ["ps-protocol", "ps-net", "ps-data", "ps-teams"],
});

export default defineConfig({
  main: {
    plugins: [bundleWorkspaceDeps],
  },
  preload: {
    plugins: [bundleWorkspaceDeps],
  },
  renderer: {
    plugins: [react()],
  },
});
