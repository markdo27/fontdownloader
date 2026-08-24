import os
import io
import uuid
import zipfile
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Response
from fastapi.responses import HTMLResponse, StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from converter import detect_font_format, get_font_metadata, convert_font
from extractor import extract_fonts

app = FastAPI(title="Font Extractor & Converter Studio", version="1.0.0")

FONT_STORE: Dict[str, Dict[str, Any]] = {}

class ExtractUrlRequest(BaseModel):
    urls: List[str]

class ConvertRequest(BaseModel):
    font_id: str
    target_format: str

class ZipDownloadRequest(BaseModel):
    font_ids: List[str]
    target_format: Optional[str] = "original"

MIME_MAP = {
    'woff2': 'font/woff2',
    'woff': 'font/woff',
    'otf': 'font/otf',
    'ttf': 'font/ttf',
    'eot': 'application/vnd.ms-fontobject',
}

@app.post("/api/extract/url")
async def api_extract_urls(payload: ExtractUrlRequest):
    results = []
    errors = []
    
    for url in payload.urls:
        clean_url = url.strip()
        if not clean_url:
            continue
        try:
            extracted = extract_fonts(clean_url)
            if not extracted:
                errors.append(f"No valid font files found at: {clean_url}")
            for item in extracted:
                fid = str(uuid.uuid4())
                font_entry = {
                    'id': fid,
                    'filename': item['filename'],
                    'format': item['format'],
                    'data': item['data'],
                    'metadata': item['metadata'],
                    'source': item.get('source_url', clean_url)
                }
                FONT_STORE[fid] = font_entry
                
                results.append({
                    'id': fid,
                    'filename': item['filename'],
                    'format': item['format'],
                    'size_bytes': len(item['data']),
                    'metadata': item['metadata'],
                    'source': item.get('source_url', clean_url)
                })
        except Exception as e:
            errors.append(f"Error processing {clean_url}: {str(e)}")
            
    return {"fonts": results, "errors": errors}

@app.post("/api/extract/upload")
async def api_extract_upload(files: List[UploadFile] = File(...)):
    results = []
    errors = []
    
    for f in files:
        try:
            content = await f.read()
            fmt = detect_font_format(content)
            if fmt == 'unknown':
                errors.append(f"File '{f.filename}' is not a recognized font format (WOFF2, WOFF, OTF, TTF).")
                continue
                
            meta = get_font_metadata(content)
            fid = str(uuid.uuid4())
            
            fname = f.filename
            if not fname.lower().endswith(f".{fmt}"):
                fname = os.path.splitext(fname)[0] + f".{fmt}"
                
            font_entry = {
                'id': fid,
                'filename': fname,
                'format': fmt,
                'data': content,
                'metadata': meta,
                'source': 'file-upload'
            }
            FONT_STORE[fid] = font_entry
            
            results.append({
                'id': fid,
                'filename': fname,
                'format': fmt,
                'size_bytes': len(content),
                'metadata': meta,
                'source': 'file-upload'
            })
        except Exception as e:
            errors.append(f"Error processing file '{f.filename}': {str(e)}")
            
    return {"fonts": results, "errors": errors}

@app.get("/api/fonts")
async def api_list_fonts():
    fonts_list = []
    for fid, item in FONT_STORE.items():
        fonts_list.append({
            'id': fid,
            'filename': item['filename'],
            'format': item['format'],
            'size_bytes': len(item['data']),
            'metadata': item['metadata'],
            'source': item.get('source', '')
        })
    return {"fonts": fonts_list}

@app.get("/api/font/{font_id}/preview")
async def api_font_preview(font_id: str):
    if font_id not in FONT_STORE:
        raise HTTPException(status_code=404, detail="Font not found")
        
    entry = FONT_STORE[font_id]
    mime = MIME_MAP.get(entry['format'], 'application/octet-stream')
    return Response(content=entry['data'], media_type=mime)

