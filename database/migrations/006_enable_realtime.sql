-- Migration: Enable Supabase Realtime
-- Description: Enable real-time subscriptions on plug_status and station_snapshots

BEGIN;

-- Enable Realtime for plug_status
ALTER PUBLICATION supabase_realtime ADD TABLE plug_status;

-- Enable Realtime for station_snapshots
ALTER PUBLICATION supabase_realtime ADD TABLE station_snapshots;

COMMIT;

COMMENT ON PUBLICATION supabase_realtime IS 'Tables with real-time enabled: plug_status, station_snapshots';
