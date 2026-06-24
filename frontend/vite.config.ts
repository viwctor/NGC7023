import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// Resolve a path relative to this config file (ESM-safe, cross-platform).
const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// The frontend imports the `@tauri-apps/*` API surface; these aliases redirect
// those imports to thin pywebview-backed compat shims. This isolates the entire
// platform layer in one place (the layering rule) — UI components never change.
const tauriShims = {
  "@tauri-apps/api/core": r("./src/shims/tauri/core.ts"),
  "@tauri-apps/api/window": r("./src/shims/tauri/window.ts"),
  "@tauri-apps/api/event": r("./src/shims/tauri/event.ts"),
  "@tauri-apps/api/webview": r("./src/shims/tauri/webview.ts"),
  "@tauri-apps/plugin-dialog": r("./src/shims/tauri/dialog.ts"),
  "@tauri-apps/plugin-opener": r("./src/shims/tauri/opener.ts"),
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset URLs so the built index.html loads from file:// inside the
  // pywebview window (no dev server in production).
  base: "./",
  resolve: { alias: tauriShims },
  build: {
    // Emit straight into the Python package so PyInstaller bundles it as data.
    outDir: r("../ngc7023/web"),
    emptyOutDir: true,
  },
  clearScreen: false,
  server: { port: 7023, strictPort: true },
});
