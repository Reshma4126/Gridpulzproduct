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
        'Authorization': f'Bearer {KEY}',
        'Accept': 'application/json'
    }
    # To list tables, we query openapi spec
    req = urllib.request.Request(URL + endpoint, headers=headers)
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode())

try:
    openapi = request("/rest/v1/?apikey=" + KEY)
    definitions = openapi.get("definitions", {})
    tables = list(definitions.keys())
    print("Tables found in schema:")
    for t in tables:
        print("-", t)
except Exception as e:
    import traceback
    traceback.print_exc()
