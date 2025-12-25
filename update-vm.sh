#!/bin/bash

# Update Script for Employee Accommodation App on VM
# This script updates the app after pulling code from GitHub

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Employee Accommodation App - Update${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

# Step 1: Pull latest code
echo -e "${YELLOW}Step 1: Pulling latest code from GitHub...${NC}"
git pull origin main
if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Failed to pull code from GitHub${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Code pulled successfully${NC}"
echo ""

# Step 2: Update backend dependencies
echo -e "${YELLOW}Step 2: Updating backend dependencies...${NC}"
cd backend
npm install
if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Failed to install backend dependencies${NC}"
    exit 1
fi
cd ..
echo -e "${GREEN}✓ Backend dependencies updated${NC}"
echo ""

# Step 3: Update frontend dependencies
echo -e "${YELLOW}Step 3: Updating frontend dependencies...${NC}"
cd frontend
npm install
if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Failed to install frontend dependencies${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Frontend dependencies updated${NC}"
echo ""

# Step 4: Build frontend (CRITICAL - this creates the build folder)
echo -e "${YELLOW}Step 4: Building frontend (this may take a minute)...${NC}"
npm run build
if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Failed to build frontend${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Frontend built successfully${NC}"
cd ..
echo ""

# Step 5: Restart PM2 processes
echo -e "${YELLOW}Step 5: Restarting PM2 processes...${NC}"
pm2 restart sol-emp-backend
pm2 restart sol-emp-frontend
echo -e "${GREEN}✓ PM2 processes restarted${NC}"
echo ""

# Step 6: Show status
echo -e "${YELLOW}Step 6: Current PM2 Status:${NC}"
pm2 status
echo ""

# Step 7: Show recent logs
echo -e "${YELLOW}Step 7: Recent logs (last 10 lines):${NC}"
echo -e "${YELLOW}Backend logs:${NC}"
pm2 logs sol-emp-backend --lines 10 --nostream
echo ""
echo -e "${YELLOW}Frontend logs:${NC}"
pm2 logs sol-emp-frontend --lines 10 --nostream
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ Update Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Backend is running on: http://10.1.0.4:3000"
echo "Frontend is running on: http://10.1.0.4:3600"
echo ""
echo "Check status with: pm2 status"
echo "View logs with: pm2 logs"
echo ""

