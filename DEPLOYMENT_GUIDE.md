# Deployment Guide - EV Charging Station System

Complete instructions for deploying the EV charging system to production.

---

## 📋 Pre-Deployment Checklist

- [ ] All SQL migrations executed in Supabase
- [ ] Backend .env file configured with production values
- [ ] Frontend .env.local has production URLs
- [ ] ESP32 devices programmed with correct station IDs and API keys
- [ ] SSL/HTTPS certificates obtained
- [ ] Database backups configured
- [ ] Monitoring and alerting setup

---

## Part 1: Database (Supabase - Already Running)

### 1.1 Production Readiness

Supabase is your managed database, already handling:
- ✓ Automatic backups
- ✓ Replication
- ✓ Point-in-time recovery
- ✓ RLS enforcement

### 1.2 Additional Configuration

```sql
-- Enable point-in-time recovery (if not already enabled)
-- This is done in Supabase Console → Project Settings → Backups

-- Create indexes for your query patterns
CREATE INDEX idx_readings_station_time 
    ON readings(station_id, recorded_at DESC);

CREATE INDEX idx_charging_sessions_user 
    ON charging_sessions(user_id, started_at DESC);

-- Enable query statistics
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

### 1.3 Monitoring

In Supabase Console → Database → Logs:
- Monitor slow queries
- Check failed transactions
- Review RLS policy violations

---

## Part 2: Backend API Deployment

### Option A: Deploy to Heroku (Easiest for Hackathon)

#### Step 1: Create Heroku App

```bash
# Install Heroku CLI
# https://devcenter.heroku.com/articles/heroku-cli

# Login
heroku login

# Create new app
heroku create your-ev-charging-api

# Add PostgreSQL addon (optional, we use Supabase)
heroku addons:create heroku-postgresql:hobby-dev
```

#### Step 2: Configure Environment

```bash
# Set environment variables
heroku config:set SUPABASE_URL=https://your-project.supabase.co
heroku config:set SUPABASE_SERVICE_KEY=your-service-role-key
heroku config:set API_SECRET_KEY=your-esp32-secret-key
heroku config:set SUPABASE_JWT_SECRET=your-jwt-secret
heroku config:set LOG_LEVEL=INFO
```

#### Step 3: Deploy

```bash
# From backend/ directory
git add .
git commit -m "Deploy to Heroku"
git push heroku main

# View logs
heroku logs --tail
```

#### Step 4: Verify

```bash
curl https://your-ev-charging-api.herokuapp.com/health
```

---

### Option B: Deploy to AWS (Production Scale)

#### Step 1: Prepare Code

```bash
# Create docker image for backend
cd backend

# Create Dockerfile
cat > Dockerfile << 'EOF'
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
EOF

# Build image
docker build -t ev-charging-api:latest .
```

#### Step 2: Push to AWS ECR

```bash
# Create ECR repository
aws ecr create-repository --repository-name ev-charging-api

# Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com

# Tag image
docker tag ev-charging-api:latest YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/ev-charging-api:latest

# Push
docker push YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/ev-charging-api:latest
```

#### Step 3: Deploy to ECS/Fargate

```bash
# Create cluster
aws ecs create-cluster --cluster-name ev-charging

# Register task definition
aws ecs register-task-definition \
  --family ev-charging-api \
  --network-mode awsvpc \
  --requires-compatibilities FARGATE \
  --cpu 256 \
  --memory 512 \
  --container-definitions '[{
    "name": "ev-charging-api",
    "image": "YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/ev-charging-api:latest",
    "portMappings": [{"containerPort": 8000}],
    "environment": [
      {"name": "SUPABASE_URL", "value": "https://your-project.supabase.co"},
      {"name": "LOG_LEVEL", "value": "INFO"}
    ]
  }]'

# Create service
aws ecs create-service \
  --cluster ev-charging \
  --service-name ev-charging-api \
  --task-definition ev-charging-api \
  --desired-count 2 \
  --launch-type FARGATE
```

#### Step 4: Setup Load Balancer

```bash
# Create ALB
aws elbv2 create-load-balancer \
  --name ev-charging-alb \
  --subnets subnet-12345678 subnet-87654321 \
  --security-groups sg-12345678

# Create target group
aws elbv2 create-target-group \
  --name ev-charging-targets \
  --protocol HTTP \
  --port 8000 \
  --vpc-id vpc-12345678
```

---

### Option C: Deploy to Google Cloud Run (Serverless)

#### Step 1: Configure Cloud Run

```bash
# Enable Cloud Run API
gcloud services enable run.googleapis.com

# Set project
gcloud config set project YOUR_PROJECT_ID
```

#### Step 2: Deploy from Source

```bash
cd backend

gcloud run deploy ev-charging-api \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars \
    SUPABASE_URL=https://your-project.supabase.co,\
    SUPABASE_SERVICE_KEY=your-service-role-key,\
    API_SECRET_KEY=your-esp32-secret-key,\
    SUPABASE_JWT_SECRET=your-jwt-secret,\
    LOG_LEVEL=INFO
