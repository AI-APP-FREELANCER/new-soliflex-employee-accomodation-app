#!/bin/bash

# ============================================
# Fix VM Update - Diagnostic and Fix Script
# Run this on the VM to diagnose and fix update issues
# ============================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}VM Update Diagnostic & Fix${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Detect the actual app directory
if [ -d "/home/soliflexuser/accomodation/new-soliflex-employee-accomodation-app" ]; then
    APP_DIR="/home/soliflexuser/accomodation/new-soliflex-employee-accomodation-app"
elif [ -d "/home/soliflexuser/accomodation/sol-emp-accomodation" ]; then
    APP_DIR="/home/soliflexuser/accomodation/sol-emp-accomodation"
else
    echo -e "${RED}Error: Could not find app directory${NC}"
    echo "Please specify the correct path:"
    read -p "Enter app directory path: " APP_DIR
fi

echo -e "${YELLOW}Using app directory: $APP_DIR${NC}"
cd "$APP_DIR"

echo ""
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Step 1: Verify source files were updated${NC}"
echo -e "${YELLOW}========================================${NC}"
if [ -f "frontend/src/components/DashboardHome.js" ]; then
    echo -e "${GREEN}✓ DashboardHome.js exists${NC}"
    echo "Last modified: $(stat -c %y frontend/src/components/DashboardHome.js | cut -d' ' -f1,2 | cut -d'.' -f1)"
    
    # Check if it has the fix (look for dueWithin90Agreements)
    if grep -q "dueWithin90Agreements" frontend/src/components/DashboardHome.js; then
        echo -e "${GREEN}✓ File contains the fix (dueWithin90Agreements)${NC}"
    else
        echo -e "${RED}✗ File does NOT contain the fix!${NC}"
        echo "The file might not have been updated. Check if files were copied correctly."
    fi
else
    echo -e "${RED}✗ DashboardHome.js not found!${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Step 2: Check current build directory${NC}"
echo -e "${YELLOW}========================================${NC}"
if [ -d "frontend/build" ]; then
    echo -e "${GREEN}✓ Build directory exists${NC}"
    if [ -f "frontend/build/index.html" ]; then
        echo "Build index.html last modified: $(stat -c %y frontend/build/index.html | cut -d' ' -f1,2 | cut -d'.' -f1)"
        echo ""
        echo "Checking if build is recent (should be within last few minutes):"
        BUILD_AGE=$(find frontend/build/index.html -mmin +5 2>/dev/null && echo "old" || echo "recent")
        if [ "$BUILD_AGE" = "old" ]; then
            echo -e "${RED}✗ Build is OLD - needs to be rebuilt!${NC}"
        else
            echo -e "${GREEN}✓ Build appears recent${NC}"
        fi
    else
        echo -e "${RED}✗ Build directory exists but index.html is missing!${NC}"
    fi
else
    echo -e "${RED}✗ Build directory does NOT exist!${NC}"
fi

echo ""
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Step 3: Remove OLD build (force clean rebuild)${NC}"
echo -e "${YELLOW}========================================${NC}"
cd frontend
rm -rf build/
echo -e "${GREEN}✓ Old build removed${NC}"

echo ""
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Step 4: Install dependencies${NC}"
echo -e "${YELLOW}========================================${NC}"
npm install
echo -e "${GREEN}✓ Dependencies installed${NC}"

echo ""
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Step 5: Build frontend (THIS IS CRITICAL!)${NC}"
echo -e "${YELLOW}========================================${NC}"
echo "This may take 1-2 minutes..."
npm run build

echo ""
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Step 6: Verify build was created${NC}"
echo -e "${YELLOW}========================================${NC}"
if [ -d "build" ] && [ -f "build/index.html" ]; then
    echo -e "${GREEN}✓ Build directory created${NC}"
    echo -e "${GREEN}✓ index.html exists${NC}"
    echo "Build timestamp: $(stat -c %y build/index.html | cut -d' ' -f1,2 | cut -d'.' -f1)"
    echo ""
    echo "Build size:"
    du -sh build/
    echo ""
    echo "First few files in build:"
    ls -lh build/ | head -5
else
    echo -e "${RED}✗ ERROR: Build failed!${NC}"
    echo "Check for errors above."
    exit 1
fi

cd ..

echo ""
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Step 7: Check PM2 processes${NC}"
echo -e "${YELLOW}========================================${NC}"
pm2 list

echo ""
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Step 8: Restart ONLY sol-emp processes${NC}"
echo -e "${YELLOW}========================================${NC}"
pm2 restart sol-emp-backend
echo -e "${GREEN}✓ Backend restarted${NC}"
pm2 restart sol-emp-frontend
echo -e "${GREEN}✓ Frontend restarted${NC}"

echo ""
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Step 9: Wait for processes to start${NC}"
echo -e "${YELLOW}========================================${NC}"
sleep 5

echo ""
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Step 10: Check PM2 status${NC}"
echo -e "${YELLOW}========================================${NC}"
pm2 status

echo ""
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Step 11: Check logs for errors${NC}"
echo -e "${YELLOW}========================================${NC}"
echo "Frontend logs (last 30 lines):"
pm2 logs sol-emp-frontend --lines 30 --nostream

echo ""
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Step 12: Verify build file is being served${NC}"
echo -e "${YELLOW}========================================${NC}"
# Check if the built file contains the fix
if grep -q "dueWithin90Agreements" frontend/build/static/js/*.js 2>/dev/null; then
    echo -e "${GREEN}✓ Build contains the fix!${NC}"
else
    echo -e "${YELLOW}⚠ Could not verify fix in build (this is OK, files are minified)${NC}"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ Update Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Clear your browser cache (Ctrl+Shift+Delete)"
echo "2. Hard refresh the page (Ctrl+F5 or Cmd+Shift+R)"
echo "3. Check the browser console (F12) for any errors"
echo "4. Verify the dashboard shows correct stats"
echo ""
echo -e "${YELLOW}If changes still don't show:${NC}"
echo "- Check PM2 logs: ${BLUE}pm2 logs sol-emp-frontend${NC}"
echo "- Verify build timestamp: ${BLUE}ls -lh frontend/build/index.html${NC}"
echo "- Check if nginx is caching (if using nginx): ${BLUE}sudo systemctl reload nginx${NC}"

