import os
import mimetypes
import pathlib # Added for robust path checks
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import aiofiles
from fastapi.staticfiles import StaticFiles
import uvicorn

# --- CONFIGURATION ---
FRONTEND_BUILD_DIR = "frontend/build/"
HOST_PORT = 8000  # Set the port explicitly
HOST_IP = "127.0.0.1"

app = FastAPI(title="Visual Genie API")

# --- STATE MANAGEMENT (In-Memory) ---
session_state = {
    "groups": [],
    "config": {"gridCols": 1, "hue": 180}
}

class ConfigModel(BaseModel):
    gridCols: int
    hue: int

class StateModel(BaseModel):
    groups: List[Dict[str, Any]]
    config: ConfigModel

@app.get("/api/state")
async def get_state():
    """Retrieve the current session state."""
    return session_state

@app.post("/api/state")
async def save_state(state: StateModel):
    """Save the current session state."""
    global session_state
    session_state = state.dict()
    return {"status": "saved"}

# --- 1. NUCLEAR CORS MIDDLEWARE (Unchanged) ---
# This forces the header onto EVERY response, overriding everything else.
@app.middleware("http")
async def add_cors_header(request: Request, call_next):
    # Only need to add the CORS header if the request is NOT for the API path
    # (Though adding it everywhere is safe for development)
    response = await call_next(request)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "*"
    return response

# Standard CORS (keep this as backup)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class FileObj(BaseModel):
    name: str
    path: str
    is_dir: bool
    size: int
    extension: Optional[str] = None

# --- API ROUTES (Navigation, File, Stream, Metadata - Unchanged) ---

@app.get("/api/navigate")
async def navigate(path: str = ".", fast: bool = False):
    real_path = os.path.expanduser(path)
    real_path = os.path.abspath(real_path)
    
    if not os.path.exists(real_path):
        raise HTTPException(status_code=404, detail="Path not found")
    
    items = []
    try:
        with os.scandir(real_path) as entries:
            for entry in entries:
                size = 0
                if not fast:
                    try:
                        # Use os.stat for more reliable file info
                        stat_result = entry.stat() 
                        size = stat_result.st_size if not entry.is_dir() else 0
                    except OSError:
                        size = 0
                
                absolute_entry_path = os.path.join(real_path, entry.name)
                
                items.append(FileObj(
                    name=entry.name,
                    path=absolute_entry_path,
                    is_dir=entry.is_dir(),
                    size=size,
                    extension=os.path.splitext(entry.name)[1].lower() if not entry.is_dir() else None
                ))
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    items.sort(key=lambda x: (not x.is_dir, x.name.lower()))
    return {"path": real_path, "items": items}

@app.get("/api/file")
async def get_file(path: str):
    if not os.path.exists(path):
        raise HTTPException(404, "File not found")
    
    return FileResponse(path)

@app.get("/api/stream")
async def stream_video(path: str, range: str = Header(None)):
    if not os.path.exists(path):
        raise HTTPException(404, "File not found")
    
    file_size = os.path.getsize(path)
    chunk_size = 1024 * 1024 

    if range:
        start, end = range.replace("bytes=", "").split("-")
        start = int(start)
        # Handle case where 'end' is omitted (e.g., bytes=100-)
        end = int(end) if end else min(start + chunk_size, file_size - 1)
    else:
        start = 0
        end = min(chunk_size, file_size - 1)

    # Ensure range is valid
    if start >= file_size or start > end:
        raise HTTPException(status_code=416, detail="Requested Range Not Satisfiable")
    
    # Ensure end does not exceed file size
    end = min(end, file_size - 1)

    async def iterfile():
        async with aiofiles.open(path, mode="rb") as f:
            await f.seek(start)
            data = await f.read(end - start + 1)
            yield data

    headers = {
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(end - start + 1),
        "Content-Type": mimetypes.guess_type(path)[0] or "application/octet-stream",
    }
    return StreamingResponse(iterfile(), status_code=206, headers=headers)

@app.get("/api/metadata")
async def get_metadata(path: str):
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    try:
        stat = os.stat(path)
        return {"name": os.path.basename(path), "size": stat.st_size, "modified": stat.st_mtime}
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")

# ====================================================================
# --- STATIC FILE MOUNTING (Frontend) ---
# ====================================================================

# 1. CRITICAL CHECK: Ensure the frontend build exists
# This prevents the app from crashing if the React build hasn't been run yet.
if not pathlib.Path(FRONTEND_BUILD_DIR).is_dir():
    print("="*60)
    print(f"⚠️ WARNING: Frontend build directory '{FRONTEND_BUILD_DIR}' not found.")
    print("   Please ensure you have run 'npm run build' inside your frontend project.")
    print("   Only API endpoints will be accessible.")
    print("="*60)
else:
    # 2. MOUNT STATIC FILES: This handles all non-API routes.
    # It must be placed AFTER the specific API routes (/api/*) 
    # so the API calls don't get accidentally routed to a file.
    app.mount("/", StaticFiles(directory=FRONTEND_BUILD_DIR, html=True, check_dir=True), name="static")

if __name__ == "__main__":
    # Ensure uvicorn runs the app on the desired port and hosts from all IPs
    print(f"🧞 Unicorn API & Frontend is listening on http://127.0.0.1:{HOST_PORT}")
    print(f"    Frontend Directory: {FRONTEND_BUILD_DIR}")
    uvicorn.run(app, host=HOST_IP, port=HOST_PORT)
