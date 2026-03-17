import asyncio

# Register HEIC support at startup
try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    pass

import json
import os
import pickle
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from db.database import init_db, get_db, AsyncSessionLocal
from db.models import ProcessedFile, DuplicateGroup, ScanSession
from ai.model_manager import model_manager, AVAILABLE_MODELS, MODELS_DIR
from scanner import scan_folders, get_file_type
from comparator import find_duplicates


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # Migrate models from system cache to app dir (one-time, for old installs)
    from ai.model_manager import _migrate_system_cache
    _migrate_system_cache()
    yield
    model_manager.unload_all()


app = FastAPI(title="Zap that Dupple API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Active WebSocket connections
active_ws: List[WebSocket] = []

# Current scan task
current_task: Optional[asyncio.Task] = None
scan_state: Dict[str, Any] = {"status": "idle"}


async def broadcast(message: dict):
    disconnected = []
    for ws in active_ws:
        try:
            await ws.send_json(message)
        except Exception:
            disconnected.append(ws)
    for ws in disconnected:
        active_ws.remove(ws)


# ─── Models ────────────────────────────────────────────────────────────────────


@app.get("/api/models")
async def get_models(lang: str = "ru"):
    result = {}
    for category, models in AVAILABLE_MODELS.items():
        result[category] = []
        for model_id, meta in models.items():
            description = meta.get("description_en", meta["description"]) if lang == "en" else meta["description"]
            entry = {k: v for k, v in meta.items() if not k.startswith("description")}
            entry["description"] = description
            entry["downloaded"] = model_manager.is_model_downloaded(model_id)
            result[category].append(entry)
    return result


class DownloadModelRequest(BaseModel):
    model_config = {"protected_namespaces": ()}
    model_id: str


@app.post("/api/models/download")
async def download_model(req: DownloadModelRequest):
    async def progress_cb(data):
        await broadcast({"type": "model_download_progress", **data})

    asyncio.create_task(model_manager.download_model(req.model_id, progress_cb))
    return {"status": "downloading", "model_id": req.model_id}


# ─── Settings ──────────────────────────────────────────────────────────────────

APP_DIR = Path.home() / "Zap that Dupple"
SETTINGS_FILE = APP_DIR / "settings.json"

DEFAULT_SETTINGS = {
    "image_model": "clip-ViT-B-32",
    "text_model": "all-MiniLM-L6-v2",
    "image_threshold": 0.92,
    "text_threshold": 0.90,
    "audio_threshold": 0.97,
    "video_threshold": 0.90,
    "video_frames": 10,
    "scan_folders": [],
    "language": "ru",
}


@app.get("/api/settings")
async def get_settings():
    if SETTINGS_FILE.exists():
        with open(SETTINGS_FILE) as f:
            saved = json.load(f)
        return {**DEFAULT_SETTINGS, **saved}
    return DEFAULT_SETTINGS


@app.post("/api/settings")
async def save_settings(settings: dict):
    with open(SETTINGS_FILE, "w") as f:
        json.dump(settings, f, indent=2)
    return {"status": "saved"}


# ─── Scan ──────────────────────────────────────────────────────────────────────

class ScanRequest(BaseModel):
    folders: List[str]
    image_model: str = "clip-ViT-B-32"
    text_model: str = "all-MiniLM-L6-v2"
    image_threshold: float = 0.92
    text_threshold: float = 0.90
    audio_threshold: float = 0.97
    video_threshold: float = 0.90
    video_frames: int = 10
    full_rescan: bool = False


@app.post("/api/scan/start")
async def start_scan(req: ScanRequest):
    global current_task, scan_state

    if scan_state.get("status") in ("scanning", "processing", "comparing"):
        raise HTTPException(400, "Scan already in progress")

    if req.full_rescan:
        async with AsyncSessionLocal() as db:
            await db.execute(delete(ProcessedFile))
            await db.execute(delete(DuplicateGroup))
            await db.commit()

    current_task = asyncio.create_task(run_scan(req))
    return {"status": "started"}


@app.post("/api/scan/stop")
async def stop_scan():
    global current_task, scan_state
    if current_task:
        current_task.cancel()
    scan_state = {"status": "idle"}
    await broadcast({"type": "scan_stopped"})
    return {"status": "stopped"}


@app.get("/api/scan/status")
async def get_scan_status():
    return scan_state


async def run_scan(req: ScanRequest):
    global scan_state

    try:
        # STEP 1: Scan files
        scan_state = {"status": "scanning", "step": "scanning", "progress": 0, "message": "Scanning folders..."}
        await broadcast({"type": "progress", **scan_state})

        files = await asyncio.get_event_loop().run_in_executor(
            None, scan_folders, req.folders
        )
        total = len(files)
        scan_state["total_files"] = total
        await broadcast({"type": "progress", **scan_state, "total_files": total})

        # STEP 2: Load models
        scan_state.update({"status": "loading_models", "step": "loading_models", "message": "Loading AI models..."})
        await broadcast({"type": "progress", **scan_state})

        await asyncio.get_event_loop().run_in_executor(None, model_manager.load_clip, req.image_model)
        await asyncio.get_event_loop().run_in_executor(None, model_manager.load_text_model, req.text_model)

        # STEP 3: Process files — grouped by type
        type_order = ["image", "video", "audio", "document"]
        file_groups = {ft: [f for f in files if f["file_type"] == ft] for ft in type_order}
        type_counts = {ft: len(v) for ft, v in file_groups.items()}

        processed = 0
        start_time = time.time()
        processed_data = []

        from processors.image_processor import get_image_phash, get_md5

        for ftype in type_order:
            type_files = file_groups[ftype]
            if not type_files:
                continue

            substep_processed = 0
            substep_start_time = time.time()
            scan_state.update({
                "status": "processing",
                "step": "processing",
                "substep": ftype,
                "substep_total": len(type_files),
                "substep_processed": 0,
                "type_counts": type_counts,
                "message": f"Processing {ftype}...",
                "remaining": None,
            })
            await broadcast({"type": "progress", **scan_state})

            for file_info in type_files:
                await asyncio.sleep(0)  # yield to event loop

                path = file_info["path"]

                # Check if already processed (not full rescan)
                if not req.full_rescan:
                    model_used_check = req.image_model if ftype in ("image", "video") else req.text_model
                    async with AsyncSessionLocal() as db:
                        result = await db.execute(
                            select(ProcessedFile).where(
                                ProcessedFile.path == path,
                                ProcessedFile.embedding_model == model_used_check,
                            )
                        )
                        existing = result.scalar_one_or_none()
                        # Погрешность ±2 сек: SMB/AFP/FAT округляют mtime (до 2 сек),
                        # NFS — до 1 сек. Точное сравнение ломало кеш на сетевых дисках.
                        if existing is not None and abs(existing.mtime - file_info["mtime"]) <= 2.0:
                            emb = pickle.loads(existing.embedding) if existing.embedding else None
                            # Не использовать кэш в трёх случаях:
                            # 1. emb=None, но модель загружена (сохранился None без модели)
                            # 2. emb содержит NaN (баг MPS float16 — silent NaN из ViT-L/14)
                            # В этих случаях пересчитываем эмбеддинг.
                            model_available = (
                                (ftype in ("image", "video") and model_manager._clip_model is not None)
                                or (ftype in ("audio", "document") and model_manager._text_model is not None)
                            )
                            emb_is_bad = (
                                emb is None
                                or (isinstance(emb, np.ndarray) and (np.isnan(emb).any() or np.isinf(emb).any()))
                            )
                            if not emb_is_bad or not model_available:
                                processed_data.append({
                                    **file_info,
                                    "md5_hash": existing.md5_hash,
                                    "phash": existing.phash,
                                    "embedding": emb,
                                })
                                processed += 1
                                substep_processed += 1
                                continue
                            # emb плохой и модель загружена — пересчитываем

                # Process new file
                embedding = None
                phash = None
                md5 = None
                error = None

                try:
                    if ftype == "image":
                        md5 = await asyncio.get_event_loop().run_in_executor(None, get_md5, path)
                        phash = await asyncio.get_event_loop().run_in_executor(None, get_image_phash, path)
                        embedding = await asyncio.get_event_loop().run_in_executor(
                            None, model_manager.get_image_embedding, path
                        )

                    elif ftype == "video":
                        from processors.video_processor import get_video_embedding
                        md5 = await asyncio.get_event_loop().run_in_executor(None, get_md5, path)
                        embedding = await asyncio.get_event_loop().run_in_executor(
                            None, get_video_embedding, path, model_manager, req.video_frames
                        )

                    elif ftype == "audio":
                        from processors.audio_processor import get_audio_embedding
                        md5 = await asyncio.get_event_loop().run_in_executor(None, get_md5, path)
                        embedding = await asyncio.get_event_loop().run_in_executor(
                            None, get_audio_embedding, path
                        )

                    elif ftype == "document":
                        from processors.document_processor import extract_text
                        md5 = await asyncio.get_event_loop().run_in_executor(None, get_md5, path)
                        text = await asyncio.get_event_loop().run_in_executor(None, extract_text, path)
                        if text and len(text.strip()) > 20:
                            embedding = await asyncio.get_event_loop().run_in_executor(
                                None, model_manager.get_text_embedding, text
                            )

                except Exception as e:
                    error = str(e)

                # Save to DB (upsert)
                emb_blob = pickle.dumps(embedding) if embedding is not None else None
                model_used = req.image_model if ftype in ("image", "video") else req.text_model

                async with AsyncSessionLocal() as db:
                    from sqlalchemy.dialects.sqlite import insert as sqlite_insert
                    stmt = sqlite_insert(ProcessedFile).values(
                        path=path,
                        file_type=ftype,
                        size=file_info["size"],
                        mtime=file_info["mtime"],
                        md5_hash=md5,
                        phash=phash,
                        embedding_model=model_used,
                        embedding=emb_blob,
                        error=error,
                    ).on_conflict_do_update(
                        index_elements=["path"],
                        set_=dict(
                            file_type=ftype,
                            size=file_info["size"],
                            mtime=file_info["mtime"],
                            md5_hash=md5,
                            phash=phash,
                            embedding_model=model_used,
                            embedding=emb_blob,
                            error=error,
                        )
                    )
                    await db.execute(stmt)
                    await db.commit()

                processed_data.append({
                    **file_info,
                    "md5_hash": md5,
                    "phash": phash,
                    "embedding": embedding,
                })

                processed += 1
                substep_processed += 1
                substep_elapsed = time.time() - substep_start_time
                substep_rate = substep_processed / substep_elapsed if substep_elapsed > 0 else 1
                substep_remaining = int((len(type_files) - substep_processed) / substep_rate) if substep_rate > 0 else 0

                scan_state.update({
                    "processed": processed,
                    "total_files": total,
                    "progress": int(processed / total * 100) if total > 0 else 0,
                    "substep_processed": substep_processed,
                    "current_file": os.path.basename(path),
                    "remaining": substep_remaining,
                })

                if substep_processed % 5 == 0 or substep_processed == len(type_files):
                    await broadcast({"type": "progress", **scan_state})

        # STEP 4: Compare
        scan_state.update({
            "status": "comparing",
            "step": "comparing",
            "message": "Comparing files...",
            "progress": 0,
            "substep_processed": 0,
            "substep_total": 0,
        })
        await broadcast({"type": "progress", **scan_state})

        compare_start = time.time()
        loop = asyncio.get_event_loop()

        def compare_progress(compared: int, total_cmp: int):
            elapsed_cmp = time.time() - compare_start
            rate_cmp = compared / elapsed_cmp if elapsed_cmp > 0 else 1
            rem_cmp = int((total_cmp - compared) / rate_cmp) if rate_cmp > 0 else 0
            scan_state.update({
                "substep_processed": compared,
                "substep_total": total_cmp,
                "progress": int(compared / total_cmp * 100) if total_cmp > 0 else 0,
                "remaining": rem_cmp,
            })
            # run_coroutine_threadsafe — правильный способ вызова корутины из другого потока
            asyncio.run_coroutine_threadsafe(
                broadcast({"type": "progress", **scan_state}),
                loop
            )

        groups = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: find_duplicates(
                processed_data,
                req.image_threshold,
                req.text_threshold,
                req.audio_threshold,
                req.video_threshold,
                progress_callback=compare_progress,
            ),
        )

        # Save groups to DB
        async with AsyncSessionLocal() as db:
            await db.execute(delete(DuplicateGroup))
            for group in groups:
                for file_entry in group["files"]:
                    db.add(DuplicateGroup(
                        group_id=group["group_id"],
                        file_path=file_entry["path"],
                        similarity=file_entry["similarity"],
                        match_type=group["match_type"],
                    ))
            await db.commit()

        scan_state = {
            "status": "done",
            "step": "done",
            "total_files": total,
            "processed": total,
            "groups_found": len(groups),
            "progress": 100,
        }
        await broadcast({"type": "scan_done", **scan_state})

    except asyncio.CancelledError:
        scan_state = {"status": "idle"}
    except Exception as e:
        scan_state = {"status": "error", "error": str(e)}
        await broadcast({"type": "scan_error", "error": str(e)})
        raise


