import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/gun': {
        target: 'http://localhost:8765',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  test: {
    exclude: ['test/e2e/**', 'node_modules/**'],
  },
})
