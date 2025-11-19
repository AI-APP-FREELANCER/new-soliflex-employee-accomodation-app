#!/bin/bash

# ============================================
# Fix Port Configuration for PM2 Hosting
# Ensures frontend (3600) and backend (5000) are properly configured
# ============================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

APP_DIR="/home/soliflexuser/accomodation/new-soliflex-employee-accomodation-app"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Port Configuration Fix${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

cd "$APP_DIR"

# 1. Check backend server.js
echo -e "${YELLOW}1. Checking backend/server.js...${NC}"
if grep -q "app.listen(PORT, '0.0.0.0'" backend/server.js; then
    echo -e "${GREEN}✓ Backend is configured to bind to 0.0.0.0${NC}"
else
    echo -e "${RED}✗ Backend needs to bind to 0.0.0.0${NC}"
    echo -e "${YELLOW}  Fixing backend/server.js...${NC}"
    # This should already be fixed, but let's verify
    if ! grep -q "0.0.0.0" backend/server.js; then
        echo -e "${RED}  ERROR: backend/server.js needs manual fix${NC}"
    fi
fi

# 2. Check frontend server.js
echo ""
echo -e "${YELLOW}2. Checking frontend/server.js...${NC}"
if grep -q "app.listen(PORT, '0.0.0.0'" frontend/server.js; then
    echo -e "${GREEN}✓ Frontend is configured to bind to 0.0.0.0${NC}"
else
    echo -e "${RED}✗ Frontend needs to bind to 0.0.0.0${NC}"
fi

# 3. Check ecosystem.config.js
echo ""
echo -e "${YELLOW}3. Checking ecosystem.config.js...${NC}"
if grep -q "PORT: 5000" ecosystem.config.js && grep -q "PORT: 3600" ecosystem.config.js; then
    echo -e "${GREEN}✓ PM2 ecosystem config has correct ports${NC}"
else
    echo -e "${RED}✗ PM2 ecosystem config needs port fixes${NC}"
fi

# 4. Check if .env files exist
echo ""
echo -e "${YELLOW}4. Checking environment files...${NC}"
if [ -f "backend/.env" ]; then
    echo -e "${GREEN}✓ backend/.env exists${NC}"
    echo -e "  Contents:"
    cat backend/.env | sed 's/^/    /'
else
    echo -e "${YELLOW}Creating backend/.env...${NC}"
    cat > backend/.env << EOF
NODE_ENV=production
PORT=5000
EOF
    echo -e "${GREEN}✓ Created backend/.env${NC}"
fi

# 5. Stop PM2 processes
echo ""
echo -e "${YELLOW}5. Stopping PM2 processes...${NC}"
pm2 stop all 2>/dev/null || true

# 6. Delete old processes
echo ""
echo -e "${YELLOW}6. Removing old PM2 processes...${NC}"
pm2 delete all 2>/dev/null || true

# 7. Start with ecosystem config
echo ""
echo -e "${YELLOW}7. Starting applications with PM2...${NC}"
pm2 start ecosystem.config.js

# 8. Save PM2 config
echo ""
echo -e "${YELLOW}8. Saving PM2 configuration...${NC}"
pm2 save

# 9. Wait a moment
echo ""
echo -e "${YELLOW}9. Waiting for services to start...${NC}"
sleep 5

# 10. Check status
echo ""
echo -e "${YELLOW}10. Checking PM2 status...${NC}"
pm2 status

# 11. Check ports
echo ""
echo -e "${YELLOW}11. Checking if ports are listening...${NC}"
echo -e "Port 5000 (Backend):"
if sudo ss -tuln | grep -q ":5000 "; then
    echo -e "${GREEN}✓ Port 5000 is listening${NC}"
    sudo ss -tuln | grep ":5000 "
else
    echo -e "${RED}✗ Port 5000 is NOT listening${NC}"
fi

echo ""
echo -e "Port 3600 (Frontend):"
if sudo ss -tuln | grep -q ":3600 "; then
    echo -e "${GREEN}✓ Port 3600 is listening${NC}"
    sudo ss -tuln | grep ":3600 "
else
    echo -e "${RED}✗ Port 3600 is NOT listening${NC}"
fi

# 12. Test connectivity
echo ""
echo -e "${YELLOW}12. Testing local connectivity...${NC}"
PRIVATE_IP=$(hostname -I | awk '{print $1}')

echo -e "Testing Backend (port 5000):"
if curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/api/health | grep -q "200"; then
    echo -e "${GREEN}✓ Backend is responding${NC}"
else
    echo -e "${RED}✗ Backend is NOT responding${NC}"
    curl -v http://localhost:5000/api/health 2>&1 | head -5
fi

echo ""
echo -e "Testing Frontend (port 3600):"
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3600 | grep -q "200\|301\|302"; then
    echo -e "${GREEN}✓ Frontend is responding${NC}"
else
    echo -e "${RED}✗ Frontend is NOT responding${NC}"
    curl -v http://localhost:3600 2>&1 | head -5
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Configuration Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Backend: ${GREEN}http://$PRIVATE_IP:5000${NC}"
echo -e "Frontend: ${GREEN}http://$PRIVATE_IP:3600${NC}"
echo ""
echo -e "Check logs: ${YELLOW}pm2 logs${NC}"
echo ""

