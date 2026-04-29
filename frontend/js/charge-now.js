/**
 * GRIDPULZ CHARGE NOW — Fixed & Upgraded
 */

// ── CONFIG ──────────────────────────────────────────────────────────────────
const CONFIG = {
  GOOGLE_MAPS_API_KEY: 'AIzaSyBTs-RVu3uu9tPG30X9wKeMNxY2dm5lUmI',
  MAX_STATIONS: 6,
  FALLBACK_LAT: 11.0168,
  FALLBACK_LNG: 76.9558,
  GEOLOCATION_TIMEOUT: 3000,
  STATIONS_CACHE_TTL: 10 * 60 * 1000,
  LOCATION_CACHE_TTL: 5 * 60 * 1000,
  GRID_SAFEGUARD_THRESHOLD: 90,
};

// ── GLOBAL ROUTING CONTROL ─────────────────────────────────────────────────
let routingControl = null;

// ── HELPERS ──────────────────────────────────────────────────────────────────
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getLoadBadge(loadPct) {
  if (loadPct == null) return '<span class="load-badge load-low">UNKNOWN</span>';
  if (loadPct < 60)  return `<span class="load-badge load-low">LOW LOAD</span>`;
  if (loadPct < 85)  return `<span class="load-badge load-high">HIGH LOAD</span>`;
  return `<span class="load-badge load-peak">PEAK LOAD</span>`;
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  const colors = { info: '#CCFF00', error: '#FF4444', warn: '#EF9F27', success: '#10b981' };
  toast.style.cssText = `background:#1A1A1A;border:1px solid ${colors[type]||colors.info};border-left:3px solid ${colors[type]||colors.info};border-radius:6px;padding:12px 16px;color:#fff;font-size:12px;font-family:'Michroma',sans-serif;letter-spacing:0.06em;pointer-events:auto;box-shadow:0 4px 16px rgba(0,0,0,0.4);`;
  toast.textContent = msg;
  toast.classList.add('toast-enter');
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.replace('toast-enter', 'toast-exit');
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

// ── ROUTING FUNCTION ─────────────────────────────────────────────────────────
/**
 * Shows route from user location to booked station using Leaflet Routing Machine
 * @param {number} userLat - User's latitude
 * @param {number} userLng - User's longitude
 * @param {number} stationLat - Station's latitude
 * @param {number} stationLng - Station's longitude
 * @param {string} stationName - Name of the booked station
 */
function showRouteToBookedStation(userLat, userLng, stationLat, stationLng, stationName) {
  console.log('🗺️ Showing route to booked station:', stationName);
  console.log('User location:', userLat, userLng);
  console.log('Station location:', stationLat, stationLng);

  // Get the map instance from charge-now app
  const map = window.chargeApp?.mapMgr?.map;
  if (!map) {
    console.error('Map instance not available');
    showToast('Map not available for routing', 'error');
    return;
  }

  // Remove previous route if exists
  if (routingControl) {
    console.log('Removing previous route');
    map.removeControl(routingControl);
    routingControl = null;
  }

  // Remove existing route markers if any
  map.eachLayer((layer) => {
    if (layer instanceof L.Marker && (layer.getPopup()?.getContent() === 'Your Location' || layer.getPopup()?.getContent() === 'Booked Station')) {
      map.removeLayer(layer);
    }
  });

  // Add user location marker
  const userMarker = L.marker([userLat, userLng]).addTo(map);
  userMarker.bindPopup('Your Location');
  console.log('✅ User marker added');

  // Add station marker
  const stationMarker = L.marker([stationLat, stationLng]).addTo(map);
  stationMarker.bindPopup(`Booked Station: ${stationName}`);
  console.log('✅ Station marker added');

  // Create routing control
  try {
    routingControl = L.Routing.control({
      waypoints: [
        L.latLng(userLat, userLng),
        L.latLng(stationLat, stationLng)
      ],
      routeWhileDragging: false,
      showAlternatives: false,
      addWaypoints: false,
      draggableWaypoints: false,
      fitSelectedRoutes: true,
      lineOptions: {
        styles: [{ color: '#CCFF00', weight: 4, opacity: 0.8 }]
      },
      createMarker: function() { return null; }, // Don't create default markers
      router: L.Routing.osrmv1({
        serviceUrl: 'https://router.project-osrm.org/route/v1'
      })
    }).addTo(map);

    console.log('✅ Routing control added to map');

    // Listen for route found
    routingControl.on('routesfound', function(e) {
      const routes = e.routes;
      const summary = routes[0].summary;
      const distance = (summary.totalDistance / 1000).toFixed(2); // Convert to km
      const time = Math.round(summary.totalTime / 60); // Convert to minutes
      
      console.log(`📊 Route found: ${distance} km, ${time} min`);
      showToast(`Route to ${stationName}: ${distance} km, ${time} min`, 'success');
    });

    // Handle routing errors
    routingControl.on('routingerror', function(e) {
      console.error('Routing error:', e);
      showToast('Could not calculate route. Showing direct line.', 'warn');
      
      // Fallback: draw straight line
      const latlngs = [
        [userLat, userLng],
        [stationLat, stationLng]
      ];
      const polyline = L.polyline(latlngs, {
        color: '#CCFF00',
        weight: 4,
        opacity: 0.8,
        dashArray: '10, 10'
      }).addTo(map);
      
      // Fit bounds
      map.fitBounds(polyline.getBounds(), { padding: [50, 50] });
    });

  } catch (error) {
    console.error('Error creating routing control:', error);
    showToast('Routing service unavailable. Showing direct line.', 'warn');
    
    // Fallback: draw straight line
    const latlngs = [
      [userLat, userLng],
      [stationLat, stationLng]
    ];
    const polyline = L.polyline(latlngs, {
      color: '#CCFF00',
      weight: 4,
      opacity: 0.8,
      dashArray: '10, 10'
    }).addTo(map);
    
    // Fit bounds
    map.fitBounds(polyline.getBounds(), { padding: [50, 50] });
  }
}

// ── GEOLOCATION MANAGER ───────────────────────────────────────────────────────
class GeolocationManager {
  async getCurrentLocation(forceRefresh = false) {
    if (!forceRefresh) {
      try {
        const cached = JSON.parse(sessionStorage.getItem('gp_user_location') || 'null');
        if (cached && (Date.now() - cached.timestamp) < CONFIG.LOCATION_CACHE_TTL) {
          this._updateUI(cached);
          return cached;
        }
      } catch (_) {}
    }

    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        console.error('Geolocation not supported by browser');
        showToast('Geolocation not supported by your browser', 'error');
        resolve(this._fallback());
        return;
      }
      const timer = setTimeout(() => resolve(this._fallback()), CONFIG.GEOLOCATION_TIMEOUT);

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timer);
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, source: 'gps', timestamp: Date.now() };
          try { sessionStorage.setItem('gp_user_location', JSON.stringify(loc)); } catch (_) {}
          this._updateUI(loc);
          console.log('GPS location obtained:', loc);
          showToast('GPS location obtained successfully', 'success');
          resolve(loc);
        },
        (error) => {
          clearTimeout(timer);
          console.error('Geolocation error:', error);
          let errorMsg = 'Failed to get GPS location';
          switch(error.code) {
            case error.PERMISSION_DENIED:
              errorMsg = 'GPS permission denied. Please allow location access.';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMsg = 'GPS position unavailable. Please check your device settings.';
              break;
            case error.TIMEOUT:
              errorMsg = 'GPS request timed out. Using default location.';
              break;
          }
          showToast(errorMsg, 'error');
          resolve(this._fallback());
        },
        { enableHighAccuracy: true, timeout: CONFIG.GEOLOCATION_TIMEOUT, maximumAge: 30000 }
      );
    });
  }

  _fallback() {
    const loc = { lat: CONFIG.FALLBACK_LAT, lng: CONFIG.FALLBACK_LNG, source: 'fallback', timestamp: Date.now() };
    try { sessionStorage.setItem('gp_user_location', JSON.stringify(loc)); } catch (_) {}
    this._updateUI(loc);
    return loc;
  }

  _updateUI(loc) {
    const statusEl = document.getElementById('gps-status-line');
    const inputEl  = document.getElementById('gps-coords-input');
    const locText  = document.getElementById('location-text');
    const indicator = document.getElementById('location-indicator');

    const coordStr = `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`;
    if (inputEl) inputEl.value = coordStr;

    if (loc.source === 'gps') {
      if (statusEl)   statusEl.textContent = '✅ Using GPS location';
      if (locText)    locText.textContent  = `📍 ${coordStr}`;
      if (indicator)  indicator.classList.add('active');
    } else {
      if (statusEl)   statusEl.textContent = '⚠️ Using default location (Coimbatore)';
      if (locText)    locText.textContent  = `📍 Default: ${coordStr}`;
    }
  }
}

