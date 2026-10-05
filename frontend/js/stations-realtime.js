// ============================================================
// GridPulz — Stations Real-Time Sync Module
// ============================================================
// Modules:
//   1. Supabase Real-Time Subscription (postgres_changes)
//   2. Dynamic Marker Builder (color + label + charger icon)
//   3. SoC-Weighted Station Scoring
//   4. Auto-Redirect Trigger Engine
// ============================================================

// ─── State ──────────────────────────────────────────────────
let stationsCache = [];           // All stations from last fetch
let stationMarkerMap = {};        // { stationId: L.marker }
let realtimeChannel = null;       // Supabase channel ref
let assignedStationId = null;     // The station the user was routed to
let currentRouteLayer = null;     // Active polyline on map
let cancelledRouteLayer = null;   // Struck-through polyline
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
 * @param {string} stChargerType - Station's charger type
 * @param {string} userChargerType - User's vehicle charger type
 */
function chargerIcon(stChargerType, userChargerType) {
    if (!stChargerType || !userChargerType) return '⚡';
    return stChargerType === userChargerType ? '⚡' : '✕';
}

/**
 * Builds a rich Leaflet DivIcon marker with 3 data dimensions:
 *   - Color: grid health (green/amber/red)
 *   - Label: free_slots / total_slots
 *   - Icon: charger type compatibility (⚡ or ✕)
 */
