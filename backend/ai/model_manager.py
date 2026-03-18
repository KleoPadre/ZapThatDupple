import os
import sys
import numpy as np
from pathlib import Path
from typing import Optional, Callable, Dict
import asyncio
import torch

# Register HEIC support before any PIL usage
sys.path.insert(0, str(Path(__file__).parent.parent))
try:
    import heif_support  # noqa
except Exception:
    pass

APP_DIR = Path.home() / "Zap that Dupple"
MODELS_DIR = APP_DIR / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

# Направить ВСЕ кэши в нашу папку
TORCH_CACHE = MODELS_DIR / "torch_cache"
HF_CACHE = MODELS_DIR / "hf_cache"
TORCH_CACHE.mkdir(parents=True, exist_ok=True)
HF_CACHE.mkdir(parents=True, exist_ok=True)

os.environ["HF_HOME"] = str(HF_CACHE)
os.environ["HUGGINGFACE_HUB_CACHE"] = str(HF_CACHE)
os.environ["TORCH_HOME"] = str(TORCH_CACHE)
# Это ключевая переменная для torch.hub — именно сюда open_clip кладёт файлы
os.environ["TORCH_HUB"] = str(TORCH_CACHE)


def get_device():
    if torch.backends.mps.is_available():
        return torch.device("mps")
    elif torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


AVAILABLE_MODELS = {
    "image": {
        "clip-ViT-B-32": {
            "id": "clip-ViT-B-32",
            "name": "CLIP ViT-B/32",
            "description": "Быстрая лёгкая модель. ~600MB. Хорошо для большинства случаев.",
            "description_en": "Fast lightweight model. ~600MB. Works well for most cases.",
            "open_clip_name": "ViT-B-32",
            "open_clip_pretrained": "openai",
            # open_clip stores as HF dir: models--timm--vit_base_patch32_clip_224.openai
            "checkpoint_dir_pattern": "vit_base_patch32",
            "checkpoint_pattern": "ViT-B-32",
            "size_mb": 600,
            "type": "clip",
        },
        "clip-ViT-L-14": {
            "id": "clip-ViT-L-14",
            "name": "CLIP ViT-L/14",
            "description": "Максимальная точность. ~1.7GB. Рекомендуется для точного сравнения.",
            "description_en": "Maximum accuracy. ~1.7GB. Recommended for precise comparison.",
            "open_clip_name": "ViT-L-14",
            "open_clip_pretrained": "openai",
            # open_clip stores as HF dir: models--timm--vit_large_patch14_clip_224.openai
            "checkpoint_dir_pattern": "vit_large_patch14",
            "checkpoint_pattern": "ViT-L-14",
            "size_mb": 1700,
            "type": "clip",
        },
    },
    "text": {
        "all-MiniLM-L6-v2": {
            "id": "all-MiniLM-L6-v2",
            "name": "MiniLM-L6",
            "description": "Быстрые текстовые эмбеддинги. ~90MB. Английский язык.",
            "description_en": "Fast text embeddings. ~90MB. English language.",
            "hf_id": "sentence-transformers/all-MiniLM-L6-v2",
            "size_mb": 90,
            "type": "sentence_transformer",
        },
        "paraphrase-multilingual-mpnet": {
            "id": "paraphrase-multilingual-mpnet",
            "name": "Multilingual MPNet",
            "description": "50+ языков включая русский. ~970MB. Лучший для RU/EN документов.",
            "description_en": "50+ languages including Russian. ~970MB. Best for RU/EN documents.",
            "hf_id": "sentence-transformers/paraphrase-multilingual-mpnet-base-v2",
            "size_mb": 970,
            "type": "sentence_transformer",
        },
    },
    "audio": {
        "builtin-spectral": {
            "id": "builtin-spectral",
            "name": "Spectral Fingerprint",
            "description": "Встроенный аудио-fingerprint. Не требует загрузки. Работает с разным битрейтом.",
            "description_en": "Built-in audio fingerprint. No download required. Works with different bitrates.",
            "hf_id": None,
            "size_mb": 0,
            "type": "builtin",
        },
    },
}


