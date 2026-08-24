import re
import io
import base64
import urllib.parse
import urllib.request
from typing import List, Dict, Any, Optional, Tuple
from converter import detect_font_format, get_font_metadata

DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,font/woff2,font/woff,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
}

def safe_b64decode(b64_str: str) -> Optional[bytes]:
    """
    Safely pad and decode a base64 string.
    """
    cleaned = b64_str.strip()
    # Remove any URL encoding
    cleaned = urllib.parse.unquote(cleaned)
    # Fix padding
    missing_padding = len(cleaned) % 4
    if missing_padding:
        cleaned += '=' * (4 - missing_padding)
    try:
        return base64.b64decode(cleaned, validate=False)
    except Exception:
        try:
            return base64.urlsafe_b64decode(cleaned)
        except Exception:
            return None

def extract_base64_from_url(url: str) -> Optional[str]:
    """
    Check if URL has query parameters with base64 encoded font paths (e.g. ?font=..., ?src=...).
    """
    try:
        parsed = urllib.parse.urlparse(url)
        query_params = urllib.parse.parse_qs(parsed.query)
        for key in ('font', 'src', 'url', 'file', 'data', 'path'):
            if key in query_params:
                for val in query_params[key]:
                    decoded = safe_b64decode(val)
                    if decoded:
                        try:
                            text = decoded.decode('utf-8')
                            if text.startswith('http://') or text.startswith('https://'):
                                return text
                        except UnicodeDecodeError:
                            pass
    except Exception:
        pass
    return None

