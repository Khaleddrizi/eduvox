"""
Project settings — all variables and paths in one place.
"""
import os
from pathlib import Path

# Backend root (parent of this file)
BACKEND_ROOT = Path(__file__).resolve().parent
# Project root (parent of backend)
PROJECT_ROOT = BACKEND_ROOT.parent

DATA_DIR = BACKEND_ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)

# RAG and cache file paths
FAISS_INDEX_PATH = DATA_DIR / "quiz_index.faiss"
CHUNKS_PATH = DATA_DIR / "quiz_chunks.npy"
QUESTION_CACHE_PATH = DATA_DIR / "question_cache.json"

# API keys (loaded from .env)
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
NGROK_AUTH_TOKEN = os.getenv("NGROK_AUTH_TOKEN", "")

# Server
FLASK_HOST = os.getenv("FLASK_HOST", "0.0.0.0")
FLASK_PORT = int(os.getenv("FLASK_PORT", "5002"))

# Quiz behaviour
WEAK_CHUNK_THRESHOLD = float(os.getenv("WEAK_CHUNK_THRESHOLD", "0.6"))
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "400"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "50"))

# Graduation / demo only — auto-link Alexa to a patient (no spoken link code).
# Set ALEXA_DEMO_AUTO_LINK=0 or remove after the demo.
ALEXA_DEMO_AUTO_LINK = os.getenv("ALEXA_DEMO_AUTO_LINK", "").lower() in ("1", "true", "yes")
ALEXA_DEMO_PATIENT_NAME = os.getenv("ALEXA_DEMO_PATIENT_NAME", "سامي").strip()
ALEXA_DEMO_PATIENT_CODE = os.getenv("ALEXA_DEMO_PATIENT_CODE", "").strip()
