# Nginx Configuration Fix for Mixed Content Issue

## Problem
The frontend is served over HTTPS, but API calls are trying to use HTTP (`http://accommodation.soliflexpackaging.com:5000/api/auth/login`), causing a mixed content error.

## Solution

### 1. Fix Frontend API Configuration
The frontend API configuration has been updated to use relative paths (`/api`) instead of absolute HTTP URLs. This ensures:
- API calls use the same protocol (HTTPS) as the page
- Nginx handles the routing to the backend
- No mixed content issues

### 2. Update Nginx Configuration

**Key Fix:** The `location /api/` block needs to properly proxy to the backend.

**Current (Incorrect):**
```nginx
location /api/ {
    proxy_pass http://127.0.0.1:5000;
}
```

**Fixed:**
```nginx
location /api {
    proxy_pass http://127.0.0.1:5000;
    # ... other headers
}
```

**Important:** Remove the trailing slash from `/api/` in the location block, or ensure `proxy_pass` has the correct format.

---

## Complete Fixed Nginx Configuration

```nginx
server {
    server_name accommodation.soliflexpackaging.com;

    listen 443 ssl;
    listen [::]:443 ssl;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/transport.soliflexpackaging.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/transport.soliflexpackaging.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Proxy Headers
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_redirect off;
    proxy_buffering off;
    proxy_send_timeout 120s;
    proxy_read_timeout 120s;
    client_max_body_size 10M;

    # --- API LOCATION BLOCK (Proxies to Backend on port 5000) ---
    location /api {
        # Proxy to backend - /api/auth/login becomes http://127.0.0.1:5000/api/auth/login
        proxy_pass http://127.0.0.1:5000;
        
        # Ensure HTTPS headers are passed
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Ssl on;
    }

    # --- STATIC FILES (Proxies to Frontend on port 3600) ---
    location /static/ {
        proxy_pass http://127.0.0.1:3600;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Static file extensions
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|json|txt)$ {
        proxy_pass http://127.0.0.1:3600;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # --- FRONTEND LOCATION BLOCK (Proxies to Frontend on port 3600) ---
    location / {
        proxy_pass http://127.0.0.1:3600;
    }
}

# HTTP to HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name accommodation.soliflexpackaging.com;
    return 301 https://$server_name$request_uri;
}
```

---

## Steps to Apply Fix

### 1. Update Frontend Code (Already Done)
The `frontend/src/services/api.js` has been updated to use relative paths (`/api`).

### 2. Rebuild Frontend
```bash
cd /home/soliflexuser/accomodation/new-soliflex-employee-accomodation-app/frontend
npm run build
```

### 3. Update Nginx Configuration
```bash
# Backup current config
sudo cp /etc/nginx/sites-available/accommodation /etc/nginx/sites-available/accommodation.backup

# Edit the config file
sudo nano /etc/nginx/sites-available/accommodation

# Or use the provided config file
sudo cp nginx-accommodation.conf /etc/nginx/sites-available/accommodation

# Test nginx configuration
sudo nginx -t

# If test passes, reload nginx
sudo systemctl reload nginx
```

### 4. Restart Frontend
```bash
pm2 restart sol-emp-frontend
```

### 5. Verify
- Check browser console - should see API calls to `https://accommodation.soliflexpackaging.com/api/auth/login`
- Test login functionality

---

## Key Changes Made

1. **Frontend API Config**: Changed from `http://${hostname}:5000/api` to `/api` (relative path)
2. **Nginx API Location**: Ensured `/api` location properly proxies to backend
3. **HTTPS Headers**: Added `X-Forwarded-Proto https` to ensure backend knows it's HTTPS

---

## Testing Commands

```bash
# Test nginx config
sudo nginx -t

# Check if backend is accessible
curl http://localhost:5000/api/health

# Check if frontend is accessible
curl http://localhost:3600

# Test API through nginx (from server)
curl https://accommodation.soliflexpackaging.com/api/health

# Check nginx error logs
sudo tail -f /var/log/nginx/error.log

# Check nginx access logs
sudo tail -f /var/log/nginx/access.log
```

