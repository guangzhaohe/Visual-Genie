"""Run a backend server that hosts frontend files and listens for requests"""

import os
import mimetypes
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles  # <--- IMPORT THIS
from pydantic import BaseModel
import aiofiles

app = FastAPI(title="Unicorn Visual Genie")

# Enable CORS (Good to keep, though less critical now)
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

# --- API ROUTES (Must be defined BEFORE static files) ---

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
                        size = entry.stat().st_size if not entry.is_dir() else 0
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
        end = int(end) if end else min(start + chunk_size, file_size - 1)
    else:
        start = 0
        end = min(chunk_size, file_size - 1)

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


# --- STATIC FILE MOUNTING (Frontend) ---
# This serves the React build folder. HTML=True allows serving index.html at root
# It must be placed AFTER the specific API routes so /api doesn't get overridden.
app.mount("/", StaticFiles(directory="visual_genie/build", html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    # host="0.0.0.0" allows access from outside the cluster node
    # print("🧞 Unicorn Visual Genie is ready! Access it at http://<CLUSTER_IP>:8000")
    uvicorn.run(app, host="0.0.0.0", port=8080)
    