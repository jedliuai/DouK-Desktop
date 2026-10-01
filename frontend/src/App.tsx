import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { DownloadView } from './components/download/DownloadView';
import { FilesView } from './components/files/FilesView';
import { SettingsView } from './components/settings/SettingsView';
import { Toast } from './components/Toast';
import { AlertTriangle, RotateCw } from 'lucide-react';
import './styles/app.css';

const MainContent: React.FC = () => {
  const { activeTab, healthError, healthLoading, refreshHealth, setActiveTab } = useApp();

  return (
    <main className="app-main" id="main-content">
      {healthError && (
        <div className="health-error-banner" role="alert">
          <div className="health-error-info">
            <AlertTriangle size={15} className="health-error-icon" />
            <span className="health-error-text">
              <strong>服务状态异常：</strong>
              {healthError}
            </span>
          </div>
          <div className="health-error-actions">
            <button
              type="button"
              className="btn-action btn-action-subtle health-retry-btn"
              onClick={() => refreshHealth()}
              disabled={healthLoading}
              title="重新检测服务健康状态"
            >
              <RotateCw size={12} className={healthLoading ? 'animate-spin' : ''} />
              <span>重试连接</span>
            </button>
            <button
              type="button"
              className="btn-action btn-action-subtle"
              onClick={() => setActiveTab('settings')}
              title="前往设置查看引擎信息"
            >
              <span>查看引擎</span>
            </button>
          </div>
        </div>
      )}

      {activeTab === 'download' && <DownloadView />}
      {activeTab === 'files' && <FilesView />}
      {activeTab === 'settings' && <SettingsView />}
    </main>
  );
};

export const App: React.FC = () => {
  return (
    <AppProvider>
      <div className="app-container">
        <Header />
        <MainContent />
        <Toast />
      </div>
    </AppProvider>
  );
};

export default App;
