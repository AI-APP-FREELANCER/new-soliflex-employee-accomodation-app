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
import { useResponsive } from '../utils/useResponsive';
import '../App.css';

const { Header, Sider, Content } = Layout;

const Dashboard = () => {
  const responsive = useResponsive();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuVisible, setMobileMenuVisible] = useState(false);
  const [selectedKey, setSelectedKey] = useState('dashboard');
  const [agreementsFilter, setAgreementsFilter] = useState(null);
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  // Auto-collapse sidebar on mobile
  useEffect(() => {
    if (responsive.isMobileOrTablet) {
      setCollapsed(true);
    }
  }, [responsive.isMobileOrTablet]);

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
    if (responsive.isMobileOrTablet) {
      setMobileMenuVisible(false);
    }
  };

  const handleMenuClick = ({ key }) => {
    setSelectedKey(key);
    if (responsive.isMobileOrTablet) {
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
          fontSize: collapsed && !responsive.isMobileOrTablet ? '14px' : '16px',
        }}
      >
        {collapsed && !responsive.isMobileOrTablet ? 'SQM' : 'Soliflex Quarters'}
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
      {!responsive.isMobileOrTablet && (
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
      {responsive.isMobileOrTablet && (
        <Drawer
          title="Soliflex Quarters"
          placement="left"
          onClose={() => setMobileMenuVisible(false)}
          open={mobileMenuVisible}
          bodyStyle={{ padding: 0 }}
          width={responsive.isMobile ? 280 : 300}
        >
          {sidebarMenu}
        </Drawer>
      )}

      <Layout 
        style={{ 
          marginLeft: responsive.isMobileOrTablet ? 0 : (collapsed ? 80 : 250), 
          transition: 'margin-left 0.2s',
          background: '#F0F2F5',
          minHeight: '100vh',
        }}
      >
        <Header
          style={{
            padding: responsive.isMobile ? '0 12px' : responsive.isTablet ? '0 16px' : '0 24px',
            background: '#FFFFFF',
            borderBottom: '1px solid #E0E0E0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            position: 'sticky',
            top: 0,
            zIndex: 99,
            height: responsive.isMobile ? 56 : 64,
          }}
        >
          <Button
            type="text"
            icon={responsive.isMobileOrTablet ? <MenuUnfoldOutlined /> : (collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />)}
            onClick={() => {
              if (responsive.isMobileOrTablet) {
                setMobileMenuVisible(true);
              } else {
                setCollapsed(!collapsed);
              }
            }}
            style={{
              fontSize: '16px',
              width: responsive.isMobile ? 40 : responsive.isTablet ? 48 : 64,
              height: responsive.isMobile ? 40 : responsive.isTablet ? 48 : 64,
              color: '#262626',
            }}
          />
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: responsive.isMobile ? '8px' : responsive.isTablet ? '12px' : '16px',
            flexWrap: 'wrap',
          }}>
            {!responsive.isMobile && (
              <span style={{ color: '#262626', fontWeight: 500, fontSize: responsive.isTablet ? '13px' : '14px' }}>
                Welcome, {user?.username || 'Admin'}
              </span>
            )}
            <Button
              type="primary"
              danger
              icon={<LogoutOutlined />}
              onClick={handleLogout}
              size={responsive.isMobile ? 'small' : 'middle'}
            >
              {responsive.isMobile ? '' : 'Logout'}
            </Button>
          </div>
        </Header>
        <Content 
          className="dashboard-content"
          style={{
            padding: responsive.isMobile ? '12px' : responsive.isTablet ? '16px' : '24px',
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
