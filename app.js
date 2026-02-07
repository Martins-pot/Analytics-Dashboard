// Configuration
const API_BASE = 'https://srv442638.hstgr.cloud/analytics';
const REFRESH_INTERVAL = 60000; // 60 seconds

// IndexedDB Configuration
const DB_NAME = 'surelyAnalyticsV2';
const DB_VERSION = 2;
const STORE_NAME = 'dailySnapshots';

// Chart instances
let backendChart = null;
let clientChart = null;
let historyChart = null;
let comparisonChart = null;
let launchChart = null;
let adChart = null;
let adRequestChart = null;

// Auto-refresh timer
let refreshTimer = null;

// Current client chart type
let clientChartType = 'pie';

// Store last fetched data for re-rendering
let lastClientData = {};

// IndexedDB instance
let db = null;

// DOM Elements
const elements = {
    totalRequests: document.getElementById('totalRequests'),
    todayRequests: document.getElementById('todayRequests'),
    backendRequests: document.getElementById('backendRequests'),
    clientRequests: document.getElementById('clientRequests'),
    topBackendEndpoint: document.getElementById('topBackendEndpoint'),
    topBackendCount: document.getElementById('topBackendCount'),
    topClientAction: document.getElementById('topClientAction'),
    topClientCount: document.getElementById('topClientCount'),
    avgDailyRequests: document.getElementById('avgDailyRequests'),
    peakDayRequests: document.getElementById('peakDayRequests'),
    peakDayDate: document.getElementById('peakDayDate'),
    lastUpdated: document.getElementById('lastUpdated'),
    statusIndicator: document.getElementById('statusIndicator'),
    refreshBtn: document.getElementById('refreshBtn'),
    exportDataBtn: document.getElementById('exportDataBtn'),
    clearHistoryBtn: document.getElementById('clearHistoryBtn'),
    errorMessage: document.getElementById('errorMessage'),
    loadingSpinner: document.getElementById('loadingSpinner'),
    noClientData: document.getElementById('noClientData'),
    totalGrowth: document.getElementById('totalGrowth'),
    todayGrowth: document.getElementById('todayGrowth'),
    backendGrowth: document.getElementById('backendGrowth'),
    clientGrowth: document.getElementById('clientGrowth'),
    dataRange: document.getElementById('dataRange'),
    totalDaysTracked: document.getElementById('totalDaysTracked'),
    totalLaunches: document.getElementById('totalLaunches'),
    todayLaunches: document.getElementById('todayLaunches'),
    weekAvgLaunches: document.getElementById('weekAvgLaunches'),
    monthTotalLaunches: document.getElementById('monthTotalLaunches'),
    totalAdRequests: document.getElementById('totalAdRequests'),
    todayAdRequests: document.getElementById('todayAdRequests'),
    weekAvgAdRequests: document.getElementById('weekAvgAdRequests'),
    monthTotalAdRequests: document.getElementById('monthTotalAdRequests'),
    adCardsContainer: document.getElementById('adCardsContainer'),
    adMetricsSection: document.getElementById('adMetricsSection'),
    clearHistoryModal: document.getElementById('clearHistoryModal'),
    confirmClearBtn: document.getElementById('confirmClearBtn'),
    cancelClearBtn: document.getElementById('cancelClearBtn')
};

// ==================== INDEXEDDB FUNCTIONS ====================

// Initialize IndexedDB
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            console.log('IndexedDB initialized successfully');
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // Delete old store if exists
            if (db.objectStoreNames.contains(STORE_NAME)) {
                db.deleteObjectStore(STORE_NAME);
            }
            
            // Create new store
            const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'date' });
            objectStore.createIndex('timestamp', 'timestamp', { unique: false });
            console.log('Object store created');
        };
    });
}

// Get snapshot for a specific date
function getSnapshot(date) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const objectStore = transaction.objectStore(STORE_NAME);
        const request = objectStore.get(date);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Get all snapshots
function getAllSnapshots() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const objectStore = transaction.objectStore(STORE_NAME);
        const request = objectStore.getAll();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Save snapshot for a specific date
function saveSnapshot(date, data) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(STORE_NAME);
        
        const snapshot = {
            date: date,
            timestamp: new Date().toISOString(),
            backend: data.backend || {},
            client: data.client || {},
            total_requests: data.total_requests || 0
        };
        
        const request = objectStore.put(snapshot);
        
        request.onsuccess = () => {
            console.log(`Snapshot saved for ${date}:`, snapshot);
            resolve(snapshot);
        };
        request.onerror = () => reject(request.error);
    });
}

