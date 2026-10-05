# EV Charging Station System - Setup Guide

Complete setup instructions for the smart EV charging monitoring system.

---

## Part 1: SQL Migrations (Supabase PostgreSQL)

Execute these migrations **in order** in your Supabase SQL editor:

### Step 1: Run Migrations

1. **Log in to Supabase Console** → Your Project → SQL Editor

2. **Create new query** and paste each migration file content:

   - `001_create_plug_status.sql` - Real-time plug status tracking
   - `002_create_readings.sql` - Time-series readings archive
   - `003_create_station_snapshots.sql` - Fast lookup snapshots
   - `004_create_charging_sessions.sql` - User session history
   - `005_add_user_profiles_fk.sql` - Link to auth.users
   - `006_enable_realtime.sql` - Enable Realtime subscriptions

3. **Verify each migration** by checking the Tables in Supabase Console

### Step 2: Verify RLS Policies

In Supabase Console → Authentication → Policies, verify:
- ✓ `plug_status`: authenticated SELECT, service_role ALL
- ✓ `readings`: authenticated SELECT, service_role INSERT
- ✓ `station_snapshots`: authenticated SELECT, service_role ALL
- ✓ `charging_sessions`: users SELECT/INSERT/UPDATE own rows

### Step 3: Enable Realtime

In Supabase Console → Database → Replication:
- ✓ Enable for `plug_status`
- ✓ Enable for `station_snapshots`

---

## Part 2: Backend Setup (FastAPI)

### Step 1: Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### Step 2: Configure Environment Variables

Create `.env` file in project root:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# FastAPI
HOST=0.0.0.0
PORT=8000

# Security
API_SECRET_KEY=your-secret-key-for-esp32
SUPABASE_JWT_SECRET=your-jwt-secret

# Logging
LOG_LEVEL=INFO
```

**How to find these values:**
- `SUPABASE_URL`: Supabase Console → Settings → General → API URL
- `SUPABASE_SERVICE_KEY`: Supabase Console → Settings → API → Service Role Secret
- `SUPABASE_JWT_SECRET`: Supabase Console → Settings → API → JWT Secret

### Step 3: Run FastAPI Server

```bash
# From backend/ directory
python main.py

# Or with uvicorn directly
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Verify it's running:**
- Visit http://localhost:8000/health
- Visit http://localhost:8000/api/docs (interactive API documentation)

### Step 4: Test Endpoints

**POST /api/station-data** (from ESP32):
```bash
curl -X POST http://localhost:8000/api/station-data \
  -H "Authorization: Bearer your-secret-key-for-esp32" \
  -H "Content-Type: application/json" \
  -d '{
    "station_id": 1,
    "timestamp": "2024-04-25T10:30:00Z",
    "plugs": [
      {"plug_number": 1, "current_a": 32.5, "voltage_v": 400, "power_w": 22000, "status": "charging"}
    ],
    "total_load_kw": 22.0,
    "free_slots": 2
  }'
```

**GET /api/best-stations** (from frontend):
```bash
curl -X GET 'http://localhost:8000/api/best-stations?user_lat=40.7128&user_lon=-74.0060' \
  -H "Authorization: Bearer YOUR-JWT-TOKEN"
```

---

## Part 3: ESP32 Firmware Setup

### Step 1: Arduino IDE Configuration

1. Install **Arduino IDE 2.x** or **VS Code + PlatformIO**
2. Add ESP32 board support:
   - Tools → Board Manager → Search "esp32" → Install "esp32" by Espressif

### Step 2: Install Required Libraries

In Arduino IDE → Library Manager, search and install:
- `WiFi` (built-in)
- `HTTPClient` (built-in)
- `ArduinoJson` by Benoit Blanchon
- `Time` (built-in)

### Step 3: Update Firmware Configuration

Edit `firmware/send_data.cpp`:

```cpp
#define BACKEND_URL "http://your-api.com/api/station-data"
#define API_KEY "your-secret-key-for-esp32"
#define STATION_ID 1

const char* SSID = "your-wifi-ssid";
const char* PASSWORD = "your-wifi-password";
```

### Step 4: Upload to ESP32

1. Copy `firmware/send_data.cpp` content into Arduino IDE
2. Select Board: **ESP32 Dev Module**
3. Select Port: **COM3** (or your ESP32 port)
4. Click **Upload**
5. Open **Serial Monitor** (115200 baud) to verify

**Expected output:**
```
🔧 EV Charging Station Firmware v1.0
[WiFi] Connecting to: your-wifi-ssid
✓ WiFi connected! IP: 192.168.1.100
[Data] Payload: {...}
✓ Data sent successfully (HTTP 200)
```

---

## Part 4: Frontend React Integration

### Step 1: Install Dependencies

```bash
npm install @supabase/supabase-js
# or
yarn add @supabase/supabase-js
```

### Step 2: Add Hooks to Your Frontend

