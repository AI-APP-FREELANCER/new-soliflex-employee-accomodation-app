#!/bin/bash

# ============================================
# Deploy PDF Attachment Feature to VM
# ============================================
# This script updates the sol-emp-accommodation app with PDF attachment feature
# It does NOT affect soliflex processes

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Deploying PDF Attachment Feature${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 1. Navigate to project directory
echo -e "${YELLOW}Step 1: Navigating to project directory...${NC}"
cd ~/accomodation/new-soliflex-employee-accomodation-app
# OR: cd /home/soliflexuser/accomodation/new-soliflex-employee-accomodation-app
echo -e "${GREEN}✓ Current directory: $(pwd)${NC}"
echo ""

# 2. Pull latest changes from GitHub
echo -e "${YELLOW}Step 2: Pulling latest changes from GitHub...${NC}"
git pull origin main
echo -e "${GREEN}✓ Code updated${NC}"
echo ""

# 3. Install backend dependencies (multer)
echo -e "${YELLOW}Step 3: Installing backend dependencies (including multer)...${NC}"
cd backend
npm install
echo -e "${GREEN}✓ Backend dependencies installed${NC}"

# Verify multer is installed
if npm list multer > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Multer is installed${NC}"
else
    echo -e "${RED}✗ ERROR: Multer not found! Installing...${NC}"
    npm install multer@latest --save
fi
echo ""

# 4. Create attachments directory
echo -e "${YELLOW}Step 4: Creating attachments directory...${NC}"
cd ..
mkdir -p attachments
chmod 755 attachments
if [ -d "attachments" ]; then
    echo -e "${GREEN}✓ Attachments directory created${NC}"
else
    echo -e "${RED}✗ ERROR: Failed to create attachments directory${NC}"
    exit 1
fi
echo ""

# 5. Verify backend .env file
echo -e "${YELLOW}Step 5: Checking backend .env configuration...${NC}"
cd backend
if [ -f ".env" ]; then
    if grep -q "PORT=3000" .env; then
        echo -e "${GREEN}✓ Backend port is set to 3000${NC}"
    else
        echo -e "${YELLOW}⚠ Warning: PORT=3000 not found in .env${NC}"
        echo -e "${YELLOW}  Adding PORT=3000 to .env...${NC}"
        if ! grep -q "PORT=" .env; then
            echo "PORT=3000" >> .env
        fi
    fi
else
    echo -e "${YELLOW}⚠ .env file not found. Creating one...${NC}"
    echo "PORT=3000" > .env
    echo "JWT_SECRET=$(openssl rand -base64 32)" >> .env
    echo "NODE_ENV=production" >> .env
    echo -e "${GREEN}✓ .env file created${NC}"
fi
echo ""

# 6. Install frontend dependencies
echo -e "${YELLOW}Step 6: Installing frontend dependencies...${NC}"
cd ../frontend
npm install
echo -e "${GREEN}✓ Frontend dependencies installed${NC}"
echo ""

# 7. Remove old build and rebuild
echo -e "${YELLOW}Step 7: Rebuilding frontend (CRITICAL STEP)...${NC}"
rm -rf build/
npm run build

if [ -d "build" ] && [ -f "build/index.html" ]; then
    echo -e "${GREEN}✓ Frontend build successful${NC}"
    echo -e "${GREEN}  Build timestamp: $(ls -lh build/index.html | awk '{print $6, $7, $8}')${NC}"
else
    echo -e "${RED}✗ ERROR: Frontend build failed!${NC}"
    exit 1
fi
echo ""

# 8. Restart backend
echo -e "${YELLOW}Step 8: Restarting backend...${NC}"
cd ..
pm2 restart sol-emp-backend
sleep 2
echo -e "${GREEN}✓ Backend restarted${NC}"
echo ""

# 9. Restart frontend
echo -e "${YELLOW}Step 9: Restarting frontend...${NC}"
pm2 restart sol-emp-frontend
sleep 2
echo -e "${GREEN}✓ Frontend restarted${NC}"
echo ""

# 10. Save PM2 configuration
echo -e "${YELLOW}Step 10: Saving PM2 configuration...${NC}"
pm2 save
echo -e "${GREEN}✓ PM2 configuration saved${NC}"
echo ""

# 11. Verify services are running
echo -e "${YELLOW}Step 11: Verifying services...${NC}"
echo ""
echo -e "${BLUE}PM2 Status:${NC}"
pm2 status | grep -E "(sol-emp|name|status|online|errored)"

echo ""
echo -e "${BLUE}Port Status:${NC}"
echo -e "Backend (Port 3000):"
if sudo lsof -i :3000 > /dev/null 2>&1; then
    echo -e "${GREEN}  ✓ Port 3000 is in use${NC}"
    sudo lsof -i :3000 | head -2
else
    echo -e "${RED}  ✗ Port 3000 is NOT in use!${NC}"
fi

echo ""
echo -e "Frontend (Port 3600):"
if sudo lsof -i :3600 > /dev/null 2>&1; then
    echo -e "${GREEN}  ✓ Port 3600 is in use${NC}"
    sudo lsof -i :3600 | head -2
else
    echo -e "${RED}  ✗ Port 3600 is NOT in use!${NC}"
fi
echo ""

# 12. Check for errors in logs
echo -e "${YELLOW}Step 12: Checking for errors in logs...${NC}"
echo ""
echo -e "${BLUE}Backend logs (last 10 lines):${NC}"
pm2 logs sol-emp-backend --lines 10 --nostream | tail -5 || echo "No logs available"

echo ""
echo -e "${BLUE}Frontend logs (last 10 lines):${NC}"
pm2 logs sol-emp-frontend --lines 10 --nostream | tail -5 || echo "No logs available"
echo ""

# 13. Verify attachments directory
echo -e "${YELLOW}Step 13: Verifying attachments directory...${NC}"
if [ -d "attachments" ]; then
    echo -e "${GREEN}✓ Attachments directory exists${NC}"
    echo -e "  Location: $(pwd)/attachments"
    echo -e "  Permissions: $(ls -ld attachments | awk '{print $1}')"
    echo -e "  Files: $(ls -1 attachments | wc -l) PDF file(s)"
else
    echo -e "${RED}✗ ERROR: Attachments directory not found!${NC}"
fi
echo ""

# Final summary
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Test the application: http://your-vm-ip:3600"
echo "2. Login and navigate to Agreements page"
echo "3. Test PDF upload feature"
echo "4. Test PDF view feature (should work without auth errors)"
echo "5. Test PDF delete feature"
echo ""
echo -e "${YELLOW}If you see issues:${NC}"
echo "- Check logs: ${BLUE}pm2 logs sol-emp-backend${NC}"
echo "- Check logs: ${BLUE}pm2 logs sol-emp-frontend${NC}"
echo "- Verify ports: ${BLUE}sudo lsof -i :3000${NC} and ${BLUE}sudo lsof -i :3600${NC}"
echo "- Clear browser cache and hard refresh (Ctrl+F5)"
echo ""
echo -e "${GREEN}Done!${NC}"

