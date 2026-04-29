// ============================================================
// GridPulz — Stations Real-Time Sync Module (Leaflet Version)
// ============================================================

// ─── State ──────────────────────────────────────────────────
let stationsCache = [];           // All stations from last fetch
let stationMarkerMap = {};        // { stationId: L.Marker }
let realtimeChannel = null;       // Supabase channel ref
let assignedStationId = null;     // The station the user was routed to
let connectionStatus = 'disconnected'; // 'connected' | 'disconnected' | 'error'

// ─── Constants ──────────────────────────────────────────────
const REDIRECT_MIN_SLOTS = 2;     // Target must have >= 2 free slots to prevent cascading

// =============================================================
// MODULE 1: Dynamic Marker Builder
// =============================================================

/**
 * Determines marker color from grid_load (0–100).
 */
function gridColor(load) {
    if (load > 75) return '#e24b4a';
    if (load > 55) return '#ef9f27';
    return '#1d9e75';
}

/**
 * Returns charger icon based on compatibility with user's vehicle.
 */
function chargerIcon(stChargerType, userChargerType) {
    if (!stChargerType || !userChargerType) return '⚡';
    return stChargerType === userChargerType ? '⚡' : '✕';
}

/**
 * Builds a Leaflet Marker with 3 data dimensions.
 */
function buildStationMarker(station, userChargerType, mapInstance) {
    const load = station.grid_load ?? 0;
    const color = gridColor(load);
    const freeSlots = station.free_slots ?? '?';
    const totalSlots = station.total_slots ?? '?';
    const iconChar = chargerIcon(station.charger_type, userChargerType);
    const lat = station.lat ?? station.latitude;
    const lng = station.lng ?? station.longitude;

    if (!lat || !lng || !mapInstance) return null;

    const riskLevel = load > 75 ? 'HIGH' : load > 55 ? 'MODERATE' : 'LOW';

    // Create a custom SVG for the marker
    const svg = `
    <svg width="50" height="60" viewBox="0 0 50 60" xmlns="http://www.w3.org/2000/svg">
        <circle cx="25" cy="25" r="20" fill="${color}" stroke="#131318" stroke-width="3" />
        <text x="25" y="32" text-anchor="middle" fill="white" font-family="Arial" font-weight="bold" font-size="20">${iconChar}</text>
        <rect x="5" y="45" width="40" height="15" rx="4" fill="#131318" stroke="${color}" stroke-width="1" fill-opacity="0.9" />
        <text x="25" y="56" text-anchor="middle" fill="${color}" font-family="Michroma, sans-serif" font-weight="bold" font-size="8">${freeSlots}/${totalSlots}</text>
    </svg>`;

    const icon = L.divIcon({
        className: 'custom-div-icon',
        html: svg,
        iconSize: [40, 50],
        iconAnchor: [20, 50]
    });

    const marker = L.marker([parseFloat(lat), parseFloat(lng)], { icon: icon }).addTo(mapInstance);
    
    // Add tooltip on hover (shows name and location)
    const tooltipContent = `<div style="color:#fff; font-family:Michroma; font-size:11px; font-weight:bold;">${station.name}</div><div style="color:#aaa; font-size:9px;">${lat?.toFixed(4)}, ${lng?.toFixed(4)}</div>`;
    marker.bindTooltip(tooltipContent, {
        direction: 'top',
        offset: [0, -25],
        className: 'custom-tooltip'
    });
    
    marker.bindPopup(buildPopupHTML(station, riskLevel, load));

    return marker;
}

/**
 * Builds rich popup HTML for a station marker.
 */
function buildPopupHTML(station, riskLevel, load) {
    const freeSlots = station.free_slots ?? '?';
    const totalSlots = station.total_slots ?? '?';
    const charger = station.charger_type || 'Standard';
    const dist = station.dist ? station.dist.toFixed(2) : '--';
    const riskColor = riskLevel === 'HIGH' ? '#ef4444' : riskLevel === 'MODERATE' ? '#f59e0b' : '#10b981';

    return `
        <div style="background:#1f1f25;padding:12px;border-radius:10px;min-width:200px;font-family:'Michroma',sans-serif;color:white;">
            <div style="font-size:14px;font-weight:700;margin-bottom:8px;">${station.name || 'Unknown Station'}</div>
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
                <span style="background:${riskColor}20;color:${riskColor};border:1px solid ${riskColor}40;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;">${riskLevel} LOAD</span>
                <span style="color:#fff8;font-size:11px;">${load ?? 0}%</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1.2fr;gap:6px 12px;font-size:11px;color:#fff8;">
                <div>Slots</div><div style="color:#BFFF00;font-weight:600;">${freeSlots} / ${totalSlots} free</div>
                <div>Charger</div><div style="font-weight:600;">${charger}</div>
                <div>Distance</div><div style="color:#BFFF00;">${dist} km</div>
            </div>
        </div>`;
}

// =============================================================
// MODULE 2: SoC-Weighted Station Scoring
// =============================================================

