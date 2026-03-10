#!/bin/bash

DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$HOME/FilesDedupe"
LOG_FILE="$LOG_DIR/app.log"

# Создать папку для данных и логов
mkdir -p "$LOG_DIR"

# Проверить установку
if [ ! -d "$DIR/backend/venv" ] || [ ! -d "$DIR/frontend/dist" ]; then
  osascript -e "display alert \"FilesDedupe\" message \"Сначала запустите install.sh:\n\nbash $DIR/install.sh\" as critical"
  exit 1
fi

# Убить старый backend если запущен
pkill -f "python.*main.py" 2>/dev/null || true
sleep 0.3

# Запустить backend
cd "$DIR/backend"
source venv/bin/activate
python main.py >> "$LOG_FILE" 2>&1 &
BACKEND_PID=$!
cd "$DIR"

# Ждать backend (проверяем HTTP, макс 30 сек)
echo "Запуск backend (PID $BACKEND_PID)..."
READY=0
for i in $(seq 1 60); do
  if curl -s http://127.0.0.1:8765/api/settings > /dev/null 2>&1; then
    echo "Backend готов"
    READY=1
    break
  fi
  sleep 0.5
done

if [ $READY -eq 0 ]; then
  echo "Backend не запустился. Смотрите лог: $LOG_FILE"
  osascript -e "display alert \"FilesDedupe\" message \"Backend не запустился.\nЛог: $LOG_FILE\" as critical"
  exit 1
fi

# Запустить Electron
"$DIR/frontend/node_modules/.bin/electron" "$DIR/frontend" &
ELECTRON_PID=$!

# Когда Electron закрыт — убить backend
wait $ELECTRON_PID
kill $BACKEND_PID 2>/dev/null || true
