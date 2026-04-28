import axios from 'axios';

// Dynamically determine API URL based on current host
// Backend runs on port 3000, Frontend on port 3600
const getApiBaseUrl = () => {
  // Check if we have an explicit API URL in environment
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  
  // If running in production (behind nginx), use relative path
  // This works when nginx proxies /api/* to backend
  if (process.env.NODE_ENV === 'production') {
    // Use relative path - nginx will handle routing to backend
    // This ensures HTTPS is maintained and no mixed content issues
    return '/api';
  }
  
  // Development: Explicitly point to backend on port 3000
  // Backend is on port 3000, frontend dev server is on port 3600
  return 'http://localhost:3000/api';
};

const API_BASE_URL = getApiBaseUrl();

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Auth APIs
export const authAPI = {
  login: (username, password) => api.post('/auth/login', { username, password }),
  verify: () => api.get('/auth/verify'),
};

// Residence APIs
export const residenceAPI = {
  getAll: (status = 'active') => api.get(`/residence?status=${status}`),
  getById: (id) => api.get(`/residence/${id}`),
  create: (data) => api.post('/residence', data),
  update: (id, data) => api.put(`/residence/${id}`, data),
  deactivate: (id, data) => api.patch(`/residence/${id}/deactivate`, data),
  uploadOwnerPhoto: (id, formData) =>
    api.post(`/residence/${id}/owner-photo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  deleteOwnerPhoto: (id) => api.delete(`/residence/${id}/owner-photo`),
};

// Agreement APIs
export const agreementAPI = {
  getAll: (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.status) queryParams.append('status', params.status);
    if (params.renewal_status) queryParams.append('renewal_status', params.renewal_status);
    if (params.residence_id) queryParams.append('residence_id', params.residence_id);
    const queryString = queryParams.toString();
    return api.get(`/agreement${queryString ? `?${queryString}` : ''}`);
  },
  getActive: () => api.get('/agreement/active'),
  getById: (id) => api.get(`/agreement/${id}`),
  getByResidence: (residenceId) => api.get(`/agreement/residence/${residenceId}`),
  create: (data) => api.post('/agreement', data),
  update: (id, data) => api.put(`/agreement/${id}`, data),
  deactivate: (id, data) => api.patch(`/agreement/${id}/deactivate`, data),
  // Attachment methods
  uploadAttachment: (id, formData) => api.post(`/agreement/${id}/attachment`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  deleteAttachment: (id) => api.delete(`/agreement/${id}/attachment`),
  getAttachmentUrl: (id) => {
    const baseUrl = api.defaults.baseURL || '';
    return `${baseUrl}/agreement/${id}/attachment`;
  },
  // Vacate and Refund methods
  scheduleVacate: (id, data) => api.post(`/agreement/${id}/schedule-vacate`, data),
  revokeVacate: (id) => api.post(`/agreement/${id}/revoke-vacate`),
  processRefund: (id, data) => api.post(`/agreement/${id}/process-refund`, data),
};

// Employee APIs
export const employeeAPI = {
  getAll: (status = 'active') => api.get(`/employee?status=${status}`),
  getById: (id) => api.get(`/employee/${id}`),
  create: (data) => api.post('/employee', data),
  update: (id, data) => api.put(`/employee/${id}`, data),
  deactivate: (id, data) => api.patch(`/employee/${id}/deactivate`, data),
  uploadPhoto: (id, formData) =>
    api.post(`/employee/${id}/photo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  deletePhoto: (id) => api.delete(`/employee/${id}/photo`),
};

// Analytics/Reporting APIs
export const analyticsAPI = {
  getOccupancy: () => api.get('/analytics/occupancy'),
  getOccupancyRate: () => api.get('/analytics/occupancy-rate'),
  getEmployeeStatus: () => api.get('/analytics/employee-status'),
  getRenewalAlerts: (days = 60) => api.get(`/analytics/renewal-alerts?days=${days}`),
  getFinancialSummary: (startDate, endDate) => {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    return api.get('/analytics/financial-summary', { params });
  },
  getSpendOverTime: (period = 'monthly') => api.get(`/analytics/spend-over-time?period=${period}`),
  getEmployeeBreakdown: () => api.get('/analytics/employee-breakdown'),
  getDepartmentRentCost: () => api.get('/analytics/department-rent-cost'),
};

export default api;

