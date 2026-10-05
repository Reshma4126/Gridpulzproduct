/**
 * Grid Management Dashboard JavaScript
 * Handles real-time grid analytics, demand spikes, and load balancing visualization
 */

// Backend URL configured in api-config.js

// Global error handler
window.onerror = function(message, source, lineno, colno, error) {
    console.error('Global error:', {
        message: message,
        source: source,
        line: lineno,
        column: colno,
        error: error
    });
};

// Handle logout function
function handleLogout() {
    localStorage.removeItem('gridpulz_operator_email');
    window.location.href = 'index.html';
}

// Global variables
let stationChart = null;
let spikeChart = null;
let comparisonChart = null;
let historyChart = null;
let updateInterval = null;
let currentData = null;

// Initialize dashboard
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Grid Management Dashboard initializing...');
    
    try {
        initializeTabs();
        console.log('Tabs initialized');
        
        initializeCharts();
        console.log('Charts initialized');
        
        // Start the new real-time updates system
        startRealTimeUpdates();
        console.log('Real-time updates started');
    } catch (error) {
        console.error('Error during dashboard initialization:', error);
    }
});

// Tab navigation
function initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;
            
            // Update button states
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Update content visibility
            tabContents.forEach(content => {
                content.classList.add('hidden');
            });

            const targetContent = document.getElementById(`tab-${targetTab}`);
            if (targetContent) {
                targetContent.classList.remove('hidden');

                // Load specific tab data
                if (targetTab === 'comparison') {
                    loadComparisonData();
                }
            }
        });
    });
}

// Initialize all charts
function initializeCharts() {
    // Check if Chart.js is loaded
    if (typeof Chart === 'undefined') {
        console.error('Chart.js is not loaded. Waiting for library...');
        setTimeout(initializeCharts, 500);
        return;
    }
    
    console.log('Chart.js loaded, initializing charts...');
    
    // Station Utilization Chart
    const stationCanvas = document.getElementById('station-chart');
    if (!stationCanvas) {
        console.error('Station chart canvas not found');
        return;
    }
    const stationCtx = stationCanvas.getContext('2d');
    if (!stationCtx) {
        console.error('Failed to get station chart context');
        return;
    }
    stationChart = new Chart(stationCtx, {
        type: 'bar',
        data: {
            labels: ['STATION_01', 'STATION_02', 'STATION_03'],
            datasets: [
                {
                    label: 'Power (kW)',
                    data: [0, 0, 0],
                    backgroundColor: '#CCFF00',
                    borderColor: '#CCFF00',
                    borderWidth: 1,
                    yAxisID: 'y'
                },
                {
                    label: 'Utilization %',
                    data: [0, 0, 0],
                    type: 'line',
                    borderColor: '#FF4444',
                    backgroundColor: 'rgba(255, 68, 68, 0.1)',
                    borderWidth: 2,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            scales: {
                x: {
                    grid: { color: '#353535' },
                    ticks: { color: '#aaaaaa' }
                },
                y: {
                    type: 'linear',
                    position: 'left',
                    grid: { color: '#353535' },
                    ticks: { color: '#aaaaaa' },
                    title: {
                        display: true,
                        text: 'Power (kW)',
                        color: '#aaaaaa'
                    }
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#aaaaaa' },
                    title: {
                        display: true,
                        text: 'Utilization %',
                        color: '#aaaaaa'
                    },
                    max: 100
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#aaaaaa' }
                },
                tooltip: {
                    backgroundColor: '#1b1b1b',
                    borderColor: '#353535',
                    titleColor: '#ffffff',
                    bodyColor: '#CCFF00'
                }
            }
        }
    });

    // Demand Spikes Chart
    const spikeCanvas = document.getElementById('spike-chart');
    if (!spikeCanvas) {
        console.error('Spike chart canvas not found');
        return;
    }
    const spikeCtx = spikeCanvas.getContext('2d');
    if (!spikeCtx) {
        console.error('Failed to get spike chart context');
        return;
    }
    spikeChart = new Chart(spikeCtx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Power Increase %',
                data: [],
                backgroundColor: '#FF6B6B',
                borderColor: '#FF6B6B',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { color: '#353535' },
                    ticks: { color: '#aaaaaa' }
                },
                y: {
                    grid: { color: '#353535' },
                    ticks: { color: '#aaaaaa' },
                    title: {
                        display: true,
                        text: 'Power Increase %',
                        color: '#aaaaaa'
                    }
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#aaaaaa' }
                },
                tooltip: {
                    backgroundColor: '#1b1b1b',
                    borderColor: '#353535',
                    titleColor: '#ffffff',
                    bodyColor: '#FF6B6B'
                }
            }
        }
    });

    // Comparison Chart
    const comparisonCanvas = document.getElementById('comparison-chart');
    if (!comparisonCanvas) {
        console.error('Comparison chart canvas not found');
        return;
    }
    const comparisonCtx = comparisonCanvas.getContext('2d');
    if (!comparisonCtx) {
        console.error('Failed to get comparison chart context');
        return;
    }
    comparisonChart = new Chart(comparisonCtx, {
        type: 'bar',
        data: {
            labels: ['WITHOUT GridPulz', 'WITH GridPulz'],
            datasets: [
                {
                    label: 'Station 1',
                    data: [145, 100],
                    backgroundColor: '#FF6B6B',
                    stack: 'Stack 0'
                },
                {
                    label: 'Station 2',
                    data: [40, 55],
                    backgroundColor: '#CCFF00',
                    stack: 'Stack 0'
                },
                {
                    label: 'Station 3',
                    data: [35, 30],
                    backgroundColor: '#4B9EFF',
                    stack: 'Stack 0'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { color: '#353535' },
                    ticks: { color: '#aaaaaa' }
                },
                y: {
                    grid: { color: '#353535' },
                    ticks: { color: '#aaaaaa' },
                    title: {
                        display: true,
                        text: 'Load (kW)',
                        color: '#aaaaaa'
                    }
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#aaaaaa' }
                },
                tooltip: {
                    backgroundColor: '#1b1b1b',
                    borderColor: '#353535',
                    titleColor: '#ffffff',
                    bodyColor: '#CCFF00'
                }
            }
        }
    });

    // History Chart
    const historyCanvas = document.getElementById('history-chart');
    if (!historyCanvas) {
        console.error('History chart canvas not found');
        return;
    }
    const historyCtx = historyCanvas.getContext('2d');
    if (!historyCtx) {
        console.error('Failed to get history chart context');
        return;
    }
    historyChart = new Chart(historyCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'WITH GridPulz (Actual)',
                    data: [],
                    borderColor: '#CCFF00',
                    backgroundColor: 'rgba(204, 255, 0, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'WITHOUT GridPulz (Hypothetical)',
                    data: [],
                    borderColor: '#FF4444',
                    backgroundColor: 'rgba(255, 68, 68, 0.1)',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { color: '#353535' },
                    ticks: { color: '#aaaaaa' }
                },
                y: {
                    grid: { color: '#353535' },
                    ticks: { color: '#aaaaaa' },
                    title: {
                        display: true,
                        text: 'Load (kW)',
                        color: '#aaaaaa'
                    }
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#aaaaaa' }
                },
                tooltip: {
                    backgroundColor: '#1b1b1b',
                    borderColor: '#353535',
                    titleColor: '#ffffff',
                    bodyColor: '#CCFF00'
                }
            }
        }
    });
}

