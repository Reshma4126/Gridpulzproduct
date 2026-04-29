"""
Grid Load Analysis Service
Analyzes real-time data and provides ML recommendations for load balancing
"""

import math
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from collections import deque

class GridLoadAnalyzer:
    """Analyzes grid load across all stations and provides ML-driven recommendations"""
    
    # Grid parameters
    GRID_CAPACITY_KW = 200  # Maximum safe grid capacity
    CRITICAL_THRESHOLD = 0.9  # 90% of capacity
    WARNING_THRESHOLD = 0.75  # 75% of capacity
    
    # Station configuration
    STATION_CONFIG = {
        "STATION_01": {"capacity_kw": 70, "location": "Tech Park"},
        "STATION_02": {"capacity_kw": 60, "location": "Downtown"},
        "STATION_03": {"capacity_kw": 60, "location": "Mall"},
    }
    
    def __init__(self):
        """Initialize analyzer with history buffer"""
        self.load_history = deque(maxlen=720)  # 1 hour of 5-second data
        self.spike_history = deque(maxlen=100)
    
    def calculate_total_power(self, station_data: Dict) -> float:
        """Calculate total power from all plugs"""
        return (
            station_data.get("plug1_power", 0) +
            station_data.get("plug2_power", 0) +
            station_data.get("plug3_power", 0)
        )
    
    def calculate_utilization(self, station_id: str, total_power: float) -> float:
        """Calculate utilization percentage"""
        capacity = self.STATION_CONFIG[station_id]["capacity_kw"]
        return (total_power / capacity * 100) if capacity > 0 else 0
    
    def get_status(self, utilization: float) -> str:
        """Determine station status from utilization"""
        if utilization >= 90:
            return "critical"
        elif utilization >= 75:
            return "high_demand"
        else:
            return "normal"
    
    def calculate_grid_load(self, station_data_dict: Dict[str, Dict]) -> Tuple[float, float]:
        """Calculate total grid load"""
        total_load = sum(self.calculate_total_power(data) for data in station_data_dict.values())
        load_percentage = (total_load / self.GRID_CAPACITY_KW) * 100
        return total_load, load_percentage
    
    def detect_demand_spike(self, station_id: str, current_power: float, previous_power: float) -> Optional[Dict]:
        """Detect significant demand spikes (>20% increase)"""
        if previous_power == 0:
            return None
        
        power_increase = ((current_power - previous_power) / previous_power) * 100
        
        if power_increase > 20:  # 20% increase threshold
            return {
                "station_id": station_id,
                "power_increase_percentage": round(power_increase, 2),
                "peak_power": current_power,
                "timestamp": datetime.now().isoformat(),
            }
        
        return None
    
    def predict_overload(self, current_load: float, load_history: List[float]) -> Optional[str]:
        """Predict if grid will overload in next 10 minutes"""
        if len(load_history) < 5:
            return None
        
        # Calculate trend (load increase per 5 seconds)
        recent_loads = load_history[-10:]  # Last 50 seconds
        load_increase_per_second = (recent_loads[-1] - recent_loads[0]) / (len(recent_loads) - 1) / 5
        
        # Project to next 10 minutes (600 seconds)
        projected_load = current_load + (load_increase_per_second * 600)
        
        if projected_load >= self.GRID_CAPACITY_KW:
            time_to_overload_seconds = (self.GRID_CAPACITY_KW - current_load) / max(load_increase_per_second, 0.001)
            minutes = time_to_overload_seconds / 60
            
            if minutes > 0:
                return f"in {int(minutes)} minute{'s' if minutes != 1 else ''}"
        
        return None
    
    def recommend_redirect(
        self,
        booking_id: str,
        requested_station: str,
        requested_power: float,
        current_station_loads: Dict[str, float],
        current_grid_load: float,
    ) -> Dict:
        """ML-driven recommendation for new booking"""
        
        # Scenario 1: Accepting at requested station
        load_with_booking = current_grid_load + requested_power
        grid_safe = load_with_booking < (self.GRID_CAPACITY_KW * self.CRITICAL_THRESHOLD)
        
        if grid_safe:
            # Safe to accept at requested station
            return {
                "booking_id": booking_id,
                "requested_station": requested_station,
                "requested_power_demand": requested_power,
                "grid_safe": True,
                "grid_load_after_booking": round(load_with_booking, 2),
                "recommendation_type": "accept",
                "recommended_station": None,
                "reason": "Grid load within safe limits. Accept at requested station.",
                "with_gridpulz": {
                    "station": requested_station,
                    "load_before": round(current_station_loads.get(requested_station, 0), 2),
                    "load_after": round(current_station_loads.get(requested_station, 0) + requested_power, 2),
                    "grid_load_before": round(current_grid_load, 2),
                    "grid_load_after": round(load_with_booking, 2),
                    "overload_risk": False,
                },
                "without_gridpulz": {
                    "station": requested_station,
                    "load_before": round(current_station_loads.get(requested_station, 0), 2),
                    "load_after": round(current_station_loads.get(requested_station, 0) + requested_power, 2),
                    "grid_load_before": round(current_grid_load, 2),
                    "grid_load_after": round(load_with_booking, 2),
                    "overload_risk": True,  # Would overload without safety check
                },
            }
        
        # Not safe - find best alternative station
        best_alternative = None
        best_load = float('inf')
        
        for station_id, current_load in current_station_loads.items():
            if station_id == requested_station:
                continue
            
            projected_load = current_load + requested_power
            
            # Check station capacity
            station_capacity = self.STATION_CONFIG[station_id]["capacity_kw"]
            if projected_load > station_capacity:
                continue
            
            # Check grid load
            grid_load_if_alt = current_grid_load - current_station_loads[requested_station] + projected_load
            if grid_load_if_alt >= self.GRID_CAPACITY_KW:
                continue
            
            # This station is viable - is it better?
            if projected_load < best_load:
                best_load = projected_load
                best_alternative = station_id
        
        if best_alternative:
            alt_current_load = current_station_loads.get(best_alternative, 0)
            alt_new_load = alt_current_load + requested_power
            alt_grid_load = current_grid_load - current_station_loads[requested_station] + alt_new_load
            
            return {
                "booking_id": booking_id,
                "requested_station": requested_station,
                "requested_power_demand": requested_power,
                "grid_safe": False,
                "grid_load_after_booking": round(load_with_booking, 2),
                "recommendation_type": "redirect",
                "recommended_station": best_alternative,
                "reason": f"Grid overload risk at {requested_station}. Redirecting to {best_alternative} which has better capacity.",
                "with_gridpulz": {
                    "station": best_alternative,
                    "load_before": round(alt_current_load, 2),
                    "load_after": round(alt_new_load, 2),
                    "grid_load_before": round(current_grid_load, 2),
                    "grid_load_after": round(alt_grid_load, 2),
                    "overload_risk": False,
                },
                "without_gridpulz": {
                    "station": requested_station,
                    "load_before": round(current_station_loads.get(requested_station, 0), 2),
                    "load_after": round(current_station_loads.get(requested_station, 0) + requested_power, 2),
                    "grid_load_before": round(current_grid_load, 2),
                    "grid_load_after": round(load_with_booking, 2),
                    "overload_risk": True,  # CRITICAL: Grid overload!
                },
            }
        
        # No alternative available - defer booking
        return {
            "booking_id": booking_id,
            "requested_station": requested_station,
            "requested_power_demand": requested_power,
            "grid_safe": False,
            "grid_load_after_booking": round(load_with_booking, 2),
            "recommendation_type": "defer",
            "recommended_station": None,
            "reason": "Grid at critical capacity. No available alternatives. Defer booking by 5-10 minutes.",
            "with_gridpulz": {
                "status": "deferred",
                "reason": "Waiting for load to reduce",
                "estimated_wait": "5-10 minutes",
            },
            "without_gridpulz": {
                "station": requested_station,
                "status": "OVERLOAD RISK",
                "consequence": "Grid failure, blackout risk, equipment damage",
            },
        }


# Global instance
grid_analyzer = GridLoadAnalyzer()
