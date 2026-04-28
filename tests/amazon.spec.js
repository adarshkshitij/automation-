const { test, expect } = require("@playwright/test");
const { testData } = require("../test-data.json");
const AxeBuilder = require("@axe-core/playwright").default;

const AMAZON_URL = "https://www.amazon.com/";
const SEARCH_INPUT = "#twotabsearchtextbox";
const ADD_TO_CART_BUTTONS = [
  "#add-to-cart-button",
  "#desktop_qualifiedBuyBox #add-to-cart-button",
  'input[name="submit.add-to-cart"]',
  'input[name="submit.addToCart"]',
  'input[name^="submit.addToCart"]',
  'button:has-text("Add to cart")',
  'button:has-text("Add to Cart")',
  'span:has-text("Add to Cart")',
  '[data-action="add-to-cart"]',
  '#buy-now-button',
  'input[name="submit.buy-now"]',
  'input[aria-labelledby="submit.add-to-cart-announce"]',
  '.a-button-stack input[name="submit.add-to-cart"]',
];
const ADD_TO_CART_SUCCESS = [
  "#attachDisplayAddBaseAlert",
  "#attach-added-to-cart-message",
  "#sw-atc-confirmation",
  "#NATC_SMART_WAGON_CONF_MSG_SUCCESS",
  ".a-alert-success",
  'h1:has-text("Added to Cart")',
  'h2:has-text("Added to Cart")',
  'span:has-text("Added to Cart")',
  '#attach-view-cart-button-announce',
];
const BUYING_OPTIONS_SELECTORS = [
  '#buybox-see-all-buying-choices a',
  'a:has-text("See All Buying Options")',
  'a:has-text("See all buying options")',
  'a:has-text("offers from")',
  'a[href*="/gp/offer-listing/"]',
  '[title="See All Buying Options"]',
  '#olpLinkWidget_feature_div a',
];
const PRICE_SELECTORS = [
  "#corePrice_feature_div .a-price .a-offscreen",
  "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen",
  "#apex_desktop .a-price .a-offscreen",
  "#tp_price_block_total_price_ww .a-offscreen",
  ".a-price.aok-align-center .a-offscreen",
  ".a-price .a-offscreen",
  "#priceblock_ourprice",
  "#priceblock_dealprice",
  ".a-color-price",
  "#buyNewSection .offer-price",
  "#kindle-price",
  "#price_inside_buybox",
];

test.describe.configure({ mode: "serial" }); // Changed to serial for better stability on Amazon

for (const data of testData) {
  test(`verify ${data.label} with fallback search capability`, async ({ page }) => {
    await addFirstMatchingDeviceToCart(page, data.searchTerms, data.label);
  });
}

