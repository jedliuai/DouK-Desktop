import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { HealthResponse, Job, DownloadedFile, Settings } from '../types/api';
import { api, ApiError } from '../services/api';

export type TabType = 'download' | 'files' | 'settings';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface AppContextType {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;

  // Health
  health: HealthResponse | null;
  healthLoading: boolean;
  healthError: string | null;
  refreshHealth: () => Promise<void>;

  // Jobs
  jobs: Job[];
  jobsLoading: boolean;
  jobsError: string | null;
  refreshJobs: () => Promise<void>;

  // Files
  files: DownloadedFile[];
  filesLoading: boolean;
  filesError: string | null;
  refreshFiles: () => Promise<void>;

  // Settings
  settings: Settings | null;
  settingsLoading: boolean;
  settingsError: string | null;
  refreshSettings: () => Promise<void>;
  updateSettings: (payload: { download_dir?: string; cookie?: string; original_quality?: boolean }) => Promise<void>;

  // Engine Actions
  openFolder: () => Promise<void>;

  // Toasts
  toasts: ToastMessage[];
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<TabType>('download');

  // Health state
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState<boolean>(true);
  const [healthError, setHealthError] = useState<string | null>(null);

  // Jobs state
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState<boolean>(true);
  const [jobsError, setJobsError] = useState<string | null>(null);

  // Files state
  const [files, setFiles] = useState<DownloadedFile[]>([]);
  const [filesLoading, setFilesLoading] = useState<boolean>(false);
  const [filesError, setFilesError] = useState<string | null>(null);

  // Settings state
  const [settings, setSettings] = useState<Settings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState<boolean>(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // Toasts state
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Prevent overlapping requests
  const isPollingJobsRef = useRef<boolean>(false);
  const isPollingHealthRef = useRef<boolean>(false);

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Refresh Health
  const refreshHealth = useCallback(async () => {
    if (isPollingHealthRef.current) return;
    isPollingHealthRef.current = true;
    try {
      const data = await api.getHealth();
      setHealth(data);
      if (data.status === 'error' || data.error) {
        setHealthError(data.error || '引擎运行异常');
      } else {
        setHealthError(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : '服务连接异常，无法连接到本地后端';
      setHealth({
        status: 'error',
        engine_version: null,
        error: msg,
      });
      setHealthError(msg);
    } finally {
      setHealthLoading(false);
      isPollingHealthRef.current = false;
    }
  }, []);

  // Refresh Jobs
  const refreshJobs = useCallback(async () => {
    if (isPollingJobsRef.current) return;
    isPollingJobsRef.current = true;
    try {
      const res = await api.getJobs();
      setJobs(res.jobs || []);
      setJobsError(null);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : '获取任务列表失败';
      setJobsError(msg);
    } finally {
      setJobsLoading(false);
      isPollingJobsRef.current = false;
    }
  }, []);

  // Refresh Files
  const refreshFiles = useCallback(async () => {
    setFilesLoading(true);
    setFilesError(null);
    try {
      const res = await api.getFiles();
      setFiles(res.files || []);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : '获取文件列表失败';
      setFilesError(msg);
      addToast(msg, 'error');
    } finally {
      setFilesLoading(false);
    }
  }, [addToast]);

  // Refresh Settings
  const refreshSettings = useCallback(async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const data = await api.getSettings();
      setSettings(data);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : '加载设置失败';
      setSettingsError(msg);
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  // Update Settings
  const updateSettings = useCallback(
    async (payload: { download_dir?: string; cookie?: string; original_quality?: boolean }) => {
      setSettingsLoading(true);
      try {
        const updated = await api.updateSettings(payload);
        setSettings(updated);
        addToast('设置已保存', 'success');
      } catch (err: unknown) {
        const msg = err instanceof ApiError ? err.detail : '保存设置失败';
        addToast(msg, 'error');
        throw err;
      } finally {
        setSettingsLoading(false);
      }
    },
    [addToast]
  );

  // Open folder
  const openFolder = useCallback(async () => {
    try {
      await api.openFolder();
      addToast('已打开保存目录', 'info');
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : '无法打开目录';
      addToast(msg, 'error');
    }
  }, [addToast]);

  // Initial loads
  useEffect(() => {
    refreshHealth();
    refreshJobs();
    refreshSettings();
  }, [refreshHealth, refreshJobs, refreshSettings]);

  // When tab switches to files, refresh files library
  useEffect(() => {
    if (activeTab === 'files') {
      refreshFiles();
    }
  }, [activeTab, refreshFiles]);

  // Refresh file list when a new completed job appears while files tab open
  const prevCompletedJobIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    const currentCompleted = new Set(
      jobs.filter((j) => j.status === 'completed').map((j) => j.id)
    );

    if (prevCompletedJobIdsRef.current !== null) {
      let hasNewCompleted = false;
      for (const id of currentCompleted) {
        if (!prevCompletedJobIdsRef.current.has(id)) {
          hasNewCompleted = true;
          break;
        }
      }

      if (hasNewCompleted && activeTab === 'files') {
        refreshFiles();
      }
    }

    prevCompletedJobIdsRef.current = currentCompleted;
  }, [jobs, activeTab, refreshFiles]);

  // Background polling alive across tabs (health & jobs every ~2000ms)
  useEffect(() => {
    const interval = setInterval(() => {
      refreshHealth();
      refreshJobs();
    }, 2000);

    return () => {
      clearInterval(interval);
    };
  }, [refreshHealth, refreshJobs]);

  return (
    <AppContext.Provider
      value={{
        activeTab,
        setActiveTab,
        health,
        healthLoading,
        healthError,
        refreshHealth,
        jobs,
        jobsLoading,
        jobsError,
        refreshJobs,
        files,
        filesLoading,
        filesError,
        refreshFiles,
        settings,
        settingsLoading,
        settingsError,
        refreshSettings,
        updateSettings,
        openFolder,
        toasts,
        addToast,
        removeToast,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
