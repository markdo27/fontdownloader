// Font Extractor & Converter Studio (100% Client-Side Browser Engine)

let loadedFonts = []; // Array of { id, filename, format, bytes: Uint8Array, metadata, source, blobUrl }
let loadedFontFaces = new Map(); // id -> font family name

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initTabs();
    initDropZone();
    initPresets();
    initGlobalControls();
    initModal();
    
    document.getElementById('extractUrlBtn').addEventListener('click', handleUrlExtraction);
    document.getElementById('clearAllBtn').addEventListener('click', handleClearAll);
    document.getElementById('downloadZipBtn').addEventListener('click', handleDownloadZip);
});

// Format Detection from Magic Bytes
function detectFontFormat(uint8) {
    if (!uint8 || uint8.length < 4) return 'unknown';
    const magic = String.fromCharCode(uint8[0], uint8[1], uint8[2], uint8[3]);
    if (magic === 'wOF2') return 'woff2';
    if (magic === 'wOFF') return 'woff';
    if (magic === 'OTTO') return 'otf';
    if (uint8[0] === 0 && uint8[1] === 1 && uint8[2] === 0 && uint8[3] === 0) return 'ttf';
    if (magic === 'true' || magic === 'typ1') return 'ttf';
    return 'unknown';
}

// Pure JS SFNT Name Table Parser
function parseSfntMetadata(uint8, fmt) {
    const meta = {
        format: fmt || detectFontFormat(uint8),
        size_bytes: uint8.length,
        family_name: 'Unknown Family',
        subfamily_name: 'Regular',
        full_name: 'Unknown Font',
        postscript_name: 'Unknown',
        outline_type: 'Unknown',
        glyph_count: 0,
        units_per_em: 1000,
        weight_class: 400,
        tables: []
    };
    
    try {
        if (uint8.length < 12) return meta;
        const view = new DataView(uint8.buffer, uint8.byteOffset, uint8.byteLength);
        const magic = String.fromCharCode(uint8[0], uint8[1], uint8[2], uint8[3]);
        
        if (magic === 'OTTO') {
            meta.outline_type = 'PostScript (CFF)';
        } else if (uint8[0] === 0 && uint8[1] === 1) {
            meta.outline_type = 'TrueType (glyf)';
        }
        
        const numTables = view.getUint16(4, false);
        const tables = {};
        
        for (let i = 0; i < numTables && (12 + i * 16 + 16) <= uint8.length; i++) {
            const tOffset = 12 + i * 16;
            const tag = String.fromCharCode(uint8[tOffset], uint8[tOffset+1], uint8[tOffset+2], uint8[tOffset+3]);
            const offset = view.getUint32(tOffset + 8, false);
            const length = view.getUint32(tOffset + 12, false);
            tables[tag] = { offset, length };
            meta.tables.push(tag);
        }
        
        if (tables['maxp']) {
            const maxpOffset = tables['maxp'].offset;
            if (maxpOffset + 6 <= uint8.length) {
                meta.glyph_count = view.getUint16(maxpOffset + 4, false);
            }
        }
        
        if (tables['head']) {
            const headOffset = tables['head'].offset;
            if (headOffset + 20 <= uint8.length) {
                meta.units_per_em = view.getUint16(headOffset + 18, false);
            }
        }
        
        if (tables['name']) {
            const nameOffset = tables['name'].offset;
            if (nameOffset + 6 <= uint8.length) {
                const count = view.getUint16(nameOffset + 2, false);
                const stringOffset = nameOffset + view.getUint16(nameOffset + 4, false);
                
                const nameMap = {
                    1: 'family_name',
                    2: 'subfamily_name',
                    4: 'full_name',
                    6: 'postscript_name',
                    8: 'manufacturer',
                    9: 'designer',
                    0: 'copyright'
                };
                
                for (let i = 0; i < count && (nameOffset + 6 + i * 12 + 12) <= uint8.length; i++) {
                    const recOffset = nameOffset + 6 + i * 12;
                    const platformID = view.getUint16(recOffset, false);
                    const nameID = view.getUint16(recOffset + 6, false);
                    const length = view.getUint16(recOffset + 8, false);
                    const offset = view.getUint16(recOffset + 10, false);
                    
                    if (nameMap[nameID]) {
                        const strStart = stringOffset + offset;
                        if (strStart + length <= uint8.length) {
                            const strBytes = uint8.subarray(strStart, strStart + length);
                            let strVal = '';
                            if (platformID === 0 || platformID === 3) {
                                for (let k = 0; k < strBytes.length; k += 2) {
                                    if (k + 1 < strBytes.length) {
                                        const code = (strBytes[k] << 8) | strBytes[k+1];
                                        if (code > 0) strVal += String.fromCharCode(code);
                                    }
                                }
                            } else {
                                for (let k = 0; k < strBytes.length; k++) {
                                    strVal += String.fromCharCode(strBytes[k]);
                                }
                            }
                            strVal = strVal.trim();
                            if (strVal && (meta[nameMap[nameID]].startsWith('Unknown') || platformID === 3)) {
                                meta[nameMap[nameID]] = strVal;
                            }
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.warn('SFNT parse error:', e);
    }
    
    return meta;
}

// Client-side WOFF 1.0 Decompression to OTF/TTF
function decompressWoff1(woffBytes) {
    const view = new DataView(woffBytes.buffer, woffBytes.byteOffset, woffBytes.byteLength);
    const magic = String.fromCharCode(woffBytes[0], woffBytes[1], woffBytes[2], woffBytes[3]);
    if (magic !== 'wOFF') throw new Error('Not a valid WOFF 1.0 file');
    
    const flavor = String.fromCharCode(woffBytes[4], woffBytes[5], woffBytes[6], woffBytes[7]);
    const numTables = view.getUint16(12, false);
    const totalSfntSize = view.getUint32(16, false);
    
    let entrySelector = 0;
    while ((1 << (entrySelector + 1)) <= numTables) {
        entrySelector++;
    }
    const searchRange = (1 << entrySelector) * 16;
    const rangeShift = numTables * 16 - searchRange;
    
    const sfntBuf = new Uint8Array(totalSfntSize);
    const sfntView = new DataView(sfntBuf.buffer);
    
    for (let i = 0; i < 4; i++) {
        sfntBuf[i] = woffBytes[4 + i];
    }
    sfntView.setUint16(4, numTables, false);
    sfntView.setUint16(6, searchRange, false);
    sfntView.setUint16(8, entrySelector, false);
    sfntView.setUint16(10, rangeShift, false);
    
    const woffTableDirOffset = 44;
    let curDataOffset = 12 + numTables * 16;
    
    for (let i = 0; i < numTables; i++) {
        const entryOffset = woffTableDirOffset + i * 20;
        const tOffset = view.getUint32(entryOffset + 4, false);
        const compLength = view.getUint32(entryOffset + 8, false);
        const origLength = view.getUint32(entryOffset + 12, false);
        const origChecksum = view.getUint32(entryOffset + 16, false);
        
        const rawData = woffBytes.subarray(tOffset, tOffset + compLength);
        let decompressedData;
        
        if (compLength < origLength) {
            if (typeof pako !== 'undefined') {
                decompressedData = pako.inflate(rawData);
            } else {
                throw new Error('Pako library required for WOFF decompression');
            }
        } else {
            decompressedData = rawData;
        }
        
        const sfntEntryOffset = 12 + i * 16;
        for (let j = 0; j < 4; j++) {
            sfntBuf[sfntEntryOffset + j] = woffBytes[entryOffset + j];
        }
        sfntView.setUint32(sfntEntryOffset + 4, origChecksum, false);
        sfntView.setUint32(sfntEntryOffset + 8, curDataOffset, false);
        sfntView.setUint32(sfntEntryOffset + 12, origLength, false);
        
        sfntBuf.set(decompressedData, curDataOffset);
        const padLen = (4 - (decompressedData.length % 4)) % 4;
        curDataOffset += decompressedData.length + padLen;
    }
    
    return sfntBuf;
}

// Client-side WOFF2 Decompression to OTF/TTF using wawoff2
async function decompressWoff2(woff2Bytes) {
    if (typeof wawoff2 !== 'undefined' && typeof wawoff2.decompress === 'function') {
        const res = await wawoff2.decompress(woff2Bytes);
        return new Uint8Array(res);
    }
    if (typeof Module !== 'undefined' && typeof Module.decompress === 'function') {
        const res = Module.decompress(woff2Bytes);
        return new Uint8Array(res);
    }
    throw new Error('WOFF2 WebAssembly decompressor not ready. Please refresh.');
}

// Client-Side Font Converter
async function clientConvertFont(fontBytes, targetFormat) {
    const srcFmt = detectFontFormat(fontBytes);
    targetFormat = targetFormat.toLowerCase();
    
    if (srcFmt === targetFormat) {
        return { bytes: fontBytes, format: srcFmt };
    }
    
    let sfntBytes = fontBytes;
    if (srcFmt === 'woff2') {
        sfntBytes = await decompressWoff2(fontBytes);
    } else if (srcFmt === 'woff') {
        sfntBytes = decompressWoff1(fontBytes);
    }
    
    const sfntFmt = detectFontFormat(sfntBytes);
    if (targetFormat === 'otf' || targetFormat === 'ttf') {
        return { bytes: sfntBytes, format: sfntFmt === 'otf' ? 'otf' : 'ttf' };
    }
    
    throw new Error(`Conversion to ${targetFormat.toUpperCase()} is not available.`);
}

// Extract Metadata
function extractMetadata(fontBytes, fmt) {
    fmt = fmt || detectFontFormat(fontBytes);
    let parsed = null;
    
    if (fmt === 'otf' || fmt === 'ttf') {
        parsed = parseSfntMetadata(fontBytes, fmt);
    } else if (fmt === 'woff') {
        try {
            const sfnt = decompressWoff1(fontBytes);
            parsed = parseSfntMetadata(sfnt, fmt);
        } catch (e) {}
    }
    
    if (!parsed) {
        parsed = {
            format: fmt,
            size_bytes: fontBytes.length,
            family_name: 'Unknown Family',
            subfamily_name: 'Regular',
            full_name: 'Unknown Font',
            postscript_name: 'Unknown',
            outline_type: fmt === 'otf' ? 'PostScript (CFF)' : 'TrueType',
            glyph_count: 0,
            units_per_em: 1000,
            tables: []
        };
    }
    
    if (typeof opentype !== 'undefined' && (fmt === 'otf' || fmt === 'ttf' || fmt === 'woff')) {
        try {
            let buf = fontBytes.buffer.slice(fontBytes.byteOffset, fontBytes.byteOffset + fontBytes.byteLength);
            if (fmt === 'woff') {
                const sfnt = decompressWoff1(fontBytes);
                buf = sfnt.buffer.slice(sfnt.byteOffset, sfnt.byteOffset + sfnt.byteLength);
            }
            const font = opentype.parse(buf);
            if (font && font.names) {
                if (font.names.fontFamily) parsed.family_name = font.names.fontFamily.en || Object.values(font.names.fontFamily)[0] || parsed.family_name;
                if (font.names.fontSubfamily) parsed.subfamily_name = font.names.fontSubfamily.en || Object.values(font.names.fontSubfamily)[0] || parsed.subfamily_name;
                if (font.names.fullName) parsed.full_name = font.names.fullName.en || Object.values(font.names.fullName)[0] || parsed.full_name;
                if (font.names.postScriptName) parsed.postscript_name = font.names.postScriptName.en || Object.values(font.names.postScriptName)[0] || parsed.postscript_name;
            }
            if (font.glyphs) parsed.glyph_count = font.glyphs.length;
        } catch (e) {}
    }
    
    return parsed;
}

// Multi-tier URL Fetcher (Direct + Robust CORS Proxies)
async function fetchWithCorsFallback(url) {
    const proxyList = [
        url, // 1. Direct fetch
        `https://cors.isteed.cc/${url}`, // 2. Fast CF Worker proxy
        `https://proxy.cors.sh/${url}`, // 3. cors.sh proxy
        `https://corsproxy.io/?url=${encodeURIComponent(url)}`, // 4. corsproxy
        `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}` // 5. allorigins
    ];
    
    let lastErr = null;
    for (const target of proxyList) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 7000);
            
            const r = await fetch(target, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (r.ok) {
                const buf = await r.arrayBuffer();
                const u8 = new Uint8Array(buf);
                
                // If it looks like a valid font or stylesheet text, return it
                const fmt = detectFontFormat(u8);
                if (fmt !== 'unknown') {
                    return { data: u8, finalUrl: url };
                }
                
                // Check if it's text (CSS or HTML) vs Cloudflare bot challenge
                const textHeader = new TextDecoder('utf-8').decode(u8.subarray(0, 150)).toLowerCase();
                if (textHeader.includes('<!doctype') || textHeader.includes('<html') || textHeader.includes('cloudflare') || textHeader.includes('access denied')) {
                    // Bot challenge or error page, skip to next proxy
                    continue;
                }
                
                return { data: u8, finalUrl: url };
            }
        } catch (e) {
            lastErr = e;
        }
    }
    
    throw new Error(`Could not fetch font across proxies (${lastErr ? lastErr.message : 'timeout'}).`);
}

// Decode Supply Family / Base64 URL parameter
function decodeBase64UrlParam(targetUrl) {
    try {
        const parsed = new URL(targetUrl);
        for (let param of ['font', 'src', 'url', 'file', 'data', 'path']) {
            const val = parsed.searchParams.get(param);
            if (val) {
                try {
                    let cleaned = val.replace(/-/g, '+').replace(/_/g, '/');
                    while (cleaned.length % 4) cleaned += '=';
                    const decoded = atob(decodeURIComponent(cleaned));
                    if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
                        return decoded;
                    }
                } catch (e) {}
            }
        }
    } catch (e) {}
    return targetUrl;
}

// Extract Fonts from URL Handler
async function handleUrlExtraction() {
    const urlInput = document.getElementById('urlInput');
    const rawText = urlInput.value.trim();
    if (!rawText) {
        showAlert('Please enter at least one URL.', 'error');
        return;
    }
    
    const urls = rawText.split('\n').map(u => u.trim()).filter(Boolean);
    const spinner = document.getElementById('urlSpinner');
    const btn = document.getElementById('extractUrlBtn');
    
    spinner.classList.remove('hidden');
    btn.disabled = true;
    let countAdded = 0;
    
    for (const inputUrl of urls) {
        try {
            const targetUrl = decodeBase64UrlParam(inputUrl);
            const { data } = await fetchWithCorsFallback(targetUrl);
            const fmt = detectFontFormat(data);
            
            if (fmt !== 'unknown') {
                const meta = extractMetadata(data, fmt);
                let filename = decodeURIComponent(targetUrl.split('?')[0].split('/').pop()) || `font.${fmt}`;
                if (!filename.includes('.')) filename += `.${fmt}`;
                
                await addFontEntry({
                    id: 'font_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                    filename: filename,
                    format: fmt,
                    bytes: data,
                    metadata: meta,
                    source: targetUrl
                });
                countAdded++;
            } else {
                const decoder = new TextDecoder('utf-8');
                const text = decoder.decode(data);
                const urlMatches = [...text.matchAll(/url\(\s*['"]?(.*?)['"]?\s*\)/gi)];
                
                let foundSub = 0;
                for (const match of urlMatches) {
                    const subRaw = match[1].trim();
                    if (subRaw.includes('.woff2') || subRaw.includes('.woff') || subRaw.includes('.otf') || subRaw.includes('.ttf')) {
                        try {
                            const resolved = new URL(subRaw, targetUrl).href;
                            const subRes = await fetchWithCorsFallback(resolved);
                            const subFmt = detectFontFormat(subRes.data);
                            if (subFmt !== 'unknown') {
                                const subMeta = extractMetadata(subRes.data, subFmt);
                                let subName = decodeURIComponent(resolved.split('?')[0].split('/').pop()) || `font.${subFmt}`;
                                await addFontEntry({
                                    id: 'font_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                                    filename: subName,
                                    format: subFmt,
                                    bytes: subRes.data,
                                    metadata: subMeta,
                                    source: resolved
                                });
                                foundSub++;
                                countAdded++;
                            }
                        } catch (e) {}
                    }
                }
                if (foundSub === 0) {
                    showAlert(`No recognized font found at ${inputUrl}`, 'error');
                }
            }
        } catch (err) {
            const decodedUrl = decodeBase64UrlParam(inputUrl);
            if (decodedUrl !== inputUrl) {
                showHtmlAlert(`Extraction issue. Direct Link: <a href="${decodedUrl}" target="_blank" style="color: #fff; text-decoration: underline; font-weight: bold;">Download Font Directly</a> and drop it into the upload tab!`, 'error');
            } else {
                showAlert(`Error extracting ${inputUrl}: ${err.message}`, 'error');
            }
        }
    }
    
    spinner.classList.add('hidden');
    btn.disabled = false;
    
    if (countAdded > 0) {
        showAlert(`Successfully extracted ${countAdded} font(s)!`, 'success');
        urlInput.value = '';
    }
}

// Local File Upload Handler
async function handleFileUpload(files) {
    let countAdded = 0;
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            const arrayBuf = await file.arrayBuffer();
            const data = new Uint8Array(arrayBuf);
            const fmt = detectFontFormat(data);
            
            if (fmt === 'unknown') {
                showAlert(`File '${file.name}' is not a recognized font format.`, 'error');
                continue;
            }
            
            const meta = extractMetadata(data, fmt);
            await addFontEntry({
                id: 'font_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                filename: file.name,
                format: fmt,
                bytes: data,
                metadata: meta,
                source: 'local-upload'
            });
            countAdded++;
        } catch (e) {
            showAlert(`Error reading '${file.name}': ${e.message}`, 'error');
        }
    }
    if (countAdded > 0) {
        showAlert(`Uploaded ${countAdded} font(s)!`, 'success');
    }
}

// Add Font Entry
async function addFontEntry(fontObj) {
    const mimeMap = {
        'woff2': 'font/woff2',
        'woff': 'font/woff',
        'otf': 'font/otf',
        'ttf': 'font/ttf'
    };
    
    const blob = new Blob([fontObj.bytes], { type: mimeMap[fontObj.format] || 'application/octet-stream' });
    fontObj.blobUrl = URL.createObjectURL(blob);
    fontObj.size_bytes = fontObj.bytes.length;
    
    loadedFonts.push(fontObj);
    updateControlsState();
    
    const fontFamName = `CustomFont_${fontObj.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
    try {
        const fontFace = new FontFace(fontFamName, `url('${fontObj.blobUrl}')`);
        const loadedFace = await fontFace.load();
        document.fonts.add(loadedFace);
        loadedFontFaces.set(fontObj.id, fontFamName);
    } catch (e) {
        console.warn('FontFace preview load warning:', e);
    }
    
    renderFontCard(fontObj, fontFamName);
}

// Render Font Card
function renderFontCard(font, fontFamName) {
    const grid = document.getElementById('fontsGrid');
    const card = document.createElement('div');
    card.className = 'font-card';
    card.id = `font-card-${font.id}`;
    
    const meta = font.metadata || {};
    const sizeKb = (font.size_bytes / 1024).toFixed(1);
    const fmt = (font.format || 'unknown').toLowerCase();
    
    const previewText = document.getElementById('globalPreviewText').value || "Sphinx of black quartz, judge my vow 1234567890 !?@#$";
    const currentSize = document.getElementById('fontSizeSlider').value + 'px';
    const currentSpacing = document.getElementById('letterSpacingSlider').value + 'px';
    const currentHeight = document.getElementById('lineHeightSlider').value;
    
    const isWebFont = (fmt === 'woff2' || fmt === 'woff');
    
    card.innerHTML = `
        <div class="font-card-header">
            <div class="font-title-block">
                <h3>${meta.family_name || font.filename}</h3>
                <div class="font-badges">
                    <span class="badge badge-format-${fmt}">${fmt}</span>
                    <span class="badge badge-subfamily">${meta.subfamily_name || 'Regular'}</span>
                    <span class="badge badge-subfamily">${meta.outline_type || 'Outline'}</span>
                    <span class="badge badge-size">${sizeKb} KB</span>
                    <span class="badge badge-size">${meta.glyph_count || 0} Glyphs</span>
                </div>
            </div>
            <div class="card-right-actions">
                <button class="btn btn-ghost btn-sm" onclick="inspectFont('${font.id}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                    Inspect
                </button>
                <button class="btn btn-danger-ghost btn-sm" onclick="removeFont('${font.id}')">
                    &times;
                </button>
            </div>
        </div>
        
        <div class="font-preview-stage" id="preview-stage-${font.id}" 
             style="font-family: '${fontFamName}', sans-serif; font-size: ${currentSize}; letter-spacing: ${currentSpacing}; line-height: ${currentHeight};"
             contenteditable="true">
            ${previewText}
        </div>
        
        <div class="font-card-actions">
            <div class="convert-btn-group">
                <span class="convert-label">Convert to:</span>
                <button class="btn-convert ${isWebFont ? 'highlight-otf' : ''}" onclick="convertSingleFont('${font.id}', 'otf')">
                    ${isWebFont ? '★ Convert to OTF' : 'OTF'}
                </button>
                <button class="btn-convert" onclick="convertSingleFont('${font.id}', 'ttf')">TTF</button>
            </div>
            <div class="card-right-actions">
                <button class="btn btn-secondary btn-sm" onclick="downloadFontFile('${font.id}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    Download (${fmt.toUpperCase()})
                </button>
            </div>
        </div>
    `;
    
    grid.prepend(card);
}

// Convert Single Font
async function convertSingleFont(fontId, targetFormat) {
    const font = loadedFonts.find(f => f.id === fontId);
    if (!font) return;
    
    try {
        const result = await clientConvertFont(font.bytes, targetFormat);
        const meta = extractMetadata(result.bytes, result.format);
        const baseName = font.filename.replace(/\.[^/.]+$/, "");
        const newFilename = `${baseName}.${result.format}`;
        
        await addFontEntry({
            id: 'font_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            filename: newFilename,
            format: result.format,
            bytes: result.bytes,
            metadata: meta,
            source: `Converted from ${font.filename} (${font.format.toUpperCase()} -> ${result.format.toUpperCase()})`
        });
        showAlert(`Successfully converted to ${result.format.toUpperCase()}!`, 'success');
    } catch (e) {
        showAlert(`Conversion failed: ${e.message}`, 'error');
    }
}

// Direct File Download
function downloadFontFile(fontId) {
    const font = loadedFonts.find(f => f.id === fontId);
    if (!font) return;
    
    const a = document.createElement('a');
    a.href = font.blobUrl;
    a.download = font.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
}

// Download Zip
async function handleDownloadZip() {
    if (loadedFonts.length === 0) return;
    const targetFormat = document.getElementById('batchFormatSelect').value;
    
    try {
        if (typeof JSZip === 'undefined') throw new Error('JSZip library not loaded');
        const zip = new JSZip();
        const usedNames = {};
        
        for (let font of loadedFonts) {
            let dataToSave = font.bytes;
            let ext = font.format;
            
            if (targetFormat !== 'original' && targetFormat !== font.format) {
                try {
                    const conv = await clientConvertFont(font.bytes, targetFormat);
                    dataToSave = conv.bytes;
                    ext = conv.format;
                } catch (e) {}
            }
            
            const baseName = font.filename.replace(/\.[^/.]+$/, "");
            let finalName = `${baseName}.${ext}`;
            
            if (usedNames[finalName]) {
                usedNames[finalName]++;
                finalName = `${baseName}_${usedNames[finalName]}.${ext}`;
            } else {
                usedNames[finalName] = 1;
            }
            zip.file(finalName, dataToSave);
        }
        
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const downloadUrl = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `extracted_fonts_${targetFormat}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(downloadUrl);
        showAlert('ZIP download started!', 'success');
    } catch (e) {
        showAlert(`Download ZIP failed: ${e.message}`, 'error');
    }
}

// Remove Font
function removeFont(fontId) {
    const fontIndex = loadedFonts.findIndex(f => f.id === fontId);
    if (fontIndex !== -1) {
        const font = loadedFonts[fontIndex];
        if (font.blobUrl) URL.revokeObjectURL(font.blobUrl);
        loadedFonts.splice(fontIndex, 1);
    }
    const card = document.getElementById(`font-card-${fontId}`);
    if (card) card.remove();
    updateControlsState();
}

// Clear All
function handleClearAll() {
    loadedFonts.forEach(f => { if (f.blobUrl) URL.revokeObjectURL(f.blobUrl); });
    loadedFonts = [];
    document.getElementById('fontsGrid').innerHTML = '';
    updateControlsState();
}

// UI State
function updateControlsState() {
    const controls = document.getElementById('controlsSection');
    const emptyState = document.getElementById('emptyState');
    const countBadge = document.getElementById('totalFontsCount');
    
    const count = loadedFonts.length;
    countBadge.textContent = `${count} Font${count === 1 ? '' : 's'}`;
    
    if (count > 0) {
        controls.classList.remove('hidden');
        emptyState.classList.add('hidden');
    } else {
        controls.classList.add('hidden');
        emptyState.classList.remove('hidden');
    }
}

// Modal Inspection
function initModal() {
    const modal = document.getElementById('glyphModal');
    const closeBtn = document.getElementById('closeModalBtn');
    const backdrop = modal.querySelector('.modal-backdrop');
    const closeModal = () => modal.classList.add('hidden');
    closeBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', closeModal);
}

function inspectFont(fontId) {
    const font = loadedFonts.find(f => f.id === fontId);
    if (!font) return;
    
    const meta = font.metadata || {};
    const modal = document.getElementById('glyphModal');
    const title = document.getElementById('modalFontTitle');
    const body = document.getElementById('modalBody');
    
    title.textContent = `${meta.full_name || font.filename} Details`;
    const fontFamName = loadedFontFaces.get(fontId) || 'sans-serif';
    
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;':\",.<>?/~`";
    let glyphBoxes = '';
    for (let char of chars) {
        glyphBoxes += `<div class="glyph-box" style="font-family: '${fontFamName}', sans-serif">${char}</div>`;
    }
    
    body.innerHTML = `
        <table class="meta-table">
            <tr><th>Font Family</th><td>${meta.family_name || 'N/A'}</td></tr>
            <tr><th>Subfamily / Weight</th><td>${meta.subfamily_name || 'Regular'}</td></tr>
            <tr><th>Full Name</th><td>${meta.full_name || 'N/A'}</td></tr>
            <tr><th>PostScript Name</th><td>${meta.postscript_name || 'N/A'}</td></tr>
            <tr><th>Format</th><td>${font.format.toUpperCase()} (${meta.outline_type || 'N/A'})</td></tr>
            <tr><th>File Size</th><td>${(font.size_bytes / 1024).toFixed(2)} KB (${font.size_bytes.toLocaleString()} bytes)</td></tr>
            <tr><th>Glyph Count</th><td>${meta.glyph_count || 'N/A'}</td></tr>
            <tr><th>Units Per Em</th><td>${meta.units_per_em || 1000}</td></tr>
            <tr><th>Tables Included</th><td>${(meta.tables || []).join(', ')}</td></tr>
            <tr><th>Source</th><td style="word-break: break-all;">${font.source || 'N/A'}</td></tr>
        </table>
        
        <h4 style="margin-bottom: 12px; font-size: 14px; font-weight: 600; color: var(--text-secondary);">Character Set Preview</h4>
        <div class="glyph-grid">
            ${glyphBoxes}
        </div>
    `;
    modal.classList.remove('hidden');
}

// Theme & Tabs & Controls Init
function initTheme() {
    const themeBtn = document.getElementById('themeToggleBtn');
    const savedTheme = localStorage.getItem('font_studio_theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
    }
    themeBtn.addEventListener('click', () => {
        if (document.body.classList.contains('dark-theme')) {
            document.body.classList.remove('dark-theme');
            document.body.classList.add('light-theme');
            localStorage.setItem('font_studio_theme', 'light');
        } else {
            document.body.classList.remove('light-theme');
            document.body.classList.add('dark-theme');
            localStorage.setItem('font_studio_theme', 'dark');
        }
    });
}

function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const targetId = btn.getAttribute('data-tab');
            document.getElementById(targetId).classList.add('active');
        });
    });
}

