# Final Port Configuration

## ✅ Configuration Applied

### Backend: Port 3000
- **File**: `backend/.env` contains `PORT=3000`
- **File**: `backend/server.js` defaults to port 3000
- **Status**: ✅ Configured

### Frontend: Port 3600
- **File**: `frontend/package.json` - start script uses `set PORT=3600`
- **File**: `frontend/.env` contains `PORT=3600`
- **Status**: ✅ Configured

### API Configuration
- **File**: `frontend/src/services/api.js` - points to `http://localhost:3000/api` for development
- **Status**: ✅ Configured

## How to Start

### 1. Kill any processes on port 3000 (if needed)
```powershell
.\kill-port-3000.ps1
```

### 2. Start Backend (Terminal 1)
```powershell
cd backend
npm start
```
**Expected Output**: `Server is running on port 3000`

### 3. Start Frontend (Terminal 2)
```powershell
cd frontend
npm start
```
**Expected Output**: 
- `Compiled successfully!`
- `You can now view soliflex-quarters-manager-frontend in the browser.`
- `Local: http://localhost:3600`

## Verification

### Test Backend
```powershell
curl http://localhost:3000/api/health
```
**Expected**: `{"status":"OK","message":"Soliflex Quarters Manager API is running"}`

### Test Frontend
1. Open browser: `http://localhost:3600`
2. Try to login: `admin` / `admin123`
3. Check browser console - should have no 504 errors

## Important Notes

1. **CORS**: Backend has CORS enabled, so direct API calls from `http://localhost:3600` to `http://localhost:3000` will work.

2. **Proxy**: The `setupProxy.js` is still present but won't be used since we're making direct API calls. It's harmless to leave it.

3. **Ports**:
   - Backend: **3000** (both local and VM)
   - Frontend: **3600** (both local and VM)

4. **API Calls**: Frontend makes direct calls to `http://localhost:3000/api/*` during development.

## Troubleshooting

### If you still get 504 errors:
1. **Verify backend is running**: Check Terminal 1 shows "Server is running on port 3000"
2. **Test backend directly**: `curl http://localhost:3000/api/health`
3. **Check browser console**: Look for the exact error message
4. **Verify ports**: Make sure nothing else is using ports 3000 or 3600

### If frontend doesn't start on 3600:
1. **Check `.env` file**: `frontend/.env` should contain `PORT=3600`
2. **Check package.json**: Start script should have `set PORT=3600 &&`
3. **Restart terminal**: Close and reopen the terminal after changes

## Files Modified

1. ✅ `backend/.env` - `PORT=3000`
2. ✅ `backend/server.js` - Defaults to port 3000
3. ✅ `frontend/package.json` - Start script: `set PORT=3600 && react-scripts start`
4. ✅ `frontend/.env` - `PORT=3600`
5. ✅ `frontend/src/services/api.js` - Points to `http://localhost:3000/api` for development

All configuration is complete! 🎉

