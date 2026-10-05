/**
 * React Hook: useBestStations
 * 
 * Fetches the best charging stations near user's location from the backend API
 * Includes authentication with Supabase JWT token
 * Provides refetch capability for manual updates
 * 
 * @param {string} apiUrl - Backend API base URL
 * @param {string} supabaseUrl - Supabase URL for client initialization
 * @param {string} supabaseAnonKey - Supabase anon key
 * 
 * @returns {Object} { bestStations, isLoading, error, refetch }
 */

import { useState, useCallback, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

export interface StationSnapshot {
    station_id: number;
    name: string;
    latitude: number;
    longitude: number;
    total_load_kw: number;
    load_pct: number;
    free_slots: number;
    distance_km?: number;
    score?: number;
}

export interface BestStationsResponse {
    stations: StationSnapshot[];
    generated_at: string;
    count: number;
}

export interface UseBestStationsReturn {
    bestStations: StationSnapshot[];
    isLoading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
}

/**
 * Hook to fetch best charging stations based on user location
 */
export const useBestStations = (
    apiUrl: string,
    supabaseUrl: string,
    supabaseAnonKey: string,
    userLat?: number,
    userLon?: number
): UseBestStationsReturn => {
    const [bestStations, setBestStations] = useState<StationSnapshot[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    /**
     * Get user's current location using Geolocation API
     */
    const getUserLocation = useCallback((): Promise<{ lat: number; lon: number }> => {
        return new Promise((resolve, reject) => {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        resolve({
                            lat: position.coords.latitude,
                            lon: position.coords.longitude
                        });
                    },
                    (error) => {
                        reject(new Error(`Geolocation error: ${error.message}`));
                    }
                );
            } else {
                reject(new Error('Geolocation not supported by this browser'));
            }
        });
    }, []);

    /**
     * Fetch best stations from backend
     */
    const fetchBestStations = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);

            // Get user location
            let latitude = userLat;
            let longitude = userLon;

            if (latitude === undefined || longitude === undefined) {
                const location = await getUserLocation();
                latitude = location.lat;
                longitude = location.lon;
                console.log(`📍 User location: ${latitude}, ${longitude}`);
            }

            // Get Supabase auth token
            const supabase = createClient(supabaseUrl, supabaseAnonKey);
            const {
                data: { session }
            } = await supabase.auth.getSession();

            if (!session) {
                throw new Error('User not authenticated. Please sign in first.');
            }

            const token = session.access_token;

            // Fetch best stations
            const response = await fetch(
                `${apiUrl}/best-stations?user_lat=${latitude}&user_lon=${longitude}&limit=3`,
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(
                    errorData.detail || `API error: ${response.statusText}`
                );
            }

            const data: BestStationsResponse = await response.json();
            console.log('✓ Best stations fetched:', data);

            setBestStations(data.stations);
            setError(null);
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error);
            setBestStations([]);
            console.error('❌ Error fetching best stations:', error);
        } finally {
            setIsLoading(false);
        }
    }, [apiUrl, supabaseUrl, supabaseAnonKey, userLat, userLon, getUserLocation]);

    /**
     * Auto-fetch on mount or when dependencies change
     */
    useEffect(() => {
        // Delay to ensure Supabase client is ready
        const timer = setTimeout(() => {
            fetchBestStations();
        }, 500);

        return () => clearTimeout(timer);
    }, [fetchBestStations]);

    return {
        bestStations,
        isLoading,
        error,
        refetch: fetchBestStations
    };
};

export default useBestStations;
