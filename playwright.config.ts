import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'tests/e2e/artifacts/html-report' }],
  ],
  use: {
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  outputDir: 'tests/e2e/artifacts/test-results',
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  /*
   * Feature 013 (T023/T026/T027/T029) needs ES-module loading, which Chromium
   * blocks on file:// URLs (CORS). Run a static HTTP server on port 8766
   * (matches `start-local-generic.cmd`) so the tab-navigation spec can serve
   * the dashboards over http://. The pre-existing Feature 011 spec keeps
   * using file:// via `helpers.ts > loadDashboard` — both schemes coexist.
   */
  webServer: {
    command: 'python -m http.server 8766',
    url: 'http://127.0.0.1:8766/FIRE-Dashboard-Generic.html',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