// ============================================
// DYNAMIC REAL-TIME UPDATES
// ============================================

// Step 1: Create function to fetch station data
async function fetchStationData() {
    try {
        console.log('=== FETCHING GRID DATA ===');
        const url = `${BACKEND_BASE_URL}/api/grid/load-analysis`;
        console.log('URL:', url);
        
        const response = await fetch(url);
        
        if (!response.ok) {
            console.error('Failed to fetch grid data:', response.status, response.statusText);
            return;
        }
        
        const data = await response.json();
        console.log("=== RAW API RESPONSE ===");
        console.log("Full response:", data);
        console.log("Stations:", data.stations);
        console.log("Grid state:", data.grid_state);
        
        // Update dashboard with the new data structure from /api/grid/load-analysis
        updateDashboardFromGridAnalytics(data);
        
    } catch (error) {
        console.error('Error fetching station data:', error);
    }
}

// Update dashboard from the /api/grid/load-analysis endpoint
function updateDashboardFromGridAnalytics(gridData) {
    console.log('=== UPDATING DASHBOARD FROM GRID ANALYTICS ===');
    
    if (!gridData || !gridData.stations || !gridData.grid_state) {
        console.error('Invalid grid data structure:', gridData);
        return;
    }
    
    const { stations, grid_state } = gridData;
    
    // Update grid-level metrics
    console.log('Grid state:', grid_state);
    
    // Update total grid load
    const totalLoadEl = document.getElementById('total-grid-load');
    if (totalLoadEl) {
        totalLoadEl.textContent = `${grid_state.total_grid_load_kw.toFixed(1)} kW`;
        console.log('Updated total grid load:', grid_state.total_grid_load_kw);
    }
    
    // Update grid utilization
    const utilizationEl = document.getElementById('grid-utilization');
    if (utilizationEl) {
        utilizationEl.textContent = `${grid_state.load_percentage.toFixed(1)}%`;
        console.log('Updated grid utilization:', grid_state.load_percentage);
    }
    
    // Update active stations
    const activeStationsEl = document.getElementById('active-stations');
    if (activeStationsEl) {
        const activeCount = stations.filter(s => s.total_power > 0).length;
        activeStationsEl.textContent = `${activeCount}/3`;
        console.log('Updated active stations:', activeCount);
    }
    
    // Update individual station cards
    stations.forEach(station => {
        updateStationCardFromGridData(station);
    });
}

