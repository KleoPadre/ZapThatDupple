#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "╔══════════════════════════════════════╗"
echo "║     ZapThatDupple — Setup Script       ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── Проверка зависимостей ──────────────────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
  echo "❌ Python 3 не найден. Установите: https://python.org"
  exit 1
fi

if ! command -v node &>/dev/null; then
  echo "❌ Node.js не найден. Установите: https://nodejs.org"
  exit 1
fi

if ! command -v ffmpeg &>/dev/null; then
  echo "⚠️  ffmpeg не найден, устанавливаю через Homebrew..."
  if command -v brew &>/dev/null; then
    brew install ffmpeg
  else
    echo "❌ Homebrew не найден. Установите: https://brew.sh"
    exit 1
  fi
fi

echo "✅ Зависимости проверены"
echo ""

# ── Python venv ────────────────────────────────────────────────────────────────
echo "🐍 Установка Python зависимостей..."
cd "$SCRIPT_DIR/backend"
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip -q
pip install -r requirements.txt -q
deactivate
echo "✅ Python backend готов"
echo ""

# ── Node / npm ─────────────────────────────────────────────────────────────────
echo "📦 Установка Node зависимостей..."
cd "$SCRIPT_DIR/frontend"
npm install --silent
echo "✅ Node зависимости установлены"
echo ""

# ── Конвертация иконки в .icns ─────────────────────────────────────────────────
ICONSET="$SCRIPT_DIR/frontend/assets/AppIcon.iconset"
ICNS="$SCRIPT_DIR/frontend/assets/AppIcon.icns"
if [ -d "$ICONSET" ] && [ ! -f "$ICNS" ]; then
  echo "🎨 Конвертация иконки..."
  iconutil -c icns "$ICONSET" -o "$ICNS" && echo "✅ Иконка создана: AppIcon.icns" || echo "⚠️  Не удалось создать .icns (не критично)"
fi

# ── Сборка frontend ────────────────────────────────────────────────────────────
echo "⚛️  Сборка frontend..."
cd "$SCRIPT_DIR/frontend"
npm run build:frontend
npx tsc -p tsconfig.electron.json
echo "✅ Frontend собран"
echo ""

# ── Права ─────────────────────────────────────────────────────────────────────
chmod +x "$SCRIPT_DIR/ZapThatDupple.command"

echo "╔══════════════════════════════════════╗"
echo "║         Готово! 🎉                   ║"
echo "╠══════════════════════════════════════╣"
echo "║  Запуск:                             ║"
echo "║  Двойной клик — ZapThatDupple.command  ║"
echo "║                                      ║"
echo "║  Собрать .app:                       ║"
echo "║  bash build.sh                       ║"
echo "╚══════════════════════════════════════╝"