@app.get("/api/font/{font_id}/download")
async def api_font_download(font_id: str, format: Optional[str] = None):
    if font_id not in FONT_STORE:
        raise HTTPException(status_code=404, detail="Font not found")
        
    entry = FONT_STORE[font_id]
    
    if not format or format.lower() == entry['format']:
        data = entry['data']
        filename = entry['filename']
        mime = MIME_MAP.get(entry['format'], 'application/octet-stream')
    else:
        try:
            converted_data, out_fmt, ext = convert_font(entry['data'], format)
            data = converted_data
            base_name = os.path.splitext(entry['filename'])[0]
            filename = f"{base_name}.{ext}"
            mime = MIME_MAP.get(out_fmt, 'application/octet-stream')
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Conversion failed: {str(e)}")
            
    headers = {
        'Content-Disposition': f'attachment; filename="{filename}"'
    }
    return Response(content=data, media_type=mime, headers=headers)

@app.post("/api/convert")
async def api_convert_font(payload: ConvertRequest):
    if payload.font_id not in FONT_STORE:
        raise HTTPException(status_code=404, detail="Font not found")
        
    entry = FONT_STORE[payload.font_id]
    target_format = payload.target_format.lower().strip()
    
    try:
        converted_data, out_fmt, ext = convert_font(entry['data'], target_format)
        meta = get_font_metadata(converted_data)
        
        base_name = os.path.splitext(entry['filename'])[0]
        new_filename = f"{base_name}.{ext}"
        
        new_fid = str(uuid.uuid4())
        new_entry = {
            'id': new_fid,
            'filename': new_filename,
            'format': out_fmt,
            'data': converted_data,
            'metadata': meta,
            'source': f"converted from {entry['filename']} ({entry['format'].upper()} -> {out_fmt.upper()})"
        }
        FONT_STORE[new_fid] = new_entry
        
        return {
            'id': new_fid,
            'filename': new_filename,
            'format': out_fmt,
            'size_bytes': len(converted_data),
            'metadata': meta,
            'source': new_entry['source']
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Conversion failed: {str(e)}")

@app.post("/api/download/zip")
async def api_download_zip(payload: ZipDownloadRequest):
    if not payload.font_ids:
        raise HTTPException(status_code=400, detail="No fonts specified")
        
    zip_buffer = io.BytesIO()
    used_names: Dict[str, int] = {}
    
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for fid in payload.font_ids:
            if fid not in FONT_STORE:
                continue
            entry = FONT_STORE[fid]
            target_fmt = payload.target_format
            
            if not target_fmt or target_fmt == 'original' or target_fmt == entry['format']:
                data_to_write = entry['data']
                out_name = entry['filename']
            else:
                try:
                    converted_data, out_fmt, ext = convert_font(entry['data'], target_fmt)
                    data_to_write = converted_data
                    base_name = os.path.splitext(entry['filename'])[0]
                    out_name = f"{base_name}.{ext}"
                except Exception:
                    data_to_write = entry['data']
                    out_name = entry['filename']
                    
            # Deduplicate zip entries
            if out_name in used_names:
                used_names[out_name] += 1
                base, ext = os.path.splitext(out_name)
                final_name = f"{base}_{used_names[out_name]}{ext}"
            else:
                used_names[out_name] = 0
                final_name = out_name
                
            zip_file.writestr(final_name, data_to_write)
                    
    zip_buffer.seek(0)
    zip_filename = f"extracted_fonts_{payload.target_format}.zip" if payload.target_format != 'original' else "extracted_fonts.zip"
    
    headers = {
        'Content-Disposition': f'attachment; filename="{zip_filename}"'
    }
    return StreamingResponse(zip_buffer, media_type="application/zip", headers=headers)

@app.delete("/api/font/{font_id}")
async def api_delete_font(font_id: str):
    if font_id in FONT_STORE:
        del FONT_STORE[font_id]
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="Font not found")

@app.delete("/api/fonts/clear")
async def api_clear_all_fonts():
    FONT_STORE.clear()
    return {"status": "success", "message": "All fonts cleared"}

static_path = os.path.join(os.path.dirname(__file__), 'static')
app.mount("/", StaticFiles(directory=static_path, html=True), name="static")
