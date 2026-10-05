#!/usr/bin/env python3
"""
Multi-Station Simulation for GridPulz
Simulates STATION_02 and STATION_03 to complement real ESP32 STATION_01
"""

import requests
import random
import time
import json

# Configuration
BACKEND_URL = "http://127.0.0.1:8000/station/update"
API_KEY = "gridpulz-esp32-secret-key-12345678"
HEADERS = {
    "Content-Type": "application/json",
    "x-api-key": API_KEY
}

def generate_station_data(station_id):
    """Generate realistic station data with demand spike patterns"""
    
    # Base voltage with realistic fluctuation
    voltage = round(random.uniform(218, 235), 1)
    
    # Power values with realistic patterns (in Watts)
    power_options = [0, 25, 35, 45, 55, 65]
    
    # Simulate different load patterns for each station
    if station_id == "STATION_02":
        # Station 2: Higher utilization pattern
        plug1_power = random.choice([0, 45, 55, 65])
        plug2_power = random.choice([0, 35, 45, 55])
        plug3_power = random.choice([0, 25, 35, 45])
        
    elif station_id == "STATION_03":
        # Station 3: Medium utilization pattern
        plug1_power = random.choice([0, 35, 45, 55])
        plug2_power = random.choice([0, 25, 35, 45])
        plug3_power = random.choice([0, 45, 55, 65])
    
    # Status logic based on power threshold
    plug1_status = "occupied" if plug1_power > 3 else "free"
    plug2_status = "occupied" if plug2_power > 3 else "free"
    plug3_status = "occupied" if plug3_power > 3 else "free"
    
    return {
        "station_id": station_id,
        "voltage": voltage,
        "plug1_power": float(plug1_power),
        "plug2_power": float(plug2_power),
        "plug3_power": float(plug3_power),
        "plug1_status": plug1_status,
        "plug2_status": plug2_status,
        "plug3_status": plug3_status
    }

def send_station_data(station_data):
    """Send station data to backend"""
    try:
        response = requests.post(BACKEND_URL, json=station_data, headers=HEADERS, timeout=5)
        
        print(f"🔌 {station_data['station_id']}")
        print(f"   Status: {response.status_code}")
        print(f"   Data: {json.dumps(station_data, indent=6)}")
        
        if response.status_code == 200:
            print(f"   ✅ Success")
        else:
            print(f"   ❌ Error: {response.text}")
        
        return response.status_code == 200
        
    except requests.exceptions.RequestException as e:
        print(f"   ❌ Network Error: {e}")
        return False

def simulate_demand_spike():
    """Simulate demand spike across all stations"""
    print("\n⚡ DEMAND SPIKE SIMULATION")
    print("=" * 50)
    
    spike_data = [
        {
            "station_id": "STATION_02",
            "voltage": 225.5,
            "plug1_power": 65.0,
            "plug2_power": 55.0,
            "plug3_power": 45.0,
            "plug1_status": "occupied",
            "plug2_status": "occupied",
            "plug3_status": "occupied"
        },
        {
            "station_id": "STATION_03", 
            "voltage": 228.0,
            "plug1_power": 55.0,
            "plug2_power": 45.0,
            "plug3_power": 65.0,
            "plug1_status": "occupied",
            "plug2_status": "occupied",
            "plug3_status": "occupied"
        }
    ]
    
    for data in spike_data:
        send_station_data(data)
        time.sleep(1)

def main():
    """Main simulation loop"""
    print("🚀 GridPulz Multi-Station Simulation")
    print("=" * 50)
    print("STATION_01: Real ESP32")
    print("STATION_02: Simulated")
    print("STATION_03: Simulated")
    print("=" * 50)
    
    cycle_count = 0
    
    while True:
        cycle_count += 1
        print(f"\n📊 Cycle {cycle_count}")
        print("-" * 30)
        
        # Simulate normal operation
        stations = ["STATION_02", "STATION_03"]
        
        for station_id in stations:
            station_data = generate_station_data(station_id)
            send_station_data(station_data)
            time.sleep(0.5)  # Small delay between stations
        
        # Every 10 cycles, simulate a demand spike
        if cycle_count % 10 == 0:
            simulate_demand_spike()
        
        print(f"\n⏱️ Waiting 5 seconds...")
        time.sleep(5)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n🛑 Simulation stopped by user")
    except Exception as e:
        print(f"\n❌ Simulation error: {e}")
