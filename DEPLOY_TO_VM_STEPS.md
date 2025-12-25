# Step-by-Step Deployment Guide to VM

## Prerequisites
- Git repository configured
- SSH access to VM
- PM2 installed on VM
- Backend port: 3000
- Frontend port: 3600

---

## PART 1: Local Machine - Push Code to GitHub

### Step 1: Check Current Status
```powershell
# Navigate to project directory
cd C:\Users\shyam\Documents\Dev\sol-emp-accomodation

# Check git status
git status
```

### Step 2: Stage All Changes
```powershell
# Add all modified and new files
git add .

# Verify what will be committed
git status
```

### Step 3: Commit Changes
```powershell
# Commit with descriptive message
git commit -m "Add PDF attachment feature with secure blob viewing"
```

### Step 4: Push to GitHub
```powershell
# Push to main branch (or your branch name)
git push origin main

# If you get an error about upstream, use:
# git push -u origin main
```

**✅ Verify:** Check GitHub to confirm your changes are pushed.

---

## PART 2: VM Server - Deploy Changes

### Step 5: SSH into VM
```bash
# Connect to your VM (replace with your actual credentials)
ssh soliflexuser@10.1.0.4
# Or: ssh your-username@your-vm-ip
```

### Step 6: Navigate to Project Directory
```bash
# Navigate to your project directory
cd ~/accomodation/new-soliflex-employee-accomodation-app
# Or wherever your project is located
```

### Step 7: Pull Latest Changes from GitHub
```bash
# Fetch and pull latest changes
git pull origin main

# If you get merge conflicts, resolve them first
# If you get authentication errors, check your SSH keys
```

### Step 8: Install New Backend Dependencies
```bash
# Navigate to backend directory
cd backend

# Install any new dependencies (multer was added)
npm install

# Verify multer is installed
npm list multer
```

### Step 9: Create Attachments Directory
```bash
# Go back to project root
cd ..

# Create attachments directory for PDF storage
mkdir -p attachments

# Verify it was created
ls -la attachments
```

### Step 10: Rebuild Frontend (IMPORTANT)
```bash
# Navigate to frontend directory
cd frontend

# Install any new frontend dependencies
npm install

# Build the production version
npm run build

# Verify build was successful
ls -la build
```

### Step 11: Verify API Configuration
```bash
# Check backend .env file exists and has correct port
cd ../backend
cat .env

# Should contain:
# PORT=3000
# JWT_SECRET=your-secret-here
# NODE_ENV=production

# If .env doesn't exist or is wrong, create/update it:
nano .env
# Add:
# PORT=3000
# JWT_SECRET=your-secure-secret-key-here
# NODE_ENV=production
```

### Step 12: Check PM2 Status
```bash
# Check current PM2 processes
pm2 status

# You should see:
# - sol-emp-backend (running on port 3000)
# - sol-emp-frontend (running on port 3600)
```

### Step 13: Restart Backend (to load multer)
```bash
# Restart backend to load new dependencies
pm2 restart sol-emp-backend

# Check logs for any errors
pm2 logs sol-emp-backend --lines 50
```

### Step 14: Restart Frontend (to load new build)
```bash
# Restart frontend to serve new build
pm2 restart sol-emp-frontend

# Check logs for any errors
pm2 logs sol-emp-frontend --lines 50
```

### Step 15: Save PM2 Configuration
```bash
# Save current PM2 state
pm2 save
```

---

## PART 3: Verification & Testing

### Step 16: Verify Backend is Running
```bash
# Check if backend is listening on port 3000
sudo netstat -tulpn | grep :3000
# Or: sudo lsof -i :3000

# Test backend API endpoint
curl http://localhost:3000/api/health
# Should return JSON response
```

### Step 17: Verify Frontend is Running
```bash
# Check if frontend is listening on port 3600
sudo netstat -tulpn | grep :3600
# Or: sudo lsof -i :3600
```

### Step 18: Test PDF Attachment Endpoint
```bash
# Test if attachment endpoint is accessible (will return 401 without auth, but confirms route exists)
curl -I http://localhost:3000/api/agreement/test-id/attachment
# Should return HTTP status (401 Unauthorized is expected without token)
```

### Step 19: Check PM2 Logs for Errors
```bash
# View recent backend logs
pm2 logs sol-emp-backend --lines 100

# View recent frontend logs
pm2 logs sol-emp-frontend --lines 100

# Look for any error messages
```

