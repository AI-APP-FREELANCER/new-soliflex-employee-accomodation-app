import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Table,
  Button,
  Space,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  DatePicker,
  message,
  Tag,
  Typography,
  Modal,
  Card,
  Dropdown,
  Row,
  Col,
} from 'antd';
import { PlusOutlined, EditOutlined, ReloadOutlined, DownloadOutlined, FilePdfOutlined, FileExcelOutlined, SearchOutlined } from '@ant-design/icons';
import { agreementAPI, residenceAPI } from '../services/api';
import { exportToPDF, exportTableToExcel } from '../utils/exportUtils';
import { formatDateForAPI, formatDateForDisplay, parseDateFromAPI, getMinDate, getMaxDate } from '../utils/dateUtils';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
dayjs.extend(utc);
dayjs.extend(timezone);
// Set default timezone to IST (Asia/Kolkata)
dayjs.tz.setDefault('Asia/Kolkata');

const { Title, Text } = Typography;
const { Option } = Select;

const Agreements = ({ initialFilter, onFilterClear }) => {
  const [agreements, setAgreements] = useState([]);
  const [residences, setResidences] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [refundModalVisible, setRefundModalVisible] = useState(false);
  const [renewalModalVisible, setRenewalModalVisible] = useState(false);
  const [vacateModalVisible, setVacateModalVisible] = useState(false);
  const [selectedAgreement, setSelectedAgreement] = useState(null);
  const [isRenewal, setIsRenewal] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('active'); // 'active' | 'inactive' | 'all'
  const [renewalStatusFilter, setRenewalStatusFilter] = useState(null); // 'Past Due' | 'Due Soon' | null
  const [residenceIdFilter, setResidenceIdFilter] = useState(null); // string | null
  const [isMobile, setIsMobile] = useState(false);
  const [form] = Form.useForm();
  const [refundForm] = Form.useForm();
  const [renewalForm] = Form.useForm();
  const [vacateForm] = Form.useForm();
  const tableRef = useRef(null);

  // Responsive detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    fetchResidences();
  }, []);

  // Fetch agreements when filters change
  useEffect(() => {
    fetchAgreements();
  }, [statusFilter, renewalStatusFilter, residenceIdFilter]);

  // Handle initial filter from navigation
  useEffect(() => {
    if (initialFilter === 'pastDue') {
      setRenewalStatusFilter('Past Due');
    } else if (initialFilter === 'due90') {
      setRenewalStatusFilter('Due Soon');
    } else if (initialFilter === 'review') {
      setRenewalStatusFilter(null); // Show all
    }
  }, [initialFilter]);

  const fetchAgreements = async () => {
    setLoading(true);
    try {
      // Build query parameters from filter states
      const params = {};
      if (statusFilter && statusFilter !== 'all') {
        params.status = statusFilter;
      }
      if (renewalStatusFilter) {
        params.renewal_status = renewalStatusFilter;
      }
      if (residenceIdFilter) {
        params.residence_id = residenceIdFilter;
      }
      
      const response = await agreementAPI.getAll(params);
      
      // CRITICAL FIX: Strict numerical parsing immediately after fetch
      // Convert all financial fields to numbers before storing in state
      const parsedAgreements = response.data.map(agreement => {
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
      
      setAgreements(parsedAgreements);
    } catch (error) {
      message.error('Failed to fetch agreements');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchResidences = async () => {
    try {
      const response = await residenceAPI.getAll();
      setResidences(response.data);
    } catch (error) {
      console.error(error);
    }
  };

  // Calculate renewal due date based on possession date + duration (default 11 months)
  const calculateRenewalDueDate = (possessionDate, durationMonths = 11) => {
    if (!possessionDate) return null;
    const startDate = dayjs(possessionDate);
    const endDate = startDate.add(durationMonths, 'month');
    return endDate.format('YYYY-MM-DD');
  };

  // Calculate end date from possession date
  const calculateEndDate = (possessionDate, durationMonths = 11) => {
    if (!possessionDate) return null;
    const startDate = dayjs(possessionDate);
    return startDate.add(durationMonths, 'month').format('YYYY-MM-DD');
  };

  const handleAdd = () => {
    form.resetFields();
    setSelectedAgreement(null);
    setIsRenewal(false);
    setFormVisible(true);
  };

  const handleEdit = (record) => {
    form.setFieldsValue({
      ...record,
      agreement_possesion_date: record.agreement_possesion_date ? parseDateFromAPI(record.agreement_possesion_date) : null,
      agreement_renewal_due_date: record.agreement_renewal_due_date ? parseDateFromAPI(record.agreement_renewal_due_date) : null,
    });
    setSelectedAgreement(record);
    setIsRenewal(false);
    setFormVisible(true);
  };

  const handleRenew = (record) => {
    // Pre-populate renewal form with same residence_id and suggest start date after current end date
    // NOTE: End date is now fully editable - user can set any duration (not limited to 11 months)
    const possessionDate = record.agreement_possesion_date;
    const durationMonths = 11; // Default suggestion only
    const currentEndDate = calculateEndDate(possessionDate, durationMonths);
    const suggestedStartDate = currentEndDate ? dayjs(currentEndDate).add(1, 'day') : dayjs();
    // Suggest end date, but user can edit it to any date they want
    const suggestedEndDate = suggestedStartDate.add(durationMonths, 'month');

    // Parse rent amount to ensure it's a number
    const rentValue = record.agreement_monthly_rent_amount;
    const parsedRent = typeof rentValue === 'string' 
      ? parseFloat(rentValue.replace(/[^\d.-]/g, '')) || 0
      : Number(rentValue) || 0;

    renewalForm.setFieldsValue({
      agreement_residence_id: record.agreement_residence_id,
      new_start_date: suggestedStartDate,
      new_end_date: suggestedEndDate, // User can edit this to any date
      new_monthly_rent: parsedRent,
    });
    setSelectedAgreement(record);
    setRenewalModalVisible(true);
  };

  const handleRenewSubmit = async (values) => {
    try {
      // Calculate renewal due date (possession + 11 months)
      const endDate = values.new_end_date;
      const renewalDueDate = endDate ? formatDateForAPI(endDate) : null;

      // Create new agreement
      const newAgreementData = {
        agreement_residence_id: values.agreement_residence_id,
        agreement_possesion_date: formatDateForAPI(values.new_start_date),
        agreement_renewal_due_date: renewalDueDate,
        agreement_monthly_rent_amount: values.new_monthly_rent,
        agreement_advance_amount: selectedAgreement?.agreement_advance_amount || 0,
        agreement_status: 'Active',
      };

      const newAgreementResponse = await agreementAPI.create(newAgreementData);
      const newAgreementId = newAgreementResponse.data?.agreement_id || newAgreementResponse.data?.id;

      // Mark old agreement as inactive (soft delete) with lifecycle management
      const now = new Date().toISOString();
      await agreementAPI.update(selectedAgreement.agreement_id, {
        status: 'inactive',
        agreement_status: 'Renewed',
        inactiveDate: now,
        agreement_renewal_due_date: null, // Clear obsolete due date on the old agreement
        reason: 'Agreement renewed - replaced by new agreement'
      });
      
      // Also update status history via deactivate endpoint for proper tracking
      try {
        await agreementAPI.deactivate(selectedAgreement.agreement_id, {
          reason: 'Agreement renewed - replaced by new agreement'
        });
      } catch (deactivateError) {
        // If deactivate endpoint doesn't exist yet, the update above is sufficient
        console.warn('Deactivate endpoint not available, using update method');
      }

      // Update employee allocations to new agreement_id (if needed)
      // Note: This would require employeeAPI to update allocations
      // For now, we'll just show a success message

      message.success(
        `Agreement renewed successfully! New Agreement ID: ${newAgreementId}. Old Agreement marked as Renewed.`
      );

      setRenewalModalVisible(false);
      renewalForm.resetFields();
      setSelectedAgreement(null);
      fetchAgreements();
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to renew agreement');
      console.error(error);
    }
  };

  const handleVacate = (record) => {
    setSelectedAgreement(record);
    vacateForm.resetFields();
    vacateForm.setFieldsValue({
      original_advance_amount: record.agreement_advance_amount || 0,
      maintenance_deduction: 0,
      net_received: record.agreement_advance_amount || 0,
    });
    setVacateModalVisible(true);
  };

  const handleVacateSubmit = async (values) => {
    try {
      const originalAdvance = parseFloat(values.original_advance_amount) || 0;
      const maintenanceDeduction = parseFloat(values.maintenance_deduction) || 0;
      const netReceived = parseFloat(values.net_received) || 0;

      // Validate: Net Received cannot exceed Original Advance
      if (netReceived > originalAdvance) {
        message.error('Net Received cannot exceed Original Advance Amount');
        return;
      }

      // Update agreement status to Closed/Vacated
      await agreementAPI.update(selectedAgreement.agreement_id, {
        agreement_status: 'Closed',
      });

      // Log financial transaction (store in localStorage for now, can be moved to backend)
      const transaction = {
        agreementId: selectedAgreement.agreement_id,
        originalAdvance,
        deduction: maintenanceDeduction,
        netReceived,
        timestamp: new Date().toISOString(),
      };

      // Get existing transactions from localStorage
      const existingTransactions = JSON.parse(localStorage.getItem('advanceTransactions') || '[]');
      existingTransactions.push(transaction);
      localStorage.setItem('advanceTransactions', JSON.stringify(existingTransactions));

      message.success(
        `Tenancy closed successfully. Original Advance: ₹${originalAdvance}, ` +
        `Maintenance Deduction: ₹${maintenanceDeduction}, Net Received: ₹${netReceived}`
      );

      setVacateModalVisible(false);
      vacateForm.resetFields();
      setSelectedAgreement(null);
      fetchAgreements();
    } catch (error) {
      message.error('Failed to close tenancy');
      console.error(error);
    }
  };

  const handleStatusChange = async (record, newStatus) => {
    if (newStatus === 'Inactive' && record.agreement_status === 'Active') {
      // Show refund modal for advance amount
      setSelectedAgreement(record);
      refundForm.resetFields();
      refundForm.setFieldsValue({
        agreement_advance_amount: record.agreement_advance_amount || 0,
      });
      setRefundModalVisible(true);
    } else {
      // Direct update
      try {
        await agreementAPI.update(record.agreement_id, { agreement_status: newStatus });
        message.success('Agreement updated successfully');
        fetchAgreements();
      } catch (error) {
        message.error('Failed to update agreement');
        console.error(error);
      }
    }
  };

  const handleRefundSubmit = async (values) => {
    try {
      const maintenanceCut = parseFloat(values.maintenance_cut_amount) || 0;
      const advanceAmount = parseFloat(values.agreement_advance_amount) || 0;
      const refundAmount = advanceAmount - maintenanceCut;

      // Update agreement status to Inactive
      await agreementAPI.update(selectedAgreement.agreement_id, {
        agreement_status: 'Inactive',
      });

      message.success(
        `Agreement marked as Inactive. Advance Amount: ₹${advanceAmount}, ` +
        `Maintenance Cut: ₹${maintenanceCut}, Refund Amount: ₹${refundAmount}`
      );

      setRefundModalVisible(false);
      refundForm.resetFields();
      fetchAgreements();
    } catch (error) {
      message.error('Failed to process refund');
      console.error(error);
    }
  };

  const handleSubmit = async (values) => {
    try {
      // Calculate renewal due date if possession date is provided
      if (values.agreement_possesion_date) {
        const possessionDate = formatDateForAPI(values.agreement_possesion_date);
        const durationMonths = 11; // Default, can be made configurable
        const renewalDueDate = calculateRenewalDueDate(possessionDate, durationMonths);
        
        values.agreement_possesion_date = possessionDate;
        values.agreement_renewal_due_date = renewalDueDate;
      }

      if (selectedAgreement) {
        await agreementAPI.update(selectedAgreement.agreement_id, values);
        message.success('Agreement updated successfully');
      } else {
        await agreementAPI.create(values);
        message.success(isRenewal ? 'Agreement renewed successfully' : 'Agreement created successfully');
      }
      setFormVisible(false);
      form.resetFields();
      fetchAgreements();
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to save agreement');
      console.error(error);
    }
  };

  // Watch possession date to auto-calculate renewal due date (for new agreements only)
  const possessionDate = Form.useWatch('agreement_possesion_date', form);

  useEffect(() => {
    if (possessionDate && !selectedAgreement) {
      const renewalDueDate = calculateRenewalDueDate(formatDateForAPI(possessionDate));
      form.setFieldsValue({
        agreement_renewal_due_date: renewalDueDate ? parseDateFromAPI(renewalDueDate) : null,
      });
    }
  }, [possessionDate, form, selectedAgreement]);

  // Watch renewal start date to suggest end date (optional helper - user can override)
  const renewalStartDate = Form.useWatch('new_start_date', renewalForm);

  useEffect(() => {
    // Only auto-suggest if end date is not already set
    // This allows user to manually set any end date they want (6 months, 18 months, etc.)
    if (renewalStartDate && renewalModalVisible) {
      const currentEndDate = renewalForm.getFieldValue('new_end_date');
      // Only suggest if end date is not set or if it's the default calculated value
      if (!currentEndDate) {
        const suggestedEndDate = renewalStartDate.add(11, 'month'); // Default suggestion only
        renewalForm.setFieldsValue({
          new_end_date: suggestedEndDate,
        });
      }
    }
  }, [renewalStartDate, renewalModalVisible, renewalForm]);

  // Calculate renewal counts from backend computed fields
  const renewalCounts = useMemo(() => {
    let pastDue = 0;
    let due90 = 0;

    agreements.forEach(agreement => {
      const renewalStatus = agreement.computed_renewal_status;
      if (renewalStatus === 'Past Due') {
        pastDue += 1;
      } else if (renewalStatus === 'Due Soon') {
        due90 += 1;
      }
    });

    return { pastDue, due90 };
  }, [agreements]);

  // Filter agreements based on search text and status (client-side backup filtering)
  const filteredAgreements = useMemo(() => {
    let result = agreements;

    // Apply status filter with case-insensitive comparison (backup to server-side filtering)
    if (statusFilter && statusFilter !== 'all') {
      const normalize = (str) => String(str || '').trim().toLowerCase();
      result = result.filter(agreement => {
        const agreementStatus = normalize(agreement.agreement_status || agreement.status);
        const filterStatus = normalize(statusFilter);
        return agreementStatus === filterStatus;
      });
    }

    // Apply search text filter (client-side for quick search)
    if (searchText.trim()) {
      const lowerSearch = searchText.toLowerCase().trim();
      result = result.filter(agreement => {
        const agreementId = (agreement.agreement_id || '').toLowerCase();
        const residenceId = (agreement.agreement_residence_id || '').toLowerCase();
        const monthlyRent = String(agreement.agreement_monthly_rent_amount || '').toLowerCase();
        const advanceAmount = String(agreement.agreement_advance_amount || '').toLowerCase();
        return (
          agreementId.includes(lowerSearch) ||
          residenceId.includes(lowerSearch) ||
          monthlyRent.includes(lowerSearch) ||
          advanceAmount.includes(lowerSearch)
        );
      });
    }

    return result;
  }, [searchText, agreements, statusFilter]);

  // Export handlers
  const handleExportPDF = async () => {
    try {
      message.loading({ content: 'Generating PDF...', key: 'export' });
      await exportToPDF(tableRef, `Agreements_${dayjs().format('YYYY-MM-DD')}.pdf`);
      message.success({ content: 'PDF exported successfully!', key: 'export' });
    } catch (error) {
      message.error({ content: 'Failed to export PDF', key: 'export' });
      console.error(error);
    }
  };

  const handleExportExcel = () => {
    try {
      message.loading({ content: 'Generating Excel...', key: 'export' });
      
      const exportData = filteredAgreements.map(a => ({
        'Agreement ID': a.agreement_id || '',
        'Residence ID': a.agreement_residence_id || '',
        'Possession Date': a.agreement_possesion_date || '',
        'Renewal Due Date': a.agreement_renewal_due_date || '',
        'Employee Unit': a.agreement_employee_unit || '',
        'Monthly Rent Amount': a.agreement_monthly_rent_amount || 0,
        'Advance Amount': a.agreement_advance_amount || 0,
        'Status': a.agreement_status || '',
      }));

      exportTableToExcel(exportData, 'Agreements', `Agreements_${dayjs().format('YYYY-MM-DD')}.xlsx`);
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

  const columns = [
    {
      title: 'Agreement ID',
      dataIndex: 'agreement_id',
      key: 'agreement_id',
    },
    {
      title: 'Residence ID',
      dataIndex: 'agreement_residence_id',
      key: 'agreement_residence_id',
    },
    {
      title: 'Possession Date',
      dataIndex: 'agreement_possesion_date',
      key: 'agreement_possesion_date',
      render: (date) => date ? formatDateForDisplay(date) : 'N/A',
    },
    {
      title: 'Renewal Due Date',
      dataIndex: 'agreement_renewal_due_date',
      key: 'agreement_renewal_due_date',
      render: (date, record) => {
        if (!date) return 'N/A';
        const formattedDate = formatDateForDisplay(date);
        const daysUntilRenewal = record.days_until_renewal;
        
        if (daysUntilRenewal === null || daysUntilRenewal === undefined) {
          return formattedDate;
        }
        
        if (daysUntilRenewal < 0) {
          return `${formattedDate} (${Math.abs(daysUntilRenewal)} days overdue)`;
        } else if (daysUntilRenewal === 0) {
          return `${formattedDate} (Due today)`;
        } else {
          return `${formattedDate} (${daysUntilRenewal} days left)`;
        }
      },
    },
    {
      title: 'Renewal Status',
      dataIndex: 'computed_renewal_status',
      key: 'computed_renewal_status',
      render: (status) => {
        if (!status || status === 'N/A') {
          return <Tag color="default">N/A</Tag>;
        }
        if (status === 'Past Due') {
          return <Tag color="red">Past Due</Tag>;
        }
        if (status === 'Due Soon') {
          return <Tag color="orange">Due Soon</Tag>;
        }
        return <Tag>{status}</Tag>;
      },
    },
    {
      title: 'Monthly Rent',
      dataIndex: 'agreement_monthly_rent_amount',
      key: 'agreement_monthly_rent_amount',
      render: (amount) => `₹${amount || 0}`,
    },
    {
      title: 'Advance Amount',
      dataIndex: 'agreement_advance_amount',
      key: 'agreement_advance_amount',
      render: (amount) => `₹${amount || 0}`,
    },
    {
      title: 'Status',
      dataIndex: 'agreement_status',
      key: 'agreement_status',
      render: (status) => (
        <Tag color={status === 'Active' ? 'green' : 'red'}>
          {status}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => {
        // CRITICAL FIX: Button visibility based on actual backend data, not state
        // Use case-insensitive status check
        const status = (record.agreement_status || '').toString().trim();
        const isActive = status.toLowerCase() === 'active';
        
        // Check if renewal is due using backend computed field
        const renewalStatus = record.computed_renewal_status;
        const isRenewalDue = renewalStatus === 'Past Due' || renewalStatus === 'Due Soon';
        
        return (
          <Space>
            {/* Renew button: Show for active agreements with renewal due date nearing/past */}
            {isActive && isRenewalDue && (
              <Button
                type="link"
                icon={<ReloadOutlined />}
                onClick={() => handleRenew(record)}
              >
                Renew
              </Button>
            )}
            {/* Vacate/Close button: Show for all active agreements */}
            {isActive && (
              <Button
                type="link"
                danger
                onClick={() => handleVacate(record)}
              >
                Vacate / Close
              </Button>
            )}
            <Button
              type="link"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            >
              Edit
            </Button>
            <Select
              value={record.agreement_status}
              onChange={(value) => handleStatusChange(record, value)}
              style={{ width: 100 }}
              size="small"
            >
              <Option value="Active">Active</Option>
              <Option value="Inactive">Inactive</Option>
              <Option value="Renewed">Renewed</Option>
              <Option value="Closed">Closed</Option>
            </Select>
          </Space>
        );
      },
    },
  ];

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
    <div>
      <div style={{ 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between', 
        marginBottom: '24px',
        gap: isMobile ? '16px' : 0,
      }}>
        <Title level={2} style={{ color: '#262626', margin: 0, fontSize: isMobile ? '20px' : '24px' }}>
          Agreements Management
        </Title>
        <Space direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: isMobile ? '100%' : 'auto' }}>
          <Dropdown menu={{ items: exportMenuItems, onClick: handleExportMenuClick }}>
            <Button icon={<DownloadOutlined />} block={isMobile}>
              Download
            </Button>
          </Dropdown>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAdd}
            block={isMobile}
          >
            Add Agreement
          </Button>
        </Space>
      </div>

      {/* Advanced Filter Bar */}
      <Card style={{ marginBottom: '16px' }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={8} lg={6}>
            <div style={{ marginBottom: '8px' }}>
              <Text strong>Status:</Text>
            </div>
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: '100%' }}
              placeholder="Select Status"
            >
              <Option value="active">Active</Option>
              <Option value="inactive">Inactive</Option>
              <Option value="all">All</Option>
            </Select>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <div style={{ marginBottom: '8px' }}>
              <Text strong>Renewal Urgency:</Text>
            </div>
            <Select
              value={renewalStatusFilter}
              onChange={setRenewalStatusFilter}
              style={{ width: '100%' }}
              placeholder="All"
              allowClear
            >
              <Option value="Past Due">Past Due ({renewalCounts.pastDue})</Option>
              <Option value="Due Soon">Due Soon ({renewalCounts.due90})</Option>
            </Select>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <div style={{ marginBottom: '8px' }}>
              <Text strong>Residence ID:</Text>
            </div>
            <Select
              value={residenceIdFilter}
              onChange={setResidenceIdFilter}
              style={{ width: '100%' }}
              placeholder="Select Residence"
              showSearch
              allowClear
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={residences.map(r => ({
                value: r.residence_id,
                label: `${r.residence_id}${r.residence_door_number ? ` - ${r.residence_door_number}` : ''}`,
              }))}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <div style={{ marginBottom: '8px' }}>
              <Text strong>Search:</Text>
            </div>
            <Input
              placeholder="Search by ID, Rent, Advance..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
            />
          </Col>
          {(statusFilter !== 'active' || renewalStatusFilter || residenceIdFilter) && (
            <Col xs={24}>
              <Button
                onClick={() => {
                  setStatusFilter('active');
                  setRenewalStatusFilter(null);
                  setResidenceIdFilter(null);
                  if (onFilterClear) onFilterClear();
                }}
              >
                Clear Filters
              </Button>
            </Col>
          )}
        </Row>
      </Card>

      <div ref={tableRef}>
        {isMobile ? (
          // Mobile Card View
          <div>
            {filteredAgreements.map((agreement) => {
              const residence = residences.find(r => r.residence_id === agreement.agreement_residence_id);
              return (
                <Card
                  key={agreement.agreement_id}
                  style={{ marginBottom: '16px' }}
                  actions={[
                    <Button
                      key="edit"
                      type="link"
                      icon={<EditOutlined />}
                      onClick={() => handleEdit(agreement)}
                      block
                    >
                      Edit
                    </Button>,
                  ]}
                >
                  <Space direction="vertical" style={{ width: '100%' }} size="small">
                    <div>
                      <Text strong>Agreement ID: </Text>
                      <Text>{agreement.agreement_id}</Text>
                    </div>
                    <div>
                      <Text strong>Residence ID: </Text>
                      <Text>{agreement.agreement_residence_id || 'N/A'}</Text>
                    </div>
                    <div>
                      <Text strong>Monthly Rent: </Text>
                      <Text>₹{agreement.agreement_monthly_rent_amount?.toLocaleString('en-IN') || '0'}</Text>
                    </div>
                    <div>
                      <Text strong>Advance: </Text>
                      <Text>₹{agreement.agreement_advance_amount?.toLocaleString('en-IN') || '0'}</Text>
                    </div>
                    <div>
                      <Text strong>Possession Date: </Text>
                      <Text>{formatDateForDisplay(agreement.agreement_possesion_date) || 'N/A'}</Text>
                    </div>
                    <div>
                      <Text strong>Renewal Due Date: </Text>
                      <Text>
                        {agreement.agreement_renewal_due_date ? (() => {
                          const formattedDate = formatDateForDisplay(agreement.agreement_renewal_due_date);
                          const daysUntilRenewal = agreement.days_until_renewal;
                          if (daysUntilRenewal === null || daysUntilRenewal === undefined) {
                            return formattedDate;
                          }
                          if (daysUntilRenewal < 0) {
                            return `${formattedDate} (${Math.abs(daysUntilRenewal)} days overdue)`;
                          } else if (daysUntilRenewal === 0) {
                            return `${formattedDate} (Due today)`;
                          } else {
                            return `${formattedDate} (${daysUntilRenewal} days left)`;
                          }
                        })() : 'N/A'}
                      </Text>
                    </div>
                    <div>
                      <Text strong>Renewal Status: </Text>
                      {(() => {
                        const status = agreement.computed_renewal_status;
                        if (!status || status === 'N/A') {
                          return <Tag color="default">N/A</Tag>;
                        }
                        if (status === 'Past Due') {
                          return <Tag color="red">Past Due</Tag>;
                        }
                        if (status === 'Due Soon') {
                          return <Tag color="orange">Due Soon</Tag>;
                        }
                        return <Tag>{status}</Tag>;
                      })()}
                    </div>
                    <div>
                      <Text strong>Status: </Text>
                      <Tag color={agreement.agreement_status === 'Active' ? 'green' : 'red'}>
                        {agreement.agreement_status}
                      </Tag>
                    </div>
                  </Space>
                </Card>
              );
            })}
            {filteredAgreements.length === 0 && !loading && (
              <div style={{ textAlign: 'center', padding: '40px', color: '#8c8c8c' }}>
                No agreements found
              </div>
            )}
          </div>
        ) : (
          // Desktop Table View
          <div style={{ overflowX: 'auto' }}>
            <Table
              columns={columns}
              dataSource={filteredAgreements}
              loading={loading}
              rowKey="agreement_id"
              scroll={{ x: 'max-content' }}
              pagination={{
                pageSize: pageSize,
                showSizeChanger: true,
                pageSizeOptions: ['10', '25', '50', '100'],
                onShowSizeChange: (current, size) => {
                  setPageSize(size);
                },
              }}
            />
          </div>
        )}
      </div>

      {/* Create/Edit Form Drawer */}
      <Drawer
        title={selectedAgreement ? 'Edit Agreement' : isRenewal ? 'Renew Agreement' : 'Add Agreement'}
        placement="right"
        width={isMobile ? '100%' : 500}
        onClose={() => {
          setFormVisible(false);
          form.resetFields();
        }}
        open={formVisible}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="agreement_residence_id"
            label="Residence ID"
            rules={[{ required: true, message: 'Please select residence!' }]}
          >
            <Select
              placeholder="Select Residence"
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            >
              {residences.map((residence) => (
                <Option key={residence.residence_id} value={residence.residence_id} label={residence.residence_id}>
                  {residence.residence_id} - {residence.residence_owner_name || 'N/A'}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="agreement_possesion_date"
            label="Possession Date (DD-MM-YYYY)"
            rules={[
              { required: true, message: 'Please select possession date!' },
              {
                validator: (_, value) => {
                  if (!value) return Promise.resolve();
                  const year = value.year();
                  if (year < 2023 || year > 2100) {
                    return Promise.reject(new Error('Date must be between 2023 and 2100'));
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <DatePicker 
              style={{ width: '100%' }} 
              format="DD-MM-YYYY"
              disabledDate={(current) => {
                if (!current) return false;
                return current.isBefore(getMinDate(), 'day') || current.isAfter(getMaxDate(), 'day');
              }}
            />
          </Form.Item>

          <Form.Item
            name="agreement_renewal_due_date"
            label="Renewal Due Date (Auto-calculated: 90 days before end date)"
          >
            <DatePicker 
              style={{ width: '100%' }} 
              format="DD-MM-YYYY" 
              disabled
              disabledDate={(current) => {
                if (!current) return false;
                return current.isBefore(getMinDate(), 'day') || current.isAfter(getMaxDate(), 'day');
              }}
            />
          </Form.Item>

          <Form.Item
            name="agreement_employee_unit"
            label="Employee Unit"
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="agreement_advance_amount"
            label="Advance Amount"
          >
            <InputNumber min={0} style={{ width: '100%' }} prefix="₹" />
          </Form.Item>

          <Form.Item
            name="agreement_monthly_rent_amount"
            label="Monthly Rent Amount"
          >
            <InputNumber min={0} style={{ width: '100%' }} prefix="₹" />
          </Form.Item>

          <Form.Item
            name="agreement_status"
            label="Status"
            rules={[{ required: true, message: 'Please select status!' }]}
          >
            <Select>
              <Option value="Active">Active</Option>
              <Option value="Inactive">Inactive</Option>
            </Select>
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {selectedAgreement ? 'Update' : isRenewal ? 'Renew' : 'Create'}
              </Button>
              <Button onClick={() => {
                setFormVisible(false);
                form.resetFields();
              }}>
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Drawer>

      {/* Advance Refund Modal */}
      <Modal
        title="Advance Refund Processing"
        open={refundModalVisible}
        onOk={() => refundForm.submit()}
        onCancel={() => {
          setRefundModalVisible(false);
          refundForm.resetFields();
        }}
        okText="Process Refund"
        cancelText="Cancel"
      >
        <Form
          form={refundForm}
          layout="vertical"
          onFinish={handleRefundSubmit}
        >
          <Card style={{ marginBottom: '16px', background: '#1f1f1f' }}>
            <p><strong>Agreement ID:</strong> {selectedAgreement?.agreement_id}</p>
            <p><strong>Residence ID:</strong> {selectedAgreement?.agreement_residence_id}</p>
          </Card>

          <Form.Item
            name="agreement_advance_amount"
            label="Original Advance Amount"
          >
            <InputNumber min={0} style={{ width: '100%' }} prefix="₹" disabled />
          </Form.Item>

          <Form.Item
            name="maintenance_cut_amount"
            label="Maintenance Cut Amount"
            rules={[{ required: true, message: 'Please input maintenance cut amount!' }]}
          >
            <InputNumber min={0} style={{ width: '100%' }} prefix="₹" />
          </Form.Item>

          <Form.Item shouldUpdate>
            {() => {
              const advanceAmount = refundForm.getFieldValue('agreement_advance_amount') || 0;
              const maintenanceCut = refundForm.getFieldValue('maintenance_cut_amount') || 0;
              const refundAmount = advanceAmount - maintenanceCut;
              
              return (
                <Card style={{ background: '#1f1f1f', marginTop: '16px' }}>
                  <p><strong>Advance Amount:</strong> ₹{advanceAmount}</p>
                  <p><strong>Maintenance Cut:</strong> ₹{maintenanceCut}</p>
                  <p style={{ fontSize: '16px', fontWeight: 'bold', color: '#1890ff' }}>
                    <strong>Refund Amount:</strong> ₹{refundAmount}
                  </p>
                </Card>
              );
            }}
          </Form.Item>
        </Form>
      </Modal>

      {/* Agreement Renewal Modal */}
      <Modal
        title="Renew Agreement"
        open={renewalModalVisible}
        onOk={() => renewalForm.submit()}
        onCancel={() => {
          setRenewalModalVisible(false);
          renewalForm.resetFields();
          setSelectedAgreement(null);
        }}
        okText="Renew Agreement"
        cancelText="Cancel"
        width={600}
      >
        <Form
          form={renewalForm}
          layout="vertical"
          onFinish={handleRenewSubmit}
        >
          <Card style={{ marginBottom: '16px', background: '#f0f2f5' }}>
            <p><strong>Original Agreement ID:</strong> {selectedAgreement?.agreement_id}</p>
            <p><strong>Residence ID:</strong> {selectedAgreement?.agreement_residence_id}</p>
            <p><strong>Current Monthly Rent:</strong> ₹{selectedAgreement?.agreement_monthly_rent_amount || 0}</p>
          </Card>

          <Form.Item
            name="agreement_residence_id"
            label="Residence ID"
          >
            <Input disabled />
          </Form.Item>

          <Form.Item
            name="new_start_date"
            label="New Agreement Start Date (DD-MM-YYYY)"
            rules={[
              { required: true, message: 'Please select start date!' },
              {
                validator: (_, value) => {
                  if (!value) return Promise.resolve();
                  const year = value.year();
                  if (year < 2023 || year > 2100) {
                    return Promise.reject(new Error('Date must be between 2023 and 2100'));
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <DatePicker 
              style={{ width: '100%' }} 
              format="DD-MM-YYYY"
              disabledDate={(current) => {
                if (!current) return false;
                return current.isBefore(getMinDate(), 'day') || current.isAfter(getMaxDate(), 'day');
              }}
            />
          </Form.Item>

          <Form.Item
            name="new_end_date"
            label="New Agreement End Date (DD-MM-YYYY)"
            rules={[
              { required: true, message: 'Please select end date!' },
              {
                validator: (_, value) => {
                  if (!value) return Promise.resolve();
                  const year = value.year();
                  if (year < 2023 || year > 2100) {
                    return Promise.reject(new Error('Date must be between 2023 and 2100'));
                  }
                  return Promise.resolve();
                },
              },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || !getFieldValue('new_start_date')) {
                    return Promise.resolve();
                  }
                  if (value.isAfter(getFieldValue('new_start_date'))) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('End date must be after start date!'));
                },
              }),
            ]}
          >
            <DatePicker 
              style={{ width: '100%' }} 
              format="DD-MM-YYYY"
              disabledDate={(current) => {
                if (!current) return false;
                return current.isBefore(getMinDate(), 'day') || current.isAfter(getMaxDate(), 'day');
              }}
            />
          </Form.Item>

          <Form.Item
            name="new_monthly_rent"
            label="New Monthly Rent Amount"
            rules={[
              { required: true, message: 'Please input monthly rent!' },
              { type: 'number', min: 0, message: 'Rent must be positive!' },
            ]}
          >
            <InputNumber min={0} style={{ width: '100%' }} prefix="₹" />
          </Form.Item>

          <Form.Item shouldUpdate>
            {() => {
              const oldRent = selectedAgreement?.agreement_monthly_rent_amount || 0;
              const newRent = renewalForm.getFieldValue('new_monthly_rent') || 0;
              const rentChange = newRent - oldRent;
              const rentChangePercent = oldRent > 0 ? ((rentChange / oldRent) * 100).toFixed(2) : 0;
              
              return (
                <Card style={{ background: '#f0f2f5', marginTop: '16px' }}>
                  <p><strong>Old Monthly Rent:</strong> ₹{oldRent}</p>
                  <p><strong>New Monthly Rent:</strong> ₹{newRent}</p>
                  <p style={{ fontSize: '16px', fontWeight: 'bold', color: rentChange >= 0 ? '#52c41a' : '#ff4d4f' }}>
                    <strong>Rent Change:</strong> ₹{rentChange >= 0 ? '+' : ''}{rentChange} ({rentChangePercent >= 0 ? '+' : ''}{rentChangePercent}%)
                  </p>
                </Card>
              );
            }}
          </Form.Item>
        </Form>
      </Modal>

      {/* Vacate / Close Tenancy Modal */}
      <Modal
        title="Vacate / Close Tenancy"
        open={vacateModalVisible}
        onOk={() => vacateForm.submit()}
        onCancel={() => {
          setVacateModalVisible(false);
          vacateForm.resetFields();
          setSelectedAgreement(null);
        }}
        okText="Close Tenancy"
        cancelText="Cancel"
        width={600}
      >
        <Form
          form={vacateForm}
          layout="vertical"
          onFinish={handleVacateSubmit}
        >
          <Card style={{ marginBottom: '16px', background: '#f0f2f5' }}>
            <p><strong>Agreement ID:</strong> {selectedAgreement?.agreement_id}</p>
            <p><strong>Residence ID:</strong> {selectedAgreement?.agreement_residence_id}</p>
          </Card>

          <Form.Item
            name="original_advance_amount"
            label="Original Advance Amount"
          >
            <InputNumber min={0} style={{ width: '100%' }} prefix="₹" disabled />
          </Form.Item>

          <Form.Item
            name="maintenance_deduction"
            label="Owner Maintenance Deduction"
            rules={[
              { required: true, message: 'Please input maintenance deduction amount!' },
              { type: 'number', min: 0, message: 'Deduction must be positive!' },
            ]}
          >
            <InputNumber 
              min={0} 
              style={{ width: '100%' }} 
              prefix="₹"
              onChange={(value) => {
                const originalAdvance = vacateForm.getFieldValue('original_advance_amount') || 0;
                const deduction = value || 0;
                const netReceived = Math.max(0, originalAdvance - deduction);
                vacateForm.setFieldsValue({ net_received: netReceived });
              }}
            />
          </Form.Item>

          <Form.Item
            name="net_received"
            label="Amount Received Back by Company"
            rules={[
              { required: true, message: 'Please input net received amount!' },
              { type: 'number', min: 0, message: 'Net received must be positive!' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  const originalAdvance = getFieldValue('original_advance_amount') || 0;
                  if (!value || value <= originalAdvance) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('Net Received cannot exceed Original Advance!'));
                },
              }),
            ]}
          >
            <InputNumber min={0} style={{ width: '100%' }} prefix="₹" />
          </Form.Item>

          <Form.Item shouldUpdate>
            {() => {
              const originalAdvance = vacateForm.getFieldValue('original_advance_amount') || 0;
              const maintenanceDeduction = vacateForm.getFieldValue('maintenance_deduction') || 0;
              const netReceived = vacateForm.getFieldValue('net_received') || 0;
              
              return (
                <Card style={{ background: '#f0f2f5', marginTop: '16px' }}>
                  <p><strong>Original Advance Amount:</strong> ₹{originalAdvance}</p>
                  <p><strong>Maintenance Deduction:</strong> ₹{maintenanceDeduction}</p>
                  <p style={{ fontSize: '16px', fontWeight: 'bold', color: '#1890ff' }}>
                    <strong>Net Received Amount:</strong> ₹{netReceived}
                  </p>
                </Card>
              );
            }}
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Agreements;

