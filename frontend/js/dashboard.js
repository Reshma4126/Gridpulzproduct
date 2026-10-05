// ============================================================
// GridPulz — EV Driver Dashboard Controller
// ============================================================
// Modules:
//   1. Toast Notifications
//   2. Session & Vehicle Profile
//   3. Tab Navigation (Charge Now / Prebook)
//   4. Charge Now API & Logic
//   5. Prebook Slots API & Logic
// ============================================================

const API_BASE_URL = "http://localhost:8000/api";

// ─── DOM Helpers ────────────────────────────────────────────
function el(id) { return document.getElementById(id); }

// ─── State ──────────────────────────────────────────────────
let currentLat = null;
let currentLng = null;
let userProfile = null;
let currentSession = null;
let upcomingBookings = JSON.parse(localStorage.getItem('gridpulz_upcoming') || '[]');

function saveUpcoming() {
    localStorage.setItem('gridpulz_upcoming', JSON.stringify(upcomingBookings));
}
let liveMap = null;
let mapMarkers = [];

// =============================================================
// API TIER
// =============================================================

function simulateQueuePush(soc, station, overrideId = null) {
    if (!station || !station.name) return;
    try {
        let q = JSON.parse(localStorage.getItem('gridpulz_queue') || '[]');
        let sIdx = 0;
        if (station.name.includes('Beta')) sIdx = 1;
        if (station.name.includes('Gamma')) sIdx = 2;
        
        const vName = userProfile && userProfile.vehicle_name !== 'Not set' ? userProfile.vehicle_name : ('Driver-' + Math.floor(Math.random()*1000));
        q.push({
            id: overrideId || (Date.now() + Math.random()),
            name: vName,
            user_id: window.currentSession?.user?.id || 'demo',
            battery: soc,
            stationIdx: sIdx,
            waitMins: 0,
            timestamp: Date.now(),
            isExternal: true
        });
        localStorage.setItem('gridpulz_queue', JSON.stringify(q));
    } catch(e) {}
}

// =============================================================
// MODULE: Grid Safeguard — Station Risk Assessment & Rerouting
// =============================================================

/**
 * Assess a station's risk level based on grid_load.
 * Simulates what an ML model would return.
 */
function assessStationRisk(station) {
    // grid_load comes from Supabase station record; fall back to random simulation
    const load = station.grid_load ?? station.gridLoad ?? Math.floor(Math.random() * 100);
    if (load > 75) return { risk: 'HIGH', load, color: '#ef4444' };
    if (load > 50) return { risk: 'MODERATE', load, color: '#f59e0b' };
    return { risk: 'LOW', load, color: '#10b981' };
}

/**
 * Find the best alternative station (closest + LOW risk).
 * Mirrors the FastAPI `find_best_alternative` logic.
 */
function findBestAlternative(stations, excludeStation) {
    // 1. Filter out the overloaded station
    const candidates = stations.filter(s => s.name !== excludeStation.name);
    // 2. Filter for LOW or MODERATE risk only
    const stable = candidates.filter(s => assessStationRisk(s).risk !== 'HIGH');
    // 3. Sort by distance (already have dist calculated via Haversine)
    stable.sort((a, b) => (a.dist || 999) - (b.dist || 999));
    // 4. Return the closest stable station, or first candidate as last resort
    return stable[0] || candidates[0] || null;
}

async function apiChargeNow(soc) {
    // 1. Get all nearby stations
    let allStations = [];
    let bestStation = { name: 'Fallback Station Alpha', dist: '--' };

    if (currentLat && currentLng && window.getNearbyStations) {
        try {
            allStations = await window.getNearbyStations(currentLat, currentLng, 30);
            
            // 2. Use SoC-weighted scoring if available, else fall back to closest
            if (allStations.length > 0 && window.rankStationsBySoC) {
                const ranked = window.rankStationsBySoC(allStations, soc);
                bestStation = ranked[0];
                allStations = ranked; // Keep sorted order
            } else if (allStations.length > 0) {
                bestStation = allStations[0];
            }
        } catch (e) {
            console.warn("Failed to get nearby stations:", e);
        }
    }

    return new Promise(resolve => {
        setTimeout(() => {
            // 3. Assess the best station's risk
            const risk = assessStationRisk(bestStation);

            // 4. Grid Safeguard Trigger: If HIGH risk, reroute
            if (risk.risk === 'HIGH') {
                const alternative = findBestAlternative(allStations, bestStation);
                if (alternative) {
                    const altRisk = assessStationRisk(alternative);
                    simulateQueuePush(soc, alternative);
                    // Track assigned station for realtime redirect monitoring
                    if (window.setAssignedStation) window.setAssignedStation(alternative.id);
                    resolve({
                        status: 'rerouted',
                        original_station: bestStation,
                        original_risk: risk,
                        station: alternative,
                        station_risk: altRisk,
                        reason: `${bestStation.name} is at ${risk.load}% grid load (Peak Load). Grid Safeguard has optimized your route.`,
                        slot_time: 'Immediate'
                    });
                } else {
                    simulateQueuePush(soc, bestStation);
                    if (window.setAssignedStation) window.setAssignedStation(bestStation.id);
                    resolve({
                        status: 'confirmed',
                        station: bestStation,
                        station_risk: risk,
                        slot_time: 'Immediate',
                        warning: 'All stations are under high load.'
                    });
                }
            } else {
                // 5. Station is safe — confirm normally
                simulateQueuePush(soc, bestStation);
                if (window.setAssignedStation) window.setAssignedStation(bestStation.id);
                resolve({
                    status: 'confirmed',
                    station: bestStation,
                    station_risk: risk,
                    slot_time: 'Immediate'
                });
            }
        }, 1200);
    });
}

async function apiPrebook(soc, date, time) {
    let targetStation = { name: 'Fallback Station Alpha' };
    if (currentLat && currentLng && window.getNearbyStations) {
        try {
            const nearby = await window.getNearbyStations(currentLat, currentLng, 30);
            if (nearby.length > 0) targetStation = nearby[0];
        } catch (e) {}
    }

    return new Promise(resolve => {
        setTimeout(() => {
            const bookingId = "BK-" + Math.floor(Math.random() * 90000 + 10000);
            // DO NOT push to queue immediately — JIT engine will do it at buffer window
            resolve({
                status: "confirmed",
                booking_id: bookingId,
                station: targetStation,
                scheduled_time: `${date}T${time}:00`
            });
        }, 800);
    });
}

