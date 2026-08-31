#!/bin/bash
WWWROOT=/home/site/wwwroot

# --- Deployment mode detection ---
# GitHub Actions deployment: vendor/ directory with pre-installed dependencies
# Legacy deployment: antenv virtualenv with requirements.txt
if [ -d "$WWWROOT/vendor" ]; then
  echo "[startup] GitHub Actions mode — using vendored dependencies"
  export PYTHONPATH="$WWWROOT/vendor:$WWWROOT"
  cd "$WWWROOT"
  exec python -m uvicorn server:app --host 0.0.0.0 --port 8000 --workers 1 --timeout-keep-alive 120
fi

# Legacy path: extract antenv from compressed archive if needed
ANTENV=/home/site/wwwroot/antenv
if [ ! -d "$ANTENV/bin" ]; then
  mkdir -p "$ANTENV"
  if [ -f "$WWWROOT/output.tar.zst" ]; then
    zstd -dc "$WWWROOT/output.tar.zst" | tar xf - -C "$ANTENV" --strip-components=1
  fi
fi

if [ -f "$ANTENV/bin/activate" ]; then
  . "$ANTENV/bin/activate"
fi

if [ -f "$WWWROOT/requirements.txt" ]; then
  pip install -r "$WWWROOT/requirements.txt" --no-cache-dir 2>&1 | tail -3
fi

cd "$WWWROOT"
exec python -m uvicorn server:app --host 0.0.0.0 --port 8000 --workers 1 --timeout-keep-alive 120
