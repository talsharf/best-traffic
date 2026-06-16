/**
 * app.js
 * Main Controller for the Traffic Interval Analyzer.
 * Handles UI interactions, dynamic loading of Google Maps SDK, autocomplete,
 * the pacing query loop, Chart.js visualization, and IndexedDB saving/loading.
 */

import { saveReport, deleteReport, getAllReports, getReport, addLedgerEntry, getMonthLedgerEntries, clearLedger } from './db.js';

// App State
let apiKey = localStorage.getItem('google_maps_api_key') || '';
let map = null;
let directionsRenderer = null;
let activePolyline = null;
let startMarker = null;
let endMarker = null;
let chart = null;
let autocompleteStart = null;
let autocompleteEnd = null;

let isGenerating = false;
let activeRunResults = []; // Stores detailed details for hover tooltips: { departureStr, arrivalStr }

// Configuration
const PACING_DELAY_MS = 800; // Delay between sequential Google Maps requests
const GOOGLE_QUERY_COST = 0.005; // $0.005 per directions request

// Custom Dark Map Styling
const darkMapStyles = [
  { elementType: "geometry", stylers: [{ color: "#1f2937" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1f2937" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9ca3af" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#f9fafb" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#9ca3af" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#111827" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#6b7280" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#374151" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#111827" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca3af" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#4b5563" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1f2937" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#f3f4f6" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#090d16" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4b5563" }] }
];

// Helper: Promisified Timeout
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper: Format hours and minutes to 12-hour AM/PM string
function format12Hour(hours, minutes) {
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  const displayMinutes = String(minutes).padStart(2, '0');
  return `${displayHours}:${displayMinutes} ${ampm}`;
}

// Helper: Extract human-readable time from a Date object
function formatTime12h(date) {
  return format12Hour(date.getHours(), date.getMinutes());
}

// Helper: Extract date string (YYYY-MM-DD)
function formatDateString(date) {
  return date.toISOString().split('T')[0];
}

// Initialize Application on DOM Content Loaded
document.addEventListener('DOMContentLoaded', async () => {
  setupUIEventListeners();
  populateTimeDropdowns();
  setupDateLimits();
  calculateCostEstimate();
  initializeChart();
  
  // Load and enforce billing limits
  await updateBillingStatus();
  await checkBudgetExceedance();
  
  if (apiKey) {
    loadGoogleMapsSDK(apiKey);
  } else {
    showAPIKeyModal();
  }
});

// Populate dropdown select options with 15-minute intervals
function populateTimeDropdowns() {
  const startSelect = document.getElementById('start-time');
  const endSelect = document.getElementById('end-time');
  
  startSelect.innerHTML = '';
  endSelect.innerHTML = '';

  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const hh = String(h).padStart(2, '0');
      const mm = String(m).padStart(2, '0');
      const timeVal = `${hh}:${mm}`;
      const timeLabel = format12Hour(h, m);
      
      const startOpt = new Option(timeLabel, timeVal);
      const endOpt = new Option(timeLabel, timeVal);
      
      if (timeVal === '07:00') startOpt.selected = true;
      if (timeVal === '10:00') endOpt.selected = true;
      
      startSelect.add(startOpt);
      endSelect.add(endOpt);
    }
  }
}

// Restrict date input to future dates (minimum: tomorrow)
function setupDateLimits() {
  const dateSelect = document.getElementById('date-select');
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  dateSelect.min = formatDateString(tomorrow);
  dateSelect.value = formatDateString(tomorrow);
}

// Calculate and show estimated queries/costs dynamically
function calculateCostEstimate() {
  const startTimeVal = document.getElementById('start-time').value;
  const endTimeVal = document.getElementById('end-time').value;
  const intervalVal = parseInt(document.getElementById('interval-select').value, 10);
  
  if (!startTimeVal || !endTimeVal || isNaN(intervalVal)) return;

  const [startH, startM] = startTimeVal.split(':').map(Number);
  const [endH, endM] = endTimeVal.split(':').map(Number);
  
  const startTotalMinutes = startH * 60 + startM;
  let endTotalMinutes = endH * 60 + endM;
  
  // If end time is earlier or equal to start time, assume next day or alert
  if (endTotalMinutes <= startTotalMinutes) {
    document.getElementById('estimated-cost').textContent = "End time must be after start time";
    document.getElementById('estimated-cost').classList.add('text-danger');
    return;
  }
  document.getElementById('estimated-cost').classList.remove('text-danger');

  const diffMinutes = endTotalMinutes - startTotalMinutes;
  const queryCount = Math.floor(diffMinutes / intervalVal) + 1;
  const cost = queryCount * GOOGLE_QUERY_COST;
  
  document.getElementById('estimated-cost').textContent = `$${cost.toFixed(3)} (${queryCount} queries)`;
}

// UI Event Listeners
function setupUIEventListeners() {
  // Config updates cost
  document.getElementById('start-time').addEventListener('change', calculateCostEstimate);
  document.getElementById('end-time').addEventListener('change', calculateCostEstimate);
  document.getElementById('interval-select').addEventListener('change', calculateCostEstimate);

  // Settings modals
  document.getElementById('btn-open-settings').addEventListener('click', showAPIKeyModal);
  document.getElementById('btn-close-settings').addEventListener('click', hideAPIKeyModal);
  document.getElementById('btn-cancel-settings').addEventListener('click', hideAPIKeyModal);
  document.getElementById('btn-setup-key-prompt').addEventListener('click', showAPIKeyModal);
  document.getElementById('btn-save-settings').addEventListener('click', saveAPIKey);
  
  // History Drawer
  document.getElementById('btn-toggle-history').addEventListener('click', openHistoryDrawer);
  document.getElementById('btn-close-history').addEventListener('click', closeHistoryDrawer);
  document.getElementById('history-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'history-overlay') closeHistoryDrawer();
  });

  // Action Cancel Loop
  document.getElementById('btn-cancel-generation').addEventListener('click', cancelReportGeneration);

  // Billing Modals & Actions
  document.getElementById('btn-open-billing').addEventListener('click', showBillingModal);
  document.getElementById('btn-close-billing').addEventListener('click', hideBillingModal);
  document.getElementById('btn-cancel-billing').addEventListener('click', hideBillingModal);
  
  document.getElementById('btn-close-quota-warning').addEventListener('click', hideQuotaWarningModal);
  document.getElementById('btn-quota-open-billing').addEventListener('click', () => {
    hideQuotaWarningModal();
    showBillingModal();
  });
  
  document.getElementById('btn-save-billing').addEventListener('click', async () => {
    const val = parseFloat(document.getElementById('budget-limit-input').value);
    if (isNaN(val) || val < 0.10) {
      alert("Please enter a budget limit of at least $0.10.");
      return;
    }
    budgetLimit = val;
    localStorage.setItem('billing_budget_limit', budgetLimit.toString());
    hideBillingModal();
    await updateBillingStatus();
    await checkBudgetExceedance();
  });
  
  document.getElementById('btn-reset-ledger').addEventListener('click', async () => {
    if (confirm("Are you sure you want to clear your estimated monthly usage logs? This cannot be undone.")) {
      try {
        await clearLedger();
        alert("Ledger cleared successfully.");
        await updateBillingStatus();
        await checkBudgetExceedance();
      } catch (err) {
        alert("Error resetting ledger: " + err.message);
      }
    }
  });

  // Analyzer Form Submit
  document.getElementById('analyzer-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!apiKey) {
      showAPIKeyModal();
      return;
    }
    runAnalyzerFlow();
  });
}

