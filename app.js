// Configuration
const API_URL = 'https://srv442638.hstgr.cloud/analytics/';
const REFRESH_INTERVAL = 60000; // 60 seconds

// Chart instances
let backendChart = null;
let clientChart = null;
let historyChart = null;
let comparisonChart = null;
let launchChart = null;
let adChart = null;

// Auto-refresh timer
let refreshTimer = null;

// Current client chart type
let clientChartType = 'pie';

// Store last fetched data for re-rendering
let lastClientData = {};

// Historical data structure - stores daily aggregated data
let dailyData = {
    // Format: 'YYYY-MM-DD': { total, backend, client, userLaunch, adMetrics: {}, timestamp }
};

// Real-time session data (for intra-day tracking)
let sessionData = {
    timestamps: [],
    totalRequests: [],
    backendRequests: [],
    clientRequests: []
};

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
    exportDataBtn: document.getElementById('exportDataBtn'),
    errorMessage: document.getElementById('errorMessage'),
    loadingSpinner: document.getElementById('loadingSpinner'),
    noClientData: document.getElementById('noClientData'),
    totalGrowth: document.getElementById('totalGrowth'),
    backendGrowth: document.getElementById('backendGrowth'),
    clientGrowth: document.getElementById('clientGrowth'),
    trendValue: document.getElementById('trendValue'),
    peakValue: document.getElementById('peakValue'),
    avgValue: document.getElementById('avgValue'),
    dataRange: document.getElementById('dataRange'),
    totalDaysTracked: document.getElementById('totalDaysTracked'),
    // User Launch elements
    todayLaunches: document.getElementById('todayLaunches'),
    yesterdayLaunches: document.getElementById('yesterdayLaunches'),
    weekAvgLaunches: document.getElementById('weekAvgLaunches'),
    monthTotalLaunches: document.getElementById('monthTotalLaunches'),
    // Ad metrics
    adCardsContainer: document.getElementById('adCardsContainer'),
    adMetricsSection: document.getElementById('adMetricsSection')
};

// Initialize dashboard
function init() {
    console.log('SURELY Analytics Dashboard initialized');
    
    // Load historical data
    loadDailyData();
    
    // Initialize growth badges as hidden initially
    updateGrowthBadges();
    
    // Fetch data immediately
    fetchAnalytics();
    
    // Set up auto-refresh
    startAutoRefresh();
    
    // Set up manual refresh button
    elements.refreshBtn.addEventListener('click', () => {
        fetchAnalytics();
        restartAutoRefresh();
    });
    
    // Set up export button
    elements.exportDataBtn.addEventListener('click', exportData);
    
    // Set up chart type toggle for client chart
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Remove active class from all buttons
            document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            
            // Add active class to clicked button
            this.classList.add('active');
            
            // Get chart type from button
            clientChartType = this.dataset.type;
            
            console.log('Switching to chart type:', clientChartType);
            
            // Re-render client chart with stored data
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
        updateLaunchChart(parseInt(e.target.value));
    });
    
    document.getElementById('adTimeRange')?.addEventListener('change', (e) => {
        updateAdChart(e.target.value === 'all' ? 'all' : parseInt(e.target.value));
    });
}

// Load daily aggregated data from localStorage
function loadDailyData() {
    const stored = localStorage.getItem('surelyDailyData');
    if (stored) {
        try {
            dailyData = JSON.parse(stored);
            console.log(`Loaded ${Object.keys(dailyData).length} days of historical data`);
        } catch (e) {
            console.warn('Failed to parse stored daily data');
            dailyData = {};
        }
    }
}

// Save daily data to localStorage
function saveDailyData() {
    try {
        localStorage.setItem('surelyDailyData', JSON.stringify(dailyData));
    } catch (e) {
        console.warn('Failed to save daily data');
    }
}

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

