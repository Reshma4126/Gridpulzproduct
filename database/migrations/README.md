# SQL Migrations - EV Charging Station System

This directory contains all PostgreSQL migration scripts for setting up the Supabase database schema.

## Migration Files

### 001_create_plug_status.sql
**Purpose:** Real-time charging plug status tracking

Creates the `plug_status` table with:
- Individual plug status (free, charging, fault)
- Real-time electrical parameters (current, voltage, power)
- Automatic timestamp updates
- Row Level Security for data protection
- Index for fast queries by station_id

**Key Features:**
- Realtime enabled (can subscribe to live updates)
- Unique constraint on (station_id, plug_number)
- RLS policies: authenticated users can READ, service_role can WRITE

### 002_create_readings.sql
**Purpose:** Time-series historical data archive

Creates the `readings` table with:
- Append-only time-series data (never updated, only inserted)
- Full snapshot of electrical parameters at each timestamp
- Efficient indexing for time-based queries
- Row Level Security policies

**Key Features:**
- No updates allowed (append-only)
- Index on (station_id, recorded_at DESC) for fast time-range queries
- 30-day+ retention recommended (configure TTL separately)
- Great for analytics and anomaly detection

### 003_create_station_snapshots.sql
**Purpose:** Latest state snapshot for fast lookups

Creates the `station_snapshots` table with:
- Denormalized "current state" of each station
- Aggregated metrics (total_load_kw, load_pct, free_slots)
- JSONB array of individual plug states
- Updated whenever plug_status changes

**Key Features:**
- One row per station (fast lookups)
- Realtime enabled
- JSONB for flexible schema evolution
- Automatic timestamp tracking

### 004_create_charging_sessions.sql
**Purpose:** User charging session history

Creates the `charging_sessions` table with:
- Session start/end times
- Energy consumed in kWh
- Status tracking (active, completed, cancelled)
- Link to user and station

**Key Features:**
- RLS: users can only see their own sessions
- Indexes for fast user and station lookups
- Complete audit trail for billing/analytics

### 005_add_user_profiles_fk.sql
**Purpose:** Link user_profiles to auth.users

Adds foreign key constraint `fk_user_profiles_auth` if not already present.

**Why this matters:**
- Ensures data integrity
- Enables CASCADE deletes when users are removed
- Run this LAST (after auth.users is populated)

### 006_enable_realtime.sql
**Purpose:** Enable Supabase Realtime subscriptions

Configures PostgreSQL WAL (Write-Ahead Log) publication for:
- `plug_status` table - subscribe to live plug updates
- `station_snapshots` table - subscribe to station state changes

**Important:**
- Realtime requires explicit table inclusion
- Only UPDATE and INSERT events published by default
- DELETE events not included for these tables

## Execution Order

**Critical:** Run migrations IN THIS ORDER:

```
1. 001_create_plug_status.sql    ← Foundation
2. 002_create_readings.sql       ← Depends on stations
3. 003_create_station_snapshots.sql
4. 004_create_charging_sessions.sql
5. 005_add_user_profiles_fk.sql  ← Run LAST (depends on auth.users)
6. 006_enable_realtime.sql       ← Run AFTER all tables exist
```

### Why This Order?

- **1-4:** Create new tables with dependencies on existing `stations` table
- **5:** Must run after existing auth system (already working in your setup)
- **6:** Realtime publication requires tables to exist first

## How to Run

### Via Supabase Console (Recommended)

1. Log in to https://app.supabase.com
2. Select your project → SQL Editor → New Query
3. Copy-paste each migration file content
4. Execute each one sequentially
5. Verify tables appear in Database → Tables

### Via PostgreSQL CLI

```bash
# Connect to your database
psql postgresql://[user]:[password]@[host]:[port]/[database]

# Run each migration
\i 001_create_plug_status.sql
\i 002_create_readings.sql
\i 003_create_station_snapshots.sql
\i 004_create_charging_sessions.sql
\i 005_add_user_profiles_fk.sql
\i 006_enable_realtime.sql
```

## Verification Checklist

After running all migrations, verify:

- [ ] **Tables Created**
  ```sql
  SELECT tablename FROM pg_tables WHERE schemaname='public';
  ```
  Should show: `plug_status`, `readings`, `station_snapshots`, `charging_sessions`

- [ ] **RLS Enabled**
  ```sql
  SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename IN ('plug_status', 'readings', 'station_snapshots', 'charging_sessions');
  ```
  All should show `t` (true)

- [ ] **Policies Created**
  ```sql
  SELECT tablename, policyname FROM pg_policies WHERE schemaname='public';
  ```
  Should see policies for each table

- [ ] **Realtime Enabled**
  In Supabase Console → Database → Replication:
  - ✓ `plug_status` is checked
  - ✓ `station_snapshots` is checked

## Schema Relationships

```
stations (existing)
    ↓
plug_status (one row per plug)
readings (historical data)
station_snapshots (current state)
charging_sessions (user sessions)
    ↓
auth.users (via user_id FK)
```

## Rollback

If you need to roll back, run in REVERSE order:

```sql
-- Disable realtime (optional)
ALTER PUBLICATION supabase_realtime DROP TABLE plug_status;
ALTER PUBLICATION supabase_realtime DROP TABLE station_snapshots;

-- Drop tables
DROP TABLE IF EXISTS charging_sessions CASCADE;
DROP TABLE IF EXISTS station_snapshots CASCADE;
DROP TABLE IF EXISTS readings CASCADE;
DROP TABLE IF EXISTS plug_status CASCADE;

-- Remove FK constraint (optional)
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS fk_user_profiles_auth;
```

## Indexes and Performance

Tables have indexes on:

- **plug_status:** `(station_id)`, `(updated_at DESC)`
- **readings:** `(station_id, recorded_at DESC)`, `(recorded_at DESC)`, `(station_id, plug_number)`
- **station_snapshots:** `(load_pct)`, `(updated_at DESC)`
- **charging_sessions:** `(user_id)`, `(station_id)`, `(started_at DESC)`, `(status)`

Add additional indexes as needed based on your query patterns.

## Row Level Security (RLS) Details

All tables have RLS policies:

- **Authenticated users** can SELECT public data
- **Service role** (backend API) can INSERT, UPDATE, DELETE
- **Individual users** can only access their own rows (where applicable)

If you need to modify RLS policies:

```sql
-- View all policies
SELECT * FROM pg_policies WHERE tablename = 'plug_status';

-- Create new policy
CREATE POLICY "custom_select" ON plug_status
    FOR SELECT
    USING (auth.role() = 'authenticated');
```

## Common Issues

### "permission denied for schema public"
- Ensure user has proper Supabase role
- Try migrations as service role or admin

### "Foreign key constraint violation"
- Run migrations in correct order
- Verify `stations` table exists and has data

### "Table already exists"
- Migrations use `CREATE TABLE IF NOT EXISTS`
- Safe to re-run if needed

## Questions?

- Check Supabase docs: https://supabase.com/docs
- Review RLS policies: https://supabase.com/docs/guides/auth/row-level-security
- Realtime guide: https://supabase.com/docs/guides/realtime
