import React, { useState } from 'react';
import { Job } from '../../types/api';
import { useApp } from '../../context/AppContext';
import { api, ApiError } from '../../services/api';
import { formatBytes, formatSpeed } from '../../utils/format';
import {
  Film,
  RotateCw,
  XCircle,
  ExternalLink,
  Download,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
} from 'lucide-react';

interface JobItemProps {
  job: Job;
}

export const JobItem: React.FC<JobItemProps> = ({ job }) => {
  const { addToast, refreshJobs } = useApp();
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  const handleCancel = async () => {
    setActionLoading(true);
    try {
      await api.cancelJob(job.id);
      addToast('任务已取消', 'info');
      await refreshJobs();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : '取消任务失败';
      addToast(msg, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRetry = async () => {
    setActionLoading(true);
    try {
      await api.retryJob(job.id);
      addToast('已重新加入下载队列', 'success');
      await refreshJobs();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : '重试任务失败';
      addToast(msg, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenFile = async () => {
    setActionLoading(true);
    try {
      await api.openJobFile(job.id);
      addToast('已请求系统播放器打开文件', 'info');
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : '无法打开本地视频文件';
      addToast(msg, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = () => {
    switch (job.status) {
      case 'queued':
        return (
          <span className="status-badge queued">
            <Clock size={11} />
            <span>排队中</span>
          </span>
        );
      case 'parsing':
        return (
          <span className="status-badge parsing">
            <Loader2 size={11} className="animate-spin" />
            <span>解析中</span>
          </span>
        );
      case 'downloading':
        return (
          <span className="status-badge downloading">
            <Loader2 size={11} className="animate-spin" />
            <span>{job.progress !== null ? `${Math.round(job.progress)}%` : '下载中'}</span>
          </span>
        );
      case 'completed':
        return (
          <span className="status-badge completed">
            <CheckCircle2 size={11} />
            <span>已完成</span>
          </span>
        );
      case 'failed':
        return (
          <span className="status-badge failed">
            <AlertCircle size={11} />
            <span>失败</span>
          </span>
        );
      case 'cancelled':
        return (
          <span className="status-badge cancelled">
            <XCircle size={11} />
            <span>已取消</span>
          </span>
        );
    }
  };

  const isDownloading = job.status === 'downloading';
  const isPending = job.status === 'queued' || job.status === 'parsing';
  const isFailedOrCancelled = job.status === 'failed' || job.status === 'cancelled';
  const isCompleted = job.status === 'completed';

  return (
    <div className="job-card">
      <div className="job-cover-thumb">
        {job.cover_url ? (
          <img src={job.cover_url} alt={job.title || '封面'} loading="lazy" />
        ) : (
          <Film size={22} />
        )}
      </div>

      <div className="job-details">
        <div className="job-title-row">
          <span className="job-title" title={job.title || job.url}>
            {job.title || job.url || '未命名视频'}
          </span>
          {getStatusBadge()}
        </div>

        <div className="job-meta-row">
          {job.author && <span className="job-author">@{job.author}</span>}

          {isDownloading && (
            <>
              <span className="job-speed">{formatSpeed(job.speed)}</span>
              <span className="job-bytes">
                {formatBytes(job.downloaded_bytes)}
                {job.total_bytes ? ` / ${formatBytes(job.total_bytes)}` : ''}
              </span>
            </>
          )}

          {isCompleted && job.filename && (
            <span className="job-bytes job-filename" title={job.filename}>
              {job.filename}
            </span>
          )}
        </div>

        {/* Progress Bar */}
        {(isDownloading || job.status === 'parsing') && (
          <div className="progress-bar-container">
            {job.progress !== null ? (
              <div
                className="progress-bar-fill"
                style={{ width: `${Math.min(100, Math.max(0, job.progress))}%` }}
              />
            ) : (
              <div className="progress-bar-indeterminate" />
            )}
          </div>
        )}

        {/* Error message */}
        {job.status === 'failed' && job.error && (
          <div className="job-error-text" title={job.error}>
            {job.error}
          </div>
        )}
      </div>

      <div className="job-actions">
        {/* Cancel button */}
        {(isDownloading || isPending) && (
          <button
            type="button"
            className="btn-action btn-action-subtle"
            onClick={handleCancel}
            disabled={actionLoading}
            title="取消下载"
          >
            <XCircle size={14} />
            <span>取消</span>
          </button>
        )}

        {/* Retry button */}
        {isFailedOrCancelled && (
          <button
            type="button"
            className="btn-action"
            onClick={handleRetry}
            disabled={actionLoading}
            title="重试下载"
          >
            <RotateCw size={14} />
            <span>重试</span>
          </button>
        )}

        {/* Completed actions: Open file, Browser download link */}
        {isCompleted && (
          <>
            <button
              type="button"
              className="btn-action"
              onClick={handleOpenFile}
              disabled={actionLoading}
              title="使用系统播放器打开文件"
            >
              <ExternalLink size={14} />
              <span>打开</span>
            </button>

            {job.file_url && (
              <a
                href={job.file_url}
                target="_blank"
                rel="noreferrer"
                download={job.filename || undefined}
                className="btn-action btn-action-subtle"
                title="在浏览器中直接下载或保存"
              >
                <Download size={14} />
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
};