// Clear all history
function clearAllHistory() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(STORE_NAME);
        const request = objectStore.clear();
        
        request.onsuccess = () => {
            console.log('All history cleared');
            resolve();
        };
        request.onerror = () => reject(request.error);
    });
}

// ==================== UTILITY FUNCTIONS ====================

// Get today's date in YYYY-MM-DD format
function getTodayDate() {
    const now = new Date();
    return now.toISOString().split('T')[0];
}

// Get date N days ago
function getDateNDaysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
}

// Format date for display
function formatDate(dateStr) {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

// ==================== INITIALIZATION ====================

async function init() {
    console.log('SURELY Analytics Dashboard initialized');
    
    try {
        // Initialize IndexedDB
        await initDB();
        
        // Fetch data immediately
        await fetchAnalytics();
        
        // Set up auto-refresh
        startAutoRefresh();
        
        // Set up manual refresh button
        elements.refreshBtn.addEventListener('click', async () => {
            await fetchAnalytics();
            restartAutoRefresh();
        });
        
        // Set up export button
        elements.exportDataBtn.addEventListener('click', exportData);
        
        // Set up clear history button
        elements.clearHistoryBtn.addEventListener('click', () => {
            elements.clearHistoryModal.classList.remove('hidden');
        });
        
        elements.confirmClearBtn.addEventListener('click', async () => {
            try {
                await clearAllHistory();
                elements.clearHistoryModal.classList.add('hidden');
                await fetchAnalytics();
                console.log('History cleared successfully');
            } catch (error) {
                console.error('Error clearing history:', error);
                showError('Failed to clear history');
            }
        });
        
        elements.cancelClearBtn.addEventListener('click', () => {
            elements.clearHistoryModal.classList.add('hidden');
        });
        
        // Close modal on background click
        elements.clearHistoryModal.addEventListener('click', (e) => {
            if (e.target === elements.clearHistoryModal) {
                elements.clearHistoryModal.classList.add('hidden');
            }
        });
        
        // Set up chart type toggle for client chart
        document.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                clientChartType = this.dataset.type;
                if (lastClientData && Object.keys(lastClientData).length > 0) {
                    updateClientChart(lastClientData);
                }
            });
        });
        
        // Set up time range selectors
        document.getElementById('historyTimeRange')?.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                document.getElementById('customRangeInputs').classList.remove('hidden');
            } else {
                document.getElementById('customRangeInputs').classList.add('hidden');
                updateHistoryChart(e.target.value);
            }
        });
        
        document.getElementById('applyCustomRange')?.addEventListener('click', () => {
            const startDate = document.getElementById('startDate').value;
            const endDate = document.getElementById('endDate').value;
            if (startDate && endDate) {
                updateHistoryChart('custom', startDate, endDate);
            }
        });
        
        document.getElementById('launchTimeRange')?.addEventListener('change', (e) => {
            updateLaunchChart(e.target.value === 'all' ? 'all' : parseInt(e.target.value));
        });
        
        document.getElementById('adRequestTimeRange')?.addEventListener('change', (e) => {
            updateAdRequestChart(e.target.value === 'all' ? 'all' : parseInt(e.target.value));
        });
        
        document.getElementById('adTimeRange')?.addEventListener('change', (e) => {
            updateAdChart(e.target.value === 'all' ? 'all' : parseInt(e.target.value));
        });
        
    } catch (error) {
        console.error('Initialization error:', error);
        showError(`Initialization failed: ${error.message}`);
    }
}

// ==================== DATA FETCHING ====================

