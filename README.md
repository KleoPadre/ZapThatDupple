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
    <a href="#-using-the-app">Using the App</a> •
    <a href="#-troubleshooting">Troubleshooting</a> •
    <a href="#-license">License</a>
  </p>
</div>

---

## Screenshots
<div align="center">
<img width="756" height="506" alt="SCR-20260313-ogvf" src="https://github.com/user-attachments/assets/9705aee1-3989-4132-b361-7b60e7f78021" />

<img width="756" height="506" alt="SCR-20260311-lpou" src="https://github.com/user-attachments/assets/eeedf67b-877d-4b11-81d2-e6727fe014bc" />

<img width="756" height="506" alt="SCR-20260311-liiq" src="https://github.com/user-attachments/assets/123e2b27-bc4d-4512-8850-ef1719549bc8" />

<img width="756" height="506" alt="SCR-20260311-lirg" src="https://github.com/user-attachments/assets/75f55123-35fb-407c-873f-5b2621e9140d" />

<img width="756" height="506" alt="SCR-20260311-lish" src="https://github.com/user-attachments/assets/e8494139-0a14-42da-8473-edb78827aaae" />
</div>

---

## ✨ Features

- **AI semantic search** — finds duplicates even when files have different names, sizes, or formats (e.g. same photo saved as both JPG and HEIC)
- **Multi-format support** — images, video, audio, documents, all in one pass
- **HEIC/HEIF** — natively reads iPhone photos without conversion
- **Apple Silicon MPS** — CLIP and text models run on-device GPU via Metal Performance Shaders in float32 for reliable results
- **Three-pass algorithm** — MD5 exact match → perceptual hash → AI embeddings
- **Batched comparison** — similarity matrix computed in memory-efficient chunks; handles 16 000+ file collections without OOM crashes
- **SQLite cache** — re-scans skip already-processed files for instant results
- **Model update notifications** — checks for new model versions at startup and every hour; shows a badge in the sidebar and an Update button per model
- **Bulk selection & deletion** — check multiple duplicates across all file types and delete in one click
- **Video player** — click any video thumbnail to play it inline with seek bar, time display, and keyboard controls
- **Image lightbox** — full-screen preview for images
- **Non-destructive** — preview before deleting, Reveal in Finder/Explorer, no auto-delete
- **Multilingual UI** — Russian and English

### Supported Formats

| Type | Extensions |
|------|-----------|
| Images | jpg, jpeg, png, gif, bmp, tiff, webp, **heic, heif**, raw, cr2, nef, arw, avif |
| Video | mp4, mov, avi, mkv, wmv, flv, webm, m4v, 3gp, ts, mts, m2ts, vob, ogv |
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

> **Note:** `ffmpeg` is required for video thumbnail generation and preview. The app automatically locates it from Homebrew paths (`/opt/homebrew/bin`, `/usr/local/bin`) even if it's not in your shell `PATH`.

#### Install and run

```bash
git clone https://github.com/KleoPadre/ZapThatDupple.git
cd ZapThatDupple
bash install.sh
```

After installation, double-click **ZapThatDupple.command** to launch the app.

---

### Windows

#### Prerequisites

1. **Python 3.11+** — https://python.org/downloads (check "Add to PATH")
2. **Node.js 20+** — https://nodejs.org
3. **ffmpeg** — https://ffmpeg.org/download.html (add `bin/` folder to PATH)

Verify in PowerShell:
```powershell
python --version   # 3.11+
node --version     # v20+
ffmpeg -version
```

#### Install and run

```powershell
git clone https://github.com/KleoPadre/ZapThatDupple.git
cd ZapThatDupple
.\install.ps1
```

After installation, double-click **ZapThatDupple.bat** to launch.

> **Note:** Windows support is experimental. GPU acceleration via CUDA is supported if NVIDIA drivers are installed. Without GPU, the app runs on CPU which is slower.

> **ARM64 Windows (Snapdragon X / Surface Pro X):** The installer automatically installs the required Visual C++ ARM64 Redistributable if it is not already present. An internet connection is required during `install.ps1`.

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

