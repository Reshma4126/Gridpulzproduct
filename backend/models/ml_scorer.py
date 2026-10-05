"""
ML Scoring module for ranking charging stations
"""
from typing import List, Dict, Any
import math


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate great-circle distance between two GPS coordinates using Haversine formula.
    
    Args:
        lat1, lon1: User's latitude and longitude
        lat2, lon2: Station's latitude and longitude
        
    Returns:
        Distance in kilometers
    """
    R = 6371  # Earth radius in km
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    
    a = (math.sin(delta_lat / 2) ** 2 + 
         math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2)
    
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    distance = R * c
    
    return distance


def score_stations(
    stations: List[Dict[str, Any]], 
    user_lat: float, 
    user_lon: float,
    max_plugs: int = 3
) -> List[Dict[str, Any]]:
    """
    Score and rank charging stations based on availability, load, and distance.
    
    Scoring Formula:
    - Availability score: (free_slots / max_plugs) * 0.4
    - Load efficiency: (1 - load_pct/100) * 0.4
    - Distance proximity: (1 / (1 + distance_km)) * 0.2
    
    Total score: sum of the above three components (0-1 scale)
    
    Args:
        stations: List of station dictionaries with load_pct, free_slots, latitude, longitude
        user_lat: User's latitude
        user_lon: User's longitude
        max_plugs: Maximum plugs per station (default 3)
        
    Returns:
        Sorted list of stations by score (descending), with distance_km and score added
        
    TODO: Replace scoring logic with ML model once trained:
        model = joblib.load('models/station_scorer.pkl')
        score = model.predict([[load_pct, free_slots, distance_km]])[0]
    """
    scored_stations = []
    
    for station in stations:
        # Calculate distance
        distance_km = haversine_distance(
            user_lat,
            user_lon,
            station.get('latitude', 0),
            station.get('longitude', 0)
        )
        
        # Extract metrics
        load_pct = station.get('load_pct', 50)
        free_slots = station.get('free_slots', 0)
        
        # Calculate component scores
        availability_score = (free_slots / max_plugs) * 0.4
        load_efficiency_score = (1 - load_pct / 100) * 0.4
        distance_score = (1 / (1 + distance_km)) * 0.2
        
        # Total score
        total_score = availability_score + load_efficiency_score + distance_score
        total_score = min(1.0, max(0.0, total_score))  # Clamp to [0, 1]
        
        # Add to results
        scored_stations.append({
            **station,
            'distance_km': round(distance_km, 2),
            'score': round(total_score, 3)
        })
    
    # Sort by score descending
    scored_stations.sort(key=lambda x: x['score'], reverse=True)
    
    return scored_stations
