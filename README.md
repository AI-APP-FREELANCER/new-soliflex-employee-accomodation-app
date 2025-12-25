# Soliflex Quarters Manager

Employee Accommodation Management System for Soliflex Packaging

## Project Structure

```
sol-emp-accomodation/
├── backend/              # Node.js/Express API
│   ├── data/            # Data layer (Excel reader, user store)
│   ├── middleware/      # Authentication middleware
│   ├── models/          # Data models
│   ├── routes/          # API routes
│   └── server.js        # Express server
├── frontend/            # React frontend
│   ├── public/
│   └── src/
│       ├── components/  # React components
│       ├── context/     # React context (Auth)
│       └── App.js
├── agreement.xlsx       # Excel data source
└── README.md
```

## Technology Stack

### Backend
- Node.js
- Express.js
- JWT (JSON Web Tokens) for authentication
- bcryptjs for password hashing
- xlsx for Excel file reading
- PostgreSQL data modeling (currently using in-memory mock data)

### Frontend
- React 18
- Ant Design (AntD) with Dark Theme
- React Router for routing
- Axios for API calls

## Setup Instructions

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the backend directory:
```env
PORT=3000
JWT_SECRET=your-secret-key-change-in-production
NODE_ENV=development
```

4. Ensure the `agreement.xlsx` file is in the root directory (one level up from backend)

5. Start the backend server:
```bash
npm start
# or for development with auto-reload:
npm run dev
```

The backend API will be available at `http://localhost:3000`

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

The frontend will be available at `http://localhost:3000`

## Default Login Credentials

- **Username:** `admin`
- **Password:** `admin123`

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `GET /api/auth/verify` - Verify JWT token

### Residences
- `GET /api/residence` - Get all residences
- `GET /api/residence/:id` - Get residence by ID
- `POST /api/residence` - Create new residence
- `PUT /api/residence/:id` - Update residence (status management only)

### Agreements
- `GET /api/agreement` - Get all agreements
- `GET /api/agreement/active` - Get active agreements only
- `GET /api/agreement/:id` - Get agreement by ID
- `GET /api/agreement/residence/:residenceId` - Get agreements by residence
- `POST /api/agreement` - Create new agreement
- `PUT /api/agreement/:id` - Update agreement (status management only)

### Employees
- `GET /api/employee` - Get all employees
- `GET /api/employee/:id` - Get employee by ID
- `POST /api/employee` - Create new employee
- `PUT /api/employee/:id` - Update employee (status management only)

**Note:** All API endpoints (except `/api/auth/login` and `/api/health`) require authentication via JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

## Data Model

### Residence Master
- `residence_id` (Primary Key) - Format: `residence_id_001`
- `residence_owner_id`
- `residence_owner_name`
- `residence_door_number`
- `residence_address_line_1`
- `residence_address_line_2`
- `residence_address_line_3`
- `residence_state`
- `residence_pin_code`
- `residence_country`
- `residence_house_count`
- `residence_status` (Active/Inactive)

### Agreement Master
- `agreement_id` (Primary Key) - Format: `agreement_001`
- `agreement_residence_id` (Foreign Key → residence_master.residence_id)
- `agreement_possesion_date`
- `agreement_renewal_due_date`
- `agreement_employee_unit`
- `agreement_advance_amount`
- `agreement_monthly_rent_amount`
- `agreement_status` (Active/Inactive)

### Employee Master
- `employee_id` (Primary Key) - Alphanumeric
- `emplyee_allocated_agreement_id` (Foreign Key → agreement_master.agreement_id)
- `employee_first_name`
- `employee_last_name`
- `employee_sir_name`
- `employee_department`
- `employee_designation`
- `employee_date_of_joining`
- `employee_status` (Active/Inactive)

## Important Notes

1. **No Deletion**: The system uses status management (Active/Inactive) instead of physical deletion. All PUT endpoints allow updating the status field but prevent deletion of records.

2. **Excel Data Source**: Currently, the backend reads data from `agreement.xlsx` as a mock data source. In production, this should be replaced with a PostgreSQL database connection.

3. **Authentication**: All users default to ADMIN role as per HR requirements.

4. **One-to-Many Relationship**: One Residence can have multiple Agreement records (past, present, future).

## Phase 1 Completion

✅ Data models created for all three entities
✅ Excel file reader implemented
✅ JWT authentication system
✅ CRUD APIs for all entities (with status management)
✅ Active agreements endpoint
✅ React frontend with Ant Design
✅ Login component with API integration
✅ Professional layout with sidebar and dark theme
✅ Protected routes implementation

## Next Steps (Phase 2 & 3)

- Frontend CRUD screens for Residences, Agreements, and Employees
- Renewal workflow and due date calculations
- Advance refund handling for vacated properties
- Financial tracking and analytics
- Reporting and export functionality

