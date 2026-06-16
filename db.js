/**
 * db.js
 * Promisified IndexedDB module for the Traffic Interval Analyzer.
 */

const DB_NAME = 'TrafficIntervalAnalyzerDB';
const DB_VERSION = 2;
const STORE_NAME = 'reports';
const LEDGER_STORE_NAME = 'billing_ledger';

/**
 * Initializes and returns a promise for the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Store 1: Reports
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      
      // Store 2: Billing Ledger
      if (!db.objectStoreNames.contains(LEDGER_STORE_NAME)) {
        const store = db.createObjectStore(LEDGER_STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject(new Error(`Failed to open IndexedDB: ${event.target.error.message}`));
    };
  });
}

/**
 * Saves a report run to the database.
 * @param {Object} report The report data.
 * @returns {Promise<string>} The ID of the saved report.
 */
export async function saveReport(report) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(report);

    request.onsuccess = () => {
      resolve(report.id);
    };

    request.onerror = () => {
      reject(new Error(`Failed to save report: ${request.error.message}`));
    };
  });
}

/**
 * Retrieves a specific report run by ID.
 * @param {string} id Unique report ID.
 * @returns {Promise<Object|null>} The report object or null if not found.
 */
export async function getReport(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => {
      reject(new Error(`Failed to load report with ID ${id}: ${request.error.message}`));
    };
  });
}

/**
 * Deletes a report run from the database.
 * @param {string} id Unique report ID.
 * @returns {Promise<void>}
 */
export async function deleteReport(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error(`Failed to delete report with ID ${id}: ${request.error.message}`));
    };
  });
}

/**
 * Retrieves all saved reports sorted by creation date descending.
 * @returns {Promise<Array<Object>>} List of saved reports.
 */
export async function getAllReports() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('createdAt');
    const request = index.openCursor(null, 'prev'); // 'prev' sorts descending by key (createdAt)

    const results = [];
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };

    request.onerror = () => {
      reject(new Error(`Failed to list reports: ${request.error.message}`));
    };
  });
}

/**
 * Adds a new entry to the billing ledger.
 * @param {string} type 'map_load' | 'autocomplete_session' | 'directions_query'
 * @param {number} cost Estimated cost in USD.
 * @returns {Promise<Object>} The added entry.
 */
export async function addLedgerEntry(type, cost) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(LEDGER_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(LEDGER_STORE_NAME);
    const entry = {
      id: Date.now() + Math.random(),
      type: type,
      cost: cost,
      createdAt: new Date().toISOString()
    };
    const request = store.add(entry);

    request.onsuccess = () => {
      resolve(entry);
    };

    request.onerror = () => {
      reject(new Error(`Failed to add ledger entry: ${request.error.message}`));
    };
  });
}

/**
 * Retrieves all ledger entries for the current calendar month.
 * @returns {Promise<Array<Object>>} Filtered entries.
 */
export async function getMonthLedgerEntries() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(LEDGER_STORE_NAME, 'readonly');
    const store = transaction.objectStore(LEDGER_STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      
      const filtered = (request.result || []).filter(entry => {
        const date = new Date(entry.createdAt);
        return date.getFullYear() === currentYear && date.getMonth() === currentMonth;
      });
      resolve(filtered);
    };

    request.onerror = () => {
      reject(new Error(`Failed to retrieve ledger entries: ${request.error.message}`));
    };
  });
}

/**
 * Clears all entries in the billing ledger.
 * @returns {Promise<void>}
 */
export async function clearLedger() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(LEDGER_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(LEDGER_STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error(`Failed to clear ledger: ${request.error.message}`));
    };
  });
}
