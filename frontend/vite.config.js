import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wails from "@wailsio/runtime/plugins/vite";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), wails("./bindings")],
  // onnxruntime-web 的 WASM bundle 含 top-level await，需 esnext target 才能被 Rollup 保留
  build: {
    target: "esnext",
  },
  resolve: {
    alias: {
      "@templates": path.resolve(__dirname, "..", "templates"),
    },
  },
  server: {
    fs: {
      allow: [path.resolve(__dirname, "..")],
    },
  },
});
