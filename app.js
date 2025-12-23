// Configuration
const API_URL = 'https://srv442638.hstgr.cloud/analytics/';
const REFRESH_INTERVAL = 60000; // 60 seconds

// Chart instances
let backendChart = null;
let clientChart = null;
let historyChart = null;
let comparisonChart = null;

// Auto-refresh timer
let refreshTimer = null;

// Historical data storage
let historicalData = {
    timestamps: [],
    totalRequests: [],
    backendRequests: [],
    clientRequests: []
};

// Load historical data from localStorage
function loadHistoricalData() {
    const stored = localStorage.getItem('surelyAnalyticsHistory');
    if (stored) {
        try {
            historicalData = JSON.parse(stored);
        } catch (e) {
            console.warn('Failed to parse stored data');
        }
    }
}

// Save historical data to localStorage
function saveHistoricalData() {
    try {
        localStorage.setItem('surelyAnalyticsHistory', JSON.stringify(historicalData));
    } catch (e) {
        console.warn('Failed to save historical data');
    }
}

// DOM Elements
const elements = {
    totalRequests: document.getElementById('totalRequests'),
    backendRequests: document.getElementById('backendRequests'),
    clientRequests: document.getElementById('clientRequests'),
    topEndpoint: document.getElementById('topEndpoint'),
    topEndpointCount: document.getElementById('topEndpointCount'),
    lastUpdated: document.getElementById('lastUpdated'),
    statusIndicator: document.getElementById('statusIndicator'),
    refreshBtn: document.getElementById('refreshBtn'),
    errorMessage: document.getElementById('errorMessage'),
    loadingSpinner: document.getElementById('loadingSpinner'),
    noClientData: document.getElementById('noClientData'),
    totalGrowth: document.getElementById('totalGrowth'),
    backendGrowth: document.getElementById('backendGrowth'),
    clientGrowth: document.getElementById('clientGrowth'),
    trendValue: document.getElementById('trendValue'),
    peakValue: document.getElementById('peakValue'),
    avgValue: document.getElementById('avgValue')
};

// Initialize dashboard
function init() {
    console.log('🚀 SURELY Analytics Dashboard initialized');
    
    // Load historical data
    loadHistoricalData();
    
    // Fetch data immediately
    fetchAnalytics();
    
    // Set up auto-refresh
    startAutoRefresh();
    
    // Set up manual refresh button
    elements.refreshBtn.addEventListener('click', () => {
        fetchAnalytics();
        restartAutoRefresh();
    });
    
    // Set up time filter buttons
    document.querySelectorAll('.time-filter').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.time-filter').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            updateHistoryChart(e.target.dataset.period);
        });
    });
}