// Update station card from grid analytics data
function updateStationCardFromGridData(station) {
    const { station_id, total_power, utilization_percentage, occupied_slots, available_slots } = station;
    console.log(`Updating card for ${station_id}:`, { total_power, utilization_percentage, occupied_slots, available_slots });
    
    // Extract station number correctly (e.g., STATION_01 -> 01, not 001)
    const stationNum = station_id.replace('STATION_', '');  // STATION_01 -> 01
    const loadId = `station-${stationNum}-load`;
    const utilizationId = `station-${stationNum}-utilization`;
    const occupiedId = `station-${stationNum}-occupied`;
    const availableId = `station-${stationNum}-available`;
    
    // Update power display
    const powerEl = document.getElementById(loadId);
    if (powerEl) {
        powerEl.textContent = `${total_power.toFixed(1)} kW`;
        console.log(`Updated power for ${station_id}:`, total_power, `(ID: ${loadId})`);
    } else {
        console.warn(`Power element not found for ${station_id} (ID: ${loadId})`);
    }
    
    // Update utilization display
    const utilizationEl = document.getElementById(utilizationId);
    if (utilizationEl) {
        utilizationEl.textContent = `${utilization_percentage.toFixed(1)}%`;
        console.log(`Updated utilization for ${station_id}:`, utilization_percentage);
    }
    
    // Update occupied/available slots
    const occupiedEl = document.getElementById(occupiedId);
    const availableEl = document.getElementById(availableId);
    
    if (occupiedEl) {
        occupiedEl.textContent = `${occupied_slots} Occupied`;
    }
    if (availableEl) {
        availableEl.textContent = `${available_slots} Free`;
    }
}
            

// Step 2: Calculate station load
function calculateLoad(station) {
    return (
        Number(station.plug1_power || 0) +
        Number(station.plug2_power || 0) +
        Number(station.plug3_power || 0)
    );
}

// Create simulated station data
function createSimulatedStation(stationId) {
    const simulatedLoad = Math.random() * 60 + 20; // 20-80 kW
    const plug1Power = Math.random() > 0.5 ? Math.random() * 30 + 10 : 0;
    const plug2Power = Math.random() > 0.5 ? Math.random() * 30 + 10 : 0;
    const plug3Power = Math.random() > 0.5 ? Math.random() * 30 + 10 : 0;
    
    return {
        station_id: stationId,
        voltage: 230 + Math.random() * 10,
        plug1_power: plug1Power,
        plug2_power: plug2Power,
        plug3_power: plug3Power,
        plug1_status: plug1Power > 0 ? "occupied" : "free",
        plug2_status: plug2Power > 0 ? "occupied" : "free",
        plug3_status: plug3Power > 0 ? "occupied" : "free",
        updated_at: new Date().toISOString()
    };
}

// Step 3: Calculate utilization
function calculateUtilization(load) {
    const MAX_CAPACITY = 180;
    return (load / MAX_CAPACITY) * 100;
}

