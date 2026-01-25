import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
      '/opds': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
      '/ws': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      }
    }
  }
})
