#!/bin/bash

# ============================================
# Fix Frontend on Port 3600
# Comprehensive fix script
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
echo -e "${BLUE}Fixing Frontend on Port 3600${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

cd "$APP_DIR"

# Step 1: Stop frontend process
echo -e "${YELLOW}Step 1: Stopping frontend process...${NC}"
pm2 stop sol-emp-frontend 2>/dev/null || true
pm2 delete sol-emp-frontend 2>/dev/null || true
echo ""

# Step 2: Kill any process on port 3600
echo -e "${YELLOW}Step 2: Freeing port 3600...${NC}"
sudo fuser -k 3600/tcp 2>/dev/null || true
sleep 1
echo ""

# Step 3: Check and install dependencies
echo -e "${YELLOW}Step 3: Checking frontend dependencies...${NC}"
cd frontend

if [ ! -d "node_modules" ] || [ ! -d "node_modules/express" ]; then
    echo -e "${YELLOW}  Installing dependencies...${NC}"
    npm install
else
    echo -e "${GREEN}  ✓ Dependencies are installed${NC}"
fi
cd ..
echo ""

# Step 4: Verify server.js exists
echo -e "${YELLOW}Step 4: Verifying server.js...${NC}"
if [ ! -f "frontend/server.js" ]; then
    echo -e "${RED}  ✗ server.js not found! Creating it...${NC}"
    cat > frontend/server.js << 'EOF'
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3600;

// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, 'build')));

// Handle React routing, return all requests to React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Frontend server is running on port ${PORT}`);
});
EOF
    echo -e "${GREEN}  ✓ Created server.js${NC}"
else
    echo -e "${GREEN}  ✓ server.js exists${NC}"
    
    # Verify it binds to 0.0.0.0
    if ! grep -q "0.0.0.0" frontend/server.js; then
        echo -e "${YELLOW}  → Updating server.js to bind to 0.0.0.0...${NC}"
        sed -i "s/app.listen(PORT,/app.listen(PORT, '0.0.0.0',/g" frontend/server.js
    fi
fi
echo ""

# Step 5: Build frontend
echo -e "${YELLOW}Step 5: Building frontend...${NC}"
cd frontend

if [ ! -d "build" ] || [ ! -f "build/index.html" ]; then
    echo -e "${YELLOW}  Build directory missing or empty, building...${NC}"
    npm run build
    
    if [ ! -f "build/index.html" ]; then
        echo -e "${RED}  ✗ Build failed! Check errors above${NC}"
        exit 1
    else
        echo -e "${GREEN}  ✓ Build successful${NC}"
    fi
else
    echo -e "${GREEN}  ✓ Build directory exists${NC}"
    echo -e "${YELLOW}  → Rebuilding to ensure latest changes...${NC}"
    npm run build
fi
cd ..
echo ""

# Step 6: Verify ecosystem.config.js
echo -e "${YELLOW}Step 6: Verifying ecosystem.config.js...${NC}"
if [ ! -f "ecosystem.config.js" ]; then
    echo -e "${RED}  ✗ ecosystem.config.js not found!${NC}"
    exit 1
fi

if ! grep -q "PORT: 3600" ecosystem.config.js; then
    echo -e "${YELLOW}  → Updating PORT to 3600...${NC}"
    sed -i 's/PORT: 3000/PORT: 3600/g' ecosystem.config.js
    sed -i 's/"PORT": 3000/"PORT": 3600/g' ecosystem.config.js
fi
echo -e "${GREEN}  ✓ ecosystem.config.js is correct${NC}"
echo ""

# Step 7: Start with PM2
echo -e "${YELLOW}Step 7: Starting frontend with PM2...${NC}"
pm2 start ecosystem.config.js --only sol-emp-frontend

# Step 8: Save PM2 config
pm2 save

# Step 9: Wait for startup
echo ""
echo -e "${YELLOW}Step 8: Waiting for service to start...${NC}"
sleep 5

# Step 10: Check status
echo ""
echo -e "${YELLOW}Step 9: Checking status...${NC}"
pm2 status | grep sol-emp-frontend

echo ""
echo -e "${YELLOW}Step 10: Checking port 3600...${NC}"
if sudo ss -tuln | grep -q ":3600 "; then
    echo -e "${GREEN}✓ Port 3600 is listening${NC}"
    sudo ss -tuln | grep ":3600 "
else
    echo -e "${RED}✗ Port 3600 is NOT listening${NC}"
    echo -e "${YELLOW}  Check logs: pm2 logs sol-emp-frontend${NC}"
fi

echo ""
echo -e "${YELLOW}Step 11: Testing connectivity...${NC}"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3600 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "301" ] || [ "$HTTP_CODE" = "302" ]; then
    echo -e "${GREEN}✓ Frontend is responding (HTTP $HTTP_CODE)${NC}"
else
    echo -e "${RED}✗ Frontend is NOT responding (HTTP $HTTP_CODE)${NC}"
    echo -e "${YELLOW}  Check logs: pm2 logs sol-emp-frontend --lines 50${NC}"
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Fix Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
PRIVATE_IP=$(hostname -I | awk '{print $1}')
echo -e "Frontend URL: ${GREEN}http://$PRIVATE_IP:3600${NC}"
echo ""
echo -e "If still not working, check logs:"
echo -e "  ${YELLOW}pm2 logs sol-emp-frontend --lines 50${NC}"
echo ""

