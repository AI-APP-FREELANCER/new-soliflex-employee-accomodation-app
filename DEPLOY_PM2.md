# PM2 Deployment Guide - Ubuntu VM Server

## Prerequisites
- Ubuntu VM server with SSH access
- Node.js and npm installed on server
- Git repository (or SCP access)

---

## STEP 1: Prepare Your Code (On Your Local Machine)

### 1.1 Commit and Push to Git (if using Git)

```bash
# Navigate to project directory
cd C:\Users\shyam\Documents\Dev\sol-emp-accomodation

# Check status
git status

# Add all changes
git add .

# Commit
git commit -m "Deploy pro-rata cost aggregation with PM2"

# Push to remote
git push origin main
# or: git push origin master
```

---

## STEP 2: Connect to Your Ubuntu VM Server

```bash
# SSH into your server
ssh username@your-vm-ip
# Example: ssh ubuntu@192.168.1.100
```

---

## STEP 3: Initial Server Setup (Run Once)

### 3.1 Install Node.js (if not installed)

```bash
# Update package list
sudo apt update

# Install Node.js 18.x LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version
npm --version
```

### 3.2 Install PM2 Globally

```bash
sudo npm install -g pm2
```

### 3.3 Install Git (if not installed)

```bash
sudo apt install git
```

---

## STEP 4: Clone/Transfer Your Project

### Option A: Using Git (Recommended)

```bash
# Navigate to where you want the project
cd ~
# or: cd /var/www

# Clone your repository
git clone https://github.com/your-username/your-repo.git sol-emp-accommodation
# OR if you already have it, just pull:
cd sol-emp-accommodation
git pull origin main
```

### Option B: Using SCP (from your local machine)

```bash
# From your local Windows machine (PowerShell)
scp -r C:\Users\shyam\Documents\Dev\sol-emp-accomodation username@your-vm-ip:~/sol-emp-accommodation
```

---

## STEP 5: Install Dependencies

```bash
# Navigate to project directory
cd ~/sol-emp-accommodation
# or: cd /var/www/sol-emp-accommodation

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

---

## STEP 6: Configure Environment Variables

### 6.1 Backend .env File

```bash
# Create .env file in backend directory
cd ~/sol-emp-accommodation/backend
nano .env
```

Add these lines:
```env
PORT=5000
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
NODE_ENV=production
```

Save and exit (Ctrl+X, then Y, then Enter)

### 6.2 Frontend Environment (if needed)

```bash
# Create .env file in frontend directory
cd ~/sol-emp-accommodation/frontend
nano .env
```

Add this line (if your API is on different domain):
```env
REACT_APP_API_URL=http://your-vm-ip:5000
# or: REACT_APP_API_URL=http://your-domain.com:5000
```

---

## STEP 7: Build Frontend

```bash
cd ~/sol-emp-accommodation/frontend
npm run build
```

This creates a `build` folder with production-ready files.

---

## STEP 8: Set Up PM2 Configuration

### 8.1 Create PM2 Ecosystem File

```bash
cd ~/sol-emp-accommodation
nano ecosystem.config.js
```

Add this content:

```javascript
module.exports = {
  apps: [
    {
      name: 'sol-emp-backend',
      script: './backend/server.js',
      cwd: '/home/username/sol-emp-accommodation',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    },
    {
      name: 'sol-emp-frontend',
      script: 'serve',
      args: '-s build -l 3000',
      cwd: '/home/username/sol-emp-accommodation/frontend',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: '../logs/frontend-error.log',
      out_file: '../logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false
    }
  ]
};
```

**IMPORTANT:** Replace `/home/username/sol-emp-accommodation` with your actual project path!

Save and exit (Ctrl+X, then Y, then Enter)

### 8.2 Install serve (for serving frontend build)

```bash
sudo npm install -g serve
```

### 8.3 Create logs directory

```bash
cd ~/sol-emp-accommodation
mkdir -p logs
```

---

## STEP 9: Start Applications with PM2

```bash
# Navigate to project root
cd ~/sol-emp-accommodation

# Start both applications using ecosystem file
pm2 start ecosystem.config.js

# Or start individually:
# pm2 start ecosystem.config.js --only sol-emp-backend
# pm2 start ecosystem.config.js --only sol-emp-frontend
```

---

## STEP 10: Verify Applications are Running

```bash
# Check PM2 status
pm2 status

