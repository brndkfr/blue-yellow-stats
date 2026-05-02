"""Shared API parsers and helpers used across the pipeline."""

import hashlib
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).parent.parent


# ---------- config -----------------------------------------------------------

def cfg() -> dict:
    with open(ROOT / "config.json") as f:
        return json.load(f)


def team_cfg(config: dict, name: str) -> dict | None:
    return next((t for t in config["teams"] if t["name"].lower() == name.lower()), None)


# ---------- response helpers -------------------------------------------------

def rows(data: dict):
    """Yield every row across all regions in an API response."""
    for region in (data or {}).get("data", {}).get("regions", []):
        yield from region.get("rows", [])


def text(cell: dict, idx: int = 0) -> str:
    return (cell.get("text") or [""])[idx]


def to_int(val) -> int:
    try:
        return int(str(val).strip().lstrip("+"))
    except (ValueError, TypeError):
        return 0


# ---------- game-level parsers -----------------------------------------------

def parse_game_detail(data: dict) -> tuple:
    """Return (home_id, home_name, away_id, away_name) from a game detail response."""
    pairs = []
    for row in rows(data):
        for cell in row.get("cells", []):
            link = cell.get("link") or {}
            t = cell.get("text", [])
            if link.get("page") == "team_detail" and t:
                pairs.append((link["ids"][0], t[0]))
    if len(pairs) >= 2:
        return pairs[0][0], pairs[0][1], pairs[1][0], pairs[1][1]
    return None, None, None, None


_DATE_RE = re.compile(r"^\d{2}\.\d{2}\.\d{4}$")
_SCORE_RE = re.compile(r"^(\d+):(\d+)\s+(\(.+\))$")


def parse_game_header(data: dict) -> dict:
    """Extract date, score, period_scores, venue, and cancellation from a game detail response.

    The header row contains: home, away, "H:A (p1,p2,p3)", date, time, venue, ...
    Score is identified by the period-breakdown parenthetical to avoid matching
    the game start time (e.g. "11:45").
    Cancelled games show "-:-" as score and "Abgesagt" as a cell text.
    """
    result = {
        "date": None,
        "score_home": None,
        "score_away": None,
        "period_scores": None,
        "venue_name": None,
        "venue_lat": None,
        "venue_lng": None,
        "is_cancelled": 0,
    }

    for row in rows(data):
        cells = row.get("cells", [])
        texts = [" ".join(c.get("text", [])) for c in cells]

        is_header = any(_DATE_RE.match(t) for t in texts) or "Abgesagt" in texts
        if not is_header:
            continue

        if "Abgesagt" in texts:
            result["is_cancelled"] = 1

        for t in texts:
            if _DATE_RE.match(t):
                result["date"] = t
            m = _SCORE_RE.match(t)
            if m:
                result["score_home"] = int(m.group(1))
                result["score_away"] = int(m.group(2))
                result["period_scores"] = json.dumps(m.group(3))

        for cell in cells:
            link = cell.get("link") or {}
            if link.get("type") == "map":
                vt = cell.get("text", [])
                result["venue_name"] = vt[0] if vt else None
                result["venue_lat"] = link.get("y")
                result["venue_lng"] = link.get("x")

        break  # header row processed

    return result


def team_ids_in_game(data: dict) -> set[int]:
    """Return all team IDs referenced in a game detail response."""
    ids = set()
    for row in rows(data):
        for cell in row.get("cells", []):
            link = cell.get("link") or {}
            if link.get("page") == "team_detail":
                tid = (link.get("ids") or [None])[0]
                if tid:
                    ids.add(tid)
    return ids


_SCORE_IN_DESC = re.compile(r"(\d+):(\d+)$")
_PERIOD_N      = re.compile(r"(\d+)\. Drittel")
_PLAYER_RE     = re.compile(r"^(.*?)\s*\((.+?)\)$")


