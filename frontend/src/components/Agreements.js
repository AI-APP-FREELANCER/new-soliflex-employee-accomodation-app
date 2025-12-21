import React, { useState, useEffect, useMemo } from 'react';
import { Table, Card, Button, Input, Tag, Space, Select, DatePicker, message, Modal, Form, Row, Col, Typography, Spin, Empty } from 'antd';
import { SearchOutlined, PlusOutlined, EditOutlined, EyeOutlined, FileTextOutlined, ReloadOutlined } from '@ant-design/icons';
import { agreementAPI, residenceAPI } from '../services/api';
import dayjs from 'dayjs';
import { parseDateFromAPI, formatDateForDisplay } from '../utils/dateUtils';
import { useLocation } from 'react-router-dom';

const { Title, Text } = Typography;
const { Option } = Select;

const Agreements = () => {
  const [agreements, setAgreements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('Active');
  const [residenceFilter, setResidenceFilter] = useState(null);
  const [renewalFilter, setRenewalFilter] = useState(null);
  const [residences, setResidences] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingAgreement, setEditingAgreement] = useState(null);
  const [form] = Form.useForm();
  const location = useLocation();

  useEffect(() => {
    fetchResidences();
    // Parse query params for initial filters
    const searchParams = new URLSearchParams(location.search);
    const filterType = searchParams.get('filter');
    if (filterType === 'pastDue') setRenewalFilter('Past Due');
    if (filterType === 'due90') setRenewalFilter('Due Soon');
  }, [location]);

  useEffect(() => {
    fetchAgreements();
  }, []); // Initial fetch

  const fetchResidences = async () => {
    try {
      const response = await residenceAPI.getAll();
      const data = Array.isArray(response.data) ? response.data : (response.data?.data || []);
      setResidences(data);
    } catch (error) {
      console.error('Failed to fetch residences');
    }
  };

  const fetchAgreements = async () => {
    setLoading(true);
    try {
      // Fetch 'all' to get everything and let frontend/backend filtering handle the rest
      const response = await agreementAPI.getAll('all');
      
      let data = [];
      if (Array.isArray(response.data)) {
        data = response.data;
      } else if (response.data && Array.isArray(response.data.data)) {
        data = response.data.data;
      }

      console.log(`[Agreements] Fetched ${data.length} records.`);
      setAgreements(data);
    } catch (error) {
      message.error('Failed to fetch agreements');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // --- ROBUST FRONTEND FILTERING ---
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

    // 3. Renewal Urgency Filter
    if (renewalFilter) {
      result = result.filter(item => item.computed_renewal_status === renewalFilter);
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

  const columns = [
    {
      title: 'Agreement ID',
      dataIndex: 'agreement_id',
      key: 'agreement_id',
      render: (text) => <Text strong>{text}</Text>,
    },
    {
      title: 'Residence ID',
      dataIndex: 'agreement_residence_id',
      key: 'agreement_residence_id',
    },
    {
      title: 'Monthly Rent',
      dataIndex: 'agreement_monthly_rent_amount',
      key: 'agreement_monthly_rent_amount',
      render: (val) => val ? `₹${Number(val).toLocaleString()}` : '-',
    },
    {
      title: 'Renewal Date',
      key: 'renewal',
      render: (_, record) => {
        if (!record.agreement_renewal_due_date) return <Text type="secondary">N/A</Text>;
        const dateStr = formatDateForDisplay(record.agreement_renewal_due_date);
        
        // Show Urgency Tags based on backend calculation
        if (record.computed_renewal_status === 'Past Due') {
          return (
            <Space direction="vertical" size={0}>
              <Text type="danger" strong>{dateStr}</Text>
              <Tag color="red">Past Due</Tag>
            </Space>
          );
        }
        if (record.computed_renewal_status === 'Due Soon') {
          return (
            <Space direction="vertical" size={0}>
              <Text type="warning" strong>{dateStr}</Text>
              <Tag color="orange">Due Soon</Tag>
            </Space>
          );
        }
        return <Text>{dateStr}</Text>;
      }
    },
    {
      title: 'Status',
      dataIndex: 'agreement_status',
      key: 'agreement_status',
      render: (status) => {
        const s = String(status || '').toLowerCase();
        const color = s === 'active' ? 'green' : 'default';
        // Display strictly "Active" or "Inactive"
        const display = s === 'active' ? 'Active' : 'Inactive';
        return <Tag color={color}>{display}</Tag>;
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} />
        </Space>
      ),
    },
  ];

  const handleEdit = (record) => {
    setEditingAgreement(record);
    // Pre-fill form
    form.setFieldsValue({
      ...record,
      agreement_renewal_due_date: record.agreement_renewal_due_date ? dayjs(record.agreement_renewal_due_date) : null
    });
    setIsModalVisible(true);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      // Format date for API
      if (values.agreement_renewal_due_date) {
        values.agreement_renewal_due_date = values.agreement_renewal_due_date.format('YYYY-MM-DD');
      }

      if (editingAgreement) {
        await agreementAPI.update(editingAgreement.agreement_id, values);
        message.success('Agreement updated successfully');
      } else {
        await agreementAPI.create(values);
        message.success('Agreement created successfully');
      }
      setIsModalVisible(false);
      setEditingAgreement(null);
      form.resetFields();
      fetchAgreements(); // Refresh data
    } catch (error) {
      message.error('Operation failed');
    }
  };

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={2}>Agreements Management</Title>
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
              placeholder="Search ID, Residence, Name..." 
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
              onChange={setRenewalFilter}
              placeholder="Renewal Urgency"
              allowClear
            >
              <Option value="Past Due">Past Due</Option>
              <Option value="Due Soon">Due Soon (90 Days)</Option>
              {/* "Safe" option removed as requested */}
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

      <Table
        columns={columns}
        dataSource={filteredAgreements}
        rowKey="agreement_id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        locale={{ emptyText: <Empty description="No agreements found matching filters" /> }}
      />

      <Modal
        title={editingAgreement ? "Edit Agreement" : "New Agreement"}
        open={isModalVisible}
        onOk={handleModalOk}
        onCancel={() => setIsModalVisible(false)}
        width={800}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="agreement_id" label="Agreement ID">
                <Input disabled={!!editingAgreement} placeholder="Auto-generated if empty" />
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
    </div>
  );
};

export default Agreements;