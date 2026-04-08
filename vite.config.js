import { defineConfig } from 'vite';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

/**
 * Plugin Vite che monta il backend GB2/MRP direttamente nel dev server.
 * Usa gli STESSI file di produzione (gb2Routes.js + config/db-gb2.js).
 */
function gabrieleBackendPlugin() {
  return {
    name: 'gabriele-backend',
    configureServer(server) {
      const express = require('express');
      const mrpApp = express();
      mrpApp.use(express.json());

      // Stesso file usato in produzione, con skipAuth per dev locale
      const createGb2Routes = require('./routes/gb2Routes');
      const router = createGb2Routes({ skipAuth: true });
      mrpApp.use('/api/mrp', router);

      // Intercetta solo /api/mrp, lascia tutto il resto al proxy Vite
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
          const { getPoolProd } = require('./config/db-gb2');
          const pool = await getPoolProd();
          const results = await createGb2Routes.deployProductionObjects(pool);
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
