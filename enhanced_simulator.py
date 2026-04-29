#!/usr/bin/env python3
"""
Enhanced GridPulz Station Simulator
Generates realistic EV charging station data with demand spikes
"""

import requests
import json
import time
import random
from datetime import datetime
from typing import Dict, List

class StationSimulator:
    """Simulates realistic EV charging station data"""
    
    def __init__(self):
        self.backend_url = "http://127.0.0.1:8000/station/update"
        self.api_key = "gridpulz-esp32-secret-key-12345678"
        self.stations = ["STATION_02", "STATION_03"]
        self.headers = {
            "x-api-key": self.api_key,
            "Content-Type": "application/json"
        }
        
        # Track state for realistic transitions
        self.station_states = {
            "STATION_02": {
                "plug1_power": 0.0,
                "plug2_power": 0.0,
                "plug3_power": 0.0,
                "plug1_status": "free",
                "plug2_status": "free",
                "plug3_status": "free",
            },
            "STATION_03": {
                "plug1_power": 0.0,
                "plug2_power": 0.0,
                "plug3_power": 0.0,
                "plug1_status": "free",
                "plug2_status": "free",
                "plug3_status": "free",
            }
        }
        
        # Demand spike tracking
        self.cycle_count = 0
        self.spike_active = False
    
    def generate_realistic_power(self, current_power: float) -> float:
        """Generate realistic power transitions with smooth charging patterns"""
        power_options = [0, 25, 35, 45, 55, 65]
        
        # 70% chance to maintain current state
        if random.random() < 0.7:
            return current_power
        
        # 30% chance to transition to new state
        return random.choice(power_options)
    
    def generate_voltage(self) -> float:
        """Generate realistic voltage (±10V from nominal 230V)"""
        return round(random.uniform(218, 235), 1)
    
    def generate_station_data(self, station_id: str) -> Dict:
        """Generate complete station data matching ESP32 format"""
        state = self.station_states[station_id]
        
        # Generate new power values with smooth transitions
        plug1_power = self.generate_realistic_power(state["plug1_power"])
        plug2_power = self.generate_realistic_power(state["plug2_power"])
        plug3_power = self.generate_realistic_power(state["plug3_power"])
        
        # Update state for next iteration
        state["plug1_power"] = plug1_power
        state["plug2_power"] = plug2_power
        state["plug3_power"] = plug3_power
        
        # Determine status based on power threshold
        def get_status(power: float) -> str:
            return "occupied" if power > 3 else "free"
        
        plug1_status = get_status(plug1_power)
        plug2_status = get_status(plug2_power)
        plug3_status = get_status(plug3_power)
        
        # Update state
        state["plug1_status"] = plug1_status
        state["plug2_status"] = plug2_status
        state["plug3_status"] = plug3_status
        
        return {
            "station_id": station_id,
            "voltage": self.generate_voltage(),
            "plug1_power": plug1_power,
            "plug2_power": plug2_power,
            "plug3_power": plug3_power,
            "plug1_status": plug1_status,
            "plug2_status": plug2_status,
            "plug3_status": plug3_status,
        }
    
    def simulate_demand_spike(self, station_id: str) -> Dict:
        """Generate demand spike data for testing"""
        return {
            "station_id": station_id,
            "voltage": 225.5,
            "plug1_power": 65.0,
            "plug2_power": 55.0,
            "plug3_power": 45.0,
            "plug1_status": "occupied",
            "plug2_status": "occupied",
            "plug3_status": "occupied"
        }
    
    def send_data(self, data: Dict) -> bool:
        """Send data to backend"""
        try:
            response = requests.post(
                self.backend_url,
                json=data,
                headers=self.headers,
                timeout=5
            )
            
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            status_emoji = "✅" if response.status_code == 200 else "❌"
            
            print(f"\n[{timestamp}] {status_emoji} {data['station_id']}")
            print(f"  Status Code: {response.status_code}")
            print(f"  Data: {json.dumps(data, indent=2)}")
            
            if response.status_code != 200:
                print(f"  Error: {response.text}")
                return False
            
            return True
        
        except requests.exceptions.ConnectionError:
            print(f"[ERROR] Cannot connect to backend at {self.backend_url}")
            return False
        
        except Exception as e:
            print(f"[ERROR] Failed to send data: {str(e)}")
            return False
    
    def run_simulation(self, interval: int = 5):
        """Run continuous simulation loop with demand spikes"""
        print("=" * 60)
        print("GridPulz Enhanced Station Simulator")
        print("=" * 60)
        print(f"Backend URL: {self.backend_url}")
        print(f"Sending data for: {', '.join(self.stations)}")
        print(f"Update interval: {interval} seconds")
        print("Press Ctrl+C to stop")
        print("=" * 60)
        
        try:
            while True:
                self.cycle_count += 1
                print(f"\n--- Cycle {self.cycle_count} ---")
                
                # Check for demand spike (every 10 cycles)
                if self.cycle_count % 10 == 0:
                    print("⚡ DEMAND SPIKE ACTIVATED")
                    for station_id in self.stations:
                        spike_data = self.simulate_demand_spike(station_id)
                        self.send_data(spike_data)
                        time.sleep(1)
                else:
                    # Normal operation
                    for station_id in self.stations:
                        data = self.generate_station_data(station_id)
                        self.send_data(data)
                        time.sleep(0.5)
                
                print(f"\nWaiting {interval} seconds until next update...", end="", flush=True)
                time.sleep(interval)
                print(" Ready!\n")
        
        except KeyboardInterrupt:
            print("\n\n[INFO] Simulator stopped by user")
            print("Total cycles completed:", self.cycle_count)


if __name__ == "__main__":
    simulator = StationSimulator()
    simulator.run_simulation(interval=5)
