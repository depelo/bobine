import { defineConfig } from 'vite';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

/**
 * Plugin Vite che avvia il backend MRP (Gabriele2.0) direttamente nel dev server.
 * Elimina la necessità di lanciare server.js di Gabriele2.0 separatamente.
 */
function gabrieleBackendPlugin() {
  return {
    name: 'gabriele-backend',
    configureServer(server) {
      const express = require('express');
      const mrpApp = express();
      mrpApp.use(express.json());

      const mrpRoutes = require('./Gabriele2.0/routes/mrpRoutes');
      mrpApp.use('/api/mrp', mrpRoutes);

      // Monta Express solo per /api/mrp, lascia tutto il resto al proxy Vite
      server.middlewares.use((req, res, next) => {
        if (req.url.startsWith('/api/mrp')) {
          mrpApp(req, res, next);
        } else {
          next();
        }
      });

      // Auto-deploy SQL
      (async () => {
        try {
          const { getPoolMRP } = require('./Gabriele2.0/config/db');
          const { deployMrpObjects } = require('./Gabriele2.0/routes/mrpRoutes');
          const pool = await getPoolMRP();
          const results = await deployMrpObjects(pool);
          console.log('[GB2] Auto-deploy SQL:', results.map(r => `${r.file}: ${r.status}`).join(', '));
        } catch (err) {
          console.warn('[GB2] Auto-deploy SQL non riuscito:', err.message);
        }
      })();
    }
  };
}

export default defineConfig({
  plugins: [gabrieleBackendPlugin()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'https://rotoli.ujet.it',
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: 'https://rotoli.ujet.it',
        ws: true,
        changeOrigin: true,
      }
    }
  }
});
