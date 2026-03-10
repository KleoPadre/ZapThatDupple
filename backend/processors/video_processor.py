import subprocess
import tempfile
import os
import numpy as np
from pathlib import Path
from typing import List, Optional

VIDEO_EXTENSIONS = {
    ".mp4", ".mov", ".avi", ".mkv", ".wmv", ".flv", ".webm",
    ".m4v", ".3gp", ".ogv", ".ts", ".mts", ".m2ts", ".vob",
}

MAX_FRAMES_PER_VIDEO = 10  # configurable


def extract_keyframes(video_path: str, num_frames: int = MAX_FRAMES_PER_VIDEO) -> List[str]:
    """Extract evenly spaced frames from video using ffmpeg. Returns list of temp file paths."""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", video_path],
            capture_output=True, text=True, timeout=30
        )
        duration = float(result.stdout.strip())
    except Exception:
        duration = 60.0  # fallback

    tmpdir = tempfile.mkdtemp(prefix="dedupe_frames_")
    frame_paths = []

    interval = max(duration / (num_frames + 1), 0.5)
    timestamps = [interval * (i + 1) for i in range(num_frames) if interval * (i + 1) < duration]

    for i, ts in enumerate(timestamps[:num_frames]):
        out_path = os.path.join(tmpdir, f"frame_{i:03d}.jpg")
        try:
            subprocess.run(
                ["ffmpeg", "-ss", str(ts), "-i", video_path,
                 "-frames:v", "1", "-q:v", "3", out_path, "-y"],
                capture_output=True, timeout=15
            )
            if os.path.exists(out_path):
                frame_paths.append(out_path)
        except Exception:
            pass

    return frame_paths


def get_video_embedding(video_path: str, model_manager, num_frames: int = MAX_FRAMES_PER_VIDEO) -> Optional[np.ndarray]:
    """Extract frames and average CLIP embeddings."""
    frame_paths = extract_keyframes(video_path, num_frames)
    if not frame_paths:
        return None

    embeddings = []
    for fp in frame_paths:
        emb = model_manager.get_image_embedding(fp)
        if emb is not None:
            embeddings.append(emb)
        try:
            os.remove(fp)
        except Exception:
            pass

    if not embeddings:
        return None

    avg = np.mean(embeddings, axis=0)
    norm = np.linalg.norm(avg)
    return avg / (norm + 1e-8)


def video_similarity(emb1: np.ndarray, emb2: np.ndarray) -> float:
    if emb1 is None or emb2 is None:
        return 0.0
    return float(np.dot(emb1, emb2))
