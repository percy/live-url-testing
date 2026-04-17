const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests',
  timeout: 120000,
  expect: { timeout: 10000 },
  fullyParallel: true,
  retries: 0,
  workers: 5,
  reporter: [['dot']],
  use: {
    navigationTimeout: 90000,
    actionTimeout: 30000,
  },
});
