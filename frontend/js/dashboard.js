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

// Backend URL configured in api-config.js

// ─── DOM Helpers ────────────────────────────────────────────
function el(id) { return document.getElementById(id); }

// ─── State ──────────────────────────────────────────────────
let currentLat = 11.0589; // Default to Coimbatore
let currentLng = 77.0912;
let userProfile = null;
let currentSession = null;
let upcomingBookings = JSON.parse(localStorage.getItem('gridpulz_upcoming') || '[]');
const SLOT_ACTIVE_WINDOW_MINS = 45;
const QUEUE_SYNC_CHANNEL = 'gridpulz-queue-sync';
let queueSyncChannelRef = null;

function initQueueSyncChannel() {
    if (queueSyncChannelRef || !window.supabaseClient) return queueSyncChannelRef;
    try {
        queueSyncChannelRef = window.supabaseClient.channel(QUEUE_SYNC_CHANNEL, {
            config: { broadcast: { self: false } }
        });
        
        // Listen for remote events (other clients/devices)
        queueSyncChannelRef.on('broadcast', { event: 'queue_event' }, ({ payload }) => {
            console.log('📡 Remote queue event received:', payload);
            if (payload && payload.action) {
                applyQueueSyncEvent(payload.action, payload.payload);
            }
        });

        queueSyncChannelRef.subscribe();
    } catch (error) {
        console.warn('Queue sync channel init failed:', error);
    }
    return queueSyncChannelRef;
}

function applyQueueSyncEvent(action, payload) {
    try {
        let q = JSON.parse(localStorage.getItem('gridpulz_queue') || '[]');
        if (action === 'upsert') {
            const idx = q.findIndex(item => String(item.id) === String(payload.id));
            if (idx >= 0) q[idx] = { ...q[idx], ...payload };
            else q.push(payload);
        } else if (action === 'remove') {
            q = q.filter(item => String(item.id) !== String(payload.id));
        } else if (action === 'replace' && Array.isArray(payload.queue)) {
            q = payload.queue;
        }
        localStorage.setItem('gridpulz_queue', JSON.stringify(q));
        
        // Trigger UI updates if relevant (e.g. if we are on a page that shows queue status)
        if (typeof renderActiveBookings === 'function') renderActiveBookings();
    } catch (e) {}
}

function initQueueSyncListeners() {
    // Local tab listener
    window.addEventListener('storage', (e) => {
        if (e.key === 'gridpulz_queue_sync_ping' && e.newValue) {
            try {
                const data = JSON.parse(e.newValue);
                applyQueueSyncEvent(data.action, data.payload);
            } catch (err) {}
        }
        // Also listen for upcoming bookings sync
        if (e.key === 'gridpulz_upcoming') {
            upcomingBookings = JSON.parse(e.newValue || '[]');
            renderUpcomingBookings();
        }
    });
}

function emitQueueSync(action, payload = {}) {
    // Local fallback for same-browser tabs/windows.
    try {
        localStorage.setItem('gridpulz_queue_sync_ping', JSON.stringify({ action, payload, ts: Date.now() }));
    } catch (e) {}

    // Cross-client broadcast via Supabase Realtime.
    const ch = initQueueSyncChannel();
    if (!ch) return;
    ch.send({
        type: 'broadcast',
        event: 'queue_event',
        payload: { action, payload, ts: Date.now() }
    }).catch(() => {});
}

function saveUpcoming() {
    localStorage.setItem('gridpulz_upcoming', JSON.stringify(upcomingBookings));
}
let liveMap = null;
let mapMarkers = [];
let directionsService = null;
let directionsRenderer = null;

// =============================================================
// API TIER
// =============================================================

function getStationIndexFromName(name = '') {
    if (name.includes('Beta')) return 1;
    if (name.includes('Gamma')) return 2;
    return 0;
}

function upsertQueueEntry(entry) {
    try {
        const q = JSON.parse(localStorage.getItem('gridpulz_queue') || '[]');
        const idx = q.findIndex(item => String(item.id) === String(entry.id));
        if (idx >= 0) q[idx] = { ...q[idx], ...entry };
        else q.push(entry);
        localStorage.setItem('gridpulz_queue', JSON.stringify(q));
        emitQueueSync('upsert', entry);
    } catch (e) {}
}

function removeQueueEntryById(id) {
    try {
        let q = JSON.parse(localStorage.getItem('gridpulz_queue') || '[]');
        q = q.filter(item => String(item.id) !== String(id));
        localStorage.setItem('gridpulz_queue', JSON.stringify(q));
        emitQueueSync('remove', { id });
    } catch (e) {}
}

