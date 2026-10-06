/**
 * AdvanceRefunds — refund process for vacated / vacating agreements:
 * deductions → request & follow-up → receipts (partial allowed) → settled.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Tag, Button, Space, Typography, Row, Col, Modal, Form, InputNumber, DatePicker,
  Input, Select, Drawer, Descriptions, Popconfirm, Alert, Tooltip, message,
} from 'antd';
import {
  BankOutlined, ReloadOutlined, PlusOutlined, ScissorOutlined, PhoneOutlined,
  DeleteOutlined, EyeOutlined, FileExcelOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { refundAPI } from '../services/api';
import { exportTableToExcel } from '../utils/exportUtils';
import { formatDateForDisplay } from '../utils/dateUtils';

const { Title, Text } = Typography;

const inr = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtD = (v) => (v ? formatDateForDisplay(v) : '—');
const STAGE_COLOR = {
  Settled: 'success', 'Partially received': 'processing', Requested: 'blue', Pending: 'warning',
  'Follow-up overdue': 'error', Upcoming: 'purple', 'No advance': 'default',
};
const STAGES = ['Pending', 'Requested', 'Follow-up overdue', 'Partially received', 'Upcoming', 'Settled', 'No advance'];

const AdvanceRefunds = () => {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(false);
  const [stageFilter, setStageFilter] = useState(null);
  const [modal, setModal] = useState(null);       // { type, row }
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);     // { row, data }
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await refundAPI.getAll();
      setRows(res.data?.rows || []);
      setSummary(res.data?.summary || {});
    } catch {
      message.error('Failed to load refunds');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (row) => {
    try {
      const res = await refundAPI.getById(row.agreement_id);
      setDetail({ row, data: res.data });
    } catch {
      message.error('Failed to load refund details');
    }
  };

  const open = (type, row) => {
    form.resetFields();
    if (type === 'deductions') {
      form.setFieldsValue({
        due_back: row.due_back,
        electricity: row.deduction_breakdown?.electricity || 0,
        water: row.deduction_breakdown?.water || 0,
        other: row.deduction_breakdown?.other || (row.deductions - (row.deduction_breakdown?.electricity || 0) - (row.deduction_breakdown?.water || 0)) || 0,
      });
    }
    if (type === 'followup') {
      form.setFieldsValue({
        requested_date: row.requested_date ? dayjs(row.requested_date) : dayjs(),
        follow_up_date: row.follow_up_date ? dayjs(row.follow_up_date) : dayjs().add(7, 'day'),
        notes: row.notes,
      });
    }
    if (type === 'receipt') form.setFieldsValue({ amount: row.outstanding, received_date: dayjs(), payment_mode: 'Bank transfer' });
    setModal({ type, row });
  };

  const submit = async () => {
    let v;
    try { v = await form.validateFields(); } catch { return; }
    const { type, row } = modal;
    setSaving(true);
    try {
      if (type === 'deductions') await refundAPI.setDeductions(row.agreement_id, v);
      if (type === 'followup') {
        await refundAPI.setFollowUp(row.agreement_id, {
          requested_date: v.requested_date ? v.requested_date.format('YYYY-MM-DD') : null,
          follow_up_date: v.follow_up_date ? v.follow_up_date.format('YYYY-MM-DD') : null,
          notes: v.notes,
        });
      }
      if (type === 'receipt') {
        await refundAPI.addReceipt(row.agreement_id, { ...v, received_date: v.received_date.format('YYYY-MM-DD') });
      }
      message.success('Saved');
      setModal(null);
      await load();
      if (detail?.row?.agreement_id === row.agreement_id) openDetail(row);
    } catch (err) {
      message.error(err?.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const deleteReceipt = async (receiptId) => {
    try {
      await refundAPI.deleteReceipt(detail.row.agreement_id, receiptId);
      message.success('Receipt removed');
      await load();
      openDetail(detail.row);
    } catch (err) {
      message.error(err?.response?.data?.error || 'Delete failed');
    }
  };

  const shown = stageFilter ? rows.filter(r => r.stage === stageFilter) : rows;

  const doExport = () => {
    if (!shown.length) { message.warning('No data to export'); return; }
    exportTableToExcel(shown.map(r => ({
      Agreement: r.agreement_id, Residence: r.residence, Landlord: r.landlord, Unit: r.unit,
      'Vacate Date': r.vacate_date || '', Advance: r.advance, 'Due Back': r.due_back, Deductions: r.deductions,
      'Expected Refund': r.expected, Received: r.received, Outstanding: r.outstanding, Stage: r.stage,
      'Requested On': r.requested_date || '', 'Follow-up': r.follow_up_date || '', Notes: r.notes || '',
    })), 'Advance Refunds', `Advance_Refunds_${dayjs().format('YYYYMMDD')}.xlsx`);
  };

  const columns = [
    { title: 'Agreement', dataIndex: 'agreement_id', key: 'agreement_id', fixed: 'left', width: 140 },
    { title: 'Residence / Landlord', key: 'res', render: (_, r) => (
      <div>
        <div>{r.residence}</div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {r.landlord}{r.landlord_phone ? <> · <PhoneOutlined /> {r.landlord_phone}</> : ''}
        </Text>
      </div>
    ) },
    { title: 'Unit', dataIndex: 'unit', key: 'unit' },
    { title: 'Vacated', dataIndex: 'vacate_date', key: 'vacate_date', render: fmtD },
    { title: 'Due Back', dataIndex: 'due_back', key: 'due_back', render: inr },
    { title: 'Deductions', dataIndex: 'deductions', key: 'deductions', render: inr },
    { title: 'Expected', dataIndex: 'expected', key: 'expected', render: inr },
    { title: 'Received', dataIndex: 'received', key: 'received', render: v => <Text style={{ color: '#52c41a' }}>{inr(v)}</Text> },
    { title: 'Outstanding', dataIndex: 'outstanding', key: 'outstanding', defaultSortOrder: 'descend', sorter: (a, b) => a.outstanding - b.outstanding,
      render: v => <Text strong style={{ color: v > 0 ? '#f5222d' : '#52c41a' }}>{inr(v)}</Text> },
    { title: 'Stage', dataIndex: 'stage', key: 'stage', width: 150, render: v => <Tag color={STAGE_COLOR[v]}>{v}</Tag> },
    { title: 'Follow-up', dataIndex: 'follow_up_date', key: 'follow_up_date', render: fmtD },
    {
      title: 'Actions', key: 'actions', fixed: 'right', width: 170,
      render: (_, r) => (
        <Space size={0}>
          <Tooltip title="Details & receipts"><Button size="small" type="link" icon={<EyeOutlined />} onClick={() => openDetail(r)} /></Tooltip>
          <Tooltip title="Landlord deductions"><Button size="small" type="link" icon={<ScissorOutlined />} onClick={() => open('deductions', r)} disabled={r.stage === 'Settled'} /></Tooltip>
          <Tooltip title="Request / follow-up"><Button size="small" type="link" icon={<PhoneOutlined />} onClick={() => open('followup', r)} disabled={r.stage === 'Settled'} /></Tooltip>
          <Tooltip title="Record amount received"><Button size="small" type="link" icon={<PlusOutlined />} onClick={() => open('receipt', r)} disabled={r.outstanding <= 0} /></Tooltip>
        </Space>
      ),
    },
  ];

  const kpi = (label, value, color, sub) => (
    <Col xs={12} md={6} key={label}>
      <Card size="small" style={{ borderTop: `3px solid ${color}` }}>
        <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
        <div style={{ fontSize: 12, color: '#595959', fontWeight: 600 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: '#8c8c8c' }}>{sub}</div>}
      </Card>
    </Col>
  );

  const m = modal || {};

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}><BankOutlined style={{ color: '#E87103', marginRight: 8 }} />Advance Refunds</Title>
        <Space wrap>
          <Select allowClear placeholder="All stages" style={{ width: 180 }} value={stageFilter} onChange={setStageFilter}
            options={STAGES.map(s => ({ value: s, label: s }))} />
          <Button icon={<FileExcelOutlined style={{ color: '#52c41a' }} />} onClick={doExport}>Export</Button>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading} />
        </Space>
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {kpi('Outstanding', inr(summary.outstanding), summary.outstanding > 0 ? '#f5222d' : '#52c41a', `${summary.openCases || 0} vacated agreements open`)}
        {kpi('Received Back', inr(summary.received), '#52c41a', 'Sum of recorded receipts')}
        {kpi('Landlord Deductions', inr(summary.deductions), '#faad14', 'Electricity, water, other')}
        {kpi('Upcoming (Vacating)', inr(summary.upcoming), '#722ed1', 'Agreements scheduled to vacate')}
      </Row>

      <Alert type="info" showIcon style={{ marginBottom: 12 }}
        message="Process: record the landlord's deductions → mark the refund as requested with a follow-up date → record each amount received. A refund is settled automatically once receipts cover the expected amount." />

      <Card size="small">
        <Table size="small" rowKey="agreement_id" dataSource={shown} columns={columns} loading={loading} scroll={{ x: 1550 }}
          pagination={shown.length > 10 ? { pageSize: 10, size: 'small', showSizeChanger: true } : false} />
      </Card>

      <Modal
        open={!!modal}
        onCancel={() => setModal(null)}
        onOk={submit}
        confirmLoading={saving}
        destroyOnClose
        title={{ deductions: 'Landlord Deductions', followup: 'Refund Request & Follow-up', receipt: 'Record Amount Received' }[m.type] + (m.row ? ` — ${m.row.agreement_id}` : '')}
      >
        <Form form={form} layout="vertical">
          {m.type === 'deductions' && (
            <>
              <Form.Item name="due_back" label="Advance due back" rules={[{ required: true }]} extra={`Advance paid: ${inr(m.row?.advance)}`}>
                <InputNumber min={0} style={{ width: '100%' }} prefix="₹" />
              </Form.Item>
              <Row gutter={12}>
                <Col span={8}><Form.Item name="electricity" label="Electricity"><InputNumber min={0} style={{ width: '100%' }} prefix="₹" /></Form.Item></Col>
                <Col span={8}><Form.Item name="water" label="Water"><InputNumber min={0} style={{ width: '100%' }} prefix="₹" /></Form.Item></Col>
                <Col span={8}><Form.Item name="other" label="Other / maintenance"><InputNumber min={0} style={{ width: '100%' }} prefix="₹" /></Form.Item></Col>
              </Row>
              <Form.Item shouldUpdate noStyle>
                {() => {
                  const f = form.getFieldsValue();
                  const exp = (f.due_back || 0) - (f.electricity || 0) - (f.water || 0) - (f.other || 0);
                  return <Alert type={exp < 0 ? 'error' : 'success'} message={`Expected refund: ${inr(exp)}`} />;
                }}
              </Form.Item>
            </>
          )}
          {m.type === 'followup' && (
            <>
              <Row gutter={12}>
                <Col span={12}><Form.Item name="requested_date" label="Refund requested on"><DatePicker style={{ width: '100%' }} format="DD-MM-YYYY" /></Form.Item></Col>
                <Col span={12}><Form.Item name="follow_up_date" label="Next follow-up"><DatePicker style={{ width: '100%' }} format="DD-MM-YYYY" /></Form.Item></Col>
              </Row>
              <Form.Item name="notes" label="Notes (conversation with landlord)"><Input.TextArea rows={3} /></Form.Item>
            </>
          )}
          {m.type === 'receipt' && (
            <>
              <Form.Item name="amount" label="Amount received" rules={[{ required: true }]} extra={`Outstanding: ${inr(m.row?.outstanding)}`}>
                <InputNumber min={1} max={m.row?.outstanding} style={{ width: '100%' }} prefix="₹" />
              </Form.Item>
              <Row gutter={12}>
                <Col span={12}><Form.Item name="received_date" label="Received on" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD-MM-YYYY" /></Form.Item></Col>
                <Col span={12}>
                  <Form.Item name="payment_mode" label="Mode">
                    <Select options={['Bank transfer', 'Cheque', 'Cash', 'UPI', 'Adjusted against rent'].map(v => ({ value: v, label: v }))} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="reference_no" label="Reference (UTR / cheque no.)"><Input /></Form.Item>
              <Form.Item name="notes" label="Notes"><Input /></Form.Item>
            </>
          )}
        </Form>
      </Modal>

      <Drawer open={!!detail} onClose={() => setDetail(null)} width={640} title={detail ? `Refund — ${detail.row.agreement_id}` : ''}>
        {detail && (
          <>
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="Residence" span={2}>{detail.row.residence}</Descriptions.Item>
              <Descriptions.Item label="Landlord">{detail.row.landlord}</Descriptions.Item>
              <Descriptions.Item label="Phone">{detail.row.landlord_phone || '—'}</Descriptions.Item>
              <Descriptions.Item label="Last occupants" span={2}>{detail.row.occupants || '—'}</Descriptions.Item>
              <Descriptions.Item label="Due back">{inr(detail.data.position.dueBack)}</Descriptions.Item>
              <Descriptions.Item label="Deductions">{inr(detail.data.position.deductions)}</Descriptions.Item>
              <Descriptions.Item label="Expected">{inr(detail.data.position.expected)}</Descriptions.Item>
              <Descriptions.Item label="Received">{inr(detail.data.position.received)}</Descriptions.Item>
              <Descriptions.Item label="Outstanding"><Text strong>{inr(detail.data.position.outstanding)}</Text></Descriptions.Item>
              <Descriptions.Item label="Stage"><Tag color={STAGE_COLOR[detail.data.position.stage]}>{detail.data.position.stage}</Tag></Descriptions.Item>
              <Descriptions.Item label="Requested">{fmtD(detail.data.requested_date)}</Descriptions.Item>
              <Descriptions.Item label="Follow-up">{fmtD(detail.data.follow_up_date)}</Descriptions.Item>
              <Descriptions.Item label="Notes" span={2}>{detail.data.notes || '—'}</Descriptions.Item>
            </Descriptions>
            <Title level={5} style={{ marginTop: 16 }}>Receipts</Title>
            <Table size="small" rowKey="receipt_id" pagination={false} dataSource={detail.data.receipts}
              columns={[
                { title: 'Date', dataIndex: 'received_date', render: fmtD },
                { title: 'Amount', dataIndex: 'amount', render: inr },
                { title: 'Mode', dataIndex: 'payment_mode', render: v => v || '—' },
                { title: 'Reference', dataIndex: 'reference_no', render: v => v || '—' },
                { title: 'By', dataIndex: 'recorded_by', render: v => v || '—' },
                { title: '', key: 'del', render: (_, r) => (
                  <Popconfirm title="Remove this receipt?" onConfirm={() => deleteReceipt(r.receipt_id)}>
                    <Button size="small" type="link" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                ) },
              ]} />
          </>
        )}
      </Drawer>
    </div>
  );
};

export default AdvanceRefunds;
