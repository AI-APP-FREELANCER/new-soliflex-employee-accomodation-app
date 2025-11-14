import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Space,
  Drawer,
  Form,
  Input,
  Select,
  DatePicker,
  message,
  Tag,
  Typography,
} from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import { employeeAPI, agreementAPI } from '../services/api';
import dayjs from 'dayjs';

const { Title } = Typography;
const { Option } = Select;

const Employees = () => {
  const [employees, setEmployees] = useState([]);
  const [agreements, setAgreements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [pageSize, setPageSize] = useState(10);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchEmployees();
    fetchAgreements();
  }, []);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const response = await employeeAPI.getAll();
      setEmployees(response.data);
    } catch (error) {
      message.error('Failed to fetch employees');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAgreements = async () => {
    try {
      const response = await agreementAPI.getAll();
      setAgreements(response.data);
    } catch (error) {
      console.error(error);
    }
  };

  const handleAdd = () => {
    form.resetFields();
    setSelectedEmployee(null);
    setFormVisible(true);
  };

  const handleEdit = (record) => {
    form.setFieldsValue({
      ...record,
      employee_date_of_joining: record.employee_date_of_joining ? dayjs(record.employee_date_of_joining) : null,
    });
    setSelectedEmployee(record);
    setFormVisible(true);
  };

  const handleSubmit = async (values) => {
    try {
      if (values.employee_date_of_joining) {
        values.employee_date_of_joining = values.employee_date_of_joining.format('YYYY-MM-DD');
      }

      if (selectedEmployee) {
        await employeeAPI.update(selectedEmployee.employee_id, values);
        message.success('Employee updated successfully');
      } else {
        await employeeAPI.create(values);
        message.success('Employee created successfully');
      }
      setFormVisible(false);
      form.resetFields();
      fetchEmployees();
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to save employee');
      console.error(error);
    }
  };

  const columns = [
    {
      title: 'Employee ID',
      dataIndex: 'employee_id',
      key: 'employee_id',
    },
    {
      title: 'Name',
      key: 'name',
      render: (_, record) => {
        const parts = [
          record.employee_first_name,
          record.employee_last_name,
          record.employee_sir_name,
        ].filter(Boolean);
        return parts.join(' ') || 'N/A';
      },
    },
    {
      title: 'Department',
      dataIndex: 'employee_department',
      key: 'employee_department',
    },
    {
      title: 'Designation',
      dataIndex: 'employee_designation',
      key: 'employee_designation',
    },
    {
      title: 'Date of Joining',
      dataIndex: 'employee_date_of_joining',
      key: 'employee_date_of_joining',
      render: (date) => date || 'N/A',
    },
    {
      title: 'Allocated Agreement',
      dataIndex: 'emplyee_allocated_agreement_id',
      key: 'emplyee_allocated_agreement_id',
      render: (agreementId) => agreementId || 'Not Assigned',
    },
    {
      title: 'Status',
      dataIndex: 'employee_status',
      key: 'employee_status',
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
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            Edit
          </Button>
        </Space>
      ),
    },
  ];

  // Filter active agreements for dropdown
  const activeAgreements = agreements.filter(
    a => a.agreement_status === 'Active' || a.agreement_status === 'active'
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
        <Title level={2} style={{ color: '#262626', margin: 0 }}>
          Employees Management
        </Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleAdd}
        >
          Add Employee
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={employees}
        loading={loading}
        rowKey="employee_id"
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
        title={selectedEmployee ? 'Edit Employee' : 'Add Employee'}
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
          {!selectedEmployee && (
            <Form.Item
              name="employee_id"
              label="Employee ID"
              rules={[{ required: true, message: 'Please input employee ID!' }]}
            >
              <Input placeholder="Alphanumeric employee ID" />
            </Form.Item>
          )}

          <Form.Item
            name="employee_first_name"
            label="First Name"
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="employee_last_name"
            label="Last Name"
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="employee_sir_name"
            label="Sir Name"
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="employee_department"
            label="Department"
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="employee_designation"
            label="Designation"
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="employee_date_of_joining"
            label="Date of Joining"
          >
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>

          <Form.Item
            name="emplyee_allocated_agreement_id"
            label="Allocated Agreement ID"
            help="Link employee to an agreement (Foreign Key)"
          >
            <Select
              placeholder="Select Agreement"
              allowClear
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            >
              {activeAgreements.map((agreement) => (
                <Option key={agreement.agreement_id} value={agreement.agreement_id} label={agreement.agreement_id}>
                  {agreement.agreement_id} - {agreement.agreement_residence_id}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="employee_status"
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
                {selectedEmployee ? 'Update' : 'Create'}
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
    </div>
  );
};

export default Employees;

