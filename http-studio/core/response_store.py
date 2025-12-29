import time
import secrets

class ResponseStore:
    """
    Small in-memory store for raw responses to support download button.
    TTL default: 5 minutes.
    """
    def __init__(self, ttl_seconds=300, max_items=100):
        self.ttl = ttl_seconds
        self.max_items = max_items
        self._store = {}  # id -> (expire_ts, raw_bytes, content_type)

    def put(self, raw: bytes, content_type: str) -> str:
        self._cleanup()
        if len(self._store) >= self.max_items:
            self._cleanup(force=True)
        rid = secrets.token_urlsafe(10)
        self._store[rid] = (time.time() + self.ttl, raw or b"", content_type or "application/octet-stream")
        return rid

    def get(self, rid: str):
        self._cleanup()
        item = self._store.get(rid)
        if not item:
            return None
        exp, raw, ct = item
        if time.time() > exp:
            self._store.pop(rid, None)
            return None
        return raw, ct

    def _cleanup(self, force=False):
        now = time.time()
        # remove expired
        expired = [k for k, (exp, _, __) in self._store.items() if exp < now]
        for k in expired:
            self._store.pop(k, None)
        if force and self._store:
            # remove oldest
            keys = list(self._store.keys())
            for k in keys[: max(1, len(keys)//3)]:
                self._store.pop(k, None)

response_store = ResponseStore()
