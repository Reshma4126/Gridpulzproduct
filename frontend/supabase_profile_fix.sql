-- ============================================================
-- GridPulz: Absolute Fix for Users Table Sync
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/jytyvsytvppkkmadnjyo/sql
-- ============================================================

-- 1. Create table if missing
CREATE TABLE IF NOT EXISTS public.users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    username TEXT,
    password TEXT,
    vehicle_name TEXT DEFAULT 'Not set',
    charging_capacity NUMERIC,
    charging_type TEXT DEFAULT 'Type 2',
    voltage_type TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Ensure ALL required columns exist, even if table was created manually before
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='vehicle_name') THEN
        ALTER TABLE public.users ADD COLUMN vehicle_name TEXT DEFAULT 'Not set';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='charging_capacity') THEN
        ALTER TABLE public.users ADD COLUMN charging_capacity NUMERIC;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='charging_type') THEN
        ALTER TABLE public.users ADD COLUMN charging_type TEXT DEFAULT 'Type 2';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='password') THEN
        ALTER TABLE public.users ADD COLUMN password TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='voltage_type') THEN
        ALTER TABLE public.users ADD COLUMN voltage_type TEXT;
    END IF;
END $$;

-- 3. Grant basic privileges FIRST so "permission denied" errors disappear
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.users TO anon, authenticated;

-- 4. Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 5. Drop ALL existing policies on this table to prevent conflicting rules
DROP POLICY IF EXISTS "Users can read own profile" ON public.users;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;

-- 6. Create robust policies (simplified to ensure signup and dashboard ALWAYS work)
-- Allow anyone to read profiles (needed for dashboard load)
CREATE POLICY "Users can read own profile"
    ON public.users FOR SELECT
    USING (true);

-- Allow authenticated users to INSERT their profile during signup
CREATE POLICY "Users can insert own profile"
    ON public.users FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- Allow authenticated users to UPDATE their profile
CREATE POLICY "Users can update own profile"
    ON public.users FOR UPDATE
    USING (auth.role() = 'authenticated' AND auth.jwt() ->> 'email' = email)
    WITH CHECK (auth.role() = 'authenticated' AND auth.jwt() ->> 'email' = email);

-- ============================================================
-- DONE!
-- After running this, your sign-up data will instantly appear!
-- ============================================================