const { expect } = require("@playwright/test");

class AmazonPage {
  constructor(page) {
    this.page = page;
    this.url = "https://www.amazon.com/";
    this.searchInput = "#twotabsearchtextbox";
    this.locationSlot = "#nav-global-location-slot";
    this.zipInput = "#GLUXZipUpdateInput";
    
    this.addToCartSelectors = [
      "#add-to-cart-button",
      "#desktop_qualifiedBuyBox #add-to-cart-button",
      'input[name="submit.add-to-cart"]',
      'input[name="submit.addToCart"]',
      'button:has-text("Add to cart")',
      '#buy-now-button'
    ];

    this.priceSelectors = [
      "#corePrice_feature_div .a-price .a-offscreen",
      "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen",
      "#apex_desktop .a-price .a-offscreen",
      ".a-price .a-offscreen"
    ];
  }

  async navigate() {
    await this.page.goto(this.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await this.handleInterstitials();
  }

  async searchProduct(term) {
    const searchUrl = `${this.url}s?k=${encodeURIComponent(term)}`;
    await this.page.goto(searchUrl, { waitUntil: "domcontentloaded" });
    await this.handleInterstitials();
    
    await this.page.waitForSelector('[data-component-type="s-search-result"]', { timeout: 15000 }).catch(() => {});
  }

  async ensureUsLocation(force = false) {
    try {
      const locationText = await this.page.locator(this.locationSlot).textContent().catch(() => "");
      
      if (!force && (locationText.includes("10001") || locationText.includes("New York"))) {
        return;
      }

      await this.page.locator(this.locationSlot).click({ timeout: 5000 }).catch(() => {});
      const input = this.page.locator(this.zipInput).first();
      
      if (await input.isVisible({ timeout: 5000 })) {
        await input.fill("10001");
        await this.page.keyboard.press("Enter");
        
        // Wait for 'Done' or 'Continue'
        const doneBtn = this.page.locator('button[name="glowDoneButton"], #GLUXConfirmClose').first();
        await doneBtn.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
        await doneBtn.click({ force: true }).catch(() => {});
        
        await this.page.waitForLoadState("domcontentloaded");
      }
    } catch (e) {
      console.warn("Location update failed, continuing...");
    }
  }

  async getProductCandidates() {
    return await this.page.locator('[data-component-type="s-search-result"][data-asin]').evaluateAll((results) => {
      return results.map(res => {
        const link = res.querySelector('h2 a, a.a-link-normal');
        return {
          title: res.querySelector("h2")?.textContent?.trim() || "",
          url: link ? new URL(link.getAttribute("href"), "https://www.amazon.com").toString() : null
        };
      }).filter(item => item.url && item.url.includes("/dp/") && !item.url.includes("/sspa/"));
    });
  }

  async getPrice() {
    for (const selector of this.priceSelectors) {
      const text = await this.page.locator(selector).first().textContent().catch(() => null);
      if (text) {
        const match = text.replace(/\s+/g, "").match(/(?:\$|INR|USD)\s?[\d,]+(?:\.\d{2})?/i);
        if (match) return match[0];
      }
    }
    return null;
  }

  async addToCart() {
    let btn = null;
    for (const selector of this.addToCartSelectors) {
      const locator = this.page.locator(selector).first();
      if (await locator.isVisible({ timeout: 2000 })) {
        btn = locator;
        break;
      }
    }

    if (!btn) throw new Error("Add to Cart button not found");
    await btn.click();
    
    // Check for success message
    await this.page.waitForSelector("#attach-added-to-cart-message, #sw-atc-confirmation, .a-alert-success", { timeout: 10000 }).catch(() => {});
  }

  async handleInterstitials() {
    const dismissSelectors = ['input[name="accept"]', "#sp-cc-accept", 'button:has-text("No thanks")', 'button:has-text("Dismiss")'];
    for (const s of dismissSelectors) {
      await this.page.locator(s).first().click({ timeout: 500 }).catch(() => {});
    }
  }
}

module.exports = { AmazonPage };