// =============================================================
// MODULE: Toast Notifications
// =============================================================
function showToast(message, type = 'info', durationMs = 4000) {
    const container = el('toast-container');
    const icons = { success: 'check_circle', error: 'error', warning: 'warning', info: 'info' };
    const colors = {
        success: 'border-green-500/40 bg-green-500/10 text-green-300',
        error: 'border-red-500/40 bg-red-500/10 text-red-300',
        warning: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300',
        info: 'border-[#BFFF00]/40 bg-[#BFFF00]/10 text-[#BFFF00]',
    };

    const toast = document.createElement('div');
    toast.className = `pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-xl text-xs font-body shadow-2xl toast-enter ${colors[type] || colors.info}`;
    toast.innerHTML = `<span class="material-symbols-outlined text-base">${icons[type] || icons.info}</span><span class="flex-1">${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove('toast-enter');
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 300);
    }, durationMs);
}

// =============================================================
// MODULE: Session & Profile
// =============================================================
async function initSession() {
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError || !session || !session.user) {
        window.location.href = 'login.html';
        return null;
    }
    currentSession = session;
    return session;
}

async function loadVehicleProfile(email, userName) {
    el('sidebar-driver-name').textContent = userName;
    el('sidebar-driver-email').textContent = email;

    // Helper: get cached profile from localStorage
    const getCachedProfile = () => {
        try { return JSON.parse(localStorage.getItem('gridpulz_profile_' + email) || 'null'); } catch(e) { return null; }
    };

    try {
        const { data: profile } = await supabaseClient.from('users').select('*').eq('email', email).single();
        if (profile) {
            // Merge any local overrides on top of DB data
            const cached = getCachedProfile();
            userProfile = cached ? { ...profile, ...cached } : profile;
        } else {
            // Try localStorage first, then Auth metadata
            const cached = getCachedProfile();
            if (cached) {
                userProfile = cached;
            } else {
                const m = currentSession?.user?.user_metadata || {};
                userProfile = {
                    email: email,
                    vehicle_name: m.vehicle_name || 'Not set',
                    charging_capacity: m.charging_capacity || null,
                    charging_type: m.charging_type || null
                };
            }
            // Silently attempt insert for future persistence
            supabaseClient.from('users').insert([{ email, username: userName, vehicle_name: userProfile.vehicle_name, charging_capacity: userProfile.charging_capacity, charging_type: userProfile.charging_type }]).then(()=>{});
        }
    } catch(err) {
        // Use localStorage cache, then Auth metadata as final fallback
        const cached = getCachedProfile();
        if (cached) {
            userProfile = cached;
        } else {
            const m = currentSession?.user?.user_metadata || {};
            userProfile = {
                email: email,
                vehicle_name: m.vehicle_name || 'Not saved yet',
                charging_capacity: m.charging_capacity || null,
                charging_type: m.charging_type || null
            };
        }
    }

    if (el('vehicle-name')) el('vehicle-name').textContent = userProfile.vehicle_name || 'Not saved yet';
    if (el('vehicle-capacity')) el('vehicle-capacity').textContent = userProfile.charging_capacity ? `${userProfile.charging_capacity} kWh` : '— kWh';
    if (el('vehicle-charging-type')) el('vehicle-charging-type').textContent = userProfile.charging_type || '—';
    if (el('vehicle-email')) el('vehicle-email').textContent = email;
}

function initProfileEditor() {
    const btnEdit = el('btn-edit-profile');
    if (!btnEdit) return;
    const btnCancel = el('btn-cancel-profile');
    const btnSave = el('btn-save-profile');
    const views = document.querySelectorAll('.profile-view');
    const edits = document.querySelectorAll('.profile-edit');

    btnEdit.addEventListener('click', () => {
        // Pre-fill
        el('edit-vehicle-name').value = userProfile?.vehicle_name || '';
        el('edit-vehicle-capacity').value = userProfile?.charging_capacity || '';
        if (userProfile?.charging_type) {
            el('edit-vehicle-charging-type').value = userProfile.charging_type;
        }

        // Toggle UI
        views.forEach(el => el.classList.add('hidden'));
        edits.forEach(el => el.classList.remove('hidden'));
        btnEdit.classList.add('hidden');
        btnSave.classList.remove('hidden');
    });

    btnSave.addEventListener('click', async () => {
        btnSave.innerHTML = `<span class="material-symbols-outlined text-xs animate-spin">refresh</span>`;
        btnSave.disabled = true;

        const newData = {
            vehicle_name: el('edit-vehicle-name').value,
            charging_capacity: parseInt(el('edit-vehicle-capacity').value, 10),
            charging_type: el('edit-vehicle-charging-type').value
        };

        // Always save locally first
        userProfile = { ...userProfile, ...newData };
        try {
            if (currentSession?.user?.email) {
                localStorage.setItem('gridpulz_profile_' + currentSession.user.email, JSON.stringify(userProfile));
            }
        } catch(e) {}

        // Update UI immediately
        el('vehicle-name').textContent = userProfile.vehicle_name || 'Not set';
        el('vehicle-capacity').textContent = userProfile.charging_capacity ? `${userProfile.charging_capacity} kWh` : '— kWh';
        el('vehicle-charging-type').textContent = userProfile.charging_type || '—';
        if (el('sidebar-driver-name')) el('sidebar-driver-name').textContent = userProfile.vehicle_name || 'Driver';

        showToast('Profile updated successfully!', 'success');

        // Best-effort Supabase sync (non-blocking)
        try {
            if (supabaseClient && currentSession?.user?.email) {
                const { data: existing } = await supabaseClient.from('users').select('id').eq('email', currentSession.user.email).single();
                if (existing) {
                    await supabaseClient.from('users').update(newData).eq('email', currentSession.user.email);
                } else {
                    await supabaseClient.from('users').insert([{ email: currentSession.user.email, ...newData }]);
                }
            }
        } catch (e) {
            console.warn('Supabase sync (non-critical):', e);
        } finally {
            // Revert UI to view mode
            views.forEach(e => e.classList.remove('hidden'));
            edits.forEach(e => e.classList.add('hidden'));
            btnSave.classList.add('hidden');
            btnEdit.classList.remove('hidden');
            btnSave.innerHTML = `Save`;
            btnSave.disabled = false;
        }
    });
}

// =============================================================
// MODULE: Tab Navigation
// =============================================================

// =============================================================
// MY BOOKINGS (ACTIVE) LOGIC
// =============================================================

function renderActiveBookings() {
    const list = el('active-bookings-list');
    if (!list) return;

    let q = [];
    try { q = JSON.parse(localStorage.getItem('gridpulz_queue') || '[]'); } catch(e){}

    const uid = window.currentSession?.user?.id || 'demo';
    const myActive = q.filter(item => item.user_id === uid || (item.user_id === 'demo' && uid === 'demo'));

    if (myActive.length === 0) {
        list.innerHTML = `
            <div class="text-center py-10">
                <span class="material-symbols-outlined text-4xl text-on-surface-variant/10 mb-2 block">bolt</span>
                <p class="text-[10px] text-on-surface-variant/40 uppercase tracking-widest">No active requests</p>
            </div>`;
        return;
    }

    const now = Date.now();
    list.innerHTML = myActive.map((b, i) => {
        const timeSpent = Math.floor((now - b.timestamp) / 60000);
        let stationName = 'Target Station';
        if (b.stationIdx === 1) stationName = 'Beta Station';
        if (b.stationIdx === 2) stationName = 'Gamma Station';
        if (b.stationIdx === 0) stationName = 'Alpha Station';
        
        return `
        <div class="bg-white/[0.03] border border-neon/20 p-4 rounded-xl fade-up fade-up-d${i+1 > 3 ? 3 : i+1}">
            <div class="flex items-center gap-4">
                <div class="bg-neon/10 border border-neon/20 w-12 h-12 rounded-lg flex flex-col items-center justify-center text-neon shrink-0">
                    <span class="material-symbols-outlined text-2xl">ev_station</span>
                </div>
                
                <div class="flex-1 min-w-0">
                    <h4 class="font-headline font-bold text-white text-sm truncate">${stationName}</h4>
                    <div class="text-[10px] text-on-surface-variant/50 uppercase tracking-widest mt-1 flex items-center gap-2">
                        <span class="flex items-center gap-0.5"><span class="material-symbols-outlined text-[12px]">schedule</span> active: +${timeSpent}m</span>
                    </div>
                </div>
                
                <button onclick="cancelActiveBooking('${b.id}')" class="text-red-400/50 hover:text-red-400 hover:bg-red-400/10 p-2 rounded transition-colors" title="Cancel Booking">
                    <span class="material-symbols-outlined text-lg">cancel</span>
                </button>
            </div>
            <div class="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-neon/10 border border-neon/30">
                    <span class="material-symbols-outlined text-[12px] text-neon">electric_bolt</span>
                    <span class="text-[9px] uppercase tracking-widest text-neon font-bold">Actively Booked</span>
                </div>
                <span class="text-[9px] font-mono text-on-surface-variant/30">${b.battery}% Target SoC</span>
            </div>
        </div>`;
    }).join('');
}

window.cancelActiveBooking = function(id) {
    showModal(
        'Cancel Reservation', 
        `Are you sure you want to cancel this immediate slot?`,
        'event_busy',
        'Cancel Slot',
        'Keep It',
        'bg-red-500 text-white hover:bg-red-600 shadow-[0_0_15px_rgba(239,68,68,0.3)]',
        () => {
            try {
                let q = JSON.parse(localStorage.getItem('gridpulz_queue') || '[]');
                q = q.filter(item => item.id !== id && item.id != id); // loose equality in case of string/int
                localStorage.setItem('gridpulz_queue', JSON.stringify(q));
            } catch(e) {}
            if (el('active-bookings-list')) renderActiveBookings();
            showToast('Slot cancelled successfully.', 'info');
        }
    );
};

function initMyBookings() {
    if (!el('active-bookings-list') && !el('upcoming-bookings-list')) return;
    if (el('upcoming-bookings-list')) renderUpcomingBookings();
    if (el('active-bookings-list')) renderActiveBookings();
    
    // Live update
    setInterval(() => {
        if (el('active-bookings-list')) renderActiveBookings();
    }, 5000);
}


function initTabs() {
    const tabs = [
        { btn: el('tab-btn-charge'),     content: el('tab-content-charge') },
        { btn: el('tab-btn-prebook'),     content: el('tab-content-prebook') },
        { btn: el('tab-btn-stationmap'),  content: el('tab-content-stationmap') }
    ];

    function activateTab(index) {
        tabs.forEach((t, i) => {
            if (!t.btn || !t.content) return;
            if (i === index) {
                t.btn.classList.remove('text-on-surface-variant/40', 'border-transparent');
                t.btn.classList.add('text-neon', 'border-neon');
                t.content.classList.remove('hidden');
            } else {
                t.btn.classList.remove('text-neon', 'border-neon');
                t.btn.classList.add('text-on-surface-variant/40', 'border-transparent');
                t.content.classList.add('hidden');
            }
        });
        // Start map sync timer when Station Map tab is activated
        if (index === 2 && !window._mapSyncStarted) {
            window._mapSyncStarted = true;
            startMapSync();
        }
    }

    tabs.forEach((t, i) => {
        if (t.btn) t.btn.addEventListener('click', () => activateTab(i));
    });
}

/* ── Station Map Tab: SVG interaction functions ─────────────── */
let _mapZoomed = true;
let _mapSyncSec = 28;

function startMapSync() {
    setInterval(() => {
        _mapSyncSec--;
        if (_mapSyncSec <= 0) { _mapSyncSec = 30; doMapSync(); }
        const el2 = document.getElementById('sync-countdown');
        if (el2) el2.textContent = _mapSyncSec + 's';
    }, 1000);
}

function doMapSync() {
    const fl = document.getElementById('sync-flash');
    if (!fl) return;
    fl.style.transition = 'opacity 0s';
    fl.style.opacity = '1';
    setTimeout(() => { fl.style.transition = 'opacity 1.2s'; fl.style.opacity = '0'; }, 300);
}

function forceSync() { _mapSyncSec = 30; doMapSync(); }

function toggleZoom() {
    _mapZoomed = !_mapZoomed;
    const markers = document.getElementById('station-markers');
    const cluster = document.getElementById('cluster-view');
    const circle  = document.getElementById('prox-circle');
    if (markers) markers.style.display = _mapZoomed ? '' : 'none';
    if (cluster) cluster.setAttribute('display', _mapZoomed ? 'none' : '');
    if (circle)  circle.style.display = _mapZoomed ? '' : 'none';
    const lbl = document.getElementById('zoom-label');
    if (lbl) lbl.textContent = _mapZoomed ? 'Zoomed In' : 'Clustered';
}

// =============================================================
// MODULE: Charge Now Logic
// =============================================================

/**
 * Returns the user's vehicle charger type from their profile.
 */
function getUserChargerType() {
    if (userProfile && userProfile.charger_type) return userProfile.charger_type;
    return 'DC_FAST'; // Default
}

/**
 * Callback for real-time redirect — when the user's assigned station
 * goes critical (free_slots=0 or grid_load>75), auto-reroute.
 */
function handleLiveRedirect(criticalStation, allStations) {
    if (!window.handleAutoRedirect) return;

    const result = window.handleAutoRedirect(criticalStation, allStations);
    if (!result) {
        showToast('⚠ Your station is overloaded but no alternatives are available.', 'error', 8000);
        return;
    }

    // Show the reroute alert banner
    const rerouteAlert = el('reroute-alert');
    if (rerouteAlert) {
        rerouteAlert.classList.remove('hidden');
        rerouteAlert.innerHTML = `
            <div class="flex items-center gap-4 w-full">
                <div class="w-10 h-10 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center shrink-0">
                    <span class="material-symbols-outlined text-red-400 text-xl animate-pulse">crisis_alert</span>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="font-headline font-bold text-sm text-white uppercase tracking-wider">Live Redirect</span>
                        <span class="bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest animate-pulse">Real-Time</span>
                    </div>
                    <p class="text-xs text-on-surface-variant/70">
                        <strong class="text-red-400">${result.original.name}</strong>: ${result.reason}. 
                        Rerouted to <strong class="text-neon">${result.alternative.name}</strong> 
                        (${result.alternative.dist ? result.alternative.dist.toFixed(1) : '--'} km, ${result.altRisk.load}% load).
                    </p>
                </div>
                <button onclick="this.closest('#reroute-alert').classList.add('hidden')" class="text-white/30 hover:text-white p-1 rounded transition-colors shrink-0">
                    <span class="material-symbols-outlined text-lg">close</span>
                </button>
            </div>`;
    }

    // Redraw map route
    if (liveMap) {
        // Clear old routes
        mapMarkers.filter(m => m._path).forEach(m => liveMap.removeLayer(m));
        mapMarkers = mapMarkers.filter(m => !m._path);

        // Red dashed line to original (cancelled)
        const origLat = result.original.lat || result.original.latitude;
        const origLng = result.original.lng || result.original.longitude;
        if (origLat && origLng && currentLat) {
            const cancelledRoute = L.polyline([[currentLat, currentLng], [origLat, origLng]], {
                color: '#ef4444', weight: 2, dashArray: '6, 8', opacity: 0.4
            }).addTo(liveMap);
            mapMarkers.push(cancelledRoute);
        }

        // Neon line to alternative
        const altLat = result.alternative.lat || result.alternative.latitude;
        const altLng = result.alternative.lng || result.alternative.longitude;
        if (altLat && altLng && currentLat) {
            const newRoute = L.polyline([[currentLat, currentLng], [altLat, altLng]], {
                color: '#BFFF00', weight: 4, dashArray: '12, 6'
            }).addTo(liveMap);
            liveMap.fitBounds(newRoute.getBounds(), { padding: [50, 50] });
            mapMarkers.push(newRoute);
        }
    }

    showToast(`🔴 Live Redirect: ${result.original.name} → ${result.alternative.name}`, 'warning', 10000);
}

function initChargeNow() {
    const slider = el('soc-slider');
    if (!slider) return;
    const valueEl = el('soc-value');
    
    // Slider Visuals
    slider.addEventListener('input', () => {
        const val = slider.value;
        valueEl.innerHTML = `${val}<span class="text-lg text-neon/50">%</span>`;
    });

    // GPS
    const gpsBtn = el('gps-btn');
    if (gpsBtn) {
    gpsBtn.addEventListener('click', () => {
        if (!navigator.geolocation) return showToast('Geolocation not supported', 'error');
        el('current-location').textContent = 'Detecting...';
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                currentLat = pos.coords.latitude; currentLng = pos.coords.longitude;
                el('current-location').textContent = `${currentLat.toFixed(4)}, ${currentLng.toFixed(4)}`;
                showToast(`GPS locked`, 'success');
                
                // Track location & SoC to DB
                if (currentSession && currentSession.user && window.insertLiveData) {
                    const soc = parseInt(slider.value, 10);
                    window.insertLiveData(currentSession.user.id, soc, currentLat, currentLng);
                }
                
                // Initialize Map if not already
                if (!liveMap && el('live-map')) {
                    liveMap = L.map('live-map', { zoomControl: false }).setView([currentLat, currentLng], 13);
                    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                        attribution: '&copy; OpenStreetMap'
                    }).addTo(liveMap);
                } else if (liveMap) {
                    liveMap.setView([currentLat, currentLng], 13);
                }
                
                // Plot User Location
                mapMarkers.forEach(m => liveMap.removeLayer(m));
                mapMarkers = [];
                
                const userIcon = L.divIcon({ className: 'bg-transparent', html: `<div class="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-[0_0_20px_rgba(59,130,246,0.9)] animate-pulse"></div>`, iconSize: [16,16] });
                mapMarkers.push(L.marker([currentLat, currentLng], { icon: userIcon }).addTo(liveMap));
                
                // Fetch & Plot All Stations with Dynamic Markers
                try {
                    const nearby = await window.getNearbyStations(currentLat, currentLng, 99999);
                    const userCharger = getUserChargerType();
                    
                    // Populate station cache for realtime module
                    if (window.stationsCache) {
                        window.stationsCache.length = 0;
                        nearby.forEach(s => window.stationsCache.push(s));
                    }

                    const markerGroup = L.featureGroup();
                    markerGroup.addLayer(L.marker([currentLat, currentLng], { icon: userIcon }));

                    nearby.forEach(st => {
                        if (window.buildStationMarker) {
                            // Use rich 3-dimension markers from realtime module
                            const marker = window.buildStationMarker(st, userCharger, null);
                            if (marker) {
                                marker.addTo(liveMap);
                                mapMarkers.push(marker);
                                markerGroup.addLayer(marker);
                                if (window.stationMarkerMap) window.stationMarkerMap[st.id] = marker;
                            }
                        } else {
                            // Fallback to simple markers
                            const stRisk = assessStationRisk(st);
                            const color = stRisk.risk === 'HIGH' ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)]' : stRisk.risk === 'MODERATE' ? 'bg-yellow-500 shadow-[0_0_15px_rgba(245,158,11,0.8)]' : 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.8)]';
                            const stIcon = L.divIcon({ className: 'bg-transparent', html: `<div class="w-5 h-5 ${color} rounded-full border-2 border-[#131318]"></div>`, iconSize: [20,20] });
                            const m = L.marker([st.lat || st.latitude, st.lng || st.longitude], { icon: stIcon }).addTo(liveMap);
                            m.bindPopup(`<div class="bg-surface p-1"><strong class="block text-sm text-white mb-1 font-headline">${st.name}</strong><span class="text-[10px] uppercase tracking-widest text-[#BFFF00]">${st.dist ? st.dist.toFixed(2) : '--'} km away</span><br><span class="text-[9px]" style="color:${stRisk.color}">${stRisk.risk} Load (${stRisk.load}%)</span></div>`);
                            mapMarkers.push(m);
                            markerGroup.addLayer(m);
                        }
                    });
                    
                    // Zoom out map to show both the user and all loaded stations
                    liveMap.fitBounds(markerGroup.getBounds(), { padding: [50, 50], maxZoom: 14 });

                    // Start Supabase real-time subscription
                    if (window.subscribeToStations) {
                        window.subscribeToStations(
                            currentLat, currentLng, 30, liveMap, userCharger,
                            handleLiveRedirect
                        );
                    }
                } catch(e) { console.warn('Station fetch failed:', e); }

            },
            () => {
                el('current-location').textContent = 'Permission denied';
            }
        );
    });
    } // end if (gpsBtn)

    // API Call (Modal Trigger)
    const reqBtn = el('request-slot-btn');
    const bookingModal = el('confirm-booking-modal');
    if (!reqBtn || !bookingModal) return;
    
    reqBtn.addEventListener('click', () => {
        bookingModal.classList.remove('hidden');
    });

    el('modal-cancel-btn').addEventListener('click', () => {
        bookingModal.classList.add('hidden');
    });

    el('modal-confirm-btn').addEventListener('click', async (e) => {
        bookingModal.classList.add('hidden');
        const btn = el('request-slot-btn');
        const resultCard = el('booking-result');
        const rerouteAlert = el('reroute-alert');
        const soc = parseInt(slider.value, 10);
        
        // UI Loading
        btn.innerHTML = `<span class="material-symbols-outlined text-lg animate-spin">refresh</span> Checking grid status...`;
        btn.disabled = true;
        resultCard.classList.add('hidden');
        if (rerouteAlert) rerouteAlert.classList.add('hidden');

        try {
            const res = await apiChargeNow(soc);
            
            // Clear previous map routes
            mapMarkers.filter(m => m._path || m.options?.dashArray).forEach(m => { if (liveMap) liveMap.removeLayer(m); });
            mapMarkers = mapMarkers.filter(m => !(m._path || m.options?.dashArray));

            resultCard.classList.remove('hidden');

            if (res.status === 'confirmed') {
                const riskBadge = res.station_risk ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest" style="background:${res.station_risk.color}20; color:${res.station_risk.color}; border: 1px solid ${res.station_risk.color}40;"><span class="material-symbols-outlined text-[10px]">monitoring</span>${res.station_risk.risk} Load (${res.station_risk.load}%)</span>` : '';

                resultCard.innerHTML = `
                    <div class="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-transparent pointer-events-none"></div>
                    <div class="flex items-center gap-4 relative z-10">
                        <div class="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                            <span class="material-symbols-outlined text-2xl">check_circle</span>
                        </div>
                        <div>
                            <h3 class="font-headline font-bold text-white text-lg">Slot Booked Successfully</h3>
                            <p class="text-xs text-on-surface-variant/60 mt-1">
                                Scheduled at <strong class="text-emerald-400">${res.station.name}</strong> • Time: ${res.slot_time}
                            </p>
                            <div class="flex items-center gap-3 mt-2">
                                <span class="text-[10px] text-on-surface-variant/40 uppercase tracking-widest flex items-center gap-1">
                                    <span class="material-symbols-outlined text-[12px]">my_location</span> ${res.station.dist || '--'} km
                                </span>
                                ${riskBadge}
                            </div>
                            ${res.warning ? `<p class="text-[10px] text-yellow-400/80 mt-2 flex items-center gap-1"><span class="material-symbols-outlined text-[12px]">warning</span> ${res.warning}</p>` : ''}
                        </div>
                    </div>`;

                if (liveMap && res.station && (res.station.lat || res.station.latitude)) {
                     const destLat = res.station.lat || res.station.latitude;
                     const destLng = res.station.lng || res.station.longitude;
                     const route = L.polyline([[currentLat, currentLng], [destLat, destLng]], { color: '#10b981', weight: 4 }).addTo(liveMap);
                     liveMap.fitBounds(route.getBounds(), { padding: [50, 50] });
                     mapMarkers.push(route);
                }

            } else if (res.status === 'rerouted') {
                // === GRID SAFEGUARD: REROUTE ALERT ===
                
                // 1. Show the prominent top-bar reroute alert
                if (rerouteAlert) {
                    rerouteAlert.classList.remove('hidden');
                    rerouteAlert.innerHTML = `
                        <div class="flex items-center gap-4 w-full">
                            <div class="w-10 h-10 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center shrink-0">
                                <span class="material-symbols-outlined text-red-400 text-xl animate-pulse">crisis_alert</span>
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-2 mb-1">
                                    <span class="font-headline font-bold text-sm text-white uppercase tracking-wider">Grid Safeguard Active</span>
                                    <span class="bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest">Rerouted</span>
                                </div>
                                <p class="text-xs text-on-surface-variant/70">
                                    <strong class="text-red-400">${res.original_station.name}</strong> is at 
                                    <strong class="text-red-400">${res.original_risk.load}% grid load</strong> (Peak). 
                                    Route optimized to <strong class="text-neon">${res.station.name}</strong> 
                                    (${res.station.dist ? res.station.dist.toFixed(1) : '--'} km, ${res.station_risk.load}% load).
                                </p>
                            </div>
                            <button onclick="this.closest('#reroute-alert').classList.add('hidden')" class="text-white/30 hover:text-white p-1 rounded transition-colors shrink-0">
                                <span class="material-symbols-outlined text-lg">close</span>
                            </button>
                        </div>`;
                }

                // 2. Show the result card
                resultCard.innerHTML = `
                    <div class="absolute inset-0 bg-gradient-to-r from-yellow-500/10 via-red-500/5 to-transparent pointer-events-none"></div>
                    <div class="flex items-start gap-4 relative z-10">
                        <div class="w-12 h-12 rounded-full bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center text-yellow-400 shrink-0">
                            <span class="material-symbols-outlined text-2xl">turn_right</span>
                        </div>
                        <div class="flex-1">
                            <h3 class="font-headline font-bold text-white text-lg flex items-center gap-2">Route Optimized</h3>
                            <p class="text-xs text-on-surface-variant/60 mt-1">
                                To ensure grid stability, you've been routed to 
                                <strong class="text-neon">${res.station.name}</strong>
                                instead of <span class="line-through text-red-400/60">${res.original_station.name}</span>.
                            </p>
                            <div class="grid grid-cols-2 gap-3 mt-4">
                                <div class="bg-red-500/5 border border-red-500/10 rounded-lg p-3">
                                    <div class="text-[9px] uppercase tracking-widest text-red-400/60 mb-1">Original</div>
                                    <div class="text-xs font-bold text-red-400 line-through">${res.original_station.name}</div>
                                    <div class="text-[10px] text-red-400/50 mt-0.5">${res.original_risk.load}% Load • ${res.original_station.dist ? res.original_station.dist.toFixed(1) : '--'} km</div>
                                </div>
                                <div class="bg-neon/5 border border-neon/10 rounded-lg p-3">
                                    <div class="text-[9px] uppercase tracking-widest text-neon/60 mb-1">Optimized To</div>
                                    <div class="text-xs font-bold text-neon">${res.station.name}</div>
                                    <div class="text-[10px] text-neon/50 mt-0.5">${res.station_risk.load}% Load • ${res.station.dist ? res.station.dist.toFixed(1) : '--'} km</div>
                                </div>
                            </div>
                        </div>
                    </div>`;

                // 3. Update map: strikethrough to original + green route to alternative
                if (liveMap && currentLat) {
                    // Red dashed line to original station (cancelled route)
                    if (res.original_station.lat || res.original_station.latitude) {
                        const origLat = res.original_station.lat || res.original_station.latitude;
                        const origLng = res.original_station.lng || res.original_station.longitude;
                        const cancelledRoute = L.polyline([[currentLat, currentLng], [origLat, origLng]], { 
                            color: '#ef4444', weight: 2, dashArray: '6, 8', opacity: 0.4 
                        }).addTo(liveMap);
                        mapMarkers.push(cancelledRoute);
                    }
                    
                    // Green solid line to alternative station (new route)
                    if (res.station.lat || res.station.latitude) {
                        const destLat = res.station.lat || res.station.latitude;
                        const destLng = res.station.lng || res.station.longitude;
                        const newRoute = L.polyline([[currentLat, currentLng], [destLat, destLng]], { 
                            color: '#BFFF00', weight: 4, dashArray: '12, 6' 
                        }).addTo(liveMap);
                        liveMap.fitBounds(newRoute.getBounds(), { padding: [50, 50] });
                        mapMarkers.push(newRoute);
                    }
                }

                showToast(`Grid Safeguard: Rerouted from ${res.original_station.name} to ${res.station.name}`, 'warning', 8000);
            }

        } catch (err) {
            showToast('Failed to allocate slot', 'error');
        } finally {
            btn.innerHTML = `Request Charging Slot <span class="material-symbols-outlined text-lg group-hover:translate-x-1 transition-transform">arrow_forward</span>`;
            btn.disabled = false;
        }
    });
}

