import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const port = Number(process.env.PORT) || 5173;

export default defineConfig({
  base: '/newsletter/',
  server: {
    host: '0.0.0.0',
    port,
  },
  preview: {
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 4173,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        submit: resolve(__dirname, 'submit/index.html'),
        manage: resolve(__dirname, 'manage/index.html'),
        calendar: resolve(__dirname, 'calendar/index.html'),
        admin: resolve(__dirname, 'admin/index.html'),
      },
    },
  },
});
