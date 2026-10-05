# GridPulz: Simulated vs Real Data Map

## Overview
This document maps all simulated data in the GridPulz application and identifies where real IoT/production data will replace simulations.

---

## FRONTEND SIMULATIONS (JavaScript)

### 1. Queue & Booking System
**File:** `frontend/js/dashboard.js`

| Data | Simulated | How | Location | Real Data Source |
|------|-----------|-----|----------|------------------|
| Queue Entry IDs | ✅ | `Date.now() + Math.random()` | Line 130 | Supabase booking_id |
| Vehicle Names | ✅ | `"Driver-" + random(1000)` | Line 127 | User profile vehicle_name |
| Wait Times | ✅ | 0 initially, calculated later | Line 137 | Arrival timestamp tracking |
| Booking IDs | ✅ | `"BK-" + random(90000-99999)` | Line 262 | Backend database |
| User ID | ✅ | `'demo'` fallback | Line 132 | Supabase auth user.id |

**Used by:**
- `simulateQueuePush()` — adds vehicles to priority queue
- Operator dashboard — displays live queue
- Real-time sync across tabs via localStorage

---

### 2. Grid Load & Risk Assessment
**File:** `frontend/js/dashboard.js`

| Data | Simulated | How | Location | Real Data Source |
|------|-----------|-----|----------|------------------|
| Grid Load % | ✅ | `random(0-100)` if missing | Line 155 | Supabase `stations.grid_load` |
| Risk Level | ✅ | Threshold-based (HIGH >75%, MODERATE >50%) | Line 160-162 | IoT grid sensors |
| Station Overload Alert | ✅ | Triggers at random HIGH risk | Line 197+ | Real-time SCADA/grid monitoring |

**Used by:**
- `assessStationRisk()` — calculates station health
- `findBestAlternative()` — reroutes to safer stations
- Dashboard UI color coding (red/orange/green)

---

### 3. Live Grid Fluctuations
**File:** `frontend/js/scheduler.js`

| Data | Simulated | How | Location | Real Data Source |
|------|-----------|-----|----------|------------------|
| Grid Load Change | ✅ | Random walk: ±4% per tick | Line 592 | Real-time grid API |
| Update Frequency | ✅ | Every 2000ms | Line 585 | IoT sensor polling rate |
| Historical Load | ✅ | Random drift 0-100% | Line 600+ | Time-series DB (InfluxDB/Prometheus) |

**Used by:**
- Operator dashboard grid load graphs
- Station status cards (real-time pulse effect)
- Alert triggers for high load

---

### 4. Station Data
**File:** `frontend/js/dashboard.js` (hardcoded arrays)

| Data | Type | Example | Real Data Source |
|------|------|---------|------------------|
| Station Locations | Real | Lat/Long coordinates | Supabase `stations` table |
| Station Names | Real | "North Plaza", "Downtown Hub" | Supabase `stations.name` |
| Capacity (kW) | Real | 50, 100, 150 | Supabase `stations.total_capacity_kw` |
| Number of Plugs | Real | 4, 8, 12 | Supabase `stations.num_plugs` |
| Voltage/Current | Real | 400V, 32A | Supabase `stations.voltage`, `max_current` |
| **Grid Load** | ❌ Simulated | 0-100% | IoT edge device/API endpoint |
| **Connector Types** | Real | "CCS", "CHAdeMO" | Supabase `stations.connector_type` |

---

## BACKEND SIMULATIONS (Python/FastAPI)

### 1. Sensor Data Simulation
**File:** `backend/main.py` — `simulate_sensor_data()`

```python
def simulate_sensor_data(capacity: float, active_sessions: int) -> tuple["Any", float]:
```

| Data | Simulated | Formula | Lines | Real Data Source |
|------|-----------|---------|-------|------------------|
| Current Power Draw | ✅ | `sessions × random(10-30) ± jitter` | 221-223 | IoT smart meter at station |
| Hour of Day | Real | `datetime.now().hour` | 218 | System time |
| Day of Week | Real | `datetime.now().weekday()` | 219 | System time |
| Historical Loads | ✅ | 7 days random drift | 226-228 | InfluxDB/time-series DB |
| Feature Vector | ✅ | For ML model input | 232-244 | Real feature engineering |

**Used by:**
- ML load prediction (if model loaded)
- Station status API response
- Grid capacity planning

