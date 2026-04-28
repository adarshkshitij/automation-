# Amazon Automation - Enterprise Grade Suite

This project is a high-performance, resilient automation suite built with Playwright. It was designed to demonstrate best practices in Quality Engineering, specifically for the Customer Engineering role at TestMu AI.

## 🚀 Key Features

- **Data-Driven Testing**: Dynamically generates test cases from `test-data.json`.
- **Parallel Execution**: Optimized to run multiple scenarios concurrently, significantly reducing total test time.
- **Robustness & Self-Healing**: 
    - Intelligent location management (forces US ZIP `10001` for consistent inventory).
    - Multi-candidate retry logic: Automatically skips items with shipping restrictions or out-of-stock status.
    - Interstitial recovery: Handles "Rush Hour" and "Continue Shopping" popups.
- **Accessibility (A11y)**: Integrated `@axe-core/playwright` to perform automated WCAG 2.1 compliance audits on product pages.
- **Performance Observability**: Custom metrics engine tracks the duration of each phase (Search, Selection, Cart-Add, Verification).
- **CI/CD Ready**: Pre-configured GitHub Actions workflow for automated pipeline integration.
- **Visual Evidence**: Automatic screenshot capture of the final cart state for manual verification.

## 📁 Project Structure

- `tests/amazon.spec.js`: Core test logic with advanced helper functions for resilience.
- `playwright.config.js`: Advanced configuration including HTML reporting, retries, and browser emulation.
- `.github/workflows/`: CI/CD pipeline definition.
- `test-results/`: Local directory for screenshots, traces, and accessibility reports.

## 🛠️ Setup & Execution

### Prerequisites
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
