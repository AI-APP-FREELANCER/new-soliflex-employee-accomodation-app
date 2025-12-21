import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Spin, Typography, List, Tag, Button, Empty } from 'antd';
import { 
  HomeOutlined, 
  UserOutlined, 
  FileProtectOutlined, 
  AlertOutlined,
  DollarOutlined,
  TeamOutlined,
  BarChartOutlined,
  ArrowRightOutlined
} from '@ant-design/icons';
import { Pie, Column } from '@ant-design/plots';
import { useNavigate } from 'react-router-dom';
import { residenceAPI, employeeAPI, agreementAPI } from '../services/api';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

const { Title, Text } = Typography;

const DashboardHome = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalResidences: 0,
    activeAgreements: 0,
    totalEmployees: 0,
    totalCapacity: 0,
    occupancyRate: 0,
    totalMonthlyRent: 0,
    upcomingRenewals: 0,
    pastDueRenewals: 0
  });

  const [chartsData, setChartsData] = useState({
    residenceStatus: [],
    employeeDistribution: [],
    costByDepartment: []
  });

  const [alerts, setAlerts] = useState([]);
  const navigate = useNavigate();

  // Helper to extract data array regardless of API wrapper
  const extractArray = (response) => {
    if (!response) return [];
    if (Array.isArray(response)) return response;
    if (response.data && Array.isArray(response.data)) return response.data;
    if (response.data?.data && Array.isArray(response.data.data)) return response.data.data;
    return [];
  };

  // Helper to normalize IDs for matching (Trim + Lowercase)
  const normalizeId = (id) => String(id || '').trim().toLowerCase();

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // Fetch all data in parallel
      const [residencesRes, employeesRes, agreementsRes] = await Promise.all([
        residenceAPI.getAll(),
        employeeAPI.getAll(),
        agreementAPI.getAll('all') // Fetch ALL to ensure we see everything
      ]);

      const residences = extractArray(residencesRes);
      const employees = extractArray(employeesRes);
      const agreements = extractArray(agreementsRes);

      console.log('Dashboard Data Fetched:', { 
        residences: residences.length, 
        employees: employees.length, 
        agreements: agreements.length 
      });

      calculateStats(residences, employees, agreements);
      generateCharts(residences, employees, agreements);
      generateAlerts(agreements);

    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const calculateStats = (residences, employees, agreements) => {
    // 1. Calculate Active/Total counts
    const activeAgreements = agreements.filter(a => 
      String(a.agreement_status || '').toLowerCase() === 'active'
    );
    
    // 2. Financials
    const totalRent = activeAgreements.reduce((sum, a) => {
      // Robust number parsing
      const amount = parseFloat(String(a.agreement_monthly_rent_amount || '0').replace(/[^\d.-]/g, ''));
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);

    // 3. Occupancy
    const totalCapacity = residences.reduce((sum, r) => sum + (Number(r.residence_capacity) || 0), 0);
    const totalOccupants = employees.filter(e => 
      String(e.status || '').toLowerCase() === 'active'
    ).length;
    
    // 4. Renewals Logic
    const today = dayjs();
    const ninetyDaysOut = today.add(90, 'day');
    
    let pastDue = 0;
    let upcoming = 0;

    activeAgreements.forEach(a => {
      if (!a.agreement_renewal_due_date) return;
      const due = dayjs(a.agreement_renewal_due_date);
      if (due.isBefore(today, 'day')) pastDue++;
      else if (due.isBefore(ninetyDaysOut, 'day')) upcoming++;
    });

    setStats({
      totalResidences: residences.length,
      activeAgreements: activeAgreements.length,
      totalEmployees: employees.length,
      totalCapacity,
      occupancyRate: totalCapacity ? Math.round((totalOccupants / totalCapacity) * 100) : 0,
      totalMonthlyRent: totalRent,
      upcomingRenewals: upcoming,
      pastDueRenewals: pastDue
    });
  };

  const generateCharts = (residences, employees, agreements) => {
    // 1. Residence Status (Pie)
    const statusCounts = { Active: 0, Inactive: 0, Maintenance: 0 };
    residences.forEach(r => {
      const s = String(r.residence_status || 'Active'); // Default to Active
      if (statusCounts[s] !== undefined) statusCounts[s]++;
      else statusCounts['Active']++;
    });
    
    const residenceStatusData = Object.keys(statusCounts).map(status => ({
      type: status,
      value: statusCounts[status]
    })).filter(d => d.value > 0);

    // 2. Cost by Department (Pro-Rata Calculation)
    const costMap = {};
    const activeEmployees = employees.filter(e => String(e.status).toLowerCase() === 'active');
    
    // Build Occupant Counts per Residence (Normalized ID)
    const occupantsPerRes = {};
    activeEmployees.forEach(emp => {
      const rid = normalizeId(emp.residence_id || emp.allocated_residence_id);
      if (rid) occupantsPerRes[rid] = (occupantsPerRes[rid] || 0) + 1;
    });

    // Distribute Rent
    activeEmployees.forEach(emp => {
      const rid = normalizeId(emp.residence_id || emp.allocated_residence_id);
      const dept = emp.department || 'Unassigned';
      
      // Find matching agreement
      const agreement = agreements.find(a => 
        normalizeId(a.agreement_residence_id) === rid && 
        String(a.agreement_status).toLowerCase() === 'active'
      );

      if (agreement && occupantsPerRes[rid] > 0) {
        const rent = parseFloat(String(agreement.agreement_monthly_rent_amount || '0').replace(/[^\d.-]/g, ''));
        const perHeadCost = rent / occupantsPerRes[rid];
        costMap[dept] = (costMap[dept] || 0) + perHeadCost;
      }
    });

    const costByDeptData = Object.keys(costMap).map(dept => ({
      department: dept,
      cost: Math.round(costMap[dept])
    })).sort((a, b) => b.cost - a.cost).slice(0, 8); // Top 8

    setChartsData({
      residenceStatus: residenceStatusData,
      costByDepartment: costByDeptData,
      employeeDistribution: [] // Placeholder if needed later
    });
  };

  const generateAlerts = (agreements) => {
    const today = dayjs();
    const newAlerts = [];
    
    agreements.forEach(a => {
      if (String(a.agreement_status).toLowerCase() !== 'active') return;
      if (!a.agreement_renewal_due_date) return;
      
      const due = dayjs(a.agreement_renewal_due_date);
      if (due.isBefore(today, 'day')) {
        newAlerts.push({
          id: a.agreement_id,
          message: `Agreement ${a.agreement_id} is PAST DUE since ${due.format('DD MMM YYYY')}`,
          type: 'error'
        });
      }
    });
    
    setAlerts(newAlerts.slice(0, 5)); // Show max 5 alerts
  };

  return (
    <div style={{ padding: '24px' }}>
      <Title level={2} style={{ marginBottom: 24 }}>Dashboard</Title>
      
      {loading ? <Spin size="large" style={{ display: 'block', margin: '100px auto' }} /> : (
        <>
          {/* Key Metrics Row */}
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic 
                  title="Total Properties" 
                  value={stats.totalResidences} 
                  prefix={<HomeOutlined />} 
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic 
                  title="Active Employees" 
                  value={stats.totalEmployees} 
                  prefix={<TeamOutlined />} 
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic 
                  title="Total Monthly Rent" 
                  value={stats.totalMonthlyRent} 
                  precision={0}
                  prefix="₹" 
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic 
                  title="Occupancy Rate" 
                  value={stats.occupancyRate} 
                  suffix="%" 
                  prefix={<BarChartOutlined />}
                  valueStyle={{ color: stats.occupancyRate > 90 ? '#cf1322' : '#3f8600' }}
                />
              </Card>
            </Col>
          </Row>

          {/* Actionable Alerts & Renewals */}
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={24} md={12}>
              <Card title="Upcoming Renewals & Alerts" extra={<AlertOutlined style={{ color: '#faad14' }} />}>
                <Row gutter={[16, 16]}>
                  <Col span={12}>
                     <Statistic 
                       title="Due ≤ 90 Days" 
                       value={stats.upcomingRenewals} 
                       valueStyle={{ color: '#faad14', cursor: 'pointer' }}
                       onClick={() => navigate('/agreements?filter=due90')}
                     />
                  </Col>
                  <Col span={12}>
                     <Statistic 
                       title="Past Due" 
                       value={stats.pastDueRenewals} 
                       valueStyle={{ color: '#ff4d4f', cursor: 'pointer' }}
                       onClick={() => navigate('/agreements?filter=pastDue')}
                     />
                  </Col>
                </Row>
                <List
                  style={{ marginTop: 16 }}
                  size="small"
                  dataSource={alerts}
                  renderItem={item => (
                    <List.Item>
                      <Text type={item.type === 'error' ? 'danger' : 'warning'}>
                        {item.message}
                      </Text>
                    </List.Item>
                  )}
                />
              </Card>
            </Col>

            <Col xs={24} md={12}>
               <Card title="Property Status Distribution">
                 {chartsData.residenceStatus.length > 0 ? (
                   <Pie 
                     data={chartsData.residenceStatus} 
                     angleField="value" 
                     colorField="type" 
                     radius={0.8} 
                     innerRadius={0.6}
                     label={{ type: 'inner', offset: '-30%', content: '{value}' }}
                     legend={{ position: 'bottom' }}
                     height={250}
                   />
                 ) : <Empty />}
               </Card>
            </Col>
          </Row>

          {/* Cost Charts */}
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <Card title="Monthly Rent Cost by Department (Top 8)">
                {chartsData.costByDepartment.length > 0 ? (
                  <Column 
                    data={chartsData.costByDepartment} 
                    xField="department" 
                    yField="cost" 
                    color="#1890ff"
                    label={{ position: 'middle', style: { fill: '#FFFFFF', opacity: 0.6 } }}
                  />
                ) : <Empty description="No cost data available (Check Employee-Residence Links)" />}
              </Card>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
};

export default DashboardHome;