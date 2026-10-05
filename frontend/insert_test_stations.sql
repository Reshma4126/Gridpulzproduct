-- ============================================================
-- GridPulz: Insert Mock Stations for Testing Map
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/jytyvsytvppkkmadnjyo/sql
-- ============================================================

INSERT INTO public.stations (
    name, latitude, longitude, charging_type, num_plugs, contact, email, address, connector_type, voltage, max_current, meter_available, operating_hours, avg_usage, total_capacity_kw, communication_t
) VALUES 
(
    'ChargeGrid Alpha Terminal', 13.0900, 80.2800, 'CCS', 4, '1234567890', 'alpha@example.com', 'Chennai North', 'CCS2', 400, 100, true, '24/7', 50, 200, 'OCPP 1.6'
),
(
    'EvStation Beta Hub', 13.0600, 80.2600, 'Type 2', 6, '1234567891', 'beta@example.com', 'Chennai Central', 'Type 2 AC', 230, 32, true, '06:00-22:00', 80, 44, 'OCPP 1.6'
),
(
    'FastCharge Gamma Point', 13.0800, 80.2500, 'CHAdeMO', 2, '1234567892', 'gamma@example.com', 'Chennai West', 'CHAdeMO', 500, 120, false, '24/7', 20, 120, 'OCPP 1.6'
)
ON CONFLICT DO NOTHING;