async function fetchAnalytics() {
    showLoading(true);
    hideError();
    
    try {
        const today = getTodayDate();
        
        // Fetch all-time data
        const allTimeResponse = await fetch(`${API_BASE}/`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        
        if (!allTimeResponse.ok) {
            throw new Error(`HTTP ${allTimeResponse.status}: ${allTimeResponse.statusText}`);
        }
        
        const allTimeData = await allTimeResponse.json();
        console.log('All-time data:', allTimeData);
        
        // Fetch today's data
        const todayResponse = await fetch(`${API_BASE}/today`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        
        if (!todayResponse.ok) {
            throw new Error(`HTTP ${todayResponse.status}: ${todayResponse.statusText}`);
        }
        
        const todayData = await todayResponse.json();
        console.log("Today's data:", todayData);
        
        // Save today's snapshot
        await saveSnapshot(today, todayData);
        
        // Update dashboard with both datasets
        await updateDashboard(allTimeData, todayData);
        
        updateLastUpdated();
        setStatusOnline();
        
    } catch (error) {
        console.error('Error fetching analytics:', error);
        showError(`Failed to fetch analytics: ${error.message}`);
        setStatusOffline();
    } finally {
        showLoading(false);
    }
}

// ==================== DASHBOARD UPDATE ====================

async function updateDashboard(allTimeData, todayData) {
    // Update current values
    updateCurrentValues(allTimeData, todayData);
    
    // Update charts
    updateCharts(allTimeData);
    
    // Update metrics based on historical data
    await updateMetrics();
    
    // Update historical charts
    await updateHistoricalCharts();
    
    // Update user launch metrics
    await updateUserLaunchMetrics();
    
    // Update ad request metrics
    await updateAdRequestMetrics();
    
    // Update ad metrics
    await updateAdMetrics();
    
    // Update top performers
    updateTopPerformers(allTimeData);
}

// Update current values
function updateCurrentValues(allTimeData, todayData) {
    const { backend = {}, client = {}, total_requests = 0 } = allTimeData;
    const todayTotal = todayData.total_requests || 0;
    
    const backendTotal = Object.values(backend).reduce((sum, val) => sum + val, 0);
    const clientTotal = Object.values(client).reduce((sum, val) => sum + val, 0);
    
    // Update card values
    animateValue(elements.totalRequests, total_requests);
    animateValue(elements.todayRequests, todayTotal);
    animateValue(elements.backendRequests, backendTotal);
    animateValue(elements.clientRequests, clientTotal);
    
    // Show growth badges (simple increment detection)
    updateGrowthBadges(allTimeData, todayData);
}

// Update growth badges
function updateGrowthBadges(allTimeData, todayData) {
    // Get yesterday's snapshot to calculate growth
    const yesterday = getDateNDaysAgo(1);
    
    getSnapshot(yesterday).then(yesterdaySnapshot => {
        if (yesterdaySnapshot) {
            const todayTotal = todayData.total_requests || 0;
            const yesterdayTotal = yesterdaySnapshot.total_requests || 0;
            const growth = todayTotal - yesterdayTotal;
            
            if (growth > 0) {
                elements.todayGrowth.textContent = `+${growth}`;
                elements.todayGrowth.classList.remove('negative', 'hidden-badge');
                elements.todayGrowth.classList.add('positive');
            } else if (growth < 0) {
                elements.todayGrowth.textContent = `${growth}`;
                elements.todayGrowth.classList.remove('positive', 'hidden-badge');
                elements.todayGrowth.classList.add('negative');
            } else {
                elements.todayGrowth.classList.add('hidden-badge');
            }
        }
    });
}

// Update top performers
function updateTopPerformers(data) {
    const { backend = {}, client = {} } = data;
    
    // Top backend endpoint
    const topBackend = Object.entries(backend).sort((a, b) => b[1] - a[1])[0];
    if (topBackend) {
        elements.topBackendEndpoint.textContent = topBackend[0];
        elements.topBackendCount.textContent = `${topBackend[1].toLocaleString()} requests`;
    }
    
    // Top client action (excluding ads and user launch)
    const clientFiltered = Object.entries(client).filter(([key]) => 
        !key.startsWith('ad ') && key !== 'user launch'
    );
    const topClient = clientFiltered.sort((a, b) => b[1] - a[1])[0];
    if (topClient) {
        elements.topClientAction.textContent = topClient[0];
        elements.topClientCount.textContent = `${topClient[1].toLocaleString()} actions`;
    }
}

// Update general metrics
async function updateMetrics() {
    const snapshots = await getAllSnapshots();
    
    if (snapshots.length === 0) {
        elements.dataRange.textContent = '—';
        elements.totalDaysTracked.textContent = '0';
        elements.avgDailyRequests.textContent = '0';
        elements.peakDayRequests.textContent = '0';
        elements.peakDayDate.textContent = '—';
        return;
    }
    
    const dates = snapshots.map(s => s.date).sort();
    elements.dataRange.textContent = `${dates[0]} to ${dates[dates.length - 1]}`;
    elements.totalDaysTracked.textContent = dates.length;
    
    // Calculate average daily requests
    const total = snapshots.reduce((sum, s) => sum + (s.total_requests || 0), 0);
    const avg = Math.round(total / snapshots.length);
    animateValue(elements.avgDailyRequests, avg);
    
    // Find peak day
    const peak = snapshots.reduce((max, s) => 
        (s.total_requests || 0) > (max.total_requests || 0) ? s : max
    , snapshots[0]);
    
    animateValue(elements.peakDayRequests, peak.total_requests || 0);
    elements.peakDayDate.textContent = peak.date;
}

// Update user launch metrics
async function updateUserLaunchMetrics() {
    const snapshots = await getAllSnapshots();
    const today = getTodayDate();
    
    if (snapshots.length === 0) {
        animateValue(elements.totalLaunches, 0);
        animateValue(elements.todayLaunches, 0);
        animateValue(elements.weekAvgLaunches, 0);
        animateValue(elements.monthTotalLaunches, 0);
        return;
    }
    
    // Total launches (from all-time data - latest snapshot)
    const latestSnapshot = snapshots.sort((a, b) => b.date.localeCompare(a.date))[0];
    const totalLaunches = latestSnapshot.client?.['user launch'] || 0;
    animateValue(elements.totalLaunches, totalLaunches);
    
    // Today's launches
    const todaySnapshot = snapshots.find(s => s.date === today);
    const todayLaunches = todaySnapshot?.client?.['user launch'] || 0;
    animateValue(elements.todayLaunches, todayLaunches);
    
    // 7-day average
    const last7Days = snapshots
        .filter(s => s.date >= getDateNDaysAgo(7) && s.date <= today)
        .sort((a, b) => a.date.localeCompare(b.date));
    
    if (last7Days.length > 0) {
        const weekTotal = last7Days.reduce((sum, s) => sum + (s.client?.['user launch'] || 0), 0);
        const weekAvg = Math.round(weekTotal / last7Days.length);
        animateValue(elements.weekAvgLaunches, weekAvg);
    }
    
    // 30-day total
    const last30Days = snapshots.filter(s => s.date >= getDateNDaysAgo(30) && s.date <= today);
    const monthTotal = last30Days.reduce((sum, s) => sum + (s.client?.['user launch'] || 0), 0);
    animateValue(elements.monthTotalLaunches, monthTotal);
    
    // Update launch chart
    await updateLaunchChart(30);
}

// Update launch chart
async function updateLaunchChart(days) {
    const ctx = document.getElementById('launchChart');
    if (!ctx) return;
    
    const snapshots = await getAllSnapshots();
    const today = getTodayDate();
    const startDate = days === 'all' ? null : getDateNDaysAgo(days);
    
    const filtered = snapshots
        .filter(s => !startDate || s.date >= startDate)
        .filter(s => s.date <= today)
        .sort((a, b) => a.date.localeCompare(b.date));
    
    const labels = filtered.map(s => formatDate(s.date));
    const launchData = filtered.map(s => s.client?.['user launch'] || 0);
    
    if (launchChart) {
        launchChart.destroy();
    }
    
    launchChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'User Launches',
                data: launchData,
                borderColor: 'rgba(196, 30, 58, 1)',
                backgroundColor: 'rgba(196, 30, 58, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: 'rgba(196, 30, 58, 1)',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2
            }]
        },
        options: getChartOptions('Launches')
    });
}