# View logs
pm2 logs

# View specific app logs
pm2 logs sol-emp-backend
pm2 logs sol-emp-frontend

# Check if ports are listening
sudo netstat -tulpn | grep :5000
sudo netstat -tulpn | grep :3000
```

---

## STEP 11: Save PM2 Configuration and Set Auto-Start

```bash
# Save current PM2 process list
pm2 save

# Generate startup script
pm2 startup

# Copy and run the command it outputs (something like):
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u username --hp /home/username
```

---

## STEP 12: Configure Firewall (if needed)

```bash
# Allow ports 3000 and 5000
sudo ufw allow 3000/tcp
sudo ufw allow 5000/tcp

# If using SSH, make sure it's allowed
sudo ufw allow 22/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

---

## STEP 13: Test Your Application

### Test Backend:
```bash
curl http://localhost:5000/api/health
# Should return: {"status":"OK","message":"Soliflex Quarters Manager API is running"}
```

### Test Frontend:
Open in browser: `http://your-vm-ip:3000`

---

## Useful PM2 Commands

```bash
# View all processes
pm2 status

# View logs (all apps)
pm2 logs

# View logs (specific app)
pm2 logs sol-emp-backend
pm2 logs sol-emp-frontend

# Restart all apps
pm2 restart all

# Restart specific app
pm2 restart sol-emp-backend
pm2 restart sol-emp-frontend

# Stop all apps
pm2 stop all

# Stop specific app
pm2 stop sol-emp-backend

# Delete app from PM2
pm2 delete sol-emp-backend

# Monitor resources
pm2 monit

# Reload (zero-downtime restart)
pm2 reload all
```

---

## Updating Your Application

When you make changes and want to deploy:

```bash
# 1. On your local machine: commit and push
git add .
git commit -m "Your update message"
git push

# 2. On server: pull latest changes
cd ~/sol-emp-accommodation
git pull origin main

# 3. Install any new dependencies
cd backend && npm install
cd ../frontend && npm install

# 4. Rebuild frontend (if frontend changed)
cd frontend && npm run build

# 5. Restart PM2 apps
pm2 restart all
# or
pm2 restart sol-emp-backend
pm2 restart sol-emp-frontend
```

---

## Troubleshooting

### Check if apps are running:
```bash
pm2 status
```

### View error logs:
```bash
pm2 logs sol-emp-backend --err
pm2 logs sol-emp-frontend --err
```

### Check if ports are in use:
```bash
sudo lsof -i :5000
sudo lsof -i :3000
```

### Kill process on port (if needed):
```bash
sudo kill -9 $(sudo lsof -t -i:5000)
sudo kill -9 $(sudo lsof -t -i:3000)
```

### Restart PM2:
```bash
pm2 restart all
```

### Check system resources:
```bash
pm2 monit
```

---

## Quick Reference: All Commands in Order

```bash
# 1. SSH to server
ssh username@your-vm-ip

# 2. Install Node.js (if needed)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 3. Install PM2 and serve
sudo npm install -g pm2 serve

# 4. Clone/transfer project
cd ~
git clone your-repo-url sol-emp-accommodation
# OR use SCP from local machine

# 5. Install dependencies
cd sol-emp-accommodation/backend && npm install
cd ../frontend && npm install

# 6. Create backend .env
cd ../backend
nano .env
# Add: PORT=5000, JWT_SECRET=your-secret, NODE_ENV=production

# 7. Build frontend
cd ../frontend
npm run build

# 8. Create ecosystem.config.js in project root
cd ..
nano ecosystem.config.js
# (Add the config from Step 8.1 above)

# 9. Create logs directory
mkdir -p logs

# 10. Start with PM2
pm2 start ecosystem.config.js

# 11. Save and setup auto-start
pm2 save
pm2 startup
# (Run the command it outputs)

# 12. Configure firewall
sudo ufw allow 3000/tcp
sudo ufw allow 5000/tcp
sudo ufw enable

# 13. Test
curl http://localhost:5000/api/health
# Visit: http://your-vm-ip:3000
```

---

## Notes

- Replace `username` with your actual Ubuntu username
- Replace `your-vm-ip` with your actual VM IP address
- Update the path in `ecosystem.config.js` to match your actual project location
- Make sure your backend Excel file is in the correct location on the server
- Consider setting up Nginx as a reverse proxy for production use

