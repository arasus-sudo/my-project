#!/bin/bash
ANTENV=/home/site/wwwroot/antenv
WWWROOT=/home/site/wwwroot
if [ ! -d "$ANTENV/bin" ]; then
  mkdir -p "$ANTENV"
  zstd -dc "$WWWROOT/output.tar.zst" | tar xf - -C "$ANTENV" --strip-components=1
fi
. "$ANTENV/bin/activate"
pip install -r "$WWWROOT/requirements.txt" --no-cache-dir 2>&1 | tail -3
uvicorn server:app --host 0.0.0.0 --port 8000 --workers 2
