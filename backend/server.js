const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

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

app.use('/api/auth', authRoutes);
app.use('/api/residence', residenceRoutes);
app.use('/api/agreement', agreementRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/analytics', analyticsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Soliflex Quarters Manager API is running' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

