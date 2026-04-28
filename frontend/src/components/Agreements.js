import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Table, Card, Button, Input, InputNumber, Tag, Space, Select, DatePicker, message, Modal, Form, Row, Col, Typography, Empty, Popconfirm } from 'antd';
import { SearchOutlined, PlusOutlined, EditOutlined, ReloadOutlined, EyeOutlined, DeleteOutlined, UploadOutlined, CalendarOutlined, DollarOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { agreementAPI, residenceAPI } from '../services/api';
import apiClient from '../services/api';
import dayjs from 'dayjs';
import { formatDateForDisplay } from '../utils/dateUtils';
import { useSearchParams } from 'react-router-dom';

const { Title, Text } = Typography;
const { Option } = Select;

const Agreements = () => {
  const [agreements, setAgreements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  // Filters
  const [statusFilter, setStatusFilter] = useState('Active');
  const [residenceFilter, setResidenceFilter] = useState(null);
  const [renewalFilter, setRenewalFilter] = useState(null);
  
  const [residences, setResidences] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingAgreement, setEditingAgreement] = useState(null);
  const [form] = Form.useForm();
  
  // PDF Attachment states
  const [pdfUrl, setPdfUrl] = useState(null);
  const [isPdfModalVisible, setIsPdfModalVisible] = useState(false);
  const [pdfTitle, setPdfTitle] = useState('View PDF Attachment');
  const fileInputRef = useRef(null);
  const currentUploadId = useRef(null);
  
  // Vacate and Refund states
  const [isRefundModalVisible, setIsRefundModalVisible] = useState(false);
  const [isVacateModalVisible, setIsVacateModalVisible] = useState(false);
  const [selectedAgreementForRefund, setSelectedAgreementForRefund] = useState(null);
  const [selectedAgreementForVacate, setSelectedAgreementForVacate] = useState(null);
  const [selectedResidence, setSelectedResidence] = useState(null);
  const [refundForm] = Form.useForm();
  const dedElectric = Form.useWatch('agreement_deduction_electricity', refundForm);
  const dedWater = Form.useWatch('agreement_deduction_water', refundForm);
  const dedOther = Form.useWatch('agreement_deduction_other', refundForm);
  const [vacateForm] = Form.useForm();
  
  // Use modern useSearchParams hook for reliable URL parameter reading
  const [searchParams] = useSearchParams();

  // Handle URL filters - clear conflicting filters and apply the specific filter
  useEffect(() => {
    const filterParam = searchParams.get('filter');
    
    if (filterParam) {
      // Clear potentially conflicting filters to ensure clean slate
      setSearchText('');
      setResidenceFilter(null);
      
      // Ensure we are looking at 'Active' agreements (since Past Due/Due Soon are only relevant for Active)
      setStatusFilter('Active');

      // Map the URL param to the exact Select Option values
      if (filterParam === 'pastDue') {
        setRenewalFilter('Past Due');
      } else if (filterParam === 'due90') {
        setRenewalFilter('Due Soon');
      } else if (filterParam === 'scheduledToVacate') {
        setRenewalFilter('Scheduled to Vacate');
      }
    }
  }, [searchParams]);

  useEffect(() => {
    fetchResidences();
  }, []);

  useEffect(() => {
    fetchAgreements();
  }, []);

  const fetchResidences = async () => {
    try {
      const response = await residenceAPI.getAll();
      const data = Array.isArray(response.data) ? response.data : (response.data?.data || []);
      setResidences(data);
    } catch (error) {
      // Failed to fetch residences - handled silently
    }
  };

  const fetchAgreements = async () => {
    setLoading(true);
    try {
      // Always fetch ALL to ensure filters work on full dataset
      const response = await agreementAPI.getAll({ status: 'all' });
      
      let data = [];
      if (Array.isArray(response.data)) {
        data = response.data;
      } else if (response.data && Array.isArray(response.data.data)) {
        data = response.data.data;
      }
      setAgreements(data);
    } catch (error) {
      message.error('Failed to fetch agreements');
    } finally {
      setLoading(false);
    }
  };

  // --- ROBUST FILTER LOGIC ---
  const filteredAgreements = useMemo(() => {
    let result = agreements;

    // 1. Status Filter (Case-Insensitive)
    if (statusFilter !== 'All') {
      result = result.filter(item => {
        const itemStatus = String(item.agreement_status || item.status || '').trim().toLowerCase();
        const targetStatus = statusFilter.toLowerCase();
        return itemStatus === targetStatus;
      });
    }

    // 2. Residence Filter
    if (residenceFilter) {
      result = result.filter(item => item.agreement_residence_id === residenceFilter);
    }

    // 3. Renewal Urgency Filter (Matches Backend Calculation)
    if (renewalFilter) {
      if (renewalFilter === 'Scheduled to Vacate') {
        result = result.filter(item => 
          item.agreement_scheduled_to_vacate === true || 
          item.agreement_scheduled_to_vacate === 'Yes' || 
          item.agreement_scheduled_to_vacate === 'yes'
        );
      } else {
        result = result.filter(item => item.computed_renewal_status === renewalFilter);
      }
    }

    // 4. Search Text
    if (searchText.trim()) {
      const lowerSearch = searchText.toLowerCase().trim();
      result = result.filter(item => {
        return (
          String(item.agreement_id || '').toLowerCase().includes(lowerSearch) ||
          String(item.agreement_residence_id || '').toLowerCase().includes(lowerSearch) ||
          String(item.landlord_name || '').toLowerCase().includes(lowerSearch)
        );
      });
    }

    return result;
  }, [agreements, searchText, statusFilter, residenceFilter, renewalFilter]);

  const nowrap = { whiteSpace: 'nowrap' };

  const columns = [
    {
      title: 'Agreement ID',
      dataIndex: 'agreement_id',
      key: 'agreement_id',
      width: 168,
      render: (text) => (
        <Text strong style={nowrap} title={text}>
          {text}
        </Text>
      ),
    },
    {
      title: 'Residence ID',
      dataIndex: 'agreement_residence_id',
      key: 'agreement_residence_id',
      width: 188,
      render: (text) => (
        <span style={nowrap} title={text}>
          {text || '—'}
        </span>
      ),
    },
    {
      title: 'Monthly Rent',
      dataIndex: 'agreement_monthly_rent_amount',
      key: 'agreement_monthly_rent_amount',
      width: 128,
      align: 'right',
      render: (val) => <span style={nowrap}>{val ? `₹${Number(val).toLocaleString()}` : '-'}</span>,
    },
    {
      title: 'Renewal Date',
      key: 'renewal',
      width: 220,
      render: (_, record) => {
        if (!record.agreement_renewal_due_date) return <Text type="secondary">N/A</Text>;
        const dateStr = formatDateForDisplay(record.agreement_renewal_due_date);
        
        if (record.computed_renewal_status === 'Past Due') {
          return <Tag color="red" style={nowrap}>{dateStr} (Past Due)</Tag>;
        }
        if (record.computed_renewal_status === 'Due Soon') {
          return <Tag color="orange" style={nowrap}>{dateStr} (Due Soon)</Tag>;
        }
        return <span style={nowrap}>{dateStr}</span>;
      }
    },
    {
      title: 'Status',
      dataIndex: 'agreement_status',
      key: 'agreement_status',
      width: 100,
      align: 'center',
      render: (status) => {
        const s = String(status || '').toLowerCase();
        return <Tag color={s === 'active' ? 'green' : 'default'} style={nowrap}>{s === 'active' ? 'Active' : 'Inactive'}</Tag>;
      },
    },
    {
      title: 'Attachment',
      key: 'attachment',
      width: 200,
      align: 'center',
      render: (_, record) => (
        <Space>
          {record.has_attachment ? (
            <>
              <Button 
                icon={<EyeOutlined />} 
                onClick={() => handleViewPdf(record.agreement_id)}
                title="View PDF"
              />
              <Popconfirm 
                title="Delete attachment?"
                description="Are you sure you want to delete this PDF attachment?"
                onConfirm={() => handleDeletePdf(record.agreement_id)}
                okText="Yes"
                cancelText="No"
              >
                <Button 
                  icon={<DeleteOutlined />} 
                  danger
                  title="Delete PDF"
                />
              </Popconfirm>
            </>
          ) : (
            <Button 
              icon={<UploadOutlined />} 
              onClick={() => triggerUpload(record.agreement_id)}
            >
              Upload
            </Button>
          )}
        </Space>
      ),
    },
    {
      title: 'Scheduled to Vacate',
      key: 'scheduled_to_vacate',
      width: 168,
      render: (_, record) => {
        const isScheduled = record.agreement_scheduled_to_vacate === true || 
                           record.agreement_scheduled_to_vacate === 'Yes' || 
                           record.agreement_scheduled_to_vacate === 'yes';
        if (isScheduled && record.agreement_vacate_date) {
          return <Tag color="orange" style={nowrap}>{formatDateForDisplay(record.agreement_vacate_date)}</Tag>;
        }
        return <Text type="secondary">-</Text>;
      },
    },
    {
      title: 'Advance Status',
      key: 'advance_status',
      width: 200,
      render: (_, record) => {
        const advanceReceived = parseFloat(record.agreement_advance_received || 0);
        const advanceDueBack = parseFloat(record.agreement_advance_due_back || 0);
        const status = String(record.agreement_status || '').toLowerCase();
        
        if (status === 'inactive') {
          if (advanceReceived > 0) {
            return <Tag color="green">Received: ₹{advanceReceived.toLocaleString()}</Tag>;
          } else if (advanceDueBack > 0) {
            return <Tag color="orange">Due Back: ₹{advanceDueBack.toLocaleString()}</Tag>;
          }
        }
        return <Text type="secondary">-</Text>;
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 400,
      render: (_, record) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} title="Edit">Edit</Button>
          {(record.agreement_scheduled_to_vacate === true || 
            record.agreement_scheduled_to_vacate === 'Yes' || 
            record.agreement_scheduled_to_vacate === 'yes') ? (
            <Popconfirm
              title="Revoke Scheduled Vacate?"
              description="Are you sure you want to cancel the scheduled vacate date? This will remove the vacate schedule."
              onConfirm={() => handleRevokeVacate(record)}
              okText="Yes, Revoke"
              cancelText="Cancel"
            >
              <Button 
                icon={<CloseCircleOutlined />} 
                title="Revoke Scheduled Vacate"
                danger
              >
                Revoke Vacate
              </Button>
            </Popconfirm>
          ) : (
            <Button 
              icon={<CalendarOutlined />} 
              onClick={() => handleScheduleVacate(record)}
              title="Set to Vacate"
            >
              Set to Vacate
            </Button>
          )}
          {(String(record.agreement_status || '').toLowerCase() === 'inactive' || 
            record.agreement_scheduled_to_vacate === true || 
            record.agreement_scheduled_to_vacate === 'Yes' || 
            record.agreement_scheduled_to_vacate === 'yes') && (
            <Button 
              icon={<DollarOutlined />} 
              onClick={() => handleProcessRefund(record)}
              title="Process Refund"
              type="primary"
            >
              Process Refund
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const handleEdit = (record) => {
    setEditingAgreement(record);
    form.setFieldsValue({
      ...record,
      agreement_renewal_due_date: record.agreement_renewal_due_date ? dayjs(record.agreement_renewal_due_date) : null
    });
    setIsModalVisible(true);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      if (values.agreement_renewal_due_date) {
        values.agreement_renewal_due_date = values.agreement_renewal_due_date.format('YYYY-MM-DD');
      }

      if (editingAgreement) {
        await agreementAPI.update(editingAgreement.agreement_id, values);
        message.success('Agreement updated');
      } else {
        await agreementAPI.create(values);
        message.success('Agreement created');
      }
      setIsModalVisible(false);
      setEditingAgreement(null);
      form.resetFields();
      fetchAgreements();
    } catch (error) {
      message.error('Operation failed');
    }
  };

  // PDF Attachment Handlers
  const triggerUpload = (agreementId) => {
    currentUploadId.current = agreementId;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (file.type !== 'application/pdf') {
      message.error('Only PDF files are allowed');
      event.target.value = ''; // Reset input
      return;
    }

    // Validate file size (3MB = 3 * 1024 * 1024 bytes)
    const maxSize = 3 * 1024 * 1024;
    if (file.size > maxSize) {
      message.error('File size exceeds 3MB limit');
      event.target.value = ''; // Reset input
      return;
    }

    const agreementId = currentUploadId.current;
    if (!agreementId) return;

    try {
      const formData = new FormData();
      formData.append('file', file);

      await agreementAPI.uploadAttachment(agreementId, formData);
      message.success('PDF uploaded successfully');
      fetchAgreements(); // Refresh to show the new attachment
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Failed to upload PDF';
      message.error(errorMessage);
    } finally {
      event.target.value = ''; // Reset input
      currentUploadId.current = null;
    }
  };

  const handleViewPdf = async (agreementId) => {
    const hide = message.loading('Loading PDF...', 0);
    try {
      // 1. Request the file as a 'blob' (binary data)
      const response = await apiClient.get(`/agreement/${agreementId}/attachment`, {
        responseType: 'blob' 
      });

      // 2. Create a secure local URL for the blob
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const localPdfUrl = URL.createObjectURL(blob);

      // 3. Set this local URL for the iframe
      setPdfUrl(localPdfUrl);
      setPdfTitle(`Agreement Attachment: ${agreementId}`);
      setIsPdfModalVisible(true);
    } catch (error) {
      // Silent error handling for production
      const errorMessage = error.response?.data?.error || 'Failed to load PDF. It may not exist.';
      message.error(errorMessage);
    } finally {
      hide();
    }
  };

  const handleDeletePdf = async (agreementId) => {
    try {
      await agreementAPI.deleteAttachment(agreementId);
      message.success('PDF deleted successfully');
      fetchAgreements(); // Refresh to update the UI
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Failed to delete PDF';
      message.error(errorMessage);
    }
  };

  // Vacate and Refund Handlers
  const handleScheduleVacate = (record) => {
    setSelectedAgreementForVacate(record);
    vacateForm.setFieldsValue({
      agreement_vacate_date: record.agreement_vacate_date ? dayjs(record.agreement_vacate_date) : null
    });
    setIsVacateModalVisible(true);
  };

  const handleVacateModalOk = async () => {
    try {
      const values = await vacateForm.validateFields();
      if (!values.agreement_vacate_date) {
        message.error('Vacate date is required');
        return;
      }
      
      const vacateDate = values.agreement_vacate_date.format('YYYY-MM-DD');
      await agreementAPI.scheduleVacate(selectedAgreementForVacate.agreement_id, {
        agreement_vacate_date: vacateDate
      });
      
      message.success('Agreement scheduled for vacating');
      setIsVacateModalVisible(false);
      setSelectedAgreementForVacate(null);
      vacateForm.resetFields();
      fetchAgreements();
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Failed to schedule vacate';
      message.error(errorMessage);
    }
  };

  const handleRevokeVacate = async (record) => {
    try {
      await agreementAPI.revokeVacate(record.agreement_id);
      message.success('Scheduled vacate has been revoked');
      fetchAgreements();
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Failed to revoke scheduled vacate';
      message.error(errorMessage);
    }
  };

  const handleProcessRefund = async (record) => {
    setSelectedAgreementForRefund(record);
    
    // Fetch residence details
    try {
      const residenceResponse = await residenceAPI.getById(record.agreement_residence_id);
      const residenceData = Array.isArray(residenceResponse.data) 
        ? residenceResponse.data[0] 
        : residenceResponse.data;
      setSelectedResidence(residenceData);
    } catch (error) {
      // Continue even if residence fetch fails
      setSelectedResidence(null);
    }
    
    const e = parseFloat(record.agreement_deduction_electricity) || 0;
    const w = parseFloat(record.agreement_deduction_water) || 0;
    const oStored = parseFloat(record.agreement_deduction_other) || 0;
    const totalCut = parseFloat(record.agreement_maintenance_cut) || 0;
    const sumBreakdown = e + w + oStored;
    // Legacy rows: only total cut stored — show entire amount under Other for editing
    const initialOther = sumBreakdown === 0 && totalCut > 0 ? totalCut : oStored;
    refundForm.setFieldsValue({
      agreement_deduction_electricity: e,
      agreement_deduction_water: w,
      agreement_deduction_other: initialOther,
    });
    setIsRefundModalVisible(true);
  };

  const handleRefundModalOk = async () => {
    try {
      const values = await refundForm.validateFields();
      const electric = Math.max(0, parseFloat(values.agreement_deduction_electricity) || 0);
      const water = Math.max(0, parseFloat(values.agreement_deduction_water) || 0);
      const other = Math.max(0, parseFloat(values.agreement_deduction_other) || 0);
      const totalDeductions = electric + water + other;

      const advanceDueBack = parseFloat(
        selectedAgreementForRefund.agreement_advance_due_back || 
        selectedAgreementForRefund.agreement_advance_amount || 
        0
      );

      if (totalDeductions > advanceDueBack) {
        message.error('Total deductions (electricity + water + other) cannot exceed advance due back amount');
        return;
      }

      await agreementAPI.processRefund(selectedAgreementForRefund.agreement_id, {
        agreement_deduction_electricity: electric,
        agreement_deduction_water: water,
        agreement_deduction_other: other,
      });
      
      message.success('Refund processed successfully');
      setIsRefundModalVisible(false);
      setSelectedAgreementForRefund(null);
      setSelectedResidence(null);
      refundForm.resetFields();
      fetchAgreements();
    } catch (error) {
      // Handle validation errors
      if (error.errorFields) {
        return; // Form validation errors are already shown
      }
      // Handle API errors
      const errorMessage = error.response?.data?.error || error.message || 'Failed to process refund';
      message.error(errorMessage);
    }
  };

  // Calculate advance returned (for display in refund modal): advance due back − sum of deductions
  const calculateAdvanceReturned = () => {
    if (!selectedAgreementForRefund) return 0;
    const advanceDueBack = parseFloat(
      selectedAgreementForRefund.agreement_advance_due_back || 
      selectedAgreementForRefund.agreement_advance_amount || 
      0
    );
    const sumDed =
      (parseFloat(dedElectric) || 0) +
      (parseFloat(dedWater) || 0) +
      (parseFloat(dedOther) || 0);
    return Math.max(0, advanceDueBack - sumDed);
  };

  const totalDeductionsPreview = () =>
    (parseFloat(dedElectric) || 0) +
    (parseFloat(dedWater) || 0) +
    (parseFloat(dedOther) || 0);

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={2} style={{ marginBottom: 4 }}>Agreements Management</Title>
          <Text type="secondary">
            Upload PDFs in <strong>Attachment</strong>; use <strong>Set to Vacate</strong> / <strong>Revoke</strong> and <strong>Process Refund</strong> in Actions. Scroll the table horizontally if it is wider than the screen.
          </Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchAgreements}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingAgreement(null); form.resetFields(); setIsModalVisible(true); }}>
            Add Agreement
          </Button>
        </Space>
      </div>

      <Card style={{ marginBottom: 24 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={6}>
            <Input 
              placeholder="Search ID, Residence..." 
              prefix={<SearchOutlined />} 
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
            />
          </Col>
          <Col xs={24} sm={4}>
            <Select 
              style={{ width: '100%' }} 
              value={statusFilter} 
              onChange={setStatusFilter}
              placeholder="Status"
            >
              <Option value="Active">Active</Option>
              <Option value="Inactive">Inactive</Option>
              <Option value="All">All Status</Option>
            </Select>
          </Col>
          <Col xs={24} sm={4}>
            <Select
              style={{ width: '100%' }}
              value={renewalFilter}
              onChange={(value) => {
                setRenewalFilter(value);
                // Clear URL filter param when filter is manually cleared
                if (!value && searchParams.get('filter')) {
                  const newSearchParams = new URLSearchParams(searchParams);
                  newSearchParams.delete('filter');
                  window.history.replaceState({}, '', `${window.location.pathname}${newSearchParams.toString() ? `?${newSearchParams.toString()}` : ''}`);
                }
              }}
              placeholder="Renewal Urgency"
              allowClear
            >
              <Option value="Past Due">Past Due</Option>
              <Option value="Due Soon">Due Soon</Option>
              <Option value="Scheduled to Vacate">Scheduled to Vacate</Option>
            </Select>
          </Col>
          <Col xs={24} sm={6}>
            <Select
              style={{ width: '100%' }}
              value={residenceFilter}
              onChange={setResidenceFilter}
              placeholder="Filter by Residence"
              allowClear
              showSearch
              optionFilterProp="children"
            >
              {residences.map(res => (
                <Option key={res.residence_id} value={res.residence_id}>{res.residence_id}</Option>
              ))}
            </Select>
          </Col>
        </Row>
      </Card>

      {/* Hidden file input for PDF upload */}
      <input
        type="file"
        ref={fileInputRef}
        accept="application/pdf"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <div style={{ width: '100%', overflowX: 'auto' }}>
        <Table
          columns={columns}
          dataSource={filteredAgreements}
          rowKey="agreement_id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 2100 }}
          locale={{ emptyText: <Empty description="No agreements found" /> }}
        />
      </div>

      {/* PDF View Modal */}
      <Modal
        title={pdfTitle}
        open={isPdfModalVisible}
        onCancel={() => {
          // Clean up the object URL to prevent memory leaks
          if (pdfUrl) {
            URL.revokeObjectURL(pdfUrl);
          }
          setIsPdfModalVisible(false);
          setPdfUrl(null);
          setPdfTitle('View PDF Attachment');
        }}
        footer={null}
        width={900}
        style={{ top: 20 }}
        bodyStyle={{ height: '80vh', padding: 0 }}
      >
        {pdfUrl && (
          <iframe
            src={pdfUrl}
            style={{
              width: '100%',
              height: '100%',
              border: 'none'
            }}
            title="PDF Viewer"
          />
        )}
      </Modal>

      <Modal
        title={editingAgreement ? "Edit Agreement" : "New Agreement"}
        open={isModalVisible}
        onOk={handleModalOk}
        onCancel={() => setIsModalVisible(false)}
        width={800}
      >
        <Form form={form} layout="vertical">
          {/* Form Fields Preserved */}
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="agreement_id" label="Agreement ID">
                <Input disabled={!!editingAgreement} placeholder="Auto-generated" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="agreement_residence_id" label="Residence ID" rules={[{ required: true }]}>
                <Select showSearch>
                   {residences.map(r => <Option key={r.residence_id} value={r.residence_id}>{r.residence_id}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="agreement_monthly_rent_amount" label="Monthly Rent" rules={[{ required: true }]}>
                <Input type="number" prefix="₹" />
              </Form.Item>
            </Col>
            <Col span={12}>
               <Form.Item name="agreement_renewal_due_date" label="Renewal Date" rules={[{ required: true }]}>
                 <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
               </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="agreement_status" label="Status">
                <Select>
                  <Option value="Active">Active</Option>
                  <Option value="Inactive">Inactive</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Vacate Modal */}
      <Modal
        title="Schedule Agreement for Vacating"
        open={isVacateModalVisible}
        onOk={handleVacateModalOk}
        onCancel={() => {
          setIsVacateModalVisible(false);
          setSelectedAgreementForVacate(null);
          vacateForm.resetFields();
        }}
        width={600}
      >
        <Form form={vacateForm} layout="vertical">
          <Form.Item
            name="agreement_vacate_date"
            label="Vacate Date"
            rules={[{ required: true, message: 'Please select vacate date' }]}
          >
            <DatePicker 
              style={{ width: '100%' }} 
              format="YYYY-MM-DD"
              disabledDate={(current) => current && current < dayjs().startOf('day')}
            />
          </Form.Item>
          {selectedAgreementForVacate && (
            <Text type="secondary">
              Agreement ID: {selectedAgreementForVacate.agreement_id} | 
              Residence: {selectedAgreementForVacate.agreement_residence_id}
            </Text>
          )}
        </Form>
      </Modal>

      {/* Refund Modal */}
      <Modal
        title="Process Advance Refund"
        open={isRefundModalVisible}
        onOk={handleRefundModalOk}
        onCancel={() => {
          setIsRefundModalVisible(false);
          setSelectedAgreementForRefund(null);
          setSelectedResidence(null);
          refundForm.resetFields();
        }}
        width={700}
      >
        {selectedAgreementForRefund && (
          <Form form={refundForm} layout="vertical">
            <Card size="small" style={{ marginBottom: 16 }}>
              <Row gutter={16}>
                <Col span={12}>
                  <Text strong>Residence ID:</Text>
                  <br />
                  <Text>{selectedAgreementForRefund.agreement_residence_id}</Text>
                </Col>
                <Col span={12}>
                  <Text strong>Owner Name:</Text>
                  <br />
                  <Text>{selectedResidence?.residence_owner_name || 'N/A'}</Text>
                </Col>
                <Col span={12} style={{ marginTop: 8 }}>
                  <Text strong>Monthly Rent:</Text>
                  <br />
                  <Text>₹{Number(selectedAgreementForRefund.agreement_monthly_rent_amount || 0).toLocaleString()}</Text>
                </Col>
                <Col span={12} style={{ marginTop: 8 }}>
                  <Text strong>Total Advance Paid:</Text>
                  <br />
                  <Text>₹{Number(selectedAgreementForRefund.agreement_advance_amount || 0).toLocaleString()}</Text>
                </Col>
                <Col span={24} style={{ marginTop: 8 }}>
                  <Text strong>Advance Due Back:</Text>
                  <br />
                  <Text>₹{Number(
                    selectedAgreementForRefund.agreement_advance_due_back || 
                    selectedAgreementForRefund.agreement_advance_amount || 
                    0
                  ).toLocaleString()}</Text>
                </Col>
              </Row>
            </Card>

            <Card size="small" title="Deductions from advance (pending dues)" style={{ marginBottom: 16 }}>
              <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                Enter amounts to recover from the advance (e.g. electricity, water, other). Total cut is the sum of all three.
              </Text>
              <Row gutter={16}>
                <Col xs={24} sm={8}>
                  <Form.Item
                    name="agreement_deduction_electricity"
                    label="Electricity bill (₹)"
                    rules={[
                      {
                        validator: (_, value) => {
                          const n = value === undefined || value === null || value === '' ? 0 : Number(value);
                          if (Number.isNaN(n) || n < 0) {
                            return Promise.reject(new Error('Must be zero or greater'));
                          }
                          return Promise.resolve();
                        },
                      },
                    ]}
                  >
                    <InputNumber
                      style={{ width: '100%' }}
                      min={0}
                      precision={2}
                      prefix="₹"
                      placeholder="0"
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item
                    name="agreement_deduction_water"
                    label="Water bill (₹)"
                    rules={[
                      {
                        validator: (_, value) => {
                          const n = value === undefined || value === null || value === '' ? 0 : Number(value);
                          if (Number.isNaN(n) || n < 0) {
                            return Promise.reject(new Error('Must be zero or greater'));
                          }
                          return Promise.resolve();
                        },
                      },
                    ]}
                  >
                    <InputNumber
                      style={{ width: '100%' }}
                      min={0}
                      precision={2}
                      prefix="₹"
                      placeholder="0"
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item
                    name="agreement_deduction_other"
                    label="Other (₹)"
                    rules={[
                      {
                        validator: (_, value) => {
                          const n = value === undefined || value === null || value === '' ? 0 : Number(value);
                          if (Number.isNaN(n) || n < 0) {
                            return Promise.reject(new Error('Must be zero or greater'));
                          }
                          return Promise.resolve();
                        },
                      },
                    ]}
                  >
                    <InputNumber
                      style={{ width: '100%' }}
                      min={0}
                      precision={2}
                      prefix="₹"
                      placeholder="0"
                    />
                  </Form.Item>
                </Col>
              </Row>
              <Row style={{ marginTop: 8 }}>
                <Col span={24}>
                  <Text strong>Total deductions: </Text>
                  <Text>₹{totalDeductionsPreview().toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</Text>
                </Col>
              </Row>
            </Card>
            
            <Form.Item label="Advance due back after deductions">
              <Input 
                value={`₹${calculateAdvanceReturned().toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`}
                disabled
                style={{ fontWeight: 'bold', color: '#52c41a' }}
              />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </div>
  );
};

export default Agreements;