// Fetch analytics data from backend
async function fetchAnalytics() {
    showLoading(true);
    hideError();
    
    try {
        console.log('📡 Fetching analytics from:', API_URL);
        
        const response = await fetch(API_URL, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('✅ Data received:', data);
        
        // Store historical data
        storeHistoricalDataPoint(data);
        
        updateDashboard(data);
        updateLastUpdated();
        setStatusOnline();
        
    } catch (error) {
        console.error('❌ Error fetching analytics:', error);
        showError(`Failed to fetch analytics: ${error.message}`);
        setStatusOffline();
    } finally {
        showLoading(false);
    }
}

// Store a data point in historical records
function storeHistoricalDataPoint(data) {
    const now = new Date();
    const { backend = {}, client = {}, total_requests = 0 } = data;
    
    const backendTotal = Object.values(backend).reduce((sum, val) => sum + val, 0);
    const clientTotal = Object.values(client).reduce((sum, val) => sum + val, 0);
    
    historicalData.timestamps.push(now.toISOString());
    historicalData.totalRequests.push(total_requests);
    historicalData.backendRequests.push(backendTotal);
    historicalData.clientRequests.push(clientTotal);
    
    // Keep only last 100 data points to avoid storage issues
    const maxPoints = 100;
    if (historicalData.timestamps.length > maxPoints) {
        historicalData.timestamps = historicalData.timestamps.slice(-maxPoints);
        historicalData.totalRequests = historicalData.totalRequests.slice(-maxPoints);
        historicalData.backendRequests = historicalData.backendRequests.slice(-maxPoints);
        historicalData.clientRequests = historicalData.clientRequests.slice(-maxPoints);
    }
    
    saveHistoricalData();
}

// Update all dashboard components
function updateDashboard(data) {
    updateCards(data);
    updateCharts(data);
    updateGrowthMetrics();
    updateHistoricalCharts();
}

// Update overview cards
function updateCards(data) {
    const { backend = {}, client = {}, total_requests = 0 } = data;
    
    // Calculate totals
    const backendTotal = Object.values(backend).reduce((sum, val) => sum + val, 0);
    const clientTotal = Object.values(client).reduce((sum, val) => sum + val, 0);
    
    // Find top endpoint
    const allEndpoints = { ...backend, ...client };
    const topEndpoint = Object.entries(allEndpoints).sort((a, b) => b[1] - a[1])[0];
    
    // Update card values with animation
    animateValue(elements.totalRequests, total_requests);
    animateValue(elements.backendRequests, backendTotal);
    animateValue(elements.clientRequests, clientTotal);
    
    if (topEndpoint) {
        elements.topEndpoint.textContent = topEndpoint[0];
        elements.topEndpointCount.textContent = `${topEndpoint[1].toLocaleString()} requests`;
    } else {
        elements.topEndpoint.textContent = '—';
        elements.topEndpointCount.textContent = '0 requests';
    }
    
    // Calculate and display growth
    updateGrowthBadges();
}

// Animate number counting
function animateValue(element, endValue) {
    const startValue = parseInt(element.textContent) || 0;
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

// Update charts
function updateCharts(data) {
    const { backend = {}, client = {} } = data;
    
    updateBackendChart(backend);
    updateClientChart(client);
}

// Update growth badges
function updateGrowthBadges() {
    if (historicalData.totalRequests.length < 2) {
        elements.totalGrowth.textContent = '—';
        elements.backendGrowth.textContent = '—';
        elements.clientGrowth.textContent = '—';
        return;
    }
    
    const len = historicalData.totalRequests.length;
    const prevTotal = historicalData.totalRequests[len - 2];
    const currTotal = historicalData.totalRequests[len - 1];
    const prevBackend = historicalData.backendRequests[len - 2];
    const currBackend = historicalData.backendRequests[len - 1];
    const prevClient = historicalData.clientRequests[len - 2];
    const currClient = historicalData.clientRequests[len - 1];
    
    updateGrowthBadge(elements.totalGrowth, prevTotal, currTotal);
    updateGrowthBadge(elements.backendGrowth, prevBackend, currBackend);
    updateGrowthBadge(elements.clientGrowth, prevClient, currClient);
}

function updateGrowthBadge(element, prev, curr) {
    const change = curr - prev;
    const percent = prev > 0 ? ((change / prev) * 100).toFixed(1) : 0;
    
    if (change > 0) {
        element.textContent = `+${change}`;
        element.classList.remove('negative');
    } else if (change < 0) {
        element.textContent = `${change}`;
        element.classList.add('negative');
    } else {
        element.textContent = '—';
        element.classList.remove('negative');
    }
}

// Update growth metrics section
function updateGrowthMetrics() {
    if (historicalData.totalRequests.length === 0) {
        elements.trendValue.textContent = 'No data yet';
        elements.peakValue.textContent = '—';
        elements.avgValue.textContent = '—';
        return;
    }
    
    // Calculate trend
    const recentData = historicalData.totalRequests.slice(-10);
    if (recentData.length >= 2) {
        const first = recentData[0];
        const last = recentData[recentData.length - 1];
        const trend = last > first ? 'Growing ↗' : last < first ? 'Declining ↘' : 'Stable →';
        elements.trendValue.textContent = trend;
    }
    
    // Calculate peak
    const peak = Math.max(...historicalData.totalRequests);
    elements.peakValue.textContent = peak.toLocaleString();
    
    // Calculate average
    const sum = historicalData.totalRequests.reduce((a, b) => a + b, 0);
    const avg = Math.round(sum / historicalData.totalRequests.length);
    elements.avgValue.textContent = avg.toLocaleString();
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
    const hasData = Object.keys(clientData).length > 0;
    
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
    
    const labels = Object.keys(clientData);
    const values = Object.values(clientData);
    
    // Generate colors
    const colors = generateColors(labels.length);
    
    if (clientChart) {
        clientChart.destroy();
    }
    
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
function updateHistoricalCharts() {
    updateHistoryChart('all');
    updateComparisonChart();
}

// Update history timeline chart
function updateHistoryChart(period = 'all') {
    if (historicalData.timestamps.length === 0) return;
    
    const ctx = document.getElementById('historyChart');
    if (!ctx) return;
    
    let dataToShow = { timestamps: [], total: [], backend: [], client: [] };
    
    // Filter data based on period
    const now = new Date();
    historicalData.timestamps.forEach((timestamp, index) => {
        const date = new Date(timestamp);
        let include = false;
        
        if (period === 'all') {
            include = true;
        } else if (period === 'hour') {
            include = (now - date) <= 3600000; // 1 hour
        } else if (period === 'day') {
            include = (now - date) <= 86400000; // 24 hours
        }
        
        if (include) {
            dataToShow.timestamps.push(date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
            dataToShow.total.push(historicalData.totalRequests[index]);
            dataToShow.backend.push(historicalData.backendRequests[index]);
            dataToShow.client.push(historicalData.clientRequests[index]);
        }
    });
    
    if (historyChart) {
        historyChart.destroy();
    }
    
    historyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dataToShow.timestamps,
            datasets: [
                {
                    label: 'Total Requests',
                    data: dataToShow.total,
                    borderColor: 'rgba(196, 30, 58, 1)',
                    backgroundColor: 'rgba(196, 30, 58, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Backend',
                    data: dataToShow.backend,
                    borderColor: 'rgba(230, 57, 70, 1)',
                    backgroundColor: 'rgba(230, 57, 70, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.4
                },
                {
                    label: 'Client',
                    data: dataToShow.client,
                    borderColor: 'rgba(179, 179, 179, 1)',
                    backgroundColor: 'rgba(179, 179, 179, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.4
                }
            ]
        },
        options: {
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
                        font: { size: 10 },
                        maxRotation: 45,
                        minRotation: 45
                    },
                    grid: {
                        color: 'rgba(196, 30, 58, 0.05)'
                    }
                }
            }
        }
    });
}