def fetch_url(url: str, timeout: int = 15) -> Tuple[Optional[bytes], str, Dict[str, str]]:
    """
    Fetch URL content with standard browser headers.
    Returns: (content_bytes, final_url, headers_dict)
    """
    req = urllib.request.Request(url, headers=DEFAULT_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            content = resp.read()
            final_url = resp.geturl()
            headers = {k.lower(): v for k, v in resp.headers.items()}
            return content, final_url, headers
    except Exception as e:
        return None, url, {'error': str(e)}

def parse_css_for_fonts(css_text: str, base_url: str) -> List[Dict[str, Any]]:
    """
    Parse CSS text to find all font URLs referenced in url(...) declarations.
    """
    results = []
    # Match url('...'), url("..."), url(...)
    url_pattern = re.compile(r'''url\(\s*['"]?(.*?)['"]?\s*\)''', re.IGNORECASE)
    
    seen_urls = set()
    
    for match in url_pattern.finditer(css_text):
        raw_url = match.group(1).strip()
        if not raw_url or raw_url.startswith('data:image'):
            continue
            
        if raw_url.startswith('data:'):
            # Data URI font
            # data:[<mediatype>][;base64],<data>
            if 'base64,' in raw_url:
                header, b64_data = raw_url.split('base64,', 1)
                font_bytes = safe_b64decode(b64_data)
                if font_bytes:
                    fmt = detect_font_format(font_bytes)
                    if fmt != 'unknown':
                        meta = get_font_metadata(font_bytes)
                        fn = meta.get('full_name', 'embedded_font').replace(' ', '_').lower() + f".{fmt}"
                        results.append({
                            'source_url': 'data-uri-embedded',
                            'filename': fn,
                            'data': font_bytes,
                            'metadata': meta,
                            'format': fmt
                        })
            continue
            
        # Clean fragment identifier like #iefix or query params like ?v=1.2.0 for extension check
        clean_url = raw_url.split('#')[0].split('?')[0]
        ext = clean_url.split('.')[-1].lower() if '.' in clean_url else ''
        
        if ext in ('woff2', 'woff', 'otf', 'ttf', 'eot') or 'font' in raw_url.lower():
            resolved = urllib.parse.urljoin(base_url, raw_url)
            if resolved not in seen_urls:
                seen_urls.add(resolved)
                results.append({'url': resolved})
                
    return results

def extract_fonts(target: str) -> List[Dict[str, Any]]:
    """
    Main extraction pipeline. Supports:
    - Base64 param URLs (Supply Family font tester, etc.)
    - Direct font URLs
    - CSS file URLs
    - Webpage URLs
    """
    target = target.strip()
    extracted_fonts: List[Dict[str, Any]] = []
    
    # 1. Check if the target is a raw base64 string directly
    if not target.startswith('http://') and not target.startswith('https://'):
        decoded = safe_b64decode(target)
        if decoded:
            try:
                decoded_str = decoded.decode('utf-8')
                if decoded_str.startswith('http://') or decoded_str.startswith('https://'):
                    target = decoded_str
            except UnicodeDecodeError:
                # Might be raw font binary in base64
                fmt = detect_font_format(decoded)
                if fmt != 'unknown':
                    meta = get_font_metadata(decoded)
                    fn = meta.get('full_name', 'extracted_font').replace(' ', '_').lower() + f".{fmt}"
                    return [{
                        'source_url': 'base64-input',
                        'filename': fn,
                        'data': decoded,
                        'metadata': meta,
                        'format': fmt
                    }]
    
    # 2. Check for base64 parameter inside URL (e.g. Supply Family)
    extracted_b64_url = extract_base64_from_url(target)
    urls_to_fetch = [extracted_b64_url] if extracted_b64_url else [target]
    
    for current_url in urls_to_fetch:
        content, final_url, headers = fetch_url(current_url)
        if content is None:
            continue
            
        fmt = detect_font_format(content)
        content_type = headers.get('content-type', '').lower()
        
        if fmt != 'unknown':
            # It's a valid font file
            meta = get_font_metadata(content)
            url_filename = current_url.split('?')[0].split('/')[-1]
            if not url_filename or not ('.' in url_filename):
                url_filename = meta.get('full_name', 'font').replace(' ', '_').lower() + f".{fmt}"
            extracted_fonts.append({
                'source_url': current_url,
                'filename': url_filename,
                'data': content,
                'metadata': meta,
                'format': fmt
            })
            continue
            
        # If response is text (HTML / CSS)
        text = ''
        try:
            text = content.decode('utf-8', errors='ignore')
        except Exception:
            continue
            
        if 'text/css' in content_type or current_url.endswith('.css'):
            # Parse CSS
            css_fonts = parse_css_for_fonts(text, final_url)
            for item in css_fonts:
                if 'data' in item:
                    extracted_fonts.append(item)
                elif 'url' in item:
                    f_content, f_final_url, f_headers = fetch_url(item['url'])
                    if f_content:
                        f_fmt = detect_font_format(f_content)
                        if f_fmt != 'unknown':
                            f_meta = get_font_metadata(f_content)
                            f_name = item['url'].split('?')[0].split('/')[-1]
                            if not f_name or '.' not in f_name:
                                f_name = f_meta.get('full_name', 'font').replace(' ', '_').lower() + f".{f_fmt}"
                            extracted_fonts.append({
                                'source_url': item['url'],
                                'filename': f_name,
                                'data': f_content,
                                'metadata': f_meta,
                                'format': f_fmt
                            })
        else:
            # HTML page: Look for <link rel="stylesheet">, <style>, <link rel="preload" as="font">
            # 1. Inline styles
            style_blocks = re.findall(r'<style[^>]*>(.*?)</style>', text, re.IGNORECASE | re.DOTALL)
            for style in style_blocks:
                css_fonts = parse_css_for_fonts(style, final_url)
                for item in css_fonts:
                    if 'data' in item:
                        extracted_fonts.append(item)
                    elif 'url' in item:
                        f_content, f_final_url, f_headers = fetch_url(item['url'])
                        if f_content:
                            f_fmt = detect_font_format(f_content)
                            if f_fmt != 'unknown':
                                f_meta = get_font_metadata(f_content)
                                f_name = item['url'].split('?')[0].split('/')[-1]
                                extracted_fonts.append({
                                    'source_url': item['url'],
                                    'filename': f_name,
                                    'data': f_content,
                                    'metadata': f_meta,
                                    'format': f_fmt
                                })
            
            # 2. Linked stylesheets
            link_tags = re.findall(r'<link[^>]+>', text, re.IGNORECASE)
            for tag in link_tags:
                href_match = re.search(r'href=[\'"]([^\'"]+)[\'"]', tag, re.IGNORECASE)
                rel_match = re.search(r'rel=[\'"]([^\'"]+)[\'"]', tag, re.IGNORECASE)
                as_match = re.search(r'as=[\'"]([^\'"]+)[\'"]', tag, re.IGNORECASE)
                
                if not href_match:
                    continue
                href = href_match.group(1)
                rel = rel_match.group(1).lower() if rel_match else ''
                as_type = as_match.group(1).lower() if as_match else ''
                
                resolved_link = urllib.parse.urljoin(final_url, href)
                
                if 'stylesheet' in rel or href.endswith('.css'):
                    sub_css, _, _ = fetch_url(resolved_link)
                    if sub_css:
                        sub_text = sub_css.decode('utf-8', errors='ignore')
                        sub_fonts = parse_css_for_fonts(sub_text, resolved_link)
                        for item in sub_fonts:
                            if 'data' in item:
                                extracted_fonts.append(item)
                            elif 'url' in item:
                                f_content, _, _ = fetch_url(item['url'])
                                if f_content:
                                    f_fmt = detect_font_format(f_content)
                                    if f_fmt != 'unknown':
                                        f_meta = get_font_metadata(f_content)
                                        f_name = item['url'].split('?')[0].split('/')[-1]
                                        extracted_fonts.append({
                                            'source_url': item['url'],
                                            'filename': f_name,
                                            'data': f_content,
                                            'metadata': f_meta,
                                            'format': f_fmt
                                        })
                elif as_type == 'font' or any(href.lower().endswith(x) for x in ('.woff2', '.woff', '.otf', '.ttf')):
                    f_content, _, _ = fetch_url(resolved_link)
                    if f_content:
                        f_fmt = detect_font_format(f_content)
                        if f_fmt != 'unknown':
                            f_meta = get_font_metadata(f_content)
                            f_name = resolved_link.split('?')[0].split('/')[-1]
                            extracted_fonts.append({
                                'source_url': resolved_link,
                                'filename': f_name,
                                'data': f_content,
                                'metadata': f_meta,
                                'format': f_fmt
                            })
                            
    return extracted_fonts
