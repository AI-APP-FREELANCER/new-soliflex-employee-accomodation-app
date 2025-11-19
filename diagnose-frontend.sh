#!/bin/bash

# ============================================
# Frontend Diagnostic Script
# Diagnoses why frontend is not rendering on port 3600
# ============================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

APP_DIR="/home/soliflexuser/accomodation/new-soliflex-employee-accomodation-app"
FRONTEND_PORT=3600

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Frontend Diagnostic Tool${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

cd "$APP_DIR"

# 1. Check PM2 status
echo -e "${YELLOW}1. PM2 Process Status:${NC}"
pm2 list | grep -E "(sol-emp|name|status)" || pm2 list
echo ""

# 2. Check if frontend process exists and status
echo -e "${YELLOW}2. Frontend Process Details:${NC}"
if pm2 list | grep -q "sol-emp-frontend"; then
    pm2 describe sol-emp-frontend
else
    echo -e "${RED}✗ sol-emp-frontend process not found in PM2!${NC}"
fi
echo ""

# 3. Check frontend logs
echo -e "${YELLOW}3. Frontend Logs (Last 30 lines):${NC}"
pm2 logs sol-emp-frontend --lines 30 --nostream 2>/dev/null || echo -e "${RED}No logs available${NC}"
echo ""

# 4. Check if port 3600 is listening
echo -e "${YELLOW}4. Port 3600 Status:${NC}"
if sudo ss -tuln | grep -q ":3600 "; then
    echo -e "${GREEN}✓ Port 3600 is LISTENING${NC}"
    sudo ss -tuln | grep ":3600 "
    echo ""
    echo -e "Process using port 3600:"
    sudo lsof -i :3600 || echo -e "${YELLOW}Could not identify process${NC}"
else
    echo -e "${RED}✗ Port 3600 is NOT listening${NC}"
fi
echo ""

# 5. Check if build directory exists
echo -e "${YELLOW}5. Frontend Build Directory:${NC}"
if [ -d "frontend/build" ]; then
    echo -e "${GREEN}✓ Build directory exists${NC}"
    BUILD_SIZE=$(du -sh frontend/build 2>/dev/null | awk '{print $1}')
    echo -e "  Size: $BUILD_SIZE"
    
    if [ -f "frontend/build/index.html" ]; then
        echo -e "${GREEN}✓ index.html exists${NC}"
    else
        echo -e "${RED}✗ index.html NOT found!${NC}"
    fi
    
    if [ -d "frontend/build/static" ]; then
        echo -e "${GREEN}✓ static directory exists${NC}"
        STATIC_FILES=$(find frontend/build/static -type f 2>/dev/null | wc -l)
        echo -e "  Static files: $STATIC_FILES"
    else
        echo -e "${RED}✗ static directory NOT found!${NC}"
    fi
    
    echo ""
    echo -e "Build directory contents (first 10 items):"
    ls -la frontend/build/ | head -12
else
    echo -e "${RED}✗ Build directory does NOT exist!${NC}"
    echo -e "${YELLOW}  → Frontend needs to be built${NC}"
fi
echo ""

# 6. Check frontend/server.js
echo -e "${YELLOW}6. Frontend Server Configuration:${NC}"
if [ -f "frontend/server.js" ]; then
    echo -e "${GREEN}✓ server.js exists${NC}"
    echo ""
    echo -e "Server.js content:"
    cat frontend/server.js
    echo ""
    
    # Check if it binds to 0.0.0.0
    if grep -q "0.0.0.0" frontend/server.js; then
        echo -e "${GREEN}✓ Server binds to 0.0.0.0${NC}"
    else
        echo -e "${RED}✗ Server does NOT bind to 0.0.0.0${NC}"
    fi
    
    # Check PORT usage
    if grep -q "process.env.PORT" frontend/server.js; then
        echo -e "${GREEN}✓ Server uses process.env.PORT${NC}"
    else
        echo -e "${YELLOW}⚠ Server might not use environment PORT${NC}"
    fi
else
    echo -e "${RED}✗ server.js does NOT exist!${NC}"
fi
echo ""

# 7. Check ecosystem.config.js
echo -e "${YELLOW}7. PM2 Ecosystem Configuration:${NC}"
if [ -f "ecosystem.config.js" ]; then
    echo -e "${GREEN}✓ ecosystem.config.js exists${NC}"
    echo ""
    echo -e "Frontend configuration:"
    grep -A 10 "sol-emp-frontend" ecosystem.config.js || echo -e "${RED}Frontend config not found${NC}"
    
    # Check if PORT is set to 3600
    if grep -q "PORT: 3600" ecosystem.config.js; then
        echo -e "${GREEN}✓ PORT is set to 3600${NC}"
    else
        echo -e "${RED}✗ PORT is NOT set to 3600${NC}"
        echo -e "  Current PORT setting:"
        grep "PORT:" ecosystem.config.js | grep frontend || echo "Not found"
    fi
else
    echo -e "${RED}✗ ecosystem.config.js does NOT exist!${NC}"
fi
echo ""

# 8. Check frontend dependencies
echo -e "${YELLOW}8. Frontend Dependencies:${NC}"
if [ -d "frontend/node_modules" ]; then
    echo -e "${GREEN}✓ node_modules exists${NC}"
    NODE_MODULES_COUNT=$(ls frontend/node_modules 2>/dev/null | wc -l)
    echo -e "  Installed packages: $NODE_MODULES_COUNT"
    
    # Check for express
    if [ -d "frontend/node_modules/express" ]; then
        echo -e "${GREEN}✓ express is installed${NC}"
    else
        echo -e "${RED}✗ express is NOT installed${NC}"
    fi
else
    echo -e "${RED}✗ node_modules does NOT exist!${NC}"
    echo -e "${YELLOW}  → Dependencies need to be installed${NC}"
fi
echo ""

# 9. Test local connectivity
echo -e "${YELLOW}9. Testing Local Connectivity:${NC}"
echo -e "Testing http://localhost:$FRONTEND_PORT"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$FRONTEND_PORT 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "301" ] || [ "$HTTP_CODE" = "302" ]; then
    echo -e "${GREEN}✓ Frontend is responding (HTTP $HTTP_CODE)${NC}"
