# NEW SIMPLE DEPLOYMENT METHOD - Ubuntu VM

This is a completely new, simpler deployment method using Express to serve the frontend.

## Step-by-Step Instructions

### Step 1: On Your Ubuntu Server - Install Dependencies

```bash
# SSH into your server
ssh soliflexuser@your-vm-ip

# Navigate to project
cd ~/accomodation/new-soliflex-employee-accomodation-app

# Pull latest code (if using Git)
git pull origin main

# Install Express in frontend (required for the new server.js)
cd frontend
npm install express

# Go back to root
cd ..
```

### Step 2: Make Sure Frontend is Built

```bash
cd ~/accomodation/new-soliflex-employee-accomodation-app/frontend

# Build the frontend
npm run build

# Verify build directory exists
ls -la build/
```

### Step 3: Create/Update ecosystem.config.js on Server

```bash
cd ~/accomodation/new-soliflex-employee-accomodation-app

cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'sol-emp-backend',
      script: './backend/server.js',
      cwd: '/home/soliflexuser/accomodation/new-soliflex-employee-accomodation-app',
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
      script: './frontend/server.js',
      cwd: '/home/soliflexuser/accomodation/new-soliflex-employee-accomodation-app',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false
    }
  ]
};
EOF
```

### Step 4: Create Logs Directory

```bash
mkdir -p ~/accomodation/new-soliflex-employee-accomodation-app/logs
```

### Step 5: Stop Old Processes and Start New Ones

```bash
cd ~/accomodation/new-soliflex-employee-accomodation-app

# Stop all old processes
pm2 stop all
pm2 delete all

# Start with new config
pm2 start ecosystem.config.js

# Check status
pm2 status

# View logs
pm2 logs
```

### Step 6: Save PM2 Configuration

```bash
pm2 save
pm2 startup
# Run the command it outputs
```

### Step 7: Test

```bash
# Test backend
curl http://localhost:5000/api/health

# Test frontend
curl http://localhost:3000

# Should return HTML content
```

## Complete Command Sequence (Copy-Paste)

```bash
# 1. Navigate to project
cd ~/accomodation/new-soliflex-employee-accomodation-app

# 2. Pull latest code
git pull origin main

# 3. Install Express in frontend
cd frontend
npm install express
npm run build
cd ..

# 4. Create ecosystem.config.js (use the content from Step 3 above)

# 5. Create logs directory
mkdir -p logs

# 6. Stop and delete old processes
pm2 stop all
pm2 delete all

# 7. Start new processes
pm2 start ecosystem.config.js

# 8. Check status
pm2 status
pm2 logs

# 9. Save configuration
pm2 save
pm2 startup
```

## Verify Everything Works

```bash
# Check PM2 status
pm2 status
# Both should show "online"

# Check logs
pm2 logs sol-emp-frontend
# Should see: "Frontend server is running on port 3000"

# Test from server
curl http://localhost:3000
# Should return HTML

# Test backend
curl http://localhost:5000/api/health
# Should return JSON
```

## Troubleshooting

### If frontend server.js doesn't exist:
Make sure you pulled the latest code from Git, or create it manually:

```bash
cd ~/accomodation/new-soliflex-employee-accomodation-app/frontend
cat > server.js << 'EOF'
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'build')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Frontend server is running on port ${PORT}`);
});
EOF
```

### If Express is not installed:
```bash
cd ~/accomodation/new-soliflex-employee-accomodation-app/frontend
npm install express
```

### Check if build exists:
```bash
ls -la ~/accomodation/new-soliflex-employee-accomodation-app/frontend/build/
```

## This Method is Better Because:

1. ✅ No dependency on `serve` package
2. ✅ Uses Express (already familiar)
3. ✅ More reliable and easier to debug
4. ✅ Better error handling
5. ✅ Works consistently with PM2