def _find_clip_checkpoint(pattern: str, dir_pattern: str = "") -> bool:
    """
    Search for open_clip checkpoint in app dir.
    open_clip (>=2.20) stores models as HF-style directories:
      torch_cache/checkpoints/models--timm--vit_base_patch32_clip_224.openai/blobs/<hash>
    We match the directory name and look for large files inside.
    """
    search_dirs = [
        TORCH_CACHE / "checkpoints",
        TORCH_CACHE / "hub" / "checkpoints",
    ]
    for base in search_dirs:
        if not base.exists():
            continue
        for entry in base.iterdir():
            # Match HF-style directory (e.g. models--timm--vit_base_patch32_clip_224.openai)
            if entry.is_dir():
                entry_name = entry.name.lower().replace("-", "").replace("_", "")
                # Match by dir_pattern (preferred) or old pattern
                match_str = dir_pattern.lower().replace("-", "").replace("_", "") if dir_pattern else pattern.lower().replace("-", "")
                if match_str in entry_name:
                    # Check for large files inside (blobs/ or snapshots/)
                    for f in entry.rglob("*"):
                        if f.is_file():
                            try:
                                if f.stat().st_size > 50 * 1024 * 1024:
                                    return True
                            except Exception:
                                pass
            # Also handle plain .pt files (older open_clip)
            elif entry.is_file():
                if pattern.replace("-", "").lower() in entry.name.replace("-", "").lower():
                    try:
                        if entry.stat().st_size > 1024 * 1024:
                            return True
                    except Exception:
                        pass
    return False


def _find_st_model(hf_id: str) -> bool:
    """
    Check if HuggingFace model is fully downloaded.
    HF Hub stores actual weights in blobs/ directory (no extension).
    snapshots/ contains symlinks → unreliable for size checks.
    We check blobs/ for files > 50MB (model weights are always large).
    """
    slug = "models--" + hf_id.replace("/", "--")
    model_dir = HF_CACHE / slug
    if not model_dir.exists():
        return False
    # Primary: check blobs/ directory (actual file content, no extensions)
    blobs_dir = model_dir / "blobs"
    if blobs_dir.exists():
        try:
            large_blobs = [
                f for f in blobs_dir.iterdir()
                if f.is_file() and f.stat().st_size > 50 * 1024 * 1024  # > 50MB
            ]
            if large_blobs:
                return True
        except Exception:
            pass
    # Fallback: check snapshots for actual files (resolving symlinks)
    snapshots_dir = model_dir / "snapshots"
    if snapshots_dir.exists():
        try:
            for snap in snapshots_dir.iterdir():
                if not snap.is_dir():
                    continue
                for ext in ("*.safetensors", "*.bin", "*.pt"):
                    for f in snap.glob(ext):
                        try:
                            # resolve() follows symlinks to get real size
                            real = f.resolve()
                            if real.exists() and real.stat().st_size > 50 * 1024 * 1024:
                                return True
                        except Exception:
                            pass
        except Exception:
            pass
    return False


def _migrate_system_cache():
    """
    One-time migration: move models from system cache (~/.cache) to app dir.
    Called at startup so models downloaded before path fix are not lost.
    """
    import shutil

    # CLIP / torch models
    sys_torch = Path.home() / ".cache" / "torch" / "hub" / "checkpoints"
    app_ckpt = TORCH_CACHE / "checkpoints"
    if sys_torch.exists():
        moved = False
        for f in sys_torch.iterdir():
            if f.suffix in (".pt", ".bin", ".pth") and f.stat().st_size > 1024 * 1024:
                app_ckpt.mkdir(parents=True, exist_ok=True)
                dest = app_ckpt / f.name
                if not dest.exists():
                    print(f"[migrate] Moving {f.name} → app cache")
                    shutil.move(str(f), str(dest))
                    moved = True
        if moved:
            print("[migrate] CLIP models moved to app cache")

    # HuggingFace models
    sys_hf = Path.home() / ".cache" / "huggingface" / "hub"
    if sys_hf.exists():
        for d in sys_hf.iterdir():
            if d.name.startswith("models--sentence-transformers"):
                dest = HF_CACHE / d.name
                if not dest.exists():
                    HF_CACHE.mkdir(parents=True, exist_ok=True)
                    print(f"[migrate] Moving {d.name} → app cache")
                    shutil.move(str(d), str(dest))


