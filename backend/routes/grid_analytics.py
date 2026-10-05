"""
Grid Analytics API Routes
Provides endpoints for grid load analysis and management
"""

from fastapi import APIRouter, HTTPException
from typing import Dict, List
from datetime import datetime
import json

from backend.services.grid_analyzer import grid_analyzer
from backend.services.simulated_data import simulated_data_generator

router = APIRouter(prefix="/api/grid", tags=["grid-analytics"])

@router.get("/load-analysis")
async def get_load_analysis() -> Dict:
    """
    Get current grid load analysis for dashboard
    Returns real-time data from all stations
    """
    try:
        # Import here to avoid circular imports
        from backend.main import supabase_read
        
        if not supabase_read:
            raise HTTPException(status_code=503, detail="Database not available")
        
        # Get latest data from all stations
        latest_readings = {}
        
        for station_id in ["STATION_01", "STATION_02", "STATION_03"]:
            response = supabase_read.table("station_live_data") \
                .select("*") \
                .eq("station_id", station_id) \
                .order("updated_at", desc=True) \
                .limit(1) \
                .execute()
            
            if response.data:
                latest_readings[station_id] = response.data[0]
        
        # Fallback to simulated data if no real data available
        if not latest_readings:
            latest_readings = simulated_data_generator.get_simulated_all_stations()
            print("[DEBUG] Using SIMULATED data - no real sensor data available")
        
        # Calculate metrics for each station
        stations_data = []
        total_grid_load = 0
        
        for station_id, data in latest_readings.items():
            total_power = sum([
                data.get("plug1_power", 0),
                data.get("plug2_power", 0),
                data.get("plug3_power", 0),
            ])
            
            total_grid_load += total_power
            
            occupied = sum(1 for power in [
                data.get("plug1_power", 0),
                data.get("plug2_power", 0),
                data.get("plug3_power", 0),
            ] if power > 3)
            
            utilization = grid_analyzer.calculate_utilization(station_id, total_power)
            
            stations_data.append({
                "station_id": station_id,
                "total_power": round(total_power, 2),
                "utilization_percentage": round(utilization, 2),
                "occupied_slots": occupied,
                "available_slots": 3 - occupied,
                "status": grid_analyzer.get_status(utilization),
                "timestamp": data.get("updated_at"),
            })
        
        # Calculate grid state
        load_percentage = (total_grid_load / grid_analyzer.GRID_CAPACITY_KW) * 100
        
        # Get historical data for prediction
        historical_response = supabase_read.table("station_live_data") \
            .select("*") \
            .order("updated_at", desc=True) \
            .limit(100) \
            .execute()
        
        load_history = []
        if historical_response.data:
            for record in historical_response.data:
                record_power = sum([
                    record.get("plug1_power", 0),
                    record.get("plug2_power", 0),
                    record.get("plug3_power", 0),
                ])
                load_history.append(record_power)
        
        # Predict overload
        predicted_overload_time = grid_analyzer.predict_overload(total_grid_load, load_history)
        
        return {
            "timestamp": datetime.now().isoformat(),
            "stations": stations_data,
            "grid_state": {
                "total_grid_load_kw": round(total_grid_load, 2),
                "grid_capacity_kw": grid_analyzer.GRID_CAPACITY_KW,
                "load_percentage": round(load_percentage, 2),
                "status": "critical" if load_percentage >= 90 else "warning" if load_percentage >= 75 else "normal",
                "overload_risk": load_percentage >= 90,
                "predicted_overload_time": predicted_overload_time,
            },
            "demand_spikes": [],  # Would be populated from spike detection
            "prediction_next_30min": {
                "peak_load_kw": round(total_grid_load * 1.1, 2),  # Simple 10% projection
                "risk_of_overload": (total_grid_load * 1.1) > grid_analyzer.GRID_CAPACITY_KW,
            }
        }
        
    except Exception as e:
        print(f"Error in load analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/booking-recommendation")
async def get_booking_recommendation(
    booking_id: str,
    station_id: str,
    power_demand: float
) -> Dict:
    """
    Get ML-driven recommendation for new booking
    Shows comparison with/without GridPulz
    """
    try:
        from backend.main import supabase_read
        
        if not supabase_read:
            raise HTTPException(status_code=503, detail="Database not available")
        
        # Get latest data for all stations
        station_loads = {}
        total_grid_load = 0
        
        for sid in ["STATION_01", "STATION_02", "STATION_03"]:
            response = supabase_read.table("station_live_data") \
                .select("*") \
                .eq("station_id", sid) \
                .order("updated_at", desc=True) \
                .limit(1) \
                .execute()
            
            if response.data:
                data = response.data[0]
                power = (
                    (data.get("plug1_power", 0)) +
                    (data.get("plug2_power", 0)) +
                    (data.get("plug3_power", 0))
                )
                station_loads[sid] = power
                total_grid_load += power
            else:
                station_loads[sid] = 0
        
        # Get ML recommendation
        recommendation = grid_analyzer.recommend_redirect(
            booking_id=booking_id,
            requested_station=station_id,
            requested_power=power_demand,
            current_station_loads=station_loads,
            current_grid_load=total_grid_load,
        )
        
        return recommendation
        
    except Exception as e:
        print(f"Error in booking recommendation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/historical-comparison/{days}")
