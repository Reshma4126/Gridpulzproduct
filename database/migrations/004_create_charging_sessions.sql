-- Migration: Create charging_sessions table
-- Description: Tracks charging session history for all users

CREATE TABLE IF NOT EXISTS charging_sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    station_id BIGINT REFERENCES stations(id) ON DELETE CASCADE,
    plug_number INT NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    energy_kwh NUMERIC,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_charging_sessions_user_id ON charging_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_charging_sessions_station_id ON charging_sessions(station_id);
CREATE INDEX IF NOT EXISTS idx_charging_sessions_started_at ON charging_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_charging_sessions_status ON charging_sessions(status);

-- Enable Row Level Security
ALTER TABLE charging_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can SELECT/INSERT their own sessions
CREATE POLICY "users_select_own_sessions" ON charging_sessions
    FOR SELECT
    USING (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "users_insert_own_sessions" ON charging_sessions
    FOR INSERT
    WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "users_update_own_sessions" ON charging_sessions
    FOR UPDATE
    USING (auth.uid() = user_id OR auth.role() = 'service_role');

COMMENT ON TABLE charging_sessions IS 'Historical record of all charging sessions';
COMMENT ON COLUMN charging_sessions.status IS 'Current status of the charging session';
COMMENT ON COLUMN charging_sessions.energy_kwh IS 'Total energy delivered in kWh';
