# 🚀 Amazon Automation Suite - Enterprise Grade

Professional automation suite developed for the **TestMu AI (LambdaTest) Customer Engineering Internship** assignment. This project demonstrates high-fidelity automation practices, emphasizing resilience, accessibility, and observability.

## 🏗️ Technical Architecture

This suite is built using **Playwright (JavaScript)** and follows the **Page Object Model (POM)** pattern to ensure scalability and maintainability.

### Key Engineering Features:
*   **Parallel Execution**: Configured for 4 concurrent workers to maximize throughput.
*   **Multi-Candidate Search Strategy**: Intelligent search algorithm that bypasses Amazon's regional inventory restrictions by evaluating multiple product candidates.
*   **Deep Cart Verification**: Navigates to the cart page to verify product persistence and price accuracy.
*   **Automated Accessibility (A11y)**: Integrated `@axe-core/playwright` to perform non-blocking WCAG 2.1 compliance audits.
*   **Resilient Recovery**: Handles location popups and cookie consents using a custom recovery handler.
*   **GitHub Actions CI/CD**: Automated testing on every push to ensure code quality.

## 📐 Design Decisions & Patterns

### 1. Page Object Model (POM)
Separation of concerns is maintained by keeping selectors and interaction logic in `pages/AmazonPage.js`, while test flow resides in `tests/amazon.spec.js`. This makes the suite modular and easy to update if the UI changes.

### 2. Smart Location Forcing
Amazon often shows different pricing/inventory based on IP location. The suite explicitly sets the location to **ZIP 10001 (New York)** to ensure consistent results across different execution environments (Local vs Cloud).

### 3. Non-Blocking Accessibility Audits
Accessibility is a core requirement for modern web apps. The suite runs an `axe-core` audit on the Product Detail Page and saves the results in `test-results/a11y-audit.json`, allowing engineers to fix violations without breaking the functional test flow.

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

# Run in headed mode (for debugging)
npm run test:headed

# Generate and view the professional HTML report
npx playwright show-report
```

## 📊 Performance Tracking
Each test run outputs a detailed performance breakdown to the console, helping identify slow steps in the shopping journey.

## 🛡️ Code Quality
- **ESLint**: Configured for JavaScript code quality and consistency.
- **Prettier**: (Optional) For automated code formatting.
- **CI/CD**: GitHub Actions workflow included in `.github/workflows/playwright.yml`.

---
*Created for the TestMu AI Customer Engineering Internship Assignment.*
