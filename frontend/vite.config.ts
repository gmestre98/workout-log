/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// The Go server serves the built app and the API from the same origin in
// production. In dev, proxy /api and /auth to the local Go server on :8080.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icon.svg"],
      workbox: {
        // The service worker's SPA navigation fallback must NOT swallow server
        // routes: /auth/* (Google OAuth redirects) and /api/* must hit the
        // network, otherwise clicking "Sign in" just re-serves index.html.
        navigateFallbackDenylist: [/^\/auth\//, /^\/api\//],
      },
      manifest: {
        name: "Workout Log",
        short_name: "Workouts",
        description: "Track your daily workout routine",
        theme_color: "#2f3aa8",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8080",
      "/auth": "http://localhost:8080",
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: false,
  },
});
