import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { api, ApiError } from '../../services/api';
import { Media } from '../../types/api';
import { Sparkles, Download, X, Loader2, Link2 } from 'lucide-react';

interface ComposerProps {
  onPreviewSuccess: (items: Media[]) => void;
  onDownloadStarted: () => void;
}

export const Composer: React.FC<ComposerProps> = ({ onPreviewSuccess, onDownloadStarted }) => {
  const { addToast, refreshJobs } = useApp();
  const [inputText, setInputText] = useState<string>('');
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  const handleClear = () => {
    setInputText('');
  };

  const handlePreview = async () => {
    if (isParsing || isDownloading) {
      return;
    }
    const trimmed = inputText.trim();
    if (!trimmed) {
      addToast('请先粘贴抖音或 TikTok 的分享口令/视频链接', 'info');
      return;
    }

    setIsParsing(true);
    try {
      const res = await api.preview(trimmed);
      if (!res.items || res.items.length === 0) {
        addToast('未解析到有效视频，请检查链接或稍后重试', 'error');
      } else {
        onPreviewSuccess(res.items);
        addToast(`成功解析出 ${res.items.length} 个视频`, 'success');
      }
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : '解析失败，请检查链接格式';
      addToast(msg, 'error');
    } finally {
      setIsParsing(false);
    }
  };

  // Direct download: parses if needed and then queues jobs immediately
  const handleDirectDownload = async () => {
    if (isParsing || isDownloading) {
      return;
    }
    const trimmed = inputText.trim();
    if (!trimmed) {
      addToast('请先粘贴抖音或 TikTok 的分享口令/视频链接', 'info');
      return;
    }

    setIsDownloading(true);
    try {
      // First preview to resolve share text/tokens into concrete URLs
      const previewRes = await api.preview(trimmed);
      if (!previewRes.items || previewRes.items.length === 0) {
        addToast('未解析到有效视频，无法开始下载', 'error');
        return;
      }

      const urls = previewRes.items.map((item) => item.url);
      const jobsRes = await api.createJobs(urls);

      addToast(`已添加 ${jobsRes.jobs.length} 个下载任务`, 'success');
      setInputText('');
      onDownloadStarted();
      await refreshJobs();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : '下载启动失败';
      addToast(msg, 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl + Enter or Cmd + Enter to quickly trigger download
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (isParsing || isDownloading) {
        return;
      }
      handleDirectDownload();
    }
  };

  return (
    <div className="composer-card">
      <div className="composer-header">
        <span className="composer-title">创建下载</span>
        <span className="composer-tip">支持快捷键 Ctrl + Enter 快速下载</span>
      </div>

      <textarea
        className="composer-textarea"
        placeholder="粘贴抖音/TikTok 分享口令或视频链接（支持单条、多条、搜索精选等链接格式）..."
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={3}
        aria-label="粘贴视频链接输入框"
      />

      <div className="composer-toolbar">
        <div className="composer-tools-left">
          <Link2 size={14} />
          <span>支持多行粘贴同时处理多个视频</span>
        </div>

        <div className="composer-tools-right">
          {inputText && (
            <button
              type="button"
              className="btn-action btn-action-subtle"
              onClick={handleClear}
              disabled={isParsing || isDownloading}
              title="清空输入框"
            >
              <X size={14} />
              <span>清空</span>
            </button>
          )}

          <button
            type="button"
            className="btn-action"
            onClick={handlePreview}
            disabled={isParsing || isDownloading || !inputText.trim()}
          >
            {isParsing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            <span>{isParsing ? '解析中...' : '解析预览'}</span>
          </button>

          <button
            type="button"
            className="btn-action btn-action-primary"
            onClick={handleDirectDownload}
            disabled={isParsing || isDownloading || !inputText.trim()}
          >
            {isDownloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            <span>{isDownloading ? '添加中...' : '直接下载'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