# ─── Results ───────────────────────────────────────────────────────────────────

@app.get("/api/results")
async def get_results(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DuplicateGroup))
    rows = result.scalars().all()

    groups: Dict[str, dict] = {}
    for row in rows:
        if row.group_id not in groups:
            groups[row.group_id] = {
                "group_id": row.group_id,
                "match_type": row.match_type,
                "file_type": "",
                "files": [],
            }

        # Get file info
        file_result = await db.execute(
            select(ProcessedFile).where(ProcessedFile.path == row.file_path)
        )
        pf = file_result.scalar_one_or_none()

        file_info = {
            "path": row.file_path,
            "similarity": row.similarity,
            "exists": os.path.exists(row.file_path),
        }
        if pf:
            file_info.update({
                "file_type": pf.file_type,
                "size": pf.size,
                "name": os.path.basename(row.file_path),
            })
            if not groups[row.group_id]["file_type"]:
                groups[row.group_id]["file_type"] = pf.file_type

        groups[row.group_id]["files"].append(file_info)

    return list(groups.values())


# ─── File operations ───────────────────────────────────────────────────────────

class DeleteFileRequest(BaseModel):
    path: str


@app.post("/api/file/delete")
async def delete_file(req: DeleteFileRequest, db: AsyncSession = Depends(get_db)):
    if not os.path.exists(req.path):
        raise HTTPException(404, "File not found")
    os.remove(req.path)

    # Remove from DB
    await db.execute(delete(ProcessedFile).where(ProcessedFile.path == req.path))
    await db.execute(delete(DuplicateGroup).where(DuplicateGroup.file_path == req.path))
    await db.commit()

    return {"status": "deleted", "path": req.path}


