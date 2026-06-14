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
  message,
  Tag,
  Typography,
  Card,
  Descriptions,
  Dropdown,
  Row,
  Col,
  Checkbox,
  Modal,
  Popconfirm,
  Tabs,
  Divider,
} from 'antd';
import { PlusOutlined, EditOutlined, EyeOutlined, DownloadOutlined, FilePdfOutlined, FileExcelOutlined, SearchOutlined, PictureOutlined, UploadOutlined, DeleteOutlined, FolderOutlined } from '@ant-design/icons';
import { residenceAPI, agreementAPI, employeeAPI } from '../services/api';
import api from '../services/api';
import DocumentsPanel from './DocumentsPanel';
import { exportToPDF, exportTableToExcel } from '../utils/exportUtils';
import { formatDateForDisplay } from '../utils/dateUtils';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

const Residences = () => {
  const [residences, setResidences] = useState([]);
  const [loading, setLoading] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [selectedResidence, setSelectedResidence] = useState(null);
  const [agreements, setAgreements] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [pageSize, setPageSize] = useState(10);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('active'); // 'active', 'inactive', 'all'
  const [isMobile, setIsMobile] = useState(false);
  const [form] = Form.useForm();
  const tableRef = useRef(null);
  const ownerPhotoInputRef = useRef(null);
  const currentOwnerPhotoUploadId = useRef(null);

  const [ownerDrawerImgUrl, setOwnerDrawerImgUrl] = useState(null);
  const [ownerPhotoModalOpen, setOwnerPhotoModalOpen] = useState(false);
  const [ownerPhotoModalUrl, setOwnerPhotoModalUrl] = useState(null);
  const [ownerPhotoModalCaption, setOwnerPhotoModalCaption] = useState('');

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
  }, [statusFilter]);

  useEffect(() => {
    if (!drawerVisible || !selectedResidence?.residence_id) {
      setOwnerDrawerImgUrl(null);
      return;
    }
    if (!selectedResidence.has_owner_photo) {
      setOwnerDrawerImgUrl(null);
      return;
    }
    const urlRef = { current: null };
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/residence/${selectedResidence.residence_id}/owner-photo`, { responseType: 'blob' });
        if (cancelled) return;
        urlRef.current = URL.createObjectURL(res.data);
        setOwnerDrawerImgUrl(urlRef.current);
      } catch {
        if (!cancelled) setOwnerDrawerImgUrl(null);
      }
    })();
    return () => {
      cancelled = true;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [drawerVisible, selectedResidence?.residence_id, selectedResidence?.has_owner_photo]);

  const fetchResidences = async () => {
    setLoading(true);
    try {
      const response = await residenceAPI.getAll(statusFilter);
      setResidences(response.data);
    } catch (error) {
      message.error('Failed to fetch residences');
      // Error handled by message.error above
    } finally {
      setLoading(false);
    }
  };

  const fetchRelatedData = async (residenceId) => {
    try {
      const [agreementsRes, employeesRes] = await Promise.all([
        agreementAPI.getByResidence(residenceId),
        employeeAPI.getAll(),
      ]);

      const relatedAgreements = agreementsRes.data;
      const allEmployees = employeesRes.data;

      // Get employees for each agreement
      const employeesWithAgreements = relatedAgreements.map(agreement => {
        const agreementEmployees = allEmployees.filter(
          emp => emp.emplyee_allocated_agreement_id === agreement.agreement_id
        );
        return { ...agreement, employees: agreementEmployees };
      });

      setAgreements(relatedAgreements);
      setEmployees(allEmployees);
    } catch (error) {
      message.error('Failed to fetch related data');
      // Error handled by message.error above
    }
  };

  const handleViewDetails = async (record) => {
    setSelectedResidence(record);
    await fetchRelatedData(record.residence_id);
    setDrawerVisible(true);
  };

  const handleAdd = () => {
    form.resetFields();
    setSelectedResidence(null);
    setFormVisible(true);
  };

  const handleEdit = (record) => {
    form.setFieldsValue(record);
    setSelectedResidence(record);
    setFormVisible(true);
  };

  const handleSubmit = async (values) => {
    try {
      if (selectedResidence) {
        await residenceAPI.update(selectedResidence.residence_id, values);
        message.success('Residence updated successfully');
      } else {
        await residenceAPI.create(values);
        message.success('Residence created successfully');
      }
      setFormVisible(false);
      form.resetFields();
      fetchResidences();
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to save residence');
      // Error handled by message.error above
    }
  };

  const isValidImageFile = (file) => {
    const okMime = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type);
    if (okMime) return true;
    return /\.(jpe?g|png|webp)$/i.test(file.name);
  };

  const triggerOwnerPhotoUpload = (residenceId) => {
    currentOwnerPhotoUploadId.current = residenceId;
    ownerPhotoInputRef.current?.click();
  };

  const handleOwnerPhotoFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!isValidImageFile(file)) {
      message.error('Only JPG, JPEG, PNG and WebP images are allowed');
      return;
    }
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      message.error('Image must be 5MB or smaller');
      return;
    }
    const rid = currentOwnerPhotoUploadId.current;
    currentOwnerPhotoUploadId.current = null;
    if (!rid) return;
    try {
      const formData = new FormData();
      formData.append('file', file);
      await residenceAPI.uploadOwnerPhoto(rid, formData);
      message.success('Owner photo uploaded');
      await fetchResidences();
      if (selectedResidence?.residence_id === rid) {
        const res = await residenceAPI.getById(rid);
        setSelectedResidence(res.data);
      }
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to upload photo');
    }
  };

  const handleDeleteOwnerPhoto = async (record) => {
    try {
      await residenceAPI.deleteOwnerPhoto(record.residence_id);
      message.success('Owner photo removed');
      await fetchResidences();
      if (selectedResidence?.residence_id === record.residence_id) {
        const res = await residenceAPI.getById(record.residence_id);
        setSelectedResidence(res.data);
      }
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to remove photo');
    }
  };

  const openOwnerPhotoModal = async (record) => {
    try {
      const res = await api.get(`/residence/${record.residence_id}/owner-photo`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      setOwnerPhotoModalUrl(url);
      setOwnerPhotoModalCaption(`${record.residence_owner_name || 'Owner'} · ${record.residence_id}`);
      setOwnerPhotoModalOpen(true);
    } catch {
      message.error('Could not load photo');
    }
  };

  const closeOwnerPhotoModal = () => {
    if (ownerPhotoModalUrl) URL.revokeObjectURL(ownerPhotoModalUrl);
    setOwnerPhotoModalUrl(null);
    setOwnerPhotoModalOpen(false);
    setOwnerPhotoModalCaption('');
  };

  // Filter residences based on search text
  const filteredResidences = useMemo(() => {
    if (!searchText.trim()) {
      return residences;
    }

    const lowerSearch = searchText.toLowerCase().trim();
    const searchTerms = lowerSearch.split(/\s+/); // Split by spaces for combined search

    return residences.filter(residence => {
      const ownerName = (residence.residence_owner_name || '').toLowerCase();
      const residenceId = (residence.residence_id || '').toLowerCase();
      const addressLine2 = (residence.residence_address_line_2 || '').toLowerCase();
      const addressLine1 = (residence.residence_address_line_1 || '').toLowerCase();
      const addressLine3 = (residence.residence_address_line_3 || '').toLowerCase();

      // If multiple terms, all must match somewhere
      if (searchTerms.length > 1) {
        return searchTerms.every(term => 
          ownerName.includes(term) ||
          residenceId.includes(term) ||
          addressLine2.includes(term) ||
          addressLine1.includes(term) ||
          addressLine3.includes(term)
        );
      }

      // Single term search - match any field
      return (
        ownerName.includes(lowerSearch) ||
        residenceId.includes(lowerSearch) ||
        addressLine2.includes(lowerSearch) ||
        addressLine1.includes(lowerSearch) ||
        addressLine3.includes(lowerSearch)
      );
    });
  }, [searchText, residences]);

  // Export handlers
  const handleExportPDF = async () => {
    try {
      message.loading({ content: 'Generating PDF...', key: 'export' });
      await exportToPDF(tableRef, `Residences_${dayjs().format('YYYY-MM-DD')}.pdf`);
      message.success({ content: 'PDF exported successfully!', key: 'export' });
    } catch (error) {
      message.error({ content: 'Failed to export PDF', key: 'export' });
      // Error handled by message.error above
    }
  };

  const handleExportExcel = () => {
    try {
      message.loading({ content: 'Generating Excel...', key: 'export' });
      
      const exportData = filteredResidences.map(r => ({
        'Residence ID': r.residence_id || '',
        'Owner ID': r.residence_owner_id || '',
        'Owner Name': r.residence_owner_name || '',
        'Door Number': r.residence_door_number || '',
        'Address Line 1': r.residence_address_line_1 || '',
        'Address Line 2': r.residence_address_line_2 || '',
        'Address Line 3': r.residence_address_line_3 || '',
        'State': r.residence_state || '',
        'PIN Code': r.residence_pin_code || '',
        'Country': r.residence_country || '',
        'House Count': r.residence_house_count || 0,
        'Status': r.residence_status || '',
      }));

      exportTableToExcel(exportData, 'Residences', `Residences_${dayjs().format('YYYY-MM-DD')}.xlsx`);
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
      title: 'Residence ID',
      dataIndex: 'residence_id',
      key: 'residence_id',
    },
    {
      title: 'Owner Name',
      dataIndex: 'residence_owner_name',
      key: 'residence_owner_name',
    },
    {
      title: 'Address',
      key: 'address',
      render: (_, record) => {
        const addressParts = [
          record.residence_address_line_1,
          record.residence_address_line_2,
          record.residence_address_line_3,
        ].filter(Boolean);
        return addressParts.join(', ') || 'N/A';
      },
    },
    {
      title: 'House Count',
      dataIndex: 'residence_house_count',
      key: 'residence_house_count',
    },
    {
      title: 'Owner Name',
      dataIndex: 'residence_owner_name',
      key: 'residence_owner_name',
      render: (name, record) => (
        <span style={{ 
          opacity: record.status === 'inactive' ? 0.6 : 1,
          color: record.status === 'inactive' ? '#8c8c8c' : '#262626'
        }}>
          {name || 'N/A'}
        </span>
      ),
    },
    {
      title: 'Owner Contact',
      key: 'owner_contact',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          {record.residence_owner_contact && (
            <Text style={{ fontSize: 12 }}>
              📞 {record.residence_owner_contact}
            </Text>
          )}
          {record.residence_owner_phone && (
            <Text style={{ fontSize: 12 }}>
              📱 {record.residence_owner_phone}
            </Text>
          )}
          {!record.residence_owner_contact && !record.residence_owner_phone && (
            <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'residence_status',
      key: 'residence_status',
      render: (status, record) => (
        <Tag color={status === 'Active' || record.status === 'active' ? 'green' : 'red'}>
          {status}
        </Tag>
      ),
    },
    {
      title: 'Owner photo',
      key: 'has_owner_photo',
      width: 110,
      align: 'center',
      render: (_, record) => (
        <Checkbox
          checked={!!record.has_owner_photo}
          disabled
          title={record.has_owner_photo ? 'Photo on file' : 'No photo uploaded'}
        />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space wrap size="small">
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetails(record)}
          >
            View Details
          </Button>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            Edit
          </Button>
          {record.has_owner_photo && (
            <Button
              type="link"
              icon={<PictureOutlined />}
              onClick={() => openOwnerPhotoModal(record)}
            >
              Photo
            </Button>
          )}
          <Button
            type="link"
            icon={<UploadOutlined />}
            onClick={() => triggerOwnerPhotoUpload(record.residence_id)}
          >
            Upload photo
          </Button>
          {record.has_owner_photo && (
            <Popconfirm
              title="Remove owner photo?"
              onConfirm={() => handleDeleteOwnerPhoto(record)}
              okText="Remove"
              cancelText="Cancel"
            >
              <Button type="link" danger icon={<DeleteOutlined />}>
                Remove
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
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
          Residences Management
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
            Add Residence
          </Button>
        </Space>
      </div>

      <div style={{ marginBottom: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <Input
          placeholder="Search by Owner Name, Residence ID, or Address..."
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
          <Option value="active">Show Active</Option>
          <Option value="inactive">Show Inactive</Option>
          <Option value="all">Show All</Option>
        </Select>
      </div>

      <input
        type="file"
        ref={ownerPhotoInputRef}
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={handleOwnerPhotoFileChange}
      />

      <div ref={tableRef}>
        {isMobile ? (
          // Mobile Card View
          <div>
            {filteredResidences.map((residence) => {
              const addressParts = [
                residence.residence_address_line_1,
                residence.residence_address_line_2,
                residence.residence_address_line_3,
              ].filter(Boolean);
              return (
                <Card
                  key={residence.residence_id}
                  style={{ marginBottom: '16px' }}
                  actions={[
                    <Button
                      key="view"
                      type="link"
                      icon={<EyeOutlined />}
                      onClick={() => handleViewDetails(residence)}
                      block
                    >
                      View Details
                    </Button>,
                    <Button
                      key="edit"
                      type="link"
                      icon={<EditOutlined />}
                      onClick={() => handleEdit(residence)}
                      block
                    >
                      Edit
                    </Button>,
                  ]}
                >
                  <Space direction="vertical" style={{ width: '100%' }} size="small">
                    <div>
                      <Text strong>Residence ID: </Text>
                      <Text>{residence.residence_id}</Text>
                    </div>
                    <div>
                      <Text strong>Owner Name: </Text>
                      <Text style={{ 
                        color: (residence.status === 'inactive' || residence.residence_status === 'Inactive') ? '#8c8c8c' : '#262626'
                      }}>
                        {residence.residence_owner_name || 'N/A'}
                      </Text>
                    </div>
                    {residence.residence_owner_id && (
                      <div>
                        <Text strong>Owner ID: </Text>
                        <Text>{residence.residence_owner_id}</Text>
                      </div>
                    )}
                    <div>
                      <Text strong>Owner Name: </Text>
                      <Text style={{ 
                        color: (residence.status === 'inactive' || residence.residence_status === 'Inactive') ? '#8c8c8c' : '#262626'
                      }}>
                        {residence.residence_owner_name || 'N/A'}
                      </Text>
                    </div>
                    {residence.residence_owner_id && (
                      <div>
                        <Text strong>Owner ID: </Text>
                        <Text>{residence.residence_owner_id}</Text>
                      </div>
                    )}
                    <div>
                      <Text strong>Address: </Text>
                      <Text>{addressParts.join(', ') || 'N/A'}</Text>
                    </div>
                    <div>
                      <Text strong>House Count: </Text>
                      <Text>{residence.residence_house_count || 0}</Text>
                    </div>
                    <div>
                      <Text strong>Status: </Text>
                      <Tag color={residence.residence_status === 'Active' ? 'green' : 'red'}>
                        {residence.residence_status}
                      </Tag>
                    </div>
                    <div>
                      <Text strong>Owner photo on file: </Text>
                      <Checkbox checked={!!residence.has_owner_photo} disabled />
                      <Button
                        type="link"
                        size="small"
                        style={{ paddingLeft: 8 }}
                        onClick={() => triggerOwnerPhotoUpload(residence.residence_id)}
                      >
                        Upload
                      </Button>
                      {residence.has_owner_photo && (
                        <Button type="link" size="small" onClick={() => openOwnerPhotoModal(residence)}>
                          View
                        </Button>
                      )}
                    </div>
                  </Space>
                </Card>
              );
            })}
            {filteredResidences.length === 0 && !loading && (
              <div style={{ textAlign: 'center', padding: '40px', color: '#8c8c8c' }}>
                No residences found
              </div>
            )}
          </div>
        ) : (
          // Desktop Table View
          <div style={{ overflowX: 'auto' }}>
            <Table
              columns={columns}
              dataSource={filteredResidences}
              loading={loading}
              rowKey="residence_id"
              scroll={{ x: 'max-content' }}
              rowClassName={(record) => {
                const isInactive = record.status === 'inactive' || record.residence_status === 'Inactive';
                return isInactive ? 'inactive-row' : '';
              }}
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

      {/* View Details Drawer */}
      <Drawer
        title={selectedResidence
          ? `${selectedResidence.residence_owner_name || ''} · ${selectedResidence.residence_id}`
          : 'Residence Details'}
        placement="right"
        width={isMobile ? '100%' : 640}
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
        bodyStyle={{ padding: 0 }}
      >
        {selectedResidence && (
          <Tabs
            defaultActiveKey="info"
            size="small"
            tabBarStyle={{ paddingLeft: 16, paddingRight: 16, marginBottom: 0, background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}
            items={[
              {
                key: 'info',
                label: 'Details',
                children: (
                  <div style={{ padding: '16px 20px' }}>
                    <Descriptions title="Residence Information" bordered column={1} size="small">
                      <Descriptions.Item label="Residence ID">{selectedResidence.residence_id}</Descriptions.Item>
                      <Descriptions.Item label="Owner ID">{selectedResidence.residence_owner_id || 'N/A'}</Descriptions.Item>
                      <Descriptions.Item label="Owner Name">{selectedResidence.residence_owner_name || 'N/A'}</Descriptions.Item>
                      <Descriptions.Item label="Door Number">{selectedResidence.residence_door_number || 'N/A'}</Descriptions.Item>
                      <Descriptions.Item label="Address Line 1">{selectedResidence.residence_address_line_1 || 'N/A'}</Descriptions.Item>
                      <Descriptions.Item label="Address Line 2">{selectedResidence.residence_address_line_2 || 'N/A'}</Descriptions.Item>
                      <Descriptions.Item label="Address Line 3">{selectedResidence.residence_address_line_3 || 'N/A'}</Descriptions.Item>
                      <Descriptions.Item label="State">{selectedResidence.residence_state || 'N/A'}</Descriptions.Item>
                      <Descriptions.Item label="PIN Code">{selectedResidence.residence_pin_code || 'N/A'}</Descriptions.Item>
                      <Descriptions.Item label="Country">{selectedResidence.residence_country || 'N/A'}</Descriptions.Item>
                      <Descriptions.Item label="House Count">{selectedResidence.residence_house_count || 0}</Descriptions.Item>
                      <Descriptions.Item label="Status">
                        <Tag color={selectedResidence.residence_status === 'Active' ? 'green' : 'red'}>
                          {selectedResidence.residence_status}
                        </Tag>
                      </Descriptions.Item>
                    </Descriptions>

                    <Divider orientation="left" style={{ marginTop: 24 }}>Related Agreements</Divider>
                    {agreements.length > 0 ? (
                      agreements.map((agreement) => {
                        const agreementEmployees = employees.filter(
                          emp => emp.emplyee_allocated_agreement_id === agreement.agreement_id
                        );
                        return (
                          <Card key={agreement.agreement_id} size="small" style={{ marginBottom: 12 }}>
                            <Descriptions title={`Agreement: ${agreement.agreement_id}`} bordered column={1} size="small">
                              <Descriptions.Item label="Status">
                                <Tag color={agreement.agreement_status === 'Active' ? 'green' : 'red'}>{agreement.agreement_status}</Tag>
                              </Descriptions.Item>
                              <Descriptions.Item label="Possession Date">{formatDateForDisplay(agreement.agreement_possesion_date)}</Descriptions.Item>
                              <Descriptions.Item label="Renewal Due Date">{formatDateForDisplay(agreement.agreement_renewal_due_date)}</Descriptions.Item>
                              <Descriptions.Item label="Monthly Rent">₹{agreement.agreement_monthly_rent_amount || 0}</Descriptions.Item>
                              <Descriptions.Item label="Advance Amount">₹{agreement.agreement_advance_amount || 0}</Descriptions.Item>
                            </Descriptions>
                            {agreementEmployees.length > 0 && (
                              <div style={{ marginTop: 8 }}>
                                <strong>Current Residents:</strong>
                                <ul style={{ marginTop: 4, marginBottom: 0 }}>
                                  {agreementEmployees.map((emp) => (
                                    <li key={emp.employee_id}>
                                      {emp.employee_first_name} {emp.employee_last_name} ({emp.employee_department})
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </Card>
                        );
                      })
                    ) : (
                      <p>No agreements found for this residence.</p>
                    )}
                  </div>
                ),
              },
              {
                key: 'photos',
                label: (
                  <span><FolderOutlined /> Photos</span>
                ),
                children: (
                  <div style={{ padding: '16px 20px' }}>
                    <DocumentsPanel
                      entityType="residence"
                      entityId={selectedResidence.residence_id}
                      docTypes={['owner_photo', 'property_photo']}
                      onFilesChange={() => {
                        fetchResidences();
                        residenceAPI.getById(selectedResidence.residence_id)
                          .then(r => setSelectedResidence(r.data))
                          .catch(() => {});
                      }}
                    />
                  </div>
                ),
              },
            ]}
          />
        )}
      </Drawer>

      {/* Create/Edit Form Modal */}
      <Drawer
        title={selectedResidence ? 'Edit Residence' : 'Add Residence'}
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
            name="residence_owner_id"
            label="Owner ID"
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="residence_owner_name"
            label="Owner Name"
            rules={[{ required: true, message: 'Please input owner name!' }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="residence_door_number"
            label="Door Number"
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="residence_address_line_1"
            label="Address Line 1"
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="residence_address_line_2"
            label="Address Line 2"
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="residence_address_line_3"
            label="Address Line 3"
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="residence_state"
            label="State"
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="residence_pin_code"
            label="PIN Code"
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="residence_country"
            label="Country"
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="residence_house_count"
            label="House Count"
          >
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="residence_owner_contact"
            label="Owner Contact (Primary)"
          >
            <Input placeholder="e.g. +91 98765 43210" />
          </Form.Item>

          <Form.Item
            name="residence_owner_phone"
            label="Owner Phone (Secondary)"
          >
            <Input placeholder="e.g. +91 80 2345 6789" />
          </Form.Item>

          <Form.Item
            name="residence_status"
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
                {selectedResidence ? 'Update' : 'Create'}
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

      <Modal
        title={ownerPhotoModalCaption || 'Owner photo'}
        open={ownerPhotoModalOpen}
        onCancel={closeOwnerPhotoModal}
        footer={null}
        width={480}
        destroyOnClose
      >
        {ownerPhotoModalUrl && (
          <div style={{ textAlign: 'center' }}>
            <img
              src={ownerPhotoModalUrl}
              alt={ownerPhotoModalCaption}
              style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
            />
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Residences;

