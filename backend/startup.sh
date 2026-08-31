#!/bin/bash
WWWROOT=/home/site/wwwroot
cd "$WWWROOT"

# Set PYTHONPATH so vendored dependencies are found
if [ -d "$WWWROOT/vendor" ]; then
  export PYTHONPATH="$WWWROOT/vendor:$WWWROOT"
fi

exec python -m uvicorn server:app --host 0.0.0.0 --port 8000 --workers 1 --timeout-keep-alive 120
