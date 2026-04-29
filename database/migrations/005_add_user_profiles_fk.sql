-- Migration: Add foreign key constraint to user_profiles
-- Description: Link user_profiles to auth.users if not already linked

-- Check if constraint exists before adding
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'user_profiles' 
        AND constraint_name = 'fk_user_profiles_auth'
    ) THEN
        ALTER TABLE user_profiles 
        ADD CONSTRAINT fk_user_profiles_auth 
        FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
        
        RAISE NOTICE 'Added foreign key constraint fk_user_profiles_auth';
    ELSE
        RAISE NOTICE 'Foreign key constraint fk_user_profiles_auth already exists';
    END IF;
END $$;
