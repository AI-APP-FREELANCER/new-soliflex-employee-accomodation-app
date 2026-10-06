/**
 * UnitSettings — maintain the standard unit list used by every HR team, and clean up
 * agreements that were typed with a non-standard unit name.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Space, Tag, Typography, Modal, Form, Input, Select, Switch, Alert, message } from 'antd';
import { AppstoreOutlined, PlusOutlined, EditOutlined, ReloadOutlined } from '@ant-design/icons';
import { unitAPI } from '../services/api';

const { Title, Text } = Typography;

const UnitSettings = () => {
  const [data, setData] = useState({ units: [], unmatched: [], activeAgreementsWithoutUnit: 0 });
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);   // unit row, or {} for new
  const [mapTo, setMapTo] = useState({});
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await unitAPI.getAll();
      setData(res.data);
    } catch {
      message.error('Failed to load units');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEdit = (unit) => {
    form.setFieldsValue(unit ? { unit_name: unit.unit_name, unit_code: unit.unit_code } : { unit_name: '', unit_code: '' });
    setEditing(unit || {});
  };

  const save = async () => {
    let v;
    try { v = await form.validateFields(); } catch { return; }
    try {
      if (editing.unit_id) await unitAPI.update(editing.unit_id, v);
      else await unitAPI.create(v);
      message.success('Unit saved');
      setEditing(null);
      load();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Save failed');
    }
  };

  const toggle = async (unit, active) => {
    try {
      await unitAPI.update(unit.unit_id, { is_active: active });
      load();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Update failed');
    }
  };

  const standardise = async (unit) => {
    try {
      await unitAPI.update(unit.unit_id, { unit_name: unit.unit_name });
      message.success(`Agreements now use "${unit.unit_name}"`);
      load();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Update failed');
    }
  };

  const map = async (value) => {
    const unitId = mapTo[value];
    if (!unitId) { message.warning('Choose the standard unit first'); return; }
    try {
      const res = await unitAPI.mapValue(unitId, value);
      message.success(`${res.data.updated} agreement(s) moved to ${res.data.unit.unit_name}`);
      load();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Update failed');
    }
  };

  const activeUnits = data.units.filter(u => u.is_active);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Title level={4} style={{ margin: 0 }}><AppstoreOutlined style={{ color: '#1890ff', marginRight: 8 }} />Units</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit(null)}>Add Unit</Button>
        </Space>
      </div>

      <Alert type="info" showIcon style={{ marginBottom: 16 }}
        message="One standard unit list for all HR teams"
        description="Agreements can only be assigned to a unit from this list, so occupancy, rent and refund reports group each unit the same way. Renaming a unit updates its agreements." />

      {data.activeAgreementsWithoutUnit > 0 && (
        <Alert type="warning" showIcon style={{ marginBottom: 16 }}
          message={`${data.activeAgreementsWithoutUnit} active agreement(s) have no unit — set it from the Agreements page so they appear in unit reports.`} />
      )}

      <Card size="small" title="Standard units" style={{ marginBottom: 16 }}>
        <Table size="small" rowKey="unit_id" loading={loading} dataSource={data.units} pagination={false}
          columns={[
            { title: 'Unit', dataIndex: 'unit_name', key: 'unit_name' },
            { title: 'Code', dataIndex: 'unit_code', key: 'unit_code', render: v => v || '—' },
            { title: 'Active agreements', dataIndex: 'active_agreements', key: 'active_agreements' },
            { title: 'All agreements', dataIndex: 'agreements', key: 'agreements' },
            { title: 'Spellings found', dataIndex: 'spellings', key: 'spellings',
              render: (v, r) => (v.length > 1 ? (
                <Space wrap size={4}>
                  {v.map(s => <Tag key={s}>"{s}"</Tag>)}
                  <Button size="small" type="link" onClick={() => standardise(r)}>Standardise to "{r.unit_name}"</Button>
                </Space>
              ) : <Text type="secondary">—</Text>) },
            { title: 'In use', dataIndex: 'is_active', key: 'is_active', render: (v, r) => <Switch size="small" checked={v} onChange={(c) => toggle(r, c)} /> },
            { title: '', key: 'edit', render: (_, r) => <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEdit(r)}>Edit</Button> },
          ]} />
      </Card>

      {data.unmatched.length > 0 && (
        <Card size="small" title="Non-standard unit values on agreements">
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            These values were typed on agreements but do not match any standard unit. Map each to the correct unit.
          </Text>
          <Table size="small" rowKey="value" pagination={false} dataSource={data.unmatched}
            columns={[
              { title: 'Value on agreements', dataIndex: 'value', key: 'value', render: (v, r) => r.spellings.map(s => <Tag key={s}>"{s}"</Tag>) },
              { title: 'Agreements', dataIndex: 'agreements', key: 'agreements' },
              { title: 'Map to', key: 'map', render: (_, r) => (
                <Space>
                  <Select placeholder="Standard unit" style={{ width: 180 }} value={mapTo[r.value]}
                    onChange={(id) => setMapTo(s => ({ ...s, [r.value]: id }))}
                    options={activeUnits.map(u => ({ value: u.unit_id, label: u.unit_name }))} />
                  <Button size="small" type="primary" onClick={() => map(r.value)}>Apply</Button>
                </Space>
              ) },
            ]} />
        </Card>
      )}

      <Modal open={!!editing} title={editing?.unit_id ? 'Edit Unit' : 'Add Unit'} onCancel={() => setEditing(null)} onOk={save} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="unit_name" label="Unit name" rules={[{ required: true, whitespace: true }]}><Input placeholder="e.g. Unit 1 — Bommasandra" /></Form.Item>
          <Form.Item name="unit_code" label="Short code (optional)"><Input placeholder="e.g. U1" /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UnitSettings;
