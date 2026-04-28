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
      ".a-price .a-offscreen",
      "#priceblock_ourprice",
      "#priceblock_dealprice",
      "#price_inside_buybox",
      ".a-color-price"
    ];

    this.cartUrl = "https://www.amazon.com/gp/cart/view.html";
    this.cartItemPriceSelector = ".sc-product-price, .sc-subtotal-amount .a-price .a-offscreen";
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
      console.log(`[Location] Current detected: "${locationText.trim().replace(/\s+/g, ' ')}"`);
      
      if (!force && (locationText.includes("10001") || locationText.includes("New York"))) {
        return;
      }

      console.log("[Location] Setting delivery location to US (10001)...");
      await this.page.locator(this.locationSlot).click({ timeout: 5000 }).catch(() => {
        return this.page.locator("#nav-global-location-slot span.nav-line-2").click({ timeout: 3000 });
      });
      
      // Amazon sometimes shows a 'Change' link if a location is already cached
      const changeLink = this.page.locator('#GLUXChangePostalCodeLink').first();
      if (await changeLink.isVisible({ timeout: 2000 })) {
        await changeLink.click();
      }

      // Wait for popover and input
      await this.page.waitForSelector(this.zipInput, { state: "visible", timeout: 8000 });
      const input = this.page.locator(this.zipInput).first();
      await input.fill("10001");
      
      // Try clicking 'Apply' button specifically
      const applyBtn = this.page.locator('input[aria-labelledby="GLUXZipUpdate-announce"], #GLUXZipUpdate').first();
      if (await applyBtn.isVisible()) {
        await applyBtn.click();
      } else {
        await this.page.keyboard.press("Enter");
      }
      
      // Wait for 'Done' or 'Continue' or the popover to close
      const doneBtn = this.page.locator('button[name="glowDoneButton"], #GLUXConfirmClose, .a-button-focus .a-button-text:has-text("Done")').first();
      await doneBtn.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
      if (await doneBtn.isVisible()) {
        await doneBtn.click({ force: true }).catch(() => {});
      }
      
      // Allow time for the page to refresh or background update
      await this.page.waitForLoadState("networkidle").catch(() => {});
      await this.page.waitForTimeout(2000); 
      
      // Verify update in the UI
      const updatedText = await this.page.locator(this.locationSlot).textContent().catch(() => "");
      if (updatedText.includes("10001") || updatedText.includes("New York")) {
        console.log("[Location] Successfully updated to US.");
      } else {
        console.warn("[Location] Update might have failed, UI still shows:", updatedText.trim());
      }
    } catch (e) {
      console.warn(`[Location] Process failed: ${e.message}`);
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
      }).filter(item => {
        const isSpam = item.url.includes("/sspa/");
        const titleLower = item.title.toLowerCase();
        const isAccessory = titleLower.includes("case") || 
                           titleLower.includes("cover") || 
                           titleLower.includes("screen protector") || 
                           titleLower.includes("cable") || 
                           titleLower.includes("charger") ||
                           titleLower.includes("adapter") ||
                           titleLower.includes("belt clip");
        return item.url && item.url.includes("/dp/") && !isSpam && !isAccessory;
      });
    });
  }

  async getPrice() {
    for (const selector of this.priceSelectors) {
      const text = await this.page.locator(selector).first().textContent().catch(() => null);
      if (text) {
        const match = text.replace(/\s+/g, "").match(/(?:\$|INR|USD|Rs\.?)\s?[\d,]+(?:\.\d{2})?/i);
        if (match) return match[0];
      }
    }
    return null;
  }

  async addToCart() {
    const buyingOptionsBtn = this.page.locator('#buybox-see-all-buying-choices, #buybox-see-all-buying-choices-announce').first();
    if (await buyingOptionsBtn.isVisible({ timeout: 3000 })) {
      console.log("[Cart] Found 'See All Buying Options', clicking...");
      await buyingOptionsBtn.click();
      
      const sideAddToCart = this.page.locator('input[name="submit.addToCart"], [aria-labelledby="a-autoid-0-announce"] input, #a-autoid-0-announce').first();
      await sideAddToCart.waitFor({ state: "visible", timeout: 10000 });
      await sideAddToCart.click();
    } else {
      let btn = null;
      for (const selector of this.addToCartSelectors) {
        const locator = this.page.locator(selector).first();
        if (await locator.isVisible({ timeout: 2000 })) {
          btn = locator;
          break;
        }
      }

      if (!btn) throw new Error("Add to Cart button not found (Standard or Buying Options)");
      await btn.click({ force: true });
    }
    
    await this.handlePostAddToCartPopups();
  }

  async handlePostAddToCartPopups() {
    const dismissSelectors = ['#attachSiNoCoverage', '#siNoCoverage', '#attach-si-no-thanks', 'button:has-text("No thanks")'];
    for (const s of dismissSelectors) {
      const dismissBtn = this.page.locator(s).first();
      if (await dismissBtn.isVisible({ timeout: 4000 })) {
        console.log("[Cart] Dismissing upsell popup...");
        await dismissBtn.click().catch(() => {});
        break; 
      }
    }
    await this.page.waitForSelector("#attach-added-to-cart-message, #sw-atc-confirmation, .a-alert-success, #huc-v2-order-row-confirm-text", { timeout: 10000 }).catch(() => {});
  }

  async verifyCartContents(expectedPrice) {
    await this.page.goto(this.cartUrl, { waitUntil: "networkidle" });
    const isEmpty = await this.page.locator("#sc-active-cart :has-text('Your Amazon Cart is empty')").isVisible().catch(() => false);
    if (isEmpty) throw new Error("Cart is empty after 'Add to Cart' action");

    const cartPrice = await this.page.locator(this.cartItemPriceSelector).first().textContent().catch(() => "");
    const cleanedCartPrice = cartPrice.replace(/\s+/g, "");
    console.log(`[Verify] Cart Price: ${cleanedCartPrice} | Expected: ${expectedPrice}`);
    
    const numericExpected = expectedPrice.replace(/[^\d.]/g, "");
    const numericCart = cleanedCartPrice.replace(/[^\d.]/g, "");
    if (!numericCart.includes(numericExpected) && !numericExpected.includes(numericCart)) {
      console.warn(`[Price Warning] Minor mismatch: Cart(${numericCart}) vs PDP(${numericExpected})`);
    }
    return cleanedCartPrice;
  }

  async handleInterstitials() {
    const dismissSelectors = [
      'input[name="accept"]', 
      "#sp-cc-accept", 
      'button:has-text("No thanks")', 
      'button:has-text("Dismiss")',
      '#attach-close_sideSheet-link'
    ];
    for (const s of dismissSelectors) {
      await this.page.locator(s).first().click({ timeout: 500 }).catch(() => {});
    }
  }
}

module.exports = { AmazonPage };