// Update comparison chart
function updateComparisonChart() {
    if (historicalData.timestamps.length === 0) return;
    
    const ctx = document.getElementById('comparisonChart');
    if (!ctx) return;
    
    // Get average values per hour for better comparison
    const avgBackend = historicalData.backendRequests.reduce((a, b) => a + b, 0) / historicalData.backendRequests.length;
    const avgClient = historicalData.clientRequests.reduce((a, b) => a + b, 0) / historicalData.clientRequests.length;
    const maxBackend = Math.max(...historicalData.backendRequests);
    const maxClient = Math.max(...historicalData.clientRequests);
    
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
                    data: [Math.round(avgBackend), maxBackend],
                    backgroundColor: 'rgba(196, 30, 58, 0.8)',
                    borderColor: 'rgba(196, 30, 58, 1)',
                    borderWidth: 2,
                    borderRadius: 6
                },
                {
                    label: 'Client',
                    data: [Math.round(avgClient), maxClient],
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
    elements.statusIndicator.textContent = '● Online';
    elements.statusIndicator.className = 'stat-value status-online';
}

function setStatusOffline() {
    elements.statusIndicator.textContent = '● Offline';
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
    refreshTimer = setInterval(() => {
        console.log('⏰ Auto-refreshing...');
        fetchAnalytics();
    }, REFRESH_INTERVAL);
    
    console.log(`⏱️ Auto-refresh enabled (every ${REFRESH_INTERVAL / 1000}s)`);
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
