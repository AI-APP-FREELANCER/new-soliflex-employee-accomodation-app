# Deployment Guide to Ubuntu VM Server

## Option 1: Using Git (Recommended)

### Step 1: Commit and Push to Git Repository

```bash
# Check current status
git status

# Add all changes
git add .

# Commit changes
git commit -m "Implement accurate pro-rata cost aggregation and remove yearly trend chart"

# Push to remote repository (GitHub/GitLab/etc)
git push origin main
# or
git push origin master
```

### Step 2: Connect to Your Ubuntu VM

```bash
# SSH into your Ubuntu VM
ssh username@your-vm-ip-address
# Example: ssh ubuntu@192.168.1.100
```

### Step 3: Pull Code on Server

```bash
# Navigate to your project directory
cd /path/to/your/project

# Pull latest changes
git pull origin main
# or
git pull origin master
```

### Step 4: Install Dependencies and Restart Services

```bash
# Backend dependencies
cd backend
npm install

# Frontend dependencies
cd ../frontend
npm install

# Build frontend (if needed)
npm run build

# Restart backend service (if using PM2)
pm2 restart all
# or
pm2 restart backend

# Or if using systemd
sudo systemctl restart your-backend-service
```

---

## Option 2: Direct File Transfer (SCP)

### Step 1: Transfer Files from Local to Server

```bash
# Transfer entire project
scp -r /path/to/local/project username@your-vm-ip:/path/to/destination

# Example:
scp -r C:\Users\shyam\Documents\Dev\sol-emp-accomodation ubuntu@192.168.1.100:/home/ubuntu/apps/
```

### Step 2: SSH into Server and Set Up

```bash
# SSH into server
ssh username@your-vm-ip

# Navigate to project
cd /home/ubuntu/apps/sol-emp-accomodation

# Install dependencies
cd backend && npm install
cd ../frontend && npm install

# Build frontend
cd frontend && npm run build
```

---

## Option 3: Using rsync (Efficient for Updates)

```bash
# Sync files (excludes node_modules)
rsync -avz --exclude 'node_modules' --exclude '.git' \
  /path/to/local/project/ username@your-vm-ip:/path/to/destination/

# Example:
rsync -avz --exclude 'node_modules' --exclude '.git' \
  C:\Users\shyam\Documents\Dev\sol-emp-accomodation\ ubuntu@192.168.1.100:/home/ubuntu/apps/sol-emp-accomodation/
```

---

## Server Setup Checklist

### 1. Install Node.js and npm (if not already installed)

```bash
# Update package list
sudo apt update

# Install Node.js (LTS version)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version
npm --version
```

### 2. Install PM2 for Process Management (Recommended)

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start backend with PM2
cd /path/to/project/backend
pm2 start server.js --name "sol-emp-backend"

# Start frontend with PM2 (if serving built files)
cd /path/to/project/frontend
pm2 start npm --name "sol-emp-frontend" -- start

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

### 3. Configure Nginx (for serving frontend and reverse proxy)

```bash
# Install Nginx
sudo apt install nginx

# Create Nginx configuration
sudo nano /etc/nginx/sites-available/sol-emp-accommodation
```

Add this configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;  # or your server IP

    # Frontend
    location / {
        root /path/to/project/frontend/build;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3000;  # Adjust port if different
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/sol-emp-accommodation /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

### 4. Set Up Firewall

```bash
# Allow SSH
sudo ufw allow 22

# Allow HTTP
sudo ufw allow 80

# Allow HTTPS (if using SSL)
sudo ufw allow 443

# Enable firewall
sudo ufw enable
```

### 5. Environment Variables

```bash
# Create .env file in backend
cd /path/to/project/backend
nano .env
```

Add your environment variables:
```
PORT=3000
JWT_SECRET=your-secret-key
NODE_ENV=production
```

---

## Quick Deployment Script

Create a deployment script on your server:

```bash
# Create deploy.sh
nano /path/to/project/deploy.sh
```

Add this content:

```bash
#!/bin/bash

echo "Starting deployment..."

# Navigate to project
cd /path/to/project

# Pull latest changes
git pull origin main

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Build frontend
npm run build

# Restart services
pm2 restart sol-emp-backend
pm2 restart sol-emp-frontend

echo "Deployment complete!"
```

Make it executable:
```bash
chmod +x deploy.sh
```

Run it:
```bash
./deploy.sh
```

---

## Troubleshooting

### Check if services are running:
```bash
pm2 status
pm2 logs
```

### Check Nginx status:
```bash
sudo systemctl status nginx
sudo nginx -t
```

### Check ports:
```bash
sudo netstat -tulpn | grep :3000
sudo netstat -tulpn | grep :80
```

### View logs:
```bash
# PM2 logs
pm2 logs sol-emp-backend

# Nginx logs
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

---

## Security Notes

1. **Use HTTPS**: Set up SSL certificate with Let's Encrypt
2. **Firewall**: Only open necessary ports
3. **Environment Variables**: Never commit .env files
4. **Regular Updates**: Keep system and dependencies updated
5. **Backups**: Set up regular backups of your data

---

## Need Help?

If you encounter issues, check:
- Node.js version compatibility
- Port conflicts
- File permissions
- Firewall rules
- Service status