def _find_bin(name: str) -> str:
    """Find ffmpeg/ffprobe binary, checking PATH and common install locations."""
    import shutil
    found = shutil.which(name)
    if found:
        return found
    candidates = [
        f"/opt/homebrew/bin/{name}",
        f"/usr/local/bin/{name}",
        f"/usr/bin/{name}",
    ]
    for c in candidates:
        if os.path.isfile(c):
            return c
    # Fallback: try imageio-ffmpeg bundled binary
    if name == "ffmpeg":
        try:
            import imageio_ffmpeg
            return imageio_ffmpeg.get_ffmpeg_exe()
        except Exception:
            pass
    raise FileNotFoundError(
        f"'{name}' not found. Install ffmpeg: brew install ffmpeg"
    )


@app.get("/api/file/preview")
async def get_preview(path: str):
    """Return base64 thumbnail for images and video."""
    import base64
    import subprocess
    import tempfile
    from io import BytesIO
    from PIL import Image

    if not os.path.exists(path):
        raise HTTPException(404, "File not found")

    ext = os.path.splitext(path)[1].lower()
    VIDEO_EXTS = {".mp4", ".mov", ".avi", ".mkv", ".wmv", ".flv", ".webm", ".m4v", ".3gp", ".ts", ".mts", ".m2ts", ".vob", ".ogv"}

    try:
        if ext in VIDEO_EXTS:
            # Extract frame at 5% duration (handles very short and very long videos)
            with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
                tmp_path = tmp.name
            try:
                # First get duration
                probe = subprocess.run(
                    [_find_bin("ffprobe"), "-v", "error", "-show_entries", "format=duration",
                     "-of", "default=noprint_wrappers=1:nokey=1", path],
                    capture_output=True, text=True, timeout=10
                )
                try:
                    duration = float(probe.stdout.strip())
                    seek = min(duration * 0.05, 5.0)  # 5% or max 5s
                except Exception:
                    seek = 0.0

                result = subprocess.run(
                    [_find_bin("ffmpeg"),
                     "-ss", str(seek),
                     "-i", path,
                     "-frames:v", "1",
                     "-q:v", "3",
                     "-vf", "scale=600:-2",
                     "-f", "image2",
                     tmp_path, "-y"],
                    capture_output=True, timeout=20
                )
                if os.path.exists(tmp_path) and os.path.getsize(tmp_path) > 100:
                    img = Image.open(tmp_path).convert("RGB")
                else:
                    raise Exception(f"ffmpeg failed: {result.stderr.decode()[-200:]}")
            finally:
                try:
                    os.remove(tmp_path)
                except Exception:
                    pass
        else:
            img = Image.open(path).convert("RGB")

        img.thumbnail((800, 800))
        buf = BytesIO()
        img.save(buf, format="JPEG", quality=82)
        encoded = base64.b64encode(buf.getvalue()).decode()
        return {"data": f"data:image/jpeg;base64,{encoded}"}
    except Exception as e:
        print(f"Preview error for {path}: {e}")
        raise HTTPException(500, str(e))


@app.post("/api/db/reset")
async def reset_database(db: AsyncSession = Depends(get_db)):
    await db.execute(delete(ProcessedFile))
    await db.execute(delete(DuplicateGroup))
    await db.commit()
    return {"status": "reset"}


# ─── WebSocket ─────────────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    active_ws.append(ws)
    try:
        # Send current state on connect
        await ws.send_json({"type": "state", **scan_state})
        while True:
            await ws.receive_text()  # keep alive
    except WebSocketDisconnect:
        pass
    finally:
        if ws in active_ws:
            active_ws.remove(ws)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8765)
