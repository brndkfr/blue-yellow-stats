"""Core pipeline logic: ingest, scan, sync.

All functions are pure data operations — they do not print anything.
Callers (bystats.py) handle all terminal output and progress bars.
"""

import json
import logging
from pathlib import Path

ROOT = Path(__file__).parent.parent

import api as _api
import cache as _cache
import db as _db
import geo_helper as _geo

log = logging.getLogger(__name__)


# ---------- single-game ingest -----------------------------------------------

def ingest_game(game_id: int, team_cfg: dict, season: int, db,
                cache_dir: str, ttl: int, force: bool = False) -> bool:
    """Fetch game detail + events for one game_id and write to DB.

    Returns True if the game was found and stored, False if 404 / no data.
    force=True bypasses the cache (re-fetches from API).
    """
    detail = _cache.fetch(f"/api/games/{game_id}", {}, cache_dir, ttl, force=force)
    if detail is None:
        log.debug("game %s: no data (404 or network error)", game_id)
        return False

    header = _api.parse_game_header(detail)
    home_id, home_name, away_id, away_name = _api.parse_game_detail(detail)

    if not header["date"]:
        log.warning("game %s: missing date in header — stored with date=None", game_id)
    if header["score_home"] is None:
        log.warning("game %s: no score in header — will attempt event stream", game_id)

    # Venue
    lat, lng = header["venue_lat"], header["venue_lng"]
    dist = round(_geo.haversine_km(lat, lng), 2) if lat and lng else None
    venue_id = _db.get_or_create_venue(db, header["venue_name"] or "", "", lat, lng, dist)

    # Teams
    club_partial = team_cfg.get("_club_name_partial", "Kloten-Dietlikon")
    if home_id and home_name:
        _db.upsert_team(db, {"team_id": home_id, "name": home_name,
                              "league_id": team_cfg["league_id"],
                              "game_class": team_cfg["game_class"]})
    if away_id and away_name:
        _db.upsert_team(db, {"team_id": away_id, "name": away_name,
                              "league_id": team_cfg["league_id"],
                              "game_class": team_cfg["game_class"]})

    score_home = header["score_home"]
    score_away = header["score_away"]

    # Game events
    events = _cache.fetch(f"/api/game_events/{game_id}", {}, cache_dir, ttl, force=force)

    # Fall back to event stream for score when header has no period breakdown
    if score_home is None and events:
        ev_score = _api.final_score_from_events(events)
        if ev_score:
            sh, sa = ev_score.split(":")
            score_home, score_away = int(sh), int(sa)

    home_name = home_name or ""
    away_name = away_name or ""

    game = {
        "game_id": game_id,
        "season": season,
        "date": header["date"],
        "home_team": home_name,
        "home_team_id": home_id,
        "away_team": away_name,
        "away_team_id": away_id,
        "score_home": score_home,
        "score_away": score_away,
        "league_id": team_cfg["league_id"],
        "game_class": team_cfg["game_class"],
        "league_name": team_cfg["league_name"],
        "venue_id": venue_id,
        "is_home": int(club_partial.lower() in home_name.lower()),
        "is_junior": team_cfg.get("is_junior", 1),
        "period_scores": header["period_scores"],
    }
    _db.upsert_game(db, game)

    events_complete = None
    if events is not None:
        event_rows = _api.parse_events_to_rows(game_id, events)
        _db.store_event_details(db, game_id, event_rows)
        if score_home is not None:
            expected = score_home + score_away
            actual = sum(1 for r in event_rows if r["event_type"] in ("goal", "own_goal"))
            events_complete = int(actual == expected)

    _db.mark_game_events(db, game_id,
                         available=events is not None,
                         raw_json=json.dumps(events) if events else None,
                         events_complete=events_complete)

    return True


def refresh_events(game_id: int, db, cache_dir: str, ttl: int,
                   force: bool = False) -> bool:
    """Re-fetch game_events for a single game and update the DB record.

    Returns True if events were available, False otherwise.
    """
    events = _cache.fetch(f"/api/game_events/{game_id}", {}, cache_dir, ttl, force=force)
    _db.mark_game_events(db, game_id,
                         available=events is not None,
                         raw_json=json.dumps(events) if events else None)
    return events is not None


# ---------- scan -------------------------------------------------------------

def scan_for_team(team_id: int, start: int, end: int,
                  cache_dir: str, ttl: int) -> list[int]:
    """Return all game IDs in [start, end] whose detail response references team_id.

    404 / missing responses are cached, so repeated runs only pay for new IDs.
    """
    hits = []
    for gid in range(start, end + 1):
        data = _cache.fetch(f"/api/games/{gid}", {}, cache_dir, ttl)
        if data is not None and team_id in _api.team_ids_in_game(data):
            hits.append(gid)
    return hits


# ---------- full team sync ---------------------------------------------------

