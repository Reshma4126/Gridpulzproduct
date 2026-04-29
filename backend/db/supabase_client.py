"""
Supabase client initialization
"""
import os
from supabase import create_client

# Load environment variables
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise ValueError(
        "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables. "
        "Please set them in your .env file."
    )

# Initialize Supabase client with service role key
supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

__all__ = ['supabase']
