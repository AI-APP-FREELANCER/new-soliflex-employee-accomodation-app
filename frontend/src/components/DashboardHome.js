import React, { useState, useEffect, useRef } from 'react';
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
  Radio,
  DatePicker,
  Button,
  Dropdown,
  message,
  Table,
} from 'antd';
import {
  HomeOutlined,
  UserOutlined,
  AlertOutlined,
  DollarOutlined,
  WalletOutlined,
  HistoryOutlined,
  DownloadOutlined,
  FilePdfOutlined,
  FileExcelOutlined,
} from '@ant-design/icons';
import { Column } from '@ant-design/charts';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
dayjs.extend(utc);
dayjs.extend(timezone);
// Set default timezone to IST (Asia/Kolkata)
dayjs.tz.setDefault('Asia/Kolkata');
import { analyticsAPI, residenceAPI, agreementAPI, employeeAPI } from '../services/api';
import { exportChartsToPDF, exportMultipleSheetsToExcel } from '../utils/exportUtils';
import { formatDateForDisplay, parseDateFromAPI } from '../utils/dateUtils';
import { useResponsive } from '../utils/useResponsive';

const { Title, Paragraph } = Typography;
const { RangePicker } = DatePicker;

const DashboardHome = ({ onNavigateToAgreements }) => {
  const responsive = useResponsive();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    totalProperties: 0,
    upcomingRenewals: 0,
    totalMonthlyRent: 0,
    totalAdvanceLocked: 0,
  });
  const [renewalBuckets, setRenewalBuckets] = useState({
    dueIn90: 0,
    pastDue: 0,
  });
  const [employeeByDept, setEmployeeByDept] = useState([]);
  const [employeeStatus, setEmployeeStatus] = useState({ active: 0, inactive: 0 });
  const [financialSummary, setFinancialSummary] = useState(null);
  const [monthlySpend, setMonthlySpend] = useState([]);

  // Validation helper function for testing scenarios (Scenario B: Financial Accuracy)
  const validateFinancialCalculations = (agreements, activeAgreements) => {
    const validation = {
      totalAgreements: agreements.length,
      activeAgreements: activeAgreements.length,
      agreementsWithRent: 0,
      totalMonthlyRent: 0,
      totalAdvanceLocked: 0,
      sampleAgreements: [],
    };

    activeAgreements.forEach((agreement, index) => {
      const rentValue = agreement.agreement_monthly_rent_amount;
      const advanceValue = agreement.agreement_advance_amount;
      
      if (rentValue || rentValue === 0) {
        const rent = typeof rentValue === 'string' 
          ? parseFloat(rentValue.replace(/[^\d.-]/g, '')) 
          : Number(rentValue);
        if (!isNaN(rent) && rent > 0) {
          validation.agreementsWithRent++;
          validation.totalMonthlyRent += rent;
        }
      }

      if (advanceValue || advanceValue === 0) {
        const advance = typeof advanceValue === 'string' 
          ? parseFloat(advanceValue.replace(/[^\d.-]/g, '')) 
          : Number(advanceValue);
        if (!isNaN(advance) && advance > 0) {
          validation.totalAdvanceLocked += advance;
        }
      }

      // Store first 3 agreements for sample
      if (index < 3) {
        validation.sampleAgreements.push({
          id: agreement.agreement_id,
          rentRaw: rentValue,
          rentType: typeof rentValue,
          advanceRaw: advanceValue,
          advanceType: typeof advanceValue,
        });
      }
    });

    console.log('📊 Financial Validation Report (Scenario B):', validation);
    return validation;
  };
  const [departmentRentCost, setDepartmentRentCost] = useState([]);
  const [closedRoomsData, setClosedRoomsData] = useState([]);
  const [departmentRentAggregated, setDepartmentRentAggregated] = useState([]);
  const [designationRentAggregated, setDesignationRentAggregated] = useState([]);
  const [processedCosts, setProcessedCosts] = useState({
    rentByDepartment: [],
    rentByDesignation: [],
  });
  const [timelineFilter, setTimelineFilter] = useState(null); // null = "All Time", or { startDate, endDate }
  const [timelineFilterType, setTimelineFilterType] = useState('all'); // 'all', '30days', '90days', 'quarter', 'custom'
  const [customDateRange, setCustomDateRange] = useState(null);
  const [agreementsNeedingReview, setAgreementsNeedingReview] = useState(0);
  const [advanceTransactions, setAdvanceTransactions] = useState([]); // For tracking vacate transactions
  const [rentChangeAnalysis, setRentChangeAnalysis] = useState({
    quarterly: [],
    halfYearly: [],
    yearly: [],
  });
  const [advanceReturnMetrics, setAdvanceReturnMetrics] = useState({
    totalDueBack: 0,
    totalNetReceived: 0,
    pending: 0,
  });

  // Refs for export
  const dashboardRef = useRef(null);
  const monthlySpendChartRef = useRef(null);
  const employeeChartRef = useRef(null);
  const deptRentChartRef = useRef(null);
  const designationRentChartRef = useRef(null);

  useEffect(() => {
    fetchDashboardData();
  }, [timelineFilter]);

  // Filter agreements by timeline
  const filterAgreementsByTimeline = (agreements) => {
    if (!timelineFilter) {
      return agreements; // All Time
    }

    const { startDate, endDate } = timelineFilter;
    if (!startDate || !endDate) {
      return agreements;
    }

    return agreements.filter(agreement => {
      const possessionDate = agreement.agreement_possesion_date;
      const renewalDueDate = agreement.agreement_renewal_due_date;
      
      // Calculate end date if not present (possession date + 11 months)
      let endDateCalculated = null;
      if (possessionDate) {
        endDateCalculated = dayjs(possessionDate).add(11, 'month').format('YYYY-MM-DD');
      }

      // Check if any of the agreement dates fall within the timeline
      const datesToCheck = [possessionDate, renewalDueDate, endDateCalculated].filter(Boolean);
      
      return datesToCheck.some(date => {
        const dateObj = dayjs(date);
        return dateObj.isAfter(startDate.subtract(1, 'day')) && dateObj.isBefore(endDate.add(1, 'day'));
      });
    });
  };

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
      ] = await Promise.all([
        residenceAPI.getAll('all'), // Get all residences for joining with closed agreements
        agreementAPI.getAll('all'), // Get all agreements including inactive for financial accuracy
        employeeAPI.getAll('all'), // Get all employees for accurate counts
        analyticsAPI.getRenewalAlerts(90),
        analyticsAPI.getEmployeeBreakdown(),
        analyticsAPI.getEmployeeStatus(),
        analyticsAPI.getFinancialSummary(),
        analyticsAPI.getSpendOverTime('monthly'),
        analyticsAPI.getDepartmentRentCost(),
      ]);

      // Validate API responses with robust parsing for nested data structures
      const residences = Array.isArray(residencesRes?.data) 
        ? residencesRes.data 
        : (Array.isArray(residencesRes?.data?.data) ? residencesRes.data.data : []);
      let agreements = Array.isArray(agreementsRes?.data) 
        ? agreementsRes.data 
        : (Array.isArray(agreementsRes?.data?.data) ? agreementsRes.data.data : []);
      const employees = Array.isArray(employeesRes?.data) 
        ? employeesRes.data 
        : (Array.isArray(employeesRes?.data?.data) ? employeesRes.data.data : []);
      
      console.log('📊 API Response Validation:', {
        residencesCount: residences.length,
        agreementsCount: agreements.length,
        employeesCount: employees.length,
        renewalAlertsCount: Array.isArray(renewalAlertsRes?.data) ? renewalAlertsRes.data.length : 0,
        renewalAlertsType: typeof renewalAlertsRes?.data,
        renewalAlertsIsArray: Array.isArray(renewalAlertsRes?.data),
      });

      // CRITICAL FIX: Strict numerical parsing immediately after fetch
      // Convert all financial fields to numbers before any aggregation
      agreements = agreements.map(agreement => {
        const parsed = { ...agreement };
        
        // Mandatory: Parse agreement_monthly_rent_amount
        if (parsed.agreement_monthly_rent_amount !== undefined && parsed.agreement_monthly_rent_amount !== null) {
          const rentValue = parsed.agreement_monthly_rent_amount;
          if (typeof rentValue === 'string') {
            parsed.agreement_monthly_rent_amount = parseFloat(rentValue.replace(/[^\d.-]/g, '')) || 0;
          } else {
            parsed.agreement_monthly_rent_amount = Number(rentValue) || 0;
          }
        } else {
          parsed.agreement_monthly_rent_amount = 0;
        }
        
        // Mandatory: Parse agreement_advance_amount
        if (parsed.agreement_advance_amount !== undefined && parsed.agreement_advance_amount !== null) {
          const advanceValue = parsed.agreement_advance_amount;
          if (typeof advanceValue === 'string') {
            parsed.agreement_advance_amount = parseFloat(advanceValue.replace(/[^\d.-]/g, '')) || 0;
          } else {
            parsed.agreement_advance_amount = Number(advanceValue) || 0;
          }
        } else {
          parsed.agreement_advance_amount = 0;
        }
        
        // Optional: Parse owner_maintenance_deduction (if exists)
        if (parsed.owner_maintenance_deduction !== undefined && parsed.owner_maintenance_deduction !== null) {
          const deductionValue = parsed.owner_maintenance_deduction;
          if (typeof deductionValue === 'string') {
            parsed.owner_maintenance_deduction = parseFloat(deductionValue.replace(/[^\d.-]/g, '')) || 0;
          } else {
            parsed.owner_maintenance_deduction = Number(deductionValue) || 0;
          }
        } else {
          parsed.owner_maintenance_deduction = 0;
        }
        
        // Optional: Parse amount_received_back (if exists)
        if (parsed.amount_received_back !== undefined && parsed.amount_received_back !== null) {
          const receivedValue = parsed.amount_received_back;
          if (typeof receivedValue === 'string') {
            parsed.amount_received_back = parseFloat(receivedValue.replace(/[^\d.-]/g, '')) || 0;
          } else {
            parsed.amount_received_back = Number(receivedValue) || 0;
          }
        } else {
          parsed.amount_received_back = 0;
        }
        
        return parsed;
      });

      // Debug: Verify parsing worked
      console.log('🔢 Financial Fields Parsing Verification:', {
        totalAgreements: agreements.length,
        sampleAgreement: agreements[0] ? {
          id: agreements[0].agreement_id,
          status: agreements[0].agreement_status,
          statusType: typeof agreements[0].agreement_status,
          rentRaw: agreementsRes.data[0]?.agreement_monthly_rent_amount,
          rentParsed: agreements[0].agreement_monthly_rent_amount,
          rentType: typeof agreements[0].agreement_monthly_rent_amount,
          advanceRaw: agreementsRes.data[0]?.agreement_advance_amount,
          advanceParsed: agreements[0].agreement_advance_amount,
          advanceType: typeof agreements[0].agreement_advance_amount,
        } : null,
        rentSum: agreements.reduce((sum, a) => sum + (a.agreement_monthly_rent_amount || 0), 0),
        advanceSum: agreements.reduce((sum, a) => sum + (a.agreement_advance_amount || 0), 0),
        // Check status values
        statusSample: agreements.slice(0, 5).map(a => ({
          id: a.agreement_id,
          status: a.agreement_status,
          statusType: typeof a.agreement_status,
        })),
      });

      // Get current date once for use throughout the function
      // Use IST as the reference timezone (UTC+5:30) for all date calculations
      const today = dayjs.tz(dayjs(), 'Asia/Kolkata').startOf('day');
      
      // DEBUG: Log the current date being used for comparisons
      console.log('📅 Current Date (IST) being used for renewal checks:', today.format('DD-MM-YYYY'));
      console.log('📅 Current Date (IST) ISO format:', today.format('YYYY-MM-DD'));

      // CRITICAL: Calculate financial totals BEFORE applying timeline filter
      // Financial totals should reflect ALL active agreements, not just those in the timeline
      // BACKWARD COMPATIBILITY: A record is ACTIVE if status === 'active' OR status is null/undefined
      let allActiveAgreements = agreements.filter(a => {
        // Check both new status field and legacy agreement_status
        const status = a.status || a.agreement_status;
        
        // CRITICAL: Treat null/undefined/missing status as ACTIVE (backward compatibility)
        if (!status || status === null || status === undefined) {
          return true; // Legacy records without status are considered active
        }
        
        // Convert to string, trim, and compare case-insensitively
        const statusLower = String(status).trim().toLowerCase();
        
        // Match 'active' in any case variation
        return statusLower === 'active';
      });

      // Debug: Log agreement status distribution with detailed analysis
      const statusCounts = {};
      const statusDetails = [];
      agreements.forEach(a => {
        const status = a.agreement_status || 'undefined';
        const statusStr = String(status);
        const statusLower = statusStr.toLowerCase().trim();
        statusCounts[status] = (statusCounts[status] || 0) + 1;
        
        // Store first few for detailed analysis
        if (statusDetails.length < 5) {
          statusDetails.push({
            id: a.agreement_id,
            statusRaw: a.agreement_status,
            statusType: typeof a.agreement_status,
            statusString: statusStr,
            statusLower: statusLower,
            isActiveMatch: statusLower === 'active',
            rent: a.agreement_monthly_rent_amount,
          });
        }
      });
      
      console.log('📋 Agreement Status Distribution:', statusCounts);
      console.log('📋 Status Details (First 5):', statusDetails);
      console.log('✅ Active Agreements Count (for financials):', allActiveAgreements.length);
      console.log('📊 Sample Active Agreement:', allActiveAgreements[0] ? {
        id: allActiveAgreements[0].agreement_id,
        status: allActiveAgreements[0].agreement_status,
        statusType: typeof allActiveAgreements[0].agreement_status,
        rent: allActiveAgreements[0].agreement_monthly_rent_amount,
        advance: allActiveAgreements[0].agreement_advance_amount,
      } : null);
      
      // CRITICAL DEBUG: Check why filter is returning 0
      if (allActiveAgreements.length === 0 && agreements.length > 0) {
        console.error('🚨 CRITICAL: No active agreements found! Checking filter logic...');
        const testFilter = agreements.filter(a => {
          const status = (a.agreement_status || '').toString().toLowerCase().trim();
          const matches = status === 'active';
          if (!matches && statusDetails.length < 10) {
            console.log('Non-matching agreement:', {
              id: a.agreement_id,
              statusRaw: a.agreement_status,
              statusString: status,
              rent: a.agreement_monthly_rent_amount,
            });
          }
          return matches;
        });
        console.log('Test filter result:', testFilter.length);
        
        // Try alternative status values
        const altActive1 = agreements.filter(a => {
          const status = String(a.agreement_status || '').trim();
          return status === 'Active';
        });
        const altActive2 = agreements.filter(a => {
          const status = String(a.agreement_status || '').trim();
          return status.toLowerCase() === 'active' || status === 'Active';
        });
        console.log('Alternative filters - "Active" (capital):', altActive1.length);
        console.log('Alternative filters - both cases:', altActive2.length);
        
        // FALLBACK: If no active agreements found but agreements exist with rent, use all agreements with rent > 0
        // This handles cases where status field might be missing or have different values
        const agreementsWithRent = agreements.filter(a => {
          const rent = a.agreement_monthly_rent_amount;
          return (typeof rent === 'number' && !isNaN(rent) && rent > 0) || 
                 (typeof rent === 'string' && parseFloat(rent) > 0);
        });
        
        if (agreementsWithRent.length > 0) {
          console.warn('⚠️ FALLBACK: Using agreements with rent > 0 instead of status filter');
          console.warn('⚠️ Found', agreementsWithRent.length, 'agreements with rent > 0');
          // Reassign allActiveAgreements with agreements that have rent
          allActiveAgreements = agreementsWithRent;
          console.log('✅ Using fallback: allActiveAgreements now has', allActiveAgreements.length, 'agreements');
        }
      }

      // Apply timeline filter to agreements (for charts and pro-rata calculations)
      agreements = filterAgreementsByTimeline(agreements);

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
        // BACKWARD COMPATIBILITY: Status Check - treat null/undefined as active
        const employeeStatus = employee.status || employee.employee_status || employee.employeeStatus || '';
        // CRITICAL: A record is ACTIVE if status === 'active' OR status is null/undefined
        const isActive = !employeeStatus || String(employeeStatus).toUpperCase() === 'ACTIVE' || String(employeeStatus).toLowerCase() === 'active';
        
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
        // Use robust type coercion to handle strings, numbers, and edge cases
        const monthlyRentRaw = agreement.agreement_monthly_rent_amount;
        let monthlyRent = 0;
        if (monthlyRentRaw || monthlyRentRaw === 0) {
          monthlyRent = typeof monthlyRentRaw === 'string' 
            ? parseFloat(monthlyRentRaw.replace(/[^\d.-]/g, '')) 
            : Number(monthlyRentRaw);
          monthlyRent = isNaN(monthlyRent) ? 0 : monthlyRent;
        }
        
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

      // ============================================
      // STAGE 2: Aggregation by Department and Designation
      // VERIFIED COLUMN NAMES:
      // - emplyee_allocated_agreement_id (join key from employee_master)
      // - agreement_monthly_rent_amount (rent amount from agreement_master)
      // - employee_department (aggregation key from employee_master)
      // - employee_designation (aggregation key from employee_master)
      // ============================================
      
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
          
          // VERIFIED: Using emplyee_allocated_agreement_id as join key
          
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

      // Calculate statistics with BACKWARD COMPATIBILITY
      // CRITICAL: A record is ACTIVE if status === 'active' OR status is null/undefined
      const activeResidences = residences.filter(r => {
        const status = r.status || r.residence_status;
        return !status || status === 'Active' || status === 'active';
      });
      
      // Note: activeAgreements is used for pro-rata calculations (after timeline filter)
      // Financial totals use allActiveAgreements (calculated before timeline filter)
      // BACKWARD COMPATIBILITY: Treat null/undefined status as active
      const activeAgreements = agreements.filter(a => {
        const status = a.status || a.agreement_status;
        if (!status || status === null || status === undefined) return true; // Legacy records are active
        return String(status).toLowerCase() === 'active';
      });

      const totalProperties = activeResidences.length;

      // Safely get upcoming renewals count
      const upcomingRenewals = Array.isArray(renewalAlertsRes?.data) 
        ? renewalAlertsRes.data.length 
        : 0;
      
      console.log('📈 Stats Calculation:', {
        totalProperties,
        upcomingRenewals,
        activeResidencesCount: activeResidences.length,
        totalResidences: residences.length,
        renewalAlertsData: renewalAlertsRes?.data,
      });

      // ============================================
      // CALCULATION VERIFICATION AUDIT
      // ============================================
      // A. Total Monthly Rent / Total Advance Calculation
      // Dependency: agreement_master worksheet
      // Column Names: agreement_monthly_rent_amount, agreement_advance_amount
      // Filter: agreement_status = 'active' (case-insensitive)
      // ============================================
      
      // Financial aggregation - values are already parsed as numbers at fetch time
      // IMPORTANT: Use allActiveAgreements (calculated BEFORE timeline filter) for financial totals
      const totalMonthlyRent = allActiveAgreements.reduce((sum, a) => {
        // VERIFIED: Using agreement_monthly_rent_amount from agreement_master
        // Values are already parsed as numbers, just ensure they're valid
        const rent = (typeof a.agreement_monthly_rent_amount === 'number' && !isNaN(a.agreement_monthly_rent_amount))
          ? a.agreement_monthly_rent_amount
          : 0;
        return sum + rent;
      }, 0);

      const totalAdvanceLocked = allActiveAgreements.reduce((sum, a) => {
        // VERIFIED: Using agreement_advance_amount from agreement_master
        // Values are already parsed as numbers, just ensure they're valid
        const advance = (typeof a.agreement_advance_amount === 'number' && !isNaN(a.agreement_advance_amount))
          ? a.agreement_advance_amount
          : 0;
        return sum + advance;
      }, 0);
      
      console.log('💰 Financial Totals Calculation:', {
        allActiveAgreementsCount: allActiveAgreements.length,
        totalMonthlyRent,
        totalAdvanceLocked,
        sampleRent: allActiveAgreements[0]?.agreement_monthly_rent_amount,
        sampleAdvance: allActiveAgreements[0]?.agreement_advance_amount,
      });

      // Verification logging
      console.log('✅ CALCULATION VERIFICATION - Total Monthly Rent & Advance:', {
        totalActiveAgreements: allActiveAgreements.length,
        totalMonthlyRent,
        totalAdvanceLocked,
        calculationMethod: 'Sum of agreement_monthly_rent_amount and agreement_advance_amount for all active agreements',
        columnNames: {
          rent: 'agreement_monthly_rent_amount',
          advance: 'agreement_advance_amount',
          status: 'agreement_status',
        },
        sampleCalculation: allActiveAgreements.slice(0, 3).map(a => ({
          id: a.agreement_id,
          status: a.agreement_status,
          rent: a.agreement_monthly_rent_amount,
          advance: a.agreement_advance_amount,
        })),
      });

      // Debug logging for financial calculations
      console.log('💰 Financial Aggregation Debug:', {
        allActiveAgreementsCount: allActiveAgreements.length,
        activeAgreementsAfterTimelineFilter: activeAgreements.length,
        totalMonthlyRent,
        totalAdvanceLocked,
        sampleAgreement: allActiveAgreements[0] ? {
          id: allActiveAgreements[0].agreement_id,
          rentRaw: allActiveAgreements[0].agreement_monthly_rent_amount,
          rentType: typeof allActiveAgreements[0].agreement_monthly_rent_amount,
          rentParsed: (() => {
            const rentValue = allActiveAgreements[0].agreement_monthly_rent_amount;
            if (!rentValue && rentValue !== 0) return null;
            return typeof rentValue === 'string' 
              ? parseFloat(rentValue.replace(/[^\d.-]/g, '')) 
              : Number(rentValue);
          })(),
          advanceRaw: allActiveAgreements[0].agreement_advance_amount,
          advanceType: typeof allActiveAgreements[0].agreement_advance_amount,
          advanceParsed: (() => {
            const advanceValue = allActiveAgreements[0].agreement_advance_amount;
            if (!advanceValue && advanceValue !== 0) return null;
            return typeof advanceValue === 'string' 
              ? parseFloat(advanceValue.replace(/[^\d.-]/g, '')) 
              : Number(advanceValue);
          })(),
        } : null,
      });

      // Run validation scenario B: Financial Accuracy Test
      // Use allActiveAgreements for financial validation
      validateFinancialCalculations(agreements, allActiveAgreements);

      // ============================================
      // C. Date-Based Alert Verification
      // Dependency: agreement_master worksheet
      // Column Name: agreement_renewal_due_date
      // Logic: Past Due (before today) OR Nearing Due (within 30 days)
      // ============================================
      
      // Calculate agreements needing review (Past Due + Nearing Due within 90 days)
      // Use robust date parser to handle Excel serial dates and various formats
      // VERIFIED: Using agreement_renewal_due_date field from agreement_master
      // 'today' is already declared above with IST timezone
      const ninetyDaysFromNow = today.add(90, 'day');
      
      const agreementsNeedingReviewList = agreements.filter(agreement => {
        const renewalDueDate = agreement.agreement_renewal_due_date;
        if (!renewalDueDate && renewalDueDate !== 0) return false;
        
        // Use robust date parser from dateUtils to handle Excel serial dates
        const dueDate = parseDateFromAPI(renewalDueDate);
        if (!dueDate || !dueDate.isValid()) {
          console.warn('Invalid renewal due date for agreement:', agreement.agreement_id, 'Date:', renewalDueDate);
          return false;
        }
        
        // Past Due: renewal due date has passed (before today)
        const isPastDue = dueDate.isBefore(today, 'day');
        // Nearing Due: within next 90 days (today or later, but within 90 days)
        const isNearingDue = (dueDate.isSame(today, 'day') || dueDate.isAfter(today, 'day')) 
          && dueDate.isBefore(ninetyDaysFromNow.add(1, 'day'), 'day');
        
        return isPastDue || isNearingDue;
      });

      // Debug logging for agreement review calculation
      // Scenario A: Testing the "Agreements Needing Review" Alert
      const pastDueAgreements = agreementsNeedingReviewList.filter(agreement => {
        const renewalDueDate = agreement.agreement_renewal_due_date;
        if (!renewalDueDate && renewalDueDate !== 0) return false;
        const dueDate = parseDateFromAPI(renewalDueDate);
        if (!dueDate || !dueDate.isValid()) return false;
        return dueDate.isBefore(today, 'day');
      });
      
      // Debug log first few past due agreements
      pastDueAgreements.slice(0, 3).forEach(agreement => {
        const dueDate = parseDateFromAPI(agreement.agreement_renewal_due_date);
        if (dueDate && dueDate.isValid()) {
          console.log(`🔴 Past Due Agreement: ${agreement.agreement_id}, Due Date: ${dueDate.format('DD-MM-YYYY')}, Today: ${today.format('DD-MM-YYYY')}`);
        }
      });

      const dueWithin90Agreements = agreementsNeedingReviewList.filter(agreement => {
        const renewalDueDate = agreement.agreement_renewal_due_date;
        if (!renewalDueDate && renewalDueDate !== 0) return false;
        const dueDate = parseDateFromAPI(renewalDueDate);
        if (!dueDate || !dueDate.isValid()) return false;
        return (dueDate.isSame(today, 'day') || dueDate.isAfter(today, 'day')) 
          && dueDate.isBefore(ninetyDaysFromNow.add(1, 'day'), 'day');
      });

      console.log('🔔 Agreements Needing Review Debug:', {
        totalAgreements: agreements.length,
        agreementsNeedingReview: agreementsNeedingReviewList.length,
        pastDueCount: pastDueAgreements.length,
        dueIn90Count: dueWithin90Agreements.length,
        todayIST: today.format('DD-MM-YYYY'),
        ninetyDaysFromNow: ninetyDaysFromNow.format('DD-MM-YYYY'),
        sampleAgreement: agreementsNeedingReviewList[0] ? {
          id: agreementsNeedingReviewList[0].agreement_id,
          renewalDueDateRaw: agreementsNeedingReviewList[0].agreement_renewal_due_date,
          renewalDueDateParsed: parseDateFromAPI(agreementsNeedingReviewList[0].agreement_renewal_due_date)?.format('DD-MM-YYYY'),
          isPastDue: pastDueAgreements.includes(agreementsNeedingReviewList[0]),
          isNearingDue: dueWithin90Agreements.includes(agreementsNeedingReviewList[0]),
        } : null,
        pastDueSample: pastDueAgreements.slice(0, 3).map(a => ({
          id: a.agreement_id,
          renewalDueDate: parseDateFromAPI(a.agreement_renewal_due_date)?.format('DD-MM-YYYY'),
        })),
        nearingDueSample: dueWithin90Agreements.slice(0, 3).map(a => ({
          id: a.agreement_id,
          renewalDueDate: parseDateFromAPI(a.agreement_renewal_due_date)?.format('DD-MM-YYYY'),
        })),
      });

      setAgreementsNeedingReview(agreementsNeedingReviewList.length);
      setRenewalBuckets({
        dueIn90: dueWithin90Agreements.length,
        pastDue: pastDueAgreements.length,
      });

      // Final validation and type coercion before setting state
      // Ensure all values are valid numbers, defaulting to 0 if invalid
      const validatedTotalMonthlyRent = (typeof totalMonthlyRent === 'number' && !isNaN(totalMonthlyRent)) 
        ? totalMonthlyRent 
        : 0;
      const validatedTotalAdvanceLocked = (typeof totalAdvanceLocked === 'number' && !isNaN(totalAdvanceLocked)) 
        ? totalAdvanceLocked 
        : 0;
      const validatedTotalProperties = (typeof totalProperties === 'number' && !isNaN(totalProperties)) 
        ? totalProperties 
        : 0;
      const validatedUpcomingRenewals = (typeof upcomingRenewals === 'number' && !isNaN(upcomingRenewals)) 
        ? upcomingRenewals 
        : 0;

      // Debug: Log the final values being set to state
      console.log('✅ Final Stats Values Being Set to State:', {
        totalProperties: validatedTotalProperties,
        upcomingRenewals: validatedUpcomingRenewals,
        totalMonthlyRent: validatedTotalMonthlyRent,
        totalAdvanceLocked: validatedTotalAdvanceLocked,
        rawValues: {
          totalProperties,
          upcomingRenewals,
          totalMonthlyRent,
          totalAdvanceLocked,
        },
        types: {
          totalProperties: typeof totalProperties,
          upcomingRenewals: typeof upcomingRenewals,
          totalMonthlyRent: typeof totalMonthlyRent,
          totalAdvanceLocked: typeof totalAdvanceLocked,
        },
      });

      // Set stats IMMEDIATELY after calculation to ensure they're set even if later code errors
      try {
        setStats({
          totalProperties: validatedTotalProperties,
          upcomingRenewals: validatedUpcomingRenewals,
          totalMonthlyRent: validatedTotalMonthlyRent,
          totalAdvanceLocked: validatedTotalAdvanceLocked,
        });
        console.log('✅ Stats successfully set to state');
      } catch (statsError) {
        console.error('❌ Error setting stats:', statsError);
      }

      // Calculate rent change analysis (compare Renewed agreements with their original rent)
      const renewedAgreements = agreements.filter(a => a.agreement_status === 'Renewed');
      const quarterlyChanges = [];
      const halfYearlyChanges = [];
      const yearlyChanges = [];

      // For each renewed agreement, try to find the original
      renewedAgreements.forEach(renewed => {
        const renewalDate = dayjs(renewed.agreement_possesion_date);
        if (!renewalDate.isValid()) return;

        // Find original agreement (same residence, different ID, earlier or same date)
        const original = agreements.find(a => 
          a.agreement_residence_id === renewed.agreement_residence_id &&
          a.agreement_id !== renewed.agreement_id &&
          (a.agreement_status === 'Renewed' || a.agreement_status === 'Inactive')
        );

        if (original) {
          // Robust type coercion for rent amounts
          const oldRentValue = original.agreement_monthly_rent_amount;
          const newRentValue = renewed.agreement_monthly_rent_amount;
          
          const oldRent = typeof oldRentValue === 'string' 
            ? parseFloat(oldRentValue.replace(/[^\d.-]/g, '')) 
            : Number(oldRentValue) || 0;
          const newRent = typeof newRentValue === 'string' 
            ? parseFloat(newRentValue.replace(/[^\d.-]/g, '')) 
            : Number(newRentValue) || 0;
            
          if (oldRent > 0 && !isNaN(oldRent) && !isNaN(newRent)) {
            const rentChange = newRent - oldRent;
            const rentChangePercent = ((rentChange / oldRent) * 100);

            const changeData = {
              period: renewalDate.format('YYYY-MM'),
              absoluteChange: rentChange,
              percentChange: rentChangePercent,
              oldRent,
              newRent,
            };

            const monthsAgo = today.diff(renewalDate, 'month');
            if (monthsAgo <= 3) quarterlyChanges.push(changeData);
            if (monthsAgo <= 6) halfYearlyChanges.push(changeData);
            if (monthsAgo <= 12) yearlyChanges.push(changeData);
          }
        }
      });

      setRentChangeAnalysis({
        quarterly: quarterlyChanges,
        halfYearly: halfYearlyChanges,
        yearly: yearlyChanges,
      });

      // Calculate advance return metrics with robust type coercion
      // CRITICAL FIX: Include inactive agreements (soft-deleted) for financial accuracy
      const closedAgreements = agreements.filter(a => {
        const status = (a.agreement_status || '').toString().trim().toLowerCase();
        const newStatus = (a.status || '').toString().trim().toLowerCase();
        // Include both legacy status and new lifecycle status
        return status === 'closed' || status === 'vacated' || newStatus === 'inactive';
      });
      
      // Join with residences to get owner names for Closed Rooms table
      const closedRoomsWithResidence = closedAgreements.map(agreement => {
        const residence = residences.find(r => r.residence_id === agreement.agreement_residence_id);
        return {
          ...agreement,
          residenceName: residence ? 
            `${residence.residence_door_number || ''} ${residence.residence_address_line_1 || ''}`.trim() || 'N/A' : 'N/A',
          ownerName: residence?.residence_owner_name || 'N/A',
          ownerId: residence?.residence_owner_id || 'N/A',
        };
      });
      
      setClosedRoomsData(closedRoomsWithResidence);
      
      const totalDueBack = closedAgreements.reduce((sum, a) => {
        // Values are already parsed as numbers at fetch time
        const advance = (typeof a.agreement_advance_amount === 'number' && !isNaN(a.agreement_advance_amount))
          ? a.agreement_advance_amount
          : 0;
        return sum + advance;
      }, 0);
      
      console.log('💵 Advance Return Metrics Calculation:', {
        closedAgreementsCount: closedAgreements.length,
        totalDueBack,
        closedAgreementsSample: closedAgreements.slice(0, 3).map(a => ({
          id: a.agreement_id,
          status: a.agreement_status,
          advance: a.agreement_advance_amount,
        })),
      });

      // Get transactions from localStorage
      const storedTransactions = JSON.parse(localStorage.getItem('advanceTransactions') || '[]');
      const totalNetReceived = storedTransactions.reduce((sum, t) => sum + (t.netReceived || 0), 0);

      setAdvanceReturnMetrics({
        totalDueBack,
        totalNetReceived,
        pending: Math.max(0, totalDueBack - totalNetReceived),
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

      // Set financial summary - calculate on frontend if API returns zeros
      const apiFinancialSummary = financialSummaryRes.data || {};
      
      // CRITICAL FIX: Calculate financial summary on frontend using allActiveAgreements
      // This ensures accuracy even if backend API has issues
      const calculatedTotalMonthlySpend = allActiveAgreements.reduce((sum, a) => {
        const rent = (typeof a.agreement_monthly_rent_amount === 'number' && !isNaN(a.agreement_monthly_rent_amount))
          ? a.agreement_monthly_rent_amount
          : 0;
        return sum + rent;
      }, 0);
      
      const calculatedTotalAdvanceSpent = allActiveAgreements.reduce((sum, a) => {
        const advance = (typeof a.agreement_advance_amount === 'number' && !isNaN(a.agreement_advance_amount))
          ? a.agreement_advance_amount
          : 0;
        return sum + advance;
      }, 0);
      
      const calculatedActiveAgreementsCount = allActiveAgreements.length;
      
      // CRITICAL: Always use frontend calculations (they're more reliable)
      // The API might have status filter issues, so we calculate on frontend
      const finalFinancialSummary = {
        totalCurrentMonthlySpend: calculatedTotalMonthlySpend,
        totalCurrentAdvanceSpent: calculatedTotalAdvanceSpent,
        activeAgreementsCount: calculatedActiveAgreementsCount,
        // Keep other fields from API
        likelyCostPrediction: apiFinancialSummary.likelyCostPrediction || 0,
        historicalSpend: apiFinancialSummary.historicalSpend || null,
        year2023: apiFinancialSummary.year2023 || 0,
        year2024: apiFinancialSummary.year2024 || 0,
        year2025: apiFinancialSummary.year2025 || 0,
      };
      
      console.log('💰 Financial Summary Calculation:', {
        apiValues: {
          totalCurrentMonthlySpend: apiFinancialSummary.totalCurrentMonthlySpend,
          totalCurrentAdvanceSpent: apiFinancialSummary.totalCurrentAdvanceSpent,
          activeAgreementsCount: apiFinancialSummary.activeAgreementsCount,
        },
        calculatedValues: {
          totalCurrentMonthlySpend: calculatedTotalMonthlySpend,
          totalCurrentAdvanceSpent: calculatedTotalAdvanceSpent,
          activeAgreementsCount: calculatedActiveAgreementsCount,
        },
        finalValues: finalFinancialSummary,
      });
      
      setFinancialSummary(finalFinancialSummary);

      // Process monthly spend data (last 12 months)
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

    } catch (error) {
      console.error('❌ Failed to fetch dashboard data:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });
      // Don't reset stats on error - keep previous values
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

  // Timeline filter handlers
  const handleTimelineChange = (e) => {
    const value = e.target.value;
    setTimelineFilterType(value);
    
    if (value === 'all') {
      setTimelineFilter(null);
      setCustomDateRange(null);
    } else if (value === 'custom') {
      // Custom range will be set when user selects dates
      if (customDateRange && customDateRange[0] && customDateRange[1]) {
        setTimelineFilter({
          startDate: customDateRange[0],
          endDate: customDateRange[1],
        });
      } else {
        // If no dates selected yet, don't set filter
        setTimelineFilter(null);
      }
    } else {
      // Preset options
      const currentDate = dayjs();
      let startDate, endDate;
      
      if (value === '30days') {
        startDate = currentDate.subtract(30, 'day');
        endDate = currentDate;
      } else if (value === '90days') {
        startDate = currentDate.subtract(90, 'day');
        endDate = currentDate;
      } else if (value === 'quarter') {
        startDate = currentDate.subtract(3, 'month').startOf('month');
        endDate = currentDate;
      }
      
      setTimelineFilter({ startDate, endDate });
      setCustomDateRange(null);
    }
  };

  const handleCustomDateRangeChange = (dates) => {
    setCustomDateRange(dates);
    if (dates && dates[0] && dates[1]) {
      setTimelineFilter({
        startDate: dates[0],
        endDate: dates[1],
      });
    } else {
      setTimelineFilter(null);
    }
  };

  // Export handlers
  const handleExportPDF = async () => {
    try {
      message.loading({ content: 'Generating PDF...', key: 'export' });
      
      const elements = [
        { element: employeeChartRef, title: 'Employee Breakdown by Department' },
        { element: deptRentChartRef, title: 'Monthly Rent Cost by Department' },
        { element: designationRentChartRef, title: 'Monthly Rent Cost by Employee Designation' },
      ];

      await exportChartsToPDF(elements, `Dashboard_${dayjs().format('YYYY-MM-DD')}.pdf`);
      message.success({ content: 'PDF exported successfully!', key: 'export' });
    } catch (error) {
      message.error({ content: 'Failed to export PDF', key: 'export' });
      console.error(error);
    }
  };

  const handleExportExcel = () => {
    try {
      message.loading({ content: 'Generating Excel...', key: 'export' });
      
      const sheets = [
        {
          data: processedCosts.rentByDepartment.map(item => ({
            'Department': item.label,
            'Monthly Rent Cost (₹)': item.amount,
          })),
          sheetName: 'Rent by Department',
        },
        {
          data: processedCosts.rentByDesignation.map(item => ({
            'Designation': item.label,
            'Monthly Rent Cost (₹)': item.amount,
          })),
          sheetName: 'Rent by Designation',
        },
        {
          data: financialSummary ? [
            { 'Metric': 'Total Monthly Spend', 'Value': `₹${(financialSummary.totalCurrentMonthlySpend || 0).toLocaleString()}` },
            { 'Metric': 'Total Advance Spent', 'Value': `₹${(financialSummary.totalCurrentAdvanceSpent || 0).toLocaleString()}` },
            { 'Metric': 'Active Agreements Count', 'Value': financialSummary.activeAgreementsCount || 0 },
          ] : [],
          sheetName: 'Financial Summary',
        },
        {
          data: employeeByDept.map(item => ({
            'Department': item.category,
            'Employee Count': item.value,
          })),
          sheetName: 'Employee Breakdown',
        },
      ];

      exportMultipleSheetsToExcel(sheets, `Dashboard_${dayjs().format('YYYY-MM-DD')}.xlsx`);
      message.success({ content: 'Excel exported successfully!', key: 'export' });
    } catch (error) {
      message.error({ content: 'Failed to export Excel', key: 'export' });
      console.error(error);
    }
  };

  const handleExportMenuClick = ({ key }) => {
    if (key === 'pdf') {
      handleExportPDF();
    } else if (key === 'excel') {
      handleExportExcel();
    }
  };

  const exportMenuItems = [
    {
      key: 'pdf',
      label: 'Download as PDF',
      icon: <FilePdfOutlined />,
    },
    {
      key: 'excel',
      label: 'Download as Excel',
      icon: <FileExcelOutlined />,
    },
  ];

  return (
    <div ref={dashboardRef}>
      <Spin spinning={loading}>
        {/* Timeline Filter and Export Controls */}
        <Card style={{ marginBottom: responsive.isMobile ? '16px' : '24px' }}>
          <Row gutter={[16, 16]} align="middle">
            <Col xs={24} sm={24} md={16} lg={16}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Title level={5} style={{ margin: 0, fontSize: responsive.isMobile ? '12px' : '14px' }}>Filter by Timeline:</Title>
                <Radio.Group 
                  value={timelineFilterType}
                  onChange={handleTimelineChange}
                  buttonStyle="solid"
                  size={responsive.isMobile ? 'small' : 'middle'}
                >
                  <Radio.Button value="all">All Time</Radio.Button>
                  <Radio.Button value="30days">Last 30 Days</Radio.Button>
                  <Radio.Button value="90days">Last 90 Days</Radio.Button>
                  <Radio.Button value="quarter">Last Quarter</Radio.Button>
                  <Radio.Button value="custom">Custom Range</Radio.Button>
                </Radio.Group>
                {timelineFilterType === 'custom' && (
                  <RangePicker
                    value={customDateRange}
                    onChange={handleCustomDateRangeChange}
                    format="DD-MM-YYYY"
                    style={{ marginTop: '8px', width: '100%' }}
                    size={responsive.isMobile ? 'small' : 'middle'}
                  />
                )}
              </Space>
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} style={{ textAlign: responsive.isMobile ? 'left' : 'right' }}>
              <Dropdown menu={{ items: exportMenuItems, onClick: handleExportMenuClick }}>
                <Button 
                  icon={<DownloadOutlined />} 
                  size={responsive.isMobile ? 'middle' : 'large'} 
                  block={responsive.isMobile}
                >
                  Download
                </Button>
              </Dropdown>
            </Col>
          </Row>
        </Card>

        {/* Application Feature Summary */}
        <Card style={{ marginBottom: responsive.isMobile ? '16px' : '24px', background: 'linear-gradient(135deg, #E87103 0%, #FF8C00 100%)' }}>
          <Title level={responsive.isMobile ? 4 : 3} style={{ color: '#FFFFFF', marginBottom: responsive.isMobile ? '12px' : '16px', fontSize: responsive.isMobile ? '18px' : '24px' }}>
            Soliflex Quarters Manager
          </Title>
          <Space size={responsive.isMobile ? 'small' : 'middle'} wrap>
            <Tag color="default" style={{ fontSize: responsive.isMobile ? '12px' : '14px', padding: responsive.isMobile ? '2px 8px' : '4px 12px', background: 'rgba(255,255,255,0.2)', color: '#FFFFFF', border: 'none' }}>
              Track Quarters Occupancy
            </Tag>
            <Tag color="default" style={{ fontSize: responsive.isMobile ? '12px' : '14px', padding: responsive.isMobile ? '2px 8px' : '4px 12px', background: 'rgba(255,255,255,0.2)', color: '#FFFFFF', border: 'none' }}>
              Monitor Agreement Renewals
            </Tag>
            <Tag color="default" style={{ fontSize: responsive.isMobile ? '12px' : '14px', padding: responsive.isMobile ? '2px 8px' : '4px 12px', background: 'rgba(255,255,255,0.2)', color: '#FFFFFF', border: 'none' }}>
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
            <Paragraph style={{ marginTop: '4px', marginBottom: 0, fontSize: '12px', color: '#595959' }}>
              <Typography.Link
                onClick={() => onNavigateToAgreements && onNavigateToAgreements('due90')}
                disabled={!renewalBuckets.dueIn90}
              >
                Due ≤ 90 days: {renewalBuckets.dueIn90}
              </Typography.Link>
            </Paragraph>
            <Paragraph style={{ marginTop: '4px', marginBottom: 0, fontSize: '12px', color: '#d4380d' }}>
              <Typography.Link
                onClick={() => onNavigateToAgreements && onNavigateToAgreements('pastDue')}
                disabled={!renewalBuckets.pastDue}
                style={{ color: renewalBuckets.pastDue ? '#d4380d' : '#8c8c8c' }}
              >
                Past due: {renewalBuckets.pastDue}
              </Typography.Link>
            </Paragraph>
            <Paragraph style={{ marginTop: '8px', marginBottom: 0, fontSize: '10px', color: '#8c8c8c', borderTop: '1px solid #f0f0f0', paddingTop: '8px' }}>
              Current Date (IST): {dayjs.tz(dayjs(), 'Asia/Kolkata').format('DD-MM-YYYY')}
            </Paragraph>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6} xl={4}>
            <Card style={{ height: '100%', minHeight: '140px' }}>
              <Statistic
                title="Total Monthly Rent"
                value={(() => {
                  // Final display validation: ensure value is a valid number
                  const val = stats.totalMonthlyRent;
                  const numVal = (typeof val === 'number' && !isNaN(val)) ? val : 0;
                  return numVal;
                })()}
                prefix={<DollarOutlined />}
                precision={2}
                formatter={(value) => {
                  // Additional formatter validation
                  const numValue = (typeof value === 'number' && !isNaN(value)) ? value : 0;
                  return `₹${numValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                }}
                valueStyle={{ color: '#262626', fontSize: '24px', fontWeight: 'bold' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6} xl={4}>
            <Card style={{ height: '100%', minHeight: '140px' }}>
              <Statistic
                title="Total Advance Locked"
                value={(() => {
                  // Final display validation: ensure value is a valid number
                  const val = stats.totalAdvanceLocked;
                  const numVal = (typeof val === 'number' && !isNaN(val)) ? val : 0;
                  return numVal;
                })()}
                prefix={<WalletOutlined />}
                precision={2}
                formatter={(value) => {
                  // Additional formatter validation
                  const numValue = (typeof value === 'number' && !isNaN(value)) ? value : 0;
                  return `₹${numValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                }}
                valueStyle={{ color: '#262626', fontSize: '24px', fontWeight: 'bold' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6} xl={4}>
            <Card 
              style={{ 
                height: '100%',
                minHeight: responsive.isMobile ? '120px' : '140px',
                cursor: 'pointer',
                border: agreementsNeedingReview > 0 ? '2px solid #ff4d4f' : '1px solid #d9d9d9',
                background: agreementsNeedingReview > 0 
                  ? 'linear-gradient(135deg, #fff1f0 0%, #ffe7e6 100%)'
                  : '#FFFFFF',
                transition: 'all 0.3s',
              }}
              onClick={() => {
                if (onNavigateToAgreements && agreementsNeedingReview > 0) {
                  onNavigateToAgreements('review');
                }
              }}
              hoverable={agreementsNeedingReview > 0}
            >
              <Statistic
                title="Agreements Needing Review"
                value={(() => {
                  // Final display validation: ensure value is a valid number
                  const val = agreementsNeedingReview;
                  const numVal = (typeof val === 'number' && !isNaN(val)) ? val : 0;
                  return numVal;
                })()}
                prefix={<AlertOutlined />}
                valueStyle={{ 
                  color: agreementsNeedingReview > 0 ? '#ff4d4f' : '#262626', 
                  fontSize: responsive.isMobile ? '22px' : '28px', 
                  fontWeight: 'bold' 
                }}
              />
              <Paragraph style={{ marginTop: '8px', marginBottom: 0, fontSize: responsive.isMobile ? '11px' : '12px', color: '#595959' }}>
                {agreementsNeedingReview > 0 
                  ? 'Click to view details' 
                  : 'All agreements up to date'}
              </Paragraph>
              <Paragraph style={{ marginTop: '4px', marginBottom: 0, fontSize: responsive.isMobile ? '9px' : '10px', color: '#8c8c8c' }}>
                Today (IST): {dayjs.tz(dayjs(), 'Asia/Kolkata').format('DD-MM-YYYY')}
              </Paragraph>
            </Card>
          </Col>
        </Row>

        {/* Advance Return Metrics Cards */}
          <Row gutter={[responsive.isMobile ? 12 : 16, responsive.isMobile ? 12 : 16]} style={{ marginBottom: responsive.isMobile ? '16px' : '24px' }}>
            <Col xs={24} sm={12} md={8} lg={8}>
              <Card style={{ minHeight: responsive.isMobile ? '120px' : '140px' }}>
                <Statistic
                title="Total Advance Due Back"
                value={advanceReturnMetrics.totalDueBack}
                prefix={<WalletOutlined />}
                  precision={2}
                  formatter={(value) => `₹${value.toLocaleString()}`}
                valueStyle={{ color: '#262626', fontSize: responsive.isMobile ? '20px' : '24px' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={8} lg={8}>
              <Card style={{ minHeight: responsive.isMobile ? '120px' : '140px' }}>
                <Statistic
                title="Total Net Received"
                value={advanceReturnMetrics.totalNetReceived}
                prefix={<DollarOutlined />}
                  precision={2}
                  formatter={(value) => `₹${value.toLocaleString()}`}
                valueStyle={{ color: '#52c41a', fontSize: responsive.isMobile ? '20px' : '24px' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={8} lg={8}>
            <Card 
              style={{ 
                minHeight: responsive.isMobile ? '120px' : '140px',
                border: advanceReturnMetrics.pending > 0 ? '2px solid #ff4d4f' : '1px solid #d9d9d9',
                background: advanceReturnMetrics.pending > 0 ? '#fff1f0' : '#FFFFFF',
              }}
            >
                <Statistic
                title="Pending Amount"
                value={advanceReturnMetrics.pending}
                prefix={<AlertOutlined />}
                precision={2}
                formatter={(value) => `₹${value.toLocaleString()}`}
                valueStyle={{ 
                  color: advanceReturnMetrics.pending > 0 ? '#ff4d4f' : '#262626',
                  fontSize: responsive.isMobile ? '20px' : '24px',
                  fontWeight: 'bold',
                }}
                />
              </Card>
            </Col>
          </Row>


        {/* Closed Rooms Table */}
        {closedRoomsData.length > 0 && (
          <Card
            title="Closed Rooms & Rent Settlement"
            style={{ marginBottom: responsive.isMobile ? '16px' : '24px' }}
          >
            <Table
              dataSource={closedRoomsData}
              rowKey="agreement_id"
              pagination={{ pageSize: 10 }}
              scroll={{ x: 'max-content' }}
              columns={[
                {
                  title: 'Agreement ID',
                  dataIndex: 'agreement_id',
                  key: 'agreement_id',
                },
                {
                  title: 'Room/Unit',
                  dataIndex: 'agreement_employee_unit',
                  key: 'agreement_employee_unit',
                  render: (unit) => unit || 'N/A',
                },
                {
                  title: 'Residence Name',
                  dataIndex: 'residenceName',
                  key: 'residenceName',
                },
                {
                  title: 'Owner Name',
                  dataIndex: 'ownerName',
                  key: 'ownerName',
                },
                {
                  title: 'Owner ID',
                  dataIndex: 'ownerId',
                  key: 'ownerId',
                },
                {
                  title: 'Total Advance Due Back',
                  dataIndex: 'agreement_advance_amount',
                  key: 'advance_due',
                  render: (amount) => {
                    const numAmount = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
                    return `₹${numAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                  },
                },
                {
                  title: 'Total Net Received',
                  key: 'net_received',
                  render: (_, record) => {
                    const transactions = JSON.parse(localStorage.getItem('advanceTransactions') || '[]');
                    const transaction = transactions.find(t => t.agreementId === record.agreement_id);
                    const netReceived = transaction?.netReceived || 0;
                    return `₹${netReceived.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                  },
                },
              ]}
            />
          </Card>
        )}

        {/* Charts Section - Full Width Stacked */}
        {/* Chart 1: Employee Breakdown by Department (Employee Count) */}
        <Row gutter={[responsive.isMobile ? 12 : 16, responsive.isMobile ? 12 : 16]} style={{ marginBottom: responsive.isMobile ? '16px' : '24px' }}>
          <Col xs={24} sm={24} md={24} lg={24} xl={24} xxl={24}>
            <Card title="Employee Breakdown by Department">
              {chartData.length > 0 ? (
                <div 
                  ref={employeeChartRef} 
                  style={{ 
                    background: '#F0F2F5', 
                    padding: responsive.isMobile ? '8px' : '16px', 
                    borderRadius: '8px',
                    width: '100%',
                    overflowX: 'auto',
                    overflowY: 'hidden',
                  }}
                >
                  <div style={{ minWidth: '100%', width: 'max-content' }}>
                    <Column {...employeeChartConfig} height={responsive.isMobile ? 300 : 400} autoFit />
                  </div>
                </div>
              ) : (
                <div style={{ padding: responsive.isMobile ? '20px' : '40px', textAlign: 'center', color: '#8c8c8c', fontSize: responsive.isMobile ? '12px' : '14px' }}>
                  No Employee Department data available for analysis.
                </div>
              )}
            </Card>
          </Col>
        </Row>

        {/* Chart 3: Monthly Rent Cost by Department */}
        <Row gutter={[responsive.isMobile ? 12 : 16, responsive.isMobile ? 12 : 16]} style={{ marginBottom: responsive.isMobile ? '16px' : '24px' }}>
          <Col xs={24} sm={24} md={24} lg={24} xl={24} xxl={24}>
            <Card title="Monthly Rent Cost by Department">
              {processedCosts.rentByDepartment.length > 0 ? (
                <div 
                  ref={deptRentChartRef} 
                  style={{ 
                    background: '#F0F2F5', 
                    padding: responsive.isMobile ? '8px' : '16px', 
                    borderRadius: '8px',
                    width: '100%',
                    overflowX: 'auto',
                    overflowY: 'hidden',
                  }}
                >
                  <div style={{ minWidth: '100%', width: 'max-content' }}>
                    <Column {...departmentRentAggregatedConfig} height={responsive.isMobile ? 300 : 400} autoFit />
                  </div>
                </div>
              ) : (
                <div style={{ padding: responsive.isMobile ? '20px' : '40px', textAlign: 'center', color: '#8c8c8c', fontSize: responsive.isMobile ? '12px' : '14px' }}>
                  No department rent cost data available
                </div>
              )}
            </Card>
          </Col>
        </Row>

        {/* Chart 4: Monthly Rent Cost by Employee Designation */}
        <Row gutter={[responsive.isMobile ? 12 : 16, responsive.isMobile ? 12 : 16]} style={{ marginBottom: responsive.isMobile ? '16px' : '24px' }}>
          <Col xs={24} sm={24} md={24} lg={24} xl={24} xxl={24}>
            <Card title="Monthly Rent Cost by Employee Designation">
              {processedCosts.rentByDesignation.length > 0 ? (
                <div 
                  ref={designationRentChartRef} 
                  style={{ 
                    background: '#F0F2F5', 
                    padding: responsive.isMobile ? '8px' : '16px', 
                    borderRadius: '8px',
                    width: '100%',
                    overflowX: 'auto',
                    overflowY: 'hidden',
                  }}
                >
                  <div style={{ minWidth: '100%', width: 'max-content' }}>
                    <Column {...designationRentAggregatedConfig} height={responsive.isMobile ? 300 : 400} autoFit />
                  </div>
                </div>
              ) : (
                <div style={{ padding: responsive.isMobile ? '20px' : '40px', textAlign: 'center', color: '#8c8c8c', fontSize: responsive.isMobile ? '12px' : '14px' }}>
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

