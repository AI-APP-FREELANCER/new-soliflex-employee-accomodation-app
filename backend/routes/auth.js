const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const userStore = require('../data/userStore');
const User = require('../models/User');

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await userStore.findByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await User.comparePassword(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.user_id, 
        username: user.username, 
        role: user.role 
      },
      process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        userId: user.user_id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify token endpoint
router.get('/verify', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production', (err, decoded) => {
      if (err) {
        return res.status(403).json({ error: 'Invalid or expired token' });
      }
      res.json({ valid: true, user: decoded });
    });
  } catch (error) {
    console.error('Verify token error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

