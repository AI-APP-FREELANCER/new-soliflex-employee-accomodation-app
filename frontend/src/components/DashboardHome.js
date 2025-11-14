import React, { useState, useEffect } from 'react';
import {
  Row,
  Col,
  Card,
  Statistic,
  Typography,
  Tag,
  Spin,
  Space,
  Alert,
} from 'antd';
import {
  HomeOutlined,
  UserOutlined,
  AlertOutlined,
  DollarOutlined,
  WalletOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { Column } from '@ant-design/charts';
import dayjs from 'dayjs';
import { analyticsAPI, residenceAPI, agreementAPI, employeeAPI } from '../services/api';

const { Title, Paragraph } = Typography;

const DashboardHome = () => {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    totalProperties: 0,
    upcomingRenewals: 0,
    totalMonthlyRent: 0,
    totalAdvanceLocked: 0,
  });
  const [employeeByDept, setEmployeeByDept] = useState([]);
  const [employeeStatus, setEmployeeStatus] = useState({ active: 0, inactive: 0 });
  const [financialSummary, setFinancialSummary] = useState(null);
  const [monthlySpend, setMonthlySpend] = useState([]);
  const [departmentRentCost, setDepartmentRentCost] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [departmentRentAggregated, setDepartmentRentAggregated] = useState([]);
  const [designationRentAggregated, setDesignationRentAggregated] = useState([]);
  const [processedCosts, setProcessedCosts] = useState({
    rentByDepartment: [],
    rentByDesignation: [],
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [
        residencesRes, 
        agreementsRes, 
        employeesRes, 
        renewalAlertsRes, 
        employeeBreakdownRes, 
        employeeStatusRes,
        financialSummaryRes,
        monthlySpendRes,
        departmentRentCostRes,
        recommendationsRes,
      ] = await Promise.all([
        residenceAPI.getAll(),
        agreementAPI.getAll(),
        employeeAPI.getAll(),
        analyticsAPI.getRenewalAlerts(90),
        analyticsAPI.getEmployeeBreakdown(),
        analyticsAPI.getEmployeeStatus(),
        analyticsAPI.getFinancialSummary(),
        analyticsAPI.getSpendOverTime('monthly'),
        analyticsAPI.getDepartmentRentCost(),
        analyticsAPI.getCostOptimizationRecommendations(),
      ]);

      const residences = residencesRes.data;
      const agreements = agreementsRes.data;
      const employees = employeesRes.data;

      // ============================================
      // PRO-RATA COST AGGREGATION
      // ============================================
      
      console.log('=== PRO-RATA CALCULATION DEBUG ===');
      console.log('Total Employees:', employees.length);
      console.log('Total Agreements:', agreements.length);
      
      // STAGE 1: Occupant Count and Per-Employee Share Calculation
      
      // Step 1.1: Count Active employees for each agreement
      // CRITICAL: Use emplyee_allocated_agreement_id as the primary join key
      const agreementOccupantCounts = {};
      let activeEmployeeCount = 0;
      
      employees.forEach(employee => {
        // Status Check Standardization: Handle varied casing and nulls gracefully
        const employeeStatus = employee.employee_status || employee.employeeStatus || '';
        const isActive = employeeStatus && String(employeeStatus).toUpperCase() === 'ACTIVE';
        
        if (isActive) {
          activeEmployeeCount++;
          // Primary join key: emplyee_allocated_agreement_id (with typo)
          const agreementIdRaw = employee.emplyee_allocated_agreement_id || null;
          
          if (agreementIdRaw) {
            // Agreement ID Normalization: Normalize to string and trim for consistent matching
            const normalizedAgreementId = String(agreementIdRaw).trim();
            if (normalizedAgreementId) {
              agreementOccupantCounts[normalizedAgreementId] = (agreementOccupantCounts[normalizedAgreementId] || 0) + 1;
            }
          }
        }
      });
      
      // Debug 1: Log the total count of Active employees found
      console.log('DEBUG 1 - Active Employees Count:', activeEmployeeCount);
      console.log('Agreement Occupant Counts:', agreementOccupantCounts);

      // Step 1.2: Calculate Per-Employee Share for each agreement
      const agreementPerEmployeeShares = {};
      let agreementsWithRent = 0;
      let agreementsWithOccupants = 0;
      
      agreements.forEach(agreement => {
        // Agreement ID Normalization: Use same normalization as Stage 1
        const agreementIdRaw = agreement.agreement_id || null;
        const agreementId = agreementIdRaw ? String(agreementIdRaw).trim() : null;
        
        if (!agreementId) return;
        
        // Rent Data Type Enforcement: Ensure rent is always a valid number
        const monthlyRentRaw = agreement.agreement_monthly_rent_amount || 0;
        const monthlyRent = Number(monthlyRentRaw) || 0;
        
        if (monthlyRent > 0) {
          agreementsWithRent++;
        }
        
        // Use the SAME normalized key to look up occupant count
        const occupantCount = agreementOccupantCounts[agreementId] || 0;
        
        if (occupantCount > 0) {
          agreementsWithOccupants++;
        }
        
        // Calculate per-employee share: rent / occupant count
        const perEmployeeShare = (occupantCount > 0 && monthlyRent > 0) 
          ? Number((monthlyRent / occupantCount).toFixed(2)) 
          : 0;
        
        // Store using the SAME normalized key for Stage 2 lookup
        agreementPerEmployeeShares[agreementId] = perEmployeeShare;
      });
      
      console.log('Agreements with Rent > 0:', agreementsWithRent);
      console.log('Agreements with Occupants:', agreementsWithOccupants);
      
      // Debug 2: Log the final agreementPerEmployeeShares map
      console.log('DEBUG 2 - Per-Employee Shares Map (Complete):', agreementPerEmployeeShares);

      // STAGE 2: Aggregation by Department and Designation
      
      const departmentRentMap = {};
      const designationRentMap = {};
      let employeesProcessed = 0;
      let employeesWithShare = 0;
      let joinFailures = 0;

      employees.forEach(employee => {
        // Status Check Standardization: Same as Stage 1
        const employeeStatus = employee.employee_status || employee.employeeStatus || '';
        const isActive = employeeStatus && String(employeeStatus).toUpperCase() === 'ACTIVE';
        
        // Only process Active employees
        if (isActive) {
          employeesProcessed++;
          
          // Agreement ID Normalization: Use SAME normalization as Stage 1
          // Primary join key: emplyee_allocated_agreement_id
          const agreementIdRaw = employee.emplyee_allocated_agreement_id || null;
          const agreementId = agreementIdRaw ? String(agreementIdRaw).trim() : null;
          
          // Access department and designation
          const department = employee.employee_department || employee.employeeDepartment || '';
          const designation = employee.employee_designation || employee.employeeDesignation || '';

          // Retrieve the per-employee share using the SAME normalized key
          const perEmployeeShare = agreementId ? (agreementPerEmployeeShares[agreementId] || 0) : 0;
          
          if (!agreementId || !perEmployeeShare) {
            joinFailures++;
          }

          if (perEmployeeShare > 0) {
            employeesWithShare++;
            
            // Aggregate by department
            if (department && String(department).trim()) {
              const deptKey = String(department).trim();
              departmentRentMap[deptKey] = (departmentRentMap[deptKey] || 0) + perEmployeeShare;
            }

            // Aggregate by designation
            if (designation && String(designation).trim()) {
              const desigKey = String(designation).trim();
              designationRentMap[desigKey] = (designationRentMap[desigKey] || 0) + perEmployeeShare;
            }
          }
        }
      });
      
      console.log('Employees Processed:', employeesProcessed);
      console.log('Employees with Share > 0:', employeesWithShare);
      console.log('Join Failures (no matching agreement or share):', joinFailures);
      console.log('Department Rent Map:', departmentRentMap);
      console.log('Designation Rent Map:', designationRentMap);

      // STAGE 3: Final Output State - Convert to sorted arrays
      const rentByDepartment = Object.entries(departmentRentMap)
        .map(([label, amount]) => ({
          label: String(label),
          amount: Number(amount) || 0,
        }))
        .filter(item => item.amount > 0)
        .sort((a, b) => b.amount - a.amount);

      const rentByDesignation = Object.entries(designationRentMap)
        .map(([label, amount]) => ({
          label: String(label),
          amount: Number(amount) || 0,
        }))
        .filter(item => item.amount > 0)
        .sort((a, b) => b.amount - a.amount);
      
      // Debug 3: Log the final rentByDepartment array to confirm it is populated
      console.log('DEBUG 3 - Final rentByDepartment Array (Before State):', rentByDepartment);
      console.log('Final rentByDesignation Array:', rentByDesignation);
      console.log('rentByDepartment Length:', rentByDepartment.length);
      console.log('rentByDesignation Length:', rentByDesignation.length);
      console.log('=== END PRO-RATA CALCULATION DEBUG ===');

      // Store in processedCosts state
      setProcessedCosts({
        rentByDepartment,
        rentByDesignation,
      });

      // Legacy state for backward compatibility (using old format)
      const departmentRentArray = rentByDepartment.map(item => ({
        department: item.label,
        totalRent: item.amount,
      }));

      const designationRentArray = rentByDesignation.map(item => ({
        designation: item.label,
        totalRent: item.amount,
      }));

      setDepartmentRentAggregated(departmentRentArray);
      setDesignationRentAggregated(designationRentArray);

      // Calculate statistics
      const activeResidences = residences.filter(r => 
        r.residence_status === 'Active' || r.residence_status === 'active'
      );
      
      const activeAgreements = agreements.filter(a => 
        a.agreement_status === 'Active' || a.agreement_status === 'active'
      );

      const totalProperties = activeResidences.length;

      const upcomingRenewals = renewalAlertsRes.data.length;

      const totalMonthlyRent = activeAgreements.reduce((sum, a) => {
        const rent = parseFloat(a.agreement_monthly_rent_amount);
        return sum + (isNaN(rent) ? 0 : rent);
      }, 0);

      const totalAdvanceLocked = activeAgreements.reduce((sum, a) => {
        const advance = parseFloat(a.agreement_advance_amount);
        return sum + (isNaN(advance) ? 0 : advance);
      }, 0);

      setStats({
        totalProperties,
        upcomingRenewals,
        totalMonthlyRent,
        totalAdvanceLocked,
      });

      // Set employee status counts - use activeCount and inactiveCount
      const statusData = employeeStatusRes.data || {};
      const activeCount = parseInt(statusData.activeCount) || 0;
      const inactiveCount = parseInt(statusData.inactiveCount) || 0;
      
      console.log('Employee Status API Response:', statusData);
      console.log('Parsed Active Count:', activeCount);
      console.log('Parsed Inactive Count:', inactiveCount);
      
      setEmployeeStatus({
        active: activeCount,
        inactive: inactiveCount,
      });

      // Employee by Department - Use data from API
      const breakdownData = employeeBreakdownRes.data || {};
      const departmentData = Array.isArray(breakdownData.byDepartment) 
        ? breakdownData.byDepartment 
        : [];
      
      console.log('Employee Breakdown API Response:', breakdownData);
      console.log('Department Data Array:', departmentData);
      console.log('Department Data Length:', departmentData.length);
      
      // Validate each item has category and value
      const validDepartmentData = departmentData.filter(item => {
        const isValid = item && 
                       typeof item === 'object' && 
                       item.category !== undefined && 
                       item.value !== undefined &&
                       parseInt(item.value) > 0;
        if (!isValid && item) {
          console.warn('Invalid department item:', item);
        }
        return isValid;
      });
      
      console.log('Valid Department Data:', validDepartmentData);
      setEmployeeByDept(validDepartmentData);

      // Set financial summary
      setFinancialSummary(financialSummaryRes.data);

      // Process monthly spend data (last 12 months)
      const today = dayjs();
      const monthlyData = Array.isArray(monthlySpendRes.data) ? monthlySpendRes.data : [];
      const last12MonthsData = monthlyData
        .map((item) => {
          const amount = parseFloat(item.amount) || 0;
          return {
            ...item,
            amount: isNaN(amount) ? 0 : amount,
          };
        })
        .filter((item) => {
          if (!item.period || item.amount <= 0) return false;
          const [year, month] = item.period.split('-');
          if (!year || !month) return false;
          const itemDate = dayjs(`${year}-${month}-01`);
          if (!itemDate.isValid()) return false;
          const monthsAgo = today.diff(itemDate, 'month');
          return monthsAgo >= 0 && monthsAgo < 12;
        })
        .sort((a, b) => a.period.localeCompare(b.period))
        .slice(-12);
      setMonthlySpend(last12MonthsData);

      // Set department rent cost data
      const deptRentData = Array.isArray(departmentRentCostRes.data) 
        ? departmentRentCostRes.data 
        : [];
      console.log('Department Rent Cost Data:', deptRentData);
      setDepartmentRentCost(deptRentData);

      // Set recommendations
      setRecommendations(recommendationsRes.data.recommendations || []);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Employee by Department Chart - Full Width Bar Chart
  // Debug: Log data structure
  console.log('Employee by Department Chart Data (Raw):', employeeByDept);
  console.log('Employee by Department Chart Data (Type):', typeof employeeByDept, Array.isArray(employeeByDept));
  
  // Transform data from API format { category, value } to chart format
  // Ensure we handle the data structure correctly
  let chartData = [];
  
  if (Array.isArray(employeeByDept) && employeeByDept.length > 0) {
    chartData = employeeByDept
      .filter(item => {
        // Validate item structure
        if (!item || typeof item !== 'object') return false;
        const hasCategory = item.category !== undefined && item.category !== null;
        const hasValue = item.value !== undefined && item.value !== null;
        const validValue = typeof item.value === 'number' && item.value > 0;
        return hasCategory && hasValue && validValue;
      })
      .map(item => ({
        category: String(item.category || 'Unassigned').trim(),
        value: parseInt(item.value) || 0,
      }))
      .filter(item => item.value > 0); // Final filter for positive values
  }
  
  console.log('Employee by Department Chart Data (Processed):', chartData);
  console.log('Chart Data Length:', chartData.length);

  // Department Rent Cost Chart Configuration (New - Replaces Monthly Rent Spend position)
  const departmentRentCostConfig = {
    data: Array.isArray(departmentRentCost) && departmentRentCost.length > 0
      ? departmentRentCost.filter(item => item && item.totalRent > 0)
      : [],
    xField: 'department',
    yField: 'totalRent',
    color: '#E87103',
    theme: {
      background: '#F0F2F5', // Light grey background for readability
    },
    label: {
      position: 'top',
      offset: 5,
      style: {
        fill: '#262626', // Dark text on light background
        fontSize: 14,
        fontWeight: 'bold',
      },
      formatter: (datum) => {
        const rent = parseFloat(datum.totalRent) || 0;
        if (rent > 0) {
          if (rent >= 1000000) {
            return `₹${(rent / 1000000).toFixed(2)}M`;
          } else if (rent >= 1000) {
            return `₹${(rent / 1000).toFixed(1)}k`;
          }
          return `₹${rent.toLocaleString()}`;
        }
        return '';
      },
    },
    xAxis: {
      title: {
        text: 'Department',
        style: {
          fill: '#262626', // Dark text on light background
          fontSize: 14,
          fontWeight: 600,
        },
      },
      label: {
        autoRotate: true,
        style: {
          fill: '#262626', // Dark text on light background
          fontSize: 13,
          fontWeight: 500,
        },
      },
      line: {
        style: {
          stroke: '#D9D9D9', // Light grey axis line
          lineWidth: 1,
        },
      },
      tickLine: {
        style: {
          stroke: '#D9D9D9',
        },
      },
    },
    yAxis: {
      title: {
        text: 'Monthly Rent Cost (₹)',
        style: {
          fill: '#262626', // Dark text on light background
          fontSize: 14,
          fontWeight: 600,
        },
      },
      label: {
        style: {
          fill: '#262626', // Dark text on light background
          fontSize: 13,
          fontWeight: 500,
        },
        formatter: (value) => {
          if (value >= 1000000) {
            return `₹${(value / 1000000).toFixed(1)}M`;
          } else if (value >= 1000) {
            return `₹${(value / 1000).toFixed(0)}k`;
          }
          return `₹${value}`;
        },
      },
      grid: {
        line: {
          style: {
            stroke: '#E8E8E8', // Light grey grid lines
            lineWidth: 1,
          },
        },
      },
      line: {
        style: {
          stroke: '#D9D9D9', // Light grey axis line
          lineWidth: 1,
        },
      },
      tickLine: {
        style: {
          stroke: '#D9D9D9',
        },
      },
    },
    tooltip: {
      domStyles: {
        'g2-tooltip': {
          color: '#262626',
          backgroundColor: '#FFFFFF',
          border: '1px solid #D9D9D9',
        },
        'g2-tooltip-title': {
          color: '#262626',
          fontSize: '14px',
          fontWeight: 'bold',
        },
        'g2-tooltip-list-item': {
          color: '#262626',
          fontSize: '13px',
        },
      },
    },
    meta: {
      department: { alias: 'Department' },
      totalRent: { alias: 'Monthly Rent Cost (₹)' },
    },
  };

  // Monthly Rent Spend Chart Configuration (Moved below, full width)
  const monthlySpendConfig = {
    data: Array.isArray(monthlySpend) && monthlySpend.length > 0
      ? monthlySpend.filter(item => item && item.amount > 0)
      : [],
    xField: 'period',
    yField: 'amount',
    color: '#E87103',
    theme: {
      background: '#F0F2F5', // Light grey background for readability
    },
    label: {
      position: 'top',
      offset: 5,
      style: {
        fill: '#262626', // Dark text on light background
        fontSize: 14,
        fontWeight: 'bold',
      },
      formatter: (datum) => {
        const amount = parseFloat(datum.amount) || 0;
        if (amount > 0) {
          if (amount >= 1000000) {
            return `₹${(amount / 1000000).toFixed(2)}M`;
          } else if (amount >= 1000) {
            return `₹${(amount / 1000).toFixed(1)}k`;
          }
          return `₹${amount.toLocaleString()}`;
        }
        return '';
      },
    },
    xAxis: {
      title: {
        text: 'Period',
        style: {
          fill: '#262626', // Dark text on light background
          fontSize: 14,
          fontWeight: 600,
        },
      },
      label: {
        autoRotate: false,
        style: {
          fill: '#262626', // Dark text on light background
          fontSize: 13,
          fontWeight: 500,
        },
      },
      line: {
        style: {
          stroke: '#D9D9D9', // Light grey axis line
          lineWidth: 1,
        },
      },
      tickLine: {
        style: {
          stroke: '#D9D9D9',
        },
      },
    },
    yAxis: {
      title: {
        text: 'Amount (₹)',
        style: {
          fill: '#262626', // Dark text on light background
          fontSize: 14,
          fontWeight: 600,
        },
      },
      label: {
        style: {
          fill: '#262626', // Dark text on light background
          fontSize: 13,
          fontWeight: 500,
        },
        formatter: (value) => {
          if (value >= 1000000) {
            return `₹${(value / 1000000).toFixed(1)}M`;
          } else if (value >= 1000) {
            return `₹${(value / 1000).toFixed(0)}k`;
          }
          return `₹${value}`;
        },
      },
      grid: {
        line: {
          style: {
            stroke: '#E8E8E8', // Light grey grid lines
            lineWidth: 1,
          },
        },
      },
      line: {
        style: {
          stroke: '#D9D9D9', // Light grey axis line
          lineWidth: 1,
        },
      },
      tickLine: {
        style: {
          stroke: '#D9D9D9',
        },
      },
    },
    tooltip: {
      domStyles: {
        'g2-tooltip': {
          color: '#262626',
          backgroundColor: '#FFFFFF',
          border: '1px solid #D9D9D9',
        },
        'g2-tooltip-title': {
          color: '#262626',
          fontSize: '14px',
          fontWeight: 'bold',
        },
        'g2-tooltip-list-item': {
          color: '#262626',
          fontSize: '13px',
        },
      },
    },
    meta: {
      period: { alias: 'Period' },
      amount: { alias: 'Amount (₹)' },
    },
  };
  
  const employeeChartConfig = {
    data: chartData,
    xField: 'category',
    yField: 'value',
    color: '#E87103',
    theme: {
      background: '#F0F2F5', // Light grey background for readability
    },
    label: {
      position: 'top',
      offset: 5,
      style: {
        fill: '#262626', // Dark text on light background
        fontSize: 14,
        fontWeight: 'bold',
      },
      formatter: (datum) => {
        const value = parseInt(datum.value) || 0;
        return value > 0 ? `${value}` : '';
      },
    },
    xAxis: {
      title: {
        text: 'Department',
        style: {
          fill: '#262626', // Dark text on light background
          fontSize: 14,
          fontWeight: 600,
        },
      },
      label: {
        style: {
          fill: '#262626', // Dark text on light background
          fontSize: 13,
          fontWeight: 500,
        },
        autoRotate: true, // Rotate labels if needed
        autoHide: false, // Always show labels
      },
      line: {
        style: {
          stroke: '#D9D9D9', // Light grey axis line
          lineWidth: 1,
        },
      },
      tickLine: {
        style: {
          stroke: '#D9D9D9',
        },
      },
    },
    yAxis: {
      title: {
        text: 'Employee Count',
        style: {
          fill: '#262626', // Dark text on light background
          fontSize: 14,
          fontWeight: 600,
        },
      },
      label: {
        style: {
          fill: '#262626', // Dark text on light background
          fontSize: 13,
          fontWeight: 500,
        },
      },
      grid: {
        line: {
          style: {
            stroke: '#E8E8E8', // Light grey grid lines
            lineWidth: 1,
          },
        },
      },
      line: {
        style: {
          stroke: '#D9D9D9', // Light grey axis line
          lineWidth: 1,
        },
      },
      tickLine: {
        style: {
          stroke: '#D9D9D9',
        },
      },
    },
    tooltip: {
      domStyles: {
        'g2-tooltip': {
          color: '#262626',
          backgroundColor: '#FFFFFF',
          border: '1px solid #D9D9D9',
        },
        'g2-tooltip-title': {
          color: '#262626',
          fontSize: '14px',
          fontWeight: 'bold',
        },
        'g2-tooltip-list-item': {
          color: '#262626',
          fontSize: '13px',
        },
      },
    },
    meta: {
      category: { alias: 'Department' },
      value: { alias: 'Employee Count' },
    },
  };

  // Chart 1: Accurate Monthly Rent Cost by Department (Vertical Bar Chart)
  // Using processedCosts.rentByDepartment for accurate pro-rata calculation
  const departmentRentAggregatedConfig = {
    data: Array.isArray(processedCosts.rentByDepartment) && processedCosts.rentByDepartment.length > 0
      ? processedCosts.rentByDepartment.filter(item => item && item.amount > 0)
      : [],
    xField: 'label',
    yField: 'amount',
    color: '#E87103',
    theme: {
      background: '#F0F2F5',
    },
    label: {
      position: 'top',
      offset: 5,
      style: {
        fill: '#262626',
        fontSize: 14,
        fontWeight: 'bold',
      },
      formatter: (datum) => {
        const rent = parseFloat(datum.amount) || 0;
        if (rent > 0) {
          if (rent >= 1000000) {
            return `₹${(rent / 1000000).toFixed(2)}M`;
          } else if (rent >= 1000) {
            return `₹${(rent / 1000).toFixed(1)}k`;
          }
          return `₹${rent.toLocaleString()}`;
        }
        return '';
      },
    },
    xAxis: {
      title: {
        text: 'Department',
        style: {
          fill: '#262626',
          fontSize: 14,
          fontWeight: 600,
        },
      },
      label: {
        autoRotate: true,
        style: {
          fill: '#262626',
          fontSize: 13,
          fontWeight: 500,
        },
      },
      line: {
        style: {
          stroke: '#D9D9D9',
          lineWidth: 1,
        },
      },
      tickLine: {
        style: {
          stroke: '#D9D9D9',
        },
      },
    },
    yAxis: {
      title: {
        text: 'Monthly Rent Cost (₹)',
        style: {
          fill: '#262626',
          fontSize: 14,
          fontWeight: 600,
        },
      },
      label: {
        style: {
          fill: '#262626',
          fontSize: 13,
          fontWeight: 500,
        },
        formatter: (value) => {
          if (value >= 1000000) {
            return `₹${(value / 1000000).toFixed(1)}M`;
          } else if (value >= 1000) {
            return `₹${(value / 1000).toFixed(0)}k`;
          }
          return `₹${value}`;
        },
      },
      grid: {
        line: {
          style: {
            stroke: '#E8E8E8',
            lineWidth: 1,
          },
        },
      },
      line: {
        style: {
          stroke: '#D9D9D9',
          lineWidth: 1,
        },
      },
      tickLine: {
        style: {
          stroke: '#D9D9D9',
        },
      },
    },
    tooltip: {
      domStyles: {
        'g2-tooltip': {
          color: '#262626',
          backgroundColor: '#FFFFFF',
          border: '1px solid #D9D9D9',
        },
        'g2-tooltip-title': {
          color: '#262626',
          fontSize: '14px',
          fontWeight: 'bold',
        },
        'g2-tooltip-list-item': {
          color: '#262626',
          fontSize: '13px',
        },
      },
    },
    meta: {
      label: { alias: 'Department' },
      amount: { alias: 'Monthly Rent Cost (₹)' },
    },
  };

  // Chart 2: Monthly Rent Cost by Employee Designation (Vertical Bar Chart)
  // Using processedCosts.rentByDesignation for accurate pro-rata calculation
  const designationRentAggregatedConfig = {
    data: Array.isArray(processedCosts.rentByDesignation) && processedCosts.rentByDesignation.length > 0
      ? processedCosts.rentByDesignation.filter(item => item && item.amount > 0)
      : [],
    xField: 'label',
    yField: 'amount',
    color: '#E87103',
    theme: {
      background: '#F0F2F5',
    },
    label: {
      position: 'top',
      offset: 5,
      style: {
        fill: '#262626',
        fontSize: 14,
        fontWeight: 'bold',
      },
      formatter: (datum) => {
        const rent = parseFloat(datum.amount) || 0;
        if (rent > 0) {
          if (rent >= 1000000) {
            return `₹${(rent / 1000000).toFixed(2)}M`;
          } else if (rent >= 1000) {
            return `₹${(rent / 1000).toFixed(1)}k`;
          }
          return `₹${rent.toLocaleString()}`;
        }
        return '';
      },
    },
    xAxis: {
      title: {
        text: 'Employee Designation',
        style: {
          fill: '#262626',
          fontSize: 14,
          fontWeight: 600,
        },
      },
      label: {
        autoRotate: true,
        style: {
          fill: '#262626',
          fontSize: 13,
          fontWeight: 500,
        },
      },
      line: {
        style: {
          stroke: '#D9D9D9',
          lineWidth: 1,
        },
      },
      tickLine: {
        style: {
          stroke: '#D9D9D9',
        },
      },
    },
    yAxis: {
      title: {
        text: 'Monthly Rent Cost (₹)',
        style: {
          fill: '#262626',
          fontSize: 14,
          fontWeight: 600,
        },
      },
      label: {
        style: {
          fill: '#262626',
          fontSize: 13,
          fontWeight: 500,
        },
        formatter: (value) => {
          if (value >= 1000000) {
            return `₹${(value / 1000000).toFixed(1)}M`;
          } else if (value >= 1000) {
            return `₹${(value / 1000).toFixed(0)}k`;
          }
          return `₹${value}`;
        },
      },
      grid: {
        line: {
          style: {
            stroke: '#E8E8E8',
            lineWidth: 1,
          },
        },
      },
      line: {
        style: {
          stroke: '#D9D9D9',
          lineWidth: 1,
        },
      },
      tickLine: {
        style: {
          stroke: '#D9D9D9',
        },
      },
    },
    tooltip: {
      domStyles: {
        'g2-tooltip': {
          color: '#262626',
          backgroundColor: '#FFFFFF',
          border: '1px solid #D9D9D9',
        },
        'g2-tooltip-title': {
          color: '#262626',
          fontSize: '14px',
          fontWeight: 'bold',
        },
        'g2-tooltip-list-item': {
          color: '#262626',
          fontSize: '13px',
        },
      },
    },
    meta: {
      label: { alias: 'Employee Designation' },
      amount: { alias: 'Monthly Rent Cost (₹)' },
    },
  };

  return (
    <div>
      <Spin spinning={loading}>
        {/* Application Feature Summary */}
        <Card style={{ marginBottom: '24px', background: 'linear-gradient(135deg, #E87103 0%, #FF8C00 100%)' }}>
          <Title level={3} style={{ color: '#FFFFFF', marginBottom: '16px' }}>
            Soliflex Quarters Manager
          </Title>
          <Space size="middle" wrap>
            <Tag color="default" style={{ fontSize: '14px', padding: '4px 12px', background: 'rgba(255,255,255,0.2)', color: '#FFFFFF', border: 'none' }}>
              Track Quarters Occupancy
            </Tag>
            <Tag color="default" style={{ fontSize: '14px', padding: '4px 12px', background: 'rgba(255,255,255,0.2)', color: '#FFFFFF', border: 'none' }}>
              Monitor Agreement Renewals
            </Tag>
            <Tag color="default" style={{ fontSize: '14px', padding: '4px 12px', background: 'rgba(255,255,255,0.2)', color: '#FFFFFF', border: 'none' }}>
              Manage Rental Expenses
            </Tag>
          </Space>
        </Card>

        {/* Key Performance Indicators - Top Row */}
        <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
          <Col xs={24} sm={12} md={8} lg={6} xl={4}>
            <Card style={{ height: '100%', minHeight: '140px' }}>
              <Statistic
                title="Total Properties Managed"
                value={stats.totalProperties}
                prefix={<HomeOutlined />}
                valueStyle={{ color: '#262626', fontSize: '28px', fontWeight: 'bold' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6} xl={4}>
            <Card style={{ height: '100%', minHeight: '140px' }}>
              <Statistic
                title="Employee Status"
                value={employeeStatus.active || 0}
                prefix={<UserOutlined />}
                valueStyle={{ color: '#262626', fontSize: '28px', fontWeight: 'bold' }}
              />
              <Paragraph style={{ marginTop: '8px', marginBottom: 0, fontSize: '12px', color: '#595959' }}>
                Active Employees: {employeeStatus.active || 0}
              </Paragraph>
              <Paragraph style={{ marginTop: '4px', marginBottom: 0, fontSize: '12px', color: '#595959' }}>
                Inactive Employees: {employeeStatus.inactive || 0}
              </Paragraph>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6} xl={4}>
            <Card 
              style={{ 
                height: '100%',
                minHeight: '140px',
                border: '2px solid #E87103',
                background: 'linear-gradient(135deg, #FFF7E6 0%, #FFE7BA 100%)'
              }}
            >
              <Statistic
                title="Upcoming Renewals Alert"
                value={stats.upcomingRenewals}
                prefix={<AlertOutlined />}
                valueStyle={{ color: '#E87103', fontSize: '28px', fontWeight: 'bold' }}
              />
              <Paragraph style={{ marginTop: '8px', marginBottom: 0, fontSize: '12px', color: '#595959' }}>
                Within next 90 days
              </Paragraph>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6} xl={4}>
            <Card style={{ height: '100%', minHeight: '140px' }}>
              <Statistic
                title="Total Monthly Rent"
                value={stats.totalMonthlyRent}
                prefix={<DollarOutlined />}
                precision={2}
                formatter={(value) => `₹${value.toLocaleString()}`}
                valueStyle={{ color: '#262626', fontSize: '24px', fontWeight: 'bold' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6} xl={4}>
            <Card style={{ height: '100%', minHeight: '140px' }}>
              <Statistic
                title="Total Advance Locked"
                value={stats.totalAdvanceLocked}
                prefix={<WalletOutlined />}
                precision={2}
                formatter={(value) => `₹${value.toLocaleString()}`}
                valueStyle={{ color: '#262626', fontSize: '24px', fontWeight: 'bold' }}
              />
            </Card>
          </Col>
        </Row>

        {/* Financial Summary Cards - Second Row */}
        {financialSummary && (
          <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
            <Col xs={24} sm={12} md={8} lg={8}>
              <Card>
                <Statistic
                  title="Total Monthly Spend"
                  value={financialSummary.totalCurrentMonthlySpend || 0}
                  prefix={<DollarOutlined />}
                  precision={2}
                  formatter={(value) => `₹${value.toLocaleString()}`}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={8} lg={8}>
              <Card>
                <Statistic
                  title="Total Advance Spent"
                  value={financialSummary.totalCurrentAdvanceSpent || 0}
                  prefix={<WalletOutlined />}
                  precision={2}
                  formatter={(value) => `₹${value.toLocaleString()}`}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={8} lg={8}>
              <Card>
                <Statistic
                  title="Active Agreements"
                  value={financialSummary.activeAgreementsCount || 0}
                  prefix={<HistoryOutlined />}
                />
              </Card>
            </Col>
          </Row>
        )}

        {/* Cost Optimization Recommendations */}
        {recommendations.length > 0 && (
          <Card
            title="Cost Optimization Recommendations"
            style={{ marginBottom: '24px' }}
          >
            {recommendations.map((rec, index) => (
              <Alert
                key={index}
                message={rec.message}
                type={
                  rec.priority === 'high'
                    ? 'error'
                    : rec.priority === 'medium'
                    ? 'warning'
                    : 'info'
                }
                showIcon
                style={{ marginBottom: '12px' }}
              />
            ))}
          </Card>
        )}

        {/* Charts Section - Full Width Stacked */}
        {/* Chart 1: Monthly Rent Spend (Last 12 Months) */}
        <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
          <Col span={24}>
            <Card title="Monthly Rent Spend (Last 12 Months)">
              {monthlySpend.length > 0 ? (
                <div style={{ background: '#F0F2F5', padding: '16px', borderRadius: '8px' }}>
                  <Column {...monthlySpendConfig} height={400} />
                </div>
              ) : (
                <div style={{ padding: '40px', textAlign: 'center', color: '#8c8c8c' }}>
                  No monthly spend data available
                </div>
              )}
            </Card>
          </Col>
        </Row>

        {/* Chart 2: Employee Breakdown by Department (Employee Count) */}
        <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
          <Col span={24}>
            <Card title="Employee Breakdown by Department">
              {chartData.length > 0 ? (
                <div style={{ background: '#F0F2F5', padding: '16px', borderRadius: '8px' }}>
                  <Column {...employeeChartConfig} height={400} />
                </div>
              ) : (
                <div style={{ padding: '40px', textAlign: 'center', color: '#8c8c8c', fontSize: '14px' }}>
                  No Employee Department data available for analysis.
                </div>
              )}
            </Card>
          </Col>
        </Row>

        {/* Chart 3: Monthly Rent Cost by Department */}
        <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
          <Col span={24}>
            <Card title="Monthly Rent Cost by Department">
              {processedCosts.rentByDepartment.length > 0 ? (
                <div style={{ background: '#F0F2F5', padding: '16px', borderRadius: '8px' }}>
                  <Column {...departmentRentAggregatedConfig} height={400} />
                </div>
              ) : (
                <div style={{ padding: '40px', textAlign: 'center', color: '#8c8c8c' }}>
                  No department rent cost data available
                </div>
              )}
            </Card>
          </Col>
        </Row>

        {/* Chart 4: Monthly Rent Cost by Employee Designation */}
        <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
          <Col span={24}>
            <Card title="Monthly Rent Cost by Employee Designation">
              {processedCosts.rentByDesignation.length > 0 ? (
                <div style={{ background: '#F0F2F5', padding: '16px', borderRadius: '8px' }}>
                  <Column {...designationRentAggregatedConfig} height={400} />
                </div>
              ) : (
                <div style={{ padding: '40px', textAlign: 'center', color: '#8c8c8c' }}>
                  No designation rent cost data available
                </div>
              )}
            </Card>
          </Col>
        </Row>

      </Spin>
    </div>
  );
};

export default DashboardHome;

