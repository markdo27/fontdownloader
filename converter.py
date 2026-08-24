import io
import os
import struct
from typing import Dict, Any, Tuple, Optional
from fontTools.ttLib import TTFont

def detect_font_format(data: bytes) -> str:
    """
    Detect font format based on magic bytes.
    Returns: 'woff2', 'woff', 'otf', 'ttf', or 'unknown'
    """
    if len(data) < 4:
        return 'unknown'
    
    magic = data[:4]
    if magic == b'wOF2':
        return 'woff2'
    elif magic == b'wOFF':
        return 'woff'
    elif magic == b'OTTO':
        return 'otf'
    elif magic in (b'\x00\x01\x00\x00', b'true', b'typ1'):
        return 'ttf'
    return 'unknown'

def get_font_metadata(data: bytes) -> Dict[str, Any]:
    """
    Extract comprehensive metadata from font bytes.
    """
    metadata: Dict[str, Any] = {
        'format': detect_font_format(data),
        'size_bytes': len(data),
        'family_name': 'Unknown Family',
        'subfamily_name': 'Regular',
        'full_name': 'Unknown Font',
        'postscript_name': 'Unknown',
        'version': '',
        'designer': '',
        'manufacturer': '',
        'copyright': '',
        'outline_type': 'Unknown',
        'glyph_count': 0,
        'tables': [],
        'units_per_em': 1000,
        'weight_class': 400,
    }
    
    try:
        font = TTFont(io.BytesIO(data))
        metadata['tables'] = list(font.keys())
        
        # Outline type
        if 'CFF ' in font or 'CFF2' in font or font.sfntVersion == 'OTTO':
            metadata['outline_type'] = 'PostScript (CFF)'
        elif 'glyf' in font or font.sfntVersion in ('\x00\x01\x00\x00', 'true'):
            metadata['outline_type'] = 'TrueType'
            
        # Glyph count
        if 'maxp' in font and hasattr(font['maxp'], 'numGlyphs'):
            metadata['glyph_count'] = font['maxp'].numGlyphs
        elif hasattr(font, 'getGlyphOrder'):
            metadata['glyph_count'] = len(font.getGlyphOrder())
            
        # Head table
        if 'head' in font:
            metadata['units_per_em'] = getattr(font['head'], 'unitsPerEm', 1000)
            
        # OS/2 table
        if 'OS/2' in font:
            metadata['weight_class'] = getattr(font['OS/2'], 'usWeightClass', 400)
            
        # Name table extraction
        if 'name' in font:
            name_table = font['name']
            name_map = {
                1: 'family_name',
                2: 'subfamily_name',
                4: 'full_name',
                5: 'version',
                6: 'postscript_name',
                8: 'manufacturer',
                9: 'designer',
                0: 'copyright'
            }
            
            for record in name_table.names:
                name_id = record.nameID
                if name_id in name_map:
                    field = name_map[name_id]
                    try:
                        val = record.toUnicode()
                        if val and (metadata[field].startswith('Unknown') or not metadata[field] or record.platformID == 3):
                            metadata[field] = val.strip()
                    except Exception:
                        pass
                        
    except Exception as e:
        metadata['error'] = f"Metadata extraction warning: {str(e)}"
        
    return metadata

def convert_font(data: bytes, target_format: str) -> Tuple[bytes, str, str]:
    """
    Converts font binary data to target format.
    target_format: 'otf', 'ttf', 'woff', 'woff2'
    Returns: (converted_bytes, output_format, output_extension)
    """
    target = target_format.lower().strip().replace('.', '')
    valid_formats = ('otf', 'ttf', 'woff', 'woff2')
    if target not in valid_formats:
        raise ValueError(f"Unsupported target format '{target_format}'. Supported formats: {valid_formats}")

    source_format = detect_font_format(data)
    font = TTFont(io.BytesIO(data))
    
    has_cff = 'CFF ' in font or 'CFF2' in font or font.sfntVersion == 'OTTO'
    
    output_buf = io.BytesIO()
    
    if target == 'woff2':
        font.flavor = 'woff2'
        font.save(output_buf)
        ext = 'woff2'
        out_fmt = 'woff2'
    elif target == 'woff':
        font.flavor = 'woff'
        font.save(output_buf)
        ext = 'woff'
        out_fmt = 'woff'
    elif target in ('otf', 'ttf'):
        font.flavor = None
        font.save(output_buf)
        if has_cff:
            ext = 'otf'
            out_fmt = 'otf'
        else:
            ext = 'ttf' if target == 'ttf' else 'otf'
            out_fmt = 'ttf' if target == 'ttf' else 'otf'
            
    return output_buf.getvalue(), out_fmt, ext
