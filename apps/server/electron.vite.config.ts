import react from '@vitejs/plugin-react';
import autoprefixer from 'autoprefixer';
import tailwindcss from 'tailwindcss';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
// Config object import, not a package import — tailwind.config.js already
// computes its own `content` globs as absolute paths from its own file
// location (see that file's comment), so importing it from here is safe
// regardless of this file's cwd.
import tailwindConfig from '../client/tailwind.config.js';

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
    // Explicit, not auto-discovered: electron-vite runs this with root
    // '../client' but process.cwd() stays apps/server, and Vite's postcss
    // config auto-discovery does not reliably follow `root` in that split —
    // it silently fell back to Tailwind's zero-content default (base reset
    // only, every utility class purged). Passing the plugins directly avoids
    // relying on file-based config discovery at all.
    css: {
      postcss: {
        plugins: [tailwindcss(tailwindConfig), autoprefixer()],
      },
    },
    build: {
      outDir: 'dist/renderer',
      rollupOptions: { input: '../client/index.html' },
    },
  },
});
