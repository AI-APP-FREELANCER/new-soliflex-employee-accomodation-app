/**
 * Attrition & Retention Analytics
 * Tracks employee resignations, retention actions, and attrition trends.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Row, Col, Statistic, Table, Tag, Typography, Space, DatePicker,
  Select, Button, Spin, Alert, Tabs, Divider,
} from 'antd';
import {
  ReloadOutlined, FileExcelOutlined, TeamOutlined, RiseOutlined, FallOutlined,
  UserDeleteOutlined, UserSwitchOutlined,
} from '@ant-design/icons';
import { Column } from '@ant-design/charts';
import { analyticsAPI, employeeAPI } from '../services/api';
import { exportTableToExcel } from '../utils/exportUtils';
import { formatDateForDisplay } from '../utils/dateUtils';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

const fmtD = (v) => (!v || v === '—' ? '—' : formatDateForDisplay(v));

// ── KPI Card ─────────────────────────────────────────────────────────────────
const KCard = ({ title, value, suffix, color, sub, icon }) => (
  <Card size="small" style={{ borderTop: `3px solid ${color}`, height: '100%' }} bodyStyle={{ padding: '12px 16px' }}>
    <Space size={8}>
      {icon && <span style={{ color, fontSize: 20 }}>{icon}</span>}
      <div>
        <div style={{ fontSize: 12, color: '#595959' }}>{title}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color }}>
          {value}{suffix && <span style={{ fontSize: 14, fontWeight: 400, marginLeft: 2 }}>{suffix}</span>}
        </div>
        {sub && <div style={{ fontSize: 11, color: '#8c8c8c' }}>{sub}</div>}
      </div>
    </Space>
  </Card>
);

const RETENTION_COLORS = {
  RETAINED:     'success',
  NOT_RETAINED: 'error',
  IN_DISCUSSION:'warning',
  'N/A':        'default',
};

const Attrition = () => {
  const [loading, setLoading]         = useState(false);
  const [data, setData]               = useState(null);
  const [departments, setDepartments] = useState([]);
  const [filters, setFilters]         = useState({ dateRange: null, department: null });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.dateRange?.[0]) params.dateFrom = filters.dateRange[0].format('YYYY-MM-DD');
      if (filters.dateRange?.[1]) params.dateTo   = filters.dateRange[1].format('YYYY-MM-DD');
      if (filters.department)     params.department = filters.department;
      const res = await analyticsAPI.getAttrition(params);
      setData(res.data);
    } catch {
      // error handled via empty state
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    employeeAPI.getAll('all').then(r => {
      const depts = [...new Set((r.data || []).map(e => e.employee_department).filter(Boolean))].sort();
      setDepartments(depts);
    }).catch(() => {});
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const summary   = data?.summary   || {};
  const monthly   = data?.monthly   || [];
  const byDept    = data?.byDepartment || [];
  const byReason  = data?.byReason  || [];
  const employees = data?.employees || [];

  const monthlyChartData = monthly.map(m => [
    { month: m.month, type: 'Resigned', count: m.resigned },
    { month: m.month, type: 'Retained', count: m.retained },
  ]).flat();

  const exportAttrition = () => {
    exportTableToExcel(employees.map(e => ({
      'Employee ID':         e.employee_id,
      Name:                  e.name,
      Department:            e.department,
      Designation:           e.designation,
      'Date of Joining':     fmtD(e.date_of_joining),
      'Date of Resignation': fmtD(e.date_of_resignation),
      'Last Working Date':   fmtD(e.last_working_date),
      'Resignation Reason':  e.resignation_reason || '—',
      'Retention Status':    e.retention_status || 'N/A',
      'Retention Date':      fmtD(e.retention_date),
      'Retention Reason':    e.retention_reason || '—',
    })), 'Attrition Report', `Attrition_Report_${dayjs().format('YYYY-MM-DD')}.xlsx`);
  };

  const empColumns = [
    { title: 'Employee ID',   dataIndex: 'employee_id',         key: 'employee_id', width: 110 },
    { title: 'Name',          dataIndex: 'name',                key: 'name' },
    { title: 'Department',    dataIndex: 'department',          key: 'department', render: v => v || '—' },
    { title: 'Designation',   dataIndex: 'designation',         key: 'designation', ellipsis: true },
    { title: 'Resignation Date', dataIndex: 'date_of_resignation', key: 'dor', render: fmtD, sorter: (a,b) => (a.date_of_resignation||'').localeCompare(b.date_of_resignation||'') },
    { title: 'LWD',           dataIndex: 'last_working_date',   key: 'lwd', render: fmtD },
    { title: 'Reason',        dataIndex: 'resignation_reason',  key: 'reason', render: v => v || '—', ellipsis: true },
    {
      title: 'Retention',
      dataIndex: 'retention_status',
      key: 'retention',
      render: v => <Tag color={RETENTION_COLORS[v] || 'default'}>{v || 'N/A'}</Tag>,
      filters: [
        { text: 'Retained',      value: 'RETAINED' },
        { text: 'Not Retained',  value: 'NOT_RETAINED' },
        { text: 'In Discussion', value: 'IN_DISCUSSION' },
        { text: 'N/A',           value: 'N/A' },
      ],
      onFilter: (val, rec) => (rec.retention_status || 'N/A') === val,
    },
    { title: 'Retention Date', dataIndex: 'retention_date', key: 'rdate', render: fmtD },
  ];

  const deptCols = [
    { title: 'Department', dataIndex: 'department', key: 'department' },
    { title: 'Resigned',   dataIndex: 'resigned',   key: 'resigned', sorter: (a,b) => a.resigned - b.resigned },
    { title: 'Retained',   dataIndex: 'retained',   key: 'retained', sorter: (a,b) => a.retained - b.retained },
    { title: 'Attrition %', key: 'pct', render: (_,r) => {
      const pct = r.resigned > 0 ? ((r.resigned - r.retained)/r.resigned*100).toFixed(1) : '0.0';
      return <Tag color={parseFloat(pct) > 20 ? 'error' : parseFloat(pct) > 10 ? 'warning' : 'success'}>{pct}%</Tag>;
    }},
  ];

  const reasonCols = [
    { title: 'Resignation Reason', dataIndex: 'reason', key: 'reason' },
    { title: 'Count', dataIndex: 'count', key: 'count', sorter: (a,b) => a.count - b.count },
    { title: '% of Total', key: 'pct', render: (_,r) => {
      const total = byReason.reduce((s,x) => s+x.count, 0);
      return total > 0 ? `${((r.count/total)*100).toFixed(1)}%` : '—';
    }},
  ];

  return (
    <div style={{ paddingBottom: 48 }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Attrition & Retention Analytics</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>Employee resignation and retention tracking</Text>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading} size="small">Refresh</Button>
          <Button icon={<FileExcelOutlined style={{ color: '#52c41a' }} />} onClick={exportAttrition} size="small">Export</Button>
        </Space>
      </div>

      {/* ── Filters ── */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Text style={{ fontWeight: 500 }}>Filters:</Text>
          <RangePicker
            size="small"
            format="DD-MM-YYYY"
            value={filters.dateRange}
            onChange={v => setFilters(f => ({ ...f, dateRange: v }))}
            placeholder={['Resignation From', 'Resignation To']}
          />
          <Select
            size="small"
            allowClear
            placeholder="All Departments"
            style={{ width: 180 }}
            value={filters.department}
            onChange={v => setFilters(f => ({ ...f, department: v || null }))}
          >
            {departments.map(d => <Option key={d} value={d}>{d}</Option>)}
          </Select>
          <Button size="small" onClick={() => setFilters({ dateRange: null, department: null })}>Clear</Button>
        </Space>
      </Card>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" tip="Loading attrition data…" /></div>
      ) : (
        <>
          {/* ── KPI Row ── */}
          <Row gutter={[10, 10]} style={{ marginBottom: 20 }}>
            <Col xs={12} sm={8} md={4}>
              <KCard title="Total Resigned" value={summary.totalResigned || 0} color="#f5222d"
                icon={<UserDeleteOutlined />} sub="In selected period" />
            </Col>
            <Col xs={12} sm={8} md={4}>
              <KCard title="Retained" value={summary.totalRetained || 0} color="#52c41a"
                icon={<UserSwitchOutlined />} sub="Successfully retained" />
            </Col>
            <Col xs={12} sm={8} md={4}>
              <KCard title="Attrition Rate" value={summary.attritionRate || 0} suffix="%" color="#E87103"
                icon={<FallOutlined />} sub="Resigned / (Active + Resigned)" />
            </Col>
            <Col xs={12} sm={8} md={4}>
              <KCard title="Retention Rate" value={summary.retentionRate || 0} suffix="%" color="#1890ff"
                icon={<RiseOutlined />} sub="Of those who resigned" />
            </Col>
            <Col xs={12} sm={8} md={4}>
              <KCard title="Active Employees" value={summary.activeEmployees || 0} color="#262626"
                icon={<TeamOutlined />} sub="Currently active" />
            </Col>
            <Col xs={12} sm={8} md={4}>
              <KCard title="Not Retained" value={(summary.totalResigned || 0) - (summary.totalRetained || 0)}
                color="#f5222d" sub="Left the organization" />
            </Col>
          </Row>

          <Tabs type="card" size="small" items={[
            {
              key: 'monthly',
              label: <span><RiseOutlined /> Monthly Trend</span>,
              children: (
                <div>
                  {monthly.length === 0 ? (
                    <Alert type="info" message="No resignation data in the selected period." showIcon />
                  ) : (
                    <Card size="small">
                      <Column
                        data={monthlyChartData}
                        xField="month"
                        yField="count"
                        seriesField="type"
                        isGroup
                        columnWidthRatio={0.5}
                        color={['#f5222d', '#52c41a']}
                        label={{ position: 'top', style: { fill: '#262626', fontSize: 11, fontWeight: 700 } }}
                        yAxis={{ min: 0 }}
                        meta={{ count: { min: 0 } }}
                        height={320}
                        tooltip={{ formatter: (d) => ({ name: d.type, value: d.count }) }}
                      />
                    </Card>
                  )}
                </div>
              ),
            },
            {
              key: 'department',
              label: <span><TeamOutlined /> By Department</span>,
              children: (
                <Table
                  dataSource={byDept}
                  columns={deptCols}
                  rowKey="department"
                  size="small"
                  pagination={{ pageSize: 20 }}
                />
              ),
            },
            {
              key: 'reasons',
              label: <span>By Reason</span>,
              children: (
                <Table
                  dataSource={byReason}
                  columns={reasonCols}
                  rowKey="reason"
                  size="small"
                  pagination={false}
                />
              ),
            },
            {
              key: 'employees',
              label: <span><UserDeleteOutlined /> Employee Register</span>,
              children: (
                <Table
                  dataSource={employees}
                  columns={empColumns}
                  rowKey="employee_id"
                  size="small"
                  pagination={{ pageSize: 20 }}
                  scroll={{ x: true }}
                />
              ),
            },
          ]} />
        </>
      )}
    </div>
  );
};

export default Attrition;