// Settings Modal Utilities
function showAPIKeyModal() {
  document.getElementById('api-key-input').value = apiKey;
  document.getElementById('modal-settings').classList.add('active');
}

function hideAPIKeyModal() {
  document.getElementById('modal-settings').classList.remove('active');
}

function saveAPIKey() {
  const val = document.getElementById('api-key-input').value.trim();
  if (!val) {
    alert("Please enter a valid Google Maps API Key.");
    return;
  }
  apiKey = val;
  localStorage.setItem('google_maps_api_key', apiKey);
  hideAPIKeyModal();
  loadGoogleMapsSDK(apiKey);
}

// Drawer Drawer Utilities
async function openHistoryDrawer() {
  document.getElementById('history-overlay').classList.add('active');
  await renderHistoryList();
}

function closeHistoryDrawer() {
  document.getElementById('history-overlay').classList.remove('active');
}

// Dynamically fetch and render reports in History drawer
async function renderHistoryList() {
  const listEl = document.getElementById('history-list');
  listEl.innerHTML = '';
  
  try {
    const reports = await getAllReports();
    if (reports.length === 0) {
      listEl.innerHTML = '<div class="history-empty">No reports saved yet. Generate a report to see it here!</div>';
      return;
    }
    
    reports.forEach(report => {
      const item = document.createElement('div');
      item.className = 'history-item';
      
      const reportDate = new Date(report.createdAt);
      const dateDisplay = reportDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      
      // Calculate start and end times display
      const firstRes = report.results[0];
      const lastRes = report.results[report.results.length - 1];
      const windowStr = `${firstRes.label} - ${lastRes.label}`;
      
      item.innerHTML = `
        <div class="history-item-header">
          <div class="history-item-title">${escapeHTML(report.name)}</div>
          <div class="history-item-date">${dateDisplay}</div>
        </div>
        <div class="history-item-details">
          <div class="history-item-route">
            <span>${escapeHTML(report.startAddress.split(',')[0])}</span>
            <span class="route-arrow">&rarr;</span>
            <span>${escapeHTML(report.endAddress.split(',')[0])}</span>
          </div>
          <div>Interval: Every ${report.interval} mins (${report.results.length} slots)</div>
          <div>Time Window: ${windowStr}</div>
        </div>
        <div class="history-item-actions">
          <button class="btn-delete-history" data-id="${report.id}">Delete</button>
        </div>
      `;
      
      // Load report on card click (excluding delete button clicks)
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-delete-history')) return;
        loadSavedReport(report.id);
        closeHistoryDrawer();
      });
      
      // Bind delete action
      item.querySelector('.btn-delete-history').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm("Are you sure you want to delete this report from history?")) {
          try {
            await deleteReport(report.id);
            await renderHistoryList(); // Refresh
          } catch (err) {
            alert("Error deleting report: " + err.message);
          }
        }
      });
      
      listEl.appendChild(item);
    });
  } catch (err) {
    listEl.innerHTML = `<div class="history-empty text-danger">Failed to load reports: ${escapeHTML(err.message)}</div>`;
  }
}

