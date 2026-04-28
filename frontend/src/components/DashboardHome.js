import React, { useState, useEffect } from 'react';
import { Card, Table, Spin, Typography, Button, Dropdown, message, Alert } from 'antd';
import { useNavigate } from 'react-router-dom';
import api, { agreementAPI, residenceAPI, employeeAPI } from '../services/api';
import { DownloadOutlined, FileExcelOutlined, FileTextOutlined } from '@ant-design/icons';
import { exportTableToExcel } from '../utils/exportUtils';
import { formatDateForDisplay } from '../utils/dateUtils';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const formatCurrency = (value) => {
  if (value === '—' || value == null) return '—';
  if (typeof value !== 'number') return value;
  return `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const defaultPagination = { pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '25', '50'] };

const DashboardHome = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [misData, setMisData] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await api.get('/analytics/mis');
        setMisData(response.data || {});
      } catch (error) {
        console.error('Dashboard MIS fetch error:', error);
        message.error('Failed to load MIS data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleReportExport = async ({ key }) => {
    const hide = message.loading('Generating report...', 0);
    try {
      switch (key) {
        case 'financial':
          await handleExportFinancialSummary();
          break;
        case 'advanceRefund':
          await handleExportAdvanceRefund();
          break;
        case 'vacating':
          await handleExportVacatingAgreements();
          break;
        case 'allAgreements':
          await handleExportAllAgreements();
          break;
        case 'residences':
          await handleExportResidences();
          break;
        case 'employees':
          await handleExportEmployees();
          break;
        default:
          break;
      }
      message.success({ content: 'Report exported successfully!', key: 'export' });
    } catch (error) {
      message.error({ content: 'Failed to export report', key: 'export' });
    } finally {
      hide();
    }
  };

  const handleExportFinancialSummary = async () => {
    const s = misData?.summary || {};
    const rows = [
      { 'Metric': 'Total Monthly Rent', 'Amount (₹)': s.totalMonthlyRent ?? 0 },
      { 'Metric': 'Total Advance Locked', 'Amount (₹)': s.totalAdvanceLocked ?? 0 },
      { 'Metric': 'Total Advance Due Back', 'Amount (₹)': s.totalAdvanceDueBack ?? 0 },
      { 'Metric': 'Total Net Received', 'Amount (₹)': s.totalNetReceived ?? 0 },
      { 'Metric': 'Total Properties', 'Count': s.totalProperties ?? 0 },
      { 'Metric': 'Active Employees', 'Count': s.activeEmployees ?? 0 },
      { 'Metric': 'Scheduled to Vacate', 'Count': s.totalScheduledToVacate ?? 0 },
    ];
    exportTableToExcel(rows, 'Financial Summary', `Financial_Summary_${dayjs().format('YYYY-MM-DD')}.xlsx`);
  };

  const handleExportAdvanceRefund = async () => {
    const response = await agreementAPI.getAll({ status: 'all' });
    const agreements = Array.isArray(response.data) ? response.data : (response.data?.data || []);
    const refundData = agreements
      .filter(a => {
        const status = String(a.agreement_status || '').toLowerCase();
        return status === 'inactive' && (parseFloat(a.agreement_advance_received) > 0 || parseFloat(a.agreement_advance_due_back) > 0);
      })
      .map(a => ({
        'Agreement ID': a.agreement_id || '',
        'Residence ID': a.agreement_residence_id || '',
        'Advance Due Back': parseFloat(a.agreement_advance_due_back) || 0,
        'Advance Received': parseFloat(a.agreement_advance_received) || 0,
        'Maintenance Cut': parseFloat(a.agreement_maintenance_cut) || 0,
        'Vacate Date': a.agreement_vacate_date ? formatDateForDisplay(a.agreement_vacate_date) : 'N/A',
      }));
    exportTableToExcel(refundData, 'Advance Refund Report', `Advance_Refund_Report_${dayjs().format('YYYY-MM-DD')}.xlsx`);
  };

  const handleExportVacatingAgreements = async () => {
    const list = misData?.scheduledToVacate || [];
    const rows = list.map(a => ({
      'Agreement ID': a.agreementId,
      'Residence': a.residence,
      'Employee': a.employee,
      'Vacate Date': a.vacateDate ? formatDateForDisplay(a.vacateDate) : 'N/A',
      'Advance Due Back': a.advanceDueBack,
      'Advance Received': a.advanceReceived,
      'Status': a.status,
    }));
    exportTableToExcel(rows, 'Vacating Agreements', `Vacating_Agreements_${dayjs().format('YYYY-MM-DD')}.xlsx`);
  };

  const handleExportAllAgreements = async () => {
    const response = await agreementAPI.getAll({ status: 'all' });
    const agreements = Array.isArray(response.data) ? response.data : (response.data?.data || []);
    const rows = agreements.map(a => ({
      'Agreement ID': a.agreement_id,
      'Residence ID': a.agreement_residence_id,
      'Status': a.agreement_status,
      'Monthly Rent': parseFloat(a.agreement_monthly_rent_amount) || 0,
      'Advance Amount': parseFloat(a.agreement_advance_amount) || 0,
      'Advance Due Back': parseFloat(a.agreement_advance_due_back) || 0,
      'Advance Received': parseFloat(a.agreement_advance_received) || 0,
      'Possession Date': a.agreement_possesion_date ? formatDateForDisplay(a.agreement_possesion_date) : 'N/A',
      'Renewal Due Date': a.agreement_renewal_due_date ? formatDateForDisplay(a.agreement_renewal_due_date) : 'N/A',
      'Vacate Date': a.agreement_vacate_date ? formatDateForDisplay(a.agreement_vacate_date) : 'N/A',
    }));
    exportTableToExcel(rows, 'All Agreements', `All_Agreements_${dayjs().format('YYYY-MM-DD')}.xlsx`);
  };

  const handleExportResidences = async () => {
    const response = await residenceAPI.getAll('all');
    const residences = Array.isArray(response.data) ? response.data : (response.data?.data || []);
    const rows = residences.map(r => ({
      'Residence ID': r.residence_id,
      'Owner Name': r.residence_owner_name,
      'Address': [r.residence_address_line_1, r.residence_address_line_2].filter(Boolean).join(', '),
      'House Count': r.residence_house_count || 0,
      'Status': r.residence_status,
    }));
    exportTableToExcel(rows, 'All Residences', `All_Residences_${dayjs().format('YYYY-MM-DD')}.xlsx`);
  };

  const handleExportEmployees = async () => {
    const response = await employeeAPI.getAll('all');
    const employees = Array.isArray(response.data) ? response.data : (response.data?.data || []);
    const rows = employees.map(e => ({
      'Employee ID': e.employee_id,
      'Name': [e.employee_first_name, e.employee_last_name, e.employee_sir_name].filter(Boolean).join(' '),
      'Department': e.employee_department,
      'Designation': e.employee_designation,
      'Date of Joining': e.employee_date_of_joining ? formatDateForDisplay(e.employee_date_of_joining) : 'N/A',
      'Status': e.employee_status,
      'Allocated Agreement ID': e.emplyee_allocated_agreement_id || '',
    }));
    exportTableToExcel(rows, 'All Employees', `All_Employees_${dayjs().format('YYYY-MM-DD')}.xlsx`);
  };

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  if (!misData) return <div style={{ padding: 24 }}><Text type="secondary">No MIS data available.</Text></div>;

  const ownerSummaryColumns = [
    { title: 'Metric', dataIndex: 'metric', key: 'metric', width: 260 },
    {
      title: 'Current Value',
      dataIndex: 'currentValue',
      key: 'currentValue',
      render: (v, row) => {
        const formatted = (typeof v === 'number' && v >= 0 && v < 1e12) ? formatCurrency(v) : v;
        if (row.metric === 'Past Due Renewals' && typeof v === 'number' && v > 0) {
          return <Typography.Link onClick={() => navigate('/agreements?filter=pastDue')}>{formatted}</Typography.Link>;
        }
        if (row.metric === 'Due in 90 Days' && typeof v === 'number') {
          return <Typography.Link onClick={() => navigate('/agreements?filter=due90')}>{formatted}</Typography.Link>;
        }
        if (row.metric === 'Pipeline Ready (Scheduled to Vacate)' && typeof v === 'number') {
          return <Typography.Link onClick={() => navigate('/agreements?filter=scheduledToVacate')}>{formatted}</Typography.Link>;
        }
        return formatted;
      },
    },
    { title: 'Month-over-Month Trend', dataIndex: 'monthOverMonthTrend', key: 'monthOverMonthTrend', width: 160 },
    { title: 'Action Required', dataIndex: 'actionRequired', key: 'actionRequired', ellipsis: true },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Title level={2} style={{ marginBottom: '16px' }}>MIS Dashboard</Title>
      <Alert
        type="info"
        showIcon
        icon={<FileTextOutlined />}
        style={{ marginBottom: 24 }}
        message="Agreement operations (PDF upload, schedule vacate, process advance refund)"
        description={
          <>
            These actions are on the <strong>Agreements</strong> page—not on this MIS screen. Use the sidebar or the button below to open the full agreements table with Attachment, Set to Vacate / Revoke, and Process Refund.
            <div style={{ marginTop: 12 }}>
              <Button type="primary" icon={<FileTextOutlined />} onClick={() => navigate('/agreements')}>
                Go to Agreements
              </Button>
            </div>
          </>
        }
      />

      {/* 1. Owner's Summary */}
      <Card title="1. Owner's Summary (Executive Table)" style={{ marginBottom: 24 }}>
        <Table
          dataSource={misData.ownerSummary || []}
          columns={ownerSummaryColumns}
          rowKey={(r) => r.metric}
          pagination={false}
          size="small"
        />
      </Card>

      {/* 2. Proactive Workforce & Property Pipeline */}
      <Title level={4} style={{ marginTop: 24, marginBottom: 16 }}>2. Proactive Workforce & Property Pipeline</Title>
      <Card title="2.1 Upcoming Vacancy & Replacement Tracker" style={{ marginBottom: 16 }}>
        <Table
          dataSource={misData.upcomingVacancyReplacementTracker || []}
          columns={[
            { title: 'Employee Name', dataIndex: 'employeeName', key: 'employeeName' },
            { title: 'Department', dataIndex: 'department', key: 'department' },
            { title: 'Projected LWD', dataIndex: 'projectedLWD', key: 'projectedLWD', render: (v) => v ? formatDateForDisplay(v) : '—' },
            { title: 'Notice Status', dataIndex: 'noticeStatus', key: 'noticeStatus' },
            { title: 'Allocated Residence', dataIndex: 'allocatedResidence', key: 'allocatedResidence', ellipsis: true },
            { title: 'Replacement Candidate', dataIndex: 'replacementCandidate', key: 'replacementCandidate' },
            { title: 'Transition Buffer', dataIndex: 'transitionBuffer', key: 'transitionBuffer' },
            { title: 'Days Left', dataIndex: 'daysLeft', key: 'daysLeft' },
          ]}
          rowKey={(r, i) => r.employeeName + (r.projectedLWD || '') + i}
          pagination={defaultPagination}
          size="small"
        />
      </Card>
      <Card title="2.2 Properties Becoming Available (Next 90 Days)" style={{ marginBottom: 16 }}>
        <Table
          dataSource={misData.propertiesBecomingAvailable || []}
          columns={[
            { title: 'Residence ID', dataIndex: 'residenceId', key: 'residenceId' },
            { title: 'Owner Name', dataIndex: 'ownerName', key: 'ownerName' },
            { title: 'Vacate Date', dataIndex: 'vacateDate', key: 'vacateDate', render: (v) => v ? formatDateForDisplay(v) : '—' },
            { title: 'Current Employee', dataIndex: 'currentEmployee', key: 'currentEmployee' },
            { title: 'Department', dataIndex: 'department', key: 'department' },
            { title: 'Agreement ID', dataIndex: 'agreementId', key: 'agreementId' },
            { title: 'Days Until Available', dataIndex: 'daysUntilAvailable', key: 'daysUntilAvailable' },
          ]}
          rowKey={(r) => r.agreementId + (r.residenceId || '')}
          pagination={defaultPagination}
          size="small"
        />
      </Card>
      <Card title="2.3 Replacement Planning Summary (by Property)" style={{ marginBottom: 24 }}>
        <Table
          dataSource={misData.replacementPlanningSummary || []}
          columns={[
            { title: 'Residence ID', dataIndex: 'residenceId', key: 'residenceId' },
            { title: 'Owner', dataIndex: 'owner', key: 'owner' },
            { title: 'Vacate Date', dataIndex: 'vacateDate', key: 'vacateDate', render: (v) => v ? formatDateForDisplay(v) : '—' },
            { title: 'Outgoing Employee', dataIndex: 'outgoingEmployee', key: 'outgoingEmployee' },
            { title: 'Department', dataIndex: 'department', key: 'department' },
            { title: 'Last Working Date', dataIndex: 'lastWorkingDate', key: 'lastWorkingDate', render: (v) => v ? formatDateForDisplay(v) : '—' },
            { title: 'Advance Due Back', dataIndex: 'advanceDueBack', key: 'advanceDueBack', render: formatCurrency },
            { title: 'Suggested Action', dataIndex: 'suggestedAction', key: 'suggestedAction' },
          ]}
          rowKey={(r) => r.residenceId + (r.vacateDate || '')}
          pagination={defaultPagination}
          size="small"
        />
      </Card>

      {/* 3. Cost Optimization & Property Efficiency */}
      <Title level={4} style={{ marginTop: 24, marginBottom: 16 }}>3. Cost Optimization & Property Efficiency</Title>
      <Card title="3.1 Property Utilization & Opportunity Cost" style={{ marginBottom: 16 }}>
        <Table
          dataSource={misData.propertyUtilizationOpportunityCost || []}
          columns={[
            { title: 'Residence ID', dataIndex: 'residenceId', key: 'residenceId' },
            { title: 'Address', dataIndex: 'address', key: 'address', ellipsis: true },
            { title: 'Capacity', dataIndex: 'capacity', key: 'capacity' },
            { title: 'Occupancy', dataIndex: 'occupancy', key: 'occupancy' },
            { title: 'Vacancy Days', dataIndex: 'vacancyDays', key: 'vacancyDays' },
            { title: 'Lost Rent', dataIndex: 'lostRent', key: 'lostRent' },
            { title: 'Optimization Suggestion', dataIndex: 'optimizationSuggestion', key: 'optimizationSuggestion' },
          ]}
          rowKey="residenceId"
          pagination={defaultPagination}
          size="small"
        />
      </Card>
      <Card title="3.2 Cost by Property" style={{ marginBottom: 16 }}>
        <Table
          dataSource={misData.costByProperty || []}
          columns={[
            { title: 'Residence ID', dataIndex: 'residenceId', key: 'residenceId' },
            { title: 'Owner Name', dataIndex: 'ownerName', key: 'ownerName' },
            { title: 'Address', dataIndex: 'address', key: 'address', ellipsis: true },
            { title: 'Monthly Rent', dataIndex: 'monthlyRent', key: 'monthlyRent', render: formatCurrency },
            { title: 'Advance Locked', dataIndex: 'advanceLocked', key: 'advanceLocked', render: formatCurrency },
            { title: 'Agreement Status', dataIndex: 'agreementStatus', key: 'agreementStatus' },
            { title: 'Employee', dataIndex: 'employee', key: 'employee' },
            { title: 'Cost per Head', dataIndex: 'costPerHead', key: 'costPerHead', render: (v) => typeof v === 'number' ? formatCurrency(v) : v },
          ]}
          rowKey={(r, i) => `${r.residenceId}-${r.employee || ''}-${i}`}
          pagination={defaultPagination}
          size="small"
        />
      </Card>
      <Card title="3.3 Agreement ROI Ledger" style={{ marginBottom: 24 }}>
        <Table
          dataSource={misData.agreementROILedger || []}
          columns={[
            { title: 'Landlord Name', dataIndex: 'landlordName', key: 'landlordName' },
            { title: 'Agreement ID', dataIndex: 'agreementId', key: 'agreementId' },
            { title: 'Historical Rent Hikes', dataIndex: 'historicalRentHikes', key: 'historicalRentHikes' },
            { title: 'Advance Due Back', dataIndex: 'advanceDueBack', key: 'advanceDueBack', render: formatCurrency },
            { title: 'Advance Received', dataIndex: 'advanceReceived', key: 'advanceReceived', render: formatCurrency },
            { title: 'Advance Recovery Status', dataIndex: 'advanceRecoveryStatus', key: 'advanceRecoveryStatus' },
            { title: 'Maintenance Efficiency', dataIndex: 'maintenanceEfficiency', key: 'maintenanceEfficiency' },
          ]}
          rowKey="agreementId"
          pagination={defaultPagination}
          size="small"
        />
      </Card>

      {/* Module 3: Departmental & Human Capital MIS */}
      <Title level={4} style={{ marginTop: 24, marginBottom: 16 }}>Module 3: Departmental & Human Capital MIS</Title>
      <Card title="3.1 Departmental Expense Matrix" style={{ marginBottom: 16 }}>
        <Table
          dataSource={misData.departmentalExpenseMatrix || []}
          columns={[
            { title: 'Department', dataIndex: 'department', key: 'department' },
            { title: 'Total Resident Count', dataIndex: 'totalResidentCount', key: 'totalResidentCount' },
            { title: 'Cumulative Monthly Rent', dataIndex: 'cumulativeMonthlyRent', key: 'cumulativeMonthlyRent', render: formatCurrency },
            { title: 'Cost Per Head', dataIndex: 'costPerHead', key: 'costPerHead', render: (v) => (v !== '—' && v != null ? formatCurrency(v) : v) },
            { title: 'Budget Variance', dataIndex: 'budgetVariance', key: 'budgetVariance' },
          ]}
          rowKey="department"
          pagination={defaultPagination}
          size="small"
        />
      </Card>
      <Card title="4.2 Designation-Wise Spend Analysis" style={{ marginBottom: 16 }}>
        <Table
          dataSource={misData.designationWiseSpend || []}
          columns={[
            { title: 'Designation', dataIndex: 'designation', key: 'designation' },
            { title: 'Count', dataIndex: 'count', key: 'count' },
            { title: 'Total Monthly Rent', dataIndex: 'totalMonthlyRent', key: 'totalMonthlyRent', render: formatCurrency },
            { title: 'Cost Per Head', dataIndex: 'costPerHead', key: 'costPerHead', render: (v) => (v !== '—' && v != null ? formatCurrency(v) : v) },
            { title: 'Accommodation Grade', dataIndex: 'accommodationGrade', key: 'accommodationGrade' },
            { title: 'Average Tenure in Quarters', dataIndex: 'averageTenureInQuarters', key: 'averageTenureInQuarters' },
          ]}
          rowKey="designation"
          pagination={defaultPagination}
          size="small"
        />
      </Card>
      <Card title="4.3 Department-Wise Employee Summary" style={{ marginBottom: 16 }}>
        <Table
          dataSource={misData.departmentWiseEmployeeSummary || []}
          columns={[
            { title: 'Department', dataIndex: 'department', key: 'department' },
            { title: 'Total Employees', dataIndex: 'totalEmployees', key: 'totalEmployees' },
            { title: 'Active', dataIndex: 'active', key: 'active' },
            { title: 'Inactive', dataIndex: 'inactive', key: 'inactive' },
            { title: 'Allocated', dataIndex: 'allocated', key: 'allocated' },
            { title: 'Unallocated', dataIndex: 'unallocated', key: 'unallocated' },
          ]}
          rowKey="department"
          pagination={defaultPagination}
          size="small"
        />
      </Card>
      <Card title="4.4 Employee Master (Enhanced)" style={{ marginBottom: 24 }}>
        <Table
          dataSource={misData.employeeMasterEnhanced || []}
          columns={[
            { title: 'Employee ID', dataIndex: 'employeeId', key: 'employeeId' },
            { title: 'Name', dataIndex: 'name', key: 'name' },
            { title: 'Department', dataIndex: 'department', key: 'department' },
            { title: 'Designation', dataIndex: 'designation', key: 'designation' },
            { title: 'Date of Joining', dataIndex: 'dateOfJoining', key: 'dateOfJoining', render: (v) => v && v !== '—' ? formatDateForDisplay(v) : v },
            { title: 'Status', dataIndex: 'status', key: 'status' },
            { title: 'Allocated Residence', dataIndex: 'allocatedResidenceId', key: 'allocatedResidenceId' },
            { title: 'Agreement ID', dataIndex: 'agreementId', key: 'agreementId' },
            { title: 'Renewal Due', dataIndex: 'renewalDue', key: 'renewalDue', render: (v) => v && v !== '—' ? formatDateForDisplay(v) : v },
            { title: 'Last Working Date', dataIndex: 'lastWorkingDate', key: 'lastWorkingDate', render: (v) => v && v !== '—' ? formatDateForDisplay(v) : v },
            { title: 'Vacate Date', dataIndex: 'vacateDate', key: 'vacateDate', render: (v) => v && v !== '—' ? formatDateForDisplay(v) : v },
          ]}
          rowKey="employeeId"
          pagination={defaultPagination}
          size="small"
        />
      </Card>

      {/* 5. Financial Health & Compliance Audit */}
      <Title level={4} style={{ marginTop: 24, marginBottom: 16 }}>5. Financial Health & Compliance Audit</Title>
      <Card title="5.1 Advance & Refund Liquidity" style={{ marginBottom: 16 }}>
        <Table
          dataSource={misData.advanceRefundLiquidity || []}
          columns={[
            { title: 'Agreement ID', dataIndex: 'agreementId', key: 'agreementId' },
            { title: 'Employee', dataIndex: 'employee', key: 'employee' },
            { title: 'Residence / Landlord', dataIndex: 'residenceLandlord', key: 'residenceLandlord' },
            { title: 'Total Advance Locked', dataIndex: 'totalAdvanceLocked', key: 'totalAdvanceLocked', render: formatCurrency },
            { title: 'Refunds in Pipeline (30d)', dataIndex: 'refundsInPipeline30', key: 'refundsInPipeline30', render: formatCurrency },
            { title: 'Advance Due Back', dataIndex: 'advanceDueBack', key: 'advanceDueBack', render: formatCurrency },
            { title: 'Advance Received', dataIndex: 'advanceReceived', key: 'advanceReceived', render: formatCurrency },
            { title: 'Net Refund Realization', dataIndex: 'netRefundRealization', key: 'netRefundRealization', render: formatCurrency },
            { title: 'Landlord Rating', dataIndex: 'landlordRating', key: 'landlordRating' },
          ]}
          rowKey="agreementId"
          pagination={defaultPagination}
          size="small"
        />
      </Card>
      <Card title="5.2 Advance Pipeline" style={{ marginBottom: 16 }}>
        <Table
          dataSource={misData.advancePipeline || []}
          columns={[
            { title: 'Agreement ID', dataIndex: 'agreementId', key: 'agreementId' },
            { title: 'Residence', dataIndex: 'residence', key: 'residence' },
            { title: 'Employee', dataIndex: 'employee', key: 'employee' },
            { title: 'Advance Locked', dataIndex: 'advanceLocked', key: 'advanceLocked', render: formatCurrency },
            { title: 'Advance Due Back', dataIndex: 'advanceDueBack', key: 'advanceDueBack', render: formatCurrency },
            { title: 'Advance Received', dataIndex: 'advanceReceived', key: 'advanceReceived', render: formatCurrency },
            { title: 'Pending', dataIndex: 'pending', key: 'pending', render: formatCurrency },
            { title: 'Status', dataIndex: 'status', key: 'status' },
          ]}
          rowKey="agreementId"
          pagination={defaultPagination}
          size="small"
        />
      </Card>
      <Card title="5.3 Compliance & Renewal Risk" style={{ marginBottom: 16 }}>
        <Table
          dataSource={misData.complianceRenewalRisk || []}
          columns={[
            { title: 'Agreement ID', dataIndex: 'agreementId', key: 'agreementId' },
            { title: 'Residence ID', dataIndex: 'residenceId', key: 'residenceId' },
            { title: 'Employee', dataIndex: 'employee', key: 'employee' },
            { title: 'Renewal Due Date', dataIndex: 'renewalDueDate', key: 'renewalDueDate', render: (v) => v && v !== '—' ? formatDateForDisplay(v) : v },
            { title: 'Notice Period Requirement', dataIndex: 'noticePeriodRequirement', key: 'noticePeriodRequirement', render: (v) => v && v !== '—' ? formatDateForDisplay(v) : v },
            { title: 'Statutory Status', dataIndex: 'statutoryStatus', key: 'statutoryStatus' },
            { title: 'Document Location', dataIndex: 'documentLocation', key: 'documentLocation', ellipsis: true },
          ]}
          rowKey="agreementId"
          pagination={defaultPagination}
          size="small"
        />
      </Card>
      <Card title="4.4 Renewals Past Due" style={{ marginBottom: 16 }}>
        <Table
          dataSource={misData.renewalsPastDue || []}
          columns={[
            { title: 'Agreement ID', dataIndex: 'agreementId', key: 'agreementId' },
            { title: 'Residence ID', dataIndex: 'residenceId', key: 'residenceId' },
            { title: 'Employee', dataIndex: 'employee', key: 'employee' },
            { title: 'Renewal Due Date', dataIndex: 'renewalDueDate', key: 'renewalDueDate', render: (v) => v ? formatDateForDisplay(v) : '—' },
            { title: 'Days Past Due', dataIndex: 'daysPastDue', key: 'daysPastDue' },
            { title: 'Monthly Rent', dataIndex: 'monthlyRent', key: 'monthlyRent', render: formatCurrency },
          ]}
          rowKey="agreementId"
          pagination={defaultPagination}
          size="small"
        />
      </Card>
      <Card title="5.5 Renewals Due in Next 90 Days" style={{ marginBottom: 16 }}>
        <Table
          dataSource={misData.renewalsDueSoon || []}
          columns={[
            { title: 'Agreement ID', dataIndex: 'agreementId', key: 'agreementId' },
            { title: 'Residence ID', dataIndex: 'residenceId', key: 'residenceId' },
            { title: 'Employee', dataIndex: 'employee', key: 'employee' },
            { title: 'Renewal Due Date', dataIndex: 'renewalDueDate', key: 'renewalDueDate', render: (v) => v ? formatDateForDisplay(v) : '—' },
            { title: 'Days Until Due', dataIndex: 'daysUntilDue', key: 'daysUntilDue' },
            { title: 'Monthly Rent', dataIndex: 'monthlyRent', key: 'monthlyRent', render: formatCurrency },
          ]}
          rowKey="agreementId"
          pagination={defaultPagination}
          size="small"
        />
      </Card>
      <Card title="5.6 Scheduled to Vacate" style={{ marginBottom: 16 }}>
        <Table
          dataSource={misData.scheduledToVacate || []}
          columns={[
            { title: 'Agreement ID', dataIndex: 'agreementId', key: 'agreementId' },
            { title: 'Employee', dataIndex: 'employee', key: 'employee' },
            { title: 'Residence', dataIndex: 'residence', key: 'residence' },
            { title: 'Vacate Date', dataIndex: 'vacateDate', key: 'vacateDate', render: (v) => v ? formatDateForDisplay(v) : '—' },
            { title: 'Advance Due Back', dataIndex: 'advanceDueBack', key: 'advanceDueBack', render: formatCurrency },
            { title: 'Advance Received', dataIndex: 'advanceReceived', key: 'advanceReceived', render: formatCurrency },
            { title: 'Status', dataIndex: 'status', key: 'status' },
          ]}
          rowKey="agreementId"
          pagination={defaultPagination}
          size="small"
        />
      </Card>
      <Card title="5.7 Refund Status (Pending vs Processed)" style={{ marginBottom: 24 }}>
        <Table
          dataSource={misData.refundStatus || []}
          columns={[
            { title: 'Agreement ID', dataIndex: 'agreementId', key: 'agreementId' },
            { title: 'Employee', dataIndex: 'employee', key: 'employee' },
            { title: 'Residence', dataIndex: 'residence', key: 'residence' },
            { title: 'Advance Due Back', dataIndex: 'advanceDueBack', key: 'advanceDueBack', render: formatCurrency },
            { title: 'Advance Received', dataIndex: 'advanceReceived', key: 'advanceReceived', render: formatCurrency },
            { title: 'Maintenance Cut', dataIndex: 'maintenanceCut', key: 'maintenanceCut', render: formatCurrency },
            { title: 'Net Returned', dataIndex: 'netReturned', key: 'netReturned', render: formatCurrency },
            { title: 'Status', dataIndex: 'status', key: 'status' },
          ]}
          rowKey="agreementId"
          pagination={defaultPagination}
          size="small"
        />
      </Card>

      {/* 6. Owner / Landlord View */}
      <Title level={4} style={{ marginTop: 24, marginBottom: 16 }}>6. Owner / Landlord View</Title>
      <Card title="6.1 By Owner (Landlord)" style={{ marginBottom: 24 }}>
        <Table
          dataSource={misData.byOwnerLandlord || []}
          columns={[
            { title: 'Owner Name', dataIndex: 'ownerName', key: 'ownerName' },
            { title: 'Property Count', dataIndex: 'propertyCount', key: 'propertyCount' },
            { title: 'Total Monthly Rent', dataIndex: 'totalMonthlyRent', key: 'totalMonthlyRent', render: formatCurrency },
            { title: 'Total Advance Locked', dataIndex: 'totalAdvanceLocked', key: 'totalAdvanceLocked', render: formatCurrency },
            { title: 'Active Agreements', dataIndex: 'activeAgreements', key: 'activeAgreements' },
            { title: 'Landlord Rating', dataIndex: 'landlordRating', key: 'landlordRating' },
            { title: 'Status', dataIndex: 'status', key: 'status' },
          ]}
          rowKey="ownerName"
          pagination={defaultPagination}
          size="small"
        />
      </Card>

      {/* Download Reports */}
      <Card
        title="Download Reports"
        extra={
          <Dropdown
            menu={{
              items: [
                { key: 'financial', label: 'Financial Summary', icon: <FileExcelOutlined /> },
                { key: 'advanceRefund', label: 'Advance Refund Report', icon: <FileExcelOutlined /> },
                { key: 'vacating', label: 'Vacating Agreements', icon: <FileExcelOutlined /> },
                { key: 'allAgreements', label: 'All Agreements', icon: <FileExcelOutlined /> },
                { key: 'residences', label: 'All Residences', icon: <FileExcelOutlined /> },
                { key: 'employees', label: 'All Employees', icon: <FileExcelOutlined /> },
              ],
              onClick: handleReportExport,
            }}
            trigger={['click']}
          >
            <Button type="primary" icon={<DownloadOutlined />}>Export Reports</Button>
          </Dropdown>
        }
      >
        <Text type="secondary">Download various reports in Excel format. Report date: {misData.reportDate || '—'}</Text>
      </Card>
    </div>
  );
};

export default DashboardHome;
