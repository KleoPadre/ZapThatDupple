<div align="center">
  <img src="frontend/assets/icon.png" width="128" height="128" alt="Zap that Dupple icon" />
  <h1>Zap that Dupple</h1>
  <p><strong>AI-powered duplicate file finder for macOS and Windows</strong></p>

  <p>
    <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-blue" alt="Platform" />
    <img src="https://img.shields.io/badge/Apple%20Silicon-M1%2FM2%2FM3%2FM4%2FM5-brightgreen" alt="Apple Silicon" />
    <img src="https://img.shields.io/badge/license-BSL%201.1-orange" alt="License" />
    <img src="https://img.shields.io/badge/python-3.11%2B-blue" alt="Python" />
    <img src="https://img.shields.io/badge/node-20%2B-green" alt="Node" />
  </p>

  <p>
    <a href="#-features">Features</a> •
    <a href="#-installation">Installation</a> •
    <a href="#-building">Building</a> •
    <a href="#-ai-models">AI Models</a> •
    <a href="#-how-it-works">How it works</a> •
    <a href="#-license">License</a>
  </p>
</div>

---

## Screenshots

<!-- MAIN SCAN WINDOW -->
![Снимок экрана 2026-03-10 в 13 15 40](https://github.com/user-attachments/assets/cd05ee0f-5fbe-4f62-a299-0e04461d8ad7)

![Снимок экрана 2026-03-10 в 13 17 23](https://github.com/user-attachments/assets/065671c4-3b2e-4e2b-9c8f-8426be7cc8b1)
<!-- ![Scan](docs/screenshots/scan.png) -->

<!-- RESULTS - IMAGES -->
<img width="756" height="506" alt="SCR-20260310-mezm" src="https://github.com/user-attachments/assets/14eb1c29-4ec2-48fa-a189-9615d8621c79" />

![Снимок экрана 2026-03-10 в 13 42 38](https://github.com/user-attachments/assets/19555a3e-a549-4390-a423-bb45d21a3171)
<!-- ![Results - Images](docs/screenshots/results-images.png) -->

<!-- RESULTS - AUDIO -->
<img width="756" height="506" alt="SCR-20260310-mfsc" src="https://github.com/user-attachments/assets/79cd94ef-6a36-4ed4-9b78-e5b2209880c6" />
<!-- ![Results - Audio](docs/screenshots/results-audio.png) -->

<!-- SETTINGS -->
![Снимок экрана 2026-03-10 в 13 16 01](https://github.com/user-attachments/assets/9c85019f-d750-43b4-9ace-3797b23423d8)



<!-- ![Settings](docs/screenshots/settings.png) -->

---

## ✨ Features

- **AI semantic search** — finds duplicates even when files have different names, sizes, or quality
- **Multi-format support** — images, video, audio, documents, all in one pass
- **HEIC/HEIF** — natively reads iPhone photos without conversion
- **Apple Silicon MPS** — CLIP and text models run on-device GPU via Metal Performance Shaders
- **Three-pass algorithm** — MD5 exact match → perceptual hash → AI embeddings
- **SQLite cache** — re-scans skip already-processed files for instant results
- **Non-destructive** — preview before deleting, Reveal in Finder, no auto-delete
- **Multilingual UI** — Russian and English

### Supported Formats

| Type | Extensions |
|------|-----------|
| Images | jpg, jpeg, png, gif, bmp, tiff, webp, **heic, heif**, raw, cr2, nef, arw, avif |
| Video | mp4, mov, avi, mkv, wmv, flv, webm, m4v, 3gp, ts, mts |
| Audio | mp3, wav, flac, aac, ogg, m4a, wma, opus, aiff, ape |
| Documents | pdf, doc, docx, xls, xlsx, ppt, pptx, txt, md, rtf, csv, html |

---

## 🚀 Installation

### macOS (Apple Silicon — M1/M2/M3/M4/M5)

#### Prerequisites

```bash
# Install Homebrew (if not installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install required tools
brew install python@3.12 node ffmpeg
```

#### Install and run

```bash
git clone https://github.com/YOUR_USERNAME/zap-that-dupple.git
cd zap-that-dupple
bash install.sh
```

After installation, double-click **ZapThatDupple.command** to launch the app.

---

### Windows

#### Prerequisites

1. **Python 3.11+** — https://python.org/downloads (check "Add to PATH")
2. **Node.js 20+** — https://nodejs.org
3. **ffmpeg** — https://ffmpeg.org/download.html (add to PATH)

Verify in PowerShell:
```powershell
python --version   # 3.11+
node --version     # v20+
ffmpeg -version
```

#### Install and run

```powershell
git clone https://github.com/YOUR_USERNAME/zap-that-dupple.git
cd zap-that-dupple
.\install.ps1
```

After installation, double-click **ZapThatDupple.bat** to launch.

> **Note:** Windows support is experimental. GPU acceleration via CUDA is supported if NVIDIA drivers are installed. Without GPU, the app runs on CPU which is slower.

---

## 🔨 Building

### macOS — build .app / .dmg

```bash
bash build.sh
```

Output: `frontend/release/ZapThatDupple-1.0.0-arm64.dmg`

Open the `.dmg` and drag **Zap that Dupple** to `/Applications`.

The icon will be built automatically from `frontend/assets/AppIcon.iconset/`.

### Windows — build .exe / installer

```powershell
.\build.ps1
```

Output: `frontend\release\ZapThatDupple Setup 1.0.0.exe`

---

## 🤖 AI Models

Models are downloaded in-app via the **Models** tab. They are stored in `~/ZapThatDupple/models/`.

| Model | Size | Type | Use |
|-------|------|------|-----|
| CLIP ViT-B/32 | ~600 MB | Images & Video | Fast, good quality |
| CLIP ViT-L/14 | ~1.7 GB | Images & Video | Best accuracy |
| MiniLM-L6 | ~90 MB | Documents | English only |
| Multilingual MPNet | ~970 MB | Documents | Russian + English + 50 languages |
| Spectral Fingerprint | built-in | Audio | No download needed |

Models are loaded on-device using [open_clip](https://github.com/mlfoundations/open_clip) and [sentence-transformers](https://www.sbert.net/). No data is sent to external servers.

---

## ⚙️ How It Works

Duplicate detection runs in three passes per file type:

```
1. MD5 exact match
      ↓ remaining files
2. Perceptual hash (images only, phash)
      ↓ remaining files  
3. AI embedding cosine similarity
   • Images/Video → CLIP ViT (visual features)
   • Documents    → sentence-transformers (semantic text)
   • Audio        → mel-spectrogram + chroma + MFCC fingerprint
```

**Similarity thresholds** (configurable in Settings):

| Type | Default | Meaning |
|------|---------|---------|
| Images | 92% | Same photo, different compression/crop |
| Video | 90% | Same clip, different encoding |
| Audio | 97% | Same song, different bitrate |
| Documents | 90% | Same text content |

---

## 📁 Data Storage

All app data is stored locally in `~/ZapThatDupple/`:

```
~/ZapThatDupple/
├── dedupe.db          # SQLite cache of processed files
├── models/            # Downloaded AI models
│   ├── torch_cache/   # CLIP models (open_clip)
│   └── hf_cache/      # sentence-transformers
├── settings.json      # User settings
└── app.log            # Launch log (for debugging)
```

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| UI | Electron 33 + React 18 + TypeScript + Tailwind CSS |
| Backend | Python 3.12 + FastAPI + WebSocket |
| Database | SQLite (async via aiosqlite + SQLAlchemy) |
| AI — Images/Video | [open_clip](https://github.com/mlfoundations/open_clip) (CLIP) |
| AI — Documents | [sentence-transformers](https://www.sbert.net/) |
| AI — Audio | librosa (spectral fingerprinting) |
| GPU | Apple MPS (Metal) / CUDA (NVIDIA) / CPU fallback |
| Build | PyInstaller + electron-builder |

---

## 🐛 Troubleshooting

**App doesn't start**
Check the log: `cat ~/ZapThatDupple/app.log`

**No preview for HEIC files**
```bash
cd zap-that-dupple/backend
source venv/bin/activate
pip install pillow-heif
```

**Backend port already in use**
```bash
pkill -f "python.*main.py"
```

**Models not downloading**
Check internet connection. Models are downloaded from HuggingFace Hub (~90 MB – 1.7 GB depending on model).

---

## 📄 License

**Business Source License 1.1** — free for non-commercial use.

- ✅ Personal use
- ✅ Education and research  
- ✅ Open-source projects
- ❌ Commercial use (requires a separate license)

On **January 1, 2030** this project converts to the **MIT License**.

See [LICENSE](LICENSE) for full terms.

---

## 🤝 Contributing

Pull requests are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

<div align="center">
  Made with ❤️ for people who have too many files
</div>
