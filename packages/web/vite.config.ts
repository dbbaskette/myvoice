import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    // Explicit IPv4 loopback so `localhost:7879` resolves consistently
    // regardless of Node's DNS preference (Node 17+ defaults to IPv6 first).
    // Matches the FastAPI backend's 127.0.0.1 binding.
    host: "127.0.0.1",
    port: 7879,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:7878",
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
  },
});
