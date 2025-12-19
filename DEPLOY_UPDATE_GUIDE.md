# How to Update the Employee Accommodation App on VM

## Understanding the Setup

Your app runs on the VM using **PM2** with two processes:
- `sol-emp-backend` - Backend API (port 5000)
- `sol-emp-frontend` - Frontend server (port 3600) - **serves built files from `frontend/build/`**

**IMPORTANT**: The frontend serves **compiled/built** files, not source code. You MUST rebuild the frontend after code changes!

## Quick Update Process (After Pulling Code)

### Option 1: Use the Refresh Script (Recommended)

```bash
# SSH into your VM
ssh username@your-vm-ip

# Navigate to your app directory
cd ~/sol-emp-accomodation
# OR: cd /home/soliflexuser/accomodation/sol-emp-accomodation

# Pull latest code (if not already done)
git pull origin main

# Run the refresh script
bash refresh.sh
```

This script will:
1. Install/update backend dependencies
2. Install/update frontend dependencies
3. **Build the frontend** (creates new `build/` folder)
4. Restart only the sol-emp PM2 processes

### Option 2: Manual Update (Step by Step)

```bash
# 1. SSH into VM
ssh username@your-vm-ip

# 2. Navigate to app directory
cd ~/sol-emp-accomodation
# OR: cd /home/soliflexuser/accomodation/sol-emp-accomodation

# 3. Pull latest code (if not already done)
git pull origin main

# 4. Update backend dependencies (if package.json changed)
cd backend
npm install
cd ..

# 5. Update frontend dependencies (if package.json changed)
cd frontend
npm install

# 6. **CRITICAL: Rebuild the frontend**
npm run build
# This creates/updates the `frontend/build/` directory with your new code

cd ..

# 7. Restart ONLY the sol-emp processes (not the other app)
pm2 restart sol-emp-backend
pm2 restart sol-emp-frontend

# 8. Verify they're running
pm2 status

# 9. Check logs if needed
pm2 logs sol-emp-frontend --lines 50
pm2 logs sol-emp-backend --lines 50
```

## Understanding PM2 Process Names

Your PM2 processes are named:
- `sol-emp-backend` - Employee accommodation backend
- `sol-emp-frontend` - Employee accommodation frontend
- `soliflex-backend` - Other app (DO NOT restart this)
- `soliflex-frontend` - Other app (DO NOT restart this)

## Restarting Only the Employee Accommodation App

```bash
# Restart only backend
pm2 restart sol-emp-backend

# Restart only frontend
pm2 restart sol-emp-frontend

# Restart both (employee accommodation only)
pm2 restart sol-emp-backend sol-emp-frontend

# DO NOT run: pm2 restart all (this would restart the other app too!)
```

## Why Changes Don't Appear After Just Restarting PM2

The frontend server (`frontend/server.js`) serves static files from the `frontend/build/` directory. When you:
1. Pull new code → Source files change
2. Restart PM2 → Still serves OLD built files

You need to:
1. Pull new code → Source files change
2. **Run `npm run build`** → Creates NEW built files
3. Restart PM2 → Now serves NEW built files ✅

## Troubleshooting

### Check if processes are running:
```bash
pm2 status
```

### View logs:
```bash
# All logs
pm2 logs

# Specific app logs
pm2 logs sol-emp-frontend
pm2 logs sol-emp-backend

# Last 100 lines
pm2 logs sol-emp-frontend --lines 100
```

### Check if build was successful:
```bash
cd ~/sol-emp-accomodation/frontend
ls -la build/
# Should see index.html and static/ folder
```

### Force rebuild if needed:
```bash
cd ~/sol-emp-accomodation/frontend
rm -rf build/  # Remove old build
npm run build  # Create fresh build
cd ..
pm2 restart sol-emp-frontend
```

### Verify ports are correct:
```bash
# Check what's on port 5000 (backend)
sudo lsof -i :5000

# Check what's on port 3600 (frontend)
sudo lsof -i :3600
```

## Quick Reference Commands

```bash
# Full update process
cd ~/sol-emp-accomodation
git pull origin main
cd frontend && npm install && npm run build && cd ..
pm2 restart sol-emp-backend sol-emp-frontend

# Check status
pm2 status

# View logs
pm2 logs sol-emp-frontend --lines 50
```

## Important Notes

1. **Always rebuild frontend** after code changes: `cd frontend && npm run build`
2. **Only restart sol-emp processes**, not all PM2 processes
3. The frontend serves from `build/` folder, not `src/` folder
4. Backend changes only need PM2 restart (no build needed)
5. Frontend changes need build + PM2 restart

