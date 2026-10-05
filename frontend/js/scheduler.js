// ============================================================
// GridPulz — Priority Scheduler Logic
// Ported from Priority Scheduler Simulator
// ============================================================

const STATIONS = [
    { name: 'Station Alpha', slots: 2, maxSlots: 2, gridLoad: 42, dist: 0.4 },
    { name: 'Station Beta', slots: 1, maxSlots: 3, gridLoad: 81, dist: 1.2 },
    { name: 'Station Gamma', slots: 3, maxSlots: 3, gridLoad: 28, dist: 2.1 }
];

let vehicles = [];
let allocCount = 0;
let arrivalTime = Date.now();
let isAllocating = false;

// --- Helpers ---
function el(id) { return document.getElementById(id); }

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
    const batteryScore = (100 - v.battery) * 0.60;
    const waitScore    = v.waitMins * 0.30;
    const gridPenalty  = STATIONS[v.stationIdx].gridLoad * 0.10;
    let baseScore = batteryScore + waitScore - gridPenalty;

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

        // Find best station combining slot availability and low grid load
        const score = (s.slots > 0 ? 50 : 0) + (85 - s.gridLoad) * 0.5 - (s.dist * 5);
        if (score > bestScore && (i !== excludeIdx || s.slots > 0)) {
            bestScore = score;
            best = i;
        }
    });
    return best;
}

// --- DOM Rendering ---
function renderStationsOptions() {
    const select = el('v-station');
    select.innerHTML = STATIONS.map((s, i) =>
        `<option value="${i}" class="bg-[#131318] text-white">Target: ${s.name} — ${s.dist} km</option>`
    ).join('');
}

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
        <div class="bg-white/[0.03] border border-white/5 p-4 rounded-lg">
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
                    <span class="font-mono font-bold text-white text-[10px] w-8 text-right">${s.gridLoad}%</span>
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
function handleAddVehicle() {
    const nameInput = el('v-name').value.trim();
    const name = nameInput || `Driver-${Math.floor(Math.random() * 1000)}`;
    const battery = +el('v-bat').value;
    const stationIdx = +el('v-station').value;

    // Simulate wait time (older vehicles waited longer)
    const waitMins = Math.round((Date.now() - arrivalTime) / 60000 + (Math.random() * 5));

    const v = { id: Date.now() + Math.random(), name, battery, stationIdx, waitMins };

    // Optional pre-book time
    const prebookInput = el('v-prebook');
    if (prebookInput && prebookInput.value) {
        v.booked_time = new Date(prebookInput.value).toISOString();
    }

    vehicles.push(v);

    // Reset form
    el('v-name').value = '';
    el('v-bat').value = 35;
    el('bat-out').textContent = '35%';
    if (prebookInput) prebookInput.value = '';

    updateMetrics();
    const sorted = [...vehicles].sort((a, b) => calcScore(b) - calcScore(a));
    renderQueue(sorted);

    updateAlgoTrace(1); // Highlight Step 1
}

