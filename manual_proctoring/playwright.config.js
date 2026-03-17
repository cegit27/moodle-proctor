import { defineConfig } from '@playwright/test';
import { _electron as electron } from 'playwright';

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: 'http://localhost:5000', // Backend URL
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'electron',
      use: {
        browserName: 'chromium',
        launchOptions: {
          executablePath: electron.launch,
          args: ['.'],
        },
      },
    },
  ],
});