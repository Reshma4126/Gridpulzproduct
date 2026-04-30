/**
 * operator.js - GridPulz Dashboard Logic
 * Handles live data simulation, Chart.js rendering,
 * and ML-threshold-based redirect to alerts.html
 */

// Backend URL configured in api-config.js
const CHART_WINDOW = 20;

let STATION_CONFIG = {
  name: 'Loading...',
  location: 'Loading...',
  totalPoints: 0,
  maxCapacityKW: 0,
};

let chartLabels = [];
let actualData = [];
let predictedData = [];
let chartInstance = null;
let tickInterval = null;
let tickCount = 0;
let redirecting = false;
let currentOperatorEmail = '';
let tickInFlight = false;

// Multi-station data
let stationData = {
    STATION_01: { load: 0, status: 'offline', sessions: 0 },
    STATION_02: { load: 0, status: 'offline', sessions: 0 },
    STATION_03: { load: 0, status: 'offline', sessions: 0 }
};
let demandSpikeThreshold = 150; // kW
let previousTotalLoad = 0;

function startClock() {
    const el = document.getElementById('live-clock');
    if (!el) return;
    const tick = () => {
        const now = new Date();
        el.textContent = now.toTimeString().split(' ')[0];
    };
    tick();
    setInterval(tick, 1000);
}

function normalizeEmail(value) {
  return String(value || '').trim().replace(/^"+|"+$/g, '').toLowerCase();
}

async function hydrateOperatorIdentity() {
  if (!window.supabaseClient || !window.supabaseClient.auth) {
    console.warn('Supabase not configured, using demo data');
    return null;
  }

  try {
    const {
      data: { session },
    } = await window.supabaseClient.auth.getSession();

    const email = session && session.user && session.user.email ? normalizeEmail(session.user.email) : '';
    if (email) {
      localStorage.setItem('gridpulz_operator_email', email);
      return email;
    }
  } catch (error) {
    console.warn('Unable to resolve operator session:', error);
  }

  return null;
}