// Update ad request metrics
async function updateAdRequestMetrics() {
    const snapshots = await getAllSnapshots();
    const today = getTodayDate();
    
    if (snapshots.length === 0) {
        animateValue(elements.totalAdRequests, 0);
        animateValue(elements.todayAdRequests, 0);
        animateValue(elements.weekAvgAdRequests, 0);
        animateValue(elements.monthTotalAdRequests, 0);
        return;
    }
    
    // Helper function to get total ad requests from a snapshot
    const getTotalAdRequests = (snapshot) => {
        if (!snapshot || !snapshot.client) return 0;
        return Object.entries(snapshot.client)
            .filter(([key]) => key.startsWith('ad '))
            .reduce((sum, [, value]) => sum + value, 0);
    };
    
    // Total ad requests (from all-time data - latest snapshot)
    const latestSnapshot = snapshots.sort((a, b) => b.date.localeCompare(a.date))[0];
    const totalAdRequests = getTotalAdRequests(latestSnapshot);
    animateValue(elements.totalAdRequests, totalAdRequests);
    
    // Today's ad requests
    const todaySnapshot = snapshots.find(s => s.date === today);
    const todayAdRequests = getTotalAdRequests(todaySnapshot);
    animateValue(elements.todayAdRequests, todayAdRequests);
    
    // 7-day average
    const last7Days = snapshots
        .filter(s => s.date >= getDateNDaysAgo(7) && s.date <= today)
        .sort((a, b) => a.date.localeCompare(b.date));
    
    if (last7Days.length > 0) {
        const weekTotal = last7Days.reduce((sum, s) => sum + getTotalAdRequests(s), 0);
        const weekAvg = Math.round(weekTotal / last7Days.length);
        animateValue(elements.weekAvgAdRequests, weekAvg);
    }
    
    // 30-day total
    const last30Days = snapshots.filter(s => s.date >= getDateNDaysAgo(30) && s.date <= today);
    const monthTotal = last30Days.reduce((sum, s) => sum + getTotalAdRequests(s), 0);
    animateValue(elements.monthTotalAdRequests, monthTotal);
    
    // Update ad request chart
    await updateAdRequestChart(30);
}

