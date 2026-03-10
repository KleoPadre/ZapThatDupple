# Contributing to Zap that Dupple

Thank you for your interest in contributing!

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/zap-that-dupple`
3. Follow the [development setup](#development-setup) below
4. Create a branch: `git checkout -b feature/your-feature-name`
5. Make your changes
6. Submit a Pull Request

## Development Setup

### Prerequisites
- Python 3.11+
- Node.js 20+
- ffmpeg

### Install dependencies
```bash
bash install.sh
```

### Run in dev mode
```bash
# Terminal 1 — backend
cd backend && source venv/bin/activate && python main.py

# Terminal 2 — frontend
cd frontend && npm run dev
```

## Project Structure

```
zap-that-dupple/
├── backend/                 # Python FastAPI backend
│   ├── main.py              # API server, scan logic
│   ├── comparator.py        # Duplicate detection algorithm
│   ├── scanner.py           # File system walker
│   ├── ai/
│   │   └── model_manager.py # CLIP + sentence-transformers
│   ├── processors/
│   │   ├── image_processor.py
│   │   ├── video_processor.py
│   │   ├── audio_processor.py
│   │   └── document_processor.py
│   └── db/
│       ├── models.py        # SQLAlchemy models
│       └── database.py      # Async SQLite
└── frontend/                # Electron + React + TypeScript
    ├── electron/
    │   ├── main.ts          # Electron main process
    │   └── preload.ts       # IPC bridge
    └── src/
        ├── pages/           # Scan, Results, Models, Settings
        ├── components/      # Sidebar, ProgressBar
        ├── store/           # Zustand state
        └── utils/           # API client
```

## Pull Request Guidelines

- Keep PRs focused on a single change
- Add a clear description of what changed and why
- Test on macOS Apple Silicon before submitting
- Do not commit `node_modules/`, `venv/`, or built files

## Bug Reports

Please include:
- macOS / Windows version
- Python and Node.js versions
- Contents of `~/ZapThatDupple/app.log`
- Steps to reproduce