// =============================================================
// MODULE: Prebook Slots Logic
// =============================================================
function getBookingTemporalState(booking) {
    const now = Date.now();
    const bTime = new Date(booking.scheduled_time).getTime();
    const diffMins = (bTime - now) / 60000;
    if (diffMins > 15) return 'upcoming';
    if (diffMins >= 0) return 'activating';
    return 'active';
}

function getBookingBadgeHTML(state, diffMins) {
    if (state === 'upcoming') {
        return `<div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10">
                    <span class="material-symbols-outlined text-[12px] text-white/40">schedule</span>
                    <span class="text-[9px] uppercase tracking-widest text-white/40 font-bold">Upcoming</span>
                </div>`;
    }
    if (state === 'activating') {
        return `<div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-neon/10 border border-neon/30 animate-pulse">
                    <span class="material-symbols-outlined text-[12px] text-neon">bolt</span>
                    <span class="text-[9px] uppercase tracking-widest text-neon font-bold">Activating • Queue Active</span>
                </div>`;
    }
    return `<div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30">
                <span class="material-symbols-outlined text-[12px] text-emerald-400">electric_bolt</span>
                <span class="text-[9px] uppercase tracking-widest text-emerald-400 font-bold">Slot Ready</span>
            </div>`;
}

function renderUpcomingBookings() {
    const list = el('upcoming-bookings-list');
    
    if (upcomingBookings.length === 0) {
        list.innerHTML = `
            <div class="text-center py-10">
                <span class="material-symbols-outlined text-4xl text-on-surface-variant/10 mb-2 block">event_busy</span>
                <p class="text-[10px] text-on-surface-variant/40 uppercase tracking-widest">No upcoming prebookings found</p>
            </div>`;
        return;
    }

    const now = Date.now();
    list.innerHTML = upcomingBookings.map((b, i) => {
        const dateObj = new Date(b.scheduled_time);
        const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateStr = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });
        const bTime = dateObj.getTime();
        const diffMins = (bTime - now) / 60000;
        const tState = getBookingTemporalState(b);
        const badge = getBookingBadgeHTML(tState, diffMins);
        const borderColor = tState === 'activating' ? 'border-neon/20' : tState === 'active' ? 'border-emerald-500/20' : 'border-white/5';
        
        return `
        <div class="bg-white/[0.03] border ${borderColor} p-4 rounded-xl fade-up fade-up-d${i+1 > 3 ? 3 : i+1}">
            <div class="flex items-center gap-4">
                <div class="bg-neon/10 border border-neon/20 w-12 h-12 rounded-lg flex flex-col items-center justify-center text-neon shrink-0">
                    <span class="text-[9px] uppercase tracking-widest opacity-70 mb-0.5">${dateObj.toLocaleString('en-US', { weekday: 'short'})}</span>
                    <span class="font-mono font-bold text-sm leading-none">${dateObj.getDate()}</span>
                </div>
                
                <div class="flex-1 min-w-0">
                    <h4 class="font-headline font-bold text-white text-sm truncate">${b.station.name}</h4>
                    <div class="text-[10px] text-on-surface-variant/50 uppercase tracking-widest mt-1 flex items-center gap-2">
                        <span class="flex items-center gap-0.5"><span class="material-symbols-outlined text-[12px]">schedule</span> ${timeStr}</span> • 
                        <span class="flex items-center gap-0.5"><span class="material-symbols-outlined text-[12px]">badge</span> ${b.booking_id}</span>
                    </div>
                </div>
                
                <button onclick="cancelBooking('${b.booking_id}')" class="text-red-400/50 hover:text-red-400 hover:bg-red-400/10 p-2 rounded transition-colors" title="Cancel Booking">
                    <span class="material-symbols-outlined text-lg">cancel</span>
                </button>
            </div>
            <div class="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                ${badge}
                <span class="text-[9px] font-mono text-on-surface-variant/30">${diffMins > 0 ? Math.ceil(diffMins) + ' min away' : 'Now'}</span>
            </div>
        </div>`;
    }).join('');
}

