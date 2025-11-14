import React, { useState } from 'react';
import { Layout, Menu, Button } from 'antd';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  HomeOutlined,
  FileTextOutlined,
  UserOutlined,
  LogoutOutlined,
  DashboardOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Residences from './Residences';
import Agreements from './Agreements';
import Employees from './Employees';
import DashboardHome from './DashboardHome';
import '../App.css';

const { Header, Sider, Content } = Layout;

const Dashboard = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedKey, setSelectedKey] = useState('dashboard');
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const menuItems = [
    {
      key: 'dashboard',
      icon: <DashboardOutlined />,
      label: 'Dashboard',
    },
    {
      key: 'residences',
      icon: <HomeOutlined />,
      label: 'Residences',
    },
    {
      key: 'agreements',
      icon: <FileTextOutlined />,
      label: 'Agreements',
    },
    {
      key: 'employees',
      icon: <UserOutlined />,
      label: 'Employees',
    },
  ];

  const renderContent = () => {
    switch (selectedKey) {
      case 'residences':
        return <Residences />;
      case 'agreements':
        return <Agreements />;
      case 'employees':
        return <Employees />;
      default:
        return <DashboardHome />;
    }
  };

  return (
    <Layout className="dashboard-layout">
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={250}
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          background: '#FFFFFF',
          borderRight: '1px solid #D9D9D9',
        }}
      >
        <div
          style={{
            height: 64,
            margin: 16,
            background: 'linear-gradient(135deg, #E87103 0%, #FF8C00 100%)',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF',
            fontWeight: 'bold',
            fontSize: collapsed ? '14px' : '16px',
          }}
        >
          {collapsed ? 'SQM' : 'Soliflex Quarters'}
        </div>
        <Menu
          theme="light"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => setSelectedKey(key)}
        />
      </Sider>
      <Layout 
        style={{ 
          marginLeft: collapsed ? 80 : 250, 
          transition: 'margin-left 0.2s',
          background: '#F0F2F5',
        }}
      >
        <Header
          style={{
            padding: '0 24px',
            background: '#FFFFFF',
            borderBottom: '1px solid #E0E0E0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{
              fontSize: '16px',
              width: 64,
              height: 64,
              color: '#262626',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ color: '#262626', fontWeight: 500 }}>
              Welcome, {user?.username || 'Admin'}
            </span>
            <Button
              type="primary"
              danger
              icon={<LogoutOutlined />}
              onClick={handleLogout}
            >
              Logout
            </Button>
          </div>
        </Header>
        <Content className="dashboard-content">
          {renderContent()}
        </Content>
      </Layout>
    </Layout>
  );
};

export default Dashboard;
