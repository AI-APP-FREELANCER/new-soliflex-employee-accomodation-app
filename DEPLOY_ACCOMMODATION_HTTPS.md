# Deploy Soliflex Quarters Manager at https://accommodation.soliflexpackaging.com

End-to-end steps: push code to GitHub → set up Git and run the app on Ubuntu VM → serve over **HTTPS** at **accommodation.soliflexpackaging.com** with Nginx and Let's Encrypt.

**Assumptions:**  
- DNS for **accommodation.soliflexpackaging.com** points to your new VM’s public IP (GoDaddy updated and propagated).  
- You have SSH access to the VM.

---

## Phase 1: Push code to GitHub (Windows)

### 1.1 Open project and check Git

```powershell
cd C:\Users\shyam\Documents\Dev\sol-emp-accomodation
git --version
git status
```

If you see **“not a git repository”**:

```powershell
git init
git add .
git commit -m "Initial commit: Soliflex Quarters Manager with MIS dashboard and HTTPS deployment"
```

### 1.2 Create repo on GitHub

1. Go to [https://github.com/new](https://github.com/new).
2. **Repository name:** e.g. `sol-emp-accommodation`.
3. **Public** (or Private). Do **not** add README / .gitignore / license.
4. Click **Create repository**.

### 1.3 Add remote and push

Replace `YOUR_GITHUB_USERNAME` and `YOUR_REPO_NAME` with your values.

**HTTPS (use a Personal Access Token when asked for password):**

```powershell
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

**SSH (if you use SSH keys with GitHub):**

```powershell
git remote add origin git@github.com:YOUR_GITHUB_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

Confirm the code appears on GitHub.

---

## Phase 2: Ubuntu VM – one-time setup (Git, Node, PM2, Nginx, Certbot)

SSH into the VM:

```bash
ssh your_username@YOUR_VM_IP
```

### 2.1 Install Git and configure identity

```bash
sudo apt update
sudo apt install -y git
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

### 2.2 Clone the repository

Replace the URL with your repo (HTTPS or SSH).

```bash
mkdir -p ~/accomodation
cd ~/accomodation
git clone https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME.git sol-emp-accommodation
cd sol-emp-accommodation
```

### 2.3 Install Node.js (LTS 20.x)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

### 2.4 Install PM2

```bash
sudo npm install -g pm2
pm2 -v
```

### 2.5 Install Nginx and Certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo systemctl enable nginx
```

### 2.6 Open firewall (ports 80 and 443)

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status
```

Ensure your cloud/VM security group also allows **80** and **443** inbound.

---

## Phase 3: Run the app on the VM

All from the project root on the VM.

### 3.1 Install dependencies and build frontend

```bash
cd ~/accomodation/sol-emp-accommodation

cd backend && npm install && cd ..
cd frontend && npm install && npm run build && cd ..
```

### 3.2 Backend environment

```bash
cd ~/accomodation/sol-emp-accommodation/backend
nano .env
```

Add or confirm (use a strong secret):

```env
PORT=3000
JWT_SECRET=your-secure-random-secret-here
NODE_ENV=production
```

Save (Ctrl+O, Enter, Ctrl+X).

### 3.3 Create directories and add data file

```bash
cd ~/accomodation/sol-emp-accommodation
mkdir -p logs attachments
```

Place your **agreement.xlsx** in the project root (same level as `backend/` and `frontend/`), or adjust the path in `backend/data/excelReader.js` if you use another location.

### 3.4 Start app with PM2

```bash
cd ~/accomodation/sol-emp-accommodation
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

Run the command that `pm2 startup` prints (the one starting with `sudo env PATH=...`).

### 3.5 Verify backend and frontend

```bash
curl -s http://127.0.0.1:3000/api/health
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3600
```

You should get a JSON health response and `200` (or similar) for the frontend.

---

## Phase 4: Obtain SSL certificate for accommodation.soliflexpackaging.com

DNS must already point **accommodation.soliflexpackaging.com** to this VM’s public IP.

### 4.1 Webroot for Certbot

```bash
sudo mkdir -p /var/www/accommodation
sudo chown -R www-data:www-data /var/www/accommodation
```

### 4.2 Use HTTP-only Nginx config (for certificate issuance)

```bash
# Remove default site to avoid conflicts
sudo rm -f /etc/nginx/sites-enabled/default

# Copy the HTTP-only config (used only for obtaining the cert)
sudo cp ~/accomodation/sol-emp-accommodation/nginx-accommodation-http-only.conf /etc/nginx/sites-available/accommodation-http.conf
sudo ln -sf /etc/nginx/sites-available/accommodation-http.conf /etc/nginx/sites-enabled/

sudo nginx -t && sudo systemctl reload nginx
```

### 4.3 Get the certificate (webroot method)

```bash
sudo certbot certonly --webroot -w /var/www/accommodation -d accommodation.soliflexpackaging.com --non-interactive --agree-tos -m your.email@example.com
```

Replace `your.email@example.com` with your email. If you prefer interactive prompts, omit `--non-interactive --agree-tos -m ...`.

On success, Certbot will create:

- `/etc/letsencrypt/live/accommodation.soliflexpackaging.com/fullchain.pem`
- `/etc/letsencrypt/live/accommodation.soliflexpackaging.com/privkey.pem`

### 4.4 Switch to full HTTPS Nginx config

```bash
# Remove the HTTP-only config
sudo rm -f /etc/nginx/sites-enabled/accommodation-http.conf

# Enable the full HTTPS config (API → 3000, Frontend → 3600)
sudo cp ~/accomodation/sol-emp-accommodation/nginx-accommodation.conf /etc/nginx/sites-available/accommodation.conf
sudo ln -sf /etc/nginx/sites-available/accommodation.conf /etc/nginx/sites-enabled/

sudo nginx -t && sudo systemctl reload nginx
```

### 4.5 Optional: auto-renewal (recommended)

```bash
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
sudo systemctl status certbot.timer
```

Renewal will use the same certificate paths; after renewal, reload Nginx (e.g. via a certbot renewal hook if you add one).

---

## Phase 5: Verify HTTPS

1. Open **https://accommodation.soliflexpackaging.com** in a browser.  
2. You should see the app (login page) and a valid padlock (certificate for accommodation.soliflexpackaging.com).  
3. Log in and use the app; API calls go to `https://accommodation.soliflexpackaging.com/api/*` and are proxied to the backend on port 3000.

---

## Ongoing: Deploy new code (after you push to GitHub)

**On Windows (push):**

```powershell
cd C:\Users\shyam\Documents\Dev\sol-emp-accomodation
git add .
git commit -m "Your change description"
git push origin main
```

**On VM (pull and run):**

```bash
cd ~/accomodation/sol-emp-accommodation
git pull origin main
cd backend && npm install && cd ..
cd frontend && npm install && npm run build && cd ..
pm2 restart sol-emp-backend
pm2 restart sol-emp-frontend
pm2 save
```

Or use the helper script (from project root):

```bash
cd ~/accomodation/sol-emp-accommodation
git pull origin main
chmod +x scripts/vm-pull-and-deploy.sh
./scripts/vm-pull-and-deploy.sh
```

No Nginx or Certbot changes are needed for normal code updates.

---

## Quick reference

| Item | Value |
|------|--------|
| **Domain** | accommodation.soliflexpackaging.com |
| **Backend** | Port 3000 (Nginx proxies `/api` here) |
| **Frontend** | Port 3600 (Nginx proxies `/` here) |
| **SSL** | Let's Encrypt (Certbot), paths under `/etc/letsencrypt/live/accommodation.soliflexpackaging.com/` |
| **Project on VM** | ~/accomodation/sol-emp-accommodation |

---

## Troubleshooting

**Certificate fails (e.g. “Connection refused” or “Invalid response”):**  
- Confirm DNS: `dig accommodation.soliflexpackaging.com` or `nslookup accommodation.soliflexpackaging.com` shows the VM’s public IP.  
- Ensure Nginx is running and listening on 80: `sudo ss -tlnp | grep :80`.  
- Ensure firewall/security group allows **80** and **443**.

**502 Bad Gateway:**  
- Backend/frontend not running: `pm2 status` and `pm2 logs`.  
- Test locally: `curl -s http://127.0.0.1:3000/api/health` and `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3600`.

**Mixed content or API errors in browser:**  
- Use **https://** (not http) for the site.  
- Frontend in production should use relative `/api` (no hardcoded `http://`); check `frontend/src/services/api.js` uses `/api` when `NODE_ENV === 'production'`.

**Renew certificate manually:**  
```bash
sudo certbot renew
sudo systemctl reload nginx
```