class ModelManager:
    def __init__(self):
        self._clip_model = None
        self._clip_preprocess = None
        self._clip_model_id = None
        self._text_model = None
        self._text_model_id = None
        self.device = get_device()

    def is_model_downloaded(self, model_id: str) -> bool:
        all_models = {**AVAILABLE_MODELS["image"], **AVAILABLE_MODELS["text"], **AVAILABLE_MODELS["audio"]}
        meta = all_models.get(model_id)
        if not meta:
            return False
        # Only truly built-in models (no download needed)
        if meta.get("type") == "builtin":
            return True

        if meta.get("type") == "clip":
            return _find_clip_checkpoint(
                meta["checkpoint_pattern"],
                meta.get("checkpoint_dir_pattern", "")
            )

        # sentence_transformer
        hf_id = meta.get("hf_id")
        if not hf_id:
            return False
        return _find_st_model(hf_id)

    async def download_model(self, model_id: str, progress_cb: Optional[Callable] = None):
        all_models = {**AVAILABLE_MODELS["image"], **AVAILABLE_MODELS["text"], **AVAILABLE_MODELS["audio"]}
        if model_id not in all_models:
            raise ValueError(f"Unknown model: {model_id}")
        meta = all_models[model_id]
        if meta.get("type") == "builtin":
            return

        if progress_cb:
            await progress_cb({"status": "downloading", "model_id": model_id, "progress": 0})

        await asyncio.get_event_loop().run_in_executor(None, self._download_sync, model_id, meta)

        if progress_cb:
            # Send both "downloaded" and updated downloaded status so frontend stops spinner
            await progress_cb({
                "status": "downloaded",
                "model_id": model_id,
                "progress": 100,
                "is_downloaded": True,
            })

    def _download_sync(self, model_id: str, meta: dict):
        # При скачивании сбрасываем offline-режим — иначе HF не сможет скачать модель
        os.environ.pop("TRANSFORMERS_OFFLINE", None)
        os.environ.pop("HF_DATASETS_OFFLINE", None)

        if meta["type"] == "clip":
            import open_clip
            print(f"Downloading {meta['open_clip_name']} via open_clip...")
            # Force torch.hub to use our directory
            torch.hub.set_dir(str(TORCH_CACHE))
            model, _, _ = open_clip.create_model_and_transforms(
                meta["open_clip_name"],
                pretrained=meta["open_clip_pretrained"],
                cache_dir=str(TORCH_CACHE / "checkpoints"),
            )
            del model
            torch.mps.empty_cache() if torch.backends.mps.is_available() else None
            print(f"Downloaded {model_id}")
        else:
            from sentence_transformers import SentenceTransformer
            print(f"Downloading {meta['hf_id']} via sentence_transformers...")
            SentenceTransformer(meta["hf_id"], cache_folder=str(HF_CACHE))
            print(f"Downloaded {model_id}")

    def load_clip(self, model_id: str = "clip-ViT-B-32"):
        if self._clip_model_id == model_id and self._clip_model is not None:
            return

        import open_clip
        meta = AVAILABLE_MODELS["image"].get(model_id)
        if not meta:
            raise ValueError(f"Unknown CLIP model: {model_id}")

        print(f"Loading CLIP {model_id} on {self.device}...")
        torch.hub.set_dir(str(TORCH_CACHE))

        # CRITICAL: force_quick_gelu=True — OpenAI CLIP models were trained with
        # QuickGELU activation. Newer open_clip versions default to GELU (quick_gelu=False),
        # which produces wrong embeddings for openai-pretrained models. Without this flag
        # the model silently produces a distorted embedding space where cosine similarity
        # between semantically similar images falls far below expected thresholds.
        #
        # Также отключаем сетевые запросы HuggingFace — open_clip при загрузке может
        # обращаться к сети для проверки обновлений, что зависает на медленном соединении.
        os.environ["TRANSFORMERS_OFFLINE"] = "1"
        os.environ["HF_DATASETS_OFFLINE"] = "1"

        model, _, preprocess = open_clip.create_model_and_transforms(
            meta["open_clip_name"],
            pretrained=meta["open_clip_pretrained"],
            cache_dir=str(TORCH_CACHE / "checkpoints"),
            force_quick_gelu=True,
        )

        # CRITICAL: MPS (Apple Silicon GPU) has known float16 precision bugs for large
        # ViT models (e.g. ViT-L/14). The model loads and runs without errors, but
        # encode_image() silently returns NaN tensors. Embeddings appear non-None,
        # but all cosine similarities evaluate to NaN, which is always < threshold,
        # so zero duplicate groups are found despite the model "working".
        # Forcing float32 fixes this completely.
        if self.device.type in ("mps", "cpu"):
            model = model.float()  # force fp32 — MPS fp16 is unreliable for large ViTs

        model = model.to(self.device)
        model.eval()
        self._clip_model = model
        self._clip_preprocess = preprocess
        self._clip_model_id = model_id
        print(f"CLIP {model_id} loaded on {self.device} (fp32)")

    def load_text_model(self, model_id: str = "all-MiniLM-L6-v2"):
        if self._text_model_id == model_id and self._text_model is not None:
            return

        from sentence_transformers import SentenceTransformer
        meta = AVAILABLE_MODELS["text"].get(model_id)
        if not meta:
            raise ValueError(f"Unknown text model: {model_id}")

        print(f"Loading text model {model_id}...")

        # CRITICAL: без TRANSFORMERS_OFFLINE sentence-transformers при каждой загрузке
        # делает HTTP-запрос к HuggingFace для проверки обновлений. На медленном или
        # нестабильном соединении (SMB-диски, VPN, слабый WiFi) это зависает на десятки
        # минут — весь скан стоит на стадии loading_models, пользователь думает что
        # программа зависла и останавливает скан. Результат: 0 найденных групп.
        # Решение: offline=True загружает только из локального кэша.
        os.environ["TRANSFORMERS_OFFLINE"] = "1"
        os.environ["HF_DATASETS_OFFLINE"] = "1"

        self._text_model = SentenceTransformer(
            meta["hf_id"],
            device=str(self.device),
            cache_folder=str(HF_CACHE),
        )
        self._text_model_id = model_id
        print(f"Text model {model_id} loaded")

    @torch.no_grad()
    def get_image_embedding(self, image_path: str) -> Optional[np.ndarray]:
        if self._clip_model is None:
            return None
        from PIL import Image
        try:
            image = Image.open(image_path).convert("RGB")
            tensor = self._clip_preprocess(image).unsqueeze(0).to(self.device)
            features = self._clip_model.encode_image(tensor)
            features = features / features.norm(dim=-1, keepdim=True)
            result = features.cpu().float().numpy()[0]
            # Guard against MPS/CUDA silent NaN — NaN embeddings look valid (non-None)
            # but sk_cosine returns NaN similarities, so nothing is ever found.
            if np.isnan(result).any() or np.isinf(result).any():
                print(f"[warn] NaN/Inf embedding for {image_path} — returning None")
                return None
            return result
        except Exception as e:
            print(f"Image embedding error {image_path}: {e}")
            return None

    @torch.no_grad()
    def get_text_embedding(self, text: str) -> Optional[np.ndarray]:
        if self._text_model is None:
            return None
        try:
            emb = self._text_model.encode(text, normalize_embeddings=True)
            return emb
        except Exception as e:
            print(f"Text embedding error: {e}")
            return None

    def unload_all(self):
        self._clip_model = None
        self._clip_preprocess = None
        self._text_model = None
        self._clip_model_id = None
        self._text_model_id = None
        if torch.backends.mps.is_available():
            torch.mps.empty_cache()

    def check_for_updates(self) -> Dict[str, bool]:
        """
        Проверяет наличие обновлений для скачанных моделей.
        Возвращает {model_id: True} если для модели есть обновление.

        Проверяет только HuggingFace модели (text). Для CLIP (torch hub)
        проверка не производится — у них нет стандартного механизма версий.

        Использует лёгкий запрос к HF API (только метаданные, не веса).
        Таймаут 5 сек — не блокирует запуск.
        """
        updates: Dict[str, bool] = {}
        all_models = {**AVAILABLE_MODELS["text"]}  # только HF-модели

        for model_id, meta in all_models.items():
            hf_id = meta.get("hf_id")
            if not hf_id:
                continue
            if not self.is_model_downloaded(model_id):
                continue  # не скачана — обновление не нужно

            try:
                # Читаем локальный SHA из кэша HF Hub
                slug = "models--" + hf_id.replace("/", "--")
                refs_file = HF_CACHE / slug / "refs" / "main"
                if not refs_file.exists():
                    continue
                local_sha = refs_file.read_text().strip()

                # Запрашиваем актуальный SHA с HF API (только метаданные, ~1 КБ)
                # Временно снимаем offline-режим для этого запроса
                old_offline = os.environ.pop("TRANSFORMERS_OFFLINE", None)
                try:
                    from huggingface_hub import model_info
                    info = model_info(hf_id, timeout=5)
                    remote_sha = info.sha
                finally:
                    if old_offline is not None:
                        os.environ["TRANSFORMERS_OFFLINE"] = old_offline

                if remote_sha and local_sha and remote_sha != local_sha:
                    updates[model_id] = True
                    print(f"[update] {model_id}: {local_sha[:8]} → {remote_sha[:8]}")
                else:
                    updates[model_id] = False

            except Exception as e:
                # Нет сети или другая ошибка — тихо игнорируем
                print(f"[update check] {model_id}: {e}")

        return updates


model_manager = ModelManager()