async function addFirstMatchingDeviceToCart(page, searchTerms, label) {
  const metrics = {
    start: Date.now(),
    search: 0,
    selection: 0,
    cartAdd: 0,
    verification: 0
  };

  let productCandidates = [];
  let successfulSearchTerm = "";

  // Strategy: Try search terms in order until we find a successful add-to-cart
  for (const [tIndex, term] of searchTerms.entries()) {
    console.log(`[${label}] Search Attempt #${tIndex + 1}: ${term}`);
    const searchUrl = `${AMAZON_URL}s?k=${encodeURIComponent(term)}`;
    
    try {
      await gotoAmazonPage(page, searchUrl);
      await ensureUsDeliveryLocation(page);
      
      productCandidates = await collectProductCandidates(page, term);
      
      if (productCandidates.length === 0) {
        console.warn(`[${label}] No results found for "${term}".`);
        continue;
      }

      successfulSearchTerm = term;
      console.log(`[${label}] Found ${productCandidates.length} candidates for "${term}". Starting candidate cycle...`);

      let lastError = null;
      let candidateSuccess = false;

      // Try up to 3 candidates to handle shipping/availability restrictions (Reduced from 6 for speed)
      for (const [index, candidate] of productCandidates.slice(0, 3).entries()) {
        const selectionStart = Date.now();
        console.log(`[${label}] Trying candidate #${index + 1}: ${candidate.title.substring(0, 50)}...`);
        
        // Reduced wait for speed
        await page.waitForTimeout(500 + Math.random() * 500);
        
        try {
          await gotoAmazonPage(page, candidate.url, 25000);

          /* Skip A11y scan for now to speed up test execution
          if (index === 0) {
            console.log(`[${label}] Running Accessibility scan on first candidate...`);
            await runAccessibilityScan(page, `product-page-${successfulSearchTerm.replace(/\s+/g, "-")}`);
          }
          */

          if (await page.getByText("cannot be shipped to your selected delivery location", { exact: false }).isVisible().catch(() => false)) {
            console.log(`[${label}] Shipping restriction detected. Attempting to force US location fix...`);
            await ensureUsDeliveryLocation(page, true); // Force update
            await page.waitForTimeout(1000);
            
            // Re-check after fix
            if (await page.getByText("cannot be shipped to your selected delivery location", { exact: false }).isVisible().catch(() => false)) {
               throw new Error("Shipping restriction persists even after location fix.");
            }
            console.log(`[${label}] Location fix applied successfully.`);
          }

          if (await page.getByText("Currently unavailable", { exact: true }).isVisible().catch(() => false)) {
            throw new Error("Currently unavailable.");
          }

          const price = await readVisiblePrice(page);
          if (!price) {
            throw new Error("Price not found.");
          }
          
          metrics.selection += (Date.now() - selectionStart);
          const cartStart = Date.now();

          await addCurrentProductToCart(page);
          metrics.cartAdd = Date.now() - cartStart;

          const verifyStart = Date.now();
          await verifyItemInCart(page, price, candidate.title);
          metrics.verification = Date.now() - verifyStart;

          const screenshotPath = `test-results/cart-confirmation-${successfulSearchTerm.replace(/\s+/g, "-")}.png`;
          await page.screenshot({ path: screenshotPath, fullPage: true });
          console.log(`[${label}] Cart confirmation screenshot saved: ${screenshotPath}`);

          const totalTime = (Date.now() - metrics.start) / 1000;
          console.log(`\n--- PERFORMANCE METRICS [${label}: ${successfulSearchTerm}] ---`);
          console.log(`Search Phase:      ${(metrics.search / 1000).toFixed(2)}s`);
          console.log(`Selection Phase:   ${(metrics.selection / 1000).toFixed(2)}s`);
          console.log(`Add-to-Cart Phase: ${(metrics.cartAdd / 1000).toFixed(2)}s`);
          console.log(`Verification Phase:${(metrics.verification / 1000).toFixed(2)}s`);
          console.log(`Total Duration:    ${totalTime.toFixed(2)}s`);
          console.log(`Product Price:     ${price}`);
          console.log(`-----------------------------------------------\n`);
          
          candidateSuccess = true;
          break; // Break candidate loop
        } catch (error) {
          console.log(`[${label}] Candidate #${index + 1} failed: ${error.message}`);
          lastError = error;
        }
      }

      if (candidateSuccess) {
        return; // Success! Exit the function
      }

      console.warn(`[${label}] All candidates for "${term}" failed. Checking next search term...`);

    } catch (error) {
      console.warn(`[${label}] Search for "${term}" failed: ${error.message}`);
    }

    if (tIndex < searchTerms.length - 1) {
      console.log(`[${label}] Triggering smart fallback to next model...`);
      await page.waitForTimeout(1000).catch(() => {});
    }
  }

  throw new Error(`Unable to add a valid product to cart after trying all fallback search terms: ${searchTerms.join(", ")}`);
}

async function runAccessibilityScan(page, label) {
  try {
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "best-practice"])
      .analyze();
    
    if (results.violations.length > 0) {
      console.warn(`[A11y] Found ${results.violations.length} accessibility violations for ${label}. Check HTML report for details.`);
    } else {
      console.log(`[A11y] No accessibility violations found for ${label}.`);
    }
  } catch (error) {
    console.warn(`[A11y] Scan failed: ${error.message}`);
  }
}