### Step 20: Verify File Permissions
```bash
# Check attachments directory permissions
ls -la attachments

# If needed, set proper permissions
chmod 755 attachments
```

---

## PART 4: Browser Testing

### Step 21: Access Application
1. Open browser and navigate to: `http://your-vm-ip:3600`
2. Login with your credentials
3. Navigate to **Agreements** page

### Step 22: Test PDF Upload Feature
1. Find an agreement without an attachment
2. Click **"Upload"** button
3. Select a PDF file (max 3MB)
4. Verify upload succeeds
5. Check that "Upload" button changes to "View" and "Delete" buttons

### Step 23: Test PDF View Feature
1. Click **"View"** (eye icon) button
2. Verify PDF opens in modal
3. Verify PDF content displays correctly
4. Close modal

### Step 24: Test PDF Delete Feature
1. Click **"Delete"** (trash icon) button
2. Confirm deletion in popup
3. Verify PDF is removed
4. Verify "Upload" button appears again

---

## Troubleshooting

### Issue: Backend won't start
```bash
# Check for errors
pm2 logs sol-emp-backend --err

# Common fixes:
# 1. Check if multer is installed
cd backend && npm list multer

# 2. Check if attachments directory exists
ls -la ../attachments

# 3. Check .env file
cat .env
```

### Issue: Frontend shows old version
```bash
# Rebuild frontend
cd frontend
rm -rf build
npm run build

# Restart frontend
pm2 restart sol-emp-frontend
```

### Issue: PDF upload fails
```bash
# Check attachments directory exists and has write permissions
ls -la attachments
chmod 755 attachments

# Check backend logs
pm2 logs sol-emp-backend --err
```

### Issue: PDF view shows "Cannot GET" error
```bash
# Verify attachment route is accessible
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/agreement/agreement_001/attachment

# Check backend logs for authentication errors
pm2 logs sol-emp-backend
```

### Issue: API calls failing
```bash
# Verify API base URL in frontend build
# The frontend should use '/api' in production (relative path)
# Check: frontend/src/services/api.js

# Verify nginx or proxy configuration if using one
```

---

## Quick Reference Commands

### On Local Machine (PowerShell):
```powershell
cd C:\Users\shyam\Documents\Dev\sol-emp-accomodation
git add .
git commit -m "Your commit message"
git push origin main
```

### On VM (Bash):
```bash
cd ~/accomodation/new-soliflex-employee-accomodation-app
git pull origin main
cd backend && npm install && cd ..
cd frontend && npm install && npm run build && cd ..
mkdir -p attachments
pm2 restart sol-emp-backend
pm2 restart sol-emp-frontend
pm2 save
pm2 logs
```

---

## Important Notes

1. **Port Configuration:**
   - Backend: Port 3000
   - Frontend: Port 3600
   - Verify these in your PM2 configuration

2. **API Configuration:**
   - In production, frontend uses relative path `/api`
   - Nginx or proxy should route `/api/*` to backend port 3000
   - Check `frontend/src/services/api.js` for API base URL logic

3. **File Storage:**
   - PDFs are stored in `attachments/` folder at project root
   - Files are named as `{agreement_id}.pdf`
   - Ensure directory has write permissions

4. **Environment Variables:**
   - Backend `.env` must have `PORT=3000`
   - Frontend uses `NODE_ENV=production` for API routing

5. **Dependencies:**
   - Backend: `multer@^2.0.2` (for PDF uploads)
   - Frontend: No new dependencies added

---

## Success Checklist

- [ ] Code pushed to GitHub
- [ ] Changes pulled on VM
- [ ] Backend dependencies installed (multer)
- [ ] Frontend rebuilt (`npm run build`)
- [ ] Attachments directory created
- [ ] Backend restarted with PM2
- [ ] Frontend restarted with PM2
- [ ] PM2 configuration saved
- [ ] Backend accessible on port 3000
- [ ] Frontend accessible on port 3600
- [ ] PDF upload works
- [ ] PDF view works (no authentication errors)
- [ ] PDF delete works
- [ ] No errors in PM2 logs

---

## Need Help?

If you encounter issues:
1. Check PM2 logs: `pm2 logs`
2. Check system resources: `pm2 monit`
3. Verify ports: `sudo netstat -tulpn | grep -E ':(3000|3600)'`
4. Check file permissions: `ls -la attachments`
5. Verify environment: `cat backend/.env`

