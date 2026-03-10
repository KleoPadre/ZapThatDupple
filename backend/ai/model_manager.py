import os
import sys
import numpy as np
from pathlib import Path
from typing import Optional, Callable
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
            "open_clip_name": "ViT-B-32",
            "open_clip_pretrained": "openai",
            "checkpoint_pattern": "ViT-B-32",
            "size_mb": 600,
            "type": "clip",
        },
        "clip-ViT-L-14": {
            "id": "clip-ViT-L-14",
            "name": "CLIP ViT-L/14",
            "description": "Максимальная точность. ~1.7GB. Рекомендуется для точного сравнения.",
            "open_clip_name": "ViT-L-14",
            "open_clip_pretrained": "openai",
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
            "hf_id": "sentence-transformers/all-MiniLM-L6-v2",
            "size_mb": 90,
            "type": "sentence_transformer",
        },
        "paraphrase-multilingual-mpnet": {
            "id": "paraphrase-multilingual-mpnet",
            "name": "Multilingual MPNet",
            "description": "50+ языков включая русский. ~970MB. Лучший для RU/EN документов.",
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
            "hf_id": None,
            "size_mb": 0,
            "type": "builtin",
        },
    },
}


def _find_clip_checkpoint(pattern: str) -> bool:
    """Search for open_clip checkpoint in all possible cache locations."""
    search_dirs = [
        TORCH_CACHE / "checkpoints",
        TORCH_CACHE / "hub" / "checkpoints",
        Path.home() / ".cache" / "torch" / "hub" / "checkpoints",
        Path.home() / ".cache" / "clip",
    ]
    for d in search_dirs:
        if not d.exists():
            continue
        for f in d.iterdir():
            if pattern.replace("-", "").lower() in f.name.replace("-", "").lower():
                if f.stat().st_size > 1024 * 1024:  # > 1MB = real file
                    return True
    return False


def _find_st_model(hf_id: str) -> bool:
    """Check if sentence_transformers model is cached."""
    slug = "models--" + hf_id.replace("/", "--")
    search_dirs = [
        HF_CACHE / slug,
        Path.home() / ".cache" / "huggingface" / "hub" / slug,
    ]
    return any(d.exists() for d in search_dirs)


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
        if meta.get("hf_id") is None:
            return True  # built-in

        if meta.get("type") == "clip":
            return _find_clip_checkpoint(meta["checkpoint_pattern"])

        return _find_st_model(meta["hf_id"])

    async def download_model(self, model_id: str, progress_cb: Optional[Callable] = None):
        all_models = {**AVAILABLE_MODELS["image"], **AVAILABLE_MODELS["text"], **AVAILABLE_MODELS["audio"]}
        if model_id not in all_models:
            raise ValueError(f"Unknown model: {model_id}")
        meta = all_models[model_id]
        if meta.get("hf_id") is None:
            return

        if progress_cb:
            await progress_cb({"status": "downloading", "model_id": model_id, "progress": 0})

        await asyncio.get_event_loop().run_in_executor(None, self._download_sync, model_id, meta)

        if progress_cb:
            await progress_cb({"status": "downloaded", "model_id": model_id, "progress": 100})

    def _download_sync(self, model_id: str, meta: dict):
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
        model, _, preprocess = open_clip.create_model_and_transforms(
            meta["open_clip_name"],
            pretrained=meta["open_clip_pretrained"],
            cache_dir=str(TORCH_CACHE / "checkpoints"),
        )
        model = model.to(self.device)
        model.eval()
        self._clip_model = model
        self._clip_preprocess = preprocess
        self._clip_model_id = model_id
        print(f"CLIP {model_id} loaded on {self.device}")

    def load_text_model(self, model_id: str = "all-MiniLM-L6-v2"):
        if self._text_model_id == model_id and self._text_model is not None:
            return

        from sentence_transformers import SentenceTransformer
        meta = AVAILABLE_MODELS["text"].get(model_id)
        if not meta:
            raise ValueError(f"Unknown text model: {model_id}")

        print(f"Loading text model {model_id}...")
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
            return features.cpu().float().numpy()[0]
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


model_manager = ModelManager()
