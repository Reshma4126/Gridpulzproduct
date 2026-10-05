# React Hooks - EV Charging Frontend

Custom React hooks for integrating with the EV charging backend API and Supabase Realtime subscriptions.

## Available Hooks

### useStationSnapshots
**Purpose:** Subscribe to real-time station snapshot updates

```typescript
const { stations, isLoading, error } = useStationSnapshots(
    supabaseUrl,
    supabaseAnonKey
);
```

**Features:**
- Auto-subscribes to `station_snapshots` table on component mount
- Updates local state when plug status changes (realtime)
- Fetches initial data on first load
- Handles connection errors gracefully
- Auto-unsubscribes on unmount

**Return Object:**
- `stations: StationSnapshot[]` - Array of current station states
- `isLoading: boolean` - true while fetching initial data
- `error: Error | null` - null if successful, Error object if failed

**Example Usage:**

```typescript
import { useStationSnapshots } from '@/hooks/useStationSnapshots';

export function StationMonitorPage() {
    const { stations, isLoading, error } = useStationSnapshots(
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_ANON_KEY
    );

    if (isLoading) {
        return <div>Loading stations...</div>;
    }

    if (error) {
        return <div>Error: {error.message}</div>;
    }

    return (
        <div>
            <h1>Station Status Monitor</h1>
            {stations.map((station) => (
                <StationCard key={station.station_id} station={station} />
            ))}
        </div>
    );
}

function StationCard({ station }: { station: StationSnapshot }) {
    const loadColor = station.load_pct > 80 ? 'red' : 'green';
    
    return (
        <div className="card">
            <h3>Station {station.station_id}</h3>
            <p>Load: <span style={{ color: loadColor }}>{station.load_pct}%</span></p>
            <p>Free Slots: {station.free_slots}</p>
            <p>Total Load: {station.total_load_kw} kW</p>
            
            <div className="plug-states">
                {station.plug_states.map((plug) => (
                    <div key={plug.plug_number} className={`plug ${plug.status}`}>
                        Plug {plug.plug_number}: {plug.status}
                    </div>
                ))}
            </div>
        </div>
    );
}
```

**When to Use:**
- Dashboard showing all stations
- Real-time station status monitor
- Map view with live plug availability
- Alert when station becomes overloaded

---

### useBestStations
**Purpose:** Find optimal charging stations based on user location

```typescript
const { bestStations, isLoading, error, refetch } = useBestStations(
    apiUrl,
    supabaseUrl,
    supabaseAnonKey,
    userLat,  // optional - uses geolocation if not provided
    userLon   // optional - uses geolocation if not provided
);
```

**Features:**
- Fetches top 3 nearest stations with best scores
- Uses user's geolocation if coordinates not provided
- Includes Supabase JWT token in request
- Provides `refetch()` for manual updates
- Handles authentication errors
- Scoring formula: (availability × 0.4) + (load_efficiency × 0.4) + (distance × 0.2)

**Return Object:**
- `bestStations: StationSnapshot[]` - Top stations ranked by score
- `isLoading: boolean` - true while fetching
- `error: Error | null` - null if successful
- `refetch: () => Promise<void>` - Manually refresh stations

**Example Usage:**

```typescript
import { useBestStations } from '@/hooks/useBestStations';

export function FindStationsPage() {
    const { bestStations, isLoading, error, refetch } = useBestStations(
        'http://localhost:8000/api',
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_ANON_KEY
    );

    if (error) {
        return (
            <div>
                <p>Error: {error.message}</p>
                <button onClick={refetch}>Retry</button>
            </div>
        );
    }

    return (
        <div>
            <h1>Best Stations Near You</h1>
            <button onClick={refetch} disabled={isLoading}>
                {isLoading ? 'Searching...' : 'Refresh'}
            </button>
            
            <div className="station-list">
                {bestStations.map((station, index) => (
                    <div key={station.station_id} className="station-item">
                        <h3>#{index + 1} - {station.name}</h3>
                        <p>Distance: {(station.distance_km || 0).toFixed(1)} km</p>
                        <p>Score: {((station.score || 0) * 100).toFixed(0)}%</p>
                        <p>Available: {station.free_slots} plugs</p>
                        <button onClick={() => bookStation(station)}>
                            Book Now
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
```

**With Manual Coordinates:**

```typescript
const { bestStations, refetch } = useBestStations(
    'http://localhost:8000/api',
    process.env.REACT_APP_SUPABASE_URL,
    process.env.REACT_APP_SUPABASE_ANON_KEY,
    40.7128,   // latitude
    -74.0060   // longitude
);
```

**When to Use:**
- "Find nearest station" search
- Recommendations when user opens app
- Refresh button to get updated rankings
- Integration with maps (show top 3 on map)

---

## Data Types

### StationSnapshot
```typescript
interface StationSnapshot {
    station_id: number;
    name: string;
    latitude: number;
    longitude: number;
    total_load_kw: number;        // Current power draw in kW
    load_pct: number;              // 0-100 percentage of capacity
    free_slots: number;            // Count of available plugs
    distance_km?: number;          // From user (populated by API)
    score?: number;                // 0-1 ranking score
}
```

### PlugState
```typescript
interface PlugState {
    plug_number: number;           // 1, 2, or 3
    status: 'free' | 'charging' | 'fault';
    power_w: number;               // Watts
    current_a: number;             // Amperes
    voltage_v: number;             // Volts
}
```

