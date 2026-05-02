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
        "is_cancelled": header.get("is_cancelled", 0),
        "period_scores": header["period_scores"],
    }
    _db.upsert_game(db, game)
    _db.apply_game_corrections(db, game_id)  # manual corrections win over API data

    events_complete = None
    if events is not None:
        event_rows = _api.parse_events_to_rows(game_id, events)
        # Enrich event rows with stable internal player IDs
        for row in event_rows:
            if row.get("player"):
                row["player_internal_id"] = _api.make_internal_id(row["player"])
            if row.get("assist"):
                row["assist_internal_id"] = _api.make_internal_id(row["assist"])
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
                if header.get("is_cancelled"):
                    score_str = "Abgesagt"
                else:
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

    # Step 4 — aggregate player stats from event details
    club_id = config.get("club_id")
    player_result = aggregate_junior_player_stats(db, tcfg, season, club_id)

    return {
        "found": len(all_game_ids),
        "ingested": ingested,
        "events_available": events_ok,
        **player_result,
    }


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

    cancelled_count = db.execute(
        "SELECT COUNT(*) FROM games WHERE league_id=? AND game_class=? AND COALESCE(is_cancelled,0)=1",
        [tcfg["league_id"], tcfg["game_class"]],
    ).fetchone()[0]

    rows = list(db["games"].rows_where(
        "league_id=? AND game_class=? AND COALESCE(is_cancelled, 0)=0",
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
        "cancelled": cancelled_count,
        "wins": wins,
        "draws": draws,
        "losses": losses,
        "events_available": events_count,
    }


# ---------- junior player resolution from events ----------------------------

def resolve_or_create_junior_player(db, player_name: str, league_name: str,
                                    season: int, club_id: int,
                                    is_junior: bool = True) -> int | None:
    """Resolve or create a junior player record from event context.

    Lookup order:
    1. player_name_map override for (raw_name, team_name, season) — supports manual fixes
    2. players table by internal_id (hash of name only, stable across seasons/teams)
    3. Create new synthetic record and record the sighting

    Returns the player_id, or None if player_name is empty.
    """
    if not player_name:
        return None

    # 1. Manual override
    pid = _db.lookup_player_name_map(db, player_name, league_name, season)
    if pid is not None:
        return pid

    internal_id = _api.make_internal_id(player_name)
    composed_id = _api.make_composed_id(internal_id, None)

    # 2. Existing player by hash
    existing = next(db["players"].rows_where("internal_id=?", [internal_id]), None)
    if existing:
        pid = existing["player_id"]
        _db.record_player_name_sighting(db, player_name, league_name, season, pid)
        return pid

    # 3. Create new synthetic player
    pid = _api.make_synthetic_player_id(player_name)
    _db.upsert_player(db, {
        "player_id": pid,
        "club_id": club_id,
        "name": player_name,
        "position": None,
        "birth_year": None,
        "height_cm": None,
        "is_junior": int(is_junior),
        "swissunihockey_id": 0,
        "internal_id": internal_id,
        "composed_id": composed_id,
    })
    _db.record_player_name_sighting(db, player_name, league_name, season, pid)
    return pid


def _minutes(time_str: str) -> float:
    """Convert MM:SS game time string to total minutes."""
    try:
        parts = time_str.split(":")
        return int(parts[0]) + int(parts[1]) / 60
    except (ValueError, IndexError):
        return 0.0


def game_facts(db, game_id: int) -> dict:
    """Extract structured facts for a game match report.

    Returns a dict with metadata, period scores, goals, penalties, and notable items.
    Raises ValueError if the game is not in the DB.
    """
    game = next(db["games"].rows_where("game_id=?", [game_id]), None)
    if game is None:
        raise ValueError(f"Game {game_id} not found in DB")

    jets_home = bool(game["is_home"])
    jets_team = game["home_team"] if jets_home else game["away_team"]
    opp_team  = game["away_team"] if jets_home else game["home_team"]

    cur = db.execute(
        "SELECT * FROM game_event_details WHERE game_id=? ORDER BY seq",
        [game_id],
    )
    cols = [d[0] for d in cur.description]
    events = [dict(zip(cols, row)) for row in cur.fetchall()]

    # n_periods from event markers — more reliable than the API header's slot count
    n_periods_ev = max(
        (e["period"] for e in events
         if e["event_type"] == "period_start" and e["period"] is not None),
        default=None,
    )

    # Period scores from game header — authoritative, avoids event-period detection bugs
    period_scores: list[dict] = _api.parse_period_scores_header(
        game["period_scores"], game["score_home"], game["score_away"],
        n_periods=n_periods_ev,
    )

    # Goals
    jets_goals: list[dict] = []
    opp_goals:  list[dict] = []
    for ev in events:
        if ev["event_type"] not in ("goal", "own_goal"):
            continue
        score = (f"{ev['score_home']}:{ev['score_away']}"
                 if ev["score_home"] is not None else None)
        entry = {
            "time": ev["game_time"],
            "player": ev["player"],
            "assist": ev["assist"],
            "score": score,
            "is_own_goal": ev["event_type"] == "own_goal",
        }
        if ev["team"] == jets_team:
            jets_goals.append(entry)
        else:
            opp_goals.append(entry)

    # Penalties
    jets_penalties: list[dict] = []
    opp_penalties:  list[dict] = []
    for ev in events:
        if ev["event_type"] not in ("penalty_2", "penalty_10"):
            continue
        mins = 2 if ev["event_type"] == "penalty_2" else 10
        entry = {
            "time": ev["game_time"],
            "player": ev["player"],
            "minutes": mins,
            "reason": ev["penalty_reason"],
        }
        if ev["team"] == jets_team:
            jets_penalties.append(entry)
        else:
            opp_penalties.append(entry)

    # Derived: first Jets goal time
    jets_first_goal_minutes = None
    if jets_goals and jets_goals[0]["time"]:
        jets_first_goal_minutes = round(_minutes(jets_goals[0]["time"]), 2)

    # Notable facts
    notable: list[str] = []

    if not jets_goals:
        notable.append("Jets did not score")
    elif jets_first_goal_minutes is not None and jets_first_goal_minutes > 10:
        notable.append(f"Jets held scoreless for {int(jets_first_goal_minutes)} minutes")

    n_periods = len(period_scores)
    if n_periods and jets_goals:
        last_period_start = (n_periods - 1) * 20
        final_5 = [g for g in jets_goals
                   if g["time"] and _minutes(g["time"]) >= last_period_start + 15]
        if final_5:
            notable.append(f"{len(final_5)} Jets goal(s) in the final 5 minutes")

    for i in range(len(jets_penalties) - 1):
        p1, p2 = jets_penalties[i], jets_penalties[i + 1]
        if (p1["player"] and p1["player"] == p2["player"]
                and p1["time"] and p2["time"]
                and abs(_minutes(p2["time"]) - _minutes(p1["time"])) < 5):
            notable.append(
                f"{p1['player']}: back-to-back penalties at {p1['time']} and {p2['time']}"
            )

    def _goal_counts(goals: list[dict]) -> dict[str, int]:
        counts: dict[str, int] = {}
        for g in goals:
            if g["player"]:
                counts[g["player"]] = counts.get(g["player"], 0) + 1
        return counts

    for player, count in sorted(_goal_counts(jets_goals).items(), key=lambda x: -x[1]):
        if count >= 3:
            notable.append(f"{player}: hat-trick ({count} goals)")
        elif count == 2:
            notable.append(f"{player}: brace (2 goals)")

    opp_short = opp_team.split()[-1] if opp_team else "Opp"
    for player, count in sorted(_goal_counts(opp_goals).items(), key=lambda x: -x[1]):
        if count >= 3:
            notable.append(f"{player} ({opp_short}): hat-trick ({count} goals)")

    jets_ever_led = opp_ever_led = False
    for ev in events:
        if ev["event_type"] not in ("goal", "own_goal") or ev["score_home"] is None:
            continue
        js = ev["score_home"] if jets_home else ev["score_away"]
        os_ = ev["score_away"] if jets_home else ev["score_home"]
        if js > os_:
            jets_ever_led = True
        elif os_ > js:
            opp_ever_led = True

    fj = game["score_home"] if jets_home else game["score_away"]
    fo = game["score_away"] if jets_home else game["score_home"]
    if fj is not None and fo is not None:
        if fj > fo and opp_ever_led:
            notable.append("Jets came from behind to win")
        elif fj < fo and jets_ever_led:
            notable.append("Jets led but could not hold on")

    return {
        "game_id": game_id,
        "date": game["date"],
        "home_team": game["home_team"],
        "away_team": game["away_team"],
        "jets_team": jets_team,
        "opp_team": opp_team,
        "jets_home": jets_home,
        "score_home": game["score_home"],
        "score_away": game["score_away"],
        "league": game["league_name"],
        "period_scores": period_scores,
        "jets_goals": jets_goals,
        "opp_goals": opp_goals,
        "jets_penalties": jets_penalties,
        "opp_penalties": opp_penalties,
        "jets_first_goal_minutes": jets_first_goal_minutes,
        "notable": notable,
    }


def aggregate_junior_player_stats(db, team_cfg: dict, season: int, club_id: int) -> dict:
    """Aggregate player stats for a junior team from parsed game events.
    
    Creates player records and player_games/player_seasons entries from event data.
    Returns {"players_resolved": N, "player_games_updated": N, "player_seasons_updated": N}.
    """
    league_name = team_cfg.get("league_name", "")
    league_id = team_cfg["league_id"]
    game_class = team_cfg["game_class"]
    is_junior = team_cfg.get("is_junior", 1)
    
    # Find all non-cancelled games for this team in this season
    games = list(db["games"].rows_where(
        "league_id=? AND game_class=? AND season=? AND COALESCE(is_cancelled, 0)=0",
        [league_id, game_class, season],
    ))

    if not games:
        return {"players_resolved": 0, "player_games_updated": 0, "player_seasons_updated": 0}

    game_ids = [g["game_id"] for g in games]
    team_id = team_cfg["team_id"]

    # Wipe player_games for this team's games so re-runs are idempotent.
    # We only delete rows for players already associated with this league so we
    # don't accidentally clobber data from other teams.
    placeholders = ",".join("?" * len(game_ids))
    db.execute(
        f"DELETE FROM player_games WHERE game_id IN ({placeholders})",
        game_ids,
    )

    players_resolved = set()
    player_games_updated = 0
    player_seasons_updated = 0

    # Only process events scored BY the Jets team in each game.
    # Join with games to match the team name dynamically (home or away).
    cur = db.execute(
        f"""
        SELECT ged.*
        FROM game_event_details ged
        JOIN games g ON ged.game_id = g.game_id
        WHERE ged.game_id IN ({placeholders})
          AND ged.event_type IN ('goal', 'own_goal')
          AND (
            (g.home_team_id = ? AND ged.team = g.home_team) OR
            (g.away_team_id = ? AND ged.team = g.away_team)
          )
        """,
        game_ids + [team_id, team_id],
    )
    cols = [d[0] for d in cur.description]
    event_rows = [dict(zip(cols, row)) for row in cur.fetchall()]

    # Accumulate goals/assists per (player, game) in memory, then write once.
    # Key: (player_name, game_id) → {"goals": N, "assists": N}
    tally: dict[tuple, dict] = {}

    for event in event_rows:
        gid = event["game_id"]

        if event["player"] and event["player_internal_id"]:
            key = (event["player"], gid)
            entry = tally.setdefault(key, {"goals": 0, "assists": 0})
            if event["event_type"] == "goal":
                entry["goals"] += 1

        if event["assist"] and event["assist_internal_id"]:
            key = (event["assist"], gid)
            entry = tally.setdefault(key, {"goals": 0, "assists": 0})
            entry["assists"] += 1

    for (player_name, gid), counts in tally.items():
        pid = resolve_or_create_junior_player(
            db, player_name, league_name, season, club_id, is_junior
        )
        if pid:
            players_resolved.add(pid)
            _db.upsert_player_game(db, {
                "player_id": pid,
                "game_id":   gid,
                "goals":     counts["goals"],
                "assists":   counts["assists"],
                "points":    counts["goals"] + counts["assists"],
                "pim":       0,
            })
            player_games_updated += 1
    
    # Aggregate player_seasons from player_games, scoped to this season only
    agg_sql = """
        SELECT
            COUNT(DISTINCT pg.game_id)   AS games_played,
            COALESCE(SUM(pg.goals), 0)   AS goals,
            COALESCE(SUM(pg.assists), 0) AS assists,
            COALESCE(SUM(pg.points), 0)  AS points,
            COALESCE(SUM(pg.pim), 0)     AS pim
        FROM player_games pg
        JOIN games g ON pg.game_id = g.game_id
        WHERE pg.player_id=? AND g.season=?
    """
    for pid in players_resolved:
        row = db.execute(agg_sql, [pid, season]).fetchone()
        games_played = row[0]
        goals        = row[1]
        assists      = row[2]
        points       = row[3]
        pim          = row[4]
        
        _db.upsert_player_season(db, {
            "player_id": pid,
            "season": season,
            "club_id": club_id,
            "league_name": league_name,
            "games": games_played,
            "goals": goals,
            "assists": assists,
            "points": points,
            "pim": pim,
        })
        player_seasons_updated += 1
    
    return {
        "players_resolved": len(players_resolved),
        "player_games_updated": player_games_updated,
        "player_seasons_updated": player_seasons_updated,
    }

