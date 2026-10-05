# Quick Reference Guide

Essential commands and code snippets for GridPulz EV Charging System.

---

## 🎯 Quick Start Commands

### Backend
```bash
cd backend
pip install -r requirements.txt
echo 'SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-key
API_SECRET_KEY=your-secret
SUPABASE_JWT_SECRET=your-jwt-secret' > .env
python main.py
```

### ESP32
```bash
# 1. Update firmware/send_data.cpp with your WiFi credentials
# 2. Open in Arduino IDE
# 3. Select ESP32 Dev Module → COM port → Upload
```

### Frontend
```bash
cd frontend
# Edit .env.local with Supabase and API URLs
# Open index.html in browser or local server
```

### Database
```bash
# Go to Supabase Console → SQL Editor
# Run migrations in order (001 → 006)
# See database/migrations/README.md
```

---

## 🔌 API Reference

### POST /api/station-data
Send charging data from ESP32

```bash
curl -X POST http://localhost:8000/api/station-data \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "station_id": 1,
    "timestamp": "2024-04-25T10:30:00Z",
    "plugs": [
      {"plug_number": 1, "current_a": 32.5, "voltage_v": 400, "power_w": 22000, "status": "charging"},
      {"plug_number": 2, "current_a": 0, "voltage_v": 0, "power_w": 0, "status": "free"},
      {"plug_number": 3, "current_a": 16.2, "voltage_v": 230, "power_w": 3720, "status": "charging"}
    ],
    "total_load_kw": 25.72,
    "free_slots": 1
  }'
```

**Response:**
```json
{
  "status": "success",
  "recorded_at": "2024-04-25T10:30:00Z",
  "message": "Data received and stored"
}
```

### GET /api/best-stations
Get best charging stations near user

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  'http://localhost:8000/api/best-stations?user_lat=40.7128&user_lon=-74.0060&limit=3'
```

**Response:**
```json
{
  "stations": [
    {
      "station_id": 1,
      "name": "Downtown Hub",
      "latitude": 40.7128,
      "longitude": -74.0060,
      "total_load_kw": 45.2,
      "load_pct": 75.3,
      "free_slots": 1,
      "distance_km": 2.3,
      "score": 0.92
    }
  ],
  "generated_at": "2024-04-25T10:30:00Z",
  "count": 1
}
```

### GET /health
Check API status

```bash
curl http://localhost:8000/health
# Response: {"status": "ok"}
```

### GET /api/docs
Interactive API documentation (Swagger UI)

```
http://localhost:8000/api/docs
```

---

## 🪝 React Hooks Quick Use

### Real-time Station Monitor

```typescript
import { useStationSnapshots } from '@/hooks/useStationSnapshots';

export function Dashboard() {
    const { stations, isLoading, error } = useStationSnapshots(
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_ANON_KEY
    );

    if (error) return <div>Error: {error.message}</div>;
    if (isLoading) return <div>Loading...</div>;

    return (
        <div>
            {stations.map(s => (
                <div key={s.station_id}>
                    <h3>Station {s.station_id}</h3>
                    <p>Load: {s.load_pct}% | Free: {s.free_slots}</p>
                </div>
            ))}
        </div>
    );
}
```

### Find Best Stations

```typescript
import { useBestStations } from '@/hooks/useBestStations';

export function FindStations() {
    const { bestStations, isLoading, refetch } = useBestStations(
        process.env.REACT_APP_API_URL,
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_ANON_KEY
    );

    return (
        <div>
            <button onClick={refetch} disabled={isLoading}>
                {isLoading ? 'Searching...' : 'Find Stations'}
            </button>
            {bestStations.map(s => (
                <div key={s.station_id}>
                    <h4>{s.name}</h4>
                    <p>Score: {(s.score * 100).toFixed(0)}% | Distance: {s.distance_km} km</p>
                </div>
            ))}
        </div>
    );
}
```

---

## 🗄️ Database Quick Queries

### Check Station Status
```sql
SELECT station_id, status, ARRAY_AGG(plug_number) as plugs 
FROM plug_status 
WHERE status = 'free'
GROUP BY station_id;
```

### Get Latest Readings
```sql
SELECT * FROM readings 
WHERE station_id = 1 
ORDER BY recorded_at DESC 
LIMIT 10;
```

### Top Performing Stations
```sql
SELECT s.station_id, s.name, 
       COUNT(c.id) as sessions,
       AVG(c.energy_kwh) as avg_kwh
FROM stations s
LEFT JOIN charging_sessions c ON s.station_id = c.station_id
GROUP BY s.station_id
ORDER BY COUNT(c.id) DESC;
```

### Real-time Load Heatmap
```sql
SELECT station_id, load_pct, free_slots, updated_at
FROM station_snapshots
ORDER BY load_pct DESC;
```

---

## 🔑 Environment Variables

### Backend (.env)
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
API_SECRET_KEY=your-32-char-secret-for-esp32
SUPABASE_JWT_SECRET=your-jwt-secret-from-supabase
LOG_LEVEL=INFO
HOST=0.0.0.0
PORT=8000
```

### Frontend (.env.local)
```env
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
REACT_APP_API_URL=http://localhost:8000/api
```

