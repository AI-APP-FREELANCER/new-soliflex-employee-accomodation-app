#!/bin/bash

# ============================================
# Soliflex Employee Accommodation App
# Initial Setup Script for Ubuntu VM
# ============================================

set -e  # Exit on any error

echo "🚀 Starting Soliflex Accommodation App Setup..."
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
REPO_URL="https://github.com/AI-APP-FREELANCER/new-soliflex-employee-accomodation-app.git"
APP_DIR="/home/soliflexuser/accomodation/sol-emp-accomodation"
BACKEND_PORT=5000
FRONTEND_PORT=3600

echo -e "${YELLOW}Step 1: Checking prerequisites...${NC}"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js is not installed. Installing Node.js 18.x...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo -e "${GREEN}✓ Node.js is installed: $(node --version)${NC}"
fi

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}PM2 is not installed. Installing PM2 globally...${NC}"
    sudo npm install -g pm2
else
    echo -e "${GREEN}✓ PM2 is installed: $(pm2 --version)${NC}"
fi

# Check if Git is installed
if ! command -v git &> /dev/null; then
    echo -e "${RED}Git is not installed. Installing Git...${NC}"
    sudo apt-get update
    sudo apt-get install -y git
else
    echo -e "${GREEN}✓ Git is installed: $(git --version)${NC}"
fi

echo ""
echo -e "${YELLOW}Step 2: Creating application directory...${NC}"
mkdir -p "$(dirname $APP_DIR)"
cd "$(dirname $APP_DIR)"

if [ -d "$APP_DIR" ]; then
    echo -e "${YELLOW}Directory already exists. Removing old installation...${NC}"
    rm -rf "$APP_DIR"
fi

echo ""
echo -e "${YELLOW}Step 3: Cloning repository...${NC}"
git clone "$REPO_URL" "$APP_DIR"
cd "$APP_DIR"

echo ""
echo -e "${YELLOW}Step 4: Installing backend dependencies...${NC}"
cd backend
npm install
cd ..

echo ""
echo -e "${YELLOW}Step 5: Installing frontend dependencies...${NC}"
cd frontend
npm install
cd ..

echo ""
echo -e "${YELLOW}Step 6: Building frontend...${NC}"
cd frontend
npm run build
cd ..

echo ""
echo -e "${YELLOW}Step 7: Creating .env file for backend (if not exists)...${NC}"
cd backend
if [ ! -f .env ]; then
    cat > .env << EOF
NODE_ENV=production
PORT=$BACKEND_PORT
EOF
    echo -e "${GREEN}✓ Created .env file${NC}"
else
    echo -e "${YELLOW}✓ .env file already exists${NC}"
fi
cd ..

echo ""
echo -e "${YELLOW}Step 8: Creating PM2 ecosystem configuration...${NC}"
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [
    {
      name: 'sol-emp-backend',
      script: './backend/server.js',
      cwd: '$APP_DIR',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: $BACKEND_PORT
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
      cwd: '$APP_DIR',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: $FRONTEND_PORT
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
echo -e "${GREEN}✓ Created ecosystem.config.js${NC}"

echo ""
echo -e "${YELLOW}Step 9: Creating logs directory...${NC}"
mkdir -p logs

echo ""
echo -e "${YELLOW}Step 10: Stopping existing PM2 processes (if any)...${NC}"
pm2 delete sol-emp-backend 2>/dev/null || true
pm2 delete sol-emp-frontend 2>/dev/null || true

echo ""
echo -e "${YELLOW}Step 11: Starting applications with PM2...${NC}"
pm2 start ecosystem.config.js

echo ""
echo -e "${YELLOW}Step 12: Saving PM2 configuration...${NC}"
pm2 save

echo ""
echo -e "${YELLOW}Step 13: Setting up PM2 startup script...${NC}"
pm2 startup | grep -v PM2 | bash || true

echo ""
echo -e "${YELLOW}Step 14: Configuring firewall (if ufw is active)...${NC}"
if command -v ufw &> /dev/null && sudo ufw status | grep -q "Status: active"; then
    echo -e "${YELLOW}Opening ports $BACKEND_PORT and $FRONTEND_PORT...${NC}"
    sudo ufw allow $BACKEND_PORT/tcp
    sudo ufw allow $FRONTEND_PORT/tcp
    echo -e "${GREEN}✓ Firewall rules added${NC}"
else
    echo -e "${YELLOW}Firewall (ufw) is not active or not installed${NC}"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Backend is running on: ${GREEN}http://$(hostname -I | awk '{print $1}'):$BACKEND_PORT${NC}"
echo -e "Frontend is running on: ${GREEN}http://$(hostname -I | awk '{print $1}'):$FRONTEND_PORT${NC}"
echo ""
echo -e "Useful commands:"
echo -e "  ${YELLOW}pm2 status${NC}          - Check application status"
echo -e "  ${YELLOW}pm2 logs${NC}            - View all logs"
echo -e "  ${YELLOW}pm2 logs sol-emp-backend${NC}  - View backend logs"
echo -e "  ${YELLOW}pm2 logs sol-emp-frontend${NC} - View frontend logs"
echo -e "  ${YELLOW}pm2 restart all${NC}     - Restart all applications"
echo -e "  ${YELLOW}pm2 stop all${NC}        - Stop all applications"
echo ""
echo -e "To update the app in the future, run: ${GREEN}./refresh.sh${NC}"
echo ""

