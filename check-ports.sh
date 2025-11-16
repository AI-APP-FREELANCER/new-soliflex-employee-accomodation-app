#!/bin/bash

# ============================================
# Port Diagnostic Script for Azure VM
# Checks ports 3000 and 5000
# ============================================

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

BACKEND_PORT=5000
FRONTEND_PORT=3000

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Port Diagnostic Tool${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 1. Check if PM2 processes are running
echo -e "${YELLOW}1. Checking PM2 processes...${NC}"
pm2 list
echo ""

# 2. Check if ports are listening
echo -e "${YELLOW}2. Checking if ports are listening...${NC}"
echo -e "Checking port ${FRONTEND_PORT} (Frontend):"
if sudo netstat -tuln | grep -q ":$FRONTEND_PORT "; then
    echo -e "${GREEN}✓ Port $FRONTEND_PORT is LISTENING${NC}"
    sudo netstat -tuln | grep ":$FRONTEND_PORT "
else
    echo -e "${RED}✗ Port $FRONTEND_PORT is NOT listening${NC}"
fi
echo ""

echo -e "Checking port ${BACKEND_PORT} (Backend):"
if sudo netstat -tuln | grep -q ":$BACKEND_PORT "; then
    echo -e "${GREEN}✓ Port $BACKEND_PORT is LISTENING${NC}"
    sudo netstat -tuln | grep ":$BACKEND_PORT "
else
    echo -e "${RED}✗ Port $BACKEND_PORT is NOT listening${NC}"
fi
echo ""

# 3. Check what process is using the ports
echo -e "${YELLOW}3. Checking which processes are using the ports...${NC}"
echo -e "Port $FRONTEND_PORT:"
sudo lsof -i :$FRONTEND_PORT 2>/dev/null || echo -e "${RED}No process found on port $FRONTEND_PORT${NC}"
echo ""

echo -e "Port $BACKEND_PORT:"
sudo lsof -i :$BACKEND_PORT 2>/dev/null || echo -e "${RED}No process found on port $BACKEND_PORT${NC}"
echo ""

# 4. Check firewall status (ufw)
echo -e "${YELLOW}4. Checking UFW firewall status...${NC}"
if command -v ufw &> /dev/null; then
    sudo ufw status verbose
    echo ""
    echo -e "Checking if ports are allowed:"
    if sudo ufw status | grep -q "$FRONTEND_PORT"; then
        echo -e "${GREEN}✓ Port $FRONTEND_PORT is allowed in UFW${NC}"
    else
        echo -e "${RED}✗ Port $FRONTEND_PORT is NOT allowed in UFW${NC}"
    fi
    
    if sudo ufw status | grep -q "$BACKEND_PORT"; then
        echo -e "${GREEN}✓ Port $BACKEND_PORT is allowed in UFW${NC}"
    else
        echo -e "${RED}✗ Port $BACKEND_PORT is NOT allowed in UFW${NC}"
    fi
else
    echo -e "${YELLOW}UFW is not installed${NC}"
fi
echo ""

# 5. Check iptables rules
echo -e "${YELLOW}5. Checking iptables rules...${NC}"
if command -v iptables &> /dev/null; then
    echo -e "INPUT chain rules:"
    sudo iptables -L INPUT -n -v | grep -E "($FRONTEND_PORT|$BACKEND_PORT)" || echo -e "${YELLOW}No specific rules found for these ports${NC}"
else
    echo -e "${YELLOW}iptables is not available${NC}"
fi
echo ""

# 6. Test local connectivity
echo -e "${YELLOW}6. Testing local connectivity...${NC}"
echo -e "Testing Frontend (port $FRONTEND_PORT):"
if curl -s -o /dev/null -w "%{http_code}" http://localhost:$FRONTEND_PORT | grep -q "200\|301\|302"; then
    echo -e "${GREEN}✓ Frontend is responding on localhost:$FRONTEND_PORT${NC}"
else
    echo -e "${RED}✗ Frontend is NOT responding on localhost:$FRONTEND_PORT${NC}"
    curl -v http://localhost:$FRONTEND_PORT 2>&1 | head -5
fi
echo ""

echo -e "Testing Backend (port $BACKEND_PORT):"
if curl -s -o /dev/null -w "%{http_code}" http://localhost:$BACKEND_PORT | grep -q "200\|301\|302\|404"; then
    echo -e "${GREEN}✓ Backend is responding on localhost:$BACKEND_PORT${NC}"
else
    echo -e "${RED}✗ Backend is NOT responding on localhost:$BACKEND_PORT${NC}"
    curl -v http://localhost:$BACKEND_PORT 2>&1 | head -5
fi
echo ""

# 7. Get VM's private and public IP
echo -e "${YELLOW}7. Network Information...${NC}"
PRIVATE_IP=$(hostname -I | awk '{print $1}')
echo -e "Private IP: ${BLUE}$PRIVATE_IP${NC}"

# Try to get public IP
PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s icanhazip.com 2>/dev/null || echo "Unable to determine")
echo -e "Public IP: ${BLUE}$PUBLIC_IP${NC}"
echo ""

# 8. Check if apps are binding to 0.0.0.0 or 127.0.0.1
echo -e "${YELLOW}8. Checking binding addresses...${NC}"
echo -e "Port $FRONTEND_PORT bindings:"
sudo ss -tuln | grep ":$FRONTEND_PORT " || echo -e "${RED}No binding found${NC}"
echo ""

echo -e "Port $BACKEND_PORT bindings:"
sudo ss -tuln | grep ":$BACKEND_PORT " || echo -e "${RED}No binding found${NC}"
echo ""

# 9. Summary and recommendations
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Summary & Recommendations${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if processes are running
if pm2 list | grep -q "sol-emp-backend.*online"; then
    echo -e "${GREEN}✓ Backend process is running${NC}"
else
    echo -e "${RED}✗ Backend process is NOT running${NC}"
    echo -e "  ${YELLOW}→ Run: pm2 restart sol-emp-backend${NC}"
fi

if pm2 list | grep -q "sol-emp-frontend.*online"; then
    echo -e "${GREEN}✓ Frontend process is running${NC}"
else
    echo -e "${RED}✗ Frontend process is NOT running${NC}"
    echo -e "  ${YELLOW}→ Run: pm2 restart sol-emp-frontend${NC}"
fi

echo ""
echo -e "${YELLOW}If ports are listening but not accessible externally:${NC}"
echo -e "  1. Verify Azure NSG rules allow inbound traffic on ports $FRONTEND_PORT and $BACKEND_PORT"
echo -e "  2. Ensure apps are binding to 0.0.0.0 (not 127.0.0.1)"
echo -e "  3. Check if UFW is blocking: ${BLUE}sudo ufw allow $FRONTEND_PORT/tcp${NC}"
echo -e "  4. Check if UFW is blocking: ${BLUE}sudo ufw allow $BACKEND_PORT/tcp${NC}"
echo -e "  5. Test from VM: ${BLUE}curl http://$PRIVATE_IP:$FRONTEND_PORT${NC}"
echo -e "  6. Test from VM: ${BLUE}curl http://$PRIVATE_IP:$BACKEND_PORT${NC}"
echo ""

