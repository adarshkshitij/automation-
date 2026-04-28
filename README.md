# 🚀 Amazon Automation Suite - Enterprise Grade

Professional automation suite developed for the **TestMu AI (LambdaTest) Customer Engineering Internship** assignment. This project demonstrates high-fidelity automation practices, emphasizing resilience, accessibility, and observability.

## 🏗️ Technical Architecture

This suite is built using **Playwright (JavaScript)** and follows the **Page Object Model (POM)** pattern to ensure scalability and maintainability.

### Key Engineering Features:
*   **Parallel Execution**: Configured for 4 concurrent workers to maximize throughput without session collision.
*   **Multi-Candidate Search Strategy**: Implements an intelligent search algorithm that tries multiple terms and evaluates several product candidates per term to bypass Amazon's regional inventory restrictions.
*   **Deep Cart Verification**: Unlike basic scripts, this suite navigates to the actual cart page to verify product persistence and price accuracy between the Product Detail Page (PDP) and the Cart.
*   **Automated Accessibility (A11y)**: Integrated `@axe-core/playwright` to perform non-blocking WCAG 2.1 compliance audits on every product page, saving violation reports for engineering review.
*   **Resilient recovery**: Handles location popups, cookie consents, and "Rush Hour" interstitials using a custom recovery handler in the POM.

## 🛠️ Setup & Execution

- Node.js 18+

### Installation
```bash
npm install
npx playwright install --with-deps chrome
```

### Run Tests
```bash
# Run all tests in parallel (headless)
npm test

# Generate and view the professional HTML report
npx playwright show-report
```

## 📊 Performance Tracking
Each test run outputs a detailed breakdown:
```text
--- PERFORMANCE METRICS [Case 1: iPhone] ---
Search Phase:      5.20s
Selection Phase:   8.45s
Add-to-Cart Phase: 3.10s
Verification Phase:2.15s
Total Duration:    18.90s
Product Price:     $799.00
-----------------------------------------------
```

## 🛡️ Accessibility Compliance
The suite automatically flags accessibility violations using the industry-standard `axe-core` engine, ensuring the shopping experience is inclusive for all users.

---
*Created for the TestMu AI Customer Engineering Internship Assignment.*
