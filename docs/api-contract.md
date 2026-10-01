# DouK-Desktop API contract

The React frontend lives in `frontend/`, the Python FastAPI bridge lives in `backend/`. Vite proxies `/api` to http://127.0.0.1:18765. Use relative `/api` URLs in the frontend. Production backend serves frontend/dist. No authentication prompt is needed. Credentials stay on this local machine.

All errors return `{detail: string}`. Chinese user interface. Poll health/jobs while app is open, avoid overlapping requests. Show actual errors and loading/empty states, no demo data in production.

- `GET /api/health`: `{status: "ready"|"starting"|"missing"|"error", engine_version: string|null, error: string|null}`
- `GET /api/settings`: `{download_dir: string, engine_dir: string|null, cookie_configured: boolean, original_quality: boolean}`
- `PATCH /api/settings`: body `{download_dir?: string, cookie?: string, original_quality?: boolean}` -> same sanitized settings; omitting cookie preserves existing cookie. Never show existing cookie; new input is a password textarea/input.
- `POST /api/preview`: body `{text: string}` -> `{items: Media[]}`. Handles pasted share text, short URLs, normal URLs, search/jingxuan modal_id URLs, and multiple URLs.
- `POST /api/jobs`: body `{urls: string[]}` -> `{jobs: Job[]}`. URLs from preview or directly pasted. Job queue is serial; safe engine updates require idle queue.
- `GET /api/jobs`: `{jobs: Job[]}` newest first.
- `POST /api/jobs/{id}/cancel`: `{job: Job}`
- `POST /api/jobs/{id}/retry`: `{job: Job}`
- `GET /api/files`: `{files: File[]}`
- `POST /api/open-folder`: opens download directory, returns `{ok: true}`
- `POST /api/jobs/{id}/open`: opens downloaded local video, returns `{ok:true}`
- `GET /api/engine/update`: `{current: string|null, latest: string, available: boolean, release_url: string}` (can take a few seconds)
- `POST /api/engine/update`: begins background engine installation/update, returns `{started: true}`. Poll health for ready/error. Does not touch frontend or private data.

`Media`: `{id: string, platform: "douyin"|"tiktok", url: string, title: string, author: string, cover_url: string|null, duration: string, width: number, height: number}`

`Job`: `{id: string, video_id: string, platform: string, url: string, title: string, author: string, cover_url: string|null, status: "queued"|"parsing"|"downloading"|"completed"|"failed"|"cancelled", progress: number|null, downloaded_bytes: number, total_bytes: number|null, speed: number, error: string|null, filename: string|null, created_at: string, file_url: string|null}`. Progress uses 0..100; null means indeterminate. Display real speed in bytes/s formatted as MB/s. Cover URL served by backend or signed CDN.

`File`: `{id: string, filename: string, size: number, modified_at: string, file_url: string}`. file_url is a safe /api/files/{id}/content URL and can be used with browser download/open link. No arbitrary filesystem paths in file routes.

Frontend must be independently buildable: npm install, npm run build. Suggested React+TypeScript+Vite, lucide-react icons. Accessible dialogs, keyboard and focus states, responsive desktop and small screens. No mock data dependency. Settings/update actions must actually call these APIs.