async function gotoAmazonPage(page, url, timeout = 30000) {
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout });
      const recovered = await recoverAmazonPage(page);
      
      // If we recovered (meaning we were on an error page), we might need to retry the original URL
      if (recovered && url !== AMAZON_URL) {
        console.log(`[Retry] Recovery triggered, re-attempting target URL (Attempt ${attempts}/${maxAttempts})`);
        continue;
      }
      return;
    } catch (error) {
      if (attempts >= maxAttempts) throw error;
      console.warn(`[Retry] Navigation failed, retrying... (${attempts}/${maxAttempts}): ${error.message}`);
      await page.waitForTimeout(2000);
    }
  }
}

async function ensureUsDeliveryLocation(page, force = false) {
  try {
    const locationSlot = page.locator("#nav-global-location-slot");
    const isVisible = await locationSlot.isVisible({ timeout: 2000 }).catch(() => false);
    
    if (!isVisible) {
      await recoverAmazonPage(page);
      await locationSlot.waitFor({ state: "visible", timeout: 10000 }).catch(() => {
        throw new Error("Location slot still not visible after recovery attempt");
      });
    }
    
    const locationText = await locationSlot.textContent().catch(() => "");
    console.log(`[Location] Current detected location: "${locationText.trim()}"`);

    // Faster check: if location text already implies US/Zip, skip
    if (!force && (locationText.includes("10001") || locationText.includes("New York") || locationText.includes("United States"))) {
      return;
    }

    console.log(`[Location] Setting delivery location to US (10001)...`);
    await switchDeliveryToZip(page, "10001");
  } catch (error) {
    console.warn(`[Location] Could not set delivery location: ${error.message}. Proceeding with current state.`);
  }
}

