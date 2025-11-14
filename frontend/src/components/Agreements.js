import React, { useState, useEffect } from 'react';
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
} from 'antd';
import { PlusOutlined, EditOutlined, ReloadOutlined } from '@ant-design/icons';
import { agreementAPI, residenceAPI } from '../services/api';
import dayjs from 'dayjs';

const { Title } = Typography;
const { Option } = Select;

const Agreements = () => {
  const [agreements, setAgreements] = useState([]);
  const [residences, setResidences] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [refundModalVisible, setRefundModalVisible] = useState(false);
  const [selectedAgreement, setSelectedAgreement] = useState(null);
  const [isRenewal, setIsRenewal] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [form] = Form.useForm();
  const [refundForm] = Form.useForm();

  useEffect(() => {
    fetchAgreements();
    fetchResidences();
  }, []);

  const fetchAgreements = async () => {
    setLoading(true);
    try {
      const response = await agreementAPI.getAll();
      setAgreements(response.data);
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

  // Calculate renewal due date (90 days before end date)
  const calculateRenewalDueDate = (possessionDate, durationMonths = 11) => {
    if (!possessionDate) return null;
    const startDate = dayjs(possessionDate);
    const endDate = startDate.add(durationMonths, 'month');
    const renewalDueDate = endDate.subtract(90, 'day');
    return renewalDueDate.format('YYYY-MM-DD');
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
      agreement_possesion_date: record.agreement_possesion_date ? dayjs(record.agreement_possesion_date) : null,
      agreement_renewal_due_date: record.agreement_renewal_due_date ? dayjs(record.agreement_renewal_due_date) : null,
    });
    setSelectedAgreement(record);
    setIsRenewal(false);
    setFormVisible(true);
  };

  const handleRenew = async (record) => {
    // Pre-populate form with same residence_id and suggest start date after current end date
    const possessionDate = record.agreement_possesion_date;
    const durationMonths = 11; // Default
    const currentEndDate = calculateEndDate(possessionDate, durationMonths);
    const suggestedStartDate = currentEndDate ? dayjs(currentEndDate).add(1, 'day') : dayjs();

    form.setFieldsValue({
      agreement_residence_id: record.agreement_residence_id,
      agreement_possesion_date: suggestedStartDate,
      agreement_status: 'Active',
    });
    setSelectedAgreement(null);
    setIsRenewal(true);
    setFormVisible(true);
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
        const possessionDate = values.agreement_possesion_date.format('YYYY-MM-DD');
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

  // Watch possession date to auto-calculate renewal due date
  const possessionDate = Form.useWatch('agreement_possesion_date', form);

  useEffect(() => {
    if (possessionDate && !selectedAgreement) {
      const renewalDueDate = calculateRenewalDueDate(possessionDate.format('YYYY-MM-DD'));
      form.setFieldsValue({
        agreement_renewal_due_date: renewalDueDate ? dayjs(renewalDueDate) : null,
      });
    }
  }, [possessionDate, form, selectedAgreement]);

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
      render: (date) => date || 'N/A',
    },
    {
      title: 'Renewal Due Date',
      dataIndex: 'agreement_renewal_due_date',
      key: 'agreement_renewal_due_date',
      render: (date) => date || 'N/A',
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
      render: (_, record) => (
        <Space>
          {record.agreement_status === 'Active' && (
            <Button
              type="link"
              icon={<ReloadOutlined />}
              onClick={() => handleRenew(record)}
            >
              Renew
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
          </Select>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
        <Title level={2} style={{ color: '#262626', margin: 0 }}>
          Agreements Management
        </Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleAdd}
        >
          Add Agreement
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={agreements}
        loading={loading}
        rowKey="agreement_id"
        pagination={{
          pageSize: pageSize,
          showSizeChanger: true,
          pageSizeOptions: ['10', '25', '50', '100'],
          onShowSizeChange: (current, size) => {
            setPageSize(size);
          },
        }}
      />

      {/* Create/Edit Form Drawer */}
      <Drawer
        title={selectedAgreement ? 'Edit Agreement' : isRenewal ? 'Renew Agreement' : 'Add Agreement'}
        placement="right"
        width={500}
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
            label="Possession Date"
            rules={[{ required: true, message: 'Please select possession date!' }]}
          >
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>

          <Form.Item
            name="agreement_renewal_due_date"
            label="Renewal Due Date (Auto-calculated: 90 days before end date)"
          >
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" disabled />
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
    </div>
  );
};

export default Agreements;

