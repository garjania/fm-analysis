import { defineConfig } from 'vite';

// When deploying to GitHub Pages at https://username.github.io/repo-name/
// set VITE_BASE_URL=/repo-name/ (done automatically by the CI workflow).
// For a root-level user/org page (username.github.io) leave it as '/'.
const base = process.env.VITE_BASE_URL ?? '/';

export default defineConfig({
  base,
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    assetsDir: 'assets',
  },
});