function buildStationMarker(station, userChargerType, mapInstance) {
    const load = station.grid_load ?? 0;
    const color = gridColor(load);
    const freeSlots = station.free_slots ?? '?';
    const totalSlots = station.total_slots ?? '?';
    const icon = chargerIcon(station.charger_type, userChargerType);
    const lat = station.lat ?? station.latitude;
    const lng = station.lng ?? station.longitude;

    if (!lat || !lng) return null;

    const riskLevel = load > 75 ? 'HIGH' : load > 55 ? 'MODERATE' : 'LOW';
    const riskClass = load > 75 ? 'animate-pulse' : '';

    const markerHtml = `
        <div class="station-marker-container" style="position:relative;width:44px;height:56px;">
            <div class="${riskClass}" style="
                background:${color};
                border-radius:50%;
                width:36px;height:36px;
                display:flex;align-items:center;justify-content:center;
                color:#fff;font-size:14px;font-weight:700;
                border:3px solid #131318;
                box-shadow:0 0 12px ${color}80;
                margin:0 auto;
            ">${icon}</div>
            <div style="
                position:absolute;bottom:0;left:50%;transform:translateX(-50%);
                background:#131318ee;border:1px solid ${color}60;
                border-radius:6px;padding:1px 5px;
                font-family:'Space Grotesk',sans-serif;
                font-size:9px;font-weight:600;
                color:${color};white-space:nowrap;
                letter-spacing:0.5px;
            ">${freeSlots}/${totalSlots}</div>
        </div>`;

    const divIcon = L.divIcon({
        className: 'bg-transparent',
        html: markerHtml,
        iconSize: [44, 56],
        iconAnchor: [22, 56],
        popupAnchor: [0, -56]
    });

    const marker = L.marker([lat, lng], { icon: divIcon });
    marker.bindPopup(buildPopupHTML(station, riskLevel, load));

    if (mapInstance) marker.addTo(mapInstance);
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
        <div style="background:#1f1f25;padding:10px 12px;border-radius:10px;min-width:180px;font-family:'Space Grotesk',sans-serif;">
            <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:6px;">${station.name || 'Unknown Station'}</div>
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
                <span style="background:${riskColor}20;color:${riskColor};border:1px solid ${riskColor}40;padding:2px 8px;border-radius:20px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">${riskLevel} LOAD</span>
                <span style="color:#fff8;font-size:10px;">${load ?? 0}%</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:10px;color:#fff8;">
                <div>Slots</div><div style="color:#BFFF00;font-weight:600;">${freeSlots} / ${totalSlots} free</div>
                <div>Charger</div><div style="font-weight:600;">${charger}</div>
                <div>Distance</div><div style="color:#BFFF00;">${dist} km</div>
            </div>
        </div>`;
}


// =============================================================
// MODULE 2: SoC-Weighted Station Scoring
// =============================================================

/**
 * Calculates a station's attractiveness score with dynamic SoC-based weights.
 *
 * Low SoC (<15%): Distance dominates (W=0.80) — get there fast.
 * Mid SoC (15-40%): Balanced scoring.
 * High SoC (>40%): Grid load weight rises (W=0.40) — protect the grid.
 *
 * Higher score = better station choice.
 */
function calcSoCWeightedScore(station, soc) {
    const dist = station.dist ?? 999;
    const load = station.grid_load ?? 50;
    const freeSlots = station.free_slots ?? 0;
    const totalSlots = station.total_slots ?? 1;
    const slotRatio = freeSlots / totalSlots; // 0–1, higher = more available

    let wDist, wLoad, wSlots;

    if (soc < 15) {
        // Emergency — distance is everything
        wDist = 0.80; wLoad = 0.10; wSlots = 0.10;
    } else if (soc < 40) {
        // Cautious — balance distance + grid
        wDist = 0.55; wLoad = 0.30; wSlots = 0.15;
    } else {
        // Comfortable — can optimise for grid health
        wDist = 0.35; wLoad = 0.40; wSlots = 0.25;
    }

    // Normalize distance: closer = higher score (max 30km)
    const distScore = Math.max(0, 1 - (dist / 30));
    // Normalize load: lower = higher score
    const loadScore = Math.max(0, 1 - (load / 100));
    // Slot score: more = better
    const slotScore = slotRatio;

    const score = (distScore * wDist + loadScore * wLoad + slotScore * wSlots) * 100;
    return Math.round(score * 10) / 10;
}

/**
 * Ranks stations by SoC-weighted score, returns sorted array.
 */
function rankStationsBySoC(stations, soc) {
    return stations
        .map(st => ({ ...st, weightedScore: calcSoCWeightedScore(st, soc) }))
        .sort((a, b) => b.weightedScore - a.weightedScore);
}


// =============================================================
// MODULE 3: Supabase Real-Time Subscription
// =============================================================

/**
 * Subscribes to live changes on the `stations` table.
 * Filters by radius from user's GPS and updates markers in real time.
 *
 * @param {number} userLat
 * @param {number} userLng
 * @param {number} radiusKm
 * @param {L.Map} mapInstance - Leaflet map
 * @param {string} userChargerType - From user profile
 * @param {Function} onRedirectNeeded - Callback when active station goes critical
 */
function subscribeToStations(userLat, userLng, radiusKm, mapInstance, userChargerType, onRedirectNeeded) {
    if (!window.supabaseClient) {
        console.warn('[GridPulz RT] Supabase client not available.');
        updateConnectionStatus('error');
        return null;
    }

    // Unsubscribe from any existing channel
    unsubscribeStations();

    updateConnectionStatus('connecting');

    realtimeChannel = window.supabaseClient
        .channel('stations-live')
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'stations'
        }, (payload) => {
            const st = payload.new;
            const stLat = st.lat ?? st.latitude;
            const stLng = st.lng ?? st.longitude;

            // Only process stations within radius
            if (stLat && stLng && window.haversineKm) {
                const dist = window.haversineKm(userLat, userLng, stLat, stLng);
                if (dist > radiusKm) return;
                st.dist = dist;
            }

            console.log(`[GridPulz RT] Station update: ${st.name} | Load: ${st.grid_load}% | Slots: ${st.free_slots}/${st.total_slots}`);

            // Update cache
            const cacheIdx = stationsCache.findIndex(s => s.id === st.id);
            if (cacheIdx >= 0) {
                stationsCache[cacheIdx] = { ...stationsCache[cacheIdx], ...st };
            }

            // Update marker on map
            updateMarkerLive(st, mapInstance, userChargerType);

            // Auto-redirect trigger: if this is the user's assigned station
            if (assignedStationId && st.id === assignedStationId) {
                const risk = st.grid_load > 75 ? 'HIGH' : st.grid_load > 55 ? 'MODERATE' : 'LOW';
                if (st.free_slots === 0 || risk === 'HIGH') {
                    console.warn(`[GridPulz RT] REDIRECT TRIGGER: Station ${st.name} — slots:${st.free_slots}, load:${st.grid_load}%`);
                    if (onRedirectNeeded) {
                        onRedirectNeeded(st, stationsCache);
                    }
                }
            }
        })
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                updateConnectionStatus('connected');
                console.log('[GridPulz RT] Real-time channel ACTIVE — listening to station changes.');
            } else if (status === 'CHANNEL_ERROR') {
                updateConnectionStatus('error');
                console.error('[GridPulz RT] Channel error.');
            } else if (status === 'CLOSED') {
                updateConnectionStatus('disconnected');
            }
        });

    return realtimeChannel;
}

/**
 * Unsubscribe from the realtime channel.
 */
function unsubscribeStations() {
    if (realtimeChannel && window.supabaseClient) {
        window.supabaseClient.removeChannel(realtimeChannel);
        realtimeChannel = null;
        updateConnectionStatus('disconnected');
    }
}

/**
 * Live-update a single marker on the map when a station record changes.
 */
function updateMarkerLive(station, mapInstance, userChargerType) {
    if (!mapInstance) return;

    const stId = station.id;

    // Remove old marker if exists
    if (stationMarkerMap[stId]) {
        mapInstance.removeLayer(stationMarkerMap[stId]);
        delete stationMarkerMap[stId];
    }

    // Build and add new marker
    const marker = buildStationMarker(station, userChargerType, mapInstance);
    if (marker) {
        stationMarkerMap[stId] = marker;
    }
}

/**
 * Updates the connection status indicator in the UI.
 */
function updateConnectionStatus(status) {
    connectionStatus = status;
    const pill = document.getElementById('rt-status');
    if (!pill) return;

    pill.classList.remove('hidden');
    const dot = pill.querySelector('.rt-dot');
    const label = pill.querySelector('.rt-label');

    if (status === 'connected') {
        if (dot) { dot.style.background = '#10b981'; dot.style.boxShadow = '0 0 8px #10b98180'; }
        if (label) label.textContent = 'LIVE';
    } else if (status === 'connecting') {
        if (dot) { dot.style.background = '#f59e0b'; dot.style.boxShadow = '0 0 8px #f59e0b80'; }
        if (label) label.textContent = 'SYNC...';
    } else if (status === 'error') {
        if (dot) { dot.style.background = '#ef4444'; dot.style.boxShadow = '0 0 8px #ef444480'; }
        if (label) label.textContent = 'ERROR';
    } else {
        if (dot) { dot.style.background = '#6b7280'; dot.style.boxShadow = 'none'; }
        if (label) label.textContent = 'OFFLINE';
    }
}


// =============================================================
// MODULE 4: Auto-Redirect Engine
// =============================================================

/**
 * Triggered when the user's assigned station goes critical.
 * Finds the best alternative and fires the redirect flow.
 *
 * @param {Object} criticalStation - The station that triggered the redirect
 * @param {Array} allStations - Cached station list
 */
function handleAutoRedirect(criticalStation, allStations) {
    // Filter alternatives: not the overloaded one, must have >= REDIRECT_MIN_SLOTS free
    const candidates = allStations.filter(s =>
        s.id !== criticalStation.id &&
        (s.free_slots ?? 0) >= REDIRECT_MIN_SLOTS &&
        (s.grid_load ?? 100) <= 75    // ML gate: no HIGH risk targets
    );

    if (candidates.length === 0) {
        console.warn('[GridPulz RT] No viable redirect targets available.');
        return null;
    }

    // Sort by SoC-weighted score (use current SoC from slider if available)
    let currentSoC = 50;
    const slider = document.getElementById('soc-slider');
    if (slider) currentSoC = parseInt(slider.value, 10);

    const ranked = rankStationsBySoC(candidates, currentSoC);
    const bestAlt = ranked[0];

    // Update the assigned station
    assignedStationId = bestAlt.id;

    return {
        original: criticalStation,
        alternative: bestAlt,
        reason: criticalStation.free_slots === 0
            ? `${criticalStation.name}: All slots occupied`
            : `${criticalStation.name}: Grid load at ${criticalStation.grid_load}% (Peak)`,
        originalRisk: { risk: 'HIGH', load: criticalStation.grid_load, color: '#ef4444' },
        altRisk: {
            risk: (bestAlt.grid_load ?? 0) > 55 ? 'MODERATE' : 'LOW',
            load: bestAlt.grid_load ?? 0,
            color: (bestAlt.grid_load ?? 0) > 55 ? '#f59e0b' : '#10b981'
        }
    };
}


// =============================================================
// EXPORTS (window globals for cross-module use)
// =============================================================
window.subscribeToStations = subscribeToStations;
window.unsubscribeStations = unsubscribeStations;
window.buildStationMarker = buildStationMarker;
window.calcSoCWeightedScore = calcSoCWeightedScore;
window.rankStationsBySoC = rankStationsBySoC;
window.handleAutoRedirect = handleAutoRedirect;
window.stationsCache = stationsCache;
window.stationMarkerMap = stationMarkerMap;
window.assignedStationId = null;
window.setAssignedStation = function(id) { assignedStationId = id; window.assignedStationId = id; };
