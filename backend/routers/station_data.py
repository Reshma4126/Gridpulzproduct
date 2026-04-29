"""
Router for receiving and storing station charging data from ESP32 devices
"""
from fastapi import APIRouter, Header, Depends, BackgroundTasks, HTTPException
from datetime import datetime
import os
import json
from typing import Optional

from backend.models.schemas import StationDataPayload, StationDataResponse, StationDataLegacy
from backend.db.supabase_client import supabase

router = APIRouter(tags=["station-data"])

# Load API secret from environment
API_SECRET_KEY = os.getenv('API_SECRET_KEY', 'gridpulz-esp32-secret-key-12345678')


def verify_api_key(authorization: Optional[str] = Header(None), x_api_key: Optional[str] = Header(None)) -> bool:
    """Verify Bearer token or x-api-key matches API_SECRET_KEY"""
    # Try x-api-key first (from ESP32)
    if x_api_key == API_SECRET_KEY:
        return True
        
    # Try Bearer token
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header or x-api-key")
    
    parts = authorization.split()
    if len(parts) == 2 and parts[0].lower() == 'bearer':
        token = parts[1]
        if token == API_SECRET_KEY:
            return True
    
    raise HTTPException(status_code=401, detail="Invalid API key")


async def save_station_data_background(payload: StationDataPayload) -> None:
    """Background task to save station data to Supabase"""
    try:
        # 1. Insert readings for each plug (append-only)
        readings_data = []
        free_slots_count = 0
        
        for plug in payload.plugs:
            reading = {
                'station_id': payload.station_id,
                'plug_number': plug.plug_number,
                'current_a': plug.current_a,
                'voltage_v': plug.voltage_v,
                'power_w': plug.power_w,
                'status': plug.status,
                'recorded_at': payload.timestamp.isoformat()
            }
            readings_data.append(reading)
            
            # Count free slots
            if plug.status == 'free':
                free_slots_count += 1
        
        # Insert readings
        if readings_data:
            supabase.table('readings').insert(readings_data).execute()
        
        # 2. Upsert plug_status (station_id + plug_number conflict)
        for plug in payload.plugs:
            plug_status_data = {
                'station_id': payload.station_id,
                'plug_number': plug.plug_number,
                'status': plug.status,
                'current_a': plug.current_a,
                'voltage_v': plug.voltage_v,
                'power_w': plug.power_w,
                'updated_at': datetime.utcnow().isoformat()
            }
            
            supabase.table('plug_status').upsert(
                plug_status_data,
                on_conflict=['station_id', 'plug_number']
            ).execute()
        
        # 3. Upsert station_snapshots (conflict on station_id)
        plug_states = [
            {
                'plug_number': p.plug_number,
                'status': p.status,
                'power_w': p.power_w,
                'current_a': p.current_a,
                'voltage_v': p.voltage_v
            }
            for p in payload.plugs
        ]
        
        snapshot_data = {
            'station_id': payload.station_id,
            'total_load_kw': payload.total_load_kw,
            'free_slots': free_slots_count,
            'plug_states': plug_states,
            'updated_at': datetime.utcnow().isoformat()
        }
        
        # Fetch current station capacity to calculate load_pct
        station = supabase.table('stations').select(
            'total_capacity_kw'
        ).eq('id', payload.station_id).single().execute()
        
        if station.data and station.data.get('total_capacity_kw'):
            capacity_kw = station.data['total_capacity_kw']
            snapshot_data['load_pct'] = min(
                100.0, 
                (payload.total_load_kw / capacity_kw * 100) if capacity_kw > 0 else 0
            )
        else:
            snapshot_data['load_pct'] = 0
        
        supabase.table('station_snapshots').upsert(
            snapshot_data,
            on_conflict=['station_id']
        ).execute()
        
        print(f"✓ Successfully stored data for station {payload.station_id}")
        
    except Exception as e:
        print(f"❌ Error saving station data: {str(e)}")


@router.post("/station-data", response_model=StationDataResponse)
async def receive_station_data(
    payload: StationDataPayload,
    background_tasks: BackgroundTasks,
    _: bool = Depends(verify_api_key)
) -> StationDataResponse:
    """
    Receive and store charging data from ESP32 station devices.
    
    - Validates Bearer token from Authorization header
    - Validates payload using StationDataPayload schema
    - Inserts readings and updates snapshots in background
    - Returns immediately with 200 OK
    
    Args:
        payload: Station data payload
        background_tasks: FastAPI background task manager
        
    Returns:
        Confirmation response with timestamp
    """
    recorded_at = datetime.utcnow()
    
    # Add background task (doesn't block response)
    background_tasks.add_task(save_station_data_background, payload)
    
    return StationDataResponse(
        status="ok",
        recorded_at=recorded_at,
        message=f"Data for station {payload.station_id} queued for processing"
    )


@router.post("/update")
@router.post("/station/update")
async def legacy_update_station(
    data: StationDataLegacy,
    _: bool = Depends(verify_api_key)
):
    """Legacy endpoint for flat ESP32 data (compatible with existing firmware)"""
    # Keep data in Watts (no conversion)
    row = data.model_dump()
    row["updated_at"] = datetime.utcnow().isoformat()

    # Log the data being sent
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Attempting to insert station data: {row}")

    # Try to insert with data_source first
    try:
        result = supabase.table("station_live_data").insert(row).execute()
        logger.info(f"Successfully inserted station data")
        return {
            "message": "Station data stored successfully",
            "data": row,
            "data_source": row.get("data_source", "sensor")
        }
    except Exception as exc:
        logger.error(f"Error inserting station data: {exc}")
        # If data_source field causes error, try without it
        if "data_source" in str(exc) or "column" in str(exc).lower():
            row_without_source = {k: v for k, v in row.items() if k != "data_source"}
            logger.info(f"Retrying without data_source field: {row_without_source}")
            try:
                result = supabase.table("station_live_data").insert(row_without_source).execute()
                logger.info(f"Successfully inserted station data without data_source")
                return {
                    "message": "Station data stored successfully",
                    "data": row_without_source,
                    "data_source": "sensor"
                }
            except Exception as exc2:
                logger.error(f"Error inserting without data_source: {exc2}")
                raise HTTPException(status_code=500, detail=f"Database error: {str(exc2)}")
        else:
            raise HTTPException(status_code=500, detail=f"Database error: {str(exc)}")
