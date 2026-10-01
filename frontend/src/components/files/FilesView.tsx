import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { formatBytes, formatDateTime } from '../../utils/format';
import {
  FolderOpen,
  RotateCw,
  Search,
  FileVideo,
  Download,
  Copy,
  Check,
  FolderX,
} from 'lucide-react';

export const FilesView: React.FC = () => {
  const { files, filesLoading, filesError, settings, refreshFiles, openFolder, addToast } = useApp();
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredFiles = files.filter((f) => {
    if (!searchTerm.trim()) return true;
    return f.filename.toLowerCase().includes(searchTerm.trim().toLowerCase());
  });

  const handleCopyLink = async (url: string, id: string) => {
    try {
      const fullUrl = url.startsWith('http')
        ? url
        : `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;
      await navigator.clipboard.writeText(fullUrl);
      setCopiedId(id);
      addToast('已复制文件链接到剪贴板', 'success');
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      addToast('复制链接失败', 'error');
    }
  };

  return (
    <div className="files-container">
      <div className="files-header-bar">
        <div className="section-title-wrap">
          <div className="section-title">
            <span>文件库</span>
            <span className="section-count">{files.length} 个文件</span>
          </div>
          {settings?.download_dir && (
            <span className="files-path-subtitle" title={`保存路径: ${settings.download_dir}`}>
              目录: {settings.download_dir}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="search-input-wrapper">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="搜索文件名..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="搜索文件名"
            />
          </div>

          <button
            type="button"
            className="btn-action"
            onClick={refreshFiles}
            disabled={filesLoading}
            title="刷新文件列表"
          >
            <RotateCw size={13} className={filesLoading ? 'animate-spin' : ''} />
            <span>刷新</span>
          </button>

          <button
            type="button"
            className="btn-action btn-action-primary"
            onClick={openFolder}
            title="在系统文件管理器中打开视频保存目录"
          >
            <FolderOpen size={14} />
            <span>打开保存目录</span>
          </button>
        </div>
      </div>

      {filesError && (
        <div className="job-error-text" style={{ padding: '10px 14px' }}>
          读取文件库失败: {filesError}
        </div>
      )}

      {files.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <FolderX size={28} />
          </div>
          <div className="empty-state-title">本地库中暂无已下载文件</div>
          <p className="empty-state-description">
            完成下载的视频将保存在下载目录并在此显示。您可以前往「下载」页面开始下载视频。
          </p>
          <button
            type="button"
            className="btn-action"
            onClick={openFolder}
            style={{ marginTop: '8px' }}
          >
            <FolderOpen size={14} />
            <span>打开当前保存目录</span>
          </button>
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Search size={28} />
          </div>
          <div className="empty-state-title">未找到匹配的文件</div>
          <p className="empty-state-description">没有与关键词「{searchTerm}」相符的文件，请尝试其他关键词。</p>
        </div>
      ) : (
        <div className="files-table-container">
          <table className="files-table">
            <thead>
              <tr>
                <th>文件名</th>
                <th>大小</th>
                <th>修改时间</th>
                <th style={{ textAlign: 'right' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredFiles.map((file) => (
                <tr key={file.id}>
                  <td>
                    <div className="file-name-cell">
                      <FileVideo size={18} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
                      <span title={file.filename}>{file.filename}</span>
                    </div>
                  </td>
                  <td className="file-size-cell">{formatBytes(file.size)}</td>
                  <td className="file-date-cell">{formatDateTime(file.modified_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn-action btn-action-subtle"
                        onClick={() => handleCopyLink(file.file_url, file.id)}
                        title="复制文件直链"
                        style={{ padding: '5px 8px' }}
                      >
                        {copiedId === file.id ? <Check size={14} color="#34a853" /> : <Copy size={14} />}
                      </button>

                      <a
                        href={file.file_url}
                        target="_blank"
                        rel="noreferrer"
                        download={file.filename}
                        className="btn-action"
                        style={{ padding: '5px 10px', fontSize: '12px' }}
                        title="在浏览器中直接下载"
                      >
                        <Download size={13} />
                        <span>下载</span>
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