---

### 2. Load Prediction (Fallback)
**File:** `backend/main.py` — `estimate_without_model()`

| Data | Simulated | How | Lines | Real Data Source |
|------|-----------|-----|-------|------------------|
| Predicted Load | ✅ | `current + random(2-8) + session_factor` | 257-259 | ML Model (`ev_model.pkl`) |

**Used by:**
- `/api/station-status/{email}` — when ML model unavailable
- Emergency rerouting decisions
- Capacity warning alerts

---

### 3. Active Sessions
**File:** `backend/main.py`

| Data | Simulated | How | Lines | Real Data Source |
|------|-----------|-----|-------|------------------|
| Active Charging Sessions | ✅ | `random(0, num_plugs)` | 298 | IoT plug status sensors |

**Used by:**
- Power draw calculation
- Availability checking
- Queue prioritization

---

## HARDCODED TEST DATA

### Frontend Operator Dashboard
**File:** `frontend/operator-dashboard.html` (within `<script>`)

```javascript
const OP_STATIONS = [
    { name: "North Plaza", maxSlots: 8, gridLoad: 0 },
    { name: "Downtown Hub", maxSlots: 12, gridLoad: 0 },
    { name: "East Terminal", maxSlots: 6, gridLoad: 0 },
    // ... more stations
];

const OP_BUFFER_WINDOW_MINS = 15;  // Pre-booking activation window
```

**Used by:**
- Operator priority queue scoring
- Station slot allocation
- Booking activation logic

---

## REAL DATA SOURCES (Production-Ready)

### Supabase Tables
- `users` — User profiles, vehicle info
- `stations` — Station metadata (location, capacity, connectors)
- `bookings` — Booking history & reservations
- `auth` — Authentication & session management

### What's Missing (To Be Integrated)
1. **Real-time Grid Load Data**
   - Source: Smart meter API or SCADA system
   - Endpoint: `/api/grid-status` or WebSocket
   - Format: Grid frequency, voltage, active power (MW)

2. **IoT Plug Status**
   - Source: ESP32 devices at each station
   - Protocol: MQTT or HTTP POST
   - Data: Plug availability, power output per plug

3. **ML Load Prediction Model**
   - File: `backend/ev_model.pkl` (currently fallback-only)
   - Input: `simulate_sensor_data()` output
   - Output: 1-hour ahead predicted load (kW)

4. **Time-Series Database**
   - Store: Historical grid loads, power consumption
   - Query: 7-day lookback for features
   - Tool: InfluxDB, Prometheus, or TimescaleDB

---

## SIMULATION FLOW DIAGRAM

```
User Interaction
  ↓
Frontend: simulateQueuePush() — Create queue entry
  ↓ (localStorage)
Operator Dashboard: renderOperatorPriorityQueue() — Display queue
  ↓
Backend: /api/station-status/{email}
  ├─ Supabase: Get real station data
  └─ simulate_sensor_data(): Generate features + current load
      ↓
      ML Model (if available): Predict 1-hr load
      └─ fallback: estimate_without_model()
  ↓
Frontend: assessStationRisk() — Check risk level
  ├─ HIGH risk (>75%)? → findBestAlternative()
  └─ LOW risk? → Assign to queue
  ↓
User: Heads to station for charging
```

---

## PRODUCTION CHECKLIST

- [ ] Replace `random()` grid load with real IoT data API
- [ ] Replace `estimate_without_model()` with trained ML model
- [ ] Set up real-time MQTT/WebSocket from ESP32 devices
- [ ] Configure Supabase RLS policies for production
- [ ] Add time-series DB for historical load tracking
- [ ] Integrate SCADA/grid frequency monitoring
- [ ] Replace hardcoded station data with DB queries
- [ ] Remove `Math.random()` from queue entry IDs (use UUIDs)
- [ ] Replace `'demo'` user fallback with auth requirement
- [ ] Load test with 100+ concurrent bookings
- [ ] Set up error handling for missing IoT data

---

## Summary

**Simulated Components:** 55% (mostly grid metrics and ML fallbacks)
**Real Components:** 45% (auth, stations, bookings, user data)

**High Priority for Production:**
1. Real grid load API integration
2. IoT sensor data ingestion
3. ML model training & deployment
4. Time-series database setup
