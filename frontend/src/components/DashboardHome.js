import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Spin, Typography, Empty } from 'antd';
import { Column } from '@ant-design/charts'; 
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import {
  HomeOutlined,
  AlertOutlined,
  UserOutlined,
  UserDeleteOutlined,
  DollarOutlined,
  WalletOutlined,
  BankOutlined
} from '@ant-design/icons';

const { Title, Text } = Typography;

const DashboardHome = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    // Property Stats
    totalProperties: 0,
    
    // Employee Stats
    activeEmployees: 0,
    inactiveEmployees: 0,
    totalEmployees: 0,
    
    // Renewal Stats
    pastDue: 0,
    dueSoon: 0,
    currentDateIST: '',
    
    // Financial Stats
    totalMonthlyRent: 0,
    totalAdvanceLocked: 0,
    totalAdvanceDueBack: 0,
    totalNetReceived: 0,
    
    // Chart Data
    rentByDepartment: [],
    employeeBreakdown: []
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await api.get('/analytics');
        setData(response.data || {});
      } catch (error) {
        console.error("Dashboard fetch error:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Format currency for display
  const formatCurrency = (value) => {
    return `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Chart Configurations
  
  // Bar Chart: Rent by Department
  const rentColumnConfig = {
    data: (data.rentByDepartment || []).slice(0, 4),
    xField: 'department',
    yField: 'cost',
    // Force Y-axis to start at 0 so bars don't "float"
    yAxis: {
      min: 0,
    },
    label: {
      // Place labels on top for clarity
      position: 'top',
      content: (item) => {
        return formatCurrency(item.cost);
      },
      style: {
        fontSize: 12,
        fill: '#000000',
        opacity: 0.8,
      },
    },
    meta: {
      department: { alias: 'Department' },
      cost: { alias: 'Monthly Rent (₹)' },
    },
    color: '#1890ff',
  };

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  return (
    <div style={{ padding: '24px' }}>
      <Title level={2} style={{ marginBottom: '24px' }}>Dashboard Overview</Title>

      {/* First Row: Key Metrics */}
      <Row gutter={[16, 16]}>
        {/* Total Properties Managed */}
        <Col xs={24} sm={12} md={8} lg={6}>
          <Card style={{ height: '100%' }}>
            <Statistic
              title="Total Properties Managed"
              value={data.totalProperties || 0}
              prefix={<HomeOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>

        {/* Active Employees */}
        <Col xs={24} sm={12} md={8} lg={6}>
          <Card style={{ height: '100%' }}>
            <Statistic
              title="Active Employees"
              value={data.activeEmployees || 0}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>

        {/* Inactive Employees */}
        <Col xs={24} sm={12} md={8} lg={6}>
          <Card style={{ height: '100%' }}>
            <Statistic
              title="Inactive Employees"
              value={data.inactiveEmployees || 0}
              prefix={<UserDeleteOutlined />}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>

        {/* Total Monthly Rent */}
        <Col xs={24} sm={12} md={8} lg={6}>
          <Card style={{ height: '100%' }}>
            <Statistic
              title="Total Monthly Rent"
              value={data.totalMonthlyRent || 0}
              prefix={<DollarOutlined />}
              precision={2}
              formatter={(value) => formatCurrency(value)}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Second Row: Financial Metrics */}
      <Row gutter={[16, 16]} style={{ marginTop: '16px' }}>
        {/* Total Advance Locked */}
        <Col xs={24} sm={12} md={8} lg={6}>
          <Card style={{ height: '100%' }}>
            <Statistic
              title="Total Advance Locked"
              value={data.totalAdvanceLocked || 0}
              prefix={<WalletOutlined />}
              precision={2}
              formatter={(value) => formatCurrency(value)}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>

        {/* Total Advance Due Back */}
        <Col xs={24} sm={12} md={8} lg={6}>
          <Card style={{ height: '100%' }}>
            <Statistic
              title="Total Advance Due Back"
              value={data.totalAdvanceDueBack || 0}
              prefix={<WalletOutlined />}
              precision={2}
              formatter={(value) => formatCurrency(value)}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>

        {/* Total Net Received */}
        <Col xs={24} sm={12} md={8} lg={6}>
          <Card style={{ height: '100%' }}>
            <Statistic
              title="Total Net Received"
              value={data.totalNetReceived || 0}
              prefix={<DollarOutlined />}
              precision={2}
              formatter={(value) => formatCurrency(value)}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Third Row: Renewal Alerts */}
      <Row gutter={[16, 16]} style={{ marginTop: '16px' }}>
        {/* Due ≤ 90 Days (Clickable) */}
        <Col xs={24} sm={12} md={8} lg={6}>
          <Card 
            hoverable 
            style={{ height: '100%', cursor: 'pointer' }}
            onClick={() => navigate('/agreements?filter=due90')}
          >
            <Statistic
              title="Due ≤ 90 Days"
              value={data.dueSoon || 0}
              valueStyle={{ color: '#faad14' }}
              prefix={<AlertOutlined />}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">Click to view agreements</Text>
            </div>
          </Card>
        </Col>

        {/* Past Due (Clickable) */}
        <Col xs={24} sm={12} md={8} lg={6}>
          <Card 
            hoverable
            style={{ height: '100%', cursor: 'pointer' }}
            onClick={() => navigate('/agreements?filter=pastDue')}
          >
            <Statistic
              title="Past Due"
              value={data.pastDue || 0}
              valueStyle={{ color: '#ff4d4f' }}
              prefix={<AlertOutlined />}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">Click to view agreements</Text>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Charts Row */}
      <Row gutter={[16, 16]} style={{ marginTop: '24px' }}>
        {/* Rent by Department */}
        <Col xs={24} lg={12}>
          <Card title={<><BankOutlined /> Monthly Rent Cost by Department</>} >
            {data.rentByDepartment && data.rentByDepartment.length > 0 ? (
              <Column {...rentColumnConfig} style={{ height: 350 }} />
            ) : (
              <Empty description="No Rent Data Available" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </Col>

        {/* Employee Breakdown by Department */}
        <Col xs={24} lg={12}>
          <Card title={<><UserOutlined /> Employee Breakdown by Department</>} >
            {data.employeeBreakdown && data.employeeBreakdown.length > 0 ? (
              <Column 
                data={(data.employeeBreakdown || []).slice(0, 4)}
                xField="department"
                yField="count"
                yAxis={{ min: 0 }}
                label={{
                  position: 'top',
                  content: (item) => item.count.toString(),
                  style: {
                    fontSize: 12,
                    fill: '#000000',
                    opacity: 0.8,
                  },
                }}
                meta={{
                  department: { alias: 'Department' },
                  count: { alias: 'Employee Count' },
                }}
                color="#52c41a"
                style={{ height: 350 }}
              />
            ) : (
              <Empty description="No Employee Data Available" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DashboardHome;