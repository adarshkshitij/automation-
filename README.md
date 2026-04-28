# Amazon Automation - Enterprise Grade Suite

This project is a high-performance, resilient automation suite built with Playwright. It was designed to demonstrate best practices in Quality Engineering, specifically for the Customer Engineering role at TestMu AI.

- **Page Object Model (POM)**: Scalable architecture separating selectors and actions into dedicated page classes.
- **Data-Driven Testing**: Dynamically generates test cases from `test-data.json`.
- **Parallel Execution**: Configured for 4 concurrent workers, significantly reducing total test time.
- **Robustness & Self-Healing**: 
    - Intelligent location management (forces US ZIP `10001` for consistent inventory).
    - Multi-candidate retry logic: Automatically skips items with shipping restrictions or out-of-stock status.
- **CI/CD Integrated**: Automated GitHub Actions pipeline that runs tests on every push and records results.
- **Full Observability**: Captures Screenshots, Traces, and Videos for every test run to facilitate seamless debugging and review.
- **Accessibility Compliance**: Integrated `@axe-core/playwright` for automated WCAG auditing.

- `pages/AmazonPage.js`: Page Object defining all selectors and core interactions.
- `tests/amazon.spec.js`: Clean, descriptive test specifications.
- `playwright.config.js`: Advanced reporting and parallel execution configuration.
- `.github/workflows/`: CI/CD pipeline definition for automated execution.
- `playwright-report/`: Detailed HTML reports with traces and screenshots.

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
