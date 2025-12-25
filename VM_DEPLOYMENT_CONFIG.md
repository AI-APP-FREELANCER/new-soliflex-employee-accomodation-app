# VM Deployment Configuration

## Port Configuration (VM/Production)

- **Backend**: Port `3000`
- **Frontend**: Port `3600`

## Backend Setup on VM

### 1. Backend `.env` file (`backend/.env`):
```env
PORT=3000
JWT_SECRET=your-strong-secret-key-here
NODE_ENV=production
```

### 2. Backend PM2 Configuration

The backend should be started with PM2 and configured to run on port 3000:
```bash
cd backend
pm2 start server.js --name sol-emp-backend
# Or use ecosystem.config.js with PORT=3000
```

## Frontend Setup on VM

### 1. Frontend Production Server

The `frontend/server.js` is already configured to run on port 3600:
```javascript
const PORT = process.env.PORT || 3600;
```

### 2. Frontend PM2 Configuration

Start frontend with PM2:
```bash
cd frontend
pm2 start server.js --name sol-emp-frontend
# Or use ecosystem.config.js with PORT=3600
```

### 3. API Configuration

The frontend uses relative paths (`/api`) in production mode, which means:
- API calls go to: `http://your-vm-ip:3600/api/*`
- You need nginx or a reverse proxy to forward `/api/*` to `http://localhost:3000`

## Nginx Configuration (Recommended for VM)

If using nginx, configure it to proxy API requests:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Frontend (port 3600)
    location / {
        proxy_pass http://localhost:3600;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API (port 3000)
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Direct Access (Without Nginx)

If not using nginx, you can access:
- Frontend: `http://your-vm-ip:3600`
- Backend API: `http://your-vm-ip:3000/api`

But you'll need to configure the frontend to use the full backend URL. Set in `frontend/.env.production`:
```env
REACT_APP_API_URL=http://your-vm-ip:3000/api
```

Then rebuild:
```bash
cd frontend
npm run build
```

## Verification

1. **Check Backend:**
   ```bash
   curl http://localhost:3000/api/health
   # Should return: {"status":"OK","message":"Soliflex Quarters Manager API is running"}
   ```

2. **Check Frontend:**
   ```bash
   curl http://localhost:3600
   # Should return HTML content
   ```

3. **Check PM2 Status:**
   ```bash
   pm2 status
   # Should show both sol-emp-backend and sol-emp-frontend as online
   ```

## Troubleshooting

### 404 Errors on API Calls

If you get 404 errors on `/api/*`:

1. **Check if backend is running:**
   ```bash
   pm2 logs sol-emp-backend
   # Should show: "Server is running on port 3000"
   ```

2. **Test backend directly:**
   ```bash
   curl http://localhost:3000/api/health
   ```

3. **If using nginx, check nginx config:**
   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

4. **If not using nginx, ensure frontend is configured with correct API URL:**
   - Set `REACT_APP_API_URL` in `.env.production`
   - Rebuild frontend: `npm run build`

### Port Conflicts

If ports are already in use:
```bash
# Check what's using the ports
sudo netstat -tulpn | grep :3000
sudo netstat -tulpn | grep :3600

# Kill processes if needed
sudo kill -9 <PID>
```

## Quick Start Commands (VM)

```bash
# 1. Navigate to project
cd ~/accomodation/new-soliflex-employee-accomodation-app

# 2. Update backend .env
cd backend
echo "PORT=3000" > .env
echo "JWT_SECRET=your-secret-here" >> .env
echo "NODE_ENV=production" >> .env
cd ..

# 3. Build frontend
cd frontend
npm run build
cd ..

# 4. Start with PM2
pm2 start backend/server.js --name sol-emp-backend
pm2 start frontend/server.js --name sol-emp-frontend

# 5. Save PM2 config
pm2 save
```

