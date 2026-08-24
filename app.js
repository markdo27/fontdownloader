// Font Extractor & Converter Studio Frontend App
let loadedFonts = []; // Array of font objects
let loadedFontFaces = new Map(); // id -> FontFace

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

// Theme Management
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

// Tab Switching
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

// Presets
function initPresets() {
    const urlInput = document.getElementById('urlInput');
    document.getElementById('presetSupplyFamily').addEventListener('click', () => {
        urlInput.value = "https://supply.family/wp-json/font-tester/v1/font/?font=aHR0cHM6Ly9zdG9yYWdlLmdvb2dsZWFwaXMuY29tL3N1cHBseWZhbWlseV9ob3N0L3dwLWNvbnRlbnQvZGlnaXRhbC1wcm9kdWN0cy1hdXRvbWF0ZWQvZmVic3BhY2Utc3R1ZGlvL2Zic2Z1bmVncmFsLWNvbXByZXNzZWQvZmJzZnVuZWdyYWwtY29tcHJlc3NlZC5vdGY=";
    });
    
    document.getElementById('presetDirectFont').addEventListener('click', () => {
        urlInput.value = "https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff2";
    });
}

// Drop Zone Setup
function initDropZone() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('dragover');
        });
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('dragover');
        });
    });
    
    dropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileUpload(files);
        }
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files);
        }
    });
}

// Global Preview Controls
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
        document.querySelectorAll('.font-preview-stage').forEach(el => {
            el.textContent = val;
        });
    });
    
    sizeSlider.addEventListener('input', (e) => {
        const px = e.target.value + 'px';
        sizeVal.textContent = px;
        document.querySelectorAll('.font-preview-stage').forEach(el => {
            el.style.fontSize = px;
        });
    });
    
    spacingSlider.addEventListener('input', (e) => {
        const px = e.target.value + 'px';
        spacingVal.textContent = px;
        document.querySelectorAll('.font-preview-stage').forEach(el => {
            el.style.letterSpacing = px;
        });
    });
    
    heightSlider.addEventListener('input', (e) => {
        const lh = e.target.value;
        heightVal.textContent = lh;
        document.querySelectorAll('.font-preview-stage').forEach(el => {
            el.style.lineHeight = lh;
        });
    });
    
    document.querySelectorAll('.pangram-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const text = chip.getAttribute('data-text');
            previewInput.value = text;
            previewInput.dispatchEvent(new Event('input'));
        });
    });
}

// Alerts
function showAlert(message, type = 'error') {
    const alertBox = document.getElementById('alertBox');
    alertBox.textContent = message;
    alertBox.className = `alert-box ${type}`;
    alertBox.classList.remove('hidden');
    setTimeout(() => {
        alertBox.classList.add('hidden');
    }, 6000);
}

// URL Extraction Handler
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
    
    try {
        const res = await fetch('/api/extract/url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls })
        });
        const data = await res.json();
        
        if (data.errors && data.errors.length > 0) {
            showAlert(data.errors.join(' | '), 'error');
        }
        
        if (data.fonts && data.fonts.length > 0) {
            data.fonts.forEach(f => addFont(f));
            showAlert(`Successfully extracted ${data.fonts.length} font(s)!`, 'success');
            urlInput.value = '';
        }
    } catch (e) {
        showAlert(`Extraction failed: ${e.message}`, 'error');
    } finally {
        spinner.classList.add('hidden');
        btn.disabled = false;
    }
}

// File Upload Handler
async function handleFileUpload(files) {
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
    }
    
    try {
        const res = await fetch('/api/extract/upload', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        
        if (data.errors && data.errors.length > 0) {
            showAlert(data.errors.join(' | '), 'error');
        }
        
        if (data.fonts && data.fonts.length > 0) {
            data.fonts.forEach(f => addFont(f));
            showAlert(`Successfully uploaded ${data.fonts.length} font(s)!`, 'success');
        }
    } catch (e) {
        showAlert(`Upload failed: ${e.message}`, 'error');
    }
}

// Add Font to State and DOM
async function addFont(fontObj) {
    loadedFonts.push(fontObj);
    updateControlsState();
    
    // Register font face for live preview
    const fontId = fontObj.id;
    const fontFamName = `CustomFont_${fontId.replace(/-/g, '_')}`;
    const fontUrl = `/api/font/${fontId}/preview`;
    
    try {
        const fontFace = new FontFace(fontFamName, `url('${fontUrl}')`);
        const loadedFace = await fontFace.load();
        document.fonts.add(loadedFace);
        loadedFontFaces.set(fontId, fontFamName);
    } catch (e) {
        console.warn('FontFace load error:', e);
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
    
    // Check if WOFF2/WOFF to highlight OTF conversion
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
                <button class="btn-convert" onclick="convertSingleFont('${font.id}', 'woff2')">WOFF2</button>
                <button class="btn-convert" onclick="convertSingleFont('${font.id}', 'woff')">WOFF</button>
            </div>
            <div class="card-right-actions">
                <a href="/api/font/${font.id}/download" class="btn btn-secondary btn-sm" download="${font.filename}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    Download (${fmt.toUpperCase()})
                </a>
            </div>
        </div>
    `;
    
    grid.prepend(card);
}

// Convert Single Font
async function convertSingleFont(fontId, targetFormat) {
    try {
        const res = await fetch('/api/convert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ font_id: fontId, target_format: targetFormat })
        });
        
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Conversion failed');
        }
        
        const newFont = await res.json();
        await addFont(newFont);
        showAlert(`Successfully converted to ${targetFormat.toUpperCase()}!`, 'success');
    } catch (e) {
        showAlert(`Conversion failed: ${e.message}`, 'error');
    }
}

// Remove Font
async function removeFont(fontId) {
    try {
        await fetch(`/api/font/${fontId}`, { method: 'DELETE' });
    } catch (e) {}
    
    loadedFonts = loadedFonts.filter(f => f.id !== fontId);
    const card = document.getElementById(`font-card-${fontId}`);
    if (card) card.remove();
    updateControlsState();
}

// Clear All
async function handleClearAll() {
    try {
        await fetch('/api/fonts/clear', { method: 'DELETE' });
    } catch (e) {}
    
    loadedFonts = [];
    document.getElementById('fontsGrid').innerHTML = '';
    updateControlsState();
}

// Download Zip
async function handleDownloadZip() {
    if (loadedFonts.length === 0) return;
    
    const targetFormat = document.getElementById('batchFormatSelect').value;
    const fontIds = loadedFonts.map(f => f.id);
    
    try {
        const res = await fetch('/api/download/zip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ font_ids: fontIds, target_format: targetFormat })
        });
        
        if (!res.ok) throw new Error('ZIP generation failed');
        
        const blob = await res.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `extracted_fonts_${targetFormat}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);
        showAlert('ZIP download started!', 'success');
    } catch (e) {
        showAlert(`Download ZIP failed: ${e.message}`, 'error');
    }
}

// Update UI State (Counts & Visibility)
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
    
    // Sample character set for preview
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
            <tr><th>Weight Class</th><td>${meta.weight_class || 400}</td></tr>
            <tr><th>Designer</th><td>${meta.designer || 'N/A'}</td></tr>
            <tr><th>Manufacturer</th><td>${meta.manufacturer || 'N/A'}</td></tr>
            <tr><th>Copyright</th><td>${meta.copyright || 'N/A'}</td></tr>
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

// Global scope bindings for inline HTML handlers
window.inspectFont = inspectFont;
window.removeFont = removeFont;
window.convertSingleFont = convertSingleFont;
