import re
import shlex
from urllib.parse import urlparse, parse_qsl, urlunparse

def _strip_query(url: str):
    p = urlparse(url)
    pairs = list(parse_qsl(p.query, keep_blank_values=True))
    url_no_query = urlunparse((p.scheme, p.netloc, p.path, p.params, "", p.fragment))
    return url_no_query, pairs

def _add_header(headers: dict, line: str):
    if ":" in line:
        k, v = line.split(":", 1)
        headers[k.strip()] = v.strip()

def parse_curl_bash(curl_text: str) -> dict:
    """
    Best-effort parser for DevTools Copy as cURL (bash).
    Returns a normalized request object for UI.
    """
    if not curl_text or "curl" not in curl_text:
        raise ValueError("未检测到 curl 命令（请粘贴 DevTools 的 Copy as cURL (bash)）。")

    t = curl_text.strip()
    t = re.sub(r"^\s*\$\s+", "", t)
    t = t.replace("\\\n", " ")

    try:
        tokens = shlex.split(t, posix=True)
    except Exception as e:
        raise ValueError(f"curl 解析失败（shlex）：{e}")

    curl_idx = 0
    for i, tok in enumerate(tokens):
        if tok == "curl" or tok.endswith("/curl"):
            curl_idx = i
            break
    tokens = tokens[curl_idx + 1 :]

    method = None
    urls = []
    headers = {}
    cookies = ""
    auth_user = ""
    proxy = ""
    follow_redirects = True
    insecure = False
    timeout = 20
    use_get_flag = False
    head_only = False

    data_chunks = []
    data_urlencode_chunks = []
    form_chunks = []
    compressed = False

    i = 0
    while i < len(tokens):
        tok = tokens[i]

        if tok.startswith("http://") or tok.startswith("https://"):
            urls.append(tok); i += 1; continue
        if tok == "--url" and i + 1 < len(tokens):
            urls.append(tokens[i + 1]); i += 2; continue

        if tok in ("-X", "--request") and i + 1 < len(tokens):
            method = tokens[i + 1].upper(); i += 2; continue

        if tok in ("-H", "--header") and i + 1 < len(tokens):
            _add_header(headers, tokens[i + 1]); i += 2; continue

        if tok in ("-b", "--cookie") and i + 1 < len(tokens):
            cookies = tokens[i + 1]; i += 2; continue

        if tok in ("-u", "--user") and i + 1 < len(tokens):
            auth_user = tokens[i + 1]; i += 2; continue

        if tok in ("-x", "--proxy") and i + 1 < len(tokens):
            proxy = tokens[i + 1]; i += 2; continue

        if tok in ("-L", "--location", "--location-trusted"):
            follow_redirects = True; i += 1; continue

        if tok in ("-k", "--insecure"):
            insecure = True; i += 1; continue

        if tok in ("-m", "--max-time") and i + 1 < len(tokens):
            try:
                timeout = int(float(tokens[i + 1]))
            except Exception:
                pass
            i += 2; continue

        if tok in ("-G", "--get"):
            use_get_flag = True; i += 1; continue

        if tok in ("-I", "--head"):
            head_only = True; i += 1; continue

        if tok in ("-d", "--data", "--data-raw", "--data-binary") and i + 1 < len(tokens):
            data_chunks.append(tokens[i + 1]); i += 2; continue

        if tok == "--data-urlencode" and i + 1 < len(tokens):
            data_urlencode_chunks.append(tokens[i + 1]); i += 2; continue

        if tok == "--json" and i + 1 < len(tokens):
            headers.setdefault("Content-Type", "application/json")
            data_chunks.append(tokens[i + 1])
            if not method:
                method = "POST"
            i += 2; continue

        if tok in ("-F", "--form") and i + 1 < len(tokens):
            form_chunks.append(tokens[i + 1]); i += 2; continue

        if tok == "--compressed":
            compressed = True; i += 1; continue

        i += 1

    if not urls:
        raise ValueError("未解析到 URL（请确认 curl 中包含 https://...）。")

    url = urls[0]
    url, url_q = _strip_query(url)
    query_pairs = list(url_q)

    if cookies and "Cookie" not in headers:
        headers["Cookie"] = cookies
    if compressed and "Accept-Encoding" not in headers:
        headers["Accept-Encoding"] = "gzip, deflate, br"

    if head_only:
        method = "HEAD"
    if not method:
        method = "POST" if (form_chunks or data_chunks or data_urlencode_chunks) else "GET"
    if use_get_flag:
        method = "GET"

    body_mode = "none"
    body_text = ""

    if form_chunks:
        body_mode = "multipart"
        body_text = "\n".join(form_chunks)
    else:
        if data_urlencode_chunks:
            pairs = []
            for item in data_urlencode_chunks:
                if "=" in item:
                    k, v = item.split("=", 1)
                    pairs.append((k, v))
                else:
                    pairs.append((item, ""))
            if use_get_flag:
                query_pairs.extend(pairs)
            else:
                body_mode = "form-urlencoded"
                body_text = "\n".join([f"{k}={v}" for k, v in pairs])

        if data_chunks:
            raw = "&".join(data_chunks).strip()
            if use_get_flag:
                pairs = []
                for part in raw.split("&"):
                    if "=" in part:
                        k, v = part.split("=", 1)
                        pairs.append((k, v))
                    elif part:
                        pairs.append((part, ""))
                query_pairs.extend(pairs)
            else:
                if raw.startswith("{") or raw.startswith("["):
                    body_mode = "json"; body_text = raw
                else:
                    if "&" in raw and "=" in raw and "\n" not in raw:
                        body_mode = "form-urlencoded"
                        body_text = "\n".join([p for p in raw.split("&") if p])
                    else:
                        body_mode = "raw"; body_text = raw

    return {
        "method": method,
        "url": url,
        "query_pairs": query_pairs,   # array of [k,v]
        "headers": headers,           # dict
        "cookies": cookies or "",
        "auth_user": auth_user or "",
        "proxy": proxy or "",
        "follow_redirects": bool(follow_redirects),
        "insecure": bool(insecure),
        "timeout": int(max(1, min(int(timeout), 120))),
        "body_mode": body_mode,
        "body_text": body_text,
    }
