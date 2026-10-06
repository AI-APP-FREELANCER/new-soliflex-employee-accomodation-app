/**
 * AlertsBell — header bell showing live alerts (renewals, vacates, allocation issues,
 * refunds). Alerts come from the server; a user can hide an alert on this browser,
 * and it comes back automatically if the underlying issue changes.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Badge, Button, Drawer, List, Tag, Space, Typography, Segmented, Empty, Tooltip } from 'antd';
import { BellOutlined, CloseOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { alertAPI } from '../services/api';

const { Text } = Typography;
const STORAGE_KEY = 'sqm.dismissedAlerts';
const SEV_COLOR = { high: 'red', medium: 'orange', low: 'blue' };
const SEV_LABEL = { high: 'Urgent', medium: 'Soon', low: 'Info' };
const REFRESH_MS = 5 * 60 * 1000;

const readDismissed = () => {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); } catch { return new Set(); }
};
const writeDismissed = (set) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...set])); } catch { /* storage unavailable */ }
};

const AlertsBell = ({ compact }) => {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [dismissed, setDismissed] = useState(readDismissed);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await alertAPI.getAll();
      const list = res.data?.alerts || [];
      setAlerts(list);
      // Forget dismissals for alerts that no longer exist.
      setDismissed(prev => {
        const live = new Set(list.map(a => a.id));
        const next = new Set([...prev].filter(id => live.has(id)));
        writeDismissed(next);
        return next;
      });
    } catch {
      /* keep the last list; the bell is non-critical */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const visible = alerts.filter(a => !dismissed.has(a.id));
  const urgentCount = visible.filter(a => a.severity !== 'low').length;
  const shown = visible.filter(a => filter === 'all' || a.severity === filter);

  const dismiss = (id) => {
    setDismissed(prev => {
      const next = new Set(prev); next.add(id); writeDismissed(next); return next;
    });
  };
  const restoreAll = () => { setDismissed(new Set()); writeDismissed(new Set()); };

  const go = (a) => {
    if (a.link) { setOpen(false); navigate(a.link); }
  };

  return (
    <>
      <Tooltip title="Alerts">
        <Badge count={urgentCount} overflowCount={99} size="small">
          <Button type="text" icon={<BellOutlined style={{ fontSize: 18 }} />} onClick={() => { setOpen(true); load(); }}
            size={compact ? 'small' : 'middle'} />
        </Badge>
      </Tooltip>
      <Drawer
        title={<Space>Alerts <Text type="secondary" style={{ fontSize: 12 }}>{visible.length} open</Text></Space>}
        open={open}
        onClose={() => setOpen(false)}
        width={compact ? '100%' : 460}
        extra={<Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={load} />}
      >
        <Segmented
          block
          value={filter}
          onChange={setFilter}
          style={{ marginBottom: 12 }}
          options={[
            { value: 'all', label: `All (${visible.length})` },
            { value: 'high', label: `Urgent (${visible.filter(a => a.severity === 'high').length})` },
            { value: 'medium', label: `Soon (${visible.filter(a => a.severity === 'medium').length})` },
            { value: 'low', label: `Info (${visible.filter(a => a.severity === 'low').length})` },
          ]}
        />
        {shown.length === 0 ? <Empty description="Nothing needs attention" /> : (
          <List
            dataSource={shown}
            renderItem={(a) => (
              <List.Item
                style={{ cursor: a.link ? 'pointer' : 'default', alignItems: 'flex-start' }}
                onClick={() => go(a)}
                actions={[
                  <Tooltip title="Hide on this browser" key="hide">
                    <Button size="small" type="text" icon={<CloseOutlined />} onClick={(e) => { e.stopPropagation(); dismiss(a.id); }} />
                  </Tooltip>,
                ]}
              >
                <List.Item.Meta
                  title={<Space size={4} wrap><Tag color={SEV_COLOR[a.severity]}>{SEV_LABEL[a.severity]}</Tag><Tag>{a.category}</Tag><span style={{ fontSize: 13 }}>{a.title}</span></Space>}
                  description={<span style={{ fontSize: 12 }}>{a.detail}</span>}
                />
              </List.Item>
            )}
          />
        )}
        {dismissed.size > 0 && (
          <Button type="link" size="small" onClick={restoreAll} style={{ marginTop: 8 }}>Show {dismissed.size} hidden alert(s)</Button>
        )}
      </Drawer>
    </>
  );
};

export default AlertsBell;
