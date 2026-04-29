// ============================================================
// GridPulz — Priority Scheduler Logic
// Ported from Priority Scheduler Simulator
// ============================================================

let STATIONS = [];
let stationsLoaded = false;

let vehicles = [];
let allocCount = 0;
let arrivalTime = Date.now();
let isAllocating = false;
let realtimeUpdateInterval = null;
let lastQueueRank = {}; // Track previous ranks for animation triggers

// --- Helpers ---
function el(id) { return document.getElementById(id); }

// --- Load Stations from Supabase ---
async function loadStationsFromSupabase() {
    if (!window.supabaseClient) {
        console.error('Supabase client not available, using fallback stations');
        // Fallback to simulated data if Supabase is not available
        STATIONS = [
            { name: 'Station Alpha', slots: 2, maxSlots: 2, gridLoad: 42, dist: 0.4 },
            { name: 'Station Beta', slots: 1, maxSlots: 3, gridLoad: 81, dist: 1.2 },
            { name: 'Station Gamma', slots: 3, maxSlots: 3, gridLoad: 28, dist: 2.1 }
        ];
        stationsLoaded = true;
        return;
    }

    try {
        const { data: stations, error } = await window.supabaseClient
            .from('stations')
            .select('*');

        if (error) throw error;

        if (stations && stations.length > 0) {
            // Map Supabase station data to scheduler format
            STATIONS = stations.map(station => ({
                id: station.id,
                name: station.name || station.station_name || `Station ${station.id}`,
                slots: station.available_slots || station.slots || 2,
                maxSlots: station.total_slots || station.max_slots || 3,
                gridLoad: station.grid_load || station.load_percentage || 50,
                dist: station.distance || 1.0,
                lat: station.latitude,
                lng: station.longitude,
                scoring_level: station.scoring_level || station.priority || 50
            }));
            console.log(`✓ Loaded ${STATIONS.length} stations from Supabase`);
        } else {
            // Fallback if no stations in Supabase
            console.warn('No stations found in Supabase, using fallback data');
            STATIONS = [
                { name: 'Station Alpha', slots: 2, maxSlots: 2, gridLoad: 42, dist: 0.4 },
                { name: 'Station Beta', slots: 1, maxSlots: 3, gridLoad: 81, dist: 1.2 },
                { name: 'Station Gamma', slots: 3, maxSlots: 3, gridLoad: 28, dist: 2.1 }
            ];
        }
        stationsLoaded = true;
    } catch (err) {
        console.error('Error loading stations from Supabase:', err);
        // Fallback to simulated data
        STATIONS = [
            { name: 'Station Alpha', slots: 2, maxSlots: 2, gridLoad: 42, dist: 0.4 },
            { name: 'Station Beta', slots: 1, maxSlots: 3, gridLoad: 81, dist: 1.2 },
            { name: 'Station Gamma', slots: 3, maxSlots: 3, gridLoad: 28, dist: 2.1 }
        ];
        stationsLoaded = true;
    }
}

function getGridClass(gridLoad) {
    if (gridLoad > 75) return 'bg-red-500';
    if (gridLoad > 55) return 'bg-yellow-500';
    return 'bg-emerald-500';
}

function getBadge(gridLoad) {
    if (gridLoad > 75) return `<span class="bg-red-500/15 text-red-400 border border-red-500/20 px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-widest flex items-center gap-1"><span class="material-symbols-outlined text-[10px]">warning</span> Overload Risk</span>`;
    if (gridLoad > 55) return `<span class="bg-yellow-500/15 text-yellow-400 border border-yellow-500/20 px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-widest flex items-center gap-1"><span class="material-symbols-outlined text-[10px]">info</span> Moderate</span>`;
    return `<span class="bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-widest flex items-center gap-1"><span class="material-symbols-outlined text-[10px]">verified</span> Healthy</span>`;
}

function getSlotColor(slots, maxSlots) {
    if (slots === 0) return 'text-red-400';
    if (slots === 1) return 'text-yellow-400';
    return 'text-emerald-400';
}