def parse_events_to_rows(game_id: int, events_data: dict) -> list:
    """Parse raw game_events API response into structured row dicts.

    Returns rows in chronological order (seq=0 is the first event of the game).
    """
    raw_rows = []
    for region in (events_data or {}).get("data", {}).get("regions", []):
        raw_rows.extend(region.get("rows", []))

    raw_rows = list(reversed(raw_rows))  # API delivers reverse-chron

    # Pre-pass: detect n_periods from explicit "Beginn X. Drittel" markers
    n_periods: int | None = None
    for _row in raw_rows:
        _cells = _row.get("cells", [])
        if len(_cells) > 1:
            _desc = " ".join(_cells[1].get("text", []))
            if _desc.startswith("Beginn"):
                _m = _PERIOD_N.search(_desc)
                if _m:
                    _p = int(_m.group(1))
                    if n_periods is None or _p > n_periods:
                        n_periods = _p

    result = []
    current_period = None

    for seq, row in enumerate(raw_rows):
        cells = row.get("cells", [])
        if not cells:
            continue

        game_time  = " ".join(cells[0].get("text", [])) if len(cells) > 0 else None
        desc       = " ".join(cells[1].get("text", [])) if len(cells) > 1 else ""
        team       = " ".join(cells[2].get("text", [])) if len(cells) > 2 else None
        player_raw = " ".join(cells[3].get("text", [])) if len(cells) > 3 else None

        team = team or None
        player = assist = None
        if player_raw:
            m = _PLAYER_RE.match(player_raw)
            if m:
                player = m.group(1).strip() or None
                assist = m.group(2).strip() or None
            else:
                player = player_raw.strip() or None

        score_home = score_away = None
        penalty_reason = None
        period = current_period

        # Infer period from elapsed time when no explicit period marker seen yet
        if period is None and game_time:
            try:
                mins = int(game_time.split(":")[0])
                period = (mins // 20) + 1
                if n_periods is not None:
                    period = min(period, n_periods)
            except (ValueError, IndexError):
                pass

        if desc.startswith("Torsch"):
            event_type = "goal"
            m = _SCORE_IN_DESC.search(desc)
            if m:
                score_home, score_away = int(m.group(1)), int(m.group(2))
        elif desc.startswith("Eigentor"):
            event_type = "own_goal"
            m = _SCORE_IN_DESC.search(desc)
            if m:
                score_home, score_away = int(m.group(1)), int(m.group(2))
        elif desc.startswith("2'"):
            event_type = "penalty_2"
            m = re.search(r"\((.+?)\)", desc)
            penalty_reason = m.group(1) if m else None
        elif desc.startswith("10'"):
            event_type = "penalty_10"
            m = re.search(r"\((.+?)\)", desc)
            penalty_reason = m.group(1) if m else None
        elif desc == "Spielbeginn":
            event_type = "game_start"
            period = None
        elif desc == "Spielende":
            event_type = "game_end"
            period = None
        elif desc.startswith("Ende"):
            event_type = "period_end"
            m = _PERIOD_N.search(desc)
            if m:
                current_period = int(m.group(1))
                period = current_period
        elif desc.startswith("Beginn"):
            event_type = "period_start"
            m = _PERIOD_N.search(desc)
            if m:
                current_period = int(m.group(1))
                period = current_period
        elif "Timeout Heim" in desc:
            event_type = "timeout_home"
        elif "Timeout Gast" in desc:
            event_type = "timeout_away"
        else:
            event_type = "other"

        result.append({
            "game_id":        game_id,
            "seq":            seq,
            "period":         period,
            "game_time":      game_time or None,
            "event_type":     event_type,
            "team":           team,
            "player":         player,
            "assist":         assist,
            "score_home":     score_home,
            "score_away":     score_away,
            "penalty_reason": penalty_reason,
        })

    return result


def final_score_from_events(events_data: dict) -> str | None:
    """Extract final score from a game_events response.

    Events are stored in reverse chronological order (countdown timer), so the
    first Torschütze / Eigentor entry is the last goal scored = final score.
    Returns "H:A" string or None if no goal events found (e.g. 0:0).
    """
    for region in (events_data or {}).get("data", {}).get("regions", []):
        for row in region.get("rows", []):
            cells = row.get("cells", [])
            if len(cells) >= 2:
                desc = " ".join(cells[1].get("text", []))
                m = re.search(r"(\d+:\d+)$", desc)
                if m and ("orsch" in desc or "igentor" in desc):
                    return m.group(1)
    return None


# ---------- player ID generation (internal hash, composed) -------------------

def normalize_player_key(name: str) -> str:
    """Normalize a player name to a canonical key for hashing.

    Uses only the name so the internal_id is stable across seasons and teams.
    """
    return unicodedata.normalize("NFC", name.strip().lower()) if name else ""


def make_internal_id(name: str) -> str:
    """Return the first 8 hex chars of SHA256(normalized name)."""
    key = normalize_player_key(name)
    return hashlib.sha256(key.encode()).hexdigest()[:8]


def make_synthetic_player_id(name: str) -> int:
    """Return a deterministic negative player_id for juniors without a Swiss ID."""
    key = normalize_player_key(name)
    h = hashlib.sha256(key.encode()).digest()
    val = int.from_bytes(h[:8], byteorder="big", signed=True)
    # Guarantee negative; handle the (astronomically unlikely) val==0 case
    if val >= 0:
        val = -(val + 1)
    return val


def parse_period_scores_header(period_scores_json: str,
                               score_home: int | None,
                               score_away: int | None,
                               n_periods: int | None = None) -> list[dict]:
    """Parse games.period_scores into per-period goal dicts.

    When n_periods is provided (detected from event markers), take exactly
    n_periods valid slots — this handles the case where P1 achieves the final
    score (e.g. 5:3 in P1, genuine 0:0 in P2 would otherwise be skipped).
    When n_periods is None, fall back to stopping when cumulative == final score.
    Slots containing '-:-' (no data) are skipped entirely.

    Returns e.g. [{"home": 5, "away": 3}, {"home": 0, "away": 0}]
    """
    if not period_scores_json:
        return []
    try:
        raw = json.loads(period_scores_json).strip("()")
    except (json.JSONDecodeError, AttributeError):
        return []

    result: list[dict] = []
    cum_h = cum_a = 0
    for part in raw.split(","):
        part = part.strip()
        m = re.match(r"^(\d+):(\d+)$", part)
        if not m:
            continue  # '-:-' or malformed — no data for this period
        h, a = int(m.group(1)), int(m.group(2))
        if n_periods is not None:
            if len(result) >= n_periods:
                break
        else:
            # Fallback: stop when cumulative matches final score (remaining are placeholders)
            if score_home is not None and score_away is not None:
                if cum_h == score_home and cum_a == score_away:
                    break
        cum_h += h
        cum_a += a
        result.append({"home": h, "away": a})
    return result


def make_composed_id(internal_id: str, swissunihockey_id: int | None) -> str:
    """Build a composed player ID string: {internal_id}_{swissunihockey_id or 0}."""
    sid = swissunihockey_id if swissunihockey_id is not None and swissunihockey_id > 0 else 0
    return f"{internal_id}_{sid}"