Copy these files to your React project:
- `frontend/hooks/useStationSnapshots.ts`
- `frontend/hooks/useBestStations.ts`

### Step 3: Use in Components

#### Real-time Station Snapshots

```typescript
import { useStationSnapshots } from '@/hooks/useStationSnapshots';

export function StationMonitor() {
    const { stations, isLoading, error } = useStationSnapshots(
        process.env.REACT_APP_SUPABASE_URL!,
        process.env.REACT_APP_SUPABASE_ANON_KEY!
    );

    if (isLoading) return <div>Loading stations...</div>;
    if (error) return <div>Error: {error.message}</div>;

    return (
        <div>
            {stations.map((station) => (
                <div key={station.station_id}>
                    <h3>Station {station.station_id}</h3>
                    <p>Load: {station.load_pct}%</p>
                    <p>Free Slots: {station.free_slots}</p>
                </div>
            ))}
        </div>
    );
}
```

#### Find Best Stations

```typescript
import { useBestStations } from '@/hooks/useBestStations';

export function BestStationsView() {
    const { bestStations, isLoading, error, refetch } = useBestStations(
        process.env.REACT_APP_API_URL!,
        process.env.REACT_APP_SUPABASE_URL!,
        process.env.REACT_APP_SUPABASE_ANON_KEY!,
        40.7128,  // user latitude
        -74.0060  // user longitude
    );

    if (isLoading) return <div>Finding best stations...</div>;
    if (error) return <div>Error: {error.message}</div>;

    return (
        <div>
            <h2>Top 3 Stations Near You</h2>
            {bestStations.map((station) => (
                <div key={station.station_id}>
                    <h3>{station.name}</h3>
                    <p>Distance: {station.distance_km} km</p>
                    <p>Score: {(station.score! * 100).toFixed(1)}%</p>
                    <p>Free Slots: {station.free_slots}</p>
                </div>
            ))}
            <button onClick={() => refetch()}>Refresh</button>
        </div>
    );
}
```

### Step 4: Configure Environment Variables

Create `.env.local`:

```env
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key
REACT_APP_API_URL=http://localhost:8000/api
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                   SUPABASE (PostgreSQL)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  plug_status │  │   readings   │  │station_snap- │   │
│  │ (Real-time)  │  │(Time-series) │  │ shots (R-T)  │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────┘
          ↑                                    ↑
          │                                    │
    [API_SECRET_KEY]                   [JWT Token]
          │                                    │
┌─────────┴──────────┐          ┌─────────────┴────────────┐
│  ESP32 @ Station   │          │   React Frontend         │
│  (send_data.cpp)   │          │  (useStationSnapshots)   │
└────────────────────┘          │  (useBestStations)       │
     ↓                           └──────────────────────────┘
     │                                    ↓
     └────────────┬──────────────────────┘
                  │
         ┌────────▼────────┐
         │  FastAPI Backend │
         │   (main.py)      │
         │  /station-data   │
         │  /best-stations  │
         └──────────────────┘
```

---

## Troubleshooting

### "Missing SUPABASE_URL or SUPABASE_SERVICE_KEY"
**Solution:** Check .env file exists in project root and has correct values

### ESP32 can't connect to WiFi
**Solution:** 
- Check SSID and password in firmware code
- Ensure ESP32 is 2.4GHz band (5GHz not supported)
- Verify WiFi is open or WPA2

### "JWT token is invalid"
**Solution:**
- Get fresh token by re-logging in
- Verify SUPABASE_JWT_SECRET is correct in .env
- Check token hasn't expired (usually valid for 1 hour)

### Station data not appearing in database
**Solution:**
- Verify API_SECRET_KEY matches in .env and firmware
- Check backend logs: `curl http://localhost:8000/health`
- Inspect Supabase DB for plug_status/readings tables

### Real-time updates not working
**Solution:**
- Verify Realtime is enabled on plug_status and station_snapshots
- Check RLS policies allow authenticated SELECT
- Use Supabase Studio → Realtime Inspector to debug

---

## Next Steps

1. **Set up ML model** for station scoring
   - Train on historical data
   - Export as `models/station_scorer.pkl`
   - Update `ml_scorer.py` to use `joblib.load()`

2. **Add monitoring dashboard**
   - Real-time station heatmap
   - Historical load analytics
   - Peak hour predictions

3. **Implement charging session tracking**
   - User check-in at station
   - Energy consumption logging
   - Cost calculation

4. **Scale to production**
   - Deploy backend to Cloud Run / AWS Lambda
   - Use Supabase Edge Functions for serverless
   - Enable geo-replication for low latency

---

## Support & Documentation

- **Supabase Docs**: https://supabase.com/docs
- **FastAPI Docs**: https://fastapi.tiangolo.com/
- **ESP32 Arduino**: https://docs.espressif.com/projects/arduino-esp32/
- **React Hooks**: https://react.dev/reference/react/hooks
