import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { JobItem } from './JobItem';
import { Inbox, RotateCw, FolderOpen } from 'lucide-react';

type FilterType = 'all' | 'active' | 'completed' | 'failed';

export const JobsList: React.FC = () => {
  const { jobs, jobsLoading, jobsError, refreshJobs, openFolder } = useApp();
  const [filter, setFilter] = useState<FilterType>('all');

  const filteredJobs = jobs.filter((job) => {
    if (filter === 'all') return true;
    if (filter === 'active') {
      return job.status === 'queued' || job.status === 'parsing' || job.status === 'downloading';
    }
    if (filter === 'completed') {
      return job.status === 'completed';
    }
    if (filter === 'failed') {
      return job.status === 'failed' || job.status === 'cancelled';
    }
    return true;
  });

  const activeCount = jobs.filter(
    (j) => j.status === 'queued' || j.status === 'parsing' || j.status === 'downloading'
  ).length;
  const completedCount = jobs.filter((j) => j.status === 'completed').length;
  const failedCount = jobs.filter((j) => j.status === 'failed' || j.status === 'cancelled').length;

  return (
    <div className="jobs-section">
      <div className="jobs-filter-bar">
        <div className="section-title">
          <span>任务列表</span>
          <span className="section-count">{jobs.length}</span>
        </div>

        <div className="jobs-filter-tabs">
          <button
            type="button"
            className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            全部 ({jobs.length})
          </button>
          <button
            type="button"
            className={`filter-tab ${filter === 'active' ? 'active' : ''}`}
            onClick={() => setFilter('active')}
          >
            进行中 ({activeCount})
          </button>
          <button
            type="button"
            className={`filter-tab ${filter === 'completed' ? 'active' : ''}`}
            onClick={() => setFilter('completed')}
          >
            已完成 ({completedCount})
          </button>
          <button
            type="button"
            className={`filter-tab ${filter === 'failed' ? 'active' : ''}`}
            onClick={() => setFilter('failed')}
          >
            异常/取消 ({failedCount})
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="btn-action btn-action-subtle"
            onClick={() => refreshJobs()}
            title="手动刷新任务队列"
          >
            <RotateCw size={13} className={jobsLoading ? 'animate-spin' : ''} />
            <span>刷新</span>
          </button>
          <button
            type="button"
            className="btn-action btn-action-subtle"
            onClick={openFolder}
            title="打开保存目录"
          >
            <FolderOpen size={13} />
            <span>目录</span>
          </button>
        </div>
      </div>

      {jobsError && (
        <div className="job-error-text" style={{ padding: '8px 12px' }}>
          任务数据同步错误: {jobsError}
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Inbox size={26} />
          </div>
          <div className="empty-state-title">暂无下载任务</div>
          <p className="empty-state-description">
            在上方粘贴抖音或 TikTok 的分享文本或链接，点击「解析预览」或「直接下载」即可开启下载。
          </p>
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Inbox size={26} />
          </div>
          <div className="empty-state-title">未找到匹配的任务</div>
          <p className="empty-state-description">当前筛选类别下暂无任务，请切换筛选条件查看。</p>
        </div>
      ) : (
        <div className="jobs-list">
          {filteredJobs.map((job) => (
            <JobItem key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
};