// Step 4: Update station card
function updateStationCard(station) {
    console.log('=== UPDATING STATION CARD ===');
    console.log('Station data:', station);
    
    const id = station.station_id;
    const load = calculateLoad(station);
    const utilization = calculateUtilization(load);
    
    const occupied = [
        station.plug1_status,
        station.plug2_status,
        station.plug3_status
    ].filter(s => s === "occupied").length;
    
    const available = 3 - occupied;
    
    console.log(`Calculated values for ${id}:`);
    console.log(`- Load: ${load}kW`);
    console.log(`- Utilization: ${utilization.toFixed(1)}%`);
    console.log(`- Occupied: ${occupied}`);
    console.log(`- Available: ${available}`);
    
    // Update station card elements with detailed logging
    const loadElId = id.toLowerCase() + "-load";
    const utilizationElId = id.toLowerCase() + "-utilization";
    const occupiedElId = id.toLowerCase() + "-occupied";
    const availableElId = id.toLowerCase() + "-available";
    
    console.log(`Looking for elements: ${loadElId}, ${utilizationElId}, ${occupiedElId}, ${availableElId}`);
    
    const loadEl = document.getElementById(loadElId);
    console.log(`Load element found:`, !!loadEl, loadEl);
    if (loadEl) {
        loadEl.textContent = load.toFixed(1) + " kW";
        console.log(`Updated ${loadElId} to: ${load.toFixed(1)} kW`);
    } else {
        console.error(`ERROR: Element ${loadElId} not found!`);
    }
    
    const utilizationEl = document.getElementById(utilizationElId);
    console.log(`Utilization element found:`, !!utilizationEl, utilizationEl);
    if (utilizationEl) {
        utilizationEl.textContent = utilization.toFixed(1) + "%";
        console.log(`Updated ${utilizationElId} to: ${utilization.toFixed(1)}%`);
    } else {
        console.error(`ERROR: Element ${utilizationElId} not found!`);
    }
    
    const occupiedEl = document.getElementById(occupiedElId);
    console.log(`Occupied element found:`, !!occupiedEl, occupiedEl);
    if (occupiedEl) {
        occupiedEl.textContent = occupied;
        console.log(`Updated ${occupiedElId} to: ${occupied}`);
    } else {
        console.error(`ERROR: Element ${occupiedElId} not found!`);
    }
    
    const availableEl = document.getElementById(availableElId);
    console.log(`Available element found:`, !!availableEl, availableEl);
    if (availableEl) {
        availableEl.textContent = available;
        console.log(`Updated ${availableElId} to: ${available}`);
    } else {
        console.error(`ERROR: Element ${availableElId} not found!`);
    }
    
    console.log('=== STATION CARD UPDATE COMPLETE ===');
}

// Step 5: Update totals
function updateTotals(stations) {
    let totalLoad = 0;
    let activeStations = 0;
    
    stations.forEach(station => {
        const load = calculateLoad(station);
        totalLoad += load;
        
        if (load > 0) activeStations++;
    });
    
    console.log(`Total grid load: ${totalLoad.toFixed(1)}kW, Active stations: ${activeStations}/3`);
    
    // Update total elements
    const totalLoadEl = document.getElementById("total-grid-load");
    if (totalLoadEl) totalLoadEl.textContent = totalLoad.toFixed(1) + " kW";
    
    const activeStationsEl = document.getElementById("active-stations");
    if (activeStationsEl) activeStationsEl.textContent = activeStations + "/3";
    
    // Update charts with new data
    updateChartsWithStationData(stations);
}

// Step 6: Update charts with station data
function updateChartsWithStationData(stations) {
    // Update station chart if it exists
    if (stationChart) {
        const labels = stations.map(s => s.station_id);
        const loadData = stations.map(s => calculateLoad(s));
        const utilizationData = stations.map(s => calculateUtilization(calculateLoad(s)));
        
        stationChart.data.labels = labels;
        stationChart.data.datasets[0].data = loadData;
        stationChart.data.datasets[1].data = utilizationData;
        stationChart.update('none'); // Update without animation for real-time feel
    }
    
    // Update spike chart if it exists
    if (spikeChart && stations.length > 0) {
        const currentTime = new Date().toLocaleTimeString();
        const totalLoad = stations.reduce((sum, s) => sum + calculateLoad(s), 0);
        
        // Keep only last 10 data points
        if (spikeChart.data.labels.length >= 10) {
            spikeChart.data.labels.shift();
            spikeChart.data.datasets[0].data.shift();
        }
        
        spikeChart.data.labels.push(currentTime);
        spikeChart.data.datasets[0].data.push(totalLoad);
        spikeChart.update('none');
    }
}

// Step 6: Main update function
function updateDashboard(stations) {
    console.log('Updating dashboard with station data:', stations);
    
    if (!Array.isArray(stations)) {
        console.error('Invalid stations data:', stations);
        return;
    }
    
    stations.forEach(station => {
        updateStationCard(station);
    });
    
    updateTotals(stations);
}

// Step 7: Auto refresh every 5 seconds
function startRealTimeUpdates() {
    console.log('Starting real-time updates (every 5 seconds)...');
    
    // Initial fetch
    fetchStationData();
    
    // Set up interval for periodic updates
    setInterval(fetchStationData, 5000);
}

// Load initial data (legacy function - kept for compatibility)
async function loadInitialData() {
    try {
        const response = await fetch(`${BACKEND_BASE_URL}/station-live`);
        if (response.ok) {
            const data = await response.json();
            console.log('Station live data received:', data);
            console.log('Data structure:', JSON.stringify(data, null, 2));
            updateDashboardFromLive(data);
        } else {
            console.error('Failed to fetch station live data:', response.status);
        }
    } catch (error) {
        console.error('Failed to load initial data:', error);
    }
}