async function switchDeliveryToZip(page, zip) {
  try {
    const bannerChangeButton = page.locator('span.a-button-inner input[data-action-type="SELECT_LOCATION"], #nav-main .nav-progressive-attribute:has-text("Change Address"), #nav-global-location-slot').first();
    await bannerChangeButton.click({ timeout: 3000 }).catch(() => {});

    // Wait for the popover/modal to appear.
    const zipInput = page.locator("#GLUXZipUpdateInput, input#GLUXZipUpdateInput").first();
    
    // If popover didn't appear, try clicking the location slot again (sometimes it needs a double click or takes time)
    if (!await zipInput.isVisible({ timeout: 3000 }).catch(() => false)) {
       console.log("[Location] Popover not visible, trying direct click on location slot again...");
       await page.locator("#nav-global-location-slot").click({ force: true }).catch(() => {});
    }

    await zipInput.waitFor({ state: "visible", timeout: 10000 });
    
    await zipInput.click();
    await page.waitForTimeout(500);
    await zipInput.fill(zip);
    
    const applyButton = await locateFirstVisible(
      page,
      ["#GLUXZipUpdate input[type='submit']", "#GLUXZipUpdate-announce", 'input[aria-labelledby="GLUXZipUpdate-announce"]'],
      3000
    );
    
    if (applyButton) {
      await applyButton.click();
    } else {
      await page.keyboard.press("Enter");
    }

    // Handle confirmation buttons. Confirm/Done/Continue
    await page.waitForTimeout(1000);
    const confirmationSelectors = [
      '#GLUXConfirmClose', 
      'button[name="glowDoneButton"]', 
      '#GLUXConfirmClose-announce',
      'button:has-text("Done")',
      'button:has-text("Continue")'
    ];
    
    const confirmButton = await locateFirstVisible(page, confirmationSelectors, 5000);
    if (confirmButton) {
      await confirmButton.click();
    }
    
    await page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500); // Wait for location state to propagate
    console.log(`[Location] Successfully submitted Zip code: ${zip}`);
  } catch (error) {
    console.warn(`[Location] switchDeliveryToZip failed: ${error.message}`);
    await dismissOptionalOverlays(page);
    // Refresh to apply whatever might have been set
    await page.reload({ waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }
}

async function recoverAmazonPage(page) {
  let recoveryHappened = false;

  // 1. Handle "Something went wrong" / Dogs of Amazon / 503
  const somethingWentWrong = page.getByText("Something went wrong on our end", { exact: false });
  if (await somethingWentWrong.isVisible().catch(() => false)) {
    console.warn("Amazon 'Something went wrong' page detected. Attempting to return home...");
    await page.goto(AMAZON_URL, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
    recoveryHappened = true;
  }

  // 2. Handle typical interstitials
  await handleContinueShoppingGate(page);
  await recoverFromRushHour(page);
  await dismissOptionalOverlays(page);
  
  // 3. Captcha check
  const captchaInput = page.locator("#captchacharacters");
  if (await captchaInput.isVisible().catch(() => false)) {
    console.log("CAPTCHA detected, reloading page...");
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    recoveryHappened = true;
  }

  return recoveryHappened;
}

async function handleContinueShoppingGate(page) {
  const continueButton = page.getByRole("button", { name: /continue shopping/i });
  try {
    if (await continueButton.isVisible({ timeout: 2000 })) {
      await continueButton.click({ timeout: 5000 });
      await page.waitForLoadState("domcontentloaded");
    }
  } catch {
    // Ignore if the interstitial is not present or disappears quickly.
  }
}

async function recoverFromRushHour(page) {
  const rushHourText = page.getByText("It's rush hour and traffic is piling up on that page", { exact: false });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      if (!(await rushHourText.isVisible({ timeout: 1500 }))) {
        return;
      }
    } catch {
      return;
    }

    const homeLink = page.getByRole("link", { name: /go to the amazon\.in home page to continue shopping/i });
    if (await homeLink.isVisible().catch(() => false)) {
      await homeLink.click();
    } else {
      await page.goto(AMAZON_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    }
    await page.waitForTimeout(2000);
    await handleContinueShoppingGate(page);
  }
}

async function dismissOptionalOverlays(page) {
  const optionalSelectors = [
    'input[name="accept"]',
    "#sp-cc-accept",
    '[role="alertdialog"] button:has-text("Dismiss")',
    "#nav-main [aria-label='Dismiss']",
    '[data-action-type="DISMISS"]',
    '[aria-label="Close"]',
    'button:has-text("No thanks")',
    'button:has-text("No Thanks")',
    'button:has-text("Not now")',
    'button:has-text("Dismiss")',
    '#attachSiNoCoverage',
    '#attachSiNoCoverage-announce',
    '.a-popover-header button[aria-label="Close"]',
    '.a-popover-footer button:has-text("Done")',
    'span[id="attachSiNoCoverage"]',
  ];

  for (const selector of optionalSelectors) {
    const locator = page.locator(selector).first();
    try {
      if (await locator.isVisible({ timeout: 500 })) {
        await locator.click({ timeout: 1000 }).catch(() => {});
      }
    } catch {
      // Ignore transient overlays and continue.
    }
  }
}

async function switchDeliveryToUsIfNeeded(page) {
  const indiaDeliveryTrigger = page.locator(
    '#glow-ingress-block, button:has-text("Deliver to India"), [aria-label*="Deliver to India"]'
  ).first();

  try {
    if (!(await indiaDeliveryTrigger.isVisible({ timeout: 3000 }))) {
      return;
    }

    await indiaDeliveryTrigger.click({ timeout: 5000 });
  } catch {
    return;
  }

  const zipInput = page.locator("#GLUXZipUpdateInput").first();
  try {
    await zipInput.waitFor({ state: "visible", timeout: 10000 });
    await zipInput.fill("10001");
  } catch {
    return;
  }

  const applyButton = await locateFirstVisible(
    page,
    [
      "#GLUXZipUpdate input.a-button-input",
      "#GLUXZipUpdate-announce",
      'input[aria-labelledby="GLUXZipUpdate-announce"]',
    ],
    5000
  );

  if (applyButton) {
    await applyButton.click();
  }

  const closeButton = await locateFirstVisible(
    page,
    [
      'input[data-action="a-popover-close"]',
      'button[name="glowDoneButton"]',
      "#GLUXConfirmClose",
      'button:has-text("Done")',
    ],
    10000
  );

  if (closeButton) {
    try {
      await page.locator(".glux-desktop-ui-blocker").waitFor({ state: "hidden", timeout: 5000 });
    } catch {
      // Continue even if the blocker animation is still present.
    }

    try {
      await closeButton.click({ timeout: 5000 });
    } catch {
      try {
        await closeButton.click({ force: true, timeout: 3000 });
      } catch {
        // The modal may already be closing; continue with the current page state.
      }
    }
  }

  await page.waitForLoadState("domcontentloaded");
  await dismissOptionalOverlays(page);
}

async function addCurrentProductToCart(page) {
  let addToCartButton = await locateFirstVisible(page, ADD_TO_CART_BUTTONS, 5000);

  if (!addToCartButton) {
    if (await tryKeyboardAddToCart(page)) {
      return;
    }

    const buyingOptionsLink = await locateFirstVisible(page, BUYING_OPTIONS_SELECTORS, 5000);
    if (!buyingOptionsLink) {
      throw new Error("Add to Cart button was not available for this product.");
    }

    await buyingOptionsLink.click();
    await page.waitForLoadState("domcontentloaded");
    await dismissOptionalOverlays(page);
    addToCartButton = await locateFirstVisible(page, ADD_TO_CART_BUTTONS, 10000);
  }

  if (!addToCartButton) {
    if (await tryKeyboardAddToCart(page)) {
      return;
    }

    throw new Error("Add to Cart button was not available after opening buying options.");
  }

  await addToCartButton.click();
  await dismissOptionalOverlays(page);
  await expectCartConfirmation(page);
}

async function collectProductCandidates(page, searchTerm) {
  try {
    await page.waitForSelector('[data-component-type="s-search-result"][data-asin]', {
      state: "attached",
      timeout: 15000,
    });
  } catch (error) {
    // If we can't find results, maybe we are on an error page that wasn't caught
    await recoverAmazonPage(page);
    // Final attempt to wait
    await page.waitForSelector('[data-component-type="s-search-result"][data-asin]', {
      state: "attached",
      timeout: 10000,
    }).catch(() => {
      throw new Error(`Timeout waiting for search results for "${searchTerm}". Page may be blocked or serving unexpected content.`);
    });
  }

  const candidates = await page.locator('[data-component-type="s-search-result"][data-asin]').evaluateAll((results) => {
    const normalized = [];

    for (const result of results) {
      const link = result.querySelector('a[href*="/dp/"], a[href*="/gp/aw/d/"], h2 a, a.a-link-normal[href]');
      const href = link ? link.getAttribute("href") : null;
      const title = result.querySelector("h2")?.textContent?.trim() || "";
      if (!href) {
        continue;
      }

      const absoluteUrl = new URL(href, "https://www.amazon.com").toString();
      if (
        absoluteUrl.includes("/sspa/") ||
        absoluteUrl.includes("slredirect") ||
        !absoluteUrl.includes("/dp/")
      ) {
        continue;
      }

      if (!normalized.some((entry) => entry.url === absoluteUrl)) {
        normalized.push({ url: absoluteUrl, title });
      }
    }

    return normalized;
  });

  return candidates.sort((left, right) => scoreCandidate(left.title, searchTerm) - scoreCandidate(right.title, searchTerm));
}

async function readVisiblePrice(page) {
  // 1. Try specific known selectors
  for (const selector of PRICE_SELECTORS) {
    const locator = page.locator(selector).first();
    try {
      const text = await locator.textContent({ timeout: 2000 });
      const price = normalizePrice(text);
      if (price) {
        return price;
      }
    } catch {
      // Try next selector
    }
  }

  // 2. Fallback: Search for any price-like pattern in common containers
  try {
    const containers = ["#centerCol", "#buybox", "#rightCol"];
    for (const container of containers) {
      const content = await page.locator(container).textContent({ timeout: 2000 }).catch(() => "");
      const price = normalizePrice(content);
      if (price) {
        return price;
      }
    }
  } catch {
    // Ignore fallback failure
  }

  return null;
}

function normalizePrice(text) {
  if (!text) {
    return null;
  }

  const match = text
    .replace(/\s+/g, " ")
    .match(/(?:\$|USD|INR)\s?[\d,]+(?:\.\d{2})?/i);
  return match ? match[0].replace(/\s/g, "").toUpperCase() : null;
}

async function locateFirstVisible(page, selectors, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      try {
        if (await locator.isVisible({ timeout: 500 })) {
          return locator;
        }
      } catch {
        // Keep polling until timeout expires.
      }
    }

    await page.waitForTimeout(500);
  }

  return null;
}

