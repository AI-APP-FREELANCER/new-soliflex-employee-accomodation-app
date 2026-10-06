import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Spin, Typography, Button, Dropdown, message, Alert,
  Row, Col, Statistic, Tabs, Tag, Space, Modal, Collapse, Badge,
} from 'antd';
import {
  DownloadOutlined, FileExcelOutlined, ReloadOutlined,
  HomeOutlined, TeamOutlined, DollarOutlined, CalendarOutlined,
  WarningOutlined, UserOutlined, BankOutlined, FileTextOutlined,
  DashboardOutlined, SafetyCertificateOutlined, ApartmentOutlined,
  AppstoreOutlined, ShopOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import { Column, Pie } from '@ant-design/charts';
import { useNavigate } from 'react-router-dom';
import api, { agreementAPI, residenceAPI, employeeAPI, analyticsAPI } from '../services/api';
import { exportTableToExcel, exportMultipleSheetsToExcel } from '../utils/exportUtils';
import { formatDateForDisplay } from '../utils/dateUtils';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

// ── Format helpers ──────────────────────────────────────────────────────────
const fmtC = (v) => {
  if (v == null || v === '—') return '—';
  if (typeof v !== 'number') return v;
  if (v === 0) return '₹0';
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)} Cr`;
  if (v >= 100000)   return `₹${(v / 100000).toFixed(2)} L`;
  if (v >= 1000)     return `₹${(v / 1000).toFixed(1)} K`;
  return `₹${v.toLocaleString('en-IN')}`;
};

const fmtCFull = (v) => {
  if (v == null || v === '—') return '—';
  if (typeof v !== 'number') return v;
  return `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtD = (v) => (!v || v === '—' ? '—' : formatDateForDisplay(v));

const pgn = {
  pageSize: 10,
  showSizeChanger: true,
  pageSizeOptions: ['10', '25', '50'],
  size: 'small',
  showTotal: (t) => `${t} records`,
};

// ── Status tag ───────────────────────────────────────────────────────────────
const STag = ({ v }) => {
  if (!v || v === '—') return <Text type="secondary">—</Text>;
  const s = String(v).toLowerCase();
  if (s === 'active' || s === 'processed' || s === 'closed' || s === 'done')
    return <Tag color="success">{v}</Tag>;
  if (s === 'pending' || s.includes('partial'))
    return <Tag color="warning">{v}</Tag>;
  if (s === 'inactive' || s === 'no agreement')
    return <Tag color="default">{v}</Tag>;
  if (s.includes('past') || s === 'overdue')
    return <Tag color="error">{v}</Tag>;
  return <Tag>{v}</Tag>;
};

// ── Reusable table card with per-table export ────────────────────────────────
const TCard = ({ title, icon, dataSource = [], columns, rowKey, exportName, extraContent }) => {
  const doExport = () => {
    try {
      const rows = dataSource.map(r => {
        const obj = {};
        columns.forEach(c => {
          if (c.dataIndex) obj[String(c.title)] = r[c.dataIndex] ?? '';
        });
        return obj;
      });
      if (!rows.length) { message.warning('No data to export'); return; }
      exportTableToExcel(rows, exportName || title, `${(exportName || title).replace(/\s+/g, '_')}_${dayjs().format('YYYYMMDD')}.xlsx`);
      message.success('Exported!');
    } catch {
      message.error('Export failed');
    }
  };

  return (
    <Card
      title={<Space size={6}>{icon}<span style={{ fontSize: 13 }}>{title}</span></Space>}
      size="small"
      style={{ marginBottom: 16 }}
      extra={
        <Button size="small" type="text" icon={<FileExcelOutlined style={{ color: '#52c41a' }} />} onClick={doExport}>
          Export
        </Button>
      }
    >
      {extraContent}
      <Table
        dataSource={dataSource}
        columns={columns}
        rowKey={rowKey}
        pagination={dataSource.length > 10 ? pgn : false}
        size="small"
        scroll={{ x: true }}
      />
    </Card>
  );
};

// ── KPI card ─────────────────────────────────────────────────────────────────
const KCard = ({ title, value, suffix, color, sub, clickFn }) => (
  <Card
    size="small"
    style={{ borderTop: `3px solid ${color || '#E87103'}`, height: '100%', cursor: clickFn ? 'pointer' : 'default' }}
    hoverable={!!clickFn}
    onClick={clickFn}
    bodyStyle={{ padding: '12px 16px' }}
  >
    <Statistic
      title={<span style={{ fontSize: 12, color: '#595959' }}>{title}</span>}
      value={value}
      suffix={suffix}
      valueStyle={{ fontSize: 20, fontWeight: 700, color: color || '#262626' }}
    />
    {sub && <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 2 }}>{sub}</div>}
  </Card>
);