// Update dashboard from live station data
function updateDashboardFromLive(data) {
    if (!data || !data.data) {
        console.log('No data received:', data);
        return;
    }

    const stationData = data.data;
    console.log('Processing station data:', stationData);
    console.log('Number of records:', stationData.length);

    // Group data by station_id and get only the latest reading for each station
    const stationMap = new Map();
    stationData.forEach(station => {
        const stationId = station.station_id;
        if (!stationMap.has(stationId) || new Date(station.updated_at) > new Date(stationMap.get(stationId).updated_at)) {
            stationMap.set(stationId, station);
        }
    });

    // Get the 3 unique stations
    const uniqueStations = Array.from(stationMap.values());
    console.log('Unique stations:', uniqueStations);
    console.log('Number of unique stations:', uniqueStations.length);

    // Calculate total load from the 3 unique stations
    let totalLoad = 0;
    let activeStations = 0;

    uniqueStations.forEach(station => {
        const plug1Power = parseFloat(station.plug1_power) || 0;
        const plug2Power = parseFloat(station.plug2_power) || 0;
        const plug3Power = parseFloat(station.plug3_power) || 0;
        const stationLoad = plug1Power + plug2Power + plug3Power;
        totalLoad += stationLoad;

        console.log(`Station ${station.station_id}: P1=${plug1Power}, P2=${plug2Power}, P3=${plug3Power}, Total=${stationLoad}`);

        if (stationLoad > 0) {
            activeStations++;
        }

        // Update station cards
        updateStationCard(station, stationLoad);
    });

    console.log('Total load:', totalLoad, 'Watts');
    console.log('Active stations:', activeStations);

    // Update station chart
    updateStationChart(uniqueStations);

    // Update total grid load
    const totalLoadEl = document.getElementById('total-grid-load');
    const gridCapacityEl = document.getElementById('grid-capacity');
    const gridCapacity = 200; // Default capacity in kW

    if (totalLoadEl) totalLoadEl.textContent = `${(totalLoad / 1000).toFixed(1)} kW`;
    if (gridCapacityEl) gridCapacityEl.textContent = gridCapacity;

    // Update load percentage
    const loadPercentage = (totalLoad / 1000 / gridCapacity) * 100;
    const gridUtilizationEl = document.getElementById('grid-utilization');
    const gridLoadBarEl = document.getElementById('grid-load-bar');
    if (gridUtilizationEl) gridUtilizationEl.textContent = `${loadPercentage.toFixed(1)}%`;
    if (gridLoadBarEl) gridLoadBarEl.style.width = `${Math.min(loadPercentage, 100)}%`;

    // Update status
    const statusText = document.getElementById('grid-status');
    const statusIndicator = document.getElementById('status-indicator');
    const statusTextElement = document.getElementById('status-text');

    if (loadPercentage > 80) {
        if (statusText) statusText.textContent = 'CRITICAL LOAD';
        if (statusIndicator) statusIndicator.className = 'w-3 h-3 rounded-full bg-red-500 animate-pulse';
        if (statusTextElement) statusTextElement.textContent = '⚠️ OVERLOAD RISK DETECTED';
    } else if (loadPercentage > 60) {
        if (statusText) statusText.textContent = 'WARNING LEVEL';
        if (statusIndicator) statusIndicator.className = 'w-3 h-3 rounded-full bg-amber-500 animate-pulse';
        if (statusTextElement) statusTextElement.textContent = 'High load detected';
    } else {
        if (statusText) statusText.textContent = 'NORMAL';
        if (statusIndicator) statusIndicator.className = 'w-3 h-3 rounded-full bg-green-500';
        if (statusTextElement) statusTextElement.textContent = 'Grid operating normally';
    }

    // Update active stations count
    const activeStationsEl = document.getElementById('active-stations');
    if (activeStationsEl) activeStationsEl.textContent = `${activeStations}/3`;
}

// Update individual station card
function updateStationCard(station, stationLoad) {
    const stationId = station.station_id.toLowerCase().replace('_', '-');
    const card = document.getElementById(`${stationId}-card`);

    if (!card) {
        console.log(`Card not found for station: ${stationId}`);
        return;
    }

    const loadEl = document.getElementById(`${stationId}-load`);
    const utilizationEl = document.getElementById(`${stationId}-utilization`);

    const loadKW = stationLoad / 1000;
    const utilization = (loadKW / 50) * 100; // Assuming 50kW per station

    if (loadEl) loadEl.textContent = `${loadKW.toFixed(1)} kW`;
    if (utilizationEl) utilizationEl.textContent = `${utilization.toFixed(1)}%`;

    // Update card styling based on load
    if (stationLoad > 0) {
        card.className = `station-card card-glow rounded-xl p-6 active`;
    } else {
        card.className = `station-card card-glow rounded-xl p-6 inactive`;
    }
}