// Fetch analytics data from backend
async function fetchAnalytics() {
    showLoading(true);
    hideError();
    
    try {
        console.log('Fetching analytics from:', API_URL);
        
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
        console.log('Data received:', data);
        
        // Store both session and daily data
        storeSessionData(data);
        storeDailyData(data);
        
        updateDashboard(data);
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

// Store session data (intra-day tracking)
function storeSessionData(data) {
    const now = new Date();
    const { backend = {}, client = {}, total_requests = 0 } = data;
    
    const backendTotal = Object.values(backend).reduce((sum, val) => sum + val, 0);
    const clientTotal = Object.values(client).reduce((sum, val) => sum + val, 0);
    
    sessionData.timestamps.push(now.toISOString());
    sessionData.totalRequests.push(total_requests);
    sessionData.backendRequests.push(backendTotal);
    sessionData.clientRequests.push(clientTotal);
    
    // Keep only last 100 session points
    const maxPoints = 100;
    if (sessionData.timestamps.length > maxPoints) {
        sessionData.timestamps = sessionData.timestamps.slice(-maxPoints);
        sessionData.totalRequests = sessionData.totalRequests.slice(-maxPoints);
        sessionData.backendRequests = sessionData.backendRequests.slice(-maxPoints);
        sessionData.clientRequests = sessionData.clientRequests.slice(-maxPoints);
    }
}

// Store daily aggregated data
function storeDailyData(data) {
    const today = getTodayDate();
    const { backend = {}, client = {}, total_requests = 0 } = data;
    
    const backendTotal = Object.values(backend).reduce((sum, val) => sum + val, 0);
    const clientTotal = Object.values(client).reduce((sum, val) => sum + val, 0);
    
    // Extract user launch from client data (note: field has a space, not underscore)
    const userLaunch = client['user launch'] || 0;
    console.log('Extracting user launch:', userLaunch, 'from client data:', client);
    
    // Extract ad metrics (fields starting with 'ad')
    const adMetrics = {};
    Object.keys(client).forEach(key => {
        if (key.startsWith('ad')) {
            adMetrics[key] = client[key];
        }
    });
    
    // Update or create today's entry
    if (!dailyData[today]) {
        dailyData[today] = {
            total: total_requests,
            backend: backendTotal,
            client: clientTotal,
            userLaunch: userLaunch,
            adMetrics: adMetrics,
            timestamp: new Date().toISOString()
        };
        console.log('Created new daily entry for', today, ':', dailyData[today]);
    } else {
        // Update with latest values (taking the maximum to account for cumulative growth)
        dailyData[today].total = Math.max(dailyData[today].total, total_requests);
        dailyData[today].backend = Math.max(dailyData[today].backend, backendTotal);
        dailyData[today].client = Math.max(dailyData[today].client, clientTotal);
        dailyData[today].userLaunch = Math.max(dailyData[today].userLaunch, userLaunch);
        
        // Update ad metrics
        Object.keys(adMetrics).forEach(key => {
            if (!dailyData[today].adMetrics[key]) {
                dailyData[today].adMetrics[key] = 0;
            }
            dailyData[today].adMetrics[key] = Math.max(dailyData[today].adMetrics[key], adMetrics[key]);
        });
        
        dailyData[today].timestamp = new Date().toISOString();
        console.log('Updated daily entry for', today, ':', dailyData[today]);
    }
    
    saveDailyData();
    
    // Update data range display
    const dates = Object.keys(dailyData).sort();
    if (dates.length > 0) {
        elements.dataRange.textContent = `${dates[0]} to ${dates[dates.length - 1]}`;
        elements.totalDaysTracked.textContent = dates.length;
    }
}

// Update all dashboard components
function updateDashboard(data) {
    updateCards(data);
    updateCharts(data);
    updateGrowthMetrics();
    updateHistoricalCharts();
    updateUserLaunchMetrics();
    updateAdMetrics();
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
    
    // Store client data for chart type toggling
    lastClientData = client;
    
    updateBackendChart(backend);
    updateClientChart(client);
}

// Update growth badges
function updateGrowthBadges() {
    const dates = Object.keys(dailyData).sort();
    
    console.log('Updating growth badges. Available dates:', dates.length);
    
    if (dates.length < 2) {
        // Hide all growth badges if we don't have at least 2 days of data
        console.log('Hiding growth badges - insufficient data (need 2 days, have', dates.length, ')');
        elements.totalGrowth.classList.add('hidden-badge');
        elements.backendGrowth.classList.add('hidden-badge');
        elements.clientGrowth.classList.add('hidden-badge');
        return;
    }
    
    const today = dates[dates.length - 1];
    const yesterday = dates[dates.length - 2];
    
    const todayData = dailyData[today];
    const yesterdayData = dailyData[yesterday];
    
    console.log('Comparing', yesterday, 'to', today);
    console.log('Yesterday:', yesterdayData);
    console.log('Today:', todayData);
    
    updateGrowthBadge(elements.totalGrowth, yesterdayData.total, todayData.total, 'Total');
    updateGrowthBadge(elements.backendGrowth, yesterdayData.backend, todayData.backend, 'Backend');
    updateGrowthBadge(elements.clientGrowth, yesterdayData.client, todayData.client, 'Client');
}

function updateGrowthBadge(element, prev, curr, label) {
    const change = curr - prev;
    
    console.log(`${label} growth: ${prev} -> ${curr} = ${change}`);
    
    if (change > 0) {
        element.textContent = `+${change}`;
        element.classList.remove('negative', 'hidden-badge');
        element.classList.add('positive');
        console.log(`${label} badge: showing +${change}`);
    } else if (change < 0) {
        element.textContent = `${change}`;
        element.classList.remove('positive', 'hidden-badge');
        element.classList.add('negative');
        console.log(`${label} badge: showing ${change}`);
    } else {
        // No change - hide the badge completely
        element.classList.add('hidden-badge');
        element.classList.remove('positive', 'negative');
        console.log(`${label} badge: hiding (no change)`);
    }
}

// Update growth metrics section
function updateGrowthMetrics() {
    const dates = Object.keys(dailyData).sort();
    
    if (dates.length === 0) {
        elements.trendValue.textContent = 'No data yet';
        elements.peakValue.textContent = '—';
        elements.avgValue.textContent = '—';
        return;
    }
    
    // Calculate trend (last 7 days)
    const recentDates = dates.slice(-7);
    if (recentDates.length >= 2) {
        const first = dailyData[recentDates[0]].total;
        const last = dailyData[recentDates[recentDates.length - 1]].total;
        const trend = last > first ? 'Growing' : last < first ? 'Declining' : 'Stable';
        elements.trendValue.textContent = trend;
    }
    
    // Calculate peak
    const peak = Math.max(...dates.map(date => dailyData[date].total));
    elements.peakValue.textContent = peak.toLocaleString();
    
    // Calculate average
    const sum = dates.reduce((acc, date) => acc + dailyData[date].total, 0);
    const avg = Math.round(sum / dates.length);
    elements.avgValue.textContent = avg.toLocaleString();
}

// Update user launch metrics
function updateUserLaunchMetrics() {
    const dates = Object.keys(dailyData).sort();
    const today = getTodayDate();
    const yesterday = getDateNDaysAgo(1);
    
    console.log('Updating user launch metrics. Dates available:', dates.length);
    console.log('Today:', today, 'Data:', dailyData[today]);
    
    // Today's launches
    const todayLaunches = (dailyData[today] && dailyData[today].userLaunch) ? dailyData[today].userLaunch : 0;
    console.log('Today launches:', todayLaunches);
    animateValue(elements.todayLaunches, todayLaunches);
    
    // Yesterday's launches
    const yesterdayLaunches = (dailyData[yesterday] && dailyData[yesterday].userLaunch) ? dailyData[yesterday].userLaunch : 0;
    console.log('Yesterday launches:', yesterdayLaunches);
    animateValue(elements.yesterdayLaunches, yesterdayLaunches);
    
    // 7-day average
    const last7Days = dates.slice(-7);
    const weekTotal = last7Days.reduce((sum, date) => {
        const launches = (dailyData[date] && dailyData[date].userLaunch) ? dailyData[date].userLaunch : 0;
        return sum + launches;
    }, 0);
    const weekAvg = last7Days.length > 0 ? Math.round(weekTotal / last7Days.length) : 0;
    console.log('7-day avg:', weekAvg);
    animateValue(elements.weekAvgLaunches, weekAvg);
    
    // 30-day total
    const last30Days = dates.slice(-30);
    const monthTotal = last30Days.reduce((sum, date) => {
        const launches = (dailyData[date] && dailyData[date].userLaunch) ? dailyData[date].userLaunch : 0;
        return sum + launches;
    }, 0);
    console.log('30-day total:', monthTotal);
    animateValue(elements.monthTotalLaunches, monthTotal);
    
    // Update launch chart
    updateLaunchChart(30);
}

// Update launch chart
function updateLaunchChart(days) {
    const ctx = document.getElementById('launchChart');
    if (!ctx) return;
    
    const dates = Object.keys(dailyData).sort();
    let dataToShow = [];
    
    if (days === 'all' || days === null) {
        dataToShow = dates;
    } else {
        dataToShow = dates.slice(-days);
    }
    
    console.log('Updating launch chart with', dataToShow.length, 'days of data');
    
    const labels = dataToShow.map(date => {
        const d = new Date(date);
        return `${d.getMonth() + 1}/${d.getDate()}`;
    });
    
    const launchData = dataToShow.map(date => {
        const launches = (dailyData[date] && dailyData[date].userLaunch) ? dailyData[date].userLaunch : 0;
        return launches;
    });
    
    console.log('Launch chart data:', launchData);
    
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
        options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: {
                mode: 'index',
                intersect: false
            },
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
                    callbacks: {
                        label: function(context) {
                            return `Launches: ${context.parsed.y}`;
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
        }
    });
}

// Update ad metrics
function updateAdMetrics() {
    const dates = Object.keys(dailyData).sort();
    if (dates.length === 0) return;
    
    const today = getTodayDate();
    const todayData = dailyData[today];
    
    if (!todayData || Object.keys(todayData.adMetrics).length === 0) {
        elements.adMetricsSection.style.display = 'none';
        return;
    }
    
    elements.adMetricsSection.style.display = 'block';
    
    // Clear existing ad cards
    elements.adCardsContainer.innerHTML = '';
    
    // Create cards for each ad metric
    Object.entries(todayData.adMetrics).forEach(([key, value]) => {
        const card = document.createElement('div');
        card.className = 'card';
        
        const displayName = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        
        card.innerHTML = `
            <div class="card-header">
                <h3>${displayName}</h3>
            </div>
            <p class="card-value">${value.toLocaleString()}</p>
            <div class="card-footer">Total interactions</div>
        `;
        
        elements.adCardsContainer.appendChild(card);
    });
    
    // Update ad chart
    updateAdChart(30);
}

// Update ad chart
function updateAdChart(days) {
    const ctx = document.getElementById('adChart');
    if (!ctx) return;
    
    const dates = Object.keys(dailyData).sort();
    let dataToShow = [];
    
    if (days === 'all') {
        dataToShow = dates;
    } else {
        dataToShow = dates.slice(-days);
    }
    
    // Collect all unique ad metrics
    const allAdMetrics = new Set();
    dataToShow.forEach(date => {
        if (dailyData[date].adMetrics) {
            Object.keys(dailyData[date].adMetrics).forEach(key => allAdMetrics.add(key));
        }
    });
    
    if (allAdMetrics.size === 0) return;
    
    const labels = dataToShow.map(date => {
        const d = new Date(date);
        return `${d.getMonth() + 1}/${d.getDate()}`;
    });
    
    const datasets = Array.from(allAdMetrics).map((metric, index) => {
        const colors = [
            { border: 'rgba(196, 30, 58, 1)', bg: 'rgba(196, 30, 58, 0.1)' },
            { border: 'rgba(230, 57, 70, 1)', bg: 'rgba(230, 57, 70, 0.1)' },
            { border: 'rgba(139, 19, 41, 1)', bg: 'rgba(139, 19, 41, 0.1)' },
            { border: 'rgba(255, 69, 87, 1)', bg: 'rgba(255, 69, 87, 0.1)' }
        ];
        
        const color = colors[index % colors.length];
        const displayName = metric.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        
        return {
            label: displayName,
            data: dataToShow.map(date => dailyData[date].adMetrics?.[metric] || 0),
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
                        font: { size: 11 },
                        padding: 10
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
        }
    });
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

// Update client chart (with toggle between pie and bar)
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
    
    if (clientChart) {
        clientChart.destroy();
    }
    
    if (clientChartType === 'pie') {
        // Generate colors
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
        // Bar chart
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
function updateHistoricalCharts() {
    updateHistoryChart('30d');
    updateComparisonChart();
}

// Update history timeline chart
function updateHistoryChart(period, customStart = null, customEnd = null) {
    const ctx = document.getElementById('historyChart');
    if (!ctx) return;
    
    const dates = Object.keys(dailyData).sort();
    let dataToShow = [];
    
    if (period === 'custom' && customStart && customEnd) {
        dataToShow = dates.filter(date => date >= customStart && date <= customEnd);
    } else if (period === 'all') {
        dataToShow = dates;
    } else if (period === '24h') {
        // Use session data for 24h view
        updateSessionHistoryChart();
        return;
    } else {
        const daysMap = { '7d': 7, '30d': 30, '90d': 90 };
        const days = daysMap[period] || 30;
        dataToShow = dates.slice(-days);
    }
    
    const labels = dataToShow.map(date => {
        const d = new Date(date);
        return `${d.getMonth() + 1}/${d.getDate()}`;
    });
    
    const totalData = dataToShow.map(date => dailyData[date].total);
    const backendData = dataToShow.map(date => dailyData[date].backend);
    const clientData = dataToShow.map(date => dailyData[date].client);
    
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

// Update session history chart (for 24h view)
function updateSessionHistoryChart() {
    const ctx = document.getElementById('historyChart');
    if (!ctx) return;
    
    const labels = sessionData.timestamps.map(ts => {
        const date = new Date(ts);
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    });
    
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
                    data: sessionData.totalRequests,
                    borderColor: 'rgba(196, 30, 58, 1)',
                    backgroundColor: 'rgba(196, 30, 58, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Backend',
                    data: sessionData.backendRequests,
                    borderColor: 'rgba(230, 57, 70, 1)',
                    backgroundColor: 'rgba(230, 57, 70, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.4
                },
                {
                    label: 'Client',
                    data: sessionData.clientRequests,
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
    const ctx = document.getElementById('comparisonChart');
    if (!ctx) return;
    
    const dates = Object.keys(dailyData).sort();
    if (dates.length === 0) return;
    
    // Calculate averages and peaks from daily data
    const backendAvg = dates.reduce((sum, date) => sum + dailyData[date].backend, 0) / dates.length;
    const clientAvg = dates.reduce((sum, date) => sum + dailyData[date].client, 0) / dates.length;
    const backendPeak = Math.max(...dates.map(date => dailyData[date].backend));
    const clientPeak = Math.max(...dates.map(date => dailyData[date].client));
    
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
                    data: [Math.round(backendAvg), backendPeak],
                    backgroundColor: 'rgba(196, 30, 58, 0.8)',
                    borderColor: 'rgba(196, 30, 58, 1)',
                    borderWidth: 2,
                    borderRadius: 6
                },
                {
                    label: 'Client',
                    data: [Math.round(clientAvg), clientPeak],
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

// Export data functionality
function exportData() {
    const dataToExport = {
        dailyData: dailyData,
        sessionData: sessionData,
        exportDate: new Date().toISOString(),
        totalDays: Object.keys(dailyData).length
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
    refreshTimer = setInterval(() => {
        console.log('Auto-refreshing...');
        fetchAnalytics();
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