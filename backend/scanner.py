import os
import asyncio
from pathlib import Path
from typing import List, Dict, AsyncGenerator
from processors.image_processor import IMAGE_EXTENSIONS
from processors.video_processor import VIDEO_EXTENSIONS
from processors.document_processor import DOCUMENT_EXTENSIONS
from processors.audio_processor import AUDIO_EXTENSIONS

ALL_EXTENSIONS = IMAGE_EXTENSIONS | VIDEO_EXTENSIONS | DOCUMENT_EXTENSIONS | AUDIO_EXTENSIONS


def get_file_type(path: str) -> str:
    ext = Path(path).suffix.lower()
    if ext in IMAGE_EXTENSIONS:
        return "image"
    elif ext in VIDEO_EXTENSIONS:
        return "video"
    elif ext in AUDIO_EXTENSIONS:
        return "audio"
    elif ext in DOCUMENT_EXTENSIONS:
        return "document"
    return "unknown"


def scan_folders(folders: List[str]) -> List[Dict]:
    """Scan folders synchronously and return list of file info dicts."""
    files = []
    for folder in folders:
        folder_path = Path(folder)
        if not folder_path.exists():
            continue
        for root, dirs, fnames in os.walk(folder_path):
            # Skip hidden dirs
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            for fname in fnames:
                if fname.startswith("."):
                    continue
                ext = Path(fname).suffix.lower()
                if ext not in ALL_EXTENSIONS:
                    continue
                full_path = os.path.join(root, fname)
                try:
                    stat = os.stat(full_path)
                    files.append({
                        "path": full_path,
                        "size": stat.st_size,
                        "mtime": stat.st_mtime,
                        "file_type": get_file_type(full_path),
                        "name": fname,
                    })
                except OSError:
                    pass
    return files
