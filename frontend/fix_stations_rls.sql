-- ============================================================
-- GridPulz: Fix Station Map Visibility
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/jytyvsytvppkkmadnjyo/sql
-- ============================================================

-- Ensure the stations table is readable by the map
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON TABLE public.stations TO anon, authenticated;

-- Make stations publicly queryable by the map's getNearbyStations() function
CREATE POLICY "Stations are viewable by everyone"
    ON public.stations FOR SELECT
    USING (true);

-- Also ensure operators can insert unconditionally
CREATE POLICY "Operators can create stations"
    ON public.stations FOR INSERT
    WITH CHECK (true);