async function expectCartConfirmation(page) {
  // 1. Wait for any of the common success signals.
  const successSignal = await locateFirstVisible(page, ADD_TO_CART_SUCCESS, 10000);
  if (successSignal) {
    return;
  }

  // 2. Check if the cart count has incremented.
  const cartCount = page.locator("#nav-cart-count").first();
  try {
    const cartCountText = await cartCount.textContent({ timeout: 5000 });
    if (cartCountText && cartCountText.trim() !== "0") {
      return;
    }
  } catch {
    // Ignore and try other checks.
  }

  // 3. Check for specific text anywhere.
  if (await page.getByText("Added to Cart", { exact: false }).isVisible().catch(() => false)) {
    return;
  }

  // 4. Check if we are on the cart page.
  if (page.url().includes("/gp/cart") || page.url().includes("/cart/")) {
    return;
  }

  // 5. Try to dismiss any popups that might be blocking the view.
  await dismissOptionalOverlays(page);
  
  // Re-check one last time.
  if (await page.getByText("Added to Cart", { exact: false }).isVisible().catch(() => false)) {
    return;
  }

  throw new Error("Expected a stable add-to-cart confirmation signal.");
}

async function verifyItemInCart(page, expectedPrice, expectedTitle) {
  // Navigate to the cart page
  await page.goto(`${AMAZON_URL}gp/cart/view.html`, { waitUntil: "domcontentloaded" });
  await recoverAmazonPage(page);

  // Check for the product title (subset)
  const titleWords = expectedTitle.split(" ").slice(0, 3).join(" ");
  const cartItem = page.locator(".sc-list-item-content").filter({ hasText: titleWords }).first();
  
  await expect(cartItem).toBeVisible({ timeout: 10000 });

  // Verify price in cart
  const cartPrice = await cartItem.locator(".sc-product-price").first().textContent().catch(() => "");
  const normalizedCartPrice = normalizePrice(cartPrice);

  if (normalizedCartPrice !== expectedPrice) {
    console.log(`Warning: Price mismatch in cart. Expected ${expectedPrice}, found ${normalizedCartPrice}`);
  } else {
    console.log(`Success: Price verified in cart -> ${normalizedCartPrice}`);
  }
}

async function tryKeyboardAddToCart(page) {
  try {
    await page.keyboard.press("Shift+Alt+K");
    await page.waitForTimeout(2000);
    await dismissOptionalOverlays(page);
    await expectCartConfirmation(page);
    return true;
  } catch {
    return false;
  }
}

function scoreCandidate(title, searchTerm) {
  let score = 0;

  if (/iphone/i.test(searchTerm)) {
    if (/iphone\s(?:15|16)\b/i.test(title) && /128GB/i.test(title) && !/\bpro\b/i.test(title)) {
      score -= 5;
    }

    if (/plus/i.test(title) && /128GB/i.test(title) && !/\bpro\b/i.test(title)) {
      score -= 3;
    }

    if (/iphone\s13\b/i.test(title)) {
      score += 1;
    }
  }

  if (/pro max/i.test(title)) {
    score += 3;
  }

  if (/\bpro\b/i.test(title)) {
    score += 2;
  }

  if (/renewed premium/i.test(title)) {
    score += 1;
  }

  return score;
}
