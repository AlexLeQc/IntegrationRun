import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true, // Allow connections from local network (e.g. mobile devices)
    port: 3000,
  },
  build: {
    outDir: 'dist',
  },
});