// Update ad request chart
async function updateAdRequestChart(days) {
    const ctx = document.getElementById('adRequestChart');
    if (!ctx) return;
    
    const snapshots = await getAllSnapshots();
    const today = getTodayDate();
    const startDate = days === 'all' ? null : getDateNDaysAgo(days);
    
    const filtered = snapshots
        .filter(s => !startDate || s.date >= startDate)
        .filter(s => s.date <= today)
        .sort((a, b) => a.date.localeCompare(b.date));
    
    // Helper function to get total ad requests from a snapshot
    const getTotalAdRequests = (snapshot) => {
        if (!snapshot || !snapshot.client) return 0;
        return Object.entries(snapshot.client)
            .filter(([key]) => key.startsWith('ad '))
            .reduce((sum, [, value]) => sum + value, 0);
    };
    
    const labels = filtered.map(s => formatDate(s.date));
    const adRequestData = filtered.map(s => getTotalAdRequests(s));
    
    if (adRequestChart) {
        adRequestChart.destroy();
    }
    
    adRequestChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Ad Requests',
                data: adRequestData,
                borderColor: 'rgba(245, 158, 11, 1)',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: 'rgba(245, 158, 11, 1)',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2
            }]
        },
        options: getChartOptions('Ad Requests')
    });
}

// Update ad metrics
async function updateAdMetrics() {
    const snapshots = await getAllSnapshots();
    const today = getTodayDate();
    
    if (snapshots.length === 0) {
        elements.adMetricsSection.style.display = 'none';
        return;
    }
    
    const latestSnapshot = snapshots.find(s => s.date === today) || 
                          snapshots.sort((a, b) => b.date.localeCompare(a.date))[0];
    
    if (!latestSnapshot || !latestSnapshot.client) {
        elements.adMetricsSection.style.display = 'none';
        return;
    }
    
    // Collect all ad metrics
    const adMetrics = {};
    Object.keys(latestSnapshot.client).forEach(key => {
        if (key.startsWith('ad ')) {
            adMetrics[key] = latestSnapshot.client[key];
        }
    });
    
    if (Object.keys(adMetrics).length === 0) {
        elements.adMetricsSection.style.display = 'none';
        return;
    }
    
    elements.adMetricsSection.style.display = 'block';
    
    // Clear existing ad cards
    elements.adCardsContainer.innerHTML = '';
    
    // Create cards for each ad metric
    Object.entries(adMetrics).sort((a, b) => b[1] - a[1]).forEach(([key, value]) => {
        const card = document.createElement('div');
        card.className = 'card';
        
        const displayName = key.replace(/^ad /, '').replace(/_/g, ' ')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
        
        card.innerHTML = `
            <div class="card-header">
                <h3>${displayName}</h3>
            </div>
            <p class="card-value">${value.toLocaleString()}</p>
            <div class="card-footer">All-time views</div>
        `;
        
        elements.adCardsContainer.appendChild(card);
    });
    
    // Update ad chart
    await updateAdChart(30);
}