async function fetchStationStatus(operatorEmail) {
  try {
    const response = await fetch(
      `${BACKEND_BASE_URL}/api/station-status/${encodeURIComponent(operatorEmail)}`
    );
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.detail || `HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch station status:', error);
    throw error;
  }
}

async function fetchMLPrediction() {
  try {
    const response = await fetch(`${BACKEND_BASE_URL}/api/grid-prediction`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error('Failed to fetch ML prediction:', error);
      return null;
    }
    const data = await response.json();
    console.log('ML Prediction data:', data);
    return data;
  } catch (error) {
    console.error('Error fetching ML prediction:', error);
    return null;
  }
}

async function initializeDashboard() {
  const persistedEmail = normalizeEmail(localStorage.getItem('gridpulz_operator_email') || '');
  const sessionEmail = normalizeEmail(await hydrateOperatorIdentity());
  const operatorEmail = sessionEmail || persistedEmail;
  currentOperatorEmail = operatorEmail;

  if (!operatorEmail) {
    console.warn('No operator email found, using demo data');
    STATION_CONFIG = {
      name: 'GridPulz Node 04',
      location: 'Sector 12, Chennai',
      totalPoints: 12,
      maxCapacityKW: 180,
    };
  } else {
    try {
      const stationData = await fetchStationStatus(operatorEmail);
      STATION_CONFIG = {
        name: stationData.station_name || 'Unnamed Station',
        location: stationData.location || 'Unknown Location',
        totalPoints: Number(stationData.total_plugs || 12),
        maxCapacityKW: Number(stationData.total_capacity_kw || 180),
      };
      console.log('Loaded station config:', STATION_CONFIG);
    } catch (error) {
      console.error('Failed to load station data:', error);
      STATION_CONFIG = {
        name: 'GridPulz Node 04',
        location: 'Sector 12, Chennai',
        totalPoints: 12,
        maxCapacityKW: 180,
      };
    }
  }

  // Update UI with station data
  const stationNameEl = document.getElementById('station-name');
  if (stationNameEl) stationNameEl.textContent = STATION_CONFIG.name;

  const sidebarStationNameEl = document.getElementById('sidebar-station-name');
  if (sidebarStationNameEl) sidebarStationNameEl.textContent = STATION_CONFIG.name;

  const totalPointsEl = document.getElementById('total-points');
  if (totalPointsEl) totalPointsEl.textContent = String(STATION_CONFIG.totalPoints);

  const maxCapacityEl = document.getElementById('max-capacity');
  if (maxCapacityEl) maxCapacityEl.textContent = String(STATION_CONFIG.maxCapacityKW) + ' kW';

  const stationLocationEl = document.getElementById('station-location');
  if (stationLocationEl) stationLocationEl.textContent = STATION_CONFIG.location;
}

function applyStationConfigToUI() {
  const stationNameEl = document.getElementById('station-name');
  if (stationNameEl) stationNameEl.textContent = STATION_CONFIG.name;

  const sidebarStationNameEl = document.getElementById('sidebar-station-name');
  if (sidebarStationNameEl) sidebarStationNameEl.textContent = STATION_CONFIG.name;

  const totalPointsEl = document.getElementById('total-points');
  if (totalPointsEl) totalPointsEl.textContent = String(STATION_CONFIG.totalPoints);

  const maxCapacityEl = document.getElementById('max-capacity');
  if (maxCapacityEl) maxCapacityEl.textContent = String(STATION_CONFIG.maxCapacityKW) + ' kW';

  const stationLocationEl = document.getElementById('station-location');
  if (stationLocationEl) stationLocationEl.textContent = STATION_CONFIG.location;
}

function normalizeStatusToPercent(statusPayload) {
  const capacity = Number(statusPayload.total_capacity_kw || STATION_CONFIG.maxCapacityKW || 0);
  const currentKW = Number(statusPayload.current_load_kw || 0);
  const predictedKW = Number(statusPayload.predicted_load_kw || 0);

  if (!capacity || capacity <= 0) {
    return {
      currentLoadPct: 0,
      predictedLoadPct: 0,
      activeSessions: Number(statusPayload.active_sessions || 0),
    };
  }

  return {
    currentLoadPct: Math.max(0, Math.min(100, (currentKW / capacity) * 100)),
    predictedLoadPct: Math.max(0, Math.min(100, (predictedKW / capacity) * 100)),
    activeSessions: Number(statusPayload.active_sessions || 0),
  };
}

async function fetchLiveMetrics() {
  // Always use ML predictions regardless of operator login
  const mlData = await fetchMLPrediction();
  
  if (!currentOperatorEmail) {
    // Use ML data with simulated station config
    if (mlData) {
      const mockStationData = {
        current_load_kw: (mlData.current_load_watts || 0) / 1000.0,  // Convert Watts to kW for compatibility
        predicted_load_kw: (mlData.predicted_load_watts || 0) / 1000.0,  // Convert Watts to kW for compatibility
        active_sessions: mlData.active_sessions,
        total_capacity_kw: STATION_CONFIG.maxCapacityKW || 180,
        model_used: mlData.model_used
      };
      return normalizeStatusToPercent(mockStationData);
    }
    return simulateLoad();
  }

  try {
    const stationData = await fetchStationStatus(currentOperatorEmail);
    
    // Merge ML predictions with station data
    if (mlData) {
      stationData.predicted_load_kw = (mlData.predicted_load_watts || 0) / 1000.0;  // Convert Watts to kW
      stationData.model_used = mlData.model_used;
    }

    STATION_CONFIG = {
      name: stationData.station_name || STATION_CONFIG.name,
      location: stationData.location || STATION_CONFIG.location,
      totalPoints: Number(stationData.total_plugs || STATION_CONFIG.totalPoints || 12),
      maxCapacityKW: Number(stationData.total_capacity_kw || STATION_CONFIG.maxCapacityKW || 180),
    };
    applyStationConfigToUI();

    return normalizeStatusToPercent(stationData);
  } catch (error) {
    console.warn('Station data fetch failed, using ML data:', error);
    if (mlData) {
      const mockStationData = {
        current_load_kw: (mlData.current_load_watts || 0) / 1000.0,
        predicted_load_kw: (mlData.predicted_load_watts || 0) / 1000.0,
        active_sessions: mlData.active_sessions,
        total_capacity_kw: STATION_CONFIG.maxCapacityKW || 180,
        model_used: mlData.model_used
      };
      return normalizeStatusToPercent(mockStationData);
    }
    return simulateLoad();
  }
}

function simulateLoad() {
  const baseLoad = Math.random() * 0.3 + 0.05;
  const predictedLoad = baseLoad + (Math.random() - 0.5) * 0.2;
  const activeSessions = Math.floor(Math.random() * 5) + 1;

  return {
    currentLoadPct: baseLoad * 100,
    predictedLoadPct: predictedLoad * 100,
    activeSessions: activeSessions,
  };
}

function updateDashboardUI(currentLoad, predictedLoad, activeSessions, mlData = null) {
    // Ensure we have numbers to avoid toFixed errors
    const safeLoad = Number(currentLoad || 0);
    const safePredicted = Number(predictedLoad || 0);
    const safeSessions = Number(activeSessions || 0);

    if (safePredicted > 90 && !redirecting) {
        redirecting = true;
        clearInterval(tickInterval);
        window.location.href = 'alerts.html?trigger=overload&load=' + safePredicted.toFixed(1);
        return;
    }

    const sessionsEl = document.getElementById('active-sessions');
    if (sessionsEl) sessionsEl.textContent = String(safeSessions);

    const loadPctEl = document.getElementById('current-load-pct');
    if (loadPctEl) loadPctEl.textContent = safeLoad.toFixed(1) + '%';

    const loadBarEl = document.getElementById('current-load-bar');
    if (loadBarEl) {
        loadBarEl.style.width = Math.min(safeLoad, 100) + '%';
        if (safeLoad >= 75) {
            loadBarEl.style.background = '#FF4444';
        } else if (safeLoad >= 50) {
            loadBarEl.style.background = '#FFA500';
        } else {
            loadBarEl.style.background = '#CCFF00';
        }
    }

    const currentKW = ((safeLoad / 100) * STATION_CONFIG.maxCapacityKW).toFixed(1);
    const loadKWEl = document.getElementById('current-load-kw');
    if (loadKWEl) loadKWEl.textContent = currentKW + ' kW';

    // Only update ML prediction elements if NOT on dashboard.html (to avoid conflicts)
    // dashboard.js handles its own ML prediction updates
    if (!window.location.pathname.includes('dashboard.html')) {
        const predEl = document.getElementById('predicted-load');
        if (predEl) predEl.textContent = safePredicted.toFixed(1) + '%';

        const predKWEl = document.getElementById('predicted-load-kw');
        const predKW = ((safePredicted / 100) * STATION_CONFIG.maxCapacityKW).toFixed(1);
        if (predKWEl) predKWEl.textContent = predKW + ' kW forecasted next 15 min';
    }

    // Only update ML status tag if NOT on dashboard.html (to avoid conflicts)
    // dashboard.js handles its own ML prediction updates
    if (!window.location.pathname.includes('dashboard.html')) {
        const mlTag = document.getElementById('ml-status-tag');
        if (mlTag) {
            if (safePredicted >= 45) {
                mlTag.textContent = 'ELEVATED';
                mlTag.style.background = 'rgba(255,165,0,0.15)';
                mlTag.style.color = '#FFA500';
                mlTag.style.border = '1px solid rgba(255,165,0,0.3)';
            } else {
                mlTag.textContent = 'NOMINAL';
                mlTag.style.background = 'rgba(204,255,0,0.15)';
                mlTag.style.color = '#CCFF00';
                mlTag.style.border = '1px solid rgba(204,255,0,0.3)';
            }
        }

        // Update ML confidence display
        const mlConfidenceEl = document.getElementById('ml-confidence');
        if (mlConfidenceEl) {
            // Calculate confidence based on model used
            const confidence = (mlData && mlData.model_used === 'ML') ? '94.2%' : '85.0%';
            mlConfidenceEl.textContent = confidence;
        }
    }

    updatePointsGrid(safeSessions);
    if (tickCount % 8 === 0) addEventLogEntry(safeLoad, safePredicted, safeSessions);
}

function updatePointsGrid(activeSessions) {
    const grid = document.getElementById('points-grid');
    if (!grid) return;

    const faultPoint = Math.random() < 0.05 ? Math.floor(Math.random() * STATION_CONFIG.totalPoints) : -1;

    grid.innerHTML = '';
    for (let i = 0; i < STATION_CONFIG.totalPoints; i++) {
        const div = document.createElement('div');
        div.title = 'Point #' + (i + 1);

        if (i === faultPoint) {
            div.className = 'h-8 rounded flex items-center justify-center text-xs font-mono font-bold cursor-pointer transition-all';
            div.style.cssText = 'background:rgba(255,68,68,0.2);border:1px solid rgba(255,68,68,0.5);color:#FF4444;';
            div.textContent = String(i + 1);
        } else if (i < activeSessions) {
            div.className = 'h-8 rounded flex items-center justify-center text-xs font-mono font-bold cursor-pointer transition-all';
            div.style.cssText = 'background:rgba(204,255,0,0.15);border:1px solid rgba(204,255,0,0.4);color:#CCFF00;';
            div.textContent = String(i + 1);
        } else {
            div.className = 'h-8 rounded flex items-center justify-center text-xs font-mono cursor-pointer transition-all';
            div.style.cssText = 'background:#353535;border:1px solid #404040;color:#888888;';
            div.textContent = String(i + 1);
        }
        grid.appendChild(div);
    }
}

const EVENT_TEMPLATES = [
    (l, p, s) => `Session started - Point #${Math.min(s + 1, STATION_CONFIG.totalPoints)}`,
    (l, p) => `Load reading: ${l.toFixed(1)}% / ML predicts ${p.toFixed(1)}%`,
    (l, p, s) => `${s} active sessions - load nominal`,
    () => 'Heartbeat OK - all systems nominal',
    () => 'Grid sync pulse received',
];

function addEventLogEntry(load, pred, sessions) {
    const log = document.getElementById('event-log');
    if (!log) return;

    const now = new Date().toTimeString().split(' ')[0];
    const template = EVENT_TEMPLATES[Math.floor(Math.random() * EVENT_TEMPLATES.length)];
    const msg = template(load, pred, sessions);

    const color = load > 60 ? '#FFA500' : '#CCFF00';

    const entry = document.createElement('div');
    entry.className = 'flex gap-2 items-start';
    entry.innerHTML = `<span style="color:${color}" class="shrink-0">${now}</span><span>${msg}</span>`;

    log.prepend(entry);
    while (log.children.length > 20) log.removeChild(log.lastChild);
}

function initChart() {
    const canvas = document.getElementById('loadChart');
    if (!canvas || !window.Chart) return;

    for (let i = 0; i < CHART_WINDOW; i++) {
        const d = new Date(Date.now() - (CHART_WINDOW - i) * 3000);
        chartLabels.push(d.toTimeString().split(' ')[0]);
        actualData.push(null);
        predictedData.push(null);
    }

    const gridColor = 'rgba(53,53,53,0.5)';

    chartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [
                {
                    label: 'Actual Load (%)',
                    data: actualData,
                    borderColor: '#CCFF00',
                    backgroundColor: 'rgba(204,255,0,0.1)',
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: '#CCFF00',
                    tension: 0.4,
                    fill: true,
                },
                {
                    label: 'ML Prediction (%)',
                    data: predictedData,
                    borderColor: '#FFA500',
                    backgroundColor: 'rgba(255,165,0,0.08)',
                    borderWidth: 2,
                    borderDash: [5, 4],
                    pointRadius: 3,
                    pointBackgroundColor: '#FFA500',
                    tension: 0.4,
                    fill: false,
                },
            ],
        },
        options: {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            animation: { duration: 400 },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1b1b1b',
                    borderColor: '#353535',
                    borderWidth: 1,
                    titleColor: '#888888',
                    bodyColor: '#CCFF00',
                    padding: 10,
                },
            },
            scales: {
                x: {
                    ticks: {
                        color: '#888888',
                      font: { family: 'Michroma', size: 10 },
                        maxTicksLimit: 8,
                    },
                    grid: { color: gridColor },
                },
                y: {
                    min: 0,
                    max: 100,
                    ticks: {
                        color: '#888888',
                      font: { family: 'Michroma', size: 10 },
                        callback: (v) => v + '%',
                    },
                    grid: { color: gridColor },
                },
            },
        },
        plugins: [
            {
                id: 'thresholdLine',
                afterDraw(chart) {
                    const {
                        ctx,
                        chartArea: { left, right },
                        scales: { y },
                    } = chart;
                    const yPos = y.getPixelForValue(50);
                    ctx.save();
                    ctx.setLineDash([6, 4]);
                    ctx.strokeStyle = 'rgba(255,68,68,0.6)';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(left, yPos);
                    ctx.lineTo(right, yPos);
                    ctx.stroke();
                    ctx.restore();

                    ctx.save();
                    ctx.font = '10px Michroma';
                    ctx.fillStyle = 'rgba(255,68,68,0.8)';
                    ctx.fillText('THRESHOLD 50%', right - 105, yPos - 5);
                    ctx.restore();
                },
            },
        ],
    });
}

