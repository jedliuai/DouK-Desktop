import {
  HealthResponse,
  Settings,
  SettingsUpdatePayload,
  PreviewResponse,
  JobsResponse,
  JobActionResponse,
  FilesResponse,
  EngineUpdateCheckResponse,
  EngineUpdateStartResponse,
  OpenFolderResponse,
  OpenFileResponse,
  BrowserCookieStatus,
} from '../types/api';

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorDetail = `请求失败 (${response.status})`;
    try {
      const data = await response.json();
      if (data && typeof data.detail === 'string') {
        errorDetail = data.detail;
      }
    } catch {
      // response is not json
    }
    throw new ApiError(response.status, errorDetail);
  }

  // Handle empty bodies or standard JSON
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }
  return {} as T;
}

export const api = {
  // Engine & Health
  async getHealth(): Promise<HealthResponse> {
    return request<HealthResponse>('/api/health');
  },

  // Settings
  async getSettings(): Promise<Settings> {
    return request<Settings>('/api/settings');
  },

  async updateSettings(payload: SettingsUpdatePayload): Promise<Settings> {
    return request<Settings>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  // Media preview
  async startBrowserCookie(browser: string, mode: 'existing' | 'login'): Promise<BrowserCookieStatus> {
    return request('/api/cookie/browser', { method: 'POST', body: JSON.stringify({ browser, mode }) });
  },

  async getBrowserCookieStatus(): Promise<BrowserCookieStatus> {
    return request('/api/cookie/browser');
  },

  async cancelBrowserCookie(): Promise<BrowserCookieStatus> {
    return request('/api/cookie/browser/cancel', { method: 'POST' });
  },

  async preview(text: string): Promise<PreviewResponse> {
    return request<PreviewResponse>('/api/preview', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  },

  // Download Jobs
  async createJobs(urls: string[]): Promise<JobsResponse> {
    return request<JobsResponse>('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({ urls }),
    });
  },

  async getJobs(): Promise<JobsResponse> {
    return request<JobsResponse>('/api/jobs');
  },

  async cancelJob(id: string): Promise<JobActionResponse> {
    return request<JobActionResponse>(`/api/jobs/${id}/cancel`, {
      method: 'POST',
    });
  },

  async retryJob(id: string): Promise<JobActionResponse> {
    return request<JobActionResponse>(`/api/jobs/${id}/retry`, {
      method: 'POST',
    });
  },

  async openJobFile(id: string): Promise<OpenFileResponse> {
    return request<OpenFileResponse>(`/api/jobs/${id}/open`, {
      method: 'POST',
    });
  },

  // Files library
  async getFiles(): Promise<FilesResponse> {
    return request<FilesResponse>('/api/files');
  },

  async openFolder(): Promise<OpenFolderResponse> {
    return request<OpenFolderResponse>('/api/open-folder', {
      method: 'POST',
    });
  },

  // Engine Update
  async checkEngineUpdate(): Promise<EngineUpdateCheckResponse> {
    return request<EngineUpdateCheckResponse>('/api/engine/update');
  },

  async startEngineUpdate(): Promise<EngineUpdateStartResponse> {
    return request<EngineUpdateStartResponse>('/api/engine/update', {
      method: 'POST',
    });
  },
};
