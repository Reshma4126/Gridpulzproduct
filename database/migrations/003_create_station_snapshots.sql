-- Migration: Create station_snapshots table
-- Description: Latest state per station for fast reads and real-time updates

CREATE TABLE IF NOT EXISTS station_snapshots (
    station_id BIGINT PRIMARY KEY REFERENCES stations(id) ON DELETE CASCADE,
    total_load_kw NUMERIC DEFAULT 0,
    load_pct NUMERIC DEFAULT 0,
    free_slots INT DEFAULT 0,
    plug_states JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_station_snapshots_load_pct 
    ON station_snapshots(load_pct);
CREATE INDEX IF NOT EXISTS idx_station_snapshots_updated_at 
    ON station_snapshots(updated_at DESC);

-- Enable Row Level Security
ALTER TABLE station_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Authenticated users can SELECT
CREATE POLICY "authenticated_select_station_snapshots" ON station_snapshots
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- RLS Policy: Service role can INSERT/UPDATE
CREATE POLICY "service_role_manage_station_snapshots" ON station_snapshots
    FOR ALL
    USING (auth.role() = 'service_role');

COMMENT ON TABLE station_snapshots IS 'Latest state snapshot per station for fast reads';
COMMENT ON COLUMN station_snapshots.total_load_kw IS 'Total power consumption in kW';
COMMENT ON COLUMN station_snapshots.load_pct IS 'Load percentage (0-100) of station capacity';
COMMENT ON COLUMN station_snapshots.free_slots IS 'Number of available charging plugs';
COMMENT ON COLUMN station_snapshots.plug_states IS 'JSONB array of individual plug states';
