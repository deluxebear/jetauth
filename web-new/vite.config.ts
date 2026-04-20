import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "build",
  },
  server: {
    port: 7001,
    // String shorthand (`"/api": "http://..."`) silently sets changeOrigin: true,
    // which rewrites the Host header to the target. That breaks SIWE domain
    // binding (backend sees localhost:8000, the signed message says
    // localhost:7001). Use the object form with changeOrigin: false so backend
    // sees the browser-visible host the user actually signed for.
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: false },
      "/.well-known": { target: "http://localhost:8000", changeOrigin: false },
      "/files": { target: "http://localhost:8000", changeOrigin: false },
    },
  },
});