// Update ad chart
async function updateAdChart(days) {
    const ctx = document.getElementById('adChart');
    if (!ctx) return;
    
    const snapshots = await getAllSnapshots();
    const today = getTodayDate();
    const startDate = days === 'all' ? null : getDateNDaysAgo(days);
    
    const filtered = snapshots
        .filter(s => !startDate || s.date >= startDate)
        .filter(s => s.date <= today)
        .sort((a, b) => a.date.localeCompare(b.date));
    
    // Collect all unique ad metrics
    const allAdMetrics = new Set();
    filtered.forEach(s => {
        if (s.client) {
            Object.keys(s.client).forEach(key => {
                if (key.startsWith('ad ')) {
                    allAdMetrics.add(key);
                }
            });
        }
    });
    
    if (allAdMetrics.size === 0) return;
    
    const labels = filtered.map(s => formatDate(s.date));
    
    const datasets = Array.from(allAdMetrics).map((metric, index) => {
        const colors = [
            { border: 'rgba(196, 30, 58, 1)', bg: 'rgba(196, 30, 58, 0.1)' },
            { border: 'rgba(230, 57, 70, 1)', bg: 'rgba(230, 57, 70, 0.1)' },
            { border: 'rgba(139, 19, 41, 1)', bg: 'rgba(139, 19, 41, 0.1)' },
            { border: 'rgba(255, 69, 87, 1)', bg: 'rgba(255, 69, 87, 0.1)' }
        ];
        
        const color = colors[index % colors.length];
        const displayName = metric.replace(/^ad /, '').replace(/_/g, ' ')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
        
        const data = filtered.map(s => s.client?.[metric] || 0);
        
        return {
            label: displayName,
            data: data,
            borderColor: color.border,
            backgroundColor: color.bg,
            borderWidth: 2,
            fill: true,
            tension: 0.4
        };
    });
    
    if (adChart) {
        adChart.destroy();
    }
    
    adChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: getChartOptions('Ad Views')
    });
}

// ==================== CHARTS ====================

// Update charts
function updateCharts(data) {
    const { backend = {}, client = {} } = data;
    
    lastClientData = client;
    
    updateBackendChart(backend);
    updateClientChart(client);
}

// Update backend chart
function updateBackendChart(backendData) {
    const ctx = document.getElementById('backendChart').getContext('2d');
    
    const labels = Object.keys(backendData);
    const values = Object.values(backendData);
    
    if (backendChart) {
        backendChart.destroy();
    }
    
    backendChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Requests',
                data: values,
                backgroundColor: 'rgba(196, 30, 58, 0.8)',
                borderColor: 'rgba(196, 30, 58, 1)',
                borderWidth: 2,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    padding: 12,
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    borderColor: '#C41E3A',
                    borderWidth: 2,
                    titleFont: { size: 14, weight: 'bold' },
                    bodyFont: { size: 13 }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: '#b3b3b3',
                        font: { size: 11 }
                    },
                    grid: {
                        color: 'rgba(196, 30, 58, 0.1)'
                    }
                },
                x: {
                    ticks: {
                        color: '#b3b3b3',
                        font: { size: 11 },
                        maxRotation: 45,
                        minRotation: 45
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// Update client chart
function updateClientChart(clientData) {
    // Filter out ads and user launch for this chart
    const filteredData = {};
    Object.keys(clientData).forEach(key => {
        if (!key.startsWith('ad ') && key !== 'user launch') {
            filteredData[key] = clientData[key];
        }
    });
    
    const hasData = Object.keys(filteredData).length > 0;
    
    if (!hasData) {
        elements.noClientData.classList.remove('hidden');
        if (clientChart) {
            clientChart.destroy();
            clientChart = null;
        }
        return;
    }
    
    elements.noClientData.classList.add('hidden');
    
    const ctx = document.getElementById('clientChart').getContext('2d');
    const labels = Object.keys(filteredData);
    const values = Object.values(filteredData);
    
    if (clientChart) {
        clientChart.destroy();
    }
    
    if (clientChartType === 'pie') {
        const colors = generateColors(labels.length);
        
        clientChart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#ffffff',
                            padding: 15,
                            font: { size: 11 }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.9)',
                        padding: 12,
                        titleColor: '#ffffff',
                        bodyColor: '#ffffff',
                        borderColor: '#C41E3A',
                        borderWidth: 2,
                        titleFont: { size: 14, weight: 'bold' },
                        bodyFont: { size: 13 }
                    }
                }
            }
        });
    } else {
        clientChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Actions',
                    data: values,
                    backgroundColor: 'rgba(128, 128, 128, 0.8)',
                    borderColor: 'rgba(128, 128, 128, 1)',
                    borderWidth: 2,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.9)',
                        padding: 12,
                        titleColor: '#ffffff',
                        bodyColor: '#ffffff',
                        borderColor: '#C41E3A',
                        borderWidth: 2,
                        titleFont: { size: 14, weight: 'bold' },
                        bodyFont: { size: 13 }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: '#b3b3b3',
                            font: { size: 11 }
                        },
                        grid: {
                            color: 'rgba(196, 30, 58, 0.1)'
                        }
                    },
                    x: {
                        ticks: {
                            color: '#b3b3b3',
                            font: { size: 11 },
                            maxRotation: 45,
                            minRotation: 45
                        },
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
    }
}

