#!/bin/bash

# ============================================
# Fix Frontend 404 Issue
# ============================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

APP_DIR="/home/soliflexuser/accomodation/new-soliflex-employee-accomodation-app"

echo -e "${YELLOW}Checking frontend build...${NC}"

cd "$APP_DIR"

# Check if build directory exists
if [ ! -d "frontend/build" ]; then
    echo -e "${RED}✗ Build directory not found!${NC}"
    echo -e "${YELLOW}Building frontend...${NC}"
    cd frontend
    npm run build
    cd ..
else
    echo -e "${GREEN}✓ Build directory exists${NC}"
    
    # Check if build directory is empty
    if [ -z "$(ls -A frontend/build)" ]; then
        echo -e "${RED}✗ Build directory is empty!${NC}"
        echo -e "${YELLOW}Rebuilding frontend...${NC}"
        cd frontend
        npm run build
        cd ..
    else
        echo -e "${GREEN}✓ Build files exist${NC}"
        echo -e "${YELLOW}Checking build contents...${NC}"
        ls -la frontend/build/ | head -10
    fi
fi

# Verify server.js is correct
echo ""
echo -e "${YELLOW}Checking frontend/server.js configuration...${NC}"
if grep -q "express.static.*build" frontend/server.js; then
    echo -e "${GREEN}✓ server.js is configured correctly${NC}"
else
    echo -e "${RED}✗ server.js might be misconfigured${NC}"
    cat frontend/server.js
fi

# Restart frontend
echo ""
echo -e "${YELLOW}Restarting frontend...${NC}"
pm2 restart sol-emp-frontend

echo ""
echo -e "${YELLOW}Waiting 3 seconds for server to start...${NC}"
sleep 3

# Test again
echo ""
echo -e "${YELLOW}Testing frontend...${NC}"
PRIVATE_IP=$(hostname -I | awk '{print $1}')
curl -I http://$PRIVATE_IP:3000 || echo -e "${RED}Still not working${NC}"

echo ""
echo -e "${GREEN}Done! Check PM2 logs: pm2 logs sol-emp-frontend${NC}"

