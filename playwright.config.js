const { defineConfig, devices } = require("@playwright/test");
const dotenv = require("dotenv");

dotenv.config();

const isLambdaTest = process.env.LT_CLOUD === "1";

function buildLambdaTestWsEndpoint() {
  const username = process.env.LT_USERNAME;
  const accessKey = process.env.LT_ACCESS_KEY;
  const gridUrl = process.env.LT_GRID_URL || "wss://cdp.lambdatest.com/playwright?capabilities=";

  if (!username || !accessKey) {
    throw new Error("LT_USERNAME and LT_ACCESS_KEY are required for LambdaTest runs.");
  }

  const capabilities = {
    browserName: "Chrome",
    browserVersion: "latest",
    "LT:Options": {
      platform: "Windows 11",
      build: "Amazon assignment build",
      name: "Amazon parallel assignment",
      user: username,
      accessKey,
      network: true,
      video: true,
      console: true,
    },
  };

  return `${gridUrl}${encodeURIComponent(JSON.stringify(capabilities))}`;
}

const lambdaTestUse = isLambdaTest
  ? {
      connectOptions: {
        wsEndpoint: buildLambdaTestWsEndpoint(),
      },
    }
  : {};

module.exports = defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  workers: 1, // Keep as 1 for stability on Amazon
  timeout: 600000,
  expect: {
    timeout: 15000,
  },
  retries: process.env.CI ? 2 : 1, // More retries in CI
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }]
  ],
  use: {
    baseURL: "https://www.amazon.com",
    headless: true,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 30000,
    navigationTimeout: 60000,
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage"
      ],
    },
    ...lambdaTestUse,
  },
});

