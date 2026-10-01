import React, { useState } from 'react';
import { Media } from '../../types/api';
import { useApp } from '../../context/AppContext';
import { api, ApiError } from '../../services/api';
import { Download, Film, User, Trash2, Loader2 } from 'lucide-react';

interface PreviewCardsProps {
  items: Media[];
  onClear: () => void;
  onDownloaded: () => void;
}

export const PreviewCards: React.FC<PreviewCardsProps> = ({ items, onClear, onDownloaded }) => {
  const { addToast, refreshJobs } = useApp();
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [isBatchDownloading, setIsBatchDownloading] = useState<boolean>(false);

  if (!items || items.length === 0) return null;

  const handleDownloadSingle = async (item: Media) => {
    setDownloadingIds((prev) => new Set(prev).add(item.id));
    try {
      await api.createJobs([item.url]);
      addToast(`已添加任务: ${item.title || '视频'}`, 'success');
      onDownloaded();
      await refreshJobs();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : '添加任务失败';
      addToast(msg, 'error');
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const handleDownloadAll = async () => {
    if (items.length === 0) return;
    setIsBatchDownloading(true);
    try {
      const urls = items.map((i) => i.url);
      await api.createJobs(urls);
      addToast(`已成功添加全部 ${items.length} 个视频到下载队列`, 'success');
      onDownloaded();
      await refreshJobs();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : '批量添加任务失败';
      addToast(msg, 'error');
    } finally {
      setIsBatchDownloading(false);
    }
  };

  return (
    <div className="previews-section">
      <div className="section-header">
        <div className="section-title">
          <span>解析结果</span>
          <span className="section-count">{items.length} 个视频</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="btn-action btn-action-subtle"
            onClick={onClear}
            disabled={isBatchDownloading}
          >
            <Trash2 size={14} />
            <span>清空预览</span>
          </button>
          <button
            type="button"
            className="btn-action btn-action-primary"
            onClick={handleDownloadAll}
            disabled={isBatchDownloading}
          >
            {isBatchDownloading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
            <span>下载全部 ({items.length})</span>
          </button>
        </div>
      </div>

      <div className="previews-grid">
        {items.map((media) => {
          const isItemDownloading = downloadingIds.has(media.id);
          const resolution =
            media.width && media.height ? `${media.width}×${media.height}` : null;

          return (
            <div key={media.id || media.url} className="preview-card">
              <div className="preview-cover-container">
                {media.cover_url ? (
                  <img
                    src={media.cover_url}
                    alt={media.title || '视频封面'}
                    className="preview-cover-image"
                    loading="lazy"
                  />
                ) : (
                  <Film size={36} color="var(--text-tertiary)" />
                )}

                <span className="preview-badge-platform">
                  {media.platform === 'tiktok' ? 'TikTok' : '抖音'}
                </span>

                {resolution && (
                  <span className="preview-badge-resolution">{resolution}</span>
                )}

                {media.duration && (
                  <span className="preview-badge-duration">{media.duration}</span>
                )}
              </div>

              <div className="preview-info">
                <h4 className="preview-card-title" title={media.title}>
                  {media.title || '无标题视频'}
                </h4>

                <div className="preview-card-meta">
                  <div className="preview-card-author" title={media.author}>
                    <User size={12} />
                    <span>{media.author || '未知创作者'}</span>
                  </div>
                </div>

                <div className="preview-card-actions">
                  <button
                    type="button"
                    className="btn-action btn-action-primary"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => handleDownloadSingle(media)}
                    disabled={isItemDownloading}
                  >
                    {isItemDownloading ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        <span>添加中...</span>
                      </>
                    ) : (
                      <>
                        <Download size={14} />
                        <span>下载此视频</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
