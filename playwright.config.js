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
  workers: 1,
  timeout: 600000,
  expect: {
    timeout: 15000,
  },
  retries: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "https://www.amazon.com",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 20000,
    navigationTimeout: 45000,
    // Using default Playwright device settings for better compatibility
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
    },
    ...lambdaTestUse,
  },
});
