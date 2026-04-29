-- Migration: Create plug_status table
-- Description: Tracks real-time status of each charging plug at each station

CREATE TABLE IF NOT EXISTS plug_status (
    id BIGSERIAL PRIMARY KEY,
    station_id BIGINT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
    plug_number INT NOT NULL CHECK (plug_number BETWEEN 1 AND 3),
    status TEXT NOT NULL DEFAULT 'free' CHECK (status IN ('free', 'charging', 'fault')),
    current_a NUMERIC DEFAULT 0,
    voltage_v NUMERIC DEFAULT 0,
    power_w NUMERIC DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(station_id, plug_number)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_plug_status_station ON plug_status(station_id);
CREATE INDEX IF NOT EXISTS idx_plug_status_updated_at ON plug_status(updated_at DESC);

-- Enable Row Level Security
ALTER TABLE plug_status ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Authenticated users can SELECT
CREATE POLICY "authenticated_select_plug_status" ON plug_status
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- RLS Policy: Service role can UPDATE/INSERT
CREATE POLICY "service_role_manage_plug_status" ON plug_status
    FOR ALL
    USING (auth.role() = 'service_role');

COMMENT ON TABLE plug_status IS 'Real-time status of charging plugs at each station';
COMMENT ON COLUMN plug_status.current_a IS 'Current in Amperes';
COMMENT ON COLUMN plug_status.voltage_v IS 'Voltage in Volts';
COMMENT ON COLUMN plug_status.power_w IS 'Power in Watts';
