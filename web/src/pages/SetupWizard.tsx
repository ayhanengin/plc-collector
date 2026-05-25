import React, { useState, useEffect } from 'react';
import { Steps, Button, Form, Input, InputNumber, Select, Result, Space, message, Card } from 'antd';
import { DatabaseOutlined, ApiOutlined, TagsOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useNavigate } from 'react-router-dom';

const SetupWizard: React.FC = () => {
  const [current, setCurrent] = useState(0);
  const [dbForm] = Form.useForm();
  const [plcForm] = Form.useForm();
  const [tagForm] = Form.useForm();
  const [protocols, setProtocols] = useState<any[]>([]);
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/connections/protocols').then(r => setProtocols(r.data?.data || [])).catch(() => {});
    api.get('/setup/status').then(r => {
      if (r.data?.data?.setupComplete) setCurrent(3);
    }).catch(() => {});
  }, []);

  const testDb = async () => {
    const values = dbForm.getFieldsValue();
    setLoading(true);
    try {
      const res = await api.post('/setup/test-db', values);
      if (res.data.success) message.success('Veritabanı bağlantısı başarılı ✅');
      else message.error('Bağlantı başarısız ❌');
    } catch (err) { message.error('Bağlantı testi başarısız'); }
    setLoading(false);
  };

  const initDb = async () => {
    setLoading(true);
    try {
      const res = await api.post('/setup/init-db');
      if (res.data.success) { message.success('Tablolar oluşturuldu ✅'); setCurrent(1); }
      else message.error('Tablo oluşturma başarısız');
    } catch (err) { message.error('Hata oluştu'); }
    setLoading(false);
  };

  const savePlc = async (values: any) => {
    setLoading(true);
    try {
      await api.post('/connections', values);
      message.success('PLC bağlantısı oluşturuldu ✅');
      const res = await api.get('/connections');
      setConnections(res.data?.data || []);
      setCurrent(2);
    } catch (err: any) { message.error(err.response?.data?.message || 'Hata'); }
    setLoading(false);
  };

  const saveTag = async (values: any) => {
    setLoading(true);
    try {
      await api.post('/tags', values);
      message.success('Tag oluşturuldu ✅');
      setCurrent(3);
    } catch (err: any) { message.error(err.response?.data?.message || 'Hata'); }
    setLoading(false);
  };

  const steps = [
    { title: 'Veritabanı', icon: <DatabaseOutlined /> },
    { title: 'PLC Bağlantısı', icon: <ApiOutlined /> },
    { title: 'İlk Tag', icon: <TagsOutlined /> },
    { title: 'Tamamlandı', icon: <CheckCircleOutlined /> },
  ];

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <Card style={{ borderRadius: 12 }}>
        <Steps current={current} items={steps} style={{ marginBottom: 32 }} />

        {current === 0 && (
          <Form form={dbForm} layout="vertical" initialValues={{ host: 'localhost', port: 5432, user: 'postgres', password: 'postgres', database: 'plc_collector' }}>
            <Form.Item name="host" label="Host"><Input /></Form.Item>
            <Form.Item name="port" label="Port"><InputNumber style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="user" label="Kullanıcı"><Input /></Form.Item>
            <Form.Item name="password" label="Şifre"><Input.Password /></Form.Item>
            <Form.Item name="database" label="Veritabanı Adı"><Input /></Form.Item>
            <Space>
              <Button onClick={testDb} loading={loading}>🔍 Bağlantıyı Test Et</Button>
              <Button type="primary" onClick={initDb} loading={loading}>Tabloları Oluştur ve İlerle</Button>
            </Space>
          </Form>
        )}

        {current === 1 && (
          <Form form={plcForm} layout="vertical" onFinish={savePlc} initialValues={{ protocol: 's7', port: 102, rack: 0, slot: 1, auto_connect: true }}>
            <Form.Item name="protocol" label="Protokol" rules={[{ required: true }]}>
              <Select onChange={(v) => { const p = protocols.find((x: any) => x.id === v); if (p) plcForm.setFieldValue('port', p.defaultPort); }}>
                {protocols.map((p: any) => <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="name" label="Bağlantı Adı" rules={[{ required: true }]}><Input placeholder="Orego PLC-1" /></Form.Item>
            <Form.Item name="ip" label="IP Adresi" rules={[{ required: true }]}><Input placeholder="192.168.1.50" /></Form.Item>
            <Form.Item name="port" label="Port"><InputNumber style={{ width: '100%' }} /></Form.Item>
            <Space>
              <Button onClick={() => setCurrent(0)}>Geri</Button>
              <Button type="primary" htmlType="submit" loading={loading}>Oluştur ve İlerle</Button>
            </Space>
          </Form>
        )}

        {current === 2 && (
          <Form form={tagForm} layout="vertical" onFinish={saveTag} initialValues={{ data_type: 'REAL', polling_interval_ms: 1000 }}>
            <Form.Item name="connection_id" label="PLC Bağlantısı" rules={[{ required: true }]}>
              <Select>{connections.map((c: any) => <Select.Option key={c.id} value={c.id}>{c.name}</Select.Option>)}</Select>
            </Form.Item>
            <Form.Item name="name" label="Tag Adı" rules={[{ required: true }]}><Input placeholder="Sicaklik_1" /></Form.Item>
            <Form.Item name="address" label="Adres" rules={[{ required: true }]}><Input placeholder="DB1,REAL0" /></Form.Item>
            <Form.Item name="data_type" label="Veri Tipi">
              <Select>{['BOOL', 'INT', 'DINT', 'REAL'].map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}</Select>
            </Form.Item>
            <Form.Item name="unit" label="Birim"><Input placeholder="°C" /></Form.Item>
            <Space>
              <Button onClick={() => setCurrent(1)}>Geri</Button>
              <Button type="primary" htmlType="submit" loading={loading}>Oluştur ve Tamamla</Button>
            </Space>
          </Form>
        )}

        {current === 3 && (
          <Result status="success" title="Kurulum Tamamlandı! 🎉" subTitle="PLC Data Collector kullanıma hazır."
            extra={[
              <Button type="primary" key="dash" onClick={() => navigate('/')}>Canlı İzleme'ye Git</Button>,
              <Button key="conn" onClick={() => navigate('/connections')}>PLC Bağlantıları</Button>,
            ]}
          />
        )}
      </Card>
    </div>
  );
};

export default SetupWizard;