function cleanupExpiredQueueEntries(nowMs = Date.now()) {
    try {
        let changed = false;
        let q = JSON.parse(localStorage.getItem('gridpulz_queue') || '[]');
        const filtered = q.filter(item => {
            if (item.booked_time) {
                const endMs = new Date(item.booked_time).getTime() + SLOT_ACTIVE_WINDOW_MINS * 60000;
                if (Number.isFinite(endMs) && nowMs > endMs) {
                    changed = true;
                    return false;
                }
            }
            if (!item.booked_time && item.timestamp) {
                const endMs = Number(item.timestamp) + SLOT_ACTIVE_WINDOW_MINS * 60000;
                if (Number.isFinite(endMs) && nowMs > endMs) {
                    changed = true;
                    return false;
                }
            }
            return true;
        });
        if (changed) {
            localStorage.setItem('gridpulz_queue', JSON.stringify(filtered));
            emitQueueSync('replace', { queue: filtered });
        }
    } catch (e) {}
}

function simulateQueuePush(soc, station, overrideId = null, options = {}) {
    if (!station || !station.name) {
        console.error('❌ simulateQueuePush failed: Invalid station', station);
        return;
    }
    const vName = userProfile && userProfile.vehicle_name !== 'Not set' ? userProfile.vehicle_name : ('Driver-' + Math.floor(Math.random()*1000));
    const stationIdx = getStationIndexFromName(station.name);
    const queueEntry = {
        id: overrideId || (Date.now() + Math.random()),
        name: vName,
        user_id: currentSession?.user?.id || 'demo',
        battery: soc,
        stationIdx: stationIdx,
        station_id: station.id || null,
        station_name: station.name,
        waitMins: 0,
        timestamp: Date.now(),
        isExternal: true,
        ...options
    };
    console.log('✓ Adding to queue:', queueEntry);
    upsertQueueEntry(queueEntry);
}

// =============================================================
// MODULE: Grid Safeguard — Station Risk Assessment & Rerouting
// =============================================================

function assessStationRisk(station) {
    const load = station.grid_load ?? station.gridLoad ?? Math.floor(Math.random() * 100);
    if (load > 75) return { risk: 'HIGH', load, color: '#ef4444' };
    if (load > 50) return { risk: 'MODERATE', load, color: '#f59e0b' };
    return { risk: 'LOW', load, color: '#10b981' };
}

function findBestAlternative(stations, excludeStation) {
    const candidates = stations.filter(s => s.name !== excludeStation.name);
    const stable = candidates.filter(s => assessStationRisk(s).risk !== 'HIGH');
    stable.sort((a, b) => (a.dist || 999) - (b.dist || 999));
    return stable[0] || candidates[0] || null;
}

async function apiChargeNow(soc) {
    let allStations = [];
    let bestStation = null;

    if (currentLat && currentLng && window.getNearbyStations) {
        try {
            allStations = await window.getNearbyStations(currentLat, currentLng, 1000);
            
            if (window.selectedChargeNowStation) {
                bestStation = window.selectedChargeNowStation;
            } else if (allStations.length > 0 && window.rankStationsBySoC) {
                const ranked = window.rankStationsBySoC(allStations, soc);
                bestStation = ranked[0];
                allStations = ranked;
            } else if (allStations.length > 0) {
                bestStation = allStations[0];
            }
        } catch (e) {
            console.warn("Failed to get nearby stations:", e);
        }
    }

    if (!bestStation) {
        throw new Error("No nearby charging stations found. Please try moving to a different area.");
    }

    return new Promise(resolve => {
        setTimeout(() => {
            const risk = assessStationRisk(bestStation);

            if (risk.risk === 'HIGH') {
                const alternative = findBestAlternative(allStations, bestStation);
                if (alternative) {
                    const altRisk = assessStationRisk(alternative);
                    simulateQueuePush(soc, alternative);
                    if (window.setAssignedStation) window.setAssignedStation(alternative.id);
                    resolve({
                        status: 'rerouted',
                        original_station: bestStation,
                        original_risk: risk,
                        station: alternative,
                        station_risk: altRisk,
                        reason: `${bestStation.name} is at ${risk.load}% grid load. Optimized for safety.`,
                        slot_time: 'Immediate'
                    });
                } else {
                    simulateQueuePush(soc, bestStation);
                    resolve({ status: 'confirmed', station: bestStation, station_risk: risk, slot_time: 'Immediate' });
                }
            } else {
                simulateQueuePush(soc, bestStation);
                if (window.setAssignedStation) window.setAssignedStation(bestStation.id);
                resolve({ status: 'confirmed', station: bestStation, station_risk: risk, slot_time: 'Immediate' });
            }
        }, 1200);
    });
}

