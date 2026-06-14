/**
 * BedManagement — Full bed-level tracking per property.
 *
 * Features
 * ─────────
 * • View all beds per residence (grouped by room)
 * • Add rooms + beds to a property
 * • Allocate a bed to an employee (duplicate prevention, auto-fills LWD as release date)
 * • Release a bed allocation (manual date override allowed)
 * • HR can manually adjust allocation or release date at any time
 * • Vacancy status colour coding
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Space, Tag, Typography, Select, Modal, Form,
  DatePicker, Input, InputNumber, Spin, message, Tooltip, Popconfirm,
  Row, Col, Divider, Alert, Badge,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
  UserAddOutlined, LogoutOutlined, ReloadOutlined,
  BankOutlined, HomeOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { bedAPI, residenceAPI, employeeAPI } from '../services/api';
import { formatDateForDisplay } from '../utils/dateUtils';

const { Text, Title } = Typography;
const { Option } = Select;

const fmtD = (v) => (!v || v === '—' ? '—' : formatDateForDisplay(v));

// ── Small status badge ─────────────────────────────────────────────────────
const BedStatus = ({ isOccupied, releaseDate }) => {
  if (!isOccupied) return <Tag color="success">Vacant</Tag>;
  if (releaseDate) {
    const daysLeft = dayjs(releaseDate).diff(dayjs(), 'day');
    if (daysLeft < 0)  return <Tag color="error">Occupied (Overdue release)</Tag>;
    if (daysLeft <= 7) return <Tag color="warning">Occupied (Releasing soon)</Tag>;
  }
  return <Tag color="processing">Occupied</Tag>;
};

// ─────────────────────────────────────────────────────────────────────────────
const BedManagement = ({ residenceId: propResidenceId }) => {
  const [residences, setResidences]       = useState([]);
  const [selectedResId, setSelectedResId] = useState(propResidenceId || null);
  const [beds, setBeds]                   = useState([]);
  const [employees, setEmployees]         = useState([]);
  const [loading, setLoading]             = useState(false);

  // Modal state
  const [addRoomModal, setAddRoomModal]       = useState(false);
  const [allocModal, setAllocModal]           = useState(false);
  const [releaseModal, setReleaseModal]       = useState(false);
  const [editAllocModal, setEditAllocModal]   = useState(false);
  const [activeBed, setActiveBed]             = useState(null);   // bed row being acted on
  const [activeAlloc, setActiveAlloc]         = useState(null);   // allocation being edited/released

  const [addRoomForm]  = Form.useForm();
  const [allocForm]    = Form.useForm();
  const [releaseForm]  = Form.useForm();
  const [editForm]     = Form.useForm();

  // ── Load residences & employees once ────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [rRes, eRes] = await Promise.all([
          residenceAPI.getAll('active'),
          employeeAPI.getAll('active'),
        ]);
        setResidences(Array.isArray(rRes.data) ? rRes.data : []);
        setEmployees(Array.isArray(eRes.data) ? eRes.data : []);
      } catch {
        message.error('Failed to load initial data');
      }
    })();
  }, []);

  // ── Load beds for the selected residence ────────────────────────────────
  const loadBeds = useCallback(async () => {
    if (!selectedResId) { setBeds([]); return; }
    setLoading(true);
    try {
      const res = await bedAPI.getBeds(selectedResId);
      setBeds(Array.isArray(res.data) ? res.data : []);
    } catch {
      message.error('Failed to load beds');
    } finally {
      setLoading(false);
    }
  }, [selectedResId]);

  useEffect(() => { loadBeds(); }, [loadBeds]);

  // ── Group beds by room ───────────────────────────────────────────────────
  const bedsByRoom = beds.reduce((acc, b) => {
    const key = b.room_number;
    if (!acc[key]) acc[key] = [];
    acc[key].push(b);
    return acc;
  }, {});

  // ── Add room + beds ──────────────────────────────────────────────────────
  const handleAddRoom = async (values) => {
    const { room_number, bed_count, bed_type, floor_number } = values;
    const bedsPayload = Array.from({ length: bed_count }, (_, i) => ({
      bed_label:    `B${i + 1}`,
      bed_type:     bed_type    || 'Standard',
      floor_number: floor_number || null,
    }));
    try {
      await bedAPI.createBeds(selectedResId, room_number, bedsPayload);
      message.success(`Room ${room_number} added with ${bed_count} bed(s)`);
      setAddRoomModal(false);
      addRoomForm.resetFields();
      loadBeds();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to add room');
    }
  };

  // ── Allocate bed ─────────────────────────────────────────────────────────
  const openAllocModal = (bed) => {
    setActiveBed(bed);
    allocForm.resetFields();
    // Pre-fill allocation date as today
    allocForm.setFieldsValue({ allocated_date: dayjs() });
    setAllocModal(true);
  };

  const handleAllocate = async (values) => {
    try {
      const payload = {
        employee_id:    values.employee_id,
        allocated_date: values.allocated_date ? values.allocated_date.format('YYYY-MM-DD') : undefined,
        release_date:   values.release_date   ? values.release_date.format('YYYY-MM-DD')   : undefined,
        notes:          values.notes || undefined,
      };
      await bedAPI.allocateBed(activeBed.bed_id, payload);
      message.success(`Bed ${activeBed.bed_id} allocated successfully`);
      setAllocModal(false);
      loadBeds();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Allocation failed');
    }
  };

  // When employee is selected, auto-fill release date from their LWD
  const handleEmployeeSelect = (empId) => {
    const emp = employees.find(e => e.employee_id === empId);
    if (emp?.employee_last_working_date) {
      allocForm.setFieldsValue({ release_date: dayjs(emp.employee_last_working_date) });
    } else {
      allocForm.setFieldsValue({ release_date: null });
    }
  };

  // ── Release bed ──────────────────────────────────────────────────────────
  const openReleaseModal = (bed) => {
    setActiveBed(bed);
    setActiveAlloc(bed.current_allocation);
    const defaultRelease = bed.current_allocation?.release_date
      ? dayjs(bed.current_allocation.release_date)
      : dayjs();
    releaseForm.setFieldsValue({
      release_date:   defaultRelease,
      release_reason: bed.current_allocation?.release_reason || '',
    });
    setReleaseModal(true);
  };

  const handleRelease = async (values) => {
    try {
      await bedAPI.releaseBed(activeAlloc.alloc_id, {
        release_date:   values.release_date ? values.release_date.format('YYYY-MM-DD') : undefined,
        release_reason: values.release_reason || 'Released by HR',
      });
      message.success('Bed released successfully');
      setReleaseModal(false);
      loadBeds();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Release failed');
    }
  };

  // ── Edit allocation dates ────────────────────────────────────────────────
  const openEditAlloc = (bed) => {
    setActiveBed(bed);
    setActiveAlloc(bed.current_allocation);
    editForm.setFieldsValue({
      allocated_date: bed.current_allocation?.allocated_date ? dayjs(bed.current_allocation.allocated_date) : null,
      release_date:   bed.current_allocation?.release_date   ? dayjs(bed.current_allocation.release_date)   : null,
      notes:          bed.current_allocation?.notes || '',
    });
    setEditAllocModal(true);
  };

  const handleEditAlloc = async (values) => {
    try {
      await bedAPI.updateAllocation(activeAlloc.alloc_id, {
        allocated_date: values.allocated_date ? values.allocated_date.format('YYYY-MM-DD') : undefined,
        release_date:   values.release_date   ? values.release_date.format('YYYY-MM-DD')   : undefined,
        notes:          values.notes,
      });
      message.success('Allocation updated');
      setEditAllocModal(false);
      loadBeds();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Update failed');
    }
  };

  // ── Delete bed ──────────────────────────────────────────────────────────
  const handleDeleteBed = async (bedId) => {
    try {
      await bedAPI.deleteBed(bedId);
      message.success('Bed removed');
      loadBeds();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Delete failed');
    }
  };

  // ── Stats ────────────────────────────────────────────────────────────────
  const totalBeds    = beds.length;
  const occupiedBeds = beds.filter(b => b.is_occupied).length;
  const vacantBeds   = totalBeds - occupiedBeds;

  // ── Columns ──────────────────────────────────────────────────────────────
  const columns = [
    {
      title: 'Bed ID',
      dataIndex: 'bed_id',
      key: 'bed_id',
      render: (v) => <Text code style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: 'Room',
      dataIndex: 'room_number',
      key: 'room_number',
      render: (v) => <Tag color="purple">Room {v}</Tag>,
    },
    {
      title: 'Bed',
      dataIndex: 'bed_label',
      key: 'bed_label',
    },
    {
      title: 'Floor',
      dataIndex: 'floor_number',
      key: 'floor_number',
      render: (v) => v ? <Tag color="geekblue">{v}</Tag> : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>,
    },
    {
      title: 'Type',
      dataIndex: 'bed_type',
      key: 'bed_type',
      render: (v) => v || 'Standard',
    },
    {
      title: 'Status',
      key: 'status',
      render: (_, r) => (
        <BedStatus
          isOccupied={r.is_occupied}
          releaseDate={r.current_allocation?.release_date}
        />
      ),
    },
    {
      title: 'Occupied By',
      key: 'employee',
      render: (_, r) => {
        const a = r.current_allocation;
        if (!a) return <Text type="secondary">—</Text>;
        const name = [a.employee_first_name, a.employee_last_name, a.employee_sir_name]
          .filter(Boolean).join(' ') || a.employee_id;
        return (
          <Space direction="vertical" size={0}>
            <Text strong style={{ fontSize: 13 }}>{name}</Text>
            <Text type="secondary" style={{ fontSize: 11 }}>{a.employee_department || ''}</Text>
          </Space>
        );
      },
    },
    {
      title: 'Allocated From',
      key: 'allocated_date',
      render: (_, r) => r.current_allocation ? fmtD(r.current_allocation.allocated_date) : '—',
    },
    {
      title: 'Release Date',
      key: 'release_date',
      render: (_, r) => {
        const rd = r.current_allocation?.release_date;
        if (!rd) return <Text type="secondary">—</Text>;
        const isPast = dayjs(rd).isBefore(dayjs(), 'day');
        return <Text style={{ color: isPast ? '#f5222d' : undefined }}>{fmtD(rd)}</Text>;
      },
    },
    {
      title: 'Last Working Date',
      key: 'lwd',
      render: (_, r) => {
        const lwd = r.current_allocation?.employee_last_working_date;
        return lwd ? fmtD(lwd) : '—';
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right',
      width: 160,
      render: (_, r) => (
        <Space size={4} wrap>
          {!r.is_occupied && (
            <Tooltip title="Allocate to employee">
              <Button size="small" type="primary" icon={<UserAddOutlined />} onClick={() => openAllocModal(r)}>
                Allocate
              </Button>
            </Tooltip>
          )}
          {r.is_occupied && (
            <>
              <Tooltip title="Edit allocation dates">
                <Button size="small" icon={<EditOutlined />} onClick={() => openEditAlloc(r)} />
              </Tooltip>
              <Tooltip title="Release bed">
                <Button size="small" danger icon={<LogoutOutlined />} onClick={() => openReleaseModal(r)} />
              </Tooltip>
            </>
          )}
          {!r.is_occupied && (
            <Popconfirm title="Remove this bed?" onConfirm={() => handleDeleteBed(r.bed_id)} okText="Yes" cancelText="No">
              <Tooltip title="Delete bed">
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Title level={4} style={{ margin: 0 }}>
          <HomeOutlined style={{ marginRight: 8, color: '#722ed1' }} />
          Bed-Level Occupancy Management
        </Title>
        <Space wrap>
          <Select
            placeholder="Select Property"
            style={{ width: 280 }}
            value={selectedResId}
            onChange={setSelectedResId}
            showSearch
            optionFilterProp="children"
            allowClear
          >
            {residences.map(r => (
              <Option key={r.residence_id} value={r.residence_id}>
                {r.residence_id} — {r.residence_owner_name || ''} {r.residence_area ? `(${r.residence_area})` : ''}
              </Option>
            ))}
          </Select>
          {selectedResId && (
            <>
              <Button icon={<PlusOutlined />} type="primary" onClick={() => setAddRoomModal(true)}>
                Add Room / Beds
              </Button>
              <Button icon={<ReloadOutlined />} onClick={loadBeds} loading={loading} />
            </>
          )}
        </Space>
      </div>

      {!selectedResId && (
        <Alert
          type="info"
          message="Select a property above to view and manage its bed layout"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {selectedResId && (
        <>
          {/* KPI strip */}
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            {[
              { label: 'Total Beds',    value: totalBeds,    color: '#722ed1' },
              { label: 'Occupied',      value: occupiedBeds, color: occupiedBeds > 0 ? '#1890ff' : '#52c41a' },
              { label: 'Vacant',        value: vacantBeds,   color: vacantBeds > 0 ? '#52c41a' : '#8c8c8c' },
              { label: 'Occupancy %',   value: totalBeds > 0 ? `${Math.round((occupiedBeds / totalBeds) * 100)}%` : '0%',
                color: totalBeds > 0 && (occupiedBeds / totalBeds) >= 0.8 ? '#52c41a' : '#faad14' },
            ].map(({ label, value, color }) => (
              <Col xs={12} md={6} key={label}>
                <Card size="small" style={{ borderTop: `3px solid ${color}`, textAlign: 'center' }} bodyStyle={{ padding: '10px 12px' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
                  <div style={{ fontSize: 12, color: '#595959' }}>{label}</div>
                </Card>
              </Col>
            ))}
          </Row>

          {/* Per-room sections */}
          {Object.keys(bedsByRoom).length === 0 && !loading && (
            <Alert
              type="warning"
              message="No beds configured for this property yet. Click 'Add Room / Beds' to set up the bed layout."
              showIcon
            />
          )}

          {Object.keys(bedsByRoom).sort().map(room => {
            const roomBeds = bedsByRoom[room];
            const occ = roomBeds.filter(b => b.is_occupied).length;
            return (
              <Card
                key={room}
                size="small"
                title={
                  <Space>
                    <BankOutlined style={{ color: '#722ed1' }} />
                    <span>Room {room}</span>
                    <Tag color={occ === roomBeds.length ? 'success' : occ > 0 ? 'processing' : 'default'}>
                      {occ}/{roomBeds.length} occupied
                    </Tag>
                  </Space>
                }
                style={{ marginBottom: 12 }}
              >
                <Table
                  dataSource={roomBeds}
                  columns={columns}
                  rowKey="bed_id"
                  pagination={false}
                  size="small"
                  scroll={{ x: true }}
                  rowClassName={(r) => r.is_occupied ? 'bed-row-occupied' : ''}
                />
              </Card>
            );
          })}
        </>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin tip="Loading beds…" />
        </div>
      )}

      {/* ── Add Room Modal ───────────────────────────────────────────────── */}
      <Modal
        title={<><PlusOutlined /> Add Room &amp; Beds to {selectedResId}</>}
        open={addRoomModal}
        onCancel={() => { setAddRoomModal(false); addRoomForm.resetFields(); }}
        footer={null}
        destroyOnClose
      >
        <Form form={addRoomForm} layout="vertical" onFinish={handleAddRoom}>
          <Form.Item name="room_number" label="Room Number / Label" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="e.g. 1, 2A, Ground-01" />
          </Form.Item>
          <Form.Item name="bed_count" label="Number of Beds in this Room" rules={[{ required: true, message: 'Required' }]}>
            <InputNumber min={1} max={20} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="floor_number" label="Floor / Level">
            <Select allowClear placeholder="Select floor (optional)">
              <Option value="Ground Floor">Ground Floor</Option>
              <Option value="1st Floor">1st Floor</Option>
              <Option value="2nd Floor">2nd Floor</Option>
              <Option value="3rd Floor">3rd Floor</Option>
              <Option value="4th Floor">4th Floor</Option>
              <Option value="5th Floor">5th Floor</Option>
              <Option value="6th Floor">6th Floor</Option>
              <Option value="Basement">Basement</Option>
            </Select>
          </Form.Item>
          <Form.Item name="bed_type" label="Bed Type" initialValue="Standard">
            <Select>
              <Option value="Standard">Standard</Option>
              <Option value="Single">Single</Option>
              <Option value="Double">Double</Option>
              <Option value="Bunk">Bunk</Option>
            </Select>
          </Form.Item>
          <Alert
            type="info"
            showIcon
            message="Beds will be auto-labelled B1, B2, … and assigned unique IDs combining the property ID, room number, and bed label."
            style={{ marginBottom: 12 }}
          />
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => { setAddRoomModal(false); addRoomForm.resetFields(); }}>Cancel</Button>
              <Button type="primary" htmlType="submit">Add Room</Button>
            </Space>
          </div>
        </Form>
      </Modal>

      {/* ── Allocate Bed Modal ───────────────────────────────────────────── */}
      <Modal
        title={<><UserAddOutlined /> Allocate Bed — {activeBed?.bed_id}</>}
        open={allocModal}
        onCancel={() => setAllocModal(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={allocForm} layout="vertical" onFinish={handleAllocate}>
          <Form.Item name="employee_id" label="Employee" rules={[{ required: true, message: 'Required' }]}>
            <Select
              showSearch
              placeholder="Search employee…"
              optionFilterProp="children"
              onChange={handleEmployeeSelect}
            >
              {employees.map(e => {
                const name = [e.employee_first_name, e.employee_last_name, e.employee_sir_name]
                  .filter(Boolean).join(' ');
                return (
                  <Option key={e.employee_id} value={e.employee_id}>
                    {e.employee_id} — {name} {e.employee_department ? `(${e.employee_department})` : ''}
                  </Option>
                );
              })}
            </Select>
          </Form.Item>
          <Form.Item name="allocated_date" label="Allocation Start Date" rules={[{ required: true, message: 'Required' }]}>
            <DatePicker style={{ width: '100%' }} format="DD-MM-YYYY" />
          </Form.Item>
          <Form.Item
            name="release_date"
            label={
              <Space>
                Release / Vacate Date
                <Text type="secondary" style={{ fontSize: 11 }}>
                  (auto-filled from employee's last working date if set — HR can adjust)
                </Text>
              </Space>
            }
          >
            <DatePicker style={{ width: '100%' }} format="DD-MM-YYYY" />
          </Form.Item>
          <Form.Item name="notes" label="Notes (optional)">
            <Input.TextArea rows={2} placeholder="e.g. Temporary allocation until new flat is ready" />
          </Form.Item>
          <Alert
            type="warning"
            showIcon
            message="A bed cannot be double-allocated. If this employee already holds another bed, that allocation must be released first."
            style={{ marginBottom: 12 }}
          />
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setAllocModal(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit">Allocate Bed</Button>
            </Space>
          </div>
        </Form>
      </Modal>

      {/* ── Release Bed Modal ────────────────────────────────────────────── */}
      <Modal
        title={<><LogoutOutlined style={{ color: '#f5222d' }} /> Release Bed — {activeBed?.bed_id}</>}
        open={releaseModal}
        onCancel={() => setReleaseModal(false)}
        footer={null}
        destroyOnClose
      >
        {activeAlloc && (
          <div style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 6, padding: 12, marginBottom: 16 }}>
            <Text strong>Current Occupant: </Text>
            <Text>
              {[activeAlloc.employee_first_name, activeAlloc.employee_last_name].filter(Boolean).join(' ') || activeAlloc.employee_id}
            </Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Allocated: {fmtD(activeAlloc.allocated_date)} &nbsp;|&nbsp;
              LWD: {fmtD(activeAlloc.employee_last_working_date) || '—'}
            </Text>
          </div>
        )}
        <Form form={releaseForm} layout="vertical" onFinish={handleRelease}>
          <Form.Item name="release_date" label="Release Date" rules={[{ required: true, message: 'Required' }]}>
            <DatePicker style={{ width: '100%' }} format="DD-MM-YYYY" />
          </Form.Item>
          <Form.Item name="release_reason" label="Reason">
            <Select placeholder="Select reason">
              <Option value="Employee resigned">Employee resigned</Option>
              <Option value="Employee transferred">Employee transferred</Option>
              <Option value="Accommodation no longer needed">Accommodation no longer needed</Option>
              <Option value="Manual HR release">Manual HR release</Option>
              <Option value="Bed reassignment">Bed reassignment</Option>
            </Select>
          </Form.Item>
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setReleaseModal(false)}>Cancel</Button>
              <Button type="primary" danger htmlType="submit">Release Bed</Button>
            </Space>
          </div>
        </Form>
      </Modal>

      {/* ── Edit Allocation Modal ────────────────────────────────────────── */}
      <Modal
        title={<><EditOutlined /> Adjust Allocation — {activeBed?.bed_id}</>}
        open={editAllocModal}
        onCancel={() => setEditAllocModal(false)}
        footer={null}
        destroyOnClose
      >
        <Alert
          type="info"
          showIcon
          message="HR can manually override allocation or release dates here. Changes are saved immediately."
          style={{ marginBottom: 16 }}
        />
        <Form form={editForm} layout="vertical" onFinish={handleEditAlloc}>
          <Form.Item name="allocated_date" label="Allocation Start Date">
            <DatePicker style={{ width: '100%' }} format="DD-MM-YYYY" />
          </Form.Item>
          <Form.Item name="release_date" label="Release / Vacate Date">
            <DatePicker style={{ width: '100%' }} format="DD-MM-YYYY" />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setEditAllocModal(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit">Save Changes</Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default BedManagement;
