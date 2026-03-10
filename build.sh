#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "╔══════════════════════════════════════╗"
echo "║     ZapThatDupple — Build .app         ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── 1. Иконка ─────────────────────────────────────────────────────────────────
ICONSET="$SCRIPT_DIR/frontend/assets/AppIcon.iconset"
ICNS="$SCRIPT_DIR/frontend/assets/AppIcon.icns"
if [ -d "$ICONSET" ] && [ ! -f "$ICNS" ]; then
  echo "🎨 [0/4] Создание иконки .icns..."
  iconutil -c icns "$ICONSET" -o "$ICNS"
  echo "✅ AppIcon.icns создан"
fi

# ── 2. PyInstaller ────────────────────────────────────────────────────────────
echo "🐍 [1/4] Сборка Python backend..."
cd "$SCRIPT_DIR/backend"
source venv/bin/activate
pip install pyinstaller -q
rm -rf build dist backend_app.spec

pyinstaller \
  --onedir --name backend_app \
  --add-data "db:db" \
  --add-data "processors:processors" \
  --add-data "ai:ai" \
  --add-data "heif_support.py:." \
  --hidden-import=uvicorn.logging \
  --hidden-import=uvicorn.loops \
  --hidden-import=uvicorn.loops.auto \
  --hidden-import=uvicorn.protocols \
  --hidden-import=uvicorn.protocols.http \
  --hidden-import=uvicorn.protocols.http.auto \
  --hidden-import=uvicorn.protocols.websockets \
  --hidden-import=uvicorn.protocols.websockets.auto \
  --hidden-import=uvicorn.lifespan \
  --hidden-import=uvicorn.lifespan.on \
  --hidden-import=aiosqlite \
  --hidden-import=greenlet \
  --hidden-import=sqlalchemy.dialects.sqlite \
  --hidden-import=sqlalchemy.ext.asyncio \
  --hidden-import=pillow_heif \
  --collect-all=open_clip \
  --collect-all=sentence_transformers \
  --noconfirm --log-level WARN \
  main.py

deactivate
echo "✅ Backend собран"

# ── 3. Frontend ───────────────────────────────────────────────────────────────
echo "⚛️  [2/4] Сборка React frontend..."
cd "$SCRIPT_DIR/frontend"
npm run build:frontend
echo "✅ Frontend собран"

# ── 4. Electron compile ───────────────────────────────────────────────────────
echo "⚡ [3/4] Компиляция Electron..."
npx tsc -p tsconfig.electron.json
echo "✅ Electron скомпилирован"

# ── 5. Package .app ───────────────────────────────────────────────────────────
echo "📦 [4/4] Упаковка в .app / .dmg..."
npx electron-builder --mac --arm64

echo ""
echo "╔══════════════════════════════════════╗"
echo "║     Готово! 🎉                       ║"
echo "╠══════════════════════════════════════╣"
echo "║  Файл: frontend/release/*.dmg        ║"
echo "║  Откройте .dmg и перетащите в        ║"
echo "║  /Applications                       ║"
echo "╚══════════════════════════════════════╝"

open "$SCRIPT_DIR/frontend/release"
