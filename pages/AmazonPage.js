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
    this.cartItemPriceSelector = ".sc-product-price, #sc-subtotal-amount-buybox .sc-price, .sc-subtotal-amount .a-price .a-offscreen, .sc-price";
  }

  async navigate() {
    const entryUrl = "https://www.amazon.com/dp/B0CMPMY9ZZ"; 
    console.log(`[Navigate] Going to entry URL: ${entryUrl}`);
    try {
      await this.page.goto(entryUrl, { waitUntil: "commit", timeout: 30000 });
      await this.page.waitForSelector("#nav-logo, #nav-global-location-slot", { timeout: 15000 });
    } catch (e) {
      console.warn(`[Navigate] Entry URL commit failed (${e.message}), trying homepage...`);
      await this.page.goto(this.url, { waitUntil: "commit", timeout: 20000 });
      await this.page.waitForSelector("#nav-logo", { timeout: 10000 }).catch(() => {});
    }
    await this.handleInterstitials();
  }

  async searchProduct(term) {
    const searchUrl = `${this.url}s?k=${encodeURIComponent(term)}`;
    console.log(`[Search] Navigating to: ${searchUrl}`);
    await this.page.goto(searchUrl, { waitUntil: "commit", timeout: 30000 });
    await this.page.waitForSelector("#nav-logo, [data-component-type='s-search-result']", { timeout: 15000 }).catch(() => {});
    await this.handleInterstitials();
  }

  async ensureUsLocation(force = false) {
    const maxRetries = 2;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Check for CAPTCHA
        const captcha = await this.page.locator('input#captchacharacters, #captchacharacters').isVisible().catch(() => false);
        if (captcha) {
          console.error("[Location] CAPTCHA detected! Automation blocked.");
          await this.page.screenshot({ path: `test-results/captcha-detected-${Date.now()}.png` });
          throw new Error("CAPTCHA detected");
        }

        // Wait for any part of the header to appear
        const headerFound = await this.page.waitForSelector("#nav-global-location-slot, #nav-main, #nav-logo, #twotabsearchtextbox", { state: "attached", timeout: 30000 }).catch(async (e) => {
          console.error("[Location] Header elements not found. Current URL:", this.page.url());
          const content = await this.page.content();
          console.log("[Location] Page content snippet:", content.substring(0, 800));
          await this.page.screenshot({ path: `test-results/header-timeout-${Date.now()}.png` });
          throw e;
        });
        
        await this.handleInterstitials();

        const locationText = await this.page.locator("#glow-ingress-line2").textContent().catch(() => "");
        console.log(`[Location] Attempt ${attempt}: Current detected: "${locationText.trim()}"`);
        
        if (!force && (locationText.includes("10001") || locationText.includes("New York"))) {
          console.log("[Location] Location is already correct.");
          return;
        }

        console.log("[Location] Setting delivery location to US (10001)...");
        // Click specifically the link that triggers the popover
        const trigger = this.page.locator("#nav-global-location-popover-link").first();
        await trigger.click({ timeout: 8000 }).catch(async () => {
          console.warn("[Location] Primary trigger failed, trying fallback...");
          return this.page.locator(this.locationSlot).click({ timeout: 5000 });
        });
        
        // Amazon sometimes shows a 'Change' link if a location is already cached
        const changeLink = this.page.locator('#GLUXChangePostalCodeLink').first();
        if (await changeLink.isVisible({ timeout: 3000 })) {
          await changeLink.click();
        }

        // Wait for popover and input
        await this.page.waitForSelector(this.zipInput, { state: "visible", timeout: 10000 });
        const input = this.page.locator(this.zipInput).first();
        await input.fill("10001");
        
        // Click 'Apply' button
        const applyBtn = this.page.locator('#GLUXZipUpdate, input[aria-labelledby="GLUXZipUpdate-announce"]').first();
        await applyBtn.click();
        
        // CRITICAL: Wait for the Done button and click it to trigger refresh
        const doneBtn = this.page.locator('button[name="glowDoneButton"], #a-autoid-1-announce, #GLUXConfirmClose, .a-popover-footer input.a-button-input').first();
        await doneBtn.waitFor({ state: "visible", timeout: 10000 }).catch(() => {
          console.warn("[Location] Done button not found, maybe it auto-dismissed?");
        });
        
        if (await doneBtn.isVisible()) {
          await doneBtn.click({ force: true });
        }
        
        // Wait for reload or network idle
        await this.page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        await this.page.waitForTimeout(4000); 
        
        // Final verification
        const finalCheck = await this.page.locator("#glow-ingress-line2").textContent().catch(() => "");
        if (finalCheck.includes("10001") || finalCheck.includes("New York")) {
          console.log("[Location] Successfully verified US location.");
          return;
        }
      } catch (e) {
        console.warn(`[Location] Attempt ${attempt} failed: ${e.message}`);
        await this.page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
        await this.page.waitForTimeout(2000);
      }
    }
    throw new Error("Failed to set US location after multiple attempts");
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
                           titleLower.includes("belt clip") ||
                           titleLower.includes("battery");
        return item.url && item.url.includes("/dp/") && !isSpam && !isAccessory;
      });
    });
  }

  async getPrice() {
    for (const selector of this.priceSelectors) {
      const text = await this.page.locator(selector).first().textContent().catch(() => null);
      if (text) {
        // More robust price matching for USD and INR
        const match = text.replace(/\s+/g, "").match(/(?:\$|INR|USD|Rs\.?)\s?[\d,]+(?:\.\d{2})?/i);
        if (match) return match[0];
      }
    }
    return null;
  }

  async addToCart() {
    const buyingOptionsBtn = this.page.locator('#buybox-see-all-buying-choices, #buybox-see-all-buying-choices-announce, a:has-text("See All Buying Options")').first();
    
    if (await buyingOptionsBtn.isVisible({ timeout: 3000 })) {
      console.log("[Cart] Found 'See All Buying Options', clicking...");
      await buyingOptionsBtn.click();
      
      // Wait for side panel or new page
      const sideAddToCart = this.page.locator('#a-popover-content-1 input[name="submit.addToCart"], .a-side-sheet input[name="submit.addToCart"], #a-autoid-0-announce input').first();
      await sideAddToCart.waitFor({ state: "visible", timeout: 10000 }).catch(() => {
        console.warn("[Cart] Side panel Add to Cart not found, checking if it navigated...");
      });
      
      if (await sideAddToCart.isVisible()) {
        await sideAddToCart.click();
      } else {
        // Fallback for when 'See All Buying Options' leads to a new page
        await this.page.locator('input[name="submit.add-to-cart"]').first().click({ timeout: 5000 }).catch(() => {
          throw new Error("Could not find Add to Cart button in Buying Options");
        });
      }
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
    console.log("[Verify] Navigating to cart...");
    await this.page.goto(this.cartUrl, { waitUntil: "load", timeout: 30000 });
    await this.handleInterstitials();
    
    const isEmpty = await this.page.locator("#sc-active-cart :has-text('Your Amazon Cart is empty')").isVisible({ timeout: 5000 }).catch(() => false);
    if (isEmpty) {
      console.warn("[Verify] Cart appears empty. Taking diagnostic screenshot...");
      await this.page.screenshot({ path: `test-results/empty-cart-${Date.now()}.png` });
      throw new Error("Cart is empty after 'Add to Cart' action");
    }

    let cartPrice = "";
    const selectors = this.cartItemPriceSelector.split(",").map(s => s.trim());
    for (const selector of selectors) {
      cartPrice = await this.page.locator(selector).first().textContent().catch(() => "");
      if (cartPrice && cartPrice.trim()) break;
    }

    const cleanedCartPrice = cartPrice.replace(/\s+/g, "");
    console.log(`[Verify] Cart Price detected: ${cleanedCartPrice} | Expected: ${expectedPrice}`);
    
    const numericExpected = expectedPrice.replace(/[^\d.]/g, "");
    const numericCart = cleanedCartPrice.replace(/[^\d.]/g, "");
    if (!numericCart.includes(numericExpected) && !numericExpected.includes(numericCart)) {
      console.warn(`[Price Warning] Minor mismatch: Cart(${numericCart}) vs PDP(${numericExpected})`);
    }
    return cleanedCartPrice;
  }

  async clearCart() {
    console.log("[Cart] Clearing cart for fresh start...");
    await this.page.goto(this.cartUrl, { waitUntil: "load" });
    await this.handleInterstitials();
    
    const deleteBtns = this.page.locator('input[value="Delete"], .sc-action-delete input');
    const count = await deleteBtns.count();
    for (let i = 0; i < count; i++) {
      await deleteBtns.first().click().catch(() => {});
      await this.page.waitForTimeout(1000);
    }
  }

  async waitForProductPage() {
    console.log("[PDP] Waiting for product details to load...");
    await this.page.waitForSelector("#productTitle, #add-to-cart-button, #corePrice_feature_div", { state: "attached", timeout: 20000 }).catch(() => {
      console.warn("[PDP] Key elements not found, checking if page is blank...");
    });
    
    // Handle the "blank body" transient state subagent found
    const isBlank = await this.page.evaluate(() => document.body.innerText.length < 200);
    if (isBlank) {
      console.log("[PDP] Page appears blank, refreshing...");
      await this.page.reload({ waitUntil: "domcontentloaded" });
      await this.page.waitForTimeout(3000);
    }
    
    await this.handleInterstitials();
  }

  async handleInterstitials() {
    const dismissSelectors = [
      'input[name="accept"]', 
      "#sp-cc-accept", 
      'button:has-text("No thanks")', 
      'button:has-text("Dismiss")',
      '#attach-close_sideSheet-link',
      '.a-popover-header button[data-action="a-popover-close"]',
      '#nav-flyout-accountList'
    ];
    for (const s of dismissSelectors) {
      await this.page.locator(s).first().click({ timeout: 500 }).catch(() => {});
    }
    
    const signInPopover = this.page.locator('#nav-signin-tooltip').first();
    if (await signInPopover.isVisible()) {
       await this.page.mouse.move(0,0);
    }
  }
}

module.exports = { AmazonPage };