function showModal(title, message, iconStr, confirmText, cancelText, confirmClass, onConfirm, onCancel) {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 opacity-0 transition-opacity duration-200';
    
    const cColor = confirmClass || 'bg-neon text-[#131318] hover:bg-neon/90 shadow-[0_0_15px_rgba(184,246,0,0.3)]';

    overlay.innerHTML = `
        <div class="glass-card bg-[#131318] border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl relative overflow-hidden transform scale-95 transition-transform duration-200">
            <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-neon to-emerald-500"></div>
            <div class="flex items-center gap-3 mb-4">
                <div class="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-neon shrink-0">
                    <span class="material-symbols-outlined">${iconStr}</span>
                </div>
                <h3 class="font-headline font-bold text-white text-lg">${title}</h3>
            </div>
            <p class="text-on-surface-variant/70 text-sm mb-6">${message}</p>
            <div class="flex items-center justify-end gap-3">
                <button id="modal-cancel-btn" class="px-4 py-2 rounded text-xs font-bold uppercase tracking-widest text-on-surface-variant hover:text-white hover:bg-white/5 transition-colors">${cancelText}</button>
                <button id="modal-confirm-btn" class="px-4 py-2 rounded text-xs font-bold uppercase tracking-widest transition-all ${cColor}">${confirmText}</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Animate in
    requestAnimationFrame(() => {
        overlay.classList.remove('opacity-0');
        overlay.querySelector('.glass-card').classList.remove('scale-95');
    });

    const close = () => {
        overlay.classList.add('opacity-0');
        overlay.querySelector('.glass-card').classList.add('scale-95');
        setTimeout(() => overlay.remove(), 200);
    };
    
    overlay.querySelector('#modal-cancel-btn').addEventListener('click', () => { close(); if (onCancel) onCancel(); });
    overlay.querySelector('#modal-confirm-btn').addEventListener('click', () => { close(); if (onConfirm) onConfirm(); });
}

window.cancelBooking = function(id) {
    const booking = upcomingBookings.find(b => b.booking_id === id);
    if (!booking) return;

    showModal(
        'Cancel Reservation', 
        `Are you sure you want to cancel your slot at <strong>${booking.station.name}</strong>?`,
        'event_busy',
        'Cancel Slot',
        'Keep It',
        'bg-red-500 text-white hover:bg-red-600 shadow-[0_0_15px_rgba(239,68,68,0.3)]',
        () => {
            // Confirmed
            upcomingBookings = upcomingBookings.filter(b => b.booking_id !== id);
            saveUpcoming();
            renderUpcomingBookings();
            showToast('Slot not occupied. Booking cancelled successfully.', 'info');
            
            // Remove from global queue
            try {
                let q = JSON.parse(localStorage.getItem('gridpulz_queue') || '[]');
                q = q.filter(item => item.id !== id);
                localStorage.setItem('gridpulz_queue', JSON.stringify(q));
            } catch(e) {}
            
            // Second Prompt: Reschedule
            setTimeout(() => {
                showModal(
                    'Reschedule Slot?',
                    `Would you like to schedule a different time for your charge?`,
                    'edit_calendar',
                    'Reschedule',
                    'No Thanks',
                    null, // Use default neon class
                    () => {
                        window.location.href = 'user-dashboard.html';
                    }
                );
            }, 600);
        }
    );
};

let fullMap = null;
let fullMapMarkers = [];

function initStationMap() {
    const mapContainer = el('full-live-map');
    if (!mapContainer) return;

    const statusText = el('map-status-text');
    const loadingOverlay = el('map-loading');
    const syncCountdown = el('sync-countdown');
    const mapStationCount = el('map-station-count');

    // Start UI
    if (statusText) statusText.innerHTML = 'ACQUIRING GPS LOCK<span class="animate-pulse">...</span>';

    if (!navigator.geolocation) {
        if (statusText) statusText.textContent = 'GEOLOCATION NOT SUPPORTED';
        showToast('Geolocation not supported', 'error');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const currentLat = pos.coords.latitude; 
            const currentLng = pos.coords.longitude;
            
            if (statusText) statusText.innerHTML = 'FETCHING STATIONS<span class="animate-pulse">...</span>';

            // Initialize Map
            if (!fullMap) {
                fullMap = L.map('full-live-map', { zoomControl: true }).setView([currentLat, currentLng], 13);
                L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                    attribution: '&copy; OpenStreetMap',
                    maxZoom: 19
                }).addTo(fullMap);
            } else {
                fullMap.setView([currentLat, currentLng], 13);
            }
            
            // Plot User Location
            fullMapMarkers.forEach(m => fullMap.removeLayer(m));
            fullMapMarkers = [];
            
            const userIcon = L.divIcon({ className: 'bg-transparent', html: `<div class="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-[0_0_20px_rgba(59,130,246,0.9)] animate-pulse"></div>`, iconSize: [16,16] });
            fullMapMarkers.push(L.marker([currentLat, currentLng], { icon: userIcon }).addTo(fullMap));
            
            // Fetch & Plot All Stations
            try {
                const nearby = await window.getNearbyStations(currentLat, currentLng, 99999);
                const userCharger = getUserChargerType();
                
                if (mapStationCount) mapStationCount.textContent = nearby.length;

                const markerGroup = L.featureGroup();
                markerGroup.addLayer(L.marker([currentLat, currentLng], { icon: userIcon }));

                nearby.forEach(st => {
                    if (window.buildStationMarker) {
                        const marker = window.buildStationMarker(st, userCharger, null);
                        if (marker) {
                            marker.addTo(fullMap);
                            fullMapMarkers.push(marker);
                            markerGroup.addLayer(marker);
                            if (window.stationMarkerMap) window.stationMarkerMap[st.id] = marker;
                        }
                    } else {
                        // Fallback
                        const stRisk = assessStationRisk(st);
                        const color = stRisk.risk === 'HIGH' ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)]' : stRisk.risk === 'MODERATE' ? 'bg-yellow-500 shadow-[0_0_15px_rgba(245,158,11,0.8)]' : 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.8)]';
                        const stIcon = L.divIcon({ className: 'bg-transparent', html: `<div class="w-5 h-5 ${color} rounded-full border-2 border-[#131318]"></div>`, iconSize: [20,20] });
                        const m = L.marker([st.lat || st.latitude, st.lng || st.longitude], { icon: stIcon }).addTo(fullMap);
                        m.bindPopup(`<div class="bg-surface p-1"><strong class="block text-sm text-white mb-1 font-headline">${st.name}</strong><span class="text-[10px] uppercase tracking-widest text-[#BFFF00]">${st.dist ? st.dist.toFixed(2) : '--'} km away</span><br><span class="text-[9px]" style="color:${stRisk.color}">${stRisk.risk} Load (${stRisk.load}%)</span></div>`);
                        fullMapMarkers.push(m);
                        markerGroup.addLayer(m);
                    }
                });
                
                // Zoom map to show both user and all stations
                if (nearby.length > 0) {
                    fullMap.fitBounds(markerGroup.getBounds(), { padding: [50, 50], maxZoom: 14 });
                }

                // Start Live Sync if available
                if (window.subscribeToStations) {
                    window.subscribeToStations(
                        currentLat, currentLng, 30, fullMap, userCharger,
                        (st, cache) => console.log('Station critical redirect observed in live-map:', st)
                    );
                }
            } catch(e) { 
                console.warn('Station fetch failed:', e); 
            }

            // Hide Loading Overlay
            if (statusText) statusText.textContent = 'SYNC COMPLETE';
            setTimeout(() => {
                if (loadingOverlay) {
                    loadingOverlay.classList.add('opacity-0');
                    setTimeout(() => loadingOverlay.classList.add('hidden'), 500);
                }
            }, 600);

            // Mock sync timer
            let syncSeconds = 30;
            setInterval(() => {
                syncSeconds--;
                if(syncSeconds < 0) syncSeconds = 30;
                if(syncCountdown) syncCountdown.textContent = syncSeconds + 's';
            }, 1000);

        },
        () => {
            if (statusText) statusText.textContent = 'PERMISSION DENIED';
            showToast('GPS permission required to locate nearby charging stations', 'error');
            setTimeout(() => {
                if (loadingOverlay) loadingOverlay.classList.add('hidden');
            }, 2000);
        }
    );
}

function initPrebook() {
    // Guard for pages without the prebook form
    if (!el('prebook-date')) return;
    
    // Default dates
    const today = new Date();
    el('prebook-date').valueAsDate = today;
    el('prebook-time').value = '14:00';

    el('prebook-form').addEventListener('submit', (e) => {
        e.preventDefault();
        el('confirm-prebook-modal').classList.remove('hidden');
    });

    el('modal-cancel-prebook').addEventListener('click', () => {
        el('confirm-prebook-modal').classList.add('hidden');
    });

    el('modal-confirm-prebook').addEventListener('click', async () => {
        el('confirm-prebook-modal').classList.add('hidden');
        
        const soc = parseInt(el('prebook-soc').value, 10);
        const date = el('prebook-date').value;
        const time = el('prebook-time').value;
        const btn = el('prebook-form').querySelector('button[type="submit"]');

        btn.disabled = true;
        btn.innerHTML = `<span class="material-symbols-outlined text-sm animate-spin">refresh</span> Processing...`;

        try {
            const res = await apiPrebook(soc, date, time);
            if (res.status === 'confirmed') {
                res.soc = soc; // Store SoC for JIT queue push
                upcomingBookings.push(res);
                saveUpcoming();
                showToast(`Slot occupied. Prebooking confirmed for ${res.station.name}`, 'success');
                renderUpcomingBookings();
                
                // Demo notification scheduling
                setTimeout(() => {
                    showToast(`Reminder: Charging slot at ${res.station.name} is in 24 hours.`, 'info', 8000);
                }, 4000);
            }
        } catch(e) {
            showToast('Failed to prebook slot', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<span class="material-symbols-outlined text-sm">event</span> Confirm Prebooking`;
            el('prebook-soc').value = '40';
        }
    });

    renderUpcomingBookings();
}

