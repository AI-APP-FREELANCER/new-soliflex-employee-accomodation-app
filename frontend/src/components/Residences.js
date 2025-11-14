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
  message,
  Tag,
  Typography,
  Card,
  Descriptions,
} from 'antd';
import { PlusOutlined, EditOutlined, EyeOutlined } from '@ant-design/icons';
import { residenceAPI, agreementAPI, employeeAPI } from '../services/api';

const { Title } = Typography;
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
  const [form] = Form.useForm();

  useEffect(() => {
    fetchResidences();
  }, []);

  const fetchResidences = async () => {
    setLoading(true);
    try {
      const response = await residenceAPI.getAll();
      // Filter to show active residences by default
      const activeResidences = response.data.filter(
        r => r.residence_status === 'Active' || r.residence_status === 'active'
      );
      setResidences(activeResidences);
    } catch (error) {
      message.error('Failed to fetch residences');
      console.error(error);
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
      console.error(error);
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
      console.error(error);
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
      title: 'Status',
      dataIndex: 'residence_status',
      key: 'residence_status',
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
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
        <Title level={2} style={{ color: '#262626', margin: 0 }}>
          Residences Management
        </Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleAdd}
        >
          Add Residence
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={residences}
        loading={loading}
        rowKey="residence_id"
        pagination={{
          pageSize: pageSize,
          showSizeChanger: true,
          pageSizeOptions: ['10', '25', '50', '100'],
          onShowSizeChange: (current, size) => {
            setPageSize(size);
          },
        }}
      />

      {/* View Details Drawer */}
      <Drawer
        title="Residence Details"
        placement="right"
        width={600}
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
      >
        {selectedResidence && (
          <>
            <Descriptions title="Residence Information" bordered column={1}>
              <Descriptions.Item label="Residence ID">
                {selectedResidence.residence_id}
              </Descriptions.Item>
              <Descriptions.Item label="Owner ID">
                {selectedResidence.residence_owner_id || 'N/A'}
              </Descriptions.Item>
              <Descriptions.Item label="Owner Name">
                {selectedResidence.residence_owner_name || 'N/A'}
              </Descriptions.Item>
              <Descriptions.Item label="Door Number">
                {selectedResidence.residence_door_number || 'N/A'}
              </Descriptions.Item>
              <Descriptions.Item label="Address Line 1">
                {selectedResidence.residence_address_line_1 || 'N/A'}
              </Descriptions.Item>
              <Descriptions.Item label="Address Line 2">
                {selectedResidence.residence_address_line_2 || 'N/A'}
              </Descriptions.Item>
              <Descriptions.Item label="Address Line 3">
                {selectedResidence.residence_address_line_3 || 'N/A'}
              </Descriptions.Item>
              <Descriptions.Item label="State">
                {selectedResidence.residence_state || 'N/A'}
              </Descriptions.Item>
              <Descriptions.Item label="PIN Code">
                {selectedResidence.residence_pin_code || 'N/A'}
              </Descriptions.Item>
              <Descriptions.Item label="Country">
                {selectedResidence.residence_country || 'N/A'}
              </Descriptions.Item>
              <Descriptions.Item label="House Count">
                {selectedResidence.residence_house_count || 0}
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={selectedResidence.residence_status === 'Active' ? 'green' : 'red'}>
                  {selectedResidence.residence_status}
                </Tag>
              </Descriptions.Item>
            </Descriptions>

            <Title level={4} style={{ marginTop: '24px', color: '#262626' }}>
              Related Agreements
            </Title>
            {agreements.length > 0 ? (
              agreements.map((agreement) => {
                const agreementEmployees = employees.filter(
                  emp => emp.emplyee_allocated_agreement_id === agreement.agreement_id
                );
                return (
                  <Card key={agreement.agreement_id} style={{ marginBottom: '16px' }}>
                    <Descriptions title={`Agreement: ${agreement.agreement_id}`} bordered column={1} size="small">
                      <Descriptions.Item label="Status">
                        <Tag color={agreement.agreement_status === 'Active' ? 'green' : 'red'}>
                          {agreement.agreement_status}
                        </Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="Possession Date">
                        {agreement.agreement_possesion_date || 'N/A'}
                      </Descriptions.Item>
                      <Descriptions.Item label="Renewal Due Date">
                        {agreement.agreement_renewal_due_date || 'N/A'}
                      </Descriptions.Item>
                      <Descriptions.Item label="Monthly Rent">
                        ₹{agreement.agreement_monthly_rent_amount || 0}
                      </Descriptions.Item>
                      <Descriptions.Item label="Advance Amount">
                        ₹{agreement.agreement_advance_amount || 0}
                      </Descriptions.Item>
                    </Descriptions>
                    {agreementEmployees.length > 0 && (
                      <div style={{ marginTop: '12px' }}>
                        <strong>Current Residents:</strong>
                        <ul>
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
          </>
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
    </div>
  );
};

export default Residences;

