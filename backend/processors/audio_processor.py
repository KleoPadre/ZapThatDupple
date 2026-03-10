import warnings
import numpy as np
from pathlib import Path
from typing import Optional

warnings.filterwarnings("ignore", category=FutureWarning, module="librosa")
warnings.filterwarnings("ignore", category=UserWarning, module="librosa")

AUDIO_EXTENSIONS = {
    ".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a", ".wma",
    ".opus", ".aiff", ".aif", ".ape", ".alac",
}

N_MELS = 128
HOP_LENGTH = 512
N_FFT = 2048
SAMPLE_RATE = 22050
MAX_DURATION_SEC = 60  # analyze first 60 seconds


def get_audio_embedding(path: str) -> Optional[np.ndarray]:
    """
    Generates audio fingerprint based on mel-spectrogram features.
    Robust to bitrate changes — uses perceptual features.
    """
    try:
        import librosa
        import soundfile as sf

        y, sr = librosa.load(path, sr=SAMPLE_RATE, duration=MAX_DURATION_SEC, mono=True)
        if len(y) < 1000:
            return None

        # Mel spectrogram
        mel = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=N_MELS,
                                              hop_length=HOP_LENGTH, n_fft=N_FFT)
        mel_db = librosa.power_to_db(mel, ref=np.max)

        # Chroma features
        chroma = librosa.feature.chroma_stft(y=y, sr=sr, hop_length=HOP_LENGTH)

        # MFCCs (13 coefficients)
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13, hop_length=HOP_LENGTH)

        # Aggregate stats (mean + std) over time axis
        mel_feat = np.concatenate([mel_db.mean(axis=1), mel_db.std(axis=1)])
        chroma_feat = np.concatenate([chroma.mean(axis=1), chroma.std(axis=1)])
        mfcc_feat = np.concatenate([mfcc.mean(axis=1), mfcc.std(axis=1)])

        embedding = np.concatenate([mel_feat, chroma_feat, mfcc_feat])
        norm = np.linalg.norm(embedding)
        return embedding / (norm + 1e-8)

    except Exception as e:
        print(f"Audio embedding error {path}: {e}")
        return None


def audio_similarity(emb1: np.ndarray, emb2: np.ndarray) -> float:
    if emb1 is None or emb2 is None:
        return 0.0
    return float(np.dot(emb1, emb2) / (np.linalg.norm(emb1) * np.linalg.norm(emb2) + 1e-8))
