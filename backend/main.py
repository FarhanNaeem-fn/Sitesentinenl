"""
SiteSentinel Matrix Pro — FastAPI entry point (slim).
All business logic lives in the dedicated scanner/service modules.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional

from dotenv import load_dotenv
load_dotenv()

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from config import BASE_DIR, IS_VERCEL, REPORTS_DIR, UPLOADS_DIR, log
from routes import router

app = FastAPI(title="SiteSentinel Matrix Pro API", version="3.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/reports", StaticFiles(directory=REPORTS_DIR), name="reports")

app.include_router(router)

if IS_VERCEL:
    pw_path = os.path.join(os.path.dirname(__file__), "pw-browsers")
    os.environ["PLAYWRIGHT_BROWSERS_PATH"] = pw_path
    log.info(f"Vercel Mode Active — Browser Path: {pw_path}")
