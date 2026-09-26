import { defineConfig } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const useElectron =
  process.env.ELECTRON === '1' || String(process.env.npm_lifecycle_event || '').includes('desktop')

const electronPlugin = electron({
  main: {
    entry: 'electron/main.ts',
  },
  preload: {
    input: path.join(__dirname, 'electron/preload.ts'),
  },
  renderer: process.env.NODE_ENV === 'test' ? undefined : {},
})

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(useElectron ? [electronPlugin] : [])],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: true,
    port: 4173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
})
