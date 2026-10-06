/**
 * ResidenceStructure — building → floor → room → bed → employee view for one residence,
 * with room setup (floor, type, capacity) and room-level allocate / transfer / vacate.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card, Row, Col, Tag, Button, Space, Typography, Modal, Form, Input, InputNumber, Select,
  DatePicker, Spin, Alert, Empty, Tooltip, Popconfirm, Tabs, Table, Progress, message,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, UserAddOutlined, SwapOutlined,
  LogoutOutlined, ReloadOutlined, CalendarOutlined, HistoryOutlined, ApartmentOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { roomAPI, employeeAPI, bedAPI } from '../services/api';
import { formatDateForDisplay } from '../utils/dateUtils';

const { Text, Title } = Typography;

const fmtD = (v) => (v ? formatDateForDisplay(v) : '—');
const ROOM_TYPES = ['Shared', 'Single', 'Dormitory', 'Family', 'Supervisor'];
const STATUS_COLOR = { Full: 'red', 'Partially occupied': 'gold', Vacant: 'green', 'No beds': 'default' };
const MOVE_COLOR = { ALLOCATE: 'blue', TRANSFER: 'purple' };

const empLabel = (e) =>
  `${[e.employee_first_name, e.employee_last_name, e.employee_sir_name].filter(Boolean).join(' ')} (${e.employee_id})${e.employee_department ? ` — ${e.employee_department}` : ''}`;

const ResidenceStructure = ({ residenceId, onChanged }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [allocatedIds, setAllocatedIds] = useState(new Set());
  const [vacancy, setVacancy] = useState([]);
  const [historyRows, setHistoryRows] = useState([]);
  const [modal, setModal] = useState(null);   // { type, room?, bed? }
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    if (!residenceId) return;
    setLoading(true);
    try {
      const [s, h] = await Promise.all([
        roomAPI.getStructure(residenceId),
        roomAPI.getHistory({ residenceId, limit: 100 }),
      ]);
      setData(s.data);
      setHistoryRows(Array.isArray(h.data) ? h.data : []);
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to load residence structure');
    } finally {
      setLoading(false);
    }
  }, [residenceId]);

  useEffect(() => { load(); }, [load]);

  const loadPickers = async () => {
    const [e, a, v] = await Promise.all([
      employeeAPI.getAll('active'),
      bedAPI.getAllocations({ activeOnly: true }),
      roomAPI.getVacancy({ onlyVacant: 'true' }),
    ]);
    setEmployees(Array.isArray(e.data) ? e.data : []);
    setAllocatedIds(new Set((a.data || []).map(x => x.employee_id)));
    setVacancy(Array.isArray(v.data) ? v.data : []);
  };

  const refreshAll = async () => { await load(); onChanged && onChanged(); };

  const open = async (type, ctx = {}) => {
    form.resetFields();
    if (type === 'room') {
      form.setFieldsValue(ctx.room
        ? { floor_number: ctx.room.floor_number, room_number: ctx.room.room_number, room_type: ctx.room.room_type, capacity: ctx.room.capacity, notes: ctx.room.notes }
        : { room_type: 'Shared', capacity: 2 });
    }
    if (type === 'allocate') {
      form.setFieldsValue({ allocated_date: dayjs(), employee_id: ctx.employeeId });
    }
    if (type === 'transfer') form.setFieldsValue({ transfer_date: dayjs() });
    if (type === 'vacate') form.setFieldsValue({ release_date: dayjs(), reason: undefined });
    if (type === 'dates') {
      const a = ctx.bed.allocation;
      form.setFieldsValue({
        allocated_date: a.allocated_date ? dayjs(a.allocated_date) : null,
        release_date: a.release_date ? dayjs(a.release_date) : null,
      });
    }
    setModal({ type, ...ctx });
    if (type === 'allocate' || type === 'transfer') {
      try { await loadPickers(); } catch { message.error('Failed to load employees / rooms'); }
    }
  };

  const close = () => { setModal(null); form.resetFields(); };
  const d = (v) => (v ? v.format('YYYY-MM-DD') : undefined);

  const submit = async () => {
    let values;
    try { values = await form.validateFields(); } catch { return; }
    setSaving(true);
    try {
      const { type, room, bed } = modal;
      if (type === 'room' && room) {
        await roomAPI.update(room.room_id, { floor_number: values.floor_number, room_type: values.room_type, capacity: values.capacity, notes: values.notes });
        message.success(`Room ${room.room_number} updated`);
      } else if (type === 'room') {
        await roomAPI.create({ ...values, residence_id: residenceId });
        message.success(`Room ${values.room_number} added with ${values.capacity} bed(s)`);
      } else if (type === 'allocate') {
        await roomAPI.allocate({
          employee_id: values.employee_id,
          ...(bed ? { bed_id: bed.bed_id } : { room_id: room.room_id }),
          allocated_date: d(values.allocated_date),
          release_date: d(values.release_date),
          notes: values.notes,
        });
        message.success('Employee allocated');
      } else if (type === 'transfer') {
        await roomAPI.transfer({
          employee_id: bed.allocation.employee_id,
          room_id: values.to_room_id,
          transfer_date: d(values.transfer_date),
          reason: values.reason,
        });
        message.success('Employee transferred');
      } else if (type === 'vacate') {
        await roomAPI.vacate({ alloc_id: bed.allocation.alloc_id, release_date: d(values.release_date), reason: values.reason });
        message.success('Bed vacated');
      } else if (type === 'dates') {
        await bedAPI.updateAllocation(bed.allocation.alloc_id, { allocated_date: d(values.allocated_date), release_date: d(values.release_date) ?? null });
        message.success('Allocation dates updated');
      }
      close();
      await refreshAll();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Action failed');
    } finally {
      setSaving(false);
    }
  };

  const removeRoom = async (room) => {
    try {
      const res = await roomAPI.remove(room.room_id);
      message.success(res.data?.deactivated ? `Room ${room.room_number} deactivated (has allocation history)` : `Room ${room.room_number} deleted`);
      await refreshAll();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Delete failed');
    }
  };

  const reactivateRoom = async (room) => {
    try {
      await roomAPI.update(room.room_id, { is_active: true, capacity: Math.max(1, room.beds.length) });
      message.success(`Room ${room.room_number} reactivated`);
      await refreshAll();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Reactivate failed');
    }
  };

  const freeEmployees = useMemo(
    () => employees.filter(e => !allocatedIds.has(e.employee_id)),
    [employees, allocatedIds]
  );

  if (!residenceId) return <Alert type="info" showIcon message="Select a residence to view its floors and rooms" />;
  if (loading && !data) return <div style={{ textAlign: 'center', padding: 40 }}><Spin tip="Loading…" /></div>;
  if (!data) return null;

  // ── Bed tile ───────────────────────────────────────────────────────────────
  const BedTile = ({ room, bed }) => {
    const a = bed.allocation;
    const inactive = a && a.employee_status !== 'Active';
    const leavingSoon = a?.last_working_date && dayjs(a.last_working_date).diff(dayjs(), 'day') <= 7;
    return (
      <div style={{
        border: `1px solid ${!a ? '#b7eb8f' : inactive ? '#ffa39e' : '#d9d9d9'}`,
        background: !a ? '#f6ffed' : inactive ? '#fff1f0' : '#fafafa',
        borderRadius: 6, padding: '6px 8px', fontSize: 12, height: '100%',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
          <Text strong style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{bed.bed_label}</Text>
          {a ? (
            <Space size={2}>
              <Tooltip title="Transfer to another room"><Button size="small" type="text" icon={<SwapOutlined />} onClick={() => open('transfer', { room, bed })} /></Tooltip>
              <Tooltip title="Adjust dates"><Button size="small" type="text" icon={<CalendarOutlined />} onClick={() => open('dates', { room, bed })} /></Tooltip>
              <Tooltip title="Vacate"><Button size="small" type="text" danger icon={<LogoutOutlined />} onClick={() => open('vacate', { room, bed })} /></Tooltip>
            </Space>
          ) : room.is_active && (
            <Tooltip title="Allocate this bed"><Button size="small" type="text" icon={<UserAddOutlined />} onClick={() => open('allocate', { room, bed })} /></Tooltip>
          )}
        </div>
        {a ? (
          <>
            <div style={{ fontWeight: 600 }}>{a.employee_name}</div>
            <div style={{ color: '#8c8c8c' }}>{a.department || '—'}</div>
            <div style={{ color: '#8c8c8c' }}>Since {fmtD(a.allocated_date)}</div>
            {inactive && <Tag color="error" style={{ marginTop: 2 }}>Employee inactive — vacate</Tag>}
            {!inactive && leavingSoon && <Tag color="warning" style={{ marginTop: 2 }}>Leaving {fmtD(a.last_working_date)}</Tag>}
          </>
        ) : <div style={{ color: '#52c41a', fontWeight: 600 }}>Vacant</div>}
      </div>
    );
  };

  // ── Room card ──────────────────────────────────────────────────────────────
  const RoomCard = ({ room }) => (
    <Card
      size="small"
      style={{ height: '100%', opacity: room.is_active ? 1 : 0.6 }}
      title={
        <Space wrap size={4}>
          <Text strong>Room {room.room_number}</Text>
          <Tag>{room.room_type || 'Shared'}</Tag>
          {room.is_active ? <Tag color={STATUS_COLOR[room.status]}>{room.status}</Tag> : <Tag>Inactive</Tag>}
        </Space>
      }
      extra={
        <Space size={0}>
          {room.is_active && room.vacant > 0 && (
            <Tooltip title="Allocate to this room"><Button size="small" type="link" icon={<UserAddOutlined />} onClick={() => open('allocate', { room })} /></Tooltip>
          )}
          {room.is_active
            ? <Tooltip title="Edit room / capacity"><Button size="small" type="link" icon={<EditOutlined />} onClick={() => open('room', { room })} /></Tooltip>
            : <Button size="small" type="link" onClick={() => reactivateRoom(room)}>Reactivate</Button>}
          {room.is_active && (
            <Popconfirm title={`Delete room ${room.room_number}?`} description="Only possible when nobody is allocated." onConfirm={() => removeRoom(room)}>
              <Button size="small" type="link" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      }
    >
      <div style={{ marginBottom: 8 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Capacity {room.capacity} · Occupied {room.occupied} · <Text strong style={{ color: room.vacant > 0 ? '#52c41a' : undefined, fontSize: 12 }}>Vacant {room.vacant}</Text>
        </Text>
        <Progress percent={room.occupancyPct} size="small" showInfo={false}
          strokeColor={room.occupancyPct >= 100 ? '#f5222d' : '#1890ff'} />
      </div>
      <Row gutter={[6, 6]}>
        {room.beds.filter(b => b.is_active).map(bed => (
          <Col xs={24} sm={12} key={bed.bed_id}><BedTile room={room} bed={bed} /></Col>
        ))}
      </Row>
      {room.notes && <div style={{ marginTop: 6, fontSize: 12, color: '#8c8c8c' }}>{room.notes}</div>}
    </Card>
  );

  const stat = (label, value, color) => (
    <Col xs={8} sm={6} md={4} key={label}>
      <Card size="small" bodyStyle={{ padding: '8px 10px', textAlign: 'center' }} style={{ borderTop: `3px solid ${color}` }}>
        <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
        <div style={{ fontSize: 11, color: '#595959' }}>{label}</div>
      </Card>
    </Col>
  );

  const historyCols = [
    { title: 'Date', dataIndex: 'allocated_date', render: fmtD, width: 100 },
    { title: 'Employee', key: 'emp', render: (_, r) => `${[r.employee_first_name, r.employee_last_name].filter(Boolean).join(' ') || r.employee_id}` },
    { title: 'Movement', dataIndex: 'movement_type', render: v => <Tag color={MOVE_COLOR[v] || 'default'}>{v === 'TRANSFER' ? 'Transferred in' : 'Allocated'}</Tag> },
    { title: 'Room / Bed', key: 'rb', render: (_, r) => `${r.floor_number ? r.floor_number + ' · ' : ''}Room ${r.room_number} · ${r.bed_label}` },
    { title: 'Released', dataIndex: 'release_date', render: (v, r) => (r.is_active ? <Tag color="green">Current</Tag> : fmtD(v)) },
    { title: 'Reason', key: 'reason', render: (_, r) => r.release_reason || r.notes || '—', ellipsis: true },
    { title: 'By', key: 'by', render: (_, r) => [r.allocated_by, r.released_by].filter(Boolean).join(' / ') || '—' },
  ];

  const structureTab = (
    <div>
      {!data.structureConfigured && (
        <Alert type="warning" showIcon style={{ marginBottom: 12 }}
          message="No rooms set up yet"
          description="Add the floors and rooms of this residence with their bed capacity. Occupancy and vacancy are measured from this setup." />
      )}
      {data.residentsWithoutRoom?.length > 0 && (
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          message={`${data.residentsWithoutRoom.length} employee(s) are linked to this residence but have no room assigned`}
          description={
            <Space wrap>
              {data.residentsWithoutRoom.map(e => (
                <Tag key={e.employee_id} color="blue" style={{ cursor: data.vacant > 0 ? 'pointer' : 'default' }}
                  onClick={() => {
                    const target = data.rooms.find(r => r.is_active && r.vacant > 0);
                    if (target) open('allocate', { room: target, employeeId: e.employee_id });
                    else message.info('No vacant room here — add a room or increase a room\'s capacity first');
                  }}>
                  {e.employee_name} ({e.employee_id}) — assign room
                </Tag>
              ))}
            </Space>
          } />
      )}
      {data.floors.map(f => (
        <div key={f.floor_number} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <ApartmentOutlined style={{ color: '#722ed1' }} />
            <Text strong>{f.floor_number}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {f.rooms.length} room(s) · {f.occupied}/{f.capacity} occupied · {f.vacant} vacant
            </Text>
          </div>
          <Row gutter={[12, 12]}>
            {f.rooms.map(room => (
              <Col xs={24} lg={12} key={room.room_id}><RoomCard room={room} /></Col>
            ))}
          </Row>
        </div>
      ))}
      {data.structureConfigured === false && <Empty description="No floors or rooms yet" />}
    </div>
  );

  const m = modal || {};
  const transferTargets = vacancy.filter(v => !(m.room && v.room_id === m.room.room_id));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div>
          <Title level={5} style={{ margin: 0 }}>{data.name}</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {data.residence_id} · Owner: {data.owner || '—'} · Unit: {data.unit}
            {data.agreement ? ` · Agreement ${data.agreement.agreement_id}` : ' · No active agreement'}
          </Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => open('room')} disabled={data.status !== 'active'}>Add Room</Button>
        </Space>
      </div>

      <Row gutter={[8, 8]} style={{ marginBottom: 12 }}>
        {stat('Floors', data.floors.length, '#722ed1')}
        {stat('Rooms', data.totalRooms, '#13c2c2')}
        {stat('Capacity (beds)', data.capacity, '#262626')}
        {stat('Occupied', data.occupied, '#1890ff')}
        {stat('Vacant', data.vacant, data.vacant > 0 ? '#52c41a' : '#8c8c8c')}
        {stat('Occupancy', `${data.occupancyPct}%`, data.occupancyPct >= 80 ? '#52c41a' : '#faad14')}
      </Row>

      <Tabs
        size="small"
        items={[
          { key: 'structure', label: 'Floors & Rooms', children: structureTab },
          {
            key: 'history', label: <span><HistoryOutlined /> Movement History</span>,
            children: <Table size="small" rowKey="alloc_id" dataSource={historyRows} columns={historyCols} scroll={{ x: true }}
              pagination={historyRows.length > 10 ? { pageSize: 10, size: 'small' } : false} />,
          },
        ]}
      />

      <Modal
        open={!!modal}
        onCancel={close}
        onOk={submit}
        confirmLoading={saving}
        destroyOnClose
        okText={{ room: m.room ? 'Save Room' : 'Add Room', allocate: 'Allocate', transfer: 'Transfer', vacate: 'Vacate', dates: 'Save' }[m.type]}
        okButtonProps={{ danger: m.type === 'vacate' }}
        title={{
          room: m.room ? `Edit Room ${m.room.room_number}` : 'Add Room',
          allocate: m.bed ? `Allocate ${m.room?.room_number} · ${m.bed.bed_label}` : `Allocate to Room ${m.room?.room_number}`,
          transfer: `Transfer ${m.bed?.allocation?.employee_name || ''}`,
          vacate: `Vacate ${m.bed?.allocation?.employee_name || ''}`,
          dates: `Adjust dates — ${m.bed?.allocation?.employee_name || ''}`,
        }[m.type]}
      >
        <Form form={form} layout="vertical">
          {m.type === 'room' && (
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="floor_number" label="Floor" rules={[{ required: true, message: 'Enter the floor (e.g. Ground, 1st)' }]}>
                  <Input placeholder="Ground / 1st / 2nd" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="room_number" label="Room number" rules={[{ required: true }]}>
                  <Input disabled={!!m.room} placeholder="e.g. 101" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="room_type" label="Room type"><Select options={ROOM_TYPES.map(v => ({ value: v, label: v }))} /></Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="capacity" label="Capacity (beds)" rules={[{ required: true }]}
                  extra={m.room ? `Currently ${m.room.occupied} occupied — capacity cannot go below that` : 'One bed is created per capacity'}>
                  <InputNumber min={m.room ? Math.max(1, m.room.occupied) : 1} max={50} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={24}><Form.Item name="notes" label="Notes"><Input.TextArea rows={2} /></Form.Item></Col>
            </Row>
          )}

          {m.type === 'allocate' && (
            <>
              <Form.Item name="employee_id" label="Employee" rules={[{ required: true }]}
                extra="Only active employees without a current room are listed. Use Transfer to move someone who already has a room.">
                <Select showSearch optionFilterProp="label" placeholder="Search employee"
                  options={freeEmployees.map(e => ({ value: e.employee_id, label: empLabel(e) }))}
                  onChange={(id) => {
                    const e = freeEmployees.find(x => x.employee_id === id);
                    form.setFieldsValue({ release_date: e?.employee_last_working_date ? dayjs(e.employee_last_working_date) : null });
                  }} />
              </Form.Item>
              <Row gutter={12}>
                <Col span={12}><Form.Item name="allocated_date" label="Allocation date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD-MM-YYYY" /></Form.Item></Col>
                <Col span={12}><Form.Item name="release_date" label="Planned release (optional)" extra="Defaults to last working date"><DatePicker style={{ width: '100%' }} format="DD-MM-YYYY" /></Form.Item></Col>
              </Row>
              <Form.Item name="notes" label="Notes"><Input /></Form.Item>
            </>
          )}

          {m.type === 'transfer' && (
            <>
              <Alert type="info" showIcon style={{ marginBottom: 12 }}
                message={`From: Room ${m.room?.room_number} · ${m.bed?.bed_label} (${data.name})`} />
              <Form.Item name="to_room_id" label="Move to room" rules={[{ required: true }]} extra="Only rooms with a vacant bed are listed (all residences).">
                <Select showSearch optionFilterProp="label" placeholder="Select destination room"
                  options={transferTargets.map(v => ({
                    value: v.room_id,
                    label: `${v.residence} — ${v.floor_number ? v.floor_number + ' · ' : ''}Room ${v.room_number} (${v.vacant} vacant of ${v.capacity}) · ${v.unit}`,
                  }))} />
              </Form.Item>
              <Row gutter={12}>
                <Col span={12}><Form.Item name="transfer_date" label="Transfer date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD-MM-YYYY" /></Form.Item></Col>
                <Col span={12}><Form.Item name="reason" label="Reason" rules={[{ required: true }]}><Input placeholder="e.g. Shift change" /></Form.Item></Col>
              </Row>
            </>
          )}

          {m.type === 'vacate' && (
            <>
              <Form.Item name="release_date" label="Vacate date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD-MM-YYYY" /></Form.Item>
              <Form.Item name="reason" label="Reason" rules={[{ required: true }]}>
                <Select options={['Left organisation', 'Moved out of company accommodation', 'Residence vacated', 'Other'].map(v => ({ value: v, label: v }))} />
              </Form.Item>
            </>
          )}

          {m.type === 'dates' && (
            <Row gutter={12}>
              <Col span={12}><Form.Item name="allocated_date" label="Allocation date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD-MM-YYYY" /></Form.Item></Col>
              <Col span={12}><Form.Item name="release_date" label="Planned release"><DatePicker style={{ width: '100%' }} format="DD-MM-YYYY" /></Form.Item></Col>
            </Row>
          )}
        </Form>
      </Modal>
    </div>
  );
};

export default ResidenceStructure;
