// tests/dashboard.spec.js
import { test, expect } from '@playwright/test';

test.describe('Traffic Interval Analyzer Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the local server
    await page.goto('/');
    
    // Close the settings modal if it automatically opens due to empty API Key
    const modalCloseBtn = page.locator('#btn-close-settings');
    if (await modalCloseBtn.isVisible()) {
      await modalCloseBtn.click();
    }
  });

  test('should load the dashboard with correct title and elements', async ({ page }) => {
    // Check main title
    const title = page.locator('.logo-section h1');
    await expect(title).toHaveText('Best Traffic: Find the best time to travel');

    // Check main control sections
    const setupHeader = page.locator('.control-panel h2');
    await expect(setupHeader).toHaveText('Report Setup');

    // Verify inputs exist
    await expect(page.locator('#start-address')).toBeVisible();
    await expect(page.locator('#end-address')).toBeVisible();
    await expect(page.locator('#date-select')).toBeVisible();
    await expect(page.locator('#start-time')).toBeVisible();
    await expect(page.locator('#end-time')).toBeVisible();
    await expect(page.locator('#interval-select')).toBeVisible();

    // Verify Action Button
    await expect(page.locator('#btn-generate')).toBeVisible();
  });

  test('should display key setup prompt overlay if no API key is set', async ({ page }) => {
    // Verify the map setup overlay warning is visible
    const overlay = page.locator('#map-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText('Google Maps requires an API Key');
  });

  test('should toggle the Google API Key Modal', async ({ page }) => {
    const modal = page.locator('#modal-settings');
    const openBtn = page.locator('#btn-open-settings');
    const closeBtn = page.locator('#btn-close-settings');

    // Modal should be initially hidden
    await expect(modal).not.toHaveClass(/active/);

    // Open Modal
    await openBtn.click();
    await expect(modal).toHaveClass(/active/);

    // Close Modal
    await closeBtn.click();
    await expect(modal).not.toHaveClass(/active/);
  });

  test('should toggle the Saved Reports history drawer', async ({ page }) => {
    const historyToggle = page.locator('#btn-toggle-history');
    const historyOverlay = page.locator('#history-overlay');
    const closeHistoryBtn = page.locator('#btn-close-history');

    // History drawer should start closed
    await expect(historyOverlay).not.toHaveClass(/active/);

    // Open drawer
    await historyToggle.click();
    await expect(historyOverlay).toHaveClass(/active/);

    // Close drawer
    await closeHistoryBtn.click();
    await expect(historyOverlay).not.toHaveClass(/active/);
  });

  test('should toggle the Billing Status Modal', async ({ page }) => {
    const billingPill = page.locator('#btn-open-billing');
    const billingModal = page.locator('#modal-billing');
    const closeBtn = page.locator('#btn-close-billing');

    // Billing Modal should be initially hidden
    await expect(billingModal).not.toHaveClass(/active/);

    // Click pill to open
    await billingPill.click();
    await expect(billingModal).toHaveClass(/active/);

    // Click close to hide
    await closeBtn.click();
    await expect(billingModal).not.toHaveClass(/active/);
  });

  test('should enforce the budget limit warning modal when spend exceeds limit', async ({ page }) => {
    // Capture console logs and errors from the page
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

    // Set budget limit to 0.00 in localStorage to force exceedance on page load
    await page.evaluate(() => {
      localStorage.setItem('billing_budget_limit', '0.00');
    });

    // Reload the page to run the DOMContentLoaded checks
    await page.reload();

    const quotaWarningModal = page.locator('#modal-quota-warning');
    const generateBtn = page.locator('#btn-generate');
    const alertBanner = page.locator('#quota-lock-alert');

    // Verify quota warning modal opens automatically on load
    await expect(quotaWarningModal).toHaveClass(/active/);

    // Verify generate button is disabled and lock warning alert is visible
    await expect(generateBtn).toBeDisabled();
    await expect(alertBanner).toBeVisible();
  });

  test('should clear the form when clicking the New button', async ({ page }) => {
    const startInput = page.locator('#start-address');
    const endInput = page.locator('#end-address');
    const newBtn = page.locator('#btn-reset-ui');

    // Type dummy addresses
    await startInput.fill('Brooklyn, NY');
    await endInput.fill('Manhattan, NY');
    
    // Check they have value
    await expect(startInput).toHaveValue('Brooklyn, NY');
    await expect(endInput).toHaveValue('Manhattan, NY');

    // Click "New" button
    await newBtn.click();

    // Verify inputs are cleared
    await expect(startInput).toHaveValue('');
    await expect(endInput).toHaveValue('');
  });
});
