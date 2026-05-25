import React from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Typography } from 'antd';
import { DashboardOutlined, ApiOutlined, TagsOutlined, SettingOutlined } from '@ant-design/icons';
import Connections from './pages/Connections';
import TagBrowser from './pages/TagBrowser';
import LiveMonitor from './pages/LiveMonitor';
import SetupWizard from './pages/SetupWizard';

const { Sider, Header, Content } = Layout;
const { Title } = Typography;

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: 'Canlı İzleme' },
  { key: '/connections', icon: <ApiOutlined />, label: 'PLC Bağlantıları' },
  { key: '/tags', icon: <TagsOutlined />, label: 'Tag Yönetimi' },
  { key: '/setup', icon: <SettingOutlined />, label: 'Ayarlar' },
];

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={240} style={{ background: '#001529' }}>
        <div style={{ padding: '20px 16px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <Title level={4} style={{ color: '#fff', margin: 0, fontSize: 16 }}>
            🔌 PLC Data Collector
          </Title>
          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 4 }}>
            Industrial IoT Platform
          </div>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0, marginTop: 8 }}
        />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', height: 56 }}>
          <Title level={5} style={{ margin: 0, color: '#333' }}>
            {menuItems.find(m => m.key === location.pathname)?.label || 'PLC Data Collector'}
          </Title>
        </Header>
        <Content style={{ padding: 24, background: '#f5f5f5', overflow: 'auto' }}>
          <Routes>
            <Route path="/" element={<LiveMonitor />} />
            <Route path="/connections" element={<Connections />} />
            <Route path="/tags" element={<TagBrowser />} />
            <Route path="/setup" element={<SetupWizard />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}

export default App;