// ── Section label ─────────────────────────────────────────────────────────────
const SLabel = ({ children }) => (
  <div style={{ marginBottom: 6, marginTop: 4 }}>
    <Text style={{ fontWeight: 600, color: '#8c8c8c', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
      {children}
    </Text>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
const DashboardHome = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [misData, setMisData] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [availModal, setAvailModal] = useState({ open: false, type: null, title: '' });
  const [availDetail, setAvailDetail] = useState([]);
  const [availDetailLoading, setAvailDetailLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const misRes = await api.get('/analytics/mis');
      setMisData(misRes.data || {});
    } catch {
      message.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const openAvailModal = useCallback(async (type) => {
    const titles = {
      properties: 'Residences — Vacancy',
      rooms:      'Rooms with Vacant Beds',
      beds:       'Available Beds — Detail',
    };
    setAvailModal({ open: true, type, title: titles[type] || '' });
    setAvailDetailLoading(true);
    try {
      const res = await analyticsAPI.getAvailabilityDetail();
      setAvailDetail(res.data || []);
    } catch {
      message.error('Failed to load availability detail');
    } finally {
      setAvailDetailLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, []); // eslint-disable-line

  // ── Bulk export ─────────────────────────────────────────────────────────
  const handleBulkExport = async ({ key }) => {
    const hide = message.loading('Preparing export…', 0);
    try {
      if (key === 'fullMIS') {
        exportMultipleSheetsToExcel([
          {
            sheetName: 'Executive Summary',
            data: (misData?.ownerSummary || []).map(r => ({
              Metric: r.metric,
              Value: r.currentValue,
              'Action Required': r.actionRequired,
            })),
          },
          {
            sheetName: 'Dept Employee Summary',
            data: (misData?.departmentWiseEmployeeSummary || []).map(r => ({
              Department: r.department,
              Total: r.totalEmployees,
              Active: r.active,
              Inactive: r.inactive,
              'Room Allocated': r.withRoom,
              'Residence, No Room': r.residenceOnly,
              'Not Allocated': r.unallocated,
            })),
          },
          {
            sheetName: 'Residence Occupancy',
            data: (misData?.residenceOccupancy || []).map(r => ({
              'Residence ID': r.residenceId,
              Residence: r.residence,
              Unit: r.unit,
              Floors: r.floors,
              Rooms: r.rooms,
              Capacity: r.capacity,
              Occupied: r.occupied,
              Vacant: r.vacant,
              'Occupancy %': r.occupancyPct,
              'No Room Assigned': r.residentsWithoutRoom,
              Setup: r.setupStatus,
            })),
          },
          {
            sheetName: 'Room Vacancy',
            data: (misData?.roomVacancy || []).map(r => ({
              Residence: r.residence,
              Unit: r.unit,
              Floor: r.floor,
              Room: r.room,
              Type: r.roomType,
              Capacity: r.capacity,
              Occupied: r.occupied,
              Vacant: r.vacant,
              Status: r.status,
              Occupants: r.occupants,
            })),
          },
          {
            sheetName: 'Unit Summary',
            data: (misData?.unitSummary || []).map(u => ({
              Unit: u.unit,
              Residences: u.residences,
              Rooms: u.rooms,
              'Bed Capacity': u.capacity,
              Occupied: u.occupied,
              Vacant: u.vacant,
              'Occupancy %': u.occupancyPct,
              Employees: u.employees,
              'Room Allocated': u.employeesWithRoom,
              'Monthly Rent': u.rent,
            })),
          },
          {
            sheetName: 'Dept Expense Matrix',
            data: (misData?.departmentalExpenseMatrix || []).map(r => ({
              Department: r.department,
              'Resident Count': r.totalResidentCount,
              'Monthly Rent': r.cumulativeMonthlyRent,
              'Cost Per Head': typeof r.costPerHead === 'number' ? r.costPerHead : 0,
            })),
          },
          {
            sheetName: 'Past Due Renewals',
            data: (misData?.renewalsPastDue || []).map(r => ({
              'Agreement ID': r.agreementId,
              Residence: r.residenceId,
              Employee: r.employee,
              'Renewal Due Date': r.renewalDueDate,
              'Days Past Due': r.daysPastDue,
              'Monthly Rent': r.monthlyRent,
            })),
          },
          {
            sheetName: 'Renewals Due Soon',
            data: (misData?.renewalsDueSoon || []).map(r => ({
              'Agreement ID': r.agreementId,
              Residence: r.residenceId,
              Employee: r.employee,
              'Renewal Due Date': r.renewalDueDate,
              'Days Until Due': r.daysUntilDue,
              'Monthly Rent': r.monthlyRent,
            })),
          },
          {
            sheetName: 'Employees Leaving Soon',
            data: (misData?.upcomingVacancyReplacementTracker || []).map(r => ({
              Employee: r.employeeName,
              Department: r.department,
              'Last Working Date': r.projectedLWD,
              'Days Left': r.daysLeft,
              Residence: r.allocatedResidence,
              'Notice Status': r.noticeStatus,
            })),
          },
          {
            sheetName: 'Advance Refunds',
            data: (misData?.advancePipeline || []).map(r => ({
              'Agreement ID': r.agreementId,
              Residence: r.residence,
              Landlord: r.residenceLandlord,
              'Vacate Date': r.vacateDate || '',
              'Due Back': r.advanceDueBack,
              Deductions: r.deductions,
              'Expected Refund': r.expectedRefund,
              Received: r.advanceReceived,
              Outstanding: r.pending,
              Status: r.status,
            })),
          },
          {
            sheetName: 'Landlord Summary',
            data: (misData?.byOwnerLandlord || []).map(r => ({
              'Owner Name': r.ownerName,
              Properties: r.propertyCount,
              'Active Agreements': r.activeAgreements,
              'Monthly Rent': r.totalMonthlyRent,
              'Advance Locked': r.totalAdvanceLocked,
              Rating: r.landlordRating,
            })),
          },
        ], `Full_MIS_Report_${dayjs().format('YYYY-MM-DD')}.xlsx`);
      } else if (key === 'allAgreements') {
        const res = await agreementAPI.getAll({ status: 'all' });
        const data = Array.isArray(res.data) ? res.data : [];
        exportTableToExcel(data.map(a => ({
          'Agreement ID': a.agreement_id,
          'Residence ID': a.agreement_residence_id,
          Status: a.agreement_status,
          Unit: a.agreement_employee_unit || '',
          'Monthly Rent': parseFloat(a.agreement_monthly_rent_amount) || 0,
          'Advance Amount': parseFloat(a.agreement_advance_amount) || 0,
          'Advance Due Back': parseFloat(a.agreement_advance_due_back) || 0,
          'Advance Received': parseFloat(a.agreement_advance_received) || 0,
          'Possession Date': a.agreement_possesion_date || '',
          'Renewal Due Date': a.agreement_renewal_due_date || '',
          'Vacate Date': a.agreement_vacate_date || '',
          'Statutory Status': a.agreement_statutory_status || '',
          'Scheduled to Vacate': a.agreement_scheduled_to_vacate ? 'Yes' : 'No',
        })), 'All Agreements', `All_Agreements_${dayjs().format('YYYY-MM-DD')}.xlsx`);
      } else if (key === 'allResidences') {
        const res = await residenceAPI.getAll('all');
        const data = Array.isArray(res.data) ? res.data : [];
        exportTableToExcel(data.map(r => ({
          'Residence ID': r.residence_id,
          'Owner Name': r.residence_owner_name,
          Area: r.residence_area || '',
          Address: [r.residence_address_line_1, r.residence_address_line_2].filter(Boolean).join(', '),
          'House Count': r.residence_house_count || 0,
          Status: r.residence_status,
          Rating: r.residence_owner_rating || '',
        })), 'All Residences', `All_Residences_${dayjs().format('YYYY-MM-DD')}.xlsx`);
      } else if (key === 'allEmployees') {
        const res = await employeeAPI.getAll('all');
        const data = Array.isArray(res.data) ? res.data : [];
        exportTableToExcel(data.map(e => ({
          'Employee ID': e.employee_id,
          Name: [e.employee_first_name, e.employee_last_name, e.employee_sir_name].filter(Boolean).join(' '),
          Department: e.employee_department || '',
          Designation: e.employee_designation || '',
          'Date of Joining': e.employee_date_of_joining || '',
          Status: e.employee_status || '',
          'Allocated Agreement': e.emplyee_allocated_agreement_id || '',
          'Last Working Date': e.employee_last_working_date || '',
        })), 'All Employees', `All_Employees_${dayjs().format('YYYY-MM-DD')}.xlsx`);
      }
      message.success('Exported successfully!');
    } catch {
      message.error('Export failed');
    } finally {
      hide();
    }
  };

  // ── Loading / error states ─────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
      <Spin size="large" tip="Loading dashboard…" />
    </div>
  );
  if (!misData) return <Alert type="error" message="No data available. Please refresh." />;

  const s = misData.summary || {};

  // ── KPI values (all calculated on the server — see accommodationSnapshot.js) ──
  const totalProperties    = s.totalProperties    || 0;
  const activeResidences   = s.activeResidences   || 0;
  const inactiveResidences = s.inactiveResidences || 0;
  const occupiedResidences = s.occupiedResidences || 0;
  const vacantResidences   = s.vacantResidences   || 0;
  const residencesWithoutStructure = s.residencesWithoutStructure || 0;
  const totalRooms         = s.totalRooms         || 0;
  const fullRooms          = s.fullRooms          || 0;
  const partialRooms       = s.partialRooms       || 0;
  const vacantRooms        = s.vacantRooms        || 0;
  const roomsWithVacancy   = s.roomsWithVacancy   || 0;
  const totalBeds          = s.totalBeds          || 0;
  const occupiedBeds       = s.occupiedBeds       || 0;
  const availableBeds      = s.vacantBeds         || 0;
  const bedsHeldByInactive = s.bedsHeldByInactive || 0;
  const bedOccupancyPct    = s.bedOccupancyPct    || 0;
  const activeEmployees    = s.activeEmployees    || 0;
  const inactiveEmployees  = s.inactiveEmployees  || 0;
  const totalEmployees     = activeEmployees + inactiveEmployees;
  const employeesWithRoom  = s.employeesWithRoom  || 0;
  const employeesResidenceOnly = s.employeesResidenceOnly || 0;
  const unallocatedEmployees = s.unallocatedEmployees || 0;
  const totalMonthlyRent   = s.totalMonthlyRent   || 0;
  const totalAdvanceLocked = s.totalAdvanceLocked || 0;
  const totalAdvancePending= s.totalAdvancePending|| 0;
  const totalNetReceived   = s.totalNetReceived   || 0;
  const totalRefundDeductions = s.totalRefundDeductions || 0;
  const totalRefundUpcoming = s.totalRefundUpcoming || 0;
  const refundCasesOpen    = s.refundCasesOpen    || 0;
  const totalScheduledToVacate = s.totalScheduledToVacate || 0;
  const pastDue            = s.pastDue            || 0;
  const dueSoon            = s.dueSoon            || 0;
  const leavingIn30Days    = s.leavingIn30Days    || 0;
  const leavingIn60Days    = s.leavingIn60Days    || 0;
  const leavingIn90Days    = s.leavingIn90Days    || 0;

  const unitBreakdown = misData.unitSummary || [];

  // ── Chart data ─────────────────────────────────────────────────────────
  const propertyPieData = [
    { type: 'Full', value: fullRooms },
    { type: 'Partially occupied', value: partialRooms },
    { type: 'Vacant', value: vacantRooms },
  ].filter(d => d.value > 0);

  const employeePieData = [
    { type: 'Room allocated', value: employeesWithRoom },
    { type: 'Residence, no room', value: employeesResidenceOnly },
    { type: 'Not allocated', value: unallocatedEmployees },
  ].filter(d => d.value > 0);

  const abbrev = (s, n = 16) => s && s.length > n ? s.substring(0, n) + '…' : (s || '');

  const deptCountData = (misData.departmentWiseEmployeeSummary || [])
    .sort((a, b) => b.totalEmployees - a.totalEmployees)
    .slice(0, 10)
    .map(d => ({ dept: abbrev(d.department), count: d.totalEmployees }));

  const deptRentData = (misData.departmentalExpenseMatrix || [])
    .filter(d => d.cumulativeMonthlyRent > 0)
    .sort((a, b) => b.cumulativeMonthlyRent - a.cumulativeMonthlyRent)
    .slice(0, 10)
    .map(d => ({ dept: abbrev(d.department), rent: d.cumulativeMonthlyRent }));

  const advanceData = [
    { stage: 'Locked (Active)', amount: totalAdvanceLocked },
    { stage: 'Received Back',   amount: totalNetReceived },
    { stage: 'Deductions',      amount: totalRefundDeductions },
    { stage: 'Pending Refund',  amount: totalAdvancePending },
  ].filter(d => d.amount > 0);

  const renewalAlertData = [
    { status: 'Past Due',      count: pastDue },
    { status: 'Due (90 Days)', count: dueSoon },
    { status: 'Vacating',      count: totalScheduledToVacate },
  ].filter(d => d.count > 0);

  // ── Chart configs (G2Plot-compatible) ─────────────────────────────────
  const pieBase = {
    radius: 0.85, innerRadius: 0.5, label: false,
    legend: { position: 'bottom', layout: 'horizontal' },
    interactions: [{ type: 'element-active' }],
  };

  const propPieConfig = {
    ...pieBase,
    data: propertyPieData,
    angleField: 'value', colorField: 'type',
    color: ['#f5222d', '#faad14', '#52c41a'],
    scale: { color: { domain: ['Full', 'Partially occupied', 'Vacant'], range: ['#f5222d', '#faad14', '#52c41a'] } },
    tooltip: { formatter: (d) => {
      const t = propertyPieData.reduce((s, x) => s + x.value, 0);
      return { name: d.type, value: `${d.value} (${t > 0 ? ((d.value/t)*100).toFixed(1) : 0}%)` };
    }},
  };

  const empPieConfig = {
    ...pieBase,
    data: employeePieData,
    angleField: 'value', colorField: 'type',
    color: ['#1890ff', '#faad14', '#f5222d'],
    scale: { color: { domain: ['Room allocated', 'Residence, no room', 'Not allocated'], range: ['#1890ff', '#faad14', '#f5222d'] } },
    tooltip: { formatter: (d) => {
      const t = employeePieData.reduce((s, x) => s + x.value, 0);
      return { name: d.type, value: `${d.value} (${t > 0 ? ((d.value/t)*100).toFixed(1) : 0}%)` };
    }},
  };

  const colXAxis = { label: { autoRotate: true, autoHide: false, style: { fontSize: 10 } } };

  // Safe formatter helper: @ant-design/charts v2 may pass the raw y-value (number/string)
  // rather than the full datum object — handle both cases to avoid NaN labels.
  const safeRentFmt = (d) => {
    const v = (typeof d === 'object' && d !== null) ? (d.rent ?? 0) : (parseFloat(d) || 0);
    if (!v || isNaN(v)) return '';
    if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
    if (v >= 100000)   return `₹${(v / 100000).toFixed(1)}L`;
    return `₹${(v / 1000).toFixed(0)}K`;
  };

  const safeAmtFmt = (d) => {
    const v = (typeof d === 'object' && d !== null) ? (d.amount ?? 0) : (parseFloat(d) || 0);
    if (!v || isNaN(v)) return '';
    if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
    if (v >= 100000)   return `₹${(v / 100000).toFixed(1)}L`;
    return `₹${(v / 1000).toFixed(0)}K`;
  };

  const deptCountConfig = {
    data: deptCountData, xField: 'dept', yField: 'count',
    color: '#1890ff',
    columnWidthRatio: 0.55,
    label: { position: 'top', style: { fill: '#262626', fontSize: 11, fontWeight: 700 } },
    xAxis: colXAxis,
    yAxis: { title: { text: 'Employees' }, min: 0 },
    meta: { count: { min: 0 } },
    tooltip: { formatter: (d) => ({ name: 'Employees', value: d.count }) },
  };

  const deptRentConfig = {
    data: deptRentData, xField: 'dept', yField: 'rent',
    color: '#E87103',
    columnWidthRatio: 0.55,
    label: {
      position: 'top',
      style: { fill: '#262626', fontSize: 10, fontWeight: 700 },
      formatter: safeRentFmt,
    },
    xAxis: colXAxis,
    yAxis: {
      title: { text: 'Monthly Rent' },
      min: 0,
      label: { formatter: (v) => {
        const n = parseFloat(v) || 0;
        if (n >= 100000) return `₹${(n / 100000).toFixed(0)}L`;
        return `₹${(n / 1000).toFixed(0)}K`;
      }},
    },
    meta: { rent: { min: 0 } },
    tooltip: { formatter: (d) => ({ name: 'Monthly Rent', value: `₹${Number(d.rent).toLocaleString('en-IN')}` }) },
  };

  const advanceConfig = {
    data: advanceData, xField: 'stage', yField: 'amount',
    color: ({ stage }) => ({ 'Locked (Active)': '#E87103', 'Received Back': '#52c41a', Deductions: '#faad14' }[stage] || '#f5222d'),
    columnWidthRatio: 0.55,
    label: {
      position: 'top',
      style: { fill: '#262626', fontSize: 11, fontWeight: 700 },
      formatter: safeAmtFmt,
    },
    yAxis: { min: 0, label: { formatter: (v) => {
      const n = parseFloat(v) || 0;
      if (n >= 100000) return `₹${(n / 100000).toFixed(0)}L`;
      return `₹${(n / 1000).toFixed(0)}K`;
    }}},
    meta: { amount: { min: 0 } },
    tooltip: { formatter: (d) => ({ name: d.stage, value: `₹${Number(d.amount).toLocaleString('en-IN')}` }) },
  };

  const renewalConfig = {
    data: renewalAlertData, xField: 'status', yField: 'count',
    color: ({ status }) => status === 'Past Due' ? '#f5222d' : status === 'Due (90 Days)' ? '#faad14' : '#1890ff',
    columnWidthRatio: 0.55,
    label: { position: 'top', style: { fill: '#262626', fontSize: 13, fontWeight: 700 } },
    yAxis: { title: { text: 'Count' }, min: 0 },
    meta: { count: { min: 0 } },
    tooltip: { formatter: (d) => ({ name: d.status, value: d.count }) },
  };

  // ── Tab content ──────────────────────────────────────────────────────────

  // ── Overview Tab ─────────────────────────────────────────────────────────
  const OverviewContent = () => (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card
            title="Room Occupancy Status"
            size="small"
            extra={<Text type="secondary" style={{ fontSize: 12 }}>{totalRooms} rooms · {occupiedBeds}/{totalBeds} beds occupied</Text>}
          >
            {propertyPieData.length > 0
              ? <Pie {...propPieConfig} height={270} />
              : <div style={{ textAlign: 'center', padding: 40, color: '#8c8c8c' }}>No data</div>}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card
            title="Workforce Allocation"
            size="small"
            extra={<Text type="secondary" style={{ fontSize: 12 }}>{employeesWithRoom} with room · {activeEmployees} active</Text>}
          >
            {employeePieData.length > 0
              ? <Pie {...empPieConfig} height={270} />
              : <div style={{ textAlign: 'center', padding: 40, color: '#8c8c8c' }}>No data</div>}
          </Card>
        </Col>
      </Row>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card title="Top 10 Departments — Employee Headcount" size="small">
            {deptCountData.length > 0
              ? <Column {...deptCountConfig} height={280} />
              : <div style={{ textAlign: 'center', padding: 40, color: '#8c8c8c' }}>No data</div>}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Top 10 Departments — Monthly Rent Spend" size="small">
            {deptRentData.length > 0
              ? <Column {...deptRentConfig} height={280} />
              : <div style={{ textAlign: 'center', padding: 40, color: '#8c8c8c' }}>No data</div>}
          </Card>
        </Col>
      </Row>
      {/* Executive summary table */}
      {(() => {
        // Only these metrics carry a ₹ (rupee) value — all others are counts, percentages or dates
        const CURRENCY_METRICS = new Set([
          'Total Monthly Burn (Rent)',
          'Advance Locked (Active Agreements)',
          'Advance Refund Outstanding',
          'Advance Refund Received',
          'Advance Refunds Upcoming (Vacating)',
        ]);
        const fmtSummaryValue = (v, metric) => {
          if (typeof v !== 'number') return v;           // string / percentage / date — return as-is
          if (CURRENCY_METRICS.has(metric)) return fmtCFull(v); // monetary → ₹ formatted
          return v.toLocaleString('en-IN');              // counts → plain number, no ₹
        };
        return (
          <TCard
            title="Executive Summary Table"
            icon={<FileTextOutlined />}
            dataSource={misData.ownerSummary || []}
            rowKey="metric"
            exportName="Executive_Summary"
            columns={[
              { title: 'Metric', dataIndex: 'metric', key: 'metric', width: 280 },
              {
                title: 'Current Value',
                dataIndex: 'currentValue',
                key: 'currentValue',
                render: (v, row) => {
                  const fmt = fmtSummaryValue(v, row.metric);
                  if (row.metric === 'Past Due Renewals' && typeof v === 'number' && v > 0)
                    return <Typography.Link onClick={() => navigate('/agreements?filter=pastDue')}>{fmt}</Typography.Link>;
                  if (row.metric === 'Due in 90 Days' && typeof v === 'number')
                    return <Typography.Link onClick={() => navigate('/agreements?filter=due90')}>{fmt}</Typography.Link>;
                  if (row.metric === 'Pipeline Ready (Scheduled to Vacate)' && typeof v === 'number')
                    return <Typography.Link onClick={() => navigate('/agreements?filter=scheduledToVacate')}>{fmt}</Typography.Link>;
                  return fmt;
                },
              },
              { title: 'Action Required', dataIndex: 'actionRequired', key: 'actionRequired', ellipsis: true },
            ]}
          />
        );
      })()}
    </div>
  );

  // ── Occupancy & Vacancy Tab (room level) ─────────────────────────────────
  const ROOM_STATUS_COLOR = { Full: 'red', 'Partially occupied': 'gold', Vacant: 'green', 'No beds': 'default' };
  const OccupancyContent = () => (
    <div>
      <TCard
        title="Residence Occupancy"
        icon={<HomeOutlined />}
        dataSource={misData.residenceOccupancy || []}
        rowKey="residenceId"
        exportName="Residence_Occupancy"
        columns={[
          { title: 'Residence', dataIndex: 'residence', key: 'residence',
            render: (v, r) => <Typography.Link onClick={() => navigate(`/residences?view=${r.residenceId}`)}>{v}</Typography.Link>,
            sorter: (a, b) => a.residence.localeCompare(b.residence) },
          { title: 'Unit', dataIndex: 'unit', key: 'unit' },
          { title: 'Floors', dataIndex: 'floors', key: 'floors' },
          { title: 'Rooms', dataIndex: 'rooms', key: 'rooms' },
          { title: 'Capacity', dataIndex: 'capacity', key: 'capacity', sorter: (a, b) => a.capacity - b.capacity },
          { title: 'Occupied', dataIndex: 'occupied', key: 'occupied' },
          { title: 'Vacant', dataIndex: 'vacant', key: 'vacant', sorter: (a, b) => a.vacant - b.vacant,
            render: v => <Text strong style={{ color: v > 0 ? '#52c41a' : '#8c8c8c' }}>{v}</Text> },
          { title: 'Occupancy %', dataIndex: 'occupancyPct', key: 'occupancyPct', sorter: (a, b) => a.occupancyPct - b.occupancyPct,
            render: (v, r) => r.setupStatus === 'Configured' ? <Tag color={v >= 90 ? 'success' : v >= 60 ? 'warning' : 'error'}>{v}%</Tag> : '—' },
          { title: 'Full / Partial / Vacant rooms', key: 'roomsplit', render: (_, r) => `${r.fullRooms} / ${r.partialRooms} / ${r.vacantRooms}` },
          { title: 'No room assigned', dataIndex: 'residentsWithoutRoom', key: 'residentsWithoutRoom',
            render: v => v > 0 ? <Tag color="warning">{v}</Tag> : '—' },
          { title: 'Setup', dataIndex: 'setupStatus', key: 'setupStatus',
            render: v => <Tag color={v === 'Configured' ? 'success' : 'warning'}>{v}</Tag> },
        ]}
      />
      <TCard
        title="Room-Level Vacancy"
        icon={<AppstoreOutlined />}
        dataSource={misData.roomVacancy || []}
        rowKey="roomId"
        exportName="Room_Vacancy"
        columns={[
          { title: 'Residence', dataIndex: 'residence', key: 'residence', sorter: (a, b) => a.residence.localeCompare(b.residence) },
          { title: 'Unit', dataIndex: 'unit', key: 'unit',
            filters: [...new Set((misData.roomVacancy || []).map(r => r.unit))].map(u => ({ text: u, value: u })),
            onFilter: (v, r) => r.unit === v },
          { title: 'Floor', dataIndex: 'floor', key: 'floor' },
          { title: 'Room', dataIndex: 'room', key: 'room' },
          { title: 'Type', dataIndex: 'roomType', key: 'roomType' },
          { title: 'Capacity', dataIndex: 'capacity', key: 'capacity' },
          { title: 'Occupied', dataIndex: 'occupied', key: 'occupied' },
          { title: 'Vacant', dataIndex: 'vacant', key: 'vacant', defaultSortOrder: 'descend', sorter: (a, b) => a.vacant - b.vacant,
            render: v => <Text strong style={{ color: v > 0 ? '#52c41a' : '#8c8c8c' }}>{v}</Text> },
          { title: 'Status', dataIndex: 'status', key: 'status',
            filters: ['Full', 'Partially occupied', 'Vacant'].map(v => ({ text: v, value: v })),
            onFilter: (v, r) => r.status === v,
            render: v => <Tag color={ROOM_STATUS_COLOR[v]}>{v}</Tag> },
          { title: 'Occupants', dataIndex: 'occupants', key: 'occupants', ellipsis: true },
        ]}
      />
    </div>
  );

  // ── Workforce Tab ─────────────────────────────────────────────────────────
  const WorkforceContent = () => (
    <div>
      <TCard
        title="Department-Wise Employee Summary"
        icon={<ApartmentOutlined />}
        dataSource={misData.departmentWiseEmployeeSummary || []}
        rowKey="department"
        exportName="Dept_Employee_Summary"
        columns={[
          { title: 'Department', dataIndex: 'department', key: 'department', sorter: (a, b) => a.department.localeCompare(b.department) },
          { title: 'Total', dataIndex: 'totalEmployees', key: 'totalEmployees', sorter: (a, b) => a.totalEmployees - b.totalEmployees, defaultSortOrder: 'descend' },
          { title: 'Active', dataIndex: 'active', key: 'active', render: v => <Tag color="success">{v}</Tag> },
          { title: 'Inactive', dataIndex: 'inactive', key: 'inactive', render: v => v > 0 ? <Tag color="default">{v}</Tag> : <Tag color="success">0</Tag> },
          { title: 'Room Allocated', dataIndex: 'withRoom', key: 'withRoom', render: v => <Tag color="blue">{v}</Tag> },
          { title: 'Residence, No Room', dataIndex: 'residenceOnly', key: 'residenceOnly', render: v => v > 0 ? <Tag color="warning">{v}</Tag> : '0' },
          { title: 'Not Allocated', dataIndex: 'unallocated', key: 'unallocated', render: v => v > 0 ? <Tag color="error">{v}</Tag> : <Tag color="success">0</Tag> },
          {
            title: 'Room Allocation %',
            key: 'allocPct',
            render: (_, r) => {
              const pct = r.active > 0 ? Math.round((r.withRoom / r.active) * 100) : 0;
              return <Tag color={pct >= 90 ? 'success' : pct >= 60 ? 'warning' : 'error'}>{pct}%</Tag>;
            },
          },
        ]}
      />

      <TCard
        title="Designation-Wise Accommodation Analysis"
        icon={<UserOutlined />}
        dataSource={misData.designationWiseSpend || []}
        rowKey="designation"
        exportName="Designation_Analysis"
        columns={[
          { title: 'Designation', dataIndex: 'designation', key: 'designation', sorter: (a, b) => a.designation.localeCompare(b.designation) },
          { title: 'Count', dataIndex: 'count', key: 'count', sorter: (a, b) => a.count - b.count },
          { title: 'Total Monthly Rent', dataIndex: 'totalMonthlyRent', key: 'totalMonthlyRent', render: fmtC, sorter: (a, b) => a.totalMonthlyRent - b.totalMonthlyRent },
          { title: 'Cost Per Head', dataIndex: 'costPerHead', key: 'costPerHead', render: v => typeof v === 'number' ? fmtC(v) : v, sorter: (a, b) => (typeof a.costPerHead === 'number' ? a.costPerHead : 0) - (typeof b.costPerHead === 'number' ? b.costPerHead : 0) },
          { title: 'Grade', dataIndex: 'accommodationGrade', key: 'accommodationGrade', render: v => { const c = v === 'High' ? 'gold' : v === 'Medium' ? 'blue' : 'default'; return <Tag color={c}>{v || '—'}</Tag>; } },
          { title: 'Avg Tenure', dataIndex: 'averageTenureInQuarters', key: 'averageTenureInQuarters' },
        ]}
      />

      <TCard
        title="Employee Master — Full Roster"
        icon={<UserOutlined />}
        dataSource={misData.employeeMasterEnhanced || []}
        rowKey="employeeId"
        exportName="Employee_Master"
        columns={[
          { title: 'Employee ID', dataIndex: 'employeeId', key: 'employeeId', width: 110 },
          { title: 'Name', dataIndex: 'name', key: 'name', sorter: (a, b) => a.name.localeCompare(b.name) },
          { title: 'Department', dataIndex: 'department', key: 'department', sorter: (a, b) => (a.department || '').localeCompare(b.department || '') },
          { title: 'Designation', dataIndex: 'designation', key: 'designation', ellipsis: true },
          { title: 'Status', dataIndex: 'status', key: 'status', render: v => <STag v={v} /> },
          { title: 'Allocation', dataIndex: 'allocationStatus', key: 'allocationStatus',
            render: v => v === '—' ? <Text type="secondary">—</Text> : <Tag color={v === 'Room allocated' ? 'blue' : v === 'Room not assigned' ? 'warning' : 'error'}>{v}</Tag> },
          { title: 'Residence', dataIndex: 'allocatedResidenceId', key: 'allocatedResidenceId', render: v => v === '—' ? <Text type="secondary">—</Text> : v },
          { title: 'Room', dataIndex: 'room', key: 'room' },
          { title: 'Renewal Due', dataIndex: 'renewalDue', key: 'renewalDue', render: fmtD },
          { title: 'Last Working Date', dataIndex: 'lastWorkingDate', key: 'lastWorkingDate', render: fmtD },
        ]}
      />
    </div>
  );

  // ── Financial Tab ─────────────────────────────────────────────────────────
  const FinancialContent = () => (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card title="Advance & Security Deposit Status" size="small">
            {advanceData.length > 0
              ? <Column {...advanceConfig} height={260} />
              : <div style={{ textAlign: 'center', padding: 40, color: '#8c8c8c' }}>No advance data</div>}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Renewal & Compliance Alerts" size="small">
            {renewalAlertData.length > 0
              ? <Column {...renewalConfig} height={260} />
              : <div style={{ textAlign: 'center', padding: 60 }}>
                  <Text style={{ color: '#52c41a', fontSize: 15 }}>✓ All renewals on track — no alerts</Text>
                </div>}
          </Card>
        </Col>
      </Row>

      <TCard
        title="Departmental Expense Matrix"
        icon={<DollarOutlined />}
        dataSource={misData.departmentalExpenseMatrix || []}
        rowKey="department"
        exportName="Dept_Expense_Matrix"
        columns={[
          { title: 'Department', dataIndex: 'department', key: 'department', sorter: (a, b) => a.department.localeCompare(b.department) },
          { title: 'Resident Count', dataIndex: 'totalResidentCount', key: 'totalResidentCount', sorter: (a, b) => a.totalResidentCount - b.totalResidentCount },
          { title: 'Monthly Rent', dataIndex: 'cumulativeMonthlyRent', key: 'cumulativeMonthlyRent', render: fmtC, sorter: (a, b) => a.cumulativeMonthlyRent - b.cumulativeMonthlyRent, defaultSortOrder: 'descend' },
          { title: 'Cost Per Head', dataIndex: 'costPerHead', key: 'costPerHead', render: v => typeof v === 'number' ? fmtC(v) : v, sorter: (a, b) => (typeof a.costPerHead === 'number' ? a.costPerHead : 0) - (typeof b.costPerHead === 'number' ? b.costPerHead : 0) },
          { title: 'Budget Variance', dataIndex: 'budgetVariance', key: 'budgetVariance' },
        ]}
      />

      <TCard
        title="Cost by Property"
        icon={<HomeOutlined />}
        dataSource={misData.costByProperty || []}
        rowKey={(r, i) => `${r.residenceId}-${i}`}
        exportName="Cost_By_Property"
        columns={[
          { title: 'Residence', dataIndex: 'residenceId', key: 'residenceId' },
          { title: 'Owner', dataIndex: 'ownerName', key: 'ownerName', sorter: (a, b) => (a.ownerName || '').localeCompare(b.ownerName || '') },
          { title: 'Address', dataIndex: 'address', key: 'address', ellipsis: true },
          { title: 'Unit', dataIndex: 'unit', key: 'unit' },
          { title: 'Occupants', dataIndex: 'occupants', key: 'occupants' },
          { title: 'Capacity', dataIndex: 'capacity', key: 'capacity' },
          { title: 'Monthly Rent', dataIndex: 'monthlyRent', key: 'monthlyRent', render: fmtC, sorter: (a, b) => a.monthlyRent - b.monthlyRent, defaultSortOrder: 'descend' },
          { title: 'Advance Locked', dataIndex: 'advanceLocked', key: 'advanceLocked', render: fmtC },
          { title: 'Cost / Occupant', dataIndex: 'costPerHead', key: 'costPerHead', render: v => typeof v === 'number' ? fmtC(v) : v },
          { title: 'Cost / Bed', dataIndex: 'costPerBed', key: 'costPerBed', render: v => typeof v === 'number' ? fmtC(v) : v },
        ]}
      />

      <TCard
        title="Landlord / Owner Portfolio"
        icon={<BankOutlined />}
        dataSource={misData.byOwnerLandlord || []}
        rowKey="ownerName"
        exportName="Landlord_Summary"
        columns={[
          { title: 'Owner Name', dataIndex: 'ownerName', key: 'ownerName', sorter: (a, b) => a.ownerName.localeCompare(b.ownerName) },
          { title: 'Properties', dataIndex: 'propertyCount', key: 'propertyCount', sorter: (a, b) => a.propertyCount - b.propertyCount },
          { title: 'Active Agreements', dataIndex: 'activeAgreements', key: 'activeAgreements', sorter: (a, b) => a.activeAgreements - b.activeAgreements, defaultSortOrder: 'descend' },
          { title: 'Monthly Rent', dataIndex: 'totalMonthlyRent', key: 'totalMonthlyRent', render: fmtC, sorter: (a, b) => a.totalMonthlyRent - b.totalMonthlyRent },
          { title: 'Advance Locked', dataIndex: 'totalAdvanceLocked', key: 'totalAdvanceLocked', render: fmtC },
          { title: 'Refund Outstanding', dataIndex: 'refundOutstanding', key: 'refundOutstanding', render: v => v > 0 ? <Text style={{ color: '#f5222d' }}>{fmtC(v)}</Text> : fmtC(v) },
          { title: 'Rating', dataIndex: 'landlordRating', key: 'landlordRating', render: v => v && v !== '—' ? <Tag color="gold">{v}</Tag> : <Text type="secondary">—</Text> },
          { title: 'Status', dataIndex: 'status', key: 'status', render: v => <STag v={v} /> },
        ]}
      />

      <TCard
        title="Agreement ROI Ledger"
        icon={<FileTextOutlined />}
        dataSource={misData.agreementROILedger || []}
        rowKey="agreementId"
        exportName="Agreement_ROI_Ledger"
        columns={[
          { title: 'Landlord', dataIndex: 'landlordName', key: 'landlordName' },
          { title: 'Agreement ID', dataIndex: 'agreementId', key: 'agreementId' },
          { title: 'Advance Due Back', dataIndex: 'advanceDueBack', key: 'advanceDueBack', render: fmtC },
          { title: 'Advance Received', dataIndex: 'advanceReceived', key: 'advanceReceived', render: fmtC },
          { title: 'Recovery Status', dataIndex: 'advanceRecoveryStatus', key: 'advanceRecoveryStatus', render: v => <STag v={v} /> },
          { title: 'Maintenance Efficiency', dataIndex: 'maintenanceEfficiency', key: 'maintenanceEfficiency' },
        ]}
      />
    </div>
  );

  // ── Compliance Tab ────────────────────────────────────────────────────────
  const ComplianceContent = () => (
    <div>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { label: 'Renewals Past Due', value: pastDue, color: pastDue > 0 ? '#f5222d' : '#52c41a', sub: pastDue > 0 ? 'Immediate action' : 'All on track', clickFn: pastDue > 0 ? () => navigate('/agreements?filter=pastDue') : null },
          { label: 'Renewals Due (90d)', value: dueSoon, color: dueSoon > 0 ? '#faad14' : '#52c41a', sub: dueSoon > 0 ? 'Plan renewals' : 'None due soon', clickFn: dueSoon > 0 ? () => navigate('/agreements?filter=due90') : null },
          { label: 'Scheduled to Vacate', value: totalScheduledToVacate, color: '#1890ff', sub: 'Plan transitions' },
          { label: 'Leaving ≤30 Days', value: leavingIn30Days, color: leavingIn30Days > 0 ? '#eb2f96' : '#52c41a', sub: leavingIn30Days > 0 ? 'Urgent transitions' : 'None imminent' },
        ].map(({ label, value, color, sub, clickFn }) => (
          <Col xs={12} md={6} key={label}>
            <Card size="small" style={{ borderTop: `3px solid ${color}`, textAlign: 'center', cursor: clickFn ? 'pointer' : 'default' }} hoverable={!!clickFn} onClick={clickFn}>
              <div style={{ fontSize: 30, fontWeight: 800, color }}>{value}</div>
              <div style={{ fontSize: 12, color: '#595959', fontWeight: 600 }}>{label}</div>
              <div style={{ fontSize: 11, color: '#8c8c8c' }}>{sub}</div>
            </Card>
          </Col>
        ))}
      </Row>

      <TCard
        title="Renewals PAST DUE — Immediate HR Action Required"
        icon={<WarningOutlined style={{ color: '#f5222d' }} />}
        dataSource={misData.renewalsPastDue || []}
        rowKey="agreementId"
        exportName="Renewals_Past_Due"
        columns={[
          { title: 'Agreement ID', dataIndex: 'agreementId', key: 'agreementId' },
          { title: 'Residence', dataIndex: 'residenceId', key: 'residenceId' },
          { title: 'Employee', dataIndex: 'employee', key: 'employee' },
          { title: 'Renewal Due Date', dataIndex: 'renewalDueDate', key: 'renewalDueDate', render: fmtD, sorter: (a, b) => (a.renewalDueDate || '').localeCompare(b.renewalDueDate || '') },
          { title: 'Days Past Due', dataIndex: 'daysPastDue', key: 'daysPastDue', render: v => <Tag color="error">{v} days</Tag>, sorter: (a, b) => b.daysPastDue - a.daysPastDue, defaultSortOrder: 'descend' },
          { title: 'Monthly Rent', dataIndex: 'monthlyRent', key: 'monthlyRent', render: fmtC },
        ]}
      />

      <TCard
        title="Renewals Due in Next 90 Days — Plan Now"
        icon={<CalendarOutlined style={{ color: '#faad14' }} />}
        dataSource={misData.renewalsDueSoon || []}
        rowKey="agreementId"
        exportName="Renewals_Due_Soon"
        columns={[
          { title: 'Agreement ID', dataIndex: 'agreementId', key: 'agreementId' },
          { title: 'Residence', dataIndex: 'residenceId', key: 'residenceId' },
          { title: 'Employee', dataIndex: 'employee', key: 'employee' },
          { title: 'Renewal Due Date', dataIndex: 'renewalDueDate', key: 'renewalDueDate', render: fmtD, sorter: (a, b) => (a.renewalDueDate || '').localeCompare(b.renewalDueDate || '') },
          { title: 'Days Until Due', dataIndex: 'daysUntilDue', key: 'daysUntilDue', render: v => <Tag color={v <= 30 ? 'error' : v <= 60 ? 'warning' : 'processing'}>{v} days</Tag>, sorter: (a, b) => a.daysUntilDue - b.daysUntilDue, defaultSortOrder: 'ascend' },
          { title: 'Monthly Rent', dataIndex: 'monthlyRent', key: 'monthlyRent', render: fmtC },
        ]}
      />

      <TCard
        title="Compliance & Renewal Risk Register"
        icon={<SafetyCertificateOutlined />}
        dataSource={misData.complianceRenewalRisk || []}
        rowKey="agreementId"
        exportName="Compliance_Risk_Register"
        columns={[
          { title: 'Agreement ID', dataIndex: 'agreementId', key: 'agreementId' },
          { title: 'Residence', dataIndex: 'residenceId', key: 'residenceId' },
          { title: 'Employee', dataIndex: 'employee', key: 'employee' },
          { title: 'Renewal Due', dataIndex: 'renewalDueDate', key: 'renewalDueDate', render: fmtD },
          { title: 'Notice Deadline', dataIndex: 'noticePeriodRequirement', key: 'noticePeriodRequirement', render: fmtD },
          { title: 'Statutory Status', dataIndex: 'statutoryStatus', key: 'statutoryStatus', render: v => <STag v={v} /> },
          { title: 'Document Location', dataIndex: 'documentLocation', key: 'documentLocation', ellipsis: true },
        ]}
      />
    </div>
  );

  // ── Pipeline Tab ──────────────────────────────────────────────────────────
  const PipelineContent = () => (
    <div>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { label: 'Leaving ≤30 Days', value: leavingIn30Days, color: leavingIn30Days > 0 ? '#f5222d' : '#52c41a' },
          { label: 'Leaving ≤60 Days', value: leavingIn60Days, color: leavingIn60Days > 0 ? '#faad14' : '#52c41a' },
          { label: 'Leaving ≤90 Days', value: leavingIn90Days, color: '#1890ff' },
          { label: 'Properties Available (90d)', value: (misData.propertiesBecomingAvailable || []).length, color: '#722ed1' },
        ].map(({ label, value, color }) => (
          <Col xs={12} md={6} key={label}>
            <Card size="small" style={{ borderTop: `3px solid ${color}`, textAlign: 'center' }}>
              <div style={{ fontSize: 30, fontWeight: 800, color }}>{value}</div>
              <div style={{ fontSize: 12, color: '#595959' }}>{label}</div>
            </Card>
          </Col>
        ))}
      </Row>

      <TCard
        title="Employees Leaving Soon (Next 60 Days)"
        icon={<UserOutlined />}
        dataSource={misData.upcomingVacancyReplacementTracker || []}
        rowKey={(r, i) => `${r.employeeName}-${i}`}
        exportName="Employees_Leaving_Soon"
        columns={[
          { title: 'Employee', dataIndex: 'employeeName', key: 'employeeName' },
          { title: 'Department', dataIndex: 'department', key: 'department' },
          { title: 'Last Working Date', dataIndex: 'projectedLWD', key: 'projectedLWD', render: fmtD, sorter: (a, b) => (a.projectedLWD || '').localeCompare(b.projectedLWD || ''), defaultSortOrder: 'ascend' },
          { title: 'Days Left', dataIndex: 'daysLeft', key: 'daysLeft', render: v => <Tag color={v <= 14 ? 'error' : v <= 30 ? 'warning' : 'processing'}>{v}d</Tag>, sorter: (a, b) => a.daysLeft - b.daysLeft },
          { title: 'Notice Status', dataIndex: 'noticeStatus', key: 'noticeStatus' },
          { title: 'Allocated Residence', dataIndex: 'allocatedResidence', key: 'allocatedResidence', ellipsis: true },
        ]}
      />

      <TCard
        title="Properties Becoming Available (Next 90 Days)"
        icon={<HomeOutlined />}
        dataSource={misData.propertiesBecomingAvailable || []}
        rowKey="agreementId"
        exportName="Properties_Becoming_Available"
        columns={[
          { title: 'Residence ID', dataIndex: 'residenceId', key: 'residenceId' },
          { title: 'Owner', dataIndex: 'ownerName', key: 'ownerName' },
          { title: 'Vacate Date', dataIndex: 'vacateDate', key: 'vacateDate', render: fmtD, sorter: (a, b) => (a.vacateDate || '').localeCompare(b.vacateDate || '') },
          { title: 'Days Until Available', dataIndex: 'daysUntilAvailable', key: 'daysUntilAvailable', render: v => <Tag color={v <= 14 ? 'error' : v <= 30 ? 'warning' : 'processing'}>{v}d</Tag>, sorter: (a, b) => a.daysUntilAvailable - b.daysUntilAvailable, defaultSortOrder: 'ascend' },
          { title: 'Current Employee', dataIndex: 'currentEmployee', key: 'currentEmployee' },
          { title: 'Department', dataIndex: 'department', key: 'department' },
        ]}
      />

      <TCard
        title="Replacement Planning Summary"
        icon={<ApartmentOutlined />}
        dataSource={misData.replacementPlanningSummary || []}
        rowKey={(r) => `${r.residenceId}-${r.vacateDate || ''}`}
        exportName="Replacement_Planning"
        columns={[
          { title: 'Residence', dataIndex: 'residenceId', key: 'residenceId' },
          { title: 'Owner', dataIndex: 'owner', key: 'owner' },
          { title: 'Outgoing Employee', dataIndex: 'outgoingEmployee', key: 'outgoingEmployee' },
          { title: 'Department', dataIndex: 'department', key: 'department' },
          { title: 'Last Working Date', dataIndex: 'lastWorkingDate', key: 'lastWorkingDate', render: fmtD },
          { title: 'Vacate Date', dataIndex: 'vacateDate', key: 'vacateDate', render: fmtD, sorter: (a, b) => (a.vacateDate || '').localeCompare(b.vacateDate || '') },
          { title: 'Advance Due Back', dataIndex: 'advanceDueBack', key: 'advanceDueBack', render: fmtC },
          { title: 'Action', dataIndex: 'suggestedAction', key: 'suggestedAction' },
        ]}
      />

      <TCard
        title="Scheduled to Vacate"
        icon={<WarningOutlined />}
        dataSource={misData.scheduledToVacate || []}
        rowKey="agreementId"
        exportName="Scheduled_To_Vacate"
        columns={[
          { title: 'Agreement ID', dataIndex: 'agreementId', key: 'agreementId' },
          { title: 'Employee', dataIndex: 'employee', key: 'employee' },
          { title: 'Residence', dataIndex: 'residence', key: 'residence' },
          { title: 'Vacate Date', dataIndex: 'vacateDate', key: 'vacateDate', render: fmtD, sorter: (a, b) => (a.vacateDate || '').localeCompare(b.vacateDate || '') },
          { title: 'Advance Due Back', dataIndex: 'advanceDueBack', key: 'advanceDueBack', render: fmtC },
          { title: 'Advance Received', dataIndex: 'advanceReceived', key: 'advanceReceived', render: fmtC },
          { title: 'Status', dataIndex: 'status', key: 'status', render: v => <STag v={v} /> },
        ]}
      />
    </div>
  );

  // ── Advances Tab ──────────────────────────────────────────────────────────
  const AdvancesContent = () => (
    <div>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { label: 'Advance Locked', value: fmtC(totalAdvanceLocked), color: '#E87103', sub: 'Active agreements (incl. vacating)' },
          { label: 'Refund Outstanding', value: fmtC(totalAdvancePending), color: totalAdvancePending > 0 ? '#f5222d' : '#52c41a', sub: `${refundCasesOpen} vacated agreements open` },
          { label: 'Received Back', value: fmtC(totalNetReceived), color: '#52c41a', sub: 'Recorded receipts' },
          { label: 'Landlord Deductions', value: fmtC(totalRefundDeductions), color: '#faad14', sub: `Upcoming: ${fmtC(totalRefundUpcoming)}` },
        ].map(({ label, value, color, sub }) => (
          <Col xs={12} md={6} key={label}>
            <Card size="small" style={{ borderTop: `3px solid ${color}`, cursor: 'pointer' }} hoverable onClick={() => navigate('/refunds')}>
              <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
              <div style={{ fontSize: 12, color: '#595959', fontWeight: 600 }}>{label}</div>
              <div style={{ fontSize: 11, color: '#8c8c8c' }}>{sub}</div>
            </Card>
          </Col>
        ))}
      </Row>

      <TCard
        title="Refund Pipeline — Vacated & Vacating Agreements"
        icon={<BankOutlined />}
        dataSource={misData.advancePipeline || []}
        rowKey="agreementId"
        exportName="Advance_Refund_Pipeline"
        extraContent={<div style={{ marginBottom: 8 }}><Button size="small" type="link" onClick={() => navigate('/refunds')}>Manage refunds →</Button></div>}
        columns={[
          { title: 'Agreement', dataIndex: 'agreementId', key: 'agreementId' },
          { title: 'Residence', dataIndex: 'residence', key: 'residence' },
          { title: 'Landlord', dataIndex: 'residenceLandlord', key: 'residenceLandlord' },
          { title: 'Vacated', dataIndex: 'vacateDate', key: 'vacateDate', render: fmtD },
          { title: 'Due Back', dataIndex: 'advanceDueBack', key: 'advanceDueBack', render: fmtC },
          { title: 'Deductions', dataIndex: 'deductions', key: 'deductions', render: fmtC },
          { title: 'Expected', dataIndex: 'expectedRefund', key: 'expectedRefund', render: fmtC },
          { title: 'Received', dataIndex: 'advanceReceived', key: 'advanceReceived', render: fmtC },
          { title: 'Outstanding', dataIndex: 'pending', key: 'pending', render: v => v > 0 ? <Text style={{ color: '#f5222d', fontWeight: 600 }}>{fmtC(v)}</Text> : <Text style={{ color: '#52c41a' }}>₹0</Text>, sorter: (a, b) => b.pending - a.pending },
          { title: 'Status', dataIndex: 'status', key: 'status', render: v => <STag v={v} /> },
        ]}
      />
    </div>
  );

  // ── Property Utilization Tab ──────────────────────────────────────────────
  const PropertyContent = () => (
    <div>
      <TCard
        title="Property Utilization & Opportunity Cost"
        icon={<HomeOutlined />}
        dataSource={misData.propertyUtilizationOpportunityCost || []}
        rowKey="residenceId"
        exportName="Property_Utilization"
        columns={[
          { title: 'Residence ID', dataIndex: 'residenceId', key: 'residenceId' },
          { title: 'Address', dataIndex: 'address', key: 'address', ellipsis: true },
          { title: 'Capacity (Beds)', dataIndex: 'capacity', key: 'capacity', sorter: (a, b) => a.capacity - b.capacity },
          { title: 'Occupied', dataIndex: 'occupancy', key: 'occupancy', sorter: (a, b) => a.occupancy - b.occupancy },
          { title: 'Vacant', dataIndex: 'vacant', key: 'vacant', sorter: (a, b) => a.vacant - b.vacant },
          {
            title: 'Occupancy %',
            dataIndex: 'occupancyPct',
            key: 'pct',
            render: (v, r) => r.capacity > 0 ? <Tag color={v >= 100 ? 'success' : v >= 50 ? 'warning' : 'error'}>{v}%</Tag> : '—',
          },
          { title: 'Monthly Rent', dataIndex: 'monthlyRent', key: 'monthlyRent', render: fmtC },
          { title: 'Cost of Vacant Beds / Month', dataIndex: 'vacancyCost', key: 'vacancyCost', render: v => v > 0 ? <Text style={{ color: '#f5222d' }}>{fmtC(v)}</Text> : '—',
            sorter: (a, b) => a.vacancyCost - b.vacancyCost },
          { title: 'Suggestion', dataIndex: 'optimizationSuggestion', key: 'optimizationSuggestion', ellipsis: true },
        ]}
      />
    </div>
  );

  // ── Unit-Wise Content ──────────────────────────────────────────────────────
  const UnitContent = () => {
    const unitCols = [
      { title: 'Unit', dataIndex: 'unit', key: 'unit' },
      { title: 'Residences', dataIndex: 'residences', key: 'residences' },
      { title: 'Rooms', dataIndex: 'rooms', key: 'rooms' },
      { title: 'Bed Capacity', dataIndex: 'capacity', key: 'capacity' },
      { title: 'Occupied', dataIndex: 'occupied', key: 'occupied' },
      { title: 'Vacant', dataIndex: 'vacant', key: 'vacant', render: v => <Text strong style={{ color: v > 0 ? '#52c41a' : '#8c8c8c' }}>{v}</Text> },
      { title: 'Occupancy %', dataIndex: 'occupancyPct', key: 'occupancyPct', render: (v, r) => r.capacity > 0 ? `${v}%` : '—' },
      { title: 'Employees', dataIndex: 'employees', key: 'employees', sorter: (a,b) => a.employees - b.employees },
      { title: 'Room Allocated', dataIndex: 'employeesWithRoom', key: 'employeesWithRoom' },
      { title: 'Active Agreements', dataIndex: 'agreements', key: 'agreements' },
      { title: 'Monthly Rent', dataIndex: 'rent', key: 'rent', render: (v) => fmtCFull(v), sorter: (a,b) => a.rent - b.rent },
      { title: 'Cost per Employee', dataIndex: 'costPerEmployee', key: 'cpe', render: (v, r) => r.employees > 0 ? fmtCFull(v) : '—' },
    ];
    const unitBarData = unitBreakdown.map(u => ({ unit: u.unit.length > 14 ? u.unit.substring(0,14)+'…' : u.unit, employees: u.employees, rent: u.rent }));
    return (
      <div>
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          {unitBreakdown.map(u => (
            <Col xs={12} sm={8} md={6} key={u.unit}>
              <Card size="small" style={{ borderTop: '3px solid #1890ff' }} bodyStyle={{ padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: '#595959', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{u.unit}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#1890ff' }}>{u.capacity > 0 ? `${u.occupancyPct}%` : '—'} <span style={{ fontSize: 12, color: '#8c8c8c', fontWeight: 400 }}>occupancy</span></div>
                <div style={{ fontSize: 12, color: '#595959' }}>{u.occupied}/{u.capacity} beds · {u.vacant} vacant</div>
                <div style={{ fontSize: 12, color: '#52c41a' }}>{fmtC(u.rent)} / month · {u.employees} employees</div>
              </Card>
            </Col>
          ))}
        </Row>
        {unitBarData.length > 0 && (
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} md={12}>
              <Card title="Unit-Wise Employee Count" size="small">
                <Column data={unitBarData} xField="unit" yField="employees" color="#1890ff" columnWidthRatio={0.55}
                  label={{ position: 'top', style: { fill: '#262626', fontSize: 11, fontWeight: 700 } }}
                  yAxis={{ min: 0 }} meta={{ employees: { min: 0 } }}
                  height={260}
                  tooltip={{ formatter: (d) => ({ name: 'Employees', value: d.employees }) }} />
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card title="Unit-Wise Monthly Rent" size="small">
                <Column data={unitBarData} xField="unit" yField="rent" color="#E87103" columnWidthRatio={0.55}
                  label={{ position: 'top', style: { fill: '#262626', fontSize: 10, fontWeight: 700 }, formatter: safeRentFmt }}
                  yAxis={{ min: 0, label: { formatter: (v) => { const n = parseFloat(v)||0; return n>=100000?`₹${(n/100000).toFixed(0)}L`:`₹${(n/1000).toFixed(0)}K`; } } }}
                  meta={{ rent: { min: 0 } }}
                  height={260}
                  tooltip={{ formatter: (d) => ({ name: 'Rent', value: `₹${Number(d.rent).toLocaleString('en-IN')}` }) }} />
              </Card>
            </Col>
          </Row>
        )}
        <TCard
          title="Unit-Wise Summary Table"
          icon={<AppstoreOutlined />}
          dataSource={unitBreakdown}
          rowKey="unit"
          exportName="Unit_Wise_Summary"
          columns={unitCols}
        />
      </div>
    );
  };

  // ── Tabs definition ──────────────────────────────────────────────────────
  const tabItems = [
    {
      key: 'overview',
      label: <span><DashboardOutlined /> Overview</span>,
      children: <OverviewContent />,
    },
    {
      key: 'occupancy',
      label: <span><ApartmentOutlined /> Occupancy &amp; Vacancy</span>,
      children: <OccupancyContent />,
    },
    {
      key: 'workforce',
      label: <span><TeamOutlined /> Workforce</span>,
      children: <WorkforceContent />,
    },
    {
      key: 'financial',
      label: <span><DollarOutlined /> Financial</span>,
      children: <FinancialContent />,
    },
    {
      key: 'compliance',
      label: (
        <span>
          <SafetyCertificateOutlined /> Compliance
          {pastDue > 0 && <Tag color="error" style={{ marginLeft: 6, fontSize: 10, padding: '0 4px' }}>{pastDue}</Tag>}
        </span>
      ),
      children: <ComplianceContent />,
    },
    {
      key: 'pipeline',
      label: (
        <span>
          <CalendarOutlined /> Pipeline
          {leavingIn30Days > 0 && <Tag color="warning" style={{ marginLeft: 6, fontSize: 10, padding: '0 4px' }}>{leavingIn30Days}</Tag>}
        </span>
      ),
      children: <PipelineContent />,
    },
    {
      key: 'advances',
      label: <span><BankOutlined /> Advances & Refunds</span>,
      children: <AdvancesContent />,
    },
    {
      key: 'properties',
      label: <span><HomeOutlined /> Properties</span>,
      children: <PropertyContent />,
    },
    {
      key: 'units',
      label: <span><AppstoreOutlined /> Unit-Wise</span>,
      children: <UnitContent />,
    },
  ];

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ paddingBottom: 48 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>HR Accommodation Dashboard</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>Report Date: {misData.reportDate || '—'}</Text>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading} size="small">
            Refresh
          </Button>
          <Dropdown
            menu={{
              items: [
                { key: 'fullMIS',       label: 'Full MIS Report (Multi-sheet)', icon: <FileExcelOutlined /> },
                { type: 'divider' },
                { key: 'allAgreements', label: 'All Agreements',                icon: <FileExcelOutlined /> },
                { key: 'allResidences', label: 'All Residences',                icon: <FileExcelOutlined /> },
                { key: 'allEmployees',  label: 'All Employees',                 icon: <FileExcelOutlined /> },
              ],
              onClick: handleBulkExport,
            }}
            trigger={['click']}
          >
            <Button type="primary" icon={<DownloadOutlined />}>Export Reports</Button>
          </Dropdown>
        </Space>
      </div>

      {/* ── How the figures are calculated ── */}
      <Collapse
        size="small"
        style={{ marginBottom: 12, background: '#fff' }}
        items={[{
          key: 'defs',
          label: <Space><InfoCircleOutlined style={{ color: '#1890ff' }} /><Text style={{ fontSize: 12 }}>How these figures are calculated</Text></Space>,
          children: (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#595959' }}>
              <li><b>Occupancy %</b> = occupied beds ÷ total bed capacity of rooms in active residences. Room capacity is set on each room (Residences → Floors &amp; Rooms).</li>
              <li><b>Vacant</b> is counted per room: capacity − occupied. Residences without rooms set up are listed separately and are not in the occupancy %.</li>
              <li><b>Room allocated</b> = active employee holding a bed. <b>Residence, no room</b> = linked to a residence's agreement but no room assigned yet. <b>Not allocated</b> = neither. These three add up to active employees.</li>
              <li><b>Monthly rent</b> = rent of active agreements. Department/unit rent splits each agreement's rent equally across its occupants, so the totals add up to the real rent bill.</li>
              <li><b>Advance locked</b> = advances on active agreements. <b>Refund outstanding</b> = for vacated agreements, (due back − landlord deductions) − amounts received. Vacating agreements are shown as <b>upcoming</b>, not pending.</li>
            </ul>
          ),
        }]}
      />

      {/* ── Alert banners ── */}
      {bedsHeldByInactive > 0 && (
        <Alert
          type="error" showIcon closable
          message={<><strong>{bedsHeldByInactive} bed{bedsHeldByInactive > 1 ? 's are' : ' is'}</strong> still held by inactive employees — vacate them so occupancy is correct</>}
          action={<Button size="small" danger onClick={() => navigate('/rooms')}>Review</Button>}
          style={{ marginBottom: 8 }}
        />
      )}
      {pastDue > 0 && (
        <Alert
          type="error" showIcon closable
          message={<><strong>{pastDue} agreement{pastDue > 1 ? 's' : ''}</strong> have renewals PAST DUE — immediate HR action required</>}
          action={<Button size="small" danger onClick={() => navigate('/agreements?filter=pastDue')}>View</Button>}
          style={{ marginBottom: 8 }}
        />
      )}
      {leavingIn30Days > 0 && (
        <Alert
          type="warning" showIcon closable
          message={<><strong>{leavingIn30Days} employee{leavingIn30Days > 1 ? 's' : ''}</strong> leaving within 30 days — plan accommodation transitions now</>}
          style={{ marginBottom: 8 }}
        />
      )}
      {residencesWithoutStructure > 0 && (
        <Alert
          type="info" showIcon closable
          message={<><strong>{residencesWithoutStructure} active residence{residencesWithoutStructure > 1 ? 's have' : ' has'}</strong> no floors/rooms set up — their beds are not yet counted in occupancy</>}
          action={<Button size="small" onClick={() => setActiveTab('occupancy')}>See which</Button>}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* ── KPI ROW 1: Occupancy (room level) ── */}
      <SLabel>Occupancy (room level)</SLabel>
      <Row gutter={[10, 10]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8} md={4}>
          <KCard title="Bed Occupancy" value={bedOccupancyPct} suffix="%"
            color={bedOccupancyPct >= 80 ? '#52c41a' : bedOccupancyPct >= 60 ? '#faad14' : '#f5222d'}
            sub={`${occupiedBeds} of ${totalBeds} beds filled`} />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <KCard title="Bed Capacity" value={totalBeds} color="#262626"
            sub={`${totalRooms} rooms configured`} />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <KCard title="Vacant Beds" value={availableBeds}
            color={availableBeds > 0 ? '#52c41a' : '#8c8c8c'}
            sub={`In ${roomsWithVacancy} rooms — click for detail`}
            clickFn={() => openAvailModal('rooms')} />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <KCard title="Rooms Full / Partial / Vacant" value={`${fullRooms} / ${partialRooms} / ${vacantRooms}`} color="#722ed1"
            sub="Click to view by room" clickFn={() => setActiveTab('occupancy')} />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <KCard title="Residences" value={activeResidences} color="#1890ff"
            sub={`${occupiedResidences} occupied · ${vacantResidences} empty · ${inactiveResidences} inactive`}
            clickFn={() => openAvailModal('properties')} />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <KCard title="Room Setup Pending" value={residencesWithoutStructure}
            color={residencesWithoutStructure > 0 ? '#faad14' : '#52c41a'}
            sub={residencesWithoutStructure > 0 ? 'Residences without rooms' : 'All residences set up'}
            clickFn={() => setActiveTab('occupancy')} />
        </Col>
      </Row>

      {/* ── KPI ROW 2: Workforce ── */}
      <SLabel>Workforce</SLabel>
      <Row gutter={[10, 10]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8} md={4}>
          <KCard title="Active Employees" value={activeEmployees} color="#262626"
            sub={`${totalEmployees} total incl. inactive`} />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <KCard title="Room Allocated" value={employeesWithRoom} color="#1890ff"
            sub={`${activeEmployees > 0 ? Math.round((employeesWithRoom / activeEmployees) * 100) : 0}% of active`} />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <KCard title="Residence, No Room" value={employeesResidenceOnly}
            color={employeesResidenceOnly > 0 ? '#faad14' : '#52c41a'}
            sub="Assign a room" />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <KCard title="Not Allocated" value={unallocatedEmployees}
            color={unallocatedEmployees > 0 ? '#f5222d' : '#52c41a'}
            sub="Active, no accommodation" />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <KCard title="Inactive" value={inactiveEmployees} color="#8c8c8c" />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <KCard title="Leaving ≤30 Days" value={leavingIn30Days}
            color={leavingIn30Days > 0 ? '#f5222d' : '#52c41a'}
            sub={`${leavingIn60Days} in 60d · ${leavingIn90Days} in 90d`} />
        </Col>
      </Row>

      {/* ── KPI ROW 3: Financials ── */}
      <SLabel>Financials</SLabel>
      <Row gutter={[10, 10]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={8} md={4}>
          <KCard title="Monthly Rent" value={fmtC(totalMonthlyRent)} color="#52c41a" sub="Active agreements" />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <KCard title="Advance Locked" value={fmtC(totalAdvanceLocked)} color="#E87103" sub="Deposits on active agreements" />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <KCard title="Refund Outstanding" value={fmtC(totalAdvancePending)}
            color={totalAdvancePending > 0 ? '#f5222d' : '#52c41a'}
            sub={totalAdvancePending > 0 ? `${refundCasesOpen} vacated — click to follow up` : 'None pending'}
            clickFn={() => navigate('/refunds')} />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <KCard title="Refund Received" value={fmtC(totalNetReceived)} color="#1890ff"
            sub={totalRefundUpcoming > 0 ? `${fmtC(totalRefundUpcoming)} upcoming from vacating` : 'Recorded receipts'}
            clickFn={() => navigate('/refunds')} />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <KCard title="Past Due Renewals" value={pastDue}
            color={pastDue > 0 ? '#f5222d' : '#52c41a'}
            sub={pastDue > 0 ? 'Click to view' : 'All on track'}
            clickFn={() => navigate('/agreements?filter=pastDue')} />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <KCard title="Due in 90 Days" value={dueSoon}
            color={dueSoon > 5 ? '#faad14' : '#52c41a'}
            sub="Click to plan"
            clickFn={() => navigate('/agreements?filter=due90')} />
        </Col>
      </Row>

      {/* ── Tabs ── */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        type="card"
        size="small"
        items={tabItems}
        style={{ background: '#fff', borderRadius: 8 }}
      />

      {/* ── Availability Detail Modal ── */}
      <Modal
        title={<Space><ShopOutlined />{availModal.title}</Space>}
        open={availModal.open}
        onCancel={() => setAvailModal({ open: false, type: null, title: '' })}
        footer={<Button onClick={() => setAvailModal({ open: false, type: null, title: '' })}>Close</Button>}
        width={820}
        destroyOnClose
      >
        {availDetailLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" tip="Loading…" /></div>
        ) : (
          <div>
            {availModal.type === 'properties' && (
              <div>
                {availDetail.filter(p => (p.totalBeds - p.occupiedBeds > 0) || p.rooms.length === 0).length === 0
                  ? <Alert type="success" message="No vacant properties at this time." showIcon />
                  : availDetail
                      .filter(p => p.vacantBeds > 0 || p.rooms.length === 0)
                      .map(p => (
                        <Card key={p.residence_id} size="small" style={{ marginBottom: 10, borderLeft: '4px solid #52c41a' }}>
                          <Space style={{ justifyContent: 'space-between', width: '100%', flexWrap: 'wrap' }}>
                            <div>
                              <Text strong>{p.name}</Text>
                              {p.address && <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>{p.address}</Text>}
                            </div>
                            <Space size="small">
                              {p.structureConfigured ? (
                                <>
                                  <Tag color="green">{p.vacantBeds} vacant beds</Tag>
                                  <Tag color="blue">{p.totalBeds} total · {p.occupancyPct}% occupied</Tag>
                                </>
                              ) : <Tag color="warning">Room setup pending</Tag>}
                              <Button size="small" type="link" onClick={() => navigate(`/residences?view=${p.residence_id}`)}>Open</Button>
                            </Space>
                          </Space>
                          {p.owner && <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 4 }}>Owner: {p.owner} {p.owner_contact ? `· ${p.owner_contact}` : ''}</div>}
                        </Card>
                      ))}
              </div>
            )}
            {availModal.type === 'rooms' && (
              <div>
                {availDetail.flatMap(p =>
                  p.rooms.filter(r => r.vacantBeds > 0).map(r => (
                    <Card key={`${p.residence_id}-${r.room_number}`} size="small" style={{ marginBottom: 8, borderLeft: '4px solid #faad14' }}>
                      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                        <Text strong>{p.name} — {r.floor_number ? `${r.floor_number} · ` : ''}Room {r.room_number}</Text>
                        <Space size="small">
                          <Tag>{p.unit}</Tag>
                          <Tag color="orange">{r.vacantBeds} vacant of {r.totalBeds}</Tag>
                        </Space>
                      </Space>
                    </Card>
                  ))
                )}
                {availDetail.flatMap(p => p.rooms.filter(r => r.vacantBeds > 0)).length === 0 && (
                  <Alert type="success" message="No vacant rooms at this time." showIcon />
                )}
              </div>
            )}
            {availModal.type === 'beds' && (
              <div>
                {availDetail.length === 0
                  ? <Alert type="success" message="No availability data found." showIcon />
                  : <Collapse
                      items={availDetail.map(p => ({
                        key: p.residence_id,
                        label: (
                          <Space>
                            <Text strong>{p.name}</Text>
                            <Badge count={p.vacantBeds} overflowCount={999}
                              style={{ backgroundColor: p.vacantBeds > 0 ? '#52c41a' : '#bfbfbf' }}
                              showZero />
                            <Text type="secondary" style={{ fontSize: 12 }}>vacant beds</Text>
                          </Space>
                        ),
                        children: (
                          <div>
                            {p.rooms.map(room => (
                              <div key={room.room_number} style={{ marginBottom: 12 }}>
                                <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 13, color: '#262626' }}>
                                  Room {room.room_number}{room.floor_number ? ` — ${room.floor_number}` : ''}
                                </div>
                                <Row gutter={[8, 8]}>
                                  {room.beds.map(bed => (
                                    <Col xs={12} sm={8} md={6} key={bed.bed_id}>
                                      <div style={{
                                        padding: '6px 10px',
                                        borderRadius: 6,
                                        border: `1px solid ${bed.occupied ? '#d9d9d9' : '#52c41a'}`,
                                        background: bed.occupied ? '#fafafa' : '#f6ffed',
                                        fontSize: 12,
                                      }}>
                                        <div style={{ fontWeight: 600 }}>Bed {bed.bed_label}</div>
                                        {bed.occupied ? (
                                          <div style={{ color: '#595959' }}>
                                            <div>👤 {bed.employee_name || bed.employee_id}</div>
                                            {bed.department && <div style={{ color: '#8c8c8c' }}>{bed.department}</div>}
                                            {bed.release_date && <div style={{ color: '#faad14' }}>Releasing: {bed.release_date}</div>}
                                          </div>
                                        ) : (
                                          <div style={{ color: '#52c41a', fontWeight: 600 }}>✓ Available</div>
                                        )}
                                      </div>
                                    </Col>
                                  ))}
                                </Row>
                              </div>
                            ))}
                          </div>
                        ),
                      }))}
                    />
                }
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default DashboardHome;