function startNotificationEngine() {
    setInterval(() => {
        const now = Date.now();
        let needsRerender = false;

        upcomingBookings.forEach(b => {
            const bTime = new Date(b.scheduled_time).getTime();
            const diffMins = (bTime - now) / 60000;
            
            // === JIT Queue Push: Push to scheduler queue when entering 15-min buffer ===
            if (diffMins >= 0 && diffMins <= 15 && !b.jit_pushed) {
                b.jit_pushed = true;
                // Push to priority queue with booked_time so scheduler applies temporal boost
                try {
                    let q = JSON.parse(localStorage.getItem('gridpulz_queue') || '[]');
                    let sIdx = 0;
                    if (b.station && b.station.name) {
                        if (b.station.name.includes('Beta')) sIdx = 1;
                        if (b.station.name.includes('Gamma')) sIdx = 2;
                    }
                    const vName = userProfile && userProfile.vehicle_name !== 'Not set' ? userProfile.vehicle_name : ('Driver-' + Math.floor(Math.random()*1000));
                    q.push({
                        id: b.booking_id,
                        name: vName,
                        battery: b.soc || 40,
                        stationIdx: sIdx,
                        waitMins: 0,
                        timestamp: Date.now(),
                        isExternal: true,
                        booked_time: b.scheduled_time
                    });
                    localStorage.setItem('gridpulz_queue', JSON.stringify(q));
                } catch(e) {}

                showToast(`<strong>Slot Activating!</strong> Your pre-booking at <strong>${b.station.name}</strong> is entering the priority queue. Please head to the station.`, 'info', 12000);
                needsRerender = true;
            }

            if (diffMins > 5 && diffMins <= 30 && !b.notified_30m) {
                b.notified_30m = true;
                showToast(`Reminder: Your slot at <strong>${b.station.name}</strong> is in ${Math.ceil(diffMins)} minutes!`, 'warning', 10000);
            }
            if (diffMins > 0 && diffMins <= 5 && !b.notified_5m) {
                b.notified_5m = true;
                showToast(`Urgent: Your slot at <strong>${b.station.name}</strong> is arriving in just ${Math.ceil(diffMins)} minutes!`, 'error', 15000);
            }
        });

        // Re-render to update temporal state badges
        if (needsRerender) {
            renderUpcomingBookings();
        }
    }, 15000); // Check every 15s

    // Also re-render bookings every 30s to keep state badges live
    setInterval(() => {
        if (upcomingBookings.length > 0) {
            renderUpcomingBookings();
        }
    }, 30000);
}


