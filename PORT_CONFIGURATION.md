# Port Configuration Guide

## VM/Production Configuration

- **Backend**: Port `3000`
- **Frontend**: Port `3600`

## Local Development Configuration

To avoid port conflicts during local development:

- **Backend**: Port `3000` (matches VM)
- **Frontend Dev Server**: Port `3001` (to avoid conflict with backend on 3000)

### Setup for Local Development

1. **Backend** - Ensure `.env` file in `backend/` directory has:
   ```env
   PORT=3000
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
   NODE_ENV=development
   ```

2. **Frontend** - Create `.env` file in `frontend/` directory with:
   ```env
   PORT=3001
   ```

3. **Start Services**:
   ```bash
   # Terminal 1 - Backend (MUST START FIRST)
   cd backend
   npm start
   # Backend will run on http://localhost:3000
   # You should see: "Server is running on port 3000"
   
   # Terminal 2 - Frontend
   cd frontend
   npm start
   # Frontend will run on http://localhost:3001
   # API calls will be proxied to backend on port 3000
   ```

### How It Works

- Frontend dev server runs on port 3001
- All `/api/*` requests are proxied to `http://localhost:3000` (backend)
- This matches the VM configuration where backend is on 3000 and frontend is on 3600

### Proxy Configuration

The `frontend/src/setupProxy.js` file is configured to proxy all `/api/*` requests to:
```
http://localhost:3000
```

This ensures API calls from the frontend dev server (port 3001) are forwarded to the backend (port 3000).

### Troubleshooting 504 Gateway Timeout

If you see `504 Gateway Timeout` errors:

1. **Ensure backend is running FIRST:**
   ```bash
   cd backend
   npm start
   # Wait for: "Server is running on port 3000"
   ```

2. **Test backend directly:**
   ```bash
   curl http://localhost:3000/api/health
   # Should return: {"status":"OK","message":"Soliflex Quarters Manager API is running"}
   ```

3. **Then start frontend:**
   ```bash
   cd frontend
   npm start
   ```

4. **Verify .env files exist:**
   - `backend/.env` should have `PORT=3000`
   - `frontend/.env` should have `PORT=3001`

### Important Notes

- **Backend MUST be running before starting frontend**
- If backend isn't running, you'll get 504 Gateway Timeout errors
- The proxy only works when both servers are running
- Always start backend first, then frontend

