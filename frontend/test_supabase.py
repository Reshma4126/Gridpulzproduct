import urllib.request
import urllib.parse
import json
import uuid
import re

# Read Supabase config directly from JS
with open('/Users/allen/Downloads/frontend/js/supabase-config.js', 'r') as f:
    js = f.read()

URL = re.search(r"SUPABASE_URL\s*=\s*'([^']+)'", js).group(1)
KEY = re.search(r"SUPABASE_ANON_KEY\s*=\s*'([^']+)'", js).group(1)

email = f"test_{uuid.uuid4().hex[:8]}@example.com"
password = "password123!!"

def request(endpoint, method='GET', data=None, headers=None):
    if headers is None: headers = {}
    headers['apikey'] = KEY
    headers['Authorization'] = f'Bearer {KEY}'
    if data: headers['Content-Type'] = 'application/json'
    headers['Prefer'] = 'return=representation'
    
    req = urllib.request.Request(URL + endpoint, method=method, headers=headers)
    if data: req.data = json.dumps(data).encode('utf-8')
    
    try:
        with urllib.request.urlopen(req) as response:
            res_str = response.read().decode()
            return json.loads(res_str) if res_str else {}
    except urllib.error.HTTPError as e:
        res_str = e.read().decode()
        return json.loads(res_str) if res_str else {"status": e.code}

print(f"Creating user {email}...")
signup_data = request("/auth/v1/signup", "POST", { "email": email, "password": password })
if 'access_token' not in signup_data:
    print("Signup failed:", signup_data)
else:
    token = signup_data['access_token']
    print("Signed up successfully.")

    print("Testing Row INSERT via frontend logic...")
    insert_headers = {
        'apikey': KEY,
        'Authorization': f'Bearer {token}',
        'Content-Profile': 'public'
    }
    insert_payload = {
        "username": "Test Name",
        "email": email,
        "password": "managed",
        "vehicle_name": "Test Car",
        "charging_capacity": 55,
        "charging_type": "CCS",
        "voltage_type": None
    }
    insert_res = request("/rest/v1/users", "POST", insert_payload, insert_headers)
    print("Insert result:", insert_res)
    
    print("\nTesting Row UPDATE via dashboard...")
    update_payload = { "vehicle_name": "Updated Car" }
    update_res = request(f"/rest/v1/users?email=eq.{email}", "PATCH", update_payload, insert_headers)
    print("Update result:", update_res)