function initPresets() {
    const urlInput = document.getElementById('urlInput');
    document.getElementById('presetSupplyFamily').addEventListener('click', () => {
        urlInput.value = "https://supply.family/wp-json/font-tester/v1/font/?font=aHR0cHM6Ly9zdG9yYWdlLmdvb2dsZWFwaXMuY29tL3N1cHBseWZhbWlseV9ob3N0L3dwLWNvbnRlbnQvZGlnaXRhbC1wcm9kdWN0cy1hdXRvbWF0ZWQvdHlwZS1tYW5pYS9Hb3NoLVRNL0dvc2glMjBUTS5vdGY=";
    });
    document.getElementById('presetDirectFont').addEventListener('click', () => {
        urlInput.value = "https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff2";
    });
}

function initDropZone() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); dropZone.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); dropZone.classList.remove('dragover'); });
    });
    dropZone.addEventListener('drop', (e) => {
        if (e.dataTransfer.files.length > 0) handleFileUpload(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFileUpload(e.target.files);
    });
}

function initGlobalControls() {
    const previewInput = document.getElementById('globalPreviewText');
    const sizeSlider = document.getElementById('fontSizeSlider');
    const spacingSlider = document.getElementById('letterSpacingSlider');
    const heightSlider = document.getElementById('lineHeightSlider');
    const sizeVal = document.getElementById('fontSizeVal');
    const spacingVal = document.getElementById('letterSpacingVal');
    const heightVal = document.getElementById('lineHeightVal');
    
    previewInput.addEventListener('input', () => {
        const val = previewInput.value || " ";
        document.querySelectorAll('.font-preview-stage').forEach(el => { el.textContent = val; });
    });
    sizeSlider.addEventListener('input', (e) => {
        const px = e.target.value + 'px';
        sizeVal.textContent = px;
        document.querySelectorAll('.font-preview-stage').forEach(el => { el.style.fontSize = px; });
    });
    spacingSlider.addEventListener('input', (e) => {
        const px = e.target.value + 'px';
        spacingVal.textContent = px;
        document.querySelectorAll('.font-preview-stage').forEach(el => { el.style.letterSpacing = px; });
    });
    heightSlider.addEventListener('input', (e) => {
        const lh = e.target.value;
        heightVal.textContent = lh;
        document.querySelectorAll('.font-preview-stage').forEach(el => { el.style.lineHeight = lh; });
    });
    document.querySelectorAll('.pangram-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const text = chip.getAttribute('data-text');
            previewInput.value = text;
            previewInput.dispatchEvent(new Event('input'));
        });
    });
}

function showAlert(message, type = 'error') {
    const alertBox = document.getElementById('alertBox');
    alertBox.textContent = message;
    alertBox.className = `alert-box ${type}`;
    alertBox.classList.remove('hidden');
    setTimeout(() => { alertBox.classList.add('hidden'); }, 8000);
}

function showHtmlAlert(htmlMessage, type = 'error') {
    const alertBox = document.getElementById('alertBox');
    alertBox.innerHTML = htmlMessage;
    alertBox.className = `alert-box ${type}`;
    alertBox.classList.remove('hidden');
    setTimeout(() => { alertBox.classList.add('hidden'); }, 12000);
}

window.inspectFont = inspectFont;
window.removeFont = removeFont;
window.convertSingleFont = convertSingleFont;
window.downloadFontFile = downloadFontFile;
