import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check for existing token on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');

    if (storedToken && storedUser) {
      // Verify token is still valid
      verifyToken(storedToken, JSON.parse(storedUser));
    } else {
      setLoading(false);
    }
  }, []);

  const verifyToken = async (tokenToVerify, userData) => {
    try {
      const response = await axios.get('/api/auth/verify', {
        headers: {
          Authorization: `Bearer ${tokenToVerify}`,
        },
      });

      if (response.data.valid) {
        setToken(tokenToVerify);
        setUser(userData);
        setIsAuthenticated(true);
        // Set default axios header
        axios.defaults.headers.common['Authorization'] = `Bearer ${tokenToVerify}`;
      } else {
        // Token invalid, clear storage
        logout();
      }
    } catch (error) {
      console.error('Token verification failed:', error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (username, password) => {
    try {
      const response = await axios.post('/api/auth/login', {
        username,
        password,
      });

      const { token: newToken, user: userData } = response.data;

      // Store token and user in localStorage
      localStorage.setItem('token', newToken);
      localStorage.setItem('user', JSON.stringify(userData));

      // Set axios default header
      axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;

      setToken(newToken);
      setUser(userData);
      setIsAuthenticated(true);

      return { success: true };
    } catch (error) {
      console.error('Login failed:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Login failed',
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    delete axios.defaults.headers.common['Authorization'];
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
  };

  const value = {
    isAuthenticated,
    user,
    token,
    loading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

