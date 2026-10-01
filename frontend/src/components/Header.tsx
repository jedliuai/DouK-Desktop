import React from 'react';
import { useApp } from '../context/AppContext';
import { Download, FolderCheck, Settings, FolderOpen, ArrowDownToLine } from 'lucide-react';

export const Header: React.FC = () => {
  const { activeTab, setActiveTab, health, healthError, jobs, openFolder } = useApp();

  const activeJobsCount = jobs.filter(
    (j) => j.status === 'queued' || j.status === 'parsing' || j.status === 'downloading'
  ).length;

  const engineStatus = health?.status || (healthError ? 'error' : 'starting');
  const engineVersion = health?.engine_version;

  const getStatusLabel = () => {
    switch (engineStatus) {
      case 'ready':
        return engineVersion ? `引擎就绪 (${engineVersion})` : '引擎就绪';
      case 'starting':
        return '引擎连接中...';
      case 'missing':
        return '引擎未就绪';
      case 'error':
        return '引擎异常';
      case 'disconnected':
        return '服务已断开';
      default:
        return '连接中...';
    }
  };

  return (
    <header className="app-header">
      <div className="header-left">
        <div
          className="brand-badge"
          onClick={() => setActiveTab('download')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveTab('download');
            }
          }}
          role="button"
          tabIndex={0}
          title="抖客桌面 - 简洁纯粹的本地视频下载工具"
        >
          <div className="brand-icon-wrapper">
            <ArrowDownToLine size={18} strokeWidth={2.5} />
          </div>
          <div className="brand-text">
            <span className="brand-title">抖客桌面</span>
            <span className="brand-subtitle">DouK Desktop</span>
          </div>
        </div>

        <button
          type="button"
          className={`engine-status-tag ${engineStatus}`}
          onClick={() => setActiveTab('settings')}
          title={healthError ? `引擎服务异常: ${healthError}` : '点击查看引擎详细状态与设置'}
          aria-label={`引擎状态: ${getStatusLabel()}`}
        >
          <span className="engine-status-dot" />
          <span>{getStatusLabel()}</span>
        </button>
      </div>

      <nav className="header-nav" aria-label="主要导航">
        <button
          type="button"
          className={`nav-tab-btn ${activeTab === 'download' ? 'active' : ''}`}
          onClick={() => setActiveTab('download')}
          aria-current={activeTab === 'download' ? 'page' : undefined}
        >
          <Download size={15} />
          <span>下载</span>
          {activeJobsCount > 0 && <span className="nav-badge">{activeJobsCount}</span>}
        </button>

        <button
          type="button"
          className={`nav-tab-btn ${activeTab === 'files' ? 'active' : ''}`}
          onClick={() => setActiveTab('files')}
          aria-current={activeTab === 'files' ? 'page' : undefined}
        >
          <FolderCheck size={15} />
          <span>文件</span>
        </button>

        <button
          type="button"
          className={`nav-tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
          aria-current={activeTab === 'settings' ? 'page' : undefined}
        >
          <Settings size={15} />
          <span>设置</span>
        </button>
      </nav>

      <div className="header-right">
        <button
          type="button"
          className="btn-action"
          onClick={openFolder}
          title="在系统文件管理器中打开视频保存目录"
        >
          <FolderOpen size={14} />
          <span>打开保存目录</span>
        </button>
      </div>
    </header>
  );
};
