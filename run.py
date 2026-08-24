import os
import sys
import socket
import webbrowser
import threading
import time
import uvicorn

def is_port_available(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) != 0

def find_available_port(start_port: int = 8000, max_attempts: int = 50) -> int:
    for port in range(start_port, start_port + max_attempts):
        if is_port_available(port):
            return port
    return start_port

def open_browser(url: str):
    time.sleep(1.2)
    try:
        webbrowser.open(url)
    except Exception:
        pass

def main():
    port = find_available_port(8000)
    url = f"http://127.0.0.1:{port}"
    
    print("=" * 65)
    print("  ✨ Font Extractor & Converter Studio ✨")
    print("  Support: WOFF2, WOFF, OTF, TTF")
    print(f"  Web UI running at: {url}")
    print("=" * 65)
    
    # Launch browser in background thread
    threading.Thread(target=open_browser, args=(url,), daemon=True).start()
    
    uvicorn.run("app:app", host="127.0.0.1", port=port, log_level="info", reload=False)

if __name__ == "__main__":
    main()