// Generate colors for pie chart
function generateColors(count) {
    const baseColors = [
        { bg: 'rgba(196, 30, 58, 0.8)', border: 'rgba(196, 30, 58, 1)' },
        { bg: 'rgba(230, 57, 70, 0.8)', border: 'rgba(230, 57, 70, 1)' },
        { bg: 'rgba(139, 19, 41, 0.8)', border: 'rgba(139, 19, 41, 1)' },
        { bg: 'rgba(255, 69, 87, 0.8)', border: 'rgba(255, 69, 87, 1)' },
        { bg: 'rgba(128, 128, 128, 0.8)', border: 'rgba(128, 128, 128, 1)' },
        { bg: 'rgba(179, 179, 179, 0.8)', border: 'rgba(179, 179, 179, 1)' }
    ];
    
    const background = [];
    const border = [];
    
    for (let i = 0; i < count; i++) {
        const color = baseColors[i % baseColors.length];
        background.push(color.bg);
        border.push(color.border);
    }
    
    return { background, border };
}

// Update historical charts
async function updateHistoricalCharts() {
    await updateHistoryChart('30');
    await updateComparisonChart();
}

// Update history timeline chart
async function updateHistoryChart(period, customStart = null, customEnd = null) {
    const ctx = document.getElementById('historyChart');
    if (!ctx) return;
    
    const snapshots = await getAllSnapshots();
    const today = getTodayDate();
    
    let startDate = null;
    if (period === 'custom' && customStart && customEnd) {
        startDate = customStart;
    } else if (period !== 'all') {
        const days = parseInt(period);
        startDate = getDateNDaysAgo(days);
    }
    
    const filtered = snapshots
        .filter(s => !startDate || s.date >= startDate)
        .filter(s => period === 'custom' ? s.date <= customEnd : s.date <= today)
        .sort((a, b) => a.date.localeCompare(b.date));
    
    const labels = filtered.map(s => formatDate(s.date));
    const totalData = filtered.map(s => s.total_requests || 0);
    const backendData = filtered.map(s => 
        Object.values(s.backend || {}).reduce((sum, val) => sum + val, 0)
    );
    const clientData = filtered.map(s => 
        Object.values(s.client || {}).reduce((sum, val) => sum + val, 0)
    );
    
    if (historyChart) {
        historyChart.destroy();
    }
    
    historyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Total Requests',
                    data: totalData,
                    borderColor: 'rgba(196, 30, 58, 1)',
                    backgroundColor: 'rgba(196, 30, 58, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Backend',
                    data: backendData,
                    borderColor: 'rgba(230, 57, 70, 1)',
                    backgroundColor: 'rgba(230, 57, 70, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.4
                },
                {
                    label: 'Client',
                    data: clientData,
                    borderColor: 'rgba(179, 179, 179, 1)',
                    backgroundColor: 'rgba(179, 179, 179, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.4
                }
            ]
        },
        options: getChartOptions('Requests')
    });
}