### ESP32 (send_data.cpp)
```cpp
#define BACKEND_URL "http://your-api-ip:8000/api/station-data"
#define API_KEY "your-api-secret-key"
#define STATION_ID 1
const char* SSID = "your-wifi-ssid";
const char* PASSWORD = "your-wifi-password";
```

---

## 📊 Testing Checklist

- [ ] **Backend starts:** `python main.py` → No errors
- [ ] **API responds:** `curl http://localhost:8000/health` → 200 OK
- [ ] **Docs work:** Open `http://localhost:8000/api/docs` → Can see endpoints
- [ ] **Database ready:** All 6 migrations executed in Supabase
- [ ] **Realtime enabled:** Supabase Console → Replication → plug_status ✓
- [ ] **ESP32 connects:** Serial monitor shows "WiFi connected"
- [ ] **Data flows:** POST to station-data → Check readings table
- [ ] **Frontend loads:** Open index.html → No console errors
- [ ] **Auth works:** Can login with Supabase credentials
- [ ] **Hooks render:** useStationSnapshots shows real data

---

## 🚨 Common Issues & Fixes

### "ImportError: No module named 'fastapi'"
```bash
cd backend && pip install -r requirements.txt
```

### "SUPABASE_URL not found"
```bash
# Create .env file in backend/ directory with correct values
cat > .env << 'EOF'
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-key
API_SECRET_KEY=your-secret
SUPABASE_JWT_SECRET=your-jwt-secret
EOF
```

### "CORS error in browser"
- Backend is running with CORSMiddleware configured ✓
- Frontend and backend URLs are correct ✓
- Browser is making request to correct API URL ✓

### "ESP32 can't connect to WiFi"
```cpp
// Check SSID/password
const char* SSID = "your-actual-wifi-name";  // Not "your-wifi-ssid"!
const char* PASSWORD = "your-actual-password";

// Verify 2.4GHz (not 5GHz)
// Check if WiFi password has special characters that need escaping
```

### "Realtime subscription not working"
```sql
-- Verify Realtime is enabled
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
-- Should show plug_status and station_snapshots tables
```

### "JWT token invalid"
- User needs to be logged in first
- Token might have expired (usually valid 1 hour)
- SUPABASE_JWT_SECRET must be correct in backend .env

---

## 📈 Performance Optimization

### Backend
```python
# Add caching for best-stations (60 second TTL)
from fastapi_cache2 import cached

@app.get("/best-stations")
@cached(expire=60)
async def get_best_stations(...):
    pass

# Enable gzip compression
from fastapi.middleware.gzip import GZIPMiddleware
app.add_middleware(GZIPMiddleware, minimum_size=1000)
```

### Database
```sql
-- Create composite index for frequent queries
CREATE INDEX idx_readings_station_time 
    ON readings(station_id, recorded_at DESC);

-- Analyze query performance
EXPLAIN ANALYZE 
SELECT * FROM station_snapshots WHERE load_pct > 80;
```

### Frontend
```typescript
// Lazy load components
const Dashboard = lazy(() => import('./Dashboard'));

// Debounce refetch calls
const [lastRefetch, setLastRefetch] = useState(0);
const handleRefresh = () => {
    if (Date.now() - lastRefetch < 2000) return;
    refetch();
    setLastRefetch(Date.now());
};
```

---

## 🔒 Security Checklist

- [ ] **API Key rotated:** Change API_SECRET_KEY every 3 months
- [ ] **JWT Secret secure:** Use strong 32+ character secret
- [ ] **RLS enabled:** All tables have Row Level Security policies
- [ ] **CORS restricted:** Only allow frontend domain (production)
- [ ] **HTTPS enforced:** All APIs use https:// (production)
- [ ] **Rate limiting:** ESP32 POST limited to prevent abuse
- [ ] **Input validation:** All requests validated by Pydantic
- [ ] **Secrets not in code:** Use .env files, never commit secrets

---

## 📚 Documentation Map

| Document | Purpose |
|----------|---------|
| [README.md](./README.md) | Project overview & features |
| [SETUP_GUIDE.md](./SETUP_GUIDE.md) | Complete setup instructions |
| [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) | Production deployment |
| [database/migrations/README.md](./database/migrations/README.md) | SQL migration guide |
| [frontend/hooks/README.md](./frontend/hooks/README.md) | React hooks documentation |
| [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) | This file |

---

## 🎯 Next Steps

1. **Setup Backend** → Run `python main.py`
2. **Create Database** → Execute SQL migrations
3. **Deploy Frontend** → Open index.html + hooks
4. **Flash ESP32** → Upload send_data.cpp
5. **Test Flow** → Send data → See in dashboard
6. **Deploy to Production** → Follow DEPLOYMENT_GUIDE.md

---

## 📞 Useful Links

- **Supabase Documentation:** https://supabase.com/docs
- **FastAPI Guide:** https://fastapi.tiangolo.com/
- **React Hooks:** https://react.dev/reference/react
- **ESP32 Arduino:** https://docs.espressif.com/projects/arduino-esp32/
- **Tailwind CSS:** https://tailwindcss.com/docs
- **PostgreSQL:** https://www.postgresql.org/docs/

---

**Version:** 1.0.0  
**Last Updated:** April 2024  
**Status:** Production Ready ✅
