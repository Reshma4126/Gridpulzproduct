"""
EV Charging Station API - FastAPI Application
"""
import os
import random
import sys
from typing import Any, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from supabase import Client
from postgrest.exceptions import APIError
import logging
from pathlib import Path
from datetime import datetime, timezone

# Add parent directory to sys.path to handle running from backend directory
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

class StationData(BaseModel):
    station_id: str
    voltage: float
    plug1_power: float
    plug2_power: float
    plug3_power: float
    plug1_status: str
    plug2_status: str
    plug3_status: str
    data_source: str = Field(default="sensor", description="Data source: 'sensor' for real ESP32, 'simulated' for test data")


try:
    import numpy as np
    import pandas as pd
except ImportError as e:
    print(f"Failed to import required libraries: {e}")
    np = None
    pd = None

try:
    import joblib
except Exception:
    joblib = None

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env", override=False)
except Exception:
    pass


from backend.routers import station_data, best_stations
from backend.db.supabase_client import supabase

# Use the same client for both read and write for now
supabase_write = supabase
supabase_read = supabase

# ============================================
# Pydantic Models - Must be defined before endpoints
# ============================================

class StationRegistration(BaseModel):
    email: str
    name: str
    contact: str
    address: str
    latitude: float
    longitude: float
    num_plugs: int
    charging_type: str
    connector_type: str
    total_capacity_kw: float
    voltage: float
    max_current: float
    meter_available: bool
    communication_type: str
    operating_hours: str
    avg_usage: float


class EmergencyRerouteRequest(BaseModel):
    operator_email: str
    predicted_load_kw: float
    load_reduction_percent: float = 50.0
    duration_seconds: int = 60

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="EV Charging Station API",
    description="Backend API for smart EV charging network monitoring and optimization",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add station live data endpoint for ESP32 monitoring (before static files)
