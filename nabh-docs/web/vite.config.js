import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";

export default defineConfig(({ mode }) => ({
  base: mode === "static-demo" ? "./" : "/",
  assetsInlineLimit: mode === "static-demo" ? 10_000_000 : 4096,
  plugins: [react()],
  resolve: {
    // generatedStaticData.js is untracked and only exists for static-demo builds.
    alias: mode === "static-demo" ? [] : [{ find: /^\.\/generatedStaticData\.js$/, replacement: fileURLToPath(new URL("./src/emptyStaticData.js", import.meta.url)) }]
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:4000",
      "/logos": "http://127.0.0.1:4000"
    }
  }
}));