```

#### Step 3: Get URL

```bash
# Cloud Run automatically provides a URL
# https://ev-charging-api-xxxxx.a.run.app

# Update frontend and ESP32 code with new URL
```

---

## Part 3: Frontend Deployment

### Option A: Vercel (Recommended for Next.js/React)

#### Step 1: Setup Git

```bash
git init
git add .
git commit -m "Initial commit"
git push -u origin main
```

#### Step 2: Connect to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Follow prompts to connect GitHub repo
```

#### Step 3: Configure Environment

In Vercel Console → Settings → Environment Variables:

```
REACT_APP_SUPABASE_URL = https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
REACT_APP_API_URL = https://your-backend-api.com/api
```

#### Step 4: Deploy

```bash
# Automatic on push to main
git push origin main
```

---

### Option B: AWS S3 + CloudFront

#### Step 1: Build Frontend

```bash
npm run build
# Creates /build or /dist directory
```

#### Step 2: Upload to S3

```bash
# Create S3 bucket
aws s3 mb s3://ev-charging-frontend

# Upload build files
aws s3 sync build/ s3://ev-charging-frontend/ --delete

# Make files public
aws s3api put-bucket-policy --bucket ev-charging-frontend \
  --policy file://bucket-policy.json
```

**bucket-policy.json:**
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::ev-charging-frontend/*"
  }]
}
```

#### Step 3: Setup CloudFront

```bash
# Create distribution
aws cloudfront create-distribution \
  --origin-domain-name ev-charging-frontend.s3.amazonaws.com \
  --default-root-object index.html
```

---

### Option C: Netlify

#### Step 1: Connect GitHub

```bash
# Login to netlify.com
# Click "New site from Git"
# Select GitHub repo
# Authorize Netlify
```

#### Step 2: Configure Build

```bash
# Netlify auto-detects:
# Build command: npm run build
# Publish directory: build (or dist)
```

#### Step 3: Add Environment Variables

Netlify Console → Site Settings → Build & Deploy → Environment:

```
REACT_APP_SUPABASE_URL = https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
REACT_APP_API_URL = https://your-backend-api.com/api
```

---

## Part 4: ESP32 Firmware Over-the-Air (OTA) Updates

### Option A: Arduino IDE

```bash
# Upload firmware via USB
# Tools → Sketch → Upload
# Select COM port and board
# Verify upload success in Serial Monitor
```

### Option B: OTA Updates (Advanced)

Add to firmware:

```cpp
#include <ArduinoOTA.h>

void setupOTA() {
    ArduinoOTA.setHostname("ev-charger-1");
    ArduinoOTA.setPassword("admin123");
    
    ArduinoOTA.onStart([]() {
        Serial.println("OTA Update starting...");
    });
    
    ArduinoOTA.onEnd([]() {
        Serial.println("\n✓ OTA Update complete!");
    });
    
    ArduinoOTA.onError([](ota_error_t error) {
        Serial.printf("OTA Error[%u]: ", error);
        if (error == OTA_AUTH_ERROR) Serial.println("Auth failed");
    });
    
    ArduinoOTA.begin();
}

void loop() {
    ArduinoOTA.handle();
    // ... rest of code
}
```

Then upload via network:
```bash
# In Arduino IDE
# Tools → Port → [ESP32 IP Address]
# Upload over network
```

---

## Part 5: Monitoring & Alerts

### 1. Backend Monitoring

#### With Sentry (Error Tracking)

```python
# In main.py
import sentry_sdk

sentry_sdk.init(
    dsn="https://your-sentry-dsn@sentry.io/project-id",
    traces_sample_rate=0.1,
    profiles_sample_rate=0.1
)

@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}
```

#### With Datadog (APM)

```python
# In requirements.txt
ddtrace==2.0.0

# Export DD_TRACE_ENABLED=true
# Export DD_SERVICE=ev-charging-api
# Export DD_ENV=production
```

### 2. Database Monitoring

Supabase Console → Database → Monitoring:
- CPU usage
- Memory usage
- Connections
- Query performance

### 3. Real-time Alerts

```bash
# Setup Slack webhook for errors
# Add to main.py error handler:

import aiohttp

async def send_slack_alert(message: str):
    async with aiohttp.ClientSession() as session:
        async with session.post(
            "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
            json={"text": f"🚨 {message}"}
        ) as resp:
            pass
```

### 4. Uptime Monitoring

Use third-party services:
- Uptime.com - free tier
- Monitoring.tools
- Cloudflare Page Rules

```bash
# Check API periodically
curl -f https://your-api.com/health || notify_team
```

---

## Part 6: SSL/HTTPS Configuration

### Automatic (Recommended)

Most deployment platforms handle SSL automatically:
- ✓ Heroku: Automatic free SSL
- ✓ Vercel: Automatic SSL for vercel.app domains
- ✓ AWS: Use AWS Certificate Manager
- ✓ Netlify: Automatic Let's Encrypt

### Manual (Let's Encrypt)

```bash
# Install certbot
sudo apt-get install certbot python3-certbot-nginx

# Generate certificate
sudo certbot certonly --standalone -d your-domain.com

# Renew automatically
sudo certbot renew --dry-run
```

### Update Backend for HTTPS

```python
# In main.py, add HTTPS enforcement
@app.middleware("http")
async def https_redirect(request: Request, call_next):
    if request.url.scheme == "http" and os.getenv("ENV") == "production":
        url = request.url.replace(scheme="https")
        return RedirectResponse(url=url, status_code=301)
    return await call_next(request)
```

---

## Part 7: Performance Optimization

### Backend

```python
# Add caching headers
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZIPMiddleware

app.add_middleware(GZIPMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Use response caching
from fastapi_cache2 import FastAPICache2
from fastapi_cache2.backends.redis import RedisBackend

@app.get("/best-stations", response_model=BestStationsResponse)
@cached(expire=60)  # Cache for 60 seconds
async def get_best_stations(user_lat: float, user_lon: float):
    ...
```

### Frontend

```typescript
// Lazy load components
const StationMonitor = lazy(() => import('./StationMonitor'));

// Add service worker for offline support
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js');
}

// Optimize images
<img 
    src="station.jpg" 
    loading="lazy"
    srcSet="station-small.jpg 480w, station-large.jpg 1200w"
/>
```

### Database

```sql
-- Add materialized views for common queries
CREATE MATERIALIZED VIEW v_station_rankings AS
SELECT 
    s.station_id,
    s.name,
    COUNT(*) as booking_count,
    AVG(c.energy_kwh) as avg_energy,
    ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC) as rank
FROM stations s
LEFT JOIN charging_sessions c ON s.station_id = c.station_id
GROUP BY s.station_id, s.name;

-- Refresh periodically
CREATE EXTENSION pg_cron;
SELECT cron.schedule('refresh_rankings', '0 * * * *', 
    'REFRESH MATERIALIZED VIEW CONCURRENTLY v_station_rankings');
```

---

## Part 8: Disaster Recovery

### Backup Strategy

```bash
# Daily backups (Supabase handles this automatically)
# Retain for 30 days

# Verify backups can be restored
# Test monthly restore to staging environment
```

### Failover Plan

1. **Database Failover**: Supabase handles auto-failover to replica
2. **API Failover**: Deploy to multiple regions, use load balancer
3. **Frontend Failover**: CDN automatic fallback to origin

### Recovery Time Objectives (RTO)

- Database: < 5 minutes (automatic failover)
- API: < 1 minute (health check + redirects)
- Frontend: < 1 second (CDN edge)

---

## Part 9: Security Hardening

### 1. API Security

```python
# Rate limiting
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.post("/api/station-data")
@limiter.limit("100/minute")
async def receive_station_data(...):
    pass

# Request validation
from pydantic import BaseModel, validator

class StationDataPayload(BaseModel):
    station_id: int = Field(..., gt=0, le=9999)
    
    @validator('station_id')
    def validate_station_id(cls, v):
        if v <= 0:
            raise ValueError('Invalid station ID')
        return v
```

### 2. Database Security

```sql
-- Limit connections per user
ALTER USER service_role SET statement_timeout = '30s';

-- Mask sensitive columns
CREATE POLICY mask_api_keys ON service_accounts
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Audit logging
CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    table_name TEXT,
    operation TEXT,
    old_data JSONB,
    new_data JSONB,
    changed_by UUID REFERENCES auth.users,
    changed_at TIMESTAMP DEFAULT NOW()
);
```

### 3. Frontend Security

```typescript
// Content Security Policy
<meta 
    http-equiv="Content-Security-Policy" 
    content="default-src 'self'; script-src 'self' trusted-scripts.com"
/>

// Prevent XSS
const sanitize = (input: string) => {
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
};

// Secure localStorage (encryption optional for sensitive data)
import { encrypt, decrypt } from 'crypto-js';

const storeToken = (token: string) => {
    const encrypted = encrypt(token, 'secret-key');
    localStorage.setItem('auth_token', encrypted);
};
```

### 4. Network Security

```bash
# Enable HTTPS only
Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"

# CORS properly configured
curl -H "Origin: https://evil.com" -H "Access-Control-Request-Method: POST" \
  https://your-api.com  # Should NOT grant access

# DDoS protection (AWS Shield, Cloudflare)
```

---

## 🚀 Final Pre-Launch Checklist

- [ ] Database backups verified and tested
- [ ] All environment variables set correctly
- [ ] SSL/HTTPS working on all domains
- [ ] API health checks passing
- [ ] Frontend fully functional
- [ ] ESP32 devices communicating with API
- [ ] Monitoring and alerting active
- [ ] Error logs reviewed and clean
- [ ] Load testing completed (no performance degradation)
- [ ] Security audit completed
- [ ] User documentation ready
- [ ] Support team trained
- [ ] Rollback procedure documented

---

## Support

- **Supabase Deployment**: https://supabase.com/docs/guides/hosting/overview
- **FastAPI Deployment**: https://fastapi.tiangolo.com/deployment/
- **Heroku**: https://devcenter.heroku.com/
- **AWS**: https://docs.aws.amazon.com/
- **Google Cloud Run**: https://cloud.google.com/run/docs

