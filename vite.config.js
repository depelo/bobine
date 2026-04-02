import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'https://rotoli.ujet.it',
        changeOrigin: true,
        secure: false, // Disabilita la validazione SSL per il proxying locale
      },
      '/socket.io': {
        target: 'https://rotoli.ujet.it',
        ws: true,
        changeOrigin: true,
      }
    }
  }
});
