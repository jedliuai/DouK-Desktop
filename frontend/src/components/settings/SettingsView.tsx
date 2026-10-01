import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { EnginePanel } from './EnginePanel';
import {
  Folder,
  FolderOpen,
  Sliders,
  ShieldCheck,
  ShieldAlert,
  Save,
  Eye,
  EyeOff,
  Cpu,
  RotateCcw,
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { settings, settingsLoading, updateSettings, openFolder, refreshSettings, addToast } = useApp();

  const [downloadDir, setDownloadDir] = useState<string>('');
  const [originalQuality, setOriginalQuality] = useState<boolean>(true);
  const [cookieInput, setCookieInput] = useState<string>('');
  const [showCookie, setShowCookie] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (settings) {
      setDownloadDir(settings.download_dir || '');
      setOriginalQuality(!!settings.original_quality);
    }
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload: { download_dir?: string; cookie?: string; original_quality?: boolean } = {
        download_dir: downloadDir.trim(),
        original_quality: originalQuality,
      };

      // Omitting cookie preserves existing cookie
      if (cookieInput.trim()) {
        payload.cookie = cookieInput.trim();
      }

      await updateSettings(payload);
      setCookieInput(''); // Clear temporary input after saving
    } catch {
      // Handled in context toast
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = async () => {
    await refreshSettings();
    if (settings) {
      setDownloadDir(settings.download_dir || '');
      setOriginalQuality(!!settings.original_quality);
      setCookieInput('');
      addToast('已重置并刷新设置', 'info');
    }
  };

  return (
    <div className="settings-container">
      <form onSubmit={handleSave}>
        {/* General Settings */}
        <div className="settings-card">
          <div className="settings-card-title">
            <Sliders size={16} />
            <span>常规存储与画质偏好</span>
          </div>

          {/* Download Directory */}
          <div className="settings-row">
            <div className="settings-label-row">
              <label htmlFor="download-dir" className="settings-label">
                下载保存目录
              </label>
              <button
                type="button"
                className="btn-action btn-action-subtle"
                onClick={openFolder}
                style={{ fontSize: '12px', padding: '3px 8px' }}
                title="在文件管理器中打开当前保存目录"
              >
                <FolderOpen size={12} />
                <span>打开目录</span>
              </button>
            </div>
            <div className="settings-desc">
              所有下载的视频将存放于此目录，支持自定义绝对路径。
            </div>
            <div className="settings-input-group">
              <input
                id="download-dir"
                type="text"
                value={downloadDir}
                onChange={(e) => setDownloadDir(e.target.value)}
                placeholder="例如：D:\DouK-Downloads"
                required
              />
            </div>
          </div>

          {/* Original Quality Toggle */}
          <div className="settings-row">
            <label className="toggle-switch-label" htmlFor="quality-toggle">
              <div>
                <div className="settings-label">优先下载最高原画画质</div>
                <div className="settings-desc">
                  开启后将智能提取最高分辨率与码率原始视频源流（如 1080P/2K/4K），尽可能避免二次转码压缩。
                </div>
              </div>
              <div
                id="quality-toggle"
                className={`toggle-switch ${originalQuality ? 'checked' : ''}`}
                onClick={() => setOriginalQuality(!originalQuality)}
                role="switch"
                aria-checked={originalQuality}
                aria-label="优先下载最高原画画质"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    setOriginalQuality(!originalQuality);
                  }
                }}
              >
                <div className="toggle-switch-thumb" />
              </div>
            </label>
          </div>
        </div>

        {/* Credentials / Cookie */}
        <div className="settings-card" style={{ marginTop: '20px' }}>
          <div className="settings-card-title">
            <Folder size={16} />
            <span>抖音账号凭据 (Cookie)</span>
          </div>

          <div className="settings-row">
            <div className="settings-label-row">
              <label htmlFor="douyin-cookie" className="settings-label">
                抖音 Cookie
              </label>
              {settings?.cookie_configured ? (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    color: 'var(--status-ready-text)',
                    backgroundColor: 'var(--status-ready-bg)',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                  }}
                >
                  <ShieldCheck size={12} />
                  已保存 Cookie
                </span>
              ) : (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    color: 'var(--text-tertiary)',
                    backgroundColor: 'var(--bg-surface-subtle)',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                  }}
                >
                  <ShieldAlert size={12} />
                  未保存 Cookie
                </span>
              )}
            </div>

            <div className="settings-desc">
              Cookie 失效时可在此更新，不修改请留空。
            </div>

            <div className="settings-input-group" style={{ position: 'relative' }}>
              <input
                id="douyin-cookie"
                type={showCookie ? 'text' : 'password'}
                value={cookieInput}
                onChange={(e) => setCookieInput(e.target.value)}
                placeholder={
                  settings?.cookie_configured
                    ? '已保存 Cookie。如需更新请输入新 Cookie，不修改请留空'
                    : '粘贴抖音 Cookie（选填）'
                }
                style={{ paddingRight: '40px' }}
                autoComplete="off"
              />
              <button
                type="button"
                className="btn-action-subtle"
                style={{
                  position: 'absolute',
                  right: '8px',
                  padding: '4px',
                  color: 'var(--text-tertiary)',
                }}
                onClick={() => setShowCookie(!showCookie)}
                title={showCookie ? '隐藏内容' : '查看明文'}
                aria-label={showCookie ? '隐藏 Cookie' : '显示 Cookie'}
              >
                {showCookie ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
        </div>

        {/* Save Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            marginTop: '16px',
            marginBottom: '4px',
          }}
        >
          <button
            type="button"
            className="btn-action"
            onClick={handleReset}
            disabled={settingsLoading || isSubmitting}
          >
            <RotateCcw size={14} />
            <span>重置</span>
          </button>

          <button
            type="submit"
            className="btn-action btn-action-primary"
            disabled={settingsLoading || isSubmitting}
          >
            <Save size={14} />
            <span>{isSubmitting ? '保存中...' : '保存设置'}</span>
          </button>
        </div>
      </form>

      {/* Engine Maintenance */}
      <div className="settings-card">
        <div className="settings-card-title">
          <Cpu size={16} />
          <span>下载引擎与组件维护</span>
        </div>
        <div className="settings-desc" style={{ marginTop: '-10px' }}>
          DouK 桌面端依赖底层的独立解析下载引擎。在此查看状态、检测新版本或一键升级。
        </div>

        <EnginePanel />
      </div>
    </div>
  );
};
