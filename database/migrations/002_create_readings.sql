-- Migration: Create readings table
-- Description: Time-series append-only table for historical charging data

CREATE TABLE IF NOT EXISTS readings (
    id BIGSERIAL PRIMARY KEY,
    station_id BIGINT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
    plug_number INT NOT NULL,
    current_a NUMERIC,
    voltage_v NUMERIC,
    power_w NUMERIC,
    status TEXT CHECK (status IN ('free', 'charging', 'fault')),
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for fast time-series queries
CREATE INDEX IF NOT EXISTS idx_readings_station_recorded_at 
    ON readings(station_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_readings_recorded_at 
    ON readings(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_readings_station_plug 
    ON readings(station_id, plug_number);

-- Enable Row Level Security
ALTER TABLE readings ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Authenticated users can SELECT
CREATE POLICY "authenticated_select_readings" ON readings
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- RLS Policy: Service role can INSERT
CREATE POLICY "service_role_insert_readings" ON readings
    FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE readings IS 'Time-series data for all plug readings (append-only)';
COMMENT ON COLUMN readings.recorded_at IS 'Timestamp when reading was recorded (UTC)';
