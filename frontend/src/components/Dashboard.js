import React, { useState, useEffect } from 'react';
import { Layout, Menu, Button, Drawer } from 'antd';
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
  const [mobileMenuVisible, setMobileMenuVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [selectedKey, setSelectedKey] = useState('dashboard');
  const [agreementsFilter, setAgreementsFilter] = useState(null);
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  // Responsive detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      // Auto-collapse sidebar on mobile
      if (window.innerWidth < 768) {
        setCollapsed(true);
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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

  const handleNavigateToAgreements = (filter) => {
    setAgreementsFilter(filter);
    setSelectedKey('agreements');
    if (isMobile) {
      setMobileMenuVisible(false);
    }
  };

  const handleMenuClick = ({ key }) => {
    setSelectedKey(key);
    if (isMobile) {
      setMobileMenuVisible(false);
    }
  };

  const renderContent = () => {
    switch (selectedKey) {
      case 'residences':
        return <Residences />;
      case 'agreements':
        return <Agreements initialFilter={agreementsFilter} onFilterClear={() => setAgreementsFilter(null)} />;
      case 'employees':
        return <Employees />;
      default:
        return <DashboardHome onNavigateToAgreements={handleNavigateToAgreements} />;
    }
  };

  // Sidebar menu component (reusable for both desktop and mobile)
  const sidebarMenu = (
    <>
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
          fontSize: collapsed && !isMobile ? '14px' : '16px',
        }}
      >
        {collapsed && !isMobile ? 'SQM' : 'Soliflex Quarters'}
      </div>
      <Menu
        theme="light"
        mode="inline"
        selectedKeys={[selectedKey]}
        items={menuItems}
        onClick={handleMenuClick}
      />
    </>
  );

  return (
    <Layout className="dashboard-layout" style={{ minHeight: '100vh' }}>
      {/* Desktop Sidebar */}
      {!isMobile && (
        <Sider
          trigger={null}
          collapsible
          collapsed={collapsed}
          width={250}
          collapsedWidth={80}
          style={{
            overflow: 'auto',
            height: '100vh',
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
            background: '#FFFFFF',
            borderRight: '1px solid #D9D9D9',
            zIndex: 100,
          }}
        >
          {sidebarMenu}
        </Sider>
      )}

      {/* Mobile Drawer */}
      {isMobile && (
        <Drawer
          title="Soliflex Quarters"
          placement="left"
          onClose={() => setMobileMenuVisible(false)}
          open={mobileMenuVisible}
          bodyStyle={{ padding: 0 }}
          width={250}
        >
          {sidebarMenu}
        </Drawer>
      )}

      <Layout 
        style={{ 
          marginLeft: isMobile ? 0 : (collapsed ? 80 : 250), 
          transition: 'margin-left 0.2s',
          background: '#F0F2F5',
          minHeight: '100vh',
        }}
      >
        <Header
          style={{
            padding: isMobile ? '0 16px' : '0 24px',
            background: '#FFFFFF',
            borderBottom: '1px solid #E0E0E0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            position: 'sticky',
            top: 0,
            zIndex: 99,
          }}
        >
          <Button
            type="text"
            icon={isMobile ? <MenuUnfoldOutlined /> : (collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />)}
            onClick={() => {
              if (isMobile) {
                setMobileMenuVisible(true);
              } else {
                setCollapsed(!collapsed);
              }
            }}
            style={{
              fontSize: '16px',
              width: isMobile ? 48 : 64,
              height: isMobile ? 48 : 64,
              color: '#262626',
            }}
          />
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: isMobile ? '8px' : '16px',
            flexWrap: 'wrap',
          }}>
            {!isMobile && (
              <span style={{ color: '#262626', fontWeight: 500 }}>
                Welcome, {user?.username || 'Admin'}
              </span>
            )}
            <Button
              type="primary"
              danger
              icon={<LogoutOutlined />}
              onClick={handleLogout}
              size={isMobile ? 'small' : 'middle'}
            >
              {isMobile ? '' : 'Logout'}
            </Button>
          </div>
        </Header>
        <Content 
          className="dashboard-content"
          style={{
            padding: isMobile ? '16px' : '24px',
            minHeight: 'calc(100vh - 64px)',
            width: '100%',
            maxWidth: '100%',
            overflowX: 'hidden',
          }}
        >
          {renderContent()}
        </Content>
      </Layout>
    </Layout>
  );
};

export default Dashboard;
