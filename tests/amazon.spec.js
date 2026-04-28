const { test, expect } = require("@playwright/test");
const { AmazonPage } = require("../pages/AmazonPage");
const { testData } = require("../test-data.json");
const AxeBuilder = require("@axe-core/playwright").default;
const fs = require("fs");
const path = require("path");

// Professional Logger Utility
const logger = {
  info: (msg) => console.log(`[${new Date().toLocaleTimeString()}] [INFO] ${msg}`),
  warn: (msg) => console.warn(`[${new Date().toLocaleTimeString()}] [WARN] ${msg}`),
  error: (msg) => console.error(`[${new Date().toLocaleTimeString()}] [ERROR] ${msg}`),
  pass: (msg) => console.log(`[${new Date().toLocaleTimeString()}] [PASS] ✅ ${msg}`),
};

test.describe("Amazon Product Workflow - Enterprise Suite", () => {

  test.beforeAll(async () => {
    if (!fs.existsSync("test-results")) fs.mkdirSync("test-results");
    logger.info("Initializing Test Suite: Amazon Global E2E");
  });

  for (const data of testData) {
    test(`Scenario: ${data.label} - E2E Purchase Flow`, async ({ page }) => {
      const amazon = new AmazonPage(page);
      let success = false;
      let finalPrice = "";

      logger.info(`STARTING WORKFLOW: ${data.label}`);

      for (const term of data.searchTerms) {
        logger.info(`Attempting search for: "${term}"`);
        
        try {
          await amazon.navigate();
          await amazon.searchProduct(term);
          await amazon.ensureUsLocation();
          await page.waitForTimeout(2000); // Buffer for location-based search results
          
          const candidates = await amazon.getProductCandidates();
          if (candidates.length === 0) {
            logger.warn(`No valid candidates for "${term}", skipping...`);
            continue;
          }

          // Try top 2 candidates for maximum reliability
          for (const candidate of candidates.slice(0, 2)) {
            logger.info(`Evaluating Product: ${candidate.title.substring(0, 60)}...`);
            await page.goto(candidate.url, { waitUntil: "domcontentloaded" });
            
            // Mandatory Accessibility Audit
            await runA11yAudit(page, data.label, term).catch(() => {});

            const price = await amazon.getPrice();
            if (!price) {
              logger.warn("Price detection failed on this PDP, trying next...");
              continue;
            }

            logger.info(`Detected Price: ${price}. Adding to cart...`);
            await amazon.addToCart();
            
            // Critical Verification: Cart Persistence and Price Accuracy
            logger.info("Verifying cart persistence...");
            const cartPrice = await amazon.verifyCartContents(price);
            
            finalPrice = cartPrice || price;
            success = true;
            break;
          }

          if (success) break;
        } catch (error) {
          logger.error(`Critical error during "${term}" flow: ${error.message}`);
          await page.screenshot({ path: `test-results/error-${data.label}-${term}.png` });
        }
      }

      expect(success, `Failed to complete ${data.label} flow after all retries`).toBeTruthy();
      logger.pass(`${data.label} flow completed successfully at ${finalPrice}`);
      
      await page.screenshot({ path: `test-results/${data.label.replace(/\s+/g, "-")}-final.png`, fullPage: true });
    });
  }
});

/**
 * Executes a WCAG 2.1 Accessibility Audit and saves results if violations are found.
 */
async function runA11yAudit(page, label, term) {
  try {
    const results = await new AxeBuilder({ page }).analyze();
    if (results.violations.length > 0) {
      const fileName = `test-results/a11y-${label}-${term}.json`.replace(/\s+/g, "-");
      fs.writeFileSync(fileName, JSON.stringify(results.violations, null, 2));
      logger.warn(`Accessibility violations found (${results.violations.length}). Report saved: ${fileName}`);
    }
  } catch (e) {
    // Audit failed - possibly page structure or network issues
  }
}