// Update comparison chart
async function updateComparisonChart() {
    const ctx = document.getElementById('comparisonChart');
    if (!ctx) return;
    
    const snapshots = await getAllSnapshots();
    
    if (snapshots.length === 0) return;
    
    // Calculate totals
    const backendTotals = snapshots.map(s => 
        Object.values(s.backend || {}).reduce((sum, val) => sum + val, 0)
    );
    const clientTotals = snapshots.map(s => 
        Object.values(s.client || {}).reduce((sum, val) => sum + val, 0)
    );
    
    const backendAvg = Math.round(backendTotals.reduce((a, b) => a + b, 0) / backendTotals.length);
    const clientAvg = Math.round(clientTotals.reduce((a, b) => a + b, 0) / clientTotals.length);
    const backendPeak = Math.max(...backendTotals);
    const clientPeak = Math.max(...clientTotals);
    
    if (comparisonChart) {
        comparisonChart.destroy();
    }
    
    comparisonChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Average', 'Peak'],
            datasets: [
                {
                    label: 'Backend',
                    data: [backendAvg, backendPeak],
                    backgroundColor: 'rgba(196, 30, 58, 0.8)',
                    borderColor: 'rgba(196, 30, 58, 1)',
                    borderWidth: 2,
                    borderRadius: 6
                },
                {
                    label: 'Client',
                    data: [clientAvg, clientPeak],
                    backgroundColor: 'rgba(128, 128, 128, 0.8)',
                    borderColor: 'rgba(128, 128, 128, 1)',
                    borderWidth: 2,
                    borderRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    labels: {
                        color: '#ffffff',
                        font: { size: 12 },
                        padding: 15
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    padding: 12,
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    borderColor: '#C41E3A',
                    borderWidth: 2
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: '#b3b3b3',
                        font: { size: 11 }
                    },
                    grid: {
                        color: 'rgba(196, 30, 58, 0.1)'
                    }
                },
                x: {
                    ticks: {
                        color: '#b3b3b3',
                        font: { size: 12 }
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// Get chart options
function getChartOptions(label) {
    return {
        responsive: true,
        maintainAspectRatio: true,
        interaction: {
            mode: 'index',
            intersect: false
        },
        plugins: {
            legend: {
                labels: {
                    color: '#ffffff',
                    font: { size: 12 },
                    padding: 15
                }
            },
            tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.9)',
                padding: 12,
                titleColor: '#ffffff',
                bodyColor: '#ffffff',
                borderColor: '#C41E3A',
                borderWidth: 2,
                callbacks: {
                    label: function(context) {
                        return `${context.dataset.label}: ${context.parsed.y}`;
                    }
                }
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                ticks: {
                    color: '#b3b3b3',
                    font: { size: 11 },
                    precision: 0
                },
                grid: {
                    color: 'rgba(196, 30, 58, 0.1)'
                }
            },
            x: {
                ticks: {
                    color: '#b3b3b3',
                    font: { size: 10 },
                    maxRotation: 45,
                    minRotation: 45
                },
                grid: {
                    color: 'rgba(196, 30, 58, 0.05)'
                }
            }
        }
    };
}

// ==================== UTILITY FUNCTIONS ====================

// Animate number counting
function animateValue(element, endValue) {
    if (!element) return;
    
    const startValue = parseInt(element.textContent.replace(/,/g, '')) || 0;
    const duration = 1000;
    const startTime = performance.now();
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        const current = Math.floor(startValue + (endValue - startValue) * progress);
        element.textContent = current.toLocaleString();
        
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    
    requestAnimationFrame(update);
}

// Export data functionality
async function exportData() {
    const snapshots = await getAllSnapshots();
    
    const dataToExport = {
        snapshots: snapshots,
        exportDate: new Date().toISOString(),
        totalDays: snapshots.length
    };
    
    const dataStr = JSON.stringify(dataToExport, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `surely-analytics-${getTodayDate()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    console.log('Data exported successfully');
}

// Update last updated timestamp
function updateLastUpdated() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
    });
    elements.lastUpdated.textContent = timeString;
}

// Set status indicator
function setStatusOnline() {
    elements.statusIndicator.textContent = 'Online';
    elements.statusIndicator.className = 'stat-value status-online';
}

function setStatusOffline() {
    elements.statusIndicator.textContent = 'Offline';
    elements.statusIndicator.className = 'stat-value';
    elements.statusIndicator.style.color = '#ef4444';
}

// Show/hide loading spinner
function showLoading(show) {
    if (show) {
        elements.loadingSpinner.classList.remove('hidden');
        elements.refreshBtn.disabled = true;
    } else {
        elements.loadingSpinner.classList.add('hidden');
        elements.refreshBtn.disabled = false;
    }
}

// Show error message
function showError(message) {
    elements.errorMessage.textContent = message;
    elements.errorMessage.classList.remove('hidden');
}

// Hide error message
function hideError() {
    elements.errorMessage.classList.add('hidden');
}

// Start auto-refresh
function startAutoRefresh() {
    refreshTimer = setInterval(async () => {
        console.log('Auto-refreshing...');
        await fetchAnalytics();
    }, REFRESH_INTERVAL);
    
    console.log(`Auto-refresh enabled (every ${REFRESH_INTERVAL / 1000}s)`);
}

// Restart auto-refresh timer
function restartAutoRefresh() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
    }
    startAutoRefresh();
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', init);