import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    proxy: {
      '/api/mrp': {
        target: 'http://localhost:3100',
        changeOrigin: true,
      },
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