// Load Google Maps JavaScript SDK dynamically
function loadGoogleMapsSDK(key) {
  if (window.google && window.google.maps) {
    // SDK already active. Ensure UI displays active status
    document.getElementById('map-overlay').classList.add('hidden');
    setupMapAndAutocomplete();
    return;
  }
  
  // Remove any legacy script instances to prevent duplicates
  const existingScript = document.getElementById('google-maps-sdk-script');
  if (existingScript) existingScript.remove();
  
  const script = document.createElement('script');
  script.id = 'google-maps-sdk-script';
  script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&callback=initGoogleMapsCallback`;
  script.async = true;
  script.defer = true;
  script.onerror = () => {
    alert("Failed to load Google Maps SDK. Please check your internet connection or verify your API key.");
    document.getElementById('map-overlay').classList.remove('hidden');
  };
  
  document.head.appendChild(script);
}

// Global Callback invoked by Google Maps JS script load
window.initGoogleMapsCallback = () => {
  document.getElementById('map-overlay').classList.add('hidden');
  setupMapAndAutocomplete();
};

// Map & Autocomplete Configuration
function setupMapAndAutocomplete() {
  if (!window.google || !window.google.maps) return;

  const mapContainer = document.getElementById('map');
  map = new google.maps.Map(mapContainer, {
    center: { lat: 40.7128, lng: -74.0060 }, // NYC Default
    zoom: 12,
    styles: darkMapStyles,
    disableDefaultUI: false,
    mapTypeControl: false,
    streetViewControl: false
  });
  
  directionsRenderer = new google.maps.DirectionsRenderer({
    map: map,
    suppressMarkers: false,
    polylineOptions: {
      strokeColor: '#0ea5e9',
      strokeOpacity: 0.7,
      strokeWeight: 5
    }
  });

  const startInput = document.getElementById('start-address');
  const endInput = document.getElementById('end-address');
  
  autocompleteStart = new google.maps.places.Autocomplete(startInput, { types: ['geocode'] });
  autocompleteEnd = new google.maps.places.Autocomplete(endInput, { types: ['geocode'] });
  
  // Link autocomplete to map viewport to prioritize local results
  autocompleteStart.bindTo('bounds', map);
  autocompleteEnd.bindTo('bounds', map);

  // Listen to Autocomplete Place Selection to log autocomplete session charges
  autocompleteStart.addListener('place_changed', async () => {
    const place = autocompleteStart.getPlace();
    if (place && place.geometry) {
      await addLedgerEntry('autocomplete_session', AUTOCOMPLETE_SESSION_COST);
      await updateBillingStatus();
      await checkBudgetExceedance();
    }
  });
  autocompleteEnd.addListener('place_changed', async () => {
    const place = autocompleteEnd.getPlace();
    if (place && place.geometry) {
      await addLedgerEntry('autocomplete_session', AUTOCOMPLETE_SESSION_COST);
      await updateBillingStatus();
      await checkBudgetExceedance();
    }
  });

  // Log map load charge once per page load
  if (!sessionMapLoaded) {
    sessionMapLoaded = true;
    addLedgerEntry('map_load', MAP_LOAD_COST).then(() => {
      updateBillingStatus();
      checkBudgetExceedance();
    }).catch(err => console.error(err));
  }

  // Avoid page refreshes when user presses enter key inside autocomplete
  startInput.addEventListener('keydown', preventEnterSubmit);
  endInput.addEventListener('keydown', preventEnterSubmit);
}

function preventEnterSubmit(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
  }
}

// Initialize Chart.js Line Graph
function initializeChart() {
  const ctx = document.getElementById('analytics-chart').getContext('2d');
  
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Standard Time (No Traffic)',
          data: [],
          borderColor: 'rgba(156, 163, 175, 0.4)',
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false,
          tension: 0.1
        },
        {
          label: 'Traffic Travel Time',
          data: [],
          borderColor: '#0ea5e9',
          borderWidth: 3,
          pointRadius: 6,
          pointHoverRadius: 8,
          // Color points dynamically based on delay ratio
          pointBackgroundColor: function(context) {
            const index = context.dataIndex;
            const val = context.dataset.data[index];
            if (val === undefined || val === null) return '#0ea5e9';
            
            const baseline = context.chart.data.datasets[0].data[index];
            if (!baseline) return '#0ea5e9';
            
            const ratio = val / baseline;
            if (ratio < 1.15) return '#10b981';      // Green (Smooth)
            if (ratio <= 1.40) return '#f59e0b';     // Orange (Moderate)
            return '#ef4444';                        // Red (Heavy)
          },
          pointBorderColor: function(context) {
            // Match the point fill colors for clean points
            const index = context.dataIndex;
            const val = context.dataset.data[index];
            if (val === undefined || val === null) return 'rgba(255,255,255,0.2)';
            
            const baseline = context.chart.data.datasets[0].data[index];
            if (!baseline) return 'rgba(255,255,255,0.2)';
            
            const ratio = val / baseline;
            if (ratio < 1.15) return '#10b981';
            if (ratio <= 1.40) return '#f59e0b';
            return '#ef4444';
          },
          fill: false,
          tension: 0.2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.05)'
          },
          ticks: {
            color: '#9ca3af',
            font: { family: 'Inter', size: 11 }
          }
        },
        y: {
          grid: {
            color: 'rgba(255, 255, 255, 0.05)'
          },
          ticks: {
            color: '#9ca3af',
            font: { family: 'Inter', size: 11 },
            callback: function(value) {
              return value + ' min';
            }
          },
          title: {
            display: true,
            text: 'Travel Duration (minutes)',
            color: '#9ca3af',
            font: { family: 'Inter', size: 12 }
          }
        }
      },
      plugins: {
        legend: {
          display: false // We use our custom styled HTML legend
        },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          titleColor: '#f9fafb',
          bodyColor: '#f9fafb',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          padding: 12,
          displayColors: false, // Don't show chart color squares
          callbacks: {
            title: function(tooltipItems) {
              return `Commute Departure: ${tooltipItems[0].label}`;
            },
            label: function(context) {
              const val = context.parsed.y;
              if (context.datasetIndex === 1) { // Traffic Time Dataset
                const baseline = context.chart.data.datasets[0].data[context.dataIndex];
                if (!baseline) return `Travel Time: ${val} mins`;
                
                const ratio = val / baseline;
                let status = 'Smooth';
                if (ratio >= 1.40) status = 'Heavy Traffic';
                else if (ratio >= 1.15) status = 'Moderate Traffic';
                
                return `Travel Time: ${val} mins (${status})`;
              }
              return `Standard Time (Baseline): ${val} mins`;
            },
            // Color code the travel time value text in the tooltip
            labelTextColor: function(context) {
              if (context.datasetIndex === 1) {
                const val = context.parsed.y;
                const baseline = context.chart.data.datasets[0].data[context.dataIndex];
                if (!baseline) return '#f9fafb';
                
                const ratio = val / baseline;
                if (ratio < 1.15) return '#10b981';  // Green for smooth
                if (ratio <= 1.40) return '#f59e0b'; // Orange for moderate
                return '#ef4444';                    // Red for heavy
              }
              return '#9ca3af'; // Gray for standard
            },
            // Add custom details like arrival time in the footer of tooltip
            footer: function(tooltipItems) {
              const index = tooltipItems[0].dataIndex;
              const pointDetail = activeRunResults[index];
              if (pointDetail) {
                return `Departure: ${pointDetail.departureStr}\nEstimated Arrival: ${pointDetail.arrivalStr}`;
              }
              return '';
            },
            footerColor: '#9ca3af',
            footerFont: {
              family: 'Inter',
              size: 11,
              weight: 'normal'
            }
          }
        }
      }
    }
  });
}

// Reset custom map routes (markers & polylines)
function clearCustomMapRoute() {
  if (activePolyline) {
    activePolyline.setMap(null);
    activePolyline = null;
  }
  if (startMarker) {
    startMarker.setMap(null);
    startMarker = null;
  }
  if (endMarker) {
    endMarker.setMap(null);
    endMarker = null;
  }
  if (directionsRenderer) {
    directionsRenderer.setDirections({ routes: [] });
  }
}

// Form Submission / Traffic Analyzer Queue Execution
async function runAnalyzerFlow() {
  if (isGenerating) return;

  const startAddress = document.getElementById('start-address').value.trim();
  const endAddress = document.getElementById('end-address').value.trim();
  const dateVal = document.getElementById('date-select').value;
  const startTimeVal = document.getElementById('start-time').value;
  const endTimeVal = document.getElementById('end-time').value;
  const intervalVal = parseInt(document.getElementById('interval-select').value, 10);

  if (!startAddress || !endAddress || !dateVal || !startTimeVal || !endTimeVal) {
    alert("Please fill in all inputs.");
    return;
  }

  // Parse and validate times
  const [startH, startM] = startTimeVal.split(':').map(Number);
  const [endH, endM] = endTimeVal.split(':').map(Number);
  
  const targetDateObj = new Date(dateVal + 'T00:00:00'); // Local time zone representation
  
  const startDateTime = new Date(targetDateObj);
  startDateTime.setHours(startH, startM, 0, 0);

  const endDateTime = new Date(targetDateObj);
  endDateTime.setHours(endH, endM, 0, 0);

  // Validate: End time must be after start time
  if (endDateTime.getTime() <= startDateTime.getTime()) {
    alert("Error: End Time must occur after the Start Time.");
    return;
  }

  // Validate: Directions API requires departureTime to be in the future
  const now = new Date();
  if (startDateTime.getTime() <= now.getTime()) {
    alert("Google Traffic predictions are only available for future times. Please select a start time in the future.");
    return;
  }

  // Reset maps & chart
  clearCustomMapRoute();
  chart.data.labels = [];
  chart.data.datasets[0].data = [];
  chart.data.datasets[1].data = [];
  chart.update();

  activeRunResults = [];
  
  // Construct the timestamps queue
  const timeQueue = [];
  let currentTimer = new Date(startDateTime);
  
  while (currentTimer.getTime() <= endDateTime.getTime()) {
    timeQueue.push(new Date(currentTimer));
    currentTimer.setMinutes(currentTimer.getMinutes() + intervalVal);
  }

  // Show progress panel
  isGenerating = true;
  const progressPanel = document.getElementById('progress-panel');
  const progressTitle = document.getElementById('progress-title');
  const progressStatus = document.getElementById('progress-status');
  const progressBarFill = document.getElementById('progress-bar-fill');
  
  progressTitle.textContent = "Analyzing Commute Intervals";
  progressStatus.textContent = `Pacing queue: 0 of ${timeQueue.length} segments calculated...`;
  progressBarFill.style.width = '0%';
  progressPanel.classList.add('active');

  const directionsService = new google.maps.DirectionsService();
  let firstSuccess = true;
  let firstSuccessRoutePath = null;
  const resultsAccumulator = [];

  // Sequential Query Loop
  for (let i = 0; i < timeQueue.length; i++) {
    if (!isGenerating) break; // Canceled

    // Check budget limit check inside loop to enforce mid-run lock
    if (currentMonthSpend >= budgetLimit) {
      alert("Estimated monthly budget limit reached! Stopping commute analysis run.");
      isGenerating = false;
      break;
    }

    const targetTime = timeQueue[i];
    const timeLabel = formatTime12h(targetTime);
    progressStatus.textContent = `Checking traffic conditions for ${timeLabel} (${i + 1}/${timeQueue.length})...`;
    progressBarFill.style.width = `${((i) / timeQueue.length) * 100}%`;

    try {
      // Query Directions API
      const response = await fetchDirectionsAtTime(directionsService, {
        origin: startAddress,
        destination: endAddress,
        targetTime: targetTime
      });

      const route = response.routes[0];
      const leg = route.legs[0];
      
      const standardDuration = Math.round(leg.duration.value / 60); // minutes
      
      // Google API fallback: if duration_in_traffic isn't present, default to duration
      const trafficDuration = leg.duration_in_traffic 
        ? Math.round(leg.duration_in_traffic.value / 60) 
        : standardDuration;
      
      const distanceMiles = parseFloat((leg.distance.value * 0.000621371).toFixed(1)); // Convert meters to miles
      
      // Calculate estimated arrival time
      const arrivalTime = new Date(targetTime.getTime() + (leg.duration_in_traffic ? leg.duration_in_traffic.value : leg.duration.value) * 1000);

      const dataPoint = {
        timestamp: targetTime.toISOString(),
        label: timeLabel,
        standardDurationMin: standardDuration,
        trafficDurationMin: trafficDuration,
        distanceMiles: distanceMiles,
        departureStr: timeLabel,
        arrivalStr: formatTime12h(arrivalTime)
      };

      resultsAccumulator.push(dataPoint);
      activeRunResults.push(dataPoint);

      // On first successful run, cache the route polyline points to avoid repeating geocode details later
      if (firstSuccess) {
        firstSuccess = false;
        directionsRenderer.setDirections(response);
        firstSuccessRoutePath = route.overview_path.map(p => ({ lat: p.lat(), lng: p.lng() }));
      }

      // Add directions query entry to ledger
      await addLedgerEntry('directions_query', DIRECTIONS_QUERY_COST);
      await updateBillingStatus();

      // Update Chart in Real-time
      chart.data.labels.push(timeLabel);
      chart.data.datasets[0].data.push(standardDuration);
      chart.data.datasets[1].data.push(trafficDuration);
      chart.update();

    } catch (err) {
      console.warn(`Query failed for timestamp ${targetTime.toISOString()}: ${err.message}`);
      
      // Populate standard null/error indicators in chart so loop does not completely fail
      const dataPoint = {
        timestamp: targetTime.toISOString(),
        label: timeLabel,
        standardDurationMin: null,
        trafficDurationMin: null,
        distanceMiles: 0,
        departureStr: timeLabel,
        arrivalStr: 'N/A (API Error)'
      };
      resultsAccumulator.push(dataPoint);
      activeRunResults.push(dataPoint);
      
      chart.data.labels.push(timeLabel);
      chart.data.datasets[0].data.push(null);
      chart.data.datasets[1].data.push(null);
      chart.update();
    }

    // Pacing delay to stay safe under QPS thresholds
    if (i < timeQueue.length - 1 && isGenerating) {
      await delay(PACING_DELAY_MS);
    }
  }

  // End progress
  progressBarFill.style.width = '100%';
  await delay(300);
  progressPanel.classList.remove('active');
  isGenerating = false;

  // Save successful run to IndexedDB
  const validPoints = resultsAccumulator.filter(pt => pt.standardDurationMin !== null);
  if (validPoints.length > 0 && firstSuccessRoutePath) {
    const startShort = startAddress.split(',')[0];
    const endShort = endAddress.split(',')[0];
    const formattedDate = targetDateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const runName = `${startShort} to ${endShort} (${formattedDate})`;
    
    const reportData = {
      id: `run_${Date.now()}`,
      name: runName,
      createdAt: new Date().toISOString(),
      startAddress: startAddress,
      endAddress: endAddress,
      targetDate: dateVal,
      startTime: startTimeVal,
      endTime: endTimeVal,
      interval: intervalVal,
      routePolyline: firstSuccessRoutePath,
      results: resultsAccumulator
    };

    try {
      await saveReport(reportData);
      console.log("Commute analysis saved to IndexedDB.");
    } catch (dbErr) {
      console.error("Failed to save report to database:", dbErr);
    }
  } else {
    alert("Analyzer complete, but no segments were successfully resolved by Google API. Check developer console for warnings.");
  }
}

// Promisified helper to query directions service
function fetchDirectionsAtTime(service, { origin, destination, targetTime }) {
  return new Promise((resolve, reject) => {
    service.route(
      {
        origin: origin,
        destination: destination,
        travelMode: google.maps.TravelMode.DRIVING,
        drivingOptions: {
          departureTime: targetTime,
          trafficModel: google.maps.TrafficModel.BEST_GUESS
        }
      },
      (response, status) => {
        if (status === 'OK' || status === google.maps.DirectionsStatus.OK) {
          resolve(response);
        } else {
          reject(new Error(`Directions query failed with status: ${status}`));
        }
      }
    );
  });
}

// Cancel Active Query Process
function cancelReportGeneration() {
  isGenerating = false;
  document.getElementById('progress-status').textContent = "Canceling calculations...";
  console.log("Report generation canceled by user.");
}

// Load a saved report from IndexedDB history drawer
async function loadSavedReport(id) {
  try {
    const report = await getReport(id);
    if (!report) {
      alert("Selected report could not be found.");
      return;
    }

    // Populate control inputs
    document.getElementById('start-address').value = report.startAddress;
    document.getElementById('end-address').value = report.endAddress;
    document.getElementById('date-select').value = report.targetDate;
    document.getElementById('start-time').value = report.startTime;
    document.getElementById('end-time').value = report.endTime;
    document.getElementById('interval-select').value = report.interval;
    calculateCostEstimate();

    // Redraw map with the stored polyline and A/B markers
    clearCustomMapRoute();
    if (report.routePolyline && report.routePolyline.length > 0) {
      const pathCoords = report.routePolyline;
      
      activePolyline = new google.maps.Polyline({
        path: pathCoords,
        geodesic: true,
        strokeColor: '#38bdf8',
        strokeOpacity: 0.85,
        strokeWeight: 5,
        map: map
      });

      // Place Custom Markers for A & B
      startMarker = new google.maps.Marker({
        position: pathCoords[0],
        map: map,
        label: {
          text: 'A',
          color: '#ffffff',
          fontWeight: 'bold'
        },
        title: 'Start Location'
      });

      endMarker = new google.maps.Marker({
        position: pathCoords[pathCoords.length - 1],
        map: map,
        label: {
          text: 'B',
          color: '#ffffff',
          fontWeight: 'bold'
        },
        title: 'Destination'
      });

      // Fit map view bounds around route coordinates
      const bounds = new google.maps.LatLngBounds();
      pathCoords.forEach(coord => bounds.extend(coord));
      map.fitBounds(bounds);
    }

    // Populate Chart datasets
    chart.data.labels = [];
    chart.data.datasets[0].data = [];
    chart.data.datasets[1].data = [];
    
    activeRunResults = [];

    report.results.forEach(res => {
      chart.data.labels.push(res.label);
      chart.data.datasets[0].data.push(res.standardDurationMin);
      chart.data.datasets[1].data.push(res.trafficDurationMin);
      
      activeRunResults.push({
        label: res.label,
        departureStr: res.departureStr || res.label,
        arrivalStr: res.arrivalStr || 'N/A'
      });
    });

    chart.update();
    console.log(`Loaded run "${report.name}" successfully.`);

  } catch (err) {
    alert("Error loading saved report: " + err.message);
  }
}

// Utility: Escape HTML tags to prevent XSS issues in UI
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

const savedBudget = localStorage.getItem('billing_budget_limit');
let budgetLimit = savedBudget !== null ? parseFloat(savedBudget) : 200.00;
let currentMonthSpend = 0.00;
let sessionMapLoaded = false;

// Pricing Constants
const MAP_LOAD_COST = 0.007;
const AUTOCOMPLETE_SESSION_COST = 0.017;
const DIRECTIONS_QUERY_COST = 0.010;

// Update Billing UI and stats
async function updateBillingStatus() {
  try {
    const entries = await getMonthLedgerEntries();
    
    // Calculate spend and counts
    let spend = 0.00;
    let mapLoads = 0;
    let autocompleteSessions = 0;
    let directionsQueries = 0;
    
    entries.forEach(entry => {
      spend += entry.cost;
      if (entry.type === 'map_load') mapLoads++;
      else if (entry.type === 'autocomplete_session') autocompleteSessions++;
      else if (entry.type === 'directions_query') directionsQueries++;
    });
    
    currentMonthSpend = spend;
    
    // Update Header Pill
    document.getElementById('header-spend-amount').textContent = `$${spend.toFixed(2)}`;
    
    // Toggle header pill exceeded style
    const headerPill = document.getElementById('btn-open-billing');
    if (spend >= budgetLimit) {
      headerPill.classList.add('budget-exceeded');
    } else {
      headerPill.classList.remove('budget-exceeded');
    }
    
    // Update Billing Modal Stats
    document.getElementById('billing-current-spend').textContent = `$${spend.toFixed(2)}`;
    document.getElementById('billing-budget-limit').textContent = `$${budgetLimit.toFixed(2)}`;
    
    const progressPercent = Math.min((spend / budgetLimit) * 100, 100);
    document.getElementById('billing-progress-fill').style.width = `${progressPercent}%`;
    
    // Days remaining in billing cycle (1st of next month)
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const msDiff = nextMonth.getTime() - now.getTime();
    const daysRemaining = Math.ceil(msDiff / (1000 * 60 * 60 * 24));
    document.getElementById('billing-days-remaining').textContent = daysRemaining;
    
    // Remaining Allowance
    const remaining = Math.max(budgetLimit - spend, 0.00);
    document.getElementById('billing-remaining-allowance').textContent = `$${remaining.toFixed(2)}`;
    
    // Itemized counts
    document.getElementById('count-map-loads').textContent = mapLoads;
    document.getElementById('count-autocomplete-sessions').textContent = autocompleteSessions;
    document.getElementById('count-directions-queries').textContent = directionsQueries;
    
    // Input value
    document.getElementById('budget-limit-input').value = budgetLimit.toFixed(2);
  } catch (err) {
    console.error("Failed to update billing status:", err);
  }
}

// Check budget exceedance and enforce locks
async function checkBudgetExceedance() {
  const isExceeded = currentMonthSpend >= budgetLimit;
  const generateBtn = document.getElementById('btn-generate');
  const alertBanner = document.getElementById('quota-lock-alert');
  
  if (isExceeded) {
    // Show warn modal
    document.getElementById('quota-warning-spent').textContent = `$${currentMonthSpend.toFixed(2)}`;
    document.getElementById('quota-warning-limit').textContent = `$${budgetLimit.toFixed(2)}`;
    document.getElementById('modal-quota-warning').classList.add('active');
    
    // Lock generate button
    generateBtn.disabled = true;
    generateBtn.style.opacity = '0.5';
    generateBtn.style.pointerEvents = 'none';
    generateBtn.title = "Monthly GCP budget limit exceeded. Adjust billing settings to unlock.";
    
    // Show inline alert banner
    alertBanner.classList.remove('hidden');
  } else {
    // Hide warn modal
    document.getElementById('modal-quota-warning').classList.remove('active');
    
    // Unlock generate button
    generateBtn.disabled = false;
    generateBtn.style.opacity = '1';
    generateBtn.style.pointerEvents = 'auto';
    generateBtn.title = "";
    
    // Hide inline alert banner
    alertBanner.classList.add('hidden');
  }
}

// Modal Toggle Helpers
function showBillingModal() {
  updateBillingStatus();
  document.getElementById('modal-billing').classList.add('active');
}

function hideBillingModal() {
  document.getElementById('modal-billing').classList.remove('active');
}

function hideQuotaWarningModal() {
  document.getElementById('modal-quota-warning').classList.remove('active');
}