def sync_team(team_name: str, season: int, db, cache_dir: str, ttl: int,
              scan_lookback: int = 150,
              progress_cb=None, hit_cb=None) -> dict:
    """Sync all games for a team: mode=team + backwards scan + ingest all.

    progress_cb(current, total) is called each ID during the scan phase.
    hit_cb(game_id, date, home_name, score_str, away_name) is called on each hit.

    Returns {"found": N, "ingested": N, "events_available": N}.
    """
    config = _api.cfg()
    tcfg = _api.team_cfg(config, team_name)
    if tcfg is None:
        raise ValueError(f"team '{team_name}' not found in config.json")

    club_partial = config.get("club_name_partial", "Kloten-Dietlikon")
    tcfg = {**tcfg, "_club_name_partial": club_partial}

    _db.upsert_season(db, season, f"{season}/{season + 1}")
    _db.upsert_league(db, {
        "league_id": tcfg["league_id"],
        "game_class": tcfg["game_class"],
        "name": tcfg["league_name"],
        "is_junior": tcfg.get("is_junior", 1),
    })

    # Step 1 — mode=team for Finalrunde game IDs
    mode_team_data = _cache.fetch(
        "/api/games", {"mode": "team", "team_id": tcfg["team_id"], "season": season},
        cache_dir, ttl,
    )
    finalrunde_ids = []
    if mode_team_data:
        for row in _api.rows(mode_team_data):
            link = row.get("link") or {}
            gid = (link.get("ids") or [None])[0]
            if gid:
                finalrunde_ids.append(gid)
    log.info("mode=team: %d game(s) found", len(finalrunde_ids))

    # Step 2 — scan backwards from min known game ID to find Vorrunde
    if finalrunde_ids:
        scan_start = min(finalrunde_ids) - scan_lookback
        scan_end = max(finalrunde_ids)
    else:
        log.warning("mode=team returned no games — scan range unknown, skipping scan")
        return {"found": 0, "ingested": 0, "events_available": 0}

    total_scan = scan_end - scan_start + 1
    log.info("scanning %d..%d (%d IDs) for team_id=%d",
             scan_start, scan_end, total_scan, tcfg["team_id"])

    all_game_ids = []
    for i, gid in enumerate(range(scan_start, scan_end + 1)):
        if progress_cb:
            progress_cb(i, total_scan)
        data = _cache.fetch(f"/api/games/{gid}", {}, cache_dir, ttl)
        if data is not None and tcfg["team_id"] in _api.team_ids_in_game(data):
            all_game_ids.append(gid)
            if hit_cb:
                header = _api.parse_game_header(data)
                _, home_name, _, away_name = _api.parse_game_detail(data)
                sh, sa = header["score_home"], header["score_away"]
                if sh is None:
                    events = _cache.fetch(f"/api/game_events/{gid}", {}, cache_dir, ttl)
                    ev = _api.final_score_from_events(events) if events else None
                    if ev:
                        sh, sa = (int(x) for x in ev.split(":"))
                score_str = f"{sh}:{sa}" if sh is not None else "?"
                hit_cb(gid, header["date"] or "?", home_name or "?",
                       score_str, away_name or "?")
    if progress_cb:
        progress_cb(total_scan, total_scan)

    log.info("scan complete: %d game(s) found", len(all_game_ids))

    # Step 3 — ingest every game found
    ingested = 0
    events_ok = 0
    for gid in all_game_ids:
        stored = ingest_game(gid, tcfg, season, db, cache_dir, ttl)
        if stored:
            ingested += 1
            ge = _cache.fetch(f"/api/game_events/{gid}", {}, cache_dir, ttl)
            if ge is not None:
                events_ok += 1

    return {"found": len(all_game_ids), "ingested": ingested, "events_available": events_ok}


# ---------- event detail backfill --------------------------------------------

def parse_all_events(db, force: bool = False) -> dict:
    """Parse raw game_events JSON into game_event_details for all available games.

    force=True re-parses games that already have event details.
    Returns {"parsed": N, "skipped": N, "no_data": N}.
    """
    parsed = skipped = no_data = 0
    for row in db["game_events"].rows_where("available=1"):
        game_id = row["game_id"]
        if not force:
            existing = db.execute(
                "SELECT COUNT(*) FROM game_event_details WHERE game_id=?", [game_id]
            ).fetchone()[0]
            if existing > 0:
                skipped += 1
                continue
        if not row["raw_json"]:
            no_data += 1
            continue
        events_data = json.loads(row["raw_json"])
        event_rows = _api.parse_events_to_rows(game_id, events_data)
        _db.store_event_details(db, game_id, event_rows)

        game = next(db["games"].rows_where("game_id=?", [game_id]), None)
        events_complete = None
        if game and game["score_home"] is not None:
            expected = game["score_home"] + game["score_away"]
            actual = sum(1 for r in event_rows if r["event_type"] in ("goal", "own_goal"))
            events_complete = int(actual == expected)
        db["game_events"].update(game_id, {"events_complete": events_complete})
        parsed += 1
    return {"parsed": parsed, "skipped": skipped, "no_data": no_data}


# ---------- status query -----------------------------------------------------

def team_status(team_name: str, db) -> dict:
    """Return summary stats for a team from the DB."""
    config = _api.cfg()
    tcfg = _api.team_cfg(config, team_name)
    if tcfg is None:
        raise ValueError(f"team '{team_name}' not found in config.json")

    rows = list(db["games"].rows_where(
        "league_id=? AND game_class=?",
        [tcfg["league_id"], tcfg["game_class"]],
    ))

    wins = draws = losses = 0
    for g in rows:
        jets_score = g["score_home"] if g["is_home"] else g["score_away"]
        opp_score  = g["score_away"] if g["is_home"] else g["score_home"]
        if jets_score is None or opp_score is None:
            continue
        if jets_score > opp_score:
            wins += 1
        elif jets_score == opp_score:
            draws += 1
        else:
            losses += 1

    game_ids = [g["game_id"] for g in rows]
    events_count = 0
    if game_ids:
        placeholders = ",".join("?" * len(game_ids))
        events_count = db.execute(
            f"SELECT COUNT(*) FROM game_events WHERE game_id IN ({placeholders}) AND available=1",
            game_ids,
        ).fetchone()[0]

    return {
        "team": team_name,
        "league": tcfg["league_name"],
        "games": len(rows),
        "wins": wins,
        "draws": draws,
        "losses": losses,
        "events_available": events_count,
    }