elif [ "$HTTP_CODE" = "000" ]; then
    echo -e "${RED}✗ Frontend is NOT responding (connection refused)${NC}"
else
    echo -e "${YELLOW}⚠ Frontend returned HTTP $HTTP_CODE${NC}"
    echo -e "  Response:"
    curl -s http://localhost:$FRONTEND_PORT | head -20
fi
echo ""

# 10. Check for errors in PM2
echo -e "${YELLOW}10. PM2 Error Logs:${NC}"
if [ -f "logs/frontend-error.log" ]; then
    echo -e "Last 20 lines of error log:"
    tail -20 logs/frontend-error.log 2>/dev/null || echo -e "${YELLOW}Log file empty or not readable${NC}"
else
    echo -e "${YELLOW}Error log file not found${NC}"
fi
echo ""

# 11. Check working directory in PM2
echo -e "${YELLOW}11. PM2 Working Directory:${NC}"
pm2 describe sol-emp-frontend 2>/dev/null | grep -E "cwd|script path" || echo -e "${YELLOW}Could not get working directory${NC}"
echo ""

# 12. Verify file paths
echo -e "${YELLOW}12. File Path Verification:${NC}"
CURRENT_DIR=$(pwd)
echo -e "Current directory: $CURRENT_DIR"
echo -e "Expected server.js: $CURRENT_DIR/frontend/server.js"
if [ -f "$CURRENT_DIR/frontend/server.js" ]; then
    echo -e "${GREEN}✓ server.js path is correct${NC}"
else
    echo -e "${RED}✗ server.js path is incorrect${NC}"
fi
echo ""

# Summary and recommendations
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Diagnostic Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

ISSUES=0

# Check each condition
if ! pm2 list | grep -q "sol-emp-frontend.*online"; then
    echo -e "${RED}✗ Frontend process is not online${NC}"
    ISSUES=$((ISSUES + 1))
fi

if ! sudo ss -tuln | grep -q ":3600 "; then
    echo -e "${RED}✗ Port 3600 is not listening${NC}"
    ISSUES=$((ISSUES + 1))
fi

if [ ! -d "frontend/build" ]; then
    echo -e "${RED}✗ Build directory missing${NC}"
    ISSUES=$((ISSUES + 1))
fi

if [ ! -f "frontend/build/index.html" ]; then
    echo -e "${RED}✗ index.html missing${NC}"
    ISSUES=$((ISSUES + 1))
fi

if [ ! -f "frontend/server.js" ]; then
    echo -e "${RED}✗ server.js missing${NC}"
    ISSUES=$((ISSUES + 1))
fi

if [ $ISSUES -eq 0 ]; then
    echo -e "${GREEN}✓ All basic checks passed${NC}"
    echo -e "${YELLOW}  → Check PM2 logs for runtime errors${NC}"
else
    echo -e "${RED}Found $ISSUES issue(s)${NC}"
fi

echo ""
echo -e "${YELLOW}Recommended Actions:${NC}"
echo -e "  1. Check logs: ${BLUE}pm2 logs sol-emp-frontend --lines 50${NC}"
echo -e "  2. Rebuild frontend: ${BLUE}cd frontend && npm run build${NC}"
echo -e "  3. Restart process: ${BLUE}pm2 restart sol-emp-frontend${NC}"
echo ""

