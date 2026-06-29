import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// Multi-page: the mobile app (index.html) + the admin dashboard (admin.html).
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    open: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        admin: fileURLToPath(new URL('./admin.html', import.meta.url)),
      },
    },
  },
})
