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
  Checkbox,
  Modal,
  Popconfirm,
  Alert,
  Tabs,
  Divider,
} from 'antd';
import { PlusOutlined, EditOutlined, DownloadOutlined, FilePdfOutlined, FileExcelOutlined, SearchOutlined, PictureOutlined, UploadOutlined, DeleteOutlined, FolderOutlined } from '@ant-design/icons';
import { employeeAPI, agreementAPI } from '../services/api';
import api from '../services/api';
import DocumentsPanel from './DocumentsPanel';
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
  const employeePhotoInputRef = useRef(null);
  const currentEmployeePhotoUploadId = useRef(null);

  const [empDrawerPhotoUrl, setEmpDrawerPhotoUrl] = useState(null);
  const [empPhotoModalOpen, setEmpPhotoModalOpen] = useState(false);
  const [empPhotoModalUrl, setEmpPhotoModalUrl] = useState(null);
  const [empPhotoModalCaption, setEmpPhotoModalCaption] = useState('');

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

  useEffect(() => {
    if (!formVisible || !selectedEmployee?.employee_id) {
      setEmpDrawerPhotoUrl(null);
      return;
    }
    if (!selectedEmployee.has_employee_photo) {
      setEmpDrawerPhotoUrl(null);
      return;
    }
    const urlRef = { current: null };
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/employee/${selectedEmployee.employee_id}/photo`, { responseType: 'blob' });
        if (cancelled) return;
        urlRef.current = URL.createObjectURL(res.data);
        setEmpDrawerPhotoUrl(urlRef.current);
      } catch {
        if (!cancelled) setEmpDrawerPhotoUrl(null);
      }
    })();
    return () => {
      cancelled = true;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [formVisible, selectedEmployee?.employee_id, selectedEmployee?.has_employee_photo]);

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

  const isValidImageFile = (file) => {
    if (['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) return true;
    return /\.(jpe?g|png|webp)$/i.test(file.name);
  };

  const triggerEmployeePhotoUpload = (employeeId) => {
    currentEmployeePhotoUploadId.current = employeeId;
    employeePhotoInputRef.current?.click();
  };

  const handleEmployeePhotoFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!isValidImageFile(file)) {
      message.error('Only JPG, JPEG, PNG and WebP images are allowed');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      message.error('Image must be 5MB or smaller');
      return;
    }
    const eid = currentEmployeePhotoUploadId.current;
    currentEmployeePhotoUploadId.current = null;
    if (!eid) return;
    try {
      const formData = new FormData();
      formData.append('file', file);
      await employeeAPI.uploadPhoto(eid, formData);
      message.success('Employee photo uploaded');
      await fetchEmployees();
      if (selectedEmployee?.employee_id === eid) {
        const res = await employeeAPI.getById(eid);
        setSelectedEmployee(res.data);
      }
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to upload photo');
    }
  };

  const handleDeleteEmployeePhoto = async (record) => {
    try {
      await employeeAPI.deletePhoto(record.employee_id);
      message.success('Employee photo removed');
      await fetchEmployees();
      if (selectedEmployee?.employee_id === record.employee_id) {
        const res = await employeeAPI.getById(record.employee_id);
        setSelectedEmployee(res.data);
      }
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to remove photo');
    }
  };

  const openEmployeePhotoModal = async (record) => {
    const nameParts = [record.employee_first_name, record.employee_last_name, record.employee_sir_name].filter(Boolean);
    const caption = `${nameParts.join(' ') || 'Employee'} · ${record.employee_id}`;
    try {
      const res = await api.get(`/employee/${record.employee_id}/photo`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      setEmpPhotoModalUrl(url);
      setEmpPhotoModalCaption(caption);
      setEmpPhotoModalOpen(true);
    } catch {
      message.error('Could not load photo');
    }
  };

  const closeEmployeePhotoModal = () => {
    if (empPhotoModalUrl) URL.revokeObjectURL(empPhotoModalUrl);
    setEmpPhotoModalUrl(null);
    setEmpPhotoModalOpen(false);
    setEmpPhotoModalCaption('');
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
      title: 'Mobile',
      dataIndex: 'employee_mobile_number',
      key: 'employee_mobile_number',
      render: (v) => v || <Text type="secondary">—</Text>,
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
      title: 'Photo',
      key: 'has_employee_photo',
      width: 90,
      align: 'center',
      render: (_, record) => (
        <Checkbox
          checked={!!record.has_employee_photo}
          disabled
          title={record.has_employee_photo ? 'Photo on file' : 'No photo uploaded'}
        />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space wrap size="small">
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            Edit
          </Button>
          {record.has_employee_photo && (
            <Button type="link" icon={<PictureOutlined />} onClick={() => openEmployeePhotoModal(record)}>
              Photo
            </Button>
          )}
          <Button
            type="link"
            icon={<UploadOutlined />}
            onClick={() => triggerEmployeePhotoUpload(record.employee_id)}
          >
            Upload photo
          </Button>
          {record.has_employee_photo && (
            <Popconfirm title="Remove employee photo?" onConfirm={() => handleDeleteEmployeePhoto(record)}>
              <Button type="link" danger icon={<DeleteOutlined />}>
                Remove
              </Button>
            </Popconfirm>
          )}
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
          <Option value="Inactive">Show Inactive</Option        >
          <Option value="All">Show All</Option>
        </Select>
      </div>

      <input
        type="file"
        ref={employeePhotoInputRef}
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={handleEmployeePhotoFileChange}
      />

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
                    <div>
                      <Text strong>Photo on file: </Text>
                      <Checkbox checked={!!employee.has_employee_photo} disabled />
                      <Button type="link" size="small" style={{ paddingLeft: 8 }} onClick={() => triggerEmployeePhotoUpload(employee.employee_id)}>Upload</Button>
                      {employee.has_employee_photo && (
                        <Button type="link" size="small" onClick={() => openEmployeePhotoModal(employee)}>View</Button>
                      )}
                    </div>
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
        title={selectedEmployee
          ? `${[selectedEmployee.employee_first_name, selectedEmployee.employee_last_name, selectedEmployee.employee_sir_name].filter(Boolean).join(' ') || selectedEmployee.employee_id}`
          : 'Add Employee'}
        placement="right"
        width={isMobile ? '100%' : 560}
        onClose={() => { setFormVisible(false); form.resetFields(); }}
        open={formVisible}
        footer={null}
        bodyStyle={{ padding: 0 }}
      >
        <Tabs
          defaultActiveKey="details"
          size="small"
          tabBarStyle={{ paddingLeft: 16, paddingRight: 16, marginBottom: 0, background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}
          items={[
            {
              key: 'details',
              label: 'Details',
              children: (
                <div style={{ padding: '16px 20px' }}>
                  <Form form={form} layout="vertical" onFinish={handleSubmit}>
                    {!selectedEmployee && (
                      <Alert
                        type="info"
                        showIcon
                        message="Save the employee first, then use the Documents tab to upload photos and documents."
                        style={{ marginBottom: 16 }}
                      />
                    )}
                    {!selectedEmployee && (
                      <Form.Item name="employee_id" label="Employee ID" rules={[{ required: true }]}>
                        <Input placeholder="Alphanumeric employee ID" />
                      </Form.Item>
                    )}
                    <Form.Item name="employee_first_name" label="First Name"><Input /></Form.Item>
                    <Form.Item name="employee_last_name" label="Last Name"><Input /></Form.Item>
                    <Form.Item name="employee_sir_name" label="Middle Name / Sir Name"><Input /></Form.Item>
                    <Form.Item name="employee_department" label="Department"><Input /></Form.Item>
                    <Form.Item name="employee_designation" label="Designation"><Input /></Form.Item>
                    <Form.Item name="employee_mobile_number" label="Mobile Number">
                      <Input placeholder="+91 98765 43210" />
                    </Form.Item>
                    <Form.Item name="employee_floor" label="Floor / Wing">
                      <Input placeholder="e.g. 2nd Floor, Wing A" />
                    </Form.Item>
                    <Form.Item name="employee_room_number" label="Room Number"><Input /></Form.Item>
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
                    <Form.Item name="status" label="Status" rules={[{ required: true }]}>
                      <Select>
                        <Option value="Active">Active</Option>
                        <Option value="Inactive">Inactive</Option>
                      </Select>
                    </Form.Item>
                    <Form.Item name="employee_last_working_date" label="Last Working Date">
                      <DatePicker style={{ width: '100%' }} format="DD-MM-YYYY" />
                    </Form.Item>
                    <Divider orientation="left" style={{ fontSize: 13, color: '#595959', margin: '12px 0' }}>
                      Attrition / Retention
                    </Divider>
                    <Form.Item name="employee_date_of_resignation" label="Date of Resignation">
                      <DatePicker style={{ width: '100%' }} format="DD-MM-YYYY" />
                    </Form.Item>
                    <Form.Item name="employee_resignation_reason" label="Reason for Resignation">
                      <Select allowClear placeholder="Select reason">
                        <Option value="Better Opportunity">Better Opportunity</Option>
                        <Option value="Higher Studies">Higher Studies</Option>
                        <Option value="Personal Reasons">Personal Reasons</Option>
                        <Option value="Relocation">Relocation</Option>
                        <Option value="Health Reasons">Health Reasons</Option>
                        <Option value="Compensation">Compensation</Option>
                        <Option value="Work Environment">Work Environment</Option>
                        <Option value="Career Growth">Career Growth</Option>
                        <Option value="Retirement">Retirement</Option>
                        <Option value="Other">Other</Option>
                      </Select>
                    </Form.Item>
                    <Form.Item name="employee_retention_status" label="Retention Status">
                      <Select allowClear placeholder="N/A">
                        <Option value="N/A">N/A</Option>
                        <Option value="RETAINED">Retained</Option>
                        <Option value="NOT_RETAINED">Not Retained</Option>
                        <Option value="IN_DISCUSSION">In Discussion</Option>
                      </Select>
                    </Form.Item>
                    <Form.Item name="employee_retention_date" label="Retention Date">
                      <DatePicker style={{ width: '100%' }} format="DD-MM-YYYY" />
                    </Form.Item>
                    <Form.Item name="employee_retention_reason" label="Retention Reason">
                      <Input.TextArea rows={2} placeholder="Why was the employee retained?" />
                    </Form.Item>
                    <Form.Item>
                      <Space>
                        <Button type="primary" htmlType="submit">{selectedEmployee ? 'Update' : 'Create'}</Button>
                        <Button onClick={() => setFormVisible(false)}>Cancel</Button>
                      </Space>
                    </Form.Item>
                  </Form>
                </div>
              ),
            },
            ...(selectedEmployee ? [{
              key: 'documents',
              label: (
                <span>
                  <FolderOutlined /> Documents
                </span>
              ),
              children: (
                <div style={{ padding: '16px 20px' }}>
                  <DocumentsPanel
                    entityType="employee"
                    entityId={selectedEmployee.employee_id}
                    docTypes={['employee_photo', 'aadhar_front', 'aadhar_back', 'company_agreement', 'other_document']}
                    onFilesChange={() => {
                      fetchEmployees();
                      employeeAPI.getById(selectedEmployee.employee_id)
                        .then(r => setSelectedEmployee(r.data))
                        .catch(() => {});
                    }}
                  />
                </div>
              ),
            }] : []),
          ]}
        />
      </Drawer>

      <Modal
        title={empPhotoModalCaption || 'Employee photo'}
        open={empPhotoModalOpen}
        onCancel={closeEmployeePhotoModal}
        footer={null}
        width={480}
        destroyOnClose
      >
        {empPhotoModalUrl && (
          <div style={{ textAlign: 'center' }}>
            <img
              src={empPhotoModalUrl}
              alt={empPhotoModalCaption}
              style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
            />
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Employees;