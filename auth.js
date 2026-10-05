const SUPABASE_URL = 'https://jytyvsytvppkkmadnjyo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5dHl2c3l0dnBwa2ttYWRuanlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4OTc5NTcsImV4cCI6MjA5MTQ3Mzk1N30.f89QHiMr5p9aFg5WuNZ6POVDHXYx1HCIOSq42hE-ZVA';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Returns the active Supabase session, or null if not logged in.
 */
async function isAuthenticated() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) return null;
    return session;
}

/**
 * Returns the current logged-in user object, or null.
 */
async function getUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return user;
}

/**
 * Fetches the user's vehicle profile from the user_profiles table.
 * Returns the profile row or null.
 */
async function getUserProfile(userId) {
    const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();
    if (error) return null;
    return data;
}

/**
 * Upserts the user's vehicle/telemetry profile.
 */
async function saveUserProfile(userId, payload) {
    const { error } = await supabase
        .from('user_profiles')
        .upsert({ id: userId, ...payload, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    return error;
}

/**
 * Signs the user out and redirects to login.
 */
async function logout() {
    await supabase.auth.signOut();
    sessionStorage.clear();
    window.location.href = 'login.html';
}