// =============================================================
// INIT
// =============================================================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const session = await initSession();
        if (!session) return;
        
        await loadVehicleProfile(session.user.email, session.user.user_metadata?.full_name || session.user.email.split('@')[0]);

        initProfileEditor();
        initTabs();
        initChargeNow();
        initStationMap();
        initPrebook();
        initMyBookings();
        initSidebar();
        startNotificationEngine();

        el('logout-btn').addEventListener('click', async (e) => {
            e.preventDefault();
            await supabaseClient.auth.signOut();
            showToast('Signed out', 'info');
            setTimeout(() => { window.location.href = 'login.html'; }, 500);
        });
    } catch (err) {
        console.error('Dashboard init error:', err);
    }
});

function initSidebar() {
    const links = document.querySelectorAll('aside nav a');
    const currentPath = window.location.pathname.split('/').pop() || 'user-dashboard.html';
    
    links.forEach(link => {
        const href = link.getAttribute('href');
        // Handle cases where Dashboard encapsulates several sub-pages
        const isDashboardSubpage = ['charge-now.html', 'prebook.html', 'station-map.html'].includes(currentPath);
        const shouldBeActive = (href === currentPath) || (href === 'user-dashboard.html' && isDashboardSubpage);

        if (shouldBeActive) {
            link.classList.add('nav-link-active');
            link.classList.remove('text-on-surface-variant/60', 'border-transparent');
        } else {
            link.classList.remove('nav-link-active');
            link.classList.add('text-on-surface-variant/60', 'border-transparent');
        }
    });
}
