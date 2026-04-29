// ============================================================
// GridPulz — Database & Utility Module
// ============================================================

/**
 * Calculates the great-circle distance between two GPS coordinates using Haversine formula.
 */
window.haversineKm = function(lat1, lng1, lat2, lng2) {
    if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * Saves a snapshot of the user's location and battery percentage to the user_live_data table.
 */
window.insertLiveData = async function(userId, batterySoc, latitude, longitude) {
    if (!window.supabaseClient) {
        console.error("Supabase client not initialized.");
        return { error: new Error("Supabase client missing") };
    }

    // Attempt upsert so we don't duplicate rows for the same user if that's the setup
    // Assuming user_id is the primary key or unique
    const { data, error } = await window.supabaseClient
        .from('user_live_data')
        .upsert({
            user_id: userId,
            current_soc: batterySoc,
            current_lat: latitude,
            current_lng: longitude,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

    if (error) {
        console.error('Failed to sync live data:', error);
    } else {
        console.log('Successfully synced live user location and SoC.');
    }
    return { data, error };
};

/**
 * Fetches all stations and filters them by radius, sorted by proximity.
 */
window.getNearbyStations = async function(lat, lng, radiusKm = 30) {
    console.log('getNearbyStations called with:', lat, lng, radiusKm);
    console.log('Supabase client available:', !!window.supabaseClient);
    
    if (!window.supabaseClient) {
        throw new Error("Supabase client not initialized.");
    }
    
    const { data: stations, error } = await window.supabaseClient
        .from('stations')
        .select('*');

    console.log('Stations query result:', { stations, error });

    if (error) throw error;

    if (!stations) {
        console.log('No stations returned from database');
        return [];
    }

    console.log('Processing', stations.length, 'stations');

    const nearby = stations.map(station => {
        const dist = window.haversineKm(lat, lng, station.lat ?? station.latitude, station.lng ?? station.longitude);
        return { ...station, dist };
    })
    .filter(station => station.dist !== null && station.dist <= radiusKm)
    .sort((a, b) => a.dist - b.dist);

    console.log('Nearby stations after filtering:', nearby.length);
    return nearby;
};

/**
 * Fetches all stations once and caches them. Returns the cache on subsequent calls.
 * The realtime module can update individual entries in-place via window._stationsCacheData.
 */
window._stationsCacheData = null;
window.getAllStationsCached = async function(forceRefresh = false) {
    if (!forceRefresh && window._stationsCacheData) {
        return window._stationsCacheData;
    }
    if (!window.supabaseClient) {
        throw new Error("Supabase client not initialized.");
    }
    const { data: stations, error } = await window.supabaseClient
        .from('stations')
        .select('*');
    if (error) throw error;
    window._stationsCacheData = stations || [];
    return window._stationsCacheData;
};
