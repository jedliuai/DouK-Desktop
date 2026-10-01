import json
import sqlite3
import threading
from pathlib import Path


class JobStore:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, data TEXT NOT NULL)")
        self.db.commit()
        for job in self.list():
            if job["status"] in {"queued", "parsing", "downloading"}:
                self.update(job["id"], status="failed", speed=0, error="上次程序退出时下载未完成，可以重试")

    def put(self, job: dict):
        with self.lock:
            self.db.execute("INSERT OR REPLACE INTO jobs VALUES (?, ?)", (job["id"], json.dumps(job, ensure_ascii=False)))
            self.db.commit()

    def get(self, job_id: str) -> dict | None:
        with self.lock:
            row = self.db.execute("SELECT data FROM jobs WHERE id = ?", (job_id,)).fetchone()
            return json.loads(row[0]) if row else None

    def update(self, job_id: str, **changes):
        with self.lock:
            job = self.get(job_id)
            if job:
                job.update(changes)
                self.put(job)
            return job

    def list(self) -> list[dict]:
        with self.lock:
            rows = self.db.execute("SELECT data FROM jobs ORDER BY rowid DESC").fetchall()
            return [json.loads(row[0]) for row in rows]

    def close(self):
        with self.lock:
            self.db.close()
