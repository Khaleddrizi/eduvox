#!/usr/bin/env python3
"""
Start all servers (delegates to backend.scripts.run_all).
  - Alexa API   → port 5002  (/alexa_quiz)
  - Web API     → port 5004  (/api/...)

Usage: python run.py
  or:  python -m backend.scripts.run_all

Before first run of Phase 4: python -m backend.scripts.migrate_phase4
"""
import os
import sys
import runpy
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

if __name__ == "__main__":
    # Render (and similar platforms) inject PORT for a single web service.
    # In that environment we run only the Web API to reduce memory usage
    # and bind to the required external port.
    render_port = os.getenv("PORT")
    if render_port:
        from backend.api.web_api import create_web_api

        app = create_web_api()
        app.run(host="0.0.0.0", port=int(render_port), use_reloader=False)
    else:
        # Local/dev mode: keep previous behavior (Web API + Alexa API).
        runpy.run_module("backend.scripts.run_all", run_name="__main__")
