import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Modal, Form, Input, Select, InputNumber, Switch, Row, Col, Badge, Tag, Space, message, Popconfirm, Empty } from 'antd';
import { PlusOutlined, ApiOutlined, DisconnectOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { api } from '../api';

interface PlcConnection {
  id: number; name: string; protocol: string; ip: string; port: number;
  rack?: number; slot?: number; unit_id?: number; auto_connect: boolean; connected: boolean;
}
interface Protocol {
  id: string; name: string; defaultPort: number; fields: string[]; addressHelp: string;
}

const Connections: React.FC = () => {
  const [connections, setConnections] = useState<PlcConnection[]>([]);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const selectedProtocol = Form.useWatch('protocol', form);

  const fetchData = useCallback(async () => {
    try {
      const [connRes, protoRes] = await Promise.all([
        api.get('/connections'), api.get('/connections/protocols'),
      ]);
      setConnections(connRes.data?.data || []);
      setProtocols(protoRes.data?.data || []);
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async (values: any) => {
    setLoading(true);
    try {
      if (editId) {
        await api.put(`/connections/${editId}`, values);
        message.success('Bağlantı güncellendi');
      } else {
        await api.post('/connections', values);
        message.success('Bağlantı oluşturuldu');
      }
      setModalOpen(false); form.resetFields(); setEditId(null); fetchData();
    } catch (err: any) { message.error(err.response?.data?.message || 'Hata oluştu'); }
    setLoading(false);
  };

  const handleConnect = async (id: number) => {
    try {
      await api.post(`/connections/${id}/connect`);
      message.success('Bağlantı kuruldu');
      fetchData();
    } catch (err: any) { message.error('Bağlantı kurulamadı: ' + (err.response?.data?.message || '')); }
  };

  const handleDisconnect = async (id: number) => {
    try {
      await api.post(`/connections/${id}/disconnect`);
      message.info('Bağlantı kesildi');
      fetchData();
    } catch (err: any) { message.error(err.response?.data?.message || 'Hata'); }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/connections/${id}`);
      message.success('Silindi');
      fetchData();
    } catch (err: any) { message.error(err.response?.data?.message || 'Hata'); }
  };

  const handleTest = async () => {
    const values = form.getFieldsValue();
    try {
      const res = await api.post('/connections/test', values);
      if (res.data.success) message.success('Bağlantı testi başarılı ✅');
      else message.error('Bağlantı testi başarısız ❌');
    } catch (err) { message.error('Test başarısız'); }
  };

  const openEdit = (conn: PlcConnection) => {
    setEditId(conn.id);
    form.setFieldsValue(conn);
    setModalOpen(true);
  };

  const protocolFields = protocols.find(p => p.id === selectedProtocol)?.fields || [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>PLC Bağlantıları</h3>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditId(null); form.resetFields(); setModalOpen(true); }}>
          Yeni Bağlantı
        </Button>
      </div>

      {connections.length === 0 ? (
        <Card style={{ borderRadius: 12 }}>
          <Empty description="Henüz PLC bağlantısı tanımlanmamış" />
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {connections.map((c) => (
            <Col key={c.id} xs={24} sm={12} lg={8}>
              <Card
                size="small"
                style={{ borderRadius: 12, borderLeft: `4px solid ${c.connected ? '#52c41a' : '#d9d9d9'}` }}
                title={<Space><Badge status={c.connected ? 'success' : 'default'} />{c.name}</Space>}
                extra={<Tag color={c.protocol === 's7' ? 'blue' : 'green'}>{c.protocol.toUpperCase()}</Tag>}
                actions={[
                  c.connected
                    ? <DisconnectOutlined key="disc" onClick={() => handleDisconnect(c.id)} title="Bağlantıyı Kes" />
                    : <ApiOutlined key="conn" onClick={() => handleConnect(c.id)} title="Bağlan" />,
                  <EditOutlined key="edit" onClick={() => openEdit(c)} />,
                  <Popconfirm title="Silmek istediğinize emin misiniz?" onConfirm={() => handleDelete(c.id)}>
                    <DeleteOutlined key="del" />
                  </Popconfirm>,
                ]}
              >
                <p style={{ margin: '4px 0' }}><strong>IP:</strong> {c.ip}:{c.port}</p>
                {c.rack !== null && <p style={{ margin: '4px 0' }}><strong>Rack/Slot:</strong> {c.rack}/{c.slot}</p>}
                {c.unit_id !== null && c.protocol === 'modbus' && <p style={{ margin: '4px 0' }}><strong>Unit ID:</strong> {c.unit_id}</p>}
                <p style={{ margin: '4px 0' }}>
                  {c.connected ? <Tag icon={<CheckCircleOutlined />} color="success">Bağlı</Tag> : <Tag icon={<CloseCircleOutlined />} color="default">Bağlı Değil</Tag>}
                </p>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Modal
        title={editId ? 'Bağlantıyı Düzenle' : 'Yeni PLC Bağlantısı'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditId(null); form.resetFields(); }}
        footer={null}
        width={500}
      >
        <Form form={form} layout="vertical" onFinish={handleSave} initialValues={{ protocol: 's7', port: 102, rack: 0, slot: 1, unit_id: 1, auto_connect: true }}>
          <Form.Item name="protocol" label="Protokol" rules={[{ required: true }]}>
            <Select onChange={(v) => {
              const proto = protocols.find(p => p.id === v);
              if (proto) form.setFieldValue('port', proto.defaultPort);
            }}>
              {protocols.map(p => <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="name" label="Bağlantı Adı" rules={[{ required: true }]}>
            <Input placeholder="Örn: Orego Extruder-1" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item name="ip" label="IP Adresi" rules={[{ required: true }]}>
                <Input placeholder="192.168.1.50" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="port" label="Port" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          {protocolFields.includes('rack') && (
            <Row gutter={16}>
              <Col span={12}><Form.Item name="rack" label="Rack"><InputNumber style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={12}><Form.Item name="slot" label="Slot"><InputNumber style={{ width: '100%' }} /></Form.Item></Col>
            </Row>
          )}
          {protocolFields.includes('unitId') && (
            <Form.Item name="unit_id" label="Unit ID"><InputNumber style={{ width: '100%' }} /></Form.Item>
          )}
          <Form.Item name="auto_connect" label="Otomatik Bağlan" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={handleTest}>🔍 Bağlantıyı Test Et</Button>
            <Button type="primary" htmlType="submit" loading={loading}>{editId ? 'Güncelle' : 'Oluştur'}</Button>
          </Space>
        </Form>
      </Modal>
    </div>
  );
};

export default Connections;
