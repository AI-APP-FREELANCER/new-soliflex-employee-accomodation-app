# Complete Guide: Push to GitHub and Deploy on Ubuntu VM (HTTPS)

This guide covers:
1. **Part A:** Push code from Windows laptop to GitHub (step-by-step).
2. **Part B:** Configure Git on a new Ubuntu VM and pull the code.
3. **Part C:** Run the app on the VM (Node, PM2, ports).
4. **Part D:** Open required ports on the VM.
5. **Part E:** Nginx configuration for HTTPS hosting.

**App ports:** Backend `3000`, Frontend `3600`. Nginx listens on `80` (redirect to HTTPS) and `443` (HTTPS).

---

## Part A: Push Code from Windows Laptop to GitHub

### A.1 – Open PowerShell and go to your project

```powershell
cd C:\Users\shyam\Documents\Dev\sol-emp-accomodation
```

### A.2 – Check if Git is installed and if this folder is a repo

```powershell
git --version
git status
```

- If `git status` works, you already have a repo; go to **A.4**.
- If you see "not a git repository", continue with **A.3**.

### A.3 – Initialize Git and create first commit (only if not a repo)

```powershell
# Initialize repository
git init

# Add all files (respects .gitignore)
git add .

# First commit
git commit -m "Initial commit: Soliflex Quarters Manager with MIS dashboard"
```

### A.4 – Create the GitHub repository (on GitHub.com)

