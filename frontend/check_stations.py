import urllib.request
import json
import re

with open('/Users/allen/Downloads/frontend/js/supabase-config.js', 'r') as f:
    js = f.read()

URL = re.search(r"SUPABASE_URL\s*=\s*'([^']+)'", js).group(1)
KEY = re.search(r"SUPABASE_ANON_KEY\s*=\s*'([^']+)'", js).group(1)

def request(endpoint):
    headers = {
        'apikey': KEY,
        'Authorization': f'Bearer {KEY}'
    }
    req = urllib.request.Request(URL + endpoint, headers=headers)
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode())

stations = request("/rest/v1/stations?select=*")
print("Total Stations found:", len(stations))
for s in stations:
    print(s)