async function apiPrebook(soc, date, time, stationId = null) {
    let selectedStation = null;
    
    if (stationId && window._stationsCacheData) {
        selectedStation = window._stationsCacheData.find(s => String(s.id) === String(stationId));
    }

    if (!selectedStation) {
        throw new Error("Please select a valid station first.");
    }

    return new Promise(resolve => {
        setTimeout(() => {
            const bookingId = "BK-" + Math.floor(Math.random() * 90000 + 10000);
            const scheduledTime = `${date}T${time}:00`;
            resolve({
                status: "confirmed",
                booking_id: bookingId,
                station: selectedStation,
                scheduled_time: scheduledTime
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
    if (el('sidebar-driver-name')) el('sidebar-driver-name').textContent = userName;
    if (el('sidebar-driver-email')) el('sidebar-driver-email').textContent = email;

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
        if (el('vehicle-name')) el('vehicle-name').textContent = userProfile.vehicle_name || 'Not set';
        if (el('vehicle-capacity')) el('vehicle-capacity').textContent = userProfile.charging_capacity ? `${userProfile.charging_capacity} kWh` : '— kWh';
        if (el('vehicle-charging-type')) el('vehicle-charging-type').textContent = userProfile.charging_type || '—';
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

    const uid = currentSession?.user?.id || 'demo';
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
        let stationName = b.station_name || 'Target Station';
        
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
            removeQueueEntryById(id);
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
        // Clear old routes/markers
        mapMarkers.forEach(m => m.setMap(null));
        mapMarkers = [];

        // Red dashed line to original (cancelled)
        const origLat = result.original.lat || result.original.latitude;
        const origLng = result.original.lng || result.original.longitude;
        if (origLat && origLng && currentLat) {
            const cancelledRoute = new google.maps.Polyline({
                path: [{ lat: currentLat, lng: currentLng }, { lat: origLat, lng: origLng }],
                geodesic: true,
                strokeColor: '#ef4444',
                strokeOpacity: 0.4,
                strokeWeight: 2,
                icons: [{
                    icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 2 },
                    offset: '0',
                    repeat: '10px'
                }],
                map: liveMap
            });
            mapMarkers.push(cancelledRoute);
        }

        // Neon line to alternative
        const altLat = result.alternative.lat || result.alternative.latitude;
        const altLng = result.alternative.lng || result.alternative.longitude;
        if (altLat && altLng && currentLat) {
            const newRoute = new google.maps.Polyline({
                path: [{ lat: currentLat, lng: currentLng }, { lat: altLat, lng: altLng }],
                geodesic: true,
                strokeColor: '#BFFF00',
                strokeOpacity: 0.8,
                strokeWeight: 4,
                map: liveMap
            });
            
            const bounds = new google.maps.LatLngBounds();
            bounds.extend({ lat: currentLat, lng: currentLng });
            bounds.extend({ lat: altLat, lng: altLng });
            liveMap.fitBounds(bounds);
            mapMarkers.push(newRoute);
        }
    }

    showToast(`🔴 Live Redirect: ${result.original.name} → ${result.alternative.name}`, 'warning', 10000);
}

function initChargeNow() {
    const slider = el('soc-slider');
    if (!slider) return;
    const valueEl = el('soc-value');

    slider.addEventListener('input', () => {
        const val = slider.value;
        valueEl.innerHTML = `${val}<span class="text-lg text-neon/50">%</span>`;
    });

    console.log('Charge Now UI initialized (map handled by charge-now.js)');
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

function getBookingBadgeHTML(state) {
    if (state === 'upcoming') return `<div class="px-2 py-1 rounded-full bg-white/5 border border-white/10 text-[9px] uppercase tracking-widest text-white/40">Upcoming</div>`;
    if (state === 'activating') return `<div class="px-2 py-1 rounded-full bg-neon/10 border border-neon/30 text-[9px] uppercase tracking-widest text-neon animate-pulse">Activating</div>`;
    return `<div class="px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[9px] uppercase tracking-widest text-emerald-400">Ready</div>`;
}

function renderUpcomingBookings() {
    const list = el('upcoming-bookings-list');
    if (!list) return;
    
    if (upcomingBookings.length === 0) {
        list.innerHTML = `<div class="text-center py-10 opacity-30 text-[10px] uppercase tracking-widest">No prebookings</div>`;
        return;
    }

    list.innerHTML = upcomingBookings.map((b, i) => {
        const dateObj = new Date(b.scheduled_time);
        const tState = getBookingTemporalState(b);
        return `
        <div class="bg-white/[0.03] border border-white/5 p-4 rounded-xl fade-up fade-up-d${(i%3)+1}">
            <div class="flex items-center gap-4">
                <div class="bg-neon/10 border border-neon/20 w-10 h-10 rounded flex flex-col items-center justify-center text-neon">
                    <span class="text-[8px] uppercase opacity-60">${dateObj.toLocaleString('en-US', { weekday: 'short'})}</span>
                    <span class="font-bold text-xs">${dateObj.getDate()}</span>
                </div>
                <div class="flex-1 min-w-0">
                    <h4 class="font-headline font-bold text-white text-xs truncate">${b.station.name}</h4>
                    <div class="text-[9px] text-on-surface-variant/40 mt-1">${dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • ${b.booking_id}</div>
                </div>
                <button onclick="cancelBooking('${b.booking_id}')" class="text-red-400/40 hover:text-red-400 transition-colors"><span class="material-symbols-outlined text-lg">cancel</span></button>
            </div>
            <div class="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                ${getBookingBadgeHTML(tState)}
                <span class="text-[9px] text-on-surface-variant/30 font-mono">${b.soc}% Target SoC</span>
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
            removeQueueEntryById(id);
            
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

// Global initMap function for Google Maps callback
window.initMap = function() {
    console.log('Google Maps API loaded via callback');
    window.googleMapsReady = true;
};

function initStationMap() {
    const mapContainer = el('full-live-map');
    if (!mapContainer) return;

    const statusText = el('map-status-text');
    const loadingOverlay = el('map-loading');
    const syncCountdown = el('sync-countdown');
    const mapStationCount = el('map-station-count');

    // Check if Leaflet is loaded
    if (typeof L === 'undefined') {
        console.error('Leaflet not loaded');
        if (statusText) statusText.textContent = 'MAP LIBRARY ERROR';
        if (loadingOverlay) {
            loadingOverlay.innerHTML = `
                <div class="text-center">
                    <span class="material-symbols-outlined text-4xl text-red-400 mb-2 block">error</span>
                    <p class="font-mono text-xs text-red-400 tracking-widest text-center px-4">Map library failed to load</p>
                    <p class="font-mono text-[10px] text-white/40 text-center px-4 mt-2">Please check your internet connection and refresh</p>
                </div>
            `;
        }
        return;
    }

    if (statusText) statusText.innerHTML = 'ACQUIRING GPS LOCK<span class="animate-pulse">...</span>';

    if (!navigator.geolocation) {
        if (statusText) statusText.textContent = 'GEOLOCATION NOT SUPPORTED';
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const currentLat = pos.coords.latitude; 
            const currentLng = pos.coords.longitude;
            
            if (statusText) statusText.innerHTML = 'FETCHING STATIONS<span class="animate-pulse">...</span>';

            // Initialize Leaflet Map
            if (!fullMap) {
                fullMap = L.map('full-live-map').setView([currentLat, currentLng], 13);
                
                // Add dark-themed OpenStreetMap tiles
                L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                    subdomains: 'abcd',
                    maxZoom: 20
                }).addTo(fullMap);
            } else {
                fullMap.setView([currentLat, currentLng], 13);
            }
            
            // Clear existing markers
            fullMapMarkers.forEach(m => fullMap.removeLayer(m));
            fullMapMarkers = [];
            
            // User Marker - blue circle
            const userIcon = L.divIcon({
                className: 'custom-div-icon',
                html: `<div style="background-color: #3b82f6; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`,
                iconSize: [12, 12],
                iconAnchor: [6, 6]
            });
            const userM = L.marker([currentLat, currentLng], { icon: userIcon }).addTo(fullMap);
            fullMapMarkers.push(userM);
            
            try {
                console.log('Fetching stations near:', currentLat, currentLng);
                const nearby = await window.getNearbyStations(currentLat, currentLng, 99999);
                console.log('Nearby stations found:', nearby.length, nearby);
                if (mapStationCount) mapStationCount.textContent = nearby.length;

                nearby.forEach(st => {
                    console.log('Adding marker for station:', st.name, 'at', st.lat || st.latitude, st.lng || st.longitude);
                    const stRisk = assessStationRisk(st);
                    
                    // Station marker - colored circle based on risk
                    const stationIcon = L.divIcon({
                        className: 'custom-div-icon',
                        html: `<div style="background-color: ${stRisk.color}; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`,
                        iconSize: [16, 16],
                        iconAnchor: [8, 8]
                    });
                    
                    const m = L.marker([st.lat || st.latitude, st.lng || st.longitude], { icon: stationIcon }).addTo(fullMap);
                    
                    // Add tooltip on hover (shows name and location)
                    const tooltipContent = `<div style="color:#fff; font-family:Michroma; font-size:11px; font-weight:bold;">${st.name}</div><div style="color:#aaa; font-size:9px;">${st.lat?.toFixed(4) || st.latitude?.toFixed(4)}, ${st.lng?.toFixed(4) || st.longitude?.toFixed(4)}</div>`;
                    m.bindTooltip(tooltipContent, {
                        direction: 'top',
                        offset: [0, -10],
                        className: 'custom-tooltip'
                    });
                    
                    // Add popup on click (shows detailed info)
                    const popupContent = `<div style="color:#000; font-family:Michroma; font-size:10px;"><b>${st.name}</b><br>Load: ${stRisk.load}%<br>Slots: ${st.free_slots || 0}/${st.total_slots || 0}</div>`;
                    m.bindPopup(popupContent);
                    
                    fullMapMarkers.push(m);
                });
            } catch(e) { console.error('Station fetch failed:', e); }

            if (statusText) statusText.textContent = 'SYNC COMPLETE';
            if (loadingOverlay) loadingOverlay.classList.add('hidden');

            let syncSeconds = 30;
            setInterval(() => {
                syncSeconds--;
                if(syncSeconds < 0) syncSeconds = 30;
                if(syncCountdown) syncCountdown.textContent = syncSeconds + 's';
            }, 1000);
        },
        () => {
            if (statusText) statusText.textContent = 'PERMISSION DENIED';
        }
    );
}

function initPrebook() {
    // Guard for pages without the prebook form
    if (!el('prebook-date')) return;

    function formatLocalDate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function getTodayStart() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    function parseSelectedDate(dateStr) {
        if (!dateStr) return null;
        const [y, m, d] = dateStr.split('-').map(Number);
        if (!y || !m || !d) return null;
        const parsed = new Date(y, m - 1, d);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    
    // Default to a valid future slot and enforce min date/time.
    const now = new Date();
    const next = new Date(now.getTime() + 60 * 60000);
    const minDate = formatLocalDate(now);
    el('prebook-date').min = minDate;
    el('prebook-date').value = formatLocalDate(next);
    el('prebook-time').value = `${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`;

    const btnSearchCity = el('btn-search-city');
    const selectStation = el('prebook-station-select');
    
    // Auto-populate all stations initially
    if (selectStation && window.getAllStationsCached) {
        window.getAllStationsCached().then(stations => {
            if (stations && stations.length > 0) {
                selectStation.innerHTML = '<option value="" disabled selected>Select a station...</option>' + 
                    stations.map(s => `<option value="${s.id}">${s.name} (${s.city || 'Unknown'})</option>`).join('');
            }
        }).catch(e => console.warn('Prebook initial stations fetch failed', e));
    }
    
    if (btnSearchCity && selectStation) {
        btnSearchCity.addEventListener('click', async () => {
            const city = el('prebook-location').value.trim();
            if (!city) {
                showToast('Please enter a city or area name first.', 'error');
                return;
            }
            
            btnSearchCity.innerHTML = `<span class="material-symbols-outlined text-[10px] animate-spin">refresh</span>`;
            btnSearchCity.disabled = true;
            
            try {
                const geocoder = new google.maps.Geocoder();
                const result = await new Promise((res, rej) => {
                    geocoder.geocode({ address: city }, (results, status) => {
                        if (status === 'OK') res(results[0].geometry.location);
                        else rej(status);
                    });
                });
                
                const searchLat = result.lat();
                const searchLng = result.lng();
                
                const nearby = await window.getNearbyStations(searchLat, searchLng, 1000);
                if (!nearby || nearby.length === 0) {
                    showToast('No stations found in ' + city, 'error');
                    selectStation.innerHTML = `<option value="" disabled selected>No stations found</option>`;
                } else {
                    const soc = parseInt(el('prebook-soc').value, 10) || 40;
                    const ranked = window.rankStationsBySoC(nearby, soc);
                    
                    selectStation.innerHTML = ranked.map(s => 
                        `<option value="${s.id}">${s.name} (${s.dist ? s.dist.toFixed(1) + ' km' : ''})</option>`
                    ).join('');
                    showToast(`Found ${ranked.length} stations in ${city}`, 'success');
                }
            } catch (e) {
                console.error('Geocoding/fetch failed:', e);
                showToast('Could not find city or stations.', 'error');
            } finally {
                btnSearchCity.innerHTML = `Search`;
                btnSearchCity.disabled = false;
            }
        });
    }

    function syncMinTime() {
        const selectedDate = el('prebook-date').value;
        const today = new Date();
        const todayStr = formatLocalDate(today);

        // Reset invalid manual edits to enforce date >= today.
        const selectedDateOnly = parseSelectedDate(selectedDate);
        const todayStart = getTodayStart();
        if (!selectedDateOnly || selectedDateOnly < todayStart) {
            el('prebook-date').value = todayStr;
        }

        const effectiveSelectedDate = el('prebook-date').value;

        if (effectiveSelectedDate === todayStr) {
            const minH = String(today.getHours()).padStart(2, '0');
            const minM = String(today.getMinutes()).padStart(2, '0');
            el('prebook-time').min = `${minH}:${minM}`;
        } else {
            el('prebook-time').min = '';
        }
    }

    function getSelectedDateTime() {
        const date = el('prebook-date').value;
        const time = el('prebook-time').value;
        if (!date || !time) return null;
        const selected = new Date(`${date}T${time}:00`);
        return Number.isNaN(selected.getTime()) ? null : selected;
    }

    function isPastDateSelection(dateStr) {
        const selectedDateOnly = parseSelectedDate(dateStr);
        if (!selectedDateOnly) return true;
        return selectedDateOnly < getTodayStart();
    }

    syncMinTime();
    el('prebook-date').addEventListener('change', syncMinTime);

    el('prebook-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const selectedDate = el('prebook-date').value;
        if (isPastDateSelection(selectedDate)) {
            showToast('Please choose today or a future date for prebooking.', 'error');
            return;
        }
        const selected = getSelectedDateTime();
        if (!selected || selected.getTime() <= Date.now()) {
            showToast('Please select a valid future date and time for prebooking.', 'error');
            return;
        }
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
        const stationId = el('prebook-station-select')?.value;
        
        if (!stationId) {
            showToast('Please search and select a station first.', 'error');
            return;
        }

        if (isPastDateSelection(date)) {
            showToast('Prebooking date cannot be in the past.', 'error');
            return;
        }
        const selected = new Date(`${date}T${time}:00`);
        if (!date || !time || Number.isNaN(selected.getTime()) || selected.getTime() <= Date.now()) {
            showToast('Selected prebook time is invalid. Pick a future time.', 'error');
            return;
        }
        const btn = el('prebook-form').querySelector('button[type="submit"]');

        btn.disabled = true;
        btn.innerHTML = `<span class="material-symbols-outlined text-sm animate-spin">refresh</span> Processing...`;

        try {
            console.log('📝 Starting prebook with SoC:', soc, 'Date:', date, 'Time:', time, 'Station:', stationId);
            const res = await apiPrebook(soc, date, time, stationId);
            if (res.status === 'confirmed') {
                res.soc = soc;
                res.jit_pushed = true;
                upcomingBookings.push(res);
                saveUpcoming();

                // CRITICAL: Enqueue prebooking into priority queue immediately
                console.log('🚀 Pushing to priority queue:', { soc, station: res.station.name, booking_id: res.booking_id });
                simulateQueuePush(soc, res.station, res.booking_id, {
                    booked_time: res.scheduled_time,
                    station_id: res.station.id,
                    expires_at: new Date(res.scheduled_time).getTime() + SLOT_ACTIVE_WINDOW_MINS * 60000
                });

                showToast(`Slot occupied. Prebooking confirmed for ${res.station.name}`, 'success');
                renderUpcomingBookings();
                
                // Demo notification scheduling
                setTimeout(() => {
                    showToast(`Reminder: Charging slot at ${res.station.name} is in 24 hours.`, 'info', 8000);
                }, 4000);
            }
        } catch(e) {
            console.error('❌ Prebook error:', e);
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
        let removedExpiredBookings = false;

        upcomingBookings = upcomingBookings.filter(b => {
            const bTime = new Date(b.scheduled_time).getTime();
            const diffMins = (bTime - now) / 60000;

            // Dequeue expired/finished bookings from both local upcoming list and priority queue.
            if (diffMins < -SLOT_ACTIVE_WINDOW_MINS) {
                removeQueueEntryById(b.booking_id);
                removedExpiredBookings = true;
                return false;
            }
            
            // === JIT Queue Push: Push to scheduler queue when entering 15-min buffer ===
            if (diffMins >= 0 && diffMins <= 15 && !b.jit_pushed) {
                b.jit_pushed = true;
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
            return true;
        });

        if (removedExpiredBookings) {
            saveUpcoming();
            needsRerender = true;
        }

        // Also cleanup old immediate queue items so finished sessions are dequeued.
        cleanupExpiredQueueEntries(now);

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
// ML PREDICTION
// =============================================================
async function fetchMLPrediction() {
    try {
        console.log("Fetching ML prediction...");
        const response = await fetch(`${API_BASE_URL}/grid-prediction`);
        if (!response.ok) {
            console.error('Failed to fetch ML prediction:', response.status, response.statusText);
            return null;
        }
        const data = await response.json();
        console.log('ML Prediction API response:', data);
        return data;
    } catch (error) {
        console.error('Error fetching ML prediction:', error);
        return null;
    }
}

function updatePredictionUI(data) {
    console.log('=== updatePredictionUI called ===');
    console.log('Data received:', data);
    
    if (!data) {
        console.error('No prediction data available - data is null/undefined');
        return;
    }

    // Convert Watts to kW for display
    const currentLoadKW = (data.current_load_watts || 0) / 1000;
    const predictedLoadKW = (data.predicted_load_watts || 0) / 1000;
    
    console.log('Converted values:');
    console.log('- Current load kW:', currentLoadKW);
    console.log('- Predicted load kW:', predictedLoadKW);
    
    // Calculate percentage based on a 200kW grid capacity (adjust as needed)
    const gridCapacityKW = 200;
    const predictedLoadPercent = (predictedLoadKW / gridCapacityKW) * 100;
    
    console.log('- Predicted load percent:', predictedLoadPercent);

    // Update ML PREDICTION CARD (not Active Sessions card)
    console.log('Looking for element: ml-predicted-load');
    const predictedLoadEl = el('ml-predicted-load');
    console.log('Element found:', predictedLoadEl);
    
    if (predictedLoadEl) {
        if (!isNaN(predictedLoadPercent)) {
            const percent = ((data.predicted_load_watts || 0) / 1000 / 200 * 100).toFixed(1);
            const newText = percent + '%';
            console.log(`Setting ml-predicted-load text to: "${newText}"`);
            predictedLoadEl.textContent = newText;
            console.log(`Updated ML prediction load to: ${percent}%`);
        } else {
            console.error('Invalid predicted load percentage:', predictedLoadPercent);
        }
    } else {
        console.error('ml-predicted-load element not found in DOM');
    }

    // Update ML PREDICTION CARD kW
    console.log('Looking for element: ml-predicted-load-kw');
    const predictedLoadKWEl = el('ml-predicted-load-kw');
    console.log('Element found:', predictedLoadKWEl);
    
    if (predictedLoadKWEl) {
        if (!isNaN(predictedLoadKW)) {
            const kw = ((data.predicted_load_watts || 0) / 1000).toFixed(1);
            const newText = kw + ' kW forecasted next 15 min';
            console.log(`Setting ml-predicted-load-kw text to: "${newText}"`);
            predictedLoadKWEl.textContent = newText;
            console.log(`Updated ML prediction kW to: ${kw} kW`);
        } else {
            console.error('Invalid predicted load kW:', predictedLoadKW);
        }
    } else {
        console.error('ml-predicted-load-kw element not found in DOM');
    }

    // Update confidence (use model_used as confidence indicator)
    const confidenceEl = el('ml-confidence');
    if (confidenceEl) {
        const confidence = data.model_used === 'ML' ? '94.2' : '85.0'; // Simulated confidence
        console.log(`Setting confidence to: ${confidence}%`);
        confidenceEl.textContent = confidence + '%';
    }

    // Update status tag
    const statusTagEl = el('ml-status-tag');
    if (statusTagEl) {
        const status = predictedLoadPercent >= 45 ? 'ELEVATED' : 'NOMINAL';
        console.log(`Setting status to: ${status}`);
        statusTagEl.textContent = status;
        
        if (predictedLoadPercent >= 45) {
            statusTagEl.style.background = 'rgba(255,165,0,0.15)';
            statusTagEl.style.color = '#FFA500';
            statusTagEl.style.border = '1px solid rgba(255,165,0,0.3)';
        } else {
            statusTagEl.style.background = 'rgba(166,255,0,0.15)';
            statusTagEl.style.color = '#a6ff00';
            statusTagEl.style.border = '1px solid rgba(166,255,0,0.3)';
        }
    }
    
    console.log('=== updatePredictionUI completed ===');
}

function startMLPredictionUpdates() {
    console.log('Starting ML prediction updates...');
    
    // Immediate test call
    fetchMLPrediction().then(data => {
        console.log('Initial ML prediction fetch result:', data);
        if (data) {
            console.log('Updating UI with initial data...');
            updatePredictionUI(data);
        } else {
            console.error('No data received from initial ML prediction fetch');
        }
    }).catch(error => {
        console.error('Error in initial ML prediction fetch:', error);
    });

    // Update every 15 seconds
    setInterval(() => {
        console.log('Fetching ML prediction update...');
        fetchMLPrediction().then(data => {
            console.log('Periodic ML prediction fetch result:', data);
            if (data) {
                console.log('Updating UI with periodic data...');
                updatePredictionUI(data);
            } else {
                console.error('No data received from periodic ML prediction fetch');
            }
        }).catch(error => {
            console.error('Error in periodic ML prediction fetch:', error);
        });
    }, 15000);
}

// =============================================================
// INIT
// =============================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('=== DASHBOARD.JS LOADING ===');
    
    try {
        initQueueSyncChannel();
        initQueueSyncListeners();
        const session = await initSession();
        if (!session) return;
        
        await loadVehicleProfile(session.user.email, session.user.user_metadata?.full_name || session.user.email.split('@')[0]);

        initProfileEditor();
        initTabs();
        initChargeNow();
        initStationMap();
        initPrebook();
        initMyBookings();
        initBookingMap();
        if (typeof initSidebar === 'function') initSidebar();
        startNotificationEngine();
        startMLPredictionUpdates();
        
        // IMMEDIATE TEST: Force update ML prediction after 2 seconds
        setTimeout(async () => {
            console.log('=== IMMEDIATE ML TEST ===');
            const data = await fetchMLPrediction();
            console.log('Immediate test data:', data);
            if (data) {
                updatePredictionUI(data);
            }
        }, 2000);

        const logoutBtn = el('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                await supabaseClient.auth.signOut();
                showToast('Signed out', 'info');
                setTimeout(() => { window.location.href = 'login.html'; }, 500);
            });
        }
        
        console.log('=== DASHBOARD.JS INITIALIZED ===');
    } catch (err) {
        console.error('Dashboard init error:', err);
    }
});

function initSidebar() {
    const links = document.querySelectorAll('.gp-sidebar__nav-item');
    const currentPath = window.location.pathname.split('/').pop() || 'user-dashboard.html';
    
    links.forEach(link => {
        const href = link.getAttribute('href');
        const page = link.getAttribute('data-page');
        const shouldBeActive = (href === currentPath || (page && currentPath.includes(page)));

        if (shouldBeActive) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

// =============================================================
// BOOKING MAP - Show booking location and route
// =============================================================

let bookingMap = null;
let bookingMapMarkers = [];

function initBookingMap() {
    const mapContainer = el('booking-map');
    if (!mapContainer) return;

    const loadingOverlay = el('booking-map-loading');
    const refreshBtn = el('refresh-map-btn');

    // Check if Google Maps API is loaded
    if (typeof google === 'undefined' || !google.maps) {
        console.error('Booking Map: Google Maps API not available');
        if (loadingOverlay) {
            loadingOverlay.innerHTML = `
                <div class="text-center">
                    <span class="material-symbols-outlined text-4xl text-red-400 mb-2 block">error</span>
                    <p class="font-mono text-xs text-red-400 tracking-widest text-center px-4">Google Maps failed to load</p>
                </div>
            `;
        }
        return;
    }

    if (loadingOverlay) loadingOverlay.classList.remove('hidden');

    // Get user location
    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const userLat = pos.coords.latitude;
            const userLng = pos.coords.longitude;

            // Initialize map
            if (!bookingMap) {
                bookingMap = new google.maps.Map(mapContainer, {
                    center: { lat: userLat, lng: userLng },
                    zoom: 13,
                    styles: [
                        { elementType: "geometry", stylers: [{ color: "#212121" }] },
                        { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
                        { featureType: "road", elementType: "geometry", stylers: [{ color: "#303030" }] },
                        { featureType: "water", elementType: "geometry", stylers: [{ color: "#000000" }] }
                    ],
                    disableDefaultUI: true
                });
            }

            // Clear existing markers
            bookingMapMarkers.forEach(m => m.setMap(null));
            bookingMapMarkers = [];

            // Add user marker
            const userMarker = new google.maps.Marker({
                position: { lat: userLat, lng: userLng },
                map: bookingMap,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    fillColor: "#3b82f6",
                    fillOpacity: 1,
                    strokeColor: "#ffffff",
                    strokeWeight: 2,
                    scale: 8
                },
                title: "Your Location"
            });
            bookingMapMarkers.push(userMarker);

            // Get active bookings
            let q = [];
            try { q = JSON.parse(localStorage.getItem('gridpulz_queue') || '[]'); } catch(e){}
            const uid = currentSession?.user?.id || 'demo';
            const myActive = q.filter(item => item.user_id === uid || (item.user_id === 'demo' && uid === 'demo'));

            // Get upcoming bookings
            const upcoming = JSON.parse(localStorage.getItem('gridpulz_upcoming') || '[]');

            // Combine all bookings
            const allBookings = [...myActive, ...upcoming];

            if (allBookings.length > 0) {
                // Add station markers and routes for each booking
                const bounds = new google.maps.LatLngBounds();
                bounds.extend({ lat: userLat, lng: userLng });

                allBookings.forEach((booking, index) => {
                    const stationLat = booking.lat || booking.latitude;
                    const stationLng = booking.lng || booking.longitude;
                    const stationName = booking.station_name || 'Station';

                    if (stationLat && stationLng) {
                        // Station marker
                        const stationMarker = new google.maps.Marker({
                            position: { lat: stationLat, lng: stationLng },
                            map: bookingMap,
                            icon: {
                                path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
                                fillColor: index === 0 ? "#BFFF00" : "#f59e0b",
                                fillOpacity: 0.8,
                                strokeColor: "#000",
                                strokeWeight: 1,
                                scale: 1.5,
                                anchor: new google.maps.Point(12, 24)
                            },
                            title: stationName
                        });
                        bookingMapMarkers.push(stationMarker);

                        // Route line
                        const route = new google.maps.Polyline({
                            path: [{ lat: userLat, lng: userLng }, { lat: stationLat, lng: stationLng }],
                            geodesic: true,
                            strokeColor: index === 0 ? "#BFFF00" : "#f59e0b",
                            strokeOpacity: 0.6,
                            strokeWeight: 3,
                            map: bookingMap
                        });
                        bookingMapMarkers.push(route);

                        bounds.extend({ lat: stationLat, lng: stationLng });
                    }
                });

                bookingMap.fitBounds(bounds);
            }

            if (loadingOverlay) loadingOverlay.classList.add('hidden');
        },
        (error) => {
            console.error('Geolocation error:', error);
            if (loadingOverlay) {
                loadingOverlay.innerHTML = '<div class="font-mono text-xs text-red-400 tracking-widest text-center px-4">Unable to get location</div>';
            }
        }
    );

    // Refresh button handler
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            initBookingMap();
        });
    }
}
