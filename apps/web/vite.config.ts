import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    // The browser talks to /api on its own origin; Vite forwards to the BFF.
    // Keeps the client free of environment-specific base URLs and sidesteps
    // CORS entirely in development.
    proxy: {
      "/api": { target: process.env.BFF_URL ?? "http://localhost:4000", changeOrigin: true },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": { target: process.env.BFF_URL ?? "http://localhost:4000", changeOrigin: true },
    },
  },
});
