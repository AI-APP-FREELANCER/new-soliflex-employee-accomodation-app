# Setup Complete - Port Configuration Summary

## ✅ Configuration Applied

### VM/Production Setup
- **Backend**: Port `3000` ✅
- **Frontend**: Port `3600` ✅
- **API Proxying**: Frontend server now proxies `/api/*` to backend on port 3000 ✅

### Local Development Setup
- **Backend**: Port `3000` (via `backend/.env`)
- **Frontend Dev Server**: Port `3001` (via `frontend/.env`)
- **API Proxying**: `setupProxy.js` proxies `/api/*` to `http://localhost:3000`

## Changes Made

### 1. Backend (`backend/server.js`)
- Default port set to `3000`
- Listens on `0.0.0.0` for VM access

### 2. Frontend Production Server (`frontend/server.js`)
- Default port set to `3600`
- **NEW**: Added API proxying to backend on port 3000
- Proxies all `/api/*` requests to `http://localhost:3000`

### 3. Frontend Development Proxy (`frontend/src/setupProxy.js`)
- Proxies `/api/*` to `http://localhost:3000` during development

### 4. Frontend API Service (`frontend/src/services/api.js`)
- Uses relative paths `/api` for both development and production
- Works with both proxy setups

### 5. Dependencies (`frontend/package.json`)
- Added `http-proxy-middleware` to dependencies (needed for production server)

## How It Works on VM

1. **Backend** runs on port `3000`
   - Accessible at: `http://vm-ip:3000`
   - API endpoints: `http://vm-ip:3000/api/*`

2. **Frontend** runs on port `3600`
   - Accessible at: `http://vm-ip:3600`
   - Serves React app
   - **Automatically proxies** `/api/*` requests to backend on port 3000

3. **User Experience**:
   - User visits: `http://vm-ip:3600`
   - Frontend makes API calls to `/api/auth/login`
   - Frontend server proxies to: `http://localhost:3000/api/auth/login`
   - Backend processes and returns response
   - Frontend receives response

## How It Works Locally

1. **Backend** runs on port `3000`
   ```bash
   cd backend
   npm start
   # Server is running on port 3000
   ```

2. **Frontend Dev Server** runs on port `3001`
   ```bash
   cd frontend
   npm start
   # Opens http://localhost:3001
   ```

3. **Proxy** (`setupProxy.js`) forwards `/api/*` to `http://localhost:3000`

## Environment Files

### `backend/.env` (Create if not exists)
```env
PORT=3000
JWT_SECRET=your-secret-key-here
NODE_ENV=production
```

### `frontend/.env` (For local development)
```env
PORT=3001
```

### `frontend/.env.production` (Optional - for VM if needed)
```env
# Usually not needed - frontend/server.js handles proxying
# Only set if you want to override backend URL
# BACKEND_URL=http://localhost:3000
```

## Starting on VM

```bash
# 1. Start Backend
cd backend
pm2 start server.js --name sol-emp-backend

# 2. Build Frontend
cd ../frontend
npm run build

# 3. Start Frontend
pm2 start server.js --name sol-emp-frontend

# 4. Save PM2 config
pm2 save
```

## Verification

### Test Backend Directly
```bash
curl http://localhost:3000/api/health
# Expected: {"status":"OK","message":"Soliflex Quarters Manager API is running"}
```

### Test Frontend
```bash
curl http://localhost:3600
# Expected: HTML content
```

### Test API Through Frontend
```bash
# From browser: http://vm-ip:3600
# Login should work - API calls go through frontend proxy
```

## Troubleshooting

### 404 on `/api/*` requests

1. **Check backend is running:**
   ```bash
   pm2 status
   pm2 logs sol-emp-backend
   ```

2. **Test backend directly:**
   ```bash
   curl http://localhost:3000/api/health
   ```

3. **Check frontend server logs:**
   ```bash
   pm2 logs sol-emp-frontend
   # Should show: "API requests will be proxied to http://localhost:3000"
   ```

4. **Verify http-proxy-middleware is installed:**
   ```bash
   cd frontend
   npm list http-proxy-middleware
   ```

### Port Already in Use

```bash
# Find process using port
sudo netstat -tulpn | grep :3000
sudo netstat -tulpn | grep :3600

# Kill process
sudo kill -9 <PID>
```

## Summary

✅ **Backend**: Port 3000 (VM and local)
✅ **Frontend**: Port 3600 (VM), Port 3001 (local dev)
✅ **API Proxying**: Automatic via frontend/server.js on VM
✅ **Development Proxy**: Automatic via setupProxy.js locally
✅ **No nginx required**: Frontend server handles proxying

The application is now configured to work seamlessly on your Ubuntu VM with backend on port 3000 and frontend on port 3600!