function calcSoCWeightedScore(station, soc) {
    const dist = station.dist ?? 999;
    const load = station.grid_load ?? 50;
    const freeSlots = station.free_slots ?? 0;
    const totalSlots = station.total_slots ?? 1;
    const slotRatio = freeSlots / totalSlots;

    let wDist, wLoad, wSlots;
    if (soc < 15) { wDist = 0.80; wLoad = 0.10; wSlots = 0.10; }
    else if (soc < 40) { wDist = 0.55; wLoad = 0.30; wSlots = 0.15; }
    else { wDist = 0.35; wLoad = 0.40; wSlots = 0.25; }

    const distScore = Math.max(0, 1 - (dist / 30));
    const loadScore = Math.max(0, 1 - (load / 100));
    const score = (distScore * wDist + loadScore * wLoad + slotRatio * wSlots) * 100;
    return Math.round(score * 10) / 10;
}

function rankStationsBySoC(stations, soc) {
    return stations
        .map(st => ({ ...st, weightedScore: calcSoCWeightedScore(st, soc) }))
        .sort((a, b) => b.weightedScore - a.weightedScore);
}

// =============================================================
// MODULE 3: Supabase Real-Time Subscription
// =============================================================

function subscribeToStations(userLat, userLng, radiusKm, mapInstance, userChargerType, onRedirectNeeded) {
    if (!window.supabaseClient) return null;
    unsubscribeStations();
    updateConnectionStatus('connecting');

    realtimeChannel = window.supabaseClient
        .channel('stations-live')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'stations' }, (payload) => {
            const st = payload.new;
            const stLat = st.lat ?? st.latitude;
            const stLng = st.lng ?? st.longitude;

            if (stLat && stLng && window.haversineKm) {
                const dist = window.haversineKm(userLat, userLng, stLat, stLng);
                if (dist > radiusKm) return;
                st.dist = dist;
            }

            const cacheIdx = stationsCache.findIndex(s => s.id === st.id);
            if (cacheIdx >= 0) stationsCache[cacheIdx] = { ...stationsCache[cacheIdx], ...st };

            updateMarkerLive(st, mapInstance, userChargerType);

            if (assignedStationId && st.id === assignedStationId) {
                if (st.free_slots === 0 || st.grid_load > 75) {
                    if (onRedirectNeeded) onRedirectNeeded(st, stationsCache);
                }
            }
        })
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') updateConnectionStatus('connected');
            else if (status === 'CHANNEL_ERROR') updateConnectionStatus('error');
        });

    return realtimeChannel;
}

function unsubscribeStations() {
    if (realtimeChannel && window.supabaseClient) {
        window.supabaseClient.removeChannel(realtimeChannel);
        realtimeChannel = null;
        updateConnectionStatus('disconnected');
    }
}

function updateMarkerLive(station, mapInstance, userChargerType) {
    if (!mapInstance) return;
    const stId = station.id;
    if (stationMarkerMap[stId]) {
        mapInstance.removeLayer(stationMarkerMap[stId]);
        delete stationMarkerMap[stId];
    }
    const marker = buildStationMarker(station, userChargerType, mapInstance);
    if (marker) stationMarkerMap[stId] = marker;
}

function updateConnectionStatus(status) {
    connectionStatus = status;
    const pill = document.getElementById('rt-status');
    if (!pill) return;
    pill.classList.remove('hidden');
    const dot = pill.querySelector('.rt-dot');
    const label = pill.querySelector('.rt-label');
    if (status === 'connected') { if (dot) dot.style.background = '#10b981'; if (label) label.textContent = 'LIVE'; }
    else if (status === 'connecting') { if (dot) dot.style.background = '#f59e0b'; if (label) label.textContent = 'SYNC...'; }
    else if (status === 'error') { if (dot) dot.style.background = '#ef4444'; if (label) label.textContent = 'ERROR'; }
}

// =============================================================
// MODULE 4: Auto-Redirect Engine
// =============================================================

function handleAutoRedirect(criticalStation, allStations) {
    const candidates = allStations.filter(s =>
        s.id !== criticalStation.id &&
        (s.free_slots ?? 0) >= REDIRECT_MIN_SLOTS &&
        (s.grid_load ?? 100) <= 75
    );

    if (candidates.length === 0) return null;

    let currentSoC = 50;
    const slider = document.getElementById('soc-slider');
    if (slider) currentSoC = parseInt(slider.value, 10);

    const ranked = rankStationsBySoC(candidates, currentSoC);
    const bestAlt = ranked[0];
    assignedStationId = bestAlt.id;

    return {
        original: criticalStation,
        alternative: bestAlt,
        reason: criticalStation.free_slots === 0 ? 'All slots occupied' : `Grid load at ${criticalStation.grid_load}%`,
        originalRisk: { risk: 'HIGH', load: criticalStation.grid_load, color: '#ef4444' },
        altRisk: { risk: (bestAlt.grid_load ?? 0) > 55 ? 'MODERATE' : 'LOW', load: bestAlt.grid_load ?? 0, color: (bestAlt.grid_load ?? 0) > 55 ? '#f59e0b' : '#10b981' }
    };
}

// EXPORTS
window.subscribeToStations = subscribeToStations;
window.unsubscribeStations = unsubscribeStations;
window.buildStationMarker = buildStationMarker;
window.calcSoCWeightedScore = calcSoCWeightedScore;
window.rankStationsBySoC = rankStationsBySoC;
window.handleAutoRedirect = handleAutoRedirect;
window.stationsCache = stationsCache;
window.stationMarkerMap = stationMarkerMap;
window.setAssignedStation = function(id) { assignedStationId = id; };
