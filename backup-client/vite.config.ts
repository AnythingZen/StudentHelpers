import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5174,
    // In dev, the API lives on C's server. In production the server serves this build.
    proxy: { '/api': 'http://localhost:3001' },
    // The client imports the server's pure rules file (../server/src/schedule.ts) so
    // lock and health logic can never drift between client and server.
    fs: { allow: ['..'] },
  },
  build: {
    chunkSizeWarningLimit: 1200, // three.js alone is ~560 kB
    // Two pages: the student forest and the teacher console (Vite 8: rolldownOptions).
    rolldownOptions: {
      input: {
        student: resolve(import.meta.dirname, 'index.html'),
        teacher: resolve(import.meta.dirname, 'teacher.html'),
      },
    },
  },
});
