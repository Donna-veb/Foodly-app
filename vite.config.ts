import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.png", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "Ротация продуктов",
        short_name: "Ротация",
        description: "Личная история продуктов и подсказки, когда их можно вернуть в рацион.",
        lang: "ru",
        start_url: ".",
        scope: ".",
        display: "standalone",
        background_color: "#f7f7fa",
        theme_color: "#121216",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        navigateFallback: "index.html"
      }
    })
  ]
});