function handleRunAllocation() {
    if (vehicles.length === 0 || isAllocating) {
        return;
    }
    
    isAllocating = true;

    const sorted = [...vehicles].sort((a, b) => calcScore(b) - calcScore(a));
    const log = el('decision-log');

    updateAlgoTrace(3); // Sorting step
    renderQueue(sorted);

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
        renderStations();
        updateMetrics();

        // Render Decisions
        let html = '';
        decisions.forEach(d => {
            if (d.type === 'assigned' || d.type === 'assigned-jit') {
                const jitNote = d.type === 'assigned-jit' ? ' <span class="text-neon">⚡ JIT Activated</span>' : '';
                html += `
                    <div class="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-lg mb-2">
                        <div class="text-xs font-bold text-emerald-400 flex items-center gap-1.5"><span class="material-symbols-outlined text-[14px]">check_circle</span> Slot Confirmed: ${STATIONS[d.station].name}${jitNote}</div>
                        <div class="text-[10px] text-emerald-300/70 mt-1">Driver <strong>${d.v.name}</strong> • ${d.score} pts • ${d.v.battery}% SoC</div>
                    </div>`;
            } else if (d.type === 'redirect' || d.type === 'grid-redirect') {
                const reason = d.type === 'grid-redirect' ? `Grid overload at target` : `Target station full`;
                html += `
                    <div class="bg-yellow-500/10 border border-yellow-500/20 p-3 rounded-lg mb-2">
                        <div class="text-xs font-bold text-yellow-500 flex items-center gap-1.5"><span class="material-symbols-outlined text-[14px]">turn_right</span> Redirected: ${STATIONS[d.to].name}</div>
                        <div class="text-[10px] text-yellow-400/70 mt-1">Driver <strong>${d.v.name}</strong> • ${reason}</div>
                    </div>`;
            } else if (d.type === 'passive') {
                html += `
                    <div class="bg-white/[0.02] border border-white/5 p-3 rounded-lg mb-2 opacity-50">
                        <div class="text-xs font-bold text-white/40 flex items-center gap-1.5"><span class="material-symbols-outlined text-[14px]">schedule</span> Passive (Pre-booked)</div>
                        <div class="text-[10px] text-white/25 mt-1">Driver <strong>${d.v.name}</strong> • Slot not yet in buffer window — skipped</div>
                    </div>`;
            } else {
                html += `
                    <div class="bg-white/5 border border-white/10 p-3 rounded-lg mb-2">
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
        renderQueue(sorted, { losers: decisions.filter(d => d.type === 'wait').map(d => d.v.id) });

        // Keep waiting + passive vehicles, remove assigned/redirected
        vehicles = vehicles.filter(v => keepIds.includes(v.id));
        
        // Sync back to local storage
        try {
            let q = JSON.parse(localStorage.getItem('gridpulz_queue') || '[]');
            q = q.filter(item => keepIds.includes(item.id));
            localStorage.setItem('gridpulz_queue', JSON.stringify(q));
        } catch(e) {}

        setTimeout(() => {
            updateAlgoTrace(0);
            isAllocating = false;
        }, 4000);

    }, 800);
}

function handleReset() {
    vehicles = [];
    allocCount = 0;
    arrivalTime = Date.now();

    // Reset defaults
    STATIONS[0].slots = 2; STATIONS[0].gridLoad = 42;
    STATIONS[1].slots = 1; STATIONS[1].gridLoad = 81;
    STATIONS[2].slots = 3; STATIONS[2].gridLoad = 28;

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
document.addEventListener('DOMContentLoaded', () => {
    // Range slider value
    const slider = el('v-bat');
    const out = el('bat-out');
    slider.addEventListener('input', () => {
        out.textContent = slider.value + '%';
        if (slider.value <= 20) {
            out.className = 'font-mono text-red-500 text-sm font-bold shadow-red-500 drop-shadow-md';
        } else if (slider.value <= 40) {
            out.className = 'font-mono text-yellow-500 text-sm font-bold shadow-yellow-500 drop-shadow-md';
        } else {
            out.className = 'font-mono text-neon text-sm font-bold shadow-neon drop-shadow-md';
        }
    });

    // Listeners
    el('add-btn').addEventListener('click', handleAddVehicle);
    el('run-btn').addEventListener('click', handleRunAllocation);
    el('reset-btn').addEventListener('click', handleReset);

    // Initial render
    renderStationsOptions();
    renderStations();
    updateMetrics();

    // Listen to Remote Queue pushes (from Driver Dashboard Mocks)
    window.addEventListener('storage', (e) => {
        if (e.key === 'gridpulz_queue' && e.newValue) {
            try {
                const externalQueue = JSON.parse(e.newValue);
                // Sync removals
                vehicles = vehicles.filter(v => !v.isExternal || externalQueue.find(eq => eq.id === v.id));
                // Sync additions
                externalQueue.forEach(eq => {
                    if (!vehicles.find(v => v.id === eq.id)) {
                        eq.waitMins = Math.round((Date.now() - arrivalTime) / 60000) || 0;
                        eq.isExternal = true;
                        vehicles.push(eq);
                    }
                });
                updateMetrics();
                const sorted = [...vehicles].sort((a, b) => calcScore(b) - calcScore(a));
                renderQueue(sorted);
                updateAlgoTrace(1); // Highlight Step 1: Incoming Arrival
            } catch (err) {}
        }
    });

    // Load initial mock queue on load
    try {
        const initialQueue = JSON.parse(localStorage.getItem('gridpulz_queue') || '[]');
        if (initialQueue.length > 0) {
            initialQueue.forEach(eq => {
                if (!vehicles.find(v => v.id === eq.id)) {
                    eq.waitMins = Math.round((Date.now() - arrivalTime) / 60000) || 0;
                    eq.isExternal = true;
                    vehicles.push(eq);
                }
            });
            updateMetrics();
            const sorted = [...vehicles].sort((a, b) => calcScore(b) - calcScore(a));
            renderQueue(sorted);
        }
    } catch(e) {}
});
