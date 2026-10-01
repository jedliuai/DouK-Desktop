import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { api, ApiError } from '../../services/api';
import { EngineUpdateCheckResponse } from '../../types/api';
import { Cpu, RefreshCw, ArrowUpCircle, ExternalLink, CheckCircle, AlertTriangle, RotateCw } from 'lucide-react';

export const EnginePanel: React.FC = () => {
  const { health, healthError, healthLoading, refreshHealth, refreshSettings, addToast } = useApp();
  const [checking, setChecking] = useState<boolean>(false);
  const [updating, setUpdating] = useState<boolean>(false);
  const [updateInfo, setUpdateInfo] = useState<EngineUpdateCheckResponse | null>(null);
  const isAwaitingResolutionRef = useRef<boolean>(false);

  const handleCheckUpdate = async () => {
    setChecking(true);
    try {
      const data = await api.checkEngineUpdate();
      setUpdateInfo(data);
      if (data.available) {
        addToast(`检测到新版本下载引擎: ${data.latest}`, 'info');
      } else {
        addToast('下载引擎已是最新版本', 'success');
      }
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : '检查引擎更新失败，请稍后重试';
      addToast(msg, 'error');
    } finally {
      setChecking(false);
    }
  };

  const handleStartUpdate = async () => {
    setUpdating(true);
    try {
      await api.startEngineUpdate();
      isAwaitingResolutionRef.current = true;
      addToast('已启动引擎安装与更新，正在后台执行...', 'success');
      await refreshHealth();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : '启动引擎更新失败';
      addToast(msg, 'error');
      setUpdating(false);
      isAwaitingResolutionRef.current = false;
    }
  };

  // Clear local updating state on health ready/error and refresh settings after success
  useEffect(() => {
    if (health?.status === 'starting') {
      isAwaitingResolutionRef.current = true;
      return;
    }

    if (!isAwaitingResolutionRef.current) return;

    if (health?.status === 'ready') {
      isAwaitingResolutionRef.current = false;
      setUpdating(false);
      refreshSettings();
      setUpdateInfo(null);
      addToast('下载引擎已准备就绪', 'success');
    } else if (health?.status === 'error' || health?.status === 'disconnected') {
      isAwaitingResolutionRef.current = false;
      setUpdating(false);
    }
  }, [health?.status, refreshSettings, addToast]);

  const getStatusText = () => {
    switch (health?.status) {
      case 'ready':
        return '正常运行';
      case 'starting':
        return '正在启动 / 初始化';
      case 'missing':
        return '组件缺失或未安装';
      case 'error':
        return '运行异常';
      case 'disconnected':
        return '服务已断开';
      default:
        return '检测中...';
    }
  };

  const displayError = healthError || health?.error;

  return (
    <div className="engine-panel">
      <div className="engine-info-grid">
        <div className="engine-info-item">
          <span className="engine-info-item-label">核心下载引擎状态</span>
          <span className="engine-info-item-value" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              className="engine-status-dot"
              style={{
                backgroundColor:
                  health?.status === 'ready'
                    ? 'var(--status-ready-dot)'
                    : health?.status === 'starting'
                    ? 'var(--status-warning-dot)'
                    : 'var(--status-error-dot)',
              }}
            />
            {getStatusText()}
          </span>
        </div>

        <div className="engine-info-item">
          <span className="engine-info-item-label">当前引擎版本</span>
          <span className="engine-info-item-value">
            {health?.engine_version ? `v${health.engine_version}` : '未知 / 未安装'}
          </span>
        </div>
      </div>

      {displayError && (
        <div
          className="job-error-text"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
            <span style={{ wordBreak: 'break-word' }}>{displayError}</span>
          </div>
          <button
            type="button"
            className="btn-action btn-action-subtle"
            onClick={() => refreshHealth()}
            disabled={healthLoading}
            style={{ fontSize: '12px', padding: '3px 8px' }}
            title="重新检测服务状态"
          >
            <RotateCw size={12} className={healthLoading ? 'animate-spin' : ''} />
            <span>{healthLoading ? '检测中...' : '重试连接'}</span>
          </button>
        </div>
      )}

      {/* Update Info Banner if available */}
      {updateInfo && (
        <div
          style={{
            padding: '12px 14px',
            backgroundColor: updateInfo.available ? 'var(--accent-subtle)' : 'var(--status-ready-bg)',
            borderRadius: 'var(--radius-sm)',
            border: `1px solid ${updateInfo.available ? 'var(--accent-border)' : 'var(--status-ready-border)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {updateInfo.available ? (
              <ArrowUpCircle size={16} color="var(--accent-primary)" />
            ) : (
              <CheckCircle size={16} color="var(--status-ready-text)" />
            )}
            <span style={{ fontSize: '13px' }}>
              {updateInfo.available
                ? `发现新版本：${updateInfo.latest}（当前：${updateInfo.current || '未安装'}）`
                : `下载引擎已是最新版本 (${updateInfo.latest || updateInfo.current})`}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {updateInfo.release_url && (
              <a
                href={updateInfo.release_url}
                target="_blank"
                rel="noreferrer"
                className="btn-action btn-action-subtle"
                style={{ fontSize: '12px', padding: '4px 8px' }}
                title="查看更新日志"
              >
                <ExternalLink size={12} />
                <span>更新说明</span>
              </a>
            )}

            {updateInfo.available && (
              <button
                type="button"
                className="btn-action btn-action-primary"
                onClick={handleStartUpdate}
                disabled={updating || health?.status === 'starting'}
                style={{ fontSize: '12px', padding: '4px 10px' }}
              >
                <ArrowUpCircle size={13} className={updating ? 'animate-spin' : ''} />
                <span>{updating ? '安装中...' : '立即更新引擎'}</span>
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', marginTop: '4px', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn-action"
          onClick={handleCheckUpdate}
          disabled={checking || updating || health?.status === 'starting'}
        >
          <RefreshCw size={13} className={checking ? 'animate-spin' : ''} />
          <span>{checking ? '正在检查最新版本...' : '检查引擎更新'}</span>
        </button>

        {health?.status === 'missing' && (
          <button
            type="button"
            className="btn-action btn-action-primary"
            onClick={handleStartUpdate}
            disabled={updating}
          >
            <Cpu size={13} />
            <span>{updating ? '正在安装...' : '安装下载引擎'}</span>
          </button>
        )}

        {health?.status === 'disconnected' && (
          <button
            type="button"
            className="btn-action btn-action-primary"
            onClick={() => refreshHealth()}
            disabled={healthLoading}
          >
            <RotateCw size={13} className={healthLoading ? 'animate-spin' : ''} />
            <span>{healthLoading ? '正在重试连接...' : '重试连接服务'}</span>
          </button>
        )}

        {health?.status === 'error' && (
          <button
            type="button"
            className="btn-action btn-action-primary"
            onClick={handleStartUpdate}
            disabled={updating}
          >
            <RotateCw size={13} className={updating ? 'animate-spin' : ''} />
            <span>{updating ? '正在重试安装...' : '重试安装引擎'}</span>
          </button>
        )}
      </div>
    </div>
  );
};
