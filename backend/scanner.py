import os
import unicodedata
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
    """Scan folders synchronously and return list of file info dicts.

    Поддерживает сетевые диски (SMB/NFS/AFP) на macOS:
    - followlinks=True: обходит mount points, которые могут быть symlink-ами
    - NFC-нормализация имён: SMB возвращает имена в NFD-кодировке
    - широкая обработка ошибок: логирует недоступные файлы вместо молчаливого пропуска
    """
    files = []
    for folder in folders:
        folder_path = Path(folder)
        if not folder_path.exists():
            continue
        # followlinks=True — необходим для сетевых дисков macOS (SMB/NFS),
        # которые монтируются как symlink в /Volumes/
        for root, dirs, fnames in os.walk(folder_path, followlinks=True):
            # Пропускаем скрытые директории
            dirs[:] = [d for d in dirs if not unicodedata.normalize("NFC", d).startswith(".")]
            for fname in fnames:
                # NFC-нормализация: SMB возвращает имена в NFD, что ломает startswith(".")
                fname_nfc = unicodedata.normalize("NFC", fname)
                if fname_nfc.startswith("."):
                    continue
                ext = Path(fname_nfc).suffix.lower()
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
                        "name": fname_nfc,
                    })
                except Exception as e:
                    # Логируем ошибку — важно для диагностики проблем с сетевыми дисками
                    print(f"[scanner] Skipping {full_path}: {e}")
    return files

