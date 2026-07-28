import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 30_000,
  use: { headless: true },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' },
      },
    },
    {
      name: 'edge',
      use: {
        browserName: 'chromium',
        launchOptions: { executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' },
      },
    },
  ],
});