1. Log in to [https://github.com](https://github.com).
2. Click **"New repository"** (or **"+"** → **New repository**).
3. Set **Repository name** (e.g. `sol-emp-accommodation`).
4. Choose **Public** (or Private).
5. **Do not** add a README, .gitignore, or license (you already have code).
6. Click **"Create repository"**.

### A.5 – Add GitHub as remote and push (first time)

GitHub will show commands; use these (replace `YOUR_USERNAME` and `REPO_NAME` with yours):

**Option 1 – HTTPS (username + password or Personal Access Token):**

```powershell
git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git
git branch -M main
git push -u origin main
```

**Option 2 – SSH (if you use SSH keys with GitHub):**

```powershell
git remote add origin git@github.com:YOUR_USERNAME/REPO_NAME.git
git branch -M main
git push -u origin main
```

- If the branch is already named `main`, `git branch -M main` is harmless.
- **HTTPS:** If GitHub asks for a password, use a **Personal Access Token** (Settings → Developer settings → Personal access tokens), not your account password.
- **SSH:** If you get "Permission denied (publickey)", set up SSH keys and add the public key to GitHub (Settings → SSH and GPG keys).

### A.6 – Later: normal push workflow (after first time)

```powershell
cd C:\Users\shyam\Documents\Dev\sol-emp-accomodation
git add .
git status
git commit -m "Describe your changes here"
git push origin main
```

**Check:** On GitHub, open the repo and confirm your latest commit and files are there.

---

## Part B: Configure Git on New Ubuntu VM and Pull Code

### B.1 – SSH into the VM

```bash
ssh your_username@YOUR_VM_IP
# Example: ssh ubuntu@10.1.0.4
```

### B.2 – Install Git (if not installed)

```bash
sudo apt update
sudo apt install -y git
git --version
```

### B.3 – Set your Git identity (used for commits)

```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

### B.4 – Clone the repository (first time on this VM)

Choose **one** of these.

**HTTPS (simplest; will ask for GitHub username and token):**

```bash
cd ~
# Create a folder for the app (e.g. under your home)
mkdir -p accomodation
cd accomodation
git clone https://github.com/YOUR_USERNAME/REPO_NAME.git sol-emp-accommodation
cd sol-emp-accommodation
```

**SSH (after adding VM’s SSH key to GitHub):**

```bash
# Generate SSH key (press Enter for default path, set passphrase or leave empty)
ssh-keygen -t ed25519 -C "your.email@example.com" -f ~/.ssh/id_ed25519 -N ""

# Show public key – copy this and add it in GitHub: Settings → SSH and GPG keys → New SSH key
cat ~/.ssh/id_ed25519.pub
```

Then clone:

```bash
cd ~
mkdir -p accomodation
cd accomodation
git clone git@github.com:YOUR_USERNAME/REPO_NAME.git sol-emp-accommodation
cd sol-emp-accommodation
```

### B.5 – Later: pull latest code on VM

```bash
cd ~/accomodation/sol-emp-accommodation
git pull origin main
```

---

## Part C: Run the App on the Ubuntu VM

### C.1 – Install Node.js (LTS, e.g. 18 or 20)

```bash
# Option 1: NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v

# Option 2: nvm (optional)
# curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
# source ~/.bashrc && nvm install 20 && nvm use 20
```

### C.2 – Install PM2 globally

```bash
sudo npm install -g pm2
pm2 -v
```

### C.3 – Install dependencies and prepare app

```bash
cd ~/accomodation/sol-emp-accommodation

# Backend
cd backend
npm install
cd ..

# Frontend
cd frontend
npm install
npm run build
cd ..
```

### C.4 – Backend environment and data

```bash
cd ~/accomodation/sol-emp-accommodation/backend

# Create .env if it doesn’t exist
nano .env
```

Add or confirm (replace secret with a strong value):

```env
PORT=3000
JWT_SECRET=your-secure-random-secret-here
NODE_ENV=production
```

Save (Ctrl+O, Enter, Ctrl+X).

Place your `agreement.xlsx` in the project root (one level above `backend/`), or adjust path in `backend/data/excelReader.js` if you put it elsewhere.

### C.5 – Create logs and attachments directories

```bash
cd ~/accomodation/sol-emp-accommodation
mkdir -p logs attachments
```

### C.6 – Start app with PM2 (from project root)

```bash
cd ~/accomodation/sol-emp-accommodation
pm2 start ecosystem.config.js
pm2 save
pm2 startup
# Run the command that pm2 startup prints (sudo env PATH=...)
```

Backend runs on port **3000**, frontend on **3600**.  
Check:

```bash
pm2 status
curl -s http://127.0.0.1:3000/api/health
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3600
```

---

## Part D: Open Ports on the VM

You need **80** and **443** for Nginx (HTTP/HTTPS). Opening 3000/3600 is optional (only if you want direct access without Nginx).

### D.1 – UFW (recommended)

```bash
sudo ufw status
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
# Optional: allow direct access to app
# sudo ufw allow 3000/tcp
# sudo ufw allow 3600/tcp
sudo ufw enable
sudo ufw status
```

### D.2 – Cloud / firewall (Azure, AWS, GCP, etc.)

- In the cloud firewall/security group, allow **inbound**: TCP **80**, **443** (and optionally **22** for SSH).
- If the VM is behind a corporate firewall, ask IT to open 80 and 443 to the VM.

---

## Part E: Nginx Configuration for HTTPS

### E.1 – Install Nginx and Certbot

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
sudo systemctl enable nginx
```

### E.2 – Copy project Nginx config and set domain

```bash
# Copy the app’s nginx config (adjust path if your repo name differs)
sudo cp ~/accomodation/sol-emp-accommodation/nginx-accommodation.conf /etc/nginx/sites-available/accommodation.conf

# Edit to match your domain (if different)
sudo nano /etc/nginx/sites-available/accommodation.conf
```

Replace `accommodation.soliflexpackaging.com` with your domain (all 3 occurrences: `server_name` and the HTTP redirect block). Save and exit.

### E.3 – Use the correct SSL certificate paths

The config references Let’s Encrypt paths. Either:

**Option A – Certificate already exists (e.g. from another site):**

Edit the config and set the correct paths:

```bash
sudo nano /etc/nginx/sites-available/accommodation.conf
```

Update:

- `ssl_certificate` and `ssl_certificate_key` to your cert paths (e.g. `/etc/letsencrypt/live/yourdomain.com/fullchain.pem` and `.../privkey.pem`).
- `include /etc/letsencrypt/options-ssl-nginx.conf;` and `ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;` if they exist on the server.

**Option B – Get a new certificate with Certbot:**

1. Temporarily use a server block that only listens on 80 and has `server_name yourdomain.com;`.
2. Run:  
   `sudo certbot certonly --nginx -d yourdomain.com`  
   and follow the prompts.
3. Then put the paths Certbot gives you into `accommodation.conf` and add the 443 block (as in the current `nginx-accommodation.conf`).

### E.4 – Enable the site and test

```bash
sudo ln -sf /etc/nginx/sites-available/accommodation.conf /etc/nginx/sites-enabled/
# Disable default site if it conflicts
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### E.5 – DNS

Point your domain (e.g. `accommodation.soliflexpackaging.com`) to the VM’s **public IP** (A record). Wait for DNS to propagate.

### E.6 – Verify HTTPS

- Open `https://yourdomain.com` in a browser.
- You should see the app (login page). API calls go to `https://yourdomain.com/api/*` and are proxied to `http://127.0.0.1:3000`.

---

## Quick Reference

### Windows – push to GitHub

```powershell
cd C:\Users\shyam\Documents\Dev\sol-emp-accomodation
git add .
git commit -m "Your message"
git push origin main
```

### VM – pull and redeploy

```bash
cd ~/accomodation/sol-emp-accommodation
git pull origin main
cd backend && npm install && cd ..
cd frontend && npm install && npm run build && cd ..
pm2 restart sol-emp-backend
pm2 restart sol-emp-frontend
pm2 save
```

### Ports summary

| Service        | Port | Notes                    |
|----------------|------|--------------------------|
| Backend (Node) | 3000 | Used by Nginx `/api`     |
| Frontend (Node)| 3600 | Used by Nginx `/`        |
| Nginx HTTP     | 80   | Redirect to HTTPS        |
| Nginx HTTPS    | 443  | Serves the app over HTTPS|

### Files to check on VM

- `backend/.env` – PORT=3000, JWT_SECRET, NODE_ENV=production
- `ecosystem.config.js` – backend PORT 3000, frontend PORT 3600
- `nginx-accommodation.conf` – `proxy_pass http://127.0.0.1:3000` for `/api`, `http://127.0.0.1:3600` for frontend
- `agreement.xlsx` at project root (or path in `backend/data/excelReader.js`)

---

## Troubleshooting

**Push rejected (GitHub):**  
Use a Personal Access Token for HTTPS, or add the VM’s SSH key to GitHub for SSH.

**Clone/pull asks for password:**  
For HTTPS, use a token. For SSH, ensure `ssh -T git@github.com` works and the key is added in GitHub.

**Backend not listening on 3000:**  
Run `pm2 logs sol-emp-backend`, check `backend/.env` for PORT=3000 and that no other process uses 3000: `sudo lsof -i :3000`.

**502 Bad Gateway from Nginx:**  
Backend or frontend not running. Check `pm2 status` and `curl http://127.0.0.1:3000/api/health` and `curl -I http://127.0.0.1:3600`.

**SSL certificate errors:**  
Confirm paths in Nginx and that Certbot ran for the same `server_name` domain.

**Frontend shows old version:**  
On VM run `cd frontend && npm run build && pm2 restart sol-emp-frontend && pm2 save`.
