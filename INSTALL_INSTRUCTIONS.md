# Installation Guide – Soliflex Quarters Manager (Accommodation App)

This document lists all **software**, **plugins**, and **dependencies** needed to run the app, and gives step-by-step install instructions for **Windows (development)** and **Ubuntu VM (production)**.

---

## Overview: What You Need

| Category | Windows (Dev) | Ubuntu VM (Production) |
|----------|----------------|--------------------------|
| **Runtime** | Node.js 18+ (LTS) | Node.js 18+ or 20 LTS |
| **Package manager** | npm (included with Node) | npm (included with Node) |
| **Version control** | Git | Git |
| **Process manager** | Not required | PM2 (global) |
| **Web server / SSL** | Not required | Nginx + Certbot |
| **Project dependencies** | Backend + Frontend (npm) | Backend + Frontend (npm) |
| **Data file** | agreement.xlsx | agreement.xlsx |
| **Backend config** | backend/.env | backend/.env |

---

# Part 1: Windows (Local Development)

## 1.1 – Install Git

1. Download: [https://git-scm.com/download/win](https://git-scm.com/download/win)
2. Run the installer; keep default options (or enable "Git from the command line").
3. Verify in **PowerShell** or **Command Prompt**:
   ```powershell
   git --version
   ```

## 1.2 – Install Node.js (LTS 20.x recommended)

1. Download: [https://nodejs.org/](https://nodejs.org/) – choose **LTS** (e.g. 20.x).
2. Run the installer; ensure **"Add to PATH"** is checked.
3. Restart the terminal, then verify:
   ```powershell
   node -v
   npm -v
   ```
   You should see versions like `v20.x.x` and `10.x.x`.

## 1.3 – Get the project code

Either **clone** (if you use GitHub):

```powershell
cd C:\Users\shyam\Documents\Dev
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git sol-emp-accomodation
cd sol-emp-accomodation
```

Or open your **existing** project folder:

```powershell
cd C:\Users\shyam\Documents\Dev\sol-emp-accomodation
```

## 1.4 – Install backend dependencies

From the **project root** (folder that contains `backend` and `frontend`):

```powershell
cd backend
npm install
cd ..
```

This installs (from `backend/package.json`):

- **Dependencies:** bcryptjs, cors, dayjs, dotenv, express, jsonwebtoken, multer, xlsx  
- **DevDependencies:** nodemon (optional, for auto-restart)

## 1.5 – Install frontend dependencies

```powershell
cd frontend
npm install
cd ..
```

This installs (from `frontend/package.json`):

- **Dependencies:** @ant-design/charts, @ant-design/icons, antd, axios, chart.js, dayjs, html2canvas, http-proxy-middleware, jspdf, react, react-chartjs-2, react-dom, react-router-dom, xlsx  
- **DevDependencies:** react-scripts (build and dev server)

## 1.6 – Backend environment file

Create `backend/.env` (in the `backend` folder):

```powershell
cd backend
# Create .env (use Notepad or: notepad .env)
```

Put this inside `.env` (change the secret to a strong random value):

```env
PORT=3000
JWT_SECRET=your-secure-random-secret-here
NODE_ENV=development
```

Save and close.

## 1.7 – Data file (Excel)

Place **agreement.xlsx** in the **project root** (same level as `backend` and `frontend`).  
The backend reads it from: `backend/data/../../agreement.xlsx` (i.e. project root).

If you use a different path, you must change it in `backend/data/excelReader.js` (variable `excelPath`).

## 1.8 – Run the app locally

**Terminal 1 – Backend:**

```powershell
cd C:\Users\shyam\Documents\Dev\sol-emp-accomodation\backend
npm start
```

You should see: `Server is running on port 3000`.

**Terminal 2 – Frontend:**

```powershell
cd C:\Users\shyam\Documents\Dev\sol-emp-accomodation\frontend
npm start
```

Browser should open at **http://localhost:3600**.  
API calls from the frontend go to **http://localhost:3000/api** (see `frontend/src/setupProxy.js` and `frontend/src/services/api.js`).

---

# Part 2: Ubuntu VM (Production)

## 2.1 – Update system and install Git

```bash
sudo apt update
sudo apt install -y git
git --version
```

Configure identity (optional but recommended):

```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

## 2.2 – Install Node.js 20 LTS (NodeSource)

**You must install Node.js first; npm is included with Node.** Do not install `npm` alone via `apt install npm` (that can give an old Node version).

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt install -y nodejs
node -v
npm -v
```

You should see Node v20.x and npm 10.x. If `curl` is missing, run: `apt install -y curl` then run the commands again.

## 2.3 – Install PM2 (process manager)

Only after Node and npm are installed:

```bash
npm install -g pm2
pm2 -v
```

If you get a permission error, use: `sudo npm install -g pm2`

## 2.4 – Install Nginx and Certbot (for HTTPS)

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo systemctl enable nginx
```

## 2.5 – Open firewall ports (80, 443)

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status
```

## 2.6 – Clone project and install project dependencies

Replace the URL with your GitHub repo:

```bash
mkdir -p ~/accomodation
cd ~/accomodation
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git sol-emp-accommodation
cd sol-emp-accommodation
```

**Backend:**

```bash
cd backend
npm install
cd ..
```

**Frontend (install + production build):**

```bash
cd frontend
npm install
npm run build
cd ..
```

## 2.7 – Backend environment file on VM

```bash
cd ~/accomodation/sol-emp-accommodation/backend
nano .env
```

Add (use a strong secret in production):

```env
PORT=3000
JWT_SECRET=your-secure-production-secret
NODE_ENV=production
```

Save: Ctrl+O, Enter, Ctrl+X.

## 2.8 – Data file and directories

- Place **agreement.xlsx** in the project root:  
  `~/accomodation/sol-emp-accommodation/agreement.xlsx`
- Create logs and attachments folders:

```bash
cd ~/accomodation/sol-emp-accommodation
mkdir -p logs attachments
```

## 2.9 – Start app with PM2

```bash
cd ~/accomodation/sol-emp-accommodation
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

Run the command that `pm2 startup` prints (the line with `sudo env PATH=...`) so PM2 starts on reboot.

## 2.10 – Nginx and SSL (for https://accommodation.soliflexpackaging.com)

Follow **Phase 4** in **DEPLOY_ACCOMMODATION_HTTPS.md** to:

- Create webroot for Certbot
- Use the HTTP-only Nginx config to obtain the certificate
- Switch to the full HTTPS Nginx config

---

# Part 3: Dependency reference (from package.json)

## Backend (`backend/package.json`)

| Package    | Purpose              |
|-----------|----------------------|
| bcryptjs  | Password hashing     |
| cors      | Cross-origin requests|
| dayjs     | Date handling        |
| dotenv    | Load .env            |
| express   | Web server           |
| jsonwebtoken | JWT auth         |
| multer    | File upload (PDF)    |
| xlsx      | Read Excel           |
| nodemon   | Dev auto-restart     |

## Frontend (`frontend/package.json`)

| Package           | Purpose                    |
|------------------|----------------------------|
| react, react-dom | UI framework               |
| react-router-dom| Routing                    |
| antd             | UI components              |
| @ant-design/icons| Icons                      |
| @ant-design/charts| Charts (if used)          |
| axios            | HTTP client                |
| dayjs            | Dates                      |
| xlsx             | Excel export               |
| html2canvas      | PDF export (screenshots)    |
| jspdf            | PDF generation             |
| http-proxy-middleware | Dev proxy to backend |
| react-scripts    | Build and dev server       |

All of these are installed automatically when you run `npm install` in `backend` and `frontend`.

---

# Part 4: Verify installation

## Windows

```powershell
# From project root
cd backend
node -e "require('express'); require('xlsx'); require('multer'); console.log('Backend deps OK');"
cd ../frontend
node -e "require('react'); require('antd'); console.log('Frontend deps OK');"
```

Backend running: `curl http://localhost:3000/api/health`  
Frontend running: open http://localhost:3600

## Ubuntu VM

```bash
cd ~/accomodation/sol-emp-accommodation/backend
node -e "require('express'); require('xlsx'); require('multer'); console.log('Backend deps OK');"
cd ../frontend
node -e "require('react'); require('antd'); console.log('Frontend deps OK');"
```

```bash
pm2 status
curl -s http://127.0.0.1:3000/api/health
```

---

# Part 5: Troubleshooting

**`npm install` fails (network / registry):**

- Check internet. Try: `npm config set registry https://registry.npmjs.org/`
- If behind a proxy, set `npm config set proxy` and `https-proxy` as needed.

**`node: command not found` (Windows):**

- Reinstall Node.js and ensure "Add to PATH" is selected; restart the terminal.

**Backend: `Cannot find module 'xlsx'` (or similar):**

- Run `npm install` again in `backend`. Ensure you are in the `backend` directory.

**Frontend: `PORT=3600` not recognized (Windows):**

- The script uses `set PORT=3600 && react-scripts start`. If you use a different shell, keep that syntax or set PORT in a `.env` file in `frontend`: `PORT=3600`.

**Backend: `EADDRINUSE: port 3000`:**

- Another process is using 3000. On Windows you can use the provided `kill-port-3000.ps1` or change `PORT` in `backend/.env`.

**Excel file not found:**

- Ensure `agreement.xlsx` is in the **project root** (parent of `backend/`). Path in code: `backend/data/excelReader.js` → `path.join(__dirname, '../../agreement.xlsx')`.

**VM: Nginx 502 Bad Gateway:**

- Ensure backend and frontend are running: `pm2 status`, `pm2 restart sol-emp-backend sol-emp-frontend`. Check `pm2 logs`.

---

# Quick command summary

**Windows – first-time setup:**

```powershell
cd C:\Users\shyam\Documents\Dev\sol-emp-accomodation
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
# Create backend\.env with PORT=3000, JWT_SECRET, NODE_ENV=development
# Place agreement.xlsx in project root
# Terminal 1: cd backend && npm start
# Terminal 2: cd frontend && npm start
```

**Ubuntu VM – first-time setup:**

```bash
# Install: git, node (20.x), pm2, nginx, certbot (see sections 2.1–2.5)
cd ~/accomodation/sol-emp-accommodation
cd backend && npm install && cd ..
cd frontend && npm install && npm run build && cd ..
# Create backend/.env, place agreement.xlsx, mkdir -p logs attachments
pm2 start ecosystem.config.js && pm2 save && pm2 startup
# Then configure Nginx + SSL (see DEPLOY_ACCOMMODATION_HTTPS.md)
```

**After pulling new code (VM):**

```bash
cd ~/accomodation/sol-emp-accommodation
git pull origin main
cd backend && npm install && cd ..
cd frontend && npm install && npm run build && cd ..
pm2 restart sol-emp-backend sol-emp-frontend
pm2 save
```
