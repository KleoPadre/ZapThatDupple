# Changelog

All notable changes to Zap that Dupple will be documented here.

## [1.0.0] — 2026-03-10

### Initial release

- AI-powered duplicate detection for images, video, audio, documents
- CLIP ViT-B/32 and ViT-L/14 for image/video similarity
- sentence-transformers for document similarity (English + multilingual)
- Spectral fingerprinting for audio (bitrate-invariant)
- HEIC/HEIF support for iPhone photos
- Three-pass algorithm: MD5 → perceptual hash → AI embeddings
- SQLite cache for fast re-scans
- Real-time progress via WebSocket
- Full-screen preview lightbox
- Reveal in Finder / Explorer
- Russian and English UI
- Apple Silicon MPS acceleration
- macOS .dmg build via electron-builder