---

## Setup Instructions

### 1. Installation

```bash
# Install Supabase client
npm install @supabase/supabase-js

# or with yarn
yarn add @supabase/supabase-js
```

### 2. Environment Variables

Create `.env.local`:

```env
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
REACT_APP_API_URL=http://localhost:8000/api
```

### 3. Verify Authentication

Ensure user is authenticated before using hooks:

```typescript
// In your layout or app component
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

export function App() {
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const supabase = createClient(
            process.env.REACT_APP_SUPABASE_URL,
            process.env.REACT_APP_SUPABASE_ANON_KEY
        );

        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setLoading(false);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, session) => {
                setSession(session);
            }
        );

        return () => subscription?.unsubscribe();
    }, []);

    if (loading) return <div>Loading auth...</div>;
    if (!session) return <LoginPage />;

    return <MainApp />;
}
```

---

## Common Patterns

### Pattern 1: Combined View (Realtime + Search)

```typescript
export function ChargingHub() {
    // Real-time all stations
    const { stations: allStations } = useStationSnapshots(...);
    
    // Best stations for this user
    const { bestStations, refetch } = useBestStations(...);

    return (
        <div>
            <div className="recommended">
                <h2>Recommended for You</h2>
                {bestStations.map(station => (
                    <StationCard key={station.station_id} station={station} />
                ))}
            </div>

            <div className="all-stations">
                <h2>All Stations ({allStations.length})</h2>
                {allStations.map(station => (
                    <StationCard key={station.station_id} station={station} />
                ))}
            </div>
        </div>
    );
}
```

### Pattern 2: Auto-Refresh on Focus

```typescript
export function StationMonitor() {
    const { stations, isLoading, refetch } = useStationSnapshots(...);

    useEffect(() => {
        const handleFocus = () => {
            console.log('App focused, refreshing stations...');
            refetch();
        };

        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, [refetch]);

    return <StationList stations={stations} />;
}
```

### Pattern 3: Error Recovery

```typescript
export function SafeStationView() {
    const { stations, error, refetch } = useStationSnapshots(...);

    if (error?.message.includes('Realtime')) {
        return (
            <div className="error-banner">
                <p>Real-time connection lost. Updates may be delayed.</p>
                <button onClick={refetch}>Reconnect</button>
            </div>
        );
    }

    return <StationList stations={stations} />;
}
```

---

## Troubleshooting

### "User not authenticated"
**Cause:** useBestStations requires user to be logged in  
**Solution:** Call hook only after `session` is confirmed in your auth state

### "Realtime subscription TIMED_OUT"
**Cause:** Network connectivity issue or Supabase service interruption  
**Solution:** Implement retry logic or show offline banner

### "JWT token is invalid"
**Cause:** Token expired or wrong secret  
**Solution:** Let Supabase auth handle token refresh automatically

### "CORS error from API"
**Cause:** Backend API not configured with CORS headers  
**Solution:** Verify `main.py` has `CORSMiddleware` configured

### Infinite re-renders
**Cause:** Objects/arrays passed as deps without memoization  
**Solution:** Ensure constant supabaseUrl/supabaseAnonKey values

---

## Performance Tips

1. **Memoize props:**
   ```typescript
   const supabaseUrl = useMemo(() => process.env.REACT_APP_SUPABASE_URL, []);
   const { stations } = useStationSnapshots(supabaseUrl, ...);
   ```

2. **Paginate large station lists:**
   ```typescript
   const [page, setPage] = useState(0);
   const pageSize = 10;
   const visibleStations = allStations.slice(page * pageSize, (page + 1) * pageSize);
   ```

3. **Debounce refetch:**
   ```typescript
   const [lastRefetch, setLastRefetch] = useState(0);
   const handleRefresh = () => {
       if (Date.now() - lastRefetch < 2000) return;
       refetch();
       setLastRefetch(Date.now());
   };
   ```

---

## TypeScript Support

Hooks are fully typed. Import types for your components:

```typescript
import type { StationSnapshot, PlugState } from '@/hooks/useStationSnapshots';

const station: StationSnapshot = {
    station_id: 1,
    name: 'Downtown Station',
    latitude: 40.7128,
    longitude: -74.0060,
    total_load_kw: 45.2,
    load_pct: 75,
    free_slots: 1,
    distance_km: 2.3,
    score: 0.92
};
```

---

## Advanced Usage

### Subscribe to Specific Events

```typescript
// In useStationSnapshots, you can extend to listen for DELETE events:
.on(
    'postgres_changes',
    {
        event: 'DELETE',
        schema: 'public',
        table: 'station_snapshots'
    },
    (payload) => {
        console.log('Station removed:', payload.old);
    }
)
```

### Custom Scoring in UI

```typescript
// Filter stations by custom criteria
const fastChargers = bestStations.filter(s => 
    s.total_load_kw < 50 && s.free_slots > 0
);

// Sort by distance
const bySortOrder = [...stations].sort((a, b) => 
    (a.distance_km || 0) - (b.distance_km || 0)
);
```

---

## Questions & Support

- React Hooks: https://react.dev/reference/react/hooks
- Supabase Realtime: https://supabase.com/docs/guides/realtime
- TypeScript: https://www.typescriptlang.org/docs/
