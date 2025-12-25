#!/bin/bash

# ============================================
# Soliflex Employee Accommodation App
# Refresh/Update Script for Ubuntu VM
# Run this after pulling new code from Git
# ============================================

set -e  # Exit on any error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="/home/soliflexuser/accomodation/sol-emp-accomodation"
BACKEND_PORT=3000
FRONTEND_PORT=3600

echo -e "${YELLOW}🔄 Refreshing Soliflex Accommodation App...${NC}"
echo ""

# Check if app directory exists
if [ ! -d "$APP_DIR" ]; then
    echo -e "${RED}Error: Application directory not found: $APP_DIR${NC}"
    echo -e "${YELLOW}Please run setup.sh first${NC}"
    exit 1
fi

cd "$APP_DIR"

echo -e "${YELLOW}Step 1: Installing/Updating backend dependencies...${NC}"
cd backend
npm install
cd ..

echo ""
echo -e "${YELLOW}Step 2: Installing/Updating frontend dependencies...${NC}"
cd frontend
npm install
cd ..

echo ""
echo -e "${YELLOW}Step 3: Building frontend...${NC}"
cd frontend
npm run build
cd ..

echo ""
echo -e "${YELLOW}Step 4: Stopping PM2 processes...${NC}"
pm2 stop sol-emp-backend 2>/dev/null || true
pm2 stop sol-emp-frontend 2>/dev/null || true

echo ""
echo -e "${YELLOW}Step 5: Restarting applications with PM2...${NC}"
pm2 restart sol-emp-backend
pm2 restart sol-emp-frontend

echo ""
echo -e "${YELLOW}Step 6: Saving PM2 configuration...${NC}"
pm2 save

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ Refresh Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Backend is running on: ${GREEN}http://$(hostname -I | awk '{print $1}'):$BACKEND_PORT${NC}"
echo -e "Frontend is running on: ${GREEN}http://$(hostname -I | awk '{print $1}'):$FRONTEND_PORT${NC}"
echo ""
echo -e "Check status with: ${YELLOW}pm2 status${NC}"
echo -e "View logs with: ${YELLOW}pm2 logs${NC}"
echo ""

