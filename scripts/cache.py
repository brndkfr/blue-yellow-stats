"""Query-aware file cache for Swiss Unihockey API responses."""

import hashlib
import json
import logging
import os
from datetime import datetime, timezone
from urllib.parse import urlencode

import requests

log = logging.getLogger(__name__)

_BASE = "https://api-v2.swissunihockey.ch"
_SESSION = requests.Session()
_SESSION.headers.update({"Accept": "application/json"})


def _cache_path(cache_dir: str, endpoint: str, params: dict) -> str:
    sorted_qs = urlencode(sorted(params.items())) if params else ""
    key = f"{endpoint}?{sorted_qs}"
    digest = hashlib.sha256(key.encode()).hexdigest()
    return os.path.join(cache_dir, f"{digest}.json")


def _is_fresh(entry: dict, ttl_hours: int) -> bool:
    fetched = datetime.fromisoformat(entry["fetched_at"])
    age = (datetime.now(timezone.utc) - fetched).total_seconds()
    return age < ttl_hours * 3600


def fetch(endpoint: str, params: dict, cache_dir: str, ttl_hours: int,
          force: bool = False) -> dict | None:
    """Return cached response or fetch from API. Returns None on error / 404.

    force=True deletes the cache entry before fetching, guaranteeing a fresh
    network request regardless of TTL.
    """
    path = _cache_path(cache_dir, endpoint, params)

    if force and os.path.exists(path):
        os.remove(path)
        log.debug("cache busted: %s", endpoint)

    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as f:
                entry = json.load(f)
            if _is_fresh(entry, ttl_hours):
                return entry["data"]
        except (json.JSONDecodeError, KeyError):
            log.warning("corrupt cache entry, re-fetching: %s", path)

    url = f"{_BASE}{endpoint}"
    try:
        resp = _SESSION.get(url, params=params, timeout=15)
    except requests.RequestException as exc:
        log.warning("network error %s: %s", url, exc)
        return None

    entry = {
        "url": resp.url,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "status": resp.status_code,
        "data": resp.json() if resp.ok else None,
    }

    os.makedirs(cache_dir, exist_ok=True)
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(entry, f, ensure_ascii=False)
    except OSError as exc:
        log.warning("could not write cache: %s", exc)

    return entry["data"]