// Update station chart with live data
function updateStationChart(uniqueStations) {
    if (!stationChart) {
        console.log('Station chart not initialized');
        return;
    }

    const stationLabels = ['STATION_01', 'STATION_02', 'STATION_03'];
    const powerData = [0, 0, 0];
    const utilizationData = [0, 0, 0];

    uniqueStations.forEach(station => {
        const index = stationLabels.indexOf(station.station_id);
        if (index !== -1) {
            const plug1Power = parseFloat(station.plug1_power) || 0;
            const plug2Power = parseFloat(station.plug2_power) || 0;
            const plug3Power = parseFloat(station.plug3_power) || 0;
            const stationLoad = plug1Power + plug2Power + plug3Power;
            const loadKW = stationLoad / 1000;
            const utilization = (loadKW / 50) * 100;

            powerData[index] = loadKW;
            utilizationData[index] = utilization;
        }
    });

    console.log('Updating chart with data:', { powerData, utilizationData });

    stationChart.data.datasets[0].data = powerData;
    stationChart.data.datasets[1].data = utilizationData;
    stationChart.update();
}

// Update dashboard with new data
function updateDashboard(data) {
    if (!data) return;

    // Update grid state cards
    updateGridState(data.grid_state);
    
    // Update station cards
    updateStationCards(data.stations);
    
    // Update charts
    updateStationChart(data.stations);
    
    // Update demand spikes
    updateDemandSpikes(data.demand_spikes);
}

// Update grid state cards
function updateGridState(gridState) {
    if (!gridState) return;
    
    // Total load
    const totalLoadEl = document.getElementById('total-grid-load');
    const gridCapacityEl = document.getElementById('grid-capacity');
    if (totalLoadEl) totalLoadEl.textContent = `${gridState.total_grid_load_kw.toFixed(1)} kW`;
    if (gridCapacityEl) gridCapacityEl.textContent = gridState.grid_capacity_kw;
    
    // Load percentage
    const loadPercentage = gridState.load_percentage;
    const gridUtilizationEl = document.getElementById('grid-utilization');
    const gridLoadBarEl = document.getElementById('grid-load-bar');
    if (gridUtilizationEl) gridUtilizationEl.textContent = `${loadPercentage.toFixed(1)}%`;
    if (gridLoadBarEl) gridLoadBarEl.style.width = `${Math.min(loadPercentage, 100)}%`;
    
    // Status
    const status = gridState.status;
    const statusText = document.getElementById('grid-status');
    const statusIndicator = document.getElementById('status-indicator');
    const statusTextElement = document.getElementById('status-text');
    
    if (status === 'critical') {
        if (statusText) statusText.textContent = 'CRITICAL LOAD';
        if (statusIndicator) statusIndicator.className = 'w-3 h-3 rounded-full bg-red-500 animate-pulse';
        if (statusTextElement) statusTextElement.textContent = '⚠️ OVERLOAD RISK DETECTED';
        showCriticalAlert(gridState);
    } else if (status === 'warning') {
        if (statusText) statusText.textContent = 'WARNING LEVEL';
        if (statusIndicator) statusIndicator.className = 'w-3 h-3 rounded-full bg-amber-500 animate-pulse';
        if (statusTextElement) statusTextElement.textContent = 'High load detected';
        hideCriticalAlert();
    } else {
        if (statusText) statusText.textContent = 'NORMAL OPERATION';
        if (statusIndicator) statusIndicator.className = 'w-3 h-3 rounded-full bg-green-500';
        if (statusTextElement) statusTextElement.textContent = '✅ All systems normal';
        hideCriticalAlert();
    }
    
    // Active stations
    const activeStations = currentData && currentData.stations ? currentData.stations.filter(s => s.occupied_slots > 0).length : 0;
    const activeStationsEl = document.getElementById('active-stations');
    if (activeStationsEl) activeStationsEl.textContent = `${activeStations}/3`;
}

// Update station cards
function updateStationCards(stations) {
    if (!stations) return;
    
    stations.forEach(station => {
        const stationId = station.station_id.toLowerCase().replace('_', '-');
        const card = document.getElementById(`${stationId}-card`);
        
        if (!card) return;
        
        // Update load and utilization
        const loadEl = document.getElementById(`${stationId}-load`);
        const utilizationEl = document.getElementById(`${stationId}-utilization`);
        const occupiedEl = document.getElementById(`${stationId}-occupied`);
        const availableEl = document.getElementById(`${stationId}-available`);
        
        if (loadEl) loadEl.textContent = `${station.total_power.toFixed(1)} kW`;
        if (utilizationEl) utilizationEl.textContent = `${station.utilization_percentage.toFixed(1)}%`;
        if (occupiedEl) occupiedEl.textContent = station.occupied_slots;
        if (availableEl) availableEl.textContent = station.available_slots;
        
        // Update card styling based on status
        card.className = `station-card card-glow rounded-xl p-6 ${station.status}`;
    });
}