async def get_historical_comparison(days: int = 7) -> Dict:
    """
    Get historical data comparing grid load with and without GridPulz
    Simulated comparison showing prevented overloads
    """
    try:
        from backend.main import supabase_read
        
        if not supabase_read:
            raise HTTPException(status_code=503, detail="Database not available")
        
        from datetime import timedelta
        
        start_date = datetime.now() - timedelta(days=days)
        
        # Get actual load data
        actual_loads_response = supabase_read.table("station_live_data") \
            .select("*") \
            .gte("updated_at", start_date.isoformat()) \
            .execute()
        
        # Calculate hourly statistics
        hourly_data = {}
        
        for reading in actual_loads_response.data:
            hour = datetime.fromisoformat(reading["updated_at"].replace('Z', '+00:00')).replace(minute=0, second=0, microsecond=0)
            if hour not in hourly_data:
                hourly_data[hour] = {"with_gridpulz": 0, "count": 0}
            
            total_power = (reading.get("plug1_power", 0) + reading.get("plug2_power", 0) + reading.get("plug3_power", 0))
            hourly_data[hour]["with_gridpulz"] += total_power
            hourly_data[hour]["count"] += 1
        
        # Simulate without GridPulz (add 15% more load)
        timeline = []
        prevented_overloads = 0
        
        for hour in sorted(hourly_data.keys()):
            data = hourly_data[hour]
            avg_with_gridpulz = data["with_gridpulz"] / max(data["count"], 1)
            avg_without = avg_with_gridpulz * 1.15  # Simulate 15% higher load without GridPulz
            
            overload_without = avg_without > (grid_analyzer.GRID_CAPACITY_KW * 0.9)
            overload_with = avg_with_gridpulz > (grid_analyzer.GRID_CAPACITY_KW * 0.9)
            
            if overload_without and not overload_with:
                prevented_overloads += 1
            
            timeline.append({
                "timestamp": hour.isoformat(),
                "with_gridpulz": round(avg_with_gridpulz, 2),
                "without_gridpulz": round(avg_without, 2),
                "difference": round(avg_without - avg_with_gridpulz, 2),
                "prevented_overload": overload_without and not overload_with,
            })
        
        return {
            "period_days": days,
            "timeline": timeline,
            "statistics": {
                "total_redirects": prevented_overloads * 3,  # Estimate
                "prevented_overloads": prevented_overloads,
                "average_load_reduction": round(sum(d["difference"] for d in timeline) / len(timeline), 2),
                "maximum_prevented_overload": round(max((d["without_gridpulz"] - grid_analyzer.GRID_CAPACITY_KW) for d in timeline if d["prevented_overload"]), 2) if any(d["prevented_overload"] for d in timeline) else 0,
            }
        }
        
    except Exception as e:
        print(f"Error in historical comparison: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/station-metrics")
async def get_station_metrics() -> Dict:
    """Get detailed metrics for all stations"""
    try:
        from backend.main import supabase_read
        
        if not supabase_read:
            raise HTTPException(status_code=503, detail="Database not available")
        
        metrics = {}
        
        for station_id in ["STATION_01", "STATION_02", "STATION_03"]:
            # Get latest data
            latest_response = supabase_read.table("station_live_data") \
                .select("*") \
                .eq("station_id", station_id) \
                .order("updated_at", desc=True) \
                .limit(1) \
                .execute()
            
            # Fallback to simulated data if no real data
            if latest_response.data:
                latest = latest_response.data[0]
            else:
                latest = simulated_data_generator.get_simulated_station_data(station_id)
                print(f"[DEBUG] Using SIMULATED data for {station_id}")
            
            # Get hourly average for last 24 hours
            from datetime import timedelta
            start_time = (datetime.now() - timedelta(hours=24)).isoformat()
            
            hourly_response = supabase_read.table("station_live_data") \
                .select("*") \
                .eq("station_id", station_id) \
                .gte("updated_at", start_time) \
                .execute()
            
            # Calculate metrics
            if latest:
                total_power = sum([
                    latest.get("plug1_power", 0),
                    latest.get("plug2_power", 0),
                    latest.get("plug3_power", 0),
                ])
                
                occupied = sum(1 for power in [
                    latest.get("plug1_power", 0),
                    latest.get("plug2_power", 0),
                    latest.get("plug3_power", 0),
                ] if power > 3)
                
                # Calculate hourly averages
                hourly_power = 0
                if hourly_response.data:
                    for record in hourly_response.data:
                        record_power = sum([
                            record.get("plug1_power", 0),
                            record.get("plug2_power", 0),
                            record.get("plug3_power", 0),
                        ])
                        hourly_power += record_power
                    
                    hourly_power = hourly_power / len(hourly_response.data)
                
                metrics[station_id] = {
                    "current_power": round(total_power, 2),
                    "current_utilization": round(grid_analyzer.calculate_utilization(station_id, total_power), 2),
                    "occupied_slots": occupied,
                    "available_slots": 3 - occupied,
                    "status": grid_analyzer.get_status(grid_analyzer.calculate_utilization(station_id, total_power)),
                    "hourly_average": round(hourly_power, 2),
                    "capacity": grid_analyzer.STATION_CONFIG[station_id]["capacity_kw"],
                    "location": grid_analyzer.STATION_CONFIG[station_id]["location"],
                    "last_update": latest.get("updated_at"),
                }
        
        return {
            "timestamp": datetime.now().isoformat(),
            "stations": metrics
        }
        
    except Exception as e:
        print(f"Error in station metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))
