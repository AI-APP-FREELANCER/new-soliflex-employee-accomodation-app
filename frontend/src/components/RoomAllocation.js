/**
 * RoomAllocation — room-level vacancy across all residences, and the
 * floor → room → bed layout of the selected residence (allocate / transfer / vacate).
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Select, Space, Tag, Typography, Switch, Button, Progress, message } from 'antd';
import { HomeOutlined, ReloadOutlined, FileExcelOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useLocation } from 'react-router-dom';
import { roomAPI, residenceAPI } from '../services/api';
import { exportTableToExcel } from '../utils/exportUtils';
import ResidenceStructure from './ResidenceStructure';

const { Title, Text } = Typography;
const STATUS_COLOR = { Full: 'red', 'Partially occupied': 'gold', Vacant: 'green', 'No beds': 'default' };

const RoomAllocation = () => {
  const location = useLocation();
  const [residences, setResidences] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [onlyVacant, setOnlyVacant] = useState(true);
  const [unit, setUnit] = useState(null);
  const [selected, setSelected] = useState(() => new URLSearchParams(location.search).get('residence'));

  const loadRooms = useCallback(async () => {
    setLoading(true);
    try {
      const [v, r] = await Promise.all([roomAPI.getVacancy(), residenceAPI.getAll('active')]);
      setRooms(Array.isArray(v.data) ? v.data : []);
      setResidences(Array.isArray(r.data) ? r.data : []);
    } catch {
      message.error('Failed to load rooms');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRooms(); }, [loadRooms]);

  const units = [...new Set(rooms.map(r => r.unit))].sort();
  const shown = rooms.filter(r => (!onlyVacant || r.vacant > 0) && (!unit || r.unit === unit));
  const totals = shown.reduce((s, r) => ({ cap: s.cap + r.capacity, occ: s.occ + r.occupied, vac: s.vac + r.vacant }), { cap: 0, occ: 0, vac: 0 });

  const doExport = () => {
    if (!shown.length) { message.warning('No data to export'); return; }
    exportTableToExcel(shown.map(r => ({
      Residence: r.residence, 'Residence ID': r.residence_id, Unit: r.unit, Floor: r.floor_number, Room: r.room_number,
      Type: r.room_type, Capacity: r.capacity, Occupied: r.occupied, Vacant: r.vacant, 'Occupancy %': r.occupancyPct, Status: r.status,
    })), 'Room Vacancy', `Room_Vacancy_${dayjs().format('YYYYMMDD')}.xlsx`);
  };

  const columns = [
    { title: 'Residence', dataIndex: 'residence', key: 'residence', render: (v, r) => <Button type="link" style={{ padding: 0 }} onClick={() => setSelected(r.residence_id)}>{v}</Button>,
      sorter: (a, b) => a.residence.localeCompare(b.residence) },
    { title: 'Unit', dataIndex: 'unit', key: 'unit' },
    { title: 'Floor', dataIndex: 'floor_number', key: 'floor', render: v => v || '—' },
    { title: 'Room', dataIndex: 'room_number', key: 'room' },
    { title: 'Type', dataIndex: 'room_type', key: 'type' },
    { title: 'Capacity', dataIndex: 'capacity', key: 'capacity', sorter: (a, b) => a.capacity - b.capacity },
    { title: 'Occupied', dataIndex: 'occupied', key: 'occupied' },
    { title: 'Vacant', dataIndex: 'vacant', key: 'vacant', defaultSortOrder: 'descend', sorter: (a, b) => a.vacant - b.vacant,
      render: v => <Text strong style={{ color: v > 0 ? '#52c41a' : '#8c8c8c' }}>{v}</Text> },
    { title: 'Occupancy', dataIndex: 'occupancyPct', key: 'pct', width: 130, render: v => <Progress percent={v} size="small" /> },
    { title: 'Status', dataIndex: 'status', key: 'status', render: v => <Tag color={STATUS_COLOR[v]}>{v}</Tag> },
  ];

  return (
    <div>
      <Title level={4} style={{ marginTop: 0 }}><HomeOutlined style={{ color: '#722ed1', marginRight: 8 }} />Rooms &amp; Allocation</Title>

      <Card
        size="small"
        style={{ marginBottom: 16 }}
        title={<Space wrap>
          <span>Room Vacancy</span>
          <Text type="secondary" style={{ fontSize: 12 }}>{shown.length} rooms · {totals.occ}/{totals.cap} beds occupied · {totals.vac} vacant</Text>
        </Space>}
        extra={<Space wrap>
          <Select allowClear placeholder="All units" style={{ width: 160 }} value={unit} onChange={setUnit}
            options={units.map(u => ({ value: u, label: u }))} />
          <Space size={4}><Switch size="small" checked={onlyVacant} onChange={setOnlyVacant} /><Text style={{ fontSize: 12 }}>Only rooms with vacancy</Text></Space>
          <Button size="small" icon={<FileExcelOutlined style={{ color: '#52c41a' }} />} onClick={doExport}>Export</Button>
          <Button size="small" icon={<ReloadOutlined />} onClick={loadRooms} loading={loading} />
        </Space>}
      >
        <Table size="small" rowKey="room_id" dataSource={shown} columns={columns} loading={loading} scroll={{ x: true }}
          pagination={shown.length > 10 ? { pageSize: 10, size: 'small', showSizeChanger: true } : false} />
      </Card>

      <Card size="small" title="Residence Layout — building → floor → room → employees"
        extra={<Select showSearch optionFilterProp="label" placeholder="Select residence" style={{ width: 320 }} value={selected}
          onChange={setSelected}
          options={residences.map(r => ({ value: r.residence_id, label: `${r.residence_id} — ${r.residence_door_number || ''} ${r.residence_address_line_1 || ''} (${r.residence_owner_name || '—'})` }))} />}>
        <ResidenceStructure residenceId={selected} onChanged={loadRooms} />
      </Card>
    </div>
  );
};

export default RoomAllocation;
