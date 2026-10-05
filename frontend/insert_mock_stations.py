import urllib.request
import json
import re

with open('/Users/allen/Downloads/frontend/js/supabase-config.js', 'r') as f:
    js = f.read()

URL = re.search(r"SUPABASE_URL\s*=\s*'([^']+)'", js).group(1)
KEY = re.search(r"SUPABASE_ANON_KEY\s*=\s*'([^']+)'", js).group(1)

def request(endpoint, method, data):
    headers = {
        'apikey': KEY,
        'Authorization': f'Bearer {KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    }
    req = urllib.request.Request(URL + endpoint, data=json.dumps(data).encode(), headers=headers, method=method)
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode())

stations = [
    {
        "name": "ChargeGrid Alpha Terminal",
        "latitude": 13.0900,
        "longitude": 80.2800,
        "charging_type": "CCS",
        "num_plugs": 4,
        "contact": "1234567890",
        "email": "alpha@example.com",
        "address": "Chennai North",
        "connector_type": "CCS2",
        "voltage": 400,
        "max_current": 100,
        "meter_available": True,
        "operating_hours": "24/7",
        "avg_usage": 50,
        "total_capacity_kw": 200,
        "communication_type": "OCPP 1.6"
    },
    {
        "name": "EvStation Beta Hub",
        "latitude": 13.0600,
        "longitude": 80.2600,
        "charging_type": "Type 2",
        "num_plugs": 6,
        "contact": "1234567891",
        "email": "beta@example.com",
        "address": "Chennai Central",
        "connector_type": "Type 2 AC",
        "voltage": 230,
        "max_current": 32,
        "meter_available": True,
        "operating_hours": "06:00-22:00",
        "avg_usage": 80,
        "total_capacity_kw": 44,
        "communication_type": "OCPP 1.6"
    },
    {
        "name": "FastCharge Gamma Point",
        "latitude": 13.0800,
        "longitude": 80.2500,
        "charging_type": "CHAdeMO",
        "num_plugs": 2,
        "contact": "1234567892",
        "email": "gamma@example.com",
        "address": "Chennai West",
        "connector_type": "CHAdeMO",
        "voltage": 500,
        "max_current": 120,
        "meter_available": False,
        "operating_hours": "24/7",
        "avg_usage": 20,
        "total_capacity_kw": 120,
        "communication_type": "OCPP 1.6"
    }
]

try:
    res = request("/rest/v1/stations", "POST", stations)
    print("Successfully inserted stations:", len(res))
except Exception as e:
    import urllib.error
    if isinstance(e, urllib.error.HTTPError):
        print("Error inserting stations:", e.code, e.reason)
        print(e.read().decode())
    else:
        print("Error:", str(e))
