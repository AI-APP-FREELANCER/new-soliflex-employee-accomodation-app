# Local Development Setup

## Port Configuration

### VM/Production
- **Backend**: Port `3000`
- **Frontend**: Port `3600`

### Local Development
- **Backend**: Port `3000` (matches VM)
- **Frontend Dev Server**: Port `3001` (to avoid conflict with backend on 3000)

## Setup Steps

### 1. Backend Configuration

Ensure `backend/.env` file exists with:
```env
PORT=3000
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
NODE_ENV=development
```

### 2. Frontend Configuration

Create `frontend/.env` file with:
```env
PORT=3001
```

This ensures the React dev server runs on port 3001, avoiding conflict with backend on port 3000.

### 3. Start Services

**Terminal 1 - Backend:**
```bash
cd backend
npm start
```
Backend will run on: `http://localhost:3000`

**Terminal 2 - Frontend:**
```bash
cd frontend
npm start
```
Frontend will run on: `http://localhost:3001`

### 4. How It Works

- Frontend dev server (port 3001) makes API calls to `/api/*`
- `setupProxy.js` intercepts `/api/*` requests and forwards them to `http://localhost:3000` (backend)
- Backend processes the request and returns the response

## Troubleshooting

### 504 Gateway Timeout

If you see `504 Gateway Timeout` errors:

1. **Check if backend is running:**
   ```bash
   # In backend directory
   npm start
   # Should see: "Server is running on port 3000"
   ```

2. **Verify backend is accessible:**
   ```bash
   curl http://localhost:3000/api/health
   # Should return: {"status":"OK","message":"Soliflex Quarters Manager API is running"}
   ```

3. **Check frontend .env file:**
   ```bash
   # In frontend directory
   cat .env
   # Should show: PORT=3001
   ```

4. **Restart both servers:**
   - Stop both servers (Ctrl+C)
   - Start backend first
   - Then start frontend

### Port Already in Use

If you get "port already in use" error:

1. **Find what's using the port:**
   ```bash
   # Windows PowerShell
   netstat -ano | findstr :3000
   netstat -ano | findstr :3001
   ```

2. **Kill the process:**
   ```bash
   # Replace <PID> with the process ID from above
   taskkill /PID <PID> /F
   ```

## File Locations

- Backend config: `backend/.env`
- Frontend config: `frontend/.env`
- Proxy config: `frontend/src/setupProxy.js`
- API config: `frontend/src/services/api.js`

