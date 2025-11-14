import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, theme } from 'antd';
import App from './App';
import './index.css';

// Ant Design Light Theme Configuration - Professional ERP Look
const lightTheme = {
  token: {
    colorPrimary: '#E87103', // Professional deep orange accent color
    colorBgBase: '#F0F2F5', // Light grey page background
    colorBgContainer: '#FFFFFF', // White for card and content panel backgrounds
    colorBgElevated: '#FFFFFF', // White for elevated components
    colorBorder: '#D9D9D9', // Soft grey borders
    colorText: '#262626', // Soft dark grey text for high contrast
    colorTextSecondary: '#595959', // Medium grey for secondary text
    colorBorderSecondary: '#D9D9D9', // Secondary border color
    borderRadius: 6,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontSize: 14,
  },
  algorithm: theme.defaultAlgorithm,
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ConfigProvider theme={lightTheme}>
      <App />
    </ConfigProvider>
  </React.StrictMode>
);

