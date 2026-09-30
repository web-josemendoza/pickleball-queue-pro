import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Libraries change rarely, so keeping them in their
        // own files lets returning players' browsers reuse
        // them after an app update.
        advancedChunks: {
          groups: [
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            // Shared by every screen; kept out of the sign-in
            // file so the TV display doesn't need sign-in code.
            {
              name: "firebase-core",
              priority: 10,
              test: /node_modules[\\/](@firebase[\\/](app|util|component|logger)|firebase[\\/]app|idb|tslib)[\\/]/,
            },
            { name: "firebase-auth", test: /node_modules[\\/](@firebase[\\/]auth|firebase[\\/]auth)[\\/]/ },
            { name: "firebase-database", test: /node_modules[\\/](@firebase[\\/]database|firebase[\\/]database)[\\/]/ },
          ],
        },
      },
    },
  },
})
