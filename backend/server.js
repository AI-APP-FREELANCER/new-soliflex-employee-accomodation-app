const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
// Default to 3000 (matches VM configuration)
// For local development, ensure backend runs on 3000
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
const authRoutes = require('./routes/auth');
const residenceRoutes = require('./routes/residence');
const agreementRoutes = require('./routes/agreement');
const employeeRoutes = require('./routes/employee');
const analyticsRoutes = require('./routes/analytics');
const filesRoutes     = require('./routes/files');
const bedsRoutes      = require('./routes/beds');

app.use('/api/auth', authRoutes);
app.use('/api/residence', residenceRoutes);
app.use('/api/agreement', agreementRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/beds', bedsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Soliflex Quarters Manager API is running' });
});

app.listen(PORT, '0.0.0.0', () => {
  // Only log in development or if explicitly enabled
  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SERVER_LOGS === 'true') {
    console.log(`Server is running on port ${PORT}`);
  }
});

