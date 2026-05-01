"""Fetches data from the Swiss Unihockey API v2 with a query-aware cache."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import cache as _cache
import db as _db
import geo_helper as _geo

_CLUB_NAME = "Kloten-Dietlikon"  # partial match for Jets in API responses

# league_name text → (league_id, game_class) — derived from /api/leagues exploration
_LEAGUE_NAME_MAP = {
    "herren l-upl": (24, 11),
    "damen l-upl":  (24, 21),
    "junioren a":   (12, 31),
    "junioren b":   (12, 32),
    "junioren c":   (12, 33),
    "junioren d+":  (12, 36),
    "junioren d":   (12, 34),
    "junioren e":   (12, 35),
    "juniorinnen a": (12, 41),
    "juniorinnen b": (12, 42),
    "juniorinnen c": (12, 43),
    "juniorinnen d": (12, 44),
}


def _cfg():
    with open(ROOT / "config.json") as f:
        return json.load(f)


# ---------- parsers ----------------------------------------------------------

def _text(cell, idx=0):
    return (cell.get("text") or [""])[idx]


def _int(val):
    try:
        return int(str(val).strip().lstrip("+"))
    except (ValueError, TypeError):
        return 0


def _rows(data):
    for region in data.get("data", {}).get("regions", []):
        yield from region.get("rows", [])


def _league_ids(league_name: str) -> tuple[int | None, int | None]:
    lower = league_name.lower()
    for prefix, ids in _LEAGUE_NAME_MAP.items():
        if lower.startswith(prefix):
            return ids
    return None, None


def _parse_active_season(data):
    # The highlighted entry is often the registration/upcoming season.
    # Return highlighted year and the one before it so the caller can probe both.
    highlighted = None
    for entry in data.get("entries", []):
        if entry.get("highlight"):
            highlighted = entry["set_in_context"]["season"]
            break
    if highlighted is None:
        highlighted = data["entries"][0]["set_in_context"]["season"]
    return highlighted, highlighted - 1


def _parse_games(data, season):
    results = []
    for row in _rows(data):
        cells = row.get("cells", [])
        link = row.get("link") or {}
        ids = link.get("ids") or []
        if not ids or len(cells) < 6:
            continue

        game_id = ids[0]
        score_text = _text(cells[5])
        if ":" not in score_text:
            continue  # not played / cancelled
        try:
            sh, sa = score_text.split(":")
            score_home, score_away = int(sh), int(sa)
        except ValueError:
            continue

        league_name = " ".join(cells[2].get("text", []))
        league_id, game_class = _league_ids(league_name)
        is_junior = int("junior" in league_name.lower())
        home_team = _text(cells[3])
        is_home = int(_CLUB_NAME.lower() in home_team.lower())

        venue_cell = cells[1]
        results.append({
            "game_id": game_id,
            "season": season,
            "date": _text(cells[0]),
            "home_team": home_team,
            "home_team_id": None,   # resolved after rankings sync
            "away_team": _text(cells[4]),
            "away_team_id": None,   # resolved after rankings sync
            "score_home": score_home,
            "score_away": score_away,
            "league_id": league_id,
            "game_class": game_class,
            "league_name": league_name,
            "_venue_name": _text(venue_cell, 0),
            "_venue_city": _text(venue_cell, 1),
            "is_home": is_home,
            "is_junior": is_junior,
            "period_scores": None,
        })
    return results


def _parse_game_detail(data):
    """Return (home_id, home_name, away_id, away_name) from game detail response."""
    pairs = []
    for row in _rows(data):
        for cell in row.get("cells", []):
            link = cell.get("link") or {}
            text = cell.get("text", [])
            if link.get("page") == "team_detail" and text:
                pairs.append((link["ids"][0], text[0]))
    if len(pairs) >= 2:
        return pairs[0][0], pairs[0][1], pairs[1][0], pairs[1][1]
    return None, None, None, None


def _parse_player_venues(data):
    """Extract (name, city, lat, lng) from player overview venue cells."""
    venues = {}
    for row in _rows(data):
        cells = row.get("cells", [])
        if len(cells) < 2:
            continue
        cell = cells[1]
        link = cell.get("link") or {}
        if link.get("type") != "map":
            continue
        name = _text(cell, 0)
        city = _text(cell, 1)
        lat = link.get("y")
        lng = link.get("x")
        if name and lat and lng:
            venues[(name, city)] = (lat, lng)
    return venues


def _parse_rankings(data, season, league_id, game_class):
    """Returns (rankings_rows, teams_rows).

    Supports two cell layouts:
      13 cells — L-UPL format (separate OT-win / OT-loss columns)
      12 cells — junior format (one combined OT column, no separate losses column)
    """
    rankings, teams = [], []
    for row in _rows(data):
        cells = row.get("cells", [])
        n = len(cells)
        if n < 12:
            continue
        team_data = (row.get("data") or {}).get("team") or {}
        team_id = team_data.get("id")
        team_name = team_data.get("name") or _text(cells[2])
        if not team_id:
            continue
        try:
            played = int(_text(cells[3]))
            if n >= 13:
                # L-UPL: rank, logo, name, played, ?, wins, OTW, OTL, losses, goals, diff, ?, pts
                wins      = int(_text(cells[5]))
                ot_wins   = int(_text(cells[6]))
                ot_losses = int(_text(cells[7]))
                losses    = int(_text(cells[8]))
                goals_text = _text(cells[9])
                goal_diff  = _int(_text(cells[10]))
                points     = int(_text(cells[12]))
            else:
                # junior: rank, logo, name, played, ?, wins, OT(combined), losses, goals, diff, ratio, pts
                wins      = int(_text(cells[5]))
                ot_wins   = 0
                ot_losses = _int(_text(cells[6]))  # combined OT games (1 pt each)
                losses    = _int(_text(cells[7]))
                goals_text = _text(cells[8])
                goal_diff  = _int(_text(cells[9]))
                points     = _int(_text(cells[11]))
        except ValueError:
            continue

        if ":" in goals_text:
            gf, ga = goals_text.split(":", 1)
            goals_for, goals_against = _int(gf), _int(ga)
        else:
            goals_for = goals_against = 0

        teams.append({"team_id": team_id, "name": team_name,
                      "league_id": league_id, "game_class": game_class})
        rankings.append({
            "season": season,
            "league_id": league_id,
            "game_class": game_class,
            "team_id": team_id,
            "team_name": team_name,
            "rank": len(rankings) + 1,
            "played": played,
            "wins": wins,
            "overtime_wins": ot_wins,
            "overtime_losses": ot_losses,
            "losses": losses,
            "goals_for": goals_for,
            "goals_against": goals_against,
            "goal_diff": goal_diff,
            "points": points,
        })
    return rankings, teams


def _parse_topscorers(data):
    """Return players matching Jets club name."""
    jets = []
    for row in _rows(data):
        cells = row.get("cells", [])
        if len(cells) < 7:
            continue
        club = _text(cells[2])
        if _CLUB_NAME.lower() not in club.lower():
            continue
        link = (cells[0].get("link") or cells[1].get("link") or {})
        player_id = (link.get("ids") or [None])[0]
        if not player_id:
            continue
        jets.append({
            "player_id": player_id,
            "name": _text(cells[1]),
            "club": club,
            "games": _int(_text(cells[3])),
            "goals": _int(_text(cells[4])),
            "assists": _int(_text(cells[5])),
            "points": _int(_text(cells[6])),
        })
    return jets


def _parse_team_roster(data, team_cfg):
    """Parse roster rows from /api/teams/<team_id>/players."""
    players = []
    for row in _rows(data):
        cells = row.get("cells", [])
        if len(cells) < 8:
            continue

        player_id = None
        for cell in cells:
            link = cell.get("link") or {}
            if link.get("page") == "player_detail":
                player_id = (link.get("ids") or [None])[0]
                break

        name = _text(cells[2])
        if not player_id or not name:
            continue

        players.append({
            "player_id": player_id,
            "name": name,
            "position": _text(cells[1]),
            "birth_year": _int(_text(cells[3])),
            "goals": _int(_text(cells[4])),
            "assists": _int(_text(cells[5])),
            "points": _int(_text(cells[6])),
            "pim": _int(_text(cells[7])),
            "is_junior": int(team_cfg.get("is_junior", 1)),
        })
    return players


def _is_senior_team(team_cfg):
    return team_cfg.get("is_junior", 1) == 0


def _parse_player_profile(data, player_id, is_junior=False):
    for row in _rows(data):
        cells = row.get("cells", [])
        if len(cells) < 5:
            continue
        club = _text(cells[1])
        if not club:
            continue
        height_text = _text(cells[5]).replace(" cm", "")
        return {
            "player_id": player_id,
            "name": None,  # filled in from topscorers
            "position": _text(cells[3]),
            "birth_year": _int(_text(cells[4])),
            "height_cm": _int(height_text),
            "is_junior": int(is_junior),
        }
    return None


def _parse_player_overview(data, player_id):
    rows_out = []
    for row in _rows(data):
        game_id = row.get("id")
        cells = row.get("cells", [])
        if not game_id or len(cells) < 10:
            continue
        status = _text(cells[2]).lower()
        if "durchgeführt" not in status and "played" not in status:
            continue  # skip cancelled / not yet played
        rows_out.append({
            "player_id": player_id,
            "game_id": game_id,
            "goals": _int(_text(cells[6])),
            "assists": _int(_text(cells[7])),
            "points": _int(_text(cells[8])),
            "pim": _int(_text(cells[9])),
        })
    return rows_out


# ---------- main sync --------------------------------------------------------

def run():
    cfg = _cfg()
    club_id = cfg["club_id"]
    cache_dir = str(ROOT / cfg["cache_dir"])
    ttl = cfg["cache_ttl_hours"]
    db = _db.open_db(str(ROOT / cfg["db_path"]))
    junior_classes = cfg["leagues"]["junior_game_classes"]
    _db.configure_junior_classes(junior_classes)

    def get(endpoint, params=None):
        return _cache.fetch(endpoint, params or {}, cache_dir, ttl)

    # Seed Jets club record (home venue confirmed from game responses)
    _db.upsert_club(db, {
        "club_id": club_id,
        "name": "Kloten-Dietlikon Jets",
        "city": "Kloten",
        "home_venue": "Stiftung Sporthalle Stighag",
    })

    # Seed leagues table from config
    for key, spec in [("upl_men", False), ("upl_women", False)]:
        lg = cfg["leagues"][key]
        _db.upsert_league(db, {
            "league_id": lg["league"],
            "game_class": lg["game_class"],
            "name": "Herren L-UPL" if key == "upl_men" else "Damen L-UPL",
            "is_junior": 0,
        })
    for jl in cfg["leagues"]["juniors"]:
        _db.upsert_league(db, {
            "league_id": jl["league"],
            "game_class": jl["game_class"],
            "name": jl["name"],
            "is_junior": 1,
        })

    # Step 1 — active season (API highlights the upcoming/registration season;
    # probe both highlighted and previous year to find the one with games)
    seasons_data = get("/api/seasons")
    highlighted, previous = _parse_active_season(seasons_data)

    games_data = get("/api/games", {"mode": "club", "club_id": club_id, "season": highlighted})
    games = _parse_games(games_data, highlighted)
    if not games:
        games_data = get("/api/games", {"mode": "club", "club_id": club_id, "season": previous})
        games = _parse_games(games_data, previous)
        season = previous
    else:
        season = highlighted

    _db.upsert_season(db, season, f"{season}/{season + 1}")
    print(f"[scraper] active season: {season}")

    # Step 2 — resolve venues then write games
    # Collect coordinates from any cached player overviews first
    venue_coords: dict[tuple, tuple] = {}
    for scorer in []:  # populated after step 4; re-run merges coords on next sync
        pass

    # Build venue registry from games (name, city) — coords filled in when available
    venue_id_map: dict[tuple, int] = {}
    for g in games:
        key = (g["_venue_name"], g["_venue_city"])
        if key not in venue_id_map:
            lat, lng = venue_coords.get(key, (None, None))
            dist = round(_geo.haversine_km(lat, lng), 2) if lat and lng else None
            vid = _db.get_or_create_venue(db, key[0], key[1], lat, lng, dist)
            venue_id_map[key] = vid

    for g in games:
        key = (g.pop("_venue_name"), g.pop("_venue_city"))
        g["venue_id"] = venue_id_map[key]
        _db.upsert_game(db, g)
    print(f"[scraper] {len(games)} games synced, {len(venue_id_map)} venues")

    # Step 3 — rankings (Women's L-UPL)
    upl_w = cfg["leagues"]["upl_women"]
    rank_data = get("/api/rankings", {
        "season": season,
        "league": upl_w["league"],
        "game_class": upl_w["game_class"],
    })
    # name → team_id map built from all rankings synced this run
    name_to_team_id: dict[str, int] = {}

    if rank_data:
        ranking_rows, team_rows = _parse_rankings(rank_data, season, upl_w["league"], upl_w["game_class"])
        for t in team_rows:
            _db.upsert_team(db, t)
            name_to_team_id[t["name"]] = t["team_id"]
        for r in ranking_rows:
            _db.upsert_ranking(db, r)
        print(f"[scraper] Damen L-UPL rankings: {len(ranking_rows)} teams")

    # Backfill home_team_id / away_team_id on games using known team names, then re-upsert
    for g in games:
        g["home_team_id"] = name_to_team_id.get(g["home_team"])
        g["away_team_id"] = name_to_team_id.get(g["away_team"])
        _db.upsert_game(db, g)

    # Step 3b — for games still missing team IDs (junior games), fetch game detail
    resolved = 0
    for g in games:
        if g["home_team_id"] is not None and g["away_team_id"] is not None:
            continue
        detail = get(f"/api/games/{g['game_id']}")
        if not detail:
            continue
        home_id, home_name, away_id, away_name = _parse_game_detail(detail)
        if home_id and home_name:
            _db.upsert_team(db, {"team_id": home_id, "name": home_name,
                                  "league_id": g["league_id"], "game_class": g["game_class"]})
            g["home_team_id"] = home_id
        if away_id and away_name:
            _db.upsert_team(db, {"team_id": away_id, "name": away_name,
                                  "league_id": g["league_id"], "game_class": g["game_class"]})
            g["away_team_id"] = away_id
        _db.upsert_game(db, g)
        resolved += 1
    if resolved:
        print(f"[scraper] {resolved} junior game(s) team IDs resolved via game detail")

    # Step 4 — top scorers (Men's L-UPL; Jets is Women's — women's player IDs TBD)
    ts_data = get("/api/topscorers/su", {"season": season, "amount": 200})
    jets_scorers = _parse_topscorers(ts_data) if ts_data else []
    print(f"[scraper] {len(jets_scorers)} Jets player(s) in Men's L-UPL topscorers")

    # Step 4a — roster data from team player lists
    roster_rows = 0
    roster_teams = 0
    for team_cfg in cfg["teams"]:
        if not _is_senior_team(team_cfg):
            continue
        roster_data = get(f"/api/teams/{team_cfg['team_id']}/players")
        if not roster_data:
            continue

        roster = _parse_team_roster(roster_data, team_cfg)
        if not roster:
            continue

        roster_teams += 1
        for player in roster:
            _db.upsert_player(db, {
                "player_id": player["player_id"],
                "club_id": club_id,
                "name": player["name"],
                "position": player["position"],
                "birth_year": player["birth_year"],
                "height_cm": None,
                "is_junior": player["is_junior"],
            })
            _db.upsert_player_season(db, {
                "player_id": player["player_id"],
                "season": season,
                "club_id": club_id,
                "league_name": team_cfg.get("league_name"),
                "games": 0,
                "goals": player["goals"],
                "assists": player["assists"],
                "points": player["points"],
                "pim": player["pim"],
            })
            roster_rows += 1
    print(f"[scraper] roster entries: {roster_rows} players from {roster_teams} team(s)")

    # Step 5 — player profiles + game-by-game stats
    for scorer in jets_scorers:
        pid = scorer["player_id"]

        profile_data = get(f"/api/players/{pid}")
        if profile_data:
            profile = _parse_player_profile(profile_data, pid)
            if profile:
                profile["name"] = scorer["name"]
                profile["club_id"] = club_id
                _db.upsert_player(db, profile)

        # player_seasons — aggregate from topscorer row
        _db.upsert_player_season(db, {
            "player_id": pid,
            "season": season,
            "club_id": club_id,
            "league_name": "Herren L-UPL",
            "games": scorer["games"],
            "goals": scorer["goals"],
            "assists": scorer["assists"],
            "points": scorer["points"],
            "pim": 0,  # not in topscorer response
        })

        overview_data = get(f"/api/players/{pid}/overview")
        if overview_data:
            for row in _parse_player_overview(overview_data, pid):
                _db.upsert_player_game(db, row)
            # Backfill venue coordinates discovered from this player's game list
            for (name, city), (lat, lng) in _parse_player_venues(overview_data).items():
                existing = next(db["venues"].rows_where("name=? AND city=?", [name, city]), None)
                if existing and existing["lat"] is None:
                    dist = round(_geo.haversine_km(lat, lng), 2)
                    db["venues"].update(existing["venue_id"], {"lat": lat, "lng": lng, "distance_km": dist})

    # Step 6 — attempt game_events (stub; 404 expected without partner access)
    hits = 0
    for g in games:
        events_data = get("/api/game_events", {"game_id": g["game_id"]})
        available = events_data is not None
        _db.mark_game_events(db, g["game_id"], available,
                             raw_json=json.dumps(events_data) if available else None)
        if available:
            hits += 1
    print(f"[scraper] game_events: {hits}/{len(games)} available")

    print("[scraper] done")


# ---------- team-mode parser -------------------------------------------------

def _parse_team_mode_games(data, season, team_cfg):
    """Parse mode=team response (5-cell: date/time, venue, home, away, score)."""
    results = []
    for row in _rows(data):
        cells = row.get("cells", [])
        link = row.get("link") or {}
        game_id = (link.get("ids") or [None])[0]
        if not game_id or len(cells) < 5:
            continue

        score_text = _text(cells[4])
        if ":" not in score_text:
            continue
        try:
            sh, sa = score_text.split(":")
            score_home, score_away = int(sh.strip()), int(sa.strip())
        except ValueError:
            continue

        home_team = _text(cells[2])
        away_team = _text(cells[3])
        venue_cell = cells[1]
        venue_link = venue_cell.get("link") or {}

        results.append({
            "game_id": game_id,
            "season": season,
            "date": _text(cells[0], 0),
            "home_team": home_team,
            "home_team_id": None,
            "away_team": away_team,
            "away_team_id": None,
            "score_home": score_home,
            "score_away": score_away,
            "league_id": team_cfg["league_id"],
            "game_class": team_cfg["game_class"],
            "league_name": team_cfg["league_name"],
            "_venue_name": _text(venue_cell, 0),
            "_venue_city": _text(venue_cell, 1),
            "_venue_lat": venue_link.get("y"),
            "_venue_lng": venue_link.get("x"),
            "is_home": int(_CLUB_NAME.lower() in home_team.lower()),
            "is_junior": team_cfg.get("is_junior", 1),
            "period_scores": None,
        })
    return results


# ---------- team run ---------------------------------------------------------

def run_team(team_name: str, season: int) -> None:
    cfg = _cfg()
    cache_dir = str(ROOT / cfg["cache_dir"])
    ttl = cfg["cache_ttl_hours"]
    db = _db.open_db(str(ROOT / cfg["db_path"]))

    team_cfg = next((t for t in cfg["teams"] if t["name"].lower() == team_name.lower()), None)
    if not team_cfg:
        available = [t["name"] for t in cfg["teams"]]
        print(f"[scraper] team '{team_name}' not found in config.json")
        print(f"[scraper] available teams: {available}")
        return

    def get(endpoint, params=None):
        return _cache.fetch(endpoint, params or {}, cache_dir, ttl)

    print(f"[scraper] {team_name}  season {season}")

    # Seed club, season, league
    _db.upsert_club(db, {
        "club_id": cfg["club_id"],
        "name": "Kloten-Dietlikon Jets",
        "city": "Kloten",
        "home_venue": "Stiftung Sporthalle Stighag",
    })
    _db.upsert_season(db, season, f"{season}/{season + 1}")
    _db.upsert_league(db, {
        "league_id": team_cfg["league_id"],
        "game_class": team_cfg["game_class"],
        "name": team_cfg["league_name"],
        "is_junior": team_cfg.get("is_junior", 1),
    })

    # Step 1 — games via mode=team
    games_data = get("/api/games", {"mode": "team", "team_id": team_cfg["team_id"], "season": season})
    games = _parse_team_mode_games(games_data, season, team_cfg) if games_data else []
    print(f"[scraper] {len(games)} games")
    if not games:
        print("[scraper] no games — team may not be registered yet for this season")
        return

    # Step 2 — venues (mode=team includes lat/lng in the venue cell)
    venue_id_map: dict[tuple, int] = {}
    for g in games:
        key = (g["_venue_name"], g["_venue_city"])
        if key not in venue_id_map:
            lat, lng = g["_venue_lat"], g["_venue_lng"]
            dist = round(_geo.haversine_km(lat, lng), 2) if lat and lng else None
            venue_id_map[key] = _db.get_or_create_venue(db, key[0], key[1], lat, lng, dist)

    for g in games:
        key = (g.pop("_venue_name"), g.pop("_venue_city"))
        g.pop("_venue_lat", None)
        g.pop("_venue_lng", None)
        g["venue_id"] = venue_id_map[key]
        _db.upsert_game(db, g)
    print(f"[scraper] {len(venue_id_map)} venues")

    # Step 3 — game detail (resolves home/away team IDs)
    for g in games:
        detail = get(f"/api/games/{g['game_id']}")
        if not detail:
            continue
        home_id, home_name, away_id, away_name = _parse_game_detail(detail)
        if home_id:
            _db.upsert_team(db, {"team_id": home_id, "name": home_name,
                                  "league_id": team_cfg["league_id"], "game_class": team_cfg["game_class"]})
            g["home_team_id"] = home_id
        if away_id:
            _db.upsert_team(db, {"team_id": away_id, "name": away_name,
                                  "league_id": team_cfg["league_id"], "game_class": team_cfg["game_class"]})
            g["away_team_id"] = away_id
        _db.upsert_game(db, g)
    print(f"[scraper] team IDs resolved")

    # Step 4 — game events
    hits = 0
    for g in games:
        events_data = get(f"/api/game_events/{g['game_id']}")
        available = events_data is not None
        _db.mark_game_events(db, g["game_id"], available,
                             raw_json=json.dumps(events_data) if available else None)
        if available:
            hits += 1
    print(f"[scraper] game_events: {hits}/{len(games)} available")

    # Step 5 — rankings (skipped for junior leagues: mid-season group split + API group filter broken)
    if not team_cfg.get("is_junior"):
        rank_data = get("/api/rankings", {
            "season": season,
            "league": team_cfg["league_id"],
            "game_class": team_cfg["game_class"],
        })
        if rank_data:
            ranking_rows, team_rows = _parse_rankings(rank_data, season,
                                                       team_cfg["league_id"], team_cfg["game_class"])
            for t in team_rows:
                _db.upsert_team(db, t)
            for r in ranking_rows:
                _db.upsert_ranking(db, r)
            print(f"[scraper] rankings: {len(ranking_rows)} teams")
    else:
        print("[scraper] rankings skipped (junior league)")

    print("[scraper] done")


# ---------- entry point ------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Scrape Swiss Unihockey data into the archive DB")
    parser.add_argument("--team", metavar="NAME",
                        help="Team name as in config.json (e.g. 'Jets U14B')")
    parser.add_argument("--season", type=int, metavar="YEAR",
                        help="Season year (e.g. 2025)")
    args = parser.parse_args()

    if args.team and args.season:
        run_team(args.team, args.season)
    elif args.team or args.season:
        parser.error("--team and --season must be used together")
    else:
        run()