function avatarColor(name) {
    const colors = [
        ['bg-blue-500/20', 'text-blue-300', 'border-blue-500/30'],
        ['bg-emerald-500/20', 'text-emerald-300', 'border-emerald-500/30'],
        ['bg-orange-500/20', 'text-orange-300', 'border-orange-500/30'],
        ['bg-purple-500/20', 'text-purple-300', 'border-purple-500/30'],
        ['bg-neon/20', 'text-neon', 'border-neon/30']
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
}

// --- Real-time Update Functions ---
function updateVehicleWaitTimes() {
    vehicles.forEach(v => {
        v.waitMins = Math.round((Date.now() - arrivalTime) / 60000);
    });
}

function isQueueOrderChanged(sorted) {
    let changed = false;
    sorted.forEach((v, newRank) => {
        const prevRank = lastQueueRank[v.id];
        if (prevRank !== undefined && prevRank !== newRank && getTemporalState(v) !== 'upcoming') {
            changed = true;
        }
        lastQueueRank[v.id] = newRank;
    });
    return changed;
}

function startRealtimeUpdates() {
    if (realtimeUpdateInterval) clearInterval(realtimeUpdateInterval);
    
    realtimeUpdateInterval = setInterval(() => {
        if (vehicles.length === 0 || isAllocating) return;

        // Update wait times
        updateVehicleWaitTimes();

        // Re-sort queue
        const sorted = [...vehicles].sort((a, b) => calcScore(b) - calcScore(a));
        
        // Check if order changed for animation
        const orderChanged = isQueueOrderChanged(sorted);

        // Update metrics with animation
        updateMetricsWithAnimation();

        // Re-render queue with animations for changed items
        renderQueueWithRealtimeEffects(sorted, orderChanged);

        // Update algo trace
        if (vehicles.length > 0) {
            updateAlgoTrace(1);
        }
    }, 1000); // Update every second
}

function stopRealtimeUpdates() {
    if (realtimeUpdateInterval) {
        clearInterval(realtimeUpdateInterval);
        realtimeUpdateInterval = null;
    }
}

function updateMetricsWithAnimation() {
    const metricsToUpdate = [
        { el: el('m-users'), value: vehicles.length },
        { el: el('m-slots'), value: STATIONS.reduce((sum, st) => sum + st.slots, 0) },
        { el: el('m-alloc'), value: allocCount }
    ];

    metricsToUpdate.forEach(({ el: element, value }) => {
        if (element && element.textContent !== String(value)) {
            element.classList.add('metric-pulse');
            element.textContent = value;
            setTimeout(() => element.classList.remove('metric-pulse'), 800);
        }
    });
}

function renderQueueWithRealtimeEffects(sorted, orderChanged) {
    const list = el('queue-list');

    if (sorted.length === 0) {
        list.innerHTML = `
            <div class="text-center py-10">
                <span class="material-symbols-outlined text-3xl text-white/5 mb-2 block">format_list_bulleted</span>
                <div class="text-[10px] uppercase tracking-widest text-on-surface-variant/40">Queue is empty</div>
            </div>`;
        return;
    }

    const newHTML = sorted.map((v, rank) => {
        const score = calcScore(v);
        const tState = getTemporalState(v);
        const dimClass = tState === 'upcoming' ? 'opacity-40' : '';
        
        // Add animation class if rank changed
        const prevRank = lastQueueRank[v.id];
        const rankChanged = orderChanged && prevRank !== undefined && prevRank !== rank && tState !== 'upcoming';
        const animClass = rankChanged ? 'rank-changed' : '';
        
        // Highlight urgent low-battery vehicles
        const urgentClass = v.battery < 25 && score > 50 ? 'live-priority-boost' : '';

        const [bg, fg, border] = avatarColor(v.name);
        const initials = v.name.slice(0, 2).toUpperCase();
        const badge = getTemporalBadge(v);
        const bookedInfo = v.booked_time ? `<span class="text-neon/50"> • Booked ${new Date(v.booked_time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>` : '';
        
        const scoreUpdateClass = 'score-live score-badge updating';
        const waitTimerClass = 'wait-timer ticking';
        const batteryClass = v.battery < 25 ? 'battery-critical' : '';

        return `
            <div class="queue-item ${animClass} ${urgentClass} ${dimClass} bg-white/[0.03] border border-white/5 p-3 rounded-lg flex items-center gap-3">
                <div class="w-8 h-8 rounded-full border flex items-center justify-center font-bold text-xs ${bg} ${fg} ${border}">
                    ${initials}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="font-bold text-xs text-white truncate flex items-center gap-2 ${batteryClass}">${v.name} ${badge}</div>
                    <div class="text-[9px] text-on-surface-variant/50 uppercase tracking-widest truncate mt-0.5">
                        <span class="${v.battery < 30 ? 'text-red-400' : 'text-white/70'}">${v.battery}% SoC</span> • Wait <span class="${waitTimerClass}">${v.waitMins}m</span> • Target: ${STATIONS[v.stationIdx].name}${bookedInfo}
                    </div>
                </div>
                <div class="text-right pl-2 border-l border-white/5">
                    <div class="bg-white/10 text-white font-mono font-bold text-xs px-2 py-0.5 rounded pill inline-block ${scoreUpdateClass}">${score}</div>
                    <div class="text-[8px] uppercase tracking-widest text-on-surface-variant/40 mt-1">${tState === 'upcoming' ? 'Passive' : 'Rank #' + (rank + 1)}</div>
                </div>
            </div>`;
    }).join('');

    list.innerHTML = newHTML;
}

// --- Domain Logic ---
const BUFFER_WINDOW_MINS = 15;

function getTemporalState(v) {
    if (!v.booked_time) return 'charge_now';
    const now = Date.now();
    const bookedMs = new Date(v.booked_time).getTime();
    const diffMins = (bookedMs - now) / 60000;
    if (diffMins > BUFFER_WINDOW_MINS) return 'upcoming';   // Passive
    if (diffMins >= 0)                 return 'activating'; // Within buffer
    return 'active'; // Time has passed, treat as active charge-now
}

function calcScore(v) {
    const station = STATIONS[v.stationIdx];
    const batteryScore = (100 - v.battery) * 0.60;
    const waitScore    = v.waitMins * 0.30;
    const gridPenalty  = station.gridLoad * 0.10;
    
    // Use scoring_level from Supabase if available, otherwise use grid load
    const scoringBonus = (station.scoring_level || 50) * 0.05;
    
    let baseScore = batteryScore + waitScore - gridPenalty + scoringBonus;

    // Temporal Weight Factor (Wt)
    const state = getTemporalState(v);
    if (state === 'upcoming') {
        // Passive — slot is far away, suppress from queue
        return 0;
    }
    if (state === 'activating') {
        const now = Date.now();
        const bookedMs = new Date(v.booked_time).getTime();
        const diffMins = (bookedMs - now) / 60000;
        const temporalBoost = (BUFFER_WINDOW_MINS - diffMins) * 10;
        baseScore += temporalBoost;
    }
    // 'active' and 'charge_now' use baseScore as-is
    return +baseScore.toFixed(1);
}

function findBestRedirect(excludeIdx) {
    let best = null;
    let bestScore = -Infinity;

    STATIONS.forEach((s, i) => {
        if (i === excludeIdx && s.slots === 0) return;
        if (s.gridLoad > 85) return; // Never redirect to critically overloaded station

        // Find best station combining slot availability, low grid load, and scoring_level
        const scoringBonus = (s.scoring_level || 50) * 0.3; // Higher scoring_level = better station
        const score = (s.slots > 0 ? 50 : 0) + (85 - s.gridLoad) * 0.5 - (s.dist * 5) + scoringBonus;
        if (score > bestScore && (i !== excludeIdx || s.slots > 0)) {
            bestScore = score;
            best = i;
        }
    });
    return best;
}

// --- DOM Rendering ---
function updateMetrics() {
    el('m-users').textContent = vehicles.length;
    el('m-slots').textContent = STATIONS.reduce((sum, st) => sum + st.slots, 0);
    el('m-alloc').textContent = allocCount;
}

function updateAlgoTrace(step) {
    document.querySelectorAll('.algo-step').forEach((element, i) => {
        if (i < step) {
            element.classList.add('active');
        } else {
            element.classList.remove('active');
        }
    });
}

function renderStations() {
    const list = el('stations-list');
    list.innerHTML = STATIONS.map((s, i) => `
        <div class="bg-white/[0.03] border border-white/5 p-4 rounded-lg" data-station-idx="${i}">
            <div class="flex justify-between items-center mb-3">
                <div class="font-headline font-bold text-sm text-white">${s.name}</div>
                ${getBadge(s.gridLoad)}
            </div>
            
            <div class="space-y-2 text-xs">
                <div class="flex justify-between items-center">
                    <span class="text-on-surface-variant/50 uppercase tracking-widest text-[9px]">Slots Available</span>
                    <span class="font-mono font-bold ${getSlotColor(s.slots, s.maxSlots)}">${s.slots}<span class="text-white/30 font-normal">/${s.maxSlots}</span></span>
                </div>
                
                <div class="flex items-center gap-3">
                    <span class="text-on-surface-variant/50 uppercase tracking-widest text-[9px] w-16">Grid Load</span>
                    <div class="bar-wrap">
                        <div class="bar ${getGridClass(s.gridLoad)}" style="width: ${s.gridLoad}%"></div>
                    </div>
                    <span class="font-mono font-bold text-white text-[10px] w-8 text-right">${s.gridLoad.toFixed(0)}%</span>
                </div>
                
                <div class="flex justify-between items-center">
                    <span class="text-on-surface-variant/50 uppercase tracking-widest text-[9px]">Scoring Level</span>
                    <span class="font-mono text-neon text-[10px]">${s.scoring_level || 50}</span>
                </div>
                
                <div class="flex justify-between items-center">
                    <span class="text-on-surface-variant/50 uppercase tracking-widest text-[9px]">Distance</span>
                    <span class="font-mono text-white/80 text-[10px]">${s.dist} km</span>
                </div>
            </div>
        </div>
    `).join('');
}

function getTemporalBadge(v) {
    const state = getTemporalState(v);
    if (state === 'upcoming') {
        return `<span class="bg-white/5 text-white/40 border border-white/10 px-1.5 py-0.5 rounded text-[8px] uppercase font-bold tracking-widest flex items-center gap-0.5"><span class="material-symbols-outlined text-[10px]">schedule</span>Upcoming</span>`;
    }
    if (state === 'activating') {
        return `<span class="bg-neon/15 text-neon border border-neon/30 px-1.5 py-0.5 rounded text-[8px] uppercase font-bold tracking-widest flex items-center gap-0.5 animate-pulse"><span class="material-symbols-outlined text-[10px]">bolt</span>Activating</span>`;
    }
    if (state === 'active') {
        return `<span class="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded text-[8px] uppercase font-bold tracking-widest flex items-center gap-0.5"><span class="material-symbols-outlined text-[10px]">electric_bolt</span>Active</span>`;
    }
    return ''; // charge_now — no badge
}

function renderQueue(sorted, highlights = null) {
    const list = el('queue-list');

    if (sorted.length === 0) {
        list.innerHTML = `
            <div class="text-center py-10">
                <span class="material-symbols-outlined text-3xl text-white/5 mb-2 block">format_list_bulleted</span>
                <div class="text-[10px] uppercase tracking-widest text-on-surface-variant/40">Queue is empty</div>
            </div>`;
        return;
    }

    list.innerHTML = sorted.map((v, rank) => {
        const score = calcScore(v);
        const tState = getTemporalState(v);
        let cls = '';
        if (highlights) {
            cls = highlights.losers.includes(v.id) ? 'loser' : 'winner';
        }
        // Dim passive pre-bookings
        const dimClass = tState === 'upcoming' ? 'opacity-40' : '';

        const [bg, fg, border] = avatarColor(v.name);
        const initials = v.name.slice(0, 2).toUpperCase();
        const badge = getTemporalBadge(v);
        const bookedInfo = v.booked_time ? `<span class="text-neon/50"> • Booked ${new Date(v.booked_time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>` : '';

        return `
            <div class="queue-item ${cls} ${dimClass} bg-white/[0.03] border border-white/5 p-3 rounded-lg flex items-center gap-3">
                <div class="w-8 h-8 rounded-full border flex items-center justify-center font-bold text-xs ${bg} ${fg} ${border}">
                    ${initials}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="font-bold text-xs text-white truncate flex items-center gap-2">${v.name} ${badge}</div>
                    <div class="text-[9px] text-on-surface-variant/50 uppercase tracking-widest truncate mt-0.5">
                        <span class="${v.battery < 30 ? 'text-red-400' : 'text-white/70'}">${v.battery}% SoC</span> • Wait ${v.waitMins}m • Target: ${STATIONS[v.stationIdx].name}${bookedInfo}
                    </div>
                </div>
                <div class="text-right pl-2 border-l border-white/5">
                    <div class="bg-white/10 text-white font-mono font-bold text-xs px-2 py-0.5 rounded pill inline-block">${score}</div>
                    <div class="text-[8px] uppercase tracking-widest text-on-surface-variant/40 mt-1">${tState === 'upcoming' ? 'Passive' : 'Rank #' + (rank + 1)}</div>
                </div>
            </div>`;
    }).join('');
}

// --- User Actions ---
function handleRunAllocation() {
    if (vehicles.length === 0 || isAllocating) {
        return;
    }
    
    isAllocating = true;

    // Pause real-time updates during allocation
    stopRealtimeUpdates();

    const sorted = [...vehicles].sort((a, b) => calcScore(b) - calcScore(a));
    const log = el('decision-log');

    updateAlgoTrace(3); // Sorting step
    renderQueueWithRealtimeEffects(sorted);

    // Simulate delay for trace visualization
    setTimeout(() => {
        updateAlgoTrace(4); // Check avail step

        const decisions = [];
        const passiveIds = []; // Track passive pre-bookings to preserve them

        sorted.forEach((v, rank) => {
            // ── Temporal Gate: Skip passive pre-bookings ──
            const tState = getTemporalState(v);
            if (tState === 'upcoming') {
                decisions.push({ v, type: 'passive', score: 0 });
                passiveIds.push(v.id);
                return; // Skip — not yet in the active window
            }

            const st = STATIONS[v.stationIdx];
            const score = calcScore(v);
            let decided = false;

            // 1. Grid Load Penalty Check
            if (st.gridLoad > 85) {
                const redirIdx = findBestRedirect(v.stationIdx);
                if (redirIdx !== null && STATIONS[redirIdx].slots > 0) {
                    STATIONS[redirIdx].slots--;
                    decisions.push({ v, type: 'grid-redirect', score, from: v.stationIdx, to: redirIdx });
                    allocCount++;
                } else {
                    decisions.push({ v, type: 'wait', score });
                }
                decided = true;
            }

            // 2. Assignment Logic
            if (!decided) {
                if (st.slots > 0) {
                    st.slots--;
                    const label = tState === 'activating' ? 'assigned-jit' : 'assigned';
                    decisions.push({ v, type: label, score, station: v.stationIdx });
                    allocCount++;
                } else {
                    const redirIdx = findBestRedirect(v.stationIdx);
                    if (redirIdx !== null && STATIONS[redirIdx].slots > 0) {
                        STATIONS[redirIdx].slots--;
                        decisions.push({ v, type: 'redirect', score, from: v.stationIdx, to: redirIdx });
                        allocCount++;
                    } else {
                        decisions.push({ v, type: 'wait', score });
                    }
                }
            }
        });

        updateAlgoTrace(8); // Final step (updated for new trace)
        
        // Render stations with animation
        const stationElems = document.querySelectorAll('[data-station-idx]');
        stationElems.forEach(el => el.classList.add('station-updating'));
        setTimeout(() => {
            stationElems.forEach(el => el.classList.remove('station-updating'));
        }, 1000);
        
        renderStations();
        updateMetrics();

        // Render Decisions
        let html = '';
        decisions.forEach(d => {
            if (d.type === 'assigned' || d.type === 'assigned-jit') {
                const jitNote = d.type === 'assigned-jit' ? ' <span class="text-neon">⚡ JIT Activated</span>' : '';
                html += `
                    <div class="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-lg mb-2 animate-fadeIn">
                        <div class="text-xs font-bold text-emerald-400 flex items-center gap-1.5"><span class="material-symbols-outlined text-[14px]">check_circle</span> Slot Confirmed: ${STATIONS[d.station].name}${jitNote}</div>
                        <div class="text-[10px] text-emerald-300/70 mt-1">Driver <strong>${d.v.name}</strong> • ${d.score} pts • ${d.v.battery}% SoC</div>
                    </div>`;
            } else if (d.type === 'redirect' || d.type === 'grid-redirect') {
                const reason = d.type === 'grid-redirect' ? `Grid overload at target` : `Target station full`;
                html += `
                    <div class="bg-yellow-500/10 border border-yellow-500/20 p-3 rounded-lg mb-2 animate-fadeIn">
                        <div class="text-xs font-bold text-yellow-500 flex items-center gap-1.5"><span class="material-symbols-outlined text-[14px]">turn_right</span> Redirected: ${STATIONS[d.to].name}</div>
                        <div class="text-[10px] text-yellow-400/70 mt-1">Driver <strong>${d.v.name}</strong> • ${reason}</div>
                    </div>`;
            } else if (d.type === 'passive') {
                html += `
                    <div class="bg-white/[0.02] border border-white/5 p-3 rounded-lg mb-2 opacity-50 animate-fadeIn">
                        <div class="text-xs font-bold text-white/40 flex items-center gap-1.5"><span class="material-symbols-outlined text-[14px]">schedule</span> Passive (Pre-booked)</div>
                        <div class="text-[10px] text-white/25 mt-1">Driver <strong>${d.v.name}</strong> • Slot not yet in buffer window — skipped</div>
                    </div>`;
            } else {
                html += `
                    <div class="bg-white/5 border border-white/10 p-3 rounded-lg mb-2 animate-fadeIn">
                        <div class="text-xs font-bold text-white/50 flex items-center gap-1.5"><span class="material-symbols-outlined text-[14px]">hourglass_empty</span> Queued</div>
                        <div class="text-[10px] text-white/30 mt-1">Driver <strong>${d.v.name}</strong> • All viable stations full</div>
                    </div>`;
            }
        });

        log.innerHTML = html;

        const keepIds = [
            ...decisions.filter(d => d.type === 'wait').map(d => d.v.id),
            ...passiveIds  // Always keep passive pre-bookings in the queue
        ];
        renderQueueWithRealtimeEffects(sorted, true);

        // Keep waiting + passive vehicles, remove assigned/redirected
        vehicles = vehicles.filter(v => keepIds.includes(v.id));
        
        // Sync back to local storage
        try {
            let q = JSON.parse(localStorage.getItem('gridpulz_queue') || '[]');
            q = q.map(item => {
                if (!keepIds.includes(item.id)) {
                    item.status = 'allocated';
                }
                return item;
            });
            localStorage.setItem('gridpulz_queue', JSON.stringify(q));
        } catch(e) {}

        setTimeout(() => {
            updateAlgoTrace(0);
            isAllocating = false;

            // Resume real-time updates if there are still vehicles
            if (vehicles.length > 0) {
                startRealtimeUpdates();
            }
        }, 2000);

    }, 800);
}

function handleReset() {
    vehicles = [];
    allocCount = 0;
    arrivalTime = Date.now();
    lastQueueRank = {};

    // Stop real-time updates
    stopRealtimeUpdates();

    // Reload stations from Supabase to get fresh data
    loadStationsFromSupabase().then(() => {
        // Reset slots and grid load to initial values from Supabase
        STATIONS.forEach(s => {
            s.slots = s.maxSlots; // Reset to full capacity
            // Keep gridLoad as is from Supabase (real-time data)
        });
        
        renderStations();
        updateMetrics();
        updateAlgoTrace(0);
    });

    el('queue-list').innerHTML = `
        <div class="text-center py-10">
            <span class="material-symbols-outlined text-3xl text-white/5 mb-2 block">format_list_bulleted</span>
            <div class="text-[10px] uppercase tracking-widest text-on-surface-variant/40">Queue is empty</div>
        </div>`;

    el('decision-log').innerHTML = `
        <div class="text-center py-8">
            <span class="material-symbols-outlined text-3xl text-white/5 mb-2 block">receipt_long</span>
            <div class="text-[10px] uppercase tracking-widest text-on-surface-variant/40">Waiting for allocation...</div>
        </div>`;

    updateMetrics();
    renderStations();
    updateAlgoTrace(0);
}

// --- Init ---
document.addEventListener('DOMContentLoaded', async () => {
    // Load stations from Supabase first
    await loadStationsFromSupabase();

    // Listeners
    el('run-btn').addEventListener('click', handleRunAllocation);
    el('reset-btn').addEventListener('click', handleReset);

    // Initial render
    renderStations();
    updateMetrics();

    // Refresh station data from Supabase periodically (real-time effect)
    setInterval(async () => {
        try {
            if (window.supabaseClient && stationsLoaded) {
                const { data: stations, error } = await window.supabaseClient
                    .from('stations')
                    .select('*');

                if (!error && stations && stations.length > 0) {
                    // Update STATIONS array with fresh data from Supabase
                    stations.forEach(station => {
                        const idx = STATIONS.findIndex(s => s.id === station.id);
                        if (idx !== -1) {
                            STATIONS[idx].slots = station.available_slots || station.slots || STATIONS[idx].slots;
                            STATIONS[idx].gridLoad = station.grid_load || station.load_percentage || STATIONS[idx].gridLoad;
                            STATIONS[idx].scoring_level = station.scoring_level || station.priority || STATIONS[idx].scoring_level || 50;
                        }
                    });
                    
                    // Update station display
                    if (vehicles.length > 0) {
                        renderStations();
                    }
                }
            }
        } catch (err) {
            console.error('Error refreshing station data:', err);
        }
    }, 5000); // Refresh every 5 seconds

    // Listen to Remote Queue pushes (from Driver Dashboard Mocks)
    window.addEventListener('storage', (e) => {
        if (e.key === 'gridpulz_queue' && e.newValue) {
            try {
                const externalQueue = JSON.parse(e.newValue);
                // Sync removals
                vehicles = vehicles.filter(v => !v.isExternal || externalQueue.find(eq => eq.id === v.id && eq.status !== 'allocated'));
                // Sync additions
                externalQueue.forEach(eq => {
                    if (!vehicles.find(v => v.id === eq.id) && eq.status !== 'allocated') {
                        eq.waitMins = Math.round((Date.now() - arrivalTime) / 60000) || 0;
                        eq.isExternal = true;
                        vehicles.push(eq);
                        lastQueueRank[eq.id] = vehicles.length - 1;
                    }
                });
                updateMetrics();
                const sorted = [...vehicles].sort((a, b) => calcScore(b) - calcScore(a));
                renderQueueWithRealtimeEffects(sorted);
                updateAlgoTrace(1); // Highlight Step 1: Incoming Arrival
                
                // Start real-time updates if not running
                if (!realtimeUpdateInterval) {
                    startRealtimeUpdates();
                }
            } catch (err) {}
        }
        
        // Also listen to prebook sync ping for same-page updates
        if (e.key === 'gridpulz_queue_sync_ping' && e.newValue) {
            try {
                const q = JSON.parse(localStorage.getItem('gridpulz_queue') || '[]');
                if (q.length > 0) {
                    vehicles = q.map(eq => ({
                        ...eq,
                        isExternal: true,
                        waitMins: eq.waitMins || 0
                    }));
                    vehicles.forEach((v, idx) => {
                        lastQueueRank[v.id] = idx;
                    });
                    updateMetrics();
                    const sorted = [...vehicles].sort((a, b) => calcScore(b) - calcScore(a));
                    renderQueueWithRealtimeEffects(sorted);
                    updateAlgoTrace(1);
                    if (!realtimeUpdateInterval) {
                        startRealtimeUpdates();
                    }
                }
            } catch (err) {}
        }
    });

    // Load initial mock queue on load
    try {
        const initialQueue = JSON.parse(localStorage.getItem('gridpulz_queue') || '[]');
        if (initialQueue.length > 0) {
            initialQueue.forEach(eq => {
                if (!vehicles.find(v => v.id === eq.id) && eq.status !== 'allocated') {
                    eq.waitMins = eq.waitMins || Math.round((Date.now() - arrivalTime) / 60000) || 0;
                    eq.isExternal = true;
                    vehicles.push(eq);
                    lastQueueRank[eq.id] = vehicles.length - 1;
                }
            });
            updateMetrics();
            const sorted = [...vehicles].sort((a, b) => calcScore(b) - calcScore(a));
            renderQueueWithRealtimeEffects(sorted);
            updateAlgoTrace(1);
            
            // Start real-time updates
            startRealtimeUpdates();
            
            console.log(`✓ Loaded ${initialQueue.length} pre-booked vehicles from localStorage`);
        }
    } catch(e) {
        console.error('Error loading initial queue:', e);
    }
    
    // Periodically check for updates from localStorage (fallback for same-page updates)
    setInterval(() => {
        try {
            const q = JSON.parse(localStorage.getItem('gridpulz_queue') || '[]');
            const currentIds = new Set(vehicles.map(v => v.id));
            
            // Check for new entries
            q.forEach(eq => {
                if (!currentIds.has(eq.id) && eq.status !== 'allocated') {
                    eq.waitMins = eq.waitMins || 0;
                    eq.isExternal = true;
                    vehicles.push(eq);
                    lastQueueRank[eq.id] = vehicles.length - 1;
                    
                    updateMetrics();
                    const sorted = [...vehicles].sort((a, b) => calcScore(b) - calcScore(a));
                    renderQueueWithRealtimeEffects(sorted);
                    updateAlgoTrace(1);
                    
                    if (!realtimeUpdateInterval) {
                        startRealtimeUpdates();
                    }
                }
            });
        } catch(e) {}
    }, 2000); // Check every 2 seconds
});
