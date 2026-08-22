import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

// @shop/* workspace packages are TS source only (no compiled entry point) —
// they must be bundled by Vite, not left as a raw runtime `require()`.
const workspacePackages = ['@shop/db', '@shop/core', '@shop/contracts', '@shop/shared'];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
    build: {
      lib: { entry: 'src/main.ts' },
      outDir: 'dist/main',
      rollupOptions: {
        // better-sqlite3 is a transitive dependency (via @shop/db), not a
        // direct one — externalizeDepsPlugin only scans this package.json's
        // own dependency list, so it needs naming explicitly here too.
        external: ['better-sqlite3'],
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
    build: {
      lib: { entry: 'src/preload.ts' },
      outDir: 'dist/preload',
      rollupOptions: {
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: '../client',
    plugins: [react()],
    build: {
      outDir: 'dist/renderer',
      rollupOptions: { input: '../client/index.html' },
    },
  },
});
