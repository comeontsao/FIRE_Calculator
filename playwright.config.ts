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
});
