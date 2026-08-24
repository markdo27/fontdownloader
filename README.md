# ✨ Font Extractor & Converter Studio

A full-stack web application designed to extract web fonts from URLs (including Supply Family base64 URLs, CSS `@font-face` links, and full webpages), inspect detailed font metadata, preview typography in real time, and seamlessly convert between **WOFF2**, **WOFF**, **OTF**, and **TTF** formats.

---

## 🚀 Quick Start

### 1. Launch App
Run the launcher script to start the server and open the web UI automatically:
```bash
cd C:\Users\AZPC\.gemini\antigravity\scratch\font-extractor-app
python run.py
```
*The app will automatically start at `http://127.0.0.1:8000` (or the next available port).*

---

## 🌟 Key Features

### 1. 🔍 Advanced Font Extraction
- **Supply Family & Base64 URLs**: Decodes query parameters like `?font=<base64>`, `?src=<base64>`, `?url=<base64>` and extracts the underlying font binary.
- **CSS & Webpage Scraping**: Paste any website URL or stylesheet link; the engine parses `@font-face` rules, resolves relative URLs, and downloads all referenced fonts.
- **Direct Font URLs**: Supports direct links to `.woff2`, `.woff`, `.otf`, and `.ttf` files.
- **Local File Upload**: Drag and drop `.woff2`, `.woff`, `.otf`, or `.ttf` files directly into the UI.

### 2. 🔄 High-Fidelity Font Converter
- **WOFF2 / WOFF $\rightarrow$ OTF**: Decompresses web fonts back into pure OpenType (`.otf` with CFF PostScript outlines) or TrueType (`.ttf`).
- **OTF / TTF $\rightarrow$ WOFF2 / WOFF**: Compresses desktop fonts into modern web formats with Brotli / Zlib compression.
- **One-Click Batch ZIP Export**: Convert and download all loaded fonts into a single `.zip` file in any desired target format (`OTF`, `TTF`, `WOFF2`, `WOFF`, or `Original`).

### 3. 🎨 Interactive Typography Studio
- **Live In-Browser Preview**: Dynamically registers fonts via the Web `FontFace` API with zero latency.
- **Customizable Preview Text**: Change sample text, font size (14px - 96px), letter spacing, and line height.
- **Quick Pangrams**: One-click pangram selectors (Quick Brown Fox, Pack My Box, Numbers, Symbols).
- **Metadata Inspector**: View font family, subfamily, PostScript name, glyph counts, units per em, weight class, tables, and character set grid.
- **Dark / Light Theme**: Built-in glassmorphism interface with dark and light mode toggle.

---

## 📁 Project Structure

```
font-extractor-app/
├── app.py              # FastAPI server & REST API endpoints
├── converter.py        # Font format detection, metadata extraction & conversion
├── extractor.py        # URL base64 decoding, CSS scraping & binary fetching
├── run.py              # Launcher script with auto browser opening
├── requirements.txt    # Python dependencies
└── static/
    ├── index.html      # Responsive Single Page Application UI
    ├── style.css       # Sleek modern glassmorphism styling
    └── app.js          # Interactive frontend logic & FontFace registration
```

---

## 🛠️ API Reference

- `POST /api/extract/url` — Extract fonts from one or more URLs.
- `POST /api/extract/upload` — Upload `.woff2`, `.woff`, `.otf`, `.ttf` files.
- `GET /api/font/{id}/preview` — Stream font binary for `@font-face` browser rendering.
- `GET /api/font/{id}/download?format=otf` — Download font in original or converted format.
- `POST /api/convert` — Convert a stored font to target format (`otf`, `ttf`, `woff`, `woff2`).
- `POST /api/download/zip` — Download all selected fonts in a ZIP archive.
