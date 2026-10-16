import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  /**
   * Le `.env` vit à la racine du monorepo, partagé avec l'API. Vite n'en expose au code
   * client QUE les variables préfixées : `APP_MODE` seule, jamais les secrets voisins
   * (identifiants WCL, URL de base).
   */
  envDir: '../..',
  envPrefix: ['VITE_', 'APP_MODE'],
  server: {
    port: 5173,
    // L'API tourne dans un process séparé (plan §3) : on proxifie pour éviter le CORS en dev.
    proxy: { '/api': { target: `http://localhost:${process.env.API_PORT ?? 3000}`, changeOrigin: true } },
  },
});