// Update station chart
function updateStationChart(stations) {
    if (!stationChart) return;
    
    const labels = stations.map(s => s.station_id.replace('STATION_', 'S'));
    const powerData = stations.map(s => s.total_power);
    const utilizationData = stations.map(s => s.utilization_percentage);
    
    stationChart.data.labels = labels;
    stationChart.data.datasets[0].data = powerData;
    stationChart.data.datasets[1].data = utilizationData;
    stationChart.update();
}

// Update demand spikes
function updateDemandSpikes(spikes) {
    if (!spikeChart || !spikes.length) return;
    
    const labels = spikes.map((s, i) => `Spike ${i + 1}`);
    const data = spikes.map(s => s.power_increase_percentage);
    
    spikeChart.data.labels = labels;
    spikeChart.data.datasets[0].data = data;
    spikeChart.update();
}

// Show/hide critical alert
function showCriticalAlert(gridState) {
    const alert = document.getElementById('critical-alert');
    const message = document.getElementById('alert-message');
    
    if (!alert || !message) return;
    
    if (gridState.predicted_overload_time) {
        message.textContent = `Grid is operating at ${gridState.load_percentage.toFixed(1)}% capacity - Overload predicted ${gridState.predicted_overload_time}`;
    } else {
        message.textContent = `Grid is operating at ${gridState.load_percentage.toFixed(1)}% capacity - Immediate action required`;
    }
    
    alert.classList.remove('hidden');
}

function hideCriticalAlert() {
    const alert = document.getElementById('critical-alert');
    if (alert) alert.classList.add('hidden');
}

// Load comparison data
async function loadComparisonData() {
    // Comparison chart is already initialized with static data
    // In a real implementation, this would fetch actual comparison data
}

// Load history data
async function loadHistoryData() {
    try {
        const response = await fetch(`${BACKEND_BASE_URL}/api/grid/historical-comparison/7`);
        if (response.ok) {
            const data = await response.json();
            updateHistoryChart(data.timeline);
            updateStatistics(data.statistics);
        }
    } catch (error) {
        console.error('Failed to load history data:', error);
    }
}

// Update history chart
function updateHistoryChart(timeline) {
    if (!historyChart) return;
    
    const labels = timeline.map(t => new Date(t.timestamp).toLocaleDateString());
    const withGridPulzData = timeline.map(t => t.with_gridpulz);
    const withoutGridPulzData = timeline.map(t => t.without_gridpulz);
    
    historyChart.data.labels = labels;
    historyChart.data.datasets[0].data = withGridPulzData;
    historyChart.data.datasets[1].data = withoutGridPulzData;
    historyChart.update();
}

// Update statistics
function updateStatistics(stats) {
    if (!stats) return;
    
    const totalBookingsEl = document.getElementById('total-bookings');
    const redirectedSafelyEl = document.getElementById('redirected-safely');
    const deferredTemporarilyEl = document.getElementById('deferred-temporarily');
    const avgLoadReductionEl = document.getElementById('avg-load-reduction');
    
    if (totalBookingsEl) totalBookingsEl.textContent = stats.total_redirects * 6;
    if (redirectedSafelyEl) redirectedSafelyEl.textContent = stats.total_redirects;
    if (deferredTemporarilyEl) deferredTemporarilyEl.textContent = Math.floor(stats.total_redirects * 0.3);
    if (avgLoadReductionEl) avgLoadReductionEl.textContent = `${stats.average_load_reduction} kW`;
}

// Test booking recommendation
async function testBookingRecommendation() {
    const bookingIdEl = document.getElementById('booking-id');
    const stationIdEl = document.getElementById('requested-station');
    const powerDemandEl = document.getElementById('power-demand');
    
    if (!bookingIdEl || !stationIdEl || !powerDemandEl) {
        console.error('Required form elements not found');
        return;
    }
    
    const bookingId = bookingIdEl.value;
    const stationId = stationIdEl.value;
    const powerDemand = parseFloat(powerDemandEl.value);
    
    try {
        const response = await fetch(
            `${BACKEND_BASE_URL}/api/grid/booking-recommendation?booking_id=${bookingId}&station_id=${stationId}&power_demand=${powerDemand}`,
            { method: 'POST' }
        );
        
        if (response.ok) {
            const recommendation = await response.json();
            displayRecommendation(recommendation);
        } else {
            console.error('Failed to get recommendation:', response.status);
        }
    } catch (error) {
        console.error('Failed to get recommendation:', error);
    }
}

