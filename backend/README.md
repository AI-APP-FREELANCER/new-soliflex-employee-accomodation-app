# Backend API - Soliflex Quarters Manager

## Quick Start

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```env
PORT=5000
JWT_SECRET=your-secret-key-change-in-production
NODE_ENV=development
```

3. Ensure `agreement.xlsx` is in the parent directory

4. Start server:
```bash
npm start
# or
npm run dev
```

## API Documentation

All endpoints require JWT authentication except `/api/auth/login` and `/api/health`.

### Authentication
- `POST /api/auth/login` - Login with username and password
- `GET /api/auth/verify` - Verify JWT token

### Residences
- `GET /api/residence` - List all residences
- `GET /api/residence/:id` - Get residence by ID
- `POST /api/residence` - Create new residence
- `PUT /api/residence/:id` - Update residence (no deletion)

### Agreements
- `GET /api/agreement` - List all agreements
- `GET /api/agreement/active` - List active agreements only
- `GET /api/agreement/:id` - Get agreement by ID
- `GET /api/agreement/residence/:residenceId` - Get agreements by residence
- `POST /api/agreement` - Create new agreement
- `PUT /api/agreement/:id` - Update agreement (no deletion)

### Employees
- `GET /api/employee` - List all employees
- `GET /api/employee/:id` - Get employee by ID
- `POST /api/employee` - Create new employee
- `PUT /api/employee/:id` - Update employee (no deletion)

## Data Storage

Currently using in-memory storage with Excel file as data source. Data persists during server runtime but resets on restart. In production, replace with PostgreSQL database.

