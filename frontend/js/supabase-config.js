
// Supabase Configuration
const SUPABASE_URL = 'https://jytyvsytvppkkmadnjyo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5dHl2c3l0dnBwa2ttYWRuanlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4OTc5NTcsImV4cCI6MjA5MTQ3Mzk1N30.f89QHiMr5p9aFg5WuNZ6POVDHXYx1HCIOSq42hE-ZVA';

// Initialize Supabase client and expose globally
if (typeof supabase !== 'undefined') {
  window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  console.warn('Supabase library not loaded. Authentication may not work.');
  window.supabaseClient = null;
}