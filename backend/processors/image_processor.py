import hashlib
import numpy as np
from pathlib import Path
from typing import Optional
import imagehash
from PIL import Image

# Register HEIC/HEIF support
try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    pass

IMAGE_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".tif",
    ".webp", ".heic", ".heif", ".raw", ".cr2", ".nef", ".arw",
    ".svg", ".ico", ".avif",
}


def get_image_phash(path: str) -> Optional[str]:
    try:
        img = Image.open(path).convert("RGB")
        return str(imagehash.phash(img))
    except Exception:
        return None


def get_md5(path: str) -> Optional[str]:
    try:
        h = hashlib.md5()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                h.update(chunk)
        return h.hexdigest()
    except Exception:
        return None


def phash_distance(h1: str, h2: str) -> float:
    """Returns similarity 0.0-1.0 (1.0 = identical)"""
    try:
        d = imagehash.hex_to_hash(h1) - imagehash.hex_to_hash(h2)
        return 1.0 - d / 64.0
    except Exception:
        return 0.0


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    if a is None or b is None:
        return 0.0
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-8))
