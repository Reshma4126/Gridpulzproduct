"""
Models and Schemas for EV Charging API
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime


class PlugReading(BaseModel):
    """Schema for individual plug reading"""
    plug_number: int = Field(..., ge=1, le=3, description="Plug number (1, 2, or 3)")
    current_a: float = Field(..., ge=0, description="Current in Amperes")
    voltage_v: float = Field(..., ge=0, description="Voltage in Volts")
    power_w: float = Field(..., ge=0, description="Power in Watts")
    status: Literal['free', 'charging', 'fault'] = Field(
        ..., 
        description="Plug status"
    )


class StationDataPayload(BaseModel):
    """Schema for incoming station data from ESP32"""
    station_id: int = Field(..., description="Station ID from Supabase")
    timestamp: datetime = Field(..., description="Timestamp of data collection")
    plugs: List[PlugReading] = Field(..., description="List of plug readings")
    total_load_kw: float = Field(..., ge=0, description="Total station load in kW")
    free_slots: int = Field(..., ge=0, description="Number of free charging slots")

    class Config:
        json_schema_extra = {
            "example": {
                "station_id": 1,
                "timestamp": "2024-04-25T10:30:00Z",
                "plugs": [
                    {
                        "plug_number": 1,
                        "current_a": 32.5,
                        "voltage_v": 400,
                        "power_w": 22000,
                        "status": "charging"
                    }
                ],
                "total_load_kw": 22.0,
                "free_slots": 2
            }
        }


class StationSnapshot(BaseModel):
    """Schema for station snapshot with scoring"""
    station_id: int
    name: str
    latitude: float
    longitude: float
    total_load_kw: float
    load_pct: float = Field(..., ge=0, le=100, description="Load percentage")
    free_slots: int
    distance_km: Optional[float] = Field(None, description="Distance from user (km)")
    score: Optional[float] = Field(None, ge=0, le=1, description="ML score (0-1)")


class BestStationsResponse(BaseModel):
    """Schema for best stations response"""
    stations: List[StationSnapshot] = Field(..., description="Top stations sorted by score")
    generated_at: datetime = Field(
        default_factory=datetime.utcnow, 
        description="Timestamp when response was generated"
    )
    count: int = Field(..., description="Number of stations in response")

    class Config:
        json_schema_extra = {
            "example": {
                "stations": [
                    {
                        "station_id": 1,
                        "name": "Station Alpha",
                        "latitude": 40.7128,
                        "longitude": -74.0060,
                        "total_load_kw": 15.0,
                        "load_pct": 60.0,
                        "free_slots": 2,
                        "distance_km": 2.5,
                        "score": 0.85
                    }
                ],
                "generated_at": "2024-04-25T10:35:00Z",
                "count": 1
            }
        }


class StationDataResponse(BaseModel):
    """Response schema for station data submission"""
    status: str = "ok"
    recorded_at: datetime
    message: str = Field(..., description="Confirmation message")


class StationDataLegacy(BaseModel):
    """Legacy schema for simple flat station data (from ESP32)"""
    station_id: str
    voltage: float
    plug1_power: float
    plug2_power: float
    plug3_power: float
    plug1_status: str
    plug2_status: str
    plug3_status: str
