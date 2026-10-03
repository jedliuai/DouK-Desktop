export type HealthStatus = 'ready' | 'starting' | 'missing' | 'error' | 'disconnected';

export interface HealthResponse {
  status: HealthStatus;
  engine_version: string | null;
  error: string | null;
}

export interface Settings {
  download_dir: string;
  engine_dir: string | null;
  cookie_configured: boolean;
  original_quality: boolean;
}

export interface SettingsUpdatePayload {
  download_dir?: string;
  cookie?: string;
  original_quality?: boolean;
}

export interface BrowserCookieStatus {
  state: 'idle' | 'starting' | 'waiting' | 'saving' | 'success' | 'error' | 'cancelled';
  message: string;
  browser?: string;
  cookie_count?: number;
}

export interface Media {
  id: string;
  platform: 'douyin' | 'tiktok';
  url: string;
  title: string;
  author: string;
  cover_url: string | null;
  duration: string;
  width: number;
  height: number;
}

export interface PreviewResponse {
  items: Media[];
}

export type JobStatus = 'queued' | 'parsing' | 'downloading' | 'completed' | 'failed' | 'cancelled';

export interface Job {
  id: string;
  video_id: string;
  platform: string;
  url: string;
  title: string;
  author: string;
  cover_url: string | null;
  status: JobStatus;
  progress: number | null; // 0..100, null means indeterminate
  downloaded_bytes: number;
  total_bytes: number | null;
  speed: number; // bytes/sec
  error: string | null;
  filename: string | null;
  created_at: string;
  file_url: string | null;
}

export interface JobsResponse {
  jobs: Job[];
}

export interface JobActionResponse {
  job: Job;
}

export interface DownloadedFile {
  id: string;
  filename: string;
  size: number; // bytes
  modified_at: string;
  file_url: string;
}

export interface FilesResponse {
  files: DownloadedFile[];
}

export interface EngineUpdateCheckResponse {
  current: string | null;
  latest: string;
  available: boolean;
  release_url: string;
}

export interface EngineUpdateStartResponse {
  started: boolean;
}

export interface OpenFolderResponse {
  ok: boolean;
}

export interface OpenFileResponse {
  ok: boolean;
}

export interface ApiErrorResponse {
  detail: string;
}
