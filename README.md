# Traffic Interval Analyzer

A private, serverless, single-page dashboard to analyze route commute travel times (with traffic conditions) over a specific future date and time window. The application queries the Google Maps API at set intervals (e.g., every 15, 30, or 60 minutes), visualizes the results on an interactive map and a line chart, and stores all history locally.

---

## 🌟 Key Features

* **Commute Bottleneck Analysis**: Select starting and ending addresses, a future date, and morning/evening hours to view estimated travel durations at custom intervals.
* **Sleek Responsive UI**: Modern "Glassmorphism" slate-dark dashboard featuring dynamic layouts, animations, and custom scrollbars.
* **Interactive Charting**: Line graph mapping Time of Day vs. Travel Time with:
  * A dashed grey baseline showing standard travel duration (no traffic).
  * Color-coded point nodes representing traffic delay severity (Green: Smooth, Orange: Moderate, Red: Heavy delay).
  * Hover tooltips displaying exact travel time, departure time, and estimated arrival time (with color-coded labels matching the delay status).
* **Interactive Route Map**: Displays start and destination markers and renders driving route polylines.
* **Browser-Only Security & Memory Vault**:
  * Private key storage via local `localStorage`.
  * Saved reports database using `IndexedDB`. Past runs can be reloaded instantly from history and drawn on the map **without triggering new Google API queries**, protecting your budget.
* **Google Cloud Billing Tracker**: Logs estimated API charges (Map loads, Autocomplete selections, and Directions queries) inside a local ledger to raise cost awareness and locks automated check runs if your monthly spend crosses a configured safety budget threshold.

---

## 🛠️ Technology Stack

1. **Core**: HTML5, Vanilla Javascript (ES6 Modules)
2. **Styling**: Vanilla CSS (Modern Grid, custom Scrollbars, dark variables)
3. **Map API**: Google Maps JavaScript API (with `places` and `directions` libraries)
4. **Graphing**: Chart.js (v4+) loaded via CDN
5. **Database**: IndexedDB (Promisified CRUD)
6. **E2E Testing**: Playwright Test Runner

---

## 🚀 Getting Started

### 1. Prerequisites
Ensure you have [Node.js](https://nodejs.org/) installed (v18+ recommended) to run tests and launch local development servers.

### 2. Installation
Clone the repository and install dev dependencies:
```bash
git clone <repository-url>
cd best-travel
npm install
```

### 3. Running Locally
Start a local static server inside the project directory:
```bash
npx http-server -p 3000
```
Then, open **[http://127.0.0.1:3000](http://127.0.0.1:3000)** in your web browser.

### 4. Setup Google Maps API Credentials
Click **Google Key** in the header to enter your API credentials. Ensure your key has the following libraries enabled in your Google Cloud Console:
* **Maps JavaScript API**
* **Places API**
* **Directions API**

---

## 🧪 Running E2E Tests

The repository comes equipped with automated end-to-end tests verifying dashboard elements, modal overlays, drawer selectors, and budget exceedance locks.

Run tests in headless mode:
```cmd
npm test
```
*(Use `npm.cmd test` if you receive a script restriction error in Windows PowerShell)*

Run tests in headed mode (visible browser window):
```bash
npm test -- --headed
```

Run tests using the Playwright Interactive UI dashboard:
```bash
npx playwright test --ui
```
