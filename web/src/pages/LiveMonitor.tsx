import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Row, Col, Typography, Badge, Empty, Tabs, Statistic, Tag, Button, Tooltip } from 'antd';
import { ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { api, socket } from '../api';

const { Text } = Typography;

interface TagUpdate {
  tagId: number; tagName: string; connectionId: number;
  value: any; quality: string; timestamp: string;
  unit: string; dataType: string; groupName: string;
}

const COLORS = ['#1890ff', '#52c41a', '#fa8c16', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96'];

const LiveMonitor: React.FC = () => {
  const [tags, setTags] = useState<any[]>([]);
  const [liveValues, setLiveValues] = useState<Record<number, TagUpdate>>({});
  const [activeGroup, setActiveGroup] = useState<string>('all');
  const prevValues = useRef<Record<number, any>>({});

  const fetchTags = useCallback(async () => {
    try {
      const res = await api.get('/tags');
      setTags(res.data?.data || []);
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => { fetchTags(); }, [fetchTags]);

  useEffect(() => {
    const handler = (data: TagUpdate) => {
      setLiveValues(prev => ({ ...prev, [data.tagId]: data }));
    };
    socket.on('tagUpdate', handler);
    return () => { socket.off('tagUpdate', handler); };
  }, []);

  const groups = ['all', ...Array.from(new Set(tags.map(t => t.group_name).filter(Boolean)))];
  const filtered = activeGroup === 'all' ? tags : tags.filter(t => t.group_name === activeGroup);

  const formatValue = (tag: any, live: TagUpdate | undefined) => {
    if (!live) return '—';
    const val = live.value;
    if (val === null || val === undefined) return '—';
    const dt = (live.dataType || tag.data_type || '').toUpperCase();
    if (dt === 'BOOL' || dt === 'COIL' || dt === 'DISCRETE') {
      return val ? 'ON' : 'OFF';
    }
    if (typeof val === 'number') return val.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
    return String(val);
  };

  const getQualityColor = (q: string) => {
    if (q === 'good') return '#52c41a';
    if (q === 'bad') return '#f5222d';
    return '#faad14';
  };

  const isBoolType = (tag: any) => {
    const dt = (tag.data_type || '').toUpperCase();
    return ['BOOL', 'COIL', 'DISCRETE'].includes(dt);
  };

  const timeSince = (ts: string) => {
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (diff < 5) return 'az önce';
    if (diff < 60) return `${diff}sn önce`;
    return `${Math.floor(diff / 60)}dk önce`;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Badge status={socket.connected ? 'success' : 'error'} />
          <Text type="secondary">{socket.connected ? 'Canlı Bağlantı Aktif' : 'Bağlantı Yok'}</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={fetchTags}>Yenile</Button>
      </div>

      {tags.length === 0 ? (
        <Card style={{ borderRadius: 12, textAlign: 'center', padding: 40 }}>
          <Empty description="Henüz tag tanımlanmamış. Tag Yönetimi sayfasından tag ekleyin." />
        </Card>
      ) : (
        <>
          {groups.length > 1 && (
            <Tabs activeKey={activeGroup} onChange={setActiveGroup} size="small" style={{ marginBottom: 16 }}
              items={groups.map(g => ({ key: g, label: g === 'all' ? `Tümü (${tags.length})` : `${g} (${tags.filter(t => t.group_name === g).length})` }))}
            />
          )}

          <Row gutter={[12, 12]}>
            {filtered.map((tag, i) => {
              const live = liveValues[tag.id];
              const val = formatValue(tag, live);
              const isBool = isBoolType(tag);
              const boolVal = live?.value;
              const quality = live?.quality || 'uncertain';
              const color = COLORS[i % COLORS.length];
              const changed = prevValues.current[tag.id] !== undefined && prevValues.current[tag.id] !== live?.value;
              if (live?.value !== undefined) prevValues.current[tag.id] = live.value;

              return (
                <Col key={tag.id} xs={24} sm={12} md={8} lg={6}>
                  <Card size="small" style={{
                    borderRadius: 12, borderLeft: `4px solid ${color}`,
                    transition: 'all 0.3s', boxShadow: changed ? `0 0 8px ${color}40` : 'none',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Text strong style={{ fontSize: 13 }}>{tag.name}</Text>
                      <Tooltip title={`Kalite: ${quality}`}>
                        <Badge status={quality === 'good' ? 'success' : quality === 'bad' ? 'error' : 'warning'} />
                      </Tooltip>
                    </div>

                    {isBool ? (
                      <div style={{
                        background: boolVal ? '#52c41a' : '#d9d9d9', color: '#fff',
                        borderRadius: 8, padding: '8px 0', textAlign: 'center', fontSize: 18, fontWeight: 700,
                        transition: 'background 0.3s',
                      }}>
                        {boolVal ? 'ON' : 'OFF'}
                      </div>
                    ) : (
                      <Statistic value={val} suffix={tag.unit || ''} valueStyle={{ fontSize: 22, fontWeight: 600, color }} />
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                      <Text type="secondary" style={{ fontSize: 11 }}><code>{tag.address}</code></Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>{live?.timestamp ? timeSince(live.timestamp) : '—'}</Text>
                    </div>
                  </Card>
                </Col>
              );
            })}
          </Row>
        </>
      )}
    </div>
  );
};

export default LiveMonitor;
