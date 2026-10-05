"""
Simulated Station Data Generator
Provides realistic fallback data when real sensors are unavailable
"""

import random
from datetime import datetime
from typing import Dict, List

class SimulatedDataGenerator:
    """Generates realistic simulated station data"""
    
    @staticmethod
    def get_simulated_station_data(station_id: str) -> Dict:
        """
        Generate realistic simulated data for a station
        Returns data with realistic power values and occupancy
        """
        now = datetime.now().isoformat()
        
        # Simulate realistic scenarios
        scenarios = [
            # Scenario 1: One station charging (10-15kW)
            {
                "plug1_power": random.uniform(10, 15),
                "plug2_power": 0,
                "plug3_power": 0,
            },
            # Scenario 2: Two stations charging (8-12kW each)
            {
                "plug1_power": random.uniform(8, 12),
                "plug2_power": random.uniform(8, 12),
                "plug3_power": 0,
            },
            # Scenario 3: All three charging (5-10kW each)
            {
                "plug1_power": random.uniform(5, 10),
                "plug2_power": random.uniform(5, 10),
                "plug3_power": random.uniform(5, 10),
            },
            # Scenario 4: Light usage (1-3kW)
            {
                "plug1_power": random.uniform(1, 3),
                "plug2_power": 0,
                "plug3_power": 0,
            },
            # Scenario 5: Idle station (0kW)
            {
                "plug1_power": 0,
                "plug2_power": 0,
                "plug3_power": 0,
            },
        ]
        
        # Choose random scenario
        scenario = random.choice(scenarios)
        
        return {
            "station_id": station_id,
            "plug1_power": round(scenario["plug1_power"], 2),
            "plug2_power": round(scenario["plug2_power"], 2),
            "plug3_power": round(scenario["plug3_power"], 2),
            "plug1_status": "charging" if scenario["plug1_power"] > 0 else "free",
            "plug2_status": "charging" if scenario["plug2_power"] > 0 else "free",
            "plug3_status": "charging" if scenario["plug3_power"] > 0 else "free",
            "voltage": 220.0,
            "updated_at": now,
            "is_simulated": True,
        }
    
    @staticmethod
    def get_simulated_all_stations() -> Dict[str, Dict]:
        """Get simulated data for all stations"""
        stations = ["STATION_01", "STATION_02", "STATION_03"]
        return {
            station_id: SimulatedDataGenerator.get_simulated_station_data(station_id)
            for station_id in stations
        }


simulated_data_generator = SimulatedDataGenerator()
