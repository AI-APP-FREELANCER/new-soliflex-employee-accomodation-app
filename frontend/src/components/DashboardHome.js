import React, { useState, useEffect } from 'react';
import {
  Card, Table, Spin, Typography, Button, Dropdown, message, Alert,
  Row, Col, Statistic, Tabs, Tag, Space,
} from 'antd';
import {
  DownloadOutlined, FileExcelOutlined, ReloadOutlined,
  HomeOutlined, TeamOutlined, DollarOutlined, CalendarOutlined,
  WarningOutlined, UserOutlined, BankOutlined, FileTextOutlined,
  DashboardOutlined, SafetyCertificateOutlined, ApartmentOutlined,
} from '@ant-design/icons';
import { Column, Pie } from '@ant-design/charts';
import { useNavigate } from 'react-router-dom';
import api, { agreementAPI, residenceAPI, employeeAPI } from '../services/api';
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

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/analytics/mis');
      setMisData(res.data || {});
    } catch {
      message.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

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
              Allocated: r.allocated,
              Unallocated: r.unallocated,
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
            sheetName: 'Advance Pipeline',
            data: (misData?.advancePipeline || []).map(r => ({
              'Agreement ID': r.agreementId,
              Residence: r.residence,
              Employee: r.employee,
              'Advance Locked': r.advanceLocked,
              'Due Back': r.advanceDueBack,
              Received: r.advanceReceived,
              Pending: r.pending,
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

  // ── KPI values ─────────────────────────────────────────────────────────
  const totalProperties    = s.totalProperties    || 0;
  const activeResidences   = s.activeResidences   || 0;
  const inactiveResidences = s.inactiveResidences || 0;
  const occupiedResidences = s.occupiedResidences || 0;
  const vacantResidences   = s.vacantResidences   != null ? s.vacantResidences : Math.max(0, activeResidences - occupiedResidences);
  const totalRooms         = s.totalRooms         || 0;
  const occupiedRooms      = s.occupiedRooms      || 0;
  const vacantRooms        = s.vacantRooms        != null ? s.vacantRooms : Math.max(0, totalRooms - occupiedRooms);
  const roomOccupancyPct   = s.roomOccupancyPct   != null ? s.roomOccupancyPct : (totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0);
  const utilizationPct     = s.utilizationPct     || 0;
  const activeEmployees    = s.activeEmployees    || 0;
  const inactiveEmployees  = s.inactiveEmployees  || 0;
  const totalEmployees     = activeEmployees + inactiveEmployees;
  const allocatedEmployees = s.allocatedEmployees || 0;
  const unallocatedEmployees = s.unallocatedEmployees != null ? s.unallocatedEmployees : Math.max(0, activeEmployees - allocatedEmployees);
  const totalMonthlyRent   = s.totalMonthlyRent   || 0;
  const totalAdvanceLocked = s.totalAdvanceLocked || 0;
  const totalAdvancePending= s.totalAdvancePending|| 0;
  const totalNetReceived   = s.totalNetReceived   || 0;
  const totalScheduledToVacate = s.totalScheduledToVacate || 0;
  const pastDue            = s.pastDue            || 0;
  const dueSoon            = s.dueSoon            || 0;
  const leavingIn30Days    = s.leavingIn30Days    || 0;
  const leavingIn60Days    = s.leavingIn60Days    || 0;
  const leavingIn90Days    = s.leavingIn90Days    || 0;

  // ── Chart data ─────────────────────────────────────────────────────────
  const propertyPieData = [
    { type: 'Occupied', value: occupiedResidences },
    { type: 'Vacant (Active)', value: vacantResidences },
    ...(inactiveResidences > 0 ? [{ type: 'Inactive', value: inactiveResidences }] : []),
  ].filter(d => d.value > 0);

  const employeePieData = [
    { type: 'Allocated', value: allocatedEmployees },
    { type: 'Unallocated', value: unallocatedEmployees },
    ...(inactiveEmployees > 0 ? [{ type: 'Inactive', value: inactiveEmployees }] : []),
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
    color: ['#E87103', '#52c41a', '#bfbfbf'],
    tooltip: { formatter: (d) => {
      const t = propertyPieData.reduce((s, x) => s + x.value, 0);
      return { name: d.type, value: `${d.value} (${t > 0 ? ((d.value/t)*100).toFixed(1) : 0}%)` };
    }},
  };

  const empPieConfig = {
    ...pieBase,
    data: employeePieData,
    angleField: 'value', colorField: 'type',
    color: ['#1890ff', '#faad14', '#d9d9d9'],
    tooltip: { formatter: (d) => {
      const t = employeePieData.reduce((s, x) => s + x.value, 0);
      return { name: d.type, value: `${d.value} (${t > 0 ? ((d.value/t)*100).toFixed(1) : 0}%)` };
    }},
  };

  const colXAxis = { label: { autoRotate: true, autoHide: false, style: { fontSize: 10 } } };

  const deptCountConfig = {
    data: deptCountData, xField: 'dept', yField: 'count',
    color: '#1890ff',
    label: { position: 'top', style: { fill: '#595959', fontSize: 10 } },
    xAxis: colXAxis,
    yAxis: { title: { text: 'Employees' } },
    tooltip: { formatter: (d) => ({ name: 'Employees', value: d.count }) },
  };

  const deptRentConfig = {
    data: deptRentData, xField: 'dept', yField: 'rent',
    color: '#E87103',
    label: {
      position: 'top',
      style: { fill: '#595959', fontSize: 9 },
      formatter: (d) => d.rent >= 100000 ? `₹${(d.rent/100000).toFixed(1)}L` : `₹${(d.rent/1000).toFixed(0)}K`,
    },
    xAxis: colXAxis,
    yAxis: {
      title: { text: 'Monthly Rent' },
      label: { formatter: (v) => v >= 100000 ? `₹${(v/100000).toFixed(0)}L` : `₹${(v/1000).toFixed(0)}K` },
    },
    tooltip: { formatter: (d) => ({ name: 'Monthly Rent', value: `₹${Number(d.rent).toLocaleString('en-IN')}` }) },
  };

  const advanceConfig = {
    data: advanceData, xField: 'stage', yField: 'amount',
    color: ({ stage }) => stage === 'Locked (Active)' ? '#E87103' : stage === 'Received Back' ? '#52c41a' : '#f5222d',
    label: {
      position: 'top',
      style: { fill: '#595959', fontSize: 11 },
      formatter: (d) => {
        const v = d.amount;
        if (v >= 10000000) return `₹${(v/10000000).toFixed(2)}Cr`;
        if (v >= 100000)   return `₹${(v/100000).toFixed(1)}L`;
        return `₹${(v/1000).toFixed(0)}K`;
      },
    },
    yAxis: { label: { formatter: (v) => v >= 100000 ? `₹${(v/100000).toFixed(0)}L` : `₹${(v/1000).toFixed(0)}K` } },
    tooltip: { formatter: (d) => ({ name: d.stage, value: `₹${Number(d.amount).toLocaleString('en-IN')}` }) },
  };

  const renewalConfig = {
    data: renewalAlertData, xField: 'status', yField: 'count',
    color: ({ status }) => status === 'Past Due' ? '#f5222d' : status === 'Due (90 Days)' ? '#faad14' : '#1890ff',
    label: { position: 'top', style: { fill: '#595959', fontSize: 13, fontWeight: 600 } },
    yAxis: { title: { text: 'Count' } },
    tooltip: { formatter: (d) => ({ name: d.status, value: d.count }) },
  };

  // ── Tab content ──────────────────────────────────────────────────────────

  // ── Overview Tab ─────────────────────────────────────────────────────────
  const OverviewContent = () => (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card
            title="Property Utilization"
            size="small"
            extra={<Text type="secondary" style={{ fontSize: 12 }}>{occupiedResidences} occupied · {totalProperties} total</Text>}
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
            extra={<Text type="secondary" style={{ fontSize: 12 }}>{allocatedEmployees} allocated · {activeEmployees} active</Text>}
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
              const fmt = (typeof v === 'number' && v >= 0 && v < 1e12) ? fmtCFull(v) : v;
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
          { title: 'Allocated', dataIndex: 'allocated', key: 'allocated', render: v => <Tag color="blue">{v}</Tag> },
          { title: 'Unallocated', dataIndex: 'unallocated', key: 'unallocated', render: v => v > 0 ? <Tag color="warning">{v}</Tag> : <Tag color="success">0</Tag> },
          {
            title: 'Allocation %',
            key: 'allocPct',
            render: (_, r) => {
              const pct = r.active > 0 ? Math.round((r.allocated / r.active) * 100) : 0;
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
          { title: 'Residence', dataIndex: 'allocatedResidenceId', key: 'allocatedResidenceId', render: v => v === '—' ? <Text type="secondary">—</Text> : v },
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
          { title: 'Employee', dataIndex: 'employee', key: 'employee' },
          { title: 'Monthly Rent', dataIndex: 'monthlyRent', key: 'monthlyRent', render: fmtC, sorter: (a, b) => a.monthlyRent - b.monthlyRent, defaultSortOrder: 'descend' },
          { title: 'Advance Locked', dataIndex: 'advanceLocked', key: 'advanceLocked', render: fmtC },
          { title: 'Cost / Head', dataIndex: 'costPerHead', key: 'costPerHead', render: v => typeof v === 'number' ? fmtC(v) : v },
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
          { label: 'Total Advance Locked', value: fmtC(totalAdvanceLocked), color: '#E87103', sub: 'Active agreements' },
          { label: 'Total Received Back', value: fmtC(totalNetReceived), color: '#52c41a', sub: 'Refunds collected' },
          { label: 'Pending Refund', value: fmtC(totalAdvancePending), color: totalAdvancePending > 0 ? '#f5222d' : '#52c41a', sub: totalAdvancePending > 0 ? 'Follow up required' : 'None pending' },
        ].map(({ label, value, color, sub }) => (
          <Col xs={24} md={8} key={label}>
            <Card size="small" style={{ borderTop: `3px solid ${color}` }}>
              <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
              <div style={{ fontSize: 12, color: '#595959', fontWeight: 600 }}>{label}</div>
              <div style={{ fontSize: 11, color: '#8c8c8c' }}>{sub}</div>
            </Card>
          </Col>
        ))}
      </Row>

      <TCard
        title="Advance Pipeline — All Agreements"
        icon={<BankOutlined />}
        dataSource={misData.advancePipeline || []}
        rowKey="agreementId"
        exportName="Advance_Pipeline"
        columns={[
          { title: 'Agreement', dataIndex: 'agreementId', key: 'agreementId' },
          { title: 'Residence', dataIndex: 'residence', key: 'residence' },
          { title: 'Employee', dataIndex: 'employee', key: 'employee' },
          { title: 'Advance Locked', dataIndex: 'advanceLocked', key: 'advanceLocked', render: fmtC, sorter: (a, b) => a.advanceLocked - b.advanceLocked },
          { title: 'Due Back', dataIndex: 'advanceDueBack', key: 'advanceDueBack', render: fmtC },
          { title: 'Received', dataIndex: 'advanceReceived', key: 'advanceReceived', render: fmtC },
          { title: 'Pending', dataIndex: 'pending', key: 'pending', render: v => v > 0 ? <Text style={{ color: '#f5222d', fontWeight: 600 }}>{fmtC(v)}</Text> : <Text style={{ color: '#52c41a' }}>₹0</Text>, sorter: (a, b) => b.pending - a.pending },
          { title: 'Status', dataIndex: 'status', key: 'status', render: v => <STag v={v} /> },
        ]}
      />

      <TCard
        title="Advance & Refund Liquidity"
        icon={<DollarOutlined />}
        dataSource={misData.advanceRefundLiquidity || []}
        rowKey="agreementId"
        exportName="Advance_Refund_Liquidity"
        columns={[
          { title: 'Agreement', dataIndex: 'agreementId', key: 'agreementId' },
          { title: 'Employee', dataIndex: 'employee', key: 'employee' },
          { title: 'Landlord', dataIndex: 'residenceLandlord', key: 'residenceLandlord' },
          { title: 'Total Locked', dataIndex: 'totalAdvanceLocked', key: 'totalAdvanceLocked', render: fmtC },
          { title: 'Pipeline (30d)', dataIndex: 'refundsInPipeline30', key: 'refundsInPipeline30', render: fmtC },
          { title: 'Due Back', dataIndex: 'advanceDueBack', key: 'advanceDueBack', render: fmtC },
          { title: 'Received', dataIndex: 'advanceReceived', key: 'advanceReceived', render: fmtC },
          { title: 'Net Realization', dataIndex: 'netRefundRealization', key: 'netRefundRealization', render: fmtC },
          { title: 'Landlord Rating', dataIndex: 'landlordRating', key: 'landlordRating' },
        ]}
      />

      <TCard
        title="Refund Status — Closed vs Pending"
        icon={<FileTextOutlined />}
        dataSource={misData.refundStatus || []}
        rowKey="agreementId"
        exportName="Refund_Status"
        columns={[
          { title: 'Agreement', dataIndex: 'agreementId', key: 'agreementId' },
          { title: 'Employee', dataIndex: 'employee', key: 'employee' },
          { title: 'Residence', dataIndex: 'residence', key: 'residence' },
          { title: 'Due Back', dataIndex: 'advanceDueBack', key: 'advanceDueBack', render: fmtC },
          { title: 'Received', dataIndex: 'advanceReceived', key: 'advanceReceived', render: fmtC },
          { title: 'Maintenance Cut', dataIndex: 'maintenanceCut', key: 'maintenanceCut', render: fmtC },
          { title: 'Net Returned', dataIndex: 'netReturned', key: 'netReturned', render: fmtC },
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
          { title: 'Capacity (Rooms)', dataIndex: 'capacity', key: 'capacity', sorter: (a, b) => a.capacity - b.capacity },
          { title: 'Currently Occupied', dataIndex: 'occupancy', key: 'occupancy', sorter: (a, b) => a.occupancy - b.occupancy },
          {
            title: 'Occupancy %',
            key: 'pct',
            render: (_, r) => {
              const pct = r.capacity > 0 ? Math.round((r.occupancy / r.capacity) * 100) : 0;
              return <Tag color={pct === 100 ? 'success' : pct >= 50 ? 'warning' : 'error'}>{pct}%</Tag>;
            },
          },
          { title: 'Suggestion', dataIndex: 'optimizationSuggestion', key: 'optimizationSuggestion', ellipsis: true },
        ]}
      />
    </div>
  );

  // ── Tabs definition ──────────────────────────────────────────────────────
  const tabItems = [
    {
      key: 'overview',
      label: <span><DashboardOutlined /> Overview</span>,
      children: <OverviewContent />,
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

      {/* ── Alert banners ── */}
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
      {totalScheduledToVacate > 0 && (
        <Alert
          type="info" showIcon closable
          message={<><strong>{totalScheduledToVacate} agreement{totalScheduledToVacate > 1 ? 's' : ''}</strong> scheduled to vacate — advance refunds may be pending</>}
          action={<Button size="small" onClick={() => navigate('/agreements?filter=scheduledToVacate')}>View</Button>}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* ── KPI ROW 1: Properties ── */}
      <SLabel>Properties &amp; Residences</SLabel>
      <Row gutter={[10, 10]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8} md={4}>
          <KCard title="Total Properties" value={totalProperties} color="#262626"
            sub={`${activeResidences} active · ${inactiveResidences} inactive`} />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <KCard title="Active Residences" value={activeResidences} color="#1890ff"
            sub={inactiveResidences > 0 ? `${inactiveResidences} inactive` : 'All active'} />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <KCard title="Occupied" value={occupiedResidences} color="#52c41a"
            sub={`${utilizationPct}% utilization`} />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <KCard title="Vacant (Active)" value={vacantResidences}
            color={vacantResidences > 3 ? '#faad14' : '#52c41a'}
            sub="Available for allocation" />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <KCard title="Total Rooms" value={totalRooms} color="#722ed1"
            sub={`${occupiedRooms} occupied`} />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <KCard title="Room Occupancy" value={roomOccupancyPct} suffix="%"
            color={roomOccupancyPct >= 80 ? '#52c41a' : roomOccupancyPct >= 60 ? '#faad14' : '#f5222d'}
            sub={`${vacantRooms} rooms vacant`} />
        </Col>
      </Row>

      {/* ── KPI ROW 2: Workforce ── */}
      <SLabel>Workforce</SLabel>
      <Row gutter={[10, 10]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8} md={4}>
          <KCard title="Total Employees" value={totalEmployees} color="#262626" />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <KCard title="Active" value={activeEmployees} color="#52c41a" />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <KCard title="Allocated" value={allocatedEmployees} color="#1890ff"
            sub={`of ${activeEmployees} active`} />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <KCard title="Unallocated" value={unallocatedEmployees}
            color={unallocatedEmployees > 0 ? '#faad14' : '#52c41a'}
            sub="Active, no residence" />
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
          <Card size="small" style={{ borderTop: '3px solid #52c41a', height: '100%' }} bodyStyle={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 12, color: '#595959' }}>Monthly Rent</div>
            <div style={{ fontSize: 19, fontWeight: 700, color: '#52c41a' }}>{fmtC(totalMonthlyRent)}</div>
            <div style={{ fontSize: 11, color: '#8c8c8c' }}>Active agreements</div>
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small" style={{ borderTop: '3px solid #E87103', height: '100%' }} bodyStyle={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 12, color: '#595959' }}>Advance Locked</div>
            <div style={{ fontSize: 19, fontWeight: 700, color: '#E87103' }}>{fmtC(totalAdvanceLocked)}</div>
            <div style={{ fontSize: 11, color: '#8c8c8c' }}>Security deposits</div>
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small" style={{ borderTop: `3px solid ${totalAdvancePending > 0 ? '#f5222d' : '#52c41a'}`, height: '100%' }} bodyStyle={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 12, color: '#595959' }}>Advance Pending</div>
            <div style={{ fontSize: 19, fontWeight: 700, color: totalAdvancePending > 0 ? '#f5222d' : '#52c41a' }}>{fmtC(totalAdvancePending)}</div>
            <div style={{ fontSize: 11, color: '#8c8c8c' }}>Refunds not yet received</div>
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small" style={{ borderTop: '3px solid #1890ff', height: '100%' }} bodyStyle={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 12, color: '#595959' }}>Advance Received</div>
            <div style={{ fontSize: 19, fontWeight: 700, color: '#1890ff' }}>{fmtC(totalNetReceived)}</div>
            <div style={{ fontSize: 11, color: '#8c8c8c' }}>Total refunds collected</div>
          </Card>
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
    </div>
  );
};

export default DashboardHome;
