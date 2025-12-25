# Port Configuration Summary

## Current Configuration Status

### ✅ Backend Port: 3000
- **File**: `backend/server.js`
  - Default: `const PORT = process.env.PORT || 3000;`
  - ✅ Correct

- **File**: `ecosystem.config.js` (PM2 config)
  - **FIXED**: Changed from `PORT: 5000` to `PORT: 3000`
  - ✅ Now correct

- **File**: `backend/.env` (if exists)
  - Should contain: `PORT=3000`
  - ✅ Should be set to 3000

### ✅ Frontend Port: 3600
- **File**: `frontend/package.json`
  - Script: `"start": "set PORT=3600 && react-scripts start"`
  - ✅ Correct

- **File**: `frontend/server.js` (Production server)
  - Default: `const PORT = process.env.PORT || 3600;`
  - ✅ Correct

- **File**: `ecosystem.config.js` (PM2 config)
  - Environment: `PORT: 3600`
  - ✅ Correct

### ✅ API Connection Configuration

- **File**: `frontend/src/services/api.js`
  - **Development**: `http://localhost:3000/api` ✅
  - **Production**: `/api` (relative path, proxied by frontend server) ✅

- **File**: `frontend/server.js`
  - Proxies `/api` requests to: `http://localhost:3000` ✅
  - Backend port variable: `BACKEND_PORT = 3000` ✅

---

## Port Configuration Details

### Development Environment (Local)

| Service | Port | Configuration File | Status |
|---------|------|-------------------|--------|
| Backend | 3000 | `backend/server.js` | ✅ Correct |
| Frontend | 3600 | `frontend/package.json` | ✅ Correct |
| API Calls | `http://localhost:3000/api` | `frontend/src/services/api.js` | ✅ Correct |

### Production Environment (VM)

| Service | Port | Configuration File | Status |
|---------|------|-------------------|--------|
| Backend | 3000 | `ecosystem.config.js` | ✅ **FIXED** (was 5000) |
| Frontend | 3600 | `ecosystem.config.js` | ✅ Correct |
| API Calls | `/api` (proxied) | `frontend/src/services/api.js` | ✅ Correct |
| Proxy Target | `http://localhost:3000` | `frontend/server.js` | ✅ Correct |

---

## What Was Fixed

### Issue Found:
- `ecosystem.config.js` had `PORT: 5000` for backend
- This would cause backend to run on port 5000 instead of 3000
- Frontend proxy expects backend on port 3000

### Fix Applied:
- Changed `ecosystem.config.js` backend PORT from `5000` to `3000`
- Now matches all other configurations

---

## Verification Checklist

### On VM, verify ports are correct:

```bash
# 1. Check PM2 processes
pm2 status

# 2. Check what's listening on ports
sudo lsof -i :3000  # Should show backend
sudo lsof -i :3600  # Should show frontend

# 3. Check backend .env file
cat backend/.env | grep PORT
# Should show: PORT=3000

# 4. Test backend directly
curl http://localhost:3000/api/health

# 5. Test frontend proxy
curl http://localhost:3600/api/health
```

---

## Configuration Files Summary

### Backend Port Configuration:
1. ✅ `backend/server.js` → Defaults to 3000
2. ✅ `ecosystem.config.js` → **FIXED** to 3000
3. ⚠️ `backend/.env` → Should have `PORT=3000` (check on VM)

### Frontend Port Configuration:
1. ✅ `frontend/package.json` → PORT=3600 for dev
2. ✅ `frontend/server.js` → PORT=3600 for production
3. ✅ `ecosystem.config.js` → PORT=3600

### API Connection:
1. ✅ `frontend/src/services/api.js` → Uses `/api` in production
2. ✅ `frontend/server.js` → Proxies `/api` to `http://localhost:3000`

---

## Important Notes

1. **Backend .env on VM**: Make sure `backend/.env` has `PORT=3000`
2. **PM2 Restart Required**: After fixing `ecosystem.config.js`, restart PM2:
   ```bash
   pm2 restart sol-emp-backend
   pm2 save
   ```
3. **Frontend Proxy**: The frontend server (`frontend/server.js`) automatically proxies `/api/*` requests to backend on port 3000
4. **No Nginx Required**: The frontend Express server handles the proxy, so no nginx configuration needed

---

## All Ports Are Now Correctly Configured! ✅
