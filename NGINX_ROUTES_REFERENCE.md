# Complete Routes & API Reference for Nginx Configuration

## Frontend Routes (React Router)
**Base Path:** `/` (root)

| Route | Path | Component | Description |
|-------|------|-----------|-------------|
| Login | `/login` | Login | Authentication page |
| Dashboard | `/dashboard` | Dashboard | Main dashboard (protected) |
| Root Redirect | `/` | - | Redirects to `/dashboard` |

**Note:** All routes except `/login` are protected and require authentication.

---

## Backend API Routes
**Base Path:** `/api`

### 1. Authentication Routes (`/api/auth`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | User login |
| GET | `/api/auth/verify` | Verify authentication token |

### 2. Residence Routes (`/api/residence`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/residence` | Get all residences |
| GET | `/api/residence/:id` | Get residence by ID |
| POST | `/api/residence` | Create new residence |
| PUT | `/api/residence/:id` | Update residence |
| DELETE | `/api/residence/:id` | Delete residence (if implemented) |

### 3. Agreement Routes (`/api/agreement`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agreement` | Get all agreements |
| GET | `/api/agreement/active` | Get active agreements |
| GET | `/api/agreement/:id` | Get agreement by ID |
| GET | `/api/agreement/residence/:residenceId` | Get agreements by residence ID |
| POST | `/api/agreement` | Create new agreement |
| PUT | `/api/agreement/:id` | Update agreement |

### 4. Employee Routes (`/api/employee`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/employee` | Get all employees |
| GET | `/api/employee/:id` | Get employee by ID |
| POST | `/api/employee` | Create new employee |
| PUT | `/api/employee/:id` | Update employee |
| DELETE | `/api/employee/:id` | Delete employee (if implemented) |

### 5. Analytics Routes (`/api/analytics`)
| Method | Endpoint | Description | Query Params |
|--------|----------|-------------|--------------|
| GET | `/api/analytics/occupancy` | Get occupancy data | - |
| GET | `/api/analytics/occupancy-rate` | Get occupancy rate | - |
| GET | `/api/analytics/employee-status` | Get employee status breakdown | - |
| GET | `/api/analytics/renewal-alerts` | Get renewal alerts | `?days=60` |
| GET | `/api/analytics/financial-summary` | Get financial summary | `?startDate=&endDate=` |
| GET | `/api/analytics/spend-over-time` | Get spend over time | `?period=monthly` |
| GET | `/api/analytics/employee-breakdown` | Get employee breakdown | - |
| GET | `/api/analytics/department-rent-cost` | Get department rent cost | - |
| GET | `/api/analytics/cost-optimization-recommendations` | Get cost optimization recommendations | - |

### 6. Health Check
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check endpoint |

---

## Static Files (Frontend Build)
**Base Path:** `/static` (React build static assets)

| Path Pattern | Description |
|--------------|-------------|
| `/static/css/*` | CSS files |
| `/static/js/*` | JavaScript bundles |
| `/static/media/*` | Images and media files |
| `/favicon.ico` | Favicon |
| `/manifest.json` | Web app manifest |
| `/robots.txt` | Robots file (if exists) |

**Note:** React Router handles client-side routing, so all non-API routes should serve `index.html`.

---

## Current Port Configuration
- **Backend:** Port `5000` (Node.js/Express)
- **Frontend:** Port `3600` (Node.js/Express serving React build)

---

## Nginx Configuration Summary

### Routes to Proxy to Backend (Port 5000)
- All `/api/*` routes → Backend

### Routes to Proxy to Frontend (Port 3600)
- All other routes (`/`, `/login`, `/dashboard`, etc.) → Frontend
- Static files (`/static/*`, `/favicon.ico`, etc.) → Frontend

### Special Handling
- React Router: All non-API routes should serve `index.html` for client-side routing
- API routes: Proxy to backend with proper headers
- Static assets: Serve directly from frontend build

---

## Example Nginx Configuration Structure

```nginx
# API routes → Backend (port 5000)
location /api {
    proxy_pass http://localhost:5000;
    # ... proxy settings
}

# Static files → Frontend (port 3600)
location /static {
    proxy_pass http://localhost:3600;
    # ... proxy settings
}

# All other routes → Frontend (port 3600) - React Router
location / {
    proxy_pass http://localhost:3600;
    # ... proxy settings
    # Important: Handle React Router by serving index.html for all routes
}
```

---

## Complete API Endpoint List (for reference)

### Authentication
- `POST /api/auth/login`
- `GET /api/auth/verify`

### Residences
- `GET /api/residence`
- `GET /api/residence/:id`
- `POST /api/residence`
- `PUT /api/residence/:id`

### Agreements
- `GET /api/agreement`
- `GET /api/agreement/active`
- `GET /api/agreement/:id`
- `GET /api/agreement/residence/:residenceId`
- `POST /api/agreement`
- `PUT /api/agreement/:id`

### Employees
- `GET /api/employee`
- `GET /api/employee/:id`
- `POST /api/employee`
- `PUT /api/employee/:id`

### Analytics
- `GET /api/analytics/occupancy`
- `GET /api/analytics/occupancy-rate`
- `GET /api/analytics/employee-status`
- `GET /api/analytics/renewal-alerts?days=60`
- `GET /api/analytics/financial-summary?startDate=&endDate=`
- `GET /api/analytics/spend-over-time?period=monthly`
- `GET /api/analytics/employee-breakdown`
- `GET /api/analytics/department-rent-cost`
- `GET /api/analytics/cost-optimization-recommendations`

### Health
- `GET /api/health`

---

## Frontend Routes (Client-Side)
- `/` → Redirects to `/dashboard`
- `/login` → Login page
- `/dashboard` → Main dashboard (with nested routes handled by Dashboard component)

**Note:** The Dashboard component internally handles:
- Dashboard home view
- Residences tab
- Agreements tab
- Employees tab

These are client-side routes managed by React Router within the Dashboard component.

