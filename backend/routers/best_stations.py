"""
Router for finding best charging stations based on user location and preferences
"""
from fastapi import APIRouter, Query, Depends, HTTPException
from datetime import datetime
from typing import Optional
import os
from jose import JWTError, jwt

from backend.models.schemas import BestStationsResponse, StationSnapshot
from backend.models.ml_scorer import score_stations
from backend.db.supabase_client import supabase

router = APIRouter(prefix="/api", tags=["best-stations"])

# JWT configuration
SUPABASE_JWT_SECRET = os.getenv('SUPABASE_JWT_SECRET', '')


def verify_supabase_jwt(authorization: Optional[str] = None) -> dict:
    """
    Verify Supabase JWT token from Authorization header.
    
    Args:
        authorization: Authorization header value (Bearer token)
        
    Returns:
        Decoded JWT payload
        
    Raises:
        HTTPException: If token is invalid or missing
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != 'bearer':
        raise HTTPException(status_code=401, detail="Invalid Authorization header format")
    
    token = parts[1]
    
    try:
        # Verify and decode JWT
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=['HS256']
        )
        return payload
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")


@router.get("/best-stations", response_model=BestStationsResponse)
async def get_best_stations(
    user_lat: float = Query(..., description="User latitude"),
    user_lon: float = Query(..., description="User longitude"),
    authorization: Optional[str] = None,
    limit: int = Query(3, ge=1, le=10, description="Number of stations to return"),
    _: dict = Depends(verify_supabase_jwt)
) -> BestStationsResponse:
    """
    Find the best charging stations near the user's location.
    
    Scoring considers:
    - Station availability (free slots)
    - Grid load percentage
    - Distance from user
    
    Args:
        user_lat: User's latitude
        user_lon: User's longitude
        authorization: Supabase JWT token (via header)
        limit: Number of top stations to return (max 10)
        
    Returns:
        BestStationsResponse with top-scored stations
    """
    try:
        # Fetch station snapshots joined with station details
        response = supabase.table('station_snapshots').select(
            'station_id, total_load_kw, load_pct, free_slots, '
            'stations(id, name, latitude, longitude, total_capacity_kw)'
        ).execute()
        
        if not response.data:
            return BestStationsResponse(
                stations=[],
                generated_at=datetime.utcnow(),
                count=0
            )
        
        # Transform data for scoring
        stations_data = []
        for snapshot in response.data:
            station = snapshot['stations']
            
            stations_data.append({
                'station_id': snapshot['station_id'],
                'name': station.get('name', f"Station {snapshot['station_id']}"),
                'latitude': station.get('latitude', 0),
                'longitude': station.get('longitude', 0),
                'total_load_kw': snapshot['total_load_kw'],
                'load_pct': snapshot['load_pct'],
                'free_slots': snapshot['free_slots']
            })
        
        # Score stations
        scored_stations = score_stations(stations_data, user_lat, user_lon)
        
        # Convert to response schema
        station_snapshots = [
            StationSnapshot(
                station_id=s['station_id'],
                name=s['name'],
                latitude=s['latitude'],
                longitude=s['longitude'],
                total_load_kw=s['total_load_kw'],
                load_pct=s['load_pct'],
                free_slots=s['free_slots'],
                distance_km=s['distance_km'],
                score=s['score']
            )
            for s in scored_stations[:limit]
        ]
        
        return BestStationsResponse(
            stations=station_snapshots,
            generated_at=datetime.utcnow(),
            count=len(station_snapshots)
        )
        
    except Exception as e:
        print(f"Error fetching best stations: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching stations: {str(e)}"
        )
