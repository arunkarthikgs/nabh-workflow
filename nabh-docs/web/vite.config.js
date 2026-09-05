import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  base: mode === "static-demo" ? "./" : "/",
  assetsInlineLimit: mode === "static-demo" ? 10_000_000 : 4096,
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:4000",
      "/logos": "http://127.0.0.1:4000"
    }
  }
}));
