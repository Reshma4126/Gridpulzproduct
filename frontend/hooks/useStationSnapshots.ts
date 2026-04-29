/**
 * React Hook: useStationSnapshots
 * 
 * Subscribes to real-time updates from Supabase station_snapshots table
 * Automatically syncs local state when new data arrives
 * 
 * @returns {Object} { stations, isLoading, error }
 */

import { useState, useEffect } from 'react';
import { createClient, RealtimeChannel } from '@supabase/supabase-js';

export interface PlugState {
    plug_number: number;
    status: 'free' | 'charging' | 'fault';
    power_w: number;
    current_a: number;
    voltage_v: number;
}

export interface StationSnapshot {
    station_id: number;
    total_load_kw: number;
    load_pct: number;
    free_slots: number;
    plug_states: PlugState[];
    updated_at: string;
}

export interface UseStationSnapshotsReturn {
    stations: StationSnapshot[];
    isLoading: boolean;
    error: Error | null;
}

/**
 * Hook to subscribe to real-time station snapshot updates
 */
export const useStationSnapshots = (
    supabaseUrl: string,
    supabaseAnonKey: string
): UseStationSnapshotsReturn => {
    const [stations, setStations] = useState<StationSnapshot[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        // Initialize Supabase client
        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        let subscription: RealtimeChannel | null = null;

        const initializeSubscription = async () => {
            try {
                // Fetch initial data
                const { data, error: fetchError } = await supabase
                    .from('station_snapshots')
                    .select('*')
                    .order('updated_at', { ascending: false });

                if (fetchError) {
                    throw fetchError;
                }

                setStations(data || []);
                setError(null);
                setIsLoading(false);

                // Subscribe to real-time updates
                subscription = supabase
                    .channel('station_snapshots_updates')
                    .on(
                        'postgres_changes',
                        {
                            event: 'UPDATE',
                            schema: 'public',
                            table: 'station_snapshots'
                        },
                        (payload: any) => {
                            console.log('📡 Station snapshot updated:', payload.new);
                            
                            setStations((prevStations) =>
                                prevStations.map((station) =>
                                    station.station_id === payload.new.station_id
                                        ? payload.new
                                        : station
                                )
                            );
                        }
                    )
                    .on(
                        'postgres_changes',
                        {
                            event: 'INSERT',
                            schema: 'public',
                            table: 'station_snapshots'
                        },
                        (payload: any) => {
                            console.log('📡 New station snapshot:', payload.new);
                            
                            setStations((prevStations) => [
                                payload.new,
                                ...prevStations
                            ]);
                        }
                    )
                    .subscribe((status) => {
                        console.log('🔗 Subscription status:', status);
                        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                            setError(new Error(`Realtime connection ${status}`));
                        }
                    });
            } catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));
                setError(error);
                setIsLoading(false);
                console.error('❌ Error initializing station snapshots:', error);
            }
        };

        initializeSubscription();

        // Cleanup on unmount
        return () => {
            if (subscription) {
                supabase.removeChannel(subscription);
            }
        };
    }, [supabaseUrl, supabaseAnonKey]);

    return { stations, isLoading, error };
};

export default useStationSnapshots;
