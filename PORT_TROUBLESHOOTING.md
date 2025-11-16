# Port Troubleshooting Guide for Azure VM

## Quick Diagnostic Commands

### 1. Check if PM2 processes are running
```bash
pm2 status
pm2 logs
```

### 2. Check if ports are listening
```bash
# Method 1: Using netstat
sudo netstat -tuln | grep -E "(3000|5000)"

# Method 2: Using ss (more modern)
sudo ss -tuln | grep -E "(3000|5000)"

# Method 3: Using lsof
sudo lsof -i :3000
sudo lsof -i :5000
```

### 3. Check what's binding to the ports
```bash
# See all details
sudo ss -tulpn | grep -E "(3000|5000)"
```

### 4. Test local connectivity
```bash
# Test frontend
curl http://localhost:3000
curl http://127.0.0.1:3000

# Test backend
curl http://localhost:5000
curl http://127.0.0.1:5000
```

### 5. Test with private IP
```bash
# Get your private IP
hostname -I

# Test with private IP (replace with your actual IP)
curl http://YOUR_PRIVATE_IP:3000
curl http://YOUR_PRIVATE_IP:5000
```

### 6. Check firewall (UFW)
```bash
# Check UFW status
sudo ufw status verbose

# Check if ports are allowed
sudo ufw status | grep -E "(3000|5000)"

# Allow ports if needed
sudo ufw allow 3000/tcp
sudo ufw allow 5000/tcp
sudo ufw reload
```

### 7. Check iptables
```bash
# List all rules
sudo iptables -L -n -v

# Check specific ports
sudo iptables -L INPUT -n -v | grep -E "(3000|5000)"
```

### 8. Verify applications are binding to 0.0.0.0
```bash
# Check binding address
sudo ss -tuln | grep -E "(3000|5000)"
```

**Important**: The output should show `0.0.0.0:3000` and `0.0.0.0:5000`, NOT `127.0.0.1:3000` or `127.0.0.1:5000`

---

## Common Issues and Fixes

### Issue 1: Ports are listening but not accessible externally

**Check 1: Verify binding address**
```bash
sudo ss -tuln | grep -E "(3000|5000)"
```

If you see `127.0.0.1:3000` instead of `0.0.0.0:3000`, the app is only binding to localhost.

**Fix**: Ensure your applications bind to `0.0.0.0`:
- Frontend (`frontend/server.js`): Should have `app.listen(PORT, '0.0.0.0', ...)`
- Backend (`backend/server.js`): Should have `app.listen(PORT, '0.0.0.0', ...)`

### Issue 2: UFW firewall is blocking

**Check**:
```bash
sudo ufw status
```

**Fix**:
```bash
sudo ufw allow 3000/tcp
sudo ufw allow 5000/tcp
sudo ufw reload
```

### Issue 3: Azure NSG rules not configured correctly

**Check in Azure Portal**:
1. Go to your VM → Networking
2. Check Inbound port rules
3. Verify rules exist for:
   - Port 3000 (Frontend)
   - Port 5000 (Backend)
4. Source should be `*` or your IP
5. Protocol should be `TCP`
6. Action should be `Allow`

**Fix**: Add/update NSG rules in Azure Portal

### Issue 4: Applications not running

**Check**:
```bash
pm2 status
pm2 logs
```

**Fix**:
```bash
# Restart applications
pm2 restart all

# Or restart individually
pm2 restart sol-emp-backend
pm2 restart sol-emp-frontend

# Check logs for errors
pm2 logs sol-emp-backend --lines 50
pm2 logs sol-emp-frontend --lines 50
```

### Issue 5: Port already in use by another process

**Check**:
```bash
sudo lsof -i :3000
sudo lsof -i :5000
```

**Fix**: Kill the process or change the port in your configuration

---

## Step-by-Step Diagnostic Process

### Step 1: Run the diagnostic script
```bash
chmod +x check-ports.sh
./check-ports.sh
```

### Step 2: Verify PM2 processes
```bash
pm2 status
```

Expected output should show both `sol-emp-backend` and `sol-emp-frontend` as `online`

### Step 3: Check port bindings
```bash
sudo ss -tuln | grep -E "(3000|5000)"
```

Expected output:
```
tcp   LISTEN  0  128  0.0.0.0:3000  0.0.0.0:*
tcp   LISTEN  0  128  0.0.0.0:5000  0.0.0.0:*
```

### Step 4: Test local connectivity
```bash
curl -I http://localhost:3000
curl -I http://localhost:5000
```

Both should return HTTP status codes (200, 301, 302, etc.)

### Step 5: Test with private IP
```bash
PRIVATE_IP=$(hostname -I | awk '{print $1}')
curl -I http://$PRIVATE_IP:3000
curl -I http://$PRIVATE_IP:5000
```

### Step 6: Verify Azure NSG
- Go to Azure Portal → Your VM → Networking
- Check Inbound port rules
- Ensure ports 3000 and 5000 are allowed

### Step 7: Test from external machine
```bash
# From your local machine, test with public IP
curl -I http://YOUR_VM_PUBLIC_IP:3000
curl -I http://YOUR_VM_PUBLIC_IP:5000
```

---

## Quick Fix Commands

If ports are not working, try these in order:

```bash
# 1. Restart PM2 processes
pm2 restart all

# 2. Allow ports in UFW
sudo ufw allow 3000/tcp
sudo ufw allow 5000/tcp
sudo ufw reload

# 3. Check if apps are running
pm2 status

# 4. Check logs for errors
pm2 logs --lines 50

# 5. Verify port bindings
sudo ss -tuln | grep -E "(3000|5000)"
```

---

## Getting Your VM IP Addresses

```bash
# Private IP
hostname -I

# Public IP (from within VM)
curl ifconfig.me
# or
curl icanhazip.com

# All network interfaces
ip addr show
```

---

## Azure NSG Rule Configuration

In Azure Portal, create these inbound rules:

**Rule 1: Frontend**
- Name: `Allow-Frontend-3000`
- Priority: 1000
- Source: `*` (or specific IP)
- Source port ranges: `*`
- Destination: `*`
- Destination port ranges: `3000`
- Protocol: `TCP`
- Action: `Allow`

**Rule 2: Backend**
- Name: `Allow-Backend-5000`
- Priority: 1001
- Source: `*` (or specific IP)
- Source port ranges: `*`
- Destination: `*`
- Destination port ranges: `5000`
- Protocol: `TCP`
- Action: `Allow`

