import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // L'API tourne dans un process séparé (plan §3) : on proxifie pour éviter le CORS en dev.
    proxy: { '/api': { target: `http://localhost:${process.env.API_PORT ?? 3000}`, changeOrigin: true } },
  },
});
