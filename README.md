# Best Traffic: Find the best time to travel

Best Traffic helps you find the smartest time to leave for your commute. By showing you how traffic changes throughout the day, it helps you avoid gridlock, saving you both time and stress.

The application checks your route on Google Maps at regular intervals (such as every 15, 30, or 60 minutes) to find the best time to take the journey, showing you the routes on an interactive map.

---

## 🌟 Key Features

* **Find the Best Departure Time**: Enter your start and end locations, a future date, and your desired time of travel. The app compares different departure times so you can see when traffic will be lightest.
* **Easy-to-Read Graph**: The anticipated travel time will be displayed on a graph, highlighting:
  * **Standard Travel Time**: A baseline showing how long the drive takes without traffic (dashed line).
  * **Traffic Delay Indicators**: Color-coded points that show how severe the traffic is (Green for smooth driving, Orange for moderate delays, and Red for heavy gridlock).
  * **Interactive Details**: Hovering over any point on the graph shows your estimated departure time, how long you will spend driving, and your arrival time, using traffic-matched colors.
* **Local History & Secure Storage**: Saves your past searches and routes directly on your computer. You can reload and view past reports instantly without running new Google Maps searches, saving your usage credits. Your Google API key is stored securely in your own browser and is never sent to any external servers.
* **Google API Cost Tracker**: Keeps track of estimated Google Maps API charges and automatically stops running searches if you reach your set monthly safety budget, ensuring you don't run into unexpected costs.

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
