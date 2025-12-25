import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Dropdown,
  Card,
} from 'antd';
import { PlusOutlined, EditOutlined, DownloadOutlined, FilePdfOutlined, FileExcelOutlined, SearchOutlined } from '@ant-design/icons';
import { employeeAPI, agreementAPI } from '../services/api';
import { exportToPDF, exportTableToExcel } from '../utils/exportUtils';
import { formatDateForDisplay, formatDateForAPI, parseDateFromAPI, getMinDate, getMaxDate } from '../utils/dateUtils';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

const Employees = () => {
  const [employees, setEmployees] = useState([]);
  const [agreements, setAgreements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [pageSize, setPageSize] = useState(10);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('Active'); // Default to 'Active' Title Case
  const [isMobile, setIsMobile] = useState(false);
  const [form] = Form.useForm();
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
    fetchEmployees();
    fetchAgreements();
  }, []); // Only fetch once on mount, filter handled client-side

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      // FIX: Fetch 'all' so the frontend has the full dataset to filter
      const response = await employeeAPI.getAll('all');
      
      let data = [];
      if (Array.isArray(response.data)) {
        data = response.data;
      } else if (response.data && Array.isArray(response.data.data)) {
        data = response.data.data;
      }
      
      setEmployees(data);
    } catch (error) {
      message.error('Failed to fetch employees');
    } finally {
      setLoading(false);
    }
  };

  const fetchAgreements = async () => {
    try {
      // Ensure agreements fetch 'all' too for dropdown population
      const response = await agreementAPI.getAll('all');
      const data = Array.isArray(response.data) ? response.data : (response.data?.data || []);
      setAgreements(data);
    } catch (error) {
      // Error handled by message.error above
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
      employee_date_of_joining: record.employee_date_of_joining ? parseDateFromAPI(record.employee_date_of_joining) : null,
      status: record.status // Ensure status field is mapped correctly
    });
    setSelectedEmployee(record);
    setFormVisible(true);
  };

  const handleSubmit = async (values) => {
    try {
      if (values.employee_date_of_joining) {
        values.employee_date_of_joining = formatDateForAPI(values.employee_date_of_joining);
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
      // Error handled by message.error above
    }
  };

  // Filter employees based on search text and status
  const filteredEmployees = useMemo(() => {
    let result = employees;
    
    // Apply status filter 
    if (statusFilter && statusFilter !== 'All') {
      result = result.filter(employee => {
        // Backend guarantees 'Active' or 'Inactive' in the 'status' field now
        const s = String(employee.status || 'Active');
        return s === statusFilter;
      });
    }

    // Apply search text filter
    if (searchText && searchText.trim()) {
      const lowerSearch = searchText.toLowerCase().trim();
      result = result.filter(employee => {
        const employeeId = (employee.employee_id || '').toLowerCase();
        const firstName = (employee.employee_first_name || '').toLowerCase();
        const lastName = (employee.employee_last_name || '').toLowerCase();
        const sirName = (employee.employee_sir_name || '').toLowerCase();
        const fullName = `${firstName} ${lastName} ${sirName}`.trim().toLowerCase();
        const department = (employee.employee_department || '').toLowerCase();
        const designation = (employee.employee_designation || '').toLowerCase();

        return (
          employeeId.includes(lowerSearch) ||
          firstName.includes(lowerSearch) ||
          lastName.includes(lowerSearch) ||
          sirName.includes(lowerSearch) ||
          fullName.includes(lowerSearch) ||
          department.includes(lowerSearch) ||
          designation.includes(lowerSearch)
        );
      });
    }

    return result;
  }, [searchText, employees, statusFilter]);

  // Export handlers
  const handleExportPDF = async () => {
    try {
      message.loading({ content: 'Generating PDF...', key: 'export' });
      await exportToPDF(tableRef, `Employees_${dayjs().format('YYYY-MM-DD')}.pdf`);
      message.success({ content: 'PDF exported successfully!', key: 'export' });
    } catch (error) {
      message.error({ content: 'Failed to export PDF', key: 'export' });
      // Error handled by message.error above
    }
  };

  const handleExportExcel = () => {
    try {
      message.loading({ content: 'Generating Excel...', key: 'export' });
      
      const exportData = filteredEmployees.map(e => {
        const nameParts = [
          e.employee_first_name,
          e.employee_last_name,
          e.employee_sir_name,
        ].filter(Boolean);
        return {
          'Employee ID': e.employee_id || '',
          'First Name': e.employee_first_name || '',
          'Last Name': e.employee_last_name || '',
          'Sir Name': e.employee_sir_name || '',
          'Full Name': nameParts.join(' ') || '',
          'Department': e.employee_department || '',
          'Designation': e.employee_designation || '',
          'Date of Joining': e.employee_date_of_joining || '',
          'Allocated Agreement ID': e.emplyee_allocated_agreement_id || 'Not Assigned',
          'Status': e.status || '',
        };
      });

      exportTableToExcel(exportData, 'Employees', `Employees_${dayjs().format('YYYY-MM-DD')}.xlsx`);
      message.success({ content: 'Excel exported successfully!', key: 'export' });
    } catch (error) {
      message.error({ content: 'Failed to export Excel', key: 'export' });
      // Error handled by message.error above
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
      render: (date) => date ? formatDateForDisplay(date) : 'N/A',
    },
    {
      title: 'Allocated Agreement',
      dataIndex: 'emplyee_allocated_agreement_id',
      key: 'emplyee_allocated_agreement_id',
      render: (agreementId) => agreementId || 'Not Assigned',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        // Backend now ensures this is 'Active' or 'Inactive' (Title Case)
        const color = status === 'Active' ? 'green' : 'red';
        return <Tag color={color}>{status}</Tag>;
      },
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
    a => String(a.agreement_status || '').toLowerCase() === 'active'
  );

  const exportMenuItems = [
    { key: 'pdf', label: 'Download as PDF', icon: <FilePdfOutlined /> },
    { key: 'excel', label: 'Download as Excel', icon: <FileExcelOutlined /> },
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
          Employees Management
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
            Add Employee
          </Button>
        </Space>
      </div>

      <div style={{ marginBottom: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <Input
          placeholder="Search by Employee ID, Name, Department, or Designation..."
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          allowClear
          style={{ width: isMobile ? '100%' : '400px' }}
        />
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ width: isMobile ? '100%' : '150px' }}
        >
          <Option value="Active">Show Active</Option>
          <Option value="Inactive">Show Inactive</Option>
          <Option value="All">Show All</Option>
        </Select>
      </div>

      <div ref={tableRef}>
        {isMobile ? (
          <div>
            {filteredEmployees.map((employee) => {
              const fullName = [
                employee.employee_first_name,
                employee.employee_last_name,
                employee.employee_sir_name,
              ].filter(Boolean).join(' ') || 'N/A';
              return (
                <Card
                  key={employee.employee_id}
                  style={{ marginBottom: '16px' }}
                  actions={[
                    <Button
                      key="edit"
                      type="link"
                      icon={<EditOutlined />}
                      onClick={() => handleEdit(employee)}
                      block
                    >
                      Edit
                    </Button>
                  ]}
                >
                  <Space direction="vertical" style={{ width: '100%' }} size="small">
                    <div><Text strong>Employee ID: </Text><Text>{employee.employee_id}</Text></div>
                    <div><Text strong>Name: </Text><Text>{fullName}</Text></div>
                    <div><Text strong>Department: </Text><Text>{employee.employee_department || 'N/A'}</Text></div>
                    <div><Text strong>Status: </Text><Tag color={employee.status === 'Active' ? 'green' : 'red'}>{employee.status}</Tag></div>
                  </Space>
                </Card>
              );
            })}
            {filteredEmployees.length === 0 && !loading && (
              <div style={{ textAlign: 'center', padding: '40px', color: '#8c8c8c' }}>
                No employees found
              </div>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
              <Table
                columns={columns}
                dataSource={filteredEmployees}
                loading={loading}
                rowKey="employee_id"
                scroll={{ x: 'max-content' }}
                pagination={{
                  pageSize: pageSize,
                  showSizeChanger: true,
                  pageSizeOptions: ['10', '25', '50', '100'],
                  onShowSizeChange: (current, size) => setPageSize(size),
                }}
                locale={{ emptyText: <div style={{ textAlign: 'center', padding: '20px' }}>No employees found</div> }}
              />
          </div>
        )}
      </div>

      {/* Drawer */}
      <Drawer
        title={selectedEmployee ? 'Edit Employee' : 'Add Employee'}
        placement="right"
        width={isMobile ? '100%' : 500}
        onClose={() => {
          setFormVisible(false);
          form.resetFields();
        }}
        open={formVisible}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          {!selectedEmployee && (
            <Form.Item name="employee_id" label="Employee ID" rules={[{ required: true }]}>
              <Input placeholder="Alphanumeric employee ID" />
            </Form.Item>
          )}
          <Form.Item name="employee_first_name" label="First Name"><Input /></Form.Item>
          <Form.Item name="employee_last_name" label="Last Name"><Input /></Form.Item>
          <Form.Item name="employee_department" label="Department"><Input /></Form.Item>
          <Form.Item name="employee_designation" label="Designation"><Input /></Form.Item>
          <Form.Item name="employee_date_of_joining" label="Date of Joining">
            <DatePicker style={{ width: '100%' }} format="DD-MM-YYYY" />
          </Form.Item>
          <Form.Item name="emplyee_allocated_agreement_id" label="Allocated Agreement ID">
            <Select allowClear showSearch>
              {activeAgreements.map((a) => (
                <Option key={a.agreement_id} value={a.agreement_id}>{a.agreement_id}</Option>
              ))}
            </Select>
          </Form.Item>
          {/* UPDATED: Status field maps to 'status' now */}
          <Form.Item name="status" label="Status" rules={[{ required: true }]}>
            <Select>
              <Option value="Active">Active</Option>
              <Option value="Inactive">Inactive</Option>
            </Select>
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">{selectedEmployee ? 'Update' : 'Create'}</Button>
              <Button onClick={() => setFormVisible(false)}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
};

export default Employees;