function pushChartData(load, predicted) {
    if (!chartInstance) return;

    const now = new Date().toTimeString().split(' ')[0];
    chartLabels.push(now);
    actualData.push(parseFloat(load.toFixed(2)));
    predictedData.push(parseFloat(predicted.toFixed(2)));

    if (chartLabels.length > CHART_WINDOW) {
        chartLabels.shift();
        actualData.shift();
        predictedData.shift();
    }

    chartInstance.update();
}

async function fetchMultiStationData() {
    try {
        const response = await fetch(`${BACKEND_BASE_URL}/api/grid/load-analysis`);
        if (!response.ok) return [];
        const data = await response.json();
        return data.stations || [];
    } catch (error) {
        console.error('Failed to fetch multi-station data:', error);
        return [];
    }
}

function updateStationGrid(stations) {
    // Optional: implementation for grid view if needed
    // console.log('Updating station grid with:', stations);
}

async function tick() {
  if (redirecting || tickInFlight) return;
  tickInFlight = true;

  try {
    // Get metrics (which includes ML data)
    const metrics = await fetchLiveMetrics();
    console.log('Metrics received:', metrics);
    const { currentLoadPct, predictedLoadPct, activeSessions } = metrics;
    
    // Get ML data separately for UI display
    const mlData = await fetchMLPrediction();
    console.log('ML Data received:', mlData);
    
    tickCount++;

    updateDashboardUI(currentLoadPct, predictedLoadPct, activeSessions, mlData);
    pushChartData(currentLoadPct, predictedLoadPct);
  } catch (error) {
    console.warn('Falling back to local simulation tick:', error);
    const simulated = simulateLoad();
    const { currentLoadPct, predictedLoadPct, activeSessions } = simulated;
    tickCount++;

    updateDashboardUI(currentLoadPct, predictedLoadPct, activeSessions);
    pushChartData(currentLoadPct, predictedLoadPct);
  } finally {
    tickInFlight = false;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
    await initializeDashboard();
    startClock();
    initChart();

    tick();
    tickInterval = setInterval(tick, 3000);
});
