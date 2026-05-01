"""Shared API parsers and helpers used across the pipeline."""

import json
import re
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
    """Extract date, score, period_scores, and venue from a game detail response.

    The header row contains: home, away, "H:A (p1,p2,p3)", date, time, venue, ...
    Score is identified by the period-breakdown parenthetical to avoid matching
    the game start time (e.g. "11:45").
    """
    result = {
        "date": None,
        "score_home": None,
        "score_away": None,
        "period_scores": None,
        "venue_name": None,
        "venue_lat": None,
        "venue_lng": None,
    }

    for row in rows(data):
        cells = row.get("cells", [])
        texts = [" ".join(c.get("text", [])) for c in cells]

        if not any(_DATE_RE.match(t) for t in texts):
            continue  # not the header row

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