@app.get("/station-live")
async def get_station_live_data():
    """Get latest station data for monitoring"""
    try:
        response = supabase_read.table("station_live_data") \
            .select("*") \
            .order("updated_at", desc=True) \
            .limit(10) \
            .execute()

        if response.data:
            # Count real vs simulated data
            real_count = sum(1 for item in response.data if item.get("data_source") == "sensor")
            simulated_count = sum(1 for item in response.data if item.get("data_source") == "simulated")

            return {
                "status": "success",
                "data": response.data,
                "count": len(response.data),
                "data_sources": {
                    "sensor": real_count,
                    "simulated": simulated_count
                },
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        else:
            return {
                "status": "success",
                "data": [],
                "count": 0,
                "data_sources": {
                    "sensor": 0,
                    "simulated": 0
                },
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
    except Exception as e:
        logger.error(f"Error fetching station live data: {e}")
        return {
            "status": "error",
            "message": str(e),
            "data": [],
            "count": 0,
            "data_sources": {
                "sensor": 0,
                "simulated": 0
            }
        }


@app.post("/station-live")
async def receive_station_data(station_data: StationData):
    """Receive station data from ESP32"""
    try:
        client = supabase_write or supabase_read
        if client is None:
            return {"status": "error", "message": "Database not available"}
        
        # Insert data into database
        response = client.table("station_live_data").insert({
            "station_id": station_data.station_id,
            "voltage": station_data.voltage,
            "plug1_power": station_data.plug1_power,
            "plug2_power": station_data.plug2_power,
            "plug3_power": station_data.plug3_power,
            "plug1_status": station_data.plug1_status,
            "plug2_status": station_data.plug2_status,
            "plug3_status": station_data.plug3_status,
            "data_source": station_data.data_source,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).execute()
        
        logger.info(f"Received station data from {station_data.station_id}")
        return {
            "status": "success",
            "message": "Station data received",
            "station_id": station_data.station_id,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error receiving station data: {e}")
        return {
            "status": "error",
            "message": str(e)
        }


@app.on_event("startup")
async def startup_event():
    """Log startup message"""
    logger.info("EV Charging API started successfully")
    logger.info(f"API documentation available at /api/docs")


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "ok",
        "service": "EV Charging Station API"
    }


@app.get("/")
async def root():
    """Root endpoint with API info"""
    return {
        "name": "EV Charging Station API",
        "version": "1.0.0",
        "docs": "/api/docs",
        "health": "/health"
    }


@app.post("/test/simulate-3-stations")
def simulate_3_stations(scenario: str = "normal"):
    """
    Simulate data for 3 stations with different scenarios:
    - normal: Normal load distribution
    - overload: Overload scenario on one station
    - redistribute: Show load redistribution
    """
    import random

    client = supabase_write or supabase_read
    if not client:
        return {"error": "Database not available"}

    stations = ["STATION_01", "STATION_02", "STATION_03"]
    inserted_data = []

    if scenario == "normal":
        # Normal load distribution
        scenarios = [
            {
                "station_id": "STATION_01",
                "plug1_power": 65, "plug2_power": 70, "plug3_power": 0,
                "plug1_status": "occupied", "plug2_status": "occupied", "plug3_status": "free"
            },
            {
                "station_id": "STATION_02",
                "plug1_power": 55, "plug2_power": 0, "plug3_power": 60,
                "plug1_status": "occupied", "plug2_status": "free", "plug3_status": "occupied"
            },
            {
                "station_id": "STATION_03",
                "plug1_power": 0, "plug2_power": 75, "plug3_power": 0,
                "plug1_status": "free", "plug2_status": "occupied", "plug3_status": "free"
            }
        ]
    elif scenario == "overload":
        # Overload scenario - STATION_01 overloaded
        scenarios = [
            {
                "station_id": "STATION_01",
                "plug1_power": 75, "plug2_power": 85, "plug3_power": 80,
                "plug1_status": "occupied", "plug2_status": "occupied", "plug3_status": "occupied"
            },
            {
                "station_id": "STATION_02",
                "plug1_power": 30, "plug2_power": 0, "plug3_power": 25,
                "plug1_status": "occupied", "plug2_status": "free", "plug3_status": "occupied"
            },
            {
                "station_id": "STATION_03",
                "plug1_power": 0, "plug2_power": 35, "plug3_power": 0,
                "plug1_status": "free", "plug2_status": "occupied", "plug3_status": "free"
            }
        ]
    elif scenario == "redistribute":
        # After redistribution - balanced load
        scenarios = [
            {
                "station_id": "STATION_01",
                "plug1_power": 65, "plug2_power": 70, "plug3_power": 0,
                "plug1_status": "occupied", "plug2_status": "occupied", "plug3_status": "free"
            },
            {
                "station_id": "STATION_02",
                "plug1_power": 60, "plug2_power": 55, "plug3_power": 0,
                "plug1_status": "occupied", "plug2_status": "occupied", "plug3_status": "free"
            },
            {
                "station_id": "STATION_03",
                "plug1_power": 50, "plug2_power": 55, "plug3_power": 0,
                "plug1_status": "occupied", "plug2_status": "occupied", "plug3_status": "free"
            }
        ]
    else:
        return {"error": "Invalid scenario. Use: normal, overload, or redistribute"}

    for station_data in scenarios:
        row = station_data.copy()
        row["voltage"] = 230.0 + random.uniform(-5, 5)
        row["updated_at"] = datetime.now(timezone.utc).isoformat()
        try:
            response = client.table("station_live_data").insert(row).execute()
            inserted_data.append(row)
        except Exception as e:
            print(f"Error inserting data for {station_data['station_id']}: {e}")

    # Calculate total load
    total_load = sum(d["plug1_power"] + d["plug2_power"] + d["plug3_power"] for d in inserted_data)
    grid_capacity = 200000  # 200 kW in Watts
    load_percentage = (total_load / grid_capacity) * 100

    return {
        "message": f"Simulated {scenario} scenario for 3 stations",
        "scenario": scenario,
        "stations": inserted_data,
        "total_load_watts": total_load,
        "total_load_kw": round(total_load / 1000, 2),
        "grid_capacity_kw": 200,
        "load_percentage": round(load_percentage, 2),
        "status": "CRITICAL" if load_percentage > 80 else "WARNING" if load_percentage > 60 else "NORMAL"
    }


# ============================================
# API ENDPOINTS - Must be defined BEFORE static mount
# ============================================

@app.get("/api/grid-prediction")
def get_grid_prediction():
    """Get grid load prediction using ML model and live station data.
    Falls back to simulated data if no real data is available."""
    client = supabase_write or supabase_read
    if client is None:
        # Fallback to simulated data if no database (stay below 50kW threshold)
        print("No database, using simulated data")
        current_load_watts = random.uniform(10000, 45000)  # 10-45 kW
        active_sessions = random.randint(2, 6)
        predicted_load_watts = estimate_without_model(current_load_watts, active_sessions, 50000.0)  # Cap at 50kW
        return {
            "current_load_watts": round(current_load_watts, 2),
            "predicted_load_watts": round(predicted_load_watts, 2),
            "active_sessions": active_sessions,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "model_used": "simulated",
            "data_source": "simulated"
        }

    try:
        # Get latest station data
        response = client.table("station_live_data").select("*").order("updated_at", desc=True).limit(10).execute()

        # Check if we have real sensor data (data_source == "sensor")
        has_real_data = any(item.get("data_source") == "sensor" for item in response.data) if response.data else False

        if not response.data or not has_real_data:
            # No real data available, use simulated data (stay below 50kW threshold)
            print("No real sensor data, using simulated data")
            current_load_watts = random.uniform(10000, 45000)  # 10-45 kW
            active_sessions = random.randint(2, 6)
            predicted_load_watts = estimate_without_model(current_load_watts, active_sessions, 50000.0)  # Cap at 50kW
            return {
                "current_load_watts": round(current_load_watts, 2),
                "predicted_load_watts": round(predicted_load_watts, 2),
                "active_sessions": active_sessions,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "model_used": "simulated",
                "data_source": "simulated"
            }

        # Calculate current load and active sessions (working in Watts)
        total_load_watts = 0.0
        active_sessions = 0

        for station in response.data:
            station_load_watts = (
                station.get("plug1_power", 0) +
                station.get("plug2_power", 0) +
                station.get("plug3_power", 0)
            )
            total_load_watts += station_load_watts

            # Count active sessions
            if station.get("plug1_status") == "occupied":
                active_sessions += 1
            if station.get("plug2_status") == "occupied":
                active_sessions += 1
            if station.get("plug3_status") == "occupied":
                active_sessions += 1

        current_load_watts = total_load_watts  # Keep in Watts

        # Use ML model if available and we have real station data
        model_used = "ML"
        if ml_model is not None and len(response.data) > 0:
            try:
                # Create feature vector from real station data
                hour = datetime.now().hour
                day_of_week = datetime.now().weekday()

                # Get historical loads from recent station data (in Watts)
                historical_loads_watts = []
                for i, station in enumerate(response.data[-7:]):  # Last 7 readings
                    station_load_watts = (
                        station.get("plug1_power", 0) +
                        station.get("plug2_power", 0) +
                        station.get("plug3_power", 0)
                    )  # Keep in Watts
                    historical_loads_watts.append(station_load_watts)

                # Pad historical loads if less than 7 (use current load)
                while len(historical_loads_watts) < 7:
                    historical_loads_watts.append(current_load_watts)

                # Create feature vector matching ML model expectations (working in Watts)
                # Model expects: ['hour', 'day_of_week', 'is_weekend', 'is_peak_hour', 'active_sessions', 'avg_power_kw', 'energy_kwh', 'previous_load', 'load_5min_ago', 'load_15min_ago', 'rolling_avg_load']
                is_weekend = 1.0 if day_of_week >= 5 else 0.0
                is_peak_hour = 1.0 if (9 <= hour <= 11) or (17 <= hour <= 19) else 0.0
                avg_power_watts = current_load_watts / max(active_sessions, 1)
                energy_kwh = (current_load_watts / 1000.0) * 0.083  # Convert to kWh for energy calculation
                previous_load_watts = historical_loads_watts[0] if len(historical_loads_watts) > 0 else current_load_watts
                load_5min_ago_watts = historical_loads_watts[1] if len(historical_loads_watts) > 1 else current_load_watts
                load_15min_ago_watts = historical_loads_watts[3] if len(historical_loads_watts) > 3 else current_load_watts
                rolling_avg_load_watts = sum(historical_loads_watts[:5]) / min(len(historical_loads_watts), 5) if historical_loads_watts else current_load_watts

                # Convert Watts to kW for ML model (model was trained on kW)
                current_load_kw = current_load_watts / 1000.0
                avg_power_kw = avg_power_watts / 1000.0
                previous_load_kw = previous_load_watts / 1000.0
                load_5min_ago_kw = load_5min_ago_watts / 1000.0
                load_15min_ago_kw = load_15min_ago_watts / 1000.0
                rolling_avg_load_kw = rolling_avg_load_watts / 1000.0

                feature_vector = [
                    float(hour),
                    float(day_of_week),
                    float(is_weekend),
                    float(is_peak_hour),
                    float(active_sessions),
                    float(avg_power_kw),
                    float(energy_kwh),
                    float(previous_load_kw),
                    float(load_5min_ago_kw),
                    float(load_15min_ago_kw),
                    float(rolling_avg_load_kw)
                ]
                
                # Create DataFrame with correct column names
                columns = [
                    "hour",
                    "day_of_week",
                    "is_weekend",
                    "is_peak_hour",
                    "active_sessions",
                    "avg_power_kw",
                    "energy_kwh",
                    "previous_load",
                    "load_5min_ago",
                    "load_15min_ago",
                    "rolling_avg_load"
                ]
                
                features_df = pd.DataFrame([feature_vector], columns=columns)
                prediction = ml_model.predict(features_df)[0]
                predicted_load_kw = float(prediction)
                # Convert prediction back to Watts for response
                predicted_load_watts = predicted_load_kw * 1000.0
                print(f"ML Prediction: {predicted_load_watts:.0f}W (Current: {current_load_watts:.0f}W, Sessions: {active_sessions})")
            except Exception as e:
                print(f"ML prediction error: {e}")
                predicted_load_watts = estimate_without_model(current_load_watts, active_sessions, 100000.0)
                model_used = "fallback"
        else:
            predicted_load_watts = estimate_without_model(current_load_watts, active_sessions, 100000.0)
            model_used = "fallback"
        
        return {
            "current_load_watts": round(current_load_watts, 2),
            "predicted_load_watts": round(predicted_load_watts, 2),
            "active_sessions": active_sessions,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "model_used": model_used,
            "data_source": "sensor"
        }
        
    except Exception as exc:
        # Fallback to simulated data on error (stay below 50kW threshold)
        print(f"Error fetching real data, using simulated: {exc}")
        current_load_watts = random.uniform(10000, 45000)  # 10-45 kW
        active_sessions = random.randint(2, 6)
        predicted_load_watts = estimate_without_model(current_load_watts, active_sessions, 50000.0)  # Cap at 50kW
        return {
            "current_load_watts": round(current_load_watts, 2),
            "predicted_load_watts": round(predicted_load_watts, 2),
            "active_sessions": active_sessions,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "model_used": "simulated",
            "data_source": "simulated"
        }


@app.get("/api/station-status/{email}")
def get_station_status(email: str):
    """Get station status with simulated data fallback if no real data available."""
    client = supabase_write or supabase_read
    
    # Default simulated station data if no database
    default_station = {
        "station_name": "GridPulz Node 04",
        "location": "Sector 12, Chennai",
        "total_capacity_kw": 180.0,
        "total_plugs": 12,
    }
    
    if client is None:
        # Use simulated data if no database (stay below 50kW threshold)
        print("No database, using simulated station data")
        total_capacity_kw = default_station["total_capacity_kw"]
        num_plugs = default_station["total_plugs"]
        active_sessions = random.randint(0, num_plugs)
        current_load_kw = random.uniform(10, 45)  # 10-45 kW to stay below 50kW threshold
        predicted_load_kw = estimate_without_model(current_load_kw * 1000, active_sessions, 50000.0) / 1000  # Cap at 50kW
        return {
            "station_name": default_station["station_name"],
            "location": default_station["location"],
            "total_capacity_kw": total_capacity_kw,
            "total_plugs": num_plugs,
            "current_load_kw": round(current_load_kw, 2),
            "predicted_load_kw": round(predicted_load_kw, 2),
            "active_sessions": active_sessions,
            "model_fallback": ml_model is None,
            "model_error": model_load_error,
            "data_source": "simulated"
        }

    try:
        result = (
            client.table("stations")
            .select("*")
            .ilike("email", email)
            .limit(1)
            .execute()
        )
    except APIError as exc:
        # Fallback to simulated data on error (stay below 50kW threshold)
        print(f"Station query failed, using simulated data: {exc}")
        total_capacity_kw = default_station["total_capacity_kw"]
        num_plugs = default_station["total_plugs"]
        active_sessions = random.randint(0, num_plugs)
        current_load_kw = random.uniform(10, 45)  # 10-45 kW to stay below 50kW threshold
        predicted_load_kw = estimate_without_model(current_load_kw * 1000, active_sessions, 50000.0) / 1000  # Cap at 50kW
        return {
            "station_name": default_station["station_name"],
            "location": default_station["location"],
            "total_capacity_kw": total_capacity_kw,
            "total_plugs": num_plugs,
            "current_load_kw": round(current_load_kw, 2),
            "predicted_load_kw": round(predicted_load_kw, 2),
            "active_sessions": active_sessions,
            "model_fallback": ml_model is None,
            "model_error": model_load_error,
            "data_source": "simulated"
        }

    station = (result.data or [None])[0] if isinstance(result.data, list) else result.data
    if not station:
        # Station not found, use simulated data (stay below 50kW threshold)
        print(f"Station not found for {email}, using simulated data")
        total_capacity_kw = default_station["total_capacity_kw"]
        num_plugs = default_station["total_plugs"]
        active_sessions = random.randint(0, num_plugs)
        current_load_kw = random.uniform(10, 45)  # 10-45 kW to stay below 50kW threshold
        predicted_load_kw = estimate_without_model(current_load_kw * 1000, active_sessions, 50000.0) / 1000  # Cap at 50kW
        return {
            "station_name": default_station["station_name"],
            "location": default_station["location"],
            "total_capacity_kw": total_capacity_kw,
            "total_plugs": num_plugs,
            "current_load_kw": round(current_load_kw, 2),
            "predicted_load_kw": round(predicted_load_kw, 2),
            "active_sessions": active_sessions,
            "model_fallback": ml_model is None,
            "model_error": model_load_error,
            "data_source": "simulated"
        }

    # Support schema variants and prior typo variants found in this project.
    total_capacity_kw = float(
        station.get("total_capacity_kw")
        or station.get("total_ capacity_kw")
        or station.get("total_capacity _kw")
        or station.get("total_capacity_kv")
        or station.get("power_capacity_kw")
        or 0
    )
    num_plugs = int(station.get("num_plugs") or 0)

    active_sessions = random.randint(0, max(0, num_plugs))
    features_df, current_load_kw = simulate_sensor_data(total_capacity_kw, active_sessions)

    predicted_load_kw: float
    if ml_model is not None:
        try:
            prediction = ml_model.predict(features_df)
            raw_val = float(np.asarray(prediction).flatten()[0])
            predicted_load_kw = float(round(max(0.0, min(total_capacity_kw, raw_val)), 2))
        except Exception:
            predicted_load_kw = estimate_without_model(current_load_kw, active_sessions, total_capacity_kw)
    else:
        predicted_load_kw = estimate_without_model(current_load_kw, active_sessions, total_capacity_kw)

    return {
        "station_name": station.get("name") or "Unnamed Station",
        "location": station.get("address") or "Unknown Location",
        "total_capacity_kw": total_capacity_kw,
        "total_plugs": num_plugs,
        "current_load_kw": current_load_kw,
        "predicted_load_kw": predicted_load_kw,
        "active_sessions": active_sessions,
        "model_fallback": ml_model is None,
        "model_error": model_load_error,
        "data_source": "simulated"  # Since simulate_sensor_data is used
    }


@app.post("/api/register-station")
def register_station(payload: StationRegistration):
    client = supabase_write or supabase_read
    if client is None:
        raise HTTPException(
            status_code=500,
            detail="Supabase client is not configured. Set SUPABASE_URL and SUPABASE_KEY in .env and restart run_backend.bat.",
        )

    if client == supabase_read and SUPABASE_SERVICE_ROLE_KEY == "":
        raise HTTPException(
            status_code=500,
            detail="Station registration needs SUPABASE_SERVICE_ROLE_KEY to bypass RLS, or an authenticated insert policy on stations.",
        )

    inserted = _insert_station_payload(client, payload.model_dump())
    return {"ok": True, "station": inserted}


@app.post("/api/emergency-reroute")
def emergency_reroute(payload: EmergencyRerouteRequest):
    # Placeholder action hook. Real-world implementations should call a control plane.
    return {
        "ok": True,
        "status": "reroute_initiated",
        "operator_email": payload.operator_email,
        "predicted_load_kw": payload.predicted_load_kw,
        "load_reduction_percent": payload.load_reduction_percent,
        "duration_seconds": payload.duration_seconds,
        "message": "Emergency load balancing command accepted.",
    }


# Include routers (after all direct endpoint definitions, before static files)
app.include_router(station_data.router)  # No prefix for ESP32 compatibility
app.include_router(best_stations.router, prefix="/api")

# Include grid analytics router
try:
    from backend.routes.grid_analytics import router as grid_analytics_router
    app.include_router(grid_analytics_router)
except ImportError:
    logger.warning("Grid analytics router not found, skipping...")

# Mount static files for frontend at root (API routes registered first)
frontend_path = Path(__file__).parent.parent / "frontend"
app.mount("/", StaticFiles(directory=str(frontend_path), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host=host, port=port, reload=True)


def _insert_station_payload(client: Client, payload: dict[str, Any]) -> Any:
    payloads = [
        {**payload, "total_capacity_kv": payload["total_capacity_kw"], "communication_t": payload["communication_type"]},
        {**payload, "total_capacity_kw": payload["total_capacity_kw"], "communication_t": payload["communication_type"]},
        {**payload, "power_capacity_kw": payload["total_capacity_kw"], "communication_t": payload["communication_type"]},
        {**payload, "total_capacity_kv": payload["total_capacity_kw"], "communication_type": payload["communication_type"]},
        {**payload, "total_capacity_kw": payload["total_capacity_kw"], "communication_type": payload["communication_type"]},
        {**payload, "power_capacity_kw": payload["total_capacity_kw"], "communication_type": payload["communication_type"]},
        dict(payload),
    ]

    existing_row_id: Optional[Any] = None
    try:
        existing = (
            client.table("stations")
            .select("id")
            .ilike("email", str(payload.get("email", "")))
            .limit(1)
            .execute()
        )
        if isinstance(existing.data, list) and existing.data:
            existing_row_id = existing.data[0].get("id")
    except APIError:
        existing_row_id = None

    last_error: Optional[Any] = None
    for variant in payloads:
        try:
            if existing_row_id is not None:
                result = client.table("stations").update(variant).eq("id", existing_row_id).execute()
            else:
                result = client.table("stations").insert([variant]).execute()
        except APIError as exc:
            last_error = exc
            # Missing-column variants should continue trying alternative payload keys.
            if "PGRST204" in str(exc):
                continue
            break

        if result.data:
            return result.data[0] if isinstance(result.data, list) else result.data
        last_error = result.error

        if last_error is None:
            continue
        if getattr(last_error, "code", None) == "PGRST204":
            continue
        break

    raise HTTPException(status_code=400, detail=f"Station insert failed: {last_error}")


def _find_model_path() -> Optional[Path]:
    candidates = [
        Path(__file__).resolve().parent / "ev_model.pkl",
        Path(__file__).resolve().parent.parent / "ev_model.pkl",
        Path(__file__).resolve().parent.parent / "frontend" / "ml model" / "ev_model.pkl",
        Path(__file__).resolve().parent.parent / "old" / "ev_model" / "ev_model.pkl",
        Path(__file__).resolve().parent.parent / "old" / "gridpulz ui" / "ev_model" / "ev_model.pkl",
    ]
    for p in candidates:
        if p.exists():
            return p
    return None


ml_model: Any = None
model_load_error: Optional[str] = None

try:
    model_path = _find_model_path()
    if model_path is None:
        raise FileNotFoundError("ev_model.pkl not found")

    print(f"Loading ML model from: {model_path}")
    
    if joblib is not None:
        ml_model = joblib.load(model_path)
    else:
        import pickle

        with open(model_path, "rb") as f:
            ml_model = pickle.load(f)
    
    print(f"ML model loaded successfully: {type(ml_model)}")
except Exception as exc:  # pragma: no cover
        ml_model = None
        model_load_error = str(exc)
        print(f"Failed to load ML model: {exc}")


def simulate_sensor_data(capacity: float, active_sessions: int) -> tuple["Any", float]:
    hour = datetime.now().hour
    day_of_week = datetime.now().weekday()

    base_draw = active_sessions * random.uniform(10.0, 30.0)
    jitter = random.uniform(-3.0, 3.0)
    current_power_draw = max(0.0, min(capacity, base_draw + jitter))

    historical_loads = []
    for _ in range(7):
        drift = random.uniform(-10.0, 10.0)
        historical_loads.append(max(0.0, min(capacity, current_power_draw + drift)))

    feature_vector = [
        float(hour),
        float(day_of_week),
        float(active_sessions),
        float(current_power_draw),
        *[float(v) for v in historical_loads],
    ]

    columns = [
        "hour",
        "day_of_week",
        "active_sessions",
        "current_power_draw",
        "historical_load_1",
        "historical_load_2",
        "historical_load_3",
        "historical_load_4",
        "historical_load_5",
        "historical_load_6",
        "historical_load_7",
    ]

    features_df = pd.DataFrame([feature_vector], columns=columns)
    return features_df, float(round(current_power_draw, 2))


def estimate_without_model(current_load_watts: float, active_sessions: int, capacity_watts: float) -> float:
    trend = random.uniform(2000.0, 8000.0)  # Watts
    session_factor = active_sessions * random.uniform(500.0, 2000.0)  # Watts
    estimate = current_load_watts + trend + session_factor
    return float(round(max(0.0, min(capacity_watts, estimate)), 2))


@app.post("/test/send-station-data")
def test_send_station_data():
    """Test endpoint to simulate ESP32 sending real data"""
    import random

    # Simulate realistic ESP32 data (lamp simulation in Watts)
    test_data = {
        "station_id": "STATION_01",
        "voltage": 230.0 + random.uniform(-5, 5),
        "plug1_power": random.choice([0, 55, 65, 75]),  # Watts (lamp simulation)
        "plug2_power": random.choice([0, 60, 70, 85]),   # Watts (lamp simulation)
        "plug3_power": random.choice([0, 0, 55, 80]),     # Watts (lamp simulation)
        "plug1_status": "occupied" if random.random() > 0.4 else "free",
        "plug2_status": "occupied" if random.random() > 0.3 else "free",
        "plug3_status": "occupied" if random.random() > 0.6 else "free",
    }

    # Store in database like real ESP32 (keep in Watts)
    client = supabase_write or supabase_read
    if client:
        row = test_data.copy()
        # Keep in Watts (no conversion)
        row["updated_at"] = datetime.now(timezone.utc).isoformat()
        response = client.table("station_live_data").insert(row).execute()
        return {"message": "Test data sent", "data": row}
    
    return {"error": "Database not available"}


@app.post("/test/simulate-3-stations")
def simulate_3_stations(scenario: str = "normal"):
    """
    Simulate data for 3 stations with different scenarios:
    - normal: Normal load distribution
    - overload: Overload scenario on one station
    - redistribute: Show load redistribution
    """
    import random

    client = supabase_write or supabase_read
    if not client:
        return {"error": "Database not available"}

    stations = ["STATION_01", "STATION_02", "STATION_03"]
    inserted_data = []

    if scenario == "normal":
        # Normal load distribution
        scenarios = [
            {
                "station_id": "STATION_01",
                "plug1_power": 65, "plug2_power": 70, "plug3_power": 0,
                "plug1_status": "occupied", "plug2_status": "occupied", "plug3_status": "free"
            },
            {
                "station_id": "STATION_02",
                "plug1_power": 55, "plug2_power": 0, "plug3_power": 60,
                "plug1_status": "occupied", "plug2_status": "free", "plug3_status": "occupied"
            },
            {
                "station_id": "STATION_03",
                "plug1_power": 0, "plug2_power": 75, "plug3_power": 0,
                "plug1_status": "free", "plug2_status": "occupied", "plug3_status": "free"
            }
        ]
    elif scenario == "overload":
        # Overload scenario - STATION_01 overloaded
        scenarios = [
            {
                "station_id": "STATION_01",
                "plug1_power": 75, "plug2_power": 85, "plug3_power": 80,
                "plug1_status": "occupied", "plug2_status": "occupied", "plug3_status": "occupied"
            },
            {
                "station_id": "STATION_02",
                "plug1_power": 30, "plug2_power": 0, "plug3_power": 25,
                "plug1_status": "occupied", "plug2_status": "free", "plug3_status": "occupied"
            },
            {
                "station_id": "STATION_03",
                "plug1_power": 0, "plug2_power": 35, "plug3_power": 0,
                "plug1_status": "free", "plug2_status": "occupied", "plug3_status": "free"
            }
        ]
    elif scenario == "redistribute":
        # After redistribution - balanced load
        scenarios = [
            {
                "station_id": "STATION_01",
                "plug1_power": 65, "plug2_power": 70, "plug3_power": 0,
                "plug1_status": "occupied", "plug2_status": "occupied", "plug3_status": "free"
            },
            {
                "station_id": "STATION_02",
                "plug1_power": 60, "plug2_power": 55, "plug3_power": 0,
                "plug1_status": "occupied", "plug2_status": "occupied", "plug3_status": "free"
            },
            {
                "station_id": "STATION_03",
                "plug1_power": 50, "plug2_power": 55, "plug3_power": 0,
                "plug1_status": "occupied", "plug2_status": "occupied", "plug3_status": "free"
            }
        ]
    else:
        return {"error": "Invalid scenario. Use: normal, overload, or redistribute"}

    for station_data in scenarios:
        row = station_data.copy()
        row["voltage"] = 230.0 + random.uniform(-5, 5)
        row["updated_at"] = datetime.now(timezone.utc).isoformat()
        try:
            response = client.table("station_live_data").insert(row).execute()
            inserted_data.append(row)
        except Exception as e:
            print(f"Error inserting data for {station_data['station_id']}: {e}")

    # Calculate total load
    total_load = sum(d["plug1_power"] + d["plug2_power"] + d["plug3_power"] for d in inserted_data)
    grid_capacity = 200000  # 200 kW in Watts
    load_percentage = (total_load / grid_capacity) * 100

    return {
        "message": f"Simulated {scenario} scenario for 3 stations",
        "scenario": scenario,
        "stations": inserted_data,
        "total_load_watts": total_load,
        "total_load_kw": round(total_load / 1000, 2),
        "grid_capacity_kw": 200,
        "load_percentage": round(load_percentage, 2),
        "status": "CRITICAL" if load_percentage > 80 else "WARNING" if load_percentage > 60 else "NORMAL"
    }
