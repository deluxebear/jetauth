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
    proxy: {
      "/api": "http://localhost:8000",
      "/.well-known": "http://localhost:8000",
      "/files": "http://localhost:8000",
    },
  },
});