// ── STATION MANAGER ───────────────────────────────────────────────────────────
class StationManager {
  constructor() {
    this._client = window.supabaseClient;
  }

  async fetchStations() {
    try {
      const cached = JSON.parse(sessionStorage.getItem('gp_stations') || 'null');
      if (cached && (Date.now() - cached.timestamp) < CONFIG.STATIONS_CACHE_TTL) {
        console.log('📦 Using cached stations');
        return cached.stations;
      }
    } catch (_) {}

    try {
      if (!this._client) throw new Error('Supabase client not available');

      // Fetch stations (no status filter — schema has no status column)
      const { data: stations, error: sErr } = await this._client
        .from('stations')
        .select('*')
        .limit(60);
      if (sErr) throw sErr;

      // Fetch snapshots
      const { data: snaps } = await this._client
        .from('station_snapshots')
        .select('*');

      const snapMap = {};
      (snaps || []).forEach(s => { snapMap[s.station_id] = s; });

      // Merge snapshot data
      const merged = (stations || [])
        .filter(st => st.latitude && st.longitude && st.name)
        .map(st => ({
          ...st,
          load_pct:   snapMap[st.id]?.load_pct   ?? st.avg_usage ?? null,
          free_slots: snapMap[st.id]?.free_slots  ?? null,
          total_load_kw: snapMap[st.id]?.total_load_kw ?? null,
        }));

      try { sessionStorage.setItem('gp_stations', JSON.stringify({ stations: merged, timestamp: Date.now() })); } catch (_) {}
      console.log(`✅ Fetched ${merged.length} stations`);
      return merged;
    } catch (err) {
      console.error('Station fetch error:', err);
      showToast('Unable to load stations, retrying…', 'error');
      return [];
    }
  }

