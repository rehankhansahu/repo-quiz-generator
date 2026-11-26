import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Resolve the GitHub Pages sub-path automatically in GitHub Actions via GITHUB_REPOSITORY,
// or fall back to '/repo-quiz-generator/' for local builds targeting GitHub Pages.
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const isUserOrOrgSite = repoName?.endsWith('.github.io');
const base =
  process.env.VITE_BASE_PATH ||
  (repoName ? (isUserOrOrgSite ? '/' : `/${repoName}/`) : '/repo-quiz-generator/');

export default defineConfig({
  plugins: [react()],
  base,
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
});
