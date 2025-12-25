# Guide: Push Code to GitHub and Update VM

## Part 1: Push Code to GitHub (Local Machine)

### Step 1: Check Git Status
```bash
git status
```

### Step 2: Add Changed Files
```bash
# Add all changed files
git add .

# OR add specific files
git add backend/routes/analytics.js
git add frontend/src/components/DashboardHome.js
```

### Step 3: Commit Changes
```bash
git commit -m "Refactor dashboard: Restore all cards and metrics with proper calculations"
```

### Step 4: Push to GitHub
```bash
git push origin main
```

If you're on a different branch:
```bash
git push origin <your-branch-name>
```

---

## Part 2: Update VM Deployment

### Option A: Using the Update Script (Recommended)

1. **SSH into your VM:**
```bash
ssh soliflexuser@10.1.0.4
# OR
ssh username@your-vm-ip
```

2. **Navigate to the app directory:**
```bash
cd ~/accomodation/new-soliflex-employee-accomodation-app
# OR
cd /home/soliflexuser/accomodation/new-soliflex-employee-accomodation-app
```

3. **Make the script executable (first time only):**
```bash
chmod +x update-vm.sh
```

4. **Run the update script:**
```bash
bash update-vm.sh
```

This script will:
- Pull latest code from GitHub
- Update backend dependencies
- Update frontend dependencies
- **Build the frontend** (creates new `build/` folder)
- Restart PM2 processes
- Show status and logs

---

### Option B: Manual Update (Step by Step)

1. **SSH into your VM:**
```bash
ssh soliflexuser@10.1.0.4
```

2. **Navigate to the app directory:**
```bash
cd ~/accomodation/new-soliflex-employee-accomodation-app
```

3. **Pull latest code:**
```bash
git pull origin main
```

4. **Update backend dependencies:**
```bash
cd backend
npm install
cd ..
```

5. **Update frontend dependencies:**
```bash
cd frontend
npm install
```

6. **CRITICAL: Build the frontend:**
```bash
npm run build
```
This creates/updates the `frontend/build/` directory with your new code.

7. **Go back to project root:**
```bash
cd ..
```

8. **Restart PM2 processes:**
```bash
pm2 restart sol-emp-backend
pm2 restart sol-emp-frontend
```

9. **Verify they're running:**
```bash
pm2 status
```

10. **Check logs if needed:**
```bash
pm2 logs sol-emp-backend --lines 50
pm2 logs sol-emp-frontend --lines 50
```

---

## Verification

After updating, verify the changes:

1. **Check PM2 Status:**
```bash
pm2 status
```

You should see:
- `sol-emp-backend` - status: online
- `sol-emp-frontend` - status: online

2. **Test Backend:**
```bash
curl http://localhost:3000/api/analytics
```

3. **Test Frontend:**
Open in browser: `http://10.1.0.4:3600` (or your VM IP)

4. **Check Dashboard:**
- Navigate to Dashboard
- Verify all cards are showing
- Check that numbers are populated correctly
- Verify charts are displaying

---

## Troubleshooting

### If PM2 processes don't restart:
```bash
pm2 delete sol-emp-backend
pm2 delete sol-emp-frontend
pm2 start ecosystem.config.js
```

### If frontend shows old code:
```bash
cd frontend
rm -rf build
npm run build
cd ..
pm2 restart sol-emp-frontend
```

### If backend shows errors:
```bash
pm2 logs sol-emp-backend --err
cd backend
npm install
cd ..
pm2 restart sol-emp-backend
```

### Check if ports are in use:
```bash
sudo netstat -tulpn | grep :3000
sudo netstat -tulpn | grep :3600
```

### View all PM2 processes:
```bash
pm2 list
```

---

## Quick Reference

**PM2 Process Names:**
- `sol-emp-backend` - Backend API (port 3000)
- `sol-emp-frontend` - Frontend server (port 3600)

**Important Paths:**
- Project: `~/accomodation/new-soliflex-employee-accomodation-app`
- Frontend Build: `frontend/build/`
- Logs: `logs/`

**Key Commands:**
```bash
# Status
pm2 status

# Logs
pm2 logs

# Restart
pm2 restart sol-emp-backend
pm2 restart sol-emp-frontend

# Stop
pm2 stop sol-emp-backend
pm2 stop sol-emp-frontend
```