Output: `frontend\release\Zap That Dupple.exe`

---

## 🤖 AI Models

Models are downloaded in-app via the **Models** tab. They are stored in `~/Zap that Dupple/models/`. No data is sent to external servers — all inference runs locally.

| Model | Size | Type | Use |
|-------|------|------|-----|
| CLIP ViT-B/32 | ~600 MB | Images & Video | Fast, good quality |
| CLIP ViT-L/14 | ~1.7 GB | Images & Video | Best accuracy |
| MiniLM-L6 | ~90 MB | Documents | English only |
| Multilingual MPNet | ~970 MB | Documents | Russian + English + 50 languages |
| Spectral Fingerprint | built-in | Audio | No download needed |

Models run locally using [open_clip](https://github.com/mlfoundations/open_clip) and [sentence-transformers](https://www.sbert.net/).

### Model Updates

The app checks HuggingFace Hub for model updates automatically at startup and once per hour. When a newer version is available:
- A yellow dot appears on the **Models** icon in the sidebar
- An "Update available" badge appears on the model card
- An **Update** button lets you download the new version in one click

You can also trigger an immediate check with the **Check for updates** button in the Models page header.

> **Note:** Update checks are lightweight — only metadata (~1 KB) is fetched, not weights. The check happens in the background and never blocks scanning.

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
| Images | 92% | Same photo, different compression/crop/format |
| Video | 90% | Same clip, different encoding |
| Audio | 97% | Same song, different bitrate |
| Documents | 90% | Same text content |

Results are grouped by similarity type:
- 🔴 **Exact** — byte-for-byte identical (MD5 match)
- 🟠 **Near** — visually/perceptually similar (phash)
- 🔵 **Semantic** — same content in different form (AI embeddings)

### Memory-efficient comparison

For large collections, computing a full N×N similarity matrix would require gigabytes of RAM (16 000 images → 2 GB), causing silent crashes with no results. The app instead computes similarity in batches of 500 rows at a time, keeping peak memory usage around 64 MB regardless of collection size.

### Apple Silicon notes

On MPS (Apple Silicon GPU), CLIP models are loaded in **float32** rather than float16. This is intentional: float16 on MPS silently produces NaN outputs for large ViT models, causing all similarity scores to evaluate to NaN and returning zero results. float32 is reliable and the performance difference is negligible for inference.

---

## 🖥 Using the App

### Scanning

1. Open the app and go to the **Scan** tab
2. Add one or more folders to scan
3. Select your preferred AI model in the **Models** tab (CLIP ViT-B/32 for speed, ViT-L/14 for accuracy)
4. Click **Find Duplicates** — progress is shown in real time with per-step timing
5. Subsequent scans are faster thanks to the SQLite cache (already-processed files are skipped)

> **Tip for large collections:** First scan of 10 000+ files over a network drive can take several hours since each file must be read and processed by the AI model. The cache makes all future scans instant. Keep the app open until you see the results screen — do not close it mid-scan.

### Reviewing Results

Results are grouped by duplicate cluster. For each group you can:

- **Preview images** — click any thumbnail to open a full-screen lightbox
- **Play videos** — click any video thumbnail to open the built-in video player with seek bar, time display, and play/pause controls (`Space` to toggle playback, `Escape` to close)
- **Reveal in Finder / Explorer** — click the path label under any file
- **Delete a single file** — click the trash icon on any card

### Bulk Deletion

1. Check the checkbox on each file you want to delete (appear on hover for image/video cards, always visible for audio/document cards)
2. A floating action bar appears at the bottom of the screen showing the number of selected files
3. Click **Delete selected** — a confirmation dialog lists all selected paths before anything is deleted
4. Confirm to permanently delete all selected files at once

> **Tip:** The app intentionally has no "select all in group" button — in a duplicate group you always want to keep at least one copy.

### Filtering

Use the filter bar at the top of Results to show only **Exact**, **Near**, or **Semantic** groups.

---

## 📁 Data Storage

All app data is stored locally in `~/Zap that Dupple/`:

```
~/Zap that Dupple/
├── dedupe.db          # SQLite cache of processed files and duplicate groups
├── models/            # Downloaded AI models
│   ├── torch_cache/   # CLIP models (open_clip)
│   └── hf_cache/      # sentence-transformers
├── settings.json      # User settings (thresholds, selected models, folders)
└── app.log            # Launch log (for debugging)
```

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| UI | Electron 33 + React 18 + TypeScript + Tailwind CSS + Zustand |
| Backend | Python 3.12 + FastAPI + WebSocket |
| Database | SQLite (async via aiosqlite + SQLAlchemy) |
| AI — Images/Video | [open_clip](https://github.com/mlfoundations/open_clip) (CLIP ViT, float32 on MPS) |
| AI — Documents | [sentence-transformers](https://www.sbert.net/) (offline mode during scan) |
| AI — Audio | librosa (mel-spectrogram + chroma + MFCC fingerprinting) |
| Similarity | Batched cosine similarity (500-row chunks, ~64 MB peak RAM) |
| Video thumbnails | ffmpeg / ffprobe (auto-located from PATH or Homebrew) |
| GPU | Apple MPS (Metal, float32) / CUDA (NVIDIA) / CPU fallback |
| Build | PyInstaller + electron-builder |

---

## 🐛 Troubleshooting

**App doesn't start**
```bash
cat "~/Zap that Dupple/app.log"
```

**No duplicates found despite them existing**

This can have several causes:

1. **Scan did not finish** — for large collections over a network drive, the first scan can take many hours. Check the log for `[comparator] DONE:` — if this line is missing, the scan is still running or was interrupted. Do not close the app mid-scan.

2. **Models were not downloaded** — go to the **Models** tab and download at least one image model (CLIP ViT-B/32 is recommended to start). Without a model, only MD5 exact duplicates are found.

3. **Stale None-embedding cache** — if you ran a scan before downloading models, None embeddings may have been cached. Use **Full Rescan** (toggle in the Scan tab) to clear the cache and recompute all embeddings.

4. **Threshold too high** — lower the similarity threshold in Settings (try 0.75–0.85 for images). The default 0.92 finds near-identical photos; lower values find more loosely similar images.

**Scan stuck on "Loading Models" for a long time**

The text model (`sentence-transformers`) can hang for minutes when it checks HuggingFace Hub for updates over a slow connection. This is fixed in the current version — models load from local cache only during scans. If you see this with an older build, upgrade to the latest version.

**Results page shows empty after scan completes**

If the app was closed immediately after the scan finished, the results may not have been displayed. Re-open the app and go to the **Results** tab — the data is persisted in SQLite and will still be there. Alternatively, run the scan again without **Full Rescan** — it will use the cache and re-run only the comparison step (takes seconds).

**Video thumbnails not loading / "ffprobe not found" error**

The app searches for `ffmpeg`/`ffprobe` in PATH, `/opt/homebrew/bin`, and `/usr/local/bin`. If still not found:
```bash
brew install ffmpeg
```
On Windows, make sure the `bin/` folder from your ffmpeg download is added to the system PATH.

**No preview for HEIC files**
```bash
cd ZapThatDupple/backend
source venv/bin/activate   # On Windows: venv\Scripts\activate
pip install pillow-heif
```

**Backend port already in use**
```bash
# macOS / Linux
pkill -f "python.*main.py"

# Windows
netstat -ano | findstr :8765
taskkill /PID <PID> /F
```

**Models not downloading**

Check internet connection. Models are downloaded from HuggingFace Hub (~90 MB – 1.7 GB depending on model). If behind a proxy, set `HTTPS_PROXY` in your environment before launching. Note: during scanning, the app intentionally disables HuggingFace network access to prevent hangs — model downloads only work via the **Models** tab download button.

**Re-scan doesn't pick up new files**

Use the **Full Rescan** toggle in the Scan tab to clear the cache and reprocess all files from scratch. Note that this will also delete the previous duplicate groups from the database.

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
