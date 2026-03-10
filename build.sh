#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Zap that Dupple — Build .app ==="
echo ""

# ── 1. Icon ───────────────────────────────────────────────────────────────────
ICONSET="$SCRIPT_DIR/frontend/assets/AppIcon.iconset"
ICNS="$SCRIPT_DIR/frontend/assets/AppIcon.icns"
if [ -d "$ICONSET" ] && [ ! -f "$ICNS" ]; then
  echo "[0/4] Creating .icns..."
  iconutil -c icns "$ICONSET" -o "$ICNS" && echo "OK AppIcon.icns" || echo "WARN: iconutil failed (non-critical)"
fi

# ── 2. PyInstaller ────────────────────────────────────────────────────────────
echo "[1/4] Building Python backend..."
cd "$SCRIPT_DIR/backend"
source venv/bin/activate

# Clean all pyc/pycache so PyInstaller uses fresh source
find "$SCRIPT_DIR/backend" -name "*.pyc" -delete
find "$SCRIPT_DIR/backend" -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
echo "Cleaned .pyc cache"

pip install pyinstaller -q
rm -rf build dist

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
  --additional-hooks-dir=hooks \
  --noconfirm --log-level WARN \
  main.py

# Verify binary was created
BACKEND_BIN="$SCRIPT_DIR/backend/dist/backend_app/backend_app"
if [ ! -f "$BACKEND_BIN" ]; then
  echo "ERROR: PyInstaller did not produce binary at $BACKEND_BIN"
  exit 1
fi
chmod +x "$BACKEND_BIN"

# ── Fix: replace cv2 bundled OpenSSL with Homebrew version ──────────────────
# cv2 ships old libcrypto that lacks _X509_STORE_get1_objects needed by Python ssl
echo "Fixing cv2 OpenSSL conflict..."
CV2_DYLIBS="$SCRIPT_DIR/backend/dist/backend_app/_internal/cv2/.dylibs"

# Find Homebrew OpenSSL libcrypto
BREW_OPENSSL=""
for candidate in   "$(brew --prefix openssl@3 2>/dev/null)/lib/libcrypto.3.dylib"   "$(brew --prefix openssl 2>/dev/null)/lib/libcrypto.3.dylib"   "/opt/homebrew/opt/openssl@3/lib/libcrypto.3.dylib"   "/opt/homebrew/opt/openssl/lib/libcrypto.3.dylib"   "/usr/local/opt/openssl@3/lib/libcrypto.3.dylib"; do
  if [ -f "$candidate" ]; then
    BREW_OPENSSL="$candidate"
    break
  fi
done

if [ -n "$BREW_OPENSSL" ] && [ -d "$CV2_DYLIBS" ]; then
  echo "  Using Homebrew libcrypto: $BREW_OPENSSL"
  cp "$BREW_OPENSSL" "$CV2_DYLIBS/libcrypto.3.dylib"
  # Also replace libssl if present
  BREW_LIBSSL="${BREW_OPENSSL/libcrypto/libssl}"
  [ -f "$BREW_LIBSSL" ] && cp "$BREW_LIBSSL" "$CV2_DYLIBS/libssl.3.dylib" || true
  echo "  OK: Replaced cv2 OpenSSL dylibs"
else
  echo "  WARNING: Homebrew OpenSSL not found at $BREW_OPENSSL, trying install_name_tool fallback..."
  # Fallback: relink _ssl.so to use system libcrypto directly
  SSL_SO=$(find "$SCRIPT_DIR/backend/dist/backend_app/_internal" -name "_ssl.cpython-*.so" 2>/dev/null | head -1)
  if [ -n "$SSL_SO" ]; then
    SYSTEM_CRYPTO=$(otool -L "$SSL_SO" 2>/dev/null | grep libcrypto | awk '{print $1}' | head -1)
    echo "  _ssl.so currently links: $SYSTEM_CRYPTO"
  fi
fi

echo "OK Backend binary: $BACKEND_BIN ($(du -sh "$BACKEND_BIN" | cut -f1))"

deactivate

# ── 3. Frontend ───────────────────────────────────────────────────────────────
echo "[2/4] Building React frontend..."
cd "$SCRIPT_DIR/frontend"
npm run build:frontend
echo "OK Frontend built"

# ── 4. Electron compile ───────────────────────────────────────────────────────
echo "[3/4] Compiling Electron..."
npx tsc -p tsconfig.electron.json
echo "OK Electron compiled"

# ── 5. electron-builder ───────────────────────────────────────────────────────
echo "[4/4] Packaging .app..."
npx electron-builder --mac --arm64

echo ""
echo "=== Done! ==="
echo "Output: $SCRIPT_DIR/frontend/release/"
ls -lh "$SCRIPT_DIR/frontend/release/"*.dmg 2>/dev/null || true

open "$SCRIPT_DIR/frontend/release"
