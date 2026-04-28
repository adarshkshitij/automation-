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
  workers: 4,
  timeout: 480000,
  expect: {
    timeout: 15000,
  },
  retries: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "https://www.amazon.com",
    headless: true,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15000,
    navigationTimeout: 45000,
    locale: "en-US",
    timezoneId: "America/New_York",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
    },
    launchOptions: {
      channel: "chrome",
      args: ["--disable-blink-features=AutomationControlled"],
    },
    ...devices["Desktop Chrome"],
    ...lambdaTestUse,
  },
});
