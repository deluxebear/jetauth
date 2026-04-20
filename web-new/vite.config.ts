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
    // Bind all interfaces (IPv4 0.0.0.0 + IPv6 ::) instead of the default
    // `localhost` — Node resolves "localhost" to ::1 on macOS and some
    // reverse proxies (Tailscale Funnel, cloudflared on IPv4) can't reach
    // IPv6-only sockets, producing 502s with no server log.
    host: true,
    // Vite 5+ blocks Host headers it doesn't recognise (DNS rebinding
    // defence). Funnel forwards Host = <machine>.<tailnet>.ts.net, so we
    // whitelist the tailnet suffix. `.ts.net` covers every tailscale node
    // you might tunnel from without encoding the exact machine name.
    allowedHosts: [".ts.net", "localhost"],
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
    // Let the HMR websocket come back in over Funnel's HTTPS (port 443) so
    // the browser doesn't try ws://localhost:7001 and fail.
    hmr: { clientPort: 443 },
  },
});
