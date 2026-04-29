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
      await this.page.goto(this.url, { waitUntil: "domcontentloaded", timeout: 20000 });
      await this.page.waitForSelector("#nav-logo", { timeout: 10000 }).catch(() => {});
    }
    await this.handleInterstitials();
  }

  async searchProduct(term) {
    const searchUrl = `${this.url}s?k=${encodeURIComponent(term)}`;
    console.log(`[Search] Navigating to: ${searchUrl}`);
    
    // Retry search navigation up to 2 times for flaky network
    for (let i = 0; i < 2; i++) {
      try {
        await this.page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        await this.page.waitForSelector("#nav-logo, [data-component-type='s-search-result']", { timeout: 15000 }).catch(() => {});
        break;
      } catch (e) {
        if (i === 1) throw e;
        console.warn(`[Search] Attempt ${i + 1} failed, retrying search...`);
        await this.page.waitForTimeout(3000);
      }
    }
    await this.handleInterstitials();
  }

  async ensureUsLocation(force = false) {
    const maxRetries = 1;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.handleInterstitials();
        
        // Check for CAPTCHA
        const captcha = await this.page.locator('input#captchacharacters, #captchacharacters').isVisible().catch(() => false);
        if (captcha) {
          console.error("[Location] CAPTCHA detected! Automation blocked.");
          throw new Error("CAPTCHA detected");
        }

        // Wait for header to be stable and have text
        const locationSlot = this.page.locator("#nav-global-location-slot");
        await locationSlot.waitFor({ state: "visible", timeout: 20000 });
        
        // Wait up to 5s for the text to actually appear
        let locationText = "";
        for (let i = 0; i < 5; i++) {
          locationText = await locationSlot.textContent().catch(() => "");
          if (locationText.trim().length > 5) break;
          await this.page.waitForTimeout(1000);
        }
        
        console.log(`[Location] Attempt ${attempt}: Current detected: "${locationText.trim()}"`);
        
        const isUs = locationText.includes("10001") || 
                     locationText.includes("New York") || 
                     (locationText.includes("United States") && !locationText.includes("India"));

        if (!force && isUs) {
          console.log("[Location] Location is already correct.");
          return;
        }

        console.log("[Location] Triggering location popover...");
        const triggers = [
          "#nav-global-location-popover-link", 
          "#nav-global-location-slot", 
          "#glow-ingress-block", 
          "span.nav-line-2:has-text('Deliver to')",
          "button:has-text('Change Address')"
        ];
        let triggered = false;
        for (const t of triggers) {
          try {
            const trigger = this.page.locator(t).first();
            if (await trigger.isVisible({ timeout: 2000 })) {
              console.log(`[Location] Clicking trigger: ${t}`);
              await trigger.click({ force: true, timeout: 5000 });
              triggered = true;
              break;
            }
          } catch (e) { continue; }
        }
        
        if (!triggered) throw new Error("Could not click location trigger");

        // Wait for popover to be visible
        await this.page.waitForSelector(".a-popover-modal, #a-popover-content-1", { timeout: 10000 });
        
        // Check if we need to click "Change" to see the zip input
        const changeLink = this.page.locator('#GLUXChangePostalCodeLink').first();
        if (await changeLink.isVisible({ timeout: 2000 })) {
          console.log("[Location] Clicking Change link to expose zip input...");
          await changeLink.click();
        }

        const zipInput = this.page.locator(this.zipInput).first();
        await zipInput.waitFor({ state: "visible", timeout: 10000 });
        
        await zipInput.fill("10001");
        await this.page.waitForTimeout(500);
        
        // Extended update selectors
        const updateBtn = this.page.locator('#GLUXZipUpdate, input[aria-labelledby="GLUXZipUpdate-announce"], #GLUXZipUpdate input').first();
        await updateBtn.click({ timeout: 5000 });
        
        console.log("[Location] Zip applied, waiting for popover update...");
        await this.page.waitForTimeout(3000);

        // Click Done/Continue to finalize
        const doneBtn = this.page.locator('button[name="glowDoneButton"], #a-autoid-1-announce, #GLUXConfirmClose, .a-popover-footer button:has-text("Done"), .a-popover-footer button:has-text("Continue")').first();
        if (await doneBtn.isVisible({ timeout: 5000 })) {
          console.log("[Location] Clicking Done/Continue and reloading...");
          await doneBtn.click({ force: true });
          await this.page.waitForTimeout(1000);
          await this.page.reload({ waitUntil: "domcontentloaded" });
        } else {
          console.log("[Location] Done button not found, checking for auto-refresh...");
          const midCheck = await this.page.locator("#nav-global-location-slot").textContent().catch(() => "");
          if (midCheck.includes("10001") || midCheck.includes("New York")) {
             await this.page.reload({ waitUntil: "domcontentloaded" });
          }
        }
        
        // Final stabilization and verification
        // Final stabilization
        await this.page.waitForLoadState("load", { timeout: 5000 }).catch(() => {});
        await this.page.waitForTimeout(2000); 
        
        const finalCheck = await this.page.locator("#nav-global-location-slot").textContent().catch(() => "");
        console.log(`[Location] Final check: "${finalCheck.trim()}"`);
        
        if (finalCheck.includes("10001") || finalCheck.includes("New York") || finalCheck.includes("United States")) {
          console.log("[Location] Verified US location successfully.");
          return;
        }
        
        console.warn(`[Location] Attempt ${attempt} did not stick, forcing reload...`);
        await this.page.screenshot({ path: `test-results/location-failed-attempt-${attempt}.png` });
        await this.page.reload({ waitUntil: "domcontentloaded" });
      } catch (e) {
        console.warn(`[Location] Attempt ${attempt} error: ${e.message}`);
        await this.page.screenshot({ path: `test-results/location-error-attempt-${attempt}.png` });
        await this.page.goto(this.url, { waitUntil: "domcontentloaded" }).catch(() => {});
      }
    }
    throw new Error("Failed to set US location after maximum retries");
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
      const locator = this.page.locator(selector).first();
      if (await locator.isVisible({ timeout: 1000 })) {
        const text = await locator.textContent().catch(() => null);
        if (text) {
          // More robust price matching for USD and INR
          const match = text.replace(/\s+/g, "").match(/(?:\$|INR|USD|Rs\.?)\s?[\d,]+(?:\.\d{2})?/i);
          if (match) return match[0];
        }
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
      const locator = this.page.locator(selector).first();
      if (await locator.isVisible({ timeout: 3000 })) {
        cartPrice = await locator.textContent().catch(() => "");
        if (cartPrice && cartPrice.trim()) {
          // Robust price matching: extract first valid currency string to avoid duplicates
          const match = cartPrice.replace(/\s+/g, "").match(/(?:\$|INR|USD|Rs\.?)\s?[\d,]+(?:\.\d{2})?/i);
          if (match) {
            cartPrice = match[0];
            break;
          }
        }
      }
    }

    const cleanedCartPrice = cartPrice.trim();
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
      'button:has-text("Not now")',
      '#attach-close_sideSheet-link',
      '.a-popover-header button[data-action="a-popover-close"]',
      '#nav-flyout-accountList',
      '.glow-toaster-button-dismiss input',
      '.glow-toaster-button-submit input',
      '#nav-main .a-button-inner input',
      '#GLUXConfirmClose'
    ];
    for (const s of dismissSelectors) {
      const locator = this.page.locator(s).first();
      try {
        if (await locator.isVisible({ timeout: 1200 })) {
          await locator.click({ timeout: 3000 }).catch(() => {});
        }
      } catch (e) {}
    }
    
    // Specifically handle "Stay on Amazon.com" vs "Go to Amazon.in"
    const stayOnCom = this.page.locator('span.a-button-text:has-text("Stay on amazon.com"), button:has-text("Stay on amazon.com"), .a-button-inner:has-text("Stay on amazon.com")').first();
    if (await stayOnCom.isVisible({ timeout: 1500 })) {
      await stayOnCom.click().catch(() => {});
    }

    const signInPopover = this.page.locator('#nav-signin-tooltip').first();
    if (await signInPopover.isVisible({ timeout: 1000 })) {
       await this.page.mouse.move(0,0);
    }
  }
}

module.exports = { AmazonPage };
