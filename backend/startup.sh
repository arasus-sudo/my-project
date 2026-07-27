#!/bin/bash
cd /home/site/wwwroot && pip install -r requirements.txt --target=vendor 2>&1 && uvicorn server:app --host 0.0.0.0 --port 8000 --workers 1 --timeout-keep-alive 120
