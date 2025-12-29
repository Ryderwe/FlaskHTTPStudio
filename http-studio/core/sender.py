import json
from urllib.parse import urlparse, parse_qsl, urlencode, urlunparse
import requests

from .security import validate_public_url

MAX_PREVIEW_BYTES = 2 * 1024 * 1024  # 2MB for preview (UI shows text), raw bytes stored for download


def parse_kv_text(text: str):
    out = []
    for line in (text or "").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            k, v = line.split("=", 1)
            out.append((k.strip(), v.strip()))
        else:
            out.append((line.strip(), ""))
    return out

def parse_headers_text(text: str):
    out = {}
    for line in (text or "").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            continue
        k, v = line.split(":", 1)
        out[k.strip()] = v.strip()
    return out

def merge_query(url: str, extra_pairs):
    p = urlparse(url)
    q = list(parse_qsl(p.query, keep_blank_values=True))
    q.extend(extra_pairs or [])
    new_query = urlencode(q, doseq=True)
    return urlunparse((p.scheme, p.netloc, p.path, p.params, new_query, p.fragment))

def build_multipart_from_text(body_text: str, uploaded_files):
    fields = {}
    files = {}
    for k, v in parse_kv_text(body_text):
        if not k:
            continue
        if v.startswith("@"):
            f = uploaded_files.get(k)
            if f and getattr(f, "filename", ""):
                files[k] = (f.filename, f.stream, f.mimetype or "application/octet-stream")
            else:
                fields[k] = v
        else:
            fields[k] = v
    return fields, files

def _safe_check_redirects(resp: requests.Response, allowed_ports=None):
    """
    After redirects are followed by requests, validate the final URL again to prevent redirect-to-internal.
    """
    final_url = str(resp.url)
    ok, msg = validate_public_url(final_url, allowed_ports=allowed_ports)
    if not ok:
        raise ValueError(f"重定向后的最终地址被安全策略阻止：{msg}")

def send_http_request(form, uploaded_files):
    method = (form.get("method") or "GET").upper().strip()
    url = (form.get("url") or "").strip()

    ok, msg = validate_public_url(url)
    if not ok:
        raise ValueError(msg)

    headers = parse_headers_text(form.get("headers", ""))
    query_pairs = parse_kv_text(form.get("query_params", ""))
    url = merge_query(url, query_pairs)

    timeout = int(float(form.get("timeout") or 20))
    timeout = max(1, min(timeout, 120))
    verify_ssl = (form.get("verify_ssl") or "true").lower() == "true"
    allow_redirects = (form.get("allow_redirects") or "true").lower() == "true"

    proxy = (form.get("proxy") or "").strip()
    proxies = {"http": proxy, "https": proxy} if proxy else None

    auth_user = (form.get("auth_user") or "").strip()
    auth = None
    if auth_user and ":" in auth_user:
        u, p = auth_user.split(":", 1)
        auth = (u, p)

    cookies = (form.get("cookies") or "").strip()
    if cookies and "Cookie" not in headers:
        headers["Cookie"] = cookies

    body_mode = (form.get("body_mode") or "none").strip()
    body_text = form.get("body_text", "") or ""

    req_kwargs = dict(
        method=method,
        url=url,
        headers=headers if headers else None,
        timeout=timeout,
        verify=verify_ssl,
        allow_redirects=allow_redirects,
        proxies=proxies,
        auth=auth,
        stream=True,  # stream so we can limit preview bytes
    )

    if body_mode == "none" or not body_text:
        pass
    elif body_mode == "json":
        try:
            req_kwargs["json"] = json.loads(body_text)
        except Exception as e:
            raise ValueError(f"JSON 解析失败：{e}")
    elif body_mode == "form-urlencoded":
        req_kwargs["data"] = dict(parse_kv_text(body_text))
    elif body_mode == "multipart":
        fields, files = build_multipart_from_text(body_text, uploaded_files)
        if files:
            req_kwargs["data"] = fields
            req_kwargs["files"] = files
        else:
            req_kwargs["files"] = {k: (None, v) for k, v in fields.items()}
    elif body_mode == "raw":
        raw_file = uploaded_files.get("__raw_file__")
        if raw_file and getattr(raw_file, "filename", ""):
            req_kwargs["data"] = raw_file.read()
            if req_kwargs.get("headers") is None:
                req_kwargs["headers"] = {}
            if "Content-Type" not in req_kwargs["headers"] and raw_file.mimetype:
                req_kwargs["headers"]["Content-Type"] = raw_file.mimetype
        else:
            req_kwargs["data"] = body_text.encode("utf-8")
    else:
        raise ValueError("未知 body_mode。")

    r = requests.request(**req_kwargs)

    # validate final redirect target
    if allow_redirects:
        _safe_check_redirects(r)

    # read bytes (preview limited)
    raw = b""
    total = 0
    for chunk in r.iter_content(chunk_size=64 * 1024):
        if not chunk:
            continue
        raw += chunk
        total += len(chunk)
        if total >= MAX_PREVIEW_BYTES:
            break

    # Also try to read remainder for download? (would defeat streaming limit)
    # We store only preview bytes for download. If you need full raw download, remove the limit.
    # (Keeping it safe to prevent memory blow-ups.)
    content_type = (r.headers.get("Content-Type") or "application/octet-stream").split(";")[0].strip()

    headers_text = "\n".join([f"{k}: {v}" for k, v in r.headers.items()])

    # body preview as text
    body_text_out = ""
    try:
        # best effort decode
        body_text_out = raw.decode(r.encoding or "utf-8", errors="replace")
    except Exception:
        body_text_out = raw.decode("utf-8", errors="replace")

    # pretty JSON if content-type indicates json
    if "application/json" in (r.headers.get("Content-Type") or "").lower():
        try:
            body_text_out = json.dumps(r.json(), ensure_ascii=False, indent=2)
        except Exception:
            pass

    return {
        "ok": bool(r.ok),
        "status_code": int(r.status_code),
        "reason": r.reason,
        "final_url": str(r.url),
        "elapsed_ms": int(getattr(r.elapsed, "total_seconds", lambda: 0)() * 1000),
        "body_len": int(r.headers.get("Content-Length") or len(raw)),
        "content_type": content_type,
        "headers_text": headers_text,
        "body_text": body_text_out,
        "_raw_bytes": raw,
        "truncated": total >= MAX_PREVIEW_BYTES,
    }
