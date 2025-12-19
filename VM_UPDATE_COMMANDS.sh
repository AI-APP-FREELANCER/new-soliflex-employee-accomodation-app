#!/bin/bash

# ============================================
# VM Update Commands - Run these on the VM
# ============================================

# IMPORTANT: The frontend serves BUILT files, not source code!
# You MUST rebuild after code changes.

echo "=========================================="
echo "Step 1: Navigate to app directory"
echo "=========================================="
cd ~/accomodation/new-soliflex-employee-accomodation-app
# OR: cd /home/soliflexuser/accomodation/new-soliflex-employee-accomodation-app

echo ""
echo "=========================================="
echo "Step 2: Verify files were updated"
echo "=========================================="
echo "Checking DashboardHome.js modification time:"
ls -lh frontend/src/components/DashboardHome.js
echo ""
echo "If the date is old, files weren't copied properly!"

echo ""
echo "=========================================="
echo "Step 3: Remove OLD build directory"
echo "=========================================="
cd frontend
rm -rf build/
echo "✓ Old build removed"

echo ""
echo "=========================================="
echo "Step 4: Install dependencies (if needed)"
echo "=========================================="
npm install

echo ""
echo "=========================================="
echo "Step 5: Build frontend (THIS IS CRITICAL!)"
echo "=========================================="
npm run build

echo ""
echo "=========================================="
echo "Step 6: Verify build was created"
echo "=========================================="
if [ -d "build" ] && [ -f "build/index.html" ]; then
    echo "✓ Build directory exists"
    echo "✓ index.html exists"
    ls -lh build/ | head -5
    echo ""
    echo "Checking build/index.html modification time:"
    ls -lh build/index.html
else
    echo "✗ ERROR: Build failed! Check for errors above."
    exit 1
fi

cd ..

echo ""
echo "=========================================="
echo "Step 7: Restart ONLY sol-emp processes"
echo "=========================================="
pm2 restart sol-emp-backend
pm2 restart sol-emp-frontend

echo ""
echo "=========================================="
echo "Step 8: Check PM2 status"
echo "=========================================="
pm2 status

echo ""
echo "=========================================="
echo "Step 9: Check logs for errors"
echo "=========================================="
echo "Last 20 lines of frontend logs:"
pm2 logs sol-emp-frontend --lines 20 --nostream

echo ""
echo "=========================================="
echo "✅ Update Complete!"
echo "=========================================="
echo ""
echo "If changes still don't show:"
echo "1. Clear browser cache (Ctrl+Shift+Delete)"
echo "2. Hard refresh (Ctrl+F5)"
echo "3. Check PM2 logs: pm2 logs sol-emp-frontend"
echo "4. Verify build timestamp is recent: ls -lh frontend/build/index.html"

