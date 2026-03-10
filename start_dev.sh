#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Запуск ZapThatDupple (dev)..."

# Убить старые процессы
pkill -f "python.*main.py" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true

# Запустить backend
cd "$SCRIPT_DIR/backend"
source venv/bin/activate
python main.py &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

# Подождать backend
echo "Ожидание backend на порту 8765..."
for i in $(seq 1 30); do
  if nc -z 127.0.0.1 8765 2>/dev/null; then
    echo "Backend готов!"
    break
  fi
  sleep 0.5
done

# Запустить frontend (Electron через Vite)
cd "$SCRIPT_DIR/frontend"
npm run dev &
VITE_PID=$!

# Ждать завершения
wait $VITE_PID
kill $BACKEND_PID 2>/dev/null
