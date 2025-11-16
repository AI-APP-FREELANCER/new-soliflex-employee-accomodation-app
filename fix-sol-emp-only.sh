#!/bin/bash

# ============================================
# Fix sol-emp processes ONLY
# Does NOT touch soliflex processes
# ============================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Fixing sol-emp processes ONLY${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 1. Check current PM2 status
echo -e "${YELLOW}1. Current PM2 processes:${NC}"
pm2 list
echo ""

# 2. Check what's using port 3000
echo -e "${YELLOW}2. Checking what's using port 3000:${NC}"
PORT_3000_PID=$(sudo lsof -ti :3000 2>/dev/null || echo "")
if [ -z "$PORT_3000_PID" ]; then
    echo -e "${GREEN}✓ Port 3000 is free${NC}"
else
    echo -e "${YELLOW}Port 3000 is used by PID: $PORT_3000_PID${NC}"
    
    # Check if it's a PM2 process
    PM2_PROCESS=$(pm2 jlist | jq -r ".[] | select(.pid == $PORT_3000_PID) | .name" 2>/dev/null || echo "")
    
    if [ -n "$PM2_PROCESS" ]; then
        echo -e "${YELLOW}  This is PM2 process: $PM2_PROCESS${NC}"
        if [ "$PM2_PROCESS" = "sol-emp-frontend" ]; then
            echo -e "${GREEN}  → This is our process, will restart it${NC}"
        elif [ "$PM2_PROCESS" = "soliflex-frontend" ]; then
            echo -e "${RED}  ⚠ This is the OTHER app (soliflex-frontend)${NC}"
            echo -e "${YELLOW}  → Checking if soliflex-frontend should be on port 3000...${NC}"
            # Check soliflex-frontend config
            SOLIFLEX_PORT=$(pm2 jlist | jq -r ".[] | select(.name == \"soliflex-frontend\") | .pm2_env.env.PORT" 2>/dev/null || echo "")
            if [ "$SOLIFLEX_PORT" = "3000" ]; then
                echo -e "${RED}  ✗ CONFLICT: soliflex-frontend is also configured for port 3000!${NC}"
                echo -e "${YELLOW}  → soliflex-frontend should use port 8081, not 3000${NC}"
                echo -e "${YELLOW}  → You need to fix soliflex-frontend configuration${NC}"
            fi
        else
            echo -e "${YELLOW}  → Unknown PM2 process, will handle carefully${NC}"
        fi
    else
        echo -e "${YELLOW}  → Not a PM2 process, might be standalone node${NC}"
    fi
fi
echo ""

# 3. Check what's using port 5000
echo -e "${YELLOW}3. Checking what's using port 5000:${NC}"
PORT_5000_PID=$(sudo lsof -ti :5000 2>/dev/null || echo "")
if [ -z "$PORT_5000_PID" ]; then
    echo -e "${GREEN}✓ Port 5000 is free${NC}"
else
    echo -e "${YELLOW}Port 5000 is used by PID: $PORT_5000_PID${NC}"
    PM2_PROCESS=$(pm2 jlist | jq -r ".[] | select(.pid == $PORT_5000_PID) | .name" 2>/dev/null || echo "")
    if [ -n "$PM2_PROCESS" ]; then
        echo -e "${YELLOW}  This is PM2 process: $PM2_PROCESS${NC}"
    fi
fi
echo ""

# 4. Stop ONLY sol-emp processes
echo -e "${YELLOW}4. Stopping ONLY sol-emp processes...${NC}"
pm2 stop sol-emp-backend 2>/dev/null || echo -e "${YELLOW}  sol-emp-backend not running${NC}"
pm2 stop sol-emp-frontend 2>/dev/null || echo -e "${YELLOW}  sol-emp-frontend not running${NC}"
echo ""

# 5. Delete ONLY sol-emp processes
echo -e "${YELLOW}5. Deleting ONLY sol-emp processes...${NC}"
pm2 delete sol-emp-backend 2>/dev/null || echo -e "${YELLOW}  sol-emp-backend not found${NC}"
pm2 delete sol-emp-frontend 2>/dev/null || echo -e "${YELLOW}  sol-emp-frontend not found${NC}"
echo ""

# 6. Kill any orphaned processes on port 3000 that belong to sol-emp
echo -e "${YELLOW}6. Checking for orphaned processes...${NC}"
if [ -n "$PORT_3000_PID" ]; then
    # Check if it's a sol-emp process by checking the command
    PROCESS_CMD=$(ps -p $PORT_3000_PID -o cmd= 2>/dev/null || echo "")
    if echo "$PROCESS_CMD" | grep -q "sol-emp\|accomodation"; then
        echo -e "${YELLOW}  Found orphaned sol-emp process on port 3000 (PID: $PORT_3000_PID)${NC}"
        echo -e "${YELLOW}  Killing orphaned process...${NC}"
        sudo kill -9 $PORT_3000_PID 2>/dev/null || true
        sleep 1
    else
        echo -e "${GREEN}  Process on port 3000 is not sol-emp related, leaving it alone${NC}"
    fi
fi

# 7. Verify soliflex processes are still running
echo ""
echo -e "${YELLOW}7. Verifying soliflex processes are still running...${NC}"
if pm2 list | grep -q "soliflex-backend.*online"; then
    echo -e "${GREEN}✓ soliflex-backend is still running${NC}"
else
    echo -e "${RED}✗ soliflex-backend is NOT running!${NC}"
fi

if pm2 list | grep -q "soliflex-frontend.*online"; then
    echo -e "${GREEN}✓ soliflex-frontend is still running${NC}"
else
    echo -e "${RED}✗ soliflex-frontend is NOT running!${NC}"
fi
echo ""

# 8. Navigate to sol-emp app directory
echo -e "${YELLOW}8. Starting sol-emp processes...${NC}"
cd /home/soliflexuser/accomodation/new-soliflex-employee-accomodation-app

# 9. Verify ecosystem.config.js exists
if [ ! -f "ecosystem.config.js" ]; then
    echo -e "${RED}✗ ecosystem.config.js not found!${NC}"
    exit 1
fi

# 10. Start sol-emp processes
pm2 start ecosystem.config.js

# 11. Save PM2 config
pm2 save

# 12. Wait a moment
sleep 3

# 13. Check final status
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Final Status${NC}"
echo -e "${BLUE}========================================${NC}"
pm2 list

echo ""
echo -e "${YELLOW}Port Status:${NC}"
echo -e "Port 3000:"
sudo lsof -i :3000 2>/dev/null | head -2 || echo -e "${GREEN}  Free${NC}"
echo -e "Port 5000:"
sudo lsof -i :5000 2>/dev/null | head -2 || echo -e "${GREEN}  Free${NC}"

echo ""
echo -e "${GREEN}Done!${NC}"
echo -e "Check logs: ${YELLOW}pm2 logs sol-emp-frontend${NC}"

