from flask import Flask, render_template, request, jsonify
from core.curl_parser import parse_curl_bash
from core.sender import send_http_request
from core.response_store import response_store

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50MB


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/api/parse_curl")
def api_parse_curl():
    data = request.get_json(silent=True) or {}
    curl = data.get("curl", "")
    try:
        parsed = parse_curl_bash(curl)
        return jsonify(parsed)
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.post("/api/send")
def api_send():
    """
    Receives multipart/form-data (for file uploads) + fields.
    Returns response JSON (headers/body/text/json) and a download_id for binary download.
    """
    form = {
        "method": request.form.get("method", "GET"),
        "url": request.form.get("url", ""),
        "query_params": request.form.get("query_params", ""),
        "headers": request.form.get("headers", ""),
        "body_mode": request.form.get("body_mode", "none"),
        "body_text": request.form.get("body_text", ""),
        "timeout": request.form.get("timeout", 20),
        "verify_ssl": request.form.get("verify_ssl", "true"),
        "allow_redirects": request.form.get("allow_redirects", "true"),
        "proxy": request.form.get("proxy", ""),
        "auth_user": request.form.get("auth_user", ""),
        "cookies": request.form.get("cookies", ""),
    }

    try:
        resp = send_http_request(form, request.files)
        # store raw bytes for download (short TTL)
        download_id = response_store.put(resp.get("_raw_bytes", b""), resp.get("content_type", "application/octet-stream"))
        resp["download_id"] = download_id
        # do not return raw bytes in JSON
        resp.pop("_raw_bytes", None)
        return jsonify(resp)
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.get("/api/download/<download_id>")
def api_download(download_id: str):
    item = response_store.get(download_id)
    if not item:
        return jsonify({"error": "下载已过期或不存在"}), 404

    raw, content_type = item
    # Note: flask Response without importing Response directly
    from flask import Response
    return Response(raw, mimetype=content_type, headers={
        "Content-Disposition": f'attachment; filename="response_{download_id}"'
    })


if __name__ == "__main__":
    # http://127.0.0.1:5000
    app.run(host="127.0.0.1", port=5000, debug=True)
