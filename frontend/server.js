const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3600;
const BACKEND_PORT = process.env.BACKEND_PORT || 3000;
const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${BACKEND_PORT}`;

// Proxy API requests to backend (port 3000)
app.use(
  '/api',
  createProxyMiddleware({
    target: BACKEND_URL,
    changeOrigin: true,
    logLevel: 'debug',
  })
);

// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, 'build')));

// Handle React routing, return all requests to React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Frontend server is running on port ${PORT}`);
  console.log(`API requests will be proxied to ${BACKEND_URL}`);
});