  subscribeToSnapshots(onUpdate) {
    if (!this._client) return;
    this._client
      .channel('station-snapshots-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'station_snapshots' }, onUpdate)
      .subscribe();
  }
}

// ── MAP MANAGER ───────────────────────────────────────────────────────────────
class MapManager {
  constructor() {
    this.map = null;
    this.markers = [];
    this.userMarker = null;
    this.routePolyline = null;
    this._init();
  }

  _init() {
    const el = document.getElementById('live-map');
    if (!el) {
      console.error('Map container element not found');
      return;
    }

    // Check if Leaflet is loaded
    if (typeof L === 'undefined') {
      console.error('Leaflet not loaded');
      return;
    }

    this._initializeMap(el);
  }

  _initializeMap(el) {
    try {
      console.log('Initializing Leaflet map on element:', el);
      this.map = L.map(el).setView([CONFIG.FALLBACK_LAT, CONFIG.FALLBACK_LNG], 13);
      
      // Add dark-themed OpenStreetMap tiles
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(this.map);
      
      console.log('✅ Map initialized at Coimbatore zoom:13');
    } catch (error) {
      console.error('Error initializing map:', error);
    }
  }

  centerOn(loc) {
    if (!this.map) return;
    this.map.setView([loc.lat, loc.lng], 13);

    if (this.userMarker) this.map.removeLayer(this.userMarker);

    // Lime-green pulsing user marker
    const userIcon = L.divIcon({
      className: 'custom-div-icon',
      html: `<div style="background-color: #CCFF00; width: 18px; height: 18px; border-radius: 50%; border: 2px solid #0A0A0F; box-shadow: 0 0 8px rgba(204, 255, 0, 0.5);"></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });
    this.userMarker = L.marker([loc.lat, loc.lng], { icon: userIcon }).addTo(this.map);
  }

  addMarker(station, onClick) {
    if (!this.map || !station.latitude || !station.longitude) return;

    const freeSlots = station.free_slots ?? '—';
    const totalSlots = station.num_plugs ?? '—';
    const loadPct = station.load_pct != null ? Math.round(station.load_pct) : null;
    const distKm = station.distance != null ? `${station.distance.toFixed(2)} km` : 'Calculating…';

    const loadClass = (loadPct == null) ? 'load-low' : (loadPct < 60 ? 'load-low' : (loadPct < 85 ? 'load-high' : 'load-peak'));
    const loadLabel = (loadPct == null) ? 'UNKNOWN' : (loadPct < 60 ? 'LOW LOAD' : (loadPct < 85 ? 'HIGH LOAD' : 'PEAK LOAD'));

    const popupContent = `
      <div style="background:#1A1A1A;border:1px solid #2a2a2a;border-radius:8px;padding:14px;min-width:200px;font-family:'Michroma',sans-serif;">
        <div style="font-size:12px;font-weight:700;color:#fff;margin-bottom:8px;">${station.name}</div>
        <span class="load-badge ${loadClass}" style="margin-bottom:8px;display:inline-block;">${loadLabel}</span>
        <div style="font-size:10px;color:#888;margin-top:6px;">Load: <span style="color:#fff">${loadPct != null ? loadPct + '%' : '—'}</span></div>
        <div style="font-size:10px;color:#888;margin-top:4px;">Slots: <span style="color:#CCFF00;font-weight:700;">${freeSlots} / ${totalSlots} free</span></div>
        <div style="font-size:10px;color:#888;margin-top:4px;">Charger: <span style="color:#fff">${station.charging_type || '—'}</span></div>
        <div style="font-size:10px;color:#888;margin-top:4px;">Distance: <span style="color:#CCFF00;font-weight:700;">${distKm}</span></div>
      </div>`;

    const marker = L.marker([station.latitude, station.longitude], { icon: this._stationIcon(station) }).addTo(this.map);
    
    // Add tooltip on hover (shows name and location)
    const tooltipContent = `<div style="color:#fff; font-family:Michroma; font-size:11px; font-weight:bold;">${station.name}</div><div style="color:#aaa; font-size:9px;">${station.latitude?.toFixed(4)}, ${station.longitude?.toFixed(4)}</div>`;
    marker.bindTooltip(tooltipContent, {
      direction: 'top',
      offset: [0, -20],
      className: 'custom-tooltip'
    });
    
    marker.bindPopup(popupContent);

    marker.on('click', () => {
      marker.openPopup();
      if (onClick) onClick(station);
    });

    this.markers.push({ marker });
  }

  _stationIcon(station) {
    const svg = `<svg width="36" height="42" viewBox="0 0 36 42" xmlns="http://www.w3.org/2000/svg">
      <circle cx="18" cy="18" r="16" fill="#1D9E75" stroke="#0A0A0F" stroke-width="2"/>
      <text x="18" y="23" text-anchor="middle" font-size="16" fill="#fff">⚡</text>
    </svg>`;
    return L.divIcon({
      className: 'custom-div-icon',
      html: svg,
      iconSize: [36, 42],
      iconAnchor: [18, 42]
    });
  }

  clearMarkers() {
    this.markers.forEach(({ marker }) => { this.map.removeLayer(marker); });
    this.markers = [];
  }

  drawRoute(polylinePath) {
    if (this.routePolyline) { this.map.removeLayer(this.routePolyline); this.routePolyline = null; }
    if (!this.map || !polylinePath) return;
    
    // Decode polyline (simplified - for full implementation, use a polyline decoder library)
    // For now, just show a simple line if coordinates are provided
    const coords = polylinePath.split(',').map(Number);
    if (coords.length >= 4) {
      const latlngs = [];
      for (let i = 0; i < coords.length - 1; i += 2) {
        latlngs.push([coords[i+1], coords[i]]);
      }
      this.routePolyline = L.polyline(latlngs, {
        color: '#CCFF00',
        opacity: 0.85,
        weight: 4
      }).addTo(this.map);
    }
  }

  fitBoundsToStations(stations, userLoc) {
    if (!this.map) return;
    const bounds = L.latLngBounds();
    if (userLoc) bounds.extend([userLoc.lat, userLoc.lng]);
    stations.forEach(s => s.latitude && bounds.extend([s.latitude, s.longitude]));
    if (bounds.isValid()) this.map.fitBounds(bounds, { padding: [60, 60] });
  }
}

// ── ROUTE MANAGER ─────────────────────────────────────────────────────────────
class RouteManager {
  constructor(mapManager) {
    this.mapMgr = mapManager;
  }

  async getRoute(origin, dest) {
    const straightKm = haversineDistance(origin.lat, origin.lng, dest.lat, dest.lng);
    const estMin = Math.round((straightKm / 30) * 60);

    // Return estimated route (Leaflet doesn't have built-in routing, would need external service)
    return { distance: `${straightKm.toFixed(2)} km (est.)`, duration: `~${estMin} min (est.)`, polyline: null };
  }
}

// ── UI MANAGER ────────────────────────────────────────────────────────────────
class UIManager {
  displayStations(stations) {
    const container = document.getElementById('stations-list');
    const countBadge = document.getElementById('stations-count');
    if (!container) return;
    if (countBadge) countBadge.textContent = stations.length;

    if (!stations.length) {
      container.innerHTML = '<div class="no-stations"><p>No stations found near your location</p></div>';
      return;
    }

    container.innerHTML = stations.map((st, i) => {
      const dist = st.distance != null ? `${st.distance.toFixed(2)} km` : 'Calculating…';
      const freeSlots = st.free_slots ?? '—';
      const total = st.num_plugs ?? '—';
      const loadPct = st.load_pct != null ? Math.round(st.load_pct) : null;
      const loadBadge = getLoadBadge(loadPct);
      return `
        <div class="station-card ${i === 0 ? 'best-station' : ''}" data-station-id="${st.id}" style="cursor:pointer">
          <div class="station-name">
            <span>${st.name}</span>
            <span class="distance-badge">${dist}</span>
          </div>
          <div style="margin:6px 0">${loadBadge}</div>
          <div class="station-details">
            <div class="detail-item"><div class="icon">⚡</div><span>${freeSlots}/${total} free</span></div>
            <div class="detail-item"><div class="icon">🔌</div><span>${st.charging_type || '—'}</span></div>
          </div>
          <div class="station-address">${st.address || 'Address unavailable'}</div>
          <div class="station-actions">
            <button class="btn-route" data-station-id="${st.id}">Select & Route</button>
          </div>
        </div>`;
    }).join('');

    container.querySelectorAll('.btn-route').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.stationId;
        const station = stations.find(s => String(s.id) === String(id));
        if (station) window.chargeApp?.selectStation(station);
      });
    });
  }

  showSelectedStation(station, route) {
    const card = document.getElementById('selected-station-card');
    const nameEl = document.getElementById('selected-station-name');
    const infoEl = document.getElementById('selected-station-info');
    const reqBtn = document.getElementById('request-slot-btn');

    if (card) card.style.display = 'block';
    if (nameEl) nameEl.textContent = station.name;
    if (infoEl) infoEl.textContent = `${route.distance}  •  ${route.duration}`;
    if (reqBtn) reqBtn.disabled = false;
  }

  triggerGridSafeguard(original, alternative) {
    const bar = document.getElementById('grid-safeguard-bar');
    const msg = document.getElementById('safeguard-bar-msg');
    const roCard = document.getElementById('route-optimized-card');

    const origLoad = original.load_pct != null ? Math.round(original.load_pct) : '—';
    const altLoad  = alternative?.load_pct != null ? Math.round(alternative.load_pct) : '—';
    const altDist  = alternative?.distance != null ? `${alternative.distance.toFixed(2)} km` : '—';

    if (bar) bar.classList.remove('hidden');
    if (msg && alternative) {
      msg.textContent = `${original.name} is at ${origLoad}% load (Peak). Route optimized to ${alternative.name} (${altDist}, ${altLoad}% load).`;
    }

    if (roCard) {
      roCard.classList.remove('hidden');
      const el = (id) => document.getElementById(id);
      if (el('ro-original-name')) el('ro-original-name').textContent = original.name;
      if (el('ro-original-info')) el('ro-original-info').textContent = `${origLoad}%  •  ${original.distance?.toFixed(2) ?? '—'} km`;
      if (alternative) {
        if (el('ro-optimized-name')) el('ro-optimized-name').textContent = alternative.name;
        if (el('ro-optimized-info')) el('ro-optimized-info').textContent = `${altLoad}%  •  ${altDist}`;
      }
    }

    showToast(`Grid Safeguard: Rerouted from ${original.name} to ${alternative?.name ?? 'alternative'}`, 'warn');
  }

  showBookingModal(station) {
    // Remove any existing modal
    document.getElementById('prebook-modal-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'prebook-modal-overlay';
    overlay.className = 'prebook-modal-overlay';
    overlay.innerHTML = `
      <div class="prebook-modal-box">
        <h3>CONFIRM BOOKING</h3>
        <p>Reserve a charging slot at<br><strong style="color:#CCFF00">${station.name}</strong></p>
        <div class="prebook-modal-actions">
          <button class="prebook-cancel-btn" id="prebook-cancel">CANCEL</button>
          <button class="prebook-confirm-btn" id="prebook-confirm">CONFIRM</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('#prebook-cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#prebook-confirm').addEventListener('click', async () => {
      await window.chargeApp?.confirmBooking(station);
      overlay.remove();
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  }

  showLoading(show) {
    const el = document.getElementById('map-loading');
    if (el) el.style.display = show ? 'flex' : 'none';
  }
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
class ChargeNowApp {
  constructor() {
    this.geo     = new GeolocationManager();
    this.stMgr   = new StationManager();
    this.mapMgr  = new MapManager();
    this.ui      = new UIManager();
    this.route   = new RouteManager(this.mapMgr);
    this.userLoc = null;
    this.stations = [];
    this.selectedStation = null;
    this._refreshTimer = null;
  }

  async init() {
    console.log('🚀 ChargeNowApp init');
    this.ui.showLoading(true);

    // Get user location
    this.userLoc = await this.geo.getCurrentLocation();
    if (this.userLoc) this.mapMgr.centerOn(this.userLoc);

    // Fetch & display stations
    await this._loadStations();

    // Real-time subscription
    this.stMgr.subscribeToSnapshots(() => {
      sessionStorage.removeItem('gp_stations');
      this._loadStations();
    });

    // Auto-refresh every 30s
    this._refreshTimer = setInterval(() => {
      sessionStorage.removeItem('gp_stations');
      this._loadStations();
    }, 30000);

    this._setupEventListeners();
    this.ui.showLoading(false);
    console.log('✅ App ready');
  }

  async _loadStations() {
    const all = await this.stMgr.fetchStations();

    if (!all.length) { this.ui.displayStations([]); return; }

    // Calculate distances
    if (this.userLoc) {
      all.forEach(s => {
        if (s.latitude && s.longitude)
          s.distance = haversineDistance(this.userLoc.lat, this.userLoc.lng, s.latitude, s.longitude);
      });
      all.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    }

    this.stations = all.slice(0, CONFIG.MAX_STATIONS);
    this.ui.displayStations(this.stations);

    // Add map markers
    this.mapMgr.clearMarkers();
    this.stations.forEach(s => this.mapMgr.addMarker(s, (st) => this.selectStation(st)));

    // Fit map
    this.mapMgr.fitBoundsToStations(this.stations, this.userLoc);
  }

  async selectStation(station) {
    this.selectedStation = station;
    console.log('📌 Selected:', station.name);

    // Check Grid Safeguard
    const loadPct = station.load_pct ?? 0;
    if (loadPct > CONFIG.GRID_SAFEGUARD_THRESHOLD) {
      const alternative = this.stations.find(s => s.id !== station.id && (s.load_pct ?? 100) < loadPct);
      this.ui.triggerGridSafeguard(station, alternative || null);
      if (alternative) {
        this.selectedStation = alternative;
        station = alternative;
      }
    }

    // Get route
    if (this.userLoc) {
      const routeInfo = await this.route.getRoute(
        { lat: this.userLoc.lat, lng: this.userLoc.lng },
        { lat: station.latitude, lng: station.longitude }
      );
      this.ui.showSelectedStation(station, routeInfo);
    }
  }

  async confirmBooking(station) {
    try {
      const client = window.supabaseClient;
      if (!client) throw new Error('No Supabase client');

      const { data: { user } } = await client.auth.getUser();
      const userId = user?.id || null;

      await client.from('charging_sessions').insert({
        user_id: userId,
        station_id: station.id,
        plug_number: 1,
        started_at: new Date().toISOString(),
        status: 'active',
      });

      console.log('✅ Booking confirmed for station:', station.name);

      // Get user location if not available
      if (!this.userLoc) {
        console.log('Getting user location for routing...');
        this.userLoc = await this.geo.getCurrentLocation(true);
      }

      // Show route to booked station
      if (this.userLoc && (station.latitude || station.lat) && (station.longitude || station.lng)) {
        const stationLat = station.latitude || station.lat;
        const stationLng = station.longitude || station.lng;
        
        console.log('🗺️ Calling showRouteToBookedStation');
        showRouteToBookedStation(
          this.userLoc.lat,
          this.userLoc.lng,
          stationLat,
          stationLng,
          station.name
        );
        
        showToast(`Slot booked successfully. Showing route to ${station.name}.`, 'success');
      } else {
        console.warn('Cannot show route - missing location data');
        showToast(`✅ Slot confirmed at ${station.name}`, 'info');
      }
    } catch (err) {
      console.error('Booking error:', err);
      showToast('Booking failed — please try again', 'error');
    }
  }

  _setupEventListeners() {
    // GPS buttons (both old + new)
    ['gps-btn', 'gps-btn-icon'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', async () => {
        this.userLoc = await this.geo.getCurrentLocation(true);
        if (this.userLoc) {
          this.mapMgr.centerOn(this.userLoc);
          sessionStorage.removeItem('gp_stations');
          await this._loadStations();
        }
      });
    });

    // REQUEST CHARGING SLOT
    document.getElementById('request-slot-btn')?.addEventListener('click', () => {
      console.log('Request slot button clicked, selectedStation:', this.selectedStation);
      if (!this.selectedStation) { showToast('Please select a station first', 'warn'); return; }
      this.ui.showBookingModal(this.selectedStation);
    });
  }

  destroy() {
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    this.mapMgr.clearMarkers();
  }
}

// ── BOOT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  console.log('⚡ Charge Now page loaded, initializing...');
  
  // Wait for Supabase (up to 2s)
  let tries = 0;
  while (!window.supabaseClient && tries < 20) {
    await new Promise(r => setTimeout(r, 100));
    tries++;
  }
  
  console.log('Supabase client available:', !!window.supabaseClient);
  console.log('Leaflet available:', typeof L !== 'undefined');

  window.chargeApp = new ChargeNowApp();
  await window.chargeApp.init();
  console.log('✅ Charge Now app initialized');
});

window.addEventListener('beforeunload', () => window.chargeApp?.destroy());
