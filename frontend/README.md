# Frontend - Soliflex Quarters Manager

## Quick Start

1. Install dependencies:
```bash
npm install
```

2. Start development server:
```bash
npm start
```

The app will open at `http://localhost:3000`

## Default Login

- Username: `admin`
- Password: `admin123`

## Project Structure

```
src/
├── components/      # React components
│   ├── Login.js    # Login page
│   └── Dashboard.js # Main dashboard
├── context/         # React Context
│   └── AuthContext.js # Authentication context
├── App.js          # Main app component with routing
└── index.js        # Entry point
```

## Features

- ✅ Ant Design Dark Theme
- ✅ JWT Authentication
- ✅ Protected Routes
- ✅ Professional Layout with Sidebar
- ✅ Responsive Design

## API Proxy

The frontend is configured to proxy API requests to `http://localhost:3000` (see `setupProxy.js`).

