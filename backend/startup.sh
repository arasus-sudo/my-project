#!/bin/bash
set -e
WWWROOT=/home/site/wwwroot
PORT=${PORT:-${WEBSITES_PORT:-8000}}
echo "[startup] booting innoira-api on port $PORT (PYTHONPATH=$PYTHONPATH)"
cd "$WWWROOT"

# Set PYTHONPATH so vendored dependencies are found (GitHub Actions mode)
if [ -d "$WWWROOT/vendor" ]; then
  export PYTHONPATH="$WWWROOT/vendor:$WWWROOT"
  echo "[startup] vendor mode — PYTHONPATH=$PYTHONPATH"
else
  export PYTHONPATH="$WWWROOT"
  echo "[startup] no vendor dir — PYTHONPATH=$PYTHONPATH"
fi

# Ensure startup script is executable and show what will run
ls -lh "$WWWROOT/server.py" "$WWWROOT/startup.sh" 2>&1 | head -5
echo "[startup] python version: $(python --version 2>&1)"
echo "[startup] launching: python -m uvicorn server:app --host 0.0.0.0 --port $PORT --workers 1"

exec python -m uvicorn server:app --host 0.0.0.0 --port "$PORT" --workers 1 --timeout-keep-alive 120 --log-level info
