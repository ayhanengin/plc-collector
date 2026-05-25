import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, Select, InputNumber, Switch, Tag, Space, message, Popconfirm } from 'antd';
import { PlusOutlined, ReadOutlined } from '@ant-design/icons';
import { api } from '../api';

interface TagDef {
  id: number; connection_id: number; name: string; address: string; data_type: string;
  group_name: string; unit: string; description: string; min_value: number; max_value: number;
  polling_interval_ms: number; log_enabled: boolean; log_mode: string; deadband_value: number;
  connection_name?: string; protocol?: string;
}

const TagBrowser: React.FC = () => {
  const [tags, setTags] = useState<TagDef[]>([]);
  const [connections, setConnections] = useState<any[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterConn, setFilterConn] = useState<number | null>(null);
  const [form] = Form.useForm();
  const logEnabled = Form.useWatch('log_enabled', form);
  const logMode = Form.useWatch('log_mode', form);

  const fetchData = useCallback(async () => {
    try {
      const params = filterConn ? { connectionId: filterConn } : {};
      const [tagRes, connRes, groupRes] = await Promise.all([
        api.get('/tags', { params }), api.get('/connections'), api.get('/tags/groups'),
      ]);
      setTags(tagRes.data?.data || []);
      setConnections(connRes.data?.data || []);
      setGroups(groupRes.data?.data || []);
    } catch (err) { console.error(err); }
  }, [filterConn]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async (values: any) => {
    setLoading(true);
    try {
      if (editId) {
        await api.put(`/tags/${editId}`, values);
        message.success('Tag güncellendi');
      } else {
        await api.post('/tags', values);
        message.success('Tag oluşturuldu');
      }
      setModalOpen(false); form.resetFields(); setEditId(null); fetchData();
    } catch (err: any) { message.error(err.response?.data?.message || 'Hata'); }
    setLoading(false);
  };

  const handleRead = async (tagId: number) => {
    try {
      const res = await api.post(`/tags/${tagId}/read`);
      const v = res.data?.data?.value;
      if (v) message.info(`Değer: ${v.value} (${v.quality})`, 3);
      else message.warning('Okunamadı — PLC bağlı mı?');
    } catch (err) { message.error('Okuma başarısız'); }
  };

  const handleDelete = async (id: number) => {
    try { await api.delete(`/tags/${id}`); message.success('Silindi'); fetchData(); }
    catch (err) { message.error('Silinemedi'); }
  };

  const columns = [
    { title: 'Tag Adı', dataIndex: 'name', key: 'name', render: (v: string) => <strong>{v}</strong> },
    { title: 'Adres', dataIndex: 'address', key: 'address', render: (v: string) => <code>{v}</code> },
    { title: 'Tip', dataIndex: 'data_type', key: 'data_type', render: (v: string) => <Tag>{v}</Tag> },
    { title: 'Grup', dataIndex: 'group_name', key: 'group_name', render: (v: string) => v ? <Tag color="blue">{v}</Tag> : '-' },
    { title: 'Birim', dataIndex: 'unit', key: 'unit' },
    { title: 'Bağlantı', dataIndex: 'connection_name', key: 'connection_name', render: (v: string, r: TagDef) => <Tag color={r.protocol === 's7' ? 'blue' : 'green'}>{v || `#${r.connection_id}`}</Tag> },
    { title: 'Polling', dataIndex: 'polling_interval_ms', key: 'poll', render: (v: number) => `${v}ms` },
    { title: 'Kayıt', dataIndex: 'log_enabled', key: 'log', render: (v: boolean) => v ? <Tag color="green">Aktif</Tag> : <Tag>Kapalı</Tag> },
    {
      title: 'İşlem', key: 'actions', width: 150,
      render: (_: any, r: TagDef) => (
        <Space>
          <Button size="small" icon={<ReadOutlined />} onClick={() => handleRead(r.id)}>Oku</Button>
          <Button size="small" onClick={() => { setEditId(r.id); form.setFieldsValue(r); setModalOpen(true); }}>Düzenle</Button>
          <Popconfirm title="Silmek istediğinize emin misiniz?" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger>Sil</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Space>
          <Select allowClear placeholder="Bağlantı Filtrele" style={{ width: 200 }} onChange={(v) => setFilterConn(v || null)}>
            {connections.map((c: any) => <Select.Option key={c.id} value={c.id}>{c.name}</Select.Option>)}
          </Select>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditId(null); form.resetFields(); setModalOpen(true); }}>
          Yeni Tag Ekle
        </Button>
      </div>

      <Table dataSource={tags} columns={columns} rowKey="id" size="small" pagination={{ pageSize: 20 }}
        style={{ background: '#fff', borderRadius: 12 }} />

      <Modal title={editId ? 'Tag Düzenle' : 'Yeni Tag Ekle'} open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditId(null); form.resetFields(); }} footer={null} width={550}>
        <Form form={form} layout="vertical" onFinish={handleSave}
          initialValues={{ data_type: 'REAL', polling_interval_ms: 1000, log_enabled: false, log_mode: 'polling' }}>
          <Form.Item name="connection_id" label="PLC Bağlantısı" rules={[{ required: true }]}>
            <Select placeholder="Bağlantı seçin">
              {connections.map((c: any) => <Select.Option key={c.id} value={c.id}>{c.name} ({c.protocol.toUpperCase()})</Select.Option>)}
            </Select>
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="Tag Adı" rules={[{ required: true }]}>
                <Input placeholder="Motor_Hiz" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="address" label="Adres" rules={[{ required: true }]}>
                <Input placeholder="DB1,REAL0 veya 40001" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="data_type" label="Veri Tipi" rules={[{ required: true }]}>
                <Select>
                  {['BOOL', 'INT', 'DINT', 'REAL', 'WORD', 'DWORD', 'STRING'].map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="group_name" label="Grup">
                <Select allowClear showSearch placeholder="Grup seçin/yazın" options={groups.map(g => ({ value: g, label: g }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="unit" label="Birim">
                <Input placeholder="°C, rpm, bar" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="min_value" label="Min Değer"><InputNumber style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="max_value" label="Max Değer"><InputNumber style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="polling_interval_ms" label="Polling (ms)"><InputNumber style={{ width: '100%' }} min={100} /></Form.Item></Col>
          </Row>
          <Form.Item name="log_enabled" label="Veritabanına Kayıt" valuePropName="checked"><Switch /></Form.Item>
          {logEnabled && (
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="log_mode" label="Kayıt Modu">
                  <Select>
                    <Select.Option value="polling">Her Okumada</Select.Option>
                    <Select.Option value="on_change">Değişiklikte</Select.Option>
                    <Select.Option value="deadband">Deadband</Select.Option>
                  </Select>
                </Form.Item>
              </Col>
              {logMode === 'deadband' && (
                <Col span={12}>
                  <Form.Item name="deadband_value" label="Deadband Değeri"><InputNumber style={{ width: '100%' }} /></Form.Item>
                </Col>
              )}
            </Row>
          )}
          <Form.Item name="description" label="Açıklama"><Input.TextArea rows={2} /></Form.Item>
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button type="primary" htmlType="submit" loading={loading}>{editId ? 'Güncelle' : 'Ekle'}</Button>
          </Space>
        </Form>
      </Modal>
    </div>
  );
};

export default TagBrowser;