// Display booking recommendation
function displayRecommendation(recommendation) {
    const resultDiv = document.getElementById('recommendation-result');
    
    const colorClass = recommendation.recommendation_type === 'accept' ? 'green' : 
                      recommendation.recommendation_type === 'redirect' ? 'amber' : 'red';
    
    const icon = recommendation.recommendation_type === 'accept' ? '✅' : 
                 recommendation.recommendation_type === 'redirect' ? '→' : '⏰';
    
    resultDiv.innerHTML = `
        <div class="card-glow rounded-xl p-6 border-${colorClass}-600 bg-${colorClass}-900/20">
            <div class="flex items-start gap-4 mb-6">
                <div class="text-2xl">${icon}</div>
                <div class="flex-1">
                    <h3 class="font-michroma text-lg text-${colorClass}-400 mb-1">
                        Booking Recommendation: ${recommendation.recommendation_type.toUpperCase()}
                    </h3>
                    <p class="text-${colorClass}-300 text-sm">${recommendation.reason}</p>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-6 mb-6 pb-6 border-b border-[#353535]">
                <div>
                    <div class="text-xs text-muted font-michroma mb-1">Booking ID</div>
                    <div class="text-sm text-white">${recommendation.booking_id}</div>
                </div>
                <div>
                    <div class="text-xs text-muted font-michroma mb-1">Power Demand</div>
                    <div class="text-sm text-white">${recommendation.requested_power_demand.toFixed(1)} kW</div>
                </div>
                <div>
                    <div class="text-xs text-muted font-michroma mb-1">Requested Station</div>
                    <div class="text-sm text-white">${recommendation.requested_station}</div>
                </div>
                ${recommendation.recommended_station ? `
                <div>
                    <div class="text-xs text-muted font-michroma mb-1">Recommended Station</div>
                    <div class="text-sm text-neon">${recommendation.recommended_station}</div>
                </div>
                ` : ''}
            </div>

            <div class="grid grid-cols-2 gap-6">
                <div class="bg-green-900/30 rounded p-4 border border-green-600/50">
                    <div class="font-michroma text-green-400 text-sm mb-3">✅ WITH GridPulz</div>
                    <div class="space-y-2 text-xs text-green-300">
                        <div>Station: <span class="text-green-400 font-semibold">${recommendation.with_gridpulz.station}</span></div>
                        <div>Grid Load: <span class="text-green-400 font-semibold">${recommendation.with_gridpulz.grid_load_after.toFixed(1)} kW</span></div>
                        <div class="pt-2">
                            <span class="${recommendation.with_gridpulz.overload_risk ? 'text-red-400' : 'text-green-400'}">
                                ${recommendation.with_gridpulz.overload_risk ? '⚠️ OVERLOAD RISK' : '✓ SAFE'}
                            </span>
                        </div>
                    </div>
                </div>

                <div class="bg-red-900/30 rounded p-4 border border-red-600/50">
                    <div class="font-michroma text-red-400 text-sm mb-3">❌ WITHOUT GridPulz</div>
                    <div class="space-y-2 text-xs text-red-300">
                        <div>Station: <span class="text-red-400 font-semibold">${recommendation.without_gridpulz.station}</span></div>
                        <div>Grid Load: <span class="text-red-400 font-semibold">${recommendation.without_gridpulz.grid_load_after.toFixed(1)} kW</span></div>
                        <div class="pt-2">
                            ${recommendation.without_gridpulz.overload_risk ? 
                                '<span class="text-red-400 font-bold">🚨 CRITICAL OVERLOAD</span>' : 
                                '<span class="text-green-400">✓ OK</span>'
                            }
                        </div>
                    </div>
                </div>
            </div>

            <div class="mt-6 flex gap-3">
                ${recommendation.recommendation_type === 'accept' ? 
                    '<button class="flex-1 bg-green-600 text-white py-2 rounded font-michroma text-sm hover:bg-green-700 transition">✓ Accept Booking</button>' : 
                    recommendation.recommendation_type === 'redirect' ? 
                    `<button class="flex-1 bg-amber-600 text-white py-2 rounded font-michroma text-sm hover:bg-amber-700 transition">→ Redirect to ${recommendation.recommended_station}</button>` :
                    '<button class="flex-1 bg-blue-600 text-white py-2 rounded font-michroma text-sm hover:bg-blue-700 transition">⏰ Defer & Notify Customer</button>'
                }
                <button class="flex-1 bg-[#1b1b1b] border border-[#353535] text-white py-2 rounded font-michroma text-sm hover:bg-[#353535] transition">Override</button>
            </div>
        </div>
    `;
    
    resultDiv.classList.remove('hidden');
}

// Start real-time updates


// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (updateInterval) {
        clearInterval(updateInterval);
    }
});

