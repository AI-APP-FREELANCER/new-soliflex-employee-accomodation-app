#!/usr/bin/env bash
# Run from project root on VM after: git pull origin main
# Usage: ./scripts/vm-pull-and-deploy.sh   or   bash scripts/vm-pull-and-deploy.sh

set -e
cd "$(dirname "$0")/.."

echo "Installing backend dependencies..."
(cd backend && npm install)
echo "Installing frontend dependencies and building..."
(cd frontend && npm install && npm run build)
echo "Restarting PM2 processes..."
pm2 restart sol-emp-backend
pm2 restart sol-emp-frontend
pm2 save
echo "Done. App is running. Check: pm2 status"
